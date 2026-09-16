/**
 * demandes-droits.test.mjs — **le registre des demandes d'exercice de droits,
 * jusqu'à l'écran** (lot L20, action 20.4)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  La moitié que le banc serveur ne peut pas voir
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/droits-personnes/echeance.test.mjs` prouve que l'horloge tient. Cela ne
 * prouve rien de ce qui compte si aucun écran ne l'appelle — trois lots d'affilée
 * ont été livrés ainsi sur ce chantier (`docs/REPRISE.md` §4).
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'onglet existe, et il dit le délai AVEC sa référence au texte |
 * | 2 | Un retard se voit, et il se dit EN JOURS — jamais « bientôt » |
 * | 3 | On enregistre une demande DEPUIS L'ÉCRAN, et l'échéance arrive du serveur |
 * | 4 | Une demande sans nom ou sans date de réception est REFUSÉE, et l'on dit pourquoi |
 * | 5 | Un nom de demandeur HOSTILE ressort échappé, et l'essai le fait DÉCIDER |
 *
 * ── ⚠️ LE §3 MESURE CE QUE L'ÉCRAN NE CALCULE PAS ─────────────────────────
 *
 * L'échéance affichée doit venir du **serveur**. Si l'écran la calculait, elle
 * apparaîtrait avant même que la demande ait été poussée — et elle dériverait dès
 * que l'horloge du poste diffère de celle du serveur. L'essai enregistre une
 * demande reçue **il y a quarante jours** et exige que l'écran la montre **en
 * retard** : une arithmétique locale sur la date du jour donnerait le même
 * résultat, mais une échéance ABSENTE — le cas où l'écran ne calcule rien et
 * attend le serveur — ne passerait pas.
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
const NOM_HOSTILE = 'Mme <img src=x onerror="window.__xss=1"> Ferrand';

let base;
let navigateur;
let serveur;
let application;
let session;

/** Une date, décalée de N jours, au format que la base attend. */
function ilYA(jours) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - jours);
  return d.toISOString().slice(0, 10);
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  await base.avecPerimetre(
    await base.connexion('app'),
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      // Une demande reçue il y a quarante jours, jamais traitée : le mois de
      // l'article 12 §3 est écoulé. ⚠️ Rien ne la « repassera » en retard — c'est
      // tout le point.
      await c.query(
        `insert into demandes_droits (id, filiale_id, type_demande, recue_le, canal,
                                      demandeur, statut)
             values ('DSAR-ECRAN-RETARD', $1, 'effacement', $2, 'courriel', $3, 'en_cours')`,
        [FILIALE_A, ilYA(40), NOM_HOSTILE],
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

/** Attend que la vue ait fini sa lecture. */
async function attendreVue(page) {
  await page.waitForFunction(
    () => {
      const n = document.getElementById('droitsVue');
      return n !== null && !/Lecture des demandes/u.test(n.textContent ?? '');
    },
    null,
    { timeout: DELAI },
  );
}

describe('les demandes d’exercice de droits, jusqu’à l’écran', () => {
  test('§1 — l’onglet existe, et il dit le délai AVEC sa référence au texte', async () => {
    const { page } = session;
    await aller(page, '/rgpd-demandes');
    await attendreVue(page);

    const vu = await page.evaluate(() => ({
      texte: document.getElementById('droitsVue')?.textContent ?? '',
      lignes: document.querySelectorAll('#droitsVue .dro-ligne').length,
      onglets: [...document.querySelectorAll('.page-onglets a, .page-onglets button')].map((n) =>
        n.textContent.trim(),
      ),
    }));
    assert.ok(
      vu.onglets.some((t) => /Demandes de droits/u.test(t)),
      `La barre d’onglets du registre RGPD ne porte pas les demandes : ${vu.onglets.join(' · ')}`,
    );
    // ⚠️ Un chiffre réglementaire sans sa source est un chiffre que personne ne
    // peut vérifier — et celui qui le vérifiera est une autorité.
    assert.match(
      vu.texte,
      /article 12 §3/u,
      'L’écran annonce un délai sans dire d’où il vient.',
    );
    assert.ok(vu.lignes >= 1, 'La vue ne rend aucune demande : le semis ne l’atteint pas.');
  });

  test('§2 — un retard se voit, et il se dit EN JOURS', async () => {
    const { page } = session;
    const ligne = await page.evaluate(() => {
      const tr = document.querySelector('#droitsVue .dro-ligne[data-id="DSAR-ECRAN-RETARD"]');
      return tr === null ? null : { texte: tr.textContent, html: tr.innerHTML };
    });
    assert.notEqual(ligne, null, 'La demande en retard n’est pas rendue.');
    assert.match(
      ligne.texte,
      /En retard/u,
      'Une demande dont le mois de l’article 12 §3 est écoulé ne se voit pas comme telle : le ' +
        'DPO ne l’apprendra que par la réclamation de la personne.',
    );
    // ⚠️ « En retard de 12 jours » se défend devant une autorité ; « bientôt » ne
    // se défend pas, et laisse croire qu'on a le temps.
    assert.match(
      ligne.texte,
      /En retard de \d+ jours?/u,
      'Le retard s’affiche sans être chiffré : l’écran ne dit pas de combien.',
    );
    assert.match(ligne.html, /status-critique/u, 'Un retard réglementaire est un statut critique.');
  });

  test('§3 — on enregistre DEPUIS L’ÉCRAN, et l’échéance arrive du SERVEUR', async () => {
    const { page } = session;
    const recueLe = ilYA(40);

    await page.evaluate((date) => {
      document.getElementById('droDemandeur').value = 'M. Bernard Ollier';
      document.getElementById('droContact').value = 'bernard.ollier@exemple.test';
      document.getElementById('droRecueLe').value = date;
      document.getElementById('droType').value = 'portabilite';
      document.getElementById('droForm').dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true }),
      );
    }, recueLe);
    await page.waitForFunction(
      () => /Ollier/u.test(document.getElementById('droitsVue')?.textContent ?? ''),
      null,
      { timeout: DELAI },
    );
    await attendreQuiescence(page, { delai: DELAI });

    const vu = await page.evaluate(() => {
      const lignes = [...document.querySelectorAll('#droitsVue .dro-ligne')];
      const tr = lignes.find((n) => /Ollier/u.test(n.textContent));
      return tr === null || tr === undefined ? null : tr.textContent;
    });
    assert.notEqual(vu, null);
    assert.match(
      vu,
      /Portabilité/u,
      'Le droit invoqué n’est pas rendu en français : l’écran montre le vocabulaire de la base.',
    );
    assert.match(
      vu,
      /En retard de \d+ jours?/u,
      'Une demande reçue il y a quarante jours n’apparaît pas en retard. Ou l’échéance n’est ' +
        'pas venue du serveur, ou elle n’a pas été calculée du tout — dans les deux cas, ' +
        'l’écran ment sur un délai réglementaire.',
    );

    // ── ET LE RECHARGEMENT COMPLET : on repasse par /api/donnees ──────────
    const rechargee = await ouvrirApplication();
    try {
      await aller(rechargee.page, '/rgpd-demandes');
      await attendreVue(rechargee.page);
      const texte = await rechargee.page.evaluate(
        () => document.getElementById('droitsVue')?.textContent ?? '',
      );
      assert.match(texte, /Ollier/u, 'La demande enregistrée n’a pas survécu au rechargement.');
    } finally {
      await rechargee.page.context().close().catch(() => {});
    }
  });

  test('§4 — une demande sans nom ou sans date est REFUSÉE, et l’on dit pourquoi', async () => {
    const { page } = session;
    await aller(page, '/rgpd-demandes');
    await attendreVue(page);

    const avant = await page.evaluate(
      () => document.querySelectorAll('#droitsVue .dro-ligne').length,
    );
    const messages = await page.evaluate(() => {
      const recus = [];
      const original = window.showToast;
      window.showToast = (texte, ton) => recus.push({ texte, ton });
      try {
        document.getElementById('droDemandeur').value = '   ';
        document.getElementById('droForm').dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true }),
        );
        document.getElementById('droDemandeur').value = 'M. Sans Date';
        document.getElementById('droRecueLe').value = '';
        document.getElementById('droForm').dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true }),
        );
      } finally {
        window.showToast = original;
      }
      return recus;
    });

    assert.equal(messages.length, 2, `Refus attendus : 2. Reçus : ${JSON.stringify(messages)}`);
    // ⚠️ Le message dit CE QUI MANQUE et POURQUOI cela manque. « Champ
    // obligatoire » apprend à cliquer ; « sans lui, on ne saura pas à qui l'on a
    // répondu » apprend le métier.
    assert.match(messages[0].texte, /à qui/u);
    assert.match(messages[1].texte, /délai|horloge/u);
    assert.equal(
      await page.evaluate(() => document.querySelectorAll('#droitsVue .dro-ligne').length),
      avant,
      'Une demande incomplète a tout de même été enregistrée.',
    );
  });

  test('§5 — un nom de demandeur HOSTILE ressort ÉCHAPPÉ', async () => {
    const { page } = session;
    const mesure = await page.evaluate(() => ({
      xss: window.__xss === 1,
      images: document.querySelectorAll('#droitsVue img').length,
      texte: document.getElementById('droitsVue')?.textContent ?? '',
    }));
    assert.equal(mesure.xss, false, 'Le nom du demandeur a été EXÉCUTÉ.');
    assert.equal(mesure.images, 0, 'Le nom du demandeur a fabriqué une balise.');
    assert.match(
      mesure.texte,
      /<img src=x/u,
      'Le nom doit s’afficher TEL QUEL, chevrons compris : sans cette moitié, l’essai serait ' +
        'vert sur un écran qui aurait simplement effacé le nom.',
    );
  });
});
