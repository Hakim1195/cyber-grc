/**
 * L'annuaire, vu par l'application : vérifier des identifiants, lire une
 * identité, et **résoudre les appartenances de groupe, imbrications comprises**.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les groupes imbriqués, et pourquoi ce n'est pas un détail
 * ════════════════════════════════════════════════════════════════════════
 *
 * `PLAN_SERVEUR` §3.4, dernière ligne : « les groupes imbriqués doivent être
 * résolus récursivement, une appartenance indirecte devant être reconnue ». Un
 * annuaire d'entreprise range presque toujours les gens dans des groupes
 * métier, eux-mêmes membres des groupes applicatifs : ne regarder que
 * l'appartenance directe, c'est refuser l'accès à la moitié des utilisateurs
 * légitimes — et le découvrir en production.
 *
 * ⚠️ **Une imbrication circulaire est légale en Active Directory** (A membre de
 * B, B membre de A). Une résolution récursive naïve s'y fige : le service
 * cesse de répondre à la première connexion, sans message. La parade est ici un
 * ensemble de noms distinctifs **déjà visités**, comparés en minuscules, et
 * trois bornes — profondeur, nombre de groupes, nombre de recherches. Le
 * contrat de doublure (`CONVENTIONS.md` §25.2, comportement D3) impose un cycle
 * précisément pour que cette parade soit éprouvée et non supposée.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Deux façons de lire une appartenance, et pourquoi les deux sont là
 * ════════════════════════════════════════════════════════════════════════
 *
 * Active Directory publie `memberOf` sur chaque objet ; d'autres annuaires — et
 * une doublure d'essai qui n'aurait pas à imiter AD jusque-là — ne portent que
 * `member` sur le groupe. Les deux chemins sont donc implémentés : `memberOf`
 * d'abord, puis, s'il ne rend rien pour cet objet, une recherche
 * `(member=<dn>)` sous la racine configurée.
 *
 * Ce n'est **pas** une précaution de confort : le contrat §25.4 laisse
 * explicitement à l'autre agent le choix de ce qu'il implémente. Coder contre
 * une seule des deux formes, c'est parier sur une décision qu'on n'a pas prise.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce module ne fait pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il ne consulte **aucune** table, n'ouvre **aucune** session et ne décide
 * **aucun** droit. Il rend ce que l'annuaire dit. La traduction en périmètre et
 * en profil est le travail de `src/droits/`, qui lit `groupes_ad` — c'est-à-dire
 * une décision du groupe, pas une chaîne de caractères venue du réseau.
 */

import type { ConfigurationLdap } from '../config/index.js';

import { ClientLdap, ErreurAnnuaire, ErreurIdentifiants } from './client-ldap.js';
import type { Annuaire, EntreeLdap } from './client-ldap.js';
import { filtreEgalite, substituerLogin } from './filtre-ldap.js';

/* =====================================================================
 *  Bornes de la résolution
 * ===================================================================== */

/** Profondeur d'imbrication explorée. Au-delà, l'annuaire est mal rangé. */
const PROFONDEUR_MAX = 12;
/** Groupes distincts retenus pour un utilisateur (contrôle S13). */
const GROUPES_MAX = 250;
/** Recherches émises pour résoudre un seul utilisateur. */
const RECHERCHES_MAX = 300;

/** Bit `ACCOUNTDISABLE` de `userAccountControl` (Active Directory). */
const BIT_COMPTE_DESACTIVE = 0x0002;

/* =====================================================================
 *  Ce que l'annuaire dit d'une personne
 * ===================================================================== */

export interface IdentiteAnnuaire {
  /** `sAMAccountName`, tel que l'utilisateur l'a saisi et que l'annuaire l'a confirmé. */
  readonly login: string;
  readonly dn: string;
  readonly nomAffichage: string;
  readonly nom: string | null;
  readonly prenom: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly service: string | null;
  readonly fonction: string | null;
  readonly upn: string | null;
  /** `objectSid` sous sa forme lisible, ou `null` si l'annuaire ne le publie pas. */
  readonly sid: string | null;
  /** Le compte est-il désactivé côté annuaire (`userAccountControl`, bit 2) ? */
  readonly desactive: boolean;
  /** Noms courts des groupes retenus (préfixe configuré), imbrications comprises. */
  readonly groupes: readonly string[];
  /** Nombre total de groupes traversés, y compris hors préfixe. Pour le journal. */
  readonly groupesTraverses: number;
}

