/**
 * numerotation-anssi.test.mjs — **l'écart de numérotation est-il DIT ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-192** de la porte S6, tranché le 05/09/2026
 * ════════════════════════════════════════════════════════════════════════
 *
 * Treize codes du catalogue ANSSI sur quarante-deux désignent autre chose que
 * ce que le guide officiel désigne sous le même numéro : le code 30 est inséré,
 * les codes 31 à 41 sont décalés de +1, et le code 42 fusionne deux mesures
 * distinctes — fusion qui ramène le total à 42 et **masque le décalage**.
 *
 * ⚠️ Ce qui rend ce défaut coûteux n'est pas sa taille, c'est qu'**il ne se
 * signale pas** : les deux numérotations se lisent parfaitement. Un RSSI qui
 * rapproche l'écran du guide officiel ne retrouve pas ses mesures, et rien ne
 * lui dit pourquoi.
 *
 * ── L'arbitrage, et pourquoi il n'est pas « corriger les numéros » ────────
 *
 * Les auto-évaluations sont stockées par `(ref_id, code)`. Renuméroter en place
 * réattribuerait des évaluations existantes à d'autres mesures, **en silence**,
 * dans un outil qui sert de preuve en audit ISO 27001. Le remède serait pire
 * que le mal. On rend donc l'écart VISIBLE, et cet essai tient les deux moitiés :
 * la correspondance existe et dit vrai, et l'écran l'affiche.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_FRONTEND } from '../aide/serveur.mjs';

/**
 * Charge le registre et le catalogue ANSSI hors navigateur.
 *
 * ⚠️ Les sources sont CONCATÉNÉES dans une seule portée, comme le fait
 * `traductions-catalogues.test.mjs`. Les charger séparément ne marche pas : le
 * registre se déclare en `const` de plus haut niveau, qui n'existe alors que
 * dans SA portée — et le catalogue, qui commence par
 * `if (typeof Referentiels === "undefined") return;`, s'enregistrerait dans le
 * vide **sans lever**. L'essai serait vert sur un catalogue jamais chargé.
 */
function chargerAnssi() {
  const morceaux = [join('js', 'data', 'referentiels.js'), join('js', 'data', 'ref_anssi.js')].map(
    (f) => readFileSync(join(RACINE_FRONTEND, f), 'utf8'),
  );
  const fabrique = new Function('window', `${morceaux.join('\n;\n')}\nreturn Referentiels;`);
  const registre = fabrique({ I18n: { langue: () => 'fr' } });
  const ref = registre.get('anssi-hygiene');
  assert.ok(ref, 'Le catalogue ANSSI ne s’est pas enregistré : tout ce qui suit serait creux.');
  return ref;
}

describe('Q-192 — la numérotation du catalogue ANSSI dit son écart au guide', () => {
  const ref = chargerAnssi();

  test('LA MATIÈRE : le catalogue porte bien quarante-deux mesures', () => {
    const codes = ref.domaines.flatMap((d) => d.exigences.map((e) => e.code));
    assert.equal(codes.length, 42, `Le catalogue porte ${String(codes.length)} mesures, pas 42.`);
  });

  test('CHAQUE mesure porte son numéro officiel — aucune n’est oubliée', () => {
    // La moitié qui empêche la correspondance de devenir partielle. Une mesure
    // sans entrée s'afficherait sans rappel, donc comme si elle concordait —
    // « quelque chose réussit en silence alors que c'est faux ».
    const codes = ref.domaines.flatMap((d) => d.exigences.map((e) => e.code));
    const sansEntree = codes.filter(
      (c) => !Object.prototype.hasOwnProperty.call(ref.codesOfficiels, c),
    );
    assert.deepEqual(sansEntree, [], 'Ces codes n’ont pas de correspondance officielle déclarée.');
  });

  test('LA CORRESPONDANCE DIT CE QUE LE GUIDE DIT — les trois écarts, nommés', () => {
    // Écrit ici parce que c'est le SEUL endroit où l'on peut se tromper sans
    // qu'aucun contrôle ne s'en aperçoive : la règle qui engendre la table est
    // à trois lignes, et une erreur de borne y passerait inaperçue.
    assert.equal(ref.codesOfficiels['29'], '29', 'jusqu’à 29, les numérotations coïncident');
    assert.equal(ref.codesOfficiels['30'], null, 'le code 30 est propre à ce catalogue');
    assert.equal(ref.codesOfficiels['31'], '30', 'le décalage de +1 commence à 31');
    assert.equal(ref.codesOfficiels['34'], '33', 'le code 34 est la mesure 33 du guide');
    assert.equal(ref.codesOfficiels['40'], '39', 'le code 40 est la mesure 39 du guide');
    assert.equal(ref.codesOfficiels['41'], '40', 'le décalage court jusqu’à 41');
    assert.equal(ref.codesOfficiels['42'], '41 et 42', 'le code 42 fusionne deux mesures');
  });

  test('TREIZE codes divergent — ni douze, ni quatorze', () => {
    // Le compte est celui du constat. S'il bouge, c'est que la règle a changé,
    // et cela doit se voir plutôt que de se découvrir chez le client.
    const divergents = Object.entries(ref.codesOfficiels).filter(([code, off]) => off !== code);
    assert.equal(
      divergents.length,
      13,
      `Le constat Q-192 a mesuré 13 écarts, la table en porte ${String(divergents.length)} : ` +
        divergents.map(([c, o]) => `${c}→${String(o)}`).join(', '),
    );
  });

  test('L’ÉCRAN AFFICHE l’écart, et seulement là où il y en a un', () => {
    const source = readFileSync(
      join(RACINE_FRONTEND, 'js', 'modules', 'referentiels.js'),
      'utf8',
    );
    assert.match(
      source,
      /renvoiOfficiel\(ref, ex\)/u,
      'La colonne du code doit appeler le rappel : sans lui, la correspondance existe et ' +
        'personne ne la voit — le constat resterait entier.',
    );
    assert.match(
      source,
      /if \(officiel === ex\.code\) return "";/u,
      'Un rappel affiché partout est un bruit qu’on apprend à ne plus lire, et le jour où ' +
        'il signale un vrai écart personne ne le verrait (constat Q-123).',
    );
  });

  test('LA NOTE EXPLIQUE POURQUOI ON NE RENUMÉROTE PAS', () => {
    // Sans le motif, le prochain lecteur « corrigera » les numéros et
    // réattribuera les évaluations de tout le monde.
    assert.match(ref.noteNumerotation, /enregistrées par code|réattribuerait/u);
  });
});
