/**
 * `src/assistance/fournisseur.ts` — CE QUI PARLE AU MODÈLE (lot L27)
 *
 * Deux modes, un seul contrat, et **trois verdicts** dont le troisième est le cœur du
 * lot : `indisponible`. Le critère dit, mot pour mot, *« un essai coupe la destination
 * et vérifie que le produit rend “indisponible” — jamais une réponse inventée, jamais
 * un silence »*. C'est le même arbitrage qu'« indeterminé » au lot L23, et pour la même
 * raison : **un produit qui comble un trou est pire qu'un produit qui dit qu'il y en a un.**
 *
 * ── ⚠️ LE MODE LOCAL NE SORT PAS, ET C'EST MESURABLE ──────────────────────
 *
 * Il vise la **boucle locale** — la configuration le refuse autrement —, et l'unité
 * systemd atteint la boucle locale et rien d'autre. `IPAddressDeny=any` reste donc
 * **intact** : *si la fonction marche alors que rien n'est ouvert, c'est qu'elle ne
 * sort pas.* C'est la seule preuve qui ne se contourne pas.
 *
 * ── ⚠️ LE MODE EXTERNE NE SUIT AUCUNE REDIRECTION (barrière n° 3) ──────────
 *
 * `redirect: 'error'`. Une redirection suivie ferait sortir la donnée vers un hôte que
 * **personne n'a déclaré** — c'est-à-dire la destination déclarée contournée par le
 * serveur qu'on interroge. Le produit fait déjà ce choix pour son propre client HTTP
 * (`js/core/api.js`), et il vaut ici bien davantage.
 */

import type { Configuration } from '../config/index.js';

export type VerdictAssistance = 'rendu' | 'refuse' | 'indisponible';

export interface ReponseAssistance {
  readonly verdict: VerdictAssistance;
  /** Le texte rendu, quand il y en a un. */
  readonly texte: string | null;
  /** Ce qui s'est passé, pour l'écran et pour le journal. Jamais une pile d'appel. */
  readonly motif: string;
  readonly octets: number;
}

/** Ce que le monde extérieur sait faire. Remplaçable par le banc. */
export interface TransportAssistance {
  (url: string, invite: string, delaiMs: number): Promise<{ statut: number; texte: string }>;
}

/** Borne de lecture : une réponse n'est pas un téléchargement (contrôle S13). */
const REPONSE_MAX = 40_000;

/**
 * Le transport réel.
 *
 * ⚠️ **Aucune clef d'API n'est passée ici**, et ce n'est pas un oubli : le produit ne
 * détient pas de secret de fournisseur. Un déploiement qui en exige une le pose dans
 * un mandataire local que l'exploitant tient — c'est le même arbitrage que pour le
 * relais de messagerie, et il garde les secrets hors de la base et hors des exports.
 */
export const transportReel: TransportAssistance = async (url, invite, delaiMs) => {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);
  try {
    const reponse = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ prompt: invite, stream: false }),
      signal: controleur.signal,
      // ⚠️ Barrière n° 3 : aucune redirection suivie.
      redirect: 'error',
    });
    const brut = await reponse.text();
    return { statut: reponse.status, texte: brut.slice(0, REPONSE_MAX) };
  } finally {
    clearTimeout(minuteur);
  }
};

/**
 * Lit la réponse d'un service de modèle.
 *
 * ⚠️ **Le cas par défaut est « indisponible », pas « rendu ».** Une réponse dont on ne
 * comprend pas la forme est une réponse qu'on n'a pas reçue — c'est la règle qu'applique
 * déjà `interpreter()` de `src/pieces/clamav.ts`, et elle vaut ici pour la même raison :
 * *rendre ce qu'on n'a pas compris est la faute que ce module existe pour ne pas commettre.*
 */
export function lireReponse(brut: string): string | null {
  let document: unknown;
  try {
    document = JSON.parse(brut);
  } catch {
    return null;
  }
  if (typeof document !== 'object' || document === null) return null;
  const sac = document as Record<string, unknown>;
  // Les deux formes qu'emploient les serveurs de modèles locaux courants.
  if (typeof sac['response'] === 'string') return sac['response'];
  if (Array.isArray(sac['choices'])) {
    const premier = sac['choices'][0] as Record<string, unknown> | undefined;
    const message = premier?.['message'] as Record<string, unknown> | undefined;
    if (typeof message?.['content'] === 'string') return message['content'];
  }
  return null;
}

export interface DemandeAssistance {
  readonly invite: string;
  readonly mode: 'local' | 'externe';
  /** Obligatoire en mode externe ; ignorée en local. */
  readonly destination?: string;
}

/**
 * Soumet une invite, et rend TOUJOURS un verdict.
 *
 * ⚠️ **Cette fonction ne jette jamais.** Un appel d'assistance qui remonte une
 * exception ferait un écran d'erreur là où l'utilisateur attend un texte — et
 * masquerait le fait, qui est une information : *on n'a pas pu demander*.
 */
export async function soumettre(
  demande: DemandeAssistance,
  config: Configuration,
  transport: TransportAssistance = transportReel,
): Promise<ReponseAssistance> {
  const url =
    demande.mode === 'local' ? config.assistance.urlLocale : (demande.destination ?? '');

  if (url === '') {
    return {
      verdict: 'indisponible',
      texte: null,
      motif:
        demande.mode === 'local'
          ? "Aucun modèle local n'est configuré sur ce serveur (IA_URL_LOCALE). " +
            "L'assistance ne propose rien plutôt que d'inventer."
          : "Aucune destination n'est déclarée pour cette filiale.",
      octets: 0,
    };
  }

  let brut: { statut: number; texte: string };
  try {
    brut = await transport(url, demande.invite, config.assistance.delaiMs);
  } catch (erreur) {
    return {
      verdict: 'indisponible',
      texte: null,
      // ⚠️ Borné, et sans pile d'appel : ce motif s'affiche et part au journal.
      motif:
        "Le service d'assistance n'a pas répondu. Ce n'est pas une réponse vide : " +
        "c'est une absence de réponse. — " +
        (erreur instanceof Error ? erreur.message : String(erreur)).slice(0, 300),
      octets: 0,
    };
  }

  if (brut.statut < 200 || brut.statut >= 300) {
    return {
      verdict: 'indisponible',
      texte: null,
      motif: `Le service d'assistance a refusé la demande (code ${String(brut.statut)}).`,
      octets: 0,
    };
  }

  const texte = lireReponse(brut.texte);
  if (texte === null || texte.trim() === '') {
    return {
      verdict: 'indisponible',
      texte: null,
      motif:
        "Le service a répondu dans une forme que ce produit ne sait pas lire. " +
        "Rendre ce qu'on n'a pas compris serait pire que ne rien rendre.",
      octets: Buffer.byteLength(brut.texte, 'utf8'),
    };
  }

  return {
    verdict: 'rendu',
    texte: texte.slice(0, REPONSE_MAX),
    motif: 'Proposition rendue. Elle n’engage rien : relisez avant de vous en servir.',
    octets: Buffer.byteLength(demande.invite, 'utf8'),
  };
}
