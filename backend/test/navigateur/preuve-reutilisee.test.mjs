/**
 * preuve-reutilisee.test.mjs — **la réutilisation d'une preuve arrive-t-elle
 * jusqu'à l'utilisateur ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Action 19.4, la moitié que le banc serveur ne peut pas voir
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/pieces/reutilisation.test.mjs` prouve que le mécanisme tient : une preuve
 * sert plusieurs contrôles, seul le dernier détachement libère le fichier, et
 * l'invariant est imposé par le schéma. Cela ne prouve rien de ce qui compte si
 * **aucun écran n'appelle la route** — et c'était le cas en écrivant ces lignes :
 * le panneau des pièces jointes ne vivait que sur les fiches « document » et
 * « incident ». *« Montrez-moi la preuve de CE contrôle »*, la première question
 * d'un auditeur, n'avait pas d'écran.
 *
 * C'est la leçon inscrite au `docs/REPRISE.md` §4 — *une capacité qu'aucun écran
 * n'appelle est une capacité absente* —, et trois lots d'affilée l'avaient
 * ignorée.
 *
 * ── LES QUATRE PROPRIÉTÉS ───────────────────────────────────────────────
 *
 *  §1 **Le panneau des pièces est sur la fiche du contrôle**, et il est vide —
 *     donc il y a bien quelque chose à y faire arriver.
 *
 *  §2 **On réutilise DEPUIS L'ÉCRAN**, par les deux listes déroulantes, et la
 *     preuve apparaît sur la fiche du contrôle sans qu'un octet ait été déposé.
 *
 *  §3 **L'écran DIT que la preuve sert ailleurs.** Sans cette mention, le bouton
 *     de retrait annoncerait une destruction qui n'a pas lieu — classe des
 *     constats Q-201 / Q-207, et c'est le seul endroit où l'utilisateur peut
 *     l'apprendre avant de cliquer.
 *
 *  §4 **Un nom de fichier HOSTILE ressort échappé**, et l'essai le fait DÉCIDER :
 *     sans un nom qui porte des chevrons, retirer `escapeHtml` du panneau
 *     laisserait tout au vert (constats Q-210, Q-305).
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

/** Un nom de fichier qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const NOM_HOSTILE = 'Procédure <img src=x onerror="window.__xss=1">.pdf';

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
        `insert into documents (id, filiale_id, titre, statut, version_document, confidentialite)
             values ('DOC-SOURCE', $1, 'Procédure de sauvegarde', 'en vigueur', '1.0', 'interne')`,
        [FILIALE_A],
      );
      await c.query(
        `insert into mesure_catalogue (id, filiale_id, nom, statut)
             values ('MESURE-CIBLE', $1, 'Sauvegardes vérifiées', 'active')`,
        [FILIALE_A],
      );
      // ⚠️ La pièce est semée EN BASE, sans fichier sur le disque : l'essai
      // mesure ce que l'écran fait de la LISTE et du rattachement, jamais une
      // délivrance. Poser un fichier ici donnerait à croire qu'on éprouve la
      // chaîne du lot L6 — elle l'est ailleurs, et par des essais qui la lisent.
      await c.query(
        `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier,
                                     type_mime, taille_octets, sha256, chemin_stockage,
                                     etat_analyse, date_analyse, version_piece)
             values ('PJ-SOURCE', $1, 'documents', 'DOC-SOURCE', $2, 'application/pdf',
                     4096, repeat('a', 64), repeat('b', 64), 'saine', now(), '1.0')`,
        [FILIALE_A, NOM_HOSTILE],
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

/** Attend que le panneau des pièces ait fini sa lecture. */
async function attendrePieces(page) {
  await page.waitForFunction(
    () => {
      const n = document.getElementById('piecesJointes');
      return n !== null && !/Lecture des pièces jointes/u.test(n.textContent ?? '');
    },
    null,
    { timeout: DELAI },
  );
}

