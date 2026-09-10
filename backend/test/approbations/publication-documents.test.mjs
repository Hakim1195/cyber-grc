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

/* =====================================================================
 *  Q-280 — les deux voies que l'auditeur a empruntées
 * =====================================================================
 *
 * La migration `019` écrivait dans son propre en-tête qu'elle fermait le cas
 * *« un circuit existe pour ce document, quel que soit son statut : **on ne le
 * contourne pas en repassant par “brouillon”** »*. Le 7ᵉ passage de la porte S8
 * a montré qu'on le contournait quand même.
 *
 * ── VOIE 1 — deux gestes, et elle était réelle ──────────────────────────────
 *
 * La condition était `v_dernier_tour is null AND old.statut is distinct from
 * 'en validation'` : sa seconde moitié ne s'armait que s'il existait **au moins
 * une ligne** dans `approbations`. Un document déclaré « en validation »
 * **avant qu'aucune étape n'ait été prononcée** se publiait donc en repassant
 * par « brouillon » — et le journal gardait le refus et le contournement à
 * trois lignes d'écart. Ce qui manquait était une **mémoire** : le déclencheur
 * ne regardait que l'état PRÉCÉDENT, et « brouillon » l'effaçait.
 * Migration `023`, colonne `validation_engagee`, que rien ne remet à faux.
 *
 * ── VOIE 2 — et ici je diverge du rapport, mesure à l'appui ─────────────────
 *
 * Le rapport présente `POST /api/reprise` créant une PSSI « en vigueur » sans
 * approbation comme une seconde voie de contournement, « pire » que la
 * première. **Ce n'en est pas une**, et c'est mesurable en une requête : la
 * route ordinaire `POST /api/entites/documents` avec `statut: "en vigueur"`
 * rend **201** — voir le §3 ci-dessous. Le produit **n'impose pas de circuit à
 * tout document**, c'est le cadrage de D5, et la reprise ne fait qu'user de la
 * même liberté.
 *
 * ⚠️ **La barrière à l'INSERTION a néanmoins été posée, parce qu'elle ferme un
 * cas RÉEL que le rapport n'avait pas isolé** : restaurer un document qui, lui,
 * **avait engagé son circuit** — et le faire revenir « en vigueur » sans
 * approbation. Le §4 le mesure.
 *
 * ⚠️ **Et elle est DIFFÉRÉE, ce qui n'est pas un détail** : une reprise
 * restaure un jeu entier, et les approbations peuvent arriver **après** les
 * documents. Immédiate, la barrière refuserait une restauration parfaitement
 * saine — elle casserait la fonction la plus critique du produit pour fermer un
 * contournement. Le §5 tient cette moitié.
 */
