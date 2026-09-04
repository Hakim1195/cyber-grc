/**
 * filiales.test.mjs — le sélecteur de filiale, vu du navigateur (lot L4).
 *
 * ── La propriété que ce fichier mesure, et pourquoi elle vaut un fichier ────
 *
 * `CONVENTIONS.md` §30.1 : le sélecteur est **le seul endroit du produit où
 * l'invariant « le périmètre vient du serveur » peut se perdre**, et il se
 * perdrait *en silence* — l'utilisateur croirait écrire chez A en écrivant chez
 * B. Le §30.2 le tranche d'une phrase :
 *
 *     **Le client envoie un CHOIX. Le serveur résout un PÉRIMÈTRE.**
 *
 * Côté navigateur, cela se traduit par une propriété observable, et c'est celle
 * qu'on mesure ici : **l'écran n'affiche jamais la filiale demandée — seulement
 * celle que le serveur annonce.** Un refus laisse donc l'écran *exactement où il
 * était*, et cela se vérifie en lisant le bandeau « Périmètre » avant, pendant
 * et après.
 *
 * ── Comportemental, jamais textuel ─────────────────────────────────────────
 *
 * Aucune assertion de ce fichier ne lit `js/app.js`. On ouvre l'application, on
 * choisit une filiale dans le `<select>` réel, et on regarde ce que l'écran dit
 * et ce que le navigateur a émis. Un contrôle qui compare deux déclarations ne
 * contrôle rien (leçon du 8ᵉ passage de la porte S2) — sauf la **morsure** du
 * §5, qui lit la source pour la MUTER, et dont c'est tout l'objet.
 *
 * ── ⚠️ Ce que ce fichier ne peut pas mesurer aujourd'hui, et pourquoi ──────
 *
 * `PUT /api/session/filiale-active` **existe** (agent K1, `src/api/index.ts`)
 * mais elle relit le **cookie de session** pour retrouver la ligne à modifier.
 * Le banc de navigateur monte le serveur en authentification *provisoire*, qui
 * n'a pas de ligne dans `sessions` : la route y répond `503`, et son propre
 * commentaire le dit. La moitié « le serveur refuse » appartient donc à
 * `test/filiales/**` (K1) ; celle qu'on mesure ici est **la réaction de
 * l'écran**, façonnée par `page.route` selon le contrat relevé dans la route
 * réelle — même montage que `connexion.test.mjs` et `journal.test.mjs`.
 *
 * Le §6 va tout de même interroger la vraie route, **sans aucune substitution**,
 * et consigne ce qu'elle répond : un contrôle non joué ne se confond pas avec un
 * contrôle réussi (constats Q-75, Q-76).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
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
 *  Le décor : deux filiales, et un serveur dont on maîtrise la réponse
 * ===================================================================== */

/** Les deux filiales du jeu d'essai, telles que `semerJeuEssai` les a nommées. */
const NOMMEES = Object.freeze({
  [FILIALE_A]: { id: FILIALE_A, code: 'ZZESSA', raison_sociale: 'Essai Toulouse' },
  [FILIALE_B]: { id: FILIALE_B, code: 'ZZESSB', raison_sociale: 'Essai Allemagne' },
});

/** Les quatorze domaines de `backend/src/api/droits.ts`. */
const TOUS_LES_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel',
  'administration', 'journal',
]);

