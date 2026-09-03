/**
 * chiffres-du-banc.test.mjs — les nombres du `README` confrontés au réel (constat Q-53).
 *
 * ── Pourquoi ce fichier existe, et pourquoi il arrive si tard ───────────────
 *
 * **Six signalements de documentation périmée en huit passages de porte**, et la
 * parade est restée « la discipline d'un agent ». `test/documentation/registre.test.mjs`
 * garde la *forme* du registre des constats ; **personne ne gardait les nombres.**
 *
 * Le constat Q-53 en donne la mesure la plus nette : il a été **écrit dans le commit
 * qui l'a lui-même illustré** — la révision qui commettait la septième famille
 * d'essais annonçait « six familles, 637 essais » dans son propre message. Le bon
 * nombre était connu, et n'est pas allé dans les documents.
 *
 * ── Ce que ce fichier contrôle, et la propriété qu'il tient ─────────────────
 *
 * Un exploitant qui vérifie une installation compare le chiffre du `README` au réel.
 * Faux, il ne mesure plus rien — **pire, il rassure**. La propriété tenue ici est
 * donc celle-ci, et rien de plus :
 *
 *  1. le bloc de mesure du §8 nomme **exactement** les familles qui existaient **à la
 *     révision qu'il désigne lui-même** — découverte dans `git ls-tree`, jamais
 *     récitation (`CONVENTIONS.md` §19.5) ;
 *  2. la somme des familles fait le total annoncé (arithmétique) ;
 *  3. le total du §8, celui du bloc `npm test` du §5 et celui du `CHANGELOG`
 *     **disent le même nombre** ;
 *  4. la « révision mesurée » est un vrai commit **de cette branche** — un chiffre
 *     sans point de mesure est invérifiable, et un point de mesure hors de
 *     l'histoire ne se rejoue pas.
 *
 * ── COMMENT IL SE COMPORTE EN COURS DE VAGUE, ET POURQUOI C'EST AINSI ──────
 *
 * **Il juge le `README` contre la révision que le `README` nomme — jamais contre
 * l'arbre de travail.** C'est une décision, et voici ce qu'elle évite.
 *
 * La première rédaction contrôlait aussi que `backend/test/**` n'avait pas bougé
 * depuis la mesure. Elle était juste, et elle rougissait au premier tour : quatre
 * agents écrivaient des essais, le chiffre était faux dans l'heure. Elle serait donc
 * **restée rouge toute la vague** — et c'est la leçon du constat **Q-64** :
 * *« un banc qui échoue quatre fois sur cinq apprend à être ignoré, et un banc qu'on
 * ignore est exactement ce que ce dispositif existe pour empêcher »*. Le jour où ce
 * contrôle aurait rougi pour une **autre** raison, personne ne l'aurait vu.
 *
 * Jugé contre sa propre révision, il est **vrai à tout instant** : pendant la vague,
 * les chiffres décrivent légitimement un état passé, et le contrôle est vert. À la
 * passe de documentation qui clôt la porte, l'agent DOC rejoue le banc et écrit une
 * **nouvelle** révision mesurée — et le contrôle juge alors immédiatement les
 * familles annoncées contre l'arbre de CETTE révision-là. C'est très exactement le
 * défaut que Q-53 a illustré : le commit `fe3087c` a livré une septième famille en
 * annonçant « six familles, 637 essais ». Ce contrôle-ci l'aurait fait rougir.
 *
 * ── CE QU'IL NE FAIT PAS, ET QUI RESTE OUVERT ──────────────────────────────
 *
 * Il **ne compte pas les essais en les exécutant**. La seule mesure qui ne puisse pas
 * mentir serait de rejouer le banc entier dans un processus fils — soit **doubler la
 * durée de `npm test` à chaque exécution, pour tout le monde, définitivement**. Le
 * total annoncé n'est donc confronté qu'à lui-même (somme des familles, trois
 * documents concordants) ; ce sont les **familles**, et non le nombre, qui sont
 * confrontées au dépôt.
 *
 * C'est un arbitrage, pas un oubli. Il est écrit ici pour qu'on puisse le renverser
 * en connaissance de cause, et il est porté au rapport de l'agent.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

const README = join(RACINE_BACKEND, 'README.md');
const CHANGELOG = join(RACINE_BACKEND, '..', 'CHANGELOG.md');
const RACINE_DEPOT = join(RACINE_BACKEND, '..');

/**
 * Les familles telles qu'elles existaient **à une révision donnée**.
 *
 * Lues dans l'objet git, pas sur le disque : c'est ce qui rend ce contrôle vrai à
 * tout instant, y compris au milieu d'une vague où quatre agents écrivent des
 * essais. `test/aide/` n'est pas une famille — ce sont les montages partagés.
 */
