/**
 * analyse-impact.test.mjs — **l'analyse d'impact arrive-t-elle jusqu'à
 * l'utilisateur ?** (lot L20, action 20.3)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  La moitié que le banc serveur ne peut pas voir
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/aipd/etat.test.mjs` prouve que la route tient. Cela ne prouve rien de ce
 * qui compte si aucun écran ne l'appelle — et c'est arrivé trois lots d'affilée
 * sur ce chantier (`docs/REPRISE.md` §4 : *une capacité qu'aucun écran n'appelle
 * est une capacité absente*).
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'encart est sur la fiche du TRAITEMENT, et il dit la **présomption** |
 * | 2 | On enregistre l'analyse DEPUIS L'ÉCRAN, et elle revient après rechargement |
 * | 3 | L'onglet du registre montre l'état — et **ce qui n'a aucune analyse** |
 * | 4 | Une revue ÉCHUE se voit comme « À revoir », sans qu'on ait rien fait |
 * | 5 | Un nom de traitement HOSTILE ressort échappé, et l'essai le fait DÉCIDER |
 *
 * ── ⚠️ LE §4 EST LE CŒUR ──────────────────────────────────────────────────
 *
 * Il sème une analyse **validée** dont la date de revue est dans le passé, et
 * n'exécute rien d'autre que l'affichage. Si l'écran la montre « validée », c'est
 * que l'état a été recopié quelque part — et le produit affirmera une conformité
 * RGPD que personne n'a constatée, jusqu'à ce qu'un humain y repasse.
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

/** Un nom qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const NOM_HOSTILE = 'Paie <img src=x onerror="window.__xss=1">';

let base;
let navigateur;
let serveur;
let application;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  const applicatif = await base.connexion('app');
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      // Un traitement SANS analyse, portant des données sensibles : c'est celui
      // dont l'écran doit dire la présomption (§1), et celui qu'on analyse (§2).
      await c.query(
        `insert into traitements (id, filiale_id, nom, donnees_sensibles, finalite)
             values ('TRT-AIPD-ECRAN', $1, $2, true, 'Gestion de la paie')`,
        [FILIALE_A, NOM_HOSTILE],
      );
      // Un second traitement, avec une analyse VALIDÉE dont la revue est ÉCHUE.
      // ⚠️ Rien ne la « repassera » : c'est tout le point du §4.
      await c.query(
        `insert into traitements (id, filiale_id, nom, donnees_sensibles)
             values ('TRT-AIPD-ECHUE', $1, 'Vidéoprotection', true)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into analyses_impact (id, filiale_id, traitement_id, statut, date_analyse,
                                      revoir_le)
             values ('AIPD-ECRAN-ECHUE', $1, 'TRT-AIPD-ECHUE', 'validee', date '2024-01-10',
                     current_date - 1)`,
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

/** Attend qu'un panneau asynchrone ait remplacé son « Lecture… ». */
async function attendrePanneau(page, id) {
  await page.waitForFunction(
    (corpsId) => {
      const n = document.getElementById(corpsId);
      return n !== null && !/Lecture\s/u.test(n.textContent ?? '');
    },
    id,
    { timeout: DELAI },
  );
}

