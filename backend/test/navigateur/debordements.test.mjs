/**
 * debordements.test.mjs — **RIEN NE SORT DE SON CADRE**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Signalé par l'utilisateur le 21/09/2026, sur la fiche d'un document :
 * *« j'ai une table qui sort de son cadre »*. Reproduit à 980 px de large,
 * puis cherché **partout** par un balayage de tous les écrans — et il y était
 * partout, sous deux formes.
 *
 * ⚠️ **Le banc était entièrement vert.** 2 405 essais vérifiaient qu'un écran
 * se rend et que son contenu est juste ; aucun ne vérifiait qu'il **tient dans
 * sa largeur**. C'est la même leçon que la passe de style du même jour : *un
 * essai qui mesure le contenu ne mesure pas la mise en page.*
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | ⚠️ Le CORPS DE PAGE ne défile jamais latéralement, sur aucun écran |
 * | 2 | ⚠️ Aucun élément ne sort de son conteneur sans que rien ne le fasse défiler |
 * | 3 | LE BALAYAGE A DE LA MATIÈRE : il a bien visité des écrans, et des fiches |
 *
 * ── ⚠️ LA LARGEUR CHOISIE EST 1024 px, ET CE N'EST PAS UN HASARD ───────────
 *
 * À 1440 px, presque rien ne déborde : il y a de la place. Le défaut n'apparaît
 * qu'en rétrécissant — c'est-à-dire sur l'écran d'un portable, qui est ce que
 * la plupart des utilisateurs ont. *Un contrôle joué à la largeur la plus
 * confortable mesure le cas le plus favorable, et se rassure lui-même.*
 *
 * ── Ce que le contrôle IGNORE, et pourquoi ────────────────────────────────
 *
 * · **La bulle d'aide** (`.help-tip`) : elle est `position: fixed` depuis le
 *   21/09 et sort de tous les cadres **par dessein**. C'est ce qui la rend
 *   insensible aux `overflow` — et c'est ce qui a rendu sûres les deux règles
 *   de correction des tableaux.
 * · **Les éléments d'un SVG** : ils n'ont pas la sémantique CSS de débordement,
 *   et `scrollWidth` y rend des valeurs qui ne veulent rien dire.
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

const DELAI = 30_000;
/**
 * ⚠️ **DEUX largeurs, et chacune a été trouvée en cassant le correctif.**
 *
 * La première rédaction mesurait à **1024 px** : en retirant la règle de
 * correction, le balayage restait **entièrement vert**. La deuxième a essayé
 * **960 px** : vert aussi. Le défaut signalé par l'utilisateur ne se reproduit
 * qu'autour de **980 px** — au-dessus il y a la place, en dessous une bascule
 * de mise en page relâche la pression.
 *
 * *Une largeur unique mesure une fenêtre, pas le produit.* On en joue donc
 * deux : celle où le défaut vit, et une largeur de travail ordinaire où l'on
 * veut savoir que rien n'a régressé.
 *
 * ⚠️ Et la leçon vaut au-delà de ce fichier : **un essai qui couvre une règle
 * sans jamais la faire décider ne la couvre pas** (constat Q-210). Ces deux
 * nombres ne sont pas choisis, ils sont *mesurés*.
 */
const LARGEURS = [980, 1280];

/**
 * Les identifiants du semis partagé, par route à fiche.
 *
 * ⚠️ **Les fiches comptent plus que les listes**, et le défaut signalé était
 * sur une fiche : une liste tient rarement plus de six colonnes, une fiche
 * empile des panneaux, des grilles et des tableaux de circuit.
 */
