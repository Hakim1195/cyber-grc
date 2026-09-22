/**
 * base.mjs — aide partagée du banc d'essai : une base PostgreSQL neuve par fichier de
 * test, migrée, puis détruite.
 *
 * Écrite pour être utilisée par TOUS les agents du chantier, pas seulement par celui
 * qui l'a écrite : aucun test n'a de raison de recopier cette plomberie.
 *
 * ── Ce qu'elle fait ──────────────────────────────────────────────────────────
 *
 *  1. Crée une base **neuve et privée à cette exécution**, nommée d'après le fichier
 *     de test suivi d'un jeton unique (`socle.test.mjs` →
 *     `grc_essai_socle_<pid>_<n>_<aléa>`), propriété de `grc_proprietaire`.
 *  2. Y repose **le jeu de privilèges de la production** (`deploy/install.sh`) :
 *     rien pour `PUBLIC`, donc pas de `temporary` pour le rôle applicatif
 *     (`CONVENTIONS.md` §17.2). Le banc d'essai doit éprouver la configuration
 *     déployée, pas une configuration plus permissive.
 *  3. Y applique les migrations en appelant `db/migrate.mjs` — le vrai exécuteur,
 *     pas une réimplémentation. Les tests éprouvent donc aussi l'outil de migration,
 *     et une migration 004 écrite demain est prise en compte sans rien changer ici.
 *  4. Fournit des connexions par rôle (`proprietaire`, `app`, `lecture`) et un
 *     enrobage transactionnel qui positionne le périmètre RLS comme le fait
 *     `src/db/pool.ts` en production — `set_config(…, true)`, jamais autre chose.
 *  5. Nettoie **systématiquement** : `fermer()` ferme les connexions puis supprime la
 *     base, et l'ouverture elle-même supprime ce qu'elle vient de créer si les
 *     migrations échouent — sans quoi une base orpheline resterait derrière.
 *  6. Fournit un **jeu d'essai partagé** (`semerJeuEssai`) — deux filiales, un socle de
 *     Groupe, et au moins une ligne dans chacune des tables cloisonnées — et de quoi
 *     éprouver la **concurrence réelle** (`pidSession`, `suivre`, `attendreBlocage`),
 *     ajoutés pour le lot L2 et son risque projet P1 (écrasement silencieux).
 *
 * ── Pourquoi le nom porte un jeton unique ────────────────────────────────────
 *
 * Parce qu'il ne l'a pas toujours porté, et que cela s'est vu. Le nom était dérivé du
 * seul nom de fichier : deux exécutions simultanées de la suite sur la même grappe
 * PostgreSQL — deux agents du chantier, ou une relance lancée avant la fin de la
 * précédente — visaient alors **la même base**. Reproduit à volonté, avec deux
 * signatures distinctes :
 *
 *   - `23505 duplicate key value violates unique constraint "pg_database_datname_index"`
 *     dans `before` (les deux exécutions créent en même temps) ;
 *   - `42501 permission denied to terminate process` dans `after` : le
 *     `drop database … with (force)` de la première tente de couper les connexions
 *     `grc_app` de la seconde, et `grc_proprietaire` n'est pas superutilisateur.
 *     Un `after` en échec est compté par `node --test` comme **un test de plus** —
 *     d'où le décompte anormal « tests 145 · pass 144 · fail 1 » observé une fois,
 *     et jamais reproduit à l'unité.
 *
 * Un banc d'essai instable est pire qu'un banc d'essai absent : il apprend à ignorer
 * les échecs. Le jeton ferme la course à la racine — deux exécutions ne se rencontrent
 * plus jamais — et les bases restent lisibles dans `\l` parce que le nom du fichier
 * de test en reste le préfixe.
 *
 * ── Utilisation ──────────────────────────────────────────────────────────────
 *
 *     import { after, before, test } from 'node:test';
 *     import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
 *
 *     let base;
 *     before(async () => { base = await ouvrirBaseEssai(import.meta.url); });
 *     after(async  () => { await base?.fermer(); });
 *
 *     test('…', async () => {
 *       const client = await base.connexion('proprietaire');
 *       await base.avecPerimetre(client, perimetre('jdupont', 'FIL-1'), async (c) => {
 *         await c.query('insert into …');   // annulé en fin de bloc par défaut
 *       });
 *     });
 *
 * Et pour un test qui a besoin de DONNÉES et de DEUX écrivains simultanés (lot L2) :
 *
 *     const applicatif = await base.connexion('app');
 *     await semerJeuEssai(base, applicatif);            // validé, pas annulé
 *     const t1 = await base.nouvelleConnexion('app');   // deux connexions RÉELLES,
 *     const t2 = await base.nouvelleConnexion('app');   // pas deux transactions simulées
 *
 * ── Ce que le périmètre pose, et pourquoi les QUATRE réglages ────────────────
 *
 * `avecPerimetre` pose les quatre réglages de session lus par les politiques —
 * `grc.utilisateur`, `grc.filiale_id`, `grc.filiales`, `grc.administration_groupe` —
 * **sans condition et à chaque transaction**, exactement comme `appliquerPerimetre()`
 * de `src/db/pool.ts`. Un réglage omis n'est pas un réglage absent : il vaut ce que la
 * transaction précédente y a laissé (constat N-4 de la porte S1).
 *
 * ── Configuration ────────────────────────────────────────────────────────────
 *
 * Les mêmes variables que le serveur (`src/config/index.ts`, `.env.example`), avec
 * des valeurs par défaut de développement pour que `npm test` marche sans réglage :
 *
 *     BASE_HOTE (127.0.0.1) · BASE_PORT (5432)
 *     BASE_UTILISATEUR_PROPRIETAIRE (grc_proprietaire) · BASE_MOT_DE_PASSE_PROPRIETAIRE (dev)
 *     BASE_UTILISATEUR (grc_app) · BASE_MOT_DE_PASSE (dev)
 *
 * Deux variables **propres au banc d'essai** s'y ajoutent, parce que la configuration
 * du serveur ne connaît pas le rôle de lecture (il ne sert qu'à la supervision) :
 *
 *     ESSAI_UTILISATEUR_LECTURE (grc_lecture) · ESSAI_MOT_DE_PASSE_LECTURE (dev)
 *
 * ── PRÉREQUIS MACHINE, à lire avant de monter un environnement ───────────────
 *
 *  1. `bash db/dev/preparer_base_dev.sh` a été passé une fois (rôles créés, `createdb`
 *     accordé au propriétaire). Le message d'erreur le rappelle.
 *  2. **Le client `psql` est installé et sur le `PATH`.** `preparer_base_dev.sh` l'exige
 *     déjà pour monter la base, et `deploy/install.sh` sur la VM cible : la dépendance
 *     existait, elle n'était simplement écrite nulle part. Le banc l'emploie en plus
 *     pour rejouer `db/verifier_cloisonnement.sql` — cent sept contrôles de
 *     cloisonnement portant des méta-commandes `psql` que le pilote `pg` ne sait pas
 *     exécuter (`test/base/demonstration.test.mjs`). Sans `psql`, ces essais
 *     **échouent** ; ils ne se sautent pas, parce qu'un essai sauté rendrait le banc
 *     vert sur une machine où la démonstration n'a pas été jouée.
 *
 * Une exécution tuée par un signal peut laisser une base `grc_essai_…` derrière elle.
 * Pour les balayer : `bash db/dev/preparer_base_dev.sh --purger-bases-essai`.
 */

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import pg from 'pg';

const executerFichier = promisify(execFile);

const RACINE_BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATE = join(RACINE_BACKEND, 'db', 'migrate.mjs');

/** Rôles du §14 des conventions, et la variable d'environnement qui porte leur secret. */
const ROLES = Object.freeze({
  proprietaire: { defautNom: 'grc_proprietaire', varNom: 'BASE_UTILISATEUR_PROPRIETAIRE', varMdp: 'BASE_MOT_DE_PASSE_PROPRIETAIRE' },
  app: { defautNom: 'grc_app', varNom: 'BASE_UTILISATEUR', varMdp: 'BASE_MOT_DE_PASSE' },
  lecture: { defautNom: 'grc_lecture', varNom: 'ESSAI_UTILISATEUR_LECTURE', varMdp: 'ESSAI_MOT_DE_PASSE_LECTURE' },
});

function reglages(source = process.env) {
  const texte = (nom, defaut) => {
    const valeur = (source[nom] ?? '').trim();
    return valeur === '' ? defaut : valeur;
  };
  // Le nom de rôle finit interpolé dans un « create database … owner » et dans les
  // « grant » de `appliquerPrivileges` : la DDL n'admet pas de requête paramétrée.
  // Même motif que `src/config/index.ts` et `db/migrate.mjs` pour le nom de base.
  const identite = (role) => {
    const nom = texte(ROLES[role].varNom, ROLES[role].defautNom);
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(nom)) {
      throw new Error(`${ROLES[role].varNom} : « ${nom} » n'est pas un nom de rôle PostgreSQL valide.`);
    }
    return { nom, motDePasse: texte(ROLES[role].varMdp, 'dev') };
  };

  return {
    hote: texte('BASE_HOTE', '127.0.0.1'),
    port: Number.parseInt(texte('BASE_PORT', '5432'), 10),
    proprietaire: identite('proprietaire'),
    app: identite('app'),
    lecture: identite('lecture'),
  };
}

/* =====================================================================
 *  Nom de la base d'essai
 * ===================================================================== */

/** Bases ouvertes par ce processus — sert à numéroter les jetons, rien de plus. */
let compteurBases = 0;

/**
 * Jeton d'unicité d'une base d'essai : le processus, le rang de la base dans ce
 * processus, et quatre octets d'aléa.
 *
 * Les trois sont nécessaires. Le pid distingue deux exécutions simultanées de la
 * suite ; le rang distingue deux bases d'une même exécution ; l'aléa couvre la
 * réutilisation d'un pid après redémarrage d'un conteneur, où deux exécutions
 * peuvent porter le même numéro à quelques secondes d'intervalle.
 */
function jetonUnique() {
  compteurBases += 1;
  return `${process.pid.toString(36)}_${compteurBases}_${randomBytes(4).toString('hex')}`;
}

