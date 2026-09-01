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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterGreffon, monterServeurReel, RACINE_FRONTEND } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;
let application;
let navigateur;
/**
 * Session d'ADMINISTRATION GROUPE, hors navigateur.
 *
 * Elle ne sert qu'à SEMER le socle commun — une correspondance inter-référentiels —
 * pour que l'export produit par l'application ne soit pas creux à cet endroit. C'est
 * la condition du constat **N-2** : « le produit ne sait plus reprendre son propre
 * export dès que le socle Groupe n'est pas vide ».
 */
let administration;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
  application = await servirApplication(serveur);
  administration = await monterGreffon(base, {
    utilisateurId: 'administrateur-groupe',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A, FILIALE_B],
    perimetreGroupe: true,
    administrationGroupe: true,
  });
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await administration?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

/** Ouvre l'application et attend qu'elle ait chargé le jeu de données du serveur. */
async function ouvrirApplication() {
  const session = await ouvrirPage(navigateur);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  const etat = await attendreApplication(session.page);
  assert.equal(etat, 'chargee', 'L’application doit démarrer contre le serveur.');
  // Le tableau de bord inscrit son point d'historique du jour au chargement : un
  // envoi part donc SANS geste de l'utilisateur. Tant qu'il n'est pas parti, la
  // page n'est pas au repos, et tout ce qu'on mesurerait ensuite serait une
  // course. Voir `attendreQuiescence`.
  await attendreQuiescence(session.page);
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

  test('le geste complet — créer, voir, sélectionner, supprimer — aboutit VRAIMENT (S18)', async () => {
    // ── Le dix-huitième contrôle, joué à la souris ───────────────────────────
    //
    // Constat N-3 de la porte S2 : après une création, la liste gardait
    // l'identifiant local, et « Supprimer sélection » confirmait à l'utilisateur une
    // suppression qui n'avait pas lieu. C'est la forme la plus coûteuse du mensonge
    // d'interface — pire qu'un plantage, parce qu'elle ne laisse rien à raconter.
    //
    // Le test suit la chaîne entière par les gestes réels : bouton « Nouveau »,
    // formulaire, enregistrement, case à cocher de la ligne, « Supprimer sélection »,
    // confirmation. Puis il regarde la BASE — parce que ce que l'écran affiche est
    // précisément ce dont il faut se méfier.
    const session = await ouvrirApplication();
    try {
      session.page.on('dialog', (boite) => {
        void boite.accept();
      });

      await session.page.goto(`${application.url}/index.html#/prestataires`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await session.page.waitForSelector('#addBtn', { timeout: 10000 });
      await session.page.click('#addBtn');
      await session.page.waitForSelector('#societe', { timeout: 10000 });
      await session.page.fill('#societe', 'Prestataire éphémère');
      await session.page.click('#saveBtn');
      await session.page.evaluate(() => window.Sync.pousser());
      await session.page.waitForTimeout(300);

      // 1. L'identifiant AFFICHÉ est celui que le serveur a donné — sinon la case à
      //    cocher désignera une ligne qui n'existe que dans ce navigateur.
      const apresCreation = await session.page.evaluate(() => {
        const enregistrement = window.DataStore.getPrestataires().find((x) => x.societe === 'Prestataire éphémère');
        const affiches = Array.from(document.querySelectorAll('[data-id]')).map((e) => e.dataset.id);
        return { id: enregistrement ? enregistrement.id : null, affiche: affiches.includes(enregistrement?.id) };
      });
      assert.ok(apresCreation.id, 'La création doit avoir abouti.');
      assert.equal(apresCreation.affiche, true, 'La liste doit afficher l’identifiant définitif.');

      const enBaseApresCreation = await enBase('select id from prestataires where societe = $1', ['Prestataire éphémère']);
      assert.deepEqual(
        enBaseApresCreation.map((l) => l.id),
        [apresCreation.id],
        'Ce que la liste montre doit être ce que la base contient.',
      );

      // 2. Le geste de suppression groupée, par la case et le bouton réels.
      const geste = await session.page.evaluate((cible) => {
        const cases = Array.from(document.querySelectorAll('input[type=checkbox][data-id]'));
        const la = cases.find((c) => c.dataset.id === cible);
        if (!la) return { ok: false, raison: 'aucune case pour cette ligne' };
        la.checked = true;
        la.dispatchEvent(new Event('change', { bubbles: true }));
        const bouton = document.getElementById('bulkDeleteBtn');
        if (bouton === null) return { ok: false, raison: 'pas de bouton de suppression groupée' };
        bouton.click();
        return { ok: true };
      }, apresCreation.id);
      assert.equal(geste.ok, true, `Le geste doit être possible : ${JSON.stringify(geste)}`);

      await session.page.waitForTimeout(900);
      await session.page.evaluate(() => window.Sync.pousser());
      await session.page.waitForTimeout(400);

      // 3. Et la suppression a VRAIMENT eu lieu.
      const restant = await enBase('select id from prestataires where societe = $1', ['Prestataire éphémère']);
      const etat = await session.page.evaluate(() => window.Sync.etat());
      assert.deepEqual(
        restant,
        [],
        'La suppression confirmée à l’utilisateur doit avoir eu lieu au serveur. ' +
          `État de synchronisation : ${JSON.stringify(etat)}`,
      );
      assert.equal(etat.bloques, 0, 'Et rien ne doit rester bloqué en silence.');
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('LE PRODUIT SAIT REPRENDRE SON PROPRE EXPORT (constat N-2)', async () => {
    // ── Le chemin de migration du cadrage, joué par le geste de l'utilisateur ──
    //
    // `PLAN_SERVEUR` §2.6 fait de l'export `grc-backup` LE chemin de reprise. Le
    // constat N-2 de la porte S2 dit qu'il avait cessé de fonctionner « dès que le
    // socle Groupe n'est pas vide » — c'est-à-dire dans le cas courant.
    //
    // Ce test ne fabrique donc rien : il prend le fichier que l'application PRODUIT,
    // par `exportSnapshot()`, et le lui redonne par la porte d'entrée réelle
    // (`parseImport` puis `applyImport`, exactement comme l'écran Paramètres). Un
    // jeu d'essai, si fidèle soit-il, ne prouve pas cela — c'est la leçon du jeu
    // d'essai qui portait une action impossible.
    const session = await ouvrirApplication();
    try {
      // ── Le socle Groupe n'est pas vide : c'est la condition du constat ──────
      const socle = await administration.appeler('POST', '/api/entites/mappings', {
        corps: { champs: { theme: 'Chiffrement des données au repos' } },
      });
      assert.equal(socle.statut, 201);

      // ── Et il porte une valeur NULLE, ce qui n'est pas un détail ────────────
      //
      // Le modèle navigateur ne connaît pas `null` : son « non renseigné » est la
      // chaîne vide, et l'export la transporte comme telle. Le schéma, lui, code le
      // non-renseigné par `NULL`. Un contrôle du socle dont la description est nulle
      // fait donc voyager la conversion dans les DEUX sens en un aller-retour — c'est
      // le constat N-4, et sans lui ce test passerait sans l'exercer.
      const client = await base.connexion('app');
      await base.avecPerimetre(
        client,
        perimetre('administrateur-groupe', FILIALE_A, [FILIALE_A], true),
        async (c) => {
          await c.query("update mesure_catalogue set description = null where id = 'MESURE-G'");
        },
        { annuler: false },
      );
      const avantExport = await enBase("select description from mesure_catalogue where id = 'MESURE-G'");
      assert.equal(avantExport[0].description, null, 'Le socle doit bien porter une description nulle.');
      await session.page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await attendreQuiescence(session.page);

      const avant = await session.page.evaluate(() => ({
        risques: window.DataStore.getRisques().map((r) => r.id).sort(),
        mappings: window.DataStore.getMappings().map((m) => m.id).sort(),
        documents: window.DataStore.getDocuments().map((d) => d.id).sort(),
      }));
      assert.ok(avant.mappings.length > 0, 'Le socle Groupe doit être présent dans la mémoire.');

      const issue = await session.page.evaluate(async () => {
        const texte = window.DataStore.exportSnapshot();
        const lu = await window.DataStore.parseImport(texte);
        if (!lu.ok) return { etape: 'lecture', ok: false, lu };
        try {
          const r = await window.DataStore.applyImport(lu.payload, 'merge', {
            texte,
            nom: 'Sauvegarde_CyberGRC.json',
          });
          return { etape: 'application', ok: true, r, socleDansLeFichier: (lu.payload.mappings ?? []).length };
        } catch (erreur) {
          return { etape: 'application', ok: false, message: String(erreur && erreur.message) };
        }
      });

      assert.equal(issue.ok, true, `La reprise de son propre export doit aboutir : ${JSON.stringify(issue).slice(0, 300)}`);
      assert.equal(issue.socleDansLeFichier, avant.mappings.length, 'L’export doit bien porter le socle.');
      assert.equal(issue.r.transactionnel, true, 'Elle passe par la route transactionnelle, pas par une rafale.');

      // Rien n'est perdu, rien n'est dupliqué : c'est ce qu'un utilisateur attend
      // d'une restauration de sa propre sauvegarde.
      const apres = await session.page.evaluate(() => ({
        risques: window.DataStore.getRisques().map((r) => r.id).sort(),
        mappings: window.DataStore.getMappings().map((m) => m.id).sort(),
        documents: window.DataStore.getDocuments().map((d) => d.id).sort(),
      }));
      assert.deepEqual(apres, avant, 'Reprendre son propre export ne doit ni perdre ni dupliquer.');

      // La valeur nulle a fait l'aller-retour sans se transformer en chaîne vide :
      // sinon le socle du Groupe serait « modifié » par la simple restauration d'une
      // filiale, et vingt filiales verraient leur catalogue changer sans raison.
      const apresExport = await enBase("select description from mesure_catalogue where id = 'MESURE-G'");
      assert.equal(
        apresExport[0].description,
        null,
        'Une description nulle doit rester nulle après un aller-retour par l’export.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('LE BANC ATTEND VRAIMENT : « au repos » se mesure, il ne se suppose pas', async () => {
    // ── Pourquoi ce test existe ─────────────────────────────────────────────
    //
    // `attendreQuiescence` a été écrit après avoir vu un essai rouge une fois sur
    // dix, et seulement quand trois exécutions de la suite tournaient de front. Un
    // outil d'attente qui rendrait la main tout de suite ferait disparaître le
    // symptôme de la même façon qu'un `sleep` bien dosé : en apparence. Il faut
    // donc que l'attente elle-même soit éprouvée, sinon la prochaine personne qui
    // la simplifiera ne verra rien casser.
    const session = await ouvrirApplication();
    try {
      // Une écriture est armée mais pas encore partie : c'est l'état exact qu'une
      // page laisse après son chargement, reproduit ici volontairement.
      const arme = await session.page.evaluate(() => {
        window.DataStore.addRisque({
          id: window.UI.genId('RISK'),
          nom: 'Risque écrit juste avant la mesure',
        });
        return window.Sync.etat();
      });
      assert.equal(arme.enAttente, true, 'Le scénario exige une écriture EN ATTENTE.');

      await attendreQuiescence(session.page);

      const apres = await session.page.evaluate(() => window.Sync.etat());
      assert.equal(apres.enAttente, false, 'Après l’attente, plus rien ne doit être en attente…');
      assert.equal(apres.enCours, false, '…ni en cours.');

      // Et la preuve par la base : l'attente ne s'est pas contentée de regarder un
      // drapeau, l'écriture est bel et bien arrivée de l'autre côté.
      const enBaseApres = await enBase(
        "select count(*)::int as n from risques where nom = 'Risque écrit juste avant la mesure'",
      );
      assert.equal(enBaseApres[0].n, 1, 'L’écriture attendue doit être PARVENUE au serveur.');
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('reprendre DEUX FOIS sa propre sauvegarde aboutit, et converge (constat T-4)', async () => {
    // ── Ce que ce test affirmait, et pourquoi il change ──────────────────────
    //
    // Il exigeait que la seconde reprise du même fichier soit REFUSÉE, avec une
    // phrase écrite pour un humain. Le troisième passage de la porte S2 a montré que
    // l'interdiction elle-même était le défaut (constat T-4) : elle consommait le
    // fichier pour toujours, et interdisait le geste le plus banal d'un plan de
    // reprise — restaurer, constater, restaurer encore.
    //
    // Le test porte donc désormais sur l'ISSUE, et non sur le libellé du refus. Ce
    // choix n'est pas seulement une correction : un test qui s'accroche à une phrase
    // se casse à chaque reformulation, et l'on prend l'habitude de le « réparer »
    // sans le lire. L'issue, elle, ne se reformule pas.
    const session = await ouvrirApplication();
    try {
      const deuxFois = await session.page.evaluate(async () => {
        const texte = window.DataStore.exportSnapshot();
        const lu = await window.DataStore.parseImport(texte);
        const appliquer = () =>
          window.DataStore.applyImport(lu.payload, 'merge', { texte, nom: 'Sauvegarde_identique.json' });

        const issues = [];
        for (let i = 0; i < 2; i += 1) {
          try {
            issues.push({ ok: true, r: await appliquer() });
          } catch (erreur) {
            issues.push({ ok: false, message: String(erreur && erreur.message) });
          }
        }
        return {
          issues,
          risques: window.DataStore.getRisques().map((r) => r.id).sort(),
          mappings: window.DataStore.getMappings().map((m) => m.id).sort(),
        };
      });

      const echecs = deuxFois.issues.filter((i) => !i.ok).map((i) => i.message);
      assert.deepEqual(
        echecs,
        [],
        'Reprendre deux fois sa propre sauvegarde doit aboutir : c’est le geste d’une ' +
          'restauration, pas une anomalie.',
      );
      assert.equal(deuxFois.issues[1].r.transactionnel, true, 'La seconde passe aussi par la transaction.');

      // Convergence : deux reprises, un seul jeu de données — rien n’est dupliqué.
      assert.deepEqual(
        deuxFois.risques,
        [...new Set(deuxFois.risques)],
        'Aucun identifiant ne doit apparaître deux fois après une double reprise.',
      );
      const enBaseRisques = await enBase('select id from risques order by id');
      assert.deepEqual(
        enBaseRisques.map((l) => l.id),
        deuxFois.risques,
        'Et ce que l’écran montre doit être ce que la base contient.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
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
      await attendreQuiescence(session.page);

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

/* =====================================================================
 *  §5 — Les DEUX barrières du bloquant T-1, chacune éprouvée seule
 *
 *  Le troisième passage de la porte S2 a trouvé un import qui perdait des
 *  lignes en silence : « 250 exigences importées », 225 en base, `{ok: true,
 *  echecs: 0}` rendu à l'utilisateur. Le remède a posé DEUX barrières
 *  indépendantes, et le quatrième passage (constat Q-3) a relevé qu'aucune
 *  n'était éprouvée au dépôt — la preuve existait, mais dans le brouillon d'un
 *  auditeur, et un brouillon ne se rejoue pas au prochain changement.
 *
 *   1. l'ENTROPIE du générateur — elle supprime la CAUSE ;
 *   2. l'INDEXATION PAR RANG du tri des créations — elle supprime la
 *      CONSÉQUENCE, et elle tient même quand la première a été sabotée.
 *
 *  Elles sont éprouvées séparément, et la seconde l'est PRÉCISÉMENT dans le
 *  cas où la première a disparu : c'est la seule façon de montrer qu'elle est
 *  bien une seconde barrière, et non un doublon de la première.
 * ===================================================================== */

describe('Un import en lot ne perd pas une ligne (bloquant T-1)', () => {
  /** Le nombre du constat : « un lot de 250 exigences en écrivait 225 ». */
  const LOT = 250;

  test('BARRIÈRE 1 — l’entropie : 250 créations d’affilée, 250 identifiants distincts', async () => {
    // Le générateur est mesuré SUR SON CHEMIN RÉEL — celui qu'empruntent les
    // modules — et non appelé à part. C'est la leçon du constat Q-1 : un essai
    // d'entropie sur un générateur qui n'écrit pas ne prouve rien sur celui qui
    // écrit. Ici les identifiants sont ceux que le DataStore a réellement reçus.
    const session = await ouvrirApplication();
    try {
      const vus = await session.page.evaluate((n) => {
        const identifiants = [];
        // Une boucle serrée : `Date.now()` ne bouge pratiquement pas d'une
        // itération à l'autre, ce qui est exactement la condition du constat —
        // l'identifiant s'y réduit à la part aléatoire.
        for (let i = 0; i < n; i += 1) {
          const id = window.UI.genId('RISK');
          identifiants.push(id);
          window.DataStore.addRisque({ id, nom: `Exigence importée n° ${String(i + 1)}` });
        }
        return {
          identifiants,
          horodatagesDistincts: new Set(identifiants.map((x) => x.split('-')[1])).size,
          enMemoire: window.DataStore.getRisques().length,
        };
      }, LOT);

      assert.equal(
        new Set(vus.identifiants).size,
        LOT,
        'Deux créations du même lot ne doivent jamais porter le même identifiant.',
      );
      assert.ok(
        vus.horodatagesDistincts < LOT,
        'Le scénario n’a de sens que si l’horodatage NE suffit PAS à distinguer les ' +
          `identifiants : ${String(vus.horodatagesDistincts)} valeurs pour ${String(LOT)} tirages. ` +
          'Sur une machine assez lente pour donner 250 millisecondes distinctes, ce test ' +
          'ne mesurerait plus l’entropie mais l’horloge.',
      );

      // Et le lot arrive entier de l'autre côté : l'entropie sert à cela.
      await attendreQuiescence(session.page);
      const enBaseApres = await enBase(
        "select count(*)::int as n from risques where nom like 'Exigence importée n° %'",
      );
      assert.equal(enBaseApres[0].n, LOT, `${String(LOT)} confiées, ${String(LOT)} en base.`);

      // Le canari de `calculerDifferentiel` doit être muet : aucun doublon.
      const bandeau = await session.page.evaluate(() =>
        (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent,
      );
      assert.equal(
        /double/i.test(bandeau),
        false,
        `Aucun doublon ne doit être signalé sur un lot sain : ${bandeau}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('BARRIÈRE 2 — le rang : générateur SABOTÉ à trois valeurs, les 40 lignes arrivent quand même', async () => {
    // ── La démonstration de l'auditeur, figée au dépôt ───────────────────────
    //
    // On remplace le générateur du navigateur par un générateur volontairement
    // dégénéré : trois valeurs, pas de compteur, pas d'horodatage. C'est pire
    // que le défaut d'origine. La première barrière est donc absente, et le lot
    // porte massivement des identifiants en double.
    //
    // La propriété que ce test tient : AUCUN GÉNÉRATEUR NE DOIT POUVOIR FAIRE
    // DISPARAÎTRE UNE LIGNE. `ordonnerCreations` indexe par RANG dans le lot, pas
    // par identifiant ; un tableau indexé par rang ne perd rien, quoi qu'on lui
    // donne. C'est une propriété de FORME, et elle survit à la bêtise du
    // générateur — ce qui est exactement ce qu'on attend d'une seconde barrière.
    const CREATIONS = 40;
    const session = await ouvrirApplication();
    try {
      const vus = await session.page.evaluate((n) => {
        // Sabotage : trois valeurs, et rien d'autre.
        window.UI.genId = (prefixe) => `${prefixe ?? 'ID'}-SABOTE-${String(Math.floor(Math.random() * 3))}`;
        const identifiants = [];
        for (let i = 0; i < n; i += 1) {
          const id = window.UI.genId('RISK');
          identifiants.push(id);
          window.DataStore.addRisque({ id, nom: `Ligne sabotée n° ${String(i + 1)}` });
        }
        return { distincts: new Set(identifiants).size, confiees: identifiants.length };
      }, CREATIONS);

      assert.ok(
        vus.distincts <= 3,
        `Le sabotage doit VRAIMENT produire des doublons : ${String(vus.distincts)} identifiants ` +
          `distincts pour ${String(CREATIONS)} créations. Sans cela le test ne mesurerait rien.`,
      );

      await attendreQuiescence(session.page);

      // ── LA propriété ────────────────────────────────────────────────────
      const enBaseApres = await enBase(
        "select count(*)::int as n from risques where nom like 'Ligne sabotée n° %'",
      );
      assert.equal(
        enBaseApres[0].n,
        CREATIONS,
        `La seconde barrière doit tenir SANS la première : ${String(CREATIONS)} créations ` +
          `confiées, ${String(enBaseApres[0].n)} lignes en base. Toute valeur inférieure est ` +
          'la perte silencieuse du bloquant T-1.',
      );

      // Chaque ligne a bien reçu SON identité : le serveur a ré-émis, et rien
      // n'a été écrasé au passage.
      const noms = await enBase(
        "select count(distinct nom)::int as n from risques where nom like 'Ligne sabotée n° %'",
      );
      assert.equal(noms[0].n, CREATIONS, 'Les 40 lignes sont 40 lignes différentes, pas 3 réécrites.');
      const identites = await enBase(
        "select count(distinct id)::int as n from risques where nom like 'Ligne sabotée n° %'",
      );
      assert.equal(identites[0].n, CREATIONS, 'Et 40 identifiants distincts en base.');

      // ── Et c'est bien LE RANG qui a tenu, pas le filet placé sous lui ────
      //
      // Sous le tri il existe un rattrapage : `ecrireEnLot` recompte, remet ce
      // qui manque et le signale. Il est là pour qu'un défaut de programmation
      // ne coûte pas de donnée — mais tant qu'il travaille, « 40 lignes sont
      // arrivées » ne dit RIEN du tri lui-même : un tri qui perd tout et un tri
      // juste rendent le même compte. Écrit sans cette distinction, ce test
      // restait vert quand on ré-indexait `ordonnerCreations` sur l'identifiant
      // — c'est-à-dire quand on rouvrait la moitié structurelle du bloquant.
      //
      // On exige donc que le filet n'ait PAS servi. Les deux barrières
      // redeviennent distinguables, et le signalement de rétrécissement — le
      // quatrième comportement neuf du remède T-1 — se trouve pris au passage :
      // il est ici la marque de son absence.
      assert.deepEqual(
        session.erreursConsole.filter((m) => /incohérent/i.test(m)),
        [],
        'Le tri par rang ne doit rien avoir perdu : dès qu’il perd, le rattrapage crie.',
      );
      const bandeau = await session.page.evaluate(() =>
        (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent,
      );
      assert.equal(
        /défaut interne/i.test(bandeau),
        false,
        `Aucun défaut interne ne doit être annoncé à l’utilisateur : ${bandeau}`,
      );
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §6 — Trois chemins que rien n'exerçait
 * =====================================================================
 *
 *  Les trois viennent de l'agent FRONT, et le premier est né d'un sabotage :
 *  en éprouvant l'équivalence de son propre correctif, il a vidé le corps de
 *  `collectionsAuVolumeIncertain()` et **la suite est restée verte**. Ce n'est
 *  pas une fonction décorative : elle décide si le sondage doit recharger tout
 *  le jeu de données. Le motif est celui qu'on a rencontré toute la journée —
 *  une propriété que rien n'exerce, et qui disparaît sans bruit.
 * ===================================================================== */

describe('Ce que le sondage décide, et ce que l’écran en dit', () => {
  /** Nombre de chargements complets (`GET /api/donnees`) émis depuis le début du fichier. */
  function chargementsComplets() {
    return application.appelsPar('GET').filter((a) => a.chemin === '/api/donnees').length;
  }

  test('LE SONDAGE NE RECHARGE PAS quand une création est bloquée', async () => {
    // ── Le chemin, et ce qu'il coûte quand il tombe ─────────────────────────
    //
    // Une création refusée pour DONNÉE INVALIDE reste locale et bloquée : la
    // saisie demeure sous les yeux de l'utilisateur, elle n'est plus réémise. Le
    // jeu local porte donc un enregistrement de plus que le serveur.
    //
    // Le sondage compare les volumes pour découvrir les suppressions distantes —
    // aucune pierre tombale n'existe avant le journal du lot L5. S'il ne défalquait
    // pas les créations locales non parties, il conclurait « une ligne a disparu
    // ailleurs » et rechargerait tout : le rechargement écrase la mémoire par
    // l'état du serveur, où la saisie refusée n'existe pas. L'utilisateur perdrait
    // sa saisie, à chaque battement, sans que rien ne le dise.
    const session = await ouvrirApplication();
    try {
      // `gravite` est un champ contraint côté schéma : le serveur refuse la valeur
      // par `donnee_invalide` — un refus DÉFINITIF, pas une panne passagère.
      await session.page.evaluate(() => {
        window.DataStore.addIncident({
          id: window.UI.genId('INC'),
          titre: 'Incident dont la gravité est refusée',
          gravite: 'catastrophique',
        });
      });

      // On attend l'état, jamais un délai : le blocage est ce qui définit le
      // scénario, et le cycle doit avoir rendu la main.
      await session.page.waitForFunction(
        () => {
          const e = window.Sync.etat();
          return e.bloques > 0 && e.enCours === false;
        },
        null,
        { timeout: 15000 },
      );

      const avant = chargementsComplets();
      const volumes = await session.page.evaluate(() => ({
        local: window.DataStore.getIncidents().length,
      }));
      const enBaseIncidents = await enBase('select count(*)::int as n from incidents');
      assert.equal(
        volumes.local,
        enBaseIncidents[0].n + 1,
        'Le scénario EXIGE un écart de volume : sans lui, le sondage n’aurait aucune raison ' +
          'de recharger et ce test ne mesurerait rien.',
      );

      // ── LA propriété ────────────────────────────────────────────────────
      await session.page.evaluate(() => window.Sync.sonder());
      assert.equal(
        chargementsComplets(),
        avant,
        'Le sondage a rechargé tout le jeu de données alors qu’une création locale ' +
          'expliquait l’écart de volume. Ce rechargement écrase la saisie refusée que ' +
          'l’utilisateur a encore sous les yeux.',
      );

      // Et la saisie est toujours là : c'est elle qu'on protège, pas un compteur.
      assert.equal(
        await session.page.evaluate(() =>
          window.DataStore.getIncidents().some((i) => i.titre === 'Incident dont la gravité est refusée'),
        ),
        true,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE SYMÉTRIQUE : une vraie suppression distante, elle, fait recharger', async () => {
    // Sans cette moitié, le test précédent serait satisfait par un sondage qui ne
    // recharge JAMAIS — c'est-à-dire par la suppression du mécanisme qu'il protège.
    const session = await ouvrirApplication();
    try {
      const identifiant = await session.page.evaluate(async () => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: 'Risque supprimé côté serveur' });
        await window.Sync.pousser();
        const trouve = window.DataStore.getRisques().find((r) => r.nom === 'Risque supprimé côté serveur');
        return trouve.id;
      });
      await attendreQuiescence(session.page);

      // Suppression par une connexion tierce : le navigateur n'en sait rien, et
      // aucune écriture locale n'attend — l'écart de volume est donc RÉEL.
      const client = await base.connexion('app');
      await base.avecPerimetre(
        client,
        perimetre('menage', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query('delete from risques where id = $1', [identifiant]);
        },
        { annuler: false },
      );

      const avant = chargementsComplets();
      await session.page.evaluate(() => window.Sync.sonder());
      assert.ok(
        chargementsComplets() > avant,
        'Un écart de volume que rien de local n’explique doit provoquer un rechargement : ' +
          'sans lui, une suppression faite ailleurs resterait invisible ici.',
      );
      assert.equal(
        await session.page.evaluate(
          (id) => window.DataStore.getRisques().some((r) => r.id === id),
          identifiant,
        ),
        false,
        'Et le rechargement doit avoir fait disparaître la ligne supprimée.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('une MODIFICATION seule est « en attente », alors qu’aucun volume ne bouge', async () => {
    // ── Ce que ce test épingle ──────────────────────────────────────────────
    //
    // `aDesModificationsEnAttente()` emprunte un raccourci par les VOLUMES avant
    // de canoniser quoi que ce soit — c'est ce qui rend le sondage abordable sur
    // une filiale de douze mille enregistrements (constat Q-8). Le raccourci ne
    // peut pas se tromper, et son auteur le démontre ; mais un raisonnement juste
    // n'est pas un essai. Une modification ne change AUCUN volume : si le
    // raccourci devenait un jour un chemin exclusif — « rien n'a bougé, donc rien
    // n'attend » —, toute saisie non partie serait déclarée enregistrée, et
    // `beforeunload` laisserait fermer l'onglet sans prévenir.
    const session = await ouvrirApplication();
    try {
      const mesure = await session.page.evaluate(() => {
        const compter = () => ({
          risques: window.DataStore.getRisques().length,
          actions: window.DataStore.getActions().length,
        });
        const avant = compter();
        const risque = window.DataStore.getRisques()[0];
        // Une MODIFICATION, et rien d'autre : même nombre d'enregistrements
        // avant et après. On lit l'état dans la même exécution synchrone que la
        // saisie — le minuteur de regroupement ne peut pas s'être déclenché.
        // `updateRisque` prend l'enregistrement ENTIER, pas un correctif : la
        // première rédaction lui passait `(id, champs)` et ne modifiait donc RIEN —
        // l'essai mesurait alors l'absence de saisie, et l'aurait fait en silence
        // si l'assertion n'avait pas porté sur « en attente ».
        window.DataStore.updateRisque({ ...risque, nom: `${risque.nom} (revu)` });
        return { avant, apres: compter(), etat: window.Sync.etat(), id: risque.id };
      });

      assert.deepEqual(
        mesure.apres,
        mesure.avant,
        'Le scénario EXIGE qu’aucun volume ne bouge : c’est ce qui rend le raccourci ' +
          'aveugle si on en fait un chemin exclusif.',
      );
      assert.equal(
        mesure.etat.enAttente,
        true,
        'Une modification non encore envoyée est « en attente ». La déclarer enregistrée ' +
          'laisse fermer l’onglet sans avertissement, et la saisie est perdue.',
      );

      // ── Contrôle symétrique ─────────────────────────────────────────────
      // Sans lui, un `enAttente` constamment vrai passerait ce test — et le
      // bandeau « modifications non enregistrées » ne s'éteindrait jamais.
      await attendreQuiescence(session.page);
      assert.equal(
        await session.page.evaluate(() => window.Sync.etat().enAttente),
        false,
        'Une fois partie, la modification ne doit plus être « en attente ».',
      );
      const enBaseApres = await enBase('select nom from risques where id = $1', [mesure.id]);
      assert.match(enBaseApres[0].nom, /\(revu\)$/, 'Et elle doit être arrivée en base.');
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §7 — Q-11 : ce qu'un identifiant trop court fait payer, et qui le dit
 * ===================================================================== */

describe('Le renommage large s’annonce, et lui seul (constat Q-11)', () => {
  /** Le texte du bandeau de synchronisation, tel qu'un utilisateur le lit. */
  function bandeau(page) {
    return page.evaluate(
      () => (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent,
    );
  }

  /**
   * Joue le scénario complet pour un identifiant donné et rend ce que l'écran dit.
   *
   * Le scénario est celui du constat : un enregistrement ANCIEN dont l'identifiant
   * n'a pas la forme du §2, une donnée métier qui vaut exactement cette chaîne, et
   * la création par laquelle le serveur ré-attribue l'identifiant (constat M-3). Le
   * balayage des références réécrit alors tout ce qui égale l'ancien — références
   * légitimes ET données de même valeur, sans pouvoir les distinguer.
   */
  async function jouerLeRenommage(identifiant, marque) {
    // ⚠️ Les libellés portent une MARQUE propre à chaque cas. Les deux essais
    // partagent la base : sans elle, le second retrouvait l'action du premier —
    // déjà réécrite — et concluait sur elle. Il passait seul et échouait en
    // suite, ce qui est la pire des deux façons d'échouer.
    const titreAction = `Action dont le responsable porte la même valeur (${marque})`;
    const nomRisque = `Risque hérité d’un export ancien (${marque})`;
    const session = await ouvrirApplication();
    try {
      // Une donnée MÉTIER qui vaut la chaîne : ici le responsable d'une action.
      // C'est un champ de texte libre, exactement le genre qu'un balayage de
      // références ne peut pas distinguer d'un lien.
      await session.page.evaluate(([valeur, titre]) => {
        window.DataStore.addAction({ id: window.UI.genId('ACT'), titre, responsable: valeur });
      }, [identifiant, titreAction]);
      await attendreQuiescence(session.page);

      // Puis la création qui déclenche la ré-attribution : le serveur refuse
      // l'identifiant proposé et rend le sien, le navigateur adopte et renomme.
      await session.page.evaluate(([id, nom]) => {
        window.DataStore.addRisque({ id, nom });
      }, [identifiant, nomRisque]);

      // ── On attend le RENOMMAGE, pas le repos ────────────────────────────
      //
      // C'est l'événement qui décide de tout ici : une fois l'identifiant
      // ré-attribué, `renommer` a balayé les références et le sort du bandeau est
      // scellé. Attendre le repos de la page serait plus commode et faux : la
      // page ne revient PAS au repos après ce balayage — les enregistrements
      // réécrits restent en attente sans que rien ne les repousse (voir le rapport
      // de cette vague). Un essai qui attendrait le repos mesurerait ce défaut-là
      // au lieu de la propriété qu'il vise, et expirerait.
      await session.page.waitForFunction(
        ([propose, nom]) => {
          const r = window.DataStore.getRisques().find((x) => x.nom === nom);
          return r !== undefined && r.id !== propose;
        },
        [identifiant, nomRisque],
        { timeout: 15000 },
      );

      const apres = await session.page.evaluate(([valeur, titre, nom]) => {
        const action = window.DataStore.getActions().find((a) => a.titre === titre);
        const risque = window.DataStore.getRisques().find((r) => r.nom === nom);
        return { responsable: action.responsable, idRisque: risque.id, valeurInitiale: valeur };
      }, [identifiant, titreAction, nomRisque]);

      return { texte: await bandeau(session.page), apres, erreurs: session.erreursScript };
    } finally {
      await session.fermer();
    }
  }

  test('un identifiant TROP COURT : le bandeau nomme la réécriture et son compte', async () => {
    // ── Pourquoi il faut le DIRE plutôt que le corriger ──────────────────────
    //
    // Le balayage ne peut pas savoir lesquels de ces champs étaient vraiment des
    // références : « 7 » est un identifiant recevable d'un export ancien, et une
    // valeur métier parfaitement légitime. Choisir en silence, dans un outil qui
    // sert de preuve en audit, c'est fabriquer une donnée fausse que rien
    // n'expliquera ensuite. On réécrit — sinon les vraies références se cassent —
    // et l'on prévient, avec le compte, pour que le contrôle soit possible.
    const issue = await jouerLeRenommage('7', 'court');

    assert.notEqual(issue.apres.idRisque, '7', 'Le serveur doit avoir ré-attribué l’identifiant.');
    assert.equal(
      issue.apres.responsable,
      issue.apres.idRisque,
      'Le scénario EXIGE que la donnée métier ait été réécrite : c’est ce dont on prévient.',
    );
    assert.match(
      issue.texte,
      /Réécriture de références à vérifier/,
      `Le bandeau doit annoncer la réécriture : ${issue.texte}`,
    );
    assert.match(
      issue.texte,
      /7 → 1 valeur\(s\)/,
      `Il doit nommer la chaîne et COMPTER ce qu’elle a touché : ${issue.texte}`,
    );
    assert.deepEqual(issue.erreurs, []);
  });

  test('CONTRÔLE SYMÉTRIQUE : identifiant canonique, même situation, bandeau MUET', async () => {
    // La moitié sans laquelle l'essai précédent serait satisfait par un bandeau
    // qui crie toujours — et un avertissement permanent est un avertissement mort.
    //
    // La configuration est RIGOUREUSEMENT la même : une donnée métier égale à
    // l'identifiant, donc une réécriture qui a bien lieu. Seule change la FORME de
    // l'identifiant : celle du §2 ne peut pas être confondue avec une valeur
    // saisie, et il n'y a donc rien à faire vérifier à l'utilisateur.
    const canonique = `RISK-${String(Date.now())}-zzq7canonique`;
    const issue = await jouerLeRenommage(canonique, 'canonique');

    assert.equal(
      issue.apres.responsable,
      issue.apres.idRisque,
      'La réécriture doit avoir eu lieu ici AUSSI : sans elle, le silence ne prouverait rien.',
    );
    assert.notEqual(issue.apres.responsable, canonique);
    assert.equal(
      /Réécriture de références à vérifier/.test(issue.texte),
      false,
      `Aucun avertissement n’est dû sur un identifiant distinctif : ${issue.texte}`,
    );
    assert.deepEqual(issue.erreurs, []);
  });
});

/* =====================================================================
 *  §8 — Après un renommage large, la page doit revenir au repos (constat Q-15)
 * =====================================================================
 *
 *  Trouvé en écrivant les essais du §7 : l'attente de repos expirait, et ce
 *  n'était pas l'essai qui avait tort.
 *
 *  `renommer()` réécrit les enregistrements EN MÉMOIRE — c'est ce qui empêche
 *  les références de se casser quand le serveur ré-attribue un identifiant. Mais
 *  la réécriture n'est signalée à personne : aucun envoi n'est armé. La page
 *  reste donc « en attente » indéfiniment, sans rien envoyer, et l'écran porte
 *  une valeur que la base ignore. Mesuré :
 *
 *      mémoire  action.responsable = "RISK-1788…"   (réécrit)
 *      base     action.responsable = "7"            (inchangé)
 *      état     enAttente true · enCours false · bloques 0 · incidents 0
 *
 *  Ce que cela coûte : l'utilisateur voit « modifications non enregistrées » sans
 *  avoir rien saisi, ne peut rien faire pour l'éteindre, et referme son onglet sur
 *  un avertissement qu'il a appris à ignorer — pendant que la base porte encore la
 *  vieille valeur. C'est une divergence silencieuse entre ce qui est montré et ce
 *  qui fait preuve, dans un outil dont c'est l'unique objet.
 *
 *  ⚠️ Cet essai est ROUGE tant que le correctif n'est pas livré, et c'est le
 *  contrat : il dit la PROPRIÉTÉ attendue, jamais le remède. Il n'exige pas que
 *  tel appel soit fait — la façon de réarmer l'envoi appartient à `js/core/**` —
 *  il exige que la page revienne au repos et que les deux côtés portent la même
 *  valeur.
 * ===================================================================== */

describe('Une réécriture de références ne reste pas en attente (constat Q-15)', () => {
  /** Le `responsable` de l'action repère, tel qu'une connexion tierce le lit. */
  async function responsableEnBase(titre) {
    const lignes = await enBase('select responsable from actions where titre = $1', [titre]);
    return lignes.length === 0 ? null : lignes[0].responsable;
  }

  /**
   * Attend le repos et rend `null`, ou rend l'état constaté à l'expiration.
   * On ne laisse pas l'expiration remonter telle quelle : « Timeout » n'apprend
   * rien à qui lira le rouge, alors que l'état, lui, nomme le défaut.
   */
  async function attendreLeRepos(page, delai) {
    try {
      await page.waitForFunction(
        () => {
          const e = window.Sync.etat();
          return e.enAttente === false && e.enCours === false;
        },
        null,
        { timeout: delai },
      );
      return null;
    } catch {
      return page.evaluate(() => window.Sync.etat());
    }
  }

  test('après le renommage, et SANS aucun autre geste, la page revient au repos', async () => {
    const titre = 'Action repère du constat Q-15';
    const session = await ouvrirApplication();
    try {
      await session.page.evaluate((t) => {
        window.DataStore.addAction({ id: window.UI.genId('ACT'), titre: t, responsable: '7' });
      }, titre);
      await attendreQuiescence(session.page);
      assert.equal(await responsableEnBase(titre), '7', 'Départ : les deux côtés portent « 7 ».');

      // Le renommage large : le serveur ré-attribue l'identifiant, et le balayage
      // des références réécrit le « responsable » de l'action.
      await session.page.evaluate(() => {
        window.DataStore.addRisque({ id: '7', nom: 'Risque du constat Q-15' });
      });
      await session.page.waitForFunction(
        () => {
          const r = window.DataStore.getRisques().find((x) => x.nom === 'Risque du constat Q-15');
          return r !== undefined && r.id !== '7';
        },
        null,
        { timeout: 15000 },
      );

      // ── À partir d'ici, AUCUN geste : c'est tout le sujet ────────────────
      // Dix secondes, très au-delà du regroupement (400 ms) et de la relance
      // réseau (8 s) : si rien ne part dans ce délai, rien ne partira.
      const bloquee = await attendreLeRepos(session.page, 10000);
      const memoire = await session.page.evaluate(
        (t) => window.DataStore.getActions().find((a) => a.titre === t).responsable,
        titre,
      );
      const base_ = await responsableEnBase(titre);

      assert.equal(
        bloquee,
        null,
        'La page ne revient jamais au repos après une réécriture de références. ' +
          `État : ${JSON.stringify(bloquee)} · mémoire : ${JSON.stringify(memoire)} · ` +
          `base : ${JSON.stringify(base_)}. L'utilisateur voit « modifications non ` +
          'enregistrées » sans avoir rien saisi, et ne peut rien faire pour l’éteindre.',
      );

      // ── LA divergence, qui est le défaut lui-même ───────────────────────
      assert.equal(
        base_,
        memoire,
        'Au repos, l’écran et la base doivent porter la MÊME valeur. Une réécriture ' +
          'qui ne part pas laisse la preuve d’audit en désaccord avec ce qui est montré.',
      );
      assert.notEqual(base_, '7', 'Et c’est bien la valeur réécrite qui a été enregistrée.');
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE SYMÉTRIQUE : sans renommage, une saisie ordinaire revient au repos seule', async () => {
    // Sans cette moitié, l'essai précédent serait satisfait par un produit qui n'a
    // jamais rien en attente — c'est-à-dire par la suppression du mécanisme même
    // qui protège les saisies non parties.
    const titre = 'Action témoin du constat Q-15';
    const session = await ouvrirApplication();
    try {
      await session.page.evaluate((t) => {
        window.DataStore.addAction({ id: window.UI.genId('ACT'), titre: t, responsable: 'Personne fictive' });
      }, titre);
      await attendreQuiescence(session.page);

      // Une modification ordinaire, et rien d'autre : elle DOIT partir seule.
      await session.page.evaluate((t) => {
        const action = window.DataStore.getActions().find((a) => a.titre === t);
        window.DataStore.updateAction({ ...action, responsable: 'Autre personne fictive' });
      }, titre);
      assert.equal(
        await session.page.evaluate(() => window.Sync.etat().enAttente),
        true,
        'La saisie doit d’abord être « en attente » : sinon cet essai ne mesure rien.',
      );

      const bloquee = await attendreLeRepos(session.page, 10000);
      assert.equal(bloquee, null, `La page doit revenir au repos seule : ${JSON.stringify(bloquee)}`);
      assert.equal(
        await responsableEnBase(titre),
        'Autre personne fictive',
        'Et la valeur doit être arrivée en base.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §9 — Ce qui PARLE doit être éprouvé quand il parle (constat Q-21)
 * =====================================================================
 *
 *  Trois des cinq comportements que le constat Q-3 exigeait n'étaient exercés
 *  que dans le sens du SILENCE : « sur un lot sain, le bandeau ne dit rien »,
 *  « aucun défaut interne n'est annoncé ». L'auditeur les a neutralisés un par
 *  un — le banc est resté vert, 32 sur 32.
 *
 *  Un essai qui n'exige que du silence ne peut pas échouer quand on retire ce
 *  qui parle : il est satisfait par un produit qui ne dit jamais rien. C'est la
 *  question que ce chantier s'est apprise — *la question utile n'est pas « est-ce
 *  que ça passe », c'est « qu'est-ce qui passerait aussi »* — appliquée à ce banc,
 *  et elle mord. Les assertions de silence des §5 restent : elles sont la moitié
 *  symétrique de celles-ci, et n'ont de valeur qu'avec elles.
 * ===================================================================== */

describe('Les avertissements du produit, éprouvés quand ils PARLENT (constat Q-21)', () => {
  /** Le texte du bandeau de synchronisation, tel qu'un utilisateur le lit. */
  function bandeauDe(page) {
    return page.evaluate(
      () => (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent,
    );
  }

  test('LE CANARI PARLE : deux enregistrements de même identifiant sont ANNONCÉS', async () => {
    // ── Ce que le canari protège ────────────────────────────────────────────
    //
    // Deux enregistrements d'une même collection portant le même identifiant :
    // `getRisqueById` ne sait plus lequel rendre, et c'est ainsi que le bloquant
    // T-1 faisait disparaître des lignes. Le générateur a été corrigé ; si cela
    // se reproduisait — régression, fichier repris incohérent, export ancien —
    // le produit doit le DIRE plutôt que de trancher en silence.
    const session = await ouvrirApplication();
    try {
      // ── Moitié symétrique, jouée EN PREMIER ─────────────────────────────
      // Sur un jeu sain, le canari se tait. Sans cette moitié, l'essai serait
      // satisfait par un bandeau qui crie toujours — et un avertissement
      // permanent est un avertissement mort.
      await session.page.evaluate(() => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: 'Risque parfaitement ordinaire' });
      });
      await attendreQuiescence(session.page);
      assert.equal(
        /Identifiants en double/i.test(await bandeauDe(session.page)),
        false,
        'Aucun doublon ne doit être annoncé sur un jeu sain.',
      );

      // ── Puis le doublon, et il doit être annoncé ─────────────────────────
      await session.page.evaluate(() => {
        window.DataStore.addRisque({ id: 'DOUBLON-Q21', nom: 'Premier porteur de la clé' });
        window.DataStore.addRisque({ id: 'DOUBLON-Q21', nom: 'Second porteur de la même clé' });
      });
      await session.page.waitForFunction(
        () => /Identifiants en double/i.test(
          (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent,
        ),
        null,
        { timeout: 15000 },
      );

      const texte = await bandeauDe(session.page);
      assert.match(
        texte,
        /risques \/ DOUBLON-Q21/,
        `L’avertissement doit NOMMER la collection et la clé, sinon il est inexploitable : ${texte}`,
      );
      assert.match(
        texte,
        /peut être inaccessible/i,
        `Et dire ce que l’utilisateur risque : ${texte}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('LE SONDAGE POUSSE : une écriture en attente repart sans aucun geste', async () => {
    // ── Le troisième reproche du bloquant T-1 ───────────────────────────────
    //
    // « Rien ne repart tout seul » : un lot resté en attente y restait
    // indéfiniment — deux cycles de sondage plus tard comme au premier instant —
    // jusqu'à ce qu'une saisie de l'utilisateur réveille l'entonnoir. Le sondage
    // est le seul battement régulier de l'application : c'est à lui de reprendre
    // ce qui traîne, MÊME sans minuteur armé.
    //
    // L'essai de coupure de VPN du §2 ne l'éprouve pas : il appelle `pousser()`
    // lui-même. C'est justement le geste que le sondage doit rendre inutile.
    const session = await ouvrirApplication();
    try {
      // ── Moitié symétrique : un sondage à vide n'écrit RIEN ───────────────
      // Sans elle, l'essai serait satisfait par un sondage qui écrit toujours —
      // et le rafraîchissement deviendrait une écriture périodique.
      // La prémisse se lit AVANT l'appel : le sondage lui-même provoque un
      // réaffichage, et le tableau de bord réarme alors son point d'historique du
      // jour. Lire l'état APRÈS mesurerait ce réarmement, pas le sondage — la
      // première rédaction de cet essai s'y est fait prendre.
      assert.equal(
        await session.page.evaluate(() => window.Sync.etat().enAttente),
        false,
        'La page doit être au repos AVANT la mesure : sinon ce n’est pas un sondage à vide.',
      );
      const avantVide = application.appelsPar('POST').length + application.appelsPar('PUT').length;
      await session.page.evaluate(() => window.Sync.sonder());
      assert.equal(
        application.appelsPar('POST').length + application.appelsPar('PUT').length,
        avantVide,
        'Un sondage sans rien en attente ne doit émettre AUCUNE écriture : le ' +
          'rafraîchissement n’est pas une écriture périodique.',
      );

      // ── Une écriture reste en attente, et AUCUN minuteur ne l'attend ─────
      // La coupure fait échouer l'envoi : le minuteur de regroupement a déjà
      // tiré, la saisie reste en mémoire. C'est l'état que le sondage doit
      // rattraper.
      application.definirApiInjoignable(true);
      const coupe = await session.page.evaluate(async () => {
        window.DataStore.addRisque({
          id: window.UI.genId('RISK'),
          nom: 'Écriture reprise par le sondage',
        });
        await window.Sync.pousser();
        return window.Sync.etat();
      });
      assert.equal(coupe.enAttente, true, 'La saisie doit être en attente…');
      assert.equal(coupe.panneReseau, true, '…et le réseau déclaré en panne.');

      application.definirApiInjoignable(false);
      assert.deepEqual(
        await enBase("select id from risques where nom = 'Écriture reprise par le sondage'"),
        [],
        'Rien ne doit être en base avant le sondage : c’est ce qu’on va lui demander de faire.',
      );

      // ── LA propriété : le sondage, et rien d'autre ───────────────────────
      // `sonder()` attend le cycle qu'il déclenche : au retour, l'écriture est
      // faite ou elle ne le sera pas. Aucune fenêtre de temps, aucune course.
      await session.page.evaluate(() => window.Sync.sonder());

      const arrivee = await enBase("select nom from risques where nom = 'Écriture reprise par le sondage'");
      assert.equal(
        arrivee.length,
        1,
        'Le sondage doit reprendre ce qui attend. Sans cela, une saisie que le réseau a ' +
          'fait échouer reste en mémoire indéfiniment, et l’utilisateur croit l’avoir ' +
          'enregistrée — c’est le troisième reproche du bloquant T-1.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      application.definirApiInjoignable(false);
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §10 — Le signalement de rétrécissement : ce qu'on peut en prouver,
 *        et ce qu'on ne peut pas encore
 * ===================================================================== */

describe('Le signalement de rétrécissement reste câblé (constat Q-21)', () => {
  /**
   * ── Pourquoi cet essai est structurel, et pourquoi je le dis ────────────────
   *
   * Les deux autres comportements de Q-21 sont éprouvés par le COMPORTEMENT : on
   * provoque le doublon, on provoque l'attente, et l'on exige que le produit
   * parle. Celui-ci ne peut pas l'être aujourd'hui, et ce n'est pas un choix de
   * confort — c'est une propriété du code, que j'ai vérifiée avant de me rabattre
   * sur un balayage :
   *
   *  · premier appelant, `ecrireEnLot` : `compter` est `liste.length`, et
   *    `ordonnerCreations` réintroduit elle-même en fin de fonction tout rang
   *    resté en plan (« Cycle de références : le reste part dans l'ordre
   *    d'origine »). Le compte rendu est donc TOUJOURS égal au compte reçu ;
   *  · second appelant, `ecrireParPasses` : chaque élément confié passe par
   *    exactement une branche qui incrémente `traites`, y compris la sortie de
   *    secours « toutes différées ». `traites !== items.length` ne peut pas se
   *    produire.
   *
   * `signalerRetrecissement` est donc un FILET pour un défaut de programmation
   * que le code actuel ne sait pas produire. Aucune donnée, si hostile soit-elle,
   * ne l'atteint : un essai qui prétendrait l'exercer par les données mentirait
   * sur ce qu'il fait — et c'est exactement le reproche du constat Q-21.
   *
   * Ce qui reste vérifiable, et qui n'est pas rien : que le filet soit toujours
   * BRANCHÉ à ses deux appelants, et qu'il PARLE encore sur ses deux canaux — la
   * console pour l'exploitant, l'incident pour l'utilisateur. C'est ce que la
   * mutation de l'auditeur retirait, et c'est ce que cet essai fait tomber.
   *
   * Ce qu'il faudrait pour faire mieux : une couture dans `js/core/**` — le
   * mécanisme d'incident accepte déjà `collection: "__cycle"`, il suffirait qu'un
   * point d'entrée d'essai puisse déclarer un lot rétréci. Cela n'est pas mon
   * périmètre ; je le nomme plutôt que de le contourner.
   */
  const source = readFileSync(join(RACINE_FRONTEND, 'js', 'core', 'sync.js'), 'utf8');

  /** Corps de la fonction, BORNÉ : jusqu'à l'accolade fermante en colonne 4. */
  function corpsDe(nom) {
    const debut = source.indexOf(`function ${nom}(`);
    assert.notEqual(debut, -1, `« ${nom} » a disparu ou changé de nom.`);
    const fin = source.indexOf('\n    }\n', debut);
    assert.ok(fin > debut, `Corps de « ${nom} » illisible.`);
    return source.slice(debut, fin);
  }

  test('le filet PARLE encore sur ses deux canaux', async () => {
    const corps = corpsDe('signalerRetrecissement');

    assert.match(
      corps,
      /console\.error\(/,
      'Le canal de l’EXPLOITANT a disparu : un défaut interne ne laisserait plus de trace ' +
        'dans la console, là où on la cherche après coup.',
    );
    assert.match(
      corps,
      /ajouterIncident\(/,
      'Le canal de l’UTILISATEUR a disparu : le défaut serait réparé en silence, et ' +
        '« 250 importées / 225 en base » redeviendrait invisible — c’est le bloquant T-1.',
    );
    assert.match(
      corps,
      /manquants/,
      'Et il doit dire COMBIEN : « un défaut interne » sans nombre n’est pas exploitable.',
    );

    // ── Contrôles de morsure du balayage lui-même ───────────────────────────
    // Le corps lu doit être CELUI de la fonction : s'il débordait sur la suite du
    // fichier, il verrait n'importe quel `console.error` et ne signalerait plus
    // jamais rien. C'est la faute que le sabotage M15 avait révélée ailleurs.
    assert.equal(
      /function (?!signalerRetrecissement)[A-Za-z]+\(/.test(corps),
      false,
      `Le balayage déborde sur la fonction suivante : ${corps.slice(-160)}`,
    );
    // Et le motif doit savoir dire non.
    assert.equal(/console\.error\(/.test('function signalerRetrecissement() { return 0; }'), false);
  });

  test('le filet est APPELÉ, aux deux endroits où un lot peut rétrécir', async () => {
    const appels = source.match(/signalerRetrecissement\(/g) ?? [];
    // Une déclaration plus deux appels.
    assert.equal(
      appels.length,
      3,
      `« signalerRetrecissement » doit être déclarée une fois et appelée deux fois ` +
        `(trouvé ${String(appels.length)} occurrences). Un filet que rien n’appelle est un ` +
        'commentaire ; un troisième appel demande à être lu.',
    );
    // Les deux appelants sont nommés, et le balayage les retrouve par leur nom :
    // si l'un est renommé, cet essai le dit au lieu de compter juste par hasard.
    assert.match(
      corpsDe('appliquer'),
      /signalerRetrecissement\(/,
      'Le tri des créations n’appelle plus le filet : un lot qui rétrécit y passerait sans bruit.',
    );
    assert.match(
      corpsDe('ecrireParPasses'),
      /signalerRetrecissement\(/,
      'Le repassage des écritures n’appelle plus le filet.',
    );
  });
});
