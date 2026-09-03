/**
 * connexion.test.mjs — l'écran de connexion, les deux refus, et la session qui
 * expire pendant une saisie.
 *
 * ── Ce que ce fichier éprouve, et pourquoi il existe ────────────────────────
 *
 * `PLAN_EXECUTION` §3, ligne FRONT du lot L3 : « écran de connexion dans la
 * porte de démarrage existante, traitement des 401/403, expiration de session
 * **sans perte de saisie** ». Le critère d'acceptation est écrit en toutes
 * lettres : *une session expirée pendant une saisie ne détruit pas la saisie*,
 * et *l'application ne démarre pas sur un jeu vide si le serveur refuse*.
 *
 * Le second est une règle posée en vague 2, et elle tient : démarrer sur un jeu
 * vide afficherait « aucun risque, aucune action, aucun incident » dans un
 * outil qui sert de preuve en audit.
 *
 * ── Pourquoi les réponses du serveur sont façonnées depuis l'essai ──────────
 *
 * ⚠️ **Au moment où ce fichier est écrit, la route de connexion n'existe pas
 * encore côté serveur** : elle est écrite en parallèle (agent A1, greffon
 * exporté depuis `src/auth/`, enregistré par A2 — `CONVENTIONS.md` §26.2). Les
 * refus sont donc façonnés par `page.route`, **au niveau du navigateur**, selon
 * la forme que le §26 fige : `401 non_authentifie`, `403 droit_insuffisant`,
 * et une connexion qui rend *exactement la charge de `GET /api/session`*.
 *
 * Ce que cela éprouve réellement : **la réaction du navigateur**, qui est le
 * livrable de cet agent. Ce que cela n'éprouve PAS : que le serveur émette bien
 * ces codes. Cette moitié-là appartient à `test/auth/**` et `test/api/**`, et
 * elle est signalée comme telle plutôt que supposée.
 *
 * Le jour où la route existe, la première ligne à changer est le façonnage —
 * pas les assertions, qui portent sur le comportement de l'écran.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/**
 * Délai d'attente des essais de ce fichier.
 *
 * ⚠️ **60 s, et ce n'est pas un délai « au cas où ».** `npm test` exécute les
 * fichiers d'essai en parallèle : depuis la vague 3, ce sont **cinq** familles
 * qui lancent chacune un Chromium, plus la famille de déploiement qui monte un
 * Apache réel — sur quatre cœurs. Mesuré : les essais de ce fichier passent en
 * ~1,5 s à 3 s joués seuls, et butaient sur la borne de 15 s joués avec toute
 * la suite, tous à ~15,4 s, c'est-à-dire sur la borne elle-même.
 *
 * Relever la borne n'est PAS masquer une course : ce qui est attendu ici est un
 * état que le produit atteint, et la lenteur vient de la machine, pas du
 * produit. La distinction est celle du constat Q-64 — un banc qui rougit pour
 * une raison sur laquelle personne ne peut agir apprend à être ignoré.
 */
const DELAI = 60_000;

let base;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

/** Ce que la base contient réellement, lu par une connexion tierce. */
async function enBase(texte, valeurs = []) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
    (await c.query(texte, valeurs)).rows);
}

/**
 * Fait répondre au serveur ce que la couche d'authentification répondra.
 *
 * `page.route` intercepte **avant** que la requête ne parte : le relais du banc
 * n'en sait rien, et le reste de l'application continue de parler au vrai
 * serveur. C'est le seul moyen, tant que la route n'existe pas, de façonner un
 * refus sans toucher au périmètre d'un autre agent.
 */
async function refuser(page, motif, statut, erreur, message) {
  await page.route(motif, (route) =>
    route.fulfill({
      status: statut,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ erreur, message, reference: 'essai' }),
    }));
}

/**
 * Fait réussir `POST /api/connexion` en rendant **la charge de `GET
 * /api/session`**, comme le §26.2 l'impose. On ne fabrique pas cette charge :
 * on va la chercher au vrai serveur, sans quoi l'essai éprouverait sa propre
 * idée de ce qu'est une session.
 */
async function accepterLaConnexion(page) {
  await page.route('**/api/connexion', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const vraie = await route.fetch({ url: `${application.url}/api/session`, method: 'GET' });
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: await vraie.text(),
    });
  });
}

