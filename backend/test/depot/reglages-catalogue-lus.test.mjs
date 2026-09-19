/**
 * reglages-catalogue-lus.test.mjs — **un réglage du catalogue est un réglage LU**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce contrôle existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le constat **Q-91** : *« trois variables vivaient dans `.env.example`, chacune
 * avec un paragraphe expliquant ce qu'elle règle, et aucune n'était lue nulle
 * part »*. Un exploitant qui les réglait croyait agir.
 *
 * La migration `048` ouvre une seconde surface de ce genre — le catalogue de
 * `parametres`, affiché dans *Paramètres → Réglages*, avec un champ de saisie à
 * côté de chaque ligne. Le risque y est plus grand qu'avec un fichier
 * d'exemple : **le produit propose lui-même de modifier la valeur**. Une clé au
 * catalogue que rien ne lit n'est pas une documentation morte, c'est une
 * promesse faite à l'écran.
 *
 * ── Ce que ce contrôle mesure ───────────────────────────────────────────────
 *
 * Il lit les clés déclarées par les migrations — **dans le SQL**, jamais dans
 * une liste recopiée ici — et exige que chacune apparaisse dans un fichier du
 * produit : `cyber-gouvernance_V4/js/` **ou** `backend/src/`, hors de l'écran
 * des Paramètres lui-même.
 *
 * ⚠️ **Les deux côtés, et c'est une correction payée.** La première rédaction ne
 * regardait que le frontend, au motif que les réglages livrés étaient des seuils
 * d'affichage. `notifications.derniere_relance` — la fenêtre anti-doublon du lot
 * L12 — est lue par `backend/src/notifications/`, et le contrôle l'a déclarée
 * muette à tort. *Un contrôle qui accuse à tort finit désarmé* (constat Q-64).
 *
 * ⚠️ **L'exclusion de `js/modules/settings.js` est le cœur du contrôle.** Cet
 * écran affiche TOUTES les clés par construction : l'y compter reviendrait à
 * dire qu'un réglage est lu parce qu'on le montre — et c'est exactement
 * l'illusion qu'on ferme.
 *
 * ── Ce qu'il ne fait PAS, et il faut le dire (§17.5) ────────────────────────
 *
 * Il ne vérifie pas que le lecteur *applique* la valeur correctement : cela,
 * seul un essai de comportement le dit. Il ferme une classe précise — *une clé
 * proposée à l'écran que rien ne consulte* —, qui est celle qui se glisse au
 * moment où l'on ajoute un réglage « pendant qu'on y est ».
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND, RACINE_FRONTEND } from '../aide/serveur.mjs';

const RACINE_MIGRATIONS = join(RACINE_BACKEND, 'db', 'migrations');
const RACINE_JS = join(RACINE_FRONTEND, 'js');
const RACINE_SRC = join(RACINE_BACKEND, 'src');

/** L'écran qui affiche TOUTES les clés : l'y compter fermerait le contrôle. */
const ECRAN_DES_REGLAGES = 'modules/settings.js';

/**
 * Les clés déclarées au catalogue, LUES DANS LE SQL.
 *
 * Une liste recopiée ici vieillirait au rythme des migrations, ce qui est le
 * défaut qu'on ferme.
 *
 * ⚠️ **On ne borne PAS l'instruction au premier point-virgule**, et c'est une
 * leçon payée à la première rédaction : les descriptions d'un réglage sont des
 * phrases françaises, et une phrase française contient des points-virgules. Le
 * motif s'arrêtait au milieu du premier `insert`, ne voyait qu'une clé sur
 * deux, et le contrôle de matière l'a dit. *Un motif qui borne du SQL au
 * point-virgule borne en réalité au premier texte qui en contient un.*
 *
 * On retient donc les fichiers qui écrivent dans `parametres`, et on y cherche
 * les littéraux qui ont la FORME d'une clé — `a.b`, en minuscules, entre
 * apostrophes. Le motif peut en rendre un de trop ; il ne peut pas en taire un,
 * et c'est le bon sens de l'erreur.
 */
