/**
 * base.mjs — aide partagée du banc d'essai : une base PostgreSQL neuve par fichier de
 * test, migrée, puis détruite.
 *
 * Écrite pour être utilisée par TOUS les agents du chantier, pas seulement par celui
 * qui l'a écrite : aucun test n'a de raison de recopier cette plomberie.
 *
 * ── Ce qu'elle fait ──────────────────────────────────────────────────────────
 *
 *  1. Crée une base **neuve**, nommée d'après le fichier de test (`socle.test.mjs`
 *     → `grc_essai_socle`), propriété de `grc_proprietaire`.
 *  2. Y applique les migrations en appelant `db/migrate.mjs` — le vrai exécuteur,
 *     pas une réimplémentation. Les tests éprouvent donc aussi l'outil de migration,
 *     et une migration 004 écrite demain est prise en compte sans rien changer ici.
 *  3. Fournit des connexions par rôle (`proprietaire`, `app`, `lecture`) et un
 *     enrobage transactionnel qui positionne le périmètre RLS comme le fait
 *     `src/db/pool.ts` en production — `set_config(…, true)`, jamais autre chose.
 *  4. Nettoie **systématiquement**, y compris après un échec : `fermer()` ferme les
 *     connexions puis supprime la base.
 *
 * ── Utilisation ──────────────────────────────────────────────────────────────
 *
 *     import { after, before, test } from 'node:test';
 *     import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
 *
 *     let base;
 *     before(async () => { base = await ouvrirBaseEssai(import.meta.url); });
 *     after(async  () => { await base?.fermer(); });
 *
 *     test('…', async () => {
 *       const client = await base.connexion('proprietaire');
 *       await base.avecPerimetre(client, perimetre('jdupont', 'FIL-1'), async (c) => {
 *         await c.query('insert into …');   // annulé en fin de bloc par défaut
 *       });
 *     });
 *
 * ── Configuration ────────────────────────────────────────────────────────────
 *
 * Les mêmes variables que le serveur (`src/config/index.ts`, `.env.example`), avec
 * des valeurs par défaut de développement pour que `npm test` marche sans réglage :
 *
 *     BASE_HOTE (127.0.0.1) · BASE_PORT (5432)
 *     BASE_UTILISATEUR_PROPRIETAIRE (grc_proprietaire) · BASE_MOT_DE_PASSE_PROPRIETAIRE (dev)
 *     BASE_UTILISATEUR (grc_app) · BASE_MOT_DE_PASSE (dev)
 *
 * Deux variables **propres au banc d'essai** s'y ajoutent, parce que la configuration
 * du serveur ne connaît pas le rôle de lecture (il ne sert qu'à la supervision) :
 *
 *     ESSAI_UTILISATEUR_LECTURE (grc_lecture) · ESSAI_MOT_DE_PASSE_LECTURE (dev)
 *
 * Prérequis : `bash db/dev/preparer_base_dev.sh` a été passé une fois sur la machine
 * (rôles créés, `createdb` accordé au propriétaire). Le message d'erreur le rappelle.
 */

import { execFile } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

const executerFichier = promisify(execFile);

const RACINE_BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATE = join(RACINE_BACKEND, 'db', 'migrate.mjs');

/** Rôles du §14 des conventions, et la variable d'environnement qui porte leur secret. */
const ROLES = Object.freeze({
  proprietaire: { defautNom: 'grc_proprietaire', varNom: 'BASE_UTILISATEUR_PROPRIETAIRE', varMdp: 'BASE_MOT_DE_PASSE_PROPRIETAIRE' },
  app: { defautNom: 'grc_app', varNom: 'BASE_UTILISATEUR', varMdp: 'BASE_MOT_DE_PASSE' },
  lecture: { defautNom: 'grc_lecture', varNom: 'ESSAI_UTILISATEUR_LECTURE', varMdp: 'ESSAI_MOT_DE_PASSE_LECTURE' },
});

function reglages(source = process.env) {
  const texte = (nom, defaut) => {
    const valeur = (source[nom] ?? '').trim();
    return valeur === '' ? defaut : valeur;
  };
  const identite = (role) => ({
    nom: texte(ROLES[role].varNom, ROLES[role].defautNom),
    motDePasse: texte(ROLES[role].varMdp, 'dev'),
  });

  return {
    hote: texte('BASE_HOTE', '127.0.0.1'),
    port: Number.parseInt(texte('BASE_PORT', '5432'), 10),
    proprietaire: identite('proprietaire'),
    app: identite('app'),
    lecture: identite('lecture'),
  };
}

/* =====================================================================
 *  Nom de la base d'essai
 * ===================================================================== */

/**
 * Dérive un nom de base du chemin du fichier de test.
 *
 * `…/test/base/socle.test.mjs` → `grc_essai_socle`. Deux fichiers de test différents
 * obtiennent donc deux bases différentes : ils peuvent tourner en parallèle sans se
 * marcher dessus, ce que fait `node --test` dès qu'il y a plusieurs fichiers.
 *
 * @param {string} urlFichierTest normalement `import.meta.url` du fichier de test
 */
