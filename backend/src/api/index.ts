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
 *  · ~~**Aucune écriture au journal d'audit** (contrôle S3)~~ — **caduc depuis
 *    le lot L5.** Ce fichier écrit désormais au journal d'audit : le refus de
 *    droit (crochet `onRequest`, étape 4), l'export (`/api/export`), l'import
 *    (`/api/reprise`) et **toute route déclarée en action `administrer`**, par
 *    un crochet qui lit la déclaration au lieu de tenir une liste. Les
 *    créations, modifications et suppressions sont émises par `src/entites/`,
 *    dans la transaction de l'écriture. Vocabulaire et transaction :
 *    `CONVENTIONS.md` §29.
 *  · **Aucune limitation de rythme** (contrôle S11) : elle appartient à la
 *    couche d'authentification, qui n'existe pas.
 */

import { createHash } from 'node:crypto';

import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
import { lireCookie } from '../auth/index.js';
import type { ServiceAuthentification, SessionAppliqueeReelle } from '../auth/index.js';
import { journaliser } from '../auth/journal.js';
import { empreinteJeton } from '../auth/sessions.js';
import { avecTransactionAuthentification } from '../auth/transaction.js';
import { deciderAcces, DOMAINE_PAR_ENTITE, entitesLisibles, refuserDroit } from './droits.js';
import { greffonJournal } from './journal.js';
import { greffonPieces } from '../pieces/index.js';
import { greffonImport } from '../import/index.js';
import { greffonConsolidation } from '../consolidation/index.js';
import { greffonFiliales } from '../filiales/index.js';
import { greffonApprobations } from '../approbations/index.js';
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

/**
 * Le corps du sélecteur de filiale — **un CHOIX, jamais un périmètre**.
 *
 * `CONVENTIONS.md` §30.2 : « ce que le client peut envoyer : **un identifiant de
 * filiale, et rien d'autre** ». `additionalProperties: false` le rend littéral —
 * un corps qui joindrait une liste de filiales, une portée ou un drapeau est
 * refusé au bord, avant d'atteindre la moindre ligne de code.
 *
 * La borne de 64 signes est celle des identifiants du produit
 * (`SCHEMA_PARAMS_ENTITE_ID`, `CONVENTIONS.md` §2) : la valeur ne sert jamais
 * qu'à être **comparée** à une colonne, jamais interpolée.
 */
