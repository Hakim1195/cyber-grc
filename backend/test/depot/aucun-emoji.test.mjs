/**
 * aucun-emoji.test.mjs — AUCUN EMOJI NE S'AFFICHE DANS LE PRODUIT
 *
 * ── Pourquoi ce contrôle existe ─────────────────────────────────────────────
 *
 * L'utilisateur l'a demandé le 16/09/2026, sans ambiguïté : *« surtout pas
 * d'emoji, il faut un style élégant et extrêmement professionnel »*. Ce n'est
 * pas une préférence de goût — c'est une exigence de **crédibilité** : cet outil
 * sert de preuve en audit ISO 27001, et une pastille colorée à côté d'un statut
 * de conformité déprécie la pièce qui la porte.
 *
 * Le dépôt portait déjà la décision (`CLAUDE.md` §7 : *« retrait emojis + icônes
 * SVG »*), et la skill `ui-ux-pro-max` la range parmi ses anti-motifs
 * (« Emoji as icons »). **Mais rien ne la gardait.** Mesuré à l'écriture de ce
 * fichier : zéro emoji dans une chaîne affichée — et rien n'empêchait le
 * prochain d'en ajouter un.
 *
 * *Écrire la règle dans un document ne suffit pas : il faut qu'une machine la
 * vérifie* — c'est la leçon du constat Q-215, et elle vaut ici.
 *
 * ── CE QUE CE CONTRÔLE DISTINGUE, ET POURQUOI C'EST LE POINT DÉLICAT ───────
 *
 * Il ne bannit pas tout signe hors alphabet. Trois familles, trois traitements :
 *
 *  1. **Les EMOJI** — refusés. Reconnaissables à ce qu'ils ont une présentation
 *     en couleur : les plages `U+1F300..U+1FAFF`, et tout signe suivi du
 *     sélecteur de variante `U+FE0F`, qui FORCE le rendu emoji. C'est ce
 *     sélecteur qui transforme un sobre `⚠` en pastille orange.
 *
 *  2. **Les signes TYPOGRAPHIQUES** — admis. `→`, `▸`, `▾`, `·`, `—` sont du
 *     texte, rendus dans la police du document, et ils sont *plus* élégants
 *     qu'une image. Les interdire appauvrirait l'interface sans rien protéger.
 *
 *  3. **Les COMMENTAIRES du code** — hors champ, et c'est délibéré. Ils ne
 *     s'affichent pas. Le dépôt en compte cent trente-cinq, qui servent à
 *     signaler un piège au relecteur ; les retirer coûterait de la clarté pour
 *     zéro gain à l'écran. ⚠️ **Le discriminant est « est-ce que ça s'affiche »,
 *     jamais « est-ce que c'est écrit »** — et c'est exactement pour cela que ce
 *     contrôle lit les chaînes plutôt que les fichiers.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FRONTEND = join(RACINE, 'cyber-gouvernance_V4');

/**
 * Les emoji, et eux seuls.
 *
 * ⚠️ `U+FE0F` est dans la classe **à dessein** : c'est le sélecteur de variante
 * qui force la présentation en couleur. Sans lui, `⚠` est un signe typographique
 * sobre ; avec lui, c'est une pastille. Le même point de code, deux rendus — et
 * c'est le rendu qui est en cause.
 */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{FE0F}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

/** Les fichiers du produit, hors bibliothèques tierces. */
function sources() {
  const trouves = [];
  const parcourir = (repertoire) => {
    for (const entree of readdirSync(repertoire)) {
      const chemin = join(repertoire, entree);
      if (statSync(chemin).isDirectory()) {
        if (entree === 'lib') continue; // SheetJS : code tiers, non réécrit ici.
        parcourir(chemin);
      } else if (/\.(js|html|css)$/.test(entree)) {
        trouves.push(chemin);
      }
    }
  };
  parcourir(FRONTEND);
  return trouves;
}

/**
 * Extrait de `contenu` ce qui peut ARRIVER À L'ÉCRAN.
 *
 * ── Pourquoi on ne lit pas le fichier entier ────────────────────────────────
 *
 * Un balayage naïf rendrait cent trente-cinq occurrences, toutes dans des
 * commentaires, et le contrôle serait rouge en permanence — donc ignoré
 * (constat **Q-64** : *un banc qui échoue quatre fois sur cinq apprend à être
 * ignoré*). On retire donc ce qui ne s'affiche pas, et on examine le reste :
 *
 *   · **JavaScript** — les commentaires partent, tout le reste est examiné. Un
 *     emoji qui y survit est forcément dans une chaîne ;
 *   · **CSS** — les seuls `content:`, qui posent du texte dans la page ;
 *   · **HTML** — tout, hors commentaires.
 *
 * ⚠️ **La première rédaction cherchait les littéraux un par un, et elle avait un
 * TROU** : l'apostrophe française de `l'action` désynchronisait le repérage pour
 * tout le reste du fichier. Elle a laissé passer un « 👍 » du TABLEAU DE BORD en
 * rendant le contrôle vert — c'est-à-dire qu'elle a fait exactement ce qu'un
 * garde ne doit jamais faire. *On ne lit pas du JavaScript avec une expression
 * rationnelle* : on renverse le problème.
 */
