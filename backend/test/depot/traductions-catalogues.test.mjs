/**
 * traductions-catalogues.test.mjs — **la couverture de traduction des catalogues
 * se compte, elle ne se devine pas** (lot L11).
 *
 * ── Pourquoi ce contrôle a une forme différente de celui de l'interface ──────
 *
 * `test/depot/traductions.test.mjs` (lot L10) exige que **toute clé employée par
 * un module ait sa traduction**, et le repli y est bruyant : une clé manquante
 * affiche la clé. C'est juste pour un LIBELLÉ — un écran anglais à moitié
 * français aurait l'air fini.
 *
 * Ici, la même règle rendrait le produit **inutilisable**. Une exigence dont le
 * titre s'afficherait `iso-27002-2022/5.1.titre` ne serait plus une exigence :
 * elle ne se lit pas, ne s'évalue pas, ne se produit pas en audit. Le repli est
 * donc le **français**, chaîne par chaîne.
 *
 * ⚠️ **Ce qui empêche ce repli de devenir une excuse, c'est ce fichier.** Un
 * repli silencieux et non mesuré, c'est une traduction qu'on croit faite. Ici
 * elle se **compte**, référentiel par référentiel, et le compte est écrit dans
 * la sortie de l'essai — même quand il passe.
 *
 * ── Ce que cet essai refuse ─────────────────────────────────────────────────
 *
 *  · un dictionnaire **squelette** qui annoncerait 100 % : la couverture compte
 *    les chaînes RÉELLEMENT traduites, pas les clés déclarées ;
 *  · une exigence indexée par son **seul code** : deux domaines peuvent porter
 *    le même, et le texte d'une exigence apparaîtrait sous une autre — un défaut
 *    qui se lit parfaitement et qui est entièrement faux ;
 *  · une clé qui ne désigne **rien** dans le catalogue français : c'est une
 *    traduction perdue, et elle ne se voit jamais à l'écran.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { RACINE_FRONTEND } from '../aide/serveur.mjs';

/** Les six catalogues, dans l'ordre où `index.html` les charge. */
const CATALOGUES = ['ref_anssi', 'ref_iso27002', 'ref_iso27001_smsi', 'ref_nis2', 'ref_dora', 'ref_aircyber'];

/**
 * Charge les catalogues et leurs traductions **comme le navigateur le fait** :
 * une seule portée, les scripts concaténés dans l'ordre d'`index.html`.
 *
 * ⚠️ Le premier jet évaluait chaque fichier séparément en passant `Referentiels`
 * en paramètre — et échouait en « Identifier 'Referentiels' has already been
 * declared », le registre le déclarant en `const` de premier niveau. Évaluer
 * autrement que ne le fait le produit, c'est mesurer son propre montage.
 */
