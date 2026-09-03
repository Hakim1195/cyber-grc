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

let base;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
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

async function ouvrirApplication(droits) {
  const session = await ouvrirPage(navigateur);
  if (droits !== null) await injecterDroits(session.page, droits);
  await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(session.page), 'chargee', 'L’application doit démarrer.');
  await attendreQuiescence(session.page);
  return session;
}

/** Entrées de menu visibles, par route. Lues dans le DOM, jamais recopiées. */
function menuVisible(page) {
  return page.evaluate(() =>
    Array.prototype.filter
      .call(document.querySelectorAll('.main-nav a[data-route]'), (a) => {
        const li = a.closest('li') || a;
        return !li.hidden;
      })
      .map((a) => a.getAttribute('data-route')));
}

/** Va sur une route et attend que la vue soit rendue. */
async function naviguer(page, route, selecteurAttendu) {
  await page.evaluate((r) => { window.location.hash = '#' + r; }, route);
  await page.waitForSelector(selecteurAttendu, { timeout: 15000 });
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
      await naviguer(session.page, '/exigences', '#addBtn, table');

      const boutons = await session.page.evaluate(() =>
        Array.prototype.map.call(document.querySelectorAll('#app button'), (b) => ({
          id: b.id, texte: (b.textContent || '').trim().slice(0, 40), inactif: b.disabled,
        })));

      const ecriture = boutons.filter((b) => /^(addBtn|saveBtn|save|bulkDeleteBtn|deleteBtn|delBtn)$/.test(b.id));
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
      await attendreQuiescence(session.page);
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
        window.BackupService.exportPlain();
        return { fichiers: window.__fichiers, peut: window.Droits.peutExporter() };
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
      await attendreQuiescence(session.page);
      assert.equal(
        (await enBase('select count(*)::int as n from risques where nom = $1', [nom]))[0].n, 1,
        'Et sa saisie doit arriver en base.',
      );

      const fichiers = await session.page.evaluate(() => {
        window.__fichiers = 0;
        const vrai = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (b) => { window.__fichiers++; return vrai(b); };
        window.BackupService.exportPlain();
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
        await session.page.evaluate(() => window.Droits.connus()), false,
        'Le serveur de développement ne rend pas encore de droits : c’est le cas nominal ici.',
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
