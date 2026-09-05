/**
 * cloisonnement.test.mjs — **une relance destinée à une filiale ne part pas à
 * un destinataire d'une autre.**
 *
 * ── Pourquoi cet essai a besoin d'un HOMONYME ───────────────────────────────
 *
 * Les entités stockent le responsable **en texte libre** : il n'y a pas de clé
 * étrangère vers `personnes` (`DATA_MODEL.md` §2, arbitrage du chantier
 * Personnel, conservé côté serveur). La résolution se fait donc par le NOM — et
 * un nom n'est pas cloisonné, il est écrit dans une colonne.
 *
 * Ce qui cloisonne, c'est la Row Level Security sur `personnes` : sous un
 * périmètre borné à une filiale, l'annuaire de la voisine n'existe pas. L'essai
 * le met à l'épreuve de la façon la plus dure possible :
 *
 *  · **le même nom** dans les deux annuaires, avec **deux adresses différentes**
 *    — si le périmètre ne tenait pas, la filiale A écrirait à l'adresse de B ;
 *  · **un responsable de A qui n'existe QUE dans l'annuaire de B** — si le
 *    périmètre ne tenait pas, A écrirait à quelqu'un qu'elle n'a pas le droit
 *    de connaître.
 *
 * ⚠️ **Matière obligatoire** : l'essai vérifie d'abord que **deux** messages sont
 * partis. « Rien n'a fui » sur un relais qui n'a rien reçu ne vaut rien.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { lireMessage, ouvrirContexte, smtpVers } from './aide.mjs';
import { monterRelaisEssai } from './serveur-smtp.mjs';

const { envoyerRelances } = await moduleCompile('notifications/relances.js');

const REFERENCE = new Date('2026-06-15T09:00:00.000Z');
const ECHEANCE = '2026-06-16';

const HOMONYME = 'Homonyme Commun';
const SEULEMENT_CHEZ_B = 'Personne Uniquement Chez B';
const ADRESSE_A = 'homonyme-a@exemple.interne';
const ADRESSE_B = 'homonyme-b@exemple.interne';
const ADRESSE_SEULE_B = 'seulement-b@exemple.interne';

let base;
let applicatif;
let relais;
let contexte;
let bilan;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // Filiale A : l'homonyme, plus une action confiée à quelqu'un qui n'existe
  // que chez la voisine.
  // ── Les comptes d'annuaire, en portée GROUPE ────────────────────────────
  //
  // ⚠️ `utilisateurs` est une table de configuration de niveau Groupe : son
  // écriture exige `administration_groupe`, et un semis de filiale reçoit
  // « new row violates row-level security policy ». C'est la RLS qui fait son
  // travail — la corriger en semant sous un périmètre de filiale aurait été
  // demander au banc ce que le produit refuse.
  //
  // Ces comptes existent parce qu'une relance ne s'adresse qu'à une fiche que
  // l'ANNUAIRE résout (porte S6) : une adresse tapée à la main ne reçoit rien.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l12', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage) values
             ('USER-HOMO-A', 'compte.homo.a', 'Fiche d’essai A'),
             ('USER-HOMO-B', 'compte.homo.b', 'Fiche d’essai B'),
             ('USER-SEUL-B', 'compte.seul.b', 'Fiche d’essai B bis')
         on conflict (id) do nothing`,
      );
    },
    { annuler: false },
  );

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l12', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
              values ($1, $2, $3, $4, $5)`,
        ['PERS-HOMO-A', FILIALE_A, HOMONYME, ADRESSE_A, 'USER-HOMO-A'],
      );
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, responsable, echeance)
         values ($1, $2, 'Action de la filiale A', 'à faire', $3, $4)`,
        ['ACT-CLOIS-A', FILIALE_A, HOMONYME, ECHEANCE],
      );
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, responsable, echeance)
         values ($1, $2, 'Action confiée à un inconnu d''ici', 'à faire', $3, $4)`,
        ['ACT-CLOIS-X', FILIALE_A, SEULEMENT_CHEZ_B, ECHEANCE],
      );
    },
    { annuler: false },
  );

  // Filiale B : le MÊME nom, une AUTRE adresse ; et la personne que A a nommée.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l12', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query(
        `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
              values ($1, $2, $3, $4, $5)`,
        ['PERS-HOMO-B', FILIALE_B, HOMONYME, ADRESSE_B, 'USER-HOMO-B'],
      );
      await c.query(
        `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
              values ($1, $2, $3, $4, $5)`,
        ['PERS-SEUL-B', FILIALE_B, SEULEMENT_CHEZ_B, ADRESSE_SEULE_B, 'USER-SEUL-B'],
      );
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, responsable, echeance)
         values ($1, $2, 'Action de la filiale B', 'à faire', $3, $4)`,
        ['ACT-CLOIS-B', FILIALE_B, HOMONYME, ECHEANCE],
      );
    },
    { annuler: false },
  );

  relais = await monterRelaisEssai();
  contexte = await ouvrirContexte(base, smtpVers(relais));
  bilan = await envoyerRelances(contexte.pool, contexte.config, {
    reference: REFERENCE,
    expedition: { tlsSupplement: { ca: relais.autorite } },
  });
});

after(async () => {
  await contexte?.fermer();
  await relais?.fermer();
  await base?.fermer();
});

describe('L12 — cloisonnement des destinataires', () => {
  test('la matière : deux messages sont partis, un par filiale', () => {
    assert.equal(bilan.messagesEchoues, 0, JSON.stringify(bilan.filiales));
    assert.equal(bilan.messagesExpedies, 2);
    assert.equal(relais.messages.length, 2);
  });

  test("l'homonyme reçoit à l'adresse de SA filiale, jamais à celle de la voisine", () => {
    const adresses = relais.messages.flatMap((m) => m.a).sort();
    assert.deepEqual(adresses, [ADRESSE_A, ADRESSE_B].sort());

    // Chaque message ne compte qu'UNE échéance : si les deux annuaires s'étaient
    // mélangés, l'un des deux en aurait porté deux.
    for (const message of relais.messages) {
      assert.match(lireMessage(message).corps, /Total \.+ 1/u);
    }
  });

  test("un responsable qui n'existe QUE chez la voisine ne reçoit RIEN", () => {
    const adresses = relais.messages.flatMap((m) => m.a);
    assert.ok(
      !adresses.includes(ADRESSE_SEULE_B),
      `FUITE : ${ADRESSE_SEULE_B} a reçu une relance d'une filiale qui ne le connaît pas`,
    );

    // …et l'échéance est comptée « sans destinataire » plutôt que tue.
    const a = bilan.filiales.find((f) => f.filialeId === FILIALE_A);
    assert.equal(a.echeancesRetenues, 2);
    assert.equal(a.destinataires, 1);
    assert.equal(a.sansDestinataire, 1);
  });

  test('aucun nom de responsable ne circule dans les messages', () => {
    for (const message of relais.messages) {
      const { tout } = lireMessage(message);
      assert.ok(!tout.includes(HOMONYME));
      assert.ok(!tout.includes(SEULEMENT_CHEZ_B));
    }
  });

  test("chaque trace est attribuée à SA filiale, et ne mentionne aucune adresse", async () => {
    const proprietaire = await base.connexion('proprietaire');
    const entrees = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A, FILIALE_B]),
      async (c) =>
        (
          await c.query(
            `select "filiale_id", "valeurs_apres" from "journal_audit"
              where "action" = 'administration' order by "numero"`,
          )
        ).rows,
    );
    assert.equal(entrees.length, 2);
    assert.deepEqual(entrees.map((e) => e.filiale_id).sort(), [FILIALE_A, FILIALE_B].sort());
    for (const entree of entrees) {
      assert.equal(entree.valeurs_apres.destinataires, 1);
      assert.ok(!JSON.stringify(entree).includes('@exemple.interne'));
    }
  });
});
