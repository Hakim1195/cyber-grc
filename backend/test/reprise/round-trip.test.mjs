/**
 * Le round-trip exact — la raison d'être de tout le reste.
 *
 * `CONVENTIONS.md` §2 : « les identifiants du fichier deviennent tels quels les
 * clés primaires, et les huit clés étrangères implicites continuent de pointer
 * sans table de correspondance ». Ce fichier le prouve dans les deux sens :
 * un export v12 sain traverse la chaîne **sans être modifié**, et l'aller-retour
 * reprise → enveloppe → reprise rend le même objet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chargeVersObjet,
  construireEnveloppe,
  reprendreExport,
  COLLECTIONS,
} from '../../src/reprise/index.ts';
import {
  fichier,
  identifiantsDe,
  instantaneV12Complet,
  OPTIONS_FIGEES,
} from './jeux-essai.mjs';

test('un export v12 sain traverse la chaîne sans être modifié', () => {
  const origine = instantaneV12Complet();
  const resultat = reprendreExport(fichier(12, origine), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise', resultat.message);
  assert.equal(resultat.rapport.paliers.length, 0, 'aucun palier à traverser');
  assert.deepEqual(resultat.rapport.normalisation, [], 'rien à normaliser');

  // L'objet reconstitué est identique à l'instantané d'origine, champ pour champ.
  assert.deepStrictEqual(chargeVersObjet(resultat.charge), origine);
});

test('un export v12 sain ne produit aucun avertissement', () => {
  const resultat = reprendreExport(fichier(12, instantaneV12Complet()), OPTIONS_FIGEES);

  const avertissements = resultat.rapport.anomalies.filter((a) => a.gravite === 'avertissement');
  assert.deepEqual(
    avertissements.map((a) => `${a.code} · ${a.message}`),
    [],
    'un fichier sain ne doit rien déclencher',
  );
  assert.equal(resultat.rapport.compteurs.avertissement, 0);
  assert.equal(resultat.rapport.compteurs.information, 0);
});

test('les identifiants du fichier deviennent tels quels ceux de la charge reprise', () => {
  const origine = instantaneV12Complet();
  const resultat = reprendreExport(fichier(12, origine), OPTIONS_FIGEES);

  assert.deepEqual(identifiantsDe(chargeVersObjet(resultat.charge)), identifiantsDe(origine));
});

test('aller-retour complet : reprise → enveloppe → reprise rend le même instantané', () => {
  const origine = instantaneV12Complet();

  const premier = reprendreExport(fichier(12, origine), OPTIONS_FIGEES);
  assert.equal(premier.statut, 'reprise');

  const renvoi = construireEnveloppe(premier.charge, OPTIONS_FIGEES);
  assert.equal(renvoi.format, 'grc-backup');
  assert.equal(renvoi.version, 12);
  assert.equal(renvoi.encrypted, false);
  assert.equal(renvoi.app, 'cyber-grc-dedienne');
  assert.equal(renvoi.createdAt, new Date(1_720_000_000_000).toISOString());

  const second = reprendreExport(JSON.stringify(renvoi), OPTIONS_FIGEES);
  assert.equal(second.statut, 'reprise');
  assert.deepStrictEqual(chargeVersObjet(second.charge), chargeVersObjet(premier.charge));
  assert.deepStrictEqual(chargeVersObjet(second.charge), origine);
});

test('les clés étrangères implicites continuent de pointer après reprise', () => {
  const resultat = reprendreExport(fichier(12, instantaneV12Complet()), OPTIONS_FIGEES);
  const { charge } = resultat;

  const action = charge.actions[0];
  assert.equal(action.exigence_id, charge.exigences[0].id);
  assert.equal(action.risque_id, charge.risques[0].id);
  assert.equal(action.evaluation_id, charge.evaluations[0].id);
  assert.equal(action.incident_id, charge.incidents[0].id);
  assert.equal(action.mesure_id, charge.mesures[0].id);

  assert.equal(charge.exigences[0].client_id, charge.clients[0].id);
  assert.equal(charge.tests_pra[0].scenario_id, charge.scenarios_pra[0].id);
  assert.equal(charge.incidents[0].risque_id, charge.risques[0].id);
  assert.deepEqual(charge.risques[0].exigences_liees, [charge.exigences[0].id]);
  assert.deepEqual(charge.actifs[0].risques_lies, [charge.risques[0].id]);
  assert.deepEqual(charge.actifs[0].dependances, [{ to: charge.actifs[1].id, type: 'hosted' }]);
  assert.deepEqual(charge.processus[0].actifs_lies, [charge.actifs[0].id]);
  assert.deepEqual(charge.incidents[0].actifs_touches, [charge.actifs[0].id]);
  assert.deepEqual(charge.evaluations[0].mesure_ids, [charge.mesures[0].id]);
  assert.deepEqual(charge.traitements[0].mesures_ids, [charge.mesures[0].id]);
});

test('les volumes du rapport recensent les 21 collections', () => {
  const resultat = reprendreExport(fichier(12, instantaneV12Complet()), OPTIONS_FIGEES);
  const { volumes } = resultat.rapport;

  assert.deepEqual(Object.keys(volumes), [...COLLECTIONS]);
  assert.equal(volumes.actifs, 2);
  assert.equal(volumes.clients, 1);
  assert.equal(volumes.mesures, 1);
  const total = Object.values(volumes).reduce((somme, n) => somme + n, 0);
  assert.equal(total, 22);
  assert.match(resultat.message, /22 enregistrement\(s\)/);
});

test('un identifiant ancien — sans suffixe aléatoire, sans préfixe — passe et n’est pas réécrit', () => {
  // Exactement les deux formes que `CONVENTIONS.md` §2 déclare admissibles.
  const origine = {
    schemaVersion: 12,
    actions: [{ id: 'ACT-1720000000000', titre: 'Action héritée', statut: 'à faire' }],
    processus: [{ id: 'processus-facturation', nom: 'Facturation' }],
  };
  const resultat = reprendreExport(fichier(12, origine), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.actions[0].id, 'ACT-1720000000000');
  assert.equal(resultat.charge.processus[0].id, 'processus-facturation');

  const codes = resultat.rapport.anomalies.map((a) => a.code);
  assert.ok(codes.includes('identifiant-sans-alea'));
  assert.ok(codes.includes('identifiant-sans-prefixe'));
  // Ces deux constats sont informatifs : le schéma les admet volontairement.
  for (const anomalie of resultat.rapport.anomalies) {
    if (anomalie.code === 'identifiant-sans-alea' || anomalie.code === 'identifiant-sans-prefixe') {
      assert.equal(anomalie.gravite, 'information');
    }
  }
});

test('une clé de premier niveau inconnue est conservée et restituée', () => {
  const origine = {
    schemaVersion: 12,
    clients: [{ id: 'CLI-1720000000000-1', nom: 'X', secteur: 'Y' }],
    extensionMaison: { compteur: 3 },
  };
  const resultat = reprendreExport(fichier(12, origine), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.deepEqual(resultat.charge.extras, { extensionMaison: { compteur: 3 } });
  assert.deepEqual(chargeVersObjet(resultat.charge).extensionMaison, { compteur: 3 });

  const signalee = resultat.rapport.anomalies.find((a) => a.code === 'champ-racine-inconnu');
  assert.ok(signalee);
  assert.equal(signalee.gravite, 'information');
  assert.equal(signalee.champ, 'extensionMaison');
});
