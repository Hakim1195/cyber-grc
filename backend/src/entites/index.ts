/**
 * Couche d'accès aux entités — le moteur unique du lot L2.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  1. Ce que ce module est
 * ════════════════════════════════════════════════════════════════════════
 *
 * **Un** moteur et **une** description par entité. Pas vingt et un modules
 * recopiés : c'est la leçon la plus chère de ce chantier, et elle est écrite
 * noir sur blanc dans `CONVENTIONS.md` §19.5 et §20.1 — « une liste écrite à la
 * main est une omission qui attend », le motif ayant produit à lui seul quatre
 * défauts distincts à la porte S1.
 *
 * La règle est donc appliquée à ce module lui-même :
 *
 *  · le **registre** (§4 ci-dessous) ne décrit que ce que PostgreSQL ne sait
 *    pas : le nom frontend d'une entité, son préfixe d'identifiant, les
 *    quelques champs dont le nom diffère de la colonne, les liaisons n-n et la
 *    scission des mesures ;
 *  · tout le reste — colonnes, types, `not null`, valeurs par défaut, colonnes
 *    **engendrées**, clés primaires, cloisonnement, RLS — est **découvert dans
 *    le catalogue** (§5) ;
 *  · un **garde-fou** (§6) recoupe les deux et **fait échouer le démarrage**
 *    quand le registre nomme quelque chose que le schéma ne porte plus, ou
 *    quand une table perd son cloisonnement (contrôle S16). Il attrape des
 *    **noms et des formes**, et rien de plus : la disparition d'une colonne
 *    métier ordinaire lui échappe, et le §6 dit précisément pourquoi. Ne pas
 *    lire cette ligne comme « le registre et le schéma ne peuvent pas
 *    diverger » — c'est exactement la faute que `CONVENTIONS.md` §17.5
 *    interdit, et la porte S2 l'a relevée ici même (constat m-4).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  2. Le risque projet P1, et la parade
 * ════════════════════════════════════════════════════════════════════════
 *
 * `PLAN_SERVEUR` §1.4 : le modèle navigateur réécrit l'instantané complet à
 * chaque enregistrement ; transposé au serveur, **le dernier qui enregistre
 * écrase silencieusement le travail des autres.**
 *
 * Parade : `update … where id = $1 and version = $2`. Zéro ligne = refus.
 *
 * ⚠️ **Zéro ligne veut dire trois choses**, et `GRC03` n'en désigne qu'une
 * (`CONVENTIONS.md` §15, constat O-2 de `RAPPORT_S1`, constat Q-7 de
 * `RAPPORT_S1_QUATER`) :
 *
 *   1. la version est périmée → `GRC03`, « modifié entre-temps, rechargez » ;
 *   2. la ligne n'est pas visible dans le périmètre → « ressource inconnue » ;
 *   3. la ligne est visible mais l'écriture est refusée par la RLS (autre
 *      filiale du périmètre de lecture, ou ligne de portée Groupe sans
 *      administration Groupe) → « hors périmètre ».
 *
 * Sans cette distinction, l'API enverrait recharger une page un utilisateur qui
 * n'avait pas le droit d'y écrire. `diagnostiquerEcriture()` (§8) la fait, dans
 * la **même transaction** que l'écriture qui a échoué.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  3. Trois pièges légués par la vague 1, et comment ils sont fermés ici
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Le client ne fixe ni `version`, ni `cree_le`, ni `cree_par`**
 *    (`CONVENTIONS.md` §18.1). La base les impose à l'insertion et les gèle
 *    ensuite ; une couche d'écriture qui les enverrait ne provoquerait aucune
 *    erreur, ses valeurs seraient simplement ignorées — le pire des deux
 *    mondes. Elles sont donc **exclues par construction** : les cinq colonnes
 *    du bloc du §3 ne sont jamais nommées en écriture, et un champ client qui
 *    viserait l'une d'elles est **refusé**, pas ignoré.
 *  · **Les colonnes engendrées ne s'écrivent pas** (`CONVENTIONS.md` §18.6) :
 *    `documents.portee_groupe` et `document_referentiels.portee_groupe` entrent
 *    dans une clé étrangère et PostgreSQL refuse qu'on leur donne une valeur.
 *    Toute insertion de ce module **nomme ses colonnes**, et la liste est
 *    filtrée sur `engendree = false` — découvert, pas recopié.
 *  · **`select *` est proscrit**. La colonne du secret d'`utilisateurs` n'est
 *    plus lisible du rôle applicatif : un `select *` y échoue. La règle vaut
 *    partout, y compris là où elle ne coûte rien aujourd'hui.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  4. Ce que ce module ne fait pas
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Il n'ouvre aucune transaction.** Il reçoit un `PoolClient` déjà dans une
 *    transaction ouverte par `avecTransaction` (`src/db/pool.ts`), qui est le
 *    seul endroit du serveur où le périmètre RLS se pose. Une opération
 *    composite (propagation, cascade, import) tient donc dans **un** appel du
 *    côté appelant : elle réussit entièrement ou pas du tout (contrôle S14).
 *  · **Il ne connaît pas HTTP.** Il lève une `ErreurAccesEntite` porteuse d'un
 *    motif métier ; `src/erreurs/` en fait un code de statut et une phrase.
 *  · **Il ne journalise pas en base.** Le journal d'audit est le lot L5.
 *  · Conséquence de ces deux dernières : ce fichier n'a **aucun import de
 *    valeur**. Il est exécutable tel quel par Node, donc éprouvable seul.
 */

// Seul import de VALEUR de ce fichier, et il ne coûte pas la propriété qui
// vaut au module d'être exécutable tel quel par le banc d'essai : ce qui met
// Node en défaut quand il dépouille les types, ce sont les spécificateurs
// relatifs en « .js » qui désignent un « .ts » — pas les modules internes,
// qu'il résout toujours. `src/api/index.ts` en use déjà de la même façon.
import { createHash, randomBytes } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { PerimetreSession } from '../db/pool.js';
import type {
  BilanReprise,
  Catalogue,
  DescriptionCleEtrangere,
  DescriptionColonne,
  DescriptionEntite,
  DescriptionLiaison,
  DescriptionTable,
  DescriptionUnicite,
  DescriptionValidation,
  Diagnostic,
  Enregistrement,
  FamilleType,
  JeuDeDonnees,
  ModeReprise,
  MotifEchec,
  NomEntite,
  Rafraichissement,
} from './types.js';

/* =====================================================================
 *  §1 — Bornes (contrôle S13)
 * ===================================================================== */

/**
 * Plafonds. Ils ne sont pas décoratifs : le chargement initial rend le jeu de
 * données **entier** d'une filiale (`PLAN_SERVEUR` §1.3), ce qui est tenable
 * pour « quelques milliers d'enregistrements » et ne l'est plus au-delà. Un
 * dépassement est donc une **erreur explicite**, jamais une troncature
 * silencieuse : une liste tronquée sans le dire ferait disparaître des risques
 * d'un tableau de bord de conformité.
 */
export const BORNES = Object.freeze({
  /** Lignes par collection au chargement initial. */
  lignesParCollection: 20000,
  /** Lignes de liaison rapportées pour une collection. */
  lignesParLiaison: 100000,
  /** Enregistrements rendus par un sondage de rafraîchissement. */
  lignesParSondage: 2000,
  /** Champs d'un enregistrement soumis en écriture. */
  champsParEnregistrement: 80,
  /** Éléments d'un tableau de liaison soumis en écriture. */
  elementsParLiaison: 1000,
  /** Caractères d'une valeur texte soumise en écriture. */
  caracteresParValeur: 200000,
  /** Profondeur d'un document JSON soumis en écriture (`items`, `etapes_pra`…). */
  profondeurJson: 12,
  /** Nœuds d'un document JSON soumis en écriture. */
  noeudsJson: 20000,
  /**
   * Marge de sûreté du repère de sondage, en millisecondes (constat M-7).
   *
   * Elle doit couvrir la **durée maximale d'une transaction d'écriture**, car
   * une écriture estampille `modifie_le` à l'ouverture de sa transaction et
   * devient visible à sa validation. Les deux bornes qui l'encadrent sont
   * posées à la connexion par `src/db/pool.ts` (`statement_timeout`,
   * `idle_in_transaction_session_timeout`) et valent quelques dizaines de
   * secondes. Soixante secondes les couvrent largement.
   *
   * Ce que la marge coûte : quelques enregistrements renvoyés pour rien à
   * chaque sondage. Ce qu'elle évite : qu'une modification validée juste après
   * une lecture ne soit **jamais** rendue à personne.
   */
  margeSondageMs: 60000,
});

/** Ce que la reprise attend d'un journal, sans dépendre du serveur HTTP. */
export interface JournalMinimalReprise {
  warn(donnees: unknown, message?: string): void;
}

/** Version de schéma du modèle navigateur servie par cette API. */
export const VERSION_SCHEMA = 12;

/**
 * Les cinq colonnes du bloc de traçabilité (`CONVENTIONS.md` §3). Elles sont
 * **imposées par la base** et ne sont jamais écrites d'ici (§18.1).
 */
const COLONNES_TRACABILITE: ReadonlySet<string> = new Set([
  'version',
  'cree_le',
  'cree_par',
  'modifie_le',
  'modifie_par',
]);

/** Champs structurels de l'enveloppe, jamais des données. */
const CHAMP_VERSION = '_version';
const CHAMP_VERSION_SECONDE = '_versionMiseEnOeuvre';
const CHAMPS_STRUCTURELS: ReadonlySet<string> = new Set([CHAMP_VERSION, CHAMP_VERSION_SECONDE]);

/* =====================================================================
 *  §2 — Erreur de la couche d'accès
 * ===================================================================== */

/**
 * Échec métier de la couche d'accès. Sa forme publique est décrite dans
 * `types.ts` (`ErreurEntite`) pour que `src/erreurs/` la reconnaisse **sans
 * importer cette classe** — les deux modules restent exécutables séparément.
 */
export class ErreurAccesEntite extends Error {
  public readonly nomErreur = 'ErreurEntite' as const;
  public readonly motif: MotifEchec;
  public readonly detailJournal: string | undefined;
  public readonly entite: string | undefined;
  public readonly identifiant: string | undefined;
  public readonly versionActuelle: number | undefined;
  public readonly erreurBase: Record<string, unknown> | undefined;

  constructor(parametres: {
    motif: MotifEchec;
    message: string;
    detailJournal?: string | undefined;
    entite?: string | undefined;
    identifiant?: string | undefined;
    versionActuelle?: number | undefined;
    erreurBase?: Record<string, unknown> | undefined;
  }) {
    super(parametres.message);
    this.name = 'ErreurAccesEntite';
    this.motif = parametres.motif;
    this.detailJournal = parametres.detailJournal;
    this.entite = parametres.entite;
    this.identifiant = parametres.identifiant;
    this.versionActuelle = parametres.versionActuelle;
    this.erreurBase = parametres.erreurBase;
  }
}

/** Le registre et le schéma divergent : le service ne doit pas servir. */
export class ErreurRegistre extends Error {
  public readonly anomalies: readonly string[];

  constructor(anomalies: readonly string[]) {
    super(
      `Registre d'entités incohérent avec le schéma PostgreSQL — ${String(anomalies.length)} ` +
        `anomalie(s) :\n${anomalies.map((a) => `  - ${a}`).join('\n')}`,
    );
    this.name = 'ErreurRegistre';
    this.anomalies = anomalies;
  }
}

function invalide(message: string, detail?: string): ErreurAccesEntite {
  return new ErreurAccesEntite({ motif: 'donnee_invalide', message, detailJournal: detail });
}

function incoherent(message: string): ErreurAccesEntite {
  return new ErreurAccesEntite({
    motif: 'etat_incoherent',
    message: "Le serveur n'a pas pu traiter la demande. L'incident est journalisé.",
    detailJournal: message,
  });
}

/* =====================================================================
 *  §3 — Identifiants SQL : liste blanche close (contrôle S5)
 * ===================================================================== */

/**
 * Encadre un identifiant SQL.
 *
 * **Toute valeur est paramétrée** dans ce module ; les seuls fragments
 * interpolés sont des noms de table et de colonne, et ils viennent
 * exclusivement de deux sources closes : le **registre** (écrit ici) et le
 * **catalogue** (lu dans `pg_catalog`). Aucun ne vient d'une entrée
 * utilisateur : un nom d'entité reçu par l'API sert de **clé** dans le
 * registre, jamais de fragment de requête.
 *
 * Le contrôle de forme ci-dessous est donc une redondance — et c'est
 * délibéré : il transforme un futur écart de discipline en échec immédiat
 * plutôt qu'en injection.
 */
function ident(nom: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(nom)) {
    throw incoherent(`Identifiant SQL non conforme à la liste blanche : ${JSON.stringify(nom)}`);
  }
  return `"${nom}"`;
}

/* =====================================================================
 *  §4 — LE REGISTRE
 * ---------------------------------------------------------------------
 *  Ce que PostgreSQL ne peut pas deviner, et rien d'autre.
 *
 *  Ne figurent ici NI les colonnes, NI leurs types, NI leur caractère
 *  obligatoire, NI les colonnes engendrées : tout cela est découvert (§5).
 *  Ne figurent que :
 *    · le nom frontend de l'entité et sa table ;
 *    · le préfixe d'identifiant du CONVENTIONS.md §2 ;
 *    · les ALIAS, c'est-à-dire les champs dont le nom diffère de la colonne ;
 *    · les champs acceptés mais non stockés ;
 *    · les LIAISONS n-n (CONVENTIONS.md §7) ;
 *    · la SCISSION des mesures (CONVENTIONS.md §16.2), qui ne se déduit
 *      d'aucun catalogue puisque les deux tables portent chacune une colonne
 *      « statut » de sens différent ;
 *    · les colonnes délibérément non exposées, avec leur raison — pour que le
 *      garde-fou du §6 les tienne pour voulues au lieu de les signaler.
 * ===================================================================== */

const REGISTRE: ReadonlyMap<NomEntite, DescriptionEntite> = new Map<NomEntite, DescriptionEntite>([
  ['clients', { nom: 'clients', table: 'clients', prefixe: 'CLI' }],

  ['exigences', { nom: 'exigences', table: 'exigences', prefixe: 'EX' }],

  ['actions', { nom: 'actions', table: 'actions', prefixe: 'ACT' }],

  [
    'risques',
    {
      nom: 'risques',
      table: 'risques',
      prefixe: 'RISK',
      liaisons: [
        {
          champ: 'exigences_liees',
          table: 'risque_exigences',
          colonneParent: 'risque_id',
          colonneEnfant: 'exigence_id',
          forme: 'identifiants',
        },
      ],
    },
  ],

  [
    'actifs',
    {
      nom: 'actifs',
      table: 'actifs',
      prefixe: 'ACTIF',
      liaisons: [
        {
          champ: 'risques_lies',
          table: 'actif_risques',
          colonneParent: 'actif_id',
          colonneEnfant: 'risque_id',
          forme: 'identifiants',
        },
        {
          // v9 — cartographie. L'attribut « type » fait partie de l'identité du
          // lien (CONVENTIONS.md §7) : « A est hébergé sur B » ET « A est
          // sauvegardé par B » coexistent, et le frontend dédoublonne déjà sur
          // le couple (cible, type).
          champ: 'dependances',
          table: 'actif_dependances',
          colonneParent: 'actif_id',
          colonneEnfant: 'actif_cible_id',
          forme: 'objets',
          attributs: { to: 'actif_cible_id', type: 'type' },
        },
      ],
    },
  ],

  [
    'processus',
    {
      nom: 'processus',
      table: 'processus',
      prefixe: 'BIA',
      liaisons: [
        {
          champ: 'actifs_lies',
          table: 'processus_actifs',
          colonneParent: 'processus_id',
          colonneEnfant: 'actif_id',
          forme: 'identifiants',
        },
      ],
    },
  ],

  ['crise', { nom: 'crise', table: 'crise', prefixe: 'CRISE' }],

  ['scenarios_pra', { nom: 'scenarios_pra', table: 'scenarios_pra', prefixe: 'SCEN' }],

  [
    'tests_pra',
    { nom: 'tests_pra', table: 'tests_pra', prefixe: 'TEST', alias: { date: 'date_test' } },
  ],

  [
    'prestataires',
    {
      nom: 'prestataires',
      table: 'prestataires',
      prefixe: 'PREST',
      // `phone` et `supplyChain` sont les noms du modèle navigateur
      // (DATA_MODEL.md §2) ; les colonnes suivent la convention française et
      // le snake_case du CONVENTIONS.md §1.
      alias: { phone: 'telephone', supplyChain: 'supply_chain' },
    },
  ],

  [
    'mco_actions',
    {
      nom: 'mco_actions',
      table: 'mco_actions',
      prefixe: 'MCO',
      alias: {
        datePrevue: 'date_prevue',
        dateReelle: 'date_reelle',
        dateCloture: 'date_cloture',
      },
    },
  ],

  [
    'audits',
    {
      nom: 'audits',
      table: 'audits',
      prefixe: 'AUD',
      alias: { ref: 'reference', date: 'date_audit' },
    },
  ],

  [
    'revues',
    {
      nom: 'revues',
      table: 'revues',
      prefixe: 'REV',
      alias: { date: 'date_revue', inputs: 'donnees_entree', outputs: 'donnees_sortie' },
    },
  ],

  [
    'evaluations',
    {
      nom: 'evaluations',
      table: 'evaluations',
      prefixe: 'EVAL',
      liaisons: [
        {
          // v12 — une exigence peut être couverte par PLUSIEURS mesures.
          // La liaison porte un filiale_id : mesure_catalogue est mixte
          // (CONVENTIONS.md §16.5).
          champ: 'mesure_ids',
          table: 'evaluation_mesures',
          colonneParent: 'evaluation_id',
          colonneEnfant: 'mesure_id',
          forme: 'identifiants',
        },
      ],
    },
  ],

  [
    'mesures',
    {
      // ── LA SCISSION (PLAN_SERVEUR §2.2, CONVENTIONS.md §16.2) ────────────
      // L'entité unique du modèle navigateur portait deux choses de nature
      // différente : la DÉFINITION du contrôle (la même partout, niveau
      // Groupe) et son ÉVALUATION (propre à chaque site, niveau Filiale).
      // Le frontend continue de voir UNE entité ; le serveur en tient deux.
      //
      // La répartition ne peut pas se déduire du catalogue : les deux tables
      // portent une colonne « statut », de sens opposé — cycle de vie du
      // contrôle d'un côté (active/archivee), conformité de l'autre. C'est
      // exactement le genre de chose que le registre doit dire.
      nom: 'mesures',
      table: 'mesure_catalogue',
      prefixe: 'MESURE',
      colonnesReservees: {
        statut:
          'Cycle de vie du contrôle (active/archivee) — piloté par l’archivage du lot L4, ' +
          'pas par la saisie. Le « statut » du frontend est celui de la mise en oeuvre.',
        archive_le: "Date d'archivage, posée avec le statut de cycle de vie (lot L4).",
        reference: 'Référence du socle Groupe — administration Groupe, lot L4.',
        domaine: 'Domaine du socle Groupe — administration Groupe, lot L4.',
      },
      seconde: {
        table: 'mesure_mise_en_oeuvre',
        champs: ['statut', 'maturite', 'responsable', 'commentaire'],
      },
    },
  ],

  [
    'incidents',
    {
      nom: 'incidents',
      table: 'incidents',
      prefixe: 'INC',
      liaisons: [
        {
          champ: 'actifs_touches',
          table: 'incident_actifs',
          colonneParent: 'incident_id',
          colonneEnfant: 'actif_id',
          forme: 'identifiants',
        },
      ],
    },
  ],

  [
    'documents',
    {
      nom: 'documents',
      table: 'documents',
      prefixe: 'DOC',
      // ⚠️ Le champ « version » du modèle navigateur est la version du
      // DOCUMENT (« 1.2 », du texte), et non le compteur de verrouillage
      // optimiste. La colonne « version » de la table est ce compteur : elle
      // est de traçabilité, donc jamais écrite d'ici. L'alias lève
      // l'ambiguïté, et le garde-fou du §6 refuse qu'un alias vise une
      // colonne exposée sous son propre nom.
      alias: { version: 'version_document' },
      colonnesReservees: {
        portee_groupe:
          'Colonne ENGENDRÉE (CONVENTIONS.md §18.6) : elle entre dans une clé étrangère et ' +
          "PostgreSQL refuse qu'on lui donne une valeur. Elle se déduit de filiale_id.",
      },
      liaisons: [
        {
          champ: 'referentiels',
          table: 'document_referentiels',
          colonneParent: 'document_id',
          colonneEnfant: 'ref_id',
          forme: 'identifiants',
        },
      ],
    },
  ],

  [
    'traitements',
    {
      nom: 'traitements',
      table: 'traitements',
      prefixe: 'TRT',
      liaisons: [
        {
          champ: 'mesures_ids',
          table: 'traitement_mesures',
          colonneParent: 'traitement_id',
          colonneEnfant: 'mesure_id',
          forme: 'identifiants',
        },
      ],
    },
  ],

  [
    'mappings',
    {
      nom: 'mappings',
      table: 'mappings',
      prefixe: 'MAP',
      // `_deleted` est la pierre tombale du modèle navigateur : masquer un
      // groupe du catalogue statique sans le supprimer.
      alias: { _deleted: 'masque' },
      liaisons: [
        {
          // `refs` = { ref_id: [codes] } — un objet de listes, que les trois
          // interdits du CONVENTIONS.md §6 excluent du jsonb.
          champ: 'refs',
          table: 'mapping_exigences',
          colonneParent: 'mapping_id',
          colonneEnfant: 'code',
          forme: 'objet-de-listes',
          colonneCle: 'ref_id',
        },
      ],
    },
  ],

  [
    'history',
    {
      nom: 'history',
      table: 'history',
      prefixe: 'HIST',
      alias: { ts: 'horodatage', date: 'date_point' },
    },
  ],

  [
    'personnes',
    {
      nom: 'personnes',
      table: 'personnes',
      prefixe: 'PERS',
      colonnesReservees: {
        utilisateur_id:
          "Rattachement au compte applicatif, alimenté par le provisionnement depuis l'Active " +
          'Directory (PLAN_SERVEUR §1.5) — lot L3, jamais par la saisie.',
      },
    },
  ],
]);

/** Ordre de chargement : celui d'`ARRAY_FIELDS` du frontend. */
const ORDRE_ENTITES: readonly NomEntite[] = [...REGISTRE.keys()];

/** Champ accepté par toute entité mais non stocké : dérivé de la traçabilité. */
const CHAMPS_IGNORES_GLOBAUX: ReadonlySet<string> = new Set(['updatedAt']);

/** L'entité existe-t-elle ? Seul point d'entrée : un nom reçu n'est qu'une clé. */
export function estEntiteConnue(nom: string): nom is NomEntite {
  return REGISTRE.has(nom as NomEntite);
}

export function listerEntites(): readonly NomEntite[] {
  return ORDRE_ENTITES;
}

function description(entite: NomEntite): DescriptionEntite {
  const d = REGISTRE.get(entite);
  if (d === undefined) throw incoherent(`Entité absente du registre : ${entite}`);
  return d;
}

/* =====================================================================
 *  §5 — DÉCOUVERTE DU CATALOGUE
 * ===================================================================== */