/**
 * Nom de la base d'essai : le fichier de test, puis un jeton **unique à chaque
 * appel**.
 *
 * `…/test/base/socle.test.mjs` → `grc_essai_socle_1a2b_1_9f3c7d01`.
 *
 * Le préfixe garde le nom du fichier pour que la base reste identifiable dans `\l`
 * et dans un message d'assertion ; le jeton garantit que deux exécutions
 * simultanées — deux agents, ou une relance hâtive — ne visent jamais la même base.
 * Voir l'en-tête de ce fichier pour la course que cela ferme.
 *
 * @param {string} urlFichierTest normalement `import.meta.url` du fichier de test
 * @param {string} [jeton] jeton d'unicité ; n'en fournir un que pour un test de
 *        cette fonction elle-même
 */
export function nomBaseEssai(urlFichierTest, jeton = jetonUnique()) {
  const fichier = basename(fileURLToPath(urlFichierTest)).replace(/\.test\.mjs$/, '').replace(/\.mjs$/, '');
  const assaini = fichier.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sans_nom';
  // 63 octets est la limite d'un identifiant PostgreSQL. On tronque le **radical**,
  // jamais le jeton : tronquer le jeton rendrait deux bases homonymes, ce qui est
  // précisément ce que l'on cherche à empêcher.
  const suffixe = `_${jeton}`;
  const placeRadical = 63 - 'grc_essai_'.length - suffixe.length;
  return `grc_essai_${assaini.slice(0, Math.max(1, placeRadical))}${suffixe}`;
}

/**
 * Refuse tout nom qui ne serait pas celui d'une base d'essai.
 *
 * Le nom finit **interpolé** dans un `create database` / `drop database` : aucune
 * requête paramétrée n'existe pour la DDL. Il vient d'un nom de fichier, donc d'une
 * source de confiance — mais un contrôle à l'endroit exact de l'interpolation coûte
 * une ligne et vaut mieux qu'une confiance implicite. Il interdit du même coup de
 * supprimer par accident une base qui ne serait pas jetable.
 */
function nomJetableOuEchec(nom) {
  if (!/^grc_essai_[a-z0-9_]{1,52}$/.test(nom)) {
    throw new Error(`Nom de base d'essai refusé : « ${nom} ». Attendu : grc_essai_<radical>_<jeton>.`);
  }
  return nom;
}

/* =====================================================================
 *  Périmètre de session
 * ===================================================================== */

/**
 * Construit un périmètre de session, au format attendu par `avecPerimetre`.
 *
 * Rappel du contrat (`CONVENTIONS.md` §11) : ce périmètre vient de la session
 * serveur. Aucun test ne doit donner l'exemple inverse.
 *
 * @param {string} utilisateur identifiant tracé dans `cree_par` / `modifie_par`
 * @param {string|null} filialeId filiale ACTIVE — la seule où l'on écrit
 * @param {string[]} [filiales] périmètre de LECTURE ; par défaut, la seule filiale active
 * @param {boolean} [administrationGroupe] la transaction écrit-elle des lignes de PORTÉE
 *        GROUPE (les lignes à `filiale_id` nul des tables mixtes, et les tables de
 *        configuration) ? Quatrième réglage de session, `grc.administration_groupe`.
 *        Ce n'est **pas un privilège** : la session le déclare sur elle-même
 *        (`CONVENTIONS.md` §17.4), et il n'élargit jamais la lecture.
 */
export function perimetre(utilisateur, filialeId = null, filiales = undefined, administrationGroupe = false) {
  return {
    utilisateur,
    filialeId,
    filiales: filiales ?? (filialeId === null ? [] : [filialeId]),
    administrationGroupe,
  };
}

/* =====================================================================
 *  Ouverture d'une base d'essai
 * ===================================================================== */

/**
 * Crée une base neuve, y applique les migrations, et rend de quoi la travailler.
 *
 * @param {string} urlFichierTest `import.meta.url` du fichier de test appelant
 * @param {{jusquA?: string}} [options] `jusquA` : n'appliquer les migrations que
 *        jusqu'à ce numéro (utile pour éprouver une migration isolément)
 */
export async function ouvrirBaseEssai(urlFichierTest, options = {}) {
  const conf = reglages();
  const nom = nomJetableOuEchec(nomBaseEssai(urlFichierTest));

  await creerBase(conf, nom);
  try {
    await appliquerPrivileges(conf, nom);
    await appliquerMigrations(conf, nom, options.jusquA);
  } catch (erreur) {
    // La base existe déjà : si la suite échoue, personne n'appellera `fermer()`
    // (l'appelant n'a pas encore d'objet à fermer). On nettoie ici, sinon chaque
    // échec de migration laisse une base derrière lui.
    await supprimerBase(conf, nom).catch(() => {});
    throw erreur;
  }

  /** Connexions ouvertes, à fermer quoi qu'il arrive. */
  const connexions = new Set();
  /** `fermer()` est idempotent : un second appel ne doit rien tenter. */
  let ferme = false;
  /** Une connexion partagée par rôle : la plupart des tests n'en demandent pas plus. */
  const partagees = new Map();

  const base = {
    /** Nom de la base d'essai — utile dans les messages d'assertion. */
    nom,

    /**
     * Réglages de connexion résolus (hôte, port, et les trois rôles avec leur secret).
     *
     * Exposés parce qu'un essai peut avoir besoin d'un CLIENT EXTERNE plutôt que du
     * pilote : `db/verifier_cloisonnement.sql` porte des méta-commandes `psql`
     * (`\pset`, `\echo`) que `pg` ne sait pas exécuter, et c'est ce script-là qui
     * démontre le cloisonnement à un auditeur. Les re-dériver dans l'essai créerait
     * une seconde source de vérité pour les mêmes valeurs par défaut — exactement ce
     * que ce banc évite ailleurs.
     */
    reglages: conf,

    /** Connexion partagée pour ce rôle (ouverte à la première demande). */
    async connexion(role = 'proprietaire') {
      if (!partagees.has(role)) partagees.set(role, await base.nouvelleConnexion(role));
      return partagees.get(role);
    },

    /**
     * Connexion neuve et indépendante. Nécessaire dès qu'un test a besoin de deux
     * transactions simultanées (verrouillage optimiste, concurrence) ou d'observer
     * l'état d'une session vierge.
     */
    async nouvelleConnexion(role = 'proprietaire') {
      const identite = conf[role];
      if (identite === undefined) {
        throw new Error(`Rôle inconnu : ${role} (attendu : proprietaire | app | lecture).`);
      }
      const client = new pg.Client({
        host: conf.hote,
        port: conf.port,
        database: nom,
        user: identite.nom,
        password: identite.motDePasse,
        application_name: `cyber-grc-essai-${role}`,
        // Un test qui part en boucle doit échouer, pas bloquer la suite entière.
        options: '-c statement_timeout=15000 -c lock_timeout=5000 -c search_path=public',
      });
      await client.connect();
      connexions.add(client);
      return client;
    },

    /**
     * Exécute `travail` dans une transaction dont le périmètre RLS est positionné,
     * exactement comme `avecTransaction` de `src/db/pool.ts`.
     *
     * Par défaut la transaction est **annulée** en sortie : chaque test repart d'une
     * base identique, et l'ordre des tests n'a pas d'importance. Passez
     * `{ annuler: false }` pour valider.
     *
     * @param {import('pg').Client} client
     * @param {{utilisateur: string, filialeId: string|null, filiales: string[],
     *          administrationGroupe?: boolean}} p
     * @param {(client: import('pg').Client) => Promise<any>} travail
     * @param {{annuler?: boolean}} [options]
     */
    async avecPerimetre(client, p, travail, options = {}) {
      const annuler = options.annuler !== false;
      await client.query('begin');
      try {
        // `set_config(…, true)` = `set local` : la valeur meurt au commit ou au
        // rollback. C'est ce qui rend le cloisonnement compatible avec un pool.
        //
        // LES QUATRE RÉGLAGES, ET SANS CONDITION — comme `appliquerPerimetre()` de
        // `src/db/pool.ts`, dont cette fonction se réclame. Elle n'en posait que
        // trois : `grc.administration_groupe` était laissé à ce que la transaction
        // précédente y avait mis. Sans conséquence tant que les tests le posaient
        // eux-mêmes en portée transaction, mais c'est exactement le motif du constat
        // N-4 de la porte S1 (« un réglage simplement omis est un réglage hérité »),
        // et un banc d'essai qui ne reproduit pas le geste de production ne prouve
        // rien de la production.
        await client.query(
          `select set_config('grc.utilisateur',           $1, true),
                  set_config('grc.filiale_id',            $2, true),
                  set_config('grc.filiales',              $3, true),
                  set_config('grc.administration_groupe', $4, true)`,
          [
            p.utilisateur,
            p.filialeId ?? '',
            (p.filiales ?? []).join(','),
            p.administrationGroupe === true ? 'oui' : '',
          ],
        );
        const resultat = await travail(client);
        await client.query(annuler ? 'rollback' : 'commit');
        return resultat;
      } catch (erreur) {
        await client.query('rollback').catch(() => {
          /* Transaction déjà perdue : ne pas masquer l'erreur d'origine. */
        });
        throw erreur;
      }
    },

    /** Raccourci de lecture : renvoie directement les lignes. */
    async lignes(client, texte, valeurs = []) {
      const resultat = await client.query(texte, valeurs);
      return resultat.rows;
    },

    /** Raccourci : première colonne de la première ligne, ou `undefined`. */
    async valeur(client, texte, valeurs = []) {
      const resultat = await client.query(texte, valeurs);
      if (resultat.rowCount === 0) return undefined;
      return Object.values(resultat.rows[0])[0];
    },

    /**
     * Ferme tout et supprime la base. Appelé depuis un `after()`, il s'exécute même
     * si un test a échoué — c'est la seule façon de ne pas laisser derrière soi des
     * dizaines de bases orphelines.
     *
     * Idempotent : un `after()` rejoué, ou un `fermer()` appelé aussi dans le corps
     * d'un test, ne doit pas transformer un nettoyage en échec de test.
     */
    /**
     * Applique les migrations **restantes** — le geste exact du déploiement.
     *
     * ⚠️ **Elle existe pour une classe de défaut que le reste du banc ne peut pas
     * voir.** `ouvrirBaseEssai()` migre une base VIDE puis la sème : une migration
     * qui reprend des données existantes n'en rencontre jamais, et les politiques
     * RLS — évaluées par le scan — ne décident de rien quand il n'y a rien à
     * scanner. Le 16/09/2026, la migration `038` est passée sur 2 031 essais verts
     * avec un réglage de session inexistant dans son §0, et le **déploiement** l'a
     * refusée en `GRC04`.
     *
     * L'usage est donc : ouvrir la base avec `{ jusquA: '<précédente>' }`, semer,
     * puis appeler ceci. Voir `test/base/migrations-sur-donnees.test.mjs`.
     *
     * @param {string} [jusquA] s'arrêter après cette migration (défaut : toutes)
     */
    async migrer(jusquA) {
      await appliquerMigrations(conf, nom, jusquA);
    },

    async fermer() {
      if (ferme) return;
      ferme = true;
      for (const client of connexions) {
        await client.end().catch(() => {
          /* Déjà fermée ou connexion perdue : sans conséquence ici. */
        });
      }
      connexions.clear();
      partagees.clear();
      await supprimerBase(conf, nom);
    },
  };

  return base;
}

