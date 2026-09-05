/**
 * imports.test.mjs — l'écran « Import généralisé » (lot L7), en Chromium réel.
 *
 * ── Ce que ce fichier mesure, et pourquoi la base est interrogée directement ──
 *
 * `CONVENTIONS.md` §33 fait de l'aperçu un import RÉEL qui écrit puis annule sa
 * transaction : le seul essai qui prouve « rien n'a été enregistré » est celui
 * qui va LIRE LA BASE après l'aperçu, pas celui qui lit l'écran — un écran peut
 * afficher un message juste après un serveur qui a menti. C'est le motif de la
 * connexion `base.connexion('app')` ci-dessous : la même que le serveur emploie,
 * interrogée avec le périmètre de la filiale active réellement utilisée par la
 * session (lue dans le navigateur, jamais supposée).
 *
 * ⚠️ **Matière, pas de silence pris pour une preuve.** Un essai qui importerait
 * zéro ligne et conclurait « rien n'a fui » ne prouverait rien : chaque test lit
 * le nombre de lignes RÉELLEMENT candidates (`lues`, `creees`) avant de conclure
 * quoi que ce soit sur la base.
 *
 * ── L'entité choisie pour ces essais : `actifs` ─────────────────────────────
 *
 * `db/migrations/002_metier_noyau.sql` : une seule colonne obligatoire (`nom`,
 * `not null` + `nom <> ''`), deux colonnes à liste fermée (`type`, `criticite`,
 * vérifiées par `ck_actifs_type`/`ck_actifs_criticite`), aucune colonne JSON,
 * aucune colonne numérique — le candidat le plus simple pour construire des
 * fichiers de test à la main, valides ou délibérément fautifs.
 *
 * ── Ce que cet essai NE couvre PAS ──────────────────────────────────────────
 *
 * Le modèle de droits par profil (comme `pieces.test.mjs` l'éprouve pour les
 * pièces jointes) : la session provisoire de `monterServeurReel` rend des
 * droits COMPLETS (`src/api/index.ts`, entête d'`OptionsApi`), ce qui est le
 * bon montage pour éprouver l'ÉCRAN — chargement du catalogue, aperçu,
 * application, idempotence, rapport d'erreurs — indépendamment de qui parle.
 * Le modèle de droits par domaine appartient à `test/droits/**` et à la porte
 * de sécurité, pas à cet écran.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** Même raison qu'aux autres essais de navigateur : plusieurs Chromium en parallèle. */
const DELAI = 60_000;

/**
 * `CLAUDE.md` §5 : « 0 erreur » — exceptions de script ET messages d'erreur de
 * console. `motifsAcceptes` sert aux essais qui provoquent VOLONTAIREMENT un
 * refus HTTP : Chromium journalise « Failed to load resource: the server
 * responded with a status of 409 » pour toute réponse fetch non-2xx, y compris
 * une réponse parfaitement normale du point de vue applicatif (un rapport
 * d'import avec des lignes refusées). Le taire globalement masquerait une
 * vraie panne ; le taire au cas par cas, avec le motif exact attendu, ne masque
 * que ce que le scénario a lui-même demandé.
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
 *  Montage de l'écran
 * ===================================================================== */

async function ouvrirApplication(options = {}) {
  const session = await ouvrirPage(navigateur, options);
  session.page.on('dialog', (d) => {
    d.dismiss().catch(() => {});
  });
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    await attendreApplication(session.page, { delai: DELAI }),
    'chargee',
    'L’application doit démarrer.',
  );
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/** Va sur `/imports`, attend le catalogue, choisit l'entité. */
async function ouvrirEcranImports(session, entite) {
  await session.page.evaluate(() => {
    window.location.hash = '#/imports';
  });
  // Le catalogue est chargé de manière asynchrone (`GET /api/import/modeles`) :
  // attendre l'ÉTAT (plusieurs options présentes), jamais un délai fixe.
  await session.page.waitForFunction(
    () => document.querySelectorAll('#impEntiteSelect option').length > 1,
    null,
    { timeout: DELAI },
  );
  await session.page.selectOption('#impEntiteSelect', entite);
  await session.page.waitForSelector('#impColonnes .imp-colonnes-table', { timeout: DELAI });
}

