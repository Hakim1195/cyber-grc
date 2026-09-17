/**
 * fichiers-publies.test.mjs — **le compte de fichiers publiés que le README
 * annonce est celui que le dépôt porte.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Trouvé le 16/09/2026, sur la question « les docs sont à jour ? »
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le §8 du `backend/README.md` annonce, dans son bloc de mesure,
 * « publication → **N fichiers identiques au dépôt** ». Ce chiffre n'était
 * surveillé par **personne** : `chiffres-du-schema.test.mjs` couvre le schéma, et
 * `install.sh --verifier-publication` mesure la MACHINE, pas le document.
 *
 * Mesuré ce jour-là : le README annonçait **86** quand le dépôt en portait **89**
 * — trois écrans livrés depuis, et trois fois où le chiffre n'a pas suivi.
 *
 * ── ⚠️ LA LISTE DES TYPES SE LIT DANS `install.sh`, ELLE NE SE RECOPIE PAS ──
 *
 * C'est la règle du constat **Q-31**, et c'est celle qui fait que la liste blanche
 * de l'installateur et le `<FilesMatch>` du vhost vont par paire. Deux listes de
 * types publiables divergent en silence : ce contrôle extrait donc la sienne du
 * script, et **rougit si elle n'y est plus** plutôt que d'en inventer une.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND, RACINE_FRONTEND } from '../aide/serveur.mjs';

const README = join(RACINE_BACKEND, 'README.md');
const INSTALL = join(RACINE_BACKEND, 'deploy', 'install.sh');

/** Les extensions publiables, LUES dans `install.sh`. */
function typesPubliables() {
  const source = readFileSync(INSTALL, 'utf8');
  const trouve = /FRONTEND_PUBLIABLE=\(([^)]*)\)/u.exec(source);
  assert.notEqual(
    trouve,
    null,
    'FRONTEND_PUBLIABLE=( … ) a disparu de deploy/install.sh : ce contrôle ne sait plus quels ' +
      'types sont publiables, et il refuse d’en inventer une liste. Suivez le script plutôt ' +
      'que de supprimer le contrôle.',
  );
  const types = trouve[1].trim().split(/\s+/u).filter((t) => t !== '');
  assert.ok(
    types.length >= 8,
    `Seulement ${String(types.length)} type(s) publiable(s) lus : l’extraction ne reconnaît ` +
      'plus la forme de la liste.',
  );
  return types;
}

/** Les fichiers du frontend qui portent un de ces types. */
function fichiersPubliables(types) {
  const admis = new Set(types.map((t) => `.${t.toLowerCase()}`));
  let total = 0;
  const parcourir = (repertoire) => {
    for (const entree of readdirSync(repertoire)) {
      const chemin = join(repertoire, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
        continue;
      }
      const point = entree.lastIndexOf('.');
      if (point > 0 && admis.has(entree.slice(point).toLowerCase())) total += 1;
    }
  };
  parcourir(RACINE_FRONTEND);
  return total;
}

describe('Le compte de fichiers publiés du README dit le dépôt', () => {
  test('LA MATIÈRE : les types se lisent dans install.sh, et le dépôt en porte', () => {
    const types = typesPubliables();
    assert.ok(types.includes('html') && types.includes('js') && types.includes('css'));
    assert.ok(
      fichiersPubliables(types) >= 50,
      'Moins de cinquante fichiers publiables trouvés : le parcours ne reconnaît plus le ' +
        'frontend, et « le compte est juste » serait vrai de rien.',
    );
  });

  test('LE CHIFFRE ANNONCÉ est celui du dépôt', () => {
    const texte = readFileSync(README, 'utf8');
    // Deux formulations dans le §8, et les DEUX sont vérifiées : le bloc de tête
    // (« publication → N fichiers identiques au dépôt ») et la ligne du tableau de
    // mesure. Un contrôle qui n'en lirait qu'une rassurerait sur l'autre — c'est
    // le constat Q-228, et il a coûté neuf nombres faux dans le second bloc.
    // ⚠️ `\s+` et non un espace : le §8 est du texte ENROBÉ À 90 COLONNES, et le
    // chiffre se trouve séparé de son nom par un saut de ligne — « **89\nfichiers
    // identiques au dépôt** ». La première rédaction de ce motif exigeait une
    // espace, ne trouvait rien, et rendait « ce contrôle n'a plus de sujet » sur un
    // document parfaitement lisible. Un contrôle qui accuse à tort finit désarmé.
    const annonces = [...texte.matchAll(/(\d[\d\s]*?)\s+fichiers?\s+(?:identiques|servis|publiés)/gu)]
      .map((m) => Number(m[1].replace(/\s/gu, '')));
    assert.ok(
      annonces.length >= 1,
      'Le README n’annonce plus de compte de fichiers publiés sous une forme reconnaissable. ' +
        'Ce contrôle n’a plus de sujet : suivez la phrase, ou dites pourquoi elle a disparu.',
    );

    const reel = fichiersPubliables(typesPubliables());
    const faux = annonces.filter((n) => n !== reel);
    assert.deepEqual(
      faux,
      [],
      `Le README annonce ${faux.join(', ')} fichier(s) publiés quand le dépôt en porte ` +
        `${String(reel)}. Un chiffre faux dans ce document est un CONSTAT, pas une coquille ` +
        '(PLAN_EXECUTION §5) : un lecteur compare au réel, trouve l’écart, et cesse de se ' +
        'servir du document comme d’un contrôle.',
    );
  });
});
