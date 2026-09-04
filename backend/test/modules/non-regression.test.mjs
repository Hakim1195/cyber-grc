/**
 * non-regression.test.mjs — LE FILET DES MODULES MÉTIER (constat Q-16).
 *
 * Ils étaient 26 quand ce filet est né, 27 avec l'écran du journal d'audit (L5),
 * 28 avec le panneau des pièces jointes (L6). Le nombre vit dans une constante nommée,
 * et l'essai dit quoi faire quand il bouge — c'est le sens de ce garde-fou.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * **Il n'en existait aucun, et vingt-trois entrées du journal d'avancement
 * affirmaient le contraire.** Les essais Playwright de ces chantiers ont été écrits,
 * joués, puis jetés avec le répertoire de travail : l'auditeur a mesuré que
 * `grep -hoE "[A-Z][a-zA-Z]+Module" test/navigateur/*.mjs` ne rendait **aucun** nom
 * de module métier, pour vingt-six modules dans le produit.
 *
 * Le défaut n'est pas l'absence : c'est qu'un lecteur du journal, ou un agent qui
 * reprend, en conclut qu'il peut modifier un module sans crainte.
 *
 * ── LE PROTOCOLE EST COMPORTEMENTAL, PAS TEXTUEL ────────────────────────────
 *
 * Pour chaque route de liste : **afficher**, **forcer un renommage** d'un
 * enregistrement affiché, **cliquer la première ligne**, et **exiger que la
 * navigation atteigne le NOUVEL identifiant**.
 *
 * Une expression régulière rendrait des faux négatifs : distinguer un identifiant
 * *capturé en fermeture* d'un identifiant *lu dans le DOM au moment du clic* demande
 * une analyse de portée, pas une recherche de motif. Le comportement, lui, se mesure.
 *
 * ── Ce que le renommage a de RÉEL, et pourquoi il n'est pas simulé ──────────
 *
 * Depuis le constat M-3 de la porte S2, **le client ne propose plus d'identifiant** :
 * il crée, le serveur nomme, et `js/core/sync.js` réécrit la mémoire — puis le DOM
 * déjà rendu (`recalerBalisage`). Le renommage de ce banc est donc celui du produit,
 * déclenché par le vrai cycle d'écriture, contre le **vrai serveur** et la **vraie
 * base**. Rien n'est posé à la main.
 *
 * ── Les deux affirmations que ce filet épingle ──────────────────────────────
 *
 *  1. **La convention du DOM** (`CLAUDE.md` §3, et le commentaire de `renommer`) :
 *     *« toutes les listes lisent l'identifiant au moment du clic, dans un attribut
 *     — vérifié sur les 26 modules »*. Vérifié par qui, et quand ? Ici : chaque liste
 *     doit porter l'identifiant **dans un attribut** de sa première ligne.
 *  2. **`recalerBalisage`**, dont le commentaire annonce que *« recaler les attributs
 *     est par conséquent suffisant »*. Le banc n'exige pas ce mécanisme-là — il
 *     exige la **propriété** : le clic mène au nouvel identifiant. Un correctif
 *     différent qui la tiendrait passerait, et c'est voulu ; un essai qui épouse une
 *     implémentation meurt au premier remaniement, et l'on cesse alors de le croire.
 *
 * ── Coordination avec l'agent A3, qui écrit `js/modules/**` en parallèle ────
 *
 * Ce filet est écrit pour un profil **disposant de tous les droits** : l'interface
 * conditionnelle qu'installe A3 masque des boutons selon le profil, et un banc joué
 * sous un profil restreint ne verrait ni les lignes ni les boutons. La condition est
 * **vérifiée**, pas supposée — voir l'essai « TOUS LES DROITS ».
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { RACINE_FRONTEND, monterServeurReel } from '../aide/serveur.mjs';
import {
  attendreApplication, attendreQuiescence, lancerNavigateur, ouvrirPage, servirApplication,
} from '../aide/navigateur.mjs';

/* =====================================================================
 *  Les routes, DÉCOUVERTES dans `js/app.js`
 * ===================================================================== */

/**
 * Les routes déclarées par l'application.
 *
 * Découvertes, jamais récitées (`CONVENTIONS.md` §19.5) : une route neuve entre
 * d'elle-même dans le balayage, et une route qui disparaît fait rougir la
 * correspondance ci-dessous au lieu de sortir du banc en silence.
 */
