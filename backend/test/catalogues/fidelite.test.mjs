/**
 * fidelite.test.mjs — **LE CATALOGUE MIGRÉ EST LE CATALOGUE SOURCE** (lot L26, action 26.1)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le critère d'acceptation, mot pour mot
 * ════════════════════════════════════════════════════════════════════════
 *
 *   *« Les auto-évaluations sont stockées par `(ref_id, code)` : la migration conserve
 *     les codes À L'OCTET PRÈS, et un essai compare le catalogue migré au catalogue
 *     source, exigence par exigence. Une divergence silencieuse réattribuerait des
 *     réponses d'audit. »*
 *
 * ── ⚠️ POURQUOI CET ESSAI EXISTE, ALORS QUE LE SEMIS EST ENGENDRÉ ──────────
 *
 * Le §9 de la migration `051` n'a pas été tapé : il a été produit par un programme qui
 * charge `db/catalogues/*.js` et les recopie. On pourrait croire la fidélité acquise.
 *
 * Elle l'est **une fois**. Ce qui la garde, c'est la comparaison — parce que :
 *
 *   • une migration ultérieure peut corriger une coquille dans la base et oublier le
 *     fichier, ou l'inverse ;
 *   • une correction du catalogue français (il y en a eu : constat **Q-206**, deux
 *     erreurs de fond dans le catalogue ANSSI) doit désormais passer par une migration,
 *     et rien ne le rappelle à qui édite le fichier ;
 *   • et le jour où les deux divergent, **rien d'autre ne le dit** : les deux se lisent
 *     parfaitement, et le produit continue de fonctionner en affichant un texte pour un
 *     autre.
 *
 * ── CE QUE CET ESSAI NE PEUT PAS DIRE ─────────────────────────────────────
 *
 * Il ne dit pas que les codes sont les BONS au regard de la norme officielle : treize
 * codes ANSSI sur quarante-deux désignent autre chose que ce que le guide numérote ainsi
 * (constat **Q-192**), et c'est **délibéré** — renuméroter réattribuerait les évaluations
 * en silence. Il dit que la base porte exactement ce que le fichier porte.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';
import { RACINE_BACKEND } from '../aide/serveur.mjs';

/** Les six fichiers source, dans l'ordre où la migration les a semés. */
const FICHIERS = [
  'ref_anssi',
  'ref_iso27001_smsi',
  'ref_iso27002',
  'ref_nis2',
  'ref_dora',
  'ref_aircyber',
];

/** Séparateur de clé composée. Improbable dans un code de norme, et visible. */
const SEP = ' >> ';

let base;
let proprietaire;
let source;

/**
 * Charge les fichiers source dans un contexte isolé.
 *
 * ⚠️ **On les CHARGE, on ne les relit pas à la main.** Un analyseur maison de ces
 * fichiers serait une troisième lecture du même texte, et c'est justement ce que cet
 * essai reproche au monde : *deux points de mesure d'une même grandeur divergent, et la
 * divergence est silencieuse* (constat **Q-219**).
 */
function chargerSource() {
  const racine = join(RACINE_BACKEND, 'db', 'catalogues');
  const catalogues = [];
  const traductions = [];
  const contexte = vm.createContext({
    Referentiels: {
      register: (r) => catalogues.push(r),
      registerTraduction: (id, langue, dict) => traductions.push({ id, langue, dict }),
    },
  });
  for (const f of FICHIERS) {
    vm.runInContext(readFileSync(join(racine, f + '.js'), 'utf8'), contexte, { filename: f });
    vm.runInContext(readFileSync(join(racine, 'en', f + '.js'), 'utf8'), contexte, {
      filename: 'en/' + f,
    });
  }
  // ⚠️ **Le passage par JSON n'est pas une coquetterie.** `vm.createContext()` crée un
  // autre REALM : les objets et tableaux qui en sortent n'ont pas le même
  // `Object.prototype` que ceux de ce fichier, et `assert.deepEqual` les refuse avec
  // « same structure but are not reference-equal » — sur des valeurs rigoureusement
  // identiques. Le round-trip les ramène dans ce realm-ci, et il fait au passage ce
  // que le pilote `pg` fait du `jsonb` : c'est donc la MÊME forme des deux côtés.
  return JSON.parse(JSON.stringify({ catalogues, traductions }));
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  source = chargerSource();
});
after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  §1 — LES CODES, À L'OCTET PRÈS
 * ===================================================================== */