/**
 * Capture l'erreur d'une promesse attendue en échec.
 *
 * Écrire `await assert.rejects(…)` cache le `SQLSTATE`, or c'est précisément ce que
 * les tests du socle doivent vérifier (`GRC01`, `GRC03`, `42501`). Cette aide rend
 * l'erreur pour qu'on l'inspecte, et échoue explicitement si rien n'a été levé.
 *
 * @param {Promise<any>|(() => Promise<any>)} promesseOuFonction
 * @returns {Promise<Error & {code?: string}>}
 */
export async function erreurAttendue(promesseOuFonction) {
  try {
    await (typeof promesseOuFonction === 'function' ? promesseOuFonction() : promesseOuFonction);
  } catch (erreur) {
    return erreur;
  }
  throw new Error("Aucune erreur levée alors qu'une erreur était attendue.");
}

/* =====================================================================
 *  Jeu d'essai partagé — deux filiales, toutes les tables cloisonnées
 * ===================================================================== */

/** Filiale « depuis laquelle on regarde ». */
export const FILIALE_A = 'FIL-ESSAI-A';
/** Filiale voisine — celle dont rien ne doit jamais remonter. */
export const FILIALE_B = 'FIL-ESSAI-B';

/**
 * Tables de NIVEAU FILIALE semées dans les deux filiales (`CONVENTIONS.md` §4).
 * Exposée parce qu'un test de chargement doit pouvoir dire ce qu'il a réellement
 * couvert : un balayage qui ne trouve rien passe pour vert.
 */
export const TABLES_FILIALE = Object.freeze([
  'actifs', 'actions', 'audits', 'clients', 'crise',
  // `derogations` (migration `035`) : l'écart de conformité assumé est TOUJOURS
  // local, `filiale_id not null`. Une dérogation de portée Groupe voudrait dire
  // « le Groupe accepte que ses vingt filiales soient en écart », ce qui n'est
  // pas une dérogation mais un changement de politique.
  'derogations',
  'evaluation_mesures', 'evaluations', 'exigences', 'history', 'imports',
  'incidents', 'mco_actions', 'mesure_mise_en_oeuvre', 'pieces_jointes',
  'prestataires', 'processus', 'referentiels_actifs', 'revues', 'risques',
  'scenarios_pra', 'tests_pra',
]);

/**
 * Tables MIXTES : une ligne de portée Groupe ET une ligne locale par filiale (§4, §16).
 *
 * ⚠️ **`approbations` a quitté la famille « filiale » le 04/09/2026** (migration `012`),
 * sur arbitrage utilisateur : *« une décision groupe se valide une fois au groupe »*.
 * Avant lui, la PSSI du groupe recevait un circuit PAR FILIALE — vingt validations pour
 * un document qui n'en demande qu'une. `risque_catalogue` naît mixte : socle du Groupe,
 * plus les ajouts que chaque filiale peut faire *« si le risque n'est pas déjà présent au
 * niveau groupe »*.
 *
 * ⚠️ **`traitements` et `traitement_mesures` ont quitté la famille « filiale » le
 * 11/09/2026** (migration `027`) : un document de portée Groupe — la PSSI, la charte —
 * ne pouvait se rattacher à AUCUN traitement de l'article 30 tant que la table était
 * `not null` sur `filiale_id`. Le registre de chaque entité juridique reste le cas
 * ordinaire ; la portée Groupe sert les traitements que le GROUPE opère pour toutes ses
 * filiales. `document_etiquettes` naît mixte, comme le document qu'elle étiquette.
 */
export const TABLES_MIXTES = Object.freeze([
  'approbations', 'document_etiquettes',
  // `document_mesures` (migration `036`) : quels contrôles un document prouve.
  // MIXTE comme le document lui-même — la PSSI du Groupe prouve un contrôle du
  // socle, et se lit partout.
  'document_mesures',
  // `analyses_impact` et `analyse_mesures` (migration `039`, action 20.3) : MIXTES
  // comme `traitements`, et pour le même motif — le GROUPE opère des traitements
  // pour toutes ses filiales, et l'analyse de l'annuaire commun se fait une fois.
  'analyses_impact', 'analyse_mesures',
  'document_referentiels', 'documents',
  'mesure_catalogue', 'parametres', 'personnes', 'risque_catalogue',
  'traitement_mesures', 'traitements',
]);

/** Liaisons et tables filles SANS `filiale_id` — l'angle mort du §7. */
export const TABLES_LIAISON = Object.freeze([
  'actif_dependances', 'actif_risques', 'import_erreurs', 'incident_actifs',
  'processus_actifs', 'risque_exigences',
]);

/**
 * Empreinte factice au format du domaine `empreinte_sha256`, DIFFÉRENTE par filiale :
 * `pieces_jointes.chemin_stockage` porte une unicité délibérément GLOBALE (déduplication
 * du stockage), et deux filiales qui déposeraient le même contenu se heurteraient.
 */
const empreinte = (suffixe) => (suffixe === 'A' ? 'a' : 'b').repeat(64);

/**
 * Sème un jeu d'essai complet et **le valide** : deux filiales, un socle de Groupe, et
 * au moins une ligne dans **chacune** des tables cloisonnées — celles de
 * `TABLES_FILIALE`, `TABLES_MIXTES` et `TABLES_LIAISON` ci-dessus —, plus deux entrées
 * de journal d'audit.
 *
 * ⚠️ **Le NOMBRE n'est plus écrit ici, et c'est une correction.** Cette phrase annonçait
 * « 35 tables cloisonnées (24 de niveau filiale, 5 mixtes, 6 liaisons) » : 24 + 5 + 6
 * font 35, mais les trois listes portaient alors 21, 10 et 6 entrées. Le total était
 * juste et sa décomposition fausse, depuis assez longtemps pour que personne ne s'en
 * souvienne. C'est le constat Q-219 dans sa forme la plus banale — *deux points de
 * mesure des mêmes grandeurs divergent, et la divergence est silencieuse*. Le compte
 * qui fait autorité est relevé DANS LE CATALOGUE par
 * `test/api/chargement-filiale.test.mjs`, qui rougit si le schéma bouge.
 *
 * Trois choix, et chacun a une raison :
 *
 *  1. **Semé par le COMPTE APPLICATIF, sous périmètre.** Un jeu d'essai posé par le
 *     propriétaire contournerait la RLS : il prouverait que les données existent, pas
 *     qu'elles sont écrivables par celui qui les écrira en production.
 *  2. **Validé** (`annuler: false`), parce que la concurrence se joue à plusieurs
 *     connexions : une donnée restée dans une transaction ouverte n'existe pour
 *     personne d'autre.
 *  3. **Exhaustif sur les tables cloisonnées**, parce que le lot L2 charge le jeu de
 *     données d'une filiale ENTIER. Un balayage de fuite ne vaut que sur des tables
 *     qui contiennent quelque chose : semer dix-huit tables et balayer trente-cinq,
 *     c'est déclarer vertes dix-sept tables vides.
 *
 * @param {Awaited<ReturnType<typeof ouvrirBaseEssai>>} base
 * @param {import('pg').Client} client connexion du compte **applicatif**
 * @param {{filialeA?: string, filialeB?: string, utilisateur?: string}} [options]
 * @returns {Promise<{a: string, b: string, suffixe: (f: string) => string}>}
 */
