/**
 * Traduction des échecs en réponses d'API — le point unique où une erreur
 * devient quelque chose qu'un utilisateur lit.
 *
 * ── Ce que ce module garantit (contrôle S12 de `docs/PLAN_EXECUTION.md` §4) ──
 *
 * Deux destinataires, deux textes, et jamais l'inverse :
 *
 *  · **Le client** reçoit un message français, actionnable, qui nomme la
 *    *règle* enfreinte et jamais la donnée qu'il n'a pas le droit de voir : ni
 *    nom de table, ni nom de contrainte, ni pile d'appel, ni requête SQL, ni
 *    message brut de PostgreSQL.
 *  · **Le journal technique** reçoit le détail complet (`detailJournal`), qui
 *    ne sort jamais dans une réponse.
 *
 * C'est un report explicite du lot L1 : les six passages de la porte S1 ont
 * constaté que les refus de la base nomment parfois des objets internes, et ont
 * inscrit la traduction au débit de L2 (`RAPPORT_S1` §O-2 et §934,
 * `RAPPORT_S1_TER` §T-8). Ce fichier est cette dette-là, payée.
 *
 * ── Pourquoi ce module n'importe rien d'exécutable ───────────────────────
 *
 * Il ne dépend d'aucun autre fichier du serveur à l'exécution : ses seuls
 * imports sont des `import type`, effacés à la compilation. C'est la contrainte
 * que `src/reprise/types.ts` documente déjà — Node exécute directement les `.ts`
 * du banc d'essai, et un import de valeur en `./x.js` ne s'y résout pas. Un
 * module de traduction d'erreurs doit être éprouvable seul ; il l'est.
 *
 * La couche d'accès aux données (`src/entites/`) ne connaît donc **pas** HTTP :
 * elle lève une `ErreurEntite` porteuse d'un motif métier, et c'est ici, et
 * seulement ici, que le motif devient un code de statut et une phrase.
 */

import type { ErreurEntite, MotifEchec } from '../entites/types.js';

/* =====================================================================
 *  Codes rendus au client
 * ===================================================================== */

/**
 * Codes machine des réponses d'erreur. Stables : le frontend s'y branche.
 * Volontairement grossiers — un code fin serait, lui aussi, un oracle.
 */
export type CodeApi =
  /** Conflit de verrouillage optimiste : `GRC03` du `CONVENTIONS.md` §15. */
  | 'conflit_version'
  /** La ressource n'existe pas *dans le périmètre lisible de la session*. */
  | 'ressource_inconnue'
  /** La ressource est lisible mais l'écriture est refusée (filiale, portée). */
  | 'hors_perimetre'
  /** L'entrée ne respecte pas le modèle : champ inconnu, type, valeur, taille. */
  | 'donnee_invalide'
  /** Refus d'intégrité de la base, traduit sans nommer d'objet interne. */
  | 'contrainte_base'
  /** Le volume demandé dépasse la borne admise (contrôle S13). */
  | 'volume_excessif'
  /**
   * Aucune session : la requête n'est pas authentifiée. Statut **401**.
   *
   * Distinct d'`indisponible` (503), et la distinction n'est pas cosmétique :
   * un 503 ne doit **verrouiller personne**, un 401 compte au rythme des
   * tentatives (`PLAN_SERVEUR` §1.9). Volontairement grossier, comme les
   * autres : il ne dit ni si le compte existe, ni pourquoi la session manque.
   */
  | 'non_authentifie'
  /**
   * La session existe, mais ses droits ne couvrent pas le geste. Statut **403**.
   *
   * Il ne nomme ni le domaine attendu ni le niveau requis : les énumérer
   * dirait à qui n'y a pas droit **ce qu'il faudrait obtenir**, ce qui est le
   * même oracle que celui contre lequel `ressource_inconnue` existe.
   */
  | 'droit_insuffisant'
  /** Le service n'est pas en mesure de répondre pour l'instant. */
  | 'indisponible'
  /** Défaut de programmation ou panne : rien n'en sort, tout part au journal. */
  | 'erreur_interne';

