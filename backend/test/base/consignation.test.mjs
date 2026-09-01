/**
 * consignation.test.mjs — le registre des garde-fous, et QUAND il s'écrit.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le constat **Q-5** : `f_verifier_schema()` découvre ses contrôles, ce qui supprime
 * l'oubli à l'ajout et l'introduit au retrait. Un garde-fou renommé, re-signé ou
 * remplacé cessait d'être joué, et le déploiement annonçait « aucune anomalie » sur
 * une base dont la Row Level Security était tombée. La migration `005` a posé le
 * remède : un registre de la **dernière observation**, `controles_schema`, qu'un
 * contrôle disparu fait parler.
 *
 * Un registre ne vaut cependant que par le moment où on l'écrit. Trois règles
 * commandent, et deux d'entre elles disent « ne consigne pas » :
 *
 *  · on consigne **après une application réussie** — la migration qui vient de
 *    passer a pu créer un garde-fou ;
 *  · on **ne consigne pas** quand il n'y a rien à appliquer. C'est le chemin de la
 *    ré-exécution d'`install.sh` : il doit **comparer** sans consigner. Consigner
 *    là réécrirait le registre sur l'état courant — y compris sur un schéma saboté
 *    entre deux exécutions —, et la comparaison ne prouverait plus rien ;
 *  · on **ne consigne jamais** sous `--verifier`, dont la promesse est « aucune
 *    écriture », tenue par une transaction en lecture seule.
 *
 * Ce qui est éprouvé ici est le COMPORTEMENT de `db/migrate.mjs`, en le lançant pour
 * de bon contre une base d'essai : le nombre de lignes du registre avant et après,
 * et le code de sortie. Aucune assertion sur un libellé.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ouvrirBaseEssai } from '../aide/base.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const executerFichier = promisify(execFile);

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});

after(async () => {
  await base?.fermer();
});

/** Lance `db/migrate.mjs` sur la base d'essai et rend son verdict. */
async function migrer(...arguments_) {
  const issue = await executerFichier(process.execPath, [join(RACINE, 'db', 'migrate.mjs'), ...arguments_], {
    env: {
      ...process.env,
      BASE_NOM: base.nom,
      BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
      BASE_PORT: process.env.BASE_PORT ?? '5432',
      BASE_UTILISATEUR_PROPRIETAIRE: process.env.BASE_UTILISATEUR_PROPRIETAIRE ?? 'grc_proprietaire',
      BASE_MOT_DE_PASSE_PROPRIETAIRE: process.env.BASE_MOT_DE_PASSE_PROPRIETAIRE ?? 'dev',
    },
    cwd: RACINE,
  }).catch((erreur) => erreur);
  return { code: issue.code ?? 0, sortie: `${issue.stdout ?? ''}${issue.stderr ?? ''}` };
}

/** Nombre de garde-fous consignés dans le registre. */
async function consignes() {
  return Number((await proprietaire.query('select count(*)::int as n from controles_schema')).rows[0].n);
}

/** Les garde-fous que la découverte reconnaît à l'instant. */
async function decouverts() {
  const { rows } = await proprietaire.query(
    'select fonction from f_decouvrir_controles_schema() where conforme order by fonction',
  );
  return rows.map((l) => l.fonction);
}

describe('Le registre des garde-fous ne s’écrit qu’au bon moment (constat Q-5)', () => {
  test('une base migrée porte un registre COMPLET : tout ce qui est joué est consigné', async () => {
    const attendus = await decouverts();
    assert.ok(attendus.length >= 8, `Balayage suspect : ${attendus.join(', ')}`);

    const { rows } = await proprietaire.query('select fonction from controles_schema order by fonction');
    assert.deepEqual(
      rows.map((l) => l.fonction),
      attendus,
      'Un registre incomplet rend la comparaison muette sur ce qu’il ignore : le garde-fou ' +
        'absent du registre peut disparaître sans que rien ne le dise.',
    );
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_schema()'),
      [],
      'Et la base d’essai doit partir saine.',
    );
  });

  test('« RIEN À APPLIQUER » compare, et ne consigne PAS', async () => {
    // ── La règle la moins intuitive, et la plus importante ───────────────────
    //
    // C'est le chemin qu'emprunte chaque ré-exécution d'`install.sh`. Y consigner
    // reviendrait à réécrire la dernière observation sur l'état courant : un
    // garde-fou disparu entre deux exécutions serait consigné comme normal, et le
    // registre cesserait d'être une mémoire pour devenir un miroir.
    const avant = await consignes();
    assert.ok(avant > 0);

    await proprietaire.query('delete from controles_schema');
    try {
      const issue = await migrer();
      assert.equal(
        await consignes(),
        0,
        'Le registre a été réécrit sur un chemin qui ne doit que comparer : une disparition ' +
          'survenue entre deux déploiements serait désormais consignée comme l’état normal.',
      );
      assert.notEqual(
        issue.code,
        0,
        `Et un registre vide doit faire échouer, pas passer :\n${issue.sortie}`,
      );
    } finally {
      await proprietaire.query('select f_consigner_controles_schema()');
    }
    assert.equal(await consignes(), avant, 'Le registre doit être remis en l’état.');
  });

  test('« --verifier » n’écrit rien, registre compris', async () => {
    const avant = await consignes();
    await proprietaire.query('delete from controles_schema');
    try {
      const issue = await migrer('--verifier');
      assert.equal(await consignes(), 0, '« --verifier » promet « aucune écriture » : elle vaut ici aussi.');
      assert.notEqual(issue.code, 0, `Un registre vide reste une anomalie :\n${issue.sortie}`);
    } finally {
      await proprietaire.query('select f_consigner_controles_schema()');
    }
    assert.equal(await consignes(), avant);
  });

  test('CONTRÔLE SYMÉTRIQUE : sur une base saine, les deux chemins passent', async () => {
    // Sans cette moitié, les deux essais ci-dessus seraient satisfaits par un outil
    // qui échoue toujours — et l'on aurait « prouvé » qu'il ne consigne pas en
    // cassant le déploiement.
    for (const arguments_ of [[], ['--verifier']]) {
      const issue = await migrer(...arguments_);
      assert.equal(issue.code, 0, `migrate.mjs ${arguments_.join(' ')} :\n${issue.sortie}`);
    }
    assert.equal(await consignes(), (await decouverts()).length);
  });
});