const CONTRIBUE_PARTOUT = Object.freeze({
  niveau: 'contribution',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/**
 * Façonne les trois routes que l'écran touche, et **retient ce qui a été émis**.
 *
 * `etat.filialeServeur` est **la vérité du serveur** : c'est elle que
 * `GET api/session` annonce, et c'est donc elle — et rien d'autre — que l'écran
 * a le droit d'afficher. Un essai qui veut prouver « l'écran n'affiche pas le
 * choix » n'a qu'à laisser cette valeur en place pendant que l'utilisateur en
 * demande une autre.
 */
async function facadeServeur(page, options = {}) {
  const etat = {
    filialeServeur: options.filialeInitiale ?? FILIALE_A,
    /** Ce que la route de changement répondra : 'accepte' | 'refuse' | 'muet'. */
    verdict: options.verdict ?? 'accepte',
    /** Millisecondes de latence imposées à la route de changement. */
    latenceMs: options.latenceMs ?? 0,
    /** Le changement met-il réellement à jour la vérité du serveur ? */
    appliqueVraiment: options.appliqueVraiment !== false,
    /** Tout ce que le navigateur a envoyé vers la route dédiée. */
    demandes: [],
    /** Vrai quand la liste des filiales doit être servie (sinon : 404, comme aujourd'hui). */
    listeDisponible: options.listeDisponible !== false,
  };

  // ⚠️ Enregistrée AVANT `**/api/session` : les motifs sont distincts (l'un se
  // termine par `/session`, l'autre par `/filiale-active`), mais l'ordre rend la
  // lecture du fichier moins fragile pour qui l'éditera.
  await page.route('**/api/session/filiale-active', async (route) => {
    const requete = route.request();
    let corps = null;
    try { corps = JSON.parse(requete.postData() ?? 'null'); } catch { corps = requete.postData(); }
    etat.demandes.push({ methode: requete.method(), corps });

    if (etat.latenceMs > 0) await new Promise((r) => setTimeout(r, etat.latenceMs));

    if (etat.verdict === 'refuse') {
      return route.fulfill({
        status: 403,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({
          erreur: 'hors_perimetre',
          message:
            'Cette filiale ne fait pas partie de votre périmètre : vous restez dans celle où ' +
            'vous travailliez.',
        }),
      });
    }
    const demandee = corps && typeof corps === 'object' ? corps.filiale : null;
    if (etat.appliqueVraiment && demandee !== null && demandee !== undefined) {
      etat.filialeServeur = String(demandee);
    }
    // La forme est celle de la route réelle : `{ change, filiale_active }` —
    // **pas** une charge de session. C'est délibéré, et le §3 s'en sert.
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        change: true,
        filiale_active: NOMMEES[etat.filialeServeur] ?? { id: etat.filialeServeur },
      }),
    });
  });

  await page.route('**/api/filiales', async (route) => {
    if (!etat.listeDisponible) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ erreur: 'ressource_inconnue', message: 'Route inconnue.' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ filiales: [NOMMEES[FILIALE_A], NOMMEES[FILIALE_B]] }),
    });
  });

  /* ── Les pièces jointes, servies vides — et il faut dire pourquoi ─────────
   *
   * Ouvrir une FICHE monte le panneau des pièces jointes (`js/modules/pieces.js`),
   * qui interroge `api/pieces/<entite>/<id>`. Les routes du §31 ne sont pas
   * montées sur ce banc : sans ce décor, chaque fiche ouverte ici ferait
   * journaliser au navigateur un « 404 », et cet essai — qui ne porte pas du
   * tout sur les pièces jointes — rougirait pour la panne d'un voisin.
   *
   * ⚠️ On ne masque rien : `test/navigateur/pieces.test.mjs` mesure ce panneau,
   * décor compris, et consigne l'état réel des routes. Ici, on écarte un bruit
   * qui n'est pas le sujet.
   */
  await page.route('**/api/pieces/**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ pieces: [] }),
  }));

  await page.route('**/api/session', async (route) => {
    const vraie = await route.fetch();
    const charge = JSON.parse(await vraie.text());
    charge.filiale_active = NOMMEES[etat.filialeServeur] ?? { id: etat.filialeServeur };
    charge.perimetre_lecture = [FILIALE_A, FILIALE_B];
    charge.droits = options.droits ?? CONTRIBUE_PARTOUT;
    charge.authentification = { ...(charge.authentification ?? {}), provisoire: false };
    charge.identite = { login: 'essai', nomAffichage: 'Compte d’essai' };
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(charge),
    });
  });

  return etat;
}

/** Ouvre l'application contre la façade, et attend que le sélecteur soit là. */
async function ouvrirApplication(options = {}) {
  const session = await ouvrirPage(navigateur);
  session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  const etat = await facadeServeur(session.page, options);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    await attendreApplication(session.page, { delai: DELAI }), 'chargee',
    'L’application doit démarrer.',
  );
  await attendreQuiescence(session.page, { delai: DELAI });
  return { session, etat };
}

/** Ce que l'écran DIT du périmètre, à cet instant précis. */
async function lireBandeau(page) {
  return page.evaluate(() => {
    const el = document.getElementById('perimetre-filiale');
    const select = document.getElementById('filiale-selector');
    return {
      bandeau: el === null ? null : el.textContent.trim(),
      selection: select === null ? null : select.value,
      options: select === null ? [] : Array.from(select.options).map((o) => o.value),
      selecteurPresent: select !== null,
    };
  });
}

/** Attend que le sélecteur soit rendu (la liste arrive après le premier dessin). */
async function attendreSelecteur(page) {
  await page.waitForFunction(
    () => document.getElementById('filiale-selector') !== null,
    null, { timeout: DELAI },
  );
}

/* =====================================================================
 *  §1 — Le sélecteur existe, et il montre ce que le serveur a résolu
 * ===================================================================== */

