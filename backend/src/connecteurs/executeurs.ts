/**
 * `src/connecteurs/executeurs.ts` — LE REGISTRE DES EXÉCUTEURS (lot L22, action 22.4)
 *
 * ── ⚠️ LA PROPRIÉTÉ QUI TIENT TOUT LE LOT ─────────────────────────────────
 *
 * **Aucun chemin d'échec ne rend `conforme`.** C'est le critère 23.4, et c'est la seule
 * chose ici qui ne se négocie pas : un contrôle automatique qui n'a pas pu s'exécuter et
 * qui rend « conforme » est une **fausse assurance dans un outil produit en audit**. Une
 * source injoignable, une configuration incomplète, un répertoire illisible, un démon
 * muet : tout cela rend `indetermine`, et `indetermine` n'est **ni** vert **ni** rouge.
 *
 * Un essai balaie le registre — pas la liste des trois, **le registre** — et soumet à
 * chaque exécuteur un monde qui échoue sur tout. Aucun ne doit rendre `conforme`.
 *
 * ── ⚠️ LE MONDE EXTÉRIEUR EST INJECTÉ ─────────────────────────────────────
 *
 * Un exécuteur ne touche ni le disque ni le réseau directement : il reçoit un `Monde`.
 * C'est la discipline de `FabriqueClient` (`src/auth/annuaire.ts`), et elle a une
 * raison mesurée — *une doublure n'émet que ce que son auteur a prévu* (constat Q-83).
 * On s'en sert donc pour éprouver les chemins d'**échec**, que le réel ne produit pas
 * à la demande, et **jamais** pour remplacer l'épreuve du chemin nominal : celui-là se
 * mesure sur la recette, avec le vrai ClamAV et le vrai annuaire.
 *
 * ── ⚠️ CE QU'AUCUN EXÉCUTEUR NE DEMANDE ───────────────────────────────────
 *
 * **Un secret.** Les identifiants du lien LDAP et le chemin du démon antivirus viennent
 * de la **configuration du serveur**. C'est ce qui rend la table `connecteurs`
 * exportable sans danger, et la migration `055` le tient : les clefs admises sont
 * closes, déclarées en base, et le serveur les LIT.
 */

import type { Configuration } from '../config/index.js';

export type VerdictCollecte = 'conforme' | 'non_conforme' | 'indetermine';

export interface Constat {
  readonly verdict: VerdictCollecte;
  /** Ce que la source a répondu, tel quel. Document figé, rangé dans `collectes.detail`. */
  readonly detail: Record<string, unknown>;
}

/**
 * Le monde extérieur, réduit à ce que les exécuteurs en demandent.
 *
 * ⚠️ Chaque membre **jette** quand la source est injoignable : c'est ce qui distingue
 * « la sauvegarde est vieille » (une réponse, donc un verdict) de « je n'ai pas pu
 * regarder » (pas de réponse, donc `indetermine`). Confondre les deux est le défaut
 * que le troisième verdict existe pour empêcher.
 */
export interface Monde {
  /** La plus récente écriture sous un chemin. Jette si le chemin est inatteignable. */
  plusRecenteEcriture(chemin: string): Promise<{ readonly nom: string; readonly le: Date } | null>;
  /** Interroge le démon antivirus. Jette s'il ne répond pas. */
  antivirus(): Promise<{ readonly version: string; readonly signaturesLe: Date | null }>;
  /** Effectif d'un groupe de l'annuaire. Jette si l'annuaire est injoignable. */
  effectifDuGroupe(groupe: string): Promise<number>;
  maintenant(): Date;
}

export interface ContexteExecution {
  readonly config: Configuration;
  readonly monde: Monde;
}

/** Un réglage déclaré : son nom, s'il est obligatoire, et ce qu'il veut dire à l'écran. */
export interface Reglage {
  readonly nom: string;
  readonly obligatoire: boolean;
  readonly aide: string;
  readonly defaut?: number;
}

export interface Executeur {
  readonly genre: string;
  readonly libelle: string;
  /** Ce que ce genre constate — affiché, pour qu'on sache ce qu'on installe. */
  readonly objet: string;
  readonly reglages: readonly Reglage[];
  executer(
    configuration: Record<string, unknown>,
    contexte: ContexteExecution,
  ): Promise<Constat>;
}

