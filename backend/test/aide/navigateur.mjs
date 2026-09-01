/**
 * navigateur.mjs — piloter la SPA dans un vrai navigateur, contre le vrai serveur.
 *
 * ── Pourquoi c'est ici et pas ailleurs ───────────────────────────────────────
 *
 * `CLAUDE.md` §5 impose depuis le début du projet des tests Playwright headless avec
 * « 0 erreur » et des captures de validation. La porte S2 a constaté qu'**il n'en
 * existait aucun dans le dépôt** (`grep -rl playwright` ne rendait rien hors
 * `node_modules`) — et que **six** de ses constats, dont les trois bloquants, ne se
 * voient que là :
 *
 *   B-1  la base héritée détruite avant toute reprise
 *   B-2  la croix « Masquer » qui éteint la seule trace d'un enregistrement bloqué
 *   B-3  l'import « Remplacer » qui détruit la filiale hors transaction
 *   M-1  la filiale qui ne peut pas évaluer un contrôle du socle Groupe
 *   M-6  l'interface inerte sous la CSP de production
 *   M-8  les modules refusés par leur propre valeur par défaut
 *
 * Aucun d'eux ne viole un contrôle de la grille §4 ; tous détruisent ou bloquent du
 * travail réel. C'est la raison d'être de ce fichier.
 *
 * ── Ce qu'il monte ──────────────────────────────────────────────────────────
 *
 *  · un serveur HTTP local qui sert `cyber-gouvernance_V4/` **tel quel** — les mêmes
 *    fichiers qu'Apache servira ;
 *  · `/api/**` relayé vers l'instance Fastify RÉELLE, par `inject()` : pas de second
 *    port, pas de latence réseau à attendre, et surtout **le vrai code** de bout en
 *    bout ;
 *  · trois leviers dont les scénarios de perte de données ont besoin :
 *      `definirApiInjoignable()` coupe l'API comme le ferait une coupure de VPN,
 *      `definirCsp()` sert la page sous une politique de sécurité de contenu donnée
 *      (celle du vhost de production, pour le constat M-6),
 *      `interceptions` compte ce que le navigateur a réellement émis.
 *
 * ── Environnement ───────────────────────────────────────────────────────────
 *
 * Playwright global (`/opt/node22/lib/node_modules/playwright`) et Chromium
 * (`/opt/pw-browsers`), comme `CLAUDE.md` §5 le décrit. Ils ne sont pas des
 * dépendances de `backend/package.json` — le banc ne fait qu'utiliser ce que la
 * machine de développement fournit. Leur absence est signalée par un message qui dit
 * quoi faire, jamais par un test silencieusement ignoré.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { RACINE_FRONTEND } from './serveur.mjs';
import assert from 'node:assert/strict';

const CHEMIN_PLAYWRIGHT = '/opt/node22/lib/node_modules/playwright/index.mjs';

const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
});

/* =====================================================================
 *  Le navigateur
 * ===================================================================== */

/**
 * Lance Chromium. Un seul par fichier de test : le démarrage coûte plus cher que
 * tout le reste.
 */
