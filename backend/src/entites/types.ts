/**
 * Couche d'accès aux entités — types publics.
 *
 * Ce fichier ne contient **que des types** : il n'est importé que par
 * `import type`, donc entièrement effacé à la compilation comme à l'exécution.
 * Même contrainte, et même raison, que `src/reprise/types.ts` : le banc d'essai
 * exécute directement les `.ts`, et Node n'y résout pas un import de valeur
 * écrit en `./x.js`. Séparer les types du code exécutable est la seule découpe
 * qui tienne dans les deux modes.
 *
 * Vocabulaire :
 *  - **entité** : une des 21 collections du modèle navigateur (`clients`,
 *    `risques`, …). C'est le vocabulaire du frontend, et l'API n'en connaît pas
 *    d'autre.
 *  - **table** : l'objet PostgreSQL correspondant. Une entité peut en occuper
 *    plusieurs (`mesures` en occupe deux, plus les liaisons).
 *  - **liaison** : une table n-n (`CONVENTIONS.md` §7) rendue au frontend comme
 *    un tableau porté par l'enregistrement.
 */

/* =====================================================================
 *  Les 21 entités
 * ===================================================================== */

/**
 * Les collections de `data`, dans l'ordre de `ARRAY_FIELDS`
 * (`cyber-gouvernance_V4/js/core/datastore.js`).
 *
 * ⚠️ **Cet ordre n'est PAS un ordre d'insertion**, et la première rédaction de
 * ce commentaire le prétendait — à tort, relevé par l'agent frontend. Il
 * suffit de le lire : `actions` (3ᵉ) référence `risques` (4ᵉ), `evaluations`
 * (14ᵉ), `mesures` (15ᵉ) et `incidents` (16ᵉ), tous placés après elle. Un lot
 * complet inséré dans cet ordre échouerait sur les clés étrangères.
 *
 * C'est l'ordre d'affichage et de dénombrement, rien de plus. L'ordre
 * d'insertion d'un lot complet est l'affaire du moteur d'import (lot L7), et il
 * devra être **dérivé du graphe des clés étrangères**, pas d'une liste écrite à
 * la main (`CONVENTIONS.md` §19.5).
 */
export type NomEntite =
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

/** Un enregistrement, tel que le frontend le manipule. */
export type Enregistrement = Record<string, unknown>;

/* =====================================================================
 *  Catalogue PostgreSQL découvert
 * ===================================================================== */

/**
 * Familles de types manipulées par la couche d'écriture. Elles ne recopient pas
 * les types SQL : elles disent **comment convertir** une valeur JSON reçue du
 * navigateur. Un type de base inconnu fait échouer la vérification du registre,
 * bruyamment, au démarrage.
 */
export type FamilleType = 'texte' | 'entier' | 'nombre' | 'booleen' | 'date' | 'horodatage' | 'json';

export interface DescriptionColonne {
  readonly nom: string;
  /** Type déclaré, domaine compris (`id_metier`, `text`, `date`…). */
  readonly type: string;
  /** Famille de conversion, résolue à travers les domaines. */
  readonly famille: FamilleType;
  /** `not null` sans valeur par défaut : le client doit la fournir. */
  readonly obligatoire: boolean;
  /** Colonne engendrée (`generated always as`) : jamais nommée en écriture. */
  readonly engendree: boolean;
  /** Porte une valeur par défaut : l'omettre est légitime. */
  readonly avecDefaut: boolean;
  /**
   * Colonne texte dont le schéma **refuse la chaîne vide** — soit que sa liste
   * fermée ne la contienne pas, soit qu'un `check` l'exclue explicitement
   * (`nom <> ''`). Découvert dans `pg_constraint`, jamais recopié.
   *
   * C'est le point de rencontre de deux conventions qui ne se parlaient pas
   * (constat M-8 de la porte S2) : le modèle navigateur code le « non
   * renseigné » par la chaîne vide, le schéma le code par `NULL`.
   */
  readonly videInterdit: boolean;
}

export interface DescriptionTable {
  readonly nom: string;
  readonly colonnes: ReadonlyMap<string, DescriptionColonne>;
  readonly clePrimaire: readonly string[];
  /** Vrai si la table porte une colonne `filiale_id`. */
  readonly cloisonnee: boolean;
  /** Vrai si `filiale_id` est nullable — table **mixte** (`CONVENTIONS.md` §4). */
  readonly filialeNullable: boolean;
  /** Vrai si la table porte le bloc de traçabilité du `CONVENTIONS.md` §3. */
  readonly versionnee: boolean;
}

