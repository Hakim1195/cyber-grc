/**
 * identifiants.test.mjs — le générateur QUI ÉCRIT, et le garde-fou qui le mesure.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le quatrième passage de la porte S2 a relevé (constat **Q-1**) que le banc portait
 * un essai d'entropie soigné — 250 puis 20 000 tirages — sur `f_generer_id()`, la
 * fonction SQL, qui n'est la valeur par défaut que de `journal_audit.id` : une table
 * que le lot L2 n'écrit jamais. « Le générateur d'identifiants que j'avais fait
 * corriger n'est pas celui qui écrit. » Le banc mesurait la base plutôt que le
 * chemin réel — c'est le même écart que celui reconnu au premier passage.
 *
 * Trois comportements neufs sont éprouvés ici, et tous les trois sur les fonctions
 * que le serveur appelle vraiment :
 *
 *  1. **l'entropie** d'`engendrerIdentifiant`, mesurée sur le SUFFIXE seul —
 *     compter les identifiants entiers ne prouverait rien, puisque l'horodatage
 *     suffit à les séparer dès que la boucle traîne, or le défaut de Q-1
 *     n'apparaît QUE dans une boucle serrée ;
 *  2. **le déterminisme** d'`identifiantDerive` (constat **Q-2**) : la ré-émission
 *     ne tire plus au hasard, elle dérive — c'est ce qui fait converger trois
 *     reprises du même fichier sur une seule ligne ;
 *  3. **le branchement** du garde-fou : `verifierGenerateurIdentifiants` est
 *     appelé par `verifierRegistre`, donc par le point de démarrage unique de
 *     l'API. Une entropie affaiblie ne produit pas un avertissement dans un
 *     journal que personne ne lit : elle empêche le service de démarrer.
 *
 * Ce fichier n'ouvre AUCUNE base : ce sont des fonctions pures et une lecture de
 * source. Le chemin d'écriture complet — 250 créations par `POST /api/entites`, et
 * autant de lignes distinctes en base — est éprouvé dans `routes.test.mjs`, où le
 * serveur est monté.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND, moduleCompile } from '../aide/serveur.mjs';

const {
  engendrerIdentifiant,
  estIdentifiantDerive,
  identifiantDerive,
  verifierGenerateurIdentifiants,
} = await moduleCompile('entites/index.js');

/* =====================================================================
 *  §1 — L'entropie, mesurée sur le générateur qui écrit
 * ===================================================================== */

describe('Le générateur d’identifiants du serveur (constat Q-1)', () => {
  test('le garde-fou du démarrage ne trouve rien à redire', () => {
    // C'est la mesure que le service rejoue à chaque démarrage. Si elle parle, le
    // service ne démarre pas : le contrôle n'a donc pas le droit d'être approximatif.
    assert.deepEqual(verifierGenerateurIdentifiants(), []);
  });

  test('20 000 tirages en boucle serrée : 20 000 SUFFIXES distincts', () => {
    // La boucle est serrée à dessein : c'est la seule condition où le défaut se
    // produit. `Date.now()` n'y bouge qu'une poignée de fois, l'identifiant se
    // réduit à son suffixe, et c'est lui qu'on compte.
    const TIRAGES = 20_000;
    const suffixes = new Set();
    const horodatages = new Set();
    for (let i = 0; i < TIRAGES; i += 1) {
      const id = engendrerIdentifiant('CTRL');
      const morceaux = id.split('-');
      horodatages.add(morceaux[1]);
      suffixes.add(morceaux[2]);
    }
    assert.equal(
      suffixes.size,
      TIRAGES,
      `Seulement ${String(suffixes.size)} suffixes distincts sur ${String(TIRAGES)} tirages : ` +
        'un import de masse perdrait des lignes, et sans erreur — c’est le bloquant T-1.',
    );
    // Le scénario n'a de sens que si l'horodatage NE distingue PAS : sinon on
    // mesurerait l'horloge. Sur ce chemin (fonction pure, aucune entrée-sortie), la
    // boucle tient dans quelques dizaines de millisecondes.
    assert.ok(
      horodatages.size < TIRAGES / 10,
      `${String(horodatages.size)} horodatages distincts pour ${String(TIRAGES)} tirages : ` +
        'la boucle n’est pas assez serrée pour éprouver ce que ce test vise.',
    );
  });

  test('la forme reste celle du §2, et recevable par le domaine « id_metier »', () => {
    for (const prefixe of ['RISK', 'MESURE', 'MMO']) {
      const id = engendrerIdentifiant(prefixe);
      assert.ok(id.startsWith(`${prefixe}-`), id);
      assert.ok(id.length <= 64, `Le domaine « id_metier » plafonne à 64 caractères : ${id}`);
      assert.equal(id.trim(), id, `Blanc de bord : ${id}`);
      assert.equal(id.includes(','), false, `Virgule : ${id}`);
    }
  });
});

