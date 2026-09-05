/**
 * Les réglages du lot L12 — **lus dans `config`, avec un repli sur
 * l'environnement tant que la couture n'est pas branchée.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce module existe — et pourquoi il devrait disparaître
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/config/index.ts` n'appartient pas à cet agent, et plusieurs agents
 * travaillent en parallèle sur ce dépôt. Ce module rend le lot **indépendant du
 * calendrier des autres** : il lit ce que `config` porte, et retombe sur
 * `process.env` pour ce qu'elle ne porte pas encore. Le jour où tout est dans
 * `config` — c'est déjà le cas des dix clés SMTP, voir plus bas —, le repli ne
 * s'exerce plus jamais et ce fichier peut fondre en trois lignes.
 *
 * ⚠️ **Il ne faut PAS y voir une seconde source de configuration.** L'ordre est
 * strict et sans exception : `config` d'abord, l'environnement seulement si la
 * clé est absente de `config`. Deux sources qui se disputent la même valeur
 * finissent par ne plus dire la même chose — c'est le défaut que ce dépôt nomme
 * « deux copies d'une même liste » (`CONVENTIONS.md` §19.5).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'état réel : les dix clés SMTP EXISTENT DÉJÀ dans `config`
 * ════════════════════════════════════════════════════════════════════════
 *
 * Mesuré, pas supposé : `src/config/index.ts` porte `ConfigurationSmtp` et le
 * bloc « ── Notifications SMTP ── » depuis le lot L0, et `.env.example` les
 * documente sous « 6. Notifications par courriel (SMTP) [lot L12] ». **Il n'y a
 * donc aucune ligne de configuration à ajouter pour ce lot.**
 *
 * | Clé | Défaut | Comportement si absente |
 * |---|---|---|
 * | `SMTP_ACTIF` | `non` | **rien n'est expédié**, avertissement au journal technique, aucune erreur |
 * | `SMTP_HOTE` | — (requis si actif) | la configuration refuse de démarrer ; le repli rend `''`, et `expedier` échoue proprement |
 * | `SMTP_PORT` | `587` | 587 |
 * | `SMTP_CHIFFREMENT` | `starttls` | STARTTLS exigé ; le relais qui ne l'annonce pas est refusé |
 * | `SMTP_MODE_AUTH` | `basique` | `AUTH PLAIN`, refusé si le canal n'est pas chiffré |
 * | `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE` | — (requis si `basique`) | `AUTH` échoue et le message n'est pas expédié |
 * | `SMTP_EXPEDITEUR` | — (requis si actif) | `expedier` refuse l'adresse vide avant d'ouvrir la moindre prise |
 * | `SMTP_NOM_EXPEDITEUR` | `Cyber GRC` | `Cyber GRC` |
 * | `SMTP_REDIRECTION_RECETTE` | vide | pas de détournement (production) |
 * | `SERVEUR_URL_PUBLIQUE` | — (requis) | la rédaction refuse un lien inutilisable, et le message n'est pas expédié |
 *
 * Deux clés seraient **nouvelles** si l'on voulait rendre la cadence
 * configurable. Elles ne le sont pas aujourd'hui : ce sont des constantes de
 * produit, comme `DELAI_REANALYSE_JOURS_PAR_DEFAUT` l'est de
 * `src/pieces/exploitation.ts`. Le repli les lit quand même dans
 * l'environnement, ce qui permet **au banc** de les fixer sans toucher à
 * `config` :
 *
 * | Clé | Défaut | Absente |
 * |---|---|---|
 * | `NOTIFICATIONS_FENETRE_HEURES` | `20` | fenêtre anti-doublon de 20 h |
 * | `NOTIFICATIONS_HORIZON_JOURS` | `7` | seules les échéances à ≤ 7 jours sont relancées |
 */

import { env } from 'node:process';

import type { ChiffrementRelais, ModeAuthRelais, ParametresRelais } from './smtp.js';

/**
 * Ce que ce module accepte : la `Configuration` du serveur, ou n'importe quelle
 * forme partielle. Volontairement **structurel** plutôt que `Configuration` :
 * un essai peut alors fournir trois champs sans construire une configuration
 * entière, et le code de production passe la vraie sans conversion.
 */
export interface SourceReglages {
  readonly smtp?: {
    readonly actif?: boolean;
    readonly hote?: string;
    readonly port?: number;
    readonly chiffrement?: ChiffrementRelais;
    readonly modeAuth?: ModeAuthRelais;
    readonly utilisateur?: string;
    readonly motDePasse?: string;
    readonly expediteur?: string;
    readonly nomExpediteur?: string;
    readonly redirectionRecette?: string | null;
  };
  readonly serveur?: { readonly urlPublique?: string };
}

