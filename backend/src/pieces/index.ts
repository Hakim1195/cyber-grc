/**
 * Pièces jointes — **la couture, publiée avant l'agent qui la remplira.**
 *
 * Même motif que `src/api/journal.ts` au lot L5 : deux agents travaillent sur
 * cette surface en parallèle (l'ingestion, puis l'exploitation), et un greffon
 * déjà enregistré leur évite d'écrire tous deux dans `src/api/index.ts` — ce que
 * le `PLAN_EXECUTION` §2 interdit.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat fait foi au `CONVENTIONS.md` §31, pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Le modèle EXISTE DÉJÀ. Ne le réinventez pas.** `pieces_jointes`
 * (`001_socle.sql`) porte `sha256`, `etat_analyse`, `quarantaine`,
 * `chemin_stockage`, `signature_virale`, `derniere_reanalyse` et les contraintes
 * qui les lient. `src/config/index.ts` porte les quotas, le socket ClamAV et les
 * chemins de stockage. **L6 n'a besoin d'aucune migration.**
 *
 * Trois points que le §31 tranche et qu'il ne faut pas re-décider :
 *
 *  1. **L'ordre des huit contrôles est figé** (§31.2). Un contrôle joué trop tard
 *     ne protège plus rien : la taille avant l'octet suivant, la signature
 *     binaire avant l'écriture, l'empreinte sur ce qui a été **écrit** et non sur
 *     ce qui a été **reçu**.
 *  2. **La délivrance ne renvoie jamais le type MIME annoncé par le déposant** —
 *     celui qu'on a constaté —, toujours en `attachment` + `nosniff`, et jamais
 *     par Apache : ces fichiers vivent hors racine web.
 *  3. **Si ClamAV ne répond pas, la pièce n'est pas acceptée.** `clamavActif`
 *     désactive l'analyse en développement ; il n'autorise jamais l'échec
 *     silencieux en production.
 *
 * ⚠️ Et la phrase que le `PLAN_SERVEUR` §1.6 met en tête, qui doit rester
 * lisible dans le code : **aucun dispositif ne garantit l'absence de malware.**
 * C'est une défense en profondeur, pas une promesse (§17.5).
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

export interface OptionsPieces {
  /** Pool de connexions. Obligatoire — voir la leçon de `OptionsJournal.pool`. */
  readonly pool: Pool;
}

/**
 * Greffon des pièces jointes.
 *
 * ⚠️ **N'enregistre aucune route pour l'instant, et c'est délibéré** : une route
 * qui existerait en rendant 501 serait une surface publique que personne n'a
 * décidé d'ouvrir. Le §31 dit quoi mettre ici.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonPieces(
  _instance: FastifyInstance,
  _options: OptionsPieces,
): Promise<void> {
  // Lot L6 — voir `CONVENTIONS.md` §31.
}
