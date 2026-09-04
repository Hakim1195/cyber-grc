#!/usr/bin/env node
/**
 * synchroniser-groupes-ad.mjs — aligne la table `groupes_ad` sur la liste
 * ENGENDRÉE depuis la déclaration des filiales et les profils de la base.
 *
 * ── Pourquoi ce fichier existe : le constat Q-78 ────────────────────────────
 *
 * `synchroniserGroupesAd()` était écrite, éprouvée, et **appelée par les essais
 * et par rien d'autre** — `test/auth/service.test.mjs` et
 * `test/droits/trois-axes.test.mjs`, point. Aucun chemin de production ne
 * l'invoquait. Mesuré le 03/09/2026 sur une installation réelle, après cinq
 * passages de `deploy/install.sh` en `NODE_ENV=production` :
 *
 *     select count(*) from groupes_ad;   ->  0
 *     POST /api/connexion (compte de secours, BON mot de passe)  ->  403
 *     « Votre compte est reconnu, mais aucun accès à cette application
 *       ne lui est ouvert. »
 *
 * Autrement dit : après une installation complète et réussie, **personne** ne
 * pouvait se servir du produit, compte de secours compris. C'est la forme exacte
 * du constat Q-71 d'un cran plus loin — deux moitiés justes reliées par personne
 * — avec cette aggravation que **le banc restait vert parce qu'il appelait
 * lui-même la fonction que le produit n'appelait jamais**. L'essai
 * `trois-axes.test.mjs` écrivait même, en commentaire : *« c'est le geste que
 * `deploy/` rejouera à l'installation »*. Il ne le rejouait pas.
 *
 * ── L'arbitrage, et pourquoi ce n'est ni l'un ni l'autre des deux réflexes ──
 *
 * Deux remèdes se présentaient, et aucun ne convient :
 *
 *   · **au démarrage du service** — il écraserait en silence ce qu'un exploitant
 *     a ajusté dans `groupes_ad`, et ferait dépendre l'accès de tous d'un effet
 *     de bord invisible ;
 *   · **dans `deploy/install.sh` seulement** — la liste change à **chaque
 *     acquisition de filiale**, et le §27 dit que `filiales.conf` est la source :
 *     un geste qui n'existerait qu'à l'installation obligerait à réinstaller.
 *
 * C'est donc une **commande d'administration explicite et idempotente** :
 * `install.sh` l'appelle après les migrations, et l'exploitant la rejoue à la
 * main après chaque modification de `filiales.conf`. Rien ne se produit dans le
 * dos de personne, et rejouer ne coûte rien.
 *
 * ── Ce qu'elle NE fait pas ─────────────────────────────────────────────────
 *
 * Elle ne **crée** aucun groupe dans l'Active Directory : créer un groupe dans
 * l'annuaire du client n'appartient pas à ce produit. `deploy/groupes-ad.sh
 * --powershell` engendre le script que l'équipe IT exécute. Ici, on aligne la
 * table qui dit *quel groupe accorde quoi*.
 *
 * Elle ne **supprime** rien non plus : un groupe présent en base et absent de la
 * liste attendue est rendu dans `inattendus` et **affiché**, jamais effacé. Une
 * suppression automatique retirerait l'accès d'une filiale sur une faute de
 * frappe dans `filiales.conf`.
 *
 * ── Codes de sortie ────────────────────────────────────────────────────────
 *
 *   0  la table est alignée (avec ou sans création)
 *   1  configuration illisible ou incomplète
 *   2  base injoignable
 *   3  la synchronisation a échoué (le message dit pourquoi)
 *   4  aucun groupe attendu — la table resterait vide, donc personne n'aurait
 *      d'accès : c'est un échec, pas un succès silencieux (constat Q-78)
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *     BASE_NOM=cyber_grc BASE_MOT_DE_PASSE_PROPRIETAIRE=… \
 *       node db/synchroniser-groupes-ad.mjs [--prefixe GRC-] [--simuler]
 */

import { createRequire } from 'node:module';
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

let prefixe = process.env.LDAP_PREFIXE_GROUPES ?? 'GRC-';
let simuler = false;
for (let i = 2; i < process.argv.length; i += 1) {
  const a = process.argv[i];
  if (a === '--prefixe') {
    prefixe = process.argv[i + 1] ?? '';
    i += 1;
  } else if (a === '--simuler') {
    simuler = true;
  } else if (a === '--aide' || a === '-h') {
    process.stdout.write(
      'Aligne « groupes_ad » sur la liste engendrée depuis les filiales et les profils.\n\n' +
        '  --prefixe <valeur>  préfixe des groupes (défaut : LDAP_PREFIXE_GROUPES ou GRC-)\n' +
        '  --simuler           montre ce qui serait fait, sans rien écrire\n',
    );
    process.exit(0);
  } else {
    echec(1, `Option inconnue : ${a} (voir --aide).`);
  }
}

/* ── Le moteur compilé, découvert et non supposé ───────────────────────── */