/** Familles de conversion, par type de base PostgreSQL. */
const FAMILLES: ReadonlyMap<string, FamilleType> = new Map<string, FamilleType>([
  ['text', 'texte'],
  ['varchar', 'texte'],
  ['bpchar', 'texte'],
  ['inet', 'texte'],
  ['int2', 'entier'],
  ['int4', 'entier'],
  ['int8', 'entier'],
  ['numeric', 'nombre'],
  ['float4', 'nombre'],
  ['float8', 'nombre'],
  ['bool', 'booleen'],
  ['date', 'date'],
  ['timestamptz', 'horodatage'],
  ['timestamp', 'horodatage'],
  ['jsonb', 'json'],
  ['json', 'json'],
]);

interface LigneCatalogue {
  table: string;
  colonne: string;
  type: string;
  type_base: string;
  obligatoire: boolean;
  engendree: boolean;
  avec_defaut: boolean;
  cle_primaire: boolean;
  rls_active: boolean;
  rls_forcee: boolean;
}

/**
 * Découvre les tables du schéma `public`, colonnes comprises.
 *
 * Une seule requête, sur `pg_catalog` : les types y sont résolus **à travers
 * les domaines** (`id_metier`, `empreinte_sha256`, `code_langue`…), sans quoi
 * la couche d'écriture ne saurait pas convertir une valeur JSON. Le catalogue
 * porte aussi l'état de la RLS, dont le garde-fou du §6 se sert.
 */
export async function chargerCatalogue(client: PoolClient): Promise<Catalogue> {
  const validations = new Map<string, DescriptionValidation>();
  const videsInterdits = await decouvrirVidesInterdits(client, validations);
  const unicites = await decouvrirUnicites(client);
  const clesEtrangeres = await decouvrirClesEtrangeres(client);

  const { rows } = await client.query<LigneCatalogue>(`
    select c.relname                                              as table,
           a.attname                                              as colonne,
           format_type(a.atttypid, a.atttypmod)                   as type,
           coalesce(bt.typname, t.typname)                        as type_base,
           a.attnotnull                                           as obligatoire,
           (a.attgenerated <> '')                                 as engendree,
           (d.adbin is not null and a.attgenerated = '')           as avec_defaut,
           coalesce(k.indisprimary, false)                        as cle_primaire,
           c.relrowsecurity                                       as rls_active,
           c.relforcerowsecurity                                  as rls_forcee
      from pg_class c
      join pg_namespace n  on n.oid = c.relnamespace
      join pg_attribute a  on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      join pg_type t       on t.oid = a.atttypid
      left join pg_type bt on bt.oid = t.typbasetype
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      left join lateral (
          select i.indisprimary
            from pg_index i
           where i.indrelid = c.oid and i.indisprimary
             and a.attnum = any (i.indkey)
           limit 1
      ) k on true
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by c.relname, a.attnum
  `);

  const brouillon = new Map<
    string,
    {
      colonnes: Map<string, DescriptionColonne>;
      clePrimaire: string[];
      rlsActive: boolean;
      rlsForcee: boolean;
    }
  >();

  for (const ligne of rows) {
    let table = brouillon.get(ligne.table);
    if (table === undefined) {
      table = {
        colonnes: new Map<string, DescriptionColonne>(),
        clePrimaire: [],
        rlsActive: ligne.rls_active,
        rlsForcee: ligne.rls_forcee,
      };
      brouillon.set(ligne.table, table);
    }

    const famille = FAMILLES.get(ligne.type_base);
    if (famille === undefined) {
      // Un type inconnu de la couche de conversion est une anomalie, pas un
      // cas à traiter au mieux : la découverte doit être BRUYANTE (§20.1).
      throw new ErreurRegistre([
        `${ligne.table}.${ligne.colonne} : type de base « ${ligne.type_base} » inconnu de la ` +
          'couche de conversion. Ajoutez-le à FAMILLES ou déclarez la colonne réservée.',
      ]);
    }

    table.colonnes.set(ligne.colonne, {
      nom: ligne.colonne,
      type: ligne.type,
      famille,
      obligatoire: ligne.obligatoire,
      engendree: ligne.engendree,
      avecDefaut: ligne.avec_defaut,
      videInterdit:
        famille === 'texte' && videsInterdits.has(`${ligne.table}.${ligne.colonne}`),
    });
    if (ligne.cle_primaire) table.clePrimaire.push(ligne.colonne);
  }

  const tables = new Map<string, DescriptionTable>();
  const etatsRls = new Map<string, { active: boolean; forcee: boolean }>();

  for (const [nom, brut] of brouillon) {
    const filiale = brut.colonnes.get('filiale_id');
    tables.set(nom, {
      nom,
      colonnes: brut.colonnes,
      clePrimaire: brut.clePrimaire,
      cloisonnee: filiale !== undefined,
      filialeNullable: filiale !== undefined && !filiale.obligatoire,
      versionnee: brut.colonnes.has('version'),
    });
    etatsRls.set(nom, { active: brut.rlsActive, forcee: brut.rlsForcee });
  }

  etatsRlsParCatalogue.set(tables, etatsRls);
  return { tables, validations, unicites, clesEtrangeres, decouvertLe: new Date() };
}

/**
 * Découvre les clés étrangères, avec leur action à la suppression.
 *
 * Elles servent à **dériver** deux ordres dont dépend la reprise d'un jeu de
 * données complet : celui dans lequel on purge une filiale, et celui dans
 * lequel on la réécrit. Les écrire à la main serait le motif que la porte S1 a
 * vu produire quatre défauts distincts (`CONVENTIONS.md` §19.5) — d'autant que
 * ces ordres changent à chaque migration qui ajoute une entité.
 */
async function decouvrirClesEtrangeres(
  client: PoolClient,
): Promise<DescriptionCleEtrangere[]> {
  const { rows } = await client.query<{
    nom: string;
    table: string;
    cible: string;
    action: string;
    colonnes: string[];
  }>(`
    select k.conname                                     as nom,
           c.relname                                     as table,
           p.relname                                     as cible,
           k.confdeltype                                 as action,
           array_agg(a.attname::text order by cle.rang)  as colonnes
      from pg_constraint k
      join pg_class c     on c.oid = k.conrelid
      join pg_class p     on p.oid = k.confrelid
      join pg_namespace n on n.oid = c.relnamespace
      join lateral unnest(k.conkey) with ordinality as cle(numero, rang) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = cle.numero
     where n.nspname = 'public'
       and k.contype = 'f'
     group by k.conname, c.relname, p.relname, k.confdeltype
  `);

  const actions: Record<string, DescriptionCleEtrangere['action']> = {
    c: 'cascade',
    n: 'set_null',
    d: 'set_default',
    r: 'restrict',
    a: 'restrict',
  };

  return rows.map((ligne) => ({
    nom: ligne.nom,
    table: ligne.table,
    cible: ligne.cible,
    colonnes: Array.isArray(ligne.colonnes) ? ligne.colonnes : [],
    // Une action inconnue est traitée comme la plus contraignante : mieux vaut
    // un ordre trop prudent qu'une suppression refusée en pleine reprise.
    action: actions[ligne.action] ?? 'restrict',
  }));
}

/* ---------------------------------------------------------------------
 *  Le « non renseigné » du navigateur contre celui du schéma (M-8)
 * ------------------------------------------------------------------- */

/**
 * Découvre les colonnes texte dont le schéma **refuse la chaîne vide**.
 *
 * ── Le défaut que cela ferme ───────────────────────────────────────────
 *
 * Le modèle navigateur n'a jamais porté de `null` : son « non renseigné » est
 * la chaîne vide, et c'est ce que les formulaires envoient — l'option
 * « — Non évaluée — » d'un prestataire, le « — À déterminer — » d'une base
 * légale RGPD. Le schéma, lui, code le non-renseigné par `NULL` : ses listes
 * fermées s'écrivent `colonne is null or colonne = any (array[…])`.
 *
 * Les deux conventions ne se rencontraient jamais, et le résultat était le
 * refus de l'enregistrement **entier** : deux modules — Prestataires et
 * registre RGPD — étaient inutilisables **par leur propre valeur par défaut**
 * (porte S2, constat M-8). Chacun avait raison de son côté ; c'est la jointure
 * qui manquait, et sa place est ici, au bord de l'écriture.
 *
 * ── Pourquoi une découverte, et pas une liste ─────────────────────────
 *
 * Une liste de colonnes « à convertir » serait exactement l'omission qui
 * attend du `CONVENTIONS.md` §19.5 : une valeur ajoutée à un `check` par une
 * migration future ne s'y inscrirait pas toute seule. La règle est donc lue
 * dans `pg_constraint`, et elle est double :
 *
 *  · une liste fermée qui **ne contient pas** `''` refuse la chaîne vide ;
 *  · un `check (colonne <> '')` la refuse explicitement.
 *
 * Deux colonnes échappent d'elles-mêmes à la conversion, et c'est voulu :
 * `evaluations.statut` et `mesure_mise_en_oeuvre.statut` admettent `''::text`
 * dans leur liste — c'est leur « non évalué », et il compte.
 *
 * ⚠️ Portée exacte, à ne pas surestimer : cette découverte lit le **texte** de
 * la contrainte. Un `check` qui refuserait la chaîne vide par un autre moyen —
 * une expression régulière, une fonction — lui échappe. Le filet, là, est le
 * message d'erreur : le refus reste bruyant et nomme le champ.
 */
async function decouvrirVidesInterdits(
  client: PoolClient,
  validations: Map<string, DescriptionValidation>,
): Promise<Set<string>> {
  const { rows } = await client.query<{
    nom: string;
    table: string;
    colonne: string;
    definition: string;
    surDomaine: boolean;
  }>(`
    -- Contraintes portées par la TABLE.
    select k.conname       as nom,
           c.relname       as table,
           a.attname::text as colonne,
           pg_get_constraintdef(k.oid) as definition,
           false           as "surDomaine"
      from pg_constraint k
      join pg_class c     on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join lateral unnest(k.conkey) as cle(numero) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = cle.numero
     where n.nspname = 'public'
       and k.contype = 'c'

    union all

    -- Contraintes portées par le DOMAINE de la colonne.
    --
    -- Elles échappaient au balayage — leur « conrelid » vaut zéro, c'est
    -- « contypid » qui porte le type — et c'est ce qui faisait refuser un
    -- « exigence_id » vide : le domaine « id_metier » interdit la chaîne vide,
    -- mais aucune contrainte de table ne le disait. Une reprise de l'export du
    -- produit échouait donc sur une action sans exigence (constat N-2). Le
    -- schéma dit la même chose des deux façons ; la découverte doit lire les
    -- deux.
    select k.conname       as nom,
           c.relname       as table,
           a.attname::text as colonne,
           pg_get_constraintdef(k.oid) as definition,
           true            as "surDomaine"
      from pg_constraint k
      join pg_type td     on td.oid = k.contypid
      join pg_attribute a on a.atttypid = td.oid and a.attnum > 0 and not a.attisdropped
      join pg_class c     on c.oid = a.attrelid and c.relkind in ('r', 'p')
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and k.contype = 'c'
  `);

  const interdits = new Set<string>();
  for (const ligne of rows) {
    // Le même balayage sert deux fins : savoir où la chaîne vide est refusée,
    // et savoir quelles colonnes chaque « check » porte — ce dont la
    // traduction d'un 23514 a besoin pour ne pas inventer un nom de champ.
    // Une contrainte de domaine porte le même nom pour toutes les colonnes qui
    // emploient ce domaine : on ne la recense pas comme une contrainte de
    // table, sans quoi son « colonnes » deviendrait un fourre-tout et le
    // message d'erreur nommerait n'importe quoi.
    if (!ligne.surDomaine) {
      const connue = validations.get(ligne.nom);
      if (connue === undefined) {
        validations.set(ligne.nom, { nom: ligne.nom, table: ligne.table, colonnes: [ligne.colonne] });
      } else {
        (connue.colonnes as string[]).push(ligne.colonne);
      }
    }

    const definition = ligne.definition;
    const listeFermee = definition.includes('= ANY (ARRAY[');
    const admetLeVide = definition.includes("''::text");
    const refuseLeVide = definition.includes("<> ''::text");

    if ((listeFermee && !admetLeVide) || refuseLeVide) {
      interdits.add(`${ligne.table}.${ligne.colonne}`);
    }
  }
  return interdits;
}

/* ---------------------------------------------------------------------
 *  Unicités — pour traduire un 23505 sans construire d'oracle
 * ------------------------------------------------------------------- */

/**
 * Découvre les contraintes d'unicité et **si elles portent `filiale_id`**.
 *
 * La distinction n'est pas cosmétique : les contrôles d'unicité contournent
 * délibérément la RLS (`CONVENTIONS.md` §19.1). Une unicité qui porte
 * `filiale_id` ne peut donc être heurtée que par une ligne **de la filiale de
 * l'appelant**, qu'il a le droit de lire — le message peut être précis. Une
 * unicité qui ne le porte pas est de portée Groupe, et le doublon peut venir
 * d'une ligne invisible : le message doit rester muet.
 */
async function decouvrirUnicites(client: PoolClient): Promise<Map<string, DescriptionUnicite>> {
  const { rows } = await client.query<{
    nom: string;
    table: string;
    colonnes: string[];
    cle_primaire: boolean;
  }>(`
    select k.conname                                as nom,
           c.relname                                as table,
           -- Le « ::text » n'est pas décoratif : attname est de type « name »,
           -- et le pilote pg n'a pas d'analyseur pour « name[] » — il rendrait
           -- la chaîne brute {a,b} au lieu d'un tableau. Le défaut serait
           -- SILENCIEUX : porteFiliale resterait juste par accident (une
           -- recherche de sous-chaîne), et la relecture d'un doublon itérerait
           -- sur des caractères. Constaté en jouant le cas, pas en le lisant.
           array_agg(a.attname::text order by cle.rang) as colonnes,
           (k.contype = 'p')                        as cle_primaire
      from pg_constraint k
      join pg_class c     on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      join lateral unnest(k.conkey) with ordinality as cle(numero, rang) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = cle.numero
     where n.nspname = 'public'
       and k.contype in ('p', 'u')
     group by k.conname, c.relname, k.contype
  `);

  const unicites = new Map<string, DescriptionUnicite>();
  for (const ligne of rows) {
    if (!Array.isArray(ligne.colonnes)) {
      throw new ErreurRegistre([
        `Unicité ${ligne.nom} : le catalogue rend ses colonnes sous une forme inattendue ` +
          `(${typeof ligne.colonnes}). La découverte doit être bruyante, pas approximative.`,
      ]);
    }
    unicites.set(ligne.nom, {
      nom: ligne.nom,
      table: ligne.table,
      colonnes: ligne.colonnes,
      clePrimaire: ligne.cle_primaire,
      porteFiliale: ligne.colonnes.includes('filiale_id'),
    });
  }
  return unicites;
}

/**
 * État RLS par catalogue. Il ne figure pas dans `DescriptionTable` parce qu'il
 * n'intéresse que le garde-fou : le rendre public inviterait le code métier à
 * s'y fier, alors que la RLS n'est pas un réglage qu'un appelant consulte.
 */
const etatsRlsParCatalogue = new WeakMap<
  ReadonlyMap<string, DescriptionTable>,
  Map<string, { active: boolean; forcee: boolean }>
>();

/* =====================================================================
 *  §6 — LE GARDE-FOU
 * ---------------------------------------------------------------------
 *  Il recoupe le registre (§4) et le catalogue (§5). Il est APPELÉ, et il
 *  fait échouer le démarrage : un garde-fou que rien n'appelle est un
 *  commentaire (CONVENTIONS.md §18.4, contrôle S16 de la grille).
 *
 *  ⚠️ Ce qu'il attrape, et RIEN DE PLUS (CONVENTIONS.md §17.5) : une
 *  divergence de NOMS et de FORMES entre le registre et le schéma. Il ne dit
 *  rien du SENS d'une correspondance — qu'un champ soit rangé dans la bonne
 *  colonne se prouve par le round-trip, pas par le catalogue.
 * ===================================================================== */
export function verifierRegistre(catalogue: Catalogue): readonly string[] {
  // Le contrôle du générateur d'identifiants se branche ICI, et pas dans une
  // liste d'appels à côté : `verifierRegistre` est le point unique par lequel
  // le démarrage de l'API vérifie ses garanties, comme `f_verifier_schema()`
  // l'est côté base (CONVENTIONS.md §18.4, §19.4). Un garde-fou que rien
  // n'appelle est un commentaire — c'est exactement ce que le constat Q-1
  // reprochait au précédent, qui gardait la bonne propriété sur la mauvaise
  // fonction.
  const anomalies: string[] = [...verifierGenerateurIdentifiants()];
  const etats = etatsRlsParCatalogue.get(catalogue.tables);

  for (const entite of ORDRE_ENTITES) {
    const d = description(entite);
    const tables: { table: string; reservees: Readonly<Record<string, string>> }[] = [
      { table: d.table, reservees: d.colonnesReservees ?? {} },
    ];
    if (d.seconde !== undefined) {
      tables.push({ table: d.seconde.table, reservees: d.seconde.colonnesReservees ?? {} });
    }

    for (const { table: nomTable, reservees } of tables) {
      const table = catalogue.tables.get(nomTable);
      if (table === undefined) {
        anomalies.push(`${entite} : table « ${nomTable} » absente du schéma.`);
        continue;
      }

      // (a) Le verrouillage optimiste a besoin de quelque chose à mordre.
      for (const colonne of COLONNES_TRACABILITE) {
        if (!table.colonnes.has(colonne)) {
          anomalies.push(
            `${entite} : ${nomTable} ne porte pas la colonne de traçabilité « ${colonne} » ` +
              '(CONVENTIONS.md §3). Le verrouillage optimiste ne peut pas y être posé.',
          );
        }
      }

      // (b) Une colonne engendrée non déclarée ferait échouer toute insertion
      //     (CONVENTIONS.md §18.6) : elle serait nommée par correspondance
      //     d'identité, et PostgreSQL refuse qu'on lui donne une valeur.
      for (const colonne of table.colonnes.values()) {
        if (colonne.engendree && reservees[colonne.nom] === undefined) {
          anomalies.push(
            `${entite} : ${nomTable}.${colonne.nom} est ENGENDRÉE et n'est pas déclarée ` +
              'réservée. Toute insertion la nommerait et échouerait (CONVENTIONS.md §18.6).',
          );
        }
      }

      // (c) Une colonne réservée doit exister : sinon la déclaration protège
      //     un fantôme, et la vraie colonne, elle, reste exposée.
      for (const nomColonne of Object.keys(reservees)) {
        if (!table.colonnes.has(nomColonne)) {
          anomalies.push(
            `${entite} : la colonne réservée ${nomTable}.${nomColonne} n'existe pas.`,
          );
        }
      }

      // (d) Le cloisonnement est la propriété qui tient tout le reste.
      const etat = etats?.get(nomTable);
      if (etat === undefined || !etat.active || !etat.forcee) {
        anomalies.push(
          `${entite} : ${nomTable} n'a pas « enable » ET « force row level security » ` +
            '(CONVENTIONS.md §11).',
        );
      }
    }

    // (e) Les alias visent une colonne existante, et lèvent une AMBIGUÏTÉ
    //     plutôt que d'en créer une : un alias dont le nom source est aussi
    //     une colonne exposée rendrait la correspondance dépendante d'un ordre
    //     d'évaluation. Le cas réel est `documents.version`, et il n'est
    //     acceptable que parce que la colonne homonyme est de traçabilité.
    const principale = catalogue.tables.get(d.table);
    if (principale !== undefined) {
      for (const [champ, colonne] of Object.entries(d.alias ?? {})) {
        const cible = colonneDe(catalogue, d, colonne);
        if (cible === null) {
          anomalies.push(`${entite} : l'alias « ${champ} » vise une colonne inconnue (${colonne}).`);
        }
        const homonyme = principale.colonnes.get(champ);
        if (homonyme !== undefined && !COLONNES_TRACABILITE.has(champ)) {
          anomalies.push(
            `${entite} : l'alias « ${champ} » est ambigu — une colonne de même nom existe et ` +
              "n'est pas de traçabilité.",
          );
        }
      }
    }

    // (f) Les liaisons : table, colonnes, attributs.
    for (const liaison of d.liaisons ?? []) {
      const table = catalogue.tables.get(liaison.table);
      if (table === undefined) {
        anomalies.push(`${entite} : table de liaison « ${liaison.table} » absente du schéma.`);
        continue;
      }
      for (const colonne of colonnesDeLiaison(liaison)) {
        if (!table.colonnes.has(colonne)) {
          anomalies.push(
            `${entite} : la liaison ${liaison.table} ne porte pas la colonne « ${colonne} ».`,
          );
        }
      }
      const etat = etats?.get(liaison.table);
      if (etat === undefined || !etat.active || !etat.forcee) {
        anomalies.push(
          `${entite} : la liaison ${liaison.table} n'a pas « enable » ET « force row level ` +
            'security » — or aucune clé étrangère ne peut l\'empêcher de relier deux filiales ' +
            '(CONVENTIONS.md §7).',
        );
      }
    }

    // (g) La scission des mesures répartit bien le « statut » homonyme.
    if (d.seconde !== undefined) {
      const principaleTable = catalogue.tables.get(d.table);
      const secondeTable = catalogue.tables.get(d.seconde.table);
      if (principaleTable !== undefined && secondeTable !== undefined) {
        for (const champ of d.seconde.champs) {
          const colonne = (d.alias ?? {})[champ] ?? champ;
          if (!secondeTable.colonnes.has(colonne)) {
            anomalies.push(
              `${entite} : le champ « ${champ} » est rangé dans ${d.seconde.table}, qui ne ` +
                `porte pas la colonne « ${colonne} ».`,
            );
          }
          if (
            principaleTable.colonnes.has(colonne) &&
            (d.colonnesReservees ?? {})[colonne] === undefined
          ) {
            anomalies.push(
              `${entite} : « ${colonne} » existe dans les DEUX tables sans que celle de ` +
                `${d.table} soit déclarée réservée — la répartition serait ambiguë ` +
                '(CONVENTIONS.md §16.2).',
            );
          }
        }
      }
    }
  }

  return anomalies;
}

function colonnesDeLiaison(liaison: DescriptionLiaison): readonly string[] {
  const colonnes = new Set<string>([liaison.colonneParent, liaison.colonneEnfant]);
  for (const colonne of Object.values(liaison.attributs ?? {})) colonnes.add(colonne);
  if (liaison.colonneCle !== undefined) colonnes.add(liaison.colonneCle);
  return [...colonnes];
}

function colonneDe(
  catalogue: Catalogue,
  d: DescriptionEntite,
  nomColonne: string,
): DescriptionColonne | null {
  const principale = catalogue.tables.get(d.table)?.colonnes.get(nomColonne);
  if (principale !== undefined) return principale;
  if (d.seconde !== undefined) {
    const seconde = catalogue.tables.get(d.seconde.table)?.colonnes.get(nomColonne);
    if (seconde !== undefined) return seconde;
  }
  return null;
}

/* =====================================================================
 *  §7 — CORRESPONDANCE CHAMP ↔ COLONNE
 * ===================================================================== */

interface Cible {
  readonly table: string;
  readonly colonne: DescriptionColonne;
}