function chargerCatalogues(langue = 'fr') {
  const morceaux = [readFileSync(join(RACINE_FRONTEND, 'js', 'data', 'referentiels.js'), 'utf8')];
  for (const f of CATALOGUES) {
    morceaux.push(readFileSync(join(RACINE_FRONTEND, 'js', 'data', `${f}.js`), 'utf8'));
    const traduction = join(RACINE_FRONTEND, 'js', 'data', 'en', `${f}.js`);
    if (existsSync(traduction)) morceaux.push(readFileSync(traduction, 'utf8'));
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', `${morceaux.join('\n;\n')}\nreturn Referentiels;`);
  // ⚠️ La langue est un PARAMÈTRE depuis le constat Q-283 : comparer le français à
  // l'anglais exige de charger les deux, et `Referentiels.get()` rend le catalogue
  // dans la langue active — c'est le chemin du produit, pas un accès au dictionnaire.
  const fenetre = { I18n: { langue: () => langue } };
  fenetre.window = fenetre;
  return fn(fenetre);
}

describe('Les catalogues traduits : la couverture se COMPTE', () => {
  test('le mécanisme est branché, et il a de la matière à mesurer', () => {
    const R = chargerCatalogues();
    assert.equal(typeof R.registerTraduction, 'function', 'le registre doit accepter une traduction');
    assert.equal(typeof R.couverture, 'function', 'le registre doit savoir compter');

    const couverture = R.couverture('en');
    assert.equal(couverture.length, 6, 'six référentiels sont attendus');

    // ── Matière : sans catalogue chargé, « 0 % traduit » serait vrai de rien.
    const chaines = couverture.reduce((n, c) => n + c.total, 0);
    assert.ok(
      chaines >= 900,
      `Seulement ${chaines} chaînes recensées : les catalogues n'ont pas été chargés, et ` +
        'cet essai ne mesure rien.',
    );
  });

  test('LA COUVERTURE, référentiel par référentiel — écrite même au vert', () => {
    const R = chargerCatalogues();
    const couverture = R.couverture('en');
    const total = couverture.reduce((n, c) => n + c.total, 0);
    const faits = couverture.reduce((n, c) => n + c.traduits, 0);

    const lignes = couverture
      .map((c) => `  ${c.id.padEnd(18)} ${String(c.traduits).padStart(5)} / ${String(c.total).padEnd(5)}` +
        ` (${c.total === 0 ? 0 : Math.round((c.traduits / c.total) * 100)} %)`)
      .join('\n');
    console.log(`\nCouverture EN des catalogues :\n${lignes}\n  ${'TOTAL'.padEnd(18)}` +
      ` ${String(faits).padStart(5)} / ${String(total).padEnd(5)}` +
      ` (${Math.round((faits / total) * 100)} %)\n`);

    // Aucun seuil n'est imposé ici : ce que ce lot livre est déclaré au registre
    // (constat Q-185 pour l'interface, et son pendant pour les catalogues). Ce
    // qui EST imposé, c'est que le compte soit visible — un repli silencieux et
    // non mesuré est une traduction qu'on croit faite.
    assert.ok(faits >= 0);
  });

  test('AUCUNE traduction ne désigne une exigence qui n’existe pas', () => {
    const R = chargerCatalogues();
    const egarees = [];
    let verifiees = 0;

    for (const ref of R.all()) {
      const cles = new Set();
      for (const d of ref.domaines || []) {
        for (const e of d.exigences || []) cles.add(`${d.id}/${e.code}`);
      }
      // On relit le fichier de traduction pour voir ce qu'il DÉCLARE, et non ce
      // que le registre a bien voulu appliquer : une clé égarée est appliquée à
      // rien, donc invisible côté registre.
      const fichier = join(RACINE_FRONTEND, 'js', 'data', 'en',
        `ref_${{ 'anssi-hygiene': 'anssi', 'iso-27002-2022': 'iso27002', 'iso27001-smsi': 'iso27001_smsi', 'nis2-art21': 'nis2', dora: 'dora', aircyber: 'aircyber' }[ref.id]}.js`);
      if (!existsSync(fichier)) continue;
      const source = readFileSync(fichier, 'utf8');
      const bloc = source.slice(source.indexOf('exigences'));
      for (const [, cle] of bloc.matchAll(/"([^"\n]+\/[^"\n]+)"\s*:/gu)) {
        verifiees += 1;
        if (!cles.has(cle)) egarees.push(`${ref.id} → ${cle}`);
      }
    }

    assert.deepEqual(
      egarees,
      [],
      'Ces clés de traduction ne désignent aucune exigence du catalogue français : elles ne ' +
        's’afficheront JAMAIS, et personne ne le verra. Vérifier l’identifiant du domaine et ' +
        'le code — l’index est « <domaineId>/<code> ».',
    );
    console.log(`  (${verifiees} clé(s) d’exigence vérifiée(s))`);
  });
});

/* =====================================================================
   LA BARRIÈRE ANTI-BALISE, QUI NE REGARDAIT PAS ICI — constat **Q-204**

   `traductions.test.mjs` refuse depuis L11 tout `<` ou `>` dans une valeur
   de `js/i18n/` : la moitié STATIQUE des chaînes est ainsi inerte, et les
   `innerHTML` du produit peuvent l'interpoler sans l'échapper.

   Rien n'équivalait pour `js/data/en/` — c'est-à-dire pour **le double des
   chaînes**, écrites au fil de l'eau par plusieurs agents, et qui partent
   dans les mêmes gabarits. Le contrôle existait ; il ne regardait pas au bon
   endroit. C'est la même figure que le contrôle de couverture d'allow-list
   qui interrogeait la mauvaise unité systemd (Q-199).

   ⚠️ On balaie **les deux langues**. Le français est la source : une balise
   qui y entrerait s'afficherait aussi, et un contrôle qui ne regarde que la
   traduction laisse la porte ouverte du côté par lequel on entre.
   ===================================================================== */

describe('Aucune chaîne de catalogue ne porte de balise (constat Q-204)', () => {
  test('les valeurs des catalogues et de leurs traductions sont INERTES', () => {
    const fautives = [];
    let valeursVues = 0;

    /** Parcourt une valeur quelconque et rend ses chaînes, chemin compris. */
    const parcourir = (valeur, chemin, sortie) => {
      if (typeof valeur === 'string') sortie.push([chemin, valeur]);
      else if (Array.isArray(valeur)) valeur.forEach((v, i) => parcourir(v, `${chemin}[${i}]`, sortie));
      else if (valeur && typeof valeur === 'object') {
        for (const [c, v] of Object.entries(valeur)) parcourir(v, `${chemin}.${c}`, sortie);
      }
      return sortie;
    };

    // ⚠️ On DÉCOUVRE les chaînes en parcourant l'objet, plutôt que de nommer
    // les champs traduisibles. Une liste de champs manquerait celui qu'on
    // ajoutera, et la balise passerait EN SILENCE (`CLAUDE.md` §3, cas 1).
    const Referentiels = chargerCatalogues();
    for (const ref of Referentiels.all()) {
      for (const [chemin, texte] of parcourir(ref, ref.id, [])) {
        valeursVues += 1;
        if (/[<>]/u.test(texte)) fautives.push(`${chemin} = ${texte.slice(0, 90)}`);
      }
    }

    // Les traductions, lues à la source : `all()` ne rend que la langue active.
    for (const nom of CATALOGUES) {
      const fichier = join(RACINE_FRONTEND, 'js', 'data', 'en', `${nom}.js`);
      if (!existsSync(fichier)) continue;
      const source = readFileSync(fichier, 'utf8');
      for (const [, texte] of source.matchAll(/:\s*"((?:[^"\\]|\\.)*)"/gu)) {
        valeursVues += 1;
        if (/[<>]/u.test(texte)) fautives.push(`en/${nom}.js : ${texte.slice(0, 90)}`);
      }
    }

    // LA MATIÈRE : un balayage qui ne trouve rien à examiner passerait aussi.
    assert.ok(
      valeursVues >= 1500,
      `Balayage suspect : ${String(valeursVues)} valeur(s) examinée(s). Les catalogues en ` +
        'portent des milliers ; un compte aussi bas signale que le chargement a échoué ' +
        'silencieusement, et tout ce qui suit serait vert pour rien.',
    );
    assert.deepEqual(
      fautives,
      [],
      'Ces chaînes de catalogue portent une balise. Elles sont interpolées dans des gabarits ' +
        '`innerHTML` par les modules Référentiels, Conformité et Correspondances :\n' +
        fautives.map((f) => `    · ${f}`).join('\n'),
    );
    console.log(`  (${valeursVues} valeur(s) de catalogue balayée(s))`);
  });

  test('LE CONTRÔLE MORD — une balise glissée dans un catalogue est vue', () => {
    // Le détecteur est une expression simple ; ce qui pourrait le désarmer est
    // le PARCOURS, s'il cessait de descendre dans les exigences.
    const objet = { id: 'x', nom: 'sain', domaines: [{ nom: 'ok', exigences: [{ titre: '<b>ici</b>' }] }] };
    const trouvees = [];
    const parcourir = (v, chemin) => {
      if (typeof v === 'string') { if (/[<>]/u.test(v)) trouvees.push(chemin); }
      else if (Array.isArray(v)) v.forEach((x, i) => parcourir(x, `${chemin}[${i}]`));
      else if (v && typeof v === 'object') for (const [c, x] of Object.entries(v)) parcourir(x, `${chemin}.${c}`);
    };
    parcourir(objet, 'essai');
    assert.deepEqual(
      trouvees,
      ['essai.domaines[0].exigences[0].titre'],
      'Le parcours doit atteindre le titre d’une exigence — c’est là que vivent les 234 ' +
        'chaînes d’AirCyber, et une balise s’y cacherait très bien.',
    );
  });
});

