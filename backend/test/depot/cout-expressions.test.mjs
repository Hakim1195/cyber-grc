/**
 * cout-expressions.test.mjs — **le coût d'une expression rationnelle se MESURE.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-216**, troisième passage de la porte S8
 * ════════════════════════════════════════════════════════════════════════
 *
 * Trois portes successives ont trouvé trois motifs à coût non borné dans le
 * MÊME fichier, chacune après un correctif qui déclarait la famille fermée :
 *
 *   · **Q-197** — cinq formes `<x>([\s\S]*?)</x>` ;
 *   · **Q-208** — deux autres, dont un `new RegExp` bâti sur le fichier ;
 *   · **Q-215** — une troisième, `<sheet\b([^>]*)\/?>`, LITTÉRALE.
 *
 * Après Q-215 j'ai posé un détecteur qui cherchait la forme dans le TEXTE du
 * motif. Le troisième passage a montré qu'il ne couvrait pas sa propre classe :
 *
 *   a) il ne connaissait qu'une **orthographe** de la classe négative.
 *      `[\s\S]*?` et `.*?` ne portent pas `[^`, et passaient — or c'est **la
 *      forme même du constat Q-197**. Un mutant qui la réintroduisait coûtait
 *      **931 octets → 2 625 ms**, et le banc entier restait vert ;
 *   b) son exonération d'ancre était posée **à la ligne**, pas à l'expression :
 *      un `/^` n'importe où disculpait tout. Cinq des neuf occurrences de `src/`
 *      passaient en silence, dont `pieces/clamav.ts` — **13 346 ms pour 3 204
 *      octets**, la plus coûteuse de tout l'arbre, deux mille fois plus chère
 *      que les quatre que le détecteur avait mesurées et admises.
 *
 * ── Pourquoi celui-ci est d'une autre nature ─────────────────────────────
 *
 * Il ne reconnaît rien. Il **extrait chaque expression de `src/`, la joue contre
 * des sujets hostiles, et la chronomètre**. Une orthographe nouvelle ne le
 * trompe pas, parce qu'il ne lit pas l'orthographe : il lit le temps.
 *
 * C'est la traduction littérale de ce que ce chantier répète depuis le début —
 * *le discriminant est la mesure* — appliquée au garde-fou lui-même, qui avait
 * échoué trois fois à être autre chose qu'une liste déguisée.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND } from '../aide/serveur.mjs';

const RACINE_SRC = join(RACINE_BACKEND, 'src');

/**
 * ── CE QU'ON MESURE, ET POURQUOI CE N'EST PAS UN TEMPS ───────────────────
 *
 * Un seuil de temps absolu ne sépare pas : à 2 000 signes, la forme de Q-197
 * coûte **0,9 ms**, sous n'importe quel seuil raisonnable, et elle est pourtant
 * quadratique. Monter la taille du sujet ne marche pas non plus — une forme
 * **exponentielle** (`(a+)+$`) ne rend jamais la main, et l'essai se fige au
 * lieu de rougir.
 *
 * Ce qui distingue une quadratique n'est pas son temps, c'est sa **croissance**.
 * On joue donc chaque expression à deux tailles et on lit le RAPPORT : ×3 de
 * sujet coûte ×3 à une expression linéaire, ×9 à une quadratique, et davantage
 * au-delà. Le plancher de temps évite d'accuser le bruit de mesure.
 */
const RAPPORT_MAX = 5;
/** En deçà, c'est du bruit : on ne conclut pas d'un rapport entre deux poussières. */
const PLANCHER_MS = 1;
/** Et un garde-fou brutal, pour les formes qui explosent dès la petite taille. */
const PLAFOND_MS = 200;

function fichiersTs(repertoire, resultat = []) {
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) fichiersTs(chemin, resultat);
    else if (entree.name.endsWith('.ts')) resultat.push(chemin);
  }
  return resultat;
}

function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, (bloc) => '\n'.repeat((bloc.match(/\n/gu) ?? []).length))
    .replace(/(^|[^:])\/\/[^\n]*/gu, '$1')
    .replace(/^\s*\*.*$/gmu, '');
}