/**
 * Où va un champ ? La réponse est **fermée** : alias, répartition de l'entité
 * scindée, puis identité. Un champ qui ne trouve pas sa colonne est **refusé**,
 * jamais ignoré en silence — une donnée saisie qui disparaît sans un mot est
 * pire qu'un refus.
 */
function cibleDuChamp(
  catalogue: Catalogue,
  d: DescriptionEntite,
  champ: string,
): Cible | 'ignore' | null {
  if (CHAMPS_IGNORES_GLOBAUX.has(champ)) return 'ignore';
  if ((d.champsIgnores ?? []).includes(champ)) return 'ignore';

  const nomColonne = (d.alias ?? {})[champ] ?? champ;

  // ── LA RÉPARTITION D'ABORD, LES RÉSERVES ENSUITE ─────────────────────
  // L'ordre n'est pas indifférent : sur `mesures`, « statut » est à la fois
  // une colonne RÉSERVÉE de `mesure_catalogue` (le cycle de vie du contrôle,
  // active/archivee) et un champ RÉPARTI vers `mesure_mise_en_oeuvre` (la
  // conformité). Tester la réserve en premier refuserait le champ que
  // l'application écrit tous les jours.
  const tableSeconde = d.seconde;
  if (tableSeconde !== undefined && tableSeconde.champs.includes(champ)) {
    if ((tableSeconde.colonnesReservees ?? {})[nomColonne] !== undefined) return null;
    const colonne = catalogue.tables.get(tableSeconde.table)?.colonnes.get(nomColonne);
    if (colonne === undefined) return null;
    return { table: tableSeconde.table, colonne };
  }

  // Une colonne réservée n'est pas exposée : la viser est une erreur d'entrée,
  // pas une omission de la correspondance.
  if ((d.colonnesReservees ?? {})[nomColonne] !== undefined) return null;

  const colonne = catalogue.tables.get(d.table)?.colonnes.get(nomColonne);
  if (colonne === undefined) return null;

  // Traçabilité, cloisonnement, identité : structurels, jamais des données.
  if (COLONNES_TRACABILITE.has(nomColonne)) return null;
  if (nomColonne === 'filiale_id' || nomColonne === 'id') return null;
  if (colonne.engendree) return null;

  return { table: d.table, colonne };
}

/** Colonnes exposées d'une table, dans l'ordre du catalogue. */
function champsExposes(catalogue: Catalogue, d: DescriptionEntite): Map<string, Cible> {
  const resultat = new Map<string, Cible>();
  const ajouter = (nomTable: string, filtre: ((c: string) => boolean) | null): void => {
    const table = catalogue.tables.get(nomTable);
    if (table === undefined) return;
    for (const colonne of table.colonnes.values()) {
      if (COLONNES_TRACABILITE.has(colonne.nom)) continue;
      if (colonne.nom === 'filiale_id' || colonne.nom === 'id') continue;
      if (colonne.engendree) continue;
      if ((d.colonnesReservees ?? {})[colonne.nom] !== undefined && nomTable === d.table) continue;
      if (
        d.seconde !== undefined &&
        nomTable === d.seconde.table &&
        (d.seconde.colonnesReservees ?? {})[colonne.nom] !== undefined
      ) {
        continue;
      }
      if (nomTable === (d.seconde?.table ?? '') && colonne.nom === 'mesure_id') continue;
      const champ = champDeColonne(d, nomTable, colonne.nom);
      if (filtre !== null && !filtre(champ)) continue;
      resultat.set(champ, { table: nomTable, colonne });
    }
  };

  if (d.seconde !== undefined) {
    ajouter(d.seconde.table, (champ) => d.seconde?.champs.includes(champ) === true);
  }
  ajouter(d.table, null);
  return resultat;
}

/** Nom frontend d'une colonne : l'alias inverse, ou la colonne elle-même. */
function champDeColonne(d: DescriptionEntite, nomTable: string, nomColonne: string): string {
  for (const [champ, colonne] of Object.entries(d.alias ?? {})) {
    if (colonne === nomColonne) {
      // Un alias ne vaut que pour la table qui porte la colonne visée.
      if (nomTable === d.table || nomTable === d.seconde?.table) return champ;
    }
  }
  return nomColonne;
}

/* =====================================================================
 *  §8 — LE DÉPÔT
 * ===================================================================== */

export interface OptionsCreation {
  /**
   * `filiale` (défaut) : la ligne appartient à la filiale active.
   * `groupe` : ligne de portée Groupe — **refusée** tant que la session ne
   * déclare pas une administration Groupe. Fail-closed : le lot L4 ouvrira ce
   * chemin, pas celui-ci.
   */
  readonly portee?: 'filiale' | 'groupe';

  /**
   * Identifiant **imposé** par l'appelant, au lieu d'être engendré.
   *
   * ⚠️ **Réservé au chemin de reprise, et hors de portée du réseau.** Aucune
   * route HTTP ne renseigne ce champ, et c'est une propriété de sécurité, pas
   * une commodité — c'est le constat **M-3** de la porte S2 :
   *
   *   > l'unicité de la clé primaire ignore la RLS (`CONVENTIONS.md` §19.1).
   *   > Laisser le client choisir son identifiant, c'est lui donner un
   *   > **oracle d'existence inter-filiales en une requête** : identifiant pris
   *   > ailleurs → 409, identifiant libre → 201. Et une variante silencieuse
   *   > qui, en joignant une liaison invalide, annule la transaction dans les
   *   > deux cas tout en rendant deux réponses distinctes.
   *
   * Le §8.7 de ce fichier refuse par ailleurs de construire cet oracle sur le
   * chemin de lecture ; le raisonnement était juste et n'avait été appliqué
   * qu'à une des deux routes. En engendrant l'identifiant côté serveur, la
   * branche qui dépendait de lui **disparaît** : il n'y a plus rien à observer.
   *
   * Le round-trip exact d'un export `grc-backup` (`CONVENTIONS.md` §2) reste
   * possible — c'est à cela que sert ce champ — mais il passera par le moteur
   * d'import **transactionnel et cloisonné** du lot L7, qui est un chemin
   * d'administration, pas la création d'un enregistrement à l'unité.
   */
  readonly identifiantImpose?: string | null;

  /**
   * Reçoit les champs sans destination au lieu de les faire refuser. Réservé
   * au chemin de reprise (voir `repartir`) : une écriture ordinaire refuse,
   * une reprise signale.
   */
  readonly signalerChampInconnu?: ((champ: string) => void) | null;

  /**
   * Reçoit les identifiants que le serveur a dû **ré-émettre** parce que celui
   * du fichier était déjà pris dans le domaine global (voir N-1 dans `creer`).
   * L'appelant s'en sert pour réécrire les références de la charge.
   *
   * ⚠️ Ce signal reste **côté serveur**. Le rendre à l'appelant rouvrirait
   * l'oracle par la petite porte : « ton identifiant a été renommé » veut dire
   * « il existe ailleurs ». Il part au journal technique, pas dans la réponse.
   */
  readonly signalerRenommage?: ((ancien: string, nouveau: string) => void) | null;
}

export class Depot {
  public readonly catalogue: Catalogue;

  constructor(catalogue: Catalogue) {
    this.catalogue = catalogue;
  }

  /* ---------------------------------------------------------------
   *  Description du modèle, pour le frontend et le banc d'essai.
   *  Ne nomme AUCUN objet de base : seulement le vocabulaire métier.
   * --------------------------------------------------------------- */
  public decrire(): Record<string, unknown> {
    const entites: Record<string, unknown> = {};
    for (const nom of ORDRE_ENTITES) {
      const d = description(nom);
      const exposes = champsExposes(this.catalogue, d);
      const champs: Record<string, { type: FamilleType; obligatoire: boolean }> = {};
      for (const [champ, cible] of exposes) {
        champs[champ] = {
          type: cible.colonne.famille,
          obligatoire: cible.colonne.obligatoire && !cible.colonne.avecDefaut,
        };
      }
      entites[nom] = {
        prefixe: d.prefixe,
        champs,
        liaisons: (d.liaisons ?? []).map((l) => ({ champ: l.champ, forme: l.forme })),
        scindee: d.seconde !== undefined,
      };
    }
    return { schemaVersion: VERSION_SCHEMA, entites, bornes: BORNES };
  }

  /* ===============================================================
   *  8.1 — Chargement initial du jeu de données d'une filiale
   * =============================================================== */

  /**
   * Rend l'intégralité du jeu de données de la filiale active, dans la forme
   * exacte de l'objet `data` du frontend (`PLAN_SERVEUR` §1.3).
   *
   * La transaction est ouverte **en lecture seule** par l'appelant : la base
   * refuse alors toute écriture, ce qui vaut mieux qu'une discipline.
   */
  public async chargerJeuDeDonnees(
    client: PoolClient,
    perimetre: PerimetreSession,
  ): Promise<JeuDeDonnees> {
    const filiale = this.filialeActive(perimetre);
    const horodatage = await this.repereDeSondage(client);
    const collections = {} as Record<NomEntite, Enregistrement[]>;
    const volumes = {} as Record<NomEntite, number>;
    let updatedAt: number | null = null;

    for (const nom of ORDRE_ENTITES) {
      const enregistrements = await this.lireCollection(client, nom, filiale, null);
      collections[nom] = enregistrements;
      volumes[nom] = enregistrements.length;
      for (const enregistrement of enregistrements) {
        const marque = enregistrement['updatedAt'];
        if (typeof marque === 'number' && (updatedAt === null || marque > updatedAt)) {
          updatedAt = marque;
        }
      }
    }

    return { schemaVersion: VERSION_SCHEMA, collections, volumes, horodatage, updatedAt };
  }

  /* ===============================================================
   *  8.2 — Sondage de rafraîchissement
   * =============================================================== */

  /**
   * Récupère ce qui a changé depuis `depuis`.
   *
   * ⚠️ **Ce sondage ne rend pas les suppressions**, et il ne prétend pas le
   * faire : rien ne les trace encore — il n'y a pas de pierre tombale, et le
   * journal d'audit est le lot L5. Ce qu'il rend en revanche, c'est le
   * **nombre de lignes par collection** : un écart avec ce que le client
   * détient signale une suppression et lui dit de recharger. C'est peu coûteux,
   * c'est exact, et cela vaut mieux qu'un mécanisme qui aurait l'air complet.
   */
  public async rafraichir(
    client: PoolClient,
    perimetre: PerimetreSession,
    depuis: Date,
  ): Promise<Rafraichissement> {
    const filiale = this.filialeActive(perimetre);
    const horodatage = await this.repereDeSondage(client);
    const modifications: Partial<Record<NomEntite, Enregistrement[]>> = {};
    const volumes = {} as Record<NomEntite, number>;
    let restant: number = BORNES.lignesParSondage;
    let tronque = false;

    for (const nom of ORDRE_ENTITES) {
      volumes[nom] = await this.compterCollection(client, nom, filiale);
      if (restant <= 0) {
        tronque = true;
        continue;
      }
      const enregistrements = await this.lireCollection(client, nom, filiale, {
        depuis,
        plafond: restant + 1,
      });
      if (enregistrements.length > restant) {
        tronque = true;
        modifications[nom] = enregistrements.slice(0, restant);
        restant = 0;
      } else if (enregistrements.length > 0) {
        modifications[nom] = enregistrements;
        restant -= enregistrements.length;
      }
    }

    return { horodatage, modifications, volumes, tronque };
  }

  /**
   * Repère à renvoyer au client comme base de son prochain sondage.
   *
   * ── M-7 : pourquoi ce n'est pas `new Date()` ─────────────────────────
   *
   * La première rédaction prenait l'heure **après** la lecture, côté serveur.
   * Un écrivain concurrent estampille `modifie_le` à l'ouverture de **sa**
   * transaction — donc plus tôt — et valide plus tard : sa modification
   * portait une date antérieure au repère et devenait invisible au sondage
   * suivant. Les volumes n'ayant pas bougé, le filet « écart de volume ⇒
   * rechargement » ne se déclenchait pas non plus, et la modification était
   * **définitivement perdue pour le lecteur**. Rejoué et mesuré par la porte
   * S2 ; l'intégrité n'était pas en cause, la fraîcheur l'était — et sur un
   * tableau de bord de conformité, une valeur périmée lue comme courante est
   * exactement ce qu'un auditeur regarde.
   *
   * Deux corrections, cumulatives :
   *
   *  1. l'heure vient de **PostgreSQL**, et c'est celle du **début de la
   *     transaction** (`transaction_timestamp()`), pas de la fin de la lecture.
   *     Elle est aussi immunisée contre une dérive d'horloge entre le serveur
   *     applicatif et la base ;
   *  2. on lui retranche une **marge** qui couvre la durée maximale d'une
   *     transaction d'écriture (`BORNES.margeSondageMs`).
   *
   * ⚠️ Ce que cela ne fait pas : rendre les **suppressions**. Rien ne les trace
   * encore (le journal d'audit est le lot L5) ; c'est l'écart de volume qui les
   * signale, et c'est dit tel quel dans `rafraichir`.
   */
  private async repereDeSondage(client: PoolClient): Promise<string> {
    const { rows } = await client.query<{ t: Date }>('select transaction_timestamp() as t');
    const debut = rows[0]?.t;
    const millisecondes =
      debut instanceof Date ? debut.getTime() : new Date(String(debut ?? '')).getTime();
    const base = Number.isNaN(millisecondes) ? Date.now() : millisecondes;
    return new Date(base - BORNES.margeSondageMs).toISOString();
  }

  /* ===============================================================
   *  8.3 — Création
   * =============================================================== */

  public async creer(
    client: PoolClient,
    perimetre: PerimetreSession,
    entite: NomEntite,
    champs: Enregistrement,
    options: OptionsCreation = {},
  ): Promise<Enregistrement> {
    const d = description(entite);
    const filiale = this.filialeActive(perimetre);
    this.exigerDroitEcriture(d, perimetre, entite);
    const portee = options.portee ?? 'filiale';

    if (portee === 'groupe' && !perimetre.administrationGroupe) {
      throw new ErreurAccesEntite({
        motif: 'refus_perimetre',
        message:
          'La création d’un enregistrement de portée Groupe est réservée à une administration ' +
          'Groupe. Cet écran ne la propose pas encore (lot L4).',
        entite,
      });
    }
    const table = this.table(d.table);
    if (portee === 'groupe' && !table.filialeNullable) {
      throw invalide(`L'entité « ${entite} » n'admet pas de portée Groupe.`);
    }
    const filialeLigne = portee === 'groupe' ? null : filiale;

    // L'identifiant vient du serveur, sauf sur le chemin de reprise (voir
    // OptionsCreation.identifiantImpose : aucune route HTTP ne le renseigne).
    const identifiant = options.identifiantImpose ?? engendrerIdentifiant(d.prefixe);
    verifierIdentifiant(identifiant);

    const { valeurs, liaisons } = this.repartir(
      d,
      champs,
      entite,
      options.signalerChampInconnu ?? null,
    );

    // La table principale d'abord : c'est elle qui porte l'identité, et les
    // clés étrangères des autres tables la visent.
    const principales = valeurs.get(d.table) ?? new Map<string, unknown>();
    let identifiantRetenu = identifiant;
    const tentative = await this.avecPointDeReprise(client, 'pr_creation', () =>
      this.inserer(client, d.table, identifiant, filialeLigne, principales, entite),
    );

    if (!tentative.ok) {
      // ══ N-1 : LE DOUBLON DE CLÉ GLOBALE NE DOIT RIEN APPRENDRE ═══════
      //
      // L'espace des identifiants est de niveau **Groupe** : la clé primaire
      // porte `id` seul, et les contrôles d'unicité contournent délibérément la
      // RLS (`CONVENTIONS.md` §19.1). Un identifiant proposé par l'appelant et
      // déjà pris par une filiale **invisible** produit donc un `23505` — et ce
      // refus, à lui seul, répond « cette ligne existe » à qui ne peut pas la
      // lire.
      //
      // Le constat M-3 avait fermé ce canal sur la route de création, en
      // retirant l'identifiant de la surface HTTP. La route de **reprise** l'a
      // rouvert, parce qu'elle conserve les identifiants du fichier — ce qui
      // est correct pour son objet (`CONVENTIONS.md` §2, round-trip exact) et
      // ne peut donc pas être retiré. Constat N-1 du second passage, aggravé
      // par l'aperçu, qui n'écrit rien et ne laisse donc aucune trace.
      //
      // ── Pourquoi refuser ne referme rien ────────────────────────────
      //
      // Toute réponse qui distingue « pris » de « libre » est l'oracle,
      // quel qu'en soit le texte : un refus poli reste un refus, et le succès
      // reste un succès. Rendre le message indistinct ne suffit pas ; il faut
      // que **l'issue** le soit.
      //
      // ── Ce qu'on fait donc : on n'échoue pas, on renomme ────────────
      //
      // L'identifiant est ré-émis par le serveur, et **toutes les références
      // qui le visaient dans la charge sont réécrites** (voir le plan de
      // renommage d'`appliquerReprise`). Les deux issues deviennent identiques
      // — 200, un enregistrement créé — et le canal disparaît au lieu d'être
      // habillé.
      //
      // Ce que cela coûte : l'identifiant d'un enregistrement peut différer de
      // celui du fichier. Ce que cela préserve, et qui est la vraie exigence du
      // §2 : **les références continuent de pointer sans table de
      // correspondance**. En usage légitime le cas ne se produit jamais — les
      // identifiants portent un horodatage et un aléa, et un export d'une
      // filiale ne contient que ses propres lignes.
      //
      // Et cela referme du même coup la face INTÉGRITÉ du constat : une filiale
      // ne peut plus, en occupant un identifiant du domaine global, empêcher
      // définitivement une autre filiale de reprendre son export.
      const global = this.doublonDeCleGlobale(tentative.erreur);

      if (!global || options.identifiantImpose === undefined || options.identifiantImpose === null) {
        throw await this.enrichirDoublon(
          client,
          tentative.erreur,
          d.table,
          principales,
          filialeLigne,
          entite,
        );
      }

      // Q-2 : DÉRIVÉ, pas tiré. Un tirage neuf à chaque reprise fabriquait un
      // clone de plus à chaque fois ; une empreinte de (filiale, table,
      // identifiant du fichier) rend la seconde reprise convergente — c'est
      // `appliquerReprise` qui exploite cette stabilité pour RETROUVER la
      // ligne au lieu d'en créer une autre.
      identifiantRetenu = identifiantDerive(d.prefixe, filialeLigne, d.table, identifiant);
      options.signalerRenommage?.(identifiant, identifiantRetenu);
      await this.inserer(client, d.table, identifiantRetenu, filialeLigne, principales, entite);
    }
    const identifiantFinal = identifiantRetenu;

    if (d.seconde !== undefined) {
      // Mise en oeuvre du contrôle : toujours LOCALE à la filiale active,
      // même quand la définition est de portée Groupe (CONVENTIONS.md §16.2).
      const secondaires = valeurs.get(d.seconde.table) ?? new Map<string, unknown>();
      secondaires.set('mesure_id', identifiantFinal);
      await this.inserer(
        client,
        d.seconde.table,
        engendrerIdentifiant('MMO'),
        filiale,
        secondaires,
        entite,
        // N-10 : un refus doit désigner l'enregistrement que l'appelant
        // connaît — la mesure — et non le « MMO-… » que le serveur vient
        // d'engendrer, qui n'existera même pas si la transaction est annulée.
        identifiantFinal,
      );
    }

    for (const [liaison, elements] of liaisons) {
      await this.ecrireLiaison(client, liaison, identifiantFinal, filialeLigne, elements, entite);
    }

    const relu = await this.lireUn(client, entite, identifiantFinal, filiale);
    if (relu === null) {
      throw incoherent(
        `Enregistrement ${entite}/${identifiantFinal} inséré puis illisible dans la même ` +
          'transaction.',
      );
    }
    return relu;
  }

  /* ===============================================================
   *  8.4 — Modification, et le verrouillage optimiste
   * =============================================================== */

  /**
   * Écriture ciblée, protégée par le verrouillage optimiste.
   *
   * Sémantique **partielle** : seuls les champs présents dans `champs` sont
   * écrits ; les autres sont laissés tels quels. Le frontend envoyant
   * l'enregistrement entier, le comportement observable est le même — mais un
   * appelant qui ne connaît qu'un champ n'écrase pas le reste.
   */
  public async modifier(
    client: PoolClient,
    perimetre: PerimetreSession,
    entite: NomEntite,
    identifiant: string,
    version: number,
    champs: Enregistrement,
    versionSeconde: number | null = null,
    signalerChampInconnu: ((champ: string) => void) | null = null,
  ): Promise<Enregistrement> {
    const d = description(entite);
    const filiale = this.filialeActive(perimetre);
    verifierIdentifiant(identifiant);

    const { valeurs, liaisons } = this.repartir(d, champs, entite, signalerChampInconnu);
    let principales = valeurs.get(d.table) ?? new Map<string, unknown>();

    // ══ CE QUI N'A PAS CHANGÉ NE S'ÉCRIT PAS ═══════════════════════════
    //
    //   > **Un enregistrement qui ne change rien n'exige pas le droit de
    //   > l'écrire.**
    //
    // Le principe est né du constat M-1 (une filiale ne pouvait pas évaluer un
    // contrôle du socle Groupe, parce que le navigateur renvoyait aussi la
    // définition inchangée). Je l'avais alors restreint aux entités SCINDÉES,
    // en croyant qu'ailleurs « refuser était le comportement juste ». C'était
    // une demi-mesure, et elle s'est payée : le second passage de la porte a
    // montré que **le produit ne sait pas reprendre son propre export**
    // (constat N-2). Le fichier que l'application exporte contient le socle
    // Groupe — c'est normal, la filiale le lit —, et le renvoyer à l'identique
    // se heurtait à quatre refus en cascade : les correspondances, puis une
    // mesure, un document et une personne de portée Groupe.
    //
    // Or aucun de ces quatre renvois ne CHANGE quoi que ce soit. Le principe
    // est donc général, et il l'est maintenant : colonnes **et** liaisons, sur
    // **toutes** les entités. Le droit d'écrire est exigé exactement quand une
    // écriture aurait lieu, et à aucun autre moment.
    if (principales.size > 0) {
      principales = await this.retirerLesInchangees(client, d.table, identifiant, principales);
    }

    // Les liaisons suivent la même règle : réécrire à l'identique un ensemble
    // de liens, c'est un `delete` puis un `insert` — donc une écriture, donc un
    // droit exigé, pour un résultat rigoureusement inchangé. (Et c'est aussi,
    // accessoirement, la fin d'une réécriture inutile à chaque enregistrement.)
    const liaisonsAEcrire = new Map<DescriptionLiaison, Record<string, unknown>[]>();
    for (const [liaison, elements] of liaisons) {
      if (await this.liaisonInchangee(client, liaison, identifiant, filiale, elements)) continue;
      liaisonsAEcrire.set(liaison, elements);
    }

    const secondaires =
      d.seconde === undefined
        ? new Map<string, unknown>()
        : await this.retirerLesInchangeesMiseEnOeuvre(
            client,
            d.seconde.table,
            identifiant,
            filiale,
            valeurs.get(d.seconde.table) ?? new Map<string, unknown>(),
          );

    const ecritPrincipale = principales.size > 0 || liaisonsAEcrire.size > 0;
    const ecritQuelqueChose = ecritPrincipale || secondaires.size > 0;

    // Le droit n'est demandé qu'ici, et seulement si quelque chose part.
    if (ecritQuelqueChose) this.exigerDroitEcriture(d, perimetre, entite);

    // ── LE CŒUR DU LOT ─────────────────────────────────────────────────
    // « update … where id = $1 and version = $2 ». Zéro ligne = refus, et
    // c'est le diagnostic qui dit LEQUEL des trois (voir §8.7).
    //
    // Le « update » est joué dès qu'une liaison change, même sans colonne
    // modifiée : il sert alors de PRISE DE VERROU et de contrôle de version.
    // Sans lui, modifier les seules liaisons échapperait au verrouillage
    // optimiste — le risque P1 par la porte de derrière.
    //
    // Quand rien ne part dans la table principale, on se contente d'un
    // contrôle de version EN LECTURE : c'est le cas d'une filiale qui évalue
    // un contrôle du socle Groupe (sa mise en oeuvre est locale, la définition
    // ne bouge pas), et celui d'une reprise qui renvoie le socle à l'identique.
    if (ecritPrincipale) {
      const touchee = await this.majAvecVersion(
        client,
        d.table,
        identifiant,
        version,
        principales,
        entite,
      );
      if (!touchee) {
        throw await this.diagnostiquerEcriture(
          client,
          perimetre,
          entite,
          d.table,
          identifiant,
          version,
        );
      }
    } else {
      const constat = await this.diagnostic(client, perimetre, d.table, identifiant, version);
      if (constat.verdict === 'conflit_version' || constat.verdict === 'invisible') {
        throw this.erreurDeDiagnostic(constat, entite, d.table, identifiant, version);
      }
    }

    // La mise en oeuvre est visitée dès qu'une version est présentée, même
    // sans rien à y écrire : c'est ce passage qui contrôle sa version (voir
    // `majMiseEnOeuvre`). Sans cela, la moitié « filiale » de l'entité scindée
    // était la seule écriture du produit dont le verrou pouvait s'ouvrir en
    // silence — le risque P1 par la moitié qu'on ne regardait pas.
    if (d.seconde !== undefined && (secondaires.size > 0 || versionSeconde !== null)) {
      await this.majMiseEnOeuvre(
        client,
        d.seconde.table,
        identifiant,
        filiale,
        versionSeconde,
        secondaires,
        entite,
      );
    }

    if (liaisonsAEcrire.size > 0) {
      const porteeLigne = await this.filialeDeLaLigne(client, d.table, identifiant);
      for (const [liaison, elements] of liaisonsAEcrire) {
        await this.ecrireLiaison(client, liaison, identifiant, porteeLigne, elements, entite);
      }
    }

    const relu = await this.lireUn(client, entite, identifiant, filiale);
    if (relu === null) {
      throw incoherent(
        `Enregistrement ${entite}/${identifiant} modifié puis illisible dans la même transaction.`,
      );
    }
    return relu;
  }

