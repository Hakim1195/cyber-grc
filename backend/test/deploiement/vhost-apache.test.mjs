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
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { exigerSilenceApres } from '../aide/assertions.mjs';
import { extraireBloc, extraireFonction, jouerBloc, jouerBlocAttendu, jouerScript } from '../aide/install.mjs';
import { RACINE_BACKEND, RACINE_FRONTEND } from '../aide/serveur.mjs';
import { attendrePort as attendrePortOutil, exigerOutil, portLibre } from '../aide/outils.mjs';

/**
 * Le nom d'hôte du vhost livré — celui du `ServerName`, du certificat et de
 * l'en-tête `Host`. **Il n'est jamais résolu.**
 *
 * ── Constat Q-45 : un banc qui dépendait d'un /etc/hosts modifié à la main ──
 *
 * Ces essais se connectaient PAR CE NOM. Sur cette machine, quelqu'un avait
 * ajouté « 127.0.0.1 grc.exemple.interne » à `/etc/hosts` — à la main, sans
 * qu'aucun essai ne le pose et qu'aucun document ne le réclame. Sur une machine
 * propre, les quatorze essais de cette famille tombaient en `ENOTFOUND`, et le
 * contrôle S17 avec eux : le banc n'était pas reproductible là où cela compte.
 *
 * Le remède ne pose rien et n'exige rien : **on se connecte à l'ADRESSE, et on
 * porte le NOM** — en-tête `Host` pour le vhost, `servername` pour la
 * vérification du certificat, qui reste entière. C'est exactement ce que fait
 * `install.sh` avec `--resolve`, et c'est plus juste que la résolution : l'essai
 * atteint CE serveur-ci, quoi que le DNS de la machine raconte.
 */
const HOTE = 'grc.exemple.interne';
/** L'adresse réellement composée. Rien, ici, n'interroge un résolveur. */
const ADRESSE = '127.0.0.1';
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
/** Ce que la doublure d'API a réellement reçu (corps compris). */
let vuesDeLaDoublure;
/** La vraie `dns.lookup`, remise en place à la fin (voir le piège ci-dessous). */
let lookupOrigine;
let urlVersionnees = 0;

/**
 * Les trois gestes communs — `exigerOutil`, `portLibre`, `attendrePort` — ont
 * quitté ce fichier pour `test/aide/outils.mjs` à la vague 3 : deux familles
 * neuves montent elles aussi un processus qui écoute, et la copie allait faire
 * quatre exemplaires. L'arbitrage du constat Q-37 est parti avec eux.
 */
const attendrePort = (port, quoi, delai = 20000) => attendrePortOutil(port, quoi, delai, journalApache);

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

/**
 * Écrit le vhost du dépôt, rendu jouable ici — substitutions DÉCLARÉES.
 *
 * `supplementaires` sert aux essais qui doivent éprouver un vhost FAUTIF : la
 * mutation y est passée comme une substitution ordinaire, donc comptée comme
 * les autres. Un essai qui muterait « à peu près » finirait par éprouver autre
 * chose que ce qu'il annonce.
 */
