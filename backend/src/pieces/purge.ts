/**
 * Le balayeur du magasin — **la seconde moitié de « supprimer supprime ».**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constats **Q-232** et **Q-233**, porte S8
 * ════════════════════════════════════════════════════════════════════════
 *
 * `pieces_jointes` porte un rattachement **polymorphe** et aucune clé
 * étrangère vers l'entité qu'elle documente : **le schéma ne peut pas
 * cascader**. Le correctif de Q-230 avait pris le relais dans **une** route ;
 * cinq autres chemins de disparition l'ignoraient — les cascades du schéma, et
 * la purge de `POST /api/reprise` en mode « remplacer », qui vidait seize
 * collections sans retirer une seule pièce.
 *
 * Le relais est désormais pris **par la base**, sur chaque table porteuse
 * (migration `017`, `f_pieces_suivent_leur_porteur`). Mais un déclencheur ne
 * peut pas toucher au disque, et l'ordre n'est pas indifférent
 * (`magasin.retirerDuMagasin`) :
 *
 *   > **la ligne d'abord, le fichier APRÈS le commit.**
 *
 * L'inverse laisserait, sur une transaction annulée, une ligne qui pointe dans
 * le vide — une preuve d'audit perdue. Le déclencheur inscrit donc le chemin
 * dans `pieces_a_purger` ; **ce module vide cette file**, une fois la
 * transaction validée.
 *
 * ⚠️ **La file est le point de rendez-vous, et c'est ce qui la rend supérieure
 * à six correctifs.** Ce qu'une panne y laisse est retrouvé au balayage suivant
 * au lieu d'être perdu de vue — y compris ce qu'a produit un `delete` tapé dans
 * `psql`, que nul correctif applicatif n'aurait vu passer.
 */

import type { Pool } from 'pg';

import { avecTransaction } from '../db/pool.js';
import type { JournalMinimal, PerimetreSession } from '../db/pool.js';
import type { Configuration } from '../config/index.js';
import { retirerDuMagasin } from './magasin.js';

/** Ce qu'un balayage a fait — des comptes, jamais un chemin de stockage. */
export interface BilanPurge {
  /** Fichiers effectivement retirés du magasin. */
  readonly fichiersRetires: number;
  /** Lignes de file consommées (fichiers retirés + pièces en quarantaine). */
  readonly lignesRetirees: number;
  /** Lignes laissées en file : le retrait a échoué, et le fichier reste COMPTÉ. */
  readonly lignesLaissees: number;
}

const BILAN_VIDE: BilanPurge = Object.freeze({
  fichiersRetires: 0,
  lignesRetirees: 0,
  lignesLaissees: 0,
});

/**
 * Borne d'un balayage.
 *
 * Une purge de reprise « remplacer » sur une filiale bien remplie peut mettre
 * quelques milliers de chemins en file d'un coup ; les traiter dans une seule
 * transaction tiendrait des verrous pendant toute la durée des `unlink`. Le
 * reste part au balayage suivant — il y en a un après chaque écriture, et un
 * quotidien.
 */
const LOT_PAR_BALAYAGE = 500;

/**
 * Vide la file de purge du périmètre donné : retire du disque ce que plus
 * aucune ligne ne réclame, puis consomme la ligne de file.
 *
 * ⚠️ **L'ordre interne compte lui aussi, et il est l'inverse du précédent.**
 * On retire le FICHIER, **puis** la ligne de file. Si l'on faisait l'inverse,
 * un échec d'`unlink` laisserait un fichier que plus rien ne recense — c'est-à-
 * dire le défaut même que cette file existe pour fermer. Ici, un échec laisse la
 * ligne : le balayage suivant réessaiera, et le fichier reste **compté**.
 *
 * ⚠️ **Une pièce en QUARANTAINE ne perd pas son fichier.** C'est la matière de
 * l'équipe sécurité, et `DELETE /api/pieces/…` s'en abstient déjà : supprimer un
 * risque effacerait sinon la preuve d'une tentative d'intrusion.
 *
 * ⚠️ **Soyons exacts sur ce que la branche ci-dessous protège, sans quoi elle
 * deviendrait un commentaire qui rassure.** Aujourd'hui le fichier de quarantaine
 * est hors d'atteinte *par construction* : `retirerDuMagasin()` résout sous la
 * racine du **magasin**, et ce fichier-là n'y est plus. La branche ne l'empêche
 * donc de rien — elle **rend l'intention explicite** pour le jour où quelqu'un
 * élargira le balayeur, et surtout elle **émet l'avertissement** que le
 * `GUIDE_EXPLOITATION` §4 bis promet à l'exploitant : à partir de cet instant,
 * plus aucune ligne ne référence ce fichier.
 *
 * Ce qu'elle décide vraiment, c'est que **la ligne de file est consommée quand
 * même**. La garder ferait grossir indéfiniment une file dont « vide » est le
 * seul signal de bonne santé — et une alarme qui sonne toujours ne dit plus rien.
 */
export async function viderFileDePurge(
  pool: Pool,
  config: Configuration,
  perimetre: PerimetreSession,
  journal?: JournalMinimal,
): Promise<BilanPurge> {
  // Sans filiale active, la politique d'écriture de `pieces_a_purger` lèverait
  // GRC04 — mesuré : elle lève même quand aucune ligne n'est candidate, la
  // fonction de périmètre étant évaluée par le scan et non par la ligne.
  if (perimetre.filialeId === null) return BILAN_VIDE;

  return await avecTransaction(pool, perimetre, async (client) => {
    const { rows } = await client.query<{ chemin_stockage: string; quarantaine: boolean }>(
      `select "chemin_stockage", "quarantaine"
         from "pieces_a_purger"
        order by "cree_le", "chemin_stockage"
        limit $1
          for update skip locked`,
      [LOT_PAR_BALAYAGE],
    );
    if (rows.length === 0) return BILAN_VIDE;

    const consommes: string[] = [];
    let fichiersRetires = 0;
    let lignesLaissees = 0;

    for (const ligne of rows) {
      if (ligne.quarantaine) {
        // Le fichier reste en quarantaine ; la ligne de file, elle, part.
        consommes.push(ligne.chemin_stockage);
        journal?.warn(
          { quarantaine: true },
          'Purge du magasin : le porteur d’une pièce EN QUARANTAINE a été supprimé. Le ' +
            'fichier est conservé en quarantaine — c’est la matière de l’équipe sécurité — ' +
            'et plus aucune ligne ne le référence.',
        );
        continue;
      }
      try {
        await retirerDuMagasin(config, ligne.chemin_stockage);
        fichiersRetires += 1;
        consommes.push(ligne.chemin_stockage);
      } catch (erreur) {
        // Magasin en lecture seule, droits perdus, montage absent : la ligne
        // reste en file et le fichier reste COMPTÉ. Le taire le rendrait
        // invisible, ce qui est exactement le défaut d'origine.
        lignesLaissees += 1;
        journal?.error(
          { erreur: erreur instanceof Error ? erreur.message : String(erreur) },
          'Purge du magasin : un fichier n’a pas pu être retiré ; sa ligne reste en file.',
        );
      }
    }

    if (consommes.length > 0) {
      await client.query(`delete from "pieces_a_purger" where "chemin_stockage" = any ($1::text[])`, [
        consommes,
      ]);
    }

    return { fichiersRetires, lignesRetirees: consommes.length, lignesLaissees };
  });
}