/* =====================================================================
 *  §2 — La ré-émission DÉRIVE, elle ne tire plus (constat Q-2)
 * ===================================================================== */

describe('L’identifiant de ré-émission est déterministe (constat Q-2)', () => {
  const argumentsDe = ['RISK', 'FIL-A', 'risques', 'RISK-B'];

  test('la même entrée rend TOUJOURS le même identifiant', () => {
    const premier = identifiantDerive(...argumentsDe);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(
        identifiantDerive(...argumentsDe),
        premier,
        'Une ré-émission qui varie fabrique un clone à chaque reprise du même fichier.',
      );
    }
  });

  test('CHACUNE des trois entrées change le résultat — aucune n’est décorative', () => {
    // Contrôle de morsure du test précédent : une fonction qui rendrait une constante
    // le passerait. On vérifie donc que les trois dimensions comptent VRAIMENT — la
    // filiale, la table, et l'identifiant du fichier. Si la table ne comptait pas, un
    // risque et un actif homonymes se dériveraient au même identifiant (constat T-5).
    const reference = identifiantDerive(...argumentsDe);
    const variantes = [
      ['RISK', 'FIL-B', 'risques', 'RISK-B'],
      ['RISK', 'FIL-A', 'actifs', 'RISK-B'],
      ['RISK', 'FIL-A', 'risques', 'RISK-C'],
    ];
    const vus = new Set([reference]);
    for (const variante of variantes) {
      const derive = identifiantDerive(...variante);
      assert.notEqual(derive, reference, `Cette dimension n’est pas prise en compte : ${variante.join(' · ')}`);
      assert.equal(vus.has(derive), false, `Deux entrées différentes se dérivent pareil : ${derive}`);
      vus.add(derive);
    }
  });

  test('la portée Groupe (filiale nulle) a son propre espace, et il est stable', () => {
    const groupe = identifiantDerive('MESURE', null, 'mesure_catalogue', 'MESURE-G');
    assert.equal(groupe, identifiantDerive('MESURE', null, 'mesure_catalogue', 'MESURE-G'));
    assert.notEqual(groupe, identifiantDerive('MESURE', 'FIL-A', 'mesure_catalogue', 'MESURE-G'));
  });

  test('un ré-émis s’ANNONCE, un engendré non : les deux chemins restent distinguables', () => {
    const derive = identifiantDerive(...argumentsDe);
    assert.equal(estIdentifiantDerive('RISK', derive), true);
    assert.equal(estIdentifiantDerive('RISK', engendrerIdentifiant('RISK')), false);
    // Et la marque ne se confond pas d'un préfixe à l'autre.
    assert.equal(estIdentifiantDerive('ACTIF', derive), false);
    assert.ok(derive.length <= 64, `Le domaine « id_metier » plafonne à 64 caractères : ${derive}`);
  });
});

/* =====================================================================
 *  §3 — Le garde-fou est BRANCHÉ, et il l'est au point de démarrage
 * ===================================================================== */

