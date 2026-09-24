/**
 * `src/habilitations/lecture.ts` — **ce que le modèle de droits contient, rendu
 * lisible.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et ce qu'il corrige
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le modèle de droits à trois axes est **construit depuis le lot L1** :
 * `profils`, `profil_domaines`, `groupes_ad`, `utilisateurs`, et les trente
 * domaines de `domaine_fonctionnel`. Il est lu à chaque connexion par
 * `src/droits/resolution.ts`, il décide de tout — et **aucune route ne
 * l'exposait**. Autrement dit : le produit refusait des accès sans que personne
 * puisse voir pourquoi, ni ce qu'un profil accorde, ni quel groupe d'annuaire
 * ouvre quoi.
 *
 * ⚠️ **Ce n'est pas un écran de confort.** La matrice d'habilitations — qui a
 * quoi, sur quel domaine, à quel niveau — est la pièce qu'un auditeur ISO 27001
 * demande au titre de l'A.5.18, et que ce produit ne savait pas produire alors
 * qu'il détenait la donnée. Un outil qui sert de preuve en audit et qui ne sait
 * pas montrer ses propres habilitations a un trou à l'endroit où il est le plus
 * regardé.
 *
 * ── CE QUE CE FICHIER NE FAIT PAS ───────────────────────────────────────────
 *
 * **Il ne recalcule rien.** Les niveaux, le cumul « au plus favorable », la
 * projection sur les quatorze domaines de décision : tout cela vit dans
 * `src/droits/`, et c'est de là que ça sort. Une seconde rédaction de la règle
 * d'autorisation dans un écran d'administration serait la pire des secondes
 * rédactions — celle qui *affiche* un droit que le produit *n'applique pas*
 * (constat Q-219, et le motif du `CONVENTIONS.md` §33.3).
 *
 * ── LES BORNES, ET POURQUOI ELLES NE SONT PAS DU CONFORT ────────────────────
 *
 * Trois collections sont rendues, et chacune porte son plafond. Sans eux, une
 * seule requête rend l'annuaire des comptes d'un groupe de vingt filiales —
 * c'est-à-dire une extraction d'identités, dans une route de lecture. C'est le
 * contrôle S13, et c'est le constat Q-214 d appliqué à des données personnelles.
 */

import type { PoolClient } from 'pg';

import { DOMAINES, NIVEAUX } from '../droits/modele.js';
import type { DomaineFonctionnelBase, NiveauDroit } from '../droits/modele.js';
import { DOMAINE_API_PAR_DOMAINE_BASE } from '../droits/passerelle-api.js';
import { CODE_PROFIL_ADMINISTRATION } from '../droits/resolution.js';

/**
 * Plafonds. Un déploiement réel porte ~10 profils, ~200 groupes (20 filiales ×
 * 8 profils + les transversaux) et autant de comptes que de salariés ayant un
 * accès. Les bornes sont larges au regard du réel **et fermées** au regard de
 * l'extraction : atteindre l'une d'elles est signalé à l'écran, jamais avalé.
 */
export const PROFILS_MAX = 200;
export const GROUPES_MAX = 1_000;
export const COMPTES_MAX = 500;

export interface DomaineDecrit {
  readonly code: DomaineFonctionnelBase;
  readonly libelle: string;
  readonly groupe: string;
  /** Le domaine de DÉCISION sur lequel il se projette, ou `null` s'il n'ouvre aucune route. */
  readonly domaineApi: string | null;
}

export interface ProfilDecrit {
  readonly id: string;
  readonly code: string;
  readonly nom: string;
  readonly description: string | null;
  readonly niveauDefaut: NiveauDroit;
  readonly socle: boolean;
  readonly actif: boolean;
  readonly version: number;
  /** Niveau par domaine. Un domaine absent est un domaine **refusé**. */
  readonly domaines: Readonly<Record<string, NiveauDroit>>;
  /** Nombre de groupes d'annuaire actifs qui attribuent ce profil. */
  readonly groupesPorteurs: number;
}

