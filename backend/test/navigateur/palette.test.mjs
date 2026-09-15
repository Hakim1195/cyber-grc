/**
 * palette.test.mjs — LA RECHERCHE, DANS UN VRAI NAVIGATEUR (lot L17, action A3)
 *
 * ── Pourquoi ce fichier existe alors que le serveur est déjà éprouvé ────────
 *
 * `test/recherche/oracle.test.mjs` tient la substance : cloisonnement par la
 * RLS, borne des droits, jokers neutralisés, plafond, trace. Rien de tout cela
 * ne dit que **l'utilisateur peut s'en servir**.
 *
 * C'est le contrôle S18 de la grille, et il existe parce que cinq constats de la
 * porte S2 — dont les trois bloquants — *ne violaient aucun des seize autres
 * contrôles* : le produit était sûr et il détruisait le travail de son
 * utilisateur. Une recherche parfaitement cloisonnée que personne ne peut ouvrir
 * est le même genre de réussite.
 *
 * Trois propriétés, et rien de plus — **le frontend sera refait** (arbitrage du
 * 15/09/2026), on ne fige donc pas sa mise en forme dans un essai :
 *
 *  §1 `Ctrl+K` ouvre la palette, `Échap` la ferme ;
 *  §2 taper un terme rend un résultat qui vient **du serveur** ;
 *  §3 cliquer le résultat **mène à la fiche**.
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
/** Un libellé qu'on ne risque pas de croiser par hasard. */
const TERME = 'Basilique';

let base;
let navigateur;
let serveur;
let application;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  const applicatif = await base.connexion('app');
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query('insert into risques (id, filiale_id, nom) values ($1,$2,$3)', [
        'RSK-PALETTE',
        FILIALE_A,
        `Risque ${TERME} — incendie du site`,
      ]);
    },
    { annuler: false },
  );

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

describe('La palette de recherche, dans un vrai navigateur', () => {
  test('§1 à §3 — Ctrl+K ouvre, le serveur répond, le résultat mène à la fiche', async (t) => {
    t.diagnostic(`délai ${String(DELAI)} ms`);
    const session = await ouvrirPage(navigateur);
    try {
      const { page } = session;
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));

      await page.goto(application.url, { waitUntil: 'domcontentloaded', timeout: DELAI });
      await attendreApplication(page, { timeout: DELAI });
      await attendreQuiescence(page);

      // ── §1 : le raccourci ouvre ────────────────────────────────────────
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyK');
      await page.keyboard.up('Control');
      await page.waitForSelector('#palette-champ', { state: 'visible', timeout: DELAI });

      // ── §2 : on tape, et le SERVEUR répond ─────────────────────────────
      await page.fill('#palette-champ', TERME);
      await page.waitForSelector('.palette-item[data-href]', { timeout: DELAI });

      const resultats = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.palette-item')).map((e) => ({
          libelle: e.querySelector('.palette-libelle')?.textContent ?? '',
          href: e.getAttribute('data-href'),
        })),
      );
      assert.equal(
        resultats.some((r) => r.libelle.includes(TERME)),
        true,
        `Le résultat semé n’apparaît pas : ${JSON.stringify(resultats).slice(0, 200)}`,
      );

      // ── §3 : le clic MÈNE à la fiche ───────────────────────────────────
      await page.click('.palette-item[data-href]');
      await attendreQuiescence(page);

      const apres = await page.evaluate(() => ({
        hash: window.location.hash,
        paletteOuverte: !document.querySelector('.palette-fond')?.hidden,
      }));
      assert.equal(
        apres.hash.startsWith('#/risques/'),
        true,
        `Le clic n’a pas mené à la fiche : hash = ${apres.hash}`,
      );
      assert.equal(apres.paletteOuverte, false, 'La palette doit se fermer en menant ailleurs.');

      // ── Échap referme, et la palette ne laisse aucune erreur derrière ──
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyK');
      await page.keyboard.up('Control');
      await page.waitForSelector('#palette-champ', { state: 'visible', timeout: DELAI });
      await page.keyboard.press('Escape');
      await attendreQuiescence(page);
      const fermee = await page.evaluate(() => document.querySelector('.palette-fond').hidden);
      assert.equal(fermee, true, 'Échap doit refermer la palette.');

      assert.deepEqual(erreurs, [], 'La palette a levé une erreur de page.');
    } finally {
      await session.fermer();
    }
  });

  test('un terme d’un seul signe n’interroge pas le serveur — il le DIT', async (t) => {
    // Décision 2 du fichier `palette.js` : sans plancher, écrire « rançongiciel »
    // déclencherait douze recherches, donc douze fois des lignes rendues, et le
    // budget de trace du serveur prendrait une saisie pour une extraction.
    t.diagnostic(`délai ${String(DELAI)} ms`);
    const session = await ouvrirPage(navigateur);
    try {
      const { page } = session;
      const appels = [];
      page.on('request', (r) => {
        if (r.url().includes('/api/recherche')) appels.push(r.url());
      });

      await page.goto(application.url, { waitUntil: 'domcontentloaded', timeout: DELAI });
      await attendreApplication(page, { timeout: DELAI });
      await attendreQuiescence(page);

      await page.keyboard.down('Control');
      await page.keyboard.press('KeyK');
      await page.keyboard.up('Control');
      await page.waitForSelector('#palette-champ', { state: 'visible', timeout: DELAI });

      await page.fill('#palette-champ', 'a');
      await attendreQuiescence(page);

      assert.deepEqual(appels, [], 'Un seul signe ne doit déclencher aucune requête.');
      const message = await page.textContent('.palette-vide');
      assert.equal(
        (message ?? '').length > 10,
        true,
        'L’écran doit DIRE pourquoi il ne montre rien — un vide sans explication apprend à ' +
          'ne plus croire ce qu’on montre (classe Q-201 / Q-207).',
      );
    } finally {
      await session.fermer();
    }
  });
});
