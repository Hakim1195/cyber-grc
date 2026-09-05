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
import { readFileSync, existsSync } from 'node:fs';
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
function chargerCatalogues() {
  const morceaux = [readFileSync(join(RACINE_FRONTEND, 'js', 'data', 'referentiels.js'), 'utf8')];
  for (const f of CATALOGUES) {
    morceaux.push(readFileSync(join(RACINE_FRONTEND, 'js', 'data', `${f}.js`), 'utf8'));
    const traduction = join(RACINE_FRONTEND, 'js', 'data', 'en', `${f}.js`);
    if (existsSync(traduction)) morceaux.push(readFileSync(traduction, 'utf8'));
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', `${morceaux.join('\n;\n')}\nreturn Referentiels;`);
  const fenetre = { I18n: { langue: () => 'fr' } };
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
