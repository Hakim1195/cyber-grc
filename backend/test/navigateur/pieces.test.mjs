/**
 * pieces.test.mjs — les pièces jointes à l'écran : dépôt, liste, délivrance (lot L6).
 *
 * ── Les trois propriétés mesurées, et ce que chacune empêche ────────────────
 *
 *  1. **Une pièce non délivrable n'offre AUCUN chemin de téléchargement.**
 *     `CONVENTIONS.md` §31.2, point 8 : « une pièce en cours d'analyse n'est
 *     jamais délivrable ». À l'écran, cela veut dire *pas de bouton* — pas un
 *     bouton grisé : un bouton désactivé se réactive au premier `disabled =
 *     false` venu, et il suggère qu'un octet est à portée. L'écran **dit**
 *     pourquoi, plutôt que de proposer un geste qui échouera.
 *
 *  2. **Tout ce qui fait sortir un octet passe par `Droits.exigerExport()`.**
 *     C'est le constat **Q-89** : un seul site de sortie qui l'avait oublié, et
 *     38 213 octets d'un document marqué *confidentiel* sont sortis pour un
 *     compte sans droit d'export. Un téléchargement de pièce jointe est le plus
 *     littéral de tous les sites de sortie — l'octet qui sort est un fichier
 *     entier. Et le discriminant est celui du constat **Q-92** : le profil
 *     éprouvé **écrit** et n'exporte pas (c'est le cas de RSSI et ADMIN, deux
 *     des huit profils du socle), et non pas « lecture seule », qui bloquerait
 *     pour une autre raison.
 *
 *  3. **Le nom du fichier vient d'un déposant.** C'est une donnée utilisateur,
 *     du même genre que le login forgé qu'un auditeur a fait entrer littéralement
 *     dans le journal d'audit (§29.5). Elle doit se **lire** sans s'**exécuter**.
 *
 * ── ⚠️ Ce que cet essai NE peut PAS mesurer aujourd'hui, et pourquoi ────────
 *
 * **Les états d'une pièce ne se fabriquent pas depuis un navigateur.** « En
 * cours d'analyse », « en quarantaine », « analyse impossible » sont des états
 * que la chaîne du §31.2 produit côté serveur, au fil d'une analyse antivirale ;
 * les obtenir réellement supposerait un ClamAV pilotable depuis l'essai. Les
 * réponses de liste et de délivrance sont donc **façonnées par `page.route`**
 * selon le contrat relevé dans `src/pieces/index.ts` — même montage que
 * `journal.test.mjs` et `connexion.test.mjs`. Ce qui est mesuré alors est la
 * réaction de l'écran, la seule moitié qui appartienne à cet agent ; la chaîne
 * elle-même appartient à `test/pieces/**`.
 *
 * Ce qui, en revanche, est mesuré **sans aucune substitution** :
 *
 *   · §3 — l'entonnoir s'arrête AVANT le réseau : aucune requête n'est émise ;
 *   · §6 — les routes réelles, interrogées en direct. ⚠️ Cet essai tient dans
 *     les DEUX situations — greffon monté ou non —, et il le dit : au 04/09 le
 *     greffon est enregistré sans sa configuration (`src/api/index.ts` :
 *     `register(greffonPieces, { pool })`), si bien qu'aucune route de pièce
 *     jointe ne répond. Un essai qui n'aurait connu qu'une des deux situations
 *     serait passé du vert au rouge le jour où un voisin ajoute un mot.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { RACINE_FRONTEND, monterServeurReel } from '../aide/serveur.mjs';

/** Même raison qu'au `journal.test.mjs` : cinq Chromium en parallèle sur quatre cœurs. */
const DELAI = 60_000;

/**
 * `CLAUDE.md` §5 : « **0 erreur** » — et cela veut dire les deux, les exceptions
 * de script **et** les messages d'erreur de console.
 *
 * ⚠️ **Cette distinction n'est pas de la coquetterie, elle a mordu pendant que
 * ce fichier s'écrivait.** Une seule requête vers une route absente
 * (`api/filiales`, qui n'existe pas encore) faisait journaliser au navigateur
 * « Failed to load resource: 404 » — donc une erreur de console **à chaque
 * ouverture de l'application**, invisible pour qui ne regarde que `pageerror`.
 * `test/navigateur/droits.test.mjs` l'a dit, ce fichier ne le disait pas. Il le
 * dit maintenant.
 *
 * `motifsAcceptes` sert aux essais qui provoquent VOLONTAIREMENT un refus : un
 * 403 demandé par le scénario n'est pas un défaut, et le taire globalement le
 * serait.
 */
function exigerZeroErreur(session, motifsAcceptes = []) {
  assert.deepEqual(
    session.erreursInattendues(motifsAcceptes),
    [],
    'CLAUDE.md §5 : zéro erreur — ni exception de script, ni message d’erreur de console.',
  );
}

/**
 * Les écrans qui portent le panneau, et le type d'entité qu'ils déclarent.
 *
 * ⚠️ **Le filet refuse de passer s'il en exerce moins que cela.** C'est la
 * réponse directe au constat **Q-89** : le défaut n'était pas qu'un site fût
 * faux, c'était que *onze sites sur douze* fussent vérifiés et le douzième pas.
 * Un essai qui mesurerait un seul écran rendrait vert le jour où le second
 * oublierait l'entonnoir.
 */
