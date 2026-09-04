/**
 * serveur.mjs — monter le VRAI serveur du lot L2 sur une base d'essai.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * La porte S2 a été refusée sur une lacune de couverture, et sa première ligne est
 * celle-ci : « **Aucune route.** Rien n'importe `dist/api/index.js`, rien ne monte
 * Fastify, rien n'appelle `inject()` » (`RAPPORT_S2` §5). Six des vingt et un constats
 * vivent à la jointure entre le serveur et le navigateur — l'endroit exact que le banc
 * d'essai ne regardait pas.
 *
 * L'argument qui avait justifié l'absence d'aide HTTP — « tant que les routes bougent,
 * une aide partagée figerait une forme qui n'est pas encore stable » — n'est plus
 * recevable : la porte est précisément le moment où la forme cesse de bouger, et
 * l'auditeur l'a écrit.
 *
 * ── Deux façons de monter, et il faut les deux ───────────────────────────────
 *
 *  1. `monterServeurReel()` appelle **`construireServeur()`**, celui que
 *     `dist/serveur.js` lance en production. On éprouve donc aussi ce qui n'est pas
 *     dans le greffon : les en-têtes posés par `onSend` (S10), le gestionnaire de
 *     route inconnue, le plafond de corps, le traitement d'erreur de haut niveau.
 *     Son résolveur de périmètre est `PerimetreProvisoire` — donc **une seule
 *     filiale**, celle dont le code vient en premier.
 *
 *  2. `monterGreffon()` enregistre `greffonApi` seul, avec un **résolveur fourni par
 *     le test**. C'est le point d'accroche que `OptionsApi` documente pour le lot L3,
 *     et c'est le seul moyen d'obtenir un périmètre de LECTURE Groupe — donc
 *     d'atteindre le `403 refus_perimetre` sur une ligne visible d'une autre filiale,
 *     qui est le constat Q-7 vu par HTTP.
 *
 * Aucune des deux ne simule quoi que ce soit : c'est le code de `src/`, compilé, qui
 * répond.
 *
 * ── Utilisation ──────────────────────────────────────────────────────────────
 *
 *     let base, serveur;
 *     before(async () => {
 *       base = await ouvrirBaseEssai(import.meta.url);
 *       await semerJeuEssai(base, await base.connexion('app'));
 *       serveur = await monterServeurReel(base, { authentification: 'provisoire' });
 *     });
 *     after(async () => { await serveur?.fermer(); await base?.fermer(); });
 *
 *     const r = await serveur.appeler('GET', '/api/donnees');
 *     assert.equal(r.statut, 200);
 *
 * `appeler()` rend `{ statut, entetes, corps }`, `corps` étant déjà décodé quand la
 * réponse est du JSON. `ecouter()` ouvre en plus un vrai port, pour les essais de
 * navigateur.
 *
 * ── Compilation ──────────────────────────────────────────────────────────────
 *
 * `src/` est en TypeScript et ce banc en JavaScript : `compilerSiNecessaire()` produit
 * `dist/` quand il manque ou qu'il est en retard. Exiger un `npm run build` préalable
 * ferait échouer la suite pour une commande oubliée, et l'on apprendrait à ignorer les
 * échecs.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const executerFichier = promisify(execFile);

export const RACINE_BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Racine du frontend, servi tel quel par Apache en production. */
export const RACINE_FRONTEND = join(RACINE_BACKEND, '..', 'cyber-gouvernance_V4');

/* =====================================================================
 *  Compilation de dist/
 * ===================================================================== */

function dateLaPlusRecente(repertoire) {
  let date = 0;
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    date = Math.max(date, entree.isDirectory() ? dateLaPlusRecente(chemin) : statSync(chemin).mtimeMs);
  }
  return date;
}

