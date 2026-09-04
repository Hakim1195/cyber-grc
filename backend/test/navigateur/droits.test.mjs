/**
 * droits.test.mjs — ce que les droits rendent conditionnel dans l'interface.
 *
 * ── Le critère, mot pour mot ────────────────────────────────────────────────
 *
 * `PLAN_EXECUTION` §3, ligne MODULES du lot L3 : « un profil *Direction*
 * (lecture, Groupe) ne se voit proposer **aucune action d'écriture** — et
 * l'interface n'est **pas** la barrière : le serveur refuse aussi. »
 *
 * Les deux moitiés sont éprouvées ici différemment, et c'est volontaire :
 *
 *  · la première — *aucune action proposée* — est mesurée à l'écran ;
 *  · la seconde — *l'interface n'est pas la barrière* — est mesurée **par la
 *    négative** : on vérifie que le navigateur ne se prend pas pour une
 *    barrière, c'est-à-dire qu'il laisse la requête partir. Que le serveur la
 *    refuse appartient à `test/api/**` (contrôle S6), et cette moitié-là est
 *    **signalée comme manquante ici** plutôt que supposée.
 *
 * ── Pourquoi les droits sont injectés depuis l'essai ────────────────────────
 *
 * ⚠️ Au moment où ce fichier est écrit, `GET /api/session` ne rend pas encore
 * de bloc `droits` : la couche d'authentification est écrite en parallèle
 * (agents A1 et A2). L'essai va donc chercher **la vraie charge du vrai
 * serveur** et n'y ajoute que le bloc `droits`, dans la forme figée par
 * `CONVENTIONS.md` §26.1 — `{ niveau, domaines, export }`, valeurs relevées
 * dans `backend/src/api/droits.ts`.
 *
 * Le jour où le serveur le rend, ces trois lignes d'injection tombent et les
 * assertions ne bougent pas : elles portent sur la réaction de l'écran.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { RACINE_FRONTEND, monterServeurReel } from '../aide/serveur.mjs';

/**
 * Délai d'attente des essais de ce fichier.
 *
 * ⚠️ **60 s, et ce n'est pas un délai « au cas où ».** `npm test` exécute les
 * fichiers d'essai en parallèle : depuis la vague 3, ce sont **cinq** familles
 * qui lancent chacune un Chromium, plus la famille de déploiement qui monte un
 * Apache réel — sur quatre cœurs. Mesuré : les essais de ce fichier passent en
 * ~1,5 s à 3 s joués seuls, et butaient sur la borne de 15 s joués avec toute
 * la suite, tous à ~15,4 s, c'est-à-dire sur la borne elle-même.
 *
 * Relever la borne n'est PAS masquer une course : ce qui est attendu ici est un
 * état que le produit atteint, et la lenteur vient de la machine, pas du
 * produit. La distinction est celle du constat Q-64 — un banc qui rougit pour
 * une raison sur laquelle personne ne peut agir apprend à être ignoré.
 */
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

async function enBase(texte, valeurs = []) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
    (await c.query(texte, valeurs)).rows);
}

/**
 * Les droits des huit profils du `PLAN_SERVEUR` §3.2 ne sont pas réécrits ici :
 * on en éprouve **deux**, choisis parce qu'ils sont les deux bornes du modèle.
 * Exercer les huit est le livrable de l'agent A4 (`test/annuaire/**`), qui les
 * exerce là où ils se décident — côté serveur.
 */
const DIRECTION = Object.freeze({
  niveau: 'lecture',
  domaines: ['pilotage', 'conformite'],
  export: false,
});

const RSSI = Object.freeze({
  niveau: 'contribution',
  domaines: [
    'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
    'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel',
  ],
  export: true,
});

/**
 * Fait rendre à `GET /api/session` la VRAIE charge du serveur, plus le bloc
 * `droits`. On ne fabrique pas la charge : un essai qui invente ce qu'il mesure
 * ne peut rien contredire (leçon de `test/aide/navigateur.mjs`).
 */
async function injecterDroits(page, droits) {
  await page.route('**/api/session', async (route) => {
    const vraie = await route.fetch();
    const charge = JSON.parse(await vraie.text());
    charge.droits = droits;
    // L'authentification n'est plus provisoire : c'est ce qui fait apparaître
    // le bloc « Compte » et la déconnexion.
    charge.authentification = { ...(charge.authentification ?? {}), provisoire: false };
    charge.identite = { login: 'essai', nomAffichage: 'Compte d’essai' };
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(charge),
    });
  });
}

/**
 * Retire le bloc `droits` de la charge de session.
 *
 * ⚠️ Cette fonction a **remplacé une supposition qui était juste au moment où
 * elle a été écrite et fausse une heure plus tard**. L'essai « sans bloc droits »
 * se contentait d'ouvrir l'application contre le serveur de développement, en
 * expliquant que « le serveur ne rend pas encore de droits ». Il en rend
 * désormais (agent A2, `charteSession`), et l'essai a rougi sur un produit qui
 * s'améliorait — la faute exacte que le §15 de `bascule.test.mjs` corrige chez
 * les autres : **assertionner la propriété, jamais l'état du moment.**
 *
 * La propriété visée n'a pas bougé : *quand le serveur n'annonce rien,
 * l'interface ne masque rien*. On produit donc cette condition, au lieu de
 * l'espérer.
 */
async function retirerLesDroits(page) {
  await page.route('**/api/session', async (route) => {
    const vraie = await route.fetch();
    const charge = JSON.parse(await vraie.text());
    delete charge.droits;
    return route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(charge),
    });
  });
}

/**
 * @param {object|null|undefined} droits objet de droits à injecter ; `null`
 *        retire le bloc ; `undefined` laisse la charge du serveur telle quelle.
 */
