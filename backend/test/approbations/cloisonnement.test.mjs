/**
 * cloisonnement.test.mjs — **le circuit d'approbation ne franchit pas la
 * frontière d'une filiale**, dans les deux sens, sur une base qui n'est pas vide.
 *
 * ⚠️ *Un `0` sur une table cloisonnée ne distingue pas « vide » de « non
 * contrôlé ».* Chaque refus mesuré ici est donc encadré par deux constats :
 *
 *  · **ce qui existe chez la voisine** — lu par le propriétaire, sous un
 *    périmètre qui couvre les deux filiales, avant que la question soit posée ;
 *  · **ce qui existe après le refus** — pour montrer qu'il n'a rien laissé.
 *
 * Le scénario que ce fichier existe pour exclure est le **constat Q-2 du
 * quatrième passage de la porte S1**, et il n'est pas une fuite : c'est un déni
 * de service. Une filiale A pose une étape d'approbation **irrévocable** sur le
 * risque de B ; B ne peut alors plus jamais ouvrir son acceptation de risque
 * résiduel — celle que l'ISO 27001 exige nommément — et reçoit un « doublon »
 * sur une ligne qu'elle ne peut pas lire.
 *
 * Deux barrières l'interdisent, et les deux sont mesurées :
 *
 *  1. **structurelle** : `uq_approbations_etape` commence par `filiale_id`, donc
 *     A et B peuvent chacune tenir leur propre circuit sur le même `objet_id`
 *     sans se heurter ;
 *  2. **applicative** : `approbations.objet_id` est polymorphe et sans clé
 *     étrangère — la base ne peut pas vérifier que l'objet visé appartient à la
 *     filiale qui écrit, et c'est la route qui le refuse. Y compris depuis un
 *     périmètre **Groupe**, qui lit pourtant les deux.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  etapesEnBase,
  journalEnBase,
  monterApprobations,
  profil,
  SessionDEssai,
  sessionGroupe,
  sessionSite,
} from './aide.mjs';

const LOGIN_A = 'rssi.toulouse';
const LOGIN_B = 'rssi.allemagne';

let base;
let serveur;
let session;
let proprietaire;
let applicatif;

const url = (entite, id) => `/api/approbations/${entite}/${id}`;

/** Bascule la session du banc. Jamais depuis une requête (contrôle S2). */
function depuis(filiale, login) {
  session.poser(sessionSite(filiale, login), profil('validation'));
}

