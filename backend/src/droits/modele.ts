/**
 * Le modèle de droits à trois axes — les types, et rien que les types.
 *
 * `PLAN_SERVEUR` §3.1 : un droit est le croisement de **trois axes**.
 *
 *     Périmètre   une filiale · plusieurs filiales · le Groupe entier
 *     Profil      détermine les domaines accessibles (§3.2)
 *     Niveau      lecture · contribution · validation · administration
 *
 * Ce fichier ne lit rien et ne décide rien : il porte le vocabulaire, l'ordre
 * des niveaux, et la règle de cumul. `resolution.ts` s'en sert pour traduire des
 * appartenances de groupe en droits ; `resolveur.ts` pour en faire un périmètre
 * de transaction.
 *
 * ⚠️ **Les trente domaines sont écrits ici ET dans la base** (domaine
 * `domaine_fonctionnel`, migration `001_socle.sql` §1). Deux listes qui doivent
 * coïncider finissent par diverger — c'est le §19.5 — et il n'y a pas moyen de
 * n'en avoir qu'une : TypeScript ne lit pas le catalogue PostgreSQL, et une
 * chaîne libre côté serveur ferait perdre la vérification à la compilation, qui
 * est le seul garde-fou gratuit. La divergence est donc rendue **impossible à
 * survivre** plutôt qu'impossible à écrire : `test/droits/vocabulaire.test.mjs`
 * relève les valeurs dans le catalogue et exige l'égalité exacte des deux
 * ensembles. Une migration qui ajoute un domaine sans toucher ce fichier fait
 * rougir le banc.
 */

/** Troisième axe. Ordonné : chaque niveau contient les précédents. */
export type NiveauDroit = 'aucun' | 'lecture' | 'contribution' | 'validation' | 'administration';

/** Rang d'un niveau. Sert au cumul « au plus favorable » et à la comparaison. */
const RANG: Readonly<Record<NiveauDroit, number>> = Object.freeze({
  aucun: 0,
  lecture: 1,
  contribution: 2,
  validation: 3,
  administration: 4,
});

export const NIVEAUX: readonly NiveauDroit[] = Object.freeze([
  'aucun',
  'lecture',
  'contribution',
  'validation',
  'administration',
]);

/** Premier axe, tel que `sessions.perimetre` le stocke. */
export type PorteeSession = 'filiale' | 'multi' | 'groupe';

/**
 * Les trente domaines fonctionnels, alignés sur le menu de l'application.
 * « matrice » n'y figure pas : c'est une vue du domaine « risques ».
 */
export type DomaineFonctionnelBase =
  | 'tableau_de_bord'
  | 'synthese'
  | 'echeances'
  | 'donneurs_ordre'
  | 'personnel'
  | 'actifs'
  | 'cartographie'
  | 'risques'
  | 'exigences'
  | 'referentiels'
  | 'mesures'
  | 'correspondances'
  | 'actions'
  | 'incidents'
  | 'documents'
  | 'rgpd'
  | 'bia'
  | 'crise'
  | 'pra'
  | 'mco'
  | 'tests_pra'
  | 'prestataires'
  | 'audits'
  | 'revues'
  | 'pieces_jointes'
  | 'imports'
  | 'parametres'
  | 'filiales'
  | 'droits'
  | 'journal';

export const DOMAINES: readonly DomaineFonctionnelBase[] = Object.freeze([
  'tableau_de_bord',
  'synthese',
  'echeances',
  'donneurs_ordre',
  'personnel',
  'actifs',
  'cartographie',
  'risques',
  'exigences',
  'referentiels',
  'mesures',
  'correspondances',
  'actions',
  'incidents',
  'documents',
  'rgpd',
  'bia',
  'crise',
  'pra',
  'mco',
  'tests_pra',
  'prestataires',
  'audits',
  'revues',
  'pieces_jointes',
  'imports',
  'parametres',
  'filiales',
  'droits',
  'journal',
]);

const DOMAINES_CONNUS = new Set<string>(DOMAINES);
const NIVEAUX_CONNUS = new Set<string>(NIVEAUX);

/** Vrai si la chaîne est l'un des trente domaines. Défaut fermé. */
export function estDomaine(valeur: string): valeur is DomaineFonctionnelBase {
  return DOMAINES_CONNUS.has(valeur);
}

/** Vrai si la chaîne est l'un des cinq niveaux. Défaut fermé. */
export function estNiveau(valeur: string): valeur is NiveauDroit {
  return NIVEAUX_CONNUS.has(valeur);
}

/**
 * Cumul **au plus favorable**, tel que le commentaire de `session_domaines`
 * l'impose : « lorsque l'utilisateur appartient à plusieurs groupes AD ».
 *
 * Le choix mérite d'être dit, parce que l'autre est défendable : cumuler au
 * plus DÉFAVORABLE ferait d'un groupe supplémentaire une punition, et un
 * RSSI groupe qui reçoit en plus `GRC-TLS-CONTRIB` perdrait des droits en en
 * gagnant. Personne ne s'attend à cela, et l'administrateur des groupes AD
 * encore moins.
 */
export function cumuler(a: NiveauDroit, b: NiveauDroit): NiveauDroit {
  return RANG[a] >= RANG[b] ? a : b;
}

/** Le niveau détenu suffit-il pour l'exigence demandée ? */
export function suffit(detenu: NiveauDroit, exige: NiveauDroit): boolean {
  return RANG[detenu] >= RANG[exige] && RANG[exige] > 0;
}

/** Droits résolus d'une session : le croisement des trois axes, une fois calculé. */
export interface DroitsResolus {
  /** Premier axe. */
  readonly portee: PorteeSession;
  /** Filiales LISIBLES, identifiants. Jamais vide pour une session ouverte. */
  readonly filiales: readonly string[];
  /** Filiale d'ÉCRITURE proposée à l'ouverture. `null` si le choix reste à faire. */
  readonly filialeActive: string | null;
  /**
   * Le compte a-t-il le profil d'administration ? Ne suffit pas à poser le
   * drapeau d'administration Groupe : voir `resolveur.ts`, condition E2.
   */
  readonly administrateur: boolean;
  /** Droit d'export, **distinct de la lecture** (`PLAN_SERVEUR` §3.3, contrôle S7). */
  readonly peutExporter: boolean;
  /** Niveau par domaine. Un domaine absent est un domaine refusé. */
  readonly domaines: ReadonlyMap<DomaineFonctionnelBase, NiveauDroit>;
  /** Groupes AD reconnus dans `groupes_ad`, pour le journal d'audit. */
  readonly groupesReconnus: readonly string[];
  /** Groupes présentés mais inconnus ou inactifs. Pour le journal, et pour diagnostiquer. */
  readonly groupesIgnores: readonly string[];
}
