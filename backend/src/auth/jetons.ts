/**
 * `src/auth/jetons.ts` — L'AUTHENTIFICATION PAR JETON D'API (lot L22, action 22.1)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ CE FICHIER N'OUVRE PAS UN SECOND CHEMIN D'AUTORISATION
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le critère 22.1 tient en une phrase : *« un jeton est un sujet de droits comme un
 * autre : il traverse `resoudre()` et la RLS, il ne les contourne pas ».*
 *
 * Ce module ne fait donc qu'**une** chose : fabriquer un `EtatSession` — la même
 * structure exactement que celle qu'une connexion humaine produit. Tout le reste
 * — la résolution du périmètre, la projection des droits, le cloisonnement, le
 * journal — est le code existant, inchangé.
 *
 * Si l'on avait écrit ici un second calcul de droits, il aurait été d'accord avec
 * le premier le jour de sa rédaction, et rien n'aurait dit qu'il avait cessé de
 * l'être : c'est le constat **Q-70**, où `perimetreDe()` recalculait
 * `administrationGroupe` une seconde fois.
 *
 * ── CE QUE LE JETON NE PEUT PAS FAIRE, ET POURQUOI ──────────────────────────
 *
 *  · **Il n'a pas de portée Groupe.** `portee: 'filiale'` est écrit en dur, et
 *    `administrationGroupe` en découle à faux. Un jeton de portée Groupe aurait lu
 *    les vingt filiales, et il aurait suffi d'en perdre un.
 *  · **Il ne change pas de filiale active.** Il en a une, celle de sa ligne.
 *  · **Il ne porte jamais plus que ce que la table dit**, et la table a été écrite
 *    par une intersection avec les droits de l'émetteur (`src/ouverture/`).
 *
 * ── LE SECRET ──────────────────────────────────────────────────────────────
 *
 * Il n'est jamais stocké : seule son empreinte SHA-256. La comparaison se fait sur
 * l'empreinte, par un index unique — et non par un parcours suivi d'une comparaison
 * de chaînes, qui aurait laissé fuir la longueur du préfixe commun par le temps
 * d'exécution.
 *
 * ⚠️ **SHA-256 et non `scrypt`**, contrairement aux mots de passe : un jeton est
 * 256 bits tirés d'un générateur cryptographique. Il n'y a rien à deviner, et un
 * `scrypt` par requête ferait payer à chaque appel d'API un coût qui ne protège de
 * rien. Le raisonnement inverse vaut pour `src/auth/secours.ts`, et il y est écrit.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';

import type { DomaineFonctionnelBase, NiveauDroit } from '../droits/modele.js';
import type { EtatSession } from '../droits/resolveur.js';

/** Préfixe des jetons émis. Il rend un secret reconnaissable dans un journal de fuite. */
export const PREFIXE_JETON = 'grc_';
/** Longueur du secret, en octets d'aléa. 32 octets = 256 bits. */
const OCTETS_SECRET = 32;
/** Signes du secret montrés à l'écran pour reconnaître un jeton sans le révéler. */
const LONGUEUR_PREFIXE_AFFICHE = 8;

/** Un jeton fraîchement émis : le secret n'existe qu'ici, et une seule fois. */
export interface JetonEmis {
  /** Le secret complet — à remettre à l'appelant, et à ne jamais stocker. */
  readonly secret: string;
  /** L'empreinte à écrire en base. */
  readonly empreinte: string;
  /** Les premiers signes, pour l'écran. */
  readonly prefixe: string;
}

/**
 * Fabrique un jeton.
 *
 * ⚠️ `randomBytes` et non `Math.random` : c'est la règle du `CONVENTIONS.md` §2, et
 * elle vaut ici plus qu'ailleurs — ce secret EST l'accès.
 */
