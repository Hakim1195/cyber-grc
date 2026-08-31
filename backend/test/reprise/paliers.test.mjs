/**
 * La chaîne de migration v1 → v12, palier par palier.
 *
 * Un cas par palier, chacun vérifiant **ce que le palier rattrape** et non
 * seulement qu'il figure au rapport. La sémantique est celle de `normalize()`
 * du frontend : ce sont les mêmes transformations, portées telles quelles.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { reprendreExport } from '../../src/reprise/index.ts';
import { fichier, instantane, OPTIONS_FIGEES, palier } from './jeux-essai.mjs';

/** Reprend un instantané de la version donnée et rend le résultat, réputé accepté. */
function reprendre(version, surcharges = {}) {
  const resultat = reprendreExport(fichier(version, instantane(version, surcharges)), OPTIONS_FIGEES);
  assert.equal(resultat.statut, 'reprise', resultat.message);
  return resultat;
}

test('v1 → v2 : audits et revues rejoignent l’instantané unifié', () => {
  const { rapport, charge } = reprendre(1);
  const etape = palier(rapport, 1, 2);

  assert.ok(etape, 'le palier v1 → v2 doit figurer au rapport');
  assert.deepEqual(etape.effets.sort(), [
    'tableau « audits » absent du fichier, créé vide',
    'tableau « revues » absent du fichier, créé vide',
  ]);
  assert.deepEqual(charge.audits, []);
  assert.deepEqual(charge.revues, []);
  // Une v1 traverse les onze paliers.
  assert.equal(rapport.paliers.length, 11);
  assert.equal(rapport.versionOrigine, 1);
  assert.equal(rapport.versionCible, 12);
});

test('v2 → v3 : évaluations de référentiels et pivot « Mesure de sécurité »', () => {
  const { rapport, charge } = reprendre(2);

  assert.equal(palier(rapport, 1, 2), undefined, 'une v2 ne traverse pas le palier v1 → v2');
  assert.deepEqual(palier(rapport, 2, 3).effets.sort(), [
    'tableau « evaluations » absent du fichier, créé vide',
    'tableau « mesures » absent du fichier, créé vide',
  ]);
  assert.deepEqual(charge.evaluations, []);
  assert.deepEqual(charge.mesures, []);
  assert.equal(rapport.paliers.length, 10);
});

test('v3 → v4 : registre des incidents', () => {
  const { rapport, charge } = reprendre(3);

  assert.equal(palier(rapport, 2, 3), undefined, 'une v3 ne traverse pas le palier v2 → v3');
  assert.deepEqual(palier(rapport, 3, 4).effets, ['tableau « incidents » absent du fichier, créé vide']);
  assert.deepEqual(charge.incidents, []);
});

test('v4 → v5 : registre documentaire', () => {
  const { rapport, charge } = reprendre(4);

  assert.equal(palier(rapport, 3, 4), undefined, 'une v4 ne traverse pas le palier v3 → v4');
  assert.deepEqual(palier(rapport, 4, 5).effets, ['tableau « documents » absent du fichier, créé vide']);
  assert.deepEqual(charge.documents, []);
});

test('v5 → v6 : registre RGPD des traitements (article 30)', () => {
  const { rapport, charge } = reprendre(5);

  assert.equal(palier(rapport, 4, 5), undefined, 'une v5 ne traverse pas le palier v4 → v5');
  assert.deepEqual(palier(rapport, 5, 6).effets, ['tableau « traitements » absent du fichier, créé vide']);
  assert.deepEqual(charge.traitements, []);
});

test('v6 → v7 : surcouche des correspondances inter-référentiels', () => {
  const { rapport, charge } = reprendre(6);

  assert.equal(palier(rapport, 5, 6), undefined, 'une v6 ne traverse pas le palier v5 → v6');
  assert.deepEqual(palier(rapport, 6, 7).effets, ['tableau « mappings » absent du fichier, créé vide']);
  assert.deepEqual(charge.mappings, []);
});

test('v7 → v8 : historique des indicateurs', () => {
  const { rapport, charge } = reprendre(7);

  assert.equal(palier(rapport, 6, 7), undefined, 'une v7 ne traverse pas le palier v6 → v7');
  assert.deepEqual(palier(rapport, 7, 8).effets, ['tableau « history » absent du fichier, créé vide']);
  assert.deepEqual(charge.history, []);
});

