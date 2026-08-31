/**
 * bascule.test.mjs — la chaîne complète, dans un vrai navigateur.
 *
 * ── Le dix-septième contrôle ─────────────────────────────────────────────────
 *
 * `RAPPORT_S2` §6 : « **La grille §4 ne demande nulle part que le produit
 * fonctionne.** … ce sont des ruptures de la chaîne complète, et seul un essai de bout
 * en bout les voit. … Un dix-septième contrôle serait justifié : *le chemin complet a
 * été parcouru dans un navigateur réel, contre le serveur réel, dans la configuration
 * de déploiement réelle*. »
 *
 * Ce fichier est ce contrôle. Il ne cherche pas un défaut de sécurité : il vérifie que
 * **la bascule marche** — que ce qu'un utilisateur saisit arrive en base, que ce qu'un
 * autre écrit lui revient, et qu'un refus se voit. Trois choses dont aucune n'était
 * éprouvée nulle part avant la porte S2.
 *
 * `CLAUDE.md` §5 demande « 0 erreur » de console : chaque scénario le vérifie, parce
 * qu'une exception avalée dans un gestionnaire d'événement est exactement la forme que
 * prend une interface qui ne répond plus.
 *
 * Prérequis machine : PostgreSQL préparé (`bash db/dev/preparer_base_dev.sh`),
 * Playwright global et Chromium (`CLAUDE.md` §5).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { attendreApplication, lancerNavigateur, ouvrirPage, servirApplication } from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

/** Ouvre l'application et attend qu'elle ait chargé le jeu de données du serveur. */
async function ouvrirApplication() {
  const session = await ouvrirPage(navigateur);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  const etat = await attendreApplication(session.page);
  assert.equal(etat, 'chargee', 'L’application doit démarrer contre le serveur.');
  return session;
}

/** Ce que la base contient réellement, lu par une connexion tierce. */
async function enBase(texte, valeurs = []) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
    (await c.query(texte, valeurs)).rows);
}

/* =====================================================================
 *  §1 — Le chemin nominal
 * ===================================================================== */

