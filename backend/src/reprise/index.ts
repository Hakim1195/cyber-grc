/**
 * Reprise d'un export `grc-backup` — portage serveur des migrations v1 → v12.
 *
 * Deux usages réels, tous deux prévus par `docs/PLAN_SERVEUR.md` §2.6 :
 *
 *  1. reprendre les données d'une filiale déjà équipée de la version 100 %
 *     navigateur ;
 *  2. **absorber l'export d'une société rachetée**, quelle que soit l'ancienneté
 *     de son fichier — c'est le critère décisif du client (§5).
 *
 * Le module est **pur** : il ne touche ni la base, ni le disque, ni l'horloge
 * (injectable). Il prend une entrée quelconque et rend une charge utile v12
 * normalisée, accompagnée d'un **rapport de reprise** dont la couche
 * d'insertion du lot L2 fera un compte rendu ligne par ligne.
 *
 * ## Trois principes, et ce qu'ils impliquent
 *
 * **Le round-trip est exact.** Les identifiants du fichier deviennent tels
 * quels les clés primaires (`backend/db/CONVENTIONS.md` §2) : aucune table de
 * correspondance, aucune réécriture. Un export ancien — `ACT-1720000000000`
 * sans suffixe aléatoire, processus BIA sans préfixe — passe sans être
 * modifié ; le domaine `id_metier` est délibérément permissif et ce module ne
 * durcit pas ce que le schéma a laissé souple. Ces écarts sont **signalés**,
 * jamais corrigés.
 *
 * **Rien n'est présumé sain.** Le fichier peut être tronqué, mal typé, porter
 * des clés inattendues, des nombres là où l'on attend du texte, des tableaux là
 * où l'on attend des objets, ou une imbrication absurde. Aucune entrée ne doit
 * provoquer d'exception non maîtrisée ni de consommation mémoire déraisonnable :
 * la copie est bornée en profondeur **et** en nombre de nœuds, les clés de
 * pollution de prototype (`__proto__`, `constructor`, `prototype`) sont retirées
 * à la copie, et l'API ne lève jamais — elle rend un statut.
 *
 * **Signaler plutôt que réparer.** Les anomalies (identifiant sans préfixe, clé
 * étrangère implicite pointant dans le vide, valeur hors liste) sont **non
 * bloquantes** : elles remontent au rapport, elles ne modifient pas la donnée.
 * Une seule exception, assumée et journalisée : un enregistrement dépourvu
 * d'identifiant exploitable en reçoit un (`identifiant-engendre`) — sans quoi il
 * n'aurait pas de clé primaire et serait perdu, ce que « sans perte de donnée »
 * interdit.
 *
 * ## Ce que la reprise ne fait pas
 *
 * - Elle ne déchiffre pas. Une enveloppe `encrypted: true` est **refusée avec un
 *   message explicite** : le coffre navigateur disparaît (`PLAN_SERVEUR` §1.9) et
 *   le déchiffrement côté serveur n'est pas au programme de ce lot.
 * - Elle ne connaît aucune filiale. Le périmètre vient du serveur, jamais du
 *   fichier (§2.4) : ni `filiale_id`, ni `cree_par`, ni `version` ne sont posés ici.
 * - Elle n'écrit rien. Les contraintes (clés étrangères, `check`, unicité) sont
 *   celles de la base ; ce module les anticipe pour rendre un rapport utile.
 */

import type {
  Anomalie,
  ChargeV12,
  CodeAnomalie,
  CodeRefus,
  Enregistrement,
  EnveloppeLue,
  FormeEnveloppe,
  GraviteAnomalie,
  MesureCatalogue,
  MesureMiseEnOeuvre,
  MesuresScindees,
  NomCollection,
  ObjetJson,
  OptionsReprise,
  PalierApplique,
  RapportReprise,
  ResultatEnveloppe,
  ResultatReprise,
  ValeurJson,
} from './types.js';

/* =====================================================================
 *  §1 — Constantes du format
 * ===================================================================== */

/** Version de schéma cible : celle du frontend (`SCHEMA_VERSION` de `datastore.js`). */
export const VERSION_SCHEMA = 12;

/** Marqueur d'enveloppe (`js/services/backup.js`). */
export const FORMAT_SAUVEGARDE = 'grc-backup';

/** Valeur attendue du champ `app` de l'enveloppe. */
export const APPLICATION_ATTENDUE = 'cyber-grc-dedienne';

/**
 * Les 21 collections, dans l'ordre exact de `ARRAY_FIELDS` (`datastore.js`).
 * L'ordre est significatif : c'est celui du rapport de volumes.
 */
export const COLLECTIONS = [
  'clients',
  'exigences',
  'actions',
  'risques',
  'actifs',
  'processus',
  'crise',
  'scenarios_pra',
  'tests_pra',
  'prestataires',
  'mco_actions',
  'audits',
  'revues',
  'evaluations',
  'mesures',
  'incidents',
  'documents',
  'traitements',
  'mappings',
  'history',
  'personnes',
] as const satisfies readonly NomCollection[];

/** Bornes de défense contre une entrée hostile. Surchargeables par `OptionsReprise`. */
const TAILLE_MAX_DEFAUT = 64 * 1024 * 1024;
const NOEUDS_MAX_DEFAUT = 2_000_000;
const ANOMALIES_MAX_DEFAUT = 500;

/**
 * Profondeur d'imbrication admise. Les structures les plus profondes du modèle
 * (grille d'audit, étapes RACI d'un scénario, `mappings.refs`) atteignent cinq
 * niveaux ; seize laisse de la marge sans permettre à un fichier fabriqué de
 * faire exploser la pile.
 */
const PROFONDEUR_MAX = 16;

/** Au-delà, un texte est signalé — sans être tronqué : on ne perd pas de donnée. */
const LONGUEUR_TEXTE_SIGNALEE = 100_000;

/** Clés dont la seule présence trahit une tentative de pollution de prototype. */
const CLES_DANGEREUSES: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/* =====================================================================
 *  §2 — Description des collections
 *
 *  Sert exclusivement au **rapport** : rien de ce qui suit ne modifie la
 *  donnée. Les listes fermées reprennent mot pour mot les chaînes du frontend
 *  (accents et espaces compris) — ce sont elles que porteront les `check` de la
 *  base (`CONVENTIONS.md` §5).
 * ===================================================================== */

interface Enumeration {
  readonly champ: string;
  readonly valeurs: readonly string[];
  /** La chaîne vide vaut « non renseigné » et n'est alors pas signalée. */
  readonly videAdmis: boolean;
}

interface Borne {
  readonly champ: string;
  readonly min: number;
  readonly max: number;
}

interface Reference {
  readonly champ: string;
  readonly cible: NomCollection;
}

interface DescriptionCollection {
  /**
   * Préfixe canonique de l'identifiant (`CONVENTIONS.md` §2), ou `null` quand
   * il n'y a rien à vérifier — cas de `mappings`, dont les identifiants
   * légitimes viennent aussi du catalogue statique (`map-…`).
   */
  readonly prefixe: string | null;
  /** Champs du modèle v12 documenté. Tout autre champ est signalé, jamais retiré. */
  readonly champs: readonly string[];
  readonly enumerations: readonly Enumeration[];
  readonly bornes: readonly Borne[];
  readonly dates: readonly string[];
  /** Les clés étrangères implicites simples (`PLAN_SERVEUR` §2.1). */
  readonly references: readonly Reference[];
  /** Les tableaux d'identifiants, futures tables de liaison (`CONVENTIONS.md` §7). */
  readonly referencesMultiples: readonly Reference[];
  /** Clé métier unique, hors identifiant technique. */
  readonly cleMetier: readonly string[] | null;
}

/** Les quatre statuts de conformité, communs aux exigences, évaluations et mesures. */
const STATUTS_CONFORMITE = ['conforme', 'partiellement conforme', 'non conforme', 'non applicable'];

