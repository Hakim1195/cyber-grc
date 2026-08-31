/**
 * rls.test.mjs — ce que `004_rls.sql` promet, éprouvé en exécution réelle.
 *
 * La promesse est unique et elle est lourde : « la filiale de Toulouse ne peut
 * TECHNIQUEMENT pas lire les données de la filiale allemande » (PLAN_SERVEUR §2.4).
 * Personne ne peut la vérifier en lisant du SQL — une politique manquante, un `force`
 * oublié, une liaison sans filiale_id, et la phrase devient fausse sans que rien ne
 * change à l'écran. Chaque test ci-dessous met donc une propriété nommée en défaut
 * délibérément.
 *
 * Chaque assertion vise une propriété de `backend/db/CONVENTIONS.md` :
 *   §4  cloisonnement par filiale, tables de niveau filiale / mixte / Groupe
 *   §7  liaisons n-n sans filiale_id — l'angle mort : leur politique est leur seule défense
 *   §11 périmètre de session, lecture ≠ écriture, `force row level security`
 *   §12 journal d'audit : l'ajout seul survit-il à la RLS ?
 *   §14 rôles et privilèges
 *   §15 codes d'erreur : GRC01, GRC04
 *   §16 découpage Groupe / Filiale / Mixte, et cohérence du catalogue de mesures
 *
 * Base neuve à chaque exécution, migrée par `db/migrate.mjs` : voir `../aide/base.mjs`.
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 *
 * Codes attendus, et il faut savoir les distinguer :
 *   42501  la Row Level Security a refusé (« new row violates row-level security policy »)
 *          — ou, pour le journal, le privilège SQL absent : deux couches, même code
 *   23514  le déclencheur de cohérence du catalogue de mesures a refusé
 *   GRC04  le périmètre n'a pas été positionné (défaut de programmation)
 *   GRC01  journal d'audit en ajout seul
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { erreurAttendue, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Connexion du compte propriétaire : DDL des contrôles de morsure, inspection du catalogue. */
let proprietaire;
/** Connexion du compte applicatif : c'est de LUI que parle la question d'audit. */
let applicatif;

/** Les deux filiales de l'essai. Toulouse est celle depuis laquelle on regarde. */
const A = 'FIL-ESSAI-A';
const B = 'FIL-ESSAI-B';

/**
 * Connexions supplémentaires ouvertes par certains tests (session vierge, session
 * rendue au pool). Fermées AVANT `base.fermer()` : la suppression de la base d'essai
 * passe par un « drop database … with (force) », et le compte propriétaire n'a pas le
 * droit d'interrompre une connexion restée ouverte sous le compte applicatif.
 */
const connexionsJetables = [];

/** Périmètres types, tels que la couche d'authentification les résoudra (L3). */
const rssiSite = (filiale) => perimetre('rssi-site', filiale, [filiale]);
const rssiGroupe = (active) => perimetre('rssi-groupe', active, [A, B]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semer();
});

after(async () => {
  for (const client of connexionsJetables) {
    await client.end().catch(() => {
      /* Déjà fermée : sans conséquence. */
    });
  }
  await base?.fermer();
});

/* =====================================================================
 *  Jeu d'essai
 * ===================================================================== */

/**
 * Deux filiales, un socle de Groupe, et de quoi éprouver les quatre familles de
 * tables. Semé par le COMPTE APPLICATIF, sous périmètre, comme le fera le serveur —
 * un jeu d'essai posé en contournant la RLS ne prouverait rien de ce qui suit.
 */
async function semer() {
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', A, [A, B]),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'ZZESSA', 'Essai Toulouse', 'FR'),
             ($2, 'ZZESSB', 'Essai Allemagne', 'DE')`,
        [A, B],
      );

      // Socle de niveau Groupe : son écriture EXIGE le réglage d'administration.
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query(
        `insert into mesure_catalogue (id, nom) values ('MESURE-G', 'Chiffrement des postes')`,
      );
      await c.query(`insert into personnes (id, nom) values ('PERS-G', 'RSSI groupe')`);
      await c.query(`insert into documents (id, titre) values ('DOC-G', 'PSSI du groupe')`);
      await c.query("select set_config('grc.administration_groupe', '', true)");

      for (const [filiale, suffixe] of [
        [A, 'A'],
        [B, 'B'],
      ]) {
        // On n'écrit que dans la filiale ACTIVE : elle bascule à chaque tour.
        await c.query("select set_config('grc.filiale_id', $1, true)", [filiale]);
        await c.query(`insert into clients   (id, filiale_id, nom)            values ($1, $2, 'Donneur d''ordre')`, [`CLI-${suffixe}`, filiale]);
        await c.query(`insert into exigences (id, filiale_id, code, intitule) values ($1, $2, 'A.5.1', 'Politique')`, [`EX-${suffixe}`, filiale]);
        await c.query(`insert into risques   (id, filiale_id, nom)            values ($1, $2, 'Rançongiciel')`, [`RISK-${suffixe}`, filiale]);
        await c.query(`insert into actifs    (id, filiale_id, nom)            values ($1, $2, 'ERP')`, [`ACTIF-${suffixe}`, filiale]);
        await c.query(`insert into actifs    (id, filiale_id, nom)            values ($1, $2, 'Serveur')`, [`ACTIF2-${suffixe}`, filiale]);
        await c.query(`insert into processus (id, filiale_id, nom)            values ($1, $2, 'Expédition')`, [`BIA-${suffixe}`, filiale]);
        await c.query(`insert into incidents (id, filiale_id, titre)          values ($1, $2, 'Hameçonnage')`, [`INC-${suffixe}`, filiale]);
        await c.query(`insert into traitements (id, filiale_id, nom)          values ($1, $2, 'Paie')`, [`TRT-${suffixe}`, filiale]);
        await c.query(`insert into evaluations (id, filiale_id, ref_id, code) values ($1, $2, 'anssi', 'M1')`, [`EVAL-${suffixe}`, filiale]);
        // Semé pour les clés étrangères directes du §17.1 : tests_pra.scenario_id est la
        // septième des sept clés du constat B-1.
        await c.query(`insert into scenarios_pra (id, filiale_id, nom)        values ($1, $2, 'Perte du site')`, [`SCEN-${suffixe}`, filiale]);
        await c.query(`insert into mesure_catalogue (id, filiale_id, nom)     values ($1, $2, 'Mesure locale')`, [`MESURE-${suffixe}`, filiale]);
        await c.query(`insert into personnes (id, filiale_id, nom)            values ($1, $2, 'Responsable')`, [`PERS-${suffixe}`, filiale]);
        await c.query(`insert into documents (id, filiale_id, titre)          values ($1, $2, 'Procédure locale')`, [`DOC-${suffixe}`, filiale]);
        await c.query(`insert into imports (id, filiale_id, entite, source, nom_fichier) values ($1, $2, 'risques', 'excel', 'r.xlsx')`, [`IMP-${suffixe}`, filiale]);
        await c.query(`insert into import_erreurs (import_id, ligne, message) values ($1, 12, 'colonne absente')`, [`IMP-${suffixe}`]);

        // Les cinq liaisons sans filiale_id : c'est sur elles que porte l'angle mort.
        await c.query(`insert into risque_exigences (risque_id, exigence_id)  values ($1, $2)`, [`RISK-${suffixe}`, `EX-${suffixe}`]);
        await c.query(`insert into actif_risques    (actif_id, risque_id)     values ($1, $2)`, [`ACTIF-${suffixe}`, `RISK-${suffixe}`]);
        await c.query(`insert into processus_actifs (processus_id, actif_id)  values ($1, $2)`, [`BIA-${suffixe}`, `ACTIF-${suffixe}`]);
        await c.query(`insert into incident_actifs  (incident_id, actif_id)   values ($1, $2)`, [`INC-${suffixe}`, `ACTIF-${suffixe}`]);
        await c.query(`insert into actif_dependances (actif_id, actif_cible_id, type) values ($1, $2, 'hosted')`, [`ACTIF-${suffixe}`, `ACTIF2-${suffixe}`]);
      }
    },
    { annuler: false },
  );
}

/** Nombre de lignes rendues par une requête, sous le périmètre donné. */
async function compter(client, p, requete, valeurs = []) {
  return base.avecPerimetre(client, p, async (c) => {
    const resultat = await c.query(requete, valeurs);
    return Number(resultat.rows[0].n);
  });
}

/** Joue une instruction attendue en échec sous un périmètre, et rend l'erreur. */
async function refus(client, p, instruction, valeurs = []) {
  return erreurAttendue(
    base.avecPerimetre(client, p, async (c) => {
      await c.query(instruction, valeurs);
    }),
  );
}

/* =====================================================================
 *  §4 et §11 — Lecture cloisonnée, famille par famille
 * ===================================================================== */

describe('Lecture cloisonnée (CONVENTIONS §4, §11, §16.4)', () => {
  test('famille « niveau filiale » : Toulouse ne voit AUCUNE ligne des autres filiales', async () => {
    // Le contrôle ne cite aucune table : il les découvre dans le catalogue. Une table
    // cloisonnée ajoutée demain par une migration future est donc éprouvée sans que ce
    // fichier bouge — c'est ce qui empêche le test de devenir obsolète en silence.
    const tables = await base.lignes(
      proprietaire,
      `select c.relname as nom
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
        where n.nspname = 'public' and c.relkind = 'r'
          and a.attnotnull and a.attnum > 0 and not a.attisdropped
          and c.relname <> 'session_filiales'
        order by 1`,
    );
    assert.ok(tables.length >= 24, `Balayage suspect : ${tables.length} table(s) seulement.`);

    const fautives = [];
    await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      for (const { nom } of tables) {
        const resultat = await c.query(
          `select count(*)::int as n from "${nom}" where filiale_id <> $1`,
          [A],
        );
        if (resultat.rows[0].n > 0) fautives.push(`${nom} (${resultat.rows[0].n})`);
      }
    });

    assert.deepEqual(fautives, [], `Lignes d'une autre filiale visibles depuis ${A}.`);
  });

  test('contrôle symétrique : Toulouse voit bien SES données', async () => {
    // « Zéro ligne » ne prouve rien sur une base vide. Sans ce contre-test, une
    // politique qui refuserait TOUT passerait le test précédent avec les honneurs.
    const n = await compter(
      applicatif,
      rssiSite(A),
      `select (select count(*) from risques) + (select count(*) from exigences)
            + (select count(*) from actifs)  + (select count(*) from incidents) as n`,
    );
    assert.equal(n, 5, 'Toulouse doit voir ses 1 risque, 1 exigence, 2 actifs et 1 incident.');
  });

  test('famille « mixte » : le socle de Groupe est commun, le local reste local', async () => {
    const groupe = await compter(
      applicatif,
      rssiSite(A),
      `select (select count(*) from mesure_catalogue where filiale_id is null)
            + (select count(*) from personnes where filiale_id is null)
            + (select count(*) from documents where filiale_id is null) as n`,
    );
    assert.equal(groupe, 3, 'Les lignes de portée Groupe sont le socle commun : lisibles de tous.');

    const autre = await compter(
      applicatif,
      rssiSite(A),
      `select (select count(*) from mesure_catalogue where filiale_id = $1)
            + (select count(*) from personnes where filiale_id = $1)
            + (select count(*) from documents where filiale_id = $1) as n`,
      [B],
    );
    assert.equal(autre, 0, 'Les lignes LOCALES d’une autre filiale restent invisibles.');
  });

  test('famille « liaisons sans filiale_id » : les liens de l’autre filiale sont invisibles', async () => {
    const vus = await compter(
      applicatif,
      rssiSite(A),
      `select (select count(*) from risque_exigences  where risque_id = $1)
            + (select count(*) from actif_risques     where risque_id = $1)
            + (select count(*) from processus_actifs  where actif_id  = $2)
            + (select count(*) from incident_actifs   where actif_id  = $2)
            + (select count(*) from actif_dependances where actif_id  = $2) as n`,
      [`RISK-B`, `ACTIF-B`],
    );
    assert.equal(vus, 0, 'Aucune clé étrangère ne protège ces tables : seule la politique le fait.');

    const miens = await compter(
      applicatif,
      rssiSite(A),
      `select (select count(*) from risque_exigences  where risque_id = $1)
            + (select count(*) from actif_risques     where risque_id = $1)
            + (select count(*) from processus_actifs  where actif_id  = $2)
            + (select count(*) from incident_actifs   where actif_id  = $2)
            + (select count(*) from actif_dependances where actif_id  = $2) as n`,
      [`RISK-A`, `ACTIF-A`],
    );
    assert.equal(miens, 5, 'Contrôle symétrique : ses propres liens, eux, sont visibles.');
  });

  test('table fille sans filiale_id : les erreurs d’import suivent leur import', async () => {
    const vues = await compter(
      applicatif,
      rssiSite(A),
      "select count(*)::int as n from import_erreurs where import_id = 'IMP-B'",
    );
    assert.equal(vues, 0, 'Une ligne d’erreur cite le contenu du fichier importé : c’est de la donnée de filiale.');
  });

  test('périmètre multi-filiales : un RSSI groupe lit les deux, et c’est voulu', async () => {
    const n = await compter(
      applicatif,
      rssiGroupe(A),
      'select count(*)::int as n from risques',
    );
    assert.equal(n, 2, 'La lecture porte sur TOUT le périmètre, pas sur la seule filiale active.');
  });
});