async function decider(entite, id, etape, decision = 'approuve') {
  return await serveur.appeler('POST', url(entite, id), { corps: { etape, decision } });
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(sessionSite(FILIALE_A, LOGIN_A), profil('validation'));
  serveur = await monterApprobations(base, session);

  // ── DE LA MATIÈRE DES DEUX CÔTÉS, avant la première question ────────
  //
  // Chaque filiale ouvre son propre circuit sur SON risque. Sans cela, « A ne
  // voit rien chez B » serait vrai parce qu'il n'y a rien chez B.
  depuis(FILIALE_A, LOGIN_A);
  assert.equal((await decider('risques', 'RISK-A', 'proposition')).statut, 201);
  depuis(FILIALE_B, LOGIN_B);
  assert.equal((await decider('risques', 'RISK-B', 'proposition')).statut, 201);
  assert.equal((await decider('risques', 'RISK-B', 'acceptation')).statut, 201);
  depuis(FILIALE_A, LOGIN_A);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — La matière existe, et elle est asymétrique
 * ===================================================================== */

describe('Le jeu d’essai n’est pas vide, et l’essai le dit avant de conclure', () => {
  test('les deux filiales portent des étapes, vues du propriétaire', async () => {
    const chezA = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    const chezB = await etapesEnBase(base, proprietaire, 'risque', 'RISK-B');
    assert.deepEqual(
      chezA.map((l) => [l.filiale_id, l.etape, l.statut]),
      [
        [FILIALE_A, 'acceptation', 'en_attente'],
        [FILIALE_A, 'proposition', 'approuve'],
      ],
    );
    assert.deepEqual(
      chezB.map((l) => [l.filiale_id, l.etape, l.statut]),
      [
        [FILIALE_B, 'acceptation', 'approuve'],
        [FILIALE_B, 'proposition', 'approuve'],
      ],
    );
  });
});

/* =====================================================================
 *  §2 — Lire : rien de la voisine, dans les deux sens
 * ===================================================================== */

describe('Un acteur d’une filiale ne LIT pas le circuit de la voisine', () => {
  test('depuis A, le risque de B est introuvable — et non « sans approbation »', async () => {
    depuis(FILIALE_A, LOGIN_A);
    const r = await serveur.appeler('GET', url('risques', 'RISK-B'));
    assert.equal(r.statut, 404, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'ressource_inconnue');
    // Rien du contenu de B ne transparaît dans le refus.
    assert.ok(!JSON.stringify(r.corps).includes(FILIALE_B));
    assert.ok(!/acceptation|approuve/u.test(r.corps.message));
  });

  test('MORSURE : depuis B, le même risque rend 200 et ses deux étapes', async () => {
    // Sans ce contraste, le 404 ci-dessus prouverait « l'objet n'existe pas »
    // et non « il ne vous appartient pas ».
    depuis(FILIALE_B, LOGIN_B);
    const r = await serveur.appeler('GET', url('risques', 'RISK-B'));
    assert.equal(r.statut, 200);
    assert.equal(r.corps.circuit.etat, 'complet');
    assert.deepEqual(
      r.corps.circuit.etapes.map((e) => [e.etape, e.statut, e.acteur]),
      [
        ['proposition', 'approuve', LOGIN_B],
        ['acceptation', 'approuve', LOGIN_B],
      ],
    );
  });

  test('depuis B, le risque de A est introuvable — la symétrie est mesurée', async () => {
    depuis(FILIALE_B, LOGIN_B);
    const r = await serveur.appeler('GET', url('risques', 'RISK-A'));
    assert.equal(r.statut, 404);
    assert.equal(r.corps.erreur, 'ressource_inconnue');
  });

  test('depuis A, le document local de B est introuvable ; le sien ne l’est pas', async () => {
    depuis(FILIALE_A, LOGIN_A);
    assert.equal((await serveur.appeler('GET', url('documents', 'DOC-B'))).statut, 404);
    assert.equal((await serveur.appeler('GET', url('documents', 'DOC-A'))).statut, 200);
    // Et le socle Groupe, lui, est lisible des deux : c'est ce qui distingue une
    // table mixte d'une table de filiale.
    assert.equal((await serveur.appeler('GET', url('documents', 'DOC-G'))).statut, 200);
    depuis(FILIALE_B, LOGIN_B);
    assert.equal((await serveur.appeler('GET', url('documents', 'DOC-G'))).statut, 200);
  });
});

/* =====================================================================
 *  §3 — Écrire : le constat Q-2, dans les deux sens
 * ===================================================================== */

describe('Un acteur d’une filiale ne DÉCIDE pas chez la voisine', () => {
  test('depuis A, décider sur le risque de B est refusé et n’écrit rien', async () => {
    depuis(FILIALE_A, LOGIN_A);
    const avant = await etapesEnBase(base, proprietaire, 'risque', 'RISK-B');
    const journalAvant = (await journalEnBase(base, proprietaire, 'approbation')).length;

    const r = await decider('risques', 'RISK-B', 'proposition');
    assert.equal(r.statut, 404, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'ressource_inconnue');

    const apres = await etapesEnBase(base, proprietaire, 'risque', 'RISK-B');
    assert.deepEqual(apres, avant, 'Une étape a été écrite chez la voisine : c’est le constat Q-2.');
    assert.equal((await journalEnBase(base, proprietaire, 'approbation')).length, journalAvant);
  });

  test('depuis B, décider sur le risque de A est refusé — symétrie', async () => {
    depuis(FILIALE_B, LOGIN_B);
    const avant = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    assert.equal((await decider('risques', 'RISK-A', 'acceptation')).statut, 404);
    assert.deepEqual(await etapesEnBase(base, proprietaire, 'risque', 'RISK-A'), avant);
  });

  test('même un périmètre GROUPE ne décide pas hors de sa filiale active', async () => {
    // ── Le cas qui compte, et le seul que la base ne peut pas refuser ───
    //
    // Un périmètre Groupe LIT les deux filiales : le 404 ne le protège plus, et
    // `pol_approbations_ajout` ne verrait rien à redire — la ligne serait écrite
    // avec `filiale_id = f_filiale_ecriture()`, c'est-à-dire A, tout en désignant
    // le risque de B. `objet_id` étant polymorphe et sans clé étrangère, la base
    // n'a AUCUN moyen de s'en apercevoir. C'est la route qui refuse.
    session.poser(sessionGroupe(FILIALE_A, [FILIALE_A, FILIALE_B]), profil('validation'));

    // D'abord la preuve que le périmètre est bien Groupe : la lecture passe.
    const lecture = await serveur.appeler('GET', url('risques', 'RISK-B'));
    assert.equal(lecture.statut, 200, 'Le périmètre n’est pas Groupe : l’essai ne mesure rien.');

    const avant = await etapesEnBase(base, proprietaire, 'risque', 'RISK-B');
    const r = await decider('risques', 'RISK-B', 'proposition');
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'hors_perimetre');
    assert.deepEqual(
      await etapesEnBase(base, proprietaire, 'risque', 'RISK-B'),
      avant,
      'Un périmètre Groupe a écrit une étape irrévocable chez une filiale : constat Q-2 rouvert.',
    );
    depuis(FILIALE_A, LOGIN_A);
  });

  test('sans filiale ACTIVE, décider est refusé proprement — pas par un 500', async () => {
    // Le sélecteur de filiale du lot L4 admet une session dont la filiale
    // d'écriture reste à choisir (§30.2 : pas de repli, pas de valeur par
    // défaut). `avecTransaction` refuse alors la transaction par une
    // `ErreurPerimetre`, c'est-à-dire par un 500 — un défaut de programmation.
    // Ce n'en est pas un : c'est un choix que l'utilisateur n'a pas fait.
    session.poser(sessionGroupe(null, [FILIALE_A, FILIALE_B]), profil('validation'));
    // La lecture, elle, reste servie : elle n'écrit pas.
    assert.equal((await serveur.appeler('GET', url('risques', 'RISK-A'))).statut, 200);

    const r = await decider('risques', 'RISK-A', 'acceptation');
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'hors_perimetre');
    assert.match(r.corps.message, /Aucune filiale active/u);
    depuis(FILIALE_A, LOGIN_A);
  });

  test('après le refus, la filiale visée ouvre encore son circuit — Q-2 refermé', async () => {
    // La propriété que le constat Q-2 met en jeu n'est pas « rien n'a fui »,
    // c'est « rien n'est bloqué ». On le vérifie en faisant faire à B ce que A
    // aurait pu lui interdire à jamais.
    depuis(FILIALE_B, LOGIN_B);
    await base.avecPerimetre(
      applicatif,
      perimetre(LOGIN_B, FILIALE_B, [FILIALE_B]),
      async (c) => c.query("update risques set nom = 'Fuite de données — révisé' where id = 'RISK-B'"),
      { annuler: false },
    );
    const r = await decider('risques', 'RISK-B', 'proposition');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    assert.equal(r.corps.circuit.cycle, 2);
    depuis(FILIALE_A, LOGIN_A);
  });
});

