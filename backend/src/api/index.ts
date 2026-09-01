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
 * | `POST` | `/api/reprise` | **Reprendre un export `grc-backup` entier, en UNE transaction** — avec aperçu |
 * | `POST` | `/api/operations/propager-mesure` | Propagation « au plus défavorable », en une transaction |
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que la porte S2 a changé au contrat — à lire côté navigateur
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Point | Avant | Maintenant | Motif |
 * |---|---|---|---|
 * | `POST` | `{id?, champs}` | **`{champs}`** — envoyer `id` est refusé | M-3 : l'identifiant choisi par le client était un oracle d'existence inter-filiales |
 * | `DELETE` | `?version` facultatif | **`?version` exigé** | m-8 : `PLAN_SERVEUR` §1.4 range la suppression sous P1 |
 * | `PUT` sur `mesures` | `versionMiseEnOeuvre` facultatif et sans effet s'il manquait | **toujours arbitré** : absent ⇒ `insert` arbitré par l'unicité `(filiale_id, mesure_id)` ; présent ⇒ `update … and version = $n` | M-2 : le verrou était facultatif, donc absent |
 * | `PUT` sur `mesures` | l'envoi de l'enregistrement entier touchait la définition Groupe et rendait 403 | les champs de la définition **inchangés** ne sont plus écrits | M-1 : aucune filiale ne pouvait évaluer un contrôle du socle |
 * | Chaîne vide | refusée par les listes fermées du schéma | convertie en `NULL` quand le schéma refuse `''` | M-8 : deux modules étaient cassés par leur propre valeur par défaut |
 * | `mappings` | écrivable par toute session | **réservé à l'administration Groupe** | M-4 : une action de filiale réécrivait une référence commune aux vingt |
 *
 * **`POST /api/reprise`** remplace la rafale de `DELETE` un par un que le
 * constat bloquant B-3 condamne. Corps :
 * `{ mode: "remplacer" | "fusionner", apercu?: boolean, fichier: { nom, contenu } }`,
 * où `contenu` est le **texte brut du fichier** — c'est le serveur qui lit
 * l'enveloppe et monte la charge de v1 à v12 (`PLAN_SERVEUR` §2.6). La réponse
 * porte le bilan (supprimés / créés / mis à jour par collection, liaisons,
 * champs sans destination) et le rapport de reprise (paliers traversés,
 * anomalies ligne par ligne). Avec `apercu: true`, tout est appliqué puis la
 * transaction est **annulée** : ce qui est montré est ce qui se produirait.
 *
 * Un `409` de doublon sur une **clé métier** (le point d'historique du jour,
 * une exigence de référentiel déjà évaluée) porte désormais `identifiant` et
 * `version_actuelle` de l'enregistrement qui occupe la clé : de quoi basculer
 * sur une modification au lieu d'afficher un incident (m-5).
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
 *    fail-closed **partout sauf en développement** (`session.ts`) — la recette
 *    comprise, parce qu'elle porte une copie réaliste de la production
 *    (`PLAN_SERVEUR` §1.10).
 *  · **Aucune écriture au journal d'audit** (contrôle S3) : c'est le lot L5.
 *    Le journal technique trace les écritures, il n'a pas valeur de preuve.
 *  · **Aucune limitation de rythme** (contrôle S11) : elle appartient à la
 *    couche d'authentification, qui n'existe pas.
 */

import { createHash } from 'node:crypto';

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
import type { BilanReprise, ModeReprise, NomEntite } from '../entites/types.js';
import { reprendreExport } from '../reprise/index.js';
import { entreeInvalide, ErreurApplicative, traduireErreur } from '../erreurs/index.js';
import type { ContexteTraduction } from '../erreurs/index.js';
import { PerimetreProvisoire } from './session.js';
import type { ResolveurPerimetre } from './session.js';

