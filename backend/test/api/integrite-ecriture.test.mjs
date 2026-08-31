/**
 * integrite-ecriture.test.mjs — ce que la couche d'écriture de L2 ne peut pas se
 * permettre d'apprendre en production.
 *
 * Trois propriétés, trois raisons d'être ici :
 *
 *  1. **Tout ou rien sur une opération composite** (`PLAN_SERVEUR` §1.4, contrôle S14).
 *     Propagation d'une mesure, cascade de suppression, import d'un lot : une seule
 *     transaction, et **aucun état intermédiaire observable** — ni pendant, ni après un
 *     échec. Ce n'est pas une propriété du SQL, c'est une propriété de la façon dont on
 *     l'appelle : elle se perd d'un `await` mal placé ou d'un `catch` bien intentionné,
 *     et les tests ci-dessous montrent les deux.
 *
 *  2. **La traçabilité est imposée, et ce que le client envoie est IGNORÉ, jamais
 *     refusé** (`CONVENTIONS.md` §18.1). Deuxième des trois pièges que la vague 1 lègue
 *     à L2, tel que `CLAUDE.md` le formule : « une couche d'écriture qui les envoie ne
 *     provoque pas d'erreur : ses valeurs sont simplement ignorées ». Un test qui
 *     vérifierait un REFUS validerait le contraire du contrat.
 *
 *  3. **Une table à colonne engendrée s'insère en nommant ses colonnes** (§18.6).
 *     Troisième piège : `documents` porte `portee_groupe`, engendrée, et qui entre dans
 *     une clé étrangère. L'aller-retour naïf « je relis la ligne, je la réinsère » —
 *     réflexe naturel d'une reprise ou d'un import — échoue.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Compte applicatif : celui qui écrira en production. */
let applicatif;
/** Connexion du propriétaire : DDL des contrôles de morsure, et rien d'autre. */
let proprietaire;
/** Troisième connexion : le témoin. Il ne participe à rien, il regarde. */
let temoin;

const rssi = perimetre('rssi-site', FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
  temoin = await base.nouvelleConnexion('app');
});

after(async () => {
  await temoin?.end().catch(() => {});
  await base?.fermer();
});

/**
 * Ce que voit un TIERS, à cet instant précis. Trois grandeurs suffisent à décrire
 * l'effet de l'opération composite ci-dessous ; les lire toutes les trois d'un coup
 * évite qu'un état à moitié écrit passe entre deux mesures.
 */
async function vuDuTemoin() {
  return base.avecPerimetre(temoin, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) => {
    const statut = (await c.query("select statut from mesure_mise_en_oeuvre where id = 'MMO-A'")).rows[0]?.statut;
    const liens = (await c.query("select count(*)::int as n from evaluation_mesures where evaluation_id = 'EVAL-A'")).rows[0].n;
    const actions = (await c.query("select count(*)::int as n from actions where mesure_id = 'MESURE-G'")).rows[0].n;
    return { statut, liens, actions };
  });
}

/* =====================================================================
 *  §1 — Tout ou rien (contrôle S14)
 * ===================================================================== */