export interface GroupeDecrit {
  readonly id: string;
  readonly nom: string;
  readonly perimetre: 'filiale' | 'groupe' | 'transversal';
  readonly filialeId: string | null;
  readonly filialeCode: string | null;
  readonly filialeRaisonSociale: string | null;
  readonly profilId: string | null;
  readonly profilCode: string | null;
  readonly profilNom: string | null;
  readonly accordeExport: boolean;
  readonly accordeAdmin: boolean;
  readonly description: string | null;
  readonly actif: boolean;
  readonly version: number;
  /**
   * Ce que le groupe ouvre **une fois résolu** : le nombre de domaines et le
   * niveau le plus élevé. ⚠️ C'est une projection d'affichage, pas la décision :
   * un compte cumule plusieurs groupes, et le cumul ne se lit pas ligne à ligne.
   */
  readonly domainesOuverts: number;
  readonly niveauMax: NiveauDroit;
}

export interface CompteDecrit {
  readonly id: string;
  readonly identifiant: string;
  readonly nomAffichage: string;
  readonly email: string | null;
  readonly filialeDefautId: string | null;
  readonly filialeDefautCode: string | null;
  readonly derniereConnexion: string | null;
  readonly derniereSynchroAd: string | null;
  readonly actif: boolean;
  readonly compteSecours: boolean;
  readonly verrouille: boolean;
}

export interface EtatHabilitations {
  readonly domaines: readonly DomaineDecrit[];
  readonly niveaux: readonly NiveauDroit[];
  readonly profils: readonly ProfilDecrit[];
  readonly groupes: readonly GroupeDecrit[];
  readonly comptes: readonly CompteDecrit[];
  readonly filiales: readonly { readonly id: string; readonly code: string; readonly raisonSociale: string }[];
  readonly tronque: {
    readonly profils: boolean;
    readonly groupes: boolean;
    readonly comptes: boolean;
  };
  /** Préfixe de nommage des groupes d'annuaire (`LDAP_PREFIXE_GROUPES`). */
  readonly prefixeGroupes: string;
}

/* =====================================================================
 *  Le libellé et le regroupement des trente domaines
 *
 *  ⚠️ **Une liste écrite à la main, et c'est ici le bon outil** — critère du
 *  `CLAUDE.md` §3 : son incomplétude échoue **bruyamment**. Le `Record` est
 *  exhaustif sur `DomaineFonctionnelBase` ; un domaine ajouté à `modele.ts`
 *  sans libellé **fait échouer la compilation**, et oblige quelqu'un à décider
 *  sous quel intitulé un administrateur doit le lire. Rien ne peut le deviner :
 *  « correspondances » n'est pas déductible de son code.
 * ===================================================================== */

const LIBELLES: Readonly<Record<DomaineFonctionnelBase, readonly [string, string]>> = Object.freeze({
  tableau_de_bord: ['Tableau de bord', 'Pilotage'],
  synthese: ['Synthèse direction', 'Pilotage'],
  echeances: ['Échéancier', 'Pilotage'],
  donneurs_ordre: ['Donneurs d’ordre', 'Tiers & personnes'],
  prestataires: ['Prestataires', 'Tiers & personnes'],
  personnel: ['Personnel', 'Tiers & personnes'],
  actifs: ['Actifs critiques', 'Risques & patrimoine'],
  cartographie: ['Cartographie', 'Risques & patrimoine'],
  risques: ['Registre des risques', 'Risques & patrimoine'],
  bia: ['Processus & BIA', 'Risques & patrimoine'],
  exigences: ['Exigences', 'Conformité'],
  referentiels: ['Référentiels', 'Conformité'],
  mesures: ['Mesures de sécurité', 'Conformité'],
  correspondances: ['Correspondances', 'Conformité'],
  actions: ['Plan d’actions', 'Opérations'],
  mco: ['Actions préalables (MCO)', 'Opérations'],
  incidents: ['Incidents', 'Opérations'],
  documents: ['Documents & politiques', 'Opérations'],
  pieces_jointes: ['Pièces jointes', 'Opérations'],
  rgpd: ['Registre RGPD', 'Opérations'],
  crise: ['Cellule de crise', 'Continuité'],
  pra: ['Scénarios PCA/PRA', 'Continuité'],
  tests_pra: ['Tests PCA/PRA', 'Continuité'],
  audits: ['Audits', 'Audits & revues'],
  revues: ['Revues de direction', 'Audits & revues'],
  imports: ['Imports', 'Administration'],
  parametres: ['Paramètres', 'Administration'],
  filiales: ['Filiales', 'Administration'],
  droits: ['Habilitations', 'Administration'],
  journal: ['Journal d’audit', 'Administration'],
});

