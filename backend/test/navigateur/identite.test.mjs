/**
 * identite.test.mjs — la marque suit la filiale ACTIVE, jamais une constante.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le défaut mesuré, et ce que ce fichier éprouve
 * ════════════════════════════════════════════════════════════════════════
 *
 * `backend/db/CONVENTIONS.md` §33.4 : la marque de la maison mère était écrite
 * EN DUR dans dix fichiers du frontend, dont les vues imprimables et l'export
 * SVG de la matrice des risques — *« précisément les documents qu'un auditeur
 * aura entre les mains »* (`PLAN_SERVEUR` §6). Le correctif vit dans
 * `js/core/identite.js` : la raison sociale et le logo affichés viennent
 * TOUJOURS de la filiale que le serveur a résolue pour la session courante
 * (`Session`), jamais d'une chaîne recopiée.
 *
 * Le protocole voulu par ce lot est COMPORTEMENTAL — on affiche, on imprime,
 * on constate — jamais une expression régulière sur les sources, à UNE
 * exception près et assumée : le balayage §1 ci-dessous, dont l'objet est
 * précisément de garantir qu'aucune chaîne littérale ne survit ailleurs que
 * dans ce fichier. Il **découvre** les fichiers (récursion sur le disque),
 * il ne tient PAS la liste des dix fichiers de la porte S3 : cette liste
 * vieillirait le jour où un onzième fichier apparaîtrait avec la même faute.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi l'authentification RÉELLE, et pas la session provisoire
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/aide/serveur.mjs` le dit en toutes lettres : *« un essai qui porte sur
 * l'identité demande 'reelle' »*. La session provisoire du lot L2 résout
 * toujours la même filiale et n'a pas de sélecteur : elle ne peut pas fournir
 * les DEUX filiales distinctes que ce lot exige comme matière (« sans deux
 * filiales distinctes, le vert ne dit rien »). L'annuaire est donc le même
 * simulé que `test/filiales/selecteur.test.mjs` (`test/annuaire/serveur-ldap.mjs`),
 * et le compte est un compte RÉEL du jeu figé du `CONVENTIONS.md` §25.3 —
 * `rssi.groupe`, le seul des huit à porter deux filiales.
 *
 * ⚠️ **Les deux raisons sociales de ce jeu d'essai sont délibérément SANS
 * RAPPORT avec « Dedienne ».** `test/filiales/selecteur.test.mjs` nomme ses
 * filiales « Dedienne Aerospace Toulouse » / « Dedienne Deutschland » — ce qui
 * lui convient, mais conviendrait mal ICI : une chaîne codée en dur qui
 * contiendrait encore « Dedienne Aerospace » se fondrait dans une raison
 * sociale dynamique qui, elle, est censée le contenir. En choisissant deux
 * noms sans rapport, toute apparition de « Dedienne » dans le rendu ne peut
 * être QUE la marque codée en dur — jamais une coïncidence.
 *
 * Prérequis machine : PostgreSQL prêt ; Playwright + Chromium (`CLAUDE.md` §5) ;
 * sur SRV-Infra, `source ~/.grc-essais.env` avant `npm test`.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { RACINE_FRONTEND, moduleCompile, monterServeurReel } from '../aide/serveur.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

/**
 * Même borne que `test/navigateur/droits.test.mjs`, pour la même raison :
 * `npm test` joue plusieurs familles de navigateur EN PARALLÈLE, chacune avec
 * son propre Chromium, sur une machine partagée.
 */
const DELAI = 60_000;

const TLS = 'FIL-IDENT-TLS';
const DEU = 'FIL-IDENT-DEU';
const RAISON_TLS = 'Structures Occitanes SA';
const RAISON_DEU = 'Nordkraft Systeme GmbH';

const RSSI_GROUPE = { identifiant: 'rssi.groupe', motDePasse: 'rssi.groupe!2026' };

