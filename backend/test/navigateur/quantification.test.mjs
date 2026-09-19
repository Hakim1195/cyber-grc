/**
 * quantification.test.mjs — **le montant apparaît, dans un vrai navigateur**
 * (lot L25, action 25.4).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le défaut que cette famille existe pour fermer
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il a été trouvé **en cliquant sur la recette**, après un banc entièrement vert —
 * la cinquième fois en une semaine, et toujours la même leçon.
 *
 * On enregistre une estimation COMPLÈTE : fréquence, perte primaire, hypothèses.
 * Le panneau redessine et affiche *« estimation incomplète : le montant n'est pas
 * calculé »*.
 *
 * Le montant existait pourtant. `perte_annualisee` est une colonne **engendrée** :
 * la base l'avait calculé, la route l'avait renvoyé dans sa réponse — et
 * `js/core/sync.js` ne lisait de cette réponse que **deux choses**, l'identifiant
 * définitif et le numéro de version. Tout le reste était jeté, et l'écran
 * continuait de lire un enregistrement en mémoire qui ne portait pas le champ.
 *
 * ⚠️ **Le défaut ne vivait ni dans la base, ni dans la route, ni dans l'écran.**
 * Il vivait dans ce qu'une couche intermédiaire **choisissait de ne pas garder** —
 * et il ne pouvait apparaître qu'avec la première entité dont un champ AFFICHÉ est
 * calculé par la base. Jusque-là, tout ce que l'écran montrait, il l'avait
 * lui-même écrit.
 *
 * ⚠️ **Pourquoi le banc ne pouvait pas le voir.** Les essais de module vérifient
 * qu'un écran se rend ; ceux de l'API vérifient que la route rend le bon champ.
 * Les deux moitiés étaient justes. *Un défaut peut ne vivre dans aucun fichier* —
 * c'est le bloquant du 5ᵉ passage de la porte S2, sous une autre forme.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Une estimation complète fait apparaître le montant **sans rechargement** |
 * | 2 | Sans pertes secondaires, le montant est un **PLANCHER**, et il le dit |
 * | 3 | Un triplet incomplet est **refusé à l'écran**, avant même la base |
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

const DELAI = 60_000;
const TLS = 'FIL-FAIR-TLS';
const RISQUE = 'RISK-FAIR-NAV';
const RSSI_TLS = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };
const BRUIT_ATTENDU = ['401 (Unauthorized)', '403 (Forbidden)'];

let base;
let doublure;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  doublure = await demarrerAnnuaire();
  const droits = await moduleCompile('droits/index.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays)
             values ($1, 'TLS', 'Atelier Garonne SA', 'FR')`,
        [TLS],
      );
      const attendus = droits.groupesAttendus(
        'GRC-',
        await droits.lireFilialesActives(c),
        await droits.lireProfilsActifs(c),
      );
      await droits.synchroniserGroupesAd(c, attendus);
    },
    { annuler: false },
  );

  // ⚠️ **LA MATIÈRE D'ABORD** : sans un risque, la fiche n'existe pas et l'essai
  // passerait au vert pour une raison étrangère à ce qu'il annonce (motif Q-210).
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-fair', TLS, [TLS]),
    async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom) values ($2, $1, 'Rançongiciel')`,
        [TLS, RISQUE],
      );
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
    "L'application ne démarre pas : " + JSON.stringify(p.erreursInattendues(BRUIT_ATTENDU)),
  );
  return p;
}

async function naviguer(page, route) {
  await page.evaluate((r) => { window.location.hash = '#' + r; }, route);
  await attendreQuiescence(page, { delai: DELAI });
}

/** Saisit un triplet du panneau. `null` laisse les trois cases vides. */
async function saisirTriplet(page, prefixe, valeurs) {
  if (valeurs === null) return;
  const cases = ['min', 'probable', 'max'];
  for (let i = 0; i < cases.length; i += 1) {
    await page.fill('#fair-' + prefixe + '-' + cases[i], String(valeurs[i]));
  }
}

