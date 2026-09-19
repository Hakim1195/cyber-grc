/**
 * echelles.test.mjs — **publier son échelle, dans un vrai navigateur, contre le
 * vrai serveur et un vrai annuaire** (lot L25, action 25.3).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe, et ce qu'elle n'aurait pas dû avoir à trouver
 * ════════════════════════════════════════════════════════════════════════
 *
 * Les deux défauts ci-dessous ont été trouvés **en cliquant sur la recette**,
 * après 2 230 essais verts. Ni l'un ni l'autre ne faisait rougir quoi que ce
 * soit, et les deux sont de la même famille : *l'écran choisissait l'échelle
 * autrement que le serveur*.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Publier son échelle **ne touche pas au socle du Groupe** — lu EN BASE |
 * | 2 | …et c'est **la sienne** qui gouverne la fiche d'un risque |
 * | 3 | Le socle **reste visible**, sous « autres révisions » |
 *
 * ── §1 : LE SOCLE N'EST PAS À LA FILIALE ──────────────────────────────────
 *
 * La première rédaction de l'écran archivait « l'ancienne échelle » — c'est-à-dire,
 * la première fois, **le socle du Groupe**. Le serveur l'a refusé (403 : écrire une
 * ligne de portée Groupe est réservé à l'administration Groupe) et l'écran
 * **avalait le refus** : il annonçait la publication pendant que le socle restait
 * en place. Le refus était le bon comportement — archiver le socle le retirerait
 * aux dix-neuf autres filiales, pour une décision qu'une seule a prise.
 *
 * ⚠️ **La portée se lit EN BASE, jamais dans la réponse** : `filiale_id` est retiré
 * de tout ce que l'API rend, et un essai qui se fierait au corps ne distinguerait
 * pas « le socle est intact » de « le socle a été archivé ». C'est le motif écrit
 * en tête de `socle.test.mjs`, et il vaut ici mot pour mot.
 *
 * ── §2 : DEUX ÉCHELLES SONT « EN VIGUEUR », ET UNE SEULE GOUVERNE ─────────
 *
 * Le socle du Groupe et l'échelle locale le sont toutes deux — le premier pour
 * tout le groupe, la seconde pour cette filiale. Le `find()` du `DataStore`
 * prenait la première venue. Mesuré : une filiale publiait cinq niveaux, et sa
 * fiche de risque en proposait quatre. Le serveur, lui, tranchait déjà dans le
 * bon sens (`f_echelle_en_vigueur()`) — **c'est l'écran qui disait autre chose que
 * la base**, et une cotation partie de là aurait porté l'échelle locale tout en
 * affichant les libellés du socle.
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

const TLS = 'FIL-ECH-TLS';
const DEU = 'FIL-ECH-DEU';

const RSSI_TLS = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };

/** Bruit ATTENDU : le « suis-je connecté ? » avant le formulaire, et le logo. */
const BRUIT_ATTENDU = ['401 (Unauthorized)', '403 (Forbidden)'];

let base;
let proprietaire;
let doublure;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  doublure = await demarrerAnnuaire();
  const droits = await moduleCompile('droits/index.js');

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

/** Lecture EN BASE, avec le périmètre qui couvre les deux filiales. */
function enBase(fn) {
  return base.avecPerimetre(proprietaire, perimetre('temoin-ech', TLS, [TLS, DEU], true), fn);
}

/** L'état du SOCLE du Groupe pour un sujet, tel que la base le porte. */
async function socleEnBase(sujet) {
  const lignes = await enBase(async (c) => {
    const { rows } = await c.query(
      `select id, statut, revision, archivee_le
         from echelles where filiale_id is null and sujet = $1`,
      [sujet],
    );
    return rows;
  });
  assert.equal(lignes.length, 1, `Socle « ${sujet} » : ${lignes.length} ligne(s) au lieu d’une.`);
  return lignes[0];
}

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

async function naviguer(page, route) {
  await page.evaluate((r) => { window.location.hash = '#' + r; }, route);
  await attendreQuiescence(page, { delai: DELAI });
}

/* =====================================================================
 *  Les trois propriétés
 * ===================================================================== */

