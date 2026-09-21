/**
 * largeurs-coherentes.test.mjs — **UN PANNEAU NE CHOISIT PAS SA LARGEUR**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Signalé par l'utilisateur le 21/09/2026 : *« la largeur des différents
 * conteneurs des formulaires change même à l'intérieur de la même section, ce
 * qui n'est pas responsive et n'est pas beau à voir. »*
 *
 * ⚠️ **Mesuré avant de corriger**, et le chiffre donne la mesure du désordre :
 * sur la seule fiche d'un document, **quatre largeurs de carte**
 * (956 · 900 · 820 · 772 px) et **six largeurs de champ** — dont 362, 371 et
 * 379, trois valeurs presque identiques. L'œil attrape cet écart sans pouvoir
 * le nommer, et c'est exactement ce qui fait qu'un logiciel « n'est pas beau à
 * voir ». Dans les 49 modules : **38 `max-width` écrits à la main**, en huit
 * valeurs, et **cinq seuils de repli** — donc cinq moments où la page se
 * réorganise au lieu d'un.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | ⚠️ Les panneaux d'un écran partagent UNE largeur |
 * | 2 | ⚠️ Les champs d'un écran prennent leurs largeurs dans un PETIT jeu |
 * | 3 | LE BALAYAGE A DE LA MATIÈRE : il a vu des panneaux et des champs |
 *
 * ── Ce que le contrôle ne dit PAS ─────────────────────────────────────────
 *
 * Il n'impose pas que tous les champs soient larges pareil : un sélecteur de
 * note sur cinq n'a rien à faire à la largeur d'un intitulé. Ce qu'il refuse
 * est la **dispersion** — des largeurs proches mais différentes, qui n'ont
 * aucune raison d'être et que rien ne justifie.
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
const LARGEUR = 1440;

/** Les fiches où vivent les formulaires. Ce sont elles qui portaient le défaut. */
const FICHES = Object.freeze([
  '/documents/DOC-A', '/incidents/INC-A', '/prestataires/PRES-A', '/actifs/ACTIF-A',
  '/clients/CLI-A', '/personnel/PERS-A', '/mco/MCO-A', '/bia/BIA-A',
]);

/**
 * Combien de largeurs de champ distinctes on tolère sur un écran.
 *
 * ⚠️ **Quatre, et le nombre est MESURÉ, pas choisi.** Le système à douze
 * colonnes n'offre que quatre parts au formulaire — 12, 6, 4 et 3 —, donc
 * quatre largeurs. Une cinquième signifie qu'un conteneur s'est remis à
 * décider tout seul, ce qui est exactement le défaut signalé.
 *
 * ⚠️ Les champs ÉTROITS sont écartés du compte (voir `etroit`) : un sélecteur
 * de note sur cinq n'a rien à faire à la largeur d'un intitulé, et l'exiger
 * rendrait le formulaire illisible pour satisfaire un contrôle.
 */
const LARGEURS_MAX = 4;

let base;
let navigateur;
let serveur;
let application;
let session;
let releve = null;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      await c.query(
        `update documents set type = 'Politique de sécurité (PSSI)',
                proprietaire = 'Hélène Martin', version_document = '2.4'
          where id = 'DOC-A'`,
      );
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
  session = await ouvrirPage(navigateur, { viewport: { width: LARGEUR, height: 1000 } });
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

async function balayer() {
  if (releve !== null) return releve;
  const page = session.page;
  const resultat = [];

  for (const route of FICHES) {
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
      continue;
    }

    const mesure = await page.evaluate(() => {
      const zone = document.getElementById('app');
      const page_ = zone.querySelector('section.page');
      if (page_ === null) return null;

      // Les PANNEAUX : les enfants directs de la page qui portent du contenu.
      const panneaux = [...page_.children]
        .filter((e) => e.getBoundingClientRect().width > 200)
        .filter((e) => !e.classList.contains('dashboard-header'))
        .map((e) => Math.round(e.getBoundingClientRect().width));

      // Les CHAMPS, hors champs étroits assumés (une note, un score, une
      // quantité) : au-dessous de 200 px, une largeur propre est un choix.
      const champs = [...zone.querySelectorAll('.form-group')]
        .map((e) => Math.round(e.getBoundingClientRect().width))
        .filter((w) => w >= 200);

      return { panneaux: [...new Set(panneaux)], champs: [...new Set(champs)].sort((a, b) => a - b) };
    });

    if (mesure !== null) resultat.push({ route, ...mesure });
  }
  releve = resultat;
  return releve;
}

describe('les conteneurs partagent leurs largeurs', () => {
  test('§1 — ⚠️ les panneaux d’un écran partagent UNE largeur', async () => {
    const ecrans = await balayer();
    const fautifs = ecrans
      .filter((e) => e.panneaux.length > 1)
      .map((e) => `${e.route} → ${e.panneaux.join(' · ')} px`);
    assert.deepEqual(
      fautifs,
      [],
      'Sur ces écrans, les panneaux de premier niveau ont des largeurs DIFFÉRENTES. C’est le ' +
        'défaut signalé : « la largeur des conteneurs change même à l’intérieur de la même ' +
        'section ». Un panneau ne choisit pas sa largeur — c’est la page qui la donne ' +
        '(`#app .page > *` au bas de `css/style.css`).\n  · ' + fautifs.join('\n  · '),
    );
  });

  test('§2 — ⚠️ les champs prennent leurs largeurs dans un petit jeu', async () => {
    const ecrans = await balayer();
    const fautifs = ecrans
      .filter((e) => e.champs.length > LARGEURS_MAX)
      .map((e) => `${e.route} → ${String(e.champs.length)} largeurs : ${e.champs.join(' · ')} px`);
    assert.deepEqual(
      fautifs,
      [],
      `Ces écrans emploient plus de ${String(LARGEURS_MAX)} largeurs de champ. Le système à ` +
        'douze colonnes n’en offre que quatre — 12, 6, 4 et 3 parts —, donc une cinquième ' +
        'signifie qu’un conteneur s’est remis à décider tout seul. ⚠️ Ce ne sont pas des ' +
        'largeurs très différentes qui gênent : ce sont des largeurs PRESQUE identiques, que ' +
        'l’œil attrape sans pouvoir les nommer.\n  · ' + fautifs.join('\n  · '),
    );
  });

  test('§3 — LE BALAYAGE A DE LA MATIÈRE : des panneaux et des champs', async () => {
    // Sans cette moitié, les deux contrôles passeraient au vert sur un balayage
    // qui n’aurait rien trouvé à mesurer (constat Q-210).
    const ecrans = await balayer();
    assert.ok(ecrans.length >= 6, `seuls ${String(ecrans.length)} écrans mesurés`);
    const avecChamps = ecrans.filter((e) => e.champs.length > 0);
    assert.ok(
      avecChamps.length >= 5,
      `Seuls ${String(avecChamps.length)} écrans portent des champs larges : le balayage ne ` +
        'mesure plus les formulaires, et ses deux contrôles ne décident donc de rien.',
    );
  });
});
