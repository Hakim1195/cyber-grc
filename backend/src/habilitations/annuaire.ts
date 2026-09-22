/**
 * `src/habilitations/annuaire.ts` — **confronter la déclaration applicative à
 * l'annuaire réel, et dire ce qu'un compte obtiendrait.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  🛑 CE MODULE NE FAIT QUE LIRE L'ANNUAIRE. IL N'ÉCRIT JAMAIS.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Arbitrage de l'utilisateur, 22/09/2026 : *« on n'écrit jamais sur l'AD depuis
 * ce logiciel »*. Ce n'est pas une consigne qu'une revue de code doit faire
 * respecter, c'est une **capacité absente** — `ClientLdap` n'implémente que
 * `lier`, `rechercher` et `fermer`, et aucune opération d'écriture LDAP
 * (`add`, `modify`, `delete`) n'existe dans le produit. Le produit **prépare**
 * la commande, un humain l'exécute : la même discipline qu'à l'action 20.2, où
 * le bouton dit « préparer » et jamais « déclarer ».
 *
 * ════════════════════════════════════════════════════════════════════════
 *  LES DEUX QUESTIONS AUXQUELLES CE FICHIER RÉPOND
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. « La déclaration et l'annuaire sont-ils d'accord ? »**
 *
 * Trois listes existent, et rien ne les confrontait :
 *
 * | Liste | Qui la tient | Ce qu'elle veut dire |
 * |---|---|---|
 * | **attendus** | la convention de nommage (`src/droits/groupes-ad.ts`) | ce que ce déploiement DEVRAIT avoir |
 * | **déclarés** | la table `groupes_ad` | ce que l'application reconnaît |
 * | **réels** | l'annuaire | ce qui existe |
 *
 * 🛑 **L'écart le plus coûteux est « déclaré mais absent de l'annuaire ».** Le
 * compte entre, ne reçoit **aucun droit**, et le seul symptôme est quelqu'un qui
 * dit « je ne vois rien ». C'est le constat **Q-265** de la porte S7 : les
 * guides envoyaient l'exploitant vers un groupe d'annuaire qui n'existait pas,
 * et rien dans le produit ne pouvait le dire.
 *
 * ⚠️ **Une troncature rend la comparaison FAUSSE DANS LE SENS RASSURANT** — un
 * groupe au-delà de la borne apparaîtrait « absent de l'annuaire ». Elle est
 * donc rendue à l'appelant, et l'écran refuse d'afficher le verdict quand elle
 * est vraie. Motif du constat Q-68.
 *
 * **2. « Que verrait ce compte, et pourquoi ? »**
 *
 * La question la plus posée à un administrateur, et la plus longue à instruire :
 * il faut lire l'AD, résoudre les imbrications, croiser `groupes_ad`, cumuler
 * les profils. Le produit le fait déjà à chaque connexion — il ne savait
 * simplement pas le **montrer**.
 *
 * ⚠️ **La résolution n'est pas réécrite ici** : `resoudreDroits()` est appelée,
 * la même fonction que la connexion. Une seconde rédaction afficherait un droit
 * que le produit n'applique pas, ce qui est pire que de ne rien afficher.
 *
 * ⚠️ **Et cette route est une CONSULTATION SENSIBLE** : elle lit l'identité
 * d'une personne dans l'annuaire du groupe, sans son mot de passe et sans qu'elle
 * le sache. Elle est journalisée comme telle, avec le login demandé.
 */