test('v8 → v9 : chaque actif reçoit son tableau « dependances »', () => {
  const { rapport, charge } = reprendre(8, {
    actifs: [
      { id: 'ACTIF-1720000000000-1', nom: 'Serveur', type: 'Matériel', criticite: 'élevée' },
      { id: 'ACTIF-1720000000000-2', nom: 'Hyperviseur', type: 'Service', criticite: 'critique' },
    ],
  });

  assert.equal(palier(rapport, 7, 8), undefined, 'une v8 ne traverse pas le palier v7 → v8');
  assert.deepEqual(palier(rapport, 8, 9).effets, ['2 actif(s) doté(s) du tableau « dependances »']);
  assert.deepEqual(charge.actifs[0].dependances, []);
  assert.deepEqual(charge.actifs[1].dependances, []);
});

test('v8 → v9 : un actif portant déjà ses dépendances n’est pas touché', () => {
  const dependances = [{ to: 'ACTIF-1720000000000-2', type: 'hosted' }];
  const { rapport, charge } = reprendre(8, {
    actifs: [
      { id: 'ACTIF-1720000000000-1', nom: 'Serveur', type: 'Matériel', criticite: 'élevée', dependances },
      { id: 'ACTIF-1720000000000-2', nom: 'Hyperviseur', type: 'Service', criticite: 'critique', dependances: [] },
    ],
  });

  assert.deepEqual(palier(rapport, 8, 9).effets, []);
  assert.deepEqual(charge.actifs[0].dependances, dependances);
});

test('v9 → v10 : l’ancien MCO { etat, date, notes } devient un suivi d’action planifiée', () => {
  const { rapport, charge } = reprendre(9, {
    mco_actions: [
      { id: 'MCO-1720000000000-1', titre: 'Test de restauration', etat: 'OK', date: '2025-11-02', notes: 'RAS' },
      { id: 'MCO-1720000000000-2', titre: 'Revue des accès', etat: 'KO', date: '', notes: 'À reprendre' },
      { id: 'MCO-1720000000000-3', titre: 'Mise à jour des serveurs' },
    ],
  });

  assert.equal(palier(rapport, 8, 9), undefined, 'une v9 ne traverse pas le palier v8 → v9');
  assert.equal(palier(rapport, 9, 10).effets.length, 1);
  assert.match(palier(rapport, 9, 10).effets[0], /^3 action\(s\) MCO converties/);

  const [ok, ko, vierge] = charge.mco_actions;

  // OK → « Réalisée » à 100 %, date reportée, notes devenues commentaire.
  assert.equal(ok.statut, 'Réalisée');
  assert.equal(ok.avancement, 100);
  assert.equal(ok.dateReelle, '2025-11-02');
  assert.equal(ok.commentaire, 'RAS');

  // KO → « En cours », avancement remis à zéro.
  assert.equal(ko.statut, 'En cours');
  assert.equal(ko.avancement, 0);
  assert.equal(ko.commentaire, 'À reprendre');

  // Ni OK ni KO → « À planifier ».
  assert.equal(vierge.statut, 'À planifier');
  assert.equal(vierge.avancement, 0);

  // Les trois clés obsolètes sont purgées après recopie — aucune perte.
  for (const action of charge.mco_actions) {
    assert.equal(Object.hasOwn(action, 'etat'), false);
    assert.equal(Object.hasOwn(action, 'date'), false);
    assert.equal(Object.hasOwn(action, 'notes'), false);
    // Le modèle de suivi est complet.
    for (const champ of ['description', 'responsable', 'priorite', 'frequence', 'datePrevue', 'dateCloture']) {
      assert.equal(Object.hasOwn(action, champ), true, `${action.id} doit porter « ${champ} »`);
    }
    assert.equal(action.priorite, 'Moyenne');
    assert.equal(action.frequence, 'Ponctuelle');
  }
});

test('v10 → v11 : annuaire des personnes, sans toucher aux responsables déjà saisis', () => {
  const { rapport, charge } = reprendre(10, {
    actions: [
      {
        id: 'ACT-1720000000000-1',
        titre: 'Rédiger la PSSI',
        statut: 'à faire',
        responsable: 'Personne fictive',
        echeance: '2026-01-31',
      },
    ],
  });

  assert.equal(palier(rapport, 9, 10), undefined, 'une v10 ne traverse pas le palier v9 → v10');
  assert.deepEqual(palier(rapport, 10, 11).effets, ['tableau « personnes » absent du fichier, créé vide']);
  assert.deepEqual(charge.personnes, []);
  // Le responsable reste du texte : l'annuaire n'est qu'une source de suggestions.
  assert.equal(charge.actions[0].responsable, 'Personne fictive');
});

