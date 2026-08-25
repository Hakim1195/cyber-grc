/**
 * Accès à PostgreSQL : pool de connexions et positionnement du périmètre de
 * session pour la Row Level Security.
 *
 * ── Le contrat de cloisonnement ──────────────────────────────────────────
 *
 * Le cloisonnement par filiale est appliqué par la base (§2.4 du plan), pas
 * seulement par le code : un oubli de filtre dans une requête ne peut pas
 * provoquer de fuite entre filiales. Pour que la politique RLS ait de quoi
 * décider, chaque transaction commence par déclarer son périmètre au moyen de
 * trois paramètres de session, conformément à `backend/db/CONVENTIONS.md` §11 :
 *
 *     grc.utilisateur    identifiant de l'utilisateur de la transaction
 *     grc.filiale_id     filiale ACTIVE — la seule dans laquelle on écrit
 *     grc.filiales       périmètre de LECTURE résolu, séparé par des virgules
 *
 * Ils sont lus côté base par `f_utilisateur_courant()`, `f_filiale_courante()`
 * et `f_filiales_autorisees()`, créées par la migration `001_socle.sql`.
 *
 * Deux règles absolues :
 *
 *  1. **Le périmètre vient de la session serveur, jamais du navigateur.** Aucune
 *     valeur transmise par le client ne doit atteindre ces paramètres sans avoir
 *     été résolue à partir des groupes AD (§2.4, §3.4). C'est la raison pour
 *     laquelle `avecTransaction` exige un objet `PerimetreSession` construit par
 *     la couche d'authentification, et refuse un périmètre vide.
 *
 *  2. **Le réglage est local à la transaction** (`set_config(..., true)`, soit
 *     l'équivalent paramétrable de `set local`). Il meurt au `commit` ou au
 *     `rollback` : une connexion rendue au pool ne peut pas emporter le
 *     périmètre de l'utilisateur précédent. C'est le point qui rend le
 *     cloisonnement compatible avec un pool de connexions.
 *
 * Le rôle applicatif (`grc_app`) n'a pas `bypassrls` et n'est pas propriétaire
 * des tables : il ne peut ni contourner ni désactiver les politiques.
 */

import { readFileSync } from 'node:fs';

import pg from 'pg';
import type { Pool, PoolClient, PoolConfig } from 'pg';

import type { ConfigurationBase } from '../config/index.js';

/* =====================================================================
 *  Périmètre de session
 * ===================================================================== */

/**
 * Périmètre résolu d'une session serveur. Construit par la couche
 * d'authentification (lot L3) à partir des groupes AD, jamais reçu du client.
 */
export interface PerimetreSession {
  /** Identifiant de l'utilisateur, tel qu'il sera tracé dans le journal d'audit. */
  readonly utilisateurId: string;
  /** Filiale active : la seule dans laquelle les écritures sont autorisées. `null` = aucune. */
  readonly filialeId: string | null;
  /** Filiales lisibles. Une seule pour un RSSI de site, plusieurs pour un périmètre Groupe. */
  readonly filiales: readonly string[];
  /**
   * Information applicative : le périmètre couvre-t-il le Groupe entier ?
   * La base ne voit **que** les trois paramètres décrits en tête de fichier —
   * un périmètre Groupe est simplement un `filiales` contenant toutes les
   * filiales actives. Aucun drapeau ne permet de contourner la RLS.
   */
  readonly perimetreGroupe: boolean;
}

/**
 * Périmètre des traitements internes sans utilisateur : migrations, tâches
 * planifiées, vérifications de démarrage. `f_utilisateur_courant()` renvoie
 * déjà `'systeme'` en l'absence de réglage — on le rend ici explicite.
 *
 * Il n'accorde **aucun** accès aux données d'une filiale : `filiales` est vide,
 * donc les politiques de lecture ne renvoient rien. Les opérations qui doivent
 * traverser les filiales (consolidation Groupe, purges) passent par le compte
 * propriétaire et des procédures dédiées, pas par ce périmètre.
 */
export const PERIMETRE_SYSTEME: PerimetreSession = Object.freeze({
  utilisateurId: 'systeme',
  filialeId: null,
  filiales: Object.freeze([]) as readonly string[],
  perimetreGroupe: false,
});

