/**
 * API REST du lot L2 — chargement initial, écritures ciblées, sondage.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat servi au frontend (`PLAN_SERVEUR` §1.3)
 * ════════════════════════════════════════════════════════════════════════
 *
 * La façade synchrone de `DataStore` est **préservée** : aucun module métier
 * n'est réécrit. Seuls `save()` et le chargement basculent, et voici ce sur
 * quoi ils basculent.
 *
 * | Verbe | Chemin | Rôle |
 * |---|---|---|
 * | `GET` | `/api/session` | Qui suis-je, dans quelle filiale, avec quelles réserves |
 * | `GET` | `/api/modele` | Description du modèle (champs, types, bornes) — aucune donnée |
 * | `GET` | `/api/donnees` | **Le jeu de données entier de la filiale**, dans la forme exacte de l'objet `data` |
 * | `GET` | `/api/rafraichir?depuis=…` | Ce qui a changé depuis, plus le compte par collection |
 * | `POST` | `/api/entites/:entite` | Créer un enregistrement |
 * | `PUT` | `/api/entites/:entite/:id` | Modifier — **verrouillage optimiste obligatoire** |
 * | `DELETE` | `/api/entites/:entite/:id` | Supprimer (cascades portées par le schéma) |
 * | `POST` | `/api/operations/propager-mesure` | Propagation « au plus défavorable », en une transaction |
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Trois propriétés que ce fichier tient
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Une requête = une transaction** (`avecTransaction`), donc un périmètre
 *    RLS posé et mort au `commit`. Les opérations composites tiennent dans une
 *    seule : tout ou rien (contrôle S14).
 *  · **Les lectures s'ouvrent en `read only`** : la base refuse alors toute
 *    écriture, ce qui vaut mieux qu'une convention de nommage.
 *  · **Aucun message d'erreur brut ne sort** : `traduireErreur` est le seul
 *    chemin de réponse d'erreur, et le détail part au journal (contrôle S12).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce lot ne fait pas, et qu'il faut savoir
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Aucun contrôle de droits par domaine** (contrôle S6) : il n'y a pas
 *    encore de modèle de droits. Toute session qui passe la porte peut écrire
 *    dans sa filiale. C'est le lot L3, et la barrière provisoire est le refus
 *    fail-closed en production (`session.ts`).
 *  · **Aucune écriture au journal d'audit** (contrôle S3) : c'est le lot L5.
 *    Le journal technique trace les écritures, il n'a pas valeur de preuve.
 *  · **Aucune limitation de rythme** (contrôle S11) : elle appartient à la
 *    couche d'authentification, qui n'existe pas.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import type { Configuration } from '../config/index.js';
import { avecTransaction, PERIMETRE_SYSTEME } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import {
  chargerCatalogue,
  Depot,
  ErreurRegistre,
  estEntiteConnue,
  listerEntites,
  verifierRegistre,
  VERSION_SCHEMA,
} from '../entites/index.js';
import type { NomEntite } from '../entites/types.js';
import { entreeInvalide, ErreurApplicative, traduireErreur } from '../erreurs/index.js';
import { PerimetreProvisoire } from './session.js';
import type { ResolveurPerimetre } from './session.js';

export interface OptionsApi {
  readonly pool: Pool;
  readonly config: Configuration;
  /**
   * Point d'accroche du lot L3 : une autre implémentation du résolveur de
   * périmètre, et rien d'autre ne change ici.
   */
  readonly resolveur?: ResolveurPerimetre;
}

/* =====================================================================
 *  Schémas de validation au bord
 * ---------------------------------------------------------------------
 *  L'audit interne reproche à l'import actuel de « ne valider ni le schéma
 *  ni les types » (PLAN_SERVEUR §5). Fastify compile ces schémas : ce qui
 *  n'y ressemble pas n'atteint jamais le code métier.
 *
 *  Ils bornent la FORME. Le contenu de `champs` est validé par le moteur, à
 *  partir des types découverts dans le catalogue PostgreSQL — un schéma JSON
 *  écrit à la main par entité serait exactement la « liste écrite à la main »
 *  que le CONVENTIONS.md §19.5 proscrit.
 * ===================================================================== */

const SCHEMA_PARAMS_ENTITE = {
  type: 'object',
  required: ['entite'],
  additionalProperties: false,
  properties: {
    entite: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[a-z][a-z0-9_]*$' },
  },
} as const;

