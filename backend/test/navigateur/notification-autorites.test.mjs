/**
 * notification-autorites.test.mjs — **LE FORMULAIRE PRÉ-REMPLI** (L20, action 20.2)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * Action 20.2, la dernière du lot L20 : *« ANSSI et CNIL pré-remplis depuis la
 * fiche incident, à relire et à envoyer par l'exploitant »*, avec un critère
 * qui prime sur tout le reste : **le produit ne transmet rien à une autorité.**
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | On y va DEPUIS la fiche d'incident, et l'incident y est repris |
 * | 2 | ⚠️ Le document DIT qu'il n'a été transmis à personne |
 * | 3 | ⚠️ Chaque rubrique que le produit ne sait pas remplir est NOMMÉE, avec ce qu'on attend |
 * | 4 | Les deux régimes diffèrent : la CNIL demande ce que l'ANSSI ne demande pas |
 * | 5 | Un incident introuvable le DIT, et propose les deux explications |
 * | 6 | Un intitulé hostile est échappé, et la console reste muette |
 *
 * ── ⚠️ LE §3 EST CELUI QUI JUSTIFIE L'ACTION ───────────────────────────────
 *
 * Un formulaire pré-rempli **à moitié** est plus dangereux qu'un formulaire
 * vide : vide, on le remplit ; à moitié rempli, on l'envoie. Dans le délai le
 * plus contraint du droit français, avec des rubriques absentes.
 *
 * Ce que le produit ne sait pas remplir est donc affiché **en creux, nommé,
 * avec ce que l'autorité attend à cet endroit** — et le document porte en tête
 * le compte de ce qui reste à faire. C'est la règle du registre DORA
 * (action 21.1) : *une ligne qui dit ce qui lui manque est un plan de travail ;
 * une ligne muette est un piège.*
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

const TITRE_HOSTILE = 'Rançongiciel <img src=x onerror="window.__xssNotif=1"> sur l’ERP';

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
        `insert into incidents
             (id, filiale_id, titre, type, gravite, date_detection, description,
              actions_immediates, cause_racine, declaration_anssi, declaration_cnil)
         values ('NOTIF-1', $1, $2, 'Rançongiciel', 'critique', current_date - 1,
                 'Chiffrement de deux serveurs de fichiers.',
                 'Isolement du sous-réseau, dépôt de plainte.',
                 'Compromission d’un compte de service.',
                 'à déclarer', 'à déclarer')`,
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

const texteDe = (page) => page.evaluate(() => document.getElementById('app').textContent);

/** Les rubriques affichées : `{ intitulé → { valeur, enCreux } }`. */
async function rubriques(page) {
  return await page.evaluate(() => {
    const table = {};
    document.querySelectorAll('#app .notif-table tbody tr').forEach((tr) => {
      // ⚠️ L'apostrophe est NORMALISÉE : le produit écrit « l'incident » avec
      // l'apostrophe droite, ce fichier l'écrivait avec la typographique, et
      // l'essai a rougi sur une rubrique parfaitement présente. Dépendre du
      // signe exact serait faire rougir la mesure pour une raison de clavier.
      const nom = (tr.querySelector('th')?.textContent.trim() ?? '').replace(/\u2019/g, "'");
      table[nom] = {
        valeur: tr.querySelector('td')?.textContent.trim() ?? '',
        enCreux: tr.classList.contains('notif-manque'),
      };
    });
    return table;
  });
}

