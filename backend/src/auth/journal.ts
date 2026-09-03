/**
 * Les écritures au journal d'audit que fait la couche d'authentification.
 *
 * `PLAN_SERVEUR` §1.7 et `001_socle.sql` §9 : le journal est en **ajout seul**,
 * chaîné par empreinte. Trois règles s'appliquent à tout ce qui est écrit ici, et
 * elles ne sont pas des précautions de style :
 *
 *  1. **L'acteur ne vient pas de l'appelant.** `utilisateur_id` est écrasé par le
 *     déclencheur de chaînage, qui résout le LOGIN `grc.utilisateur` dans
 *     `utilisateurs.identifiant` (`CONVENTIONS.md` §17.8 et §18.3). Ce module ne
 *     fournit donc jamais cette colonne — il fournit `utilisateur_libelle`, qui
 *     est un confort de lecture explicitement prévu pour survivre à la
 *     suppression du compte **et** pour couvrir l'échec de connexion sur un
 *     login inconnu.
 *  2. **`filiale_id` reste nul** pour tout ce qui précède la résolution du
 *     périmètre. La politique d'ajout l'admet explicitement ; une valeur posée
 *     au hasard serait, elle, refusée (`004_rls.sql` §6).
 *  3. **Rien de secret n'entre dans un résumé.** Pas de mot de passe, pas de
 *     jeton, pas d'empreinte de jeton. Le journal se lit à froid, trois ans plus
 *     tard, par des gens qui n'étaient pas là (contrôle S8).
 */

import type { PoolClient } from 'pg';

/** Actions du journal employées par la couche d'authentification. */
export type ActionAuth =
  | 'connexion_reussie'
  | 'connexion_echouee'
  | 'deconnexion'
  | 'session_expiree'
  | 'session_revoquee'
  | 'refus_autorisation'
  | 'administration';

export interface EntreeJournal {
  readonly action: ActionAuth;
  /** Phrase lisible. Ni secret, ni pile d'appel, ni nom d'objet interne. */
  readonly resume: string;
  /** Identité telle que connue au moment des faits — le login présenté suffit. */
  readonly utilisateurLibelle?: string | null;
  readonly sessionId?: string | null;
  readonly adresseIp?: string | null;
  /** Renseigné seulement quand le périmètre est résolu ET que l'événement lui appartient. */
  readonly filialeId?: string | null;
  readonly entiteType?: string | null;
  readonly entiteId?: string | null;
  /** Charge structurée : groupes reconnus, profil résolu… jamais de secret. */
  readonly valeursApres?: Record<string, unknown> | null;
}

/**
 * Écrit une entrée. La transaction appelante décide de son périmètre : c'est
 * elle qui fixe l'acteur (`grc.utilisateur`) et la filiale d'écriture.
 */
export async function journaliser(client: PoolClient, entree: EntreeJournal): Promise<void> {
  await client.query(
    `insert into "journal_audit"
            ("filiale_id", "utilisateur_libelle", "session_id", "adresse_ip",
             "action", "entite_type", "entite_id", "resume", "valeurs_apres")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entree.filialeId ?? null,
      entree.utilisateurLibelle ?? null,
      entree.sessionId ?? null,
      entree.adresseIp ?? null,
      entree.action,
      entree.entiteType ?? null,
      entree.entiteId ?? null,
      entree.resume,
      entree.valeursApres === undefined || entree.valeursApres === null
        ? null
        : JSON.stringify(entree.valeursApres),
    ],
  );
}
