/**
 * fuseau-horaire.test.mjs — un garde-fou rend le MÊME verdict partout, ou il ne mesure
 * pas le produit : il mesure l'endroit d'où on le regarde.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le 25/09/2026, une PREMIÈRE INSTALLATION CHEZ UN CLIENT a été refusée :
 *
 *     ERR 038_une_preuve_sert_plusieurs_controles.sql : Le schéma est en défaut après
 *     038 : nis2/rapport_final : delai_reglementaire_faux (Le délai calculé est de
 *     743.00 heures ; la loi en impose 744.)
 *
 * Le banc était vert ici, et il l'était encore une heure plus tard. `SRV-Infra` est en
 * `Etc/UTC` ; la VM du client est en temps civil européen. `timestamptz + interval
 * '1 month'` s'ajoute **au cadran**, dans le fuseau de la SESSION : un mois qui traverse
 * un changement d'heure ne fait pas 744 heures. Le produit avait raison ; **le garde
 * exigeait un nombre d'HEURES pour une grandeur de CALENDRIER**, et aucun nombre d'heures
 * n'est juste dans tous les fuseaux à la fois.
 *
 * 🛑 **C'est le huitième corollaire du `CLAUDE.md` §8** — *une dépendance d'environnement
 * non déclarée manquera chez quelqu'un d'autre* — et c'est la deuxième fois : une famille
 * entière d'essais avait tenu à une entrée `/etc/hosts` que rien ne posait, verte chez son
 * auteur et **614 sur 628** sur une machine neuve.
 *
 * ⚠️ **Ce que ce fichier mesure et qu'aucun autre ne pouvait mesurer** : le banc, comme
 * l'installateur, se connecte avec le fuseau de la machine. Tant que personne ne joue les
 * garde-fous SOUS UN AUTRE FUSEAU, un défaut de cette classe est invisible ici par
 * construction. Les sept fuseaux ci-dessous sont choisis, pas décoratifs : deux dont la
 * bascule tombe DANS la fenêtre des témoins (Paris le 29/03/2026, New York le 08/03), un
 * sans heure d'été du tout, un dont la bascule tombe juste après, un de l'hémisphère sud
 * qui bascule en sens inverse, et une île à décalage d'un quart d'heure.
 *
 * Toutes les mutations vivent dans une transaction ANNULÉE.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;

/**
 * Sept fuseaux, et le motif de chacun. Ce n'est pas une liste de goût : elle couvre les
 * quatre situations qui font varier le nombre d'heures d'un mois de calendrier.
 */
const FUSEAUX = Object.freeze([
  ['Etc/UTC', 'aucune bascule — le fuseau de SRV-Infra, celui qui rendait tout vert'],
  ['Europe/Paris', 'bascule le 29/03/2026, DANS la fenêtre du témoin de mars'],
  ['America/New_York', 'bascule le 08/03/2026, DANS la fenêtre aussi'],
  ['Asia/Kolkata', 'aucune heure d’été, et un décalage d’une demi-heure'],
  ['Australia/Sydney', 'bascule le 05/04/2026 — juste APRÈS la fenêtre'],
  ['Pacific/Chatham', 'décalage d’un quart d’heure, hémisphère sud'],
  ['America/Sao_Paulo', 'heure d’été abolie en 2019 : un fuseau qui a CHANGÉ de régime'],
]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});

after(async () => {
  // On ne laisse pas le fuseau bougé derrière soi : la connexion est partagée.
  await proprietaire?.query("set timezone to default").catch(() => {});
  await base?.fermer();
});

/** Joue `sql` sous le fuseau `tz`, dans une transaction ANNULÉE, et rend les anomalies. */
async function anomaliesSous(tz, sql = []) {
  await proprietaire.query('begin');
  try {
    await proprietaire.query(`set local timezone = '${tz}'`);
    for (const instruction of sql) await proprietaire.query(instruction);
    const { rows } = await proprietaire.query(
      'select anomalie, objet from f_verifier_schema() order by 1, 2',
    );
    return rows;
  } finally {
    await proprietaire.query('rollback');
  }
}

const resume = (a) =>
  a.length === 0 ? '(aucune)' : a.map((x) => `${x.anomalie} / ${x.objet}`).join(' · ');