/** Réponse d'erreur, telle qu'elle part sur le réseau. */
export interface CorpsErreur {
  readonly erreur: CodeApi;
  readonly message: string;
  /**
   * Code d'erreur applicatif du `CONVENTIONS.md` §15, quand il s'applique.
   * Présent surtout pour `GRC03`, que l'interface traite spécifiquement
   * (« modifié entre-temps, recharger l'enregistrement »).
   */
  readonly code_grc?: string;
  /** Entité et identifiant concernés, quand les nommer n'apprend rien de neuf. */
  readonly entite?: string;
  readonly identifiant?: string;
  /**
   * Version réellement en base, renvoyée avec `GRC03` **et seulement là** :
   * l'appelant vient de prouver qu'il détient une version de cette ligne, il
   * peut donc la lire. Elle épargne un aller-retour au rechargement.
   */
  readonly version_actuelle?: number;
}

/* =====================================================================
 *  Erreur applicative
 * ===================================================================== */

/**
 * Erreur prête à être rendue. `message` est destiné à l'utilisateur ;
 * `detailJournal` ne sort jamais de la machine.
 */
export class ErreurApplicative extends Error {
  public readonly nomErreur = 'ErreurApplicative';
  public readonly code: CodeApi;
  public readonly statut: number;
  public readonly detailJournal: string | undefined;
  public readonly codeGrc: string | undefined;
  public readonly entite: string | undefined;
  public readonly identifiant: string | undefined;
  public readonly versionActuelle: number | undefined;

  constructor(parametres: {
    code: CodeApi;
    statut: number;
    message: string;
    detailJournal?: string | undefined;
    codeGrc?: string | undefined;
    entite?: string | undefined;
    identifiant?: string | undefined;
    versionActuelle?: number | undefined;
  }) {
    super(parametres.message);
    this.name = 'ErreurApplicative';
    this.code = parametres.code;
    this.statut = parametres.statut;
    this.detailJournal = parametres.detailJournal;
    this.codeGrc = parametres.codeGrc;
    this.entite = parametres.entite;
    this.identifiant = parametres.identifiant;
    this.versionActuelle = parametres.versionActuelle;
  }

  /** Corps de réponse. Ne contient que ce que le client a le droit de savoir. */
  public corps(): CorpsErreur {
    const corps: {
      erreur: CodeApi;
      message: string;
      code_grc?: string;
      entite?: string;
      identifiant?: string;
      version_actuelle?: number;
    } = { erreur: this.code, message: this.message };

    if (this.codeGrc !== undefined) corps.code_grc = this.codeGrc;
    if (this.entite !== undefined) corps.entite = this.entite;
    if (this.identifiant !== undefined) corps.identifiant = this.identifiant;
    if (this.versionActuelle !== undefined) corps.version_actuelle = this.versionActuelle;

    return corps;
  }
}

/** Raccourci : entrée refusée au bord (400). */
export function entreeInvalide(message: string, detailJournal?: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'donnee_invalide',
    statut: 400,
    message,
    detailJournal: detailJournal ?? undefined,
  });
}

/* =====================================================================
 *  Traduction d'une ErreurEntite
 * ===================================================================== */

/**
 * Table motif → (statut, code). Un `switch` exhaustif plutôt qu'un objet :
 * `noImplicitReturns` et l'exhaustivité de l'union font échouer la compilation
 * si un motif est ajouté sans être traduit ici. C'est le seul « garde-fou »
 * que TypeScript sache poser tout seul ; il ne coûte rien, on le prend.
 */
function correspondance(motif: MotifEchec): { statut: number; code: CodeApi } {
  switch (motif) {
    case 'conflit_version':
      return { statut: 409, code: 'conflit_version' };
    case 'introuvable':
      return { statut: 404, code: 'ressource_inconnue' };
    case 'refus_perimetre':
      return { statut: 403, code: 'hors_perimetre' };
    case 'donnee_invalide':
      return { statut: 400, code: 'donnee_invalide' };
    case 'refus_base':
      return { statut: 409, code: 'contrainte_base' };
    case 'volume_excessif':
      return { statut: 413, code: 'volume_excessif' };
    case 'etat_incoherent':
      return { statut: 500, code: 'erreur_interne' };
  }
}

/**
 * Ce que la traduction doit savoir du schéma pour ne pas le laisser fuir.
 *
 * Volontairement passé en **paramètre** plutôt qu'importé : ce module n'a
 * aucune dépendance d'exécution, et c'est ce qui le rend éprouvable seul.
 */
