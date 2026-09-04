/**
 * aide.mjs — monter les trois routes du journal **sur le vrai greffon d'API**.
 *
 * ── Ce fichier a changé le jour où la couture a été branchée ─────────────────
 *
 * Il portait ceci, et c'était exact à l'heure où il a été écrit : *« `src/api/index.ts`
 * enregistre `greffonJournal` avec `{}` — sans pool — et le greffon n'enregistre
 * alors aucune route. Le banc ne peut donc pas passer par `monterGreffon()` : il
 * n'y aurait rien à interroger. »* D'où un second enregistrement, posé ici.
 *
 * L'orchestrateur a branché la ligne manquante (`register(greffonJournal, { pool })`)
 * et rendu `pool` **obligatoire**. Les trois routes montent donc par le chemin du
 * produit — et ce fichier en posait alors un second exemplaire, ce que Fastify
 * refuse : *« Method 'GET' already declared for route '/api/journal' »*. Le banc
 * l'a dit dans la minute.
 *
 * Le second enregistrement est retiré. Ce qui en résulte est **plus fort** que ce
 * qu'il y avait : les routes éprouvées ici sont désormais celles que
 * `src/api/index.ts` monte, et la ligne d'enregistrement — qui était nommée comme
 * « ce qui n'est pas éprouvé » — l'est maintenant par construction. Si elle
 * disparaissait, cette famille entière rougirait.
 *
 * Le montage reste direct plutôt que par `register()`, et ce n'est **pas** une
 * doublure : `greffonApi` est une fonction de greffon ordinaire ; appelée sur une
 * instance Fastify sans encapsulation, elle y pose ses crochets et ses routes.
 * Les routes du journal passent donc par :
 *
 *   · le crochet `onRequest` réel — témoin d'abandon, limitation de rythme,
 *     authentification, puis `deciderAcces` sur la déclaration de la route ;
 *   · le traitement d'erreur réel — celui qui garantit qu'aucun message de
 *     PostgreSQL ne sort (contrôle S12) ;
 *   · le gestionnaire de route inconnue réel.
 */

import { moduleCompile, monterGreffon, PerimetreFixe } from '../aide/serveur.mjs';

/**
 * Session d'essai : elle résout un périmètre **et** dit quels droits l'accompagnent.
 *
 * C'est la forme que prendra le lot L3 (`estAuthentificateur` : « c'est la même
 * session serveur qui dit qui parle et quel périmètre lui revient »), et le
 * contrat est respecté à la lettre — **`resoudre()` ne prend aucun argument**, et
 * rien ici ne lit la requête. Un résolveur d'essai qui lirait une entête
 * réintroduirait ce que le contrôle S2 interdit.
 */
