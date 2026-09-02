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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
function jouerBloc(nom, variables = {}, substitutions = []) {
  return jouerBlocDans(nom, variables, repertoireJetable(), substitutions);
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

/* =====================================================================
 *  §4 — Ce que le service LIT, le frontal doit l'avoir neutralisé (Q-39)
 * ---------------------------------------------------------------------
 *  Le vhost efface six en-têtes de provenance ou d'identité. La liste est
 *  écrite à la main, et elle est fragile par nature : `X-Request-Id` y a manqué
 *  pendant tout un lot, pendant que `src/serveur.ts` en faisait la « référence »
 *  rendue au client et la clé de ses lignes de journal — constat **Q-39**.
 *
 *  `install.sh` porte désormais un contrôle qui CONFRONTE la liste au réel :
 *  tout en-tête de requête que `src/` lit, ou auquel il fait confiance, doit
 *  être effacé ou reposé par le vhost. Les deux termes sortent de deux fichiers
 *  versionnés, aucun n'est recopié dans un troisième.
 *
 *  ── L'essai qui compte est le troisième ────────────────────────────────
 *
 *  Un contrôle qui porterait sa PROPRE liste d'en-têtes passerait les deux
 *  premiers cas sans rien éprouver. Le cas D — le code cesse de lire un
 *  en-tête, et l'installation passe — est le seul qui distingue « suivre le
 *  code » de « réciter un annuaire ». C'est la famille que ce banc vient de se
 *  faire prendre à porter lui-même, deux fois dans la même journée.
 * ===================================================================== */

describe('Tout en-tête que le service lit est neutralisé par le frontal (constat Q-39)', () => {
  const VHOST_DEPOT = join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf');

  /** Écrit une copie du vhost du dépôt, avec des substitutions DÉCLARÉES. */
  function vhostAvec(substitutions = []) {
    let texte = readFileSync(VHOST_DEPOT, 'utf8');
    for (const [avant, apres, attendu] of substitutions) {
      const vues = texte.split(avant).length - 1;
      assert.equal(
        vues,
        attendu,
        `Le vhost ne porte plus « ${avant} » ${String(attendu)} fois (${String(vues)}) : la ` +
          'mutation de cet essai porterait sur autre chose que ce qu’elle annonce.',
      );
      texte = texte.split(avant).join(apres);
    }
    const chemin = join(repertoireJetable(), 'cyber-grc.conf');
    writeFileSync(chemin, texte);
    return chemin;
  }

  /**
   * Une racine « SOURCE » dont le `src/` est celui du dépôt, éventuellement
   * modifié. On copie plutôt qu'on ne simule : le contrôle cherche ce que le
   * VRAI code lit, et une arborescence inventée éprouverait mon imagination.
   */
  function sourceAvec(substitutions = []) {
    const racine = repertoireJetable();
    cpSync(join(RACINE_BACKEND, 'src'), join(racine, 'src'), { recursive: true });
    for (const [fichier, avant, apres, attendu] of substitutions) {
      const chemin = join(racine, 'src', fichier);
      const texte = readFileSync(chemin, 'utf8');
      const vues = texte.split(avant).length - 1;
      assert.equal(vues, attendu, `« ${avant} » : ${String(vues)} occurrence(s) dans src/${fichier}.`);
      writeFileSync(chemin, texte.split(avant).join(apres));
    }
    return racine;
  }

  /** Joue le bloc, en lui désignant LE vhost à examiner. */
  function jouerEntetes(source, vhost) {
    return jouerBloc(
      'entetes',
      { SOURCE: source },
      // Le bloc lit d'abord le vhost INSTALLÉ. Sur cette machine il en existe
      // un — celui d'une autre instance —, et sans cette substitution l'essai
      // éprouverait la configuration de quelqu'un d'autre.
      [['VHOST_APPLIQUE=/etc/apache2/sites-available/cyber-grc.conf', `VHOST_APPLIQUE=${vhost}`, 1]],
    );
  }

  /** La ligne de `src/serveur.ts` où le code lit l'en-tête, LUE. */
  function ligneQuiLit(entete) {
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'serveur.ts'), 'utf8');
    const rang = source.split('\n').findIndex((l) => l.includes(`headers['${entete}']`));
    assert.notEqual(rang, -1, `Plus personne ne lit « ${entete} » dans src/serveur.ts.`);
    return rang + 1;
  }

  test('A — LE VHOST DU DÉPÔT passe le contrôle', async () => {
    // Moitié symétrique, sans laquelle les quatre autres seraient satisfaites
    // par un contrôle qui refuse tout — c'est-à-dire par une installation
    // impossible.
    const issue = jouerEntetes(RACINE_BACKEND, vhostAvec());

    assert.equal(issue.code, 0, `Le vhost livré doit passer :\n${issue.sortie}`);
    assert.match(
      issue.sortie,
      /ok en-têtes : tout ce que le service lit est effacé ou reposé par le vhost/,
      `Le contrôle doit être ALLÉ jusqu’à sa conclusion — un silence ne prouve rien ` +
        `(constat Q-37) :\n${issue.sortie}`,
    );
  });

  test('B — « unset X-Request-Id » retiré : arrêt, avec le FICHIER ET LA LIGNE', async () => {
    const issue = jouerEntetes(
      RACINE_BACKEND,
      vhostAvec([['    RequestHeader unset X-Request-Id\n', '', 1]]),
    );

    assert.notEqual(
      issue.code,
      0,
      `Le service lit « x-request-id » et le frontal le laisse passer : un client peut le ` +
        `forger, et c’est le constat Q-39.\n${issue.sortie}`,
    );
    assert.match(issue.sortie, /en-tête lu par le service et NON neutralisé par le vhost : x-request-id/, issue.sortie);
    assert.match(issue.sortie, /constat Q-39/, 'Le refus doit renvoyer au constat qui l’explique.');
    assert.match(
      issue.sortie,
      new RegExp(`lu ici : src/serveur\\.ts:${String(ligneQuiLit('x-request-id'))}`),
      `Il doit NOMMER l’endroit où le code lit cet en-tête — fichier et ligne. C’est ce ` +
        `qu’un exploitant a besoin de lire pour décider quoi faire.\n${issue.sortie}`,
    );
  });

  test('C — « unset X-Forwarded-For » retiré alors que trustProxy est actif : arrêt', async () => {
    // Cet en-tête-là, `src/` ne le nomme nulle part : c'est `trustProxy` qui le
    // fait lire par le cadre. Le contrôle doit donc exiger AUSSI ce à quoi le
    // code fait confiance sans l'écrire — sinon il ne voit que la moitié du
    // problème, et c'est la moitié la moins dangereuse.
    assert.match(
      readFileSync(join(RACINE_BACKEND, 'src', 'serveur.ts'), 'utf8'),
      /trustProxy/,
      'La prémisse de cet essai : le code doit bien poser trustProxy.',
    );
    const issue = jouerEntetes(
      RACINE_BACKEND,
      vhostAvec([['    RequestHeader unset X-Forwarded-For\n', '', 1]]),
    );

    assert.notEqual(issue.code, 0, `L’adresse réelle du client deviendrait forgeable :\n${issue.sortie}`);
    assert.match(issue.sortie, /NON neutralisé par le vhost : x-forwarded-for/, issue.sortie);
  });

  test('D — LE CONTRÔLE SUIT LE CODE : l’en-tête n’est plus lu, l’installation passe', async () => {
    // ── L'essai qui distingue un contrôle d'un annuaire ────────────────────
    //
    // Un contrôle qui porterait sa propre liste d'en-têtes passerait A, B et C
    // sans rien éprouver, et resterait rouge ici pour toujours. Le code cesse
    // de lire « x-request-id » ; le vhost n'en dit plus rien non plus ; il n'y
    // a donc plus rien à exiger, et l'installation doit passer.
    const source = sourceAvec([
      ['serveur.ts', "requete.headers['x-request-id']", 'undefined /* plus lu */', 1],
    ]);
    const issue = jouerEntetes(source, vhostAvec([['    RequestHeader unset X-Request-Id\n', '', 1]]));

    assert.equal(
      issue.code,
      0,
      `Le contrôle exige encore un en-tête que PLUS PERSONNE ne lit : il récite sa propre ` +
        `liste au lieu de suivre le code, et il rougira à chaque évolution légitime ` +
        `(constat Q-39).\n${issue.sortie}`,
    );
    assert.match(issue.sortie, /ok en-têtes/, issue.sortie);
  });

  /**
   * Les QUATRE façons d'écrire « le service lit cet en-tête ».
   *
   * ── Ce que le constat Q-56 reproche à l'essai qui était ici ─────────────
   *
   * Il n'en écrivait qu'UNE : celle que le contrôle sait lire. Il mesurait donc
   * l'accord de l'essai et du contrôle sur une orthographe commune, jamais la
   * propriété. La question à se poser devant tout régresseur est celle-là, et
   * elle n'est pas « où est la liste » :
   *
   *   > **mon essai emprunte-t-il le même chemin que ce qu'il éprouve ?**
   *
   * Si l'essai écrit son cas dans la forme que le contrôle reconnaît, les deux
   * partagent le même angle mort et l'essai ne peut pas le voir. Les quatre
   * formes ci-dessous sont du JavaScript ordinaire, qu'un développeur écrira
   * sans y penser ; trois d'entre elles échappaient au contrôle.
   */
  const ORTHOGRAPHES = [
    ['apostrophes', 'x-jeton-apostrophe', (n) => `requete.headers['${n}']`],
    ['guillemets', 'x-jeton-guillemet', (n) => `requete.headers["${n}"]`],
    ['gabarit', 'x-jeton-gabarit', (n) => `requete.headers[\`${n}\`]`],
    ['destructuration', 'x-jeton-destructure', (n) => `const { '${n}': jeton } = requete.headers; void jeton`],
  ];

  test('E — LE SEPTIÈME EN-TÊTE ne manquera pas, QUELLE QUE SOIT SON ORTHOGRAPHE', async () => {
    // La question que le constat posait : « le septième oubli suivra ». La
    // propriété qui y répond n'est pas « le contrôle connaît le nom d'avance »,
    // c'est « il voit le code le lire » — et lire s'écrit de plusieurs façons.
    const aveugles = [];
    for (const [forme, entete, ecrire] of ORTHOGRAPHES) {
      const source = sourceAvec([
        [
          'serveur.ts',
          "const brut = requete.headers['x-request-id'];",
          `const brut = requete.headers['x-request-id'];\n    void (${ecrire(entete)});`,
          1,
        ],
      ]);
      const issue = jouerEntetes(source, vhostAvec());
      const vu =
        issue.code !== 0 && new RegExp(`NON neutralisé par le vhost : ${entete}`).test(issue.sortie);
      if (!vu) aveugles.push(`${forme} — « ${ecrire(entete)} » : l’installation a CONTINUÉ`);
    }

    assert.deepEqual(
      aveugles,
      [],
      'Le service lit ces en-têtes, le vhost ne les neutralise pas, et le contrôle a imprimé ' +
        '« ok » :\n' +
        aveugles.map((a) => `    · ${a}`).join('\n') +
        '\n\n  Le motif de `deploy/install.sh`, bloc « banc: entetes », ne reconnaît qu’une ' +
        'orthographe :\n' +
        "      grep -rhoE \"requete\\.headers\\['[a-z0-9-]+'\\]\"\n" +
        '  Il doit reconnaître au minimum les guillemets doubles, le gabarit et la ' +
        'destructuration — trois écritures de JavaScript ordinaire (constat Q-56).' +
        '\n\n  ⚠️ Cet essai a lui-même porté ce défaut : il n’écrivait son en-tête que dans ' +
        'la forme que le contrôle sait lire, et mesurait donc leur accord plutôt que la ' +
        'propriété. Un régresseur qui emprunte le chemin de ce qu’il éprouve ne peut rien voir.',
    );
  });

  test('E bis — LE CONTRÔLE SYMÉTRIQUE des quatre orthographes : le vhost neutralise, ça passe', async () => {
    // ── Sans cette moitié, l'essai ci-dessus serait satisfait par un contrôle
    //    qui refuse TOUT : les quatre orthographes feraient échouer, et l'on
    //    conclurait qu'il les voit alors qu'il ne voit rien.
    //
    // ⚠️ Sa portée est honnête, et il faut la dire : pour une orthographe que
    // le contrôle ne sait PAS encore lire, cette moitié est satisfaite sans
    // rien prouver — il ne refuse pas, faute d'avoir vu. C'est l'essai « E »
    // qui fait parler le mécanisme, et c'est lui qu'il faut regarder ; celui-ci
    // ne dit que « il ne bloque pas tout ». Le jour où le motif sera élargi,
    // les quatre cas deviendront ici des cas pleins.
    const refuses = [];
    for (const [forme, entete, ecrire] of ORTHOGRAPHES) {
      const source = sourceAvec([
        [
          'serveur.ts',
          "const brut = requete.headers['x-request-id'];",
          `const brut = requete.headers['x-request-id'];\n    void (${ecrire(entete)});`,
          1,
        ],
      ]);
      // Le vhost neutralise CET en-tête-là : il n'y a plus rien à signaler.
      const vhost = vhostAvec([
        [
          '    RequestHeader unset X-Request-Id\n',
          `    RequestHeader unset X-Request-Id\n    RequestHeader unset ${entete}\n`,
          1,
        ],
      ]);
      const issue = jouerEntetes(source, vhost);
      if (issue.code !== 0) refuses.push(`${forme} : ${issue.sortie.slice(0, 160)}`);
    }
    assert.deepEqual(
      refuses,
      [],
      'Le vhost neutralise ces en-têtes et le contrôle refuse quand même : il ne borne pas, ' +
        'il bloque tout.\n' + refuses.map((r) => `    · ${r}`).join('\n'),
    );
  });

  test('F — UN MOTIF GÉNÉRIQUE ne neutralise rien, et le contrôle le voit', async () => {
    // ── Mesuré par l'agent de déploiement, et c'est le pire des trois cas ───
    //
    // `RequestHeader unset` prend un nom LITTÉRAL. Un motif générique est
    // accepté par `apachectl configtest` — « Syntax OK » — et n'efface RIEN :
    // l'adresse forgée arrive au service. Une protection au frontal peut donc
    // être silencieusement vide, et l'outil qui vérifie la configuration la
    // bénit. Ce contrôle-ci, lui, compare des NOMS : il n'est pas dupe.
    //
    // La contre-épreuve dynamique — Apache réel, en-tête forgé qui traverse —
    // est dans `vhost-apache.test.mjs`, parce qu'elle demande un vrai frontal.
    const issue = jouerEntetes(
      RACINE_BACKEND,
      vhostAvec([
        ['    RequestHeader unset X-Forwarded-For\n', '    RequestHeader unset X-Forwarded-*\n', 1],
        ['    RequestHeader unset X-Request-Id\n', '', 1],
      ]),
    );

    assert.notEqual(
      issue.code,
      0,
      `Un « unset X-Forwarded-* » a été pris pour une neutralisation : il n’efface rien, et ` +
        `l’installation a continué.\n${issue.sortie}`,
    );
    assert.match(issue.sortie, /NON neutralisé par le vhost : x-forwarded-for/, issue.sortie);
  });
});
