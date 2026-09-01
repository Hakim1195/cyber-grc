/**
 * install-blocs.test.mjs — les blocs de `install.sh`, joués pour de bon.
 *
 * ── Ce que ce fichier fait, et ce qu'il refuse de faire ──────────────────────
 *
 * Constat **Q-35** : `deploy/install.sh` n'est joué par aucun essai. Trois
 * marqueurs y ont été posés (`# >>> banc: <nom> <<<`) pour qu'un banc puisse en
 * extraire un bloc et l'exécuter. Ce fichier les emploie.
 *
 * **Il ne double pas `rsync`, et c'est un choix.** Une doublure de `rsync`
 * éprouverait ma compréhension de ses règles de filtre, pas `rsync` — or
 * `install.sh` dit lui-même que ces règles « n'ont pas pu être éprouvées sur la
 * machine de développement ». Les simuler transformerait un « non vérifié »
 * honnête en un « vérifié » faux, ce qui est exactement le décor que ce chantier
 * traque. La copie relève de la vérification sur la VM, et elle y est inscrite.
 *
 * Ce qui EST joué ici ne dépend d'aucun binaire absent : le refus qui **précède**
 * la copie — celui qui porte le constat Q-31 — et le contrôle de dérive du
 * ProxyTimeout. Les deux sont du texte et de l'arithmétique, et les deux
 * décident.
 *
 * **`configtest` n'est pas porté** : il appelle `apache2ctl`, c'est-à-dire la
 * chose même qu'il éprouve. Le doubler ne prouverait rien.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

const INSTALL = join(RACINE_BACKEND, 'deploy', 'install.sh');
const temporaires = [];

after(() => {
  for (const chemin of temporaires) rmSync(chemin, { recursive: true, force: true });
});

/** Un répertoire jetable, effacé à la fin du fichier. */
function repertoireJetable() {
  const chemin = mkdtempSync(join(tmpdir(), 'grc-install-'));
  temporaires.push(chemin);
  return chemin;
}

/**
 * Extrait un bloc de `install.sh` entre ses deux marqueurs.
 *
 * ── Pourquoi les marqueurs, et pourquoi ce refus ────────────────────────────
 *
 * Une extraction par motif deviné — « du premier `FRONTEND_PUBLIABLE=` jusqu'au
 * `rsync` » — irait chercher le mauvais bloc à la première reformulation, et
 * l'essai passerait au vert en n'éprouvant rien. Les marqueurs sont posés dans
 * le fichier livré exprès pour cela ; ils ne valent que si **leur absence est
 * une erreur bruyante**, et qu'un bloc vide l'est aussi. Sans cette condition,
 * les marqueurs sont une décoration.
 */
