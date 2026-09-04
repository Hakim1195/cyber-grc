/**
 * Import généralisé — **la couture, publiée avant l'agent qui la remplira.**
 *
 * Même motif que `src/api/journal.ts` (L5) et `src/pieces/index.ts` (L6) : le
 * greffon est enregistré vide, pour qu'aucun agent n'ait à toucher au point
 * d'entrée — ce que le `PLAN_EXECUTION` §2 interdit quand ils sont plusieurs.
 *
 * ⚠️ **LE CONTRAT FAIT FOI AU `CONVENTIONS.md` §33.1 ET §33.2**, pas ici. Deux
 * points s'y tranchent, et aucun ne se re-décide :
 *
 *  1. **Les colonnes se DÉCOUVRENT.** `Depot.decrire()` rend déjà, pour chaque
 *     entité, `{ champ: { type, obligatoire } }` — c'est ce que sert
 *     `GET /api/modele`. Vingt configurations écrites à la main seraient vingt
 *     omissions qui attendent (§19.5). Ce qui ne se dérive pas — le **libellé
 *     humain** d'une colonne et son ordre — s'écrit, parce qu'une omission y est
 *     bruyante : la colonne s'affiche sous son nom technique.
 *  2. **L'idempotence porte sur le FICHIER**, par `imports.cle_idempotence`
 *     (`empreinte_sha256`, déjà en base). Réimporter le même fichier dans la
 *     même filiale est sans effet, et le dit. Une clé naturelle par entité
 *     serait vingt décisions métier, chacune fausse dans un cas limite.
 *
 * ⚠️ **La table `imports` existe déjà** et porte `cle_idempotence`, `statut`,
 * `lignes_lues / creees / mises_a_jour / ignorees / en_erreur`. **Aucune
 * migration n'est nécessaire.**
 *
 * ⚠️ Et la propriété que ce lot ne doit pas perdre : **tout ou rien**. Le
 * constat bloquant B-3 de la porte S2 est né d'un import « Remplacer » qui était
 * une rafale de `DELETE` indépendants — une coupure de VPN au milieu laissait la
 * filiale à moitié détruite. `avecTransaction` est le seul endroit où une
 * transaction s'ouvre ; tout l'import tient dedans.
 */

import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import type { Configuration } from '../config/index.js';

export interface OptionsImport {
  readonly pool: Pool;
  readonly config: Configuration;
}

/**
 * Greffon d'import généralisé.
 *
 * ⚠️ N'enregistre aucune route pour l'instant, et c'est délibéré : une route qui
 * rendrait 501 serait une surface publique que personne n'a décidé d'ouvrir.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonImport(
  _instance: FastifyInstance,
  _options: OptionsImport,
): Promise<void> {
  // Lot L7 — voir `CONVENTIONS.md` §33.1 et §33.2.
}
