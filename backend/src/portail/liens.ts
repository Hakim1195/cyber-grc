/**
 * `src/portail/liens.ts` — LES LIENS D'ACCÈS AU PORTAIL (lot L28, action 28.1)
 *
 * ── ⚠️ PAS DE COMPTE, ET C'EST DÉLIBÉRÉ ───────────────────────────────────
 *
 * Un compte, c'est un mot de passe à réinitialiser, une énumération possible, et une
 * surface qui **vit après la campagne**. Un lien **expire tout seul**. Le produit
 * n'ouvre donc aucun compte fournisseur : il émet un lien signé, nominatif, daté,
 * révocable, et portant sur **un seul questionnaire**.
 *
 * ── ⚠️ LE LIEN PORTE SA FILIALE, ET C'EST LE §46 QUI PAIE ─────────────────
 *
 * `portail_liens` est cloisonnée, et la recherche par empreinte a lieu **avant** qu'un
 * périmètre existe : c'est elle qui va le produire. C'est mot pour mot la circularité
 * du `CONVENTIONS.md` **§46**, découverte au lot L22 le même jour — un jeton émis
 * rendait 401 à son premier usage —, et le remède est le même.
 *
 * ⚠️ **Elle n'est crue de personne** : l'empreinte doit encore correspondre à une ligne
 * **de cette filiale-là**. Une marque forgée fait chercher là où rien n'est, et rend le
 * même 404 qu'un lien inventé.
 *
 * *Une règle écrite la veille et appliquée le lendemain est la seule preuve qu'elle
 * valait la peine d'être écrite.*
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { PoolClient } from 'pg';

/** Préfixe du secret. Distinct de celui des jetons d'API : ce ne sont pas les mêmes accès. */
export const PREFIXE_LIEN = 'grcp_';
const SEPARATEUR = '.';
const OCTETS_SECRET = 32;
const LONGUEUR_PREFIXE_AFFICHE = 8;
/** Borne de saisie : une URL d'un mégaoctet ne doit pas parcourir la chaîne (S13). */
const SECRET_MAX = 200;

export interface LienEmis {
  readonly secret: string;
  readonly empreinte: string;
  readonly prefixe: string;
}

/**
 * Fabrique un lien.
 *
 * ⚠️ `randomBytes` et non `Math.random` : `CONVENTIONS.md` §2, et cela vaut ici plus
 * qu'ailleurs — ce secret EST l'accès, **et il est présenté depuis l'Internet public**.
 */
export function emettreLien(filialeId: string): LienEmis {
  const marque = Buffer.from(filialeId, 'utf8').toString('base64url');
  const secret =
    PREFIXE_LIEN + marque + SEPARATEUR + randomBytes(OCTETS_SECRET).toString('base64url');
  const alea = secret.slice(secret.indexOf(SEPARATEUR) + 1);
  return {
    secret,
    empreinte: empreinteDe(secret),
    // Le préfixe AFFICHÉ est pris dans l'ALÉA : montrer la filiale n'aide pas à
    // reconnaître un lien dans une liste, et elle est la colonne d'à côté.
    prefixe: PREFIXE_LIEN + alea.slice(0, LONGUEUR_PREFIXE_AFFICHE),
  };
}

/**
 * L'empreinte d'un secret.
 *
 * ⚠️ **SHA-256 et non un dérivateur lent**, comme pour les jetons d'API : un secret de
 * 256 bits tiré d'un générateur cryptographique n'a pas de dictionnaire à protéger, et
 * un dérivateur lent ferait payer sa latence à **chaque ouverture de page du portail** —
 * c'est-à-dire donner à un inconnu le moyen de coûter cher au serveur.
 */
