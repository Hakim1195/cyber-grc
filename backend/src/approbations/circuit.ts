/**
 * Le vocabulaire du circuit d'approbation, et **la seule chose que ce lot
 * calcule** : l'état d'un circuit, dérivé des lignes déjà écrites.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce fichier ne réécrit AUCUNE garantie de la base
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §33.3 : *« un agent qui réécrirait la règle d'irréversibilité
 * en TypeScript ferait un doublon silencieux de la garantie, et le jour où les
 * deux divergeraient, c'est la version faible qui l'emporterait. »*
 *
 * L'irréversibilité vit donc **entièrement** dans
 * `f_approbations_verrou_decision()` / `trg_approbations_verrou`
 * (`001_socle.sql`, déclencheur armé en `always`) : toute modification ou
 * suppression d'une étape `approuve` ou `refuse` est refusée en `GRC02`, y
 * compris au propriétaire de la table, y compris par un `update` direct au
 * `psql`. Rien ici ne la re-teste **avant** l'écriture : la route tente, et
 * c'est la base qui refuse. `traduireErreurPostgres()` rend déjà ce refus en
 * 409 avec un message écrit pour l'utilisateur.
 *
 * Ce qui est calculé ici, en revanche, **n'est nulle part dans la base** :
 *
 *  · l'**ordre** des étapes d'un circuit (le `check` admet les sept étapes des
 *    trois circuits, sans dire laquelle suit laquelle) ;
 *  · le **rattachement d'une étape à un type d'objet** (`redaction` appartient
 *    au circuit du document *et* à celui de l'audit, jamais à celui du risque) ;
 *  · la **péremption** d'un cycle, qui se lit en comparant `empreinte_objet` au
 *    contenu actuel de l'objet.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  `ordre` = LE NUMÉRO DE CYCLE, et le schéma ne laisse pas le choix
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'unicité de la table est `(filiale_id, objet_type, objet_id, etape, ordre)`,
 * et le commentaire de la table dit : *« une nouvelle version repart du
 * début »*. Les deux ensemble tranchent la lecture de `ordre` :
 *
 *  · si `ordre` était la **position dans le circuit** (1 = rédaction, 2 = revue…),
 *    alors `etape` et `ordre` seraient redondants, et surtout **un second tour
 *    serait impossible** : la deuxième « rédaction » d'un document heurterait
 *    l'unicité, sur une ligne que le déclencheur interdit de modifier. « Repartir
 *    du début » n'aurait aucun chemin d'exécution ;
 *  · si `ordre` est le **numéro de tour**, tout fonctionne : les quatre étapes
 *    d'un premier tour portent `ordre = 1`, celles du tour suivant `ordre = 2`,
 *    et l'unicité empêche exactement ce qu'elle doit empêcher — deux décisions
 *    pour la même étape du même tour.
 *
 * L'index `ix_approbations_objet (objet_type, objet_id, ordre)` va dans le même
 * sens : on lit un objet **par tour**.
 *
 * ⚠️ C'est une **interprétation**, pas une citation : ni le `PLAN_SERVEUR` §3.5
 * ni le `CONVENTIONS.md` §33.3 ne nomment la sémantique de `ordre`. Elle est
 * écrite ici pour être contestable, et le banc la fige
 * (`test/approbations/circuit.test.mjs`).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Un nouveau tour EXIGE une empreinte différente
 * ════════════════════════════════════════════════════════════════════════
 *
 * C'est la règle qui donne son sens à `empreinte_objet`, et elle se lit dans les
 * deux sens :
 *
 *  · approuver puis **modifier** l'objet périme le tour : l'empreinte figée par
 *    la décision ne correspond plus au contenu, et le circuit le dit ;
 *  · un tour clos (complet ou refusé) sur un contenu **inchangé** ne se rejoue
 *    pas : sans cette borne, n'importe qui pourrait empiler les tours sur le même
 *    texte jusqu'à obtenir la décision voulue, et le registre ne prouverait plus
 *    rien.
 *
 * *Une approbation vaut pour une version de l'objet* — §33.3.
 */

