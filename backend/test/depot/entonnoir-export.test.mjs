/**
 * entonnoir-export.test.mjs — tout ce qui SORT du produit passe par l'entonnoir.
 *
 * ── Le constat qui l'a motivé : Q-89, porte S3 ──────────────────────────────
 *
 * `PLAN_SERVEUR` §3.3 fait du droit d'export une **permission à part entière**,
 * distincte de la lecture, et `js/core/session.js` annonce un **entonnoir
 * unique** : `Droits.exigerExport()`. Onze sites sur douze le respectaient.
 * Le douzième — `js/modules/synthese.js`, le rapport « Synthèse Direction » —
 * fabriquait son `Blob` et déclenchait le téléchargement sans jamais l'appeler.
 *
 * Mesuré par l'auditeur de la porte S3, dans un Chromium réel, avec le compte
 * Active Directory `rssi.tls` dont la session porte `export: false` :
 * **38 213 octets** de « Synthèse Direction — Posture Cyber », marquée
 * *Document confidentiel*, téléchargés. Deux des huit profils du socle — RSSI
 * et ADMIN — sont dans cette configuration.
 *
 * ── Pourquoi un contrôle, et pas seulement le correctif ────────────────────
 *
 * Corriger le douzième site ne dit rien du treizième. Ce chantier a déjà payé
 * quatre fois la même facture — sept clés étrangères oubliées, les déclencheurs
 * d'insertion, une table de liaison sur sept, le point d'appel des garde-fous
 * lui-même — et la parade n'est jamais la vigilance : c'est la **découverte**.
 *
 * On ne tient donc aucune liste de fichiers. On cherche dans tout le produit ce
 * qui fait **sortir un octet** — `URL.createObjectURL` et l'attribut `download`
 * d'une ancre — et l'on exige que le fichier qui le contient appelle
 * `Droits.exigerExport()`. Un module neuf qui exporterait sans passer par
 * l'entonnoir fait rougir cet essai le jour où il est écrit, pas trois portes
 * plus tard.
 *
 * ── Ce que ce contrôle ne prétend pas faire ───────────────────────────────
 *
 * Il travaille au **fichier**, pas à la fonction : il ne saurait pas voir un
 * fichier qui appelle l'entonnoir dans une fonction et l'oublie dans une autre.
 * C'est une borne assumée, et elle est écrite ici plutôt que sous-entendue —
 * la moitié comportementale vit dans `test/navigateur/droits.test.mjs`, qui
 * exerce un profil sans droit d'export contre l'interface réelle. Ce contrôle-ci
 * est le filet mécanique qui attrape le fichier **entièrement** oublié, cas
 * exact de Q-89.
 *
 * ⚠️ **ET IL EST AVEUGLE À DEUX FICHIERS SUR SEPT — constat Q-114, porte S4.**
 *
 * `js/services/exportExcel.js` et `js/services/exportPDF.js` **ne fabriquent pas
 * le téléchargement eux-mêmes** : c'est **SheetJS** qui écrit le classeur, et le
 * **moteur d'impression du navigateur** qui produit le PDF. Aucun des trois
 * motifs ci-dessous n'y apparaît, et aucun ne peut y apparaître. La découverte
 * ne les voit donc pas — non par oubli, mais **par construction**.
 *
 * Le compte honnête est là, et il faut le dire au lieu de le laisser croire :
 *
 * | | |
 * |---|---|
 * | Sites de sortie du produit | **12** |
 * | Fichiers que ce contrôle mécanique voit | **5** |
 * | Fichiers couverts **uniquement** par le filet comportemental | **2** — `exportExcel.js`, `exportPDF.js` |
 *
 * Les deux passent bien par `Droits.exigerExport()` — c'est mesuré ailleurs. Ce
 * qui est faux serait de croire ce contrôle-ci plus large qu'il n'est : *un
 * garde-fou ne se voit pas prêter plus de portée qu'il n'en a* (`CONVENTIONS.md`
 * §17.5). Et c'est très exactement ainsi que **Q-89** est passé — un site sur
 * douze, dans le seul fichier qu'aucun contrôle n'atteignait.
 *
 * **Conséquence pratique, pour qui touche à l'export** : si `test/navigateur/droits.test.mjs`
 * cesse d'exercer ces deux fichiers, **plus rien** ne les couvre, et cet
 * essai-ci restera vert. Le cas est éprouvé plus bas.
 *
 * Les bibliothèques embarquées (`js/lib/`) sont hors périmètre : ce n'est pas
 * notre code, et SheetJS porte ses propres écritures de fichier — que le produit
 * n'atteint que par `js/services/exportExcel.js`, lui sous entonnoir.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const RACINE = join(
  fileURLToPath(new URL('../../..', import.meta.url)),
  'cyber-gouvernance_V4',
);
const JS = join(RACINE, 'js');

/** Tout `.js` du produit, bibliothèques embarquées exclues. */
function fichiersDuProduit(repertoire = JS) {
  const trouves = [];
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === 'lib') continue;
      trouves.push(...fichiersDuProduit(chemin));
    } else if (entree.name.endsWith('.js')) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/**
 * Les deux gestes par lesquels un octet quitte le produit. `msSaveBlob` est là
 * pour l'exhaustivité : il n'existe plus dans le code, et son absence de la
 * liste le jour où quelqu'un l'écrirait est précisément ce qu'on veut éviter.
 */
