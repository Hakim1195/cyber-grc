/**
 * vhost-apache.test.mjs — le vhost livré, joué par un APACHE RÉEL.
 *
 * ── Pourquoi ce fichier existe, et ce qu'il apporte que l'autre ne peut pas ──
 *
 * `frontend-publiable.test.mjs` éprouve le motif `<FilesMatch>` du vhost en le
 * **simulant en JavaScript sur des noms de fichier**. Cette simulation est
 * utile — elle voit les contournements par extension, elle ne coûte rien, elle
 * ne dépend d'aucun binaire — et elle est passée à côté du bloquant **Q-36**.
 *
 * Elle n'y est pas passée « par nature » : elle y est passée à cause d'**une
 * entrée**, la chaîne vide. Pour `GET /`, Apache résout le chemin
 * `…/frontend/`, dont le dernier composant est vide, et il décide de
 * l'autorisation **avant** que `DirectoryIndex` n'ait choisi `index.html`. Un
 * motif à négation est vrai sur la chaîne vide : `Require all denied`
 * s'appliquait donc au répertoire, et **la page d'accueil rendait 403** pendant
 * que `/index.html` rendait 200.
 *
 * Trois choses ne s'obtiennent que d'un Apache réel, et ce sont les trois qui
 * manquaient :
 *
 *  1. **quelle entrée Apache donne au motif** — rien dans le vhost ne le dit ;
 *     c'est son journal qui l'a appris (`AH01630 … /opt/cyber-grc/frontend/`) ;
 *  2. **l'ordre d'évaluation** — l'autorisation avant `DirectoryIndex` ;
 *  3. **la chaîne complète** — 308, puis TLS, puis la résolution d'index.
 *
 * L'essai JavaScript **fige** la leçon (`LE RÉGRESSEUR DU BLOQUANT Q-36`),
 * celui-ci la **trouve**. Il faut les deux ; c'est celui-ci qui manquait.
 *
 * ── Ce qu'il coûte, dit franchement ─────────────────────────────────────────
 *
 * Il ajoute au banc une dépendance neuve : **Apache doit être installé**, avec
 * `openssl` et `rsync`. Si l'un manque, cet essai **échoue** — il ne se saute
 * pas. C'est l'arbitrage déjà rendu pour `psql` dans `base/demonstration.test.mjs`,
 * et c'est la leçon du constat **Q-37** : l'absence d'un outil ne doit jamais
 * ressembler à une propriété tenue. Compter : ~1 s de démarrage d'Apache, une
 * paire de clés RSA à générer, et la publication réelle des 64 fichiers.
 *
 * ── Ce qui est substitué au vhost, et ce qui ne l'est JAMAIS ────────────────
 *
 * Le fichier joué est **celui du dépôt**. Neuf substitutions le rendent
 * jouable hors VM (ports, chemins, certificat, cible du mandataire) ; chacune
 * est déclarée, et le nombre d'occurrences attendu est vérifié — une
 * substitution qui ne s'appliquerait plus ferait passer l'essai contre un vhost
 * qui n'est pas celui qu'on croit. **Aucune ne touche une directive de
 * décision** : `<FilesMatch>`, `Require`, `Options`, `DirectoryIndex` et les
 * en-têtes sont copiés à l'octet près, et l'essai le vérifie.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { jouerBloc } from '../aide/install.mjs';
import { RACINE_BACKEND, RACINE_FRONTEND } from '../aide/serveur.mjs';

/** Le nom d'hôte du vhost livré. `/etc/hosts` le fait pointer sur la boucle locale. */
const HOTE = 'grc.exemple.interne';
const VHOST_SOURCE = join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf');
const DURCISSEMENT = join(RACINE_BACKEND, 'deploy', 'apache', 'durcissement-global.conf');

let racine;
let racineWeb;
let portClair;
let portTls;
let portApi;
let certificat;
let apache;
let apiDoublure;

/**
 * Exige un outil, et ÉCHOUE bruyamment s'il manque.
 *
 * Constat **Q-37** : un essai vert parce qu'un binaire est absent est un décor.
 * Le même arbitrage qu'`ouvrirBaseEssai` pour `psql` : on dit quoi installer,
 * on ne se saute pas.
 */