/* =====================================================================
 *  §11 — Écriture : la filiale ACTIVE, et elle seule
 * ===================================================================== */

describe('Écriture confinée à la filiale active (CONVENTIONS §11)', () => {
  test('écrire dans une autre filiale est refusé', async () => {
    const erreur = await refus(
      applicatif,
      rssiSite(A),
      `insert into risques (id, filiale_id, nom) values ('RISK-X', $1, 'intrusion')`,
      [B],
    );
    assert.equal(erreur.code, '42501', 'La politique d’écriture doit refuser, pas ignorer.');
  });

  test('un RSSI groupe non plus : lire deux filiales n’autorise pas à écrire dans les deux', async () => {
    // C'est le sens même de la distinction lecture / écriture du §11 : le périmètre de
    // lecture couvre B, la filiale ACTIVE est A, donc B reste en lecture seule.
    const erreur = await refus(
      applicatif,
      rssiGroupe(A),
      `insert into risques (id, filiale_id, nom) values ('RISK-X', $1, 'intrusion')`,
      [B],
    );
    assert.equal(erreur.code, '42501');
  });

  test('déplacer une ligne vers une autre filiale est refusé (« with check »)', async () => {
    const erreur = await refus(
      applicatif,
      rssiSite(A),
      `update risques set filiale_id = $1 where id = 'RISK-A'`,
      [B],
    );
    assert.equal(erreur.code, '42501', 'Sans « with check », une ligne pourrait être poussée chez le voisin.');
  });

  test('supprimer une ligne d’une autre filiale n’affecte rien', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query("delete from risques where id = 'RISK-B'");
      return resultat.rowCount;
    });
    assert.equal(affectees, 0, 'La ligne de l’autre filiale n’est même pas candidate.');

    const survivant = await compter(
      applicatif,
      rssiSite(B),
      "select count(*)::int as n from risques where id = 'RISK-B'",
    );
    assert.equal(survivant, 1, 'Et elle est toujours là.');
  });

  test('contrôle symétrique : écrire chez soi fonctionne', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        `insert into risques (id, filiale_id, nom) values ('RISK-OK', $1, 'essai')`,
        [A],
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });
});

/* =====================================================================
 *  §7 — Les liaisons sans filiale_id : l'angle mort
 * ===================================================================== */

describe('Liaisons sans filiale_id — refusées À L’INSERTION (CONVENTIONS §7)', () => {
  // Rappel de ce qui rend ces tests indispensables : les contrôles d'intégrité
  // référentielle de PostgreSQL CONTOURNENT la RLS. La clé étrangère vers l'exigence
  // allemande est donc satisfaite même si cette exigence est invisible. Sans politique
  // d'écriture, la ligne existerait — invisible, mais bien réelle, et rendue au premier
  // export d'exploitation venu.
  const liens = [
    ['risque_exigences (risque TLS ↔ exigence DEU)', "insert into risque_exigences (risque_id, exigence_id) values ('RISK-A', 'EX-B')"],
    ['risque_exigences (sens inverse)', "insert into risque_exigences (risque_id, exigence_id) values ('RISK-B', 'EX-A')"],
    ['actif_risques', "insert into actif_risques (actif_id, risque_id) values ('ACTIF-A', 'RISK-B')"],
    ['processus_actifs', "insert into processus_actifs (processus_id, actif_id) values ('BIA-A', 'ACTIF-B')"],
    ['incident_actifs', "insert into incident_actifs (incident_id, actif_id) values ('INC-A', 'ACTIF-B')"],
    ['actif_dependances', "insert into actif_dependances (actif_id, actif_cible_id, type) values ('ACTIF-A', 'ACTIF-B', 'flux')"],
    ['import_erreurs (import d’une autre filiale)', "insert into import_erreurs (import_id, ligne, message) values ('IMP-B', 3, 'x')"],
  ];

  for (const [nom, instruction] of liens) {
    test(`un lien inter-filiales est refusé : ${nom}`, async () => {
      const erreur = await refus(applicatif, rssiSite(A), instruction);
      assert.equal(
        erreur.code,
        '42501',
        `${nom} : le lien inter-filiales doit être REFUSÉ, pas seulement invisible.`,
      );
    });
  }

  test('un RSSI groupe ne peut pas davantage relier ses deux filiales', async () => {
    // Le cas le plus tentant : l'utilisateur VOIT les deux extrémités. La politique
    // d'écriture exige pourtant que les deux appartiennent à la filiale ACTIVE.
    const erreur = await refus(
      applicatif,
      rssiGroupe(A),
      "insert into risque_exigences (risque_id, exigence_id) values ('RISK-A', 'EX-B')",
    );
    assert.equal(erreur.code, '42501');
  });

  test('contrôle symétrique : un lien intra-filiale passe', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        "insert into actif_risques (actif_id, risque_id) values ('ACTIF2-A', 'RISK-A')",
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('la cascade de suppression fonctionne toujours sous RLS', async () => {
    // Les cascades sont portées par le schéma (CONVENTIONS §8) et exécutées par le
    // moteur d'intégrité référentielle. Une politique trop stricte pourrait les faire
    // échouer : ce test le vérifie, parce qu'une suppression qui échoue en production
    // est aussi grave qu'une fuite.
    const restants = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("delete from risques where id = 'RISK-A'");
      const resultat = await c.query(
        "select count(*)::int as n from risque_exigences where risque_id = 'RISK-A'",
      );
      return resultat.rows[0].n;
    });
    assert.equal(restants, 0, 'Supprimer un risque délie ses exigences, RLS ou pas.');
  });
});