/** Une configuration absente ou illisible — jamais une conformité. */
function incomplet(quoi: string): Constat {
  return {
    verdict: 'indetermine',
    detail: {
      motif: 'configuration_incomplete',
      explication: `Le réglage « ${quoi} » manque : le contrôle n'a pas pu être tenté.`,
    },
  };
}

/** La source n'a pas répondu — jamais une conformité. */
function injoignable(erreur: unknown, quoi: string): Constat {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  return {
    verdict: 'indetermine',
    detail: {
      motif: 'source_injoignable',
      explication: `${quoi} n'a pas répondu. Le contrôle n'a pas pu être tenté, et ce n'est pas un échec du contrôle.`,
      // ⚠️ Borné : un message d'erreur de bibliothèque peut être immense, et il est
      // rangé dans une colonne qui voyage (contrôle S13).
      reponse: message.slice(0, 500),
    },
  };
}

/** Lit un entier positif de la configuration, ou rend son défaut. */
function entier(
  configuration: Record<string, unknown>,
  clef: string,
  defaut: number,
): number | null {
  const brut = configuration[clef];
  if (brut === undefined || brut === null || brut === '') return defaut;
  const valeur = typeof brut === 'number' ? brut : Number.parseInt(String(brut), 10);
  if (!Number.isFinite(valeur) || valeur <= 0) return null;
  return Math.floor(valeur);
}

function texte(configuration: Record<string, unknown>, clef: string): string | null {
  const brut = configuration[clef];
  if (typeof brut !== 'string') return null;
  const propre = brut.trim();
  return propre === '' ? null : propre;
}

function heuresEcoulees(depuis: Date, maintenant: Date): number {
  return (maintenant.getTime() - depuis.getTime()) / 3_600_000;
}

/* =====================================================================
 *  LA SAUVEGARDE — « quelque chose a-t-il été écrit récemment ? »
 * ===================================================================== */

const SAUVEGARDE: Executeur = {
  genre: 'sauvegarde',
  libelle: 'Sauvegarde',
  objet:
    "Constate qu'un dépôt de sauvegarde a bien reçu une écriture récente. Il ne dit pas que la " +
    'sauvegarde est restaurable — cela, seul un test de restauration le dit.',
  reglages: [
    {
      nom: 'chemin',
      obligatoire: true,
      aide: 'Le répertoire où la sauvegarde dépose ses fichiers.',
    },
    {
      nom: 'age_max_heures',
      obligatoire: false,
      defaut: 24,
      aide: "Au-delà de cet âge, la dernière écriture est jugée trop ancienne.",
    },
  ],
  async executer(configuration, { monde }) {
    const chemin = texte(configuration, 'chemin');
    if (chemin === null) return incomplet('chemin');
    const ageMax = entier(configuration, 'age_max_heures', 24);
    if (ageMax === null) return incomplet('age_max_heures');

    let derniere: { nom: string; le: Date } | null;
    try {
      derniere = await monde.plusRecenteEcriture(chemin);
    } catch (erreur) {
      return injoignable(erreur, `Le répertoire « ${chemin} »`);
    }

    // ⚠️ **Un répertoire VIDE n'est pas une panne : c'est une réponse.** La source a
    // répondu, et elle a répondu « rien ». C'est un contrôle en échec, pas un contrôle
    // qu'on n'a pas pu faire — et la distinction est tout ce lot.
    if (derniere === null) {
      return {
        verdict: 'non_conforme',
        detail: {
          motif: 'aucun_depot',
          explication: `Le répertoire « ${chemin} » est lisible, et il ne contient aucun fichier.`,
          chemin,
        },
      };
    }

    const age = heuresEcoulees(derniere.le, monde.maintenant());
    return {
      verdict: age <= ageMax ? 'conforme' : 'non_conforme',
      detail: {
        motif: age <= ageMax ? 'depot_recent' : 'depot_trop_ancien',
        chemin,
        dernier_fichier: derniere.nom,
        depose_le: derniere.le.toISOString(),
        age_heures: Math.round(age * 10) / 10,
        age_max_heures: ageMax,
      },
    };
  },
};

/* =====================================================================
 *  L'ANTIVIRUS — « le démon répond, et sa base de signatures est fraîche ? »
 * ===================================================================== */

