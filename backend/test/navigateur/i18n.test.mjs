/**
 * i18n.test.mjs — L'INTERFACE CHANGE VRAIMENT DE LANGUE, ET LA BASE NE BOUGE PAS.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier éprouve, et pourquoi il faut un vrai navigateur
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `backend/test/depot/traductions.test.mjs` confronte des CLÉS à des
 * dictionnaires : c'est de la comptabilité, et elle est nécessaire. Elle ne dit
 * rien de ce qu'un utilisateur voit. Quatre propriétés du lot L10 ne se
 * mesurent qu'à l'écran, et chacune a une raison d'être ici :
 *
 *  1. **changer de langue change le texte affiché**, sur plusieurs écrans — pas
 *     seulement sur celui qu'on a converti en dernier ;
 *  2. **une clé absente affiche LA CLÉ** (§37.2). C'est la règle qui décide de
 *     la forme du lot, et la seule façon de la prouver est de RETIRER une clé et
 *     de constater. Un dictionnaire complet ne prouve rien de ce qui arrive
 *     quand il ne l'est pas ;
 *  3. **une date s'affiche dans la langue, et repart en ISO** (§37.6). C'est la
 *     seule assertion qui protège le schéma : formater à l'écriture serait un
 *     changement de schéma qui ne dit pas son nom ;
 *  4. **la préférence survit à un rechargement** (§37.4).
 *
 * ── La leçon appliquée ici, et elle vient de la vague 3 ────────────────────
 *
 * *Un essai vert qui n'a rien eu à mesurer rend le même verdict qu'un essai vert
 * qui a tout mesuré* (`CLAUDE.md` §8, constats Q-108 et Q-116). Chaque famille
 * ci-dessous exige donc **de la matière** avant de conclure : un écran non vide,
 * un texte français relevé AVANT la bascule, un envoi réseau réellement capté.
 * Sans cela, « le texte a changé » serait vrai d'un écran vide, et « la date
 * part en ISO » serait vrai d'une requête qui n'est jamais partie.
 *
 * ⚠️ **Le §2 mord le produit, il ne le simule pas** : `definirSubstitution`
 * sert au navigateur un `js/i18n/en.js` DÉRIVÉ DU DÉPÔT dont une clé a été
 * retirée. Le dépôt n'est pas touché, et l'application chargée est la vraie.
 *
 * Prérequis machine : PostgreSQL prêt ; Playwright + Chromium (`CLAUDE.md` §5) ;
 * sur SRV-Infra, `source ~/.grc-essais.env` avant `npm test`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { RACINE_FRONTEND, monterServeurReel } from '../aide/serveur.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';

/**
 * 60 s, même borne et même raison que `test/navigateur/pieges-q64.test.mjs` :
 * `npm test` joue plusieurs familles de navigateur en parallèle, chacune avec
 * son Chromium. Relever la borne ne masque pas une course — ce qui est attendu
 * est un ÉTAT que le produit atteint, et la lenteur vient de la machine.
 */
const DELAI = 60_000;

/** La clé qu'on retirera du dictionnaire anglais pour éprouver le repli. */
const CLE_SACRIFIEE = 'risques.titre';

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

/* =====================================================================
 *  Outillage
 * ===================================================================== */

async function ouvrirApplication(options = {}) {
  const session = await ouvrirPage(navigateur, options);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/**
 * Va sur une route **comme un utilisateur** : par l'adresse.
 *
 * ⚠️ Pas `Router.navigateTo()` : `js/core/router.js` déclare `const Router` au
 * premier niveau, et un `const` de premier niveau **n'est pas** une propriété de
 * `window`. Écrit ainsi, l'essai échouait sur « Cannot read properties of
 * undefined » — et l'aurait fait quel que soit l'état du produit. Le hash, lui,
 * est le geste réel : c'est le routeur qui écoute `hashchange`.
 */
async function aller(page, route) {
  // ── UNE SENTINELLE, PAS UN DÉLAI ────────────────────────────────────────
  //
  // On vide `#app` AVANT de naviguer : « la vue est non vide » devient alors la
  // preuve qu'un rendu a bien eu lieu, et non une coïncidence. Deux versions
  // antérieures ont échoué faute de cela, et toutes deux accusaient la
  // traduction :
  //
  //   · attendre que le balisage CHANGE — or aller au tableau de bord depuis le
  //     tableau de bord rend exactement le même balisage, et l'attente expirait
  //     au bout d'une minute ;
  //   · poser le même hash — qui ne déclenche AUCUN `hashchange`, donc aucun
  //     rendu. D'où le `dispatchEvent` ci-dessous, qui redemande le rendu de la
  //     route courante sans mentir sur l'adresse.
  //
  // C'est la famille du constat Q-64 : un banc qui rougit pour une raison qui
  // n'est pas celle qu'il annonce apprend à être ignoré.
  await page.evaluate((r) => {
    const cible = '#' + r;
    const app = document.getElementById('app');
    if (app !== null) app.innerHTML = '';
    if (window.location.hash === cible) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = cible;
    }
  }, route);
  await page.waitForFunction(
    () => (document.getElementById('app')?.innerHTML.trim().length ?? 0) > 0,
    null,
    { timeout: DELAI },
  );
}

