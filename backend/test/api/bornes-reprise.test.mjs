/**
 * bornes-reprise.test.mjs — la reprise est bornée, et le refus ne coûte rien.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Les constats **Q-19** et **Q-20** : une reprise n'avait pas de borne de volume,
 * et la chaîne de déploiement la coupe à 60 s. Un fichier trop gros était donc
 * travaillé pendant quarante secondes, puis interrompu par le frontal — sans que
 * personne n'apprenne jamais l'issue, et en occupant une connexion du pool
 * pendant tout ce temps. Dix reprises simultanées suffisaient à faire répondre
 * 500 à tout lecteur ordinaire.
 *
 * Le correctif tient en quatre propriétés, et l'agent qui l'a écrit a mesuré
 * lui-même que le banc ne le tenait pas : ses cinq mutations passaient toutes.
 * C'est l'état exact que le constat Q-21 reproche — un remède qui marche et que
 * rien ne retient. Les voici tenues :
 *
 *  1. la borne REFUSE, et son message dit le reçu ET l'admis ;
 *  2. à la borne exacte, la reprise passe et les lignes atterrissent ;
 *  3. le refus PRÉCÈDE la prise de connexion — sous pool saturé, un fichier
 *     hors borne reçoit toujours 413, quand un lecteur ordinaire reçoit 503 ;
 *  4. une connexion qui tombe n'écrit RIEN.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

import { exigerSilence } from '../aide/assertions.mjs';
import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { fichier, instantane } from '../reprise/jeux-essai.mjs';
import { monterGreffon, monterServeurReel, PerimetreFixe } from '../aide/serveur.mjs';

/** La borne publiée par le modèle, relue au démarrage plutôt que recopiée. */
let BORNE;
/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;

const lectureA = perimetre('temoin', FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  // Pool volontairement ÉTROIT : la saturation s'éprouve avec deux connexions
  // retenues, pas avec dix reprises simultanées qui coûteraient une minute.
  serveur = await monterServeurReel(base, { authentification: 'provisoire', env: { BASE_POOL_MAX: '2' } });

  const modele = await serveur.appeler('GET', '/api/modele');
  assert.equal(modele.statut, 200);
  BORNE = modele.corps.bornes?.lignesParReprise;
  assert.equal(
    typeof BORNE,
    'number',
    'La borne doit être PUBLIÉE par « /api/modele » : un client qui ne peut pas la lire ' +
      'ne peut pas scinder son fichier avant de l’envoyer.',
  );
  // ── La borne doit être VRAISEMBLABLE, et ce contrôle a été trouvé par sabotage ──
  //
  // Les essais fabriquent leurs fichiers À PARTIR de la borne publiée, pour ne pas
  // recopier une constante que le produit détient déjà. Portée à un milliard, cette
  // borne faisait fabriquer un milliard d'enregistrements : la mémoire du processus
  // partait avant toute assertion, et le fichier entier tombait sur une erreur qui ne
  // nommait rien. Un essai doit échouer en DISANT quoi, surtout quand il a raison.
  //
  // 20 000 est l'ordre de grandeur des autres bornes du modèle et le volume que
  // l'ancienne borne par collection laissait passer ; au-delà, ce n'est plus une
  // borne, et la chaîne de déploiement coupera à 60 s comme avant le correctif.
  assert.ok(
    BORNE > 0 && BORNE <= 20000,
    `Borne de reprise invraisemblable : ${String(BORNE)}. Une borne qui n’en est pas une ` +
      'rouvre le constat Q-19 — le travail est fait, puis interrompu par le frontal, et ' +
      'personne n’apprend l’issue.',
  );
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Un fichier `grc-backup` de `n` risques, tous marqués. */
function fichierDe(n, marque) {
  return fichier(12, instantane(12, {
    risques: Array.from({ length: n }, (_, i) => ({
      id: `RISK-${marque}-${String(i)}`,
      nom: `${marque} ${String(i)}`,
    })),
  }));
}

/** Envoie un fichier à la route de reprise, par `inject()`. */
function reprendre(n, marque) {
  return serveur.appeler('POST', '/api/reprise', {
    corps: { mode: 'fusionner', fichier: { nom: `${marque}.json`, contenu: fichierDe(n, marque) } },
  });
}

/** Lignes portant un marqueur, comptées par une connexion tierce. */
async function compter(marque) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, lectureA, async (c) =>
    Number((await c.query('select count(*)::int as n from risques where nom like $1', [`${marque} %`])).rows[0].n));
}