/** Un PNG valide, minimal (1×1) — pour prouver qu'un VRAI logo s'affiche. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
/** Un SVG qui porterait un script s'il était jamais rendu dans l'origine de l'application. */
const SVG_MALVEILLANT = '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__pwn_identite__=1;</script></svg>';

let base;
let doublure;
let serveur;
let application;
let navigateur;
let droits;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  doublure = await demarrerAnnuaire();
  droits = await moduleCompile('droits/index.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'TLS', $3, 'FR'),
             ($2, 'DEU', $4, 'DE')`,
        [TLS, DEU, RAISON_TLS, RAISON_DEU],
      );
      // Groupes AD ENGENDRÉS depuis la configuration, jamais écrits à la main
      // (`PLAN_SERVEUR` §3.4) — même geste que `deploy/` à l'installation, et
      // que `test/filiales/selecteur.test.mjs`.
      const attendus = droits.groupesAttendus(
        'GRC-',
        await droits.lireFilialesActives(c),
        await droits.lireProfilsActifs(c),
      );
      await droits.synchroniserGroupesAd(c, attendus);
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, {
    authentification: 'reelle',
    env: {
      LDAP_URL: doublure.url,
      LDAP_VERIFIER_CERTIFICAT: 'non',
      LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
      LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
      LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
    },
  });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await doublure?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — Balayage mécanique : découverte, pas une liste tenue à la main
 * ===================================================================== */

describe('§33.4 — balayage mécanique du frontend', () => {
  test('aucune occurrence de la marque en dur, et le mécanisme dynamique est réellement utilisé (≥ 5 fichiers)', () => {
    const fichiers = [];
    const empiler = (dir) => {
      for (const nom of readdirSync(dir)) {
        const chemin = join(dir, nom);
        const info = statSync(chemin);
        if (info.isDirectory()) { empiler(chemin); continue; }
        if (extname(nom) === '.js') fichiers.push(chemin);
      }
    };
    empiler(join(RACINE_FRONTEND, 'js'));
    fichiers.push(join(RACINE_FRONTEND, 'index.html'));

    // Garde-fou sur le balayage LUI-MÊME : un périmètre de recherche cassé
    // (mauvais chemin, extension mal filtrée) rendrait « rien trouvé » —
    // c'est-à-dire vert en n'éprouvant rien (`CLAUDE.md` §3).
    assert.ok(
      fichiers.length > 50,
      `Le balayage n'a découvert que ${String(fichiers.length)} fichier(s) sous ` +
        `${RACINE_FRONTEND} : le périmètre de recherche est probablement faux.`,
    );

    const marques = [];
    const mecanisme = [];
    for (const chemin of fichiers) {
      const contenu = readFileSync(chemin, 'utf8');
      if (contenu.includes('Dedienne')) marques.push(chemin);
      if (contenu.includes('Identite.')) mecanisme.push(chemin);
    }

    assert.deepEqual(
      marques,
      [],
      `La marque de la maison mère est encore codée en dur dans : ${marques.join(', ')}`,
    );
    // Un balayage qui ne trouverait le mécanisme nulle part serait vert sans
    // avoir rien éprouvé — c'est l'exigence explicite du lot : refuser de
    // passer en dessous de cinq fichiers.
    assert.ok(
      mecanisme.length >= 5,
      `Le mécanisme dynamique (« Identite. ») n'apparaît que dans ${String(mecanisme.length)} ` +
        `fichier(s) (${mecanisme.join(', ')}) : moins de cinq n'éprouve rien.`,
    );
  });
});

/* =====================================================================
 *  Outillage des essais de navigateur
 * ===================================================================== */

