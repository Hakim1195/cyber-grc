/**
 * onglets.test.mjs — **un même sujet, plusieurs vues, et une seule porte**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le menu portait **32 entrées**, dont quatre qui n'étaient pas des objets mais
 * des **points de vue** sur un objet déjà présent ailleurs : la matrice F×G est
 * une vue des risques, le socle en est le catalogue, « applicables ici » et la
 * couverture croisée sont deux vues des référentiels. Une cinquième — la
 * couverture — n'avait **aucune entrée de menu du tout** : on n'y arrivait que
 * par des liens en bas d'autres écrans.
 *
 * Ces cinq écrans partagent désormais une **barre d'onglets**, et les quatre
 * entrées redondantes ont quitté le menu. Ce qui se gagne en cohérence se paie
 * en fragilité : `UI.ongletsDe()` porte une **liste écrite à la main**, et une
 * route qui y serait mal orthographiée rendrait un onglet qui ne mène nulle
 * part. C'est ce que cette famille garde.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Chaque route nommée dans un groupe est une route RÉELLEMENT enregistrée |
 * | 2 | Sur chaque vue, la barre est là et l'onglet ACTIF est celui de la vue |
 * | 3 | Les quatre entrées redondantes ont quitté le menu, et restent atteignables |
 * | 4 | Un onglet est un LIEN : il navigue vraiment, et il porte `aria-current` |
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

const DELAI = 60_000;

let base;
let navigateur;
let serveur;
let application;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
  session = await ouvrirApplication();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

async function ouvrirApplication() {
  const s = await ouvrirPage(navigateur);
  await s.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(s.page, { delai: DELAI }), 'chargee');
  await attendreQuiescence(s.page, { delai: DELAI });
  return s;
}

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
  await attendreQuiescence(page, { delai: DELAI });
}

describe('les onglets — un sujet, plusieurs vues', () => {
  test('§1 — chaque route nommée dans un groupe EXISTE dans le routeur', async () => {
    const { page } = session;
    const vu = await page.evaluate(() => ({
      groupes: UI.contratOnglets.map((g) => ({
        sujet: g.sujet,
        routes: g.vues.map((v) => v.route),
        libelles: g.vues.map((v) => v.libelle),
      })),
      routes: Router.routesEnregistrees(),
    }));

    assert.ok(vu.groupes.length >= 2, 'Le contrat des onglets est vide : rien n’est gardé.');
    const declarees = new Set(vu.routes.map((r) => String(r).split('/:')[0]));
    for (const groupe of vu.groupes) {
      for (const route of groupe.routes) {
        assert.ok(
          declarees.has(route),
          `Le groupe « ${groupe.sujet} » nomme « ${route} », que le routeur ne connaît pas : ` +
            'l’onglet mènerait à un écran vide. C’est la fragilité que cette liste écrite à ' +
            'la main introduit, et la raison de ce contrôle.',
        );
      }
      // Deux vues d'un même sujet ne portent pas le même mot : les confondre
      // ferait lire deux fois la même étiquette à deux centimètres d'écart.
      assert.equal(
        new Set(groupe.libelles).size,
        groupe.libelles.length,
        `Deux onglets du groupe « ${groupe.sujet} » portent le même libellé.`,
      );
    }
  });

  test('§2 — sur chaque vue, la barre est là et l’onglet ACTIF est le bon', async () => {
    const { page } = session;
    const groupes = await page.evaluate(() =>
      UI.contratOnglets.map((g) => g.vues.map((v) => v.route)),
    );

    for (const routes of groupes) {
      for (const route of routes) {
        await aller(page, route);
        const barre = await page.evaluate(() => {
          const nav = document.querySelector('.page-onglets');
          if (nav === null) return null;
          return {
            onglets: Array.from(nav.querySelectorAll('a')).map((a) => ({
              route: a.getAttribute('data-route'),
              actif: a.classList.contains('page-onglet--actif'),
              // ⚠️ `aria-current` et non la seule couleur : *ne jamais porter une
              // information par la couleur seule* (règle « Color Only », sévérité
              // haute). Un onglet actif qu'on ne distingue qu'au teint n'est pas
              // distingué pour tout le monde.
              courant: a.getAttribute('aria-current'),
              // Un LIEN, pas un bouton : il doit porter une adresse.
              href: a.getAttribute('href'),
            })),
          };
        });
        assert.notEqual(barre, null, `L’écran ${route} ne rend aucune barre d’onglets.`);
        assert.deepEqual(
          barre.onglets.map((o) => o.route),
          routes,
          `La barre de ${route} ne nomme pas les mêmes vues que le contrat.`,
        );
        const actifs = barre.onglets.filter((o) => o.actif);
        assert.equal(actifs.length, 1, `${route} : il faut UN onglet actif, ni zéro ni deux.`);
        assert.equal(actifs[0].route, route, `${route} : l’onglet actif désigne un autre écran.`);
        assert.equal(actifs[0].courant, 'page', `${route} : l’onglet actif n’est pas annoncé.`);
        for (const onglet of barre.onglets) {
          assert.equal(onglet.href, '#' + onglet.route, 'Un onglet doit porter son adresse.');
        }
      }
    }
  });

  test('§3 — les vues redondantes ont QUITTÉ le menu, et restent atteignables', async () => {
    const { page } = session;
    const etat = await page.evaluate(() => {
      const entrees = Array.from(document.querySelectorAll('.main-nav a[data-route]'))
        .map((a) => a.getAttribute('data-route'));
      // Les routes qui sont des VUES : la première de chaque groupe garde sa
      // porte de menu, les suivantes ne sont plus que des onglets.
      const vues = UI.contratOnglets.flatMap((g) => g.vues.slice(1).map((v) => v.route));
      const portes = UI.contratOnglets.map((g) => g.vues[0].route);
      return { entrees, vues, portes };
    });

    for (const vue of etat.vues) {
      assert.equal(
        etat.entrees.includes(vue),
        false,
        `« ${vue} » est à la fois un onglet et une entrée de menu : deux chemins pour un ` +
          'seul écran, à deux centimètres l’un de l’autre.',
      );
    }
    for (const porte of etat.portes) {
      assert.ok(
        etat.entrees.includes(porte),
        `Le sujet « ${porte} » n’a plus AUCUNE porte de menu : ses vues seraient ` +
          'inatteignables autrement que par une adresse tapée à la main.',
      );
    }
    // ⚠️ CONTRÔLE DE MORSURE : sans lui, « aucune des vues n’est au menu » serait
    // vrai d’un menu vide. Le menu doit porter la matière qu’il prétend ranger.
    assert.ok(etat.entrees.length >= 20, `Le menu ne porte que ${etat.entrees.length} entrées.`);
  });

  test('§4 — cliquer un onglet NAVIGUE vraiment, et l’écran change', async () => {
    const { page } = session;
    await aller(page, '/risques');
    const avant = await page.evaluate(() => document.querySelector('.page-entete h1')?.textContent ?? '');

    await page.click('.page-onglets a[data-route="/matrice"]');
    await attendreQuiescence(page, { delai: DELAI });

    const apres = await page.evaluate(() => ({
      titre: document.querySelector('.page-entete h1')?.textContent ?? '',
      adresse: window.location.hash,
      actif: document.querySelector('.page-onglet--actif')?.getAttribute('data-route') ?? null,
    }));
    assert.equal(apres.adresse, '#/matrice', 'L’adresse doit suivre : un onglet se partage.');
    assert.notEqual(apres.titre, avant, 'L’écran n’a pas changé.');
    assert.equal(apres.actif, '/matrice');
  });
});
