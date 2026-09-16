/**
 * controle-periodique.test.mjs — **UN CONTRÔLE SE REJOUE, ET SON EFFICACITÉ
 * N'EST PAS SA MATURITÉ** (lot L19, actions 19.5 et 19.6)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'efficacité et la maturité sont DEUX dimensions, et elles ne se confondent pas |
 * | 2 | « Non constatée » n'est pas « inefficace » : le vide est une valeur |
 * | 3 | La prochaine échéance est DÉRIVÉE — cinq rythmes, et deux cas qui rendent NULL |
 * | 4 | Le vocabulaire des fréquences est CELUI de `mco_actions`, pas une copie |
 * | 5 | Le garde-fou ÉPROUVE le calcul, et il MORD |
 *
 * ── ⚠️ LE §1 EST LE SUJET, ET IL SE MESURE PAR CE QUI EST POSSIBLE ─────────
 *
 * Une sauvegarde peut être documentée, planifiée, supervisée — maturité 4 — et
 * ne pas se restaurer. L'essai écrit précisément cette ligne : *maturité 5,
 * efficacité « inefficace »*. Si la base la refusait, ou si l'une des deux
 * colonnes contraignait l'autre, le produit forcerait l'utilisateur à mentir.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';

let base;
let applicatif;
let proprietaire;

async function dansToulouse(travail, options = {}) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    travail,
    { annuler: options.annuler === true },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
});

after(async () => {
  await base?.fermer();
});

describe('Le contrôle périodique et l’efficacité (actions 19.5 / 19.6)', () => {
  test('§1 — maturité 5 ET « inefficace » : la ligne que le produit doit accepter', async () => {
    // « Documenté, planifié, supervisé, mesuré » — et la restauration échoue.
    // C'est le cas réel que l'action 19.6 existe pour représenter ; le refuser
    // forcerait l'utilisateur à mentir dans un outil produit en audit.
    await dansToulouse(async (c) => {
      await c.query(
        `update mesure_mise_en_oeuvre
            set maturite = 5,
                efficacite = 'inefficace',
                efficacite_constatee_le = date '2026-03-12',
                efficacite_preuve = 'Test de restauration du 12/03 : échec sur la base 3.'
          where mesure_id = 'MESURE-A' and filiale_id = $1`,
        [FILIALE_A],
      );
    });

    const ligne = await dansToulouse(async (c) =>
      (
        await c.query(
          `select maturite, efficacite, efficacite_constatee_le, efficacite_preuve
             from mesure_mise_en_oeuvre where mesure_id = 'MESURE-A' and filiale_id = $1`,
          [FILIALE_A],
        )
      ).rows[0],
    );
    assert.equal(Number(ligne.maturite), 5);
    assert.equal(ligne.efficacite, 'inefficace');
    assert.match(String(ligne.efficacite_preuve), /échec sur la base 3/u);

    // Et le vocabulaire est FERMÉ : « bof » n'entre pas, sans quoi l'indicateur
    // cesse d'être agrégeable — et un indicateur non agrégeable n'en est pas un.
    const refus = await erreurAttendue(() =>
      dansToulouse(async (c) => {
        await c.query(
          `update mesure_mise_en_oeuvre set efficacite = 'bof'
            where mesure_id = 'MESURE-A' and filiale_id = $1`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(refus.code, '23514');
  });

  test('§2 — « non constatée » n’est pas « inefficace » : le vide est une valeur', async () => {
    const vide = await dansToulouse(async (c) =>
      (
        await c.query(
          `select efficacite from mesure_mise_en_oeuvre
            where mesure_id = 'MESURE-B' or efficacite is null limit 1`,
        )
      ).rows[0],
    );
    // Sur une base fraîchement migrée, AUCUNE mise en œuvre ne porte d'efficacité :
    // poser un défaut aurait fait apparaître, le jour de la migration, des
    // contrôles réputés inefficaces que personne n'a examinés.
    assert.equal(vide === undefined ? null : vide.efficacite, null);

    // ⚠️ Et une DATE sans constatation est refusée : elle ne veut rien dire, et
    // elle se lit pourtant comme une preuve.
    const refus = await erreurAttendue(() =>
      dansToulouse(async (c) => {
        await c.query(
          `update mesure_mise_en_oeuvre
              set efficacite = null, efficacite_constatee_le = date '2026-01-01'
            where mesure_id = 'MESURE-A' and filiale_id = $1`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(refus.code, '23514');
  });

  test('§3 — la prochaine échéance est DÉRIVÉE, et elle sait ne rien rendre', async () => {
    const rendu = await dansToulouse(async (c) =>
      (
        await c.query(`
          select f_prochain_controle(date '2026-01-15', 'Hebdomadaire')  as hebdo,
                 f_prochain_controle(date '2026-01-15', 'Mensuelle')     as mensuel,
                 f_prochain_controle(date '2026-01-15', 'Trimestrielle') as trimestre,
                 f_prochain_controle(date '2026-01-15', 'Semestrielle')  as semestre,
                 f_prochain_controle(date '2026-01-15', 'Annuelle')      as annuel,
                 f_prochain_controle(null,              'Annuelle')      as jamais_joue,
                 f_prochain_controle(date '2026-01-15', 'Ponctuelle')    as ponctuel`)
      ).rows[0],
    );
    const jour = (d) => (d === null ? null : new Date(d).toISOString().slice(0, 10));
    assert.equal(jour(rendu.hebdo), '2026-01-22');
    assert.equal(jour(rendu.mensuel), '2026-02-15');
    assert.equal(jour(rendu.trimestre), '2026-04-15');
    assert.equal(jour(rendu.semestre), '2026-07-15');
    assert.equal(jour(rendu.annuel), '2027-01-15');
    // ── Les deux cas qu'on oublie, et qui comptent autant ─────────────────
    assert.equal(
      rendu.jamais_joue,
      null,
      'La fonction invente une échéance pour un contrôle JAMAIS joué : une date calculée ' +
        'sur du vide ne se défend pas — même motif que l’horloge sans origine (034).',
    );
    assert.equal(
      rendu.ponctuel,
      null,
      'La fonction rend une échéance pour un contrôle PONCTUEL : le produit réclamerait ' +
        'indéfiniment un passage que personne ne doit faire.',
    );
  });

  test('§4 — le vocabulaire des fréquences est CELUI de `mco_actions`', async () => {
    // ⚠️ On compare les deux contraintes APPLIQUÉES, pas deux listes recopiées
    // dans cet essai : c'est le seul moyen de voir une divergence, et le critère
    // 19.5 dit « réutilisé, pas recopié ».
    const valeurs = await base.lignes(
      proprietaire,
      `select c.conname::text as nom,
              (select array_agg(v order by v)
                 from unnest(regexp_split_to_array(
                        substring(pg_get_constraintdef(c.oid) from 'ARRAY\\[(.*)\\]'),
                        ',\\s*')) as v)::text as valeurs
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
        where (t.relname = 'mco_actions' and c.conname = 'ck_mco_actions_frequence')
           or (t.relname = 'mesure_mise_en_oeuvre'
               and c.conname = 'ck_mesure_mise_en_oeuvre_frequence')
        order by 1`,
    );
    assert.equal(valeurs.length, 2, 'Les deux contraintes doivent exister.');
    assert.equal(
      valeurs[0].valeurs,
      valeurs[1].valeurs,
      'Les deux vocabulaires ont divergé : il y aurait deux listes déroulantes pour la ' +
        `même question. ${JSON.stringify(valeurs)}`,
    );
  });

  test('§5 — le garde-fou ÉPROUVE le calcul, et il MORD', async () => {
    const sain = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A]),
      async (c) => (await c.query('select * from f_verifier_controle_periodique()')).rows,
    );
    assert.deepEqual(sain, [], `Anomalies inattendues : ${JSON.stringify(sain)}`);

    // ── LA MORSURE, dans une transaction ANNULÉE (leçon du 10/09, Q-281) ──
    const anomalies = await base.avecPerimetre(
      proprietaire,
      perimetre('mutant', null, [FILIALE_A]),
      async (c) => {
        // La mutation la plus plausible : quelqu'un « simplifie » en faisant
        // partir toutes les échéances d'aujourd'hui.
        await c.query(`
          create or replace function f_prochain_controle(p_dernier date, p_frequence text)
          returns date language sql immutable
              set search_path = pg_catalog, public, pg_temp as
          $m$ select (current_date + interval '1 month')::date $m$;`);
        return (
          await c.query('select anomalie, detail from f_verifier_controle_periodique()')
        ).rows;
      },
    );
    assert.ok(
      anomalies.some((a) => a.anomalie === 'echeance_controle_fausse'),
      `LE GARDE NE MORD PAS : le calcul peut cesser de regarder le dernier passage sans ` +
        `qu’aucune anomalie ne soit levée. Rendu : ${JSON.stringify(anomalies)}`,
    );
    assert.ok(
      anomalies.some((a) => a.anomalie === 'echeance_sans_passage'),
      'Le garde ne voit pas qu’une échéance est INVENTÉE pour un contrôle jamais joué.',
    );

    // ── CONTRÔLE DE MORSURE : la vraie fonction est revenue ───────────────
    const apres = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A]),
      async (c) => (await c.query('select * from f_verifier_controle_periodique()')).rows,
    );
    assert.deepEqual(apres, [], 'La mutation n’a pas été annulée : la base porte le défaut.');
  });
});
