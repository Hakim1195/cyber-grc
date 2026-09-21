/**
 * kanban-actions.test.mjs — **LE KANBAN DU PLAN D'ACTIONS** (lot L17, action A5)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * A5 était, avec A4, le seul item de la vague V-A jamais construit :
 * *« Kanban du plan d'actions — colonnes par statut, glisser-déposer, filtre
 * par responsable. »*
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | La bascule existe, et le Kanban range chaque action dans SA colonne |
 * | 2 | ⚠️ Le déplacement au CLAVIER marche — le glisser n'est pas le seul chemin |
 * | 3 | Le déplacement PERSISTE : il survit à un aller-retour par la liste |
 * | 4 | Le filtre par responsable agit sur les DEUX vues |
 * | 5 | Une action au statut inconnu est MONTRÉE, jamais masquée |
 * | 6 | Un titre hostile est échappé, et la console reste muette |
 *
 * ── ⚠️ POURQUOI LE §2 PLUTÔT QU'UN ESSAI DE GLISSER-DÉPOSER ────────────────
 *
 * Le glisser-déposer se simule mal et se mesure mal : Playwright le joue par
 * des évènements de souris synthétiques dont le comportement dépend du moteur.
 * Un essai fragile sur ce chemin-là **se figerait ou clignoterait**, et l'on
 * finirait par le désactiver — c'est-à-dire par ne plus rien mesurer.
 *
 * Le chemin clavier, lui, est le chemin que le produit doit de toute façon
 * offrir : *une fonctionnalité qui n'existe qu'à la souris est une
 * fonctionnalité absente pour une partie des utilisateurs.* Le mesurer couvre
 * la même écriture — `deplacer()` — par la porte la plus stable.
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

const TITRE_HOSTILE = 'Durcir <img src=x onerror="window.__xssKanban=1"> les postes';

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
        `insert into actions (id, filiale_id, titre, statut, responsable, priorite, echeance) values
             ('KB-A-FAIRE',  $1, $2,                         'à faire',  'Hélène Martin', 'Critique', current_date + 5),
             ('KB-EN-COURS', $1, 'Segmenter le réseau',      'en cours', 'Paul Roux',     'Haute',    current_date - 3),
             ('KB-FINIE',    $1, 'Chiffrer les sauvegardes', 'terminée', 'Hélène Martin', 'Moyenne',  current_date - 30)`,
        [FILIALE_A, TITRE_HOSTILE],
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

/** Bascule sur le Kanban depuis la liste. */
async function ouvrirKanban(page) {
  await aller(page, '/actions');
  await page.click('#vueKanban');
  await attendreQuiescence(page, { delai: DELAI });
  await page.waitForSelector('.kanban', { timeout: DELAI });
}

/** Où est chaque carte : `{ identifiant → statut de sa colonne }`. */
async function placement(page) {
  return await page.evaluate(() => {
    const carte = {};
    document.querySelectorAll('.kanban-colonne').forEach((col) => {
      const statut = col.dataset.statut ?? '(hors vocabulaire)';
      col.querySelectorAll('.kanban-carte').forEach((c) => {
        carte[c.dataset.id ?? ''] = statut;
      });
    });
    return carte;
  });
}

