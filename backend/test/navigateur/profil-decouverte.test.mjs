/**
 * profil-decouverte.test.mjs — le bandeau que personne ne peut éteindre : L18.2 b.
 *
 * ── La moitié que l'essai serveur ne peut pas voir ──────────────────────────
 *
 * `test/api/profil-installation.test.mjs` prouve que le serveur LIT
 * `CYBER_GRC_PROFIL` et qu'il le DIT dans la charte de session. Cela ne prouve
 * rien de ce qui compte pour l'utilisateur : que la mention **arrive à l'écran**,
 * qu'elle **y reste**, et qu'elle **suive le papier**. Le constat **Q-194** est
 * exactement de cette famille — un défaut qui vit *entre* deux surfaces dont
 * aucune n'a tort seule, parce qu'aucun essai ne faisait passer la sortie de
 * l'une dans l'entrée de l'autre. Ici, la sortie de `/api/session` entre dans le
 * DOM d'un Chromium réel, et c'est le DOM qui est mesuré.
 *
 * ── LES CINQ PROPRIÉTÉS, ET LE CHEMIN QUE CHACUNE FERME ─────────────────────
 *
 *  §1  **Il s'affiche, avec du texte lisible.** Pas une classe, pas un attribut :
 *      le texte rendu. Un bandeau présent dans le DOM mais vide — clé de
 *      dictionnaire manquante, par exemple — passerait un contrôle de présence
 *      et n'apprendrait rien à personne.
 *
 *  §2  **Il ne s'affiche PAS en production.** La moitié négative n'est pas
 *      décorative : sans elle, un bandeau affiché *toujours* passerait au vert.
 *      C'est la leçon **Q-108 / Q-116** — *un essai vert qui n'a rien eu à
 *      mesurer rend le même verdict qu'un essai vert qui a tout mesuré*. Les
 *      deux moitiés tournent sur deux serveurs qui ne diffèrent QUE par la
 *      variable éprouvée.
 *
 *  §3  **Aucun bouton ne le ferme.** Les deux autres bandeaux du produit en ont
 *      un, à juste titre : ils signalent un incident qui passe. Celui-ci décrit
 *      ce que la machine EST. « Un profil dégradé qu'on ne voit pas devient une
 *      production par oubli » (`PLAN_PRODUIT` L18.2) — et un bouton « masquer »
 *      est le geste exact par lequel on l'oublie. L'essai compte les boutons.
 *
 *  §4  **Il survit à la navigation et au changement de langue.** Un bandeau posé
 *      une seule fois est un bandeau qu'un rendu finit par emporter. On visite
 *      donc plusieurs écrans, puis on bascule en anglais — et le texte doit
 *      avoir changé de langue **sans disparaître**.
 *
 *  §5  **Il s'IMPRIME.** Tous les autres bandeaux portent `no-print`, et celui-ci
 *      ne doit pas. Une fiche de risque ou un registre RGPD tiré d'une
 *      installation de découverte quitte l'écran et circule ; s'il ne porte pas
 *      la mention, il devient une pièce d'audit qui se présente comme les
 *      autres. Mesuré en **émulant le média d'impression** dans Chromium, sur la
 *      visibilité réelle — pas en cherchant l'absence d'une classe dans les
 *      sources, ce qui ne dirait rien de ce que la feuille de style décide.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** Même raison qu'ailleurs dans cette famille : plusieurs Chromium sur peu de cœurs. */
const DELAI = 60_000;

let base;
let navigateur;

/** Deux montages complets, qui ne diffèrent QUE par `CYBER_GRC_PROFIL`. */
let srvDecouverte;
let appDecouverte;
let srvProduction;
let appProduction;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  srvDecouverte = await monterServeurReel(base, {
    authentification: 'provisoire',
    env: { CYBER_GRC_PROFIL: 'decouverte' },
  });
  appDecouverte = await servirApplication(srvDecouverte);

  // ⚠️ Aucune variable n'est posée ici : c'est **l'absence** de réglage qui doit
  // valoir « production », puisque c'est l'état de toutes les installations
  // antérieures au lot L18. Poser explicitement `production` mesurerait un
  // chemin que personne n'emprunte.
  srvProduction = await monterServeurReel(base, { authentification: 'provisoire' });
  appProduction = await servirApplication(srvProduction);

  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await appDecouverte?.fermer();
  await appProduction?.fermer();
  await srvDecouverte?.fermer();
  await srvProduction?.fermer();
  await base?.fermer();
});