import type { PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import type { PerimetreSession } from '../db/pool.js';
import { groupesAttendus, lireFilialesActives, lireProfilsActifs } from '../droits/groupes-ad.js';
import type { GroupeAttendu } from '../droits/groupes-ad.js';
import { DOMAINES } from '../droits/modele.js';
import { resoudreDroits } from '../droits/resolution.js';
import type { NiveauDroit } from '../droits/modele.js';

export interface EcartGroupe {
  readonly nom: string;
  readonly perimetre: string;
  readonly filialeCode: string | null;
  readonly profilCode: string | null;
  readonly description: string;
}

export interface CoherenceAnnuaire {
  /** L'annuaire est-il interrogeable ? `false` = `AUTH_LDAP_ACTIF=non`. */
  readonly annuaireDisponible: boolean;
  /** Vrai si la liste des groupes de l'annuaire a été tronquée : verdict non fiable. */
  readonly tronque: boolean;
  readonly prefixe: string;
  readonly comptes: {
    readonly attendus: number;
    readonly declares: number;
    readonly reels: number | null;
  };
  /** 🛑 Déclarés dans l'application, INTROUVABLES dans l'annuaire. */
  readonly declaresSansAnnuaire: readonly EcartGroupe[];
  /** Présents dans l'annuaire, non déclarés : ils n'accordent rien. */
  readonly annuaireSansDeclaration: readonly string[];
  /** Attendus par la convention, non déclarés dans l'application. */
  readonly attendusSansDeclaration: readonly EcartGroupe[];
  /** Attendus par la convention, absents de l'annuaire : à créer côté AD. */
  readonly aCreerDansAnnuaire: readonly EcartGroupe[];
}

/** Résultat brut de la lecture de l'annuaire, fourni par l'appelant. */
export interface LectureAnnuaire {
  readonly noms: readonly string[];
  readonly tronque: boolean;
}

export async function comparerAnnuaire(
  client: PoolClient,
  prefixe: string,
  lecture: LectureAnnuaire | undefined,
): Promise<CoherenceAnnuaire> {
  const filiales = await lireFilialesActives(client);
  const profils = await lireProfilsActifs(client);
  const attendus = groupesAttendus(prefixe, filiales, profils);

  const declares = await client.query<{
    nom: string;
    perimetre: string;
    filiale_code: string | null;
    profil_code: string | null;
    description: string | null;
    actif: boolean;
  }>(
    `select g."nom", g."perimetre", f."code" as filiale_code, p."code" as profil_code,
            g."description", g."actif"
       from "groupes_ad" g
       left join "filiales" f on f."id" = g."filiale_id"
       left join "profils"  p on p."id" = g."profil_id"
      where g."actif"
      order by g."nom"`,
  );

  // L'appariement se fait **en minuscules** : l'annuaire est insensible à la
  // casse, et l'unicité de `groupes_ad` l'est aussi (`uq_groupes_ad_nom` porte
  // `lower(nom)`). Comparer à la casse près inventerait des écarts.
  const clef = (n: string): string => n.trim().toLowerCase();
  const ensDeclares = new Set(declares.rows.map((g) => clef(g.nom)));
  const ensReels = lecture === undefined ? null : new Set(lecture.noms.map(clef));

  const decrire = (g: GroupeAttendu): EcartGroupe =>
    Object.freeze({
      nom: g.nom,
      perimetre: g.perimetre,
      filialeCode: filiales.find((f) => f.id === g.filialeId)?.code ?? null,
      profilCode: g.profilCode,
      description: g.description,
    });

  return Object.freeze({
    annuaireDisponible: lecture !== undefined,
    tronque: lecture?.tronque === true,
    prefixe,
    comptes: Object.freeze({
      attendus: attendus.length,
      declares: declares.rows.length,
      reels: lecture === undefined ? null : lecture.noms.length,
    }),
    declaresSansAnnuaire:
      ensReels === null
        ? []
        : declares.rows
            .filter((g) => !ensReels.has(clef(g.nom)))
            .map((g) =>
              Object.freeze({
                nom: g.nom,
                perimetre: g.perimetre,
                filialeCode: g.filiale_code,
                profilCode: g.profil_code,
                description: g.description ?? '',
              }),
            ),
    annuaireSansDeclaration:
      lecture === undefined ? [] : lecture.noms.filter((n) => !ensDeclares.has(clef(n))),
    attendusSansDeclaration: attendus.filter((g) => !ensDeclares.has(clef(g.nom))).map(decrire),
    aCreerDansAnnuaire:
      ensReels === null ? [] : attendus.filter((g) => !ensReels.has(clef(g.nom))).map(decrire),
  });
}

/* =====================================================================
 *  « Que verrait ce compte ? »
 * ===================================================================== */

export interface Simulation {
  readonly identifiant: string;
  /** `false` quand l'annuaire n'a rendu aucun compte pour ce login. */
  readonly trouve: boolean;
  readonly nomAffichage: string | null;
  readonly email: string | null;
  readonly service: string | null;
  readonly fonction: string | null;
  /** Le compte est-il désactivé dans l'annuaire ? Il n'entrerait pas. */
  readonly desactiveDansAnnuaire: boolean;
  /** Groupes portés par le compte et RECONNUS par `groupes_ad`. */
  readonly groupesReconnus: readonly string[];
  /** Groupes portés et ignorés — la cause n°1 d'un « je ne vois rien ». */
  readonly groupesIgnores: readonly string[];
  readonly portee: string;
  readonly filiales: readonly { readonly id: string; readonly code: string }[];
  readonly administrateur: boolean;
  readonly peutExporter: boolean;
  /** Niveau sur chacun des trente domaines. Un domaine absent est refusé. */
  readonly domaines: Readonly<Record<string, NiveauDroit>>;
  /** Vrai si le compte n'obtiendrait AUCUN périmètre : il entrerait sans rien voir. */
  readonly ouvreUnAcces: boolean;
  /** Ce que l'écran doit dire quand rien n'est ouvert. */
  readonly diagnostic: string;
}

export interface IdentiteSimulee {
  readonly login: string;
  readonly nomAffichage: string;
  readonly email: string | null;
  readonly service: string | null;
  readonly fonction: string | null;
  readonly desactive: boolean;
  readonly groupes: readonly string[];
}

export async function simuler(
  client: PoolClient,
  identifiantDemande: string,
  identite: IdentiteSimulee | null,
  perimetre: PerimetreSession,
): Promise<Simulation> {
  /* ⚠️ **La trace est écrite AVANT le verdict, et dans les deux cas.** Un login
   * introuvable est une information sur l'annuaire du groupe, et l'énumération
   * de logins est précisément ce que le contrôle S12 cherche à rendre coûteuse.
   * Ne journaliser que les succès laisserait le balayage sans trace. */
  await journaliser(client, {
    action: 'consultation_sensible',
    // ⚠️ `resume` est une phrase LITTÉRALE — `CONVENTIONS.md` §29.5. Le nom, le
    //    code et l'intitulé viennent de l'utilisateur : ils partent en `jsonb`, où
    //    l'encodage est le problème de PostgreSQL. Un groupe d'annuaire nommé avec
    //    un saut de ligne scinderait sinon une ligne de l'export du journal, pour
    //    trois ans.
    resume: 'Simulation des droits d’un compte d’annuaire.',
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'utilisateurs',
    valeursApres: { identifiant_demande: identifiantDemande, trouve: identite !== null },
  });

  if (identite === null) {
    return Object.freeze({
      identifiant: identifiantDemande,
      trouve: false,
      nomAffichage: null,
      email: null,
      service: null,
      fonction: null,
      desactiveDansAnnuaire: false,
      groupesReconnus: [],
      groupesIgnores: [],
      portee: 'filiale',
      filiales: [],
      administrateur: false,
      peutExporter: false,
      domaines: Object.freeze({}),
      ouvreUnAcces: false,
      diagnostic:
        'Aucun compte ne porte cet identifiant dans l’annuaire. Vérifiez l’orthographe du ' +
        'login (`sAMAccountName`), et que le compte se trouve bien sous la base de ' +
        'recherche configurée.',
    });
  }

  // La filiale préférée du compte, s'il s'est déjà connecté une fois.
  const connu = await client.query<{ filiale_defaut_id: string | null }>(
    `select "filiale_defaut_id" from "utilisateurs" where lower("identifiant") = lower($1)`,
    [identite.login],
  );

  const droits = await resoudreDroits(client, identite.groupes, {
    filialePreferee: connu.rows[0]?.filiale_defaut_id ?? null,
  });

  const codes = await client.query<{ id: string; code: string }>(
    `select "id", "code" from "filiales" where "id" = any($1::text[]) order by "code"`,
    [[...droits.filiales]],
  );

  const domaines: Record<string, NiveauDroit> = {};
  for (const nom of DOMAINES) {
    const niveau = droits.domaines.get(nom);
    if (niveau !== undefined) domaines[nom] = niveau;
  }

  const ouvre = droits.filiales.length > 0;
  const diagnostic = identite.desactive
    ? 'Ce compte est DÉSACTIVÉ dans l’annuaire : il ne peut pas ouvrir de session, quels ' +
      'que soient ses groupes.'
    : ouvre
      ? ''
      : droits.groupesIgnores.length > 0
        ? 'Ce compte n’obtiendrait AUCUN accès : aucun de ses groupes n’est déclaré dans ' +
          'l’application, ou tous sont désactivés. Les groupes portés et ignorés sont ' +
          'listés ci-contre — c’est la cause la plus fréquente d’un « je ne vois rien ».'
        : 'Ce compte n’obtiendrait AUCUN accès : il n’appartient à aucun groupe portant le ' +
          'préfixe du dispositif. Il faut l’ajouter au groupe d’annuaire correspondant à ' +
          'sa filiale et à son profil.';

  return Object.freeze({
    identifiant: identite.login,
    trouve: true,
    nomAffichage: identite.nomAffichage,
    email: identite.email,
    service: identite.service,
    fonction: identite.fonction,
    desactiveDansAnnuaire: identite.desactive,
    groupesReconnus: droits.groupesReconnus,
    groupesIgnores: droits.groupesIgnores,
    portee: droits.portee,
    filiales: codes.rows.map((f) => Object.freeze({ id: f.id, code: f.code })),
    administrateur: droits.administrateur,
    peutExporter: droits.peutExporter,
    domaines: Object.freeze(domaines),
    ouvreUnAcces: ouvre,
    diagnostic,
  });
}