  /* ===============================================================
   *  8.5 — Suppression
   * =============================================================== */

  /**
   * Supprime un enregistrement. `version` est facultative : quand elle est
   * fournie, la suppression est soumise au même verrouillage optimiste que la
   * modification — supprimer une ligne que quelqu'un vient de modifier est
   * exactement le geste que P1 décrit.
   *
   * Les cascades du `CONVENTIONS.md` §8 sont **portées par le schéma** : rien
   * n'est recopié ici, et c'est tout l'intérêt du passage en base. Seule
   * exception, traitée par `supprimerMesure` : les quatre références au
   * catalogue de mesures sont en `restrict` (§17.6).
   */
  public async supprimer(
    client: PoolClient,
    perimetre: PerimetreSession,
    entite: NomEntite,
    identifiant: string,
    version: number | null,
  ): Promise<void> {
    const d = description(entite);
    this.exigerDroitEcriture(d, perimetre, entite);
    verifierIdentifiant(identifiant);

    if (d.seconde !== undefined) {
      await this.supprimerMesure(client, perimetre, identifiant, version);
      return;
    }

    const conditions = [`${ident('id')} = $1`];
    const parametres: unknown[] = [identifiant];
    if (version !== null) {
      conditions.push(`${ident('version')} = $2`);
      parametres.push(version);
    }

    const resultat = await this.executer(
      client,
      `delete from ${ident(d.table)} where ${conditions.join(' and ')}`,
      parametres,
      entite,
      identifiant,
    );

    if (resultat.rowCount === 0) {
      throw await this.diagnostiquerEcriture(
        client,
        perimetre,
        entite,
        d.table,
        identifiant,
        version,
      );
    }
  }

  /* ===============================================================
   *  8.6 — Opérations composites (contrôle S14)
   * =============================================================== */

  /**
   * Retire un contrôle du catalogue de mesures.
   *
   * ⚠️ **L'ordre compte, et la transaction est unique.** Les quatre références
   * à `mesure_catalogue` sont en `on delete restrict` depuis le constat
   * bloquant B-1 de la porte S1 (`CONVENTIONS.md` §17.6) : « délier » et
   * « conserver », écrits pour un produit mono-filiale, faisaient modifier les
   * données de vingt filiales par une seule suppression. La couche applicative
   * délie donc **d'abord**, dans le périmètre de celui qui le fait, puis
   * supprime — et si un lien subsiste ailleurs, la base rend `23503`, que
   * `src/erreurs/` traduit en « archivez-le au lieu de le supprimer », **et
   * surtout pas en `GRC03`**.
   *
   * Le comportement observé par l'utilisateur est celui du frontend
   * d'aujourd'hui (`deleteMesure`) : les évaluations sont déliées, les actions
   * conservées sans leur mesure, les traitements RGPD déliés.
   */
  public async supprimerMesure(
    client: PoolClient,
    perimetre: PerimetreSession,
    identifiant: string,
    version: number | null,
  ): Promise<void> {
    const filiale = this.filialeActive(perimetre);

    // 1. délier — uniquement dans la filiale active : la RLS n'écrit pas
    //    ailleurs, et c'est précisément la propriété recherchée.
    await this.executer(
      client,
      `delete from ${ident('evaluation_mesures')} where ${ident('mesure_id')} = $1 ` +
        `and ${ident('filiale_id')} = $2`,
      [identifiant, filiale],
      'mesures',
      identifiant,
    );
    await this.executer(
      client,
      `delete from ${ident('traitement_mesures')} where ${ident('mesure_id')} = $1 ` +
        `and ${ident('filiale_id')} = $2`,
      [identifiant, filiale],
      'mesures',
      identifiant,
    );
    await this.executer(
      client,
      `update ${ident('actions')} set ${ident('mesure_id')} = null ` +
        `where ${ident('mesure_id')} = $1 and ${ident('filiale_id')} = $2`,
      [identifiant, filiale],
      'mesures',
      identifiant,
    );
    await this.executer(
      client,
      `delete from ${ident('mesure_mise_en_oeuvre')} where ${ident('mesure_id')} = $1 ` +
        `and ${ident('filiale_id')} = $2`,
      [identifiant, filiale],
      'mesures',
      identifiant,
    );

    // 2. supprimer la définition.
    const conditions = [`${ident('id')} = $1`];
    const parametres: unknown[] = [identifiant];
    if (version !== null) {
      conditions.push(`${ident('version')} = $2`);
      parametres.push(version);
    }
    const resultat = await this.executer(
      client,
      `delete from ${ident('mesure_catalogue')} where ${conditions.join(' and ')}`,
      parametres,
      'mesures',
      identifiant,
    );

    if (resultat.rowCount === 0) {
      throw await this.diagnostiquerEcriture(
        client,
        perimetre,
        'mesures',
        'mesure_catalogue',
        identifiant,
        version,
      );
    }
  }

  /**
   * Propage une mesure vers les exigences qu'elle couvre — « au plus
   * défavorable » (v12).
   *
   * Portage exact d'`aggregateFromMesures` / `propagateMesure` du frontend, à
   * ceci près que la mise en œuvre agrégée est celle **de la filiale active**
   * (`CONVENTIONS.md` §16.3) : la définition du contrôle est partagée, son
   * évaluation ne l'est pas.
   *
   * Une seule transaction, et les évaluations visées sont **verrouillées**
   * (`for update`) avant d'être recalculées : une propagation à moitié
   * appliquée laisserait un tableau de conformité faux, ce qu'un auditeur
   * lirait comme une preuve.
   */
  public async propagerMesure(
    client: PoolClient,
    perimetre: PerimetreSession,
    mesureId: string,
  ): Promise<{ evaluationsMisesAJour: number; evaluations: Enregistrement[] }> {
    const filiale = this.filialeActive(perimetre);
    verifierIdentifiant(mesureId);

    const { rows: visees } = await client.query<{ id: string }>(
      `select e.${ident('id')} as id
         from ${ident('evaluations')} e
         join ${ident('evaluation_mesures')} l
           on l.${ident('evaluation_id')} = e.${ident('id')}
          and l.${ident('filiale_id')} = e.${ident('filiale_id')}
        where l.${ident('mesure_id')} = $1
          and e.${ident('filiale_id')} = $2
        order by e.${ident('id')}
        for update of e`,
      [mesureId, filiale],
    );

    if (visees.length === 0) return { evaluationsMisesAJour: 0, evaluations: [] };
    if (visees.length > BORNES.lignesParCollection) {
      throw new ErreurAccesEntite({
        motif: 'volume_excessif',
        message: 'La propagation porte sur trop d’exigences pour être appliquée d’un seul geste.',
        entite: 'mesures',
        identifiant: mesureId,
      });
    }

    const identifiants = visees.map((ligne) => ligne.id);

    // Toutes les mesures liées à ces évaluations, et leur mise en oeuvre
    // LOCALE. Une seule requête : la propagation ne doit pas coûter N lectures.
    const { rows: liens } = await client.query<{
      evaluation_id: string;
      mesure_id: string;
      statut: string | null;
      maturite: number | string | null;
    }>(
      `select l.${ident('evaluation_id')} as evaluation_id,
              l.${ident('mesure_id')}     as mesure_id,
              m.${ident('statut')}        as statut,
              m.${ident('maturite')}      as maturite
         from ${ident('evaluation_mesures')} l
         left join ${ident('mesure_mise_en_oeuvre')} m
           on m.${ident('mesure_id')} = l.${ident('mesure_id')}
          and m.${ident('filiale_id')} = $2
        where l.${ident('evaluation_id')} = any ($1::text[])
          and l.${ident('filiale_id')} = $2`,
      [identifiants, filiale],
    );

    const parEvaluation = new Map<string, { statut: string; maturite: number }[]>();
    for (const lien of liens) {
      const liste = parEvaluation.get(lien.evaluation_id) ?? [];
      liste.push({
        statut: lien.statut ?? '',
        maturite: lien.maturite === null ? 0 : Number(lien.maturite),
      });
      parEvaluation.set(lien.evaluation_id, liste);
    }

    let misesAJour = 0;
    for (const identifiant of identifiants) {
      const agrege = agregerAuPlusDefavorable(parEvaluation.get(identifiant) ?? []);
      const resultat = await this.executer(
        client,
        `update ${ident('evaluations')}
            set ${ident('statut')} = $2, ${ident('maturite')} = $3
          where ${ident('id')} = $1 and ${ident('filiale_id')} = $4`,
        [identifiant, agrege.statut, agrege.maturite, filiale],
        'evaluations',
        identifiant,
      );
      misesAJour += resultat.rowCount ?? 0;
    }

    const evaluations: Enregistrement[] = [];
    for (const identifiant of identifiants) {
      const relu = await this.lireUn(client, 'evaluations', identifiant, filiale);
      if (relu !== null) evaluations.push(relu);
    }

    return { evaluationsMisesAJour: misesAJour, evaluations };
  }

  /* ===============================================================
   *  8.6 bis — REPRISE D'UN JEU DE DONNÉES COMPLET
   * =============================================================== */

  /**
   * Applique la charge utile v12 d'un export `grc-backup` à la filiale active,
   * **en une seule fois**.
   *
   * ── Pourquoi cette méthode existe ────────────────────────────────────
   *
   * Le constat bloquant **B-3** de la porte S2 : l'import « Remplacer » du
   * navigateur n'était pas une opération composite mais une rafale de vingt
   * `DELETE` HTTP indépendants. Une coupure de VPN au milieu laissait la
   * filiale à moitié détruite, l'état intermédiaire était observable par les
   * autres utilisateurs, et l'appelant recevait `ok: false` **après** que la
   * destruction avait eu lieu. Le remède n'est pas un pansement côté
   * navigateur : c'est une transaction unique côté serveur (contrôle S14).
   *
   * Elle referme aussi l'objection légitime que le banc d'essai opposait à
   * **M-3** : le round-trip exact d'un export (`CONVENTIONS.md` §2) exige que
   * les identifiants du fichier deviennent tels quels les clés primaires. Ils
   * le redeviennent — **ici**, sur le chemin de reprise, et nulle part
   * ailleurs.
   *
   * ── Deux passes, et la seconde n'est pas un détail ───────────────────
   *
   *  1. **les enregistrements**, dans un ordre dérivé du graphe des clés
   *     étrangères (une exigence avant l'action qui la vise) ;
   *  2. **les liaisons**, toutes ensemble, une fois que tout existe.
   *
   * Sans la seconde passe, une dépendance d'actif vers un actif inséré plus
   * loin dans la même collection échouerait — le cas est ordinaire, le module
   * Cartographie en produit à chaque graphe. Différer les liaisons supprime
   * la question de l'ordre **à l'intérieur** d'une collection, et pas
   * seulement entre collections.
   *
   * ── Ce que cette méthode ne fait pas ─────────────────────────────────
   *
   *  · elle n'ouvre **aucune** transaction : l'appelant en ouvre une, et c'est
   *    ce qui rend l'opération tout-ou-rien. Un aperçu s'obtient en annulant
   *    cette transaction plutôt qu'en simulant quoi que ce soit — ce qui
   *    garantit que l'aperçu montre le **vrai** résultat, contraintes de la
   *    base comprises, et non une estimation ;
   *  · elle n'écrit rien dans `journal_audit` (lot L5) ;
   *  · elle ne touche **jamais** le socle Groupe : la purge se borne à
   *    `filiale_id = <filiale active>`, et les lignes de portée Groupe
   *    survivent — c'est la propriété du §17.6, appliquée à l'import.
   */
  public async appliquerReprise(
    client: PoolClient,
    perimetre: PerimetreSession,
    charge: Readonly<Record<string, unknown>>,
    mode: ModeReprise,
    journal: JournalMinimalReprise | null = null,
  ): Promise<BilanReprise> {
    const filiale = this.filialeActive(perimetre);

    const supprimes: Record<string, number> = {};
    const crees: Record<string, number> = {};
    const misAJour: Record<string, number> = {};
    const champsIgnores = new Set<string>();
    let lus = 0;

    // ── Ce que le fichier apporte, borné avant d'y toucher (S13) ────────
    const apports = new Map<NomEntite, Enregistrement[]>();
    for (const entite of ORDRE_ENTITES) {
      const brut = charge[entite];
      if (brut === undefined || brut === null) continue;
      if (!Array.isArray(brut)) {
        throw invalide(`La collection « ${entite} » du fichier n'est pas une liste.`);
      }
      if (brut.length > BORNES.lignesParCollection) {
        throw new ErreurAccesEntite({
          motif: 'volume_excessif',
          message:
            `La collection « ${entite} » du fichier porte ${String(brut.length)} enregistrements, ` +
            `au-delà des ${String(BORNES.lignesParCollection)} admis. La reprise est refusée ` +
            "dans son ENTIER : rien n'a été modifié.",
          entite,
        });
      }
      const enregistrements = brut.filter(
        (element): element is Enregistrement =>
          typeof element === 'object' && element !== null && !Array.isArray(element),
      );
      // Une collection VIDE n'apporte rien, donc n'exige rien — pas même le
      // droit de l'écrire. Un export du modèle navigateur porte toujours les
      // 21 clés, la plupart à zéro enregistrement : garder les vides ici
      // ferait refuser, au nom du socle Groupe, une reprise qui n'y touche
      // pas. C'est la même notion d'« apporter quelque chose » que celle dont
      // la route se sert pour exiger l'habilitation : une seule règle, deux
      // endroits qui la lisent.
      if (enregistrements.length === 0) continue;
      lus += enregistrements.length;
      apports.set(entite, enregistrements);
    }

    // ── Purge, s'il faut remplacer ──────────────────────────────────────
    if (mode === 'remplacer') {
      Object.assign(supprimes, await this.purgerFiliale(client, filiale));
    }

    // ── Ce qui subsiste et que le fichier vise : mise à jour, non création
    const existants = await this.identifiantsExistants(client, filiale);

    // ── Passe 1 : les enregistrements, sans leurs liaisons ──────────────
    const differees: {
      entite: NomEntite;
      identifiant: string;
      portee: string | null;
      liaisons: Enregistrement;
    }[] = [];
    const signaler = (champ: string): void => {
      champsIgnores.add(champ);
    };

    // ── Plan de renommage (constat N-1) ─────────────────────────────────
    // Quand un identifiant du fichier est déjà pris dans le domaine global —
    // par une ligne qui peut être invisible — le serveur en ré-émet un et
    // l'inscrit ici. Toutes les références qui visaient l'ancien sont ensuite
    // réécrites : c'est ce qui préserve la vraie exigence du round-trip
    // (`CONVENTIONS.md` §2), à savoir que **les références continuent de
    // pointer sans table de correspondance**.
    //
    // Le plan ne sort pas d'ici : le rendre à l'appelant lui apprendrait qu'un
    // identifiant existe ailleurs, c'est-à-dire l'oracle qu'on vient de fermer.
    // ⚠️ **La clé du plan est (entité, identifiant), pas l'identifiant seul.**
    // Le domaine `id_metier` est volontairement permissif — un export ancien
    // porte des identifiants sans préfixe, parfois réduits à un nombre
    // (`CONVENTIONS.md` §2) — si bien que deux entités d'un même fichier
    // peuvent porter le même. Avec un plan à plat, renommer le risque « 7 »
    // réécrivait l'`exigence_id` d'une action qui visait l'EXIGENCE « 7 » :
    // la clé étrangère refusait, la reprise entière échouait, et le message
    // reprochait à l'utilisateur de ne pas avoir « délié » quelque chose
    // (porte S2 ter, constat T-5). Le plan est donc cloisonné comme
    // `colonnesDeReference` l'est déjà.
    const renommages = new Map<NomEntite, Map<string, string>>();
    const planDe = (entite: NomEntite): Map<string, string> => {
      let plan = renommages.get(entite);
      if (plan === undefined) {
        plan = new Map<string, string>();
        renommages.set(entite, plan);
      }
      return plan;
    };
    const signalerRenommage = (entite: NomEntite, ancien: string, nouveau: string): void => {
      planDe(entite).set(ancien, nouveau);
      // Le DÉTAIL va au journal technique du serveur, jamais dans la réponse :
      // c'est ce qui rend le renommage traçable pour l'exploitant sans le
      // rendre observable par l'appelant.
      journal?.warn(
        { ancien, nouveau },
        "Reprise : identifiant déjà pris dans le domaine global, ré-émis par le serveur ; " +
          'les références de la charge ont été réécrites',
      );
    };

    // Colonnes qui portent une référence vers une autre entité : ce sont les
    // seules à réécrire. Découvertes dans le graphe des clés étrangères, pas
    // énumérées — une entité ajoutée demain sera couverte sans que ce code
    // change (`CONVENTIONS.md` §19.5).
    const references = this.referencesParTable();
    const identifiantsEcrits = new Map<NomEntite, Set<string>>();

    for (const entite of this.ordreEcriture()) {
      const enregistrements = apports.get(entite);
      if (enregistrements === undefined) continue;
      const d = description(entite);

      // ── LE DROIT SE DEMANDE AU POINT D'EFFET, PAS À L'ENTRÉE ──────────
      //
      // Il n'y a plus de garde-fou par collection ici, et c'est délibéré. Le
      // premier jet en posait un — le même prédicat que la route ordinaire,
      // ce qui était juste — mais **à l'entrée de la collection**, donc avant
      // de savoir si le fichier changeait quoi que ce soit. Résultat : renvoyer
      // le socle Groupe à l'identique, ce que fait tout export du produit, se
      // heurtait à un refus (porte S2 bis, constat N-2). Et ce garde-fou était
      // par ailleurs **inatteignable**, le contrôle de la route refusant
      // d'abord — un second filet muet, que le banc a démasqué en le retirant
      // sans qu'un seul test tombe (constat N-13, sabotage 7).
      //
      // `creer` et `modifier` demandent désormais le droit exactement quand une
      // écriture aurait lieu. Le prédicat est le même, il est appelé par les
      // deux routes, et il est maintenant **sur le chemin** : le retirer se
      // voit.
            const champsDeLiaison = new Set((d.liaisons ?? []).map((l) => l.champ));
      const connus = existants.get(entite) ?? new Map<string, { version: number; seconde: number | null }>();

      // Cette filiale porte-t-elle déjà une ré-émission pour cette entité ?
      // Un parcours de clés déjà en mémoire, une seule fois par collection —
      // c'est ce qui permet de ne calculer AUCUNE empreinte sur une reprise
      // ordinaire, laquelle est le cas de tout le monde.
      const aDesReemissions = [...connus.keys()].some((cle) =>
        estIdentifiantDerive(d.prefixe, cle),
      );

      crees[entite] = 0;
      misAJour[entite] = 0;

      for (const enregistrement of enregistrements) {
        const identifiant = typeof enregistrement['id'] === 'string' ? enregistrement['id'] : null;
        if (identifiant === null) {
          throw invalide(`Un enregistrement de « ${entite} » n'a pas d'identifiant exploitable.`);
        }

        const donnees: Enregistrement = {};
        const liaisons: Enregistrement = {};
        for (const [champ, valeur] of Object.entries(enregistrement)) {
          // `id` est l'identité de l'enregistrement, pas un de ses champs : il
          // est passé à part (`identifiantImpose`, ou l'adresse de la
          // modification). Le laisser ici le ferait refuser (T-6).
          if (champ === 'id') continue;
          if (champsDeLiaison.has(champ)) liaisons[champ] = valeur;
          else donnees[champ] = valeur;
        }

        // ── T-2 : un doublon DANS LE FICHIER n'est pas un identifiant pris
        //         ailleurs, et n'appelle pas la même réponse ────────────────
        //
        // La ré-émission vise le cas d'un identifiant occupé **hors du
        // fichier**, par une ligne que l'appelant ne voit pas. Appliquée à un
        // identifiant **répété dans le même fichier**, elle fabriquait un
        // jumeau : deux lignes là où le fichier en décrit une, et les
        // références réorientées vers la seconde. Avant le remède, la clé
        // primaire refusait et la reprise entière était annulée : l'utilisateur
        // voyait un refus. Après, il voyait un succès et une base fausse.
        //
        // Le fichier est ici fautif, et il l'est de façon visible pour son
        // porteur : le nommer n'apprend rien à personne — l'identifiant vient
        // de son propre fichier. On refuse donc, bruyamment, et la transaction
        // unique fait que rien n'est appliqué.
        const dejaEcrits = identifiantsEcrits.get(entite) ?? new Set<string>();
        if (dejaEcrits.has(identifiant)) {
          throw invalide(
            `Le fichier porte deux fois l'identifiant « ${identifiantLisible(identifiant)} » dans ` +
              `« ${entite} ». Un identifiant désigne un seul enregistrement : corrigez le ` +
              "fichier avant de le reprendre. Rien n'a été modifié.",
            `doublon d'identifiant dans la charge : ${entite}/${identifiant}`,
          );
        }
        dejaEcrits.add(identifiant);
        identifiantsEcrits.set(entite, dejaEcrits);

        // Les références déjà réécrites suivent : un parent renommé l'a
        // toujours été AVANT ses enfants, l'ordre d'écriture le garantit.
        appliquerRenommages(donnees, d, references.get(d.table), renommages);

        // ══ Q-2 : RETROUVER une ré-émission, au lieu d'en fabriquer une ══
        //
        // Le fichier désigne l'enregistrement par SON identifiant. Si celui-ci
        // a déjà été ré-émis lors d'une reprise précédente — parce qu'il était
        // pris dans le domaine global par une filiale invisible —, la ligne
        // est bien ici, mais sous l'identifiant DÉRIVÉ. Sans ce détour, la
        // reprise ne la reconnaissait pas : elle en créait une deuxième, puis
        // une troisième, et réorientait les références vers la dernière.
        //
        // C'est le correctif T-4 qui a ouvert ce chemin, en rendant possible
        // la seconde application d'un même fichier — le geste qu'il devait
        // précisément rendre possible. Le remède crée son propre chemin ; il
        // faut donc le parcourir.
        let cible = identifiant;
        let deja = connus.get(identifiant);
        if (deja === undefined && aDesReemissions) {
          const derive = identifiantDerive(d.prefixe, filiale, d.table, identifiant);
          const dejaDerive = connus.get(derive);
          if (dejaDerive !== undefined) {
            cible = derive;
            deja = dejaDerive;
            // Les références du fichier doivent suivre, exactement comme au
            // premier passage : c'est ce qui rend la reprise convergente et
            // non pas seulement « sans doublon ».
            signalerRenommage(entite, identifiant, derive);
          }
        }

        if (deja === undefined) {
          const cree = await this.creer(client, perimetre, entite, donnees, {
            identifiantImpose: identifiant,
            signalerChampInconnu: signaler,
            signalerRenommage: (ancien, nouveau) => {
              signalerRenommage(entite, ancien, nouveau);
            },
          });
          const retenu = typeof cree['id'] === 'string' ? cree['id'] : identifiant;
          crees[entite] = (crees[entite] ?? 0) + 1;
          if (Object.keys(liaisons).length > 0) {
            differees.push({
              entite,
              identifiant: retenu,
              portee: await this.filialeDeLaLigne(client, d.table, retenu),
              liaisons,
            });
          }
          continue;
        }
        {
          await this.modifier(
            client,
            perimetre,
            entite,
            cible,
            deja.version,
            donnees,
            deja.seconde,
            signaler,
          );
          misAJour[entite] = (misAJour[entite] ?? 0) + 1;
        }

        if (Object.keys(liaisons).length > 0) {
          differees.push({
            entite,
            identifiant: cible,
            portee: await this.filialeDeLaLigne(client, d.table, cible),
            liaisons,
          });
        }
      }
    }

    // ── Passe 2 : les liaisons, une fois que tout existe ────────────────
    let liaisonsEcrites = 0;
    for (const differee of differees) {
      const d = description(differee.entite);
      const { liaisons } = this.repartir(d, differee.liaisons, differee.entite, signaler);
      // Les liaisons sont écrites en dernier : le plan de renommage est alors
      // complet, et une référence vers un enregistrement renommé plus tôt OU
      // plus tard dans le fichier pointe au bon endroit.
      for (const [liaison, elements] of liaisons) {
        const cibles = references.get(liaison.table);
        if (cibles === undefined) continue;
        for (const element of elements) {
          for (const [colonne, valeur] of Object.entries(element)) {
            if (typeof valeur !== 'string') continue;
            const cible = cibles.get(colonne);
            if (cible === undefined) continue;
            const nouveau = renommages.get(cible)?.get(valeur);
            if (nouveau !== undefined) element[colonne] = nouveau;
          }
        }
      }
      for (const [liaison, elements] of liaisons) {
        // La seconde passe écrivait sans regarder, et c'est par là que le
        // constat N-2 subsistait après le correctif : `modifier` savait ne pas
        // réécrire un ensemble de liens inchangé, mais la reprise court-circuite
        // `modifier` pour ses liaisons — donc court-circuitait aussi la règle.
        // Un remède qui ne couvre pas tous ses chemins n'est pas un remède.
        if (await this.liaisonInchangee(client, liaison, differee.identifiant, filiale, elements)) {
          continue;
        }
        this.exigerDroitEcriture(description(differee.entite), perimetre, differee.entite);
        await this.ecrireLiaison(
          client,
          liaison,
          differee.identifiant,
          differee.portee,
          elements,
          differee.entite,
        );
        liaisonsEcrites += elements.length;
      }
    }

    return {
      mode,
      supprimes,
      crees,
      misAJour,
      liaisons: liaisonsEcrites,
      champsIgnores: [...champsIgnores].sort(),
      lus,
    };
  }