describe('le formulaire de notification aux autorités', () => {
  test('§1 — on y va DEPUIS la fiche, et l’incident y est repris', async () => {
    await aller(session.page, '/incidents/NOTIF-1');
    const bouton = await session.page.$('#preparerNotification');
    assert.notEqual(
      bouton,
      null,
      'La fiche d’incident ne porte aucun bouton vers le formulaire : la capacité existe et ' +
        'personne ne peut l’atteindre (`docs/REPRISE.md` §4).',
    );
    // ⚠️ Le libellé dit « PRÉPARER », jamais « déclarer » : un bouton qui
    // laisserait croire à une déclaration ferait porter à l’exploitant un
    // acte qui n’a pas eu lieu.
    const libelle = await session.page.evaluate(
      () => document.getElementById('preparerNotification').textContent.trim(),
    );
    assert.match(libelle, /Préparer/);
    assert.equal(/déclarer|Déclarer/.test(libelle), false, 'le bouton ne doit pas dire « déclarer »');

    await session.page.click('#preparerNotification');
    await attendreQuiescence(session.page, { delai: DELAI });
    const rub = await rubriques(session.page);
    assert.equal(rub["Intitulé de l'incident"]?.enCreux, false, 'l’intitulé doit être repris');
    assert.match(rub['Mesures déjà prises']?.valeur ?? '', /Isolement du sous-réseau/);
  });

  test('§2 — ⚠️ le document DIT qu’il n’a été transmis à personne', async () => {
    const texte = await texteDe(session.page);
    assert.match(
      texte,
      /n'a été transmis à personne|n’a été transmis à personne/,
      'Le document ne dit pas qu’il n’est qu’une préparation. C’est LE critère de l’action ' +
        '20.2 : le produit prépare, l’humain envoie — et le papier doit le porter, puisque ' +
        'c’est lui qu’on relira.',
    );
    assert.match(texte, /le logiciel ne communique avec aucune\s+autorité|ne communique avec aucune/);
  });

  test('§3 — ⚠️ chaque rubrique en creux est NOMMÉE, avec ce qu’on attend', async () => {
    const rub = await rubriques(session.page);

    // Le produit ne détient pas ses propres coordonnées — constat Q-160,
    // ouvert et assumé. La rubrique doit donc être en creux ET dire pourquoi.
    const coordonnees = rub['Adresse et numéro SIREN'];
    assert.ok(coordonnees, `rubrique absente : ${JSON.stringify(Object.keys(rub))}`);
    assert.equal(coordonnees.enCreux, true);
    assert.match(coordonnees.valeur, /À COMPLÉTER/);
    assert.match(
      coordonnees.valeur,
      /ne détient pas les coordonnées/,
      'Une rubrique en creux sans explication se lit comme un oubli de saisie, et l’on ' +
        'cherche où la remplir dans le produit — où elle n’est nulle part.',
    );

    // Et le compte est annoncé EN TÊTE : sans lui, on parcourt le document
    // en espérant n’avoir rien manqué.
    const texte = await texteDe(session.page);
    assert.match(texte, /rubriques?\s+reste(nt)?\s+à compléter/);
  });

  test('§4 — les deux régimes diffèrent vraiment', async () => {
    const anssi = await rubriques(session.page);
    assert.ok(anssi['Caractère transfrontalier'], 'NIS2 en fait une mention distincte');

    await session.page.click('#regimeCnil');
    await attendreQuiescence(session.page, { delai: DELAI });
    const cnil = await rubriques(session.page);

    // ⚠️ Ce que l’article 33 §3 énumère, et que NIS2 ne demande pas.
    assert.ok(cnil['Catégories et nombre de personnes concernées'], 'article 33 §3 a)');
    assert.ok(cnil['Coordonnées du délégué à la protection des données'], 'article 33 §3 b)');
    assert.ok(cnil['Conséquences probables'], 'article 33 §3 c)');
    assert.ok(
      cnil['Motif du retard, si au-delà de 72 heures'],
      'L’article 33 §1 EXIGE de motiver tout dépassement : ne pas le demander ferait ' +
        'commettre un manquement DISTINCT de la violation elle-même.',
    );
    assert.equal(
      cnil['Caractère transfrontalier'],
      undefined,
      'Un formulaire CNIL qui reprendrait les rubriques de NIS2 n’aurait pas deux régimes, ' +
        'il en aurait un affiché deux fois.',
    );
  });

  test('§5 — un incident introuvable le DIT, et propose les deux explications', async () => {
    await aller(session.page, '/notification/INCIDENT-QUI-N-EXISTE-PAS');
    const texte = await texteDe(session.page);
    assert.match(texte, /introuvable/);
    // ⚠️ Les deux causes, et non une seule : « supprimé » et « hors de votre
    // périmètre » appellent des gestes différents, et n’en montrer qu’une
    // enverrait chercher au mauvais endroit.
    assert.match(texte, /supprimé/);
    assert.match(texte, /périmètre/);
  });

  test('§6 — l’intitulé hostile est échappé, et la console est restée muette', async () => {
    await aller(session.page, '/notification/NOTIF-1');
    const xss = await session.page.evaluate(() => window.__xssNotif ?? null);
    assert.equal(xss, null, 'L’intitulé hostile a été exécuté : l’échappement a cédé.');
    const texte = await texteDe(session.page);
    assert.ok(texte.includes('onerror'), 'l’intitulé doit paraître EN TEXTE');
    assert.deepEqual(session.erreurs ?? [], []);
  });
});