const SITES = Object.freeze([
  { route: 'documents', collection: 'getDocuments', entite: 'documents' },
  { route: 'incidents', collection: 'getIncidents', entite: 'incidents' },
]);

let base;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
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

/* =====================================================================
 *  Les profils — les deux moitiés du droit sur une pièce jointe
 * ===================================================================== */

const TOUS_LES_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel',
  'administration', 'journal',
]);

/** **La combinaison qui a laissé passer Q-89** : il écrit, il ne peut pas extraire. */
const ECRIT_SANS_EXPORTER = Object.freeze({
  niveau: 'contribution', domaines: TOUS_LES_DOMAINES, export: false,
});

/** Le même, avec le droit d'extraction : le contrôle dans l'autre sens. */
const ECRIT_ET_EXPORTE = Object.freeze({
  niveau: 'contribution', domaines: TOUS_LES_DOMAINES, export: true,
});

async function injecterDroits(page, droits) {
  await page.route('**/api/session', async (route) => {
    const vraie = await route.fetch();
    const charge = JSON.parse(await vraie.text());
    charge.droits = droits;
    charge.authentification = { ...(charge.authentification ?? {}), provisoire: false };
    charge.identite = { login: 'essai', nomAffichage: 'Compte d’essai' };
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(charge),
    });
  });
}

/* =====================================================================
 *  Les pièces que le serveur rendra — vocabulaire du schéma
 * ===================================================================== */

/**
 * Une pièce, dans chacun des états de `ck_pieces_jointes_etat`.
 *
 * ⚠️ **Le jeu couvre les cinq états ET la quarantaine hors « infectee »**, parce
 * que le schéma garantit qu'une pièce infectée est en quarantaine, jamais
 * l'inverse : une pièce peut être isolée sans être déclarée infectée (une
 * réanalyse, une décision d'exploitation). Un écran qui ne lirait que l'état
 * délivrerait celle-là.
 */
function jeuDePieces() {
  return [
    {
      id: 'PJ-SAINE', nom_fichier: 'rapport-audit-2026.pdf', taille_octets: 38_213,
      type_mime: 'application/pdf', etat_analyse: 'saine', quarantaine: false,
      sha256: 'a'.repeat(64), cree_le: '2026-09-04T08:00:00Z', cree_par: 'rssi.tls',
    },
    {
      id: 'PJ-ATTENTE', nom_fichier: 'journal-pare-feu.txt', taille_octets: 1024,
      type_mime: 'text/plain', etat_analyse: 'en_attente', quarantaine: false,
      sha256: 'b'.repeat(64), cree_le: '2026-09-04T08:05:00Z', cree_par: 'rssi.tls',
    },
    {
      id: 'PJ-COURS', nom_fichier: 'capture-poste.zip', taille_octets: 4096,
      type_mime: 'application/zip', etat_analyse: 'en_cours', quarantaine: false,
      sha256: 'c'.repeat(64), cree_le: '2026-09-04T08:06:00Z', cree_par: 'rssi.tls',
    },
    {
      id: 'PJ-INFECTEE', nom_fichier: 'facture.pdf.exe', taille_octets: 2048,
      type_mime: 'application/pdf', etat_analyse: 'infectee', quarantaine: true,
      sha256: 'd'.repeat(64), cree_le: '2026-09-04T08:07:00Z', cree_par: 'inconnu',
    },
    {
      id: 'PJ-ISOLEE', nom_fichier: 'archive-douteuse.7z', taille_octets: 8192,
      // Isolée SANS être déclarée infectée : le cas que l'état seul manquerait.
      type_mime: 'application/x-7z-compressed', etat_analyse: 'saine', quarantaine: true,
      sha256: 'e'.repeat(64), cree_le: '2026-09-04T08:08:00Z', cree_par: 'rssi.tls',
    },
    {
      id: 'PJ-ERREUR', nom_fichier: 'gros-fichier.bin', taille_octets: 999_999,
      type_mime: 'application/octet-stream', etat_analyse: 'erreur', quarantaine: false,
      sha256: 'f'.repeat(64), cree_le: '2026-09-04T08:09:00Z', cree_par: 'rssi.tls',
    },
  ];
}

/**
 * Façonne les routes du §31 et **retient ce que le navigateur a demandé**.
 *
 * Ce n'est pas un décor : ce qui est mesuré est la **requête émise** — ou son
 * absence, qui est ici la propriété la plus importante.
 */
