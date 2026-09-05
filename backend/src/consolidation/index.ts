/**
 * Consolidation Groupe — **la vue que le cadrage promet à la direction.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier ferme, et pourquoi il n'existait pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `PLAN_SERVEUR` §7 décrit le lot **L4** comme « Multi-filiales & vision
 * Groupe : cloisonnement RLS, sélecteur de filiale, scission du catalogue de
 * mesures, activation des référentiels, **consolidation direction**, création de
 * filiale ». La vague 4 a livré le sélecteur, et le `README` §8 a marqué le lot
 * livré **en écrivant lui-même la réserve** : *« la vision Groupe consolidée du
 * cadrage n'existe pas : `/api/donnees` est cadré sur la filiale active, donc la
 * Direction voit une filiale à la fois »*.
 *
 * C'était honnête, et c'est resté une réserve écrite. Or *une réserve écrite
 * n'est pas une réserve traitée* — la leçon la plus chère du chantier, payée par
 * six passages de porte qui ont reconduit « Apache n'est pas éprouvé » pendant
 * qu'installer Apache prenait une minute. Cette route est la levée.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Cinq décisions qui ne sont pas des détails
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. Aucune requête ne nomme de filiale.** Pas un paramètre, pas un
 * `where filiale_id = $1`, pas une liste construite depuis le périmètre. Les
 * agrégats lisent les tables **nues** et c'est la RLS qui décide de ce qu'elles
 * voient — `f_filiales_lecture()` rend exactement `perimetre.filiales`, posé par
 * `avecTransaction` depuis un périmètre que le serveur a résolu. La garantie est
 * ainsi tenue **par la forme** : il n'existe aucun endroit de ce fichier où
 * écrire la mauvaise filiale, parce qu'il n'en existe aucun où en écrire une.
 * C'est le raisonnement de `/api/journal`, qui refuse un paramètre `filiale` au
 * motif qu'*« offrir un paramètre donnerait à croire que son absence élargit la
 * vue, alors qu'elle ne l'élargit jamais »*.
 *
 * **2. La route n'exige PAS `perimetre: 'groupe'`.** Elle rend ce que la session
 * peut lire, ni plus ni moins : une filiale pour un RSSI de site, trois pour un
 * périmètre régional, vingt pour la Direction. Exiger la déclaration Groupe
 * n'ajouterait **rien** à la sécurité — la barrière est la RLS, pas une
 * déclaration — et refuserait un périmètre multi-filiales légitime. Le champ
 * `perimetre.groupe` de la réponse dit à l'écran comment se titrer.
 *
 * **3. Un domaine non lisible rend `null`, jamais zéro.** Un profil DPO n'a pas
 * le domaine `risques` : sa consolidation porte `risques: null`. Rendre `0`
 * serait dire « aucun risque dans ce groupe », ce qui est faux, et le dire dans
 * un outil qui sert de preuve en audit. Ce dépôt a payé deux fois la confusion
 * entre *rien à mesurer* et *rien mesuré* — constats Q-108 et Q-116 —, et la
 * distinction est ici portée par le type : `BlocXxx | null`.
 *
 * **4. Le serveur rend des COMPTES, jamais un TAUX dont il ne possède pas la
 * définition.** Le catalogue des référentiels vit dans le **navigateur**
 * (`js/data/referentiels.js`), pas en base : c'est lui qui sait qu'AirCyber se
 * score `"conformite"` — Oui/Non/N-A, sans CMMI, non répondu compté comme Non —
 * là où l'ANSSI se score en maturité et exclut les non évaluées. Un taux calculé
 * ici mélangerait silencieusement deux définitions et **contredirait le tableau
 * de bord**, sans que rien ne rougisse. La réponse porte donc le décompte brut
 * **par référentiel et par statut** ; la couche qui détient le catalogue calcule
 * ce qu'elle sait calculer. Voir le constat Q-147 au registre.
 *
 * **5. Aucun vocabulaire n'est écrit à la main.** Les répartitions se font par
 * `group by` sur la colonne — statut, niveau, gravité, criticité — et non par
 * une salve de `count(*) filter (where statut = '…')`. Une valeur ajoutée à une
 * contrainte `check` apparaît donc toute seule, au lieu de manquer en silence
 * (`CONVENTIONS.md` §19.5 ; `CLAUDE.md` §3 : *une omission qui réussit en
 * silence, c'est que la liste est le mauvais outil*). Ce qui reste explicite —
 * « en retard », « revue échue » — n'est pas un vocabulaire mais un **calcul**,
 * et un calcul s'écrit.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qui n'est PAS fait ici, et pourquoi
 * ════════════════════════════════════════════════════════════════════════
 *
 * - ~~**Aucune trace au journal.**~~ ⚠️ **RETOURNÉ par le constat Q-200 de la
 *   porte S6**, et le motif de l'erreur vaut d'être gardé. Ce paragraphe
 *   affirmait que le §29 réserve `consultation_sensible` à « la lecture du
 *   journal lui-même » et que les lectures ordinaires ne sont pas tracées. La
 *   seconde moitié est vraie ; la première ne l'est pas — `src/pieces/index.ts`
 *   trace un téléchargement de pièce jointe sous cette même action depuis le
 *   lot L6. J'avais écrit une règle que le dépôt contredisait, et j'avais
 *   ensuite écrit un essai qui **verrouillait l'absence de trace** au lieu de
 *   l'éprouver : cinquième occurrence du motif « un essai qui MESURE un défaut
 *   et le CONSACRE comme une propriété désirable ».
 *
 *   Cette route n'est pas une lecture ordinaire : c'est **le seul endroit du
 *   produit où une session lit les vingt filiales d'un coup**. Elle est donc
 *   tracée, dans la transaction qui l'a servie.
 * - **Aucune écriture, aucune migration.** Tout ce qui est agrégé ici existe
 *   depuis les migrations `002` et `003`.
 * - **Aucun contenu d'enregistrement.** La réponse ne porte ni titre, ni nom, ni
 *   responsable : uniquement des nombres, et l'identité des filiales que la
 *   session peut déjà lire par `GET /api/filiales`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { entitesLisibles } from '../api/droits.js';
import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

/* =====================================================================
 *  1. Forme de la réponse
 * ===================================================================== */

