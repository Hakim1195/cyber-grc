/**
 * menu-sections.test.mjs — LE MENU SE REPLIE (lot L17, action A2)
 *
 * ── Ce qui est éprouvé, et pourquoi c'est ce découpage-là ────────────────────
 *
 * La barre latérale portait **32 entrées à plat**, dont dix-sept sous un seul
 * intertitre : c'était une liste, pas une navigation. Elle est désormais
 * découpée en **six sections repliables**.
 *
 * Trois propriétés, et chacune vient d'une manière précise de se tromper :
 *
 *  §1 **L'appartenance d'une entrée à sa section est DÉDUITE du balisage.** Une
 *     liste écrite dans le code aurait un jour oublié une entrée — et l'oubli
 *     aurait FAIT DISPARAÎTRE cette entrée au premier repli, en silence. C'est
 *     le cas (a) de la règle des listes (`CLAUDE.md` §3). On replie, et on
 *     compte ce qui reste visible.
 *
 *  §2 **La section de l'écran courant s'ouvre toujours.** Sans cette règle, on
 *     peut naviguer vers un écran dont l'entrée est cachée : le menu dirait que
 *     l'utilisateur n'est nulle part, et c'est la classe des constats
 *     Q-201 / Q-207 — *un écran qui montre un vide sans le dire*.
 *
 *  §3 **Le repli survit au changement d'écran.** C'est tout l'objet : un menu
 *     qui se redéplie à chaque navigation n'a rien replié.
 *
 * ⚠️ **Chaque contrôle doit pouvoir ROUGIR** (constat Q-210). Les trois ont été
 * cassés à la main pendant l'écriture :
 *   · §1 — en faisant renvoyer `[]` à `entreesDe()` : plus rien ne se cache,
 *     le compte des visibles ne bouge pas, l'essai rougit ;
 *   · §2 — en retirant l'appel à `ouvrirSectionActive()` dans `app.js` :
 *     l'entrée active reste cachée, l'essai rougit ;
 *   · §3 — en n'écrivant pas dans `localStorage` : le menu se redéplie, l'essai
 *     rougit.
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
let serveur;
let application;

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

/** Compte les entrées de menu RÉELLEMENT visibles, et les sections. */
async function inventaire(page) {
  return await page.evaluate(() => {
    const entrees = Array.from(document.querySelectorAll('.main-nav li'));
    const visible = (li) => !li.hidden && li.offsetParent !== null;
    return {
      sections: entrees.filter((li) => li.classList.contains('nav-section')).length,
      entreesVisibles: entrees.filter((li) => !li.classList.contains('nav-section') && visible(li))
        .length,
      entreesTotales: entrees.filter((li) => !li.classList.contains('nav-section')).length,
    };
  });
}

