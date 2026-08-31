#!/usr/bin/env node
/**
 * migrate.mjs — exécuteur des migrations de schéma de Cyber GRC Groupe.
 *
 * Référencé par `deploy/install.sh` (« cd /opt/cyber-grc/backend && node db/migrate.mjs »)
 * et par le banc d'essai (`test/aide/base.mjs`). Conventions applicables :
 * `backend/db/CONVENTIONS.md` §13 (migrations) et §14 (rôles).
 *
 * ── Ce que ce programme garantit ─────────────────────────────────────────────
 *
 *  1. **Ordre déterministe.** Les fichiers sont triés sur leur préfixe numérique à
 *     trois chiffres, jamais sur l'ordre de `readdir` (qui dépend du système de
 *     fichiers). Un nom hors convention `NNN_<sujet>.sql` fait échouer le programme
 *     plutôt que d'être ignoré en silence : un fichier ignoré, c'est une table qui
 *     manque en production.
 *
 *  2. **Compte propriétaire, jamais le compte applicatif.** La connexion se fait avec
 *     `BASE_UTILISATEUR_PROPRIETAIRE`. Cette séparation n'est pas cosmétique : c'est la
 *     couche 4 de la garantie d'ajout seul du journal d'audit (CONVENTIONS §12) — seul
 *     le propriétaire peut désactiver un déclencheur, et le service applicatif ne doit
 *     jamais l'être. Se connecter ici avec `grc_app` reviendrait à annuler cette couche.
 *
 *  3. **Transaction portée par le fichier.** Chaque migration contient son propre
 *     `begin` / `commit` (CONVENTIONS §13) : elle s'applique entièrement ou pas du tout.
 *     Ce programme ne la ré-enveloppe donc PAS dans une transaction supplémentaire — ce
 *     serait une transaction imbriquée, dont le `commit` interne serait sans effet et
 *     dont l'échec laisserait un état intermédiaire trompeur.
 *
 *  4. **Idempotence.** `migrations_schema` dit ce qui est déjà appliqué ; ces fichiers
 *     sont sautés. Rejouer le programme sur une base à jour ne fait rien.
 *
 *  5. **Une migration appliquée ne se réécrit pas.** L'empreinte SHA-256 du fichier est
 *     mémorisée à l'application ; si le fichier a changé depuis, le programme s'arrête.
 *     Sans cela, une correction discrète d'un `001` déjà passé en production produirait
 *     deux bases divergentes prétendant porter le même schéma.
 *
 *  6. **Aucun secret en sortie.** Ni mot de passe, ni chaîne de connexion complète.
 *
 * ── Utilisation ──────────────────────────────────────────────────────────────
 *
 *     node db/migrate.mjs                  applique ce qui manque
 *     node db/migrate.mjs --verifier       n'applique rien, dit ce qui serait appliqué
 *     node db/migrate.mjs --jusqu-a 002    s'arrête après la migration 002 (recette)
 *     node db/migrate.mjs --aide
 *
 * En développement, la configuration n'est pas dans l'environnement du service :
 *
 *     node --env-file=.env db/migrate.mjs
 *     BASE_NOM=grc_essai BASE_MOT_DE_PASSE_PROPRIETAIRE=dev node db/migrate.mjs
 *
 * ── Codes de sortie ──────────────────────────────────────────────────────────
 *
 *     0   schéma à jour (rien à faire, ou tout appliqué avec succès)
 *     1   erreur d'utilisation (option inconnue, valeur de --jusqu-a invalide)
 *     2   configuration incomplète (compte propriétaire absent)
 *     3   connexion à PostgreSQL impossible
 *     4   divergence d'empreinte : une migration appliquée a été modifiée depuis
 *     5   répertoire de migrations invalide (nom hors convention, numéro en double)
 *     6   échec d'application d'une migration
 *    10   --verifier : des migrations restent à appliquer (informatif, pas une panne)
 *
 * Aucune dépendance ajoutée : `pg` est déjà au `package.json`, la bibliothèque
 * standard fait le reste.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pg from 'pg';

/* =====================================================================
 *  Codes de sortie — nommés, pour que l'appelant puisse les distinguer
 * ===================================================================== */

export const CODES = Object.freeze({
  SUCCES: 0,
  USAGE: 1,
  CONFIGURATION: 2,
  CONNEXION: 3,
  DIVERGENCE: 4,
  REPERTOIRE: 5,
  MIGRATION: 6,
  EN_RETARD: 10,
});