/* =====================================================================
 *  1. Le vocabulaire — écrit à la main, et confronté au catalogue
 * =====================================================================
 *
 *  Les trois listes qui suivent recopient des `check` de `001_socle.sql`.
 *  C'est le **bon** outil selon le `CLAUDE.md` §3, parce que l'omission y est
 *  bruyante dans les deux sens : une valeur absente d'ici ne compile pas, une
 *  valeur présente ici mais absente du `check` fait échouer l'insertion en
 *  `23514`. Rien ne réussit en silence.
 *
 *  La règle exige alors de **figer la liste à deux endroits qui la comparent au
 *  réel** : `test/approbations/contrat.test.mjs` lit `pg_catalog` et refuse le
 *  moindre écart, dans les deux sens.
 * ===================================================================== */

/** `ck_approbations_objet` — le rattachement polymorphe de la table. */
export type ObjetApprouvable = 'document' | 'risque' | 'audit';

/** `ck_approbations_etape` — les sept étapes des trois circuits réunies. */
export type EtapeApprobation =
  | 'redaction'
  | 'revue'
  | 'approbation'
  | 'publication'
  | 'proposition'
  | 'acceptation'
  | 'validation';

/** `ck_approbations_statut`. */
export type StatutApprobation = 'en_attente' | 'en_cours' | 'approuve' | 'refuse' | 'annule';

export const OBJETS: readonly ObjetApprouvable[] = Object.freeze(['document', 'risque', 'audit']);

export const ETAPES: readonly EtapeApprobation[] = Object.freeze([
  'redaction',
  'revue',
  'approbation',
  'publication',
  'proposition',
  'acceptation',
  'validation',
]);

export const STATUTS: readonly StatutApprobation[] = Object.freeze([
  'en_attente',
  'en_cours',
  'approuve',
  'refuse',
  'annule',
]);

/**
 * Les deux statuts que le déclencheur rend **irréversibles**.
 *
 * Recopiés de `f_approbations_verrou_decision()`, et confrontés à son texte par
 * le banc : `annule` reste modifiable, parce qu'*« elle n'a rien tranché »*.
 */
export const STATUTS_TRANCHES: readonly StatutApprobation[] = Object.freeze(['approuve', 'refuse']);

/** Une décision : ce qu'une route peut demander d'inscrire. */
export type Decision = 'approuve' | 'refuse';

/* =====================================================================
 *  2. Les trois circuits du `PLAN_SERVEUR` §3.5
 * ===================================================================== */

/**
 * L'ordre des étapes, par type d'objet. **Il n'est nulle part en base** : le
 * `check` admet les sept étapes pour les trois objets, ce qui est correct — une
 * contrainte de table ne sait pas exprimer une séquence.
 */
export const CIRCUITS: Readonly<Record<ObjetApprouvable, readonly EtapeApprobation[]>> =
  Object.freeze({
    /** « Qui a validé cette politique ? » — la question d'audit systématique. */
    document: Object.freeze(['redaction', 'revue', 'approbation', 'publication'] as const),
    /** Acceptation du risque résiduel — exigée nommément par l'ISO 27001. */
    risque: Object.freeze(['proposition', 'acceptation'] as const),
    /** Rapport d'audit interne : fige le rapport **et son auteur**. */
    audit: Object.freeze(['redaction', 'validation'] as const),
  });

/**
 * Correspondance entité (URL, vocabulaire de `DOMAINE_PAR_ENTITE`) → objet
 * (`ck_approbations_objet`).
 *
 * ⚠️ **Les noms d'URL sont ceux des ENTITÉS, pas ceux de `objet_type`**, et ce
 * n'est pas une coquetterie : c'est ce qui permet aux routes de déclarer
 * `domaine: 'selon-entite'`. Le crochet `onRequest` de `src/api/index.ts` lit
 * alors le paramètre `entite`, le cherche dans `DOMAINE_PAR_ENTITE`, et en tire
 * le domaine fonctionnel — `documents`, `risques`, `audits` — sans qu'une seule
 * ligne de correspondance soit écrite ici. Nommer le paramètre autrement
 * obligerait à recopier cette table de domaines, qui est justement celle que le
 * compilateur garde exhaustive.
 */