export class SessionDEssai {
  constructor(perimetre, droits) {
    this.provisoire = false;
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

  /** Change la session entre deux appels. Jamais depuis une requête. */
  poser(perimetre, droits) {
    this._perimetre = Object.freeze({ ...perimetre });
    this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return { perimetre: this._perimetre, droits: this._droits };
  }

  decrire() {
    return 'session fixée par le banc d’essai (test/journal-lecture/aide.mjs)';
  }
}

/**
 * Monte `greffonApi` — qui enregistre lui-même `greffonJournal`.
 *
 * @param {{nom: string}} base base d'essai ouverte par `ouvrirBaseEssai`
 * @param {SessionDEssai} session
 * @returns {Promise<{appeler: Function, routes: object[], fermer: Function, pool: import('pg').Pool}>}
 */
export async function monterJournal(base, session) {
  const { default: Fastify } = await import('fastify');
  const { creerPool } = await moduleCompile('db/pool.js');
  const { greffonApi } = await moduleCompile('api/index.js');

  // La configuration vient du harnais partagé plutôt que d'une seconde copie de
  // sa vingtaine de variables d'environnement : deux copies d'un même réglage
  // finissent par ne plus dire la même chose. Le montage jetable coûte quelques
  // dizaines de millisecondes et ne laisse rien derrière lui.
  const provisoire = await monterGreffon(base, { utilisateurId: 'systeme', filialeId: null, filiales: [], perimetreGroupe: false, administrationGroupe: false });
  const config = provisoire.config;
  await provisoire.fermer();

  const pool = creerPool(config.base);
  const instance = Fastify({ logger: false, bodyLimit: config.serveur.tailleMaxCorpsOctets });

  /** Déclarations d'accès telles que Fastify les voit — lues, jamais recopiées. */
  const routes = [];
  instance.addHook('onRoute', (route) => {
    if (typeof route.url === 'string' && route.url.startsWith('/api/journal')) {
      routes.push({ methode: route.method, url: route.url, acces: route.config?.acces });
    }
  });

  await greffonApi(instance, {
    pool,
    config,
    resolveur: session,
    authentificateur: session,
  });
  // ⚠️ Pas de second `greffonJournal(instance, { pool })` ici : `greffonApi` s'en
  // charge depuis que la couture est branchée, et un doublon fait échouer Fastify.
  await instance.ready();

  return {
    instance,
    config,
    pool,
    routes,

    /** `inject()` : rend `{ statut, entetes, corps }`, `corps` décodé si JSON. */
    async appeler(methode, url, options = {}) {
      const reponse = await instance.inject({
        method: methode,
        url,
        ...(options.entetes === undefined ? {} : { headers: options.entetes }),
      });
      let corps = reponse.body;
      if ((reponse.headers['content-type'] ?? '').includes('application/json')) {
        try {
          corps = JSON.parse(reponse.body);
        } catch {
          /* Réponse annoncée JSON mais illisible : c'est un constat en soi. */
        }
      }
      return { statut: reponse.statusCode, entetes: reponse.headers, corps };
    },

    async fermer() {
      instance.server.closeAllConnections?.();
      await instance.close().catch(() => {});
      await pool.end().catch(() => {});
    },
  };
}

/* =====================================================================
 *  Un analyseur CSV conforme au RFC 4180 — l'aller, et le RETOUR
 * ---------------------------------------------------------------------
 *  Le §29.8 exige que l'export se prouve **sur une entrée hostile**, et il
 *  précise comment : *« La preuve n'est pas une relecture : on forge l'entrée,
 *  on exporte, on RÉ-ANALYSE, et on retrouve la valeur intacte. »*
 *
 *  Cet analyseur est donc écrit **d'après le RFC**, pas d'après le producteur :
 *  il ne connaît ni les colonnes du journal, ni la façon dont
 *  `construireCsv()` cite ses champs. Il applique une seule règle — un champ
 *  cité court jusqu'au guillemet non doublé, séparateurs et sauts de ligne
 *  compris — et c'est cette règle-là que le format doit satisfaire pour qu'un
 *  tableur, un `csv` de Python ou un auditeur retrouvent UNE ligne logique.
 * ===================================================================== */

/**
 * Analyse un texte CSV (séparateur `;`) et rend un tableau de lignes logiques.
 *
 * @param {string} texte
 * @param {string} [separateur]
 * @returns {string[][]}
 */
export function analyserCsv(texte, separateur = ';') {
  // Le BOM n'appartient pas au format : Excel le veut, le RFC l'ignore.
  const source = texte.startsWith('﻿') ? texte.slice(1) : texte;
  const lignes = [];
  let ligne = [];
  let champ = '';
  let dansCitation = false;
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (dansCitation) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          champ += '"';
          i += 2;
          continue;
        }
        dansCitation = false;
        i += 1;
        continue;
      }
      champ += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      dansCitation = true;
      i += 1;
      continue;
    }
    if (c === separateur) {
      ligne.push(champ);
      champ = '';
      i += 1;
      continue;
    }
    if (c === '\r' && source[i + 1] === '\n') {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
      i += 2;
      continue;
    }
    if (c === '\n' || c === '\r') {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
      i += 1;
      continue;
    }
    champ += c;
    i += 1;
  }

  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes;
}

/** Rend les lignes d'un CSV sous forme d'objets, indexés par l'en-tête. */
export function objetsCsv(texte, separateur = ';') {
  const [entete, ...corps] = analyserCsv(texte, separateur);
  if (entete === undefined) return [];
  return corps.map((ligne) => Object.fromEntries(entete.map((nom, index) => [nom, ligne[index]])));
}
