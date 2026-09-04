/**
 * registre.test.mjs — le registre des constats ne perd pas de constat.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Constat **Q-47**. Le tableau « Registre des constats ouverts » de
 * `docs/PLAN_EXECUTION.md` §7 a porté **treize barres sur une ligne au lieu de
 * sept** : deux constats s'étaient collés, le tableau rendait **42 lignes au
 * lieu de 43**, et l'absent était **le seul bloquant du sixième passage**. La
 * cause était une substitution automatique, faite en fermant le constat qui
 * disait précisément *qu'une case d'état vide passe inaperçue*.
 *
 * Le `CLAUDE.md` §8 désigne ce tableau comme **« la seule source des verdicts »**
 * et ordonne d'y lire la colonne d'état. Un lecteur de la vague suivante ne
 * cherchera pas ce qui n'y figure pas : une ligne perdue est un constat perdu,
 * et c'est exactement ce que ce registre reproche au reste du dépôt.
 *
 * ── Ce que ce fichier NE fait pas ────────────────────────────────────────────
 *
 * Il ne juge **aucun contenu** : ni la gravité, ni la justesse d'un état, ni le
 * nombre de constats attendus. Il n'a rien à dire sur ce que le registre
 * raconte. Il tient sa **forme**, et seulement ce qui, dans cette forme, fait
 * qu'un constat peut disparaître sans un mot :
 *
 *   1. chaque ligne porte exactement sept barres — six colonnes ;
 *   2. la numérotation est continue, de 1 au maximum, et sans doublon ;
 *   3. la case « Propriétaire » et la case « État » ne sont jamais vides.
 *
 * Le `CONVENTIONS.md` §24 dit qu'une liste écrite à la main est le bon outil
 * **quand un contrôle la confronte au réel**. Ce tableau-ci était la liste ; il
 * n'avait pas son contrôle.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

const PLAN = join(RACINE_BACKEND, '..', 'docs', 'PLAN_EXECUTION.md');
const TITRE = '### Registre des constats ouverts';

/**
 * Les lignes de constat du registre, telles qu'un lecteur de Markdown les voit.
 *
 * ── Pourquoi compter les barres NON ÉCHAPPÉES ───────────────────────────────
 *
 * Une barre nue à l'intérieur d'une cellule — fût-elle dans un `code` — est un
 * séparateur de colonne pour tout rendu Markdown. C'est le second défaut du
 * constat Q-47 : une barre non échappée avait décalé la colonne d'état d'un
 * constat, qui se lisait donc sur la mauvaise valeur. On compte donc ce que le
 * rendu compte, et non ce que l'auteur croyait écrire.
 */
function lignesDuRegistre() {
  const source = readFileSync(PLAN, 'utf8');
  const debut = source.indexOf(TITRE);
  assert.notEqual(
    debut,
    -1,
    `La section « ${TITRE} » a disparu de docs/PLAN_EXECUTION.md. Le CLAUDE.md §8 la ` +
      'désigne comme la seule source des verdicts : ce banc refuse de deviner où elle est ' +
      'passée.',
  );
  // La section suivante de même niveau borne le tableau.
  const apres = source.indexOf('\n### ', debut + TITRE.length);
  const section = source.slice(debut, apres === -1 ? source.length : apres);

  const lignes = section
    .split('\n')
    .map((texte, rang) => ({ texte: texte.trim(), rang }))
    .filter(({ texte }) => /^\|\s*\*\*Q-/.test(texte));

  assert.ok(
    lignes.length >= 40,
    `Seulement ${String(lignes.length)} ligne(s) de constat trouvée(s) : le tableau a changé ` +
      'de forme, ou il vient d’en perdre — ce qui est le constat Q-47 lui-même.',
  );
  return lignes.map(({ texte }) => ({
    texte,
    // Les barres que le RENDU voit : celles qui ne sont pas échappées.
    barres: (texte.match(/(?<!\\)\|/g) ?? []).length,
    // Découpage sur ces mêmes barres, pour lire les cellules comme lui.
    cellules: texte
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((c) => c.trim()),
  }));
}

