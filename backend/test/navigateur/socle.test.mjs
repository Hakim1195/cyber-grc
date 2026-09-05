/**
 * socle.test.mjs — **le socle de risques et le périmètre normatif, éprouvés
 * dans un vrai navigateur, contre le vrai serveur et un vrai annuaire.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'essai central est DIFFÉRENTIEL, et il ne peut pas être autre chose
 * ════════════════════════════════════════════════════════════════════════
 *
 * `backend/test/api/socle-risques.test.mjs` porte en tête l'erreur que cet
 * essai-ci reproduit un cran plus haut, dans l'interface : le 04/09/2026, la
 * fonctionnalité a été déclarée bonne parce qu'un administrateur créait une
 * entrée et qu'un RSSI de site la voyait. **C'était faux.** L'entrée avait été
 * écrite sans `portee: 'groupe'`, donc dans la filiale de l'administrateur : le
 * RSSI la voyait parce qu'elle était **chez lui**.
 *
 * Les deux situations rendent exactement la même chose — « une entrée
 * visible ». Seule leur DIFFÉRENCE les distingue :
 *
 *   · une entrée créée AU SOCLE par l'administration Groupe est vue depuis une
 *     filiale **qui n'est pas celle de son auteur** ;
 *   · une entrée créée LOCALEMENT par le même auteur, au même moment, dans le
 *     même écran, ne l'est pas.
 *
 * Le second membre n'est pas un supplément : sans lui, le premier est vrai
 * d'une application qui ne cloisonne rien.
 *
 * ⚠️ **Et la portée est lue EN BASE, jamais dans la réponse.** `filiale_id` est
 * retiré de tout ce que l'API rend (`src/entites/index.ts`, `champsExposes`) :
 * un essai qui se fierait au corps de la réponse ne pourrait pas distinguer les
 * deux cas, c'est-à-dire pas mesurer la seule chose qui compte.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi l'authentification RÉELLE
 * ════════════════════════════════════════════════════════════════════════
 *
 * La session provisoire du lot L2 résout toujours la même filiale et ne porte
 * pas l'administration Groupe : elle ne peut fournir NI les deux filiales
 * distinctes qu'exige le différentiel, NI l'asymétrie de droits que le §2
 * mesure. L'annuaire est le simulé du `CONVENTIONS.md` §25.3
 * (`test/annuaire/serveur-ldap.mjs`), et les comptes sont ceux de son jeu figé :
 *
 *   · `admin` — le seul des huit à poser le drapeau Groupe : `administration_groupe`
 *     vrai, donc le seul qui puisse écrire `portee: 'groupe'` ;
 *   · `rssi.tls` — une filiale, et une seule : le seul qui donne un sens à
 *     « il ne voit pas ce qui est chez le voisin ».
 *
 * Mesuré à l'écriture de cet essai, et c'est ce qui rend le différentiel
 * possible : **la filiale active d'`admin` n'est pas celle de `rssi.tls`**. Le
 * §1 le vérifie explicitement plutôt que de le supposer — le jour où la
 * résolution changerait d'ordre, l'essai dirait pourquoi il ne mesure plus rien
 * au lieu de passer au vert.
 *
 * Prérequis machine : PostgreSQL prêt ; Playwright + Chromium (`CLAUDE.md` §5) ;
 * sur SRV-Infra, `source ~/.grc-essais.env` avant `npm test`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

/** Même borne que les autres familles de navigateur : `npm test` en joue plusieurs en parallèle. */
const DELAI = 60_000;

const TLS = 'FIL-SOC-TLS';
const DEU = 'FIL-SOC-DEU';

const ADMIN = { identifiant: 'admin', motDePasse: 'admin!2026' };
const RSSI_TLS = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };
/** Groupe EN LECTURE, aucune écriture nulle part : le profil qui éprouve la courtoisie inverse. */
const DIRECTION = { identifiant: 'direction', motDePasse: 'direction!2026' };