/**
 * Ouvre une page, s'authentifie par la VRAIE porte (`js/core/vault.js`,
 * `#login-form`) et attend que l'application ait démarré.
 *
 * ⚠️ **Pourquoi ce fichier pose SON PROPRE relais `/api/**`, en plus de celui
 * de `servirApplication()`** — et ce que ça n'est PAS : une modification du
 * banc partagé, hors périmètre de cet agent.
 *
 * Mesuré en écrivant cet essai : `test/aide/navigateur.mjs` (`servirApplication`)
 * ne transporte NI le `Cookie` de la requête NI le `Set-Cookie` de la réponse —
 * volontairement minimal, et personne ne l'avait sollicité avant : la session
 * provisoire de `droits.test.mjs` n'en a pas besoin, et
 * `test/filiales/selecteur.test.mjs` n'ouvre aucun navigateur (il rejoue
 * `serveur.appeler()` et réattache lui-même le cookie sur chaque appel). Un
 * essai d'AUTHENTIFICATION RÉELLE À TRAVERS UN NAVIGATEUR est le premier des
 * trois à avoir besoin des deux à la fois. Plutôt que de modifier un fichier
 * partagé avec deux autres agents (hors périmètre de ce lot), `brancherRelaisCookie`
 * vit ICI : elle intercepte `/api/**` côté navigateur (Playwright `page.route`,
 * jamais un second port HTTP) et rejoue chaque appel via `serveur.appeler()` —
 * déjà fourni par le banc, jamais réécrit —, en y attachant elle-même le cookie
 * de session. Le cookie n'est JAMAIS confié au magasin du navigateur : une
 * étiquette `Secure` posée par le serveur réel ne survivrait de toute façon pas
 * à l'origine `http://127.0.0.1` de ce banc.
 *
 * @param {{identifiant: string, motDePasse: string}} compte
 * @param {{avantNavigation?: (page: import('playwright').Page) => Promise<void>}} [options]
 *        `avantNavigation` pose des routes PLUS SPÉCIFIQUES qu'`/api/**`
 *        (donc prioritaires, Playwright essayant le dernier enregistrement
 *        d'abord) — pour les essais du §3, qui doivent intercepter le tout
 *        premier appel de `Identite.logo()`, déclenché au montage.
 */
function extraireCookie(setCookieBrut) {
  if (!setCookieBrut) return null;
  const valeur = Array.isArray(setCookieBrut) ? setCookieBrut[0] : setCookieBrut;
  // Seul le couple nom=valeur est retenu : les attributs (Secure, HttpOnly,
  // SameSite, Path…) ne servent à rien ici, ce cookie n'étant jamais confié au
  // magasin du navigateur — voir la note ci-dessus.
  return String(valeur).split(';')[0];
}

async function brancherRelaisCookie(page, etat) {
  await page.route('**/api/**', async (route) => {
    const requete = route.request();
    const url = new URL(requete.url());
    const corpsBrut = requete.postDataBuffer();
    const options = {};
    const entetesEnvoyees = {};
    if (corpsBrut && corpsBrut.length > 0) {
      entetesEnvoyees['content-type'] = requete.headers()['content-type'] ?? 'application/json';
      options.corps = corpsBrut.toString('utf8');
    }
    if (etat.cookie) entetesEnvoyees['cookie'] = etat.cookie;
    if (Object.keys(entetesEnvoyees).length > 0) options.entetes = entetesEnvoyees;

    const reponse = await serveur.appeler(requete.method(), url.pathname + url.search, options);
    const nouveauCookie = extraireCookie(reponse.entetes['set-cookie']);
    if (nouveauCookie) etat.cookie = nouveauCookie;

    const corpsReponse = typeof reponse.corps === 'string' ? reponse.corps : JSON.stringify(reponse.corps);
    await route.fulfill({
      status: reponse.statut,
      contentType: reponse.entetes['content-type'] ?? 'application/json',
      body: corpsReponse,
    });
  });
}

/**
 * Bruit ATTENDU de tout essai d'authentification réelle, jamais un défaut :
 *
 *  · `401` — le contrôle silencieux « suis-je déjà connecté ? » que
 *    `Vault.connecter()` tente avant d'afficher le formulaire (`CLAUDE.md` §5 :
 *    un refus volontaire du serveur n'est pas une erreur, `erreursInattendues`
 *    existe pour distinguer les deux) ;
 *  · `403` — `GET /api/pieces/logo` pour un profil sans le domaine
 *    `administration` : mesuré à l'écriture de cet essai, c'est le cas de
 *    `rssi.groupe` (RSSI), et c'est très exactement ce que `Identite.logo()`
 *    est fait pour absorber. Voir le rapport de ce lot.
 */