describe('La borne de volume de la reprise (constat Q-19)', () => {
  test('AU-DELÀ : refus 413, et le message dit le REÇU et l’ADMIS', async () => {
    // Un message qui dirait seulement « fichier trop gros » laisserait
    // l'exploitant deviner de combien scinder. Les deux nombres sont le remède.
    const recu = BORNE + 2400;
    const reponse = await reprendre(recu, 'HORS');

    assert.equal(reponse.statut, 413, JSON.stringify(reponse.corps).slice(0, 300));
    assert.equal(reponse.corps.erreur, 'volume_excessif');
    assert.match(reponse.corps.message, new RegExp(String(recu)), 'Le message doit dire ce qu’il a REÇU.');
    assert.match(reponse.corps.message, new RegExp(String(BORNE)), 'Et ce qu’il ADMET.');
    assert.match(
      reponse.corps.message,
      /rien n’a été modifié|rien n'a été modifié/i,
      'Et que le refus est total : une reprise à moitié appliquée serait le pire des états.',
    );
    assert.equal(await compter('HORS'), 0, 'Un refus de volume n’écrit rien.');
  });

  test('À LA BORNE EXACTE : la reprise passe, et les lignes SONT en base', async () => {
    // ── Pourquoi la borne exacte, et non « un fichier raisonnable » ──────────
    //
    // Un essai qui accepterait 200 enregistrements ne dirait rien de l'endroit
    // où la borne se trouve : elle pourrait valoir 300 ou un milliard, il
    // resterait vert. Le couple « BORNE acceptée / BORNE+1 refusée » dit les
    // deux à la fois, pour le même prix, et il tombe aussi bien quand on relâche
    // la borne que quand on la resserre.
    const dedans = await reprendre(BORNE, 'DANS');
    assert.equal(dedans.statut, 200, JSON.stringify(dedans.corps).slice(0, 300));
    assert.equal(dedans.corps.bilan.crees.risques, BORNE);
    assert.equal(
      await compter('DANS'),
      BORNE,
      'Ce que le bilan annonce doit être ce que la base porte : c’est la leçon du bloquant T-1.',
    );

    const juste = await reprendre(BORNE + 1, 'JUSTE');
    assert.equal(juste.statut, 413, `Un enregistrement de plus doit être refusé : ${JSON.stringify(juste.corps).slice(0, 200)}`);
    assert.equal(await compter('JUSTE'), 0);
  });
});

