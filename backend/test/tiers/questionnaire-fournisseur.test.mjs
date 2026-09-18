/**
 * questionnaire-fournisseur.test.mjs — **L'ENVOI, LA RELANCE ET LE REVERSEMENT
 * DES RÉPONSES** (lot L21, action 21.2 — migration `043`)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * La migration `043` a été livrée avec ses tables, son état dérivé, ses
 * politiques et son garde-fou — et **mordue par rien**. Les balayages
 * génériques (`test/base/rls.test.mjs`, `test/api/entites-familles.test.mjs`,
 * `test/pieces/*`) la voient comme *une table de plus* : ils vérifient qu'elle
 * est cloisonnée, qu'elle entre dans le modèle, que ses pièces suivent leur
 * porteur. Aucun ne mesure ce qu'elle **promet** :
 *
 *   · qu'un questionnaire reçu n'est pas affiché « en retard » ;
 *   · qu'un brouillon n'est pas compté parmi les retards ;
 *   · qu'on ne relance ni ne reçoit ce qu'on n'a pas envoyé ;
 *   · que réimporter deux fois le même fichier échoue **bruyamment**.
 *
 * C'est la classe du constat **Q-69** — *« écrit, lu, et mordu par rien »* — et
 * celle du **§18.4** : un garde-fou que rien n'appelle est un commentaire.
 *
 * | § | Propriété mesurée |
 * |---|---|
 * | 1 | L'état est DÉRIVÉ, et les deux ordres qui comptent tiennent |
 * | 2 | Les trois règles de chronologie sont dans le SCHÉMA, et elles mordent |
 * | 3 | Le vocabulaire des réponses est clos — ÉPROUVÉ, pas relu |
 * | 4 | Le réimport est idempotent PAR LA CONTRAINTE |
 * | 5 | Ce que la route compte, et ce qu'elle se refuse à compter |
 * | 6 | Cloisonnement : la clé composite, et l'invisible du voisin |
 * | 7 | Le droit de lire les tiers, et une liste vide qui DIT pourquoi |
 * | 8 | La cascade : supprimer le tiers emporte l'envoi et les réponses |
 *
 * ── ⚠️ CE QUI EST MESURÉ PAR LA BASE, ET CE QUI L'EST PAR LA ROUTE ─────────
 *
 * Les deux, et à dessein. Le constat **Q-325** est né d'un refus soigné en base
 * qui arrivait à l'écran en `500` avec sa pile d'appel : *un essai qui prouve
 * que le déclencheur se déclenche ne mesure pas ce que l'utilisateur reçoit*.
 * Réciproquement, un essai qui ne passe que par la route ne voit pas ce que
 * `psql`, l'import généralisé ou la reprise d'un export peuvent écrire — et
 * c'est le motif du §8.1 : *une route ne voit que son chemin ; il y en a
 * toujours un de plus.*
 *
 * ── ⚠️ LES CONTRAINTES SONT ÉPROUVÉES, PAS RELUES (§39.1) ──────────────────
 *
 * Aucun essai de ce fichier ne lit le texte d'un `check` dans le catalogue :
 * chacun **tente la valeur interdite** dans une transaction annulée et exige le
 * refus, en s'ancrant sur le NOM de la contrainte violée. C'est la leçon du
 * 8ᵉ passage de la porte S8 : `check (… or true)` rendait **0 anomalie** à un
 * garde qui reconnaissait la sous-chaîne au lieu de mesurer le sens.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let applicatif;
/** Session de la filiale A, qui lit les tiers. */
let lecteur;
/** La même filiale, sans le domaine « tiers » — pour le §7. */
let etranger;
/** Session de la filiale B : elle sert à mesurer l'invisible, et le motif du vide. */
let lecteurB;

/** Périmètre au format de l'API — `utilisateurId`, pas `utilisateur` (REPRISE §5.7). */
function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/**
 * Une session dont on CHOISIT les droits — même dispositif que
 * `test/tiers/registre-dora.test.mjs` et `test/api/droits-application.test.mjs`.
 *
 * ⚠️ Sans elle, le §7 ne mesurerait rien : `monterGreffon` seul retombe sur
 * `DROITS_PROVISOIRES_DEVELOPPEMENT`, qui porte tous les domaines. Un essai qui
 * croit régler un droit qu'il ne règle pas consacre le défaut qu'il cherche.
 */
