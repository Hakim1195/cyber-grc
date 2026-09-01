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
      // La création d'une filiale est une opération d'ADMINISTRATION GROUPE depuis le
      // second passage de la porte S1 (constat N-2, CONVENTIONS §17.4) : « filiales » a
      // rejoint les tables de configuration. Le semis devait donc changer — et le fait
      // qu'il ait fallu le changer est exactement ce que l'auditeur a relevé : le banc
      // d'essai reposait jusque-là sur la propriété défectueuse.
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'ZZESSA', 'Essai Toulouse', 'FR'),
             ($2, 'ZZESSB', 'Essai Allemagne', 'DE')`,
        [A, B],
      );

      // Socle de niveau Groupe : son écriture EXIGE le même réglage, déjà posé.
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

      // ── CE QUI A CHANGÉ ICI, ET POURQUOI CE N'EST PAS UN ASSOUPLISSEMENT ──────────
      // Avant le constat Q-5, une table SANS filiale_id n'était soumise au contrôle de
      // cloisonnement que si elle figurait dans une liste de six noms écrite à la main.
      // Une table neuve — comme celle-ci, comme import_erreurs qui manquait à la liste —
      // pouvait donc s'ouvrir « using (true) » sans qu'une seule anomalie soit rendue.
      // Le sens de lecture est inversé (CONVENTIONS.md §19.5) : toute table est soumise,
      // seules les exemptions sont nommées. Les deux assertions qui suivent en attendent
      // donc PLUS qu'avant, pas moins — c'est le garde-fou qui mord davantage.
      await proprietaire.query(
        'create policy pol_essai_lecture on essai_table_sans_politique for select using (true)',
      );
      assert.deepEqual(await anomalies(), ['lecture_non_cloisonnee', 'politique_ecriture_absente']);

      await proprietaire.query(
        'create policy pol_essai_ajout on essai_table_sans_politique for insert with check (true)',
      );
      assert.deepEqual(
        await anomalies(),
        ['ecriture_non_cloisonnee', 'lecture_non_cloisonnee'],
        'Une table sans filiale_id NON DÉCLARÉE de niveau Groupe doit être réclamée.',
      );

      // Et le contrôle symétrique, sans lequel le précédent ne prouverait rien : une
      // table sans filiale_id dont les politiques CONSULTENT le périmètre — la forme
      // exacte des six liaisons — ne déclenche rien.
      await proprietaire.query('drop policy pol_essai_lecture on essai_table_sans_politique');
      await proprietaire.query('drop policy pol_essai_ajout on essai_table_sans_politique');
      await proprietaire.query(
        `create policy pol_essai_lecture on essai_table_sans_politique for select
             using (exists (select 1 from risques r
                             where r.id = essai_table_sans_politique.id
                               and r.filiale_id = any (f_filiales_autorisees())))`,
      );
      await proprietaire.query(
        `create policy pol_essai_ajout on essai_table_sans_politique for insert
             with check (exists (select 1 from risques r
                                  where r.id = essai_table_sans_politique.id
                                    and r.filiale_id = f_filiale_ecriture()))`,
      );
      assert.deepEqual(
        await anomalies(),
        [],
        'Une liaison cloisonnée par sa politique ne doit rien déclencher.',
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

describe('Privilège « temporary » retiré au rôle applicatif (CONVENTIONS §17.2)', () => {
  // Point (c) du constat M-1, et la raison pour laquelle il forme un bloc À PART, joué
  // AVANT celui du chemin de recherche : ce dernier s'accorde le privilège pour rejouer
  // les attaques, et masquerait donc l'état réel s'il était mêlé à ce constat.
  //
  // Le chemin de recherche figé ferme le détournement de FONCTION ; le retrait de
  // « temporary » empêche l'attaque d'exister. Les deux sont voulus, et le second est le
  // plus fragile : un « grant » posé un jour par commodité — pour dépanner un script, pour
  // faire tourner un outil — rouvrirait la porte en silence. Ce test est le seul endroit
  // du dépôt qui s'en apercevrait.
  test('grc_app n’a PAS « temporary » — l’ACL de production, jusque sur le banc d’essai', async () => {
    const accorde = await base.valeur(
      applicatif,
      "select has_database_privilege(current_user, current_database(), 'temporary')",
    );
    assert.equal(accorde, false, 'Le rôle applicatif ne doit pas pouvoir créer de table temporaire.');
  });

  test('et le refus est EFFECTIF, pas seulement déclaré', async () => {
    const jetable = await base.nouvelleConnexion('app');
    connexionsJetables.push(jetable);
    const erreur = await erreurAttendue(jetable.query('create temp table essai_temp (x int)'));
    assert.equal(erreur.code, '42501');
  });
});

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

describe('Portée figée et socle Groupe non supprimable (CONVENTIONS §17.6)', () => {
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
          -- « nullable » n'est pas « mixte » (CONVENTIONS.md §17.7) : ces tables portent un
          -- filiale_id nullable pour une raison chronologique ou technique, pas parce que
          -- leurs lignes auraient une PORTÉE. (sessions n'apparaît pas dans cette exclusion :
          -- sa colonne s'appelle filiale_active_id, le balayage ne la voit donc pas.)
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
      // Et RÉARMÉ en « always », comme la migration le pose (004 §7 c) : un « create
      // trigger » nu le rend en mode « origin ». Le contrôle de morsure doit restituer le
      // schéma à l'identique, pas seulement à peu près — c'est le test N-11 qui a vu
      // l'écart, et c'est exactement ce qu'on lui demande.
      await proprietaire.query(
        'alter table mesure_catalogue enable always trigger trg_mesure_catalogue_portee_figee',
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

  /* ------------------------------------------------------------------
   *  §17.6, second volet : toute référence à mesure_catalogue est en
   *  « restrict ». Amendement du §8, dont les règles (« délie les
   *  évaluations », « conserve les actions ») avaient été écrites pour un
   *  produit MONO-FILIALE, où le rayon d'une suppression ne quittait pas le
   *  poste de l'utilisateur. En contexte de groupe, elles faisaient d'une
   *  suppression dans le socle commun une modification des données de vingt
   *  filiales : « version » incrémentée, « modifie_par » portant le nom de
   *  quelqu'un qui n'y a jamais travaillé — la pathologie exacte de B-1.
   * ------------------------------------------------------------------ */

  /**
   * Sème un contrôle de portée Groupe, puis le fait référencer par la SEULE
   * filiale B, et rend la main à une session de la seule filiale A — munie du
   * drapeau d'administration, et donc en droit de supprimer le socle.
   *
   * @param {import('pg').Client} c
   * @param {string} mesure identifiant du contrôle à semer
   * @param {string} lien instruction posant la référence, côté filiale B
   */
  async function socleReferenceParB(c, mesure, lien) {
    await c.query("select set_config('grc.administration_groupe', 'oui', true)");
    await c.query('insert into mesure_catalogue (id, nom) values ($1, $2)', [mesure, 'Contrôle du socle']);
    await c.query("select set_config('grc.administration_groupe', '', true)");
    await c.query("select set_config('grc.filiale_id', $1, true)", [B]);
    await c.query(lien, [B, mesure]);

    // Session de la seule filiale A : elle ne voit rien de ce qui précède.
    await c.query("select set_config('grc.filiales', $1, true)", [A]);
    await c.query("select set_config('grc.filiale_id', $1, true)", [A]);
    await c.query("select set_config('grc.administration_groupe', 'oui', true)");
  }

  const referents = [
    ['mesure_mise_en_oeuvre', 'fk_mesure_mise_en_oeuvre_mesure',
      "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-REF', $1, $2)"],
    ['evaluation_mesures', 'fk_evaluation_mesures_mesure',
      "insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-B', $2, $1)"],
    ['traitement_mesures', 'fk_traitement_mesures_mesure',
      "insert into traitement_mesures (traitement_id, mesure_id, filiale_id) values ('TRT-B', $2, $1)"],
    ['actions', 'fk_actions_mesure',
      "insert into actions (id, filiale_id, titre, mesure_id) values ('ACT-REF', $1, 'essai', $2)"],
  ];

  for (const [table, contrainte, lien] of referents) {
    test(`supprimer du socle un contrôle référencé par ${table} d’une AUTRE filiale est refusé`, async () => {
      // Le point décisif est l'invisibilité : le refus vient de l'intégrité
      // référentielle, qui IGNORE la Row Level Security. Aucun déclencheur
      // « security invoker » ne saurait le rendre — il ne verrait que son propre
      // périmètre, conclurait « personne ne s'en sert » et laisserait passer.
      const mesure = `MESURE-G-${table.toUpperCase()}`;
      const erreur = await erreurAttendue(
        base.avecPerimetre(applicatif, perimetre('semeur', A, [A, B]), async (c) => {
          await socleReferenceParB(c, mesure, lien);

          const invisible = await c.query(
            `select count(*)::int as n from ${table} where mesure_id = $1`,
            [mesure],
          );
          assert.equal(invisible.rows[0].n, 0, `La ligne de B est bien invisible de A (${table}).`);

          await c.query('delete from mesure_catalogue where id = $1', [mesure]);
        }),
      );
      assert.equal(erreur.code, '23503', 'Le refus vient de l’intégrité référentielle, qui voit tout.');
      assert.ok(
        erreur.message.includes(contrainte),
        `Attendu un refus de ${contrainte}, obtenu : ${erreur.message}`,
      );
    });
  }

  test('LE BALAYAGE : les quatre références au catalogue sont en « restrict »', async () => {
    // Les tests ci-dessus prouvent l'état d'aujourd'hui ; celui-ci protège de demain. Une
    // cinquième table qui référencerait mesure_catalogue en cascade — ou un retour au
    // « set null » du §8 — le fera tomber sans que personne n'ait à y penser.
    const requete = `
      select con.conname::text as nom,
             case con.confdeltype when 'a' then 'no action' when 'r' then 'restrict'
                                  when 'c' then 'cascade'   when 'n' then 'set null'
                                  when 'd' then 'set default' end as suppression
        from pg_constraint con
       where con.contype = 'f' and con.confrelid = 'mesure_catalogue'::regclass
       order by 1`;

    const references = await base.lignes(proprietaire, requete);
    assert.deepEqual(references, [
      { nom: 'fk_actions_mesure', suppression: 'restrict' },
      { nom: 'fk_evaluation_mesures_mesure', suppression: 'restrict' },
      { nom: 'fk_mesure_mise_en_oeuvre_mesure', suppression: 'restrict' },
      { nom: 'fk_traitement_mesures_mesure', suppression: 'restrict' },
    ]);

    // Contrôle de morsure intégré : on recrée le défaut d'origine du §8.
    await proprietaire.query('alter table actions drop constraint fk_actions_mesure');
    try {
      await proprietaire.query(
        'alter table actions add constraint fk_actions_mesure foreign key (mesure_id) '
          + 'references mesure_catalogue(id) on delete set null',
      );
      const apres = await base.lignes(proprietaire, requete);
      assert.equal(
        apres.find((l) => l.nom === 'fk_actions_mesure').suppression,
        'set null',
        'Le balayage doit voir une référence revenue au « set null ».',
      );
    } finally {
      await proprietaire.query('alter table actions drop constraint fk_actions_mesure');
      await proprietaire.query(
        'alter table actions add constraint fk_actions_mesure foreign key (mesure_id) '
          + 'references mesure_catalogue(id) on delete restrict',
      );
    }
    assert.deepEqual((await base.lignes(proprietaire, requete)).map((l) => l.suppression),
      ['restrict', 'restrict', 'restrict', 'restrict']);
  });

  test('CAS 1 du §17.6 : une mesure LOCALE se supprime après déliage, même transaction', async () => {
    // Ce que l'utilisateur voit ne change pas : la couche applicative délie puis supprime,
    // en une transaction. « restrict » est vérifié AU MOMENT de la suppression, pas à la
    // fin de la transaction : des liens retirés par une instruction antérieure ne s'y
    // opposent donc pas. C'est ce que ce test établit, et c'est la condition pour que
    // l'amendement du §8 ne change rien au comportement fonctionnel.
    const etapes = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query(
        "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-LOC', $1, 'MESURE-A')",
        [A],
      );
      await c.query(
        "insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-A', $1)",
        [A],
      );
      await c.query(
        "insert into traitement_mesures (traitement_id, mesure_id, filiale_id) values ('TRT-A', 'MESURE-A', $1)",
        [A],
      );
      await c.query(
        "insert into actions (id, filiale_id, titre, mesure_id) values ('ACT-LOC', $1, 'Chiffrer', 'MESURE-A')",
        [A],
      );

      // a) Sans déliage : refusé, et c'est la protection. Le point de reprise est
      //    indispensable — une erreur abandonne la transaction entière, et c'est bien
      //    ainsi que la couche applicative devra s'y prendre si elle tente la suppression
      //    avant le déliage.
      await c.query('savepoint avant_deliage');
      const avant = await erreurAttendue(c.query("delete from mesure_catalogue where id = 'MESURE-A'"));
      await c.query('rollback to savepoint avant_deliage');

      // b) Déliage puis suppression, dans la même transaction.
      await c.query("delete from mesure_mise_en_oeuvre where mesure_id = 'MESURE-A'");
      await c.query("delete from evaluation_mesures     where mesure_id = 'MESURE-A'");
      await c.query("delete from traitement_mesures     where mesure_id = 'MESURE-A'");
      await c.query("update actions set mesure_id = null where mesure_id = 'MESURE-A'");
      const supprimees = (await c.query("delete from mesure_catalogue where id = 'MESURE-A'")).rowCount;

      // c) L'action, elle, reste au plan d'actions — la promesse du §8 est tenue.
      const action = (await c.query("select count(*)::int as n from actions where id = 'ACT-LOC'")).rows[0].n;
      return { code: avant.code, supprimees, action };
    });

    assert.equal(etapes.code, '23503', 'Sans déliage, la suppression doit être refusée.');
    assert.equal(etapes.supprimees, 1, 'Après déliage, la même suppression doit passer.');
    assert.equal(etapes.action, 1, 'L’action déliée reste au plan d’actions (CONVENTIONS §8).');
  });

  test('CAS 1 bis : le rayon d’une mesure LOCALE n’a de toute façon jamais quitté sa filiale', async () => {
    // Corollaire, et il vaut d'être établi : f_coherence_mesure_catalogue() (004 §2)
    // interdit à toute autre filiale de citer une mesure locale. La suppression d'une
    // mesure locale ne peut donc, par construction, rien atteindre au-delà de sa filiale.
    const erreur = await refus(
      applicatif,
      rssiSite(B),
      "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-VOL', $1, 'MESURE-A')",
      [B],
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.message, /locale à une autre filiale/);
  });

  test('ANCIEN CAS M-3, conservé : la mise en oeuvre de B survit à la tentative de A', async () => {
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

  test('CAS 2 du §17.6 : une mesure du socle que PERSONNE n’utilise se supprime', async () => {
    // Sans ce contre-test, un schéma qui refuserait TOUTE suppression du catalogue
    // obtiendrait le même sans-faute. Ce qui est demandé, c'est de protéger un contrôle
    // déjà évalué, pas de rendre le socle immuable.
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
 *  Le §17.4 tranche en deux : les tables de configuration sont fermées ici ; les TROIS
 *  tables de session sont REPORTÉES au lot L3, dont c'est la matière. Le second bloc de
 *  tests verrouille ce report — il tombera quand L3 le lèvera, et c'est le but.
 *
 *  Elles étaient quatre au premier passage de S1, cinq au second (constat N-2, `filiales`),
 *  SEPT depuis le premier passage de la porte S2 : `mappings` et `mapping_exigences` ont
 *  rejoint la liste (constat M-4), et l'arbitrage inverse écrit à la cinquième passe de S1
 *  est renversé — voir la décision, réécrite plus bas.
 */

describe('Tables de configuration : écriture réservée au Groupe (CONVENTIONS §17.4)', () => {
  const configuration = [
    ['profils', "insert into profils (id, code, nom) values ('PROF-M2', 'ZZM2', 'Profil d’essai')"],
    ['profil_domaines', "insert into profil_domaines (profil_id, domaine, niveau) values ('PROF-M2', 'risques', 'lecture')"],
    ['utilisateurs', "insert into utilisateurs (id, identifiant, nom_affichage) values ('USR-M2', 'jdupont', 'Jean Dupont')"],
    // Forme « transversale » : ni filiale, ni profil, donc aucune clé étrangère ni
    // contrainte de cohérence en jeu — seule la politique RLS peut refuser cette ligne.
    ['groupes_ad', "insert into groupes_ad (id, nom, perimetre, accorde_export) values ('GAD-M2', 'CN=GRC-EXPORT', 'transversal', true)"],
    // Les deux tables de correspondances, depuis le constat M-4 de la porte S2. Une
    // session de filiale ordinaire créait, réécrivait et SUPPRIMAIT le catalogue partagé
    // des vingt filiales.
    ['mappings', "insert into mappings (id, theme) values ('MAP-M4', 'Chiffrement')"],
    ['mapping_exigences', "insert into mapping_exigences (mapping_id, ref_id, code) values ('MAP-M4', 'anssi', 'M12')"],
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

  test('contrôle symétrique : EN administration Groupe, toutes les écritures passent', async () => {
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
          and c.relname in ('profils', 'profil_domaines', 'utilisateurs', 'groupes_ad',
                            'mappings', 'mapping_exigences')
        order by 1`,
    );
    assert.deepEqual(predicats.map((l) => l.predicat), Array(6).fill('true'));
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
      // Créer une filiale est une opération d'administration Groupe (§17.4) : le domaine
      // est ce qu'on éprouve ici, pas la politique d'écriture.
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
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