/* =====================================================================
 *  §11 et §15 — Le périmètre : vide, absent, mort au commit
 * ===================================================================== */

describe('Périmètre de session (CONVENTIONS §11, §15)', () => {
  test('périmètre posé mais VIDE : aucune donnée, et aucune erreur', async () => {
    // Cas légitime des traitements système (PERIMETRE_SYSTEME de src/db/pool.ts) :
    // ils n'ont accès à rien, et ne doivent déranger personne.
    const n = await compter(
      applicatif,
      perimetre('systeme', null, []),
      'select count(*)::int as n from risques',
    );
    assert.equal(n, 0);
  });

  test('périmètre JAMAIS POSÉ : GRC04, bruyamment', async () => {
    // L'autre moitié de la règle : ce n'est pas une situation d'utilisateur, c'est un
    // défaut de programmation. Une liste vide rendue en silence coûterait des heures.
    const vierge = await base.nouvelleConnexion('app');
    connexionsJetables.push(vierge);
    const erreur = await erreurAttendue(vierge.query('select count(*) from risques'));
    assert.equal(erreur.code, 'GRC04');
    assert.match(erreur.message, /Périmètre non positionné/);
  });

  test('écrire sans filiale active : GRC04 également', async () => {
    const erreur = await refus(
      applicatif,
      perimetre('lecteur', null, [A]),
      `insert into risques (id, filiale_id, nom) values ('RISK-Z', $1, 'essai')`,
      [A],
    );
    assert.equal(erreur.code, 'GRC04');
    assert.match(erreur.message, /sans filiale active/);
  });

  test('le périmètre meurt au COMMIT — la condition du pool de connexions', async () => {
    // L'assertion la plus importante du fichier après le cloisonnement lui-même : une
    // connexion rendue au pool après un commit ne doit rien emporter du périmètre de
    // l'utilisateur précédent. Le socle vérifie que les réglages disparaissent ; ici on
    // vérifie ce qui en découle vraiment — la requête suivante ne voit plus la moindre
    // ligne de la filiale du précédent occupant.
    const session = await base.nouvelleConnexion('app');
    connexionsJetables.push(session);

    const vus = await base.avecPerimetre(
      session,
      rssiSite(B),
      async (c) => Number((await c.query('select count(*)::int as n from risques')).rows[0].n),
      { annuler: false },
    );
    assert.equal(vus, 1, 'Pendant sa transaction, la session voyait bien la filiale B.');

    const restant = Number(
      (await session.query('select count(*)::int as n from risques')).rows[0].n,
    );
    assert.equal(restant, 0, 'Après le commit, plus rien : le périmètre n’a pas survécu.');

    // Nuance à connaître, et raison pour laquelle ce test n'attend PAS GRC04 : après un
    // commit, PostgreSQL rend le réglage local à sa valeur de session, qui est la chaîne
    // vide et non l'absence. La connexion retombe donc dans le cas « périmètre vide »
    // (zéro ligne, silencieux) et non dans le cas « jamais posé » (GRC04), lequel n'est
    // observable que sur une connexion neuve — c'est l'objet du test précédent.
    const reglage = await base.valeur(
      session,
      "select coalesce(current_setting('grc.filiales', true), '(absent)')",
    );
    assert.equal(reglage, '', 'Le réglage est rendu à sa valeur de session, soit la chaîne vide.');
  });
});

/* =====================================================================
 *  §4 et §16 — Tables mixtes et administration Groupe
 * ===================================================================== */

describe('Tables mixtes et réglage d’administration (CONVENTIONS §4, §16.2)', () => {
  test('écrire une ligne de portée Groupe sans le réglage est refusé', async () => {
    const erreur = await refus(
      applicatif,
      rssiSite(A),
      "insert into mesure_catalogue (id, nom) values ('MESURE-X', 'ajout au socle')",
    );
    assert.equal(erreur.code, '42501', 'Une filiale ne modifie pas le socle commun du Groupe.');
  });

  test('avec le réglage d’administration, la même écriture passe', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      const resultat = await c.query(
        "insert into mesure_catalogue (id, nom) values ('MESURE-X', 'ajout au socle')",
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('le réglage est strict : toute valeur autre que « oui » vaut non', async () => {
    for (const valeur of ['true', '1', 'OUI', 'non', '']) {
      const erreur = await erreurAttendue(
        base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
          await c.query("select set_config('grc.administration_groupe', $1, true)", [valeur]);
          await c.query("insert into mesure_catalogue (id, nom) values ('MESURE-Y', 'x')");
        }),
      );
      assert.equal(erreur.code, '42501', `La valeur « ${valeur} » ne doit pas ouvrir l’écriture.`);
    }
  });

  test('LE POINT CRITIQUE : le réglage n’élargit JAMAIS la lecture', async () => {
    // Si un réglage de session pouvait ouvrir la lecture, tout l'édifice tomberait :
    // il suffirait d'un chemin de code qui le pose par erreur.
    const vues = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      const resultat = await c.query(
        `select (select count(*) from risques where filiale_id = $1)
              + (select count(*) from mesure_catalogue where filiale_id = $1)
              + (select count(*) from documents where filiale_id = $1) as n`,
        [B],
      );
      return Number(resultat.rows[0].n);
    });
    assert.equal(vues, 0, 'Le réglage d’administration ne doit rien rendre visible.');
  });

  test('et aucune politique de LECTURE ne mentionne le réglage', async () => {
    // Contrôle structurel, complémentaire du précédent : le test ci-dessus vaut pour
    // les tables qu'il interroge, celui-ci vaut pour les 47.
    const fautives = await base.lignes(
      proprietaire,
      `select c.relname || '.' || p.polname as politique
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
        where p.polcmd in ('r', '*')
          and coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%f_administration_groupe%'`,
    );
    assert.deepEqual(fautives.map((l) => l.politique), []);
  });
});

/* =====================================================================
 *  §16.2 et §16.3 — Cohérence du catalogue de mesures
 * ===================================================================== */

describe('Cohérence catalogue de mesures ↔ filiale (CONVENTIONS §16.2, §16.3)', () => {
  // Ce qu'aucune clé étrangère ne peut tenir : mesure_catalogue.filiale_id est nullable
  // (socle Groupe ou mesure locale), donc aucune clé composite (mesure_id, filiale_id)
  // n'est possible.
  const cas = [
    ['mesure_mise_en_oeuvre', "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-X', $1, 'MESURE-B')"],
    ['actions', "insert into actions (id, filiale_id, titre, mesure_id) values ('ACT-X', $1, 'essai', 'MESURE-B')"],
    ['traitement_mesures', "insert into traitement_mesures (traitement_id, mesure_id, filiale_id) values ('TRT-A', 'MESURE-B', $1)"],
    ['evaluation_mesures', "insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-B', $1)"],
  ];

  for (const [table, instruction] of cas) {
    test(`${table} : implémenter la mesure LOCALE d’une autre filiale est refusé`, async () => {
      const erreur = await refus(applicatif, rssiSite(A), instruction, [A]);
      assert.equal(erreur.code, '23514', `${table} : refus attendu du déclencheur de cohérence.`);
      assert.match(erreur.message, /locale à une autre filiale/);
    });
  }

  test('contrôle symétrique : la mesure du socle GROUPE, elle, s’implémente', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        `insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-OK', $1, 'MESURE-G')`,
        [A],
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('contrôle symétrique : sa propre mesure locale aussi', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        `insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-OK2', $1, 'MESURE-A')`,
        [A],
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });
});

/* =====================================================================
 *  §12 — Le journal d'audit après 004
 * ===================================================================== */

describe('Journal d’audit sous RLS (CONVENTIONS §12)', () => {
  test('toujours en AJOUT SEUL : modification, suppression et vidage refusés', async () => {
    for (const instruction of [
      "update journal_audit set resume = 'falsifié'",
      'delete from journal_audit',
      'truncate journal_audit',
    ]) {
      const erreur = await refus(applicatif, rssiSite(A), instruction);
      assert.equal(
        erreur.code,
        '42501',
        `« ${instruction} » : le compte applicatif n’a pas le verbe SQL (couche 1 du §12).`,
      );
    }
  });

  test('le propriétaire lui-même reste arrêté par le déclencheur, pas par un silence', async () => {
    // La RLS ne doit pas AVALER l'opération : c'est le déclencheur, bruyant, qui refuse.
    const erreur = await refus(proprietaire, rssiSite(A), "update journal_audit set resume = 'x'");
    assert.equal(erreur.code, 'GRC01', 'Un refus muet (0 ligne) serait un défaut, pas une protection.');
  });

  test('une entrée ne s’attribue pas à une filiale hors périmètre', async () => {
    const erreur = await refus(
      applicatif,
      rssiSite(A),
      `insert into journal_audit (action, filiale_id, resume) values ('creation', $1, 'preuve fabriquée')`,
      [B],
    );
    assert.equal(erreur.code, '42501', 'Nul ne fabrique de preuve dans le registre d’une autre filiale.');
  });

  test('une entrée transversale, sans filiale, reste possible', async () => {
    // Échec de connexion, démarrage du service : l'événement précède la résolution
    // du périmètre (CONVENTIONS §4).
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        "insert into journal_audit (action, resume) values ('connexion_echouee', 'compte inconnu')",
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('DÉROGATION ASSUMÉE : la lecture du journal n’est pas cloisonnée', async () => {
    // Ce test ne célèbre pas une propriété, il VERROUILLE une dérogation : le chaînage
    // par empreinte (001) numérote à partir de max(numero) et se vérifie sur toute la
    // chaîne. Resserrer cette politique sans traiter d'abord les deux fonctions du socle
    // ferait échouer toute écriture au journal — ce test tombera alors, et c'est le but.
    const predicat = await base.valeur(
      proprietaire,
      `select pg_get_expr(polqual, polrelid) from pg_policy
        where polrelid = 'journal_audit'::regclass and polname = 'pol_journal_audit_lecture'`,
    );
    assert.equal(predicat, 'true', 'Voir 004_rls.sql §6 : dérogation documentée, à traiter en L5.');
  });

  test('la chaîne se numérote sans trou malgré des entrées de plusieurs filiales', async () => {
    // La conséquence directe de la dérogation ci-dessus : si la lecture était
    // cloisonnée, la numérotation repartirait d'un numéro déjà pris.
    await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("insert into journal_audit (action, filiale_id, resume) values ('export', $1, 'a')", [A]);
    }, { annuler: false });
    await base.avecPerimetre(applicatif, rssiSite(B), async (c) => {
      await c.query("insert into journal_audit (action, filiale_id, resume) values ('export', $1, 'b')", [B]);
    }, { annuler: false });

    const anomalies = await base.lignes(proprietaire, 'select anomalie from f_journal_audit_verifier()');
    assert.deepEqual(anomalies.map((l) => l.anomalie), []);
  });
});

