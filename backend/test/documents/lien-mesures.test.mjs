/**
 * lien-mesures.test.mjs — **LE DOCUMENT PROUVE LA MESURE** (lot L19, action 19.3)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * Un auditeur ouvre un contrôle et demande la procédure. Le lien qui répond à
 * cette question traverse **deux tables MIXTES** — un document et un contrôle
 * peuvent l'un comme l'autre appartenir au socle du Groupe ou à une filiale —,
 * et c'est exactement la configuration où le cloisonnement se perd : quatre clés
 * étrangères, deux miroirs de portée, une barrière asymétrique.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Un document LOCAL prouve un contrôle du SOCLE GROUPE — le cas fréquent |
 * | 2 | Un document de PORTÉE GROUPE ne peut PAS s'appuyer sur un contrôle local |
 * | 3 | Un document ne peut pas prouver le contrôle local d'une AUTRE filiale |
 * | 4 | Supprimer le document emporte le lien ; supprimer le CONTRÔLE est refusé |
 * | 5 | Le garde-fou nomme ses pièces, et il MORD |
 *
 * ── ⚠️ LE §2 EST LA MOITIÉ QU'ON OUBLIE ────────────────────────────────────
 *
 * La barrière est **asymétrique**, et l'asymétrie est le sujet : le sens
 * *local → Groupe* est ouvert et fréquent (la PSSI du Groupe impose le
 * chiffrement, Toulouse écrit sa procédure) ; le sens inverse est fermé, parce
 * qu'une politique que vingt filiales lisent ne doit pas dépendre d'une ligne
 * qu'une seule filiale peut effacer. C'est le constat **N-10**, et il a été
 * rouvert deux fois depuis — d'abord par la `030`, puis par un garde qui
 * reconnaissait une colonne NOMMÉE `filiale_id` (constat Q-313).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';

let base;
let applicatif;
let proprietaire;

/** Écrit dans une filiale, et VALIDE : le cloisonnement se joue à plusieurs connexions. */
async function dans(filiale, travail, options = {}) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale], options.administration === true),
    travail,
    { annuler: options.annuler === true },
  );
}

/** Écrit au niveau GROUPE — `filiale_id` nul exige l'administration Groupe. */
async function auGroupe(travail, options = {}) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A, FILIALE_B], true),
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

