/**
 * reanalyse-timer.test.mjs — le bloc « banc: reanalyse » d'`install.sh`, joué
 * pour de bon contre un VRAI systemd.
 *
 * ── Ce que ce fichier éprouve ─────────────────────────────────────────────
 *
 * Lot L6 (agent K4), contrôle n° 7 du `PLAN_SERVEUR` §1.6 : la ré-analyse
 * périodique des pièces jointes doit être PLANIFIÉE, et `install.sh` doit le
 * VÉRIFIER — pas se contenter de poser le fichier `.timer` et de l'annoncer
 * armé. Avant ce lot, rien ne le constatait : la même famille de défaut que
 * Q-63 (unité du service principal jamais passée à `systemd-analyze verify`)
 * et Q-75 (un contrôle non joué, indiscernable d'un contrôle conforme).
 *
 * ── Pourquoi `--user`, et ce que ça change (et ne change pas) ────────────────
 *
 * Le contrôle réel vise le SCOPE SYSTÈME : `install.sh` tourne en root et pose
 * `cyber-grc-reanalyse.timer` sous `/etc/systemd/system/`. Ce banc n'a pas ce
 * privilège (constat de l'agent K4 : `sudo` exige un mot de passe sur cette
 * machine). Il substitue donc `systemctl` par `systemctl --user` — une
 * substitution DÉCLARÉE et COMPTÉE, comme toute substitution de ce fichier
 * d'essai (voir `test/aide/install.mjs`) — et joue le VRAI bloc contre une
 * VRAIE unité **utilisateur**, créée et détruite par ce fichier. La question
 * posée à systemd est identique (« cette unité est-elle chargée, activée,
 * active ? ») ; seul le magasin d'unités interrogé change. **Ce n'est pas un
 * double** : c'est le même mécanisme, à un autre étage du même systemd réel.
 *
 * `systemd-analyze verify`, lui, n'a pas de notion de scope : la première
 * moitié du bloc continue de lire les VRAIS fichiers livrés
 * (`deploy/systemd/cyber-grc-reanalyse.{service,timer}`), sans substitution —
 * c'est elle qui aurait détecté un `ExecStart` cassé ou une directive refusée.
 *
 * ── Ce que ce fichier NE prouve PAS ──────────────────────────────────────
 *
 * Que `systemctl enable --now` fonctionne encore une fois root et le scope
 * système — ce que `install-blocs.test.mjs` (« banc: unite ») ne prouve pas
 * non plus pour le service principal, pour la même raison. Ce qui est prouvé
 * ici, et qui ne l'était pas avant ce lot : le bloc INTERROGE réellement
 * systemd (pas un fichier), et il distingue correctement armé / désarmé /
 * inconnu — les trois branches que `succes()` / `echec()` / `reserve()`
 * doivent emprunter.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { extraireBloc, jouerBloc } from '../aide/install.mjs';
import { RACINE_BACKEND } from '../aide/serveur.mjs';

/**
 * Nom délibérément distinct de l'unité de production (« -essai » ne peut se
 * confondre avec `cyber-grc-reanalyse.timer`) : une erreur de substitution ne
 * pourrait, au pire, qu'échouer bruyamment — jamais interroger une unité dont
 * ce fichier n'aurait pas la charge.
 */
const UNITE = 'cyber-grc-reanalyse-essai.timer';
const SERVICE = 'cyber-grc-reanalyse-essai.service';
const REPERTOIRE_UNITES = join(homedir(), '.config', 'systemd', 'user');

const temporaires = [];
function repertoireJetable() {
  const chemin = mkdtempSync(join(tmpdir(), 'grc-reanalyse-'));
  temporaires.push(chemin);
  return chemin;
}