/**
 * Contrainte d'unicité, telle que le catalogue la donne. Sert à traduire un
 * `23505` sans construire d'oracle : une unicité **portant `filiale_id`** ne
 * peut être heurtée que par une ligne de la filiale de l'appelant, donc
 * lisible par lui ; une unicité qui ne le porte pas — la clé primaire au
 * premier chef — est de portée Groupe, et un doublon peut alors venir d'une
 * ligne invisible (`RAPPORT_S1_TER` §T-8).
 */
export interface DescriptionUnicite {
  readonly nom: string;
  readonly table: string;
  readonly colonnes: readonly string[];
  readonly clePrimaire: boolean;
  readonly porteFiliale: boolean;
}

/**
 * Clé étrangère découverte. Sert à **dériver** l'ordre d'écriture et de purge
 * d'une reprise, au lieu de le récrire à la main — le motif que le
 * `CONVENTIONS.md` §19.5 nomme « une omission qui attend », et qui a produit à
 * lui seul quatre défauts à la porte S1.
 */
export interface DescriptionCleEtrangere {
  readonly nom: string;
  /** Table portant la clé (l'enfant). */
  readonly table: string;
  /** Table visée (le parent). */
  readonly cible: string;
  /**
   * Colonnes de l'enfant qui portent la référence, dans l'ordre de la clé.
   * Sert à savoir **quelle colonne vise quelle entité** — ce qu'une heuristique
   * sur le suffixe « _id » ne donne pas.
   */
  readonly colonnes: readonly string[];
  /** Action à la suppression : `cascade`, `set null`, `restrict`/`no action`. */
  readonly action: 'cascade' | 'set_null' | 'restrict' | 'set_default';
}

/**
 * Contrainte de validation (`check`) et les colonnes qu'elle porte. Sert à
 * traduire un `23514` sans **inventer** un nom de champ : la convention
 * `ck_<table>_<sujet>` du `CONVENTIONS.md` §9 donne un sujet, qui n'est pas
 * toujours une colonne (`ck_actions_rattachement` en est une, et il n'existe
 * aucun champ « rattachement »).
 */
export interface DescriptionValidation {
  readonly nom: string;
  readonly table: string;
  readonly colonnes: readonly string[];
}

export interface Catalogue {
  readonly tables: ReadonlyMap<string, DescriptionTable>;
  /** Contraintes de validation, indexées par nom. */
  readonly validations: ReadonlyMap<string, DescriptionValidation>;
  /** Unicités du schéma, indexées par nom de contrainte. */
  readonly unicites: ReadonlyMap<string, DescriptionUnicite>;
  /** Clés étrangères du schéma. */
  readonly clesEtrangeres: readonly DescriptionCleEtrangere[];
  /** Horodatage de la découverte, pour le journal de démarrage. */
  readonly decouvertLe: Date;
}

/* =====================================================================
 *  Description déclarative d'une entité
 * ===================================================================== */

/**
 * Forme d'une liaison n-n vue du frontend :
 *  - `identifiants` : tableau d'identifiants (`risques.exigences_liees`) ;
 *  - `objets` : tableau d'objets porteurs d'attributs (`actifs.dependances`) ;
 *  - `objet-de-listes` : objet dont chaque clé porte une liste
 *    (`mappings.refs` = `{ref_id: [codes]}`).
 */
export type FormeLiaison = 'identifiants' | 'objets' | 'objet-de-listes';

export interface DescriptionLiaison {
  /** Champ porté par l'enregistrement frontend (`exigences_liees`). */
  readonly champ: string;
  /** Table de liaison (`risque_exigences`). */
  readonly table: string;
  /** Colonne pointant l'entité porteuse (`risque_id`). */
  readonly colonneParent: string;
  /** Colonne pointant l'autre extrémité (`exigence_id`). */
  readonly colonneEnfant: string;
  readonly forme: FormeLiaison;
  /**
   * Pour `objets` : correspondance clé du frontend → colonne, l'extrémité
   * comprise (`{ to: 'actif_cible_id', type: 'type' }`).
   */
  readonly attributs?: Readonly<Record<string, string>>;
  /**
   * Pour `objet-de-listes` : colonne qui reçoit la **clé** de l'objet, la
   * colonne enfant recevant chaque élément de la liste.
   */
  readonly colonneCle?: string;
}

