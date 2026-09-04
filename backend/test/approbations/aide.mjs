/**
 * aide.mjs — monter le circuit d'approbation **sur le vrai greffon d'API**.
 *
 * ── Le montage, et pourquoi il est conditionnel ──────────────────────────────
 *
 * `src/api/index.ts` appartient à l'orchestrateur : au moment où ce lot est
 * écrit, la ligne `register(greffonApprobations, { pool })` n'y est pas encore.
 * Ce fichier pose donc lui-même le greffon — **exactement comme
 * `test/journal-lecture/aide.mjs` l'a fait avant que sa couture soit branchée**.
 *
 * Ce précédent a coûté un échec de banc le jour où la couture est arrivée :
 * *« Method 'GET' already declared for route '/api/journal' »*. On ne le
 * reproduit pas. Le montage **sonde** d'abord, sur une instance jetable, si
 * `greffonApi` monte déjà les routes d'approbation :
 *
 *  · **non** → ce fichier les pose, et les essais valent contre le greffon tel
 *    qu'il sera monté (mêmes crochets, même traitement d'erreur) ;
 *  · **oui** → il ne pose rien, et les essais passent alors par le chemin du
 *    produit, ce qui est **plus fort** : la ligne d'enregistrement devient
 *    elle-même éprouvée, et sa disparition ferait rougir toute cette famille.
 *
 * La sonde est nécessaire parce que Fastify enregistre les greffons enfants
 * **paresseusement**, à `ready()` : avant lui, `hasRoute` ne voit rien de ce que
 * `greffonApi` enregistre par `register()`. On monte donc une instance jetable
 * jusqu'à `ready()`, on regarde, et on la ferme.
 *
 * ── Ce que le montage NE simule pas ──────────────────────────────────────────
 *
 * Rien. `greffonApi` est appelé sur une instance Fastify réelle : les requêtes
 * passent par le crochet `onRequest` du produit — rythme, identité, filiale
 * active, `deciderAcces` sur la déclaration de la route, exigence de périmètre —
 * puis par le crochet de niveau du greffon des approbations, puis par le
 * traitement d'erreur réel (celui qui garantit qu'aucun message de PostgreSQL ne
 * sort). Seule la **session** est fournie par le banc, et son contrat est
 * respecté à la lettre : `resoudre()` ne prend aucun argument, et rien ici ne
 * lit la requête.
 */

import { FILIALE_A, FILIALE_B } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/**
 * Le chemin des deux routes du lot, tel que Fastify le nomme. `GET` et `POST`
 * le partagent : c'est la même ressource, lue puis avancée.
 */
export const CHEMIN = '/api/approbations/:entite/:entiteId';

/**
 * Session d'essai : elle résout un périmètre **et** dit quels droits
 * l'accompagnent.
 *
 * Volontairement locale plutôt qu'importée de `test/journal-lecture/aide.mjs` :
 * trois agents travaillent en parallèle sur ce dépôt, et une famille d'essais
 * qui rougit parce qu'un autre lot a touché son harnais fait chercher un défaut
 * là où il n'y en a pas. La classe tient en vingt lignes ; le couplage, lui,
 * aurait duré.
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
    return 'session fixée par le banc d’essai (test/approbations/aide.mjs)';
  }
}

/**
 * Monte `greffonApi`, plus `greffonApprobations` s'il n'est pas déjà monté.
 *
 * @param {{nom: string}} base base d'essai ouverte par `ouvrirBaseEssai`
 * @param {SessionDEssai} session
 */