export const OBJET_PAR_ENTITE: Readonly<Record<string, ObjetApprouvable>> = Object.freeze({
  documents: 'document',
  risques: 'risque',
  audits: 'audit',
});

/** Entités approuvables, pour l'énumération d'un schéma de route. */
export const ENTITES_APPROUVABLES: readonly string[] = Object.freeze(
  Object.keys(OBJET_PAR_ENTITE).sort(),
);

export function estEntiteApprouvable(nom: string): boolean {
  return Object.prototype.hasOwnProperty.call(OBJET_PAR_ENTITE, nom);
}

/* =====================================================================
 *  3. L'état d'un circuit, dérivé
 * ===================================================================== */

/** Une ligne de `approbations`, telle que la route la lit. */
export interface LigneApprobation {
  readonly id: string;
  readonly etape: EtapeApprobation;
  readonly ordre: number;
  readonly statut: StatutApprobation;
  readonly acteurId: string | null;
  readonly acteurLibelle: string | null;
  readonly dateDecision: string | null;
  readonly commentaire: string | null;
  readonly versionObjet: string | null;
  readonly empreinteObjet: string | null;
}

/** Une étape du circuit, telle que l'écran la rend. */
export interface EtapeRendue {
  readonly etape: EtapeApprobation;
  /** Position dans le circuit, à partir de 1 — **pas** la colonne `ordre`. */
  readonly rang: number;
  readonly statut: StatutApprobation;
  readonly acteur: string | null;
  readonly dateDecision: string | null;
  readonly commentaire: string | null;
  readonly versionObjet: string | null;
  /**
   * L'empreinte figée par la décision correspond-elle **au contenu actuel** ?
   *
   * `null` tant qu'aucune décision n'a figé quoi que ce soit ; `false` dit que
   * l'objet a changé depuis, et c'est tout l'objet de la colonne.
   */
  readonly correspond: boolean | null;
}

export type EtatCircuit = 'en_cours' | 'complet' | 'refuse' | 'perime';

export interface Cycle {
  /** La colonne `ordre` : le numéro de tour. */
  readonly ordre: number;
  readonly etat: EtatCircuit;
  readonly etapes: readonly EtapeRendue[];
}

export interface Circuit {
  readonly objet: ObjetApprouvable;
  /** Le tour en cours — celui dont `ordre` est le plus élevé. */
  readonly cycle: number;
  readonly etat: EtatCircuit;
  /** Étape que la prochaine décision doit viser, `null` si aucune n'est recevable. */
  readonly etapeAttendue: EtapeApprobation | null;
  /** Tour de cette prochaine décision : le tour courant, ou le suivant s'il est périmé. */
  readonly cycleAttendu: number | null;
  readonly etapes: readonly EtapeRendue[];
  /** Les tours précédents, du plus récent au plus ancien. Jamais réécrits. */
  readonly historique: readonly Cycle[];
}

function rendre(
  circuit: readonly EtapeApprobation[],
  lignes: readonly LigneApprobation[],
  empreinteCourante: string,
): readonly EtapeRendue[] {
  return circuit.map((etape, index) => {
    const ligne = lignes.find((l) => l.etape === etape);
    if (ligne === undefined) {
      return {
        etape,
        rang: index + 1,
        statut: 'en_attente' as StatutApprobation,
        acteur: null,
        dateDecision: null,
        commentaire: null,
        versionObjet: null,
        correspond: null,
      };
    }
    return {
      etape,
      rang: index + 1,
      statut: ligne.statut,
      acteur: ligne.acteurLibelle,
      dateDecision: ligne.dateDecision,
      commentaire: ligne.commentaire,
      versionObjet: ligne.versionObjet,
      correspond: ligne.empreinteObjet === null ? null : ligne.empreinteObjet === empreinteCourante,
    };
  });
}