/* =====================================================================
 *  §4 — Deux filiales, le MÊME objet_id : les circuits ne se mélangent pas
 * ===================================================================== */

describe('Deux circuits sur le même objet_id restent deux circuits', () => {
  test('une étape écrite chez B sur l’identifiant de A n’entre pas dans le circuit de A', async () => {
    // ── Ce que ce scénario reproduit ────────────────────────────────────
    //
    // Il est LÉGAL en base : l'unicité commence par `filiale_id`, donc B peut
    // écrire (B, risque, RISK-A, acceptation, 1) sans heurter (A, risque,
    // RISK-A, acceptation, 1). C'est précisément le correctif de Q-2 — et c'est
    // aussi ce qui rend possible la confusion que cet essai interdit : une
    // lecture qui ne filtrerait pas par filiale fondrait les deux jeux en un
    // seul circuit, et le déclarerait complet au vu d'une décision prise
    // ailleurs. Le cloisonnement n'aurait pas fui ; la lecture aurait menti.
    await base.avecPerimetre(
      applicatif,
      perimetre(LOGIN_B, FILIALE_B, [FILIALE_B]),
      async (c) =>
        c.query(
          `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre,
                                     statut, acteur_libelle, date_decision)
                values ('APPRO-B-SUR-A', $1, 'risque', 'RISK-A', 'acceptation', 1,
                        'refuse', 'intrus.chez.b', now())`,
          [FILIALE_B],
        ),
      { annuler: false },
    );

    // Le propriétaire voit bien les deux, sur le même objet_id : la matière est là.
    const toutes = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    assert.equal(toutes.length, 3);
    assert.ok(toutes.some((l) => l.filiale_id === FILIALE_B && l.statut === 'refuse'));

    // A ne voit que le sien, et son circuit n'est PAS « refusé ».
    depuis(FILIALE_A, LOGIN_A);
    const vueA = await serveur.appeler('GET', url('risques', 'RISK-A'));
    assert.equal(vueA.statut, 200);
    assert.equal(vueA.corps.circuit.etat, 'en_cours');
    assert.equal(vueA.corps.circuit.etapeAttendue, 'acceptation');
    assert.ok(!JSON.stringify(vueA.corps).includes('intrus.chez.b'));

    // Et un périmètre GROUPE, qui lit pourtant les deux, ne les fond pas non
    // plus : le circuit d'un objet est celui de la filiale à qui l'objet est.
    session.poser(sessionGroupe(FILIALE_A, [FILIALE_A, FILIALE_B]), profil('validation'));
    const vueGroupe = await serveur.appeler('GET', url('risques', 'RISK-A'));
    assert.equal(vueGroupe.statut, 200);
    assert.equal(vueGroupe.corps.circuit.etat, 'en_cours');
    assert.ok(!JSON.stringify(vueGroupe.corps).includes('intrus.chez.b'));
    depuis(FILIALE_A, LOGIN_A);
  });

  test('et A peut toujours trancher son acceptation : rien n’est bloqué', async () => {
    depuis(FILIALE_A, LOGIN_A);
    const r = await decider('risques', 'RISK-A', 'acceptation');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    assert.equal(r.corps.circuit.etat, 'complet');
  });
});