const SCHEMA_FILIALE_ACTIVE = {
  type: 'object',
  required: ['filiale'],
  additionalProperties: false,
  properties: { filiale: { type: 'string', minLength: 1, maxLength: 64 } },
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
  // ── Constat Q-91 : l'emprunt cesse, le réglage commence ─────────────
  //
  // Ces deux valeurs étaient EMPRUNTÉES à la configuration de connexion
  // (`maxTentatives × 4`, `dureeVerrouillageMinutes`), pendant que
  // `.env.example` documentait `API_RYTHME_MAX_ANONYME` et `API_RYTHME_FENETRE`
  // comme si elles étaient lues. Elles ne l'étaient nulle part. Le fichier
  // d'exemple écrivait déjà la règle qu'il fallait appliquer : *« un emprunt
  // écrit dans le code n'est pas un réglage »*.
  //
  // Ce ne sont pas les mêmes seuils, et c'est le motif de la séparation : le
  // rythme d'API borne un adversaire qui n'est pas authentifié, la connexion
  // borne des tentatives de mot de passe. Dix personnes derrière une passerelle
  // VPN partagent une adresse ; cinq erreurs de mot de passe ne doivent pas
  // fermer le site.
  const limiteur = new LimiteurRythme({
    budget: config.api.rythmeMaxAnonyme,
    fenetreMs: config.api.rythmeFenetreMinutes * 60_000,
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

    // ── 3 bis. La FILIALE ACTIVE appartient-elle ENCORE au périmètre ? ──
    //
    // `CONVENTIONS.md` §30.3, l'encadré : « les groupes AD d'un utilisateur
    // peuvent changer *pendant* sa session (le lot L3 les relit tous les
    // `AUTH_REVERIFICATION_AD` minutes). Si la filiale active en sort, la session
    // ne doit pas continuer d'écrire là. **La filiale active est donc revérifiée
    // contre `session_filiales` à chaque requête**, et non seulement au moment du
    // choix. »
    //
    // ── Les deux valeurs comparées viennent de la base, pas d'un cache ──
    //
    // `session.perimetre.filiales` est la lecture de `session_filiales` faite par
    // `verifierSession` **pour cette requête-ci** (aucun cache : `src/auth/index.ts`
    // le dit et `test/droits/perimetre-serveur.test.mjs` le mesure), et
    // `session.perimetre.filialeId` est `sessions.filiale_active_id` de la même
    // lecture. La comparaison est donc celle que le §30.3 demande, et pas une
    // relecture d'un état vieilli.
    //
    // ── Pourquoi un refus, et pas un repli ─────────────────────────────
    //
    // Le repli — « on retombe sur la première filiale du périmètre » — est
    // précisément ce que le §30.2 interdit : *pas de repli, pas de valeur par
    // défaut*. Il produirait le défaut que tout ce lot existe pour empêcher :
    // **l'utilisateur croirait écrire chez A en écrivant chez B**, et il n'aurait
    // rien fait pour cela.
    //
    // ── Pourquoi ICI, et uniformément ──────────────────────────────────
    //
    // Sans ce contrôle, l'incohérence n'était pas silencieuse — elle rendait
    // **500** : `validerPerimetre` (`src/db/pool.ts`) refuse un périmètre dont la
    // filiale active n'est pas lisible, en LECTURE comme en écriture, et le refus
    // sort en `ErreurPerimetre`, c'est-à-dire en défaut de programmation. Ce
    // n'en est pas un : c'est un changement d'annuaire, et cela se dit à
    // l'utilisateur.
    //
    // Aucune route n'est exemptée, et aucune liste de chemins n'est écrite :
    // `POST` et `DELETE /api/connexion` sont déclarées **publiques** et le crochet
    // leur a déjà rendu la main à l'étape 2. La sortie de secours est donc entière
    // — se reconnecter re-résout le périmètre depuis les groupes AD — sans qu'un
    // seul chemin ait été mis à part.
    const filialeActive = session.perimetre.filialeId;
    if (filialeActive !== null && !session.perimetre.filiales.includes(filialeActive)) {
      const detail =
        'CONVENTIONS.md §30.3 : la filiale active de la session ne figure plus dans ' +
        `son périmètre de lecture (${String(session.perimetre.filiales.length)} filiale(s) ` +
        'lisible(s)). Les groupes AD ont changé en cours de session.';
      requete.log.warn(
        {
          utilisateur: session.perimetre.utilisateurId,
          route: requete.routeOptions.url ?? requete.url,
          detail,
        },
        'Accès refusé : la filiale active a quitté le périmètre de la session',
      );
      await tracer(requete.log, session, {
        // Phrase FIXE (§29.5). Rien de ce qui varie n'y entre.
        action: 'refus_autorisation',
        resume:
          'Requête refusée : la filiale active de la session ne figure plus dans son ' +
          'périmètre de lecture.',
        adresseIp: requete.ip,
        entiteType: 'sessions',
        valeursApres: {
          methode: requete.method,
          route: requete.routeOptions.url ?? null,
          motif: 'filiale_active_hors_perimetre',
          filiale_active: filialeActive,
          perimetre_lecture: [...session.perimetre.filiales],
        },
      });
      // ⚠️ `perimetre_perime`, et NON `hors_perimetre` — constat **Q-134**.
      //
      // Les deux refus partagent le statut et la cause apparente. Ils ne
      // partagent pas la bonne réponse : `hors_perimetre` vise un
      // ENREGISTREMENT, et le navigateur rend alors la saisie à la valeur du
      // serveur ; celui-ci vise la SESSION, et ce que l'utilisateur a tapé est
      // innocent. Mesuré à S5 : la saisie disparaissait et ne revenait pas au
      // rechargement, dans le scénario même que ce lot existe pour couvrir.
      throw new ErreurApplicative({
        code: 'perimetre_perime',
        statut: 403,
        message:
          'Votre périmètre a changé : la filiale dans laquelle vous travailliez ne vous est ' +
          'plus ouverte. Votre saisie est conservée — reconnectez-vous pour reprendre avec ' +
          'vos accès à jour.',
        detailJournal: detail,
      });
    }

    // ── 4. Droits ──────────────────────────────────────────────────────
    //
    // L'absence de déclaration est un **défaut de programmation**, pas une
    // permission : elle a déjà été refusée plus haut. C'est ce qui rend « aucun
    // point d'entrée sans contrôle » vrai par construction et non par relecture.
    const refus = deciderAcces(
      session.droits,
      declaration.action,
      domaineDe(declaration, requete),
      declaration.niveau,
    );
    if (refus !== null) {
      requete.log.warn(
        {
          utilisateur: session.perimetre.utilisateurId,
          action: declaration.action,
          route: requete.routeOptions.url ?? requete.url,
          detail: refus.detailJournal,
        },
        'Accès refusé par le modèle de droits',
      );
      await tracerRefusDroit(requete, session, declaration);
      throw refuserDroit(refus);
    }

    // ── 4 bis. Le PÉRIMÈTRE exigé — constat Q-118, porte S4 ────────────
    //
    // Troisième exigence d'une déclaration d'accès, après l'action et le
    // domaine. Une seule route la porte : la vérification du chaînage du
    // journal, qui expose une fonction parcourant la chaîne ENTIÈRE — donc
    // rendant, par construction, des métadonnées de toutes les filiales.
    //
    // Elle se prononce ICI et non dans la route, pour la même raison que tout
    // le reste : avant l'analyse du corps, de façon uniforme, et sans qu'une
    // route puisse l'oublier. Le contrôle est un **constat** sur la session,
    // jamais une déclaration que la route ferait sur elle-même (condition E2).
    //
    // ⚠️ Deux exigences distinctes, et l'ordre du `case` ne les mélange pas :
    // lire le groupe entier (`groupe`) et pouvoir l'écrire
    // (`administration-groupe`) ne sont pas le même droit. Le message diffère
    // aussi, parce qu'il n'y a rien de commun à dire : dans un cas on refuse une
    // vue, dans l'autre un pouvoir. ⚠️ Le message qui vivait ici parlait du
    // journal, la seule route qui portait alors la déclaration — il aurait
    // annoncé « votre journal de filiale reste consultable » à qui tentait de
    // créer une filiale.
    const perimetreExige =
      declaration.perimetre === 'groupe'
        ? {
            satisfait: session.perimetre.perimetreGroupe,
            message:
              'Cette vérification porte sur le groupe entier : elle est réservée à un ' +
              'périmètre Groupe. Votre périmètre de filiale reste consultable.',
            detail:
              'Q-118 : route à périmètre Groupe demandée depuis un périmètre de ' +
              `${String(session.perimetre.filiales.length)} filiale(s)`,
            resume: 'Accès refusé : périmètre de lecture Groupe exigé',
          }
        : declaration.perimetre === 'administration-groupe'
          ? {
              satisfait: session.perimetre.administrationGroupe,
              message:
                'Cette opération modifie le groupe entier : elle est réservée à ' +
                "l'administration Groupe. Lire le groupe ne suffit pas à le changer.",
              detail:
                "Q-149 : route d'administration Groupe demandée par une session qui ne " +
                `porte pas ce droit (périmètre de lecture : ${String(session.perimetre.filiales.length)} filiale(s))`,
              resume: 'Accès refusé : administration Groupe exigée',
            }
          : null;

    if (perimetreExige !== null && !perimetreExige.satisfait) {
      requete.log.warn(
        {
          utilisateur: session.perimetre.utilisateurId,
          route: requete.routeOptions.url ?? requete.url,
          detail: perimetreExige.detail,
        },
        perimetreExige.resume,
      );
      await tracerRefusDroit(requete, session, declaration);
      throw refuserDroit({
        message: perimetreExige.message,
        detailJournal: perimetreExige.detail,
      });
    }

    // ── 5. L'annuaire, à l'ouverture de session seulement ──────────────
    if (session.sessionOuverte === true && session.identite != null) {
      await alimenterAnnuaire(requete.log, session.perimetre, session.identite);
    }
  });

  /* -------------------------------------------------------------------
   *  onResponse — `administration` : TOUTE route déclarée en `administrer`
   * -------------------------------------------------------------------
   *
   *  `CONVENTIONS.md` §29.2 : « `administration` — **toute route déclarée en
   *  action `administrer`** ». *Toute*, y compris celle que le lot L4 écrira
   *  l'an prochain pour créer une filiale, et celle que L8 écrira pour changer
   *  un profil.
   *
   *  ══ Pourquoi un crochet, et pas un appel dans chaque route ═════════
   *
   *  Parce qu'une omission y serait **silencieuse** : une route
   *  d'administration qui oublie sa ligne de journal fonctionne parfaitement et
   *  ne trace rien, et personne ne l'apprend avant l'audit. C'est le premier
   *  cas du tableau du `CLAUDE.md` §3 — *quelque chose réussit en silence alors
   *  que c'est faux* —, et le remède prescrit est de **découvrir** au lieu
   *  d'énumérer. Ce crochet lit `requete.routeOptions.config.acces`, c'est-à-dire
   *  la déclaration que la route porte déjà et sans laquelle elle est refusée :
   *  il n'y a rien à penser à faire.
   *
   *  ══ Ce qu'il ne tient pas, et qu'il faut dire ══════════════════════
   *
   *  Il s'exécute **après** la réponse : la trace n'est donc PAS dans la
   *  transaction de l'acte, contrairement à la règle 1 du §29.3. Si son
   *  insertion échoue, l'acte a déjà eu lieu et la réponse est partie. C'est
   *  assumé, et compensé : **les actes d'administration qui écrivent des
   *  données portent en plus leur trace transactionnelle** — `import` pour la
   *  reprise, `creation` / `modification` / `suppression` pour le dépôt. Cette
   *  entrée-ci répond à une autre question, celle que pose un auditeur ISO :
   *  *qui a exercé un pouvoir d'administration, quand, depuis quelle adresse*.
   *
   *  Un `onSend` permettrait de faire échouer la réponse, pas de défaire la
   *  transaction — la commodité serait alors payée d'un client qui reçoit 500
   *  sur une opération réussie. On préfère un défaut de trace visible au
   *  journal technique à un défaut d'issue affiché à l'utilisateur.
   * ------------------------------------------------------------------- */
  instance.addHook('onResponse', async (requete: FastifyRequest, reponse: FastifyReply) => {
    const declaration = requete.routeOptions.config.acces;
    if (declaration?.action !== 'administrer') return;
    // Un refus a déjà sa trace (`refus_autorisation`), et un échec n'est pas un
    // acte d'administration : seule une issue aboutie en est un.
    if (reponse.statusCode >= 400) return;
    const session = requete.sessionGrc;
    if (session === undefined) return;

    await tracer(requete.log, session, {
      action: 'administration',
      resume: 'Acte d’administration exercé sur une route qui l’exige.',
      adresseIp: requete.ip,
      valeursApres: {
        methode: requete.method,
        route: requete.routeOptions.url ?? null,
        domaine: declaration.domaine,
        statut: reponse.statusCode,
      },
    });
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
  // ⚠️ Prend un JOURNAL, plus une requête — constat Q-88. Elle ne se servait de
  // la requête que pour `requete.log`, et son second appelant (la route de
  // connexion, où la session naît) n'a pas de requête à lui prêter au moment où
  // il l'invoque. Passer le journal rend les deux appels possibles sans
  // fabriquer une fausse requête pour satisfaire une signature.
  const alimenterAnnuaire = async (
    journal: FastifyBaseLogger,
    perimetre: PerimetreSession,
    identite: IdentiteAnnuaire,
  ): Promise<void> => {
    try {
      const instanceDepot = await assurerDepot();
      const bilan = await avecTransaction(pool, perimetre, (client) =>
        instanceDepot.synchroniserAnnuaire(client, perimetre, identite),
      );
      if (bilan.action !== 'inchangee') {
        journal.info(
          { personne: bilan.personneId, action: bilan.action, login: identite.login },
          "Annuaire aligné sur l’Active Directory à l’ouverture de session",
        );
      }
    } catch (erreur) {
      journal.warn(
        {
          login: identite.login,
          detail: traduireErreur(erreur, contexteErreurs).detailJournal,
        },
        "L’annuaire n’a pas pu être aligné sur l’Active Directory ; la session continue",
      );
    }
  };

  /* -------------------------------------------------------------------
   *  Journal d'audit — les événements qui n'ont pas de transaction à eux
   * -------------------------------------------------------------------
   *
   *  `CONVENTIONS.md` §29.3, règle 3 : « un événement qui n'a pas de
   *  transaction d'écriture en ouvre une à lui. C'est le cas du refus de droit
   *  — il se prononce dans `onRequest`, avant toute transaction. »
   *
   *  ⚠️ **Pourquoi `avecTransaction` et non `avecTransactionAuthentification`.**
   *  Le §29.3 renvoie au motif de `journaliserEchec`, qui emploie la seconde —
   *  mais elle pose `grc.authentification`, réglage dont l'unique objet est
   *  d'ouvrir l'écriture des trois tables de session (`007_authentification.sql`,
   *  condition E1). Une trace de journal n'a aucun besoin de cette porte, et la
   *  lui ouvrir élargirait, le temps d'un `insert`, ce que la transaction a le
   *  droit d'écrire — pour rien. Le motif retenu est donc « sa propre
   *  transaction, périmètre de la session », qui est ce que la règle 3 demande
   *  vraiment.
   * ------------------------------------------------------------------- */

  /**
   * Écrit une entrée de journal **hors** de toute transaction métier.
   *
   * ⚠️ **Elle avale ses échecs, et c'est la seule posture tenable ici.** C'est
   * le motif déjà écrit de `journaliserEchec` (`src/auth/index.ts`) : *« un
   * journal qui échoue ne doit pas transformer un refus en 500 : le refus reste
   * un refus »*. La règle 2 du §29.3 — une écriture ne peut pas réussir sans sa
   * trace — vaut pour les **écritures métier**, et celles-là journalisent dans
   * leur propre transaction, sans `try` (voir `src/entites/`). Les événements
   * traités ici n'écrivent rien : les rendre dépendants du journal
   * transformerait une panne de trace en panne de service.
   *
   * L'échec, lui, part au journal technique en `error` : il doit être visible
   * de l'exploitant, pas absorbé.
   */
  const tracer = async (
    journal: FastifyBaseLogger,
    session: SessionAppliquee,
    entree: {
      readonly action: 'refus_autorisation' | 'administration' | 'export';
      readonly resume: string;
      readonly adresseIp?: string | null;
      readonly entiteType?: string | null;
      readonly entiteId?: string | null;
      readonly valeursApres?: Record<string, unknown> | null;
    },
  ): Promise<void> => {
    // Une transaction d'écriture exige une filiale active (`validerPerimetre`).
    // Une session qui n'en a pas — cas qu'aucun chemin ne produit aujourd'hui,
    // mais que le lot L4 pourrait produire avec un sélecteur de filiale vide —
    // ne doit pas voir son refus devenir un 500 : on retombe sur le périmètre
    // système, qui écrit une entrée transversale (`filiale_id` nul, admis par
    // la politique d'ajout) en conservant l'identité dans `utilisateur_libelle`.
    //
    // ⚠️ **Et pas seulement « une filiale active existe » — lot L4.** Depuis que
    // la filiale active est REVÉRIFIÉE à chaque requête (étape 3 bis), il existe
    // un état où elle est renseignée et **hors** du périmètre lisible : les
    // groupes AD ont changé. `avecTransaction` refuse alors ce périmètre
    // (`validerPerimetre`), `journaliser` lève, et `tracer` avale — si bien que
    // le refus le plus intéressant du lot serait le seul à ne rien laisser au
    // journal. La condition est donc celle de `f_filiale_ecriture()` elle-même :
    // *la filiale active appartient-elle au périmètre lisible ?*
    const attribuee =
      session.perimetre.filialeId !== null &&
      session.perimetre.filiales.includes(session.perimetre.filialeId);
    const perimetreTrace = attribuee ? session.perimetre : PERIMETRE_SYSTEME;
    try {
      await avecTransaction(pool, perimetreTrace, async (client: PoolClient) => {
        await journaliser(client, {
          action: entree.action,
          filialeId: attribuee ? session.perimetre.filialeId : null,
          utilisateurLibelle: session.perimetre.utilisateurId,
          adresseIp: entree.adresseIp ?? null,
          entiteType: entree.entiteType ?? null,
          entiteId: entree.entiteId ?? null,
          resume: entree.resume,
          valeursApres: entree.valeursApres ?? null,
        });
      });
    } catch (erreur) {
      journal.error(
        {
          action: entree.action,
          detail: traduireErreur(erreur, contexteErreurs).detailJournal,
        },
        'Écriture au journal d’audit impossible : l’événement n’a PAS été tracé.',
      );
    }
  };

  /**
   * Trace un refus de droit — **et seulement celui d'une session valide.**
   *
   * ⚠️ `CONVENTIONS.md` §29.3, l'encadré : *« le refus de droit ne doit pas
   * devenir une arme »*. Une requête refusée qui écrit en base donne à un
   * attaquant un moyen de faire travailler le serveur sans être authentifié.
   * Cette fonction n'est donc appelée qu'à **l'étape 4** du crochet, où
   * l'authentification a déjà réussi et où seul le droit manque. Un refus
   * d'identité (401) reste traité par le limiteur de rythme, qui le compte sans
   * écrire, et par l'entrée `connexion_echouee` que `src/auth/` émet déjà.
   *
   * Ce que cela coûte, et qui est assumé : un compte **authentifié** qui
   * bouclerait sur une route interdite écrirait une entrée par requête dans une
   * table retenue trois ans. Aucune déduplication n'est faite — « cet
   * utilisateur a heurté dix mille refus » est précisément ce qu'un journal
   * d'audit doit montrer, pas ce qu'il doit lisser.
   */
  const tracerRefusDroit = async (
    requete: FastifyRequest,
    session: SessionAppliquee,
    declaration: DeclarationAcces,
  ): Promise<void> => {
    await tracer(requete.log, session, {
      action: 'refus_autorisation',
      // Phrase FIXE (§29.5). Ce qui varie part en `jsonb`, où l'encodage est le
      // problème de PostgreSQL : la route est un gabarit (`/api/entites/:entite`),
      // jamais l'URL reçue, et le domaine sort d'un vocabulaire clos.
      resume: 'Requête refusée par le modèle de droits : le droit manque.',
      adresseIp: requete.ip,
      valeursApres: {
        methode: requete.method,
        route: requete.routeOptions.url ?? null,
        action_exigee: declaration.action,
        domaine_exige: domaineDe(declaration, requete),
        niveau_session: session.droits.niveau,
        export_session: session.droits.export,
      },
    });
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

  /**
   * Le libellé d'une filiale, pour la réponse du sélecteur de filiale.
   *
   * ⚠️ **Appelée uniquement sur une filiale dont l'appartenance est DÉJÀ
   * établie** — la filiale active de la session, ou celle que l'`update` vient
   * d'accepter. La lire plus tôt donnerait un oracle d'existence : « cette
   * filiale a un nom » répond à « cette filiale existe », ce que le refus du
   * §30.2 se garde justement de dire.
   *
   * Le périmètre système suffit et ne donne accès à **aucune** donnée métier :
   * `filiales` est de niveau Groupe, sa lecture est ouverte (`004_rls.sql` §6),
   * et c'est déjà par là que la session provisoire nomme la sienne.
   *
   * Un nom manquant rend `null` plutôt que de lever : une filiale supprimée
   * entre l'appartenance et l'affichage est une gêne, jamais une raison de
   * refuser un changement qui a eu lieu.
   */
  const nommerFiliale = async (
    id: string,
  ): Promise<{ id: string; code: string | null; raison_sociale: string | null }> => {
    const ligne = await avecTransaction(
      pool,
      PERIMETRE_SYSTEME,
      async (client) => {
        const { rows } = await client.query<{ code: string; raison_sociale: string }>(
          `select "code", "raison_sociale" from "filiales" where "id" = $1`,
          [id],
        );
        return rows[0];
      },
      { lectureSeule: true },
    );
    return { id, code: ligne?.code ?? null, raison_sociale: ligne?.raison_sociale ?? null };
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
   *  PUT /api/session/filiale-active — LE SÉLECTEUR DE FILIALE (lot L4)
   * -------------------------------------------------------------------
   *
   *  ══ La distinction qui tient tout le lot ═══════════════════════════
   *
   *  `CONVENTIONS.md` §30.2 :
   *
   *    > **Le client envoie un CHOIX. Le serveur résout un PÉRIMÈTRE.** Ce ne
   *    > sont pas la même chose, et rien de ce que le client envoie n'entre
   *    > jamais dans un périmètre.
   *
   *  Ce que le client envoie ici est **un identifiant de filiale**, et rien
   *  d'autre (`SCHEMA_FILIALE_ACTIVE`, `additionalProperties: false`). Ce que
   *  le serveur en fait est de le **chercher dans `session_filiales`, relu en
   *  base pour CETTE session**. L'identifiant reçu n'est jamais interpolé, jamais
   *  recopié dans un réglage de session, jamais transformé en périmètre : il est
   *  **comparé**, et c'est la seule chose qu'on en fasse.
   *
   *  ══ Pourquoi une route dédiée, et pas un « ?filiale= » ═════════════
   *
   *  Le §30.2 le tranche, et le contrôle **S2** de la grille se rejoue contre
   *  cette couche : *« un agent qui serait tenté d'ajouter `?filiale=` à
   *  `/api/donnees` doit s'arrêter : ce serait la fin de la propriété »*. La
   *  propriété en question est celle que tout le produit répète —
   *  `resoudre()` ne prend aucun argument, et `js/core/api.js` n'expose aucun
   *  paramètre de filiale — et elle survit intacte à ce lot : **après le
   *  changement, toute requête suivante résout son périmètre exactement comme
   *  avant**, parce que le choix a été rangé dans la ligne de session, en base.
   *
   *  ══ Où le choix est rangé, et pourquoi pas ailleurs ════════════════
   *
   *  Dans `sessions.filiale_active_id` (`001_socle.sql` §8) — **ni cookie, ni
   *  en-tête, ni URL**. Un cookie de filiale serait une valeur que le client
   *  choisit et rejoue : le serveur devrait la croire, et l'invariant tomberait
   *  au premier `curl`. Ici, le seul aller-retour par le navigateur est le
   *  **jeton de session**, qui n'est pas interprété : il retrouve une ligne, il
   *  ne revendique rien (`src/droits/resolveur.ts`, propriété 3).
   *
   *  ══ Le niveau exigé : `lire`, et c'est un arbitrage ════════════════
   *
   *  Choisir *où l'on travaille* n'est pas écrire de la gouvernance. Exiger
   *  `ecrire` fermerait le sélecteur à la Direction et à l'Auditeur — deux
   *  profils en **lecture seule** dont le périmètre porte toutes les filiales,
   *  c'est-à-dire les premiers usagers d'un sélecteur. Et cela n'ouvrirait rien :
   *  la RLS de lecture porte sur `filiales` (le périmètre entier, inchangé), et
   *  la filiale active ne fait que désigner **où les écritures atterrissent** —
   *  écritures que le modèle de droits refuse déjà, séparément, à qui n'y a pas
   *  droit. §30.3 : « il n'accorde aucun droit ».
   *
   *  ══ Ce que cette route NE fait PAS ═════════════════════════════════
   *
   *   · elle ne touche pas au **périmètre de lecture** : `session_filiales` vient
   *     des groupes AD et ne bouge qu'à la ré-authentification (§30.3) ;
   *   · elle n'accorde **aucun droit** : `session_domaines` n'est pas lue ;
   *   · elle ne **contourne pas** `f_filiale_ecriture()`, qui vérifie en base
   *     que la filiale active appartient au périmètre lisible depuis la porte S1
   *     (§17.9). C'est la dernière barrière **même si cette route se trompe**, et
   *     le `exists` ci-dessous s'appuie sur la même table qu'elle.
   * ------------------------------------------------------------------- */
  instance.put(
    '/api/session/filiale-active',
    {
      schema: { body: SCHEMA_FILIALE_ACTIVE },
      config: { acces: { action: 'lire', domaine: null } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const { filiale: cible } = requete.body as { filiale: string };

      // ── 1. Rien à faire : le choix est déjà celui de la session ────────
      //
      // Idempotent, et **sans trace** : une entrée « A → A » dans un registre
      // scellé trois ans n'apprend rien à l'auditeur qui demande *quand cette
      // personne est-elle passée chez B*, et un rechargement de page en
      // écrirait une à chaque fois. Ce n'est pas un événement, c'est un
      // non-mouvement.
      //
      // Ce chemin est aussi le seul que la session **provisoire** du lot L2
      // puisse emprunter : son périmètre ne porte qu'une filiale, donc tout
      // autre choix est hors périmètre et sera refusé plus bas.
      if (cible === session.perimetre.filialeId) {
        return reponse.send({ change: false, filiale_active: await nommerFiliale(cible) });
      }

      // ── 2. Le jeton : une RÉFÉRENCE vers UNE ligne de session ──────────
      //
      // La filiale active se range dans **la** session qui parle, pas dans
      // toutes celles du compte : deux navigateurs ouverts par la même personne
      // travaillent dans deux filiales différentes, et c'est le comportement
      // attendu. Or `SessionAppliquee` ne porte pas l'identifiant de session —
      // il vit dans `EtatSession`, côté `src/auth/`. Le jeton du cookie est donc
      // relu ici pour **retrouver la ligne**, exactement comme
      // `verifierSession` l'a fait à l'étape 3 du crochet : rien n'en est
      // interprété, et l'empreinte seule part en base.
      //
      // ⚠️ Une demande à l'orchestrateur, écrite au rapport plutôt que
      // contournée : exposer `sessionId` sur `SessionAppliquee` supprimerait
      // cette seconde lecture du cookie. `src/auth/index.ts` n'appartient pas au
      // périmètre de cet agent, et fabriquer la valeur ailleurs aurait fait deux
      // rédactions de la même chose — le motif que ce chantier traque.
      const jeton = lireCookie(requete.headers.cookie, config.session.nomCookie);
      if (jeton === null) {
        throw new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message:
            'Le choix de la filiale exige une session ouverte sur le serveur. Reconnectez-vous.',
          detailJournal:
            'sélecteur de filiale : aucune session serveur à modifier (aucun cookie de ' +
            "session). C'est le cas de la session PROVISOIRE du lot L2, qui n'a pas de ligne " +
            'dans « sessions » : son périmètre ne porte qu’une filiale, et le seul choix ' +
            'atteignable est celui qu’elle a déjà.',
        });
      }

      // ── 3. La décision ET l'acte, dans UNE SEULE transaction ───────────
      //
      // `CONVENTIONS.md` §29.3, règle 1 : la trace vit dans la transaction de
      // l'acte. Un changement de filiale ne peut donc pas réussir sans sa ligne
      // de journal, ni une ligne de journal exister sans son changement.
      //
      // ⚠️ **Le contrôle d'appartenance est DANS l'`update`, pas avant.** Un
      // `select` suivi d'un `update` laisserait entre les deux une fenêtre où
      // `session_filiales` peut changer — c'est précisément le scénario que le
      // §30.3 décrit. Ici, la même instruction constate et agit : `rowCount = 0`
      // est le refus, et il n'y a rien à recouper.
      //
      // Le périmètre de la transaction est celui de la session, **tel quel** :
      // une route ne fabrique pas un périmètre, elle en constate un. La filiale
      // active y est encore celle qu'on quitte — c'est elle que
      // `f_filiale_ecriture()` exigera de l'entrée de journal, et c'est donc à
      // elle que le mouvement est attribué (§30.4).
      const perimetreActe =
        session.perimetre.filialeId === null ? PERIMETRE_SYSTEME : session.perimetre;

      const verdict = await avecTransactionAuthentification(
        pool,
        perimetreActe,
        async (client: PoolClient) => {
          const { rows } = await client.query<{ id: string }>(
            `update "sessions" as s
                set "filiale_active_id" = $1
              where s."jeton_empreinte" = $2
                and s."revoquee_le" is null
                and exists (select 1
                              from "session_filiales" sf
                             where sf."session_id" = s."id"
                               and sf."filiale_id" = $1)
             returning s."id"`,
            [cible, empreinteJeton(jeton)],
          );

          const ligne = rows[0];
          // Aucune ligne : la filiale demandée n'est pas dans `session_filiales`
          // pour cette session — qu'elle existe ailleurs ou qu'elle n'existe pas
          // du tout. **Les deux cas sont indiscernables ici**, et c'est voulu :
          // distinguer « inconnue » de « pas à vous » donnerait, en une requête,
          // l'annuaire des filiales du groupe à qui n'en lit qu'une (le même
          // oracle d'existence que le constat M-3 a fermé sur les identifiants
          // d'enregistrement).
          //
          // Le refus est **rendu**, pas levé : lever ici annulerait la
          // transaction, ce qui n'aurait rien à annuler mais ferait passer la
          // trace du refus par le chemin des erreurs. C'est la leçon du 04/09 —
          // une révocation et sa trace repartaient avec le `rollback` de
          // l'exception qui les suivait (`src/auth/index.ts`).
          if (ligne === undefined) return { change: false as const, refuse: true as const };

          await journaliser(client, {
            action: 'changement_perimetre',
            filialeId: session.perimetre.filialeId,
            utilisateurLibelle: session.perimetre.utilisateurId,
            sessionId: ligne.id,
            adresseIp: requete.ip,
            entiteType: 'sessions',
            entiteId: ligne.id,
            // Phrase FIXE (§29.5) : aucune valeur d'utilisateur n'y entre. Les
            // deux filiales partent en `jsonb`, où l'encodage est le problème de
            // PostgreSQL et non celui de qui écrit la phrase.
            resume: 'Filiale active de la session changée.',
            valeursAvant: { filiale_active: session.perimetre.filialeId },
            valeursApres: { filiale_active: cible },
          });

          // Le nom est lu APRÈS l'appartenance, jamais avant : lu plus tôt, il
          // dirait à un client refusé si la filiale demandée existe.
          const { rows: nommee } = await client.query<{ code: string; raison_sociale: string }>(
            `select "code", "raison_sociale" from "filiales" where "id" = $1`,
            [cible],
          );
          const f = nommee[0];
          return {
            change: true as const,
            refuse: false as const,
            filiale: {
              id: cible,
              code: f?.code ?? null,
              raison_sociale: f?.raison_sociale ?? null,
            },
          };
        },
      );

      // ── 4. Le refus : 403, journalisé, filiale active INCHANGÉE ────────
      //
      // §30.2 : « **403**, journalisé en `refus_autorisation`. Pas de repli, pas
      // de valeur par défaut : un choix refusé laisse la filiale active
      // **inchangée**. » L'`update` n'a touché aucune ligne : l'inchangé n'est
      // pas une intention, c'est ce que la base a fait.
      if (verdict.refuse) {
        await tracer(requete.log, session, {
          action: 'refus_autorisation',
          // Phrase FIXE (§29.5).
          resume: 'Changement de filiale refusé : la filiale demandée n’est pas dans le ' +
            'périmètre de la session.',
          adresseIp: requete.ip,
          entiteType: 'sessions',
          valeursApres: {
            methode: requete.method,
            route: requete.routeOptions.url ?? null,
            motif: 'filiale_hors_perimetre',
            // La valeur DEMANDÉE, telle que reçue. Elle est bornée à 64 signes
            // par le schéma, et elle part en `jsonb` : c'est la sortie prévue
            // pour une valeur d'utilisateur (§29.5).
            filiale_demandee: cible,
            filiale_active: session.perimetre.filialeId,
          },
        });
        throw new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 403,
          // Le message ne dit pas si la filiale existe : il dit ce que
          // l'utilisateur peut faire. Les deux cas — inconnue, ou connue mais
          // fermée — rendent le MÊME texte.
          message:
            'Cette filiale ne fait pas partie de votre périmètre : vous restez dans celle où ' +
            'vous travailliez. Si vous devez y accéder, demandez le groupe correspondant à ' +
            'votre administrateur.',
          detailJournal:
            'CONVENTIONS.md §30.2 : la filiale demandée ne figure pas dans session_filiales ' +
            'pour cette session (existence non distinguée de l’appartenance). Filiale active ' +
            'inchangée.',
        });
      }

      return reponse.send({ change: true, filiale_active: verdict.filiale });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/filiales — DE QUOI NOMMER LE CHOIX, et rien de plus
   * -------------------------------------------------------------------
   *
   *  ══ Pourquoi cette route existe ════════════════════════════════════
   *
   *  La charte de session ne porte que des IDENTIFIANTS (`perimetre_lecture`).
   *  Un sélecteur construit là-dessus afficherait
   *  `FIL-1788477623975-5208b3f525954fffb228d9aa292ec1cf` — c'est-à-dire le
   *  constat **Q-85** une seconde fois, et cette fois dans le geste qui décide
   *  **où l'on écrit**. Dans un outil qui sert de preuve en audit, choisir sa
   *  filiale dans une liste de chaînes techniques est une invitation à se
   *  tromper de filiale.
   *
   *  ⚠️ Mesuré au navigateur avant qu'elle n'existe : l'application appelait
   *  déjà `api/filiales`, recevait **404**, et journalisait une erreur de
   *  console à chaque ouverture (`test/navigateur/filiales.test.mjs`).
   *
   *  ══ CE QU'ELLE NE DIT PAS, ET C'EST LE POINT ═══════════════════════
   *
   *  Elle rend **le périmètre de lecture de la session, et lui seul**. Pas la
   *  liste des filiales du groupe.
   *
   *  Le filtre est écrit ICI, explicitement, et il faut dire pourquoi : la
   *  table `filiales` est de niveau Groupe et **sa lecture est ouverte**
   *  (`pol_filiales_lecture … using (true)`, `004_rls.sql` §6) — c'est ce qui
   *  permet à `f_filiales_lecture()` et au chaînage de fonctionner. La RLS ne
   *  protège donc **rien** ici : un `select *` rendrait à un RSSI de site la
   *  liste complète des vingt filiales du groupe, acquisitions comprises, ce
   *  qui est un oracle d'existence inter-filiales — exactement ce que ce
   *  chantier ferme depuis la vague 1.
   *
   *  La borne est `perimetre.filiales`, c'est-à-dire `session_filiales` relu
   *  pour cette session : la même source que le sélecteur, et la seule.
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/filiales',
    // Lire la liste de SES filiales n'exige aucun domaine : c'est le pendant de
    // `/api/session`, dont elle ne fait que nommer un champ.
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const perimetre = session.perimetre;

      const lignes = await avecTransaction(
        pool,
        perimetre,
        async (client) => {
          const { rows } = await client.query<{
            id: string;
            code: string;
            raison_sociale: string;
            statut: string;
          }>(
            `select "id", "code", "raison_sociale", "statut"
               from "filiales"
              where "id" = any($1::text[])
              order by "code"`,
            // La borne, et elle est la seule : le périmètre de lecture de CETTE
            // session. Un tableau vide rend zéro ligne — pas « toutes ».
            [[...perimetre.filiales]],
          );
          return rows;
        },
        { lectureSeule: true },
      );

      return reponse.send({
        filiales: lignes.map((f) => ({
          id: f.id,
          code: f.code,
          raison_sociale: f.raison_sociale,
          statut: f.statut,
          // « active » = c'est celle où les écritures atterrissent aujourd'hui.
          // Le mot désigne la SÉLECTION, pas le statut de la filiale — que la
          // clé `statut` porte à côté, précisément pour lever l'ambiguïté.
          active: f.id === perimetre.filialeId,
        })),
      });
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

      const lignes = Object.values(jeu.volumes).reduce((somme, valeur) => somme + valeur, 0);

      // ══ LA MOITIÉ RESTANTE DU CONSTAT Q-89 ═════════════════════════════
      //
      // Le droit d'export a été rendu inviolable le 04/09 ; **aucun export
      // n'était tracé**. `PLAN_SERVEUR` §1.7 : « les exports sont journalisés
      // au même titre que les modifications — savoir qui a extrait quelles
      // données est une exigence de sécurité autant qu'une trace d'audit », et
      // §3.3 : « permission à part entière, accordée explicitement, et
      // **journalisée systématiquement** ». C'est la première chose qu'un
      // auditeur ISO 27001 demande à voir.
      //
      // ── Deux transactions, et l'ordre n'est pas indifférent ────────────
      //
      // L'extraction est une LECTURE : sa transaction est ouverte `read only`
      // (propriété que ce fichier tient), et une transaction en lecture seule
      // ne peut pas insérer. La trace a donc la sienne — et elle est écrite
      // **avant** que la moindre donnée ne parte sur le réseau.
      //
      // ⚠️ **Aucun `try` ici, et c'est délibéré** : si le journal refuse
      // l'entrée, l'appel échoue et **rien n'est extrait**. C'est l'inverse de
      // la posture retenue pour le refus de droit, où le journal ne doit pas
      // transformer un refus en 500 — et la différence est exactement celle
      // qu'énonce la règle 2 du §29.3 : ici, il y a quelque chose à emporter.
      // Un export silencieux vaudrait mieux que rien pour l'utilisateur, et
      // moins que rien pour l'audit.
      await avecTransaction(pool, session.perimetre, async (client: PoolClient) => {
        await journaliser(client, {
          action: 'export',
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          adresseIp: requete.ip,
          // Phrase FIXE (§29.5) : le volume et le périmètre partent en `jsonb`.
          resume: 'Extraction du jeu de données de la filiale, au format d’échange.',
          valeursApres: {
            format: 'grc-backup',
            collections: lisibles.size,
            lignes,
            volumes: jeu.volumes,
            perimetre_lecture: session.perimetre.filiales,
            schema_version: jeu.schemaVersion,
          },
        });
      });

      requete.log.info(
        {
          utilisateur: session.perimetre.utilisateurId,
          filiale: session.perimetre.filialeId,
          collections: lisibles.size,
          lignes,
        },
        'Export du jeu de données autorisé, journalisé, puis servi',
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

        // 2 bis. LE JOURNAL D'AUDIT — dans la MÊME transaction (§29.3).
        //
        // ── Pourquoi ici, et pas dans le moteur ────────────────────────
        //
        // `appliquerReprise` ne connaît ni le fichier, ni son nom, ni son
        // empreinte : elle reçoit une charge déjà lue et migrée. La route, si.
        // L'entrée porte donc ce qui identifie l'ACTE — le mode, l'empreinte
        // `sha256` du fichier, la version d'origine — et le bilan de ce qu'il a
        // fait. C'est aussi pourquoi le moteur passe `sansJournal` à `creer` et
        // à `modifier` : une reprise laisse **une** entrée, pas 20 000
        // (l'arbitrage est écrit à `OptionsCreation.sansJournal`).
        //
        // ⚠️ Pas de `try` : si le journal refuse, la reprise entière est
        // annulée. C'est l'opération la plus destructrice du produit — un
        // « remplacer » vide la filiale — et elle ne doit pas pouvoir se faire
        // sans laisser de trace (§29.3, règle 2).
        //
        // Un APERÇU n'en écrit pas : sa transaction est annulée de toute façon,
        // et il ne modifie rien. La condition est la même que celle de la ligne
        // `imports` ci-dessus, à dessein — deux conditions divergeraient.
        if (!apercu) {
          await journaliser(client, {
            action: 'import',
            filialeId: perimetre.filialeId,
            utilisateurLibelle: perimetre.utilisateurId,
            adresseIp: requete.ip,
            // Phrase FIXE (§29.5). Le nom du fichier vient de l'utilisateur : il
            // n'entre PAS dans `resume`, il part en `jsonb`.
            resume: 'Reprise d’un export : le jeu de données de la filiale a été repris.',
            valeursApres: {
              mode,
              fichier: fichier.nom,
              sha256: empreinte,
              octets: Buffer.byteLength(fichier.contenu, 'utf8'),
              version_origine: lecture.rapport.versionOrigine,
              lus: bilan.lus,
              crees: totaliser(bilan.crees),
              mis_a_jour: totaliser(bilan.misAJour),
              supprimes: totaliser(bilan.supprimes),
              liaisons: bilan.liaisons,
            },
          });
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
  /* -------------------------------------------------------------------
   *  GET /api/journal** — monté, pas écrit (lot L5)
   * -------------------------------------------------------------------
   *  Même arbitrage que la connexion juste en dessous, et pour la même raison :
   *  la couture est ici, la logique est ailleurs. Elle est enregistrée **avant**
   *  que les routes existent, pour que l'agent qui les écrit n'ait pas à
   *  toucher à ce fichier — deux agents sur `src/api/index.ts` violeraient le
   *  périmètre disjoint qu'exige le `PLAN_EXECUTION` §2.
   *
   *  Le contrat des trois routes est au `CONVENTIONS.md` §29.8. Elles déclarent
   *  le domaine **`journal`**, pas `administration` : c'est l'arbitrage du
   *  04/09/2026, motivé dans `src/api/droits.ts`.
   * ------------------------------------------------------------------- */
  await instance.register(greffonJournal, { pool });

  /* -------------------------------------------------------------------
   *  Pièces jointes — montées, pas écrites (lot L6)
   * -------------------------------------------------------------------
   *  Couture publiée avant l'agent qui la remplira, pour la même raison que
   *  celle du journal : deux agents travaillent sur cette surface, et aucun
   *  n'a besoin de toucher à ce fichier. Contrat au `CONVENTIONS.md` §31.
   * ------------------------------------------------------------------- */
  // ⚠️ `{ pool, config }` et non `{ pool }` : sans `config`, le greffon refuse
  // bruyamment et **n'enregistre aucune route** — le produit n'a alors aucune
  // pièce jointe. Deux agents l'ont signalé indépendamment.
  await instance.register(greffonPieces, { pool, config });

  /* -------------------------------------------------------------------
   *  Import généralisé — monté, pas écrit (lot L7)
   * -------------------------------------------------------------------
   *  Couture publiée avant l'agent. Contrat au `CONVENTIONS.md` §33.1 et §33.2.
   * ------------------------------------------------------------------- */
  await instance.register(greffonImport, { pool, config });

  /* -------------------------------------------------------------------
   *  Consolidation Groupe — la part de L4 que le lot avait laissée ouverte
   * -------------------------------------------------------------------
   *  `/api/donnees` est cadré sur la filiale ACTIVE : la Direction voyait donc
   *  une filiale à la fois, alors que le `PLAN_SERVEUR` §7 range la
   *  « consolidation direction » dans L4. Le `README` §8 portait la réserve
   *  écrite ; cette route la lève.
   *
   *  Elle ne déclare **pas** `perimetre: 'groupe'`, et c'est délibéré : elle
   *  rend ce que la session peut lire, la RLS étant la barrière. Un périmètre
   *  régional de trois filiales est légitime et n'aurait pas à être refusé.
   * ------------------------------------------------------------------- */
  await instance.register(greffonConsolidation, { pool });

  /* -------------------------------------------------------------------
   *  Création de filiale — l'autre part de L4 restée dehors (constat Q-149)
   * -------------------------------------------------------------------
   *  `insert into filiales` n'existait nulle part dans `src/` : intégrer une
   *  société rachetée passait par un administrateur de base écrivant du SQL.
   *  Or le cadrage dit « acquisitions régulières » — c'est une opération du
   *  métier, pas une étape d'installation.
   *
   *  Le préfixe des groupes d'annuaire vient de la configuration, jamais d'une
   *  constante : la route engendre `GRC-<CODE>-<PROFIL>` pour la filiale créée,
   *  et un déploiement dont l'AD impose un autre préfixe n'a rien d'autre à
   *  changer (`LDAP_PREFIXE_GROUPES`).
   * ------------------------------------------------------------------- */
  await instance.register(greffonFiliales, {
    pool,
    ...(config.auth.ldap === null || config.auth.ldap === undefined
      ? {}
      : { prefixeGroupes: config.auth.ldap.prefixeGroupes }),
  });

  /* -------------------------------------------------------------------
   *  Circuit d'approbation — lot L8
   * -------------------------------------------------------------------
   *  « Qui a validé cette politique ? » est une question d'audit systématique,
   *  et l'ISO 27001 exige nommément l'acceptation des risques résiduels.
   *
   *  ⚠️ `pool` est OBLIGATOIRE DANS LE TYPE ici, contrairement au greffon du
   *  journal qui l'avait rendu facultatif pour ne pas bloquer trois agents sur
   *  une ligne. La couture est écrite en même temps que le lot : le décalage
   *  n'a plus de raison d'être, et un greffon qui refuse bruyamment à
   *  l'exécution vaut moins qu'un qui ne compile pas.
   * ------------------------------------------------------------------- */
  await instance.register(greffonApprobations, { pool });

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
        // ── Constat Q-88 : le chemin mort, rouvert par son seul bout vivant ──
        //
        // `alimenterAnnuaire` était appelée à l'étape 5 du crochet `onRequest`,
        // gardée par `sessionOuverte` — un drapeau que seule `connecter()`
        // produit, sur une route déclarée **publique**, où le crochet rend la
        // main à l'étape 2. Résultat mesuré à la porte S3 : `personnes` restait
        // à **0 ligne après sept connexions réelles**.
        //
        // On branche donc l'alimentation là où la session naît. La garde de
        // l'étape 5 reste en place : elle est désormais sans effet pour cette
        // route, et redeviendra utile le jour où une autre voie produira une
        // ouverture de session — sans qu'il faille s'en souvenir.
        apresConnexion: async (session: SessionAppliquee) => {
          if (session.identite == null) return;
          await alimenterAnnuaire(instance.log, session.perimetre, session.identite);
        },
      });
    });
  }
}