describe('§1 — les codes de la base sont ceux des fichiers, à l’octet près', () => {
  test('même nombre d’exigences, mêmes codes, même référentiel', async () => {
    const { rows } = await proprietaire.query(`
      select e.referentiel_id, e.code
        from referentiel_exigences e
       where e.filiale_id is null
       order by e.referentiel_id, e.code`);

    const enBase = rows.map((r) => r.referentiel_id + SEP + r.code).sort();
    const attendus = source.catalogues
      .flatMap((c) =>
        (c.domaines ?? []).flatMap((d) => (d.exigences ?? []).map((e) => c.id + SEP + e.code)))
      .sort();

    // ⚠️ La comparaison porte sur la LISTE ENTIÈRE, pas sur son cardinal : deux
    // catalogues peuvent porter le même nombre d'exigences et pas les mêmes codes, et
    // c'est exactement la divergence qui réattribuerait des réponses d'audit.
    assert.deepEqual(enBase, attendus);
    assert.equal(enBase.length, 424, 'Les six catalogues livrés portent 424 exigences.');
  });

  test('et les codes sont DISTINCTS dans chaque référentiel — l’invariant de (ref_id, code)', () => {
    // ⚠️ Ce n'est pas une propriété esthétique : `evaluations` enregistre par
    // `(ref_id, code)`. Deux exigences de même code sous deux domaines d'un même
    // référentiel rendraient ce couple AMBIGU, et une réponse d'audit désignerait deux
    // questions à la fois. Mesuré sur la SOURCE : la contrainte d'unicité de la base
    // l'impose, mais un fichier qui la violerait ferait échouer la migration avec un
    // message de doublon, et non avec celui-ci.
    for (const c of source.catalogues) {
      const codes = (c.domaines ?? []).flatMap((d) => (d.exigences ?? []).map((e) => e.code));
      assert.equal(
        new Set(codes).size,
        codes.length,
        'Le catalogue « ' + c.id + ' » porte deux exigences de même code.',
      );
    }
  });
});

/* =====================================================================
 *  §2 — LES TEXTES, CHAMP PAR CHAMP
 * ===================================================================== */

