/**
 * Pré-analyse lexicale de la reprise — correctif du constat **m-5** de la porte
 * de sécurité S1 (`docs/securite/RAPPORT_S1.md`).
 *
 * Ce que ces cas d'essai prouvent, et rien d'autre :
 *
 *  1. le balayage **compte comme `assainir`** — même nombre de valeurs JSON,
 *     même coupure de profondeur — sinon il refuserait des fichiers légitimes ;
 *  2. il **s'arrête au budget**, ce qui se constate sans chronomètre grâce à
 *     `caracteresLus` : sur une entrée hostile, le balayage lit une fraction du
 *     fichier et rend la main ;
 *  3. le **comportement public est inchangé** : mêmes statuts, mêmes codes de
 *     refus, et le module ne lève toujours pas.
 *
 * Les échappements de chaîne sont éprouvés séparément : c'est le seul endroit
 * où un compteur naïf se ferait berner (un guillemet échappé pris pour une fin
 * de chaîne décale tout le comptage).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { preAnalyserJson, lireEnveloppe, reprendreExport } from '../../src/reprise/index.ts';
import { fichier, instantane, OPTIONS_FIGEES } from './jeux-essai.mjs';

/** Profondeur maximale d'`assainir` (`PROFONDEUR_MAX`), reprise ici en dur. */
const PROFONDEUR_MAX = 16;

/**
 * Compteur de référence : parcourt la valeur **déjà analysée** avec les règles
 * d'`assainir` — une valeur comptée par appel, plus de descente au-delà de
 * `PROFONDEUR_MAX`. C'est le nombre que le balayage doit retrouver sans jamais
 * construire l'arbre.
 */
function compterReference(valeur, profondeur = 0) {
  let total = 1;
  if (profondeur >= PROFONDEUR_MAX || valeur === null || typeof valeur !== 'object') return total;
  if (Array.isArray(valeur)) {
    for (const element of valeur) total += compterReference(element, profondeur + 1);
    return total;
  }
  for (const cle of Object.keys(valeur)) total += compterReference(valeur[cle], profondeur + 1);
  return total;
}

/* =====================================================================
 *  Le comptage est exact
 * ===================================================================== */

test('le balayage compte exactement les valeurs JSON, comme le fait `assainir`', () => {
  const cas = [
    'null',
    '42',
    '-3.5e-7',
    '"texte"',
    'true',
    '[]',
    '{}',
    '[[],[],[]]',
    '{"a":1,"b":[1,2,3],"c":{"d":null}}',
    '[{"x":[{"y":[1,{"z":"fin"}]}]}]',
    '{"vide":[],"objetVide":{},"melange":[0,"a",false,null,{"k":[1]}]}',
    '  {\n  "a" : [ 1 , 2 ]\n}\t',
    '{"nombre":1e10,"negatif":-0.5,"grand":123456789}',
  ];

  for (const texte of cas) {
    const attendu = compterReference(JSON.parse(texte));
    assert.equal(preAnalyserJson(texte).noeuds, attendu, `comptage de ${texte}`);
  }
});

test('un instantané v12 complet est compté au nœud près', () => {
  const texte = fichier(12, instantane(12, {
    clients: [{ id: 'CLI-1720000000000-1', nom: 'X', secteur: 'Aéronautique' }],
    risques: [{ id: 'RISK-1', intitule: 'R', gravite: 3, vraisemblance: 2, mesures: ['a', 'b'] }],
  }));

  assert.equal(preAnalyserJson(texte).noeuds, compterReference(JSON.parse(texte)));
});

test('les échappements de chaîne ne décalent pas le comptage', () => {
  const cas = [
    String.raw`{"a":"guillemet \" au milieu","b":1}`,
    String.raw`{"a":"antislash final \\","b":1}`,
    String.raw`{"a":"\\\" les deux","b":1}`,
    String.raw`{"cle \" echappee":1}`,
    String.raw`{"a":"accolade { et crochet [ et virgule , et deux-points :"}`,
    String.raw`["échappé",   "\n\t",  "\\\\"]`,
  ];

  for (const texte of cas) {
    const attendu = compterReference(JSON.parse(texte));
    assert.equal(preAnalyserJson(texte).noeuds, attendu, `comptage de ${texte}`);
  }
});

test('les valeurs au-delà de la profondeur admise ne sont pas comptées, des deux côtés', () => {
  let profond = { fond: true };
  for (let i = 0; i < 60; i += 1) profond = { niveau: profond };
  const texte = JSON.stringify(profond);

  const attendu = compterReference(JSON.parse(texte));
  assert.equal(preAnalyserJson(texte).noeuds, attendu);
  // La coupure est bien celle d'`assainir` : 17 valeurs (profondeurs 0 à 16) et
  // pas les 62 que porte réellement le fichier.
  assert.equal(attendu, PROFONDEUR_MAX + 1);
});

