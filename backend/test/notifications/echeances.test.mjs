/**
 * echeances.test.mjs — **les mêmes dates, avec les mêmes règles que l'écran.**
 *
 * Le §36.3 l'écrit : *« C'est la même source, et elle ne se réécrit pas côté
 * serveur : le lot L12 lit les mêmes dates, avec les mêmes règles, ou il
 * divergera. »* Cette famille éprouve les deux moitiés :
 *
 *  1. **Les six sources sont les mêmes**, et la liste est **découverte** dans
 *     `cyber-gouvernance_V4/js/services/echeances.js` plutôt que recopiée. Une
 *     septième source ajoutée à l'écran fera rougir cet essai — ce qui est
 *     précisément ce qu'on veut d'une liste qui vit à deux endroits.
 *  2. **Chaque règle est éprouvée sur son cas limite**, celui où une lecture
 *     approximative donnerait un résultat plausible mais faux.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, RACINE_FRONTEND } from '../aide/serveur.mjs';

const { recolterEcheances, resoudreDestinataires, SOURCES, urgenceDe } =
  await moduleCompile('notifications/echeances.js');

const REFERENCE = new Date('2026-06-15T09:00:00.000Z');
const jour = (decalage) =>
  new Date(REFERENCE.getTime() + decalage * 86_400_000).toISOString().slice(0, 10);

let base;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
});
after(async () => {
  await base?.fermer();
});

/** Récolte sous le périmètre d'une filiale, sur une transaction annulée. */
async function recolter(travailDeSemis = async () => {}) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('essai-l12', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await travailDeSemis(c);
      return await recolterEcheances(c, REFERENCE);
    },
  );
}

describe('L12 — les six sources sont celles de l’écran', () => {
  test('la liste est DÉCOUVERTE dans js/services/echeances.js, jamais recopiée', () => {
    const source = readFileSync(join(RACINE_FRONTEND, 'js', 'services', 'echeances.js'), 'utf8');
    const trouves = [...source.matchAll(/type:\s*"([a-z_]+)"/gu)].map((m) => m[1]);
    const attendus = [...new Set(trouves)].sort();

    assert.ok(attendus.length >= 6, `le frontend doit déclarer ses types (${attendus.join(', ')})`);
    assert.deepEqual(
      Object.keys(SOURCES).sort(),
      attendus,
      "les types du serveur et ceux de l'écran ont divergé",
    );
  });

  test('les bornes d’urgence sont celles de `Echeances.bucketFor`', () => {
    assert.equal(urgenceDe(-1), 'retard');
    assert.equal(urgenceDe(0), 'aujourdhui');
    assert.equal(urgenceDe(7), 'semaine');
    assert.equal(urgenceDe(8), 'mois');
    assert.equal(urgenceDe(31), 'mois');
    assert.equal(urgenceDe(32), 'avenir');
  });
});

