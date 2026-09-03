/**
 * pieges-q64.test.mjs — LE BANC QUI SE MESURE LUI-MÊME (constat Q-64).
 *
 * ⚠️ **Cet essai n'éprouve pas le produit : il éprouve le BANC.** C'est
 * délibéré, et c'est ce que le constat Q-64 réclamait — « un banc qui échoue
 * quatre fois sur cinq apprend à être ignoré, et un banc qu'on ignore est
 * exactement ce que ce dispositif existe pour empêcher ». Un instrument dont
 * personne ne vérifie qu'il mesure ce qu'il croit mesurer est un instrument qui
 * finit par inventer ce qu'il mesure (`test/aide/navigateur.mjs` porte déjà
 * cette leçon, apprise sur un relais qui refusait des suppressions).
 *
 * Ce qu'il fige : **un piège d'essai doit couper l'écriture QU'IL VISE, pas la
 * première qui passe.** Les deux variantes ci-dessous ne diffèrent que par ce
 * point, et la première montre le défaut au lieu de l'affirmer.
 *
 * Le §15 de `bascule.test.mjs` coupe au NIVEAU DU RÉSEAU : il remplace `fetch`
 * et rejette **le premier envoi non-GET**. Or le produit en émet un **sans
 * aucun geste de l'utilisateur** — le tableau de bord réécrit son point
 * d'historique du jour. Mesuré sur ce banc, trois ouvertures d'affilée :
 *
 *     ouverture 1 : ["POST /api/entites/history"]
 *     ouverture 2 : ["PUT  /api/entites/history/HIST-…"]
 *     ouverture 3 : ["PUT  /api/entites/history/HIST-…"]
 *
 * Quand cet envoi arrive après l'armement du piège, c'est LUI qui est coupé.
 * La saisie de l'essai part alors normalement, rien n'est bloqué, et l'attente
 * de l'essai expire au bout de quinze secondes — signature exacte du constat
 * Q-64, « les deux échecs sont fondés sur une expiration de délai ».
 *
 * Ce fichier joue le même geste deux fois, en ne changeant QUE la façon dont le
 * piège choisit sa proie, et assertionne sur le MÉCANISME (quel envoi a été
 * coupé, la saisie est-elle bloquée) — jamais sur un délai.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { attendreApplication, attendreQuiescence, lancerNavigateur, ouvrirPage, servirApplication }
  from '../aide/navigateur.mjs';
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

let base, serveur, application, navigateur;

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

async function ouvrirApplication() {
  const session = await ouvrirPage(navigateur);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/** Piège ANCIEN : rejette le premier envoi non-GET, quel qu'il soit. */
function piegeAncien(page) {
  return page.evaluate(() => {
    window.__consomme = null;
    const vrai = window.fetch.bind(window);
    let restante = true;
    window.fetch = (ressource, options) => {
      const methode = String((options && options.method) || 'GET').toUpperCase();
      if (restante && methode !== 'GET') {
        restante = false;
        window.__consomme = methode + ' ' + String(ressource);
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
      return vrai(ressource, options);
    };
  });
}

/** Piège NEUF : rejette l'envoi dont le CORPS porte la cible. */
function piegeNeuf(page, cible) {
  return page.evaluate((c) => {
    window.__consomme = null;
    const vrai = window.fetch.bind(window);
    let restante = true;
    window.fetch = (ressource, options) => {
      const methode = String((options && options.method) || 'GET').toUpperCase();
      const corps = (options && typeof options.body === 'string') ? options.body : '';
      if (restante && methode !== 'GET' && corps.indexOf(c) !== -1) {
        restante = false;
        window.__consomme = methode + ' ' + String(ressource);
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
      return vrai(ressource, options);
    };
  }, cible);
}

/**
 * L'ÉCRITURE AUTOMATIQUE DU PRODUIT, déclenchée au moment où elle dérange.
 *
 * `recordDailySnapshot(metrics)` est très exactement ce que le tableau de bord
 * appelle à chaque affichage — ce n'est pas une imitation, c'est le chemin du
 * produit. Le point du jour existant, l'envoi est un `PUT`.
 */
function ecritureAutomatiqueDuProduit(page) {
  return page.evaluate(async () => {
    window.DataStore.recordDailySnapshot({ conformite: Math.random() });
    await window.Sync.pousser();
  });
}

function vue(page, nom) {
  return page.evaluate((n) => {
    const texte = (document.getElementById('sync-banner-host') ?? { textContent: '' }).textContent;
    return { consomme: window.__consomme, bandeau: texte, nomme: texte.indexOf(n) !== -1 };
  }, nom);
}

async function jouer(session, poserLePiege, nom) {
  await poserLePiege(session.page);
  await ecritureAutomatiqueDuProduit(session.page);
  await session.page.evaluate((n) => {
    window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: n });
  }, nom);
  // Fenêtre d'observation bornée : on regarde le mécanisme, pas une échéance.
  await new Promise((r) => setTimeout(r, 3000));
  return vue(session.page, nom);
}

test('VARIANTE ANCIENNE — le piège sans cible est mangé par l’écriture automatique', async () => {
  const nom = 'Saisie que le piège ancien laisse passer';
  const session = await ouvrirApplication();
  try {
    const v = await jouer(session, piegeAncien, nom);
    assert.match(
      String(v.consomme), /entites\/history/,
      `Le piège devait être consommé par l’écriture automatique du produit, et il l’a été ` +
        `par « ${v.consomme} ».`,
    );
    assert.equal(
      v.nomme, false,
      'Et la saisie de l’essai n’est donc PAS bloquée : l’attente de l’essai réel guette un ' +
        `état qui ne viendra jamais, et expire au bout de quinze secondes.\n${v.bandeau}`,
    );
  } finally {
    await session.fermer();
  }
});

test('VARIANTE NEUVE — le piège ciblé coupe la bonne écriture, malgré l’automatique', async () => {
  const nom = 'Saisie que le piège ciblé doit couper';
  const session = await ouvrirApplication();
  try {
    const v = await jouer(session, (p) => piegeNeuf(p, nom), nom);
    assert.match(
      String(v.consomme), /entites\/risques/,
      `Le piège ciblé doit couper la saisie de l’essai, et il a coupé « ${v.consomme} ».`,
    );
    assert.equal(
      v.nomme, true,
      `Et le bandeau doit nommer la saisie bloquée : c’est ce que l’essai réel mesure.\n${v.bandeau}`,
    );
  } finally {
    await session.fermer();
  }
});