export async function monterApprobations(base, session) {
  const { default: Fastify } = await import('fastify');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');
  const { greffonApprobations } = await moduleCompile('approbations/index.js');

  // Instance jetable : elle sert deux fois — à obtenir la configuration sans en
  // recopier la vingtaine de variables d'environnement, et à SAVOIR si la
  // couture est branchée. Deux copies d'un même réglage finissent par ne plus
  // dire la même chose.
  const sonde = await monterGreffon(base, {
    utilisateurId: 'systeme',
    filialeId: null,
    filiales: [],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
  const config = sonde.config;
  const dejaMonte = sonde.instance.hasRoute({ method: 'GET', url: CHEMIN });
  await sonde.fermer();

  const pool = creerPool(config.base);
  const instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });

  /** Déclarations lues chez Fastify, jamais recopiées. */
  const routes = [];
  const toutesRoutes = [];
  instance.addHook('onRoute', (route) => {
    const vue = {
      methode: route.method,
      url: route.url,
      acces: route.config?.acces,
      niveauMinimal: route.config?.niveauMinimal,
    };
    toutesRoutes.push(vue);
    if (typeof route.url === 'string' && route.url.startsWith('/api/approbations')) routes.push(vue);
  });

  await greffonApi(instance, { pool, config, resolveur: session, authentificateur: session });
  if (!dejaMonte) await instance.register(greffonApprobations, { pool });
  await instance.ready();

  return {
    instance,
    config,
    pool,
    routes,
    /** Toutes les routes montées, y compris hors du greffon des approbations. */
    toutesRoutes,
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
 *  Profils d'essai — les quatre niveaux, sur les trois domaines du lot
 * ===================================================================== */

const DOMAINES_L8 = Object.freeze(['documents', 'risques', 'audits']);

/** Profil au format de `DroitsSession` (`src/api/droits.ts`). */
export const profil = (niveau, options = {}) =>
  Object.freeze({
    niveau,
    domaines: options.domaines ?? DOMAINES_L8,
    export: options.export ?? false,
    ...(options.niveaux === undefined ? {} : { niveaux: Object.freeze({ ...options.niveaux }) }),
  });

/** Périmètre au format du PRODUIT (`src/db/pool.ts`). */
export const sessionSite = (filiale, utilisateur = 'rssi.toulouse') =>
  Object.freeze({
    utilisateurId: utilisateur,
    filialeId: filiale,
    filiales: [filiale],
    perimetreGroupe: false,
    administrationGroupe: false,
  });

/** Périmètre Groupe : lit les deux filiales, écrit dans la première. */
export const sessionGroupe = (filialeActive, filiales, utilisateur = 'rssi.groupe') =>
  Object.freeze({
    utilisateurId: utilisateur,
    filialeId: filialeActive,
    filiales: [...filiales],
    perimetreGroupe: true,
    administrationGroupe: false,
  });

/* =====================================================================
 *  Lectures directes, hors de l'API
 * ===================================================================== */

/**
 * Toutes les étapes écrites pour un objet, **vues du propriétaire, sous un
 * périmètre de lecture qui couvre les deux filiales**.
 *
 * ⚠️ Le périmètre n'est pas une commodité : `approbations` porte
 * `force row level security`, si bien que **le propriétaire lui-même** est
 * soumis aux politiques et reçoit `GRC04` s'il lit sans avoir posé
 * `grc.filiales`. C'est mesuré, pas supposé — la première rédaction de cette
 * aide lisait sans périmètre et le banc a rendu « Périmètre non positionné ».
 *
 * Le périmètre est donc **explicite et large** (les deux filiales) : un essai de
 * cloisonnement doit pouvoir constater ce qui existe CHEZ LA VOISINE, sans quoi
 * son « rien n'a fui » vaudrait pour une table vide.
 */
export async function etapesEnBase(base, proprietaire, objetType, objetId, filiales) {
  return await base.avecPerimetre(
    proprietaire,
    { utilisateur: 'observateur', filialeId: null, filiales: filiales ?? [FILIALE_A, FILIALE_B] },
    async (c) =>
      (
        await c.query(
          `select id, filiale_id, etape, ordre, statut, acteur_id, acteur_libelle,
                  version_objet, empreinte_objet, commentaire,
                  date_decision is not null as datee
             from approbations
            where objet_type = $1 and objet_id = $2
            order by ordre, etape`,
          [objetType, objetId],
        )
      ).rows,
  );
}

/** Les entrées du journal d'audit, vues du propriétaire. */
export async function journalEnBase(base, proprietaire, action = null) {
  return await base.lignes(
    proprietaire,
    `select numero::int as numero, action, filiale_id, utilisateur_libelle, resume,
            entite_type, entite_id, valeurs_apres
       from journal_audit
      where ($1::text is null or action = $1::text)
      order by numero`,
    [action],
  );
}

/**
 * Une valeur scalaire lue sous périmètre, par le compte donné.
 *
 * ⚠️ Toutes les tables métier de ce lot portent `force row level security` : une
 * lecture sans périmètre rend **`GRC04`**, y compris pour le propriétaire, et
 * `base.valeur()` renvoie alors `undefined`. Un essai qui compare une valeur à
 * `undefined` sans le savoir mesure son propre oubli — c'est arrivé ici, sur
 * `select version from risques`.
 */
export async function valeurEnBase(base, client, texte, valeurs = [], p = {}) {
  return await base.avecPerimetre(
    client,
    {
      utilisateur: p.utilisateur ?? 'observateur',
      filialeId: p.filialeId ?? null,
      filiales: p.filiales ?? [FILIALE_A, FILIALE_B],
    },
    async (c) => {
      const resultat = await c.query(texte, valeurs);
      return resultat.rowCount === 0 ? undefined : Object.values(resultat.rows[0])[0];
    },
  );
}