/** Ouvre la page SANS attendre le démarrage : ici, il peut ne pas venir. */
async function ouvrirPageBrute() {
  const session = await ouvrirPage(navigateur);
  return session;
}

async function aller(session) {
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
}

/**
 * Attend un état de `sync.js`, et dit CE QU'ON A VU quand il ne vient pas.
 *
 * Même raison qu'au §13 de `bascule.test.mjs` (constat Q-64) : « Timeout
 * 15000ms exceeded » ne dit ni ce qui était attendu, ni ce que la page portait.
 * Un échec sur lequel on ne peut rien faire se relance ; il ne se lit pas.
 * L'aide partagée `test/aide/**` appartient à un autre agent : le filet est donc
 * local, et court.
 */
async function attendreEtatSync(page, predicat, description) {
  try {
    await page.waitForFunction(predicat, null, { timeout: DELAI, polling: 100 });
  } catch (erreur) {
    const vu = await page
      .evaluate(() => ({
        etat: window.Sync.etat(),
        bandeau: (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent.trim(),
      }))
      .catch(() => null);
    throw new Error(
      `L’état attendu n’est jamais venu : ${description}\n` +
        `état de synchronisation : ${JSON.stringify(vu?.etat ?? null)}\n` +
        `bandeau : ${vu?.bandeau || '(vide)'}\n` +
        `cause : ${String(erreur.message).split('\n')[0]}`,
    );
  }
}

/** Attend un élément par son identifiant, en disant ce qu'on a vu à la place. */
async function attendreElement(page, identifiant, description) {
  try {
    await page.waitForFunction(
      (id) => document.getElementById(id) !== null,
      identifiant,
      { timeout: DELAI, polling: 100 },
    );
  } catch (erreur) {
    const vu = await page
      .evaluate(() => (document.getElementById('lock-overlay') ?? { textContent: '' }).textContent.trim())
      .catch(() => '(page illisible)');
    throw new Error(
      `« ${identifiant} » n’est jamais apparu : ${description}\n` +
        `écran affiché : ${vu || '(aucun voile)'}\n` +
        `cause : ${String(erreur.message).split('\n')[0]}`,
    );
  }
}

/* =====================================================================
 *  §1 — Le 401 au démarrage ouvre une PORTE, pas un écran de panne
 * ===================================================================== */

describe('Un serveur qui demande qui vous êtes ouvre l’écran de connexion', () => {
  test('401 au démarrage : le formulaire s’affiche, et l’application NE DÉMARRE PAS', async () => {
    const session = await ouvrirPageBrute();
    try {
      await refuser(session.page, '**/api/session', 401, 'non_authentifie',
        "Votre session n'est pas ouverte sur le serveur.");
      await aller(session);

      await attendreElement(session.page, 'login-form',
        'un 401 au démarrage doit ouvrir le formulaire de connexion');

      // ── LA RÈGLE DE LA VAGUE 2 TIENT ────────────────────────────────────
      //
      // « L'application ne démarre pas sur un jeu vide si le serveur refuse. »
      // Ce n'est pas une question d'écran : c'est que rien n'est monté derrière.
      // Un tableau de bord vide annonçant « aucun risque » serait un mensonge
      // dans un outil qui sert de preuve en audit.
      const etat = await session.page.evaluate(() => ({
        appMonte: (document.getElementById('app') ?? { innerHTML: '' }).innerHTML.trim().length > 0,
        donnees: (window.Sync && window.Sync.jeuDeDonnees) ? window.Sync.jeuDeDonnees() : null,
        ecranPanne: document.getElementById('reconnect-btn') !== null,
      }));
      assert.equal(etat.appMonte, false, 'Aucun écran ne doit être monté derrière le formulaire.');
      assert.equal(etat.donnees, null, 'Et aucun jeu de données ne doit avoir été adopté.');
      assert.equal(
        etat.ecranPanne, false,
        'Ce n’est PAS une panne : proposer « Réessayer » enverrait l’utilisateur rejouer un ' +
          'refus qui se reproduira à l’identique. Un 401 se répond, il ne se retente pas.',
      );
      assert.deepEqual(session.erreursScript, [], 'CLAUDE.md §5 : zéro erreur de script.');
    } finally {
      await session.fermer();
    }
  });

  test('identifiants refusés : l’identifiant SAISI est conservé, le mot de passe non', async () => {
    const session = await ouvrirPageBrute();
    try {
      await refuser(session.page, '**/api/session', 401, 'non_authentifie', 'Session absente.');
      await refuser(session.page, '**/api/connexion', 401, 'non_authentifie',
        'Identifiant ou mot de passe refusé.');
      await aller(session);
      await attendreElement(session.page, 'login-form', 'formulaire initial');

      await session.page.fill('#login-identifiant', 'rssi.tls');
      await session.page.fill('#login-motdepasse', 'mauvais');
      await session.page.click('#login-btn');

      await attendreElement(session.page, 'login-erreur', 'le refus du serveur doit être affiché');

      const apres = await session.page.evaluate(() => ({
        message: (document.getElementById('login-erreur') ?? { textContent: '' }).textContent,
        identifiant: (document.getElementById('login-identifiant') ?? { value: null }).value,
        motDePasse: (document.getElementById('login-motdepasse') ?? { value: null }).value,
      }));

      // La phrase vient du SERVEUR : lui seul sait ce qui s'est passé (compte
      // verrouillé, annuaire injoignable, identifiants refusés), et l'essai ne
      // fige donc pas une formulation de son cru.
      assert.equal(apres.message.includes('Identifiant ou mot de passe refusé.'), true, apres.message);
      assert.equal(
        apres.identifiant, 'rssi.tls',
        'Faire retaper un identifiant après une faute de frappe sur le mot de passe est une ' +
          'perte de saisie, petite mais quotidienne.',
      );
      assert.equal(
        apres.motDePasse, '',
        'Le mot de passe, lui, ne se conserve pas : ni dans le champ, ni ailleurs.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('connexion acceptée : l’application démarre pour de bon, avec les données du serveur', async () => {
    const session = await ouvrirPageBrute();
    try {
      // Le 401 ne vaut QUE pour le premier appel : une fois connecté, la
      // session doit être servie normalement — c'est ce que fait le serveur.
      let premier = true;
      await session.page.route('**/api/session', (route) => {
        if (premier) {
          premier = false;
          return route.fulfill({
            status: 401,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ erreur: 'non_authentifie', message: 'Session absente.' }),
          });
        }
        return route.continue();
      });
      await accepterLaConnexion(session.page);
      await aller(session);
      await attendreElement(session.page, 'login-form', 'formulaire initial');

      await session.page.fill('#login-identifiant', 'rssi.tls');
      await session.page.fill('#login-motdepasse', 'bon');
      await session.page.click('#login-btn');

      assert.equal(
        await attendreApplication(session.page, { delai: DELAI }), 'chargee',
        'Après une connexion acceptée, l’application doit démarrer.',
      );
      await attendreQuiescence(session.page, { delai: DELAI });

      const risques = await session.page.evaluate(() => window.DataStore.getRisques().map((r) => r.id));
      assert.ok(
        risques.includes('RISK-A'),
        'Et elle doit démarrer sur les VRAIES données de la filiale, pas sur un jeu vide.',
      );
      assert.equal(
        await session.page.evaluate(() => document.getElementById('login-form') !== null),
        false,
        'Le voile de connexion doit avoir disparu.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — Le 403 n'est PAS un 401
 * ===================================================================== */

describe('Un droit manquant ne se répond pas en redemandant le mot de passe', () => {
  test('403 au démarrage : « Accès refusé », aucun formulaire, aucune déconnexion', async () => {
    const session = await ouvrirPageBrute();
    try {
      // On compte ce que le navigateur ENVOIE : le §26.2 interdit de déconnecter
      // sur un 403, et une intention ne se vérifie pas dans un commentaire.
      const envois = [];
      session.page.on('request', (r) => {
        if (r.url().includes('/api/')) envois.push(`${r.method()} ${new URL(r.url()).pathname}`);
      });

      await refuser(session.page, '**/api/session', 403, 'droit_insuffisant',
        "Vous n'avez pas les droits nécessaires pour cette application.");
      await aller(session);

      await attendreElement(session.page, 'logout-btn', 'l’écran « Accès refusé » doit s’afficher');

      const vu = await session.page.evaluate(() => ({
        texte: (document.getElementById('lock-overlay') ?? { textContent: '' }).textContent,
        formulaire: document.getElementById('login-form') !== null,
        appMonte: (document.getElementById('app') ?? { innerHTML: '' }).innerHTML.trim().length > 0,
      }));

      assert.equal(
        vu.formulaire, false,
        'Redemander le mot de passe de quelqu’un de parfaitement connecté le ferait retaper ' +
          'pour obtenir exactement le même refus (CONVENTIONS.md §26.2).',
      );
      assert.match(vu.texte, /Accès refusé/, vu.texte);
      assert.equal(vu.appMonte, false, 'Et rien n’est monté derrière : le serveur a refusé.');

      assert.equal(
        envois.some((e) => e.startsWith('DELETE /api/connexion')), false,
        'Le navigateur ne doit PAS déconnecter de lui-même sur un 403 : la session est valide, ' +
          `c’est le profil qui n’ouvre rien. Envois observés : ${JSON.stringify(envois)}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — LE CRITÈRE : une session qui expire ne détruit pas la saisie
 * =====================================================================
 *
 *  C'est la propriété centrale du livrable, et elle a une histoire : le constat
 *  Q-29 a montré qu'un produit peut être juste dans son état et destructeur
 *  dans le geste qu'il recommande. La réaction spontanée à un 401 — renvoyer à
 *  l'écran de connexion, donc recharger — est exactement ce geste-là.
 *
 *  L'essai mesure les DEUX moitiés de la saisie :
 *   · ce qui est **tapé et pas encore enregistré** — il n'existe que dans le DOM ;
 *   · ce qui est **enregistré en mémoire et pas encore parti** — il n'existe que
 *     dans `data`.
 *  Un voile qui démonterait l'écran perdrait la première ; un rechargement
 *  perdrait les deux.
 * ===================================================================== */

describe('Une session qui expire pendant une saisie ne détruit pas la saisie', () => {
  test('LE GESTE COMPLET : saisie en cours, 401, reconnexion, et tout est là', async () => {
    const nomTape = 'Texte tapé et jamais enregistré';
    const nomEnMemoire = 'Risque saisi juste avant l’expiration';
    const session = await ouvrirPageBrute();
    try {
      await aller(session);
      assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
      await attendreQuiescence(session.page, { delai: DELAI });

      // ── 1. Une saisie EN COURS, dans un vrai formulaire du produit ───────
      await session.page.evaluate(() => { window.location.hash = '#/risques'; });
      await session.page.waitForSelector('#addRisqueBtn', { timeout: DELAI });
      await session.page.click('#addRisqueBtn');
      await session.page.waitForSelector('#nom', { timeout: DELAI });
      await session.page.fill('#nom', nomTape);

      // ── 2. La session expire, et c'est une ÉCRITURE qui le découvre ──────
      await refuser(session.page, '**/api/entites/**', 401, 'non_authentifie',
        "Votre session n'est pas ouverte sur le serveur.");
      await session.page.evaluate((n) => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: n });
      }, nomEnMemoire);

      await attendreElement(session.page, 'login-form',
        'un 401 pendant l’utilisation doit poser le voile de reconnexion');

      const pendant = await session.page.evaluate((args) => ({
        titre: (document.querySelector('#lock-overlay .lock-title') ?? { textContent: '' }).textContent,
        texte: (document.getElementById('lock-overlay') ?? { textContent: '' }).textContent,
        champToujoursLa: (document.getElementById('nom') ?? { value: null }).value,
        enMemoire: window.DataStore.getRisques().some((r) => r.nom === args[1]),
        bloques: window.Sync.etat().bloques,
      }), [nomTape, nomEnMemoire]);

      assert.match(pendant.titre, /Session expirée/, pendant.titre);
      assert.equal(
        pendant.champToujoursLa, nomTape,
        'LE FORMULAIRE EN COURS A ÉTÉ DÉTRUIT. Le voile doit se poser PAR-DESSUS l’application, ' +
          'sans rien démonter : ce qui est tapé n’existe que dans le DOM.',
      );
      assert.equal(
        pendant.enMemoire, true,
        'La saisie enregistrée en mémoire a disparu : elle n’existe nulle part ailleurs.',
      );
      assert.equal(pendant.bloques, 1, 'Et elle est marquée comme non partie, pas comme perdue.');

      // ── 3. Le voile met en garde contre LE geste destructeur ─────────────
      //
      // Même leçon qu'aux constats Q-29 et Q-57 : le produit nomme le geste qui
      // conserve, et nomme celui qui détruit pour l'écarter. Se taire
      // laisserait l'utilisateur essayer F5.
      assert.match(
        pendant.texte, /F5|actualis/i,
        `Le voile ne met pas en garde contre le rafraîchissement du navigateur, qui perdrait ` +
          `tout.\n${pendant.texte}`,
      );
      assert.match(
        pendant.texte, /conserv/i,
        `Et il ne dit pas que la saisie est conservée : l’utilisateur qui l’ignore recharge.\n` +
          `${pendant.texte}`,
      );

      // ── 4. LA RECONNEXION, et ce qui attendait REPART ────────────────────
      await accepterLaConnexion(session.page);
      await session.page.unroute('**/api/entites/**');
      await session.page.fill('#login-identifiant', 'rssi.tls');
      await session.page.fill('#login-motdepasse', 'bon');
      await session.page.click('#login-btn');

      await session.page.waitForFunction(
        () => document.getElementById('login-form') === null,
        null,
        { timeout: DELAI, polling: 100 },
      );
      // Ce qui attendait doit REPARTIR : sans cela, « conservé » veut dire
      // « en sursis », et l'utilisateur croit son travail sauvé.
      await attendreEtatSync(
        session.page,
        () => window.Sync.etat().bloques === 0,
        'après la reconnexion, ce qui était bloqué par la session doit repartir',
      );
      await attendreQuiescence(session.page, { delai: DELAI });

      const apres = await session.page.evaluate((n) => ({
        champToujoursLa: (document.getElementById('nom') ?? { value: null }).value,
        bloques: window.Sync.etat().bloques,
      }), nomTape);

      assert.equal(
        apres.champToujoursLa, nomTape,
        'Après la reconnexion, l’écran doit être rendu tel qu’il était : c’est tout l’intérêt ' +
          'd’avoir posé un voile plutôt que rechargé.',
      );
      assert.equal(apres.bloques, 0, 'Et plus rien ne doit rester bloqué.');

      // ── LA MOITIÉ SANS LAQUELLE « CONSERVÉ » NE VEUT RIEN DIRE ───────────
      //
      // Conserver une saisie à l'écran sans jamais la renvoyer n'est pas une
      // préservation, c'est un sursis. On vérifie donc EN BASE.
      const enServeur = await enBase('select count(*)::int as n from risques where nom = $1',
        [nomEnMemoire]);
      assert.equal(
        enServeur[0].n, 1,
        'La saisie conservée doit ARRIVER au serveur après la reconnexion. Sans cela, ' +
          'l’utilisateur croit son travail sauvé et il ne l’est pas.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE SYMÉTRIQUE : un 403 sur une écriture ne pose AUCUN voile', async () => {
    // Un refus de droit n'est pas une expiration. Traiter l'un comme l'autre
    // demanderait son mot de passe à quelqu'un de parfaitement connecté — et
    // c'est très exactement ce que le §26.2 interdit.
    const nom = 'Écriture refusée par le profil';
    const session = await ouvrirPageBrute();
    try {
      await aller(session);
      assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
      await attendreQuiescence(session.page, { delai: DELAI });

      await refuser(session.page, '**/api/entites/**', 403, 'droit_insuffisant',
        "Vous n'avez pas les droits nécessaires pour cette action.");
      await session.page.evaluate((n) => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: n });
      }, nom);

      await session.page.waitForFunction(
        () => window.Sync.etat().bloques > 0 && window.Sync.etat().enCours === false,
        null,
        { timeout: DELAI, polling: 100 },
      );

      const vu = await session.page.evaluate((n) => ({
        voile: document.getElementById('login-form') !== null,
        bandeau: (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent,
        saisieALEcran: window.DataStore.getRisques().some((r) => r.nom === n),
        renvoi: document.getElementById('sync-renvoyer') !== null,
      }), nom);

      assert.equal(vu.voile, false, 'Un 403 ne demande pas de se reconnecter.');
      assert.match(vu.bandeau, /Écriture refusée/, vu.bandeau);
      assert.equal(
        vu.saisieALEcran, true,
        'Et la saisie reste à l’écran : le serveur n’a rien écrit, mais l’utilisateur vient de ' +
          'la taper. La lui effacer serait une perte sèche.',
      );
      assert.equal(
        vu.renvoi, false,
        '« Envoyer à nouveau » ne doit PAS être proposé : réémettre ce que le profil n’a pas le ' +
          'droit d’écrire ne peut rendre que le même refus, et un bouton qui échoue toujours ' +
          'apprend à ignorer le bandeau.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});