export interface ContexteTraduction {
  /**
   * Noms d'objets internes (tables) qu'aucune réponse ne doit contenir.
   * Découverts dans le catalogue par l'appelant, jamais listés ici.
   */
  readonly nomsInternes?: ReadonlySet<string>;
  /**
   * Unicités du schéma, par nom de contrainte, avec l'indication qu'elles
   * portent ou non `filiale_id`. Sert à ne préciser un doublon que lorsque la
   * ligne en cause est **forcément lisible** par l'appelant.
   */
  readonly unicites?: ReadonlyMap<string, { readonly porteFiliale: boolean }>;
  /**
   * Contraintes de validation et leurs colonnes. Sert à ne **pas inventer** un
   * nom de champ quand le sujet d'un `check` n'en est pas un.
   */
  readonly validations?: ReadonlyMap<
    string,
    { readonly table: string; readonly colonnes: readonly string[] }
  >;
  /**
   * Chemin d'où vient l'échec, quand il change la CAUSE la plus probable.
   *
   * ── T-10 ────────────────────────────────────────────────────────────
   * Deux refus de PostgreSQL — le `42501` d'une politique et le `23503`
   * d'une clé étrangère — ont, sur une saisie ordinaire, deux causes
   * possibles : un élément lié qui n'existe pas, ou un élément lié qui
   * appartient à la filiale voisine. Le message ne tranche pas, et c'est
   * ce qui referme l'oracle.
   *
   * Sur le chemin d'une **reprise**, l'ambiguïté n'existe plus du point de
   * vue de l'utilisateur : il n'a rien saisi, il a fourni un fichier, et
   * dans les deux cas ce fichier désigne un élément qui n'est pas dans ses
   * données. Lui parler de « votre périmètre » et de « la filiale où vous
   * travaillez » l'envoie chercher un problème de droits qu'il n'a pas.
   *
   * Le mot « reprise » ne fait donc PAS dire au message ce qu'il taisait :
   * il énonce la même chose dans les termes du geste réellement accompli.
   */
  readonly origine?: 'reprise';
}

/** Reconnaît une `ErreurEntite` sans importer sa classe (voir l'entête). */
export function estErreurEntite(erreur: unknown): erreur is ErreurEntite {
  return (
    erreur instanceof Error &&
    (erreur as { nomErreur?: unknown }).nomErreur === 'ErreurEntite' &&
    typeof (erreur as { motif?: unknown }).motif === 'string'
  );
}

/**
 * Reconnaît un refus du pool de connexions, sans importer `src/db/pool.ts`
 * (même règle que ci-dessus : ce module n'importe rien d'exécutable).
 */
function estErreurConnexionBase(
  erreur: unknown,
): erreur is Error & { motif: 'saturation' | 'injoignable'; detailJournal: string } {
  return (
    erreur instanceof Error &&
    (erreur as { nomErreur?: unknown }).nomErreur === 'ErreurConnexionBase' &&
    ((erreur as { motif?: unknown }).motif === 'saturation' ||
      (erreur as { motif?: unknown }).motif === 'injoignable')
  );
}

/**
 * Traduit une erreur quelconque en `ErreurApplicative`.
 *
 * L'ordre compte : une erreur déjà traduite passe telle quelle, une
 * `ErreurEntite` est convertie, une erreur PostgreSQL brute est interprétée,
 * et **tout le reste devient une erreur interne générique**. Ce dernier cas est
 * le plus important : c'est lui qui garantit qu'aucun message inattendu ne
 * sort. Une traduction qui laisserait passer l'inconnu ne serait pas une
 * traduction, mais un filtre percé.
 */