  /**
   * Vide la filiale active de ses données métier.
   *
   * ⚠️ **L'ordre est DÉRIVÉ, pas récité.** Il vient du graphe des clés
   * étrangères : une table visée par une référence en `restrict` est purgée
   * **après** celles qui la référencent. C'est ce qui fait que le catalogue de
   * mesures locales part en dernier, sans qu'aucune ligne de ce fichier ne le
   * nomme — et qu'une entité ajoutée en L4 ou L7 trouvera sa place toute
   * seule (`CONVENTIONS.md` §19.5).
   *
   * Ce qui n'est pas purgé, et ne doit pas l'être : les lignes de **portée
   * Groupe** des tables mixtes (socle de mesures, politique Groupe, annuaire
   * Groupe), et les tables de niveau Groupe entières (correspondances). Le
   * filtre est `filiale_id = <filiale active>`, jamais plus large.
   *
   * ⚠️ **Cet invariant ne dépend pas du périmètre de la session.** Une reprise
   * s'exécute en administration Groupe (voir `enReprise` dans `src/api/`), et
   * un lecteur pourrait en conclure que la purge s'élargit avec elle. Elle ne
   * s'élargit pas : ne sont touchées que les tables portant `filiale_id`, sur
   * la seule filiale active. Détruire le socle commun en restaurant UNE
   * filiale emporterait les données des dix-neuf autres — la pathologie même
   * du constat bloquant B-1 de la porte S1.
   */
  public async purgerFiliale(
    client: PoolClient,
    filiale: string,
  ): Promise<Record<string, number>> {
    const comptes: Record<string, number> = {};

    for (const nomTable of this.ordrePurge()) {
      const table = this.table(nomTable);
      if (!table.cloisonnee) continue; // purgée par cascade depuis son parent
      const resultat = await this.executer(
        client,
        `delete from ${ident(nomTable)} where ${ident('filiale_id')} = $1`,
        [filiale],
        'clients',
      );
      if ((resultat.rowCount ?? 0) > 0) comptes[nomTable] = resultat.rowCount ?? 0;
    }
    return comptes;
  }

  /** Identifiants déjà présents dans la filiale, par entité, avec leurs versions. */
  private async identifiantsExistants(
    client: PoolClient,
    filiale: string,
  ): Promise<Map<NomEntite, Map<string, { version: number; seconde: number | null }>>> {
    const resultat = new Map<NomEntite, Map<string, { version: number; seconde: number | null }>>();

    for (const entite of ORDRE_ENTITES) {
      const d = description(entite);
      const table = this.table(d.table);
      const conditions: string[] = [];
      const parametres: unknown[] = [];
      let jointure = '';
      let colonneSeconde = 'null::integer';

      if (table.cloisonnee) {
        parametres.push(filiale);
        conditions.push(
          table.filialeNullable
            ? `(p.${ident('filiale_id')} = $1 or p.${ident('filiale_id')} is null)`
            : `p.${ident('filiale_id')} = $1`,
        );
      }
      if (d.seconde !== undefined) {
        if (parametres.length === 0) parametres.push(filiale);
        jointure =
          ` left join ${ident(d.seconde.table)} s on s.${ident('mesure_id')} = p.${ident('id')}` +
          ` and s.${ident('filiale_id')} = $1`;
        colonneSeconde = `s.${ident('version')}`;
      }

      const { rows } = await client.query<{ id: string; v: number | string; vs: number | string | null }>(
        `select p.${ident('id')} as id, p.${ident('version')} as v, ${colonneSeconde} as vs
           from ${ident(d.table)} p${jointure}
          ${conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''}`,
        parametres,
      );

      const parEntite = new Map<string, { version: number; seconde: number | null }>();
      for (const ligne of rows) {
        parEntite.set(ligne.id, {
          version: Number(ligne.v),
          seconde: ligne.vs === null ? null : Number(ligne.vs),
        });
      }
      resultat.set(entite, parEntite);
    }
    return resultat;
  }

  /**
   * Pour chaque table du modèle, quelles colonnes portent une **référence** et
   * **vers quelle entité**.
   *
   * Le « vers quelle entité » n'est pas un raffinement : le plan de renommage
   * est cloisonné par entité (constat T-5), donc réécrire une référence exige
   * de savoir laquelle consulter. La première rédaction se contentait d'une
   * heuristique — « toute colonne dont le nom finit par _id » — qui donnait la
   * colonne mais pas sa cible, et confondait donc un risque et une exigence
   * portant le même identifiant.
   *
   * Tout vient du catalogue : les clés étrangères portent leurs colonnes et
   * leur table visée. Rien n'est énuméré, et une entité ajoutée demain sera
   * couverte sans que ce fichier change (`CONVENTIONS.md` §19.5).
   */
  private referencesParTable(): Map<string, Map<string, NomEntite>> {
    const tableVersEntite = new Map<string, NomEntite>();
    for (const entite of ORDRE_ENTITES) {
      const d = description(entite);
      tableVersEntite.set(d.table, entite);
      if (d.seconde !== undefined) tableVersEntite.set(d.seconde.table, entite);
    }

    const resultat = new Map<string, Map<string, NomEntite>>();
    for (const cle of this.catalogue.clesEtrangeres) {
      const cible = tableVersEntite.get(cle.cible);
      if (cible === undefined) continue;
      for (const colonne of cle.colonnes) {
        // `filiale_id` participe aux clés composites (CONVENTIONS.md §17.1) :
        // ce n'est pas une référence d'entité, et la réécrire serait un
        // franchissement de frontière.
        if (colonne === 'filiale_id' || colonne === 'id') continue;
        let parColonne = resultat.get(cle.table);
        if (parColonne === undefined) {
          parColonne = new Map<string, NomEntite>();
          resultat.set(cle.table, parColonne);
        }
        parColonne.set(colonne, cible);
      }
    }
    return resultat;
  }

  /**
   * Ordre d'écriture des entités : un parent avant l'enfant qui le référence
   * **par une colonne**. Les liaisons n'entrent pas dans ce calcul — elles sont
   * différées à une seconde passe, ce qui supprime la question de l'ordre à
   * l'intérieur d'une collection.
   */
  private ordreEcriture(): readonly NomEntite[] {
    const tableVersEntite = new Map<string, NomEntite>();
    for (const entite of ORDRE_ENTITES) {
      const d = description(entite);
      tableVersEntite.set(d.table, entite);
      if (d.seconde !== undefined) tableVersEntite.set(d.seconde.table, entite);
    }

    const dependances = new Map<NomEntite, Set<NomEntite>>(
      ORDRE_ENTITES.map((entite) => [entite, new Set<NomEntite>()]),
    );
    for (const cle of this.catalogue.clesEtrangeres) {
      const enfant = tableVersEntite.get(cle.table);
      const parent = tableVersEntite.get(cle.cible);
      if (enfant === undefined || parent === undefined || enfant === parent) continue;
      dependances.get(enfant)?.add(parent);
    }

    return trierParDependances(ORDRE_ENTITES, dependances);
  }

  /**
   * Ordre de purge des tables : une table visée par une référence en
   * `restrict` est purgée **après** celles qui la référencent.
   */
  private ordrePurge(): readonly string[] {
    const tables: string[] = [];
    for (const entite of ORDRE_ENTITES) {
      const d = description(entite);
      tables.push(d.table);
      if (d.seconde !== undefined) tables.push(d.seconde.table);
      for (const liaison of d.liaisons ?? []) tables.push(liaison.table);
    }
    const uniques = [...new Set(tables)];
    const connues = new Set(uniques);

    // « avant » : la table doit être purgée avant celle qu'elle référence en
    // restrict, faute de quoi la suppression du parent est refusée.
    const dependances = new Map<string, Set<string>>(uniques.map((t) => [t, new Set<string>()]));
    for (const cle of this.catalogue.clesEtrangeres) {
      if (cle.action !== 'restrict') continue;
      if (!connues.has(cle.table) || !connues.has(cle.cible) || cle.table === cle.cible) continue;
      dependances.get(cle.cible)?.add(cle.table);
    }

    return trierParDependances(uniques, dependances);
  }

  /* ===============================================================
   *  8.7 — LE DIAGNOSTIC : les trois causes d'un « UPDATE 0 »
   * =============================================================== */

  /**
   * Départage les trois situations que PostgreSQL confond en un même « 0 ligne
   * affectée ». Joué **dans la transaction de l'écriture qui vient d'échouer**,
   * donc sur le même instantané : le verdict ne peut pas être périmé.
   *
   * La lecture est faite par `select … where id = $1`, **sans** condition de
   * version et **sans** condition de filiale : c'est la politique de LECTURE
   * qui filtre, et c'est elle qui rend le diagnostic sûr — une ligne d'une
   * filiale hors périmètre reste invisible ici comme ailleurs.
   *
   * | Ce que la lecture rend | Cause réelle | Motif rendu |
   * |---|---|---|
   * | la ligne, version différente | version périmée | `conflit_version` → `GRC03` |
   * | la ligne, autre filiale | RLS d'écriture | `refus_perimetre` |
   * | la ligne, portée Groupe sans administration | RLS d'écriture | `refus_perimetre` |
   * | la ligne, même filiale et même version | politique ou déclencheur | `refus_perimetre` |
   * | rien | absente **ou** hors périmètre de lecture | `introuvable` |
   *
   * ⚠️ **La dernière ligne fond deux situations, et c'est délibéré.** Le
   * serveur *pourrait* apprendre laquelle — l'unicité de la clé primaire
   * ignore la RLS, une insertion d'essai le dirait. Il ne le fait pas : ce
   * serait construire l'oracle d'existence inter-filiales que la porte S1
   * demande de fermer (`RAPPORT_S1_TER` §T-8), au bénéfice d'un message
   * marginalement plus précis. Le journal technique dit donc « absente ou hors
   * périmètre », sans trancher, parce que le serveur ne le sait pas non plus.
   */
  public async diagnostiquerEcriture(
    client: PoolClient,
    perimetre: PerimetreSession,
    entite: NomEntite,
    nomTable: string,
    identifiant: string,
    versionAttendue: number | null,
  ): Promise<ErreurAccesEntite> {
    const constat = await this.diagnostic(client, perimetre, nomTable, identifiant, versionAttendue);
    return this.erreurDeDiagnostic(constat, entite, nomTable, identifiant, versionAttendue);
  }

  /** Met en mots un verdict de diagnostic. Aucun accès à la base ici. */
  private erreurDeDiagnostic(
    diagnostic: Diagnostic,
    entite: NomEntite,
    nomTable: string,
    identifiant: string,
    versionAttendue: number | null,
  ): ErreurAccesEntite {
    switch (diagnostic.verdict) {
      case 'conflit_version':
        return new ErreurAccesEntite({
          motif: 'conflit_version',
          message:
            'Cet enregistrement a été modifié entre-temps par quelqu’un d’autre. Rechargez-le ' +
            'pour repartir de la version en cours, puis reprenez votre saisie.',
          detailJournal:
            `conflit optimiste sur ${nomTable}/${identifiant} : version attendue ` +
            `${String(versionAttendue)}, version en base ${String(diagnostic.versionActuelle)}`,
          entite,
          identifiant,
          versionActuelle: diagnostic.versionActuelle,
        });

      case 'autre_filiale':
        return new ErreurAccesEntite({
          motif: 'refus_perimetre',
          message:
            'Cet enregistrement appartient à une autre filiale que celle où vous travaillez. ' +
            'Vous pouvez le consulter, pas le modifier depuis ici.',
          detailJournal: `${nomTable}/${identifiant} lisible mais hors de la filiale active`,
          entite,
          identifiant,
        });

      case 'portee_groupe':
        return new ErreurAccesEntite({
          motif: 'refus_perimetre',
          message:
            'Cet élément appartient au socle commun du Groupe. Sa modification relève de ' +
            'l’administration Groupe.',
          detailJournal:
            `${nomTable}/${identifiant} de portée Groupe, session sans administration Groupe`,
          entite,
          identifiant,
        });

      case 'refus_politique':
        return new ErreurAccesEntite({
          motif: 'refus_perimetre',
          message:
            'Écriture refusée sur cet enregistrement. Il vous est lisible, mais une règle du ' +
            'serveur en interdit la modification depuis cette session.',
          detailJournal:
            `${nomTable}/${identifiant} : lisible, filiale et version concordantes, écriture ` +
            'refusée — politique RLS ou déclencheur',
          entite,
          identifiant,
        });

      case 'invisible':
        return new ErreurAccesEntite({
          motif: 'introuvable',
          message:
            'Cet enregistrement n’existe pas dans votre périmètre. Il a peut-être été supprimé ' +
            'entre-temps : rechargez la liste.',
          detailJournal:
            `${nomTable}/${identifiant} : absent OU hors du périmètre de lecture — le serveur ` +
            "ne distingue pas les deux, et ne doit pas (oracle d'existence, RAPPORT_S1_TER T-8)",
          entite,
          identifiant,
        });
    }
  }

  private async diagnostic(
    client: PoolClient,
    perimetre: PerimetreSession,
    nomTable: string,
    identifiant: string,
    versionAttendue: number | null,
  ): Promise<Diagnostic> {
    const table = this.table(nomTable);
    const colonnes = [`${ident('version')} as version`];
    if (table.cloisonnee) colonnes.push(`${ident('filiale_id')} as filiale_id`);

    const { rows } = await client.query<{ version: number | string; filiale_id?: string | null }>(
      `select ${colonnes.join(', ')} from ${ident(nomTable)} where ${ident('id')} = $1`,
      [identifiant],
    );

    const ligne = rows[0];
    if (ligne === undefined) return { verdict: 'invisible' };

    const filialeLigne = table.cloisonnee ? (ligne.filiale_id ?? null) : null;

    if (table.cloisonnee) {
      if (filialeLigne === null) {
        // Portée Groupe d'une table mixte : l'écriture exige le drapeau
        // d'administration Groupe (CONVENTIONS.md §17.4).
        if (!perimetre.administrationGroupe) return { verdict: 'portee_groupe' };
      } else if (filialeLigne !== perimetre.filialeId) {
        // Lisible parce que dans le périmètre de LECTURE, non écrivable parce
        // que hors de la filiale ACTIVE. Le cas d'un périmètre Groupe.
        return { verdict: 'autre_filiale' };
      }
    }

    const versionEnBase = Number(ligne.version);
    if (versionAttendue !== null && versionEnBase !== versionAttendue) {
      return { verdict: 'conflit_version', versionActuelle: versionEnBase };
    }

    // Lisible, dans la filiale active, version concordante — et l'écriture n'a
    // pourtant touché aucune ligne. Ce n'est PAS un conflit de version : il
    // reste une politique ou un déclencheur. Le dire ainsi, plutôt que de
    // retomber sur GRC03, est tout l'objet de ce diagnostic.
    return { verdict: 'refus_politique' };
  }

  /* ===============================================================
   *  8.8 — Lecture
   * =============================================================== */

  private async lireUn(
    client: PoolClient,
    entite: NomEntite,
    identifiant: string,
    filiale: string,
  ): Promise<Enregistrement | null> {
    const enregistrements = await this.lireCollection(client, entite, filiale, {
      identifiant,
    });
    return enregistrements[0] ?? null;
  }