/** `systemctl --user`, sortie capturée, jamais d'exception : le CONTENU décide. */
function systemctlUtilisateur(...args) {
  try {
    return { code: 0, sortie: execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (erreur) {
    return { code: erreur.status ?? 1, sortie: `${erreur.stdout ?? ''}${erreur.stderr ?? ''}` };
  }
}

/** Retire l'unité d'essai — best effort, silencieux : c'est un nettoyage, pas une assertion. */
function retirerUniteEssai() {
  systemctlUtilisateur('disable', '--now', UNITE);
  rmSync(join(REPERTOIRE_UNITES, SERVICE), { force: true });
  rmSync(join(REPERTOIRE_UNITES, UNITE), { force: true });
  systemctlUtilisateur('daemon-reload');
}

/** Pose l'unité d'essai (désarmée : ni enable, ni start) et recharge systemd. */
function poserUniteEssai() {
  mkdirSync(REPERTOIRE_UNITES, { recursive: true });
  writeFileSync(
    join(REPERTOIRE_UNITES, SERVICE),
    [
      '[Unit]',
      "Description=Essai K4 (reanalyse-timer.test.mjs) — n'a rien à faire hors de ce banc",
      '',
      '[Service]',
      'Type=oneshot',
      'ExecStart=/bin/true',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(REPERTOIRE_UNITES, UNITE),
    [
      '[Unit]',
      "Description=Essai K4 (reanalyse-timer.test.mjs) — n'a rien à faire hors de ce banc",
      '',
      '[Timer]',
      'OnCalendar=daily',
      `Unit=${SERVICE}`,
      '',
      '[Install]',
      'WantedBy=timers.target',
      '',
    ].join('\n'),
  );
  const reload = systemctlUtilisateur('daemon-reload');
  assert.equal(reload.code, 0, `« systemctl --user daemon-reload » a échoué :\n${reload.sortie}`);
}

/**
 * Joue le VRAI bloc « reanalyse » d'`install.sh`, redirigé vers le scope
 * utilisateur et vers l'unité d'essai de ce fichier.
 *
 * Les deux substitutions sont DÉCLARÉES et COMPTÉES par `jouerBloc` (via
 * `ecrireScriptDeBloc`) : si le bloc change de forme — un `systemctl` de plus
 * ou de moins, un nom de variable renommé —, l'essai échoue en le disant,
 * plutôt que de jouer, en silence, contre autre chose que le vrai bloc.
 */
function jouerReanalyse() {
  return jouerBloc('reanalyse', { SOURCE: RACINE_BACKEND }, repertoireJetable(), [
    ['systemctl ', 'systemctl --user ', 7],
    ['UNITE_REANALYSE="cyber-grc-reanalyse.timer"', `UNITE_REANALYSE="${UNITE}"`, 1],
  ]);
}

before(() => {
  // Un run précédent interrompu ne doit pas fausser celui-ci.
  retirerUniteEssai();
  poserUniteEssai();
});

after(() => {
  retirerUniteEssai();
  for (const chemin of temporaires) rmSync(chemin, { recursive: true, force: true });
});

describe('Le bloc « banc: reanalyse » constate l’armement RÉEL, il ne lit pas un fichier', () => {
  test('LA FORME DES UNITÉS LIVRÉES est acceptée par systemd-analyze verify', async () => {
    // Cette moitié du bloc ne connaît pas de scope : elle lit les VRAIS
    // fichiers de `deploy/systemd/`, sans aucune substitution. Si l'une des
    // deux unités contenait une directive refusée ou un ExecStart introuvable
    // (le piège exact de Q-63), c'est ici que ça se verrait.
    const issue = jouerReanalyse();
    assert.match(
      issue.sortie,
      /unités cyber-grc-reanalyse\.\{service,timer\} validées par systemd-analyze verify/,
      `Les unités livrées doivent être syntaxiquement valides :\n${issue.sortie}`,
    );
  });

  test('ARMÉ : enable --now — is-enabled=enabled, is-active=active — le contrôle est VERT', async () => {
    const enable = systemctlUtilisateur('enable', '--now', UNITE);
    assert.equal(enable.code, 0, `« systemctl --user enable --now ${UNITE} » a échoué :\n${enable.sortie}`);

    // Contrôle de matière : l'unité RÉPOND enabled/active avant qu'on ne
    // demande au bloc de le constater lui-même — sans quoi un bloc qui dirait
    // toujours « armé » passerait cet essai sans avoir rien vérifié.
    assert.equal(systemctlUtilisateur('is-enabled', UNITE).sortie.trim(), 'enabled');
    assert.equal(systemctlUtilisateur('is-active', UNITE).sortie.trim(), 'active');

    const issue = jouerReanalyse();
    assert.equal(issue.code, 0, `Le minuteur est armé : le bloc doit aller à son terme :\n${issue.sortie}`);
    assert.match(
      issue.sortie,
      new RegExp(`minuteur ${UNITE} armé \\(enabled, active\\)`),
      `Le contrôle doit NOMMER l’unité qu’il vient de constater armée :\n${issue.sortie}`,
    );
  });

  test('MORSURE — DÉSARMÉ : disable --now — le contrôle ROUGIT ET NOMME l’unité', async () => {
    const disable = systemctlUtilisateur('disable', '--now', UNITE);
    assert.equal(disable.code, 0, `« systemctl --user disable --now ${UNITE} » a échoué :\n${disable.sortie}`);

    // Contrôle de matière, côté rouge : l'unité doit RÉELLEMENT être
    // désarmée avant qu'on ne demande au bloc de le voir — sinon un bloc qui
    // dirait toujours « désarmé » passerait cet essai sans avoir rien vérifié
    // non plus, symétriquement au piège de l'essai précédent.
    assert.equal(systemctlUtilisateur('is-enabled', UNITE).sortie.trim(), 'disabled');
    assert.equal(systemctlUtilisateur('is-active', UNITE).sortie.trim(), 'inactive');

    const issue = jouerReanalyse();
    assert.notEqual(
      issue.code,
      0,
      `Le minuteur est désarmé : une installation qui continuerait laisserait le contrôle n° 7 ` +
        `(CONVENTIONS.md §31.4) sans être jamais déclenché, en silence.\n${issue.sortie}`,
    );
    assert.match(
      issue.sortie,
      new RegExp(`minuteur ${UNITE} désarmé \\(is-enabled=disabled, is-active=inactive\\)`),
      `Le refus doit NOMMER l’unité concernée et l’état constaté — un exploitant qui le lit ne ` +
        `doit pas avoir à deviner : ${issue.sortie}`,
    );
    assert.match(
      issue.sortie,
      /systemctl --user daemon-reload && systemctl --user enable --now/,
      `Et dire comment réarmer — la substitution doit se retrouver jusque dans le conseil ` +
        `affiché (les DEUX occurrences), preuve que c’est le MÊME texte qui a été joué, pas ` +
        `un message recopié à la main :\n${issue.sortie}`,
    );
  });

  test('RÉARMÉ : enable --now de nouveau — le contrôle REDEVIENT VERT', async () => {
    // ── La seconde moitié de la morsure ────────────────────────────────
    // Sans cet essai, le précédent pourrait être satisfait par un bloc cassé
    // qui échoue TOUJOURS : rouge une fois ne prouve rien si le bloc ne sait
    // plus jamais redevenir vert.
    const enable = systemctlUtilisateur('enable', '--now', UNITE);
    assert.equal(enable.code, 0, `« systemctl --user enable --now ${UNITE} » a échoué :\n${enable.sortie}`);
    assert.equal(systemctlUtilisateur('is-enabled', UNITE).sortie.trim(), 'enabled');
    assert.equal(systemctlUtilisateur('is-active', UNITE).sortie.trim(), 'active');

    const issue = jouerReanalyse();
    assert.equal(issue.code, 0, `Réarmé, le contrôle doit repasser au vert :\n${issue.sortie}`);
    assert.match(issue.sortie, new RegExp(`minuteur ${UNITE} armé \\(enabled, active\\)`), issue.sortie);
  });

  test('INCONNU DE SYSTEMD : ni succès ni échec — reserve(), pas confondu avec un succès', async () => {
    // ── Le troisième verdict (constat Q-75) ──────────────────────────────
    // Une unité que systemd ne connaît pas (jamais installée, ou retirée)
    // n'est ni « armée » ni « désarmée » au sens de ce contrôle : c'est un
    // contrôle qui n'a PAS PU être joué, et `reserve()` — pas `succes()` —
    // doit le dire. `jouerBloc`/`ecrireScriptDeBloc` (test/aide/install.mjs)
    // ne définit pas de fausse `reserve()` : cet essai fournit donc la VRAIE,
    // recopiée à l'identique de la tête de `deploy/install.sh`, exactement
    // comme le fait la suite « Le mot de la fin… » plus bas dans
    // `install-blocs.test.mjs` pour le bloc « bilan ».
    retirerUniteEssai();
    assert.equal(
      systemctlUtilisateur('is-enabled', UNITE).sortie.trim(),
      'not-found',
      'Prémisse : systemd ne doit plus connaître cette unité du tout.',
    );

    let corps = extraireBloc('reanalyse');
    const vues = corps.split('systemctl ').length - 1;
    assert.equal(vues, 7, `Le bloc « reanalyse » ne porte plus 7 occurrences de « systemctl » : ${vues}.`);
    corps = corps.split('systemctl ').join('systemctl --user ');
    const vuesUnite = corps.split('UNITE_REANALYSE="cyber-grc-reanalyse.timer"').length - 1;
    assert.equal(vuesUnite, 1, 'Le bloc « reanalyse » ne porte plus le nom attendu de variable.');
    corps = corps.replace('UNITE_REANALYSE="cyber-grc-reanalyse.timer"', `UNITE_REANALYSE="${UNITE}"`);

    const dossier = repertoireJetable();
    const script = join(dossier, 'inconnu.sh');
    writeFileSync(
      script,
      [
        '#!/bin/bash',
        'set -Eeuo pipefail',
        "succes() { printf '  ok %s\\n' \"$*\"; }",
        "alerte() { printf '  !! %s\\n' \"$*\"; }",
        "echec()  { printf ' ERR %s\\n' \"$*\"; exit 1; }",
        // La VRAIE `reserve()` de tête de `deploy/install.sh`, copiée à
        // l'identique — pas résumée : c'est justement le mécanisme qu'on
        // éprouve, voir la note du constat Q-75 dans `install.sh`.
        'RESERVES=()',
        "reserve() { printf '\\033[1;36m N/J\\033[0m %s\\n' \"$*\" >&2; RESERVES+=(\"$*\"); }",
        `SOURCE=${JSON.stringify(RACINE_BACKEND)}`,
        '',
        corps,
      ].join('\n'),
    );
    // ⚠️ `execFileSync` (l'idiome de `jouerBloc`/`jouerBilan`) ne rend le
    // contenu de stderr QUE lorsque le script sort en échec — sur un succès,
    // sa valeur de retour est le seul stdout, et la marque « N/J » de
    // `reserve()` (écrite sur stderr) serait perdue en silence. C'est sans
    // conséquence pour les essais existants, qui n'observent `reserve()` que
    // sur un chemin qui finit par échouer (le bloc « bilan », `exit 3`) ; ici
    // le script réussit (aucun bloc englobant ne fait échouer sur une simple
    // réserve), donc `spawnSync` est employé pour capter les deux flux dans
    // tous les cas, succès compris.
    const resultat = spawnSync('bash', [script], { encoding: 'utf8' });
    const issue = { code: resultat.status ?? 1, sortie: `${resultat.stdout}${resultat.stderr}` };

    assert.equal(
      issue.code,
      0,
      `Une unité inconnue de systemd n’est pas un ÉCHEC (rien n’a été trouvé non conforme, on ` +
        `n’a simplement rien pu constater) : code obtenu ${String(issue.code)}.\n${issue.sortie}`,
    );
    assert.match(issue.sortie, /N\/J/, `« reserve() » doit avoir été appelée :\n${issue.sortie}`);
    assert.match(
      issue.sortie,
      new RegExp(`minuteur ${UNITE} inconnu de systemd`),
      `Et nommer l’unité en cause :\n${issue.sortie}`,
    );
  });
});