describe('Le sélecteur de filiale montre le périmètre RÉSOLU', () => {
  test('IL EXISTE quand le périmètre porte deux filiales, et il est positionné sur l’active', async () => {
    const { session } = await ouvrirApplication();
    try {
      await attendreSelecteur(session.page);
      const vu = await lireBandeau(session.page);

      // ── Le filet refuse de passer s'il n'a rien à éprouver ────────────────
      assert.equal(vu.selecteurPresent, true, 'Aucun sélecteur : cet essai ne mesure rien.');
      assert.ok(
        vu.options.length >= 2,
        `Un sélecteur à moins de deux filiales ne fait basculer nulle part : ${JSON.stringify(vu.options)}`,
      );

      assert.equal(
        vu.selection, FILIALE_A,
        'Le sélecteur doit être positionné sur la filiale que le SERVEUR a résolue.',
      );
      assert.match(
        vu.bandeau, /Essai Toulouse/,
        `Le bandeau « Périmètre » doit nommer la filiale résolue :\n${vu.bandeau}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('UNE SEULE FILIALE au périmètre ⇒ AUCUN sélecteur', async () => {
    /* Proposer un choix qui n'en est pas apprend à cliquer sans lire — et c'est
     * le geste qu'on veut garder conscient, puisqu'il décide où l'on écrit.
     */
    const session = await ouvrirPage(navigateur);
    session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    try {
      await session.page.route('**/api/filiales', async (route) => route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ filiales: [NOMMEES[FILIALE_A]] }),
      }));
      await session.page.route('**/api/session', async (route) => {
        const vraie = await route.fetch();
        const charge = JSON.parse(await vraie.text());
        charge.filiale_active = NOMMEES[FILIALE_A];
        charge.perimetre_lecture = [FILIALE_A];
        charge.droits = CONTRIBUE_PARTOUT;
        charge.authentification = { ...(charge.authentification ?? {}), provisoire: false };
        return route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(charge),
        });
      });
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      await attendreApplication(session.page, { delai: DELAI });
      await attendreQuiescence(session.page, { delai: DELAI });
      // La liste arrive après le premier dessin : on laisse le second passer.
      await session.page.waitForTimeout(500);

      const vu = await lireBandeau(session.page);
      assert.equal(
        vu.selecteurPresent, false,
        'Une seule filiale au périmètre : il n’y a rien à choisir, donc pas de sélecteur.',
      );
      // Contrôle dans l'autre sens : le bandeau, lui, est bien là.
      assert.match(vu.bandeau, /Essai Toulouse/, vu.bandeau);
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — LE POINT DUR : un refus ne fait bouger AUCUN pixel du périmètre
 * ===================================================================== */

describe('Un choix refusé laisse la filiale active inchangée (§30.2)', () => {
  test('403 ⇒ le bandeau « Périmètre » n’a pas bougé, et le sélecteur revient', async () => {
    const { session, etat } = await ouvrirApplication({ verdict: 'refuse' });
    try {
      await attendreSelecteur(session.page);
      const avant = await lireBandeau(session.page);

      // Le geste réel : on choisit dans le `<select>`, on ne triche pas.
      await session.page.selectOption('#filiale-selector', FILIALE_B);
      await session.page.waitForFunction(
        () => document.getElementById('filiale-selector')?.disabled === false,
        null, { timeout: DELAI },
      );
      // Le refus repasse par un rendu : on attend qu'il ait eu lieu.
      await session.page.waitForTimeout(300);

      const apres = await lireBandeau(session.page);

      assert.ok(etat.demandes.length >= 1, 'Le choix doit bien avoir été envoyé au serveur.');
      assert.equal(
        apres.bandeau, avant.bandeau,
        `Le bandeau « Périmètre » a bougé alors que le serveur a REFUSÉ le changement.\n` +
          `avant : ${avant.bandeau}\napres : ${apres.bandeau}\n` +
          `§30.2 : « un choix refusé laisse la filiale active inchangée ».`,
      );
      assert.equal(
        apres.selection, FILIALE_A,
        'Le sélecteur doit revenir sur la filiale que le serveur tient pour active : ' +
          'laisser le choix refusé affiché ferait croire qu’il a pris.',
      );
      assert.doesNotMatch(
        apres.bandeau, /Allemagne/,
        `Le bandeau nomme la filiale DEMANDÉE après un refus :\n${apres.bandeau}`,
      );

      // Le refus se voit : ce n'est pas un échec silencieux.
      const message = await session.page.evaluate(
        () => (document.getElementById('toast-container')?.textContent ?? ''),
      );
      assert.match(
        message, /périmètre/i,
        `Un refus doit s’afficher comme un refus :\n${message}`,
      );

      // Un `fetch` refusé est journalisé par Chromium : c'est attendu ici.
      // Le 403 est DEMANDÉ par ce scénario : le navigateur le journalise, et ce
      // n'est pas un défaut. On l'accepte nommément plutôt que d'ouvrir la porte.
      exigerZeroErreur(session, ['status of 403']);
    } finally {
      await session.fermer();
    }
  });

  test('PENDANT que la réponse est en vol, l’écran montre encore l’ANCIENNE filiale', async () => {
    /* ── Le décalage optimiste, et pourquoi il se mesure au milieu ──────────
     *
     * Afficher la nouvelle filiale tout de suite « puis corriger si le serveur
     * refuse » paraît anodin — quelques millisecondes. Ce n'est pas anodin : sur
     * une réponse lente (VPN), sur un rechargement mal placé, ou simplement sur
     * une capture d'écran, l'utilisateur lit un périmètre qui n'est pas le sien
     * dans un outil qui sert de preuve en audit.
     *
     * On impose donc une latence et on regarde AU MILIEU. Sans cette mesure,
     * l'essai précédent serait satisfait par un écran qui affiche B pendant
     * 400 ms puis revient à A.
     */
    const { session, etat } = await ouvrirApplication({ verdict: 'refuse', latenceMs: 1200 });
    try {
      await attendreSelecteur(session.page);
      const avant = await lireBandeau(session.page);

      await session.page.selectOption('#filiale-selector', FILIALE_B);
      // En vol : la requête est partie, la réponse n'est pas arrivée.
      await session.page.waitForFunction(
        () => document.getElementById('filiale-selector')?.disabled === true,
        null, { timeout: DELAI },
      );
      const pendant = await lireBandeau(session.page);

      assert.equal(
        pendant.bandeau, avant.bandeau,
        `L’écran a affiché la filiale DEMANDÉE avant que le serveur ait répondu.\n` +
          `avant : ${avant.bandeau}\npendant : ${pendant.bandeau}\n` +
          `C’est le décalage optimiste : l’utilisateur croit écrire chez B pendant que ` +
          `le serveur écrit encore chez A.`,
      );

      await session.page.waitForFunction(
        () => document.getElementById('filiale-selector')?.disabled === false,
        null, { timeout: DELAI },
      );
      await session.page.waitForTimeout(200);
      const apres = await lireBandeau(session.page);
      assert.equal(apres.bandeau, avant.bandeau, apres.bandeau);
      assert.ok(etat.demandes.length >= 1, 'Rien n’a été émis : cet essai ne mesure rien.');
      exigerZeroErreur(session, ['status of 403']);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Ce qui s'affiche vient de `api/session`, jamais du choix
 * ===================================================================== */

describe('L’écran affiche ce que le SERVEUR annonce, pas ce qu’on a demandé', () => {
  test('LE CHOIX PART sous le nom du contrat, et par la route DÉDIÉE', async () => {
    const { session, etat } = await ouvrirApplication();
    try {
      await attendreSelecteur(session.page);
      await session.page.selectOption('#filiale-selector', FILIALE_B);
      await session.page.waitForFunction(
        () => document.getElementById('perimetre-filiale')?.textContent.includes('Allemagne'),
        null, { timeout: DELAI },
      );

      assert.equal(etat.demandes.length, 1, `Une requête, et une seule : ${JSON.stringify(etat.demandes)}`);
      const envoi = etat.demandes[0];
      assert.equal(
        envoi.methode, 'PUT',
        'La filiale active est un ATTRIBUT de la session : on le remplace (PUT), on ne ' +
          'crée pas une ressource. Verbe relevé dans `src/api/index.ts`.',
      );
      assert.deepEqual(
        envoi.corps, { filiale: FILIALE_B },
        `Le corps doit porter l’identifiant CHOISI, et rien d’autre (§30.2). Le schéma du ` +
          `serveur porte « additionalProperties: false » : un champ de plus rendrait 400. ` +
          `Reçu : ${JSON.stringify(envoi.corps)}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('LA RÉPONSE DE LA ROUTE NE FAIT PAS FOI : c’est `api/session` qu’on relit', async () => {
    /* ── Ce que cet essai empêche, et qui a bien failli être écrit ───────────
     *
     * La route rend `{ change, filiale_active }`. Ce fragment RESSEMBLE à une
     * charge de session — il en porte même le champ `filiale_active` — et ne
     * l'est pas : ni `perimetre_lecture`, ni `droits`, ni `identite`. L'adopter
     * tel quel effacerait les trois **en silence**, et l'écran perdrait ses
     * menus sans qu'aucune erreur soit levée.
     *
     * On répond donc `filiale_active = B` à la route de changement **sans**
     * changer la vérité de `api/session` (`appliqueVraiment: false`) : si
     * l'écran croit la route, il affiche B ; s'il relit la session, il affiche
     * A. Il n'y a qu'une bonne réponse, et c'est celle du §30.2.
     */
    const { session, etat } = await ouvrirApplication({ appliqueVraiment: false });
    try {
      await attendreSelecteur(session.page);
      const avant = await lireBandeau(session.page);
      await session.page.selectOption('#filiale-selector', FILIALE_B);
      await session.page.waitForFunction(
        () => document.getElementById('filiale-selector')?.disabled === false,
        null, { timeout: DELAI },
      );
      await session.page.waitForTimeout(300);
      const apres = await lireBandeau(session.page);

      assert.ok(etat.demandes.length >= 1, 'Rien n’a été émis : cet essai ne mesure rien.');
      assert.equal(
        apres.bandeau, avant.bandeau,
        `L’écran a cru la réponse de la route de changement plutôt que la session.\n` +
          `avant : ${avant.bandeau}\napres : ${apres.bandeau}`,
      );

      // Et les DROITS ont survécu : c'est l'autre moitié du même défaut.
      const droits = await session.page.evaluate(() => ({
        connus: window.Droits.connus(),
        domaines: (window.Droits.domaines() ?? []).length,
        perimetre: (window.Session.courante()?.perimetreLecture ?? []).length,
      }));
      assert.equal(droits.connus, true, 'Le bloc « droits » a été perdu au passage.');
      assert.equal(droits.domaines, TOUS_LES_DOMAINES.length, JSON.stringify(droits));
      assert.equal(droits.perimetre, 2, `Le périmètre de lecture a été perdu : ${JSON.stringify(droits)}`);
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('UNE BASCULE ACCEPTÉE affiche la filiale ANNONCÉE, et recharge le jeu de données', async () => {
    // Sans lui, « le bandeau ne bouge pas » serait aussi ce que rend un sélecteur cassé.
    const { session, etat } = await ouvrirApplication();
    try {
      await attendreSelecteur(session.page);
      const donneesAvant = application.appelsPar('GET').filter((a) => a.chemin.startsWith('/api/donnees')).length;

      // On bascule DEPUIS UNE FICHE : l'identifiant qu'elle porte appartient à la
      // filiale qu'on quitte, et les identifiants sont uniques à l'échelle du
      // produit (§2). Rester dessus afficherait « introuvable » juste après un
      // changement réussi — ce qui se lit comme une panne.
      const idFiche = await session.page.evaluate(() => {
        const liste = window.DataStore.getDocuments();
        return liste.length ? liste[0].id : null;
      });
      assert.ok(idFiche, 'Aucun document au jeu d’essai : ce contrôle ne mesurerait rien.');
      await session.page.evaluate((h) => { window.location.hash = h; }, `#/documents/${idFiche}`);
      await session.page.waitForTimeout(200);

      await session.page.selectOption('#filiale-selector', FILIALE_B);
      await session.page.waitForFunction(
        () => document.getElementById('perimetre-filiale')?.textContent.includes('Allemagne'),
        null, { timeout: DELAI },
      );
      await attendreQuiescence(session.page, { delai: DELAI });

      const apres = await lireBandeau(session.page);
      assert.match(apres.bandeau, /Essai Allemagne/, apres.bandeau);
      assert.equal(apres.selection, FILIALE_B, 'Le sélecteur suit la session.');
      assert.equal(etat.filialeServeur, FILIALE_B, 'Le serveur a bien enregistré le choix.');

      const routeApres = await session.page.evaluate(() => window.location.hash);
      assert.equal(
        routeApres.includes(idFiche), false,
        `L’écran est resté sur la fiche « ${idFiche} », qui appartient à la filiale QUITTÉE : ` +
          `${routeApres}. Elle ne peut pas exister dans la filiale rejointe (identifiants ` +
          `uniques à l’échelle du produit), et « introuvable » juste après une bascule ` +
          `réussie se lit comme une panne.`,
      );

      const donneesApres = application.appelsPar('GET').filter((a) => a.chemin.startsWith('/api/donnees')).length;
      assert.ok(
        donneesApres > donneesAvant,
        'Le jeu de données appartient à la filiale : il doit être rechargé après la ' +
          'bascule. Le garder afficherait les risques de A sous le bandeau de B — ' +
          `mensonge complet. Appels /api/donnees : ${donneesAvant} → ${donneesApres}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 bis — Ce qui attend d'être écrit appartient à la filiale qu'on quitte
 * ===================================================================== */

describe('Une saisie non enregistrée interdit la bascule', () => {
  test('TANT QU’UNE ÉCRITURE ATTEND, le choix n’est même pas envoyé', async () => {
    /* ── Le défaut que cet essai empêche, et il est silencieux ──────────────
     *
     * `js/core/sync.js` regroupe les écritures : une saisie faite il y a
     * 300 ms n'est pas encore partie. Basculer maintenant la ferait partir
     * APRÈS le changement — et le serveur l'écrirait dans la NOUVELLE filiale,
     * puisque c'est la ligne de session qui décide où atterrissent les
     * écritures (`f_filiale_ecriture()`, §30.2).
     *
     * Une modification saisie chez A finirait chez B, **sans un mot**, dans un
     * outil qui sert de preuve en audit. Ce n'est pas un défaut d'affichage :
     * c'est une donnée qui traverse la frontière que tout le produit existe
     * pour tenir.
     *
     * On bloque donc les écritures au niveau du frontal (503, une panne de
     * passerelle — `sync.js` la juge passagère et garde la saisie), puis on
     * demande la bascule.
     */
    const { session, etat } = await ouvrirApplication();
    try {
      await attendreSelecteur(session.page);
      const avant = await lireBandeau(session.page);

      application.definirStatutEcriture(503);
      await session.page.evaluate(() => {
        DataStore.addRisque({
          id: UI.genId('RISK'),
          nom: 'Saisie qui n’est pas encore partie',
          gravite: 3, frequence: 3,
        });
      });
      // On attend que le navigateur ait ESSAYÉ et échoué : sans cela, on
      // mesurerait une écriture qui n'a pas encore quitté le minuteur, et le
      // refus viendrait d'un hasard de calendrier.
      await session.page.waitForFunction(
        () => { const e = window.Sync.etat(); return e.enAttente === true && e.enCours === false; },
        null, { timeout: DELAI },
      );

      const rendu = await session.page.evaluate(
        (cible) => window.changerFilialeActive(cible), FILIALE_B,
      );
      await session.page.waitForTimeout(300);
      const apres = await lireBandeau(session.page);

      assert.equal(rendu, false, 'La bascule doit être refusée tant qu’une écriture attend.');
      assert.equal(
        etat.demandes.length, 0,
        `Le choix a été ENVOYÉ alors qu’une saisie attendait : ${JSON.stringify(etat.demandes)}. ` +
          `Si le serveur l’avait accepté, la saisie serait partie dans la filiale rejointe.`,
      );
      assert.equal(apres.bandeau, avant.bandeau, `${avant.bandeau} → ${apres.bandeau}`);
      assert.equal(apres.selection, FILIALE_A, 'Le sélecteur revient sur la filiale active.');

      const message = await session.page.evaluate(
        () => document.getElementById('toast-container')?.textContent ?? '',
      );
      assert.match(
        message, /pas encore enregistr/i,
        `Le refus doit DIRE pourquoi — sans quoi l’utilisateur reclique :\n${message}`,
      );

      // Et la saisie est toujours là : refuser la bascule ne détruit rien.
      const survivante = await session.page.evaluate(
        () => window.DataStore.getRisques().some((r) => r.nom === 'Saisie qui n’est pas encore partie'),
      );
      assert.equal(survivante, true, 'Le refus de bascule ne doit rien perdre de la saisie.');

      // Un 503 sur l'écriture est PROVOQUÉ par cet essai.
      exigerZeroErreur(session, ['status of 503']);
    } finally {
      application.definirStatutEcriture(null);
      await session.fermer();
    }
  });

  test('CONTRÔLE DANS L’AUTRE SENS : une fois l’écriture passée, la bascule repart', async () => {
    // Sans lui, « la bascule est refusée » serait aussi ce que rend un sélecteur
    // définitivement cassé.
    const { session, etat } = await ouvrirApplication();
    try {
      await attendreSelecteur(session.page);
      await session.page.evaluate(() => {
        DataStore.addRisque({
          id: UI.genId('RISK'), nom: 'Saisie qui part normalement', gravite: 2, frequence: 2,
        });
      });
      await attendreQuiescence(session.page, { delai: DELAI });

      const rendu = await session.page.evaluate(
        (cible) => window.changerFilialeActive(cible), FILIALE_B,
      );
      assert.equal(rendu, true, 'Rien n’attend : la bascule doit aboutir.');
      assert.equal(etat.demandes.length, 1, JSON.stringify(etat.demandes));
      const apres = await lireBandeau(session.page);
      assert.match(apres.bandeau, /Essai Allemagne/, apres.bandeau);
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — L'invariant de forme : aucune AUTRE requête ne porte de filiale
 * ===================================================================== */

describe('Aucune autre route ne transporte de filiale (§30.2, contrôle S2)', () => {
  test('CHARGEMENT, NAVIGATION ET ÉCRITURE n’émettent « filiale » nulle part', async () => {
    /* §30.2 : « Le sélecteur est une route DÉDIÉE, pas un paramètre ajouté aux
     * routes existantes. Un agent qui serait tenté d'ajouter `?filiale=` à
     * `/api/donnees` doit s'arrêter : ce serait la fin de la propriété. »
     *
     * On ne le lit pas dans la source : on écoute **ce que le navigateur émet**,
     * sur un parcours qui charge, navigue et ÉCRIT.
     */
    const { session } = await ouvrirApplication();
    try {
      const emis = [];
      session.page.on('request', (r) => {
        const url = new URL(r.url());
        if (!url.pathname.startsWith('/api/')) return;
        emis.push({ chemin: url.pathname, requete: url.search, corps: r.postData() ?? '' });
      });

      await attendreSelecteur(session.page);
      // ⚠️ L'écoute est posée APRÈS le démarrage : le chargement initial est déjà
      // passé. On rejoue donc les trois chemins qui portent un périmètre — le
      // sondage, l'écriture, le rechargement — par les fonctions du produit, et
      // non par des `fetch` fabriqués ici : ce qu'on veut mesurer est ce que la
      // SPA émet, pas ce que l'essai sait écrire.
      await session.page.evaluate(() => { window.location.hash = '#/risques'; });
      await session.page.waitForTimeout(200);
      await session.page.evaluate(() => window.Sync.sonder());
      await session.page.evaluate(() => {
        DataStore.addRisque({
          id: UI.genId('RISK'),
          nom: 'Risque posé par le banc',
          gravite: 2, frequence: 2,
        });
      });
      await attendreQuiescence(session.page, { delai: DELAI });
      await session.page.evaluate(() => window.Sync.recharger());
      await session.page.evaluate(() => { window.location.hash = '#/actifs'; });
      await session.page.waitForTimeout(200);

      // Le filet refuse de passer s'il n'a rien à éprouver.
      assert.ok(emis.length >= 3, `Trop peu de requêtes observées : ${JSON.stringify(emis)}`);
      assert.ok(
        emis.some((e) => e.corps.length > 0),
        `Aucune ÉCRITURE observée : le contrôle ne porterait que sur des lectures. ${JSON.stringify(emis)}`,
      );

      const dedie = '/api/session/filiale-active';
      for (const e of emis) {
        if (e.chemin === dedie) continue;
        assert.doesNotMatch(
          e.requete, /filiale/i,
          `« filiale » apparaît dans la requête de ${e.chemin} : ${e.requete}. C’est la fin ` +
            `de l’invariant du §30.2 — le périmètre viendrait du navigateur.`,
        );
        assert.doesNotMatch(
          e.corps, /"filiale/i,
          `« filiale » apparaît dans le CORPS de ${e.chemin} : ${e.corps.slice(0, 200)}`,
        );
      }
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });

  test('LA SESSION N’A TOUJOURS AUCUN MUTATEUR, et rien de tel ne survit dans le stockage', async () => {
    const { session } = await ouvrirApplication();
    try {
      await attendreSelecteur(session.page);
      await session.page.selectOption('#filiale-selector', FILIALE_B);
      await session.page.waitForFunction(
        () => document.getElementById('perimetre-filiale')?.textContent.includes('Allemagne'),
        null, { timeout: DELAI },
      );

      const vu = await session.page.evaluate(() => ({
        // `adopter` est le SEUL écrivain, et il ne prend qu'une charge de serveur.
        mutateurs: Object.keys(window.Session).filter((k) => /^(set|definir|choisir|changer)/i.test(k)),
        gele: Object.isFrozen(window.Session.courante()),
        // Rien qui ressemble à un périmètre ne survit d'une session à l'autre.
        stockage: Object.keys(window.localStorage),
      }));

      assert.deepEqual(
        vu.mutateurs, [],
        `« Session » a gagné un mutateur : ${JSON.stringify(vu.mutateurs)}. La propriété du ` +
          `§30 est tenue par la FORME — le sélecteur change la filiale CÔTÉ SERVEUR puis ` +
          `relit la session, jamais l’inverse.`,
      );
      assert.equal(vu.gele, true, 'L’état de session doit rester gelé.');
      assert.deepEqual(
        vu.stockage.filter((c) => /context|filiale|perimetre|vault/i.test(c)), [],
        `Une clé qui ressemble à un périmètre a été écrite dans le stockage : ${JSON.stringify(vu.stockage)}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §5 — MORSURE : sans la relecture, l'écran ment
 * ===================================================================== */

describe('Morsure — l’essai du §2 mesure-t-il vraiment la propriété ?', () => {
  test('EN AFFICHANT LE CHOIX AVANT LA RÉPONSE, le refus laisse un bandeau FAUX', async () => {
    /* « Un correctif accepté n'est pas un correctif sûr. La seule preuve qu'il
     * tient est la MUTATION — le casser et vérifier que le banc rougit. »
     * (`CLAUDE.md` §8, leçon du 6ᵉ passage de la porte S2.)
     *
     * Le dépôt n'est pas modifié : `definirSubstitution` sert au navigateur un
     * `js/app.js` qui affiche le choix AVANT d'envoyer la requête — le décalage
     * optimiste, écrit exprès. Si le bandeau restait juste malgré cela, c'est
     * que le §2 ne mesure pas ce qu'il croit.
     */
    const source = readFileSync(join(RACINE_FRONTEND, 'js', 'app.js'), 'utf8');
    const ancre = '        await Api.choisirFilialeActive(filialeChoisie);\n        await Session.charger();';
    assert.ok(
      source.includes(ancre),
      'La bascule de `js/app.js` n’a plus la forme que cette morsure sait muter. Ce n’est ' +
        'pas forcément un défaut — mais la morsure ne mord plus, et une morsure qui ne ' +
        'mord pas est un décor.',
    );
    const optimiste =
      '        Session.adopter({ filiale_active: { id: filialeChoisie, code: "OPT", ' +
      'raison_sociale: "Filiale demandee" }, perimetre_lecture: [], droits: null });\n' +
      '        if (window.renderContextSelector) window.renderContextSelector();\n' + ancre;
    const mutante = source.replace(ancre, optimiste);
    assert.notEqual(mutante, source, 'La substitution n’a rien remplacé.');

    // ⚠️ Posée AVANT la première ouverture : ouvrir puis substituer puis
    // recharger laisse Chromium servir le fichier d'origine depuis son cache
    // mémoire — la morsure passerait alors pour « rien n'a bougé », c'est-à-dire
    // exactement le verdict qu'elle doit rendre impossible.
    application.definirSubstitution('/js/app.js', mutante);
    let session;
    try {
      const ouvert = await ouvrirApplication({ verdict: 'refuse' });
      session = ouvert.session;
      await attendreSelecteur(session.page);
      const avant = await lireBandeau(session.page);
      assert.match(avant.bandeau, /Essai Toulouse/, `Départ inattendu : ${avant.bandeau}`);

      await session.page.selectOption('#filiale-selector', FILIALE_B);
      await session.page.waitForFunction(
        () => document.getElementById('filiale-selector')?.disabled === false,
        null, { timeout: DELAI },
      );
      await session.page.waitForTimeout(300);
      const apres = await lireBandeau(session.page);

      assert.notEqual(
        apres.bandeau, avant.bandeau,
        `Le décalage optimiste a été introduit et le bandeau est resté juste ` +
          `(« ${apres.bandeau} »). L’essai du §2 mesure donc autre chose que la propriété — ` +
          `un décor, au sens du dépôt.`,
      );
      assert.match(
        apres.bandeau, /Filiale demandee/,
        `La mutation doit produire exactement le mensonge que le §2 interdit : ${apres.bandeau}`,
      );
    } finally {
      application.definirSubstitution('/js/app.js', null);
      await session?.fermer();
    }
  });
});

/* =====================================================================
 *  §6 — La vraie route, sans substitution : ce qu'elle répond ici
 * ===================================================================== */

describe('La route réelle, interrogée sans décor', () => {
  test('L’INTERFACE N’EST PAS LA BARRIÈRE : le serveur décide, et on consigne ce qu’il dit', async (t) => {
    /* Aucune substitution ici : c'est le vrai `PUT /api/session/filiale-active`
     * qui répond. Un contrôle non joué ne se confond pas avec un contrôle réussi
     * (constats Q-75, Q-76) : on affirme donc seulement ce que la mesure permet
     * — **aucun 2xx** — et on consigne le reste.
     */
    const session = await ouvrirPage(navigateur);
    session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      await attendreApplication(session.page, { delai: DELAI });

      const issue = await session.page.evaluate(async (cible) => {
        const r = await fetch('api/session/filiale-active', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filiale: cible }),
          credentials: 'same-origin',
          cache: 'no-store',
        });
        return { statut: r.status, corps: (await r.text()).slice(0, 300) };
      }, FILIALE_B);

      assert.equal(
        issue.statut >= 200 && issue.statut < 300, false,
        `Le serveur a ACCEPTÉ une filiale sans session serveur à modifier (statut ` +
          `${String(issue.statut)}).\n${issue.corps}`,
      );

      if (issue.statut === 503) {
        t.diagnostic(
          'La route répond 503 : le banc de navigateur monte l’authentification PROVISOIRE, ' +
            'qui n’a pas de ligne dans « sessions » — la route le dit elle-même. Le refus ' +
            'mesuré ici n’est donc PAS celui du périmètre. Cette moitié appartient à ' +
            '`test/filiales/**` (agent K1), contre une session réelle.',
        );
      } else {
        t.diagnostic(`La route a répondu ${String(issue.statut)} : ${issue.corps}`);
      }

      // Et la propriété qui compte tient quoi qu'il arrive : rien n'a bougé.
      const apres = await session.page.evaluate(
        () => document.getElementById('perimetre-filiale')?.textContent.trim() ?? null,
      );
      assert.doesNotMatch(
        String(apres), /Allemagne/,
        `Un appel direct refusé a tout de même déplacé l’affichage : ${apres}`,
      );
      // La route réelle rend 503 ici (session provisoire) : voir le diagnostic ci-dessus.
      exigerZeroErreur(session, ['status of 503']);
    } finally {
      await session.fermer();
    }
  });
});
