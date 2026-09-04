/**
 * routes.test.mjs — **les trois routes du `CONVENTIONS.md` §29.8**, interrogées
 * par HTTP sur le vrai greffon d'API.
 *
 * Elles sont éprouvées là où l'utilisateur les emprunte : à travers le crochet
 * `onRequest` réel, donc à travers `deciderAcces`. *« Un contrôle doit interroger
 * le chemin que l'utilisateur emprunte, pas celui qui est commode à tester »* —
 * le 7ᵉ passage de la porte S2 a coûté un 403 sur `/` pour l'avoir oublié.
 *
 * Ce que le montage ne couvre pas est écrit dans `aide.mjs`, en toutes lettres.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { analyserCsv, monterJournal, objetsCsv, SessionDEssai } from './aide.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {Awaited<ReturnType<typeof monterJournal>>} */
let serveur;
/** @type {SessionDEssai} */
let session;
/** @type {import('pg').Client} */
let proprietaire;
/** @type {import('pg').Client} */
let applicatif;

/** Le profil qui a le droit de lire le journal, et rien d'autre. */
const AUDITEUR = Object.freeze({ niveau: 'lecture', domaines: ['journal'], export: false });
/** Le même, avec le droit d'export — la permission distincte du `PLAN_SERVEUR` §3.3. */
const AUDITEUR_EXPORTATEUR = Object.freeze({ niveau: 'lecture', domaines: ['journal'], export: true });
/** Un profil ordinaire : il lit son métier, pas trois ans d'identités. */
const RSSI_SANS_JOURNAL = Object.freeze({
  niveau: 'contribution',
  domaines: ['risques', 'actifs', 'pilotage'],
  export: true,
});

/**
 * Périmètre au format du BANC (`test/aide/base.mjs`), pour écrire en base.
 *
 * ⚠️ Ce n'est PAS la forme d'un `PerimetreSession` : le harnais nomme son
 * premier champ `utilisateur`, le produit le nomme `utilisateurId`. Les
 * confondre coûte un 500 dans `validerPerimetre`, et le message ne dit pas
 * lequel des deux manque — d'où deux fabriques distinctes plutôt qu'une.
 */
const site = (filiale) => perimetre('auditeur', filiale, [filiale]);

/** Périmètre au format du PRODUIT (`src/db/pool.ts`), pour la session HTTP. */
const sessionSite = (filiale) => ({
  utilisateurId: 'auditeur',
  filialeId: filiale,
  filiales: [filiale],
  perimetreGroupe: false,
  administrationGroupe: false,
});

