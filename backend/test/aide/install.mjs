/**
 * install.mjs — jouer les blocs de `deploy/install.sh`, sans les deviner.
 *
 * ── Pourquoi ces deux fonctions vivent ici ──────────────────────────────────
 *
 * Deux fichiers d'essai jouent maintenant des blocs d'`install.sh` :
 * `deploiement/install-blocs.test.mjs`, qui éprouve leurs décisions, et
 * `deploiement/vhost-apache.test.mjs`, qui s'en sert pour **publier le frontend
 * par le vrai rsync** avant d'interroger un Apache réel. Deux exemplaires de
 * l'extracteur auraient fini par ne plus dire la même chose — c'est très
 * exactement le défaut que `install.sh` lui-même commente à propos de ses deux
 * listes blanches, et le chantier l'a payé assez souvent.
 *
 * Constat **Q-35** : trois marqueurs (`# >>> banc: <nom> <<<`) sont posés dans
 * le fichier livré pour qu'un banc puisse en extraire un bloc et l'exécuter.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { RACINE_BACKEND } from './serveur.mjs';

/** Le script d'installation livré. */
export const INSTALL = join(RACINE_BACKEND, 'deploy', 'install.sh');

/**
 * Extrait un bloc de `install.sh` entre ses deux marqueurs.
 *
 * ── Pourquoi les marqueurs, et pourquoi ce refus ────────────────────────────
 *
 * Une extraction par motif deviné — « du premier `FRONTEND_PUBLIABLE=` jusqu'au
 * `rsync` » — irait chercher le mauvais bloc à la première reformulation, et
 * l'essai passerait au vert en n'éprouvant rien. Les marqueurs ne valent que si
 * **leur absence est une erreur bruyante**, et qu'un bloc vide l'est aussi.
 * Sans cette condition, les marqueurs sont une décoration.
 */
export function extraireBloc(nom) {
  const source = readFileSync(INSTALL, 'utf8');
  const ouverture = new RegExp(`^[ \\t]*# >>> banc: ${nom} <<<[ \\t]*$`, 'm').exec(source);
  const fermeture = new RegExp(`^[ \\t]*# <<< banc: ${nom} >>>[ \\t]*$`, 'm').exec(source);

  assert.notEqual(
    ouverture,
    null,
    `L’ancre d’ouverture « # >>> banc: ${nom} <<< » a disparu de deploy/install.sh. Le banc ` +
      'ne peut plus extraire ce bloc — et il refuse de le deviner : une extraction par motif ' +
      'irait chercher le mauvais bloc et passerait au vert en n’éprouvant rien.',
  );
  assert.notEqual(
    fermeture,
    null,
    `L’ancre de fermeture « # <<< banc: ${nom} >>> » a disparu de deploy/install.sh.`,
  );
  assert.ok(
    fermeture.index > ouverture.index,
    `Les ancres du bloc « ${nom} » sont inversées dans deploy/install.sh.`,
  );

  const corps = source.slice(ouverture.index + ouverture[0].length, fermeture.index);
  const utile = corps.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  assert.ok(
    utile.length >= 5,
    `Le bloc « ${nom} » ne porte que ${String(utile.length)} ligne(s) exécutable(s) : il a été ` +
      'vidé, ou les ancres encadrent autre chose. Un bloc vide s’exécute sans rien faire, et ' +
      'l’essai qui le joue passe sans rien prouver.',
  );
  return corps;
}

/**
 * Joue un bloc extrait, avec les fonctions de sortie d'`install.sh` et rien
 * d'autre. Rend `{ code, sortie }` — jamais d'exception : le CONTENU décide.
 *
 * @param {string} nom nom du bloc, tel qu'il figure dans les marqueurs
 * @param {Record<string,string>} variables variables posées avant le bloc
 * @param {string} dossier répertoire de travail, où le script est écrit
 */
export function jouerBloc(nom, variables, dossier) {
  const script = join(dossier, `bloc-${nom}.sh`);
  const preambule = [
    '#!/bin/bash',
    'set -Eeuo pipefail',
    "succes() { printf '  ok %s\\n' \"$*\"; }",
    "alerte() { printf '  !! %s\\n' \"$*\"; }",
    "echec()  { printf ' ERR %s\\n' \"$*\"; exit 1; }",
    // `lire_variable` appartient à `install.sh` et lit le fichier d'environnement
    // installé. Hors VM il n'y en a pas : la doublure rend vide, ce qui est
    // exactement ce que la fonction réelle rendrait pour une variable absente.
    'lire_variable() { printf ""; }',
    ...Object.entries(variables).map(([cle, valeur]) => `${cle}=${JSON.stringify(valeur)}`),
    '',
  ].join('\n');
  writeFileSync(script, `${preambule}${extraireBloc(nom)}\n`);

  try {
    const sortie = execFileSync('bash', [script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, sortie };
  } catch (erreur) {
    return { code: erreur.status ?? 1, sortie: `${erreur.stdout ?? ''}${erreur.stderr ?? ''}` };
  }
}
