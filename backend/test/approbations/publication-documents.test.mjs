/**
 * publication-documents.test.mjs — **une politique ne se publie pas toute seule.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Action **D5** de la vague 9 (`docs/PLAN_EXECUTION.md` §3)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le lot L8 livrait le circuit — quatre étapes, chaque décision horodatée,
 * attribuée, irréversible. Et **rien ne le reliait au document** : on pouvait
 * laisser le circuit à mi-chemin, ouvrir la fiche, choisir « en vigueur » dans la
 * liste déroulante, enregistrer. Le registre affichait alors une politique en
 * vigueur que personne n'avait approuvée — et à la question d'audit *« qui a
 * validé cette PSSI ? »*, le produit répondait « personne ».
 *
 * ── Les quatre propriétés mesurées ───────────────────────────────────────
 *
 *  1. **le refus**, depuis « en validation », circuit inachevé → `GRC06`, 409 ;
 *  2. **le contournement fermé** : repasser par « brouillon » ne suffit pas, dès
 *    lors qu'un circuit existe. C'est la moitié que la formulation littérale de
 *    D5 laissait ouverte ;
 *  3. **le passage**, une fois la publication approuvée. ⚠️ Sans lui, « tout est
 *    refusé » passerait pour « la barrière fonctionne » — c'est la morsure de la
 *    morsure, et ce fichier serait un décor sans elle ;
 *  4. **la trace** : le refus est journalisé **avec sa route**, comme le critère
 *    d'acceptation l'exige. Un refus muet ne se distingue pas d'une absence de
 *    tentative, et c'est précisément la tentative qui intéresse un auditeur.
 *
 * ⚠️ **Ce que cet essai NE mesure PAS, et le §17.5 impose de le dire** : la base
 * ne vérifie pas que l'approbation porte encore sur le CONTENU actuel. C'est
 * `empreinte_objet`, tenue par le lot L8 et affichée par l'encart ; la refaire
 * dans le déclencheur obligerait à recopier `COLONNES_HORS_EMPREINTE` en SQL.
 * Le chemin « approuver, modifier le texte, publier » reste donc ouvert dans la
 * base — il est au registre des constats, pas passé sous silence.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import {
  journalEnBase,
  monterApprobations,
  profil,
  SessionDEssai,
  sessionSite,
} from './aide.mjs';

const LOGIN = 'rssi.toulouse';

let base;
let serveur;
let proprietaire;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  const session = new SessionDEssai(sessionSite(FILIALE_A, LOGIN), profil('validation'));
  serveur = await monterApprobations(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Crée une fiche document et rend `{ id, version }`. */
async function creerDocument(champs) {
  const cree = await serveur.appeler('POST', '/api/entites/documents', { corps: { champs } });
  assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
  return { id: cree.corps.enregistrement.id, version: cree.corps.enregistrement._version ?? 1 };
}

/** Change le statut, et rend la réponse brute — c'est elle qui est jugée. */
async function poserStatut(doc, statut) {
  return await serveur.appeler('PUT', `/api/entites/documents/${doc.id}`, {
    corps: { version: doc.version, champs: { statut } },
  });
}

/** Le statut réellement en base — jamais celui que la réponse annonce. */
async function statutEnBase(id) {
  return await base.avecPerimetre(
    applicatif,
    { utilisateur: 'observateur', filialeId: FILIALE_A, filiales: [FILIALE_A] },
    async (c) => (await c.query('select statut from documents where id = $1', [id])).rows[0]?.statut,
  );
}

async function decider(id, etape) {
  return await serveur.appeler('POST', `/api/approbations/documents/${id}`, {
    corps: { etape, decision: 'approuve' },
  });
}

/** Mène le circuit documentaire jusqu'au bout. */
async function menerLeCircuit(id) {
  for (const etape of ['redaction', 'revue', 'approbation', 'publication']) {
    const r = await decider(id, etape);
    assert.equal(r.statut, 201, `étape ${etape} : ${JSON.stringify(r.corps)}`);
  }
}