/** Le texte de la vue, et celui du menu — deux surfaces distinctes. */
function surfaces(page) {
  return page.evaluate(() => ({
    vue: document.getElementById('app')?.innerText ?? '',
    menu: document.querySelector('.main-nav')?.innerText ?? '',
    fil: document.getElementById('breadcrumb')?.innerText ?? '',
    langue: window.I18n ? window.I18n.langue() : null,
  }));
}

/**
 * Change la langue **par le geste réel** : le `<select>` de la barre latérale.
 *
 * ⚠️ Pas `I18n.definir()` en direct. Le constat Q-116 a été payé pour cela :
 * un essai qui substituait les droits DANS le navigateur mesurait sa
 * substitution, pas le produit. Ici, le `<select>` déclenche le gestionnaire
 * branché par `js/app.js`, qui redessine menu, barre latérale et vue — et c'est
 * cette chaîne-là qui doit tenir.
 */
async function changerLangue(page, code) {
  await page.waitForSelector('#langue-selector', { timeout: DELAI });
  await page.selectOption('#langue-selector', code);
  await page.waitForFunction(
    (attendu) => window.I18n && window.I18n.langue() === attendu,
    code,
    { timeout: DELAI },
  );
  await page.waitForFunction(
    () => document.getElementById('app')?.innerHTML.trim().length > 0,
    null,
    { timeout: DELAI },
  );
}

/* =====================================================================
 *  §1 — Changer de langue change le texte, sur plusieurs écrans
 * ===================================================================== */

