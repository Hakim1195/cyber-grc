/**
 * imports-commites.test.mjs — un fichier suivi n'importe que du suivi.
 *
 * ── Le défaut, et pourquoi il est de la famille que ce banc traque ───────────
 *
 * Constat **Q-52**. Une révision a commité `test/deploiement/vhost-apache.test.mjs`,
 * qui appelle `jouerBlocAttendu` — une fonction qui n'existait alors que dans
 * l'**arbre de travail** de l'agent, `test/aide/install.mjs` n'ayant pas été
 * ajouté au même commit. Le banc était vert : il était joué sur l'arbre, où les
 * deux fichiers cohabitaient. **À cette révision seule, le fichier ne
 * s'importait pas.**
 *
 * C'est mot pour mot ce que ce chantier reproche depuis son premier passage :
 * *mesurer ce qui est commode plutôt que ce qu'on affirme*. « 637 verts » était
 * vrai de l'arbre et faux du commit, et rien ne distinguait les deux.
 *
 * ── CE QUE CE CONTRÔLE JUGE, ET IL FAUT LE LIRE AVANT DE S'EN ÉTONNER ───────
 *
 * Il juge **ce qui serait livré**, pas ce que vous avez sous les yeux :
 *
 *  · le **contenu** d'un fichier est lu dans votre arbre — c'est ce qui donne
 *    l'alerte au plus tôt, pendant que vous écrivez ;
 *  · la **cible** d'un import est cherchée dans ce que `git` SUIT.
 *
 * Un fichier que vous venez de créer et qui n'est pas encore `git add`é fait
 * donc rougir ce contrôle, **et c'est voulu** : c'est exactement l'instant où
 * l'avertissement sert. Le message le dit et donne le geste. Sur un arbre
 * propre, les deux ensembles coïncident et la question ne se pose pas.
 *
 * ── CE QU'IL NE COUVRE PAS, ET POURQUOI C'EST ÉCRIT ─────────────────────────
 *
 * Il ne regarde **que les imports relatifs** — `import`, `export … from`,
 * `import()`, `require()`. C'est le cas qui a cassé, et le seul que je sache
 * mesurer sans deviner.
 *
 * Sont **délibérément hors de portée**, faute de pouvoir les mordre :
 *
 *  · un essai qui **lit un fichier de données** non suivi. Les chemins y sont
 *    calculés (`join(RACINE_BACKEND, 'deploy', 'install.sh')`), pas littéraux :
 *    les reconnaître demanderait de deviner quelles chaînes sont des chemins,
 *    et un contrôle qui devine rend des verdicts qu'on apprend à ignorer ;
 *  · une **migration manquante** ou un script appelant un fichier voisin, pour
 *    la même raison.
 *
 * Prétendre les couvrir sans les mesurer serait la figure du `CONVENTIONS.md`
 * §17.5 — un garde-fou qui se mesure lui-même. Ils sont donc nommés ici, non
 * couverts, plutôt que tus.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

/** La racine du dépôt — `backend/` en est un sous-répertoire. */
const RACINE_DEPOT = join(RACINE_BACKEND, '..');

/** Les extensions dont on sait lire les imports. */
const LISIBLES = ['.ts', '.mjs', '.js', '.cjs'];

/**
 * Ce que `git` SUIT — c'est-à-dire ce qui partirait dans le prochain commit.
 *
 * L'index et non `HEAD` : un fichier `git add`é mais pas encore commité compte,
 * puisqu'il sera là. Un fichier jamais ajouté ne compte pas, et c'est le seul
 * cas qui a réellement cassé.
 */