/** Ouvre une connexion à l'annuaire. Remplaçable par le banc d'essai. */
export type FabriqueClient = (ldap: ConfigurationLdap) => Promise<Annuaire>;

const fabriqueParDefaut: FabriqueClient = (ldap) =>
  ClientLdap.connecter({
    url: ldap.url,
    ca: ldap.ca,
    verifierCertificat: ldap.verifierCertificat,
    delaiMs: ldap.delaiMs,
  });

/* =====================================================================
 *  Utilitaires de noms distinctifs
 * ===================================================================== */

/**
 * Extrait le nom court d'un nom distinctif : `CN=GRC-TLS-RSSI,OU=…` → `GRC-TLS-RSSI`.
 * Tient compte des virgules échappées (`\,`), qui sont légales dans un RDN.
 */
export function nomCourtDuDn(dn: string): string {
  let separateur = -1;
  for (let i = 0; i < dn.length; i += 1) {
    if (dn[i] === ',' && dn[i - 1] !== '\\') {
      separateur = i;
      break;
    }
  }
  const premier = separateur < 0 ? dn : dn.slice(0, separateur);
  const egal = premier.indexOf('=');
  return (egal < 0 ? premier : premier.slice(egal + 1)).replace(/\\,/g, ',').trim();
}

/** Clé de comparaison d'un DN : insensible à la casse, comme l'annuaire. */
function cleDn(dn: string): string {
  return dn.trim().toLowerCase();
}

/**
 * Convertit un `objectSid` binaire en sa forme `S-1-5-21-…`.
 * Rend `null` sur toute anomalie : un identifiant stable à moitié lu ne vaut
 * pas mieux que pas d'identifiant du tout, et il serait, lui, unique.
 */
export function sidLisible(brut: Buffer | undefined): string | null {
  if (brut === undefined || brut.length < 8) return null;
  const revision = brut[0];
  const nombreSousAutorites = brut[1];
  if (revision === undefined || nombreSousAutorites === undefined) return null;
  if (brut.length !== 8 + nombreSousAutorites * 4) return null;

  let autorite = 0;
  for (let i = 2; i < 8; i += 1) autorite = autorite * 256 + (brut[i] ?? 0);

  const morceaux = [`S-${revision}`, `${autorite}`];
  for (let i = 0; i < nombreSousAutorites; i += 1) {
    morceaux.push(String(brut.readUInt32LE(8 + i * 4)));
  }
  return morceaux.join('-');
}

function premier(entree: EntreeLdap, attribut: string): string | null {
  const valeurs = entree.attributs.get(attribut.toLowerCase());
  const valeur = valeurs?.[0];
  return valeur === undefined || valeur === '' ? null : valeur;
}

/* =====================================================================
 *  Le service
 * ===================================================================== */

export class ServiceAnnuaire {
  private readonly ldap: ConfigurationLdap;
  private readonly fabrique: FabriqueClient;

  constructor(ldap: ConfigurationLdap, fabrique: FabriqueClient = fabriqueParDefaut) {
    this.ldap = ldap;
    this.fabrique = fabrique;
  }

  /**
   * Vérifie des identifiants et rend l'identité résolue.
   *
   * Cinq étapes, dans cet ordre, et l'ordre compte :
   *  1. liaison du **compte de service** (lecture seule) ;
   *  2. recherche de l'utilisateur par `LDAP_FILTRE_UTILISATEUR`, `{login}`
   *     substitué **et échappé** ;
   *  3. liaison sous le nom distinctif trouvé, avec le mot de passe présenté —
   *     c'est **là** que le mot de passe est vérifié, par l'annuaire ;
   *  4. retour au compte de service : la suite lit des groupes, et elle doit le
   *     faire avec les droits du service, pas avec ceux de l'utilisateur — un
   *     compte bridé rendrait un périmètre amputé au lieu d'une erreur ;
   *  5. résolution des groupes, imbrications comprises.
   *
   * Un compte introuvable et un mot de passe faux lèvent **la même** erreur :
   * distinguer les deux dirait à un attaquant quels logins existent (S12).
   */
  public async authentifier(login: string, motDePasse: string): Promise<IdentiteAnnuaire> {
    const client = await this.fabrique(this.ldap);
    try {
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);

      const entree = await this.chercherUtilisateur(client, login);
      if (entree === null) throw new ErreurIdentifiants('aucun compte ne correspond au login');

      await client.lier(entree.dn, motDePasse);
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);