/* =====================================================================
 *  §17.9 — La filiale d'écriture appartient au périmètre de lecture
 * =====================================================================
 *
 *  Constat BLOQUANT N-1 du second passage de la porte S1. « grc.filiale_id » et
 *  « grc.filiales » étaient deux réglages indépendants : une session déclarant un
 *  périmètre de lecture FIL-A et une filiale active FIL-B écrivait chez B — une filiale
 *  qu'elle ne lisait même pas. Le contrôle existait, une seule fois, dans le TypeScript
 *  (`src/db/pool.ts`, validerPerimetre) ; la base, qui est le filet SOUS le code et non sa
 *  doublure (PLAN_SERVEUR §1.9), laissait passer.
 *
 *  Le cas ouvert n'était pas « filiale lue mais non active » — celui-là était testé — mais
 *  « filiale NI lue NI active ». Les deux tests cohabitent ci-dessous, et ils ne rendent
 *  pas le même code : c'est la preuve que ce sont bien deux mécanismes distincts.
 */

describe('Filiale d’écriture et périmètre de lecture (CONVENTIONS §17.9)', () => {
  /** Périmètre incohérent : on lit A, on prétend écrire dans B. */
  const horsPerimetre = () => ({ utilisateur: 'alice', filialeId: B, filiales: [A] });

  test('LE CAS OUVERT : écrire dans une filiale NI lue NI active est refusé', async () => {
    const erreur = await refus(
      applicatif,
      horsPerimetre(),
      `insert into risques (id, filiale_id, nom) values ('RISK-HORS', $1, 'écrit hors périmètre')`,
      [B],
    );
    assert.equal(erreur.code, 'GRC04', 'La base doit recouper les deux réglages, pas le seul code.');
    assert.match(erreur.message, /hors du périmètre lisible/);
  });

  test('et le JOURNAL D’AUDIT non plus : plus de fausse preuve scellée chez le voisin', async () => {
    // C'est le cas qui a fait du constat un bloquant. L'entrée forgée était numérotée,
    // horodatée par le serveur, chaînée et scellée par empreinte : pour l'auditeur ISO
    // 27001 qui vérifie la chaîne, elle était indiscernable d'une entrée authentique. Le
    // mécanisme d'inaltérabilité — qui est excellent — garantissait l'intégrité d'une
    // fausse preuve.
    const erreur = await refus(
      applicatif,
      horsPerimetre(),
      `insert into journal_audit (filiale_id, utilisateur_libelle, action, resume)
           values ($1, 'bruno', 'suppression', 'Suppression du risque majeur par bruno')`,
      [B],
    );
    assert.equal(erreur.code, 'GRC04');
  });

  test('même la filiale LUE est refusée si elle n’est pas la filiale ACTIVE', async () => {
    // Le contrôle porte sur la filiale active, pas sur ce que la session sait lire :
    // déclarer FIL-B active en ne lisant que FIL-A ferme aussi l'écriture chez A.
    const erreur = await refus(
      applicatif,
      horsPerimetre(),
      `insert into risques (id, filiale_id, nom) values ('RISK-A-BIS', $1, 'chez soi')`,
      [A],
    );
    assert.equal(erreur.code, 'GRC04', 'La fonction lève avant même que la politique décide.');
  });

  test('DEUX MÉCANISMES DISTINCTS : « lue mais non active » rend 42501, pas GRC04', async () => {
    // Le cas déjà couvert avant ce correctif (C49 de la démonstration). Il passe par la
    // POLITIQUE — la filiale active est légitime, mais ce n'est pas celle de la ligne —
    // là où le cas neuf passe par la FONCTION. Deux codes, deux causes : les confondre
    // reviendrait à croire le second couvert par le premier, ce qui est exactement
    // l'erreur qui a laissé passer le constat.
    const erreur = await refus(
      applicatif,
      rssiGroupe(A),
      `insert into risques (id, filiale_id, nom) values ('RISK-X', $1, 'chez le voisin')`,
      [B],
    );
    assert.equal(erreur.code, '42501');
  });

  test('contrôle symétrique : la filiale active DANS le périmètre écrit normalement', async () => {
    // Sans ce contre-test, une fonction qui refuserait TOUT obtiendrait un sans-faute.
    const affectees = await base.avecPerimetre(
      applicatif,
      perimetre('alice', B, [A, B]),
      async (c) => (await c.query(
        `insert into risques (id, filiale_id, nom) values ('RISK-OK-B', $1, 'légitime')`,
        [B],
      )).rowCount,
    );
    assert.equal(affectees, 1, 'Un périmètre Groupe doit pouvoir écrire dans chacune de ses filiales.');
  });

  test('contrôle symétrique : la bascule de filiale active en cours de transaction reste possible', async () => {
    // C'est le geste qu'exige le retrait Groupe d'un contrôle du socle (§17.6) : délier
    // chez chaque filiale, puis supprimer. Il doit continuer de fonctionner — tant que
    // chaque filiale visitée appartient au périmètre.
    const posees = await base.avecPerimetre(applicatif, perimetre('alice', A, [A, B]), async (c) => {
      let n = 0;
      for (const filiale of [A, B, A]) {
        await c.query("select set_config('grc.filiale_id', $1, true)", [filiale]);
        n += (await c.query(
          `insert into risques (id, filiale_id, nom) values ($1, $2, 'bascule')`,
          [`RISK-BASCULE-${n}`, filiale],
        )).rowCount;
      }
      return n;
    });
    assert.equal(posees, 3);
  });

  test('un périmètre de lecture VIDE ferme aussi l’écriture', async () => {
    // Le périmètre système (PERIMETRE_SYSTEME de src/db/pool.ts) n'a pas de filiale
    // active et échoue sur la première condition. Mais un périmètre vide AVEC une filiale
    // active est un état incohérent, que la seconde condition doit fermer : sans périmètre
    // de lecture déclaré, il n'y a de filiale d'écriture légitime nulle part.
    const erreur = await refus(
      applicatif,
      { utilisateur: 'alice', filialeId: A, filiales: [] },
      `insert into risques (id, filiale_id, nom) values ('RISK-VIDE', $1, 'essai')`,
      [A],
    );
    assert.equal(erreur.code, 'GRC04');
    assert.match(erreur.message, /hors du périmètre lisible/);
  });

  test('LE BALAYAGE : toute politique d’écriture d’une table cloisonnée passe par f_filiale_ecriture', async () => {
    // Le correctif tient dans une fonction ; ce qui le rend général, c'est que toutes les
    // politiques d'écriture l'appellent. Une politique future qui filtrerait « à la main »
    // sur filiale_id — sans passer par elle — rouvrirait le chemin pour sa table. Ce
    // balayage part du catalogue et le verrait.
    const fautives = await base.lignes(
      proprietaire,
      `select c.relname::text || '.' || p.polname as politique
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
        where n.nspname = 'public' and p.polpermissive
          and a.attnotnull and a.attnum > 0 and not a.attisdropped
          and p.polcmd in ('a', 'w', 'd', '*')
          -- Dérogations de la famille 4, arbitrées et documentées (004_rls.sql §6) :
          -- session_filiales produit le périmètre, elle ne peut pas s'y adosser.
          and c.relname <> 'session_filiales'
          and coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                       pg_get_expr(p.polqual, p.polrelid), '') !~ 'f_filiale_ecriture'
        order by 1`,
    );
    assert.deepEqual(fautives.map((l) => l.politique), []);
  });
});

/* =====================================================================
 *  §17.4 — `filiales` est une table de configuration
 * =====================================================================
 *
 *  Constat MAJEUR N-2 du second passage. `filiales` figurait parmi les tables ouvertes,
 *  avec un motif — « l'authentification la lit avant tout périmètre » — qui ne justifiait
 *  que la LECTURE. L'écriture était ouverte sans condition, sur les quatre verbes, à
 *  n'importe quelle filiale : renommer, archiver, créer, supprimer les autres.
 *
 *  C'est pourtant la table qui DÉFINIT la frontière du cloisonnement, et elle échappait
 *  par construction au balayage de `f_verifier_couverture_rls()` — elle ne porte pas de
 *  `filiale_id`.
 */

describe('filiales : table de configuration (CONVENTIONS §17.4, constat N-2)', () => {
  /** Pose le drapeau d'administration Groupe pour la durée du bloc. */
  const enAdmin = (client, p, travail) =>
    base.avecPerimetre(client, p, async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      return travail(c);
    });

  test('LE CAS DEMANDÉ : la filiale A ne modifie pas la fiche de la filiale B', async () => {
    const etat = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      const affectees = (await c.query(
        "update filiales set raison_sociale = 'Détournée par Toulouse' where id = $1",
        [B],
      )).rowCount;
      // Le refus est SILENCIEUX (0 ligne) et non bruyant : le « using » de la politique
      // écarte la ligne avant tout contrôle. C'est l'observation O-2 du premier rapport,
      // reportée au lot L2 — l'API devra distinguer « refusé » de « conflit de version ».
      // Ce qui compte ici, c'est que la fiche soit intacte, et on le vérifie.
      await c.query("select set_config('grc.filiales', $1, true)", [`${A},${B}`]);
      const fiche = (await c.query(
        'select raison_sociale, version, modifie_par from filiales where id = $1',
        [B],
      )).rows[0];
      return { affectees, ...fiche };
    });
    assert.equal(etat.affectees, 0, 'Aucune ligne de la filiale B n’est candidate.');
    assert.equal(etat.raison_sociale, 'Essai Allemagne', 'La raison sociale de B est intacte.');
    assert.equal(etat.version, 1, 'Et sa version n’a pas bougé : personne n’a touché sa ligne.');
    assert.equal(etat.modifie_par, null);
  });

  test('ni même SA PROPRE fiche : ce n’est pas une donnée de filiale', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => (
      await c.query("update filiales set nom_court = 'TLS' where id = $1", [A])
    ).rowCount);
    assert.equal(affectees, 0, 'L’identité d’une filiale se paramètre, elle ne se modifie pas au fil de l’eau.');
  });

  test('créer une filiale sans l’administration Groupe est refusé, et bruyamment', async () => {
    const erreur = await refus(
      applicatif,
      rssiSite(A),
      "insert into filiales (id, code, raison_sociale) values ('FIL-PIRATE', 'ZZPIR', 'Créée par Toulouse')",
    );
    assert.equal(erreur.code, '42501');
  });

  test('en supprimer une non plus', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => (
      await c.query('delete from filiales where id = $1', [B])
    ).rowCount);
    assert.equal(affectees, 0);
  });

  test('contrôle symétrique : EN administration Groupe, le paramétrage passe', async () => {
    // Ce qui est demandé, c'est de RÉSERVER l'écriture, pas de la supprimer : les lots L4
    // (création de filiale) et L9 (identité par filiale) en dépendent.
    const etat = await enAdmin(applicatif, rssiSite(A), async (c) => {
      const creees = (await c.query(
        "insert into filiales (id, code, raison_sociale) values ('FIL-ESSAI-C', 'ZZESSC', 'Essai Espagne')"
      )).rowCount;
      const modifiees = (await c.query(
        "update filiales set nom_court = 'TLS' where id = $1", [A],
      )).rowCount;
      return { creees, modifiees };
    });
    assert.deepEqual(etat, { creees: 1, modifiees: 1 });
  });

  test('la LECTURE reste ouverte, et elle doit l’être', async () => {
    // L'authentification lit cette table AVANT que le périmètre existe : la cloisonner
    // rendrait toute connexion impossible.
    const predicat = await base.valeur(
      proprietaire,
      `select pg_get_expr(polqual, polrelid) from pg_policy
        where polrelid = 'filiales'::regclass and polname = 'pol_filiales_lecture'`,
    );
    assert.equal(predicat, 'true');
    const vues = await compter(applicatif, rssiSite(A), 'select count(*)::int as n from filiales');
    assert.ok(vues >= 2, 'Une session de site voit bien la liste des filiales du groupe.');
  });

  test('LE LOGO : une filiale ne pose pas SON fichier comme logo d’une AUTRE', async () => {
    // La pathologie de B-1 par un chemin que son balayage ne pouvait pas voir :
    // filiales.logo_piece_jointe_id pointe une table de NIVEAU FILIALE. La filiale A
    // déposait une pièce jointe chez elle, la posait comme logo de B, puis la supprimait —
    // ce qui remettait à null le logo de B, incrémentait sa version et y inscrivait
    // « modifie_par = alice ». La clé étrangère est désormais COMPOSITE (001 §10).
    const erreur = await erreurAttendue(
      enAdmin(applicatif, perimetre('alice', A, [A, B]), async (c) => {
        await c.query(
          `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier,
                                       type_mime, taille_octets, sha256, chemin_stockage)
               values ('PJ-A-LOGO', $1, 'filiales', $1, 'logo.png', 'image/png', 12,
                       repeat('a', 64), 'aa/' || repeat('1', 64))`,
          [A],
        );
        await c.query('update filiales set logo_piece_jointe_id = $1 where id = $2', ['PJ-A-LOGO', B]);
      }),
    );
    assert.equal(erreur.code, '23503', 'Le refus vient de l’intégrité référentielle, aveugle à la RLS.');
    assert.match(erreur.message, /fk_filiales_logo/);
  });

  test('contrôle symétrique : son PROPRE fichier, en revanche, fait un logo valide', async () => {
    const affectees = await enAdmin(applicatif, rssiSite(A), async (c) => {
      await c.query(
        `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier,
                                     type_mime, taille_octets, sha256, chemin_stockage)
             values ('PJ-A-LOGO2', $1, 'filiales', $1, 'logo.png', 'image/png', 12,
                     repeat('c', 64), 'bb/' || repeat('2', 64))`,
        [A],
      );
      return (await c.query(
        'update filiales set logo_piece_jointe_id = $1 where id = $2', ['PJ-A-LOGO2', A],
      )).rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('LE BALAYAGE : les SEPT tables de configuration ont une écriture conditionnée', async () => {
    // Structurel plutôt qu'anecdotique : c'est le motif que l'auditeur a réclamé — « toute
    // table de niveau Groupe dont l'écriture est ouverte est-elle dans une liste
    // explicitement arbitrée ? ». La liste ci-dessous EST cette liste, et toute table qui
    // en sortirait, ou qui y entrerait sans que ce test bouge, se voit.
    const conditionnees = await base.lignes(
      proprietaire,
      `select distinct c.relname::text as nom
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where p.polcmd in ('a', 'w', 'd')
          and coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                       pg_get_expr(p.polqual, p.polrelid), '') = 'f_administration_groupe()'
        order by 1`,
    );
    assert.deepEqual(
      conditionnees.map((l) => l.nom),
      ['filiales', 'groupes_ad', 'mapping_exigences', 'mappings', 'profil_domaines',
       'profils', 'utilisateurs'],
    );
  });

  test('L’AMORÇAGE RESTE POSSIBLE : la première filiale se crée SANS périmètre', async () => {
    // Point soulevé par l'agent qui travaille sur le pool : la création de la toute
    // première filiale (lot L4) n'a aucun périmètre à déclarer — il n'existe pas encore de
    // filiale à nommer. Ce test constate que LA BASE ne s'y oppose pas : les tables de
    // configuration ne passent pas par f_filiale_ecriture(), seul le drapeau
    // d'administration leur est demandé. La donnée MÉTIER, elle, continue d'exiger un
    // périmètre — c'est le contrôle symétrique de la seconde moitié.
    //
    // Autrement dit : le correctif N-1 n'aggrave PAS le problème d'amorçage, et le verrou
    // qui subsiste est côté serveur (validerPerimetre), pas ici. Écrit sous forme de test
    // pour que le lot L4 puisse s'appuyer dessus, et pour que la propriété ne se perde pas.
    const amorcage = await base.avecPerimetre(
      applicatif,
      { utilisateur: 'amorcage', filialeId: null, filiales: [] },
      async (c) => {
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        const filiale = (await c.query(
          "insert into filiales (id, code, raison_sociale) values ('FIL-AMORCE', 'ZZAMO', 'Première filiale')"
        )).rowCount;
        const compte = (await c.query(
          "insert into utilisateurs (id, identifiant, nom_affichage) values ('u-amorce', 'u-amorce', 'Premier compte')"
        )).rowCount;
        await c.query("select set_config('grc.administration_groupe', '', true)");
        return { filiale, compte };
      },
    );
    assert.deepEqual(amorcage, { filiale: 1, compte: 1 });

    // Contrôle symétrique : la donnée métier, elle, exige toujours un périmètre.
    const erreur = await refus(
      applicatif,
      { utilisateur: 'amorcage', filialeId: null, filiales: [] },
      `insert into risques (id, filiale_id, nom) values ('RISK-AMORCE', $1, 'essai')`,
      [A],
    );
    assert.equal(erreur.code, 'GRC04');
  });

  test('DÉCISION RENVERSÉE : mappings et mapping_exigences sont RÉSERVÉES au Groupe', async () => {
    // Ce test disait le contraire jusqu'au premier passage de la porte S2, et il annonçait
    // lui-même sa chute : « il tombera le jour où quelqu'un changera la décision sans la
    // réécrire — c'est tout son objet ». La décision a changé, et voici la réécriture.
    //
    // CE QUI TENAIT ENCORE de l'arbitrage précédent, et qui borne ce que ce correctif ne
    // prétend PAS régler : le contenu n'est pas une donnée de filiale, et aucun chemin
    // d'intégrité ne relie ces tables à une table cloisonnée — ce n'est donc ni une fuite
    // en lecture, ni la pathologie du constat B-1. Les deux propriétés sont vérifiées plus
    // bas, parce qu'elles restent la raison pour laquelle le constat est majeur et non
    // bloquant.
    //
    // CE QUI EST TOMBÉ : « c'est un contenu édité en fonctionnement courant, le réserver
    // supprimerait une fonctionnalité livrée ». La porte S2 a rejoué la conséquence depuis
    // une session FIL-A sans privilège — création d'une correspondance forgée, visible des
    // vingt filiales, puis suppression du catalogue partagé. Éditer une correspondance
    // devient un acte d'administration Groupe (PLAN_SERVEUR §2.2) ; c'est écrit dans
    // 004_rls.sql §6, et c'est assumé.
    const predicats = await base.lignes(
      proprietaire,
      `select c.relname::text || '.' || p.polcmd::text as politique,
              coalesce(pg_get_expr(p.polwithcheck, p.polrelid),
                       pg_get_expr(p.polqual, p.polrelid)) as predicat
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname in ('mappings', 'mapping_exigences') and p.polcmd in ('a', 'w', 'd')
        order by 1`,
    );
    assert.equal(predicats.length, 6, 'Deux tables × ajout / modification / suppression.');
    assert.deepEqual(
      [...new Set(predicats.map((l) => l.predicat))],
      ['f_administration_groupe()'],
    );

    // Et en EXÉCUTION, pas seulement dans le catalogue : le scénario de la porte S2,
    // rejoué. Une session de filiale ordinaire crée, réécrit, supprime — ou plus.
    await base.avecPerimetre(
      applicatif, rssiSite(A),
      async (c) => {
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query("insert into mappings (id, theme) values ('MAP-S2', 'Sauvegardes')");
        await c.query(
          "insert into mapping_exigences (mapping_id, ref_id, code) values ('MAP-S2', 'anssi', 'M10')",
        );
        await c.query("select set_config('grc.administration_groupe', '', true)");
      },
      { annuler: false },
    );
    try {
      const observe = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query('savepoint avant_m4');
        const ajout = await erreurAttendue(
          c.query("insert into mappings (id, theme) values ('MAP-FORGE', 'forgé par FIL-A')"),
        );
        await c.query('rollback to savepoint avant_m4');
        // Modification et suppression : le « using » d'une politique ÉCARTE la ligne au
        // lieu de refuser l'opération — le refus est donc MUET, et c'est le constat T-6
        // de S1, reproduit ici pour que L2 sache qu'un « 0 ligne » sur ces tables peut
        // vouloir dire « refusé » et non « conflit de version ».
        const maj = (await c.query(
          "update mappings set theme = 'réécrit par FIL-A' where id = 'MAP-S2'")).rowCount;
        const suppr = (await c.query(
          "delete from mapping_exigences where mapping_id = 'MAP-S2'")).rowCount;
        const lecture = (await c.query(
          "select id from mappings where id = 'MAP-S2'")).rowCount;
        return { ajout: ajout.code, maj, suppr, lecture };
      });
      assert.deepEqual(observe, { ajout: '42501', maj: 0, suppr: 0, lecture: 1 },
        'Écriture refusée depuis une filiale ; la LECTURE, elle, reste ouverte.');
    } finally {
      await base.avecPerimetre(
        applicatif, rssiSite(A),
        async (c) => {
          await c.query("select set_config('grc.administration_groupe', 'oui', true)");
          await c.query("delete from mapping_exigences where mapping_id = 'MAP-S2'");
          await c.query("delete from mappings where id = 'MAP-S2'");
        },
        { annuler: false },
      );
    }

    // Les deux propriétés de l'ancien arbitrage qui TIENNENT toujours, vérifiées plutôt
    // qu'affirmées : aucune clé étrangère ne relie ces tables à une table cloisonnée…
    const liens = await base.lignes(
      proprietaire,
      `select con.conname::text as nom
         from pg_constraint con
         join pg_class enfant on enfant.oid = con.conrelid
         join pg_class parent on parent.oid = con.confrelid
        where con.contype = 'f'
          and enfant.relname in ('mappings', 'mapping_exigences')
          and exists (select 1 from pg_attribute a
                       where a.attrelid = parent.oid and a.attname = 'filiale_id'
                         and a.attnum > 0 and not a.attisdropped)`,
    );
    assert.deepEqual(liens, [], 'Aucun chemin d’intégrité vers une table cloisonnée.');

    // … et aucune des deux ne porte de filiale_id : la famille 4 leur convient telle
    // quelle, c'est pourquoi le déplacement tient en deux noms.
    const cloisonnees = await base.lignes(
      proprietaire,
      `select c.relname::text as nom from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
        where n.nspname = 'public' and c.relname in ('mappings', 'mapping_exigences')
          and a.attnum > 0 and not a.attisdropped`,
    );
    assert.deepEqual(cloisonnees, []);
  });
});