  private async lireCollection(
    client: PoolClient,
    entite: NomEntite,
    filiale: string,
    filtre: { depuis?: Date; identifiant?: string; plafond?: number } | null,
  ): Promise<Enregistrement[]> {
    const d = description(entite);
    const table = this.table(d.table);
    const exposes = champsExposes(this.catalogue, d);

    const selections: string[] = [`p.${ident('id')} as ${ident('id')}`];
    const alias = new Map<string, { champ: string; colonne: DescriptionColonne }>();
    let indice = 0;

    for (const [champ, cible] of exposes) {
      const prefixeTable = cible.table === d.table ? 'p' : 's';
      const nomAlias = `c${String(indice++)}`;
      selections.push(`${expressionLecture(prefixeTable, cible.colonne)} as ${ident(nomAlias)}`);
      alias.set(nomAlias, { champ, colonne: cible.colonne });
    }

    selections.push(`p.${ident('version')} as ${ident('v_principale')}`);
    selections.push(
      `greatest(p.${ident('cree_le')}, coalesce(p.${ident('modifie_le')}, p.${ident('cree_le')}))` +
        ` as ${ident('maj_principale')}`,
    );
    if (table.cloisonnee) selections.push(`p.${ident('filiale_id')} as ${ident('f_principale')}`);

    const conditions: string[] = [];
    const parametres: unknown[] = [];

    // La filiale n'est un paramètre que si la requête s'en sert. Une entité de
    // niveau Groupe (`mappings`) n'a ni colonne `filiale_id` ni seconde table :
    // lui passer un paramètre inutilisé ferait échouer la préparation de la
    // requête, PostgreSQL ne pouvant pas en inférer le type.
    let marqueFiliale: string | null = null;
    if (table.cloisonnee || d.seconde !== undefined) {
      parametres.push(filiale);
      marqueFiliale = `$${String(parametres.length)}`;
    }

    let jointure = '';
    if (d.seconde !== undefined) {
      const seconde = this.table(d.seconde.table);
      if (!seconde.colonnes.has('mesure_id')) {
        throw incoherent(`${d.seconde.table} ne porte pas la colonne de rattachement mesure_id.`);
      }
      selections.push(`s.${ident('version')} as ${ident('v_seconde')}`);
      selections.push(
        `greatest(s.${ident('cree_le')}, coalesce(s.${ident('modifie_le')}, s.${ident('cree_le')}))` +
          ` as ${ident('maj_seconde')}`,
      );
      jointure =
        ` left join ${ident(d.seconde.table)} s` +
        ` on s.${ident('mesure_id')} = p.${ident('id')} and s.${ident('filiale_id')} = ` +
        `${marqueFiliale ?? '$1'}`;
    }

    // Filtrage applicatif, EN PLUS de la RLS (PLAN_SERVEUR §1.9 : la RLS est le
    // filet SOUS le code, pas sa doublure). Il est ici fonctionnellement
    // nécessaire : le périmètre de LECTURE peut couvrir plusieurs filiales,
    // alors que le jeu de données servi est celui de la filiale ACTIVE.
    if (table.cloisonnee && marqueFiliale !== null) {
      conditions.push(
        table.filialeNullable
          ? `(p.${ident('filiale_id')} = ${marqueFiliale} or p.${ident('filiale_id')} is null)`
          : `p.${ident('filiale_id')} = ${marqueFiliale}`,
      );
    }

    if (filtre?.identifiant !== undefined) {
      parametres.push(filtre.identifiant);
      conditions.push(`p.${ident('id')} = $${String(parametres.length)}`);
    }
    if (filtre?.depuis !== undefined) {
      parametres.push(filtre.depuis.toISOString());
      const borne = `$${String(parametres.length)}::timestamptz`;
      const majPrincipale = `greatest(p.${ident('cree_le')}, coalesce(p.${ident('modifie_le')}, p.${ident('cree_le')}))`;
      conditions.push(
        d.seconde === undefined
          ? `${majPrincipale} > ${borne}`
          : `(${majPrincipale} > ${borne} or greatest(s.${ident('cree_le')}, ` +
              `coalesce(s.${ident('modifie_le')}, s.${ident('cree_le')})) > ${borne})`,
      );
    }

    const plafond = filtre?.plafond ?? BORNES.lignesParCollection + 1;
    parametres.push(plafond);

    const { rows } = await client.query<Record<string, unknown>>(
      `select ${selections.join(', ')}
         from ${ident(d.table)} p${jointure}
        ${conditions.length > 0 ? `where ${conditions.join(' and ')}` : ''}
        order by p.${ident('id')}
        limit $${String(parametres.length)}`,
      parametres,
    );

    if (filtre?.plafond === undefined && rows.length > BORNES.lignesParCollection) {
      throw new ErreurAccesEntite({
        motif: 'volume_excessif',
        message:
          `La collection « ${entite} » dépasse ${String(BORNES.lignesParCollection)} ` +
          'enregistrements : le chargement complet du jeu de données n’est plus tenable et ' +
          'doit être découpé. Signalez-le à l’exploitant.',
        entite,
        detailJournal: `plafond de collection atteint sur ${entite} pour la filiale ${filiale}`,
      });
    }

    const enregistrements: Enregistrement[] = [];
    const identifiants: string[] = [];

    for (const ligne of rows) {
      const enregistrement: Enregistrement = {};
      const identifiant = String(ligne['id']);
      enregistrement['id'] = identifiant;
      identifiants.push(identifiant);

      for (const [nomAlias, cible] of alias) {
        enregistrement[cible.champ] = versLeFrontend(ligne[nomAlias], cible.colonne.famille);
      }

      enregistrement[CHAMP_VERSION] = Number(ligne['v_principale']);
      let maj = enMillisecondes(ligne['maj_principale']);
      if (d.seconde !== undefined) {
        const versionSeconde = ligne['v_seconde'];
        enregistrement[CHAMP_VERSION_SECONDE] =
          versionSeconde === null || versionSeconde === undefined ? null : Number(versionSeconde);
        const majSeconde = enMillisecondes(ligne['maj_seconde']);
        if (majSeconde !== null && (maj === null || majSeconde > maj)) maj = majSeconde;
      }
      enregistrement['updatedAt'] = maj;

      for (const liaison of d.liaisons ?? []) {
        enregistrement[liaison.champ] = liaison.forme === 'objet-de-listes' ? {} : [];
      }

      enregistrements.push(enregistrement);
    }

    if (identifiants.length > 0) {
      for (const liaison of d.liaisons ?? []) {
        await this.lireLiaison(client, liaison, identifiants, enregistrements, filiale);
      }
    }

    return enregistrements;
  }

  private async compterCollection(
    client: PoolClient,
    entite: NomEntite,
    filiale: string,
  ): Promise<number> {
    const d = description(entite);
    const table = this.table(d.table);
    const condition = !table.cloisonnee
      ? ''
      : table.filialeNullable
        ? `where ${ident('filiale_id')} = $1 or ${ident('filiale_id')} is null`
        : `where ${ident('filiale_id')} = $1`;

    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from ${ident(d.table)} ${condition}`,
      table.cloisonnee ? [filiale] : [],
    );
    return Number(rows[0]?.n ?? '0');
  }

  private async lireLiaison(
    client: PoolClient,
    liaison: DescriptionLiaison,
    identifiants: readonly string[],
    enregistrements: readonly Enregistrement[],
    filiale: string,
  ): Promise<void> {
    const table = this.table(liaison.table);
    const colonnes = [ident(liaison.colonneParent), ident(liaison.colonneEnfant)];
    if (liaison.colonneCle !== undefined) colonnes.push(ident(liaison.colonneCle));
    for (const colonne of Object.values(liaison.attributs ?? {})) {
      if (colonne !== liaison.colonneEnfant) colonnes.push(ident(colonne));
    }

    const parametres: unknown[] = [identifiants];
    let condition = `${ident(liaison.colonneParent)} = any ($1::text[])`;
    if (table.cloisonnee) {
      parametres.push(filiale);
      condition += table.filialeNullable
        ? ` and (${ident('filiale_id')} = $2 or ${ident('filiale_id')} is null)`
        : ` and ${ident('filiale_id')} = $2`;
    }
    parametres.push(BORNES.lignesParLiaison + 1);

    const { rows } = await client.query<Record<string, unknown>>(
      `select ${[...new Set(colonnes)].join(', ')} from ${ident(liaison.table)}
        where ${condition}
        order by ${ident(liaison.colonneParent)}, ${ident(liaison.colonneEnfant)}
        limit $${String(parametres.length)}`,
      parametres,
    );

    if (rows.length > BORNES.lignesParLiaison) {
      throw new ErreurAccesEntite({
        motif: 'volume_excessif',
        message: `Les liaisons « ${liaison.champ} » dépassent le volume admis.`,
        detailJournal: `plafond de liaison atteint sur ${liaison.table}`,
      });
    }

    const parParent = new Map<string, Enregistrement>();
    for (let i = 0; i < identifiants.length; i += 1) {
      const identifiant = identifiants[i];
      const enregistrement = enregistrements[i];
      if (identifiant !== undefined && enregistrement !== undefined) {
        parParent.set(identifiant, enregistrement);
      }
    }

    for (const ligne of rows) {
      const parent = parParent.get(String(ligne[liaison.colonneParent]));
      if (parent === undefined) continue;

      if (liaison.forme === 'identifiants') {
        (parent[liaison.champ] as string[]).push(String(ligne[liaison.colonneEnfant]));
      } else if (liaison.forme === 'objets') {
        const element: Record<string, unknown> = {};
        for (const [cle, colonne] of Object.entries(liaison.attributs ?? {})) {
          element[cle] = ligne[colonne] === null ? '' : String(ligne[colonne]);
        }
        (parent[liaison.champ] as Record<string, unknown>[]).push(element);
      } else {
        const cle = String(ligne[liaison.colonneCle ?? '']);
        const sac = parent[liaison.champ] as Record<string, string[]>;
        const liste = sac[cle] ?? [];
        liste.push(String(ligne[liaison.colonneEnfant]));
        sac[cle] = liste;
      }
    }
  }

  /* ===============================================================
   *  8.9 — Écriture : primitives
   * =============================================================== */

  private async inserer(
    client: PoolClient,
    nomTable: string,
    identifiant: string,
    filiale: string | null,
    valeurs: ReadonlyMap<string, unknown>,
    entite: NomEntite,
    identifiantSignale: string = identifiant,
  ): Promise<void> {
    const table = this.table(nomTable);

    // ── L'INSERTION NOMME SES COLONNES (CONVENTIONS.md §18.6) ────────────
    // Non par style : `documents` et `document_referentiels` portent une
    // colonne ENGENDRÉE qui entre dans une clé étrangère, et PostgreSQL refuse
    // qu'on lui donne une valeur. La liste est construite à partir du
    // catalogue, filtrée sur `engendree = false` — découverte, jamais recopiée.
    //
    // ── NI `version`, NI `cree_le`, NI `cree_par` (CONVENTIONS.md §18.1) ──
    // La base les impose par déclencheur et ignore ce que l'appelant enverrait.
    // Les envoyer ne provoquerait donc aucune erreur : elles seraient
    // silencieusement écrasées. On ne les envoie pas.
    const colonnes: string[] = [ident('id')];
    const parametres: unknown[] = [identifiant];
    const marques: string[] = ['$1'];

    if (table.cloisonnee) {
      colonnes.push(ident('filiale_id'));
      parametres.push(filiale);
      marques.push(`$${String(parametres.length)}`);
    }

    for (const [nomColonne, valeur] of valeurs) {
      const colonne = table.colonnes.get(nomColonne);
      if (colonne === undefined || colonne.engendree) continue;
      colonnes.push(ident(nomColonne));
      parametres.push(valeur);
      marques.push(`$${String(parametres.length)}`);
    }

    await this.executer(
      client,
      `insert into ${ident(nomTable)} (${colonnes.join(', ')}) values (${marques.join(', ')})`,
      parametres,
      entite,
      identifiantSignale,
    );
  }

  private async majAvecVersion(
    client: PoolClient,
    nomTable: string,
    identifiant: string,
    version: number,
    valeurs: ReadonlyMap<string, unknown>,
    entite: NomEntite,
  ): Promise<boolean> {
    const table = this.table(nomTable);
    const affectations: string[] = [];
    const parametres: unknown[] = [identifiant, version];

    for (const [nomColonne, valeur] of valeurs) {
      const colonne = table.colonnes.get(nomColonne);
      if (colonne === undefined || colonne.engendree) continue;
      parametres.push(valeur);
      affectations.push(`${ident(nomColonne)} = $${String(parametres.length)}`);
    }

    // Aucune colonne à écrire : le « update » sert alors de prise de verrou et
    // de contrôle de version. `version = version` est une affectation neutre
    // pour la colonne — le déclencheur du §3 l'incrémentera de toute façon.
    if (affectations.length === 0) affectations.push(`${ident('version')} = ${ident('version')}`);

    const resultat = await this.executer(
      client,
      `update ${ident(nomTable)} set ${affectations.join(', ')}
        where ${ident('id')} = $1 and ${ident('version')} = $2`,
      parametres,
      entite,
      identifiant,
    );

    return (resultat.rowCount ?? 0) > 0;
  }

  /**
   * Met à jour la mise en œuvre d'un contrôle, en la créant si la filiale ne
   * l'avait pas encore évaluée — le cas d'un contrôle du socle Groupe qu'une
   * filiale évalue pour la première fois.
   */
  /**
   * Écrit la **mise en œuvre** d'un contrôle dans la filiale active.
   *
   * ── M-2 : LE VERROU N'EST PLUS FACULTATIF ────────────────────────────
   *
   * La première rédaction n'ajoutait la clause `and version = $n` que si
   * l'appelant avait bien voulu fournir un numéro. Absent, l'`update` écrasait
   * en silence et rendait 200 : le risque projet **P1**, rouvert sur la moitié
   * du modèle qui porte la comparabilité entre filiales (porte S2, constat
   * M-2). Pire, le cas nominal l'atteignait sans rien forger — deux personnes
   * ouvrant le même contrôle du socle que la filiale n'a pas encore évalué
   * détiennent toutes deux `_versionMiseEnOeuvre: null`.
   *
   * Il n'y a donc plus de chemin sans arbitre, et il y en a exactement deux :
   *
   * | Ce que l'appelant détient | Ce que le serveur fait | Qui arbitre |
   * |---|---|---|
   * | `version = null` — « aucune mise en œuvre » | `insert` | l'**unicité** `(filiale_id, mesure_id)`, que la RLS ne contourne pas (`CONVENTIONS.md` §19.1) |
   * | `version = n` — « je détiens la version n » | `update … and version = $n` | la clause de version |
   *
   * Dans les deux cas, perdre la course rend `GRC03` avec la version réelle,
   * jamais un 200 muet. Et la résurrection silencieuse a disparu au passage :
   * un appelant qui annonce une version sur une ligne effacée entre-temps
   * reçoit un conflit, il ne recrée pas la ligne à son insu.
   */
  private async majMiseEnOeuvre(
    client: PoolClient,
    nomTable: string,
    mesureId: string,
    filiale: string,
    version: number | null,
    valeurs: ReadonlyMap<string, unknown>,
    entite: NomEntite,
  ): Promise<void> {
    const table = this.table(nomTable);
    const affectations: string[] = [];
    const parametres: unknown[] = [mesureId, filiale];

    for (const [nomColonne, valeur] of valeurs) {
      const colonne = table.colonnes.get(nomColonne);
      if (colonne === undefined || colonne.engendree || nomColonne === 'mesure_id') continue;
      parametres.push(valeur);
      affectations.push(`${ident(nomColonne)} = $${String(parametres.length)}`);
    }
    if (affectations.length === 0) {
      // ── Rien à écrire ici — ce n'est PAS une raison de ne rien vérifier ──
      //
      // Le contrat du lot est qu'une version périmée s'apprend. La table
      // principale l'honorait déjà sans écrire (contrôle de version EN
      // LECTURE, voir `modifier`) ; la moitié « filiale » de l'entité scindée,
      // elle, ne le faisait pas : quand la mise en oeuvre ne changeait pas, sa
      // version n'était pas même lue. Un client qui tenait une maturité
      // périmée recevait alors 200 et la croyait à jour, alors que la même
      // requête sur la moitié « Groupe » aurait rendu GRC03.
      //
      // Aucune écriture n'a lieu ici, donc aucun DROIT n'est exigé (N-2) : on
      // se borne à comparer la version présentée à celle qui est en base.
      if (version === null) return;
      const { rows } = await client.query<{ version: number | string }>(
        `select ${ident('version')} as version from ${ident(nomTable)}
          where ${ident('mesure_id')} = $1 and ${ident('filiale_id')} = $2`,
        [mesureId, filiale],
      );
      const ligne = rows[0];
      if (ligne !== undefined && Number(ligne.version) === version) return;
      // Version périmée, ou mise en oeuvre supprimée entre-temps : les deux se
      // disent « rechargez », par le même chemin que le verrou d'écriture.
      throw await this.conflitMiseEnOeuvre(client, nomTable, mesureId, filiale, entite);
    }

    // ── Chemin 1 : l'appelant n'a pas de mise en œuvre à modifier ────────
    // L'unicité (filiale_id, mesure_id) est l'arbitre. Elle ignore la RLS,
    // mais elle porte `filiale_id` : un doublon vient donc forcément d'une
    // ligne de la filiale de l'appelant, qu'il peut lire — aucun oracle.
    if (version === null) {
      const nouvelles = new Map(valeurs);
      nouvelles.set('mesure_id', mesureId);
      // N-10 : l'identifiant SIGNALÉ est celui de la mesure, pas le « MMO-… »
      // que le serveur vient d'engendrer. Un refus qui nomme un identifiant
      // interne, engendré à l'instant et annulé avec la transaction, envoie
      // l'utilisateur chercher un enregistrement qui n'a jamais existé.
      const tentative = await this.avecPointDeReprise(client, 'pr_mise_en_oeuvre', () =>
        this.inserer(
          client,
          nomTable,
          engendrerIdentifiant('MMO'),
          filiale,
          nouvelles,
          entite,
          mesureId,
        ),
      );
      if (tentative.ok) return;
      if (!estViolationUnicite(tentative.erreur)) throw tentative.erreur;
      throw await this.conflitMiseEnOeuvre(client, nomTable, mesureId, filiale, entite);
    }

    // ── Chemin 2 : verrouillage optimiste ordinaire ──────────────────────
    parametres.push(version);
    const condition =
      `${ident('mesure_id')} = $1 and ${ident('filiale_id')} = $2 ` +
      `and ${ident('version')} = $${String(parametres.length)}`;

    const resultat = await this.executer(
      client,
      `update ${ident(nomTable)} set ${affectations.join(', ')} where ${condition}`,
      parametres,
      entite,
      mesureId,
    );

    if ((resultat.rowCount ?? 0) > 0) return;

    // Zéro ligne : version périmée, ou mise en œuvre supprimée entre-temps.
    // Les deux se disent « rechargez », et surtout aucune des deux ne se
    // traduit par une insertion silencieuse.
    throw await this.conflitMiseEnOeuvre(client, nomTable, mesureId, filiale, entite);
  }

  /**
   * Ce refus est-il un doublon sur une unicité de **portée Groupe** — c'est-à-
   * dire une unicité qui ne porte pas `filiale_id`, la clé primaire au premier
   * chef ?
   *
   * C'est la distinction qui commande tout le traitement du constat N-1 :
   *
   *  · unicité **portant `filiale_id`** (`uq_history_filiale_date`,
   *    `uq_evaluations_ref_code`…) : la ligne en cause appartient forcément à
   *    la filiale de l'appelant, donc il peut la lire. Le refus ne lui apprend
   *    rien, et il peut même être précis (voir `enrichirDoublon`) ;
   *  · unicité **ne le portant pas** : le doublon peut venir d'une ligne
   *    **invisible**, et le refus devient un oracle d'existence
   *    inter-filiales.
   *
   * Le critère est lu dans le catalogue, jamais deviné. Une contrainte inconnue
   * est traitée comme globale : en cas de doute, on protège.
   */
  private doublonDeCleGlobale(erreur: unknown): boolean {
    if (!estViolationUnicite(erreur)) return false;
    const nom =
      erreur instanceof ErreurAccesEntite ? erreur.erreurBase?.['constraint'] : undefined;
    if (typeof nom !== 'string') return true;
    const unicite = this.catalogue.unicites.get(nom);
    return unicite === undefined || !unicite.porteFiliale;
  }

  /**
   * Enrichit un doublon d'une **clé métier** avec l'enregistrement qui l'occupe
   * déjà — quand, et seulement quand, l'appelant a le droit de le voir.
   *
   * ── Ce que cela ferme (constat m-5 de la porte S2) ────────────────────
   *
   * Le point d'historique quotidien du tableau de bord porte une unicité sur la
   * date. Deux sessions ouvertes le même jour produisent donc un `409` parfait,
   * quotidien et parfaitement anodin — c'est-à-dire une **fausse alerte
   * apprise**, et le geste appris sur un faux positif s'applique un jour au
   * vrai. Rendre l'identifiant et la version de la ligne qui existe déjà donne
   * au client de quoi basculer sur une modification, sans bandeau ni
   * rechargement complet.
   *
   * ── Pourquoi ce n'est pas un oracle ──────────────────────────────────
   *
   * L'enrichissement n'a lieu que si l'unicité heurtée **porte `filiale_id`**
   * (découvert dans le catalogue). La ligne en cause appartient alors
   * nécessairement à la filiale de l'appelant, donc à son périmètre de lecture :
   * on ne lui apprend rien qu'un simple rechargement ne lui dirait. Sur une
   * unicité de portée Groupe — la clé primaire au premier chef — rien n'est
   * ajouté, et la traduction reste muette (`RAPPORT_S1_TER` §T-8).
   *
   * En cas de doute — contrainte inconnue, valeur manquante, ligne illisible —
   * l'erreur d'origine repart telle quelle. Un enrichissement n'a jamais le
   * droit de masquer le refus qu'il commente.
   */
  private async enrichirDoublon(
    client: PoolClient,
    erreur: unknown,
    nomTable: string,
    valeurs: ReadonlyMap<string, unknown>,
    filiale: string | null,
    entite: NomEntite,
  ): Promise<unknown> {
    if (!(erreur instanceof ErreurAccesEntite) || !estViolationUnicite(erreur)) return erreur;

    const nomContrainte = erreur.erreurBase?.['constraint'];
    if (typeof nomContrainte !== 'string') return erreur;

    const unicite = this.catalogue.unicites.get(nomContrainte);
    if (unicite === undefined || unicite.clePrimaire || !unicite.porteFiliale) return erreur;

    const conditions: string[] = [];
    const parametres: unknown[] = [];
    for (const colonne of unicite.colonnes) {
      const valeur = colonne === 'filiale_id' ? filiale : valeurs.get(colonne);
      if (valeur === undefined) return erreur;
      parametres.push(valeur);
      conditions.push(`${ident(colonne)} = $${String(parametres.length)}`);
    }

    let existante: { id: string; version: number | string } | undefined;
    try {
      const { rows } = await client.query<{ id: string; version: number | string }>(
        `select ${ident('id')} as id, ${ident('version')} as version
           from ${ident(nomTable)} where ${conditions.join(' and ')}`,
        parametres,
      );
      existante = rows[0];
    } catch {
      // La transaction est déjà en échec : la relecture peut être refusée.
      // On rend alors le refus d'origine, ce qui reste exact.
      return erreur;
    }
    if (existante === undefined) return erreur;

    return new ErreurAccesEntite({
      motif: 'refus_base',
      message: erreur.message,
      entite,
      identifiant: existante.id,
      versionActuelle: Number(existante.version),
      erreurBase: erreur.erreurBase,
      detailJournal:
        `doublon sur ${nomContrainte} : l'enregistrement ${existante.id} occupe déjà cette clé ` +
        "dans la filiale de l'appelant",
    });
  }

  /**
   * Joue un travail sous **point de reprise**, pour qu'un refus *attendu* de la
   * base ne condamne pas la transaction entière.
   *
   * Nécessaire dès qu'on se sert d'une contrainte comme d'un arbitre : après un
   * `23505`, PostgreSQL place la transaction en échec (`25P02`) et refuse toute
   * requête suivante — y compris la relecture qui doit dire à l'appelant
   * **quelle** version il lui manque. Sans le point de reprise, un conflit
   * légitime se présentait en `erreur_interne` 500, ce qui est exactement le
   * contraire du message attendu.
   *
   * La portée du retour arrière est ce seul travail : les écritures déjà faites
   * dans la transaction survivent, et l'atomicité de l'ensemble reste celle de
   * `avecTransaction` (contrôle S14) — on rejette ensuite, donc tout est annulé.
   */
  private async avecPointDeReprise<T>(
    client: PoolClient,
    nom: string,
    travail: () => Promise<T>,
  ): Promise<{ ok: true; valeur: T } | { ok: false; erreur: unknown }> {
    await client.query(`savepoint ${ident(nom)}`);
    try {
      const valeur = await travail();
      await client.query(`release savepoint ${ident(nom)}`);
      return { ok: true, valeur };
    } catch (erreur) {
      await client.query(`rollback to savepoint ${ident(nom)}`);
      return { ok: false, erreur };
    }
  }

  /** Relit la version réelle d'une mise en œuvre pour bâtir le `GRC03`. */
  private async conflitMiseEnOeuvre(
    client: PoolClient,
    nomTable: string,
    mesureId: string,
    filiale: string,
    entite: NomEntite,
  ): Promise<ErreurAccesEntite> {
    const { rows } = await client.query<{ version: number | string }>(
      `select ${ident('version')} as version from ${ident(nomTable)}
        where ${ident('mesure_id')} = $1 and ${ident('filiale_id')} = $2`,
      [mesureId, filiale],
    );
    const existante = rows[0];

    return new ErreurAccesEntite({
      motif: 'conflit_version',
      message:
        'L’évaluation de ce contrôle a été modifiée entre-temps par quelqu’un d’autre. ' +
        'Rechargez-la pour repartir de la version en cours, puis reprenez votre saisie.',
      entite,
      identifiant: mesureId,
      versionActuelle: existante === undefined ? undefined : Number(existante.version),
      detailJournal:
        `conflit optimiste sur ${nomTable} (mesure ${mesureId}, filiale ${filiale}) ; ` +
        `mise en oeuvre ${existante === undefined ? 'absente' : 'présente'} au moment du constat`,
    });
  }

  /**
   * L'ensemble de liens proposé est-il **déjà** celui qui est en base ?
   *
   * Réécrire une liaison à l'identique est un `delete` suivi d'un `insert` :
   * une écriture, donc un droit exigé, pour un résultat rigoureusement
   * inchangé. C'est ce qui refusait à une filiale de renvoyer, dans une
   * reprise, les référentiels d'un document de portée Groupe (constat N-2).
   *
   * La comparaison porte sur les **colonnes écrites**, pas sur la
   * représentation frontend : deux ensembles sont égaux s'ils ont les mêmes
   * lignes, quel qu'en soit l'ordre. En cas de doute — colonne inconnue,
   * lecture impossible — on répond « changé » : réécrire pour rien est sans
   * conséquence, tenir à tort un changement pour un non-changement le serait.
   */
  private async liaisonInchangee(
    client: PoolClient,
    liaison: DescriptionLiaison,
    identifiantParent: string,
    filiale: string,
    elements: readonly Record<string, unknown>[],
  ): Promise<boolean> {
    const table = this.table(liaison.table);
    const colonnes = [...new Set(colonnesDeLiaison(liaison))].filter(
      (nom) => nom !== liaison.colonneParent && table.colonnes.has(nom),
    );
    if (colonnes.length === 0) return false;

    const parametres: unknown[] = [identifiantParent];
    let condition = `${ident(liaison.colonneParent)} = $1`;
    if (table.cloisonnee) {
      parametres.push(filiale);
      condition += table.filialeNullable
        ? ` and (${ident('filiale_id')} = $2 or ${ident('filiale_id')} is null)`
        : ` and ${ident('filiale_id')} = $2`;
    }

    const { rows } = await client.query<Record<string, unknown>>(
      `select ${colonnes.map((nom) => ident(nom)).join(', ')} from ${ident(liaison.table)}
        where ${condition} limit ${String(BORNES.elementsParLiaison + 1)}`,
      parametres,
    );
    if (rows.length !== elements.length) return false;

    const empreinte = (ligne: Record<string, unknown>): string =>
      colonnes.map((nom) => String(ligne[nom] ?? '')).join('\u0000');

    const stockees = new Set(rows.map(empreinte));
    for (const element of elements) {
      if (!stockees.has(empreinte(element))) return false;
    }
    return true;
  }

  /**
   * Même règle, appliquée à la **mise en œuvre** d'un contrôle : ce qui ne
   * change pas n'est pas écrit, donc n'exige pas le droit d'écrire.
   *
   * Sans elle, reprendre son propre export réclamait le droit d'écrire la mise
   * en œuvre du socle alors que le fichier la renvoyait à l'identique.
   */
  private async retirerLesInchangeesMiseEnOeuvre(
    client: PoolClient,
    nomTable: string,
    mesureId: string,
    filiale: string,
    proposees: Map<string, unknown>,
  ): Promise<Map<string, unknown>> {
    if (proposees.size === 0) return proposees;

    const table = this.table(nomTable);
    const colonnes = [...proposees.keys()].filter(
      (nom) => nom !== 'mesure_id' && table.colonnes.has(nom),
    );
    if (colonnes.length === 0) return proposees;

    const selections = colonnes.map((nom) => {
      const colonne = table.colonnes.get(nom);
      if (colonne === undefined) throw incoherent(`Colonne inconnue : ${nomTable}.${nom}`);
      return `${expressionLecture('p', colonne)} as ${ident(nom)}`;
    });

    const { rows } = await client.query<Record<string, unknown>>(
      `select ${selections.join(', ')} from ${ident(nomTable)} p
        where p.${ident('mesure_id')} = $1 and p.${ident('filiale_id')} = $2`,
      [mesureId, filiale],
    );
    const stockee = rows[0];
    // Pas de mise en oeuvre : tout est à écrire, c'est une création.
    if (stockee === undefined) return proposees;

    const retenues = new Map<string, unknown>();
    for (const [nom, proposee] of proposees) {
      const colonne = table.colonnes.get(nom);
      if (colonne === undefined) continue;
      if (valeursEquivalentes(colonne.famille, stockee[nom], proposee)) continue;
      retenues.set(nom, proposee);
    }
    return retenues;
  }

  /**
   * Retire du lot les colonnes dont la valeur en base est **déjà** celle
   * proposée (constat M-1). Voir le commentaire de `modifier`.
   *
   * ⚠️ Portée exacte : les documents `jsonb` sont toujours tenus pour changés.
   * Comparer deux documents JSON demande une égalité structurelle que
   * `JSON.stringify` ne donne pas (l'ordre des clés compte), et se tromper
   * dans le sens « inchangé » ferait perdre une saisie. On préfère écrire pour
   * rien — aucune table scindée ne porte de `jsonb` aujourd'hui.
   */
  private async retirerLesInchangees(
    client: PoolClient,
    nomTable: string,
    identifiant: string,
    proposees: Map<string, unknown>,
  ): Promise<Map<string, unknown>> {
    const table = this.table(nomTable);
    const colonnes = [...proposees.keys()].filter((nom) => table.colonnes.has(nom));
    if (colonnes.length === 0) return proposees;

    const selections = colonnes.map((nom) => {
      const colonne = table.colonnes.get(nom);
      if (colonne === undefined) throw incoherent(`Colonne inconnue : ${nomTable}.${nom}`);
      return `${expressionLecture('p', colonne)} as ${ident(nom)}`;
    });

    const { rows } = await client.query<Record<string, unknown>>(
      `select ${selections.join(', ')} from ${ident(nomTable)} p where p.${ident('id')} = $1`,
      [identifiant],
    );
    const stockee = rows[0];
    // Ligne illisible : on ne retire rien, et l'`update` qui suit produira le
    // diagnostic à trois causes — c'est lui qui sait dire pourquoi.
    if (stockee === undefined) return proposees;

    const retenues = new Map<string, unknown>();
    for (const [nom, proposee] of proposees) {
      const colonne = table.colonnes.get(nom);
      if (colonne === undefined) continue;
      if (valeursEquivalentes(colonne.famille, stockee[nom], proposee)) continue;
      retenues.set(nom, proposee);
    }
    return retenues;
  }

  /**
   * Réécrit l'ensemble d'une liaison : suppression puis réinsertion.
   *
   * Un différentiel serait plus fin, mais pas plus juste : la liaison ne porte
   * pas de `version` (`CONVENTIONS.md` §3, la version est celle du parent), et
   * la table est réécrite dans la même transaction que le parent, lui-même
   * protégé par le verrouillage optimiste. Ce que ce choix coûte est une
   * réécriture inutile quand rien n'a changé ; ce qu'il évite est un
   * différentiel à trois cas dont chacun est une occasion de se tromper.
   */
  private async ecrireLiaison(
    client: PoolClient,
    liaison: DescriptionLiaison,
    identifiantParent: string,
    filiale: string | null,
    elements: readonly Record<string, unknown>[],
    entite: NomEntite,
  ): Promise<void> {
    const table = this.table(liaison.table);

    await this.executer(
      client,
      `delete from ${ident(liaison.table)} where ${ident(liaison.colonneParent)} = $1`,
      [identifiantParent],
      entite,
      identifiantParent,
    );

    for (const element of elements) {
      const colonnes: string[] = [ident(liaison.colonneParent)];
      const parametres: unknown[] = [identifiantParent];
      const marques: string[] = ['$1'];

      if (table.cloisonnee) {
        colonnes.push(ident('filiale_id'));
        parametres.push(filiale);
        marques.push(`$${String(parametres.length)}`);
      }

      for (const [nomColonne, valeur] of Object.entries(element)) {
        const colonne = table.colonnes.get(nomColonne);
        // Une colonne engendrée n'est jamais nommée : `document_referentiels`
        // porte `portee_groupe` (CONVENTIONS.md §18.6).
        if (colonne === undefined || colonne.engendree) continue;
        colonnes.push(ident(nomColonne));
        parametres.push(valeur);
        marques.push(`$${String(parametres.length)}`);
      }

      await this.executer(
        client,
        `insert into ${ident(liaison.table)} (${colonnes.join(', ')}) ` +
          `values (${marques.join(', ')}) on conflict do nothing`,
        parametres,
        entite,
        identifiantParent,
      );
    }
  }

  private async filialeDeLaLigne(
    client: PoolClient,
    nomTable: string,
    identifiant: string,
  ): Promise<string | null> {
    const table = this.table(nomTable);
    if (!table.cloisonnee) return null;
    const { rows } = await client.query<{ filiale_id: string | null }>(
      `select ${ident('filiale_id')} as filiale_id from ${ident(nomTable)} where ${ident('id')} = $1`,
      [identifiant],
    );
    return rows[0]?.filiale_id ?? null;
  }

  /* ===============================================================
   *  8.10 — Validation et répartition des champs reçus
   * =============================================================== */

  /**
   * Répartit les champs reçus entre les tables et les liaisons, en **refusant**
   * ce qui n'a pas de destination.
   *
   * Trois refus, tous délibérés :
   *  · un champ inconnu — sinon une donnée saisie disparaît sans un mot ;
   *  · un champ visant une colonne de traçabilité ou `filiale_id` — le client
   *    ne les fixe pas (`CONVENTIONS.md` §18.1, `PLAN_SERVEUR` §2.4) ;
   *  · une valeur du mauvais type — au bord, avant la base, avec un message qui
   *    nomme le champ.
   */
  private repartir(
    d: DescriptionEntite,
    champs: Enregistrement,
    entite: NomEntite,
    signalerChampInconnu: ((champ: string) => void) | null = null,
  ): {
    valeurs: Map<string, Map<string, unknown>>;
    liaisons: Map<DescriptionLiaison, Record<string, unknown>[]>;
  } {
    const noms = Object.keys(champs);
    if (noms.length > BORNES.champsParEnregistrement) {
      throw invalide(
        `Trop de champs pour un enregistrement (${String(noms.length)}, maximum ` +
          `${String(BORNES.champsParEnregistrement)}).`,
      );
    }

    const valeurs = new Map<string, Map<string, unknown>>();
    const liaisons = new Map<DescriptionLiaison, Record<string, unknown>[]>();
    const parChamp = new Map((d.liaisons ?? []).map((l) => [l.champ, l]));

    for (const champ of noms) {
      const valeur = champs[champ];

      // ── T-6 : `id` est REFUSÉ, pas avalé ─────────────────────────────
      // La route de création déclare `id` pour le refuser explicitement, en
      // expliquant qu'« une propriété retirée en silence ne serait jamais
      // apprise par le client ». Le garde ne valait qu'au niveau de
      // l'enveloppe : glissé dans `champs`, l'identifiant était ignoré sans un
      // mot — le seul champ traité ainsi, et justement celui du constat M-3.
      //
      // Le chemin de REPRISE retire `id` avant d'appeler : là, il est porté par
      // l'enregistrement et il est légitime.
      if (champ === 'id') {
        throw invalide(
          "L'identifiant d'un enregistrement ne se transmet pas parmi ses champs : il est " +
            'engendré par le serveur à la création, et porté par l’adresse à la modification.',
          `champ « id » refusé sur ${entite}`,
        );
      }
      if (CHAMPS_STRUCTURELS.has(champ)) continue;

      const liaison = parChamp.get(champ);
      if (liaison !== undefined) {
        liaisons.set(liaison, this.normaliserLiaison(liaison, valeur));
        continue;
      }

      const cible = cibleDuChamp(this.catalogue, d, champ);
      if (cible === 'ignore') continue;
      if (cible === null) {
        // ── Deux régimes, et la différence est délibérée ──────────────────
        // Écriture ORDINAIRE : un champ sans destination est REFUSÉ. Une
        // donnée saisie qui disparaît sans un mot est pire qu'un refus.
        // REPRISE d'un fichier : le refus en bloc serait pire encore — un
        // export d'une version dérivée porte des champs que ce modèle ne
        // connaît pas, et le `PLAN_SERVEUR` §5 demande un « rapport d'erreurs
        // ligne par ligne », pas un rejet du fichier entier. Le champ est donc
        // SIGNALÉ, et il remonte dans le bilan.
        if (signalerChampInconnu !== null) {
          signalerChampInconnu(`${entite}.${nomLisible(champ)}`);
          continue;
        }
        throw invalide(
          `Le champ « ${nomLisible(champ)} » n'appartient pas à l'entité « ${entite} », ou n'est ` +
            "pas modifiable depuis cette interface. Aucune donnée n'a été enregistrée.",
          `champ refusé : ${entite}.${champ}`,
        );
      }

      const table = valeurs.get(cible.table) ?? new Map<string, unknown>();
      table.set(cible.colonne.nom, convertirPourLaBase(champ, valeur, cible.colonne));
      valeurs.set(cible.table, table);
    }

    return { valeurs, liaisons };
  }

  private normaliserLiaison(
    liaison: DescriptionLiaison,
    valeur: unknown,
  ): Record<string, unknown>[] {
    const elements: Record<string, unknown>[] = [];

    if (liaison.forme === 'objet-de-listes') {
      if (valeur === null || typeof valeur !== 'object' || Array.isArray(valeur)) {
        throw invalide(`Le champ « ${liaison.champ} » doit être un objet de listes.`);
      }
      for (const [cle, liste] of Object.entries(valeur as Record<string, unknown>)) {
        if (!Array.isArray(liste)) {
          throw invalide(`Le champ « ${liaison.champ}.${nomLisible(cle)} » doit être une liste.`);
        }
        for (const element of liste) {
          const texte = texteObligatoire(element, `${liaison.champ}.${cle}`);
          elements.push({ [liaison.colonneCle ?? '']: cle, [liaison.colonneEnfant]: texte });
        }
      }
    } else if (Array.isArray(valeur)) {
      for (const element of valeur) {
        if (liaison.forme === 'identifiants') {
          elements.push({ [liaison.colonneEnfant]: texteObligatoire(element, liaison.champ) });
        } else {
          if (element === null || typeof element !== 'object' || Array.isArray(element)) {
            throw invalide(`Le champ « ${liaison.champ} » doit être une liste d'objets.`);
          }
          const source = element as Record<string, unknown>;
          const ligne: Record<string, unknown> = {};
          for (const [cle, colonne] of Object.entries(liaison.attributs ?? {})) {
            const brut = source[cle];
            if (brut === undefined || brut === null || brut === '') continue;
            ligne[colonne] = texteObligatoire(brut, `${liaison.champ}.${cle}`);
          }
          if (ligne[liaison.colonneEnfant] === undefined) {
            throw invalide(`Un élément de « ${liaison.champ} » ne désigne aucune cible.`);
          }
          elements.push(ligne);
        }
      }
    } else {
      throw invalide(`Le champ « ${liaison.champ} » doit être une liste.`);
    }

    if (elements.length > BORNES.elementsParLiaison) {
      throw invalide(
        `Le champ « ${liaison.champ} » porte trop d'éléments (maximum ` +
          `${String(BORNES.elementsParLiaison)}).`,
      );
    }
    return elements;
  }

  /* ===============================================================
   *  8.11 — Utilitaires internes
   * =============================================================== */

  /**
   * Refuse l'écriture d'une entité de **niveau Groupe** à une session qui ne
   * déclare pas d'administration Groupe.
   *
   * ── M-4, et pourquoi ce garde-fou est ici plutôt qu'ailleurs ─────────
   *
   * `mappings` (le catalogue des correspondances ANSSI↔ISO↔NIS2↔DORA) est de
   * niveau Groupe : **pas de colonne `filiale_id`**, donc hors de la famille de
   * politiques qui protège les lignes de portée Groupe des tables mixtes, et
   * hors du garde-fou `portee: 'groupe'` de la création, qui ne vaut que pour
   * celles-là. Ses quatre politiques valent `true`. N'importe quelle session de
   * filiale pouvait donc créer, réécrire et **supprimer** une référence
   * commune aux vingt filiales — le rayon d'une action de filiale sortait de la
   * filiale (porte S2, constat M-4).
   *
   * Le critère n'est pas une liste de tables : c'est **l'absence de
   * `filiale_id`**, que le catalogue donne. Une entité de niveau Groupe ajoutée
   * demain sera couverte sans que ce fichier change.
   *
   * ⚠️ **Ce garde-fou est en TypeScript, et c'est une faiblesse assumée, pas
   * une solution.** Le `PLAN_SERVEUR` §1.9 veut que la RLS soit le filet SOUS
   * le code, et le `CONVENTIONS.md` §17.9 dit exactement pourquoi : « un filet
   * dont la seule maille est dans le code qu'il est censé rattraper n'est pas
   * un filet ». La vraie correction appartient à la migration `004_rls.sql`,
   * dont ce n'est pas le périmètre ici : faire passer `mappings` et
   * `mapping_exigences` de la famille « ouverte » à la famille
   * « configuration », dont l'écriture est conditionnée à
   * `f_administration_groupe()`. Elle est demandée à l'orchestrateur ; en
   * attendant, ceci ferme le chemin applicatif, qui est le seul qui existe.
   */
  private exigerDroitEcriture(
    d: DescriptionEntite,
    perimetre: PerimetreSession,
    entite: NomEntite,
  ): void {
    if (this.table(d.table).cloisonnee) return;
    if (perimetre.administrationGroupe) return;

    throw new ErreurAccesEntite({
      motif: 'refus_perimetre',
      message:
        'Cet élément appartient au socle commun du Groupe : il est le même pour toutes les ' +
        'filiales. Sa modification relève de l’administration Groupe.',
      entite,
      detailJournal:
        `écriture refusée sur ${d.table} : entité de niveau Groupe (aucune colonne filiale_id), ` +
        'session sans administration Groupe',
    });
  }

  private table(nom: string): DescriptionTable {
    const table = this.catalogue.tables.get(nom);
    if (table === undefined) throw incoherent(`Table absente du catalogue : ${nom}`);
    return table;
  }

  private filialeActive(perimetre: PerimetreSession): string {
    if (perimetre.filialeId === null) {
      throw incoherent(
        "Périmètre sans filiale active : la couche d'accès ne peut ni lire ni écrire un jeu de " +
          'données de filiale.',
      );
    }
    return perimetre.filialeId;
  }

  /**
   * Joue une requête et **enveloppe** un refus de PostgreSQL, sans jamais le
   * laisser remonter tel quel : c'est `src/erreurs/` qui décidera de ce que le
   * client en voit (contrôle S12).
   */
  private async executer(
    client: PoolClient,
    texte: string,
    parametres: readonly unknown[],
    entite: NomEntite,
    identifiant?: string,
  ): Promise<{ rowCount: number | null }> {
    try {
      const resultat = await client.query(texte, [...parametres]);
      return { rowCount: resultat.rowCount };
    } catch (erreur) {
      const code = (erreur as { code?: unknown }).code;
      if (typeof code === 'string' && /^[0-9A-Za-z]{5}$/.test(code)) {
        throw new ErreurAccesEntite({
          motif: 'refus_base',
          message: 'Opération refusée par la base de données.',
          entite,
          identifiant,
          erreurBase: erreur as Record<string, unknown>,
          detailJournal: `entite=${entite}${identifiant === undefined ? '' : ` id=${identifiant}`}`,
        });
      }
      throw erreur;
    }
  }
}