export function traduireErreur(
  erreur: unknown,
  contexte: ContexteTraduction = {},
): ErreurApplicative {
  if (erreur instanceof ErreurApplicative) return erreur;

  if (estErreurEntite(erreur)) return traduireErreurEntite(erreur, contexte);

  // ── Q-20 : une saturation se dit, elle ne se déguise pas en panne ────
  // Le pool plein est un état passager et ordinaire — dix reprises
  // simultanées y suffisaient. Rendu en 500 « erreur interne », il était
  // indiscernable d'un défaut du produit ; en 503, le navigateur le reconnaît
  // comme passager (`ErreurApi.estPassagere()`) et propose de réessayer.
  if (estErreurConnexionBase(erreur)) {
    return new ErreurApplicative({
      code: 'indisponible',
      statut: 503,
      message:
        erreur.motif === 'saturation'
          ? 'Le serveur traite actuellement autant de demandes qu’il le peut. ' +
            'Réessayez dans quelques instants : rien n’a été modifié.'
          : 'La base de données est momentanément injoignable. ' +
            'Réessayez dans quelques instants : rien n’a été modifié.',
      detailJournal: `${erreur.motif} : ${erreur.detailJournal}`,
    });
  }

  const postgres = lireErreurPostgres(erreur);
  if (postgres !== null) return traduireErreurPostgres(postgres, contexte);

  // ── m-1 : une 4xx du cadre reste une 4xx ─────────────────────────────
  // Fastify refuse lui-même un corps trop volumineux, un JSON malformé, un
  // type de contenu inconnu : ses erreurs portent un `statusCode`. Les faire
  // tomber dans le cas générique les transformait en **500 avec pile d'appel
  // au niveau `error`** — statut faux pour le client, et journal technique
  // remplissable à volonté par deux requêtes triviales, donc alertes fausses
  // (porte S2, constat m-1). Le gestionnaire de `serveur.ts` honorait déjà ce
  // champ ; celui du greffon ne le faisait pas.
  const statutCadre = lireStatutCadre(erreur);
  if (statutCadre !== null) {
    return new ErreurApplicative({
      code: statutCadre === 413 ? 'volume_excessif' : 'donnee_invalide',
      statut: statutCadre,
      message:
        statutCadre === 413
          ? "La requête dépasse la taille admise par le serveur."
          : "La requête n'a pas pu être lue : format ou type de contenu invalide.",
      detailJournal: `refus du cadre HTTP : ${detailLibre(erreur)}`,
    });
  }

  return new ErreurApplicative({
    code: 'erreur_interne',
    statut: 500,
    message: "Le serveur n'a pas pu traiter la demande. L'incident est journalisé.",
    detailJournal: erreur instanceof Error ? `${erreur.name}: ${erreur.message}` : String(erreur),
  });
}

function traduireErreurEntite(
  erreur: ErreurEntite,
  contexte: ContexteTraduction,
): ErreurApplicative {
  // Un refus de la base arrive enveloppé : c'est lui qui porte le sens, pas
  // l'enveloppe. On le traduit d'abord, puis on lui rattache l'entité visée.
  if (erreur.motif === 'refus_base' && erreur.erreurBase !== undefined) {
    const traduite = traduireErreurPostgres(erreur.erreurBase, contexte);
    return new ErreurApplicative({
      code: traduite.code,
      statut: traduite.statut,
      message: traduite.message,
      detailJournal: joindre(traduite.detailJournal, erreur.detailJournal),
      codeGrc: traduite.codeGrc,
      entite: erreur.entite,
      identifiant: erreur.identifiant,
      // Renseignée sur un doublon de clé métier enrichi : l'enregistrement qui
      // occupe déjà la clé est dans la filiale de l'appelant, donc lisible.
      versionActuelle: erreur.versionActuelle,
    });
  }

  const { statut, code } = correspondance(erreur.motif);

  return new ErreurApplicative({
    code,
    statut,
    message: erreur.message,
    detailJournal: erreur.detailJournal,
    // `GRC03` est le seul code du §15 que l'API émet elle-même : il se définit
    // exactement sur le zéro ligne d'un « update … and version = $2 », et sur
    // rien d'autre. Les deux autres motifs qui produisent aussi ce zéro
    // (ligne absente, écriture refusée par la RLS) portent leur propre code —
    // c'est tout l'objet du diagnostic de `src/entites/index.ts`.
    codeGrc: erreur.motif === 'conflit_version' ? 'GRC03' : undefined,
    entite: erreur.entite,
    identifiant: erreur.identifiant,
    versionActuelle: erreur.versionActuelle,
  });
}

/* =====================================================================
 *  Erreurs PostgreSQL
 * ===================================================================== */

/** Ce que `pg` expose d'une erreur du serveur, et dont ce module se sert. */
export interface ErreurPostgres {
  readonly code: string;
  readonly message: string;
  readonly detail?: string | undefined;
  readonly hint?: string | undefined;
  readonly constraint?: string | undefined;
  readonly column?: string | undefined;
  readonly table?: string | undefined;
  readonly schema?: string | undefined;
}

