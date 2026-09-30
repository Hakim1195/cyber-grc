/**
 * appliance.test.mjs — sceller une VM, puis la démarrer une première fois.
 *
 * Deux scripts, `deploy/appliance/sceller.sh` et `premier-demarrage.sh`, joués POUR
 * DE BON sur une racine temporaire (`--racine`). Ce que ce fichier tient :
 *
 *  · le scellement ne laisse AUCUNE valeur secrète sur le disque — et son balayage
 *    MORD : une valeur cachée dans un fichier qu'il ne connaît pas fait échouer ;
 *  · le premier démarrage rend la machine unique, calcule l'empreinte du compte de
 *    secours PAR LE CODE DU PRODUIT, relance install.sh avec les bonnes options —
 *    et REFUSE de se rejouer.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCELLER = join(BACKEND, 'deploy', 'appliance', 'sceller.sh');
const PREMIER = join(BACKEND, 'deploy', 'appliance', 'premier-demarrage.sh');
const SECOURS_JS = join(BACKEND, 'dist', 'auth', 'secours.js');

const SECRETS = {
  SESSION_SECRET: 'SESSION-SECRET-0123456789abcdef0123456789',
  BASE_MOT_DE_PASSE: 'MDP-APP-fedcba9876543210fedcba98',
  BASE_MOT_DE_PASSE_PROPRIETAIRE: 'MDP-PROPRIO-00112233445566778899',
  BASE_MOT_DE_PASSE_LECTURE: 'MDP-LECTURE-aabbccddeeff00112233',
  AUTH_COMPTE_SECOURS_EMPREINTE: 'scrypt$16384$8$1$sel$EMPREINTE-ANCIENNE-xyz',
  LDAP_MOT_DE_PASSE_SERVICE: 'Svc-Grc-Secret-2026!!',
};
const dossiers = [];
after(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

function jouer(script, args) {
  try {
    return { code: 0, sortie: execFileSync('bash', [script, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) { return { code: e.status ?? 1, sortie: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
}

/** Une VM installée, en miniature : configuration, traces, identité, et un clone. */
function vmFactice(options = {}) {
  const R = mkdtempSync(join(tmpdir(), 'appliance-')); dossiers.push(R);
  const mk = (p) => mkdirSync(join(R, p), { recursive: true });
  mk('etc/cyber-grc'); mk('etc/ssh'); mk('home/grc/.claude'); mk('home/grc/.ssh'); mk('root/.ssh');
  mk('var/lib/cyber-grc'); mk('opt/cyber-grc/backend'); mk('usr/local');
  writeFileSync(join(R, 'etc/cyber-grc/env'),
    `NODE_ENV=production\nSERVEUR_URL_PUBLIQUE=https://grc-test.site\nAUTH_COMPTE_SECOURS_IDENTIFIANT=secours.grc\n` +
    Object.entries(SECRETS).map(([k, v]) => `${k}=${v}`).join('\n') + '\nSMTP_ACTIF=non\n');
  writeFileSync(join(R, 'etc/ssh/ssh_host_ed25519_key'), 'CLE-HOTE');
  writeFileSync(join(R, 'etc/machine-id'), 'abcdef0123456789abcdef0123456789\n');
  writeFileSync(join(R, 'home/grc/.bash_history'), `psql -c "alter role x password '${SECRETS.BASE_MOT_DE_PASSE}'"\n`);
  writeFileSync(join(R, 'home/grc/.claude/session.jsonl'), 'transcript');
  writeFileSync(join(R, 'home/grc/.ssh/authorized_keys'), 'ssh-ed25519 AAAA auteur');
  writeFileSync(join(R, 'root/.ssh/authorized_keys'), 'ssh-ed25519 BBBB auteur');
  if (options.secretCache) writeFileSync(join(R, 'etc/autre-outil.conf'), `mdp=${SECRETS.SESSION_SECRET}\n`);
  // Un clone minimal : ce que sceller.sh exige pour reconnaître un dépôt.
  const clone = join(R, 'home/grc/cyber-grc'); mkdirSync(join(clone, 'backend/deploy'), { recursive: true });
  writeFileSync(join(clone, 'backend/deploy/install.sh'), `#!/usr/bin/env bash\necho "install factice $*" >> "${R}/install.appels"\n`);
  writeFileSync(join(clone, 'SECRETS.local.md'), `sudo ${SECRETS.BASE_MOT_DE_PASSE_PROPRIETAIRE}`);
  return { R, clone };
}