describe('Une APPLICATION consigne, et le filet de migrate.mjs est branché', () => {
  test('une migration appliquée laisse le registre à jour', async () => {
    // ── Le chemin positif, joué sur une base réellement en retard ────────────
    //
    // La base est ouverte à la migration 004 : `controles_schema` n'existe pas
    // encore. On applique la suite pour de bon, et le registre doit exister et
    // porter tous les garde-fous joués.
    //
    // Deux mécanismes concourent au même résultat : la migration appelle
    // `f_consigner_controles_schema()` en fin de fichier, et `db/migrate.mjs`
    // rappelle la fonction après une application réussie. Le second est le FILET du
    // premier — pour la migration qui oublierait. Un filet est redondant tant que
    // rien ne tombe : c'est le contrôle de morsure, joué hors dépôt sur une copie
    // dont la migration a été privée de son appel, qui établit qu'il porte.
    const enRetard = await ouvrirBaseEssai(import.meta.url, { jusquA: '004' });
    try {
      const prop = await enRetard.connexion('proprietaire');
      const existeAvant = (await prop.query(
        "select to_regclass('public.controles_schema') is not null as existe",
      )).rows[0].existe;
      assert.equal(existeAvant, false, 'Le scénario exige une base ANTÉRIEURE au registre.');

      const issue = await executerFichier(process.execPath, [join(RACINE, 'db', 'migrate.mjs')], {
        env: {
          ...process.env,
          BASE_NOM: enRetard.nom,
          BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
          BASE_PORT: process.env.BASE_PORT ?? '5432',
          BASE_UTILISATEUR_PROPRIETAIRE: process.env.BASE_UTILISATEUR_PROPRIETAIRE ?? 'grc_proprietaire',
          BASE_MOT_DE_PASSE_PROPRIETAIRE: process.env.BASE_MOT_DE_PASSE_PROPRIETAIRE ?? 'dev',
        },
        cwd: RACINE,
      }).catch((erreur) => erreur);
      const sortie = `${issue.stdout ?? ''}${issue.stderr ?? ''}`;
      assert.equal(issue.code ?? 0, 0, `L’application doit réussir :\n${sortie}`);

      const joues = (await prop.query(
        'select fonction from f_decouvrir_controles_schema() where conforme order by fonction',
      )).rows.map((l) => l.fonction);
      const inscrits = (await prop.query('select fonction from controles_schema order by fonction')).rows
        .map((l) => l.fonction);
      assert.deepEqual(
        inscrits,
        joues,
        'Après une application, tout garde-fou joué doit être consigné : ce qui manque au ' +
          'registre pourra disparaître en silence.',
      );
      assert.deepEqual(
        (await prop.query('select * from f_verifier_schema()')).rows,
        [],
        'Et le schéma obtenu doit être conforme.',
      );
    } finally {
      await enRetard.fermer();
    }
  });

  test('LE FILET EST BRANCHÉ, et à UN seul endroit', async () => {
    // Un garde-fou que rien n'appelle est un commentaire — et un appel recopié dans
    // chaque branche de sortie est la liste écrite à la main que ce chantier a payée
    // quatre fois. On exige donc les deux : qu'il soit appelé, et une seule fois.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(join(RACINE, 'db', 'migrate.mjs'), 'utf8');
    const appels = source.match(/^\s*await consignerLesControles\(/gm) ?? [];
    assert.equal(
      appels.length,
      1,
      `« consignerLesControles » doit être appelée exactement une fois (trouvé ${String(appels.length)}).`,
    );
    assert.ok(
      /select garde_fou, mouvement from f_consigner_controles_schema\(\)/.test(source),
      'Et elle doit appeler la fonction que la migration 005 expose pour cela.',
    );

    // Contrôle de morsure du motif : il doit savoir dire non.
    assert.equal(/^\s*await consignerLesControles\(/gm.test('const consignerLesControles = 1;'), false);
  });
});
