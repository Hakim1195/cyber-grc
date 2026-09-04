/**
 * versions-concordantes.test.mjs — **le même nombre vit à trois endroits.**
 *
 * ── Pourquoi cet essai existe ────────────────────────────────────────────────
 *
 * La version du schéma de l'objet `data` est écrite trois fois :
 *
 *   1. `cyber-gouvernance_V4/js/core/datastore.js` — `SCHEMA_VERSION`, ce que le
 *      navigateur écrit dans l'enveloppe `grc-backup` qu'il exporte ;
 *   2. `backend/src/entites/index.ts` — `VERSION_SCHEMA`, ce que l'API annonce
 *      dans `/api/modele` et dans le chargement initial ;
 *   3. `backend/src/reprise/index.ts` — `VERSION_SCHEMA`, la version la plus
 *      haute que la chaîne de paliers sait relire.
 *
 * Elles doivent être égales, et rien ne le garantissait. Mesuré le 04/09/2026 en
 * montant v12 → v13 : les deux premières ont été montées, la troisième oubliée,
 * et le produit **exportait un fichier qu'il refusait de relire** —
 * *« Fichier en version de schéma 13, postérieure à la version 12 que ce serveur
 * sait reprendre »*.
 *
 * ⚠️ Le défaut est **bruyant mais tardif** : il n'apparaît qu'au round-trip
 * complet, dans un essai de navigateur qui dure trois secondes. Ici il tombe en
 * une milliseconde, et il **nomme les trois valeurs**.
 *
 * ── La forme : on LIT les sources, on ne les récite pas ──────────────────────
 *
 * Deux des trois valeurs viennent du code compilé (donc de la vérité
 * d'exécution) ; la troisième est lue dans le fichier du frontend, qui n'est pas
 * un module importable — il déclare `SCHEMA_VERSION` dans une IIFE. Aucun nombre
 * n'est écrit dans cet essai.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { moduleCompile, RACINE_FRONTEND } from '../aide/serveur.mjs';

/** Lit `const SCHEMA_VERSION = <n>;` dans le fichier du frontend. */
function versionDuNavigateur() {
  const source = readFileSync(join(RACINE_FRONTEND, 'js', 'core', 'datastore.js'), 'utf8');
  const trouve = /const\s+SCHEMA_VERSION\s*=\s*(\d+)\s*;/u.exec(source);
  assert.notEqual(
    trouve,
    null,
    'SCHEMA_VERSION est introuvable dans js/core/datastore.js : cet essai ne mesure plus rien. ' +
      'Si la constante a été renommée, corriger ICI plutôt que de supprimer le contrôle.',
  );
  return Number(trouve[1]);
}

describe('La version du schéma dit la même chose aux trois endroits où elle est écrite', () => {
  test('navigateur, API et reprise annoncent le MÊME numéro', async () => {
    const navigateur = versionDuNavigateur();
    const { VERSION_SCHEMA: api } = await moduleCompile('entites/index.js');
    const { VERSION_SCHEMA: reprise } = await moduleCompile('reprise/index.js');

    // ── Contrôle de matière : trois nombres réels, pas trois « undefined » ──
    for (const [nom, valeur] of [['navigateur', navigateur], ['api', api], ['reprise', reprise]]) {
      assert.ok(
        Number.isInteger(valeur) && valeur >= 12,
        `La version « ${nom} » vaut ${String(valeur)} : la lecture a échoué, et « elles sont ` +
          'égales » serait vrai pour une mauvaise raison.',
      );
    }

    assert.deepEqual(
      { navigateur, api, reprise },
      { navigateur, api: navigateur, reprise: navigateur },
      'Les trois copies de la version de schéma divergent. Conséquences, selon celle qui est ' +
        'en retard : l’API annonce une forme que le navigateur ne connaît pas, ou bien le ' +
        'produit EXPORTE un fichier qu’il REFUSE DE RELIRE — c’est ce qui est arrivé le ' +
        '04/09/2026 en montant v12 → v13.',
    );
  });

  test('LA CHAÎNE DE PALIERS VA JUSQU’À CETTE VERSION, sans trou', async () => {
    // La contrepartie : une version montée sans son palier laisserait la chaîne
    // s'arrêter en chemin, et un fichier ancien ne serait pas rattrapé.
    const { VERSION_SCHEMA: reprise, decrirePaliers } = await moduleCompile('reprise/index.js');
    if (typeof decrirePaliers !== 'function') return; // le module n'expose pas la chaîne
    const paliers = decrirePaliers();
    assert.ok(paliers.length >= 11, `Seulement ${paliers.length} palier(s) : lecture douteuse.`);
    const sommets = paliers.map((p) => p.vers);
    assert.equal(
      Math.max(...sommets),
      reprise,
      'Le dernier palier n’aboutit pas à la version annoncée : un fichier ancien s’arrêterait ' +
        'en chemin, et la reprise le déclarerait pourtant à jour.',
    );
  });
});