describe('Le refus PRÉCÈDE la prise de connexion (constat Q-20)', () => {
  /** Retient `n` connexions du pool, joue quelque chose, puis les rend. */
  async function poolSature(action) {
    const retenues = [];
    try {
      // Le pool est monté à 2 : deux prises suffisent à le remplir.
      retenues.push(await serveur.pool.connect());
      retenues.push(await serveur.pool.connect());
      return await action();
    } finally {
      for (const client of retenues) client.release();
    }
  }

  test('POOL SATURÉ : un fichier hors borne reçoit 413, un lecteur ordinaire 503', async () => {
    // ── La propriété, énoncée sans délai ────────────────────────────────────
    //
    // On pourrait mesurer que le refus arrive « en moins d'une seconde ». Ce
    // serait vrai, et fragile : une machine chargée le rendrait faux sans qu'une
    // seule propriété ait bougé. La forme robuste est un STATUT — sous un pool
    // entièrement occupé, un fichier hors borne reçoit quand même son 413, ce
    // qui n'est possible que si le refus n'a demandé aucune connexion. Le même
    // essai mesure la contre-épreuve : un lecteur ordinaire, lui, reçoit 503.
    const { horsBorne, lecteur } = await poolSature(async () => ({
      horsBorne: await reprendre(BORNE + 2400, 'SATURE'),
      lecteur: await serveur.appeler('GET', '/api/donnees'),
    }));

    assert.equal(
      horsBorne.statut,
      413,
      'Un fichier hors borne doit être refusé SANS connexion : sinon chaque refus fait ' +
        `attendre les autres, et c’est le constat Q-20. Reçu : ${JSON.stringify(horsBorne.corps).slice(0, 200)}`,
    );
    assert.equal(horsBorne.corps.erreur, 'volume_excessif');
    assert.equal(await compter('SATURE'), 0);

    // ── Q-20 : la saturation SE DIT, elle ne se déguise pas en panne ────────
    assert.equal(
      lecteur.statut,
      503,
      `Un pool plein est un état passager : il se rend en 503, jamais en 500 « erreur ` +
        `interne » — le navigateur ne reconnaîtrait pas qu’il peut réessayer. ` +
        `Reçu : ${JSON.stringify(lecteur.corps).slice(0, 200)}`,
    );
    assert.equal(lecteur.corps.erreur, 'indisponible');
    assert.match(lecteur.corps.message, /réessayez/i, 'Et le message dit quoi faire.');
    // ── Le motif, resserré, et l'assertion qui DIT CE QU'ELLE A VU ────────
    //
    // Constat **Q-105** : cet essai a rougi une fois sur deux exécutions
    // complètes du banc, sur cette assertion précise, et **il n'a pas été
    // possible de savoir ce qui avait fui** — le message ne portait pas le
    // corps. L'enquête a coûté une demi-heure de lecture de sources pour
    // finir sans réponse.
    //
    // Deux corrections, et la seconde est la plus utile :
    //
    //  1. **« connexion » sort du motif.** C'est un mot français ordinaire dans
    //     une phrase destinée à un utilisateur — « la connexion est
    //     momentanément impossible » ne nomme aucun rouage. Le contrôle S12
    //     interdit d'exposer la MACHINERIE (`pool`, `pg`, `postgres`,
    //     `pgbouncer`, un code `ECONNREFUSED`), pas d'employer un mot que le
    //     lecteur comprend. Un motif trop large finit par accuser le produit
    //     d'un défaut qu'il n'a pas, et c'est ainsi qu'on apprend à rejouer
    //     jusqu'au vert.
    //  2. **Le corps est imprimé quand ça rougit.** Un essai qui échoue sans
    //     dire ce qu'il a vu transforme chaque rougissement en enquête. Celui-ci
    //     l'a fait une fois ; il ne le refera pas.
    const rouages = /\bpool\b|\bpg\b|postgres|pgbouncer|ECONNREFUSED|ETIMEDOUT/i;
    assert.equal(
      rouages.test(JSON.stringify(lecteur.corps)),
      false,
      'Un rouage interne est nommé dans une réponse rendue au client (contrôle S12). ' +
        `Corps reçu : ${JSON.stringify(lecteur.corps)}`,
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : au repos, le même lecteur passe, et jamais en 503', async () => {
    // Sans cette moitié, l'essai précédent serait satisfait par un serveur qui
    // rend 503 en toutes circonstances — c'est-à-dire par un serveur en panne.
    const lecteur = await serveur.appeler('GET', '/api/donnees');
    assert.equal(lecteur.statut, 200, JSON.stringify(lecteur.corps).slice(0, 200));
    assert.equal(Array.isArray(lecteur.corps.data.risques), true);
  });
});

describe('Une connexion qui tombe n’écrit rien (constat Q-19)', () => {
  /**
   * Attend que le serveur ait FINI de traiter la requête abandonnée.
   *
   * ── Pourquoi ce n'est pas une attente de durée ───────────────────────────
   *
   * La rédaction attendue était « trois fois la durée pleine mesurée ». Elle est
   * juste et elle est fragile : sur une machine plus lente, l'essai conclut
   * « rien n'a été écrit » alors qu'il a seulement regardé trop tôt. Ce serait
   * un décor de la meilleure espèce — vert, plausible, et faux.
   *
   * On attend donc un ÉVÉNEMENT, et le produit en offre un : la connexion que la
   * reprise a prise au pool. Tant qu'elle est tenue, la transaction est en
   * cours ; quand elle revient, la transaction est finie — validée ou défaite —
   * et il n'y a plus rien à attendre. L'attente ne dépend d'aucune vitesse, et
   * elle ne peut pas conclure trop tôt. Elle reste bornée par sécurité, et cette
   * borne ÉCHOUE bruyamment plutôt que de laisser croire à une réussite.
   */
  async function attendreFinDeTraitement(delai = 30000) {
    const occupees = () => serveur.pool.totalCount - serveur.pool.idleCount;
    const echeance = Date.now() + delai;
    let stables = 0;
    while (Date.now() < echeance) {
      await new Promise((resoudre) => setTimeout(resoudre, 200));
      stables = occupees() === 0 ? stables + 1 : 0;
      if (stables >= 2) return;
    }
    throw new Error(
      `Le serveur tient encore ${String(occupees())} connexion(s) après ${String(delai)} ms : ` +
        'la reprise abandonnée n’a jamais été défaite, et l’essai ne peut rien conclure.',
    );
  }

  test('ABANDON en cours de reprise : ZÉRO ligne écrite', async () => {
    // ── Il faut un VRAI port ────────────────────────────────────────────────
    // `inject()` n'ouvre pas de socket : il n'y a donc pas de fermeture à
    // observer, et le témoin d'abandon ne se déclencherait jamais. L'essai
    // écoute pour de bon, et coupe pour de bon.
    const url = await serveur.ecouter();
    const envoyer = (marque, signal) =>
      fetch(`${url}/api/reprise`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'fusionner',
          fichier: { nom: `${marque}.json`, contenu: fichierDe(2000, marque) },
        }),
        ...(signal === undefined ? {} : { signal }),
      });

    // ── Moitié symétrique, jouée EN PREMIER ─────────────────────────────────
    // Le même fichier, sans abandon, DOIT aboutir. Sans elle, « zéro ligne »
    // serait satisfait par une route qui n'écrit jamais rien.
    const complet = await envoyer('COMPLET');
    assert.equal(complet.status, 200, `La reprise non abandonnée doit aboutir : ${await complet.text()}`);
    assert.equal(await compter('COMPLET'), 2000, 'Et ses 2 000 lignes doivent être en base.');

    // ── L'abandon ───────────────────────────────────────────────────────────
    // Une demi-seconde : assez pour que la transaction soit engagée — la reprise
    // complète ci-dessus a duré plusieurs secondes —, trop peu pour qu'elle
    // s'achève.
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 500);
    let issue = 'aboutie';
    try {
      await envoyer('ABANDON', controleur.signal);
    } catch (erreur) {
      issue = erreur.name;
    } finally {
      clearTimeout(minuteur);
    }
    assert.equal(issue, 'AbortError', 'Le scénario EXIGE que le client soit parti avant la réponse.');

    // On attend que le serveur ait fini — l'événement, pas un délai.
    await attendreFinDeTraitement();

    assert.equal(
      await compter('ABANDON'),
      0,
      'Une reprise dont le client est parti ne doit RIEN laisser : la moitié d’un fichier ' +
        'appliquée est le pire état possible pour un registre qui sert de preuve en audit.',
    );
  });
});