export async function semerJeuEssai(base, client, options = {}) {
  const a = options.filialeA ?? FILIALE_A;
  const b = options.filialeB ?? FILIALE_B;
  const utilisateur = options.utilisateur ?? 'semeur';

  await base.avecPerimetre(
    client,
    perimetre(utilisateur, a, [a, b], true),
    async (c) => {
      // ── Socle de niveau Groupe. Son écriture EXIGE grc.administration_groupe,
      //    déjà posé par le périmètre ci-dessus (§17.4).
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'ZZESSA', 'Essai Toulouse',  'FR'),
             ($2, 'ZZESSB', 'Essai Allemagne', 'DE')`,
        [a, b],
      );
      await c.query("insert into mesure_catalogue (id, nom)   values ('MESURE-G', 'Chiffrement des postes')")
      // Socle de risques du Groupe (migration 012) : la DÉFINITION est commune, et
      // chaque filiale l'instancie avec sa propre cotation.
      await c.query(
        "insert into risque_catalogue (id, nom, categorie, origine) values " +
          "('RCAT-G', 'Rançongiciel', 'Malveillance', 'referentiel')",
      );
      await c.query("insert into personnes        (id, nom)   values ('PERS-G',   'RSSI groupe')");
      // Migration `027` : le registre de l'article 30 a un versant Groupe, et la PSSI
      // du groupe s'y rattache. C'est LE cas qui a rendu la migration nécessaire —
      // il vient donc AVANT le document, qui le référence.
      await c.query(
        "insert into traitements (id, nom, finalite) values " +
          "('TRT-G', 'Journal d''audit de l''outil', 'Tracer les accès, trois ans')",
      );
      // ⚠️ La classification est posée DANS L'INSERTION, jamais par un « update »
      // qui suivrait : la colonne `version` porte le verrouillage optimiste, et un
      // semis qui la fait passer à 2 change ce que mesurent les essais d'approbation
      // (`empreinte_objet` / `version_objet`). Mesuré en le faisant : deux essais du
      // circuit ont rougi sur « version_objet = 2 » au lieu de 1.
      await c.query(
        "insert into documents (id, titre, confidentialite, donnees_personnelles, traitement_id) " +
          "values ('DOC-G', 'PSSI du groupe', 'interne', true, 'TRT-G')",
      );
      // ⚠️ Le CATALOGUE porte son libellé et sa valeur par défaut depuis la migration
      //    `048` (`ck_parametres_catalogue_complet`) : sans eux, l'écran des Paramètres
      //    afficherait une clé technique, et une filiale qui n'a rien réglé n'aurait
      //    aucune valeur. Un semis qui les omettrait ferait échouer TOUTES les familles
      //    à l'ouverture de leur base, pour une raison étrangère à ce qu'elles mesurent.
      await c.query(
        `insert into parametres (id, cle, libelle, valeur_defaut, type_valeur)
              values ('PARAM-G', 'essai.groupe', 'Réglage d''essai', '1', 'entier')`,
      );
      await c.query("insert into document_referentiels (document_id, ref_id) values ('DOC-G', 'anssi')");
      await c.query("insert into traitement_mesures (traitement_id, mesure_id) values ('TRT-G', 'MESURE-G')");
      await c.query("insert into document_etiquettes (document_id, etiquette) values ('DOC-G', 'Socle groupe')");
      // Le versant GROUPE de `document_mesures` (migration `036`) : la PSSI du Groupe
      // prouve un contrôle du socle commun. ⚠️ C'est le seul sens ouvert — un document
      // de portée Groupe ne peut PAS s'appuyer sur un contrôle local (constat N-10).
      await c.query("insert into document_mesures (document_id, mesure_id) values ('DOC-G', 'MESURE-G')");
      // ── LA CAMPAGNE DESCENDANTE (migration `044`), ET SES DEUX PARTS ──────────────
      //
      // ⚠️ **Elle est semée ICI, dans la section de niveau GROUPE, et pas dans la boucle
      // par filiale** — ce n'est pas un rangement esthétique : `campagnes` exige
      // `f_administration_groupe()` en écriture, et la convocation d'une filiale aussi
      // (déclencheur `trg_campagne_filiales_deconvocation` pour le retrait, politique
      // pour l'ajout). La boucle par filiale, elle, EFFACE ce drapeau à dessein. Semer
      // les parts là-bas se ferait refuser — ce qui est exactement le comportement voulu.
      //
      // Les deux filiales reçoivent leur part : sans cela, `campagne_filiales` resterait
      // vide d'un côté, et le balayage de cloisonnement rendrait « zéro ligne visible »
      // pour la seule raison qu'il n'y a rien à voir.
      await c.query(
        "insert into campagnes (id, ref_id, intitule, ouverte_le, echeance) values " +
          "('CAMP-G', 'anssi', 'Hygiène ANSSI — campagne annuelle du Groupe', " +
          "date '2026-01-15', date '2026-06-30')",
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id, repondant, accuse_le)
         values ('CAMPF-A', $1, 'CAMP-G', 'RSSI Toulouse', date '2026-01-20'),
                ('CAMPF-B', $2, 'CAMP-G', 'RSSI Allemagne', null)`,
        [a, b],
      );
      // Deux comptes, dont la CLÉ PRIMAIRE diffère de l'identifiant de connexion : le
      // §18.3 exige qu'un test provisionne ce cas, sans quoi il valide une coïncidence
      // plutôt qu'une propriété.
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage) values
             ('USER-A', 'rssi.toulouse',  'RSSI Toulouse'),
             ('USER-B', 'rssi.allemagne', 'RSSI Allemagne')`,
      );

      // ── Puis les deux filiales, à égalité de traitement : ce qui est vrai de A doit
      //    l'être de B, sans quoi une asymétrie du semis passerait pour une propriété.
      await c.query("select set_config('grc.administration_groupe', '', true)");
      for (const [filiale, s] of [[a, 'A'], [b, 'B']]) {
        // On n'écrit que dans la filiale ACTIVE : elle bascule à chaque tour.
        await c.query("select set_config('grc.filiale_id', $1, true)", [filiale]);
        const f = [filiale];

        await c.query(`insert into clients      (id, filiale_id, nom) values ('CLI-${s}',   $1, 'Donneur d''ordre')`, f);
        await c.query(`insert into exigences    (id, filiale_id, code, intitule) values ('EX-${s}', $1, 'A.5.1', 'Politique de sécurité')`, f);
        // Ajout LOCAL au socle : le cas que l'arbitrage du 04/09 autorise expressément —
        // « chaque filiale peut ajouter ses propres risques s'ils ne sont pas déjà
        // présents au niveau groupe ».
        await c.query(`insert into risque_catalogue (id, filiale_id, nom) values ('RCAT-${s}', $1, 'Menace propre au site ${s}')`, f);
        // Celui-ci INSTANCIE le socle du Groupe : c'est ce lien qui permettra de
        // répondre « combien de nos filiales sont exposées à CE risque-là ».
        await c.query(`insert into risques      (id, filiale_id, nom, catalogue_id) values ('RISK-${s}',  $1, 'Rançongiciel', 'RCAT-G')`, f);
        await c.query(`insert into risques      (id, filiale_id, nom) values ('RISK2-${s}', $1, 'Fuite de données')`, f);
        await c.query(`insert into actifs       (id, filiale_id, nom) values ('ACTIF-${s}', $1, 'ERP')`, f);
        await c.query(`insert into actifs       (id, filiale_id, nom) values ('ACTIF2-${s}',$1, 'Serveur de fichiers')`, f);
        await c.query(`insert into processus    (id, filiale_id, nom) values ('BIA-${s}',   $1, 'Expédition')`, f);
        await c.query(`insert into incidents    (id, filiale_id, titre) values ('INC-${s}', $1, 'Hameçonnage')`, f);
        await c.query(`insert into traitements  (id, filiale_id, nom) values ('TRT-${s}',   $1, 'Paie')`, f);
        await c.query(`insert into evaluations  (id, filiale_id, ref_id, code) values ('EVAL-${s}', $1, 'anssi', 'M1')`, f);
        await c.query(`insert into scenarios_pra(id, filiale_id, nom) values ('SCEN-${s}',  $1, 'Perte du site')`, f);
        await c.query(`insert into tests_pra    (id, filiale_id, scenario_id) values ('TEST-${s}', $1, 'SCEN-${s}')`, f);
        await c.query(`insert into actions      (id, filiale_id, titre) values ('ACT-${s}', $1, 'Chiffrer les portables')`, f);
        await c.query(`insert into audits       (id, filiale_id, reference) values ('AUD-${s}', $1, 'AUDIT-2026-01')`, f);
        await c.query(`insert into crise        (id, filiale_id, role) values ('CRISE-${s}', $1, 'Directeur de crise')`, f);
        await c.query(`insert into history      (id, filiale_id, date_point, metrics) values ('HIST-${s}', $1, date '2026-01-15', '{"conformite": 42}'::jsonb)`, f);
        await c.query(`insert into mco_actions  (id, filiale_id, titre) values ('MCO-${s}', $1, 'Tester les sauvegardes')`, f);
        await c.query(`insert into prestataires (id, filiale_id, societe) values ('PRES-${s}', $1, 'Infogérance SA')`, f);
        // ⚠️ **Un SECOND prestataire, et il n'est pas décoratif** : une arête de
        // sous-traitance a besoin de deux bouts, et la contrainte
        // `ck_prestataire_sous_traitance_boucle` refuse qu'un tiers se sous-traite à
        // lui-même. Sans ce second tiers, la table de la migration `042` resterait
        // vide dans le semis — c'est-à-dire un angle mort du balayage de
        // cloisonnement, qui rendrait « zéro ligne visible » pour la seule raison
        // qu'il n'y a rien à voir (`test/api/chargement-filiale.test.mjs`).
        await c.query(`insert into prestataires (id, filiale_id, societe) values ('PRES2-${s}', $1, 'Sauvegardes Atlantique')`, f);
        await c.query(
          `insert into prestataire_sous_traitance
               (id, filiale_id, prestataire_id, sous_traitant_id, service)
           values ('SOUS-${s}', $1, 'PRES-${s}', 'PRES2-${s}', 'Sauvegarde externalisée')`, f);
        // ⚠️ **Le questionnaire de la migration `043`, des DEUX côtés du semis.** Même
        // motif que l'arête ci-dessus : sans lui, `questionnaires_tiers` et
        // `questionnaire_reponses` resteraient vides, et le balayage de cloisonnement
        // rendrait « zéro ligne visible » pour la seule raison qu'il n'y a rien à voir.
        //
        // ⚠️ Les dates respectent les trois règles de chronologie posées par la `043` :
        // on ne relance ni ne reçoit ce qu'on n'a pas envoyé, et une échéance
        // antérieure à l'envoi n'a jamais laissé le temps de répondre. Un semis qui les
        // enfreindrait ferait échouer TOUTES les familles à l'ouverture de leur base,
        // pour une raison étrangère à ce qu'elles mesurent.
        await c.query(
          `insert into questionnaires_tiers
               (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le, echeance)
           values ('QUES-${s}', $1, 'PRES-${s}', 'aircyber',
                   'Questionnaire annuel de sécurité', date '2026-02-01', date '2026-03-15')`, f);
        await c.query(
          `insert into questionnaire_reponses
               (id, filiale_id, questionnaire_id, code, reponse, commentaire)
           values ('QREP-${s}', $1, 'QUES-${s}', 'Q1', 'oui', 'Chiffrement en place depuis 2025.')`, f);
        await c.query(`insert into revues       (id, filiale_id, date_revue) values ('REV-${s}', $1, date '2026-03-01')`, f);
        await c.query(`insert into imports      (id, filiale_id, entite, source, nom_fichier) values ('IMP-${s}', $1, 'risques', 'excel', 'r.xlsx')`, f);
        await c.query(`insert into import_erreurs (import_id, ligne, message) values ('IMP-${s}', 12, 'colonne absente')`);
        await c.query(`insert into approbations (id, filiale_id, objet_type, objet_id, etape) values ('APPRO-${s}', $1, 'risque', 'RISK-${s}', 'acceptation')`, f);
        await c.query(
          `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier, type_mime,
                                       taille_octets, sha256, chemin_stockage)
               values ('PJ-${s}', $1, 'risques', 'RISK-${s}', 'analyse.pdf', 'application/pdf', 4096, $2, $3)`,
          // Deux paramètres pour la même empreinte : réutiliser $2 des deux côtés ferait
          // déduire à PostgreSQL deux types incompatibles pour un seul paramètre
          // (« text versus empreinte_sha256 », 42P08).
          [filiale, empreinte(s), `ab/${empreinte(s)}`],
        );
        // ⚠️ **« anssi » N'EXISTE PAS, et la clé étrangère de la migration `051` l'a
        // dit.** Le semis activait un référentiel dont l'identifiant réel est
        // « anssi-hygiene » : la ligne restait là, invisible de tout écran, comptée
        // pour rien par la couverture — le constat **Q-150** sous une autre forme, et
        // dans le jeu d'essai partagé qui sert de décor à cent trente familles.
        // *Une valeur inventée dans un semis finit par être prise pour la réalité.*
        await c.query(`insert into referentiels_actifs (id, filiale_id, ref_id, origine) values ('RA-${s}', $1, 'anssi-hygiene', 'ajout_local')`, f);
        // Tables mixtes, versant LOCAL (le versant Groupe est semé plus haut).
        await c.query(`insert into mesure_catalogue (id, filiale_id, nom)   values ('MESURE-${s}', $1, 'Mesure locale')`, f);
        await c.query(`insert into personnes        (id, filiale_id, nom)   values ('PERS-${s}',   $1, 'Responsable de site')`, f);
        await c.query(
          `insert into documents (id, filiale_id, titre, confidentialite, donnees_personnelles,
                                  traitement_id)
               values ('DOC-${s}', $1, 'Procédure locale', 'confidentiel', true, 'TRT-${s}')`,
          f,
        );
        // ⚠️ La surcharge vise la clé DU CATALOGUE semé plus haut, et non une clé
        //    inventée : depuis la `048`, un déclencheur refuse qu'une filiale règle une
        //    clé que le produit ne lit nulle part — c'est la propriété qui ferme le
        //    magasin (constat Q-91).
        await c.query(
          `insert into parametres (id, filiale_id, cle, valeur)
                values ('PARAM-${s}', $1, 'essai.groupe', '2')`, f);
        await c.query(`insert into document_referentiels (document_id, ref_id, filiale_id) values ('DOC-${s}', 'anssi', $1)`, f);
        // Le lien document ↔ contrôle (migration `036`). ⚠️ `filiale_id` n'est PAS
        // fourni : le déclencheur de portée le pose depuis le DOCUMENT. Le donner
        // ici mesurerait le semis au lieu de mesurer le déclencheur.
        await c.query(
          `insert into document_mesures (document_id, mesure_id) values ('DOC-${s}', 'MESURE-${s}')`,
        );
        await c.query(`insert into document_etiquettes (document_id, etiquette, filiale_id) values ('DOC-${s}', 'Site ${s}', $1)`, f);

        // ⚠️ Les deux tables du lot L19/L20 sont semées ICI, et ce n'est pas une
        // formalité : `chargement-filiale.test.mjs` exige que le balayage de
        // cloisonnement ait DE LA MATIÈRE table par table. Une table neuve sans
        // ligne y rendrait « zéro visible » pour la seule raison qu'il n'y a rien
        // à voir — c'est-à-dire un angle mort qui se présente comme une preuve.
        await c.query(
          `insert into attestations_lecture (filiale_id, document_id, personne_id, version_document)
               values ($1, 'DOC-${s}', 'PERS-${s}', '1.0')`,
          f,
        );
        await c.query(
          `insert into declarations_reglementaires (filiale_id, incident_id, regime, palier, reference)
               values ($1, 'INC-${s}', 'nis2', 'notification', 'ANSSI-ESSAI-${s}')`,
          f,
        );
        // Et l'écart assumé (migration `035`, action 19.2). Même motif que les deux
        // lignes ci-dessus : une table neuve sans ligne rendrait « zéro visible » au
        // balayage de cloisonnement pour la seule raison qu'il n'y a rien à voir.
        //
        // ⚠️ Son échéance est LOINTAINE et FIXE. Une date relative — « dans un an » —
        // ferait dépendre du jour de l'exécution ce que le semis représente, et un
        // essai qui change de sens au fil du calendrier est un essai qui rougira un
        // matin sans que rien n'ait bougé.
        await c.query(
          `insert into derogations (id, filiale_id, exigence_id, proprietaire, motif, echeance)
               values ('DER-${s}', $1, 'EX-${s}', 'Responsable de site',
                       'Automate du fournisseur incompatible avant le renouvellement.',
                       date '2099-12-31')`,
          f,
        );
        // L'analyse d'impact RGPD (migration `039`, action 20.3), et le lien vers le
        // contrôle qu'elle prévoit. Même motif que les trois blocs ci-dessus.
        //
        // ⚠️ `filiale_id` n'est PAS fourni à `analyse_mesures` : le déclencheur de
        // portée le pose depuis l'ANALYSE. Le donner ici mesurerait le semis au lieu
        // de mesurer le déclencheur.
        //
        // ⚠️ Et la date de revue est LOINTAINE et FIXE, comme l'échéance de la
        // dérogation ci-dessus : une date relative ferait changer de sens à l'état
        // DÉRIVÉ au fil du calendrier, et l'essai rougirait un matin sans que rien
        // n'ait bougé.
        await c.query(
          `insert into analyses_impact (id, filiale_id, traitement_id, statut, date_analyse,
                                        revoir_le, necessite_motif)
               values ('AIPD-${s}', $1, 'TRT-${s}', 'validee', date '2026-02-10',
                       date '2099-12-31',
                       'Traitement de données de santé des salariés (art. 35 §3 b).')`,
          f,
        );
        await c.query(
          `insert into analyse_mesures (analyse_id, mesure_id) values ('AIPD-${s}', 'MESURE-${s}')`,
        );
        // La demande d'exercice de droits (migration `040`, action 20.4). Même motif
        // que les blocs ci-dessus : une table neuve sans ligne rendrait « zéro
        // visible » au balayage de cloisonnement pour la seule raison qu'il n'y a
        // rien à voir.
        //
        // ⚠️ La date de réception est FIXE et ancienne, et l'état DÉRIVÉ qui en
        // découle est donc « en_retard » — délibérément : le semis doit porter le
        // cas qui compte, pas le cas commode. Une date relative ferait changer de
        // sens à l'état au fil du calendrier.
        await c.query(
          `insert into demandes_droits (id, filiale_id, type_demande, recue_le, canal,
                                        demandeur, contact, statut, traitement_id)
               values ('DSAR-${s}', $1, 'acces', date '2026-01-15', 'courriel',
                       'Personne concernée ${s}', 'contact-${s}@exemple.test', 'en_cours',
                       'TRT-${s}')`,
          f,
        );
        // La main courante de crise (migration `041`, action 20.5). ⚠️ Ni `numero`,
        // ni `horodatage`, ni `auteur`, ni les empreintes ne sont fournis : le
        // déclencheur de chaînage les pose tous. Les donner ici mesurerait le semis
        // au lieu de mesurer le déclencheur — et c'est précisément ce déclencheur
        // qui fait qu'une entrée ne se forge pas.
        await c.query(
          `insert into main_courante (filiale_id, incident_id, categorie, texte)
               values ($1, 'INC-${s}', 'constat', 'Alerte reçue, cellule de crise réunie.')`,
          f,
        );
        // Les cinq tables des ateliers EBIOS RM (migration `046`, lot L25). Même
        // motif que les blocs ci-dessus : une table neuve sans ligne rendrait
        // « zéro visible » au balayage de cloisonnement pour la seule raison qu'il
        // n'y a rien à voir — un angle mort qui se présente comme une preuve.
        //
        // ⚠️ La chaîne est COMPLÈTE et interne au semis : l'étude porte sa valeur
        // métier, qui porte son événement redouté ; le couple source / objectif
        // pointe l'entrée LOCALE du socle de connaissances. Semer des lignes qui
        // ne se référencent pas mesurerait l'insertion, pas les clés composites.
        //
        // ⚠️ Et la valeur métier POINTE le processus du BIA du même semis
        // (`BIA-${s}`) : c'est le lien que l'action 25.2 apporte, et le laisser nul
        // ferait passer au vert un essai qui vérifie qu'il n'est pas dupliqué.
        await c.query(
          `insert into ebios_connaissances (id, filiale_id, genre, nom, objectif_vise, categorie)
               values ('EBCO-${s}', $1, 'source_risque', 'Concurrent direct',
                       'Obtenir le plan de fabrication', 'Espionnage industriel')`,
          f,
        );
        await c.query(
          `insert into ebios_etudes (id, filiale_id, nom, perimetre, responsable, statut, debut_le)
               values ('EBET-${s}', $1, 'Analyse de risque du site ${s}',
                       'La chaîne de production et sa supervision.',
                       'Responsable de site', 'en_cours', date '2026-02-03')`,
          f,
        );
        await c.query(
          `insert into ebios_valeurs_metier
               (id, filiale_id, etude_id, nom, nature, processus_id, responsable)
               values ('EBVM-${s}', $1, 'EBET-${s}', 'Ordonnancement de la production',
                       'processus', 'BIA-${s}', 'Responsable de site')`,
          f,
        );
        await c.query(
          `insert into ebios_evenements_redoutes
               (id, filiale_id, valeur_metier_id, nom, besoin, gravite, impacts)
               values ('EBER-${s}', $1, 'EBVM-${s}',
                       'Arrêt de l''ordonnancement au-delà de 24 heures', 'disponibilite', 4,
                       'Arrêt des lignes, pénalités de retard, image client.')`,
          f,
        );
        // ⚠️ `retenue` est vrai ET la justification est fournie : la contrainte
        // `ck_ebios_sources_risque_retenue` exige les deux ensemble, et un semis qui
        // retiendrait sans motiver ferait échouer TOUTES les familles à l'ouverture
        // de leur base, pour une raison étrangère à ce qu'elles mesurent.
        await c.query(
          `insert into ebios_sources_risque
               (id, filiale_id, etude_id, source, objectif_vise, connaissance_id,
                motivation, ressources, activite, retenue, justification)
               values ('EBSR-${s}', $1, 'EBET-${s}', 'Concurrent direct',
                       'Obtenir le plan de fabrication', 'EBCO-${s}', 3, 2, 2, true,
                       'Deux approches de sous-traitants constatées en 2025.')`,
          f,
        );
        // Les trois tables des ateliers 3, 4 et 5 (migration `047`). ⚠️ La chaîne est
        // COMPLÈTE : la partie prenante pointe le PRESTATAIRE du semis, le chemin relie
        // le couple RETENU à l'événement redouté en passant par elle, et le mode
        // opératoire vise l'ACTIF du semis et se rattache au RISQUE du registre.
        //
        // ⚠️ Ce dernier lien est celui qui compte : il éprouve que rattacher un scénario
        // à un risque coté n'écrit RIEN dans ce risque (critère 25.1). Semer des lignes
        // qui ne se référencent pas mesurerait l'insertion, pas les clés composites.
        await c.query(
          `insert into ebios_parties_prenantes
               (id, filiale_id, etude_id, nom, categorie, prestataire_id,
                dependance, penetration, maturite, confiance)
               values ('EBPP-${s}', $1, 'EBET-${s}', 'Mainteneur de la supervision',
                       'fournisseur', 'PRES-${s}', 4, 3, 2, 2)`,
          f,
        );
        await c.query(
          `insert into ebios_scenarios_strategiques
               (id, filiale_id, etude_id, source_id, evenement_redoute_id,
                partie_prenante_id, nom, chemin)
               values ('EBSS-${s}', $1, 'EBET-${s}', 'EBSR-${s}', 'EBER-${s}', 'EBPP-${s}',
                       'Le concurrent passe par le mainteneur de la supervision',
                       'Accès distant du mainteneur, puis rebond vers l''ordonnancement.')`,
          f,
        );
        // ⚠️ « accepter » exigerait sa justification (ck_..._acceptation) : le semis
        //    choisit « reduire », qui n'en demande pas — un semis qui accepterait sans
        //    motiver ferait échouer TOUTES les familles à l'ouverture de leur base.
        await c.query(
          `insert into ebios_scenarios_operationnels
               (id, filiale_id, scenario_strategique_id, nom, mode_operatoire,
                actif_id, vraisemblance, decision, risque_id)
               values ('EBSO-${s}', $1, 'EBSS-${s}',
                       'Hameçonnage ciblé du compte de maintenance',
                       'Courriel façonné depuis des sources ouvertes, puis élévation.',
                       'ACTIF-${s}', 3, 'reduire', 'RISK-${s}')`,
          f,
        );
        // L'échelle de cotation LOCALE de la filiale (migration `049`, action 25.3).
        //
        // ⚠️ **Elle est semée pour la même raison que `pieces_a_purger` ci-dessous** :
        // le socle du Groupe suffirait au produit — une filiale qui ne décide rien cote
        // dessus —, mais il porte `filiale_id` nul, si bien que le balayage de
        // cloisonnement de `chargement-filiale.test.mjs` rendrait « zéro ligne visible »
        // pour la seule raison qu'il n'y a rien de LOCAL à voir. *« Zéro ligne visible »
        // est aussi ce que rend une table vide*, et c'est la moitié du contrôle qui
        // manque le plus souvent.
        //
        // ⚠️ L'ordre est imposé par la base : on gradue un BROUILLON, puis on publie.
        // `trg_echelle_niveaux_figes` refuse d'ajouter un niveau à une échelle en
        // service — c'est ce qui rend la promesse « les cotations portent l'échelle qui
        // les a produites » autre chose qu'une phrase.
        //
        // ⚠️ **Et elle est ARCHIVÉE, délibérément.** Une échelle locale EN VIGUEUR
        // changerait la graduation par défaut de toutes les familles du banc : le socle
        // du Groupe cesserait d'être ce sur quoi le semis cote, et des essais qui n'ont
        // rien à voir avec les échelles se mettraient à mesurer autre chose que ce
        // qu'ils annoncent. Archivée, elle donne sa matière au balayage sans rien
        // déplacer — et elle éprouve au passage le chemin « publier puis retirer du
        // service », que rien d'autre ne parcourt dans le semis.
        await c.query(
          `insert into echelles (id, filiale_id, sujet, nom, revision, statut)
               values ('ECHL-${s}', $1, 'gravite', 'Gravité — site ${s}', 1, 'brouillon')`,
          f,
        );
        await c.query(
          `insert into echelle_niveaux (id, filiale_id, echelle_id, valeur, libelle)
               values ('ECHN-${s}-1', $1, 'ECHL-${s}', 1, 'Mineure'),
                      ('ECHN-${s}-2', $1, 'ECHL-${s}', 2, 'Significative'),
                      ('ECHN-${s}-3', $1, 'ECHL-${s}', 3, 'Grave'),
                      ('ECHN-${s}-4', $1, 'ECHL-${s}', 4, 'Critique')`,
          f,
        );
        await c.query(
          `update echelles set statut = 'en_vigueur', en_vigueur_le = date '2026-03-01'
             where id = 'ECHL-${s}'`,
        );
        await c.query(
          `update echelles set statut = 'archivee', archivee_le = date '2026-04-01'
             where id = 'ECHL-${s}'`,
        );

        // ── Une fiche réflexe LOCALE par filiale (migration `061`) ─────────────
        //
        // ⚠️ **Le socle ne suffit pas**, et c'est le même motif qu'aux échelles
        // ci-dessus : les trois tables des fiches réflexes sont MIXTES, le semis de
        // la migration y met sept fiches de portée GROUPE, et le balayage de
        // cloisonnement rendrait « zéro visible » pour la seule raison qu'aucune
        // ligne n'appartient à une filiale. *« Zéro visible » est aussi ce que rend
        // une table vide.*
        //
        // ⚠️ **Le rôle est délibérément DIFFÉRENT de ceux du socle** : une fiche
        // locale qui viserait « Responsable IT / SSI (Opérationnel) » REMPLACERAIT
        // celle du socle pour cette filiale, et les essais qui comptent les fiches
        // — ceux du navigateur, par exemple — se mettraient à mesurer autre chose
        // que ce qu'ils annoncent. Un rôle propre au site donne sa matière au
        // balayage sans rien déplacer.
        await c.query(
          `insert into fiches_reflexes (id, filiale_id, role, titre, ordre, notes)
               values ('FICHE-${s}', $1, 'Correspondant site ${s}',
                       'Correspondant du site ${s}', 70,
                       'Point de contact local pendant une crise.')`,
          f,
        );
        await c.query(
          `insert into fiche_reflexe_actions (id, filiale_id, fiche_id, ordre, texte)
               values ('FREF-${s}-1', $1, 'FICHE-${s}', 10,
                       'Ouvrir la salle de repli et vérifier les moyens de secours.'),
                      ('FREF-${s}-2', $1, 'FICHE-${s}', 20,
                       'Tenir la liste de présence du site et la transmettre à la cellule.')`,
          f,
        );
        await c.query(
          `insert into contacts_urgence (id, filiale_id, intitule, coordonnee, ordre)
               values ('CTCU-${s}', $1, 'Astreinte du site ${s}', '01 23 45 67 89', 1010)`,
          f,
        );

        // ── Un catalogue LOCAL par filiale (migration `051`, action 26.2) ──────
        //
        // ⚠️ **Le socle ne suffit pas.** Les quatre tables de catalogue sont MIXTES :
        // le semis de la migration y met six catalogues de portée GROUPE, et le
        // balayage de cloisonnement y rendrait « zéro visible » pour la seule raison
        // qu'aucune ligne n'appartient à une filiale — *« zéro visible » est aussi ce
        // que rend une table vide*, et c'est la moitié du contrôle qui manque le plus
        // souvent.
        //
        // ⚠️ La chaîne est COMPLÈTE — référentiel, domaine, exigence, traduction — et
        // l'exigence porte `referentiel_id` EN PLUS de `domaine_id` : la clé étrangère
        // est composite, et semer des lignes qui ne se référencent pas mesurerait
        // l'insertion, pas les clés.
        await c.query(
          `insert into referentiels (id, filiale_id, nom, editeur, version_referentiel,
                                     description, scoring, revision, statut, en_vigueur_le,
                                     publie_le, duree_alerte_mois)
               values ('REFT-${s}', $1, 'Grille du donneur d''ordre ${s}', 'Client ${s}',
                       '2 questions', 'Grille apportée par la filiale.', 'conformite',
                       1, 'en_vigueur', date '2026-02-01', date '2025-06-15', 36)`,
          f,
        );
        await c.query(
          `insert into referentiel_domaines (id, filiale_id, referentiel_id, code, nom, court, rang)
               values ('REFD-${s}', $1, 'REFT-${s}', 'gouvernance', 'Gouvernance', 'Gouv.', 1)`,
          f,
        );
        await c.query(
          `insert into referentiel_exigences
               (id, filiale_id, domaine_id, referentiel_id, code, titre, niveau, priorite, cl, rang)
               values ('REFE-${s}', $1, 'REFD-${s}', 'REFT-${s}', '1.1',
                       'Une politique de sécurité est-elle formalisée ?', 'bronze', 'high', 'CL0', 1)`,
          f,
        );
        await c.query(
          `insert into referentiel_traductions (id, filiale_id, referentiel_id, langue, dictionnaire)
               values ('REFX-${s}', $1, 'REFT-${s}', 'en',
                       '{"nom": "Customer framework"}'::jsonb)`,
          f,
        );

        // ── La quantification financière d'un risque (migration `050`, action 25.4)
        //
        // ⚠️ **Une par filiale, et le triplet est COMPLET** : la contrainte refuse
        // d'écrire deux valeurs sur trois, et un semis à moitié rempli ferait échouer
        // toutes les familles qui appellent `semerJeuEssai` — avec un message de
        // contrainte, pas avec celui du semis.
        //
        // ⚠️ **Les pertes secondaires sont estimées**, contrairement à ce que fait le
        // jeu de découverte : le semis du banc ne doit pas imposer aux familles qui
        // s'en servent un montant qui serait un PLANCHER. Celles qui mesurent le
        // plancher le posent elles-mêmes (`test/quantification/`).
        await c.query(
          `insert into risque_quantification
               (id, filiale_id, risque_id, devise,
                frequence_min, frequence_probable, frequence_max,
                perte_min, perte_probable, perte_max,
                secondaire_min, secondaire_probable, secondaire_max,
                hypotheses, evaluee_le)
           values ('FAIR-${s}', $1, 'RISK-${s}', 'EUR', 1, 1, 1, 1000, 1000, 1000,
                   200, 200, 200, 'Semis du banc : un événement par an.', date '2026-03-01')`,
          f,
        );

        /* ── L'OUVERTURE TECHNIQUE ET LA COLLECTE (lots L22 et L23) ─────────
         *
         * ⚠️ **Cinq tables neuves, et elles sont semées ICI pour une raison qui
         * n'est pas la commodité** : `chargement-filiale.test.mjs` exige que le
         * balayage de cloisonnement ait DE LA MATIÈRE, table par table. Une table
         * neuve sans ligne y rendrait « zéro visible » **parce qu'il n'y a rien à
         * voir** — c'est-à-dire un angle mort qui se présente comme une preuve.
         *
         * ⚠️ Le jeton porte une empreinte FACTICE mais bien formée : aucune de ces
         * lignes ne correspond à un secret existant, et aucune famille ne peut donc
         * s'authentifier « par accident » avec le décor. */
        await c.query(
          `insert into jetons_api (id, filiale_id, nom, empreinte, prefixe, emis_par,
                                   niveau, domaines, expire_le)
               values ('JET-${s}', $1, 'Jeton de semis ${s}', $2, 'grc_semis', 'semeur',
                       'lecture', array['risques']::text[], now() + interval '90 days')`,
          [filiale, (s === 'A' ? 'a' : 'b').repeat(64)],
        );
        await c.query(
          `insert into abonnements_evenements (id, filiale_id, evenement, nom, url, actif)
               values ('ABO-${s}', $1, 'incident_cree', 'Semis ${s}',
                       'https://semis-${s.toLowerCase()}.exemple.interne/webhook', false)`,
          f,
        );
        // ⚠️ L'abonnement ci-dessus est INACTIF, et celui-ci est écrit à la main :
        // un abonnement actif ferait enfiler un événement à CHAQUE incident créé par
        // les cent trente familles qui partagent ce décor, et la file deviendrait un
        // compteur d'autre chose. *Le décor ne doit pas armer un mécanisme.*
        // ⚠️ Le paramètre est passé DEUX fois plutôt qu'une : `$1` sert à la fois de
        // `id_metier` (la colonne) et de `text` (dans le document), et PostgreSQL
        // refuse d'en déduire deux types — `42P08`. Deux places, deux types.
        await c.query(
          `insert into evenements_sortants (id, filiale_id, abonnement_id, evenement, charge)
               values ('EVT-${s}', $1, 'ABO-${s}', 'incident_cree',
                       jsonb_build_object('evenement', 'incident_cree', 'entite', 'incidents',
                                          'id', 'INC-${s}', 'filiale', $2::text))`,
          [filiale, filiale],
        );
        await c.query(
          `insert into connecteurs (id, filiale_id, genre, nom, mesure_id, configuration)
               values ('CONN-${s}', $1, 'sauvegarde', 'Depot de sauvegarde ${s}', 'MESURE-${s}',
                       '{"chemin": "/var/sauvegardes", "age_max_heures": 24}'::jsonb)`,
          f,
        );
        await c.query(
          `insert into collectes (id, filiale_id, connecteur_id, mesure_id, verdict,
                                  fraicheur_jours, detail)
               values ('COLL-${s}', $1, 'CONN-${s}', 'MESURE-${s}', 'conforme', 7,
                       '{"motif": "depot_recent"}'::jsonb)`,
          f,
        );

        /* ── LA VAGUE F : L'ASSISTANCE IA ET LE PORTAIL (lots L27, L28) ────
         *
         * ⚠️ **Semées ICI pour la même raison que les cinq précédentes** : le
         * balayage de cloisonnement exige DE LA MATIÈRE, table par table. Une
         * table neuve sans ligne y rend « zéro visible » **parce qu'il n'y a rien
         * à voir**, c'est-à-dire un angle mort qui se présente comme une preuve.
         *
         * ⚠️ **L'activation IA exige le réglage de l'EXPLOITANT** (barrière n° 1 du
         * lot L27), et le semis le pose explicitement. C'est délibéré : un décor
         * qui contournerait la barrière la rendrait invisible au banc.
         *
         * ⚠️ **Le lien de portail est posé EXPIRÉ**, et c'est le point : le décor
         * ne doit pas laisser traîner un accès public utilisable. Les familles qui
         * mesurent un lien vivant le posent elles-mêmes. */
        await c.query("select set_config('grc.ia_externe_autorisee', 'oui', true)");
        await c.query(
          // ⚠️ **INACTIVE, exactement comme l'abonnement plus haut.** Le décor doit
          // donner de la MATIÈRE au balayage de cloisonnement, il ne doit pas ARMER
          // un mécanisme : une activation vive ferait passer les deux filiales du
          // banc en mode IA externe, et l'essai « une filiale sans activation reste
          // en mode local » deviendrait intestable. Les familles qui mesurent le
          // mode externe l'activent elles-mêmes (`test/assistance/`).
          `insert into ia_activation
               (id, filiale_id, destination, fournisseur, reference_contrat,
                lieu_hebergement, engagement_non_reentrainement, valide_par, valide_le,
                actif)
               values ('IAACT-${s}', $1, 'https://ia-${s.toLowerCase()}.exemple.interne/v1',
                       'Fournisseur de semis', 'CTR-SEMIS', 'Union europeenne',
                       'Annexe du contrat', 'RSSI de semis', date '2026-09-01', false)`,
          f,
        );
        await c.query(
          `insert into ia_appels
               (id, filiale_id, usage_ia, mode, invite, verdict, octets)
               values ('IAAPP-${s}', $1, 'correspondances', 'local',
                       'Invite de semis', 'indisponible', 0)`,
          f,
        );
        await c.query(
          `insert into questionnaires_tiers
               (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le)
               values ('QT-SEMIS-${s}', $1, 'PRES-${s}', 'anssi-hygiene',
                       'Questionnaire de semis', current_date)`,
          f,
        );
        await c.query(
          `insert into portail_liens
               (id, filiale_id, questionnaire_id, empreinte, prefixe, destinataire,
                expire_le)
               values ('PLIEN-${s}', $1, 'QT-SEMIS-${s}', $2, 'grcp_semis',
                       'contact-${s.toLowerCase()}@fournisseur.example',
                       now() - interval '1 day')`,
          [filiale, (s === 'A' ? 'e' : 'f').repeat(64)],
        );

        // La file de purge du magasin (migration `017`). Elle est VIDE en régime
        // normal — c'est une file d'attente, pas un registre —, et c'est
        // précisément pourquoi elle est semée : sans une ligne par filiale, le
        // balayage de cloisonnement de `chargement-filiale.test.mjs` rendrait
        // « zéro ligne visible » pour la seule raison qu'il n'y a rien à voir.
        // Son chemin est distinct de celui de `pieces_jointes` ci-dessus :
        // `uq_pieces_jointes_chemin` est globale, et la file porte la même forme.
        await c.query(
          `insert into pieces_a_purger (chemin_stockage, piece_id, filiale_id, entite_type,
                                        entite_id, motif)
               values ($2, 'PJ-PURGE-${s}', $1, 'risques', 'RISK-${s}', 'semis_essai')`,
          [filiale, `cd/${(s === 'A' ? 'c' : 'd').repeat(64)}`],
        );


        // Le pivot « mesure », des deux côtés du §16.2 : la mise en œuvre est locale,
        // le catalogue est le socle.
        await c.query(`insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-${s}', $1, 'MESURE-${s}')`, f);
        await c.query(`insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-${s}', 'MESURE-${s}', $1)`, f);
        await c.query(`insert into traitement_mesures (traitement_id, mesure_id, filiale_id) values ('TRT-${s}', 'MESURE-${s}', $1)`, f);

        // Les liaisons sans filiale_id : leur politique est leur seule défense (§7).
        await c.query(`insert into risque_exigences  (risque_id, exigence_id)   values ('RISK-${s}', 'EX-${s}')`);
        await c.query(`insert into actif_risques     (actif_id, risque_id)      values ('ACTIF-${s}', 'RISK-${s}')`);
        await c.query(`insert into processus_actifs  (processus_id, actif_id)   values ('BIA-${s}', 'ACTIF-${s}')`);
        await c.query(`insert into incident_actifs   (incident_id, actif_id)    values ('INC-${s}', 'ACTIF-${s}')`);
        await c.query(`insert into actif_dependances (actif_id, actif_cible_id, type) values ('ACTIF-${s}', 'ACTIF2-${s}', 'hosted')`);

        // ── Le substrat d'authentification (L3) — et ce que la migration 007 a changé ──
        //
        // Ces tables étaient « écrivables sans condition par le rôle applicatif »,
        // dérogation explicite du §17.4 et **condition d'entrée E1 du lot L3**. La
        // migration `007_authentification.sql` l'a refermée : leur écriture exige
        // désormais que la transaction ait posé `grc.authentification`, ce que seule
        // la transaction d'ouverture de session fait (`src/auth/transaction.ts`).
        //
        // Le semeur emprunte donc le MÊME chemin que le produit, le temps de deux
        // insertions, et le referme aussitôt : laisser le réglage posé jusqu'au bout
        // de la transaction ferait écrire le reste du jeu d'essai sous un privilège
        // qu'il n'a pas, et le banc mesurerait alors une porte plus large que celle
        // du produit.
        await c.query("select set_config('grc.authentification', 'oui', true)");
        await c.query(
          `insert into sessions (id, jeton_empreinte, utilisateur_id, filiale_active_id, perimetre, expire_le)
               values ($1, $2, $3, $4, 'filiale', now() + interval '1 hour')`,
          [`SESS-${s}`, (s === 'A' ? 'c' : 'd').repeat(64), `USER-${s}`, filiale],
        );
        await c.query('insert into session_filiales (session_id, filiale_id) values ($1, $2)', [`SESS-${s}`, filiale]);
        await c.query("select set_config('grc.authentification', '', true)");

        // Une entrée de journal PAR FILIALE. Elle n'est pas là par symétrie : la
        // lecture du journal n'est délibérément PAS cloisonnée (dérogation qu'impose
        // le chaînage par empreinte, resserrement ferme du lot L5). Un test de fuite
        // doit pouvoir RÉCLAMER cette dérogation au lieu de l'inscrire dans une liste
        // d'exclusions muette.
        await c.query(
          `insert into journal_audit (filiale_id, action, resume) values ($1, 'export', 'entrée d''essai ' || $2)`,
          [filiale, s],
        );
      }
    },
    { annuler: false },
  );

  return { a, b, suffixe: (filiale) => (filiale === a ? 'A' : 'B') };
}

