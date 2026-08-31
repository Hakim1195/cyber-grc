/**
 * Lecture de l'enveloppe `grc-backup` : ce qui est accepté, ce qui est refusé,
 * et surtout la distinction exigée par le lot entre un **fichier invalide** et
 * un **fichier valide mais non pris en charge**.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { lireEnveloppe, reprendreExport, VERSION_SCHEMA } from '../../src/reprise/index.ts';
import { anomalies, fichier, instantane, OPTIONS_FIGEES } from './jeux-essai.mjs';

test('enveloppe grc-backup en clair : lue, version et métadonnées relevées', () => {
  const entree = fichier(12, instantane(12, { clients: [{ id: 'CLI-1720000000000-1', nom: 'X' }] }));
  const lu = lireEnveloppe(entree, OPTIONS_FIGEES);

  assert.equal(lu.statut, 'lue');
  assert.equal(lu.enveloppe.forme, 'grc-backup');
  assert.equal(lu.enveloppe.versionOrigine, 12);
  assert.equal(lu.enveloppe.creeLe, '2026-08-31T09:00:00.000Z');
  assert.equal(lu.enveloppe.application, 'cyber-grc-dedienne');
});

test('ancien format encapsulé { data, schemaVersion } : reconnu, version relevée', () => {
  const entree = JSON.stringify({ data: { exigences: [], clients: [] }, schemaVersion: 4 });
  const lu = lireEnveloppe(entree, OPTIONS_FIGEES);

  assert.equal(lu.statut, 'lue');
  assert.equal(lu.enveloppe.forme, 'encapsulee');
  assert.equal(lu.enveloppe.versionOrigine, 4);
});

test('très ancien format plat : reconnu et réputé v1', () => {
  const entree = JSON.stringify({ exigences: [{ id: 'EX-1', code: 'A.1' }] });
  const lu = lireEnveloppe(entree, OPTIONS_FIGEES);

  assert.equal(lu.statut, 'lue');
  assert.equal(lu.enveloppe.forme, 'plate');
  assert.equal(lu.enveloppe.versionOrigine, 1);
});

test('enveloppe chiffrée : refus explicite, statut propre, message actionnable', () => {
  const entree = JSON.stringify({
    format: 'grc-backup',
    version: 12,
    encrypted: true,
    app: 'cyber-grc-dedienne',
    createdAt: '2026-08-31T09:00:00.000Z',
    kdf: { algo: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: 'c2VsLWZpY3RpZg==' },
    cipher: { algo: 'AES-GCM', iv: 'aXY=', ct: 'Y3Q=' },
  });
  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'chiffre');
  assert.equal(resultat.code, 'charge-chiffree');
  assert.match(resultat.message, /ne déchiffre pas/);
  assert.match(resultat.message, /export en clair/);
  // Un refus ne rend jamais de charge utile : rien à insérer.
  assert.equal(resultat.charge, undefined);
});

test('version postérieure à la v12 : non pris en charge, et non « invalide »', () => {
  const resultat = reprendreExport(fichier(VERSION_SCHEMA + 1, instantane(12)), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'non-pris-en-charge');
  assert.equal(resultat.code, 'version-posterieure');
  assert.match(resultat.message, /Mettez le serveur à jour/);
});

test('JSON illisible, entrées non objet : invalides, chacune avec son code', () => {
  const cas = [
    ['', 'json-illisible'],
    ['{ceci n’est pas du json}', 'json-illisible'],
    ['null', 'enveloppe-inconnue'],
    ['[]', 'enveloppe-inconnue'],
    ['"texte"', 'enveloppe-inconnue'],
    ['{}', 'enveloppe-inconnue'],
  ];
  for (const [entree, code] of cas) {
    const resultat = reprendreExport(entree, OPTIONS_FIGEES);
    assert.equal(resultat.statut, 'invalide', `entrée ${JSON.stringify(entree)}`);
    assert.equal(resultat.code, code, `entrée ${JSON.stringify(entree)}`);
  }
});

test('entrées qui ne sont ni texte ni objet : refus sans exception', () => {
  for (const entree of [null, undefined, 42, true, Symbol('x'), () => {}]) {
    const resultat = reprendreExport(entree, OPTIONS_FIGEES);
    assert.equal(resultat.statut, 'invalide');
    assert.equal(resultat.code, 'entree-inexploitable');
  }
});

test('collection présente mais qui n’est pas un tableau : refus nommant le champ fautif', () => {
  const entree = JSON.stringify({
    format: 'grc-backup',
    version: 12,
    encrypted: false,
    payload: { clients: [], exigences: null },
  });
  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'charge-non-reconnue');
  assert.match(resultat.message, /exigences/);
});

test('charge utile sans aucune collection connue : refusée', () => {
  const entree = JSON.stringify({ format: 'grc-backup', version: 12, encrypted: false, payload: { autre: [] } });
  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'charge-non-reconnue');
});

test('enveloppe sans charge utile : distinguée d’une charge non reconnue', () => {
  const entree = JSON.stringify({ format: 'grc-backup', version: 12, encrypted: false });
  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'charge-absente');
});

test('version absente ou inexploitable : reprise en v1, avec signalement', () => {
  const sansVersion = reprendreExport(
    JSON.stringify({ format: 'grc-backup', encrypted: false, payload: { exigences: [] } }),
    OPTIONS_FIGEES,
  );
  assert.equal(sansVersion.statut, 'reprise');
  assert.equal(sansVersion.rapport.versionOrigine, 1);

  const versionAbsurde = reprendreExport(
    JSON.stringify({ format: 'grc-backup', version: 'douze', encrypted: false, payload: { exigences: [] } }),
    OPTIONS_FIGEES,
  );
  assert.equal(versionAbsurde.statut, 'reprise');
  assert.equal(versionAbsurde.rapport.versionOrigine, 1);
  assert.equal(anomalies(versionAbsurde.rapport, 'version-declaree-incoherente').length, 1);
});

test('nom d’application inattendu : signalé, jamais bloquant', () => {
  const entree = fichier(12, instantane(12), { app: 'autre-outil' });
  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  const signalees = anomalies(resultat.rapport, 'application-inattendue');
  assert.equal(signalees.length, 1);
  assert.equal(signalees[0].gravite, 'information');
});

test('version de l’enveloppe et version de l’instantané divergentes : l’enveloppe fait foi', () => {
  const charge = instantane(12);
  charge.schemaVersion = 7;
  const resultat = reprendreExport(fichier(12, charge), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.rapport.versionOrigine, 12);
  assert.equal(anomalies(resultat.rapport, 'version-declaree-incoherente').length, 1);
});

test('un objet peut être fourni directement, sans passer par du texte', () => {
  const resultat = reprendreExport(
    { format: 'grc-backup', version: 12, encrypted: false, payload: instantane(12) },
    OPTIONS_FIGEES,
  );
  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.rapport.formeEnveloppe, 'grc-backup');
});
