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
import { exigerOutil } from '../aide/outils.mjs';

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

/* =====================================================================
 *  Les FAMILLES DÉCRITES au §5 ne mentent pas sur ce qui existe (constat Q-90)
 * ===================================================================== */

/**
 * ── Le défaut que ce bloc ferme ──────────────────────────────────────────────
 *
 * Le §5 tenait sa **propre** table de familles, avec ses **propres** effectifs et sa
 * **propre** révision (`ca73ac6`) — une seconde liste écrite à la main, jamais
 * confrontée à rien, à côté du bloc de mesure du §8 que ce fichier garde depuis Q-53.
 * Elle a divergé sans qu'aucun contrôle ne rougisse : **six** familles et **637** essais
 * au §5 quand le §8 en comptait déjà **onze** et **1030** — cinq chiffres faux, dont
 * trois qui se contredisaient dans le même document (constat **Q-90**).
 *
 * Le remède écrit au §5 lui-même retire les **effectifs** de cette table : il n'y a
 * plus, désormais, qu'un seul endroit où compter (§8, gardé ci-dessus). Mais la
 * **liste des répertoires** décrits au §5 reste écrite à la main — pour une raison
 * différente cette fois, puisque §5 ne compte plus rien, il **nomme** — et rien ne
 * garantissait qu'elle ne diverge pas à son tour : une famille renommée, retirée, ou
 * qu'on aurait oublié d'ajouter en racontant sa vocation.
 *
 * ── Ce que ce contrôle tient, et pourquoi contre la RÉVISION plutôt que l'ARBRE ──────
 *
 * Les répertoires que le §5 **décrit** sont exactement ceux qui existaient à la
 * révision que le §8 **cite** — ni plus (une famille inventée ou mal nommée), ni moins
 * (une famille tue). Jugé contre la révision nommée, jamais contre l'arbre de travail,
 * pour la même raison que le reste de ce fichier (voir l'en-tête, plus haut) : le banc
 * grandit en cours de vague, et un contrôle qui exigerait la concordance avec `HEAD`
 * serait rouge la moitié du temps, pour un désaccord que le document assume déjà
 * explicitement (« comparez d'abord la révision »). Ce n'est qu'à la révision citée que
 * l'égalité doit être exacte.
 */
function famillesDecritesAuSection5() {
  const texte = readFileSync(README, 'utf8');
  const TITRE = "#### Les familles d'essais";
  const debut = texte.indexOf(TITRE);
  assert.notEqual(debut, -1,
    `La section « ${TITRE} » du README §5 a disparu, ou a changé de titre : ce contrôle ` +
    'ne peut plus la borner dans le document (constat Q-90).');
  const bornes = ['\n#### ', '\n## ']
    .map((motif) => texte.indexOf(motif, debut + TITRE.length))
    .filter((i) => i !== -1);
  const fin = bornes.length === 0 ? texte.length : Math.min(...bornes);
  const section = texte.slice(debut, fin);
  const trouvees = new Set();
  for (const trouve of section.matchAll(/`test\/([a-z]+)\/`/g)) {
    // `test/aide/` n'est pas une famille : le §5 le dit lui-même, juste après le
    // tableau — et `famillesA()` l'exclut pour la même raison (montages partagés).
    if (trouve[1] !== 'aide') trouvees.add(trouve[1]);
  }
  return [...trouvees].sort();
}

