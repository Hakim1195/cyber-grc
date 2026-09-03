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
 *  1. le bloc de mesure du §8 nomme **exactement** les familles présentes sur le
 *     disque — une famille neuve y entre, une famille morte en sort (**découverte**,
 *     jamais récitation : `CONVENTIONS.md` §19.5) ;
 *  2. la somme des familles fait le total annoncé (arithmétique) ;
 *  3. le total du §8, celui du bloc `npm test` du §5 et celui du `CHANGELOG`
 *     **disent le même nombre** ;
 *  4. la « révision mesurée » est un vrai commit — un chiffre sans point de mesure
 *     est invérifiable ;
 *  5. **et surtout** : si `backend/test/**` a bougé depuis cette révision, le chiffre
 *     est **périmé par construction**, et cet essai le dit. C'est là qu'est toute la
 *     valeur : le banc grossit à chaque vague, et c'est très exactement le moment où
 *     le nombre cesse d'être vrai sans que personne ne s'en aperçoive.
 *
 * ── CE QU'IL NE FAIT PAS, ET IL FAUT LE LIRE AVANT DE S'EN ÉTONNER ─────────
 *
 * Il **ne compte pas les essais en les exécutant**. La seule mesure qui ne puisse pas
 * mentir serait de rejouer le banc entier dans un processus fils — soit **doubler la
 * durée de `npm test` à chaque exécution, pour tout le monde, définitivement**. Le
 * contrôle (5) obtient l'essentiel pour quelques millisecondes : il ne dit pas *quel*
 * est le bon nombre, il dit **que celui-là ne l'est plus**, et il nomme le geste.
 *
 * C'est un arbitrage, pas un oubli, et il est écrit ici pour qu'on puisse le
 * renverser en connaissance de cause.
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

/** Les familles réellement présentes — `test/aide/` n'en est pas une, ce sont les montages. */
function famillesSurLeDisque() {
  return readdirSync(join(RACINE_BACKEND, 'test'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'aide')
    .map((e) => e.name)
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
  test('LES FAMILLES ANNONCÉES sont EXACTEMENT celles du disque (§19.5)', async () => {
    const mesure = blocDeMesure();
    const surLeDisque = famillesSurLeDisque();
    // `deploiement` est écrit sans accent dans le bloc de mesure, comme le répertoire.
    assert.deepEqual(
      Object.keys(mesure.familles).sort(), surLeDisque,
      'Le bloc de mesure du README §8 ne nomme pas les mêmes familles que `backend/test/`.\n' +
      `  Sur le disque : ${surLeDisque.join(', ')}\n` +
      `  Dans le README : ${Object.keys(mesure.familles).sort().join(', ')}\n` +
      '  Une famille née et non annoncée sort du chiffre en silence — c’est exactement ce que ' +
      'le commit qui a inscrit Q-53 a fait.',
    );
    assert.ok(surLeDisque.length >= 6, `Seulement ${String(surLeDisque.length)} famille(s) vues : le balayage ne lit plus rien.`);
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
  });

  test('LE CHIFFRE N’EST PAS PÉRIMÉ : `backend/test/**` n’a pas bougé depuis la mesure', async () => {
    // ── C'est le contrôle qui porte la valeur ────────────────────────────────
    //
    // Il ne dit pas quel est le bon nombre — il dit que celui-ci ne l'est plus, et
    // il nomme le geste. Le banc grossit à chaque vague : c'est exactement l'instant
    // où le chiffre cesse d'être vrai sans que personne s'en aperçoive.
    const mesure = blocDeMesure();
    const changes = execFileSync(
      'git', ['diff', '--name-only', `${mesure.revision}..HEAD`, '--', 'backend/test'],
      { cwd: RACINE_DEPOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).split('\n').filter((l) => l !== '');
    assert.deepEqual(
      changes, [],
      `Le banc a changé depuis la révision mesurée (\`${mesure.revision}\`) : les ${String(mesure.total)} ` +
      'essais annoncés par le README §8 ne sont plus le compte du dépôt.\n' +
      `  ${String(changes.length)} fichier(s) d’essai touché(s) :\n    · ${changes.slice(0, 20).join('\n    · ')}\n` +
      '  Le geste attendu — et c’est une étape de la fermeture de porte, pas une demande ' +
      'après coup : rejouer `npm test`, puis porter le total, les comptes par famille ET la ' +
      'révision mesurée dans README §5, README §8 et CHANGELOG.md.',
    );
  });
});