function famillesA(revision) {
  return execFileSync('git', ['ls-tree', '-d', '--name-only', revision, 'backend/test/'], {
    cwd: RACINE_DEPOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => l.replace(/^backend\/test\//, '').replace(/\/$/, ''))
    .filter((n) => n !== 'aide')
    .sort();
}

/**
 * Le bloc de mesure du §8 : `npm test → tests N · pass N · fail 0` suivi des
 * comptes par famille. C'est le point de mesure que le `README` désigne lui-même
 * comme « sans lequel un chiffre est invérifiable ».
 */
function blocDeMesure() {
  const texte = readFileSync(README, 'utf8');
  const ligne = /npm test\s+→\s+tests\s+(\d+)\s+·\s+pass\s+(\d+)\s+·\s+fail\s+(\d+)/.exec(texte);
  assert.notEqual(ligne, null,
    'Le bloc de mesure « npm test → tests N · pass N · fail 0 » a disparu du README §8 : ' +
    'ce contrôle n’a plus de sujet, et le chiffre n’a plus de point de mesure.');
  // Les comptes par famille suivent, sur les lignes du même bloc.
  const apres = texte.slice(ligne.index, ligne.index + 900);
  const familles = {};
  for (const trouve of apres.matchAll(/\b(base|api|reprise|navigateur|deploiement|depot|documentation|annuaire|modules|auth|droits)\s+(\d+)\b/g)) {
    familles[trouve[1]] = Number(trouve[2]);
  }
  const revision = /Révision mesurée \| \*\*`([0-9a-f]{7,40})`\*\*/.exec(texte);
  return {
    total: Number(ligne[1]),
    passes: Number(ligne[2]),
    echecs: Number(ligne[3]),
    familles,
    revision: revision === null ? null : revision[1],
  };
}

describe('Les chiffres du README disent le réel, ou ils rougissent (constat Q-53)', () => {
  test('LES FAMILLES ANNONCÉES sont EXACTEMENT celles de la RÉVISION MESURÉE (§19.5)', async () => {
    // C'est le contrôle qui aurait fait rougir le commit `fe3087c` : il a livré une
    // septième famille d'essais en annonçant « six familles, 637 essais », et le bon
    // nombre était dans son propre message de commit.
    const mesure = blocDeMesure();
    const alors = famillesA(mesure.revision);
    assert.deepEqual(
      Object.keys(mesure.familles).sort(), alors,
      `Le bloc de mesure du README §8 ne nomme pas les familles qui existaient à \`${mesure.revision}\`.\n` +
      `  À cette révision : ${alors.join(', ')}\n` +
      `  Dans le README    : ${Object.keys(mesure.familles).sort().join(', ')}\n` +
      '  Une famille livrée et non annoncée sort du chiffre en silence — c’est exactement ce ' +
      'que le commit qui a inscrit Q-53 a fait.',
    );
    assert.ok(alors.length >= 6, `Seulement ${String(alors.length)} famille(s) vues : le balayage ne lit plus rien.`);
  });

  test('CONTRÔLE SYMÉTRIQUE : le balayage sait VOIR une famille de plus', async () => {
    // Sans cette moitié, « les familles coïncident » serait vrai d'une lecture qui ne
    // reconnaît plus rien — et l'essai ci-dessus serait vert quoi qu'il arrive.
    // On vérifie donc que la découverte suit bien l'histoire : le dépôt a gagné des
    // familles, et `famillesA` doit les voir apparaître entre deux révisions.
    const mesure = blocDeMesure();
    const aujourdhui = famillesA('HEAD');
    const alors = famillesA(mesure.revision);
    assert.ok(
      aujourdhui.length >= alors.length,
      `Le dépôt aurait PERDU des familles entre \`${mesure.revision}\` et HEAD : ` +
      `${alors.join(', ')} → ${aujourdhui.join(', ')}. Si c’est voulu, le README doit le dire.`,
    );
    for (const famille of alors) {
      assert.ok(aujourdhui.includes(famille),
        `La famille « ${famille} » a disparu depuis la mesure : le README annonce un compte ` +
        'qui inclut des essais qui n’existent plus.');
    }
  });

  test('LA SOMME des familles fait le total annoncé', async () => {
    const mesure = blocDeMesure();
    const somme = Object.values(mesure.familles).reduce((a, b) => a + b, 0);
    assert.equal(somme, mesure.total,
      `Le README annonce ${String(mesure.total)} essais et ses familles en font ${String(somme)} ` +
      `(${Object.entries(mesure.familles).map(([f, n]) => `${f} ${String(n)}`).join(' · ')}).`);
    assert.equal(mesure.passes, mesure.total, 'Le README doit annoncer un banc VERT, ou dire lequel ne l’est pas.');
    assert.equal(mesure.echecs, 0, 'Le README annonce des échecs : il faut les nommer, pas les compter.');
  });

  test('LE MÊME NOMBRE partout : §8, le bloc `npm test` du §5, et le CHANGELOG', async () => {
    // Trois endroits, un seul nombre. C'est la forme sous laquelle la dérive s'est
    // présentée cinq fois sur six : un endroit mis à jour, les deux autres non.
    const mesure = blocDeMesure();
    const readme = readFileSync(README, 'utf8');
    const commande = /npm test\s+#\s+(\d+)\s+essais/.exec(readme);
    assert.notEqual(commande, null, 'Le bloc « npm test # N essais » du §5 a disparu.');
    assert.equal(Number(commande[1]), mesure.total,
      `Le §5 annonce ${commande[1]} essais et le §8 en annonce ${String(mesure.total)}.`);

    const changelog = readFileSync(CHANGELOG, 'utf8');
    const premier = /\*\*(\d+)\s+essais,\s+\1\s+passés,\s+0\s+échec\*\*/.exec(changelog);
    assert.notEqual(premier, null, 'Le CHANGELOG ne porte plus « N essais, N passés, 0 échec ».');
    assert.equal(Number(premier[1]), mesure.total,
      `Le CHANGELOG annonce ${premier[1]} essais et le README §8 en annonce ${String(mesure.total)}. ` +
      'C’est la dérive de Q-53, telle qu’elle s’est présentée à six reprises.');
  });

  test('LE POINT DE MESURE EXISTE : la « révision mesurée » est un vrai commit', async () => {
    const mesure = blocDeMesure();
    assert.notEqual(mesure.revision, null,
      'Le README §8 n’indique plus de « révision mesurée » : un chiffre sans point de mesure ' +
      'est invérifiable, et le README le dit lui-même.');
    const type = execFileSync('git', ['cat-file', '-t', mesure.revision], {
      cwd: RACINE_DEPOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    assert.equal(type, 'commit', `La révision « ${mesure.revision} » n’est pas un commit de ce dépôt.`);
    // …et un commit DE CETTE BRANCHE : un point de mesure hors de l'histoire ne se
    // rejoue pas, et l'exploitant qui voudrait vérifier le chiffre ne le pourrait pas.
    let ancetre = true;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', mesure.revision, 'HEAD'],
        { cwd: RACINE_DEPOT, stdio: 'ignore' });
    } catch {
      ancetre = false;
    }
    assert.equal(ancetre, true,
      `La révision mesurée « ${mesure.revision} » n’est pas un ancêtre de HEAD : le chiffre ` +
      'renvoie à un état que cette branche n’a jamais traversé, et personne ne peut le rejouer.');
  });

  test('LE CHIFFRE DÉCRIT UN ÉTAT PASSÉ, et le README le DIT', async () => {
    // ── Ce que ce contrôle remplace, et pourquoi ─────────────────────────────
    //
    // Ici se tenait « `backend/test/**` n'a pas bougé depuis la mesure ». Juste, et
    // rouge dès son premier tour : quatre agents écrivaient des essais. Il serait
    // resté rouge toute la vague, et c'est la leçon de Q-64 — un rouge permanent est
    // un rouge qu'on saute des yeux.
    //
    // Ce qui reste vérifiable à tout instant, et qui porte la même exigence : le
    // README doit **désigner** sa révision de mesure au lieu de laisser croire que
    // son chiffre vaut pour l'arbre d'aujourd'hui. C'est la ligne « Révision
    // mesurée », et c'est elle qui rend le nombre rejouable.
    const texte = readFileSync(README, 'utf8');
    const mesure = blocDeMesure();
    assert.match(texte, /Point de mesure, sans lequel un chiffre est invérifiable/,
      'Le README a cessé de dire que son chiffre vaut POUR UNE RÉVISION. Sans cette phrase, ' +
      'un exploitant lit le nombre comme s’il valait pour son arbre.');
    // Et le bloc de mesure doit se trouver APRÈS cette phrase : un chiffre qui la
    // précède n'est pas couvert par elle.
    assert.ok(texte.indexOf('Point de mesure') < texte.indexOf(`tests ${String(mesure.total)}`),
      'Le bloc de mesure ne suit plus la phrase qui l’encadre.');
  });
});
