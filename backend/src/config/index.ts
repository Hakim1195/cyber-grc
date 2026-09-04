/**
 * Configuration du serveur Cyber GRC — chargement et validation.
 *
 * Trois règles, tirées du cadrage (`docs/PLAN_SERVEUR.md`) :
 *
 *  1. **Aucun secret dans le dépôt** (§1.9). Toute valeur vient de
 *     l'environnement : `/etc/cyber-grc/env` chargé par systemd en production,
 *     `backend/.env` en développement. Le modèle documenté est `.env.example`.
 *
 *  2. **Aucune valeur propre au client codée en dur** (§0.5). Les valeurs par
 *     défaut ci-dessous sont celles du *socle produit* ; le déploiement les
 *     surcharge. Ce qui est propre au client (URL, DN de l'annuaire, préfixe
 *     des groupes AD, relais SMTP) n'a volontairement pas de valeur par défaut
 *     utilisable telle quelle.
 *
 *  3. **Échec explicite** : une variable requise absente, un chemin relatif,
 *     un mot de passe manquant en production ne laissent pas démarrer le
 *     serveur. Tous les problèmes sont énumérés d'un coup — corriger une
 *     configuration en dix redémarrages successifs est une perte de temps.
 *
 * Ce module ne produit aucun effet de bord à l'import : il faut appeler
 * `chargerConfiguration()`. C'est `serveur.ts` qui décide quoi faire de
 * l'erreur, et lui seul écrit sur la sortie d'erreur.
 */

import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, normalize, sep } from 'node:path';

/* =====================================================================
 *  Types de la configuration
 * ===================================================================== */

export type Environnement = 'production' | 'recette' | 'developpement';
export type NiveauJournal = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
export type ModeSslBase = 'desactive' | 'requis' | 'verifie-ca';
export type ChiffrementSmtp = 'starttls' | 'tls' | 'aucun';
export type ModeAuthSmtp = 'aucun' | 'basique' | 'oauth2';

export interface ConfigurationServeur {
  readonly port: number;
  readonly hote: string;
  readonly urlPublique: string;
  /** Adresse du reverse proxy de confiance, ou `false` si aucun en-tête `X-Forwarded-*` n'est cru. */
  readonly proxyDeConfiance: string | boolean;
  readonly tailleMaxCorpsOctets: number;
  readonly niveauJournal: NiveauJournal;
  readonly delaiArretMs: number;
}

export interface ConfigurationBase {
  readonly hote: string;
  readonly port: number;
  readonly nom: string;
  readonly utilisateur: string;
  readonly motDePasse: string;
  readonly ssl: { readonly mode: ModeSslBase; readonly ca: string | null };
  readonly poolMax: number;
  readonly delaiConnexionMs: number;
  readonly delaiInactiviteMs: number;
  readonly delaiRequeteMs: number;
  readonly delaiTransactionInactiveMs: number;
  readonly delaiVerrouMs: number;
  /** Visible dans `pg_stat_activity` — indispensable pour attribuer une requête lente. */
  readonly nomApplication: string;
  /**
   * Compte propriétaire du schéma, réservé aux migrations du lot L1
   * (`backend/db/CONVENTIONS.md` §14). Le service ne s'en sert jamais.
   */
  readonly proprietaire: { readonly utilisateur: string; readonly motDePasse: string } | null;
}

export interface ConfigurationSession {
  readonly secret: string;
  readonly dureeInactiviteMinutes: number;
  readonly dureeMaximaleHeures: number;
  readonly nomCookie: string;
  readonly cookieSecurise: boolean;
}

export interface ConfigurationLdap {
  readonly url: string;
  readonly ca: string | null;
  readonly verifierCertificat: boolean;
  readonly dnService: string;
  readonly motDePasseService: string;
  readonly baseRecherche: string;
  readonly filtreUtilisateur: string;
  readonly attributIdentifiant: string;
  readonly attributsProfil: readonly string[];
  readonly prefixeGroupes: string;
  readonly groupesImbriques: boolean;
  readonly delaiMs: number;
}

export interface ConfigurationAuth {
  readonly ldapActif: boolean;
  readonly ldap: ConfigurationLdap | null;
  /** Compte de secours applicatif, indépendant de l'AD (§0.3). `null` = désactivé. */
  readonly compteSecours: { readonly identifiant: string; readonly empreinte: string } | null;
  readonly maxTentatives: number;
  readonly dureeVerrouillageMinutes: number;
}

