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
  analyserApportsReprise,
  chargerCatalogue,
  Depot,
  engendrerIdentifiant,
  ErreurRegistre,
  estEntiteConnue,
  listerEntites,
  verifierRegistre,
  VERSION_SCHEMA,
} from '../entites/index.js';
import type { BilanReprise, ModeReprise, NomEntite } from '../entites/types.js';
import type { IdentiteAnnuaire } from '../entites/types.js';
import { construireEnveloppe, reprendreExport } from '../reprise/index.js';
import type { ChargeV12 } from '../reprise/types.js';
import { entreeInvalide, ErreurApplicative, traduireErreur } from '../erreurs/index.js';
import type { ContexteTraduction } from '../erreurs/index.js';
import { greffonConnexion } from '../auth/greffon.js';
import type { ServiceAuthentification, SessionAppliqueeReelle } from '../auth/index.js';
import { deciderAcces, DOMAINE_PAR_ENTITE, entitesLisibles, refuserDroit } from './droits.js';
import type { DeclarationAcces, DomaineFonctionnel } from './droits.js';
import { LimiteurRythme, messageRefusRythme } from './limiteur.js';
import { AuthentificationProvisoire, estAuthentificateur, PerimetreProvisoire } from './session.js';
import type { Authentificateur, ResolveurPerimetre, SessionAppliquee } from './session.js';

/* =====================================================================
 *  Ce que le crochet `onRequest` pose sur la requête
 * =====================================================================
 *
 *  Deux enrichissements, et **un seul** est écrit par le produit :
 *
 *   · `sessionGrc` — la session appliquée, posée par le crochet et lue par les
 *     routes. Optionnelle **dans le type** parce qu'elle l'est dans la vie d'une
 *     requête (elle n'existe pas avant le crochet) ; `sessionDe()` refuse de
 *     servir sans elle, ce qui rend l'oubli impossible plutôt qu'improbable.
 *   · `acces` — la classe d'accès, **déclarée par la route** dans ses options.
 *
 *  ⚠️ `sessionGrc` n'est jamais alimentée depuis la requête HTTP : elle vient de
 *  l'authentificateur, donc du serveur (contrôle S2).
 * ===================================================================== */
declare module 'fastify' {
  interface FastifyRequest {
    /** Session appliquée à cette requête. Posée par `onRequest`, jamais par le client. */
    sessionGrc?: SessionAppliquee;
    /**
     * « Le client est-il encore là ? » — posé par `onRequest`, avant même
     * l'authentification, et lu par la route de reprise (constat Q-19).
     */
    abandonGrc?: () => boolean;
  }
  interface FastifyContextConfig {
    /** Classe d'accès de la route. Son absence rend la route inutilisable. */
    acces?: DeclarationAcces;
  }
}

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

/**
 * Annule la transaction d'une reprise dont le client est parti.
 *
 * ── Le défaut qu'elle ferme ──────────────────────────────────────────────
 *
 * Constat Q-19 de la porte S2 : le client abandonne à 4 s, la reprise court
 * jusqu'au bout et **valide**. L'utilisateur lit « Le serveur n'a pas répondu
 * dans le délai imparti », puis voit ses données apparaître au sondage
 * suivant : on lui a annoncé un échec, il constate un succès. Dans un produit
 * qui héberge le plan de continuité d'un groupe et sert de preuve en audit,
 * une issue qu'on affirme à tort est plus coûteuse qu'une issue qu'on ignore.
 *
 * ── Pourquoi annuler est le bon choix, et non « valider puis expliquer » ──
 *
 * La reprise **converge** (constat Q-2) : elle met à jour ce qu'elle retrouve
 * et ne clone rien. Recommencer est donc sans danger, et c'est ce que
 * l'utilisateur fera. Entre une base modifiée par une opération dont personne
 * ne connaît l'issue et une base intacte assortie d'un « recommencez », le
 * second état est le seul sur lequel on peut raisonner — et c'est le seul qui
 * reste vrai si la coupure a eu lieu au milieu d'un « remplacer ».
 */
class AbandonClient extends Error {
  constructor() {
    super("reprise annulée : le client a fermé la connexion avant la réponse");
    this.name = 'AbandonClient';
  }
}

/**
 * Dit si le client a fermé la connexion avant que la réponse ne parte.
 *
 * Le témoin est posé sur la **réponse** et non sur la requête : le flux de
 * requête se clôt normalement dès que le corps est lu, et l'écouter dirait
 * « parti » de tout appel qui a fini d'envoyer son fichier. La fermeture de la
 * réponse **avant** `writableEnded`, elle, ne se produit que si la connexion a
 * disparu — abandon du navigateur, ou `ProxyTimeout` d'Apache qui coupe la
 * connexion arrière.
 *
 * ⚠️ Elle ne voit que ce que la connexion lui montre. Derrière Apache, un
 * navigateur qui abandonne seul ne coupe pas la connexion arrière : c'est
 * `ProxyTimeout` qui la coupera, à la même échéance de 60 s. Le témoin est donc
 * franc sur le trajet complet, mais il n'est pas instantané.
 */
