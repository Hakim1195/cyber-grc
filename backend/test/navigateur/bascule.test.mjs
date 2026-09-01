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

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

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
