/**
 * install-blocs.test.mjs — les blocs de `install.sh`, joués pour de bon.
 *
 * ── Ce que ce fichier fait, et ce qu'il refuse de faire ──────────────────────
 *
 * Constat **Q-35** : `deploy/install.sh` n'est joué par aucun essai. Trois
 * marqueurs y ont été posés (`# >>> banc: <nom> <<<`) pour qu'un banc puisse en
 * extraire un bloc et l'exécuter. Ce fichier les emploie.
 *
 * **Il ne double pas `rsync` : il joue le vrai.** Une doublure n'éprouverait que
 * ma compréhension des règles de filtre, pas `rsync` — elle transformerait un
 * « non vérifié » honnête en un « vérifié » faux, ce qui est exactement le décor
 * que ce chantier traque. `rsync` étant désormais installé sur la machine, le
 * contrôle symétrique publie pour de bon et **relit la racine web obtenue**.
 * S'il venait à manquer, `exigerRsync()` fait échouer l'essai bruyamment : son
 * absence ne doit jamais ressembler à une propriété tenue (constat **Q-37**).
 *
 * Sont joués ici : le refus qui **précède** la copie — celui qui porte le constat
 * Q-31 —, la copie elle-même et son contrôle d'après-coup, et le contrôle de
 * dérive du ProxyTimeout.
 *
 * **`configtest` n'est pas porté** : il appelle `apache2ctl`, c'est-à-dire la
 * chose même qu'il éprouve. Le doubler ne prouverait rien.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { exigerSilenceApres } from '../aide/assertions.mjs';
import { blocsAnnonces, extraireBloc, jouerBloc as jouerBlocDans } from '../aide/install.mjs';
import { RACINE_BACKEND } from '../aide/serveur.mjs';

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

/** Joue un bloc extrait, dans un répertoire jetable de ce fichier. */
function jouerBloc(nom, variables = {}) {
  return jouerBlocDans(nom, variables, repertoireJetable());
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

/**
 * Refuse de continuer si `rsync` manque — au lieu de laisser son absence rendre
 * un essai vert.
 *
 * C'est la leçon même du constat **Q-37** : un outil absent ne doit jamais
 * ressembler à une propriété tenue. Le banc joue ici le VRAI `rsync` (le
 * doubler n'éprouverait que ma compréhension de ses règles de filtre) ; s'il
 * n'est pas là, l'essai échoue bruyamment et dit quoi installer.
 */
function exigerRsync() {
  const trouve = (() => {
    try {
      execFileSync('rsync', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  assert.ok(
    trouve,
    '`rsync` est introuvable sur cette machine. Cet essai joue la copie réelle du frontend : ' +
      'sans `rsync`, le bloc meurt avant de publier quoi que ce soit, et TOUT ce qui suit ' +
      'observerait le silence d’un script mort (constat Q-37). Installez rsync ' +
      '(`apt-get install rsync`) plutôt que de neutraliser cet essai.',
  );
}

/** Les chemins relatifs des fichiers réellement présents sous `racine`, triés. */
function publies(racine) {
  const trouves = [];
  const parcourir = (dossier, prefixe) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const relatif = prefixe ? `${prefixe}/${entree.name}` : entree.name;
      if (entree.isDirectory()) parcourir(join(dossier, entree.name), relatif);
      else trouves.push(relatif);
    }
  };
  parcourir(racine, '');
  return trouves.sort();
}

describe('L’extraction par ancres refuse de deviner (constat Q-35)', () => {
  test('TOUS les blocs annoncés existent, sont bornés, et ne sont pas vides', async () => {
    // ⚠️ La liste est DÉCOUVERTE, elle n'est plus écrite ici.
    //
    // Cet essai portait `['frontend', 'proxytimeout', 'configtest']`. Un annuaire :
    // le jour où un bloc s'ajoute — et il vient de s'en ajouter un, « entetes » —,
    // l'essai reste vert sans l'avoir seulement regardé. C'est la forme exacte du
    // défaut relevé au correctif du constat Q-39, côté serveur : un contrôle qui
    // figeait la liste des appelants du générateur unique au lieu de la propriété.
    const noms = blocsAnnonces();
    for (const nom of noms) {
      const corps = extraireBloc(nom);
      assert.ok(corps.length > 200, `Le bloc « ${nom} » est trop court pour être celui qu’on croit.`);
    }
    // Et les trois que ce fichier JOUE doivent être parmi eux : un bloc renommé
    // ferait sinon disparaître ses essais sans que rien ne le dise.
    for (const joue of ['frontend', 'proxytimeout', 'configtest']) {
      assert.ok(
        noms.includes(joue),
        `Le bloc « ${joue} » est joué par ce fichier et n’est plus annoncé par install.sh : ` +
          `blocs vus : ${noms.join(', ')}.`,
      );
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

  test('CONTRÔLE SYMÉTRIQUE : une racine web propre est publiée, en entier et rien de plus', async () => {
    // Sans cette moitié, les treize essais ci-dessus seraient satisfaits par un
    // bloc qui refuse TOUT — c'est-à-dire par une installation impossible.
    //
    // ⚠️ Cet essai portait, jusqu'au septième passage, une assertion FAUSSE EN SOI :
    // « la sortie ne contient pas “fichier non publiable” ». Le message de
    // SUCCÈS du bloc est « aucun fichier non publiable » — l'assertion était donc
    // condamnée à rougir dès que le bloc irait jusqu'au bout. Elle était verte
    // parce que le bloc mourait plus tôt, sur un `rsync` absent de la machine.
    // C'est le constat **Q-37**, et la réponse est `exigerSilenceApres` : une
    // absence ne se juge qu'après avoir prouvé que l'étape observée a eu lieu.
    exigerRsync();
    const { racine } = racineAvec(['index.html', 'js/app.js', 'css/style.css', 'data/LISEZ-MOI.md']);
    const issue = jouerBloc('frontend', { DEPOT: racine, RACINE: racine, SOURCE: RACINE_BACKEND });

    assert.equal(
      issue.code,
      0,
      `Le bloc doit aller à son terme sur une racine propre — sinon tout ce qui suit ` +
        `observerait le silence d'un script mort :\n${issue.sortie}`,
    );
    assert.match(
      issue.sortie,
      /listes blanches du frontend alignées/,
      `Le bloc doit être allé jusqu’à la comparaison des deux listes :\n${issue.sortie}`,
    );
    // L'absence du refus, mais seulement APRÈS la preuve que la publication a
    // abouti — et sur la FORME de l'alerte (« !! fichier non publiable : »),
    // jamais sur la sous-chaîne que le message de succès porte lui aussi.
    exigerSilenceApres(
      issue.sortie,
      /!! fichier non publiable :/,
      /ok frontend : \d+ fichier\(s\) publiés/,
      '« Registre_des_risques.xlsx » arrête l’installation AVANT toute copie',
    );
    assert.match(
      issue.sortie,
      /ok frontend : 3 fichier\(s\) publiés, aucun fichier non publiable/,
      `Trois fichiers publiables sont au dépôt : le compte annoncé doit être 3.\n${issue.sortie}`,
    );

    // ── Et ce qui a RÉELLEMENT atterri ───────────────────────────────
    // Le bloc s'auto-contrôle (§ 3), mais un contrôle qui se juge lui-même ne vaut
    // que si quelqu'un regarde par-dessus son épaule : on relit la racine web.
    assert.deepEqual(
      publies(join(racine, 'frontend')),
      ['css/style.css', 'index.html', 'js/app.js'],
      'La racine web doit porter les trois fichiers publiables, et eux seuls.',
    );
    assert.equal(
      existsSync(join(racine, 'frontend', 'data')),
      false,
      'Le répertoire « data/ » n’a rien de publiable : `rsync -m` doit l’avoir élagué ' +
        'au lieu de le créer vide dans une racine servie sans authentification (constat Q-31).',
    );
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