/* =====================================================================
 *  §14 — Rôles et privilèges
 * ===================================================================== */

describe('Rôle applicatif et privilèges (CONVENTIONS §14)', () => {
  test('grc_app n’a ni SUPERUSER ni BYPASSRLS', async () => {
    const role = (
      await base.lignes(
        proprietaire,
        "select rolsuper, rolbypassrls from pg_roles where rolname = 'grc_app'",
      )
    )[0];
    assert.ok(role, 'Le rôle grc_app doit exister (db/dev/preparer_base_dev.sh).');
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false, 'BYPASSRLS rendrait toute cette migration décorative.');
  });

  test('grc_app ne possède aucun objet : il ne peut pas retirer le « force »', async () => {
    const possedes = await base.lignes(
      proprietaire,
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_roles r on r.oid = c.relowner
        where n.nspname = 'public' and c.relkind in ('r','p','v','m') and r.rolname = 'grc_app'`,
    );
    assert.deepEqual(possedes.map((l) => l.relname), []);
  });

  test('migrations_schema n’est plus réinscriptible par grc_app', async () => {
    // Le défaut remonté par l'agent OUTILLAGE : pouvoir réécrire « empreinte », c'est
    // pouvoir maquiller la réécriture d'une migration déjà appliquée.
    const droits = (
      await base.lignes(
        proprietaire,
        `select has_table_privilege('grc_app', 'migrations_schema', 'select') as lecture,
                has_table_privilege('grc_app', 'migrations_schema', 'insert') as ajout,
                has_table_privilege('grc_app', 'migrations_schema', 'update') as modification,
                has_table_privilege('grc_app', 'migrations_schema', 'delete') as suppression`,
      )
    )[0];
    assert.deepEqual(droits, {
      lecture: true,
      ajout: false,
      modification: false,
      suppression: false,
    });

    const erreur = await refus(
      applicatif,
      rssiSite(A),
      "update migrations_schema set empreinte = repeat('0', 64) where version = '001'",
    );
    assert.equal(erreur.code, '42501', 'Et le refus est effectif, pas seulement déclaré.');
  });

  test('le propriétaire, lui, écrit toujours le registre (migrate.mjs en dépend)', async () => {
    // Contrôle symétrique : un « force row level security » sans politique d'écriture
    // sur migrations_schema casserait silencieusement db/migrate.mjs.
    const affectees = await base.avecPerimetre(proprietaire, rssiSite(A), async (c) => {
      const resultat = await c.query(
        "update migrations_schema set empreinte = repeat('a', 64) where version = '004'",
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });
});

/* =====================================================================
 *  §11 — Couverture, et le garde-fou qui mord
 * ===================================================================== */

describe('Couverture RLS et garde-fou (004 §8)', () => {
  test('les 47 tables sont sous « enable » ET « force row level security »', async () => {
    const etat = (
      await base.lignes(
        proprietaire,
        `select count(*)::int as tables,
                count(*) filter (where relrowsecurity)::int as actives,
                count(*) filter (where relforcerowsecurity)::int as forcees
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'`,
      )
    )[0];
    assert.equal(etat.actives, etat.tables, 'Une table sans RLS est une table lisible de tous.');
    assert.equal(etat.forcees, etat.tables, 'Sans « force », le propriétaire échappe aux politiques.');
    assert.ok(etat.tables >= 47, `Seulement ${etat.tables} tables balayées.`);
  });

  test('la vérification de couverture ne signale aucune anomalie', async () => {
    const anomalies = await base.lignes(
      proprietaire,
      'select objet, anomalie from f_verifier_couverture_rls() order by 1, 2',
    );
    assert.deepEqual(anomalies, []);
  });

  test('LE GARDE-FOU MORD : une table nouvelle sans politique est signalée', async () => {
    // Contrôle de morsure intégré : sans lui, « aucune anomalie » pourrait vouloir dire
    // « la fonction ne regarde rien ». On crée exprès la faute que la fonction est
    // censée attraper — celle qu'une migration future commettra un jour.
    /** Anomalies signalées pour la table d'essai, dans l'ordre. */
    const anomalies = async () =>
      (
        await base.lignes(
          proprietaire,
          `select anomalie from f_verifier_couverture_rls()
            where objet = 'essai_table_sans_politique' order by 1`,
        )
      ).map((l) => l.anomalie);

    await proprietaire.query('create table essai_table_sans_politique (id text primary key)');
    try {
      // La fonction signale TOUT ce qui manque, pas seulement le premier défaut : c'est
      // ce qui permet à l'exploitant de corriger d'un seul passage.
      assert.deepEqual(await anomalies(), [
        'force_absente',
        'politique_ecriture_absente',
        'politique_lecture_absente',
        'rls_desactivee',
      ]);

      await proprietaire.query('alter table essai_table_sans_politique enable row level security');
      assert.deepEqual(await anomalies(), [
        'force_absente',
        'politique_ecriture_absente',
        'politique_lecture_absente',
      ]);

      await proprietaire.query('alter table essai_table_sans_politique force row level security');
      assert.deepEqual(await anomalies(), [
        'politique_ecriture_absente',
        'politique_lecture_absente',
      ]);

      await proprietaire.query(
        'create policy pol_essai_lecture on essai_table_sans_politique for select using (true)',
      );
      assert.deepEqual(await anomalies(), ['politique_ecriture_absente']);

      await proprietaire.query(
        'create policy pol_essai_ajout on essai_table_sans_politique for insert with check (true)',
      );
      assert.deepEqual(
        await anomalies(),
        [],
        'Une table SANS filiale_id, couverte, ne doit plus rien déclencher.',
      );
    } finally {
      await proprietaire.query('drop table essai_table_sans_politique');
    }
  });

  test('LE GARDE-FOU MORD AUSSI sur une politique trop large', async () => {
    // L'autre faute possible : la table est bien sous RLS, mais sa politique dit « true ».
    await proprietaire.query('drop policy pol_risques_lecture on risques');
    await proprietaire.query('create policy pol_risques_lecture on risques for select using (true)');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_couverture_rls() where objet = 'risques'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['lecture_non_cloisonnee']);
    } finally {
      await proprietaire.query('drop policy pol_risques_lecture on risques');
      await proprietaire.query(
        'create policy pol_risques_lecture on risques for select using (filiale_id = any (f_filiales_lecture()))',
      );
    }

    // Et le schéma est rendu intact : sans ce contrôle, les tests suivants
    // raisonneraient sur une base ouverte sans le savoir.
    const anomalies = await base.lignes(proprietaire, 'select objet from f_verifier_couverture_rls()');
    assert.deepEqual(anomalies, []);
  });
});

/* =====================================================================
 *  §17.1 — Les clés étrangères DIRECTES entre deux tables cloisonnées
 * =====================================================================
 *
 *  Constat B-1 de la porte de sécurité S1, et la raison pour laquelle il est passé :
 *  le banc d'essai ne testait que les tables de LIAISON (bloc précédent). Or les liens
 *  inter-filiales passent aussi par les colonnes de rattachement des entités
 *  elles-mêmes — sept d'entre elles portaient une clé étrangère SIMPLE.
 *
 *  Ce qui refuse ici n'est PAS la RLS mais l'intégrité référentielle (23503), et c'est
 *  tout le sujet : les contrôles d'intégrité de PostgreSQL contournent délibérément la
 *  RLS, si bien qu'une clé simple est satisfaite par une ligne invisible. La filiale A
 *  écrivait une référence vers une ligne de la filiale B ; une suppression parfaitement
 *  ordinaire faite par B détruisait alors — ou modifiait, pour « set null » — des lignes
 *  de A, en y inscrivant l'identité de son auteur et en incrémentant leur compteur de
 *  verrouillage optimiste. Seule la clé COMPOSITE (colonne, filiale_id) ferme le chemin.
 */