/* =====================================================================
 *  Concurrence — deux transactions réellement simultanées
 * ===================================================================== */

/** Numéro de processus PostgreSQL servant cette connexion (pour observer ses attentes). */
export async function pidSession(client) {
  const resultat = await client.query('select pg_backend_pid() as pid');
  return resultat.rows[0].pid;
}

/**
 * Suit une promesse **sans l'attendre**, et expose un drapeau lisible à tout instant.
 *
 * Indispensable pour prouver qu'une écriture concurrente est réellement BLOQUÉE : sans
 * ce drapeau, un test qui `await` la seconde écriture ne distingue pas « elle a attendu
 * son tour » de « elle est passée devant ».
 *
 * @template T
 * @param {Promise<T>} promesse
 * @returns {{etat: {terminee: boolean, valeur?: T, erreur?: Error}, promesse: Promise<T>}}
 */
export function suivre(promesse) {
  /** @type {{terminee: boolean, valeur?: any, erreur?: Error}} */
  const etat = { terminee: false };
  const suivie = promesse.then(
    (valeur) => {
      etat.terminee = true;
      etat.valeur = valeur;
      return valeur;
    },
    (erreur) => {
      etat.terminee = true;
      etat.erreur = erreur;
      throw erreur;
    },
  );
  // Sans ce puits, un rejet observé plus tard par le test serait d'abord signalé par
  // Node comme « unhandled rejection » — et ferait tomber une suite pour la mauvaise
  // raison.
  suivie.catch(() => {});
  return { etat, promesse: suivie };
}