/* =====================================================================
 *  Le client parti AVANT la transaction (constats Q-19 / Q-38)
 * ---------------------------------------------------------------------
 *  L'essai ci-dessus tient le contrôle d'abandon **d'avant validation** : le
 *  client part pendant la transaction, et rien n'est écrit. Il ne tient PAS
 *  l'autre, celui d'avant transaction — le 7ᵉ passage l'a mesuré : mutation
 *  appliquée, banc vert 172/172 (constat **Q-38**).
 *
 *  ── Pourquoi le second ne se laissait pas prendre par le premier ──────────
 *
 *  Parce que les deux produisent le MÊME résultat visible : 503, zéro ligne.
 *  Retirer le contrôle d'avant transaction ne perd aucune donnée ; cela coûte
 *  une **connexion du pool** et une transaction ouverte pour rien — exactement
 *  ce que le constat Q-20 fait payer aux autres utilisateurs. Une assertion sur
 *  les lignes écrites ne pouvait donc pas mordre, et n'a pas mordu.
 *
 *  Ce que cet essai observe est ce qui les distingue vraiment :
 *
 *   1. le **journal** — seule trace quand le client n'est plus là pour lire —
 *      dit `moment: "avant transaction"` et non `"avant validation"` ;
 *   2. **aucune connexion n'est prise au pool** après l'abandon.
 *
 *  ── Et comment l'instant est maîtrisé, plutôt que couru ───────────────────
 *
 *  Entre l'entrée du gestionnaire et le contrôle, il n'y a que deux `await` :
 *  viser cette fenêtre avec un minuteur serait un pari, et un essai qui parie
 *  est un décor. On la tient donc ouverte par le SEUL point d'extension prévu —
 *  le résolveur de périmètre, point d'accroche du lot L3 — dont le contrat est
 *  scrupuleusement respecté : `resoudre()` ne prend toujours aucun argument.
 * ===================================================================== */