const ANTIVIRUS: Executeur = {
  genre: 'antivirus',
  libelle: 'Antivirus',
  objet:
    'Constate que le démon antivirus répond et que sa base de signatures a été mise à jour ' +
    "récemment. Un antivirus dont la base date d'un an protège contre les menaces d'il y a un an.",
  reglages: [
    {
      nom: 'age_signatures_max_jours',
      obligatoire: false,
      defaut: 7,
      aide: 'Au-delà de cet âge, la base de signatures est jugée trop ancienne.',
    },
  ],
  async executer(configuration, { monde }) {
    const ageMax = entier(configuration, 'age_signatures_max_jours', 7);
    if (ageMax === null) return incomplet('age_signatures_max_jours');

    let reponse: { version: string; signaturesLe: Date | null };
    try {
      reponse = await monde.antivirus();
    } catch (erreur) {
      return injoignable(erreur, 'Le démon antivirus');
    }

    // ⚠️ **Le démon répond, et ne dit pas la date de sa base.** La tentation est de
    // conclure « il répond, donc tout va bien » : c'est exactement la fausse assurance
    // du critère 23.4. On ne sait pas — on le dit.
    if (reponse.signaturesLe === null) {
      return {
        verdict: 'indetermine',
        detail: {
          motif: 'date_des_signatures_inconnue',
          explication:
            "Le démon répond, et il ne dit pas quand sa base de signatures a été mise à jour. " +
            "« Il répond » n'est pas « il protège ».",
          version: reponse.version,
        },
      };
    }

    const age = heuresEcoulees(reponse.signaturesLe, monde.maintenant()) / 24;
    return {
      verdict: age <= ageMax ? 'conforme' : 'non_conforme',
      detail: {
        motif: age <= ageMax ? 'signatures_fraiches' : 'signatures_trop_anciennes',
        version: reponse.version,
        signatures_le: reponse.signaturesLe.toISOString(),
        age_jours: Math.round(age * 10) / 10,
        age_signatures_max_jours: ageMax,
      },
    };
  },
};

/* =====================================================================
 *  L'ANNUAIRE — « le groupe qui porte ce droit est-il peuplé ? »
 * ===================================================================== */

const ANNUAIRE: Executeur = {
  genre: 'annuaire',
  libelle: 'Annuaire',
  objet:
    "Constate qu'un groupe de l'annuaire existe et porte au moins l'effectif attendu. Il sert " +
    "à voir qu'un groupe de droits n'a pas été vidé — ou qu'il n'a pas enflé.",
  reglages: [
    {
      nom: 'groupe',
      obligatoire: true,
      aide: "Le nom du groupe de l'annuaire à constater — par exemple « GRC-ADMIN ».",
    },
    {
      nom: 'effectif_min',
      obligatoire: false,
      defaut: 1,
      aide: 'En deçà de cet effectif, le constat est « non conforme ».',
    },
  ],
  async executer(configuration, { monde }) {
    const groupe = texte(configuration, 'groupe');
    if (groupe === null) return incomplet('groupe');
    const minimum = entier(configuration, 'effectif_min', 1);
    if (minimum === null) return incomplet('effectif_min');

    let effectif: number;
    try {
      effectif = await monde.effectifDuGroupe(groupe);
    } catch (erreur) {
      return injoignable(erreur, `L'annuaire, interrogé sur « ${groupe} »`);
    }

    return {
      verdict: effectif >= minimum ? 'conforme' : 'non_conforme',
      detail: {
        motif: effectif >= minimum ? 'effectif_tenu' : 'effectif_insuffisant',
        groupe,
        effectif,
        effectif_min: minimum,
      },
    };
  },
};

/**
 * LE REGISTRE.
 *
 * ⚠️ **Un essai le confronte au vocabulaire de la base** (`ck_connecteurs_genre` et
 * `f_connecteur_clefs()`) dans les deux sens : un genre admis en base et servi par
 * personne, ou un exécuteur qu'aucun genre n'admet, fait rougir le banc. *Un connecteur
 * ajouté sans être déclaré échoue bruyamment, il n'est pas ignoré en silence.*
 */
export const EXECUTEURS: ReadonlyMap<string, Executeur> = new Map(
  [SAUVEGARDE, ANTIVIRUS, ANNUAIRE].map((e) => [e.genre, e]),
);

export function executeurDe(genre: string): Executeur | null {
  return EXECUTEURS.get(genre) ?? null;
}