describe('Q-280 — la barrière de publication ferme ses deux voies', () => {
  test('§1 VOIE 1 : « en validation » → « brouillon » → « en vigueur » est REFUSÉ', async () => {
    const doc = await creerDocument({
      titre: 'PSSI — essai Q-280 voie 1',
      type: 'Politique de sécurité (PSSI)',
      statut: 'brouillon',
    });

    // On engage le circuit SANS prononcer une seule étape : c'est le cas que la
    // rédaction précédente laissait passer, faute de ligne dans `approbations`.
    const enValidation = await poserStatut(doc, 'en validation');
    assert.equal(enValidation.statut, 200, JSON.stringify(enValidation.corps));
    doc.version = enValidation.corps.enregistrement._version;

    const direct = await poserStatut(doc, 'en vigueur');
    assert.equal(direct.statut, 409, 'la voie directe doit rester refusée');
    assert.equal(direct.corps.code_grc, 'GRC06');

    const retour = await poserStatut(doc, 'brouillon');
    assert.equal(retour.statut, 200, 'revenir en brouillon reste légitime : on abandonne');
    doc.version = retour.corps.enregistrement._version;

    const contournement = await poserStatut(doc, 'en vigueur');
    assert.equal(
      contournement.statut,
      409,
      'LE CONTOURNEMENT : repasser par « brouillon » efface l’état précédent, mais pas la ' +
        'mémoire du circuit engagé (constat Q-280, voie 1).',
    );
    assert.equal(contournement.corps.code_grc, 'GRC06');
    assert.equal(await statutEnBase(doc.id), 'brouillon', 'et la base ne doit pas avoir bougé');
  });

  test('§2 la mémoire ne bloque pas un circuit MENÉ À SON TERME', async () => {
    // La moitié négative : sans elle, une barrière qui refuse TOUT passerait le §1.
    const doc = await creerDocument({
      titre: 'PSSI — essai Q-280, circuit complet',
      type: 'Politique de sécurité (PSSI)',
      statut: 'brouillon',
    });
    const enValidation = await poserStatut(doc, 'en validation');
    doc.version = enValidation.corps.enregistrement._version;
    await menerLeCircuit(doc.id);
    const publie = await poserStatut(doc, 'en vigueur');
    assert.equal(publie.statut, 200, JSON.stringify(publie.corps));
    assert.equal(await statutEnBase(doc.id), 'en vigueur');
  });

  test('§3 un document qui n’a JAMAIS engagé de circuit se publie librement', async () => {
    // ⚠️ **C'est ce paragraphe qui réfute la « voie 2 » du rapport.** Le produit
    // n'impose pas de circuit à tout document — c'est le cadrage de D5 — et la
    // reprise ne fait qu'user de la même liberté que cette route.
    const cree = await serveur.appeler('POST', '/api/entites/documents', {
      corps: {
        champs: {
          titre: 'Procédure — publiée sans circuit, et c’est permis',
          type: 'Procédure',
          statut: 'en vigueur',
        },
      },
    });
    assert.equal(
      cree.statut,
      201,
      'Le produit N’IMPOSE PAS de circuit à tout document. Si ce paragraphe rougit, c’est ' +
        'que la barrière est devenue trop large — et alors « POST /api/reprise crée une PSSI ' +
        'en vigueur » cesse d’être une comparaison valable.',
    );
    assert.equal(await statutEnBase(cree.corps.enregistrement.id), 'en vigueur');
  });

  test('§4 VOIE 2 réelle : restaurer un document AYANT engagé son circuit est refusé', async () => {
    // Le cas que le rapport n'avait pas isolé, et le seul qui soit un vrai
    // contournement à l'insertion : le document porte la mémoire de son
    // circuit, et revient « en vigueur » sans qu'aucune publication ne soit
    // approuvée.
    // ⚠️ **Le `try` entoure `avecPerimetre`, PAS la requête**, et c'est la
    // nature même d'un déclencheur différé : il ne s'exécute pas à l'`insert`,
    // il s'exécute au **commit**. La première rédaction attrapait l'exception
    // autour du `query` et n'en voyait aucune — l'insertion « réussissait »,
    // puis la validation de la transaction échouait plus loin. Un essai qui
    // regarde au mauvais instant conclut au mauvais endroit.
    let insertion = null;
    try {
      await base.avecPerimetre(
        applicatif,
        { utilisateur: 'reprise', filialeId: FILIALE_A, filiales: [FILIALE_A] },
        async (c) =>
          await c.query(
            `insert into "documents" ("id", "filiale_id", "titre", "type", "statut",
                                      "validation_engagee", "cree_par")
             values ($1, $2, 'PSSI restaurée sans approbation', 'Politique de sécurité (PSSI)',
                     'en vigueur', true, $3)`,
            [`DOC-${String(Date.now())}-q280restauration`, FILIALE_A, LOGIN],
          ),
        { annuler: false },
      );
    } catch (e) {
      insertion = e;
    }
    assert.notEqual(insertion, null, 'l’insertion aurait dû être refusée AU COMMIT');
    assert.equal(
      insertion.code,
      'GRC06',
      `Le refus doit porter le code GRC06 : ${String(insertion?.message)}`,
    );
  });

  test('§5 la barrière est DIFFÉRÉE : une reprise saine passe, approbations après documents', async () => {
    // ⚠️ **La moitié la plus importante du lot.** Une reprise restaure un jeu
    // entier ; selon l'ordre, les approbations arrivent APRÈS les documents.
    // Une barrière immédiate refuserait une restauration parfaitement saine —
    // elle casserait la fonction la plus critique du produit pour fermer un
    // contournement. Ce paragraphe insère dans le pire ordre possible.
    const id = `DOC-${String(Date.now())}-q280differe`;
    const erreur = await base.avecPerimetre(
      applicatif,
      { utilisateur: 'reprise', filialeId: FILIALE_A, filiales: [FILIALE_A] },
      async (c) => {
        try {
          await c.query(
            `insert into "documents" ("id", "filiale_id", "titre", "type", "statut",
                                      "validation_engagee", "cree_par")
             values ($1, $2, 'PSSI restaurée AVEC son circuit', 'Politique de sécurité (PSSI)',
                     'en vigueur', true, $3)`,
            [id, FILIALE_A, LOGIN],
          );
          // Les approbations arrivent APRÈS — c'est tout l'objet du paragraphe.
          for (const [ordre, etape] of [
            [1, 'redaction'],
            [1, 'revue'],
            [1, 'approbation'],
            [1, 'publication'],
          ]) {
            await c.query(
              // `acteur_libelle` est exigé dès que la décision est prise
              // (`ck_approbations_acteur`) : une approbation doit être
              // attribuable à quelqu'un, et le schéma ne l'oublie pas.
              `insert into "approbations" ("id", "filiale_id", "objet_type", "objet_id",
                                           "ordre", "etape", "statut", "acteur_id",
                                           "acteur_libelle", "date_decision", "cree_par")
               values ($1, $2, 'document', $3, $4, $5, 'approuve', null, $6, now(), $7)`,
              // `acteur_id` reste NUL : c'est une clé étrangère vers
              // `utilisateurs`, et ce paragraphe éprouve l'ORDRE d'insertion,
              // pas l'annuaire. `acteur_libelle` porte l'attribution, que
              // `ck_approbations_acteur` exige dès qu'une décision est prise.
              [
                `APP-${String(Date.now())}-${etape}`,
                FILIALE_A, id, ordre, etape, 'RSSI Toulouse', LOGIN,
              ],
            );
          }
          return null;
        } catch (e) {
          return e;
        }
      },
      { annuler: false },
    );
    assert.equal(
      erreur,
      null,
      'Une reprise SAINE doit passer, même quand les approbations arrivent après les ' +
        `documents. La barrière n’est plus différée : ${String(erreur?.message)}`,
    );
    assert.equal(await statutEnBase(id), 'en vigueur');
  });
});