function extraireBloc(nom) {
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

/** Joue un bloc extrait, avec les fonctions de sortie d'`install.sh` et rien d'autre. */
function jouerBloc(nom, variables = {}) {
  const script = join(repertoireJetable(), 'bloc.sh');
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
    const sortie = execFileSync('bash', [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, sortie };
  } catch (erreur) {
    return {
      code: erreur.status ?? 1,
      sortie: `${erreur.stdout ?? ''}${erreur.stderr ?? ''}`,
    };
  }
}

/** Fabrique une racine web jetable contenant `fichiers` (chemins relatifs). */
function racineAvec(fichiers) {
  const racine = repertoireJetable();
  const depot = join(racine, 'cyber-gouvernance_V4');
  for (const relatif of fichiers) {
    const complet = join(depot, relatif);
    mkdirSync(join(complet, '..'), { recursive: true });
    writeFileSync(complet, 'contenu d’essai');
  }
  mkdirSync(join(racine, 'frontend'), { recursive: true });
  return { racine, depot };
}

describe('L’extraction par ancres refuse de deviner (constat Q-35)', () => {
  test('les trois blocs annoncés existent, sont bornés, et ne sont pas vides', async () => {
    for (const nom of ['frontend', 'proxytimeout', 'configtest']) {
      const corps = extraireBloc(nom);
      assert.ok(corps.length > 200, `Le bloc « ${nom} » est trop court pour être celui qu’on croit.`);
    }
  });

  test('UNE ANCRE ABSENTE fait échouer l’extraction, elle ne la fait pas deviner', async () => {
    // Contrôle de morsure de l'extracteur lui-même. Sans lui, on ne saurait pas
    // si le refus annoncé plus haut a lieu : c'est une assertion d'absence, et
    // elle ne vaut qu'appariée à celle-ci.
    assert.throws(
      () => extraireBloc('bloc-qui-n-existe-pas'),
      /L’ancre d’ouverture/,
      'L’extracteur doit refuser un nom inconnu au lieu de rendre un bloc arbitraire.',
    );
  });
});

describe('Le refus PRÉCÈDE la copie, et il nomme le fichier (constat Q-31)', () => {
  /** Les treize noms qui n'ont rien à faire dans une racine web servie sans mot de passe. */
  const INTRUS = [
    'Registre_des_risques.xlsx',
    'Plan_de_continuite.xlsx',
    'Exigences_client.xlsx',
    '~$Registre_des_risques.xlsx',
    'assets/donnees.csv',
    'js/sauvegarde.sql',
    'notes.txt',
    'archive.zip',
    'rapport.pdf',
    'app.js.bak',
    'index.html.orig',
    'configuration.env',
    'sans_extension',
  ];

  for (const intrus of INTRUS) {
    test(`« ${intrus} » arrête l’installation AVANT toute copie`, async () => {
      const { racine, depot } = racineAvec(['index.html', 'js/app.js', intrus]);
      const issue = jouerBloc('frontend', {
        DEPOT: racine,
        RACINE: racine,
        SOURCE: RACINE_BACKEND,
      });

      assert.notEqual(issue.code, 0, `L’installation devait s’arrêter :\n${issue.sortie}`);
      assert.match(
        issue.sortie,
        new RegExp(`fichier non publiable : ${intrus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
        `Le refus doit NOMMER le fichier : le jour où il tombe, ce sera devant quelqu’un ` +
          `qui ne sait pas ce qu’est Q-31.\n${issue.sortie}`,
      );
      assert.match(issue.sortie, /constat Q-31/, 'Et renvoyer au constat qui l’explique.');
      // Le refus PRÉCÈDE la copie : rien n'a pu être publié.
      assert.equal(
        issue.sortie.includes('PUBLIÉ à tort'),
        false,
        'Le contrôle d’après-copie ne doit pas même avoir été atteint.',
      );
      void depot;
    });
  }

  test('CONTRÔLE SYMÉTRIQUE : une racine web propre franchit le refus', async () => {
    // Sans cette moitié, les treize essais ci-dessus seraient satisfaits par un
    // bloc qui refuse TOUT — c'est-à-dire par une installation impossible.
    const { racine } = racineAvec(['index.html', 'js/app.js', 'css/style.css', 'data/LISEZ-MOI.md']);
    const issue = jouerBloc('frontend', { DEPOT: racine, RACINE: racine, SOURCE: RACINE_BACKEND });

    assert.equal(
      issue.sortie.includes('fichier non publiable'),
      false,
      `Aucun de ces fichiers ne doit être refusé — le « .md » est toléré dans le dépôt :\n${issue.sortie}`,
    );
    assert.match(
      issue.sortie,
      /listes blanches du frontend alignées/,
      `Le bloc doit être allé jusqu’à la comparaison des deux listes :\n${issue.sortie}`,
    );
    // Il s'arrête ensuite sur `rsync`, absent de cette machine — et c'est voulu :
    // ce banc ne double pas la copie (voir l'en-tête).
    assert.match(issue.sortie, /rsync/, `L’arrêt attendu est celui de la copie :\n${issue.sortie}`);
  });
});

describe('La dérive du ProxyTimeout est vue (constat Q-19)', () => {
  /** Écrit un faux vhost installé, et joue le bloc contre lui. */
  function avecVhostInstalle(contenu) {
    const dossier = repertoireJetable();
    const vhost = join(dossier, 'cyber-grc.conf');
    writeFileSync(vhost, contenu);
    // Le bloc lit un chemin absolu d'installation : on le réécrit vers le nôtre,
    // seule substitution faite au texte extrait, et elle est déclarée.
    const corps = extraireBloc('proxytimeout')
      .replaceAll('/etc/apache2/sites-available/cyber-grc.conf', vhost);
    const script = join(dossier, 'pt.sh');
    writeFileSync(script, [
      '#!/bin/bash',
      'set -Eeuo pipefail',
      "succes() { printf '  ok %s\\n' \"$*\"; }",
      "alerte() { printf '  !! %s\\n' \"$*\"; }",
      "echec()  { printf ' ERR %s\\n' \"$*\"; exit 1; }",
      'lire_variable() { printf ""; }',
      `SOURCE=${JSON.stringify(RACINE_BACKEND)}`,
      '',
      corps,
    ].join('\n'));
    try {
      return execFileSync('bash', [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (erreur) {
      return `${erreur.stdout ?? ''}${erreur.stderr ?? ''}`;
    }
  }

  /** La valeur de référence, lue dans le vhost livré — jamais recopiée ici. */
  function reference() {
    const vhost = readFileSync(join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf'), 'utf8');
    const trouve = /^\s*ProxyTimeout\s+(\d+)/m.exec(vhost);
    assert.notEqual(trouve, null, 'Le vhost de référence ne pose plus de ProxyTimeout.');
    return Number(trouve[1]);
  }

  test('CONFORME : la même valeur que la référence est acceptée', async () => {
    const sortie = avecVhostInstalle(`<VirtualHost *:443>\n  ProxyTimeout ${String(reference())}\n</VirtualHost>\n`);
    assert.match(sortie, /ProxyTimeout \(\d+ s\) conforme/, sortie);
  });

  test('TROP BAS : Apache couperait des reprises que le serveur sait tenir', async () => {
    const sortie = avecVhostInstalle(`<VirtualHost *:443>\n  ProxyTimeout ${String(reference() - 30)}\n</VirtualHost>\n`);
    assert.match(sortie, /< référence/, sortie);
    assert.match(sortie, /coupera des reprises/, `Le message doit dire la CONSÉQUENCE : ${sortie}`);
  });

  test('TROP HAUT : chaque reprise immobilise une connexion plus longtemps', async () => {
    const sortie = avecVhostInstalle(`<VirtualHost *:443>\n  ProxyTimeout ${String(reference() + 300)}\n</VirtualHost>\n`);
    assert.match(sortie, /> référence/, sortie);
    assert.match(sortie, /scindez le fichier/i, `Et dire quoi faire à la place : ${sortie}`);
  });

  test('ABSENT : le défaut d’Apache est nommé, avec sa valeur', async () => {
    const sortie = avecVhostInstalle('<VirtualHost *:443>\n  ServerName exemple\n</VirtualHost>\n');
    assert.match(sortie, /aucun ProxyTimeout/, sortie);
    assert.match(sortie, /300 s/, `Le défaut d’Apache doit être nommé : ${sortie}`);
  });
});
