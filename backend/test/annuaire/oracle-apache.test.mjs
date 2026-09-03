/**
 * oracle-apache.test.mjs — l'annuaire simulé, interrogé par un client QUI N'EST PAS DE MOI.
 *
 * ── Le défaut que ce fichier existe pour éviter ──────────────────────────────
 *
 * Le `CONVENTIONS.md` §25 confie l'annuaire à A4 et le client à A1, et dit pourquoi :
 * *« un agent qui écrit sa doublure ET le code qui l'interroge peut se tromper deux
 * fois de la même façon, et le banc reste vert »* — c'est le défaut mesuré en
 * **Q-61**. Or `client-ldap.mjs` est écrit de la même main que `serveur-ldap.mjs` :
 * à l'intérieur de `test/annuaire/`, le garde-fou du §25 ne s'applique pas.
 *
 * Il fallait donc un **tiers**. Cette machine en porte un : le `mod_authnz_ldap`
 * d'Apache, écrit par la fondation Apache sur le SDK LDAP d'OpenLDAP, qui ne partage
 * aucune ligne avec ce dépôt. Il se lie au compte de service, cherche par filtre,
 * lie l'utilisateur, et **résout les groupes imbriqués** — soit D1, D2 et D3.
 *
 * ── Et il a servi le jour même où il a été écrit ────────────────────────────
 *
 * Premier lancement : `dpo` refusé en 403, et le journal de l'annuaire montrant
 * `{"operation":"erreur","message":"Opération non gérée : 0x6e"}`. `0x6e` est
 * `compareRequest` — **la façon dont un client vérifie une appartenance sans faire
 * de recherche**, et l'annuaire ne la servait pas. Mon propre client ne s'en sert
 * pas : à lui seul, il serait resté vert sur une doublure incomplète.
 *
 * C'est exactement le défaut que le §25 anticipe, reproduit à l'échelle d'un
 * répertoire — et la démonstration que la séparation A1/A4 n'est pas une précaution
 * de style.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { attendrePort, exigerOutil, portLibre } from '../aide/outils.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE, dnGroupe } from './comptes.mjs';
import { demarrerAnnuaire } from './serveur-ldap.mjs';

let annuaire;
let apache;
let racine;
let portWeb;

const journalApache = () =>
  ['erreurs.log', 'sortie']
    .map((nom) => (existsSync(join(racine, nom)) ? `--- ${nom}\n${readFileSync(join(racine, nom), 'utf8').slice(-3000)}` : ''))
    .join('\n');

/** Un `GET /` authentifié en Basic, contre l'emplacement demandé. */
async function frapper(chemin, login, motDePasse) {
  const reponse = await fetch(`http://127.0.0.1:${String(portWeb)}${chemin}`, {
    headers: { authorization: `Basic ${Buffer.from(`${login}:${motDePasse}`).toString('base64')}` },
    redirect: 'manual',
  });
  await reponse.arrayBuffer();
  return reponse.status;
}