async function ouvrirApplication(droits) {
  const session = await ouvrirPage(navigateur);
  if (droits === null) await retirerLesDroits(session.page);
  else if (droits !== undefined) await injecterDroits(session.page, droits);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page, { delai: DELAI }), 'chargee', 'L’application doit démarrer.');
  await attendreQuiescence(session.page, { delai: DELAI });
  return session;
}

/**
 * Entrées de menu **réellement rendues**, par route.
 *
 * ⚠️ La première rédaction lisait la propriété `li.hidden` — c'est-à-dire
 * exactement ce que le code sous essai venait d'écrire. Elle serait restée
 * verte le jour où une règle de `css/style.css` poserait un `display` sur
 * `.main-nav li` et écraserait le `[hidden]` du navigateur : l'entrée serait
 * visible à l'écran, et l'essai aurait dit le contraire. On mesure donc ce que
 * l'utilisateur voit — un rectangle de rendu —, jamais l'attribut qu'on a posé.
 *
 * La liste est lue dans le DOM, jamais recopiée : une entrée ajoutée à
 * `index.html`, qui appartient à un autre agent, est prise en compte sans que
 * cet essai bouge.
 */
function menuVisible(page) {
  return page.evaluate(() =>
    Array.prototype.filter
      .call(document.querySelectorAll('.main-nav a[data-route]'), (a) => {
        const li = a.closest('li') || a;
        return li.getClientRects().length > 0;
      })
      .map((a) => a.getAttribute('data-route')));
}

/** Va sur une route et attend que la vue soit rendue. */
async function naviguer(page, route, selecteurAttendu) {
  await page.evaluate((r) => { window.location.hash = '#' + r; }, route);
  await page.waitForSelector(selecteurAttendu, { timeout: DELAI });
}

/* =====================================================================
 *  §1 — Le profil Direction : lecture, et rien d'autre
 * ===================================================================== */