/**
 * Attend que le processus `pid` soit effectivement **en attente d'un verrou**, et rend
 * la main dès que c'est le cas.
 *
 * Une temporisation fixe (« dors 100 ms, ce doit être bloqué ») rendrait le banc d'essai
 * dépendant de la charge de la machine : trop courte elle donne des verdicts faux, trop
 * longue elle ralentit tout le monde. On interroge donc `pg_stat_activity`, qui dit la
 * vérité, et on échoue avec un message qui NOMME ce qu'on attendait.
 *
 * @param {Awaited<ReturnType<typeof ouvrirBaseEssai>>} base
 * @param {import('pg').Client} observateur connexion TIERCE (ni l'une ni l'autre des
 *        transactions en lice), typiquement celle du propriétaire
 * @param {number} pid
 * @param {{delaiMs?: number}} [options]
 */
export async function attendreBlocage(base, observateur, pid, options = {}) {
  const delaiMs = options.delaiMs ?? 3000;
  const echeance = Date.now() + delaiMs;
  let dernier = 'aucun verrou en attente';
  while (Date.now() < echeance) {
    // `pg_locks` et non `pg_stat_activity` : cette dernière masque `state` et
    // `wait_event` des sessions appartenant à un AUTRE rôle (ici, le compte applicatif
    // observé depuis le compte propriétaire), et l'observateur conclurait
    // éternellement « rien à signaler » sur une session pourtant bloquée. `pg_locks`
    // est lisible de tous et dit exactement ce qu'on cherche : un verrou demandé et
    // NON accordé.
    const lignes = await base.lignes(
      observateur,
      `select locktype, mode from pg_locks where pid = $1 and not granted`,
      [pid],
    );
    if (lignes.length > 0) {
      dernier = lignes.map((l) => `${l.locktype}/${l.mode}`).join(' + ');
      return dernier;
    }
    await pause(20);
  }
  throw new Error(
    `Le processus ${pid} n'attend aucun verrou après ${delaiMs} ms (${dernier}). ` +
      "Si l'écriture concurrente n'est plus bloquée, c'est la propriété qui a changé, pas le délai.",
  );
}