before(async () => {
  exigerOutil('apache2', ['-v'],
    'C’est le seul client LDAP TIERS de cette machine : sans lui, l’annuaire simulé n’est ' +
    'éprouvé que par un client écrit de la même main, ce que le CONVENTIONS.md §25 refuse.');
  assert.ok(
    existsSync('/usr/lib/apache2/modules/mod_authnz_ldap.so') && existsSync('/usr/lib/apache2/modules/mod_ldap.so'),
    'mod_ldap et mod_authnz_ldap sont requis : ce sont eux qui parlent LDAP.',
  );

  annuaire = await demarrerAnnuaire();
  portWeb = await portLibre();
  racine = mkdtempSync(join(tmpdir(), 'grc-oracle-ldap-'));
  chmodSync(racine, 0o755); // Apache tourne sous www-data : il doit traverser.
  for (const sous of ['web', 'logs', 'run']) mkdirSync(join(racine, sous), { recursive: true });
  chmodSync(join(racine, 'web'), 0o755);
  chmodSync(join(racine, 'logs'), 0o777);
  chmodSync(join(racine, 'run'), 0o777);
  writeFileSync(join(racine, 'web', 'index.html'), '<!doctype html><title>ok</title>');
  chmodSync(join(racine, 'web', 'index.html'), 0o644);

  /**
   * La configuration est minimale À DESSEIN : elle n'éprouve pas le vhost du
   * produit (c'est l'office de `test/deploiement/`), elle éprouve **l'annuaire**.
   * Les trois `LDAP*Cache*` à zéro ne sont pas décoratifs : sans eux, la
   * désactivation d'un compte en cours d'essai resterait invisible, Apache
   * répondant depuis son cache — et l'essai D4 serait vert pour rien.
   */
  const url = (filtre) => `ldap://127.0.0.1:${String(annuaire.port)}/${BASE_RECHERCHE}?sAMAccountName?sub?${filtre}`;
  const bloc = (repertoire, groupe) => [
    `<Directory ${repertoire}>`,
    '    Options None',
    '    AllowOverride None',
    '    AuthType Basic',
    '    AuthName "annuaire simule"',
    '    AuthBasicProvider ldap',
    `    AuthLDAPURL "${url('(objectClass=user)')}"`,
    `    AuthLDAPBindDN "${COMPTE_SERVICE.dn}"`,
    `    AuthLDAPBindPassword "${COMPTE_SERVICE.motDePasse}"`,
    '    AuthLDAPMaxSubGroupDepth 5',
    '    AuthLDAPSubGroupAttribute member',
    '    AuthLDAPSubGroupClass group',
    `    Require ldap-group ${groupe}`,
    '</Directory>',
  ].join('\n');

  mkdirSync(join(racine, 'web', 'dpo'), { recursive: true });
  mkdirSync(join(racine, 'web', 'rssi'), { recursive: true });
  for (const sous of ['dpo', 'rssi']) {
    chmodSync(join(racine, 'web', sous), 0o755);
    writeFileSync(join(racine, 'web', sous, 'index.html'), '<!doctype html><title>ok</title>');
    chmodSync(join(racine, 'web', sous, 'index.html'), 0o644);
  }

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
    'User www-data',
    'Group www-data',
    'ServerName oracle-annuaire.local',
    `ErrorLog ${join(racine, 'erreurs.log')}`,
    'LogLevel warn',
    'Include /etc/apache2/mods-enabled/*.load',
    'Include /etc/apache2/mods-enabled/*.conf',
    'LoadModule ldap_module /usr/lib/apache2/modules/mod_ldap.so',
    'LoadModule authnz_ldap_module /usr/lib/apache2/modules/mod_authnz_ldap.so',
    `Listen ${String(portWeb)}`,
    'LDAPSharedCacheSize 0',
    'LDAPCacheEntries 0',
    'LDAPOpCacheEntries 0',
    '<Directory />',
    '    AllowOverride None',
    '    Require all denied',
    '</Directory>',
    `DocumentRoot ${join(racine, 'web')}`,
    bloc(join(racine, 'web', 'dpo'), dnGroupe('GRC-TLS-DPO')),
    bloc(join(racine, 'web', 'rssi'), dnGroupe('GRC-TLS-RSSI')),
    '',
  ].join('\n'));

  apache = spawn('apache2', ['-d', '/etc/apache2', '-f', join(racine, 'httpd.conf'), '-DFOREGROUND'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const sortie = [];
  apache.stdout.on('data', (m) => sortie.push(String(m)));
  apache.stderr.on('data', (m) => sortie.push(String(m)));
  apache.on('exit', () => writeFileSync(join(racine, 'sortie'), sortie.join('')));
  await attendrePort(portWeb, 'L’Apache de l’oracle LDAP', 20000, () => sortie.join('') + journalApache());
});

after(async () => {
  apache?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  apache?.kill('SIGKILL');
  await annuaire?.fermer();
  if (racine !== undefined) rmSync(racine, { recursive: true, force: true });
});

