/**
 * cloisonnement.test.mjs — **la moitié base de la condition d'entrée E6.**
 *
 * ── Ce que ce fichier éprouve, et pourquoi il ne peut pas être scindé ────────
 *
 * `008_journal_lecture.sql` fait DEUX choses qui n'ont de sens qu'ensemble
 * (`CONVENTIONS.md` §29.7) :
 *
 *   1. il resserre la politique de lecture de `journal_audit` sur le périmètre ;
 *   2. il rend les deux fonctions de chaînage « security definer ».
 *
 * Faire la première seule casse **toute écriture** au journal : le déclencheur
 * numérote à partir de `max(numero)` LU SOUS RLS, une session de filiale ne voit
 * qu'une partie de la chaîne, repart d'un numéro déjà pris, et meurt sur
 * `uq_journal_audit_numero`. Faire la seconde seule n'améliore rien. C'est le
 * motif du 5ᵉ passage de la porte S2 — *deux fichiers dont aucun n'a tort seul*.
 *
 * Les essais suivent la même règle : chaque propriété est éprouvée **dans les
 * deux sens**. On ne se contente pas de constater que le cloisonnement tient ;
 * on le **casse** et on vérifie que le banc rougit (`PLAN_EXECUTION` §2 bis :
 * *la seule preuve qu'un correctif tient est la mutation*).
 *
 * ⚠️ **Un `0` sur une table cloisonnée ne distingue pas « vide » de « non
 * contrôlé »** (constat Q-104) : la garde de périmètre est évaluée PAR LIGNE,
 * donc sur une table vide elle ne s'exerce pas. Tous les essais de ce fichier se
 * jouent sur un journal NON VIDE, et le vérifient avant d'affirmer quoi que ce
 * soit.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;
/** @type {import('pg').Client} */
let applicatif;

