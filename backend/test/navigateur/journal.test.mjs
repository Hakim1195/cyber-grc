/**
 * journal.test.mjs — l'écran de consultation du journal d'audit (lot L5).
 *
 * ── Ce que cet écran doit prouver, et à qui ─────────────────────────────────
 *
 * `PLAN_SERVEUR` §1.7 pose la question qu'un auditeur posera : *« le RSSI
 * peut-il modifier le journal ? »*. La table est en ajout seul et chaînée par
 * empreinte — c'est éprouvé côté base. Ce que l'écran ajoute est la moitié qui
 * manquait : **de quoi le montrer**. Un bouton, un verdict, et la règle du
 * `CONVENTIONS.md` §29.8 : **aucune ligne rendue = journal sain**.
 *
 * ── Trois propriétés, et une seule façon de les mesurer ─────────────────────
 *
 *  1. **La pagination se fait sur `numero`, jamais sur un décalage** (§29.8).
 *     On ne le lit pas dans la source : on clique, et on regarde ce que le
 *     navigateur a **émis**. Un `offset` sur un journal qui grandit pendant
 *     qu'on le feuillette saute des lignes — dans une preuve d'audit.
 *  2. **Ce qui s'affiche vient d'utilisateurs, et de gens qui n'en sont pas.**
 *     L'auditeur de la porte S3 a forgé un login contenant du JSON et des sauts
 *     de ligne : il est arrivé **littéralement** dans le journal (§29.5). Cet
 *     écran l'affichera donc un jour. On lui donne ici la charge hostile et on
 *     exige qu'elle se **lise** sans s'**exécuter**.
 *  3. **L'export passe par l'entonnoir**, et le serveur exige le droit d'export
 *     **en plus** du domaine (§29.8). C'est la moitié du constat **Q-89** que la
 *     porte S3 a laissée ouverte.
 *
 * ── ⚠️ Ce que cet essai NE peut PAS mesurer aujourd'hui, et pourquoi ────────
 *
 * **Les trois routes du §29.8 n'existent pas encore.** `src/api/journal.ts` est
 * une **couture** — un greffon publié avant son contenu, qui n'enregistre
 * délibérément aucune route — et son remplissage est le livrable de l'agent J2,
 * écrit en parallèle de cet écran. Le §29.8 a précisément été figé avant les
 * deux pour que ni l'un ni l'autre n'attende.
 *
 * Conséquence, dite ici plutôt que masquée : les essais qui portent sur la
 * **forme de la réponse** substituent la réponse du serveur par une réponse
 * **conforme au §29.8**, comme `droits.test.mjs` substitue le bloc `droits`
 * qu'il attend de l'agent A2. Ce qui est mesuré alors est la réaction de
 * l'écran — la seule moitié qui appartienne à cet agent.
 *
 * Ce qui, en revanche, est mesuré **contre le vrai serveur, sans substitution** :
 *
 *   · §4 — le serveur refuse la route à qui ne porte pas le domaine `journal` ;
 *   · §1 — l'écran reste utilisable quand la route est absente : il le **dit**,
 *     au lieu d'afficher un journal vide. Un écran de journal qui affiche « rien »
 *     quand il n'a rien pu lire est le pire mensonge que ce produit puisse faire.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { RACINE_FRONTEND, monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

/** Même raison qu'au `droits.test.mjs` : cinq Chromium en parallèle sur quatre cœurs. */
const DELAI = 60_000;

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
 *  Les profils — les deux moitiés du droit sur le journal
 * ===================================================================== */

/** Les quatorze domaines de `backend/src/api/droits.ts`, `journal` compris. */
const TOUS_LES_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel',
  'administration', 'journal',
]);

/**
 * **La combinaison qui a laissé passer Q-89** : il écrit, il ne peut pas extraire.
 *
 * Deux des huit profils du socle — RSSI et ADMIN — sont dans cet état. C'est la
 * raison d'être du constat **Q-92** : le filet éprouvait la lecture seule, qui
 * bloque *pour une autre raison*, et rendait donc vert sur douze sites dont l'un
 * ne tenait pas.
 */
const ECRIT_SANS_EXPORTER = Object.freeze({
  niveau: 'contribution',
  domaines: TOUS_LES_DOMAINES,
  export: false,
});

