/**
 * accueil.test.mjs — **« MA JOURNÉE », L'ÉCRAN D'ENTRÉE** (lot L17, action A4)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'action A4 du `docs/PLAN_ACHEVEMENT.md` demandait *« un écran de démarrage
 * par rôle — ce qui m'attend aujourd'hui, pas un tableau de bord générique »*.
 * Elle était, avec A5, le seul item de la vague V-A jamais construit.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | ⚠️ L'application OUVRE sur « Ma journée » — pas sur le tableau de bord |
 * | 2 | Un bloc vide DIT pourquoi il l'est, et les raisons diffèrent |
 * | 3 | Une obligation en retard y paraît, et elle MÈNE à sa fiche |
 * | 4 | « Qui m'est attribué » rapproche sur le nom affiché, accents et casse compris |
 * | 5 | Le tableau de bord reste joignable — on n'a rien retiré |
 * | 6 | Un titre hostile est échappé, et la console reste muette |
 *
 * ── ⚠️ LE §1 EST CELUI QUI JUSTIFIE LE LOT ─────────────────────────────────
 *
 * Un écran neuf qu'on atteindrait par une entrée de menu de plus ne serait pas
 * A4 : ce serait un écran de plus. Ce que l'action demande est que **le produit
 * s'ouvre dessus**. Le §1 charge donc la page à son adresse NUE — le geste réel
 * de quelqu'un qui tape l'adresse du produit — et mesure ce qui est RENDU, plus
 * l'entrée de menu que le produit marque lui-même active.
 *
 * ⚠️ **Il ne mesure PAS le hash**, et sa première rédaction s'y est trompée : à
 * l'ouverture sans adresse, le produit n'écrit pas de hash. C'était déjà vrai
 * quand le défaut était le tableau de bord, et le changer aurait été modifier le
 * produit pour satisfaire un essai.
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

/** Un titre qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const TITRE_HOSTILE = 'Chiffrer <img src=x onerror="window.__xss=1"> les portables';

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
      // Une action EN RETARD — le §3 — et son titre est hostile, ce qui fait
      // que le §6 mesure l'échappement sur une ligne réellement rendue.
      await c.query(
        `insert into actions (id, filiale_id, titre, echeance, statut, responsable) values
             ('ACC-RETARD', $1, $2, current_date - 12, 'à faire', 'Quelqu''un D''autre')`,
        [FILIALE_A, TITRE_HOSTILE],
      );
      // Une action à ÉCHÉANCE PROCHE, pour que le bloc « cette semaine » ait
      // de la matière : un bloc vide passerait le §2 sans rien prouver.
      await c.query(
        `insert into actions (id, filiale_id, titre, echeance, statut) values
             ('ACC-SEMAINE', $1, 'Revoir la politique de sauvegarde', current_date + 3, 'en cours')`,
        [FILIALE_A],
      );
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

/** Ouvre le produit à son ADRESSE NUE — sans hash. C'est le geste réel. */
async function ouvrirSansHash() {
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

const texteDe = (page) =>
  page.evaluate(() => document.getElementById('app').textContent);

describe('« Ma journée », l’écran d’entrée du produit', () => {
  test('§1 — ⚠️ l’application OUVRE sur « Ma journée », sans qu’on demande rien', async () => {
    session = await ouvrirSansHash();

    // ⚠️ **On ne mesure PAS le hash, et la première rédaction s'y est trompée.**
    // À l'ouverture sans adresse, le produit n'ÉCRIT pas de hash — il laisse
    // l'URL propre et laisse le routeur résoudre le défaut. C'était déjà vrai
    // quand ce défaut était le tableau de bord, et le changer aurait été une
    // modification gratuite pour satisfaire un essai. *Un essai qui mesure le
    // drapeau au lieu de l'écran ne mesure pas l'écran* (leçon du 16/09, la
    // palette Ctrl+K).
    //
    // Ce qui appartient au produit, et qu'on mesure donc : ce qui est RENDU,
    // et l'entrée de menu que le produit lui-même marque comme active.
    const texte = await texteDe(session.page);
    assert.match(texte, /En retard/);
    assert.match(texte, /Cette semaine/);
    assert.match(texte, /Qui m’est attribué|Qui m'est attribué/);

    const actif = await session.page.evaluate(() => {
      const a = document.querySelector('.sidebar a.active');
      return a === null ? null : a.dataset.route ?? '';
    });
    assert.equal(
      actif,
      '/accueil',
      'Le produit ouvre encore ailleurs. Un écran d’entrée qu’il faut aller chercher dans ' +
        'le menu n’est pas l’action A4 : c’est un écran de plus.',
    );

    // Et le fil d'Ariane le nomme : sans cela, l'utilisateur ne saurait pas
    // où il est, ce qui est le comble pour un écran d'entrée.
    const fil = await session.page.evaluate(
      () => document.querySelector('.breadcrumb, #breadcrumb, nav[aria-label=\'Fil d\\u2019Ariane\']')?.textContent ?? '',
    );
    assert.match(fil + texte, /Ma journée/);
  });

  test('§2 — un bloc vide DIT pourquoi, et les raisons ne sont pas la même', async () => {
    // ⚠️ Un vide sans explication apprend à ne plus croire ce qu’on montre
    // (classe Q-201 / Q-207). Le bloc « qui m’est attribué » porte ici la
    // raison la plus précieuse : le produit avoue une LIMITE — il rapproche
    // sur un nom, et il le dit — au lieu de laisser croire qu’il n’y a rien.
    const texte = await texteDe(session.page);
    assert.match(
      texte,
      /rapprochement se fait sur le nom affiché|ne porte aucun nom affichable/,
      'Le bloc « qui m’est attribué » est vide sans dire pourquoi.',
    );
  });

  test('§3 — une obligation en retard y paraît, et elle mène à sa fiche', async () => {
    const lignes = await session.page.evaluate(() =>
      [...document.querySelectorAll('#app tr.clickable-row')].map((tr) => ({
        route: tr.dataset.route ?? '',
        texte: tr.textContent,
      })),
    );
    const retard = lignes.find((l) => l.route === '#/actions/ACC-RETARD');
    assert.ok(
      retard,
      `L’action en retard n’est pas sur l’écran : ${JSON.stringify(lignes.map((l) => l.route))}`,
    );
    assert.match(retard.texte, /en retard de 12 j/);

    // Elle MÈNE quelque part : un écran d’entrée qui liste sans conduire
    // oblige à retrouver la fiche à la main, et c’est ce qu’il existe pour
    // éviter.
    await session.page.click('#app tr.clickable-row[data-route="#/actions/ACC-RETARD"]');
    await attendreQuiescence(session.page, { delai: DELAI });
    const hash = await session.page.evaluate(() => window.location.hash);
    assert.equal(hash, '#/actions/ACC-RETARD');
  });

  test('§4 — « qui m’est attribué » rapproche sur le nom affiché', async () => {
    // ⚠️ Le nom de la session est LU sur la page, jamais supposé : le banc
    // monte une session provisoire, et coder son libellé en dur ici ferait
    // rougir cet essai le jour où ce libellé change — pour une raison
    // étrangère à ce qu’il mesure.
    const nom = await session.page.evaluate(() =>
      typeof Session !== 'undefined' ? Session.libelleUtilisateur() : '',
    );
    assert.ok(nom, 'la session du banc doit porter un libellé, sinon le §4 ne mesure rien');

    // On crée une action qui nomme cette personne — en CASSE DIFFÉRENTE et
    // sans accent, pour que le rapprochement ait quelque chose à faire.
    const cree = await serveur.appeler('POST', '/api/entites/actions', {
      corps: {
        champs: {
          titre: 'Action qui me revient',
          echeance: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
          statut: 'à faire',
          responsable: nom.toUpperCase(),
        },
      },
    });
    assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
    const identifiant = cree.corps.enregistrement.id;

    const vue = await ouvrirSansHash();
    try {
      const routes = await vue.page.evaluate(() =>
        [...document.querySelectorAll('#app tr.clickable-row')].map((tr) => tr.dataset.route ?? ''),
      );
      assert.ok(
        routes.includes(`#/actions/${identifiant}`),
        `L’action qui nomme « ${nom.toUpperCase()} » n’apparaît pas : le rapprochement ne ` +
          `replie ni la casse ni les accents. Rendu : ${JSON.stringify(routes)}`,
      );
      // Et elle est bien dans le bloc « qui m’est attribué », pas seulement
      // dans « cette semaine » : sans cette distinction, le §4 serait vert
      // sur un écran qui ignore complètement le nom.
      const dansBlocMien = await vue.page.evaluate((id) => {
        const blocs = [...document.querySelectorAll('#app section.dashboard-card')];
        const mien = blocs.find((b) => /attribu/u.test(b.querySelector('h2')?.textContent ?? ''));
        if (!mien) return false;
        return [...mien.querySelectorAll('tr.clickable-row')].some(
          (tr) => tr.dataset.route === `#/actions/${id}`,
        );
      }, identifiant);
      assert.equal(dansBlocMien, true, 'elle doit figurer dans le bloc « qui m’est attribué »');
    } finally {
      await vue.page.context().close().catch(() => {});
    }
  });

  test('§5 — le tableau de bord reste joignable : on n’a rien retiré', async () => {
    // A4 DÉPLACE l’écran d’entrée ; il ne supprime pas la vue d’ensemble.
    // Un lot qui retirerait une capacité en en ajoutant une serait un
    // échange, pas une livraison.
    await aller(session.page, '/dashboard');
    const texte = await texteDe(session.page);
    assert.ok(texte.trim().length > 0, 'le tableau de bord doit encore se rendre');
  });

  test('§6 — le titre hostile est échappé, et la console est restée muette', async () => {
    await aller(session.page, '/accueil');
    const xss = await session.page.evaluate(() => window.__xss ?? null);
    assert.equal(xss, null, 'Le titre hostile a été exécuté : l’échappement a cédé.');
    const texte = await texteDe(session.page);
    assert.ok(
      texte.includes('onerror'),
      'Le titre doit paraître EN TEXTE — sans quoi l’essai serait vert sur une ligne ' +
        'simplement absente.',
    );
    assert.deepEqual(session.erreurs ?? [], []);
  });
});