/* =====================================================================
 *  Appel de l'API — ce qui est ici, et ce qui n'y est pas
 * ---------------------------------------------------------------------
 *  Aucune aide d'appel HTTP n'est fournie, et c'est un choix, pas un oubli.
 *
 *  La couche d'accès du lot L2 est arrivée sur le disque pendant l'écriture de ce
 *  banc d'essai (`src/entites/`, `src/erreurs/`, `src/api/`), et
 *  `test/api/depot-contrat.test.mjs` l'éprouve — au niveau du DÉPÔT, en montant un
 *  vrai `creerPool()` sur la base d'essai. Il porte sa propre plomberie (compilation
 *  de `dist/` à la demande, construction du pool) plutôt que de la déposer ici :
 *  tant que les routes bougent, une aide partagée figerait une forme qui n'est pas
 *  encore stable, et un contrat figé trop tôt est un contrat qu'on cesse de
 *  questionner.
 *
 *  Quand les routes seront arrêtées, l'aide d'appel HTTP a sa place ici — et ce
 *  fichier est l'endroit où la mettre, pas un quatrième client recopié dans un
 *  cinquième fichier de test.
 * ===================================================================== */

/* =====================================================================
 *  Cycle de vie de la base — détails d'implémentation
 * ===================================================================== */