/* =====================================================================
 *  §9 — Conversions
 * ===================================================================== */

/** Expression de lecture d'une colonne, avec le cadrage de type nécessaire. */
function expressionLecture(prefixe: string, colonne: DescriptionColonne): string {
  const reference = `${prefixe}.${ident(colonne.nom)}`;
  // `pg` rend une date SQL sous forme d'objet Date positionné à minuit dans le
  // fuseau du serveur — ce qui décale la date d'un jour selon le fuseau, et
  // casse le round-trip d'un export grc-backup. Le cadrage en texte referme le
  // sujet à la source, sans toucher aux analyseurs globaux de `pg` (un réglage
  // global vaudrait pour tout le processus, y compris pour du code qui ne le
  // demande pas).
  if (colonne.famille === 'date') return `to_char(${reference}, 'YYYY-MM-DD')`;
  return reference;
}

/**
 * Valeur rendue au frontend.
 *
 * `null` devient `""` pour les familles texte et date : le modèle navigateur
 * n'a jamais porté de `null` sur ces champs — il porte la chaîne vide — et
 * lui rendre `null` ferait apparaître « null » dans les écrans. Les autres
 * familles conservent leur `null`, qui y est signifiant (`mesure_id` délié,
 * `maturite` non renseignée).
 */
function versLeFrontend(valeur: unknown, famille: FamilleType): unknown {
  if (valeur === null || valeur === undefined) {
    return famille === 'texte' || famille === 'date' ? '' : null;
  }
  switch (famille) {
    case 'texte':
    case 'date':
      return typeof valeur === 'string' ? valeur : String(valeur);
    case 'entier':
    case 'nombre':
      // `pg` rend `numeric` et `int8` sous forme de chaînes, pour ne pas perdre
      // de précision. Le modèle navigateur, lui, attend des nombres.
      return typeof valeur === 'number' ? valeur : Number(valeur);
    case 'booleen':
      return Boolean(valeur);
    case 'horodatage':
      return enMillisecondes(valeur);
    case 'json':
      return valeur;
  }
}

/**
 * Deux valeurs désignent-elles la même chose, l'une venue de la base et l'autre
 * du navigateur ? Sert au retrait des colonnes inchangées (§M-1).
 *
 * La comparaison est faite **famille par famille** parce que les deux côtés
 * n'ont pas la même représentation : `pg` rend un `numeric` en chaîne, une date
 * cadrée par `expressionLecture` en `AAAA-MM-JJ`, un `timestamptz` en `Date`.
 * En cas de doute, on répond « différent » : écrire pour rien est sans
 * conséquence, tenir à tort une saisie pour inchangée la perdrait.
 */
/**
 * Tri topologique : rend les éléments dans un ordre où chaque élément suit
 * ceux dont il dépend.
 *
 * ⚠️ **Un cycle n'est pas silencieusement contourné.** Il signifierait que le
 * graphe des clés étrangères s'est refermé sur lui-même, ce que le
 * `CONVENTIONS.md` §16.1 déclare impossible par construction — et si cela
 * devenait faux, l'ordre rendu serait faux avec lui. On échoue donc, en
 * nommant les éléments restants : un ordre approximatif produirait des refus
 * d'intégrité incompréhensibles au milieu d'une reprise.
 */
/**
 * Réécrit, dans un enregistrement, les références visées par un renommage.
 * N'agit que sur les champs déclarés comme portant une référence.
 */
function appliquerRenommages(
  enregistrement: Enregistrement,
  d: DescriptionEntite,
  referencesDeLaTable: ReadonlyMap<string, NomEntite> | undefined,
  renommages: ReadonlyMap<NomEntite, ReadonlyMap<string, string>>,
): void {
  if (renommages.size === 0 || referencesDeLaTable === undefined) return;
  for (const [colonne, cible] of referencesDeLaTable) {
    const champ = champDeColonne(d, d.table, colonne);
    const valeur = enregistrement[champ];
    if (typeof valeur !== 'string') continue;
    // Le plan de la SEULE entité visée par cette colonne : c'est ce
    // cloisonnement qui empêche de confondre un risque et une exigence
    // portant le même identifiant (constat T-5).
    const nouveau = renommages.get(cible)?.get(valeur);
    if (nouveau !== undefined) enregistrement[champ] = nouveau;
  }
}