export interface ConfigurationSmtp {
  readonly actif: boolean;
  readonly hote: string;
  readonly port: number;
  readonly chiffrement: ChiffrementSmtp;
  readonly modeAuth: ModeAuthSmtp;
  readonly utilisateur: string;
  readonly motDePasse: string;
  readonly oauth: { readonly tenant: string; readonly clientId: string; readonly clientSecret: string };
  readonly expediteur: string;
  readonly nomExpediteur: string;
  /** Recette uniquement : toutes les notifications sont réécrites vers cette adresse (§1.10). */
  readonly redirectionRecette: string | null;
}

export interface ConfigurationChemins {
  readonly piecesJointes: string;
  readonly quarantaine: string;
  readonly temporaire: string;
  readonly frontend: string;
  readonly configSpecifique: string;
  readonly sauvegardes: string;
}

export interface ConfigurationPiecesJointes {
  readonly tailleMaxOctets: number;
  readonly quotaFilialeOctets: number;
  readonly clamavActif: boolean;
  readonly clamavSocket: string;
  readonly clamavDelaiMs: number;
}

export interface ConfigurationRetention {
  readonly journalJours: number;
  readonly donneesJours: number;
}

export interface Configuration {
  readonly environnement: Environnement;
  readonly version: string;
  readonly serveur: ConfigurationServeur;
  readonly base: ConfigurationBase;
  readonly session: ConfigurationSession;
  readonly auth: ConfigurationAuth;
  readonly smtp: ConfigurationSmtp;
  readonly chemins: ConfigurationChemins;
  readonly piecesJointes: ConfigurationPiecesJointes;
  readonly retention: ConfigurationRetention;
  /**
   * Anomalies non bloquantes : le serveur démarre, mais elles sont journalisées
   * à chaque démarrage. Typiquement une configuration de recette laissée en
   * production, ou un contrôle affaibli.
   */
  readonly avertissements: readonly string[];
}

/* =====================================================================
 *  Erreur de configuration
 * ===================================================================== */

/** Levée quand la configuration est inutilisable. Porte la liste complète des problèmes. */
export class ErreurConfiguration extends Error {
  public readonly problemes: readonly string[];

  constructor(problemes: readonly string[]) {
    super(`Configuration invalide (${problemes.length} problème(s)) : ${problemes.join(' · ')}`);
    this.name = 'ErreurConfiguration';
    this.problemes = problemes;
  }
}

/* =====================================================================
 *  Lecture typée de l'environnement
 * ===================================================================== */

interface OptionsTexte {
  readonly defaut?: string;
  readonly requis?: boolean;
  readonly attendu?: string;
  readonly motif?: RegExp;
}

interface OptionsEntier {
  readonly defaut?: number;
  readonly requis?: boolean;
  readonly min?: number;
  readonly max?: number;
}

interface OptionsChemin {
  readonly defaut?: string;
  readonly requis?: boolean;
  readonly doitExister?: boolean;
}

/**
 * Lecteur accumulateur : chaque lecture invalide ajoute un problème au lieu de
 * lever immédiatement, pour rendre d'un coup la liste complète des corrections.
 */
class LecteurEnvironnement {
  public readonly problemes: string[] = [];
  public readonly avertissements: string[] = [];

  constructor(private readonly source: NodeJS.ProcessEnv) {}

  /** Valeur brute, espaces retirés ; une chaîne vide vaut « non renseignée ». */
  private brut(nom: string): string | undefined {
    const valeur = this.source[nom];
    if (valeur === undefined) return undefined;
    const nettoyee = valeur.trim();
    return nettoyee === '' ? undefined : nettoyee;
  }

  public probleme(message: string): void {
    this.problemes.push(message);
  }

  public avertir(message: string): void {
    this.avertissements.push(message);
  }

  private manquante(nom: string, attendu?: string): void {
    this.probleme(`${nom} : variable requise non renseignée${attendu ? ` (${attendu})` : ''}`);
  }

  public texte(nom: string, options: OptionsTexte = {}): string {
    const valeur = this.brut(nom) ?? options.defaut;
    if (valeur === undefined) {
      if (options.requis) this.manquante(nom, options.attendu);
      return '';
    }
    if (options.motif && !options.motif.test(valeur)) {
      this.probleme(`${nom} : valeur invalide${options.attendu ? ` — ${options.attendu}` : ''}`);
    }
    return valeur;
  }

  /** Comme `texte`, mais la valeur n'apparaît jamais dans un message d'erreur. */
  public secret(nom: string, options: { requis?: boolean; longueurMin?: number } = {}): string {
    const valeur = this.brut(nom);
    if (valeur === undefined) {
      if (options.requis) this.manquante(nom, 'secret engendré au déploiement');
      return '';
    }
    if (options.longueurMin !== undefined && valeur.length < options.longueurMin) {
      this.probleme(`${nom} : secret trop court (${options.longueurMin} caractères au minimum)`);
    }
    return valeur;
  }