describe('Le menu se replie — lot L17, action A2', () => {
  test('§1 — replier une section CACHE ses entrées, et elles sont déduites du balisage', async (t) => {
    t.diagnostic(`délai ${String(DELAI)} ms`);
    const session = await ouvrirPage(navigateur);
    try {
      const { page } = session;
      await page.goto(application.url, { waitUntil: 'domcontentloaded', timeout: DELAI });
      await attendreApplication(page, { timeout: DELAI });
      await attendreQuiescence(page);

      const depart = await inventaire(page);
      assert.equal(depart.sections, 6, 'Six sections sont attendues dans la barre latérale.');
      assert.equal(
        depart.entreesVisibles,
        depart.entreesTotales,
        'À la première ouverture, rien n’est replié : tout doit être visible.',
      );

      // On replie la PREMIÈRE section, quelle qu'elle soit — on ne nomme aucune
      // entrée : c'est le balisage qui dit lesquelles lui appartiennent.
      const attendues = await page.evaluate(() => {
        const entete = document.querySelector('.main-nav .nav-section');
        let n = 0;
        let noeud = entete.nextElementSibling;
        while (noeud && !noeud.classList.contains('nav-section')) {
          n += 1;
          noeud = noeud.nextElementSibling;
        }
        entete.querySelector('.nav-section-btn').click();
        return n;
      });
      await attendreQuiescence(page);

      assert.equal(
        attendues > 0,
        true,
        'La première section doit porter au moins une entrée, sinon rien n’est mesuré.',
      );

      const apres = await inventaire(page);
      assert.equal(
        apres.entreesVisibles,
        depart.entreesVisibles - attendues,
        'Replier une section doit cacher EXACTEMENT ses entrées — ni moins (une liste ' +
          'incomplète), ni plus (un repli qui déborde sur la section suivante).',
      );

      // L'état est annoncé aux technologies d'assistance, pas seulement au regard.
      const annonce = await page.evaluate(() =>
        document.querySelector('.main-nav .nav-section-btn').getAttribute('aria-expanded'),
      );
      assert.equal(annonce, 'false', 'Le bouton doit annoncer son état replié.');
    } finally {
      await session.fermer();
    }
  });

  test('§2 et §3 — le repli SURVIT à la navigation, et la section active s’ouvre quand même', async (t) => {
    t.diagnostic(`délai ${String(DELAI)} ms`);
    const session = await ouvrirPage(navigateur);
    try {
      const { page } = session;
      await page.goto(application.url, { waitUntil: 'domcontentloaded', timeout: DELAI });
      await attendreApplication(page, { timeout: DELAI });
      await attendreQuiescence(page);

      // On replie TOUTES les sections, puis on navigue vers un écran.
      await page.evaluate(() => {
        document
          .querySelectorAll('.main-nav .nav-section-btn')
          .forEach((b) => { if (b.getAttribute('aria-expanded') === 'true') b.click(); });
      });
      await attendreQuiescence(page);
      const toutReplie = await inventaire(page);

      await page.evaluate(() => { window.location.hash = '#/risques'; });
      await attendreQuiescence(page);

      const apresNavigation = await inventaire(page);
      // §3 — le repli tient : on ne revient pas à un menu entièrement déplié.
      assert.equal(
        apresNavigation.entreesVisibles < apresNavigation.entreesTotales,
        true,
        'Le menu s’est entièrement redéplié : un repli qui ne survit pas à la navigation ' +
          'n’a rien replié.',
      );

      // §2 — MAIS l'entrée de l'écran courant est visible. C'est la moitié qui
      // compte : sans elle, on navigue vers un écran dont l'entrée est cachée.
      const actifVisible = await page.evaluate(() => {
        const actif = document.querySelector('.main-nav a.active');
        if (!actif) return null;
        const li = actif.closest('li');
        return { route: actif.getAttribute('data-route'), visible: !li.hidden && li.offsetParent !== null };
      });
      assert.notEqual(actifVisible, null, 'Une entrée doit être marquée active.');
      assert.equal(actifVisible.route, '/risques');
      assert.equal(
        actifVisible.visible,
        true,
        'L’entrée de l’écran courant est CACHÉE : le menu dit que l’utilisateur n’est ' +
          'nulle part. C’est la classe des constats Q-201 / Q-207.',
      );

      assert.equal(
        apresNavigation.entreesVisibles > toutReplie.entreesVisibles,
        true,
        'La section de l’écran courant doit s’être rouverte, donc rendre des entrées.',
      );
    } finally {
      await session.fermer();
    }
  });

  test('AUCUN gestionnaire en ligne n’a été introduit — la CSP du vhost les bloque', async () => {
    // L'application a été livrée un temps sans fonctionner dans sa configuration
    // de déploiement, pour cette raison exacte : soixante-quatre gestionnaires
    // en ligne bloqués par la politique de sécurité de contenu. Le contrôle est
    // statique parce que la faute l'est.
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const html = readFileSync(join(racine, 'cyber-gouvernance_V4', 'index.html'), 'utf8');

    const fautifs = html.match(/\son(click|change|input|submit|load)\s*=/gi) ?? [];
    assert.deepEqual(
      fautifs,
      [],
      'Un gestionnaire en ligne a été introduit dans le balisage : la CSP du vhost le ' +
        'bloque, et l’application ne fonctionnerait pas dans sa configuration de déploiement.',
    );
  });
});