export function emettreJeton(filialeId: string): JetonEmis {
  /* ── ⚠️ LE SECRET PORTE SA FILIALE, EN CLAIR, ET C'EST UNE NÉCESSITÉ ───────
   *
   * 🛑 **Sans elle, un jeton émis rendait 401 à son premier usage** — mesuré sur
   * la recette, et le journal disait « motif inconnu », c'est-à-dire *aucune
   * ligne ne porte cette empreinte*. Il y en avait une.
   *
   * La cause est circulaire : `jetons_api` est **cloisonnée**, et la recherche
   * par empreinte a lieu **avant** qu'un périmètre existe — c'est elle qui va le
   * produire. La ligne était donc invisible à la seule transaction qui devait la
   * voir.
   *
   * ⚠️ **Trois remèdes ont été écartés, et il faut dire pourquoi :**
   *
   *  · ouvrir la politique de lecture à `f_authentification()` — **refusé par un
   *    garde-fou existant** (`authentification_en_lecture`, migration `007` §5) :
   *    un réglage de session ne doit jamais élargir une LECTURE ;
   *  · `using (true)`, comme `sessions` — ce serait ajouter à la dette connue du
   *    lot L3, et laisser une filiale lister les accès ouverts chez sa voisine :
   *    leur nom, leur préfixe, leur expiration et qui les a émis ;
   *  · une fonction `security definer` — elle ne contourne rien ici, la RLS étant
   *    **forcée y compris pour le propriétaire** (`PLAN_SERVEUR` §1.9).
   *
   * Le secret est donc `grc_<filiale en base64url>.<32 octets d'aléa>` : la
   * couche d'authentification lit la filiale **sans interroger la base**, pose ce
   * périmètre, puis cherche l'empreinte sous la RLS ordinaire. **Rien n'est
   * affaibli** : une filiale forgée ne donne accès à rien, puisque l'empreinte
   * doit encore correspondre à une ligne DE CETTE filiale-là. Le segment en clair
   * est un identifiant de filiale, que `GET /api/session` rend déjà à qui est
   * connecté — ce n'est pas un secret, et l'aléa, lui, en reste un.
   */
  const marque = Buffer.from(filialeId, 'utf8').toString('base64url');
  const secret = PREFIXE_JETON + marque + SEPARATEUR + randomBytes(OCTETS_SECRET).toString('base64url');
  return {
    secret,
    empreinte: empreinteDe(secret),
    // ⚠️ Le préfixe AFFICHÉ saute la marque : il sert à reconnaître un jeton dans
    // une liste, et montrer la filiale n'y aide pas — elle est déjà la colonne d'à
    // côté. Il est pris dans l'ALÉA, qui est ce qui distingue deux jetons.
    prefixe:
      PREFIXE_JETON +
      secret.slice(secret.indexOf(SEPARATEUR) + 1, secret.indexOf(SEPARATEUR) + 1 + LONGUEUR_PREFIXE_AFFICHE),
  };
}

/**
 * La filiale que porte un secret, ou `null` s'il n'en porte pas.
 *
 * ⚠️ **Elle n'est CRUE de personne** : elle sert uniquement à poser le périmètre de
 * lecture de la transaction de vérification. Une valeur forgée fait chercher
 * l'empreinte dans une filiale où elle n'est pas, donc rend un refus — exactement
 * comme un secret inventé.
 */
