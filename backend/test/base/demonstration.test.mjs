/**
 * demonstration.test.mjs — `db/verifier_cloisonnement.sql`, rejoué par le banc.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * `db/verifier_cloisonnement.sql` est le dispositif de PREUVE du chantier : cent sept
 * contrôles qui démontrent, à un auditeur, qu'une filiale ne voit ni n'écrit chez sa
 * voisine. Il était joué à la main, par la personne qui pensait à le lancer, et par
 * personne d'autre — 107 contrôles que rien ne rejouait.
 *
 * C'est le motif du constat **Q-5** d'un cran plus haut : un dispositif qui peut se
 * périmer en silence. Le schéma évolue, une politique change, un contrôle cesse de
 * s'exécuter — et le fichier continue d'annoncer « CLOISONNEMENT DÉMONTRÉ » sur ce
 * qu'il joue encore. Ce chantier a payé quatre fois pour apprendre qu'un garde-fou
 * que rien n'appelle est un commentaire.
 *
 * ── Ce qui est éprouvé, et pourquoi le compte compte ─────────────────────────
 *
 * Le code de sortie ne suffit pas. Un script qui n'exécuterait plus RIEN sortirait
 * en 0 et annoncerait la démonstration faite : c'est le trou du « zéro contrôle
 * découvert » sous une autre forme, et il se ferme explicitement. On juge donc
 * ensemble le code de sortie, le nombre de contrôles joués, et le nombre d'échecs.
 *
 * ── La dépendance, assumée et écrite ─────────────────────────────────────────
 *
 * Ce fichier fait dépendre le banc du client **`psql`**. Ce n'est pas une dépendance
 * neuve : `db/dev/preparer_base_dev.sh` s'arrête déjà dessus (« psql introuvable :
 * installez le client PostgreSQL ») et s'en sert pour monter la base, et `install.sh`
 * l'exige sur la VM cible. Elle était là, non écrite — la pire des deux situations.
 * Elle est nécessaire ici parce que le script porte des méta-commandes `psql`
 * (`\pset`, `\echo`, `\gset`) que le pilote `pg` ne sait pas exécuter, et le
 * réécrire pour s'en passer reviendrait à éprouver autre chose que le fichier que
 * l'auditeur lance.
 *
 * **Si `psql` manque, cet essai ÉCHOUE ; il ne se saute pas.** Un essai qui se saute
 * rend un banc vert sur une machine où la démonstration n'a pas été jouée : il
 * fabrique exactement le silence qu'on cherche à supprimer.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`, et le client `psql`.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ouvrirBaseEssai } from '../aide/base.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(RACINE, 'db', 'verifier_cloisonnement.sql');
const executerFichier = promisify(execFile);

/**
 * Plancher du nombre de contrôles joués — **relevé, daté, et jamais abaissé en silence**.
 *
 * ── Pourquoi un plancher, et non le compte exact ─────────────────────────────
 *
 * Une égalité stricte ferait rougir l'essai à chaque contrôle AJOUTÉ au script. Or
 * ajouter un contrôle est le geste qu'on veut encourager : le punir pousserait à ne
 * plus en écrire, ou à « corriger » ce nombre sans le lire — et c'est ainsi qu'un
 * essai devient un rite. Le défaut qu'on veut attraper n'est pas la croissance,
 * c'est la **diminution** : un bloc qui cesse de s'exécuter, un fichier tronqué, un
 * `\set` qui avale la suite. Même règle qu'au registre des garde-fous de la
 * migration 005 : on n'ajoute jamais d'obligation à qui enrichit, on refuse à qui
 * retranche.
 *
 * Le geste attendu devant un rouge est donc de comprendre POURQUOI le compte a
 * baissé — et, si la baisse est voulue (deux contrôles fusionnés, un devenu sans
 * objet), de baisser ce plancher dans le même changement, avec le motif.
 *
 * Relevé le 01/09/2026, schéma en migration 005 : 107 contrôles, 107 réussis.
 */
const PLANCHER_CONTROLES = 107;

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
});

after(async () => {
  await base?.fermer();
});

/**
 * Joue la démonstration sous le compte APPLICATIF — le plus contraint du dispositif,
 * et celui que `deploy/install.sh` indique à l'exploitant. La jouer en propriétaire
 * la rendrait plus permissive que la réalité qu'elle prétend démontrer.
 */
