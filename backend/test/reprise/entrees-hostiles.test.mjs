/**
 * Entrées hostiles.
 *
 * Le fichier repris vient d'une société rachetée : il peut être tronqué, mal
 * typé, porter des clés inattendues, ou avoir été fabriqué. Aucune de ces
 * entrées ne doit provoquer d'exception non maîtrisée, de récursion infinie ni
 * de consommation mémoire déraisonnable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { reprendreExport } from '../../src/reprise/index.ts';
import { anomalies, fichier, idEngendre, instantane, OPTIONS_FIGEES } from './jeux-essai.mjs';

/* =====================================================================
 *  Pollution de prototype
 * ===================================================================== */

test('« __proto__ » dans un enregistrement : retiré, signalé, prototype intact', () => {
  // Écrit à la main : `JSON.stringify` refuserait de produire cette clé.
  const entree =
    '{"format":"grc-backup","version":12,"encrypted":false,"payload":{"clients":[' +
    '{"id":"CLI-1720000000000-1","nom":"X","__proto__":{"pollue":"oui"}}]}}';

  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal({}.pollue, undefined, 'Object.prototype ne doit pas être pollué');
  assert.equal(Object.prototype.pollue, undefined);

  const client = resultat.charge.clients[0];
  assert.equal(Object.hasOwn(client, '__proto__'), false, 'la clé dangereuse est retirée');
  assert.equal(client.nom, 'X', 'le reste de l’enregistrement est conservé');

  const signalees = anomalies(resultat.rapport, 'cle-dangereuse');
  assert.equal(signalees.length, 1);
  assert.equal(signalees[0].gravite, 'avertissement');
  assert.match(signalees[0].message, /__proto__/);
});

test('« constructor » et « prototype » sont écartés au même titre', () => {
  const entree =
    '{"format":"grc-backup","version":12,"encrypted":false,"payload":{' +
    '"constructor":{"prototype":{"pollue":1}},' +
    '"clients":[{"id":"CLI-1720000000000-1","nom":"X","prototype":{"pollue":1}}]}}';

  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal({}.pollue, undefined);
  assert.equal(Object.hasOwn(resultat.charge.clients[0], 'prototype'), false);
  assert.equal(anomalies(resultat.rapport, 'cle-dangereuse').length, 2);
});

test('« __proto__ » au premier niveau de l’enveloppe : neutralisé sans casser la lecture', () => {
  const entree =
    '{"__proto__":{"format":"grc-backup"},"format":"grc-backup","version":12,' +
    '"encrypted":false,"payload":{"clients":[]}}';

  const resultat = reprendreExport(entree, OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal({}.format, undefined);
  assert.ok(anomalies(resultat.rapport, 'cle-dangereuse').length >= 1);
});

/* =====================================================================
 *  Bornes : profondeur, nœuds, taille, cycles
 * ===================================================================== */

test('imbrication absurde : bornée, signalée, jamais fatale', () => {
  let profond = { fond: true };
  for (let i = 0; i < 400; i += 1) profond = { niveau: profond };

  const resultat = reprendreExport(
    fichier(12, instantane(12, { clients: [{ id: 'CLI-1720000000000-1', nom: 'X', notes: profond }] })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(anomalies(resultat.rapport, 'profondeur-excessive').length, 1);
});

test('objet cyclique fourni directement : la borne de profondeur casse le cycle', () => {
  const cycle = { nom: 'boucle' };
  cycle.soiMeme = cycle;

  const resultat = reprendreExport(
    { format: 'grc-backup', version: 12, encrypted: false, payload: { clients: [{ id: 'CLI-1', nom: 'X', notes: cycle }] } },
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(anomalies(resultat.rapport, 'profondeur-excessive').length, 1);
});

test('structure au-delà du budget de nœuds : refusée avant de saturer la mémoire', () => {
  const clients = [];
  for (let i = 0; i < 200; i += 1) clients.push({ id: `CLI-${i}`, nom: `Client ${i}`, secteur: 'X' });

  const resultat = reprendreExport(fichier(12, instantane(12, { clients })), {
    ...OPTIONS_FIGEES,
    noeudsMax: 50,
  });

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'entree-trop-complexe');
});

test('fichier au-delà du plafond de taille : refusé sans être analysé', () => {
  const resultat = reprendreExport(fichier(12, instantane(12)), { ...OPTIONS_FIGEES, tailleMaxOctets: 10 });

  assert.equal(resultat.statut, 'invalide');
  assert.equal(resultat.code, 'entree-trop-volumineuse');
});

test('chaîne démesurée : conservée intégralement, mais signalée', () => {
  const enorme = 'a'.repeat(200_000);
  const resultat = reprendreExport(
    fichier(12, instantane(12, { clients: [{ id: 'CLI-1720000000000-1', nom: 'X', secteur: enorme }] })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.clients[0].secteur.length, 200_000, 'aucune troncature de la donnée');
  assert.equal(anomalies(resultat.rapport, 'texte-tres-long').length, 1);
});

test('le rapport lui-même est borné : au-delà du plafond, il le dit', () => {
  const clients = [];
  for (let i = 0; i < 40; i += 1) clients.push({ id: 'CLI-doublon', nom: `Client ${i}` });

  const resultat = reprendreExport(fichier(12, instantane(12, { clients })), {
    ...OPTIONS_FIGEES,
    anomaliesMax: 5,
  });

  assert.equal(resultat.statut, 'reprise');
  const derniere = resultat.rapport.anomalies.at(-1);
  assert.equal(derniere.code, 'anomalies-tronquees');
  assert.equal(resultat.rapport.anomalies.length, 6, '5 listées + la mention de troncature');
  assert.equal(resultat.rapport.compteurs.avertissement, 39, 'le compteur, lui, reste exact');
});

/* =====================================================================
 *  Enregistrements mal formés
 * ===================================================================== */

test('éléments d’une collection qui ne sont pas des objets : écartés et nommés', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, { clients: [1, 'texte', null, ['a'], { id: 'CLI-1720000000000-1', nom: 'X' }] })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.clients.length, 1);
  assert.equal(resultat.rapport.volumes.clients, 1);
  assert.equal(anomalies(resultat.rapport, 'enregistrement-illisible').length, 4);
});

test('enregistrement sans identifiant : un identifiant canonique est engendré et journalisé', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, { clients: [{ nom: 'Sans identifiant' }, { id: '   ', nom: 'Vide' }] })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.clients[0].id, idEngendre('CLI'));
  assert.equal(resultat.charge.clients[1].id, idEngendre('CLI'));

  const signalees = anomalies(resultat.rapport, 'identifiant-engendre');
  assert.equal(signalees.length, 2);
  assert.equal(signalees[0].gravite, 'avertissement');
  assert.match(signalees[0].message, /aucune référence existante ne pointe vers lui/);
});

