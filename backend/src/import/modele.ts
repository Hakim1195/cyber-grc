/**
 * Le modèle d'import — **découvert, sauf ce qui ne peut pas l'être.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat fait foi au `CONVENTIONS.md` §33.1, pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * > `Depot.decrire()` rend, pour chaque entité, `{ champ: { type, obligatoire } }`
 * > — c'est ce que sert `GET /api/modele`. **Les colonnes d'un modèle Excel s'en
 * > dérivent.** Un champ ajouté demain apparaît dans le modèle sans que personne
 * > y pense ; un champ retiré disparaît.
 *
 * Ce fichier ne porte donc **aucune liste de champs**. Il lit `decrire()` et en
 * tire les colonnes, leur type et leur caractère obligatoire. Vingt
 * configurations écrites à la main seraient vingt omissions qui attendent
 * (§19.5) — et le dépôt a payé quatre défauts pour l'apprendre.
 *
 * ── Ce qui EST écrit à la main, et pourquoi c'est le bon endroit ─────────
 *
 * Deux choses ne se dérivent d'aucun catalogue :
 *
 *  · le **libellé humain** d'une colonne — « Vraisemblance (F) » plutôt que
 *    `f_frequence` ;
 *  · son **ordre d'affichage**, quand l'ordre du registre ne convient pas.
 *
 * Le discriminant du `CLAUDE.md` §3 s'applique et tranche dans l'autre sens :
 * *que se passe-t-il le jour où la liste devient incomplète ?* Ici, **la colonne
 * s'affiche sous son nom technique**. C'est bruyant, immédiatement visible dans
 * le modèle téléchargé, et sans conséquence sur les données. C'est donc le bon
 * outil — et c'est mot pour mot ce que le §33.1 autorise.
 *
 * ⚠️ Ce qui serait le MAUVAIS outil, et qui n'est pas fait ici : lister les
 * champs, leurs types, leur caractère obligatoire, ou les entités importables.
 * Une omission y ferait **réussir un import en silence** avec une colonne perdue.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Trois exclusions, toutes DÉRIVÉES — aucune n'est une liste
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **`id` n'est jamais une colonne du modèle.** Le serveur attribue
 *     l'identifiant à la création, et il ne l'admet pas de l'appelant : le
 *     constat **M-3** de la porte S2 a montré qu'un identifiant proposé par le
 *     client est un **oracle d'existence inter-filiales** en une requête (pris
 *     ailleurs → refus, libre → succès). Un modèle d'import qui porterait une
 *     colonne « Identifiant » rouvrirait ce canal à chaque ligne d'un tableur.
 *     Conséquence assumée : **l'import crée, il ne met pas à jour** (voir
 *     `moteur.ts`).
 *  2. **Les liaisons n-n sont exclues** (`decrire().liaisons`) : `exigences_liees`,
 *     `dependances`, `mesure_ids`, `refs`… Une case de tableur ne porte pas un
 *     tableau d'objets typés, et les identifiants qu'elle devrait citer sont
 *     ceux que le serveur vient d'attribuer — donc inconnus de qui remplit le
 *     fichier. Elles sont **nommées dans le rapport** plutôt que tues.
 *  3. Rien d'autre. En particulier, les champs `json` **restent dans le modèle** :
 *     leur cellule porte le document en texte JSON. Les exclure aurait rendu
 *     `history` non importable (son champ `metrics` est obligatoire), c'est-à-dire
 *     qu'une exclusion écrite pour la commodité aurait retiré une entité du lot.
 */

import { DOMAINE_PAR_ENTITE } from '../api/droits.js';
import type { DomaineFonctionnel } from '../api/droits.js';
import { estEntiteConnue } from '../entites/index.js';
import type { Depot } from '../entites/index.js';
import type { FamilleType, NomEntite } from '../entites/types.js';

/* =====================================================================
 *  1. Ce qu'une colonne de modèle porte
 * ===================================================================== */

export interface ColonneModele {
  /** Nom technique du champ, tel que `decrire()` le donne. */
  readonly champ: string;
  /** Ce que l'utilisateur lit en tête de colonne. */
  readonly libelle: string;
  readonly type: FamilleType;
  readonly obligatoire: boolean;
}

export interface ModeleEntite {
  readonly entite: NomEntite;
  readonly domaine: DomaineFonctionnel;
  readonly colonnes: readonly ColonneModele[];
  /** Champs de liaison écartés du modèle, pour que le rapport puisse les nommer. */
  readonly liaisonsExclues: readonly string[];
}