class SessionDeBanc {
  constructor(perimetre_, droits) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perimetre_ });
    this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return {
      perimetre: this._perimetre,
      droits: this._droits,
      identite: null,
      sessionOuverte: false,
    };
  }

  decrire() {
    return 'session du banc d’essai (test/tiers/questionnaire-fournisseur.test.mjs)';
  }
}

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

/** Les mêmes domaines, moins celui des tiers. */
const SANS_TIERS = Object.freeze(TOUS_DOMAINES.filter((d) => d !== 'tiers'));

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  const pA = perimetreApi(FILIALE_A, [FILIALE_A]);
  const pB = perimetreApi(FILIALE_B, [FILIALE_B]);

  lecteur = await monterGreffon(base, pA, {
    resolveur: new SessionDeBanc(pA, { niveau: 'validation', domaines: TOUS_DOMAINES, export: true }),
  });
  etranger = await monterGreffon(base, pA, {
    resolveur: new SessionDeBanc(pA, { niveau: 'validation', domaines: SANS_TIERS, export: true }),
  });
  lecteurB = await monterGreffon(base, pB, {
    resolveur: new SessionDeBanc(pB, { niveau: 'validation', domaines: TOUS_DOMAINES, export: true }),
  });

  // ── Le jeu propre à ce fichier, en plus de `QUES-A` du semis ──────────────
  //
  // ⚠️ Quatre envois qui couvrent les quatre états, et un cinquième qui porte
  // les réponses. Les dates sont RELATIVES à `current_date` : les écrire en dur
  // ferait passer l'essai au vert ou au rouge selon le jour où on le joue, et
  // un essai dont le verdict dépend du calendrier ne mesure plus le produit.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into questionnaires_tiers
             (id, filiale_id, prestataire_id, ref_id, intitule,
              envoye_le, echeance, relance_le, recu_le)
         values
             -- Reçu APRÈS son échéance : l'affaire est close, et c'est le cas qui
             -- fait toute la valeur de l'ordre des branches.
             ('QT-RECU-TARD', $1, 'PRES-A', 'aircyber', 'Reçu en retard',
              current_date - 60, current_date - 30, current_date - 20, current_date - 5),
             -- Jamais envoyé, et portant une échéance DÉJÀ PASSÉE : un brouillon
             -- n'est pas un retard. La contrainte de chronologie l'autorise
             -- précisément parce que la date d’envoi est nulle.
             ('QT-BROUILLON', $1, 'PRES-A', 'anssi-hygiene', 'Pas encore envoyé',
              null, current_date - 10, null, null),
             -- Envoyé, sans échéance : on attend, et rien ne dit qu'on attend trop.
             ('QT-SANS-ECHEANCE', $1, 'PRES2-A', 'iso-27002-2022', 'Sans date de retour',
              current_date - 15, null, null, null),
             -- L'échéance est AUJOURD'HUI : la journée n'est pas finie.
             ('QT-AUJOURDHUI', $1, 'PRES2-A', 'aircyber', 'Échéance du jour',
              current_date - 7, current_date, null, null),
             -- Celui qui porte les réponses.
             ('QT-REPONDU', $1, 'PRES2-A', 'aircyber', 'Avec des réponses',
              current_date - 40, current_date - 3, current_date - 10, current_date - 1)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into questionnaire_reponses
             (id, filiale_id, questionnaire_id, code, reponse, commentaire, preuve)
         values
             ('QR-1', $1, 'QT-REPONDU', 'A1', 'oui',     'Fait.', 'PSSI §4'),
             ('QR-2', $1, 'QT-REPONDU', 'A2', 'non',     'Pas de chiffrement des sauvegardes.', null),
             ('QR-3', $1, 'QT-REPONDU', 'A3', 'non',     null, null),
             ('QR-4', $1, 'QT-REPONDU', 'A4', 'partiel', 'En cours de déploiement.', null),
             ('QR-5', $1, 'QT-REPONDU', 'A5', 'na',      'Pas de développement interne.', null)`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await lecteur?.fermer();
  await etranger?.fermer();
  await lecteurB?.fermer();
  await base?.fermer();
});

/** Les questionnaires rendus par la route, indexés par identifiant. */
async function questionnaires(session = lecteur) {
  const reponse = await session.appeler('GET', '/api/tiers/questionnaires');
  assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
  return { corps: reponse.corps, parId: new Map(reponse.corps.questionnaires.map((q) => [q.id, q])) };
}

/**
 * Tente une écriture dans une transaction ANNULÉE et rend l'erreur de
 * PostgreSQL. ⚠️ Annulée, et non « nettoyée dans un `finally` » : la leçon du
 * 11/09, écrite au `CONVENTIONS.md` — une mutation se joue dans une
 * transaction qui ne sera jamais validée, sinon l'essai laisse derrière lui
 * l'état qu'il vient de fabriquer.
 */
async function refus(texte, valeurs = []) {
  try {
    await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(texte, valeurs);
      },
    );
  } catch (erreur) {
    return erreur;
  }
  return null;
}

describe('§1 — l’état est DÉRIVÉ, et les deux ordres qui comptent tiennent', () => {
  test('les quatre valeurs sortent de la base, pas d’une comparaison de dates du serveur', async () => {
    const { parId } = await questionnaires();

    // ⚠️ LE CAS QUI PORTE LE §1 : reçu APRÈS l'échéance. La branche « recu » est
    // testée en premier dans `f_etat_questionnaire()`, et si elle ne l'était
    // pas, le produit enverrait relancer quelqu'un qui a déjà répondu.
    assert.equal(parId.get('QT-RECU-TARD').etat, 'recu');
    assert.equal(parId.get('QT-RECU-TARD').recuLe !== null, true);

    // ⚠️ Un brouillon n'est pas un retard, même avec une échéance dépassée :
    // compter les brouillons parmi les retards fabriquerait des alertes que
    // l'utilisateur s'est infligées à lui-même.
    assert.equal(parId.get('QT-BROUILLON').etat, 'brouillon');
    assert.equal(parId.get('QT-BROUILLON').envoyeLe, null);

    assert.equal(parId.get('QT-SANS-ECHEANCE').etat, 'en_attente');
    assert.equal(parId.get('QT-AUJOURDHUI').etat, 'en_attente');

    // Le questionnaire du semis : envoyé le 01/02/2026, attendu le 15/03/2026,
    // jamais reçu.
    assert.equal(parId.get('QUES-A').etat, 'en_retard');
  });

  test('la borne du jour : aujourd’hui n’est pas en retard, hier l’est', async () => {
    // Mesuré sur la FONCTION, et non sur une ligne : c'est la frontière qu'un
    // `<=` au lieu d'un `<` déplacerait d'un jour, et une ligne semée ne la
    // montre pas.
    const bornes = await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            `select f_etat_questionnaire(current_date - 5, current_date,     null) as aujourdhui,
                    f_etat_questionnaire(current_date - 5, current_date - 1, null) as hier,
                    f_etat_questionnaire(current_date - 5, current_date + 1, null) as demain,
                    f_etat_questionnaire(null,             current_date - 9, null) as brouillon,
                    f_etat_questionnaire(current_date - 5, current_date - 1,
                                         current_date)                            as recu_tard`,
          )
        ).rows[0],
    );

    assert.equal(bornes.aujourdhui, 'en_attente');
    assert.equal(bornes.hier, 'en_retard');
    assert.equal(bornes.demain, 'en_attente');
    assert.equal(bornes.brouillon, 'brouillon');
    assert.equal(bornes.recu_tard, 'recu');
  });

  test('l’état n’est PAS une colonne — le schéma ne le stocke nulle part', async () => {
    // ⚠️ La propriété qui tient tout le reste : une colonne d'état doit être
    // écrite, donc remise à jour ; un traitement qui la remet peut ne pas
    // tourner. Mesuré DANS LE CATALOGUE, jamais dans le texte de la migration.
    const colonnes = await base.lignes(
      applicatif,
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'questionnaires_tiers'
          and column_name in ('etat', 'statut', 'en_retard')`,
    );
    assert.deepEqual(colonnes, []);
  });
});