/**
 * Porte qui s'annonce puis ATTEND, une fois, qu'on la laisse passer.
 *
 * ══ Pourquoi elle a changé de place — et ce que le banc a attrapé ═══════
 *
 * Elle était portée par le **résolveur de périmètre** : le gestionnaire de la
 * reprise appelait `resoudre()` juste après avoir posé son témoin d'abandon, et
 * l'essai s'y accrochait. C'était le seul point d'extension prévu, et c'était
 * vrai tant que la route était le premier code à s'exécuter.
 *
 * La condition d'entrée **E4** l'a déplacé : le contrôle d'authentification
 * s'exerce désormais en `onRequest`, **avant l'analyse du corps**, et c'est là
 * que le résolveur est appelé. Une porte posée sur lui bloque donc *avant* que
 * le corps soit lu — et un client qui s'en va à cet instant fait échouer
 * l'analyse du corps, si bien que le gestionnaire n'est jamais atteint et que
 * la ligne de journal attendue ne vient plus. Ce fichier a expiré à 20 s, et
 * c'est ainsi que le réordonnancement s'est vu.
 *
 * Elle est donc posée là où le gestionnaire commence vraiment : un crochet
 * `preValidation`, ajouté par l'essai sur l'instance **parente**. L'ordre des
 * phases de Fastify le garantit — analyse du corps, puis `preValidation`, puis
 * le gestionnaire — et il ne dépend d'aucune ligne du produit.
 *
 * Ce que l'essai éprouve n'a pas bougé d'un pouce : *un client déjà parti ne
 * fait pas prendre une connexion au pool, et le journal dit lequel des deux
 * contrôles a tranché.*
 */
class PorteDeGestionnaire {
  constructor() {
    this.appels = 0;
    this._porte = null;
    this._annoncer = null;
  }

  /** Arme UN retard. Rend `{ entre, ouvrir }` : `entre` se résout quand le
   *  gestionnaire est arrivé jusqu'ici — donc après `surveillerAbandon`. */
  armer() {
    let ouvrir;
    let annoncer;
    const porte = new Promise((resoudre) => {
      ouvrir = resoudre;
    });
    const entre = new Promise((resoudre) => {
      annoncer = resoudre;
    });
    this._porte = porte;
    this._annoncer = annoncer;
    return { entre, ouvrir: () => ouvrir() };
  }

  /** Le crochet à poser sur l'instance parente. */
  crochet() {
    return async () => {
      this.appels += 1;
      if (this._porte !== null) {
        const porte = this._porte;
        this._porte = null;        // un seul appel est retenu : le suivant passe
        this._annoncer();
        await porte;
      }
    };
  }
}

