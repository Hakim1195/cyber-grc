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
import { readFileSync } from 'node:fs';
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