const CHEMIN_DROITS = join(RACINE, 'dist', 'droits', 'index.js');
let droits;
try {
  droits = await import(`file://${CHEMIN_DROITS}`);
} catch (erreur) {
  echec(
    1,
    `Le moteur compilé est absent : ${CHEMIN_DROITS}\n` +
      "      Ce script ne réécrit PAS la convention de nommage — il applique ce que rend\n" +
      "      groupesAttendus(), pour qu'il n'y ait jamais deux vérités. Compilez d'abord :\n" +
      `        cd ${RACINE} && npm run build\n` +
      `      Cause : ${erreur.message}`,
  );
}

/* ── Configuration et connexion ────────────────────────────────────────── */

// `lireConfiguration` LÈVE sur configuration incomplète — elle ne rend pas une
// liste de problèmes. On attrape, plutôt que de tester un champ qui n'existe pas :
// un `conf.problemes` toujours `undefined` aurait donné un contrôle qui passe
// toujours, c'est-à-dire pas un contrôle.
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
  echec(2, `Base injoignable (${conf.utilisateur}@${conf.hote}:${conf.port}/${conf.base}).\n      ${erreur.message}`);
}

process.stdout.write(
  `\n${bleu('==>')} Groupes AD — alignement de « groupes_ad » sur ${conf.base}\n`,
);

try {
  await client.query('begin');

  // La table `groupes_ad` est une table de CONFIGURATION : son écriture est
  // réservée à l'administration Groupe depuis la porte S1 (constat M-2,
  // `004_rls.sql` §6). On pose donc le périmètre, comme le fait `src/db/pool.ts`.
  await client.query(
    `select set_config('grc.utilisateur',           $1, true),
            set_config('grc.filiale_id',            '',  true),
            set_config('grc.filiales',              '',  true),
            set_config('grc.administration_groupe', 'oui', true)`,
    ['synchronisation-groupes-ad'],
  );

  const filiales = await droits.lireFilialesActives(client);
  const profils = await droits.lireProfilsActifs(client);
  const attendus = droits.groupesAttendus(prefixe, filiales, profils);

  process.stdout.write(
    `  ${filiales.length} filiale(s) active(s), ${profils.length} profil(s), ` +
      `préfixe « ${prefixe} » → ${attendus.length} groupe(s) attendu(s)\n`,
  );

  // ⚠️ **Ce garde-fou testait `attendus.length === 0`, et il était INATTEIGNABLE.**
  // Mordu le 04/09/2026 sur une base dont `profils` avait été vidée : le script
  // sortait en **0**, comme si tout allait bien. Motif : `groupesAttendus()` rend
  // toujours les deux groupes **transversaux** (`GRC-EXPORT`, `GRC-ADMIN`), qui ne
  // dépendent ni des filiales ni des profils. La liste n'est donc jamais vide, et
  // la condition jamais vraie — une décoration, exactement ce que ce chantier
  // appelle « un essai vert qui n'éprouve rien ».
  //
  // Le vrai mode de panne est celui-ci : **aucun profil connu**. Alors seuls les
  // deux transversaux existent, aucun groupe n'accorde de profil métier, et
  // personne n'obtient d'accès — la situation exacte du constat Q-78, avec un
  // script qui aurait annoncé le succès.
  if (profils.length === 0) {
    await client.query('rollback');
    echec(
      4,
      "Aucun profil métier dans la table « profils ».\n" +
        "      Seuls les deux groupes transversaux seraient créés, aucun groupe\n" +
        "      n'accorderait de profil, et PERSONNE n'obtiendrait d'accès — pas même\n" +
        '      le compte de secours (constat Q-78).\n' +
        "      Cause la plus probable : la migration 007 n'est pas appliquée.\n" +
        '        node db/migrate.mjs',
    );
  }

  if (simuler) {
    for (const g of attendus) process.stdout.write(`    · ${g.nom}\n`);
    await client.query('rollback');
    process.stdout.write(`${jaune('  !!')} --simuler : rien n'a été écrit.\n\n`);
    process.exit(0);
  }

  const bilan = await droits.synchroniserGroupesAd(client, attendus);
  await client.query('commit');

  for (const nom of bilan.crees) process.stdout.write(`  ${vert('  +')} ${nom}\n`);
  process.stdout.write(
    `${vert('  ok')} ${bilan.crees.length} créé(s), ` +
      `${attendus.length - bilan.crees.length} déjà présent(s)\n`,
  );

  if (bilan.inattendus.length > 0) {
    // Affiché, jamais supprimé : voir l'en-tête.
    process.stdout.write(
      `${jaune('  !!')} ${bilan.inattendus.length} groupe(s) en base hors de la liste attendue :\n` +
        bilan.inattendus.map((n) => `       ${n}\n`).join('') +
        `${jaune('  !!')} Ils ne sont PAS supprimés. Si une filiale a disparu de filiales.conf,\n` +
        `${jaune('  !!')} retirez-les à la main — un effacement automatique couperait l'accès\n` +
        `${jaune('  !!')} d'une filiale entière sur une faute de frappe.\n`,
    );
  }
  process.stdout.write('\n');
} catch (erreur) {
  try {
    await client.query('rollback');
  } catch {
    /* la transaction est déjà morte : le message qui compte est celui d'en dessous */
  }
  echec(3, `La synchronisation a échoué : ${erreur.message}`);
} finally {
  await client.end();
}
