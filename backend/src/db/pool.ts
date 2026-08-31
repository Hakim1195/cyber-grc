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
 * QUATRE paramètres de session, conformément à `backend/db/CONVENTIONS.md`
 * §11 et §17.4 :
 *
 *     grc.utilisateur             identifiant de l'utilisateur de la transaction
 *     grc.filiale_id              filiale ACTIVE — la seule dans laquelle on écrit
 *     grc.filiales                périmètre de LECTURE résolu, séparé par des virgules
 *     grc.administration_groupe   'oui' si la transaction écrit des lignes de portée
 *                                 Groupe ; chaîne vide sinon
 *
 * Ils sont lus côté base par `f_utilisateur_courant()`, `f_filiale_courante()`,
 * `f_filiales_autorisees()` (migration `001_socle.sql`) et
 * `f_administration_groupe()` (migration `004_rls.sql`).
 *
 * Deux règles absolues :
 *
 *  1. **Le périmètre vient de la session serveur, jamais du navigateur.** Aucune
 *     valeur transmise par le client ne doit atteindre ces paramètres sans avoir
 *     été résolue à partir des groupes AD (§2.4, §3.4). C'est la raison pour
 *     laquelle `avecTransaction` exige un objet `PerimetreSession` construit par
 *     la couche d'authentification, et refuse un périmètre vide.
 *
 *  2. **Chacun des quatre réglages est local à la transaction**
 *     (`set_config(..., true)`, soit l'équivalent paramétrable de `set local`),
 *     et **chacun des quatre est posé à chaque transaction**, y compris avec la
 *     valeur vide. Il meurt au `commit` ou au `rollback` : une connexion rendue
 *     au pool ne peut pas emporter le périmètre de l'utilisateur précédent.
 *     C'est le point qui rend le cloisonnement compatible avec un pool de
 *     connexions.
 *
 *     Les deux moitiés de cette règle comptent autant l'une que l'autre, et
 *     c'est la seconde qui manquait. Le pool `pg` n'émet **aucun** `DISCARD` en
 *     reprenant une connexion : un réglage qu'`appliquerPerimetre` ne pose pas
 *     n'est pas pour autant absent — il vaut ce que la transaction précédente y
 *     a laissé si elle l'a posé en portée session. Un réglage simplement omis
 *     ici est donc un réglage **hérité**. Tant que `grc.administration_groupe`
 *     n'était pas écrasé à chaque transaction, un `set` employé à la place d'un
 *     `set_config(…, true)` — ou un `set_config(…, false)` oublié après une mise
 *     au point — élevait silencieusement les privilèges de tous les utilisateurs
 *     servis ensuite par la même connexion (porte de sécurité S1, constat N-4 ;
 *     éprouvé par `test/base/pool.test.mjs`). Poser les quatre réglages sans
 *     condition rend la propriété vraie **par construction** : ajouter un
 *     cinquième réglage à `appliquerPerimetre` sans l'y poser toujours ferait
 *     réapparaître le même défaut.
 *
 *     Portée exacte de la garantie, à ne pas surestimer : elle couvre le travail
 *     fait **dans** `avecTransaction`, parce que c'est là que les quatre réglages
 *     sont écrasés. Une requête passée directement par `pool.query()` s'exécute
 *     avec ce que la connexion porte encore, réglages de session compris. C'est
 *     acceptable pour la seule requête qui emprunte ce chemin (`verifierBase`,
 *     un `select 1` qui ne lit aucune donnée métier) et cela doit le rester :
 *     toute lecture ou écriture de donnée métier passe par `avecTransaction`.
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
   * Ce champ n'est **pas** transmis à la base : un périmètre Groupe y est
   * simplement un `filiales` contenant toutes les filiales actives. Aucun
   * réglage de session n'élargit la LECTURE au-delà de cette liste.
   */
  readonly perimetreGroupe: boolean;
  /**
   * La transaction écrit-elle des lignes de **portée Groupe** (les lignes à
   * `filiale_id` nul des tables mixtes, et les tables de configuration
   * `utilisateurs`, `profils`, `profil_domaines`, `groupes_ad`, `filiales`) ?
   *
   * Transmis à la base dans `grc.administration_groupe` ('oui' ou chaîne vide),
   * où `f_administration_groupe()` le lit. Il n'élargit **jamais** la lecture :
   * il n'apparaît dans aucune politique de `select`, et la migration `004_rls`
   * refuse de s'appliquer s'il venait à y apparaître.
   *
   * ⚠️ Ce n'est **pas un privilège** : c'est une déclaration que la session fait
   * sur elle-même (`CONVENTIONS.md` §17.4). Le rôle applicatif peut la poser
   * lui-même, et rien dans la base ne l'en empêche. Elle protège donc de la
   * **faute de programmation** — une écriture Groupe faite par un chemin qui ne
   * l'a pas déclarée — et pas du tout d'un rôle applicatif compromis, qui la
   * poserait avant d'écrire.
   *
   * La barrière réelle est **côté serveur** : c'est le modèle de droits à trois
   * axes du lot L3 qui décide si la session a le profil *Administration* et le
   * périmètre *Groupe*, donc si ce champ peut valoir `true`. Ne pas lire cette
   * ligne comme un contrôle que la base arbitrerait : elle ne l'arbitre pas.
   */
  readonly administrationGroupe: boolean;
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
 *
 * `administrationGroupe` y vaut **faux**, et le vaut explicitement plutôt que par
 * omission : `'systeme'` n'est personne, et une écriture de portée Groupe doit
 * être attribuable à quelqu'un. Une tâche planifiée qui devrait en faire une
 * déclarera son propre périmètre, sous un identifiant qui la nomme.
 */
export const PERIMETRE_SYSTEME: PerimetreSession = Object.freeze({
  utilisateurId: 'systeme',
  filialeId: null,
  filiales: Object.freeze([]) as readonly string[],
  perimetreGroupe: false,
  administrationGroupe: false,
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
    // `search_path` est figé à `public` parce que le schéma unique est une
    // décision de conception (backend/db/CONVENTIONS.md §1), pas un réglage
    // d'exploitation. Ce n'est **pas** une mesure de sécurité, et il ne faut pas
    // compter dessus : PostgreSQL consulte `pg_temp` AVANT le `search_path`,
    // qu'il vaille `public` ou non. Ce qui protège, c'est que chaque fonction
    // fige le sien (`CONVENTIONS.md` §17.2, constats M-1 et N-7 de la porte S1)
    // et que `PUBLIC` n'a pas le privilège `temporary` sur la base — deux
    // propriétés qui vivent dans les migrations et dans `deploy/install.sh`,
    // pas ici.
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
 * Positionne les quatre paramètres lus par les politiques RLS.
 *
 * `set_config(..., true)` est l'équivalent paramétrable de `set local` : la
 * valeur passe par le protocole étendu, jamais par concaténation de chaîne.
 *
 * **Les quatre sont posés sans condition**, y compris avec la valeur vide. Un
 * réglage que cette fonction n'écrase pas n'est pas absent : le pool `pg`
 * n'émet aucun `DISCARD` en reprenant une connexion, donc il vaut ce que la
 * transaction précédente y a laissé (règle 2 de l'entête, constat N-4 de la
 * porte S1). Une valeur vide n'est pas une omission — c'est une remise à zéro,
 * et c'est elle qui rend le réglage local à la transaction par construction.
 *
 * Comparaison stricte à `'oui'` côté base (`f_administration_groupe()`, migration
 * `004_rls.sql`) : toute autre valeur, chaîne vide comprise, vaut non.
 */
async function appliquerPerimetre(client: PoolClient, perimetre: PerimetreSession): Promise<void> {
  await client.query(
    `select set_config('grc.utilisateur',           $1, true),
            set_config('grc.filiale_id',            $2, true),
            set_config('grc.filiales',              $3, true),
            set_config('grc.administration_groupe', $4, true)`,
    [
      perimetre.utilisateurId,
      perimetre.filialeId ?? '',
      perimetre.filiales.join(','),
      perimetre.administrationGroupe ? 'oui' : '',
    ],
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