/**
 * Reconnaît une erreur venue de PostgreSQL. Le critère est le `code`
 * `SQLSTATE` : cinq caractères alphanumériques. `pg` ne définit pas de classe
 * d'erreur propre à interroger par `instanceof` de façon fiable.
 */
export function lireErreurPostgres(erreur: unknown): ErreurPostgres | null {
  if (typeof erreur !== 'object' || erreur === null) return null;
  const candidat = erreur as Record<string, unknown>;
  const code = candidat['code'];
  if (typeof code !== 'string' || !/^[0-9A-Za-z]{5}$/.test(code)) return null;

  return {
    code,
    message: typeof candidat['message'] === 'string' ? candidat['message'] : '',
    detail: typeof candidat['detail'] === 'string' ? candidat['detail'] : undefined,
    hint: typeof candidat['hint'] === 'string' ? candidat['hint'] : undefined,
    constraint: typeof candidat['constraint'] === 'string' ? candidat['constraint'] : undefined,
    column: typeof candidat['column'] === 'string' ? candidat['column'] : undefined,
    table: typeof candidat['table'] === 'string' ? candidat['table'] : undefined,
    schema: typeof candidat['schema'] === 'string' ? candidat['schema'] : undefined,
  };
}

/**
 * Traduit un `SQLSTATE`.
 *
 * ⚠️ **Le message de PostgreSQL n'est jamais recopié**, à une exception près,
 * argumentée sur place : les refus levés par les déclencheurs métier du socle,
 * dont le texte est *écrit pour l'utilisateur* (`CONVENTIONS.md` §15) et se
 * reconnaît à l'absence de nom de contrainte.
 */