/**
 * Compile `src/` vers `dist/` si nécessaire.
 *
 * ⚠️ **Ce commentaire disait « idempotent, et sûr en parallèle ». Il avait tort,
 * et la mesure l'a démenti le 04/09/2026** (constat Q-148).
 *
 * Trois agents jouaient le banc en même temps. Chacun appelle cette fonction,
 * chacun lance son `tsc` **dans le même `dist/`**. Deux compilations concurrentes
 * n'écrivent pas les mêmes fichiers au même instant : celle qui finit en dernier
 * laisse derrière elle un `dist/` **composite**, où un module vient d'un état de
 * `src/` et son voisin d'un autre. Symptôme observé : une source restaurée à
 * l'identique, un `dist/consolidation/index.js` portant encore la mutation, et
 * un essai qui rougissait pour un défaut **qui n'était plus dans le code**.
 *
 * C'est la version « répertoire de travail » d'une leçon déjà payée : *« vert »
 * qualifie une révision, jamais un répertoire de travail* — ici, **jamais un
 * `dist/` que quelqu'un d'autre est en train d'écrire**.
 *
 * La parade est un **verrou de fichier**, pas une horloge : les compilations se
 * sérialisent, et celle qui attend recompile ensuite plutôt que de faire
 * confiance à ce que l'autre a laissé. Le verrou est réputé mort au-delà de
 * `VERROU_PERIME_MS` — un processus tué ne doit pas bloquer le banc pour
 * toujours.
 */
const VERROU_PERIME_MS = 240_000;

const dormir = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));

/** Prend le verrou de compilation, ou attend que le détenteur ait fini. */
async function avecVerrouDeCompilation(travail) {
  const verrou = join(RACINE_BACKEND, 'dist', '.compilation.verrou');
  mkdirSync(join(RACINE_BACKEND, 'dist'), { recursive: true });

  for (let tentative = 0; ; tentative += 1) {
    try {
      writeFileSync(verrou, `${process.pid}\n`, { flag: 'wx' });
      break;
    } catch (erreur) {
      if (erreur.code !== 'EEXIST') throw erreur;
      let age = 0;
      try {
        age = Date.now() - statSync(verrou).mtimeMs;
      } catch {
        continue; // le détenteur vient de le rendre : on retente aussitôt.
      }
      if (age > VERROU_PERIME_MS) {
        // Verrou abandonné par un processus mort. On le reprend, en le disant.
        rmSync(verrou, { force: true });
        continue;
      }
      if (tentative > 1200) {
        throw new Error(
          `Le verrou de compilation ${verrou} n'a pas été rendu en 240 s. Un « tsc » est ` +
            'peut-être bloqué : supprimer le fichier débloque le banc.',
        );
      }
      await dormir(200);
    }
  }

  try {
    return await travail();
  } finally {
    rmSync(verrou, { force: true });
  }
}

export async function compilerSiNecessaire() {
  return await avecVerrouDeCompilation(async () => {
    const temoin = join(RACINE_BACKEND, 'dist', 'serveur.js');
    let dateTemoin = 0;
    try {
      dateTemoin = statSync(temoin).mtimeMs;
    } catch {
      dateTemoin = 0;
    }
    // Le témoin doit être postérieur À LA SECONDE PRÈS : `mtimeMs` a une
    // granularité qui varie selon le système de fichiers, et une égalité
    // apparente entre une source qu'on vient d'écrire et un `dist/` qu'on vient
    // de produire ne prouve rien. Dans le doute, on recompile — cela coûte
    // quelques secondes, pendant qu'un faux vert coûte une demi-journée.
    if (dateTemoin > dateLaPlusRecente(join(RACINE_BACKEND, 'src')) + 1000) return;
    await compiler();
  });
}