/** Périmètre inutilisable : programmation fautive, jamais une erreur d'utilisateur. */
export class ErreurPerimetre extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurPerimetre';
  }
}

/* =====================================================================
 *  Journal minimal
 * ===================================================================== */

/**
 * Sous-ensemble de l'interface du journal (pino, via Fastify) dont ce module a
 * besoin. Le déclarer ici évite de faire dépendre la couche base de données du
 * serveur HTTP.
 */
export interface JournalMinimal {
  error(donnees: unknown, message?: string): void;
  warn(donnees: unknown, message?: string): void;
  info(donnees: unknown, message?: string): void;
}

/* =====================================================================
 *  Création du pool
 * ===================================================================== */

/**
 * Construit le pool de connexions.
 *
 * Les délais de garde sont posés **à la connexion** (paramètre `options` de
 * libpq) plutôt qu'à chaque requête : ils s'appliquent ainsi à toute requête,
 * y compris celles d'un futur code qui aurait oublié de les poser.
 */
export function creerPool(base: ConfigurationBase, journal?: JournalMinimal): Pool {
  const configuration: PoolConfig = {
    host: base.hote,
    port: base.port,
    database: base.nom,
    user: base.utilisateur,
    password: base.motDePasse,
    application_name: base.nomApplication,
    max: base.poolMax,
    connectionTimeoutMillis: base.delaiConnexionMs,
    idleTimeoutMillis: base.delaiInactiviteMs,
    // `search_path` est figé à `public` : le schéma unique est une décision de
    // conception (backend/db/CONVENTIONS.md §1), pas un réglage d'exploitation.
    options: [
      'search_path=public',
      `statement_timeout=${base.delaiRequeteMs}`,
      `idle_in_transaction_session_timeout=${base.delaiTransactionInactiveMs}`,
      `lock_timeout=${base.delaiVerrouMs}`,
    ]
      .map((option) => `-c ${option}`)
      .join(' '),
    ssl: construireSsl(base),
  };

  const pool = new pg.Pool(configuration);

  // Une connexion inactive coupée par le réseau ou par PostgreSQL émet une
  // erreur sur le pool. Sans écouteur, Node arrête le processus : le service
  // tomberait sur un simple redémarrage de la base.
  pool.on('error', (erreur: Error) => {
    journal?.error(
      { erreur: erreur.message },
      'Connexion PostgreSQL inactive perdue ; elle sera rétablie à la prochaine requête',
    );
  });

  return pool;
}

function construireSsl(base: ConfigurationBase): PoolConfig['ssl'] {
  switch (base.ssl.mode) {
    case 'desactive':
      // Cas nominal : PostgreSQL n'écoute que sur la boucle locale de la même VM (§1.1).
      return false;
    case 'requis':
      // Chiffré, mais sans validation du certificat : ne protège que de l'écoute passive.
      return { rejectUnauthorized: false };
    case 'verifie-ca': {
      if (base.ssl.ca === null) {
        throw new Error('BASE_SSL=verifie-ca exige BASE_SSL_CA (autorité de certification au format PEM).');
      }
      return { rejectUnauthorized: true, ca: readFileSync(base.ssl.ca, 'utf8') };
    }
  }
}

/* =====================================================================
 *  Transactions
 * ===================================================================== */

interface OptionsTransaction {
  /** `true` ouvre la transaction en lecture seule : la base refuse toute écriture. */
  readonly lectureSeule?: boolean;
}

/**
 * Exécute un traitement dans une transaction dont le périmètre RLS est positionné.
 *
 * Tout passe par ici : c'est le seul endroit du serveur où une transaction
 * s'ouvre, donc le seul endroit où le périmètre peut être oublié — et il ne
 * peut pas l'être, puisqu'il est un paramètre obligatoire.
 *
 * Les opérations composites (propagation d'une mesure, cascades de suppression,
 * import d'un lot) s'exécutent dans un seul appel : elles réussissent
 * entièrement ou pas du tout (§1.4).
 */