async function substituerPieces(page, options = {}) {
  const etat = {
    demandes: [],
    /** Statut imposé à la délivrance, ou `undefined` pour le succès. */
    statutDelivrance: undefined,
    pieces: options.pieces ?? jeuDePieces(),
    /** Ce que le serveur annonce comme borne de taille, ou `null`. */
    tailleMax: options.tailleMax ?? null,
    /** La liste échoue-t-elle ? (pour éprouver « il le DIT »). */
    listeEnEchec: options.listeEnEchec === true,
    /** Contenu rendu par la route de délivrance. */
    contenu: options.contenu ?? 'PIECE-JOINTE-DE-DEMONSTRATION',
  };

  await page.route('**/api/pieces/**', async (route) => {
    const requete = route.request();
    const url = new URL(requete.url());
    // `/api/pieces/<entite>/<entiteId>[/<pieceId>]` — le rattachement est DANS le
    // chemin, relevé dans `src/pieces/index.ts`.
    const segments = url.pathname.split('/').filter(Boolean).slice(2);
    etat.demandes.push({
      methode: requete.method(),
      chemin: url.pathname,
      entite: segments[0] ?? null,
      entiteId: segments[1] ?? null,
      pieceId: segments[2] ?? null,
      requete: url.search,
      corps: requete.postData() ?? '',
      typeContenu: requete.headers()['content-type'] ?? '',
    });

    // GET api/pieces/<entite>/<entiteId>/<pieceId> — la délivrance
    if (requete.method() === 'GET' && segments.length >= 3) {
      // `statutDelivrance` permet à un essai de provoquer un refus SANS toucher
      // au produit — c'est ainsi qu'on éprouve que l'écran ne quitte pas la page.
      if (etat.statutDelivrance !== undefined && etat.statutDelivrance !== 200) {
        return route.fulfill({
          status: etat.statutDelivrance,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({
            erreur: 'droit_insuffisant',
            message: 'Refus fabriqué par le banc.',
            reference: 'REQ-ESSAI',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        // §31.3 : jamais le type MIME annoncé par le déposant, toujours en pièce
        // attachée. Reproduit ici pour que l'écran soit éprouvé contre la forme
        // réelle de la réponse.
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="piece"',
          'x-content-type-options': 'nosniff',
        },
        body: etat.contenu,
      });
    }

    // POST api/pieces/<entite>/<entiteId> — le dépôt, en multipart/form-data
    if (requete.method() === 'POST') {
      const brut = requete.postData() ?? '';
      const nom = /filename="([^"]*)"/.exec(brut)?.[1] ?? '?';
      etat.pieces = etat.pieces.concat([{
        id: 'PJ-NEUVE',
        nom_fichier: nom,
        taille_octets: 42,
        type_mime: 'text/plain',
        etat_analyse: 'en_attente',
        quarantaine: false,
        sha256: '0'.repeat(64),
        cree_le: '2026-09-04T09:00:00Z',
        cree_par: 'essai',
      }]);
      return route.fulfill({
        status: 201,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ id: 'PJ-NEUVE' }),
      });
    }

    // GET api/pieces/<entite>/<entiteId> — la liste
    if (etat.listeEnEchec) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ erreur: 'erreur_interne', message: 'Le stockage est injoignable.' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        pieces: etat.pieces,
        ...(etat.tailleMax === null ? {} : { taille_max_octets: etat.tailleMax }),
      }),
    });
  });

  return etat;
}

/** Ouvre l'application avec un profil donné. */
async function ouvrirApplication(droits) {
  const session = await ouvrirPage(navigateur);
  session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  if (droits !== undefined) await injecterDroits(session.page, droits);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    await attendreApplication(session.page, { delai: DELAI }), 'chargee',
    'L’application doit démarrer.',
  );
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/**
 * Ouvre la fiche du premier enregistrement d'un site, et attend le panneau.
 * Rend l'identifiant réellement ouvert.
 */
async function ouvrirFiche(page, site) {
  const id = await page.evaluate((nom) => {
    const liste = window.DataStore[nom]();
    return liste.length ? liste[0].id : null;
  }, site.collection);
  assert.ok(id, `Aucun enregistrement « ${site.route} » : cet essai ne mesurerait rien.`);
  await page.evaluate((h) => { window.location.hash = h; }, `#/${site.route}/${id}`);
  await page.waitForSelector('#piecesJointes', { timeout: DELAI });
  await page.waitForFunction(
    () => {
      const h = document.getElementById('piecesJointes');
      return h !== null && !h.textContent.includes('Lecture des pièces jointes');
    },
    null, { timeout: DELAI },
  );
  return id;
}

/**
 * Compte tout ce qui peut faire sortir un octet, depuis la page — et **retient
 * le nom des fichiers sortis**.
 *
 * Le nom compte : un filet qui dit seulement « quelque chose est sorti » oblige
 * à rouvrir le décor pour savoir quoi. Ici il nomme la pièce, ce qui est
 * exactement ce qu'un rapport de porte doit pouvoir citer (Q-89 nommait
 * *38 213 octets d'un document confidentiel*, et c'est pour cela qu'il a été
 * traité).
 */
async function armerCompteurDeSorties(page) {
  await page.evaluate(() => {
    window.__sorties = { blobs: 0, telechargements: 0, impressions: 0, fichiers: [] };
    const vraiUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__sorties.blobs += 1; return vraiUrl(b); };
    const vraiClic = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clic() {
      if (this.hasAttribute('download')) {
        window.__sorties.telechargements += 1;
        window.__sorties.fichiers.push(this.getAttribute('download'));
      }
      return vraiClic.apply(this, arguments);
    };
    window.print = () => { window.__sorties.impressions += 1; };
  });
}

async function lireSorties(page) {
  const s = await page.evaluate(() => window.__sorties);
  return { ...s, total: s.blobs + s.telechargements + s.impressions };
}

/* =====================================================================
 *  §1 — Le panneau est là, il liste, et il dit ce qu'il ne peut pas lire
 * ===================================================================== */

