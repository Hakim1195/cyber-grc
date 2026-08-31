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
 * Prérequis : `bash db/dev/preparer_base_dev.sh` a été passé une fois sur la machine
 * (rôles créés, `createdb` accordé au propriétaire). Le message d'erreur le rappelle.
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
 */
export function perimetre(utilisateur, filialeId = null, filiales = undefined) {
  return {
    utilisateur,
    filialeId,
    filiales: filiales ?? (filialeId === null ? [] : [filialeId]),
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
     * @param {{utilisateur: string, filialeId: string|null, filiales: string[]}} p
     * @param {(client: import('pg').Client) => Promise<any>} travail
     * @param {{annuler?: boolean}} [options]
     */
    async avecPerimetre(client, p, travail, options = {}) {
      const annuler = options.annuler !== false;
      await client.query('begin');
      try {
        // `set_config(…, true)` = `set local` : la valeur meurt au commit ou au
        // rollback. C'est ce qui rend le cloisonnement compatible avec un pool.
        await client.query(
          `select set_config('grc.utilisateur', $1, true),
                  set_config('grc.filiale_id',  $2, true),
                  set_config('grc.filiales',    $3, true)`,
          [p.utilisateur, p.filialeId ?? '', (p.filiales ?? []).join(',')],
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