/* =====================================================================
 *  L'arrêt au budget, et son coût
 * ===================================================================== */

test('le balayage rend la main au premier nœud au-delà du budget', () => {
  const texte = JSON.stringify({ a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });

  const verdict = preAnalyserJson(texte, 4);
  assert.equal(verdict.budgetDepasse, true);
  assert.equal(verdict.noeuds, 5); // le budget est dépassé au cinquième nœud
  assert.ok(verdict.caracteresLus < texte.length, 'le fichier n’est pas lu jusqu’au bout');
});

test('entrée hostile volumineuse : refusée après lecture d’une fraction du fichier', () => {
  // Vingt-quatre mébioctets d'enregistrements minuscules : beaucoup de nœuds
  // pour peu d'octets, exactement le profil qui faisait exploser la mémoire.
  const morceaux = ['{"format":"grc-backup","version":12,"encrypted":false,"payload":{"schemaVersion":12,"clients":['];
  let taille = morceaux[0].length;
  for (let i = 0; taille < 24 * 1024 * 1024; i += 1) {
    const bloc = `${i ? ',' : ''}{"id":"CLI-${i}","nom":"C${i}","secteur":"A"}`;
    morceaux.push(bloc);
    taille += bloc.length;
  }
  morceaux.push(']}}');
  const texte = morceaux.join('');

  const verdict = preAnalyserJson(texte, 50_000);
  assert.equal(verdict.budgetDepasse, true);
  assert.ok(
    verdict.caracteresLus * 20 < texte.length,
    `arrêt anticipé attendu : ${verdict.caracteresLus} caractères lus sur ${texte.length}`,
  );

  // Et le refus rendu par le module est celui d'avant le correctif, au mot près.
  const avant = process.memoryUsage().heapUsed;
  const resultat = reprendreExport(texte, { ...OPTIONS_FIGEES, noeudsMax: 50_000 });
  const consomme = process.memoryUsage().heapUsed - avant;

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'entree-trop-complexe');
  assert.match(resultat.message, /50000 nœuds JSON/);
  // Avant le correctif, ce refus passait par l'arbre complet : le tas enflait de
  // plusieurs centaines de mébioctets. La marge est large à dessein — c'est un
  // ordre de grandeur qui est vérifié, pas une valeur.
  assert.ok(consomme < 32 * 1024 * 1024, `tas consommé par un refus : ${consomme} octets`);
});

/* =====================================================================
 *  Le comportement public est inchangé
 * ===================================================================== */

test('un export sain traverse le balayage sans être modifié', () => {
  const entree = fichier(12, instantane(12, { clients: [{ id: 'CLI-1720000000000-1', nom: 'X' }] }));

  assert.equal(preAnalyserJson(entree).budgetDepasse, false);
  const lu = lireEnveloppe(entree, OPTIONS_FIGEES);
  assert.equal(lu.statut, 'lue');
  assert.equal(lu.enveloppe.versionOrigine, 12);
});

test('le plafond de taille prime toujours sur le budget de nœuds', () => {
  const resultat = reprendreExport(fichier(12, instantane(12)), {
    ...OPTIONS_FIGEES,
    tailleMaxOctets: 10,
    noeudsMax: 1,
  });

  assert.equal(resultat.code, 'entree-trop-volumineuse');
});

test('une entrée fournie en objet reste bornée par la copie assainie', () => {
  // Pas de texte à balayer : c'est `assainir` qui applique le budget, comme
  // avant le correctif. Le verdict public doit être le même.
  const clients = [];
  for (let i = 0; i < 200; i += 1) clients.push({ id: `CLI-${i}`, nom: `Client ${i}` });

  const resultat = reprendreExport(
    { format: 'grc-backup', version: 12, encrypted: false, payload: { schemaVersion: 12, clients } },
    { ...OPTIONS_FIGEES, noeudsMax: 50 },
  );

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'entree-trop-complexe');
});

test('un texte illisible reste refusé pour ce qu’il est, pas pour son volume', () => {
  const resultat = reprendreExport('{"format":"grc-backup", "payload": {', OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'json-illisible');
});

test('divergence assumée : une racine non-objet hors budget est dite « trop complexe »', () => {
  // Reconnaître la forme du fichier suppose l'arbre — c'est précisément ce que
  // le correctif refuse de payer. Le fichier reste refusé (`invalide`) ; seul le
  // message change. Ce cas est ici pour que la divergence reste visible.
  const tableau = JSON.stringify(Array.from({ length: 200 }, (_, i) => i));

  const horsBudget = lireEnveloppe(tableau, { noeudsMax: 20 });
  assert.equal(horsBudget.statut, 'invalide');
  assert.equal(horsBudget.code, 'entree-trop-complexe');

  const dansBudget = lireEnveloppe(tableau, { noeudsMax: 5000 });
  assert.equal(dansBudget.statut, 'invalide');
  assert.equal(dansBudget.code, 'enveloppe-inconnue');
});