/* =====================================================================
 *  Le CRITÈRE de la porte S7, enfin gardé par une machine — constat Q-257
 * =====================================================================
 *
 * ── Ce que la porte S7 a reproché à ce fichier ──────────────────────────────
 *
 * Il compte la couverture, détecte les traductions orphelines et les balises —
 * et **rien n'y portait sur le critère de la porte** : la nature du texte des
 * catalogues. Un auditeur humain a dû lire 424 intitulés pour découvrir ce
 * qu'une mesure de trois lignes dit d'un coup.
 *
 * ── Ce qui est gardé, et pourquoi c'est CELA ────────────────────────────────
 *
 * L'arbitrage du 09/09/2026 (`PLAN_SERVEUR` §4.2 amendé) a déplacé le critère :
 * les **intitulés anglais** des catalogues ISO **suivent désormais la
 * terminologie de la norme**, délibérément. Garder « la paraphrase » n'aurait
 * donc plus de sens du côté anglais.
 *
 * Mais le §4.2 **continue d'affirmer une propriété du côté français**, et c'est
 * elle qui protège le produit : *« les textes français sont des reformulations
 * originales »*. Cette propriété-là **se mesure** — une reformulation est
 * courte, un copier-coller ne l'est pas :
 *
 *     anssi-hygiene   46 signes de moyenne      iso-27002-2022   28
 *     nis2-art21      41                        dora             31
 *     iso27001-smsi   42                        aircyber        164  ← 4×
 *
 * C'est exactement ce chiffre qui a établi le constat **Q-255**. Le banc le
 * relève désormais lui-même.
 *
 * ⚠️ **AirCyber est une exception DÉCLARÉE, et l'exception est elle-même
 * gardée.** Son catalogue est l'export CSV du questionnaire BoostAerospace, ce
 * que son en-tête écrit ; l'utilisateur a tranché le 09/09/2026 que cet usage
 * est celui prévu. Mais une liste d'exceptions qui grossit en silence est ce que
 * ce dépôt traque partout : le §2 ci-dessous **exige donc que chaque exception
 * dépasse RÉELLEMENT le seuil**. Une exception devenue inutile fait rougir, et
 * disparaît. C'est l'inverse d'une dérogation qui se transmet de porte en porte.
 */
