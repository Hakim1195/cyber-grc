/**
 * chaine-complete.test.mjs — LES TROIS MOITIÉS DU CONTRÔLE S17, JOINTES (constat Q-62).
 *
 * ── Ce qui manquait, et depuis quand ────────────────────────────────────────
 *
 * Le contrôle **S17** de la grille demande le chemin parcouru *« dans un navigateur
 * réel, contre le serveur réel, dans la configuration de déploiement réelle — vhost
 * et en-têtes compris »*. Le banc n'en couvrait jamais que deux tiers à la fois :
 *
 *  · `test/navigateur/` monte **Chromium** contre un relais Node qui appelle Fastify
 *    par `inject()` — **sans TCP, sans Apache, sans vhost** ;
 *  · `test/deploiement/vhost-apache.test.mjs` monte un **Apache réel** sur le vhost
 *    livré, mais contre une **doublure d'API** — sans serveur, sans base, sans
 *    navigateur.
 *
 * La jonction n'existait que dans la mesure que **chaque auditeur refaisait à la
 * main** — le 7ᵉ passage, le 8ᵉ, le 9ᵉ. C'est la forme exacte de « une réserve écrite
 * n'est pas une réserve traitée », appliquée à un contrôle au lieu d'une dépendance ;
 * et la porte S3 allait la refaire une quatrième fois.
 *
 * ── Ce que ce fichier monte, et pourquoi chaque terme est le vrai ───────────
 *
 *   Chromium réel  →  Apache réel (vhost + durcissement DU DÉPÔT)  →  `dist/serveur.js`
 *   dans un VRAI PROCESSUS, sur un VRAI PORT  →  PostgreSQL réel, base neuve
 *
 * Aucun maillon n'est doublé. Le frontend est publié par **le vrai `rsync`** via le
 * bloc `frontend` d'`install.sh`, puis versionné par la **vraie injection de jeton** :
 * sans quoi la racine web ne serait pas dans l'état qu'une installation laisse, et
 * l'essai mesurerait son propre montage.
 *
 * ── Ce que seule cette jonction peut voir ───────────────────────────────────
 *
 * Un type MIME qu'Apache émet autrement, une directive de cache, un en-tête que le
 * mandataire n'ajoute plus, une **politique de sécurité de contenu qui bloque
 * l'application** — Q-42 était exactement ce défaut-là, et il a vécu un lot entier.
 * Aucune des deux autres familles ne pouvait le voir : l'une n'a pas de vhost,
 * l'autre n'a pas de navigateur.
 *
 * ── Le prix, dit franchement ────────────────────────────────────────────────
 *
 * ~25 s : une base neuve avec ses sept migrations, une paire de clés RSA, la
 * publication réelle de la racine web, le démarrage d'Apache et celui de Chromium.
 * C'est le prix d'un contrôle que trois auditeurs ont payé à la main.
 *
 * ── La résolution de noms reste INTERDITE (constat Q-45) ────────────────────
 *
 * Le banc ne résout aucun nom : il se connecte à `127.0.0.1` et porte le nom d'hôte
 * dans l'en-tête `Host` et le `servername` du certificat. Chromium, lui, a besoin de
 * faire correspondre le nom — on le lui dit par `--host-resolver-rules`, qui
 * court-circuite tout résolveur. Aucune entrée `/etc/hosts` n'est requise, et c'est
 * vérifié : une famille entière en dépendait, verte chez son auteur et **614 sur
 * 628** sur une machine neuve.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { extraireFonction, jouerBloc, jouerScript } from '../aide/install.mjs';
import { attendrePort, exigerOutil, portLibre } from '../aide/outils.mjs';
import { RACINE_BACKEND, RACINE_FRONTEND, lancerServeurProcessus } from '../aide/serveur.mjs';
import { attendreApplication, attendreQuiescence, lancerNavigateur, ouvrirPage } from '../aide/navigateur.mjs';

const HOTE = 'grc.exemple.interne';
const VHOST_SOURCE = join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf');
const DURCISSEMENT = join(RACINE_BACKEND, 'deploy', 'apache', 'durcissement-global.conf');

let base;
let serveur;
let apache;
let navigateur;
let racine;
let racineWeb;
let portClair;
let portTls;

const sortieApache = [];
const journalApache = () => {
  const morceaux = [sortieApache.join('')];
  for (const nom of ['global-erreurs.log', 'cyber-grc-erreurs.log']) {
    const chemin = join(racine, 'logs', nom);
    if (existsSync(chemin)) morceaux.push(`--- ${nom}\n${readFileSync(chemin, 'utf8').slice(-2500)}`);
  }
  return morceaux.join('\n');
};

/**
 * Écrit le vhost DU DÉPÔT, rendu jouable ici — substitutions **déclarées**.
 *
 * Même discipline que `vhost-apache.test.mjs` (constat Q-61) : toute ligne que la
 * substitution n'a pas déclaré toucher doit survivre à l'identique. La propriété ne
 * demande aucune liste de directives « décisives » — c'est le remède, et il vaut
 * ici comme là-bas.
 */