describe('Clés étrangères directes entre filiales (CONVENTIONS §17.1)', () => {
  const transfrontieres = [
    ['actions.exigence_id vers une exigence DEU', "insert into actions (id, filiale_id, titre, exigence_id) values ('ACT-FK1', $1, 'essai', 'EX-B')"],
    ['actions.risque_id vers un risque DEU', "insert into actions (id, filiale_id, titre, risque_id) values ('ACT-FK2', $1, 'essai', 'RISK-B')"],
    ['actions.evaluation_id vers une évaluation DEU', "insert into actions (id, filiale_id, titre, evaluation_id) values ('ACT-FK3', $1, 'essai', 'EVAL-B')"],
    ['actions.incident_id vers un incident DEU', "insert into actions (id, filiale_id, titre, incident_id) values ('ACT-FK4', $1, 'essai', 'INC-B')"],
    ['exigences.client_id vers un donneur d’ordre DEU', "insert into exigences (id, filiale_id, code, intitule, client_id) values ('EX-FK5', $1, 'A.5.2', 'essai', 'CLI-B')"],
    ['incidents.risque_id vers un risque DEU', "insert into incidents (id, filiale_id, titre, risque_id) values ('INC-FK6', $1, 'essai', 'RISK-B')"],
    ['tests_pra.scenario_id vers un scénario DEU', "insert into tests_pra (id, filiale_id, scenario_id) values ('TEST-FK7', $1, 'SCEN-B')"],
  ];

  for (const [nom, instruction] of transfrontieres) {
    test(`référencer une ligne de l’autre filiale est refusé : ${nom}`, async () => {
      const erreur = await refus(applicatif, rssiSite(A), instruction, [A]);
      assert.equal(
        erreur.code,
        '23503',
        `${nom} : la clé étrangère doit être COMPOSITE, sinon une ligne invisible la satisfait.`,
      );
    });
  }

  test('un RSSI groupe ne peut pas davantage rattacher au-delà de sa filiale active', async () => {
    // Le cas le plus tentant : l'utilisateur VOIT les deux extrémités. La clé composite
    // porte pourtant la filiale de l'ENFANT, qui reste la filiale active.
    const erreur = await refus(
      applicatif,
      rssiGroupe(A),
      "insert into actions (id, filiale_id, titre, risque_id) values ('ACT-FKG', $1, 'essai', 'RISK-B')",
      [A],
    );
    assert.equal(erreur.code, '23503');
  });

  test('contrôle symétrique : les rattachements légitimes passent toujours', async () => {
    // Sans ce contre-test, une clé étrangère cassée obtiendrait le même sans-faute que la
    // clé composite. Ce qui est demandé, c'est de refuser le lien transfrontière SANS
    // refuser le lien légitime.
    const posees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      let n = 0;
      for (const instruction of [
        "insert into actions (id, filiale_id, titre, exigence_id) values ('ACT-OK1', $1, 'essai', 'EX-A')",
        "insert into actions (id, filiale_id, titre, risque_id) values ('ACT-OK2', $1, 'essai', 'RISK-A')",
        "insert into actions (id, filiale_id, titre, evaluation_id) values ('ACT-OK3', $1, 'essai', 'EVAL-A')",
        "insert into actions (id, filiale_id, titre, incident_id) values ('ACT-OK4', $1, 'essai', 'INC-A')",
        "insert into exigences (id, filiale_id, code, intitule, client_id) values ('EX-OK5', $1, 'A.5.3', 'essai', 'CLI-A')",
        "insert into incidents (id, filiale_id, titre, risque_id) values ('INC-OK6', $1, 'essai', 'RISK-A')",
        "insert into tests_pra (id, filiale_id, scenario_id) values ('TEST-OK7', $1, 'SCEN-A')",
      ]) {
        n += (await c.query(instruction, [A])).rowCount;
      }
      return n;
    });
    assert.equal(posees, 7, 'Les sept rattachements intra-filiale doivent passer.');
  });

  test('contrôle symétrique : une action SANS rattachement passe (« match simple »)', async () => {
    // Nuance de sémantique, et elle compte : en « match simple » — le défaut — une clé
    // composite dont l'une des colonnes est nulle est satisfaite sans contrôle. Rendre
    // ces clés composites ne devait donc rien changer aux actions non rattachées.
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        "insert into actions (id, filiale_id, titre) values ('ACT-NUL', $1, 'sans rattachement')",
        [A],
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('LE BALAYAGE : aucune clé étrangère entre deux tables cloisonnées n’est simple', async () => {
    // Les tests ci-dessus prouvent l'état d'aujourd'hui ; celui-ci protège de demain. Il
    // ne cite aucune contrainte : il les DÉCOUVRE dans le catalogue. Une entité ajoutée
    // par une migration future avec une clé simple vers une autre table cloisonnée fera
    // tomber ce test sans que personne n'ait à y penser — c'est exactement l'omission qui
    // a produit le constat B-1, et c'est ce test qui l'empêche de se reproduire.
    const requete = `
      with cloisonnee as (
        select c.oid, c.relname::text as nom
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
         where n.nspname = 'public' and c.relkind = 'r'
           and a.attnotnull and a.attnum > 0 and not a.attisdropped)
      select con.conname::text || ' (' || e.nom || ' -> ' || p.nom || ')' as fautive
        from pg_constraint con
        join cloisonnee e on e.oid = con.conrelid
        join cloisonnee p on p.oid = con.confrelid
       where con.contype = 'f' and p.nom <> 'filiales'
         and not exists (select 1 from unnest(con.conkey) as k
                          join pg_attribute att
                            on att.attrelid = con.conrelid and att.attnum = k
                         where att.attname = 'filiale_id')
       order by 1`;

    const fautives = await base.lignes(proprietaire, requete);
    assert.deepEqual(
      fautives.map((l) => l.fautive),
      [],
      'Une clé étrangère entre deux tables cloisonnées doit porter (colonne, filiale_id).',
    );

    // Contrôle de morsure intégré : « aucune fautive » pourrait aussi vouloir dire « la
    // requête ne regarde rien ». On recrée exprès le défaut d'origine.
    await proprietaire.query('alter table tests_pra drop constraint fk_tests_pra_scenario');
    try {
      await proprietaire.query(
        'alter table tests_pra add constraint fk_tests_pra_scenario '
          + 'foreign key (scenario_id) references scenarios_pra(id) on delete cascade',
      );
      const apresMorsure = await base.lignes(proprietaire, requete);
      assert.deepEqual(
        apresMorsure.map((l) => l.fautive),
        ['fk_tests_pra_scenario (tests_pra -> scenarios_pra)'],
        'Le balayage doit voir une clé étrangère redevenue simple.',
      );
    } finally {
      await proprietaire.query('alter table tests_pra drop constraint fk_tests_pra_scenario');
      await proprietaire.query(
        'alter table tests_pra add constraint fk_tests_pra_scenario '
          + 'foreign key (scenario_id, filiale_id) references scenarios_pra (id, filiale_id) '
          + 'on delete cascade',
      );
    }

    // Et le schéma est rendu intact : sans ce contrôle, les tests suivants
    // raisonneraient sur une base affaiblie sans le savoir.
    assert.deepEqual((await base.lignes(proprietaire, requete)).map((l) => l.fautive), []);
  });

  test('les cinq parents portent bien leur unicité (id, filiale_id)', async () => {
    // La clé composite n'est possible que si le parent offre le couple en unicité.
    // Perdre l'une de ces contraintes rendrait la clé étrangère incréable : la migration
    // échouerait, mais autant nommer explicitement ce dont elle dépend.
    const attendues = [
      'uq_clients_id_filiale',
      'uq_evaluations_id_filiale',
      'uq_exigences_id_filiale',
      'uq_incidents_id_filiale',
      'uq_risques_id_filiale',
      'uq_scenarios_pra_id_filiale',
    ];
    const presentes = await base.lignes(
      proprietaire,
      `select conname::text as nom from pg_constraint
        where contype = 'u' and conname like 'uq\\_%\\_id\\_filiale' order by 1`,
    );
    for (const nom of attendues) {
      assert.ok(
        presentes.some((l) => l.nom === nom),
        `Unicité ${nom} absente : la clé étrangère composite qui la vise ne tiendrait pas.`,
      );
    }
  });
});

/* =====================================================================
 *  §17.2 — Le chemin de recherche de chaque fonction est figé
 * =====================================================================
 *
 *  Constat M-1 de la porte S1. PostgreSQL consulte le schéma temporaire de la session
 *  AVANT le chemin de recherche, y compris quand celui-ci est explicitement fixé à
 *  « public » — ce que fait pourtant le pool. Un rôle disposant du privilège
 *  « temporary » masquait donc n'importe quelle table du schéma et détournait la
 *  fonction qui la lit : forge d'une entrée de journal au chaînage rompu, désarmement
 *  du déclencheur de cohérence des mesures, garde-fou de couverture rendu aveugle.
 *
 *  Ces tests sont écrits en DEUX temps, et les deux comptent :
 *    - le contrôle STRUCTUREL (proconfig) attrape une fonction future qui oublierait
 *      le réglage ;
 *    - les contrôles de COMPORTEMENT rejouent les trois attaques de la porte S1. Ce sont
 *      eux qui prouvent que le réglage ferme bien quelque chose, et pas seulement qu'il
 *      est écrit.
 */

