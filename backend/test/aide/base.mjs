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
 *     Groupe, et au moins une ligne dans chacune des 35 tables cloisonnées — et de quoi
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
  'actifs', 'actions', 'approbations', 'audits', 'clients', 'crise',
  'evaluation_mesures', 'evaluations', 'exigences', 'history', 'imports',
  'incidents', 'mco_actions', 'mesure_mise_en_oeuvre', 'pieces_jointes',
  'prestataires', 'processus', 'referentiels_actifs', 'revues', 'risques',
  'scenarios_pra', 'tests_pra', 'traitement_mesures', 'traitements',
]);

/** Tables MIXTES : une ligne de portée Groupe ET une ligne locale par filiale (§4, §16). */
export const TABLES_MIXTES = Object.freeze([
  'document_referentiels', 'documents', 'mesure_catalogue', 'parametres', 'personnes',
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
 * au moins une ligne dans **chacune** des 35 tables cloisonnées (24 de niveau filiale,
 * 5 mixtes, 6 liaisons) — plus deux entrées de journal d'audit.
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
      await c.query("insert into mesure_catalogue (id, nom)   values ('MESURE-G', 'Chiffrement des postes')");
      await c.query("insert into personnes        (id, nom)   values ('PERS-G',   'RSSI groupe')");
      await c.query("insert into documents        (id, titre) values ('DOC-G',    'PSSI du groupe')");
      await c.query("insert into parametres       (id, cle)   values ('PARAM-G',  'essai.groupe')");
      await c.query("insert into document_referentiels (document_id, ref_id) values ('DOC-G', 'anssi')");
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
        await c.query(`insert into risques      (id, filiale_id, nom) values ('RISK-${s}',  $1, 'Rançongiciel')`, f);
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
        await c.query(`insert into referentiels_actifs (id, filiale_id, ref_id, origine) values ('RA-${s}', $1, 'anssi', 'ajout_local')`, f);

        // Tables mixtes, versant LOCAL (le versant Groupe est semé plus haut).
        await c.query(`insert into mesure_catalogue (id, filiale_id, nom)   values ('MESURE-${s}', $1, 'Mesure locale')`, f);
        await c.query(`insert into personnes        (id, filiale_id, nom)   values ('PERS-${s}',   $1, 'Responsable de site')`, f);
        await c.query(`insert into documents        (id, filiale_id, titre) values ('DOC-${s}',    $1, 'Procédure locale')`, f);
        await c.query(`insert into parametres       (id, filiale_id, cle)   values ('PARAM-${s}',  $1, 'essai.local')`, f);
        await c.query(`insert into document_referentiels (document_id, ref_id, filiale_id) values ('DOC-${s}', 'anssi', $1)`, f);

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

        // Le substrat d'authentification (L3) : une session résolue par filiale. Ces
        // tables sont, à ce stade, écrivables sans condition par le rôle applicatif et
        // LISIBLES DE TOUS — dérogation explicite du §17.4, condition d'entrée du lot
        // L3. Les semer est ce qui permet à un test de chargement de RÉCLAMER cette
        // dérogation au lieu de l'ignorer.
        await c.query(
          `insert into sessions (id, jeton_empreinte, utilisateur_id, filiale_active_id, perimetre, expire_le)
               values ($1, $2, $3, $4, 'filiale', now() + interval '1 hour')`,
          [`SESS-${s}`, (s === 'A' ? 'c' : 'd').repeat(64), `USER-${s}`, filiale],
        );
        await c.query('insert into session_filiales (session_id, filiale_id) values ($1, $2)', [`SESS-${s}`, filiale]);

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