function trierParDependances<T>(
  elements: readonly T[],
  dependances: ReadonlyMap<T, ReadonlySet<T>>,
): readonly T[] {
  const ordre: T[] = [];
  const place = new Set<T>();
  let restants = [...elements];

  while (restants.length > 0) {
    const prets = restants.filter((element) => {
      const requis = dependances.get(element);
      if (requis === undefined) return true;
      for (const dependance of requis) {
        if (!place.has(dependance) && restants.includes(dependance)) return false;
      }
      return true;
    });

    if (prets.length === 0) {
      throw incoherent(
        `Cycle dans le graphe des dépendances : ${restants.map((e) => String(e)).join(', ')}. ` +
          "L'ordre d'écriture ne peut pas être dérivé, la reprise est refusée.",
      );
    }
    for (const element of prets) {
      ordre.push(element);
      place.add(element);
    }
    restants = restants.filter((element) => !place.has(element));
  }
  return ordre;
}

function valeursEquivalentes(famille: FamilleType, stockee: unknown, proposee: unknown): boolean {
  if (famille === 'json') return false;

  // ── N-4, puis T-7 : `NULL` et `''` désignent la MÊME absence ─────────
  //
  // Cette comparaison doit être l'inverse exact de `versLeFrontend`, qui rend
  // `NULL` sous la forme `''` pour ces deux familles — délibérément, parce que
  // le modèle navigateur ne porte pas de `null`. Tant qu'elle déclarait les
  // deux différents, **le client ne pouvait pas renvoyer une valeur qui compare
  // égale** : il relisait `''`, le renvoyait, et on le tenait pour un
  // changement. Le remède de M-1 ne fonctionnait donc pas contre une colonne
  // nulle — c'est-à-dire contre l'asymétrie de M-8, revenue à l'intérieur du
  // remède de M-1 (porte S2 bis, constat N-4).
  //
  // Le vide se définit donc ici comme il est rendu là-bas, et pas autrement.
  //
  // La première rédaction ne le faisait que pour les familles TEXTE et DATE —
  // celles que `versLeFrontend` rend en `''`. C'était la moitié du chemin :
  // `convertirPourLaBase` convertit `''` en `NULL` pour **toutes** les autres
  // familles, si bien qu'un `''` proposé sur une colonne booléenne, entière ou
  // d'horodatage était encore tenu pour un changement, et réclamait donc le
  // droit d'écrire (porte S2 ter, constat T-7 : `_deleted` renvoyé à `''` sur
  // une correspondance de portée Groupe → 403). La chaîne vide est le « non
  // renseigné » du modèle navigateur, quelle que soit la colonne : elle vaut
  // l'absence partout, ici comme à l'écriture.
  const vide = (valeur: unknown): boolean =>
    valeur === null || valeur === undefined || valeur === '';

  const videA = vide(stockee);
  const videB = vide(proposee);
  if (videA || videB) return videA && videB;

  switch (famille) {
    case 'texte':
    case 'date':
      return String(stockee) === String(proposee);
    case 'entier':
    case 'nombre':
      return Number(stockee) === Number(proposee);
    case 'booleen':
      return Boolean(stockee) === Boolean(proposee);
    case 'horodatage':
      return enMillisecondes(stockee) === enMillisecondes(proposee);
    default:
      return false;
  }
}

/** Reconnaît un `23505` (violation d'unicité) sans importer de dépendance. */
function estViolationUnicite(erreur: unknown): boolean {
  const brut =
    erreur instanceof ErreurAccesEntite ? erreur.erreurBase : (erreur as Record<string, unknown>);
  return typeof brut === 'object' && brut !== null && brut['code'] === '23505';
}

function enMillisecondes(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof Date) return valeur.getTime();
  const date = new Date(String(valeur));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/** Convertit et **valide** une valeur reçue du navigateur. */
function convertirPourLaBase(champ: string, valeur: unknown, colonne: DescriptionColonne): unknown {
  const nom = nomLisible(champ);

  if (valeur === undefined || valeur === null) return null;

  // ── LA CHAÎNE VIDE, ET LE POINT OÙ LES DEUX CONVENTIONS SE RENCONTRENT ──
  //
  // La chaîne vide est le « non renseigné » du modèle navigateur ; le `NULL`
  // est celui du schéma. Trois cas, et un seul conserve la chaîne :
  //
  //  · colonne non texte  -> NULL. Une date vide n'est pas une date.
  //  · colonne texte dont le schéma REFUSE la chaîne vide (liste fermée qui ne
  //    la contient pas, ou `check (colonne <> '')`) -> NULL. C'est le constat
  //    M-8 de la porte S2 : sans cette ligne, un prestataire dont la criticité
  //    n'est pas évaluée — l'état par défaut du formulaire — est refusé en bloc.
  //    Le fait que la colonne refuse le vide est DÉCOUVERT dans `pg_constraint`
  //    (`decouvrirVidesInterdits`), jamais recopié ici.
  //  · colonne texte libre -> la chaîne vide est conservée telle quelle. Le
  //    round-trip la doit, et la relecture rend `''` dans les deux cas
  //    (`versLeFrontend`), si bien que la conversion reste invisible du
  //    navigateur.
  if (valeur === '' && (colonne.famille !== 'texte' || colonne.videInterdit)) return null;

  switch (colonne.famille) {
    case 'texte': {
      if (typeof valeur !== 'string') {
        throw invalide(`Le champ « ${nom} » attend du texte.`);
      }
      if (valeur.length > BORNES.caracteresParValeur) {
        throw invalide(
          `Le champ « ${nom} » dépasse ${String(BORNES.caracteresParValeur)} caractères.`,
        );
      }
      return valeur;
    }

    case 'entier': {
      const nombre = typeof valeur === 'number' ? valeur : Number(valeur);
      if (typeof valeur !== 'number' && typeof valeur !== 'string') {
        throw invalide(`Le champ « ${nom} » attend un nombre entier.`);
      }
      if (!Number.isFinite(nombre) || !Number.isInteger(nombre)) {
        throw invalide(`Le champ « ${nom} » attend un nombre entier.`);
      }
      if (nombre < -2147483648 || nombre > 2147483647) {
        throw invalide(`Le champ « ${nom} » est hors des bornes admises.`);
      }
      return nombre;
    }

    case 'nombre': {
      const nombre = typeof valeur === 'number' ? valeur : Number(valeur);
      if (typeof valeur !== 'number' && typeof valeur !== 'string') {
        throw invalide(`Le champ « ${nom} » attend un nombre.`);
      }
      if (!Number.isFinite(nombre)) {
        throw invalide(`Le champ « ${nom} » attend un nombre.`);
      }
      return nombre;
    }

    case 'booleen': {
      if (typeof valeur === 'boolean') return valeur;
      throw invalide(`Le champ « ${nom} » attend « vrai » ou « faux ».`);
    }

    case 'date': {
      if (typeof valeur !== 'string') {
        throw invalide(`Le champ « ${nom} » attend une date au format AAAA-MM-JJ.`);
      }
      // Le modèle navigateur écrit des dates ISO courtes ; un export ancien
      // peut porter une date ISO complète. On accepte les deux, on n'en rend
      // qu'une.
      const court = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(valeur);
      if (court === null || court[1] === undefined) {
        throw invalide(`Le champ « ${nom} » attend une date au format AAAA-MM-JJ.`);
      }
      const jour = court[1];
      const controle = new Date(`${jour}T00:00:00Z`);
      if (Number.isNaN(controle.getTime()) || !controle.toISOString().startsWith(jour)) {
        throw invalide(`Le champ « ${nom} » ne désigne pas une date réelle.`);
      }
      return jour;
    }

    case 'horodatage': {
      if (typeof valeur === 'number') {
        if (!Number.isFinite(valeur)) throw invalide(`Le champ « ${nom} » attend un horodatage.`);
        return new Date(valeur).toISOString();
      }
      if (typeof valeur === 'string') {
        const date = new Date(valeur);
        if (Number.isNaN(date.getTime())) {
          throw invalide(`Le champ « ${nom} » attend un horodatage.`);
        }
        return date.toISOString();
      }
      throw invalide(`Le champ « ${nom} » attend un horodatage.`);
    }

    case 'json': {
      if (typeof valeur !== 'object') {
        throw invalide(`Le champ « ${nom} » attend un document structuré.`);
      }
      verifierDocument(nom, valeur, 1);
      return JSON.stringify(valeur);
    }
  }
}

/**
 * Borne un document JSON reçu (`audits.items`, `scenarios_pra.etapes_pra`…).
 *
 * Sans borne, un document profond ou immense est un déni de service applicatif
 * bon marché (contrôle S13) : `JSON.stringify` sur une structure d'un million
 * de nœuds bloque la boucle d'événements du serveur entier.
 */
function verifierDocument(nom: string, valeur: unknown, profondeur: number): number {
  if (profondeur > BORNES.profondeurJson) {
    throw invalide(`Le champ « ${nom} » est imbriqué trop profondément.`);
  }
  if (valeur === null || typeof valeur !== 'object') return 1;

  let noeuds = 1;
  const elements = Array.isArray(valeur) ? valeur : Object.values(valeur as object);
  for (const element of elements) {
    noeuds += verifierDocument(nom, element, profondeur + 1);
    if (noeuds > BORNES.noeudsJson) {
      throw invalide(`Le champ « ${nom} » porte un document trop volumineux.`);
    }
  }
  return noeuds;
}

function texteObligatoire(valeur: unknown, champ: string): string {
  if (typeof valeur !== 'string' || valeur === '') {
    throw invalide(`Le champ « ${nomLisible(champ)} » porte un élément vide ou non textuel.`);
  }
  if (valeur.length > 64) {
    throw invalide(`Le champ « ${nomLisible(champ)} » porte un identifiant trop long.`);
  }
  return valeur;
}

/** Nom de champ tel qu'il peut être renvoyé au client, sans surprise. */
function nomLisible(champ: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]{0,63}$/.test(champ) ? champ : 'inconnu';
}

/**
 * Identifiant métier tel qu'il peut être renvoyé au client.
 *
 * `nomLisible` ne convient pas : il vise les noms de COLONNES, et son motif
 * refuse le tiret — un identifiant du produit (`RISK-1788…-137`) y devient
 * « inconnu », ce qui prive le message de la seule information utile.
 *
 * Le rendre n'apprend rien à personne **là où il vient de l'appelant** : c'est
 * le cas du refus de doublon interne au fichier (T-2), où l'identifiant est
 * lu dans le fichier que l'appelant vient d'envoyer. On se borne donc à
 * empêcher qu'un identifiant forgé n'injecte des caractères de contrôle dans
 * un journal ou une réponse, et à en borner la longueur.
 *
 * ⚠️ Ne jamais s'en servir pour un identifiant **découvert en base** : ce
 * serait rendre visible ce que la session ne voit pas.
 */
function identifiantLisible(identifiant: string): string {
  const propre = identifiant.replace(/[\u0000-\u001f\u007f]/g, '');
  if (propre === '') return 'inconnu';
  return propre.length > 64 ? `${propre.slice(0, 64)}…` : propre;
}

/* =====================================================================
 *  §10 — Identifiants métier
 * ===================================================================== */

/** Octets tirés pour le suffixe aléatoire : 16 octets, soit 128 bits. */
const OCTETS_ALEA = 16;

/** Longueur du suffixe en base 36 — `ceil(128 / log2(36))`, complétée à gauche. */
const LONGUEUR_ALEA = 25;

/** Marque d'un identifiant ré-émis par le serveur (voir `identifiantDerive`). */
const MARQUE_REEMISSION = 'r';

/** Nombre de tirages du contrôle d'entropie de démarrage. */
const TIRAGES_CONTROLE_ENTROPIE = 20_000;

/** Plancher d'entropie exigé du suffixe, en bits. */
const BITS_ALEA_MINIMUM = 120;

/** Un paquet d'octets rendu en base 36, à longueur constante. */
function enBase36(octets: Uint8Array): string {
  let valeur = 0n;
  for (const octet of octets) valeur = (valeur << 8n) | BigInt(octet);
  return valeur.toString(36).padStart(LONGUEUR_ALEA, '0');
}

/**
 * Engendre un identifiant au format du `CONVENTIONS.md` §2, celui d'`UI.genId`
 * côté navigateur : `"<PRÉFIXE>-<horodatage>-<aléa>"`. Le format est **le
 * même** des deux côtés, sans quoi le round-trip d'un export `grc-backup`
 * cesserait d'être exact.
 *
 * ── Porte S2 quater, constat Q-1 ─────────────────────────────────────
 *
 * L'aléa tenait sur **un million de valeurs** (`getRandomValues % 1_000_000`).
 * Mesuré sur ce module : 20 000 tirages rendaient 19 997 valeurs distinctes,
 * soit trois collisions. Le remède avait pourtant été écrit, gardé, mesuré et
 * démontré — sur `f_generer_id()`, la fonction SQL, qui n'est la valeur par
 * défaut que de `journal_audit.id` : une table que ce lot n'écrit jamais. Le
 * générateur du navigateur était devenu plus fort que celui du serveur.
 *
 * Ici, 128 bits tirés du générateur cryptographique, rendus en base 36 comme
 * `UI.genId` le fait de son côté. Budget de longueur : `MESURE-` (7) +
 * horodatage (13) + tiret + 25 = **46 caractères**, quand le domaine
 * `id_metier` en admet 64.
 *
 * Ce qui manquait au premier remède n'était pas la mesure : c'était le
 * contrôle qui la rejoue. Il est en bas de ce fichier
 * (`verifierGenerateurIdentifiants`), appelé par `verifierRegistre`, et il
 * fait échouer le DÉMARRAGE du service.
 */
export function engendrerIdentifiant(prefixe: string): string {
  return `${prefixe}-${String(Date.now())}-${enBase36(randomBytes(OCTETS_ALEA))}`;
}

/**
 * Identifiant de **ré-émission** : celui que le serveur retient quand
 * l'identifiant d'un fichier de reprise est déjà pris dans le domaine global
 * par une ligne que l'appelant ne voit pas (constat N-1).
 *
 * ── Porte S2 quater, constat Q-2 : pourquoi il est DÉRIVÉ, pas tiré ───
 *
 * Il était tiré au hasard. Chaque reprise du même fichier fabriquait donc un
 * clone de plus, et la référence visait le dernier :
 *
 *     reprise 1 → crees {risques:1}    reprise 2 → crees {risques:1}
 *     reprise 3 → crees {risques:1}    ⇒ trois lignes pour un enregistrement
 *
 * Le chemin n'existait pas tant que l'unicité d'idempotence interdisait la
 * seconde application d'un fichier — c'est le correctif T-4 qui l'a ouvert, en
 * rendant possible le geste qu'il devait rendre possible : restaurer,
 * constater, restaurer encore. Septième occurrence du motif : *le remède crée
 * son propre chemin*.
 *
 * Une empreinte de `(filiale, table, identifiant du fichier)` rend la
 * ré-émission **idempotente** : la seconde reprise retombe sur le même
 * identifiant, donc RETROUVE la ligne au lieu d'en fabriquer une autre (voir
 * `appliquerReprise`). L'issue reste rigoureusement indistincte pour
 * l'appelant — c'est ce que le §20.1 exige d'un oracle fermé —, puisque rien
 * de ce calcul ne sort du serveur.
 *
 * La marque « -r- » tient lieu d'horodatage : un identifiant dérivé n'en a
 * pas, et ne peut donc pas en porter un crédible. Elle sert deux fois : elle
 * dit à l'exploitant, dans le journal, qu'il lit une ré-émission ; et elle
 * permet à la reprise de savoir, sans calculer une seule empreinte, qu'aucune
 * ré-émission n'a jamais eu lieu dans cette filiale.
 */
export function identifiantDerive(
  prefixe: string,
  filiale: string | null,
  table: string,
  source: string,
): string {
  const empreinte = createHash('sha256')
    .update([filiale ?? '@groupe', table, source].join('\u0000'), 'utf8')
    .digest();
  return `${prefixe}-${MARQUE_REEMISSION}-${enBase36(empreinte.subarray(0, OCTETS_ALEA))}`;
}

/** Cet identifiant est-il une ré-émission du serveur pour ce préfixe ? */
export function estIdentifiantDerive(prefixe: string, identifiant: string): boolean {
  return identifiant.startsWith(`${prefixe}-${MARQUE_REEMISSION}-`);
}

/**
 * Le contrôle qui **rejoue la mesure** — celui qui manquait au premier remède.
 *
 * Il est appelé par `verifierRegistre`, donc par le point de démarrage unique
 * de l'API : une entropie affaiblie ne produit pas un avertissement dans un
 * journal que personne ne lit, elle empêche le service de démarrer. C'est la
 * transposition, côté application, de ce que `f_verifier_schema()` fait côté
 * base (`CONVENTIONS.md` §18.4).
 *
 * Trois choses y sont vérifiées, et chacune se rapporte à un défaut réel :
 *
 *  1. **la forme et le plancher d'entropie** — un échantillon suffit, et il
 *     attrape un affaiblissement même quand le tirage a de la chance ;
 *  2. **la mesure elle-même**, sur le suffixe seul : 20 000 tirages, tous
 *     distincts. Compter sur l'identifiant entier ne prouverait rien, puisque
 *     l'horodatage suffirait à les séparer dès que la boucle traîne — or le
 *     défaut de Q-1 n'apparaît QUE dans une boucle serrée ;
 *  3. **le déterminisme de la ré-émission** (Q-2) : la même entrée rend le
 *     même identifiant, deux entrées différentes en rendent deux, et le
 *     résultat reste reconnaissable — la convergence de la reprise en dépend.
 */
export function verifierGenerateurIdentifiants(): readonly string[] {
  const anomalies: string[] = [];

  const echantillon = engendrerIdentifiant('CTRL');
  const morceaux = echantillon.split('-');
  const alea = morceaux[2] ?? '';
  if (morceaux.length !== 3 || morceaux[0] !== 'CTRL' || !/^\d+$/.test(morceaux[1] ?? '')) {
    anomalies.push(
      `Générateur d'identifiants : la forme « <PRÉFIXE>-<horodatage>-<aléa> » du ` +
        `CONVENTIONS.md §2 n'est plus respectée (« ${echantillon} »).`,
    );
  }
  const bits = alea.length * Math.log2(36);
  if (!/^[0-9a-z]+$/.test(alea) || bits < BITS_ALEA_MINIMUM) {
    anomalies.push(
      `Générateur d'identifiants : le suffixe porte ${bits.toFixed(0)} bits d'aléa, ` +
        `le plancher est de ${String(BITS_ALEA_MINIMUM)} (constat Q-1). Un identifiant ` +
        'engendré en boucle se répéterait, et un import de masse perdrait des lignes.',
    );
  }

  const vus = new Set<string>();
  for (let i = 0; i < TIRAGES_CONTROLE_ENTROPIE; i += 1) {
    vus.add(engendrerIdentifiant('CTRL').split('-')[2] ?? '');
  }
  if (vus.size !== TIRAGES_CONTROLE_ENTROPIE) {
    anomalies.push(
      `Générateur d'identifiants : ${String(TIRAGES_CONTROLE_ENTROPIE)} tirages n'ont rendu ` +
        `que ${String(vus.size)} suffixes distincts (constat Q-1).`,
    );
  }

  const premier = identifiantDerive('RISK', 'FIL-A', 'risques', '7');
  if (identifiantDerive('RISK', 'FIL-A', 'risques', '7') !== premier) {
    anomalies.push(
      "Ré-émission d'identifiant : elle n'est pas déterministe (constat Q-2). Reprendre " +
        'deux fois la même sauvegarde fabriquerait des clones au lieu de converger.',
    );
  }
  if (
    identifiantDerive('RISK', 'FIL-B', 'risques', '7') === premier ||
    identifiantDerive('RISK', 'FIL-A', 'risques', '8') === premier ||
    identifiantDerive('RISK', 'FIL-A', 'exigences', '7') === premier
  ) {
    anomalies.push(
      "Ré-émission d'identifiant : la dérivation ignore l'une de ses entrées (filiale, " +
        'table ou identifiant du fichier). Deux enregistrements distincts se confondraient.',
    );
  }
  if (!estIdentifiantDerive('RISK', premier)) {
    anomalies.push(
      "Ré-émission d'identifiant : le résultat n'est plus reconnaissable comme tel. La " +
        'reprise s’en sert pour retrouver un enregistrement déjà ré-émis (constat Q-2).',
    );
  }

  return anomalies;
}

/**
 * Contrôle la forme d'un identifiant reçu.
 *
 * Volontairement **permissif**, comme le domaine `id_metier` (`CONVENTIONS.md`
 * §2) : les exports anciens portent des identifiants sans suffixe aléatoire,
 * voire sans préfixe, et une expression régulière stricte casserait la reprise.
 * Deux caractères sont refusés, et pour une raison précise : la **virgule**
 * scinderait le périmètre de session, qui transite en liste séparée par des
 * virgules (§17.3), et l'espace en tête ou en fin rend un identifiant
 * indistinguable d'un autre à l'œil.
 */
export function verifierIdentifiant(identifiant: string): void {
  if (identifiant === '' || identifiant.length > 64) {
    throw invalide("L'identifiant doit comporter de 1 à 64 caractères.");
  }
  if (identifiant.includes(',')) {
    throw invalide("L'identifiant ne peut pas contenir de virgule.");
  }
  if (identifiant.trim() !== identifiant) {
    throw invalide("L'identifiant ne peut ni commencer ni finir par un espace.");
  }
  if (/[\u0000-\u001f\u007f]/.test(identifiant)) {
    throw invalide("L'identifiant contient un caractère de contrôle.");
  }
}

/* =====================================================================
 *  §11 — Agrégation « au plus défavorable » (v12)
 * ===================================================================== */

/**
 * Portage exact d'`aggregateFromMesures` (`js/core/datastore.js`) : statut le
 * plus faible — conforme seulement si **toutes** le sont —, maturité la plus
 * basse. « non applicable » est neutre et n'est retenu que si rien d'autre ne
 * l'emporte ; « non évalué » (`""`) est ignoré.
 *
 * Le portage est littéral **à dessein** : c'est ce que les écrans affichent
 * depuis deux ans, et une divergence entre le calcul du serveur et celui du
 * navigateur produirait des taux de conformité différents selon l'endroit où on
 * les lit — ce qu'un auditeur remarquerait avant nous.
 */
export function agregerAuPlusDefavorable(
  mesures: readonly { statut: string; maturite: number }[],
): { statut: string; maturite: number } {
  const rang: Record<string, number> = {
    'non conforme': 0,
    'partiellement conforme': 1,
    conforme: 2,
  };

  let pire: string | null = null;
  let pireRang = 99;
  let maturiteMin: number | null = null;
  let unNonApplicable = false;

  for (const mesure of mesures) {
    const statut = mesure.statut || '';
    if (statut === 'non applicable') {
      unNonApplicable = true;
      continue;
    }
    if (!(statut in rang)) continue;
    const valeur = rang[statut] ?? 99;
    if (valeur < pireRang) {
      pireRang = valeur;
      pire = statut;
    }
    const maturite = Number.isFinite(mesure.maturite) ? mesure.maturite : 0;
    if (maturiteMin === null || maturite < maturiteMin) maturiteMin = maturite;
  }

  if (pire !== null) return { statut: pire, maturite: maturiteMin ?? 0 };
  if (unNonApplicable) return { statut: 'non applicable', maturite: 0 };
  return { statut: '', maturite: 0 };
}