async function compiler() {
  try {
    await executerFichier(
      process.execPath,
      [join(RACINE_BACKEND, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'],
      { cwd: RACINE_BACKEND },
    );
  } catch (erreur) {
    // Trois agents travaillent en parallèle sur ce dépôt : `src/` peut être en cours
    // d'écriture au moment où la suite tourne. Le dire franchement évite de faire
    // chercher un défaut de test là où il y a une compilation en vol.
    throw new Error(
      "Le banc d'essai n'a pas pu compiler `src/` vers `dist/` : les tests de routes et de " +
        'navigateur ne peuvent pas être joués contre un code qui ne compile pas.\n' +
        `${erreur.stdout ?? ''}${erreur.stderr ?? ''}`,
    );
  }
}

/** Importe un module compilé. Compile d'abord si besoin. */
export async function moduleCompile(chemin) {
  await compilerSiNecessaire();
  return import(`file://${join(RACINE_BACKEND, 'dist', chemin)}`);
}

/* =====================================================================
 *  Configuration de test
 * ===================================================================== */

/**
 * Variables d'environnement minimales acceptées par `chargerConfiguration`.
 *
 * Les valeurs LDAP et le secret de session sont **requis** par la configuration mais
 * ne sont lus par aucun chemin du lot L2 : ce sont des exigences du lot L3, déjà
 * posées. Ils sont donc renseignés avec des valeurs manifestement factices, jamais
 * avec quelque chose qui ressemblerait à un secret.
 */
function environnementDeTest(base, environnement, supplement = {}) {
  return {
    NODE_ENV: environnement,
    // Port réel jamais utilisé : `inject()` n'écoute pas, et `ecouter()` demande
    // explicitement le port 0 à Fastify. La configuration, elle, refuse 0.
    SERVEUR_PORT: '3999',
    BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
    BASE_PORT: process.env.BASE_PORT ?? '5432',
    BASE_NOM: base.nom,
    BASE_UTILISATEUR: process.env.BASE_UTILISATEUR ?? 'grc_app',
    BASE_MOT_DE_PASSE: process.env.BASE_MOT_DE_PASSE ?? 'dev',
    BASE_SSL: 'desactive',
    SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
    LDAP_URL: 'ldaps://annuaire.invalide.test:636',
    LDAP_DN_SERVICE: 'CN=inutilise,DC=invalide,DC=test',
    LDAP_MOT_DE_PASSE_SERVICE: 'inutilise-lot-L3',
    LDAP_BASE_RECHERCHE: 'DC=invalide,DC=test',
    // Le serveur journalise en JSON sur la sortie standard : sans cela, chaque test
    // noierait le rapport de la suite sous les traces de requêtes.
    // Silencieux par défaut ; `SERVEUR_NIVEAU_JOURNAL=error npm test` rallume les
    // traces quand un test échoue sur un 500 et qu'il faut savoir pourquoi.
    SERVEUR_NIVEAU_JOURNAL: process.env.SERVEUR_NIVEAU_JOURNAL ?? 'silent',
    // Réglages propres à un essai — `BASE_POOL_MAX` pour éprouver la saturation
    // du pool sans ouvrir dix connexions réelles, par exemple. Posés EN DERNIER :
    // un essai qui a besoin d'un serveur particulier le dit, plutôt que de monter
    // sa propre configuration à côté de celle-ci.
    ...supplement,
  };
}

/* =====================================================================
 *  Résolveur de périmètre pour les tests
 * ===================================================================== */

/**
 * Résolveur qui rend le périmètre qu'on lui donne.
 *
 * Il respecte scrupuleusement le contrat de `ResolveurPerimetre` — en particulier
 * **`resoudre()` ne prend aucun paramètre** : le périmètre est fixé à la construction
 * ou par `poser()`, jamais déduit d'une requête. Un résolveur de test qui lirait une
 * entête réintroduirait exactement ce que le contrôle S2 interdit, et le banc d'essai
 * donnerait le mauvais exemple.
 */
export class PerimetreFixe {
  constructor(perimetre) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perimetre });
  }

  /** Change le périmètre entre deux appels. Jamais depuis une requête. */
  poser(perimetre) {
    this._perimetre = Object.freeze({ ...perimetre });
  }

  async resoudre() {
    return this._perimetre;
  }

  decrire() {
    return 'périmètre fixé par le banc d’essai (test/aide/serveur.mjs)';
  }
}

/* =====================================================================
 *  Montage
 * ===================================================================== */