/** Répertoire des migrations, résolu depuis l'emplacement de ce fichier et non depuis
 *  le répertoire courant : `install.sh` et le banc d'essai n'appellent pas d'un même
 *  endroit, et le résultat ne doit pas en dépendre. */
const REPERTOIRE_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** `NNN_<sujet>.sql` — trois chiffres, puis un sujet en snake_case sans accent
 *  (CONVENTIONS §1 « casse » et §13 « migrations »). */
const NOM_MIGRATION = /^(\d{3})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

/* =====================================================================
 *  Journalisation — sobre, alignée, sans couleur inutile
 * ===================================================================== */

const journal = {
  titre: (texte) => process.stdout.write(`\n${texte}\n`),
  ligne: (texte) => process.stdout.write(`${texte}\n`),
  alerte: (texte) => process.stderr.write(`  !! ${texte}\n`),
  echec: (texte) => process.stderr.write(`\n ERR ${texte}\n`),
};

/* =====================================================================
 *  Analyse de la ligne de commande
 * ===================================================================== */

/**
 * @param {string[]} arguments_ arguments bruts (sans `node` ni le nom du script)
 * @returns {{verifier: boolean, jusquA: string|null, aide: boolean}}
 * @throws {ErreurUsage}
 */
export function analyserArguments(arguments_) {
  const options = { verifier: false, jusquA: null, aide: false };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === '--aide' || argument === '-h' || argument === '--help') {
      options.aide = true;
      continue;
    }
    if (argument === '--verifier') {
      options.verifier = true;
      continue;
    }
    // Deux écritures acceptées : « --jusqu-a 002 » et « --jusqu-a=002 ».
    if (argument === '--jusqu-a' || argument.startsWith('--jusqu-a=')) {
      const valeur = argument.startsWith('--jusqu-a=')
        ? argument.slice('--jusqu-a='.length)
        : arguments_[++index];
      if (valeur === undefined) {
        throw new ErreurUsage('--jusqu-a attend un numéro de migration (ex. --jusqu-a 002).');
      }
      if (!/^\d{1,3}$/.test(valeur)) {
        throw new ErreurUsage(
          `--jusqu-a : « ${valeur} » n'est pas un numéro de migration (attendu : 1 à 3 chiffres, ex. 002).`,
        );
      }
      // Normalisation : « 2 » et « 002 » désignent la même migration.
      options.jusquA = valeur.padStart(3, '0');
      continue;
    }
    throw new ErreurUsage(`Option inconnue : ${argument}. Voir « node db/migrate.mjs --aide ».`);
  }

  return options;
}

class ErreurUsage extends Error {}

const AIDE = `
Exécuteur des migrations de schéma — Cyber GRC Groupe.

  node db/migrate.mjs                  applique les migrations manquantes
  node db/migrate.mjs --verifier       n'applique rien : liste ce qui serait appliqué
                                       et signale toute migration modifiée après coup
  node db/migrate.mjs --jusqu-a NNN    s'arrête après la migration NNN (recette)
  node db/migrate.mjs --aide           ce message

Configuration lue dans l'environnement (mêmes noms que le serveur, voir .env.example) :
  BASE_HOTE, BASE_PORT, BASE_NOM,
  BASE_UTILISATEUR_PROPRIETAIRE, BASE_MOT_DE_PASSE_PROPRIETAIRE,
  BASE_SSL, BASE_SSL_CA

Le compte propriétaire est obligatoire : les migrations ne s'appliquent jamais avec le
compte applicatif (backend/db/CONVENTIONS.md §12 et §14).

Codes de sortie : 0 à jour · 1 usage · 2 configuration · 3 connexion ·
                  4 empreinte divergente · 5 répertoire invalide · 6 migration en échec ·
                  10 (--verifier) migrations en attente
`;

/* =====================================================================
 *  Configuration
 * ===================================================================== */

/**
 * Lit la configuration de connexion dans l'environnement.
 *
 * Les noms de variables sont **exactement** ceux de `src/config/index.ts` : il n'y a
 * qu'un seul vocabulaire de configuration dans ce projet. Ce module ne réutilise pas
 * `config/index.ts` directement parce qu'il est écrit en TypeScript et que
 * `install.sh` appelle les migrations avant toute compilation — mais il n'invente
 * aucun nom.
 *
 * @returns {{hote: string, port: number, base: string, utilisateur: string,
 *            motDePasse: string, ssl: false|{rejectUnauthorized: boolean, ca?: string}}}
 */