function clesDuCatalogue() {
  const cles = new Set();
  for (const nom of readdirSync(RACINE_MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const source = readFileSync(join(RACINE_MIGRATIONS, nom), 'utf8');
    if (!/insert\s+into\s+parametres\b/iu.test(source)) continue;
    // ⚠️ On reconnaît la FORME D'UNE LIGNE DE CATALOGUE, et non « un littéral qui
    //    ressemble à une clé ». Deux rédactions plus permissives ont été essayées
    //    et mesurées fausses dans la même heure :
    //
    //      · borner l'instruction au premier « ; » — une description est une
    //        phrase française, et une phrase française en contient ;
    //      · prendre tout littéral de forme « a.b » — le fichier y perd ses
    //        propres commentaires (« public.parametres »,
    //        « parametres.ck_parametres_catalogue_complet ») et ses réglages de
    //        session (« grc.utilisateur »), déclarés muets à tort.
    //
    //    *Un contrôle qui accuse à tort finit désarmé* (constat Q-64). On exige
    //    donc le tuple complet : identifiant engendré, portée Groupe, catégorie,
    //    puis la clé. Une migration qui écrirait autrement ne rendrait RIEN — et
    //    l'essai de matière ci-dessous le dirait aussitôt.
    for (const [, cle] of source.matchAll(
      /f_generer_id\('PARAM'\)\s*,\s*null\s*,\s*'[a-z_]+'\s*,\s*'([a-z0-9_]+(?:\.[a-z0-9_]+)+)'/gu,
    )) {
      cles.add(cle);
    }
  }
  return [...cles].sort();
}

/** Tous les fichiers d'interface, DÉCOUVERTS. */
function fichiersJs(repertoire = RACINE_JS, resultat = []) {
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === 'lib') continue; // bibliothèques embarquées (SheetJS)
      fichiersJs(chemin, resultat);
    } else if (entree.name.endsWith('.js')) {
      resultat.push(chemin);
    }
  }
  return resultat;
}

/** Les fichiers du serveur, où vivent les réglages techniques. */
function fichiersTs(repertoire = RACINE_SRC, resultat = []) {
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) fichiersTs(chemin, resultat);
    else if (entree.name.endsWith('.ts')) resultat.push(chemin);
  }
  return resultat;
}

/** Tout ce que le produit LIT, les deux côtés, hors écran des Paramètres. */
function sourcesConsommatrices() {
  const js = fichiersJs().filter(
    (c) => relative(RACINE_JS, c).split('\\').join('/') !== ECRAN_DES_REGLAGES,
  );
  // ⚠️ Le greffon des réglages est exclu pour la même raison que l'écran : il
  //    SERT toutes les clés, il n'en lit aucune. L'y compter dirait qu'un
  //    réglage est lu parce qu'on le distribue.
  const ts = fichiersTs().filter((c) => !c.includes(join('src', 'parametres')));
  return [...js, ...ts].map((c) => readFileSync(c, 'utf8')).join('\n');
}

describe('Un réglage du catalogue est un réglage LU (constat Q-91)', () => {
  test('LA MATIÈRE : le catalogue déclare bien des clés', () => {
    const cles = clesDuCatalogue();
    assert.ok(
      cles.length >= 2,
      `Seulement ${String(cles.length)} clé(s) trouvée(s) dans les migrations : le motif ne ` +
        'reconnaît plus les déclarations. Corriger ICI plutôt que de supprimer le contrôle.',
    );
  });

  test('CHAQUE clé du catalogue est lue quelque part dans le produit', () => {
    const lisibles = sourcesConsommatrices();

    const muettes = clesDuCatalogue().filter((cle) => !lisibles.includes(cle));
    assert.deepEqual(
      muettes,
      [],
      'Ces réglages sont proposés à l’écran et AUCUN endroit du produit ne les consulte. ' +
        'L’exploitant les modifie, croit avoir agi, et rien ne change — c’est le constat ' +
        'Q-91, aggravé : ici le produit propose lui-même la modification.\n' +
        muettes.map((c) => `    · ${c}`).join('\n'),
    );
  });

  test('LE CONTRÔLE MORD : une clé inventée ne se trouve nulle part', () => {
    // Sans cette morsure, un motif devenu muet rendrait vert en n'éprouvant rien
    // (constat Q-210). On vérifie que la recherche sait dire « absente ».
    const lisibles = sourcesConsommatrices();
    assert.equal(
      lisibles.includes('inexistant.reglage_que_personne_ne_lit'),
      false,
      'La recherche trouve une clé qui n’existe pas : elle ne mesure plus rien.',
    );
  });
});