describe('Le contrôle du générateur est branché sur le démarrage', () => {
  const lire = (relatif) => readFileSync(join(RACINE_BACKEND, 'src', relatif), 'utf8');

  test('« verifierRegistre » APPELLE le contrôle du générateur', () => {
    // Un garde-fou que rien n'appelle est un commentaire (`CONVENTIONS.md` §18.4).
    // Les deux essais ci-dessus mesurent la garantie ; celui-ci vérifie qu'elle est
    // rejouée par le produit, et pas seulement par le banc. Sans lui, on pourrait
    // débrancher le contrôle sans qu'aucun essai ne bouge.
    // ── Ce que la première rédaction faisait de travers ─────────────────────
    //
    // Elle cherchait le motif dans « tout ce qui suit la déclaration de
    // verifierRegistre » — c'est-à-dire dans la fin du fichier, où se trouve la
    // DÉCLARATION de `verifierGenerateurIdentifiants`. Débrancher l'appel laissait
    // donc le test vert : il voyait la fonction exister, pas être appelée. Trouvé
    // par sabotage, comme le veut la règle du chantier ; c'est le rappel qu'un
    // balayage structurel doit borner ce qu'il lit.
    const source = lire('entites/index.ts');
    const debut = source.indexOf('export function verifierRegistre');
    assert.notEqual(debut, -1, 'Le point de vérification unique a disparu ou changé de nom.');
    const fin = source.indexOf('\n}\n', debut);
    assert.ok(fin > debut, 'Corps de « verifierRegistre » illisible.');
    const corps = source.slice(debut, fin);
    assert.ok(
      corps.includes('verifierGenerateurIdentifiants('),
      'Le contrôle du générateur n’est plus appelé par le point de vérification unique : ' +
        'un garde-fou que rien n’appelle est un commentaire.',
    );

    // Contrôles de morsure du balayage lui-même. Le premier : le corps lu doit être
    // CELUI de la fonction, pas la fin du fichier — sinon la déclaration ferait
    // passer le test pour un appel.
    assert.equal(
      corps.includes('export function verifierGenerateurIdentifiants'),
      false,
      'Le balayage déborde sur la déclaration : il verrait un appel là où il n’y en a pas.',
    );
    // Le second : le motif doit savoir dire non.
    assert.equal(
      'function verifierRegistre(c) { return []; }'.includes('verifierGenerateurIdentifiants('),
      false,
    );
  });

  test('le DÉMARRAGE refuse quand le registre parle — et il n’y a qu’une porte', () => {
    // La conséquence, du côté où elle se produit : `assurerDepot` refuse de servir
    // et le service rend 503. C'est ce qui transforme « le générateur est faible »
    // en « le service ne démarre pas » plutôt qu'en une ligne de journal.
    const api = lire('api/index.ts');
    assert.ok(/verifierRegistre\s*\(/.test(api), 'Le point de démarrage doit appeler le garde-fou.');
    assert.ok(
      /anomaliesRegistre\s*=\s*anomalies/.test(api),
      'Et retenir son verdict : c’est lui qui ferme le service à toutes les requêtes suivantes.',
    );

    // Un seul appelant : deux points de démarrage, c'est un point de démarrage qu'on
    // oubliera de brancher. On compte les appels dans TOUT « src/ ».
    const appelants = [];
    const parcourir = (repertoire) => {
      for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
        const chemin = join(repertoire, entree.name);
        if (entree.isDirectory()) {
          parcourir(chemin);
          continue;
        }
        if (!entree.name.endsWith('.ts')) continue;
        // La DÉCLARATION n'est pas un appel : on la neutralise avant de chercher.
        const texte = readFileSync(chemin, 'utf8').replace(
          /export function verifierRegistre/g,
          'DECLARATION_verifierRegistre',
        );
        if (/\bverifierRegistre\s*\(/.test(texte)) appelants.push(chemin.slice(RACINE_BACKEND.length + 1));
      }
    };
    parcourir(join(RACINE_BACKEND, 'src'));
    assert.deepEqual(
      appelants.filter((c) => !c.endsWith('entites/index.ts')),
      ['src/api/index.ts'],
      `Le garde-fou doit avoir UN seul appelant : ${appelants.join(', ')}`,
    );
  });
});