/** Une expression littérale, précédée de rien qui ferait d'elle une division. */
const MOTIF_LITTERAL =
  /(?<![\w)\]$])\/(?![/*\s])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n\[])+)\/([gimsuyd]*)/gu;

/** Toutes les expressions de `src/` qui portent un quantificateur non borné. */
function expressionsDeSrc() {
  const trouvees = [];
  for (const chemin of fichiersTs(RACINE_SRC)) {
    const relatif = relative(RACINE_SRC, chemin).split('\\').join('/');
    sansCommentaires(readFileSync(chemin, 'utf8'))
      .split('\n')
      .forEach((ligne, index) => {
        for (const m of ligne.matchAll(MOTIF_LITTERAL)) {
          const [, corps, drapeaux] = m;
          // Un quantificateur BORNÉ (`{2}`, `{1,64}`) ne rebrousse pas sans fin.
          if (!/[*+]|\{\d+,\}/u.test(corps)) continue;
          trouvees.push({
            ou: `${relatif}:${String(index + 1)}`,
            corps,
            drapeaux: drapeaux.replace(/[gy]/gu, ''),
          });
        }
      });
  }
  return trouvees;
}

/**
 * Familles de sujets hostiles, **chacune avec sa propre échelle**.
 *
 * ⚠️ Une échelle unique ne peut pas marcher, et c'est le piège de ce contrôle :
 *
 *   · une **quadratique** ne se voit qu'à quelques milliers de signes — à vingt
 *     elle est indiscernable du bruit ;
 *   · une **exponentielle** ne rend jamais la main à quelques milliers — elle
 *     se voit à **vingt**, et l'essayer plus grand fige le banc au lieu de le
 *     faire rougir.
 *
 * Chaque famille porte donc le couple de tailles où SA forme se manifeste, et
 * l'on lit le rapport à l'intérieur d'une famille, jamais entre familles.
 */
function famillesHostiles(corps) {
  const signes = new Set([' ', 'a', '0', '<', ':', '"']);
  for (const c of corps.replace(/\\./gu, '').match(/[A-Za-z0-9<>:;"'@/&.,=_-]/gu) ?? []) {
    signes.add(c);
  }

  const familles = [];

  // ── 1. Répétitions simples : la forme quadratique, qui balaie et rebrousse.
  for (const c of signes) {
    familles.push({ tailles: [1000, 3000], faire: (n) => c.repeat(n) });
  }
  familles.push({ tailles: [1000, 3000], faire: (n) => `a: ${' '.repeat(n)}x` });
  familles.push({ tailles: [1000, 3000], faire: (n) => `<x ${'a'.repeat(n)}` });
  familles.push({ tailles: [1000, 3000], faire: (n) => `https://${'a'.repeat(n)}` });

  /* ── 2. Les morceaux LITTÉRAUX du motif, répétés — et c'est la moitié sans
     laquelle ce contrôle ne verrait pas Q-197. `<x>([\s\S]*?)</x>` n'est lent
     que sur une suite de `<x>` QUE RIEN NE REFERME : chaque ouverture lance un
     balayage jusqu'au bout, en vain. Aucune répétition d'un signe isolé ne
     produit cette forme ; le sujet doit être bâti à partir du motif lui-même. */
  const morceaux = corps
    .split(/[[\](){}|?*+^$\\]/u)
    .filter((morceau) => morceau.length >= 2)
    .slice(0, 3);
  for (const morceau of morceaux) {
    familles.push({
      tailles: [1000, 3000],
      faire: (n) => morceau.repeat(Math.max(1, Math.floor(n / morceau.length))),
    });
  }

  /* ── 3. Une répétition SUIVIE D'UN SIGNE ÉTRANGER : la forme d'école de
     l'explosion combinatoire. `(a+)+$` sur « aaa…a » TROUVE et rend la main
     aussitôt ; c'est « aaa…a! » qui explose, parce que l'échec final oblige à
     réessayer tous les découpages. ⚠️ Les tailles sont MINUSCULES à dessein :
     à vingt signes une exponentielle est déjà mesurable, à mille elle ne rend
     jamais la main. */
  for (const c of signes) {
    familles.push({ tailles: [18, 23], faire: (n) => `${c.repeat(n)}!` });
  }

  return familles;
}

/** Temps d'un `exec`, en millisecondes. */
function chronometrer(re, sujet) {
  const debut = process.hrtime.bigint();
  try {
    re.exec(sujet);
  } catch {
    /* un motif qui refuse un sujet ne coûte rien : c'est le TEMPS qu'on lit */
  }
  return Number(process.hrtime.bigint() - debut) / 1e6;
}

/**
 * Pire croissance observée : le sujet qui fait le plus mal grandir l'expression,
 * et de combien.
 *
 * ⚠️ Le PLAFOND n'est pas une commodité. Une forme **exponentielle** ne rend
 * jamais la main : l'essayer à la grande taille figerait l'essai au lieu de le
 * faire rougir, et un essai qui se fige est un essai qu'on finit par retirer.
 * Dès que la petite taille dépasse le plafond, on conclut sans aller plus loin.
 */
function pireCroissance({ corps, drapeaux }) {
  let re;
  try {
    re = new RegExp(corps, drapeaux);
  } catch {
    return { rapport: 1, grand: 0, sujet: '(motif non compilable isolément)' };
  }
  let pire = { rapport: 1, grand: 0, sujet: '' };
  for (const { tailles, faire } of famillesHostiles(corps)) {
    const sujetPetit = faire(tailles[0]);
    const sujetGrand = faire(tailles[1]);
    const petit = chronometrer(re, sujetPetit);
    // Elle explose déjà à la petite taille : conclure sans aller plus loin.
    if (petit > PLAFOND_MS) {
      return {
        rapport: Infinity,
        grand: petit,
        sujet: `« ${sujetPetit.slice(0, 10)}… » (${String(sujetPetit.length)} signes)`,
      };
    }
    const grand = chronometrer(re, sujetGrand);
    const rapport = grand / Math.max(petit, 0.01);
    if (grand > PLANCHER_MS && rapport > pire.rapport) {
      pire = {
        rapport,
        grand,
        sujet: `« ${sujetGrand.slice(0, 10)}… » (${String(sujetGrand.length)} signes)`,
      };
    }
  }
  return pire;
}

describe('Q-216 — aucune expression de `src/` ne coûte plus qu’un temps borné', () => {
  const expressions = expressionsDeSrc();

  test('LA MATIÈRE : le balayage trouve bien les expressions du produit', () => {
    // Sans elle, un extracteur cassé rendrait cet essai vert en ne mesurant rien
    // — le vert le plus cher de ce chantier.
    assert.ok(
      expressions.length >= 30,
      `Seulement ${String(expressions.length)} expression(s) extraite(s) de src/ : ` +
        'l’extracteur ne reconnaît plus les motifs, et tout ce qui suit serait creux.',
    );
  });

  test('AUCUNE ne grandit plus vite que son entrée, sur des sujets tirés d’elle-même', () => {
    const lentes = [];
    for (const expression of expressions) {
      const { rapport, grand, sujet } = pireCroissance(expression);
      if (rapport > RAPPORT_MAX) {
        lentes.push(
          `${expression.ou}  l’entrée grandit et le temps coûte ×${rapport.toFixed(1)} de temps ` +
            `(${grand.toFixed(1)} ms sur ${sujet})  ${expression.corps}`,
        );
      }
    }
    assert.deepEqual(
      lentes,
      [],
      'Ces expressions rebroussent : leur coût croît plus vite que leur entrée. Sur un ' +
        'serveur mono-fil, une seule requête gèle tout le produit — ni /api/sante, ni la ' +
        'connexion à l’annuaire, ni les dix-neuf autres filiales.\n' +
        lentes.map((l) => `    · ${l}`).join('\n') +
        '\nRemplacez par un balayage (`indexOf`, une boucle) : ces formes se lisent en une ' +
        'passe. N’ancrez pas « pour corriger » — l’ancre ne retient pas l’ambiguïté entre ' +
        'deux quantificateurs voisins, et c’est précisément ce qui a masqué Q-216.',
    );
  });

  test('LE CONTRÔLE MORD — sur les QUATRE formes trouvées par les portes successives', () => {
    /* Chacune a été mesurée par un auditeur, et chacune aurait dû faire rougir
       un garde-fou qui n'existait pas encore ou regardait ailleurs. */
    const formes = [
      { corps: '<x>([\\s\\S]*?)</x>', quoi: 'Q-197 — l’alternative appariée' },
      { corps: '<sheet\\b([^>]*)\\/?>', quoi: 'Q-215 — la classe négative littérale' },
      { corps: '^\\s*[^:]*:\\s*(.+?)\\s+FOUND$', quoi: 'Q-216 — l’ambiguïté SOUS une ancre' },
      { corps: '(a+)+$', quoi: 'la forme d’école, pour le témoin' },
    ];
    for (const { corps, quoi } of formes) {
      const { rapport } = pireCroissance({ corps, drapeaux: 'u' });
      assert.ok(
        rapport > RAPPORT_MAX,
        `${quoi} : croissance ×${rapport.toFixed(1)} pour ×3 d’entrée, sous le rapport de ` +
          `×${String(RAPPORT_MAX)}. Le détecteur ne la verrait pas — or elle a fait refuser ` +
          'une porte.',
      );
    }
  });

  test('IL N’ACCUSE PAS À TORT — les formes saines du produit passent', () => {
    // Un contrôle qui accuse à tort finit désarmé, et c'est arrivé sur ce
    // chantier. Ces quatre formes VIVENT dans `src/` et doivent rester admises.
    for (const corps of [
      '&(#x[0-9a-f]+|#\\d+|[a-z]+);',
      '^([A-Z]+)',
      '^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ].*)?$',
      ';\\s*boundary\\s*=\\s*("([^"]+)"|([^;\\s]+))',
    ]) {
      const { rapport } = pireCroissance({ corps, drapeaux: 'u' });
      assert.ok(
        rapport <= RAPPORT_MAX,
        `« ${corps} » accusée à tort : croissance ×${rapport.toFixed(1)}.`,
      );
    }
  });
});
