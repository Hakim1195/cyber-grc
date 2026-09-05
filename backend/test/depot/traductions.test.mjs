/**
 * traductions.test.mjs — LE CONTRÔLE MÉCANIQUE DU §37.2.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `backend/db/CONVENTIONS.md` §37.2 pose la règle qui décide de la forme du lot
 * L10 — *une clé manquante rend LA CLÉ, jamais le texte français* — et ajoute,
 * dans la même phrase, **« et un contrôle mécanique, sans quoi la règle est une
 * intention »**. Le voici.
 *
 * Il **découvre** les clés que les écrans emploient et les confronte aux deux
 * dictionnaires **dans les deux sens** :
 *
 *   · une clé employée sans traduction → l'écran affichera `risques.titre` ;
 *   · une traduction que plus personne n'emploie → le dictionnaire pourrit, et
 *     le traducteur suivant travaille pour rien.
 *
 * ── CE QU'IL EXIGE COMME MATIÈRE, ET POURQUOI ──────────────────────────────
 *
 * Un dictionnaire vide rendrait « aucune clé manquante » **vrai**. Un balayage
 * qui ne trouverait aucun appel `t("…")` rendrait « aucune traduction inutile »
 * **vrai** aussi. Ce sont exactement les deux verts sans matière que la vague 3
 * a payés deux fois (constats Q-108 et Q-116, `CLAUDE.md` §8) : *un essai vert
 * qui n'a rien eu à mesurer rend le même verdict qu'un essai vert qui a tout
 * mesuré*. Chaque famille ci-dessous commence donc par exiger de la matière, et
 * le plancher est chiffré.
 *
 * ── CE QU'IL CONTRÔLE EN PLUS, ET QUI N'EST PAS DANS LE §37.2 ──────────────
 *
 * L'**injection**. Une chaîne traduite qui porte une valeur (« Pour traiter le
 * risque : {nom} ») est le point d'injection que ce lot introduit : la donnée
 * utilisateur y disparaît à l'œil du relecteur, alors qu'elle passait
 * visiblement par `escapeHtml` avant. Deux contrôles s'en chargent, et
 * ensemble ils couvrent les deux moitiés de la chaîne :
 *
 *   · **la moitié statique** — aucune valeur de dictionnaire ne porte `<`
 *     ni `>`, donc elle est inerte une fois injectée en `innerHTML` ;
 *   · **la moitié dynamique** — dans une interpolation de gabarit, un appel à
 *     `t(` AVEC valeurs est refusé ; il faut `tHtml(`, qui échappe.
 *
 * ── CE QU'IL NE COUVRE PAS, ET C'EST ÉCRIT PLUTÔT QUE TU ───────────────────
 *
 *  · **le français resté en dur**. Aucun contrôle ne sait distinguer une phrase
 *    d'interface d'un commentaire, d'un nom de norme ou d'une donnée d'essai ;
 *    prétendre le mesurer rendrait des verdicts qu'on apprend à ignorer
 *    (`CONVENTIONS.md` §17.5). Ce que ce fichier tient à la place est un
 *    **plancher par écran converti** : un écran qui perdrait ses traductions
 *    fait rougir, et la couverture ne peut donc que monter.
 *  · **la qualité d'une traduction**. Un contresens passe. C'est un travail de
 *    relecture humaine, et le dictionnaire est écrit pour la rendre possible.
 *
 * Prérequis : aucun. Ce contrôle ne monte ni base, ni serveur, ni navigateur.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, test } from 'node:test';

import { RACINE_FRONTEND } from '../aide/serveur.mjs';

const RACINE_I18N = join(RACINE_FRONTEND, 'js', 'i18n');

/**
 * Le préfixe des **valeurs stockées** (§37.3).
 *
 * ⚠️ Ces clés-là ne sont jamais citées littéralement : le produit écrit
 * `I18n.valeur(enregistrement.statut)`, où la valeur vient de la base. Les
 * traiter comme les autres ferait déclarer « traduction que plus personne
 * n'emploie » sur `valeur.conforme`, qui est employée à chaque ligne de tableau.
 *
 * C'est une exception, et elle est **nommée** plutôt que devinée : toute autre
 * clé doit se retrouver dans le code, sinon elle sort du dictionnaire.
 */