function surveillerAbandon(reponse: FastifyReply): () => boolean {
  let parti = false;
  reponse.raw.on('close', () => {
    if (!reponse.raw.writableEnded) parti = true;
  });
  return () => parti;
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
  /**
   * Second point d'accroche du lot L3 : **qui parle**, et avec quels droits.
   *
   * Absent, le greffon monte l'authentification provisoire — c'est-à-dire
   * aucune : elle enveloppe le résolveur ci-dessus et rend des droits complets,
   * ce qui n'est tenable que parce que ce résolveur refuse de résoudre hors du
   * développement (`session.ts`).
   */
  readonly authentificateur?: Authentificateur;
  /**
   * Service d'authentification du lot L3. Fourni, il apporte deux choses d'un
   * coup :
   *
   *  · il **est** l'`Authentificateur` (il en implémente le contrat), donc
   *    `authentificateur` n'a pas à être passé en plus ;
   *  · il fait monter les routes `POST` et `DELETE /api/connexion`, écrites et
   *    tenues par `src/auth/` — `CONVENTIONS.md` §26.2 : « A1 exporte un greffon
   *    Fastify que `src/api/index.ts` se contente d'enregistrer par une ligne.
   *    La route et sa logique vivent chez A1 ; A2 n'écrit qu'un `register`. »
   */
  readonly serviceAuthentification?: ServiceAuthentification;
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
  // Un seul point d'accroche pour le lot L3, et deux formes admises : un
  // authentificateur fourni explicitement, ou un résolveur qui sait déjà
  // authentifier — ce que l'implémentation réelle sera, puisque c'est la même
  // session serveur qui répond aux deux questions.
  const authentificateur: Authentificateur =
    options.authentificateur ??
    options.serviceAuthentification ??
    (estAuthentificateur(resolveur) ? resolveur : new AuthentificationProvisoire(resolveur));

  /**
   * Cette instance sert-elle l'authentification PROVISOIRE ? (constat Q-84)
   *
   * Se lit sur ce que l'appelant a fourni, jamais sur le type de `resolveur` :
   * `resolveur` retombe sur `PerimetreProvisoire` par défaut **même quand
   * l'authentification réelle est montée**, parce que le lot L3 ne fournit pas
   * de résolveur global — il en fabrique un par requête depuis la session
   * vérifiée. Confondre les deux faisait interroger le résolveur provisoire sur
   * une session parfaitement réelle, et rendre 503 juste après une connexion
   * réussie.
   */
  const authentificationProvisoire =
    options.serviceAuthentification === undefined && options.authentificateur === undefined;

  /**
   * Limitation du rythme des requêtes **non authentifiées** (condition **E4**).
   *
   * Le budget et la fenêtre sont ceux que l'exploitant a déjà réglés pour les
   * tentatives de connexion (`AUTH_MAX_TENTATIVES`, `AUTH_DUREE_VERROUILLAGE`) :
   * ce sont les mêmes grandeurs — *combien d'essais infructueux avant de fermer
   * la porte, et pour combien de temps*. Le budget est élargi d'un facteur
   * quatre parce qu'une page en charge plusieurs, là où une connexion est un
   * geste unique : verrouiller au cinquième appel d'un navigateur qui charge
   * ses données ferait de ce garde-fou une panne.
   *
   * ⚠️ **Deux réglages dédiés seraient plus honnêtes**, et ils sont demandés à
   * l'orchestrateur — `backend/.env.example` ne m'appartient pas. Réutiliser
   * ceux de la connexion vaut mieux que d'écrire deux constantes qu'aucun
   * exploitant ne pourrait ajuster, mais c'est un emprunt, et il est dit.
   */
  const limiteur = new LimiteurRythme({
    budget: Math.max(8, config.auth.maxTentatives * 4),
    fenetreMs: config.auth.dureeVerrouillageMinutes * 60_000,
    // Assez pour un site entier derrière son VPN, assez peu pour qu'un
    // adversaire ne remplisse pas la mémoire du service avec des adresses
    // forgées (contrôle S13).
    adressesMax: 4096,
  });

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
   *  onRequest — LE POINT OÙ TOUT SE DÉCIDE, AVANT L'ANALYSE DU CORPS
   * -------------------------------------------------------------------
   *
   *  ══ Condition d'entrée E4 (constat Q-10) ═══════════════════════════
   *
   *  Fastify exécute ses crochets dans cet ordre :
   *
   *      routage → onRequest → preParsing → **analyse du corps** → …
   *
   *  Tout ce qui est décidé ici l'est donc **avant** que le corps ait coûté
   *  quoi que ce soit. Ce n'est pas un raffinement : mesuré derrière Apache au
   *  9ᵉ passage de la porte S2, un `POST /api/reprise` de 18 Mio **sans aucune
   *  authentification** coûtait 304 ms de médiane, et un `POST
   *  /api/entites/risques` 157 ms — à comparer aux 2 ms de `/api/sante`. Node
   *  étant mono-fil, quelques appels simultanés suffisaient à figer le service
   *  pour tout le monde, et personne n'avait eu à prouver son identité.
   *
   *  ══ L'ordre des trois contrôles, et pourquoi c'est cet ordre-là ════
   *
   *   1. **Le rythme.** Ne touche ni la base ni l'annuaire : c'est le contrôle
   *      le moins cher, il passe donc en premier. Un poste déjà verrouillé ne
   *      fait plus travailler personne.
   *   2. **L'authentification.** Une identité, ou rien. Un refus ici est un
   *      refus **avant** l'analyse du corps : c'est la mesure de E4.
   *   3. **Les droits.** Le niveau, le droit d'export, le domaine. Un profil
   *      *Lecture* qui tente une écriture est refusé **par le serveur** et non
   *      par l'interface (contrôle S6).
   *
   *  ⚠️ Ce crochet est **encapsulé dans le greffon** : il ne s'applique qu'aux
   *  routes de l'API. `/api/sante` vit à la racine et reste servie — une sonde
   *  de disponibilité qui exige une session ne diagnostique plus rien.
   * ------------------------------------------------------------------- */
  instance.addHook('onRequest', async (requete: FastifyRequest, reponse: FastifyReply) => {
    // ── 0. Le témoin d'abandon, avant TOUT le reste ────────────────────
    //
    // ── Pourquoi il a remonté jusqu'ici, et ce que cela a coûté ─────────
    //
    // Il était posé en tête de la route de reprise, avec ce commentaire :
    // « posé AVANT tout le reste : une connexion qui tombe pendant la lecture
    // du fichier doit être vue elle aussi ». C'était vrai quand la route était
    // le premier code à s'exécuter. Depuis que l'authentification s'exerce en
    // `onRequest` (condition **E4**), ce n'est plus vrai : une connexion qui
    // tombe **pendant** l'authentification se ferme avant que l'écouteur
    // n'existe, et l'abandon devient invisible — le serveur valide alors une
    // reprise pour un client déjà parti, ce qui est exactement le constat Q-19.
    //
    // Le banc l'a montré avant moi : `bornes-reprise.test.mjs` a expiré à 20 s
    // en attendant un « Reprise ANNULÉE » qui ne venait plus. Un essai qui tient
    // un ORDRE, et non seulement un résultat, est ce qui rend un réordonnancement
    // visible.
    //
    // Il est donc posé ici : avant le rythme, avant l'identité, avant la
    // déclaration d'accès. La propriété qu'il porte redevient vraie de tout le
    // traitement, et non plus du seul corps de la route.
    requete.abandonGrc = surveillerAbandon(reponse);

    const adresse = requete.ip;

    // ── 1. Rythme ──────────────────────────────────────────────────────
    const verdict = limiteur.verifier(adresse);
    if (verdict.bloque) {
      void reponse.header('retry-after', String(verdict.attendreS));
      throw new ErreurApplicative({
        // `indisponible` et non `non_authentifie` : ce que le client doit
        // comprendre est « réessayez plus tard », pas « identifiez-vous » — et
        // c'est ce que le navigateur fait de ce code (`estPassagere()`). Un code
        // propre au verrouillage dirait à l'attaquant qu'il a atteint la borne ;
        // celui-ci ne distingue pas un verrou d'une saturation.
        code: 'indisponible',
        statut: 429,
        message: messageRefusRythme(),
        detailJournal: `rythme : poste verrouillé, ${String(verdict.attendreS)} s restantes`,
      });
    }

    // ── 2. La route exige-t-elle seulement une session ? ───────────────
    //
    // La déclaration est lue AVANT l'authentification, parce qu'une route
    // publique — la connexion — ne peut pas être authentifiée : elle est ce qui
    // crée la session. La lire ici plutôt que plus bas ne desserre rien : une
    // route sans déclaration est refusée, et « publique » est une déclaration
    // qu'il faut écrire, pas une valeur par défaut.
    const declaration = requete.routeOptions.config.acces;
    if (declaration === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: "Le serveur ne peut pas traiter cette demande.",
        detailJournal:
          `route « ${requete.method} ${requete.routeOptions.url ?? requete.url} » sans classe ` +
          "d'accès déclarée : elle est refusée plutôt que servie sans contrôle (grille §4, S6)",
      });
    }
    if (declaration.action === 'publique') return;

    // ── 3. Authentification ────────────────────────────────────────────
    let session: SessionAppliquee;
    try {
      session = await authentificateur.authentifier(requete);
    } catch (erreur) {
      const traduite = traduireErreur(erreur, contexteErreurs);
      // Seul un refus d'identité compte comme une tentative. Un 503 — le
      // service qui ne peut pas répondre — n'est pas la faute de l'appelant :
      // le verrouiller reviendrait à le punir de notre panne, et rendrait la
      // barrière fail-closed du lot L2 indiscernable d'un verrouillage.
      if (traduite.statut === 401 || traduite.code === 'non_authentifie') {
        const apresEchec = limiteur.enregistrerRefus(adresse);
        if (apresEchec.bloque) void reponse.header('retry-after', String(apresEchec.attendreS));
      }
      throw traduite;
    }
    requete.sessionGrc = session;

    // ── 4. Droits ──────────────────────────────────────────────────────
    //
    // L'absence de déclaration est un **défaut de programmation**, pas une
    // permission : elle a déjà été refusée plus haut. C'est ce qui rend « aucun
    // point d'entrée sans contrôle » vrai par construction et non par relecture.
    const refus = deciderAcces(session.droits, declaration.action, domaineDe(declaration, requete));
    if (refus !== null) {
      requete.log.warn(
        {
          utilisateur: session.perimetre.utilisateurId,
          action: declaration.action,
          route: requete.routeOptions.url ?? requete.url,
          detail: refus.detailJournal,
        },
        "Accès refusé par le modèle de droits (le journal d’audit est le lot L5)",
      );
      throw refuserDroit(refus);
    }

    // ── 5. L'annuaire, à l'ouverture de session seulement ──────────────
    if (session.sessionOuverte === true && session.identite != null) {
      await alimenterAnnuaire(requete, session.perimetre, session.identite);
    }
  });

  /**
   * Domaine mis en jeu par cette requête.
   *
   * `'selon-entite'` lit le paramètre d'URL — qui est, à ce stade, une chaîne
   * **non encore validée** par le schéma de la route. Elle n'est jamais
   * interpolée dans quoi que ce soit : elle sert de **clé** dans une table
   * close, et une clé absente rend `null`. La route refusera ensuite l'entité
   * pour ce qu'elle est ; ce qui compte ici, c'est que le contrôle de **niveau**
   * ait quand même lieu — sans quoi « nom d'entité inconnu » serait une porte
   * dérobée pour un profil en lecture seule.
   */
  const domaineDe = (
    declaration: DeclarationAcces,
    requete: FastifyRequest,
  ): DomaineFonctionnel | null => {
    if (declaration.domaine !== 'selon-entite') return declaration.domaine;
    const parametres = requete.params as { entite?: unknown } | undefined;
    const nom = parametres?.entite;
    if (typeof nom !== 'string' || !estEntiteConnue(nom)) return null;
    return DOMAINE_PAR_ENTITE[nom];
  };

  /**
   * Aligne la fiche d'annuaire de l'utilisateur sur ce que l'AD dit de lui.
   *
   * ── Pourquoi un échec ne referme pas la porte ───────────────────────
   *
   * L'annuaire est un **confort** — il rend les affectations fiables. Refuser
   * une session parce que la fiche n'a pas pu être écrite empêcherait un RSSI
   * d'ouvrir son plan de continuité un jour d'incident, pour une raison sans
   * rapport. L'échec est donc journalisé, avec ce qu'il faut pour le
   * diagnostiquer, et la requête continue.
   *
   * ⚠️ C'est un choix, pas un oubli : il est écrit ici pour qu'on puisse le
   * contester.
   */
  const alimenterAnnuaire = async (
    requete: FastifyRequest,
    perimetre: PerimetreSession,
    identite: IdentiteAnnuaire,
  ): Promise<void> => {
    try {
      const instanceDepot = await assurerDepot();
      const bilan = await avecTransaction(pool, perimetre, (client) =>
        instanceDepot.synchroniserAnnuaire(client, perimetre, identite),
      );
      if (bilan.action !== 'inchangee') {
        requete.log.info(
          { personne: bilan.personneId, action: bilan.action, login: identite.login },
          "Annuaire aligné sur l’Active Directory à l’ouverture de session",
        );
      }
    } catch (erreur) {
      requete.log.warn(
        {
          login: identite.login,
          detail: traduireErreur(erreur, contexteErreurs).detailJournal,
        },
        "L’annuaire n’a pas pu être aligné sur l’Active Directory ; la session continue",
      );
    }
  };

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

  /**
   * Session appliquée à cette requête.
   *
   * ⚠️ **Fail-closed.** Une route qui s'exécuterait sans que le crochet
   * `onRequest` ait posé la session ne sert rien : c'est un défaut de montage,
   * et il vaut mieux un 500 explicite qu'une transaction ouverte sur un
   * périmètre improvisé. Il n'existe **aucune** valeur de repli.
   */
  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: "Le serveur ne peut pas traiter cette demande.",
        detailJournal:
          `route « ${requete.method} ${requete.routeOptions.url ?? requete.url} » atteinte sans ` +
          'session appliquée : le crochet onRequest du greffon ne s’est pas exécuté',
      });
    }
    return session;
  };

  const enLecture = async <T>(
    requete: FastifyRequest,
    travail: (client: PoolClient, depot: Depot, perimetre: PerimetreSession) => Promise<T>,
  ): Promise<T> => {
    const instanceDepot = await assurerDepot();
    const { perimetre } = sessionDe(requete);
    return avecTransaction(pool, perimetre, (client) => travail(client, instanceDepot, perimetre), {
      lectureSeule: true,
    });
  };

  /**
   * Transaction d'écriture.
   *
   * ══ La règle, et pourquoi elle a cette forme-là ══════════════════════
   *
   *   > **Une route ne fabrique jamais un drapeau d'administration : elle le
   *   > vérifie.**
   *
   * Le périmètre passé à `avecTransaction` est **celui de la session, tel
   * quel**. Il n'existe, dans tout le greffon, aucun endroit où
   * `administrationGroupe` soit construit à `true` — c'est vérifiable en un
   * `grep`, et le banc d'essai le retient.
   *
   * La leçon vient d'un défaut que ce lot a créé lui-même. La route de reprise
   * avait d'abord été écrite ainsi : *une reprise restaure un jeu de données
   * entier, socle compris, donc c'est un acte d'administration Groupe, donc la
   * transaction le déclare.* Le raisonnement est juste sur la **nature** de
   * l'opération, et il s'arrête à mi-chemin : il qualifie l'acte sans demander
   * si la session a le droit de le conduire. Mesuré au banc, depuis une même
   * session de filiale ordinaire :
   *
   * ```
   * POST /api/entites/mappings        → 403  hors_perimetre
   * POST /api/reprise  {mappings:[…]} → 200  la correspondance est en base
   * ```
   *
   * La même écriture, deux verdicts. La cause tient en une phrase du
   * `CONVENTIONS.md` §17.4 : *le drapeau n'est pas un privilège, c'est une
   * déclaration que la session fait sur elle-même.* Une déclaration ne
   * s'auto-délivre pas : elle vient du **résolveur de périmètre** — donc de
   * l'authentification, donc du lot L3 — et une route ne peut que la constater.
   *
   * C'est la règle générale que le lot L4 devra suivre pour la création de
   * filiale et la gestion des profils : **vérifier le droit, puis agir**,
   * jamais « qualifier l'opération » et se croire quitte. Le contrôle lui-même
   * vit dans `exigerDroitEcriture` (`src/entites/`), appelé au moment où une
   * écriture aurait lieu — donc par toutes les routes, sans qu'aucune ait à y
   * penser.
   */
  const enEcriture = async <T>(
    requete: FastifyRequest,
    travail: (client: PoolClient, depot: Depot, perimetre: PerimetreSession) => Promise<T>,
  ): Promise<T> => {
    const instanceDepot = await assurerDepot();
    const { perimetre } = sessionDe(requete);
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

  /**
   * Ce que `GET /api/session` rend — **et `POST /api/connexion` avec lui**.
   *
   * ── Pourquoi c'est une fonction et non le corps d'une route ──────────
   *
   * `CONVENTIONS.md` §26.2 : « `POST /api/connexion` rend exactement la même
   * charge que `GET /api/session`, **à l'octet près**. Le navigateur n'a alors
   * qu'une seule forme à savoir lire, et le chemin “je viens de me connecter” ne
   * diverge jamais de “je rouvre l'onglet”. » Deux rédactions se ressembleraient
   * le premier jour et diveregeraient le second : c'est le motif que ce chantier
   * traque depuis onze occurrences. Il n'y a donc qu'une rédaction, et le
   * greffon de connexion la reçoit en paramètre.
   *
   * `filiale` n'est renseignée que par la session provisoire, qui sait décrire
   * la filiale qu'elle a choisie. L'authentification réelle rend l'identifiant ;
   * le nom de la filiale viendra du sélecteur du lot L4.
   */
  const charteSession = (
    session: SessionAppliquee,
    filiale: { id: string; code: string; raisonSociale: string } | null = null,
  ): Record<string, unknown> => {
    const { perimetre, droits } = session;
    // ── Constat Q-85 : la filiale avait un identifiant, pas un nom ──────────
    //
    // Mesuré au navigateur le 03/09 après une connexion réelle : le bandeau
    // « Périmètre » affichait `FIL-1788477623975-5208b3f525954fffb228d9aa292ec1cf`.
    // La session **provisoire** joignait le libellé (`resolveur.filiale()`) ; la
    // session **réelle** ne le portait pas, et cette fonction recevait `null`.
    // Dans un outil qui sert de preuve en audit, l'utilisateur doit savoir dans
    // quelle filiale il écrit.
    //
    // La donnée voyage **dans la session**, jamais par un argument de plus : le
    // greffon de connexion reçoit `charteSession` à **un seul** paramètre, et
    // enrichir un seul des deux côtés ferait diverger `POST /api/connexion` de
    // `GET /api/session` — que le `CONVENTIONS.md` §26.2 exige identiques à
    // l'octet près. L'agent B1 expose donc `filiale` sur la session réelle
    // (`SessionAppliqueeReelle`), et la forme rendue est **celle que la session
    // provisoire émettait déjà** : le frontend n'a rien de neuf à savoir lire.
    const nommee = filiale ?? (session as Partial<SessionAppliqueeReelle>).filiale ?? null;
    return {
      utilisateur: perimetre.utilisateurId,
      filiale_active:
        nommee === null
          ? { id: perimetre.filialeId }
          : { id: nommee.id, code: nommee.code, raison_sociale: nommee.raisonSociale },
      perimetre_lecture: perimetre.filiales,
      perimetre_groupe: perimetre.perimetreGroupe,
      administration_groupe: perimetre.administrationGroupe,
      // Les trois axes, tels que le serveur les a résolus. Le frontend s'en sert
      // pour ne PAS proposer ce qui sera refusé — mais l'interface n'est pas la
      // barrière : le serveur refuse aussi, et c'est ce que le contrôle S6
      // vérifie.
      droits: {
        niveau: droits.niveau,
        domaines: droits.domaines,
        // Nommé « export » des deux côtés : c'est une permission à part entière
        // (PLAN_SERVEUR §3.3), pas un niveau.
        export: droits.export,
        // Rendu seulement quand la couche d'authentification le donne — sinon la
        // clé est absente, et l'interface s'en tient au niveau de la session.
        ...(droits.niveaux === undefined ? {} : { niveaux: droits.niveaux }),
      },
      // Dit franchement ce que vaut cette session. Un auditeur qui interroge
      // l'API le lit sans avoir à ouvrir le code.
      authentification: {
        provisoire: authentificateur.provisoire,
        description: authentificateur.decrire(),
        lot_attendu: 'L3 — authentification Active Directory et droits à trois axes',
      },
      schema_version: VERSION_SCHEMA,
    };
  };

  /* -------------------------------------------------------------------
   *  GET /api/session
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/session',
    // Lire QUI l'on est n'exige aucun domaine : c'est la première chose qu'un
    // client demande, et c'est de cette réponse qu'il déduit ce qu'il peut
    // proposer à l'écran. Elle exige une session — donc le crochet l'a déjà
    // exigée — et rien de plus.
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      // ⚠️ **Le test portait sur le TYPE du résolveur, pas sur celui qui a produit
      // la session** — constat **Q-84**, mesuré le 03/09/2026 contre un Active
      // Directory réel. `resolveur` vaut `PerimetreProvisoire` **par défaut**,
      // même quand un `serviceAuthentification` est fourni : le lot L3 n'apporte
      // pas de résolveur global, il en fabrique un **par requête** à partir de la
      // session vérifiée (`ServiceAuthentification.authentifier`). La condition
      // était donc vraie en permanence, et la route interrogeait un résolveur
      // provisoire qui, hors développement, **échoue par construction**.
      //
      // Effet mesuré : connexion réussie (200), `/api/modele` et `/api/donnees`
      // à 200 — et `/api/session` à **503**. Comme c'est la première route que la
      // SPA appelle au démarrage, l'utilisateur voyait « Serveur indisponible —
      // l'authentification n'est pas encore installée » **juste après s'être
      // authentifié**. Le produit était inutilisable au navigateur alors que
      // toute la chaîne fonctionnait.
      //
      // On teste donc ce qui décide vraiment : *cette session vient-elle de
      // l'authentification provisoire ?* — et non *existe-t-il quelque part une
      // instance provisoire ?*
      const filiale =
        authentificationProvisoire && resolveur instanceof PerimetreProvisoire
          ? await resolveur.filiale()
          : null;
      return reponse.send(charteSession(session, filiale));
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/modele — description, aucune donnée
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/modele',
    { config: { acces: { action: 'lire', domaine: null } } },
    async (_requete: FastifyRequest, reponse: FastifyReply) => {
    // ── N-6 : cette route suit le sort des autres ────────────────────────
    // Elle ne rend aucune donnée métier, mais elle rend la STRUCTURE du
    // produit : 21 entités, tous les noms de champs, leurs types, les préfixes
    // d'identifiant. Elle répondait 200 en production et en recette là où
    // `/api/session` et `/api/donnees` répondent 503 — une divulgation de
    // structure sur la seule route qui échappait à la barrière fail-closed,
    // faute d'appeler le résolveur. Elle l'appelle désormais, et pour cela
    // seulement : le périmètre résolu n'est pas utilisé au-delà.
    // Le crochet `onRequest` a déjà exigé une session : la barrière que le
    // constat N-6 réclamait est désormais tenue **pour toutes les routes à la
    // fois**, et non route par route. L'appel explicite au résolveur qui la
    // tenait ici n'a plus lieu d'être — le laisser ferait deux barrières dont
    // une seule serait rejouée le jour où elle changerait.
    const instanceDepot = await assurerDepot();
    return reponse.send(instanceDepot.decrire());
  },
  );

  /* -------------------------------------------------------------------
   *  GET /api/donnees — le chargement initial
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/donnees',
    // Transversale par construction : elle rend les 21 collections d'un coup
    // (PLAN_SERVEUR §1.3). Le contrôle par domaine ne porte donc pas sur
    // l'accès à la route mais sur son CONTENU — `entitesLisibles` en retire ce
    // que le profil n'a pas.
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
    const session = sessionDe(requete);
    const jeu = await enLecture(requete, async (client, instanceDepot, perimetre) =>
      instanceDepot.chargerJeuDeDonnees(client, perimetre, entitesLisibles(session.droits)),
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
  },
  );

  /* -------------------------------------------------------------------
   *  GET /api/export — l'extraction, et le droit qui lui est propre
   * -------------------------------------------------------------------
   *
   *  ══ Contrôle S7 : le droit d'export est distinct de la lecture ═════
   *
   *  `PLAN_SERVEUR` §3.3 : « un utilisateur disposant d'un accès Groupe en
   *  lecture peut extraire, en un clic, la cartographie complète des faiblesses
   *  du groupe dans un seul fichier. L'export est donc une permission à part
   *  entière, accordée explicitement, et journalisée systématiquement. »
   *
   *  ── Pourquoi une route, alors que le navigateur a déjà les données ──
   *
   *  C'est l'objection immédiate, et elle a une réponse. Tant que l'extraction
   *  se fabrique dans le navigateur à partir du jeu déjà chargé, **le droit
   *  d'export n'est pas un droit** : c'est un bouton qu'on cache, et le
   *  masquage d'interface est très exactement ce que le §1.9 refuse. Une
   *  permission qui n'a aucun point de contrôle côté serveur ne peut ni être
   *  refusée, ni être journalisée — donc ni prouvée en audit.
   *
   *  Cette route donne au droit un endroit où être vérifié. Le fichier qu'elle
   *  rend est l'enveloppe `grc-backup` du `PLAN_SERVEUR` §2.6 — le format
   *  d'échange, celui qu'une filiale sortante emporte et que `/api/reprise`
   *  sait relire.
   *
   *  ⚠️ **Ce qu'elle ne ferme pas, et il faut le dire** : quelqu'un qui a le
   *  droit de lire peut toujours recopier ce que son écran affiche. Le droit
   *  d'export ne rend pas l'extraction impossible ; il rend l'extraction *en
   *  un clic, complète et silencieuse* impossible, et il la rend traçable. Le
   *  §17.5 s'applique — un garde-fou ne se voit pas prêter plus de portée qu'il
   *  n'en a.
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/export',
    { config: { acces: { action: 'exporter', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const lisibles = entitesLisibles(session.droits);
      const jeu = await enLecture(requete, async (client, instanceDepot, perimetre) =>
        instanceDepot.chargerJeuDeDonnees(client, perimetre, lisibles),
      );

      // L'enveloppe est construite par `src/reprise/`, qui la produit déjà pour
      // la moitié « sortie de filiale » du §2.6. La recopier ici en ferait un
      // second exemplaire du format, et deux exemplaires d'un format finissent
      // par ne plus dire la même chose — c'est le motif que ce chantier traque.
      const charge = {
        ...jeu.collections,
        schemaVersion: jeu.schemaVersion,
        updatedAt: jeu.updatedAt,
        extras: {},
      } as unknown as ChargeV12;
      const enveloppe = construireEnveloppe(charge);

      // Journalisé **systématiquement**, comme l'exige le §3.3. Un refus l'est
      // aussi, par le crochet `onRequest`. Le journal d'audit inaltérable est
      // le lot L5 : cette ligne technique est ce qui existe aujourd'hui, et
      // elle ne se donne pas pour une preuve.
      requete.log.info(
        {
          utilisateur: session.perimetre.utilisateurId,
          filiale: session.perimetre.filialeId,
          collections: lisibles.size,
          lignes: Object.values(jeu.volumes).reduce((somme, valeur) => somme + valeur, 0),
        },
        "Export du jeu de données autorisé et servi (journal d’audit : lot L5)",
      );

      return reponse.send(enveloppe);
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/rafraichir — le sondage
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/rafraichir',
    { schema: { querystring: SCHEMA_RAFRAICHIR }, config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest<{ Querystring: { depuis: string } }>, reponse: FastifyReply) => {
      const depuis = new Date(requete.query.depuis);
      if (Number.isNaN(depuis.getTime())) {
        throw entreeInvalide("Le paramètre « depuis » n'est pas un horodatage valide.");
      }

      const resultat = await enLecture(requete, async (client, instanceDepot, perimetre) =>
        instanceDepot.rafraichir(client, perimetre, depuis, entitesLisibles(sessionDe(requete).droits)),
      );
      return reponse.send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/entites/:entite — création
   * ------------------------------------------------------------------- */
  instance.post(
    '/api/entites/:entite',
    {
      schema: { params: SCHEMA_PARAMS_ENTITE, body: SCHEMA_CREATION },
      config: { acces: { action: 'ecrire', domaine: 'selon-entite' } },
    },
    async (
      requete: FastifyRequest<{
        Params: { entite: string };
        Body: { champs: Record<string, unknown>; portee?: 'filiale' | 'groupe' };
      }>,
      reponse: FastifyReply,
    ) => {
      const entite = entiteDe(requete.params.entite);
      const corps = requete.body;

      const enregistrement = await enEcriture(requete, async (client, instanceDepot, perimetre) =>
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
    {
      schema: { params: SCHEMA_PARAMS_ENTITE_ID, body: SCHEMA_MODIFICATION },
      config: { acces: { action: 'ecrire', domaine: 'selon-entite' } },
    },
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

      const enregistrement = await enEcriture(requete, async (client, instanceDepot, perimetre) =>
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
    {
      schema: { params: SCHEMA_PARAMS_ENTITE_ID, querystring: SCHEMA_SUPPRESSION },
      config: { acces: { action: 'ecrire', domaine: 'selon-entite' } },
    },
    async (
      requete: FastifyRequest<{
        Params: { entite: string; identifiant: string };
        Querystring: { version: number };
      }>,
      reponse: FastifyReply,
    ) => {
      const entite = entiteDe(requete.params.entite);

      await enEcriture(requete, async (client, instanceDepot, perimetre) => {
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
    // ══ Condition d'entrée E3 (CONVENTIONS.md §21, §22) ═══════════════
    //
    // « Le droit d'appeler la reprise est décidé par le modèle de droits —
    // c'est un acte d'administration. » Reprendre un export remplace ou
    // fusionne le jeu de données ENTIER d'une filiale : c'est l'opération la
    // plus destructrice du produit, et la seule qui rende aux identifiants du
    // fichier leur valeur de clé primaire.
    //
    // La déclaration est ici, et le refus se prononce dans `onRequest` : un
    // compte sans ce droit ne paie donc PAS l'analyse de son fichier.
    {
      schema: { body: SCHEMA_REPRISE },
      config: { acces: { action: 'administrer', domaine: 'administration' } },
    },
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

      // Le témoin est posé par le crochet `onRequest`, avant l'authentification
      // elle-même : voir le §0 de ce crochet pour ce que cela ferme. Le repli
      // ne sert qu'à un montage qui n'aurait pas le crochet — il n'en existe
      // aucun, et il vaut mieux un témoin tardif qu'aucun témoin.
      const abandonne = requete.abandonGrc ?? surveillerAbandon(reponse);

      // ══ T-3 : LE REFUS PRÉCÈDE LE TRAVAIL ═══════════════════════════
      //
      // Cette ligne est un ordre, et c'est tout ce qu'elle est — mais l'ordre
      // était faux. Le fichier était lu, migré de v1 à v12 et analysé AVANT
      // que la barrière fail-closed n'ait dit un mot. Mesuré par la porte
      // S2 ter, sur un serveur en production :
      //
      //   fichier de 4,5 Mo, 20 000 enregistrements → 503, après 139 ms
      //   GET /api/donnees, pour comparaison        → 503, après 1 ms
      //
      // Trois conséquences, toutes acquises SANS authentification : un demi-
      // second de boucle d'événements bloquée par requête à la borne de 20 Mo
      // (Node est mono-fil : quelques appels simultanés figent le service,
      // `/api/sante` compris) ; un oracle de forme, le 400 distinguant « ceci
      // est un grc-backup exploitable » du 503 ; et le principe que cette route
      // énonce elle-même — *une route vérifie un droit avant d'agir* — respecté
      // sur l'écriture mais pas sur le COÛT.
      //
      // Résoudre le périmètre d'abord ne coûte rien et referme les trois.
      // ── Ce que le crochet `onRequest` a déjà fait, et qui n'est plus refait ──
      // Le refus précédait déjà le travail sur cette route (constat T-3) ; il
      // le précède désormais pour TOUTES, et plus tôt — avant l'analyse du
      // corps. L'appel explicite au résolveur qui tenait la propriété ici
      // ferait maintenant deux barrières dont une seule serait rejouée.
      const instanceDepot = await assurerDepot();

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

      // ══ Q-19 : LA BORNE PRÉCÈDE LA CONNEXION ════════════════════════
      //
      // `analyserApportsReprise` compte ce que le fichier apporte et refuse
      // au-delà de `BORNES.lignesParReprise` — la borne que `/api/modele`
      // publie, et dont le commentaire dit comment elle a été mesurée.
      //
      // Elle est appelée **ici**, avant `enEcriture`, et non dans le moteur :
      // un refus qui a déjà pris une connexion du pool est un refus qui fait
      // attendre les autres. Dix reprises simultanées suffisaient à faire
      // répondre 500 à tout lecteur ordinaire (constat Q-20) ; un fichier hors
      // borne ne coûte désormais que quelques millisecondes de comptage, sur
      // une charge déjà en mémoire.
      //
      // Le moteur rappelle la même fonction dans sa transaction : c'est lui qui
      // fait foi, celle-ci n'anticipe que le refus. Une seule règle, deux
      // appels, aucun risque de divergence.
      try {
        analyserApportsReprise(lecture.charge as unknown as Record<string, unknown>);
      } catch (erreur) {
        throw traduireErreur(erreur, { ...contexteErreurs, origine: 'reprise' });
      }

      const empreinte = createHash('sha256').update(fichier.contenu, 'utf8').digest('hex');

      /**
       * Un seul texte pour les deux abandons — celui d'avant la transaction et
       * celui d'avant la validation. Ils disent la même chose et doivent
       * continuer à la dire ensemble.
       */
      const signalerAbandon = (moment: 'avant transaction' | 'avant validation'): never => {
        // Le client n'est plus là pour lire quoi que ce soit : ce statut ne
        // part que dans le journal. Il y part quand même, parce que c'est la
        // seule trace qu'une reprise a été demandée puis défaite, et qu'un
        // exploitant à qui l'on signale un import « perdu » doit pouvoir la
        // retrouver.
        requete.log.warn(
          {
            mode,
            fichier: fichier.nom,
            octets: Buffer.byteLength(fichier.contenu, 'utf8'),
            moment,
          },
          'Reprise ANNULÉE : la connexion est tombée avant la réponse ; rien n’a été écrit',
        );
        throw new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message:
            "La reprise a été interrompue avant d'aboutir : rien n'a été modifié. " +
            'Rechargez la page, puis recommencez.',
          detailJournal: `abandon du client, ${moment} (Q-19)`,
        });
      };

      // Le client est-il encore là AVANT qu'on prenne une connexion du pool ?
      // Sur un serveur saturé, les clients abandonnent puis recommencent : sans
      // ce contrôle, chaque abandon laisse derrière lui une reprise complète
      // que plus personne n'attend, et qui fait attendre les autres (Q-20).
      if (abandonne()) signalerAbandon('avant transaction');

      // Le droit d'écrire dans le socle commun n'est PAS demandé ici, et ce
      // n'est pas un oubli : il l'est par le moteur, au moment exact où une
      // écriture aurait lieu (voir `appliquerReprise`). Un fichier qui renvoie
      // le socle Groupe à l'identique — ce que fait tout export du produit —
      // n'écrit rien dans le socle et n'exige donc rien ; un fichier qui
      // apporte une correspondance NEUVE l'exige, et sera refusé si la session
      // ne l'a pas. C'est le constat N-2 fermé sans desserrer M-4.
      //
      // Le périmètre passé à la transaction est celui de la session, INCHANGÉ :
      // aucune route de ce greffon ne construit `administrationGroupe`, et
      // c'est ce qui rend la règle « une route vérifie un droit, elle ne se
      // l'accorde pas » vraie par la forme plutôt que par la discipline.
      const resultat = await enEcriture(requete, async (client, _depot, perimetre) => {
        const bilan = await instanceDepot.appliquerReprise(
          client,
          perimetre,
          lecture.charge as unknown as Record<string, unknown>,
          mode,
          requete.log,
        );

        // 2. Tracer la reprise dans la table prévue pour cela.
        //
        // ── T-4 : la trace ne CONSOMME plus le fichier ──────────────────
        //
        // `cle_idempotence` était renseignée avec l'empreinte du contenu, et
        // l'unicité `(filiale_id, entite, cle_idempotence) where statut =
        // 'applique'` en faisait un jeton à usage unique : un fichier donné ne
        // pouvait être appliqué à une filiale **qu'une fois, pour toujours,
        // quel que soit le mode**. Trois gestes ordinaires devenaient
        // impossibles sans l'exploitant — fusionner pour voir puis remplacer,
        // restaurer deux fois la même sauvegarde (le geste même de la reprise
        // après incident, dans un produit qui héberge le PCA du groupe), et
        // reprendre un fichier déjà essayé.
        //
        // Ce n'est pas ce que le cadrage demande : l'idempotence est une
        // exigence du **lot L7** (`PLAN_SERVEUR` §7), et son sens usuel est
        // « rejouer la même requête ne double pas l'effet » — pas « ce fichier
        // est consommé ». Or la reprise l'est déjà **par construction** : elle
        // met à jour ce qu'elle retrouve, et converge.
        //
        // L'empreinte reste écrite dans `sha256` : la trace dit toujours QUEL
        // fichier a été appliqué. Seul le jeton d'unicité disparaît. L'index
        // du schéma reste en place et servira L7, quand l'idempotence sera
        // portée par la requête et non par le fichier.
        if (!apercu) {
          await client.query(
            `insert into "imports" ("id", "filiale_id", "utilisateur_libelle", "entite",
                                    "source", "nom_fichier", "sha256", "taille_octets",
                                    "statut", "lignes_lues", "lignes_creees",
                                    "lignes_mises_a_jour", "lignes_ignorees", "fin_le", "message")
             values ($1, $2, $3, 'toutes', 'grc-backup', $4, $5, $6, 'applique',
                     $7, $8, $9, $10, now(), $11)`,
            [
              // Q-7 : quatrième clone de la convention du §2, sur une clé
              // primaire, à un million de valeurs. Il n'y a qu'un générateur
              // d'identifiants côté serveur, et c'est celui-là — durci à 128
              // bits et gardé au démarrage (constat Q-1). Le recopier, fût-ce
              // sur une ligne, c'est recréer la cause qu'on soigne.
              engendrerIdentifiant('IMP'),
              perimetre.filialeId,
              perimetre.utilisateurId,
              fichier.nom,
              empreinte,
              Buffer.byteLength(fichier.contenu, 'utf8'),
              bilan.lus,
              totaliser(bilan.crees),
              totaliser(bilan.misAJour),
              // N-9 : « lignes ignorées » compte des LIGNES. Y mettre le nombre
              // de champs sans destination rendait la colonne fausse — et tant
              // que le journal d'audit du lot L5 n'existe pas, cette ligne est
              // la seule trace d'un acte destructeur : elle doit être exacte.
              0,
              // Le VOLUME SUPPRIMÉ n'a pas de colonne, et c'est ce que la trace
              // taisait alors qu'un « remplacer » vide la filiale. Il part donc
              // dans le message, avec le reste de ce que le bilan sait.
              `reprise « ${mode} » depuis un export v${String(lecture.rapport.versionOrigine)} · ` +
                `${String(totaliser(bilan.supprimes))} ligne(s) supprimée(s) · ` +
                `${String(bilan.liaisons)} liaison(s) · ` +
                `${String(bilan.champsIgnores.length)} champ(s) sans destination`,
            ],
          );
        }

        // 3. L'aperçu montre le VRAI résultat, puis annule tout. Le sentinelle
        //    n'est pas un détour : c'est ce qui garantit que ce qui est montré
        //    est ce qui se produirait, contraintes comprises.
        if (apercu) throw new SentinelleApercu(bilan);

        // 4. Q-19 — ON NE VALIDE PAS UNE ISSUE QUE PERSONNE NE LIRA.
        //
        //    Dernier geste avant le `commit` : si la connexion est tombée
        //    pendant le travail — abandon du navigateur, ou `ProxyTimeout`
        //    d'Apache — la réponse n'ira nulle part. Valider laisserait
        //    l'utilisateur devant un « le serveur n'a pas répondu » suivi de
        //    ses données qui apparaissent. On annule : la reprise converge,
        //    recommencer est sans danger, et l'état de la base reste celui que
        //    l'utilisateur croit.
        //
        //    Cette ligne est le seul endroit qui décide ; la levée annule la
        //    transaction dans `avecTransaction`, comme n'importe quel échec.
        if (abandonne()) throw new AbandonClient();

        return bilan;
      }).catch((erreur: unknown) => {
        if (erreur instanceof SentinelleApercu) return erreur.bilan;
        if (erreur instanceof AbandonClient) signalerAbandon('avant validation');
        // ── T-10 : sur ce chemin, la cause est le FICHIER ───────────────
        // Traduire ici, et non dans le gestionnaire commun, est ce qui
        // permet d'énoncer la bonne cause sans en inventer une : le
        // gestionnaire ne sait pas par quelle route l'échec est arrivé, et
        // une erreur déjà traduite le traverse inchangée.
        throw traduireErreur(erreur, { ...contexteErreurs, origine: 'reprise' });
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
    {
      schema: { body: SCHEMA_PROPAGATION },
      config: { acces: { action: 'ecrire', domaine: 'conformite' } },
    },
    async (
      requete: FastifyRequest<{ Body: { mesureId: string } }>,
      reponse: FastifyReply,
    ) => {
      const resultat = await enEcriture(requete, async (client, instanceDepot, perimetre) =>
        instanceDepot.propagerMesure(client, perimetre, requete.body.mesureId),
      );

      requete.log.info(
        { mesure: requete.body.mesureId, exigences: resultat.evaluationsMisesAJour },
        'Propagation « au plus défavorable » appliquée en une transaction',
      );
      return reponse.send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST / DELETE /api/connexion — montés, pas écrits
   * -------------------------------------------------------------------
   *
   *  `CONVENTIONS.md` §26.2 : la route de connexion est la seule surface que
   *  deux périmètres se disputent. L'arbitrage donne la route et sa logique à
   *  `src/auth/`, et **une ligne d'enregistrement** à ce fichier. La voici.
   *
   *  ══ Le piège, et comment il est fermé ══════════════════════════════
   *
   *  La connexion est, par définition, appelée **sans session**. Montée telle
   *  quelle sous le crochet `onRequest` ci-dessus, elle rendrait 401 avant
   *  d'être atteinte : une route de connexion qui exige d'être connecté, et le
   *  défaut ne se verrait qu'à la première tentative réelle.
   *
   *  Deux remèdes étaient possibles, et le choix n'est pas indifférent :
   *
   *   · **exempter le chemin dans le crochet** — c'est-à-dire y écrire une
   *     liste de chemins publics. C'est un annuaire au sens du §19.5 : ce qu'il
   *     ne nomme pas, il ne l'exempte pas, et ce qu'il nomme cesse d'être
   *     visible depuis la route ;
   *   · **déclarer la route publique**, comme toutes les autres déclarent leur
   *     classe d'accès. C'est le remède retenu : `action: 'publique'` est une
   *     déclaration, pas une dérogation — elle se compte, elle se lit, et une
   *     route qui ne déclare rien reste refusée.
   *
   *  La déclaration est posée **ici**, à l'enregistrement, par un crochet
   *  `onRoute` qui ne voit que les routes de ce greffon-là : `src/auth/` n'a pas
   *  à connaître le vocabulaire d'accès de `src/api/`, et `src/api/` n'a pas à
   *  connaître les chemins de `src/auth/`.
   *
   *  ⚠️ Elles restent soumises à la **limitation de rythme** — le crochet la
   *  fait passer avant la déclaration. Ce qui n'est pas fait ici, et qui est
   *  dit plutôt que taire : le verrouillage **par compte** exigé par le
   *  `PLAN_SERVEUR` §1.9 appartient à `src/auth/tentatives.ts`, pas à ce
   *  fichier. Compter les échecs de mot de passe par adresse verrouillerait un
   *  site entier derrière son VPN partagé, un jour de crise, pour les erreurs
   *  de cinq personnes.
   * ------------------------------------------------------------------- */
  const service = options.serviceAuthentification;
  if (service !== undefined) {
    await instance.register(async (publiques: FastifyInstance) => {
      publiques.addHook('onRoute', (route) => {
        route.config = { ...route.config, acces: { action: 'publique', domaine: null } };
      });
      await publiques.register(greffonConnexion, {
        service,
        config,
        // Une seule rédaction de la charte de session, servie par les deux
        // routes : c'est la garantie « à l'octet près » du §26.2.
        charteSession: (session: SessionAppliquee) => charteSession(session),
      });
    });
  }
}