  public entier(nom: string, options: OptionsEntier = {}): number {
    const brut = this.brut(nom);
    if (brut === undefined) {
      if (options.requis) this.manquante(nom, 'nombre entier');
      return options.defaut ?? 0;
    }
    const valeur = Number(brut);
    if (!Number.isInteger(valeur)) {
      this.probleme(`${nom} : nombre entier attendu`);
      return options.defaut ?? 0;
    }
    if (options.min !== undefined && valeur < options.min) {
      this.probleme(`${nom} : valeur trop petite (minimum ${options.min})`);
    }
    if (options.max !== undefined && valeur > options.max) {
      this.probleme(`${nom} : valeur trop grande (maximum ${options.max})`);
    }
    return valeur;
  }

  /** Accepte les formes françaises et anglaises : oui/non, true/false, 1/0, on/off. */
  public booleen(nom: string, defaut: boolean): boolean {
    const brut = this.brut(nom);
    if (brut === undefined) return defaut;
    const normalisee = brut.toLowerCase();
    if (['oui', 'true', '1', 'on', 'active', 'activé'].includes(normalisee)) return true;
    if (['non', 'false', '0', 'off', 'desactive', 'désactivé'].includes(normalisee)) return false;
    this.probleme(`${nom} : booléen attendu (oui/non)`);
    return defaut;
  }

  public choix<T extends string>(nom: string, valeurs: readonly T[], defaut: T): T {
    const brut = this.brut(nom);
    if (brut === undefined) return defaut;
    const normalisee = brut.toLowerCase() as T;
    if (!valeurs.includes(normalisee)) {
      this.probleme(`${nom} : valeur inconnue « ${brut} » (attendu : ${valeurs.join(' | ')})`);
      return defaut;
    }
    return normalisee;
  }

  public liste(nom: string, defaut: readonly string[]): readonly string[] {
    const brut = this.brut(nom);
    if (brut === undefined) return defaut;
    return brut
      .split(',')
      .map((element) => element.trim())
      .filter((element) => element !== '');
  }

  /** Chemin ABSOLU. Un chemin relatif dépend du répertoire de travail : refusé. */
  public chemin(nom: string, options: OptionsChemin = {}): string {
    const brut = this.brut(nom) ?? options.defaut;
    if (brut === undefined) {
      if (options.requis) this.manquante(nom, 'chemin absolu');
      return '';
    }
    if (!isAbsolute(brut)) {
      this.probleme(`${nom} : chemin absolu attendu (reçu « ${brut} »)`);
      return brut;
    }
    if (options.doitExister && !cheminLisible(brut)) {
      this.probleme(`${nom} : chemin introuvable ou illisible par le compte de service (${brut})`);
    }
    return normalize(brut);
  }

  /** Chemin facultatif : `null` si la variable n'est pas renseignée. */
  public cheminOptionnel(nom: string): string | null {
    const brut = this.brut(nom);
    if (brut === undefined) return null;
    if (!isAbsolute(brut)) {
      this.probleme(`${nom} : chemin absolu attendu (reçu « ${brut} »)`);
      return brut;
    }
    return normalize(brut);
  }

  public verifier(): void {
    if (this.problemes.length > 0) throw new ErreurConfiguration(this.problemes);
  }
}

function cheminLisible(chemin: string): boolean {
  try {
    statSync(chemin);
    return true;
  } catch {
    return false;
  }
}

/** `enfant` est-il situé dans `parent` (ou égal à lui) ? */
function estContenuDans(enfant: string, parent: string): boolean {
  if (enfant === '' || parent === '') return false;
  const a = normalize(enfant);
  const b = normalize(parent);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
}

/**
 * Version applicative. Tracée dans le journal d'audit pour qu'un rapport
 * produit deux ans plus tôt reste attribuable à une version précise (§0.3).
 */
