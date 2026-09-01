/**
 * Scission des mesures — `CONVENTIONS.md` §16.2 et §16.3.
 *
 * Un export porte **un seul** tableau `mesures`, qui mélange la définition du
 * contrôle (niveau Groupe) et son évaluation (niveau Filiale). La reprise rend
 * les deux collections, et surtout : l'identifiant `MESURE-…` du fichier reste
 * la clé du catalogue, parce que c'est lui que visent `actions.mesure_id`,
 * `evaluation_mesures` et `traitement_mesures`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { reprendreExport, scinderMesures } from '../../src/reprise/index.ts';
import {
  estIdentifiantEngendre,
  fichier,
  instantane,
  instantaneV12Complet,
  OPTIONS_FIGEES,
} from './jeux-essai.mjs';

function repriseAvecMesures(mesures, autres = {}) {
  const resultat = reprendreExport(fichier(12, instantane(12, { mesures, ...autres })), OPTIONS_FIGEES);
  assert.equal(resultat.statut, 'reprise', resultat.message);
  return resultat;
}

test('la définition garde l’identifiant du fichier, la mise en œuvre en reçoit un neuf', () => {
  const { mesures } = repriseAvecMesures([
    {
      id: 'MESURE-1720000000000-1',
      nom: 'Chiffrement des postes de travail',
      description: 'Contrôle fictif.',
      statut: 'partiellement conforme',
      maturite: 3,
      responsable: 'Personne fictive',
      updatedAt: 1_700_000_000_000,
    },
  ]);

  assert.deepEqual(mesures.catalogue, [
    {
      id: 'MESURE-1720000000000-1',
      nom: 'Chiffrement des postes de travail',
      description: 'Contrôle fictif.',
    },
  ]);

  // L'identifiant de la mise en œuvre est ENGENDRÉ : il n'existe dans aucun export
  // (le §16.3 le veut ainsi). On l'écarte de la comparaison de contenu et on
  // l'éprouve pour ce qu'il est — une propriété, pas une valeur : sa forme était
  // épinglée au caractère près, et le correctif du constat Q-1 l'a rendue rouge
  // sans qu'aucune garantie n'ait bougé.
  assert.equal(mesures.miseEnOeuvre.length, 1);
  const [mise] = mesures.miseEnOeuvre;
  assert.ok(estIdentifiantEngendre('MMO', mise.id), `Identifiant hors convention : ${String(mise.id)}`);
  assert.deepEqual(
    { ...mise, id: undefined },
    {
      id: undefined,
      mesure_id: 'MESURE-1720000000000-1',
      statut: 'partiellement conforme',
      maturite: 3,
      responsable: 'Personne fictive',
      commentaire: '',
      updatedAt: 1_700_000_000_000,
    },
  );
});

test('une mise en œuvre par mesure, et une seule — l’unicité (filiale, mesure) est tenable', () => {
  const { mesures, rapport } = repriseAvecMesures([
    { id: 'MESURE-1720000000000-1', nom: 'A', statut: 'conforme', maturite: 5 },
    { id: 'MESURE-1720000000000-2', nom: 'B', statut: '', maturite: 0 },
    { id: 'MESURE-1720000000000-3', nom: 'C', statut: 'non applicable', maturite: 0 },
  ]);

  assert.equal(mesures.catalogue.length, 3);
  assert.equal(mesures.miseEnOeuvre.length, 3);
  assert.deepEqual(mesures.miseEnOeuvre.map((m) => m.mesure_id), mesures.catalogue.map((m) => m.id));
  assert.equal(new Set(mesures.miseEnOeuvre.map((m) => m.mesure_id)).size, 3);
  assert.deepEqual(rapport.volumesMesures, { catalogue: 3, miseEnOeuvre: 3 });
});

test('le préfixe MMO n’existe dans aucun export : il est engendré ici', () => {
  const origine = instantaneV12Complet();
  const resultat = reprendreExport(fichier(12, origine), OPTIONS_FIGEES);

  // On éprouve la PROPRIÉTÉ, pas la mise en forme. La rédaction précédente
  // épinglait « MMO-<chiffres>-<chiffres> » ; le suffixe est passé en base 36 au
  // quatrième passage de la porte (constat Q-1), et cette assertion serait devenue
  // rouge sans qu'aucune garantie n'ait bougé. Ce qui doit tenir : le préfixe de
  // l'entité, l'unicité, et la recevabilité par le domaine « id_metier ».
  const vus = new Set();
  for (const mise of resultat.mesures.miseEnOeuvre) {
    assert.ok(mise.id.startsWith('MMO-'), `Préfixe attendu : ${mise.id}`);
    assert.ok(mise.id.length > 4 && mise.id.length <= 64, `Longueur hors domaine : ${mise.id}`);
    assert.equal(mise.id.trim(), mise.id, `Blanc de bord : ${mise.id}`);
    assert.equal(mise.id.includes(','), false, `Virgule refusée par « id_metier » : ${mise.id}`);
    assert.equal(vus.has(mise.id), false, `Identifiant engendré deux fois : ${mise.id}`);
    vus.add(mise.id);
  }
  // Aucun MMO- ne figure dans le fichier d'origine.
  assert.equal(JSON.stringify(origine).includes('MMO-'), false);
});

test('la collection « mesures » de la charge n’est pas consommée : le round-trip reste exact', () => {
  const mesure = {
    id: 'MESURE-1720000000000-1',
    nom: 'Chiffrement',
    description: 'Contrôle fictif.',
    statut: 'conforme',
    maturite: 5,
    responsable: 'Personne fictive',
    updatedAt: 1_700_000_000_000,
  };
  const { charge } = repriseAvecMesures([mesure]);

  assert.deepStrictEqual(charge.mesures, [mesure]);
});

test('les trois liens vers « une mesure » visent le catalogue, sans traduction', () => {
  const { charge, mesures } = repriseAvecMesures(
    [{ id: 'MESURE-1720000000000-1', nom: 'Chiffrement', statut: 'conforme', maturite: 5 }],
    {
      actions: [{ id: 'ACT-1720000000000-1', titre: 'X', statut: 'à faire', mesure_id: 'MESURE-1720000000000-1' }],
      evaluations: [
        {
          id: 'EVAL-1720000000000-1',
          ref_id: 'anssi-hygiene',
          code: '22',
          statut: 'conforme',
          maturite: 5,
          mesure_ids: ['MESURE-1720000000000-1'],
        },
      ],
      traitements: [{ id: 'TRT-1720000000000-1', nom: 'X', mesures_ids: ['MESURE-1720000000000-1'] }],
    },
  );

  const idCatalogue = mesures.catalogue[0].id;
  assert.equal(charge.actions[0].mesure_id, idCatalogue);
  assert.deepEqual(charge.evaluations[0].mesure_ids, [idCatalogue]);
  assert.deepEqual(charge.traitements[0].mesures_ids, [idCatalogue]);
});

test('champs absents ou mal typés : la mise en œuvre reste insérable', () => {
  const { mesures } = repriseAvecMesures([
    { id: 'MESURE-1720000000000-1' },
    { id: 'MESURE-1720000000000-2', nom: 42, maturite: 'trois', updatedAt: 'hier' },
  ]);

  assert.deepEqual(mesures.catalogue[0], { id: 'MESURE-1720000000000-1', nom: '', description: '' });
  assert.equal(mesures.miseEnOeuvre[0].statut, '');
  assert.equal(mesures.miseEnOeuvre[0].maturite, 0);
  assert.equal(mesures.miseEnOeuvre[1].maturite, 0, 'une maturité illisible vaut 0');
  assert.equal(mesures.miseEnOeuvre[1].updatedAt, null);
  assert.equal(mesures.catalogue[1].nom, '', 'un nom non textuel n’est pas deviné');
});

test('scinderMesures est appelable seule, et reproductible SANS options figées', () => {
  // ── Ce que ce test affirmait, et pourquoi il change ──────────────────────
  //
  // Il passait `OPTIONS_FIGEES` à `scinderMesures` et concluait « sous horloge et
  // aléa figés, la scission est reproductible ». `scinderMesures` ne prend plus
  // d'options du tout : l'argument était ignoré, et la conclusion attribuait à un
  // décor la propriété qu'il fallait éprouver. Un essai vert pour la mauvaise
  // raison endort — c'est la leçon du constat Q-3.
  //
  // La reproductibilité n'est plus organisée par le banc, elle est ACQUISE : le
  // module ne tire plus, il dérive. On l'éprouve donc là où elle vit — deux appels
  // nus, aucun décor.
  const { charge } = repriseAvecMesures([
    { id: 'MESURE-1720000000000-1', nom: 'A', statut: 'conforme', maturite: 5 },
    // Sans identifiant : c'est CE chemin qui engendre, et donc celui qui pouvait
    // rendre deux valeurs différentes d'un appel à l'autre.
    { nom: 'B', statut: 'non conforme', maturite: 1 },
  ]);

  const premier = scinderMesures(charge);
  const second = scinderMesures(charge);

  assert.deepEqual(premier, second, 'Deux appels nus doivent rendre exactement la même scission.');
  assert.equal(premier.catalogue[0].id, 'MESURE-1720000000000-1', 'L’identifiant du fichier est conservé.');

  // La mise en œuvre reçoit un identifiant ENGENDRÉ, et il est stable d'un appel à
  // l'autre : c'est lui qui déciderait, en base, de créer une ligne ou d'en
  // retrouver une. Un tirage le rendrait différent à chaque scission.
  for (const [rang, mise] of premier.miseEnOeuvre.entries()) {
    assert.ok(estIdentifiantEngendre('MMO', mise.id), `Hors convention : ${String(mise.id)}`);
    assert.equal(mise.id, second.miseEnOeuvre[rang].id, 'Identifiant de mise en œuvre instable.');
  }
  assert.equal(
    new Set(premier.miseEnOeuvre.map((m) => m.id)).size,
    premier.miseEnOeuvre.length,
    'Deux mises en œuvre ne peuvent pas partager un identifiant : l’unicité (filiale, mesure) en dépend.',
  );

  // Et la mesure SANS identifiant en a reçu un, dérivé lui aussi et donc stable.
  const engendree = premier.catalogue[1];
  assert.ok(estIdentifiantEngendre('MESURE', engendree.id), `Hors convention : ${String(engendree.id)}`);
  assert.equal(engendree.id, second.catalogue[1].id);
});

test('une charge sans mesure rend deux collections vides, pas une erreur', () => {
  const { mesures, rapport } = repriseAvecMesures([]);

  assert.deepEqual(mesures.catalogue, []);
  assert.deepEqual(mesures.miseEnOeuvre, []);
  assert.deepEqual(rapport.volumesMesures, { catalogue: 0, miseEnOeuvre: 0 });
});
