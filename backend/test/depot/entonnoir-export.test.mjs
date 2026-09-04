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
 * Les bibliothèques embarquées (`js/lib/`) sont hors périmètre : ce n'est pas
 * notre code, et SheetJS porte ses propres écritures de fichier — que le produit
 * n'atteint que par `js/services/exportExcel.js`, lui sous entonnoir.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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