describe('Opération composite : tout ou rien, et rien d’observable entre-temps', () => {
  test('un échec en fin de propagation ne laisse AUCUNE trace', async () => {
    const avant = await vuDuTemoin();

    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        rssi,
        async (c) => {
          // Une propagation de mesure, telle que le §1.4 la cite : elle touche trois
          // tables, et la dernière écriture est celle qui échoue.
          const version = (await c.query("select version from mesure_mise_en_oeuvre where id = 'MMO-A'")).rows[0].version;
          await c.query(
            "update mesure_mise_en_oeuvre set statut = 'conforme' where id = $1 and version = $2",
            ['MMO-A', version],
          );
          await c.query("insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-G', $1)", [FILIALE_A]);
          await c.query(
            "insert into actions (id, filiale_id, titre, mesure_id) values ('ACT-PROP', $1, 'Chiffrer les portables', 'MESURE-G')",
            [FILIALE_A],
          );
          // Le lien de trop : la mesure LOCALE de Toulouse rattachée à la filiale
          // allemande. Le déclencheur de cohérence du catalogue le refuse (23514,
          // `CONVENTIONS.md` §15 : un refus d'intégrité qui emprunte le code standard
          // à dessein). Ce qui compte ici n'est pas QUEL refus, mais qu'un refus en
          // fin de course annule tout ce qui précède.
          await c.query("insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-A', 'FIL-ESSAI-B')");
        },
        { annuler: false },
      ),
    );
    assert.equal(erreur.code, '23514');

    assert.deepEqual(await vuDuTemoin(), avant, 'Après l’échec, l’état doit être exactement celui d’avant.');
  });

  test('pendant l’opération, le témoin ne voit RIEN de ce qui est en cours', async () => {
    const avant = await vuDuTemoin();
    await applicatif.query('begin');
    try {
      await applicatif.query(
        `select set_config('grc.utilisateur', 'rssi-site', true),
                set_config('grc.filiale_id', $1, true),
                set_config('grc.filiales', $1, true),
                set_config('grc.administration_groupe', '', true)`,
        [FILIALE_A],
      );
      const version = (await applicatif.query("select version from mesure_mise_en_oeuvre where id = 'MMO-A'")).rows[0].version;
      await applicatif.query("update mesure_mise_en_oeuvre set statut = 'conforme' where id = $1 and version = $2", ['MMO-A', version]);
      await applicatif.query("insert into actions (id, filiale_id, titre, mesure_id) values ('ACT-ENCOURS', $1, 'Action en cours', 'MESURE-G')", [FILIALE_A]);

      assert.deepEqual(
        await vuDuTemoin(),
        avant,
        'Une opération composite en cours ne doit pas être visible à moitié faite.',
      );
    } finally {
      await applicatif.query('rollback');
    }
    assert.deepEqual(await vuDuTemoin(), avant);
  });

  test('LA TRANSACTION MORD : les mêmes écritures hors transaction laissent l’état à moitié fait', async () => {
    // Contrôle de morsure. Si le test « aucune trace » passait aussi sans transaction,
    // il ne prouverait rien de la transaction — seulement que la dernière écriture
    // échoue. On rejoue donc la même séquence en validant chaque écriture, et l'on
    // vérifie que le témoin voit alors le désordre. Nettoyé ensuite, ligne à ligne.
    const avant = await vuDuTemoin();
    const ecrire = (texte, valeurs = []) =>
      base.avecPerimetre(applicatif, rssi, (c) => c.query(texte, valeurs), { annuler: false });
    try {
      const version = (await ecrire("select version from mesure_mise_en_oeuvre where id = 'MMO-A'")).rows[0].version;
      await ecrire("update mesure_mise_en_oeuvre set statut = 'conforme' where id = $1 and version = $2", ['MMO-A', version]);
      await ecrire("insert into actions (id, filiale_id, titre, mesure_id) values ('ACT-MORSURE', $1, 'Action orpheline', 'MESURE-G')", [FILIALE_A]);
      const erreur = await erreurAttendue(
        ecrire("insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-A', 'FIL-ESSAI-B')"),
      );
      assert.equal(erreur.code, '23514');

      const apres = await vuDuTemoin();
      assert.notDeepEqual(apres, avant, 'Sans transaction, l’échec laisse derrière lui un état partiel.');
      assert.equal(apres.statut, 'conforme');
      assert.equal(apres.actions, avant.actions + 1);
    } finally {
      await ecrire("delete from actions where id = 'ACT-MORSURE'");
      await ecrire("update mesure_mise_en_oeuvre set statut = $1 where id = 'MMO-A'", [avant.statut ?? '']);
    }
    assert.deepEqual(await vuDuTemoin(), avant, 'Le contrôle de morsure doit restituer l’état d’avant.');
  });

  test('un « savepoint » qui avale l’erreur RÉTABLIT le défaut : à proscrire dans L2', async () => {
    // Contre-exemple utile, parce que le réflexe est tentant : « j'entoure l'écriture
    // fragile d'un savepoint pour que le reste de mon lot passe quand même ». Ce faisant
    // on obtient exactement ce que le §1.4 interdit — une opération composite à moitié
    // appliquée, et personne pour le savoir.
    const avant = await vuDuTemoin();
    try {
      await base.avecPerimetre(
        applicatif,
        rssi,
        async (c) => {
          await c.query("insert into actions (id, filiale_id, titre) values ('ACT-SAVEPOINT', $1, 'Écriture conservée à tort')", [FILIALE_A]);
          await c.query('savepoint fragile');
          try {
            await c.query("insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-A', 'FIL-ESSAI-B')");
          } catch {
            await c.query('rollback to savepoint fragile'); // ← l'erreur est avalée
          }
        },
        { annuler: false },
      );
      const restee = await base.avecPerimetre(applicatif, rssi, async (c) =>
        (await c.query("select count(*)::int as n from actions where id = 'ACT-SAVEPOINT'")).rows[0].n);
      assert.equal(restee, 1, 'La première écriture a été validée alors que l’opération a échoué.');
    } finally {
      await base.avecPerimetre(applicatif, rssi, (c) => c.query("delete from actions where id = 'ACT-SAVEPOINT'"), { annuler: false });
    }
    assert.deepEqual(await vuDuTemoin(), avant);
  });

  test('après une erreur SQL, la transaction est perdue (25P02) : on ne « continue » pas', async () => {
    // Fait de PostgreSQL qu'une couche d'écriture doit connaître avant de l'apprendre
    // en production : sans savepoint, la première erreur interdit toute instruction
    // suivante. Un import qui compte « traiter les lignes valides et signaler les
    // autres » ne peut donc pas se contenter d'un try/catch autour de chaque ligne.
    await applicatif.query('begin');
    try {
      const premiere = await erreurAttendue(applicatif.query('select 1 / 0'));
      assert.equal(premiere.code, '22012');
      const suivante = await erreurAttendue(applicatif.query('select 1'));
      assert.equal(suivante.code, '25P02');
    } finally {
      await applicatif.query('rollback');
    }
  });
});