/** Périmètre d'un RSSI de site : une filiale, la sienne. */
const site = (filiale) => perimetre('rssi.site', filiale, [filiale]);
/** Périmètre Groupe : toutes les filiales actives, ce que produit `src/droits/resolution.ts`. */
const groupe = () => perimetre('rssi.groupe', FILIALE_A, [FILIALE_A, FILIALE_B]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // `semerJeuEssai` pose déjà UNE entrée par filiale. Il manque l'entrée
  // TRANSVERSALE — celle sans filiale, que produit un échec de connexion — et
  // c'est elle qui porte le troisième cas du §29.7, donc l'arbitrage.
  await base.avecPerimetre(
    applicatif,
    perimetre('anonyme', null, []),
    async (c) => {
      await c.query(
        `insert into journal_audit (action, utilisateur_libelle, resume)
              values ('connexion_echouee', 'inconnu.au.bataillon', 'échec de connexion : compte inconnu')`,
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/** Compte les entrées visibles depuis un périmètre donné, par filiale. */
async function vuDe(p) {
  return await base.avecPerimetre(applicatif, p, async (c) =>
    (
      await c.query(
        `select coalesce(filiale_id, '(transversal)') as portee, count(*)::int as n
           from journal_audit group by 1 order by 1`,
      )
    ).rows,
  );
}

/* =====================================================================
 *  §1 — De la matière : le journal n'est pas vide (constat Q-104)
 * ===================================================================== */

describe('La matière avant la mesure (constat Q-104)', () => {
  test('le journal porte des entrées des deux filiales ET une entrée transversale', async () => {
    const reparti = await base.lignes(
      proprietaire,
      `select coalesce(filiale_id, '(transversal)') as portee, count(*)::int as n
         from journal_audit group by 1 order by 1`,
    );
    // Sans cette assertion, tous les « 0 » qui suivent seraient ambigus : une
    // table vide rend « 0 » sans que la garde de périmètre s'exerce jamais.
    assert.deepEqual(
      reparti,
      [
        { portee: '(transversal)', n: 1 },
        { portee: FILIALE_A, n: 1 },
        { portee: FILIALE_B, n: 1 },
      ],
      'Les essais de cloisonnement qui suivent ne valent que sur une table NON VIDE.',
    );
  });
});

/* =====================================================================
 *  §2 — L'arbitrage du §29.7, ligne par ligne
 * ===================================================================== */

describe('E6 — la lecture du journal est cloisonnée (CONVENTIONS.md §29.7)', () => {
  test('un périmètre de filiale ne lit QUE sa filiale — ni l’autre, ni le transversal', async () => {
    assert.deepEqual(await vuDe(site(FILIALE_A)), [{ portee: FILIALE_A, n: 1 }]);
    assert.deepEqual(await vuDe(site(FILIALE_B)), [{ portee: FILIALE_B, n: 1 }]);
  });

  test('l’entrée d’une AUTRE filiale est invisible, y compris nommée explicitement', async () => {
    // Le contrôle « group by » ci-dessus pourrait masquer une ligne visible mais
    // agrégée ailleurs. On vise donc la ligne, par son identifiant de filiale.
    const vue = await base.avecPerimetre(applicatif, site(FILIALE_A), async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id = $1', [FILIALE_B]))
        .rows[0].n,
    );
    assert.equal(vue, 0, 'C’est la fuite inter-filiales que E6 ferme.');
  });

  test('l’entrée TRANSVERSALE n’est lue que par un périmètre Groupe — c’est l’arbitrage, et son coût', async () => {
    // Un échec de connexion n'est attaché à aucune filiale : il précède la
    // résolution du périmètre. Le rendre visible à chaque filiale donnerait à
    // chacune la liste des logins du groupe entier. Coût assumé : un
    // administrateur de filiale ne voit pas les tentatives visant ses propres
    // utilisateurs ; c'est le RSSI Groupe qui les voit (§29.7).
    const deLaFiliale = await base.avecPerimetre(applicatif, site(FILIALE_A), async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id is null')).rows[0].n,
    );
    assert.equal(deLaFiliale, 0);

    const duGroupe = await base.avecPerimetre(applicatif, groupe(), async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id is null')).rows[0].n,
    );
    assert.equal(duGroupe, 1);
  });

  test('un périmètre Groupe lit tout : les deux filiales et le transversal', async () => {
    assert.deepEqual(await vuDe(groupe()), [
      { portee: '(transversal)', n: 1 },
      { portee: FILIALE_A, n: 1 },
      { portee: FILIALE_B, n: 1 },
    ]);
  });

  test('un périmètre MULTI incomplet n’est pas un périmètre Groupe', async () => {
    // `f_perimetre_groupe()` déduit la portée Groupe de ce que
    // `src/droits/resolution.ts` met dans `grc.filiales` : TOUTES les filiales
    // actives. Une session « multi » qui n'en couvre pas la totalité lit ses
    // filiales, et rien de transversal. La déduction ne peut pas se
    // désynchroniser de la résolution : elle lit le même catalogue.
    await base.avecPerimetre(
      applicatif,
      perimetre('admin.groupe', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) => {
        await c.query(`insert into filiales (id, code, raison_sociale) values ($1, $2, $3)`, [
          'FIL-ESSAI-C',
          'ESSAIC',
          'Troisième filiale',
        ]);
      },
      { annuler: false },
    );

    // Le même périmètre qu'au test précédent ne couvre plus toutes les filiales
    // actives : il cesse d'être « Groupe », et l'entrée transversale disparaît.
    const duMulti = await base.avecPerimetre(applicatif, groupe(), async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id is null')).rows[0].n,
    );
    assert.equal(duMulti, 0, 'Deux filiales sur trois ne font pas le Groupe.');

    // Et la propriété se rétablit dès que le périmètre les couvre toutes.
    const duGroupeComplet = await base.avecPerimetre(
      applicatif,
      perimetre('rssi.groupe', FILIALE_A, [FILIALE_A, FILIALE_B, 'FIL-ESSAI-C']),
      async (c) =>
        (await c.query('select count(*)::int as n from journal_audit where filiale_id is null')).rows[0].n,
    );
    assert.equal(duGroupeComplet, 1);

    // Remise en état : les essais suivants comptent trois entrées et deux filiales.
    await base.avecPerimetre(
      applicatif,
      perimetre('admin.groupe', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) => {
        await c.query(`delete from filiales where id = $1`, ['FIL-ESSAI-C']);
      },
      { annuler: false },
    );
  });
});

/* =====================================================================
 *  §3 — La mesure qui ferme E6 : grc_lecture cesse de lire le journal
 * ===================================================================== */

describe('E6 — le compte de supervision cesse de lire le journal', () => {
  test('grc_lecture, sans périmètre, ne lit plus rien : il est REFUSÉ, pas rendu vide', async () => {
    // ── LA MESURE QUI A RÉFUTÉ LA JUSTIFICATION ÉCRITE ────────────────
    //
    // Le `README` §8 reportait E6 en écrivant qu'elle était « sans effet tant
    // que le journal est vide ». Mesuré le 04/09/2026 sur la base de recette :
    //
    //     $ psql -U grc_lecture -d cyber_grc -c 'select count(*) from journal_audit'
    //      160
    //
    // grc_lecture est le compte de SUPERVISION, en lecture seule et sans
    // périmètre : il ne peut lire aucun risque, aucune action, aucun incident —
    // et il lisait cent soixante entrées de journal, logins et adresses IP
    // compris.
    //
    // Le refus est BRUYANT (GRC04) et non silencieux : c'est
    // `f_filiales_lecture()` qui lève quand `grc.filiales` n'a jamais été posé
    // (004_rls.sql §2). Sur une table vide, il ne lèverait pas — d'où le §1.
    const lecture = await base.connexion('lecture');
    const erreur = await erreurAttendue(lecture.query('select count(*) from journal_audit'));
    assert.equal(erreur.code, 'GRC04');
    assert.match(erreur.message, /Périmètre non positionné/);
  });

  test('il conserve en revanche le privilège SQL : ce qui a changé est la RLS, pas le « grant »', async () => {
    // La distinction compte pour l'exploitant : le compte de supervision n'a
    // rien perdu de ses droits, il a cessé d'être hors du cloisonnement.
    const privilege = await base.valeur(
      proprietaire,
      `select has_table_privilege('grc_lecture', 'journal_audit', 'select')`,
    );
    assert.equal(privilege, true);
  });
});

/* =====================================================================
 *  §4 — L'autre moitié : le chaînage survit au resserrement
 * ===================================================================== */

describe('Le chaînage survit — c’est la moitié sans laquelle rien ne tient', () => {
  test('une écriture de filiale passe, et la chaîne reste sans trou', async () => {
    const avant = await base.valeur(proprietaire, 'select max(numero)::int from journal_audit');

    await base.avecPerimetre(
      applicatif,
      site(FILIALE_A),
      async (c) => {
        await c.query(
          `insert into journal_audit (action, filiale_id, resume) values ('export', $1, 'après E6')`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );
    await base.avecPerimetre(
      applicatif,
      site(FILIALE_B),
      async (c) => {
        await c.query(
          `insert into journal_audit (action, filiale_id, resume) values ('export', $1, 'après E6')`,
          [FILIALE_B],
        );
      },
      { annuler: false },
    );

    const apres = await base.valeur(proprietaire, 'select max(numero)::int from journal_audit');
    assert.equal(apres, avant + 2, 'La numérotation continue, elle ne repart pas.');

    // C'est ICI que le défaut se serait vu si le « security definer » manquait :
    // la filiale B, ne voyant pas les entrées de A, aurait réattribué un numéro
    // déjà pris et violé uq_journal_audit_numero.
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_journal_audit_verifier()'),
      [],
      'Un journal sain ne renvoie AUCUNE ligne (CONVENTIONS.md §12).',
    );
  });

  test('une écriture TRANSVERSALE passe encore : un échec de connexion n’a pas de filiale', async () => {
    const affectees = await base.avecPerimetre(
      applicatif,
      perimetre('anonyme', null, []),
      async (c) =>
        (
          await c.query(
            `insert into journal_audit (action, resume) values ('connexion_echouee', 'compte inconnu')`,
          )
        ).rowCount,
      { annuler: false },
    );
    assert.equal(affectees, 1);
  });

  test('l’écriture reste cloisonnée : on ne fabrique pas de preuve chez le voisin', async () => {
    // Le « security definer » ne porte que sur la LECTURE de la chaîne. La
    // politique d'ajout, elle, s'évalue sous le rôle APPELANT : elle n'a pas
    // bougé, et il faut le constater plutôt que le supposer.
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, site(FILIALE_A), async (c) => {
        await c.query(
          `insert into journal_audit (action, filiale_id, resume) values ('creation', $1, 'preuve fabriquée')`,
          [FILIALE_B],
        );
      }),
    );
    assert.equal(erreur.code, '42501');
  });

  test('l’ajout seul tient toujours : modifier ou supprimer lève GRC01', async () => {
    for (const ordre of [
      "update journal_audit set resume = 'falsifié'",
      'delete from journal_audit',
      'truncate journal_audit',
    ]) {
      const erreur = await erreurAttendue(
        base.avecPerimetre(applicatif, site(FILIALE_A), async (c) => c.query(ordre)),
      );
      assert.ok(
        erreur.code === 'GRC01' || erreur.code === '42501',
        `« ${ordre} » doit être refusé bruyamment ; reçu ${String(erreur.code)}.`,
      );
    }
  });
});

/* =====================================================================
 *  §5 — LES MORSURES : on casse, et on vérifie que le banc rougit
 * ---------------------------------------------------------------------
 *  « Un correctif accepté n'est pas un correctif sûr. La seule preuve qu'il
 *  tient est la mutation — le casser et vérifier que le banc rougit »
 *  (`PLAN_EXECUTION` §2 bis, leçon du 6ᵉ passage de la porte S2).
 *
 *  Deux formes de morsure, et la distinction n'est pas de commodité :
 *
 *   · celles qui n'observent que le CATALOGUE — le garde-fou voit-il le défaut ?
 *     — se jouent sur la base partagée, dans une transaction ANNULÉE. Le DDL est
 *     transactionnel dans PostgreSQL, et le §6 vérifie que rien n'est resté ;
 *   · celles qui observent un COMPORTEMENT sous un rôle cloisonné exigent une
 *     base à elles. Le propriétaire ne peut pas « set role grc_app » — il n'en
 *     est pas membre, et c'est une bonne nouvelle —, et un sabotage non validé
 *     est invisible depuis l'autre connexion. On monte donc une base jetable,
 *     on y valide le sabotage, on mesure sous `grc_app`, et on jette la base.
 *     Le coût est d'une seconde et demie ; l'alternative était une doublure, et
 *     *une doublure n'émet que ce que son auteur a prévu* (§25).
 * ===================================================================== */

/**
 * Joue `travail` sur une base sabotée, puis annule TOUT.
 *
 * Le sabotage est du DDL : `create or replace function`, `drop policy`. Il est
 * transactionnel dans PostgreSQL, donc un `rollback` le défait entièrement — y
 * compris la politique supprimée. Vérifié au §6.
 */
async function avecSabotage(sabotage, travail) {
  await proprietaire.query('begin');
  try {
    await proprietaire.query(sabotage);
    return await travail();
  } finally {
    await proprietaire.query('rollback');
  }
}

/**
 * Monte une base JETABLE, semée comme la base partagée, puis y valide `sabotage`.
 *
 * L'appelant est responsable de la fermer (`t.after`). Elle porte exactement
 * trois entrées de journal, dans cet ordre : filiale A (n° 1), filiale B (n° 2),
 * transversale (n° 3) — ce qui rend la collision de numérotation prévisible et
 * la mesure interprétable.
 */
async function baseJetableSabotee(sabotage) {
  const jetable = await ouvrirBaseEssai(import.meta.url);
  const app = await jetable.connexion('app');
  await semerJeuEssai(jetable, app);
  await jetable.avecPerimetre(
    app,
    perimetre('anonyme', null, []),
    async (c) => {
      await c.query(
        `insert into journal_audit (action, resume) values ('connexion_echouee', 'compte inconnu')`,
      );
    },
    { annuler: false },
  );
  const prop = await jetable.connexion('proprietaire');
  await prop.query(sabotage);
  return { jetable, app, prop };
}

/**
 * `f_journal_audit_chainage()` reposée SANS « security definer ».
 *
 * Le corps est celui de `001_socle.sql`, à ceci près qu'il ne reproduit pas ses
 * quarante lignes de commentaire : ce qui compte ici est le `select … from
 * journal_audit`, et c'est LUI que la Row Level Security gouverne.
 */
const CHAINAGE_SANS_DEFINISSEUR = `
  create or replace function f_journal_audit_chainage() returns trigger
      language plpgsql
      set search_path = pg_catalog, public, pg_temp as
  $f$
  declare v_precedent record;
  begin
      perform pg_advisory_xact_lock(4718271936042001);
      select j.numero, j.empreinte into v_precedent
        from journal_audit j order by j.numero desc limit 1;
      new.numero := coalesce(v_precedent.numero, 0) + 1;
      new.empreinte_precedente := v_precedent.empreinte;
      new.horodatage := clock_timestamp();
      new.utilisateur_id := (select u.id from utilisateurs u
                              where lower(u.identifiant) = lower(f_utilisateur_courant()));
      new.empreinte := encode(sha256(convert_to(
          f_journal_audit_charge_utile(
              new.numero, new.id, new.horodatage, new.filiale_id,
              new.utilisateur_id, new.utilisateur_libelle, new.session_id,
              new.adresse_ip, new.action, new.entite_type, new.entite_id,
              new.resume, new.valeurs_avant, new.valeurs_apres,
              new.version_application, new.empreinte_precedente),
          'UTF8')), 'hex');
      return new;
  end;
  $f$;`;

const POLITIQUE_ROUVERTE = `
  drop policy pol_journal_audit_lecture on journal_audit;
  create policy pol_journal_audit_lecture on journal_audit for select using (true);`;

describe('MORSURE — retirer le « security definer » casse TOUTE écriture au journal', () => {
  let jetable;
  let app;

  after(async () => {
    await jetable?.fermer();
  });

  test('sans lui, la numérotation repart d’un numéro déjà pris', async (t) => {
    ({ jetable, app } = await baseJetableSabotee(CHAINAGE_SANS_DEFINISSEUR));

    // Depuis la filiale A, la chaîne visible s'arrête au n° 1 : le déclencheur
    // attribue donc le n° 2, déjà porté par l'entrée de la filiale B — qu'il ne
    // voit pas. C'est le symptôme exact annoncé par `004_rls.sql` §6.
    const erreur = await erreurAttendue(
      jetable.avecPerimetre(app, site(FILIALE_A), async (c) => {
        await c.query(
          `insert into journal_audit (action, filiale_id, resume) values ('export', $1, 'sabotage')`,
          [FILIALE_A],
        );
      }),
    );

    assert.equal(
      erreur.code,
      '23505',
      'Sans « security definer », l’écriture doit échouer sur uq_journal_audit_numero. ' +
        `Reçu : ${String(erreur.code)} — ${String(erreur.message).split('\n')[0]}`,
    );
    assert.match(String(erreur.constraint ?? erreur.message), /uq_journal_audit_numero/);
    t.diagnostic(`échec attendu obtenu : ${String(erreur.message).split('\n')[0]}`);
  });

  test('le garde-fou de schéma le voit AUSSI, sans attendre la première écriture', async () => {
    // La morsure précédente prouve le symptôme ; celle-ci prouve qu'on n'a pas
    // besoin d'attendre la production pour le voir. Elle vise l'autre fonction,
    // pour que les deux soient couvertes.
    const sabotage = `
      create or replace function f_journal_audit_verifier(p_depuis bigint default null)
      returns table (numero_entree bigint, id_entree text, horodatage_entree timestamptz,
                     anomalie text, detail text)
          language plpgsql stable
          set search_path = pg_catalog, public, pg_temp as
      $f$ begin return; end; $f$;`;

    const anomalies = await avecSabotage(sabotage, async () =>
      base.lignes(proprietaire, 'select * from f_verifier_lecture_journal()'),
    );
    assert.deepEqual(
      anomalies.map((l) => [l.objet, l.anomalie]),
      [['f_journal_audit_verifier(bigint)', 'chainage_sans_definisseur']],
    );
  });
});

describe('MORSURE — rouvrir la politique rend le journal non cloisonné, et le garde-fou le dit', () => {
  let jetable;
  let app;

  after(async () => {
    await jetable?.fermer();
  });

  test('« using (true) » : la filiale A relit l’entrée de B et le transversal', async (t) => {
    ({ jetable, app } = await baseJetableSabotee(POLITIQUE_ROUVERTE));

    const vue = await jetable.avecPerimetre(app, site(FILIALE_A), async (c) =>
      (
        await c.query(
          `select coalesce(filiale_id, '(transversal)') as portee, count(*)::int as n
             from journal_audit group by 1 order by 1`,
        )
      ).rows,
    );

    // Trois portées visibles depuis un périmètre d'UNE filiale : c'est
    // exactement l'état d'avant 008, et c'est ce que E6 ferme.
    assert.equal(vue.length, 3, `Attendu la fuite ; observé : ${JSON.stringify(vue)}`);
    t.diagnostic(`fuite reproduite : ${JSON.stringify(vue)}`);

    // Et le compte de supervision, qui n'a aucun périmètre, relit tout le journal.
    const lecture = await jetable.connexion('lecture');
    const vuDeLaSupervision = await jetable.valeur(
      lecture,
      'select count(*)::int from journal_audit',
    );
    assert.equal(vuDeLaSupervision, 3, 'C’est la mesure du 04/09 — 160 entrées — en petit.');
  });

  test('le garde-fou rend ses trois anomalies, et f_verifier_schema() n’est plus silencieux', async () => {
    const { anomalies, schema } = await avecSabotage(POLITIQUE_ROUVERTE, async () => ({
      anomalies: await base.lignes(proprietaire, 'select * from f_verifier_lecture_journal()'),
      schema: await base.lignes(
        proprietaire,
        `select controle, anomalie from f_verifier_schema() where controle = 'lecture_journal'`,
      ),
    }));

    assert.deepEqual(anomalies.map((l) => l.anomalie).sort(), [
      'lecture_non_cloisonnee',
      'proprietaire_sans_lecture',
      'transversales_non_traitees',
    ]);
    // Le point d'appel unique doit le RELAYER : un garde-fou que rien n'appelle
    // est un commentaire (CONVENTIONS.md §18.4).
    assert.equal(schema.length, 3, 'f_verifier_schema() doit relayer les trois anomalies.');
  });

  test('oublier le cas transversal est un défaut À PART : « transversales_non_traitees »', async () => {
    // Le piège que ce nom d'anomalie ferme : une politique qui cloisonne
    // correctement les entrées de filiale mais ne dit rien de `filiale_id is
    // null` rend ces entrées invisibles À TOUT LE MONDE, RSSI Groupe compris —
    // et le journal cesse de prouver les tentatives d'intrusion, sans qu'aucun
    // symptôme ne le dise.
    const anomalies = await avecSabotage(
      `drop policy pol_journal_audit_lecture on journal_audit;
       create policy pol_journal_audit_lecture on journal_audit for select
           using (f_est_proprietaire_base() or filiale_id = any (f_filiales_lecture()));`,
      async () => base.lignes(proprietaire, 'select * from f_verifier_lecture_journal()'),
    );
    assert.deepEqual(
      anomalies.map((l) => l.anomalie),
      ['transversales_non_traitees'],
    );
  });

  test('une politique AJOUTÉE à côté, ouverte, est vue elle aussi : les permissives se combinent par OU', async () => {
    const anomalies = await avecSabotage(
      `create policy pol_journal_audit_lecture_bis on journal_audit for select using (true);`,
      async () => base.lignes(proprietaire, 'select * from f_verifier_lecture_journal()'),
    );
    assert.deepEqual(
      anomalies.map((l) => [l.objet, l.anomalie]),
      [['pol_journal_audit_lecture_bis', 'lecture_non_cloisonnee']],
      'Une seule politique permissive ouverte rouvre la table entière.',
    );
  });

  test('retirer TOUTE politique de lecture est un troisième défaut, et il porte son nom', async () => {
    const anomalies = await avecSabotage(
      `drop policy pol_journal_audit_lecture on journal_audit;`,
      async () => base.lignes(proprietaire, 'select * from f_verifier_lecture_journal()'),
    );
    assert.deepEqual(
      anomalies.map((l) => l.anomalie),
      ['politique_lecture_absente'],
      'Un journal illisible de tous n’est pas la même chose qu’un journal ouvert à tous.',
    );
  });
});

/* =====================================================================
 *  §6 — L'état d'après : rien n'est resté cassé
 * ===================================================================== */

describe('Après les morsures, la base est intacte', () => {
  test('la politique, le garde-fou et la chaîne sont revenus à leur état correct', async () => {
    const predicat = await base.valeur(
      proprietaire,
      `select pg_get_expr(polqual, polrelid) from pg_policy
        where polrelid = 'journal_audit'::regclass and polname = 'pol_journal_audit_lecture'`,
    );
    assert.match(predicat, /f_est_proprietaire_base/);
    assert.match(predicat, /f_perimetre_groupe/);
    assert.match(predicat, /f_filiales_lecture/);
    assert.doesNotMatch(predicat, /f_administration_groupe/);

    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_lecture_journal()'), []);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_journal_audit_verifier()'), []);

    const politiquesEnTrop = await base.valeur(
      proprietaire,
      `select count(*)::int from pg_policy
        where polrelid = 'journal_audit'::regclass and polname = 'pol_journal_audit_lecture_bis'`,
    );
    assert.equal(politiquesEnTrop, 0, 'Le sabotage de DDL doit avoir été annulé.');
  });

  test('le garde-fou neuf est CONSIGNÉ au registre : sa disparition ne serait plus silencieuse', async () => {
    // Constat Q-5 : un contrôle qui cesse d'être découvert doit laisser sa ligne
    // derrière lui, sans quoi le point d'appel annoncerait « aucune anomalie »
    // sur une base dont un garde-fou est tombé.
    const consigne = await base.valeur(
      proprietaire,
      `select signature from controles_schema where fonction = 'f_verifier_lecture_journal'`,
    );
    assert.equal(
      consigne,
      'f_verifier_lecture_journal() returns TABLE(objet text, anomalie text, detail text)',
    );
  });

  test('les deux fonctions du chaînage sont « security definer », au propriétaire, chemin figé', async () => {
    const etat = await base.lignes(
      proprietaire,
      `select p.proname::text as nom, p.prosecdef as definisseur,
              (p.proowner = d.datdba) as au_proprietaire,
              array_to_string(p.proconfig, ' ') as reglages
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        cross join pg_database d
        where n.nspname = 'public' and d.datname = current_database()
          and p.proname in ('f_journal_audit_chainage', 'f_journal_audit_verifier')
        order by p.proname`,
    );
    assert.equal(etat.length, 2);
    for (const f of etat) {
      assert.equal(f.definisseur, true, `${f.nom} doit être « security definer ».`);
      assert.equal(f.au_proprietaire, true, `${f.nom} doit appartenir au propriétaire de la base.`);
      assert.match(f.reglages, /search_path=.*pg_temp/, `${f.nom} doit figer son chemin de recherche.`);
    }
  });

  test('le droit d’exécution de la vérification n’est PAS resté à PUBLIC', async () => {
    // Une fonction « security definer » ouverte à tout rôle capable de se
    // connecter serait une surface que personne n'a décidé d'ouvrir (005 §6).
    const aPublic = await base.valeur(
      proprietaire,
      `select has_function_privilege('public', 'f_journal_audit_verifier(bigint)', 'execute')`,
    );
    assert.equal(aPublic, false);

    // Le rôle applicatif, lui, en a besoin : c'est lui qui sert
    // GET /api/journal/verification.
    const aLApplicatif = await base.valeur(
      proprietaire,
      `select has_function_privilege('grc_app', 'f_journal_audit_verifier(bigint)', 'execute')`,
    );
    assert.equal(aLApplicatif, true);
  });
});
