#!/usr/bin/env node
/**
 * importer-filiales.mjs — porte `/etc/cyber-grc/filiales.conf` **en base**, une
 * fois, à l'amorçage.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * Mesuré le 24/09/2026 : `insert into filiales` n'existait ni dans `deploy/` ni
 * dans `db/`, et le commentaire d'`install.sh` l'annonçait encore au futur — « que
 * le lot L4 consommera pour semer la table `filiales` ». Les deux moitiés du
 * dispositif lisaient donc deux sources différentes :
 *
 *   · `deploy/groupes-ad.sh`           → le FICHIER → les groupes à créer dans l'AD ;
 *   · `db/synchroniser-groupes-ad.mjs` → la TABLE   → `groupes_ad`, l'autorité
 *     applicative qui décide de ce qu'un groupe ACCORDE.
 *
 * Avec deux filiales déclarées et une table vide : **26 groupes créés dans
 * l'annuaire, 10 seulement déclarés en base**. `GRC-ADMIN` étant du lot,
 * l'administrateur entrait — et c'est ce qui rendait le défaut si discret. Les
 * seize groupes de filiale, eux, n'accordaient RIEN : le RSSI de site se
 * connectait sans obtenir le moindre accès, sans message.
 *
 * ── Ce qu'il fait, et ce qu'il refuse de faire ──────────────────────────────
 *
 * Il **appelle `amorcerFiliales()`** (`src/filiales/index.ts`), qui appelle
 * elle-même `creerFiliale()` — le chemin normal de la création. Ce script
 * n'écrit donc pas une ligne de SQL sur `filiales` : une filiale amorcée est
 * indiscernable d'une filiale créée à l'écran, identifiant engendré par le
 * serveur, groupes d'annuaire synchronisés dans la même transaction et trace au
 * journal comprises.
 *
 * Il **ne touche à rien** si le produit connaît déjà une filiale active : à partir
 * de là, c'est la table qui fait foi, et une acquisition se déclare à l'écran. Et
 * il **ne crée aucun groupe dans l'Active Directory** — `deploy/groupes-ad.sh
 * --powershell` engendre le script que l'équipe IT exécute.
 *
 * ── Codes de sortie ────────────────────────────────────────────────────────
 *
 *   0  la base connaît les filiales (importées à l'instant, ou déjà là)
 *   1  configuration illisible, ou moteur compilé absent
 *   2  base injoignable
 *   3  la déclaration est INVALIDE : rien n'a été importé
 *   4  l'import a échoué (le message dit pourquoi)
 *
 * ── Emploi ─────────────────────────────────────────────────────────────────
 *
 *     BASE_NOM=cyber_grc BASE_MOT_DE_PASSE_PROPRIETAIRE=… \
 *       node db/importer-filiales.mjs [--fichier /etc/cyber-grc/filiales.conf]
 *                                     [--simuler]
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lireConfiguration } from './migrate.mjs';

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const require_ = createRequire(import.meta.url);

const bleu = (t) => `[1;34m${t}[0m`;
const vert = (t) => `[1;32m${t}[0m`;
const rouge = (t) => `[1;31m${t}[0m`;
const jaune = (t) => `[1;33m${t}[0m`;

function echec(code, message) {
  process.stderr.write(`${rouge(' ERR')} ${message}\n`);
  process.exit(code);
}

/* ── Arguments ─────────────────────────────────────────────────────────── */

const CONFIG = process.env.CYBER_GRC_CONFIG ?? '/etc/cyber-grc';
let fichier = process.env.CYBER_GRC_FILIALES ?? join(CONFIG, 'filiales.conf');
let prefixe = process.env.LDAP_PREFIXE_GROUPES ?? 'GRC-';
let simuler = false;
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a === '--fichier') {
    fichier = process.argv[i + 1] ?? '';
    i += 1;
  } else if (a === '--prefixe') {
    prefixe = process.argv[i + 1] ?? '';
    i += 1;
  } else if (a === '--simuler') {
    simuler = true;
  } else if (a === '--aide' || a === '-h') {
    process.stdout.write(
      'Porte la déclaration des filiales en base, si la base n’en connaît aucune.\n\n' +
        '  --fichier <chemin>  déclaration à lire (défaut : $CYBER_GRC_CONFIG/filiales.conf)\n' +
        '  --prefixe <valeur>  préfixe des groupes (défaut : LDAP_PREFIXE_GROUPES ou GRC-)\n' +
        '  --simuler           montre ce qui serait fait, sans rien écrire\n',
    );
    process.exit(0);
  } else {
    echec(1, `Option inconnue : ${a} (voir --aide).`);
  }
}

/* ── Le moteur compilé, découvert et non supposé ───────────────────────── */

const CHEMIN_FILIALES = join(RACINE, 'dist', 'filiales', 'index.js');
let moteur;
try {
  moteur = await import(`file://${CHEMIN_FILIALES}`);
} catch (erreur) {
  echec(
    1,
    `Le moteur compilé est absent : ${CHEMIN_FILIALES}\n` +
      '      Ce script n’écrit PAS dans « filiales » : il appelle amorcerFiliales(), qui\n' +
      '      appelle creerFiliale() — le chemin normal de la création. Compilez d’abord :\n' +
      `        cd ${RACINE} && npm run build\n` +
      `      Cause : ${erreur.message}`,
  );
}

/* ── La déclaration ────────────────────────────────────────────────────── */