/**
 * Force l'annulation de la transaction d'un aperçu, en portant son bilan.
 *
 * Ce n'est pas un détournement d'exception : c'est **la seule façon** de
 * montrer un aperçu qui soit le vrai résultat. Simuler l'application donnerait
 * une estimation — sans les `check`, sans les clés étrangères, sans la RLS.
 * Appliquer puis annuler donne le résultat exact, et ne laisse rien derrière.
 */
class SentinelleApercu extends Error {
  public readonly bilan: BilanReprise;
  constructor(bilan: BilanReprise) {
    super('aperçu de reprise : annulation volontaire de la transaction');
    this.name = 'SentinelleApercu';
    this.bilan = bilan;
  }
}

function totaliser(comptes: Readonly<Record<string, number>>): number {
  return Object.values(comptes).reduce((somme, valeur) => somme + valeur, 0);
}

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

// ⚠️ Pas de champ `id` : **l'identifiant vient du serveur** (constat M-3 de la
// porte S2). Laisser le client le choisir lui donnait un oracle d'existence
// inter-filiales en une requête — l'unicité de la clé primaire ignore la RLS,
// donc « identifiant pris ailleurs » se lisait au code de retour. `additionalProperties:
// false` fait que l'envoyer quand même est refusé, bruyamment, plutôt qu'ignoré.
// Le round-trip d'un export `grc-backup` passe par le moteur d'import du lot L7
// (voir `OptionsCreation.identifiantImpose`), pas par cette route.
const SCHEMA_CREATION = {
  type: 'object',
  required: ['champs'],
  additionalProperties: false,
  properties: {
    // `id` est DÉCLARÉ pour être REFUSÉ. Fastify compile ses schémas avec
    // `removeAdditional: true` : une propriété simplement absente du schéma
    // serait *retirée en silence*, et un client qui continue d'envoyer son
    // identifiant ne l'apprendrait jamais. `not: {}` n'accepte aucune valeur :
    // l'envoyer produit un 400 explicite.
    id: { not: {} },
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
    // `['integer','null']` et non le mot-clé `nullable` d'OpenAPI, qu'AJV
    // n'interprète pas : `null` doit être une valeur ACCEPTÉE et signifiante —
    // « la filiale n'a pas encore de mise en œuvre pour ce contrôle ».
    versionMiseEnOeuvre: { type: ['integer', 'null'], minimum: 1, maximum: 2147483647 },
    champs: { type: 'object' },
  },
} as const;

// `version` est **exigée** : le `PLAN_SERVEUR` §1.4 range explicitement
// « supprimer une ligne que quelqu'un vient de modifier » sous le risque P1, et
// une suppression sans numéro de version y échappait (porte S2, constat m-8).
// Le moteur garde un chemin sans version pour ses cascades internes ; le réseau
// n'en a pas.
const SCHEMA_SUPPRESSION = {
  type: 'object',
  required: ['version'],
  additionalProperties: false,
  properties: { version: { type: 'integer', minimum: 1, maximum: 2147483647 } },
} as const;

const SCHEMA_RAFRAICHIR = {
  type: 'object',
  required: ['depuis'],
  additionalProperties: false,
  properties: { depuis: { type: 'string', minLength: 10, maxLength: 40 } },
} as const;