function ecrireVhost(supplementaires = []) {
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
    ...supplementaires,
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

  // ══ RIEN N'A BOUGÉ, HORS DE CE QUI EST DÉCLARÉ (constat Q-61) ═════════
  //
  // La rédaction précédente comparait les lignes commençant par une poignée de
  // préfixes — `<FilesMatch`, `Require `, `Header always `… — soit **46 des 99
  // directives** du vhost. C'était un annuaire de plus : ce qu'il ne nommait
  // pas, il ne le regardait pas, et l'essai éprouvait donc en partie sa propre
  // réécriture.
  //
  // La propriété, elle, ne demande aucune liste : **toute ligne que je n'ai pas
  // déclaré toucher doit survivre à l'identique, et dans le même ordre.** On
  // exclut donc, des deux textes, les lignes des `avant` et des `apres`
  // déclarés — et on exige que le reste soit rigoureusement égal.
  // Un `avant` n'est pas toujours une ligne entière — « http://127.0.0.1:3001/api/ »
  // vit à l'intérieur d'un `ProxyPass`. On raisonne donc en FRAGMENTS : une
  // ligne qui en contient un est une ligne déclarée, et elle sort de la
  // comparaison ; toutes les autres doivent être identiques.
  const declarees = [];
  for (const [avant, apres] of substitutions) {
    for (const bout of [String(avant), String(apres)]) {
      for (const ligne of bout.split('\n')) if (ligne.trim() !== '') declarees.push(ligne.trim());
    }
  }
  const survivantes = (texte) =>
    texte
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !declarees.some((f) => l.includes(f)));

  const avantTout = survivantes(source);
  const apresTout = survivantes(vhost);
  assert.ok(
    avantTout.length >= 200,
    `Seulement ${String(avantTout.length)} ligne(s) comparée(s) : la comparaison ne porterait ` +
      'presque sur rien, et « rien n’a bougé » ne voudrait rien dire.',
  );
  assert.deepEqual(
    apresTout,
    avantTout,
    'Une substitution a touché une ligne qu’elle n’avait pas déclarée : l’essai éprouverait sa ' +
      'propre réécriture plutôt que le vhost livré (constat Q-61). Toute ligne hors des ' +
      '`avant`/`apres` déclarés doit survivre à l’identique.',
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
  // ══ Q-45 : LE PIÈGE À RÉSOLUTION, ET POURQUOI IL EST UNE BARRIÈRE ═══════
  //
  // Ce fichier ne doit RIEN résoudre : il compose l'adresse et porte le nom.
  // Écrit ainsi, cela tient par discipline — et la discipline est précisément
  // ce qui a lâché, puisque personne n'avait remarqué que le banc dépendait
  // d'un `/etc/hosts` modifié à la main sur cette machine-ci.
  //
  // On pose donc une barrière plutôt qu'une consigne : toute résolution de nom
  // faite depuis ce processus échoue, en disant pourquoi. Sur la machine qui
  // porte l'entrée, un `host: HOTE` réintroduit par mégarde rougirait donc
  // ICI, au lieu d'attendre la machine propre du prochain auditeur.
  //
  // Les adresses littérales n'y passent pas : Node ne consulte aucun résolveur
  // pour « 127.0.0.1 ». Les sous-processus non plus — `curl --resolve` du bloc
  // « configtest » garde son propre chemin, et c'est très bien ainsi.
  lookupOrigine = dns.lookup;
  dns.lookup = (nom, ...reste) => {
    // Une ADRESSE littérale n'est pas une résolution — Node passe quand même
    // par ce chemin pour « 127.0.0.1 », et le lui refuser couperait le banc de
    // sa propre boucle locale. Le piège ne vise que les NOMS.
    if (net.isIP(String(nom)) !== 0) return lookupOrigine(nom, ...reste);
    const erreur = new Error(
      `Ce banc a tenté de RÉSOUDRE « ${String(nom)} ». Il ne doit jamais le faire : il se ` +
        'connecte à 127.0.0.1 et porte le nom dans l’en-tête « Host » et dans le « servername » ' +
        'du certificat. Une résolution ici veut dire que le banc dépend d’une entrée /etc/hosts ' +
        'que personne ne pose — c’est le constat Q-45, et il a coûté 14 essais rouges sur une ' +
        'machine propre.',
    );
    const rappel = reste[reste.length - 1];
    if (typeof rappel === 'function') {
      rappel(erreur);
      return undefined;
    }
    throw erreur;
  };

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

  // ── …puis VERSIONNÉE par la vraie injection de jeton ──────────────────
  // Sans elle, la racine web n'est pas dans l'état qu'une installation laisse :
  // les 61 URL `.js`/`.css` d'index.html seraient nues, et le garde-fou du
  // constat Q-43 refuserait l'installation à bon droit — l'essai mesurerait
  // alors son propre montage, pas le produit.
  const injection = jouerScript(
    [
      extraireFonction('jeton_frontend'),
      extraireFonction('injecter_jeton_frontend'),
      'JETON="$(jeton_frontend "$RACINE/frontend" "$VERSION_PAQUET")"',
      'N="$(injecter_jeton_frontend "$RACINE/frontend/index.html" "$JETON")"',
      'printf "versionnees=%s jeton=%s\\n" "$N" "$JETON"',
    ].join('\n\n'),
    { RACINE: racine, VERSION_PAQUET: '1.4.2' },
    racine,
    'jeton',
  );
  assert.equal(injection.code, 0, `L’injection du jeton doit aboutir :\n${injection.sortie}`);
  const compte = /versionnees=(\d+)/.exec(injection.sortie);
  assert.notEqual(compte, null, injection.sortie);
  assert.ok(
    Number(compte[1]) >= 55,
    `Seulement ${compte[1]} URL versionnées : le montage ne reproduit pas une installation ` +
      `réelle, et tout ce qui suit mesurerait ce montage.\n${injection.sortie}`,
  );
  urlVersionnees = Number(compte[1]);

  // Une doublure d'API, pour que le mandataire ait quelque chose à joindre.
  // Elle ne prouve rien de l'application ; elle prouve que `ProxyPass` marche,
  // et que `/api/` échappe bien aux règles de fichier du frontend.
  // ══ LA DOUBLURE DOIT POUVOIR PRODUIRE LE CONTRE-EXEMPLE ═══════════════
  //
  // C'est la règle des assertions d'absence, portée à l'instrument : **un outil
  // qui ne peut pas produire le contre-exemple rend l'assertion vraie pour
  // rien.** Elle a déjà coûté deux fois ailleurs — une doublure qui ne rendait
  // que des compteurs d'octets faisait passer « l'en-tête n'est pas arrivé »
  // alors qu'elle n'aurait su le dire dans aucun cas. Celle-ci doit donc :
  //
  //  · **rendre les en-têtes reçus** — sans quoi les essais du constat Q-39
  //    seraient vrais de rien ;
  //  · **consommer et COMPTER le corps** — sans quoi « la doublure ne reçoit
  //    rien » (constat Q-44) serait vrai d'une doublure qui ne lit jamais ;
  //  · **survivre aux ruptures**. Quand Apache refuse en 413, il coupe le lien
  //    arrière : une doublure qui ne gère pas `error` meurt sur rupture de
  //    tube, et l'on obtient des 502, 503 ou 000 qui viennent de l'instrument
  //    et non du produit. Chaque flux porte donc son gestionnaire, et le
  //    serveur aussi.
  const recues = [];
  apiDoublure = http.createServer((requete, reponse) => {
    const vue = { chemin: requete.url, methode: requete.method, entetes: requete.headers, octets: 0, complet: false };
    recues.push(vue);
    requete.on('data', (morceau) => {
      vue.octets += morceau.length;
    });
    requete.on('error', () => {
      /* lien coupé en amont : on garde ce qui a été compté, sans mourir */
    });
    reponse.on('error', () => {});
    requete.on('end', () => {
      vue.complet = true;
      if (reponse.writableEnded) return;
      reponse.writeHead(200, { 'content-type': 'application/json' });
      reponse.end(JSON.stringify({ chemin: requete.url, doublure: true, entetes: requete.headers, octets: vue.octets }));
    });
  });
  apiDoublure.on('clientError', (_erreur, prise) => prise.destroy());
  apiDoublure.on('error', () => {});
  // Ce que la doublure a vu, depuis un rang donné — l'instrument de mesure des
  // essais du constat Q-44.
  vuesDeLaDoublure = { rang: () => recues.length, depuis: (n) => recues.slice(n) };
  await new Promise((r) => apiDoublure.listen(portApi, '127.0.0.1', r));

  ecrireVhost();
  ecrireConfigServeur();

  // ── Une enveloppe d'`apache2ctl`, et c'est la seule doublure du fichier ──
  // Le bloc « configtest » appelle `apache2ctl configtest`, qui lit la
  // configuration DU SYSTÈME. Sans cette enveloppe, l'essai éprouverait la
  // configuration d'une autre instance — et rougirait pour une raison qui
  // n'est pas la sienne. La traduction `configtest` → `-t` est celle
  // qu'`apache2ctl` fait lui-même ; rien d'autre n'est simulé.
  writeFileSync(
    join(racine, 'apachectl'),
    ['#!/bin/sh',
      `conf=${join(racine, 'httpd.conf')}`,
      'case "$1" in',
      '  configtest) exec apache2 -f "$conf" -t ;;',
      '  *) exec apache2 -f "$conf" "$@" ;;',
      'esac',
      ''].join('\n'),
    { mode: 0o755 },
  );
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

/**
 * Relit la configuration, et attend que le changement soit OBSERVABLE.
 *
 * `-k graceful` est asynchrone : les processus fils en cours terminent avec
 * l'ancienne configuration. Attendre une durée serait un pari ; on attend donc
 * que la propriété visée soit vraie, ce qui ne peut arriver qu'une fois le
 * rechargement effectif.
 */
async function rechargerApache(preuve, quoi, delai = 20000) {
  execFileSync('apache2', ['-f', join(racine, 'httpd.conf'), '-k', 'graceful'], { stdio: 'ignore' });
  const echeance = Date.now() + delai;
  for (;;) {
    if (await preuve()) return;
    if (Date.now() > echeance) {
      throw new Error(`Apache n’a pas pris sa nouvelle configuration en ${String(delai)} ms : ${quoi}\n${journalApache()}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Le `max-age` qu'Apache annonce pour une URL, ou `null`. */
async function maxAge(chemin) {
  const reponse = await demander(chemin);
  const trouve = /max-age=(\d+)/.exec(reponse.entetes['cache-control'] ?? '');
  return trouve === null ? null : Number(trouve[1]);
}

/**
 * Joue le vhost MUTÉ le temps d'un essai, puis remet celui du dépôt.
 *
 * Le retour est dans un `finally`, et il est lui aussi attendu sur une preuve :
 * un essai qui laisserait le vhost muté derrière lui ferait échouer les
 * suivants pour une raison qui n'est pas la leur.
 */
async function avecVhost(mutations, preuveMutation, preuveRetour, corps) {
  ecrireVhost(mutations);
  try {
    await rechargerApache(preuveMutation, 'la mutation du vhost n’est pas visible');
    return await corps();
  } finally {
    ecrireVhost();
    await rechargerApache(preuveRetour, 'le vhost du dépôt n’est pas revenu');
  }
}

after(async () => {
  if (lookupOrigine !== undefined) dns.lookup = lookupOrigine;
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

function demander(chemin, options = {}) {
  return new Promise((resoudre, rejeter) => {
    const requete = https.request(
      {
        // ── On compose l'ADRESSE, et l'on porte le NOM (constat Q-45) ──────
        // `servername` fixe le SNI ET la cible de la vérification du certificat
        // — celle-ci reste donc entière, contre « grc.exemple.interne », alors
        // même qu'aucun résolveur n'est interrogé. `Host` est posé plus bas.
        host: ADRESSE, port: portTls, path: chemin, method: 'GET', agent: false,
        ca: certificat, servername: HOTE,
        // `Host` désigne le vhost : sans lui, Apache recevrait « 127.0.0.1 » et
        // `%{SERVER_NAME}` cesserait d'être celui du fichier livré.
        //
        // Node n'annonce AUCUN encodage par défaut : sans `accept-encoding`,
        // Apache n'a aucune raison de compresser, et un essai sur mod_deflate
        // conclurait « pas de gzip » contre un frontal parfaitement réglé.
        headers: { host: `${HOTE}:${String(portTls)}`, ...(options.entetes ?? {}) },
      },
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
      {
        host: ADRESSE, port: portClair, path: chemin, method: 'GET', agent: false,
        headers: { host: `${HOTE}:${String(portClair)}` },
      },
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

    // Les intrus sont retirés : la racine web doit redevenir celle qu'une
    // installation laisse, pour que le garde-fou du §5 éprouve le produit et
    // non les décombres de cet essai-ci.
    for (const relatif of INTRUS) unlinkSync(join(racineWeb, relatif));
    rmSync(join(racineWeb, 'data'), { recursive: true, force: true });
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
    unlinkSync(lien);
    unlinkSync(join(racineWeb, 'temoin.html'));
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

/* =====================================================================
 *  §4 — Le JavaScript est compressé, et caché aussi longtemps que promis
 *       (constat Q-42)
 * ---------------------------------------------------------------------
 *  Le vhost nommait `application/javascript` dans DEUX directives. Apache
 *  2.4.58 sert les `.js` en **`text/javascript`** : aucune des deux ne
 *  s'appliquait. 59 fichiers, 2 166 105 octets, transférés **sans compression**
 *  et revalidés **toutes les heures** au lieu de sept jours — exactement le
 *  coût que le commentaire du bloc se félicitait d'éviter.
 *
 *  ── Pourquoi le régresseur ne porte PAS sur le gzip ─────────────────────
 *
 *  Un essai qui vérifierait seulement « app.js arrive compressé » resterait
 *  vert le jour où Apache change de graphie — et c'est très exactement ainsi
 *  que le défaut est né : un type MIME **écrit de mémoire** au lieu d'être lu
 *  dans la réponse. Le premier essai ci-dessous éprouve donc le VICE : le type
 *  qu'Apache **émet** doit figurer dans ce que le vhost **nomme**. Il ne
 *  connaît aucune graphie ; il compare deux sources, dont aucune n'est lui.
 * ===================================================================== */

describe('Le JavaScript est compressé et caché long (constat Q-42)', () => {
  /** Les types de `AddOutputFilterByType DEFLATE`, continuations comprises. */
  function typesCompresses() {
    const source = readFileSync(VHOST_SOURCE, 'utf8');
    const lignes = source.split('\n');
    const debut = lignes.findIndex((l) => /^\s*AddOutputFilterByType\s+DEFLATE\b/.test(l));
    assert.notEqual(debut, -1, 'Le vhost ne porte plus de AddOutputFilterByType : rien n’est compressé.');
    let texte = '';
    for (let i = debut; i < lignes.length; i += 1) {
      const brute = lignes[i];
      texte += ` ${brute.replace(/\\\s*$/, '')}`;
      if (!/\\\s*$/.test(brute)) break;
    }
    return texte.replace(/^\s*AddOutputFilterByType\s+DEFLATE\s*/, '').trim().split(/\s+/).filter(Boolean);
  }

  /** Les types que `ExpiresByType` cache PLUS LONGTEMPS que `ExpiresDefault`. */
  function typesLongueDuree() {
    const source = readFileSync(VHOST_SOURCE, 'utf8');
    const secondes = (texte) => {
      const trouve = /plus\s+(\d+)\s+(second|minute|hour|day|week|month|year)/.exec(texte);
      if (trouve === null) return 0;
      const facteur = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
      return Number(trouve[1]) * facteur[trouve[2]];
    };
    const defaut = /^\s*ExpiresDefault\s+"([^"]*)"/m.exec(source);
    assert.notEqual(defaut, null, 'Le vhost ne pose plus d’ExpiresDefault : le seuil n’existe plus.');
    const seuil = secondes(defaut[1]);
    assert.ok(seuil > 0, `ExpiresDefault illisible : ${defaut[1]}`);
    const longs = [];
    for (const ligne of source.split('\n')) {
      const trouve = /^\s*ExpiresByType\s+(\S+)\s+"([^"]*)"/.exec(ligne);
      if (trouve !== null && secondes(trouve[2]) > seuil) longs.push(trouve[1]);
    }
    return longs;
  }

  /** Le type MIME qu'Apache annonce, sans son paramètre de jeu de caractères. */
  async function typeEmisPour(chemin) {
    const reponse = await demander(chemin);
    assert.equal(reponse.statut, 200, `${chemin} doit être servi : ${String(reponse.statut)}`);
    const type = (reponse.entetes['content-type'] ?? '').split(';')[0].trim();
    assert.notEqual(type, '', `Apache n’annonce aucun type pour ${chemin}.`);
    return type;
  }

  test('LE RÉGRESSEUR DU VICE : le type qu’Apache ÉMET est celui que le vhost NOMME', async () => {
    // Aucune graphie n'est écrite ici. On demande à Apache ce qu'il émet, on
    // lit dans le vhost ce qu'il nomme, et on exige que le second contienne le
    // premier. C'est la règle que le constat Q-42 impose — « les types se
    // lisent dans ce qu'Apache émet, jamais de mémoire » — rendue exécutable.
    const type = await typeEmisPour('/js/app.js');

    assert.ok(
      typesCompresses().includes(type),
      `Apache sert les « .js » en « ${type} », et AddOutputFilterByType ne le nomme pas : ` +
        `les 59 fichiers JavaScript du produit partent SANS COMPRESSION, sur un VPN, à ` +
        `chaque chargement. Types nommés : ${typesCompresses().join(' ')} (constat Q-42).`,
    );
    assert.ok(
      typesLongueDuree().includes(type),
      `Apache sert les « .js » en « ${type} », et aucun ExpiresByType de cette graphie ne ` +
        `dépasse ExpiresDefault : les 59 fichiers sont revalidés toutes les heures au lieu ` +
        `de sept jours, alors même que leurs URL sont versionnées. Types à durée longue : ` +
        `${typesLongueDuree().join(' ')} (constat Q-42).`,
    );

    // Et la même exigence pour le CSS, qui allait bien : sans ce second cas, un
    // vhost qui aurait perdu les deux graphies passerait pour n'en avoir perdu
    // qu'une, et le message ci-dessus désignerait le mauvais coupable.
    const typeCss = await typeEmisPour('/css/style.css');
    assert.ok(typesCompresses().includes(typeCss), `« ${typeCss} » n’est pas compressé.`);
    assert.ok(typesLongueDuree().includes(typeCss), `« ${typeCss} » n’est pas caché long.`);
  });

  test('MESURÉ SUR LA RÉPONSE : app.js arrive compressé, et vaut sept jours', async () => {
    const reponse = await demander('/js/app.js', { entetes: { 'accept-encoding': 'gzip' } });
    assert.equal(reponse.statut, 200);
    assert.equal(
      reponse.entetes['content-encoding'],
      'gzip',
      `« /js/app.js » arrive sans compression. En-têtes : ${JSON.stringify(reponse.entetes)}`,
    );
    assert.equal(
      await maxAge('/js/app.js'),
      604800,
      'Sept jours, et pas une heure : les URL .js sont versionnées par le jeton, le cache ' +
        'long leur est donc dû (constat Q-42, et invariant du constat Q-43).',
    );
    // La contre-épreuve du gzip : sans l'en-tête, Apache ne compresse pas. Sans
    // elle, l'assertion ci-dessus serait satisfaite par un frontal qui
    // compresse tout, tout le temps, y compris pour un client qui ne sait pas
    // le lire.
    const brut = await demander('/js/app.js');
    assert.equal(brut.entetes['content-encoding'], undefined, 'Sans Accept-Encoding, pas de gzip.');
  });

  test('CONTRÔLE SYMÉTRIQUE : index.html n’est JAMAIS caché', async () => {
    // Sans cette moitié, un `ExpiresDefault` élargi — ou un ExpiresByType posé
    // sur text/html — passerait : « app.js vaut sept jours » resterait vrai, et
    // la page qui PORTE les 61 URL versionnées serait figée avec elles. C'est la
    // condition de validité de tout le dispositif, écrite dans le vhost.
    for (const chemin of ['/', '/index.html']) {
      const reponse = await demander(chemin);
      assert.equal(reponse.statut, 200);
      assert.match(
        reponse.entetes['cache-control'] ?? '',
        /no-cache/,
        `${chemin} doit être revalidé à chaque ouverture.`,
      );
      assert.match(reponse.entetes['cache-control'] ?? '', /must-revalidate/);
      assert.equal(
        await maxAge(chemin),
        null,
        `${chemin} porte un max-age : un index.html périmé redemande les ANCIENNES URL ` +
          'versionnées, que le cache sert aussitôt — tout le dispositif tombe.',
      );
    }
  });
});

/* =====================================================================
 *  §5 — Le garde-fou du cache : LONG ⇒ VERSIONNÉ (constat Q-43)
 * ---------------------------------------------------------------------
 *  Le bloc `mod_expires` ÉNONÇAIT sa condition depuis le début (« ce bloc n'est
 *  sûr que couplé au jeton de version »). Un type non couvert est arrivé —
 *  `image/png`, trente jours, jamais versionné — et personne ne l'a vu pendant
 *  sept passages de porte. La règle était un commentaire.
 *
 *  `install.sh` porte maintenant un contrôle qui la fait respecter. Ces essais
 *  le jouent contre un Apache réel, parce que le contrôle DEMANDE la durée à
 *  Apache : le doubler reviendrait à éprouver ma lecture de `mod_expires`.
 *
 *  ── Le troisième essai est le plus important des trois ──────────────────
 *
 *  Le remède évident au constat était « étendre le jeton aux images ». Il est
 *  faux, et d'une façon vicieuse : le logo a **deux** URL — `index.html` en
 *  porte une, `js/core/vault.js:119` construit l'autre à l'exécution, dans la
 *  porte de démarrage. Versionner la page n'en couvrirait qu'une, tout en
 *  faisant TAIRE un garde-fou borné à la page. C'est la forme la plus coûteuse
 *  du décor : un contrôle que le remède évident éteint sans rien réparer. Le
 *  troisième essai interdit cette version-là du garde-fou.
 * ===================================================================== */

describe('Un actif n’a un cache long que si son URL est versionnée (constat Q-43)', () => {
  /** La mutation : `image/png` reçoit trente jours, sans être versionné. */
  const PNG_TRENTE_JOURS = [
    [
      '        ExpiresDefault                         "access plus 1 hour"',
      '        ExpiresByType image/png                "access plus 30 days"\n' +
        '        ExpiresDefault                         "access plus 1 hour"',
      1,
    ],
  ];
  const LOGO = 'assets/logo/logo-dedienne.png';

  /**
   * La ligne de `vault.js` qui construit l'URL du logo — LUE dans le fichier
   * publié, jamais recopiée.
   *
   * Elle vaut 119 aujourd'hui, et l'écrire ici ferait rougir le banc au premier
   * commentaire ajouté trois lignes plus haut. Ce qui est normatif est que le
   * refus nomme **le fichier ET la ligne** : c'est ce qu'un exploitant a besoin
   * de lire, et c'est cela qui est assertionné.
   */
  function ligneDuLogoDansVault() {
    const source = readFileSync(join(racineWeb, 'js', 'core', 'vault.js'), 'utf8');
    const rang = source.split('\n').findIndex((l) => l.includes(`src="${LOGO}"`));
    assert.notEqual(
      rang,
      -1,
      'js/core/vault.js ne construit plus l’URL du logo : ces essais éprouvent le piège du ' +
        'constat Q-43 — une seconde URL bâtie à l’exécution — et ce piège aurait disparu. ' +
        'Vérifier alors que le garde-fou a toujours une raison d’être avant de toucher ici.',
    );
    return rang + 1;
  }

  /** Le motif « vault.js:<ligne>: » attendu dans le refus. */
  function refusNommeVault() {
    return new RegExp(`vault\\.js:${String(ligneDuLogoDansVault())}:`);
  }

  /**
   * Joue le bloc « configtest » de `install.sh` contre CETTE instance.
   *
   * Huit substitutions, toutes déclarées et comptées : elles disent où est le
   * vhost, quels ports écoutent, et par quoi passer pour parler à `apache2ctl`.
   * **Aucune ne touche ce qui décide** — l'arithmétique des durées, la
   * comparaison au seuil, le motif qui cherche une référence de chargement
   * sans « ?v= ». Les trois lignes qui portent cette décision sont vérifiées
   * présentes, à l'octet près, après substitution.
   */
  function jouerGarde() {
    let bloc = extraireBloc('configtest');
    const substitutions = [
      ['APACHECTL="$(command -v apache2ctl || command -v apachectl || true)"',
        `APACHECTL="${join(racine, 'apachectl')}"`, 1],
      ['/etc/apache2/sites-enabled/cyber-grc.conf', join(racine, 'vhost.conf'), 2],
      ['/etc/apache2/sites-available/cyber-grc.conf', join(racine, 'vhost.conf'), 2],
      [':80:127.0.0.1"', `:${String(portClair)}:127.0.0.1"`, 1],
      [':443:127.0.0.1"', `:${String(portTls)}:127.0.0.1"`, 3],
      ['"http://$NOM_SERVEUR$1"', `"http://$NOM_SERVEUR:${String(portClair)}$1"`, 1],
      ['"https://$NOM_SERVEUR$1"', `"https://$NOM_SERVEUR:${String(portTls)}$1"`, 1],
      ['"https://$NOM_SERVEUR/$REL"', `"https://$NOM_SERVEUR:${String(portTls)}/$REL"`, 1],
    ];
    for (const [avant, apres, attendu] of substitutions) {
      const vues = bloc.split(avant).length - 1;
      assert.equal(
        vues,
        attendu,
        `Substitution « ${avant} » : ${String(vues)} occurrence(s) au lieu de ${String(attendu)}. ` +
          'Le bloc a changé de forme, et cet essai jouerait autre chose que ce qu’il annonce.',
      );
      bloc = bloc.split(avant).join(apres);
    }
    // Ce qui DÉCIDE doit être intact. Sans cette vérification, une substitution
    // maladroite ferait éprouver ma réécriture plutôt que le garde-fou.
    for (const decisive of [
      '[[ -n "$AGE" && "$AGE" -gt "$SEUIL_COURT" ]] || continue',
      'REFS="$(grep -rnE ',
      '$MOTIF',
      'secondes_expires() {',
      'find "$RACINE/frontend" -type f ! -name index.html',
    ]) {
      assert.ok(
        bloc.includes(decisive),
        `La ligne qui décide a disparu du bloc joué : ${decisive}`,
      );
    }
    return jouerScript(bloc, { RACINE: racine }, racine, 'garde-cache');
  }

  test('CONTRÔLE SYMÉTRIQUE : le vhost du dépôt passe le garde-fou', async () => {
    // ── Sans cette moitié, les deux suivantes seraient satisfaites par un
    //    garde-fou qui refuse TOUT — c'est-à-dire par une installation
    //    impossible. Et elle porte la mise en garde de l'auteur du correctif :
    //    les 61 fichiers .js/.css SONT en cache long, et pleinement versionnés ;
    //    aucun ne doit déclencher le refus.
    const issue = jouerGarde();

    assert.equal(
      issue.code,
      0,
      `Le vhost du dépôt doit passer :\n${issue.sortie}\n${journalApache()}`,
    );
    assert.match(
      issue.sortie,
      /ok cache : tout actif à durée longue porte une URL versionnée/,
      `Le garde-fou doit être ALLÉ jusqu’à sa conclusion — sinon son silence ne prouve rien ` +
        `(constat Q-37) :\n${issue.sortie}`,
    );
    // ── Et il a bien regardé quelque chose : le cas EXACT que le garde-fou
    //    doit laisser passer. `js/app.js` est en cache long (sept jours) ET
    //    pleinement versionné : un garde-fou qui le refuserait passerait les
    //    deux essais suivants tout en rendant toute installation impossible.
    assert.equal(
      await maxAge('/js/app.js'),
      604800,
      'Le cas à laisser passer doit bien être un cas de cache LONG, sinon il ne dit rien.',
    );
    const page = readFileSync(join(racineWeb, 'index.html'), 'utf8');
    assert.match(page, /src="js\/app\.js\?v=/, 'Et il doit être VERSIONNÉ dans la page.');
    assert.equal(
      page.includes('src="js/app.js"'),
      false,
      'Aucune référence nue ne doit subsister vers ce fichier : c’est ce qui lui donne droit ' +
        'au cache long, et c’est ce que le garde-fou vérifie.',
    );
    assert.ok(urlVersionnees >= 55, `Seulement ${String(urlVersionnees)} URL versionnées.`);
  });

  test('LE REFUS : un PNG en cache long arrête l’installation, et nomme le fichier fautif', async () => {
    await avecVhost(
      PNG_TRENTE_JOURS,
      async () => (await maxAge(`/${LOGO}`)) === 2592000,
      async () => (await maxAge(`/${LOGO}`)) === 3600,
      async () => {
        const issue = jouerGarde();

        assert.notEqual(
          issue.code,
          0,
          `Un actif caché trente jours et jamais versionné doit ARRÊTER l’installation : ` +
            `sans cela, un changement de logo reste invisible un mois sur tout poste ayant ` +
            `déjà ouvert l’application (constat Q-43).\n${issue.sortie}`,
        );
        assert.match(issue.sortie, /constat Q-43/, 'Le refus doit renvoyer au constat qui l’explique.');
        assert.match(
          issue.sortie,
          new RegExp(`${LOGO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(max-age=2592000\\)`),
          `Le refus doit nommer le fichier ET sa durée :\n${issue.sortie}`,
        );
        assert.match(
          issue.sortie,
          refusNommeVault(),
          `Il doit nommer la référence fautive, fichier ET ligne — c’est ce qu’un exploitant ` +
            `à 22 h a besoin de lire.\n${issue.sortie}`,
        );
        // La page aussi porte une référence nue, à ce stade : c'est elle qui
        // fait parler l'assertion de silence de l'essai suivant.
        assert.match(issue.sortie, /index\.html:\d+:/, `La page doit être nommée elle aussi :\n${issue.sortie}`);
      },
    );
  });

  test('LE REMÈDE NAÏF NE SUFFIT PAS : versionner index.html ne fait pas taire le garde-fou', async () => {
    // ── L'essai qui distingue un garde-fou de portée réelle d'un contrôle
    //    borné à la page. On applique le correctif que tout le monde écrirait —
    //    étendre le jeton au logo dans index.html — et le refus doit TENIR,
    //    parce que `vault.js` construit la seconde URL à l'exécution.
    const page = join(racineWeb, 'index.html');
    const avant = readFileSync(page, 'utf8');
    assert.ok(avant.includes(`src="${LOGO}"`), 'La page doit porter la référence nue avant le correctif.');
    writeFileSync(page, avant.split(`src="${LOGO}"`).join(`src="${LOGO}?v=1.4.2.essai"`));

    try {
      await avecVhost(
        PNG_TRENTE_JOURS,
        async () => (await maxAge(`/${LOGO}`)) === 2592000,
        async () => (await maxAge(`/${LOGO}`)) === 3600,
        async () => {
          const issue = jouerGarde();

          assert.notEqual(
            issue.code,
            0,
            `Le garde-fou s’est TU alors que le logo garde une URL non versionnée dans ` +
              `js/core/vault.js. Un contrôle qui ne regarde qu’index.html est éteint par le ` +
              `remède évident sans que rien ne soit réparé — c’est la forme la plus coûteuse ` +
              `du décor (constat Q-43).\n${issue.sortie}`,
          );
          assert.match(
            issue.sortie,
            refusNommeVault(),
            `Et il doit nommer LA référence qui reste, celle que le correctif n’a pas ` +
              `touchée :\n${issue.sortie}`,
          );
          // La page, elle, ne doit plus être nommée : son URL est versionnée.
          // Absence appariée — l'essai qui la fait parler est nommé ci-dessous —
          // et jugée seulement APRÈS la preuve que le garde-fou a conclu.
          exigerSilenceApres(
            issue.sortie,
            /index\.html:\d+:/,
            /constat Q-43/,
            'LE REFUS : un PNG en cache long arrête l’installation, et nomme le fichier fautif',
          );
        },
      );
    } finally {
      writeFileSync(page, avant);
    }
  });
});

/* =====================================================================
 *  §6 — Ce que le frontal efface VRAIMENT (constat Q-39)
 * ---------------------------------------------------------------------
 *  Le vhost efface six en-têtes de provenance ou d'identité, et `install.sh`
 *  vérifie que la liste couvre tout ce que le service lit
 *  (`install-blocs.test.mjs` §4). Ces deux contrôles comparent des NOMS ; ils ne
 *  disent pas ce qu'Apache fait de la requête.
 *
 *  Il faut le mesurer, parce que la mesure surprend : **`RequestHeader unset`
 *  prend un nom LITTÉRAL**, et un motif générique est accepté par
 *  `apachectl configtest` — « Syntax OK » — sans rien effacer du tout. Une
 *  protection au frontal peut donc être silencieusement vide, et l'outil qui
 *  vérifie la configuration la bénit. Rien, dans un fichier, ne distingue ce
 *  cas-là d'une neutralisation réelle : seule une requête le distingue.
 * ===================================================================== */

describe('Le frontal efface vraiment ce qu’il annonce effacer (constat Q-39)', () => {
  /** Les six lignes littérales, remplacées par un motif qui n'efface rien. */
  const MOTIF_GENERIQUE = [
    ['    RequestHeader unset X-Forwarded-For\n' +
      '    RequestHeader unset X-Forwarded-Host\n' +
      '    RequestHeader unset X-Forwarded-Server\n' +
      '    RequestHeader unset X-Real-IP\n' +
      '    RequestHeader unset Forwarded\n',
      '    RequestHeader unset X-*\n', 1],
    ['    RequestHeader unset X-Request-Id\n', '', 1],
  ];

  /** Ce que la doublure d'API a reçu, pour une requête portant `entetes`. */
  async function recuParLeService(entetes) {
    const reponse = await demander('/api/sonde-entetes', { entetes });
    assert.equal(reponse.statut, 200, `Le mandataire doit joindre le service : ${reponse.corps.slice(0, 200)}`);
    const corps = JSON.parse(reponse.corps);
    assert.equal(corps.doublure, true, 'La réponse doit venir de derrière le mandataire.');
    return corps.entetes;
  }

  const FORGES = { 'x-request-id': 'REFERENCE-FORGEE', 'x-forwarded-for': '10.0.0.1' };

  test('LE VHOST DU DÉPÔT : l’en-tête forgé n’atteint pas le service', async () => {
    const recus = await recuParLeService(FORGES);

    assert.equal(
      recus['x-request-id'],
      undefined,
      `« x-request-id » a traversé le frontal : le client choisirait de nouveau la référence ` +
        `de son incident (constat Q-39). Reçu : ${JSON.stringify(recus['x-request-id'])}`,
    );
    // X-Forwarded-For est EFFACÉ puis REPOSÉ par mod_proxy : ce qui arrive est
    // l'adresse du pair réel, jamais celle que le client a écrite. L'ordre
    // compte — mod_proxy ajoute à la FIN de ce qu'il trouve, si bien qu'un
    // effacement manquant laisserait l'adresse forgée EN TÊTE.
    assert.equal(
      String(recus['x-forwarded-for'] ?? '').includes('10.0.0.1'),
      false,
      `L’adresse forgée est arrivée au service : « ${String(recus['x-forwarded-for'])} ». ` +
        'C’est elle qui serait journalisée comme celle du client (PLAN_SERVEUR §1.7).',
    );
    assert.equal(recus['x-forwarded-for'], '127.0.0.1', 'Et ce qui arrive est l’adresse du pair réel.');
    // Contrôle symétrique : le frontal n'efface pas TOUT — sans quoi cet essai
    // serait satisfait par un mandataire qui ne transmet rien.
    assert.equal(recus['x-forwarded-proto'], 'https', 'Ce que le vhost REPOSE doit arriver.');
    assert.ok(String(recus.host ?? '').length > 0, 'Et l’en-tête Host traverse, évidemment.');
  });

  test('UN MOTIF GÉNÉRIQUE passe « configtest » ET N’EFFACE RIEN', async () => {
    // ── La mesure qui donne son prix au contrôle statique d'install.sh ──────
    //
    // Les deux moitiés sont indissociables : la configuration est déclarée
    // VALIDE, et elle ne protège plus. C'est le pire des trois cas — pire
    // qu'une ligne manquante, qu'on voit, et pire qu'une erreur de syntaxe,
    // qui empêche le démarrage.
    await avecVhost(
      MOTIF_GENERIQUE,
      async () => (await recuParLeService(FORGES))['x-request-id'] !== undefined,
      async () => (await recuParLeService(FORGES))['x-request-id'] === undefined,
      async () => {
        // 1. Apache dit que tout va bien.
        const controle = execFileSync('apache2', ['-f', join(racine, 'httpd.conf'), '-t'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        assert.match(
          `${controle} `,
          /Syntax OK|^\s*$/m,
          `« configtest » doit ACCEPTER le motif : c’est ce qui rend le défaut invisible. ` +
            `Sortie : ${controle}`,
        );

        // 2. …et il n'efface rien.
        const recus = await recuParLeService(FORGES);
        assert.equal(
          recus['x-request-id'],
          'REFERENCE-FORGEE',
          'Le motif devrait laisser passer l’en-tête : si cet essai échoue ici, c’est ' +
            'qu’`unset` a appris à lire un motif, et le contrôle statique d’install.sh peut ' +
            'être reconsidéré.',
        );
        assert.match(
          String(recus['x-forwarded-for'] ?? ''),
          /^10\.0\.0\.1/,
          `Et l’adresse FORGÉE arrive en tête de X-Forwarded-For : « ${String(recus['x-forwarded-for'])} ». ` +
            'C’est le défaut même que ce bloc du vhost existe pour empêcher, et ' +
            '« Syntax OK » l’a béni.',
        );
      },
    );
  });
});

/* =====================================================================
 *  §7 — La borne de corps du chemin mandaté (constat Q-44)
 * ---------------------------------------------------------------------
 *  `LimitRequestBody` est appliquée par le **filtre d'entrée HTTP**. Sur un
 *  chemin mandaté, `mod_proxy_http` prend la main et relaie le corps sans que
 *  ce filtre ne l'ait compté : 28 311 552 octets traversaient `/api/` alors que
 *  la borne est 27 262 976, pendant que le MÊME envoi sur `/index.html` rendait
 *  413. Le vhost et `install.sh` affirmaient l'inverse, et `install.sh`
 *  imprimait « ok » en comparant deux nombres dont l'un n'agissait pas.
 *
 *  ── Pourquoi ces essais-ci et pas une comparaison ────────────────────────
 *
 *  Parce que c'est exactement le défaut : deux nombres égaux ne disent rien de
 *  ce qui traverse. On ENVOIE, et l'on regarde ce que la doublure a reçu.
 * ===================================================================== */

/**
 * Joue le bloc « corps » de `install.sh` contre CETTE instance.
 *
 * Quatre substitutions, déclarées et comptées : où est le vhost, et sur quel
 * port écoute le frontal. **Aucune ne touche ce qui décide** — ni le volume
 * envoyé, ni la lecture du seuil dans la règle, ni les trois verdicts.
 */
function jouerBorneDeCorps() {
  // ⚠️ La variante NON BLOQUANTE, et ce n'est pas un détail de style : ce bloc
  // envoie sur `/api/`, qu'Apache relaie vers la doublure vivant dans CE
  // processus. Joué par `execFileSync`, le processus est figé, la doublure ne
  // répond pas, Apache attend, et curl coupe à 60 s — deux sondes, 120 s, et un
  // verdict qui ne dit rien du produit. Mesuré.
  return jouerBlocAttendu(
    'corps',
    {},
    racine,
    [
      ['/etc/apache2/sites-enabled/cyber-grc.conf', join(racine, 'vhost.conf'), 1],
      ['/etc/apache2/sites-available/cyber-grc.conf', join(racine, 'vhost.conf'), 2],
      [':443:127.0.0.1"', `:${String(portTls)}:127.0.0.1"`, 1],
      ['"https://$NOM_VHOST/api/reprise"', `"https://$NOM_VHOST:${String(portTls)}/api/reprise"`, 1],
    ],
  );
}

describe('Un corps hors borne ne traverse pas le mandataire (constat Q-44)', () => {
  /**
   * Le seuil, lu dans **la règle qui refuse** — jamais dans un commentaire ni
   * dans une constante recopiée ici. C'est la leçon du constat lui-même : la
   * valeur qui décide est celle qui agit.
   */
  function seuilDuPrefiltre() {
    const source = readFileSync(VHOST_SOURCE, 'utf8');
    const trouve = /^\s*RewriteCond\s+%1\s+"?-gt\s*(\d+)/m.exec(source);
    assert.notEqual(
      trouve,
      null,
      'Le vhost ne porte plus de règle de refus sur la longueur annoncée : le chemin mandaté ' +
        'n’est plus borné du tout (constat Q-44), et cet essai ne saurait même pas quoi ' +
        'envoyer.',
    );
    return Number(trouve[1]);
  }

  /** Envoie un corps de `octets` sur `/api/…` et rend le statut du frontal. */
  function envoyerCorps(chemin, octets, options = {}) {
    return new Promise((resoudre, rejeter) => {
      const morceau = Buffer.alloc(65536, 0x61);
      const entetes = { 'content-type': 'application/json', host: `${HOTE}:${String(portTls)}`, connection: 'close' };
      // `chunked` = pas de `content-length` annoncé : c'est le contournement
      // que le pré-filtre ne voit pas, et l'objet du troisième essai.
      if (options.chunked === true) entetes['transfer-encoding'] = 'chunked';
      else entetes['content-length'] = String(octets);

      const requete = https.request(
        { host: ADRESSE, port: portTls, path: chemin, method: 'POST', agent: false, ca: certificat, servername: HOTE, headers: entetes },
        (reponse) => {
          reponse.resume();
          reponse.on('end', () => resoudre({ statut: reponse.statusCode }));
        },
      );
      // Apache coupe le lien dès qu'il refuse : l'écriture en cours échoue, et
      // c'est NORMAL. On le note plutôt que d'en mourir — mais on ne résout que
      // si aucune réponse n'est venue, sinon on perdrait le statut réel.
      let statutRecu = false;
      requete.on('response', () => {
        statutRecu = true;
      });
      requete.on('error', (erreur) => {
        if (statutRecu) return;
        rejeter(erreur);
      });

      let ecrits = 0;
      const pousser = () => {
        while (ecrits < octets) {
          const taille = Math.min(morceau.length, octets - ecrits);
          ecrits += taille;
          if (!requete.write(taille === morceau.length ? morceau : morceau.subarray(0, taille))) {
            requete.once('drain', pousser);
            return;
          }
        }
        requete.end();
      };
      pousser();
    }).catch((erreur) => ({ statut: 0, erreur: erreur.message }));
  }

  test('LE REFUS : un corps hors borne reçoit 413, et la doublure ne reçoit RIEN', async () => {
    const seuil = seuilDuPrefiltre();
    const rang = vuesDeLaDoublure.rang();
    const issue = await envoyerCorps('/api/essai-corps-hors', seuil + 1048576);

    assert.equal(
      issue.statut,
      413,
      `Un corps de ${String(seuil + 1048576)} octets a traversé le frontal alors que le ` +
        `pré-filtre annonce ${String(seuil)} : c’est le constat Q-44, et « LimitRequestBody » ` +
        `n’y peut rien — elle n’est pas appliquée sur un chemin mandaté. Reçu : ` +
        `${JSON.stringify(issue)}`,
    );
    const vues = vuesDeLaDoublure.depuis(rang).filter((v) => v.chemin === '/api/essai-corps-hors');
    assert.deepEqual(
      vues.map((v) => `${v.chemin} : ${String(v.octets)} o`),
      [],
      'Le refus doit intervenir AVANT le mandataire : la doublure a vu passer la requête, ' +
        'donc le processus Node l’aurait vue aussi — sans authentification devant lui.',
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : un corps minuscule passe, et la doublure le reçoit ENTIER', async () => {
    // ── Sans cette moitié, un frontal qui refuse TOUT passerait l'essai
    //    précédent, et l'application serait injoignable en écriture.
    const rang = vuesDeLaDoublure.rang();
    const issue = await envoyerCorps('/api/essai-corps-sous', 4096);

    assert.notEqual(
      issue.statut,
      413,
      `Le frontal refuse aussi un corps de 4 096 octets : la règle ne borne pas, elle bloque ` +
        `tout. Reçu : ${JSON.stringify(issue)}`,
    );
    assert.equal(issue.statut, 200, `Et il doit être servi par le service : ${JSON.stringify(issue)}`);

    const vues = vuesDeLaDoublure.depuis(rang).filter((v) => v.chemin === '/api/essai-corps-sous');
    assert.equal(vues.length, 1, 'La doublure doit avoir vu exactement cette requête.');
    assert.equal(
      vues[0].octets,
      4096,
      `La doublure a compté ${String(vues[0].octets)} octets sur 4 096. Un instrument qui ne ` +
        'compte pas le corps rendrait « la doublure ne reçoit rien » vrai de tout, y compris ' +
        'du cas que l’essai précédent doit voir.',
    );
    assert.equal(vues[0].complet, true, 'Et la requête doit lui être parvenue complète.');
  });

  test('LE RÉGRESSEUR DU VICE : sans la règle de refus, l’installation s’arrête', async () => {
    // ── L'essai qui distingue un contrôle COMPORTEMENTAL d'une comparaison ──
    //
    // L'ancien contrôle d'`install.sh` comparait `LimitRequestBody` à
    // `SERVEUR_TAILLE_MAX_CORPS` et imprimait « ok » quand les deux
    // coïncidaient. Sur cette mutation exacte — la règle de refus retirée, la
    // directive laissée en place — il restait VERT, parce que les deux nombres
    // qu'il comparait n'avaient pas bougé et que l'un des deux n'agit pas.
    await avecVhost(
      [[/* la règle qui refuse, retirée */ '    RewriteCond %{HTTP:Content-Length} ^([0-9]+)$\n', '', 1]],
      async () => (await envoyerCorps('/api/preuve-mutation', seuilDuPrefiltre() + 1048576)).statut !== 413,
      async () => (await envoyerCorps('/api/preuve-retour', seuilDuPrefiltre() + 1048576)).statut === 413,
      async () => {
        const issue = await jouerBorneDeCorps();

        assert.notEqual(
          issue.code,
          0,
          `Le frontal laisse passer un corps hors borne et l’installation a continué : c’est ` +
            `un contrôle qui compare deux nombres au lieu d’éprouver ce qui traverse ` +
            `(constat Q-44).\n${issue.sortie}`,
        );
        assert.match(issue.sortie, /constat\s+Q-44/, 'Le refus doit renvoyer au constat qui l’explique.');
        assert.match(
          issue.sortie,
          /par \/api\/ -> \d+ \(413 attendu\)/,
          `Et dire ce qu’il a mesuré, pas seulement qu’il refuse :\n${issue.sortie}`,
        );
      },
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : le vhost du dépôt passe la borne de corps', async () => {
    const issue = await jouerBorneDeCorps();
    assert.equal(issue.code, 0, `Le vhost livré doit passer :\n${issue.sortie}\n${journalApache()}`);
    assert.match(
      issue.sortie,
      /ok borne de corps éprouvée/,
      `Le contrôle doit être ALLÉ jusqu’à sa conclusion — un silence ne prouve rien ` +
        `(constat Q-37) :\n${issue.sortie}`,
    );
  });

  test('LA LIMITE ASSUMÉE : 28 Mio en « chunked » traversent, et c’est CONNU (constat Q-51)', async () => {
    // ── Cet essai fige une LIMITE, pas une propriété ────────────────────────
    //
    // Le pré-filtre refuse sur la longueur ANNONCÉE. Un client qui n'en annonce
    // aucune — `Transfer-Encoding: chunked` — n'est pas borné par lui. Ce n'est
    // pas un oubli : c'est écrit dans le vhost, mesuré, et la borne qui tient
    // pour l'API est celle de Fastify, en aval.
    //
    // ⚠️ SI CET ESSAI DEVIENT ROUGE, NE LE SUPPRIMEZ PAS : c'est que quelqu'un
    // a FERMÉ le contournement, et c'est une bonne nouvelle. Il faut alors le
    // réécrire dans l'autre sens (« chunked est borné aussi »), mettre à jour
    // le commentaire du vhost qui dit le contraire, et fermer le constat Q-51
    // au registre. Un essai qui rougit parce que le produit s'est amélioré doit
    // le dire lui-même, sinon le prochain lecteur le « répare » en l'effaçant.
    const seuil = seuilDuPrefiltre();
    const volume = seuil + 1048576;
    const rang = vuesDeLaDoublure.rang();
    const issue = await envoyerCorps('/api/essai-chunked', volume, { chunked: true });

    assert.equal(
      issue.statut,
      200,
      `Un corps de ${String(volume)} octets en « chunked » a été refusé (${String(issue.statut)}). ` +
        'Si c’est délibéré, le contournement du constat Q-51 vient d’être fermé : réécrivez ' +
        'CET essai dans l’autre sens, corrigez le commentaire du vhost qui affirme encore ' +
        'l’inverse, et fermez Q-51 au registre. Ne l’effacez pas.',
    );
    const vues = vuesDeLaDoublure.depuis(rang).filter((v) => v.chemin === '/api/essai-chunked');
    assert.equal(vues.length, 1, 'La doublure doit avoir vu la requête.');
    assert.equal(
      vues[0].octets,
      volume,
      `La doublure a reçu ${String(vues[0].octets)} octets sur ${String(volume)} : le corps ` +
        'traverse ENTIER, et c’est ce que Q-51 consigne. La borne qui tient pour l’API est ' +
        'celle de Fastify, en aval du frontal.',
    );
  });
});