/** Le même, avec le droit d'extraction : le contrôle dans l'autre sens. */
const ECRIT_ET_EXPORTE = Object.freeze({
  niveau: 'contribution',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/**
 * Administration sur tout, **sauf** le journal.
 *
 * C'est l'arbitrage du §29.8 rendu visible : `domaine: 'journal'` et non
 * `'administration'` — régler l'application et lire trois ans d'identités ne
 * sont pas le même droit. Ce profil-ci a tous les pouvoirs de réglage et ne doit
 * ni voir l'entrée de menu, ni obtenir la route.
 */
const ADMINISTRE_SANS_LE_JOURNAL = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'journal'),
  export: true,
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
 *  Le journal que le serveur rendra — forme du §29.8
 * ===================================================================== */

/**
 * Une page d'entrées, dans la forme du contrat.
 *
 * `numero` décroît : c'est l'ordre imposé par le §29.8, et c'est lui qui rend le
 * curseur exact.
 */
function pageDEntrees(premierNumero, combien, extra = {}) {
  const entrees = [];
  for (let i = 0; i < combien; i += 1) {
    const n = premierNumero - i;
    entrees.push({
      id: `LOG-${String(n)}`,
      numero: n,
      horodatage: new Date(Date.UTC(2026, 8, 4, 8, 0, 0) - n * 1000).toISOString(),
      filiale_id: 'FIL-A',
      utilisateur_libelle: `agent.${String(n % 7)}`,
      adresse_ip: '10.0.0.4',
      action: ['connexion_reussie', 'modification', 'export', 'refus_autorisation'][n % 4],
      entite_type: n % 2 === 0 ? 'risques' : null,
      entite_id: n % 2 === 0 ? `RISK-${String(n)}` : null,
      resume: `Entrée de démonstration n° ${String(n)}`,
      valeurs_avant: n % 2 === 0 ? { statut: 'ouvert' } : null,
      valeurs_apres: n % 2 === 0 ? { statut: 'clos' } : null,
      empreinte: `e${String(n)}`.padEnd(64, '0'),
      empreinte_precedente: `e${String(n - 1)}`.padEnd(64, '0'),
      ...extra,
    });
  }
  return { entrees };
}

/**
 * Substitue les trois routes du §29.8, et **retient ce que le navigateur a
 * demandé**.
 *
 * ⚠️ Ce n'est pas un décor : ce qui est mesuré est la **requête émise** — les
 * noms de filtres, le curseur, l'absence de décalage — et la **réaction** de
 * l'écran à une réponse conforme. La route elle-même appartient à l'agent J2
 * (voir l'entête).
 */
async function substituerJournal(page, options = {}) {
  const demandes = [];
  const listes = options.listes ?? [pageDEntrees(1000, 50)];
  let indexListe = 0;
  await page.route('**/api/journal**', async (route) => {
    const url = new URL(route.request().url());
    demandes.push({ chemin: url.pathname, requete: url.search, parametres: url.searchParams });

    if (url.pathname.endsWith('/journal/verification')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ anomalies: options.anomalies ?? [] }),
      });
    }
    if (url.pathname.endsWith('/journal/export')) {
      if (options.exportRefuse === true) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ erreur: 'droit_insuffisant', message: 'Le droit d’export n’est pas accordé.' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        body: 'numero;horodatage;action\n1000;2026-09-04T08:00:00Z;export\n',
      });
    }
    const charge = listes[Math.min(indexListe, listes.length - 1)];
    indexListe += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(charge),
    });
  });
  return demandes;
}