const SCHEMA_REPRISE = {
  type: 'object',
  required: ['mode', 'fichier'],
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['remplacer', 'fusionner'] },
    // Un aperçu applique VRAIMENT la reprise, puis annule la transaction :
    // il montre le résultat réel, contraintes de la base comprises, et non une
    // estimation (`PLAN_SERVEUR` §5, « aperçu avant validation »).
    apercu: { type: 'boolean' },
    fichier: {
      type: 'object',
      required: ['nom', 'contenu'],
      additionalProperties: false,
      properties: {
        nom: { type: 'string', minLength: 1, maxLength: 260 },
        // Le TEXTE BRUT du fichier, tel que l'utilisateur l'a choisi. C'est le
        // serveur qui lit l'enveloppe et monte la charge de v1 à v12
        // (`PLAN_SERVEUR` §2.6) : le navigateur n'a pas à connaître les
        // paliers, et un export ancien doit être absorbé même si la SPA qui le
        // reçoit ne sait plus le lire.
        contenu: { type: 'string', minLength: 2, maxLength: 20000000 },
      },
    },
  },
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
  /**
   * Ce que la traduction des erreurs doit savoir du schéma pour ne pas le
   * laisser fuir : les noms de tables (qu'aucun message ne doit contenir) et
   * les unicités (pour ne préciser un doublon que s'il est forcément lisible).
   * Découvert, jamais listé — et passé en paramètre, pour que `src/erreurs/`
   * reste sans dépendance d'exécution.
   */
  let contexteErreurs: ContexteTraduction = {};
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
    contexteErreurs = {
      nomsInternes: new Set(catalogue.tables.keys()),
      unicites: catalogue.unicites,
      validations: catalogue.validations,
    };
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
          messageDeValidation(erreur),
          `validation : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        )
      : traduireErreur(erreur, contexteErreurs);

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

  /**
   * Message d'un refus de validation.
   *
   * Générique par défaut — un message de schéma décrirait la forme interne des
   * requêtes. **Une exception, et elle est utile** : l'envoi d'un `id` à la
   * création. C'est un changement de contrat issu de la porte S2 (M-3), et un
   * appelant qui le heurte doit apprendre quoi faire, pas seulement qu'il a
   * tort. La phrase ne décrit aucun schéma : elle énonce la règle.
   */
  const messageDeValidation = (erreur: unknown): string => {
    const items = (erreur as { validation?: { instancePath?: unknown }[] }).validation;
    if (Array.isArray(items) && items.some((item) => item.instancePath === '/id')) {
      return (
        "L'identifiant d'un enregistrement est engendré par le serveur : ne l'envoyez pas à la " +
        'création. Reprenez celui que la réponse vous rend.'
      );
    }
    return 'La requête ne respecte pas le format attendu.';
  };

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

  /**
   * Transaction d'une opération qui touche au **socle commun du Groupe**.
   *
   * ══ La règle, et pourquoi elle a cette forme-là ══════════════════════
   *
   *   > **Une route ne fabrique jamais un drapeau d'administration : elle le
   *   > vérifie.**
   *
   * La première rédaction faisait l'inverse. Elle raisonnait ainsi : une
   * reprise restaure un jeu de données entier, socle compris, donc c'est par
   * nature un acte d'administration Groupe, donc la transaction le déclare.
   * Le raisonnement est juste sur la **nature** de l'opération, et il s'arrête
   * à mi-chemin : il qualifie l'acte sans jamais demander si la session a le
   * droit de le conduire.
   *
   * Le résultat se mesurait au banc d'essai, depuis une même session de
   * filiale ordinaire :
   *
   * ```
   * POST /api/entites/mappings        → 403  hors_perimetre
   * POST /api/reprise  {mappings:[…]} → 200  la correspondance est en base
   * ```
   *
   * La même écriture, deux verdicts, et la correspondance forgée depuis une
   * filiale visible des dix-neuf autres. Ce n'est pas une fuite de lecture :
   * c'est **une écriture dont le rayon sort de la filiale**, sans droit à la
   * produire et sans journal pour l'attribuer — le constat M-4, atteint par le
   * chemin créé pour le refermer.
   *
   * La cause tient en une phrase du `CONVENTIONS.md` §17.4, qui était sous nos
   * yeux : *le drapeau n'est pas un privilège, c'est une déclaration que la
   * session fait sur elle-même.* Une déclaration ne s'auto-délivre pas. Elle
   * vient du **résolveur de périmètre** — donc de l'authentification, donc du
   * lot L3 — et une route ne peut que la constater.
   *
   * ══ Ce que cette forme rend impossible ═══════════════════════════════
   *
   * Aucune route ne peut plus s'accorder l'administration Groupe : le
   * périmètre passé à `avecTransaction` est **celui de la session, inchangé**.
   * Il n'existe donc plus, dans tout le greffon, un seul endroit où
   * `administrationGroupe` soit construit à `true`. C'est vérifiable en un
   * `grep`, et c'est ce qui distingue une propriété d'une discipline.
   *
   * C'est aussi la règle générale que le lot L4 devra suivre pour la création
   * de filiale et la gestion des profils : **vérifier le droit, puis agir**,
   * jamais « qualifier l'opération » et se croire quitte.
   */
  const enAdministrationGroupe = async <T>(
    motif: string,
    travail: (client: PoolClient, depot: Depot, perimetre: PerimetreSession) => Promise<T>,
  ): Promise<T> => {
    const instanceDepot = await assurerDepot();
    const perimetre = await resolveur.resoudre();

    if (!perimetre.administrationGroupe) {
      throw new ErreurApplicative({
        code: 'hors_perimetre',
        statut: 403,
        message:
          `${motif} Cette opération touche au socle commun du Groupe — le même pour toutes ` +
          "les filiales — et relève de l'administration Groupe. Rien n'a été modifié.",
        detailJournal:
          "administration Groupe exigée et non détenue par la session ; le drapeau vient du " +
          'résolveur de périmètre (lot L3), jamais de la route',
      });
    }

    // Le périmètre est celui de la session, tel quel. Rien n'est ajouté.
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
        Body: { champs: Record<string, unknown>; portee?: 'filiale' | 'groupe' };
      }>,
      reponse: FastifyReply,
    ) => {
      const entite = entiteDe(requete.params.entite);
      const corps = requete.body;

      const enregistrement = await enEcriture(async (client, instanceDepot, perimetre) =>
        instanceDepot.creer(client, perimetre, entite, corps.champs, {
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
        Querystring: { version: number };
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
          requete.query.version,
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
   *  POST /api/reprise — reprendre un export `grc-backup`, EN UNE TRANSACTION
   * -------------------------------------------------------------------
   *  La vraie réponse au constat bloquant B-3 de la porte S2 : l'import
   *  « Remplacer » était une rafale de vingt `DELETE` HTTP indépendants, dont
   *  une coupure de VPN au milieu laissait la filiale à moitié détruite. Ici,
   *  tout tient dans **une** transaction : elle réussit entièrement, ou elle
   *  n'a jamais eu lieu (contrôle S14).
   *
   *  C'est aussi le seul chemin où les identifiants du fichier redeviennent
   *  les clés primaires (`CONVENTIONS.md` §2, round-trip exact) — la route de
   *  création ordinaire ne l'admet plus depuis M-3, et c'est ici que la
   *  propriété a été conservée plutôt que perdue.
   * ------------------------------------------------------------------- */
  instance.post(
    '/api/reprise',
    { schema: { body: SCHEMA_REPRISE } },
    async (
      requete: FastifyRequest<{
        Body: {
          mode: ModeReprise;
          apercu?: boolean;
          fichier: { nom: string; contenu: string };
        };
      }>,
      reponse: FastifyReply,
    ) => {
      const { mode, fichier } = requete.body;
      const apercu = requete.body.apercu === true;

      // 1. Lire l'enveloppe et monter la charge de v1 à v12. Le module de
      //    reprise borne lui-même la taille, le nombre de nœuds et la
      //    profondeur AVANT d'analyser (S13) ; on lui impose en plus la borne
      //    de corps du serveur, pour qu'il n'y ait pas deux vérités.
      const lecture = reprendreExport(fichier.contenu, {
        tailleMaxOctets: config.serveur.tailleMaxCorpsOctets,
      });

      if (lecture.statut !== 'reprise') {
        // Le module distingue « ce n'est pas un fichier exploitable » de « ce
        // lot ne sait pas le traiter » ; ses messages sont écrits pour un
        // exploitant et ne nomment aucun objet interne.
        throw entreeInvalide(lecture.message, `reprise refusée : ${lecture.code}`);
      }

      const empreinte = createHash('sha256').update(fichier.contenu, 'utf8').digest('hex');

      // ── Le fichier exige-t-il l'administration Groupe ? ─────────────────
      // Un export du modèle navigateur porte la surcouche des correspondances
      // inter-référentiels, qui sont de **niveau Groupe** : les reprendre est
      // une écriture dans le socle commun aux vingt filiales. On le demande au
      // moteur, dont le critère est celui de la route ordinaire — une table
      // sans `filiale_id` —, et non à une liste tenue ici.
      //
      // Une collection vide n'exige rien : c'est le cas courant, un export
      // portant toujours les 21 clés. Un fichier purement « niveau filiale »
      // se reprend donc normalement, sans habilitation particulière.
      const depotCourant = await assurerDepot();
      const charge = lecture.charge as unknown as Record<string, unknown>;
      const exigeantes = depotCourant.entitesDePorteeGroupeApportees(charge);

      const executer =
        exigeantes.length === 0
          ? enEcriture
          : <T,>(travail: (c: PoolClient, d: Depot, p: PerimetreSession) => Promise<T>) =>
              enAdministrationGroupe(
                `Ce fichier apporte des données de portée Groupe (${exigeantes.join(', ')}).`,
                travail,
              );

      const resultat = await executer(async (client, instanceDepot, perimetre) => {
        const bilan = await instanceDepot.appliquerReprise(client, perimetre, charge, mode);

        // 2. Tracer la reprise dans la table prévue pour cela. Elle porte la
        //    clé d'idempotence du `PLAN_SERVEUR` §5 : réimporter le même
        //    fichier deux fois est refusé par une unicité du schéma, pas par
        //    une comparaison faite au vol.
        if (!apercu) {
          await client.query(
            `insert into "imports" ("id", "filiale_id", "utilisateur_libelle", "entite",
                                    "source", "nom_fichier", "sha256", "taille_octets",
                                    "cle_idempotence", "statut", "lignes_lues", "lignes_creees",
                                    "lignes_mises_a_jour", "lignes_ignorees", "fin_le", "message")
             values ($1, $2, $3, 'toutes', 'grc-backup', $4, $5, $6, $5, 'applique',
                     $7, $8, $9, $10, now(), $11)`,
            [
              `IMP-${String(Date.now())}-${String(Math.floor(Math.random() * 1000000))}`,
              perimetre.filialeId,
              perimetre.utilisateurId,
              fichier.nom,
              empreinte,
              Buffer.byteLength(fichier.contenu, 'utf8'),
              bilan.lus,
              totaliser(bilan.crees),
              totaliser(bilan.misAJour),
              bilan.champsIgnores.length,
              `reprise « ${mode} » depuis un export v${String(lecture.rapport.versionOrigine)}`,
            ],
          );
        }

        // 3. L'aperçu montre le VRAI résultat, puis annule tout. Le sentinelle
        //    n'est pas un détour : c'est ce qui garantit que ce qui est montré
        //    est ce qui se produirait, contraintes comprises.
        if (apercu) throw new SentinelleApercu(bilan);
        return bilan;
      }).catch((erreur: unknown) => {
        if (erreur instanceof SentinelleApercu) return erreur.bilan;
        throw erreur;
      });

      requete.log.info(
        {
          mode,
          apercu,
          fichier: fichier.nom,
          lus: resultat.lus,
          crees: totaliser(resultat.crees),
          maj: totaliser(resultat.misAJour),
          supprimes: totaliser(resultat.supprimes),
        },
        apercu
          ? 'Aperçu de reprise : la transaction a été annulée, rien n’a été écrit'
          : 'Reprise appliquée en une transaction (journal d’audit : lot L5)',
      );

      return reponse.send({
        applique: !apercu,
        mode,
        bilan: resultat,
        rapport: {
          version_origine: lecture.rapport.versionOrigine,
          version_cible: lecture.rapport.versionCible,
          forme_enveloppe: lecture.rapport.formeEnveloppe,
          paliers: lecture.rapport.paliers,
          volumes: lecture.rapport.volumes,
          compteurs: lecture.rapport.compteurs,
          anomalies: lecture.rapport.anomalies,
        },
      });
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