describe('§1 — Le verdict du schéma ne dépend pas du fuseau de qui l’interroge', () => {
  for (const [tz, motif] of FUSEAUX) {
    test(`sous ${tz} — ${motif}`, async () => {
      const anomalies = await anomaliesSous(tz);
      assert.equal(
        anomalies.length,
        0,
        `f_verifier_schema() rend ${String(anomalies.length)} anomalie(s) sous ${tz} : ` +
          `${resume(anomalies)}.\n` +
          '  Un garde-fou dont le verdict dépend du fuseau refuse une installation chez un ' +
          'client pendant que le banc est vert chez son auteur. C’est arrivé le 25/09/2026, ' +
          'à la migration 038, et c’est ce que ce contrôle existe pour empêcher.',
      );
    });
  }
});

describe('§2 — L’horloge réglementaire compte des MOIS, pas des heures', () => {
  test('un mois de calendrier vaut 744 h en mars et 672 h en février', async () => {
    // La propriété qui rend l'attendu en heures indéfendable : deux mois voisins n'ont
    // pas la même durée. C'est pour cela que le garde compare des INSTANTS.
    const { rows } = await proprietaire.query(
      `select extract(epoch from (echeance - $1::timestamptz)) / 3600 as heures
         from f_echeances_reglementaires($1::timestamptz, $1::date)
        where palier = 'rapport_final'`,
      ['2026-02-01 09:00:00+00'],
    );
    assert.equal(rows.length, 1);
    // En UTC — le fuseau du banc quand rien n'est posé — février fait 28 jours.
    assert.equal(Number(rows[0].heures), 672);
  });

  test('🛑 « réparer » en écrivant interval 744 hours fait ROUGIR le garde', async () => {
    // C'est la correction qui vient à l'esprit devant le message d'erreur, et elle est
    // fausse : elle donnerait 744 h en février aussi. L'ancienne rédaction du garde
    // l'aurait ACCEPTÉE — c'est la mutation qui prouve que la neuve est plus forte.
    const anomalies = await anomaliesSous('Etc/UTC', [
      `create or replace function f_echeances_reglementaires(
           p_detecte_le timestamptz, p_date_detection date)
       returns table (regime text, palier text, reference text, echeance timestamptz, origine text)
         language sql stable set search_path = pg_catalog, public, pg_temp as $f$
         select v.regime, v.palier, v.reference,
                coalesce(p_detecte_le, p_date_detection::timestamptz) + v.delai, 'instant'
           from (values ('nis2','alerte_precoce','a',interval '24 hours'),
                        ('nis2','notification','b',interval '72 hours'),
                        ('nis2','rapport_final','d',interval '744 hours'),
                        ('rgpd','notification_cnil','33',interval '72 hours'))
                as v(regime, palier, reference, delai)
          where coalesce(p_detecte_le, p_date_detection::timestamptz) is not null; $f$`,
    ]);
    assert.ok(
      anomalies.some((a) => a.anomalie === 'echeance_reglementaire_fausse'),
      `Le garde a laissé passer un délai en heures fixes : ${resume(anomalies)}.`,
    );
  });

  test('un palier raccourci à 30 jours est nommé', async () => {
    const anomalies = await anomaliesSous('Etc/UTC', [
      `create or replace function f_echeances_reglementaires(
           p_detecte_le timestamptz, p_date_detection date)
       returns table (regime text, palier text, reference text, echeance timestamptz, origine text)
         language sql stable set search_path = pg_catalog, public, pg_temp as $f$
         select v.regime, v.palier, v.reference,
                coalesce(p_detecte_le, p_date_detection::timestamptz) + v.delai, 'instant'
           from (values ('nis2','alerte_precoce','a',interval '24 hours'),
                        ('nis2','notification','b',interval '72 hours'),
                        ('nis2','rapport_final','d',interval '30 days'),
                        ('rgpd','notification_cnil','33',interval '72 hours'))
                as v(regime, palier, reference, delai)
          where coalesce(p_detecte_le, p_date_detection::timestamptz) is not null; $f$`,
    ]);
    assert.ok(anomalies.some((a) => a.anomalie === 'echeance_reglementaire_fausse'), resume(anomalies));
  });
});