function envelopper(instance, config) {
  let adresse = null;

  return {
    instance,
    config,

    /**
     * Appelle une route sans ouvrir de port (`inject`). Rend `{ statut, entetes,
     * corps }` — `corps` décodé si la réponse est du JSON, sinon le texte brut.
     */
    async appeler(methode, url, options = {}) {
      const reponse = await instance.inject({
        method: methode,
        url,
        ...(options.corps === undefined ? {} : { payload: options.corps }),
        ...(options.entetes === undefined ? {} : { headers: options.entetes }),
      });
      let corps = reponse.body;
      if ((reponse.headers['content-type'] ?? '').includes('application/json')) {
        try {
          corps = JSON.parse(reponse.body);
        } catch {
          /* Une réponse annoncée JSON mais illisible est un constat en soi : on
             rend le texte brut, et le test le verra. */
        }
      }
      return { statut: reponse.statusCode, entetes: reponse.headers, corps };
    },

    /** Ouvre un vrai port sur la boucle locale et rend son URL de base. */
    async ecouter() {
      if (adresse !== null) return adresse;
      await instance.listen({ host: '127.0.0.1', port: 0 });
      const info = instance.server.address();
      adresse = `http://127.0.0.1:${info.port}`;
      return adresse;
    },

    async fermer() {
      // ── Les connexions gardées en vie doivent être coupées ──────────────
      //
      // `close()` de Fastify attend que les connexions ouvertes se ferment
      // d'elles-mêmes. Un essai qui a parlé au serveur par un VRAI port
      // (`ecouter()`) laisse derrière lui les sockets que `fetch` garde en vie :
      // le processus d'essai restait alors une minute de plus, sans rien faire,
      // et le fichier semblait coûter trois fois son temps réel. Mesuré : 93 s
      // pour 31 s d'essais.
      instance.server.closeAllConnections?.();
      await instance.close().catch(() => {});
    },
  };
}

/**
 * Monte le serveur **réel** (`construireServeur`) sur la base d'essai.
 *
 * ⚠️ **`authentification` est OBLIGATOIRE, et c'est le remède du constat Q-71.**
 *
 * Le câblage du lot L3 (`src/serveur.ts`) monte l'authentification réelle dès que
 * l'annuaire est configuré — et ce harnais configure `LDAP_*`. Quatre-vingt-quatre
 * essais de l'ère L2 sont donc devenus rouges d'un coup, en `401 !== 200` : ils
 * montaient le serveur réel **sans session**, ce qui avait un sens avant L3 et n'en
 * a plus.
 *
 * Le remède commode aurait été de poser `AUTH_LDAP_ACTIF=non` par défaut ici. Il est
 * **refusé** : un défaut silencieux qui désarme l'authentification est exactement le
 * défaut que Q-71 vient de fermer — une propriété que personne ne déclare et que
 * personne ne vérifie. Chaque essai dit donc ce qu'il monte :
 *
 *   · `'provisoire'` — la session provisoire du lot L2. Elle accorde tous les droits
 *     **et refuse de résoudre hors du développement** (503 partout ailleurs). C'est
 *     la surface à éprouver quand l'essai porte sur le chargement, les écritures
 *     ciblées ou la reprise, et non sur l'identité de qui les demande.
 *   · `'reelle'` — l'authentification du lot L3, contre un annuaire réel.
 *
 * @param {{nom: string}} base base d'essai ouverte par `ouvrirBaseEssai`
 * @param {{authentification: 'provisoire'|'reelle', environnement?: 'production'|'recette'|'developpement', env?: Record<string,string>}} options
 */