export function traduireErreurPostgres(
  erreur: ErreurPostgres,
  contexte: ContexteTraduction = {},
): ErreurApplicative {
  const detailJournal = detailComplet(erreur);

  switch (erreur.code) {
    // ── Codes applicatifs du CONVENTIONS.md §15 ──────────────────────────
    case 'GRC01':
      return new ErreurApplicative({
        code: 'contrainte_base',
        statut: 403,
        message:
          "Le journal d'audit est en ajout seul : une entrée déjà écrite ne peut être ni " +
          'modifiée ni supprimée.',
        detailJournal,
        codeGrc: 'GRC01',
      });

    case 'GRC02':
      return new ErreurApplicative({
        code: 'contrainte_base',
        statut: 409,
        message:
          "Cette étape d'approbation est franchie : la décision est irréversible. Une nouvelle " +
          'version repart du début du circuit.',
        detailJournal,
        codeGrc: 'GRC02',
      });

    case 'GRC04':
      // Le périmètre de session n'a pas été positionné, ou il est incohérent.
      // Ce n'est jamais une faute de l'utilisateur : c'est un défaut de
      // programmation du serveur, et la réponse ne doit rien en dire.
      return new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: "Le serveur n'a pas pu traiter la demande. L'incident est journalisé.",
        detailJournal,
        codeGrc: 'GRC04',
      });

    // ── Intégrité ────────────────────────────────────────────────────────
    case '23505': {
      // ── Unicité : deux cas, et un seul autorise un message précis ──────
      //
      // Les contrôles d'unicité contournent délibérément la RLS
      // (`CONVENTIONS.md` §19.1). D'où la distinction, lue dans le catalogue
      // et jamais devinée :
      //
      //  · l'unicité PORTE `filiale_id` (`uq_history_filiale_date`,
      //    `uq_evaluations_ref_code`, `uq_mesure_mise_en_oeuvre_filiale_mesure`) :
      //    la ligne en cause appartient forcément à la filiale de l'appelant,
      //    donc il peut la lire. Lui dire précisément ce qui fait doublon
      //    n'apprend rien qu'il n'ait le droit de savoir — et lui permet de
      //    recharger plutôt que de retenter en boucle ;
      //  · l'unicité ne le porte pas (la clé primaire au premier chef) : elle
      //    est de portée Groupe et le doublon peut venir d'une ligne
      //    **invisible**. Le message reste alors muet sur ce qui existe
      //    (`RAPPORT_S1_TER` §T-8). Ce chemin ne devrait plus être atteignable
      //    depuis le réseau depuis que le serveur engendre seul les
      //    identifiants (M-3), mais la traduction reste sûre par elle-même.
      const unicite =
        erreur.constraint === undefined ? undefined : contexte.unicites?.get(erreur.constraint);

      if (unicite?.porteFiliale === true) {
        return new ErreurApplicative({
          code: 'contrainte_base',
          statut: 409,
          message:
            'Un enregistrement portant la même clé existe déjà dans votre filiale — la même ' +
            "exigence de référentiel, le même point d'historique du jour, la même mise en " +
            'œuvre de contrôle. Rechargez la liste et complétez celui qui existe.',
          detailJournal,
        });
      }

      return new ErreurApplicative({
        code: 'contrainte_base',
        statut: 409,
        message:
          "Cet enregistrement n'a pas pu être créé : l'une de ses clés est déjà utilisée. " +
          'Rechargez la liste, puis reprenez la saisie.',
        detailJournal,
      });
    }

    case '23503':
      return new ErreurApplicative({
        code: 'contrainte_base',
        statut: 409,
        message:
          contexte.origine === 'reprise'
            ? // T-10 : ici, personne n'a rien « délié ». Le fichier renvoie vers
              // un enregistrement qu'il n'apporte pas et qui n'est pas en base.
              'Reprise refusée : le fichier renvoie vers un enregistrement qu’il ' +
              "n'apporte pas et qui n'est pas dans vos données. Reprenez l'export " +
              'complet plutôt qu’un extrait, ou reprenez d’abord le jeu dont il dépend.'
            : "Opération refusée : l'enregistrement est encore référencé ailleurs, ou il désigne " +
              "un élément qui n'existe pas dans votre périmètre. Déliez-le d'abord, ou " +
              "— s'il s'agit d'un contrôle du socle commun — archivez-le au lieu de le supprimer.",
        detailJournal,
      });

    case '23502':
      return new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message:
          erreur.column !== undefined
            ? `Le champ « ${nettoyerNom(erreur.column)} » est obligatoire.`
            : 'Un champ obligatoire est absent.',
        detailJournal,
      });

    case '23514':
      // Deux familles derrière le même code, et la distinction est nette :
      //  · avec un nom de contrainte -> un « check » du schéma. Son message
      //    PostgreSQL nomme la table et la contrainte : il ne sort pas.
      //  · sans nom de contrainte -> un « raise » d'un déclencheur métier du
      //    socle (f_coherence_mesure_catalogue, f_interdit_changement_portee).
      //    Le CONVENTIONS.md §15 dit explicitement que ce message-là est
      //    « déjà rédigé pour l'utilisateur », et il l'est : il parle de
      //    mesures et de portées, jamais de lignes invisibles.
      if (erreur.constraint === undefined) {
        // ── m-3 : « pas de nom de contrainte » ne veut PAS dire « sûr » ───
        //
        // La règle initiale relayait tel quel tout message sans nom de
        // contrainte, au motif que le `CONVENTIONS.md` §15 tient ces
        // messages-là pour « déjà rédigés pour l'utilisateur ». C'est vrai de
        // `f_coherence_mesure_catalogue()`, qui fond délibérément « inconnue »
        // et « locale à une autre filiale » — exactement ce qu'il faut. Ce
        // l'est **moins** de `f_interdit_changement_portee()`, dont le texte
        // nomme la table (`tg_table_name`) et la portée précédente. Le chemin
        // est aujourd'hui inatteignable (l'API n'écrit jamais `filiale_id`),
        // mais la règle, elle, était fausse dès maintenant — et c'est la règle
        // qui sera relue dans six mois (porte S2, constat m-3).
        //
        // Le filtre ne se fie donc plus à l'origine du message : il regarde ce
        // que le message CONTIENT, et le compare aux noms d'objets que le
        // catalogue a **découverts**. Un message qui nomme une table du schéma
        // ne sort pas. Dégradation sûre : on retombe sur le message générique.
        return new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 409,
          message: messageSurEtRedige(erreur.message, contexte),
          detailJournal,
        });
      }
      return new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message: messageDeContrainte(erreur.constraint, contexte),
        detailJournal,
      });

    case '22P02': // syntaxe de valeur invalide
    case '22007': // format de date invalide
    case '22008': // dépassement de champ date/heure
    case '22001': // chaîne trop longue pour le type
    case '22003': // valeur numérique hors bornes
      return new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message:
          'Une valeur ne correspond pas au type attendu (nombre, date ou texte). Vérifiez la ' +
          'saisie et recommencez.',
        detailJournal,
      });

    // ── Refus de la Row Level Security ───────────────────────────────────
    case '42501':
      // « new row violates row-level security policy » : l'insertion visait
      // une filiale ou une portée que la session n'écrit pas. Le refus est ici
      // BRUYANT (contrairement à l'update et au delete, muets — constat T-6),
      // ce qui en fait le cas facile.
      return new ErreurApplicative({
        code: 'hors_perimetre',
        statut: 403,
        // ── N-5 : la cause la plus fréquente n'est pas un défaut de droit ──
        // Sur une table de LIAISON, la politique exige que les deux extrémités
        // soient visibles : un lien vers un identifiant qui n'existe pas rend
        // donc le même 42501 qu'un lien vers la filiale voisine. Le message ne
        // doit pas trancher — c'est ce qui ferme l'oracle — mais il ne doit pas
        // non plus n'énoncer qu'une des deux causes : parler de droits seuls
        // envoyait l'utilisateur chercher un problème qu'il n'a pas.
        message:
          contexte.origine === 'reprise'
            ? // T-10 : le geste est « j'ai fourni un fichier », pas « j'ai saisi
              // une fiche ». Les deux causes se disent alors d'un seul mot, sans
              // rien révéler de plus : le fichier désigne un absent.
              'Reprise refusée : le fichier désigne un élément qui n’est pas dans vos ' +
              'données — soit qu’il manque, soit qu’il appartienne à une autre filiale. ' +
              'Reprenez un export complet de la filiale où vous travaillez.'
            : "Écriture refusée : cet enregistrement, ou l'un des éléments qu'il désigne, " +
              "n'existe pas dans votre périmètre — ou sort de la filiale où vous travaillez. " +
              'Vérifiez que les éléments liés existent bien, puis rechargez la fiche.',
        detailJournal,
      });

    // ── Concurrence et disponibilité ─────────────────────────────────────
    case '40001': // échec de sérialisation
    case '40P01': // interblocage
    case '55P03': // verrou indisponible (lock_timeout)
      return new ErreurApplicative({
        code: 'indisponible',
        statut: 409,
        message:
          "Un autre enregistrement en cours a empêché l'opération d'aboutir. Recommencez : " +
          'aucune modification partielle n\'a été appliquée.',
        detailJournal,
      });

    case '57014': // requête annulée (statement_timeout)
      return new ErreurApplicative({
        code: 'indisponible',
        statut: 503,
        message: "L'opération a dépassé le délai de garde du serveur et a été annulée.",
        detailJournal,
      });

    case '53300': // trop de connexions
    case '57P03': // base en cours de démarrage
      return new ErreurApplicative({
        code: 'indisponible',
        statut: 503,
        message: 'Le service est momentanément indisponible. Réessayez dans un instant.',
        detailJournal,
      });

    default:
      return new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: "Le serveur n'a pas pu traiter la demande. L'incident est journalisé.",
        detailJournal,
      });
  }
}