/** Répartition découverte : `{ "<valeur>": nombre }`. Jamais une liste figée. */
export type Repartition = Readonly<Record<string, number>>;

/** Décompte d'un référentiel dans une filiale. */
export interface ConformiteReferentiel {
  readonly refId: string;
  /** Décompte par `evaluations.statut`, valeurs telles qu'elles sont en base. */
  readonly parStatut: Repartition;
  /** Nombre d'évaluations portant une maturité renseignée. */
  readonly maturiteRenseignees: number;
  /**
   * Somme des maturités renseignées — **pas une moyenne**. La moyenne se calcule
   * là où l'on sait quels référentiels sont scorés en CMMI (décision 4) ; une
   * somme et un compte se ré-agrègent, une moyenne de moyennes ment.
   */
  readonly maturiteSomme: number;
}

export interface BlocConformite {
  readonly parReferentiel: readonly ConformiteReferentiel[];
  readonly parStatut: Repartition;
}

export interface BlocRisques {
  readonly total: number;
  readonly parNiveau: Repartition;
  /** Somme des scores résiduels des risques cotés ; `null` si aucun ne l'est. */
  readonly expositionResiduelle: number | null;
  readonly cotes: number;
}

export interface BlocActions {
  readonly total: number;
  readonly parStatut: Repartition;
  /** Échéance dépassée et action non terminée. Un calcul, pas un vocabulaire. */
  readonly enRetard: number;
  readonly sansEcheance: number;
}

export interface BlocIncidents {
  readonly total: number;
  readonly parStatut: Repartition;
  readonly parGravite: Repartition;
  /** À déclarer à l'ANSSI **ou** à la CNIL — l'obligation la plus urgente. */
  readonly aDeclarer: number;
}

export interface BlocDocuments {
  readonly total: number;
  readonly parStatut: Repartition;
  readonly revueEchue: number;
}

export interface BlocActifs {
  readonly total: number;
  readonly parCriticite: Repartition;
}

export interface BlocAudits {
  readonly total: number;
  readonly parStatut: Repartition;
}

