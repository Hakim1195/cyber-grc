/**
 * Le compte de secours — **le seul secret d'authentification que l'application
 * détienne**, et le seul chemin qui n'interroge pas l'annuaire.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi il existe, et pourquoi il est encadré à ce point
 * ════════════════════════════════════════════════════════════════════════
 *
 * `PLAN_SERVEUR` §0.3 : le compte de service LDAP peut être verrouillé, son mot
 * de passe expirer, le contrôleur de domaine tomber. Sans compte de secours,
 * plus personne n'entre — y compris pour constater la panne. C'est une exigence
 * d'exploitation, pas un confort.
 *
 * C'est aussi, par construction, la porte la plus intéressante pour un
 * attaquant : un mot de passe, hors annuaire, qui donne l'administration Groupe.
 * Quatre bornes l'encadrent :
 *
 *  1. **Désactivé par défaut.** `AUTH_COMPTE_SECOURS_EMPREINTE` vide = pas de
 *     compte de secours. L'absence de réglage n'accorde rien.
 *  2. **Aucun mot de passe en clair nulle part** : la configuration porte une
 *     empreinte `scrypt`, et la colonne `utilisateurs.mot_de_passe_hash` porte
 *     la même. Le privilège de lecture de cette colonne est retiré au rôle de
 *     consultation (`001_socle.sql` §15 ter).
 *  3. **Comparaison en temps constant** (`timingSafeEqual`) : une comparaison
 *     naïve laisse mesurer le préfixe correct.
 *  4. **Journalisé à chaque usage**, réussi comme refusé. C'est le critère
 *     d'acceptation du lot : « le compte de secours est journalisé à chaque
 *     usage ». Une porte dérobée dont personne ne sait qu'elle a servi n'est
 *     pas une porte de secours.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le format d'empreinte
 * ════════════════════════════════════════════════════════════════════════
 *
 *     scrypt$<N>$<r>$<p>$<sel base64url>$<empreinte base64url>
 *
 * Le format porte ses propres paramètres : une empreinte engendrée aujourd'hui
 * reste vérifiable après un durcissement des paramètres, sans migration. Le sel
 * est tiré du générateur cryptographique du système.
 *
 * `scrypt` plutôt que PBKDF2 : il est coûteux en **mémoire**, ce qu'un circuit
 * dédié ne contourne pas, et il est dans la bibliothèque standard de Node —
 * donc sans dépendance à déclarer (`PLAN_EXECUTION` §2).
 */

import { randomBytes, scrypt as scryptRappel, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptRappel) as (
  motDePasse: string | Buffer,
  sel: string | Buffer,
  longueur: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** Paramètres employés pour ENGENDRER. La vérification lit ceux de l'empreinte. */
const PARAMETRES = Object.freeze({ N: 16_384, r: 8, p: 1, longueur: 32 });

/** Borne mémoire de `scrypt`, calculée pour les paramètres lus, jamais devinée. */
function memoireMax(N: number, r: number): number {
  return 256 * N * r * 2;
}

/** Engendre une empreinte. Employée par l'outil d'administration et par le banc. */
export async function engendrerEmpreinte(motDePasse: string): Promise<string> {
  if (motDePasse.length < 12) {
    throw new Error(
      'Mot de passe du compte de secours trop court : 12 caractères au minimum. ' +
        "C'est le seul secret d'authentification que l'application détienne.",
    );
  }
  const sel = randomBytes(16);
  const empreinte = await scrypt(motDePasse, sel, PARAMETRES.longueur, {
    N: PARAMETRES.N,
    r: PARAMETRES.r,
    p: PARAMETRES.p,
    maxmem: memoireMax(PARAMETRES.N, PARAMETRES.r),
  });
  return [
    'scrypt',
    PARAMETRES.N,
    PARAMETRES.r,
    PARAMETRES.p,
    sel.toString('base64url'),
    empreinte.toString('base64url'),
  ].join('$');
}

/**
 * Vérifie un mot de passe contre une empreinte.
 *
 * Rend `false` sur toute anomalie de format — jamais une exception : une
 * empreinte mal formée est une erreur de configuration, et le comportement sûr
 * est de refuser, pas de laisser passer une exception qui pourrait, quelque part
 * en amont, être confondue avec une panne.
 */
export async function verifierEmpreinte(motDePasse: string, empreinte: string): Promise<boolean> {
  const morceaux = empreinte.split('$');
  if (morceaux.length !== 6) return false;

  const [algorithme, nBrut, rBrut, pBrut, selBrut, attenduBrut] = morceaux;
  if (algorithme !== 'scrypt') return false;
  if (
    nBrut === undefined ||
    rBrut === undefined ||
    pBrut === undefined ||
    selBrut === undefined ||
    attenduBrut === undefined
  ) {
    return false;
  }

  const N = Number.parseInt(nBrut, 10);
  const r = Number.parseInt(rBrut, 10);
  const p = Number.parseInt(pBrut, 10);
  // Bornes : un « N » démesuré lu dans une configuration ferait de la vérification
  // elle-même un déni de service (S13).
  if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false;
  if (!Number.isInteger(r) || r < 1 || r > 32) return false;
  if (!Number.isInteger(p) || p < 1 || p > 16) return false;

  const sel = Buffer.from(selBrut, 'base64url');
  const attendu = Buffer.from(attenduBrut, 'base64url');
  if (sel.length === 0 || attendu.length === 0) return false;

  let calcule: Buffer;
  try {
    calcule = await scrypt(motDePasse, sel, attendu.length, {
      N,
      r,
      p,
      maxmem: memoireMax(N, r),
    });
  } catch {
    return false;
  }

  // `timingSafeEqual` exige des longueurs égales ; la comparaison de longueur, elle,
  // ne fuit rien qu'on ne sache déjà (l'empreinte n'est pas le secret).
  if (calcule.length !== attendu.length) return false;
  return timingSafeEqual(calcule, attendu);
}
