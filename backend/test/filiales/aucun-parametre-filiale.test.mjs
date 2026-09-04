/**
 * aucun-parametre-filiale.test.mjs — **le contrôle S2, rejoué contre le lot L4.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier interdit, et pourquoi il faut l'interdire par la MESURE
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §30.2 : *« le sélecteur est une **route dédiée**, pas un
 * paramètre ajouté aux routes existantes. Un agent qui serait tenté d'ajouter
 * `?filiale=` à `/api/donnees` doit s'arrêter : ce serait la fin de la
 * propriété, et le contrôle S2 de la grille la rejoue contre cette couche. »*
 *
 * Le `CLAUDE.md` §8 ajoute la façon de s'y prendre : *« un contrôle qui compare
 * deux déclarations ne contrôle rien ; il faut envoyer et constater. »* Ce
 * fichier fait donc les deux, dans cet ordre :
 *
 *  1. **il DÉCOUVRE les routes montées** — par un crochet `onRoute` posé avant
 *     l'enregistrement du greffon, donc sans liste écrite à la main — et vérifie
 *     qu'une seule d'entre elles nomme une filiale : celle du §30.2 ;
 *  2. **il ENVOIE une filiale voisine par tous les canaux** — chaîne de requête,
 *     en-tête, cookie, corps, champ métier — sur **toutes** les routes
 *     découvertes, et constate ensuite, EN BASE, que rien n'a bougé.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'exigence de matière, et le défaut qu'elle ferme
 * ════════════════════════════════════════════════════════════════════════
 *
 * Un banc qui hurlerait « aucune donnée de la filiale voisine n'a fuité » sur une
 * filiale voisine **vide** ne mesurerait rien du tout : c'est le motif du constat
 * Q-104 (*« un `0` sur une table cloisonnée ne distingue pas vide de non
 * contrôlé »*), et celui des deux essais du dépôt qui comparaient `0` à `0`.
 *
 * La filiale voisine porte donc un **témoin nommé**, écrit par le produit
 * lui-même, et l'essai commence par vérifier qu'il existe — puis qu'il est
 * **visible de quelqu'un**, avant d'exiger qu'il soit invisible de qui n'y a pas
 * droit. Sans ces deux préalables, la dernière assertion serait décorative.
 *
 * Prérequis machine : PostgreSQL prêt ; sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

const TLS = 'FIL-S2P-TLS';
const DEU = 'FIL-S2P-DEU';

/** La route dédiée du §30.2 — **la seule** qui a le droit de nommer une filiale. */
const ROUTE_DEDIEE = '/api/session/filiale-active';

const TEMOIN_DEU = 'TEMOIN-DEU-ne-doit-jamais-sortir-de-sa-filiale';
const TEMOIN_TLS = 'TEMOIN-TLS-doit-etre-lisible-de-Toulouse';

const RSSI_GROUPE = { identifiant: 'rssi.groupe', motDePasse: 'rssi.groupe!2026' };
const RSSI_TLS = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };

let base;
let applicatif;
let temoin;
let doublure;
let pool;
let instance;
let sessions;
/** Toutes les routes montées, DÉCOUVERTES par le crochet `onRoute`. */
const routes = [];

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  temoin = await base.nouvelleConnexion('app');
  doublure = await demarrerAnnuaire();

  const droits = await moduleCompile('droits/index.js');
  sessions = await moduleCompile('auth/sessions.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'TLS', 'Dedienne Aerospace Toulouse', 'FR'),
             ($2, 'DEU', 'Dedienne Deutschland', 'DE')`,
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

  // ── Le serveur, monté ICI pour que `onRoute` puisse VOIR ce qui se monte ──
  //
  // `monterServeurReel` construit et enregistre en un seul geste : un crochet
  // posé après coup ne verrait plus rien. Ces quinze lignes sont donc le prix
  // d'une découverte réelle, et elles montent le MÊME greffon avec le MÊME
  // service d'authentification que `src/serveur.ts`.
  const { default: Fastify } = await import('fastify');
  const { chargerConfiguration } = await moduleCompile('config/index.js');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');
  const auth = await moduleCompile('auth/index.js');

  const config = chargerConfiguration({
    NODE_ENV: 'developpement',
    SERVEUR_PORT: '3999',
    BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
    BASE_PORT: process.env.BASE_PORT ?? '5432',
    BASE_NOM: base.nom,
    BASE_UTILISATEUR: process.env.BASE_UTILISATEUR ?? 'grc_app',
    BASE_MOT_DE_PASSE: process.env.BASE_MOT_DE_PASSE ?? 'dev',
    BASE_SSL: 'desactive',
    SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
    LDAP_URL: doublure.url,
    LDAP_VERIFIER_CERTIFICAT: 'non',
    LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
    LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
    LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
    SERVEUR_NIVEAU_JOURNAL: process.env.SERVEUR_NIVEAU_JOURNAL ?? 'silent',
  });
  pool = creerPool(config.base);
  instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });
  // Le crochet est posé AVANT l'enregistrement : c'est la seule position d'où
  // l'on voie les routes des greffons imbriqués (journal, pièces, connexion).
  instance.addHook('onRoute', (route) => {
    routes.push({
      methode: route.method,
      url: route.url,
      schema: route.schema ?? null,
      acces: route.config?.acces ?? null,
    });
  });
  await instance.register(greffonApi, {
    pool,
    config,
    serviceAuthentification: new auth.ServiceAuthentification(pool, config, {
      info() {},
      warn() {},
      error() {},
    }),
  });
  await instance.ready();
});

after(async () => {
  instance?.server.closeAllConnections?.();
  await instance?.close().catch(() => {});
  await pool?.end().catch(() => {});
  await temoin?.end().catch(() => {});
  await doublure?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  Outillage
 * ===================================================================== */

async function appeler(methode, url, options = {}) {
  const reponse = await instance.inject({
    method: methode,
    url,
    ...(options.corps === undefined ? {} : { payload: options.corps }),
    ...(options.entetes === undefined ? {} : { headers: options.entetes }),
  });
  let corps = reponse.body;
  if ((reponse.headers['content-type'] ?? '').includes('application/json')) {
    try {
      corps = JSON.parse(reponse.body);
    } catch {
      /* une réponse annoncée JSON mais illisible est un constat en soi */
    }
  }
  return { statut: reponse.statusCode, corps };
}

async function connecter(compte) {
  const r = await instance.inject({
    method: 'POST',
    url: '/api/connexion',
    payload: compte,
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.statusCode, 200, `connexion refusée : ${r.body}`);
  return {
    cookie: String(r.headers['set-cookie']).split(';')[0],
    charte: JSON.parse(r.body),
  };
}

const avec = (cookie, options = {}) => ({
  ...options,
  entetes: { cookie, 'content-type': 'application/json', ...(options.entetes ?? {}) },
});

async function lire(sql, valeurs = []) {
  return await base.avecPerimetre(
    temoin,
    perimetre('verificateur', TLS, [TLS, DEU]),
    async (c) => (await c.query(sql, valeurs)).rows,
  );
}

async function ligneSession(cookie) {
  const jeton = cookie.slice(cookie.indexOf('=') + 1);
  const lignes = await lire(`select "id", "filiale_active_id" from sessions where "jeton_empreinte" = $1`, [
    sessions.empreinteJeton(jeton),
  ]);
  assert.equal(lignes.length, 1, 'Un jeton, une ligne de session.');
  return lignes[0];
}

/**
 * Tous les **noms de propriétés** qu'un schéma de route déclare, à toute
 * profondeur — corps, chaîne de requête, paramètres de chemin, en-têtes.
 *
 * C'est la liste de ce qu'une requête a le droit de porter. Les **valeurs** sont
 * délibérément ignorées : `portee: { enum: ['filiale', 'groupe'] }` nomme une
 * portée, pas une filiale, et les confondre interdirait un vocabulaire légitime.
 */
function nomsDeProprietes(noeud, sous = 'racine', vus = new Set()) {
  if (noeud === null || typeof noeud !== 'object') return [];
  if (vus.has(noeud)) return [];
  vus.add(noeud);
  const noms = [];
  for (const [cle, valeur] of Object.entries(noeud)) {
    if (cle === 'properties' && valeur !== null && typeof valeur === 'object') {
      for (const nom of Object.keys(valeur)) noms.push(nom);
    }
    if (cle === 'enum') continue; // des VALEURS, jamais des noms
    noms.push(...nomsDeProprietes(valeur, cle, vus));
  }
  return noms;
}

/** Les noms de risques que cette session voit par `GET /api/donnees`. */
async function risquesVus(cookie) {
  const r = await appeler('GET', '/api/donnees', avec(cookie));
  assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 300));
  return (r.corps.data.risques ?? []).map((x) => x.nom);
}

/* =====================================================================
 *  §0 — Le décor : un témoin dans chaque filiale, écrit par le PRODUIT
 * ===================================================================== */

describe('Le décor porte de la matière — sinon rien de ce qui suit ne mesure', () => {
  test('un témoin est écrit dans chaque filiale, et le jeu servi SUIT la filiale active', async (t) => {
    const { cookie, charte } = await connecter(RSSI_GROUPE);
    assert.equal(charte.perimetre_lecture.length, 2);

    for (const [filiale, nom] of [
      [TLS, TEMOIN_TLS],
      [DEU, TEMOIN_DEU],
    ]) {
      const bascule = await appeler('PUT', ROUTE_DEDIEE, avec(cookie, { corps: { filiale } }));
      assert.equal(bascule.statut, 200, JSON.stringify(bascule.corps));
      const cree = await appeler(
        'POST',
        '/api/entites/risques',
        avec(cookie, { corps: { champs: { nom } } }),
      );
      assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
      const [ligne] = await lire(`select "filiale_id" from risques where "id" = $1`, [
        cree.corps.enregistrement.id,
      ]);
      assert.equal(ligne.filiale_id, filiale, 'Le témoin doit être là où on croit l’avoir mis.');
    }

    // ── Ce que j'ai cru, et qui était faux ──────────────────────────────
    //
    // J'attendais que `GET /api/donnees` rende tout le PÉRIMÈTRE DE LECTURE, et
    // donc les deux témoins à la fois pour un compte Groupe. Il n'en rend qu'un :
    // le chargement du jeu de données est cadré sur la **filiale ACTIVE**
    // (`Depot.chargerJeuDeDonnees`, `src/entites/index.ts` — « le filtre est
    // `filiale_id = <filiale active>`, jamais plus large »).
    //
    // La conséquence vaut d'être écrite, parce qu'elle est la raison d'être du
    // lot : **le sélecteur ne déplace pas seulement où l'on écrit, il décide
    // aussi de ce que l'on voit.** Un sélecteur qui se tromperait ne montrerait
    // donc pas seulement les mauvaises écritures — il montrerait les mauvaises
    // données, ce qui est exactement l'oracle inter-filiales qu'on ferme.
    for (const [filiale, sien, autrui] of [
      [TLS, TEMOIN_TLS, TEMOIN_DEU],
      [DEU, TEMOIN_DEU, TEMOIN_TLS],
    ]) {
      assert.equal((await appeler('PUT', ROUTE_DEDIEE, avec(cookie, { corps: { filiale } }))).statut, 200);
      const vus = await risquesVus(cookie);
      assert.ok(vus.includes(sien), `Actif sur ${filiale}, le jeu doit porter son témoin.`);
      assert.ok(!vus.includes(autrui), `Actif sur ${filiale}, le jeu ne doit PAS porter l’autre.`);
      t.diagnostic(`actif ${filiale} → ${String(vus.length)} risque(s) servi(s)`);
    }
  });
});

/* =====================================================================
 *  §1 — La DÉCOUVERTE : une seule route nomme une filiale
 * ===================================================================== */

describe('§30.2 — une seule route nomme une filiale, et c’est la route dédiée', () => {
  test('les routes sont DÉCOUVERTES, et il y en a de quoi mesurer', (t) => {
    // Un crochet qui ne verrait rien rendrait tout ce qui suit vert par vacuité.
    assert.ok(
      routes.length >= 15,
      `Seulement ${String(routes.length)} route(s) découverte(s) : le crochet onRoute ne ` +
        'voit plus les greffons imbriqués, et les contrôles de ce fichier ne mesurent rien.',
    );
    assert.ok(
      routes.some((r) => r.url === ROUTE_DEDIEE),
      'La route dédiée du §30.2 doit être montée.',
    );
    assert.ok(routes.some((r) => r.url === '/api/connexion'), 'Les routes publiques aussi.');
    t.diagnostic(
      `routes découvertes : ${[...new Set(routes.map((r) => `${r.methode} ${r.url}`))].sort().join(' · ')}`,
    );
  });

  test('AUCUN chemin de route ne porte une filiale en PARAMÈTRE', () => {
    // ── Ce que j'ai cru, et qui était faux (deuxième fois) ──────────────
    //
    // Le premier jet cherchait « filiale » n'importe où dans l'URL. Il a désigné
    // `GET /api/filiales` — la route qui NOMME les filiales du périmètre pour
    // que le sélecteur n'affiche pas des identifiants techniques (Q-85). Cette
    // route ne *reçoit* aucune filiale : elle en *rend*, et seulement celles que
    // la session lit déjà.
    //
    // Ce que le §30.2 interdit est qu'une filiale soit **demandée** par l'URL.
    // Le contrôle porte donc sur les **segments de paramètre** — `:filiale`,
    // `:filiale_id` —, seuls capables de porter une valeur choisie par le client.
    const fautifs = routes.filter((r) =>
      r.url.split('/').some((segment) => segment.startsWith(':') && /filiale/i.test(segment)),
    );
    assert.deepEqual(
      fautifs.map((r) => `${r.methode} ${r.url}`),
      [],
      '§30.2 : le périmètre ne se demande pas par l’URL.',
    );
  });

  test('les SEULES routes dont le chemin parle de filiales sont les deux qui le doivent', () => {
    // La seconde moitié : un chemin qui parle de filiales sans en recevoir reste
    // une surface à surveiller. Une troisième qui apparaîtrait ferait rougir
    // cette ligne, et quelqu'un devrait dire ce qu'elle fait — c'est le bon
    // usage d'une liste écrite à la main (`CLAUDE.md` §3, cas (b)).
    const parlantes = [...new Set(routes.filter((r) => /filiale/i.test(r.url)).map((r) => r.url))];
    assert.deepEqual(
      parlantes.sort(),
      ['/api/filiales', ROUTE_DEDIEE].sort(),
      '/api/filiales RÉPOND (le périmètre de lecture, nommé) ; ' +
        `${ROUTE_DEDIEE} REÇOIT (le choix). Toute autre est à justifier.`,
    );
  });

  test('AUCUN schéma de route n’accepte une filiale, sauf la route dédiée', () => {
    // ── Ce que j'ai cru, et qui était faux ──────────────────────────────
    //
    // Le premier jet cherchait « filiale » dans le schéma SÉRIALISÉ. Il a
    // désigné `POST /api/entites/:entite` — à tort : ce que le schéma nomme là
    // est `portee: { enum: ['filiale', 'groupe'] }`, c'est-à-dire la **portée**
    // d'un enregistrement, et non *laquelle* des filiales. Un détecteur qui
    // confond « de portée filiale » et « la filiale n° tant » interdirait un
    // vocabulaire légitime, et se ferait desserrer au premier faux positif.
    //
    // Il ne regarde donc que les **noms de propriétés** que le schéma déclare —
    // c'est-à-dire ce qu'une requête a le droit de porter — et jamais les
    // valeurs. Portée exacte, écrite plutôt que sous-entendue : c'est une
    // heuristique de nommage. Ce qui mord vraiment est le §2 de ce fichier,
    // qui envoie et constate.
    const fautifs = [];
    for (const r of routes) {
      if (r.url === ROUTE_DEDIEE) continue;
      if (r.schema === null) continue;
      const noms = nomsDeProprietes(r.schema);
      if (noms.some((n) => /filiale/i.test(n))) {
        fautifs.push(`${r.methode} ${r.url} → ${noms.filter((n) => /filiale/i.test(n)).join(', ')}`);
      }
    }
    assert.deepEqual(fautifs, [], '§30.2 : « pas un paramètre ajouté aux routes existantes ».');
  });

  test('la PORTÉE d’un enregistrement reste un vocabulaire légitime', () => {
    // La distinction que le détecteur ci-dessus doit tenir : `portee` vaut
    // « filiale » ou « groupe », et cela n'a rien à voir avec le choix d'une
    // filiale. Si cette valeur disparaissait, le contrôle du dessus deviendrait
    // vrai sans rien avoir eu à distinguer.
    const creation = routes.find((r) => r.methode === 'POST' && r.url === '/api/entites/:entite');
    assert.ok(creation !== undefined);
    assert.deepEqual(creation.schema.body.properties.portee.enum, ['filiale', 'groupe']);
    assert.ok(!nomsDeProprietes(creation.schema).some((n) => /filiale/i.test(n)));
  });

  test('la route dédiée, elle, n’accepte QUE cela', () => {
    const dediee = routes.find((r) => r.url === ROUTE_DEDIEE);
    assert.ok(dediee !== undefined);
    assert.equal(dediee.methode, 'PUT');
    assert.deepEqual(Object.keys(dediee.schema.body.properties), ['filiale']);
    assert.equal(
      dediee.schema.body.additionalProperties,
      false,
      '§30.2 : « un identifiant de filiale, et rien d’autre ». Une liste de filiales, ' +
        'une portée ou un drapeau joints au corps doivent être refusés au bord.',
    );
    assert.deepEqual(dediee.schema.body.required, ['filiale']);
    // Elle porte une classe d'accès comme toutes les autres : le crochet refuse
    // ce qu'il ne sait pas classer, et « publique » n'est pas un défaut.
    assert.equal(dediee.acces?.action, 'lire');
  });

  test('MORSURE : le détecteur voit un paramètre de filiale, et SEULEMENT cela', () => {
    // Sans cette morsure, les contrôles ci-dessus resteraient verts si le motif
    // de recherche cessait de reconnaître quoi que ce soit.
    const contrefacon = {
      querystring: { type: 'object', properties: { filiale: { type: 'string' } } },
    };
    assert.deepEqual(nomsDeProprietes(contrefacon), ['filiale']);
    assert.ok(nomsDeProprietes(contrefacon).some((n) => /filiale/i.test(n)), 'il doit MORDRE');

    // Une entête, un paramètre de chemin, un champ de corps imbriqué : les trois
    // autres façons de faire entrer la même chose.
    assert.ok(
      nomsDeProprietes({ headers: { properties: { 'x-filiale': {} } } }).includes('x-filiale'),
    );
    assert.ok(nomsDeProprietes({ params: { properties: { filiale_id: {} } } }).includes('filiale_id'));
    assert.ok(
      nomsDeProprietes({ body: { properties: { contexte: { properties: { filiale: {} } } } } })
        .includes('filiale'),
      'Un champ imbriqué compte autant qu’un champ de premier niveau.',
    );

    // Et il ne doit PAS mordre sur une valeur d'énumération : c'est le faux
    // positif qui a fait réécrire ce détecteur.
    assert.ok(
      !nomsDeProprietes({ body: { properties: { portee: { enum: ['filiale', 'groupe'] } } } })
        .some((n) => /filiale/i.test(n)),
    );
    assert.ok(!/filiale/i.test(nomsDeProprietes({ querystring: { properties: { depuis: {} } } }).join()));
    const segments = (url) => url.split('/').some((s) => s.startsWith(':') && /filiale/i.test(s));
    assert.ok(segments('/api/entites/:entite/:filiale'), 'un paramètre de filiale doit MORDRE');
    assert.ok(segments('/api/donnees/:filiale_id'));
    assert.ok(!segments('/api/filiales'), 'un chemin qui NOMME des filiales n’en reçoit pas');
    assert.ok(!segments('/api/session/filiale-active'));
  });
});

/* =====================================================================
 *  §2 — ENVOYER ET CONSTATER : la filiale voisine par tous les canaux
 * ===================================================================== */

describe('§30.2 — une filiale envoyée par le client n’atteint jamais le périmètre', () => {
  test('toutes les routes découvertes sont martelées, et rien ne bouge', async (t) => {
    const { cookie, charte } = await connecter(RSSI_TLS);
    assert.deepEqual(charte.perimetre_lecture, [TLS], 'Une seule filiale : sinon rien à franchir.');
    assert.equal(charte.filiale_active.id, TLS);

    // Le vert AVANT : Toulouse voit son témoin, et pas celui de Deutschland.
    const avant = await risquesVus(cookie);
    assert.ok(avant.includes(TEMOIN_TLS), 'Toulouse doit voir le sien : sinon on mesure du vide.');
    assert.ok(!avant.includes(TEMOIN_DEU));

    /** Un corps minimal, plausible pour chaque forme de route, PLUS la filiale. */
    const corpsAvecFiliale = (url) => {
      if (url === '/api/connexion') return { ...RSSI_TLS, filiale: DEU };
      if (url === '/api/reprise') {
        return { mode: 'fusionner', fichier: { nom: 'x.json', contenu: '{}' }, filiale: DEU };
      }
      if (url === '/api/operations/propager-mesure') {
        return { mesure_id: 'MES-inexistante', statut: 'conforme', filiale: DEU };
      }
      return { champs: { nom: 'martelage' }, version: 1, filiale: DEU };
    };

    let martelees = 0;
    const statuts = new Map();
    for (const r of routes) {
      if (r.url === ROUTE_DEDIEE) continue; // c'est SA raison d'être
      if (r.methode === 'HEAD') continue; // doublon de GET, sans corps
      // ── La seule exception, et elle est nommée avec son motif ──────────
      //
      // `DELETE /api/connexion` **révoque la session en base** : la marteler
      // avec la session qu'on observe ne mesure rien, cela met fin à
      // l'observation. Elle est éprouvée juste en dessous, pour elle-même. C'est
      // le cas (b) du `CLAUDE.md` §3 — une liste dont l'omission ferait échouer
      // bruyamment, et où quelqu'un doit trancher.
      if (r.methode === 'DELETE' && r.url === '/api/connexion') continue;
      // La filiale voisine, par les QUATRE canaux à la fois : chaîne de requête,
      // en-tête, cookie surnuméraire, et corps.
      const url = `${r.url.replace(/:entite\b/, 'risques').replace(/:identifiant\b/, 'RSK-inexistant')}?filiale=${DEU}&filiale_id=${DEU}`;
      const reponse = await appeler(r.methode, url, {
        entetes: {
          cookie: `${cookie}; filiale=${DEU}; grc_filiale=${DEU}`,
          'content-type': 'application/json',
          'x-filiale': DEU,
          'x-grc-filiale': DEU,
          'x-filiale-id': DEU,
        },
        ...(r.methode === 'GET' ? {} : { corps: corpsAvecFiliale(r.url) }),
      });
      martelees += 1;
      statuts.set(`${r.methode} ${r.url}`, reponse.statut);
    }

    t.diagnostic(`routes martelées : ${String(martelees)}`);
    assert.ok(martelees >= 14, 'Trop peu de routes martelées : le balayage ne mesure rien.');

    // ── Le constat, EN BASE, et non dans les réponses ──────────────────
    assert.equal(
      (await ligneSession(cookie)).filiale_active_id,
      TLS,
      'Aucune route existante ne doit pouvoir déplacer la filiale active.',
    );
    const charteApres = await appeler('GET', '/api/session', avec(cookie));
    assert.equal(charteApres.statut, 200, JSON.stringify(charteApres.corps));
    assert.equal(charteApres.corps.filiale_active.id, TLS);
    assert.deepEqual(charteApres.corps.perimetre_lecture, [TLS]);

    // La liste des filiales non plus : c'est la seule route qui RÉPOND des
    // filiales, donc la première où un paramètre mal traité se verrait.
    for (const url of ['/api/filiales', `/api/filiales?filiale=${DEU}&filiale_id=${DEU}`]) {
      const liste = await appeler('GET', url, {
        entetes: { cookie, 'x-filiale': DEU },
      });
      assert.equal(liste.statut, 200, JSON.stringify(liste.corps));
      assert.deepEqual(
        liste.corps.filiales.map((f) => f.id),
        [TLS],
        `« ${url} » a rendu autre chose que le périmètre de lecture de la session.`,
      );
    }

    // Et la donnée servie n'a pas franchi la frontière.
    const apres = await risquesVus(cookie);
    assert.ok(
      !apres.includes(TEMOIN_DEU),
      'Le témoin de la filiale voisine ne doit JAMAIS apparaître, quel que soit le canal.',
    );
    assert.ok(apres.includes(TEMOIN_TLS), 'Et Toulouse doit toujours voir le sien.');

    // L'écriture suivante atterrit toujours à Toulouse.
    const cree = await appeler(
      'POST',
      '/api/entites/risques',
      avec(cookie, { corps: { champs: { nom: 'Après le martelage' } } }),
    );
    assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
    const [ligne] = await lire(`select "filiale_id" from risques where "id" = $1`, [
      cree.corps.enregistrement.id,
    ]);
    assert.equal(ligne.filiale_id, TLS);
  });

  test('les DEUX routes publiques ne prennent pas de filiale non plus', async () => {
    // `POST /api/connexion` est le seul endroit qui pourrait, en théorie, laisser
    // le client choisir sa filiale de départ : `resoudreDroits` accepte une
    // `filialePreferee`. Elle vient de `utilisateurs.filiale_defaut_id`, une
    // colonne de la BASE — et la mesure ci-dessous est la seule preuve que le
    // corps de la connexion n'y touche pas.
    const avecChoix = await instance.inject({
      method: 'POST',
      url: `/api/connexion?filiale=${DEU}`,
      payload: { ...RSSI_TLS, filiale: DEU, filiale_active: DEU, perimetre_lecture: [DEU] },
      headers: { 'content-type': 'application/json', 'x-filiale': DEU },
    });
    assert.equal(avecChoix.statusCode, 200, avecChoix.body);
    const charte = JSON.parse(avecChoix.body);
    assert.equal(charte.filiale_active.id, TLS, 'La filiale de départ vient des groupes AD.');
    assert.deepEqual(charte.perimetre_lecture, [TLS]);
    const cookie = String(avecChoix.headers['set-cookie']).split(';')[0];
    assert.equal((await ligneSession(cookie)).filiale_active_id, TLS);

    // `DELETE /api/connexion` : sa seule issue est de fermer la session. Il ne
    // doit rien déplacer avant de le faire.
    // Sans corps, donc sans `content-type: application/json` — Fastify refuse en
    // 400 un corps annoncé et absent, et l'essai mesurerait alors son propre
    // en-tête plutôt que la route.
    const sortie = await appeler('DELETE', `/api/connexion?filiale=${DEU}`, {
      entetes: { cookie, 'x-filiale': DEU },
    });
    assert.equal(sortie.statut, 204);
    assert.equal(
      (await ligneSession(cookie)).filiale_active_id,
      TLS,
      'Une déconnexion révoque ; elle ne déménage pas.',
    );
  });

  test('« filiale_id » dans les champs métier est REFUSÉ, pas ignoré', async () => {
    const { cookie } = await connecter(RSSI_TLS);
    const r = await appeler(
      'POST',
      '/api/entites/risques',
      avec(cookie, { corps: { champs: { nom: 'Champ de cloisonnement forgé', filiale_id: DEU } } }),
    );
    assert.equal(
      r.statut,
      400,
      'Le cloisonnement n’est pas une donnée : un champ qui le viserait doit être ' +
        `refusé, pas retiré en silence. Reçu ${String(r.statut)} : ${JSON.stringify(r.corps)}`,
    );
    // Rien n'a été écrit : la filiale voisine n'a pas gagné de ligne.
    const [avant] = await lire(
      `select count(*)::int as n from risques where "filiale_id" = $1 and "nom" = $2`,
      [DEU, 'Champ de cloisonnement forgé'],
    );
    assert.equal(avant.n, 0);
  });

  test('`GET /api/donnees?filiale=…` rend EXACTEMENT ce que rend `GET /api/donnees`', async () => {
    const { cookie } = await connecter(RSSI_TLS);
    const sans = await appeler('GET', '/api/donnees', avec(cookie));
    const avecParametre = await appeler('GET', `/api/donnees?filiale=${DEU}`, avec(cookie));
    assert.equal(sans.statut, 200);
    assert.equal(avecParametre.statut, 200);
    // `horodatage` est l'instant de la réponse : il diffère par construction.
    assert.deepEqual(avecParametre.corps.volumes, sans.corps.volumes);
    assert.ok(
      Object.values(sans.corps.volumes).some((n) => n > 0),
      'Un jeu vide rendrait cette comparaison décorative.',
    );
    assert.deepEqual(avecParametre.corps.data.risques, sans.corps.data.risques);
  });
});