const FICHES = Object.freeze({
  '/clients': 'CLI-A', '/personnel': 'PERS-A', '/actifs': 'ACTIF-A', '/risques': 'RISK-A',
  '/exigences': 'EX-A', '/mesures': 'MESURE-A', '/incidents': 'INC-A', '/documents': 'DOC-A',
  '/rgpd': 'TRT-A', '/actions': 'ACT-A', '/bia': 'BIA-A', '/crise': 'CRISE-A',
  '/pra': 'SCEN-A', '/mco': 'MCO-A', '/tests': 'TEST-A', '/prestataires': 'PRES-A',
  '/audits': 'AUD-A', '/referentiels': 'anssi-hygiene', '/soa': 'anssi-hygiene',
  '/notification': 'INC-A',
});

let base;
let navigateur;
let serveur;
let application;
let session;
/** `{ route → [fautifs] }`, rempli une fois par le balayage. */
let releve = null;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // De la matière sur la fiche qui a révélé le défaut : des étiquettes, un
  // propriétaire, des notes. Une fiche vide ne déborde de rien.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      await c.query(
        `update documents set type = 'Politique de sécurité (PSSI)',
                proprietaire = 'Hélène Martin', notes = 'Revue annuelle conduite avec la direction.',
                version_document = '2.4'
          where id = 'DOC-A'`,
      );
      await c.query(
        `insert into document_etiquettes (document_id, filiale_id, etiquette) values
             ('DOC-A', $1, 'Socle groupe'), ('DOC-A', $1, 'Révision annuelle')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
  session = await ouvrirPage(navigateur, { viewport: { width: LARGEURS[0], height: 900 } });
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

/**
 * Balaie tous les écrans une fois, et retient ce qui déborde.
 *
 * ⚠️ **Les routes sont DÉCOUVERTES** auprès du routeur, jamais récitées : un
 * écran neuf entre ici tout seul. C'est la même règle que le filet de
 * non-régression, et pour le même motif — une liste écrite à la main laisse
 * sortir du contrôle l'écran qu'on vient d'ajouter.
 */
async function balayer() {
  if (releve !== null) return releve;
  const page = session.page;
  const resultat = { visites: [], fautifs: [] };
  for (const largeur of LARGEURS) {
    await page.setViewportSize({ width: largeur, height: 900 });
    await attendreQuiescence(page, { delai: DELAI });
    await balayerA(page, largeur, resultat);
  }
  releve = resultat;
  return releve;
}

async function balayerA(page, largeur, resultat) {
  const routes = await page.evaluate(() =>
    typeof Router !== 'undefined' && Router.routesEnregistrees ? Router.routesEnregistrees() : [],
  );
  assert.ok(routes.length > 20, `le routeur doit rendre ses routes : ${String(routes.length)}`);

  const cibles = [];
  for (const r of routes) {
    if (!r.includes('/:')) cibles.push(r);
    else {
      const liste = r.slice(0, -'/:id'.length);
      if (FICHES[liste] !== undefined) cibles.push(`${liste}/${FICHES[liste]}`);
    }
  }

  for (const route of cibles) {
    try {
      await page.evaluate((r) => {
        const app = document.getElementById('app');
        if (app !== null) app.innerHTML = '';
        if (window.location.hash === `#${r}`) window.dispatchEvent(new HashChangeEvent('hashchange'));
        else window.location.hash = `#${r}`;
      }, route);
      await page.waitForFunction(
        () => (document.getElementById('app')?.innerHTML.trim().length ?? 0) > 0,
        null,
        { timeout: 15_000 },
      );
      await attendreQuiescence(page, { delai: 15_000 });
    } catch {
      continue; // un écran qui ne se rend pas est le sujet d'un AUTRE contrôle
    }
    resultat.visites.push(route);

    const trouve = await page.evaluate(() => {
      const app = document.getElementById('app');
      const bornes = app.getBoundingClientRect();
      const fautifs = [];
      const pageDeborde = document.documentElement.scrollWidth > window.innerWidth + 1;

      for (const el of app.querySelectorAll('*')) {
        // Voir l'entête : la bulle d'aide et l'intérieur d'un SVG sont hors sujet.
        if (el.closest('.help-tip, svg')) continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (st.position === 'absolute' || st.position === 'fixed') continue;

        const parent = el.parentElement;
        if (parent === null) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) continue;

        // ⚠️ **On compare l'élément à SON PARENT, pas à la zone applicative.**
        // La première rédaction mesurait le dépassement de `#app` — et restait
        // verte en retirant le correctif, parce qu'un tableau qui sort de sa
        // carte reste souvent DANS la zone applicative. Le défaut signalé était
        // « une table qui sort de son cadre » : le cadre est le parent.
        const cadre = parent.getBoundingClientRect();
        const depasse = Math.round(Math.max(rect.right - cadre.right, cadre.left - rect.left));
        if (depasse <= 2) continue;

        // Un parent qui défile CONTIENT le débordement : ce n'est pas un défaut.
        if (getComputedStyle(parent).overflowX !== 'visible') continue;
        // Ni un élément que la zone applicative borne encore largement.
        if (rect.right <= bornes.right + 2 && cadre.width >= rect.width - 2) continue;

        fautifs.push(
          `<${el.tagName.toLowerCase()}>.${(el.className || '').toString().split(' ')[0]} ` +
            `sort de <${parent.tagName.toLowerCase()}> de ${String(depasse)}px`,
        );
      }
      return { pageDeborde, fautifs: [...new Set(fautifs)].slice(0, 4) };
    });

    if (trouve.pageDeborde || trouve.fautifs.length > 0) {
      resultat.fautifs.push({ route: `${route} [${String(largeur)}px]`, ...trouve });
    }
  }
}

