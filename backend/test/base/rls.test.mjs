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