/** Indicateurs d'une filiale. `null` = domaine hors des droits de la session. */
export interface Indicateurs {
  readonly conformite: BlocConformite | null;
  readonly risques: BlocRisques | null;
  readonly actions: BlocActions | null;
  readonly incidents: BlocIncidents | null;
  readonly documents: BlocDocuments | null;
  readonly actifs: BlocActifs | null;
  readonly audits: BlocAudits | null;
}

export interface FilialeConsolidee {
  readonly id: string;
  readonly code: string;
  readonly raisonSociale: string;
  readonly nomCourt: string | null;
  readonly pays: string | null;
  readonly statut: string;
  /** Vrai pour la filiale sur laquelle la session écrit actuellement. */
  readonly active: boolean;
  readonly indicateurs: Indicateurs;
}

export interface Consolidation {
  readonly horodatage: number;
  readonly perimetre: {
    readonly groupe: boolean;
    readonly filiales: number;
    readonly filialeActive: string | null;
  };
  readonly filiales: readonly FilialeConsolidee[];
  /** Somme des filiales ci-dessus — recalculée, jamais moyennée. */
  readonly total: Indicateurs;
  /**
   * Ce qui est de **portée Groupe** : les lignes à `filiale_id` nul des tables
   * mixtes. Seuls les `documents` en portent aujourd'hui ; les compter dans une
   * filiale les compterait vingt fois.
   */
  readonly porteeGroupe: { readonly documents: BlocDocuments | null };
}

/* =====================================================================
 *  2. Agrégats — aucune requête ne nomme de filiale (décision 1)
 * ===================================================================== */

/** Clé de regroupement des lignes à `filiale_id` nul : la portée Groupe. */
const CLE_GROUPE = ' groupe';

const cle = (valeur: unknown): string => (valeur === null ? CLE_GROUPE : String(valeur));

/**
 * Un `count(*)` de PostgreSQL revient en **chaîne** (le pilote préserve la
 * précision d'un `bigint`). Le convertir ici, une fois, plutôt qu'à chaque site.
 */
const nombre = (valeur: unknown): number => {
  if (valeur === null || valeur === undefined) return 0;
  const n = Number(valeur);
  return Number.isFinite(n) ? n : 0;
};

/** Range `{ valeur, n }` dans `{ "<valeur>": n }`, en agrégeant les doublons. */
const poser = (cible: Record<string, number>, valeur: unknown, n: number): void => {
  const nom = valeur === null || valeur === '' ? 'non renseigné' : String(valeur);
  cible[nom] = (cible[nom] ?? 0) + n;
};

interface LigneRepartition {
  readonly filiale_id: string | null;
  readonly valeur: string | null;
  readonly n: string;
}

/**
 * Les sept répartitions que cette route sait faire. **Rien d'autre n'est
 * interpolable dans le SQL de `repartition()`.**
 *
 * ⚠️ Écrite à la main, et c'est ici le BON outil (`CLAUDE.md` §3, second cas) :
 * une omission fait **échouer la compilation**, bruyamment, et oblige quelqu'un
 * à ajouter le couple table/colonne en connaissance de cause. Une liste dont
 * l'omission ferait *réussir quelque chose en silence* serait le mauvais outil —
 * ce n'est pas le cas ici, `tsc` refuse tout couple absent.
 *
 * ── Ce que cela remplace, et pourquoi ───────────────────────────────────
 *
 * La porte S6 (§5, « à durcir sans que ce soit un constat ») a relevé que
 * `table` et `colonne` étaient interpolés en `string`. L'auditeur a vérifié que
 * ce n'était **pas exploitable** — sept sites d'appel, tous littéraux, fonction
 * non exportée, route qui ne lit ni `query`, ni `params`, ni `body`. Sa remarque
 * porte ailleurs, et elle est juste : *« la sûreté est une propriété des
 * appelants, pas de la fonction »*. Une propriété tenue par les appelants se
 * perd le jour où l'un d'eux change ; une propriété tenue par le TYPE ne se perd
 * pas sans que la compilation le dise.
 */
type SourceRepartition =
  | readonly ['risques', 'niveau']
  | readonly ['actions', 'statut']
  | readonly ['incidents', 'statut']
  | readonly ['incidents', 'gravite']
  | readonly ['documents', 'statut']
  | readonly ['actifs', 'criticite']
  | readonly ['audits', 'statut'];