describe('Un client déjà parti ne prend pas de connexion (constats Q-19 / Q-38)', () => {
  const journal = [];
  const socketsServeur = [];
  let greffon;
  let socle;
  let porteGestionnaire;
  let url;
  /** Nombre d'appels à `pool.connect()` — le coût que le contrôle évite. */
  let prises = 0;

  before(async () => {
    const perimetreSession = {
      utilisateurId: 'reprise-abandon',
      filialeId: FILIALE_A,
      filiales: [FILIALE_A],
      perimetreGroupe: false,
      administrationGroupe: false,
    };
    porteGestionnaire = new PorteDeGestionnaire();

    // Un premier montage sert de SOCLE : il rend le pool et la configuration
    // réels du banc, sans que cet essai ait à recopier l'environnement de test
    // — ce qui en ferait une seconde source de vérité pour les mêmes valeurs.
    socle = await monterGreffon(base, perimetreSession);

    const { default: Fastify } = await import('fastify');
    const { greffonApi } = await import(
      `file://${(await import('../aide/serveur.mjs')).RACINE_BACKEND}/dist/api/index.js`
    );
    const instance = Fastify({
      bodyLimit: socle.config.serveur.tailleMaxCorpsOctets,
      logger: {
        level: 'warn',
        stream: {
          write(ligne) {
            try {
              journal.push(JSON.parse(ligne));
            } catch {
              journal.push({ msg: String(ligne) });
            }
          },
        },
      },
    });
    // La porte, à l'endroit où le gestionnaire commence : après l'analyse du
    // corps, avant le gestionnaire. Posée sur l'instance PARENTE, elle vaut
    // pour les routes du greffon sans que celui-ci en sache rien.
    instance.addHook('preValidation', porteGestionnaire.crochet());
    await instance.register(greffonApi, {
      pool: socle.pool,
      config: socle.config,
      resolveur: new PerimetreFixe(perimetreSession),
    });
    await instance.ready();

    let adresse = null;
    greffon = {
      instance,
      config: socle.config,
      pool: socle.pool,
      async ecouter() {
        if (adresse !== null) return adresse;
        await instance.listen({ host: '127.0.0.1', port: 0 });
        adresse = `http://127.0.0.1:${instance.server.address().port}`;
        return adresse;
      },
      async fermer() {
        instance.server.closeAllConnections?.();
        await instance.close().catch(() => {});
      },
    };

    const connecter = greffon.pool.connect.bind(greffon.pool);
    greffon.pool.connect = (...arguments_) => {
      prises += 1;
      return connecter(...arguments_);
    };
    greffon.instance.server.on('connection', (socket) => socketsServeur.push(socket));
    url = await greffon.ecouter();
  });

  after(async () => {
    await greffon?.fermer();
    await socle?.fermer();
  });

  /**
   * Envoie une reprise sur un VRAI port, sans connexion réutilisée.
   *
   * `inject()` n'ouvre pas de socket : il n'y a rien à couper, et le témoin
   * d'abandon ne se déclencherait jamais. `agent: false` garantit en plus une
   * connexion neuve par requête — sans quoi la socket à surveiller serait celle
   * d'un essai précédent.
   */
  function envoyer(marque, n) {
    const corps = JSON.stringify({
      mode: 'fusionner',
      fichier: { nom: `${marque}.json`, contenu: fichierDe(n, marque) },
    });
    const requete = http.request(`${url}/api/reprise`, {
      method: 'POST',
      agent: false,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(corps) },
    });
    const fini = new Promise((resoudre) => {
      requete.on('response', (reponse) => {
        let texte = '';
        reponse.on('data', (morceau) => {
          texte += morceau;
        });
        reponse.on('end', () => resoudre({ statut: reponse.statusCode, texte }));
      });
      requete.on('error', () => resoudre({ statut: 0, texte: '' }));
    });
    requete.end(corps);
    return { requete, fini };
  }

  /** Attend qu'une condition devienne vraie, et ÉCHOUE bruyamment sinon. */
  async function attendreQue(condition, quoi, delai = 20000) {
    const echeance = Date.now() + delai;
    while (Date.now() < echeance) {
      if (condition()) return;
      await new Promise((resoudre) => setTimeout(resoudre, 50));
    }
    throw new Error(`Jamais observé en ${String(delai)} ms : ${quoi}`);
  }

  /** La ligne « Reprise ANNULÉE » du journal, attendue puis rendue. */
  async function attendreAbandonJournalise(depuis) {
    let ligne = null;
    await attendreQue(
      () => {
        ligne = journal.slice(depuis).find((l) => /Reprise ANNUL/i.test(String(l.msg ?? '')));
        return ligne !== undefined && ligne !== null;
      },
      'la ligne de journal « Reprise ANNULÉE ». Quand le client est parti, le journal est ' +
        'la SEULE trace de ce que le serveur a décidé : sans elle, un exploitant à qui l’on ' +
        'signale un import « perdu » n’a rien à retrouver.',
    );
    return ligne;
  }

  test('NOMINAL : personne ne part, la reprise aboutit et le journal se tait', async () => {
    // Moitié symétrique, jouée EN PREMIER — et elle sert deux fois : elle
    // réchauffe le dépôt (le catalogue n'est chargé qu'une fois, et son
    // chargement prend une connexion qu'on ne veut pas compter plus loin), et
    // elle prouve que la route écrit quand personne ne s'en va.
    const depuis = journal.length;
    const avant = prises;

    const { fini } = envoyer('NOMINAL', 300);
    const reponse = await fini;

    assert.equal(reponse.statut, 200, `Une reprise que personne n’abandonne doit aboutir : ${reponse.texte.slice(0, 300)}`);
    assert.equal(await compter('NOMINAL'), 300, 'Et ses 300 lignes doivent être en base.');
    assert.ok(
      prises > avant,
      'Le compteur de connexions doit BOUGER sur une reprise ordinaire : sans cela, ' +
        '« aucune connexion prise » plus bas serait vrai d’un compteur en panne.',
    );
    exigerSilence(
      JSON.stringify(journal.slice(depuis)),
      /Reprise ANNUL/i,
      'ABANDON AVANT TRANSACTION : le journal dit « avant transaction », et rien n’est pris au pool',
    );
  });

  test('ABANDON AVANT TRANSACTION : le journal dit « avant transaction », et rien n’est pris au pool', async () => {
    const depuis = journal.length;
    const socketsAvant = socketsServeur.length;

    // 1. La porte est armée : le gestionnaire ira jusqu'au résolveur, et
    //    s'arrêtera là — c'est-à-dire APRÈS avoir posé son témoin d'abandon,
    //    et AVANT le contrôle qu'on éprouve.
    const porte = porteGestionnaire.armer();
    const { requete, fini } = envoyer('AVANT', 300);
    await porte.entre;

    // 2. Le client s'en va. On attend la fermeture vue DU CÔTÉ SERVEUR : c'est
    //    elle que `surveillerAbandon` écoute, et la voir depuis le client ne
    //    prouverait rien de ce que le serveur a appris.
    await attendreQue(
      () => socketsServeur.length > socketsAvant,
      'la connexion ouverte par cette requête, côté serveur',
    );
    const socket = socketsServeur[socketsServeur.length - 1];
    const fermee = new Promise((resoudre) => socket.on('close', () => resoudre()));
    requete.destroy();
    await fermee;
    await fini;

    // 3. On laisse le gestionnaire repartir. Tout ce qui suit lui appartient.
    const prisesAvant = prises;
    porte.ouvrir();

    const ligne = await attendreAbandonJournalise(depuis);
    assert.equal(
      ligne.moment,
      'avant transaction',
      'Le contrôle qui a tranché doit être celui d’AVANT la transaction. « avant validation » ' +
        'signifierait que le serveur a ouvert une transaction pour un client déjà parti — ' +
        'même résultat visible, et tout le coût du constat Q-20. Vu : ' +
        JSON.stringify(ligne).slice(0, 300),
    );
    assert.equal(ligne.fichier, 'AVANT.json', 'Et il doit nommer le fichier concerné.');

    assert.equal(
      prises,
      prisesAvant,
      `Aucune connexion ne doit être prise au pool après l’abandon : le refus qui coûte une ` +
        `connexion est exactement celui que Q-20 fait payer aux autres. Prises : ` +
        `${String(prises - prisesAvant)}.`,
    );
    assert.equal(await compter('AVANT'), 0, 'Et rien n’est écrit, évidemment.');
  });

  test('ABANDON APRÈS L’ENTRÉE EN TRANSACTION : le journal dit « avant validation »', async () => {
    // ── La moitié qui rend la précédente discriminante ──────────────────────
    //
    // Sans elle, « le journal dit avant transaction » serait satisfait par un
    // produit qui écrirait toujours ce mot-là — y compris quand la transaction
    // est déjà ouverte. Les deux valeurs de `moment` existent, elles se
    // distinguent, et c'est ce qui donne son mordant à l'essai d'au-dessus.
    //
    // L'instant du départ n'est pas couru non plus : on attend l'ÉVÉNEMENT
    // « une connexion vient d'être prise au pool », qui ne peut se produire
    // qu'au-delà du contrôle d'avant transaction.
    const depuis = journal.length;
    const avant = prises;
    const { requete, fini } = envoyer('APRES', 2500);

    await attendreQue(
      () => prises > avant,
      'la prise de connexion au pool, qui marque l’entrée en transaction',
    );
    requete.destroy();
    await fini;

    const ligne = await attendreAbandonJournalise(depuis);
    assert.equal(
      ligne.moment,
      'avant validation',
      `Un client parti APRÈS l’ouverture de la transaction doit être vu par l’autre contrôle. ` +
        `Vu : ${JSON.stringify(ligne).slice(0, 300)}`,
    );
    assert.equal(await compter('APRES'), 0, 'Et la transaction est défaite : zéro ligne.');
  });
});