export function lireConfiguration(source = process.env) {
  const problemes = [];

  const texte = (nom, defaut) => {
    const valeur = (source[nom] ?? '').trim();
    return valeur === '' ? defaut : valeur;
  };

  const hote = texte('BASE_HOTE', '127.0.0.1');

  const portBrut = texte('BASE_PORT', '5432');
  const port = Number.parseInt(portBrut, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problemes.push(`BASE_PORT : « ${portBrut} » n'est pas un port valide.`);
  }

  const base = texte('BASE_NOM', 'cyber_grc');
  // Même motif que src/config/index.ts : un nom de base est un identifiant SQL, et il
  // finit interpolé dans un « create database » côté outillage de développement.
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(base)) {
    problemes.push(`BASE_NOM : « ${base} » n'est pas un nom de base PostgreSQL valide.`);
  }

  const utilisateur = texte('BASE_UTILISATEUR_PROPRIETAIRE', '');
  if (utilisateur === '') {
    problemes.push(
      'BASE_UTILISATEUR_PROPRIETAIRE : non renseigné. Les migrations s\'appliquent avec le ' +
        'compte propriétaire (grc_proprietaire), jamais avec le compte applicatif — c\'est la ' +
        'couche 4 de la garantie d\'ajout seul du journal (CONVENTIONS.md §12).',
    );
  }
  // Garde-fou explicite : une erreur de copier-coller dans /etc/cyber-grc/env — le
  // seul fichier de configuration que connaisse le code — ne doit pas faire tourner
  // les migrations sous le compte du service.
  const applicatif = texte('BASE_UTILISATEUR', '');
  if (utilisateur !== '' && applicatif !== '' && utilisateur === applicatif) {
    problemes.push(
      `BASE_UTILISATEUR_PROPRIETAIRE et BASE_UTILISATEUR désignent le même rôle (${utilisateur}). ` +
        'La séparation propriétaire / application est une exigence de sécurité, pas une commodité.',
    );
  }

  const motDePasse = source['BASE_MOT_DE_PASSE_PROPRIETAIRE'] ?? '';

  const modeSsl = texte('BASE_SSL', 'desactive');
  let ssl = false;
  if (modeSsl === 'requis') {
    ssl = { rejectUnauthorized: false };
  } else if (modeSsl === 'verifie-ca') {
    const chemin = texte('BASE_SSL_CA', '');
    if (chemin === '') {
      problemes.push('BASE_SSL=verifie-ca exige BASE_SSL_CA (autorité de certification, format PEM).');
    } else {
      try {
        ssl = { rejectUnauthorized: true, ca: readFileSync(chemin, 'utf8') };
      } catch {
        problemes.push(`BASE_SSL_CA : fichier illisible (${chemin}).`);
      }
    }
  } else if (modeSsl !== 'desactive') {
    problemes.push(`BASE_SSL : « ${modeSsl} » inconnu (attendu : desactive | requis | verifie-ca).`);
  }

  if (problemes.length > 0) {
    const erreur = new Error(problemes.join('\n      '));
    erreur.problemes = problemes;
    erreur.codeSortie = CODES.CONFIGURATION;
    throw erreur;
  }

  return { hote, port, base, utilisateur, motDePasse, ssl };
}

/* =====================================================================
 *  Inventaire des fichiers de migration
 * ===================================================================== */

/**
 * Liste les migrations du répertoire, dans l'ordre d'application.
 *
 * Aucune liste de fichiers n'est codée en dur : les migrations 002, 003… écrites par
 * d'autres sont prises en compte dès qu'elles apparaissent.
 *
 * @param {string} repertoire
 * @returns {{version: string, nom: string, chemin: string, contenu: string, empreinte: string}[]}
 */