/** Filiale ACTIVE de la session — celle où l'import écrit, jamais supposée. */
async function filialeActive(session) {
  const id = await session.page.evaluate(() => {
    const s = window.Session && window.Session.courante();
    return s ? s.filialeId : null;
  });
  assert.ok(id, 'La session doit porter une filiale active : cet essai ne mesurerait rien sans elle.');
  return id;
}

/** Compte, EN BASE, les actifs dont le nom est dans la liste — jamais lu sur l'écran. */
async function compterActifs(filialeId, noms) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('essai-imports', filialeId), async (c) =>
    Number(await base.valeur(c, 'select count(*)::int from "actifs" where "nom" = any($1)', [noms])),
  );
}

function csvActifs(lignes) {
  const entete = 'Nom,Type,Criticité,Responsable,Description';
  return Buffer.from([entete, ...lignes].join('\n'), 'utf8');
}

async function deposerFichier(session, nomFichier, contenu) {
  await session.page.setInputFiles('#impFichier', {
    name: nomFichier,
    mimeType: 'text/csv',
    buffer: contenu,
  });
}

/** Les cinq compteurs du résumé, DANS L'ORDRE où `imports.js` les écrit. */
async function lireResume(page) {
  const valeurs = await page.$$eval('#impRapport .imp-resume strong', (els) =>
    els.map((e) => e.textContent.trim()),
  );
  assert.equal(valeurs.length, 5, `Le résumé du rapport n’a pas cinq compteurs : ${JSON.stringify(valeurs)}`);
  return {
    lues: Number(valeurs[0]),
    creees: Number(valeurs[1]),
    misesAJour: Number(valeurs[2]),
    ignorees: Number(valeurs[3]),
    enErreur: Number(valeurs[4]),
  };
}

async function lireErreurs(page) {
  return page.$$eval('#impRapport .imp-erreurs-table tbody tr', (trs) =>
    trs.map((tr) => {
      const tds = tr.querySelectorAll('td');
      return {
        ligne: tds[0] ? tds[0].textContent.trim() : '',
        colonne: tds[1] ? tds[1].textContent.trim() : '',
        valeur: tds[2] ? tds[2].textContent.trim() : '',
        message: tds[3] ? tds[3].textContent.trim() : '',
      };
    }),
  );
}

function jeton() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Lit un téléchargement Playwright en mémoire — pour vérifier le CONTENU, pas un nom. */
async function lireTelechargement(download) {
  const flux = await download.createReadStream();
  const morceaux = [];
  for await (const morceau of flux) morceaux.push(morceau);
  return Buffer.concat(morceaux);
}

/* =====================================================================
 *  §1 — Le catalogue et le modèle d'une entité
 * ===================================================================== */