export async function avecTransaction<T>(
  pool: Pool,
  perimetre: PerimetreSession,
  travail: (client: PoolClient) => Promise<T>,
  options: OptionsTransaction = {},
): Promise<T> {
  validerPerimetre(perimetre, options.lectureSeule === true);

  const client = await pool.connect();
  try {
    await client.query(options.lectureSeule === true ? 'begin read only' : 'begin');
    await appliquerPerimetre(client, perimetre);
    const resultat = await travail(client);
    await client.query('commit');
    return resultat;
  } catch (erreur) {
    try {
      await client.query('rollback');
    } catch {
      // Connexion déjà perdue : il n'y a plus de transaction à annuler, et
      // masquer l'erreur d'origine par celle du rollback n'aiderait personne.
    }
    throw erreur;
  } finally {
    client.release();
  }
}

/**
 * Positionne les trois paramètres lus par les politiques RLS.
 *
 * `set_config(..., true)` est l'équivalent paramétrable de `set local` : la
 * valeur passe par le protocole étendu, jamais par concaténation de chaîne.
 */
async function appliquerPerimetre(client: PoolClient, perimetre: PerimetreSession): Promise<void> {
  await client.query(
    `select set_config('grc.utilisateur', $1, true),
            set_config('grc.filiale_id',  $2, true),
            set_config('grc.filiales',    $3, true)`,
    [perimetre.utilisateurId, perimetre.filialeId ?? '', perimetre.filiales.join(',')],
  );
}

/**
 * Refuse un périmètre incohérent **avant** d'atteindre la base.
 *
 * Un périmètre vide ne provoquerait pas de fuite (les politiques ne
 * renverraient rien), mais il donnerait une liste vide là où l'utilisateur
 * attend ses données : un défaut silencieux, très coûteux à diagnostiquer. Il
 * vaut mieux échouer ici, avec un message qui nomme la cause.
 */
function validerPerimetre(perimetre: PerimetreSession, lectureSeule: boolean): void {
  if (perimetre.utilisateurId.trim() === '') {
    throw new ErreurPerimetre(
      "Périmètre invalide : aucun utilisateur. Toute transaction est attribuée, c'est ce qui rend le journal d'audit exploitable.",
    );
  }
  if (perimetre === PERIMETRE_SYSTEME) return;
  if (perimetre.filiales.length === 0) {
    throw new ErreurPerimetre(
      `Périmètre invalide pour ${perimetre.utilisateurId} : aucune filiale lisible. Le périmètre doit être résolu à partir des groupes AD avant toute transaction.`,
    );
  }
  if (!lectureSeule && perimetre.filialeId === null) {
    throw new ErreurPerimetre(
      `Périmètre invalide pour ${perimetre.utilisateurId} : aucune filiale active alors que la transaction écrit. On n'écrit que dans la filiale sélectionnée.`,
    );
  }
  if (perimetre.filialeId !== null && !perimetre.filiales.includes(perimetre.filialeId)) {
    throw new ErreurPerimetre(
      `Périmètre incohérent pour ${perimetre.utilisateurId} : la filiale active ${perimetre.filialeId} n'appartient pas au périmètre autorisé.`,
    );
  }
}

/* =====================================================================
 *  Exploitation
 * ===================================================================== */

export interface EtatBase {
  readonly ok: boolean;
  readonly latenceMs: number;
  /** Renseigné seulement en cas d'échec ; réservé au journal, jamais renvoyé au client. */
  readonly message?: string;
}

/**
 * Vérifie que la base répond. Utilisé par `/api/sante` et au démarrage.
 * N'ouvre pas de transaction et ne positionne aucun périmètre : la requête ne
 * lit aucune donnée métier.
 */
export async function verifierBase(pool: Pool): Promise<EtatBase> {
  const debut = Date.now();
  try {
    await pool.query('select 1');
    return { ok: true, latenceMs: Date.now() - debut };
  } catch (erreur) {
    return {
      ok: false,
      latenceMs: Date.now() - debut,
      message: erreur instanceof Error ? erreur.message : String(erreur),
    };
  }
}

/**
 * Ferme le pool. Attend la fin des requêtes en cours : appelé après la
 * fermeture du serveur HTTP, il n'y a plus de nouvelle requête à servir.
 */
export async function fermerPool(pool: Pool): Promise<void> {
  await pool.end();
}