const PREFIXE_DYNAMIQUE = 'valeur.';

/* =====================================================================
 *  Les dictionnaires, chargés SANS étape de compilation (§37.1)
 * ===================================================================== */

/**
 * Exécute `fr.js` / `en.js` dans un bac à sable et rend les tables.
 *
 * On **exécute les fichiers du dépôt**, on ne recopie pas leur contenu : un
 * essai qui tiendrait sa propre copie mesurerait sa copie. Le bac à sable ne
 * fournit qu'un `window.I18n.enregistrer`, ce qui suffit — et prouve au passage
 * qu'un dictionnaire n'a besoin de rien d'autre (§37.1).
 */
function chargerDictionnaires() {
  const tables = {};
  const bac = createContext({
    window: {
      I18n: {
        enregistrer(code, table) {
          tables[code] = table;
        },
      },
    },
  });
  for (const fichier of ['fr.js', 'en.js']) {
    const chemin = join(RACINE_I18N, fichier);
    runInContext(readFileSync(chemin, 'utf8'), bac, { filename: chemin });
  }
  return tables;
}

/* =====================================================================
 *  La découverte : quelles clés les écrans emploient-ils ?
 * ===================================================================== */

/** Tous les fichiers d'interface, dictionnaires et bibliothèques exclus. */
function fichiersDInterface(repertoire = RACINE_FRONTEND, resultat = []) {
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    if (entree.name === 'lib' || entree.name === 'i18n') continue;
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) fichiersDInterface(chemin, resultat);
    else if (['.js', '.html'].includes(extname(entree.name))) resultat.push(chemin);
  }
  return resultat;
}

/**
 * Retire les commentaires — une clé citée dans une phrase n'est pas un emploi.
 *
 * ⚠️ Un commentaire de bloc est remplacé par autant de sauts de ligne qu'il en
 * portait : sans cela les numéros de ligne se décalent et le refus envoie le
 * lecteur à la mauvaise ligne. C'est la leçon de `imports-commites.test.mjs`,
 * apprise sur un message qui annonçait la ligne 28 pour un défaut de la 76ᵉ.
 */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => '\n'.repeat((bloc.match(/\n/g) ?? []).length))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** `t("clé")`, `tHtml('clé')`, `I18n.t("clé")` — premier argument littéral. */