describe('Le registre des constats ne peut pas en perdre un (constat Q-47)', () => {
  // ── AJOUTÉ LE 04/09/2026, après que ce garde-fou eut laissé passer ────
  //
  // Un script de maintenance du registre s'est trompé d'un indice de colonne :
  // il a écrit l'échéance PAR-DESSUS l'état de quatre constats, et le texte du
  // nouvel état APRÈS la dernière barre. Sept lignes abîmées, dont quatre dont
  // l'état — « documenté, non fermé », « coche retirée » — a purement disparu.
  //
  // ⚠️ **Ce fichier est passé au vert.** Il comptait les BARRES : `| a | b |` en
  // porte trois, et `| a | b | c` aussi, le texte ajouté après la dernière
  // n'étant pas une cellule. La ligne restait donc « à sept barres », et la case
  // d'état, écrasée par « `V1.1` », n'était pas vide non plus.
  //
  // C'est le motif que ce chantier traque : *un contrôle qui mesure autre chose
  // que ce qu'il prétend mesurer rend le même vert qu'un contrôle qui a tout vu.*
  // Il compte désormais les CELLULES, et refuse ce qui traîne après la dernière
  // barre — un tableau Markdown n'a rien à porter là.
  test('RIEN APRÈS LA DERNIÈRE BARRE : une cellule ne se décale pas en silence', async () => {
    const fautives = lignesDuRegistre()
      .filter((l) => !/\|\s*$/.test(l.texte))
      .map((l) => `finit hors tableau : …${l.texte.slice(-90)}`);

    assert.deepEqual(
      fautives,
      [],
      'Ces lignes portent du texte APRÈS leur dernière barre. Markdown l’ignore : la ' +
        'colonne concernée disparaît du rendu, et le contenu qu’elle devait porter avec ' +
        'elle. C’est ainsi qu’un script d’édition décalé d’un indice efface un état sans ' +
        'que rien ne rougisse.\n' +
        fautives.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('SEPT BARRES par ligne : deux constats ne peuvent pas se coller', async () => {
    // ── Le défaut, exactement ──────────────────────────────────────────────
    // Treize barres sur une ligne : deux constats dans une seule, dont un
    // devenait invisible. Aucun rendu ne s’en plaint — le tableau s’affiche,
    // simplement plus court d’une ligne.
    const fautives = lignesDuRegistre()
      .filter((l) => l.barres !== 7)
      .map((l) => `${String(l.barres)} barres : ${l.texte.slice(0, 110)}…`);

    assert.deepEqual(
      fautives,
      [],
      'Ces lignes du registre ne portent pas six colonnes. Une ligne à treize barres est DEUX ' +
        'constats collés — le second disparaît du tableau sans un mot, et personne ne le ' +
        'cherchera (constat Q-47). Une barre à l’intérieur d’une cellule doit s’écrire « \\| », ' +
        'y compris dans un `code`.\n' +
        fautives.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('LA NUMÉROTATION est continue et sans doublon', async () => {
    // Sept barres partout ne suffit pas : une ligne entièrement supprimée les
    // laisse toutes conformes. C'est la suite des numéros qui le voit.
    const numeros = lignesDuRegistre().map((l) => {
      const trouve = /^\|\s*\*\*Q-(\d+)\*\*/.exec(l.texte);
      assert.notEqual(trouve, null, `Ligne sans numéro lisible : ${l.texte.slice(0, 110)}…`);
      return Number(trouve[1]);
    });

    const manquants = [];
    for (let n = 1; n <= Math.max(...numeros); n += 1) {
      if (!numeros.includes(n)) manquants.push(`Q-${String(n)}`);
    }
    assert.deepEqual(
      manquants,
      [],
      `Ces constats sont absents du registre alors que la numérotation va jusqu’à ` +
        `Q-${String(Math.max(...numeros))} : ${manquants.join(', ')}. C’est ainsi que Q-29 — ` +
        'le seul bloquant du 6ᵉ passage — avait disparu (constat Q-47).',
    );

    const doublons = numeros.filter((n, i) => numeros.indexOf(n) !== i);
    assert.deepEqual(doublons, [], `Numéros en double : ${doublons.join(', ')}.`);
    assert.equal(
      numeros.length,
      Math.max(...numeros),
      `Le registre porte ${String(numeros.length)} lignes pour une numérotation qui va jusqu’à ` +
        `${String(Math.max(...numeros))} : un constat manque ou un numéro est en trop.`,
    );
    // Contrôle de matière : la lecture doit voir un registre PLEIN, sinon les
    // deux assertions ci-dessus seraient vraies d’une liste vide.
    assert.ok(numeros.length >= 40, `Registre suspect : ${String(numeros.length)} constat(s).`);
  });

  test('AUCUNE CASE de propriétaire ou d’état n’est vide', async () => {
    // ── Le constat Q-40, rendu mécanique ───────────────────────────────────
    // « Un constat sans état est un constat qu'on ne sait pas lire. » Il avait
    // été fermé à la main ; le fermer à la main est ce qui a produit Q-47.
    const COLONNES = ['#', 'Constat', 'Gravité', 'Propriétaire', 'Échéance', 'État'];
    const vides = [];
    for (const ligne of lignesDuRegistre()) {
      assert.equal(
        ligne.cellules.length,
        COLONNES.length,
        `Ligne à ${String(ligne.cellules.length)} cellules : ${ligne.texte.slice(0, 110)}…`,
      );
      for (const nom of ['Propriétaire', 'État']) {
        const valeur = ligne.cellules[COLONNES.indexOf(nom)];
        if (valeur === '') vides.push(`${ligne.cellules[0]} : « ${nom} » vide`);
      }
    }
    assert.deepEqual(
      vides,
      [],
      'Un constat sans propriétaire est un constat perdu ; un constat sans état est un constat ' +
        'qu’on ne sait pas lire (constats Q-40 et Q-47).\n' +
        vides.map((v) => `    · ${v}`).join('\n'),
    );
  });

  test('L’EN-TÊTE du tableau est celui que ce contrôle croit lire', async () => {
    // ── La moitié sans laquelle les trois autres se mesurent elles-mêmes ────
    //
    // Tout ce qui précède compte des colonnes par leur RANG. Si l'ordre des
    // colonnes change, « Propriétaire » et « État » seraient lus ailleurs, et
    // les essais resteraient verts en regardant les mauvaises cases — la
    // seconde moitié du constat Q-47, exactement.
    const source = readFileSync(PLAN, 'utf8');
    const debut = source.indexOf(TITRE);
    const entete = source
      .slice(debut)
      .split('\n')
      .find((l) => l.trim().startsWith('| # |'));

    assert.notEqual(entete, undefined, 'Le tableau du registre n’a plus d’en-tête « | # | ».');
    assert.deepEqual(
      entete
        .trim()
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((c) => c.trim()),
      ['#', 'Constat', 'Gravité', 'Propriétaire', 'Échéance', 'État'],
      'Les colonnes du registre ont changé d’ordre ou de nom : ce contrôle lisait les cases ' +
        'par leur rang, et il les lirait désormais au mauvais endroit. Mettre à jour COLONNES ' +
        'dans cet essai, dans le même changement.',
    );
  });
});

/* =====================================================================
 *  La TRONCATURE, que le comptage ne voit pas (constat Q-54)
 * ===================================================================== */

/** La racine du dépôt — `backend/` en est un sous-répertoire. */
const RACINE_DEPOT = join(RACINE_BACKEND, '..');

/**
 * Tous les constats nommés AILLEURS que dans le registre.
 *
 * ── Pourquoi le comptage ne suffisait pas ───────────────────────────────────
 *
 * Les trois contrôles ci-dessus tiennent la forme d'une ligne et la continuité
 * de la numérotation. Ils sont **aveugles à une troncature de queue** : ôtez les
 * treize dernières lignes et le maximum descend avec le compte — 50 lignes,
 * numérotées 1 à 50, sans trou. Tout est cohérent, et cinq majeurs ont disparu.
 * C'est le constat **Q-54**, et il vise ce fichier même, écrit le jour d'avant
 * pour qu'aucun constat ne se perde.
 *
 * ── La propriété qui tient, et qui n'est pas un annuaire ────────────────────
 *
 * Le nombre de lignes n'est pas une propriété : le registre grandit. Mais
 * **tout constat qu'un rapport de porte nomme doit avoir sa ligne**. Les deux
 * termes sortent de deux endroits versionnés — les rapports d'un côté, le
 * registre de l'autre — et aucun n'est recopié dans un troisième. Un registre
 * tronqué perd des lignes que les rapports, eux, continuent de nommer.
 */
function constatsNommesAilleurs() {
  const textes = [];
  const ajouter = (chemin) => textes.push([chemin, readFileSync(join(RACINE_DEPOT, chemin), 'utf8')]);

  const securite = join(RACINE_DEPOT, 'docs', 'securite');
  for (const nom of readdirSync(securite)) {
    if (nom.endsWith('.md')) ajouter(join('docs', 'securite', nom));
  }
  ajouter('CLAUDE.md');
  // Le PLAN lui-même, mais AMPUTÉ de la section du registre : sinon le tableau
  // se justifierait lui-même, et la comparaison ne comparerait rien.
  const plan = readFileSync(PLAN, 'utf8');
  const debut = plan.indexOf(TITRE);
  textes.push(['docs/PLAN_EXECUTION.md (hors registre)', plan.slice(0, debut)]);

  const nommes = new Map();
  for (const [chemin, texte] of textes) {
    for (const trouve of texte.matchAll(/\bQ-(\d+)\b/g)) {
      const numero = Number(trouve[1]);
      if (!nommes.has(numero)) nommes.set(numero, chemin);
    }
  }
  return nommes;
}

describe('Le registre ne peut pas être TRONQUÉ en silence (constat Q-54)', () => {
  test('TOUT CONSTAT NOMMÉ dans un rapport de porte a sa ligne au registre', async () => {
    const numeros = new Set(
      lignesDuRegistre().map((l) => Number(/^\|\s*\*\*Q-(\d+)\*\*/.exec(l.texte)[1])),
    );
    const nommes = constatsNommesAilleurs();

    // ── Le balayage doit avoir VU quelque chose ────────────────────────
    // « Aucun absent » est aussi ce que rend une lecture qui n'a trouvé aucun
    // constat. Le plancher est mesuré, pas choisi : le seul dernier rapport en
    // nomme plus de soixante.
    assert.ok(
      nommes.size >= 40,
      `Seulement ${String(nommes.size)} constat(s) nommé(s) hors du registre : les rapports de ` +
        'porte ne sont plus lus, et « aucun absent » ne voudrait rien dire.',
    );

    const absents = [...nommes.entries()]
      .filter(([numero]) => !numeros.has(numero))
      .sort((a, b) => a[0] - b[0])
      .map(([numero, ou]) => `Q-${String(numero)} — nommé dans ${ou}, absent du registre`);

    assert.deepEqual(
      absents,
      [],
      'Ces constats sont nommés dans un rapport de porte et n’ont AUCUNE ligne au registre. ' +
        'Le registre existe pour qu’aucun constat ne se perde, et le CLAUDE.md §8 en fait « la ' +
        'seule source des verdicts » : un lecteur de la vague suivante ne cherchera pas ce qui ' +
        'n’y figure pas.\n' +
        absents.map((a) => `    · ${a}`).join('\n') +
        '\n\n  ⚠️ La continuité de la numérotation NE VOIT PAS ce cas : une queue tronquée ' +
        'laisse un tableau de 1 à N, sans trou, parfaitement cohérent — et cinq majeurs en ' +
        'moins (constat Q-54).',
    );
  });

  test('LE REGISTRE NE FINIT PAS SUR SA DERNIÈRE LIGNE : la section se referme', async () => {
    // ── L'autre moitié de la troncature ────────────────────────────────
    //
    // La précédente voit des LIGNES retirées ; celle-ci voit le FICHIER coupé.
    // Un document arrêté net sur une ligne de tableau ne se distingue d’un
    // document complet par aucun comptage — mais la section du registre se
    // referme sur des arbitrages écrits, et leur disparition se voit.
    const source = readFileSync(PLAN, 'utf8');
    const debut = source.indexOf(TITRE);
    assert.notEqual(debut, -1, `La section « ${TITRE} » a disparu.`);
    const section = source.slice(debut);
    const lignes = section.split('\n').map((l) => l.trim());
    const dernierRang = lignes.reduce((rang, l, i) => (/^\|\s*\*\*Q-/.test(l) ? i : rang), -1);
    assert.notEqual(dernierRang, -1, 'Le registre ne porte plus aucune ligne de constat.');

    const apres = lignes.slice(dernierRang + 1).filter((l) => l !== '');
    assert.ok(
      apres.length >= 3,
      `Le registre s’arrête sur sa dernière ligne : il ne reste que ${String(apres.length)} ` +
        'ligne(s) après elle. Un fichier coupé net sur un tableau ne se distingue d’un fichier ' +
        'complet par aucun comptage — et ce qui manque est justement ce qui vient après, ' +
        'arbitrages compris (constat Q-54).',
    );
    assert.equal(
      /^\|/.test(lignes[lignes.length - 1] === '' ? apres[apres.length - 1] : lignes[lignes.length - 1]),
      false,
      'Le document se termine sur une ligne de tableau : la section ne se referme pas.',
    );
  });
});
