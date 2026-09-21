/**
 * recherche-documentaire.test.mjs — **D3 JUSQU'À L'ÉCRAN** (lot L16, action D3)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * `docs/REPRISE.md` §4 : *« une capacité qu'aucun écran n'appelle est une
 * capacité absente. Trois lots de suite ont été livrés, éprouvés et verts sans
 * que personne puisse s'en servir. »*
 *
 * `test/recherche/documentaire.test.mjs` éprouve la route. Ce fichier-ci mesure
 * l'autre moitié : **qu'un utilisateur l'atteigne au clavier**, et que ce qu'il
 * voit soit ce que le serveur a dit.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Le champ existe sur l'écran « Gestion documentaire », et il cherche |
 * | 2 | L'écran dit OÙ la correspondance a eu lieu |
 * | 3 | ⚠️ L'extrait n'apparaît NULLE PART dans le DOM — pas même masqué |
 * | 4 | « Rien trouvé » se DIT, et se distingue d'un registre vide |
 * | 5 | On revient au registre, et il est entier |
 * | 6 | Un titre hostile est échappé dans les résultats |
 *
 * ── ⚠️ LE §3 EST CELUI QUI NE SE MESURE QUE LÀ ─────────────────────────────
 *
 * La route ne rend pas l'extrait — c'est éprouvé côté serveur. Mais un écran
 * peut très bien aller le chercher ailleurs : `DataStore` détient `notes`, et
 * afficher « …le chiffrement des sauvegardes en tête, relancée par Mme Ollier »
 * sous le résultat aurait paru une bonne idée d'ergonomie. Ce § vérifie le DOM
 * ENTIER — `innerHTML` de l'application, attributs compris —, parce que la
 * décision de la migration `059` ne vaut que si les deux bouts la tiennent.
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
const TITRE_HOSTILE = 'Charte <img src=x onerror="window.__xss=1"> chiffrement';
/** Le nom au milieu de l'annotation — le sujet du §3. */
const NOM_EN_NOTE = 'Ollier';
const NOTE = `Revue conduite avec le chiffrement des sauvegardes en tête, relancée par Mme ${NOM_EN_NOTE}.`;

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
      await c.query(
        `insert into documents (id, filiale_id, titre, type, notes, statut) values
             ('D3-ECRAN-TITRE', $1, 'Politique de chiffrement des postes',
              'Politique de sécurité (PSSI)', null, 'en vigueur'),
             ('D3-ECRAN-NOTE', $1, 'Revue trimestrielle du parc',
              'Procédure', $2, 'en vigueur'),
             ('D3-ECRAN-HOSTILE', $1, $3, 'Charte informatique', null, 'brouillon')`,
        [FILIALE_A, NOTE, TITRE_HOSTILE],
      );
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
  session = await ouvrirPage(navigateur);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
  await attendreQuiescence(session.page, { delai: DELAI });
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

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

/**
 * Tape un terme dans le champ et attend que l'écran se redessine.
 *
 * ⚠️ **On tape au clavier, on ne pose pas `value`** : le module écoute
 * l'évènement `input`, et poser la valeur au programme ne le déclencherait pas —
 * l'essai mesurerait alors un champ qui ne cherche pas.
 */
async function chercher(page, terme) {
  await page.waitForSelector('#rechercheDocs', { timeout: DELAI });
  await page.fill('#rechercheDocs', '');
  await page.type('#rechercheDocs', terme, { delay: 10 });
  // Le module attend 300 ms avant d'interroger : sans cette marge, l'essai
  // mesurerait l'écran d'AVANT la recherche.
  await page.waitForTimeout(600);
  await attendreQuiescence(page, { delai: DELAI });
}

/** Le texte de la colonne « Correspondance », ligne par ligne. */
async function lignes(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('#app table.data-table tbody tr')].map((tr) => ({
      id: tr.dataset.id ?? '',
      cellules: [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
    })),
  );
}