/** Les trente domaines, décrits pour l'écran — dans l'ordre du menu. */
export function domainesDecrits(): readonly DomaineDecrit[] {
  return DOMAINES.map((code) => {
    const [libelle, groupe] = LIBELLES[code];
    return Object.freeze({
      code,
      libelle,
      groupe,
      domaineApi: DOMAINE_API_PAR_DOMAINE_BASE[code],
    });
  });
}

const RANG: Readonly<Record<NiveauDroit, number>> = Object.freeze({
  aucun: 0,
  lecture: 1,
  contribution: 2,
  validation: 3,
  administration: 4,
});

/* =====================================================================
 *  La lecture
 * ===================================================================== */

interface LigneProfil {
  readonly id: string;
  readonly code: string;
  readonly nom: string;
  readonly description: string | null;
  readonly niveau_defaut: string;
  readonly socle: boolean;
  readonly actif: boolean;
  readonly version: number;
}

export async function lireEtat(
  client: PoolClient,
  prefixeGroupes: string,
): Promise<EtatHabilitations> {
  /* ── 1. Les profils, et leur grille de domaines ───────────────────────── */
  const profils = await client.query<LigneProfil>(
    `select "id", "code", "nom", "description", "niveau_defaut", "socle", "actif", "version"
       from "profils"
      order by "socle" desc, "code"
      limit $1`,
    [PROFILS_MAX + 1],
  );
  const profilsTronques = profils.rows.length > PROFILS_MAX;
  const lignesProfils = profils.rows.slice(0, PROFILS_MAX);

  const grilles = await client.query<{ profil_id: string; domaine: string; niveau: string }>(
    `select "profil_id", "domaine", "niveau"
       from "profil_domaines"
      where "profil_id" = any($1::text[])`,
    [lignesProfils.map((p) => p.id)],
  );

  const parProfil = new Map<string, Record<string, NiveauDroit>>();
  for (const ligne of grilles.rows) {
    const grille = parProfil.get(ligne.profil_id) ?? {};
    // Défaut fermé, comme `resolution.ts` : un niveau inconnu du vocabulaire
    // n'accorde rien, et n'est donc pas affiché comme s'il accordait.
    if ((NIVEAUX as readonly string[]).includes(ligne.niveau)) {
      grille[ligne.domaine] = ligne.niveau as NiveauDroit;
    }
    parProfil.set(ligne.profil_id, grille);
  }

  /* ── 2. Les groupes d'annuaire, avec filiale et profil résolus ────────── */
  const groupes = await client.query<{
    id: string;
    nom: string;
    perimetre: string;
    filiale_id: string | null;
    profil_id: string | null;
    accorde_export: boolean;
    accorde_admin: boolean;
    description: string | null;
    actif: boolean;
    version: number;
    filiale_code: string | null;
    filiale_raison: string | null;
    profil_code: string | null;
    profil_nom: string | null;
  }>(
    /* 🛑 `f_filiales_inventaire()` — migration `065`, et CE COMMENTAIRE DISAIT
     * FAUX. Il affirmait que « la lecture de `filiales` est ouverte parce que
     * l'authentification la précède » : elle ne l'est pas. `pol_filiales_lecture`
     * retombe sur `id = any (f_filiales_lecture())` dès que `f_perimetre_groupe()`
     * est fausse — et créer une filiale la rend fausse, puisqu'elle est DÉRIVÉE de
     * « le périmètre couvre-t-il toutes les actives ? ».
     *
     * ⚠️ **Mesuré au navigateur le 24/09/2026**, sur le signalement de
     * l'utilisateur : une filiale créée dix secondes plus tôt affichait ses huit
     * groupes avec une **colonne « filiale » VIDE**, et elle manquait de la liste
     * déroulante — donc *on ne pouvait affecter aucun groupe à la filiale qu'on
     * venait de créer*. L'écran des habilitations est un écran d'ADMINISTRATION
     * GROUPE : il doit voir le groupe entier, sans quoi il montre un périmètre
     * amputé au seul compte qui a le droit de le corriger.
     *
     * ⚠️ **Et c'est « corriger l'instance, pas la classe », refait le jour même** :
     * la migration `065` avait fermé exactement ce piège pour l'écran « Filiales »,
     * et je ne l'avais pas fermé ici. Le motif reste juste — un groupe peut viser
     * une filiale archivée, donc `f_filiales_actives()` ne convient pas ; c'est la
     * conclusion qui était fausse. */
    `select g."id", g."nom", g."perimetre", g."filiale_id", g."profil_id",
            g."accorde_export", g."accorde_admin", g."description", g."actif", g."version",
            f."code" as filiale_code, f."raison_sociale" as filiale_raison,
            p."code" as profil_code, p."nom" as profil_nom
       from "groupes_ad" g
       left join f_filiales_inventaire() f on f."id" = g."filiale_id"
       left join "profils"  p on p."id" = g."profil_id"
      order by g."perimetre", f."code" nulls first, p."code" nulls first, g."nom"
      limit $1`,
    [GROUPES_MAX + 1],
  );
  const groupesTronques = groupes.rows.length > GROUPES_MAX;
  const lignesGroupes = groupes.rows.slice(0, GROUPES_MAX);

  const porteurs = new Map<string, number>();
  for (const g of lignesGroupes) {
    if (g.profil_id !== null && g.actif) porteurs.set(g.profil_id, (porteurs.get(g.profil_id) ?? 0) + 1);
  }

  /* ── 3. Les comptes ───────────────────────────────────────────────────
   *
   * ⚠️ **Jamais `mot_de_passe_hash`, jamais `sid_ad`.** Le premier est un
   * secret — son privilège de lecture est d'ailleurs retiré au rôle applicatif
   * (`001_socle.sql` §15 ter) —, le second est un identifiant de sécurité qui
   * n'apprend rien à un administrateur et qui suit la personne hors du produit.
   * Ce qui est rendu est ce qu'un écran d'habilitations a besoin de montrer, et
   * rien de plus : c'est la minimisation de l'article 5.1.c, appliquée à notre
   * propre outil.
   */
  const comptes = await client.query<{
    id: string;
    identifiant: string;
    nom_affichage: string;
    email: string | null;
    filiale_defaut_id: string | null;
    filiale_code: string | null;
    derniere_connexion: string | null;
    derniere_synchro_ad: string | null;
    actif: boolean;
    compte_secours: boolean;
    verrouille: boolean;
  }>(
    `select u."id", u."identifiant", u."nom_affichage", u."email", u."filiale_defaut_id",
            f."code" as filiale_code,
            to_char(u."derniere_connexion"  at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                as derniere_connexion,
            to_char(u."derniere_synchro_ad" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                as derniere_synchro_ad,
            u."actif", u."compte_secours",
            (u."verrouille_jusqu_a" is not null and u."verrouille_jusqu_a" > now()) as verrouille
       from "utilisateurs" u
       left join "filiales" f on f."id" = u."filiale_defaut_id"
      order by u."derniere_connexion" desc nulls last, u."identifiant"
      limit $1`,
    [COMPTES_MAX + 1],
  );
  const comptesTronques = comptes.rows.length > COMPTES_MAX;
  const lignesComptes = comptes.rows.slice(0, COMPTES_MAX);

  /* ── 4. Les filiales, pour les listes déroulantes ───────────────────────
   *
   * 🛑 Même fonction, et même motif : c'est CETTE liste qui peuplait le choix
   * « filiale » du formulaire de déclaration d'un groupe. Amputée du périmètre de
   * session, elle rendait **impossible d'affecter un groupe à une filiale qu'on
   * vient de créer** — signalé par l'utilisateur, reproduit au navigateur.
   *
   * ⚠️ Le tri vit dans la fonction ; le refaire ici en ferait un second tri. */
  const filiales = await client.query<{ id: string; code: string; raison_sociale: string }>(
    `select "id", "code", "raison_sociale" from f_filiales_inventaire()`,
  );

  return Object.freeze({
    domaines: domainesDecrits(),
    niveaux: NIVEAUX,
    profils: lignesProfils.map((p) => {
      const grille = parProfil.get(p.id) ?? {};
      return Object.freeze({
        id: p.id,
        code: p.code,
        nom: p.nom,
        description: p.description,
        niveauDefaut: p.niveau_defaut as NiveauDroit,
        socle: p.socle,
        actif: p.actif,
        version: Number(p.version),
        domaines: Object.freeze({ ...grille }),
        groupesPorteurs: porteurs.get(p.id) ?? 0,
      });
    }),
    groupes: lignesGroupes.map((g) => {
      /* ⚠️ **Un groupe `accorde_admin` n'a PAS de `profil_id`** — la contrainte
       * `ck_groupes_ad_coherence` l'interdit aux groupes transversaux — et il
       * attribue pourtant le profil d'administration à la résolution
       * (`resolution.ts`). Lire la seule colonne affichait donc « aucun domaine
       * ouvert » pour le groupe qui ouvre tout.
       *
       * Le code du profil vient de `resolution.ts`, partagé : le recopier ici
       * ferait diverger l'écran du produit au premier déploiement qui renomme
       * son profil d'administration. */
      const profilEffectif =
        g.accorde_admin && g.profil_id === null
          ? (lignesProfils.find((p) => p.code === CODE_PROFIL_ADMINISTRATION)?.id ?? null)
          : g.profil_id;
      const grille = profilEffectif === null ? {} : (parProfil.get(profilEffectif) ?? {});
      let ouverts = 0;
      let max: NiveauDroit = 'aucun';
      for (const niveau of Object.values(grille)) {
        if (niveau === 'aucun') continue;
        ouverts += 1;
        if (RANG[niveau] > RANG[max]) max = niveau;
      }
      const profilNomme =
        profilEffectif === null
          ? null
          : (lignesProfils.find((p) => p.id === profilEffectif) ?? null);
      return Object.freeze({
        id: g.id,
        nom: g.nom,
        perimetre: g.perimetre as 'filiale' | 'groupe' | 'transversal',
        filialeId: g.filiale_id,
        filialeCode: g.filiale_code,
        filialeRaisonSociale: g.filiale_raison,
        profilId: g.profil_id,
        // ⚠️ Le code et le nom RENDUS sont ceux du profil EFFECTIF : c'est ce que
        //    l'utilisateur obtiendra. `profilId`, lui, reste celui de la colonne —
        //    c'est la donnée, et l'écran d'édition la modifie.
        profilCode: g.profil_code ?? profilNomme?.code ?? null,
        profilNom: g.profil_nom ?? profilNomme?.nom ?? null,
        accordeExport: g.accorde_export,
        accordeAdmin: g.accorde_admin,
        description: g.description,
        actif: g.actif,
        version: Number(g.version),
        domainesOuverts: ouverts,
        niveauMax: max,
      });
    }),
    comptes: lignesComptes.map((u) =>
      Object.freeze({
        id: u.id,
        identifiant: u.identifiant,
        nomAffichage: u.nom_affichage,
        email: u.email,
        filialeDefautId: u.filiale_defaut_id,
        filialeDefautCode: u.filiale_code,
        derniereConnexion: u.derniere_connexion,
        derniereSynchroAd: u.derniere_synchro_ad,
        actif: u.actif,
        compteSecours: u.compte_secours,
        verrouille: u.verrouille,
      }),
    ),
    filiales: filiales.rows.map((f) =>
      Object.freeze({ id: f.id, code: f.code, raisonSociale: f.raison_sociale }),
    ),
    tronque: Object.freeze({
      profils: profilsTronques,
      groupes: groupesTronques,
      comptes: comptesTronques,
    }),
    prefixeGroupes,
  });
}