describe('Le texte FRANÇAIS reste une reformulation, ou il le dit (constat Q-257)', () => {
  /** Au-delà, ce n'est plus une reformulation courte : c'est de la reprise. */
  const MOYENNE_MAX = 80;
  /** Un intitulé isolé peut être long ; à ce point-là, c'est une phrase reprise. */
  const PLUS_LONG_MAX = 200;

  /**
   * Catalogues dont le texte français n'est **pas** une reformulation, avec le
   * motif. Toute entrée doit être justifiée par la mesure — voir le §2.
   */
  const REPRISES_ASSUMEES = Object.freeze({
    aircyber:
      'export CSV du questionnaire BoostAerospace (constat Q-255) ; usage tranché par ' +
      "l'utilisateur le 09/09/2026 — le questionnaire est fait pour être utilisé et partagé " +
      'avec les clients selon le niveau de confidentialité établi',
  });

  /** Longueur moyenne et maximale des intitulés FRANÇAIS, catalogue par catalogue. */
  function mesures() {
    const R = chargerCatalogues();
    return R.couverture('fr').map(({ id }) => {
      const ref = R.get(id);
      const titres = (ref.domaines ?? []).flatMap((d) =>
        (d.exigences ?? []).map((e) => String(e.titre ?? '')),
      );
      const total = titres.reduce((n, t) => n + t.length, 0);
      return {
        id,
        nombre: titres.length,
        moyenne: titres.length === 0 ? 0 : Math.round(total / titres.length),
        plusLong: titres.reduce((m, t) => Math.max(m, t.length), 0),
      };
    });
  }

  /**
   * Moyenne mesurée aujourd'hui, catalogue par catalogue, et la marge admise.
   *
   * ⚠️ **Constat Q-283, 7ᵉ passage de la porte S8 : la rédaction précédente de ce garde
   * mesurait la longueur contre un seuil GLOBAL de 80 signes, et l'auditeur l'a mise en
   * défaut d'un coup** — il a remplacé les 93 intitulés français d'ISO 27002 par les 93
   * intitulés **officiels** de la norme, et les onze essais sont restés verts : les titres
   * officiels font 29 signes de moyenne, les reformulations 28.
   *
   * Le seuil global attrape la reprise **longue** — un export CSV à 164 signes, ce qui a
   * établi Q-255 — et laisse passer la reprise **courte**, qui est exactement le risque que
   * le `PLAN_SERVEUR` §4.2 nomme pour l'Annexe A. Il fallait donc un second discriminant,
   * et il ne pouvait pas être la taille absolue.
   *
   * Celui-ci est la **dérive** : une reformulation ne s'allonge pas de 30 % du jour au
   * lendemain sans qu'on l'ait décidé. La valeur épinglée se relit en jouant l'essai.
   */
  const MOYENNES_MESUREES = Object.freeze({
    'anssi-hygiene': 46,
    'iso-27002-2022': 28,
    'iso27001-smsi': 42,
    'nis2-art21': 41,
    dora: 31,
    aircyber: 164,
  });
  /** Au-delà, ce n'est plus du bruit d'édition : c'est un changement de nature. */
  const DERIVE_MAX = 1.3;

  test('§0 LA MATIÈRE : six catalogues, et des intitulés à mesurer', () => {
    // Sans cette moitié, tout ce qui suit passerait au vert sur une liste vide.
    const m = mesures();
    assert.equal(m.length, 6, 'six catalogues sont attendus');
    const exigences = m.reduce((n, c) => n + c.nombre, 0);
    assert.ok(exigences >= 400, `seulement ${String(exigences)} intitulé(s) vus : le chargement ne lit plus rien.`);
  });

  test('§1 aucun catalogue ne dérive vers la reprise, hors exceptions déclarées', () => {
    const fautifs = mesures()
      .filter((c) => !(c.id in REPRISES_ASSUMEES))
      .filter((c) => c.moyenne > MOYENNE_MAX || c.plusLong > PLUS_LONG_MAX)
      .map(
        (c) =>
          `${c.id} : ${String(c.moyenne)} signes de moyenne (max ${String(MOYENNE_MAX)}), ` +
          `plus long ${String(c.plusLong)} (max ${String(PLUS_LONG_MAX)})`,
      );
    assert.deepEqual(
      fautifs,
      [],
      'Le `PLAN_SERVEUR` §4.2 affirme que « les textes français sont des reformulations ' +
        'originales, ce qui protège le produit ». Ces catalogues ne le sont plus :\n  · ' +
        fautifs.join('\n  · ') +
        '\nSoit on reformule, soit on inscrit le catalogue dans REPRISES_ASSUMEES **avec son ' +
        'motif** — et alors le §4.2 ne protège pas ce catalogue-là, ce qui doit être su.',
    );
  });

  test('§1 bis un intitulé FRANÇAIS identique à sa traduction ANGLAISE n’en est pas un', () => {
    // ── Le discriminant qui attrape la mutation de l'auditeur (Q-283) ──────
    //
    // Si le titre français d'une exigence est, à l'espace près, celui que le
    // produit rend pour la même exigence en anglais, ce n'est pas une
    // reformulation française : c'est le titre officiel ANGLAIS recopié des
    // deux côtés. C'est la signature exacte de la mutation qui a mis en défaut
    // la rédaction précédente de ce garde.
    //
    // Mesuré au 10/09/2026 : **zéro cas** sur les 424 exigences des six
    // catalogues. Le discriminant ne rougit donc sur rien d'existant — et il
    // rougirait sur la reprise.
    const fr = chargerCatalogues('fr');
    const en = chargerCatalogues('en');
    const titres = (R) => {
      const m = new Map();
      for (const { id } of R.couverture('fr')) {
        for (const d of R.get(id).domaines ?? []) {
          for (const e of d.exigences ?? []) m.set(`${id}|${d.id}/${e.code}`, String(e.titre ?? '').trim());
        }
      }
      return m;
    };
    const tf = titres(fr);
    const te = titres(en);
    const fautifs = [];
    for (const [cle, titreFr] of tf) {
      const titreEn = te.get(cle);
      if (titreFr !== '' && titreEn !== undefined && titreEn !== '' && titreFr === titreEn) {
        fautifs.push(`${cle} : « ${titreFr} »`);
      }
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces intitulés sont IDENTIQUES en français et en anglais. Un titre qui ne change pas ' +
        "d'une langue à l'autre n'est pas une reformulation française : c'est le titre " +
        'officiel anglais, recopié des deux côtés. C’est la forme de reprise que le seuil de ' +
        'longueur ne voit pas (constat Q-283) :\n  · ' + fautifs.join('\n  · '),
    );
  });

  test('§1 ter la longueur moyenne ne DÉRIVE pas vers l’intitulé officiel', () => {
    // Second discriminant, pour la reprise courte EN FRANÇAIS — que le §1 bis
    // ne verrait pas, l'anglais restant différent. Les titres officiels
    // français de l'Annexe A sont nettement plus longs que les reformulations
    // (« Inventaire des informations et autres actifs associés » contre
    // « Inventaire des actifs »), et une reformulation ne s'allonge pas de
    // 30 % du jour au lendemain sans qu'on l'ait décidé.
    const derives = mesures()
      .filter((c) => c.id in MOYENNES_MESUREES)
      .filter((c) => c.moyenne > MOYENNES_MESUREES[c.id] * DERIVE_MAX)
      .map(
        (c) =>
          `${c.id} : ${String(c.moyenne)} signes de moyenne, contre ${String(MOYENNES_MESUREES[c.id])} ` +
          `mesurés au 10/09/2026 (dérive maximale admise ×${String(DERIVE_MAX)})`,
      );
    assert.deepEqual(
      derives,
      [],
      'Des intitulés se sont allongés au point de changer de nature :\n  · ' +
        derives.join('\n  · ') +
        "\nSi c'est délibéré — une refonte des libellés —, relevez la valeur épinglée EN LE " +
        'DISANT. Si ce ne l’est pas, ce sont des intitulés officiels qui ont remplacé des ' +
        'reformulations, et le `PLAN_SERVEUR` §4.2 ne protège plus ce catalogue.',
    );
    // Les catalogues non épinglés doivent l'être : sans quoi un catalogue neuf
    // échapperait à ce contrôle en silence.
    const absents = mesures().filter((c) => !(c.id in MOYENNES_MESUREES)).map((c) => c.id);
    assert.deepEqual(absents, [], `Catalogue(s) sans moyenne épinglée : ${absents.join(', ')}`);
  });

  test('§2 une exception qui ne sert plus DOIT disparaître', () => {
    // Le pendant du §1, et il est le plus important des deux : c'est lui qui
    // empêche la liste d'exceptions de devenir un alibi qui se transmet.
    const parId = new Map(mesures().map((c) => [c.id, c]));
    const inutiles = Object.keys(REPRISES_ASSUMEES)
      .map((id) => ({ id, c: parId.get(id) }))
      .filter(({ c }) => c !== undefined && c.moyenne <= MOYENNE_MAX && c.plusLong <= PLUS_LONG_MAX)
      .map(({ id }) => `${id} — il tient désormais le seuil : retirez-le de REPRISES_ASSUMEES`);
    assert.deepEqual(inutiles, [], inutiles.join('\n'));

    const inconnues = Object.keys(REPRISES_ASSUMEES).filter((id) => !parId.has(id));
    assert.deepEqual(inconnues, [], `Exception portant sur un catalogue qui n'existe pas : ${inconnues.join(', ')}`);
  });

  test('§3 chaque exception porte un MOTIF, pas seulement un nom', () => {
    for (const [id, motif] of Object.entries(REPRISES_ASSUMEES)) {
      assert.ok(
        typeof motif === 'string' && motif.length > 60,
        `L'exception « ${id} » doit dire POURQUOI, et assez précisément pour qu'un lecteur ` +
          "de la vague suivante n'ait pas à le redécouvrir.",
      );
    }
  });
});