export function filialeDuSecret(secret: string): string | null {
  const coupure = secret.indexOf(SEPARATEUR);
  if (coupure <= PREFIXE_JETON.length) return null;
  const marque = secret.slice(PREFIXE_JETON.length, coupure);
  // Borne : un identifiant de filiale du produit fait moins de 120 signes
  // (domaine `id_metier`). Au-delà, c'est une entrée hostile, pas une marque.
  if (marque.length === 0 || marque.length > 200) return null;
  let decode: string;
  try {
    decode = Buffer.from(marque, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  // ⚠️ Le résultat entre dans un `set_config` : on refuse tout ce qui n'est pas la
  // forme d'un identifiant métier, plutôt que de s'en remettre au paramétrage.
  if (decode === '' || decode.length > 120) return null;
  for (const signe of decode) {
    const ok =
      (signe >= 'a' && signe <= 'z') ||
      (signe >= 'A' && signe <= 'Z') ||
      (signe >= '0' && signe <= '9') ||
      signe === '-' || signe === '_' || signe === '.';
    if (!ok) return null;
  }
  return decode;
}

/** Sépare la marque de filiale de l'aléa. Absent de l'alphabet base64url, donc sûr. */
const SEPARATEUR = '.';

/** L'empreinte d'un secret. Seule forme sous laquelle un jeton existe en base. */
export function empreinteDe(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Lit le jeton porté par l'en-tête `Authorization`, ou `null`.
 *
 * ⚠️ **Sans expression rationnelle** — règle n° 7 du `docs/PLAN_PRODUIT.md` §5 : aucune
 * expression à coût non borné dans `src/`, et un en-tête vient de l'extérieur. Un
 * découpage de chaîne est linéaire par construction, et il n'y a rien à mesurer pour
 * s'en assurer (constats Q-208 et Q-215).
 */
export function jetonDeLEntete(entete: string | undefined): string | null {
  if (typeof entete !== 'string') return null;
  const marque = 'Bearer ';
  if (!entete.startsWith(marque)) return null;
  const secret = entete.slice(marque.length).trim();
  if (secret === '' || !secret.startsWith(PREFIXE_JETON)) return null;
  // Borne de saisie (contrôle S13) : un en-tête d'un mégaoctet ne doit pas parcourir
  // la chaîne d'authentification pour finir refusé.
  if (secret.length > 200) return null;
  return secret;
}

/** Motif de refus d'un jeton. Ils ne sont PAS rendus à l'appelant — voir plus bas. */
export type RefusJeton = 'inconnu' | 'revoque' | 'expire' | 'filiale_inactive';

export type VerdictJeton =
  | { readonly etat: EtatSession; readonly jetonId: string; readonly emisPar: string }
  | { readonly refus: RefusJeton };

interface LigneJeton {
  readonly id: string;
  readonly filiale_id: string;
  readonly prefixe: string;
  readonly emis_par: string;
  readonly niveau: string;
  readonly domaines: string[];
  readonly peut_exporter: boolean;
  readonly expire_le: Date;
  readonly revoque_le: Date | null;
  readonly filiale_code: string | null;
  readonly filiale_nom: string | null;
  readonly filiale_active: boolean | null;
  readonly emetteur_id: string | null;
}

/**
 * Vérifie un jeton et rend l'`EtatSession` qu'il porte.
 *
 * ⚠️ **Les quatre refus sont distincts ICI et INDISCERNABLES pour l'appelant.** Le
 * détail va au journal ; ce qui revient sur le réseau est un 401 unique. Distinguer
 * « inconnu » de « révoqué » dirait à qui essaie des jetons au hasard lesquels ont
 * existé — c'est l'oracle d'existence que le contrôle **S12** interdit, et le motif
 * pour lequel un lien expiré du portail fournisseur rendra 404 et non 403.
 */
export async function verifierJeton(client: PoolClient, secret: string): Promise<VerdictJeton> {
  const { rows } = await client.query<LigneJeton>(
    `select j.id, j.filiale_id, j.prefixe, j.emis_par, j.niveau, j.domaines,
            j.peut_exporter, j.expire_le, j.revoque_le,
            f.code as filiale_code, f.raison_sociale as filiale_nom,
            -- ⚠️ « filiales » n'a pas de colonne « actif » : elle porte un STATUT à
            -- trois valeurs (active / archivée / sortie), et la première rédaction
            -- lisait « f.actif ». 42703 à chaque vérification de jeton. ⚠️ Et les
            -- trois valeurs comptent : une filiale ARCHIVÉE ou SORTIE ne laisse pas
            -- ses jetons vivre — c'est la sortie de filiale du PLAN_SERVEUR §2.7.
            (f.statut = 'active') as filiale_active,
            u.id as emetteur_id
       from jetons_api j
       left join filiales f on f.id = j.filiale_id
       -- ⚠️ La colonne de connexion s'appelle « identifiant », pas « login » : la
       -- première rédaction écrivait « u.login », qui n'existe pas — 42703 à CHAQUE
       -- vérification de jeton, c'est-à-dire sur tout appel par jeton. Le banc l'a dit ;
       -- aucune relecture ne l'avait vu, parce que la requête se lit bien.
       left join utilisateurs u on u.identifiant = j.emis_par
      where j.empreinte = $1`,
    [empreinteDe(secret)],
  );
  const ligne = rows[0];
  if (ligne === undefined) return { refus: 'inconnu' };
  if (ligne.revoque_le !== null) return { refus: 'revoque' };
  if (ligne.expire_le.getTime() <= Date.now()) return { refus: 'expire' };
  // ⚠️ Une filiale désactivée ne laisse pas ses jetons vivre : c'est la sortie de
  // filiale du `PLAN_SERVEUR` §2.7, et l'oublier laisserait un accès ouvert sur un
  // périmètre que le Groupe croit fermé.
  if (ligne.filiale_active !== true) return { refus: 'filiale_inactive' };

  const domaines = new Map<DomaineFonctionnelBase, NiveauDroit>();
  const niveau = ligne.niveau as NiveauDroit;
  for (const domaine of ligne.domaines) {
    domaines.set(domaine as DomaineFonctionnelBase, niveau);
  }

  return {
    jetonId: ligne.id,
    emisPar: ligne.emis_par,
    etat: {
      // ⚠️ L'identifiant du JETON, et non une session inventée : le journal dira
      // quel jeton a agi, et la table dira qui l'a émis. Une session synthétique
      // aurait fait croire à une connexion humaine.
      sessionId: ligne.id,
      // ⚠️ Le libellé nomme le jeton, PAS la personne : c'est le jeton qui a agi.
      // La personne est rattachable par `utilisateurId` et par `jetons_api.emis_par`,
      // ce qui est exactement ce que l'action 22.2 demande — et ce qui évite
      // d'imputer à un humain un appel qu'une machine a fait à trois heures du matin.
      login: `jeton:${ligne.prefixe}`,
      utilisateurId: ligne.emetteur_id ?? ligne.emis_par,
      // ⚠️ ÉCRIT EN DUR, et c'est une barrière : pas de portée Groupe pour un jeton.
      portee: 'filiale',
      filiales: [ligne.filiale_id],
      filialeActive: ligne.filiale_id,
      filiale:
        ligne.filiale_code === null || ligne.filiale_nom === null
          ? null
          : { id: ligne.filiale_id, code: ligne.filiale_code, raisonSociale: ligne.filiale_nom },
      // ⚠️ `administrateur` suit le niveau, mais `portee` reste « filiale » : le
      // résolveur en déduit `administrationGroupe = false`. Un jeton peut administrer
      // SA filiale ; il ne peut pas écrire une ligne de portée Groupe.
      administrateur: niveau === 'administration',
      peutExporter: ligne.peut_exporter,
      domaines,
      expireLe: ligne.expire_le,
      derniereActivite: new Date(),
      compteSecours: false,
    },
  };
}

/**
 * Note qu'un jeton a servi.
 *
 * ⚠️ **Hors de la transaction de la requête, et sans jamais la faire échouer.** Un
 * compteur d'usage n'est pas une donnée métier : s'il empêchait une lecture
 * d'aboutir, on aurait rendu le produit fragile pour un chiffre d'écran.
 */
export async function noterUsage(client: PoolClient, jetonId: string): Promise<void> {
  await client.query(
    `update jetons_api set dernier_usage_le = now(), usages = usages + 1 where id = $1`,
    [jetonId],
  );
}