function exigerOutil(commande, arguments_, pourquoi) {
  let present = true;
  try {
    execFileSync(commande, arguments_, { stdio: 'ignore' });
  } catch {
    present = false;
  }
  assert.ok(
    present,
    `« ${commande} » est introuvable sur cette machine. ${pourquoi} Installez-le plutôt que ` +
      'de neutraliser cet essai : un contrôle qui se saute quand l’outil manque ne protège ' +
      'que les machines où il n’y avait rien à protéger (constat Q-37).',
  );
}

/** Un port libre sur la boucle locale. */
function portLibre() {
  return new Promise((resoudre, rejeter) => {
    const serveur = net.createServer();
    serveur.on('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = serveur.address();
      serveur.close(() => resoudre(port));
    });
  });
}

/** Attend qu'un port accepte les connexions, et ÉCHOUE en le disant sinon. */
async function attendrePort(port, quoi, delai = 20000) {
  const echeance = Date.now() + delai;
  for (;;) {
    const ouvert = await new Promise((resoudre) => {
      const prise = net.connect(port, '127.0.0.1');
      prise.on('connect', () => {
        prise.destroy();
        resoudre(true);
      });
      prise.on('error', () => resoudre(false));
    });
    if (ouvert) return;
    if (Date.now() > echeance) {
      throw new Error(
        `${quoi} n’écoute toujours pas sur ${String(port)} après ${String(delai)} ms.\n` +
          journalApache(),
      );
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Ce qu'Apache a écrit — le seul endroit où il explique ses refus. */
function journalApache() {
  const morceaux = [];
  for (const nom of ['global-erreurs.log', 'cyber-grc-erreurs.log']) {
    const chemin = join(racine, 'logs', nom);
    if (existsSync(chemin)) morceaux.push(`--- ${nom}\n${readFileSync(chemin, 'utf8').slice(-2000)}`);
  }
  if (existsSync(join(racine, 'apache.sortie'))) {
    morceaux.push(`--- sortie\n${readFileSync(join(racine, 'apache.sortie'), 'utf8').slice(-1000)}`);
  }
  return morceaux.join('\n');
}

/** Écrit le vhost du dépôt, rendu jouable ici — substitutions DÉCLARÉES. */
function ecrireVhost() {
  const source = readFileSync(VHOST_SOURCE, 'utf8');
  const substitutions = [
    ['<VirtualHost *:80>', `<VirtualHost *:${String(portClair)}>`, 1],
    ['<VirtualHost *:443>', `<VirtualHost *:${String(portTls)}>`, 1],
    // La redirection vise le port 443 par défaut : hors VM elle doit nommer le nôtre.
    ['https://%{SERVER_NAME}/$1', `https://%{SERVER_NAME}:${String(portTls)}/$1`, 1],
    ['DocumentRoot /opt/cyber-grc/frontend', `DocumentRoot ${racineWeb}`, 1],
    ['<Directory /opt/cyber-grc/frontend>', `<Directory ${racineWeb}>`, 1],
    [
      'SSLCertificateFile      /etc/ssl/cyber-grc/serveur.crt',
      `SSLCertificateFile      ${join(racine, 'tls', 'serveur.crt')}`,
      1,
    ],
    [
      'SSLCertificateKeyFile   /etc/ssl/cyber-grc/serveur.key',
      `SSLCertificateKeyFile   ${join(racine, 'tls', 'serveur.key')}`,
      1,
    ],
    // Pas de PKI interne ici : le certificat auto-signé n'a pas de chaîne.
    ['    SSLCertificateChainFile /etc/ssl/cyber-grc/chaine-pki-interne.crt\n', '', 1],
    ['http://127.0.0.1:3001/api/', `http://127.0.0.1:${String(portApi)}/api/`, 2],
  ];

  let vhost = source;
  for (const [avant, apres, attendu] of substitutions) {
    const vues = vhost.split(avant).length - 1;
    assert.equal(
      vues,
      attendu,
      `Substitution « ${avant.trim()} » : ${String(vues)} occurrence(s) au lieu de ` +
        `${String(attendu)}. Le vhost a changé de forme, et cet essai jouerait contre une ` +
        'configuration qui n’est pas celle du dépôt — c’est-à-dire contre rien.',
    );
    vhost = vhost.split(avant).join(apres);
  }

  // ── Rien de ce qui DÉCIDE n'a bougé ─────────────────────────────────────
  // Les substitutions ci-dessus sont des paramètres d'exécution. Si l'une
  // d'elles touchait une règle d'autorisation, cet essai vérifierait sa propre
  // réécriture. On compare donc, ligne à ligne, les directives de décision.
  const decisives = (texte) =>
    texte
      .split('\n')
      .map((l) => l.trim())
      .filter((l) =>
        /^(<\/?FilesMatch|<\/?DirectoryMatch|Require |Options |DirectoryIndex |Header always |SSLProtocol|SSLCipherSuite|LimitRequestBody|ProxyTimeout|RequestHeader |ServerSignature|<\/?LocationMatch)/.test(l),
      );
  assert.deepEqual(
    decisives(vhost),
    decisives(source),
    'Une substitution a touché une directive de décision : l’essai éprouverait sa propre ' +
      'réécriture, pas le vhost livré.',
  );

  writeFileSync(join(racine, 'vhost.conf'), vhost);
}

/** La configuration serveur minimale qui porte le vhost du dépôt. */
function ecrireConfigServeur() {
  writeFileSync(
    join(racine, 'httpd.conf'),
    [
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
      'User www-data',
      'Group www-data',
      `ServerName ${HOTE}`,
      `ErrorLog ${join(racine, 'logs', 'global-erreurs.log')}`,
      'LogLevel warn',
      // Le refus par défaut de la distribution : sans lui, un répertoire situé
      // hors de tout <Directory> serait servi, et l'essai des interdits
      // mesurerait une configuration plus permissive que celle de la VM.
      '<Directory />',
      '    AllowOverride None',
      '    Require all denied',
      '</Directory>',
      'Include /etc/apache2/mods-enabled/*.load',
      'Include /etc/apache2/mods-enabled/*.conf',
      `Listen ${String(portClair)}`,
      `Listen ${String(portTls)}`,
      // Le durcissement de portée serveur est INDISSOCIABLE du vhost : c'est lui
      // qui pose ServerTokens Prod et TraceEnable Off (grille §4, S10 et S12).
      `Include ${DURCISSEMENT}`,
      `Include ${join(racine, 'vhost.conf')}`,
      '',
    ].join('\n'),
  );
}

before(async () => {
  exigerOutil('apache2', ['-v'], 'Cet essai joue le vhost livré contre un Apache réel : c’est la seule façon de voir ce qu’Apache donne à <FilesMatch>, et c’est par là que le bloquant Q-36 est passé.');
  exigerOutil('openssl', ['version'], 'Le vhost impose HTTPS ; il faut un certificat.');
  exigerOutil('rsync', ['--version'], 'La racine web est publiée par le VRAI rsync, comme sur la VM.');

  racine = mkdtempSync(join(tmpdir(), 'grc-apache-'));
  // Apache tourne sous `www-data` : il doit pouvoir TRAVERSER l'arborescence.
  chmodSync(racine, 0o755);
  racineWeb = join(racine, 'frontend');
  for (const sous of ['logs', 'run', 'tls', 'frontend']) mkdirSync(join(racine, sous), { recursive: true });
  chmodSync(join(racine, 'logs'), 0o777);
  chmodSync(join(racine, 'run'), 0o777);

  [portClair, portTls, portApi] = await Promise.all([portLibre(), portLibre(), portLibre()]);

  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', join(racine, 'tls', 'serveur.key'),
      '-out', join(racine, 'tls', 'serveur.crt'),
      '-days', '2', '-subj', `/CN=${HOTE}`,
      '-addext', `subjectAltName=DNS:${HOTE}`,
      '-addext', 'basicConstraints=critical,CA:FALSE'],
    { stdio: 'ignore' },
  );
  certificat = readFileSync(join(racine, 'tls', 'serveur.crt'));

  // ── La racine web est publiée par le VRAI rsync, via le bloc d'install.sh ──
  // Pas une copie « équivalente » : la copie que la VM fera, avec ses règles de
  // filtre, jouées telles quelles. Le refus de doubler rsync tenait tant qu'il
  // était absent de la machine ; il ne tient plus, et c'est tant mieux.
  const publication = jouerBloc(
    'frontend',
    { DEPOT: join(RACINE_FRONTEND, '..'), RACINE: racine, SOURCE: RACINE_BACKEND },
    racine,
  );
  assert.equal(publication.code, 0, `La publication du frontend doit aboutir :\n${publication.sortie}`);
  assert.match(publication.sortie, /ok frontend : \d+ fichier\(s\) publiés/, publication.sortie);

  // Une doublure d'API, pour que le mandataire ait quelque chose à joindre.
  // Elle ne prouve rien de l'application ; elle prouve que `ProxyPass` marche,
  // et que `/api/` échappe bien aux règles de fichier du frontend.
  apiDoublure = http.createServer((requete, reponse) => {
    reponse.writeHead(200, { 'content-type': 'application/json' });
    reponse.end(JSON.stringify({ chemin: requete.url, doublure: true }));
  });
  await new Promise((r) => apiDoublure.listen(portApi, '127.0.0.1', r));

  ecrireVhost();
  ecrireConfigServeur();
  execFileSync('chmod', ['-R', 'a+rX', racineWeb]);

  const controle = execFileSync('apache2', ['-f', join(racine, 'httpd.conf'), '-t'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(controle + ' ', /Syntax OK|^\s*$/m, controle);

  apache = spawn('apache2', ['-f', join(racine, 'httpd.conf'), '-DFOREGROUND'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sortie = [];
  apache.stdout.on('data', (d) => sortie.push(String(d)));
  apache.stderr.on('data', (d) => {
    sortie.push(String(d));
    writeFileSync(join(racine, 'apache.sortie'), sortie.join(''));
  });
  await attendrePort(portClair, 'Apache (clair)');
  await attendrePort(portTls, 'Apache (TLS)');
});

after(async () => {
  // `-k graceful-stop` arrête AUSSI les processus fils. Un simple signal au
  // parent laisserait derrière lui des Apache orphelins, et une machine qui en
  // accumule à chaque exécution finit par ne plus rien pouvoir démarrer.
  if (apache !== undefined) {
    try {
      execFileSync('apache2', ['-f', join(racine, 'httpd.conf'), '-k', 'graceful-stop'], {
        stdio: 'ignore',
      });
    } catch {
      apache.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 500));
    apache.kill('SIGKILL');
  }
  await new Promise((r) => (apiDoublure === undefined ? r() : apiDoublure.close(r)));
  if (racine !== undefined) rmSync(racine, { recursive: true, force: true });
});

/* =====================================================================
 *  Parler à Apache — en vérifiant SON certificat, jamais en le désactivant
 * ===================================================================== */

function demander(chemin) {
  return new Promise((resoudre, rejeter) => {
    const requete = https.request(
      { host: HOTE, port: portTls, path: chemin, method: 'GET', agent: false, ca: certificat, servername: HOTE },
      (reponse) => {
        let corps = '';
        reponse.on('data', (m) => (corps += m));
        reponse.on('end', () => resoudre({ statut: reponse.statusCode, entetes: reponse.headers, corps }));
      },
    );
    requete.on('error', rejeter);
    requete.end();
  });
}

function demanderEnClair(chemin) {
  return new Promise((resoudre, rejeter) => {
    const requete = http.request(
      { host: HOTE, port: portClair, path: chemin, method: 'GET', agent: false },
      (reponse) => {
        reponse.resume();
        reponse.on('end', () => resoudre({ statut: reponse.statusCode, entetes: reponse.headers }));
      },
    );
    requete.on('error', rejeter);
    requete.end();
  });
}

/** Les chemins relatifs de tous les fichiers publiés. */
function fichiersPublies(dossier = racineWeb, prefixe = '') {
  const trouves = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const relatif = prefixe === '' ? entree.name : `${prefixe}/${entree.name}`;
    if (entree.isDirectory()) trouves.push(...fichiersPublies(join(dossier, entree.name), relatif));
    else trouves.push(relatif);
  }
  return trouves;
}

/* =====================================================================
 *  §1 — L'URL D'ENTRÉE (constat Q-36, bloquant)
 * ===================================================================== */

describe('L’URL d’entrée, dans la configuration de déploiement (constat Q-36)', () => {
  test('LE BLOQUANT : http://hôte → 308 → https://hôte/ → 200, la page est là', async () => {
    // ── Ce que cet essai regarde, et pourquoi pas /index.html ───────────────
    //
    // `/index.html` répondait 200 pendant que le produit était mort. Ce qu'il
    // faut interroger est l'URL par laquelle tout le monde entre — celle qui
    // ne nomme aucun fichier, et dont Apache tire un dernier composant VIDE.
    const clair = await demanderEnClair('/');
    assert.equal(clair.statut, 308, 'Le trafic en clair doit être redirigé, définitivement.');
    assert.equal(
      clair.entetes.location,
      `https://${HOTE}:${String(portTls)}/`,
      `La redirection doit viser le même hôte en HTTPS. Vue : ${String(clair.entetes.location)}`,
    );

    const entree = await demander('/');
    assert.equal(
      entree.statut,
      200,
      'L’URL d’entrée du produit doit être SERVIE. Un 403 ici rend l’application entièrement ' +
        'inaccessible, quel que soit l’état du reste : Apache décide de l’autorisation sur le ' +
        'dernier composant du chemin — vide pour une requête de répertoire — AVANT que ' +
        `DirectoryIndex n’ait choisi index.html (constat Q-36, bloquant).\n${journalApache()}`,
    );
    assert.match(entree.corps, /<div id="app"/, 'Et ce qui est servi doit être la SPA elle-même.');

    // La moitié qui dit pourquoi cet essai vise `/` et non `/index.html` : les
    // deux répondent 200 sur un produit sain, et seule la première distingue.
    const parLeNom = await demander('/index.html');
    assert.equal(parLeNom.statut, 200, 'La page nommée explicitement reste servie, évidemment.');
  });

  test('TOUS LES FICHIERS PUBLIÉS sont réellement servis, un par un', async () => {
    // ── La moitié symétrique, et elle n'est pas décorative ──────────────────
    //
    // Un vhost qui refuserait TOUT passerait l'essai des interdits et livrerait
    // une application muette. On demande donc chaque fichier réellement publié.
    const publies = fichiersPublies();
    assert.ok(publies.length >= 60, `Publication suspecte : ${String(publies.length)} fichier(s).`);
    assert.ok(publies.includes('index.html'), 'La page elle-même doit avoir été publiée.');

    const refuses = [];
    for (const relatif of publies) {
      const reponse = await demander(`/${relatif}`);
      if (reponse.statut !== 200) refuses.push(`${relatif} → ${String(reponse.statut)}`);
    }
    assert.deepEqual(
      refuses,
      [],
      'Ces fichiers ont été COPIÉS par install.sh et REFUSÉS par Apache : la page serait ' +
        'livrée incomplète, et la panne ne se verrait qu’à l’usage.\n' +
        refuses.map((f) => `    · ${f}`).join('\n'),
    );
  });
});

/* =====================================================================
 *  §2 — Ce qu'Apache refuse, sur des fichiers QUI EXISTENT (constat Q-31)
 * ===================================================================== */

describe('La liste blanche du frontal refuse ce qui n’est pas publiable (constat Q-31)', () => {
  /**
   * Les intrus sont écrits APRÈS la publication, directement dans la racine
   * web. C'est le cas réel que la barrière du frontal couvre : un reliquat
   * d'installation, un dépôt manuel, un `--delete` qui n'a pas emporté un
   * fichier. Et ils EXISTENT sur le disque — un 403 sur un fichier absent ne
   * prouverait pas grand-chose.
   */
  const INTRUS = [
    'Registre_des_risques.xlsx',
    'Plan_de_continuite.xlsx',
    '~$Exigences_client.xlsx',
    'notes.md',
    'sauvegarde.sql',
    'app.js.bak',
    'index.html.orig',
    'configuration.env',
    'export.CSV',
    'rapport.PDF',
    'sans_extension',
    'data/donnees.csv',
  ];

  test('DOUZE INTRUS, tous présents sur le disque, sont tous refusés', async () => {
    for (const relatif of INTRUS) {
      const chemin = join(racineWeb, relatif);
      mkdirSync(join(chemin, '..'), { recursive: true });
      writeFileSync(chemin, 'donnée client d’essai');
    }
    execFileSync('chmod', ['-R', 'a+rX', racineWeb]);

    const servis = [];
    for (const relatif of INTRUS) {
      assert.equal(existsSync(join(racineWeb, relatif)), true, `${relatif} doit exister sur le disque.`);
      const reponse = await demander(`/${relatif}`);
      if (reponse.statut !== 403) servis.push(`${relatif} → ${String(reponse.statut)}`);
    }
    assert.deepEqual(
      servis,
      [],
      'Ces fichiers EXISTENT dans la racine web et Apache les délivre — sans aucune ' +
        'authentification, à qui devine l’URL. C’est le constat Q-31, et il portait sur des ' +
        'données client réelles.\n' + servis.map((f) => `    · ${f}`).join('\n'),
    );

    // Et la page voisine, elle, est toujours servie : le 403 vient de la RÈGLE,
    // pas d'un frontal qui se serait mis à tout refuser en cours d'essai.
    assert.equal((await demander('/index.html')).statut, 200);
  });

  test('UN LIEN SYMBOLIQUE ne sert rien, même sous un nom publiable', async () => {
    // `-FollowSymLinks` : un lien déposé dans l'arborescence web servirait
    // n'importe quel fichier du disque — à commencer par le magasin de pièces
    // jointes (lot L6). Le nom choisi est `.html` exprès : la liste blanche le
    // laisserait passer, c'est l'autre barrière qui doit tenir.
    const lien = join(racineWeb, 'fuite.html');
    symlinkSync('/etc/hostname', lien);
    const reponse = await demander('/fuite.html');
    assert.equal(
      reponse.statut,
      403,
      `Un lien symbolique publiable a été SUIVI : tout le disque devient servable. ` +
        `Reçu ${String(reponse.statut)}.\n${journalApache()}`,
    );
    // Contrôle symétrique : un vrai fichier `.html` déposé au même endroit passe.
    writeFileSync(join(racineWeb, 'temoin.html'), '<div id="app"></div>');
    execFileSync('chmod', ['a+r', join(racineWeb, 'temoin.html')]);
    assert.equal(
      (await demander('/temoin.html')).statut,
      200,
      'Le refus doit venir du LIEN, pas du suffixe : sinon cet essai ne dit rien.',
    );
  });
});

/* =====================================================================
 *  §3 — Ce qu'Apache pose sur chaque réponse (grille §4, S10 et S12)
 * ===================================================================== */

describe('Les en-têtes du vhost, posés par Apache lui-même (contrôles S10 / S12)', () => {
  test('la page d’entrée porte la politique de sécurité de contenu et ses voisines', async () => {
    const reponse = await demander('/');
    const e = reponse.entetes;
    assert.match(e['content-security-policy'] ?? '', /script-src 'self'/, 'CSP absente ou permissive.');
    assert.equal(/unsafe-eval/.test(e['content-security-policy'] ?? ''), false);
    assert.equal(/script-src[^;]*unsafe-inline/.test(e['content-security-policy'] ?? ''), false);
    assert.match(e['strict-transport-security'] ?? '', /max-age=31536000/);
    assert.equal(e['x-content-type-options'], 'nosniff');
    assert.equal(e['x-frame-options'], 'DENY');
    assert.equal(e['referrer-policy'], 'same-origin');
    // S12 : la bannière ne renseigne pas sur la pile. C'est `ServerTokens Prod`
    // de `durcissement-global.conf` qui l'obtient — le vhost seul n'y suffit pas.
    assert.equal(e.server, 'Apache', `Bannière trop bavarde : ${String(e.server)}`);
    assert.equal(e['x-powered-by'], undefined);
    // La page qui porte les jetons de version ne doit JAMAIS être mise en cache.
    assert.match(e['cache-control'] ?? '', /no-cache/);
  });

  test('/api/ est relayé au service, et n’est jamais mis en cache', async () => {
    const reponse = await demander('/api/sante');
    assert.equal(reponse.statut, 200, `Le mandataire doit joindre le service : ${reponse.corps.slice(0, 200)}`);
    assert.equal(JSON.parse(reponse.corps).doublure, true, 'Et la réponse doit venir de derrière.');
    assert.equal(
      reponse.entetes['cache-control'],
      'no-store',
      'Une réponse d’API mise en cache par un mandataire intermédiaire serait une fuite ' +
        'inter-utilisateurs.',
    );
  });
});