/* =====================================================================
 *  Ce qui n'est PAS traduit doit se COMPTER — constat Q-256
 * =====================================================================
 *
 * Le `PLAN_SERVEUR` §4.2 chiffre le volume à traduire : « exigences de
 * référentiels **424** · points de contrôle d'audit **312** · groupes de
 * correspondances **28** — de l'ordre de 1 500 textes métier ». Le lot L11 a
 * livré **les 424**, et le dépôt annonce le lot livré.
 *
 * Les **312 points de contrôle d'audit** et les **28 correspondances** ne sont
 * pas traduits — et, plus grave que non traduits : **aucun mécanisme ne les
 * traduit**. Il n'y a pas de `js/data/en/audit_*.js`, pas d'entrée dans le
 * registre, rien à remplir. Conséquence à l'écran : la grille d'audit d'un
 * évaluateur anglophone sort **bilingue**, titre d'exigence en anglais et point
 * de contrôle en français.
 *
 * ⚠️ **Ce fichier ne peut pas traduire 312 points de contrôle ; il peut refuser
 * que le manque soit invisible.** C'est la doctrine du dépôt — *ce qui manque se
 * voit ; il ne se devine pas.* Le §2 ci-dessous est le plus utile des deux : le
 * jour où quelqu'un commence la traduction, il **rougit** et lui rappelle de
 * brancher la couverture, au lieu de le laisser livrer une moitié de mécanisme
 * dont l'instrument continuerait d'annoncer 100 %.
 */