/* =====================================================================
 *  §2 — La traçabilité est imposée, et l'envoi du client est ignoré
 * ===================================================================== */

describe('Traçabilité imposée à l’insertion (CONVENTIONS §18.1)', () => {
  const FORGE = {
    id: 'RISK-FORGE',
    version: 2147483647,
    creeLe: '2024-01-15T08:00:00Z',
    creePar: 'marc.dupuis (DG)',
  };

  /** Insère la ligne forgée et rend ce que la base a réellement retenu. */
  async function insererForge(c, id = FORGE.id) {
    await c.query(
      `insert into risques (id, filiale_id, nom, version, cree_le, cree_par, modifie_le, modifie_par)
           values ($1, $2, 'Risque accepté par la direction', $3, $4, $5, now(), 'quelqu’un d’autre')`,
      [id, FILIALE_A, FORGE.version, FORGE.creeLe, FORGE.creePar],
    );
    return (await c.query(
      'select version, cree_par, cree_le, modifie_le, modifie_par from risques where id = $1',
      [id],
    )).rows[0];
  }

  test('les colonnes envoyées par le client sont IGNORÉES — et l’insertion n’est pas refusée', async () => {
    const ligne = await base.avecPerimetre(applicatif, perimetre('alice', FILIALE_A, [FILIALE_A]), (c) => insererForge(c));
    assert.equal(ligne.version, 1, 'La version est imposée à 1, quoi que le client envoie.');
    assert.equal(ligne.cree_par, 'alice', 'L’auteur tracé est celui de la SESSION, pas celui du corps de la requête.');
    assert.ok(Date.now() - new Date(ligne.cree_le).getTime() < 60_000, 'La date de création est celle de l’insertion.');
    assert.equal(ligne.modifie_le, null, 'Une ligne qui naît n’a jamais été modifiée.');
    assert.equal(ligne.modifie_par, null);
  });

  test('la ligne forgée reste MODIFIABLE : le second effet du §18.1 est fermé aussi', async () => {
    // Le §18.1 nomme deux conséquences, l'une sur la preuve, l'autre sur la
    // disponibilité : « une ligne créée avec version au maximum de l'entier signé est
    // DÉFINITIVEMENT IMMODIFIABLE ». Vérifier la seule traçabilité laisserait ce
    // second effet hors du banc d'essai.
    const versionApres = await base.avecPerimetre(applicatif, perimetre('alice', FILIALE_A, [FILIALE_A]), async (c) => {
      await insererForge(c, 'RISK-FORGE-2');
      await c.query("update risques set nom = 'renommé' where id = 'RISK-FORGE-2' and version = 1");
      return (await c.query("select version from risques where id = 'RISK-FORGE-2'")).rows[0].version;
    });
    assert.equal(versionApres, 2);
  });

  test('à la modification, « cree_le » et « cree_par » sont gelés, « modifie_par » est imposé', async () => {
    const ligne = await base.avecPerimetre(applicatif, perimetre('bob', FILIALE_A, [FILIALE_A]), async (c) => {
      const version = (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version;
      await c.query(
        `update risques set nom = 'analyse revue',
                            cree_le = $2, cree_par = $3, modifie_par = 'un autre'
              where id = 'RISK-A' and version = $1`,
        [version, FORGE.creeLe, FORGE.creePar],
      );
      return (await c.query("select cree_par, cree_le, modifie_par from risques where id = 'RISK-A'")).rows[0];
    });
    assert.notEqual(ligne.cree_par, FORGE.creePar, 'cree_par n’est pas réinscriptible.');
    assert.ok(Date.now() - new Date(ligne.cree_le).getTime() < 60_000, 'cree_le n’est pas réinscriptible.');
    assert.equal(ligne.modifie_par, 'bob', 'modifie_par vient de la session, pas de la requête.');
  });

  test('LE DÉCLENCHEUR MORD : sans lui, la ligne se présente comme créée en 2024 par le DG', async () => {
    // Contrôle de morsure. On retire `trg_risques_creation`, on rejoue exactement la
    // même insertion, et l'on vérifie que la forgerie passe — puis on le repose, ARMÉ
    // COMME LA MIGRATION LE POSE (« always », `001_socle.sql`
    // f_poser_tracabilite_insertion), et l'on demande au garde-fou du schéma s'il n'a
    // plus rien à dire.
    await proprietaire.query('drop trigger trg_risques_creation on risques');
    try {
      // Validée, et non annulée : la suite l'interroge depuis une AUTRE transaction.
      const ligne = await base.avecPerimetre(
        applicatif,
        perimetre('alice', FILIALE_A, [FILIALE_A]),
        (c) => insererForge(c, 'RISK-FORGE-3'),
        { annuler: false },
      );
      assert.equal(ligne.cree_par, FORGE.creePar, 'Sans le déclencheur, l’auteur est celui que le client déclare.');
      assert.equal(new Date(ligne.cree_le).getUTCFullYear(), 2024, 'Et la date aussi : c’est le constat T-1.');
      assert.equal(ligne.version, FORGE.version);

      // Et la ligne devient définitivement immodifiable — le second effet du §18.1.
      const erreur = await erreurAttendue(
        base.avecPerimetre(applicatif, perimetre('alice', FILIALE_A, [FILIALE_A]), (c) =>
          c.query("update risques set nom = 'x' where id = 'RISK-FORGE-3' and version = $1", [FORGE.version])),
      );
      assert.equal(erreur.code, '22003', 'Débordement de l’entier signé : la ligne est verrouillée à jamais.');

      // Le garde-fou du schéma, lui, doit signaler le déclencheur absent.
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_schema() where objet = 'risques'",
      );
      assert.deepEqual(anomalies.map((l) => l.anomalie), ['creation_non_tracee']);
    } finally {
      await proprietaire.query(
        'create trigger trg_risques_creation before insert on risques for each row execute function f_init_tracabilite()',
      );
      await proprietaire.query('alter table risques enable always trigger trg_risques_creation');
      await base.avecPerimetre(
        applicatif,
        perimetre('nettoyage', FILIALE_A, [FILIALE_A]),
        (c) => c.query("delete from risques where id = 'RISK-FORGE-3'"),
        { annuler: false },
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  §3 — La colonne engendrée de « documents » (CONVENTIONS §18.6)
 * ===================================================================== */

describe('« documents » : l’insertion nomme ses colonnes, sinon elle échoue (§18.6)', () => {
  /** Périmètre d'administration : `documents` est mixte, et l'on y touche au socle. */
  const administrateur = perimetre('administrateur', FILIALE_A, [FILIALE_A], true);

  test('l’aller-retour naïf « je relis la ligne, je la réinsère » échoue', async () => {
    // Le réflexe d'une reprise, d'un import ou d'une duplication de fiche. PostgreSQL
    // refuse qu'on donne une valeur à une colonne engendrée, et `select *` en rapporte
    // une.
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, rssi, (c) =>
        c.query("insert into documents select * from documents where id = 'DOC-A'")),
    );
    assert.equal(erreur.code, '428C9');
    assert.match(erreur.message, /portee_groupe/);
  });

  test('la même insertion en NOMMANT ses colonnes passe', async () => {
    // Contrôle symétrique (§20.2) : ce qui doit rester possible doit être montré
    // possible. Sans lui, le test précédent serait satisfait par une table où PLUS
    // AUCUNE insertion ne marche.
    const portee = await base.avecPerimetre(applicatif, rssi, async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, type, statut)
             select 'DOC-COPIE', filiale_id, titre || ' (copie)', type, statut
               from documents where id = 'DOC-A'`,
      );
      return (await c.query("select portee_groupe from documents where id = 'DOC-COPIE'")).rows[0].portee_groupe;
    });
    assert.equal(portee, false, 'La colonne engendrée est calculée par la base : filiale_id renseigné → portée locale.');
  });

  test('le piège vaut aussi pour la table de liaison « document_referentiels »', async () => {
    const erreur = await erreurAttendue(
      base.avecPerimetre(applicatif, rssi, (c) =>
        c.query("insert into document_referentiels select * from document_referentiels where document_id = 'DOC-A'")),
    );
    assert.equal(erreur.code, '428C9');
  });

  test('une ligne de portée Groupe engendre « portee_groupe = vrai », et sert la clé étrangère', async () => {
    // Ce que la colonne engendrée sert à faire, et qu'il faut vérifier une fois :
    // rattacher un référentiel au document du socle sans que sa filiale (nulle) rompe
    // la clé étrangère composite (§18.6, « la seule forme déclarative qui épingle le
    // filiale_id d'une liaison dont l'une des extrémités est mixte »).
    const vu = await base.avecPerimetre(applicatif, administrateur, async (c) => {
      await c.query("insert into documents (id, titre) values ('DOC-G2', 'Charte informatique du groupe')");
      await c.query("insert into document_referentiels (document_id, ref_id) values ('DOC-G2', 'iso-27002-2022')");
      return (await c.query(
        `select d.portee_groupe as doc, dr.portee_groupe as lien
           from documents d join document_referentiels dr on dr.document_id = d.id
          where d.id = 'DOC-G2'`,
      )).rows[0];
    });
    assert.deepEqual(vu, { doc: true, lien: true });
  });
});