/**
 * Répartition d'une table par une colonne, groupée par filiale.
 *
 * `table` et `colonne` sont interpolés — un nom d'objet ne se paramètre pas en
 * SQL. Ce qui les rend sûrs n'est plus la discipline des appelants mais le type
 * `SourceRepartition` : seuls sept couples existent, tous écrits dans ce
 * fichier, et `tsc` refuse le huitième. La condition E1 du `CONVENTIONS.md` §22
 * porte sur les **valeurs**, qui restent intégralement paramétrées.
 */
const repartition = async (
  client: PoolClient,
  ...[table, colonne]: SourceRepartition
): Promise<Map<string, Repartition>> => {
  const { rows } = await client.query<LigneRepartition>(
    `select filiale_id, ${colonne}::text as valeur, count(*)::text as n
       from ${table} group by filiale_id, ${colonne}`,
  );
  const par = new Map<string, Record<string, number>>();
  for (const ligne of rows) {
    const k = cle(ligne.filiale_id);
    const bloc = par.get(k) ?? {};
    poser(bloc, ligne.valeur, nombre(ligne.n));
    par.set(k, bloc);
  }
  return par as Map<string, Repartition>;
};

const totalDe = (r: Repartition | undefined): number =>
  r === undefined ? 0 : Object.values(r).reduce((a, b) => a + b, 0);

const vide: Repartition = Object.freeze({});

/* ---- conformité ---------------------------------------------------- */

interface LigneConformite {
  readonly filiale_id: string | null;
  readonly ref_id: string;
  readonly statut: string;
  readonly n: string;
  readonly mat_n: string;
  readonly mat_somme: string;
}

interface CumulReferentiel {
  parStatut: Record<string, number>;
  n: number;
  somme: number;
}

/**
 * ⚠️ **« non applicable » est EXCLU de la maturité**, et c'est un écart corrigé le
 * 04/09/2026. Le serveur cumulait toutes les évaluations cotées en CMMI, y
 * compris celles marquées « non applicable » — que `js/modules/synthese.js`
 * écarte depuis toujours. Les deux écrans auraient donc affiché **deux moyennes
 * différentes pour la même filiale**, et le désaccord ne se serait vu qu'en les
 * ouvrant côte à côte. Trouvé par l'agent qui a écrit l'écran de consolidation,
 * en comparant son calcul à celui de la synthèse.
 *
 * ⚠️ Et une leçon de forme : le commentaire ci-dessus vivait d'abord **dans** la
 * requête SQL, où ses accents graves ont fermé le gabarit de chaîne. Un
 * commentaire n'a rien à faire dans un littéral de gabarit.
 */
const lireConformite = async (client: PoolClient): Promise<Map<string, BlocConformite>> => {
  const { rows } = await client.query<LigneConformite>(
    `select filiale_id, ref_id, statut,
            count(*)::text                  as n,
            count(maturite) filter (where statut <> 'non applicable')::text as mat_n,
            coalesce(sum(maturite) filter (where statut <> 'non applicable'), 0)::text
              as mat_somme
       from evaluations
      group by filiale_id, ref_id, statut`,
  );

  const par = new Map<
    string,
    { refs: Map<string, CumulReferentiel>; parStatut: Record<string, number> }
  >();

  for (const ligne of rows) {
    const k = cle(ligne.filiale_id);
    const filiale = par.get(k) ?? { refs: new Map<string, CumulReferentiel>(), parStatut: {} };
    const ref: CumulReferentiel = filiale.refs.get(ligne.ref_id) ?? {
      parStatut: {},
      n: 0,
      somme: 0,
    };
    const n = nombre(ligne.n);
    poser(ref.parStatut, ligne.statut, n);
    poser(filiale.parStatut, ligne.statut, n);
    ref.n += nombre(ligne.mat_n);
    ref.somme += nombre(ligne.mat_somme);
    filiale.refs.set(ligne.ref_id, ref);
    par.set(k, filiale);
  }

  const rendu = new Map<string, BlocConformite>();
  for (const [k, filiale] of par) {
    const parReferentiel = [...filiale.refs.entries()]
      .map(([refId, r]) => ({
        refId,
        parStatut: r.parStatut as Repartition,
        maturiteRenseignees: r.n,
        maturiteSomme: r.somme,
      }))
      .sort((a, b) => a.refId.localeCompare(b.refId));
    rendu.set(k, { parReferentiel, parStatut: filiale.parStatut as Repartition });
  }
  return rendu;
};

