/**
 * compteur-installateur.test.mjs — la requête d'install.sh sur « filiales », contre le
 * VRAI schéma.
 *
 * Trouvé le 30/09/2026 par l'agent du labo : install.sh comptait les filiales par
 * « where active » — une colonne qui n'existe pas —, et « 2>/dev/null » avalait l'erreur :
 * le compteur rendait TOUJOURS 0, refusait à tort un exploitant qui déclare ses filiales à
 * l'écran, et le diagnostic disait « table illisible » sur toute installation saine. Le
 * banc ne l'a pas vu parce que ses essais jouaient une DOUBLURE de la base. Ici la requête
 * est EXTRAITE du script — jamais recopiée — et jouée sur une base réelle, migrée.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';

const INSTALL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'deploy', 'install.sh');
/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});
after(async () => { await base?.fermer(); });

/** La requête, telle qu'install.sh l'écrit — extraite, pas recopiée (une seule vérité). */
function requeteDuScript() {
  const source = readFileSync(INSTALL, 'utf8');
  const d = source.indexOf('filiales_actives_en_base() {');
  assert.ok(d > 0, 'filiales_actives_en_base() a disparu d’install.sh');
  const corps = source.slice(d, source.indexOf('\n}', d));
  const m = /select count\(\*\) from filiales where [^;'"]*(?:'active')?[^;"]*/.exec(corps.replace(/\\"/g, '"'));
  assert.ok(m, 'la requête de comptage a changé de forme');
  return m[0].replace(/\\n$/, '');
}
const GROUPE = perimetre('essai', FILIALE_A, [FILIALE_A, FILIALE_B], true);

describe('install.sh compte les filiales actives contre le VRAI schéma', () => {
  test('la requête extraite du script est VALIDE : 0 sur une base neuve, 2 après deux filiales', async () => {
    const sql = requeteDuScript();
    assert.match(sql, /statut = 'active'/, `le prédicat doit être celui du produit (statut = 'active') — lu : ${sql}`);
    await base.avecPerimetre(proprietaire, GROUPE, async (c) => {
      const avant = await c.query(sql);
      assert.equal(Number(avant.rows[0].count), 0);
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values ($1, 'ZZESSA', 'Essai A', 'FR'), ($2, 'ZZESSB', 'Essai B', 'DE')`,
        [FILIALE_A, FILIALE_B],
      );
      const apres = await c.query(sql);
      assert.equal(Number(apres.rows[0].count), 2);
    });
  });

  test('une filiale « sortie » ne compte pas — c’est bien le statut du produit qui est lu', async () => {
    const sql = requeteDuScript();
    await base.avecPerimetre(proprietaire, GROUPE, async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays, statut, date_entree, date_sortie) values ($1, 'ZZESSA', 'Essai A', 'FR', 'sortie', '2020-01-01', '2025-01-01')`,
        [FILIALE_A],
      );
      const r = await c.query(sql);
      assert.equal(Number(r.rows[0].count), 0);
    });
  });

  test('🛑 le prédicat FAUTIF (« where active ») est REFUSÉ par ce schéma — l’essai aurait donc mordu', async () => {
    await base.avecPerimetre(proprietaire, GROUPE, async (c) => {
      await assert.rejects(c.query('select count(*) from filiales where active'), /active/);
    });
  });
});
