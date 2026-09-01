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
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_BACKEND, moduleCompile } from '../aide/serveur.mjs';

const {
  engendrerIdentifiant,
  estIdentifiantDerive,
  identifiantDerive,
  mesurerBitsParPosition,
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

/* =====================================================================
 *  §4 — Le garde-fou d'entropie, interrogé DANS LE SENS OÙ IL PARLE
 * =====================================================================
 *
 *  Constat **Q-26** : ce contrôle mesurait une LONGUEUR là où la convention
 *  norme une ENTROPIE. `alea.length × log2(36)` vaut 129,2 quel que soit le
 *  contenu — un remplissage de vingt-quatre zéros suivi d'un signe le
 *  satisfaisait aussi bien que cent vingt-huit bits tirés au sort.
 *
 *  Le remède mesure position par position. Et il a apporté ce qui manquait
 *  encore plus : le contrôle prend désormais **son générateur en paramètre**.
 *  Avant cette couture, éprouver un refus exigeait de recopier `dist/` et d'y
 *  réécrire une constante — assez pénible pour n'être jamais refait, et c'est
 *  précisément pour cela que la version précédente a survécu un lot entier en
 *  étant vide. C'est la leçon d'`exigerSilence` portée au code de production :
 *  rendre le mécanisme interrogeable dans le sens où il parle.
 * ===================================================================== */

describe('La mesure d’entropie mesure une ENTROPIE (constat Q-26)', () => {
  /** L'alphabet du suffixe, tel que `enBase36` le produit. */
  const SIGNES = '0123456789abcdefghijklmnopqrstuvwxyz';
  const LONGUEUR = 25;

  /** 512 parts aléatoires réelles, prélevées comme le contrôle le fait. */
  function aleasReels(combien = 512) {
    return Array.from({ length: combien }, () => engendrerIdentifiant('CTRL').split('-')[2]);
  }

  test('LA MESURE EST JUSTE : 128,08 bits sur les sorties réelles', async () => {
    // ── Pourquoi figer un NOMBRE, et pas seulement un seuil ─────────────────
    //
    // Un seuil dit « au-dessus de la barre ». Ce nombre-ci dit « la mesure lit
    // toujours le bon objet » : s'il dérive, c'est que l'échantillon, l'alphabet
    // ou la position lue ont changé — bien avant qu'un plancher ne bouge. C'est
    // le contrôle qui détecte qu'on a cessé de lire la source.
    //
    // 128,08 et non 128,00 : la première position ne prend que 16 valeurs, parce
    // que `enBase36` rend un nombre de 128 bits sur 25 signes et que le signe de
    // tête est borné. Les 24 autres prennent les 36. Le majorant vaut donc
    // log2(16) + 24 × log2(36) ≈ 128,08.
    const mesure = mesurerBitsParPosition(aleasReels());

    assert.equal(mesure.longueur, LONGUEUR, 'La part aléatoire fait 25 signes.');
    assert.ok(
      Math.abs(mesure.bits - 128.08) <= 0.2,
      `La mesure rend ${mesure.bits.toFixed(3)} bits au lieu de 128,08 ± 0,2. Un nombre qui ` +
        'dérive dit que la mesure ne mesure plus le même objet, avant même qu’un seuil ne bouge. ' +
        `Symboles par position : ${mesure.symbolesParPosition.join(',')}`,
    );

    // ── Et ce n'est PAS la longueur ─────────────────────────────────────────
    // Le nombre que rendait la version fautive, sur les mêmes données.
    assert.ok(
      Math.abs(mesure.bits - LONGUEUR * Math.log2(36)) > 1,
      `La mesure rend exactement « longueur × log2(36) » (${(LONGUEUR * Math.log2(36)).toFixed(3)}) : ` +
        'c’est la régression du constat Q-26, et elle est indétectable par un seuil.',
    );
  });

  test('UN REMPLISSAGE a la bonne longueur et presque aucun bit', async () => {
    // Le contre-exemple qui a donné son nom au constat : 24 zéros et un signe
    // qui varie. Vingt-cinq signes, alphabet conforme — et rien dedans.
    const bourrage = Array.from({ length: 512 }, (_, i) => `${'0'.repeat(24)}${SIGNES[i % 36]}`);
    const mesure = mesurerBitsParPosition(bourrage);

    assert.equal(mesure.longueur, LONGUEUR, 'Le remplissage a bien la LONGUEUR attendue…');
    assert.ok(
      mesure.bits < 52,
      `…et il doit être vu pour ce qu'il est : ${mesure.bits.toFixed(2)} bits, sous le plancher ` +
        'normé. Une chaîne longue n’est pas une chaîne aléatoire.',
    );

    // Contrôle symétrique : sur les vraies sorties, la même fonction rend 128.
    assert.ok(
      mesurerBitsParPosition(aleasReels()).bits > 120,
      'Sans quoi cette fonction serait satisfaite par une mesure qui rend toujours zéro.',
    );
  });
});

describe('Les deux planchers du garde-fou, et le canari (constats Q-1, Q-26)', () => {
  const SIGNES = '0123456789abcdefghijklmnopqrstuvwxyz';

  /**
   * Un générateur de la BONNE forme dont la part aléatoire ne porte que
   * `signes` signes réellement tirés, le reste étant du remplissage.
   */
  function generateurRemplissage(signes) {
    return (prefixe) => {
      let variable = '';
      for (let i = 0; i < signes; i += 1) variable += SIGNES[randomBytes(1)[0] % 36];
      return `${prefixe}-${String(Date.now())}-${'0'.repeat(25 - signes)}${variable}`;
    };
  }

  /** Les anomalies rendues, étiquetées par la famille à laquelle elles appartiennent. */
  function familles(anomalies) {
    return anomalies.map((texte) =>
      /plancher NORMÉ/.test(texte) ? 'norme'
        : /plancher propre/.test(texte) ? 'propre'
          : /suffixes distincts/.test(texte) ? 'collision'
            : /la forme/.test(texte) ? 'forme'
              : 'inconnue');
  }

  test('SOUS LE PLANCHER NORMÉ : le refus cite la norme, et le §2', async () => {
    // Neuf signes ≈ 46,5 bits : sous les 52 que le CONVENTIONS.md §2 impose à
    // TOUS les générateurs du produit.
    const anomalies = verifierGenerateurIdentifiants(generateurRemplissage(9));
    assert.deepEqual(familles(anomalies), ['norme'], JSON.stringify(anomalies).slice(0, 400));
    assert.match(anomalies[0], /CONVENTIONS\.md §2/, 'Le refus doit renvoyer à la règle qu’il applique.');
    assert.match(
      anomalies[0],
      /46[.,]\d|4\d[.,]\d bits/,
      `Et DIRE ce qu'il a mesuré : ${anomalies[0]}`,
    );

    // Contrôle symétrique : le générateur réel ne déclenche rien.
    assert.deepEqual(verifierGenerateurIdentifiants(), []);
  });

  test('LES DEUX PLANCHERS SONT DISTINCTS : 46 bits et 57 bits ne rendent pas le même verdict', async () => {
    // ── Pourquoi ce couple, et pas deux essais séparés ──────────────────────
    //
    // Le second plancher — celui du générateur lui-même, 120 bits — n'a de sens
    // que s'il se distingue du premier. Un `else if` supprimé, ou une constante
    // ramenée à zéro, ferait tomber les deux cas dans la même branche : chaque
    // essai pris à part resterait vert, et le produit aurait cessé de dire
    // « il satisfait la norme, mais il n'est plus celui que le §2 décrit ».
    const sousLaNorme = familles(verifierGenerateurIdentifiants(generateurRemplissage(9)));
    const entreLesDeux = familles(verifierGenerateurIdentifiants(generateurRemplissage(11)));

    assert.deepEqual(sousLaNorme, ['norme'], '46 bits relèvent du plancher NORMÉ…');
    assert.deepEqual(entreLesDeux, ['propre'], '…et 57 bits du plancher PROPRE, pas du normé.');
    assert.notDeepEqual(
      sousLaNorme,
      entreLesDeux,
      'Les deux branches doivent rendre des verdicts DIFFÉRENTS : confondues, elles ne ' +
        'distinguent plus « en deçà de la règle » de « en deçà de ce qu’on a promis ».',
    );

    // Le message du plancher propre dit comment l'affaiblir légitimement.
    const propre = verifierGenerateurIdentifiants(generateurRemplissage(11))[0];
    assert.match(propre, /DEUX gestes/, `Il doit dire que l'affaiblissement se déclare : ${propre}`);
  });

  test('LE CANARI VOIT CE QUE LA MESURE ADMET : une graine étroite', async () => {
    // ── La seule famille que la mesure par position ne peut pas voir ────────
    //
    // Un condensat d'une graine de vingt bits : chaque position varie sur tout
    // l'alphabet, donc la mesure majore à ~129 bits — et elle a raison, c'est un
    // MAJORANT. Ce qui trahit la graine est la répétition, et elle ne se voit
    // qu'en N². C'est pour cette famille-là, et pour elle seule, que le canari
    // de collision existe.
    const grainesEtroites = () => {
      const graine = randomBytes(3).readUIntBE(0, 3) & 0xf_ff_ff; // 20 bits
      return createHash('sha256').update(String(graine)).digest('base64url')
        .toLowerCase().replace(/[^0-9a-z]/g, '0').slice(0, 25);
    };

    // La mesure par position, elle, ADMET : c'est ce qui rend le canari nécessaire.
    assert.ok(
      mesurerBitsParPosition(Array.from({ length: 512 }, grainesEtroites)).bits > 52,
      'Le scénario EXIGE que la mesure par position soit aveugle ici : sinon le canari ne ' +
        'serait pas la seule chose qui parle, et cet essai ne prouverait pas ce qu’il dit.',
    );

    const anomalies = verifierGenerateurIdentifiants(
      (prefixe) => `${prefixe}-${String(Date.now())}-${grainesEtroites()}`,
    );
    assert.deepEqual(familles(anomalies), ['collision'], JSON.stringify(anomalies).slice(0, 400));
    assert.match(anomalies[0], /clé primaire/, `Et il dit ce que cela coûte : ${anomalies[0]}`);

    // Contrôle symétrique : le générateur réel ne fait jamais crier le canari.
    assert.equal(
      familles(verifierGenerateurIdentifiants()).includes('collision'),
      false,
      'Un canari qui crie sur le générateur réel ferait refuser tout démarrage.',
    );
  });

  test('LA FORME EST VÉRIFIÉE SUR TOUT L’ÉCHANTILLON, pas sur un tirage', async () => {
    // Un générateur qui se dégrade par intermittence passait une fois sur deux
    // quand la forme n'était contrôlée que sur le premier tirage. Ici, une
    // rupture sur mille suffit à faire refuser.
    let rang = 0;
    const intermittent = (prefixe) => {
      rang += 1;
      return rang % 1000 === 0 ? `${prefixe}--${String(rang)}` : engendrerIdentifiant(prefixe);
    };
    const anomalies = verifierGenerateurIdentifiants(intermittent);
    assert.deepEqual(familles(anomalies), ['forme'], JSON.stringify(anomalies).slice(0, 400));
    assert.match(anomalies[0], /CTRL--/, `Le refus doit MONTRER le tirage fautif : ${anomalies[0]}`);

    // Contrôle symétrique : sur le générateur réel, la forme n'est jamais signalée.
    assert.equal(familles(verifierGenerateurIdentifiants()).includes('forme'), false);
  });
});

describe('La couture d’essai n’est pas une porte dérobée', () => {
  test('« verifierRegistre » appelle le contrôle SANS argument', async () => {
    // ── Pourquoi cet essai existe ───────────────────────────────────────────
    //
    // Le paramètre `tirer` est ce qui rend le garde-fou éprouvable. C'est aussi,
    // exactement, ce qui permettrait un jour au service de vérifier un
    // générateur AUTRE que celui qu'il emploie — un contrôle vert sur une
    // fonction que personne n'appelle. On fige donc que le point de démarrage
    // l'appelle à vide, et que le défaut du paramètre est le vrai générateur.
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'entites', 'index.ts'), 'utf8');

    const debut = source.indexOf('export function verifierRegistre');
    assert.notEqual(debut, -1, 'Le point de vérification unique a disparu ou changé de nom.');
    const fin = source.indexOf('\n}\n', debut);
    assert.ok(fin > debut, 'Corps de « verifierRegistre » illisible.');
    const corps = source.slice(debut, fin);

    const appels = corps.match(/verifierGenerateurIdentifiants\s*\(([^)]*)\)/g) ?? [];
    assert.equal(appels.length, 1, `Un seul appel attendu, trouvé ${String(appels.length)} : ${appels.join(' · ')}`);
    assert.equal(
      appels[0],
      'verifierGenerateurIdentifiants()',
      'Le démarrage doit éprouver le générateur qu’il EMPLOIE, pas un autre : la couture ' +
        'd’essai deviendrait sinon une porte dérobée.',
    );

    // Et le défaut du paramètre est bien le générateur réel.
    const declaration = source.slice(source.indexOf('export function verifierGenerateurIdentifiants'));
    assert.match(
      declaration.slice(0, 200),
      /tirer:\s*\(prefixe: string\) => string = engendrerIdentifiant/,
      'Le paramètre doit avoir « engendrerIdentifiant » pour valeur par défaut.',
    );

    // Contrôle de morsure du balayage : le corps lu doit être CELUI de la
    // fonction, et le motif doit savoir dire non.
    assert.equal(
      corps.includes('export function verifierGenerateurIdentifiants'),
      false,
      'Le balayage déborde sur la déclaration : il verrait un appel là où il n’y en a pas.',
    );
    assert.equal(
      /verifierGenerateurIdentifiants\s*\(([^)]*)\)/.test('function verifierRegistre(c) { return []; }'),
      false,
    );
  });
});
