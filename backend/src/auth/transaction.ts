/**
 * La transaction d'ouverture de session — **le seul endroit du serveur qui pose
 * `grc.authentification`.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Condition d'entrée E1, moitié applicative
 * ════════════════════════════════════════════════════════════════════════
 *
 * La migration `007` a refermé `sessions`, `session_filiales` et
 * `session_domaines` : leur écriture exige désormais que la transaction ait posé
 * `grc.authentification = 'oui'`. La moitié SQL de cette propriété ne vaut que
 * si la moitié TypeScript est **étroite** : un seul point de passage, qui pose
 * le réglage et rien d'autre.
 *
 * Le voici. Trois choses le rendent sûr, et aucune n'est une discipline :
 *
 *  1. **Il passe par `avecTransaction`.** Le pool reste le seul endroit du
 *     serveur où une transaction s'ouvre : ce module n'appelle jamais
 *     `pool.connect()` et n'émet jamais son propre `begin`. Le périmètre est
 *     donc posé, validé et rendu local exactement comme partout ailleurs.
 *  2. **Le réglage est posé en portée LOCALE** (`set_config(…, true)`), en
 *     première instruction du corps. Il meurt au `commit` comme au `rollback`.
 *     C'est ce qui empêche le défaut N-4 de la porte S1 : un réglage laissé en
 *     portée session serait hérité par la transaction suivante servie par la
 *     même connexion, `appliquerPerimetre` ne l'écrasant pas.
 *  3. **Rien ici ne choisit un périmètre.** Le périmètre est un paramètre, et
 *     il vient de la résolution des groupes AD ou de `PERIMETRE_SYSTEME`.
 *
 * ⚠️ Ce que cela **n'apporte pas** (`CONVENTIONS.md` §17.5) : le réglage est une
 * déclaration que la session fait sur elle-même, pas un privilège. Il arrête la
 * faute de programmation — une écriture du substrat par un chemin qui ne l'a pas
 * déclarée — et pas un rôle applicatif compromis. C'est écrit dans la migration
 * `007`, et c'est vrai des deux côtés.
 */

import type { Pool, PoolClient } from 'pg';

import { avecTransaction } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';

/**
 * Exécute un travail dans une transaction habilitée à écrire le substrat de
 * session.
 *
 * @param perimetre périmètre de la transaction. `PERIMETRE_SYSTEME` pour les
 *   événements antérieurs à la résolution de l'identité (échec de connexion,
 *   compte sans périmètre) ; le périmètre résolu dès qu'il existe, pour que le
 *   journal d'audit puisse imputer l'événement à quelqu'un (§17.8).
 */
export async function avecTransactionAuthentification<T>(
  pool: Pool,
  perimetre: PerimetreSession,
  travail: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return await avecTransaction(pool, perimetre, async (client) => {
    await client.query(`select set_config('grc.authentification', 'oui', true)`);
    return await travail(client);
  });
}