describe('D5 — « en validation » ne devient pas « en vigueur » sans le circuit', () => {
  test('LE REFUS : circuit inachevé, la publication est refusée en GRC06', async () => {
    const doc = await creerDocument({ titre: 'PSSI du groupe', statut: 'en validation' });

    // Le circuit est ouvert mais laissé à mi-chemin : c'est le cas réel, pas un
    // circuit vide. Un circuit vide serait plus facile à refuser, et prouverait
    // moins.
    assert.equal((await decider(doc.id, 'redaction')).statut, 201);
    assert.equal((await decider(doc.id, 'revue')).statut, 201);

    const refus = await poserStatut(doc, 'en vigueur');
    assert.equal(refus.statut, 409, JSON.stringify(refus.corps));
    assert.equal(refus.corps.code_grc, 'GRC06');
    assert.match(
      refus.corps.message,
      /circuit d’approbation/u,
      'Le message doit dire QUOI FAIRE : le refus de la base est écrit pour l’utilisateur.',
    );
    assert.equal(
      await statutEnBase(doc.id),
      'en validation',
      'La réponse refuse et la base a changé quand même : le refus est décoratif.',
    );
  });

  test('LA TRACE : le refus est journalisé, avec sa route et le document visé', async () => {
    const avant = await journalEnBase(base, proprietaire, 'refus_autorisation');
    const doc = await creerDocument({ titre: 'Charte du groupe', statut: 'en validation' });
    assert.equal((await poserStatut(doc, 'en vigueur')).statut, 409);

    // Le crochet de trace est volontairement détaché de la réponse (« rien ne
    // doit retarder la réponse ») : on laisse l'écriture arriver.
    let apres = [];
    for (let essai = 0; essai < 40; essai += 1) {
      apres = await journalEnBase(base, proprietaire, 'refus_autorisation');
      if (apres.length > avant.length) break;
      await new Promise((resoudre) => setTimeout(resoudre, 25));
    }

    assert.ok(
      apres.length > avant.length,
      'Aucune trace du refus. Un refus muet ne se distingue pas d’une absence de tentative — ' +
        'et c’est la tentative qui intéresse un auditeur.',
    );
    const trace = apres[apres.length - 1];
    assert.equal(trace.entite_type, 'documents');
    assert.equal(trace.entite_id, doc.id, 'la trace doit nommer LE document, pas « un » document');
    assert.equal(trace.valeurs_apres.code_grc, 'GRC06');
    assert.equal(
      trace.valeurs_apres.route,
      '/api/entites/:entite/:identifiant',
      'La route est le GABARIT, jamais l’URL reçue (§29.5).',
    );
    assert.equal(trace.valeurs_apres.methode, 'PUT');
  });

  test('LE PASSAGE : la publication approuvée ouvre la porte', async () => {
    /* ⚠️ **La morsure de la morsure.** Sans cet essai, un déclencheur qui
       refuserait TOUT passerait pour une barrière qui fonctionne — et le produit
       serait inutilisable sans qu'un seul essai rougisse. */
    const doc = await creerDocument({ titre: 'Procédure de gestion des accès', statut: 'en validation' });
    await menerLeCircuit(doc.id);

    const publication = await poserStatut(doc, 'en vigueur');
    assert.equal(publication.statut, 200, JSON.stringify(publication.corps));
    assert.equal(await statutEnBase(doc.id), 'en vigueur');
  });

  test('LE CONTOURNEMENT : repasser par « brouillon » ne suffit pas', async () => {
    /* La formulation littérale de D5 ne parle que du statut « en validation ».
       Prise au pied de la lettre, elle laissait la porte grande ouverte : il
       suffisait de choisir « brouillon », d'enregistrer, puis « en vigueur ». La
       règle posée est donc plus large — dès qu'un circuit EXISTE, il faut le
       conclure. */
    const doc = await creerDocument({ titre: 'Politique de sauvegarde', statut: 'en validation' });
    assert.equal((await decider(doc.id, 'redaction')).statut, 201);

    const retour = await poserStatut(doc, 'brouillon');
    assert.equal(retour.statut, 200, JSON.stringify(retour.corps));
    const versionApres = retour.corps.enregistrement._version;

    const refus = await serveur.appeler('PUT', `/api/entites/documents/${doc.id}`, {
      corps: { version: versionApres, champs: { statut: 'en vigueur' } },
    });
    assert.equal(
      refus.statut,
      409,
      'Un aller-retour par « brouillon » a suffi à publier un document dont le circuit ' +
        'd’approbation est ouvert et inachevé.',
    );
    assert.equal(refus.corps.code_grc, 'GRC06');
    assert.equal(await statutEnBase(doc.id), 'brouillon');
  });

  test('SANS CIRCUIT, RIEN NE CHANGE : le produit n’impose pas de circuit partout', async () => {
    /* ⚠️ L'autre moitié de la mesure, et elle est indispensable. La moitié des
       procédures d'un site ne réclame aucun circuit ; exiger partout ferait qu'on
       cesserait de se servir du registre. Un essai qui ne mesurerait que le refus
       laisserait passer une barrière beaucoup trop large. */
    const doc = await creerDocument({ titre: 'Consigne d’impression', statut: 'brouillon' });
    const publication = await poserStatut(doc, 'en vigueur');
    assert.equal(publication.statut, 200, JSON.stringify(publication.corps));
    assert.equal(await statutEnBase(doc.id), 'en vigueur');
  });
});