/* ---- risques ------------------------------------------------------- */

interface LigneRisques {
  readonly filiale_id: string | null;
  readonly cotes: string;
  readonly exposition: string | null;
}

const lireRisques = async (client: PoolClient): Promise<Map<string, BlocRisques>> => {
  const parNiveau = await repartition(client, 'risques', 'niveau');
  const { rows } = await client.query<LigneRisques>(
    `select filiale_id,
            count(score_residuel)::text as cotes,
            sum(score_residuel)::text   as exposition
       from risques group by filiale_id`,
  );
  const rendu = new Map<string, BlocRisques>();
  for (const ligne of rows) {
    const k = cle(ligne.filiale_id);
    const r = parNiveau.get(k) ?? vide;
    rendu.set(k, {
      total: totalDe(r),
      parNiveau: r,
      expositionResiduelle: ligne.exposition === null ? null : nombre(ligne.exposition),
      cotes: nombre(ligne.cotes),
    });
  }
  return rendu;
};

/* ---- actions ------------------------------------------------------- */

interface LigneActions {
  readonly filiale_id: string | null;
  readonly en_retard: string;
  readonly sans_echeance: string;
}

const lireActions = async (client: PoolClient): Promise<Map<string, BlocActions>> => {
  const parStatut = await repartition(client, 'actions', 'statut');
  // « En retard » est un CALCUL, pas un vocabulaire : échéance dépassée et
  // action non terminée. `current_date` est celui du serveur de base — la même
  // horloge que celle qui horodate les écritures.
  const { rows } = await client.query<LigneActions>(
    `select filiale_id,
            count(*) filter (
              where statut <> 'terminée' and echeance is not null and echeance < current_date
            )::text as en_retard,
            count(*) filter (where echeance is null)::text as sans_echeance
       from actions group by filiale_id`,
  );
  const rendu = new Map<string, BlocActions>();
  for (const ligne of rows) {
    const k = cle(ligne.filiale_id);
    const r = parStatut.get(k) ?? vide;
    rendu.set(k, {
      total: totalDe(r),
      parStatut: r,
      enRetard: nombre(ligne.en_retard),
      sansEcheance: nombre(ligne.sans_echeance),
    });
  }
  return rendu;
};

/* ---- incidents ----------------------------------------------------- */

interface LigneIncidents {
  readonly filiale_id: string | null;
  readonly a_declarer: string;
}

const lireIncidents = async (client: PoolClient): Promise<Map<string, BlocIncidents>> => {
  const parStatut = await repartition(client, 'incidents', 'statut');
  const parGravite = await repartition(client, 'incidents', 'gravite');
  const { rows } = await client.query<LigneIncidents>(
    `select filiale_id,
            count(*) filter (
              where declaration_anssi = 'à déclarer' or declaration_cnil = 'à déclarer'
            )::text as a_declarer
       from incidents group by filiale_id`,
  );
  const rendu = new Map<string, BlocIncidents>();
  for (const ligne of rows) {
    const k = cle(ligne.filiale_id);
    const r = parStatut.get(k) ?? vide;
    rendu.set(k, {
      total: totalDe(r),
      parStatut: r,
      parGravite: parGravite.get(k) ?? vide,
      aDeclarer: nombre(ligne.a_declarer),
    });
  }
  return rendu;
};

/* ---- documents ----------------------------------------------------- */

interface LigneDocuments {
  readonly filiale_id: string | null;
  readonly revue_echue: string;
}

const lireDocuments = async (client: PoolClient): Promise<Map<string, BlocDocuments>> => {
  const parStatut = await repartition(client, 'documents', 'statut');
  const { rows } = await client.query<LigneDocuments>(
    `select filiale_id,
            count(*) filter (where date_revue is not null and date_revue < current_date)::text
              as revue_echue
       from documents group by filiale_id`,
  );
  const rendu = new Map<string, BlocDocuments>();
  for (const ligne of rows) {
    const k = cle(ligne.filiale_id);
    const r = parStatut.get(k) ?? vide;
    rendu.set(k, { total: totalDe(r), parStatut: r, revueEchue: nombre(ligne.revue_echue) });
  }
  return rendu;
};

