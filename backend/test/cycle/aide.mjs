/**
 * aide.mjs — monter les routes du lot L13 **sur le vrai greffon d'API**.
 *
 * ── Le montage, et pourquoi il est conditionnel ──────────────────────────────
 *
 * `src/api/index.ts` appartient à l'orchestrateur. Au moment où ce lot est écrit,
 * la ligne `register(greffonCycle, { pool })` n'y est pas encore ; elle est
 * promise, mot pour mot. Ce fichier pose donc lui-même le greffon — **exactement
 * comme `test/approbations/aide.mjs` et `test/journal-lecture/aide.mjs` l'ont fait
 * avant que leur couture soit branchée**.
 *
 * Ce précédent a coûté un échec de banc le jour où la couture est arrivée :
 * *« Method 'POST' already declared for route … »*. On ne le reproduit pas. Le
 * montage **sonde** d'abord, sur une instance jetable, si `greffonApi` monte déjà
 * les routes du cycle :
 *
 *  · **non** → ce fichier les pose, et les essais valent contre le greffon tel
 *    qu'il sera monté (mêmes crochets, même traitement d'erreur) ;
 *  · **oui** → il ne pose rien, et les essais passent par le chemin du produit,
 *    ce qui est **plus fort** : la ligne d'enregistrement devient elle-même
 *    éprouvée, et sa disparition ferait rougir toute cette famille.
 *
 * La sonde est nécessaire parce que Fastify enregistre les greffons enfants
 * **paresseusement**, à `ready()` : avant lui, `hasRoute` ne voit rien de ce que
 * `greffonApi` enregistre par `register()`.
 *
 * ── Ce que le montage NE simule pas ──────────────────────────────────────────
 *
 * Rien. `greffonApi` est appelé sur une instance Fastify réelle : les requêtes
 * passent par le crochet `onRequest` du produit — rythme, identité, filiale
 * active, `deciderAcces` sur la déclaration de la route, exigence de périmètre —
 * puis par le traitement d'erreur réel. Seule la **session** est fournie par le
 * banc, et son contrat est respecté à la lettre : `resoudre()` ne prend aucun
 * argument, et rien ici ne lit la requête.
 */

import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/** Les deux chemins du lot, **lus dans le module** et jamais recopiés. */
export async function cheminsDuLot() {
  const cycle = await moduleCompile('cycle/index.js');
  return { sortie: cycle.CHEMIN_SORTIE, purge: cycle.CHEMIN_PURGE };
}

/**
 * Session d'essai : elle résout un périmètre **et** dit quels droits
 * l'accompagnent.
 *
 * Volontairement locale plutôt qu'importée d'une autre famille : plusieurs agents
 * travaillent en parallèle sur ce dépôt, et une famille qui rougit parce qu'un
 * autre lot a touché son harnais fait chercher un défaut là où il n'y en a pas.
 */