describe('Le catalogue des modèles se lit à l’écran', () => {
  test('L’ENTITÉ CHOISIE affiche ses colonnes, l’obligatoire, et ce qui n’est pas repris', async () => {
    const session = await ouvrirApplication();
    try {
      await ouvrirEcranImports(session, 'actifs');

      const options = await session.page.$$eval('#impEntiteSelect option', (els) => els.length);
      assert.ok(
        options > 5,
        `Seules ${String(options)} option(s) dans le sélecteur : le catalogue des 23 entités ` +
          'n’est probablement pas celui rendu par le serveur.',
      );

      const vu = await session.page.evaluate(() => ({
        texte: document.getElementById('impColonnes').textContent,
        // La ligne « Nom » doit porter « Oui » (obligatoire) dans la même <tr>.
        ligneNom: Array.from(document.querySelectorAll('#impColonnes tbody tr'))
          .map((tr) => tr.textContent)
          .find((t) => t.includes('Nom')),
      }));
      assert.ok(vu.ligneNom, `Aucune ligne « Nom » dans le tableau des colonnes :\n${vu.texte}`);
      assert.match(
        vu.ligneNom, /Oui/,
        `La colonne « Nom » (obligatoire en base : NOT NULL) doit être marquée Oui :\n${vu.ligneNom}`,
      );
      assert.match(
        vu.texte, /risques_lies/,
        `Les liaisons exclues (risques_lies, dependances) doivent être nommées, pas tues :\n${vu.texte}`,
      );
      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — Le téléchargement du modèle N'EST PAS un export
 * ===================================================================== */

describe('Le modèle vierge se télécharge sans droit d’export', () => {
  /**
   * ⚠️ **Ce que ce test NE vérifie PAS, et pourquoi.**
   *
   * Une première rédaction affirmait `download.suggestedFilename() ===
   * 'modele-import-actifs.xlsx'` — le nom que `src/import/index.ts` pose dans
   * `content-disposition`. **Mesuré faux** : Chromium rendait `modele.xlsx`
   * (le dernier segment de l'URL, sans la chaîne de requête, avec l'extension
   * déduite du `content-type`). La cause n'est pas cet écran : le relais HTTP
   * partagé de `test/aide/navigateur.mjs` (`servirApplication`, fonction
   * `entetesApi`) ne recopie QUE `content-type` (et `set-cookie`) depuis la
   * réponse injectée de Fastify — `content-disposition` n'y voyage jamais.
   * `navigateur.mjs` n'appartient pas au périmètre de cet agent, et aucun essai
   * existant ne l'avait déjà mesuré : `pieces.test.mjs` construit le nom d'un
   * téléchargement depuis le CORPS JSON (`nom_fichier`), jamais depuis cet
   * en-tête, et n'aurait donc jamais buté sur ce trou.
   *
   * Ce que ce test vérifie à la place — plus fort qu'un nom de fichier : que
   * le clic produit un VRAI téléchargement (pas une page d'erreur JSON), et
   * que son CONTENU est bien celui de l'entité choisie, dans le bon format.
   */
  test('LES DEUX FORMATS produisent un vrai téléchargement, dont le contenu correspond à l’entité', async () => {
    const session = await ouvrirApplication({ contexte: { acceptDownloads: true } });
    try {
      await ouvrirEcranImports(session, 'actifs');

      const [telechargementXlsx] = await Promise.all([
        session.page.waitForEvent('download', { timeout: DELAI }),
        session.page.click('#impGabaritClasseurBtn'),
      ]);
      const octetsXlsx = await lireTelechargement(telechargementXlsx);
      assert.ok(octetsXlsx.length > 500, `Le classeur téléchargé est suspicieusement petit (${String(octetsXlsx.length)} o).`);
      assert.deepEqual(
        [...octetsXlsx.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04],
        'Le fichier téléchargé ne porte pas la signature ZIP (PK\\x03\\x04) : ce n’est pas un .xlsx exploitable.',
      );

      const [telechargementCsv] = await Promise.all([
        session.page.waitForEvent('download', { timeout: DELAI }),
        session.page.click('#impGabaritTexteBtn'),
      ]);
      const texteCsv = (await lireTelechargement(telechargementCsv)).toString('utf8');
      assert.match(
        texteCsv, /Nom/,
        `Le modèle CSV de « actifs » doit porter l’en-tête « Nom » :\n${texteCsv.slice(0, 200)}`,
      );

      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Le cycle complet : aperçu sans écriture, application, idempotence
 *  ---------------------------------------------------------------------
 *  Un seul test, une seule page : le geste réel de l'utilisateur est de
 *  choisir un fichier UNE FOIS puis d'enchaîner aperçu → application →
 *  (par erreur ou pour vérifier) une seconde application. Le rouvrir à
 *  chaque étape perdrait justement ce que l'écran existe pour préserver —
 *  la sélection du fichier — et masquerait un défaut si `imports.js`
 *  la perdait en cours de route.
 * ===================================================================== */

describe('Aperçu, application, puis réenvoi du même fichier', () => {
  test('L’APERÇU annonce ses lignes SANS écrire, l’application écrit, le réenvoi ne crée rien', async () => {
    const session = await ouvrirApplication();
    try {
      await ouvrirEcranImports(session, 'actifs');
      const filialeId = await filialeActive(session);
      const t = jeton();
      const noms = [`ACTIF-IMPORT-${t}-1`, `ACTIF-IMPORT-${t}-2`, `ACTIF-IMPORT-${t}-3`,
        `ACTIF-IMPORT-${t}-4`, `ACTIF-IMPORT-${t}-5`];
      const fichier = csvActifs([
        `${noms[0]},Logiciel,critique,DSI,Progiciel de gestion`,
        `${noms[1]},Matériel,élevée,IT Ops,Baie de stockage`,
        `${noms[2]},Donnée,critique,DPO,Base clients`,
        `${noms[3]},Service,modérée,IT,Messagerie`,
        `${noms[4]},Humain,faible,Direction,Astreinte infogérance`,
      ]);

      // ── Avant tout envoi : rien de cela n'existe en base (matière du côté négatif) ──
      assert.equal(await compterActifs(filialeId, noms), 0);

      await deposerFichier(session, 'actifs-cycle.csv', fichier);
      assert.equal(
        await session.page.isDisabled('#impAppliquerBtn'), true,
        'Un fichier tout juste choisi ne doit pas pouvoir être appliqué sans aperçu.',
      );

      /* ---- APERÇU : compte réel, ZÉRO écriture ---------------------- */
      await session.page.click('#impApercuBtn');
      await session.page.waitForFunction(
        () => /Aperçu/.test(document.querySelector('#impRapport h3')?.textContent || ''),
        null, { timeout: DELAI },
      );
      const resumeApercu = await lireResume(session.page);
      // ⚠️ Matière : si `lues`/`creees` valaient 0 ici, le test qui suit ne
      // prouverait rien en constatant que la base est à 0.
      assert.deepEqual(
        resumeApercu, { lues: 5, creees: 5, misesAJour: 0, ignorees: 0, enErreur: 0 },
        `Résumé d’aperçu inattendu : ${JSON.stringify(resumeApercu)}`,
      );
      assert.equal(
        await compterActifs(filialeId, noms), 0,
        'L’aperçu a laissé des lignes en base : ce n’est plus un aperçu.',
      );
      assert.equal(
        await session.page.isDisabled('#impAppliquerBtn'), false,
        'Un aperçu propre (0 erreur) doit permettre l’application.',
      );

      /* ---- APPLICATION : le même fichier, cette fois écrit ---------- */
      await session.page.click('#impAppliquerBtn');
      await session.page.waitForFunction(
        () => /appliqu/i.test(document.querySelector('#impRapport h3')?.textContent || ''),
        null, { timeout: DELAI },
      );
      const resumeApplique = await lireResume(session.page);
      assert.deepEqual(
        resumeApplique, { lues: 5, creees: 5, misesAJour: 0, ignorees: 0, enErreur: 0 },
        `Résumé d’application inattendu : ${JSON.stringify(resumeApplique)}`,
      );
      assert.equal(
        await compterActifs(filialeId, noms), 5,
        'Les 5 actifs du fichier ne se retrouvent pas en base après l’application.',
      );

      /* ---- RÉENVOI DU MÊME FICHIER : idempotent, et l'écran le dit -- */
      await session.page.click('#impAppliquerBtn');
      await session.page.waitForFunction(
        () => /déjà/i.test(document.querySelector('#impRapport')?.textContent || ''),
        null, { timeout: DELAI },
      );
      const texteApresReenvoi = await session.page.evaluate(
        () => document.getElementById('impRapport').textContent,
      );
      assert.match(
        texteApresReenvoi, /déjà été importé|déjà import/i,
        `L’écran ne dit pas que ce fichier a déjà été importé :\n${texteApresReenvoi}`,
      );
      assert.equal(
        await compterActifs(filialeId, noms), 5,
        'Le réenvoi du même fichier a créé des lignes supplémentaires : ce n’est plus idempotent.',
      );

      exigerZeroErreur(session);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — Un fichier partiellement fautif : rapport ligne à ligne, rien n'écrit
 * ===================================================================== */

describe('Un fichier partiellement fautif est intégralement refusé', () => {
  test('K ERREURS SUR N LIGNES, avec leur numéro et leur colonne — et zéro écriture', async () => {
    const session = await ouvrirApplication();
    try {
      await ouvrirEcranImports(session, 'actifs');
      const filialeId = await filialeActive(session);
      const t = jeton();
      const nomA = `ACTIF-IMPORT-ERR-${t}-A`;
      const nomB = `ACTIF-IMPORT-ERR-${t}-B`;
      const nomC = `ACTIF-IMPORT-ERR-${t}-C`; // porté par la ligne à critère invalide
      const nomD = `ACTIF-IMPORT-ERR-${t}-D`;
      // Ligne 2 (données) = ligne 3 du fichier, en-tête comprise ; les lignes
      // du tableau ci-dessous sont donc les lignes 2 à 6 du fichier reçu.
      const fichier = csvActifs([
        `${nomA},Logiciel,faible,DSI,Ligne saine`,                 // ligne 2 — valide
        `${nomB},Matériel,modérée,IT,Ligne saine`,                 // ligne 3 — valide
        `,Logiciel,faible,DSI,Sans nom : obligatoire manquant`,    // ligne 4 — FAUTIVE (Nom)
        `${nomC},Logiciel,extreme,DSI,Criticité hors liste fermée`, // ligne 5 — FAUTIVE (Criticité)
        `${nomD},Service,critique,RSSI,Ligne saine`,               // ligne 6 — valide
      ]);
      const nomsCandidats = [nomA, nomB, nomC, nomD];

      assert.equal(await compterActifs(filialeId, nomsCandidats), 0);

      await deposerFichier(session, 'actifs-fautif.csv', fichier);
      await session.page.click('#impApercuBtn');
      await session.page.waitForFunction(
        () => /refus/i.test(document.querySelector('#impRapport h3')?.textContent || ''),
        null, { timeout: DELAI },
      );

      const resume = await lireResume(session.page);
      // Matière : 5 lignes LUES (dont les 2 fautives), 0 créée, exactement 2 en erreur.
      assert.deepEqual(
        resume, { lues: 5, creees: 0, misesAJour: 0, ignorees: 0, enErreur: 2 },
        `Résumé inattendu sur un fichier à 2 erreurs sur 5 lignes : ${JSON.stringify(resume)}`,
      );

      const erreurs = await lireErreurs(session.page);
      assert.equal(erreurs.length, 2, `Le tableau d’erreurs ne porte pas 2 lignes : ${JSON.stringify(erreurs)}`);

      const parNomDeLigne = Number(erreurs[0].ligne) < Number(erreurs[1].ligne) ? erreurs : [erreurs[1], erreurs[0]];
      const [ligne4, ligne5] = parNomDeLigne;

      assert.equal(ligne4.ligne, '4', `La ligne fautive « Nom manquant » doit porter le numéro 4 : ${JSON.stringify(ligne4)}`);
      assert.equal(ligne4.colonne, 'Nom', `La colonne fautive doit être « Nom » : ${JSON.stringify(ligne4)}`);
      assert.match(
        ligne4.message, /obligatoire/i,
        `Le message de la ligne 4 doit dire que la valeur est obligatoire : ${JSON.stringify(ligne4)}`,
      );

      assert.equal(ligne5.ligne, '5', `La ligne fautive « Criticité invalide » doit porter le numéro 5 : ${JSON.stringify(ligne5)}`);
      assert.equal(
        ligne5.colonne, 'Criticité',
        `La colonne fautive doit être « Criticité » (contrainte ck_actifs_criticite) : ${JSON.stringify(ligne5)}`,
      );
      assert.ok(ligne5.message.length > 0, 'La ligne 5 doit porter un message, pas seulement un numéro.');

      // ⚠️ Tout ou rien : même les 3 lignes SAINES du même fichier (A, B, D)
      // ne doivent avoir laissé aucune trace.
      assert.equal(
        await compterActifs(filialeId, nomsCandidats), 0,
        'Des lignes ont été écrites malgré un import refusé : la propriété « tout ou rien » est rompue.',
      );
      assert.equal(
        await session.page.isDisabled('#impAppliquerBtn'), true,
        'Un aperçu en erreur ne doit pas permettre l’application.',
      );

      // Le 409 est DEMANDÉ par ce scénario (fichier délibérément fautif).
      exigerZeroErreur(session, ['status of 409']);
    } finally {
      await session.fermer();
    }
  });
});