export function listerMigrations(repertoire = REPERTOIRE_MIGRATIONS) {
  let entrees;
  try {
    entrees = readdirSync(repertoire, { withFileTypes: true });
  } catch (erreur) {
    const echec = new Error(`Répertoire de migrations illisible (${repertoire}) : ${erreur.message}`);
    echec.codeSortie = CODES.REPERTOIRE;
    throw echec;
  }

  const fautifs = [];
  const migrations = [];

  for (const entree of entrees) {
    // Les fichiers non SQL (notes, brouillons) sont ignorés sans bruit ; un fichier
    // SQL mal nommé, en revanche, est une erreur : on ne devine pas son rang.
    if (!entree.isFile() || !entree.name.endsWith('.sql')) continue;

    const correspondance = NOM_MIGRATION.exec(entree.name);
    if (correspondance === null) {
      fautifs.push(entree.name);
      continue;
    }

    const chemin = join(repertoire, entree.name);
    const contenu = readFileSync(chemin, 'utf8');
    migrations.push({
      version: correspondance[1],
      sujet: correspondance[2],
      nom: entree.name,
      chemin,
      contenu,
      empreinte: empreinteContenu(contenu),
    });
  }

  if (fautifs.length > 0) {
    const echec = new Error(
      `Nom de migration hors convention : ${fautifs.sort().join(', ')}.\n` +
        '      Attendu : NNN_<sujet>.sql (trois chiffres, sujet en snake_case sans accent), ' +
        'voir CONVENTIONS.md §13.',
    );
    echec.codeSortie = CODES.REPERTOIRE;
    throw echec;
  }

  migrations.sort((a, b) => a.version.localeCompare(b.version));

  // Deux fichiers portant le même numéro : l'ordre d'application devient indéterminé,
  // et `migrations_schema` (clé primaire sur `version`) n'en enregistrerait qu'un.
  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index].version === migrations[index - 1].version) {
      const echec = new Error(
        `Numéro de migration en double : ${migrations[index - 1].nom} et ${migrations[index].nom}. ` +
          'Un numéro ne se réutilise jamais (CONVENTIONS.md §13).',
      );
      echec.codeSortie = CODES.REPERTOIRE;
      throw echec;
    }
  }

  return migrations;
}

/** Empreinte SHA-256 du contenu d'un fichier de migration, en hexadécimal minuscule —
 *  format du domaine `empreinte_sha256` (CONVENTIONS §5). */
export function empreinteContenu(contenu) {
  return createHash('sha256').update(contenu, 'utf8').digest('hex');
}

/**
 * Contrôle de forme d'un fichier de migration : il doit porter sa propre transaction
 * (CONVENTIONS §13). Renvoie la liste des remarques, vide si tout va bien.
 * Ce n'est pas bloquant — c'est un rappel à l'auteur de la migration, pas un juge.
 */
function remarquesDeForme(migration) {
  const remarques = [];
  if (!/^\s*begin\s*;/im.test(migration.contenu)) {
    remarques.push(`${migration.nom} : aucun « begin; » en début de fichier (CONVENTIONS.md §13).`);
  }
  if (!/^\s*commit\s*;/im.test(migration.contenu)) {
    remarques.push(`${migration.nom} : aucun « commit; » (CONVENTIONS.md §13).`);
  }
  return remarques;
}

/* =====================================================================
 *  Registre des migrations appliquées
 * ===================================================================== */

/**
 * Lit `migrations_schema`.
 *
 * Le premier passage se fait sur une base vide, où la table n'existe pas encore :
 * c'est `001_socle.sql` qui la crée (`create table if not exists`). L'absence de table
 * signifie donc « aucune migration appliquée », pas une panne — et `avecEmpreinte`
 * vaut alors `true`, puisque c'est précisément `001` qui apporte la colonne.
 *
 * @returns {Promise<{entrees: Map<string, {nom: string, appliqueLe: Date, empreinte: string|null}>,
 *                    avecEmpreinte: boolean}>}
 */