/**
 * Message d'un `check` nommé, sans jamais montrer le nom de la contrainte.
 *
 * Le `CONVENTIONS.md` §9 impose de nommer toute contrainte « pour qu'un message
 * d'erreur `ck_actifs_criticite` se traduise en message utilisateur ». C'est ce
 * que fait cette fonction : elle lit la convention `ck_<table>_<sujet>` et n'en
 * garde que le **sujet**, qui est un mot du vocabulaire métier — jamais la
 * table.
 */
function messageDeContrainte(contrainte: string, contexte: ContexteTraduction): string {
  const morceaux = contrainte.split('_');
  const sujet = morceaux.length >= 3 ? morceaux[morceaux.length - 1] : undefined;
  const colonnes = contexte.validations?.get(contrainte)?.colonnes ?? [];

  if (morceaux[0] !== 'ck' || sujet === undefined || !/^[a-z0-9]+$/.test(sujet)) {
    return "Une valeur de l'enregistrement n'est pas admise.";
  }

  // ── Le sujet d'un « check » n'est pas toujours une colonne ────────────
  // La convention `ck_<table>_<sujet>` donne un SUJET, pas nécessairement un
  // champ : `ck_actions_rattachement` en est l'exemple, et il n'existe aucun
  // champ « rattachement ». Annoncer « la valeur du champ rattachement » à un
  // utilisateur, c'est le renvoyer chercher un champ qui n'existe pas — un
  // message faux vaut moins qu'un message vague.
  //
  // On tranche avec ce que le catalogue sait : si le sujet EST une colonne
  // portée par la contrainte, on le nomme ; sinon on dit qu'une règle porte
  // sur PLUSIEURS champs, et on nomme ceux-là — ce sont les noms que
  // l'appelant a lui-même envoyés, et qui figurent déjà dans `/api/modele`.
  const nommees = colonnes.filter((c) => /^[a-z_][a-z0-9_]{0,62}$/.test(c));

  // Le catalogue prime sur la convention de nommage : quand il donne LA
  // colonne, on la nomme elle, et pas le sujet du nom de contrainte — les deux
  // diffèrent souvent (`ck_exigences_statut` porte `statut_conformite`).
  if (nommees.length === 1) {
    return `La valeur du champ « ${String(nommees[0])} » n'est pas admise pour cet enregistrement.`;
  }
  if (nommees.length === 0) {
    return `La valeur du champ « ${sujet} » n'est pas admise pour cet enregistrement.`;
  }
  return (
    "Cet enregistrement enfreint une règle de cohérence entre plusieurs de ses champs " +
    `(${nommees.join(', ')}). Vérifiez qu'ils ne se contredisent pas.`
  );
}