describe('Chemin de recherche figé (CONVENTIONS §17.2)', () => {
  /**
   * Les trois attaques ci-dessous EXIGENT le privilège `temporary`. Sur cette machine, la
   * base d'essai ne l'accorde pas au rôle applicatif — et en production, `install.sh` le
   * retire aussi, par un `revoke all on database … from public`.
   *
   * Le test ne s'en accommode pas, il l'ACCORDE le temps du bloc, puis le rend. Deux
   * raisons, et la seconde est la vraie :
   *   1. un test qui se saute en silence quand la condition manque ne prouve rien, et
   *      finit par ne plus rien prouver du tout sans que personne ne s'en aperçoive ;
   *   2. le retrait de `temporary` est une mesure d'EXPLOITATION, hors des migrations.
   *      Ce que ce fichier doit établir, c'est que le schéma tient MÊME SI ce privilège
   *      est accordé — faute de quoi l'intégrité du journal d'audit reposerait sur une
   *      ligne de script de déploiement, sans filet en base.
   */
  let roleApplicatif;

  before(async () => {
    roleApplicatif = await base.valeur(applicatif, 'select current_user');
    await proprietaire.query(`grant temporary on database "${base.nom}" to "${roleApplicatif}"`);
    const accorde = await base.valeur(
      applicatif,
      "select has_database_privilege(current_user, current_database(), 'temp')",
    );
    assert.equal(accorde, true, 'Les attaques par masquage pg_temp exigent le privilège temporary.');
  });

  after(async () => {
    await proprietaire
      .query(`revoke temporary on database "${base.nom}" from "${roleApplicatif}"`)
      .catch(() => {
        /* Base déjà supprimée : sans conséquence. */
      });
  });

  test('les 18 fonctions du schéma figent leur search_path ET y nomment pg_temp', async () => {
    // « pg_temp » nommé EN DERNIER est la mesure elle-même : tant qu'il n'est pas nommé,
    // il est consulté EN PREMIER, avant même pg_catalog. « set search_path = pg_catalog,
    // public » — sans pg_temp — ne fermerait donc rien du tout.
    const fonctions = await base.lignes(
      proprietaire,
      `select p.proname::text as nom,
              coalesce(array_to_string(p.proconfig, ';'), '') as reglages
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' order by 1`,
    );
    assert.ok(fonctions.length >= 16, `Balayage suspect : ${fonctions.length} fonction(s).`);

    const fautives = fonctions
      .filter((f) => !/search_path=/.test(f.reglages) || !/pg_temp/.test(f.reglages))
      .map((f) => `${f.nom} (${f.reglages || 'aucun réglage'})`);
    assert.deepEqual(fautives, [], 'Chemin de recherche non figé, ou pg_temp non relégué.');
  });

  test('le garde-fou f_verifier_chemin_recherche() ne signale rien…', async () => {
    const anomalies = await base.lignes(
      proprietaire,
      'select objet, anomalie from f_verifier_chemin_recherche() order by 1',
    );
    assert.deepEqual(anomalies, []);
  });

  test('…ET IL MORD : une fonction sans réglage, puis sans pg_temp, est signalée', async () => {
    const anomalies = async () =>
      (
        await base.lignes(
          proprietaire,
          `select anomalie from f_verifier_chemin_recherche()
            where objet like 'f_essai_chemin%' order by 1`,
        )
      ).map((l) => l.anomalie);

    await proprietaire.query(
      "create function f_essai_chemin() returns int language sql immutable as $x$ select 1 $x$",
    );
    try {
      assert.deepEqual(await anomalies(), ['search_path_non_fige']);

      // Le piège exact de la porte S1 : un réglage figé, mais sans pg_temp — donc inutile.
      await proprietaire.query(
        'alter function f_essai_chemin() set search_path = pg_catalog, public',
      );
      assert.deepEqual(
        await anomalies(),
        ['pg_temp_non_relegue'],
        'Un search_path sans pg_temp explicite laisse le schéma temporaire en tête.',
      );

      await proprietaire.query(
        'alter function f_essai_chemin() set search_path = pg_catalog, public, pg_temp',
      );
      assert.deepEqual(await anomalies(), []);
    } finally {
      await proprietaire.query('drop function if exists f_essai_chemin()');
    }
  });

  test('ATTAQUE REJOUÉE : masquer mesure_catalogue ne désarme plus la cohérence', async () => {
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query('create temp table mesure_catalogue (id text, filiale_id text)');
        await c.query("insert into mesure_catalogue values ('MESURE-B', null)");
        // Sans le chemin figé, le déclencheur lisait CETTE table et acceptait : la
        // filiale A mettait alors en oeuvre la mesure LOCALE de la filiale B.
        await c.query(
          "insert into public.mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-VOL', $1, 'MESURE-B')",
          [A],
        );
      }),
    );
    assert.equal(erreur.code, '23514', 'Le déclencheur doit lire le VRAI catalogue.');
    assert.match(erreur.message, /locale à une autre filiale/);
  });

  test('ATTAQUE REJOUÉE : masquer journal_audit ne forge plus la chaîne', async () => {
    const entree = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query('create temp table journal_audit (numero bigint, empreinte text)');
      await c.query("insert into journal_audit values (999999, repeat('a', 64))");
      await c.query(
        "insert into public.journal_audit (filiale_id, action, resume) values ($1, 'creation', 'après masquage')",
        [A],
      );
      const resultat = await c.query(
        "select numero, empreinte_precedente from public.journal_audit where resume = 'après masquage'",
      );
      return resultat.rows[0];
    });
    // Sans le chemin figé, numero valait 1000000 et empreinte_precedente 'aaaa…' : le
    // journal portait alors À DEMEURE les deux anomalies que le §12 apprend à lire comme
    // « entrée supprimée » et « entrée insérée ». Le dommage était irréversible.
    assert.ok(
      Number(entree.numero) < 1000,
      `numero = ${entree.numero} : la numérotation vient de la table de l’attaquant.`,
    );
    assert.notEqual(entree.empreinte_precedente, 'a'.repeat(64));
  });

  test('ATTAQUE REJOUÉE : masquer pg_class n’aveugle plus le garde-fou de couverture', async () => {
    // Le plus retors des trois : un faux catalogue faisait rendre « aucune anomalie » au
    // garde-fou, quel que soit l'état réel du schéma. On lui donne donc une vraie
    // anomalie à trouver, et on vérifie qu'il la trouve MALGRÉ le masquage — sans quoi
    // « 0 anomalie » ne distinguerait pas un schéma sain d'un garde-fou aveugle.
    await proprietaire.query('create table essai_masquage_catalogue (id text primary key)');
    try {
      const vues = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query(
          'create temp table pg_class (oid oid, relname name, relrowsecurity boolean, '
            + 'relforcerowsecurity boolean, relkind "char", relnamespace oid)',
        );
        const resultat = await c.query(
          "select count(*)::int as n from f_verifier_couverture_rls() where objet = 'essai_masquage_catalogue'",
        );
        return resultat.rows[0].n;
      });
      assert.ok(vues > 0, 'Le garde-fou doit lire pg_catalog.pg_class, pas celui de l’attaquant.');
    } finally {
      await proprietaire.query('drop table essai_masquage_catalogue');
    }
  });
});

/* =====================================================================
 *  §17.1 — La PORTÉE d'une ligne mixte ne change pas, et le socle tient
 * ===================================================================== */