describe('Publier son échelle ne touche pas au socle du Groupe (action 25.3)', () => {
  test('§1 à §3 — le geste complet, et ce qu’il laisse intact', async () => {
    const avant = await socleEnBase('gravite');
    assert.equal(avant.statut, 'en_vigueur', 'Le socle doit être en vigueur AVANT le geste.');

    const vue = await connecter(RSSI_TLS);
    await naviguer(vue.page, '/echelles');
    await vue.page.waitForSelector('#echRev-gravite', { timeout: DELAI });

    // ⚠️ **LES REFUS DU SERVEUR SONT COMPTÉS, et c'est la moitié qui mord.** Le socle
    //    intact ne prouve rien à lui seul : la première rédaction de l'écran TENTAIT de
    //    l'archiver, le serveur refusait en 403, et la base restait donc juste — pendant
    //    que l'écran annonçait « Révision publiée ». Mesuré : la mutation qui rétablit ce
    //    défaut laisse l'assertion « le socle est intact » AU VERT. Ce qui la distingue
    //    est le refus lui-même, avalé en silence.
    const refus = [];
    vue.page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/api/')) refus.push(r.status() + ' ' + r.url());
    });

    // ── Le geste : une révision locale à CINQ niveaux ────────────────────
    await vue.page.click('#echRev-gravite');
    await vue.page.waitForSelector('#echRedaction-gravite', { timeout: DELAI });
    await vue.page.click('#echAjouter-gravite');
    await vue.page.evaluate(() => {
      const lignes = document.querySelectorAll('#echNiveaux-gravite tbody tr');
      const derniere = lignes[lignes.length - 1];
      derniere.querySelector('.ech-valeur').value = '5';
      derniere.querySelector('.ech-libelle').value = 'Catastrophique';
    });
    await vue.page.click('#echPublier-gravite');
    await attendreQuiescence(vue.page, { delai: DELAI });
    await vue.page.waitForFunction(
      () => (document.getElementById('app')?.textContent ?? '').includes('Catastrophique'),
      null,
      { timeout: DELAI },
    );

    assert.deepEqual(
      refus,
      [],
      'Publier SA révision ne doit provoquer AUCUN refus du serveur. Un 403 ici veut dire ' +
        'que l’écran a tenté d’écrire une ligne de portée Groupe — et qu’il a annoncé la ' +
        'publication quand même.',
    );

    // ── §1 : LE SOCLE EST INTACT, lu EN BASE ─────────────────────────────
    const apres = await socleEnBase('gravite');
    assert.equal(
      apres.statut,
      'en_vigueur',
      'Le socle du Groupe a été archivé par une FILIALE : il disparaîtrait des dix-neuf ' +
        'autres, pour une décision qu’une seule a prise.',
    );
    assert.equal(apres.archivee_le, null);
    assert.equal(apres.id, avant.id, 'Le socle a été remplacé, et non laissé en place.');

    // ── §3 : et il reste VISIBLE, sous « autres révisions » ───────────────
    const texte = await vue.page.textContent('#app');
    assert.ok(
      texte.includes('Échelle de la filiale'),
      'L’écran doit dire que la filiale cote désormais sur la sienne.',
    );
    assert.ok(
      texte.includes('autre(s) révision(s)'),
      'Le socle du Groupe doit rester LISIBLE : le filtrer sur son statut le faisait ' +
        'disparaître sans un mot, et la filiale ne voyait plus ce qu’elle avait cessé ' +
        'd’employer (classe Q-201 / Q-207).',
    );

    // ── §2 : la fiche d’un risque propose la graduation LOCALE ───────────
    const options = await vue.page.evaluate(() => {
      const echelle = window.DataStore.getEchelleEnVigueur('gravite');
      if (!echelle) return null;
      return {
        locale: echelle._porteeGroupe !== true,
        niveaux: window.DataStore.getNiveauxEchelle(echelle.id).map((n) => n.libelle),
      };
    });
    assert.notEqual(options, null, 'Aucune échelle en vigueur : le geste n’a rien publié.');
    assert.equal(
      options.locale,
      true,
      'Le socle et l’échelle locale sont tous deux « en vigueur », et c’est la LOCALE qui ' +
        'gouverne. Un « find » naïf prenait la première venue : la filiale publiait cinq ' +
        'niveaux et sa fiche de risque en proposait quatre.',
    );
    assert.deepEqual(options.niveaux, [
      'Mineure', 'Significative', 'Grave', 'Critique', 'Catastrophique',
    ]);
  });
});