let contenu;
try {
  contenu = readFileSync(fichier, 'utf8');
} catch (erreur) {
  echec(
    1,
    `Déclaration des filiales illisible : ${fichier}\n` +
      '      C’est la déclaration d’exploitation du périmètre (CONVENTIONS.md §27), et elle est\n' +
      '      écrite par le client — ce script ne peut pas l’inventer. Partez du modèle :\n' +
      `        install -m 0640 ${RACINE}/deploy/filiales.conf.exemple ${fichier}\n` +
      `      Cause : ${erreur.message}`,
  );
}

/* ── Configuration et connexion ────────────────────────────────────────── */

let conf;
try {
  conf = lireConfiguration();
} catch (erreur) {
  echec(1, `Configuration incomplète : ${erreur.message}`);
}

const pg = require_('pg');
const client = new pg.Client({
  host: conf.hote,
  port: conf.port,
  database: conf.base,
  user: conf.utilisateur,
  password: conf.motDePasse,
  ...(conf.ssl === undefined ? {} : { ssl: conf.ssl }),
});

try {
  await client.connect();
} catch (erreur) {
  echec(
    2,
    `Base injoignable (${conf.utilisateur}@${conf.hote}:${conf.port}/${conf.base}).\n` +
      `      ${erreur.message}`,
  );
}

process.stdout.write(`\n${bleu('==>')} Filiales — amorçage de « filiales » depuis ${fichier}\n`);

/**
 * Le périmètre de l'amorçage.
 *
 * ⚠️ `filialeId` est **nul**, et ce n'est pas un raccourci : au moment où la
 * première filiale est créée, il n'en existe aucune d'active. Les entrées que le
 * journal reçoit sont donc TRANSVERSALES, ce qui est exactement leur nature —
 * l'amorçage du périmètre n'appartient à aucune filiale.
 */
const PERIMETRE = Object.freeze({
  utilisateurId: 'amorçage-filiales',
  filialeId: null,
  filiales: [],
  perimetreGroupe: false,
  administrationGroupe: true,
});

let code = 0;
try {
  await client.query('begin');

  // `filiales` est une table de CONFIGURATION : son écriture est réservée à
  // l'administration Groupe depuis la porte S1 (constat M-2, `004_rls.sql` §6).
  // On pose donc le périmètre, comme le fait `src/db/pool.ts`.
  await client.query(
    `select set_config('grc.utilisateur',           $1,    true),
            set_config('grc.filiale_id',            '',    true),
            set_config('grc.filiales',              '',    true),
            set_config('grc.administration_groupe', 'oui', true)`,
    [PERIMETRE.utilisateurId],
  );

  const bilan = await moteur.amorcerFiliales(client, contenu, prefixe, PERIMETRE);

  if (bilan.statut === 'deja-peuple') {
    process.stdout.write(
      `${vert('  ok')} le produit connaît déjà ${String(bilan.deja_connues.length)} filiale(s) ` +
        `active(s) : ${bilan.deja_connues.join(', ')}\n` +
        `${jaune('  !!')} ${fichier} n’a PAS été relu, et c’est la règle : à partir du moment où la\n` +
        '      base connaît son périmètre, c’est la TABLE qui fait foi. Une acquisition se\n' +
        '      déclare à l’écran — Administration → Filiales —, jamais en éditant ce fichier.\n',
    );
  } else if (bilan.statut === 'rien-a-importer') {
    process.stdout.write(
      `${jaune('  !!')} ${fichier} ne déclare AUCUNE filiale active.\n` +
        '      Les groupes de périmètre Groupe et les deux transversaux existeront, donc un\n' +
        '      administrateur pourra entrer — mais aucun RSSI de site n’aura d’accès. Déclarez\n' +
        '      les filiales dans ce fichier, ou créez-les à l’écran après la première connexion.\n',
    );
  } else {
    process.stdout.write(
      `${vert('  ok')} ${String(bilan.creees.length)} filiale(s) portée(s) en base : ` +
        `${bilan.creees.join(', ')}\n`,
    );
    if (bilan.groupes_ad_a_creer.length > 0) {
      process.stdout.write(
        `${jaune('  !!')} ${String(bilan.groupes_ad_a_creer.length)} groupe(s) restent à créer ` +
          'DANS L’ANNUAIRE.\n' +
          '      Sans eux, ces filiales existent et personne ne peut y entrer :\n' +
          '        bash deploy/groupes-ad.sh --powershell --ou \'<DN de l’unité d’organisation>\'\n',
      );
    }
  }

  for (const hors of bilan.hors_perimetre) {
    process.stdout.write(`${jaune('  !!')} « ${hors.code} » n’a pas été importée : ${hors.motif}\n`);
  }

  if (simuler) {
    await client.query('rollback');
    process.stdout.write(
      `${jaune('  !!')} --simuler : la transaction a été ANNULÉE, rien n’a été écrit.\n`,
    );
  } else {
    await client.query('commit');
  }
} catch (erreur) {
  await client.query('rollback').catch(() => {});
  // Une anomalie de forme et un échec d'écriture ne se réparent pas au même
  // endroit : le premier se corrige dans le fichier, le second dans la base.
  // Deux codes de sortie, pour que l'installateur puisse dire lequel.
  const message = erreur.message ?? String(erreur);
  const invalide = /déclaration des filiales est invalide/u.test(message);
  code = invalide ? 3 : 4;
  process.stderr.write(`${rouge(' ERR')} ${message}\n`);
  if (invalide) {
    process.stderr.write(
      `      Fichier : ${fichier}\n` +
        '      RIEN n’a été importé : une ligne mal formée produirait un code de filiale faux,\n' +
        '      donc des noms de groupes faux — et un nom de groupe faux ne se voit qu’au moment\n' +
        '      où quelqu’un ne peut pas se connecter, sans message d’erreur.\n',
    );
  }
} finally {
  await client.end().catch(() => {});
}

process.exit(code);
