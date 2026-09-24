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
import { echapperValeur, filtreEgalite, substituerLogin } from './filtre-ldap.js';

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

/**
 * Ce que l'annuaire dit d'une personne qu'on CHERCHE — sans ses groupes.
 *
 * ⚠️ **Les appartenances n'y sont pas, et c'est délibéré** : les résoudre coûte
 * une recherche par groupe et par personne, imbrications comprises. Pour cent
 * résultats, c'est plusieurs milliers d'aller-retours LDAP — et l'écran qui les
 * affiche n'en a aucun besoin : il importe des FICHES D'ANNUAIRE, pas des accès.
 * Ce qu'une personne obtiendrait se demande une par une, par la simulation des
 * habilitations.
 */
export interface IdentiteBrute {
  readonly login: string;
  readonly nomAffichage: string;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly service: string | null;
  readonly fonction: string | null;
  readonly desactive: boolean;
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


  /**
   * Liste les groupes de l'annuaire dont le nom commence par le préfixe du
   * dispositif (`LDAP_PREFIXE_GROUPES`), **en lecture seule**.
   *
   * ── À quoi ça sert, et pourquoi ça manquait ────────────────────────────
   *
   * `groupes_ad` est l'autorité applicative : un groupe absent de la table
   * n'accorde rien, **même s'il existe dans l'annuaire** (`resolution.ts`). La
   * réciproque est tout aussi vraie et beaucoup plus coûteuse : un groupe
   * déclaré dans la table et **absent de l'annuaire** n'accorde rien non plus,
   * et personne ne peut le savoir — le compte entre, ne reçoit aucun droit, et
   * le seul symptôme est un utilisateur qui affirme « je ne vois rien ». C'est
   * le constat **Q-265** de la porte S7, où les guides envoyaient l'exploitant
   * vers un groupe d'annuaire qui n'existait pas.
   *
   * Cette méthode permet de confronter les deux listes. Elle ne décide de rien.
   *
   * ⚠️ **Elle n'écrit RIEN, et elle ne le pourra pas** : `ClientLdap` n'expose
   * que `lier`, `rechercher` et `fermer` — aucune opération d'écriture LDAP
   * n'est implémentée dans ce produit. L'arbitrage de l'utilisateur du
   * 22/09/2026 — *« on n'écrit jamais sur l'AD depuis ce logiciel »* — n'est
   * donc pas une promesse tenue par une revue de code : c'est une **capacité
   * absente**, et `test/habilitations/jamais-d-ecriture-ad.test.mjs` le mesure
   * sur le client lui-même.
   *
   * ⚠️ La borne est un **filet** : l'atteindre veut dire qu'on ne voit pas tout,
   * donc que la comparaison serait fausse dans le sens rassurant — « ce groupe
   * n'existe pas dans l'AD » alors qu'il est seulement au-delà de la borne.
   * Elle est donc SIGNALÉE à l'appelant, jamais avalée (motif Q-68).
   */
  public async listerGroupes(max = 2_000): Promise<{
    readonly noms: readonly string[];
    readonly tronque: boolean;
  }> {
    const client = await this.fabrique(this.ldap);
    try {
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);
      const entrees = await client.rechercher({
        base: this.ldap.baseRecherche,
        portee: 'sousArbre',
        // `objectClass=group` couvre Active Directory ; `groupOfNames` et
        // `posixGroup` couvrent les annuaires qui ne sont pas AD, que le §25
        // du `CONVENTIONS.md` n'exclut pas. Le préfixe est échappé : il vient
        // de la configuration, mais une valeur de configuration reste une
        // entrée, et un `*` non échappé y ferait un filtre bien plus large.
        filtre:
          '(&(|(objectClass=group)(objectClass=groupOfNames)(objectClass=posixGroup))' +
          `(cn=${echapperValeur(this.ldap.prefixeGroupes)}*))`,
        attributs: ['cn'],
        tailleMax: max,
        bornePleineEstTroncature: false,
      });
      const noms = entrees
        .map((e) => e.attributs.get('cn')?.[0] ?? nomCourtDuDn(e.dn))
        .filter((n) => n !== '')
        .sort((a, b) => a.localeCompare(b, 'fr'));
      return { noms, tronque: entrees.length >= max };
    } finally {
      await client.fermer();
    }
  }


  /**
   * Les comptes membres d'un groupe, **imbrications comprises**, en lecture
   * seule.
   *
   * ── Pourquoi le sens inverse de `resoudreGroupes()` était nécessaire ──────
   *
   * Tout le produit interroge l'annuaire **depuis une personne** : « à quels
   * groupes appartient-elle ? ». C'est ce dont l'authentification a besoin. Une
   * **revue des droits d'accès** (ISO 27001 A.5.18, et le même geste attendu par
   * NIS2) pose la question inverse : « qui appartient à ce groupe ? ». Aucune
   * réponse ne se déduit de l'autre, et le produit n'en détenait aucune des
   * deux — il ne garde pas les appartenances, il les résout à chaque connexion.
   *
   * ⚠️ **L'imbrication est suivie, et ce n'est pas un raffinement.** Une revue
   * qui ne verrait que les membres DIRECTS oublierait précisément les personnes
   * qu'un groupe imbriqué fait entrer — c'est le cas éprouvé à la porte S3
   * (`equipe-secu-tls` dans `GRC-TLS-RSSI`), et une revue incomplète est pire
   * qu'une revue absente : elle atteste que rien n'a été trouvé.
   *
   * Le garde est celui de `resoudreGroupes()`, à l'identique : un ensemble de
   * noms distinctifs déjà vus, jamais une borne de profondeur — une borne de
   * profondeur sur un cycle explore exponentiellement avant de s'arrêter.
   *
   * ⚠️ **Elle n'écrit rien, et le produit ne le pourra jamais** : `ClientLdap`
   * n'implémente que `lier`, `rechercher` et `fermer`. Retirer quelqu'un d'un
   * groupe est un geste d'administrateur d'annuaire — le produit constate et
   * consigne, il n'exécute pas.
   */
  public async membresDuGroupe(
    nomGroupe: string,
    max = 500,
  ): Promise<{
    readonly membres: readonly { readonly login: string; readonly nom: string;
                                 readonly desactive: boolean; readonly indirect: boolean }[];
    readonly tronque: boolean;
    readonly groupeTrouve: boolean;
  }> {
    const client = await this.fabrique(this.ldap);
    try {
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);

      const groupes = await client.rechercher({
        base: this.ldap.baseRecherche,
        portee: 'sousArbre',
        filtre: `(&(objectClass=*)(cn=${echapperValeur(nomGroupe)}))`,
        attributs: ['cn', 'member'],
        tailleMax: 2,
      });
      const racine = groupes[0];
      if (racine === undefined) {
        return { membres: [], tronque: false, groupeTrouve: false };
      }

      const vus = new Set<string>();
      const membres = new Map<string, { login: string; nom: string; desactive: boolean;
                                        indirect: boolean }>();
      // File de (dn, indirect) : un membre atteint par un groupe intermédiaire
      // est INDIRECT, et l'écran doit le dire — c'est la moitié de la revue que
      // personne ne voit sans le nommer.
      let file: { dn: string; indirect: boolean }[] =
        (racine.attributs.get('member') ?? []).map((dn) => ({ dn, indirect: false }));
      let tronque = false;

      while (file.length > 0) {
        const suivant: { dn: string; indirect: boolean }[] = [];
        for (const { dn, indirect } of file) {
          const cle = dn.trim().toLowerCase();
          if (vus.has(cle)) continue;
          if (vus.size >= max) { tronque = true; break; }
          vus.add(cle);

          const entrees = await client.rechercher({
            base: dn,
            portee: 'base',
            filtre: '(objectClass=*)',
            attributs: [
              this.ldap.attributIdentifiant,
              'cn',
              'displayName',
              'member',
              'objectClass',
              'userAccountControl',
            ],
            tailleMax: 1,
          });
          const entree = entrees[0];
          if (entree === undefined) continue;

          const classes = (entree.attributs.get('objectclass') ?? []).map((c) => c.toLowerCase());
          const estGroupe =
            classes.includes('group') ||
            classes.includes('groupofnames') ||
            classes.includes('posixgroup');

          if (estGroupe) {
            if (!this.ldap.groupesImbriques) continue;
            for (const sousDn of entree.attributs.get('member') ?? []) {
              suivant.push({ dn: sousDn, indirect: true });
            }
            continue;
          }

          const login = premier(entree, this.ldap.attributIdentifiant);
          if (login === null) continue;
          const brut = premier(entree, 'userAccountControl');
          const desactive =
            brut !== null && (Number.parseInt(brut, 10) & BIT_COMPTE_DESACTIVE) !== 0;
          // Un compte atteint DEUX FOIS — directement et par un groupe imbriqué —
          // compte comme direct : c'est ce qui décrit son accès le plus court.
          const deja = membres.get(login.toLowerCase());
          membres.set(login.toLowerCase(), {
            login,
            nom: premier(entree, 'displayName') ?? premier(entree, 'cn') ?? login,
            desactive,
            indirect: deja === undefined ? indirect : deja.indirect && indirect,
          });
        }
        if (tronque) break;
        file = suivant;
      }

      return {
        membres: [...membres.values()].sort((a, b) => a.login.localeCompare(b.login, 'fr')),
        tronque,
        groupeTrouve: true,
      };
    } finally {
      await client.fermer();
    }
  }


  /**
   * Cherche des PERSONNES dans l'annuaire, **en lecture seule**.
   *
   * ── À quoi ça sert, et ce que ça remplace ─────────────────────────────────
   *
   * `synchroniserAnnuaire()` (lot L3) aligne déjà la fiche `personnes` de
   * quiconque **ouvre une session**, depuis ce que l'annuaire dit de lui. C'est
   * juste, et c'est insuffisant : un salarié qui ne se connecte jamais — la
   * plupart — n'apparaît jamais dans l'annuaire du produit, et les champs
   * « Responsable » continuent de s'écrire à la main, avec les homonymes et les
   * fautes de frappe que cela suppose.
   *
   * Utilisateur, 22/09/2026 : *« je voulais que les gens cités ici soient
   * également les comptes AD des gens, car au final le personnel en vrai ce sont
   * aussi les salariés. »*
   *
   * ⚠️ **ELLE NE RAPATRIE PAS L'ANNUAIRE ENTIER, et c'est une décision.**
   * Importer tout l'AD, c'est importer les données personnelles de gens qui ne
   * sont **pas** utilisateurs de l'outil — `personnes.nom`, `email` et
   * `telephone` sont au registre de l'article 30 du produit. La recherche exige
   * donc un **filtre** et rend au plus `max` résultats : on importe les personnes
   * DÉSIGNABLES, celles qui peuvent porter une responsabilité, pas un annuaire.
   *
   * ⚠️ **Elle n'écrit rien dans l'annuaire, et le produit ne le pourra jamais** :
   * `ClientLdap` n'implémente que `lier`, `rechercher` et `fermer`.
   *
   * @param texte  ce que l'utilisateur cherche — nom, prénom, login, service.
   * @param base   unité d'organisation à interroger, ou `null` pour la base
   *               configurée. C'est ainsi qu'on cible le personnel d'un site.
   */
  public async rechercherPersonnes(
    texte: string,
    base: string | null,
    max = 100,
  ): Promise<{
    readonly personnes: readonly IdentiteBrute[];
    readonly tronque: boolean;
  }> {
    const motif = texte.trim();
    if (motif === '') return { personnes: [], tronque: false };

    const client = await this.fabrique(this.ldap);
    try {
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);
      const echappe = echapperValeur(motif);
      const entrees = await client.rechercher({
        // ⚠️ Une base fournie par l'appelant est une ENTRÉE : elle est employée
        // telle quelle par le protocole (elle ne se concatène dans aucun filtre),
        // et l'annuaire refuse lui-même un nom distinctif qui n'existe pas.
        base: base !== null && base.trim() !== '' ? base.trim() : this.ldap.baseRecherche,
        portee: 'sousArbre',
        // Les quatre champs par lesquels on cherche quelqu'un dans la vraie vie.
        // ⚠️ `objectCategory=person` écarte les groupes et les contacts : sans
        // lui, importer « compta » rapporterait le GROUPE « compta » comme une
        // personne, et l'annuaire du produit se remplirait de listes de diffusion.
        filtre:
          '(&(objectCategory=person)(|' +
          `(${this.ldap.attributIdentifiant}=*${echappe}*)` +
          `(displayName=*${echappe}*)(sn=*${echappe}*)(department=*${echappe}*)))`,
        attributs: [
          this.ldap.attributIdentifiant,
          ...this.ldap.attributsProfil,
          'userAccountControl',
        ],
        tailleMax: max,
        bornePleineEstTroncature: false,
      });

      const personnes: IdentiteBrute[] = [];
      for (const entree of entrees) {
        const login = premier(entree, this.ldap.attributIdentifiant);
        if (login === null) continue;
        const brut = premier(entree, 'userAccountControl');
        personnes.push({
          login,
          nomAffichage:
            premier(entree, 'displayName') ??
            [premier(entree, 'givenName'), premier(entree, 'sn')].filter(Boolean).join(' ') ??
            login,
          email: premier(entree, 'mail'),
          telephone: premier(entree, 'telephoneNumber'),
          service: premier(entree, 'department'),
          fonction: premier(entree, 'title'),
          desactive: brut !== null && (Number.parseInt(brut, 10) & BIT_COMPTE_DESACTIVE) !== 0,
        });
      }
      personnes.sort((a, b) => a.nomAffichage.localeCompare(b.nomAffichage, 'fr'));
      return { personnes, tronque: entrees.length >= max };
    } finally {
      await client.fermer();
    }
  }

  /**
   * Les **unités d'organisation** de l'annuaire, pour PROPOSER des filiales.
   *
   * ⚠️ **C'est une SUGGESTION, jamais un import.** L'annuaire n'a aucune notion
   * de filiale : il a des unités d'organisation, des sites, des domaines et un
   * attribut `company`, et chaque client encode son organisation dans l'un de ces
   * quatre. Faire dépendre le **cloisonnement** — la propriété de sécurité
   * centrale du produit — d'une convention de nommage que personne ne contrôle
   * serait la rendre fragile par construction. Un humain choisit, et complète le
   * code, le pays et la raison sociale exacte.
   *
   * 🛑 **`company` A ÉTÉ ÉCARTÉ, et le motif vaut d'être lu.** C'est l'attribut
   * qui porte le plus souvent la raison sociale — mais le relever exigerait de
   * parcourir les entrées **de personnes**, par milliers, pour en extraire une
   * valeur distincte. Ce serait une lecture de masse de données personnelles
   * pour une commodité de saisie, c'est-à-dire l'inverse de la minimisation que
   * le produit s'impose à lui-même (article 5.1.c, registre de l'article 30 du
   * produit). Une unité d'organisation, elle, n'est pas une donnée personnelle.
   *
   * ⚠️ **Lecture seule**, comme tout ce que ce client sait faire : il n'implémente
   * que `lier`, `rechercher`, `fermer`.
   */
  public async unitesOrganisation(
    base: string | null,
    max = 200,
  ): Promise<{
    readonly unites: readonly { readonly nom: string; readonly dn: string; readonly description: string | null }[];
    readonly tronque: boolean;
  }> {
    const client = await this.fabrique(this.ldap);
    try {
      await client.lier(this.ldap.dnService, this.ldap.motDePasseService);
      const entrees = await client.rechercher({
        // Une base fournie par l'appelant est une ENTRÉE : elle est employée telle
        // quelle par le protocole — elle ne se concatène dans aucun filtre — et
        // l'annuaire refuse lui-même un nom distinctif qui n'existe pas.
        base: base !== null && base.trim() !== '' ? base.trim() : this.ldap.baseRecherche,
        portee: 'sousArbre',
        filtre: '(objectClass=organizationalUnit)',
        attributs: ['ou', 'description'],
        tailleMax: max,
        bornePleineEstTroncature: false,
      });
      const unites = entrees
        .map((e) => ({
          nom: e.attributs.get('ou')?.[0] ?? nomCourtDuDn(e.dn),
          dn: e.dn,
          description: premier(e, 'description'),
        }))
        .filter((u) => u.nom !== '')
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      return { unites, tronque: entrees.length >= max };
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
      // La borne vaut ATTENTE et non filet : deux entrées signalent un doublon
      // d'annuaire, qui est traité juste en dessous. La troncature, elle, reste
      // détectée par le code de résultat, qui ne dépend pas de ce choix.
      tailleMax: 2,
      bornePleineEstTroncature: false,
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
      // Ici la borne est un FILET DE SÉCURITÉ : l'atteindre veut dire qu'on n'a pas
      // tout vu, donc qu'on rendrait des appartenances incomplètes (constat Q-68).
      tailleMax: GROUPES_MAX,
      bornePleineEstTroncature: true,
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