describe('Portée figée des tables mixtes et socle Groupe (constat M-3)', () => {
  /** Le drapeau d'administration est un réglage de session ordinaire : nul ne l'empêche. */
  const enAdministration = async (client, p, travail, options) =>
    base.avecPerimetre(
      client,
      p,
      async (c) => {
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        return travail(c);
      },
      options,
    );

  test('S’APPROPRIER une ligne du socle Groupe est refusé', async () => {
    // Le premier pas de l'attaque M-3 : la ligne du socle, visible des vingt filiales,
    // devenait une ligne LOCALE de la filiale A — donc invisible des dix-neuf autres.
    const erreur = await erreurAttendue(
      enAdministration(applicatif, rssiSite(A), async (c) => {
        await c.query("update mesure_catalogue set filiale_id = $1 where id = 'MESURE-G'", [A]);
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.message, /la portée d’une ligne ne change pas|la portée d'une ligne ne change pas/);
  });

  test('PROMOUVOIR une ligne locale en socle Groupe est refusé aussi', async () => {
    const erreur = await erreurAttendue(
      enAdministration(applicatif, rssiSite(A), async (c) => {
        await c.query("update mesure_catalogue set filiale_id = null where id = 'MESURE-A'");
      }),
    );
    assert.equal(erreur.code, '23514', 'Le sens inverse est tout aussi fautif : personne n’arbitre.');
  });

  test('les cinq tables mixtes portent toutes le déclencheur', async () => {
    // Contrôle structurel : une table mixte ajoutée demain sans son déclencheur
    // rouvrirait le chemin. Le balayage part de la définition d'une table mixte —
    // filiale_id présent et NULLABLE — et non d'une liste recopiée.
    const manquantes = await base.lignes(
      proprietaire,
      `select c.relname::text as nom
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
        where n.nspname = 'public' and c.relkind = 'r'
          and a.attnum > 0 and not a.attisdropped and not a.attnotnull
          -- Dérogations de la famille 4 (004_rls.sql §6) : ces trois tables ne sont pas
          -- des tables MÉTIER mixtes, leur filiale_id nullable a un autre sens.
          and c.relname not in ('groupes_ad', 'journal_audit')
          and not exists (select 1 from pg_trigger t
                           where t.tgrelid = c.oid and not t.tgisinternal
                             and t.tgname = 'trg_' || c.relname || '_portee_figee')
        order by 1`,
    );
    assert.deepEqual(manquantes.map((l) => l.nom), []);
  });

  test('LE DÉCLENCHEUR MORD : sans lui, l’appropriation passe', async () => {
    // Contrôle de morsure : on retire la propriété, on vérifie que le test tombe, on la
    // remet. Sans cela, « refusé » pourrait n'être qu'un effet de bord d'autre chose.
    await proprietaire.query('drop trigger trg_mesure_catalogue_portee_figee on mesure_catalogue');
    try {
      const affectees = await enAdministration(applicatif, rssiSite(A), async (c) => {
        const resultat = await c.query(
          "update mesure_catalogue set filiale_id = $1 where id = 'MESURE-G'",
          [A],
        );
        return resultat.rowCount;
      });
      assert.equal(affectees, 1, 'Sans le déclencheur, la politique RLS laisse passer : c’est M-3.');
    } finally {
      await proprietaire.query(
        'create trigger trg_mesure_catalogue_portee_figee before update on mesure_catalogue '
          + 'for each row execute function f_interdit_changement_portee()',
      );
    }
  });

  test('contrôle symétrique : modifier le CONTENU d’une ligne Groupe reste possible', async () => {
    // Ce qui est fermé, c'est le changement de PORTÉE, pas l'administration du socle.
    const affectees = await enAdministration(applicatif, rssiSite(A), async (c) => {
      const resultat = await c.query(
        "update mesure_catalogue set description = 'précisée' where id = 'MESURE-G'",
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('SUPPRIMER du socle une mesure mise en oeuvre AILLEURS est refusé', async () => {
    // Le second pas de l'attaque M-3, et le plus grave : la cascade détruisait les mises
    // en oeuvre des autres filiales — invisibles de l'auteur, dans des filiales qui ne
    // sont pas la sienne, sans aucune trace en base. Le « restrict » ferme ce chemin, et
    // il le ferme MÊME SUR CE QU'ON NE VOIT PAS : l'intégrité référentielle ignore la RLS.
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, perimetre('semeur', A, [A, B]), async (c) => {
        // Un socle Groupe mis en oeuvre par la SEULE filiale B.
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query("insert into mesure_catalogue (id, nom) values ('MESURE-G2', 'Journalisation')");
        await c.query("select set_config('grc.administration_groupe', '', true)");
        await c.query("select set_config('grc.filiale_id', $1, true)", [B]);
        await c.query(
          "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-B2', $1, 'MESURE-G2')",
          [B],
        );

        // Puis une session de la seule filiale A, qui ne voit rien de tout cela.
        await c.query("select set_config('grc.filiales', $1, true)", [A]);
        await c.query("select set_config('grc.filiale_id', $1, true)", [A]);
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        const invisible = await c.query(
          "select count(*)::int as n from mesure_mise_en_oeuvre where mesure_id = 'MESURE-G2'",
        );
        assert.equal(invisible.rows[0].n, 0, 'La mise en oeuvre de B est bien invisible de A.');

        await c.query("delete from mesure_catalogue where id = 'MESURE-G2'");
      }),
    );
    assert.equal(erreur.code, '23503', 'Le refus vient de l’intégrité référentielle, qui voit tout.');
    assert.match(erreur.message, /fk_mesure_mise_en_oeuvre_mesure/);
  });

  test('contrôle symétrique : une mesure du socle que personne n’implémente se supprime', async () => {
    const affectees = await enAdministration(applicatif, rssiSite(A), async (c) => {
      await c.query("insert into mesure_catalogue (id, nom) values ('MESURE-G3', 'Jamais mise en oeuvre')");
      const resultat = await c.query("delete from mesure_catalogue where id = 'MESURE-G3'");
      return resultat.rowCount;
    });
    assert.equal(affectees, 1, 'Le « restrict » ne doit pas rendre le socle immuable.');
  });
});

/* =====================================================================
 *  §17.4 — Les tables du substrat d'autorisation
 * =====================================================================
 *
 *  Constat M-2. Les tables qui PRODUISENT la décision d'autorisation étaient les moins
 *  protégées du schéma : politique `true` en lecture COMME en écriture, et `grc_app`
 *  gardant le CRUD complet dessus. Le contrôle applicatif décide des droits en les
 *  lisant, et le rôle qui exécute ce contrôle pouvait les réécrire — il n'y avait plus
 *  de défense en profondeur, seulement une couche.
 *
 *  Le §17.4 tranche en deux : les QUATRE tables de configuration sont fermées ici ; les
 *  TROIS tables de session sont REPORTÉES au lot L3, dont c'est la matière. Le second
 *  bloc de tests verrouille ce report — il tombera quand L3 le lèvera, et c'est le but.
 */

describe('Tables de configuration : écriture réservée au Groupe (CONVENTIONS §17.4)', () => {
  const configuration = [
    ['profils', "insert into profils (id, code, nom) values ('PROF-M2', 'ZZM2', 'Profil d’essai')"],
    ['profil_domaines', "insert into profil_domaines (profil_id, domaine, niveau) values ('PROF-M2', 'risques', 'lecture')"],
    ['utilisateurs', "insert into utilisateurs (id, identifiant, nom_affichage) values ('USR-M2', 'jdupont', 'Jean Dupont')"],
    // Forme « transversale » : ni filiale, ni profil, donc aucune clé étrangère ni
    // contrainte de cohérence en jeu — seule la politique RLS peut refuser cette ligne.
    ['groupes_ad', "insert into groupes_ad (id, nom, perimetre, accorde_export) values ('GAD-M2', 'CN=GRC-EXPORT', 'transversal', true)"],
  ];

  for (const [table, instruction] of configuration) {
    test(`${table} : écrire SANS l’administration Groupe est refusé`, async () => {
      const erreur = await refus(applicatif, rssiSite(A), instruction);
      assert.equal(
        erreur.code,
        '42501',
        `${table} produit la décision d’autorisation : elle n’a pas à être écrite au fil de l’eau.`,
      );
    });
  }

  test('contrôle symétrique : EN administration Groupe, les quatre écritures passent', async () => {
    // Sans ce contre-test, une table rendue simplement non inscriptible obtiendrait le
    // même sans-faute : ce qui est demandé, c'est de RÉSERVER l'écriture, pas de la
    // supprimer — le paramétrage doit rester possible.
    const posees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      let n = 0;
      for (const [, instruction] of configuration) n += (await c.query(instruction)).rowCount;
      return n;
    });
    assert.equal(posees, configuration.length);
  });

  test('la LECTURE reste ouverte, et elle doit l’être', async () => {
    // Ces tables sont lues pour RÉSOUDRE les droits, donc AVANT que le périmètre existe.
    // Les cloisonner serait circulaire, et aucune connexion ne serait possible.
    const predicats = await base.lignes(
      proprietaire,
      `select c.relname::text as nom, pg_get_expr(p.polqual, p.polrelid) as predicat
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where p.polcmd = 'r'
          and c.relname in ('profils', 'profil_domaines', 'utilisateurs', 'groupes_ad')
        order by 1`,
    );
    assert.deepEqual(predicats.map((l) => l.predicat), ['true', 'true', 'true', 'true']);
  });

  test('aucune politique de LECTURE ne s’adosse au drapeau d’administration', async () => {
    // Le point qui aurait tout cassé : si le drapeau élargissait la lecture, il suffirait
    // d'un chemin de code qui le pose par erreur. Le garde-fou du §8 le refuse ; on le
    // vérifie ici aussi, sur les 47 tables, après l'ajout des politiques du §17.4.
    const anomalies = await base.lignes(
      proprietaire,
      "select anomalie from f_verifier_couverture_rls() where anomalie = 'drapeau_administration_en_lecture'",
    );
    assert.deepEqual(anomalies, []);
  });

  test('REPORT ASSUMÉ : les trois tables de session restent écrivables sans condition', async () => {
    // Ce test ne célèbre pas une propriété, il VERROUILLE un report daté (CONVENTIONS
    // §17.4) : ces tables PRODUISENT le périmètre, elles sont écrites avant qu'il existe.
    // Le lot L3 posera un réglage « grc.authentification » pour sa seule transaction
    // d'ouverture de session, et les politiques s'y adosseront. Ce test tombera alors —
    // c'est exactement ce qu'on attend de lui.
    const predicats = await base.lignes(
      proprietaire,
      `select c.relname::text || '.' || p.polcmd::text as politique,
              coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                       pg_get_expr(p.polqual, p.polrelid)) as predicat
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname in ('sessions', 'session_filiales', 'session_domaines')
          and p.polcmd in ('a', 'w', 'd')
        order by 1`,
    );
    assert.equal(predicats.length, 9, 'Trois tables × ajout / modification / suppression.');
    assert.deepEqual(
      [...new Set(predicats.map((l) => l.predicat))],
      ['true'],
      'Report au lot L3 : voir CONVENTIONS.md §17.4 et 004_rls.sql §6.',
    );
  });
});

/* =====================================================================
 *  §17.3 — Le domaine id_metier
 * ===================================================================== */

describe('Identifiants métier : virgule et espaces de bord (CONVENTIONS §17.3)', () => {
  test('la VIRGULE est refusée : elle scinderait le périmètre de session', async () => {
    // grc.filiales transite en chaîne jointe par virgules. Un identifiant de filiale
    // valant « FIL-A,FIL-B » accorderait la lecture de DEUX filiales.
    const erreur = await refus(
      applicatif,
      rssiSite(A),
      `insert into filiales (id, code, raison_sociale) values ($1, 'ZZM2A', 'Filiale forgée')`,
      [`${A},${B}`],
    );
    assert.equal(erreur.code, '23514');
  });

  test('un identifiant à virgule ouvrirait bien deux filiales — la raison du refus', async () => {
    // Ce que le contrôle précédent empêche, démontré sur les fonctions de périmètre
    // elles-mêmes : sans lui, un seul identifiant vaudrait deux entrées de périmètre.
    const resolu = await base.valeur(
      applicatif,
      "select array_length(string_to_array($1, ','), 1)",
      [`${A},${B}`],
    );
    assert.equal(Number(resolu), 2);
  });

  test('les espaces EN TÊTE ou EN FIN sont refusés', async () => {
    for (const identifiant of [' FIL-ESPACE', 'FIL-ESPACE ', '\tFIL-TAB', 'FIL-SAUT\n']) {
      const erreur = await refus(
        applicatif,
        rssiSite(A),
        `insert into filiales (id, code, raison_sociale) values ($1, 'ZZM2B', 'Filiale forgée')`,
        [identifiant],
      );
      assert.equal(
        erreur.code,
        '23514',
        `« ${JSON.stringify(identifiant)} » : invisible à l’oeil, il ferait deux clés d’une seule.`,
      );
    }
  });

  test('le domaine reste VOLONTAIREMENT permissif : la reprise en dépend', async () => {
    // On ferme deux caractères, on ne durcit pas le format. Les exports anciens portent
    // des identifiants sans suffixe aléatoire, voire sans préfixe (processus BIA).
    const acceptes = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      let n = 0;
      for (const identifiant of ['1720000000000', 'SANSPREFIXE', 'FIL-1720000000000', 'a b']) {
        n += (await c.query(
          `insert into filiales (id, code, raison_sociale) values ($1, $2, 'Reprise ancienne')`,
          [identifiant, `ZZ${n}${n}${n}${n}`],
        )).rowCount;
      }
      return n;
    });
    assert.equal(acceptes, 4, 'Un espace INTERNE, lui, reste admis : ce n’est pas un bord.');
  });
});

/* =====================================================================
 *  §17.5 — Ce que le garde-fou de couverture attrape, et ce qu'il n'attrape pas
 * ===================================================================== */

describe('Portée du garde-fou de couverture (CONVENTIONS §17.5)', () => {
  test('IL MORD MAINTENANT sur un prédicat non trivial mais non cloisonnant', async () => {
    // La détection ne compare plus au littéral « true ». À la porte S1, un prédicat de
    // lecture remplacé par « filiale_id is not null » passait le garde-fou sans anomalie,
    // alors qu'il ouvre la table à toutes les filiales.
    await proprietaire.query('drop policy pol_actifs_lecture on actifs');
    await proprietaire.query(
      'create policy pol_actifs_lecture on actifs for select using (filiale_id is not null)',
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_couverture_rls() where objet = 'actifs'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['lecture_non_cloisonnee']);
    } finally {
      await proprietaire.query('drop policy pol_actifs_lecture on actifs');
      await proprietaire.query(
        'create policy pol_actifs_lecture on actifs for select '
          + 'using (filiale_id = any (f_filiales_lecture()))',
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select objet from f_verifier_couverture_rls()'), []);
  });

  test('IL MORD AUSSI en écriture : un prédicat qui ne consulte pas la filiale active', async () => {
    await proprietaire.query('drop policy pol_actifs_ajout on actifs');
    await proprietaire.query(
      'create policy pol_actifs_ajout on actifs for insert '
        + 'with check (filiale_id = any (f_filiales_lecture()))',
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_couverture_rls() where objet = 'actifs'",
      );
      assert.deepEqual(
        anomalies.map((l) => l.anomalie),
        ['ecriture_non_cloisonnee'],
        'Écrire sur tout le périmètre de LECTURE est précisément l’écart du §11.',
      );
    } finally {
      await proprietaire.query('drop policy pol_actifs_ajout on actifs');
      await proprietaire.query(
        'create policy pol_actifs_ajout on actifs for insert '
          + 'with check (filiale_id = f_filiale_ecriture())',
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select objet from f_verifier_couverture_rls()'), []);
  });

  test('CE QU’IL N’ATTRAPE PAS, et qu’il ne prétend pas attraper', async () => {
    // Le garde-fou lit le TEXTE des prédicats, pas leur sens. Une politique qui NOMME la
    // bonne fonction en s'en servant mal lui échappe — et c'est écrit dans son
    // commentaire. Ce test fige la limite plutôt que de la laisser se découvrir en audit :
    // ce qui mord vraiment là, ce sont les tests de comportement de ce fichier.
    await proprietaire.query('drop policy pol_actifs_lecture on actifs');
    await proprietaire.query(
      'create policy pol_actifs_lecture on actifs for select '
        + 'using (filiale_id is not null and f_filiales_lecture() is not null)',
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_couverture_rls() where objet = 'actifs'",
      );
      assert.deepEqual(
        anomalies.map((l) => l.anomalie),
        [],
        'Limite CONNUE et documentée (CONVENTIONS §17.5) : le garde-fou est aveugle ici.',
      );

      // …mais le comportement, lui, est bien vu : la table s’ouvre, et un test de
      // cloisonnement le dit aussitôt. C’est le filet qui compte.
      const fuite = await compter(
        applicatif,
        rssiSite(A),
        'select count(*)::int as n from actifs where filiale_id <> $1',
        [A],
      );
      assert.ok(fuite > 0, 'La politique fautive ouvre bien la table — le comportement le montre.');
    } finally {
      await proprietaire.query('drop policy pol_actifs_lecture on actifs');
      await proprietaire.query(
        'create policy pol_actifs_lecture on actifs for select '
          + 'using (filiale_id = any (f_filiales_lecture()))',
      );
    }
    const fuiteFermee = await compter(
      applicatif,
      rssiSite(A),
      'select count(*)::int as n from actifs where filiale_id <> $1',
      [A],
    );
    assert.equal(fuiteFermee, 0, 'Et le schéma est rendu intact.');
  });
});

/* =====================================================================
 *  §11 — Le journal s'écrit sur la filiale ACTIVE (constat m-4)
 * ===================================================================== */

describe('Journal d’audit : écriture sur la filiale active (CONVENTIONS §11)', () => {
  test('un périmètre Groupe n’attribue pas une trace à une filiale seulement LUE', async () => {
    // La politique suivait le périmètre de LECTURE — seule politique d'écriture du schéma
    // dans ce cas. Un RSSI Groupe lisant vingt filiales pouvait donc attribuer une entrée
    // à n'importe laquelle, et non à celle qu'il avait sélectionnée : c'est la valeur
    // probante du registre de chaque filiale qui s'y jouait.
    const erreur = await refus(
      applicatif,
      rssiGroupe(A),
      `insert into journal_audit (action, filiale_id, resume) values ('creation', $1, 'trace ailleurs')`,
      [B],
    );
    assert.equal(erreur.code, '42501');
  });

  test('contrôle symétrique : la trace de la filiale ACTIVE passe', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiGroupe(A), async (c) => {
      const resultat = await c.query(
        `insert into journal_audit (action, filiale_id, resume) values ('creation', $1, 'trace ici')`,
        [A],
      );
      return resultat.rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('contrôle symétrique : l’entrée transversale passe même sans filiale active', async () => {
    // Le piège de la correction : f_filiale_ecriture() LÈVE GRC04 sans filiale active.
    // Un « or » aurait pu l'évaluer en premier et faire échouer un échec de connexion —
    // c'est-à-dire l'événement qu'on tient le plus à tracer. D'où le « case ».
    const affectees = await base.avecPerimetre(
      applicatif,
      perimetre('anonyme', null, []),
      async (c) => {
        const resultat = await c.query(
          "insert into journal_audit (action, resume) values ('connexion_echouee', 'compte inconnu')",
        );
        return resultat.rowCount;
      },
    );
    assert.equal(affectees, 1, 'Un échec de connexion précède la résolution du périmètre.');
  });

  test('la politique d’ajout consulte bien la filiale ACTIVE, et non le périmètre', async () => {
    const predicat = await base.valeur(
      proprietaire,
      `select pg_get_expr(polwithcheck, polrelid) from pg_policy
        where polrelid = 'journal_audit'::regclass and polname = 'pol_journal_audit_ajout'`,
    );
    assert.match(predicat, /f_filiale_ecriture/);
    assert.doesNotMatch(predicat, /f_filiales_autorisees|f_filiales_lecture/);
  });
});

/* =====================================================================
 *  Colonnes attendues par la reprise d'un export grc-backup
 * ===================================================================== */

describe('Schéma et reprise', () => {
  test('processus porte « description » — sinon la reprise perd la donnée en silence', async () => {
    // src/reprise/index.ts attend ce champ dans les colonnes de « processus » : c'est
    // « Impacts (Interruption) » du module BIA du frontend. La table ne l'avait pas, et
    // rien ne l'aurait signalé — la reprise aurait simplement laissé la donnée de côté.
    const colonne = await base.valeur(
      proprietaire,
      `select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'processus' and column_name = 'description'`,
    );
    assert.equal(colonne, 'text');
  });

  test('et elle se lit comme les autres, sous le cloisonnement', async () => {
    const relu = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query(
        "update processus set description = 'Arrêt des expéditions, pénalités contractuelles' where id = 'BIA-A'",
      );
      const resultat = await c.query("select description from processus where id = 'BIA-A'");
      return resultat.rows[0].description;
    });
    assert.equal(relu, 'Arrêt des expéditions, pénalités contractuelles');
  });
});
