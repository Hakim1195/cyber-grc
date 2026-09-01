/**
 * Reprise d'un export `grc-backup` — types publics.
 *
 * Ce fichier ne contient **que des types** : il est importé exclusivement par
 * `import type`, donc entièrement effacé à la compilation comme à l'exécution.
 * C'est une contrainte assumée du lot : `tsconfig.json` compile en `NodeNext`
 * (les imports de valeurs portent alors l'extension `.js`, qui ne se résout pas
 * telle quelle quand Node exécute directement le `.ts` d'un test). Séparer les
 * types du code exécutable est la seule découpe qui tienne dans les deux modes.
 *
 * Vocabulaire (aligné sur `docs/PLAN_SERVEUR.md` §2.6) :
 *  - **enveloppe** : le fichier `{ format, version, encrypted, createdAt, app, payload }` ;
 *  - **charge utile** : l'objet `data` qu'elle transporte (les 21 collections) ;
 *  - **reprise** : lecture de l'enveloppe + montée en version v1 → v12 + normalisation.
 */

/* =====================================================================
 *  Valeurs JSON
 * ===================================================================== */

/**
 * Toute valeur représentable en JSON. Le fichier repris vient d'une société
 * rachetée : rien n'y est présumé sain, donc rien n'est typé plus finement que
 * ça. Le durcissement passe par les contrôles du rapport, pas par le typage.
 */
export type ValeurJson = string | number | boolean | null | ValeurJson[] | ObjetJson;

export interface ObjetJson {
  [cle: string]: ValeurJson | undefined;
}

/** Un enregistrement d'une collection (une ligne du futur `insert`). */
export type Enregistrement = ObjetJson;

/* =====================================================================
 *  Collections de la charge utile
 * ===================================================================== */

/**
 * Les 21 collections du schéma v12, dans l'ordre exact de `ARRAY_FIELDS`
 * (`cyber-gouvernance_V4/js/core/datastore.js`). L'ordre compte : il est celui
 * du rapport de volumes, et il place les entités référencées avant celles qui
 * les référencent, ce dont la couche d'insertion du lot L2 tirera parti.
 */
export type NomCollection =
  | 'clients'
  | 'exigences'
  | 'actions'
  | 'risques'
  | 'actifs'
  | 'processus'
  | 'crise'
  | 'scenarios_pra'
  | 'tests_pra'
  | 'prestataires'
  | 'mco_actions'
  | 'audits'
  | 'revues'
  | 'evaluations'
  | 'mesures'
  | 'incidents'
  | 'documents'
  | 'traitements'
  | 'mappings'
  | 'history'
  | 'personnes';

/**
 * Charge utile normalisée en v12.
 *
 * `extras` recueille les clés de premier niveau inconnues rencontrées dans le
 * fichier. Le `normalize()` du frontend les conservait (`Object.assign`) : les
 * perdre casserait le round-trip d'un export produit par une version dérivée.
 */
export interface ChargeV12 extends Record<NomCollection, Enregistrement[]> {
  schemaVersion: number;
  updatedAt: number | null;
  extras: ObjetJson;
}

/* =====================================================================
 *  Anomalies et rapport de reprise
 * ===================================================================== */

/**
 * Anomalies **non bloquantes** : elles n'arrêtent pas la reprise, elles
 * alimentent le rapport ligne par ligne exigé par `PLAN_SERVEUR` §5.
 */
export type CodeAnomalie =
  /** Enregistrement sans identifiant exploitable : un identifiant canonique a été engendré. */
  | 'identifiant-engendre'
  /** Identifiant ne portant pas le préfixe attendu (processus BIA anciens, notamment). */
  | 'identifiant-sans-prefixe'
  /** Identifiant sans suffixe aléatoire (`ACT-1720000000000`) — export antérieur au chantier 9. */
  | 'identifiant-sans-alea'
  /** Identifiant de plus de 64 caractères : le domaine `id_metier` le refusera. */
  | 'identifiant-trop-long'
  /** Deux enregistrements de la même collection portent le même identifiant. */
  | 'identifiant-duplique'
  /** Clé métier unique violée (`evaluations` sur `(ref_id, code)`, `history` sur `date`). */
  | 'cle-metier-dupliquee'
  /** Clé étrangère implicite pointant dans le vide. */
  | 'cle-etrangere-orpheline'
  /** Valeur hors de la liste fermée attendue (le `check` de la base la refusera). */
  | 'valeur-hors-liste'
  /** Nombre absent, non fini, ou hors bornes. */
  | 'nombre-invalide'
  /** Date non exploitable (le type `date` de la base la refusera). */
  | 'date-invalide'
  /** Champ typé autrement qu'attendu (nombre là où un texte est attendu, etc.). */
  | 'type-inattendu'
  /** Champ absent du modèle documenté : signalé une fois par collection. */
  | 'champ-inconnu'
  /** Clé de premier niveau inconnue dans la charge utile : conservée dans `extras`. */
  | 'champ-racine-inconnu'
  /** Clé de pollution de prototype (`__proto__`, `constructor`, `prototype`) : retirée. */
  | 'cle-dangereuse'
  /** Imbrication au-delà de la profondeur admise : la valeur a été remplacée par `null`. */
  | 'profondeur-excessive'
  /** Élément d'une collection qui n'est pas un objet : inexploitable, écarté. */
  | 'enregistrement-illisible'
  /** Texte démesuré : conservé, mais signalé (indice de fichier fabriqué). */
  | 'texte-tres-long'
  /** L'enveloppe déclare une version de schéma incohérente avec son contenu. */
  | 'version-declaree-incoherente'
  /** Le champ `app` de l'enveloppe ne vaut pas celui de l'application. */
  | 'application-inattendue'
  /** Le plafond d'anomalies est atteint : les suivantes ne sont pas listées. */
  | 'anomalies-tronquees';