/* =====================================================================
 *  3. Assemblage
 * ===================================================================== */

/** Somme deux répartitions sans en supposer les clés. */
const sommer = (a: Repartition, b: Repartition): Repartition => {
  const cumul: Record<string, number> = { ...a };
  for (const [k, n] of Object.entries(b)) cumul[k] = (cumul[k] ?? 0) + n;
  return cumul;
};

/**
 * Cumule les indicateurs de plusieurs filiales.
 *
 * ⚠️ Un bloc `null` chez **toutes** les filiales reste `null` dans le total : un
 * domaine que la session ne peut pas lire ne devient pas lisible en le sommant.
 */
const cumuler = (parts: readonly Indicateurs[]): Indicateurs => {
  const conformites = parts.map((p) => p.conformite).filter((b): b is BlocConformite => b !== null);
  const risques = parts.map((p) => p.risques).filter((b): b is BlocRisques => b !== null);
  const actions = parts.map((p) => p.actions).filter((b): b is BlocActions => b !== null);
  const incidents = parts.map((p) => p.incidents).filter((b): b is BlocIncidents => b !== null);
  const documents = parts.map((p) => p.documents).filter((b): b is BlocDocuments => b !== null);
  const actifs = parts.map((p) => p.actifs).filter((b): b is BlocActifs => b !== null);
  const audits = parts.map((p) => p.audits).filter((b): b is BlocAudits => b !== null);

  const refs = new Map<string, { parStatut: Repartition; n: number; somme: number }>();
  for (const bloc of conformites) {
    for (const r of bloc.parReferentiel) {
      const cumul = refs.get(r.refId) ?? { parStatut: vide, n: 0, somme: 0 };
      refs.set(r.refId, {
        parStatut: sommer(cumul.parStatut, r.parStatut),
        n: cumul.n + r.maturiteRenseignees,
        somme: cumul.somme + r.maturiteSomme,
      });
    }
  }

  const exposees = risques.filter((b) => b.expositionResiduelle !== null);

  return {
    conformite:
      conformites.length === 0
        ? null
        : {
            parReferentiel: [...refs.entries()]
              .map(([refId, r]) => ({
                refId,
                parStatut: r.parStatut,
                maturiteRenseignees: r.n,
                maturiteSomme: r.somme,
              }))
              .sort((a, b) => a.refId.localeCompare(b.refId)),
            parStatut: conformites.reduce<Repartition>((a, b) => sommer(a, b.parStatut), vide),
          },
    risques:
      risques.length === 0
        ? null
        : {
            total: risques.reduce((a, b) => a + b.total, 0),
            parNiveau: risques.reduce<Repartition>((a, b) => sommer(a, b.parNiveau), vide),
            expositionResiduelle:
              exposees.length === 0
                ? null
                : exposees.reduce((a, b) => a + (b.expositionResiduelle ?? 0), 0),
            cotes: risques.reduce((a, b) => a + b.cotes, 0),
          },
    actions:
      actions.length === 0
        ? null
        : {
            total: actions.reduce((a, b) => a + b.total, 0),
            parStatut: actions.reduce<Repartition>((a, b) => sommer(a, b.parStatut), vide),
            enRetard: actions.reduce((a, b) => a + b.enRetard, 0),
            sansEcheance: actions.reduce((a, b) => a + b.sansEcheance, 0),
          },
    incidents:
      incidents.length === 0
        ? null
        : {
            total: incidents.reduce((a, b) => a + b.total, 0),
            parStatut: incidents.reduce<Repartition>((a, b) => sommer(a, b.parStatut), vide),
            parGravite: incidents.reduce<Repartition>((a, b) => sommer(a, b.parGravite), vide),
            aDeclarer: incidents.reduce((a, b) => a + b.aDeclarer, 0),
          },
    documents:
      documents.length === 0
        ? null
        : {
            total: documents.reduce((a, b) => a + b.total, 0),
            parStatut: documents.reduce<Repartition>((a, b) => sommer(a, b.parStatut), vide),
            revueEchue: documents.reduce((a, b) => a + b.revueEchue, 0),
          },
    actifs:
      actifs.length === 0
        ? null
        : {
            total: actifs.reduce((a, b) => a + b.total, 0),
            parCriticite: actifs.reduce<Repartition>((a, b) => sommer(a, b.parCriticite), vide),
          },
    audits:
      audits.length === 0
        ? null
        : {
            total: audits.reduce((a, b) => a + b.total, 0),
            parStatut: audits.reduce<Repartition>((a, b) => sommer(a, b.parStatut), vide),
          },
  };
};