const SORTIES = [
  { motif: /URL\s*\.\s*createObjectURL\s*\(/, nom: 'URL.createObjectURL(' },
  { motif: /\.\s*download\s*=/, nom: "attribut « download » d'une ancre" },
  { motif: /msSaveBlob\s*\(/, nom: 'msSaveBlob(' },
];

const ENTONNOIR = /Droits\s*\.\s*exigerExport\s*\(/;

/**
 * Les fichiers qui font sortir un octet **sans employer aucun des motifs
 * ci-dessus**, parce qu'ils délèguent à une bibliothèque ou au navigateur.
 *
 * ⚠️ Liste écrite à la main **à dessein**, et c'est le cas où le `CLAUDE.md` §3
 * le permet : son incomplétude fait **échouer bruyamment** et oblige quelqu'un à
 * trancher — l'essai ci-dessous exige que chacun de ces fichiers appelle
 * l'entonnoir, et rougit s'il ne le fait plus. Ce qui serait le mauvais outil,
 * ce serait une liste des fichiers *exemptés* : celle-là, incomplète, ferait
 * réussir quelque chose en silence.
 */
const SORTIES_DELEGUEES = [
  { fichier: 'js/services/exportExcel.js', par: 'SheetJS (XLSX.writeFile)' },
  { fichier: 'js/services/exportPDF.js', par: "le moteur d'impression du navigateur" },
];

/** Le code sans ses commentaires : une mention en commentaire n'est pas un appel. */
function sansCommentaires(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe("Tout ce qui sort du produit passe par l'entonnoir (constat Q-89)", () => {
  test('AUCUN fichier ne fabrique un téléchargement sans exiger le droit', () => {
    const fautifs = [];
    let sitesVus = 0;

    for (const chemin of fichiersDuProduit()) {
      const code = sansCommentaires(readFileSync(chemin, 'utf8'));
      const sorties = SORTIES.filter((s) => s.motif.test(code));
      if (sorties.length === 0) continue;
      sitesVus += 1;
      if (!ENTONNOIR.test(code)) {
        fautifs.push(
          `${relative(RACINE, chemin)} — ${sorties.map((s) => s.nom).join(', ')}`,
        );
      }
    }

    // Si plus aucun fichier n'exporte, ce contrôle ne contrôle plus rien : il
    // passerait au vert en n'éprouvant rien, ce que ce dépôt appelle un décor.
    assert.ok(
      sitesVus >= 5,
      `Seuls ${String(sitesVus)} fichier(s) exportent encore : ce contrôle ne mord plus. ` +
        "Soit le produit a changé de façon d'exporter — et il faut apprendre la nouvelle " +
        'à `SORTIES` —, soit la découverte est cassée.',
    );

    assert.deepEqual(
      fautifs,
      [],
      "Ces fichiers font SORTIR des données du produit sans appeler `Droits.exigerExport()` :\n" +
        fautifs.map((f) => `  · ${f}`).join('\n') +
        "\nLe droit d'export est distinct de la lecture (PLAN_SERVEUR §3.3, contrôle S7) : " +
        'un accès en lecture permet, sans lui, d’extraire en un clic la cartographie ' +
        "complète des faiblesses du groupe. Ajoutez, en tête de la fonction qui exporte :\n" +
        '  if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;',
    );
  });

  // ── Le trou de la découverte, nommé et gardé — constat Q-114 ──────────
  //
  // Deux fichiers exportent sans employer aucun des motifs de `SORTIES` : ils
  // délèguent à SheetJS et au moteur d'impression. La découverte ne peut pas les
  // voir — ce n'est pas un oubli, c'est structurel. Ils étaient donc couverts
  // par le seul filet comportemental, et **rien ici ne le disait**.
  //
  // Cet essai ne répare pas la découverte (on ne peut pas deviner qu'un appel à
  // `XLSX.writeFile` fait sortir un octet sans connaître SheetJS). Il rend la
  // borne **exécutable** : les deux fichiers sont nommés, et l'entonnoir y est
  // exigé. Si l'un cesse de l'appeler, cet essai rougit — là où, avant, il
  // restait vert en n'ayant rien regardé.
  test('LES SORTIES DÉLÉGUÉES aussi passent par l’entonnoir (constat Q-114)', () => {
    const manquants = [];
    for (const { fichier, par } of SORTIES_DELEGUEES) {
      const chemin = join(RACINE, fichier);
      if (!existsSync(chemin)) {
        manquants.push(`${fichier} — INTROUVABLE : renommé ou supprimé, la borne ne tient plus`);
        continue;
      }
      const code = sansCommentaires(readFileSync(chemin, 'utf8'));
      if (!ENTONNOIR.test(code)) {
        manquants.push(`${fichier} (sort par ${par}) n’appelle pas Droits.exigerExport()`);
      }
      // Contrôle de matière : si ce fichier cessait d'exporter, la ligne
      // deviendrait un vestige qui protège un défaut disparu.
      if (!/XLSX|print\s*\(|window\s*\.\s*print/.test(code)) {
        manquants.push(`${fichier} n’exporte plus rien : retirez-le de SORTIES_DELEGUEES`);
      }
    }
    assert.deepEqual(
      manquants,
      [],
      'Ces fichiers font sortir des octets par une bibliothèque ou par le navigateur, donc ' +
        'AUCUN motif de `SORTIES` ne les atteint. Ils ne sont couverts que par ce contrôle-ci ' +
        'et par `test/navigateur/droits.test.mjs` :\n' +
        manquants.map((m) => `  · ${m}`).join('\n'),
    );
  });

  test("L'ENTONNOIR EXISTE, et il n'est pas qu'un nom", () => {
    // Sans cette assertion, renommer `exigerExport` rendrait l'essai précédent
    // rouge partout — bruyamment, donc sans danger — mais SUPPRIMER l'entonnoir
    // en laissant les appels le rendrait vert sur une fonction inexistante.
    const session = readFileSync(join(JS, 'core', 'session.js'), 'utf8');
    assert.match(
      sansCommentaires(session),
      /exigerExport\s*[:(]/,
      "`js/core/session.js` ne définit plus `exigerExport` : l'entonnoir que les " +
        'modules appellent n’existe pas, et leurs appels sont sans effet.',
    );
  });
});