/* =====================================================================
 *  §17.8 — L'acteur d'une entrée de journal vient de la session
 * =====================================================================
 *
 *  Constat N-5. Le déclencheur de chaînage écrasait déjà le numéro, l'horodatage et les
 *  empreintes — tout ce qui fait qu'une entrée ne se forge pas — mais laissait l'identité
 *  de l'acteur en saisie libre. La seule table dont l'objet EST de faire preuve était donc
 *  la seule à croire son appelant sur ce point : un journal inaltérable dont l'acteur est
 *  déclaré par le client garantit l'intégrité d'une fausse preuve.
 */

describe('L’acteur du journal d’audit (CONVENTIONS §17.8)', () => {
  /** Provisionne un compte, puis écrit une entrée sous l'identité `utilisateur`. */
  async function entree(utilisateur, colonnes, valeurs) {
    return base.avecPerimetre(applicatif, perimetre(utilisateur, A, [A]), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage) values ($1, $2, 'Compte d''essai')
           on conflict (id) do nothing`,
        [utilisateur, utilisateur],
      );
      await c.query("select set_config('grc.administration_groupe', '', true)");
      await c.query(
        `insert into journal_audit (filiale_id, action, resume${colonnes}) values ($1, 'creation', 'essai'${valeurs})`,
        [A],
      );
      return (await c.query(
        `select utilisateur_id, utilisateur_libelle, numero, empreinte
           from journal_audit where resume = 'essai' order by numero desc limit 1`,
      )).rows[0];
    });
  }

  test('un utilisateur_id fourni par le client est ÉCRASÉ par celui de la session', async () => {
    const ligne = await entree('alice', ', utilisateur_id', ", 'USR-USURPE'");
    assert.equal(ligne.utilisateur_id, 'alice', 'L’acteur vient de grc.utilisateur, pas du corps.');
  });

  test('le LIBELLÉ, lui, reste fourni — et c’est délibéré', async () => {
    // §12 : la doublure texte doit survivre à la disparition du compte, et couvre l'échec
    // de connexion sur un compte inconnu. Elle n'est plus la SOURCE de l'identité,
    // seulement son affichage.
    const ligne = await entree('alice', ', utilisateur_libelle', ", 'Bruno Schmidt'");
    assert.equal(ligne.utilisateur_libelle, 'Bruno Schmidt');
    assert.equal(ligne.utilisateur_id, 'alice');
  });

  test('les deux à la fois : l’identité est celle de la session, le libellé celui du client', async () => {
    const ligne = await entree('alice', ', utilisateur_id, utilisateur_libelle', ", 'USR-USURPE', 'bruno'");
    assert.deepEqual(
      { id: ligne.utilisateur_id, libelle: ligne.utilisateur_libelle },
      { id: 'alice', libelle: 'bruno' },
      'Une trace forgée ne peut plus accuser nommément un tiers.',
    );
  });

  test('un identifiant de session sans compte connu donne un acteur NUL, pas un échec', async () => {
    // Les écritures légitimes sans compte derrière elles doivent continuer de passer :
    // « systeme » (migrations, timers) et les événements antérieurs à la résolution de
    // l'identité (échec de connexion sur un compte inconnu). Mettre l'identifiant tel quel
    // violerait la clé étrangère vers utilisateurs.
    const ligne = await base.avecPerimetre(applicatif, perimetre('systeme', A, [A]), async (c) => {
      await c.query(
        `insert into journal_audit (filiale_id, action, utilisateur_libelle, resume)
             values ($1, 'connexion_echouee', 'compte-inconnu', 'sans compte')`,
        [A],
      );
      return (await c.query(
        "select utilisateur_id, utilisateur_libelle from journal_audit where resume = 'sans compte'",
      )).rows[0];
    });
    assert.equal(ligne.utilisateur_id, null);
    assert.equal(ligne.utilisateur_libelle, 'compte-inconnu', 'Le libellé, lui, reste lisible.');
  });

  test('l’entrée reste scellée, et la chaîne intacte', async () => {
    // L'acteur entre dans la charge utile de l'empreinte : il fallait vérifier que
    // l'écraser dans le déclencheur ne casse pas le sceau.
    await base.avecPerimetre(applicatif, perimetre('alice', A, [A]), async (c) => {
      await c.query(
        `insert into journal_audit (filiale_id, action, resume) values ($1, 'export', 'scellé')`,
        [A],
      );
    }, { annuler: false });
    const anomalies = await base.lignes(proprietaire, 'select anomalie from f_journal_audit_verifier()');
    assert.deepEqual(anomalies.map((l) => l.anomalie), []);
  });
});

/* =====================================================================
 *  §17.6 — « Il s'archive » : le mécanisme existe maintenant
 * =====================================================================
 *
 *  Constat N-6. Le §17.6 et les commentaires de 002 promettaient qu'un contrôle déjà
 *  évalué « s'archive » — et le `restrict` des quatre références le rendait effectivement
 *  indestructible — sans qu'aucune colonne ne rende l'archivage possible. L'administration
 *  Groupe se retrouvait devant un refus SANS ISSUE, et un exploitant qui suit le document
 *  finissait par supprimer les mises en œuvre des vingt filiales : exactement ce que le
 *  `restrict` existe pour éviter.
 */

describe('Cycle de vie du catalogue de mesures (CONVENTIONS §17.6, constat N-6)', () => {
  test('L’ISSUE : un contrôle du socle qu’on ne peut pas supprimer, on l’archive', async () => {
    const etat = await base.avecPerimetre(applicatif, perimetre('alice', A, [A, B]), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query("insert into mesure_catalogue (id, nom) values ('MESURE-ARCH', 'Contrôle retiré')");
      await c.query("select set_config('grc.administration_groupe', '', true)");
      await c.query("select set_config('grc.filiale_id', $1, true)", [B]);
      await c.query(
        "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-ARCH', $1, 'MESURE-ARCH')",
        [B],
      );

      // Le retrait par suppression est fermé — c'est le §17.6, premier volet.
      await c.query("select set_config('grc.filiale_id', $1, true)", [A]);
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query('savepoint avant_suppression');
      const refusee = await erreurAttendue(c.query("delete from mesure_catalogue where id = 'MESURE-ARCH'"));
      await c.query('rollback to savepoint avant_suppression');

      // …et l'archivage est l'issue que le document promettait.
      const archivees = (await c.query(
        "update mesure_catalogue set statut = 'archivee', archive_le = now() where id = 'MESURE-ARCH'"
      )).rowCount;

      const ligne = (await c.query(
        `select m.statut, m.archive_le is not null as datee,
                (select count(*)::int from mesure_mise_en_oeuvre o where o.mesure_id = m.id) as rattachements
           from mesure_catalogue m where m.id = 'MESURE-ARCH'`,
      )).rows[0];
      return { suppression: refusee.code, archivees, ...ligne };
    });

    assert.equal(etat.suppression, '23503', 'La suppression reste refusée : c’est le point de départ.');
    assert.equal(etat.archivees, 1, 'L’archivage, lui, doit passer.');
    assert.equal(etat.statut, 'archivee');
    assert.equal(etat.datee, true);
    // Le point du §17.6 : la mesure archivée reste LISIBLE et reste RATTACHÉE. Une
    // évaluation d'il y a deux ans continue de désigner le contrôle qu'elle visait — la
    // preuve historique survit, ce qui est exactement ce qu'un auditeur ISO 27001 attend.
    assert.equal(etat.rattachements, 1, 'La mise en oeuvre de l’autre filiale est intacte.');
  });

  test('l’état et sa date sont indissociables, dans les DEUX sens', async () => {
    for (const [libelle, instruction] of [
      ['archivée sans date', "update mesure_catalogue set statut = 'archivee' where id = 'MESURE-G'"],
      ['datée sans être archivée', "update mesure_catalogue set archive_le = now() where id = 'MESURE-G'"],
    ]) {
      const erreur = await erreurAttendue(
        base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
          await c.query("select set_config('grc.administration_groupe', 'oui', true)");
          await c.query(instruction);
        }),
      );
      assert.equal(erreur.code, '23514', `${libelle} : incohérence à refuser.`);
      assert.match(erreur.message, /ck_mesure_catalogue_archive/);
    }
  });

  test('le statut n’admet que les deux valeurs du cycle de vie', async () => {
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query("update mesure_catalogue set statut = 'supprimee' where id = 'MESURE-G'");
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.message, /ck_mesure_catalogue_statut/);
  });

  test('par défaut une mesure est ACTIVE, et sans date d’archivage', async () => {
    const ligne = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => (
      await c.query("select statut, archive_le from mesure_catalogue where id = 'MESURE-A'")
    ).rows[0]);
    assert.deepEqual(ligne, { statut: 'active', archive_le: null });
  });

  test('DÉLIBÉRÉMENT ABSENT : rien n’interdit de référencer une mesure archivée', async () => {
    // « Ne plus être proposée pour de nouvelles évaluations » est une règle APPLICATIVE.
    // Un déclencheur qui refuserait un nouveau lien casserait la reprise d'un export
    // grc-backup portant des liens légitimes vers un contrôle archivé depuis, et rendrait
    // l'archivage destructif par un autre chemin. La base dit l'état ; la couche métier en
    // tire les conséquences dans les écrans de saisie. Ce test fige cette frontière.
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query(
        `insert into mesure_catalogue (id, nom, statut, archive_le)
             values ('MESURE-VIEILLE', 'Contrôle archivé', 'archivee', now())`,
      );
      await c.query("select set_config('grc.administration_groupe', '', true)");
      return (await c.query(
        "insert into mesure_mise_en_oeuvre (id, filiale_id, mesure_id) values ('MMO-VIEILLE', $1, 'MESURE-VIEILLE')",
        [A],
      )).rowCount;
    });
    assert.equal(affectees, 1, 'La reprise d’un export ancien doit continuer de passer.');
  });
});

/* =====================================================================
 *  Deux observations du second passage, fermées ici
 * ===================================================================== */

describe('Portée des liens documentaires et armement des déclencheurs (N-10, N-11)', () => {
  test('N-10 : un lien de portée GROUPE ne désigne pas un document LOCAL d’une filiale', async () => {
    // La règle de correspondance par défaut (« match simple ») neutralise une clé
    // composite dès qu'une de ses colonnes est nulle : fk_document_referentiels_coherence
    // ne vérifiait donc plus rien pour les lignes de portée Groupe. Une opération
    // ordinaire d'une filiale — supprimer son document — emportait alors en cascade une
    // ligne de portée Groupe. La clé de PORTÉE (colonne engendrée, jamais nulle) ferme le
    // cas symétrique ; les deux ensemble épinglent filiale_id dans les deux sens.
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, perimetre('alice', A, [A, B]), async (c) => {
        await c.query("select set_config('grc.filiale_id', $1, true)", [B]);
        await c.query(
          "insert into documents (id, filiale_id, titre) values ('DOC-LOCAL-B', $1, 'Verfahren')",
          [B],
        );
        await c.query("select set_config('grc.filiale_id', $1, true)", [A]);
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query(
          "insert into document_referentiels (document_id, ref_id, filiale_id) values ('DOC-LOCAL-B', 'anssi', null)",
        );
      }),
    );
    assert.equal(erreur.code, '23503');
    assert.match(erreur.message, /fk_document_referentiels_portee/);
  });

  test('contrôle symétrique : un lien de portée Groupe vers un document Groupe passe', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      return (await c.query(
        "insert into document_referentiels (document_id, ref_id, filiale_id) values ('DOC-G', 'anssi', null)",
      )).rowCount;
    });
    assert.equal(affectees, 1);
  });

  test('contrôle symétrique : un lien LOCAL vers son propre document passe aussi', async () => {
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => (
      await c.query(
        "insert into document_referentiels (document_id, ref_id, filiale_id) values ('DOC-A', 'iso-27002-2022', $1)",
        [A],
      )
    ).rowCount);
    assert.equal(affectees, 1);
  });

  test('N-11 : les neuf déclencheurs de cohérence et de portée sont armés en « always »', async () => {
    // Les trois du journal d'audit le sont depuis 001 ; ces neuf-là portent désormais des
    // garanties de cloisonnement opposables — cohérence du catalogue, portée figée — et
    // n'ont pas de raison d'être armés plus faiblement. Sans effet contre le rôle
    // applicatif (qui ne peut pas poser session_replication_role) ; ce que « always »
    // ferme, c'est le jour où une reprise en masse ou une réplication logique basculerait
    // la session en mode « replica » et désarmerait tout ce qui ne l'est pas.
    const armement = await base.lignes(
      proprietaire,
      `select t.tgname::text as nom, t.tgenabled::text as armement
         from pg_trigger t
        where not t.tgisinternal
          and (t.tgname like '%\\_coherence\\_mesure' or t.tgname like '%\\_portee\\_figee')
        order by 1`,
    );
    assert.equal(armement.length, 9, 'Quatre déclencheurs de cohérence, cinq de portée.');
    assert.deepEqual(
      [...new Set(armement.map((l) => l.armement))],
      ['A'],
      `Armement attendu « A » (always) : ${JSON.stringify(armement)}`,
    );
  });

  test('et les trois du journal d’audit le sont toujours', async () => {
    // Contrôle de non-régression : c'est le modèle sur lequel les neuf ont été alignés.
    const armement = await base.lignes(
      proprietaire,
      `select t.tgenabled::text as armement from pg_trigger t
         where not t.tgisinternal and t.tgrelid = 'journal_audit'::regclass`,
    );
    assert.deepEqual([...new Set(armement.map((l) => l.armement))], ['A']);
  });
});

/* =====================================================================
 *  §18.1 — La traçabilité est imposée à l'INSERTION comme à la modification
 * =====================================================================
 *
 *  Constat T-1 du troisième passage, et c'est lui qui met le contrôle S4 de la grille en
 *  échec : son texte de preuve dit « le client ne peut pas fixer `version` ». Il le
 *  pouvait — à la création. Les deux audits précédents ont éprouvé l'`update` de fond en
 *  comble et jamais l'`insert`, où aucun déclencheur n'intervenait.
 *
 *  Le pire n'était pas la valeur forgée mais son sort : `f_maj_tracabilite()` GÈLE
 *  `cree_le` et `cree_par` à chaque modification, si bien que la forgerie devenait
 *  définitive et inaltérable. Le mécanisme qui protège la vérité protégeait le mensonge.
 */

describe('Traçabilité imposée à l’insertion (CONVENTIONS §18.1)', () => {
  test('LA PREUVE FABRIQUÉE : version, cree_par et cree_le fournis sont IGNORÉS', async () => {
    // Le scénario du rapport, mot pour mot : une ligne créée aujourd'hui par « alice » se
    // présentait comme créée quinze mois plus tôt par le directeur général — et le gel
    // rendait la chose définitive.
    const ligne = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom, version, cree_par, cree_le,
                              modifie_par, modifie_le)
             values ('RISK-USURPE', $1, 'Risque accepté par la direction', 42,
                     'marc.dupuis (DG)', '2024-01-15', 'marc.dupuis (DG)', '2024-01-15')`,
        [A],
      );
      return (await c.query(
        `select version, cree_par, cree_le::date::text as cree_le, modifie_par, modifie_le
           from risques where id = 'RISK-USURPE'`,
      )).rows[0];
    });

    assert.equal(ligne.version, 1, 'La version d’une ligne qui naît vaut 1, quoi qu’on envoie.');
    assert.equal(ligne.cree_par, 'rssi-site', 'L’auteur vient de la session, pas du corps de la requête.');
    assert.equal(
      ligne.cree_le,
      new Date().toISOString().slice(0, 10),
      'La date de création est celle du serveur — l’antidatage est fermé.',
    );
    assert.equal(ligne.modifie_par, null, 'Une ligne qui naît n’a jamais été modifiée.');
    assert.equal(ligne.modifie_le, null);
  });

  test('IGNORÉ, JAMAIS REFUSÉ : une charge qui porte ces colonnes s’insère quand même', async () => {
    // Condition explicite du §18.1 : un export grc-backup contient ces colonnes, et la
    // reprise ne doit pas échouer pour autant. Refuser aurait été plus simple à écrire et
    // aurait cassé le lot L7.
    const affectees = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => (
      await c.query(
        `insert into actifs (id, filiale_id, nom, version, cree_par, cree_le)
             values ('ACTIF-REPRISE', $1, 'ERP repris', 7, 'ancien-systeme', '2019-06-01')`,
        [A],
      )
    ).rowCount);
    assert.equal(affectees, 1);
  });

  test('LE GEL DÉFINITIF DISPARAÎT : version au maximum de l’entier ne fige plus la ligne', async () => {
    // « new.version := old.version + 1 » débordait, et l'erreur avortait la transaction
    // entière : la ligne devenait DÉFINITIVEMENT immodifiable. Le cas s'éteint de lui-même
    // dès lors que la valeur ne peut plus venir de l'appelant.
    const etat = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom, version) values ('RISK-GEL', $1, 'gelé', 2147483647)`,
        [A],
      );
      const nee = (await c.query("select version from risques where id = 'RISK-GEL'")).rows[0].version;
      await c.query("update risques set nom = 'modifié' where id = 'RISK-GEL'");
      const apres = (await c.query("select version from risques where id = 'RISK-GEL'")).rows[0].version;
      return { nee, apres };
    });
    assert.deepEqual(etat, { nee: 1, apres: 2 }, 'La ligne naît en 1 et reste modifiable.');
  });

  test('les tables SANS version sont tracées aussi — liaisons et profil_domaines', async () => {
    // Trois formes de tables, trois fonctions miroir. Une liaison n'a que sa création à
    // enregistrer ; profil_domaines a en plus des colonnes de modification, sans version.
    const liaison = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      // Une exigence NEUVE : le semis a déjà posé le lien RISK-A ↔ EX-A, et « on conflict
      // do nothing » rendrait la ligne du semeur au lieu de celle qu'on veut éprouver.
      await c.query(
        `insert into exigences (id, filiale_id, code, intitule) values ('EX-T1', $1, 'A.5.9', 'Essai')`,
        [A],
      );
      await c.query(
        `insert into risque_exigences (risque_id, exigence_id, cree_par, cree_le)
             values ('RISK-A', 'EX-T1', 'usurpe', '1999-01-01')`,
      );
      return (await c.query(
        `select cree_par, cree_le::date::text as cree_le from risque_exigences
          where risque_id = 'RISK-A' and exigence_id = 'EX-T1'`,
      )).rows[0];
    });
    assert.equal(liaison.cree_par, 'rssi-site');
    assert.equal(liaison.cree_le, new Date().toISOString().slice(0, 10));

    const domaine = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query(
        `insert into profils (id, code, nom) values ('PROF-T1', 'ZZT1', 'Profil d''essai')`,
      );
      await c.query(
        `insert into profil_domaines (profil_id, domaine, niveau, cree_par, modifie_par)
             values ('PROF-T1', 'risques', 'lecture', 'usurpe', 'usurpe')`,
      );
      return (await c.query(
        `select cree_par, modifie_par from profil_domaines where profil_id = 'PROF-T1'`,
      )).rows[0];
    });
    assert.deepEqual(domaine, { cree_par: 'rssi-site', modifie_par: null });
  });

  test('LE BALAYAGE : toute table portant « cree_par » a son déclencheur, armé en « always »', async () => {
    // Balayage écrit ICI, indépendamment de f_verifier_tracabilite() : un test qui se
    // contenterait d'appeler la fonction du schéma la validerait par elle-même. Les deux
    // doivent dire la même chose, et le test suivant vérifie qu'elles le disent.
    const fautives = await base.lignes(
      proprietaire,
      `select c.relname::text || ' (' || coalesce(x.fonction, 'AUCUN') || '/'
                              || coalesce(x.armement, '-') || ')' as fautive
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join lateral (
              select p.proname::text as fonction, t.tgenabled::text as armement,
                     t.tgqual is not null as conditionnel
                from pg_trigger t join pg_proc p on p.oid = t.tgfoid
               where t.tgrelid = c.oid and not t.tgisinternal
                 and t.tgname = 'trg_' || c.relname || '_creation') x on true
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                       and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped)
          and (x.fonction is null or x.armement <> 'A' or x.conditionnel
               or x.fonction <> case
                    when exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                  and a.attname = 'version' and a.attnum > 0 and not a.attisdropped)
                         then 'f_init_tracabilite'
                    when exists (select 1 from pg_attribute a where a.attrelid = c.oid
                                  and a.attname = 'modifie_le' and a.attnum > 0 and not a.attisdropped)
                         then 'f_init_horodatage'
                    else 'f_init_creation' end)
        order by 1`,
    );
    assert.deepEqual(fautives.map((l) => l.fautive), []);

    const tracees = await base.valeur(
      proprietaire,
      `select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                       and a.attname = 'cree_par' and a.attnum > 0 and not a.attisdropped)`,
    );
    assert.ok(tracees >= 42, `Balayage suspect : ${tracees} table(s) seulement.`);
  });

  test('ET LE GARDE-FOU DU SCHÉMA DIT LA MÊME CHOSE — puis il MORD', async () => {
    assert.deepEqual(await base.lignes(proprietaire, 'select objet from f_verifier_tracabilite()'), []);

    // Contrôle de morsure : on retire le déclencheur d'une table, on vérifie que la
    // fonction le voit, et — c'est le point — que le client peut alors forger de nouveau.
    await proprietaire.query('drop trigger trg_risques_creation on risques');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_tracabilite() where objet = 'risques'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['creation_non_tracee']);

      const forgee = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query(
          `insert into risques (id, filiale_id, nom, version, cree_par)
               values ('RISK-MORSURE', $1, 'x', 99, 'usurpateur')`,
          [A],
        );
        return (await c.query("select version, cree_par from risques where id = 'RISK-MORSURE'")).rows[0];
      });
      assert.deepEqual(forgee, { version: 99, cree_par: 'usurpateur' }, 'Sans le déclencheur : c’est T-1.');

      // Et l'armement compte : « origin » se désarme par un réglage de session.
      await proprietaire.query(
        'create trigger trg_risques_creation before insert on risques '
          + 'for each row execute function f_init_tracabilite()',
      );
      assert.deepEqual(
        (await base.lignes(
          proprietaire,
          "select anomalie from f_verifier_tracabilite() where objet = 'risques'",
        )).map((l) => l.anomalie),
        ['creation_desarmable'],
      );
    } finally {
      await proprietaire.query('drop trigger if exists trg_risques_creation on risques');
      await proprietaire.query(
        'create trigger trg_risques_creation before insert on risques '
          + 'for each row execute function f_init_tracabilite()',
      );
      await proprietaire.query('alter table risques enable always trigger trg_risques_creation');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select objet from f_verifier_tracabilite()'), []);
  });
});

/* =====================================================================
 *  §18.2 — Toute action référentielle qui franchit une frontière est bornée
 * =====================================================================
 *
 *  Constat T-2. `personnes.utilisateur_id → utilisateurs` était en `on delete set null` :
 *  la DERNIÈRE action référentielle du schéma à traverser une frontière de niveau sans
 *  être bornée. Supprimer un compte réécrivait les fiches d'annuaire de toutes les
 *  filiales, y compris celles que l'auteur ne peut pas lire — `version` incrémentée,
 *  `modifie_par` portant le nom de quelqu'un qui n'y a jamais travaillé.
 *
 *  La politique d'écriture de `personnes` exige pourtant `filiale_id = f_filiale_ecriture()`.
 *  Elle n'est jamais évaluée : les contrôles d'intégrité référentielle contournent
 *  délibérément la RLS. C'est le raisonnement du §17.1, appliqué aux clés et jamais aux
 *  ACTIONS — et le §18.2 en fait maintenant une règle générale.
 */

describe('Actions référentielles bornées (CONVENTIONS §18.2, constat T-2)', () => {
  /** Provisionne un compte et le rattache à une fiche d'annuaire de chaque filiale. */
  async function annuaireLie(c, compte) {
    await c.query("select set_config('grc.administration_groupe', 'oui', true)");
    await c.query(
      `insert into utilisateurs (id, identifiant, nom_affichage) values ($1, $2, 'Compte lié')`,
      [compte, `login-${compte}`],
    );
    await c.query("select set_config('grc.administration_groupe', '', true)");
    for (const [filiale, suffixe] of [[A, 'A'], [B, 'B']]) {
      await c.query("select set_config('grc.filiale_id', $1, true)", [filiale]);
      await c.query(
        `insert into personnes (id, filiale_id, nom, utilisateur_id) values ($1, $2, 'Fiche', $3)`,
        [`PERS-LIE-${suffixe}`, filiale, compte],
      );
    }
    await c.query("select set_config('grc.filiale_id', $1, true)", [A]);
  }

  test('LE CAS DEMANDÉ : supprimer un compte ne touche aucune fiche hors du périmètre', async () => {
    const resultat = await base.avecPerimetre(
      applicatif,
      perimetre('rssi-groupe', A, [A, B]),
      async (c) => {
        await annuaireLie(c, 'USR-T2');

        // La session se referme sur la seule filiale A : elle ne voit plus la fiche de B.
        await c.query("select set_config('grc.filiales', $1, true)", [A]);
        const invisible = (await c.query(
          "select count(*)::int as n from personnes where id = 'PERS-LIE-B'",
        )).rows[0].n;

        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query('savepoint avant_suppression');
        const erreur = await erreurAttendue(c.query("delete from utilisateurs where id = 'USR-T2'"));
        await c.query('rollback to savepoint avant_suppression');

        // Et les deux fiches sont intactes — c'est la vraie question.
        await c.query("select set_config('grc.filiales', $1, true)", [`${A},${B}`]);
        const fiches = (await c.query(
          `select id, utilisateur_id, version, modifie_par from personnes
            where id in ('PERS-LIE-A', 'PERS-LIE-B') order by id`,
        )).rows;
        return { invisible, code: erreur.code, message: erreur.message, fiches };
      },
    );

    assert.equal(resultat.invisible, 0, 'La fiche de la filiale B est bien invisible.');
    assert.equal(resultat.code, '23503', 'Le refus vient de l’intégrité référentielle, qui voit tout.');
    assert.match(resultat.message, /fk_personnes_utilisateur/);
    assert.deepEqual(
      resultat.fiches.map((f) => ({ id: f.id, lien: f.utilisateur_id, v: f.version, par: f.modifie_par })),
      [
        { id: 'PERS-LIE-A', lien: 'USR-T2', v: 1, par: null },
        { id: 'PERS-LIE-B', lien: 'USR-T2', v: 1, par: null },
      ],
      'Aucune fiche n’a été réécrite, aucune version incrémentée.',
    );
  });

  test('contrôle symétrique : après déliage explicite, la suppression passe', async () => {
    // Le délien est un geste EXPLICITE, fait dans le périmètre de celui qui le fait —
    // exactement comme la couche applicative délie déjà avant de retirer un contrôle du
    // catalogue (§17.6). Le comportement fonctionnel reste donc atteignable.
    const supprimes = await base.avecPerimetre(
      applicatif,
      perimetre('rssi-groupe', A, [A, B]),
      async (c) => {
        await annuaireLie(c, 'USR-T2B');
        for (const filiale of [A, B]) {
          await c.query("select set_config('grc.filiale_id', $1, true)", [filiale]);
          await c.query(
            'update personnes set utilisateur_id = null where utilisateur_id = $1 and filiale_id = $2',
            ['USR-T2B', filiale],
          );
        }
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        return (await c.query("delete from utilisateurs where id = 'USR-T2B'")).rowCount;
      },
    );
    assert.equal(supprimes, 1);
  });

  test('LE BALAYAGE : aucune action référentielle non bornée ne franchit une frontière', async () => {
    // Le balayage qui manquait au §17.1 : il portait sur les CLÉS, jamais sur les ACTIONS.
    // Une entité future dont la clé vers une table de niveau Groupe serait en « cascade »
    // ou en « set null » le fera tomber — c'est le seul filet qui empêche T-2 de revenir.
    const requete = `
      with niveau as (
        select c.oid, c.relname::text as nom,
               exists (select 1 from pg_attribute a where a.attrelid = c.oid
                        and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped) as cloisonnee
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p'))
      select k.conname::text || ' (' || e.nom || ' -> ' || p.nom || ', '
             || case k.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
                                   when 'd' then 'set default' else k.confdeltype::text end || ')' as fautive
        from pg_constraint k
        join niveau e on e.oid = k.conrelid
        join niveau p on p.oid = k.confrelid
       where k.contype = 'f'
         and e.cloisonnee and not p.cloisonnee            -- filiale -> Groupe
         and k.confdeltype not in ('a', 'r')              -- ni « no action », ni « restrict »
         -- Dérogation arbitrée, et la seule : session_filiales n'est pas une table métier.
         -- Ses lignes sont l'état d'une session ; elles doivent mourir avec la session et
         -- avec la filiale, sans quoi une session survivrait à son propre périmètre
         -- (004_rls.sql §6, famille 4).
         and e.nom <> 'session_filiales'
       order by 1`;

    assert.deepEqual((await base.lignes(proprietaire, requete)).map((l) => l.fautive), []);

    // Contrôle de morsure intégré : on recrée le défaut d'origine.
    await proprietaire.query('alter table personnes drop constraint fk_personnes_utilisateur');
    try {
      await proprietaire.query(
        'alter table personnes add constraint fk_personnes_utilisateur '
          + 'foreign key (utilisateur_id) references utilisateurs(id) on delete set null',
      );
      assert.deepEqual(
        (await base.lignes(proprietaire, requete)).map((l) => l.fautive),
        ['fk_personnes_utilisateur (personnes -> utilisateurs, set null)'],
      );
    } finally {
      await proprietaire.query('alter table personnes drop constraint fk_personnes_utilisateur');
      await proprietaire.query(
        'alter table personnes add constraint fk_personnes_utilisateur '
          + 'foreign key (utilisateur_id) references utilisateurs(id) on delete restrict',
      );
    }
    assert.deepEqual((await base.lignes(proprietaire, requete)).map((l) => l.fautive), []);
  });

  test('T-7 : supprimer la pièce jointe qui sert de logo est refusé, pas silencieux', async () => {
    // Corollaire du même principe, dans l'autre sens. La clé composite bornait déjà le
    // DOMMAGE à la ligne de la filiale concernée ; mais l'action référentielle contournait
    // la politique d'écriture de « filiales », qui exige l'administration Groupe : une
    // session de filiale sans le drapeau incrémentait la version de sa propre fiche.
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query(
          `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier,
                                       type_mime, taille_octets, sha256, chemin_stockage)
               values ('PJ-T7', $1, 'filiales', $1, 'logo.png', 'image/png', 12,
                       repeat('7', 64), 'cc/' || repeat('3', 64))`,
          [A],
        );
        await c.query("select set_config('grc.administration_groupe', 'oui', true)");
        await c.query('update filiales set logo_piece_jointe_id = $1 where id = $2', ['PJ-T7', A]);
        await c.query("select set_config('grc.administration_groupe', '', true)");
        await c.query("delete from pieces_jointes where id = 'PJ-T7'");
      }),
    );
    assert.equal(erreur.code, '23503');
    assert.match(erreur.message, /fk_filiales_logo/);
  });
});

/* =====================================================================
 *  §18.3 — `grc.utilisateur` désigne un LOGIN, pas une clé primaire
 * =====================================================================
 *
 *  Constat T-3. Le déclencheur de chaînage joignait le réglage de session à
 *  `utilisateurs.id`, alors que le socle documente ce réglage comme un login et qu'il
 *  alimente `cree_par` sur les 42 tables. Tant que les deux coïncident, rien ne se voit —
 *  et c'est exactement ce que le test de la passe précédente validait : il provisionnait
 *  un compte dont l'`id` ÉTAIT le login. Il prouvait une coïncidence, pas une propriété.
 */

describe('L’acteur du journal est résolu sur le LOGIN (CONVENTIONS §18.3)', () => {
  /** Le cas de production : une clé primaire « USR-… » et un login qui n'a rien à voir. */
  const CLE = 'USR-1720000000000-482';
  const LOGIN = 'jdupont';

  async function avecCompte(utilisateur, travail) {
    return base.avecPerimetre(applicatif, perimetre(utilisateur, A, [A]), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage)
             values ($1, $2, 'Jean Dupont') on conflict (id) do nothing`,
        [CLE, LOGIN],
      );
      await c.query("select set_config('grc.administration_groupe', '', true)");
      return travail(c);
    });
  }

  test('LE TEST QUI MANQUAIT : id ≠ identifiant, et l’acteur est quand même résolu', async () => {
    const ligne = await avecCompte(LOGIN, async (c) => {
      await c.query(
        `insert into journal_audit (filiale_id, utilisateur_id, utilisateur_libelle, action, resume)
             values ($1, 'USR-USURPE', 'bruno', 'creation', 'acteur sur login')`,
        [A],
      );
      return (await c.query(
        "select utilisateur_id, utilisateur_libelle from journal_audit where resume = 'acteur sur login'",
      )).rows[0];
    });
    assert.equal(ligne.utilisateur_id, CLE, 'Le login doit être résolu vers la clé primaire du compte.');
    assert.equal(ligne.utilisateur_libelle, 'bruno', 'Le libellé, lui, reste fourni (§17.8).');
  });

  test('la résolution ignore la casse, comme l’unicité du login', async () => {
    // uq_utilisateurs_identifiant est posée sur lower(identifiant) : un sAMAccountName
    // n'est pas sensible à la casse, et la résolution ne doit pas l'être davantage.
    const acteur = await avecCompte('JDupont', async (c) => {
      await c.query(
        `insert into journal_audit (filiale_id, action, resume) values ($1, 'creation', 'casse')`,
        [A],
      );
      return (await c.query(
        "select utilisateur_id from journal_audit where resume = 'casse'",
      )).rows[0].utilisateur_id;
    });
    assert.equal(acteur, CLE);
  });

  test('et la traçabilité des 42 tables reste LISIBLE : cree_par porte le login', async () => {
    // L'autre moitié de l'arbitrage. Résoudre dans l'autre sens — mettre la clé primaire
    // dans grc.utilisateur — aurait rempli cree_par de « USR-1720000000000-482 » sur
    // toutes les tables métier, et fait perdre au produit la lisibilité qu'il avait.
    const auteur = await avecCompte(LOGIN, async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom) values ('RISK-T3', $1, 'essai')`, [A],
      );
      return (await c.query("select cree_par from risques where id = 'RISK-T3'")).rows[0].cree_par;
    });
    assert.equal(auteur, LOGIN);
  });

  test('BRANCHE LÉGITIME, ET ELLE RESTE OUVERTE : un login sans compte donne un acteur nul', async () => {
    // « systeme » (migrations, timers) et l'échec de connexion sur un login inconnu — qui
    // est précisément l'événement que le PLAN_SERVEUR §1.7 veut voir tracé. Distinguer
    // « pas d'acteur » de « acteur non résolu » suppose de connaître la liste des actions
    // antérieures à l'authentification : c'est une décision du lot L3, pas du schéma.
    const ligne = await base.avecPerimetre(
      applicatif,
      perimetre('systeme', A, [A]),
      async (c) => {
        await c.query(
          `insert into journal_audit (filiale_id, action, utilisateur_libelle, resume)
               values ($1, 'connexion_echouee', 'compte-inconnu', 'sans compte T3')`,
          [A],
        );
        return (await c.query(
          "select utilisateur_id, utilisateur_libelle from journal_audit where resume = 'sans compte T3'",
        )).rows[0];
      },
    );
    assert.deepEqual(ligne, { utilisateur_id: null, utilisateur_libelle: 'compte-inconnu' });
  });
});

/* =====================================================================
 *  §18.4 — Un garde-fou que rien n'appelle est un commentaire
 * =====================================================================
 *
 *  Constat T-4, et c'est le plus embarrassant : `f_verifier_couverture_rls()` était
 *  écrite, correcte, testée, montrée à l'auditeur — et appelée par la seule migration 004.
 *  Sur une base à jour les migrations ne sont pas rejouées : le garde-fou ne s'exécutait
 *  donc plus jamais. Une migration postérieure créant une table sans politique passait
 *  avec un code de sortie zéro.
 *
 *  Les tests ci-dessous vérifient les deux moitiés : que le point d'appel agrège bien les
 *  trois contrôles, et — c'est celle qui manquait — que les quatre migrations l'appellent
 *  RÉELLEMENT. La part « déploiement » (`migrate.mjs`, `install.sh` §9) est hors de ce
 *  fichier et revient à un autre agent.
 */

describe('Le garde-fou de schéma est branché (CONVENTIONS §18.4)', () => {
  test('f_verifier_schema() ne signale rien sur un schéma sain', async () => {
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('elle AGRÈGE bien les trois contrôles — chacun éprouvé par sabotage', async () => {
    /** Anomalies rendues par le point d'appel unique, pour un objet donné. */
    const vues = async (objet) =>
      (await base.lignes(
        proprietaire,
        'select controle, anomalie from f_verifier_schema() where objet like $1 order by 1, 2',
        [objet],
      )).map((l) => `${l.controle}/${l.anomalie}`);

    // 1. couverture RLS — la table neuve sans politique, le scénario exact de T-4.
    await proprietaire.query('create table essai_t4_sans_politique (id text primary key)');
    try {
      assert.deepEqual(await vues('essai_t4%'), [
        'couverture_rls/force_absente',
        'couverture_rls/politique_ecriture_absente',
        'couverture_rls/politique_lecture_absente',
        'couverture_rls/rls_desactivee',
      ]);
    } finally {
      await proprietaire.query('drop table essai_t4_sans_politique');
    }

    // 2. chemin de recherche — une fonction sans réglage.
    await proprietaire.query(
      "create function f_essai_t4() returns int language sql immutable as $x$ select 1 $x$",
    );
    try {
      assert.deepEqual(await vues('f_essai_t4%'), ['chemin_recherche/search_path_non_fige']);
    } finally {
      await proprietaire.query('drop function if exists f_essai_t4()');
    }

    // 3. traçabilité — une table qui porte « cree_par » sans son déclencheur.
    await proprietaire.query(
      "create table essai_t4_trace (id text primary key, cree_par text not null default 'x')",
    );
    try {
      assert.ok(
        (await vues('essai_t4_trace')).includes('tracabilite/creation_non_tracee'),
        'Le point d’appel doit remonter aussi les anomalies de traçabilité.',
      );
    } finally {
      await proprietaire.query('drop table essai_t4_trace');
    }

    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('LES QUATRE MIGRATIONS L’APPELLENT — c’est la moitié qui manquait', async () => {
    // Le défaut n'était pas dans la fonction, il était dans son absence d'appel. Ce test
    // lit les migrations sur le disque : c'est le seul endroit du banc d'essai où la
    // propriété « le contrôle est branché » puisse être établie. Une migration future qui
    // créerait des tables sans recopier ces deux instructions le fera tomber.
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

    const manquantes = [];
    for (const fichier of [
      '001_socle.sql', '002_metier_noyau.sql', '003_metier_operations.sql', '004_rls.sql',
    ]) {
      const texte = await readFile(join(dossier, fichier), 'utf8');
      const appelle = texte.includes('from f_verifier_schema()');
      const pose = texte.includes('f_poser_tracabilite_insertion()');
      const echoue = /raise exception[\s\S]{0,400}Vérification du schéma en défaut/.test(texte);
      if (!appelle || !pose || !echoue) {
        manquantes.push(`${fichier} (appel:${appelle} pose:${pose} échec:${echoue})`);
      }
    }
    assert.deepEqual(manquantes, []);
  });

  test('T-10 : le garde-fou du chemin exige pg_temp NOMMÉ ET EN DERNIER', async () => {
    // Il ne vérifiait que la première moitié : « set search_path = pg_temp, pg_catalog,
    // public » — qui ne ferme évidemment rien — passait sans un mot. Un garde-fou qui
    // affirme plus qu'il ne vérifie est précisément ce que le §17.5 proscrit.
    await proprietaire.query(
      'create function f_essai_ordre() returns int language sql immutable '
        + 'set search_path = pg_temp, pg_catalog, public as $x$ select 1 $x$',
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_chemin_recherche() where objet like 'f_essai_ordre%'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['pg_temp_mal_place']);
    } finally {
      await proprietaire.query('drop function if exists f_essai_ordre()');
    }
  });

  test('T-10 bis : et il balaie aussi les PROCÉDURES', async () => {
    await proprietaire.query(
      'create procedure p_essai_t10() language sql as $x$ select 1 $x$',
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_chemin_recherche() where objet like 'p_essai_t10%'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['search_path_non_fige']);
    } finally {
      await proprietaire.query('drop procedure if exists p_essai_t10()');
    }
  });

  test('T-11 : le garde-fou de couverture balaie aussi les tables PARTITIONNÉES', async () => {
    // Le commentaire de la fonction dit « TOUTE table du schéma public » ; elle ne
    // regardait que relkind = 'r'. Il n'y a aucune table partitionnée aujourd'hui — le
    // filet ne doit pas attendre la première.
    await proprietaire.query(
      "create table essai_t11 (id text not null, jour date not null) partition by range (jour)",
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_couverture_rls() where objet = 'essai_t11' order by 1",
      );
      assert.ok(
        anomalies.map((l) => l.anomalie).includes('rls_desactivee'),
        `Une table partitionnée sans RLS doit être vue : ${JSON.stringify(anomalies)}`,
      );
    } finally {
      await proprietaire.query('drop table if exists essai_t11');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  T-6 — Ce que le refus des tables de configuration ne dit PAS
 * ===================================================================== */

describe('Refus silencieux sur les tables de configuration (constat T-6)', () => {
  test('l’AJOUT est bruyant, la MODIFICATION et la SUPPRESSION sont muettes', async () => {
    // Les migrations posent à trois endroits le principe que le refus doit être BRUYANT.
    // Les cinq tables de configuration ne le suivent qu'à moitié, et c'est inhérent à la
    // RLS : le « using » d'une politique ÉCARTE la ligne, il ne refuse pas l'opération.
    //
    // Ce test ne célèbre pas la propriété, il la FIGE — pour que le lot L2 sache qu'un
    // « UPDATE 0 » sur ces tables peut vouloir dire « refusé » et non « conflit de
    // version », et n'affiche pas « enregistré ». C'est le pendant de l'observation O-2 du
    // premier rapport, sur les tables de configuration.
    const observe = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query('savepoint avant_ajout');
      const ajout = await erreurAttendue(
        c.query("insert into profils (id, code, nom) values ('PROF-T6', 'ZZT6', 'x')"),
      );
      await c.query('rollback to savepoint avant_ajout');
      const modif = (await c.query("update filiales set nom_court = 'X' where id = $1", [A])).rowCount;
      const suppr = (await c.query('delete from filiales where id = $1', [B])).rowCount;
      return { ajout: ajout.code, modif, suppr };
    });
    assert.deepEqual(observe, { ajout: '42501', modif: 0, suppr: 0 });
  });
});

/* =====================================================================
 *  §19.1 — Une unicité contourne la RLS exactement comme une clé étrangère
 * =====================================================================
 *
 *  Constat Q-2 du quatrième passage de la porte S1, le plus grave des quatre passages,
 *  et il vise le cœur du produit. Le §17.1 énonçait une vérité générale — PostgreSQL
 *  applique ses contrôles d'intégrité EN DEHORS des politiques — et ne l'appliquait
 *  qu'aux clés étrangères. Les unicités la subissent à l'identique.
 *
 *  Ce qui en découle n'est pas une fuite mais un EMPÊCHEMENT, et c'est une catégorie que
 *  la grille de la porte ne demandait nulle part : « B ne voit pas les lignes de A » ne
 *  dit rien de « A ne peut rien empêcher chez B ».
 */

describe('Unicités et cloisonnement (CONVENTIONS §19.1)', () => {
  test('Q-2 : une étape d’approbation de Toulouse ne bloque plus celle de l’Allemagne', async () => {
    // approbations.objet_id est un rattachement POLYMORPHE, sans clé étrangère : rien
    // n'oblige l'objet visé à appartenir à la filiale qui écrit. Toulouse pose donc
    // « acceptation n°1 du risque RISK-B » en la rattachant à SA filiale — parfaitement
    // valide de son point de vue — et l'Allemagne se retrouvait dans l'impossibilité
    // DÉFINITIVE d'ouvrir l'acceptation de son propre risque résiduel, celle que
    // l'ISO 27001 exige nommément. L'étape de Toulouse est irrévocable (GRC02).
    const etape = (id, filiale) =>
      `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre)
           values ('${id}', '${filiale}', 'risque', 'RISK-B', 'acceptation', 1)`;

    const observe = await base.avecPerimetre(applicatif, rssiGroupe(A), async (c) => {
      await c.query(etape('APPRO-Q2-A', A));
      await c.query("select set_config('grc.filiale_id', $1, true)", [B]);
      try {
        await c.query(etape('APPRO-Q2-B', B));
        return 'AUCUN REFUS';
      } catch (erreur) {
        return erreur.code;
      }
    });
    assert.equal(
      observe,
      'AUCUN REFUS',
      'L’Allemagne doit pouvoir ouvrir SON acceptation de risque résiduel.',
    );
  });

  test('LE CORRECTIF MORD : sans filiale_id dans l’unicité, l’Allemagne est bloquée', async () => {
    // Contrôle de morsure : on remet l'unicité dans sa forme d'origine et on rejoue le
    // scénario. Sans ce contrôle, le test précédent passerait aussi bien sur une base
    // où rien n'a été corrigé — c'est un test qui doit prouver un CHANGEMENT.
    await proprietaire.query('alter table approbations drop constraint uq_approbations_etape');
    await proprietaire.query(
      'alter table approbations add constraint uq_approbations_etape '
        + 'unique (objet_type, objet_id, etape, ordre)',
    );
    try {
      const observe = await base.avecPerimetre(applicatif, rssiGroupe(A), async (c) => {
        await c.query(
          `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre)
               values ('APPRO-Q2-A', $1, 'risque', 'RISK-B', 'acceptation', 1)`,
          [A],
        );
        await c.query("select set_config('grc.filiale_id', $1, true)", [B]);
        try {
          await c.query(
            `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre)
                 values ('APPRO-Q2-B', $1, 'risque', 'RISK-B', 'acceptation', 1)`,
            [B],
          );
          return 'AUCUN REFUS';
        } catch (erreur) {
          // Le « detail » est supprimé par PostgreSQL : la ligne en conflit n'est pas
          // visible sous RLS. L'Allemagne reçoit un doublon qui ne montre rien.
          return `${erreur.code}/${erreur.detail ?? 'sans detail'}`;
        }
      });
      assert.equal(observe, '23505/sans detail');
    } finally {
      await proprietaire.query('alter table approbations drop constraint uq_approbations_etape');
      await proprietaire.query(
        'alter table approbations add constraint uq_approbations_etape '
          + 'unique (filiale_id, objet_type, objet_id, etape, ordre)',
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('le balayage du catalogue ne signale rien — et il balaie vraiment', async () => {
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_unicite_cloisonnee()'), []);

    // Le contrôle ne vaut que si le balayage a de la matière : on compte ce qu'il voit.
    const { n } = (await base.lignes(
      proprietaire,
      `select count(*)::int as n
         from pg_index ix
         join pg_class c on c.oid = ix.indrelid
         join pg_namespace ns on ns.oid = c.relnamespace
         left join pg_constraint con on con.conindid = ix.indexrelid and con.contype in ('u','p','x')
        where ns.nspname = 'public' and c.relkind in ('r','p')
          and (ix.indisunique or con.contype = 'x') and not ix.indisprimary
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                       and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped)`,
    ))[0];
    assert.ok(n >= 20, `Balayage suspect : ${n} unicité(s) seulement sur les tables cloisonnées.`);
  });

  test('LE BALAYAGE MORD : unicité, index unique nu, et contrainte d’EXCLUSION', async () => {
    // Trois formes, parce que trois formes existent et que le §19.1 les nomme toutes.
    // La troisième — l'exclusion — n'a aujourd'hui aucun représentant dans le schéma :
    // le filet ne doit pas attendre le premier.
    const vues = async () =>
      (await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_unicite_cloisonnee() where objet like '%essai%' order by 1",
      )).map((l) => `${l.objet}/${l.anomalie}`);

    await proprietaire.query('alter table clients add constraint uq_essai_q2 unique (secteur)');
    await proprietaire.query('create unique index uq_essai_q2_nu on risques (description)');
    await proprietaire.query(
      'alter table risques add constraint xq_essai_q2 exclude using btree (niveau with =)',
    );
    try {
      assert.deepEqual(await vues(), [
        'clients.uq_essai_q2/unicite_transfrontaliere',
        'risques.uq_essai_q2_nu/unicite_transfrontaliere',
        'risques.xq_essai_q2/unicite_transfrontaliere',
      ]);

      // Et elles remontent par le POINT D'APPEL, pas seulement par appel direct : c'est
      // la leçon T-4, rejouée sur un garde-fou qui n'existait pas quand elle a été écrite.
      const parLePoint = await base.lignes(
        proprietaire,
        "select distinct controle from f_verifier_schema() where objet like '%essai_q2%'",
      );
      assert.deepEqual(parLePoint.map((l) => l.controle), ['unicite_cloisonnee']);

      // Contrôle symétrique : la même unicité, avec filiale_id, ne déclenche rien.
      await proprietaire.query('alter table clients drop constraint uq_essai_q2');
      await proprietaire.query(
        'alter table clients add constraint uq_essai_q2 unique (filiale_id, secteur)',
      );
      assert.deepEqual(await vues(), [
        'risques.uq_essai_q2_nu/unicite_transfrontaliere',
        'risques.xq_essai_q2/unicite_transfrontaliere',
      ]);
    } finally {
      await proprietaire.query('alter table clients drop constraint if exists uq_essai_q2');
      await proprietaire.query('drop index if exists uq_essai_q2_nu');
      await proprietaire.query('alter table risques drop constraint if exists xq_essai_q2');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('une exemption devenue introuvable est RÉCLAMÉE, pas oubliée', async () => {
    // Cinq unicités sont délibérément globales et nommées dans la fonction. Une liste
    // écrite à la main n'est admise que si le garde-fou vérifie qu'elle reste juste
    // (CONVENTIONS §19.5) : sinon la dérogation couvrirait, en silence, la prochaine
    // contrainte qui reprendrait ce nom.
    await proprietaire.query('alter table pieces_jointes drop constraint uq_pieces_jointes_chemin');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_unicite_cloisonnee() where anomalie = 'exemption_obsolete'",
      );
      assert.deepEqual(anomalies, [
        { objet: 'uq_pieces_jointes_chemin', anomalie: 'exemption_obsolete' },
      ]);
    } finally {
      await proprietaire.query(
        'alter table pieces_jointes add constraint uq_pieces_jointes_chemin unique (chemin_stockage)',
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('les CLÉS PRIMAIRES sont hors périmètre, et c’est une décision épinglée ici', async () => {
    // Elles portent l'identifiant métier seul, globalement unique par construction, et
    // c'est ce qui rend l'import d'un « grc-backup » exact au round-trip et le
    // rattachement polymorphe possible. Les rendre composites casserait les deux.
    // Ce qui subsiste est l'oracle d'existence (constats T-8 puis O-4), reporté au lot L2.
    // Ce test tombera le jour où quelqu'un élargira le balayage sans arbitrer ce report.
    const { n } = (await base.lignes(
      proprietaire,
      `select count(*)::int as n
         from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace ns on ns.oid = c.relnamespace
        where ns.nspname = 'public' and con.contype = 'p'
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid
                       and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped)
          and not exists (select 1 from unnest(con.conkey) k(att)
                           join pg_attribute a on a.attrelid = c.oid and a.attnum = k.att
                          where a.attname = 'filiale_id')`,
    ))[0];
    assert.ok(n >= 24, `Balayage suspect : ${n} clé(s) primaire(s) globale(s).`);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_unicite_cloisonnee()'), []);
  });
});

/* =====================================================================
 *  §19.2 — L'identifiant de la sentinelle système est réservé
 * =====================================================================
 *
 *  Constat Q-3. `f_utilisateur_courant()` rend « systeme » hors session : migrations,
 *  timers, démarrage du service, échec d'authentification. Rien n'empêchait de créer un
 *  COMPTE portant cet identifiant — et le provisionnement automatique depuis l'AD suffit
 *  à le faire sans qu'aucun humain le décide.
 */

describe('La sentinelle « systeme » est réservée (CONVENTIONS §19.2)', () => {
  test('elle est refusée, quelle que soit la casse et les espaces de bordure', async () => {
    const observe = {};
    await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query("select set_config('grc.administration_groupe', 'oui', true)");
      let i = 0;
      for (const forme of ['systeme', 'SYSTEME', 'SysTeme', '  systeme  ', 'systeme2']) {
        i += 1;
        await c.query('savepoint avant_compte');
        try {
          await c.query(
            'insert into utilisateurs (id, identifiant, nom_affichage) values ($1, $2, $3)',
            [`USR-Q3-${i}`, forme, 'Compte forgé'],
          );
          observe[forme] = 'AUCUN REFUS';
        } catch (erreur) {
          observe[forme] = erreur.code;
        }
        await c.query('rollback to savepoint avant_compte');
      }
    });
    assert.deepEqual(observe, {
      systeme: '23514',
      SYSTEME: '23514',
      SysTeme: '23514',
      '  systeme  ': '23514',
      // Contrôle symétrique : sans lui, une contrainte qui refuserait TOUT passerait.
      systeme2: 'AUCUN REFUS',
    });
  });

  test('la sentinelle et la contrainte disent le MÊME mot', async () => {
    // La contrainte porte un littéral ; la sentinelle est écrite dans une autre fonction,
    // dans une autre section du même fichier. Changer l'une sans l'autre rouvrirait la
    // capture en silence : ce test relie les deux.
    const sentinelle = await base.avecPerimetre(
      applicatif,
      { utilisateur: '', filialeId: A, filiales: [A] },
      async (c) => (await c.query('select f_utilisateur_courant() as v')).rows[0].v,
    );
    assert.equal(sentinelle, 'systeme');

    const definition = await base.valeur(
      proprietaire,
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'utilisateurs'::regclass
          and conname = 'ck_utilisateurs_identifiant_reserve'`,
    );
    assert.ok(
      definition && definition.includes(`'${sentinelle}'`),
      `La contrainte doit réserver exactement la sentinelle « ${sentinelle} » : ${definition}`,
    );
  });

  test('LE CORRECTIF MORD : sans la contrainte, le journal attribue le système à une personne', async () => {
    // Le scénario complet, joué. C'est la pathologie du §17.8 atteinte par l'autre bout :
    // au lieu de DÉCLARER l'acteur, on CAPTURE la sentinelle — et le journal reste
    // parfaitement chaîné, sa vérification ne signale rien, l'imputation seule est fausse.
    await proprietaire.query(
      'alter table utilisateurs drop constraint ck_utilisateurs_identifiant_reserve',
    );
    try {
      const capture = await base.avecPerimetre(
        applicatif,
        { utilisateur: '', filialeId: A, filiales: [A] },
        async (c) => {
          await c.query("select set_config('grc.administration_groupe', 'oui', true)");
          await c.query(
            `insert into utilisateurs (id, identifiant, nom_affichage)
                 values ('USR-Q3-CAPTURE', 'systeme', 'Marc Dupuis (DG)')`,
          );
          await c.query("select set_config('grc.administration_groupe', '', true)");
          await c.query(
            `insert into journal_audit (filiale_id, action, resume)
                 values ($1, 'demarrage', 'evenement du service, sans session')`,
            [A],
          );
          const r = await c.query(
            "select utilisateur_id from journal_audit where resume = 'evenement du service, sans session'",
          );
          return r.rows[0].utilisateur_id;
        },
      );
      assert.equal(
        capture,
        'USR-Q3-CAPTURE',
        'Sans la contrainte, tout événement système est attribué au compte qui a capté la sentinelle.',
      );
    } finally {
      await proprietaire.query(
        "alter table utilisateurs add constraint ck_utilisateurs_identifiant_reserve "
          + "check (lower(btrim(identifiant)) <> 'systeme')",
      );
    }
  });
});