/** Deux niveaux seulement : ce qui bloquera une insertion, et ce qui informe. */
export type GraviteAnomalie = 'avertissement' | 'information';

export interface Anomalie {
  readonly code: CodeAnomalie;
  readonly gravite: GraviteAnomalie;
  /** Collection concernée, ou `null` pour une anomalie de premier niveau. */
  readonly collection: NomCollection | null;
  /** Identifiant de l'enregistrement fautif, quand il est connu. */
  readonly identifiant: string | null;
  /** Champ fautif, en notation pointée (`dependances[0].to`). */
  readonly champ: string | null;
  /** Phrase française, directement affichable dans le rapport d'import. */
  readonly message: string;
}

/** Un palier de la chaîne de migration v1 → v12, et ce qu'il a réellement rattrapé. */
export interface PalierApplique {
  readonly de: number;
  readonly vers: number;
  readonly libelle: string;
  /** Effets constatés sur ce fichier précis (vide si le palier n'avait rien à faire). */
  readonly effets: readonly string[];
}

export interface RapportReprise {
  /** Version de schéma détectée dans le fichier (1 si l'enveloppe ne la porte pas). */
  readonly versionOrigine: number;
  /** Toujours 12 : la version cible du portage. */
  readonly versionCible: number;
  /** Forme d'enveloppe reconnue. */
  readonly formeEnveloppe: FormeEnveloppe;
  /** `createdAt` de l'enveloppe, tel quel, ou `null`. */
  readonly creeLe: string | null;
  /** `app` de l'enveloppe, tel quel, ou `null`. */
  readonly application: string | null;
  /** Les paliers traversés, dans l'ordre. */
  readonly paliers: readonly PalierApplique[];
  /** Garanties re-posées par la normalisation finale, après les paliers. */
  readonly normalisation: readonly string[];
  /** Nombre d'enregistrements retenus, par collection. */
  readonly volumes: Readonly<Record<NomCollection, number>>;
  /** Volumes issus de la scission des mesures (`CONVENTIONS.md` §16.2). */
  readonly volumesMesures: {
    readonly catalogue: number;
    readonly miseEnOeuvre: number;
  };
  readonly anomalies: readonly Anomalie[];
  /** Compteur par gravité, pour l'en-tête du rapport d'import. */
  readonly compteurs: Readonly<Record<GraviteAnomalie, number>>;
}

/* =====================================================================
 *  Scission des mesures (CONVENTIONS.md §16.2 et §16.3)
 * ===================================================================== */

/**
 * *Définition* du contrôle — niveau Groupe (`filiale_id` nullable côté base).
 * L'identifiant `MESURE-…` **est celui du fichier**, inchangé : c'est lui que
 * visent `evaluation_mesures`, `actions.mesure_id` et `traitement_mesures`,
 * et c'est ce qui rend le round-trip exact sans table de correspondance.
 */
export interface MesureCatalogue {
  readonly id: string;
  readonly nom: string;
  readonly description: string;
}

/**
 * *Mise en œuvre* du contrôle dans une filiale — niveau Filiale.
 * L'identifiant `MMO-…` est **engendré à la reprise** : c'est le seul du modèle
 * qui n'existe dans aucun export (`CONVENTIONS.md` §2). `filiale_id` n'est pas
 * renseigné ici : le périmètre vient du serveur, jamais du fichier.
 */
export interface MesureMiseEnOeuvre {
  readonly id: string;
  readonly mesure_id: string;
  readonly statut: string;
  readonly maturite: number;
  readonly responsable: string;
  readonly commentaire: string;
  readonly updatedAt: number | null;
}

export interface MesuresScindees {
  readonly catalogue: readonly MesureCatalogue[];
  readonly miseEnOeuvre: readonly MesureMiseEnOeuvre[];
}

/* =====================================================================
 *  Lecture de l'enveloppe
 * ===================================================================== */

