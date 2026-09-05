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

/**
 * Retire les commentaires — **prudemment**, constat **Q-220 (b)**.
 *
 * ⚠️ La rédaction précédente effaçait tout ce qui suit `//` sur une ligne. Un
 * `'//'` **dans un littéral de chaîne** — la chose la plus banale du monde dès
 * qu'on manipule une URL — effaçait donc la fin de la ligne, **expression
 * comprise**. L'auditeur a posé un motif à 12 242 ms derrière un `split('//')`
 * et le contrôle n'a rien vu.
 *
 * La parade est de ne pas trancher quand on n'est pas sûr : si un guillemet
 * précède le `//` sur la ligne, on **garde la ligne entière**. Le prix est
 * qu'une expression mise en commentaire derrière une chaîne pourra être
 * examinée — un faux positif BRUYANT, que son auteur lève en supprimant le
 * commentaire. Le prix inverse était un défaut silencieux.
 */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, (bloc) => '\n'.repeat((bloc.match(/\n/gu) ?? []).length))
    .split('\n')
    .map((ligne) => {
      const commentaire = ligne.indexOf('//');
      if (commentaire < 0) return ligne;
      const amont = ligne.slice(0, commentaire);
      if (amont.endsWith(':')) return ligne;
      if (/['"`]/u.test(amont)) return ligne;
      return amont;
    })
    .join('\n')
    .replace(/^\s*\*.*$/gmu, '');
}

/**
 * Neutralise le CONTENU des chaînes simples et doubles — constat **Q-220 (b)**.
 *
 * ⚠️ Sans cela, un `'//'` dans une chaîne — une URL, un séparateur de chemin —
 * fait s'accrocher l'extracteur au **second** `/`, qui avale alors tout jusqu'au
 * `/` suivant : **la vraie expression de la ligne**. Mesuré sur la ligne que
 * l'auditeur a posée, l'extracteur rendait « `)[1] ?? v; const _motif =` » au
 * lieu du motif à 10 582 ms qui la suivait.
 *
 * Les guillemets et la longueur sont conservés : ce qui est examiné garde ses
 * colonnes, et un message d'erreur désigne toujours la bonne place. Les gabarits
 * (accent grave) sont laissés tels quels — une expression peut vivre dans un
 * `${…}`, et les aveugler créerait le trou qu'on vient de fermer.
 */
function sansChaines(source) {
  let dehors = '';
  let delimiteur = null;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (delimiteur === null) {
      if (c === "'" || c === '"') delimiteur = c;
      dehors += c;
      continue;
    }
    if (c === '\\') {
      dehors += '  ';
      i += 1;
      continue;
    }
    if (c === delimiteur) {
      delimiteur = null;
      dehors += c;
      continue;
    }
    // Une fin de ligne referme une chaîne mal formée : on ne l'emporte pas.
    dehors += c === '\n' ? ((delimiteur = null), '\n') : ' ';
  }
  return dehors;
}