test('identifiant numérique : converti en texte pour que les références tiennent', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      clients: [{ id: 4242, nom: 'X' }],
      exigences: [{ id: 'EX-1720000000000-1', client_id: 4242, code: 'A.1', statut_conformite: 'conforme' }],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.clients[0].id, '4242');
  // La référence numérique est comparée sous forme de texte : pas d'orpheline.
  assert.equal(anomalies(resultat.rapport, 'cle-etrangere-orpheline').length, 0);
  assert.ok(anomalies(resultat.rapport, 'type-inattendu').length >= 1);
});

test('identifiants en double : signalés, jamais réécrits', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      clients: [
        { id: 'CLI-1720000000000-1', nom: 'Premier' },
        { id: 'CLI-1720000000000-1', nom: 'Second' },
      ],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.clients[1].id, 'CLI-1720000000000-1', 'aucun renommage : le round-trip prime');
  const signalees = anomalies(resultat.rapport, 'identifiant-duplique');
  assert.equal(signalees.length, 1);
  assert.equal(signalees[0].gravite, 'avertissement');
});

test('identifiant plus long que le domaine id_metier : signalé, conservé tel quel', () => {
  const trop = `CLI-${'9'.repeat(70)}`;
  const resultat = reprendreExport(fichier(12, instantane(12, { clients: [{ id: trop, nom: 'X' }] })), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  assert.equal(resultat.charge.clients[0].id, trop);
  const signalees = anomalies(resultat.rapport, 'identifiant-trop-long');
  assert.equal(signalees.length, 1);
  assert.match(signalees[0].message, /64/);
});

/* =====================================================================
 *  Anomalies métier : ce que la base refusera
 * ===================================================================== */

test('clé étrangère implicite pointant dans le vide : signalée, collection par collection', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      actions: [{ id: 'ACT-1720000000000-1', titre: 'X', statut: 'à faire', exigence_id: 'EX-inexistante' }],
      tests_pra: [{ id: 'TEST-1720000000000-1', scenario_id: 'SCEN-disparu', date: '2026-01-01', succes: 'Oui' }],
      risques: [{ id: 'RISK-1720000000000-1', nom: 'X', exigences_liees: ['EX-fantome'] }],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  const orphelines = anomalies(resultat.rapport, 'cle-etrangere-orpheline');
  assert.equal(orphelines.length, 3);
  assert.deepEqual(orphelines.map((a) => a.collection).sort(), ['actions', 'risques', 'tests_pra']);
  // La donnée n'est pas modifiée : c'est à l'import du lot L2 de trancher.
  assert.equal(resultat.charge.tests_pra[0].scenario_id, 'SCEN-disparu');
});

test('valeur hors de la liste fermée : signalée avec la liste attendue', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      exigences: [{ id: 'EX-1720000000000-1', code: 'A.1', statut_conformite: 'à peu près conforme' }],
      incidents: [{ id: 'INC-1720000000000-1', titre: 'X', gravite: 'catastrophique', statut: 'nouveau' }],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  const horsListe = anomalies(resultat.rapport, 'valeur-hors-liste');
  assert.equal(horsListe.length, 2);
  assert.match(horsListe[0].message, /conforme · partiellement conforme · non conforme · non applicable/);
});