const SCHEMA_PARAMS_ENTITE_ID = {
  type: 'object',
  required: ['entite', 'identifiant'],
  additionalProperties: false,
  properties: {
    entite: { type: 'string', minLength: 1, maxLength: 32, pattern: '^[a-z][a-z0-9_]*$' },
    identifiant: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const SCHEMA_CREATION = {
  type: 'object',
  required: ['champs'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    champs: { type: 'object' },
    portee: { type: 'string', enum: ['filiale', 'groupe'] },
  },
} as const;

const SCHEMA_MODIFICATION = {
  type: 'object',
  required: ['version', 'champs'],
  additionalProperties: false,
  properties: {
    // `version` est STRUCTURELLE : elle vit dans l'enveloppe, jamais dans
    // `champs`. C'est ce qui lève l'ambiguïté sur `documents`, dont le modèle
    // navigateur porte un champ « version » qui est la version du DOCUMENT.
    version: { type: 'integer', minimum: 1, maximum: 2147483647 },
    versionMiseEnOeuvre: { type: 'integer', minimum: 1, maximum: 2147483647, nullable: true },
    champs: { type: 'object' },
  },
} as const;

const SCHEMA_SUPPRESSION = {
  type: 'object',
  additionalProperties: false,
  properties: { version: { type: 'integer', minimum: 1, maximum: 2147483647 } },
} as const;

const SCHEMA_RAFRAICHIR = {
  type: 'object',
  required: ['depuis'],
  additionalProperties: false,
  properties: { depuis: { type: 'string', minLength: 10, maxLength: 40 } },
} as const;

const SCHEMA_PROPAGATION = {
  type: 'object',
  required: ['mesureId'],
  additionalProperties: false,
  properties: { mesureId: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;

/* =====================================================================
 *  Le greffon
 * ===================================================================== */

export async function greffonApi(instance: FastifyInstance, options: OptionsApi): Promise<void> {
  const { pool, config } = options;
  const resolveur: ResolveurPerimetre =
    options.resolveur ?? new PerimetreProvisoire(pool, config, instance.log);

  /** Dépôt, construit une fois le catalogue découvert. */
  let depot: Depot | null = null;
  /** Anomalies du garde-fou : tant qu'il y en a, le service ne sert rien. */
  let anomaliesRegistre: readonly string[] | null = null;

  /**
   * Découvre le catalogue et **fait mordre le garde-fou** (contrôle S16).
   *
   * Deux échecs, deux natures, et les confondre serait une faute :
   *  · base injoignable → **transitoire**. Le serveur reste en marche et
   *    répond 503 ; il retentera à la requête suivante. C'est la décision déjà
   *    prise au lot L0 pour `/api/sante`, et un redémarrage en boucle serait
   *    moins diagnosticable.
   *  · registre incohérent avec le schéma → **structurel**. Le service ne
   *    servira jamais correctement, et servir « au mieux » signifierait écrire
   *    des données de gouvernance dans les mauvaises colonnes. Au démarrage,
   *    cela fait échouer le démarrage.
   */
  const assurerDepot = async (): Promise<Depot> => {
    if (anomaliesRegistre !== null) {
      throw new ErreurApplicative({
        code: 'indisponible',
        statut: 503,
        message:
          "Le serveur refuse de servir des données : son modèle interne ne correspond pas au " +
          'schéma de la base. Contactez votre exploitant.',
        detailJournal: `registre incohérent : ${anomaliesRegistre.join(' | ')}`,
      });
    }
    if (depot !== null) return depot;

    const catalogue = await avecTransaction(
      pool,
      PERIMETRE_SYSTEME,
      async (client: PoolClient) => chargerCatalogue(client),
      { lectureSeule: true },
    );

    const anomalies = verifierRegistre(catalogue);
    if (anomalies.length > 0) {
      anomaliesRegistre = anomalies;
      instance.log.fatal(
        { anomalies },
        "Registre d'entités incohérent avec le schéma PostgreSQL : le service ne peut pas " +
          'servir de données. Voir backend/src/entites/index.ts §6.',
      );
      throw new ErreurRegistre(anomalies);
    }

    depot = new Depot(catalogue);
    instance.log.info(
      { tables: catalogue.tables.size, entites: listerEntites().length },
      "Catalogue PostgreSQL découvert, registre d'entités vérifié",
    );
    return depot;
  };

  // Le garde-fou est BRANCHÉ : il tourne au démarrage, avant la première
  // requête, et une incohérence de registre fait échouer `listen()` — donc le
  // démarrage du service (contrôle S16, CONVENTIONS.md §18.4).
  instance.addHook('onReady', async () => {
    try {
      await assurerDepot();
    } catch (erreur) {
      if (erreur instanceof ErreurRegistre) throw erreur;
      instance.log.warn(
        { erreur: erreur instanceof Error ? erreur.message : String(erreur) },
        "Catalogue non découvert au démarrage (base injoignable ?) ; l'API réessaiera à la " +
          'première requête et répondra 503 en attendant',
      );
    }
  });

  /* -------------------------------------------------------------------
   *  Traitement des erreurs — le seul chemin de sortie d'un échec
   * ------------------------------------------------------------------- */
  instance.setErrorHandler((erreur: unknown, requete, reponse) => {
    // Un refus de validation de Fastify est une entrée malformée : il porte un
    // message qui décrit le SCHÉMA, jamais la donnée. On le reformule tout de
    // même, pour ne pas exposer la syntaxe interne des schémas.
    const estValidation =
      typeof erreur === 'object' &&
      erreur !== null &&
      (erreur as { validation?: unknown }).validation !== undefined;

    const traduite = estValidation
      ? entreeInvalide(
          'La requête ne respecte pas le format attendu.',
          `validation : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        )
      : traduireErreur(erreur);

    const trace = {
      erreur: traduite.code,
      detail: traduite.detailJournal,
      entite: traduite.entite,
      identifiant: traduite.identifiant,
      reference: requete.id,
    };

    if (traduite.statut >= 500) {
      requete.log.error(
        { ...trace, pile: erreur instanceof Error ? erreur.stack : undefined },
        "Échec du traitement de la requête",
      );
    } else {
      requete.log.warn(trace, 'Requête refusée');
    }

    void reponse.code(traduite.statut).send({ ...traduite.corps(), reference: requete.id });
  });

  /* -------------------------------------------------------------------
   *  Outils communs
   * ------------------------------------------------------------------- */

  const enLecture = async <T>(
    travail: (client: PoolClient, depot: Depot, perimetre: PerimetreSession) => Promise<T>,
  ): Promise<T> => {
    const instanceDepot = await assurerDepot();
    const perimetre = await resolveur.resoudre();
    return avecTransaction(pool, perimetre, (client) => travail(client, instanceDepot, perimetre), {
      lectureSeule: true,
    });
  };

  const enEcriture = async <T>(
    travail: (client: PoolClient, depot: Depot, perimetre: PerimetreSession) => Promise<T>,
  ): Promise<T> => {
    const instanceDepot = await assurerDepot();
    const perimetre = await resolveur.resoudre();
    return avecTransaction(pool, perimetre, (client) => travail(client, instanceDepot, perimetre));
  };

  /** Un nom d'entité reçu n'est qu'une **clé** du registre, jamais du SQL. */
  const entiteDe = (nom: string): NomEntite => {
    if (!estEntiteConnue(nom)) {
      throw entreeInvalide(
        `« ${nom.slice(0, 32)} » n'est pas une entité connue de l'application.`,
        `entité inconnue : ${nom.slice(0, 64)}`,
      );
    }
    return nom;
  };

  /* -------------------------------------------------------------------
   *  GET /api/session
   * ------------------------------------------------------------------- */
  instance.get('/api/session', async (_requete: FastifyRequest, reponse: FastifyReply) => {
    const perimetre = await resolveur.resoudre();
    const filiale =
      resolveur instanceof PerimetreProvisoire ? await resolveur.filiale() : null;

    return reponse.send({
      utilisateur: perimetre.utilisateurId,
      filiale_active:
        filiale === null
          ? { id: perimetre.filialeId }
          : { id: filiale.id, code: filiale.code, raison_sociale: filiale.raisonSociale },
      perimetre_lecture: perimetre.filiales,
      perimetre_groupe: perimetre.perimetreGroupe,
      administration_groupe: perimetre.administrationGroupe,
      // Dit franchement ce que vaut cette session. Le frontend peut l'afficher ;
      // un auditeur qui interroge l'API le lit sans avoir à ouvrir le code.
      authentification: {
        provisoire: resolveur.provisoire,
        description: resolveur.decrire(),
        lot_attendu: 'L3 — authentification Active Directory et droits à trois axes',
      },
      schema_version: VERSION_SCHEMA,
    });
  });

  /* -------------------------------------------------------------------
   *  GET /api/modele — description, aucune donnée
   * ------------------------------------------------------------------- */
  instance.get('/api/modele', async (_requete: FastifyRequest, reponse: FastifyReply) => {
    const instanceDepot = await assurerDepot();
    return reponse.send(instanceDepot.decrire());
  });

  /* -------------------------------------------------------------------
   *  GET /api/donnees — le chargement initial
   * ------------------------------------------------------------------- */
  instance.get('/api/donnees', async (_requete: FastifyRequest, reponse: FastifyReply) => {
    const jeu = await enLecture(async (client, instanceDepot, perimetre) =>
      instanceDepot.chargerJeuDeDonnees(client, perimetre),
    );

    // La charge utile est rendue dans la forme EXACTE de l'objet `data` du
    // frontend : `DataStore` peut l'adopter telle quelle (PLAN_SERVEUR §1.3).
    return reponse.send({
      schemaVersion: jeu.schemaVersion,
      horodatage: jeu.horodatage,
      updatedAt: jeu.updatedAt,
      volumes: jeu.volumes,
      data: { schemaVersion: jeu.schemaVersion, updatedAt: jeu.updatedAt, ...jeu.collections },
    });
  });

  /* -------------------------------------------------------------------
   *  GET /api/rafraichir — le sondage
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/rafraichir',
    { schema: { querystring: SCHEMA_RAFRAICHIR } },
    async (requete: FastifyRequest<{ Querystring: { depuis: string } }>, reponse: FastifyReply) => {
      const depuis = new Date(requete.query.depuis);
      if (Number.isNaN(depuis.getTime())) {
        throw entreeInvalide("Le paramètre « depuis » n'est pas un horodatage valide.");
      }

      const resultat = await enLecture(async (client, instanceDepot, perimetre) =>
        instanceDepot.rafraichir(client, perimetre, depuis),
      );
      return reponse.send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/entites/:entite — création
   * ------------------------------------------------------------------- */
  instance.post(
    '/api/entites/:entite',
    { schema: { params: SCHEMA_PARAMS_ENTITE, body: SCHEMA_CREATION } },
    async (
      requete: FastifyRequest<{
        Params: { entite: string };
        Body: { id?: string; champs: Record<string, unknown>; portee?: 'filiale' | 'groupe' };
      }>,
      reponse: FastifyReply,
    ) => {
      const entite = entiteDe(requete.params.entite);
      const corps = requete.body;

      const enregistrement = await enEcriture(async (client, instanceDepot, perimetre) =>
        instanceDepot.creer(client, perimetre, entite, corps.champs, corps.id ?? null, {
          portee: corps.portee ?? 'filiale',
        }),
      );

      requete.log.info(
        { entite, identifiant: enregistrement['id'] },
        'Enregistrement créé (journal technique ; le journal d’audit est le lot L5)',
      );
      return reponse.code(201).send({ enregistrement });
    },
  );

  /* -------------------------------------------------------------------
   *  PUT /api/entites/:entite/:identifiant — écriture ciblée
   * ------------------------------------------------------------------- */
  instance.put(
    '/api/entites/:entite/:identifiant',
    { schema: { params: SCHEMA_PARAMS_ENTITE_ID, body: SCHEMA_MODIFICATION } },
    async (
      requete: FastifyRequest<{
        Params: { entite: string; identifiant: string };
        Body: {
          version: number;
          versionMiseEnOeuvre?: number | null;
          champs: Record<string, unknown>;
        };
      }>,
      reponse: FastifyReply,
    ) => {
      const entite = entiteDe(requete.params.entite);
      const corps = requete.body;

      const enregistrement = await enEcriture(async (client, instanceDepot, perimetre) =>
        instanceDepot.modifier(
          client,
          perimetre,
          entite,
          requete.params.identifiant,
          corps.version,
          corps.champs,
          corps.versionMiseEnOeuvre ?? null,
        ),
      );

      requete.log.info({ entite, identifiant: requete.params.identifiant }, 'Enregistrement modifié');
      return reponse.send({ enregistrement });
    },
  );

  /* -------------------------------------------------------------------
   *  DELETE /api/entites/:entite/:identifiant
   * ------------------------------------------------------------------- */
  instance.delete(
    '/api/entites/:entite/:identifiant',
    { schema: { params: SCHEMA_PARAMS_ENTITE_ID, querystring: SCHEMA_SUPPRESSION } },
    async (
      requete: FastifyRequest<{
        Params: { entite: string; identifiant: string };
        Querystring: { version?: number };
      }>,
      reponse: FastifyReply,
    ) => {
      const entite = entiteDe(requete.params.entite);

      await enEcriture(async (client, instanceDepot, perimetre) => {
        await instanceDepot.supprimer(
          client,
          perimetre,
          entite,
          requete.params.identifiant,
          requete.query.version ?? null,
        );
      });

      requete.log.info(
        { entite, identifiant: requete.params.identifiant },
        'Enregistrement supprimé (cascades portées par le schéma, CONVENTIONS.md §8)',
      );
      return reponse.send({ supprime: true });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/operations/propager-mesure — opération composite
   * ------------------------------------------------------------------- */
  instance.post(
    '/api/operations/propager-mesure',
    { schema: { body: SCHEMA_PROPAGATION } },
    async (
      requete: FastifyRequest<{ Body: { mesureId: string } }>,
      reponse: FastifyReply,
    ) => {
      const resultat = await enEcriture(async (client, instanceDepot, perimetre) =>
        instanceDepot.propagerMesure(client, perimetre, requete.body.mesureId),
      );

      requete.log.info(
        { mesure: requete.body.mesureId, exigences: resultat.evaluationsMisesAJour },
        'Propagation « au plus défavorable » appliquée en une transaction',
      );
      return reponse.send(resultat);
    },
  );
}