interface LigneFiliale {
  readonly id: string;
  readonly code: string;
  readonly raison_sociale: string;
  readonly nom_court: string | null;
  readonly pays: string | null;
  readonly statut: string;
}

/**
 * Construit la consolidation.
 *
 * Exportée pour l'essai : c'est ici que se prouvent le cloisonnement et le
 * `null` des domaines fermés, sans avoir à monter un serveur HTTP.
 */
export async function construireConsolidation(
  client: PoolClient,
  session: SessionAppliquee,
): Promise<Consolidation> {
  const lisibles = entitesLisibles(session.droits);

  // Un domaine fermé économise ses requêtes : le `null` n'est pas un filtre
  // appliqué après coup sur un résultat qu'on aurait quand même lu.
  const conformite = lisibles.has('evaluations') ? await lireConformite(client) : null;
  const risques = lisibles.has('risques') ? await lireRisques(client) : null;
  const actions = lisibles.has('actions') ? await lireActions(client) : null;
  const incidents = lisibles.has('incidents') ? await lireIncidents(client) : null;
  const documents = lisibles.has('documents') ? await lireDocuments(client) : null;
  const actifs = lisibles.has('actifs') ? await repartition(client, 'actifs', 'criticite') : null;
  const audits = lisibles.has('audits') ? await repartition(client, 'audits', 'statut') : null;

  // ── POURQUOI `f_filiales_lecture()` ICI, ALORS QUE LA RLS BORNE DÉJÀ ──────
  //
  // Elle borne, mais pas de la même façon sur `filiales` que sur les tables de
  // données. `pol_filiales_lecture` (migration `010`) ouvre la table **entière**
  // dès que `f_perimetre_groupe()` est vraie — et cette fonction est *dérivée* :
  // elle vaut vrai quand le périmètre couvre toutes les filiales **actives**.
  // Une filiale `archivee` ou `sortie`, absente du périmètre, échappe donc à sa
  // condition et reste lisible. Mesuré le 04/09/2026 : périmètre de deux
  // filiales actives, `f_perimetre_groupe()` vraie, et une filiale cédée en 2025
  // apparaît dans le `select`.
  //
  // Sur `filiales` seule, ce n'est pas une fuite — c'est le Groupe qui lit son
  // propre annuaire. Mais **ici, ce serait pire qu'une fuite : ce serait un
  // mensonge**. Les tables de données, elles, sont bornées par
  // `f_filiales_lecture()` : la filiale cédée sortirait donc avec **zéro risque,
  // zéro incident, zéro action en retard** — c'est-à-dire exactement la lecture
  // « cette filiale va bien », alors que la vraie réponse est « vous ne voyez
  // pas ses données ». C'est la décision 3 de l'entête, appliquée à la ligne
  // entière plutôt qu'au bloc : *un zéro qui veut dire « invisible » est le
  // défaut, pas l'approximation*.
  //
  // ⚠️ Ce prédicat **ne nomme pas de filiale** et ne contredit pas la décision 1 :
  // `f_filiales_lecture()` ne vient pas de la requête, elle rend ce que le
  // serveur a posé dans la transaction. On ne choisit pas un périmètre, on
  // demande à la base celui qu'elle applique déjà partout ailleurs.
  const { rows: lignes } = await client.query<LigneFiliale>(
    `select id, code, raison_sociale, nom_court, pays, statut
       from filiales
      where id = any (f_filiales_lecture())
      order by code`,
  );

  const indicateursDe = (k: string): Indicateurs => ({
    conformite:
      conformite === null ? null : (conformite.get(k) ?? { parReferentiel: [], parStatut: vide }),
    risques:
      risques === null
        ? null
        : (risques.get(k) ?? {
            total: 0,
            parNiveau: vide,
            expositionResiduelle: null,
            cotes: 0,
          }),
    actions:
      actions === null
        ? null
        : (actions.get(k) ?? { total: 0, parStatut: vide, enRetard: 0, sansEcheance: 0 }),
    incidents:
      incidents === null
        ? null
        : (incidents.get(k) ?? { total: 0, parStatut: vide, parGravite: vide, aDeclarer: 0 }),
    documents:
      documents === null
        ? null
        : (documents.get(k) ?? { total: 0, parStatut: vide, revueEchue: 0 }),
    actifs:
      actifs === null ? null : { total: totalDe(actifs.get(k)), parCriticite: actifs.get(k) ?? vide },
    audits:
      audits === null ? null : { total: totalDe(audits.get(k)), parStatut: audits.get(k) ?? vide },
  });

  const filiales = lignes.map((ligne) => ({
    id: ligne.id,
    code: ligne.code,
    raisonSociale: ligne.raison_sociale,
    nomCourt: ligne.nom_court,
    pays: ligne.pays,
    statut: ligne.statut,
    active: ligne.id === session.perimetre.filialeId,
    indicateurs: indicateursDe(ligne.id),
  }));

  return {
    horodatage: Date.now(),
    perimetre: {
      groupe: session.perimetre.perimetreGroupe,
      filiales: filiales.length,
      filialeActive: session.perimetre.filialeId,
    },
    filiales,
    total: cumuler(filiales.map((f) => f.indicateurs)),
    porteeGroupe: {
      documents:
        documents === null
          ? null
          : (documents.get(CLE_GROUPE) ?? { total: 0, parStatut: vide, revueEchue: 0 }),
    },
  };
}