/* =====================================================================
 *  §19.5 — Un garde-fou DÉCOUVRE son périmètre, il ne le récite pas
 * =====================================================================
 *
 *  Constat Q-5. `f_verifier_couverture_rls()` n'exigeait un prédicat cloisonnant d'une
 *  table sans filiale_id que si elle figurait dans une liste de SIX noms. Il y en avait
 *  sept : `import_erreurs` échappait entièrement au garde-fou, et sa politique de lecture
 *  ramenée à « true » ne remontait aucune anomalie. Troisième défaut produit par une
 *  liste écrite à la main, après les sept clés de B-1 et les déclencheurs d'insertion.
 */

describe('Le garde-fou de couverture découvre son périmètre (CONVENTIONS §19.5)', () => {
  test('Q-5 : import_erreurs est bien cloisonnée, et Toulouse ne voit pas celles de l’Allemagne', async () => {
    const vues = await compter(
      applicatif,
      rssiSite(A),
      "select count(*)::int as n from import_erreurs where import_id = 'IMP-B'",
    );
    assert.equal(vues, 0);
    const siennes = await compter(
      applicatif,
      rssiSite(A),
      "select count(*)::int as n from import_erreurs where import_id = 'IMP-A'",
    );
    assert.equal(siennes, 1, 'Contrôle symétrique : Toulouse voit bien les siennes.');
  });

  test('LE GARDE-FOU MORD DÉSORMAIS SUR ELLE : la mutation qui passait est signalée', async () => {
    // La mutation exacte du quatrième passage : elle rendait « 0 anomalie » sur une table
    // que toutes les filiales lisaient. Or 003 dit d'elle qu'« une ligne d'erreur cite le
    // contenu du fichier importé » — un import de l'annuaire ou du registre RGPD y dépose
    // des noms et des adresses verbatim.
    await proprietaire.query('drop policy pol_import_erreurs_lecture on import_erreurs');
    await proprietaire.query(
      'create policy pol_import_erreurs_lecture on import_erreurs for select using (true)',
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_couverture_rls() where objet = 'import_erreurs' order by 1",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['lecture_non_cloisonnee']);
    } finally {
      await proprietaire.query('drop policy pol_import_erreurs_lecture on import_erreurs');
      await proprietaire.query(
        `create policy pol_import_erreurs_lecture on import_erreurs for select
             using (exists (select 1 from imports i
                             where i.id = import_erreurs.import_id
                               and i.filiale_id = any (f_filiales_autorisees())))`,
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('une exemption renommée est réclamée, ET la table renommée est soumise', async () => {
    // Une seule mutation, deux propriétés : la liste des exemptions ne se périme pas en
    // silence, et ce qui en sort tombe aussitôt sous le régime commun.
    await proprietaire.query('alter table session_domaines rename to session_domaines_essai');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        `select objet, anomalie from f_verifier_couverture_rls()
          where objet like 'session_domaines%' order by 1, 2`,
      );
      assert.deepEqual(anomalies, [
        { objet: 'session_domaines', anomalie: 'exemption_obsolete' },
        { objet: 'session_domaines_essai', anomalie: 'ecriture_non_cloisonnee' },
        { objet: 'session_domaines_essai', anomalie: 'lecture_non_cloisonnee' },
      ]);
    } finally {
      await proprietaire.query('alter table session_domaines_essai rename to session_domaines');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('la liste des tables NON cloisonnées est exactement celle qui est arbitrée', async () => {
    // Constaté depuis le catalogue, sans passer par le garde-fou : celui-ci se
    // vérifierait lui-même (§17.5). Toute table sans filiale_id qui viendrait s'ajouter —
    // comme import_erreurs le faisait — fait tomber ce test, et c'est le but.
    const ouvertes = await base.lignes(
      proprietaire,
      `select c.relname as nom
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and not exists (select 1 from pg_attribute a where a.attrelid = c.oid
                           and a.attname = 'filiale_id' and a.attnum > 0 and not a.attisdropped)
          and exists (select 1 from pg_policy p
                       where p.polrelid = c.oid and p.polpermissive and p.polcmd in ('r', '*')
                         and coalesce(pg_get_expr(p.polqual, p.polrelid), 'true')
                             !~ '(f_filiales_lecture|f_filiales_autorisees)')
        order by 1`,
    );
    assert.deepEqual(ouvertes.map((l) => l.nom), [
      'filiales',
      'mapping_exigences',
      'mappings',
      'migrations_schema',
      'profil_domaines',
      'profils',
      'session_domaines',
      'sessions',
      'utilisateurs',
    ]);
  });
});

/* =====================================================================
 *  §19.4 — Le point d'appel DÉCOUVRE ses contrôles
 * =====================================================================
 *
 *  Constat Q-1, et sa leçon de forme : tant que le branchement est une liste à maintenir,
 *  il se désynchronise. `f_verifier_schema()` énumérait trois fonctions ; le présent
 *  correctif en ajoute une quatrième. Elle est découverte dans le catalogue.
 *
 *  (La part « déploiement » — `migrate.mjs`, `install.sh` — est hors de ce fichier.)
 */

describe('Le point d’appel unique découvre ses contrôles (CONVENTIONS §19.4)', () => {
  test('les garde-fous du dépôt sont TOUS découverts', async () => {
    // La découverte protège de l'omission d'un contrôle NEUF ; elle ne protège pas de la
    // disparition d'un contrôle existant, qui s'effacerait sans bruit de l'agrégation.
    // C'est ici que cette seconde moitié est tenue.
    const controles = await base.lignes(
      proprietaire,
      `select substring(p.proname::text from '^f_verifier_(.+)$') as controle
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and p.proname::text like 'f\\_verifier\\_%' and p.pronargs = 0
          and pg_get_function_result(p.oid) = 'TABLE(objet text, anomalie text, detail text)'
        order by 1`,
    );
    // Quatre au cinquième correctif, sept au sixième, HUIT depuis le troisième passage de
    // la porte S2 (entropie_identifiants). Chacun s'est branché SANS qu'un fichier de
    // déploiement change : c'est la propriété du §19.4, constatée plutôt qu'affirmée.
    // Cette liste est délibérément ÉPINGLÉE : un garde-fou qui apparaît doit être
    // reconnu ici, un garde-fou qui disparaît ne doit pas s'effacer en silence.
    assert.deepEqual(controles.map((l) => l.controle), [
      'armement',
      'chemin_recherche',
      'couverture_rls',
      'entropie_identifiants',
      'portee_figee',
      'privileges',
      'tracabilite',
      'unicite_cloisonnee',
    ]);
  });

  test('un garde-fou NEUF est branché sans qu’aucun fichier change', async () => {
    // C'est toute la propriété : respecter la convention d'écriture suffit à être joué,
    // par le déploiement comme par la recette. Aucune liste à retoucher, donc aucune
    // occasion d'oublier.
    await proprietaire.query(
      `create function f_verifier_essai_q1() returns table (objet text, anomalie text, detail text)
           language plpgsql stable set search_path = pg_catalog, public, pg_temp as $x$
       begin
           objet := 'objet_d_essai'; anomalie := 'anomalie_d_essai'; detail := 'inventée';
           return next;
       end; $x$`,
    );
    try {
      const vues = await base.lignes(
        proprietaire,
        "select controle, objet, anomalie from f_verifier_schema() where objet = 'objet_d_essai'",
      );
      assert.deepEqual(vues, [
        { controle: 'essai_q1', objet: 'objet_d_essai', anomalie: 'anomalie_d_essai' },
      ]);
    } finally {
      await proprietaire.query('drop function if exists f_verifier_essai_q1()');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('un point d’appel qui ne trouve PLUS RIEN le dit, au lieu de rassurer', async () => {
    // Le pire résultat possible pour un garde-fou : rendre « aucune anomalie » sur une
    // base entièrement sabotée. On renomme les quatre contrôles hors de la convention.
    // La liste des noms est DÉCOUVERTE, pas recopiée : un huitième garde-fou n'obligera
    // pas à retoucher ce test, et son oubli ne le ferait pas passer à tort.
    const noms = (await base.lignes(
      proprietaire,
      `select p.proname as nom
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.pronargs = 0
          and p.proname::text like 'f\\_verifier\\_%'
          and pg_get_function_result(p.oid) = 'TABLE(objet text, anomalie text, detail text)'`,
    )).map((l) => l.nom);
    assert.ok(noms.length >= 4, `Balayage suspect : ${noms.length} garde-fou(x).`);
    for (const nom of noms) {
      await proprietaire.query(`alter function ${nom}() rename to z_essai_${nom}`);
    }
    try {
      const vues = await base.lignes(
        proprietaire,
        'select controle, objet, anomalie from f_verifier_schema()',
      );
      assert.deepEqual(vues, [
        {
          controle: 'point_appel',
          objet: 'f_verifier_schema',
          anomalie: 'aucun_controle_decouvert',
        },
      ]);
    } finally {
      for (const nom of noms) {
        await proprietaire.query(`alter function z_essai_${nom}() rename to ${nom}`);
      }
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  /* ─────────────────────────────────────────────────────────────────────────
   *  Q-5 — Le point d'appel dit quand il ne trouve PLUS RIEN.
   *        Il ne dit rien quand il trouve MOINS.
   *
   *  Le test précédent est la moitié facile : on renomme les huit contrôles, il
   *  n'en reste aucun, et `f_verifier_schema()` le dit. La moitié qui compte est
   *  celle-ci — un SEUL contrôle sort de la convention, les sept autres tournent,
   *  et le point d'appel rend « aucune anomalie » sur une base où la RLS est
   *  tombée. C'est le motif que le chantier a payé quatre fois, retourné : la
   *  découverte supprime l'oubli à l'ajout, et l'introduit au retrait.
   *
   *  Aucune malveillance n'est requise. Une migration qui renomme une fonction,
   *  ou qui lui ajoute un argument par défaut, suffit — et elle passe la revue,
   *  puisqu'elle ne touche pas au contrôle lui-même.
   * ───────────────────────────────────────────────────────────────────────── */

  /** Ce que « node db/migrate.mjs --verifier » conclut de l'état courant de la base. */
  async function verifierParLOutil() {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const issue = await promisify(execFile)(
      process.execPath,
      [join(racine, 'db', 'migrate.mjs'), '--verifier'],
      {
        env: {
          ...process.env,
          BASE_NOM: base.nom,
          BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
          BASE_PORT: process.env.BASE_PORT ?? '5432',
          BASE_UTILISATEUR_PROPRIETAIRE: process.env.BASE_UTILISATEUR_PROPRIETAIRE ?? 'grc_proprietaire',
          BASE_MOT_DE_PASSE_PROPRIETAIRE: process.env.BASE_MOT_DE_PASSE_PROPRIETAIRE ?? 'dev',
        },
        cwd: racine,
      },
    ).catch((erreur) => erreur);
    return { code: issue.code ?? 0, sortie: `${issue.stdout ?? ''}${issue.stderr ?? ''}` };
  }

  /** Coupe la RLS sur « risques », joue quelque chose, puis remet tout en place. */
  async function avecRlsTombee(action) {
    await proprietaire.query('alter table risques no force row level security');
    try {
      return await action();
    } finally {
      await proprietaire.query('alter table risques force row level security');
    }
  }

  test('CONTRÔLE SYMÉTRIQUE : le garde-fou EN PLACE voit bien la RLS tomber', async () => {
    // Sans cette moitié, le test suivant serait satisfait par une brèche qui n'en
    // est pas une : on ne saurait pas si le silence vient du garde-fou disparu ou
    // d'un sabotage sans effet.
    const vues = await avecRlsTombee(async () =>
      base.lignes(proprietaire, "select controle, objet, anomalie from f_verifier_schema() where objet = 'risques'"),
    );
    assert.ok(
      vues.some((l) => l.controle === 'couverture_rls'),
      `La brèche doit être VISIBLE tant que le contrôle est là : ${JSON.stringify(vues)}`,
    );
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('un garde-fou qui CESSE d’être découvert ne doit pas s’effacer en silence (constat Q-5)', async () => {
    // Le geste : on sort UN contrôle de la convention de nommage. C'est ce que fait
    // une migration qui renomme — pas une attaque, une maintenance ordinaire.
    const avant = (await base.lignes(
      proprietaire,
      `select p.proname as nom
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and p.pronargs = 0
          and p.proname::text like 'f\\_verifier\\_%'
          and pg_get_function_result(p.oid) = 'TABLE(objet text, anomalie text, detail text)'`,
    )).map((l) => l.nom);
    assert.ok(avant.includes('f_verifier_couverture_rls'), 'Le contrôle visé doit exister au départ.');

    await proprietaire.query(
      'alter function f_verifier_couverture_rls() rename to zz_essai_q5_couverture_rls',
    );
    try {
      // Le point d'appel en trouve un de moins, et sept sur huit tournent encore :
      // il ne peut donc pas s'en remettre à « aucun contrôle découvert ».
      const restants = await base.valeur(
        proprietaire,
        `select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prokind = 'f' and p.pronargs = 0
            and p.proname::text like 'f\\_verifier\\_%'
            and pg_get_function_result(p.oid) = 'TABLE(objet text, anomalie text, detail text)'`,
      );
      assert.equal(Number(restants), avant.length - 1, 'Exactement un contrôle doit avoir disparu.');

      // Les deux observations sont prises AVANT d'être jugées : le message doit
      // pouvoir nommer ce que le point d'appel a rendu ET ce que l'outil de
      // déploiement en a conclu — c'est ce second verdict que lit un exploitant.
      const { anomalies, deploiement } = await avecRlsTombee(async () => ({
        anomalies: await base.lignes(
          proprietaire,
          'select controle, objet, anomalie from f_verifier_schema()',
        ),
        deploiement: await verifierParLOutil(),
      }));

      // ── LA propriété ────────────────────────────────────────────────────
      // Peu importe la forme du signalement — la disparition du contrôle, ou la
      // brèche qu'il aurait vue. Ce qui est interdit, c'est le silence : un
      // garde-fou qui rend « aucune anomalie » sur une base où la RLS est tombée
      // ne vaut rien, et il rassure, ce qui est pire que de se taire.
      assert.notDeepEqual(
        anomalies,
        [],
        'Le point d’appel a rendu « aucune anomalie » alors qu’il joue SEPT contrôles sur ' +
          'huit et que la RLS de « risques » est tombée. Il sait pourtant combien il en ' +
          'avait trouvé la dernière fois : une diminution doit être une anomalie, comme ' +
          'l’absence totale en est déjà une.',
      );

      // Et le verdict qui compte pour une mise en service : l'outil doit refuser.
      // Un déploiement qui sort à zéro sur une base dont la RLS est tombée installe
      // le défaut et le certifie du même geste.
      assert.notEqual(
        deploiement.code,
        0,
        `« migrate.mjs --verifier » a rendu 0 sur une base dont la RLS de « risques » est ` +
          `tombée :\n${deploiement.sortie}`,
      );
    } finally {
      await proprietaire.query(
        'alter function zz_essai_q5_couverture_rls() rename to f_verifier_couverture_rls',
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  Q5-1 — Découvrir, c'est exécuter : le contrat de nommage est borné
 * =====================================================================
 *
 *  Le mécanisme de découverte livré au cinquième correctif est la bonne réponse au
 *  constat Q-1 : il supprime l'occasion de l'oubli. Mais il crée, du même geste, un point
 *  unique où tout converge — et `f_verifier_schema()` n'y LIT pas les fonctions
 *  découvertes, elle les EXÉCUTE. Le seul appelant qui détienne plus que le propriétaire
 *  est `deploy/install.sh`, qui joue son SQL sous `su postgres` : sans borne, une fonction
 *  plantée sortait de PostgreSQL avec les droits du compte UNIX `postgres`.
 */

describe('Le point d’appel n’exécute que ce qui est légitime (CONVENTIONS §19.4, Q5-1)', () => {
  /** Anomalies rendues par le point d'appel pour un objet donné. */
  const vues = async (objet) =>
    (await base.lignes(
      proprietaire,
      'select controle, anomalie from f_verifier_schema() where objet = $1 order by 1, 2',
      [objet],
    )).map((l) => `${l.controle}/${l.anomalie}`);

  test('une fonction VOLATILE qui porte le nom n’est pas jouée — et n’écrit donc rien', async () => {
    // Le scénario exact du cinquième passage : la greffe retirait « force row level
    // security » d'une table cloisonnée et forgeait une entrée du registre des migrations,
    // sous « migrate.mjs --verifier », en annonçant « aucune anomalie ».
    await proprietaire.query(
      `create function f_verifier_essai_q51() returns table (objet text, anomalie text, detail text)
           language plpgsql volatile set search_path = pg_catalog, public, pg_temp as $x$
       begin
           execute 'alter table public.risques no force row level security';
           return;
       end; $x$`,
    );
    try {
      assert.deepEqual(await vues('f_verifier_essai_q51'), ['point_appel/controle_non_conforme']);
      const forcee = await base.valeur(
        proprietaire,
        "select relforcerowsecurity from pg_class where relname = 'risques'",
      );
      assert.equal(forcee, true, 'La greffe ne doit pas avoir été exécutée.');
    } finally {
      await proprietaire.query('drop function if exists f_verifier_essai_q51()');
    }
  });

  test('les propriétés sont exigées SÉPARÉMENT : volatile, definer, chemin non figé', async () => {
    // Trois mutations, une par propriété. La quatrième — l'appartenance au propriétaire de
    // la base — ne peut pas être jouée ici : ni grc_app ni grc_lecture ne peuvent posséder
    // une fonction de « public » (ils n'y ont pas CREATE), et le banc d'essai n'ouvre
    // aucune connexion superutilisateur. C'est f_verifier_privileges() qui la tient, en
    // interdisant à quiconque d'autre de créer dans le schéma.
    const formes = {
      'language plpgsql volatile set search_path = pg_catalog, public, pg_temp': 'volatile',
      'language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp':
        'definer',
      'language plpgsql stable set search_path = pg_catalog, public': 'chemin',
    };
    for (const [entete, quoi] of Object.entries(formes)) {
      await proprietaire.query(
        `create function f_verifier_essai_q51() returns table (objet text, anomalie text, detail text)
             ${entete} as $x$ begin return; end; $x$`,
      );
      try {
        assert.deepEqual(
          await vues('f_verifier_essai_q51'),
          ['point_appel/controle_non_conforme'],
          `La propriété « ${quoi} » doit à elle seule écarter la fonction.`,
        );
      } finally {
        await proprietaire.query('drop function if exists f_verifier_essai_q51()');
      }
    }
    // Contrôle symétrique : la forme conforme, elle, est bel et bien JOUÉE.
    await proprietaire.query(
      `create function f_verifier_essai_q51() returns table (objet text, anomalie text, detail text)
           language plpgsql stable set search_path = pg_catalog, public, pg_temp as $x$
       begin objet := 'temoin'; anomalie := 'jouee'; detail := ''; return next; return; end; $x$`,
    );
    try {
      assert.deepEqual(await vues('temoin'), ['essai_q51/jouee']);
    } finally {
      await proprietaire.query('drop function if exists f_verifier_essai_q51()');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('« security definer » : le corps s’exécute sous le PROPRIÉTAIRE, pas sous l’appelant', async () => {
    // C'est l'abaissement de privilège qui ferme l'élévation hors de la base. Le banc
    // d'essai ne peut l'observer que dans le sens qui lui est accessible — le compte
    // applicatif appelle, et le corps s'exécute sous grc_proprietaire. Le sens qui compte
    // vraiment (« su postgres » redescendu au propriétaire) est le même mécanisme.
    await proprietaire.query(
      `create function f_verifier_essai_q51() returns table (objet text, anomalie text, detail text)
           language plpgsql stable set search_path = pg_catalog, public, pg_temp as $x$
       begin objet := current_user; anomalie := 'acteur'; detail := session_user;
             return next; return; end; $x$`,
    );
    try {
      const ligne = (await base.lignes(
        applicatif,
        "select objet, detail from f_verifier_schema() where anomalie = 'acteur'",
      ))[0];
      assert.equal(ligne.objet, 'grc_proprietaire', 'Le corps doit s’exécuter sous le propriétaire.');
      assert.equal(ligne.detail, 'grc_app', 'La session, elle, reste celle de l’appelant.');
    } finally {
      await proprietaire.query('drop function if exists f_verifier_essai_q51()');
    }
  });

  test('l’exécution du point d’appel n’est PAS accordée à PUBLIC', async () => {
    // Une fonction « security definer » exécutable par tout le monde serait le contraire
    // d'un abaissement de privilège.
    const publique = await base.valeur(
      proprietaire,
      `select exists (
           select 1 from (select (aclexplode(p.proacl)).* from pg_proc p
                           where p.oid = to_regprocedure('public.f_verifier_schema()')) g
            where g.grantee = 0 and g.privilege_type = 'EXECUTE')`,
    );
    assert.equal(publique, false);
    // Et les deux rôles qui en ont l'usage l'ont bien.
    for (const role of ['grc_app', 'grc_lecture']) {
      assert.equal(
        await base.valeur(
          proprietaire,
          "select has_function_privilege($1, 'public.f_verifier_schema()', 'EXECUTE')",
          [role],
        ),
        true,
        `${role} doit pouvoir jouer la démonstration de recette.`,
      );
    }
  });

  test('nul autre que le propriétaire ne peut CRÉER dans « public » — et le garde-fou le tient', async () => {
    for (const role of ['grc_app', 'grc_lecture']) {
      assert.equal(
        await base.valeur(proprietaire, "select has_schema_privilege($1, 'public', 'CREATE')", [role]),
        false,
        `${role} ne doit pas pouvoir planter une fonction dans public.`,
      );
    }
    // Contrôle de morsure : la porte rouverte doit être RÉCLAMÉE, pas constatée un jour
    // par hasard. PostgreSQL 15+ la ferme par défaut — rien ne garantissait qu'elle le reste.
    await proprietaire.query('grant create on schema public to grc_app');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie, detail from f_verifier_privileges() where objet = 'schema public'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['creation_schema_ouverte']);
      assert.match(anomalies[0].detail, /grc_app/);
    } finally {
      await proprietaire.query('revoke create on schema public from grc_app');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('db/migrate.mjs joue le garde-fou en transaction LECTURE SEULE', async () => {
    // La promesse de « --verifier » (« aucune écriture ») était fausse : elle reposait sur
    // la volatilité DÉCLARÉE des fonctions jouées. Une fonction déclarée « stable » qui
    // appelle une fonction volatile écrit quand même — PostgreSQL vérifie la volatilité de
    // la fonction COURANTE, pas de la pile. Ce test plante exactement ce contournement et
    // exige que l'outil, lui, refuse.
    await proprietaire.query(
      `create function zz_essai_q51_aide() returns void language plpgsql volatile
           set search_path = pg_catalog, public, pg_temp as $x$
       begin execute 'alter table public.risques no force row level security'; end; $x$`,
    );
    await proprietaire.query(
      `create function f_verifier_essai_q51() returns table (objet text, anomalie text, detail text)
           language plpgsql stable set search_path = pg_catalog, public, pg_temp as $x$
       begin perform zz_essai_q51_aide(); return; end; $x$`,
    );
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const { dirname, join } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

      const resultat = await promisify(execFile)(
        process.execPath,
        [join(racine, 'db', 'migrate.mjs'), '--verifier'],
        {
          // Mêmes valeurs par défaut que `test/aide/base.mjs` : le banc d'essai tourne sans
          // que ces variables soient posées, l'outil, lui, les exige.
          env: {
            ...process.env,
            BASE_NOM: base.nom,
            BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
            BASE_PORT: process.env.BASE_PORT ?? '5432',
            BASE_UTILISATEUR_PROPRIETAIRE:
              process.env.BASE_UTILISATEUR_PROPRIETAIRE ?? 'grc_proprietaire',
            BASE_MOT_DE_PASSE_PROPRIETAIRE:
              process.env.BASE_MOT_DE_PASSE_PROPRIETAIRE ?? 'dev',
          },
          cwd: racine,
        },
      ).catch((erreur) => erreur);

      const sortie = `${resultat.stdout ?? ''}${resultat.stderr ?? ''}`;
      assert.match(sortie, /read-only transaction/, `Sortie inattendue :\n${sortie}`);
      const forcee = await base.valeur(
        proprietaire,
        "select relforcerowsecurity from pg_class where relname = 'risques'",
      );
      assert.equal(forcee, true, '« --verifier » ne doit avoir écrit nulle part.');
    } finally {
      await proprietaire.query('drop function if exists f_verifier_essai_q51()');
      await proprietaire.query('drop function if exists zz_essai_q51_aide()');
      await proprietaire.query('alter table risques force row level security');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  Q5-2 — L'autre moitié de la traçabilité, et le risque projet n° 1
 * =====================================================================
 *
 *  Le §18.1 est né de ce que « f_maj_tracabilite() protégeait l'update, et l'insert
 *  n'était protégé par rien ». Le correctif a couvert l'insertion — et rien n'exigeait
 *  plus l'existence du déclencheur de MODIFICATION, qui porte le verrouillage optimiste.
 *  Trois déclencheurs retirés, et les quatre chemins de contrôle restaient verts pendant
 *  que deux écritures concurrentes sur la même version réussissaient toutes les deux.
 */

describe('Traçabilité en modification et verrouillage optimiste (§18.1, Q5-2)', () => {
  /**
   * Joue la concurrence RÉELLE : deux connexions, la seconde bloquée sur le verrou de
   * ligne jusqu'au « commit » de la première. Rend les deux nombres de lignes affectées.
   */
  async function ecrituresConcurrentes(id) {
    const a = await base.nouvelleConnexion('app');
    const b = await base.nouvelleConnexion('app');
    connexionsJetables.push(a, b);
    const poser = async (c) => {
      await c.query('begin');
      await c.query(
        `select set_config('grc.utilisateur', 'alice', true),
                set_config('grc.filiale_id',  $1, true),
                set_config('grc.filiales',    $1, true)`,
        [A],
      );
    };
    try {
      await poser(a);
      await poser(b);
      // A modifie et garde le verrou. B tente la même version : il BLOQUE.
      const rA = (await a.query(
        "update actions set titre = 'écriture d’Alice' where id = $1 and version = 1", [id],
      )).rowCount;
      const attenteB = b.query(
        "update actions set titre = 'écriture de Mallory' where id = $1 and version = 1", [id],
      );
      await a.query('commit');
      const rB = (await attenteB).rowCount;
      await b.query('commit');
      return { a: rA, b: rB };
    } finally {
      await a.query('rollback').catch(() => {});
      await b.query('rollback').catch(() => {});
    }
  }

  test('deux écritures CONCURRENTES sur la même version : une seule passe', async () => {
    await base.avecPerimetre(
      applicatif, rssiSite(A),
      async (c) => c.query(
        "insert into actions (id, filiale_id, titre) values ('ACT-P1-OK', $1, 'Chiffrer les postes')",
        [A],
      ),
      { annuler: false },
    );
    try {
      const { a, b } = await ecrituresConcurrentes('ACT-P1-OK');
      assert.deepEqual({ a, b }, { a: 1, b: 0 },
        'La seconde écriture porte une version périmée : elle ne doit affecter aucune ligne.');
      const version = await base.avecPerimetre(applicatif, rssiSite(A), async (c) =>
        (await c.query("select version from actions where id = 'ACT-P1-OK'")).rows[0].version);
      assert.equal(version, 2);
    } finally {
      await base.avecPerimetre(
        applicatif, rssiSite(A),
        async (c) => c.query("delete from actions where id = 'ACT-P1-OK'"),
        { annuler: false },
      );
    }
  });

  test('LE CORRECTIF MORD : sans le déclencheur de mise à jour, LES DEUX passent', async () => {
    // C'est la démonstration du constat, rejouée. Sans ce test, le précédent passerait
    // aussi bien sur une base où rien n'oblige le déclencheur à exister.
    await proprietaire.query('drop trigger trg_actions_maj on actions');
    await base.avecPerimetre(
      applicatif, rssiSite(A),
      async (c) => c.query(
        "insert into actions (id, filiale_id, titre) values ('ACT-P1-KO', $1, 'Chiffrer les postes')",
        [A],
      ),
      { annuler: false },
    );
    try {
      const { a, b } = await ecrituresConcurrentes('ACT-P1-KO');
      assert.deepEqual({ a, b }, { a: 1, b: 1 },
        'Sans le déclencheur, la seconde écriture écrase la première en silence (risque P1).');

      // Et le garde-fou, lui, doit le DIRE — c'est la moitié qui manquait.
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_tracabilite() where objet = 'actions'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['modification_non_tracee']);
      const parLePoint = await base.lignes(
        proprietaire,
        "select controle from f_verifier_schema() where objet = 'actions'",
      );
      assert.deepEqual(parLePoint.map((l) => l.controle), ['tracabilite']);
    } finally {
      await base.avecPerimetre(
        applicatif, rssiSite(A),
        async (c) => c.query("delete from actions where id = 'ACT-P1-KO'"),
        { annuler: false },
      );
      await proprietaire.query(
        'create trigger trg_actions_maj before update on actions '
          + 'for each row execute function f_maj_tracabilite()',
      );
      await proprietaire.query('alter table actions enable always trigger trg_actions_maj');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('cree_par et cree_le d’une ligne EXISTANTE ne se réécrivent pas', async () => {
    // Le §18.1 atteint par l'autre bout : l'insertion est protégée, et la modification
    // rendait l'antidatage possible — sur une ligne qui a déjà une histoire.
    const observe = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query(
        "insert into actions (id, filiale_id, titre) values ('ACT-ANTIDATE', $1, 'x')", [A],
      );
      await c.query(
        `update actions set titre = 'réécriture', cree_par = 'directeur general',
                            cree_le = '2019-01-01' where id = 'ACT-ANTIDATE'`,
      );
      return (await c.query(
        `select cree_par, cree_le::date::text as jour, modifie_par, version
           from actions where id = 'ACT-ANTIDATE'`,
      )).rows[0];
    });
    assert.equal(observe.cree_par, 'rssi-site');
    assert.equal(observe.jour, new Date().toISOString().slice(0, 10));
    assert.equal(observe.modifie_par, 'rssi-site');
    assert.equal(observe.version, 2);
  });

  test('le balayage exige les DEUX moitiés, sur les 42 et les 32 tables concernées', async () => {
    const { insertion, modification } = (await base.lignes(
      proprietaire,
      `select count(*) filter (where a.attname = 'cree_par')::int    as insertion,
              count(*) filter (where a.attname = 'modifie_par')::int as modification
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and a.attname in ('cree_par', 'modifie_par')`,
    ))[0];
    assert.ok(insertion >= 42, `Balayage suspect à l’insertion : ${insertion}.`);
    assert.ok(modification >= 32, `Balayage suspect à la modification : ${modification}.`);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_tracabilite()'), []);
  });
});

/* =====================================================================
 *  Q5-3 — La dimension que quatre passages avaient laissée : les colonnes
 * ===================================================================== */

describe('Le seul secret que le schéma stocke (§15 ter, Q5-3)', () => {
  test('aucun rôle de connexion ne lit l’empreinte du compte de secours', async () => {
    for (const role of ['grc_app', 'grc_lecture']) {
      assert.equal(
        await base.valeur(
          proprietaire,
          "select has_column_privilege($1, 'utilisateurs', 'mot_de_passe_hash', 'SELECT')",
          [role],
        ),
        false,
        `${role} ne doit pas lire un secret d’authentification.`,
      );
      // Contrôle symétrique : le reste de la table est resté ouvert. Fermer le secret ne
      // doit pas avoir rendu la table inutilisable.
      assert.equal(
        await base.valeur(
          proprietaire,
          "select has_column_privilege($1, 'utilisateurs', 'identifiant', 'SELECT')",
          [role],
        ),
        true,
      );
    }
    // L'ÉCRITURE reste entière : poser et faire tourner le secret est un droit du service.
    assert.equal(
      await base.valeur(
        proprietaire,
        "select has_column_privilege('grc_app', 'utilisateurs', 'mot_de_passe_hash', 'UPDATE')",
      ),
      true,
    );
  });

  test('en exécution : la colonne est refusée, la table reste lisible', async () => {
    const observe = await base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
      await c.query('savepoint avant_secret');
      const refus = await erreurAttendue(c.query('select mot_de_passe_hash from utilisateurs'));
      await c.query('rollback to savepoint avant_secret');
      const etoile = await erreurAttendue(c.query('select * from utilisateurs'));
      await c.query('rollback to savepoint avant_secret');
      const nommees = (await c.query('select id, identifiant from utilisateurs')).rowCount;
      return { refus: refus.code, etoile: etoile.code, nommees };
    });
    assert.equal(observe.refus, '42501');
    // « select * » développe TOUTES les colonnes, secret compris : il est refusé aussi, et
    // c'est une conséquence qu'un développeur de L2 doit connaître.
    assert.equal(observe.etoile, '42501');
    assert.ok(observe.nommees >= 0);
  });

  test('LE GARDE-FOU MORD, dans les DEUX sens', async () => {
    // Sens 1 : le secret redevient lisible.
    await proprietaire.query('grant select on utilisateurs to grc_lecture');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_privileges() where anomalie = 'secret_lisible'",
      );
      assert.deepEqual(anomalies, [
        { objet: 'utilisateurs.mot_de_passe_hash', anomalie: 'secret_lisible' },
      ]);
    } finally {
      await proprietaire.query('revoke select on utilisateurs from grc_lecture');
    }

    // Sens 2 : une colonne ORDINAIRE devenue illisible au service. C'est le défaut que ce
    // correctif aurait pu créer en fermant l'autre — une colonne ajoutée plus tard sans
    // « grant » resterait invisible, et ne se verrait qu'en production.
    await proprietaire.query('revoke select (identifiant) on utilisateurs from grc_app');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_privileges() "
          + "where anomalie = 'colonne_illisible_au_service'",
      );
      assert.deepEqual(anomalies, [
        { objet: 'utilisateurs.identifiant', anomalie: 'colonne_illisible_au_service' },
      ]);
    } finally {
      await proprietaire.query('grant select (identifiant) on utilisateurs to grc_app');
    }

    // Sens 3 : la déclaration elle-même ne doit pas se périmer.
    await proprietaire.query('alter table utilisateurs rename column mot_de_passe_hash to zz_essai');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select anomalie from f_verifier_privileges() where anomalie = 'secret_declare_introuvable'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['secret_declare_introuvable']);
    } finally {
      await proprietaire.query('alter table utilisateurs rename column zz_essai to mot_de_passe_hash');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  Q5-4 et Q5-5 — Les deux listes tenues à la main, et la promesse sans code
 * ===================================================================== */

describe('Armement, portée figée, chemin de magasin (§19.4 et §19.1, Q5-4 et Q5-5)', () => {
  test('TOUS les déclencheurs non internes sont armés « always »', async () => {
    const { total, desarmes } = (await base.lignes(
      proprietaire,
      `select count(*)::int as total,
              count(*) filter (where t.tgenabled <> 'A')::int as desarmes
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p') and not t.tgisinternal`,
    ))[0];
    // 42 à l'insertion, 32 à la modification, plus les déclencheurs de cohérence, de
    // portée et du journal : le balayage doit avoir de la matière.
    assert.ok(total >= 74, `Balayage suspect : ${total} déclencheur(s).`);
    assert.equal(desarmes, 0);
  });

  test('LE GARDE-FOU MORD : un déclencheur ramené en « origin » est réclamé', async () => {
    // C'est l'état dans lequel se trouvaient les 32 déclencheurs de mise à jour, dont ceux
    // qui portent le verrouillage optimiste, pendant que leurs miroirs d'insertion étaient
    // armés. Aucun contrôle ne le disait.
    await proprietaire.query('alter table risques enable replica trigger trg_risques_maj');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_armement()",
      );
      assert.deepEqual(anomalies, [
        { objet: 'risques.trg_risques_maj', anomalie: 'declencheur_desarmable' },
      ]);
    } finally {
      await proprietaire.query('alter table risques enable always trigger trg_risques_maj');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('les tables MIXTES sont découvertes, et chacune porte son déclencheur de portée', async () => {
    const mixtes = (await base.lignes(proprietaire, 'select nom from f_tables_mixtes() order by 1'))
      .map((l) => l.nom);
    assert.deepEqual(mixtes, [
      'document_referentiels', 'documents', 'mesure_catalogue', 'parametres', 'personnes',
    ]);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_portee_figee()'), []);
  });

  test('LE GARDE-FOU MORD : une table mixte NEUVE est réclamée, sans qu’un fichier change', async () => {
    // Le rayon exact du constat M-3, rouvert par une sixième table mixte ajoutée en L4 ou
    // L7 : elle recevrait ses politiques (f_verifier_couverture_rls les réclamerait) sans
    // son déclencheur de portée, et rien ne le disait.
    await proprietaire.query(
      'create table essai_mixte (id text primary key, filiale_id text)',
    );
    try {
      assert.deepEqual(
        (await base.lignes(
          proprietaire,
          "select objet, anomalie from f_verifier_portee_figee() where objet = 'essai_mixte'",
        )),
        [{ objet: 'essai_mixte', anomalie: 'portee_non_figee' }],
      );
      // Et la pose, elle aussi pilotée par le catalogue, la couvre sans qu'on la nomme.
      await proprietaire.query('select f_poser_portee_figee()');
      await proprietaire.query('select f_armer_declencheurs()');
      assert.deepEqual(
        await base.lignes(
          proprietaire,
          "select objet from f_verifier_portee_figee() where objet = 'essai_mixte'",
        ),
        [],
      );
    } finally {
      await proprietaire.query('drop table if exists essai_mixte');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('une exemption du §17.7 devenue introuvable est réclamée', async () => {
    await proprietaire.query('alter table groupes_ad rename to groupes_ad_essai');
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_portee_figee() where anomalie = 'exemption_obsolete'",
      );
      assert.deepEqual(anomalies, [{ objet: 'groupes_ad', anomalie: 'exemption_obsolete' }]);
    } finally {
      await proprietaire.query('alter table groupes_ad_essai rename to groupes_ad');
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('Q5-5 : un chemin de magasin devinable est refusé, un chemin opaque passe', async () => {
    const essai = async (chemin) =>
      base.avecPerimetre(applicatif, rssiSite(A), async (c) => {
        await c.query('savepoint avant_chemin');
        try {
          await c.query(
            `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier,
                                         type_mime, taille_octets, sha256, chemin_stockage)
                 values ('PJ-Q55', $1, 'risques', 'RISK-A', 'r.pdf', 'application/pdf', 10,
                         repeat('d', 64), $2)`,
            [A, chemin],
          );
          await c.query('rollback to savepoint avant_chemin');
          return 'AUCUN REFUS';
        } catch (erreur) {
          await c.query('rollback to savepoint avant_chemin');
          return erreur.code;
        }
      });

    // La dérogation d'unicité globale de chemin_stockage reposait sur la promesse d'un
    // code non écrit (lot L6). Elle repose désormais sur une contrainte — qui ferme aussi
    // la traversée de répertoire, avant que L6 ait écrit une ligne.
    assert.equal(await essai(`magasin/RISK-A/${'rapport.pdf'}`), '23514');
    assert.equal(await essai('../magasin/x'), '23514');
    assert.equal(await essai(`/${'a'.repeat(64)}`), '23514');
    assert.equal(await essai('a'.repeat(64)), 'AUCUN REFUS');
    assert.equal(await essai(`ab/cd/${'e'.repeat(64)}`), 'AUCUN REFUS');
  });
});