/** Ouvre une connexion à la base d'administration `postgres` avec le compte propriétaire. */
async function clientAdministration(conf) {
  const client = new pg.Client({
    host: conf.hote,
    port: conf.port,
    database: 'postgres',
    user: conf.proprietaire.nom,
    password: conf.proprietaire.motDePasse,
    application_name: 'cyber-grc-essai-admin',
  });
  try {
    await client.connect();
  } catch (erreur) {
    throw new Error(
      `Connexion impossible à la base « postgres » comme ${conf.proprietaire.nom} : ${erreur.message}\n` +
        'Préparez d\'abord la machine : bash db/dev/preparer_base_dev.sh',
    );
  }
  return client;
}

/** Petite attente, pour espacer deux tentatives sur un catalogue partagé. */
function pause(millisecondes) {
  return new Promise((resoudre) => {
    setTimeout(resoudre, millisecondes);
  });
}

/**
 * Crée la base d'essai.
 *
 * `template0` plutôt que `template1`, comme le fait `deploy/install.sh` : la base ne
 * dépend pas de ce qui traîne dans le modèle par défaut, et deux créations
 * simultanées ne se disputent pas la même source.
 *
 * Le nom porte un jeton unique (voir `nomBaseEssai`), la base ne peut donc pas
 * préexister — il n'y a rien à supprimer d'abord, et surtout rien à supprimer qui
 * appartiendrait à quelqu'un d'autre.
 */
async function creerBase(conf, nom) {
  const admin = await clientAdministration(conf);
  try {
    await admin.query(
      `create database ${nom} owner ${conf.proprietaire.nom} template template0 encoding 'UTF8'`,
    );
  } catch (erreur) {
    if (erreur.code === '42501') {
      throw new Error(
        `${conf.proprietaire.nom} n'a pas le droit de créer une base d'essai.\n` +
          'Accordez-le en développement : bash db/dev/preparer_base_dev.sh',
      );
    }
    throw erreur;
  } finally {
    await admin.end().catch(() => {});
  }
}

/**
 * Repose sur la base d'essai le jeu de privilèges de la production
 * (`deploy/install.sh`, §« droits de niveau base ») — et pas seulement ceux que
 * `create database` accorde par défaut.
 *
 * L'enjeu tient au privilège **`temporary`**, que `create database` laisse à `PUBLIC`,
 * donc à tout rôle. `CONVENTIONS.md` §17.2 : un rôle qui en dispose crée une table
 * dans `pg_temp`, que PostgreSQL consulte **avant** le `search_path` — même quand
 * celui-ci est fixé à `public`, ce que fait pourtant le pool. Masquer une table du
 * schéma, c'est détourner les fonctions qui la lisent : forge d'une entrée de journal
 * au chaînage rompu, désarmement du déclencheur de cohérence des mesures, garde-fou de
 * couverture RLS rendu aveugle — tout cela démontré à la porte de sécurité S1.
 *
 * Un banc d'essai plus permissif que la production ne prouve rien de la production :
 * c'est ici, et pas ailleurs, que le décalage se corrige.
 */
async function appliquerPrivileges(conf, nom) {
  const admin = await clientAdministration(conf);
  try {
    await admin.query(`revoke all on database ${nom} from public`);
    await admin.query(`grant connect, temporary on database ${nom} to ${conf.proprietaire.nom}`);
    await admin.query(`grant connect on database ${nom} to ${conf.app.nom}, ${conf.lecture.nom}`);
  } finally {
    await admin.end().catch(() => {});
  }
}

/**
 * Supprime la base d'essai. Appelée dans un `after()`, donc après un test qui a pu
 * échouer : elle doit aboutir quoi qu'il arrive.
 *
 * `with (force)` (PostgreSQL 13+, cible 17, développement 16) coupe les connexions
 * résiduelles — celles d'un test interrompu, ou une connexion que le pilote n'a pas
 * fini de refermer. Deux tentatives supplémentaires couvrent la fenêtre pendant
 * laquelle une session vient d'être coupée mais n'a pas encore disparu du catalogue :
 * PostgreSQL rend alors `55006` (« is being accessed by other users »), transitoire.
 *
 * Un échec durable est **signalé**, jamais avalé : une base orpheline se voit dans
 * `\l`, et le message dit laquelle et comment la supprimer.
 */
async function supprimerBase(conf, nom) {
  nomJetableOuEchec(nom);
  let derniere = null;
  for (let tentative = 1; tentative <= 3; tentative += 1) {
    const admin = await clientAdministration(conf).catch(() => null);
    if (admin === null) return; // Grappe déjà inaccessible : rien à nettoyer.
    try {
      await admin.query(`drop database if exists ${nom} with (force)`);
      return;
    } catch (erreur) {
      derniere = erreur;
    } finally {
      await admin.end().catch(() => {});
    }
    await pause(150 * tentative);
  }
  throw new Error(
    `Base d'essai « ${nom} » impossible à supprimer (${derniere?.code ?? '?'} : ${derniere?.message ?? '?'}).\n` +
      `Elle reste sur la grappe. Pour la retirer : dropdb --force ${nom}\n` +
      'Pour balayer toutes les orphelines : bash db/dev/preparer_base_dev.sh --purger-bases-essai',
  );
}

/**
 * Applique les migrations en appelant `db/migrate.mjs`.
 *
 * Un enfant plutôt qu'un import : c'est le binaire réellement invoqué par
 * `deploy/install.sh` qui est éprouvé, code de sortie compris. Si une migration
 * échoue, sa sortie est reproduite telle quelle — c'est elle qui dit pourquoi.
 */
async function appliquerMigrations(conf, nom, jusquA) {
  const arguments_ = jusquA === undefined ? [] : ['--jusqu-a', String(jusquA)];
  try {
    await executerFichier(process.execPath, [MIGRATE, ...arguments_], {
      cwd: RACINE_BACKEND,
      env: {
        ...process.env,
        BASE_HOTE: conf.hote,
        BASE_PORT: String(conf.port),
        BASE_NOM: nom,
        BASE_UTILISATEUR_PROPRIETAIRE: conf.proprietaire.nom,
        BASE_MOT_DE_PASSE_PROPRIETAIRE: conf.proprietaire.motDePasse,
        BASE_UTILISATEUR: conf.app.nom,
        BASE_SSL: 'desactive',
      },
    });
  } catch (erreur) {
    throw new Error(
      `Les migrations ont échoué sur la base d'essai « ${nom} » ` +
        `(code de sortie ${erreur.code}) :\n${erreur.stdout ?? ''}${erreur.stderr ?? ''}`,
    );
  }
}