/* =====================================================================
 *  2. Les libellés — LA liste écrite à la main, et la seule
 * ===================================================================== */

/**
 * Libellé humain d'un champ.
 *
 * Deux formes de clé, résolues dans cet ordre :
 *
 *  · `"entite.champ"` — quand le même nom technique veut dire deux choses
 *    différentes selon l'entité ;
 *  · `"champ"` — le cas ordinaire, partagé par toutes les entités.
 *
 * **Une clé absente n'est pas une erreur** : le champ s'affiche sous son nom
 * technique, et c'est visible dès le premier téléchargement du modèle.
 */
const LIBELLES: Readonly<Record<string, string>> = Object.freeze({
  /* ── Le vocabulaire commun ─────────────────────────────────────── */
  nom: 'Nom',
  titre: 'Titre',
  code: 'Code',
  description: 'Description',
  commentaire: 'Commentaire',
  notes: 'Notes',
  responsable: 'Responsable',
  proprietaire: 'Propriétaire',
  statut: 'Statut',
  type: 'Type',
  niveau: 'Niveau',
  priorite: 'Priorité',
  criticite: 'Criticité',
  gravite: 'Gravité',
  date: 'Date',
  echeance: 'Échéance',
  email: 'Courriel',
  telephone: 'Téléphone',
  phone: 'Téléphone',
  fonction: 'Fonction',
  service: 'Service',
  role: 'Rôle',
  version: 'Version',
  secteur: "Secteur d'activité",
  suppleant: 'Suppléant',
  societe: 'Société',
  acces: "Nature de l'accès",
  frequence: 'Fréquence',
  avancement: 'Avancement (0 à 100)',
  perimetre: 'Périmètre',
  auditeur: 'Auditeur',
  audite: 'Audité',
  synthese: 'Synthèse',
  participants: 'Participants',
  inputs: "Éléments d'entrée",
  outputs: 'Décisions et actions',
  maturite: 'Maturité (0 à 5)',
  preuves: 'Preuves',
  theme: 'Thème',
  aide: 'Note pédagogique',
  intitule: 'Intitulé',
  bilan: 'Bilan',
  emplacement: 'Emplacement',
  finalite: 'Finalité',
  destinataires: 'Destinataires',

  /* ── Les références vers un autre enregistrement ────────────────── */
  client_id: "Donneur d'ordre (identifiant)",
  exigence_id: 'Exigence (identifiant)',
  risque_id: 'Risque (identifiant)',
  evaluation_id: 'Évaluation (identifiant)',
  incident_id: 'Incident (identifiant)',
  mesure_id: 'Mesure de sécurité (identifiant)',
  scenario_id: 'Scénario PCA/PRA (identifiant)',
  // `ref_id` ne désigne PAS un enregistrement : c'est le code d'un référentiel
  // du catalogue statique (`anssi`, `iso-27002-2022`, `nis2`, `dora`, `aircyber`).
  ref_id: 'Référentiel (code)',

  /* ── Ce qui ne se comprend pas sans son libellé ─────────────────── */
  'exigences.statut_conformite': 'Statut de conformité',
  'risques.f_frequence': 'Vraisemblance F (1 à 4)',
  'risques.g_gravite': 'Gravité G (1 à 4)',
  'risques.m_maitrise': 'Maîtrise M (1 à 4)',
  'risques.score_brut': 'Score brut',
  'risques.score_residuel': 'Score résiduel',
  'processus.rto': "RTO — durée maximale d'interruption",
  'processus.rpo': 'RPO — perte de données maximale',
  'tests_pra.succes': 'Résultat',
  'tests_pra.type_test': "Type d'exercice",
  'scenarios_pra.etapes_pca': 'Étapes PCA (document JSON)',
  'scenarios_pra.etapes_pra': 'Étapes PRA (document JSON)',
  'prestataires.supplyChain': "Chaîne d'approvisionnement (document JSON)",
  'mco_actions.datePrevue': 'Date programmée',
  'mco_actions.dateReelle': 'Date de réalisation',
  'mco_actions.dateCloture': 'Date de clôture',
  'audits.ref': "Référence de l'audit",
  'audits.items': "Grille d'audit (document JSON)",
  'audits.constats': 'Constats (document JSON)',
  'incidents.date_detection': 'Date de détection',
  'incidents.date_resolution': 'Date de résolution',
  'incidents.actions_immediates': 'Actions immédiates',
  'incidents.cause_racine': 'Cause racine',
  'incidents.declaration_anssi': 'Déclaration ANSSI / NIS2',
  'incidents.declaration_cnil': 'Déclaration CNIL / RGPD',
  'documents.date_revue': 'Date de revue',
  'traitements.base_legale': 'Base légale',
  'traitements.personnes_concernees': 'Personnes concernées',
  'traitements.categories_donnees': 'Catégories de données',
  'traitements.donnees_sensibles': 'Données sensibles (oui / non)',
  'traitements.transfert_hors_ue': 'Transfert hors UE',
  'traitements.duree_conservation': 'Durée de conservation',
  'mappings._deleted': 'Masqué (oui / non)',
  'history.ts': 'Horodatage',
  'history.metrics': 'Indicateurs (document JSON)',
});

