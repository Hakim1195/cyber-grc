/**
 * campagnes.test.mjs — **LES CAMPAGNES DESCENDANTES, JUSQU'À L'ÉCRAN** (lot L24)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * `docs/REPRISE.md` §4 : *« une capacité qu'aucun écran n'appelle est une capacité
 * absente. Trois lots de suite ont été livrés, éprouvés et verts sans que personne
 * puisse s'en servir. »* Les routes du greffon `src/campagnes/` sont éprouvées par
 * `test/campagnes/descendantes.test.mjs` ; ce fichier-ci mesure l'autre moitié.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'onglet « Campagnes du Groupe » existe, et il mène à l'écran |
 * | 2 | L'écran DIVISE : il rend un taux là où le serveur ne rend qu'un compte |
 * | 3 | ⚠️ Une campagne OUVERTE arrive dans l'échéancier ; un BROUILLON n'y arrive pas |
 * | 4 | Un intitulé hostile est affiché, jamais exécuté |
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

/** Un intitulé qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const INTITULE_HOSTILE = 'Campagne <img src=x onerror="window.__xss=1">';

let base;
let navigateur;
let serveur;
let application;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // ⚠️ Les campagnes s'écrivent sous administration Groupe (politique de la `044`).
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l24', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      await c.query(
        `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance)
         values ('CAMP-ECRAN', 'anssi-hygiene', $1, current_date - 20, current_date + 9)`,
        [INTITULE_HOSTILE],
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id, repondant, accuse_le)
         values ('CF-ECRAN', $1, 'CAMP-ECRAN', 'RSSI Toulouse', current_date - 18)`,
        [FILIALE_A],
      );
      // Un BROUILLON avec une échéance : il ne doit PAS entrer dans l'échéancier.
      await c.query(
        `insert into campagnes (id, ref_id, intitule, echeance)
         values ('CAMP-ECRAN-BROUILLON', 'anssi-hygiene', 'Brouillon invisible',
                 current_date + 4)`,
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id)
         values ('CF-ECRAN-BROUILLON', $1, 'CAMP-ECRAN-BROUILLON')`,
        [FILIALE_A],
      );
      // Deux exigences renseignées sur le référentiel demandé : de quoi voir un TAUX.
      await c.query(
        `insert into evaluations (id, filiale_id, ref_id, code, statut)
         values ('EV-H1', $1, 'anssi-hygiene', '1', 'conforme'),
                ('EV-H2', $1, 'anssi-hygiene', '2', 'non conforme')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

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

/** Va sur une route par l'ADRESSE — le geste réel. */
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

describe('les campagnes descendantes, jusqu’à l’écran', () => {
  test('§1 — l’onglet mène à l’écran, et l’écran affiche la campagne', async () => {
    const { page } = session;
    await aller(page, '/referentiels');

    // L'onglet existe, et il porte la route : c'est une VUE de la conformité, pas une
    // entrée de menu de plus (`docs/PLAN_INTERFACE.md`).
    const onglets = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a,button'))
        .map((e) => e.getAttribute('href') ?? '')
        .filter((h) => h.includes('/campagnes')),
    );
    assert.ok(onglets.length > 0, 'un onglet doit mener aux campagnes');

    await aller(page, '/campagnes');
    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');
    assert.match(texte, /Campagnes du Groupe/u);
    assert.match(texte, /anssi-hygiene/u);
    // L'état vient du SERVEUR : la campagne est ouverte, son échéance est à venir.
    assert.match(texte, /En cours/u);
  });

  test('§2 — l’écran DIVISE : un taux là où le serveur ne rend qu’un compte', async () => {
    // ⚠️ C'est la moitié de l'action 24.2 qui n'appartient PAS au serveur : il rend
    // « 2 » — le nombre d'exigences renseignées — et ignore combien le référentiel en
    // porte, parce que le catalogue vit dans le frontend. L'écran, qui l'a, divise.
    const { page } = session;
    await aller(page, '/campagnes');
    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');

    // Hygiène ANSSI porte 42 mesures : 2 / 42 = 5 %.
    assert.match(texte, /2 \/ 42/u);
    assert.match(texte, /5 %/u);
  });

  test('§3 — ⚠️ une campagne OUVERTE arrive à l’échéancier, un BROUILLON n’y arrive pas', async () => {
    const { page } = session;
    await aller(page, '/echeances');

    const etat = await page.evaluate(() => {
      const tout = window.Echeances.collect();
      const campagnes = tout.filter((e) => e.type === 'campagne');
      return {
        titres: campagnes.map((e) => e.titre),
        jours: campagnes.map((e) => e.jours),
        boutons: Array.from(document.querySelectorAll('.ech-fbtn')).map((b) => b.dataset.type),
      };
    });

    // La campagne ouverte est là, à +9 jours. ⚠️ Et elle n'est pas seule : le semis
    // commun porte « Hygiène ANSSI — campagne annuelle du Groupe », ouverte et jamais
    // terminée, donc légitimement due elle aussi. On mesure donc PAR TITRE et non par
    // compte — un compte figé ici se périmerait au premier semis qui bouge, et l'essai
    // rougirait pour une raison étrangère à ce qu'il mesure.
    const rangs = new Map(etat.titres.map((t, i) => [t, etat.jours[i]]));
    assert.ok(rangs.has(INTITULE_HOSTILE), JSON.stringify(etat.titres));
    assert.equal(rangs.get(INTITULE_HOSTILE), 9);
    // …et le BROUILLON n'y est pas, bien qu'il porte une échéance plus proche (+4 j).
    // Un brouillon du Groupe ne demande rien à personne : le compter parmi les retards
    // fabriquerait une alerte que personne ne s'est infligée.
    assert.equal(etat.titres.some((t) => /Brouillon/u.test(t)), false);
    assert.ok(etat.boutons.includes('campagne'), etat.boutons.join(' · '));
  });

  test('§4 — l’intitulé hostile est affiché, jamais exécuté', async () => {
    const { page } = session;
    await aller(page, '/campagnes');

    const xss = await page.evaluate(() => window.__xss === 1);
    assert.equal(xss, false, 'l’intitulé hostile a été exécuté');

    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');
    assert.match(texte, /onerror/u, 'le texte doit être AFFICHÉ, donc échappé, pas retiré');
    const images = await page.evaluate(
      () => document.querySelectorAll('#app img[src="x"]').length,
    );
    assert.equal(images, 0, 'aucune balise ne doit avoir été interprétée');
  });
});