/* =====================================================================
 *  4. Greffon
 * ===================================================================== */

export interface OptionsConsolidation {
  readonly pool?: Pool;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonConsolidation(
  instance: FastifyInstance,
  options: OptionsConsolidation,
): Promise<void> {
  const { pool } = options;
  if (pool === undefined) {
    instance.log.error(
      'greffonConsolidation enregistré sans pool : GET /api/consolidation ne sera pas montée.',
    );
    return;
  }

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Session absente sur une route consolidée : défaut de montage.',
      });
    }
    return session;
  };

  instance.get(
    '/api/consolidation',
    { config: { acces: { action: 'lire', domaine: 'pilotage' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const consolidation = await avecTransaction(pool, session.perimetre, async (client) => {
        const resultat = await construireConsolidation(client, session);
        // ── LA TRACE, DANS LA TRANSACTION QUI A SERVI LA LECTURE (§29.3) ──
        //
        // Constat **Q-200** de la porte S6. Ce fichier écrivait que « les
        // lectures ordinaires ne sont pas tracées » — vrai — et en déduisait
        // que celle-ci ne l'était pas. Mais elle n'est PAS ordinaire : c'est le
        // seul endroit du produit où une session lit les vingt filiales d'un
        // coup. `src/pieces/index.ts:745` trace déjà un téléchargement de pièce
        // jointe sous `consultation_sensible` — le dépôt faisait donc l'inverse
        // de ce que ce commentaire affirmait comme règle.
        //
        // Ce que le client y gagne : la question « qui a consulté les chiffres
        // consolidés du groupe, et quand ? » a une réponse. Elle sera posée en
        // audit ISO 27001, et le volume est celui d'un tableau de bord de
        // direction — pas de quoi noyer le journal.
        //
        // ⚠️ Le `lectureSeule: true` a été retiré, et c'est un vrai troc : la
        // transaction n'est plus refusée en écriture par la base. Ce que cela
        // coûte est une ceinture (aucun chemin d'écriture n'existe dans ce
        // fichier) ; ce que cela rapporte est une trace. Pour un produit qui
        // sert de preuve en audit, l'échange est dans le bon sens.
        await journaliser(client, {
          action: 'consultation_sensible',
          resume: 'Consultation de la synthèse consolidée du groupe',
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          adresseIp: requete.ip,
          entiteId: null,
          valeursApres: {
            // Des NOMBRES et des identifiants de filiales que la session lit
            // déjà : rien que le journal n'ait le droit de porter. Aucun nom
            // d'enregistrement, aucun contenu.
            filiales_lues: resultat.filiales.length,
            perimetre_groupe: resultat.perimetre.groupe,
          },
        });
        return resultat;
      });
      return await reponse.send(consolidation);
    },
  );
}