function ceQuiSAffiche(chemin, contenu) {
  const morceaux = [];

  if (chemin.endsWith('.css')) {
    for (const m of contenu.matchAll(/content\s*:\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
      morceaux.push(m[2]);
    }
    return morceaux;
  }

  if (chemin.endsWith('.html')) {
    // Les commentaires partent d'abord — ils ne s'affichent pas.
    const sansCommentaires = contenu.replace(/<!--[\s\S]*?-->/g, '');
    morceaux.push(sansCommentaires);
    return morceaux;
  }

  // ── JavaScript : ON RETIRE LES COMMENTAIRES, ET ON GARDE TOUT LE RESTE ──
  //
  // ⚠️ **La première rédaction cherchait les littéraux de chaîne un par un, et
  // elle avait un TROU — mesuré : elle a laissé passer un « 👍 » du tableau de
  // bord tout en rendant le contrôle vert.** La cause est l'apostrophe
  // française : dans `l'action`, le repérage naïf prend le `'` pour l'ouverture
  // d'une chaîne, court jusqu'à l'apostrophe suivante, et se désynchronise pour
  // tout le reste du fichier. *On ne lit pas du JavaScript avec une expression
  // rationnelle.*
  //
  // Le problème est donc RENVERSÉ : on retire ce qui ne s'affiche pas — les
  // commentaires — et on examine tout ce qui reste. Un emoji qui survit à cela
  // est forcément dans une chaîne : il ne peut être ni un identifiant, ni un
  // opérateur. Le balayage ne peut plus se désynchroniser, parce qu'il ne
  // cherche plus de frontières.
  //
  // ⚠️ `[^:]` devant `//` protège les URL : sans lui, « https://… » ouvrirait un
  // commentaire qui avalerait la fin de la ligne.
  const sansCommentaires = contenu
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  morceaux.push(sansCommentaires);
  return morceaux;
}

describe('Aucun emoji ne s’affiche dans le produit', () => {
  test('les chaînes rendues à l’écran n’en portent aucun', () => {
    const fautifs = [];
    for (const chemin of sources()) {
      const contenu = readFileSync(chemin, 'utf8');
      for (const morceau of ceQuiSAffiche(chemin, contenu)) {
        const m = EMOJI.exec(morceau);
        if (m !== null) {
          const point = m[0].codePointAt(0).toString(16).toUpperCase();
          fautifs.push(
            `${chemin.slice(RACINE.length + 1)} : « ${m[0]} » (U+${point}) dans ` +
              `« ${morceau.trim().slice(0, 60)} »`,
          );
        }
      }
    }

    assert.deepEqual(
      fautifs,
      [],
      'Un emoji arrive à l’écran. Ce produit sert de PREUVE EN AUDIT : une pastille colorée ' +
        'à côté d’un statut de conformité déprécie la pièce qui la porte. Employez une icône ' +
        'SVG (décision du `CLAUDE.md` §7) ou un signe typographique sobre — « → », « ▸ », ' +
        '« · » sont du texte et se rendent dans la police du document.\n  ' +
        fautifs.join('\n  '),
    );
  });

  test('CONTRÔLE DE MORSURE — un emoji fabriqué EST vu', () => {
    // Sans ce contrôle, le précédent serait vert sur un détecteur qui ne détecte
    // rien : c'est le motif du constat Q-210, qui a coûté un passage de porte.
    const fabrique = [
      { chemin: 'faux.js', contenu: 'const m = "Statut ✅ conforme";' },
      { chemin: 'faux.css', contenu: '.x::before { content: "⚠️"; }' },
      { chemin: 'faux.html', contenu: '<p>Alerte 🔴 critique</p>' },
    ];
    for (const f of fabrique) {
      const vu = ceQuiSAffiche(f.chemin, f.contenu).some((m) => EMOJI.test(m));
      assert.equal(vu, true, `Le détecteur ne voit pas l’emoji de ${f.chemin}.`);
    }
  });

  test('CONTRÔLE SYMÉTRIQUE — un COMMENTAIRE et un signe typographique passent', () => {
    // La moitié qui empêche le contrôle de devenir une gêne. Sans elle, on
    // l'aurait désarmé au premier faux positif — et un garde qu'on désarme ne
    // garde plus rien.
    const tolere = [
      { chemin: 'ok.js', contenu: '// ⚠️ piège connu : voir le constat Q-194' },
      { chemin: 'ok.js', contenu: '/* ✅ fermé le 11/09 */ const a = 1;' },
      { chemin: 'ok.js', contenu: 'const fleche = "Toulouse → Groupe";' },
      { chemin: 'ok.css', contenu: '.d::before { content: "▸"; }' },
      { chemin: 'ok.html', contenu: '<!-- 🔴 note de relecture -->' },
    ];
    for (const t of tolere) {
      const vu = ceQuiSAffiche(t.chemin, t.contenu).some((m) => EMOJI.test(m));
      assert.equal(
        vu,
        false,
        `Faux positif sur ${t.chemin} : « ${t.contenu.slice(0, 50)} ». Un commentaire ne ` +
          's’affiche pas, et un signe typographique n’est pas un emoji.',
      );
    }
  });
});