/**
 * Ordre d'affichage **imposé**, quand celui du registre ne convient pas.
 *
 * ⚠️ **Un `Partial`, et volontairement presque vide.** L'ordre du registre est
 * déjà celui des formulaires du navigateur — c'est-à-dire un ordre pensé pour
 * un humain. Le recopier vingt et une fois fabriquerait vingt et une listes à
 * tenir à jour pour ne rien changer, ce que le §19.5 refuse.
 *
 * La règle par défaut, elle, est **dérivée** : les champs **obligatoires**
 * d'abord — celui qui remplit le fichier voit tout de suite ce qu'il doit
 * fournir —, puis les autres dans l'ordre du registre. Un champ nommé ici passe
 * devant ; un champ oublié ici reste présent, simplement plus loin.
 */
const ORDRE_COLONNES: Readonly<Partial<Record<NomEntite, readonly string[]>>> = Object.freeze({
  // La fiche de risque se lit F, G, M, puis ce que le calcul en tire.
  risques: ['nom', 'description', 'f_frequence', 'g_gravite', 'm_maitrise'],
  // Un incident se raconte dans l'ordre où il arrive.
  incidents: ['titre', 'type', 'gravite', 'statut', 'date_detection', 'date_resolution'],
  // Le registre RGPD suit l'ordre de l'article 30.
  traitements: ['nom', 'finalite', 'base_legale', 'responsable', 'personnes_concernees'],
});

/** Libellé d'un champ, ou son nom technique. */
export function libelleDe(entite: NomEntite, champ: string): string {
  return LIBELLES[`${entite}.${champ}`] ?? LIBELLES[champ] ?? champ;
}

/* =====================================================================
 *  3. La dérivation — tout le reste vient de `decrire()`
 * ===================================================================== */

/** Ce que `decrire()` rend pour une entité, réduit à ce que ce module lit. */
interface DescriptionLue {
  readonly champs: Readonly<Record<string, { type: FamilleType; obligatoire: boolean }>>;
  readonly liaisons: readonly { champ: string }[];
}

/**
 * Refus BRUYANT d'une description qui n'a pas la forme attendue.
 *
 * `Depot.decrire()` rend `Record<string, unknown>` : le type ne protège de rien,
 * et un changement de forme se traduirait sinon par un modèle vide — c'est-à-dire
 * par un import qui « marche » en n'écrivant aucune colonne. On échoue plutôt.
 */
function lireDescription(entite: string, brut: unknown): DescriptionLue {
  const objet = brut as Partial<DescriptionLue> | undefined;
  const champs = objet?.champs;
  if (champs === undefined || typeof champs !== 'object') {
    throw new Error(
      `Le modèle d'import ne peut pas être construit : Depot.decrire() ne rend pas de champs ` +
        `pour l'entité « ${entite} ». Voir src/import/modele.ts.`,
    );
  }
  const liaisons = Array.isArray(objet?.liaisons) ? objet.liaisons : [];
  return { champs, liaisons };
}

/**
 * Construit le modèle d'import de **toutes** les entités, depuis `decrire()`.
 *
 * @throws {Error} si `decrire()` ne rend pas la forme attendue — voir ci-dessus.
 */