async function ouvrirApplication(application) {
  const session = await ouvrirPage(navigateur);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/** Va sur une route par l'ADRESSE — le geste réel ; voir `i18n.test.mjs`. */
async function aller(page, route) {
  await page.evaluate((r) => {
    const cible = '#' + r;
    const app = document.getElementById('app');
    if (app !== null) app.innerHTML = '';
    if (window.location.hash === cible) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else window.location.hash = cible;
  }, route);
  await page.waitForFunction(
    () => (document.getElementById('app')?.innerHTML.trim().length ?? 0) > 0,
    null,
    { timeout: DELAI },
  );
}

/** Ce que le bandeau montre RÉELLEMENT : son texte, ses boutons, sa visibilité. */
function bandeau(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.decouverte-banner');
    if (el === null) return { present: false };
    const style = window.getComputedStyle(el);
    return {
      present: true,
      texte: el.innerText.trim(),
      boutons: el.querySelectorAll('button, a[role="button"], [data-action]').length,
      // Visible au sens du rendu : ni `display:none`, ni `visibility:hidden`,
      // ni hauteur nulle. C'est ce qu'un lecteur voit, pas ce que le balisage dit.
      visible:
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        el.getBoundingClientRect().height > 0,
    };
  });
}

/* =====================================================================
 *  §1 — Une installation de découverte le dit à l'écran
 * ===================================================================== */

describe('§1 — le bandeau apparaît, et il se lit', () => {
  test("le premier écran porte déjà la mention", async () => {
    const session = await ouvrirApplication(appDecouverte);
    try {
      const vu = await bandeau(session.page);
      assert.equal(vu.present, true, 'aucun bandeau sur une installation de découverte');
      assert.equal(vu.visible, true);
      // Du texte, et du texte qui dit quelque chose : pas une clé de
      // dictionnaire non résolue, pas un bandeau vide.
      assert.match(vu.texte, /découverte/i);
      assert.equal(/bandeau\.decouverte/.test(vu.texte), false, 'clé de dictionnaire non résolue');
      assert.ok(vu.texte.length > 80, `texte trop court pour avertir : « ${vu.texte} »`);
      // Ce qu'un utilisateur doit comprendre : ne pas saisir de données réelles.
      assert.match(vu.texte, /données réelles/i);
    } finally {
      await session.page.close().catch(() => {});
    }
  });

  test('le serveur en est la SEULE source', async () => {
    const session = await ouvrirApplication(appDecouverte);
    try {
      // La valeur affichée vient de `/api/session`, et `Session` n'a aucun
      // mutateur : rien dans le navigateur ne peut la poser ni l'éteindre.
      const profil = await session.page.evaluate(() => Session.courante().profil);
      assert.equal(profil, 'decouverte');
      assert.equal(await session.page.evaluate(() => Session.estDecouverte()), true);
    } finally {
      await session.page.close().catch(() => {});
    }
  });
});

/* =====================================================================
 *  §2 — Une installation ordinaire ne le porte pas
 * ===================================================================== */

describe('§2 — la moitié négative, sans laquelle le §1 ne prouve rien', () => {
  test("aucun bandeau quand le profil n'est pas « découverte »", async () => {
    const session = await ouvrirApplication(appProduction);
    try {
      const vu = await bandeau(session.page);
      assert.equal(vu.present, false, 'un bandeau de découverte sur une installation ordinaire');
      assert.equal(await session.page.evaluate(() => Session.estDecouverte()), false);
      // Et l'hôte lui-même ne traîne pas, vide, dans la page.
      assert.equal(
        await session.page.evaluate(() => document.getElementById('decouverte-banner-host') !== null),
        false,
      );
    } finally {
      await session.page.close().catch(() => {});
    }
  });
});