async function jouerLaDemonstration() {
  const { hote, port, app } = base.reglages;
  const issue = await executerFichier(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-h', hote, '-p', String(port), '-U', app.nom, '-d', base.nom, '-f', SCRIPT],
    { env: { ...process.env, PGPASSWORD: app.motDePasse }, maxBuffer: 64 * 1024 * 1024 },
  ).catch((erreur) => erreur);

  if (issue instanceof Error && issue.code === 'ENOENT') {
    // Échouer, et dire quoi installer — comme le fait déjà `preparer_base_dev.sh`.
    // Se sauter ici rendrait le banc vert sans que la démonstration ait été jouée.
    throw new Error(
      'psql introuvable : installez le client PostgreSQL. Le banc en dépend pour rejouer ' +
        'db/verifier_cloisonnement.sql, qui porte des méta-commandes psql que le pilote « pg » ' +
        'ne sait pas exécuter. Cette dépendance est la même que celle de ' +
        'db/dev/preparer_base_dev.sh, qui a servi à monter cette base.',
    );
  }

  const sortie = `${issue.stdout ?? ''}${issue.stderr ?? ''}`;
  // Le récapitulatif final du script : « contrôles | réussis | échoués ».
  const resume = /\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/.exec(
    sortie.slice(sortie.lastIndexOf('| contrôles')),
  );
  return {
    code: issue.code ?? 0,
    sortie,
    controles: resume === null ? null : Number(resume[1]),
    reussis: resume === null ? null : Number(resume[2]),
    echoues: resume === null ? null : Number(resume[3]),
  };
}

describe('La démonstration de cloisonnement est REJOUÉE, pas seulement écrite', () => {
  test('elle passe, et elle a bien joué ses cent sept contrôles', async () => {
    const issue = await jouerLaDemonstration();

    assert.notEqual(
      issue.controles,
      null,
      `Récapitulatif introuvable dans la sortie : le script a-t-il été réécrit ?\n${issue.sortie.slice(-1500)}`,
    );
    // Le compte D'ABORD : un script qui n'exécute plus rien sort en 0, et l'affirmer
    // « démontré » sur cette base serait pire que de ne rien jouer du tout.
    assert.ok(
      issue.controles >= PLANCHER_CONTROLES,
      `${String(issue.controles)} contrôle(s) joué(s) pour un plancher de ` +
        `${String(PLANCHER_CONTROLES)} : des contrôles ont cessé de s’exécuter. Un dispositif ` +
        'de preuve qui rétrécit en silence ne prouve plus ce qu’il annonce.',
    );
    assert.equal(issue.echoues, 0, `Contrôles en échec :\n${issue.sortie.slice(-2500)}`);
    assert.equal(issue.reussis, issue.controles, 'Tout contrôle joué doit être un contrôle réussi.');
    assert.equal(issue.code, 0, `psql doit sortir en 0 :\n${issue.sortie.slice(-2500)}`);
  });

  test('LA DÉMONSTRATION MORD : le cloisonnement cassé, elle refuse', async () => {
    // Sans ce contre-essai, on aurait branché un script sans savoir s'il mord encore.
    // Le sabotage est celui qui coûte le moins cher à défaire, et le plus grave dans
    // ses effets : sans « force row level security », le propriétaire des tables
    // échappe aux politiques (`004_rls.sql` §1).
    const proprietaire = await base.connexion('proprietaire');
    await proprietaire.query('alter table risques no force row level security');
    try {
      const issue = await jouerLaDemonstration();
      assert.notEqual(issue.code, 0, 'Une base dont la RLS est tombée ne doit pas « démontrer » quoi que ce soit.');
      assert.ok(
        issue.echoues !== null && issue.echoues > 0,
        `Le récapitulatif doit compter des échecs :\n${issue.sortie.slice(-1500)}`,
      );
      assert.equal(
        issue.controles >= PLANCHER_CONTROLES,
        true,
        'Un sabotage ne doit pas non plus faire DISPARAÎTRE des contrôles : ils échouent, ils ne s’escamotent pas.',
      );
      assert.match(
        issue.sortie,
        /CLOISONNEMENT EN DÉFAUT/,
        'Et le refus doit être lisible par un exploitant, pas seulement par un code de sortie.',
      );
    } finally {
      await proprietaire.query('alter table risques force row level security');
    }

    // Contrôle symétrique : une fois réparée, la démonstration repasse. Sans lui, ce
    // fichier serait satisfait par une base définitivement cassée.
    const apres = await jouerLaDemonstration();
    assert.equal(apres.code, 0, `La réparation doit rétablir la démonstration :\n${apres.sortie.slice(-1500)}`);
    assert.equal(apres.echoues, 0);
  });
});