function fichiersSuivis() {
  let sortie;
  try {
    sortie = execFileSync('git', ['-C', RACINE_DEPOT, 'ls-files', '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (erreur) {
    // Règle du banc (constat Q-37) : un outil absent fait ÉCHOUER, il ne fait
    // pas sauter. Un contrôle qui se tait quand `git` manque ne protège que les
    // machines où il n'y avait rien à protéger.
    assert.fail(
      'Impossible d’interroger `git ls-files` : ce contrôle compare les imports d’un fichier ' +
        'à ce que le dépôt SUIT, et sans `git` il ne peut rien comparer. Jouez le banc depuis ' +
        `une copie de travail du dépôt. Détail : ${erreur.message}`,
    );
  }
  const suivis = new Set(sortie.split('\0').filter((c) => c !== ''));
  assert.ok(
    suivis.size >= 100,
    `Seulement ${String(suivis.size)} fichier(s) suivi(s) : ce n’est pas ce dépôt, et le ` +
      'contrôle conclurait sur un ensemble vide.',
  );
  return suivis;
}

/**
 * Retire commentaires de ligne et de bloc — une phrase n'est pas un import.
 *
 * ⚠️ Un commentaire de bloc est remplacé par AUTANT DE SAUTS DE LIGNE qu'il en
 * portait, jamais par une espace : sans cela les numéros de ligne se décalent,
 * et le refus envoie le lecteur à la mauvaise ligne. Mesuré en écrivant cet
 * essai — il annonçait la ligne 28 pour un import situé à la 76ᵉ.
 */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => '\n'.repeat((bloc.match(/\n/g) ?? []).length))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Les spécificateurs relatifs d'un source, avec leur numéro de ligne.
 *
 * On ne reconnaît que les FORMES de langage — `from '…'`, `import '…'`,
 * `import('…')`, `require('…')` — et jamais une chaîne isolée : le dépôt cite
 * abondamment ses propres fichiers en prose, et les compter ferait rougir sur
 * une phrase de documentation.
 */
function importsRelatifs(chemin) {
  const brut = readFileSync(join(RACINE_DEPOT, chemin), 'utf8');
  const propre = sansCommentaires(brut);
  const motif = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])(\.[^'"]*)\1/g;
  const trouves = [];
  for (const found of propre.matchAll(motif)) {
    const avant = propre.slice(0, found.index);
    trouves.push({ specificateur: found[2], ligne: avant.split('\n').length });
  }
  return trouves;
}

/**
 * Le spécificateur `specificateur`, vu depuis `depuis`, désigne-t-il un fichier
 * de `suivis` ?
 *
 * ── Les deux règles qui ne s'inventent pas ──────────────────────────────────
 *
 * TypeScript écrit `./api/index.js` pour un fichier qui s'appelle
 * `api/index.ts` : la cible du disque n'a pas l'extension du spécificateur, et
 * un contrôle qui l'ignorerait rougirait sur tout `src/**`. Un spécificateur
 * sans extension peut désigner `x.ts`, `x.mjs`, ou `x/index.*`.
 */
function cibleSuivie(depuis, specificateur, suivis) {
  const base = posix.normalize(posix.join(posix.dirname(depuis.split('\\').join('/')), specificateur));
  const candidats = [base];
  const sansExt = base.replace(/\.(js|mjs|cjs)$/, '');
  if (sansExt !== base) for (const ext of LISIBLES) candidats.push(`${sansExt}${ext}`);
  if (!/\.[a-z]+$/.test(base)) {
    for (const ext of LISIBLES) candidats.push(`${base}${ext}`, `${base}/index${ext}`);
  }
  return candidats.some((c) => suivis.has(c));
}

/** Tous les orphelins du dépôt : un fichier suivi importe un chemin non suivi. */
function orphelins() {
  const suivis = fichiersSuivis();
  const lisibles = [...suivis].filter((c) => LISIBLES.some((e) => c.endsWith(e)));
  assert.ok(
    lisibles.length >= 50,
    `Seulement ${String(lisibles.length)} fichier(s) de code suivi(s) : le balayage ne ` +
      'porterait sur presque rien.',
  );

  const manquants = [];
  let examines = 0;
  for (const chemin of lisibles) {
    for (const { specificateur, ligne } of importsRelatifs(chemin)) {
      examines += 1;
      if (!cibleSuivie(chemin, specificateur, suivis)) {
        manquants.push(`${chemin}:${String(ligne)} importe « ${specificateur} », qui n’est pas suivi`);
      }
    }
  }
  // ── Le balayage doit avoir VU quelque chose ────────────────────────────
  // « Aucun orphelin » est aussi ce que rend un balayage qui n'a lu aucun
  // import. Le plancher est mesuré, pas choisi : le dépôt en porte plus de
  // quatre-vingts.
  assert.ok(
    examines >= 60,
    `Seulement ${String(examines)} import(s) relatif(s) examiné(s) : le motif de lecture ne ` +
      'reconnaît plus la façon dont ce dépôt importe, et « aucun orphelin » ne voudrait rien dire.',
  );
  return { manquants, examines, lisibles: lisibles.length };
}

describe('Un fichier suivi n’importe que du suivi (constat Q-52)', () => {
  test('AUCUN IMPORT RELATIF ne désigne un fichier absent du commit', async () => {
    const { manquants, examines, lisibles } = orphelins();

    assert.deepEqual(
      manquants,
      [],
      'Ces fichiers SUIVIS importent des chemins que le dépôt ne suit pas. À la révision ' +
        'seule — sans votre arbre de travail — ils ne s’importent pas, et tout banc joué sur ' +
        'cette révision échouerait au chargement (constat Q-52) :\n' +
        manquants.map((m) => `    · ${m}`).join('\n') +
        '\n\n  ⚠️ CE CONTRÔLE JUGE LE COMMIT, PAS VOTRE ARBRE. Si le fichier visé est bien ' +
        'sous vos yeux, c’est qu’il n’est pas encore suivi : « git add <le fichier cible> », ' +
        'dans le MÊME commit que celui qui l’importe.' +
        `\n  (${String(examines)} imports relatifs examinés dans ${String(lisibles)} fichiers.)`,
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : le balayage voit bien les imports qu’il prétend lire', async () => {
    // ── Sans cette moitié, l'essai ci-dessus serait satisfait par un motif qui
    //    ne reconnaît plus rien : « aucun orphelin » est ce que rend aussi un
    //    balayage aveugle. On exige donc qu'il RETROUVE des liaisons connues,
    //    de chacune des trois formes que le dépôt emploie.
    const suivis = fichiersSuivis();
    const attendus = [
      // `import … from` — la forme ordinaire.
      ['backend/test/deploiement/vhost-apache.test.mjs', '../aide/install.mjs'],
      // Le spécificateur « .js » d'un source TypeScript, qui vise un « .ts ».
      ['backend/src/serveur.ts', './api/index.js'],
      // `export … from` — une réexportation est un import.
      ['backend/test/aide/navigateur.mjs', './assertions.mjs'],
      // `await import('…')` — la forme dynamique, celle qu'un motif naïf rate.
      ['backend/test/api/routes.test.mjs', '../aide/serveur.mjs'],
    ];
    for (const [fichier, specificateur] of attendus) {
      assert.ok(suivis.has(fichier), `${fichier} doit être suivi pour que cet essai ait un sujet.`);
      const vus = importsRelatifs(fichier).map((i) => i.specificateur);
      assert.ok(
        vus.includes(specificateur),
        `Le balayage ne voit pas « ${specificateur} » dans ${fichier} : son motif ne reconnaît ` +
          `plus cette forme d’import. Vus : ${vus.join(', ')}`,
      );
      assert.ok(
        cibleSuivie(fichier, specificateur, suivis),
        `« ${specificateur} », depuis ${fichier}, devrait se résoudre vers un fichier suivi : ` +
          'la résolution est cassée, et le contrôle rougirait partout.',
      );
    }
  });

  test('LA RÉSOLUTION connaît les deux règles qui ne s’inventent pas', async () => {
    // TypeScript écrit « ./x.js » pour un fichier nommé « x.ts » ; un
    // spécificateur sans extension peut désigner « x/index.ts ». Un contrôle
    // qui l'ignorerait rougirait sur tout `src/**`, et l'on apprendrait à ne
    // plus le lire — ce qui est pire que de ne pas l'avoir.
    const suivis = new Set(['a/b/x.ts', 'a/b/dossier/index.mjs', 'a/b/y.mjs']);
    const depuis = 'a/b/importeur.ts';
    assert.equal(cibleSuivie(depuis, './x.js', suivis), true, '« ./x.js » doit trouver « x.ts ».');
    assert.equal(cibleSuivie(depuis, './y.mjs', suivis), true, 'Une extension exacte doit passer.');
    assert.equal(cibleSuivie(depuis, './dossier', suivis), true, 'Un répertoire doit trouver son index.');
    assert.equal(cibleSuivie(depuis, '../b/x.ts', suivis), true, 'Un chemin remontant doit se normaliser.');
    // Et la contre-épreuve : la résolution doit savoir dire NON, sinon les
    // quatre assertions ci-dessus seraient vraies d'une fonction constante.
    assert.equal(cibleSuivie(depuis, './absent.js', suivis), false, 'Un fichier absent doit être vu absent.');
    assert.equal(cibleSuivie(depuis, '../x.js', suivis), false, 'Un chemin qui vise ailleurs aussi.');
  });
});