function ecrireVhost(portApi) {
  const source = readFileSync(VHOST_SOURCE, 'utf8');
  const substitutions = [
    ['<VirtualHost *:80>', `<VirtualHost *:${String(portClair)}>`, 1],
    ['<VirtualHost *:443>', `<VirtualHost *:${String(portTls)}>`, 1],
    ['https://%{SERVER_NAME}/$1', `https://%{SERVER_NAME}:${String(portTls)}/$1`, 1],
    ['DocumentRoot /opt/cyber-grc/frontend', `DocumentRoot ${racineWeb}`, 1],
    ['<Directory /opt/cyber-grc/frontend>', `<Directory ${racineWeb}>`, 1],
    ['SSLCertificateFile      /etc/ssl/cyber-grc/serveur.crt', `SSLCertificateFile      ${join(racine, 'tls', 'serveur.crt')}`, 1],
    ['SSLCertificateKeyFile   /etc/ssl/cyber-grc/serveur.key', `SSLCertificateKeyFile   ${join(racine, 'tls', 'serveur.key')}`, 1],
    ['    SSLCertificateChainFile /etc/ssl/cyber-grc/chaine-pki-interne.crt\n', '', 1],
    // ── LE MAILLON QUI FAIT TOUTE LA DIFFÉRENCE ────────────────────────────
    // `vhost-apache.test.mjs` fait pointer le mandataire vers une DOUBLURE.
    // Ici il pointe vers `dist/serveur.js`, dans son propre processus, adossé à
    // PostgreSQL. C'est le seul changement de nature entre les deux fichiers.
    ['http://127.0.0.1:3001/api/', `http://127.0.0.1:${String(portApi)}/api/`, 2],
  ];

  let vhost = source;
  for (const [avant, apres, attendu] of substitutions) {
    const vues = vhost.split(avant).length - 1;
    assert.equal(vues, attendu,
      `Substitution « ${avant.trim()} » : ${String(vues)} occurrence(s) au lieu de ${String(attendu)}. ` +
      'Le vhost a changé de forme, et cet essai jouerait contre une configuration qui n’est pas ' +
      'celle du dépôt — c’est-à-dire contre rien.');
    vhost = vhost.split(avant).join(apres);
  }

  const declarees = [];
  for (const [avant, apres] of substitutions) {
    for (const bout of [String(avant), String(apres)]) {
      for (const ligne of bout.split('\n')) if (ligne.trim() !== '') declarees.push(ligne.trim());
    }
  }
  const survivantes = (texte) => texte.split('\n').map((l) => l.trim())
    .filter((l) => l !== '' && !declarees.some((f) => l.includes(f)));
  const avantTout = survivantes(source);
  assert.ok(avantTout.length >= 200, `Seulement ${String(avantTout.length)} ligne(s) comparée(s).`);
  assert.deepEqual(survivantes(vhost), avantTout,
    'Une substitution a touché une ligne qu’elle n’avait pas déclarée : l’essai éprouverait sa ' +
    'propre réécriture plutôt que le vhost livré (constat Q-61).');

  writeFileSync(join(racine, 'vhost.conf'), vhost);
}