export async function lancerNavigateur() {
  let playwright;
  try {
    playwright = await import(CHEMIN_PLAYWRIGHT);
  } catch (erreur) {
    throw new Error(
      `Playwright est introuvable à ${CHEMIN_PLAYWRIGHT}.\n` +
        'Les essais de navigateur exigent le Playwright global de la machine de développement ' +
        '(CLAUDE.md §5), et Chromium dans /opt/pw-browsers.\n' +
        `Cause : ${erreur.message}`,
    );
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  return playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

/* =====================================================================
 *  Le serveur de l'application
 * ===================================================================== */

/**
 * Sert la SPA et relaie `/api/**` vers l'instance Fastify.
 *
 * @param {{instance: import('fastify').FastifyInstance}} serveur enveloppe rendue par
 *        `monterServeurReel` / `monterGreffon`
 */
export async function servirApplication(serveur, options = {}) {
  const etat = {
    /** Coupe l'API : c'est la coupure de VPN, vue du navigateur. */
    apiInjoignable: options.apiInjoignable === true,
    /** En-tête `Content-Security-Policy` posé sur la page, ou `null`. */
    csp: options.csp ?? null,
    /** Toutes les requêtes `/api/**` reçues, dans l'ordre. */
    appels: [],
    /** Fichiers de la SPA remplacés le temps d'un essai (voir `definirSubstitution`). */
    substitutions: new Map(),
  };

  const http = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? '/', 'http://127.0.0.1');

    if (url.pathname.startsWith('/api/')) {
      etat.appels.push({ methode: requete.method, chemin: url.pathname + url.search });
      if (etat.apiInjoignable) {
        // Ce que voit le navigateur quand le VPN tombe : la requête n'aboutit pas.
        requete.socket.destroy();
        return;
      }
      const morceaux = [];
      requete.on('data', (m) => morceaux.push(m));
      requete.on('end', () => {
        const corps = Buffer.concat(morceaux);
        serveur.instance
          .inject({
            method: requete.method,
            url: url.pathname + url.search,
            // ── Le type de contenu N'EST POSÉ QUE S'IL Y A UN CORPS ──────────
            //
            // Ce relais l'ajoutait sans condition. Un `DELETE` sans corps partait
            // donc annoncé « application/json », et Fastify, invité à lire un JSON
            // vide, répondait `400 « La requête n'a pas pu être lue »`.
            //
            // Le banc fabriquait ainsi une panne qui n'existe pas dans le produit :
            // j'ai bien failli rapporter comme défaut une suppression refusée que
            // seul mon relais refusait. Un instrument qui invente ce qu'il mesure
            // est pire qu'un instrument absent.
            ...(corps.length === 0
              ? {}
              : {
                  headers: { 'content-type': requete.headers['content-type'] ?? 'application/json' },
                  payload: corps.toString('utf8'),
                }),
          })
          .then((reponseApi) => {
            reponse.writeHead(reponseApi.statusCode, {
              'content-type': reponseApi.headers['content-type'] ?? 'application/json',
            });
            reponse.end(reponseApi.body);
          })
          .catch((erreur) => {
            reponse.writeHead(500, { 'content-type': 'application/json' });
            reponse.end(JSON.stringify({ erreur: 'relais', message: erreur.message }));
          });
      });
      return;
    }

    // Fichiers statiques de la SPA. `normalize` puis contrôle de préfixe : un
    // « ../ » ne doit pas sortir de la racine, même dans un banc d'essai.
    const relatif = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

    // ── Substitution d'un fichier de la SPA (constat Q-32) ──────────────────
    //
    // Un essai peut demander que ce serveur rende, pour un chemin donné, un
    // contenu de son choix — typiquement un `js/core/ui.js` dont le générateur
    // porte la forme d'avant un correctif. C'est ainsi qu'on éprouve un
    // détecteur DANS LE SENS OÙ IL PARLE : provoquer le défaut qu'il guette
    // sans toucher au dépôt, et sans recopier tout le frontend.
    const substitut = etat.substitutions.get(relatif);
    if (substitut !== undefined) {
      const entetesSub = { 'content-type': TYPES[extname(relatif)] ?? 'application/octet-stream' };
      if (etat.csp !== null) entetesSub['content-security-policy'] = etat.csp;
      reponse.writeHead(200, entetesSub);
      reponse.end(substitut);
      return;
    }

    const chemin = normalize(join(RACINE_FRONTEND, relatif));
    if (!chemin.startsWith(normalize(RACINE_FRONTEND)) || !existsSync(chemin) || statSync(chemin).isDirectory()) {
      reponse.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      reponse.end('introuvable');
      return;
    }
    const entetes = { 'content-type': TYPES[extname(chemin)] ?? 'application/octet-stream' };
    if (etat.csp !== null) entetes['content-security-policy'] = etat.csp;
    reponse.writeHead(200, entetes);
    createReadStream(chemin).pipe(reponse);
  });

  await new Promise((resoudre) => http.listen(0, '127.0.0.1', resoudre));
  const port = http.address().port;

  return {
    url: `http://127.0.0.1:${port}`,
    etat,
    definirApiInjoignable(valeur) {
      etat.apiInjoignable = valeur;
    },
    definirCsp(valeur) {
      etat.csp = valeur;
    },
    /**
     * Sert `contenu` à la place du fichier de la SPA situé à `relatif`
     * (« /js/core/ui.js »). `null` rétablit le fichier du dépôt.
     */
    definirSubstitution(relatif, contenu) {
      if (contenu === null) etat.substitutions.delete(relatif);
      else etat.substitutions.set(relatif, contenu);
    },
    /** Appels `/api/**` reçus, filtrés par méthode. */
    appelsPar(methode) {
      return etat.appels.filter((a) => a.methode === methode);
    },
    async fermer() {
      await new Promise((resoudre) => http.close(resoudre));
    },
  };
}