describe('rien ne sort de son cadre', () => {
  test('§1 — ⚠️ le corps de page ne défile jamais latéralement', async () => {
    const { fautifs } = await balayer();
    const decales = fautifs.filter((f) => f.pageDeborde).map((f) => f.route);
    assert.deepEqual(
      decales,
      [],
      'Sur ces écrans, la page ENTIÈRE se décale latéralement. C’est le symptôme le plus ' +
        'déroutant qui soit : rien de visible ne l’explique, et l’utilisateur croit que ' +
        'l’application est cassée.\n  · ' + decales.join('\n  · '),
    );
  });

  test('§2 — ⚠️ aucun élément ne sort de son cadre sans défiler', async () => {
    const { fautifs } = await balayer();
    const lignes = fautifs
      .filter((f) => f.fautifs.length > 0)
      .map((f) => `${f.route} → ${f.fautifs.join(' · ')}`);
    assert.deepEqual(
      lignes,
      [],
      'Ces éléments dépassent de la zone applicative, et aucun ancêtre ne les fait défiler : ' +
        'leur contenu est donc COUPÉ. Le remède est au bas de `css/style.css` — un conteneur ' +
        'de tableau défile (`:has(> table)`), et un enfant de grille peut se réduire ' +
        '(`min-width: 0`).\n  · ' + lignes.join('\n  · '),
    );
  });

  test('§3 — LE BALAYAGE A DE LA MATIÈRE : des écrans, et des fiches', async () => {
    // ⚠️ Sans cette moitié, les deux contrôles ci-dessus passeraient au vert sur
    // un balayage qui n’aurait visité aucun écran. C’est le motif du constat
    // Q-210, et il a déjà coûté un passage de porte.
    const { visites } = await balayer();
    assert.ok(
      visites.length >= 40 * LARGEURS.length,
      `Seuls ${String(visites.length)} écrans ont été visités : le balayage ne couvre plus le produit.`,
    );
    const fiches = visites.filter((r) => r.split('/').length > 2);
    assert.ok(
      fiches.length >= 10,
      `Seules ${String(fiches.length)} fiches ont été visitées. Or le défaut signalé était SUR ` +
        'une fiche : une liste tient rarement plus de six colonnes, une fiche empile des ' +
        'panneaux, des grilles et des tableaux de circuit.',
    );
  });
});