describe('19.4 — réutiliser une preuve, depuis l’écran', () => {
  test('§1 — LA MATIÈRE : le panneau des pièces est sur la fiche du CONTRÔLE, et il est vide', async () => {
    const { page } = session;
    await aller(page, '/mesures/MESURE-CIBLE');
    await attendrePieces(page);

    const etat = await page.evaluate(() => {
      const hote = document.getElementById('piecesJointes');
      return {
        present: hote !== null,
        visible: hote !== null && hote.hidden === false,
        texte: hote?.textContent ?? '',
        bascule: document.getElementById('pjReutiliserBascule') !== null,
      };
    });
    assert.equal(
      etat.present,
      true,
      'La fiche d’un contrôle ne porte AUCUN panneau de pièces jointes : « montrez-moi la ' +
        'preuve de ce contrôle » n’a pas d’écran, et l’action 19.4 est inatteignable.',
    );
    assert.equal(etat.visible, true);
    assert.match(etat.texte, /Aucune pièce jointe/u);
    assert.equal(etat.bascule, true, 'Le geste « réutiliser une preuve existante » doit être offert.');
  });

  test('§2 — ON RÉUTILISE DEPUIS L’ÉCRAN, et rien n’est déposé', async () => {
    const { page } = session;

    // Le geste de l'utilisateur, dans l'ordre : ouvrir l'encart, choisir la
    // fiche d'origine, choisir la pièce, rattacher.
    await page.evaluate(() => document.getElementById('pjReutiliserBascule').click());
    await page.waitForFunction(() => document.getElementById('pjSourceFiche') !== null, null, {
      timeout: DELAI,
    });
    await page.evaluate(() => {
      const select = document.getElementById('pjSourceFiche');
      select.value = 'DOC-SOURCE';
      select.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => document.getElementById('pjRattacherBtn') !== null, null, {
      timeout: DELAI,
    });
    await page.evaluate(() => document.getElementById('pjRattacherBtn').click());
    await page.waitForFunction(
      () => /PJ-SOURCE/u.test(document.getElementById('piecesJointes')?.innerHTML ?? ''),
      null,
      { timeout: DELAI },
    );
    await attendreQuiescence(page, { delai: DELAI });

    // La preuve est sur la fiche du contrôle…
    const surLeControle = await page.evaluate(
      () => document.querySelectorAll('#piecesJointes .pj-ligne').length,
    );
    assert.equal(surLeControle, 1);

    // … et il n'y a toujours QU'UNE pièce en base : rien n'a été déposé.
    const compte = await page.evaluate(async () => {
      const reponse = await fetch('/api/pieces/documents/DOC-SOURCE');
      const charge = await reponse.json();
      return charge.pieces.length;
    });
    assert.equal(
      compte,
      1,
      'La réutilisation a DÉPOSÉ : c’est exactement ce que 19.4 existe pour empêcher — cinq ' +
        'exemplaires de la même procédure, et quatre chances d’en oublier une.',
    );
  });

  test('§3 — L’ÉCRAN DIT que la preuve sert ailleurs, et le bouton change de mot', async () => {
    const { page } = session;

    // Sur la fiche du CONTRÔLE : elle sert aussi le document d'origine.
    const cote = await page.evaluate(() => {
      const partage = document.querySelector('#piecesJointes .pj-partage');
      const bouton = document.querySelector('#piecesJointes .pj-detacher');
      return {
        mention: partage?.textContent?.trim() ?? '',
        titre: partage?.getAttribute('title') ?? '',
        bouton: bouton?.textContent?.trim() ?? '',
      };
    });
    assert.match(
      cote.mention,
      /Sert aussi 1 fiche/u,
      'L’écran ne dit pas que la preuve sert ailleurs : le bouton de retrait annoncerait une ' +
        'destruction qui n’a pas lieu (classe Q-201 / Q-207).',
    );
    assert.match(cote.titre, /Procédure de sauvegarde/u, 'La fiche servie doit être NOMMÉE, pas comptée.');
    assert.equal(
      cote.bouton,
      'Détacher',
      'Le bouton doit dire « Détacher » tant que la preuve sert une autre fiche, et « Supprimer » ' +
        'seulement sur la dernière.',
    );

    // Et symétriquement, sur la fiche du DOCUMENT d'origine.
    await aller(page, '/documents/DOC-SOURCE');
    await attendrePieces(page);
    const autreCote = await page.evaluate(() => ({
      mention: document.querySelector('#piecesJointes .pj-partage')?.textContent?.trim() ?? '',
      bouton: document.querySelector('#piecesJointes .pj-detacher')?.textContent?.trim() ?? '',
    }));
    assert.match(autreCote.mention, /Sert aussi 1 fiche/u);
    assert.equal(autreCote.bouton, 'Détacher');
  });

  test('§4 — UN NOM DE FICHIER HOSTILE ressort ÉCHAPPÉ', async () => {
    const { page } = session;
    const mesure = await page.evaluate(() => ({
      xss: window.__xss === 1,
      images: document.querySelectorAll('#piecesJointes img').length,
      texte: document.querySelector('#piecesJointes .pj-nom')?.textContent ?? '',
    }));
    assert.equal(mesure.xss, false, 'Le nom de fichier a été EXÉCUTÉ.');
    assert.equal(mesure.images, 0, 'Le nom de fichier a fabriqué une balise.');
    assert.match(
      mesure.texte,
      /<img src=x/u,
      'Le nom doit s’afficher TEL QUEL, chevrons compris : sans cette moitié, l’essai serait ' +
        'vert sur un panneau qui aurait simplement effacé le nom.',
    );
  });
});