describe('l’analyse d’impact, jusqu’à l’écran', () => {
  test('§1 — l’encart est sur la fiche du TRAITEMENT, et il dit la PRÉSOMPTION', async () => {
    const { page } = session;
    await aller(page, '/rgpd/TRT-AIPD-ECRAN');
    await attendrePanneau(page, 'aipdEncartCorps');

    const vu = await page.evaluate(() => {
      const corps = document.getElementById('aipdEncartCorps');
      return {
        present: corps !== null,
        texte: corps?.textContent ?? '',
        formulaire: document.getElementById('aipdForm') !== null,
      };
    });
    assert.equal(
      vu.present,
      true,
      'La fiche d’un traitement ne porte AUCUN encart d’analyse d’impact : l’action 20.3 est ' +
        'inatteignable depuis le produit.',
    );
    assert.match(vu.texte, /Aucune analyse d’impact n’est enregistrée/u);
    assert.match(
      vu.texte,
      /catégories particulières/u,
      'L’écran ne dit pas POURQUOI l’analyse est présumée due.',
    );
    // ⚠️ Le mot « présomption » doit y être. Un écran qui écrirait « analyse
    // requise » aurait TRANCHÉ — et il aurait tranché sur deux critères de
    // l’article 35 §3 que le registre ne permet pas de mesurer.
    assert.match(
      vu.texte,
      /PRÉSOMPTION|présomption/u,
      'L’écran présente la présomption comme une décision. Le produit ne détient pas de quoi ' +
        'décider : il informe, et c’est le responsable de traitement qui tranche.',
    );
    assert.equal(vu.formulaire, true, 'Le formulaire d’enregistrement doit être offert.');
  });

  test('§2 — on enregistre DEPUIS L’ÉCRAN, et l’analyse revient après rechargement', async () => {
    const { page } = session;

    await page.evaluate(() => {
      document.getElementById('aipdStatut').value = 'validee';
      document.getElementById('aipdDate').value = '2026-03-01';
      document.getElementById('aipdRevoir').value = '2099-12-31';
      document.getElementById('aipdMotif').value = 'Données de santé des salariés.';
      document.getElementById('aipdForm').dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true }),
      );
    });
    await page.waitForFunction(
      () => /Validée/u.test(document.getElementById('aipdEncartCorps')?.textContent ?? ''),
      null,
      { timeout: DELAI },
    );
    await attendreQuiescence(page, { delai: DELAI });

    // ── LE RECHARGEMENT COMPLET : on repasse par /api/donnees ────────────
    //
    // Sans ce geste, l'essai mesurerait ce que l'écran vient d'écrire en mémoire,
    // pas ce que le serveur a retenu. C'est la moitié qui manque le plus souvent.
    const rechargee = await ouvrirApplication();
    try {
      await aller(rechargee.page, '/rgpd/TRT-AIPD-ECRAN');
      await attendrePanneau(rechargee.page, 'aipdEncartCorps');
      const texte = await rechargee.page.evaluate(
        () => document.getElementById('aipdEncartCorps')?.textContent ?? '',
      );
      assert.match(texte, /Validée/u, 'L’analyse enregistrée n’a pas survécu au rechargement.');
      assert.match(texte, /Données de santé des salariés/u, 'Le motif n’est pas revenu.');
    } finally {
      await rechargee.page.context().close().catch(() => {});
    }
  });

  test('§3 — l’onglet du registre montre l’état ET ce qui n’a aucune analyse', async () => {
    const { page } = session;
    await aller(page, '/rgpd-aipd');
    await page.waitForFunction(
      () => !/Lecture des analyses/u.test(document.getElementById('aipdVue')?.textContent ?? ''),
      null,
      { timeout: DELAI },
    );

    const vu = await page.evaluate(() => {
      const vue = document.getElementById('aipdVue');
      return {
        texte: vue?.textContent ?? '',
        analysees: vue.querySelectorAll('.aipd-vue-ligne').length,
        manquantes: vue.querySelectorAll('.aipd-manque').length,
        onglets: [...document.querySelectorAll('.page-onglets a, .page-onglets button')].map(
          (n) => n.textContent.trim(),
        ),
      };
    });
    assert.ok(vu.analysees >= 2, `Seulement ${String(vu.analysees)} analyse(s) rendue(s).`);
    assert.ok(
      vu.manquantes >= 1,
      'La liste des traitements SANS analyse est vide : le registre de l’article 35 ne dirait ' +
        'que ce qui a été fait, jamais ce qui manque — c’est-à-dire l’inverse de la question ' +
        'qu’un contrôle pose.',
    );
    assert.match(vu.texte, /Traitements sans analyse d’impact/u);
    // L'onglet est bien un ONGLET du registre, pas une entrée de menu de plus.
    assert.ok(
      vu.onglets.some((t) => /Analyses d’impact/u.test(t)),
      `La barre d’onglets du registre RGPD ne porte pas l’analyse d’impact : ${vu.onglets.join(' · ')}`,
    );
  });

  test('§4 — une revue ÉCHUE se voit « À revoir », sans qu’on ait rien fait', async () => {
    const { page } = session;
    await aller(page, '/rgpd/TRT-AIPD-ECHUE');
    await attendrePanneau(page, 'aipdEncartCorps');

    const texte = await page.evaluate(
      () => document.getElementById('aipdEncartCorps')?.textContent ?? '',
    );
    assert.match(
      texte,
      /À revoir/u,
      'Une analyse validée dont la date de revue est passée s’affiche encore comme valide : le ' +
        'produit affirme une conformité RGPD que personne n’a constatée, et il l’affirmera ' +
        'jusqu’à ce qu’un humain y repasse.',
    );
    // ⚠️ **La nuance que cet essai a fait apparaître, et elle valait le détour.**
    // Le sélecteur du formulaire dit « Validée » — c'est la DÉCISION enregistrée,
    // et elle ne s'efface pas — pendant que le badge dit « À revoir » — c'est
    // l'ÉTAT dérivé. Les deux sont justes ; un lecteur qui les voit côte à côte
    // sans un mot conclut que l'un des deux ment. On mesure donc le BADGE, et
    // l'on exige que l'écran RÉCONCILIE explicitement les deux.
    const badge = await page.evaluate(
      () => document.querySelector('#aipdEncartCorps .status')?.textContent?.trim() ?? '',
    );
    assert.equal(
      badge,
      'À revoir',
      'Le badge d’état affiche autre chose que l’état dérivé : c’est lui que le lecteur lit ' +
        'en premier.',
    );
    assert.match(
      texte,
      /La décision enregistrée reste/u,
      'L’écran montre « Validée » dans le formulaire et « À revoir » dans le badge sans un mot ' +
        'd’explication. Deux réponses apparemment contradictoires à la même question, dans un ' +
        'outil produit en audit, apprennent à ne plus croire l’écran — y compris le jour où il ' +
        'dit vrai (classe Q-201 / Q-207).',
    );

    // Et la base n'a pas bougé : l'état est dérivé, pas rangé.
    const enBase = await base.avecPerimetre(
      await base.connexion('app'),
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query("select statut, version from analyses_impact where id = 'AIPD-ECRAN-ECHUE'")
        ).rows[0],
    );
    assert.equal(enBase.statut, 'validee');
    assert.equal(Number(enBase.version), 1, 'L’affichage a ÉCRIT : le compteur de version a bougé.');
  });

  test('§5 — un nom de traitement HOSTILE ressort ÉCHAPPÉ', async () => {
    const { page } = session;
    await aller(page, '/rgpd-aipd');
    await page.waitForFunction(
      () => !/Lecture des analyses/u.test(document.getElementById('aipdVue')?.textContent ?? ''),
      null,
      { timeout: DELAI },
    );

    const mesure = await page.evaluate(() => ({
      xss: window.__xss === 1,
      images: document.querySelectorAll('#aipdVue img').length,
      texte: document.getElementById('aipdVue')?.textContent ?? '',
    }));
    assert.equal(mesure.xss, false, 'Le nom du traitement a été EXÉCUTÉ.');
    assert.equal(mesure.images, 0, 'Le nom du traitement a fabriqué une balise.');
    assert.match(
      mesure.texte,
      /<img src=x/u,
      'Le nom doit s’afficher TEL QUEL, chevrons compris : sans cette moitié, l’essai serait ' +
        'vert sur un écran qui aurait simplement effacé le nom.',
    );
  });
});