export function nomBaseEssai(urlFichierTest) {
  const fichier = basename(fileURLToPath(urlFichierTest)).replace(/\.test\.mjs$/, '').replace(/\.mjs$/, '');
  const assaini = fichier.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  // 63 octets est la limite d'un identifiant PostgreSQL ; on tronque plutôt que de
  // laisser la base tronquer silencieusement et créer deux bases homonymes.
  return `grc_essai_${assaini || 'sans_nom'}`.slice(0, 63);
}

/* =====================================================================
 *  Périmètre de session
 * ===================================================================== */

/**
 * Construit un périmètre de session, au format attendu par `avecPerimetre`.
 *
 * Rappel du contrat (`CONVENTIONS.md` §11) : ce périmètre vient de la session
 * serveur. Aucun test ne doit donner l'exemple inverse.
 *
 * @param {string} utilisateur identifiant tracé dans `cree_par` / `modifie_par`
 * @param {string|null} filialeId filiale ACTIVE — la seule où l'on écrit
 * @param {string[]} [filiales] périmètre de LECTURE ; par défaut, la seule filiale active
 */
export function perimetre(utilisateur, filialeId = null, filiales = undefined) {
  return {
    utilisateur,
    filialeId,
    filiales: filiales ?? (filialeId === null ? [] : [filialeId]),
  };
}

/* =====================================================================
 *  Ouverture d'une base d'essai
 * ===================================================================== */

/**
 * Crée une base neuve, y applique les migrations, et rend de quoi la travailler.
 *
 * @param {string} urlFichierTest `import.meta.url` du fichier de test appelant
 * @param {{jusquA?: string}} [options] `jusquA` : n'appliquer les migrations que
 *        jusqu'à ce numéro (utile pour éprouver une migration isolément)
 */
export async function ouvrirBaseEssai(urlFichierTest, options = {}) {
  const conf = reglages();
  const nom = nomBaseEssai(urlFichierTest);

  await recreerBase(conf, nom);
  await appliquerMigrations(conf, nom, options.jusquA);

  /** Connexions ouvertes, à fermer quoi qu'il arrive. */
  const connexions = new Set();
  /** Une connexion partagée par rôle : la plupart des tests n'en demandent pas plus. */
  const partagees = new Map();

  const base = {
    /** Nom de la base d'essai — utile dans les messages d'assertion. */
    nom,

    /** Connexion partagée pour ce rôle (ouverte à la première demande). */
    async connexion(role = 'proprietaire') {
      if (!partagees.has(role)) partagees.set(role, await base.nouvelleConnexion(role));
      return partagees.get(role);
    },

    /**
     * Connexion neuve et indépendante. Nécessaire dès qu'un test a besoin de deux
     * transactions simultanées (verrouillage optimiste, concurrence) ou d'observer
     * l'état d'une session vierge.
     */
    async nouvelleConnexion(role = 'proprietaire') {
      const identite = conf[role];
      if (identite === undefined) {
        throw new Error(`Rôle inconnu : ${role} (attendu : proprietaire | app | lecture).`);
      }
      const client = new pg.Client({
        host: conf.hote,
        port: conf.port,
        database: nom,
        user: identite.nom,
        password: identite.motDePasse,
        application_name: `cyber-grc-essai-${role}`,
        // Un test qui part en boucle doit échouer, pas bloquer la suite entière.
        options: '-c statement_timeout=15000 -c lock_timeout=5000 -c search_path=public',
      });
      await client.connect();
      connexions.add(client);
      return client;
    },

    /**
     * Exécute `travail` dans une transaction dont le périmètre RLS est positionné,
     * exactement comme `avecTransaction` de `src/db/pool.ts`.
     *
     * Par défaut la transaction est **annulée** en sortie : chaque test repart d'une
     * base identique, et l'ordre des tests n'a pas d'importance. Passez
     * `{ annuler: false }` pour valider.
     *
     * @param {import('pg').Client} client
     * @param {{utilisateur: string, filialeId: string|null, filiales: string[]}} p
     * @param {(client: import('pg').Client) => Promise<any>} travail
     * @param {{annuler?: boolean}} [options]
     */
    async avecPerimetre(client, p, travail, options = {}) {
      const annuler = options.annuler !== false;
      await client.query('begin');
      try {
        // `set_config(…, true)` = `set local` : la valeur meurt au commit ou au
        // rollback. C'est ce qui rend le cloisonnement compatible avec un pool.
        await client.query(
          `select set_config('grc.utilisateur', $1, true),
                  set_config('grc.filiale_id',  $2, true),
                  set_config('grc.filiales',    $3, true)`,
          [p.utilisateur, p.filialeId ?? '', (p.filiales ?? []).join(',')],
        );
        const resultat = await travail(client);
        await client.query(annuler ? 'rollback' : 'commit');
        return resultat;
      } catch (erreur) {
        await client.query('rollback').catch(() => {
          /* Transaction déjà perdue : ne pas masquer l'erreur d'origine. */
        });
        throw erreur;
      }
    },

    /** Raccourci de lecture : renvoie directement les lignes. */
    async lignes(client, texte, valeurs = []) {
      const resultat = await client.query(texte, valeurs);
      return resultat.rows;
    },

    /** Raccourci : première colonne de la première ligne, ou `undefined`. */
    async valeur(client, texte, valeurs = []) {
      const resultat = await client.query(texte, valeurs);
      if (resultat.rowCount === 0) return undefined;
      return Object.values(resultat.rows[0])[0];
    },

    /**
     * Ferme tout et supprime la base. Appelé depuis un `after()`, il s'exécute même
     * si un test a échoué — c'est la seule façon de ne pas laisser derrière soi des
     * dizaines de bases orphelines.
     */
    async fermer() {
      for (const client of connexions) {
        await client.end().catch(() => {
          /* Déjà fermée ou connexion perdue : sans conséquence ici. */
        });
      }
      connexions.clear();
      partagees.clear();
      await supprimerBase(conf, nom);
    },
  };

  return base;
}