describe('Les FAMILLES DÉCRITES au §5 sont celles de la RÉVISION MESURÉE (constat Q-90)', () => {
  test('NI FAMILLE FANTÔME NI FAMILLE TUE : le §5 nomme exactement les répertoires de la révision que le §8 cite', async () => {
    const mesure = blocDeMesure();
    const decrites = famillesDecritesAuSection5();
    const alors = famillesA(mesure.revision);
    assert.deepEqual(
      decrites, alors,
      `Le §5 décrit ${decrites.join(', ') || '(rien)'} alors que la révision \`${mesure.revision}\` ` +
      `(celle que le §8 cite) portait ${alors.join(', ')}.\n` +
      '  Une famille décrite au §5 mais absente du dépôt à cette révision, ou l’inverse, ' +
      'est exactement la forme du constat Q-90 : un lecteur y apprend une composition du ' +
      'banc qui n’a jamais existé, ou qui a cessé d’exister sans qu’on le lui dise.',
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : le balayage du §5 sait VOIR une famille, il ne rend pas vert en ne lisant rien', async () => {
    // Sans cette moitié, une section vidée de son tableau (titre gardé, table
    // effacée) rendrait `decrites = []` — et si le jour venait où `famillesA()`
    // rendait aussi `[]` pour une autre raison, le test du dessus resterait vert
    // en n'ayant rien vérifié. On exige donc un plancher, mesuré et non choisi :
    // le §5 décrit aujourd'hui onze familles, jamais moins de six (constat Q-90,
    // qui est parti d'un tableau qui en tenait six).
    const decrites = famillesDecritesAuSection5();
    assert.ok(
      decrites.length >= 6,
      `Seulement ${String(decrites.length)} famille(s) décrite(s) au §5 : le balayage ne ` +
      'lit plus rien, ou la section a perdu son tableau. Un test qui compare deux listes ' +
      'vides ne prouve rien (§17.5) — voir l’en-tête de ce bloc.',
    );
  });
});

/* =====================================================================
 *  L'ENVIRONNEMENT documenté est celui qui tourne ICI (constat Q-77)
 * ===================================================================== */

/**
 * ── Le défaut que ce bloc ferme ──────────────────────────────────────────────
 *
 * Le README §8 a annoncé « Apache 2.4.58 (Ubuntu) » et « PostgreSQL 16.13 » pendant
 * toute la vague 3, pendant que le chantier tournait déjà sur une VM Debian 13 — Apache
 * 2.4.68, PostgreSQL 17. Personne ne l'avait décidé : c'était un conteneur de
 * développement devenu obsolète sous le texte qui le décrivait, et **toute la famille
 * `test/deploiement/`** — dont le correctif Q-42, dont la prémisse est le type MIME
 * qu'Apache attribue aux `.js` — a été validée sur une version qu'aucune machine cible
 * n'embarque. Personne ne s'en est aperçu pendant six passages de porte, parce que rien
 * ne comparait le texte à la machine qui faisait tourner le banc. C'est la forme
 * exacte de Q-53, appliquée cette fois aux **noms de version** plutôt qu'aux comptes
 * d'essais.
 *
 * ── Pourquoi ces essais EXIGENT les outils plutôt que de se sauter ────────────
 *
 * `exigerOutil` (constat Q-37) : un essai vert parce qu'un binaire est absent est un
 * décor. La famille `documentation` n'avait jamais dépendu d'un processus externe
 * jusqu'ici ; elle en dépend maintenant, **délibérément** — la seule alternative est de
 * comparer le README à rien, ce qui ne garde rien.
 *
 * ── La même règle appliquée aux deux côtés ─────────────────────────────────────
 *
 * Chaque contrôle applique **UN SEUL** motif à la sortie de l'outil réel et au texte
 * du README, et compare les deux captures — jamais deux motifs accordés à la main,
 * qui pourraient diverger sans que personne ne le voie (c'est très exactement le
 * défaut que ce fichier existe pour attraper ailleurs).
 */

/**
 * Les deux lignes du tableau d'environnement du §8 — bornées par leur PROPRE texte,
 * jamais par leur position dans le fichier, et RÉDUITES À LEUR CELLULE DE VALEUR
 * (le libellé de colonne écarté). Deux pièges, trouvés par cet essai lui-même en le
 * faisant tourner une première fois :
 *
 *  1. Une recherche non bornée trouve d'abord `| Base |` **du tableau de sauvegarde**
 *     (§6, « Archivage continu des WAL… »), qui n'a rien à voir avec PostgreSQL. Ce
 *     document cite aussi plusieurs vieux « Apache 2.4.58 », tous historiques (le
 *     7ᵉ passage, le correctif Q-42 originel) — c'est précisément la confusion que
 *     Q-77 a payée. On ancre donc sur « Révision mesurée », unique dans le fichier.
 *  2. Le LIBELLÉ « Node · Apache · rsync · OS » répète les mots « Apache » et
 *     « rsync » : les garder dans le texte comparé aurait fait matcher le motif
 *     RSYNC sur le « v22.23.2 » de Node, le mot « rsync » du libellé le précédant.
 *     Mesuré, pas supposé : c'est la première exécution de cet essai qui l'a montré.
 */
function lignesEnvironnement() {
  const texte = readFileSync(README, 'utf8');
  const ancre = texte.indexOf('| Révision mesurée |');
  assert.notEqual(ancre, -1,
    'La ligne « Révision mesurée » du README §8 a disparu : le tableau d’environnement ' +
    'ne peut plus être borné dans le document.');
  // Fenêtre courte : les quatre lignes du tableau tiennent largement en dessous.
  const fenetre = texte.slice(ancre, ancre + 2000);
  const base = /\| Base \|([^\n]*)\|/.exec(fenetre);
  const outils = /\| Node · Apache · rsync · OS \|([^\n]*)\|/.exec(fenetre);
  assert.notEqual(base, null,
    'La ligne « Base » du tableau d’environnement (README §8) a disparu : plus rien n’y ' +
    'porte la version de PostgreSQL.');
  assert.notEqual(outils, null,
    'La ligne « Node · Apache · rsync · OS » du tableau d’environnement (README §8) a ' +
    'disparu, changé de libellé, ou changé d’ordre de colonnes.');
  return { base: base[1], outils: outils[1] };
}

/** Applique UN motif aux deux textes, et ÉCHOUE si l'un des deux ne capture rien. */
function comparerParLeMemeMotif(motif, texteReel, texteReadme, quoi) {
  const capturesReel = motif.exec(texteReel);
  const capturesReadme = motif.exec(texteReadme);
  assert.notEqual(capturesReel, null,
    `${quoi} : le motif de comparaison ne trouve plus rien dans la sortie RÉELLE de ` +
    `l’outil (« ${texteReel.slice(0, 200)} » …). L’outil a dû changer de format de sortie.`);
  assert.notEqual(capturesReadme, null,
    `${quoi} : le motif de comparaison ne trouve plus rien dans le README. La ligne a ` +
    'changé de forme sans que ce contrôle soit mis à jour avec elle.');
  assert.equal(capturesReadme[1], capturesReel[1],
    `${quoi} : le README annonce « ${capturesReadme[1]} », la machine qui joue CE banc ` +
    `rend « ${capturesReel[1]} ». C’est exactement la dérive du constat Q-77.`);
}

describe('L’ENVIRONNEMENT du README est celui qui tourne ICI, ou il rougit (constat Q-77)', () => {
  test('NODE : la version annoncée est celle qui exécute le banc EN CE MOMENT', async () => {
    // Pas de sous-processus à lancer : `process.version` EST la réponse, pour
    // l'interpréteur qui est, à cet instant précis, en train de jouer cet essai.
    const { outils } = lignesEnvironnement();
    const motif = /\*\*(v\d+\.\d+\.\d+)\*\*/;
    const trouve = motif.exec(outils);
    assert.notEqual(trouve, null,
      'La version de Node a disparu de la ligne d’environnement du README §8.');
    assert.equal(trouve[1], process.version,
      `Le README annonce Node ${trouve[1]}, et c’est ${process.version} qui exécute ce ` +
      'banc à l’instant même. Un chiffre qui ne se corrige pas tout seul (constat Q-77).');
  });

  test('APACHE : la version annoncée est celle installée sur CETTE machine', async () => {
    exigerOutil('apache2', ['-v'],
      'Ce contrôle confronte le README §8 à l’Apache réellement installé : sans lui, ' +
        'rien ne dit si le README décrit encore un conteneur qui n’existe plus (constat Q-77).');
    const { outils } = lignesEnvironnement();
    const sortie = execFileSync('apache2', ['-v'], { encoding: 'utf8' });
    comparerParLeMemeMotif(/Apache\/(\d+\.\d+\.\d+ \([^)]+\))/, sortie, outils, 'APACHE');
  });

  test('POSTGRESQL : la version annoncée est celle du client PSQL réellement installé', async () => {
    // Sur Debian, le paquet du client et celui du serveur PGDG partagent le même
    // numéro de version : interroger `psql --version` évite d’ouvrir une connexion
    // pour un contrôle qui n’a besoin que de lire un binaire (§2 bis : mesure et
    // comptage, pas de dépendance qui n’est pas nécessaire).
    exigerOutil('psql', ['--version'],
      'Ce contrôle confronte le README §8 au client PostgreSQL réellement installé ' +
        '(constat Q-77).');
    const { base } = lignesEnvironnement();
    const sortie = execFileSync('psql', ['--version'], { encoding: 'utf8' });
    comparerParLeMemeMotif(/(\d+\.\d+ \(Debian[^)]*\))/, sortie, base, 'POSTGRESQL');
  });

  test('RSYNC : la version annoncée est celle installée sur CETTE machine', async () => {
    exigerOutil('rsync', ['--version'],
      'Ce contrôle confronte le README §8 au rsync réellement installé (constat Q-77).');
    const { outils } = lignesEnvironnement();
    const sortie = execFileSync('rsync', ['--version'], { encoding: 'utf8' });
    comparerParLeMemeMotif(/rsync\D+(\d+\.\d+\.\d+)/, sortie, outils, 'RSYNC');
  });

  test('OS : le README documente la VM cible, pas un conteneur de développement', async () => {
    // Q-77 tient tout entier dans cette phrase : le lot `deploiement` a été validé sur
    // un système que la cible n’embarque pas. La distribution elle-même — pas
    // seulement les paquets qu’elle porte — doit donc être confrontée au réel.
    const { outils } = lignesEnvironnement();
    const osRelease = readFileSync('/etc/os-release', 'utf8');
    const trouve = /^PRETTY_NAME="([^"]+)"/m.exec(osRelease);
    assert.notEqual(trouve, null, '/etc/os-release ne porte plus de PRETTY_NAME sur cette machine.');
    assert.ok(outils.includes(trouve[1]),
      `Le README §8 ne cite pas « ${trouve[1]} » (le PRETTY_NAME de /etc/os-release sur ` +
      `cette machine) dans sa ligne d’environnement : ${outils.slice(0, 200)}…`);
  });
});