export function empreinteDe(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * La filiale que porte un secret, ou `null`.
 *
 * ⚠️ **Validée caractère par caractère**, parce que la valeur entre dans un
 * `set_config` et qu'elle vient de l'Internet public. Un réglage de session n'est pas
 * un endroit où l'on met ce qu'on n'a pas regardé.
 */
export function filialeDuLien(secret: string): string | null {
  const coupure = secret.indexOf(SEPARATEUR);
  if (coupure <= PREFIXE_LIEN.length) return null;
  const marque = secret.slice(PREFIXE_LIEN.length, coupure);
  if (marque.length === 0 || marque.length > SECRET_MAX) return null;
  let decode: string;
  try {
    decode = Buffer.from(marque, 'base64url').toString('utf8');
  } catch {
    return null;
  }
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

/**
 * Lit le secret porté par la requête.
 *
 * ⚠️ **Sans expression rationnelle** — règle n° 7 : aucune expression à coût non borné
 * dans `src/`, et ce sujet vient de l'extérieur **par définition**.
 */
export function lienDeLaRequete(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  if (propre === '' || propre.length > SECRET_MAX) return null;
  if (!propre.startsWith(PREFIXE_LIEN)) return null;
  return propre;
}

/** Ce qu'un lien ouvre — et rien d'autre. */
export interface AccesPortail {
  readonly lienId: string;
  readonly filialeId: string;
  readonly questionnaireId: string;
  readonly destinataire: string;
}

/** Les quatre refus. Distincts ICI, **indiscernables** pour l'appelant. */
export type RefusLien = 'inconnu' | 'revoque' | 'expire' | 'questionnaire_absent';

export type VerdictLien = { readonly acces: AccesPortail } | { readonly refus: RefusLien };

interface LigneLien {
  readonly id: string;
  readonly filiale_id: string;
  readonly questionnaire_id: string;
  readonly destinataire: string;
  readonly empreinte: string;
  readonly expire_le: Date;
  readonly revoque_le: Date | null;
  readonly questionnaire_existe: boolean;
}

/**
 * Vérifie un lien.
 *
 * ⚠️ **Les quatre refus sont indiscernables de l'extérieur**, et cela vaut ici plus que
 * partout ailleurs : la surface est **publique**. Distinguer « inconnu » de « révoqué »
 * dirait à qui essaie des liens au hasard lesquels ont existé, et distinguer « expiré »
 * de « autre campagne » dirait qu'une campagne existe. Le critère du lot l'écrit : *un
 * lien expiré, révoqué, ou visant une autre campagne rend 404 — jamais 403 : un 403
 * confirmerait que la cible existe.*
 *
 * ⚠️ **La comparaison de l'empreinte est à TEMPS CONSTANT.** Sur une surface publique,
 * une comparaison qui s'arrête au premier octet différent est un canal de mesure. Elle
 * ne l'est pas ici — la recherche se fait par index —, mais la relecture suivante n'a
 * pas à le redémontrer.
 */
export async function verifierLien(
  client: PoolClient,
  secret: string,
): Promise<VerdictLien> {
  const empreinte = empreinteDe(secret);
  const { rows } = await client.query<LigneLien>(
    `select l.id, l.filiale_id, l.questionnaire_id, l.destinataire, l.empreinte,
            l.expire_le, l.revoque_le,
            exists (select 1 from questionnaires_tiers q
                     where q.id = l.questionnaire_id and q.filiale_id = l.filiale_id)
              as questionnaire_existe
       from portail_liens l
      where l.empreinte = $1`,
    [empreinte],
  );
  const ligne = rows[0];
  if (ligne === undefined) return { refus: 'inconnu' };

  const attendu = Buffer.from(ligne.empreinte, 'utf8');
  const presente = Buffer.from(empreinte, 'utf8');
  if (attendu.length !== presente.length || !timingSafeEqual(attendu, presente)) {
    return { refus: 'inconnu' };
  }
  if (ligne.revoque_le !== null) return { refus: 'revoque' };
  if (ligne.expire_le.getTime() <= Date.now()) return { refus: 'expire' };
  // ⚠️ Le questionnaire a pu être supprimé depuis : le lien pend alors dans le vide.
  // C'est un refus, pas une erreur — et il est indiscernable des trois autres.
  if (!ligne.questionnaire_existe) return { refus: 'questionnaire_absent' };

  return {
    acces: {
      lienId: ligne.id,
      filialeId: ligne.filiale_id,
      questionnaireId: ligne.questionnaire_id,
      destinataire: ligne.destinataire,
    },
  };
}

/** Note l'usage, **dans la transaction de vérification**. */
export async function noterUsage(client: PoolClient, lienId: string): Promise<void> {
  await client.query(
    `update portail_liens
        set usages = usages + 1,
            dernier_usage_le = now(),
            premiere_ouverture_le = coalesce(premiere_ouverture_le, now())
      where id = $1`,
    [lienId],
  );
}