before(async () => {
  exigerOutil('apache2', ['-v'], 'C’est le frontal réel du contrôle S17 : sans lui, il ne reste que deux moitiés sur trois.');
  exigerOutil('openssl', ['version'], 'Le vhost impose HTTPS ; il faut un certificat.');
  exigerOutil('rsync', ['--version'], 'La racine web est publiée par le VRAI rsync, comme sur la VM.');

  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  // Le serveur RÉEL, dans son propre processus, sur un vrai port : c'est le chemin
  // de démarrage de production (`demarrer()`), configuration comprise.
  serveur = await lancerServeurProcessus(base, { authentification: 'provisoire' });

  racine = mkdtempSync(join(tmpdir(), 'grc-chaine-'));
  chmodSync(racine, 0o755); // Apache tourne sous www-data : il doit traverser.
  racineWeb = join(racine, 'frontend');
  for (const sous of ['logs', 'run', 'tls', 'frontend']) mkdirSync(join(racine, sous), { recursive: true });
  chmodSync(join(racine, 'logs'), 0o777);
  chmodSync(join(racine, 'run'), 0o777);
  [portClair, portTls] = await Promise.all([portLibre(), portLibre()]);

  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(racine, 'tls', 'serveur.key'), '-out', join(racine, 'tls', 'serveur.crt'),
    '-days', '2', '-subj', `/CN=${HOTE}`, '-addext', `subjectAltName=DNS:${HOTE}`,
    '-addext', 'basicConstraints=critical,CA:FALSE'], { stdio: 'ignore' });

  // La racine web publiée par le VRAI bloc d'`install.sh`, puis VERSIONNÉE par la
  // vraie injection de jeton : sans elle, les URL seraient nues et le garde-fou du
  // constat Q-43 refuserait l'installation — à bon droit.
  const publication = jouerBloc('frontend',
    { DEPOT: join(RACINE_FRONTEND, '..'), RACINE: racine, SOURCE: RACINE_BACKEND }, racine);
  assert.equal(publication.code, 0, `La publication du frontend doit aboutir :\n${publication.sortie}`);
  const injection = jouerScript([
    extraireFonction('jeton_frontend'),
    extraireFonction('injecter_jeton_frontend'),
    'JETON="$(jeton_frontend "$RACINE/frontend" "$VERSION_PAQUET")"',
    'N="$(injecter_jeton_frontend "$RACINE/frontend/index.html" "$JETON")"',
    'printf "versionnees=%s\\n" "$N"',
  ].join('\n\n'), { RACINE: racine, VERSION_PAQUET: '1.4.2' }, racine, 'jeton');
  assert.equal(injection.code, 0, `L’injection du jeton doit aboutir :\n${injection.sortie}`);
  const compte = /versionnees=(\d+)/.exec(injection.sortie);
  assert.ok(compte !== null && Number(compte[1]) >= 55,
    `Le montage ne reproduit pas une installation réelle :\n${injection.sortie}`);

  ecrireVhost(serveur.port);
  writeFileSync(join(racine, 'httpd.conf'), [
    'ServerRoot /etc/apache2',
    `Define APACHE_LOG_DIR ${join(racine, 'logs')}`,
    `Define APACHE_RUN_DIR ${join(racine, 'run')}`,
    `Define APACHE_LOCK_DIR ${join(racine, 'run')}`,
    `Define APACHE_PID_FILE ${join(racine, 'run', 'apache2.pid')}`,
    'Define APACHE_RUN_USER www-data',
    'Define APACHE_RUN_GROUP www-data',
    `DefaultRuntimeDir ${join(racine, 'run')}`,
    `PidFile ${join(racine, 'run', 'apache2.pid')}`,
    `Mutex file:${join(racine, 'run')} default`,
    'User www-data', 'Group www-data', `ServerName ${HOTE}`,
    `ErrorLog ${join(racine, 'logs', 'global-erreurs.log')}`, 'LogLevel warn',
    '<Directory />', '    AllowOverride None', '    Require all denied', '</Directory>',
    'Include /etc/apache2/mods-enabled/*.load',
    'Include /etc/apache2/mods-enabled/*.conf',
    `Listen ${String(portClair)}`, `Listen ${String(portTls)}`,
    // Le durcissement de portée serveur est INDISSOCIABLE du vhost (S10, S12).
    `Include ${DURCISSEMENT}`,
    `Include ${join(racine, 'vhost.conf')}`,
    '',
  ].join('\n'));

  apache = spawn('apache2', ['-d', '/etc/apache2', '-f', join(racine, 'httpd.conf'), '-DFOREGROUND'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  apache.stdout.on('data', (m) => sortieApache.push(String(m)));
  apache.stderr.on('data', (m) => sortieApache.push(String(m)));
  await attendrePort(portTls, 'L’Apache de la chaîne complète', 20000, journalApache);

  // Le nom d'hôte est mis en correspondance DANS le navigateur : aucun résolveur,
  // aucune entrée /etc/hosts (constat Q-45).
  navigateur = await lancerNavigateur({ correspondances: [HOTE] });
});

