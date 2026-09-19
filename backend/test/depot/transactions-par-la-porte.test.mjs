/**
 * transactions-par-la-porte.test.mjs — **toute transaction passe par
 * `avecTransaction`**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce contrôle existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Chaque entrée du journal d'audit produit une ligne destinée à l'agrégateur de
 * logs, et cette ligne **ne part qu'après le `commit`** : l'émettre plus tôt
 * mettrait dans le SIEM un événement que le `rollback` efface ensuite de la
 * base — une fausse accusation, et qui ne se corrige pas une fois partie chez
 * quelqu'un d'autre (classe du constat **Q-301**).
 *
 * Ce différé tient au **tampon** ouvert par `avecTransaction`
 * (`src/db/pool.ts`). Un appelant qui ouvrirait sa propre transaction
 * n'aurait pas de tampon : sa ligne partirait immédiatement, donc avant la
 * validation. Le comportement resterait raisonnable — c'est le meilleur effort
 * — mais la PROPRIÉTÉ, elle, serait perdue **sans qu'aucun essai ne rougisse**.
 *
 * ⚠️ Au moment où ce contrôle est écrit, il n'existe **aucun** appelant de ce
 * genre : `src/db/pool.ts` est le seul fichier de `src/` qui écrive `begin`.
 * Le contrôle ne corrige donc rien — il **fige** ce qui est vrai, et oblige
 * quiconque voudrait le changer à le décider plutôt qu'à le faire par mégarde
 * (`CONVENTIONS.md` §19.5 : *la parade n'est jamais la vigilance, c'est la
 * découverte*).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

const RACINE_SRC = join(RACINE_BACKEND, 'src');

/** Le seul fichier autorisé à ouvrir une transaction, et la raison. */
const PORTIER = 'db/pool.ts';

/** Tous les fichiers TypeScript de `src/`, DÉCOUVERTS. */
function fichiersTs(repertoire = RACINE_SRC, resultat = []) {
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) fichiersTs(chemin, resultat);
    else if (entree.name.endsWith('.ts')) resultat.push(chemin);
  }
  return resultat;
}

/**
 * Les `begin` d'un fichier, hors commentaires.
 *
 * ⚠️ On cherche la CHAÎNE passée à `query`, pas le mot : `begin` apparaît en
 * français dans les commentaires de ce dépôt, et un motif qui l'attraperait là
 * accuserait à tort — un contrôle qui accuse à tort finit désarmé (constat Q-64).
 */
function transactionsOuvertes(source) {
  const sansBlocs = source.replace(/\/\*[\s\S]*?\*\//gu, '');
  const sansLignes = sansBlocs.replace(/^[ \t]*\/\/.*$/gmu, '');
  // ⚠️ La forme ne peut PAS exiger « query( » collé à la chaîne : le portier
  //    lui-même écrit une ternaire — `query(lectureSeule ? 'begin read only' :
  //    'begin')`. On cherche donc un LITTÉRAL qui COMMENCE par « begin », ce
  //    qu'aucune phrase française ne fait, et le §2 de cet essai le vérifie.
  return [...sansLignes.matchAll(/(['"`])\s*begin\b[^'"`]*\1/giu)].map((m) => m[0]);
}

describe('Toute transaction passe par la porte (src/db/pool.ts)', () => {
  test('LA MATIÈRE : le portier ouvre bien des transactions', () => {
    const source = readFileSync(join(RACINE_SRC, PORTIER), 'utf8');
    const ouvertures = transactionsOuvertes(source);
    assert.ok(
      ouvertures.length >= 1,
      `« ${PORTIER} » n’ouvre plus aucune transaction : ce contrôle ne mesure plus rien. ` +
        'Si la plomberie a déménagé, corriger ICI plutôt que de supprimer le contrôle.',
    );
  });

  test('AUCUN autre fichier de src/ n’ouvre une transaction', () => {
    const fautifs = [];
    for (const chemin of fichiersTs()) {
      const relatif = relative(RACINE_SRC, chemin).split('\\').join('/');
      if (relatif === PORTIER) continue;
      const ouvertures = transactionsOuvertes(readFileSync(chemin, 'utf8'));
      for (const texte of ouvertures) fautifs.push(`${relatif} : ${texte}`);
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces fichiers ouvrent une transaction sans passer par « avecTransaction ». Deux ' +
        'choses s’y perdent, et aucune ne fait rougir quoi que ce soit : le périmètre RLS, ' +
        'qui n’est posé que par la porte, et le TAMPON du journal — dont les lignes ' +
        'partiraient alors vers l’agrégateur de logs AVANT le commit, c’est-à-dire pour des ' +
        'événements qu’un rollback peut encore effacer.\n' +
        fautifs.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('LE CONTRÔLE MORD, et il n’accuse pas un commentaire', () => {
    assert.equal(transactionsOuvertes("await client.query('begin');").length, 1);
    assert.equal(transactionsOuvertes('await client.query("begin read only");').length, 1);
    // La ternaire du portier, qui est la forme réellement employée.
    assert.equal(
      transactionsOuvertes("client.query(lectureSeule ? 'begin read only' : 'begin')").length,
      2,
    );
    // Un commentaire français qui contient le mot ne doit RIEN déclencher.
    assert.equal(
      transactionsOuvertes('// on begin par poser le périmètre, puis on écrit').length,
      0,
      'Le motif attrape du commentaire : il accuserait à tort, et un contrôle qui accuse à ' +
        'tort finit désarmé (constat Q-64).',
    );
    assert.equal(
      transactionsOuvertes('/* la transaction begin ici est décrite, pas ouverte */').length,
      0,
    );
  });
});