export async function monterServeurReel(base, options = {}) {
  if (options.authentification !== 'provisoire' && options.authentification !== 'reelle') {
    throw new Error(
      "monterServeurReel : l'option « authentification » est obligatoire, et vaut " +
        "'provisoire' ou 'reelle'. Elle n'a PAS de valeur par défaut, à dessein " +
        '(constat Q-71) : depuis le lot L3, monter le serveur réel monte aussi ' +
        "l'authentification réelle, et un essai qui ne le dit pas ne sait pas ce " +
        "qu'il éprouve. Un essai de la surface L2 — chargement, écritures ciblées, " +
        "reprise — demande 'provisoire' ; un essai qui porte sur l'identité demande " +
        "'reelle'.",
    );
  }
  const environnement = options.environnement ?? 'developpement';
  const { chargerConfiguration } = await moduleCompile('config/index.js');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { construireServeur } = await moduleCompile('serveur.js');

  // `AUTH_LDAP_ACTIF=non` rend `config.auth.ldap` nul, et `construireServeur` retombe
  // alors sur la session provisoire — explicitement, parce que l'essai l'a demandé.
  const supplement =
    options.authentification === 'provisoire'
      ? { AUTH_LDAP_ACTIF: 'non', ...(options.env ?? {}) }
      : (options.env ?? {});
  const config = chargerConfiguration(environnementDeTest(base, environnement, supplement));
  const pool = creerPool(config.base);
  const instance = construireServeur(config, pool);
  await instance.ready();

  const enveloppe = envelopper(instance, config);
  const fermerSeul = enveloppe.fermer.bind(enveloppe);
  enveloppe.pool = pool;
  enveloppe.fermer = async () => {
    await fermerSeul();
    await pool.end().catch(() => {});
  };
  return enveloppe;
}

/**
 * Monte le **greffon seul**, avec un résolveur de périmètre fourni par le test.
 *
 * Sert à ce que `monterServeurReel` ne peut pas atteindre : un périmètre de lecture
 * Groupe, une administration Groupe, ou l'absence de filiale active.
 */
export async function monterGreffon(base, perimetre, options = {}) {
  const { default: Fastify } = await import('fastify');
  const { chargerConfiguration } = await moduleCompile('config/index.js');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');

  const config = chargerConfiguration(environnementDeTest(base, options.environnement ?? 'developpement'));
  const pool = creerPool(config.base);
  // `options.resolveur` sert aux essais qui ont besoin de MAÎTRISER l'instant où le
  // périmètre se résout — celui de l'abandon avant transaction, par exemple. Le
  // contrat reste entier : quel qu'il soit, `resoudre()` ne prend aucun argument.
  const resolveur = options.resolveur ?? new PerimetreFixe(perimetre);

  // `options.journal` reçoit chaque ligne du journal, déjà décodée. Certaines
  // propriétés ne s'observent QUE là : quand le client est parti, le produit n'a
  // plus personne à qui répondre, et son journal est la seule trace de ce qu'il a
  // décidé — c'est ce que dit `signalerAbandon` dans `src/api/index.ts`.
  const journal =
    options.journal === undefined
      ? false
      : {
          level: 'warn',
          stream: {
            write(ligne) {
              try {
                options.journal(JSON.parse(ligne));
              } catch {
                options.journal({ msg: String(ligne) });
              }
            },
          },
        };

  const instance = Fastify({ logger: journal, bodyLimit: config.serveur.tailleMaxCorpsOctets });
  await instance.register(greffonApi, { pool, config, resolveur });
  await instance.ready();

  const enveloppe = envelopper(instance, config);
  const fermerSeul = enveloppe.fermer.bind(enveloppe);
  enveloppe.pool = pool;
  enveloppe.resolveur = resolveur;
  enveloppe.fermer = async () => {
    await fermerSeul();
    await pool.end().catch(() => {});
  };
  return enveloppe;
}

/* =====================================================================
 *  Le serveur lancé comme un PROCESSUS, pour lire son journal
 * ===================================================================== */

/**
 * Lance `dist/serveur.js` dans un vrai processus, sur un vrai port, et rend de
 * quoi l'interroger ET lire son journal.
 *
 * ── Pourquoi un processus, et pas `monterServeurReel` ───────────────────────
 *
 * Deux propriétés ne s'observent pas autrement.
 *
 *  · **Il faut un serveur qui ÉCOUTE.** Le constat **Q-39** — la référence d'un
 *    incident choisie par le client via `x-request-id` — est invisible tant
 *    qu'on n'envoie pas d'en-tête sur une vraie requête ; `inject()` en accepte,
 *    mais c'est alors le banc qui décide de ce que le réseau apporte.
 *  · **Il faut LIRE le journal.** `construireServeur` construit son pino sur le
 *    descripteur 1, à la construction : rien, dans le processus d'essai, ne
 *    peut s'intercaler après coup — pino écrit dans le descripteur, pas dans
 *    `process.stdout.write`. Le journal se lit donc là où il est écrit, en
 *    faisant du serveur ce qu'il est en production : un processus séparé.
 *
 * C'est le chemin de démarrage RÉEL (`demarrer()`), configuration comprise.
 *
 * @param {{nom: string}} base base d'essai ouverte par `ouvrirBaseEssai`
 * @param {{env?: Record<string,string>, environnement?: string}} [options]
 */