function lireVersionApplication(source: NodeJS.ProcessEnv): string {
  const surcharge = source['APPLICATION_VERSION']?.trim();
  if (surcharge) return surcharge;
  try {
    // `dist/config/index.js` comme `src/config/index.ts` : deux niveaux au-dessus.
    const paquet = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    return paquet.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/* =====================================================================
 *  Chargement
 * ===================================================================== */

const ENVIRONNEMENTS: Record<string, Environnement> = {
  production: 'production',
  prod: 'production',
  recette: 'recette',
  staging: 'recette',
  developpement: 'developpement',
  development: 'developpement',
  dev: 'developpement',
  test: 'developpement',
};

/**
 * Lit et valide toute la configuration.
 *
 * @throws {ErreurConfiguration} si une variable requise manque ou est invalide.
 */
export function chargerConfiguration(source: NodeJS.ProcessEnv = process.env): Configuration {
  const lecteur = new LecteurEnvironnement(source);

  /* ── Environnement ───────────────────────────────────────────────── */
  const brutEnvironnement = (source['NODE_ENV'] ?? 'production').trim().toLowerCase();
  const environnement = ENVIRONNEMENTS[brutEnvironnement];
  if (environnement === undefined) {
    lecteur.probleme(
      `NODE_ENV : valeur inconnue « ${brutEnvironnement} » (attendu : production | recette | developpement)`,
    );
  }
  const env: Environnement = environnement ?? 'production';
  const estProduction = env === 'production';

  /* ── Serveur HTTP ────────────────────────────────────────────────── */
  const hote = lecteur.texte('SERVEUR_HOTE', { defaut: '127.0.0.1' });
  if (estProduction && hote !== '127.0.0.1' && hote !== '::1' && hote !== 'localhost') {
    lecteur.avertir(
      `SERVEUR_HOTE = ${hote} : le service est joignable hors de la boucle locale, alors qu'Apache doit être le seul point d'entrée (§1.1).`,
    );
  }

  const brutProxy = (source['SERVEUR_PROXY_DE_CONFIANCE'] ?? '127.0.0.1').trim();
  let proxyDeConfiance: string | boolean;
  if (['non', 'false', '0', 'off', ''].includes(brutProxy.toLowerCase())) {
    proxyDeConfiance = false;
  } else if (['oui', 'true', '1', 'on'].includes(brutProxy.toLowerCase())) {
    proxyDeConfiance = true;
    lecteur.avertir(
      "SERVEUR_PROXY_DE_CONFIANCE = oui : tous les en-têtes X-Forwarded-* sont crus, y compris ceux d'un client. Préférer l'adresse exacte du frontal.",
    );
  } else {
    proxyDeConfiance = brutProxy;
  }

  const serveur: ConfigurationServeur = {
    port: lecteur.entier('SERVEUR_PORT', { defaut: 3001, min: 1, max: 65535 }),
    hote,
    urlPublique: lecteur.texte('SERVEUR_URL_PUBLIQUE', {
      defaut: 'https://localhost',
      motif: /^https?:\/\/[^\s/]+/,
      attendu: 'URL absolue, par exemple https://grc.exemple.interne',
    }),
    proxyDeConfiance,
    tailleMaxCorpsOctets: lecteur.entier('SERVEUR_TAILLE_MAX_CORPS', {
      defaut: 26_214_400,
      min: 1024,
      max: 1_073_741_824,
    }),
    niveauJournal: lecteur.choix(
      'SERVEUR_NIVEAU_JOURNAL',
      ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const,
      'info',
    ),
    delaiArretMs: lecteur.entier('SERVEUR_DELAI_ARRET', { defaut: 25_000, min: 1000, max: 300_000 }),
  };

  if (estProduction && serveur.urlPublique.startsWith('http://')) {
    lecteur.avertir(
      'SERVEUR_URL_PUBLIQUE en http:// : le HTTPS est obligatoire en production (§0.2). Les liens des courriels et des exports seront erronés.',
    );
  }

  /* ── Base de données ─────────────────────────────────────────────── */
  const modeSsl = lecteur.choix(
    'BASE_SSL',
    ['desactive', 'requis', 'verifie-ca'] as const,
    'desactive',
  );
  const caBase =
    modeSsl === 'verifie-ca'
      ? lecteur.chemin('BASE_SSL_CA', { requis: true, doitExister: true })
      : (lecteur.cheminOptionnel('BASE_SSL_CA') ?? null);

  const proprietaireUtilisateur = lecteur.texte('BASE_UTILISATEUR_PROPRIETAIRE', { defaut: '' });
  const proprietaireMotDePasse = lecteur.secret('BASE_MOT_DE_PASSE_PROPRIETAIRE');

  const base: ConfigurationBase = {
    hote: lecteur.texte('BASE_HOTE', { defaut: '127.0.0.1' }),
    port: lecteur.entier('BASE_PORT', { defaut: 5432, min: 1, max: 65535 }),
    nom: lecteur.texte('BASE_NOM', { defaut: 'cyber_grc', motif: /^[A-Za-z_][A-Za-z0-9_$]*$/ }),
    utilisateur: lecteur.texte('BASE_UTILISATEUR', {
      requis: true,
      attendu: 'rôle applicatif PostgreSQL, par exemple grc_app',
    }),
    motDePasse: lecteur.secret('BASE_MOT_DE_PASSE', { requis: estProduction }),
    ssl: { mode: modeSsl, ca: caBase },
    poolMax: lecteur.entier('BASE_POOL_MAX', { defaut: 10, min: 1, max: 200 }),
    delaiConnexionMs: lecteur.entier('BASE_DELAI_CONNEXION', { defaut: 5000, min: 500 }),
    delaiInactiviteMs: lecteur.entier('BASE_DELAI_INACTIVITE', { defaut: 30_000, min: 1000 }),
    delaiRequeteMs: lecteur.entier('BASE_DELAI_REQUETE', { defaut: 15_000, min: 1000 }),
    delaiTransactionInactiveMs: lecteur.entier('BASE_DELAI_TRANSACTION_INACTIVE', {
      defaut: 30_000,
      min: 1000,
    }),
    delaiVerrouMs: lecteur.entier('BASE_DELAI_VERROU', { defaut: 5000, min: 100 }),
    nomApplication: 'cyber-grc',
    proprietaire:
      proprietaireUtilisateur === ''
        ? null
        : { utilisateur: proprietaireUtilisateur, motDePasse: proprietaireMotDePasse },
  };

  if (estProduction && base.hote !== '127.0.0.1' && base.hote !== 'localhost' && modeSsl === 'desactive') {
    lecteur.probleme(
      'BASE_SSL : la base est déportée (BASE_HOTE hors boucle locale) mais la liaison est en clair. Utiliser verifie-ca.',
    );
  }

  /* ── Sessions ────────────────────────────────────────────────────── */
  const session: ConfigurationSession = {
    secret: lecteur.secret('SESSION_SECRET', { requis: estProduction, longueurMin: 32 }),
    dureeInactiviteMinutes: lecteur.entier('SESSION_DUREE_INACTIVITE', {
      defaut: 30,
      min: 1,
      max: 1440,
    }),
    dureeMaximaleHeures: lecteur.entier('SESSION_DUREE_MAXIMALE', { defaut: 12, min: 1, max: 168 }),
    nomCookie: lecteur.texte('SESSION_NOM_COOKIE', {
      defaut: 'grc_session',
      motif: /^[A-Za-z0-9_-]+$/,
      attendu: 'nom de cookie sans espace',
    }),
    cookieSecurise: lecteur.booleen('SESSION_COOKIE_SECURISE', true),
  };

  if (estProduction && !session.cookieSecurise) {
    lecteur.probleme(
      "SESSION_COOKIE_SECURISE : le cookie de session doit porter l'attribut Secure en production (TLS obligatoire, §0.2).",
    );
  }

  /* ── Authentification (Active Directory) ─────────────────────────── */
  const ldapActif = lecteur.booleen('AUTH_LDAP_ACTIF', true);
  let ldap: ConfigurationLdap | null = null;

  if (ldapActif) {
    const url = lecteur.texte('LDAP_URL', {
      requis: true,
      motif: /^ldaps?:\/\/[^\s/]+/,
      attendu: 'ldaps://controleur.domaine:636',
    });
    if (url.startsWith('ldap://')) {
      if (estProduction) {
        lecteur.probleme(
          "LDAP_URL : liaison en clair refusée en production — l'annuaire est interrogé en LDAPS (§1.5).",
        );
      } else {
        lecteur.avertir('LDAP_URL : liaison LDAP en clair, tolérée hors production uniquement.');
      }
    }

    const verifierCertificat = lecteur.booleen('LDAP_VERIFIER_CERTIFICAT', true);
    if (estProduction && !verifierCertificat) {
      lecteur.probleme(
        "LDAP_VERIFIER_CERTIFICAT : la vérification du certificat du contrôleur de domaine ne peut pas être désactivée en production (elle annule l'intérêt de LDAPS).",
      );
    }

    const ca = lecteur.cheminOptionnel('LDAP_CA');
    if (ca !== null && !cheminLisible(ca)) {
      lecteur.probleme(`LDAP_CA : fichier introuvable ou illisible par le compte de service (${ca})`);
    }
    if (ca === null && verifierCertificat && estProduction) {
      lecteur.avertir(
        "LDAP_CA n'est pas renseigné : la validation reposera sur le magasin d'autorités du système, qui ne contient pas nécessairement la PKI interne (§0.3).",
      );
    }

    const filtre = lecteur.texte('LDAP_FILTRE_UTILISATEUR', {
      defaut: '(&(objectClass=user)(sAMAccountName={login}))',
    });
    if (!filtre.includes('{login}')) {
      lecteur.probleme(
        "LDAP_FILTRE_UTILISATEUR : le marqueur {login} est absent — le filtre ne peut pas viser l'utilisateur qui se connecte.",
      );
    }

    ldap = {
      url,
      ca,
      verifierCertificat,
      dnService: lecteur.texte('LDAP_DN_SERVICE', {
        requis: true,
        attendu: 'DN complet du compte de service en lecture seule',
      }),
      motDePasseService: lecteur.secret('LDAP_MOT_DE_PASSE_SERVICE', { requis: true }),
      baseRecherche: lecteur.texte('LDAP_BASE_RECHERCHE', {
        requis: true,
        attendu: 'racine de recherche, par exemple DC=exemple,DC=interne',
      }),
      filtreUtilisateur: filtre,
      attributIdentifiant: lecteur.texte('LDAP_ATTRIBUT_IDENTIFIANT', { defaut: 'sAMAccountName' }),
      attributsProfil: lecteur.liste('LDAP_ATTRIBUTS_PROFIL', [
        'displayName',
        'givenName',
        'sn',
        'mail',
        'telephoneNumber',
        'department',
        'title',
      ]),
      prefixeGroupes: lecteur.texte('LDAP_PREFIXE_GROUPES', { defaut: 'GRC-' }),
      groupesImbriques: lecteur.booleen('LDAP_GROUPES_IMBRIQUES', true),
      delaiMs: lecteur.entier('LDAP_DELAI', { defaut: 8000, min: 1000, max: 60_000 }),
    };
  }

  const empreinteSecours = lecteur.secret('AUTH_COMPTE_SECOURS_EMPREINTE', { longueurMin: 32 });
  const auth: ConfigurationAuth = {
    ldapActif,
    ldap,
    compteSecours:
      empreinteSecours === ''
        ? null
        : {
            identifiant: lecteur.texte('AUTH_COMPTE_SECOURS_IDENTIFIANT', { defaut: 'secours' }),
            empreinte: empreinteSecours,
          },
    maxTentatives: lecteur.entier('AUTH_MAX_TENTATIVES', { defaut: 5, min: 1, max: 100 }),
    dureeVerrouillageMinutes: lecteur.entier('AUTH_DUREE_VERROUILLAGE', {
      defaut: 15,
      min: 1,
      max: 1440,
    }),
  };

  if (!ldapActif && estProduction) {
    lecteur.avertir(
      "AUTH_LDAP_ACTIF = non en production : l'authentification par l'annuaire est désactivée, seul le compte de secours peut ouvrir une session (§1.5).",
    );
  }
  if (!ldapActif && auth.compteSecours === null && estProduction) {
    lecteur.probleme(
      "Aucun moyen d'authentification : AUTH_LDAP_ACTIF est à non et aucun compte de secours n'est configuré.",
    );
  }

  // ══ Q-73 — LA RECETTE EST UNE COPIE RÉALISTE DE LA PRODUCTION ════════
  //
  // Le refus ci-dessous ne vaut **qu'en production**, et une recette démarre
  // donc sans annuaire ni compte de secours. C'est la forme exacte du constat
  // M-5 : une barrière qui protège la production et pas la recette, laquelle
  // porte « une copie réaliste de la production » (`PLAN_SERVEUR` §1.10).
  //
  // Ce que le constat reproche exactement : « rien ne fuit ici, la session
  // provisoire rendant 503 partout ; **mais l'exploitant ne l'apprend qu'au
  // premier appel** ». C'est cette moitié-là qui est fermée ici — la recette
  // **le dit au démarrage**, et le dit précisément.
  //
  // ⚠️ **La seconde moitié — refuser de démarrer en recette — n'est PAS faite,
  // et il faut le dire plutôt que de le laisser croire.** La transformer en
  // `probleme()` est une ligne, elle a été écrite et mesurée : elle fait
  // échouer `test/api/routes.test.mjs`, dont l'essai T-3 **assied le défaut**
  // (« Recette : elle démarre »). Ce fichier n'appartient pas au périmètre
  // d'écriture de l'agent qui a fermé ce constat, et un correctif de produit
  // qui laisse un essai rouge derrière lui n'est pas un correctif. Le couple
  // exact est porté au rapport d'agent ; Q-73 reste OUVERT jusque-là, et son
  // échéance — « avant la mise en service pilote » — n'est pas franchie.
  if (!ldapActif && auth.compteSecours === null && env === 'recette') {
    lecteur.avertir(
      "Aucun moyen d'authentification en recette : AUTH_LDAP_ACTIF est à non et aucun compte de secours n'est configuré. Le serveur démarre, mais la session provisoire refuse de résoudre hors développement : TOUTES les routes de données rendront 503. La recette est une copie réaliste de la production (§1.10) — configurez l'annuaire, ou une empreinte de compte de secours.",
    );
  }

  /* ── Notifications SMTP ──────────────────────────────────────────── */
  const smtpActif = lecteur.booleen('SMTP_ACTIF', false);
  const modeAuthSmtp = lecteur.choix(
    'SMTP_MODE_AUTH',
    ['aucun', 'basique', 'oauth2'] as const,
    'basique',
  );
  const redirectionRecette = lecteur.texte('SMTP_REDIRECTION_RECETTE', { defaut: '' });

  const smtp: ConfigurationSmtp = {
    actif: smtpActif,
    hote: lecteur.texte('SMTP_HOTE', { requis: smtpActif, attendu: 'hôte du relais SMTP' }),
    port: lecteur.entier('SMTP_PORT', { defaut: 587, min: 1, max: 65535 }),
    chiffrement: lecteur.choix('SMTP_CHIFFREMENT', ['starttls', 'tls', 'aucun'] as const, 'starttls'),
    modeAuth: modeAuthSmtp,
    utilisateur: lecteur.texte('SMTP_UTILISATEUR', {
      requis: smtpActif && modeAuthSmtp === 'basique',
    }),
    motDePasse: lecteur.secret('SMTP_MOT_DE_PASSE', {
      requis: smtpActif && modeAuthSmtp === 'basique',
    }),
    oauth: {
      tenant: lecteur.texte('SMTP_OAUTH_TENANT', { requis: smtpActif && modeAuthSmtp === 'oauth2' }),
      clientId: lecteur.texte('SMTP_OAUTH_CLIENT_ID', {
        requis: smtpActif && modeAuthSmtp === 'oauth2',
      }),
      clientSecret: lecteur.secret('SMTP_OAUTH_CLIENT_SECRET', {
        requis: smtpActif && modeAuthSmtp === 'oauth2',
      }),
    },
    expediteur: lecteur.texte('SMTP_EXPEDITEUR', {
      requis: smtpActif,
      motif: /^[^@\s]+@[^@\s]+$/,
      attendu: "adresse d'expédition autorisée par le SPF du domaine",
    }),
    nomExpediteur: lecteur.texte('SMTP_NOM_EXPEDITEUR', { defaut: 'Cyber GRC' }),
    redirectionRecette: redirectionRecette === '' ? null : redirectionRecette,
  };

  if (estProduction && smtp.redirectionRecette !== null) {
    lecteur.probleme(
      'SMTP_REDIRECTION_RECETTE est renseignée en production : toutes les notifications seraient détournées vers cette adresse. Ce réglage est réservé à la recette (§1.10).',
    );
  }
  if (env === 'recette' && smtp.actif && smtp.redirectionRecette === null) {
    lecteur.avertir(
      "Recette avec envoi de courriels actif et sans redirection : risque d'envoi réel aux filiales (§1.10).",
    );
  }
  if (estProduction && smtp.actif && smtp.chiffrement === 'aucun') {
    lecteur.avertir('SMTP_CHIFFREMENT = aucun : les identifiants du relais circulent en clair.');
  }

  /* ── Chemins ─────────────────────────────────────────────────────── */
  const chemins: ConfigurationChemins = {
    piecesJointes: lecteur.chemin('CHEMIN_PIECES_JOINTES', {
      defaut: '/var/lib/cyber-grc/pieces-jointes',
    }),
    quarantaine: lecteur.chemin('CHEMIN_QUARANTAINE', { defaut: '/var/lib/cyber-grc/quarantaine' }),
    temporaire: lecteur.chemin('CHEMIN_TEMPORAIRE', { defaut: '/var/lib/cyber-grc/temporaire' }),
    frontend: lecteur.chemin('CHEMIN_FRONTEND', { defaut: '/opt/cyber-grc/frontend' }),
    configSpecifique: lecteur.chemin('CHEMIN_CONFIG_SPECIFIQUE', {
      defaut: '/etc/cyber-grc/specifique.json',
    }),
    sauvegardes: lecteur.chemin('CHEMIN_SAUVEGARDES', { defaut: '/var/backups/cyber-grc' }),
  };

  // Contrôle n° 5 de la chaîne des pièces jointes (§1.6) : le magasin vit hors
  // de l'arborescence web. Le vérifier ici évite qu'une erreur de configuration
  // transforme Apache en distributeur de fichiers non contrôlés.
  for (const [nom, chemin] of [
    ['CHEMIN_PIECES_JOINTES', chemins.piecesJointes],
    ['CHEMIN_QUARANTAINE', chemins.quarantaine],
    ['CHEMIN_TEMPORAIRE', chemins.temporaire],
  ] as const) {
    if (estContenuDans(chemin, chemins.frontend)) {
      lecteur.probleme(
        `${nom} est situé sous CHEMIN_FRONTEND : Apache servirait directement les fichiers déposés, ce que la chaîne de contrôle interdit (§1.6).`,
      );
    }
  }
  if (chemins.piecesJointes === chemins.quarantaine) {
    lecteur.probleme(
      'CHEMIN_PIECES_JOINTES et CHEMIN_QUARANTAINE désignent le même répertoire : un fichier mis en quarantaine resterait délivrable.',
    );
  }

  /* ── Pièces jointes ──────────────────────────────────────────────── */
  const piecesJointes: ConfigurationPiecesJointes = {
    tailleMaxOctets: lecteur.entier('PJ_TAILLE_MAX', { defaut: 25, min: 1, max: 2048 }) * 1024 * 1024,
    quotaFilialeOctets:
      lecteur.entier('PJ_QUOTA_FILIALE', { defaut: 2048, min: 1, max: 1_048_576 }) * 1024 * 1024,
    clamavActif: lecteur.booleen('CLAMAV_ACTIF', true),
    clamavSocket: lecteur.chemin('CLAMAV_SOCKET', { defaut: '/run/clamav/clamd.ctl' }),
    clamavDelaiMs: lecteur.entier('CLAMAV_DELAI', { defaut: 30_000, min: 1000, max: 600_000 }),
  };

  if (piecesJointes.tailleMaxOctets > serveur.tailleMaxCorpsOctets) {
    lecteur.probleme(
      'PJ_TAILLE_MAX dépasse SERVEUR_TAILLE_MAX_CORPS : les envois de la taille annoncée seraient refusés par le serveur HTTP avant tout contrôle.',
    );
  }
  if (estProduction && !piecesJointes.clamavActif) {
    lecteur.avertir(
      "CLAMAV_ACTIF = non : les pièces jointes ne sont plus analysées, la couche n° 4 de la chaîne de contrôle est absente (§1.6). À n'utiliser qu'en dépannage, et à documenter.",
    );
  }

  /* ── Rétention ───────────────────────────────────────────────────── */
  const retention: ConfigurationRetention = {
    journalJours: lecteur.entier('RETENTION_JOURNAL', { defaut: 1095, min: 30, max: 3660 }),
    donneesJours: lecteur.entier('RETENTION_DONNEES', { defaut: 1095, min: 30, max: 3660 }),
  };

  if (retention.journalJours < 1095) {
    lecteur.avertir(
      `RETENTION_JOURNAL = ${retention.journalJours} jours : le cadrage retient 3 ans (1095 jours) pour le journal d'audit (§1.7).`,
    );
  }

  lecteur.verifier();

  return {
    environnement: env,
    version: lireVersionApplication(source),
    serveur,
    base,
    session,
    auth,
    smtp,
    chemins,
    piecesJointes,
    retention,
    avertissements: lecteur.avertissements,
  };
}

/**
 * Résumé journalisable de la configuration : ce qui est utile au diagnostic,
 * **sans aucun secret**. C'est cet objet, et lui seul, qui part au journal au
 * démarrage du service.
 */
export function resumerConfiguration(config: Configuration): Record<string, unknown> {
  return {
    environnement: config.environnement,
    version: config.version,
    ecoute: `${config.serveur.hote}:${config.serveur.port}`,
    url_publique: config.serveur.urlPublique,
    base: `${config.base.utilisateur}@${config.base.hote}:${config.base.port}/${config.base.nom}`,
    base_ssl: config.base.ssl.mode,
    base_pool_max: config.base.poolMax,
    authentification: config.auth.ldapActif ? 'annuaire (LDAPS)' : 'compte de secours uniquement',
    ldap_url: config.auth.ldap?.url ?? null,
    smtp: config.smtp.actif ? `${config.smtp.hote}:${config.smtp.port}` : 'désactivé',
    smtp_redirection_recette: config.smtp.redirectionRecette !== null,
    pieces_jointes: config.chemins.piecesJointes,
    analyse_antivirale: config.piecesJointes.clamavActif,
    retention_journal_jours: config.retention.journalJours,
  };
}