describe('Un profil en lecture ne se voit proposer aucune action d’écriture', () => {
  test('LE MENU ne montre que les domaines ouverts', async () => {
    const session = await ouvrirApplication(DIRECTION);
    try {
      const visibles = await menuVisible(session.page);

      // Ouverts : pilotage (tableau de bord, synthèse, échéancier) et
      // conformité (référentiels, mesures, exigences, correspondances).
      for (const attendu of ['/dashboard', '/synthese', '/echeances', '/exigences', '/referentiels']) {
        assert.ok(visibles.includes(attendu), `« ${attendu} » doit rester visible. ${JSON.stringify(visibles)}`);
      }
      // Fermés : tout le reste.
      for (const interdit of ['/risques', '/actifs', '/incidents', '/documents', '/rgpd',
        '/personnel', '/clients', '/audits', '/bia', '/crise', '/settings']) {
        assert.equal(
          visibles.includes(interdit), false,
          `« ${interdit} » ne relève d’aucun domaine ouvert à ce profil : le proposer enverrait ` +
            `l’utilisateur sur un refus. ${JSON.stringify(visibles)}`,
        );
      }
      assert.deepEqual(session.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await session.fermer();
    }
  });

  test('LES BOUTONS D’ÉCRITURE sont neutralisés, sur un écran qu’il PEUT lire', async () => {
    const session = await ouvrirApplication(DIRECTION);
    try {
      // `/exigences` relève de la conformité : ce profil la LIT. C'est donc le
      // cas intéressant — un écran accessible où rien ne doit être modifiable.
      await naviguer(session.page, '/exigences', '#addExigenceBtn');

      const boutons = await session.page.evaluate(() =>
        Array.prototype.map.call(document.querySelectorAll('#app button'), (b) => ({
          id: b.id, texte: (b.textContent || '').trim().slice(0, 40), inactif: b.disabled,
        })));

      const ecriture = boutons.filter((b) => /^(addExigenceBtn|addBtn|saveBtn|save|bulkDeleteBtn|deleteBtn|delBtn)$/.test(b.id));
      assert.ok(ecriture.length > 0, `Aucun bouton d’écriture trouvé : ${JSON.stringify(boutons)}`);
      for (const b of ecriture) {
        assert.equal(
          b.inactif, true,
          `« ${b.id} » (« ${b.texte} ») reste proposé à un profil en lecture seule.`,
        );
      }
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('UN ÉCRAN QUI SE REDESSINE ne rend pas ses boutons d’écriture', async () => {
    /* Le trou que la passe « après navigation » laissait ouvert.
     *
     * Plusieurs modules se redessinent SANS naviguer — un filtre changé, une
     * liste rafraîchie après une suppression. Le balisage neuf sort intact, et
     * les boutons reviennent actifs sous les yeux d'un profil en lecture seule.
     * On provoque donc un redessin par le module lui-même, et on exige que la
     * neutralisation revienne avec lui.
     */
    const session = await ouvrirApplication(DIRECTION);
    try {
      await naviguer(session.page, '/exigences', '#addExigenceBtn');
      assert.equal(
        await session.page.evaluate(() => document.getElementById('addExigenceBtn').disabled), true,
        'Point de départ : le bouton est bien neutralisé après la navigation.',
      );

      // Le module se redessine, exactement comme quand un filtre change.
      await session.page.evaluate(() => { ExigencesModule.renderList(); });
      await session.page.waitForFunction(
        () => {
          const b = document.getElementById('addExigenceBtn');
          return b !== null && b.disabled === true;
        },
        null,
        { timeout: DELAI, polling: 50 },
      ).catch(() => {});

      assert.equal(
        await session.page.evaluate(() => document.getElementById('addExigenceBtn').disabled), true,
        'Après un redessin sans navigation, le bouton d’écriture est redevenu actif : ' +
          'l’observateur de vue ne fait pas son travail.',
      );
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE : un bouton de CONSULTATION reste utilisable, casse chameau comprise', async () => {
    /* La moitié sans laquelle « rien n'est proposé » serait satisfait par une
     * interface entièrement grisée (§20.2 : un garde-fou se vérifie dans les
     * deux sens).
     *
     * Le cas qui a réellement fauté : la règle ancrait ses motifs sur `^`, `-`
     * ou `_`, et le produit écrit ses identifiants en **casse chameau**.
     * `doPrintBtn` et `closePrintBtn` étaient donc neutralisés, et un profil en
     * lecture seule perdait l'impression — qui n'est pas une écriture.
     *
     * On éprouve la RÈGLE, pas un écran : les boutons concernés vivent sur des
     * domaines que ce profil ne lit pas, et un essai qui attendrait le bon
     * écran éprouverait surtout sa propre mise en scène.
     */
    const session = await ouvrirApplication(DIRECTION);
    try {
      await naviguer(session.page, '/exigences', '#addExigenceBtn');
      const verdicts = await session.page.evaluate(() => {
        const app = document.getElementById('app');
        const poser = (id) => {
          const b = document.createElement('button');
          b.id = id;
          b.textContent = id;
          app.appendChild(b);
          return b;
        };
        const consultation = ['doPrintBtn', 'closePrintBtn', 'showRaciBtn', 'voirExigencesBtn',
          'backBtn', 'cancelBtn'].map(poser);
        const ecriture = ['saveBtn', 'addMesureBtn', 'bulkDeleteBtn'].map(poser);
        window.appliquerDroits('/exigences');
        return {
          consultation: consultation.map((b) => ({ id: b.id, inactif: b.disabled })),
          ecriture: ecriture.map((b) => ({ id: b.id, inactif: b.disabled })),
        };
      });

      for (const b of verdicts.consultation) {
        assert.equal(
          b.inactif, false,
          `« ${b.id} » est un bouton de consultation : le neutraliser prive un lecteur d’un ` +
            'geste qui ne modifie rien.',
        );
      }
      for (const b of verdicts.ecriture) {
        assert.equal(b.inactif, true, `« ${b.id} » est une écriture et doit être neutralisé.`);
      }
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('LA FAÇADE REFUSE, même si un bouton avait été oublié', async () => {
    // Le filet, et non la barrière : il existe parce qu'une liste de boutons
    // vieillit en silence, alors que la façade `DataStore` voit passer
    // **toutes** les mutations — c'est l'invariant du projet.
    const nom = 'Risque qu’un profil en lecture ne doit pas créer';
    const session = await ouvrirApplication(DIRECTION);
    try {
      const avant = await session.page.evaluate(() => window.DataStore.getRisques().length);
      await session.page.evaluate((n) => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: n });
      }, nom);
      const apres = await session.page.evaluate(() => window.DataStore.getRisques().length);

      assert.equal(apres, avant, 'La façade doit refuser la mutation, sans exception.');
      await attendreQuiescence(session.page, { delai: DELAI });
      assert.equal(
        (await enBase('select count(*)::int as n from risques where nom = $1', [nom]))[0].n, 0,
        'Et rien ne doit être parti au serveur.',
      );
      assert.deepEqual(session.erreursScript, [], 'Refuser ne veut pas dire lever : un ' +
        'gestionnaire de clic cassé rendrait l’interface inerte (constat M-6).');
    } finally {
      await session.fermer();
    }
  });

  test('L’EXPORT est refusé, et c’est une permission à part de la lecture', async () => {
    const session = await ouvrirApplication(DIRECTION);
    try {
      // On mesure ce que l'utilisateur obtiendrait : un fichier. `createObjectURL`
      // est le seul chemin par lequel ce produit fabrique un téléchargement.
      await session.page.evaluate(() => {
        window.__fichiers = 0;
        const vrai = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b) => { window.__fichiers++; return vrai(b); };
      });

      const refus = await session.page.evaluate(() => {
        BackupService.exportPlain();
        return { fichiers: window.__fichiers, peut: Droits.peutExporter() };
      });

      assert.equal(refus.peut, false, 'Le droit d’export n’est pas accordé à ce profil.');
      assert.equal(
        refus.fichiers, 0,
        'Aucun fichier ne doit être fabriqué : un accès Groupe en lecture permettrait sinon ' +
          'd’extraire en un clic la cartographie complète des faiblesses (PLAN_SERVEUR §3.3).',
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('L’INTERFACE N’EST PAS LA BARRIÈRE : la requête part quand même', async () => {
    /* ── Ce que cet essai fige, et ce qu'il ne peut PAS figer ───────────────
     *
     * Il fige que le navigateur **ne se prend pas pour une barrière** : appelée
     * directement, la couche réseau part. C'est important dans les deux sens —
     * si elle bloquait, on croirait tenir un contrôle d'accès là où il n'y en a
     * pas, et la vraie barrière pourrait manquer sans que rien ne le dise.
     *
     * ⚠️ **Ce qu'il ne peut pas figer, faute d'existence au moment où il est
     * écrit** : que le serveur REFUSE cette requête. `backend/src/api/droits.ts`
     * porte la décision (`deciderAcces`), mais elle n'est pas encore appliquée
     * aux routes. C'est le contrôle S6, et c'est le livrable de l'agent A2 —
     * dit ici, pas supposé.
     */
    const session = await ouvrirApplication(DIRECTION);
    try {
      const envois = [];
      session.page.on('request', (r) => {
        if (r.url().includes('/api/entites/')) envois.push(`${r.method()} ${new URL(r.url()).pathname}`);
      });

      const issue = await session.page.evaluate(async () => {
        try {
          await window.Api.creer('risques', null, { nom: 'Appel direct, sans passer par l’écran' });
          return 'accepte';
        } catch (e) {
          return 'refuse:' + (e.statut ?? 0);
        }
      });

      assert.ok(
        envois.some((e) => e.startsWith('POST /api/entites/risques')),
        `La couche réseau doit laisser partir la requête : c’est au serveur de refuser. ` +
          `Envois observés : ${JSON.stringify(envois)}`,
      );
      // Aujourd'hui le serveur accepte (les droits ne sont pas encore appliqués
      // aux routes). L'essai le CONSTATE au lieu de le taire : le jour où A2
      // livre, cette valeur devient « refuse:403 », et c'est ce qu'il faudra
      // exiger ici.
      assert.ok(
        issue === 'accepte' || issue.startsWith('refuse:'),
        `Issue inattendue : ${issue}`,
      );
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — Les contrôles symétriques (§20.2 : dans les deux sens)
 * ===================================================================== */

describe('Un garde-fou se vérifie dans les deux sens', () => {
  test('CONTRÔLE : un profil contributeur retrouve son menu, ses boutons et son export', async () => {
    const nom = 'Risque qu’un contributeur a le droit de créer';
    const session = await ouvrirApplication(RSSI);
    try {
      const visibles = await menuVisible(session.page);
      for (const attendu of ['/risques', '/actifs', '/incidents', '/documents', '/audits']) {
        assert.ok(visibles.includes(attendu), `« ${attendu} » doit être visible. ${JSON.stringify(visibles)}`);
      }
      // `/settings` relève de l'administration : un contributeur ne l'a pas.
      assert.equal(
        visibles.includes('/settings'), false,
        'Le niveau « contribution » n’ouvre pas l’administration.',
      );

      await naviguer(session.page, '/risques', '#addRisqueBtn');
      assert.equal(
        await session.page.evaluate(() => document.getElementById('addRisqueBtn').disabled),
        false,
        'Un contributeur doit pouvoir déclarer un risque : sans ce contrôle, « rien n’est ' +
          'proposé » serait satisfait par une interface entièrement grisée.',
      );

      await session.page.evaluate((n) => {
        window.DataStore.addRisque({ id: window.UI.genId('RISK'), nom: n });
      }, nom);
      await attendreQuiescence(session.page, { delai: DELAI });
      assert.equal(
        (await enBase('select count(*)::int as n from risques where nom = $1', [nom]))[0].n, 1,
        'Et sa saisie doit arriver en base.',
      );

      const fichiers = await session.page.evaluate(() => {
        window.__fichiers = 0;
        const vrai = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b) => { window.__fichiers++; return vrai(b); };
        BackupService.exportPlain();
        return window.__fichiers;
      });
      assert.equal(fichiers, 1, 'Et son droit d’export doit fonctionner.');
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE : sans bloc « droits », l’interface ne masque RIEN', async () => {
    /* La ligne la plus importante du fichier.
     *
     * Tant que le lot L3 n'est pas branché, le serveur ne rend aucun bloc
     * `droits` — et l'application doit alors se comporter **exactement comme
     * avant**. « Aucun droit annoncé » n'est pas « aucun droit » : c'est « le
     * navigateur n'en sait rien », et inventer une restriction serait mentir
     * dans l'autre sens, en rendant le produit inutilisable sans qu'aucune
     * donnée soit mieux gardée.
     */
    const session = await ouvrirApplication(null);
    try {
      assert.equal(
        await session.page.evaluate(() => Droits.connus()), false,
        'La condition éprouvée ici est « le serveur n’annonce rien » : elle est PRODUITE par ' +
          'l’essai, pas espérée du serveur du jour.',
      );
      const visibles = await menuVisible(session.page);
      for (const attendu of ['/risques', '/settings', '/rgpd', '/personnel']) {
        assert.ok(visibles.includes(attendu), `« ${attendu} » doit rester visible. ${JSON.stringify(visibles)}`);
      }

      await naviguer(session.page, '/risques', '#addRisqueBtn');
      assert.equal(
        await session.page.evaluate(() => document.getElementById('addRisqueBtn').disabled),
        false,
        'Aucun bouton ne doit être neutralisé quand le serveur n’a rien annoncé.',
      );
      assert.equal(
        await session.page.evaluate(() => document.getElementById('bloc-utilisateur') !== null),
        false,
        'Et aucune déconnexion n’est proposée : elle serait sans effet sur une session ' +
          'provisoire, et afficherait une identité qui n’existe pas.',
      );
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE : les droits que le VRAI serveur rend ne masquent rien non plus', async () => {
    /* Le contrôle de non-régression qui compte pour les autres agents.
     *
     * Le serveur de développement résout un profil d'administration sur tous
     * les domaines (`DROITS_PROVISOIRES_DEVELOPPEMENT`). L'application doit donc
     * se comporter exactement comme avant l'arrivée des droits — sans quoi ce
     * lot casserait les 44 essais du §1 au §22 de `bascule.test.mjs` sans que
     * personne ne voie pourquoi.
     *
     * `undefined` : on ne touche PAS à la charge, on prend celle du serveur.
     */
    const session = await ouvrirApplication(undefined);
    try {
      const vu = await session.page.evaluate(() => ({
        connus: Droits.connus(),
        niveau: Droits.niveau(),
        exporte: Droits.peutExporter(),
        lectureSeule: Droits.lectureSeule(),
      }));
      assert.equal(vu.connus, true, 'Le serveur rend désormais un bloc « droits ».');
      assert.equal(vu.lectureSeule, false, `Et il n’est pas en lecture seule (${vu.niveau}).`);
      assert.equal(vu.exporte, true, 'Le droit d’export est accordé en développement.');

      const visibles = await menuVisible(session.page);
      for (const attendu of ['/risques', '/settings', '/rgpd', '/personnel', '/audits']) {
        assert.ok(visibles.includes(attendu), `« ${attendu} » doit rester visible. ${JSON.stringify(visibles)}`);
      }
      await naviguer(session.page, '/risques', '#addRisqueBtn');
      assert.equal(
        await session.page.evaluate(() => document.getElementById('addRisqueBtn').disabled),
        false,
        'Aucun bouton ne doit être neutralisé pour un profil qui a tous les droits.',
      );
      assert.deepEqual(session.erreursInattendues(), []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — La liste écrite à la main doit ÉCHOUER BRUYAMMENT
 * ===================================================================== */

describe('Un écran non rattaché à un domaine est SIGNALÉ, jamais masqué', () => {
  test('le contrôle de couverture nomme la route inconnue, et n’en cache aucune', async () => {
    /* `DOMAINE_PAR_ROUTE` est une liste écrite à la main. Le `CLAUDE.md` §3 le
     * tolère à une condition : que son incomplétude **échoue bruyamment**. On
     * fait donc échouer le contrôle exprès, et on exige qu'il parle. Sans cet
     * essai, la règle serait une intention.
     */
    const session = await ouvrirApplication(DIRECTION);
    try {
      const manques = await session.page.evaluate(() =>
        window.verifierCouvertureDesRoutes(['/ecran-que-personne-na-rattache']));
      assert.ok(
        manques.some((m) => m.includes('/ecran-que-personne-na-rattache')),
        `Le contrôle doit nommer la route non rattachée. Rendu : ${JSON.stringify(manques)}`,
      );

      const bandeau = await session.page.evaluate(() =>
        (document.getElementById('droits-banner-host') ?? { textContent: '' }).textContent);
      assert.match(
        bandeau, /ecran-que-personne-na-rattache/,
        `Et il doit l’AFFICHER : un garde-fou que personne ne lit est un commentaire ` +
          `(CONVENTIONS.md §18.4).\n${bandeau}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE SYMÉTRIQUE : la table réelle des routes ne laisse AUCUN écran de côté', async () => {
    const session = await ouvrirApplication(DIRECTION);
    try {
      // Aucun argument : le contrôle confronte alors la table au menu réellement
      // rendu, et aux domaines que le serveur déclare.
      const manques = await session.page.evaluate(() => window.verifierCouvertureDesRoutes([]));
      assert.deepEqual(
        manques, [],
        `Un écran du produit n’est rattaché à aucun domaine de droits : ${JSON.stringify(manques)}`,
      );
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — LA COMBINAISON QUI A LAISSÉ PASSER Q-89 (constat Q-92)
 * ---------------------------------------------------------------------
 *  Un profil qui **peut écrire** et **ne peut pas exporter**.
 * ===================================================================== */

/**
 * ── Pourquoi cette section existe, et pourquoi elle manquait ────────────────
 *
 * Le constat **Q-92**, mot pour mot : *« le filet navigateur des droits n'exerce
 * jamais la combinaison qui a laissé passer Q-89 : un profil qui **peut écrire**
 * mais **ne peut pas exporter**. Il éprouve la lecture seule, qui bloque pour une
 * autre raison — d'où un vert sur douze sites dont l'un ne tenait pas. »*
 *
 * Ce fichier éprouvait `DIRECTION` (`lecture`, `export: false`). Ce profil est
 * bien bloqué — mais par sa **lecture seule**, qui grise tous les boutons
 * d'écriture, et non par l'absence du droit d'export. *Une barrière qui n'arrête
 * que ceux qu'une autre arrêtait déjà n'est pas une barrière.* Résultat mesuré à
 * la porte S3 : **38 213 octets** de « Synthèse Direction — Posture Cyber »,
 * marquée *Document confidentiel*, téléchargés dans un Chromium réel par le
 * compte AD `rssi.tls`. **RSSI et ADMIN, deux des huit profils du socle, sont
 * dans cette configuration.**
 *
 * ── Comment cette section refuse de rendre vert en n'éprouvant rien ────────
 *
 * Trois verrous, et chacun ferme une façon différente de mentir :
 *
 *  1. **La liste des fichiers qui exportent est DÉCOUVERTE**, avec les mêmes
 *     motifs que `test/depot/entonnoir-export.test.mjs` — jamais recopiée. Un
 *     fichier neuf qui fabrique un téléchargement et que le tableau ci-dessous
 *     n'exerce pas fait **rougir** cet essai, en le nommant.
 *  2. **Chaque site doit avoir ATTEINT l'entonnoir** (`Droits.exigerExport` est
 *     compté). Sans ce verrou, un site qui échouerait avant — module absent,
 *     écran non rendu — rendrait « aucun fichier » sans rien avoir éprouvé.
 *  3. **Le même parcours, avec le droit accordé, doit PRODUIRE quelque chose.**
 *     Sans lui, « zéro fichier » serait aussi ce que rend un bouton cassé.
 *
 * ⚠️ La découverte mécanique **ne voit pas tout**, et c'est écrit ici plutôt que
 * sous-entendu : `js/services/exportExcel.js` et `js/services/exportPDF.js`
 * n'écrivent pas eux-mêmes le fichier — SheetJS le fait pour l'un, le moteur
 * d'impression pour l'autre. Ils sont donc **ajoutés à la main** au tableau, et
 * ce sont précisément les deux sites que le filet mécanique du dépôt ne peut pas
 * attraper. C'est la moitié comportementale qui les couvre, ou personne.
 */

/** Les quatorze domaines de `backend/src/api/droits.ts` (`journal` compris). */
const TOUS_LES_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel',
  'administration', 'journal',
]);

/** Il contribue partout. Il n'extrait rien. C'est le profil de Q-89. */
const CONTRIBUE_SANS_EXPORTER = Object.freeze({
  niveau: 'contribution',
  domaines: TOUS_LES_DOMAINES,
  export: false,
});

/** Le même, droit d'export accordé : le contrôle dans l'autre sens. */
const CONTRIBUE_ET_EXPORTE = Object.freeze({
  niveau: 'contribution',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/* ── La découverte, alignée sur `test/depot/entonnoir-export.test.mjs` ────── */

const SORTIES = [
  /URL\s*\.\s*createObjectURL\s*\(/,
  /\.\s*download\s*=/,
  /msSaveBlob\s*\(/,
];

function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Tout `.js` du produit, bibliothèques embarquées exclues. */
function fichiersDuProduit(repertoire = join(RACINE_FRONTEND, 'js')) {
  const trouves = [];
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === 'lib') continue;
      trouves.push(...fichiersDuProduit(chemin));
    } else if (entree.name.endsWith('.js')) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Fichiers du produit qui fabriquent eux-mêmes un téléchargement. */
function fichiersQuiExportent() {
  return fichiersDuProduit()
    .filter((c) => {
      const code = sansCommentaires(readFileSync(c, 'utf8'));
      return SORTIES.some((motif) => motif.test(code));
    })
    .map((c) => relative(RACINE_FRONTEND, c).split('\\').join('/'));
}

/* ── Les sites, tels qu'un utilisateur les déclenche ──────────────────────── */

/**
 * ⚠️ **Une liste écrite à la main, et c'est ici le bon outil** (`CLAUDE.md` §3) :
 * aucun catalogue ne peut deviner qu'on déclenche l'export de la Synthèse en
 * cliquant `#sdDownloadBtn` après avoir affiché `/synthese`. Et son omission
 * **échoue bruyamment** — le contrôle de couverture ci-dessous compare cette
 * liste à la découverte et nomme le fichier manquant.
 */
/**
 * Les fichiers qui fabriquent un téléchargement **sans que ce soit un export**
 * — arbitrage du 04/09/2026, `CONVENTIONS.md` §31.5.
 *
 * ⚠️ **Ils ne sont pas dispensés de contrôle, ils changent de contrôle.** Le
 * parcours ci-dessous exige qu'un profil sans droit d'export ne fasse sortir
 * AUCUN octet ; pour ceux-ci, l'attente est l'**inverse** — il doit obtenir son
 * fichier, parce qu'ouvrir une pièce attachée à une fiche qu'on a le droit de
 * lire *est* une lecture. Exiger l'export empêcherait un auditeur d'ouvrir le
 * rapport qu'il est chargé de lire : `GRC-EXPORT` n'est porté que par une
 * minorité de comptes.
 *
 * Ce qui les garde à la place : le **serveur** — route en `action: 'lire'`,
 * périmètre, RLS, et chaque délivrance tracée en `consultation_sensible`. Le
 * parcours dédié vit dans `test/navigateur/pieces.test.mjs`, et le contrôle du
 * dépôt (`test/depot/entonnoir-export.test.mjs`) exige que chaque entrée dise
 * **pourquoi** elle n'est pas un export et **ce qui la garde**.
 */
const SORTIES_QUI_NE_SONT_PAS_DES_EXPORTS = [
  { fichier: 'js/modules/pieces.js', eprouvePar: 'test/navigateur/pieces.test.mjs' },
  // Le logo de SA PROPRE filiale : une lecture, pas un export. Même arbitrage
  // que `pieces.js` ci-dessus (`CONVENTIONS.md` §31.5), et la barrière est la
  // même — le serveur ne sert jamais que la filiale de la session.
  { fichier: 'js/core/identite.js', eprouvePar: 'test/navigateur/identite.test.mjs' },
];

const SITES_DE_SORTIE = [
  {
    nom: 'BackupService.exportPlain — fichier d’échange grc-backup',
    fichier: 'js/services/backup.js',
    invoquer: () => { BackupService.exportPlain(); },
  },
  {
    nom: 'BackupService.exportEncrypted — export chiffré',
    fichier: 'js/services/backup.js',
    invoquer: () => BackupService.exportEncrypted('MotDePasseDEssai!1'),
    attendreMs: 600,
  },
  {
    nom: 'ExportExcelService.exportAudit — classeur de conformité (SheetJS)',
    fichier: 'js/services/exportExcel.js',
    invoquer: () => { ExportExcelService.exportAudit(); },
  },
  {
    nom: 'ExportPdfService.exportAuditPdf — impression du rapport d’audit',
    fichier: 'js/services/exportPDF.js',
    invoquer: () => { ExportPdfService.exportAuditPdf(); },
    attendreMs: 1400, // `setTimeout(…, 800)` avant `window.print()`
  },
  {
    nom: 'MatriceModule.exportSVG — matrice des risques',
    fichier: 'js/modules/matrice.js',
    route: '/matrice',
    selecteur: '#matrixExportSvgBtn',
    invoquer: () => { MatriceModule.exportSVG(); },
  },
  {
    nom: 'MatriceModule.exportPNG — matrice des risques',
    fichier: 'js/modules/matrice.js',
    route: '/matrice',
    selecteur: '#matrixExportPngBtn',
    invoquer: () => { MatriceModule.exportPNG(); },
  },
  {
    nom: 'CartographieModule.exportSVG — cartographie du SI',
    fichier: 'js/modules/cartographie.js',
    route: '/cartographie',
    selecteur: '#carto-export-svg',
    invoquer: () => { CartographieModule.exportSVG(); },
  },
  {
    nom: 'CartographieModule.exportPNG — cartographie du SI',
    fichier: 'js/modules/cartographie.js',
    route: '/cartographie',
    selecteur: '#carto-export-png',
    invoquer: () => { CartographieModule.exportPNG(); },
  },
  {
    nom: 'SyntheseModule — rapport « Synthèse Direction » (LE site du constat Q-89)',
    fichier: 'js/modules/synthese.js',
    route: '/synthese',
    selecteur: '#sdDownloadBtn',
    // Par le BOUTON, et non par une fonction : `downloadReport` n'est pas
    // exposée, et c'est bien un clic qui a produit les 38 213 octets.
    invoquer: () => { document.getElementById('sdDownloadBtn').click(); },
  },
  {
    nom: 'EcheancesModule.exportExcel — échéancier (SheetJS)',
    fichier: 'js/modules/echeances.js',
    route: '/echeances',
    selecteur: '#ech-export-xlsx',
    invoquer: () => { EcheancesModule.exportExcel(); },
  },
  {
    nom: 'EcheancesModule.exportICS — échéancier au format agenda',
    fichier: 'js/modules/echeances.js',
    route: '/echeances',
    selecteur: '#ech-export-ics',
    invoquer: () => { EcheancesModule.exportICS(); },
  },
  {
    nom: 'JournalModule.exporter — trois ans d’identités et d’adresses IP',
    fichier: 'js/modules/journal.js',
    route: '/journal',
    selecteur: '#journalExportBtn',
    invoquer: () => JournalModule.exporter(),
    attendreMs: 500,
  },
];

/**
 * Instrumente la page : tout ce qui fait sortir un octet, plus l'entonnoir.
 *
 * Trois mécanismes comptés, parce qu'aucun ne les couvre tous : `createObjectURL`
 * (le geste du produit), le clic d'une ancre portant `download` (celui de
 * SheetJS), et `window.print` (l'export PDF, qui ne fabrique pas de fichier mais
 * fait bel et bien sortir le rapport).
 */
async function armerMesures(page) {
  await page.evaluate(() => {
    window.__sorties = { blobs: 0, telechargements: 0, impressions: 0 };
    window.__entonnoir = 0;
    const vraiUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__sorties.blobs += 1; return vraiUrl(b); };
    const vraiClic = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function clic(...args) {
      if (this.hasAttribute('download')) window.__sorties.telechargements += 1;
      return vraiClic.apply(this, args);
    };
    window.print = () => { window.__sorties.impressions += 1; };
    // L'entonnoir est COMPTÉ, jamais remplacé : sa vraie décision s'applique.
    const vraiEntonnoir = Droits.exigerExport;
    Droits.exigerExport = function exigerExport(...args) {
      window.__entonnoir += 1;
      return vraiEntonnoir.apply(Droits, args);
    };
  });
}

/**
 * Donne de la MATIÈRE aux sites qui n'en ont pas dans le jeu d'essai.
 *
 * `EcheancesModule.exportICS` s'arrête sur « aucune échéance datée » — après la
 * garde, donc l'entonnoir est bien atteint, mais rien ne sortirait de toute
 * façon. Sans cette échéance, le contrôle « avec le droit, ça produit » serait
 * rouge à juste titre : l'essai mesurerait le vide.
 *
 * L'échéance est créée **par la façade**, comme un utilisateur la créerait —
 * c'est-à-dire par le chemin que le profil contributeur a le droit d'emprunter.
 */
async function donnerDeLaMatiere(page) {
  await page.evaluate(() => {
    const dejaLa = (DataStore.getActions() || []).some((a) => a && a.echeance);
    if (dejaLa) return;
    const dans30j = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    DataStore.addAction({
      id: UI.genId('ACT'),
      titre: 'Action datée, pour que l’échéancier ait quelque chose à exporter',
      echeance: dans30j,
      statut: 'à faire',
    });
  });
}

/**
 * Substitue `GET api/journal/export`, et **seulement lui**.
 *
 * ⚠️ **Pourquoi une substitution ici, et ce qu'elle ne cache pas.** Les trois
 * routes du `CONVENTIONS.md` §29.8 sont le livrable de l'agent J2, écrit en
 * parallèle : `src/api/journal.ts` est aujourd'hui une couture qui n'enregistre
 * aucune route. Sans cette substitution, le site « journal » ne produirait
 * jamais de fichier — et le contrôle « avec le droit, ça produit » serait rouge
 * pour une raison qui n'a rien à voir avec les droits.
 *
 * Ce qui est mesuré reste entier : le sens NÉGATIF — le seul qui porte le
 * constat Q-92 — ne dépend pas d'elle. L'entonnoir s'arrête **avant** le
 * réseau, et `test/navigateur/journal.test.mjs` le mesure explicitement.
 * Le jour où J2 livre, ces lignes tombent sans qu'aucune assertion ne bouge.
 */
async function substituerExportDuJournal(page) {
  await page.route('**/api/journal/export**', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv; charset=utf-8',
      body: 'numero;horodatage;action\n1;2026-09-04T08:00:00Z;demarrage\n',
    }));
}

/** Déclenche un site et rend ce qui en est sorti. */
async function exercer(page, site) {
  if (site.route !== undefined) {
    await page.evaluate((r) => { window.location.hash = '#' + r; }, site.route);
    await page.waitForSelector(site.selecteur, { timeout: DELAI });
  }
  await page.evaluate(() => { window.__sorties = { blobs: 0, telechargements: 0, impressions: 0 }; window.__entonnoir = 0; });
  await page.evaluate(site.invoquer);
  await page.waitForTimeout(site.attendreMs ?? 250);
  const vu = await page.evaluate(() => ({ ...window.__sorties, entonnoir: window.__entonnoir }));
  return { ...vu, total: vu.blobs + vu.telechargements + vu.impressions };
}

describe('Un profil qui ÉCRIT et n’EXPORTE PAS : la combinaison de Q-89 (constat Q-92)', () => {
  test('LE FILET COUVRE tous les fichiers qui fabriquent un téléchargement', () => {
    /* Le verrou n°1. Sans lui, cet essai vieillirait en silence : un module neuf
     * qui exporte resterait hors du parcours ci-dessous, et le vert ne dirait
     * plus rien de lui. La liste des fichiers est donc DÉCOUVERTE, jamais
     * recopiée — même parade que `test/depot/entonnoir-export.test.mjs`, dont
     * ceci est la moitié comportementale.
     */
    const decouverts = fichiersQuiExportent();
    const exerces = new Set([
      ...SITES_DE_SORTIE.map((s) => s.fichier),
      ...SORTIES_QUI_NE_SONT_PAS_DES_EXPORTS.map((s) => s.fichier),
    ]);

    assert.ok(
      decouverts.length >= 5,
      `Seuls ${String(decouverts.length)} fichier(s) exportent encore : la découverte ne mord ` +
        'plus, et « tous couverts » ne voudrait rien dire.',
    );
    const oublies = decouverts.filter((f) => !exerces.has(f));
    assert.deepEqual(
      oublies,
      [],
      'Ces fichiers font SORTIR des octets du produit et ne sont exercés par aucun site de ce ' +
        'filet :\n' + oublies.map((f) => `  · ${f}`).join('\n') +
        '\nLe contrôle du dépôt vérifie qu’ils APPELLENT l’entonnoir ; celui-ci vérifie que ' +
        'l’entonnoir REFUSE. Q-89 est passé parce que seule la première moitié existait. ' +
        'Ajoutez une entrée à `SITES_DE_SORTIE`.',
    );

    // Et l'inverse : un site qui viserait un fichier disparu ne prouverait rien.
    for (const site of SITES_DE_SORTIE) {
      assert.ok(
        readFileSync(join(RACINE_FRONTEND, site.fichier), 'utf8').length > 0,
        `« ${site.nom} » vise ${site.fichier}, qui n’existe plus.`,
      );
    }
  });

  test('AUCUN OCTET NE SORT, sur TOUS les sites — et l’entonnoir a bien été atteint', async () => {
    const session = await ouvrirApplication(CONTRIBUE_SANS_EXPORTER);
    session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    try {
      // Le discriminant de Q-92, posé en toutes lettres : ce profil N'EST PAS en
      // lecture seule. S'il l'était, tout serait grisé et l'on mesurerait, une
      // fois de plus, la mauvaise barrière.
      const profil = await session.page.evaluate(() => ({
        lectureSeule: Droits.lectureSeule(),
        ecritRisques: Droits.peutEcrire('risques'),
        exporte: Droits.peutExporter(),
      }));
      assert.equal(profil.lectureSeule, false, 'Ce profil doit pouvoir écrire : c’est TOUT le constat Q-92.');
      assert.equal(profil.ecritRisques, true);
      assert.equal(profil.exporte, false);

      // Les deux sites que le jeu d'essai laisserait sans matière — voir chaque
      // fonction : sans elles, « rien n'est sorti » serait vrai pour une raison
      // qui n'a rien à voir avec le droit d'export.
      await donnerDeLaMatiere(session.page);
      await substituerExportDuJournal(session.page);
      await armerMesures(session.page);

      /* ── UN SEUL VERDICT, pour que rien n'en masque un autre ──────────────
       *
       * Deux assertions successives auraient caché la pire des deux : une garde
       * retirée rend le site MUET *et* le fait FUIR, et la première assertion
       * qui tombe emporte la seconde. On rassemble donc, et le message dit les
       * deux faits — celui qui accuse et celui qui explique.
       */
      const problemes = [];
      for (const site of SITES_DE_SORTIE) {
        const vu = await exercer(session.page, site);
        if (vu.total > 0) {
          problemes.push(`FUITE — ${site.nom} (${site.fichier}) → ${JSON.stringify(vu)}`);
        }
        if (vu.entonnoir === 0) {
          problemes.push(`MUET  — ${site.nom} (${site.fichier}) : l’entonnoir n’a pas été consulté`);
        }
      }

      assert.deepEqual(
        problemes,
        [],
        'Le filet d’export a trouvé ceci, pour un profil qui ÉCRIT et n’EXPORTE PAS :\n' +
          problemes.map((p) => `  · ${p}`).join('\n') +
          '\n\n« FUITE » est le constat Q-89 reproduit : le profil écrit, donc rien ne le ' +
          'grise, et `Droits.exigerExport()` est la seule barrière. RSSI et ADMIN — deux des ' +
          'huit profils du socle — sont dans cette configuration (PLAN_SERVEUR §3.3).\n' +
          '« MUET » veut dire que le site n’a même pas consulté l’entonnoir : ou bien la ' +
          'garde manque, ou bien le site n’a pas été atteint et « aucun octet n’est sorti » ' +
          'ne prouve rien. Les deux se corrigent, aucun ne s’ignore.\n' +
          'Le remède, en tête de la fonction qui exporte :\n' +
          '  if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;',
      );
      assert.deepEqual(session.erreursScript, [], 'Refuser ne veut pas dire lever (constat M-6).');
    } finally {
      await session.fermer();
    }
  });

  test('CONTRÔLE DANS L’AUTRE SENS : le même parcours, droit accordé, PRODUIT bien', async () => {
    /* Le verrou n°3. « Zéro fichier » est aussi ce que rend un bouton cassé, un
     * module absent ou un écran vide. On rejoue donc exactement le même parcours
     * avec `export: true`, et l'on exige que chaque site produise.
     */
    const session = await ouvrirApplication(CONTRIBUE_ET_EXPORTE);
    session.page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    try {
      await donnerDeLaMatiere(session.page);
      await substituerExportDuJournal(session.page);
      await armerMesures(session.page);
      const steriles = [];
      let produits = 0;
      for (const site of SITES_DE_SORTIE) {
        const vu = await exercer(session.page, site);
        produits += vu.total;
        if (vu.total === 0) steriles.push(`${site.nom} (${site.fichier}) → ${JSON.stringify(vu)}`);
      }

      assert.deepEqual(
        steriles,
        [],
        'Ces sites ne produisent RIEN même avec le droit d’export :\n' +
          steriles.map((s) => `  · ${s}`).join('\n') +
          '\nL’essai précédent y mesure donc le vide, et son vert ne prouve rien de ces ' +
          'sites-là. Soit le site est cassé, soit le jeu d’essai ne lui donne pas de ' +
          'matière — les deux se règlent, aucun ne se tait.',
      );
      assert.ok(produits >= SITES_DE_SORTIE.length, `Seulement ${String(produits)} sortie(s).`);
      assert.deepEqual(session.erreursScript, []);
    } finally {
      await session.fermer();
    }
  });
});