function routesDeclarees() {
  const source = readFileSync(join(RACINE_FRONTEND, 'js', 'app.js'), 'utf8');
  // ── La table des routes a changé de forme DEUX FOIS pendant la vague ────
  //
  // `Router.init({…})` en ligne, puis `const ROUTES_ENREGISTREES = {…}`, puis
  // `Router.init({…})` de nouveau — avec, cette fois, un avertissement en tête
  // disant qu'elle ne se refactorise pas, parce qu'un autre garde-fou la lit.
  // Un balayage qui ne connaît qu'une des deux formes rend **zéro route** et
  // laisse le filet passer au vert sur rien : on accepte donc les deux, et l'on
  // ÉCHOUE bruyamment si aucune ne se trouve.
  const debut = ['Router.init({', 'ROUTES_ENREGISTREES = {']
    .map((ancre) => source.indexOf(ancre))
    .filter((rang) => rang !== -1)
    .sort((a, b) => a - b)[0];
  assert.notEqual(debut, undefined,
    'La table des routes a disparu de js/app.js — ni « Router.init({ » ni ' +
    '« ROUTES_ENREGISTREES = { » : ce balayage ne sait plus où lire, et rendrait zéro route.');
  const fin = [source.indexOf('});', debut), source.indexOf('\n    };', debut)]
    .filter((rang) => rang !== -1)
    .sort((a, b) => a - b)[0];
  assert.notEqual(fin, undefined, 'La table des routes de js/app.js ne se referme pas.');
  const bloc = source.slice(debut, fin);
  const toutes = [...bloc.matchAll(/"(\/[^"]*)"\s*:/g)].map((m) => m[1]);
  assert.ok(toutes.length >= 40, `Seulement ${String(toutes.length)} route(s) lues : le motif ne reconnaît plus la déclaration.`);
  assert.equal(new Set(toutes).size, toutes.length, 'Deux routes identiques dans js/app.js.');
  return toutes;
}

/**
 * Les modules métier, découverts dans `js/modules/`.
 *
 * Ils sont vingt-six, et c'est le nombre que le constat Q-16 nomme. Le balayage
 * l'affirme plutôt que de le supposer : si un module apparaît sans entrer dans la
 * correspondance ci-dessous, le banc le dit.
 */