describe('§2 — les textes de la base sont ceux des fichiers, champ par champ', () => {
  test('titre, aide, niveau, priorité, CL et numéro officiel de chaque exigence', async () => {
    const { rows } = await proprietaire.query(`
      select e.referentiel_id, d.code as domaine, e.code, e.titre, e.aide,
             e.niveau, e.priorite, e.cl, e.code_officiel
        from referentiel_exigences e
        join referentiel_domaines d on d.id = e.domaine_id
       where e.filiale_id is null`);

    const enBase = new Map(rows.map((r) => [r.referentiel_id + '/' + r.domaine + '/' + r.code, r]));
    let comparees = 0;

    for (const c of source.catalogues) {
      for (const d of c.domaines ?? []) {
        for (const e of d.exigences ?? []) {
          const cle = c.id + '/' + d.id + '/' + e.code;
          const ligne = enBase.get(cle);
          assert.ok(ligne, 'L’exigence « ' + cle + ' » du fichier source est absente de la base.');
          assert.equal(ligne.titre, e.titre, 'titre divergent sur « ' + cle + ' »');
          assert.equal(ligne.aide ?? null, e.aide ?? null, 'aide divergente sur « ' + cle + ' »');
          assert.equal(ligne.niveau ?? null, e.niveau ?? null, 'niveau divergent sur « ' + cle + ' »');
          assert.equal(ligne.priorite ?? null, e.priorite ?? null, 'priorité divergente sur « ' + cle + ' »');
          assert.equal(ligne.cl ?? null, e.cl ?? null, 'CL divergent sur « ' + cle + ' »');
          const officiel = (c.codesOfficiels && c.codesOfficiels[e.code]) ?? null;
          assert.equal(
            ligne.code_officiel ?? null,
            officiel,
            'numéro officiel divergent sur « ' + cle + ' » — c’est le constat Q-192, et ' +
              'il s’affiche à l’écran : le fausser induit un RSSI en erreur devant son guide.',
          );
          comparees += 1;
        }
      }
    }
    assert.equal(comparees, 424);
  });

  test('les métadonnées de chaque référentiel', async () => {
    const { rows } = await proprietaire.query(`
      select id, nom, editeur, version_referentiel, description, aide, scoring,
             note_numerotation, codes_officiels, cl_labels, statut
        from referentiels where filiale_id is null`);
    const enBase = new Map(rows.map((r) => [r.id, r]));

    for (const c of source.catalogues) {
      const r = enBase.get(c.id);
      assert.ok(r, 'Le référentiel « ' + c.id + ' » est absent de la base.');
      assert.equal(r.nom, c.nom);
      assert.equal(r.editeur ?? null, c.editeur ?? null);
      assert.equal(r.version_referentiel ?? null, c.version ?? null);
      assert.equal(r.description ?? null, c.description ?? null);
      assert.equal(r.aide ?? null, c.aide ?? null);
      assert.equal(r.scoring, c.scoring ?? 'maturite');
      assert.equal(r.note_numerotation ?? null, c.noteNumerotation ?? null);
      assert.deepEqual(r.codes_officiels ?? null, c.codesOfficiels ?? null);
      assert.deepEqual(r.cl_labels ?? null, c.clLabels ?? null);
      // ⚠️ Les six sont « en_vigueur » : aucun n'est archivé au jour de la livraison.
      assert.equal(r.statut, 'en_vigueur');
    }
    assert.equal(rows.length, source.catalogues.length);
  });

  test('les domaines, leur intitulé, leur forme courte et leur ORDRE', async () => {
    // ⚠️ L'ordre n'est pas décoratif : c'est celui des axes du radar et celui des
    // sections de la fiche. Un domaine déplacé change le dessin du radar sans changer
    // aucune donnée — un défaut qui se voit à l'œil et qu'aucune valeur ne trahit.
    const { rows } = await proprietaire.query(`
      select referentiel_id, code, nom, court, aide, rang
        from referentiel_domaines where filiale_id is null order by referentiel_id, rang`);

    for (const c of source.catalogues) {
      const attendus = (c.domaines ?? []).map((d) => d.id);
      const rendus = rows.filter((r) => r.referentiel_id === c.id).map((r) => r.code);
      assert.deepEqual(rendus, attendus, 'l’ordre des domaines de « ' + c.id + ' » a changé');

      for (const d of c.domaines ?? []) {
        const r = rows.find((x) => x.referentiel_id === c.id && x.code === d.id);
        assert.equal(r.nom, d.nom);
        assert.equal(r.court ?? null, d.court ?? null);
        assert.equal(r.aide ?? null, d.aide ?? null);
      }
    }
  });
});

/* =====================================================================
 *  §3 — LES TRADUCTIONS
 * ===================================================================== */