describe('Un client LDAP TIERS parle à l’annuaire simulé (§25, garde-fou de Q-61)', () => {
  test('D3 PAR UN TIERS : l’appartenance INDIRECTE ouvre l’accès', async () => {
    // `dpo` n'est membre direct que de `GRC-IMBRIQUE-DPO`. C'est Apache — et non un
    // code de ce dépôt — qui descend l'imbrication jusqu'à `GRC-TLS-DPO`.
    assert.equal(await frapper('/dpo/', 'dpo', 'dpo!2026'), 200, journalApache());
  });

  test('DANS L’AUTRE SENS : des identifiants VALIDES sans le bon groupe sont refusés', async () => {
    // Sans cette moitié, « 200 pour dpo » serait vrai d'une configuration qui
    // autorise quiconque sait un mot de passe (§20.2).
    assert.equal(await frapper('/dpo/', 'rssi.tls', 'rssi.tls!2026'), 401, journalApache());
    assert.equal(await frapper('/dpo/', 'sans.groupe', 'sans.groupe!2026'), 401, journalApache());
    // …et la symétrique : sur l'emplacement de l'autre groupe, les rôles s'inversent.
    assert.equal(await frapper('/rssi/', 'rssi.tls', 'rssi.tls!2026'), 200, journalApache());
    assert.equal(await frapper('/rssi/', 'dpo', 'dpo!2026'), 401, journalApache());
  });

  test('D2 PAR UN TIERS : un mot de passe faux ne passe pas', async () => {
    assert.equal(await frapper('/dpo/', 'dpo', 'ce-n-est-pas-le-bon'), 401, journalApache());
  });

  test('D4 PAR UN TIERS : la désactivation coupe l’accès À CHAUD, et la réactivation le rend', async () => {
    assert.equal(await frapper('/dpo/', 'dpo', 'dpo!2026'), 200, journalApache());
    annuaire.desactiver('dpo');
    assert.equal(await frapper('/dpo/', 'dpo', 'dpo!2026'), 401, `La désactivation doit être vue TOUT DE SUITE.\n${journalApache()}`);
    annuaire.reactiver('dpo');
    assert.equal(await frapper('/dpo/', 'dpo', 'dpo!2026'), 200, journalApache());
  });

  test('D4 PAR UN TIERS : le retrait du groupe coupe l’accès, et la remise le rend', async () => {
    annuaire.retirerDuGroupe('rssi.tls', 'GRC-TLS-RSSI');
    assert.equal(await frapper('/rssi/', 'rssi.tls', 'rssi.tls!2026'), 401, journalApache());
    annuaire.remettreDansGroupe('rssi.tls', 'GRC-TLS-RSSI');
    assert.equal(await frapper('/rssi/', 'rssi.tls', 'rssi.tls!2026'), 200, journalApache());
  });

  test('LE TIERS EMPRUNTE DES CHEMINS QUE MON PROPRE CLIENT N’EMPRUNTE PAS', async () => {
    // C'est l'argument entier de ce fichier, rendu mesurable : si le tiers
    // n'exerçait que ce que mon client exerce, il ne vaudrait pas son coût — et
    // le jour où il n'exercerait plus rien de neuf, cet essai le dirait.
    annuaire.viderJournal();
    await frapper('/dpo/', 'dpo', 'dpo!2026');
    const operations = new Set(annuaire.journal.map((l) => l.operation));
    assert.ok(
      operations.has('comparaison'),
      'Le tiers doit émettre au moins une `compare` : c’est l’opération que l’annuaire ne ' +
      'servait pas, et que mon client n’émet jamais. Vu : ' + [...operations].join(', '),
    );
    assert.ok(operations.has('liaison') && operations.has('recherche'), [...operations].join(', '));
    assert.deepEqual(
      annuaire.journal.filter((l) => l.operation === 'erreur'),
      [],
      'L’annuaire a refusé une opération du client tiers : c’est un trou de la doublure, ' +
      'pas un défaut du tiers.\n' + JSON.stringify(annuaire.journal, null, 1),
    );
  });
});