/**
 * Bruit ATTENDU de tout essai d'authentification réelle, jamais un défaut :
 * le `401` du contrôle silencieux « suis-je déjà connecté ? » que
 * `Vault.connecter()` tente avant d'afficher le formulaire, et le `403` de
 * `GET /api/pieces/logo` pour un profil sans le domaine `administration`.
 * Le §3 y ajoute un `403` qu'il PROVOQUE lui-même, et le dit.
 */
const BRUIT_ATTENDU = ['401 (Unauthorized)', '403 (Forbidden)'];

/** Noms uniques : plusieurs essais écrivent dans le même catalogue. */
const NOM_SOCLE = 'Compromission de la chaîne de mise à jour';
const NOM_LOCAL = 'Grève portuaire, site de l’administrateur';
const NOM_HOSTILE = '<img src=x onerror="window.__pwn_socle__=1">';

let base;
let proprietaire;
let doublure;
let serveur;
let application;
let navigateur;
let droits;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  doublure = await demarrerAnnuaire();
  droits = await moduleCompile('droits/index.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'TLS', 'Atelier Garonne SA', 'FR'),
             ($2, 'DEU', 'Werkstatt Elbe GmbH', 'DE')`,
        [TLS, DEU],
      );
      // Groupes AD ENGENDRÉS depuis la configuration, jamais écrits à la main
      // (`PLAN_SERVEUR` §3.4) : le geste que `deploy/` rejoue à l'installation.
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
 *  Outillage
 * ===================================================================== */

/**
 * Lecture EN BASE, avec un périmètre qui couvre les DEUX filiales et
 * l'administration Groupe : sans lui, `force row level security` s'applique au
 * propriétaire lui-même et la requête rendrait zéro ligne **en silence** — un
 * essai vert qui n'aurait rien eu à compter.
 */
function enBase(fn) {
  return base.avecPerimetre(
    proprietaire,
    perimetre('temoin-socle', TLS, [TLS, DEU], true),
    fn,
  );
}

/** Portée réelle d'une entrée du catalogue : `'groupe'` ou l'identifiant de filiale. */
async function porteeEnBase(nom) {
  const lignes = await enBase(async (c) => {
    const { rows } = await c.query('select filiale_id from risque_catalogue where nom = $1', [nom]);
    return rows;
  });
  assert.equal(lignes.length, 1, `« ${nom} » : ${lignes.length} ligne(s) au lieu d’une.`);
  return lignes[0].filiale_id === null ? 'groupe' : lignes[0].filiale_id;
}

/** L'activation d'un référentiel, telle que la base la porte, pour une filiale. */
async function activationEnBase(filiale, refId) {
  const lignes = await enBase(async (c) => {
    const { rows } = await c.query(
      `select actif, origine, obligatoire, motif,
              date_activation::text as date_activation,
              date_desactivation::text as date_desactivation
         from referentiels_actifs where filiale_id = $1 and ref_id = $2`,
      [filiale, refId],
    );
    return rows;
  });
  return lignes[0] ?? null;
}

/** Ouvre une page, s'authentifie par la VRAIE porte et attend le démarrage. */
async function connecter(compte) {
  const p = await ouvrirPage(navigateur);
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

/** Va sur une route par le hash, comme le ferait un clic de menu. */
async function naviguer(page, route) {
  await page.evaluate((r) => { window.location.hash = '#' + r; }, route);
}

/** Attend que `#/socle` ait fini de lire le serveur (et non un délai fixe). */
async function attendreSocle(page) {
  await page.waitForSelector('#socleCorps', { timeout: DELAI });
  await page.waitForFunction(
    () => {
      const hote = document.getElementById('socleCorps');
      return hote !== null && !hote.textContent.includes('Lecture du catalogue');
    },
    null,
    { timeout: DELAI },
  );
}

/** Attend que `#/referentiels-actifs` ait fini de lire le serveur. */
async function attendreReferentiels(page) {
  await page.waitForSelector('#rfaCorps', { timeout: DELAI });
  await page.waitForFunction(
    () => {
      const hote = document.getElementById('rfaCorps');
      return hote !== null && !hote.textContent.includes('Lecture des référentiels applicables');
    },
    null,
    { timeout: DELAI },
  );
}

/** Les noms de risque que CETTE session voit à l'écran. */
function nomsAffiches(page) {
  return page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('#socleCorps .soc-nom'), (n) => n.textContent));
}