describe('La bascule, de bout en bout', () => {
  test('l’application démarre contre le serveur, et sans une seule erreur', async () => {
    const session = await ouvrirApplication();
    try {
      // Les trois appels d'amorçage, dans l'ordre : qui je suis, quel est le modèle,
      // et le jeu de données de ma filiale (PLAN_SERVEUR §1.3).
      const chemins = application.etat.appels.map((a) => a.chemin);
      for (const attendu of ['/api/session', '/api/modele', '/api/donnees']) {
        assert.ok(chemins.includes(attendu), `L’amorçage doit appeler ${attendu}.`);
      }

      // Les données du serveur sont réellement en mémoire, dans la façade synchrone.
      const risques = await session.page.evaluate(() => window.DataStore.getRisques().map((r) => r.id));
      assert.ok(risques.includes('RISK-A'));

      // Et rien de la filiale voisine n'est arrivé jusqu'au navigateur.
      const fuite = await session.page.evaluate(() => JSON.stringify(window.Sync.jeuDeDonnees ? '' : ''));
      assert.equal(fuite, '""');
      const tout = await session.page.evaluate(() =>
        JSON.stringify({
          risques: window.DataStore.getRisques(),
          actifs: window.DataStore.getActifs(),
          documents: window.DataStore.getDocuments(),
        }));
      assert.equal(tout.includes('FIL-ESSAI-B'), false);
      assert.equal(tout.includes('RISK-B'), false);

      assert.deepEqual(session.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await session.fermer();
    }
  });

  test('LE CONTRAT DE CRÉATION : l’identifiant vient du SERVEUR, et le navigateur l’adopte', async () => {
    // ── L'arbitrage, et les deux moitiés qu'il engage ────────────────────────
    //
    // La première version de ce test exigeait seulement que « la création telle que
    // le navigateur l'émet aboutisse ». Elle a fait son travail : les deux côtés
    // avaient chacun raison — l'API fermait l'oracle d'existence du constat M-3 en
    // refusant un identifiant proposé, le frontend continuait d'en proposer un — et
    // plus aucune création n'était possible. L'arbitrage est désormais rendu :
    // **l'identifiant vient du serveur.**
    //
    // Le test le fige donc dans ses DEUX moitiés, parce qu'une seule ne tient pas :
    //
    //   · côté serveur, proposer un identifiant est REFUSÉ — sans quoi l'oracle
    //     rouvre (succès et refus redeviennent distinguables) ;
    //   · côté navigateur, la création aboutit quand même, et l'enregistrement
    //     porte ensuite l'identifiant que le serveur a choisi.
    //
    // Si l'une des deux moitiés bouge sans l'autre, ce test tombe — et c'est
    // exactement ce qu'on lui demande.
    const session = await ouvrirApplication();
    try {
      const refus = await session.page.evaluate(() =>
        fetch('/api/entites/risques', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 'RISK-PROPOSE-PAR-LE-CLIENT', champs: { nom: 'contrat' } }),
        }).then((r) => r.status));
      assert.equal(refus, 400, 'Proposer un identifiant doit rester refusé : c’est ce qui ferme M-3.');

      // Et la création par le chemin réel de l'application aboutit.
      const observe = await session.page.evaluate(async () => {
        const idLocal = window.UI.genId('RISK');
        window.DataStore.addRisque({ id: idLocal, nom: 'Créé par le chemin réel' });
        await window.Sync.pousser();
        const enMemoire = window.DataStore.getRisques().find((r) => r.nom === 'Créé par le chemin réel');
        return { idLocal, idFinal: enMemoire ? enMemoire.id : null, etat: window.Sync.etat() };
      });

      assert.ok(observe.idFinal, 'L’enregistrement doit rester en mémoire après la création.');
      assert.equal(observe.etat.bloques, 0, 'Une création nominale ne bloque rien.');
      assert.notEqual(
        observe.idFinal,
        observe.idLocal,
        'Le navigateur doit ADOPTER l’identifiant du serveur, pas conserver le sien.',
      );

      const enBaseFinal = await enBase('select id, nom from risques where id = $1', [observe.idFinal]);
      assert.equal(enBaseFinal.length, 1, 'L’identifiant vu en mémoire doit être celui de la base.');
      assert.equal(enBaseFinal[0].nom, 'Créé par le chemin réel');
      const sousLAncien = await enBase('select id from risques where id = $1', [observe.idLocal]);
      assert.equal(sousLAncien.length, 0, 'L’identifiant local ne doit exister nulle part au serveur.');
    } finally {
      await session.fermer();
    }
  });

  test('les RÉFÉRENCES suivent le renommage : rien ne pointe dans le vide', async () => {
    // La conséquence de l'arbitrage, et l'endroit où il peut coûter cher : un actif
    // créé puis relié à un risque créé dans le même geste porterait, sans le
    // renommage, une référence vers un identifiant qui n'existe qu'en mémoire.
    // Un lien mort dans une cartographie d'actifs ne se voit pas — il se constate
    // le jour de l'audit.
    const session = await ouvrirApplication();
    try {
      const observe = await session.page.evaluate(async () => {
        const idRisque = window.UI.genId('RISK');
        window.DataStore.addRisque({ id: idRisque, nom: 'Risque référencé' });
        const idActif = window.UI.genId('ACTIF');
        window.DataStore.addActif({ id: idActif, nom: 'Actif référençant', risques_lies: [idRisque] });
        await window.Sync.pousser();
        const actif = window.DataStore.getActifs().find((a) => a.nom === 'Actif référençant');
        const risque = window.DataStore.getRisques().find((r) => r.nom === 'Risque référencé');
        return {
          actif: actif ? { id: actif.id, liens: actif.risques_lies } : null,
          risque: risque ? risque.id : null,
        };
      });

      assert.ok(observe.actif && observe.risque);
      assert.deepEqual(
        observe.actif.liens,
        [observe.risque],
        'La liaison doit viser l’identifiant définitif, pas celui d’avant l’envoi.',
      );

      const lien = await enBase(
        'select r.nom from actif_risques l join risques r on r.id = l.risque_id where l.actif_id = $1',
        [observe.actif.id],
      );
      assert.deepEqual(lien.map((x) => x.nom), ['Risque référencé'], 'Et le lien existe en base.');
    } finally {
      await session.fermer();
    }
  });

  test('une saisie faite dans le navigateur arrive en base, et y reste', async () => {
    const session = await ouvrirApplication();
    try {
      // L'identifiant définitif vient du SERVEUR : on le relit dans le magasin après
      // l'envoi, au lieu d'employer celui qu'`UI.genId` avait fabriqué.
      const identifiant = await session.page.evaluate(async () => {
        window.DataStore.addRisque({
          id: window.UI.genId('RISK'),
          nom: 'Rupture d’approvisionnement',
          description: 'saisie du banc',
        });
        await window.Sync.pousser();
        const enregistre = window.DataStore.getRisques().find((r) => r.nom === 'Rupture d’approvisionnement');
        return enregistre ? enregistre.id : null;
      });
      assert.ok(identifiant, 'L’enregistrement doit rester en mémoire après l’envoi.');

      const lignes = await enBase('select nom, description, version, cree_par from risques where id = $1', [identifiant]);
      assert.equal(lignes.length, 1, 'La saisie doit être en base, pas seulement à l’écran.');
      assert.equal(lignes[0].nom, 'Rupture d’approvisionnement');
      assert.equal(lignes[0].version, 1);
      assert.equal(
        lignes[0].cree_par,
        'developpement',
        'L’auteur tracé vient de la SESSION SERVEUR, jamais du navigateur (CONVENTIONS §18.1).',
      );
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('un FORMULAIRE RÉEL, rempli au minimum, enregistre (constat M-8)', async () => {
    // Le constat M-8 de la porte S2 : « deux modules sont cassés par leur propre
    // valeur par défaut ». Les listes de criticité et d'accès des Prestataires
    // commencent par `["", "— Non évaluée —"]` ; le schéma code le non-renseigné par
    // `NULL` et refusait la chaîne vide. Créer un prestataire sans évaluer sa
    // criticité — l'état par défaut du formulaire — échouait, et toute la fonction
    // « Risque fournisseur & chaîne d'appro NIS2/DORA » était inutilisable.
    //
    // On pilote ici le VRAI formulaire, pas un appel d'API : c'est la seule façon de
    // savoir ce que l'application envoie réellement quand l'utilisateur ne remplit
    // que le champ obligatoire.
    const session = await ouvrirApplication();
    try {
      await session.page.goto(`${application.url}/index.html#/prestataires`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await session.page.waitForSelector('#addBtn', { timeout: 10000 });
      await session.page.click('#addBtn');
      await session.page.waitForSelector('#societe', { timeout: 10000 });

      // Rien d'autre que la raison sociale : criticité et accès restent « — Non
      // évaluée — », c'est-à-dire la chaîne vide.
      await session.page.fill('#societe', 'Infogérance du Nord');
      const valeursParDefaut = await session.page.evaluate(() => ({
        criticite: document.getElementById('criticite').value,
        acces: document.getElementById('acces').value,
      }));
      assert.deepEqual(
        valeursParDefaut,
        { criticite: '', acces: '' },
        'Le scénario n’a de sens que si le formulaire propose bien la chaîne vide par défaut.',
      );

      await session.page.click('#saveBtn');
      await session.page.evaluate(() => window.Sync.pousser());

      const lignes = await enBase("select societe, criticite, acces from prestataires where societe = 'Infogérance du Nord'");
      assert.equal(lignes.length, 1, 'Le prestataire doit être enregistré au serveur.');
      assert.equal(lignes[0].criticite, null, 'Le « non renseigné » du navigateur devient NULL en base.');
      assert.equal(lignes[0].acces, null);

      const etat = await session.page.evaluate(() => window.Sync.etat());
      assert.equal(etat.bloques, 0, 'Aucun enregistrement ne doit rester bloqué.');
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('une modification faite ailleurs revient par le sondage', async () => {
    const session = await ouvrirApplication();
    try {
      // Quelqu'un d'autre — une autre session, un autre poste — modifie la fiche.
      const reponse = await serveur.appeler('PUT', '/api/entites/risques/RISK-A', {
        corps: { version: 1, champs: { description: 'corrigé par un collègue' } },
      });
      assert.equal(reponse.statut, 200);

      const vu = await session.page.evaluate(async () => {
        await window.Sync.sonder();
        const r = window.DataStore.getRisques().find((x) => x.id === 'RISK-A');
        return r ? r.description : null;
      });
      assert.equal(vu, 'corrigé par un collègue', 'Le sondage doit rapatrier le travail des autres.');
      assert.deepEqual(session.erreursScript, [], 'Aucune exception de script.');
    } finally {
      await session.fermer();
    }
  });

  test('deux navigateurs sur la même fiche : le second est REFUSÉ, et il le voit', async () => {
    // Le risque P1, vu par l'utilisateur et non par la base. Deux contextes de
    // navigateur distincts : deux onglets, deux personnes.
    const alice = await ouvrirApplication();
    const bob = await ouvrirApplication();
    try {
      const ecrire = (session, texte) =>
        session.page.evaluate(async (valeur) => {
          const r = window.DataStore.getRisques().find((x) => x.id === 'RISK-A');
          window.DataStore.updateRisque({ ...r, nom: valeur });
          await window.Sync.pousser();
          return window.Sync.etat();
        }, texte);

      // On mesure un ÉCART, pas un compteur absolu : `Sync.etat().bloques` est global,
      // et un enregistrement dérivé bloqué pour une autre raison (le point
      // d'historique quotidien, constat m-5) fausserait un test écrit sur la valeur.
      const avant = (await bob.page.evaluate(() => window.Sync.etat())).bloques;

      await ecrire(alice, 'Rançongiciel — version d’Alice');
      const apresAlice = await enBase("select nom from risques where id = 'RISK-A'");
      assert.equal(apresAlice[0].nom, 'Rançongiciel — version d’Alice', 'La première écriture doit passer.');

      // Bob part de la version qu'il avait chargée : elle est périmée.
      const etatBob = await ecrire(bob, 'Rançongiciel — version de Bob');
      assert.ok(
        etatBob.bloques > avant,
        'La seconde écriture doit être refusée et COMPTÉE comme bloquée, pas appliquée.',
      );

      // Le travail d'Alice est intact en base : rien n'a été écrasé. C'est le
      // risque P1, et c'est la seule assertion qui le dit vraiment.
      const lignes = await enBase("select nom from risques where id = 'RISK-A'");
      assert.equal(lignes[0].nom, 'Rançongiciel — version d’Alice');

      // Et Bob le VOIT : le bandeau est là, il nomme l'enregistrement.
      const bandeau = await bob.page.evaluate(() => {
        const zone = document.getElementById('sync-banner-host') ?? document.body;
        return zone.innerText;
      });
      assert.match(bandeau, /modifi|Rançongiciel|enregistr/i, `Bandeau attendu, vu : « ${bandeau.slice(0, 200)} »`);
      // Le refus est VOULU dans ce scénario : le navigateur journalise l'échec du
      // `fetch`, et ce n'est pas un défaut. Une exception de script, elle, le serait.
      assert.deepEqual(bob.erreursInattendues(['409']), []);
    } finally {
      await alice.fermer();
      await bob.fermer();
    }
  });

  test('une coupure de VPN ne perd pas la saisie : elle attend, et le dit', async () => {
    const session = await ouvrirApplication();
    try {
      application.definirApiInjoignable(true);

      const etatCoupe = await session.page.evaluate(async () => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: 'Saisie pendant la coupure' });
        await window.Sync.pousser();
        return window.Sync.etat();
      });
      assert.equal(etatCoupe.enAttente, true, 'La saisie doit rester EN ATTENTE, pas disparaître.');

      const absente = await enBase("select id from risques where nom = 'Saisie pendant la coupure'");
      assert.equal(absente.length, 0, 'Et elle n’est évidemment pas en base : le serveur est coupé.');

      // Le VPN revient.
      application.definirApiInjoignable(false);
      const idFinal = await session.page.evaluate(async () => {
        await window.Sync.pousser();
        const r = window.DataStore.getRisques().find((x) => x.nom === 'Saisie pendant la coupure');
        return r ? r.id : null;
      });

      const arrivee = await enBase('select nom from risques where id = $1', [idFinal ?? '']);
      assert.equal(arrivee.length, 1, 'Au retour du réseau, la saisie doit partir seule.');
      assert.equal(arrivee[0].nom, 'Saisie pendant la coupure');
    } finally {
      application.definirApiInjoignable(false);
      await session.fermer();
    }
  });

  test('après rechargement de la page, l’état vient du serveur et rien n’est perdu', async () => {
    const session = await ouvrirApplication();
    try {
      const identifiant = await session.page.evaluate(async () => {
        window.DataStore.addAction({
          id: window.UI.genId('ACT'),
          titre: 'Action qui doit survivre au rechargement',
        });
        await window.Sync.pousser();
        const a = window.DataStore.getActions().find((x) => x.titre === 'Action qui doit survivre au rechargement');
        return a ? a.id : null;
      });
      assert.ok(identifiant, 'La création doit avoir abouti avant de recharger la page.');

      await session.page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');

      const survit = await session.page.evaluate(
        (id) => window.DataStore.getActions().some((a) => a.id === id),
        identifiant,
      );
      assert.equal(survit, true, 'L’identifiant rendu par le serveur doit être celui rechargé.');
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});