describe('§3 — Aucune fonction IMMUTABLE ne laisse la SESSION choisir un fuseau', () => {
  /** Les deux fonctions d'horloge doivent être `stable` (migration 074). */
  test('les fonctions d’échéance se déclarent STABLE, jamais IMMUTABLE', async () => {
    const { rows } = await proprietaire.query(
      `select proname, provolatile::text as volatilite
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and proname in ('f_echeances_reglementaires', 'f_echeance_contractuelle')
        order by 1`,
    );
    assert.equal(rows.length, 2, 'Les deux fonctions d’échéance doivent exister.');
    for (const r of rows) {
      assert.equal(
        r.volatilite,
        's',
        `${r.proname} est déclarée « ${r.volatilite} » : son résultat dépend de TimeZone ` +
          '(un mois de calendrier, ou un jour civil converti en instant), donc IMMUTABLE ' +
          'est une promesse fausse — le planificateur peut replier l’expression et ' +
          'réemployer le plan sous un autre fuseau.',
      );
    }
  });

  /** ⚠️ La moitié NON-BRUIT : trois fonctions voisines doivent rester immutables. */
  test('et les trois fonctions INNOCENTES le restent — dont l’empreinte de la main courante', async () => {
    const { rows } = await proprietaire.query(
      `select proname, provolatile::text as volatilite
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and proname in ('f_echeance_droits', 'f_prochain_controle', 'f_main_courante_charge_utile')
        order by 1`,
    );
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(
        r.volatilite,
        'i',
        `${r.proname} a perdu son immutabilité. Les deux premières ajoutent des mois à une ` +
          '`date` — calendrier pur, aucun fuseau — et la troisième emploie `at time zone ' +
          '\'UTC\'`, zone LITTÉRALE : son immutabilité est NÉCESSAIRE, car une empreinte ' +
          'calculée dans le fuseau du lecteur romprait la chaîne d’intégrité de la main ' +
          'courante de crise, en ajout seul et pièce d’audit.',
      );
    }
  });

  for (const [quoi, corps] of [
    ['::timestamp — l’instant ramené au cadran du lecteur',
     `to_char(p_horodatage::timestamp, 'YYYY-MM-DD')`],
    ['cast(… as timestamp) — la même chose écrite autrement',
     `to_char(cast(p_horodatage as timestamp), 'YYYY-MM-DD')`],
    ['at time zone avec une zone VARIABLE',
     `to_char(p_horodatage at time zone current_setting('TimeZone'), 'YYYY-MM-DD')`],
  ]) {
    test(`🛑 l’empreinte de la main courante par ${quoi} est NOMMÉE`, async () => {
      // ⚠️ La troisième de ces trois formes n'a été trouvée qu'en jouant la mutation :
      // la première rédaction du garde employait `\b` comme limite de mot, or en ARE
      // PostgreSQL `\b` est le caractère BACKSPACE. Le motif ne mordait donc jamais, et
      // le garde rendait zéro anomalie — c'est-à-dire ce qu'il rend quand tout va bien.
      const anomalies = await anomaliesSous('Etc/UTC', [
        `create or replace function f_main_courante_charge_utile(
             p_numero integer, p_id text, p_horodatage timestamptz, p_filiale_id text,
             p_incident_id text, p_auteur text, p_auteur_libelle text, p_categorie text,
             p_texte text, p_empreinte_precedente text)
         returns text language sql immutable
           set search_path = pg_catalog, public, pg_temp as $f$
           select concat_ws(chr(31), p_numero::text, p_id, ${corps}, p_filiale_id,
                            p_incident_id, coalesce(p_auteur, ''), coalesce(p_auteur_libelle, ''),
                            p_categorie, p_texte, coalesce(p_empreinte_precedente, '')); $f$`,
      ]);
      assert.ok(
        anomalies.some((a) => a.anomalie === 'immutable_mais_depend_du_fuseau'),
        `Le garde n’a pas vu une empreinte devenue dépendante du fuseau : ${resume(anomalies)}.`,
      );
    });
  }

  test('le garde de l’horloge qui PERD son épinglage de fuseau est vu', async () => {
    // Le garde fixe son propre fuseau. Si quelqu'un retire cet épinglage, son verdict
    // redevient dépendant de l'endroit d'où on l'interroge — et c'est précisément ce que
    // la migration 074 ferme. La mutation le retire et joue sous Paris.
    const anomalies = await anomaliesSous('Europe/Paris', [
      'alter function f_verifier_horloge_reglementaire() reset timezone',
    ]);
    assert.ok(
      anomalies.some((a) => a.anomalie === 'echeance_reglementaire_fausse'),
      `Le garde désépinglé n’a rien dit sous Europe/Paris : ${resume(anomalies)}. ` +
        'C’est l’état exact dans lequel une installation a été refusée le 25/09/2026.',
    );
  });
});