async function lireRegistre(client) {
  const presence = await client.query(
    "select to_regclass('public.migrations_schema') is not null as existe",
  );
  if (!presence.rows[0].existe) return { entrees: new Map(), avecEmpreinte: true };

  // `empreinte` a été ajoutée par 001 dès l'origine ; on interroge malgré tout le
  // catalogue plutôt que de le supposer, afin de rester exploitable sur une base
  // migrée par une version antérieure du registre.
  const colonne = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'migrations_schema'
        and column_name = 'empreinte'`,
  );
  const avecEmpreinte = colonne.rowCount > 0;

  const lignes = await client.query(
    avecEmpreinte
      ? 'select version, nom, applique_le, empreinte from migrations_schema'
      : 'select version, nom, applique_le, null::text as empreinte from migrations_schema',
  );

  const entrees = new Map();
  for (const ligne of lignes.rows) {
    entrees.set(ligne.version, {
      nom: ligne.nom,
      appliqueLe: ligne.applique_le,
      empreinte: ligne.empreinte,
    });
  }
  return { entrees, avecEmpreinte };
}

/* =====================================================================
 *  Application
 * ===================================================================== */

/**
 * Applique une migration.
 *
 * Le contenu est envoyé **tel quel**, en une seule requête : le fichier porte son
 * `begin` / `commit`, et l'y ré-enrober produirait une transaction imbriquée dont le
 * `commit` interne serait un avertissement sans effet.
 */
async function appliquerUne(client, migration, registreAvecEmpreinte) {
  const debut = process.hrtime.bigint();
  await client.query(migration.contenu);
  const dureeMs = Number((process.hrtime.bigint() - debut) / 1_000_000n);

  // §13 : « chaque fichier s'enregistre lui-même en dernier dans migrations_schema ».
  // S'il ne l'a pas fait, la base est à jour mais le registre ment : au passage
  // suivant, la migration serait rejouée et échouerait sur un objet déjà créé.
  const enregistree = await client.query('select 1 from migrations_schema where version = $1', [
    migration.version,
  ]);
  if (enregistree.rowCount === 0) {
    const echec = new Error(
      'le fichier s\'est appliqué mais ne s\'est pas enregistré dans migrations_schema. ' +
        'Ajoutez le « insert into migrations_schema … on conflict do nothing » final ' +
        '(CONVENTIONS.md §13).',
    );
    echec.codeSortie = CODES.MIGRATION;
    // Marqueur : ici, contrairement à une erreur SQL, la migration A ÉTÉ VALIDÉE par
    // son propre « commit ». Dire l'inverse enverrait l'exploitant chercher au mauvais
    // endroit — et lui ferait rejouer un fichier déjà appliqué.
    echec.migrationValidee = true;
    throw echec;
  }

  if (registreAvecEmpreinte) {
    await client.query('update migrations_schema set empreinte = $2 where version = $1', [
      migration.version,
      migration.empreinte,
    ]);
  }

  return dureeMs;
}

/* =====================================================================
 *  Programme principal
 * ===================================================================== */

export async function executer(arguments_ = process.argv.slice(2), environnement = process.env) {
  let options;
  try {
    options = analyserArguments(arguments_);
  } catch (erreur) {
    journal.echec(erreur.message);
    return CODES.USAGE;
  }

  if (options.aide) {
    process.stdout.write(AIDE);
    return CODES.SUCCES;
  }

  /* ── Inventaire des fichiers, avant toute connexion ─────────────── */
  let migrations;
  try {
    migrations = listerMigrations();
  } catch (erreur) {
    journal.echec(erreur.message);
    return erreur.codeSortie ?? CODES.REPERTOIRE;
  }

  if (migrations.length === 0) {
    journal.echec(`Aucune migration trouvée dans ${REPERTOIRE_MIGRATIONS}.`);
    return CODES.REPERTOIRE;
  }

  /* ── Configuration ─────────────────────────────────────────────── */
  let configuration;
  try {
    configuration = lireConfiguration(environnement);
  } catch (erreur) {
    journal.echec(`Configuration incomplète :\n      ${erreur.message}`);
    return erreur.codeSortie ?? CODES.CONFIGURATION;
  }

  // Aucune chaîne de connexion complète n'est affichée : ni mot de passe, ni URL.
  journal.titre(
    `Migrations Cyber GRC — base « ${configuration.base} » sur ${configuration.hote}:${configuration.port}` +
      `, compte propriétaire « ${configuration.utilisateur} »` +
      (options.verifier ? ' [vérification seule, aucune écriture]' : ''),
  );

  const client = new pg.Client({
    host: configuration.hote,
    port: configuration.port,
    database: configuration.base,
    user: configuration.utilisateur,
    password: configuration.motDePasse,
    ssl: configuration.ssl,
    application_name: 'cyber-grc-migrations',
    // Une migration ne se fait pas interrompre au milieu : les délais de garde du
    // service applicatif (BASE_DELAI_REQUETE) n'ont pas cours ici. Un `create index`
    // sur une base chargée peut légitimement durer.
    options: '-c statement_timeout=0 -c idle_in_transaction_session_timeout=0 -c search_path=public',
  });

  try {
    await client.connect();
  } catch (erreur) {
    // `erreur.message` de pg ne contient pas le mot de passe ; on n'y ajoute rien.
    journal.echec(`Connexion à PostgreSQL impossible : ${erreur.message}`);
    return CODES.CONNEXION;
  }

  try {
    return await deroulement(client, migrations, options);
  } finally {
    await client.end().catch(() => {
      /* La connexion est peut-être déjà tombée : rien à sauver ici. */
    });
  }
}

async function deroulement(client, migrations, options) {
  const { entrees: registre, avecEmpreinte } = await lireRegistre(client);
  const largeur = Math.max(...migrations.map((m) => m.nom.length));
  const remplir = (nom) => `${nom} ${'.'.repeat(Math.max(2, largeur - nom.length + 3))}`;

  /* ── 1. Contrôles préalables, sur l'inventaire complet ──────────── */

  // Trou dans la numérotation : signalé, non bloquant. Pendant l'écriture parallèle
  // des migrations, un 004 peut apparaître avant un 003 ; en revanche, en déploiement,
  // un trou signale un fichier manquant dans la copie — il faut le voir.
  const attendus = migrations.map((m) => Number.parseInt(m.version, 10));
  for (let index = 1; index < attendus.length; index += 1) {
    if (attendus[index] !== attendus[index - 1] + 1) {
      journal.alerte(
        `Trou dans la numérotation entre ${migrations[index - 1].nom} et ${migrations[index].nom} : ` +
          'vérifiez qu\'aucun fichier ne manque dans cette copie.',
      );
    }
  }

  for (const migration of migrations) {
    for (const remarque of remarquesDeForme(migration)) journal.alerte(remarque);
  }

  // Migration connue de la base mais absente du disque : la base est en avance sur le
  // code déployé (retour arrière applicatif, ou fichier supprimé). On le dit.
  const versionsDisque = new Set(migrations.map((m) => m.version));
  for (const version of registre.keys()) {
    if (!versionsDisque.has(version)) {
      journal.alerte(
        `La base connaît la migration ${version} dont le fichier est absent de cette copie : ` +
          'la base est en avance sur le code déployé.',
      );
    }
  }

  /* ── 2. Empreintes : une migration appliquée ne se réécrit pas ─── */

  const divergences = [];
  const adoptions = [];
  for (const migration of migrations) {
    const applique = registre.get(migration.version);
    if (applique === undefined) continue;
    if (applique.empreinte === null || applique.empreinte === undefined) {
      adoptions.push(migration);
    } else if (applique.empreinte !== migration.empreinte) {
      divergences.push(migration);
    }
  }

  if (divergences.length > 0) {
    for (const migration of divergences) {
      journal.ligne(`  ${remplir(migration.nom)} DIVERGENCE`);
    }
    journal.echec(
      'Une migration déjà appliquée a été modifiée depuis :\n' +
        divergences.map((m) => `        ${m.nom}`).join('\n') +
        '\n      Une migration appliquée ne se réécrit jamais (CONVENTIONS.md §13). ' +
        'Écrivez une nouvelle migration qui corrige, ou restaurez le fichier d\'origine.',
    );
    return CODES.DIVERGENCE;
  }

  /* ── 3. Que reste-t-il à appliquer ? ────────────────────────────── */

  const manquantes = migrations.filter((m) => !registre.has(m.version));
  let aAppliquer = manquantes;
  if (options.jusquA !== null) {
    aAppliquer = manquantes.filter((m) => m.version <= options.jusquA);
    if (aAppliquer.length < manquantes.length) {
      journal.ligne(`  (arrêt demandé après la migration ${options.jusquA})`);
    }
  }
  const enAttente = new Set(aAppliquer.map((m) => m.version));
  const restantes = manquantes.length - aAppliquer.length;

  /* ── 4. Mode vérification : on dit, on n'écrit pas ──────────────── */

  if (options.verifier) {
    for (const migration of migrations) {
      const etat = registre.has(migration.version)
        ? adoptions.includes(migration)
          ? 'appliquée — empreinte absente (appliquée hors migrate.mjs, intégrité non vérifiable)'
          : 'appliquée — empreinte vérifiée'
        : enAttente.has(migration.version)
          ? 'À APPLIQUER'
          : 'en attente, hors du périmètre demandé';
      journal.ligne(`  ${remplir(migration.nom)} ${etat}`);
    }
    if (aAppliquer.length === 0) {
      journal.titre(`Schéma à jour : ${migrations.length} migration(s), rien à appliquer.`);
      return CODES.SUCCES;
    }
    journal.titre(
      `${aAppliquer.length} migration(s) à appliquer : ${aAppliquer.map((m) => m.nom).join(', ')}.`,
    );
    return CODES.EN_RETARD;
  }

  /* ── 5. Application ────────────────────────────────────────────── */

  // Les empreintes manquantes sont adoptées, faute de mieux, mais bruyamment : une
  // base migrée à la main (psql) ne permet plus de prouver que le fichier n'a pas
  // bougé entre son application et maintenant.
  for (const migration of adoptions) {
    if (avecEmpreinte) {
      await client.query('update migrations_schema set empreinte = $2 where version = $1', [
        migration.version,
        migration.empreinte,
      ]);
    }
    journal.alerte(
      `${migration.nom} : empreinte absente en base (migration appliquée hors migrate.mjs). ` +
        'Empreinte du fichier actuel adoptée — l\'intégrité antérieure n\'est pas vérifiable.',
    );
  }

  let appliquees = 0;
  for (const migration of migrations) {
    if (registre.has(migration.version)) {
      journal.ligne(`  ${remplir(migration.nom)} déjà appliquée`);
      continue;
    }
    if (!enAttente.has(migration.version)) {
      journal.ligne(`  ${remplir(migration.nom)} ignorée (--jusqu-a ${options.jusquA})`);
      continue;
    }

    let dureeMs;
    try {
      dureeMs = await appliquerUne(client, migration, avecEmpreinte);
    } catch (erreur) {
      journal.ligne(`  ${remplir(migration.nom)} ÉCHEC`);
      // Le fichier porte sa propre transaction : elle a été annulée par PostgreSQL,
      // la base est restée dans l'état précédant la migration. On s'arrête ici — les
      // migrations suivantes supposent celle-ci appliquée.
      const suite = erreur.migrationValidee === true
        ? '\n      Le schéma A ÉTÉ modifié : le fichier porte son propre « commit ». Corrigez le ' +
          'fichier, enregistrez la migration à la main, ou repartez d\'une base neuve. ' +
          'Les migrations suivantes n\'ont pas été tentées.'
        : '\n      La transaction du fichier a été annulée : la base est restée dans son état ' +
          'antérieur. Les migrations suivantes n\'ont pas été tentées.';
      journal.echec(
        `${migration.nom} : ${erreur.message}` +
          (erreur.position ? `\n      position ${erreur.position}` : '') +
          (erreur.detail ? `\n      détail : ${erreur.detail}` : '') +
          (erreur.hint ? `\n      indication : ${erreur.hint}` : '') +
          (erreur.code ? `\n      SQLSTATE ${erreur.code}` : '') +
          suite,
      );
      return erreur.codeSortie ?? CODES.MIGRATION;
    }

    appliquees += 1;
    journal.ligne(`  ${remplir(migration.nom)} appliquée en ${dureeMs} ms`);
  }

  // Un arrêt volontaire (--jusqu-a) n'est pas un schéma « à jour » : le dire autrement
  // ferait croire l'exploitant complet alors qu'il ne l'est pas.
  if (restantes > 0) {
    journal.titre(
      `Arrêt à la migration ${options.jusquA} comme demandé : ${appliquees} appliquée(s), ` +
        `${restantes} restante(s).`,
    );
    return CODES.SUCCES;
  }

  journal.titre(
    appliquees === 0
      ? `Schéma à jour : ${migrations.length} migration(s), rien à appliquer.`
      : `Schéma à jour : ${appliquees} migration(s) appliquée(s) sur ${migrations.length}.`,
  );
  return CODES.SUCCES;
}

/* =====================================================================
 *  Point d'entrée
 * ===================================================================== */

// Le garde permet d'importer ce module (banc d'essai) sans rien exécuter.
const estPointEntree =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (estPointEntree) {
  let code = CODES.MIGRATION;
  try {
    code = await executer();
  } catch (erreur) {
    // Filet : une erreur non prévue ne doit pas sortir en trace d'appel brute, qui
    // pourrait contenir des fragments de configuration.
    journal.echec(erreur instanceof Error ? erreur.message : String(erreur));
  }
  process.exit(code);
}