export class SessionDEssai {
  constructor(perimetre, droits) {
    this.provisoire = false;
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

  /** Change la session entre deux appels. Jamais depuis une requête. */
  poser(perimetre, droits) {
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return { perimetre: this._perimetre, droits: this._droits };
  }

  decrire() {
    return 'session fixée par le banc d’essai (test/cycle/aide.mjs)';
  }
}

/**
 * Monte `greffonApi`, plus `greffonCycle` s'il n'est pas déjà monté.
 *
 * @param {{nom: string}} base base d'essai ouverte par `ouvrirBaseEssai`
 * @param {SessionDEssai} session
 */
export async function monterCycle(base, session) {
  const { default: Fastify } = await import('fastify');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');
  const { greffonCycle, CHEMIN_SORTIE, CHEMIN_PURGE } = await moduleCompile('cycle/index.js');

  // Instance jetable : elle sert deux fois — à obtenir la configuration sans en
  // recopier la vingtaine de variables d'environnement, et à SAVOIR si la couture
  // est branchée. Deux copies d'un même réglage finissent par ne plus dire la
  // même chose.
  const sonde = await monterGreffon(base, {
    utilisateurId: 'systeme',
    filialeId: null,
    filiales: [],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
  const config = sonde.config;
  const dejaMonte = sonde.instance.hasRoute({ method: 'POST', url: CHEMIN_SORTIE });
  await sonde.fermer();

  const pool = creerPool(config.base);
  const instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });

  /** Déclarations lues chez Fastify, jamais recopiées. */
  const routes = [];
  const toutesRoutes = [];
  instance.addHook('onRoute', (route) => {
    const vue = { methode: route.method, url: route.url, acces: route.config?.acces };
    toutesRoutes.push(vue);
    if (typeof route.url === 'string' && route.url.startsWith('/api/cycle')) routes.push(vue);
  });

  await greffonApi(instance, { pool, config, resolveur: session, authentificateur: session });
  if (!dejaMonte) await instance.register(greffonCycle, { pool });
  await instance.ready();

  return {
    instance,
    config,
    pool,
    routes,
    toutesRoutes,
    chemins: { sortie: CHEMIN_SORTIE, purge: CHEMIN_PURGE },
    /** Vrai si `src/api/index.ts` monte déjà le greffon (couture branchée). */
    coutureBranchee: dejaMonte,

    /** `inject()` : rend `{ statut, entetes, corps }`, `corps` décodé si JSON. */
    async appeler(methode, url, options = {}) {
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
          /* Réponse annoncée JSON mais illisible : c'est un constat en soi. */
        }
      }
      return { statut: reponse.statusCode, entetes: reponse.headers, corps };
    },

    async fermer() {
      instance.server.closeAllConnections?.();
      await instance.close().catch(() => {});
      await pool.end().catch(() => {});
    },
  };
}

/* =====================================================================
 *  Profils et périmètres d'essai
 * ===================================================================== */

/** Profil au format de `DroitsSession` (`src/api/droits.ts`). */
export const profil = (niveau, options = {}) =>
  Object.freeze({
    niveau,
    domaines: options.domaines ?? ['administration', 'personnel', 'pilotage'],
    export: options.export ?? false,
  });

/** Périmètre au format du PRODUIT (`src/db/pool.ts`). */
export const perimetreDe = (utilisateur, filialeActive, filiales, options = {}) =>
  Object.freeze({
    utilisateurId: utilisateur,
    filialeId: filialeActive,
    filiales: [...filiales],
    perimetreGroupe: options.perimetreGroupe ?? false,
    administrationGroupe: options.administrationGroupe ?? false,
  });

/* =====================================================================
 *  Lectures directes, hors de l'API
 * ===================================================================== */

/**
 * Lit sous le compte PROPRIÉTAIRE, avec un périmètre explicite.
 *
 * ⚠️ Le périmètre n'est pas une commodité : toutes les tables métier portent
 * `force row level security`, si bien que **le propriétaire lui-même** reçoit
 * `GRC04` s'il lit sans avoir posé `grc.filiales`. Il est donc toujours posé,
 * et **large** : un essai de cloisonnement doit pouvoir constater ce qui existe
 * chez la voisine, sans quoi son « rien n'a fui » vaudrait pour une table vide.
 */
export async function lireEnBase(base, proprietaire, texte, valeurs = [], p = {}) {
  return await base.avecPerimetre(
    proprietaire,
    {
      utilisateur: p.utilisateur ?? 'observateur',
      filialeId: p.filialeId ?? null,
      filiales: p.filiales ?? [],
      administrationGroupe: p.administrationGroupe ?? false,
    },
    async (c) => (await c.query(texte, valeurs)).rows,
  );
}

/** Première colonne de la première ligne, ou `undefined`. */
export async function valeurEnBase(base, proprietaire, texte, valeurs = [], p = {}) {
  const lignes = await lireEnBase(base, proprietaire, texte, valeurs, p);
  return lignes.length === 0 ? undefined : Object.values(lignes[0])[0];
}
