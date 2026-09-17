/**
 * main-courante.test.mjs — **la main courante, jusqu'à l'écran** (action 20.5)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  La moitié que le banc serveur ne peut pas voir
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'encart est sur la fiche de l'INCIDENT, et il dit l'ajout seul |
 * | 2 | On ajoute DEPUIS L'ÉCRAN, et l'heure vient du SERVEUR |
 * | 3 | **Aucun bouton de modification ni de suppression** — et ce n'est pas un oubli |
 * | 4 | Le verdict de chaîne est affiché MÊME QUAND TOUT VA BIEN, avec sa nuance |
 * | 5 | Un texte HOSTILE ressort échappé, et l'essai le fait DÉCIDER |
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

const DELAI = 60_000;

/** Un texte qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const TEXTE_HOSTILE = 'Prévenu <img src=x onerror="window.__xss=1"> le RSSI';

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

async function attendreEncart(page) {
  await page.waitForFunction(
    () => {
      const n = document.getElementById('mainCouranteEncartCorps');
      return n !== null && !/Lecture de la main courante/u.test(n.textContent ?? '');
    },
    null,
    { timeout: DELAI },
  );
}

describe('la main courante de crise, jusqu’à l’écran', () => {
  test('§1 — l’encart est sur la fiche de l’INCIDENT, et il dit l’ajout seul', async () => {
    const { page } = session;
    await aller(page, '/incidents/INC-A');
    await attendreEncart(page);

    const vu = await page.evaluate(() => ({
      present: document.getElementById('mainCouranteEncart') !== null,
      texte: document.getElementById('mainCouranteEncartCorps')?.textContent ?? '',
      formulaire: document.getElementById('mcForm') !== null,
      entrees: document.querySelectorAll('#mainCouranteEncart .mc-entree').length,
    }));
    assert.equal(
      vu.present,
      true,
      'La fiche d’un incident ne porte AUCUNE main courante : l’action 20.5 est inatteignable.',
    );
    assert.ok(vu.entrees >= 1, 'Le semis pose une entrée : elle doit s’afficher.');
    assert.equal(vu.formulaire, true);
    // ⚠️ L'écran doit DIRE que l'entrée est définitive. Un utilisateur qui
    // l'apprend en cherchant le bouton « modifier » a déjà écrit quelque chose
    // qu'il regrette.
    assert.match(
      vu.texte,
      /ne se modifie plus/u,
      'L’écran ne prévient pas qu’une entrée est définitive : l’utilisateur l’apprendra en ' +
        'cherchant le bouton « modifier », c’est-à-dire trop tard.',
    );
  });

  test('§2 — on ajoute DEPUIS L’ÉCRAN, et l’heure vient du SERVEUR', async () => {
    const { page } = session;
    const avant = await page.evaluate(
      () => document.querySelectorAll('#mainCouranteEncart .mc-entree').length,
    );

    await page.evaluate((texte) => {
      document.getElementById('mcTexte').value = texte;
      document.getElementById('mcCategorie').value = 'decision';
      document.getElementById('mcForm').dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true }),
      );
    }, TEXTE_HOSTILE);
    await page.waitForFunction(
      (n) => document.querySelectorAll('#mainCouranteEncart .mc-entree').length > n,
      avant,
      { timeout: DELAI },
    );
    await attendreQuiescence(page, { delai: DELAI });

    const derniere = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#mainCouranteEncart .mc-entree')];
      const n = items[items.length - 1];
      return {
        numero: n.dataset.numero,
        heure: n.querySelector('.mc-heure')?.textContent ?? '',
        categorie: n.querySelector('.mc-categorie')?.textContent ?? '',
        texte: n.querySelector('.mc-texte')?.textContent ?? '',
      };
    });
    // ⚠️ L'heure vient du serveur : l'écran n'offre AUCUN champ pour la saisir,
    // et elle est néanmoins là. C'est ce qui empêche d'antidater une décision.
    assert.match(
      derniere.heure,
      /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/u,
      `L’entrée n’a pas d’heure lisible : « ${derniere.heure} ».`,
    );
    assert.equal(derniere.categorie, 'Décision');
    assert.ok(Number(derniere.numero) > Number(avant));

    // ── LE RECHARGEMENT COMPLET ───────────────────────────────────────────
    const rechargee = await ouvrirApplication();
    try {
      await aller(rechargee.page, '/incidents/INC-A');
      await attendreEncart(rechargee.page);
      const compte = await rechargee.page.evaluate(
        () => document.querySelectorAll('#mainCouranteEncart .mc-entree').length,
      );
      assert.ok(compte > avant, 'L’entrée ajoutée n’a pas survécu au rechargement.');
    } finally {
      await rechargee.page.context().close().catch(() => {});
    }
  });

  test('§3 — AUCUN bouton de modification ni de suppression', async () => {
    const { page } = session;
    // ⚠️ Ce n'est PAS la garantie — elle vit dans la base, par les quatre couches
    // du §12. C'est la cohérence de l'écran avec elle : un bouton qui mènerait à
    // un refus GRC01 apprendrait à l'utilisateur que le produit se contredit.
    const gestes = await page.evaluate(() => {
      const encart = document.getElementById('mainCouranteEncart');
      return [...encart.querySelectorAll('button, a')].map((n) => n.textContent.trim());
    });
    const interdits = gestes.filter((t) =>
      /modifier|supprimer|corriger|effacer|retirer/iu.test(t),
    );
    assert.deepEqual(
      interdits,
      [],
      'L’écran offre un geste que la base refuse : l’utilisateur cliquera, recevra un refus ' +
        `technique, et conclura que le produit se contredit.\n  Trouvés : ${gestes.join(' · ')}`,
    );
  });

  test('§4 — le verdict de chaîne est affiché MÊME quand tout va bien', async () => {
    const { page } = session;
    const verdict = await page.evaluate(() => ({
      present: document.querySelector('#mainCouranteEncart .mc-verdict') !== null,
      texte: document.querySelector('#mainCouranteEncart .mc-verdict')?.textContent ?? '',
    }));
    // ⚠️ Un indicateur qui n'apparaît qu'en cas de problème n'apprend à personne
    // qu'il existe — et le jour où il apparaît, on ne sait pas s'il est fiable.
    assert.equal(
      verdict.present,
      true,
      'Le verdict de chaîne ne s’affiche que lorsqu’il est mauvais : personne n’apprendra ' +
        'qu’il existe, et le jour où il parle, personne ne saura s’il est fiable.',
    );
    assert.match(verdict.texte, /Chaîne intacte/u);
    // ⚠️ Et il dit ce qu'il NE prouve pas. Promettre plus serait la fausse
    // assurance que le CONVENTIONS.md §17.5 interdit.
    assert.match(
      verdict.texte,
      /ne dit pas que personne n’a rien touché/u,
      'Le verdict promet plus qu’il ne tient : le chaînage n’empêche pas l’administrateur de ' +
        'la base d’agir, il rend son passage détectable. L’écran doit porter la nuance.',
    );
  });

  test('§5 — un texte HOSTILE ressort ÉCHAPPÉ', async () => {
    const { page } = session;
    const mesure = await page.evaluate(() => ({
      xss: window.__xss === 1,
      images: document.querySelectorAll('#mainCouranteEncart img').length,
      texte: document.getElementById('mainCouranteEncartCorps')?.textContent ?? '',
    }));
    assert.equal(mesure.xss, false, 'Le texte d’une entrée a été EXÉCUTÉ.');
    assert.equal(mesure.images, 0, 'Le texte d’une entrée a fabriqué une balise.');
    assert.match(
      mesure.texte,
      /<img src=x/u,
      'Le texte doit s’afficher TEL QUEL, chevrons compris : sans cette moitié, l’essai serait ' +
        'vert sur un écran qui l’aurait simplement effacé.',
    );
  });
});