export function construireModeles(depot: Depot): ReadonlyMap<NomEntite, ModeleEntite> {
  const decrit = depot.decrire() as { entites?: Record<string, unknown> };
  const entites = decrit.entites;
  if (entites === undefined || typeof entites !== 'object') {
    throw new Error(
      "Le modèle d'import ne peut pas être construit : Depot.decrire() ne rend aucune entité.",
    );
  }

  const modeles = new Map<NomEntite, ModeleEntite>();
  for (const [nom, brut] of Object.entries(entites)) {
    if (!estEntiteConnue(nom)) continue;
    const description = lireDescription(nom, brut);

    const tous = Object.entries(description.champs).map(([champ, forme]) => ({
      champ,
      libelle: libelleDe(nom, champ),
      type: forme.type,
      obligatoire: forme.obligatoire,
    }));

    // ── L'ordre : imposé d'abord, obligatoires ensuite, le reste enfin ──
    const impose = ORDRE_COLONNES[nom] ?? [];
    const rang = (colonne: ColonneModele): number => {
      const place = impose.indexOf(colonne.champ);
      if (place >= 0) return place;
      return impose.length + (colonne.obligatoire ? 0 : 1_000_000);
    };
    const colonnes = tous
      .map((colonne, index) => ({ colonne, index }))
      .sort((a, b) => rang(a.colonne) - rang(b.colonne) || a.index - b.index)
      .map((entree) => Object.freeze(entree.colonne));

    modeles.set(
      nom,
      Object.freeze({
        entite: nom,
        domaine: DOMAINE_PAR_ENTITE[nom],
        colonnes: Object.freeze(colonnes),
        liaisonsExclues: Object.freeze(description.liaisons.map((liaison) => liaison.champ)),
      }),
    );
  }
  return modeles;
}

/* =====================================================================
 *  4. Reconnaître les colonnes d'un fichier reçu
 * ===================================================================== */

/**
 * Forme comparable d'un en-tête de colonne.
 *
 * L'utilisateur retape parfois l'en-tête, le met en majuscules, oublie un
 * accent, colle une espace insécable venue de Word. Refuser pour cela serait
 * refuser pour rien. On compare donc des formes normalisées :
 * décomposition Unicode, diacritiques retirés, casse repliée, tout ce qui n'est
 * ni lettre ni chiffre réduit à rien.
 *
 * ⚠️ Ce qui n'est **pas** fait : deviner une colonne à peu près semblable. Deux
 * en-têtes distincts qui se réduisent à la même forme sont un conflit, pas une
 * occasion d'en choisir un — voir `correspondanceEnTetes`.
 */
export function normaliserEnTete(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '');
}

export interface CorrespondanceEnTetes {
  /** Pour chaque colonne du fichier : le champ visé, ou `null` si inconnue. */
  readonly parPosition: readonly (ColonneModele | null)[];
  /** En-têtes du fichier qui ne correspondent à aucun champ. */
  readonly inconnues: readonly string[];
  /** Champs **obligatoires** du modèle qu'aucune colonne du fichier ne porte. */
  readonly manquantes: readonly ColonneModele[];
  /** Champs du modèle portés par **plusieurs** colonnes du fichier. */
  readonly doublons: readonly string[];
}

/**
 * Fait correspondre les en-têtes d'un fichier aux colonnes du modèle.
 *
 * Un en-tête est reconnu par son **libellé** ou par son **nom technique** :
 * l'utilisateur qui a renommé la colonne en `date_detection` a raison aussi.
 */
export function correspondanceEnTetes(
  modele: ModeleEntite,
  enTetes: readonly string[],
): CorrespondanceEnTetes {
  const index = new Map<string, ColonneModele>();
  for (const colonne of modele.colonnes) {
    index.set(normaliserEnTete(colonne.libelle), colonne);
    // Le nom technique ne doit jamais masquer un libellé : il ne s'ajoute que
    // si la forme est libre. (Aucun cas dans le modèle actuel ; la règle est
    // écrite pour le jour où un libellé vaudrait le nom technique d'un autre.)
    const technique = normaliserEnTete(colonne.champ);
    if (!index.has(technique)) index.set(technique, colonne);
  }

  const parPosition: (ColonneModele | null)[] = [];
  const inconnues: string[] = [];
  const vus = new Set<string>();
  const doublons = new Set<string>();

  for (const enTete of enTetes) {
    const colonne = index.get(normaliserEnTete(enTete)) ?? null;
    parPosition.push(colonne);
    if (colonne === null) {
      if (enTete.trim() !== '') inconnues.push(enTete);
      continue;
    }
    if (vus.has(colonne.champ)) doublons.add(colonne.libelle);
    vus.add(colonne.champ);
  }

  return {
    parPosition,
    inconnues,
    manquantes: modele.colonnes.filter((c) => c.obligatoire && !vus.has(c.champ)),
    doublons: [...doublons],
  };
}