const sessionGroupe = () => ({
  utilisateurId: 'rssi.groupe',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: false,
});

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // Une entrée transversale (échec de connexion) et une entrée HOSTILE, dont le
  // libellé porte tout ce qui scinde une ligne de texte.
  await base.avecPerimetre(
    applicatif,
    perimetre('anonyme', null, []),
    async (c) => {
      await c.query(
        `insert into journal_audit (action, utilisateur_libelle, resume)
              values ('connexion_echouee', 'inconnu.au.bataillon', 'échec de connexion : compte inconnu')`,
      );
    },
    { annuler: false },
  );

  session = new SessionDEssai(sessionSite(FILIALE_A), AUDITEUR);
  serveur = await monterJournal(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Les entrées du journal, vues du propriétaire (donc sans cloisonnement). */
async function toutLeJournal() {
  return await base.lignes(
    proprietaire,
    'select numero::int as numero, action, filiale_id, utilisateur_libelle, resume from journal_audit order by numero',
  );
}

/* =====================================================================
 *  §1 — Le contrat de déclaration, lu dans la table des routes
 * ===================================================================== */

describe('Les trois routes déclarent EXACTEMENT ce que le §29.8 exige', () => {
  test('les déclarations d’accès sont celles du contrat, lues chez Fastify', () => {
    const parUrl = Object.fromEntries(
      serveur.routes.filter((r) => r.methode === 'GET').map((r) => [r.url, r.acces]),
    );
    assert.deepEqual(parUrl, {
      '/api/journal': { action: 'lire', domaine: 'journal' },
      '/api/journal/export': { action: 'exporter', domaine: 'journal' },
      '/api/journal/verification': { action: 'lire', domaine: 'journal' },
    });
  });

  test('aucune ne déclare le domaine « administration » — c’est l’arbitrage du 04/09', () => {
    // `administration` s'ouvre à qui porte `parametres`, `filiales` OU `droits` :
    // un profil chargé de régler l'application aurait lu trois ans d'identités,
    // d'adresses IP et de valeurs avant/après (`src/api/droits.ts`).
    for (const route of serveur.routes) {
      assert.notEqual(route.acces?.domaine, 'administration', route.url);
    }
  });

  test('elles sont trois, et il n’en est monté aucune autre sous /api/journal', () => {
    // Fastify double chaque GET d'un HEAD : ce sont les mêmes routes, avec la
    // même déclaration d'accès — et le contrôle ci-dessus le vérifie pour les
    // deux méthodes, puisqu'il balaie toute la table.
    const get = serveur.routes.filter((r) => r.methode === 'GET');
    assert.equal(get.length, 3, JSON.stringify(serveur.routes));
    assert.ok(
      serveur.routes.every((r) => r.acces !== undefined),
      'Une route sans classe d’accès déclarée est refusée par le crochet : aucune ne doit en manquer.',
    );
  });
});

/* =====================================================================
 *  §2 — Le contrôle d'accès, par le chemin réel
 * ===================================================================== */

describe('Le domaine « journal » est exigé, et le droit d’export EN PLUS', () => {
  test('un profil sans le domaine « journal » est refusé sur les trois routes', async () => {
    session.poser(sessionSite(FILIALE_A), RSSI_SANS_JOURNAL);
    for (const url of ['/api/journal', '/api/journal/export', '/api/journal/verification']) {
      const r = await serveur.appeler('GET', url);
      assert.equal(r.statut, 403, url);
      assert.equal(r.corps.erreur, 'droit_insuffisant', url);
      // Le message ne nomme ni le domaine attendu ni le niveau requis : les
      // énumérer dirait à qui n'y a pas droit ce qu'il faudrait obtenir.
      assert.doesNotMatch(JSON.stringify(r.corps), /journal_audit|domaine/i, url);
    }
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('le domaine « journal » SEUL ne suffit pas à exporter', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal/export');
    assert.equal(r.statut, 403);
    assert.equal(r.corps.erreur, 'droit_insuffisant');

    // ... alors que la lecture, elle, passe. C'est bien le DROIT D'EXPORT qui a
    // refusé, pas le domaine : sans ce contraste, le 403 ci-dessus ne prouverait
    // rien (contrôle S7, `PLAN_SERVEUR` §3.3).
    const lecture = await serveur.appeler('GET', '/api/journal');
    assert.equal(lecture.statut, 200);
  });

  test('le droit d’export SANS le domaine ne suffit pas non plus', async () => {
    session.poser(sessionSite(FILIALE_A), RSSI_SANS_JOURNAL);
    const r = await serveur.appeler('GET', '/api/journal/export');
    assert.equal(r.statut, 403);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('le refus vient du CROCHET, pas d’une garde écrite dans la route', async () => {
    // ── Pourquoi cette distinction n'est pas de la coquetterie ────────
    //
    // Une garde écrite dans le corps de la route serait un second endroit où le
    // modèle de droits se décide — donc un endroit où il peut diverger, et un
    // endroit qu'une route neuve oublierait. Le §29.8 range le contrôle dans la
    // DÉCLARATION (`config.acces`), lue par le crochet `onRequest` avant que la
    // route existe pour la requête. L'écran de J3 en dépend : il attend un 403,
    // pas un 404 ni un 200 vide.
    //
    // Deux preuves, et la seconde est la vraie. D'abord le texte : ce fichier
    // n'a aucun moyen de refuser par lui-même.
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'api', 'journal.ts'),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    for (const garde of ['deciderAcces', 'refuserDroit', '.droits', 'statut: 403']) {
      assert.ok(
        !code.includes(garde),
        `« ${garde} » apparaît dans le corps de src/api/journal.ts : le refus doit venir de la ` +
          'déclaration d’accès, jamais d’une garde locale.',
      );
    }

    // Ensuite le comportement, et c'est lui qui compte : si le corps de la route
    // s'exécutait, il aurait écrit sa trace de consultation. Le §4 le mesure —
    // aucune `consultation_sensible` n'est écrite sur un refus. Le corps n'est
    // donc pas atteint du tout.
    session.poser(sessionSite(FILIALE_A), RSSI_SANS_JOURNAL);
    const r = await serveur.appeler('GET', '/api/journal');
    assert.equal(r.statut, 403, 'Ni 404, ni 200 vide : le modèle de droits a tranché.');
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('les deux ensemble ouvrent l’export', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR_EXPORTATEUR);
    const r = await serveur.appeler('GET', '/api/journal/export');
    assert.equal(r.statut, 200);
    assert.match(r.entetes['content-type'], /text\/csv/);
    assert.match(r.entetes['content-disposition'], /attachment; filename="journal-audit-.*\.csv"/);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });
});

/* =====================================================================
 *  §3 — Le cloisonnement traverse la route, il ne s'arrête pas à la base
 * ===================================================================== */

describe('Ce que la route rend est ce que la RLS laisse voir', () => {
  test('un auditeur de filiale ne reçoit que sa filiale — ni l’autre, ni le transversal', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?limite=500');
    assert.equal(r.statut, 200);

    const portees = new Set(r.corps.entrees.map((e) => e.filiale_id));
    assert.deepEqual([...portees], [FILIALE_A], JSON.stringify([...portees]));
  });

  test('un auditeur de périmètre Groupe reçoit tout, transversal compris', async () => {
    session.poser(sessionGroupe(), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?limite=500');
    assert.equal(r.statut, 200);

    const portees = new Set(r.corps.entrees.map((e) => e.filiale_id));
    assert.ok(portees.has(FILIALE_A), 'la filiale A');
    assert.ok(portees.has(FILIALE_B), 'la filiale B');
    assert.ok(portees.has(null), 'et l’entrée transversale — c’est l’arbitrage du §29.7');
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('la réponse porte les EMPREINTES : un extrait doit pouvoir être recoupé', async () => {
    session.poser(sessionGroupe(), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?limite=1');
    const [entree] = r.corps.entrees;
    assert.match(entree.empreinte, /^[0-9a-f]{64}$/);
    assert.ok('empreinte_precedente' in entree);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });
});

/* =====================================================================
 *  §4 — Lire le journal est un acte TRACÉ
 * ===================================================================== */

describe('Les trois routes s’inscrivent elles-mêmes au journal', () => {
  test('une consultation écrit « consultation_sensible », dans la transaction qui l’a servie', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const avant = (await toutLeJournal()).length;

    const r = await serveur.appeler('GET', '/api/journal?limite=5&action=export');
    assert.equal(r.statut, 200);

    const apres = await toutLeJournal();
    assert.equal(apres.length, avant + 1, 'Une consultation = une entrée.');

    const derniere = apres[apres.length - 1];
    assert.equal(derniere.action, 'consultation_sensible');
    assert.equal(derniere.filiale_id, FILIALE_A);
    // `resume` est une phrase du développeur (§29.5) : les filtres reçus du
    // client vivent en `valeurs_apres`, en jsonb, jamais concaténés ici.
    assert.equal(derniere.resume, 'Consultation du journal d’audit');

    const charge = await base.valeur(
      proprietaire,
      'select valeurs_apres from journal_audit order by numero desc limit 1',
    );
    assert.equal(charge.action, 'export');
    assert.equal(charge.limite, 5);
  });

  test('un export écrit « export » — c’est la moitié restante du constat Q-89', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR_EXPORTATEUR);
    const avant = (await toutLeJournal()).length;

    const r = await serveur.appeler('GET', '/api/journal/export');
    assert.equal(r.statut, 200);

    const apres = await toutLeJournal();
    assert.equal(apres.length, avant + 1);
    assert.equal(apres[apres.length - 1].action, 'export');
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('une vérification écrit « verification_journal » : se vérifier est un acte tracé', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const avant = (await toutLeJournal()).length;

    const r = await serveur.appeler('GET', '/api/journal/verification');
    assert.equal(r.statut, 200);
    assert.equal(r.corps.sain, true);
    assert.deepEqual(r.corps.anomalies, [], 'Aucune ligne = journal sain (CONVENTIONS.md §12).');

    const apres = await toutLeJournal();
    assert.equal(apres.length, avant + 1);
    assert.equal(apres[apres.length - 1].action, 'verification_journal');
  });

  test('un REFUS n’écrit AUCUNE consultation : la route n’a pas été atteinte', async () => {
    // La route n'est jamais exécutée : `onRequest` a refusé avant elle. La trace
    // du refus (`refus_autorisation`) appartient à `src/api/index.ts` — §29.2 le
    // range explicitement chez le crochet —, et ce fichier ne prétend pas la
    // poser à sa place. Ce qu'il vérifie est l'autre moitié : qu'aucune
    // `consultation_sensible` ne soit écrite pour une lecture qui n'a pas eu
    // lieu. Une trace de consultation sans consultation serait une fausse preuve
    // dans un registre dont c'est tout l'objet.
    session.poser(sessionSite(FILIALE_A), RSSI_SANS_JOURNAL);
    const avant = (await toutLeJournal()).filter((e) => e.action === 'consultation_sensible').length;
    const r = await serveur.appeler('GET', '/api/journal');
    assert.equal(r.statut, 403);
    const apres = (await toutLeJournal()).filter((e) => e.action === 'consultation_sensible').length;
    assert.equal(apres, avant);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('la chaîne reste saine après toutes ces écritures', async () => {
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_journal_audit_verifier()'), []);
  });
});

/* =====================================================================
 *  §5 — La pagination se fait sur « numero », jamais sur un décalage
 * ===================================================================== */

describe('L’enveloppe et le curseur portent les noms NORMATIFS du §29.8', () => {
  // ── Pourquoi cet essai existe ──────────────────────────────────────
  //
  // Le §29.8 figeait les chemins, les classes d'accès et les cinq filtres —
  // mais ni le nom du curseur, ni la forme de la réponse. Le serveur et l'écran
  // les ont donc choisis chacun de leur côté, et l'écart ne se serait vu qu'à la
  // deuxième page : un écran qui lit « corps.suivant » sur un serveur qui rend
  // « corps.pagination.suivant » reçoit `undefined`, cesse de feuilleter, et
  // affiche une page en croyant les avoir toutes. Rien ne casse ; il manque
  // seulement des lignes dans un registre qui sert de preuve en audit.
  //
  // Les noms sont arbitrés depuis le 04/09/2026. Cet essai les épingle : c'est
  // le seul endroit du dépôt où ils sont confrontés à ce que le serveur émet.
  test('les quatre noms sont ceux du contrat, et rien d’autre n’en tient lieu', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?limite=2');
    assert.equal(r.statut, 200);

    assert.deepEqual(Object.keys(r.corps).sort(), ['entrees', 'limite', 'suivant']);
    assert.ok(Array.isArray(r.corps.entrees), '« entrees » est le tableau des entrées.');
    assert.equal(typeof r.corps.suivant, 'number', '« suivant » est émis par le SERVEUR.');
    assert.equal(r.corps.pagination, undefined, 'Aucune enveloppe intermédiaire.');
  });

  test('la taille de page par défaut est 50 — c’est un réglage, pas un hasard', async () => {
    // L'écran l'emploie déjà. Une valeur différente ici ne casserait rien : elle
    // déplacerait seulement le moment où le curseur bascule, et personne ne le
    // verrait sans compter.
    session.poser(sessionGroupe(), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal');
    assert.equal(r.corps.limite, 50);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('« avant » est STRICTEMENT inférieur, et l’ordre est « numero » décroissant', async () => {
    // Les deux propriétés vont ensemble : c'est le tri décroissant qui rend
    // « avant » monotone. Un tri croissant ferait boucler le feuilletage sur la
    // même page, indéfiniment.
    session.poser(sessionGroupe(), AUDITEUR);
    const page = await serveur.appeler('GET', '/api/journal?limite=5');
    const numeros = page.corps.entrees.map((e) => Number(e.numero));
    for (let i = 1; i < numeros.length; i += 1) {
      assert.ok(numeros[i] < numeros[i - 1], `ordre non décroissant : ${String(numeros)}`);
    }

    const borne = numeros[numeros.length - 1];
    const suite = await serveur.appeler('GET', `/api/journal?limite=5&avant=${String(borne)}`);
    for (const n of suite.corps.entrees.map((e) => Number(e.numero))) {
      assert.ok(n < borne, `« avant » doit exclure la borne : ${String(n)} >= ${String(borne)}`);
    }
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('« suivant » vaut null quand il n’y a plus rien après', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?limite=500');
    assert.equal(r.corps.suivant, null, 'Une page incomplète est la dernière.');
  });
});

describe('Pagination par curseur — ce qu’un « offset » aurait perdu', () => {
  before(async () => {
    // De quoi feuilleter : douze entrées de plus dans la filiale A.
    await base.avecPerimetre(
      applicatif,
      site(FILIALE_A),
      async (c) => {
        for (let i = 1; i <= 12; i += 1) {
          await c.query(
            `insert into journal_audit (action, filiale_id, resume) values ('export', $1, $2)`,
            [FILIALE_A, `page ${String(i)}`],
          );
        }
      },
      { annuler: false },
    );
  });

  test('le curseur enchaîne les pages sans doublon ni trou', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const vus = [];
    let curseur = null;
    for (let page = 0; page < 10; page += 1) {
      const url = `/api/journal?limite=4${curseur === null ? '' : `&avant=${String(curseur)}`}`;
      const r = await serveur.appeler('GET', url);
      assert.equal(r.statut, 200);
      vus.push(...r.corps.entrees.map((e) => Number(e.numero)));
      curseur = r.corps.suivant;
      if (curseur === null) break;
    }

    // Strictement décroissant, donc ni doublon ni saut.
    for (let i = 1; i < vus.length; i += 1) {
      assert.ok(vus[i] < vus[i - 1], `numéros non décroissants : ${String(vus)}`);
    }
    assert.ok(vus.length >= 12, `attendu au moins douze entrées, vu ${String(vus.length)}`);
  });

  test('des entrées ARRIVÉES entre deux pages ne décalent pas la fenêtre', async () => {
    // ── Le défaut qu'un « offset » aurait, et que ce curseur n'a pas ──
    //
    // Le journal grandit pendant qu'on le feuillette : chaque consultation en
    // écrit une, et le reste du produit aussi. Avec « offset 4 », les quatre
    // entrées neuves poussent la fenêtre et la deuxième page ré-affiche des
    // lignes déjà vues — ou en saute autant. Avec « numero < curseur », la
    // fenêtre est ancrée sur une valeur qui ne bouge jamais.
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const premiere = await serveur.appeler('GET', '/api/journal?limite=4');
    const curseur = premiere.corps.suivant;
    assert.notEqual(curseur, null);

    await base.avecPerimetre(
      applicatif,
      site(FILIALE_A),
      async (c) => {
        for (let i = 0; i < 6; i += 1) {
          await c.query(
            `insert into journal_audit (action, filiale_id, resume) values ('export', $1, 'intercalée')`,
            [FILIALE_A],
          );
        }
      },
      { annuler: false },
    );

    const seconde = await serveur.appeler('GET', `/api/journal?limite=4&avant=${String(curseur)}`);
    const numerosPremiere = premiere.corps.entrees.map((e) => Number(e.numero));
    const numerosSeconde = seconde.corps.entrees.map((e) => Number(e.numero));

    assert.equal(
      numerosSeconde.filter((n) => numerosPremiere.includes(n)).length,
      0,
      'Aucune entrée ne doit apparaître sur deux pages.',
    );
    for (const n of numerosSeconde) {
      assert.ok(n < curseur, `le curseur borne la page : ${String(n)} >= ${String(curseur)}`);
    }
  });

  test('la limite est bornée par le serveur, pas par le client', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?limite=5000');
    assert.equal(r.statut, 400, 'Au-delà du plafond du schéma, la requête est refusée.');
  });
});

/* =====================================================================
 *  §6 — Les filtres, tous paramétrés
 * ===================================================================== */

describe('Filtres — aucun ne devient du SQL', () => {
  test('« action » filtre, et une action inconnue ne rend rien plutôt que d’échouer', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const exports = await serveur.appeler('GET', '/api/journal?action=export&limite=500');
    assert.ok(exports.corps.entrees.length > 0);
    assert.ok(exports.corps.entrees.every((e) => e.action === 'export'));

    const inconnue = await serveur.appeler('GET', '/api/journal?action=nexistepas&limite=500');
    assert.equal(inconnue.statut, 200);
    assert.deepEqual(inconnue.corps.entrees, []);
  });

  test('« utilisateur » vise le libellé ou l’identifiant, sans motif ni jointure libre', async () => {
    session.poser(sessionGroupe(), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal?utilisateur=inconnu.au.bataillon&limite=500');
    assert.equal(r.statut, 200);
    assert.equal(r.corps.entrees.length, 1);
    assert.equal(r.corps.entrees[0].action, 'connexion_echouee');
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('les bornes de date encadrent, et une date illisible est refusée en 400', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const avenir = new Date(Date.now() + 86_400_000).toISOString();
    const vide = await serveur.appeler('GET', `/api/journal?depuis=${encodeURIComponent(avenir)}`);
    assert.equal(vide.statut, 200);
    assert.deepEqual(vide.corps.entrees, []);

    const mauvaise = await serveur.appeler('GET', '/api/journal?depuis=pas-une-date');
    assert.equal(mauvaise.statut, 400);
    assert.equal(mauvaise.corps.erreur, 'donnee_invalide');

    const inversee = await serveur.appeler(
      'GET',
      `/api/journal?depuis=${encodeURIComponent(avenir)}&jusqu_a=2020-01-01T00:00:00Z`,
    );
    assert.equal(inversee.statut, 400);
  });

  test('un paramètre inconnu est RETIRÉ par Fastify, et n’élargit donc jamais la vue', async () => {
    // ── Ce que j'ai cru, et qui était faux ────────────────────────────
    //
    // `additionalProperties: false` devait produire un 400. Il n'en produit pas :
    // Fastify compile ses schémas avec `removeAdditional: true`, si bien qu'une
    // propriété absente du schéma est RETIRÉE avant validation. C'est la même
    // mécanique qui a obligé `SCHEMA_CREATION` de `src/api/index.ts` à déclarer
    // « id: { not: {} } » pour refuser bruyamment un identifiant client — un
    // procédé qui exige de NOMMER chaque paramètre interdit, c'est-à-dire une
    // liste écrite à la main (§19.5).
    //
    // Ce qui rend l'oubli tolérable ici, et il faut le dire plutôt que de le
    // taire : le paramètre imaginable est « filiale », et il n'existe pas
    // parce que le journal N'A PAS de filtre de filiale. Le cloisonnement est
    // tenu par la Row Level Security, sous le code. Un paramètre inconnu ne
    // peut donc jamais élargir la vue — au pire il ne la restreint pas, et
    // c'est ce que cet essai constate.
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const avec = await serveur.appeler('GET', '/api/journal?limite=5&filiale=FIL-ESSAI-B');
    const sans = await serveur.appeler('GET', '/api/journal?limite=5');
    assert.equal(avec.statut, 200);
    assert.deepEqual(
      new Set(avec.corps.entrees.map((e) => e.filiale_id)),
      new Set(sans.corps.entrees.map((e) => e.filiale_id)),
    );
    assert.deepEqual([...new Set(avec.corps.entrees.map((e) => e.filiale_id))], [FILIALE_A]);
  });

  test('une apostrophe et un point-virgule dans un filtre ne sont que du texte', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler(
      'GET',
      `/api/journal?utilisateur=${encodeURIComponent("x'; drop table journal_audit; --")}`,
    );
    assert.equal(r.statut, 200);
    assert.deepEqual(r.corps.entrees, []);
    // La table est toujours là, et la chaîne intacte.
    assert.ok((await toutLeJournal()).length > 0);
  });
});

/* =====================================================================
 *  §7 — L'EXPORT SUR UNE ENTRÉE HOSTILE : forger, exporter, RÉ-ANALYSER
 * ===================================================================== */

describe('Export — une valeur hostile reste UNE ligne logique, et intacte', () => {
  /** Ce que l'auditeur de la porte S3 a forgé : un login qui scinde une ligne. */
  const LOGIN_HOSTILE = 'jdupont"\r\nfaux;champ\r\n{"role":"admin"};"encore"';

  before(async () => {
    // Un échec de connexion sur un login construit — c'est le geste exact de
    // l'auditeur, et `utilisateur_libelle` est FOURNI par l'appelant (§12).
    await base.avecPerimetre(
      applicatif,
      site(FILIALE_A),
      async (c) => {
        await c.query(
          `insert into journal_audit (action, filiale_id, utilisateur_libelle, resume)
                values ('connexion_echouee', $1, $2, 'échec de connexion')`,
          [FILIALE_A, LOGIN_HOSTILE],
        );
      },
      { annuler: false },
    );
  });

  test('la valeur hostile est bien ARRIVÉE en base, littéralement', async () => {
    // Sans ce contrôle, l'essai qui suit pourrait passer sur une valeur que la
    // base aurait déjà nettoyée — et il ne prouverait alors rien du format.
    const stocke = await base.valeur(
      proprietaire,
      `select utilisateur_libelle from journal_audit where action = 'connexion_echouee'
        and utilisateur_libelle like 'jdupont%'`,
    );
    assert.equal(stocke, LOGIN_HOSTILE);
    assert.match(stocke, /\r\n/);
  });

  test('exporté puis RÉ-ANALYSÉ, il rend une seule ligne logique, valeur intacte', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR_EXPORTATEUR);
    const r = await serveur.appeler('GET', '/api/journal/export');
    assert.equal(r.statut, 200);

    const csv = r.corps;
    // Le texte contient bel et bien des sauts de ligne DANS un champ : sans
    // cela, on mesurerait un format sur une donnée inoffensive.
    assert.ok(csv.includes(LOGIN_HOSTILE.split('\r\n')[1]), 'la valeur doit être exportée telle quelle');

    const lignesPhysiques = csv.split('\r\n').length;
    const lignesLogiques = analyserCsv(csv);
    assert.ok(
      lignesPhysiques > lignesLogiques.length,
      'La valeur hostile doit occuper plusieurs lignes physiques et une seule logique — ' +
        `physiques ${String(lignesPhysiques)}, logiques ${String(lignesLogiques.length)}`,
    );

    const objets = objetsCsv(csv);
    const hostiles = objets.filter((o) => o.utilisateur_libelle === LOGIN_HOSTILE);
    assert.equal(hostiles.length, 1, 'UNE ligne logique, et une seule.');
    assert.equal(hostiles[0].action, 'connexion_echouee');
    assert.equal(hostiles[0].filiale_id, FILIALE_A);

    // Toutes les lignes ont le même nombre de colonnes : c'est ce qui casse
    // quand un champ scinde la ligne, et c'est ce qu'un tableur constate.
    const largeurs = new Set(lignesLogiques.map((l) => l.length));
    assert.equal(largeurs.size, 1, `largeurs observées : ${JSON.stringify([...largeurs])}`);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('l’extrait est cloisonné comme la page : il n’emporte pas l’autre filiale', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR_EXPORTATEUR);
    const r = await serveur.appeler('GET', '/api/journal/export');
    const filiales = new Set(objetsCsv(r.corps).map((o) => o.filiale_id));
    assert.deepEqual([...filiales], [FILIALE_A]);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('l’extrait porte les mêmes filtres que la page', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR_EXPORTATEUR);
    const r = await serveur.appeler('GET', '/api/journal/export?action=connexion_echouee');
    const actions = new Set(objetsCsv(r.corps).map((o) => o.action));
    assert.deepEqual([...actions], ['connexion_echouee']);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('les horodatages sortent en ISO 8601, pas en objet sérialisé deux fois', async () => {
    // Le pilote `pg` rend un `timestamptz` en objet `Date` : cité par un
    // `JSON.stringify`, il serait entouré de guillemets À L'INTÉRIEUR du champ,
    // et l'extrait mentirait sans que rien ne le dise.
    session.poser(sessionSite(FILIALE_A), AUDITEUR_EXPORTATEUR);
    const r = await serveur.appeler('GET', '/api/journal/export?limite=3');
    for (const o of objetsCsv(r.corps)) {
      assert.match(o.horodatage, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });
});

/* =====================================================================
 *  §8 — La vérification du chaînage, vue de la route
 * ===================================================================== */

describe('GET /api/journal/verification — aucune ligne = journal sain', () => {
  test('elle rend « sain » sur un journal intact', async () => {
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal/verification');
    assert.equal(r.statut, 200);
    assert.deepEqual(r.corps, { sain: true, depuis: null, anomalies: [] });
  });

  test('elle voit la chaîne ENTIÈRE, y compris depuis un périmètre d’une seule filiale', async () => {
    // C'est tout l'objet du « security definer » : cloisonnée, la vérification
    // signalerait un trou de numérotation à chaque frontière de périmètre — elle
    // crierait à la falsification sur un journal parfaitement sain.
    session.poser(sessionSite(FILIALE_B), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal/verification');
    assert.equal(r.corps.sain, true);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('« depuis » ne rend qu’un avertissement informatif, jamais une fausse alerte', async () => {
    session.poser(sessionGroupe(), AUDITEUR);
    const r = await serveur.appeler('GET', '/api/journal/verification?depuis=3');
    assert.equal(r.statut, 200);
    assert.equal(r.corps.depuis, 3);
    assert.deepEqual(
      r.corps.anomalies.map((a) => a.anomalie),
      ['chaine_tronquee'],
      'Vérifier un segment n’est pas constater une falsification.',
    );
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('une falsification est VUE : on retouche une ligne sous le propriétaire', async () => {
    // La preuve que la route ne se contente pas de dire « sain ». La retouche
    // exige de désactiver le déclencheur d'ajout seul — ce que seul le
    // propriétaire peut faire (`CONVENTIONS.md` §12), et c'est précisément la
    // limite que le chaînage existe pour rendre DÉTECTABLE.
    session.poser(sessionGroupe(), AUDITEUR);
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_maj');
      await proprietaire.query(
        `update journal_audit set resume = 'falsifié' where numero = (select min(numero) from journal_audit)`,
      );
      await proprietaire.query('alter table journal_audit enable always trigger trg_journal_audit_interdit_maj');
      // La route ouvre sa propre connexion, hors de cette transaction : elle ne
      // verrait rien. On interroge donc la fonction ICI, dans la transaction qui
      // porte la falsification.
      const anomalies = await base.lignes(
        proprietaire,
        'select numero_entree::int as numero, anomalie from f_journal_audit_verifier()',
      );
      // ── Ce que j'ai cru, et qui était faux ──────────────────────────
      //
      // J'attendais « empreinte_invalide ET chainage_rompu ». Il n'y a que le
      // premier, et le §12 le dit déjà noir sur blanc : `empreinte_precedente`
      // est STOCKÉE, pas recalculée. Retoucher un contenu sans toucher à
      // l'empreinte laisse donc la ligne suivante parfaitement cohérente — c'est
      // la PREMIÈRE ligne du tableau du §12, pas la deuxième. Le `chainage_rompu`
      // n'apparaît qu'au second scénario, celui de l'attaquant qui recalcule.
      assert.deepEqual(
        anomalies.map((a) => a.anomalie),
        ['empreinte_invalide'],
        'Retoucher un contenu invalide l’empreinte de CETTE ligne (CONVENTIONS.md §12).',
      );
    } finally {
      await proprietaire.query('rollback');
    }

    // Et la base est rendue intacte.
    const r = await serveur.appeler('GET', '/api/journal/verification');
    assert.equal(r.corps.sain, true);
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });

  test('l’attaquant qui RECALCULE l’empreinte est trahi par la ligne suivante', async () => {
    // Le deuxième cas du tableau du §12 : « retoucher le contenu ET recalculer
    // l'empreinte » → `chainage_rompu` sur la ligne SUIVANTE, dont
    // l'`empreinte_precedente` figée ne correspond plus. C'est ce qui oblige à
    // réécrire toute la chaîne jusqu'au dernier maillon pour falsifier une
    // entrée sans se faire voir.
    session.poser(sessionGroupe(), AUDITEUR);
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_maj');
      await proprietaire.query(`
        update journal_audit j
           set resume = 'falsifié',
               empreinte = encode(sha256(convert_to(
                   f_journal_audit_charge_utile(
                       j.numero, j.id, j.horodatage, j.filiale_id, j.utilisateur_id,
                       j.utilisateur_libelle, j.session_id, j.adresse_ip, j.action,
                       j.entite_type::text, j.entite_id, 'falsifié', j.valeurs_avant,
                       j.valeurs_apres, j.version_application, j.empreinte_precedente),
                   'UTF8')), 'hex')
         where j.numero = (select min(numero) from journal_audit)`);
      await proprietaire.query('alter table journal_audit enable always trigger trg_journal_audit_interdit_maj');

      const anomalies = await base.lignes(
        proprietaire,
        'select numero_entree::int as numero, anomalie from f_journal_audit_verifier()',
      );
      assert.deepEqual(
        anomalies.map((a) => a.anomalie),
        ['chainage_rompu'],
        'L’empreinte recalculée est cohérente ; c’est la ligne SUIVANTE qui dénonce.',
      );
      assert.equal(anomalies[0].numero, 2, 'Et elle dénonce à la ligne d’après, pas à la sienne.');
    } finally {
      await proprietaire.query('rollback');
    }
    session.poser(sessionSite(FILIALE_A), AUDITEUR);
  });
});