test('v11 → v12 : « mesure_id » unique devient « mesure_ids[] »', () => {
  const { rapport, charge } = reprendre(11, {
    mesures: [{ id: 'MESURE-1720000000000-1', nom: 'Chiffrement', statut: 'conforme', maturite: 4 }],
    evaluations: [
      { id: 'EVAL-1720000000000-1', ref_id: 'anssi-hygiene', code: '22', statut: 'conforme', maturite: 4, mesure_id: 'MESURE-1720000000000-1' },
      { id: 'EVAL-1720000000000-2', ref_id: 'anssi-hygiene', code: '23', statut: '', maturite: 0, mesure_id: '' },
      { id: 'EVAL-1720000000000-3', ref_id: 'anssi-hygiene', code: '24', statut: '', maturite: 0, mesure_id: null },
      { id: 'EVAL-1720000000000-4', ref_id: 'anssi-hygiene', code: '25', statut: '', maturite: 0 },
    ],
  });

  assert.equal(palier(rapport, 10, 11), undefined, 'une v11 ne traverse pas le palier v10 → v11');
  assert.deepEqual(palier(rapport, 11, 12).effets, [
    '4 évaluation(s) dont « mesure_id » est devenu « mesure_ids[] »',
  ]);

  assert.deepEqual(charge.evaluations[0].mesure_ids, ['MESURE-1720000000000-1']);
  assert.deepEqual(charge.evaluations[1].mesure_ids, [], 'une chaîne vide ne fait pas un lien');
  assert.deepEqual(charge.evaluations[2].mesure_ids, [], 'null ne fait pas un lien');
  assert.deepEqual(charge.evaluations[3].mesure_ids, [], 'absence de lien');

  for (const evaluation of charge.evaluations) {
    assert.equal(Object.hasOwn(evaluation, 'mesure_id'), false, 'l’ancienne clé est purgée');
  }
});

test('reprise d’un bout en bout : une v1 arrive en v12 avec ses 21 collections', () => {
  const { rapport, charge } = reprendre(1);

  assert.equal(charge.schemaVersion, 12);
  assert.equal(rapport.paliers.length, 11);
  assert.equal(Object.keys(rapport.volumes).length, 21);
  // Les onze paliers se suivent sans trou : 1→2, 2→3, … 11→12.
  rapport.paliers.forEach((etape, rang) => {
    assert.equal(etape.de, rang + 1);
    assert.equal(etape.vers, rang + 2);
    assert.ok(etape.libelle.length > 20, 'chaque palier dit ce qu’il rattrape');
  });
});

test('un fichier qui ment sur sa version est rattrapé, et le mensonge est signalé', () => {
  // Se déclare en v12 mais porte encore l'ancien modèle MCO et l'ancien lien unique.
  const charge = instantane(12, {
    mesures: [{ id: 'MESURE-1720000000000-1', nom: 'Chiffrement', statut: 'conforme', maturite: 4 }],
    mco_actions: [{ id: 'MCO-1720000000000-1', titre: 'Test', etat: 'OK', date: '2025-11-02', notes: 'RAS' }],
    evaluations: [
      { id: 'EVAL-1720000000000-1', ref_id: 'anssi-hygiene', code: '22', statut: 'conforme', maturite: 4, mesure_id: 'MESURE-1720000000000-1' },
    ],
    actifs: [{ id: 'ACTIF-1720000000000-1', nom: 'Serveur', type: 'Matériel', criticite: 'élevée' }],
  });
  const resultat = reprendreExport(fichier(12, charge), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.rapport.paliers.length, 0, 'une v12 déclarée ne traverse aucun palier');
  assert.equal(resultat.rapport.normalisation.length, 3);
  assert.equal(resultat.charge.mco_actions[0].statut, 'Réalisée');
  assert.deepEqual(resultat.charge.evaluations[0].mesure_ids, ['MESURE-1720000000000-1']);
  assert.deepEqual(resultat.charge.actifs[0].dependances, []);

  const signalee = resultat.rapport.anomalies.find((a) => a.code === 'version-declaree-incoherente');
  assert.ok(signalee, 'l’incohérence de version doit être signalée');
  assert.equal(signalee.gravite, 'avertissement');
});