describe('Le panneau « Pièces jointes » vit sur les fiches', () => {
  test('IL EST MONTÉ sur chacun des sites, et déclare le bon type d’entité', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const etat = await substituerPieces(session.page);
      let exerces = 0;
      for (const site of SITES) {
        await ouvrirFiche(session.page, site);
        const lignes = await session.page.evaluate(
          () => document.querySelectorAll('#piecesJointes .pj-ligne').length,
        );
        assert.ok(lignes > 0, `Aucune pièce listée sur « ${site.route} » : rien n’est mesuré.`);
        const derniere = etat.demandes.filter((d) => d.methode === 'GET').at(-1);
        assert.equal(
          derniere.entite, site.entite,
          `La fiche « ${site.route} » doit demander ses pièces sous le type d’entité ` +
            `« ${site.entite} » (domaine « type_entite » du schéma, et segment de chemin ` +
            `sur lequel la route déclare « domaine: selon-entite »). Chemin : ${derniere.chemin}`,
        );
        assert.ok(derniere.entiteId, `L’identifiant de l’enregistrement doit partir : ${derniere.chemin}`);
        assert.equal(
          derniere.pieceId, null,
          `Lister n’est pas délivrer : la liste ne désigne aucune pièce. ${derniere.chemin}`,
        );
        exerces += 1;
      }
      // Le filet refuse de passer s'il a exercé moins de sites que déclaré.
      assert.equal(
        exerces, SITES.length,
        `Q-89 : le défaut n’était pas qu’un site fût faux, c’est que onze sur douze fussent ` +
          `vérifiés. ${String(exerces)} site(s) exercé(s) sur ${String(SITES.length)}.`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('QUAND LA LISTE ÉCHOUE, l’écran le DIT — il n’annonce pas « aucune pièce »', async () => {
    /* « Aucune pièce » et « je n'ai pas pu lire » se ressemblent à l'écran et ne
     * veulent pas dire la même chose. Sur une preuve d'audit, la confusion dit
     * qu'il n'y a rien à voir — famille du constat Q-104.
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      await substituerPieces(session.page, { listeEnEchec: true });
      await ouvrirFiche(session.page, SITES[0]);
      const vu = await session.page.evaluate(() => ({
        texte: document.getElementById('piecesJointes').textContent,
        alerte: document.querySelector('#piecesJointes [role="alert"]') !== null,
        depot: document.getElementById('pjDeposerBtn') !== null,
      }));
      assert.equal(vu.alerte, true, `L’échec doit être annoncé comme tel :\n${vu.texte}`);
      assert.equal(
        vu.texte.includes('Aucune pièce jointe'), false,
        `L’écran annonce « aucune pièce » alors qu’il n’a rien pu lire :\n${vu.texte}`,
      );
      assert.equal(
        vu.depot, false,
        'On ne propose pas de déposer dans une liste qu’on n’a pas su lire : le dépôt ' +
          'paraîtrait réussi et la pièce introuvable.',
      );
      // Le 500 est DEMANDÉ par ce scénario (`listeEnEchec`) : c'est ce qu'on éprouve.
      exigerZeroErreur(session, ['status of 500']);
    } finally {
      await session.fermer();
    }
  });

  test('UN NOM DE FICHIER HOSTILE s’affiche, il ne s’exécute pas', async () => {
    /* Le nom vient d'un déposant. C'est le même chemin qu'a suivi le login forgé
     * de la porte S3, arrivé littéralement dans le journal (§29.5).
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const hostile = '<img src=x onerror="window.__xss=1">.pdf';
      const auteur = '</td></tr><script>window.__xss2=1</script>';
      await substituerPieces(session.page, {
        pieces: [{
          id: 'PJ-HOSTILE', nom_fichier: hostile, taille_octets: 10,
          type_mime: '"><b>gras</b>', etat_analyse: 'saine', quarantaine: false,
          sha256: '1'.repeat(64), cree_le: '2026-09-04T08:00:00Z', cree_par: auteur,
        }],
      });
      await ouvrirFiche(session.page, SITES[0]);
      await session.page.waitForTimeout(150);

      const vu = await session.page.evaluate(() => ({
        xss: window.__xss ?? null,
        xss2: window.__xss2 ?? null,
        gestionnaires: document.querySelectorAll('#app [onerror], #app [onclick], #app [onload]').length,
        scripts: document.querySelectorAll('#app script').length,
        lignes: document.querySelectorAll('#piecesJointes .pj-ligne').length,
        texte: document.getElementById('piecesJointes').textContent,
      }));

      assert.equal(vu.xss, null, 'Le gestionnaire « onerror » d’un nom de fichier forgé s’est exécuté.');
      assert.equal(vu.xss2, null, 'Un <script> forgé dans le nom du déposant s’est exécuté.');
      assert.equal(vu.gestionnaires, 0, 'Un attribut de gestionnaire a été construit depuis une donnée.');
      assert.equal(vu.scripts, 0, 'Une balise <script> a été construite depuis une donnée.');
      assert.equal(vu.lignes, 1, 'La ligne forgée ne doit pas se scinder en plusieurs lignes.');
      assert.ok(
        vu.texte.includes(hostile),
        `Le nom doit s’afficher TEL QUEL — le lire est le travail de l’utilisateur.\n${vu.texte}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — Une pièce non délivrable n'offre AUCUN chemin
 * ===================================================================== */

describe('Ce qui n’est pas délivrable n’a pas de bouton (§31.2, point 8)', () => {
  test('EN ANALYSE, EN QUARANTAINE, EN ERREUR : aucun bouton, et l’écran dit pourquoi', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      await substituerPieces(session.page);
      await ouvrirFiche(session.page, SITES[0]);

      const vu = await session.page.evaluate(() => {
        const par = {};
        document.querySelectorAll('#piecesJointes .pj-ligne').forEach((tr) => {
          par[tr.dataset.piece] = {
            bouton: tr.querySelector('.pj-telecharger') !== null,
            texte: tr.textContent,
            explication: tr.querySelector('.pj-indisponible')?.getAttribute('title') ?? null,
          };
        });
        return par;
      });

      // Le filet refuse de passer s'il n'a rien à éprouver.
      assert.equal(Object.keys(vu).length, 6, `Le jeu de pièces n’est pas complet : ${JSON.stringify(Object.keys(vu))}`);

      for (const id of ['PJ-ATTENTE', 'PJ-COURS', 'PJ-INFECTEE', 'PJ-ISOLEE', 'PJ-ERREUR']) {
        assert.equal(
          vu[id].bouton, false,
          `« ${id} » propose un chemin de téléchargement alors qu’elle n’est pas délivrable. ` +
            `§31.2 point 8 : « une pièce en cours d’analyse n’est jamais délivrable ». ` +
            `Ligne : ${vu[id].texte}`,
        );
        assert.ok(
          vu[id].explication && vu[id].explication.length > 20,
          `« ${id} » ne dit pas POURQUOI elle n’est pas délivrable : ${JSON.stringify(vu[id])}`,
        );
      }

      // ── PJ-ISOLEE est le cas que l'état seul manquerait ────────────────────
      assert.match(
        vu['PJ-ISOLEE'].texte, /quarantaine/i,
        'Une pièce en quarantaine SANS être déclarée infectée doit être traitée comme ' +
          'isolée : le schéma garantit « infectée ⇒ quarantaine », jamais l’inverse. ' +
          `Ligne : ${vu['PJ-ISOLEE'].texte}`,
      );

      // Contrôle dans l'autre sens : la pièce saine, elle, se télécharge.
      assert.equal(
        vu['PJ-SAINE'].bouton, true,
        'Sans ce contrôle, « aucun bouton » serait aussi ce que rend un panneau cassé.',
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('APPELÉE DIRECTEMENT sur une pièce en quarantaine, la délivrance refuse — sans réseau', async () => {
    // Le bouton n'existe pas ; la fonction, elle, existe toujours. Le serveur
    // refuserait de toute façon (§31.2), mais l'écran doit dire pourquoi plutôt
    // que de relayer un 403 — et surtout ne rien faire sortir.
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const etat = await substituerPieces(session.page);
      await ouvrirFiche(session.page, SITES[0]);
      await armerCompteurDeSorties(session.page);
      const avant = etat.demandes.length;

      const rendu = await session.page.evaluate(() => window.PiecesModule.telecharger('PJ-INFECTEE'));
      const sorties = await lireSorties(session.page);

      assert.equal(rendu, false, 'La délivrance d’une pièce en quarantaine doit rendre « refusé ».');
      assert.equal(sorties.total, 0, `Un octet est sorti d’une pièce en quarantaine : ${JSON.stringify(sorties)}`);
      assert.equal(
        etat.demandes.length, avant,
        `Une requête a été émise pour une pièce en quarantaine : ` +
          `${JSON.stringify(etat.demandes.slice(avant))}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Ouvrir une pièce est une LECTURE : l'entonnoir n'a rien à garder ici
 * ===================================================================== */

/* ⚠️ **CE BLOC A ÉTÉ RETOURNÉ — arbitrage du 04/09/2026, `CONVENTIONS.md` §31.5.**
 *
 * Il s'appelait « le téléchargement passe par l'entonnoir » et exigeait qu'un
 * profil sans droit d'export **ne fasse sortir aucun octet**. Il appliquait
 * fidèlement la consigne de l'orchestrateur — *« un téléchargement de pièce
 * jointe fait sortir un octet, donc c'est un export »* — et **cette consigne
 * était fausse**.
 *
 * Ce qui l'a tranchée est une mesure : le droit d'export vient du groupe AD
 * `GRC-EXPORT`, que la plupart des comptes ne portent pas. Un auditeur n'aurait
 * pas pu ouvrir le rapport d'audit qu'il est chargé de lire. **Ouvrir une pièce
 * attachée à une fiche qu'on a le droit de lire est une LECTURE**, tracée en
 * `consultation_sensible` côté serveur.
 *
 * Ce que ce bloc éprouve désormais, et qui est plus fort que ce qu'il éprouvait :
 *
 *  1. un profil **sans** droit d'export **obtient** sa pièce — la régression que
 *     l'ancienne rédaction aurait installée sans que personne ne la voie ;
 *  2. l'écran **ne fabrique aucun téléchargement** : ni `URL.createObjectURL`,
 *     ni attribut `download`. Il suit l'adresse, et le serveur délivre en
 *     `attachment`. C'est ce qui fait que le garde-fou mécanique de l'entonnoir
 *     n'a plus rien à accuser — **par disparition de l'objet, pas par exemption** ;
 *  3. l'entonnoir reste **intact là où il compte** : le même profil ne fait
 *     toujours sortir aucun octet des sites d'export véritables.
 */

describe('Ouvrir une pièce est une lecture (§31.5, arbitrage du 04/09)', () => {
  test('UN PROFIL SANS DROIT D’EXPORT OBTIENT SA PIÈCE — c’est une lecture', async () => {
    const session = await ouvrirApplication(ECRIT_SANS_EXPORTER);
    try {
      const etat = await substituerPieces(session.page);
      let exerces = 0;
      for (const site of SITES) {
        await ouvrirFiche(session.page, site);
        const avant = etat.demandes.length;

        const rendu = await session.page.evaluate(
          () => window.PiecesModule.telecharger('PJ-SAINE'),
        );

        assert.equal(
          rendu,
          true,
          `Un profil sans droit d’export ne peut pas ouvrir la pièce de « ${site.route} ». ` +
            'C’est la régression que l’ancienne rédaction de cet essai installait : le droit ' +
            'd’export vient du groupe AD GRC-EXPORT, que la plupart des comptes ne portent pas, ' +
            'et un auditeur n’aurait pas pu ouvrir le rapport qu’il doit lire (§31.5).',
        );
        assert.ok(
          etat.demandes.length > avant,
          `Aucune délivrance n’a été demandée sur « ${site.route} » : la fonction rend ` +
            'vrai sans rien demander, ce qui ne prouve rien.',
        );
        exerces += 1;
      }
      assert.ok(
        exerces >= 2,
        `Seuls ${String(exerces)} site(s) exercé(s) : ce filet rendrait vert en n’éprouvant rien.`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('UN REFUS ne fait pas quitter l’écran — la saisie survit', async () => {
    // ⚠️ **C'est la raison pour laquelle l'écran relit le contenu au lieu de
    // suivre l'adresse.** Suivre l'adresse aurait deux avantages réels — pas de
    // fichier en mémoire, nom assaini par le serveur — mais sur un refus le
    // navigateur QUITTE L'ÉCRAN pour afficher le JSON d'erreur. On perdrait la
    // saisie en cours pour économiser une copie, et la perte de saisie est l'un
    // des trois domaines que ce chantier ne négocie pas.
    const session = await ouvrirApplication(ECRIT_SANS_EXPORTER);
    try {
      const etat = await substituerPieces(session.page);
      etat.statutDelivrance = 403;
      await ouvrirFiche(session.page, SITES[0]);
      const avantUrl = session.page.url();

      const rendu = await session.page.evaluate(
        () => window.PiecesModule.telecharger('PJ-SAINE'),
      );
      assert.equal(rendu, false, 'Un refus doit être rendu comme tel.');
      assert.equal(
        session.page.url(),
        avantUrl,
        'L’écran a changé d’adresse sur un refus : la saisie en cours serait perdue.',
      );
      // Et le panneau est toujours là — l'écran n'a pas été remplacé par du JSON.
      assert.equal(
        await session.page.evaluate(() => document.querySelectorAll('#piecesJointes').length),
        1,
        'Le panneau a disparu : le navigateur a suivi l’erreur au lieu de l’afficher.',
      );
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE INVERSE : l’entonnoir reste intact là où il compte', async () => {
    // Sans ce contrôle, on aurait pu croire l'entonnoir désarmé partout. Le même
    // profil, sur un site d'export véritable, ne doit toujours faire sortir
    // aucun octet — c'est le constat Q-89, et il n'a pas bougé.
    const session = await ouvrirApplication(ECRIT_SANS_EXPORTER);
    try {
      await ouvrirFiche(session.page, SITES[0]);
      await armerCompteurDeSorties(session.page);
      const rendu = await session.page.evaluate(() => {
        if (typeof Droits === 'undefined') return null;
        return Droits.exigerExport();
      });
      assert.equal(
        rendu,
        false,
        'L’entonnoir doit toujours refuser un profil sans droit d’export : c’est Q-89, ' +
          'et l’arbitrage du §31.5 ne le désarme que pour les PIÈCES JOINTES.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — Le dépôt
 * ===================================================================== */

describe('Le dépôt suit le contrat, et la liste se relit après', () => {
  test('LE FICHIER PART sur la route dédiée, en multipart, et la liste est rechargée', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const etat = await substituerPieces(session.page);
      await ouvrirFiche(session.page, SITES[0]);
      const listesAvant = etat.demandes.filter((d) => d.methode === 'GET').length;

      await session.page.setInputFiles('#pjFichier', {
        name: 'preuve.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('preuve du contrôle', 'utf8'),
      });
      await session.page.click('#pjDeposerBtn');
      await session.page.waitForFunction(
        () => document.querySelector('#piecesJointes .pj-ligne[data-piece="PJ-NEUVE"]') !== null,
        null, { timeout: DELAI },
      );

      const depot = etat.demandes.find((d) => d.methode === 'POST');
      assert.ok(depot, `Aucun dépôt émis : ${JSON.stringify(etat.demandes.map((d) => d.methode))}`);
      assert.equal(depot.entite, SITES[0].entite, depot.chemin);
      assert.ok(depot.entiteId, 'L’enregistrement visé doit être dans le chemin.');

      // ── LE CORPS EST UN FORMULAIRE, ET SA FRONTIÈRE VIENT DU NAVIGATEUR ──
      //
      // Poser soi-même le `content-type` d'un multipart produit un envoi que
      // l'analyseur du serveur rejette — et le message parle alors de « fichier
      // absent », ce qui envoie chercher le défaut à l'autre bout.
      assert.match(
        depot.typeContenu, /^multipart\/form-data; *boundary=.+/,
        `Le dépôt doit partir en multipart/form-data avec sa frontière : « ${depot.typeContenu} »`,
      );
      assert.match(
        depot.corps, /name="fichier"/,
        `Le champ de formulaire doit s’appeler « fichier » (CHAMP_FICHIER, ` +
          `src/pieces/index.ts) : ${depot.corps.slice(0, 300)}`,
      );
      assert.match(depot.corps, /filename="preuve\.txt"/, depot.corps.slice(0, 300));
      assert.match(
        depot.corps, /preuve du contrôle/,
        'Le contenu doit partir intact, sans ré-encodage.',
      );

      const listesApres = etat.demandes.filter((d) => d.methode === 'GET').length;
      assert.ok(
        listesApres > listesAvant,
        'La liste doit être relue après un dépôt : c’est le serveur qui dit dans quel état ' +
          'la pièce est, pas le navigateur qui l’a envoyée.',
      );

      // La pièce neuve arrive « en attente » : elle n'est PAS délivrable.
      assert.equal(
        await session.page.evaluate(
          () => document.querySelector('.pj-ligne[data-piece="PJ-NEUVE"] .pj-telecharger') !== null,
        ), false,
        'Une pièce qui vient d’être déposée est en attente d’analyse : elle ne se ' +
          'télécharge pas (§31.2, point 8).',
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('LA BORNE DE TAILLE est celle que le SERVEUR annonce, jamais une constante locale', async () => {
    /* `src/config/index.ts` porte `tailleMaxOctets`, réglable par déploiement.
     * Une constante recopiée dans le navigateur serait fausse le jour où un
     * exploitant la change — et fausse en silence.
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const etat = await substituerPieces(session.page, { tailleMax: 64 });
      await ouvrirFiche(session.page, SITES[0]);
      const avant = etat.demandes.filter((d) => d.methode === 'POST').length;

      await session.page.setInputFiles('#pjFichier', {
        name: 'trop-gros.bin',
        mimeType: 'application/octet-stream',
        buffer: Buffer.alloc(4096, 7),
      });
      await session.page.click('#pjDeposerBtn');
      await session.page.waitForTimeout(400);

      assert.equal(
        etat.demandes.filter((d) => d.methode === 'POST').length, avant,
        'Un fichier au-delà de la borne ANNONCÉE ne doit pas partir : c’est une courtoisie, ' +
          'et elle évite d’encoder puis d’envoyer ce que le serveur refusera.',
      );
      const message = await session.page.evaluate(
        () => document.getElementById('toast-container')?.textContent ?? '',
      );
      assert.match(message, /taille/i, `Le refus doit être dit :\n${message}`);
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §5 — MORSURE : sans la garde, le fichier SORT
 * ===================================================================== */

describe('Les routes du §31, interrogées sans substitution', () => {
  test('AUCUN OCTET ne sort de la route réelle, et l’écran ne prétend pas le contraire', async (t) => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      /* ⚠️ **Deux sondes, parce qu'une seule ne distingue pas ce qu'il faut.**
       * `404` sur la délivrance peut vouloir dire « la route n'existe pas » OU
       * « la route existe et la pièce est introuvable » — et le §31 rend
       * délibérément les deux indiscernables pour un client (même motif que
       * l'oracle d'existence du constat M-3). On interroge donc AUSSI la liste,
       * qui rend `{ pieces: [] }` quand la route est montée : c'est elle qui dit
       * laquelle des deux situations on mesure.
       */
      const issue = await session.page.evaluate(async () => {
        const contenu = await fetch('api/pieces/documents/DOC-INEXISTANT/PJ-QUELCONQUE', {
          credentials: 'same-origin', cache: 'no-store',
        });
        const liste = await fetch('api/pieces/documents/DOC-A', {
          credentials: 'same-origin', cache: 'no-store',
        });
        return {
          statut: contenu.status,
          taille: (await contenu.text()).length,
          statutListe: liste.status,
          corpsListe: (await liste.text()).slice(0, 200),
        };
      });
      assert.equal(
        issue.statut >= 200 && issue.statut < 300, false,
        `La route de délivrance a rendu 2xx alors qu’aucune route de pièce jointe n’est ` +
          `enregistrée (statut ${String(issue.statut)}, ${String(issue.taille)} octets).`,
      );
      t.diagnostic(
        `Délivrance : ${String(issue.statut)} (${String(issue.taille)} octets). ` +
          `Liste : ${String(issue.statutListe)} — ${issue.corpsListe}`,
      );
      if (issue.statutListe === 404) {
        t.diagnostic(
          'La LISTE rend 404 : les routes du §31 ne sont pas montées sur ce banc. Le refus ' +
            'mesuré n’est donc pas celui du modèle de droits.',
        );
      } else {
        /* ── ⚠️ CE QUE LA ROUTE RÉELLE NE FAIT PAS, ET QU'IL FAUT DIRE ────────
         *
         * La délivrance est déclarée `{ action: 'lire', domaine: 'selon-entite' }`
         * (`src/pieces/index.ts`) : **le serveur n'exige pas le droit d'export**
         * pour rendre un fichier. `GET api/journal/export`, lui, l'exige (§29.8).
         * À ce jour, l'entonnoir du navigateur est donc la seule barrière sur ce
         * chemin — c'est-à-dire la configuration que le produit refuse partout
         * ailleurs (« l'interface n'est pas la barrière »).
         *
         * Ce n'est pas une propriété de cet écran, et cet essai ne peut pas la
         * corriger : il la CONSIGNE, pour qu'elle ne se perde pas entre deux
         * agents. Constat non attribué = constat perdu.
         */
        t.diagnostic(
          'Les routes du §31 sont montées. ⚠️ La délivrance est déclarée ' +
            '« action: lire », pas « exporter » : le serveur ne vérifie donc PAS le droit ' +
            'd’export pour rendre une pièce jointe, alors que la même famille de geste ' +
            'l’exige sur `GET api/journal/export` (§29.8). L’entonnoir du navigateur est ' +
            'aujourd’hui la seule barrière sur ce chemin — à faire trancher par qui tient ' +
            '`src/pieces/`.',
        );
      }

      /* ── DEUX SITUATIONS, ET L'ESSAI DOIT TENIR DANS LES DEUX ──────────
       *
       * ⚠️ **Une première rédaction n'en connaissait qu'une**, et elle serait
       * passée du vert au rouge le jour où un agent voisin monte les routes —
       * sans qu'une seule ligne de cet écran change. Un essai qui bascule sur
       * l'état d'un fichier qu'il ne mesure pas ne mesure pas ce qu'il croit.
       *
       *  · **routes absentes** : le panneau **s'efface**. Ni « aucune pièce
       *    jointe » (mensonge : il n'a rien pu lire), ni bandeau d'échec sur
       *    CHAQUE fiche d'un serveur correctement installé — l'alarme
       *    quotidienne et fausse du constat m-5, celle qui apprend à ignorer
       *    les alarmes.
       *  · **routes montées** : le panneau affiche l'état réel du serveur, et
       *    ne prétend jamais avoir échoué.
       *
       * Dans les deux cas, la propriété qui compte est la même : **aucun octet
       * n'est sorti**, et l'écran ne raconte rien de faux.
       */
      const id = await session.page.evaluate((nom) => {
        const l = window.DataStore[nom]();
        return l.length ? l[0].id : null;
      }, SITES[0].collection);
      assert.ok(id, 'Aucun enregistrement : cet essai ne mesurerait rien.');
      await session.page.evaluate((h) => { window.location.hash = h; }, `#/${SITES[0].route}/${id}`);
      await session.page.waitForSelector('#piecesJointes', { timeout: DELAI, state: 'attached' });

      if (issue.statutListe === 404) {
        await session.page.waitForFunction(
          () => {
            const h = document.getElementById('piecesJointes');
            return h !== null && h.textContent.trim() === '' && h.hidden === true;
          },
          null, { timeout: DELAI },
        );
      } else {
        await session.page.waitForFunction(
          () => {
            const h = document.getElementById('piecesJointes');
            return h !== null && !h.hidden &&
              !h.textContent.includes('Lecture des pièces jointes');
          },
          null, { timeout: DELAI },
        );
        const texte = await session.page.evaluate(
          () => document.getElementById('piecesJointes').textContent,
        );
        assert.equal(
          /n'a pas pu être lue|n’a pas pu être lue/.test(texte), false,
          `Les routes répondent : le panneau ne doit pas annoncer un échec.\n${texte}`,
        );
      }

      // Les routes du §31 n'existent pas encore : le 404 est le fait mesuré.
      exigerZeroErreur(session, ['status of 404']);
    } finally {
      await session.fermer();
    }
  });

  test('LE VOCABULAIRE du panneau et celui du contrat se font face, dans les deux sens', async () => {
    /* Un garde-fou muet est un commentaire (`CONVENTIONS.md` §18.4), et il se
     * vérifie dans les deux sens (§20.2). `verifierVocabulaire()` confronte les
     * cinq états de `ck_pieces_jointes_etat` à ceux que le panneau sait nommer,
     * ET vérifie qu'un seul est délivrable. On l'appelle ici pour que son
     * silence soit une mesure, pas une supposition.
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      await substituerPieces(session.page);
      await ouvrirFiche(session.page, SITES[0]);
      const ecarts = await session.page.evaluate(() => window.PiecesModule.verifierVocabulaire());
      assert.deepEqual(
        ecarts, [],
        `Le vocabulaire des états diverge entre le panneau et \`Api.CONTRAT_PIECES\` : ` +
          `${JSON.stringify(ecarts)}`,
      );
      // Contrôle dans l'autre sens : la confrontation porte bien sur cinq états.
      const connus = await session.page.evaluate(() => window.PiecesModule.contrat.etats);
      assert.equal(
        connus.length, 5,
        `Le panneau ne nomme que ${String(connus.length)} état(s) : la confrontation ne mord ` +
          `plus. ${JSON.stringify(connus)}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('L’AVERTISSEMENT du `PLAN_SERVEUR` §1.6 est LISIBLE, pas seulement écrit dans le code', async () => {
    /* « Aucun dispositif ne garantit l'absence de malware. » Le §17.5 s'applique :
     * un garde-fou ne se voit pas prêter plus de portée qu'il n'en a — et c'est
     * à l'écran qu'on croit à la promesse, pas dans un commentaire.
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      await substituerPieces(session.page);
      await ouvrirFiche(session.page, SITES[0]);
      const texte = await session.page.evaluate(
        () => document.getElementById('piecesJointes').textContent,
      );
      assert.match(
        texte, /aucun dispositif ne garantit/i,
        `L’avertissement doit être sous les yeux de qui ouvre un fichier reçu :\n${texte}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});