/** Remplit le panneau de saisie du socle et enregistre. */
async function saisirRisque(page, valeurs) {
  await page.waitForSelector('#socleNom', { timeout: DELAI });
  await page.fill('#socleNom', valeurs.nom);
  if (valeurs.reference !== undefined) await page.fill('#socleReference', valeurs.reference);
  if (valeurs.categorie !== undefined) await page.fill('#socleCategorie', valeurs.categorie);
  await page.click('#socleEnregistrer');
}

/** Attend qu'un message de résultat apparaisse, et rend son texte + son ton. */
async function attendreMessage(page, hote) {
  await page.waitForFunction(
    (id) => {
      const zone = document.getElementById(id);
      return zone !== null && zone.textContent.trim().length > 0;
    },
    hote,
    { timeout: DELAI },
  );
  return page.evaluate((id) => {
    const zone = document.getElementById(id);
    const boite = zone.querySelector('.grp-message');
    return { texte: zone.textContent.trim(), classe: boite ? boite.className : '' };
  }, hote);
}

/* =====================================================================
 *  §1 — LE DIFFÉRENTIEL : ce qui distingue le socle d'un ajout local
 * ===================================================================== */

describe('§1 — une entrée du socle traverse les filiales, un ajout local non', () => {
  test('l’administration Groupe crée AU SOCLE et DANS SA FILIALE ; une autre filiale ne voit que la première', async (t) => {
    const admin = await connecter(ADMIN);
    let site = null;
    try {
      await attendreQuiescence(admin.page, { delai: DELAI });

      // ── EXIGENCE DE MATIÈRE ────────────────────────────────────────────
      // Si la filiale active de l'administrateur ÉTAIT celle du RSSI, la
      // seconde moitié de l'essai serait vraie sans rien démontrer : le RSSI ne
      // verrait pas l'ajout local pour de mauvaises raisons. On le vérifie.
      const contexte = await admin.page.evaluate(() => {
        const s = Session.courante();
        return { filiale: s.filialeId, admin: s.administrationGroupe };
      });
      assert.equal(contexte.admin, true, 'Le compte « admin » doit porter l’administration Groupe.');
      assert.notEqual(
        contexte.filiale,
        TLS,
        'La filiale active de l’administrateur doit différer de celle du RSSI de site, ' +
          'sinon le différentiel ne différencie rien.',
      );
      t.diagnostic(`filiale active de l’administrateur : ${contexte.filiale}`);

      await naviguer(admin.page, '/socle');
      await attendreSocle(admin.page);

      // ── (a) une entrée AU SOCLE ────────────────────────────────────────
      await admin.page.click('#socleAjouterGroupe');
      await saisirRisque(admin.page, {
        nom: NOM_SOCLE,
        reference: 'R-001',
        categorie: 'Malveillance',
      });
      const retourSocle = await attendreMessage(admin.page, 'socleMessage');
      assert.match(retourSocle.classe, /grp-message--ok/u, `Message inattendu : ${retourSocle.texte}`);

      // LA lecture qui tranche : la portée vient de la BASE. Sans elle, tout ce
      // qui suit passerait pour de bonnes raisons ou pour de mauvaises, sans
      // qu'on puisse le dire.
      assert.equal(
        await porteeEnBase(NOM_SOCLE),
        'groupe',
        'Sans « portee: groupe », la ligne serait écrite dans la filiale ACTIVE de son ' +
          'auteur — et elle aurait l’air d’un socle pour lui seul.',
      );

      // ── (b) une entrée LOCALE, même écran, même auteur, même instant ────
      await attendreSocle(admin.page);
      await admin.page.click('#socleAjouterFiliale');
      await saisirRisque(admin.page, { nom: NOM_LOCAL, categorie: 'Environnement' });
      const retourLocal = await attendreMessage(admin.page, 'socleMessage');
      assert.match(retourLocal.classe, /grp-message--ok/u, `Message inattendu : ${retourLocal.texte}`);
      assert.equal(
        await porteeEnBase(NOM_LOCAL),
        contexte.filiale,
        'Une création sans portée doit rester dans la filiale active.',
      );

      // ── (c) LE DIFFÉRENTIEL, vu depuis l'AUTRE filiale ──────────────────
      site = await connecter(RSSI_TLS);
      const filialeSite = await site.page.evaluate(() => Session.courante().filialeId);
      assert.equal(filialeSite, TLS);

      await naviguer(site.page, '/socle');
      await attendreSocle(site.page);
      const vus = await nomsAffiches(site.page);

      assert.ok(
        vus.includes(NOM_SOCLE),
        `Le RSSI de ${TLS} doit voir l’entrée écrite AU SOCLE depuis une autre filiale. ` +
          `Vu : ${JSON.stringify(vus)}`,
      );
      assert.equal(
        vus.includes(NOM_LOCAL),
        false,
        'Le RSSI de TLS ne doit RIEN voir de l’ajout local de l’administrateur. S’il le ' +
          'voyait, la portée « filiale » ne voudrait rien dire — et l’assertion précédente ' +
          'serait vraie pour la mauvaise raison.',
      );

      assert.deepEqual(admin.erreursInattendues(BRUIT_ATTENDU), []);
      assert.deepEqual(site.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await site?.fermer();
      await admin.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — L'offre est asymétrique, et la barrière est ailleurs
 * ===================================================================== */

describe('§2 — « Ajouter au socle » n’est proposé qu’à qui en a le droit', () => {
  test('le RSSI de site ne se le voit PAS proposer, l’administration Groupe SI', async () => {
    const site = await connecter(RSSI_TLS);
    let admin = null;
    try {
      await naviguer(site.page, '/socle');
      await attendreSocle(site.page);

      const chezLeSite = await site.page.evaluate(() => ({
        groupe: document.getElementById('socleAjouterGroupe') !== null,
        filiale: document.getElementById('socleAjouterFiliale') !== null,
      }));

      assert.equal(
        chezLeSite.groupe,
        false,
        'Proposer « Ajouter au socle du Groupe » à un RSSI de site est un geste qui sera ' +
          'refusé : l’écran ne doit pas l’offrir.',
      );
      // ── EXIGENCE DE MATIÈRE : sans elle, « le bouton est absent » serait
      //    aussi vrai d'un écran cassé pour tout le monde.
      assert.equal(
        chezLeSite.filiale,
        true,
        'Le RSSI doit tout de même pouvoir ajouter à SA filiale, sinon l’absence mesurée ' +
          'plus haut ne prouve qu’une page vide.',
      );

      admin = await connecter(ADMIN);
      await naviguer(admin.page, '/socle');
      await attendreSocle(admin.page);
      const chezAdmin = await admin.page.evaluate(
        () => document.getElementById('socleAjouterGroupe') !== null);
      assert.equal(
        chezAdmin,
        true,
        'L’administration Groupe doit se voir proposer l’ajout au socle : sans les deux ' +
          'moitiés, on mesure une absence, pas une asymétrie.',
      );

      assert.deepEqual(site.erreursInattendues(BRUIT_ATTENDU), []);
      assert.deepEqual(admin.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await admin?.fermer();
      await site.fermer();
    }
  });

  test('le serveur refuse la portée Groupe à un RSSI de site, et RIEN n’est écrit', async () => {
    // L'interface n'est pas la barrière : on interroge le serveur lui-même, à
    // travers la session du navigateur, comme le ferait un client bricolé.
    const site = await connecter(RSSI_TLS);
    try {
      const avant = await enBase(async (c) => {
        const { rows } = await c.query('select count(*)::int as n from risque_catalogue');
        return rows[0].n;
      });
      assert.ok(avant > 0, 'Matière : le catalogue doit déjà porter quelque chose.');

      const refus = await site.page.evaluate(async () => {
        const reponse = await fetch('api/entites/risque_catalogue', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ champs: { nom: 'Tentative de socle par un site' }, portee: 'groupe' }),
          credentials: 'same-origin',
        });
        return { statut: reponse.status, corps: await reponse.json() };
      });

      assert.equal(refus.statut, 403, JSON.stringify(refus.corps));
      assert.equal(refus.corps.erreur, 'hors_perimetre');

      const apres = await enBase(async (c) => {
        const { rows } = await c.query(
          "select count(*)::int as n from risque_catalogue where nom = 'Tentative de socle par un site'");
        return rows[0].n;
      });
      assert.equal(apres, 0, 'Un refus qui laisserait une ligne derrière lui serait pire que pas de refus.');
    } finally {
      await site.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Le droit peut changer ENTRE l'affichage et le clic
 * ===================================================================== */

describe('§3 — un 403 tombé après l’affichage n’efface pas la saisie', () => {
  test('le refus du serveur est montré tel quel, et le formulaire reste rempli', async () => {
    const admin = await connecter(ADMIN);
    try {
      await naviguer(admin.page, '/socle');
      await attendreSocle(admin.page);

      // Les groupes AD d'un utilisateur bougent pendant qu'il travaille : le
      // bouton était légitime à l'affichage et ne l'est plus au clic. On rejoue
      // exactement la réponse du serveur dans ce cas — mesurée au §2.
      await admin.page.route('**/api/entites/risque_catalogue', async (route) => {
        if (route.request().method() !== 'POST') { await route.continue(); return; }
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            erreur: 'hors_perimetre',
            message: 'La création d’un enregistrement de portée Groupe est réservée à une ' +
              'administration Groupe : ce que vous écrivez ici s’appliquerait à toutes les filiales.',
          }),
        });
      });

      await admin.page.click('#socleAjouterGroupe');
      await saisirRisque(admin.page, { nom: 'Saisie qui ne doit pas disparaître', categorie: 'Malveillance' });

      const retour = await attendreMessage(admin.page, 'socleMessage');
      assert.match(retour.classe, /grp-message--refus/u, `Ton inattendu : ${retour.texte}`);
      assert.match(
        retour.texte,
        /administration Groupe/u,
        'Le message du SERVEUR doit être affiché tel quel : lui seul connaît la portée de ' +
          `la ligne visée. Vu : ${retour.texte}`,
      );

      const saisie = await admin.page.evaluate(() => {
        const nom = document.getElementById('socleNom');
        const categorie = document.getElementById('socleCategorie');
        return { nom: nom ? nom.value : null, categorie: categorie ? categorie.value : null };
      });
      assert.equal(
        saisie.nom,
        'Saisie qui ne doit pas disparaître',
        'Un refus qui efface la saisie fait payer à l’utilisateur une décision d’annuaire ' +
          'prise ailleurs (même famille que les constats Q-29 et Q-134).',
      );
      assert.equal(saisie.categorie, 'Malveillance');

      await admin.page.unroute('**/api/entites/risque_catalogue');

      // Aucune exception de script : un refus attendu produit un `403` en
      // console, jamais un gestionnaire cassé.
      assert.deepEqual(admin.erreursScript, []);
    } finally {
      await admin.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — L'écran ne cote pas, et il n'injecte pas
 * ===================================================================== */

describe('§4 — ce que l’écran refuse de faire', () => {
  test('aucun champ d’évaluation : le socle porte la définition, la filiale porte l’exposition', async () => {
    const admin = await connecter(ADMIN);
    try {
      await naviguer(admin.page, '/socle');
      await attendreSocle(admin.page);
      await admin.page.click('#socleAjouterFiliale');
      await admin.page.waitForSelector('#socleNom', { timeout: DELAI });

      // Un champ de cotation ajouté ici rendrait vingt filiales incomparables en
      // une livraison : le formulaire est balayé, on ne se fie pas à une relecture.
      const champs = await admin.page.evaluate(() =>
        Array.prototype.map.call(
          document.querySelectorAll('#soclePanneau input, #soclePanneau select, #soclePanneau textarea'),
          (e) => e.id));
      assert.ok(champs.length >= 5, `Matière : le formulaire doit porter des champs. Vu : ${champs}`);
      for (const interdit of ['socleFrequence', 'socleGravite', 'socleMaitrise', 'socleScore']) {
        assert.equal(champs.includes(interdit), false, `« ${interdit} » n’a rien à faire ici.`);
      }
      const texte = await admin.page.evaluate(() => document.getElementById('soclePanneau').textContent);
      assert.match(texte, /ne cote pas le risque/u, 'La règle doit être écrite à l’écran, pas seulement dans le code.');
    } finally {
      await admin.fermer();
    }
  });

  test('un nom hostile est affiché, jamais exécuté', async () => {
    const admin = await connecter(ADMIN);
    try {
      await naviguer(admin.page, '/socle');
      await attendreSocle(admin.page);
      const avant = await admin.page.evaluate(
        () => document.querySelectorAll('#socleCorps tbody tr').length);

      await admin.page.click('#socleAjouterFiliale');
      await saisirRisque(admin.page, { nom: NOM_HOSTILE, categorie: 'Malveillance' });
      const retour = await attendreMessage(admin.page, 'socleMessage');
      assert.match(retour.classe, /grp-message--ok/u, retour.texte);

      // ⚠️ On attend que la LIGNE existe — pas que son texte soit celui qu'on
      // espère. Attendre le texte échappé ferait de l'injection un DÉPASSEMENT
      // DE DÉLAI de soixante secondes dont le message ne parle pas d'injection :
      // mesuré en mutant `esc(e.nom)` en `e.nom`. Un essai doit rougir vite et
      // dire pourquoi.
      await admin.page.waitForFunction(
        (n) => document.querySelectorAll('#socleCorps tbody tr').length > n,
        avant,
        { timeout: DELAI },
      );

      const verdict = await admin.page.evaluate((nom) => ({
        pwn: window.__pwn_socle__ === undefined ? null : window.__pwn_socle__,
        images: document.querySelectorAll('#socleCorps img').length,
        litteral: Array.prototype.map.call(
          document.querySelectorAll('#socleCorps .soc-nom'), (e) => e.textContent).includes(nom),
      }), NOM_HOSTILE);

      assert.equal(verdict.images, 0,
        'Une balise est née d’un nom de risque : le nom n’est pas échappé avant injection en DOM.');
      assert.equal(verdict.pwn, null,
        'Le gestionnaire « onerror » du nom s’est exécuté : le nom n’est pas échappé.');
      assert.equal(verdict.litteral, true,
        'Le nom doit apparaître LITTÉRALEMENT dans la cellule — échappé, donc lisible et inerte.');
      assert.deepEqual(admin.erreursScript, []);
    } finally {
      await admin.fermer();
    }
  });
});

/* =====================================================================
 *  §5 — Le périmètre normatif : activer, retirer, et NE PAS déborder
 * ===================================================================== */

describe('§5 — quels référentiels s’appliquent ICI (constat Q-150)', () => {
  test('la distinction avec le « non applicable » est écrite à l’écran', async () => {
    const site = await connecter(RSSI_TLS);
    try {
      await naviguer(site.page, '/referentiels-actifs');
      await attendreReferentiels(site.page);
      const texte = await site.page.evaluate(() => document.querySelector('.page').textContent);
      assert.match(texte, /non applicable/u);
      assert.match(texte, /périmètre de ce site/u);
      assert.deepEqual(site.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await site.fermer();
    }
  });

  test('activer chez l’une, activer chez l’autre, retirer chez l’une : l’autre n’est pas touchée', async (t) => {
    const site = await connecter(RSSI_TLS);
    let admin = null;
    try {
      // ── (a) TLS met NIS2 dans son périmètre ────────────────────────────
      await naviguer(site.page, '/referentiels-actifs');
      await attendreReferentiels(site.page);
      await site.page.click('.rfa-activer[data-ref="nis2-art21"]');
      await site.page.waitForSelector('#rfaMotif', { timeout: DELAI });
      await site.page.fill('#rfaMotif', 'Entité essentielle au titre de NIS2.');
      await site.page.click('#rfaValider');
      const retourTls = await attendreMessage(site.page, 'rfaMessage');
      assert.match(retourTls.classe, /grp-message--ok/u, retourTls.texte);

      const apresActivationTls = await activationEnBase(TLS, 'nis2-art21');
      assert.ok(apresActivationTls, 'Aucune ligne écrite pour TLS : rien à mesurer.');
      assert.equal(apresActivationTls.actif, true);
      assert.equal(apresActivationTls.origine, 'ajout_local');
      assert.equal(apresActivationTls.motif, 'Entité essentielle au titre de NIS2.');
      assert.ok(apresActivationTls.date_activation, 'Une activation sans date ne se justifie pas devant un auditeur.');

      // ── (b) l'AUTRE filiale l'active aussi — c'est le TÉMOIN ────────────
      // Sans lui, « la désactivation de TLS n'a pas touché DEU » serait vrai
      // d'une base où DEU n'a jamais rien eu.
      admin = await connecter(ADMIN);
      const filialeAdmin = await admin.page.evaluate(() => Session.courante().filialeId);
      assert.equal(filialeAdmin, DEU, 'Le témoin doit vivre dans l’autre filiale.');
      await naviguer(admin.page, '/referentiels-actifs');
      await attendreReferentiels(admin.page);
      await admin.page.click('.rfa-activer[data-ref="nis2-art21"]');
      await admin.page.waitForSelector('#rfaMotif', { timeout: DELAI });
      await admin.page.fill('#rfaMotif', 'Périmètre du site allemand.');
      await admin.page.click('#rfaValider');
      const retourDeu = await attendreMessage(admin.page, 'rfaMessage');
      assert.match(retourDeu.classe, /grp-message--ok/u, retourDeu.texte);
      assert.equal((await activationEnBase(DEU, 'nis2-art21')).actif, true);

      // ── (c) TLS le retire ──────────────────────────────────────────────
      await attendreReferentiels(site.page);
      await site.page.click('.rfa-desactiver[data-ref="nis2-art21"]');
      await site.page.waitForSelector('#rfaMotif', { timeout: DELAI });
      await site.page.fill('#rfaMotif', 'Entité non désignée : NIS2 ne s’applique pas ici.');
      await site.page.click('#rfaValider');
      const retourRetrait = await attendreMessage(site.page, 'rfaMessage');
      assert.match(retourRetrait.classe, /grp-message--ok/u, retourRetrait.texte);

      const tlsApres = await activationEnBase(TLS, 'nis2-art21');
      assert.equal(tlsApres.actif, false, 'Le retrait n’a pas été enregistré pour TLS.');
      assert.ok(tlsApres.date_desactivation, 'Un retrait sans date ne se justifie pas devant un auditeur.');
      assert.match(tlsApres.motif, /ne s’applique pas ici/u);

      // ── (d) LE DIFFÉRENTIEL : l'autre filiale est intacte ───────────────
      const deuApres = await activationEnBase(DEU, 'nis2-art21');
      assert.equal(
        deuApres.actif,
        true,
        'Le retrait chez TLS a débordé sur DEU : l’activation serait alors de niveau Groupe, ' +
          'alors que « referentiels_actifs.filiale_id » est « not null » et que le serveur ' +
          'refuse « portee: groupe » pour cette entité.',
      );
      assert.equal(deuApres.date_desactivation, null);

      // ── (e) et l'écran de TLS le montre ────────────────────────────────
      await attendreReferentiels(site.page);
      const etatAffiche = await site.page.evaluate(() => {
        const carte = document.querySelector('.rfa-carte[data-ref="nis2-art21"]');
        return carte === null ? null : { texte: carte.textContent, classe: carte.className };
      });
      assert.ok(etatAffiche, 'La carte du référentiel doit rester affichée après le retrait.');
      assert.match(etatAffiche.texte, /Hors périmètre/u);
      assert.equal(/rfa-carte--actif/u.test(etatAffiche.classe), false);

      t.diagnostic(`TLS : actif=${tlsApres.actif} · DEU : actif=${deuApres.actif}`);
      assert.deepEqual(site.erreursInattendues(BRUIT_ATTENDU), []);
      assert.deepEqual(admin.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await admin?.fermer();
      await site.fermer();
    }
  });

  test('un profil EN LECTURE ne se voit proposer aucune activation, et l’écran s’affiche', async () => {
    // La contre-épreuve de l'asymétrie du §2, de l'autre côté : `direction`
    // porte le domaine « conformité » en LECTURE. L'écran doit donc s'ouvrir —
    // une page vide serait une régression — et ne proposer aucun geste qui
    // serait refusé. Rappel : ceci est une courtoisie, pas la barrière.
    const lecteur = await connecter(DIRECTION);
    try {
      await naviguer(lecteur.page, '/referentiels-actifs');
      await attendreReferentiels(lecteur.page);

      const vu = await lecteur.page.evaluate(() => ({
        cartes: document.querySelectorAll('.rfa-carte').length,
        activer: document.querySelectorAll('.rfa-activer').length,
        desactiver: document.querySelectorAll('.rfa-desactiver').length,
        lectureSeule: document.querySelectorAll('#rfaCorps .soc-vide').length,
        niveau: Droits.niveauEffectif('conformite'),
      }));

      // ── EXIGENCE DE MATIÈRE : sans carte, « aucun bouton » ne dit rien.
      assert.ok(vu.cartes >= 5, `L’écran doit rendre les référentiels du catalogue. Vu : ${vu.cartes}`);
      assert.equal(vu.niveau, 'lecture', 'Ce profil doit bien être en lecture sur la conformité.');
      assert.equal(vu.activer, 0, 'Aucune activation ne doit être proposée à un profil en lecture.');
      assert.equal(vu.desactiver, 0, 'Aucun retrait ne doit être proposé à un profil en lecture.');
      assert.equal(vu.lectureSeule, vu.cartes, 'Chaque carte doit dire pourquoi elle n’offre rien.');

      assert.deepEqual(lecteur.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await lecteur.fermer();
    }
  });

  /**
   * ⚠️ **CET ESSAI PINGLE UN DÉFAUT, IL NE LE CÉLÈBRE PAS.**
   *
   * Le constat Q-150 a deux moitiés : personne n'ÉCRIVAIT la table, et personne
   * ne la LISAIT. Les écrans ci-dessus ferment la première. La seconde — que
   * `js/modules/referentiels.js`, `conformite.js` et le tableau de bord filtrent
   * sur le périmètre — vit dans des fichiers qui n'appartiennent pas au
   * périmètre d'écriture de cet agent.
   *
   * Plutôt que d'écrire « à faire » quelque part, on MESURE l'état réel : NIS2
   * vient d'être retiré du périmètre de TLS, et l'écran « Référentiels » le
   * propose toujours. Le jour où le branchement sera fait, **cet essai
   * rougira** — et son message dira quoi en faire. C'est le contraire d'une
   * réserve écrite qui se transmet de session en session sans jamais être
   * traitée.
   */
  test('MESURE — l’écran « Référentiels » ignore encore le périmètre (moitié « lecture » de Q-150)', async (t) => {
    const site = await connecter(RSSI_TLS);
    try {
      const retire = await activationEnBase(TLS, 'nis2-art21');
      assert.ok(retire && retire.actif === false,
        'Matière : l’essai précédent doit avoir retiré NIS2 du périmètre de TLS.');

      await naviguer(site.page, '/referentiels');
      await site.page.waitForSelector('#app', { timeout: DELAI });
      await site.page.waitForFunction(
        () => document.getElementById('app').textContent.includes('NIS2')
          || document.getElementById('app').textContent.includes('Référentiels'),
        null,
        { timeout: DELAI },
      );
      const affiche = await site.page.evaluate(() => document.getElementById('app').textContent);
      const encoreLa = affiche.includes('NIS2');

      t.diagnostic(`NIS2 retiré du périmètre de TLS, et encore proposé par « Référentiels » : ${encoreLa}`);
      assert.equal(
        encoreLa,
        true,
        'CET ÉCHEC EST UNE BONNE NOUVELLE : les écrans de conformité consultent désormais ' +
          '« referentiels_actifs ». Retournez cette assertion (attendre « false ») et ' +
          'supprimez ce commentaire — la moitié « lecture » du constat Q-150 est fermée.',
      );
    } finally {
      await site.fermer();
    }
  });
});