/* =====================================================================
 *  Une page, et ce qu'elle a crié
 * ===================================================================== */

/**
 * Ouvre une page qui **retient tout** : erreurs de script, messages de console,
 * requêtes refusées. `CLAUDE.md` §5 demande « 0 erreur » — encore faut-il les avoir
 * recueillies pour pouvoir le dire.
 */
export async function ouvrirPage(navigateur, options = {}) {
  const contexte = await navigateur.newContext(options.contexte ?? {});
  const page = await contexte.newPage();
  /** Exceptions non rattrapées : elles cassent un gestionnaire, donc une fonction. */
  const erreursScript = [];
  /** Messages `console.error`, dont les échecs de `fetch` que le navigateur signale. */
  const erreursConsole = [];
  const journalConsole = [];

  page.on('pageerror', (erreur) => erreursScript.push(String(erreur.message ?? erreur)));
  page.on('console', (message) => {
    journalConsole.push({ type: message.type(), texte: message.text() });
    if (message.type() === 'error') erreursConsole.push(message.text());
  });

  return {
    page,
    contexte,
    erreursScript,
    erreursConsole,
    console: journalConsole,
    /**
     * Ce que `CLAUDE.md` §5 appelle « 0 erreur » : les exceptions de script, plus les
     * messages d'erreur de console que le test n'a pas déclarés attendus.
     *
     * La distinction compte : un scénario qui provoque VOLONTAIREMENT un refus du
     * serveur (409, 403) verra le navigateur journaliser l'échec du `fetch`, et ce
     * n'est pas un défaut. Une exception de script, elle, ne s'accepte jamais.
     */
    erreursInattendues(motifsAcceptes = []) {
      return [
        ...erreursScript,
        ...erreursConsole
          .filter((e) => !motifsAcceptes.some((motif) => e.includes(motif)))
          .map((e) => `console: ${e}`),
      ];
    },
    async fermer() {
      await contexte.close().catch(() => {});
    },
  };
}

/**
 * Attend que l'application soit prête, ou qu'elle ait renoncé.
 *
 * Rend `'chargee'` quand le jeu de données du serveur est en mémoire, `'refus'`
 * quand l'écran d'indisponibilité est affiché. Ne jamais se contenter d'un délai
 * fixe : c'est ce qui rend un banc d'essai capricieux, et un banc capricieux apprend
 * à ignorer les échecs.
 */
export async function attendreApplication(page, options = {}) {
  const delai = options.delai ?? 15000;
  return page.waitForFunction(
    () => {
      // L'écran de refus se reconnaît à SA STRUCTURE — le bouton « Réessayer » que
      // `js/core/vault.js` pose — et non à un mot de son texte. Une première version
      // cherchait « indisponible » dans le corps de la page : elle prenait pour un
      // refus l'écran « Cellule de crise », qui explique que « le SI peut être
      // indisponible ». Un repère textuel est un repère qui déménage.
      if (document.getElementById('reconnect-btn') !== null) return 'refus';
      if (typeof window.DataStore === 'undefined') return false;
      try {
        if (window.DataStore.getRisques === undefined) return false;
      } catch (e) {
        return false;
      }
      const pret = document.querySelector('#app');
      if (pret && pret.innerHTML.trim().length > 0) return 'chargee';
      return false;
    },
    null,
    { timeout: delai },
  ).then((poignee) => poignee.jsonValue());
}

/**
 * Attend que le navigateur n'ait plus RIEN à écrire.
 *
 * ── Pourquoi cette attente existe ────────────────────────────────────────────
 *
 * Trouvée en enchaînant trois exécutions concurrentes de la suite : un essai sur
 * dix échouait, et seul le troisième processus. Le message accusait un conflit de
 * version au milieu d'une reprise — un rouge parfaitement crédible, et faux.
 *
 * `js/core/sync.js` regroupe les écritures : `marquerModification()` arme un
 * minuteur (`DEBOUNCE_MS = 400`) et `pousser()` part ensuite. Un chargement de page
 * peut laisser un envoi en attente — l'application normalise ce qu'elle reçoit, et
 * la normalisation est une modification comme une autre. Sur une machine au repos,
 * cet envoi part avant la suite de l'essai ; sur une machine chargée, il part **au
 * milieu**, et se glisse entre la lecture des versions par la reprise et son
 * écriture. Le serveur a raison de répondre `GRC03` : quelqu'un a bien écrit
 * entre-temps. C'est l'essai qui avait tort de croire la page au repos.
 *
 * Un banc capricieux est pire qu'un banc absent : il apprend à relancer sans lire.
 * On attend donc l'état, jamais un délai — et l'état est celui que `sync.js`
 * publie lui-même (`Sync.etat()`), pas une devinette.
 */