describe('§3 — les dictionnaires de traduction sont ceux des fichiers', () => {
  test('six dictionnaires anglais, identiques au fichier', async () => {
    const { rows } = await proprietaire.query(
      `select referentiel_id, langue, dictionnaire from referentiel_traductions
        where filiale_id is null`);
    assert.equal(rows.length, source.traductions.length);

    for (const t of source.traductions) {
      const r = rows.find((x) => x.referentiel_id === t.id && x.langue === t.langue);
      assert.ok(r, 'Le dictionnaire « ' + t.id + '/' + t.langue + ' » est absent de la base.');
      // ⚠️ Comparaison PROFONDE du document entier : une clé perdue ferait retomber une
      // exigence sur le français — dégradé, pas cassé, donc invisible. C'est exactement
      // la forme de défaut que la couverture mesurée du lot L11 existe pour voir.
      assert.deepEqual(r.dictionnaire, t.dict);
    }
  });

  test('⚠️ et le FRANÇAIS n’a pas de dictionnaire — il est la source', async () => {
    const { rows } = await proprietaire.query(
      `select count(*)::int as n from referentiel_traductions where langue = 'fr'`);
    assert.equal(
      rows[0].n,
      0,
      'Un dictionnaire français serait une SECONDE source du texte français, qui ' +
        'divergerait du catalogue sans que rien ne le dise (constat Q-219).',
    );
  });
});

/* =====================================================================
 *  §4 — LE GARDE-FOU
 * ===================================================================== */

describe('§4 — le garde-fou des catalogues', () => {
  test('sur le schéma livré : rien à dire', async () => {
    const { rows } = await proprietaire.query('select * from f_verifier_catalogues()');
    assert.deepEqual(rows, []);
  });

  test('MUTATION 1 — l’unicité déplacée vers le DOMAINE le fait rougir', async () => {
    // ⚠️ La mutation la plus subtile du lot, et celle qui compte : l'index porte encore
    // son nom, il est encore unique, et il n'interdit plus l'ambiguïté de
    // `(ref_id, code)`. Un contrôle textuel sur son nom serait resté vert.
    await proprietaire.query('begin');
    try {
      await proprietaire.query('drop index uq_referentiel_exigences_code');
      await proprietaire.query(
        `create unique index uq_referentiel_exigences_code
             on referentiel_exigences (filiale_id, domaine_id, code) nulls not distinct`);
      const { rows } = await proprietaire.query('select * from f_verifier_catalogues()');
      assert.ok(rows.some((r) => r.anomalie === 'unicite_code_deplacee'));
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 2 — une clé étrangère « réparée » sur evaluations le fait rougir', async () => {
    // ⚠️ Un contrôle POSITIF sur une ABSENCE, ce qui est rare. Il existe parce que cette
    // clé a l'air d'un oubli : le jour où quelqu'un la pose, la reprise d'une sauvegarde
    // portant des évaluations d'un catalogue archivé cesse de fonctionner, et le refus
    // arrive en 23503 sans nommer sa cause.
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        `alter table evaluations add constraint fk_evaluations_referentiel
             foreign key (ref_id) references referentiels (id) not valid`);
      const { rows } = await proprietaire.query('select * from f_verifier_catalogues()');
      assert.ok(rows.some((r) => r.anomalie === 'cle_etrangere_sur_evaluations'));
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 3 — une date de publication qui passerait pour « à jour » le fait rougir', async () => {
    await proprietaire.query('begin');
    try {
      await proprietaire.query(`
        create or replace function f_referentiel_age(p_publie_le date, p_duree_alerte_mois integer)
        returns text language sql stable parallel safe
        set search_path = pg_catalog, public, pg_temp as
        $m$ select case
              when p_duree_alerte_mois is null then 'non_surveille'
              when p_publie_le is null then 'a_jour'
              when p_publie_le + (p_duree_alerte_mois || ' months')::interval <= current_date
                then 'a_verifier'
              else 'a_jour' end; $m$`);
      const { rows } = await proprietaire.query('select * from f_verifier_catalogues()');
      assert.ok(
        rows.some((r) => r.anomalie === 'derivation_age_fausse'),
        'Une date inconnue rendue « à jour » est le signal faux DANS LE SENS RASSURANT.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 4 — la clé étrangère de referentiels_actifs retirée le fait rougir', async () => {
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        'alter table referentiels_actifs drop constraint fk_referentiels_actifs_referentiel');
      const { rows } = await proprietaire.query('select * from f_verifier_catalogues()');
      assert.ok(rows.some((r) => r.anomalie === 'piece_catalogue_absente'));
    } finally {
      await proprietaire.query('rollback');
    }
  });
});
