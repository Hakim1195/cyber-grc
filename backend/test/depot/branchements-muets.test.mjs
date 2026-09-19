/**
 * branchements-muets.test.mjs — **un branchement qui ne trouve rien se tait**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le défaut, et pourquoi il mérite un garde-fou plutôt qu'une relecture
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le 18/09/2026, l'écran des ateliers EBIOS RM portait un bouton « Supprimer
 * l'étude » parfaitement visible dont le clic ne faisait **rien** : ni dialogue
 * de confirmation, ni requête, ni message. La cause tient en un mot —
 * `UI.wireDelete({ button: document.getElementById("…") })` au lieu de
 * `{ button: "…" }` :
 *
 *   · `wireDelete` fait LUI-MÊME le `getElementById`, à partir d'une CHAÎNE ;
 *   · `document.getElementById(<un élément>)` rend `null` ;
 *   · et la fonction **rend la main sans un mot** quand elle ne trouve rien —
 *     ce qui est le bon comportement pour un écran où le bouton n'existe pas
 *     (lecture seule), et le pire qui soit quand il existe.
 *
 * Le banc ne pouvait pas le voir : `test/modules/non-regression.test.mjs`
 * éprouve qu'un écran s'affiche et qu'un renommage d'identifiant le suit, jamais
 * qu'une suppression depuis la fiche aboutit. C'est le navigateur, sur la
 * recette, qui l'a dit — **la cinquième fois de la semaine** qu'un défaut sort
 * ainsi et d'aucune autre façon (`docs/REPRISE.md` §4).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce contrôle mesure, et ce qu'il ne mesure pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il ne clique sur rien. Il lit les appels aux deux brancheurs qui résolvent
 * eux-mêmes leur cible — `UI.wireDelete` et `UI.wireBulkDelete` — et exige que
 * `button` reçoive une **chaîne littérale**. C'est la seule forme que ces
 * fonctions savent résoudre, et la seule dont l'erreur soit impossible.
 *
 * ⚠️ Il ne dit pas que l'identifiant existe dans le gabarit : cela, seul le
 * navigateur le sait. Il ferme la classe où **le type** de l'argument est faux,
 * qui est celle qui a coûté — et il la ferme pour tous les modules à la fois,
 * plutôt que pour celui où elle vient de se produire (`CONVENTIONS.md` §19.5 :
 * *la parade n'est jamais la vigilance, c'est la découverte*).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_FRONTEND } from '../aide/serveur.mjs';

/** Les brancheurs qui résolvent eux-mêmes leur cible à partir d'une CHAÎNE. */
const BRANCHEURS = ['wireDelete', 'wireBulkDelete'];

/** Tous les fichiers d'interface, DÉCOUVERTS — jamais une liste recopiée. */
function fichiersJs(repertoire = RACINE_FRONTEND, resultat = []) {
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) {
      // `js/lib/` porte des bibliothèques embarquées (SheetJS) : elles ne sont
      // pas de nous, et elles n'appellent pas nos brancheurs.
      if (entree.name === 'lib' || entree.name === 'assets') continue;
      fichiersJs(chemin, resultat);
    } else if (entree.name.endsWith('.js')) {
      resultat.push(chemin);
    }
  }
  return resultat;
}

describe('Un brancheur reçoit un IDENTIFIANT, jamais un élément', () => {
  test('LA MATIÈRE : les brancheurs sont bien appelés quelque part', () => {
    const fichiers = fichiersJs();
    assert.ok(fichiers.length >= 20, `Seulement ${String(fichiers.length)} fichier(s) balayé(s).`);
    const appels = fichiers.filter((f) =>
      BRANCHEURS.some((b) => readFileSync(f, 'utf8').includes(`${b}(`)),
    );
    assert.ok(
      appels.length >= 5,
      'Moins de cinq fichiers appellent un brancheur : ce contrôle ne mesure plus rien. ' +
        'Si les fonctions ont été renommées, corriger ICI plutôt que de supprimer le contrôle.',
    );
  });

  test('AUCUN appel ne passe un ÉLÉMENT là où une chaîne est attendue', () => {
    const fautifs = [];
    for (const chemin of fichiersJs()) {
      const source = readFileSync(chemin, 'utf8');
      for (const brancheur of BRANCHEURS) {
        // On lit ce qui suit l'appel jusqu'à la parenthèse fermante la plus
        // probable — assez pour voir le champ `button`, jamais assez pour
        // avaler le fichier. Un motif borné, au sens du constat Q-215.
        const motif = new RegExp(`${brancheur}\\(\\{[^}]{0,2000}\\}`, 'gu');
        for (const [bloc] of source.matchAll(motif)) {
          const champ = /button\s*:\s*([^,\n]+)/u.exec(bloc);
          if (champ === null) continue;
          const valeur = champ[1].trim();
          // Une chaîne littérale, et rien d'autre. Un `document.getElementById`,
          // une variable, un appel : tous se résolvent en `null` chez le
          // brancheur, et le bouton devient inerte SANS UN MOT.
          if (!/^(["'`])[^"'`]+\1$/u.test(valeur)) {
            fautifs.push(
              `${relative(RACINE_FRONTEND, chemin).split('\\').join('/')} : ` +
                `${brancheur}({ button: ${valeur} })`,
            );
          }
        }
      }
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces appels passent autre chose qu’une CHAÎNE à « button ». Le brancheur fait ' +
        'lui-même le getElementById : tout le reste se résout en null, et il rend la main ' +
        'SANS UN MOT. Le bouton reste visible, et son clic ne fait rien — ni dialogue, ni ' +
        'requête, ni message. Mesuré au navigateur le 18/09/2026 sur l’écran des ateliers ' +
        'EBIOS RM ; le banc ne pouvait pas le voir.\n' +
        fautifs.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('LE CONTRÔLE MORD : un élément passé en argument est vu', () => {
    // La morsure, sur une source fabriquée : sans elle, un motif devenu muet
    // rendrait vert en n'éprouvant rien (constat Q-210).
    const faux = 'UI.wireDelete({ button: document.getElementById("x"), remove: () => {} })';
    const bloc = new RegExp('wireDelete\\(\\{[^}]{0,2000}\\}', 'u').exec(faux);
    assert.notEqual(bloc, null, 'Le motif ne reconnaît plus un appel : il ne mesure plus rien.');
    const champ = /button\s*:\s*([^,\n]+)/u.exec(bloc[0]);
    assert.notEqual(champ, null);
    assert.equal(
      /^(["'`])[^"'`]+\1$/u.test(champ[1].trim()),
      false,
      'Le contrôle accepte un élément : il ne ferme plus la classe qu’il existe pour fermer.',
    );
    // Et l'inverse : une chaîne littérale doit passer.
    const bon = "UI.wireDelete({ button: 'delBtn', remove: () => {} })";
    const blocBon = new RegExp('wireDelete\\(\\{[^}]{0,2000}\\}', 'u').exec(bon);
    const champBon = /button\s*:\s*([^,\n]+)/u.exec(blocBon[0]);
    assert.equal(/^(["'`])[^"'`]+\1$/u.test(champBon[1].trim()), true);
  });
});