describe('L12 — chaque règle, sur son cas limite', () => {
  test('actions : « terminée » est exclue, la date compte, le retard est négatif', async () => {
    const recolte = await recolter(async (c) => {
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, echeance) values
             ('ACT-1', $1, 'Ouverte, en retard', 'en cours', $2),
             ('ACT-2', $1, 'Terminée, même date', 'terminée', $2),
             ('ACT-3', $1, 'Sans échéance', 'à faire', null)`,
        [FILIALE_A, jour(-2)],
      );
    });
    const actions = recolte.echeances.filter((e) => e.type === 'action');
    assert.deepEqual(actions.map((a) => a.id), ['ACT-1']);
    assert.equal(actions[0].jours, -2);
  });

  test('MCO : « Réalisée » et « Annulée » sont exclues', async () => {
    const recolte = await recolter(async (c) => {
      await c.query(
        `insert into mco_actions (id, filiale_id, titre, statut, avancement, date_prevue) values
             ('MCO-1', $1, 'En cours',   'En cours',    50,  $2),
             ('MCO-2', $1, 'Réalisée',   'Réalisée',    100, $2),
             ('MCO-3', $1, 'Annulée',    'Annulée',     0,   $2)`,
        [FILIALE_A, jour(1)],
      );
    });
    assert.deepEqual(
      recolte.echeances.filter((e) => e.type === 'mco').map((e) => e.id),
      ['MCO-1'],
    );
  });

  test('documents : « obsolète » sans date est compté À PART, jamais relancé', async () => {
    const recolte = await recolter(async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, date_revue) values
             ('DOC-1', $1, 'Revue datée',        'en vigueur', $2),
             ('DOC-2', $1, 'Obsolète sans date', 'obsolète',   null),
             ('DOC-3', $1, 'Brouillon sans date','brouillon',  null)`,
        [FILIALE_A, jour(3)],
      );
    });
    assert.deepEqual(
      recolte.echeances.filter((e) => e.type === 'document').map((e) => e.id),
      ['DOC-1'],
    );
    // ⚠️ Compté, et non perdu : c'est l'écart assumé n° 1 de `echeances.ts`.
    assert.equal(recolte.sansDate.document, 1);
  });

  test('documents de portée GROUPE : exclus, sans quoi vingt filiales relanceraient la même revue', async () => {
    // ⚠️ La matière est constatée DANS la même transaction que la récolte : une
    // ligne semée puis annulée, dont on prouverait la lisibilité ailleurs, ne
    // prouverait rien du tout.
    const { recolte, lisible } = await base.avecPerimetre(
      applicatif,
      perimetre('essai-l12', FILIALE_A, [FILIALE_A]),
      async (c) => {
        // Écriture de portée Groupe : elle exige `grc.administration_groupe`.
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query(
          `insert into documents (id, filiale_id, titre, statut, date_revue)
               values ('DOC-GRP', null, 'PSSI du groupe', 'en vigueur', $1)`,
          [jour(2)],
        );
        await c.query("select set_config('grc.administration_groupe', '', true)");
        const n = (
          await c.query(
            `select count(*)::int as n from documents
              where filiale_id is null and date_revue is not null`,
          )
        ).rows[0].n;
        return { recolte: await recolterEcheances(c, REFERENCE), lisible: n };
      },
    );
    assert.equal(lisible, 1, 'le socle Groupe doit être lisible ici : sinon cet essai ne prouve rien');
    assert.equal(recolte.echeances.filter((e) => e.id === 'DOC-GRP').length, 0);
    assert.equal(recolte.sansDate.document, undefined, 'elle est exclue, pas rangée « sans date »');
  });

  test('incidents : détection + 72 h ; détection inconnue → immédiat', async () => {
    const recolte = await recolter(async (c) => {
      await c.query(
        `insert into incidents (id, filiale_id, titre, date_detection, declaration_anssi, declaration_cnil) values
             ('INC-1', $1, 'Détecté hier',      $2,   'à déclarer',  'non requise'),
             ('INC-2', $1, 'Détection inconnue', null, 'non requise', 'à déclarer'),
             ('INC-3', $1, 'Rien à déclarer',   $2,   'non requise', 'non requise')`,
        [FILIALE_A, jour(-1)],
      );
    });
    const incidents = recolte.echeances.filter((e) => e.type === 'incident');
    const parId = Object.fromEntries(incidents.map((i) => [i.id, i.jours]));
    assert.deepEqual(Object.keys(parId).sort(), ['INC-1', 'INC-2']);
    assert.equal(parId['INC-1'], 2, 'détecté hier → échéance dans 2 jours (72 h)');
    assert.equal(parId['INC-2'], 0, 'détection inconnue → à déclarer sans délai');
    // ⚠️ Et aucun n'a de responsable : le modèle n'en porte pas.
    assert.deepEqual(incidents.map((i) => i.responsables), [[], []]);
  });

  test('audits : « Réalisé » exclu ; revues de direction : seulement à venir', async () => {
    const recolte = await recolter(async (c) => {
      await c.query(
        `insert into audits (id, filiale_id, reference, statut, date_audit, auditeur) values
             ('AUD-1', $1, 'AUD-2026-02', 'Planifié', $2, 'Auditrice'),
             ('AUD-2', $1, 'AUD-2026-03', 'Réalisé',  $2, 'Auditrice')`,
        [FILIALE_A, jour(4)],
      );
      await c.query(
        `insert into revues (id, filiale_id, date_revue, participants) values
             ('REV-1', $1, $2, E'Alice\\nBob'),
             ('REV-2', $1, $3, 'Carla')`,
        [FILIALE_A, jour(4), jour(-4)],
      );
    });
    assert.deepEqual(
      recolte.echeances.filter((e) => e.type === 'audit').map((e) => e.id),
      ['AUD-1'],
    );
    const revues = recolte.echeances.filter((e) => e.type === 'revue');
    assert.deepEqual(revues.map((r) => r.id), ['REV-1'], 'une revue passée est tenue');
    assert.deepEqual(revues[0].responsables, ['Alice', 'Bob'], 'un nom par ligne');
  });

  test("aucune récolte ne rend de titre : le type n'a pas de champ où en mettre", async () => {
    const recolte = await recolter(async (c) => {
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, echeance, commentaire)
             values ('ACT-T', $1, 'TITRE-QUI-NE-DOIT-PAS-SORTIR', 'à faire', $2, 'COMMENTAIRE-SECRET')`,
        [FILIALE_A, jour(1)],
      );
    });
    const serialisee = JSON.stringify(recolte);
    assert.ok(!serialisee.includes('TITRE-QUI-NE-DOIT-PAS-SORTIR'));
    assert.ok(!serialisee.includes('COMMENTAIRE-SECRET'));
    // Matière : la ligne A BIEN été récoltée — sinon l'absence ne prouverait rien.
    assert.ok(recolte.echeances.some((e) => e.id === 'ACT-T'));
    assert.deepEqual(Object.keys(recolte.echeances[0]).sort(), [
      'id',
      'jours',
      'responsables',
      'type',
    ]);
  });
});

describe('L12 — un destinataire vient de l’annuaire, et de nulle part ailleurs', () => {
  test('un nom sans fiche, ou une fiche sans adresse, ne donne aucun destinataire', async () => {
    const par = await base.avecPerimetre(
      applicatif,
      perimetre('essai-l12', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `insert into personnes (id, filiale_id, nom, email) values
               ('P-1', $1, 'Avec Adresse',  'avec@exemple.interne'),
               ('P-2', $1, 'Sans Adresse',  null),
               ('P-3', $1, 'Adresse Vide',  '   ')`,
          [FILIALE_A],
        );
        return await resoudreDestinataires(c, [
          'Avec Adresse',
          '  avec adresse  ',
          'Sans Adresse',
          'Adresse Vide',
          'Jamais Saisi',
          'nobody@exemple.interne',
        ]);
      },
    );
    assert.equal(par.size, 1, 'une seule des six entrées est un destinataire');
    assert.equal(par.get('avec adresse').email, 'avec@exemple.interne');
    // ⚠️ Une ADRESSE passée comme un nom ne résout rien : la fonction ne prend
    // pas d'adresse, et c'est la règle 3 du §36.2 tenue par la forme.
    assert.equal(par.has('nobody@exemple.interne'), false);
  });
});