const APPELS = /(?:I18n\s*\.\s*)?\bt(?:Html)?\(\s*(["'])((?:[^"'\\]|\\.)+?)\1/g;
/** `data-i18n="clé"`, et ses variantes d'attribut. */
const ATTRIBUTS = /data-i18n(?:-title|-aria-label|-placeholder)?\s*=\s*"([^"]+)"/g;

/**
 * Les clés employées, avec l'endroit où chacune l'est.
 * @returns {Map<string, string[]>} clé → fichiers (relatifs) qui l'emploient
 */
function clesEmployees() {
  const trouvees = new Map();
  const ajouter = (cle, chemin) => {
    const relatif = relative(RACINE_FRONTEND, chemin).split('\\').join('/');
    const liste = trouvees.get(cle) ?? [];
    if (!liste.includes(relatif)) liste.push(relatif);
    trouvees.set(cle, liste);
  };
  for (const chemin of fichiersDInterface()) {
    const brut = readFileSync(chemin, 'utf8');
    const code = extname(chemin) === '.js' ? sansCommentaires(brut) : brut;
    for (const m of code.matchAll(APPELS)) ajouter(m[2], chemin);
    for (const m of brut.matchAll(ATTRIBUTS)) ajouter(m[1], chemin);
  }
  return trouvees;
}

/**
 * Toutes les chaînes littérales du frontend, quelle que soit leur place.
 *
 * Sert **uniquement** au sens 2 (voir l'essai correspondant) : une clé citée
 * comme valeur d'une table est référencée, même si aucun appel ne la nomme.
 */
function clesCitees() {
  const citees = new Set();
  const litteral = /(["'])((?:[^"'\\\n]|\\.)+?)\1/g;
  for (const chemin of fichiersDInterface()) {
    const source = readFileSync(chemin, 'utf8');
    for (const m of source.matchAll(litteral)) citees.add(m[2]);
  }
  return citees;
}

/* =====================================================================
 *  La règle d'échappement : `${ t("…", valeurs) }` est refusé
 * ===================================================================== */

/**
 * Trouve, dans un gabarit, les appels à `t(` AVEC valeurs.
 *
 * On ne se contente pas d'une expression régulière : il faut savoir si l'appel
 * porte un **second argument**, donc apparier les parenthèses en ignorant ce
 * qui est entre guillemets. Un motif naïf accuserait `t("a, b")` — une virgule
 * dans une chaîne — et un contrôle qui accuse à tort finit par être désarmé.
 *
 * @returns {{ligne: number, extrait: string}[]}
 */
function interpolationsNonEchappees(source) {
  const fautes = [];
  const ancre = /\$\{\s*t\(/g;
  for (const m of source.matchAll(ancre)) {
    const ouvrante = source.indexOf('(', m.index);
    let profondeur = 0;
    let guillemet = null;
    let virguleAuSommet = false;
    let i = ouvrante;
    for (; i < source.length; i++) {
      const c = source[i];
      if (guillemet !== null) {
        if (c === '\\') { i++; continue; }
        if (c === guillemet) guillemet = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { guillemet = c; continue; }
      if (c === '(' || c === '[' || c === '{') { profondeur++; continue; }
      if (c === ')' || c === ']' || c === '}') {
        profondeur--;
        if (profondeur === 0) break;
        continue;
      }
      if (c === ',' && profondeur === 1) virguleAuSommet = true;
    }
    if (!virguleAuSommet) continue;
    fautes.push({
      ligne: source.slice(0, m.index).split('\n').length,
      extrait: source.slice(m.index, Math.min(i + 1, m.index + 120)),
    });
  }
  return fautes;
}

/* =====================================================================
 *  LES ÉCRANS CONVERTIS, ET LEUR PLANCHER
 * ---------------------------------------------------------------------
 *  ⚠️ **Liste écrite à la main, et c'est ici le bon outil** (`CLAUDE.md` §3) :
 *  aucun catalogue ne peut deviner qu'un écran est « censé » être traduit, et
 *  son omission **échoue bruyamment** — un écran qui perd ses traductions fait
 *  rougir, en nommant le fichier et le compte attendu.
 *
 *  Les chiffres sont ceux **mesurés à la livraison du lot L10**, arrondis vers
 *  le bas. Ils disent une seule chose : *la couverture ne redescend pas*. Les
 *  relever quand un écran gagne des clés est normal ; les baisser demande de
 *  dire pourquoi.
 * ===================================================================== */
const PLANCHERS = Object.freeze({
  'index.html': 30,
  'js/app.js': 30,
  'js/core/ui.js': 6,
  'js/core/vault.js': 25,
  'js/modules/risques.js': 60,
  'js/modules/actions.js': 35,
  'js/modules/incidents.js': 45,
  'js/modules/exigences.js': 40,
  'js/modules/dashboard.js': 25,
  'js/modules/conformite.js': 8,
});

/** Combien de clés distinctes un fichier emploie-t-il ? */
function comptesParFichier(employees) {
  const compte = new Map();
  for (const [, fichiers] of employees) {
    for (const f of fichiers) compte.set(f, (compte.get(f) ?? 0) + 1);
  }
  return compte;
}

/* =====================================================================
 *  Les essais
 * ===================================================================== */

describe('§37.2 — les clés employées et les dictionnaires, dans les deux sens', () => {
  const tables = chargerDictionnaires();
  const employees = clesEmployees();

  test('LA MATIÈRE : sans elle, tout ce qui suit serait vert pour rien', () => {
    assert.ok(
      tables.fr !== undefined && tables.en !== undefined,
      'Les deux dictionnaires doivent s’enregistrer en s’exécutant. Ni « fr » ni « en » ' +
        `n’est arrivé : ${JSON.stringify(Object.keys(tables))}. Le §37.1 interdit toute ` +
        'étape de compilation — un dictionnaire est un fichier qui pose son objet sur `window`.',
    );
    assert.ok(
      Object.keys(tables.fr).length >= 300,
      `Le dictionnaire français ne porte que ${String(Object.keys(tables.fr).length)} clé(s). ` +
        'Un dictionnaire vide rendrait « aucune clé manquante » VRAI : ce contrôle exige ' +
        'de la matière avant de conclure quoi que ce soit.',
    );
    assert.ok(
      employees.size >= 200,
      `Seulement ${String(employees.size)} clé(s) employée(s) trouvée(s) dans le frontend. ` +
        'Le balayage ne reconnaît probablement plus les appels : il cherche `t("…")`, ' +
        '`tHtml("…")` et les attributs `data-i18n`. Un balayage qui ne trouve rien rendrait ' +
        '« aucune traduction inutile » VRAI pour toujours.',
    );
    const fichiers = new Set([...employees.values()].flat());
    assert.ok(
      fichiers.size >= 8,
      `Seulement ${String(fichiers.size)} fichier(s) emploient des clés : ` +
        `${[...fichiers].join(', ')}.`,
    );
  });

  test('SENS 1 — aucune clé employée ne manque à un dictionnaire', () => {
    const manquantes = [];
    for (const [cle, fichiers] of employees) {
      for (const langue of ['fr', 'en']) {
        if (!Object.prototype.hasOwnProperty.call(tables[langue], cle)) {
          manquantes.push(`${langue} : ${cle}   (employée dans ${fichiers.join(', ')})`);
        }
      }
    }
    assert.deepEqual(
      manquantes,
      [],
      'Ces clés sont employées par un écran et absentes du dictionnaire. À l’exécution, ' +
        'l’écran affichera LA CLÉ EN CLAIR (§37.2) — c’est voulu, voyant, et ce n’est pas ' +
        'un état livrable :\n' +
        manquantes.map((m) => `    · ${m}`).join('\n'),
    );
  });

  test('SENS 2 — aucune traduction n’est orpheline', () => {
    // Le second sens est celui qui fait pourrir un dictionnaire : personne ne
    // remarque une clé morte, et le traducteur suivant la traduit pour rien.
    //
    // ── POURQUOI CE SENS-CI EST PLUS LARGE QUE L'AUTRE, ET C'EST VOULU ──────
    //
    // Toutes les clés ne sont pas citées DANS un appel : le fil d'Ariane tient
    // sa table `ROUTE_META = { "/risques": { s: "fil.section.risques", … } }`,
    // et les clés y sont des VALEURS, résolues plus tard par `t(meta.s)`. Les
    // déclarer orphelines serait faux, et pousserait à supprimer des clés bien
    // vivantes — le pire verdict que ce contrôle puisse rendre.
    //
    // On demande donc ici quelque chose de plus faible, et de suffisant : *la
    // clé apparaît-elle quelque part dans le source du frontend ?* Le sens 1,
    // lui, reste strict — il ne reconnaît qu'un appel ou un attribut, formes
    // qui ne peuvent pas produire de faux positif.
    const citees = clesCitees();
    const orphelines = Object.keys(tables.fr).filter(
      (cle) => !employees.has(cle) && !citees.has(cle) && !cle.startsWith(PREFIXE_DYNAMIQUE),
    );
    assert.deepEqual(
      orphelines,
      [],
      'Ces clés vivent dans les dictionnaires et aucun écran ne les emploie. Retirez-les, ' +
        'ou employez-les — un dictionnaire qu’on ne peut plus confronter au produit se ' +
        'périme sans que personne ne le voie :\n' +
        orphelines.map((c) => `    · ${c}`).join('\n') +
        `\n\n  (Le préfixe « ${PREFIXE_DYNAMIQUE} » est exempté : ces clés sont résolues à ` +
        'l’exécution depuis la valeur STOCKÉE — `I18n.valeur(enr.statut)` — et ne peuvent ' +
        'donc pas apparaître littéralement dans le code.)',
    );
  });

  test('LES DEUX DICTIONNAIRES PORTENT EXACTEMENT LES MÊMES CLÉS', () => {
    const fr = Object.keys(tables.fr);
    const en = Object.keys(tables.en);
    assert.deepEqual(
      fr.filter((c) => !Object.prototype.hasOwnProperty.call(tables.en, c)),
      [],
      'Ces clés sont en français et pas en anglais : l’écran anglais affichera la clé.',
    );
    assert.deepEqual(
      en.filter((c) => !Object.prototype.hasOwnProperty.call(tables.fr, c)),
      [],
      'Ces clés sont en anglais et pas en français : elles ne servent à personne.',
    );
    // L'ordre, en plus de l'ensemble : c'est ce qui rend les deux fichiers
    // relisibles côte à côte par quelqu'un qui ne connaît pas le code.
    assert.deepEqual(
      en,
      fr,
      'Les deux dictionnaires portent les mêmes clés mais pas dans le même ordre. ' +
        'Ce n’est pas de la coquetterie : une relecture humaine côte à côte n’est ' +
        'possible que si les deux fichiers se déroulent pareil.',
    );
  });

  test('AUCUNE VALEUR NE PORTE DE BALISE — la moitié statique est inerte', () => {
    // C'est la première des deux barrières contre l'injection : quoi qu'on
    // écrive dans un dictionnaire, cela ne peut pas ouvrir un élément.
    const fautives = [];
    for (const langue of ['fr', 'en']) {
      for (const [cle, valeur] of Object.entries(tables[langue])) {
        if (/[<>]/.test(String(valeur))) fautives.push(`${langue} : ${cle} = ${valeur}`);
      }
    }
    assert.deepEqual(
      fautives,
      [],
      'Une valeur de dictionnaire ne doit jamais porter « < » ni « > » : elle est injectée ' +
        'en `innerHTML`, et c’est cette interdiction qui la rend inerte. Mettez le balisage ' +
        'dans le gabarit, et le TEXTE dans le dictionnaire :\n' +
        fautives.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('LES MOTIFS D’INTERPOLATION CONCORDENT ENTRE LES DEUX LANGUES', () => {
    // Un `{n}` oublié en anglais, et la phrase perd son chiffre — en silence,
    // parce qu'une valeur non employée ne lève rien.
    const motifs = (v) => [...String(v).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
    const ecarts = [];
    for (const cle of Object.keys(tables.fr)) {
      const a = motifs(tables.fr[cle]);
      const b = motifs(tables.en[cle] ?? '');
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        ecarts.push(`${cle} : fr {${a.join(', ')}} ≠ en {${b.join(', ')}}`);
      }
    }
    assert.deepEqual(
      ecarts,
      [],
      'Les valeurs substituées d’une clé doivent être les mêmes dans les deux langues. ' +
        'Un motif absent d’un côté laisse un trou dans la phrase, sans erreur :\n' +
        ecarts.map((e) => `    · ${e}`).join('\n'),
    );
  });
});

describe('§37 — l’injection que ce lot introduit, et ce qui la ferme', () => {
  test('DANS UN GABARIT, UNE VALEUR INTERPOLÉE PASSE PAR `tHtml`, JAMAIS PAR `t`', () => {
    // Seconde barrière : la moitié DYNAMIQUE de la chaîne. `t` substitue la
    // valeur telle quelle — c'est ce qu'il faut pour `confirm()` ou `alert()`,
    // et c'est une injection dans un `innerHTML`.
    const fautes = [];
    let examines = 0;
    for (const chemin of fichiersDInterface()) {
      if (extname(chemin) !== '.js') continue;
      const source = sansCommentaires(readFileSync(chemin, 'utf8'));
      examines++;
      const relatif = relative(RACINE_FRONTEND, chemin).split('\\').join('/');
      for (const f of interpolationsNonEchappees(source)) {
        fautes.push(`${relatif}:${String(f.ligne)}  ${f.extrait.replace(/\s+/g, ' ')}`);
      }
    }
    assert.ok(examines >= 40, `Balayage suspect : ${String(examines)} fichier(s) examiné(s).`);
    assert.deepEqual(
      fautes,
      [],
      'Ces appels substituent une valeur DANS UN GABARIT sans l’échapper. Si la valeur ' +
        'vient de l’utilisateur — un nom de risque, une raison sociale —, c’est une ' +
        'injection HTML. Remplacez `t(` par `tHtml(`, qui échappe chaque valeur :\n' +
        fautes.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('LE CONTRÔLE D’INJECTION MORD — une faute fabriquée est bien vue', () => {
    // ⚠️ Un contrôle qu'on n'a jamais vu rougir est un contrôle dont on ignore
    // s'il regarde quelque chose (constat Q-64 : le banc qui se mesure lui-même).
    const fautif = 'const x = `<p>${t("risques.pourTraiter", { nom: r.nom })}</p>`;';
    assert.equal(
      interpolationsNonEchappees(fautif).length,
      1,
      'Le détecteur doit voir un `t(` AVEC valeurs dans une interpolation de gabarit.',
    );
    const sain = 'const x = `<p>${tHtml("risques.pourTraiter", { nom: r.nom })}</p>`;';
    assert.equal(interpolationsNonEchappees(sain).length, 0, '`tHtml` est la forme attendue.');
    const sansValeur = 'const x = `<h1>${t("risques.titre")}</h1>`;';
    assert.equal(
      interpolationsNonEchappees(sansValeur).length,
      0,
      'Un `t(` SANS valeurs n’injecte rien : la valeur de dictionnaire est inerte (contrôle ' +
        'précédent), et l’accuser ferait rougir tout le produit pour rien.',
    );
    const virguleDansLaChaine = 'const x = `${t("commun.aucuneLiaison, vraiment")}`;';
    assert.equal(
      interpolationsNonEchappees(virguleDansLaChaine).length,
      0,
      'Une virgule DANS la chaîne n’est pas un second argument : un contrôle qui accuse ' +
        'à tort finit par être désarmé.',
    );
  });
});

describe('§37 — la couverture par écran ne redescend pas', () => {
  test('CHAQUE ÉCRAN CONVERTI EMPLOIE AU MOINS SON PLANCHER DE CLÉS', () => {
    const comptes = comptesParFichier(clesEmployees());
    const sous = [];
    for (const [fichier, plancher] of Object.entries(PLANCHERS)) {
      const vu = comptes.get(fichier) ?? 0;
      if (vu < plancher) sous.push(`${fichier} : ${String(vu)} clé(s), plancher ${String(plancher)}`);
    }
    assert.deepEqual(
      sous,
      [],
      'Ces écrans emploient moins de clés qu’à la livraison du lot L10. Soit une ' +
        'traduction a été retirée au profit d’un texte en dur — c’est une régression, et ' +
        'elle ne se voit pas autrement —, soit le fichier a été renommé et ce plancher ' +
        'doit suivre :\n' + sous.map((s) => `    · ${s}`).join('\n'),
    );
  });

  test('LE PLANCHER PORTE SUR DES FICHIERS QUI EXISTENT', () => {
    // Un plancher sur un fichier absent est un contrôle qui ne contrôle rien :
    // `comptes.get()` rendrait 0 et l'essai rougirait — mais un plancher à 0
    // passerait en silence. On exige donc l'existence, séparément.
    const absents = Object.keys(PLANCHERS).filter((f) => {
      try {
        return !statSync(join(RACINE_FRONTEND, f)).isFile();
      } catch {
        return true;
      }
    });
    assert.deepEqual(absents, [], `Fichiers nommés dans PLANCHERS et introuvables : ${absents.join(', ')}`);
  });
});

/* =====================================================================
   §37.3 — `I18n.valeur()` EST UN PASSE-PLAT, ET IL PART DANS `innerHTML`

   Constat **Q-203** de la porte S6, mesuré SOUS LA CSP RÉELLE : l'élément
   entre dans le DOM, `position:fixed` s'applique, seul le gestionnaire est
   bloqué. La CSP arrête l'exécution, pas l'habillage — un cadre superposé
   suffit à tromper.

   Le chemin est celui-ci, et il n'existait pas avant l'internationalisation :
   `valeur()` cherche `"valeur." + v` au dictionnaire et, **si la clé manque,
   rend `v` tel quel**. Or `v` est une valeur STOCKÉE. Les modules employaient
   auparavant une table fermée (`STATUTS.find(...) || STATUTS[0]`) qui rendait
   toujours une constante du dépôt ; le passe-plat a ouvert la base jusqu'au
   gabarit. C'est le pendant exact de Q-183 : l'i18n révèle des injections, et
   elle en introduit.

   ⚠️ La liste des enveloppes réputées sûres est écrite à la main — c'est ici
   le BON outil, parce qu'une omission fait **rougir** ce contrôle et oblige
   quelqu'un à trancher (`CLAUDE.md` §3, second cas). Mais on ne croit pas son
   nom : l'essai suivant **fait passer une chaîne hostile dans chacune** et
   vérifie qu'elle en ressort inerte.
   ===================================================================== */

/** Enveloppes qui échappent leur premier argument. Vérifiées, pas supposées. */
const ENVELOPPES_SURES = ['escapeHtml', 'esc', 'UI.badge', 'UI.mappedBadge'];

/** Appels à `I18n.valeur(x)` où `x` n'est PAS un littéral et rien n'échappe. */
function valeursNonEchappees(source) {
  const fautes = [];
  const lignes = source.split('\n');
  lignes.forEach((ligne, index) => {
    // ⚠️ Le qualifiant `I18n.` est EXIGÉ, et ce n'est pas de la prudence : sans
    // lui le détecteur attrape le mot « valeur(s) » dans une phrase française et
    // une fonction locale homonyme (`js/modules/groupe.js:458`). Un contrôle qui
    // accuse à tort finit désarmé. Le trou que cela ouvre — un module qui
    // aliaserait la fonction — est fermé par l'essai suivant.
    for (const m of ligne.matchAll(/\bI18n\s*\.\s*valeur\(/g)) {
      // Un littéral en argument est une constante du dépôt : inerte, et déjà
      // couvert par « aucune valeur ne porte de balise ».
      if (['"', "'", '`'].includes(ligne[m.index + m[0].length])) continue;
      const amont = ligne.slice(0, m.index);
      if (ENVELOPPES_SURES.some((e) => amont.includes(`${e}(`))) continue;
      fautes.push({ ligne: index + 1, extrait: ligne.trim().slice(0, 120) });
    }
  });
  return fautes;
}

describe('§37.3 — la valeur STOCKÉE qui traverse le dictionnaire (constat Q-203)', () => {
  test('CHAQUE ENVELOPPE RÉPUTÉE SÛRE ÉCHAPPE VRAIMENT — mesuré, pas cru sur parole', () => {
    // ⚠️ C'est la moitié qui empêche la liste ci-dessus de devenir une
    // superstition. Une enveloppe qu'on y ajoute sans qu'elle échappe
    // désarmerait le contrôle en silence — précisément ce qu'on veut éviter.
    const contexte = createContext({ window: {}, document: undefined });
    runInContext(readFileSync(join(RACINE_FRONTEND, 'js', 'core', 'ui.js'), 'utf8'), contexte);
    const UI = contexte.window.UI;
    assert.ok(UI && typeof UI.badge === 'function', '`UI.badge` doit être chargeable hors navigateur.');

    const hostile = '<img src=x onerror=alert(1)>';
    const sorties = {
      'UI.badge': UI.badge(hostile, 'status-conforme'),
      'UI.mappedBadge': UI.mappedBadge(hostile, {}, 'status-conforme'),
    };
    for (const [nom, rendu] of Object.entries(sorties)) {
      assert.ok(
        !rendu.includes('<img'),
        `« ${nom} » est réputée sûre et laisse passer une balise : ${rendu}`,
      );
      assert.ok(rendu.includes('&lt;img'), `« ${nom} » doit ÉCHAPPER, pas supprimer : ${rendu}`);
    }
  });

  test('AUCUN APPEL À `valeur()` SUR UNE DONNÉE N’ATTEINT UN GABARIT SANS ÉCHAPPEMENT', () => {
    const fautes = [];
    let appelsVus = 0;
    for (const chemin of fichiersDInterface()) {
      if (extname(chemin) !== '.js') continue;
      const source = sansCommentaires(readFileSync(chemin, 'utf8'));
      appelsVus += (source.match(/\bI18n\s*\.\s*valeur\(/g) ?? []).length;
      const relatif = relative(RACINE_FRONTEND, chemin).split('\\').join('/');
      for (const f of valeursNonEchappees(source)) {
        fautes.push(`${relatif}:${String(f.ligne)}  ${f.extrait}`);
      }
    }
    // LA MATIÈRE : sans appel à compter, l'assertion suivante serait verte
    // pour rien — et le jour où l'i18n serait retirée, on ne le saurait pas.
    assert.ok(appelsVus >= 20, `Balayage suspect : ${String(appelsVus)} appel(s) à valeur() vu(s).`);
    assert.deepEqual(
      fautes,
      [],
      '`I18n.valeur()` rend la valeur STOCKÉE telle quelle quand le dictionnaire ne la ' +
        'connaît pas. Ces appels la portent jusqu’à un gabarit sans l’échapper :\n' +
        fautes.map((f) => `    · ${f}`).join('\n') +
        '\nEnveloppez d’`escapeHtml(...)`, ou passez par `UI.badge`.',
    );
  });

  test('LE CONTRÔLE MORD — la faute exacte de Q-203 est bien vue', () => {
    const fautif = 'label: brute === "" ? t("x") : I18n.valeur(brute),';
    assert.equal(
      valeursNonEchappees('function valeur(bloc, extraire) { return bloc; }').length,
      0,
      'Une fonction LOCALE homonyme n’est pas le passe-plat du dictionnaire : l’accuser ' +
        'ferait rougir douze sites de `groupe.js` pour rien.',
    );
    assert.equal(
      valeursNonEchappees("morceaux.push(n + ' valeur(s) rendue(s) deux fois');").length,
      0,
      'Le mot « valeur(s) » dans une phrase française n’est pas un appel.',
    );
    assert.equal(valeursNonEchappees(fautif).length, 1, 'La forme exacte du constat Q-203.');
    assert.equal(
      valeursNonEchappees('label: escapeHtml(I18n.valeur(brute)),').length,
      0,
      'Le correctif retenu doit être accepté.',
    );
    assert.equal(
      valeursNonEchappees('return UI.badge(I18n.valeur(g), classePour(g, {}));').length,
      0,
      '`UI.badge` échappe — l’essai précédent le MESURE —, l’accuser ferait désarmer le contrôle.',
    );
    assert.equal(
      valeursNonEchappees('<option>${I18n.valeur("Basse")}</option>').length,
      0,
      'Un littéral est une constante du dépôt, couverte ailleurs : l’accuser ferait rougir ' +
        'trente-deux sites pour rien, et un contrôle qui accuse à tort finit désarmé.',
    );
  });

  test('LE QUALIFIANT `I18n.` NE PEUT PAS ÊTRE CONTOURNÉ PAR UN ALIAS', () => {
    // Le détecteur n'accepte que la forme qualifiée. Un module qui écrirait
    // `const { valeur } = I18n` — ou `const v = I18n.valeur` — le rendrait
    // aveugle SANS RIEN CASSER : c'est très exactement la façon dont un
    // contrôle cesse de contrôler. On interdit donc l'alias, bruyamment.
    const alias = [];
    let examines = 0;
    for (const chemin of fichiersDInterface()) {
      if (extname(chemin) !== '.js') continue;
      const source = sansCommentaires(readFileSync(chemin, 'utf8'));
      examines++;
      const relatif = relative(RACINE_FRONTEND, chemin).split('\\').join('/');
      // `const {…valeur…} = I18n`, `const x = I18n.valeur` sans appel.
      const motifs = [/\{[^}]*\bvaleur\b[^}]*\}\s*=\s*I18n\b/g, /=\s*I18n\s*\.\s*valeur\s*(?!\()/g];
      for (const motif of motifs) {
        for (const m of source.matchAll(motif)) {
          alias.push(`${relatif}  ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`);
        }
      }
    }
    assert.ok(examines >= 40, `Balayage suspect : ${String(examines)} fichier(s).`);
    assert.deepEqual(
      alias,
      [],
      'Ces écritures détachent `valeur` de `I18n` et rendent le contrôle précédent aveugle. ' +
        'Appelez `I18n.valeur(...)` en toutes lettres :\n' + alias.map((a) => `    · ${a}`).join('\n'),
    );
  });
});