describe('la recherche documentaire, jusqu’à l’écran', () => {
  test('§1 — le champ existe, et il cherche pour de vrai', async () => {
    await aller(session.page, '/documents');
    const present = await session.page.$('#rechercheDocs');
    assert.notEqual(
      present,
      null,
      'Le champ de recherche n’est pas sur l’écran : la route existe et personne ne peut ' +
        'l’atteindre — c’est-à-dire une capacité absente (`docs/REPRISE.md` §4).',
    );

    await chercher(session.page, 'chiffrement');
    const trouvees = await lignes(session.page);
    const ids = trouvees.map((l) => l.id);
    assert.ok(
      ids.includes('D3-ECRAN-TITRE'),
      `« chiffrement » n’a pas remonté le document du titre : ${JSON.stringify(ids)}`,
    );
    assert.ok(ids.includes('D3-ECRAN-NOTE'), 'le document dont la NOTE porte le terme');
    // ⚠️ **On compare deux RANGS, on ne fixe pas la première place.** TROIS
    // documents portent « chiffrement » ici — le titre hostile aussi —, et
    // deux d'entre eux le portent dans leur TITRE : lequel des deux sort
    // devant dépend de leur libellé, c'est-à-dire de la donnée. La propriété
    // qui appartient au CODE est que le titre passe devant l'annotation.
    //
    // *La première rédaction de cet essai exigeait `ids[0] === 'D3-ECRAN-TITRE'`
    // et rougissait sur un produit juste : elle mesurait un classement, quand
    // c'est une composition qu'il fallait mesurer.*
    assert.ok(
      ids.indexOf('D3-ECRAN-TITRE') < ids.indexOf('D3-ECRAN-NOTE'),
      'L’ordre du serveur n’est pas respecté à l’écran : un titre doit passer devant une ' +
        `annotation, c’est le garde-corps de l’arbitrage sur \`notes\`. Rendu : ${JSON.stringify(ids)}`,
    );
  });

  test('§2 — l’écran dit OÙ la correspondance a eu lieu', async () => {
    const trouvees = await lignes(session.page);
    const note = trouvees.find((l) => l.id === 'D3-ECRAN-NOTE');
    assert.ok(note, 'la ligne doit être là');
    // Dernière cellule : « Correspondance ». Elle répond à « pourquoi ce
    // document ? », sans quoi l'utilisateur doit ouvrir chaque fiche pour le
    // deviner.
    assert.match(note.cellules[note.cellules.length - 1], /annotations/);
    const titre = trouvees.find((l) => l.id === 'D3-ECRAN-TITRE');
    assert.match(titre.cellules[titre.cellules.length - 1], /le titre/);
  });

  test('§3 — ⚠️ l’extrait n’apparaît NULLE PART dans le DOM', async () => {
    await chercher(session.page, NOM_EN_NOTE);
    const trouvees = await lignes(session.page);
    assert.deepEqual(
      trouvees.map((l) => l.id),
      ['D3-ECRAN-NOTE'],
      'le document doit bien remonter — sans quoi le contrôle ci-dessous ne mesure rien',
    );

    // Le DOM de l'application, attributs compris — un extrait rangé dans un
    // `title=` ou un `data-` serait tout aussi divulgué —, **le champ de saisie
    // excepté**.
    //
    // ⚠️ **L'exception est étroite et elle se justifie** : le champ porte
    // `value="Ollier"` parce que l'utilisateur VIENT DE LE TAPER. Le produit ne
    // lui apprend rien en le lui rendant. *La première rédaction de cet essai
    // lisait le DOM entier et accusait le produit de divulguer le terme de
    // recherche à celui qui l'avait écrit.* Ce qui reste mesuré est le seul
    // vrai risque : qu'un morceau de l'ANNOTATION, que personne n'a tapé,
    // apparaisse.
    const balisage = await session.page.evaluate(() => {
      const copie = document.getElementById('app').cloneNode(true);
      copie.querySelectorAll('#rechercheDocs').forEach((e) => e.remove());
      return copie.innerHTML;
    });
    assert.equal(
      balisage.includes(NOM_EN_NOTE),
      false,
      'Le nom écrit dans l’annotation est dans le DOM. La route ne l’a pas rendu — l’écran ' +
        'est donc allé le chercher dans `DataStore`, et le produit redevient un moteur de ' +
        'recherche SUR LES PERSONNES que ces annotations nomment (migration `059`).',
    );
    // Celle-ci porte sur le DOM ENTIER, champ compris : « sauvegardes en tête »
    // est une suite de mots que l'utilisateur n'a JAMAIS tapée. Si elle paraît,
    // elle ne peut venir que de l'annotation.
    const domEntier = await session.page.evaluate(
      () => document.getElementById('app').innerHTML,
    );
    assert.equal(
      domEntier.includes('sauvegardes en tête'),
      false,
      'Un morceau de l’annotation est affiché — et personne ne l’a tapé.',
    );
  });

  test('§4 — « rien trouvé » se DIT, et ce n’est pas « registre vide »', async () => {
    await chercher(session.page, 'hydroelectrique');
    const texte = await session.page.evaluate(
      () => document.getElementById('app').textContent,
    );
    assert.match(
      texte,
      /Aucun document ne correspond/,
      'Un vide sans explication apprend à ne plus croire ce qu’on montre (classe Q-201 / Q-207).',
    );
    // ⚠️ Et il ne doit PAS dire « aucun document » tout court, qui est le vide
    // du registre : les deux situations n'appellent pas le même geste.
    assert.equal(
      /Référencez vos politiques et procédures/.test(texte),
      false,
      'L’écran a montré le vide du REGISTRE là où il n’y a qu’une recherche sans résultat.',
    );
  });

  test('§5 — on revient au registre, et il est entier', async () => {
    await session.page.click('#rechercheEffacer2');
    await attendreQuiescence(session.page, { delai: DELAI });
    const trouvees = await lignes(session.page);
    const ids = trouvees.map((l) => l.id);
    for (const attendu of ['D3-ECRAN-TITRE', 'D3-ECRAN-NOTE', 'D3-ECRAN-HOSTILE']) {
      assert.ok(ids.includes(attendu), `« ${attendu} » manque au registre : ${JSON.stringify(ids)}`);
    }
  });

  test('§6 — un titre hostile est échappé dans les résultats', async () => {
    await chercher(session.page, 'chiffrement');
    const xss = await session.page.evaluate(() => window.__xss ?? null);
    assert.equal(xss, null, 'Le titre hostile a été exécuté : l’échappement a cédé.');
    const texte = await session.page.evaluate(
      () => document.getElementById('app').textContent,
    );
    assert.ok(
      texte.includes('onerror'),
      'Le titre doit paraître EN TEXTE — sans quoi l’essai passerait au vert sur un ' +
        'résultat simplement absent.',
    );
  });

  test('§7 — aucune erreur de console pendant toute la manœuvre', async () => {
    // Le banc en garde la trace depuis l'ouverture de la page : une exception
    // silencieuse dans le branchement du champ laisserait l'écran figé sans
    // qu'aucune assertion ci-dessus ne le dise.
    assert.deepEqual(session.erreurs ?? [], []);
  });
});