describe('La quantification financière, dans un vrai navigateur (action 25.4)', () => {
  test('§1 à §3 — le montant apparaît, le plancher se dit, l’incomplet est refusé', async () => {
    const vue = await connecter(RSSI_TLS);
    await naviguer(vue.page, '/risques/' + RISQUE);
    await vue.page.waitForSelector('#fair-ouvrir', { timeout: DELAI });

    // ── §3 d'abord : un triplet à DEUX valeurs est refusé À L'ÉCRAN ──────
    //
    // ⚠️ On le mesure en premier parce qu'il doit l'être AVANT qu'une
    // quantification existe : la même saisie, plus tard, se heurterait à
    // l'unicité et l'on ne saurait plus lequel des deux refus on observe.
    const alertes = [];
    vue.page.on('dialog', async (d) => { alertes.push(d.message()); await d.dismiss(); });

    await vue.page.click('#fair-ouvrir');
    await vue.page.waitForSelector('#fair-save', { timeout: DELAI });
    await vue.page.fill('#fair-frequence-min', '1');
    await vue.page.fill('#fair-frequence-probable', '2');
    await vue.page.fill('#fair-hypotheses', 'Triplet à moitié saisi.');
    await vue.page.click('#fair-save');
    await attendreQuiescence(vue.page, { delai: DELAI });

    assert.equal(alertes.length, 1, 'Un triplet à deux valeurs doit être REFUSÉ à l’écran.');
    assert.match(alertes[0], /triplet/i);

    // ── §1 et §2 : l’estimation complète, SANS pertes secondaires ────────
    //
    // ⚠️ **ON COMPTE LES RECHARGEMENTS, ET C'EST LA MOITIÉ QUI MORD.** Sans elle,
    // cet essai reste VERT sur la version fautive — mesuré : le sondage finit par
    // rapporter la modification, et le montant apparaît vingt secondes plus tard
    // au lieu de trois. L'essai mesurerait alors le sondage, pas le correctif.
    // C'est le motif du constat **Q-210** : *un essai qui couvre une règle sans
    // jamais la faire décider ne la couvre pas.*
    const rechargements = [];
    vue.page.on('response', (r) => {
      if (/[/]api[/](donnees|rafraichir)/.test(r.url())) rechargements.push(r.url());
    });

    await saisirTriplet(vue.page, 'frequence', [1, 1, 1]);
    await saisirTriplet(vue.page, 'perte', [1000, 1000, 1000]);
    await vue.page.fill('#fair-hypotheses', 'Sinistralité relevée sur trois exercices.');
    await vue.page.click('#fair-save');
    await attendreQuiescence(vue.page, { delai: DELAI });

    // ⚠️ **AUCUN RECHARGEMENT ENTRE LES DEUX.** C'est tout l'objet de cette
    // famille : le montant vient de la base, et il doit atteindre l'écran par la
    // réponse de l'écriture. Un `page.reload()` ici rendrait l'essai vert sur la
    // version fautive — il mesurerait le chargement initial, que personne ne met
    // en doute.
    await vue.page.waitForFunction(
      () => {
        const c = document.getElementById('fair-card');
        return c !== null && /1\s*000/.test(c.textContent.replace(/ /g, ' '));
      },
      null,
      { timeout: DELAI },
    );

    assert.deepEqual(
      rechargements,
      [],
      'Le montant ne doit PAS attendre un rechargement du jeu de données : il vient ' +
        'de la RÉPONSE de l’écriture. S’il a fallu un « /api/donnees » ou un ' +
        '« /api/rafraichir », c’est le sondage qui l’a rapporté — et l’écran a affiché ' +
        '« estimation incomplète » entre-temps, sur une estimation complète. ' +
        'Vus : ' + JSON.stringify(rechargements),
    );

    const texte = (await vue.page.innerText('#fair-card')).replace(/ /g, ' ');

    // §1 — le montant : une fois par an, mille euros de perte primaire.
    assert.match(
      texte,
      /1\s*000\s*EUR/,
      'Le montant calculé par la base doit atteindre l’écran par la RÉPONSE de ' +
        'l’écriture, sans rechargement : ' + texte.slice(0, 200),
    );
    // §2 — et il est annoncé comme un PLANCHER, faute de pertes secondaires.
    assert.match(
      texte,
      /≥/,
      'Sans pertes secondaires estimées, le montant est un plancher et doit porter ' +
        'un « ≥ » : un plancher présenté comme un total est l’estimation par défaut ' +
        'DANS LE SENS RASSURANT, celle que le critère 25.4 interdit.',
    );
    assert.match(texte, /plancher/i, 'Et la raison du « ≥ » doit être écrite en toutes lettres.');

    assert.deepEqual(
      vue.erreursInattendues(BRUIT_ATTENDU),
      [],
      'Le parcours ne doit produire aucune erreur de page.',
    );
  });
});
