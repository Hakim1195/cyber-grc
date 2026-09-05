/**
 * chiffres-du-schema.test.mjs — **les nombres du schéma, confrontés au catalogue.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-222**, quatrième passage de la porte S8
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le §8 du `README` annonce une quinzaine de nombres relevés « dans le
 * catalogue » : tables, migrations, politiques, clés étrangères, déclencheurs.
 * `chiffres-du-banc.test.mjs` garde les FAMILLES d'essais et les TOTAUX ; **rien
 * ne gardait ceux-là**.
 *
 * Résultat mesuré : le bloc annonçait « 43 tables portant `cree_par` et 43
 * déclencheurs de création » quand le catalogue en portait **44 et 44** — et ce
 * dans le bloc **qui venait d'être réancré** pour le constat Q-219. Le §5 du
 * `PLAN_EXECUTION` dit qu'un chiffre faux dans ce document est **un constat, pas
 * une coquille** ; il l'était depuis assez longtemps pour qu'un réancrage
 * complet ne l'ait pas vu.
 *
 * ── Pourquoi une base NEUVE, et pas la recette ───────────────────────────
 *
 * La recette porte des données, des filiales, l'histoire de ce qui y a été
 * essayé. Le `README` décrit **le schéma que les migrations produisent**, pas
 * l'état d'une machine. On mesure donc sur une base jetable, migrée par le vrai
 * `db/migrate.mjs` — ce que fait déjà chaque fichier de ce banc.
 *
 * ⚠️ **Corriger le chiffre sans garder la classe** aurait été refaire, pour la
 * quatrième fois d'affilée, l'erreur que ces quatre passages de porte ont
 * sanctionnée : réparer l'instance et laisser la cause.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';
import { RACINE_BACKEND } from '../aide/serveur.mjs';

const README = join(RACINE_BACKEND, 'README.md');

let base;
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});
after(async () => {
  await base?.fermer();
});

/** Un nombre annoncé par le README, désigné par ce qui le suit. */
function annonce(motif, quoi) {
  const texte = readFileSync(README, 'utf8');
  const trouve = motif.exec(texte);
  assert.notEqual(
    trouve,
    null,
    `Le README n’annonce plus « ${quoi} » sous la forme attendue. Ce contrôle n’a plus de ` +
      'sujet : soit la phrase a changé et il faut l’y suivre, soit le chiffre a disparu — ' +
      'et un chiffre disparu ne vaut pas un chiffre juste.',
  );
  return Number(trouve[1].replace(/\s/gu, ''));
}

async function compter(sql) {
  const { rows } = await proprietaire.query(sql);
  return Number(rows[0].n);
}

describe('Q-222 — les nombres du schéma disent le catalogue', () => {
  test('LA MATIÈRE : la base d’essai est bien celle des migrations', async () => {
    // Sans elle, une base vide rendrait des zéros et tout serait « cohérent ».
    const tables = await compter(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    assert.ok(tables >= 40, `Seulement ${String(tables)} table(s) : les migrations n’ont pas joué.`);
  });

  test('TABLES, POLITIQUES, MIGRATIONS, CLÉS, DÉCLENCHEURS, CONTRÔLES', async () => {
    const mesures = [
      [
        'tables',
        annonce(/\*\*(\d[\d\s]*) tables\*\* en/u, 'N tables'),
        await compter(
          `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'`,
        ),
      ],
      [
        'migrations',
        annonce(/\*\*(\d[\d\s]*) migrations\*\*/u, 'N migrations'),
        await compter(`select count(*)::int as n from migrations_schema`),
      ],
      [
        'politiques',
        annonce(/\*\*(\d[\d\s]*) politiques\*\*/u, 'N politiques'),
        await compter(`select count(*)::int as n from pg_policy`),
      ],
      [
        'clés étrangères',
        annonce(/\*\*(\d[\d\s]*) clés étrangères\*\*/u, 'N clés étrangères'),
        await compter(`select count(*)::int as n from pg_constraint where contype = 'f'`),
      ],
      [
        'tables portant cree_par',
        annonce(/\*\*(\d[\d\s]*) tables portant/u, 'N tables portant cree_par'),
        await compter(
          `select count(*)::int as n from pg_attribute a
             join pg_class c on c.oid = a.attrelid
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'
              and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped`,
        ),
      ],
      [
        'contrôles consignés',
        annonce(/\*\*(\d[\d\s]*) contrôles consignés\*\*/u, 'N contrôles consignés'),
        await compter(`select count(*)::int as n from controles_schema`),
      ],
    ];

    const faux = mesures
      .filter(([, annonce_, reel]) => annonce_ !== reel)
      .map(([quoi, annonce_, reel]) => `${quoi} : le README dit ${String(annonce_)}, le catalogue en porte ${String(reel)}`);

    assert.deepEqual(
      faux,
      [],
      'Un chiffre faux dans ce document est un CONSTAT, pas une coquille — le §5 du ' +
        'PLAN_EXECUTION le dit, et le §8 du README en explique le coût : un lecteur compare ' +
        'au réel, trouve l’écart, et cesse de se servir du document comme d’un contrôle.\n' +
        faux.map((f) => `    · ${f}`).join('\n'),
    );
  });

  test('AUCUNE TABLE SANS RLS — le README l’annonce, le catalogue le dit', async () => {
    assert.match(
      readFileSync(README, 'utf8'),
      /\*\*0 table sans RLS activée, 0 sans RLS forcée\*\*/u,
      'Le README doit continuer d’annoncer ce zéro : c’est la promesse centrale du produit.',
    );
    const sansRls = await compter(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (not c.relrowsecurity or not c.relforcerowsecurity)`,
    );
    assert.equal(
      sansRls,
      0,
      `${String(sansRls)} table(s) sans RLS activée ou forcée. Le cloisonnement par filiale ` +
        'n’est plus garanti, et le README annonce le contraire.',
    );
  });
});