      return await this.construireIdentite(client, login, entree);
    } finally {
      await client.fermer();
    }
  }

  /**
   * Relit une identité **sans mot de passe**, sous le seul compte de service.
   *
   * C'est le mécanisme du déprovisionnement immédiat (`PLAN_SERVEUR` §1.5) : un
   * compte désactivé ou retiré de ses groupes doit perdre l'accès **sans
   * attendre sa prochaine connexion**, qui n'aura peut-être jamais lieu. Rend
   * `null` si le compte a disparu de l'annuaire.
   */
  public async relire(login: string): Promise<IdentiteAnnuaire | null> {
    const client = await this.fabrique(this.ldap);
    try {
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);
      const entree = await this.chercherUtilisateur(client, login);
      if (entree === null) return null;
      return await this.construireIdentite(client, login, entree);
    } finally {
      await client.fermer();
    }
  }

  /* ---- Étapes ------------------------------------------------------- */

  private async chercherUtilisateur(
    client: Annuaire,
    login: string,
  ): Promise<EntreeLdap | null> {
    const entrees = await client.rechercher({
      base: this.ldap.baseRecherche,
      portee: 'sousArbre',
      filtre: substituerLogin(this.ldap.filtreUtilisateur, login),
      attributs: [
        this.ldap.attributIdentifiant,
        ...this.ldap.attributsProfil,
        'memberOf',
        'userAccountControl',
        'userPrincipalName',
        'objectSid',
      ],
      tailleMax: 2,
    });

    if (entrees.length === 0) return null;
    if (entrees.length > 1) {
      // Deux comptes pour un login : l'annuaire est incohérent, ou le filtre est
      // trop large. Choisir « le premier » ferait dépendre l'identité de l'ordre de
      // parcours de l'annuaire. On refuse.
      throw new ErreurAnnuaire(
        `le filtre utilisateur rend ${entrees.length} entrées pour un seul login : ambiguïté refusée`,
      );
    }
    return entrees[0] ?? null;
  }

  private async construireIdentite(
    client: Annuaire,
    loginSaisi: string,
    entree: EntreeLdap,
  ): Promise<IdentiteAnnuaire> {
    const controle = premier(entree, 'userAccountControl');
    const drapeaux = controle === null ? 0 : Number.parseInt(controle, 10);
    const desactive = Number.isFinite(drapeaux) && (drapeaux & BIT_COMPTE_DESACTIVE) !== 0;

    const { retenus, traverses } = await this.resoudreGroupes(client, entree);

    const nom = premier(entree, 'sn');
    const prenom = premier(entree, 'givenName');
    const affichage =
      premier(entree, 'displayName') ??
      [prenom, nom].filter((p) => p !== null).join(' ').trim();

    return {
      // Le login retenu est celui que l'ANNUAIRE porte, pas celui qui a été saisi :
      // l'AD est insensible à la casse, et « Dupont » ne doit pas créer un second
      // compte à côté de « dupont ». Repli sur la saisie si l'attribut manque.
      login: premier(entree, this.ldap.attributIdentifiant) ?? loginSaisi,
      dn: entree.dn,
      nomAffichage: affichage === '' ? loginSaisi : affichage,
      nom,
      prenom,
      email: premier(entree, 'mail'),
      telephone: premier(entree, 'telephoneNumber'),
      service: premier(entree, 'department'),
      fonction: premier(entree, 'title'),
      upn: premier(entree, 'userPrincipalName'),
      sid: sidLisible(entree.attributsBruts.get('objectsid')?.[0]),
      desactive,
      groupes: retenus,
      groupesTraverses: traverses,
    };
  }

  /**
   * Parcours en largeur des appartenances, avec garde de cycle.
   *
   * Le garde n'est pas une borne de profondeur — une borne de profondeur sur un
   * cycle produit une exploration exponentielle avant de s'arrêter. C'est
   * l'ensemble `vus` qui coupe : un nom distinctif déjà traité n'est jamais
   * réexploré, quelle que soit la route par laquelle on y revient.
   */
  private async resoudreGroupes(
    client: Annuaire,
    utilisateur: EntreeLdap,
  ): Promise<{ retenus: readonly string[]; traverses: number }> {
    const prefixe = this.ldap.prefixeGroupes.toUpperCase();
    const vus = new Set<string>();
    const noms = new Map<string, string>();
    let recherches = 0;

    let courant = await this.appartenances(client, utilisateur, () => (recherches += 1));
    let profondeur = 0;

    while (courant.length > 0 && profondeur < PROFONDEUR_MAX) {
      const suivant: string[] = [];

      for (const dn of courant) {
        const cle = cleDn(dn);
        if (vus.has(cle)) continue; // ← la coupure du cycle (D3)
        if (vus.size >= GROUPES_MAX) {
          throw new ErreurAnnuaire(
            `plus de ${GROUPES_MAX} groupes pour un seul compte : résolution interrompue (S13)`,
          );
        }
        vus.add(cle);
        noms.set(cle, nomCourtDuDn(dn));

        if (!this.ldap.groupesImbriques) continue;
        if (recherches >= RECHERCHES_MAX) {
          throw new ErreurAnnuaire(
            `plus de ${RECHERCHES_MAX} recherches pour un seul compte : résolution interrompue (S13)`,
          );
        }

        const groupe = await this.lireGroupe(client, dn, () => (recherches += 1));
        if (groupe === null) continue;
        // Le nom court vient de l'entrée quand elle en porte un : plus fiable que le DN.
        noms.set(cle, premier(groupe, 'cn') ?? noms.get(cle) ?? nomCourtDuDn(dn));
        suivant.push(...(await this.appartenances(client, groupe, () => (recherches += 1))));
      }

      courant = suivant;
      profondeur += 1;
    }

    const retenus = [...vus]
      .map((cle) => noms.get(cle) ?? '')
      .filter((nom) => nom !== '' && nom.toUpperCase().startsWith(prefixe))
      .sort((a, b) => a.localeCompare(b, 'fr'));

    return { retenus: [...new Set(retenus)], traverses: vus.size };
  }

  /** Appartenances directes d'un objet : `memberOf`, puis, à défaut, `(member=<dn>)`. */
  private async appartenances(
    client: Annuaire,
    objet: EntreeLdap,
    compter: () => void,
  ): Promise<readonly string[]> {
    const declarees = objet.attributs.get('memberof') ?? [];
    if (declarees.length > 0) return declarees;

    compter();
    const groupes = await client.rechercher({
      base: this.ldap.baseRecherche,
      portee: 'sousArbre',
      filtre: filtreEgalite('member', objet.dn),
      attributs: ['cn', 'memberOf'],
      tailleMax: GROUPES_MAX,
    });
    return groupes.map((g) => g.dn);
  }

  /** Lit un groupe par son nom distinctif. `null` s'il a disparu entre-temps. */
  private async lireGroupe(
    client: Annuaire,
    dn: string,
    compter: () => void,
  ): Promise<EntreeLdap | null> {
    compter();
    // ⚠️ AUCUN « catch » ici, et c'est délibéré. La tentation est forte : « un groupe
    // illisible n'est pas une panne, le compte de service ne voit pas toute la forêt ».
    // Elle est fausse dans le seul cas qui compte — si l'annuaire tombe au milieu de la
    // résolution, avaler l'erreur rend un ENSEMBLE DE GROUPES PARTIEL, donc un périmètre
    // amputé, en silence, et l'utilisateur travaille dans un périmètre faux sans que rien
    // ne l'annonce. Un groupe réellement absent n'est PAS une erreur : `rechercher` rend
    // un tableau vide sur le code 32 (objectInexistant), et c'est ce cas-là qui donne
    // `null` ci-dessous.
    const entrees = await client.rechercher({
      base: dn,
      portee: 'base',
      filtre: '(objectClass=*)',
      attributs: ['cn', 'memberOf'],
      tailleMax: 1,
    });
    return entrees[0] ?? null;
  }
}