/**
 * Répartition des champs d'une entité scindée en deux tables
 * (`mesures` → `mesure_catalogue` + `mesure_mise_en_oeuvre`, `CONVENTIONS.md`
 * §16.2). Les deux tables portent une colonne `statut` de sens différent : la
 * répartition doit donc être **explicite**, l'identité de nom ne suffit pas.
 */
export interface Repartition {
  readonly table: string;
  /** Champs frontend écrits dans cette table. */
  readonly champs: readonly string[];
  /**
   * Colonnes de la table que l'API n'expose pas, avec la raison. Elles sont
   * déclarées pour que le garde-fou de couverture les tienne pour délibérées
   * au lieu de les signaler.
   */
  readonly colonnesReservees?: Readonly<Record<string, string>>;
}

export interface DescriptionEntite {
  readonly nom: NomEntite;
  /** Table principale. Pour une entité scindée, la table porteuse de l'identité. */
  readonly table: string;
  /** Préfixe d'identifiant du `CONVENTIONS.md` §2 (`RISK`, `ACTIF`…). */
  readonly prefixe: string;
  /**
   * Correspondance champ frontend → colonne, **uniquement quand les deux noms
   * diffèrent**. Tout le reste est découvert dans le catalogue : le registre
   * ne recopie pas ce que PostgreSQL sait déjà.
   */
  readonly alias?: Readonly<Record<string, string>>;
  /** Champs acceptés mais non stockés (`updatedAt`, dérivé de la traçabilité). */
  readonly champsIgnores?: readonly string[];
  readonly liaisons?: readonly DescriptionLiaison[];
  /** Entité scindée : la seconde table et sa part des champs. */
  readonly seconde?: Repartition;
  /** Colonnes de la table principale que l'API n'expose pas, et pourquoi. */
  readonly colonnesReservees?: Readonly<Record<string, string>>;
}

/* =====================================================================
 *  Résultats
 * ===================================================================== */

/** Jeu de données complet d'une filiale, dans la forme attendue par `data`. */
export interface JeuDeDonnees {
  readonly schemaVersion: number;
  readonly collections: Readonly<Record<NomEntite, Enregistrement[]>>;
  /** Nombre de lignes par collection — sert au sondage de rafraîchissement. */
  readonly volumes: Readonly<Record<NomEntite, number>>;
  /** Horodatage de la lecture, côté serveur. Base du prochain sondage. */
  readonly horodatage: string;
  /** Dernière modification connue, tous enregistrements confondus, en ms. */
  readonly updatedAt: number | null;
}

/* =====================================================================
 *  Reprise d'un jeu de données complet
 * ===================================================================== */

/** Mode d'application d'une reprise. */
export type ModeReprise =
  /** Le jeu de données de la filiale est **remplacé** par celui du fichier. */
  | 'remplacer'
  /** Le fichier est **fusionné** : ce qui existe est mis à jour, le reste créé. */
  | 'fusionner';

/** Ce qu'une reprise a fait, collection par collection. */
export interface BilanReprise {
  readonly mode: ModeReprise;
  readonly supprimes: Readonly<Record<string, number>>;
  readonly crees: Readonly<Record<string, number>>;
  readonly misAJour: Readonly<Record<string, number>>;
  readonly liaisons: number;
  /**
   * Champs du fichier sans colonne où les écrire, signalés une fois par
   * collection. Ils ne font pas échouer la reprise — c'est le « rapport
   * d'erreurs ligne par ligne » du `PLAN_SERVEUR` §5, pas un refus en bloc —
   * mais ils sont **dits**, jamais avalés.
   */
  readonly champsIgnores: readonly string[];
  /** Total d'enregistrements lus dans le fichier. */
  readonly lus: number;
  /**
   * ⚠️ **Ce que ce bilan ne dira JAMAIS : les identifiants ré-émis.**
   *
   * Quand l'identifiant d'un fichier est déjà pris dans le domaine global — la
   * clé primaire porte `id` seul, et les unicités contournent la RLS — le
   * serveur en ré-émet un et réécrit les références (voir `creer`, constat
   * N-1). Ni la liste **ni même le nombre** ne sortent d'ici : un compteur à 1
   * sur un fichier d'un seul enregistrement répondrait « celui-là existe
   * ailleurs », ce qui est exactement l'oracle qu'on ferme. Le détail va au
   * journal technique du serveur, où l'exploitant le trouve et où l'appelant
   * ne le voit pas.
   *
   * Première rédaction : le compteur était exposé « pour la transparence ».
   * Mesuré : il rendait la sonde parfaite. La transparence utile est celle qui
   * s'adresse à l'exploitant, pas celle qui répond à l'attaquant.
   */
}