export interface ReglagesNotifications {
  readonly actif: boolean;
  readonly relais: ParametresRelais;
  readonly expediteur: string;
  readonly nomExpediteur: string;
  readonly redirectionRecette: string | null;
  readonly urlPublique: string;
  readonly fenetreHeures: number;
  readonly horizonJours: number;
  /**
   * Clés qui ont dû être reprises de l'environnement faute d'être dans
   * `config`. **Vide en fonctionnement normal** ; journalisé sinon, parce
   * qu'un repli silencieux est exactement ce qui fait croire à une
   * configuration qui n'existe pas.
   */
  readonly repliees: readonly string[];
}

function texte(
  fourni: string | null | undefined,
  cle: string,
  defaut: string,
  repliees: string[],
): string {
  if (typeof fourni === 'string') return fourni;
  const brut = env[cle];
  if (brut === undefined || brut.trim() === '') return defaut;
  repliees.push(cle);
  return brut.trim();
}

function entier(
  fourni: number | undefined,
  cle: string,
  defaut: number,
  repliees: string[],
): number {
  if (typeof fourni === 'number' && Number.isFinite(fourni)) return fourni;
  const brut = env[cle];
  if (brut === undefined || brut.trim() === '') return defaut;
  const valeur = Number(brut.trim());
  if (!Number.isFinite(valeur)) return defaut;
  repliees.push(cle);
  return valeur;
}

/** `oui`/`non` — la même convention que `lecteur.booleen` de `config/index.ts`. */
function booleen(fourni: boolean | undefined, cle: string, repliees: string[]): boolean {
  if (typeof fourni === 'boolean') return fourni;
  const brut = (env[cle] ?? '').trim().toLowerCase();
  if (brut === '') return false;
  repliees.push(cle);
  return brut === 'oui' || brut === 'true' || brut === '1';
}

function choix<T extends string>(
  fourni: T | undefined,
  cle: string,
  admis: readonly T[],
  defaut: T,
  repliees: string[],
): T {
  if (fourni !== undefined && admis.includes(fourni)) return fourni;
  const brut = (env[cle] ?? '').trim().toLowerCase() as T;
  if (brut.length === 0) return defaut;
  if (!admis.includes(brut)) return defaut;
  repliees.push(cle);
  return brut;
}

/** Lit tous les réglages du lot. Ne lève jamais : un réglage absent a un défaut. */
export function lireReglages(source: SourceReglages = {}): ReglagesNotifications {
  const repliees: string[] = [];
  const smtp = source.smtp ?? {};

  const chiffrement = choix<ChiffrementRelais>(
    smtp.chiffrement,
    'SMTP_CHIFFREMENT',
    ['starttls', 'tls', 'aucun'],
    'starttls',
    repliees,
  );
  const modeAuth = choix<ModeAuthRelais>(
    smtp.modeAuth,
    'SMTP_MODE_AUTH',
    ['aucun', 'basique', 'oauth2'],
    'basique',
    repliees,
  );
  const redirection = texte(smtp.redirectionRecette, 'SMTP_REDIRECTION_RECETTE', '', repliees);

  return {
    actif: booleen(smtp.actif, 'SMTP_ACTIF', repliees),
    relais: {
      hote: texte(smtp.hote, 'SMTP_HOTE', '', repliees),
      port: entier(smtp.port, 'SMTP_PORT', 587, repliees),
      chiffrement,
      modeAuth,
      utilisateur: texte(smtp.utilisateur, 'SMTP_UTILISATEUR', '', repliees),
      motDePasse: texte(smtp.motDePasse, 'SMTP_MOT_DE_PASSE', '', repliees),
    },
    expediteur: texte(smtp.expediteur, 'SMTP_EXPEDITEUR', '', repliees),
    nomExpediteur: texte(smtp.nomExpediteur, 'SMTP_NOM_EXPEDITEUR', 'Cyber GRC', repliees),
    redirectionRecette: redirection === '' ? null : redirection,
    urlPublique: texte(source.serveur?.urlPublique, 'SERVEUR_URL_PUBLIQUE', '', repliees),
    fenetreHeures: entier(undefined, 'NOTIFICATIONS_FENETRE_HEURES', 20, repliees),
    horizonJours: entier(undefined, 'NOTIFICATIONS_HORIZON_JOURS', 7, repliees),
    repliees,
  };
}