describe('Le lien document ↔ contrôle (action 19.3)', () => {
  test('§1 — un document LOCAL prouve un contrôle du SOCLE GROUPE', async () => {
    await dans(FILIALE_A, async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut)
             values ('DOC-PREUVE-A', $1, 'Procédure de chiffrement des postes', 'en vigueur')`,
        [FILIALE_A],
      );
      // ⚠️ `filiale_id` et `mesure_filiale_id` ne sont PAS fournis : le déclencheur
      // les pose. Les donner ici mesurerait le semis au lieu du déclencheur.
      await c.query(
        `insert into document_mesures (document_id, mesure_id)
             values ('DOC-PREUVE-A', 'MESURE-G')`,
      );
    });

    const lignes = await dans(FILIALE_A, async (c) =>
      (
        await c.query(
          `select filiale_id, portee_groupe, mesure_filiale_id, mesure_portee_groupe
             from document_mesures where document_id = 'DOC-PREUVE-A'`,
        )
      ).rows,
    );
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].filiale_id, FILIALE_A, 'Le lien porte la filiale du DOCUMENT.');
    assert.equal(lignes[0].portee_groupe, false);
    assert.equal(
      lignes[0].mesure_filiale_id,
      null,
      'Le miroir du CONTRÔLE dit qu’il vient du socle : sans lui, les deux clés qui le ' +
        'visent seraient satisfaites trivialement (MATCH SIMPLE) et ne décideraient rien.',
    );
    assert.equal(lignes[0].mesure_portee_groupe, true);
  });

  test('§2 — un document de PORTÉE GROUPE ne peut PAS s’appuyer sur un contrôle local', async () => {
    // `DOC-G` est la PSSI du Groupe ; `MESURE-A` est un contrôle de Toulouse.
    const erreur = await erreurAttendue(() =>
      auGroupe(async (c) => {
        await c.query(
          `insert into document_mesures (document_id, mesure_id)
               values ('DOC-G', 'MESURE-A')`,
        );
      }),
    );
    // 23514 = violation de contrainte « check » : c'est `ck_document_mesures_portee`.
    assert.equal(
      erreur.code,
      '23514',
      'La barrière N-10 ne mord pas : une politique que vingt filiales lisent peut ' +
        's’appuyer sur une ligne qu’UNE filiale peut effacer. ' +
        `Reçu : ${erreur.code} ${String(erreur.message).slice(0, 160)}`,
    );

    // ── CONTRÔLE DE MORSURE : le sens OUVERT passe bien ────────────────
    //
    // Sans cette moitié, « tout est refusé » passerait pour « la barrière est
    // asymétrique ». C'est le motif du constat Q-210. Le semis partagé pose
    // déjà `DOC-G` ↔ `MESURE-G` — Groupe vers socle Groupe —, et sa seule
    // présence prouve que ce sens-là traverse les quatre clés et la barrière.
    const groupeVersSocle = await auGroupe(async (c) =>
      (
        await c.query(
          `select count(*)::int as n from document_mesures
            where document_id = 'DOC-G' and mesure_id = 'MESURE-G'`,
        )
      ).rows[0].n,
    );
    assert.equal(groupeVersSocle, 1, 'Le sens Groupe → socle Groupe doit passer.');
  });

  test('§3 — un document ne peut pas prouver le contrôle local d’une AUTRE filiale', async () => {
    // Toulouse tente de s'appuyer sur `MESURE-B`, un contrôle de l'Allemagne.
    // ⚠️ Elle ne le VOIT pas — la RLS le cache —, et c'est tout le danger : les
    // contrôles d'intégrité de PostgreSQL contournent délibérément la RLS, si bien
    // qu'une clé simple serait satisfaite par une ligne INVISIBLE (§17.1).
    const erreur = await erreurAttendue(() =>
      dans(FILIALE_A, async (c) => {
        await c.query(
          `insert into document_mesures (document_id, mesure_id)
               values ('DOC-PREUVE-A', 'MESURE-B')`,
        );
      }),
    );
    assert.ok(
      erreur.code === 'GRC07' || erreur.code === '23503' || erreur.code === '23514',
      'FUITE ENTRE FILIALES : Toulouse rattache son document au contrôle local de ' +
        `l’Allemagne. Reçu : ${erreur.code} ${String(erreur.message).slice(0, 160)}`,
    );
    // Et rien n'est resté : un refus qui laisse une ligne n'est pas un refus.
    // ⚠️ On compte le lien QU'ON A TENTÉ, pas toutes les lignes visant `MESURE-B` :
    // le semis en pose une légitime — `DOC-B` ↔ `MESURE-B`, chez l'Allemagne — et
    // la compter ferait échouer l'essai sur une ligne parfaitement saine.
    const reste = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A, FILIALE_B]),
      async (c) =>
        (
          await c.query(
            `select count(*)::int as n from document_mesures
              where document_id = 'DOC-PREUVE-A' and mesure_id = 'MESURE-B'`,
          )
        ).rows[0].n,
    );
    assert.equal(reste, 0);
  });

  test('§4 — le document emporte ses liens ; le CONTRÔLE, lui, ne se supprime pas', async () => {
    await dans(FILIALE_A, async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut)
             values ('DOC-JETABLE', $1, 'Note provisoire', 'brouillon')`,
        [FILIALE_A],
      );
      await c.query(
        `insert into document_mesures (document_id, mesure_id)
             values ('DOC-JETABLE', 'MESURE-A')`,
      );
    });

    // ── Le document part : le lien part avec lui. Un lien sans son document
    //    n'a plus d'objet, et une orpheline est invisible ET hors de portée des
    //    purges (motif des constats Q-232 / Q-233).
    await dans(FILIALE_A, async (c) => {
      await c.query("delete from documents where id = 'DOC-JETABLE'");
    });
    const restant = await dans(FILIALE_A, async (c) =>
      (
        await c.query(
          `select count(*)::int as n from document_mesures where document_id = 'DOC-JETABLE'`,
        )
      ).rows[0].n,
    );
    assert.equal(restant, 0, 'Le lien a survécu à son document : c’est une orpheline.');

    // ── Le CONTRÔLE, lui, résiste. §17.6 : « un contrôle qu'une filiale a
    //    évalué ne disparaît pas, il s'archive ». Les six références au
    //    catalogue sont en « restrict », et les deux du lien en sont.
    const erreur = await erreurAttendue(() =>
      dans(FILIALE_A, async (c) => {
        await c.query("delete from mesure_catalogue where id = 'MESURE-A'");
      }),
    );
    assert.equal(
      erreur.code,
      '23503',
      'Un contrôle rattaché à un document se supprime : la preuve disparaît avec lui. ' +
        `Reçu : ${erreur.code}`,
    );
  });

  test('§5 — le garde-fou nomme ses pièces, et il MORD', async () => {
    const sain = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A, FILIALE_B]),
      async (c) => (await c.query('select * from f_verifier_lien_document_mesure()')).rows,
    );
    assert.deepEqual(sain, [], `Anomalies inattendues : ${JSON.stringify(sain)}`);

    // ── LA MORSURE, dans une transaction ANNULÉE ──────────────────────────
    //
    // ⚠️ Annulée, jamais rattrapée par un `finally` : une mutation laissée en
    // base casserait la recette, et c'est arrivé (leçon du 10/09, Q-281).
    const anomalies = await base.avecPerimetre(
      proprietaire,
      perimetre('mutant', null, [FILIALE_A, FILIALE_B]),
      async (c) => {
        // On retire la barrière — la pièce la plus facile à faire disparaître,
        // puisqu'elle n'empêche rien de ce que l'écran propose tous les jours.
        await c.query(
          'alter table document_mesures drop constraint ck_document_mesures_portee',
        );
        return (
          await c.query('select anomalie, detail from f_verifier_lien_document_mesure()')
        ).rows;
      },
    );
    assert.ok(
      anomalies.some((a) => a.anomalie === 'lien_document_mesure_incomplet'),
      `LE GARDE NE MORD PAS : la barrière N-10 peut disparaître sans anomalie. ` +
        `Rendu : ${JSON.stringify(anomalies)}`,
    );
    assert.ok(
      anomalies.some((a) => /qu'UNE filiale peut effacer|qu’UNE filiale peut effacer/u.test(String(a.detail))),
      'Le garde mord, mais son message ne dit pas CE QUE la disparition produit — et ' +
        'c’est la différence entre une anomalie qu’on comprend et une anomalie qu’on désarme.',
    );

    // ── CONTRÔLE DE MORSURE : la transaction a bien été annulée ───────────
    const apres = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A, FILIALE_B]),
      async (c) => (await c.query('select * from f_verifier_lien_document_mesure()')).rows,
    );
    assert.deepEqual(apres, [], 'La mutation n’a pas été annulée : la base porte le défaut.');
  });
});