function etatDe(etapes: readonly EtapeRendue[]): EtatCircuit {
  // La péremption passe AVANT tout le reste : un tour dont une décision ne
  // correspond plus au contenu ne prouve plus rien, qu'il soit complet ou non.
  if (etapes.some((e) => e.correspond === false)) return 'perime';
  if (etapes.some((e) => e.statut === 'refuse')) return 'refuse';
  if (etapes.every((e) => e.statut === 'approuve')) return 'complet';
  return 'en_cours';
}

/**
 * Dérive l'état complet d'un circuit.
 *
 * ⚠️ **Aucune ligne n'est ignorée.** Une étape écrite hors du circuit de son
 * objet — la reprise d'un export ancien peut en produire — n'est pas silencieuse :
 * elle ressort dans `horsCircuit`. Une ligne écartée sans un mot serait une
 * décision d'approbation qui disparaît de l'écran, ce qui est exactement le
 * genre de silence que ce lot doit exclure.
 */
export function decrireCircuit(
  objet: ObjetApprouvable,
  lignes: readonly LigneApprobation[],
  empreinteCourante: string,
): Circuit & { readonly horsCircuit: readonly LigneApprobation[] } {
  const circuit = CIRCUITS[objet];
  const ordres = lignes.map((l) => l.ordre);
  const cycle = ordres.length === 0 ? 1 : Math.max(...ordres);

  const duCycle = lignes.filter((l) => l.ordre === cycle);
  const etapes = rendre(circuit, duCycle, empreinteCourante);
  const etat = etatDe(etapes);

  const historique: Cycle[] = [];
  for (const ordre of [...new Set(ordres)].filter((o) => o !== cycle).sort((a, b) => b - a)) {
    const duTour = lignes.filter((l) => l.ordre === ordre);
    const rendues = rendre(circuit, duTour, empreinteCourante);
    historique.push({ ordre, etat: etatDe(rendues), etapes: rendues });
  }

  // ── La prochaine décision recevable ────────────────────────────────
  //
  //  · tour en cours    → la première étape non approuvée de ce tour ;
  //  · tour périmé      → la première étape du tour SUIVANT (« repart du début ») ;
  //  · tour clos et à jour → aucune. Rouvrir un tour sur un contenu inchangé
  //    permettrait d'empiler les décisions jusqu'à obtenir celle qu'on veut.
  let etapeAttendue: EtapeApprobation | null = null;
  let cycleAttendu: number | null = null;
  if (etat === 'en_cours') {
    etapeAttendue = etapes.find((e) => e.statut !== 'approuve')?.etape ?? null;
    cycleAttendu = etapeAttendue === null ? null : cycle;
  } else if (etat === 'perime') {
    etapeAttendue = circuit[0] ?? null;
    cycleAttendu = etapeAttendue === null ? null : cycle + 1;
  }

  const connues = new Set<EtapeApprobation>(circuit);
  const horsCircuit = lignes.filter((l) => !connues.has(l.etape));

  return { objet, cycle, etat, etapeAttendue, cycleAttendu, etapes, historique, horsCircuit };
}

/**
 * Phrase qui explique pourquoi une décision n'est pas recevable **maintenant**.
 *
 * Rend `null` quand elle l'est. Elle ne nomme aucun objet interne : c'est un
 * texte d'écran.
 */
export function motifDeRefus(
  circuit: Circuit,
  etapeDemandee: EtapeApprobation,
): string | null {
  if (circuit.etapeAttendue === null) {
    return circuit.etat === 'complet'
      ? 'Le circuit est déjà complet pour cette version. Modifiez l’objet pour ouvrir un ' +
          'nouveau cycle : une approbation vaut pour une version, pas pour un objet.'
      : 'Le circuit a été refusé pour cette version. Modifiez l’objet pour ouvrir un ' +
          'nouveau cycle.';
  }
  if (etapeDemandee !== circuit.etapeAttendue) {
    return (
      `Cette étape n’est pas celle qu’attend le circuit : « ${circuit.etapeAttendue} » doit ` +
      'être franchie d’abord. Rechargez la fiche, un autre utilisateur a peut-être avancé.'
    );
  }
  return null;
}