/* =====================================================================
 *  §3 — Personne ne peut le fermer
 * ===================================================================== */

describe('§3 — aucun bouton de masquage', () => {
  test('le bandeau ne porte aucun geste de fermeture', async () => {
    const session = await ouvrirApplication(appDecouverte);
    try {
      const vu = await bandeau(session.page);
      assert.equal(
        vu.boutons,
        0,
        'un bouton dans ce bandeau est le geste exact par lequel on oublie le profil',
      );
    } finally {
      await session.page.close().catch(() => {});
    }
  });
});

/* =====================================================================
 *  §4 — Il survit à la navigation et à la langue
 * ===================================================================== */

describe('§4 — il ne se perd pas en route', () => {
  test('cinq écrans, cinq fois le bandeau', async () => {
    const session = await ouvrirApplication(appDecouverte);
    try {
      for (const route of ['/risques', '/actions', '/documents', '/rgpd', '/dashboard']) {
        await aller(session.page, route);
        const vu = await bandeau(session.page);
        assert.equal(vu.present, true, `bandeau absent sur ${route}`);
        assert.equal(vu.visible, true, `bandeau invisible sur ${route}`);
      }
      // Un seul, jamais empilé : `afficherBandeauDecouverte` réécrit son hôte
      // au lieu d'en ajouter un.
      assert.equal(
        await session.page.evaluate(() => document.querySelectorAll('.decouverte-banner').length),
        1,
      );
    } finally {
      await session.page.close().catch(() => {});
    }
  });

  test("passer en anglais change le texte sans faire disparaître le bandeau", async () => {
    const session = await ouvrirApplication(appDecouverte);
    try {
      const avant = await bandeau(session.page);
      await session.page.waitForSelector('#langue-selector', { timeout: DELAI });
      await session.page.selectOption('#langue-selector', 'en');
      await session.page.waitForFunction(
        () => window.I18n && window.I18n.langue() === 'en',
        null,
        { timeout: DELAI },
      );
      await session.page.waitForFunction(
        () => (document.getElementById('app')?.innerHTML.trim().length ?? 0) > 0,
        null,
        { timeout: DELAI },
      );
      const apres = await bandeau(session.page);
      assert.equal(apres.present, true, 'le bandeau a disparu au changement de langue');
      assert.notEqual(apres.texte, avant.texte, "le bandeau n'a pas été retraduit");
      assert.match(apres.texte, /real data/i);
    } finally {
      await session.page.close().catch(() => {});
    }
  });
});

/* =====================================================================
 *  §5 — Il suit le papier
 * ===================================================================== */

describe("§5 — il s'imprime, contrairement à tous les autres bandeaux", () => {
  test("le média d'impression le laisse visible", async () => {
    const session = await ouvrirApplication(appDecouverte);
    try {
      // Une fiche imprimée est une pièce qui circule hors de l'écran. Si elle
      // ne porte pas la mention, elle se présente comme une pièce d'audit
      // ordinaire.
      await aller(session.page, '/risques');
      await session.page.emulateMedia({ media: 'print' });
      const vu = await bandeau(session.page);
      assert.equal(vu.present, true);
      assert.equal(vu.visible, true, "le bandeau disparaît à l'impression");

      // Le témoin : le fil d'Ariane, lui, porte `no-print` et DOIT disparaître.
      // Sans ce témoin, un Chromium qui n'appliquerait pas `@media print` du
      // tout rendrait ce test vert sans avoir rien mesuré (Q-108).
      const filVisible = await session.page.evaluate(() => {
        const el = document.getElementById('breadcrumb');
        return el !== null && window.getComputedStyle(el).display !== 'none';
      });
      assert.equal(filVisible, false, "l'émulation du média d'impression n'a pas pris effet");
    } finally {
      await session.page.emulateMedia({ media: 'screen' }).catch(() => {});
      await session.page.close().catch(() => {});
    }
  });
});