describe('§1 — la bascule de langue atteint réellement l’écran', () => {
  test('TROIS ÉCRANS, LE MENU ET LE FIL D’ARIANE passent du français à l’anglais', async () => {
    const session = await ouvrirApplication();
    try {
      const { page } = session;

      // ── La matière : on relève ce qui est affiché AVANT, et l'on exige que
      //    ce soit du français reconnaissable. Sans ce relevé, « le texte a
      //    changé » serait vrai d'un écran vide.
      const avant = {};
      for (const route of ['/risques', '/actions', '/incidents']) {
        await aller(page, route);
        avant[route] = await surfaces(page);
        assert.ok(
          avant[route].vue.length > 80,
          `L’écran ${route} est quasi vide (${String(avant[route].vue.length)} caractères) : ` +
            'il n’y aurait rien à traduire, et la comparaison ne dirait rien.',
        );
      }
      assert.equal(avant['/risques'].langue, 'fr', 'Sans préférence enregistrée, la langue est le français.');
      assert.match(avant['/risques'].vue, /Registre des Risques/u, 'Écran Risques, en français.');
      assert.match(avant['/actions'].vue, /Plan d’actions|Plan d'actions/u, 'Écran Plan d’actions, en français.');
      assert.match(avant['/incidents'].vue, /Registre des incidents/u, 'Écran Incidents, en français.');
      assert.match(avant['/incidents'].menu, /Tableau de bord/u, 'Menu en français.');
      assert.match(avant['/incidents'].fil, /Risques/u, 'Fil d’Ariane en français.');

      await changerLangue(page, 'en');

      const apres = {};
      for (const route of ['/risques', '/actions', '/incidents']) {
        await aller(page, route);
        apres[route] = await surfaces(page);
      }

      assert.match(apres['/risques'].vue, /Risk register/u, 'Écran Risques, en anglais.');
      assert.match(apres['/actions'].vue, /Action plan/u, 'Écran Plan d’actions, en anglais.');
      assert.match(apres['/incidents'].vue, /Incident register/u, 'Écran Incidents, en anglais.');
      assert.match(apres['/incidents'].menu, /Dashboard/u, 'Le MENU aussi — c’est le balisage statique d’index.html.');
      assert.match(apres['/incidents'].fil, /Risk/u, 'Le fil d’Ariane aussi.');

      // ── Et le français a réellement disparu de ces écrans ────────────────
      //
      // C'est l'assertion qui interdit le pire résultat possible du lot : un
      // écran anglais À MOITIÉ français, qui a l'air fini (§37.2).
      assert.doesNotMatch(apres['/risques'].vue, /Registre des Risques/u);
      assert.doesNotMatch(apres['/incidents'].vue, /Registre des incidents/u);
      assert.doesNotMatch(apres['/incidents'].menu, /Tableau de bord/u);

      assert.deepEqual(
        session.erreursInattendues(),
        [],
        'Aucune erreur de script ni de console, dans les deux langues.',
      );
    } finally {
      await session.fermer();
    }
  });

  test('LES VALEURS DE STATUT s’affichent traduites SANS que la donnée change (§37.3)', async () => {
    const session = await ouvrirApplication();
    try {
      const { page } = session;
      // On se donne de la matière : une action au statut « à faire », valeur
      // contrainte par un `check` du schéma.
      await page.evaluate(() => {
        const a = window.DataStore.getActions()[0];
        a.statut = 'à faire';
        window.DataStore.updateAction(a);
      });
      await attendreQuiescence(page, { delai: DELAI });

      await aller(page, '/actions');
      // ⚠️ **Insensible à la casse, et ce n'est pas de la complaisance.** La
      // classe `.status` porte `text-transform: capitalize` dans `css/style.css`,
      // et `innerText` rend le texte TEL QU'IL EST PEINT : « À Faire », pas « À
      // faire ». L'essai a d'abord échoué là-dessus en annonçant une traduction
      // absente — un rouge qui accusait le mauvais coupable. Ce qu'on veut
      // mesurer est le MOT, pas la casse que la feuille de style lui impose.
      const fr = await page.evaluate(() => document.getElementById('app').innerText);
      assert.match(fr, /À faire/iu, 'En français, le statut s’affiche « À faire ».');

      await changerLangue(page, 'en');
      await aller(page, '/actions');
      const en = await page.evaluate(() => document.getElementById('app').innerText);
      assert.match(en, /To do/iu, 'En anglais, le même statut s’affiche « To do ».');
      assert.doesNotMatch(en, /À faire/iu);

      // ⚠️ ET LA DONNÉE N'A PAS BOUGÉ. C'est tout l'objet du §37.3 : la valeur
      // est stockée et contrainte par un `check`; la traduire à l'écriture
      // casserait le schéma. On relit la valeur EN MÉMOIRE, telle que la façade
      // la porte — c'est elle qui repart au serveur.
      const stocke = await page.evaluate(() => window.DataStore.getActions()[0].statut);
      assert.equal(
        stocke,
        'à faire',
        'La valeur STOCKÉE doit rester « à faire » quelle que soit la langue affichée.',
      );

      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — Une clé absente affiche LA CLÉ (§37.2)
 * ===================================================================== */

describe('§2 — le repli est BRUYANT : une clé manquante s’affiche en clair', () => {
  test('EN RETIRANT UNE CLÉ du dictionnaire anglais, l’écran montre « risques.titre »', async () => {
    const chemin = join(RACINE_FRONTEND, 'js', 'i18n', 'en.js');
    const source = readFileSync(chemin, 'utf8');

    // La clé est retirée du dictionnaire SERVI, jamais du dépôt. On vérifie
    // d'abord qu'elle y est : une substitution qui ne substitue rien rendrait
    // cet essai vert sans avoir rien éprouvé.
    const ligne = new RegExp(`^\\s*"${CLE_SACRIFIEE.replace('.', '\\.')}"\\s*:.*$`, 'm');
    assert.match(
      source,
      ligne,
      `« ${CLE_SACRIFIEE} » doit exister dans en.js pour qu’on puisse la retirer. ` +
        'Sans elle, cet essai mesurerait un dictionnaire déjà incomplet.',
    );
    const ampute = source.replace(ligne, '');
    assert.notEqual(ampute, source, 'La substitution doit réellement retirer la ligne.');

    application.definirSubstitution('/js/i18n/en.js', ampute);
    const session = await ouvrirApplication();
    try {
      const { page } = session;

      // Témoin : en français, le titre est là. Si l'écran était cassé pour une
      // autre raison, on le saurait ici plutôt que de conclure au repli.
      await aller(page, '/risques');
      const fr = await page.evaluate(() => document.getElementById('app').innerText);
      assert.match(fr, /Registre des Risques/u, 'Témoin français : le titre s’affiche.');

      await changerLangue(page, 'en');
      await aller(page, '/risques');
      const en = await page.evaluate(() => document.getElementById('app').innerText);

      assert.match(
        en,
        new RegExp(CLE_SACRIFIEE.replace('.', '\\.'), 'u'),
        `L’écran anglais doit afficher LA CLÉ « ${CLE_SACRIFIEE} » en clair (§37.2). ` +
          `Ce qu’il affiche :\n${en.slice(0, 400)}`,
      );
      assert.doesNotMatch(
        en,
        /Registre des Risques/u,
        'Et surtout PAS le texte français : un écran anglais à moitié français a l’air ' +
          'fini, et le défaut part en production (§37.2).',
      );

      // La clé manquante est signalée en `console.warn` — voyante, et jamais en
      // `console.error`, qui rendrait tout le banc rouge pour une traduction
      // oubliée et apprendrait à ignorer les erreurs.
      const avertissements = session.console.filter(
        (m) => m.type === 'warning' && m.texte.includes(CLE_SACRIFIEE),
      );
      assert.ok(
        avertissements.length >= 1,
        'Le moteur doit AUSSI prévenir au journal technique. Messages vus : ' +
          JSON.stringify(session.console.slice(-6)),
      );
      assert.deepEqual(
        session.erreursInattendues(),
        [],
        'Une clé manquante n’est pas une erreur de script : elle se voit à l’écran.',
      );
    } finally {
      await session.fermer();
      application.definirSubstitution('/js/i18n/en.js', null);
    }
  });
});

/* =====================================================================
 *  §3 — Dates : l'affichage suit la langue, la donnée reste ISO (§37.6)
 * ===================================================================== */

describe('§3 — §37.6 : formater est un affichage, jamais une écriture', () => {
  test('L’AFFICHAGE d’une date suit la langue, et emploie la locale déclarée', async () => {
    const session = await ouvrirApplication();
    try {
      const { page } = session;

      // On compare à ce que `Intl` rend POUR LA LOCALE DE LA LANGUE, calculé
      // dans la page. Comparer à une chaîne écrite ici figerait le résultat
      // d'une version d'ICU, et ferait rougir le banc sur une mise à jour de
      // Chromium — un rouge sur lequel personne ne peut agir (constat Q-64).
      const mesure = await page.evaluate(() => {
        const iso = '2026-09-05';
        const releve = () => ({
          langue: window.I18n.langue(),
          locale: window.I18n.locale(),
          court: window.I18n.date(iso),
          long: window.I18n.dateLongue(iso),
          attenduCourt: new Intl.DateTimeFormat(window.I18n.locale(), {
            year: 'numeric', month: '2-digit', day: '2-digit',
          }).format(new Date(2026, 8, 5)),
        });
        const fr = releve();
        window.I18n.definir('en');
        const en = releve();
        window.I18n.definir('fr');
        return { fr, en };
      });

      assert.equal(mesure.fr.locale, 'fr-FR');
      assert.equal(mesure.en.locale, 'en-GB');
      assert.equal(
        mesure.fr.court, mesure.fr.attenduCourt,
        'La date courte doit être celle qu’`Intl` rend pour la locale française — et non ' +
          'une chaîne construite à la main.',
      );
      assert.equal(mesure.en.court, mesure.en.attenduCourt, 'Idem pour l’anglais.');

      // ⚠️ La forme LONGUE est celle qui montre la différence à l'œil nu. La
      // forme courte est numérique et identique en fr-FR et en-GB — les
      // comparer aurait donné une assertion toujours vraie, donc muette.
      assert.notEqual(
        mesure.fr.long, mesure.en.long,
        'La date longue doit différer d’une langue à l’autre : c’est ce qui prouve que ' +
          '`Intl` reçoit bien la locale courante.',
      );
      assert.match(mesure.fr.long, /septembre/u);
      assert.match(mesure.en.long, /September/u);

      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('LA DATE ENVOYÉE AU SERVEUR RESTE ISO, même l’interface en anglais', async () => {
    const session = await ouvrirApplication();
    try {
      const { page } = session;
      await changerLangue(page, 'en');

      // Un mouchard sur `fetch` : on veut le CORPS, que le relais de
      // `servirApplication` ne conserve pas (il ne note que méthode et chemin).
      await page.evaluate(() => {
        window.__corps = [];
        const vrai = window.fetch.bind(window);
        window.fetch = (ressource, options) => {
          const methode = String((options && options.method) || 'GET').toUpperCase();
          if (methode !== 'GET' && options && typeof options.body === 'string') {
            window.__corps.push({ methode, url: String(ressource), corps: options.body });
          }
          return vrai(ressource, options);
        };
      });

      // Le geste de l'utilisateur, à l'écran : on ouvre une action, on saisit
      // une échéance, on enregistre.
      const identifiant = await page.evaluate(() => window.DataStore.getActions()[0].id);
      await aller(page, `/actions/${identifiant}`);
      await page.waitForSelector('#echeance', { timeout: DELAI });
      await page.fill('#echeance', '2026-09-05');
      await page.click('#saveBtn');
      await attendreQuiescence(page, { delai: DELAI });

      const envois = await page.evaluate(() => window.__corps);
      // ── La matière : sans envoi capté, tout ce qui suit serait vrai du vide.
      const concernes = envois.filter((e) => e.corps.includes('echeance'));
      assert.ok(
        concernes.length >= 1,
        'Aucun envoi portant « echeance » n’a été capté : l’essai n’aurait rien à examiner. ' +
          `Envois vus : ${JSON.stringify(envois.map((e) => `${e.methode} ${e.url}`))}`,
      );

      for (const envoi of concernes) {
        assert.match(
          envoi.corps,
          /"echeance"\s*:\s*"2026-09-05"/u,
          '§37.6 — la date TRANSMISE doit rester ISO (AAAA-MM-JJ). Corps envoyé :\n' + envoi.corps,
        );
        assert.doesNotMatch(
          envoi.corps,
          /05\/09\/2026|September|septembre/u,
          'Aucune forme localisée ne doit atteindre le serveur : formater à l’écriture ' +
            'serait un changement de schéma qui ne dit pas son nom.',
        );
      }

      // Et ce que la façade porte en mémoire est resté ISO lui aussi.
      const enMemoire = await page.evaluate(
        (id) => window.DataStore.getActionById(id).echeance, identifiant,
      );
      assert.equal(enMemoire, '2026-09-05');

      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — La préférence survit au rechargement (§37.4)
 * ===================================================================== */

describe('§4 — §37.4 : la langue choisie est celle de ce poste, et elle tient', () => {
  test('APRÈS RECHARGEMENT, l’interface est encore en anglais', async () => {
    const session = await ouvrirApplication();
    try {
      const { page } = session;
      await changerLangue(page, 'en');

      const cle = await page.evaluate(() => ({
        stockee: localStorage.getItem('cyber-langue'),
        nom: window.I18n.CLE_STOCKAGE,
      }));
      assert.equal(cle.nom, 'cyber-langue', 'Le §37.4 nomme la clé : « cyber-langue ».');
      assert.equal(cle.stockee, 'en', 'Le choix est enregistré sur le poste.');

      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(page, { delai: DELAI }), 'chargee');
      await attendreQuiescence(page, { delai: DELAI });

      await aller(page, '/risques');
      const apres = await surfaces(page);
      assert.equal(apres.langue, 'en', 'La langue résolue au démarrage est celle du poste.');
      assert.match(apres.vue, /Risk register/u, 'Et l’écran est bien en anglais.');
      assert.match(apres.menu, /Dashboard/u, 'Le menu statique aussi, dès le premier rendu.');

      // ⚠️ Le contre-témoin : le §37.4 dit que cette préférence n'est pas une
      // donnée du produit. Elle vaut pour CE poste, et un poste neuf repart en
      // français — sinon on aurait fabriqué un état global sans le dire.
      const neuve = await ouvrirApplication();
      try {
        await aller(neuve.page, '/risques');
        const vierge = await surfaces(neuve.page);
        assert.equal(vierge.langue, 'fr', 'Un contexte neuf n’hérite de rien.');
        assert.match(vierge.vue, /Registre des Risques/u);
        assert.deepEqual(neuve.erreursInattendues(), []);
      } finally {
        await neuve.fermer();
      }

      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §5 — Zéro erreur, dans les deux langues, sur tous les écrans convertis
 * ===================================================================== */

describe('§5 — « 0 erreur » (CLAUDE.md §5), et dans les DEUX langues', () => {
  test('LE PARCOURS COMPLET DES ÉCRANS CONVERTIS NE CRIE PAS', async () => {
    const ROUTES = [
      '/dashboard', '/risques', '/actions', '/incidents', '/exigences',
      '/couverture', '/mesures', '/documents', '/settings',
    ];
    const session = await ouvrirApplication();
    try {
      const { page } = session;
      let visitees = 0;
      for (const langue of ['fr', 'en']) {
        await changerLangue(page, langue);
        for (const route of ROUTES) {
          await aller(page, route);
          const vue = await page.evaluate(() => document.getElementById('app').innerText);
          assert.ok(
            vue.trim().length > 0,
            `L’écran ${route} est vide en « ${langue} » : une traduction a cassé un rendu.`,
          );
          assert.doesNotMatch(
            vue, /Page introuvable/u,
            `L’écran ${route} ne se rend plus en « ${langue} ».`,
          );
          visitees++;
        }
      }
      assert.equal(visitees, ROUTES.length * 2, 'Contrôle de matière du parcours.');
      assert.deepEqual(
        session.erreursInattendues(),
        [],
        'Zéro erreur de script et zéro erreur de console, français ET anglais.',
      );
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §6 — La mise en page tient dans les deux langues
 * ===================================================================== */

describe('§6 — un libellé traduit ne casse pas la barre latérale', () => {
  test('AUCUNE ENTRÉE DE MENU NE DÉBORDE, en français comme en anglais', async () => {
    // ⚠️ L'anglais est souvent plus COURT que le français — donc sans danger —,
    // mais pas toujours : « Suppliers & third parties » (25 caractères) dépasse
    // « Prestataires & Tiers » (20). Et l'espagnol du lot suivant sera plus long
    // partout. Ce contrôle mesure la seule chose qui compte : est-ce que quelque
    // chose sort de la barre ?
    const session = await ouvrirApplication();
    try {
      const { page } = session;
      for (const langue of ['fr', 'en']) {
        await changerLangue(page, langue);
        const mesure = await page.evaluate(() => {
          const barre = document.querySelector('.sidebar');
          const bord = barre.getBoundingClientRect().right;
          const debordent = [];
          barre.querySelectorAll('.main-nav a').forEach((a) => {
            const r = a.getBoundingClientRect();
            // 1 px de tolérance : les arrondis de mise en page ne sont pas un défaut.
            if (r.right > bord + 1) {
              debordent.push(a.innerText.trim() + ' (' + String(Math.round(r.right - bord)) + ' px)');
            }
          });
          return {
            entrees: barre.querySelectorAll('.main-nav a').length,
            debordent,
            defilementHorizontal: barre.scrollWidth - barre.clientWidth,
          };
        });
        assert.ok(
          mesure.entrees >= 25,
          'Seulement ' + String(mesure.entrees) + ' entrée(s) de menu mesurée(s) en « ' +
            langue + ' » : il n’y aurait presque rien à éprouver.',
        );
        assert.deepEqual(
          mesure.debordent, [],
          'En « ' + langue + ' », ces entrées de menu sortent de la barre latérale.',
        );
        assert.ok(
          mesure.defilementHorizontal <= 1,
          'En « ' + langue + ' », la barre latérale défile horizontalement de ' +
            String(mesure.defilementHorizontal) + ' px : un libellé traduit est trop long.',
        );
      }
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});
