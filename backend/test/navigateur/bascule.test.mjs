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

  test('LE CONTRAT DE CRÉATION : ce que le navigateur envoie doit être accepté', async () => {
    // Ce test isole, en une seule assertion, la cause de tous les échecs de création
    // de ce fichier. Il est écrit séparément pour qu'un agent qui lit le rapport de
    // la suite voie LE défaut, et non ses cinq conséquences.
    //
    // Le frontend engendre l'identifiant lui-même (`UI.genId`, convention
    // « <PRÉFIXE>-<horodatage>-<aléa> » du `CONVENTIONS.md` §2, celle qui rend le
    // round-trip d'un export `grc-backup` exact) et l'envoie dans le corps. Si la
    // route le refuse, PLUS AUCUNE CRÉATION n'est possible depuis l'application —
    // risques, actions, incidents, documents, tout.
    //
    // Les deux moitiés du contrat sont ici ; l'arbitrage entre elles appartient aux
    // agents API et FRONT, pas au banc d'essai. Ce que le banc exige, c'est
    // qu'elles se rencontrent.
    const session = await ouvrirApplication();
    try {
      const codes = await session.page.evaluate(async () => {
        const envoyer = (corps) =>
          fetch('/api/entites/risques', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(corps),
          }).then((r) => r.status);
        return {
          commeLeFrontendEnvoie: await envoyer({ id: window.UI.genId('RISK'), champs: { nom: 'contrat' } }),
          sansIdentifiant: await envoyer({ champs: { nom: 'contrat' } }),
        };
      });
      assert.equal(
        codes.commeLeFrontendEnvoie,
        201,
        'La création telle que `js/core/sync.js` l’émet — identifiant compris — doit aboutir. ' +
          'Un 400 ici rend l’application incapable de créer quoi que ce soit.',
      );
      assert.equal(codes.sansIdentifiant, 201);
    } finally {
      await session.fermer();
    }
  });

  test('une saisie faite dans le navigateur arrive en base, et y reste', async () => {
    const session = await ouvrirApplication();
    try {
      const identifiant = await session.page.evaluate(async () => {
        const id = window.UI.genId('RISK');
        window.DataStore.addRisque({ id, nom: 'Rupture d’approvisionnement', description: 'saisie du banc' });
        await window.Sync.pousser();
        return id;
      });

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
        const id = window.UI.genId('RISK');
        window.DataStore.addRisque({ id, nom: 'Saisie pendant la coupure' });
        await window.Sync.pousser();
        return { etat: window.Sync.etat(), id };
      });
      assert.equal(etatCoupe.etat.enAttente, true, 'La saisie doit rester EN ATTENTE, pas disparaître.');

      const absente = await enBase('select id from risques where id = $1', [etatCoupe.id]);
      assert.equal(absente.length, 0, 'Et elle n’est évidemment pas en base : le serveur est coupé.');

      // Le VPN revient.
      application.definirApiInjoignable(false);
      await session.page.evaluate(async () => {
        await window.Sync.pousser();
      });

      const arrivee = await enBase('select nom from risques where id = $1', [etatCoupe.id]);
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
        const id = window.UI.genId('ACT');
        window.DataStore.addAction({ id, titre: 'Action qui doit survivre au rechargement' });
        await window.Sync.pousser();
        return id;
      });

      await session.page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');

      const survit = await session.page.evaluate(
        (id) => window.DataStore.getActions().some((a) => a.id === id),
        identifiant,
      );
      assert.equal(survit, true);
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});