describe('le Kanban du plan d’actions', () => {
  test('§1 — la bascule existe, et chaque action est dans SA colonne', async () => {
    await ouvrirKanban(session.page);
    const ou = await placement(session.page);
    assert.equal(ou['KB-A-FAIRE'], 'à faire');
    assert.equal(ou['KB-EN-COURS'], 'en cours');
    assert.equal(ou['KB-FINIE'], 'terminée');

    // Le compte par colonne est affiché : sans lui, une colonne longue
    // oblige à compter des cartes à l'œil.
    const comptes = await session.page.evaluate(() =>
      [...document.querySelectorAll('.kanban-colonne .kanban-compte')].map((s) => s.textContent.trim()),
    );
    assert.ok(comptes.length >= 3, `trois colonnes attendues : ${JSON.stringify(comptes)}`);
  });

  test('§2 — ⚠️ le déplacement au CLAVIER marche, sans glisser-déposer', async () => {
    // « à faire » → « en cours », par le bouton « avancer ».
    await session.page.click('.kanban-carte[data-id="KB-A-FAIRE"] .kanban-droite');
    await attendreQuiescence(session.page, { delai: DELAI });
    const ou = await placement(session.page);
    assert.equal(
      ou['KB-A-FAIRE'],
      'en cours',
      'La carte n’a pas changé de colonne : le chemin sans souris ne fonctionne pas, et le ' +
        'Kanban est alors inutilisable au clavier comme au lecteur d’écran.',
    );
  });

  test('§3 — le déplacement PERSISTE : il survit à un aller-retour', async () => {
    // ⚠️ C'est le contrôle qui distingue un déplacement RÉEL d'un déplacement
    // d'apparence. Sans lui, un Kanban qui bouge les cartes en mémoire sans
    // jamais écrire passerait le §2 au vert — et l'utilisateur perdrait son
    // travail au premier rechargement.
    await aller(session.page, '/dashboard');
    await ouvrirKanban(session.page);
    const ou = await placement(session.page);
    assert.equal(ou['KB-A-FAIRE'], 'en cours', 'le changement doit avoir été écrit');

    // Et la BASE le porte — pas seulement l'écran.
    const lignes = await base.avecPerimetre(
      await base.connexion('app'),
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => (await c.query("select statut from actions where id = 'KB-A-FAIRE'")).rows,
    );
    assert.equal(lignes[0].statut, 'en cours');
  });

  test('§4 — le filtre par responsable agit sur le Kanban', async () => {
    await session.page.selectOption('#filtreResponsable', 'Paul Roux');
    await attendreQuiescence(session.page, { delai: DELAI });
    const ou = await placement(session.page);
    assert.deepEqual(
      Object.keys(ou).sort(),
      ['KB-EN-COURS'],
      `Le filtre ne borne pas le Kanban : ${JSON.stringify(ou)}`,
    );

    // Et il se relâche : un filtre qu'on ne peut pas retirer est un piège.
    //
    // ⚠️ On vérifie le RETOUR des trois cartes de ce fichier, et non un total :
    // `semerJeuEssai` pose ses propres actions, et compter l'ensemble ferait
    // rougir cet essai le jour où le semis partagé en gagne une — pour une
    // raison étrangère à ce qu'il mesure.
    await session.page.selectOption('#filtreResponsable', '');
    await attendreQuiescence(session.page, { delai: DELAI });
    const apres = await placement(session.page);
    for (const identifiant of ['KB-A-FAIRE', 'KB-EN-COURS', 'KB-FINIE']) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(apres, identifiant),
        `« ${identifiant} » n’est pas revenu après le relâchement du filtre : ${JSON.stringify(apres)}`,
      );
    }
  });

  test('§5 — une action au statut inconnu est MONTRÉE, jamais masquée', async () => {
    // ⚠️ Une action invisible est une action oubliée. On pose le statut EN
    // SQL — le produit refuserait la valeur, et c'est bien le but : on mesure
    // ce que le Kanban fait d'une donnée qu'il ne sait pas ranger, quelle que
    // soit la porte par laquelle elle est entrée (reprise, import, `psql`).
    const proprietaire = await base.nouvelleConnexion('proprietaire');
    try {
      await proprietaire.query('begin');
      await proprietaire.query(`select set_config('grc.filiales', $1, true)`, [FILIALE_A]);
      await proprietaire.query(`select set_config('grc.filiale_id', $1, true)`, [FILIALE_A]);
      await proprietaire.query(`select set_config('grc.utilisateur', 'mutation', true)`);
      await proprietaire.query('alter table actions drop constraint ck_actions_statut');
      await proprietaire.query(
        `insert into actions (id, filiale_id, titre, statut)
         values ('KB-INCONNU', $1, 'Action d’un autre vocabulaire', 'en attente de budget')`,
        [FILIALE_A],
      );
      // ⚠️ La contrainte est REPOSÉE, en « not valid » : la ligne témoin reste,
      // et toute écriture ULTÉRIEURE est de nouveau bornée. La laisser tombée
      // ferait de la suite de ce fichier un essai joué sur un schéma amputé —
      // c'est-à-dire un essai qui ne mesure plus le produit.
      await proprietaire.query(
        `alter table actions add constraint ck_actions_statut
             check (statut = any (array['à faire', 'en cours', 'terminée'])) not valid`,
      );
      await proprietaire.query('commit');
    } catch (erreur) {
      await proprietaire.query('rollback').catch(() => {});
      throw erreur;
    } finally {
      await proprietaire.end().catch(() => {});
    }

    // ⚠️ **Il faut RECHARGER la page, et la première rédaction l'a oublié.**
    // La SPA tient son jeu de données EN MÉMOIRE : une ligne posée en SQL
    // après le chargement n'y est pas, et naviguer d'un écran à l'autre ne la
    // fait pas apparaître. L'essai concluait donc que le Kanban masquait une
    // action qu'il n'avait tout simplement jamais reçue.
    await session.page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee');
    await attendreQuiescence(session.page, { delai: DELAI });

    await ouvrirKanban(session.page);
    const ou = await placement(session.page);
    assert.equal(
      ou['KB-INCONNU'],
      '(hors vocabulaire)',
      `L’action au statut inconnu a disparu du tableau : ${JSON.stringify(ou)}`,
    );
    const texte = await session.page.evaluate(() => document.getElementById('app').textContent);
    assert.match(texte, /Hors vocabulaire/);
  });

  test('§6 — le titre hostile est échappé, et la console est restée muette', async () => {
    const xss = await session.page.evaluate(() => window.__xssKanban ?? null);
    assert.equal(xss, null, 'Le titre hostile a été exécuté : l’échappement a cédé.');
    const texte = await session.page.evaluate(() => document.getElementById('app').textContent);
    assert.ok(texte.includes('onerror'), 'le titre doit paraître EN TEXTE');
    assert.deepEqual(session.erreurs ?? [], []);
  });
});