export async function attendreQuiescence(page, options = {}) {
  const delai = options.delai ?? 15000;
  const repos = options.repos ?? 700; // > DEBOUNCE_MS (400 ms) : un minuteur armé se voit
  const echeance = Date.now() + delai;

  for (;;) {
    await page.waitForFunction(
      () => {
        if (typeof window.Sync === 'undefined' || window.Sync.etat === undefined) return true;
        const e = window.Sync.etat();
        return e.enAttente === false && e.enCours === false;
      },
      null,
      { timeout: Math.max(500, echeance - Date.now()) },
    );

    // Deuxième lecture après un temps de repos supérieur au regroupement : un
    // minuteur armé pendant la première lecture aurait déjà tiré.
    const stable = await page.evaluate(
      (attente) =>
        new Promise((resoudre) => {
          setTimeout(() => {
            if (typeof window.Sync === 'undefined' || window.Sync.etat === undefined) {
              resoudre(true);
              return;
            }
            const e = window.Sync.etat();
            resoudre(e.enAttente === false && e.enCours === false);
          }, attente);
        }),
      repos,
    );
    if (stable) return;
    if (Date.now() > echeance) {
      const etat = await page.evaluate(() =>
        typeof window.Sync === 'undefined' ? null : window.Sync.etat(),
      );
      throw new Error(
        `Le navigateur n’est jamais revenu au repos en ${String(delai)} ms : ` +
          `${JSON.stringify(etat)}. Un envoi reste en attente — l’essai qui suit ` +
          'mesurerait une course, pas la propriété qu’il vise.',
      );
    }
  }
}

/* =====================================================================
 *  Les deux familles d'assertions négatives — et celle qui est piégeuse
 * ===================================================================== */

/**
 * Exige qu'un AVERTISSEMENT ne soit pas affiché — en nommant l'essai qui,
 * lui, le fait parler.
 *
 * ── Pourquoi cette fonction existe plutôt qu'un `assert` nu ──────────────────
 *
 * Le banc porte deux familles d'assertions négatives, et une seule est piégeuse.
 *
 *  · **La famille sûre** : « la filiale voisine n'est nommée nulle part »,
 *    « l'identifiant caché n'est pas rendu ». Casser le cloisonnement fait
 *    APPARAÎTRE la chaîne : l'assertion mord d'elle-même, elle se suffit.
 *  · **La famille piégeuse** : « le bandeau ne dit rien », « aucun défaut interne
 *    n'est annoncé ». Ce qu'on observe est le silence d'un mécanisme — et retirer
 *    le mécanisme produit le même silence. Une telle assertion est satisfaite par
 *    un produit qui ne dit JAMAIS rien.
 *
 * C'est le constat **Q-21** : trois comportements du remède du bloquant T-1
 * n'étaient exercés que dans ce sens-là, et le banc restait vert quand on les
 * neutralisait un par un.
 *
 * Une assertion de silence n'est donc jamais un essai à elle seule : elle est la
 * moitié d'un couple, et la moitié qui ne prouve rien. Le troisième argument
 * force à nommer l'autre moitié — ce qui rend le couple relisible, et greppable
 * (`grep -rn "exigerSilence" test/`) le jour où quelqu'un refait ce tri.
 *
 * @param {string} texte ce qu'on a lu à l'écran (bandeau, console, corps de réponse)
 * @param {RegExp} avertissement le motif qui NE doit pas y figurer
 * @param {string} essaiQuiFaitParler le nom de l'essai qui exige le même
 *   avertissement quand il DOIT paraître. Sans lui, ce silence ne vaut rien.
 */
export function exigerSilence(texte, avertissement, essaiQuiFaitParler) {
  assert.equal(
    avertissement.test(texte),
    false,
    `Un avertissement paraît alors que rien ne le justifie (${String(avertissement)}). ` +
      `Sa moitié symétrique — l'essai qui le fait parler — est « ${essaiQuiFaitParler} ». ` +
      `Vu : ${texte.slice(0, 300)}`,
  );
}