/** Une expression littérale, précédée de rien qui ferait d'elle une division. */
const MOTIF_LITTERAL =
  /(?<![\w)\]$/])\/(?![/*\s])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n\[])+)\/([gimsuyd]*)/gu;

/** Toutes les expressions de `src/` qui portent un quantificateur non borné. */
function expressionsDeSrc() {
  const trouvees = [];
  for (const chemin of fichiersTs(RACINE_SRC)) {
    const relatif = relative(RACINE_SRC, chemin).split('\\').join('/');
    sansChaines(sansCommentaires(readFileSync(chemin, 'utf8')))
      /* ⚠️ `return/^…$/` — sans espace — n'était pas extrait : la sentinelle
         arrière prenait le « n » de `return` pour un identifiant, donc le `/`
         pour une division (constat Q-220 b). Un mot-clé ne peut pas être suivi
         d'une division ; on insère l'espace qui manque, plutôt que de compliquer
         la sentinelle — un motif de plus à tenir juste est un motif de plus à
         se tromper. */
      .replace(
        /\b(return|typeof|case|do|else|void|delete|instanceof|throw|yield|await|in|of)\//gu,
        '$1 /',
      )
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
/**
 * Les suites de signes ORDINAIRES d'un motif — son préfixe littéral, et ce qu'il
 * cherche à refermer.
 *
 * ⚠️ C'est de là que doivent venir les sujets hostiles. Un sujet écrit en dur ne
 * vaut que pour le motif qu'on avait sous les yeux en l'écrivant : c'est le
 * constat Q-220, et c'est la quatrième fois que cette famille passe sous un
 * garde-fou.
 */
function morceauxLitteraux(corps) {
  return corps
    .split(/[[\](){}|?*+^$\\]/u)
    .filter((morceau) => morceau.length >= 2)
    .slice(0, 4);
}

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

  /* ⚠️ LE PRÉFIXE SE DÉRIVE DU MOTIF, IL NE S'INVENTE PAS — constat **Q-220**.
     Cette liste portait des sujets ÉCRITS EN DUR : `a: <espaces>x`, `<x <a…>`,
     `https://<a…>`. Ils ne valaient que pour les trois motifs déjà trouvés.
     L'auditeur du quatrième passage a réécrit la ligne de `clamav.ts` de la
     façon la plus naturelle qui soit — avec son VRAI préfixe,
     `/^stream:\s*(.+?)\s+FOUND$/u` — et elle coûtait **9 130 ms pour 3 000
     signes** pendant que ce contrôle rendait quatre essais, quatre passés.
     Mesuré côte à côte : le même motif, avec le préfixe `a: ` que je fabriquais,
     coûte **0,005 ms**. Le sujet ne l'atteignait tout simplement pas.

     C'est la QUATRIÈME fois que cette famille passe sous un garde-fou censé
     l'arrêter, et toujours pour le même motif de fond : quelque chose de
     PARTICULIER là où il fallait quelque chose de GÉNÉRAL. */
  for (const morceau of morceauxLitteraux(corps)) {
    // Le préfixe suivi d'espaces : c'est la forme qui met en concurrence deux
    // quantificateurs voisins (`\s*` et `(.+?)\s+`) sur les mêmes signes.
    familles.push({ tailles: [1000, 3000], faire: (n) => `${morceau}${' '.repeat(n)}x` });
    // Et le préfixe suivi de remplissage : la forme qui balaie sans trouver.
    familles.push({ tailles: [1000, 3000], faire: (n) => `${morceau}${'a'.repeat(n)}` });
  }

  /* ⚠️ ET LE MÊME, SUR UN SEUL SIGNE. Un motif comme « ^\s*[^;]*;\s*(.+?)\s+fin$ »
     n'a aucune suite littérale de deux signes avant son ambiguïté : ce qu'il faut
     pour l'atteindre est **un point-virgule, puis des espaces**. Les morceaux ne
     le produisent pas, et l'auditeur du quatrième passage a posé exactement cette
     forme — 12 242 ms — sans que le contrôle bouge.

     La recette générale vaut d'être dite : *franchir le premier ancrage, puis
     nourrir l'ambiguïté*. Le premier ancrage se franchit avec UN signe du motif ;
     l'ambiguïté se nourrit d'espaces. */
  for (const c of signes) {
    familles.push({ tailles: [1000, 3000], faire: (n) => `${c}${' '.repeat(n)}x` });
  }

  /* ── 2. Les morceaux LITTÉRAUX du motif, répétés — et c'est la moitié sans
     laquelle ce contrôle ne verrait pas Q-197. `<x>([\s\S]*?)</x>` n'est lent
     que sur une suite de `<x>` QUE RIEN NE REFERME : chaque ouverture lance un
     balayage jusqu'au bout, en vain. Aucune répétition d'un signe isolé ne
     produit cette forme ; le sujet doit être bâti à partir du motif lui-même. */
  for (const morceau of morceauxLitteraux(corps)) {
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

  /**
   * Les `new RegExp` de `src/` qui sont admis, **avec leur mesure**.
   *
   * ⚠️ Cet interdit balayait tout `src/` jusqu'au correctif de Q-216, qui l'a
   * **rétréci à un seul fichier** en affirmant que « les deux contrôles couvrent
   * deux moitiés disjointes ». C'était faux : la moitié « expression construite »
   * ne faisait plus qu'un fichier de large, et la MESURE ne peut rien pour elle —
   * le motif d'une expression construite n'existe qu'à l'exécution, il n'y a rien
   * à extraire ni à chronométrer. Constat **Q-220 (c)**.
   *
   * Chaque exemption porte un chiffre, pas une opinion.
   */
  const CONSTRUCTIONS_ADMISES = Object.freeze({
    'pieces/multipart.ts':
      'nom de parametre LITTERAL aux deux sites d appel (name, filename) et sujet borne a ' +
      '8 Kio par MAX_ENTETES_OCTETS — mesure 0,2 ms a la borne, 0,4 ms a huit fois',
  });

  test('AUCUN `new RegExp` dans `src/` qui ne soit mesuré et admis', () => {
    const inattendus = [];
    for (const chemin of fichiersTs(RACINE_SRC)) {
      const relatif = relative(RACINE_SRC, chemin).split('\\').join('/');
      const source = sansChaines(sansCommentaires(readFileSync(chemin, 'utf8')));
      const lignes = source
        .split('\n')
        .map((ligne, i) => [i + 1, ligne])
        .filter(([, ligne]) => ligne.includes('new RegExp'));
      if (lignes.length > 0 && !Object.hasOwn(CONSTRUCTIONS_ADMISES, relatif)) {
        inattendus.push(`${relatif}:${String(lignes[0][0])}  ${lignes[0][1].trim().slice(0, 90)}`);
      }
    }
    assert.deepEqual(
      inattendus,
      [],
      'Une expression CONSTRUITE laisse un octet d entree devenir un motif. Le controle de ' +
        'cout ne peut RIEN pour elle : son motif n existe qu a l execution, donc il n y a ni ' +
        'a extraire ni a chronometrer. Remplacez par un balayage, ou MESUREZ la borne du ' +
        'sujet et inscrivez le chiffre dans CONSTRUCTIONS_ADMISES :\n' +
        inattendus.map((f) => `    · ${f}`).join('\n'),
    );

    const mortes = Object.keys(CONSTRUCTIONS_ADMISES).filter(
      (f) => !readFileSync(join(RACINE_SRC, f), 'utf8').includes('new RegExp'),
    );
    assert.deepEqual(mortes, [], 'Ces exemptions ne protegent plus rien : retirez-les.');
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