describe('§2 — les trois règles de chronologie sont dans le SCHÉMA, et elles mordent', () => {
  test('on ne RELANCE pas ce qu’on n’a pas envoyé', async () => {
    const erreur = await refus(
      `insert into questionnaires_tiers (id, filiale_id, prestataire_id, ref_id, relance_le)
       values ('QT-X1', $1, 'PRES-A', 'aircyber', current_date)`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null, 'une relance sans envoi devrait être refusée');
    assert.equal(erreur.constraint, 'ck_questionnaires_tiers_relance');
  });

  test('une relance ANTÉRIEURE à l’envoi est refusée aussi — la règle porte l’ordre, pas la présence', async () => {
    const erreur = await refus(
      `insert into questionnaires_tiers
           (id, filiale_id, prestataire_id, ref_id, envoye_le, relance_le)
       values ('QT-X2', $1, 'PRES-A', 'aircyber', current_date - 3, current_date - 10)`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_questionnaires_tiers_relance');
  });

  test('on ne REÇOIT pas ce qu’on n’a pas envoyé', async () => {
    const erreur = await refus(
      `insert into questionnaires_tiers (id, filiale_id, prestataire_id, ref_id, recu_le)
       values ('QT-X3', $1, 'PRES-A', 'aircyber', current_date)`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_questionnaires_tiers_reception');
  });

  test('une échéance ANTÉRIEURE à l’envoi n’a jamais laissé le temps de répondre', async () => {
    const erreur = await refus(
      `insert into questionnaires_tiers
           (id, filiale_id, prestataire_id, ref_id, envoye_le, echeance)
       values ('QT-X4', $1, 'PRES-A', 'aircyber', current_date, current_date - 1)`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_questionnaires_tiers_echeance');
  });

  test('et un brouillon garde le droit de porter une échéance passée', async () => {
    // La contrainte dit `envoye_le is null or …` : sans cette branche, on ne
    // pourrait pas préparer un questionnaire pour une date déjà dépassée —
    // c'est-à-dire reprendre un retard existant, qui est le cas courant d'une
    // acquisition. Le semis de ce fichier en dépend (`QT-BROUILLON`).
    const erreur = await refus(
      `insert into questionnaires_tiers (id, filiale_id, prestataire_id, ref_id, echeance)
       values ('QT-X5', $1, 'PRES-A', 'aircyber', current_date - 30)`,
      [FILIALE_A],
    );
    assert.equal(erreur, null, 'un brouillon avec une échéance passée doit être accepté');
  });
});

describe('§3 — le vocabulaire des réponses est clos, et ÉPROUVÉ plutôt que relu', () => {
  test('une valeur hors des quatre est refusée', async () => {
    const erreur = await refus(
      `insert into questionnaire_reponses (id, filiale_id, questionnaire_id, code, reponse)
       values ('QR-X', $1, 'QT-REPONDU', 'ZZ', 'peut-etre')`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null, '« peut-etre » ne devrait pas entrer');
    assert.equal(erreur.constraint, 'ck_questionnaire_reponses_reponse');
  });

  test('les quatre valeurs, elles, entrent — dont « partiel », qu’AirCyber n’emploie pas', async () => {
    for (const valeur of ['oui', 'non', 'partiel', 'na']) {
      const erreur = await refus(
        `insert into questionnaire_reponses (id, filiale_id, questionnaire_id, code, reponse)
         values ('QR-OK', $1, 'QT-REPONDU', 'ZZ', $2)`,
        [FILIALE_A, valeur],
      );
      assert.equal(erreur, null, `« ${valeur} » devrait être accepté`);
    }
  });

  test('un code vide est refusé — c’est la clé de jointure avec le catalogue', async () => {
    const erreur = await refus(
      `insert into questionnaire_reponses (id, filiale_id, questionnaire_id, code, reponse)
       values ('QR-X2', $1, 'QT-REPONDU', '', 'oui')`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'ck_questionnaire_reponses_code');
  });
});

describe('§4 — le réimport est idempotent PAR LA CONTRAINTE, pas par une intention', () => {
  test('rejouer la même réponse échoue BRUYAMMENT au lieu de doubler le compte', async () => {
    // ⚠️ C'est la propriété centrale de l'action 21.2 : le moteur d'import du
    // lot L7 CRÉE, il ne met pas à jour (trois motifs écrits). Un second
    // passage du même fichier doit donc heurter une contrainte — sans elle, il
    // doublerait les réponses en silence, et tous les comptes de la fiche
    // fournisseur seraient faux sans qu'aucune erreur ne l'annonce.
    const erreur = await refus(
      `insert into questionnaire_reponses (id, filiale_id, questionnaire_id, code, reponse)
       values ('QR-DOUBLON', $1, 'QT-REPONDU', 'A1', 'non')`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null, 'le doublon (filiale, questionnaire, code) devrait être refusé');
    assert.equal(erreur.constraint, 'uq_questionnaire_reponses_question');

    // Et la première réponse est intacte : le refus n'a rien écrasé.
    const { parId } = await questionnaires();
    assert.equal(parId.get('QT-REPONDU').reponses, 5);
  });

  test('le même code sous un AUTRE questionnaire est légitime', async () => {
    const erreur = await refus(
      `insert into questionnaire_reponses (id, filiale_id, questionnaire_id, code, reponse)
       values ('QR-AUTRE', $1, 'QUES-A', 'A1', 'oui')`,
      [FILIALE_A],
    );
    assert.equal(erreur, null, 'l’unicité porte le questionnaire, pas le seul code');
  });
});

describe('§5 — ce que la route compte, et ce qu’elle se refuse à compter', () => {
  test('les trois comptes qui intéressent un acheteur', async () => {
    const { parId } = await questionnaires();
    const q = parId.get('QT-REPONDU');

    assert.equal(q.reponses, 5);
    // ⚠️ Ce qui intéresse vraiment : ce à quoi le fournisseur a répondu NON, ou
    // à moitié. Un compte de réponses seul ne dit rien — cinq réponses peuvent
    // être cinq « oui » comme cinq « non ».
    assert.equal(q.reponsesNon, 2);
    assert.equal(q.reponsesPartiel, 1);
    assert.equal(q.societe, 'Sauvegardes Atlantique');
    assert.equal(q.refId, 'aircyber');
  });

  test('aucun POURCENTAGE : le serveur ne sait pas combien de questions porte un référentiel', async () => {
    // Le catalogue vit dans le frontend. Rendre un taux ici obligerait à
    // recopier le nombre de questions côté serveur — une seconde source qui se
    // tromperait le jour où BoostAerospace révise son questionnaire.
    const { corps } = await questionnaires();
    const champs = Object.keys(corps.questionnaires[0]);
    for (const interdit of ['taux', 'pourcentage', 'questions', 'avancement', 'progression']) {
      assert.equal(champs.includes(interdit), false, `« ${interdit} » ne doit pas être servi ici`);
    }
  });

  test('l’ordre sert la relance : l’échéance d’abord, les sans-date à la fin', async () => {
    const { corps } = await questionnaires();
    const echeances = corps.questionnaires.map((q) => q.echeance);
    const datees = echeances.filter((e) => e !== null);
    const trie = [...datees].sort();
    assert.deepEqual(datees, trie, 'les échéances doivent être croissantes');
    // Les sans-échéance ferment la liste : `nulls last`.
    const premierNul = echeances.indexOf(null);
    if (premierNul !== -1) {
      assert.deepEqual(echeances.slice(premierNul), echeances.slice(premierNul).map(() => null));
    }
  });
});

describe('§6 — cloisonnement : la clé composite, et l’invisible du voisin', () => {
  test('la filiale A ne voit aucun questionnaire de la filiale B', async () => {
    const { parId } = await questionnaires();
    assert.equal(parId.has('QUES-B'), false);
    assert.ok(parId.has('QUES-A'));
  });

  test('un questionnaire ne peut pas viser un prestataire INVISIBLE de la filiale voisine', async () => {
    // ⚠️ Le motif du `CONVENTIONS.md` §17.1, et il est contre-intuitif : une clé
    // étrangère SIMPLE serait satisfaite par une ligne que la RLS cache — on
    // adresserait un questionnaire à une société qu'on ne voit pas. La clé est
    // composite, et c'est ce que cet essai mesure.
    const erreur = await refus(
      `insert into questionnaires_tiers (id, filiale_id, prestataire_id, ref_id)
       values ('QT-VOISIN', $1, 'PRES-B', 'aircyber')`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null, 'pointer le prestataire du voisin devrait être refusé');
    assert.equal(erreur.constraint, 'fk_questionnaires_tiers_prestataire');
  });

  test('une réponse ne peut pas se rattacher au questionnaire du voisin', async () => {
    const erreur = await refus(
      `insert into questionnaire_reponses (id, filiale_id, questionnaire_id, code, reponse)
       values ('QR-VOISIN', $1, 'QUES-B', 'A1', 'oui')`,
      [FILIALE_A],
    );
    assert.notEqual(erreur, null);
    assert.equal(erreur.constraint, 'fk_questionnaire_reponses_questionnaire');
  });
});

describe('§7 — le droit de lire les tiers, et une liste vide qui DIT pourquoi', () => {
  test('sans le domaine « tiers », la route refuse 403', async () => {
    const r = await etranger.appeler('GET', '/api/tiers/questionnaires');
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
  });

  test('une liste non vide ne porte AUCUN motif — un message sans objet s’apprend à ne plus lire', async () => {
    const { corps } = await questionnaires();
    assert.ok(corps.questionnaires.length > 0);
    assert.equal(corps.motif, '');
    assert.equal(corps.tronque, false);
  });

  test('une liste vide dit pourquoi elle est vide, et comment on la remplit', async () => {
    // ⚠️ Classe Q-201 / Q-207 : un écran vide qui ne dit pas pourquoi apprend à
    // ne plus croire ce qu'on montre. On vide donc RÉELLEMENT la filiale B —
    // dans une transaction VALIDÉE, sans quoi la route, qui ouvre la sienne, ne
    // verrait rien de l'effet.
    await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_B, [FILIALE_B]),
      async (c) => {
        await c.query('delete from questionnaires_tiers');
      },
      { annuler: false },
    );

    const { corps } = await questionnaires(lecteurB);
    assert.deepEqual(corps.questionnaires, []);
    assert.match(corps.motif, /Aucun questionnaire/);
    assert.match(corps.motif, /import/);
  });
});

describe('§8 — la cascade : supprimer le tiers emporte l’envoi et les réponses', () => {
  test('supprimer un prestataire ne laisse ni questionnaire ni réponse derrière lui', async () => {
    // Le sens de la cascade est celui du porteur : un questionnaire adressé à
    // une société qui n'est plus référencée n'a plus d'objet. ⚠️ Mesuré dans une
    // transaction ANNULÉE — l'essai ne laisse pas derrière lui l'état qu'il
    // fabrique, et les familles qui suivent voient le jeu intact.
    const restes = await base.avecPerimetre(
      applicatif,
      perimetre('essai', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(`delete from prestataire_sous_traitance`);
        await c.query(`delete from prestataires where id = 'PRES2-A'`);
        return {
          envois: Number(
            (
              await c.query(
                `select count(*)::int as n from questionnaires_tiers where prestataire_id = 'PRES2-A'`,
              )
            ).rows[0].n,
          ),
          reponses: Number(
            (
              await c.query(
                `select count(*)::int as n from questionnaire_reponses
                  where questionnaire_id = 'QT-REPONDU'`,
              )
            ).rows[0].n,
          ),
        };
      },
    );

    assert.equal(restes.envois, 0);
    // ⚠️ La cascade traverse DEUX niveaux : le prestataire emporte l'envoi, et
    // l'envoi emporte ses réponses. Sans le second maillon, les réponses
    // resteraient invisibles et hors de portée de la purge RGPD — c'est la
    // classe du constat Q-284.
    assert.equal(restes.reponses, 0);
  });
});