/**
 * Rend le message d'un déclencheur métier **s'il ne nomme aucun objet interne**,
 * et un texte générique sinon. Voir le commentaire du cas `23514`.
 */
function messageSurEtRedige(message: string, contexte: ContexteTraduction): string {
  const generique =
    "Cette opération n'est pas admise : une valeur, ou une combinaison de valeurs, enfreint " +
    'une règle du modèle. Rechargez la fiche et vérifiez votre saisie.';

  const interdits = contexte.nomsInternes;
  if (interdits === undefined || interdits.size === 0) {
    // Sans catalogue, on ne sait pas juger : on ne relaie pas. Le doute
    // profite au cloisonnement, jamais à la lisibilité du message.
    return generique;
  }

  const jetons = message.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? [];
  for (const jeton of jetons) {
    if (interdits.has(jeton)) return generique;
  }
  return message;
}

/** Statut d'une erreur levée par le cadre HTTP lui-même, ou `null`. */
function lireStatutCadre(erreur: unknown): number | null {
  if (typeof erreur !== 'object' || erreur === null) return null;
  const statut = (erreur as { statusCode?: unknown }).statusCode;
  if (typeof statut !== 'number' || !Number.isInteger(statut)) return null;
  return statut >= 400 && statut < 500 ? statut : null;
}

/** Détail libre d'une erreur, pour le seul journal technique. */
function detailLibre(erreur: unknown): string {
  if (erreur instanceof Error) {
    const code = (erreur as { code?: unknown }).code;
    return `${typeof code === 'string' ? `${code} ` : ''}${erreur.name}: ${erreur.message}`;
  }
  return String(erreur);
}

/** Retire tout ce qui n'est pas un nom de champ, avant de le citer au client. */
function nettoyerNom(nom: string): string {
  return /^[a-z_][a-z0-9_]{0,62}$/.test(nom) ? nom : 'inconnu';
}

/** Détail réservé au journal technique. Il ne sort d'aucune réponse. */
function detailComplet(erreur: ErreurPostgres): string {
  const parties = [`sqlstate=${erreur.code}`, erreur.message];
  if (erreur.table !== undefined) parties.push(`table=${erreur.table}`);
  if (erreur.constraint !== undefined) parties.push(`contrainte=${erreur.constraint}`);
  if (erreur.column !== undefined) parties.push(`colonne=${erreur.column}`);
  if (erreur.detail !== undefined) parties.push(`detail=${erreur.detail}`);
  return parties.join(' · ');
}

function joindre(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return `${a} · ${b}`;
}