const lire = (R, p) => readFileSync(join(R, p), 'utf8');
const variable = (R, k) => (lire(R, 'etc/cyber-grc/env').match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [, undefined])[1];

function balayer(R) {   // les valeurs secrètes, cherchées dans TOUT l'arbre — indépendamment du script
  const restes = [];
  const marcher = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) marcher(p); else if (e.isFile()) { const t = readFileSync(p, 'utf8'); for (const v of Object.values(SECRETS)) if (t.includes(v)) restes.push(`${p.slice(R.length)} ← ${v.slice(0, 12)}…`); }
  } };
  marcher(R); return restes;
}

describe('sceller.sh — rien de secret, rien d’identifiant ne quitte la machine', () => {
  test('le scellement vide les secrets, retire l’identité et les traces, arme le premier démarrage', () => {
    const { R, clone } = vmFactice();
    const r = jouer(SCELLER, ['--racine', R, '--source', clone, '--compte', 'grc']);
    assert.equal(r.code, 0, r.sortie);
    for (const k of Object.keys(SECRETS)) assert.equal(variable(R, k), '', `${k} doit être vidée`);
    assert.equal(variable(R, 'AUTH_COMPTE_SECOURS_IDENTIFIANT'), 'secours.grc', 'l’identifiant n’est pas un secret : conservé');
    assert.ok(!existsSync(join(R, 'etc/ssh/ssh_host_ed25519_key')), 'clé d’hôte retirée');
    assert.equal(lire(R, 'etc/machine-id'), '', 'machine-id vidé');
    for (const p of ['home/grc/.bash_history', 'home/grc/.claude', 'home/grc/.ssh/authorized_keys', 'root/.ssh/authorized_keys', 'usr/local/src/cyber-grc/SECRETS.local.md'])
      assert.ok(!existsSync(join(R, p)), `${p} doit avoir disparu`);
    assert.ok(existsSync(join(R, 'usr/local/src/cyber-grc/backend/deploy/install.sh')), 'le dépôt est embarqué à un chemin système');
    assert.ok(existsSync(join(R, 'usr/local/sbin/cyber-grc-premier-demarrage')));
    const lien = join(R, 'etc/systemd/system/multi-user.target.wants/cyber-grc-premier-demarrage.service');
    assert.ok(lstatSync(lien).isSymbolicLink(), 'unité armée (lien dans multi-user.target.wants)');
    assert.equal(readlinkSync(lien), '../cyber-grc-premier-demarrage.service', 'lien RELATIF : juste sous un préfixe comme en vrai');
    assert.match(lire(R, 'etc/cyber-grc/appliance.conf'), /^COMPTE_LOCAL=grc$/m);
    assert.match(lire(R, 'etc/cyber-grc/SCELLE'), /^scelle_le=\d{4}-/m);
    assert.deepEqual(balayer(R), [], 'aucune valeur secrète ne survit, où que ce soit');
  });

  test('🛑 LE BALAYAGE MORD : un secret caché dans un fichier que le script ne connaît pas fait ÉCHOUER le scellement', () => {
    const { R, clone } = vmFactice({ secretCache: true });
    const r = jouer(SCELLER, ['--racine', R, '--source', clone]);
    assert.notEqual(r.code, 0, 'le scellement devait être refusé');
    assert.match(r.sortie, /etc\/autre-outil\.conf/, 'le fichier fautif est nommé');
    assert.match(r.sortie, /REFUSÉ/);
  });

  test('un chemin qui n’est pas un clone du dépôt est refusé', () => {
    const { R } = vmFactice();
    const r = jouer(SCELLER, ['--racine', R, '--source', join(R, 'opt')]);
    assert.notEqual(r.code, 0); assert.match(r.sortie, /n'est pas un clone/);
  });
});

describe('premier-demarrage.sh — unique, par le code du produit, et une seule fois', () => {
  function scelle() {
    const { R, clone } = vmFactice();
    assert.equal(jouer(SCELLER, ['--racine', R, '--source', clone]).code, 0);
    const stub = join(R, 'usr/local/src/cyber-grc/backend/deploy/install.sh');
    return { R, stub };
  }
  const args = (R, stub) => ['--racine', R, '--install', stub, '--secours-js', SECOURS_JS, '--sans-systemd'];

  test('il rend la machine unique, pose l’URL, calcule une empreinte scrypt, relance install.sh avec --maj --reinitialiser-mots-de-passe', () => {
    const { R, stub } = scelle();
    writeFileSync(join(R, 'etc/cyber-grc/premier-demarrage.conf'), 'NOM_HOTE=grc-client\nURL_PUBLIQUE=https://grc.client.interne\n');
    const r = jouer(PREMIER, args(R, stub).concat());
    assert.equal(r.code, 0, r.sortie);
    assert.match(lire(R, 'etc/machine-id'), /^[0-9a-f]{32}\n$/, 'machine-id neuf');
    assert.ok(readdirSync(join(R, 'etc/ssh')).some((f) => f.startsWith('ssh_host_')), 'clés d’hôte régénérées');
    assert.equal(variable(R, 'SERVEUR_URL_PUBLIQUE'), 'https://grc.client.interne');
    assert.match(variable(R, 'AUTH_COMPTE_SECOURS_EMPREINTE'), /^scrypt\$/, 'empreinte calculée par dist/auth/secours.js');
    const appels = lire(R, 'install.appels');
    assert.match(appels, /--maj --reinitialiser-mots-de-passe/, 'install.sh relancé avec les bonnes options');
    const fiche = join(R, 'root/cyber-grc-premier-demarrage.txt');
    assert.ok(existsSync(fiche)); assert.equal(statSync(fiche).mode & 0o777, 0o600, 'fiche du compte de secours en 0600');
    assert.match(lire(R, 'root/cyber-grc-premier-demarrage.txt'), /Mot de passe\s+: \S{16,}/);
    assert.ok(existsSync(join(R, 'var/lib/cyber-grc/premier-demarrage.fait')), 'marque posée');
  });

  test('🛑 il REFUSE de se rejouer : deuxième passage, code 3, install.sh NON rappelé, empreinte inchangée', () => {
    const { R, stub } = scelle();
    assert.equal(jouer(PREMIER, args(R, stub)).code, 0);
    const empreinte = variable(R, 'AUTH_COMPTE_SECOURS_EMPREINTE');
    const appels = lire(R, 'install.appels');
    const r = jouer(PREMIER, args(R, stub));
    assert.equal(r.code, 3, r.sortie);
    assert.equal(lire(R, 'install.appels'), appels, 'aucun nouvel appel à install.sh');
    assert.equal(variable(R, 'AUTH_COMPTE_SECOURS_EMPREINTE'), empreinte, 'les secrets ne sont pas retirés');
  });

  test('une URL publique invalide arrête le premier démarrage AVANT toute régénération', () => {
    const { R, stub } = scelle();
    writeFileSync(join(R, 'etc/cyber-grc/premier-demarrage.conf'), 'URL_PUBLIQUE=http://pas-de-tls\n');
    const r = jouer(PREMIER, args(R, stub));
    assert.notEqual(r.code, 0); assert.match(r.sortie, /URL_PUBLIQUE invalide/);
    assert.ok(!existsSync(join(R, 'install.appels')), 'install.sh n’a pas été appelé');
    assert.ok(!existsSync(join(R, 'var/lib/cyber-grc/premier-demarrage.fait')), 'pas de marque : il pourra être rejoué une fois corrigé');
  });

  test('l’unité livrée porte la seconde barrière contre le rejeu et se joue avant le service', () => {
    const u = readFileSync(join(BACKEND, 'deploy/appliance/cyber-grc-premier-demarrage.service'), 'utf8');
    assert.match(u, /^ConditionPathExists=!\/var\/lib\/cyber-grc\/premier-demarrage\.fait$/m);
    assert.match(u, /^Type=oneshot$/m); assert.match(u, /^Before=cyber-grc\.service$/m);
    assert.match(u, /^ExecStart=\/usr\/local\/sbin\/cyber-grc-premier-demarrage$/m);
  });
});