/** Les trois formes de fichier que `parseImport` du frontend sait reconnaître. */
export type FormeEnveloppe =
  /** `{ format: "grc-backup", version, encrypted, payload }` — forme courante. */
  | 'grc-backup'
  /** `{ data: { exigences: [] }, schemaVersion }` — ancien format encapsulé. */
  | 'encapsulee'
  /** `{ exigences: [] }` — très ancien format plat, réputé v1. */
  | 'plate';

/**
 * Motif de refus. La distinction demandée par le lot est portée par le
 * `statut` du résultat : `invalide` = ce n'est pas un fichier exploitable,
 * `non-pris-en-charge` = c'en est un, mais ce lot ne sait pas le traiter.
 */
export type CodeRefus =
  /** Le texte n'est pas du JSON. */
  | 'json-illisible'
  /** L'entrée n'est ni un texte ni un objet. */
  | 'entree-inexploitable'
  /** Entrée au-delà du plafond de taille : refusée sans être analysée. */
  | 'entree-trop-volumineuse'
  /** Structure trop vaste (nombre de nœuds) : refusée pour ne pas saturer la mémoire. */
  | 'entree-trop-complexe'
  /** Aucune des trois formes d'enveloppe connues. */
  | 'enveloppe-inconnue'
  /** Enveloppe reconnue, mais sans charge utile exploitable. */
  | 'charge-absente'
  /** Charge utile ne ressemblant pas à une base Cyber GRC (règle de `validatePayload`). */
  | 'charge-non-reconnue'
  /** Enveloppe chiffrée : hors périmètre du lot, le coffre navigateur disparaît. */
  | 'charge-chiffree'
  /** Version de schéma postérieure à la v12 : fichier produit par une version plus récente. */
  | 'version-posterieure';

export interface EnveloppeLue {
  readonly forme: FormeEnveloppe;
  readonly versionOrigine: number;
  readonly creeLe: string | null;
  readonly application: string | null;
  /** Charge utile brute, déjà assainie (clés dangereuses retirées, profondeur bornée). */
  readonly charge: ObjetJson;
  /** Anomalies relevées dès la lecture de l'enveloppe. */
  readonly anomalies: readonly Anomalie[];
}

export type ResultatEnveloppe =
  | { readonly statut: 'lue'; readonly enveloppe: EnveloppeLue }
  | {
      readonly statut: 'invalide' | 'non-pris-en-charge' | 'chiffre';
      readonly code: CodeRefus;
      readonly message: string;
    };

/* =====================================================================
 *  Résultat de la reprise
 * ===================================================================== */

export type ResultatReprise =
  | {
      readonly statut: 'reprise';
      readonly message: string;
      readonly charge: ChargeV12;
      readonly mesures: MesuresScindees;
      readonly rapport: RapportReprise;
    }
  | {
      readonly statut: 'invalide' | 'non-pris-en-charge' | 'chiffre';
      readonly code: CodeRefus;
      readonly message: string;
    };

/* =====================================================================
 *  Pré-analyse lexicale
 * ===================================================================== */

/**
 * Verdict du balayage lexical qui précède `JSON.parse` (constat m-5 de la porte
 * S1). Il ne construit rien : il compte, et il s'arrête au budget.
 */
export interface PreAnalyse {
  /**
   * Nombre de valeurs JSON dénombrées. Le comptage s'arrête au premier
   * dépassement, la valeur est donc plafonnée à `noeudsMax + 1`.
   */
  readonly noeuds: number;
  /** Vrai quand le budget de nœuds est dépassé : l'entrée ne sera pas analysée. */
  readonly budgetDepasse: boolean;
  /**
   * Nombre de caractères réellement parcourus. C'est la mesure de l'arrêt
   * anticipé : sur une entrée hostile, il vaut une fraction de la taille du
   * fichier — et c'est ce qui rend le refus bon marché.
   */
  readonly caracteresLus: number;
}

/* =====================================================================
 *  Options
 * ===================================================================== */

export interface OptionsReprise {
  /**
   * Plafond de taille de l'entrée textuelle, en octets UTF-16 (longueur de la
   * chaîne). Défaut : 64 Mio. Une reprise n'est pas une requête d'API, mais
   * elle reste une entrée hostile potentielle : elle se borne.
   */
  readonly tailleMaxOctets?: number;
  /** Plafond du nombre de nœuds JSON parcourus. Défaut : 2 000 000. */
  readonly noeudsMax?: number;
  /** Plafond du nombre d'anomalies listées. Défaut : 500. */
  readonly anomaliesMax?: number;
  /**
   * Horloge injectable — la date d'une enveloppe reconstruite devient
   * reproductible en test (`construireEnveloppe`).
   *
   * Elle ne sert plus aux identifiants : depuis le constat Q-13, ce module
   * n'en tire plus aucun au hasard, il les DÉRIVE. La reproductibilité des
   * identifiants n'a donc plus à être organisée — elle est acquise.
   */
  readonly horloge?: () => number;
  /** Nom applicatif attendu dans l'enveloppe. Défaut : `cyber-grc-dedienne`. */
  readonly application?: string;
}