const BRUIT_ATTENDU = ['401 (Unauthorized)', '403 (Forbidden)'];

async function ouvrirEtConnecter(compte, options = {}) {
  const p = await ouvrirPage(navigateur);
  const etatCookie = { cookie: null };
  await brancherRelaisCookie(p.page, etatCookie);
  if (options.avantNavigation) await options.avantNavigation(p.page);
  await p.page.goto(application.url, { waitUntil: 'domcontentloaded' });
  await p.page.waitForSelector('#login-identifiant', { timeout: DELAI });
  await p.page.fill('#login-identifiant', compte.identifiant);
  await p.page.fill('#login-motdepasse', compte.motDePasse);
  await p.page.click('#login-btn');
  const etat = await attendreApplication(p.page, { delai: DELAI });
  assert.equal(
    etat,
    'chargee',
    `L'application ne démarre pas après connexion de ${compte.identifiant} : ` +
      JSON.stringify(p.erreursInattendues(BRUIT_ATTENDU)),
  );
  return p;
}

/** Déclenche l'export SVG de la matrice et rend son contenu texte. */
async function recupererExportSvg(page) {
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#matrixExportSvgBtn'),
  ]);
  const flux = await telechargement.createReadStream();
  const morceaux = [];
  for await (const morceau of flux) morceaux.push(morceau);
  return Buffer.concat(morceaux).toString('utf8');
}

/* =====================================================================
 *  §2 — Deux filiales, deux identités rendues : la mesure qui compte
 * ===================================================================== */