after(async () => {
  await navigateur?.close().catch(() => {});
  apache?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  apache?.kill('SIGKILL');
  await serveur?.fermer();
  await base?.fermer();
  if (racine !== undefined) rmSync(racine, { recursive: true, force: true });
});

/**
 * Une page ouverte sur l'URL D'ENTRÉE RÉELLE, avec tout ce qu'un navigateur crie.
 *
 * `--host-resolver-rules` fait correspondre le nom d'hôte à `127.0.0.1` **dans le
 * navigateur**, sans résolveur : ni DNS, ni `/etc/hosts`. Le certificat est ancré,
 * il n'est pas ignoré — accepter n'importe quel certificat rendrait l'essai muet sur
 * la moitié TLS du vhost.
 */
async function ouvrirParLeVhost(chemin = '/') {
  const vue = await ouvrirPage(navigateur, {
    contexte: {
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 900 },
    },
  });
  const violationsCsp = [];
  const refus = [];
  vue.page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(m.text())) violationsCsp.push(m.text());
  });
  vue.page.on('response', (r) => { if (r.status() >= 400) refus.push(`${String(r.status())} ${r.url()}`); });
  vue.violationsCsp = violationsCsp;
  vue.refus = refus;
  try {
    await vue.page.goto(`https://${HOTE}:${String(portTls)}${chemin}`, { waitUntil: 'domcontentloaded' });
  } catch (erreur) {
    // Un échec de navigation sans le journal du frontal coûte une demi-heure à
    // chaque fois : on le joint, toujours.
    throw new Error(`${erreur.message}\n--- Apache ---\n${journalApache()}`);
  }
  return vue;
}

/** Ce que PostgreSQL contient RÉELLEMENT — le dernier maillon, interrogé directement. */
async function enBase(texte, valeurs = []) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
    (await c.query(texte, valeurs)).rows);
}

