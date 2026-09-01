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
 * Les noms de TOUS les blocs qu'`install.sh` annonce, DÉCOUVERTS.
 *
 * ── Pourquoi découverts, et pas énumérés ────────────────────────────────────
 *
 * Le banc portait la liste écrite à la main `['frontend', 'proxytimeout',
 * 'configtest']`. C'est un **annuaire** : il ne dit rien du jour où un bloc
 * s'ajoute — il l'ignore, en silence, et le nouveau bloc n'est joué par
 * personne. C'est la forme exacte du défaut que le correctif du constat
 * **Q-39** a fait rougir chez l'agent serveur : un contrôle qui figeait la
 * liste des appelants du générateur unique, et qui vérifiait l'annuaire au lieu
 * de la propriété.
 *
 * La propriété est : **tout bloc qu'un marqueur annonce est extractible, borné
 * et non vide**. Elle se vérifie sur ce que le fichier annonce, pas sur ce que
 * le banc se souvient d'avoir vu.
 */
export function blocsAnnonces() {
  const source = readFileSync(INSTALL, 'utf8');
  const noms = [];
  for (const ligne of source.split('\n')) {
    const trouve = /^[ \t]*# >>> banc: ([a-z0-9_-]+) <<<[ \t]*$/.exec(ligne);
    if (trouve !== null) noms.push(trouve[1]);
  }
  assert.ok(
    noms.length >= 3,
    `Seulement ${String(noms.length)} bloc(s) annoncé(s) dans deploy/install.sh : les ` +
      'marqueurs ont disparu, et le banc ne joue plus rien de ce fichier.',
  );
  assert.equal(
    new Set(noms).size,
    noms.length,
    `Deux blocs portent le même nom dans deploy/install.sh : ${noms.join(', ')}. ` +
      'L’extraction prendrait le premier, en silence.',
  );
  return noms;
}

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
function preambule(variables) {
  return [
    '#!/bin/bash',
    'set -Eeuo pipefail',
    "succes() { printf '  ok %s\\n' \"$*\"; }",
    "alerte() { printf '  !! %s\\n' \"$*\"; }",
    "echec()  { printf ' ERR %s\\n' \"$*\"; exit 1; }",
    "info()   { printf '== %s\\n' \"$*\"; }",
    // `lire_variable` appartient à `install.sh` et lit le fichier d'environnement
    // installé. Hors VM il n'y en a pas : la doublure rend vide, ce qui est
    // exactement ce que la fonction réelle rendrait pour une variable absente.
    'lire_variable() { printf ""; }',
    ...Object.entries(variables).map(([cle, valeur]) => `${cle}=${JSON.stringify(valeur)}`),
    '',
  ].join('\n');
}

export function jouerBloc(nom, variables, dossier, substitutions = []) {
  const script = join(dossier, `bloc-${nom}.sh`);
  let corps = extraireBloc(nom);
  // ── Les substitutions sont DÉCLARÉES, et comptées ─────────────────────────
  // Un bloc porte parfois un chemin absolu d'installation (`/etc/apache2/…`)
  // qui n'existe pas ici — ou qui existe, appartient à une AUTRE instance, et
  // ferait éprouver la configuration de quelqu'un d'autre. On le réécrit, mais
  // jamais en silence : le nombre d'occurrences attendu est vérifié, faute de
  // quoi une reformulation du bloc ferait jouer l'essai contre autre chose que
  // ce qu'il annonce — c'est-à-dire contre rien.
  for (const [avant, apres, attendu] of substitutions) {
    const vues = corps.split(avant).length - 1;
    assert.equal(
      vues,
      attendu,
      `Substitution « ${avant} » dans le bloc « ${nom} » : ${String(vues)} occurrence(s) au ` +
        `lieu de ${String(attendu)}. Le bloc a changé de forme.`,
    );
    corps = corps.split(avant).join(apres);
  }
  writeFileSync(script, `${preambule(variables)}${corps}\n`);

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

/**
 * Extrait une FONCTION shell de `install.sh`, par son nom.
 *
 * ── Pourquoi c'est légitime là où deviner un bloc ne l'est pas ──────────────
 *
 * `extraireBloc` refuse de deviner parce qu'une frontière de bloc n'existe que
 * dans l'intention de son auteur : « du premier `FRONTEND_PUBLIABLE=` jusqu'au
 * `rsync` » désigne un jour autre chose. Une fonction, elle, a des bornes que
 * le langage impose — `nom() {` et l'accolade en colonne zéro —, et sa
 * disparition est bruyante. Deux fonctions sont extraites ainsi :
 * `jeton_frontend` et `injecter_jeton_frontend`, qui versionnent les URL du
 * frontend déployé et qu'aucune ancre n'entoure (elles sont appelées hors
 * bloc). Les rejouer est la seule façon de mettre la racine web dans l'état où
 * une VRAIE installation la laisse — état sans lequel le garde-fou du constat
 * **Q-43** n'éprouverait rien.
 */
export function extraireFonction(nom) {
  const source = readFileSync(INSTALL, 'utf8');
  const debut = new RegExp(`^${nom}\\(\\)[ \\t]*\\{[ \\t]*$`, 'm').exec(source);
  assert.notEqual(
    debut,
    null,
    `La fonction « ${nom}() » a disparu de deploy/install.sh, ou a changé de forme. Le banc ` +
      'refuse d’en inventer une : la rejouer est ce qui met la racine web dans l’état d’une ' +
      'vraie installation.',
  );
  const reste = source.slice(debut.index);
  const fin = /^\}[ \t]*$/m.exec(reste);
  assert.notEqual(fin, null, `La fonction « ${nom}() » n’est pas refermée en colonne zéro.`);
  const corps = reste.slice(0, fin.index + fin[0].length);
  const utile = corps.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  assert.ok(
    utile.length >= 5,
    `La fonction « ${nom}() » ne porte que ${String(utile.length)} ligne(s) exécutable(s).`,
  );
  return corps;
}

/**
 * Joue un script bash arbitraire avec les fonctions de sortie d'`install.sh`.
 * Rend `{ code, sortie }` — jamais d'exception : le CONTENU décide.
 */
export function jouerScript(corps, variables, dossier, nom = 'script') {
  const chemin = join(dossier, `${nom}.sh`);
  writeFileSync(chemin, `${preambule(variables)}${corps}\n`);
  try {
    return {
      code: 0,
      sortie: execFileSync('bash', [chemin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    };
  } catch (erreur) {
    return { code: erreur.status ?? 1, sortie: `${erreur.stdout ?? ''}${erreur.stderr ?? ''}` };
  }
}
