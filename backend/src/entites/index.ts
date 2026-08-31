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
 *    si le registre et le schéma divergent (contrôle S16).
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

import type { PoolClient } from 'pg';

import type { PerimetreSession } from '../db/pool.js';
import type {
  Catalogue,
  DescriptionColonne,
  DescriptionEntite,
  DescriptionLiaison,
  DescriptionTable,
  Diagnostic,
  Enregistrement,
  FamilleType,
  JeuDeDonnees,
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
});

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
  return { tables, decouvertLe: new Date() };
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
  const anomalies: string[] = [];
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

/** Options de création : la portée d'une ligne d'une table mixte. */
export interface OptionsCreation {
  /**
   * `filiale` (défaut) : la ligne appartient à la filiale active.
   * `groupe` : ligne de portée Groupe — **refusée** tant que la session ne
   * déclare pas une administration Groupe. Fail-closed : le lot L4 ouvrira ce
   * chemin, pas celui-ci.
   */
  readonly portee?: 'filiale' | 'groupe';
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

    return {
      schemaVersion: VERSION_SCHEMA,
      collections,
      volumes,
      horodatage: new Date().toISOString(),
      updatedAt,
    };
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

    return { horodatage: new Date().toISOString(), modifications, volumes, tronque };
  }

  /* ===============================================================
   *  8.3 — Création
   * =============================================================== */

  public async creer(
    client: PoolClient,
    perimetre: PerimetreSession,
    entite: NomEntite,
    champs: Enregistrement,
    identifiantPropose: string | null,
    options: OptionsCreation = {},
  ): Promise<Enregistrement> {
    const d = description(entite);
    const filiale = this.filialeActive(perimetre);
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

    const identifiant = identifiantPropose ?? engendrerIdentifiant(d.prefixe);
    verifierIdentifiant(identifiant);

    const { valeurs, liaisons } = this.repartir(d, champs, entite);

    // La table principale d'abord : c'est elle qui porte l'identité, et les
    // clés étrangères des autres tables la visent.
    await this.inserer(client, d.table, identifiant, filialeLigne, valeurs.get(d.table) ?? new Map<string, unknown>(), entite);

    if (d.seconde !== undefined) {
      // Mise en oeuvre du contrôle : toujours LOCALE à la filiale active,
      // même quand la définition est de portée Groupe (CONVENTIONS.md §16.2).
      const secondaires = valeurs.get(d.seconde.table) ?? new Map<string, unknown>();
      secondaires.set('mesure_id', identifiant);
      await this.inserer(
        client,
        d.seconde.table,
        engendrerIdentifiant('MMO'),
        filiale,
        secondaires,
        entite,
      );
    }

    for (const [liaison, elements] of liaisons) {
      await this.ecrireLiaison(client, liaison, identifiant, filialeLigne, elements, entite);
    }

    const relu = await this.lireUn(client, entite, identifiant, filiale);
    if (relu === null) {
      throw incoherent(
        `Enregistrement ${entite}/${identifiant} inséré puis illisible dans la même transaction.`,
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
  ): Promise<Enregistrement> {
    const d = description(entite);
    const filiale = this.filialeActive(perimetre);
    verifierIdentifiant(identifiant);

    const { valeurs, liaisons } = this.repartir(d, champs, entite);
    const principales = valeurs.get(d.table) ?? new Map<string, unknown>();

    // ── LE CŒUR DU LOT ─────────────────────────────────────────────────
    // « update … where id = $1 and version = $2 ». Zéro ligne = refus, et
    // c'est le diagnostic qui dit LEQUEL des trois (voir §8.7).
    //
    // Le « update » est joué même quand aucune colonne de la table principale
    // ne change : il sert alors de PRISE DE VERROU et de contrôle de version
    // pour les liaisons. Sans lui, modifier les seules liaisons échapperait au
    // verrouillage optimiste — le risque P1 par la porte de derrière.
    //
    // ── L'EXCEPTION, ET ELLE EST FONCTIONNELLE ─────────────────────────
    // Sur une entité SCINDÉE, ne rien écrire dans la table principale n'est pas
    // un cas dégénéré : c'est le cas NOMINAL d'une filiale qui évalue un
    // contrôle du socle Groupe. Écrire la définition partagée lui est refusé —
    // et doit l'être (CONVENTIONS.md §17.6) —, alors que sa mise en oeuvre
    // locale est précisément ce qu'elle a le droit de faire. On se contente
    // alors d'un contrôle de version EN LECTURE sur la définition.
    const toucherPrincipale =
      d.seconde === undefined || principales.size > 0 || liaisons.size > 0;

    if (toucherPrincipale) {
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

    if (d.seconde !== undefined) {
      const secondaires = valeurs.get(d.seconde.table) ?? new Map<string, unknown>();
      if (secondaires.size > 0) {
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
    }

    if (liaisons.size > 0) {
      const porteeLigne = await this.filialeDeLaLigne(client, d.table, identifiant);
      for (const [liaison, elements] of liaisons) {
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
      identifiant,
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
    if (affectations.length === 0) return;

    let condition = `${ident('mesure_id')} = $1 and ${ident('filiale_id')} = $2`;
    if (version !== null) {
      parametres.push(version);
      condition += ` and ${ident('version')} = $${String(parametres.length)}`;
    }

    const resultat = await this.executer(
      client,
      `update ${ident(nomTable)} set ${affectations.join(', ')} where ${condition}`,
      parametres,
      entite,
      mesureId,
    );

    if ((resultat.rowCount ?? 0) > 0) return;

    // Rien de touché : soit la filiale n'évalue pas encore ce contrôle (cas
    // nominal du socle Groupe), soit la version est périmée. La distinction se
    // fait par une lecture, pas par une supposition.
    const { rows } = await client.query<{ version: number | string }>(
      `select ${ident('version')} as version from ${ident(nomTable)}
        where ${ident('mesure_id')} = $1 and ${ident('filiale_id')} = $2`,
      [mesureId, filiale],
    );
    const existante = rows[0];
    if (existante !== undefined) {
      throw new ErreurAccesEntite({
        motif: 'conflit_version',
        message:
          'L’évaluation de ce contrôle a été modifiée entre-temps. Rechargez-la avant de ' +
          'reprendre votre saisie.',
        entite,
        identifiant: mesureId,
        versionActuelle: Number(existante.version),
        detailJournal: `conflit optimiste sur ${nomTable} (mesure ${mesureId}, filiale ${filiale})`,
      });
    }

    const nouvelles = new Map(valeurs);
    nouvelles.set('mesure_id', mesureId);
    await this.inserer(client, nomTable, engendrerIdentifiant('MMO'), filiale, nouvelles, entite);
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

      if (champ === 'id') continue; // porté par l'enveloppe, jamais par les champs
      if (CHAMPS_STRUCTURELS.has(champ)) continue;

      const liaison = parChamp.get(champ);
      if (liaison !== undefined) {
        liaisons.set(liaison, this.normaliserLiaison(liaison, valeur));
        continue;
      }

      const cible = cibleDuChamp(this.catalogue, d, champ);
      if (cible === 'ignore') continue;
      if (cible === null) {
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

  // La chaîne vide est le « non renseigné » du modèle navigateur. Sur une
  // colonne texte elle reste telle quelle (le round-trip la doit) ; ailleurs
  // elle vaut l'absence de valeur.
  if (valeur === '' && colonne.famille !== 'texte') return null;

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

/* =====================================================================
 *  §10 — Identifiants métier
 * ===================================================================== */

/**
 * Engendre un identifiant au format du `CONVENTIONS.md` §2, celui d'`UI.genId`
 * côté navigateur : `"<PRÉFIXE>-<horodatage>-<aléa>"`. Le format est **le
 * même** des deux côtés, sans quoi le round-trip d'un export `grc-backup`
 * cesserait d'être exact.
 */
export function engendrerIdentifiant(prefixe: string): string {
  const alea = Math.floor(Math.random() * 100000);
  return `${prefixe}-${String(Date.now())}-${String(alea)}`;
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