describe('Le chemin complet, parcouru pour de vrai — contrôle S17 (constat Q-62)', () => {
  test('LES TROIS MAILLONS SONT LES VRAIS : navigateur, Apache du dépôt, serveur, base', async () => {
    // Sans cette vérification, tout ce qui suit pourrait être vrai d'un montage
    // dégradé — et c'est précisément ce qui a fait vivre Q-62 : deux familles
    // couvraient chacune deux termes sur trois, et personne ne comptait.
    const vue = await ouvrirParLeVhost('/');
    try {
      const etat = await attendreApplication(vue.page);
      assert.equal(etat, 'chargee',
        `L’application ne démarre pas dans sa configuration de déploiement réelle.\n` +
        `Violations CSP : ${JSON.stringify(vue.violationsCsp)}\nRefus : ${JSON.stringify(vue.refus)}\n` +
        journalApache());
      await attendreQuiescence(vue.page);

      // ── Le maillon Apache : les en-têtes viennent du VHOST, pas du serveur ──
      const entetes = await vue.page.evaluate(async () => {
        const r = await fetch('/index.html', { cache: 'no-store' });
        const vus = {};
        r.headers.forEach((v, k) => { vus[k] = v; });
        return vus;
      });
      assert.equal(entetes['x-content-type-options'], 'nosniff', JSON.stringify(entetes));
      assert.match(entetes['strict-transport-security'] ?? '', /max-age=31536000/, JSON.stringify(entetes));
      assert.match(entetes['content-security-policy'] ?? '', /default-src 'self'/, JSON.stringify(entetes));
      assert.equal(entetes['x-powered-by'], undefined, 'Le vhost retire X-Powered-By (§S12).');

      // ── Le maillon serveur : l'API répond À TRAVERS le mandataire ───────────
      const api = await vue.page.evaluate(async () => {
        const sante = await fetch('/api/sante', { cache: 'no-store' });
        const session = await fetch('/api/session', { cache: 'no-store' });
        return {
          sante: sante.status, corpsSante: (await sante.text()).slice(0, 200),
          session: session.status,
        };
      });
      assert.equal(api.sante, 200, `Le point de santé n’est pas joint à travers Apache : ${JSON.stringify(api)}`);
      assert.match(api.corpsSante, /"?(etat|statut|ok)"?/i, `La réponse ne vient pas du serveur : ${api.corpsSante}`);
      assert.ok(api.session < 400, `La session n’est pas résolue à travers Apache : ${JSON.stringify(api)}`);

      // ── Le maillon base : ce que la page affiche vient de PostgreSQL ────────
      const enMemoire = await vue.page.evaluate(() => DataStore.getRisques().map((r) => r.id));
      const enPostgres = (await enBase('select id from risques order by id')).map((l) => l.id);
      assert.ok(enPostgres.length > 0, 'Le jeu d’essai doit être en base : sinon la comparaison est vide.');
      for (const id of enPostgres) {
        assert.ok(enMemoire.includes(id), `Le risque ${id} est en base et non dans la page : la chaîne est rompue.`);
      }

      // ── `CLAUDE.md` §5 : zéro erreur, et zéro violation de CSP ─────────────
      assert.deepEqual(vue.violationsCsp, [],
        'La politique de sécurité de contenu du vhost bloque l’application. C’est le défaut ' +
        'que la porte S2 a trouvé (soixante-dix gestionnaires en ligne bloqués), et qu’aucune ' +
        'autre famille ne peut voir.');
      assert.deepEqual(vue.erreursInattendues(), [], 'Le navigateur a crié.');
      assert.deepEqual(vue.refus, [], `Une réponse ≥ 400 dans le chemin complet : ${JSON.stringify(vue.refus)}`);
    } finally {
      await vue.fermer();
    }
  });

  test('S18 — LE GESTE RÉEL ABOUTIT : créer, recharger, supprimer, et la BASE le confirme', async () => {
    // Le contrôle S18 ne demande pas qu'une règle soit tenue : il demande que
    // « les gestes réels de l'utilisateur aboutissent, ET ne détruisent rien ».
    // Ici, chaque étape est confrontée à PostgreSQL — pas au DOM.
    const vue = await ouvrirParLeVhost('/#/risques');
    try {
      assert.equal(await attendreApplication(vue.page), 'chargee', journalApache());
      await attendreQuiescence(vue.page);

      const marque = 'ZZ-S17-CHAINE-COMPLETE';
      const cree = await vue.page.evaluate(async (m) => {
        const id = UI.genId('ZZS');
        DataStore.addRisque({ id, nom: m });
        const r = await Sync.pousser();
        const enregistre = DataStore.getRisques().find((x) => x.nom === m);
        return { idLocal: id, idServeur: enregistre ? enregistre.id : null, pousse: r };
      }, marque);
      assert.notEqual(cree.idServeur, null, `La création n’a pas abouti : ${JSON.stringify(cree.pousse)}`);
      await attendreQuiescence(vue.page);

      const enBaseApresCreation = await enBase('select id, nom from risques where nom = $1', [marque]);
      assert.equal(enBaseApresCreation.length, 1,
        'Le risque créé dans le navigateur, à travers Apache, n’est pas dans PostgreSQL. ' +
        `Vu : ${JSON.stringify(enBaseApresCreation)}`);
      assert.equal(enBaseApresCreation[0].id, cree.idServeur, 'L’identifiant de la base et celui de la page doivent coïncider.');

      // ── RECHARGER : la ligne revient DU SERVEUR, pas d'un cache local ───────
      await vue.page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(vue.page), 'chargee', journalApache());
      await attendreQuiescence(vue.page);
      const revenu = await vue.page.evaluate((id) => DataStore.getRisques().some((r) => r.id === id), cree.idServeur);
      assert.equal(revenu, true, 'Après rechargement, l’enregistrement n’est pas revenu du serveur.');

      // ── SUPPRIMER : et la base doit le confirmer, pas seulement l'écran ────
      await vue.page.evaluate(async (id) => {
        DataStore.deleteRisque(id);
        await Sync.pousser();
      }, cree.idServeur);
      await attendreQuiescence(vue.page);
      assert.deepEqual(await enBase('select id from risques where nom = $1', [marque]), [],
        'La suppression n’a pas atteint PostgreSQL : l’écran dirait « supprimé » et la donnée resterait.');

      // ── ET RIEN D'AUTRE N'A DISPARU — la moitié qu'on oublie ───────────────
      const restants = await enBase('select count(*)::int as n from risques');
      assert.ok(restants[0].n >= 2, `Le jeu d’essai a été amputé : il reste ${String(restants[0].n)} risque(s).`);

      assert.deepEqual(vue.violationsCsp, [], JSON.stringify(vue.violationsCsp));
      assert.deepEqual(vue.erreursInattendues(), [], 'Le navigateur a crié pendant le geste réel.');
    } finally {
      await vue.fermer();
    }
  });

  test('LA REDIRECTION EN CLAIR mène au vhost TLS, et le corps hors borne est refusé PAR APACHE', async () => {
    // Deux propriétés qui n'existent qu'au niveau du frontal, mesurées ici dans le
    // même montage que le reste — et non dans un montage à doublure.
    const vue = await ouvrirParLeVhost('/');
    try {
      await attendreApplication(vue.page);
      // Le refus de corps hors borne est rendu par Apache (`RewriteRule … R=413`) :
      // le serveur ne le voit jamais. C'est le remède du constat Q-44.
      const refus = await vue.page.evaluate(async () => {
        const gros = 'x'.repeat(27 * 1024 * 1024);
        try {
          const r = await fetch('/api/entites/risques', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ champs: { nom: gros } }),
          });
          return r.status;
        } catch (e) { return `rupture: ${String(e)}`; }
      });
      assert.equal(refus, 413, `Un corps de 27 Mio doit être refusé en 413 par le frontal. Vu : ${String(refus)}`);
      // …et la contre-épreuve : une écriture ORDINAIRE traverse le même chemin.
      const ordinaire = await vue.page.evaluate(async () => {
        const r = await fetch('/api/entites/risques', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ champs: { nom: 'ZZ-S17-BORNE-TEMOIN' } }),
        });
        return r.status;
      });
      assert.equal(ordinaire, 201, 'Sans cette moitié, « 413 » serait vrai d’un frontal qui refuse tout.');
      assert.equal((await enBase('select id from risques where nom = $1', ['ZZ-S17-BORNE-TEMOIN'])).length, 1);
    } finally {
      await vue.fermer();
    }
  });
});