describe('§33.4 — deux filiales de session, deux identités affichées', () => {
  test('barre latérale, impression et export SVG suivent la filiale active — jamais une constante', async (t) => {
    const p = await ouvrirEtConnecter(RSSI_GROUPE);
    try {
      await attendreQuiescence(p.page, { delai: DELAI });

      // ── EXIGENCE DE MATIÈRE : sans deux filiales, rien à basculer ───────
      const nbOptions = await p.page.locator('#filiale-selector option').count();
      assert.equal(
        nbOptions,
        2,
        'rssi.groupe doit porter deux filiales dans ce jeu d’essai, sinon rien à basculer.',
      );

      const texteDepart = (await p.page.locator('#brandText').innerText()).trim();
      assert.ok(
        [RAISON_TLS, RAISON_DEU].includes(texteDepart),
        `Texte de marque inattendu dans la barre latérale : "${texteDepart}".`,
      );
      assert.ok(!texteDepart.includes('Dedienne'));
      t.diagnostic(`filiale de départ : ${texteDepart}`);

      const titreDepart = await p.page.title();
      assert.ok(
        titreDepart.includes(texteDepart),
        `Le titre d'onglet ne reprend pas la raison sociale affichée : "${titreDepart}".`,
      );
      assert.ok(!titreDepart.includes('Dedienne'));

      // ── Vue imprimable (fiches réflexes de crise, sans dépendance de données) ──
      await p.page.evaluate(() => Router.navigateTo('/crise-fiches'));
      await p.page.waitForSelector('.print-head p', { state: 'attached' });
      const impressionDepart = await p.page.locator('.print-head p').textContent();
      assert.ok(
        impressionDepart.includes(texteDepart),
        `L'impression ne reprend pas la raison sociale de la barre latérale : "${impressionDepart}".`,
      );
      assert.ok(!impressionDepart.includes('Dedienne'));

      // ── Export SVG de la matrice des risques ────────────────────────────
      await p.page.evaluate(() => Router.navigateTo('/matrice'));
      await p.page.waitForSelector('#matrixExportSvgBtn', { timeout: DELAI });
      const svgDepart = await recupererExportSvg(p.page);
      assert.ok(
        svgDepart.includes(texteDepart),
        'Le texte de marque de l’export SVG ne reprend pas la raison sociale affichée.',
      );
      assert.ok(!svgDepart.includes('Dedienne'));

      // ── Bascule vers l'AUTRE filiale du périmètre ───────────────────────
      await p.page.evaluate(() => Router.navigateTo('/crise-fiches'));
      await p.page.waitForSelector('.print-head p', { state: 'attached' });
      const valeurs = await p.page
        .locator('#filiale-selector option')
        .evaluateAll((options) => options.map((o) => o.value));
      const valeurActuelle = await p.page.locator('#filiale-selector').inputValue();
      const autreValeur = valeurs.find((v) => v !== valeurActuelle);
      assert.ok(autreValeur, 'Aucune autre filiale à rejoindre : la matière manque.');

      await p.page.selectOption('#filiale-selector', autreValeur);
      await p.page.waitForFunction(
        (texte) => document.getElementById('brandText')?.textContent?.trim() !== texte,
        texteDepart,
        { timeout: DELAI },
      );
      await attendreQuiescence(p.page, { delai: DELAI });

      const texteArrivee = (await p.page.locator('#brandText').innerText()).trim();
      assert.ok([RAISON_TLS, RAISON_DEU].includes(texteArrivee));
      assert.notEqual(texteArrivee, texteDepart, 'La bascule devait changer la raison sociale affichée.');
      assert.ok(!texteArrivee.includes('Dedienne'));
      t.diagnostic(`filiale d’arrivée : ${texteArrivee}`);

      // La vue imprimable est restée ouverte (route sans identifiant : la
      // bascule redessine sur place, `js/app.js`) — elle doit montrer la
      // NOUVELLE raison sociale, jamais l'ancienne.
      await p.page.waitForFunction(
        (texte) => document.querySelector('.print-head p')?.textContent?.includes(texte),
        texteArrivee,
        { timeout: DELAI },
      );
      const impressionArrivee = await p.page.locator('.print-head p').textContent();
      assert.ok(impressionArrivee.includes(texteArrivee));
      assert.ok(
        !impressionArrivee.includes(texteDepart),
        'L’impression montre encore la raison sociale de la filiale quittée.',
      );

      // Export SVG à nouveau, côté DEUXIÈME filiale.
      await p.page.evaluate(() => Router.navigateTo('/matrice'));
      await p.page.waitForSelector('#matrixExportSvgBtn', { timeout: DELAI });
      const svgArrivee = await recupererExportSvg(p.page);
      assert.ok(svgArrivee.includes(texteArrivee));
      assert.ok(!svgArrivee.includes(texteDepart));
      assert.ok(!svgArrivee.includes('Dedienne'));

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), [], 'Aucune erreur de script ni de console attendue.');
    } finally {
      await p.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Logo : PNG/JPEG affiché, absence repliée sur le texte, SVG refusé
 * ===================================================================== */

describe('§33.4 — logo de filiale', () => {
  test('sans logo déposé : ni image, ni marque de la maison mère — la raison sociale seule', async () => {
    // Aucune route interceptée : ce jeu d'essai n'a JAMAIS déposé de logo, et
    // c'est le vrai serveur qui répond (liste vide, ou route absente — les
    // deux rendent le même repli, voir `js/core/identite.js`).
    const p = await ouvrirEtConnecter(RSSI_GROUPE);
    try {
      await attendreQuiescence(p.page, { delai: DELAI });
      const logo = p.page.locator('#brandLogo');
      assert.equal(await logo.isHidden(), true, 'Sans logo déposé, l’image de marque doit rester masquée.');
      const src = await logo.getAttribute('src');
      assert.ok(
        !src,
        `L'image de marque porte une adresse alors qu'aucun logo n'a été déposé : "${String(src)}".`,
      );
      // Aucune trace de l'ancien atout statique de la maison mère, nulle part.
      const dedienneImg = await p.page.locator('img[src*="dedienne" i]').count();
      assert.equal(dedienneImg, 0, 'Un <img> pointe encore vers un atout de la maison mère.');
      const texte = (await p.page.locator('#brandText').innerText()).trim();
      assert.ok([RAISON_TLS, RAISON_DEU].includes(texte));
      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });

  test('un logo PNG déposé s’affiche via une URL d’objet, le texte reste présent à côté', async () => {
    const p = await ouvrirEtConnecter(RSSI_GROUPE, {
      avantNavigation: async (page) => {
        await page.route('**/api/pieces/logo', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              pieces: [
                {
                  id: 'PJ-LOGO-PNG',
                  nom_fichier: 'logo.png',
                  type_mime: 'image/png',
                  taille_octets: PNG_1PX.length,
                  etat_analyse: 'saine',
                  quarantaine: false,
                  cree_le: new Date().toISOString(),
                },
              ],
            }),
          }));
        await page.route('**/api/pieces/logo/*', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'image/png',
            headers: { 'content-disposition': 'attachment; filename="logo.png"' },
            body: PNG_1PX,
          }));
      },
    });
    try {
      await attendreQuiescence(p.page, { delai: DELAI });
      await p.page.waitForFunction(() => document.getElementById('brandLogo')?.hidden === false, null, {
        timeout: DELAI,
      });
      const src = await p.page.locator('#brandLogo').getAttribute('src');
      assert.ok(src && src.startsWith('blob:'), `Le logo n'a pas été rendu via une URL d'objet : "${String(src)}".`);
      // Le texte ne disparaît JAMAIS au profit du logo (repli visible, §33.4).
      const texte = (await p.page.locator('#brandText').innerText()).trim();
      assert.ok([RAISON_TLS, RAISON_DEU].includes(texte));
      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });

  test('un logo dont le contenu est un SVG n’est JAMAIS rendu, même si le serveur le laissait passer', async () => {
    const p = await ouvrirEtConnecter(RSSI_GROUPE, {
      avantNavigation: async (page) => {
        await page.route('**/api/pieces/logo', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              pieces: [
                {
                  id: 'PJ-LOGO-SVG',
                  nom_fichier: 'logo.svg',
                  type_mime: 'image/svg+xml',
                  taille_octets: SVG_MALVEILLANT.length,
                  etat_analyse: 'saine',
                  quarantaine: false,
                  cree_le: new Date().toISOString(),
                },
              ],
            }),
          }));
        await page.route('**/api/pieces/logo/*', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'image/svg+xml',
            headers: { 'content-disposition': 'attachment; filename="logo.svg"' },
            body: SVG_MALVEILLANT,
          }));
      },
    });
    try {
      await attendreQuiescence(p.page, { delai: DELAI });
      // `Identite.logo()` est le point d'entrée UNIQUE : l'appeler à nouveau
      // rend la promesse déjà réglée au montage (mise en cache par filiale) —
      // déterministe, sans délai arbitraire.
      const resultat = await p.page.evaluate(() => window.Identite.logo());
      assert.equal(
        resultat,
        null,
        'Identite.logo() a rendu une URL pour un contenu SVG : la garde de type a été contournée.',
      );
      const logo = p.page.locator('#brandLogo');
      assert.equal(await logo.isHidden(), true, 'Un SVG a rendu l’image de marque visible.');
      const src = await logo.getAttribute('src');
      assert.ok(
        !src || !src.startsWith('blob:'),
        `L'image de marque porte une URL d'objet pour un contenu SVG : "${String(src)}".`,
      );
      assert.ok(
        !(await p.page.content()).includes('__pwn_identite__'),
        'Le script porté par le SVG forgé apparaît dans le document.',
      );
      const texte = (await p.page.locator('#brandText').innerText()).trim();
      assert.ok([RAISON_TLS, RAISON_DEU].includes(texte));
      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });
});