export async function lancerServeurProcessus(base, options = {}) {
  // Même exigence que `monterServeurReel`, et pour la même raison (constat Q-71) :
  // ce helper lance le serveur RÉEL, donc l'authentification réelle dès que
  // l'annuaire est configuré. Un essai qui ne dit pas laquelle il monte ne sait pas
  // ce qu'il éprouve — et il l'apprend par un 401 qu'il prend pour un défaut.
  if (options.authentification !== 'provisoire' && options.authentification !== 'reelle') {
    throw new Error(
      "lancerServeurProcessus : l'option « authentification » est obligatoire, et vaut " +
        "'provisoire' ou 'reelle'. Sans valeur par défaut, à dessein (constat Q-71).",
    );
  }
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');

  await compilerSiNecessaire();

  const port = await new Promise((resoudre, rejeter) => {
    const prise = net.createServer();
    prise.on('error', rejeter);
    prise.listen(0, '127.0.0.1', () => {
      const { port: libre } = prise.address();
      prise.close(() => resoudre(libre));
    });
  });

  const environnement = {
    ...environnementDeTest(base, options.environnement ?? 'developpement', {
      ...(options.authentification === 'provisoire' ? { AUTH_LDAP_ACTIF: 'non' } : {}),
      ...(options.env ?? {}),
    }),
    SERVEUR_PORT: String(port),
    SERVEUR_HOTE: '127.0.0.1',
    // Le journal EST l'objet de la mesure : il ne peut pas être « silent ».
    SERVEUR_NIVEAU_JOURNAL: options.env?.SERVEUR_NIVEAU_JOURNAL ?? 'info',
  };

  const processus = spawn(process.execPath, [join(RACINE_BACKEND, 'dist', 'serveur.js')], {
    cwd: RACINE_BACKEND,
    env: { ...process.env, ...environnement },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  /** Toutes les lignes de journal reçues, décodées quand elles sont du JSON. */
  const journal = [];
  let reliquat = '';
  const erreurs = [];
  processus.stdout.on('data', (morceau) => {
    reliquat += String(morceau);
    const lignes = reliquat.split('\n');
    reliquat = lignes.pop() ?? '';
    for (const ligne of lignes) {
      if (ligne.trim() === '') continue;
      try {
        journal.push(JSON.parse(ligne));
      } catch {
        journal.push({ msg: ligne, nonJson: true });
      }
    }
  });
  processus.stderr.on('data', (morceau) => erreurs.push(String(morceau)));

  // On attend l'ÉVÉNEMENT que le serveur émet lui-même quand il est prêt, pas
  // un délai : « Serveur Cyber GRC démarré » est la dernière ligne de
  // `demarrer()`, écrite après `listen()`.
  const echeance = Date.now() + 30000;
  for (;;) {
    if (journal.some((l) => /Serveur Cyber GRC démarré/.test(String(l.msg ?? '')))) break;
    if (processus.exitCode !== null || Date.now() > echeance) {
      throw new Error(
        `Le serveur n’a pas démarré (code ${String(processus.exitCode)}).\n` +
          `${erreurs.join('')}\n${journal.map((l) => JSON.stringify(l)).join('\n')}`,
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  return {
    port,
    url: `http://127.0.0.1:${String(port)}`,
    journal,
    erreurs,
    /** Les lignes reçues depuis un rang donné. */
    depuis(rang) {
      return journal.slice(rang);
    },
    async fermer() {
      processus.kill('SIGTERM');
      const limite = Date.now() + 5000;
      while (processus.exitCode === null && Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 50));
      }
      processus.kill('SIGKILL');
    },
  };
}