/** Réponse d'un sondage de rafraîchissement. */
export interface Rafraichissement {
  readonly horodatage: string;
  /** Enregistrements créés ou modifiés depuis la date demandée. */
  readonly modifications: Readonly<Partial<Record<NomEntite, Enregistrement[]>>>;
  /**
   * Nombre de lignes par collection. Une différence avec ce que détient le
   * client signale une **suppression** — que ce sondage ne sait pas rendre
   * autrement, faute de pierres tombales (le journal d'audit est le lot L5).
   */
  readonly volumes: Readonly<Record<NomEntite, number>>;
  /** Vrai si le plafond a été atteint : le client doit recharger entièrement. */
  readonly tronque: boolean;
}

/* =====================================================================
 *  Échecs
 * ===================================================================== */

/**
 * Motifs d'échec de la couche d'accès. Ils sont **métier**, pas HTTP : la
 * traduction en code de statut vit dans `src/erreurs/`.
 *
 * Les trois premiers sont ceux dans lesquels se répartit le `UPDATE 0` — c'est
 * la raison d'être de cette énumération, et le piège que la vague 1 lègue au
 * lot L2 (`RAPPORT_S1` §O-2, `RAPPORT_S1_QUATER` §Q-7).
 */
export type MotifEchec =
  /** La ligne existe, elle est écrivable, sa version a changé → `GRC03`. */
  | 'conflit_version'
  /** La ligne n'est pas visible dans le périmètre de LECTURE de la session. */
  | 'introuvable'
  /** La ligne est visible mais non écrivable : autre filiale, ou portée Groupe. */
  | 'refus_perimetre'
  /** L'entrée ne respecte pas le modèle (champ inconnu, type, plafond). */
  | 'donnee_invalide'
  /** Refus d'intégrité de la base, enveloppé pour être traduit. */
  | 'refus_base'
  /** Plafond de volume dépassé (contrôle S13). */
  | 'volume_excessif'
  /** Incohérence interne : défaut de programmation, générique côté client. */
  | 'etat_incoherent';

/**
 * Erreur levée par la couche d'accès. Sa forme est décrite ici pour que
 * `src/erreurs/` puisse la reconnaître **sans importer sa classe** : le module
 * de traduction ne dépend d'aucun autre fichier à l'exécution.
 */
export interface ErreurEntite extends Error {
  readonly nomErreur: 'ErreurEntite';
  readonly motif: MotifEchec;
  /** Message français, déjà destiné à l'utilisateur. */
  readonly message: string;
  /** Détail réservé au journal technique. */
  readonly detailJournal?: string | undefined;
  readonly entite?: string | undefined;
  readonly identifiant?: string | undefined;
  /** Renseignée avec `conflit_version` : la version réellement en base. */
  readonly versionActuelle?: number | undefined;
  /** Erreur PostgreSQL d'origine, quand le motif est `refus_base`. */
  readonly erreurBase?:
    | {
        readonly code: string;
        readonly message: string;
        readonly detail?: string | undefined;
        readonly hint?: string | undefined;
        readonly constraint?: string | undefined;
        readonly column?: string | undefined;
        readonly table?: string | undefined;
        readonly schema?: string | undefined;
      }
    | undefined;
}

/* =====================================================================
 *  Diagnostic d'une écriture sans effet
 * ===================================================================== */

/**
 * Verdict du diagnostic exécuté après un `UPDATE 0` ou un `DELETE 0`.
 *
 * `invisible` couvre **deux** situations que le serveur ne distingue pas, et ne
 * doit pas distinguer : la ligne n'existe nulle part, ou elle existe dans une
 * filiale hors du périmètre de lecture. Les séparer exigerait un oracle
 * d'existence inter-filiales — exactement ce que la porte S1 demande de fermer
 * (`RAPPORT_S1_TER` §T-8). Le motif rendu est donc `introuvable` dans les deux
 * cas, et le journal technique le dit tel quel.
 */
export type Diagnostic =
  | { readonly verdict: 'conflit_version'; readonly versionActuelle: number }
  | { readonly verdict: 'autre_filiale' }
  | { readonly verdict: 'portee_groupe' }
  | { readonly verdict: 'refus_politique' }
  | { readonly verdict: 'invisible' };