describe('Le volume NON traduit est compté, pas oublié (constat Q-256)', () => {
  /**
   * Les modèles d'audit sont **découverts dans le répertoire**, pas listés.
   *
   * ⚠️ La première rédaction les nommait un par un — et rendait **309** au lieu
   * de 312, en oubliant `audit_modeles.js`. C'est le travers que ce même fichier
   * corrige deux paragraphes plus haut (constat Q-263), reproduit à trois lignes
   * d'intervalle : *une liste écrite à la main est une omission qui attend*.
   */
  const REPERTOIRE = join(RACINE_FRONTEND, 'js', 'data');

  function modelesDAudit() {
    return readdirSync(REPERTOIRE).filter((f) => /^audit_.+\.js$/u.test(f));
  }

  function pointsDeControle() {
    return modelesDAudit().reduce(
      (n, f) => n + (readFileSync(join(REPERTOIRE, f), 'utf8').match(/\bctrl:/gu) ?? []).length,
      0,
    );
  }

  test('§1 le volume est celui que le cadrage annonce, et il est DIT', () => {
    const n = pointsDeControle();
    // Borne large : ce qui compte est que le chiffre existe et soit du bon
    // ordre, pas qu'il soit figé — des points de contrôle peuvent être ajoutés.
    assert.ok(n >= 300, `seulement ${String(n)} point(s) de contrôle vus : le balayage ne lit plus rien.`);
    // eslint-disable-next-line no-console
    console.log(
      `\nModèles d'audit : ${String(n)} point(s) de contrôle · 0 traduit — ` +
        'AUCUN mécanisme de traduction (constat Q-256, ouvert)\n',
    );
  });

  test('§2 le jour où la traduction commence, la COUVERTURE doit suivre', () => {
    // Un `en/audit_*.js` qui apparaîtrait pendant que `couverture()` ignore ces
    // catalogues donnerait un instrument qui annonce 100 % sur la moitié du
    // volume. C'est le motif de Q-263, appliqué avant qu'il se produise.
    const commencees = modelesDAudit().filter((f) =>
      existsSync(join(REPERTOIRE, 'en', f)),
    );
    assert.deepEqual(
      commencees,
      [],
      'Des modèles d’audit sont en cours de traduction :\n  · ' +
        commencees.join('\n  · ') +
        "\nAvant d'aller plus loin, branchez-les sur `Referentiels.couverture()` — sans quoi " +
        "l'instrument annoncera 100 % en ignorant 312 points de contrôle (c'est le motif du " +
        'constat Q-263). Puis retirez ce garde-fou, qui aura fait son office.',
    );
  });
});