test('maturité, avancement et date hors normes : signalés séparément', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      mesures: [{ id: 'MESURE-1720000000000-1', nom: 'X', statut: 'conforme', maturite: 9 }],
      mco_actions: [{ id: 'MCO-1720000000000-1', titre: 'X', statut: 'En cours', avancement: 250, datePrevue: 'demain' }],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(anomalies(resultat.rapport, 'nombre-invalide').length, 2);
  assert.equal(anomalies(resultat.rapport, 'date-invalide').length, 1);
});

test('cartographie : lien vers un actif inconnu, type inconnu, dépendance à soi-même', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      actifs: [
        {
          id: 'ACTIF-1720000000000-1',
          nom: 'Serveur',
          dependances: [
            { to: 'ACTIF-disparu', type: 'dep' },
            { to: 'ACTIF-1720000000000-1', type: 'dep' },
            { to: 'ACTIF-1720000000000-1', type: 'télépathie' },
            'pas un objet',
          ],
        },
      ],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(anomalies(resultat.rapport, 'cle-etrangere-orpheline').length, 1);
  assert.equal(anomalies(resultat.rapport, 'valeur-hors-liste').length, 3, 'deux auto-dépendances + un type inconnu');
  assert.ok(anomalies(resultat.rapport, 'type-inattendu').length >= 1);
});

test('clé métier en double : évaluations sur (ref_id, code), historique sur la date', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      evaluations: [
        { id: 'EVAL-1720000000000-1', ref_id: 'anssi-hygiene', code: '22', statut: 'conforme', maturite: 4, mesure_ids: [] },
        { id: 'EVAL-1720000000000-2', ref_id: 'anssi-hygiene', code: '22', statut: 'non conforme', maturite: 0, mesure_ids: [] },
      ],
      history: [
        { id: 'HIST-1720000000000-1', ts: 1, date: '2026-08-30', metrics: {} },
        { id: 'HIST-1720000000000-2', ts: 2, date: '2026-08-30', metrics: {} },
      ],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  const doublons = anomalies(resultat.rapport, 'cle-metier-dupliquee');
  assert.equal(doublons.length, 2);
  assert.deepEqual(doublons.map((a) => a.collection).sort(), ['evaluations', 'history']);
});

test('champ inconnu : signalé une seule fois, quel que soit le nombre d’enregistrements', () => {
  const clients = [];
  for (let i = 0; i < 50; i += 1) clients.push({ id: `CLI-1720000000000-${i}`, nom: 'X', champLegacy: i });

  const resultat = reprendreExport(fichier(12, instantane(12, { clients })), OPTIONS_FIGEES);

  assert.equal(resultat.statut, 'reprise');
  const signalees = anomalies(resultat.rapport, 'champ-inconnu');
  assert.equal(signalees.length, 1);
  assert.equal(signalees[0].gravite, 'information');
  assert.equal(signalees[0].champ, 'champLegacy');
  // Le champ est conservé : à L2 de décider s'il a une colonne où atterrir.
  assert.equal(resultat.charge.clients[0].champLegacy, 0);
});

test('tableau d’identifiants remplacé par autre chose : signalé, non converti', () => {
  const resultat = reprendreExport(
    fichier(12, instantane(12, {
      risques: [{ id: 'RISK-1720000000000-1', nom: 'X', exigences_liees: 'EX-1720000000000-1' }],
      mappings: [{ id: 'MAP-1720000000000-1', theme: 'X', refs: 'pas un objet' }],
    })),
    OPTIONS_FIGEES,
  );

  assert.equal(resultat.statut, 'reprise');
  assert.equal(anomalies(resultat.rapport, 'type-inattendu').length, 2);
});

test('rien ne lève : une centaine d’entrées absurdes rendent toutes un statut', () => {
  const absurdites = [
    '', '0', 'false', '[]', '{}', 'null', '"x"', '{"format":"grc-backup"}',
    '{"format":"grc-backup","version":-3,"encrypted":false,"payload":{"clients":[]}}',
    '{"format":"grc-backup","version":0,"encrypted":false,"payload":{"clients":[]}}',
    '{"format":"grc-backup","version":1e9,"encrypted":false,"payload":{"clients":[]}}',
    '{"format":"grc-backup","encrypted":"oui","payload":{"clients":[]}}',
    '{"data":{"exigences":"non"}}',
    '{"exigences":{}}',
    '{"exigences":[[[[]]]]}',
    '{"format":"grc-backup","version":12,"encrypted":false,"payload":[]}',
    '{"format":"grc-backup","version":12,"encrypted":false,"payload":{"clients":[[]]}}',
  ];

  for (const entree of absurdites) {
    const resultat = reprendreExport(entree, OPTIONS_FIGEES);
    assert.ok(
      ['reprise', 'invalide', 'non-pris-en-charge', 'chiffre'].includes(resultat.statut),
      `statut inattendu pour ${entree}`,
    );
    assert.equal(typeof resultat.message, 'string');
    assert.ok(resultat.message.length > 0);
  }
});