/**
 * Capture l'erreur d'une promesse attendue en échec.
 *
 * Écrire `await assert.rejects(…)` cache le `SQLSTATE`, or c'est précisément ce que
 * les tests du socle doivent vérifier (`GRC01`, `GRC03`, `42501`). Cette aide rend
 * l'erreur pour qu'on l'inspecte, et échoue explicitement si rien n'a été levé.
 *
 * @param {Promise<any>|(() => Promise<any>)} promesseOuFonction
 * @returns {Promise<Error & {code?: string}>}
 */
export async function erreurAttendue(promesseOuFonction) {
  try {
    await (typeof promesseOuFonction === 'function' ? promesseOuFonction() : promesseOuFonction);
  } catch (erreur) {
    return erreur;
  }
  throw new Error("Aucune erreur levée alors qu'une erreur était attendue.");
}

/* =====================================================================
 *  Cycle de vie de la base — détails d'implémentation
 * ===================================================================== */

/** Ouvre une connexion à la base d'administration `postgres` avec le compte propriétaire. */
async function clientAdministration(conf) {
  const client = new pg.Client({
    host: conf.hote,
    port: conf.port,
    database: 'postgres',
    user: conf.proprietaire.nom,
    password: conf.proprietaire.motDePasse,
    application_name: 'cyber-grc-essai-admin',
  });
  try {
    await client.connect();
  } catch (erreur) {
    throw new Error(
      `Connexion impossible à la base « postgres » comme ${conf.proprietaire.nom} : ${erreur.message}\n` +
        'Préparez d\'abord la machine : bash db/dev/preparer_base_dev.sh',
    );
  }
  return client;
}

async function recreerBase(conf, nom) {
  const admin = await clientAdministration(conf);
  try {
    // « with (force) » (PostgreSQL 13+) coupe les connexions résiduelles d'un test
    // précédent interrompu. Cible 17, développement 16 : bien en deçà.
    await admin.query(`drop database if exists ${nom} with (force)`);
    await admin.query(`create database ${nom} owner ${conf.proprietaire.nom} encoding 'UTF8'`);
  } catch (erreur) {
    if (erreur.code === '42501') {
      throw new Error(
        `${conf.proprietaire.nom} n'a pas le droit de créer une base d'essai.\n` +
          'Accordez-le en développement : bash db/dev/preparer_base_dev.sh',
      );
    }
    throw erreur;
  } finally {
    await admin.end().catch(() => {});
  }
}

async function supprimerBase(conf, nom) {
  const admin = await clientAdministration(conf).catch(() => null);
  if (admin === null) return; // Base déjà inaccessible : rien à nettoyer.
  try {
    await admin.query(`drop database if exists ${nom} with (force)`);
  } finally {
    await admin.end().catch(() => {});
  }
}

/**
 * Applique les migrations en appelant `db/migrate.mjs`.
 *
 * Un enfant plutôt qu'un import : c'est le binaire réellement invoqué par
 * `deploy/install.sh` qui est éprouvé, code de sortie compris. Si une migration
 * échoue, sa sortie est reproduite telle quelle — c'est elle qui dit pourquoi.
 */
async function appliquerMigrations(conf, nom, jusquA) {
  const arguments_ = jusquA === undefined ? [] : ['--jusqu-a', String(jusquA)];
  try {
    await executerFichier(process.execPath, [MIGRATE, ...arguments_], {
      cwd: RACINE_BACKEND,
      env: {
        ...process.env,
        BASE_HOTE: conf.hote,
        BASE_PORT: String(conf.port),
        BASE_NOM: nom,
        BASE_UTILISATEUR_PROPRIETAIRE: conf.proprietaire.nom,
        BASE_MOT_DE_PASSE_PROPRIETAIRE: conf.proprietaire.motDePasse,
        BASE_UTILISATEUR: conf.app.nom,
        BASE_SSL: 'desactive',
      },
    });
  } catch (erreur) {
    throw new Error(
      `Les migrations ont échoué sur la base d'essai « ${nom} » ` +
        `(code de sortie ${erreur.code}) :\n${erreur.stdout ?? ''}${erreur.stderr ?? ''}`,
    );
  }
}