const DESCRIPTIONS: Readonly<Record<NomCollection, DescriptionCollection>> = {
  clients: {
    prefixe: 'CLI',
    champs: ['id', 'nom', 'secteur'],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  exigences: {
    prefixe: 'EX',
    champs: ['id', 'client_id', 'code', 'intitule', 'statut_conformite', 'responsable', 'commentaire'],
    enumerations: [{ champ: 'statut_conformite', valeurs: STATUTS_CONFORMITE, videAdmis: false }],
    bornes: [],
    dates: [],
    references: [{ champ: 'client_id', cible: 'clients' }],
    referencesMultiples: [],
    cleMetier: null,
  },
  actions: {
    prefixe: 'ACT',
    champs: [
      'id', 'titre', 'statut', 'responsable', 'echeance', 'priorite', 'commentaire',
      'exigence_id', 'risque_id', 'evaluation_id', 'incident_id', 'mesure_id',
    ],
    enumerations: [{ champ: 'statut', valeurs: ['à faire', 'en cours', 'terminée'], videAdmis: false }],
    bornes: [],
    dates: ['echeance'],
    references: [
      { champ: 'exigence_id', cible: 'exigences' },
      { champ: 'risque_id', cible: 'risques' },
      { champ: 'evaluation_id', cible: 'evaluations' },
      { champ: 'incident_id', cible: 'incidents' },
      { champ: 'mesure_id', cible: 'mesures' },
    ],
    referencesMultiples: [],
    cleMetier: null,
  },
  risques: {
    prefixe: 'RISK',
    champs: [
      'id', 'nom', 'description', 'f_frequence', 'g_gravite', 'm_maitrise',
      'score_brut', 'score_residuel', 'niveau', 'exigences_liees',
    ],
    enumerations: [{ champ: 'niveau', valeurs: ['faible', 'élevé', 'critique'], videAdmis: true }],
    bornes: [
      { champ: 'f_frequence', min: 0, max: 100 },
      { champ: 'g_gravite', min: 0, max: 100 },
      { champ: 'm_maitrise', min: 0, max: 1 },
    ],
    dates: [],
    references: [],
    referencesMultiples: [{ champ: 'exigences_liees', cible: 'exigences' }],
    cleMetier: null,
  },
  actifs: {
    prefixe: 'ACTIF',
    champs: ['id', 'nom', 'type', 'criticite', 'responsable', 'description', 'risques_lies', 'dependances'],
    enumerations: [
      { champ: 'type', valeurs: ['Matériel', 'Logiciel', 'Donnée', 'Service', 'Humain'], videAdmis: true },
      { champ: 'criticite', valeurs: ['faible', 'modérée', 'élevée', 'critique'], videAdmis: true },
    ],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [{ champ: 'risques_lies', cible: 'risques' }],
    cleMetier: null,
  },
  processus: {
    // Préfixe `BIA` par convention, mais les exports anciens portent des
    // identifiants nus : l'écart est signalé en information, pas corrigé.
    prefixe: 'BIA',
    champs: ['id', 'nom', 'criticite', 'rto', 'rpo', 'responsable', 'description', 'actifs_lies'],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [{ champ: 'actifs_lies', cible: 'actifs' }],
    cleMetier: null,
  },
  crise: {
    prefixe: 'CRISE',
    champs: ['id', 'role', 'nom', 'telephone', 'email', 'suppleant', 'notes'],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  scenarios_pra: {
    prefixe: 'SCEN',
    champs: ['id', 'nom', 'description', 'etapes_pca', 'etapes_pra'],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  tests_pra: {
    prefixe: 'TEST',
    champs: ['id', 'scenario_id', 'date', 'succes', 'type_test', 'bilan'],
    enumerations: [{ champ: 'succes', valeurs: ['Oui', 'Non'], videAdmis: true }],
    bornes: [],
    dates: ['date'],
    references: [{ champ: 'scenario_id', cible: 'scenarios_pra' }],
    referencesMultiples: [],
    cleMetier: null,
  },
  prestataires: {
    prefixe: 'PREST',
    champs: ['id', 'societe', 'type', 'phone', 'email', 'notes', 'criticite', 'acces', 'supplyChain'],
    enumerations: [
      { champ: 'criticite', valeurs: ['faible', 'moyenne', 'forte', 'vitale'], videAdmis: true },
      { champ: 'acces', valeurs: ['aucun', 'limite', 'etendu'], videAdmis: true },
    ],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  mco_actions: {
    prefixe: 'MCO',
    champs: [
      'id', 'titre', 'description', 'responsable', 'frequence', 'priorite',
      'datePrevue', 'dateReelle', 'dateCloture', 'statut', 'avancement', 'commentaire',
    ],
    enumerations: [
      { champ: 'statut', valeurs: ['À planifier', 'En cours', 'Réalisée', 'Annulée'], videAdmis: false },
      {
        champ: 'frequence',
        valeurs: ['Ponctuelle', 'Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle'],
        videAdmis: true,
      },
      { champ: 'priorite', valeurs: ['Basse', 'Moyenne', 'Haute', 'Critique'], videAdmis: true },
    ],
    bornes: [{ champ: 'avancement', min: 0, max: 100 }],
    dates: ['datePrevue', 'dateReelle', 'dateCloture'],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  audits: {
    prefixe: 'AUD',
    champs: [
      'id', 'ref', 'statut', 'date', 'perimetre', 'auditeur', 'audite',
      'synthese', 'constats', 'ref_id', 'items',
    ],
    // `constats[]` et `items[]` restent des documents figés (JSONB, `CONVENTIONS.md` §6) :
    // leur contenu n'est volontairement pas contrôlé, sa fixité est la garantie
    // d'intégrité de l'audit.
    enumerations: [{ champ: 'statut', valeurs: ['Planifié', 'En cours', 'Réalisé'], videAdmis: true }],
    bornes: [],
    dates: ['date'],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  revues: {
    prefixe: 'REV',
    champs: ['id', 'date', 'participants', 'inputs', 'outputs'],
    enumerations: [],
    bornes: [],
    dates: ['date'],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  evaluations: {
    prefixe: 'EVAL',
    champs: ['id', 'ref_id', 'code', 'statut', 'maturite', 'commentaire', 'preuves', 'mesure_ids', 'updatedAt'],
    // `""` = « non évaluée » : c'est un état de première classe du modèle, pas un oubli.
    enumerations: [{ champ: 'statut', valeurs: STATUTS_CONFORMITE, videAdmis: true }],
    bornes: [{ champ: 'maturite', min: 0, max: 5 }],
    dates: [],
    // `ref_id` désigne un référentiel du catalogue **statique**, hors base : aucune
    // clé étrangère à vérifier ici (`PLAN_SERVEUR` §2.1).
    references: [],
    referencesMultiples: [{ champ: 'mesure_ids', cible: 'mesures' }],
    cleMetier: ['ref_id', 'code'],
  },
  mesures: {
    prefixe: 'MESURE',
    champs: ['id', 'nom', 'description', 'statut', 'maturite', 'responsable', 'updatedAt'],
    enumerations: [{ champ: 'statut', valeurs: STATUTS_CONFORMITE, videAdmis: true }],
    bornes: [{ champ: 'maturite', min: 0, max: 5 }],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  incidents: {
    prefixe: 'INC',
    champs: [
      'id', 'titre', 'type', 'gravite', 'statut', 'date_detection', 'date_resolution',
      'description', 'actions_immediates', 'cause_racine', 'actifs_touches', 'risque_id',
      'declaration_anssi', 'declaration_cnil', 'updatedAt',
    ],
    enumerations: [
      { champ: 'gravite', valeurs: ['faible', 'moyenne', 'élevée', 'critique'], videAdmis: true },
      { champ: 'statut', valeurs: ['nouveau', 'en cours', 'résolu', 'clôturé'], videAdmis: true },
      { champ: 'declaration_anssi', valeurs: ['non requise', 'à déclarer', 'déclarée'], videAdmis: true },
      { champ: 'declaration_cnil', valeurs: ['non requise', 'à déclarer', 'déclarée'], videAdmis: true },
    ],
    bornes: [],
    dates: ['date_detection', 'date_resolution'],
    references: [{ champ: 'risque_id', cible: 'risques' }],
    referencesMultiples: [{ champ: 'actifs_touches', cible: 'actifs' }],
    cleMetier: null,
  },
  documents: {
    prefixe: 'DOC',
    champs: [
      'id', 'titre', 'type', 'version', 'proprietaire', 'statut',
      'date_revue', 'emplacement', 'referentiels', 'notes', 'updatedAt',
    ],
    enumerations: [
      { champ: 'statut', valeurs: ['brouillon', 'en vigueur', 'à réviser', 'obsolète'], videAdmis: true },
    ],
    bornes: [],
    dates: ['date_revue'],
    references: [],
    // `referentiels[]` vise le catalogue statique : liaison sans clé étrangère
    // (`CONVENTIONS.md` §7), donc rien à contrôler ici.
    referencesMultiples: [],
    cleMetier: null,
  },
  traitements: {
    prefixe: 'TRT',
    champs: [
      'id', 'nom', 'finalite', 'base_legale', 'responsable', 'personnes_concernees',
      'categories_donnees', 'donnees_sensibles', 'destinataires', 'transfert_hors_ue',
      'duree_conservation', 'mesures_ids', 'notes', 'updatedAt',
    ],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [{ champ: 'mesures_ids', cible: 'mesures' }],
    cleMetier: null,
  },
  mappings: {
    prefixe: null,
    champs: ['id', 'theme', 'aide', 'refs', '_deleted'],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
  history: {
    prefixe: 'HIST',
    champs: ['id', 'ts', 'date', 'metrics'],
    enumerations: [],
    bornes: [],
    dates: ['date'],
    references: [],
    referencesMultiples: [],
    cleMetier: ['date'],
  },
  personnes: {
    prefixe: 'PERS',
    champs: ['id', 'nom', 'fonction', 'service', 'email', 'telephone', 'notes'],
    enumerations: [],
    bornes: [],
    dates: [],
    references: [],
    referencesMultiples: [],
    cleMetier: null,
  },
};

/** Types de lien de la cartographie (`DATA_MODEL.md` §Actif, schéma v9). */
const TYPES_DEPENDANCE = ['dep', 'hosted', 'flux', 'backup'];

/* =====================================================================
 *  §3 — Outils de lecture défensive
 * ===================================================================== */

function estObjet(valeur: unknown): valeur is ObjetJson {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function estTableau(valeur: unknown): valeur is ValeurJson[] {
  return Array.isArray(valeur);
}

/** Texte exploitable, ou `null`. Ne convertit rien : la conversion est explicite ailleurs. */
function texteOuNull(valeur: ValeurJson | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

function texteDe(valeur: ValeurJson | undefined): string {
  return typeof valeur === 'string' ? valeur : '';
}

function nombreOuNull(valeur: ValeurJson | undefined): number | null {
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
}

/** Lecture d'une propriété propre, insensible à ce que porte le prototype. */
function lire(objet: ObjetJson, cle: string): ValeurJson | undefined {
  return Object.prototype.hasOwnProperty.call(objet, cle) ? objet[cle] : undefined;
}

/** Extrait pour un message d'erreur : borné, sur une seule ligne. */
function extrait(valeur: unknown, longueur = 60): string {
  let texte: string;
  if (typeof valeur === 'string') texte = valeur;
  else if (valeur === null) texte = 'null';
  else if (typeof valeur === 'object') texte = Array.isArray(valeur) ? '[tableau]' : '{objet}';
  else texte = String(valeur);
  texte = texte.replace(/\s+/g, ' ');
  return texte.length > longueur ? `${texte.slice(0, longueur)}…` : texte;
}

/**
 * Identifiant au format de `UI.genId` (frontend) et de `f_generer_id` (base) :
 * `<PRÉFIXE>-<millisecondes>-<aléa 0..999>`. Les trois implémentations doivent
 * rester alignées, sans quoi un identifiant engendré ici détonnerait dans les
 * exports ultérieurs.
 */
function engendrerId(prefixe: string, horloge: () => number, alea: () => number): string {
  const millisecondes = Math.trunc(horloge());
  const suffixe = Math.floor(alea() * 1000);
  return `${prefixe.toUpperCase()}-${millisecondes}-${suffixe}`;
}

/* =====================================================================
 *  §4 — Journal des anomalies
 * ===================================================================== */

/**
 * Accumulateur borné. Un fichier fabriqué peut produire des millions
 * d'anomalies : au-delà du plafond on cesse de lister et on le dit, plutôt que
 * de laisser le rapport dévorer la mémoire du serveur.
 */
class JournalAnomalies {
  private readonly liste: Anomalie[] = [];
  private readonly compteurs: Record<GraviteAnomalie, number> = { avertissement: 0, information: 0 };
  private readonly dejaSignalees = new Set<string>();
  private tronque = false;

  constructor(private readonly plafond: number) {}

  public signaler(
    code: CodeAnomalie,
    gravite: GraviteAnomalie,
    message: string,
    contexte: { collection?: NomCollection; identifiant?: string; champ?: string } = {},
  ): void {
    this.compteurs[gravite] += 1;
    if (this.liste.length >= this.plafond) {
      this.tronque = true;
      return;
    }
    this.liste.push({
      code,
      gravite,
      collection: contexte.collection ?? null,
      identifiant: contexte.identifiant ?? null,
      champ: contexte.champ ?? null,
      message,
    });
  }

  /**
   * Variante dédoublonnée : un champ inconnu présent sur 3 000 enregistrements
   * est un seul défaut, pas 3 000 lignes de rapport.
   */
  public signalerUneFois(
    empreinte: string,
    code: CodeAnomalie,
    gravite: GraviteAnomalie,
    message: string,
    contexte: { collection?: NomCollection; identifiant?: string; champ?: string } = {},
  ): void {
    if (this.dejaSignalees.has(empreinte)) return;
    this.dejaSignalees.add(empreinte);
    this.signaler(code, gravite, message, contexte);
  }

  public resultat(): { anomalies: readonly Anomalie[]; compteurs: Readonly<Record<GraviteAnomalie, number>> } {
    const anomalies = this.liste.slice();
    if (this.tronque) {
      const total = this.compteurs.avertissement + this.compteurs.information;
      anomalies.push({
        code: 'anomalies-tronquees',
        gravite: 'information',
        collection: null,
        identifiant: null,
        champ: null,
        message:
          `${total} anomalies au total ; seules les ${this.plafond} premières sont listées. ` +
          'Le fichier mérite un examen manuel avant reprise.',
      });
    }
    return { anomalies, compteurs: { ...this.compteurs } };
  }
}

/* =====================================================================
 *  §5 — Assainissement de l'entrée
 *
 *  `JSON.parse` sur une entrée hostile suivi d'une copie naïve est un vecteur
 *  connu de pollution de prototype : `Object.assign({}, JSON.parse('{"__proto__":…}'))`
 *  passe par [[Set]] et atteint `Object.prototype`. Le `normalize()` du
 *  frontend fait exactement ça — il n'est pas porté tel quel.
 *
 *  La copie ci-dessous reconstruit chaque objet clé par clé, refuse les clés
 *  dangereuses, borne la profondeur (donc casse les cycles d'une entrée passée
 *  en objet plutôt qu'en texte) et compte les nœuds.
 * ===================================================================== */

interface ContexteCopie {
  readonly journal: JournalAnomalies;
  readonly noeudsMax: number;
  noeuds: number;
  budgetDepasse: boolean;
}

function assainir(valeur: unknown, profondeur: number, chemin: string, ctx: ContexteCopie): ValeurJson {
  if (ctx.budgetDepasse) return null;
  ctx.noeuds += 1;
  if (ctx.noeuds > ctx.noeudsMax) {
    ctx.budgetDepasse = true;
    return null;
  }

  if (valeur === null) return null;

  const type = typeof valeur;
  if (type === 'string') {
    const texte = valeur as string;
    if (texte.length > LONGUEUR_TEXTE_SIGNALEE) {
      ctx.journal.signalerUneFois(
        `texte-long:${chemin}`,
        'texte-tres-long',
        'information',
        `${chemin} : texte de ${texte.length} caractères, conservé tel quel.`,
        { champ: chemin },
      );
    }
    return texte;
  }
  if (type === 'boolean') return valeur as boolean;
  if (type === 'number') {
    const nombre = valeur as number;
    if (!Number.isFinite(nombre)) {
      // `NaN` / `Infinity` ne peuvent pas venir de `JSON.parse`, mais peuvent
      // venir d'un objet passé directement par l'appelant.
      ctx.journal.signaler('type-inattendu', 'avertissement', `${chemin} : nombre non fini, remplacé par null.`, {
        champ: chemin,
      });
      return null;
    }
    return nombre;
  }

  if (profondeur >= PROFONDEUR_MAX) {
    ctx.journal.signalerUneFois(
      `profondeur:${chemin}`,
      'profondeur-excessive',
      'avertissement',
      `${chemin} : imbrication au-delà de ${PROFONDEUR_MAX} niveaux, valeur remplacée par null.`,
      { champ: chemin },
    );
    return null;
  }

  if (Array.isArray(valeur)) {
    const sortie: ValeurJson[] = [];
    for (let i = 0; i < valeur.length; i += 1) {
      if (ctx.budgetDepasse) break;
      sortie.push(assainir(valeur[i], profondeur + 1, `${chemin}[${i}]`, ctx));
    }
    return sortie;
  }

  if (type === 'object') {
    const sortie: ObjetJson = {};
    for (const cle of Object.getOwnPropertyNames(valeur as object)) {
      if (ctx.budgetDepasse) break;
      if (CLES_DANGEREUSES.has(cle)) {
        ctx.journal.signaler(
          'cle-dangereuse',
          'avertissement',
          `${chemin} : clé « ${cle} » retirée (tentative de pollution de prototype).`,
          { champ: `${chemin}.${cle}` },
        );
        continue;
      }
      const descripteur = Object.getOwnPropertyDescriptor(valeur as object, cle);
      // Un accesseur ne peut pas venir de JSON ; l'invoquer sur un objet fourni
      // par l'appelant exécuterait du code arbitraire. On l'ignore.
      if (descripteur === undefined || !descripteur.enumerable || !('value' in descripteur)) continue;
      sortie[cle] = assainir(descripteur.value, profondeur + 1, `${chemin}.${cle}`, ctx);
    }
    return sortie;
  }

  // `undefined`, fonction, symbole, `bigint` : rien de tout cela n'a de
  // représentation JSON. On ne devine pas, on signale et on neutralise.
  ctx.journal.signaler('type-inattendu', 'avertissement', `${chemin} : valeur de type « ${type} » ignorée.`, {
    champ: chemin,
  });
  return null;
}

/* =====================================================================
 *  §6 — Lecture de l'enveloppe
 * ===================================================================== */

function refus(
  statut: 'invalide' | 'non-pris-en-charge' | 'chiffre',
  code: CodeRefus,
  message: string,
): ResultatEnveloppe & ResultatReprise {
  return { statut, code, message };
}

/**
 * Reconnaît les trois formes de fichier que `parseImport` accepte côté
 * navigateur, valide l'enveloppe et rend la charge utile **déjà assainie**.
 *
 * La distinction demandée par le lot est portée par le `statut` :
 *  - `invalide` — ce n'est pas un fichier exploitable (JSON illisible, enveloppe
 *    inconnue, charge utile qui ne ressemble pas à une base Cyber GRC) ;
 *  - `non-pris-en-charge` — c'en est un, mais ce lot ne sait pas le traiter
 *    (version postérieure à la v12) ;
 *  - `chiffre` — cas particulier du précédent, assez fréquent pour mériter son
 *    propre statut et un message qui dit quoi faire.
 */
export function lireEnveloppe(entree: unknown, options: OptionsReprise = {}): ResultatEnveloppe {
  const tailleMax = options.tailleMaxOctets ?? TAILLE_MAX_DEFAUT;
  const journal = new JournalAnomalies(options.anomaliesMax ?? ANOMALIES_MAX_DEFAUT);
  const application = options.application ?? APPLICATION_ATTENDUE;

  /* --- Étape 1 : obtenir un objet, sans jamais laisser filer une exception --- */
  let brut: unknown;
  if (typeof entree === 'string') {
    if (entree.length > tailleMax) {
      return refus(
        'invalide',
        'entree-trop-volumineuse',
        `Fichier de ${entree.length} caractères : au-delà du plafond de reprise (${tailleMax}). ` +
          'Découpez l’export ou relevez le plafond en connaissance de cause.',
      );
    }
    try {
      brut = JSON.parse(entree) as unknown;
    } catch {
      return refus(
        'invalide',
        'json-illisible',
        'Le fichier n’est pas du JSON valide. Un export grc-backup est un fichier .json non modifié.',
      );
    }
  } else if (typeof entree === 'object' && entree !== null) {
    brut = entree;
  } else {
    return refus(
      'invalide',
      'entree-inexploitable',
      'Entrée inexploitable : un texte JSON ou un objet est attendu.',
    );
  }

  if (!estObjet(brut)) {
    return refus(
      'invalide',
      'enveloppe-inconnue',
      'Le fichier ne contient pas un objet JSON : ni enveloppe grc-backup, ni instantané reconnaissable.',
    );
  }

  /* --- Étape 2 : copie assainie et bornée --- */
  const ctx: ContexteCopie = {
    journal,
    noeudsMax: options.noeudsMax ?? NOEUDS_MAX_DEFAUT,
    noeuds: 0,
    budgetDepasse: false,
  };
  const racine = assainir(brut, 0, 'racine', ctx);
  if (ctx.budgetDepasse || !estObjet(racine)) {
    return refus(
      'invalide',
      'entree-trop-complexe',
      `Structure au-delà de ${ctx.noeudsMax} nœuds JSON : reprise refusée pour ne pas saturer la mémoire du serveur.`,
    );
  }

  /* --- Étape 3 : reconnaissance de la forme --- */
  let forme: FormeEnveloppe;
  let charge: ValeurJson | undefined;
  let versionOrigine = 1;
  let creeLe: string | null = null;
  let nomApplication: string | null = null;

  if (lire(racine, 'format') === FORMAT_SAUVEGARDE) {
    forme = 'grc-backup';
    creeLe = texteOuNull(lire(racine, 'createdAt'));
    nomApplication = texteOuNull(lire(racine, 'app'));

    // Le chiffrement se contrôle avant tout le reste : c'est le refus le plus
    // fréquent et le seul auquel l'utilisateur puisse remédier lui-même.
    if (lire(racine, 'encrypted') === true) {
      return refus(
        'chiffre',
        'charge-chiffree',
        'Export chiffré par mot de passe : la reprise serveur ne déchiffre pas. ' +
          'Le coffre du navigateur disparaît avec la version locale (PLAN_SERVEUR §1.9). ' +
          'Rouvrez l’export dans l’application navigateur d’origine et produisez un export en clair, ' +
          'puis transmettez-le par un canal protégé.',
      );
    }

    versionOrigine = lireVersion(racine, 'version', journal);
    if (versionOrigine > VERSION_SCHEMA) {
      return refus(
        'non-pris-en-charge',
        'version-posterieure',
        `Fichier en version de schéma ${versionOrigine}, postérieure à la version ${VERSION_SCHEMA} ` +
          'que ce serveur sait reprendre. Mettez le serveur à jour avant d’importer.',
      );
    }

    charge = lire(racine, 'payload');
    if (!estObjet(charge)) {
      return refus(
        'invalide',
        'charge-absente',
        'Enveloppe grc-backup sans charge utile exploitable : le champ « payload » est absent ou n’est pas un objet.',
      );
    }
  } else if (estObjet(lire(racine, 'data')) && estTableau(lire(lire(racine, 'data') as ObjetJson, 'exigences'))) {
    // Ancien format encapsulé `{ data: {...}, schemaVersion }`.
    forme = 'encapsulee';
    charge = lire(racine, 'data');
    versionOrigine = lireVersion(racine, 'schemaVersion', journal);
    if (versionOrigine > VERSION_SCHEMA) {
      return refus(
        'non-pris-en-charge',
        'version-posterieure',
        `Instantané en version de schéma ${versionOrigine}, postérieure à la version ${VERSION_SCHEMA} reprise par ce serveur.`,
      );
    }
  } else if (estTableau(lire(racine, 'exigences'))) {
    // Très ancien format plat : l'instantané lui-même, réputé v1.
    forme = 'plate';
    charge = racine;
    versionOrigine = 1;
  } else {
    return refus(
      'invalide',
      'enveloppe-inconnue',
      'Fichier non reconnu : ni enveloppe « grc-backup », ni ancien instantané encapsulé, ni instantané plat.',
    );
  }

  if (!estObjet(charge)) {
    return refus('invalide', 'charge-absente', 'Charge utile absente ou illisible.');
  }

  /* --- Étape 4 : la charge ressemble-t-elle à une base Cyber GRC ? --- */
  //  Règle reprise telle quelle de `validatePayload` (datastore.js) : au moins
  //  une collection connue, et **toute** collection présente doit être un
  //  tableau. Un fichier tronqué dont une collection vaut `null` est refusé —
  //  mieux vaut un refus explicite qu'un import partiel dans un outil de preuve.
  let connues = 0;
  for (const nom of COLLECTIONS) {
    const valeur = lire(charge, nom);
    if (valeur === undefined) continue;
    if (!estTableau(valeur)) {
      return refus(
        'invalide',
        'charge-non-reconnue',
        `La collection « ${nom} » n’est pas un tableau (valeur : ${extrait(valeur)}). ` +
          'Le fichier est probablement tronqué ou altéré.',
      );
    }
    connues += 1;
  }
  if (connues === 0) {
    return refus(
      'invalide',
      'charge-non-reconnue',
      'Aucune collection connue dans la charge utile : ce fichier n’est pas une base Cyber GRC.',
    );
  }

  if (nomApplication !== null && nomApplication !== application) {
    journal.signaler(
      'application-inattendue',
      'information',
      `Enveloppe produite par « ${extrait(nomApplication)} » et non « ${application} » : ` +
        'reprise possible, mais l’origine du fichier mérite d’être confirmée.',
    );
  }

  const versionInterne = nombreOuNull(lire(charge, 'schemaVersion'));
  if (versionInterne !== null && versionInterne !== versionOrigine) {
    journal.signaler(
      'version-declaree-incoherente',
      'information',
      `L’enveloppe annonce la version ${versionOrigine} alors que l’instantané porte ${versionInterne} ; ` +
        'la version de l’enveloppe fait foi, comme dans l’application navigateur.',
    );
  }

  const { anomalies } = journal.resultat();
  const enveloppe: EnveloppeLue = {
    forme,
    versionOrigine,
    creeLe,
    application: nomApplication,
    charge,
    anomalies,
  };
  return { statut: 'lue', enveloppe };
}

/** `parsed.version || 1` du frontend, mais en disant quand la valeur est douteuse. */
function lireVersion(source: ObjetJson, champ: string, journal: JournalAnomalies): number {
  const brut = lire(source, champ);
  if (brut === undefined || brut === null) return 1;
  const nombre = Number(brut);
  if (!Number.isFinite(nombre) || nombre < 1) {
    journal.signaler(
      'version-declaree-incoherente',
      'avertissement',
      `Champ « ${champ} » inexploitable (${extrait(brut)}) : le fichier est repris comme une version 1, ` +
        'la chaîne de migration complète lui est appliquée.',
    );
    return 1;
  }
  return Math.floor(nombre);
}

/* =====================================================================
 *  §7 — Construction de la charge typée
 * ===================================================================== */

interface ChargeConstruite {
  readonly charge: ChargeV12;
  /** Collections absentes du fichier — matière première du rapport des paliers. */
  readonly absentes: ReadonlySet<NomCollection>;
}

function construireCharge(brut: ObjetJson, journal: JournalAnomalies): ChargeConstruite {
  const absentes = new Set<NomCollection>();
  const collections = {} as Record<NomCollection, Enregistrement[]>;

  for (const nom of COLLECTIONS) {
    const valeur = lire(brut, nom);
    if (!estTableau(valeur)) {
      absentes.add(nom);
      collections[nom] = [];
      continue;
    }
    const retenus: Enregistrement[] = [];
    for (let i = 0; i < valeur.length; i += 1) {
      const element = valeur[i];
      if (estObjet(element)) {
        retenus.push(element);
        continue;
      }
      // Rien à conserver : un scalaire ou un tableau n'a pas de clé primaire et
      // ne peut devenir aucune ligne. On le dit précisément.
      journal.signaler(
        'enregistrement-illisible',
        'avertissement',
        `${nom}[${i}] : ${extrait(element)} n’est pas un enregistrement, élément écarté.`,
        { collection: nom, champ: `${nom}[${i}]` },
      );
    }
    collections[nom] = retenus;
  }

  // Clés de premier niveau inconnues : conservées telles quelles (le
  // `normalize()` du frontend les gardait), mais rangées à part pour ne pas
  // polluer la charge typée.
  const extras: ObjetJson = {};
  for (const cle of Object.keys(brut)) {
    if (cle === 'schemaVersion' || cle === 'updatedAt') continue;
    if ((COLLECTIONS as readonly string[]).includes(cle)) continue;
    extras[cle] = lire(brut, cle) ?? null;
    journal.signaler(
      'champ-racine-inconnu',
      'information',
      `Clé de premier niveau « ${cle} » inconnue du modèle v12 : conservée telle quelle, non insérée.`,
      { champ: cle },
    );
  }

  const charge: ChargeV12 = {
    ...collections,
    schemaVersion: nombreOuNull(lire(brut, 'schemaVersion')) ?? 1,
    updatedAt: nombreOuNull(lire(brut, 'updatedAt')),
    extras,
  };
  return { charge, absentes };
}

/* =====================================================================
 *  §8 — Transformations élémentaires
 *
 *  Ces quatre fonctions portent tout ce que `normalize()` fait réellement côté
 *  navigateur. Elles sont **idempotentes** : les paliers les appellent pour la
 *  montée en version, la normalisation finale les rappelle toutes, et un
 *  fichier déjà en v12 en ressort inchangé.
 * ===================================================================== */

/**
 * v8 → v9 — Cartographie : chaque actif porte un tableau `dependances[]` de
 * liens typés actif → actif. Rien à convertir, seulement à garantir.
 */
function garantirDependances(charge: ChargeV12): number {
  let corriges = 0;
  for (const actif of charge.actifs) {
    if (!estTableau(lire(actif, 'dependances'))) {
      actif['dependances'] = [];
      corriges += 1;
    }
  }
  return corriges;
}

/**
 * v9 → v10 — Actions MCO : l'ancien modèle « vérification récurrente »
 * `{ etat: "OK"|"KO", date, notes }` devient un **suivi d'action planifiée**
 * `{ statut, avancement, datePrevue, dateReelle, dateCloture, responsable,
 * description, priorite, frequence, commentaire }`.
 *
 * Portage littéral de `normalize()` : `OK` → « Réalisée » à 100 %, `KO` → « En
 * cours », `date` → `dateReelle`, `notes` → `commentaire`, puis purge des trois
 * clés obsolètes une fois recopiées. Aucune donnée n'est perdue.
 */
function convertirMcoActions(charge: ChargeV12): number {
  let convertis = 0;
  for (const action of charge.mco_actions) {
    const avaitAncienModele =
      lire(action, 'statut') === undefined ||
      lire(action, 'etat') !== undefined ||
      lire(action, 'date') !== undefined ||
      lire(action, 'notes') !== undefined;

    if (lire(action, 'statut') === undefined) {
      const etat = lire(action, 'etat');
      if (etat === 'OK') {
        action['statut'] = 'Réalisée';
        if (lire(action, 'avancement') === undefined) action['avancement'] = 100;
      } else if (etat === 'KO') {
        action['statut'] = 'En cours';
      } else {
        action['statut'] = 'À planifier';
      }
    }
    if (lire(action, 'dateReelle') === undefined && lire(action, 'date') !== undefined) {
      action['dateReelle'] = lire(action, 'date') ?? null;
    }
    if (lire(action, 'commentaire') === undefined && lire(action, 'notes') !== undefined) {
      action['commentaire'] = lire(action, 'notes') ?? null;
    }
    if (lire(action, 'avancement') === undefined) {
      action['avancement'] = lire(action, 'statut') === 'Réalisée' ? 100 : 0;
    }
    if (lire(action, 'description') === undefined) action['description'] = '';
    if (lire(action, 'responsable') === undefined) action['responsable'] = '';
    if (lire(action, 'priorite') === undefined) action['priorite'] = 'Moyenne';
    if (lire(action, 'frequence') === undefined) action['frequence'] = 'Ponctuelle';
    if (lire(action, 'datePrevue') === undefined) action['datePrevue'] = '';
    if (lire(action, 'dateReelle') === undefined) action['dateReelle'] = '';
    if (lire(action, 'dateCloture') === undefined) action['dateCloture'] = '';

    delete action['etat'];
    delete action['date'];
    delete action['notes'];

    if (avaitAncienModele) convertis += 1;
  }
  return convertis;
}

/**
 * v11 → v12 — Référentiels : une exigence peut être couverte par **plusieurs**
 * mesures. Le lien unique `evaluation.mesure_id` devient le tableau
 * `mesure_ids[]` (l'ancienne valeur donne un tableau à un élément), puis
 * l'ancienne clé est purgée. C'est ce tableau que la table de liaison
 * `evaluation_mesures` matérialisera (`CONVENTIONS.md` §7).
 */
function convertirMesureIds(charge: ChargeV12): number {
  let convertis = 0;
  for (const evaluation of charge.evaluations) {
    const avaitAncienModele =
      !estTableau(lire(evaluation, 'mesure_ids')) || lire(evaluation, 'mesure_id') !== undefined;
    if (!estTableau(lire(evaluation, 'mesure_ids'))) {
      const unique = lire(evaluation, 'mesure_id');
      evaluation['mesure_ids'] = unique !== undefined && unique !== null && unique !== '' ? [unique] : [];
    }
    delete evaluation['mesure_id'];
    if (avaitAncienModele) convertis += 1;
  }
  return convertis;
}

/** Formule les volumes d'une collection créée vide. */
function libelleCollectionCreee(nom: NomCollection): string {
  return `tableau « ${nom} » absent du fichier, créé vide`;
}

/* =====================================================================
 *  §9 — La chaîne de migration v1 → v12
 *
 *  `migratePayload()` du frontend ne contient **aucun code** : toutes les
 *  montées de version y sont assurées par `normalize()`, et les paliers ne
 *  vivent que dans ses commentaires. Ce portage les rend explicites — un palier
 *  par version, chacun disant ce qu'il rattrape — parce qu'un rapport de
 *  reprise qui annonce « v3 → v12, dix paliers appliqués » vaut mieux qu'un
 *  silence, et parce que c'est ce qui rend chaque palier testable isolément.
 *
 *  La sémantique est strictement celle du frontend : aucun palier n'invente de
 *  transformation, aucun n'en omet.
 * ===================================================================== */

interface ContextePalier {
  readonly charge: ChargeV12;
  readonly absentes: ReadonlySet<NomCollection>;
  /** Collections dont un palier a déjà rendu compte : la normalisation les tait. */
  readonly reclamees: Set<NomCollection>;
}

interface EtapePalier {
  readonly de: number;
  readonly vers: number;
  readonly libelle: string;
  readonly appliquer: (ctx: ContextePalier) => string[];
}

/** Rend compte des collections apparues à ce palier, sans rien transformer. */
function paliersCollections(nouvelles: readonly NomCollection[]) {
  return (ctx: ContextePalier): string[] => {
    const effets: string[] = [];
    for (const nom of nouvelles) {
      ctx.reclamees.add(nom);
      if (ctx.absentes.has(nom)) effets.push(libelleCollectionCreee(nom));
    }
    return effets;
  };
}

const PALIERS: readonly EtapePalier[] = [
  {
    de: 1,
    vers: 2,
    libelle:
      'Audits et revues de direction intégrés à l’instantané unifié (ils vivaient dans les clés ' +
      'localStorage séparées « cyber-audits » et « cyber-revues »).',
    appliquer: paliersCollections(['audits', 'revues']),
  },
  {
    de: 2,
    vers: 3,
    libelle:
      'Chantier Référentiels : apparition des auto-évaluations par exigence de référentiel ' +
      '(« evaluations ») et de l’entité pivot « Mesure de sécurité » (« mesures »).',
    appliquer: paliersCollections(['evaluations', 'mesures']),
  },
  {
    de: 3,
    vers: 4,
    libelle: 'Chantier Incidents : registre des incidents de sécurité (déclarations NIS2 / RGPD).',
    appliquer: paliersCollections(['incidents']),
  },
  {
    de: 4,
    vers: 5,
    libelle: 'Chantier Documentaire : registre des politiques et documents, avec alertes de revue.',
    appliquer: paliersCollections(['documents']),
  },
  {
    de: 5,
    vers: 6,
    libelle: 'Chantier RGPD : registre des traitements de l’article 30.',
    appliquer: paliersCollections(['traitements']),
  },
  {
    de: 6,
    vers: 7,
    libelle:
      'Chantier Correspondances : surcouche utilisateur des correspondances inter-référentiels ' +
      '(le catalogue par défaut reste statique, hors base).',
    appliquer: paliersCollections(['mappings']),
  },
  {
    de: 7,
    vers: 8,
    libelle: 'Chantier Tendances : indicateurs historisés, un point par jour, pour les courbes du tableau de bord.',
    appliquer: paliersCollections(['history']),
  },
  {
    de: 8,
    vers: 9,
    libelle:
      'Chantier Cartographie : chaque actif porte un tableau « dependances[] » de liens typés ' +
      'actif → actif (dep / hosted / flux / backup).',
    appliquer: (ctx) => {
      const corriges = garantirDependances(ctx.charge);
      return corriges > 0 ? [`${corriges} actif(s) doté(s) du tableau « dependances »`] : [];
    },
  },
  {
    de: 9,
    vers: 10,
    libelle:
      'Chantier MCO : l’ancien modèle « vérification récurrente » { etat, date, notes } devient un ' +
      'suivi d’action planifiée { statut, avancement, datePrevue, dateReelle, dateCloture, … }.',
    appliquer: (ctx) => {
      const convertis = convertirMcoActions(ctx.charge);
      return convertis > 0
        ? [
            `${convertis} action(s) MCO converties : OK → « Réalisée » (100 %), KO → « En cours », ` +
              'date → dateReelle, notes → commentaire, clés obsolètes purgées',
          ]
        : [];
    },
  },
  {
    de: 10,
    vers: 11,
    libelle:
      'Chantier Personnel : annuaire des personnes. Les entités continuent de stocker le nom du ' +
      'responsable en texte — aucune transformation de donnée, seulement une source de suggestions.',
    appliquer: paliersCollections(['personnes']),
  },
  {
    de: 11,
    vers: 12,
    libelle:
      'Chantier Référentiels n-n : « evaluation.mesure_id » (lien unique) devient « mesure_ids[] » — ' +
      'une exigence peut être couverte par plusieurs mesures, propagation « au plus défavorable ».',
    appliquer: (ctx) => {
      const convertis = convertirMesureIds(ctx.charge);
      return convertis > 0 ? [`${convertis} évaluation(s) dont « mesure_id » est devenu « mesure_ids[] »`] : [];
    },
  },
];

/* =====================================================================
 *  §10 — Normalisation finale
 * ===================================================================== */

/**
 * Repose **toutes** les garanties de `normalize()`, quels que soient les
 * paliers déjà traversés. Sur un fichier cohérent, elle ne change rien ; sur un
 * fichier qui ment sur sa version — cas très réel d'un export bricolé par la
 * société rachetée — elle rattrape ce que les paliers n'ont pas vu, et le dit.
 */
function normaliser(charge: ChargeV12, absentes: ReadonlySet<NomCollection>, reclamees: ReadonlySet<NomCollection>): string[] {
  const effets: string[] = [];

  for (const nom of COLLECTIONS) {
    if (absentes.has(nom) && !reclamees.has(nom)) effets.push(libelleCollectionCreee(nom));
  }

  const dependances = garantirDependances(charge);
  if (dependances > 0) effets.push(`${dependances} actif(s) doté(s) du tableau « dependances » hors palier`);

  const mco = convertirMcoActions(charge);
  if (mco > 0) effets.push(`${mco} action(s) MCO encore à l’ancien modèle, converties hors palier`);

  const evaluations = convertirMesureIds(charge);
  if (evaluations > 0) effets.push(`${evaluations} évaluation(s) encore en « mesure_id » unique, converties hors palier`);

  charge.schemaVersion = VERSION_SCHEMA;
  return effets;
}

/* =====================================================================
 *  §11 — Contrôles : ce qui alimente le rapport
 *
 *  Aucun de ces contrôles ne modifie la donnée (à l'unique exception d'un
 *  identifiant engendré, sans lequel l'enregistrement serait perdu). Ils
 *  anticipent ce que la base refusera, pour que le rapport d'import du lot L2
 *  soit exploitable ligne par ligne plutôt qu'un mur d'erreurs SQL.
 * ===================================================================== */

const MOTIF_DATE_ISO = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

/** Longueur maximale du domaine `id_metier` (`001_socle.sql`). */
const LONGUEUR_MAX_IDENTIFIANT = 64;

function controler(charge: ChargeV12, journal: JournalAnomalies, options: OptionsReprise): void {
  const horloge = options.horloge ?? Date.now;
  const alea = options.alea ?? Math.random;

  /* --- Passe 1 : identifiants (il faut les connaître tous avant les clés étrangères) --- */
  const index: Record<NomCollection, Set<string>> = {} as Record<NomCollection, Set<string>>;
  for (const nom of COLLECTIONS) index[nom] = new Set<string>();

  for (const nom of COLLECTIONS) {
    const description = DESCRIPTIONS[nom];
    const vus = index[nom];
    for (let i = 0; i < charge[nom].length; i += 1) {
      const enregistrement = charge[nom][i];
      if (enregistrement === undefined) continue;
      const identifiant = resoudreIdentifiant(enregistrement, nom, i, description, journal, horloge, alea);
      if (vus.has(identifiant)) {
        journal.signaler(
          'identifiant-duplique',
          'avertissement',
          `${nom} : l’identifiant « ${identifiant} » apparaît plusieurs fois. ` +
            'La clé primaire refusera le doublon ; l’import doit trancher avant insertion.',
          { collection: nom, identifiant, champ: 'id' },
        );
      }
      vus.add(identifiant);
    }
  }

  /* --- Passe 2 : champs, listes fermées, dates, clés étrangères, clés métier --- */
  for (const nom of COLLECTIONS) {
    const description = DESCRIPTIONS[nom];
    const clesMetierVues = new Set<string>();
    const champsConnus = new Set(description.champs);

    for (const enregistrement of charge[nom]) {
      const identifiant = texteDe(lire(enregistrement, 'id'));

      for (const cle of Object.keys(enregistrement)) {
        if (champsConnus.has(cle)) continue;
        journal.signalerUneFois(
          `champ-inconnu:${nom}:${cle}`,
          'champ-inconnu',
          'information',
          `${nom} : champ « ${cle} » absent du modèle v12 documenté. Conservé, mais sans colonne où l’écrire.`,
          { collection: nom, champ: cle },
        );
      }

      for (const enumeration of description.enumerations) {
        controlerEnumeration(enregistrement, nom, identifiant, enumeration, journal);
      }
      for (const borne of description.bornes) {
        controlerBorne(enregistrement, nom, identifiant, borne, journal);
      }
      for (const champ of description.dates) {
        controlerDate(enregistrement, nom, identifiant, champ, journal);
      }
      for (const reference of description.references) {
        controlerReference(enregistrement, nom, identifiant, reference, index, journal);
      }
      for (const reference of description.referencesMultiples) {
        controlerReferenceMultiple(enregistrement, nom, identifiant, reference, index, journal);
      }

      if (description.cleMetier !== null) {
        const empreinte = description.cleMetier.map((champ) => texteDe(lire(enregistrement, champ))).join(' ');
        if (clesMetierVues.has(empreinte)) {
          journal.signaler(
            'cle-metier-dupliquee',
            'avertissement',
            `${nom} : clé métier (${description.cleMetier.join(', ')}) en double — « ${extrait(
              empreinte.replace(/ /g, ' + '),
            )} ». L’unicité de la base refusera le second.`,
            { collection: nom, identifiant, champ: description.cleMetier.join('+') },
          );
        }
        clesMetierVues.add(empreinte);
      }
    }
  }

  controlerDependances(charge, index.actifs, journal);
  controlerMappings(charge, journal);
}

/**
 * Résout l'identifiant d'un enregistrement, et **c'est le seul endroit du
 * module qui modifie la donnée** : un enregistrement sans identifiant
 * exploitable n'a pas de clé primaire, donc n'existe pas — « sans perte de
 * donnée » impose de lui en donner un plutôt que de l'écarter.
 */
function resoudreIdentifiant(
  enregistrement: Enregistrement,
  nom: NomCollection,
  rang: number,
  description: DescriptionCollection,
  journal: JournalAnomalies,
  horloge: () => number,
  alea: () => number,
): string {
  const brut = lire(enregistrement, 'id');

  if (typeof brut === 'number' && Number.isFinite(brut)) {
    // Un identifiant numérique casserait la jointure avec les références, qui
    // sont du texte. On le convertit et on le dit : le round-trip reste lisible.
    const converti = String(brut);
    enregistrement['id'] = converti;
    journal.signaler(
      'type-inattendu',
      'avertissement',
      `${nom}[${rang}] : identifiant numérique ${brut} converti en texte « ${converti} ».`,
      { collection: nom, identifiant: converti, champ: 'id' },
    );
    return converti;
  }

  if (typeof brut !== 'string' || brut.trim() === '') {
    const engendre = engendrerId(description.prefixe ?? 'ID', horloge, alea);
    enregistrement['id'] = engendre;
    journal.signaler(
      'identifiant-engendre',
      'avertissement',
      `${nom}[${rang}] : enregistrement sans identifiant exploitable (${extrait(brut)}). ` +
        `Identifiant « ${engendre} » engendré — aucune référence existante ne pointe vers lui.`,
      { collection: nom, identifiant: engendre, champ: 'id' },
    );
    return engendre;
  }

  const identifiant = brut;

  if (identifiant.length > LONGUEUR_MAX_IDENTIFIANT) {
    journal.signaler(
      'identifiant-trop-long',
      'avertissement',
      `${nom} : identifiant de ${identifiant.length} caractères (« ${extrait(identifiant, 30)} ») ; ` +
        `le domaine id_metier en admet ${LONGUEUR_MAX_IDENTIFIANT}. Conservé tel quel : le renommer romprait ` +
        'les références qui pointent dessus.',
      { collection: nom, identifiant, champ: 'id' },
    );
  }

  const prefixe = description.prefixe;
  if (prefixe !== null) {
    if (!identifiant.startsWith(`${prefixe}-`)) {
      // Attendu sur les processus BIA d'origine : `CONVENTIONS.md` §2 assume
      // explicitement ce cas, le schéma reste permissif, on ne corrige rien.
      journal.signaler(
        'identifiant-sans-prefixe',
        'information',
        `${nom} : « ${identifiant} » ne porte pas le préfixe « ${prefixe}- » ; conservé tel quel ` +
          '(le domaine id_metier l’admet, le round-trip l’exige).',
        { collection: nom, identifiant, champ: 'id' },
      );
    } else if (/^\d+$/.test(identifiant.slice(prefixe.length + 1))) {
      // Export antérieur au chantier 9 : « PRÉFIXE-<horodatage> », sans suffixe aléatoire.
      journal.signalerUneFois(
        `sans-alea:${nom}`,
        'identifiant-sans-alea',
        'information',
        `${nom} : identifiants sans suffixe aléatoire (ex. « ${identifiant} »), format antérieur au ` +
          'durcissement anti-collision. Conservés tels quels.',
        { collection: nom, identifiant, champ: 'id' },
      );
    }
  }

  return identifiant;
}

function controlerEnumeration(
  enregistrement: Enregistrement,
  nom: NomCollection,
  identifiant: string,
  enumeration: Enumeration,
  journal: JournalAnomalies,
): void {
  const valeur = lire(enregistrement, enumeration.champ);
  if (valeur === undefined || valeur === null) return;
  if (typeof valeur !== 'string') {
    journal.signaler(
      'type-inattendu',
      'avertissement',
      `${nom}.${enumeration.champ} : texte attendu, reçu ${extrait(valeur)}.`,
      { collection: nom, identifiant, champ: enumeration.champ },
    );
    return;
  }
  if (valeur === '' && enumeration.videAdmis) return;
  if (enumeration.valeurs.includes(valeur)) return;
  journal.signaler(
    'valeur-hors-liste',
    'avertissement',
    `${nom}.${enumeration.champ} : « ${extrait(valeur)} » hors de la liste admise ` +
      `(${enumeration.valeurs.join(' · ')}${enumeration.videAdmis ? ' · vide' : ''}). La contrainte de la base la refusera.`,
    { collection: nom, identifiant, champ: enumeration.champ },
  );
}

function controlerBorne(
  enregistrement: Enregistrement,
  nom: NomCollection,
  identifiant: string,
  borne: Borne,
  journal: JournalAnomalies,
): void {
  const valeur = lire(enregistrement, borne.champ);
  if (valeur === undefined || valeur === null || valeur === '') return;
  const nombre = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(nombre)) {
    journal.signaler('nombre-invalide', 'avertissement', `${nom}.${borne.champ} : nombre attendu, reçu ${extrait(valeur)}.`, {
      collection: nom,
      identifiant,
      champ: borne.champ,
    });
    return;
  }
  if (nombre < borne.min || nombre > borne.max) {
    journal.signaler(
      'nombre-invalide',
      'avertissement',
      `${nom}.${borne.champ} : ${nombre} hors des bornes attendues [${borne.min} ; ${borne.max}].`,
      { collection: nom, identifiant, champ: borne.champ },
    );
  }
}

function controlerDate(
  enregistrement: Enregistrement,
  nom: NomCollection,
  identifiant: string,
  champ: string,
  journal: JournalAnomalies,
): void {
  const valeur = lire(enregistrement, champ);
  if (valeur === undefined || valeur === null || valeur === '') return;
  if (typeof valeur !== 'string' || !MOTIF_DATE_ISO.test(valeur) || Number.isNaN(Date.parse(valeur))) {
    journal.signaler(
      'date-invalide',
      'avertissement',
      `${nom}.${champ} : « ${extrait(valeur)} » n’est pas une date ISO (AAAA-MM-JJ) ; le type date la refusera.`,
      { collection: nom, identifiant, champ },
    );
  }
}

function controlerReference(
  enregistrement: Enregistrement,
  nom: NomCollection,
  identifiant: string,
  reference: Reference,
  index: Readonly<Record<NomCollection, Set<string>>>,
  journal: JournalAnomalies,
): void {
  const valeur = lire(enregistrement, reference.champ);
  if (valeur === undefined || valeur === null || valeur === '') return;
  const cible = typeof valeur === 'string' ? valeur : String(valeur);
  if (index[reference.cible].has(cible)) return;
  journal.signaler(
    'cle-etrangere-orpheline',
    'avertissement',
    `${nom}.${reference.champ} : « ${extrait(cible)} » ne correspond à aucun enregistrement de ` +
      `« ${reference.cible} ». La clé étrangère refusera la ligne.`,
    { collection: nom, identifiant, champ: reference.champ },
  );
}

function controlerReferenceMultiple(
  enregistrement: Enregistrement,
  nom: NomCollection,
  identifiant: string,
  reference: Reference,
  index: Readonly<Record<NomCollection, Set<string>>>,
  journal: JournalAnomalies,
): void {
  const valeur = lire(enregistrement, reference.champ);
  if (valeur === undefined || valeur === null) return;
  if (!estTableau(valeur)) {
    journal.signaler(
      'type-inattendu',
      'avertissement',
      `${nom}.${reference.champ} : tableau d’identifiants attendu, reçu ${extrait(valeur)}.`,
      { collection: nom, identifiant, champ: reference.champ },
    );
    return;
  }
  for (let i = 0; i < valeur.length; i += 1) {
    const element = valeur[i];
    if (element === undefined || element === null || element === '') continue;
    const cible = typeof element === 'string' ? element : String(element);
    if (index[reference.cible].has(cible)) continue;
    journal.signaler(
      'cle-etrangere-orpheline',
      'avertissement',
      `${nom}.${reference.champ}[${i}] : « ${extrait(cible)} » ne correspond à aucun enregistrement de ` +
        `« ${reference.cible} ». La table de liaison refusera le lien.`,
      { collection: nom, identifiant, champ: `${reference.champ}[${i}]` },
    );
  }
}

/**
 * `actifs.dependances[]` deviendra la table `actif_dependances`, avec son
 * attribut `type` et son garde-fou « un actif ne dépend pas de lui-même »
 * (`CONVENTIONS.md` §7) : les trois contrôles correspondants sont faits ici.
 */
function controlerDependances(charge: ChargeV12, actifsConnus: ReadonlySet<string>, journal: JournalAnomalies): void {
  for (const actif of charge.actifs) {
    const identifiant = texteDe(lire(actif, 'id'));
    const dependances = lire(actif, 'dependances');
    if (!estTableau(dependances)) continue;
    for (let i = 0; i < dependances.length; i += 1) {
      const lien = dependances[i];
      const chemin = `dependances[${i}]`;
      if (!estObjet(lien)) {
        journal.signaler(
          'type-inattendu',
          'avertissement',
          `actifs.${chemin} : lien de cartographie illisible (${extrait(lien)}).`,
          { collection: 'actifs', identifiant, champ: chemin },
        );
        continue;
      }
      const cible = lire(lien, 'to');
      const type = lire(lien, 'type');
      if (typeof cible !== 'string' || cible === '') {
        journal.signaler(
          'type-inattendu',
          'avertissement',
          `actifs.${chemin}.to : identifiant d’actif attendu, reçu ${extrait(cible)}.`,
          { collection: 'actifs', identifiant, champ: `${chemin}.to` },
        );
      } else if (!actifsConnus.has(cible)) {
        journal.signaler(
          'cle-etrangere-orpheline',
          'avertissement',
          `actifs.${chemin}.to : « ${extrait(cible)} » ne correspond à aucun actif.`,
          { collection: 'actifs', identifiant, champ: `${chemin}.to` },
        );
      } else if (cible === identifiant) {
        journal.signaler(
          'valeur-hors-liste',
          'avertissement',
          `actifs.${chemin}.to : l’actif « ${identifiant} » dépend de lui-même ; ` +
            'la contrainte actif_dependances le refusera.',
          { collection: 'actifs', identifiant, champ: `${chemin}.to` },
        );
      }
      if (typeof type === 'string' && !TYPES_DEPENDANCE.includes(type)) {
        journal.signaler(
          'valeur-hors-liste',
          'avertissement',
          `actifs.${chemin}.type : « ${extrait(type)} » hors de la liste (${TYPES_DEPENDANCE.join(' · ')}).`,
          { collection: 'actifs', identifiant, champ: `${chemin}.type` },
        );
      }
    }
  }
}

/** `mappings.refs` est un objet `{ <ref_id>: [codes…] }` ; on vérifie sa forme, pas son contenu. */
function controlerMappings(charge: ChargeV12, journal: JournalAnomalies): void {
  for (const mapping of charge.mappings) {
    const identifiant = texteDe(lire(mapping, 'id'));
    const refs = lire(mapping, 'refs');
    if (refs === undefined || refs === null) continue;
    if (!estObjet(refs)) {
      journal.signaler('type-inattendu', 'avertissement', `mappings.refs : objet attendu, reçu ${extrait(refs)}.`, {
        collection: 'mappings',
        identifiant,
        champ: 'refs',
      });
      continue;
    }
    for (const refId of Object.keys(refs)) {
      if (estTableau(lire(refs, refId))) continue;
      journal.signaler(
        'type-inattendu',
        'avertissement',
        `mappings.refs.${refId} : tableau de codes attendu, reçu ${extrait(lire(refs, refId))}.`,
        { collection: 'mappings', identifiant, champ: `refs.${refId}` },
      );
    }
  }
}

/* =====================================================================
 *  §12 — Scission des mesures (CONVENTIONS.md §16.2 et §16.3)
 * ===================================================================== */

/**
 * Un export porte **un seul** tableau `mesures`, qui mélange la *définition* du
 * contrôle et son *évaluation*. En contexte de groupe, les deux ne vivent pas
 * au même niveau : la définition appartient au Groupe (c'est elle qui rend les
 * filiales comparables), la mise en œuvre appartient à la filiale.
 *
 * L'identifiant `MESURE-…` **reste celui du fichier** et devient la clé de
 * `mesure_catalogue` : c'est ce qui permet à `actions.mesure_id`,
 * `evaluation_mesures` et `traitement_mesures` de pointer sans table de
 * correspondance. Le `MMO-…` de la mise en œuvre est engendré ici — c'est le
 * seul identifiant du modèle absent de tout export.
 *
 * Ni `filiale_id` ni `version` ne sont posés : le périmètre vient du serveur,
 * jamais du fichier, et la version est du ressort du déclencheur de la base.
 */
export function scinderMesures(charge: ChargeV12, options: OptionsReprise = {}): MesuresScindees {
  const horloge = options.horloge ?? Date.now;
  const alea = options.alea ?? Math.random;

  const catalogue: MesureCatalogue[] = [];
  const miseEnOeuvre: MesureMiseEnOeuvre[] = [];

  for (const mesure of charge.mesures) {
    const id = texteDe(lire(mesure, 'id'));
    if (id === '') continue; // `controler` a déjà engendré tout identifiant manquant.

    catalogue.push({
      id,
      nom: texteDe(lire(mesure, 'nom')),
      description: texteDe(lire(mesure, 'description')),
    });

    miseEnOeuvre.push({
      id: engendrerId('MMO', horloge, alea),
      mesure_id: id,
      statut: texteDe(lire(mesure, 'statut')),
      maturite: nombreOuNull(lire(mesure, 'maturite')) ?? 0,
      responsable: texteDe(lire(mesure, 'responsable')),
      commentaire: texteDe(lire(mesure, 'commentaire')),
      updatedAt: nombreOuNull(lire(mesure, 'updatedAt')),
    });
  }

  return { catalogue, miseEnOeuvre };
}

/* =====================================================================
 *  §13 — Point d'entrée
 * ===================================================================== */

/**
 * Reprend un export `grc-backup` de version quelconque et rend une charge utile
 * **v12 normalisée**, la scission des mesures, et le rapport de reprise.
 *
 * Ne lève jamais : tout refus est un `statut` accompagné d'un `code` et d'un
 * message français directement affichable.
 */
export function reprendreExport(entree: unknown, options: OptionsReprise = {}): ResultatReprise {
  const lecture = lireEnveloppe(entree, options);
  if (lecture.statut !== 'lue') {
    return { statut: lecture.statut, code: lecture.code, message: lecture.message };
  }
  const enveloppe = lecture.enveloppe;

  const journal = new JournalAnomalies(options.anomaliesMax ?? ANOMALIES_MAX_DEFAUT);
  for (const anomalie of enveloppe.anomalies) {
    journal.signaler(anomalie.code, anomalie.gravite, anomalie.message, {
      ...(anomalie.collection !== null ? { collection: anomalie.collection } : {}),
      ...(anomalie.identifiant !== null ? { identifiant: anomalie.identifiant } : {}),
      ...(anomalie.champ !== null ? { champ: anomalie.champ } : {}),
    });
  }

  const { charge, absentes } = construireCharge(enveloppe.charge, journal);

  /* --- La chaîne de migration, palier par palier --- */
  const reclamees = new Set<NomCollection>();
  const ctx: ContextePalier = { charge, absentes, reclamees };
  const paliers: PalierApplique[] = [];
  for (const palier of PALIERS) {
    if (enveloppe.versionOrigine > palier.de) continue;
    const effets = palier.appliquer(ctx);
    paliers.push({ de: palier.de, vers: palier.vers, libelle: palier.libelle, effets });
  }

  /* --- Normalisation finale, puis contrôles --- */
  const normalisation = normaliser(charge, absentes, reclamees);
  if (normalisation.length > 0 && enveloppe.versionOrigine >= VERSION_SCHEMA) {
    journal.signaler(
      'version-declaree-incoherente',
      'avertissement',
      `Le fichier se déclare en version ${enveloppe.versionOrigine}, mais la normalisation a dû rattraper : ` +
        `${normalisation.join(' ; ')}. Son numéro de version n’est pas fiable.`,
    );
  }

  controler(charge, journal, options);

  const mesures = scinderMesures(charge, options);

  const volumes = {} as Record<NomCollection, number>;
  for (const nom of COLLECTIONS) volumes[nom] = charge[nom].length;

  const { anomalies, compteurs } = journal.resultat();
  const rapport: RapportReprise = {
    versionOrigine: enveloppe.versionOrigine,
    versionCible: VERSION_SCHEMA,
    formeEnveloppe: enveloppe.forme,
    creeLe: enveloppe.creeLe,
    application: enveloppe.application,
    paliers,
    normalisation,
    volumes,
    volumesMesures: { catalogue: mesures.catalogue.length, miseEnOeuvre: mesures.miseEnOeuvre.length },
    anomalies,
    compteurs,
  };

  const total = COLLECTIONS.reduce((somme, nom) => somme + volumes[nom], 0);
  const message =
    `Reprise d’un export en version ${enveloppe.versionOrigine} vers la version ${VERSION_SCHEMA} : ` +
    `${paliers.length} palier(s) traversé(s), ${total} enregistrement(s), ` +
    `${compteurs.avertissement} avertissement(s) et ${compteurs.information} information(s).`;

  return { statut: 'reprise', message, charge, mesures, rapport };
}

/* =====================================================================
 *  §14 — Retour au format d'échange
 * ===================================================================== */

/**
 * Reconstitue l'objet `data` du frontend à partir de la charge typée : les
 * collections dans l'ordre de `ARRAY_FIELDS`, puis les clés de premier niveau
 * inconnues rangées dans `extras`. Un aller-retour reprise → enveloppe →
 * reprise rend le même objet, identifiants compris — c'est la garantie du
 * round-trip exact (`CONVENTIONS.md` §2).
 */
export function chargeVersObjet(charge: ChargeV12): ObjetJson {
  const objet: ObjetJson = { schemaVersion: charge.schemaVersion };
  if (charge.updatedAt !== null) objet['updatedAt'] = charge.updatedAt;
  for (const nom of COLLECTIONS) objet[nom] = charge[nom];
  for (const cle of Object.keys(charge.extras)) {
    if (CLES_DANGEREUSES.has(cle)) continue;
    objet[cle] = charge.extras[cle] ?? null;
  }
  return objet;
}

/**
 * Enveloppe `grc-backup` en clair, au format exact de `buildEnvelope()`
 * (`datastore.js`). Sert la seconde moitié du §2.6 du plan : **l'export d'une
 * filiale qui sort du groupe**, remis à l'acquéreur.
 */
export function construireEnveloppe(charge: ChargeV12, options: OptionsReprise = {}): ObjetJson {
  const horloge = options.horloge ?? Date.now;
  return {
    format: FORMAT_SAUVEGARDE,
    version: VERSION_SCHEMA,
    app: options.application ?? APPLICATION_ATTENDUE,
    createdAt: new Date(horloge()).toISOString(),
    encrypted: false,
    payload: chargeVersObjet(charge),
  };
}