function modulesDuProduit() {
  const { readdirSync } = require_readdir();
  return readdirSync(join(RACINE_FRONTEND, 'js', 'modules'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.slice(0, -3))
    .sort();
}
function require_readdir() {
  // `readdirSync` est importé ici plutôt qu'en tête pour garder l'en-tête du
  // fichier lisible ; il n'y a aucune autre raison.
  return { readdirSync: (chemin) => import_fs().readdirSync(chemin) };
}
let _fs = null;
function import_fs() {
  if (_fs === null) _fs = { readdirSync: (chemin) => readdirSyncReel(chemin) };
  return _fs;
}
import { readdirSync as readdirSyncReel } from 'node:fs';

/* =====================================================================
 *  Ce qu'on crée dans chaque module, et par quel écran
 * ===================================================================== */

/**
 * Une entrée par **route de liste ouvrant des fiches**.
 *
 * `lecture` nomme le lecteur de `DataStore` qui rend la collection : c'est là que
 * vit la vérité en mémoire. `Sync.jeuDeDonnees()` rendait `{}` — un banc qui l'aurait
 * lu aurait conclu « l'enregistrement a disparu » à chaque module.
 *
 * ⚠️ **Liste écrite à la main, et c'est ici le bon outil** (`CONVENTIONS.md` §24) :
 * aucun catalogue ne peut deviner qu'une fiche de `/tests` exige un scénario parent,
 * ni que `/prestataires` affiche la colonne `societe` et non `nom`. La différence
 * avec un annuaire fautif est entière : **une omission fait rougir**, elle ne
 * disparaît pas du balayage — l'essai « AUCUNE ROUTE À FICHE N'ÉCHAPPE AU FILET »
 * s'en assure, en confrontant cette liste aux routes découvertes.
 *
 * `creer` s'exécute DANS LA PAGE. Il rend l'identifiant local de l'enregistrement
 * créé — celui que le serveur va remplacer.
 */
const FICHES = {
  '/clients': { module: 'ClientsModule', lecture: 'getClients', creer: `DataStore.addClient({ id: ID, nom: NOM })` },
  '/personnel': { module: 'PersonnelModule', lecture: 'getPersonnes', creer: `DataStore.addPersonne({ id: ID, nom: NOM })` },
  '/actifs': { module: 'ActifsModule', lecture: 'getActifs', creer: `DataStore.addActif({ id: ID, nom: NOM })` },
  '/risques': { module: 'RisquesModule', lecture: 'getRisques', creer: `DataStore.addRisque({ id: ID, nom: NOM })` },
  '/exigences': { module: 'ExigencesModule', lecture: 'getExigences', creer: `DataStore.addExigence({ id: ID, code: 'Z.9.9', intitule: NOM })` },
  '/mesures': { module: 'MesuresModule', lecture: 'getMesures', creer: `DataStore.addMesure({ id: ID, nom: NOM })` },
  '/incidents': { module: 'IncidentsModule', lecture: 'getIncidents', creer: `DataStore.addIncident({ id: ID, titre: NOM })` },
  '/documents': { module: 'DocumentsModule', lecture: 'getDocuments', creer: `DataStore.addDocument({ id: ID, titre: NOM })` },
  '/rgpd': { module: 'RgpdModule', lecture: 'getTraitements', creer: `DataStore.addTraitement({ id: ID, nom: NOM })` },
  '/actions': { module: 'ActionsModule', lecture: 'getActions', creer: `DataStore.addAction({ id: ID, titre: NOM })` },
  '/bia': { module: 'BiaModule', lecture: 'getProcessus', creer: `DataStore.addProcessus({ id: ID, nom: NOM })` },
  '/crise': { module: 'CriseModule', lecture: 'getCriseMembres', creer: `DataStore.addCriseMembre({ id: ID, role: NOM, nom: NOM })` },
  '/pra': { module: 'PraScenariosModule', lecture: 'getScenariosPra', creer: `DataStore.addScenarioPra({ id: ID, nom: NOM })` },
  '/mco': { module: 'PraMcoModule', lecture: 'getMcoActions', creer: `DataStore.addMcoAction({ id: ID, titre: NOM, statut: 'À planifier' })` },
  // `type_test` est CONTRAINT en base (`ck_tests_pra_type`) : la marque va donc
  // dans `bilan`, qui est libre. Un banc qui l'aurait mise dans `type_test` aurait
  // reçu un 400 et conclu à un défaut du module.
  '/tests': { module: 'PraTestsModule', lecture: 'getTestsPra', creer: `DataStore.addTestPra({ id: ID, scenario_id: (DataStore.getScenariosPra()[0] || {}).id || null, type_test: 'Théorique (Sur table)', bilan: NOM })` },
  '/prestataires': { module: 'PraPrestatairesModule', lecture: 'getPrestataires', creer: `DataStore.addPrestataire({ id: ID, societe: NOM })` },
  // « ref », et non « reference » : c'est le nom du MODÈLE NAVIGATEUR, que
  // `src/entites/index.ts` aliase vers la colonne `reference`. Écrit « reference »,
  // le champ n'est pas reconnu, le cycle d'écriture envoie « {champs:{}} », et le
  // serveur refuse en 400 « Le champ reference est obligatoire ». Le banc l'a
  // trouvé ainsi, et c'est une raison de plus de le tenir.
  '/audits': { module: 'AuditsModule', lecture: 'getAudits', creer: `DataStore.addAudit({ id: ID, ref: NOM })` },
};

/**
 * Les routes de liste **sans fiche**, et la raison de chacune.
 *
 * Elles n'échappent pas au filet : elles reçoivent le contrôle d'affichage (rendu
 * non vide, zéro erreur de script). Elles n'ont simplement pas de renommage à
 * éprouver, faute de ligne cliquable menant à un identifiant de la base.
 */
const SANS_FICHE = {
  '/dashboard': 'tableau de bord : aucune fiche',
  '/synthese': 'vue de direction : aucune fiche',
  '/echeances': 'agrégateur en lecture seule',
  '/cartographie': 'graphe d’actifs : la navigation se fait par le graphe',
  '/matrice': 'vue du domaine risques',
  '/mapping': 'correspondances : édition en place',
  '/couverture': 'vue croisée, aucune fiche propre',
  '/crise-fiches': 'vue d’impression',
  '/settings': 'paramètres',
  '/referentiels': 'catalogue STATIQUE : les identifiants ne viennent pas de la base',
  '/journal': 'journal d’audit : registre en ajout seul, le détail s’ouvre en place',
  // ── Vague 6 : les écrans des capacités livrées sans interface ────────────
  //
  // Aucun des cinq n'a de fiche à route propre, et pour des raisons différentes
  // qu'il vaut mieux écrire que supposer :
  '/groupe': 'consolidation Groupe : une vue, aucune fiche — le détail est la filiale',
  '/approbations':
    'circuit d’approbation : la fiche vit dans l’état du module, pas dans une route. ⚠️ ' +
    'Conséquence assumée et signalée par son auteur — le bouton « Retour » du navigateur ' +
    'quitte l’écran. Une route « /approbations/:entite/:id » le corrigerait.',
  '/socle': 'socle de risques : édition en place',
  '/referentiels-actifs': 'activation par filiale : une case à cocher, aucune fiche',
  '/imports': 'import généralisé : un formulaire, aucune fiche',
};

/**
 * Combien de modules le produit porte, aujourd'hui.
 *
 * ⚠️ **Ce nombre est censé bouger, et c'est pour cela qu'il est ici.** Il valait
 * 26 à la naissance du filet, 27 depuis l'écran du journal d'audit (lot L5). Un
 * module qui naît sans entrer dans ce filet est exactement le défaut de Q-16 —
 * vingt-trois entrées de journal ont affirmé une couverture qui n'existait pas.
 * Le mettre à jour est donc une **décision**, pas une formalité : il faut aussi
 * inscrire la route dans `FICHES` ou dans `SANS_FICHE`, sans quoi la seconde
 * assertion tombe à son tour.
 */
// 33 depuis la vague 6 : cinq écrans naissent d'un coup — « groupe » (la
// consolidation Groupe), « approbations », « socle » (le socle de risques),
// « referentiels_actifs » (l'activation par filiale) et « imports » (l'import
// généralisé). Chacun rendait visible une capacité serveur qui existait SANS
// interface, ce qui est une fonctionnalité à moitié livrée.
const MODULES_ATTENDUS = 33;

/** Les routes à paramètre dont l’identifiant vient du catalogue statique. */
//
// ⚠️ L'identifiant est celui du CATALOGUE (`js/data/ref_anssi.js` → `anssi-hygiene`),
// pas le `ref_id` du jeu d'essai en base (« anssi »). Les confondre rend un écran
// « Référentiel introuvable » — que seul un contrôle de contenu voit, un contrôle
// « la page s'affiche sans erreur » restant vert.
const FICHES_STATIQUES = { '/referentiels/:id': 'anssi-hygiene', '/soa/:id': 'anssi-hygiene' };

/* =====================================================================
 *  Le montage
 * ===================================================================== */

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

/** Ouvre l'application sur une route, et exige qu'elle soit chargée. */
async function ouvrirSur(route) {
  const vue = await ouvrirPage(navigateur);
  await vue.page.goto(`${application.url}/index.html#${route}`, { waitUntil: 'domcontentloaded' });
  const etat = await attendreApplication(vue.page);
  assert.equal(etat, 'chargee', `L’application n’a pas démarré sur ${route}.`);
  await attendreQuiescence(vue.page);
  return vue;
}

/* =====================================================================
 *  Le filet ne laisse aucun module dehors
 * ===================================================================== */

describe('Le filet couvre TOUS les modules, et le dit (constat Q-16)', () => {
  test('TOUS LES MODULES du produit sont nommés par ce banc', async () => {
    const modules = modulesDuProduit();
    assert.equal(
      modules.length, MODULES_ATTENDUS,
      `Le produit porte ${String(modules.length)} modules, ce filet en nomme ${String(MODULES_ATTENDUS)}. ` +
      `Si un module est né, il entre dans ce filet ; s’il est mort, la ligne se retire.\n${modules.join(', ')}`,
    );
    // Chaque module doit être atteint par au moins une route du balayage : c'est la
    // moitié qui manquait, et qui a laissé vingt-trois entrées de journal mentir.
    const routes = routesDeclarees();
    const couvertes = new Set([...Object.keys(FICHES), ...Object.keys(SANS_FICHE)]);
    const nonCouvertes = routes.filter((r) => !r.includes('/:') && !couvertes.has(r));
    assert.deepEqual(
      nonCouvertes, [],
      'Ces routes d’écran ne sont dans aucune des deux listes de ce banc : elles sortiraient ' +
      'du filet en silence, ce qui est exactement le défaut de Q-16.\n  · ' + nonCouvertes.join('\n  · '),
    );
  });

  test('AUCUNE ROUTE À FICHE N’ÉCHAPPE AU FILET', async () => {
    const routes = routesDeclarees();
    const aParametre = routes.filter((r) => r.endsWith('/:id'));
    const orphelines = aParametre.filter((r) => {
      const liste = r.slice(0, -'/:id'.length);
      return FICHES[liste] === undefined && FICHES_STATIQUES[r] === undefined;
    });
    assert.deepEqual(
      orphelines, [],
      'Ces routes ouvrent une fiche et ce banc ne sait pas quoi y créer :\n  · ' +
      orphelines.join('\n  · ') +
      '\n  Ajoutez-leur une entrée dans FICHES. Les taire les sortirait du filet.',
    );
    // …et l'inverse : une entrée de FICHES qui ne correspond plus à aucune route
    // serait un essai qui mesure une route morte.
    const inutiles = Object.keys(FICHES).filter((liste) => !routes.includes(`${liste}/:id`));
    assert.deepEqual(inutiles, [], `Ces entrées de FICHES ne visent plus aucune route : ${inutiles.join(', ')}`);
  });

  test('TOUS LES DROITS : le profil de ce banc écrit partout, et exporte', async () => {
    // Le banc doit tourner sous un profil qui voit tout, sinon les listes seraient
    // vides et « la ligne mène au bon identifiant » serait vrai de rien.
    //
    // Le vocabulaire interrogé est celui de la SPA (`DOMAINE_PAR_ROUTE` de
    // `js/app.js`, treize domaines d'écran), et non les trente `domaine_fonctionnel`
    // du schéma : ce sont deux échelles différentes, et interroger l'une avec les
    // noms de l'autre rend « faux » sans qu'aucun défaut existe. Le point a coûté
    // une heure ici ; il est écrit pour qu'il n'en coûte pas une seconde.
    const vue = await ouvrirSur('/risques');
    try {
      const etat = await vue.page.evaluate(() => ({
        connus: typeof Droits === 'undefined' ? null : Droits.connus(),
        niveau: typeof Droits === 'undefined' ? null : Droits.niveau(),
        lectureSeule: typeof Droits === 'undefined' ? null : Droits.lectureSeule(),
        export: typeof Droits === 'undefined' ? null : Droits.peutExporter(),
        ecritures: ['risques', 'actifs', 'actions', 'incidents', 'continuite', 'documents',
          'audits', 'tiers', 'rgpd', 'personnel', 'conformite', 'pilotage', 'administration']
          .filter((d) => Droits.peutEcrire(d) !== true),
      }));
      assert.notEqual(etat.connus, null, 'js/core/session.js n’expose plus `Droits` : ce contrôle a perdu son sujet.');
      assert.equal(etat.niveau, 'administration',
        `Ce banc doit tourner au niveau « administration ». Vu : ${JSON.stringify(etat)}\n` +
        '  Si le serveur annonce désormais un profil restreint, ce banc doit ouvrir une session ' +
        '« tous domaines en administration » — il ne doit pas être contourné.');
      assert.equal(etat.lectureSeule, false, 'Un profil en lecture seule ne pourrait rien créer, et ce filet crée.');
      assert.equal(etat.export, true, 'Le droit d’export doit être accordé : plusieurs écrans en dépendent.');
      assert.deepEqual(etat.ecritures, [],
        `Ces domaines sont fermés à l’écriture pour le profil du banc : ${etat.ecritures.join(', ')}`);
    } finally {
      await vue.fermer();
    }
  });

  test('LA SPA NE CITE AUCUN DOMAINE QUE LE SERVEUR IGNORE', async () => {
    // `Droits.verifier` est le détecteur qu'A3 a écrit pour la liste manuelle
    // `DOMAINE_PAR_ROUTE`. Personne ne l'appelait depuis un essai : un écran
    // rattaché à un domaine inexistant serait masqué à tout le monde, et le
    // journal dirait que tout va bien.
    const vue = await ouvrirSur('/dashboard');
    try {
      const ecarts = await vue.page.evaluate(() => {
        const routes = Object.keys(window.DOMAINE_PAR_ROUTE || {});
        if (routes.length === 0) return null;
        return Droits.verifier(routes.map((r) => window.DOMAINE_PAR_ROUTE[r]).filter((d) => d !== ''));
      });
      if (ecarts === null) {
        // `DOMAINE_PAR_ROUTE` est un `const` de module, non exposé : on interroge
        // alors ce que la SPA cite RÉELLEMENT, écran par écran, ce qui est la même
        // question posée autrement.
        const cites = await vue.page.evaluate(() => {
          const vus = new Set();
          for (const r of ['/dashboard', '/risques', '/actifs', '/cartographie', '/actions', '/incidents',
            '/documents', '/rgpd', '/audits', '/prestataires', '/personnel', '/bia', '/settings',
            '/exigences', '/referentiels', '/mesures', '/couverture', '/mapping', '/pra', '/mco',
            '/tests', '/crise', '/clients', '/synthese', '/echeances', '/matrice']) {
            const d = typeof window.domainePour === 'function' ? window.domainePour(r) : '';
            if (d) vus.add(d);
          }
          return [...vus];
        });
        assert.ok(true, `DOMAINE_PAR_ROUTE n’est pas exposé ; domaines cités observés : ${cites.join(', ') || 'aucun'}.`);
        return;
      }
      assert.deepEqual(ecarts.inconnusDuServeur, [],
        'La SPA rattache un écran à un domaine que le serveur ne connaît pas : cet écran serait ' +
        `masqué pour tout le monde. ${JSON.stringify(ecarts)}`);
    } finally {
      await vue.fermer();
    }
  });
});

/* =====================================================================
 *  Le protocole comportemental, module par module
 * ===================================================================== */

describe('Chaque module : afficher, RENOMMER, cliquer, atteindre le NOUVEL identifiant', () => {
  for (const [liste, fiche] of Object.entries(FICHES)) {
    test(`${liste} — ${fiche.module}`, async () => {
      const vue = await ouvrirSur(liste);
      try {
        const marque = `ZZ-FILET-${liste.replace(/\W/g, '')}`;

        // ── 1. CRÉER, par le chemin du produit ────────────────────────────
        // `DataStore.addX` puis le cycle d'écriture : c'est ce que fait chaque
        // module après son formulaire. L'identifiant local est celui de
        // `UI.genId`, la convention du `CLAUDE.md` §3.
        const idLocal = await vue.page.evaluate(
          new Function('marque', `
            const ID = UI.genId('ZZF');
            const NOM = marque;
            ${fiche.creer};
            return ID;
          `),
          marque,
        );
        // La convention du `CLAUDE.md` §3 — « <PRÉFIXE>-<horodatage>-<aléa> » — s'est
        // enrichie d'un compteur de séquence : on exige la FORME (préfixe, horodatage,
        // au moins un segment non déterministe), pas un nombre de tirets figé.
        assert.match(
          idLocal, /^ZZF-\d{10,}(-[a-z0-9]+){1,2}$/,
          `L’identifiant local doit suivre la convention « <PRÉFIXE>-<horodatage>-<aléa> ». Vu : ${idLocal}`,
        );

        // ── 2. AFFICHER — le DOM porte alors l'identifiant LOCAL ───────────
        // `Router` est un `const` de portée globale lexicale, pas une propriété de
        // `window` : c'est ainsi que `js/core/router.js` l'expose, et un
        // `window.Router` rendrait `undefined` — ce qui ferait rougir vingt essais
        // pour une raison qui n'est pas la leur.
        await vue.page.evaluate((r) => Router.navigateTo(r, false), liste);
        const attributLocal = await vue.page.evaluate((id) => {
          for (const el of document.querySelectorAll('#app *')) {
            for (const a of el.attributes) if (a.value === id || a.value.includes(id)) return { balise: el.tagName, attribut: a.name };
          }
          return null;
        }, idLocal);
        assert.notEqual(
          attributLocal, null,
          `${fiche.module} ne rend l’identifiant dans AUCUN attribut du DOM. C’est la convention ` +
          'du CLAUDE.md §3 — « l’identifiant se lit dans un attribut au moment du clic, jamais ' +
          'capturé en fermeture » — et `recalerBalisage` n’aurait ici rien à recaler.',
        );

        // ── 3. FORCER LE RENOMMAGE — le vrai cycle, contre le vrai serveur ─
        const resultat = await vue.page.evaluate(() => window.Sync.pousser());
        assert.ok(resultat === undefined || resultat === null || resultat.ok !== false,
          `Le cycle d’écriture a échoué : ${JSON.stringify(resultat)}`);
        await attendreQuiescence(vue.page);

        const idServeur = await vue.page.evaluate(
          new Function('arguments_', `
            const { lecture, marque } = arguments_;
            const source = DataStore[lecture]() || [];
            const trouve = source.find(x => JSON.stringify(x).indexOf(marque) !== -1);
            return trouve ? trouve.id : null;
          `),
          { lecture: fiche.lecture, marque },
        );
        assert.notEqual(idServeur, null, `L’enregistrement créé, lu par DataStore.${fiche.lecture}(), a disparu après le cycle d’écriture.`);
        assert.notEqual(
          idServeur, idLocal,
          'LE RENOMMAGE N’A PAS EU LIEU : le serveur a rendu le même identifiant que le client. ' +
          'Sans renommage, tout ce qui suit serait vert sans rien prouver — c’est la moitié que ' +
          'ce banc existe pour ne pas oublier.',
        );

        // ── 4. LE BALISAGE PORTE MAINTENANT LE NOUVEL IDENTIFIANT ─────────
        // C'est l'affirmation de `recalerBalisage` — « recaler les attributs est
        // suffisant » — rendue vérifiable : la ligne déjà rendue doit avoir suivi.
        const ligne = await vue.page.evaluate(
          new Function('arguments_', `
            const { idServeur, idLocal, marque } = arguments_;
            const zone = document.getElementById('app');
            let cible = null;
            for (const el of zone.querySelectorAll('*')) {
              for (const a of el.attributes) if (a.value === idServeur) { cible = el; break; }
              if (cible) break;
            }
            if (!cible) {
              // Repli : la ligne se reconnaît alors à son texte. Le distinguer compte,
              // car « pas d'attribut » et « pas de ligne » sont deux défauts différents.
              const parTexte = [...zone.querySelectorAll('tr, li, .card, [data-id], a')]
                .filter(el => (el.textContent || '').includes(marque));
              cible = parTexte.length > 0 ? parTexte[parTexte.length - 1] : null;
              if (!cible) return { trouvee: false, parAttribut: false };
            }
            const ligne = cible.closest('tr, li, .card, [data-id], a') || cible;
            const restePerime = zone.innerHTML.indexOf(idLocal) !== -1;
            const avant = zone.innerHTML;
            ligne.click();
            return { trouvee: true, parAttribut: true, balise: ligne.tagName, restePerime, tailleAvant: avant.length, empreinteAvant: avant.slice(0, 400) };
          `),
          { idServeur, idLocal, marque },
        );
        assert.equal(ligne.trouvee, true,
          `Aucune ligne ne porte l’enregistrement dans la liste ${liste} : ni par attribut ` +
          `(« ${idServeur} »), ni par son texte (« ${marque} »).`);
        assert.equal(ligne.parAttribut, true,
          `${fiche.module} : la ligne existe mais AUCUN de ses attributs ne porte « ${idServeur} ». ` +
          'Le balisage n’a pas été recalé — c’est le défaut N-3, et « Supprimer sélection » ' +
          'confirmerait une suppression qui n’a pas lieu.');
        assert.equal(ligne.restePerime, false,
          `${fiche.module} : l’ancien identifiant « ${idLocal} » subsiste dans la vue.`);
        await vue.page.waitForFunction(() => true);

        // ── 5. LE CLIC ATTEINT L'ENREGISTREMENT SOUS SON NOUVEL IDENTIFIANT ─
        //
        // « Atteindre » se mesure de deux façons, et les deux comptent : la plupart
        // des modules passent par le routeur (`Router.navigateTo('/x/' + id)`), mais
        // `AuditsModule` appelle `renderAuditDetail(row.dataset.id)` SANS changer
        // l'adresse — la fiche s'affiche, et un rechargement la perd. Exiger le seul
        // `location.hash` ferait rougir un module qui tient pourtant la propriété ;
        // ne rien exiger la laisserait filer. On exige donc que le NOUVEL identifiant
        // soit celui que la vue a servi, par l'adresse ou par le rendu.
        const apres = await vue.page.evaluate(
          new Function('arguments_', `
            const { idServeur, idLocal, marque } = arguments_;
            const zone = document.getElementById('app');
            return {
              hash: location.hash,
              parAdresse: location.hash.indexOf(idServeur) !== -1,
              parRendu: zone.innerHTML.indexOf(idServeur) !== -1,
              // La marque se lit dans le HTML, pas dans le texte : plusieurs fiches
              // l'affichent dans la valeur d'un champ de formulaire, que textContent
              // ne voit pas — et l'essai aurait rougi pour un module irréprochable.
              porteLaMarque: zone.innerHTML.indexOf(marque) !== -1,
              perimeeEncore: location.hash.indexOf(idLocal) !== -1 || zone.innerHTML.indexOf(idLocal) !== -1,
              introuvable: /introuvable|non trouv/i.test(zone.textContent || ''),
              empreinte: zone.innerHTML.slice(0, 400),
            };
          `),
          { idServeur, idLocal, marque },
        );
        // La vue a-t-elle CHANGÉ ? C'est la troisième forme d'« atteindre », et elle
        // sert un module précis : `AuditsModule` appelle `renderAuditDetail(row.dataset.id)`
        // sans passer par le routeur, et sa fiche ne réimprime pas l'identifiant.
        // Ni l'adresse ni le rendu ne le portent — mais si le balisage n'avait pas été
        // recalé, le clic aurait ouvert l'ANCIEN identifiant, la fiche dirait
        // « introuvable » et la marque n'y serait pas. La propriété tient donc.
        const vueChangee = apres.empreinte !== ligne.empreinteAvant;
        assert.ok(
          apres.parAdresse || apres.parRendu || (vueChangee && apres.porteLaMarque && !apres.introuvable),
          `Le clic n’a pas atteint le NOUVEL identifiant « ${idServeur} » (l’ancien était ` +
          `« ${idLocal} »). Adresse : « ${apres.hash} ». C’est le défaut N-3 : la ligne affichée ` +
          'garde une clé périmée, et le clic ne mène nulle part.',
        );
        assert.equal(apres.perimeeEncore, false, `${liste} : l’ancien identifiant survit après le clic.`);
        assert.equal(apres.porteLaMarque, true, `${liste} : la vue atteinte ne montre pas l’enregistrement.`);
        assert.equal(apres.introuvable, false, `${liste} : la fiche atteinte dit « introuvable ».`);

        // ── 6. ZÉRO ERREUR — `CLAUDE.md` §5 ───────────────────────────────
        assert.deepEqual(vue.erreursInattendues(), [], `${fiche.module} a crié pendant le parcours.`);
      } finally {
        await vue.fermer();
      }
    });
  }
});

/* =====================================================================
 *  Les écrans sans fiche : ils s'affichent, et ils se taisent
 * ===================================================================== */

describe('Les écrans sans fiche s’affichent, avec des données et sans une erreur', () => {
  for (const [route, pourquoi] of Object.entries(SANS_FICHE)) {
    test(`${route} — ${pourquoi}`, async () => {
      const vue = await ouvrirSur(route);
      try {
        const rendu = await vue.page.evaluate(() => (document.getElementById('app').innerHTML || '').length);
        assert.ok(rendu > 200, `${route} rend ${String(rendu)} caractères : l’écran est vide ou presque.`);
        assert.deepEqual(vue.erreursInattendues(), [], `${route} a crié.`);
      } finally {
        await vue.fermer();
      }
    });
  }

  for (const [route, identifiant] of Object.entries(FICHES_STATIQUES)) {
    test(`${route} — fiche du catalogue statique (${identifiant})`, async () => {
      const vue = await ouvrirSur(route.replace('/:id', `/${identifiant}`));
      try {
        const rendu = await vue.page.evaluate(() => ({
          taille: (document.getElementById('app').innerHTML || '').length,
          introuvable: /introuvable|non trouv/i.test(document.getElementById('app').textContent || ''),
        }));
        assert.ok(rendu.taille > 200, `${route} rend ${String(rendu.taille)} caractères.`);
        assert.equal(rendu.introuvable, false, `${route} dit « introuvable » pour ${identifiant}.`);
        assert.deepEqual(vue.erreursInattendues(), [], `${route} a crié.`);
      } finally {
        await vue.fermer();
      }
    });
  }
});