/** Ouvre l'application avec un profil donné, et rend la session de page. */
async function ouvrirApplication(droits) {
  const session = await ouvrirPage(navigateur);
  // Les alertes natives bloquent Chromium : on les écarte, et on ne mesure jamais
  // par elles (un `alert` n'est pas une preuve, c'est une interruption).
  session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
  if (droits !== undefined) await injecterDroits(session.page, droits);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee', 'L’application doit démarrer.');
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/** Va sur `/journal` et attend que la vue soit rendue. */
async function ouvrirLeJournal(page, selecteur = '#journalCorps') {
  await page.evaluate(() => { window.location.hash = '#/journal'; });
  await page.waitForSelector(selecteur, { timeout: DELAI });
}

/** Compte tout ce qui peut faire sortir un octet, depuis la page. */
async function armerCompteurDeSorties(page) {
  await page.evaluate(() => {
    window.__sorties = { blobs: 0, telechargements: 0, impressions: 0 };
    const vraiUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__sorties.blobs += 1; return vraiUrl(b); };
    const vraiClic = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clic() {
      if (this.hasAttribute('download')) window.__sorties.telechargements += 1;
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
 *  §1 — L'écran, contre le contrat du §29.8
 * ===================================================================== */

describe('L’écran du journal parle le contrat du §29.8', () => {
  test('LA LISTE est demandée au chemin du contrat, et la page suivante par « numero »', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const demandes = await substituerJournal(session.page, {
        listes: [pageDEntrees(1000, 50), pageDEntrees(950, 50), pageDEntrees(1000, 50)],
      });
      await ouvrirLeJournal(session.page, '.jrn-table');

      assert.ok(demandes.length >= 1, 'L’écran doit interroger le serveur.');
      assert.equal(demandes[0].chemin, '/api/journal', `Chemin du §29.8 attendu : ${demandes[0].chemin}`);

      // ── LE POINT DUR DU CONTRAT : aucun décalage, jamais ──────────────────
      const decalages = ['offset', 'decalage', 'page', 'skip', 'depart', 'debut'];
      for (const d of demandes) {
        for (const interdit of decalages) {
          assert.equal(
            d.parametres.has(interdit), false,
            `« ${interdit} » est un DÉCALAGE. Le §29.8 l’interdit : sur un journal qui grandit ` +
              `pendant qu’on le feuillette, il saute des lignes — dans une preuve d’audit. ` +
              `Requête : ${d.requete}`,
          );
        }
      }

      // Page suivante : le curseur est le plus petit `numero` de la page vue.
      const premierNumero = await session.page.evaluate(
        () => Number(document.querySelectorAll('.jrn-ligne')[0].dataset.numero),
      );
      assert.equal(premierNumero, 1000, 'La page rendue est bien celle qu’on a servie.');

      await session.page.click('#journalPageSuivante');
      await session.page.waitForFunction(
        () => document.querySelectorAll('.jrn-ligne').length > 0 &&
          document.querySelectorAll('.jrn-ligne')[0].dataset.numero === '950',
        null, { timeout: DELAI },
      );
      const suivante = demandes[demandes.length - 1];
      assert.equal(
        suivante.parametres.get('avant'), '951',
        `La page suivante doit se demander par le curseur « numero » (avant=951, le plus petit ` +
          `numéro vu). Requête : ${suivante.requete}`,
      );

      // Et le retour en arrière repart des entrées les plus récentes.
      await session.page.click('#journalPagePrecedente');
      await session.page.waitForFunction(
        () => document.querySelectorAll('.jrn-ligne')[0]?.dataset.numero === '1000',
        null, { timeout: DELAI },
      );
      assert.equal(
        demandes[demandes.length - 1].parametres.has('avant'), false,
        'Revenir en tête ne porte aucun curseur.',
      );

      assert.deepEqual(session.erreursScript, [], 'CLAUDE.md §5 : zéro erreur de script.');
    } finally {
      await session.fermer();
    }
  });

  test('LES CINQ FILTRES du §29.8 partent sous leurs noms, et aucun autre', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const demandes = await substituerJournal(session.page);
      await ouvrirLeJournal(session.page, '.jrn-table');

      await session.page.fill('#journalDepuis', '2026-09-01');
      await session.page.fill('#journalJusquA', '2026-09-04');
      await session.page.selectOption('#journalAction', 'export');
      await session.page.fill('#journalUtilisateur', 'rssi.tls');
      await session.page.fill('#journalEntiteType', 'risques');
      await session.page.click('#journalFiltrerBtn');
      await session.page.waitForFunction(
        (n) => window.__demandes === undefined || true, null, { timeout: 500 },
      ).catch(() => {});
      await session.page.waitForTimeout(300);

      const derniere = demandes[demandes.length - 1];
      const attendus = {
        depuis: '2026-09-01',
        jusqu_a: '2026-09-04',
        action: 'export',
        utilisateur: 'rssi.tls',
        entite_type: 'risques',
      };
      for (const [nom, valeur] of Object.entries(attendus)) {
        assert.equal(
          derniere.parametres.get(nom), valeur,
          `Le filtre « ${nom} » du §29.8 doit partir sous ce nom exact. Requête : ${derniere.requete}`,
        );
      }
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('UNE VALEUR HOSTILE s’affiche, elle ne s’exécute pas (§29.5)', async () => {
    /* L'auditeur de la porte S3 a forgé un login contenant du JSON et des sauts
     * de ligne, et il est arrivé LITTÉRALEMENT dans le journal. Cet écran
     * l'affichera donc un jour : le journal d'audit est le dernier endroit du
     * produit où l'on peut se permettre une injection, puisque c'est celui qu'on
     * ouvre quand quelque chose a mal tourné.
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const hostile = '<img src=x onerror="window.__xss=1">';
      const resumeHostile = '</td></tr><script>window.__xss2=1</script>\r\n"ligne;suivante"';
      const charge = pageDEntrees(500, 1);
      charge.entrees[0].utilisateur_libelle = hostile;
      charge.entrees[0].resume = resumeHostile;
      charge.entrees[0].entite_id = '"><b>gras</b>';
      charge.entrees[0].valeurs_apres = { note: '<script>window.__xss3=1</script>' };

      await substituerJournal(session.page, { listes: [charge] });
      await ouvrirLeJournal(session.page, '.jrn-table');
      await session.page.waitForTimeout(200);

      const vu = await session.page.evaluate(() => ({
        xss: window.__xss ?? null,
        xss2: window.__xss2 ?? null,
        gestionnaires: document.querySelectorAll('#app [onerror], #app [onclick], #app [onload]').length,
        scripts: document.querySelectorAll('#app script').length,
        texte: document.querySelector('.jrn-table').textContent,
        lignes: document.querySelectorAll('.jrn-ligne').length,
      }));

      assert.equal(vu.xss, null, 'Le gestionnaire « onerror » d’un login forgé s’est exécuté.');
      assert.equal(vu.xss2, null, 'Un <script> forgé dans un résumé s’est exécuté.');
      assert.equal(vu.gestionnaires, 0, 'Un attribut de gestionnaire a été construit depuis une donnée.');
      assert.equal(vu.scripts, 0, 'Une balise <script> a été construite depuis une donnée.');
      assert.equal(vu.lignes, 1, 'La ligne forgée ne doit pas se scinder en plusieurs lignes du tableau.');
      assert.ok(
        vu.texte.includes(hostile),
        `La valeur doit s’afficher TELLE QUELLE — la lire est le travail de l’auditeur.\n${vu.texte}`,
      );
      assert.ok(vu.texte.includes('window.__xss2=1'), 'Le résumé forgé doit être lisible en clair.');

      // Le détail (valeurs avant/après) est le second chemin d'injection.
      await session.page.click('.jrn-ligne');
      await session.page.waitForSelector('.jrn-detail', { timeout: DELAI });
      const detail = await session.page.evaluate(() => ({
        xss3: window.__xss3 ?? null,
        scripts: document.querySelectorAll('#app script').length,
        texte: document.querySelector('.jrn-detail').textContent,
      }));
      assert.equal(detail.xss3, null, 'Un <script> forgé dans « valeurs_apres » s’est exécuté.');
      assert.equal(detail.scripts, 0);
      assert.ok(detail.texte.includes('window.__xss3=1'), 'Le différentiel doit rester lisible.');

      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('LE DÉTAIL s’ouvre par l’identifiant lu dans le DOM, et se referme', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      await substituerJournal(session.page, { listes: [pageDEntrees(700, 3)] });
      await ouvrirLeJournal(session.page, '.jrn-table');

      await session.page.click('.jrn-ligne[data-numero="698"]');
      await session.page.waitForSelector('.jrn-detail[data-detail="698"]', { timeout: DELAI });
      const contenu = await session.page.evaluate(
        () => document.querySelector('.jrn-detail[data-detail="698"]').textContent,
      );
      assert.match(contenu, /empreinte/, 'Le détail doit montrer l’empreinte : c’est la preuve du chaînage.');
      assert.match(contenu, /LOG-698/, 'Et l’identifiant de l’entrée ouverte, pas d’une autre.');

      await session.page.click('.jrn-ligne[data-numero="698"]');
      assert.equal(
        await session.page.evaluate(() => document.querySelectorAll('.jrn-detail').length), 0,
        'Un second clic referme le détail.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('QUAND LA ROUTE EST ABSENTE, l’écran le DIT — il n’affiche pas un journal vide', async () => {
    /* ── Le mensonge que cet essai empêche ─────────────────────────────────
     *
     * « Aucune entrée » et « je n'ai pas pu lire » se ressemblent à l'écran et
     * ne veulent pas dire la même chose. Sur un tableau de risques, la confusion
     * coûte une inquiétude ; sur un journal d'audit, elle dit à un auditeur
     * qu'il ne s'est rien passé. C'est exactement la famille du constat Q-104 —
     * *un `0` sur une table cloisonnée ne distingue pas « vide » de « non
     * contrôlé »* — et elle vaut aussi pour l'écran.
     *
     * ⚠️ **Le moyen de provoquer l'échec a changé, et c'est une bonne nouvelle.**
     * Cet essai s'appuyait sur l'ABSENCE de route : `src/api/journal.ts` était
     * une couture vide, l'écran recevait 404, et l'échec arrivait tout seul. Les
     * trois routes existent depuis que la couture est branchée — l'écran lit, et
     * l'essai a rougi faute d'échec à mesurer.
     *
     * S'appuyer sur un défaut pour éprouver la réaction à ce défaut est un
     * montage qui périme à la première correction. L'échec est donc **provoqué**
     * : l'API est rendue injoignable, ce qui est le cas réel — une coupure de
     * VPN — et non un état transitoire du chantier.
     */
    const coupee = await servirApplication(serveur);
    const session = await ouvrirPage(navigateur);
    session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    try {
      // L'application ne démarre pas sans serveur — c'est la règle posée en
      // vague 2, et elle tient. On la laisse donc démarrer normalement…
      await session.page.goto(`${coupee.url}/index.html`, { waitUntil: 'domcontentloaded' });
      await attendreApplication(session.page, { delai: DELAI });
      // … puis on coupe, et on demande le journal.
      coupee.definirApiInjoignable(true);
      await ouvrirLeJournal(session.page, '#journalCorps');
      await session.page.waitForFunction(
        () => {
          const c = document.getElementById('journalCorps');
          return c !== null && c.textContent.trim().length > 0 &&
            !c.textContent.includes('Lecture du journal');
        },
        null, { timeout: DELAI },
      );
      const vu = await session.page.evaluate(() => ({
        corps: document.getElementById('journalCorps').textContent,
        introuvable: (document.getElementById('app')?.textContent ?? '').includes('Page introuvable'),
        alerte: document.querySelector('#journalCorps [role="alert"]') !== null,
      }));

      assert.equal(vu.introuvable, false, 'La route /journal doit rendre un écran.');
      assert.equal(
        vu.corps.includes('Aucune entrée'), false,
        `L’écran annonce « aucune entrée » alors qu’il n’a rien pu lire :\n${vu.corps}`,
      );
      assert.equal(vu.alerte, true, 'L’échec doit être annoncé comme tel (role="alert").');
      assert.match(
        vu.corps, /n'a pas pu être lu|pas disponible/,
        `L’écran doit nommer le fait :\n${vu.corps}`,
      );
      assert.deepEqual(session.erreursScript, [], 'Et sans casser un gestionnaire (constat M-6).');
    } finally {
      await session.fermer();
      await coupee.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — La vérification du chaînage : la réponse à l'auditeur
 * ===================================================================== */

describe('« Le RSSI peut-il modifier le journal ? » — la vérification répond', () => {
  test('AUCUNE LIGNE RENDUE = journal sain, et le verdict le dit', async () => {
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const demandes = await substituerJournal(session.page, { anomalies: [] });
      await ouvrirLeJournal(session.page, '.jrn-table');

      await session.page.click('#journalVerifierBtn');
      await session.page.waitForSelector('.jrn-verdict--sain', { timeout: DELAI });

      const verdict = await session.page.evaluate(
        () => document.getElementById('journalVerdict').textContent,
      );
      assert.match(verdict, /intact/i, `Le verdict doit être lisible sans glossaire :\n${verdict}`);
      assert.ok(
        demandes.some((d) => d.chemin === '/api/journal/verification'),
        `La vérification doit être demandée au serveur — la calculer dans le navigateur ne ` +
          `prouverait rien. Chemins vus : ${JSON.stringify(demandes.map((d) => d.chemin))}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE DANS L’AUTRE SENS : une anomalie est NOMMÉE, pas avalée', async () => {
    /* Sans ce contrôle, « chaînage intact » serait aussi ce qu'afficherait un
     * écran qui ne sait rien lire. Un garde-fou se vérifie dans les deux sens
     * (`CONVENTIONS.md` §20.2).
     */
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      await substituerJournal(session.page, {
        anomalies: [
          {
            numero_entree: 137,
            id_entree: 'LOG-137',
            horodatage_entree: '2026-09-03T22:14:00Z',
            anomalie: 'empreinte_invalide',
            detail: 'le contenu ne correspond plus à son empreinte',
          },
        ],
      });
      await ouvrirLeJournal(session.page, '.jrn-table');
      await session.page.click('#journalVerifierBtn');
      await session.page.waitForSelector('.jrn-verdict--rompu', { timeout: DELAI });

      const verdict = await session.page.evaluate(
        () => document.getElementById('journalVerdict').textContent,
      );
      assert.match(verdict, /rompu/i, verdict);
      assert.match(verdict, /empreinte_invalide/, `L’anomalie doit être nommée :\n${verdict}`);
      assert.match(verdict, /137/, `Et l’entrée en cause identifiée :\n${verdict}`);
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — L'export du journal : l'entonnoir, et rien d'autre
 * ===================================================================== */

describe('L’export du journal passe par l’entonnoir (constats Q-89 et Q-92)', () => {
  test('UN PROFIL QUI ÉCRIT ET N’EXPORTE PAS n’obtient aucun fichier — ni requête', async () => {
    /* ⚠️ **C'est la combinaison exacte de Q-92**, et le discriminant compte :
     * ce profil n'est PAS en lecture seule. Le filet précédent n'éprouvait que
     * la lecture seule, qui bloque pour une autre raison — d'où un vert sur
     * douze sites dont l'un ne tenait pas (Q-89).
     */
    const session = await ouvrirApplication(ECRIT_SANS_EXPORTER);
    try {
      const demandes = await substituerJournal(session.page);
      await ouvrirLeJournal(session.page, '.jrn-table');
      await armerCompteurDeSorties(session.page);

      const rendu = await session.page.evaluate(() => JournalModule.exporter());
      const sorties = await lireSorties(session.page);

      assert.equal(rendu, false, 'La fonction d’export doit rendre « refusé ».');
      assert.equal(
        sorties.total, 0,
        `Un fichier de journal d’audit est sorti pour un profil sans droit d’export : ` +
          `${JSON.stringify(sorties)}. C’est le constat Q-89, appliqué aux trois ans ` +
          `d’identités et d’adresses IP que cette table contient.`,
      );
      assert.equal(
        demandes.some((d) => d.chemin === '/api/journal/export'), false,
        `L’entonnoir doit s’arrêter AVANT le réseau : la requête d’export a été émise. ` +
          `Chemins vus : ${JSON.stringify(demandes.map((d) => d.chemin))}`,
      );

      // Et le bouton lui-même est neutralisé (courtoisie, jamais barrière).
      assert.equal(
        await session.page.evaluate(() => document.getElementById('journalExportBtn').disabled), true,
        'Le bouton d’export doit être neutralisé pour ce profil.',
      );
      // …tandis que la vérification, qui est une LECTURE, reste utilisable.
      assert.equal(
        await session.page.evaluate(() => document.getElementById('journalVerifierBtn').disabled), false,
        'Vérifier le chaînage est une lecture (§29.8) : la neutraliser priverait un auditeur ' +
          'de la seule question qu’il vient poser.',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE : LE MÊME ÉCRAN, avec le droit d’export, produit bien un fichier', async () => {
    // Sans lui, « aucun fichier » serait aussi ce que rend un bouton cassé.
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const demandes = await substituerJournal(session.page);
      await ouvrirLeJournal(session.page, '.jrn-table');
      await armerCompteurDeSorties(session.page);

      const rendu = await session.page.evaluate(() => JournalModule.exporter());
      const sorties = await lireSorties(session.page);

      assert.equal(rendu, true, 'L’export doit aboutir pour un profil qui en a le droit.');
      assert.ok(sorties.total > 0, `Aucun fichier produit : ${JSON.stringify(sorties)}`);
      assert.ok(
        demandes.some((d) => d.chemin === '/api/journal/export'),
        `L’export doit être demandé au SERVEUR (§29.8) : le fabriquer dans le navigateur ` +
          `sortirait des données que le serveur n’a pas décidé de rendre, et échapperait à ` +
          `la journalisation de l’extraction. Chemins vus : ${JSON.stringify(demandes.map((d) => d.chemin))}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('MORSURE : sans la garde, le fichier SORT — donc l’essai mesure bien la garde', async () => {
    /* ── Pourquoi cette morsure est dans le dépôt, et pas seulement au rapport ──
     *
     * « Un correctif accepté n'est pas un correctif sûr. La seule preuve qu'il
     * tient est la MUTATION — le casser et vérifier que le banc rougit. »
     * (`CLAUDE.md` §8, leçon du 6ᵉ passage de la porte S2.)
     *
     * Le dépôt n'est pas modifié : `definirSubstitution` sert au navigateur un
     * `journal.js` privé de sa garde, le temps de l'essai (constat Q-32). Si
     * cette mesure devenait verte, elle dirait que l'essai du dessus ne mesure
     * pas ce qu'il croit.
     */
    const source = readFileSync(join(RACINE_FRONTEND, 'js', 'modules', 'journal.js'), 'utf8');
    const garde = 'if (typeof Droits !== "undefined" && !Droits.exigerExport()) return false;';
    assert.ok(
      source.includes(garde),
      'La garde d’export de `js/modules/journal.js` n’a plus la forme que cette morsure ' +
        'sait retirer. Ce n’est pas forcément un défaut — mais la morsure ne mord plus, ' +
        'et une morsure qui ne mord pas est un décor.',
    );
    const mutante = source.replace(garde, '/* garde retirée par la morsure */');
    assert.notEqual(mutante, source, 'La substitution n’a rien remplacé.');

    /* ⚠️ **La substitution est posée AVANT la première ouverture**, et ce détail
     * a coûté une mesure fausse : ouvrir la page puis substituer puis recharger
     * laissait Chromium servir le `journal.js` d'origine depuis son cache
     * mémoire — la morsure passait alors pour « rien n'est sorti », c'est-à-dire
     * exactement le verdict qu'elle doit rendre impossible. Un instrument qui
     * invente ce qu'il mesure est pire qu'un instrument absent.
     */
    application.definirSubstitution('/js/modules/journal.js', mutante);
    let session;
    try {
      session = await ouvrirApplication(ECRIT_SANS_EXPORTER);
      await substituerJournal(session.page);
      await session.page.evaluate(() => { window.location.hash = '#/journal'; });
      await session.page.waitForSelector('.jrn-table', { timeout: DELAI });
      await armerCompteurDeSorties(session.page);

      const rendu = await session.page.evaluate(() => JournalModule.exporter());
      await session.page.waitForTimeout(200);
      const sorties = await lireSorties(session.page);

      assert.ok(
        sorties.total > 0,
        `La garde a été retirée et RIEN n’est sorti (rendu : ${String(rendu)}, ` +
          `${JSON.stringify(sorties)}). L’essai précédent mesure donc autre chose que la ` +
          'garde — un décor, au sens du dépôt.',
      );
    } finally {
      application.definirSubstitution('/js/modules/journal.js', null);
      await session?.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — Le menu conditionnel, et le serveur qui est la vraie barrière
 * ===================================================================== */

describe('L’entrée « Journal d’audit » suit le domaine, et le serveur décide seul', () => {
  test('LE MENU montre l’entrée à qui porte le domaine « journal », et la cache sinon', async () => {
    const avec = await ouvrirApplication(ECRIT_SANS_EXPORTER);
    try {
      const visibles = await avec.page.evaluate(() =>
        Array.prototype.filter
          .call(document.querySelectorAll('.main-nav a[data-route]'), (a) => (a.closest('li') || a).getClientRects().length > 0)
          .map((a) => a.getAttribute('data-route')));
      assert.ok(
        visibles.includes('/journal'),
        `« /journal » doit être proposé à un profil qui porte le domaine. ${JSON.stringify(visibles)}`,
      );
      assert.deepEqual(avec.erreursScript, []);
    } finally {
      await avec.fermer();
    }

    const sans = await ouvrirApplication(ADMINISTRE_SANS_LE_JOURNAL);
    try {
      const visibles = await sans.page.evaluate(() =>
        Array.prototype.filter
          .call(document.querySelectorAll('.main-nav a[data-route]'), (a) => (a.closest('li') || a).getClientRects().length > 0)
          .map((a) => a.getAttribute('data-route')));
      assert.equal(
        visibles.includes('/journal'), false,
        `Ce profil administre tout SAUF le journal : c’est l’arbitrage du §29.8 — régler ` +
          `l’application et lire trois ans d’identités ne sont pas le même droit. ` +
          `${JSON.stringify(visibles)}`,
      );
      // …et « Paramètres », qui relève de l'administration, reste visible : sans
      // quoi le contrôle serait satisfait par un menu entièrement vide.
      assert.ok(
        visibles.includes('/settings'),
        `Le contrôle inverse : l’administration reste ouverte. ${JSON.stringify(visibles)}`,
      );
      assert.deepEqual(sans.erreursScript, []);
    } finally {
      await sans.fermer();
    }
  });

  test('L’INTERFACE N’EST PAS LA BARRIÈRE : la route est appelée directement, et refusée', async (t) => {
    /* ── ⚠️ CET ESSAI NE MESURAIT PAS CE QU'IL ANNONÇAIT ────────────────────
     *
     * Il portait : *« le bloc `droits` de la SESSION est bien substitué ; la
     * ROUTE, elle, ne l'est pas : c'est le vrai serveur qui répond »*. La
     * seconde moitié était vraie, la première rendait la mesure vide.
     *
     * `injecterDroits()` intercepte `GET /api/session` **dans le navigateur** :
     * elle change ce que la PAGE croit, jamais ce que le SERVEUR décide. Le
     * serveur de ce fichier est monté une fois pour tous les essais, avec la
     * session provisoire — qui porte tous les domaines, `journal` compris. La
     * route répondait donc **200**, et l'essai a rougi en le disant.
     *
     * Il aurait rougi plus tôt si `journal` avait été un domaine dès le départ :
     * il ne l'est que depuis l'arbitrage du 04/09. C'est-à-dire qu'il annonçait
     * une barrière que sa propre méthode ne pouvait pas atteindre — exactement
     * le motif du 7ᵉ passage de la porte S2, où un contrôle interrogeait
     * `/index.html` pendant que `/` rendait 403.
     *
     * ── Ce qu'il fait maintenant ──────────────────────────────────────────
     *
     * Un **second serveur**, monté pour ce seul essai, dont le résolveur rend
     * une session qui ne porte réellement pas le domaine `journal`. La page
     * s'ouvre contre lui, et l'appel direct traverse le vrai crochet
     * `onRequest` du produit — sans substitution d'aucune sorte, cette fois.
     */
    const perimetreRestreint = {
      utilisateurId: 'essai-sans-journal',
      filialeId: FILIALE_A,
      filiales: [FILIALE_A],
      perimetreGroupe: false,
      administrationGroupe: false,
    };
    const sessionServeur = {
      provisoire: false,
      async resoudre() { return perimetreRestreint; },
      async authentifier() {
        return {
          perimetre: perimetreRestreint,
          droits: ADMINISTRE_SANS_LE_JOURNAL,
          identite: { login: 'essai-sans-journal', nomAffichage: 'Sans journal' },
        };
      },
      decrire() { return 'session sans le domaine « journal » (test/navigateur/journal.test.mjs)'; },
    };

    const greffonRestreint = await monterGreffon(base, perimetreRestreint, { resolveur: sessionServeur });
    const applicationRestreinte = await servirApplication(greffonRestreint);
    const session = await ouvrirPage(navigateur);
    session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    await session.page.goto(`${applicationRestreinte.url}/index.html`, { waitUntil: 'domcontentloaded' });
    await attendreApplication(session.page, { delai: DELAI });
    try {
      const issue = await session.page.evaluate(async () => {
        const r = await fetch('api/journal', { credentials: 'same-origin', cache: 'no-store' });
        return { statut: r.status, corps: (await r.text()).slice(0, 200) };
      });

      assert.equal(
        issue.statut >= 200 && issue.statut < 300, false,
        `Le serveur a RENDU le journal d’audit à un profil qui ne porte pas le domaine ` +
          `« journal » (statut ${String(issue.statut)}). Le menu masqué n’est pas une ` +
          `barrière.\n${issue.corps}`,
      );

      if (issue.statut === 404) {
        /* ── Le dire, plutôt que de le taire ────────────────────────────────
         * Un contrôle non joué ne se confond pas avec un contrôle réussi
         * (constats Q-75, Q-76). Ici le refus vient de l'ABSENCE de route, pas
         * du modèle de droits : `src/api/journal.ts` est une couture que
         * l'agent J2 remplit en parallèle. La propriété au-dessus tient déjà —
         * aucune donnée ne sort — mais elle ne prouve pas encore le refus PAR
         * LE DROIT, et c'est écrit ici.
         */
        t.diagnostic(
          'Les routes du §29.8 ne sont pas encore enregistrées (404). Le refus mesuré est ' +
            'celui d’une route absente, pas celui du modèle de droits. Quand l’agent J2 ' +
            'aura livré `src/api/journal.ts`, ce refus doit devenir 403 « droit_insuffisant » ' +
            '— et le contrôle ci-dessous se déclenchera tout seul.',
        );
      } else {
        assert.equal(
          issue.statut, 403,
          `La route existe : le refus doit alors être un refus de DROIT (403), et non ` +
            `${String(issue.statut)}.\n${issue.corps}`,
        );
      }
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
      await applicationRestreinte.fermer();
      await greffonRestreint.fermer();
    }
  });

  test('CONTRÔLE SYMÉTRIQUE : le domaine « journal » est bien celui que l’écran déclare', async () => {
    // Sans lui, masquer l'entrée serait satisfait par une route rattachée à
    // n'importe quel domaine fermé — y compris par erreur à « administration »,
    // ce que le §29.8 refuse explicitement.
    const session = await ouvrirApplication(ECRIT_ET_EXPORTE);
    try {
      const domaine = await session.page.evaluate(() => window.domaineDeRoute('/journal'));
      assert.equal(
        domaine, 'journal',
        `L’écran du journal doit relever du domaine « journal », et non de ` +
          `« ${domaine} » (§29.8, arbitrage du 04/09/2026).`,
      );
      const manques = await session.page.evaluate(() => window.verifierCouvertureDesRoutes([]));
      assert.deepEqual(manques, [], `La table des domaines laisse un écran de côté : ${JSON.stringify(manques)}`);
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});
