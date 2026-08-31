/**
 * pool.test.mjs — le périmètre de session, éprouvé sur le VRAI pool de production.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Les autres fichiers du banc d'essai ouvrent leurs propres connexions et posent
 * le périmètre à la main, « exactement comme `src/db/pool.ts` ». C'est utile pour
 * éprouver la base, et insuffisant pour éprouver le serveur : une recopie fidèle
 * ne prouve rien de l'original, et surtout elle ne reproduit pas ce que le pool
 * fait de particulier — **recycler une connexion d'un utilisateur à l'autre sans
 * l'assainir**.
 *
 * Ce fichier importe donc `creerPool` et `avecTransaction` du module réellement
 * déployé et travaille sur un pool `pg` de `max: 1`. C'est le seul montage qui
 * met deux transactions successives sur la même connexion serveur, donc le seul
 * qui puisse voir un réglage fuiter de l'une à l'autre.
 *
 * Il naît du constat **N-4** de la porte de sécurité S1 (`docs/securite/
 * RAPPORT_S1_BIS.md`) : `appliquerPerimetre()` posait trois réglages sur quatre,
 * et le quatrième — `grc.administration_groupe`, qui commande l'écriture des
 * tables de configuration et des lignes de portée Groupe — n'était **ni posé ni
 * effacé**. Posé en portée session par une transaction, il était hérité par la
 * suivante, sur la connexion recyclée : élévation de privilège silencieuse et
 * persistante, attribuée à un utilisateur qui n'avait rien demandé.
 *
 * Le défaut était latent (aucun chemin de code ne posait le drapeau) et l'en-tête
 * de `pool.ts` affirmait pourtant la propriété inverse. C'est ce qui l'a rendu
 * invisible pendant deux passages de la porte. Le test « un drapeau posé en portée
 * session ne survit pas au recyclage » (§2 ci-dessous) est celui qui manquait.
 *
 * ── Ce qu'il couvre ──────────────────────────────────────────────────────────
 *
 *   §1  les quatre réglages sont posés, tous, à chaque transaction ;
 *   §2  aucun ne survit au recyclage d'une connexion — N-4 ;
 *   §3  tous meurent au « commit » comme au « rollback » ;
 *   §4  le périmètre incohérent, vide ou sans filiale active est refusé ;
 *   §5  un périmètre multi-filiales lit plusieurs filiales et n'écrit que dans une ;
 *   §6  PERIMETRE_SYSTEME ne lit rien, n'écrit rien, et n'administre rien.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { erreurAttendue, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import {
  avecTransaction,
  creerPool,
  ErreurPerimetre,
  fermerPool,
  PERIMETRE_SYSTEME,
} from '../../src/db/pool.ts';

/* =====================================================================
 *  Montage
 * ===================================================================== */

const A = 'FIL-POOL-A';
const B = 'FIL-POOL-B';
const C = 'FIL-POOL-C';

/** Les quatre réglages, tels que la transaction en cours les voit. */
const LES_QUATRE = `select current_setting('grc.utilisateur', true)           as utilisateur,
                           current_setting('grc.filiale_id', true)            as filiale_id,
                           current_setting('grc.filiales', true)              as filiales,
                           current_setting('grc.administration_groupe', true) as administration_groupe,
                           f_administration_groupe()                          as admin`;

/**
 * Périmètre au format attendu par `avecTransaction`.
 *
 * Volontairement distinct de l'aide `perimetre()` de `base.mjs`, qui produit la
 * forme « banc d'essai » (`utilisateur`) et non la forme `PerimetreSession`
 * (`utilisateurId`, `perimetreGroupe`, `administrationGroupe`). C'est la forme du
 * module de production qui est éprouvée ici, pas une forme voisine.
 */
function session(utilisateurId, filialeId, filiales = undefined, options = {}) {
  return {
    utilisateurId,
    filialeId,
    filiales: filiales ?? (filialeId === null ? [] : [filialeId]),
    perimetreGroupe: options.perimetreGroupe === true,
    administrationGroupe: options.administrationGroupe === true,
  };
}

/**
 * Configuration de base pointant sur la base d'essai, avec le rôle applicatif —
 * celui du service, qui n'a ni `bypassrls` ni la propriété des tables.
 *
 * `poolMax: 1` n'est pas une commodité : c'est le montage qui garantit que deux
 * transactions successives partagent la même connexion serveur, donc le seul qui
 * reproduise le recyclage. Les tests du §2 le vérifient d'ailleurs par le
 * `pg_backend_pid()`, plutôt que de le supposer.
 */
function configuration(nomBase) {
  return {
    hote: process.env.BASE_HOTE ?? '127.0.0.1',
    port: Number.parseInt(process.env.BASE_PORT ?? '5432', 10),
    nom: nomBase,
    utilisateur: process.env.BASE_UTILISATEUR ?? 'grc_app',
    motDePasse: process.env.BASE_MOT_DE_PASSE ?? 'dev',
    ssl: { mode: 'desactive', ca: null },
    poolMax: 1,
    delaiConnexionMs: 5_000,
    delaiInactiviteMs: 30_000,
    delaiRequeteMs: 15_000,
    delaiTransactionInactiveMs: 15_000,
    delaiVerrouMs: 5_000,
    nomApplication: 'cyber-grc-essai-pool',
    proprietaire: null,
  };
}

let base;
let pool;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  pool = creerPool(configuration(base.nom));
  await semer();
});

/**
 * Trois filiales et une action dans chacune.
 *
 * Le semis passe DÉLIBÉRÉMENT par la plomberie du banc d'essai (`base.avecPerimetre`)
 * et non par `avecTransaction` : un montage qui dépendrait de la propriété qu'il sert à
 * éprouver ne dirait plus rien le jour où elle casse — c'est le fichier entier qui
 * tomberait, sur une erreur de `before()`, au lieu du test qui nomme le défaut.
 *
 * `filiales` est une table de CONFIGURATION : son écriture exige le drapeau
 * d'administration Groupe, posé ici à la main, en portée transaction.
 */
async function semer() {
  const client = await base.connexion('app');

  await base.avecPerimetre(client, perimetre('semeur', A, [A]), async (c) => {
    await c.query("select set_config('grc.administration_groupe', 'oui', true)");
    for (const [id, code] of [[A, 'FILA'], [B, 'FILB'], [C, 'FILC']]) {
      await c.query('insert into filiales (id, code, raison_sociale) values ($1, $2, $3)', [
        id, code, `Filiale ${code}`,
      ]);
    }
  }, { annuler: false });

  for (const filiale of [A, B, C]) {
    await base.avecPerimetre(client, perimetre('semeur', filiale, [filiale]), async (c) => {
      await c.query('insert into actions (id, filiale_id, titre) values ($1, $2, $3)', [
        `ACT-${filiale}`, filiale, `Action de ${filiale}`,
      ]);
    }, { annuler: false });
  }
}

after(async () => {
  await fermerPool(pool).catch(() => {});
  await base?.fermer();
});

/* =====================================================================
 *  §1 — Les quatre réglages sont posés, tous, à chaque transaction
 * ===================================================================== */

describe('§1 — les quatre réglages du périmètre', () => {
  test('une transaction ordinaire pose les QUATRE réglages, le drapeau à vide', async () => {
    const vu = await avecTransaction(pool, session('alice', A, [A, B]), async (c) =>
      (await c.query(LES_QUATRE)).rows[0],
    );

    assert.equal(vu.utilisateur, 'alice');
    assert.equal(vu.filiale_id, A);
    assert.equal(vu.filiales, `${A},${B}`);
    // Le point du constat N-4 : posé, et posé à VIDE — jamais absent. Un réglage
    // absent n'est pas neutre, il vaut ce que la transaction précédente y a laissé.
    assert.equal(vu.administration_groupe, '', "le quatrième réglage doit être posé, même à vide");
    assert.equal(vu.admin, false);
  });

  test('une session qui se déclare administration Groupe pose « oui », et la base le lit', async () => {
    const vu = await avecTransaction(
      pool,
      session('admin', A, [A, B, C], { perimetreGroupe: true, administrationGroupe: true }),
      async (c) => (await c.query(LES_QUATRE)).rows[0],
    );

    assert.equal(vu.administration_groupe, 'oui');
    assert.equal(vu.admin, true, 'f_administration_groupe() doit voir le drapeau posé par le pool');
  });

  test('le drapeau d’administration n’élargit JAMAIS la lecture', async () => {
    // Périmètre de lecture réduit à A, mais drapeau d'administration posé : si le
    // drapeau élargissait quoi que ce soit en lecture, B et C apparaîtraient.
    const lues = await avecTransaction(
      pool,
      session('admin', A, [A], { administrationGroupe: true }),
      async (c) => (await c.query('select id from actions order by id')).rows.map((l) => l.id),
    );

    assert.deepEqual(lues, [`ACT-${A}`]);
  });
});

/* =====================================================================
 *  §2 — Le recyclage d'une connexion : le test qui manquait (N-4)
 * ===================================================================== */

describe('§2 — recyclage d’une connexion du pool', () => {
  /** Pose un réglage en portée SESSION sur une connexion, puis la rend au pool. */
  async function poserEnPorteeSessionPuisRendre(reglage, valeur) {
    const client = await pool.connect();
    const pid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid;
    // `set` sans `local` : la faute banale que N-4 décrit — un `set` employé à la
    // place d'un `set_config(…, true)`, ou un `set_config(…, false)` laissé par une
    // mise au point. Le pool `pg` n'émet aucun `DISCARD` en reprenant la connexion.
    await client.query(`set ${reglage} = '${valeur}'`);
    client.release();
    return pid;
  }

  test('un drapeau d’administration posé en portée session n’est PAS hérité par la transaction suivante', async () => {
    const pidT1 = await poserEnPorteeSessionPuisRendre('grc.administration_groupe', 'oui');

    const vu = await avecTransaction(pool, session('ordinaire', A, [A]), async (c) => ({
      pid: (await c.query('select pg_backend_pid() as pid')).rows[0].pid,
      ...(await c.query(LES_QUATRE)).rows[0],
    }));

    // Sans cette égalité, le test ne prouverait rien : il faut que ce soit LA MÊME
    // connexion serveur, sans quoi l'absence d'héritage serait un simple hasard de
    // pool. C'est le montage exact de l'auditeur.
    assert.equal(vu.pid, pidT1, 'le pool doit avoir recyclé la même connexion (max: 1)');
    assert.equal(vu.administration_groupe, '', 'le drapeau de la session précédente ne doit pas transparaître');
    assert.equal(vu.admin, false, 'f_administration_groupe() doit être faux pour un utilisateur ordinaire');
  });

  test('et la base refuse alors l’écriture que ce drapeau hérité aurait autorisée', async () => {
    const pidT1 = await poserEnPorteeSessionPuisRendre('grc.administration_groupe', 'oui');

    const erreur = await erreurAttendue(
      avecTransaction(pool, session('ordinaire', A, [A]), async (c) => {
        assert.equal(
          (await c.query('select pg_backend_pid() as pid')).rows[0].pid,
          pidT1,
          'le pool doit avoir recyclé la même connexion (max: 1)',
        );
        await c.query(
          "insert into utilisateurs (id, identifiant, nom_affichage) values ('USR-INTRUS', 'intrus', 'Compte forgé')",
        );
      }),
    );

    // 42501 : la politique d'écriture de `utilisateurs` s'adosse à
    // f_administration_groupe(), qui est faux. Avant le correctif de N-4, cet
    // « insert » passait — et créait un compte.
    assert.equal(erreur.code, '42501', `attendu 42501, obtenu ${erreur.code} : ${erreur.message}`);

    const restants = await avecTransaction(pool, session('ordinaire', A, [A]), async (c) =>
      (await c.query("select count(*)::int as n from utilisateurs where id = 'USR-INTRUS'")).rows[0].n,
    );
    assert.equal(restants, 0, 'aucun compte ne doit avoir été créé');
  });

  test('un drapeau LÉGITIME posé par le pool ne déborde pas sur la transaction suivante', async () => {
    await avecTransaction(pool, session('admin', A, [A], { administrationGroupe: true }), async (c) => {
      assert.equal((await c.query(LES_QUATRE)).rows[0].admin, true);
    });

    const vu = await avecTransaction(pool, session('ordinaire', A, [A]), async (c) =>
      (await c.query(LES_QUATRE)).rows[0],
    );
    assert.equal(vu.administration_groupe, '');
    assert.equal(vu.admin, false);
  });

  test('ce qui protège est l’écrasement à chaque transaction, PAS un assainissement de la connexion', async () => {
    // Honnêteté du garde-fou (CONVENTIONS §17.5) : le pool ne nettoie rien. Un
    // réglage posé en portée session RESTE sur la connexion — après un « commit »,
    // PostgreSQL rend le réglage local à sa valeur de SESSION, qui vaut ici « oui ».
    const client = await pool.connect();
    await client.query("set grc.administration_groupe = 'oui'");
    client.release();

    await avecTransaction(pool, session('ordinaire', A, [A]), async (c) => {
      assert.equal((await c.query(LES_QUATRE)).rows[0].administration_groupe, '');
    });

    const residuel = await pool.query("select current_setting('grc.administration_groupe', true) as v");
    assert.equal(
      residuel.rows[0].v,
      'oui',
      'La valeur posée en portée SESSION subsiste hors transaction, et c’est normal : le pool ' +
        'n’assainit rien. Si ce test tombe parce que la connexion est désormais nettoyée à la ' +
        'libération, tant mieux — mais l’en-tête de src/db/pool.ts doit alors être récrit, car il ' +
        'dit aujourd’hui que ce qui protège est l’écrasement des quatre réglages, pas un nettoyage.',
    );

    // Et malgré cette valeur résiduelle, la transaction suivante reste protégée.
    await avecTransaction(pool, session('ordinaire', A, [A]), async (c) => {
      assert.equal((await c.query(LES_QUATRE)).rows[0].admin, false);
    });

    // Remise en état : les tests suivants ne doivent pas hériter de cette mise en scène.
    const remise = await pool.connect();
    await remise.query('reset grc.administration_groupe');
    remise.release();
  });
});

/* =====================================================================
 *  §3 — Les réglages meurent au « commit » et au « rollback »
 * ===================================================================== */

describe('§3 — durée de vie des réglages', () => {
  /** Les quatre réglages tels qu'une requête HORS transaction les voit. */
  async function reglagesHorsTransaction() {
    return (await pool.query(LES_QUATRE)).rows[0];
  }

  test('les quatre réglages ne survivent pas au « commit »', async () => {
    await avecTransaction(pool, session('alice', A, [A, B]), async (c) => {
      assert.equal((await c.query(LES_QUATRE)).rows[0].utilisateur, 'alice');
    });

    const apres = await reglagesHorsTransaction();
    // Après un « commit », un réglage local revient à sa valeur de session : la
    // chaîne VIDE, et non l'absence (c'est ce que dit 004_rls.sql §2). L'important
    // est qu'il ne vaille plus « alice ».
    assert.equal(apres.utilisateur, '');
    assert.equal(apres.filiale_id, '');
    assert.equal(apres.filiales, '');
    assert.equal(apres.administration_groupe, '');
    assert.equal(apres.admin, false);
  });

  test('les quatre réglages ne survivent pas au « rollback »', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, session('bruno', B, [B], { administrationGroupe: true }), async (c) => {
        assert.equal((await c.query(LES_QUATRE)).rows[0].administration_groupe, 'oui');
        throw new Error('échec provoqué : la transaction doit être annulée');
      }),
    );
    assert.match(erreur.message, /échec provoqué/);

    const apres = await reglagesHorsTransaction();
    assert.equal(apres.utilisateur, '');
    assert.equal(apres.filiale_id, '');
    assert.equal(apres.filiales, '');
    assert.equal(apres.administration_groupe, '');
    assert.equal(apres.admin, false);
  });

  test('une transaction d’administration qui RÉUSSIT ne laisse pas son drapeau sur la connexion', async () => {
    // Le pendant du §2, côté pool : c'est ici que se jugerait un « set_config(…, false) »
    // — ou un « set » — employé par appliquerPerimetre elle-même. Le drapeau serait alors
    // posé en portée SESSION, survivrait au « commit », et toute requête ultérieure passée
    // hors transaction sur cette connexion s'exécuterait en administration Groupe.
    await avecTransaction(pool, session('admin', A, [A], { administrationGroupe: true }), async (c) => {
      assert.equal((await c.query(LES_QUATRE)).rows[0].admin, true);
    });

    const apres = await reglagesHorsTransaction();
    assert.equal(apres.administration_groupe, '', 'le drapeau doit mourir avec la transaction qui l’a posé');
    assert.equal(apres.admin, false);
  });

  test('une transaction annulée ne laisse aucune ligne derrière elle', async () => {
    await erreurAttendue(
      avecTransaction(pool, session('bruno', B, [B]), async (c) => {
        await c.query("insert into actions (id, filiale_id, titre) values ('ACT-ANNULEE', $1, 'à annuler')", [B]);
        throw new Error('échec provoqué');
      }),
    );

    const n = await avecTransaction(pool, session('bruno', B, [B]), async (c) =>
      (await c.query("select count(*)::int as n from actions where id = 'ACT-ANNULEE'")).rows[0].n,
    );
    assert.equal(n, 0);
  });
});

/* =====================================================================
 *  §4 — Périmètres refusés
 * ===================================================================== */

describe('§4 — refus d’un périmètre inutilisable', () => {
  test('un périmètre de lecture VIDE est refusé avant d’atteindre la base', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, session('alice', null, []), async () => 'jamais atteint'),
    );
    assert.ok(erreur instanceof ErreurPerimetre, `attendu ErreurPerimetre, obtenu ${erreur.name}`);
    assert.match(erreur.message, /aucune filiale lisible/);
  });

  test('un utilisateur vide est refusé : toute transaction est attribuée', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, session('   ', A, [A]), async () => 'jamais atteint'),
    );
    assert.ok(erreur instanceof ErreurPerimetre);
    assert.match(erreur.message, /aucun utilisateur/);
  });

  test('une filiale active HORS du périmètre de lecture est refusée, et le message la nomme', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, session('alice', C, [A, B]), async () => 'jamais atteint'),
    );
    assert.ok(erreur instanceof ErreurPerimetre);
    assert.match(erreur.message, new RegExp(C));
    assert.match(erreur.message, /n'appartient pas au périmètre autorisé/);
  });

  test('une transaction qui écrit sans filiale active est refusée', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, session('alice', null, [A, B]), async () => 'jamais atteint'),
    );
    assert.ok(erreur instanceof ErreurPerimetre);
    assert.match(erreur.message, /aucune filiale active/);
  });

  test('la même transaction est acceptée en LECTURE SEULE, et la base y refuse toute écriture', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(
        pool,
        session('alice', null, [A, B]),
        async (c) => {
          // Le périmètre de lecture s'applique bien, lui.
          const lues = (await c.query('select id from actions order by id')).rows.map((l) => l.id);
          assert.deepEqual(lues, [`ACT-${A}`, `ACT-${B}`]);
          await c.query("insert into actions (id, filiale_id, titre) values ('ACT-LS', $1, 'interdite')", [A]);
        },
        { lectureSeule: true },
      ),
    );
    // 25006 : « cannot execute INSERT in a read-only transaction ». Le refus vient
    // de la base, pas d'un contrôle applicatif que l'on pourrait oublier.
    assert.equal(erreur.code, '25006', `attendu 25006, obtenu ${erreur.code} : ${erreur.message}`);
  });
});

/* =====================================================================
 *  §5 — Périmètre multi-filiales
 * ===================================================================== */

describe('§5 — périmètre multi-filiales', () => {
  test('lit toutes les filiales de son périmètre, et rien d’autre', async () => {
    const lues = await avecTransaction(pool, session('groupe', A, [A, B], { perimetreGroupe: false }), async (c) =>
      (await c.query('select id from actions order by id')).rows.map((l) => l.id),
    );
    assert.deepEqual(lues, [`ACT-${A}`, `ACT-${B}`], `ACT-${C} ne doit pas être visible`);
  });

  test('n’écrit que dans la filiale ACTIVE, même sur une filiale de son périmètre de lecture', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, session('groupe', A, [A, B]), async (c) => {
        await c.query("insert into actions (id, filiale_id, titre) values ('ACT-CHEZ-B', $1, 'chez B')", [B]);
      }),
    );
    assert.equal(erreur.code, '42501', `attendu 42501, obtenu ${erreur.code} : ${erreur.message}`);
  });

  test('l’écriture dans la filiale active passe, et elle est attribuée à son auteur', async () => {
    const ligne = await avecTransaction(pool, session('carole', A, [A, B]), async (c) => {
      await c.query("insert into actions (id, filiale_id, titre) values ('ACT-MULTI', $1, 'chez A')", [A]);
      return (await c.query("select filiale_id, cree_par from actions where id = 'ACT-MULTI'")).rows[0];
    });
    assert.equal(ligne.filiale_id, A);
    // `cree_par` vient de f_utilisateur_courant(), donc de grc.utilisateur : c'est
    // le même réglage qui cloisonne et qui trace.
    assert.equal(ligne.cree_par, 'carole');
  });
});

/* =====================================================================
 *  §6 — PERIMETRE_SYSTEME
 * ===================================================================== */

describe('§6 — PERIMETRE_SYSTEME', () => {
  test('le drapeau d’administration y vaut faux, et l’objet est gelé', () => {
    assert.equal(PERIMETRE_SYSTEME.administrationGroupe, false);
    assert.equal(PERIMETRE_SYSTEME.perimetreGroupe, false);
    assert.equal(PERIMETRE_SYSTEME.filialeId, null);
    assert.deepEqual([...PERIMETRE_SYSTEME.filiales], []);
    assert.ok(Object.isFrozen(PERIMETRE_SYSTEME));
  });

  test('il est accepté malgré son périmètre vide, et pose les quatre réglages', async () => {
    const vu = await avecTransaction(pool, PERIMETRE_SYSTEME, async (c) => (await c.query(LES_QUATRE)).rows[0], {
      lectureSeule: true,
    });
    assert.equal(vu.utilisateur, 'systeme');
    assert.equal(vu.filiale_id, '');
    assert.equal(vu.filiales, '');
    assert.equal(vu.administration_groupe, '');
    assert.equal(vu.admin, false);
  });

  test('il ne lit AUCUNE donnée de filiale', async () => {
    const n = await avecTransaction(
      pool,
      PERIMETRE_SYSTEME,
      async (c) => (await c.query('select count(*)::int as n from actions')).rows[0].n,
      { lectureSeule: true },
    );
    assert.equal(n, 0, 'des actions existent chez A, B et C : aucune ne doit lui être visible');
  });

  test('il n’écrit dans aucune filiale : la base lève GRC04, faute de filiale active', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, PERIMETRE_SYSTEME, async (c) => {
        await c.query("insert into actions (id, filiale_id, titre) values ('ACT-SYS', $1, 'système')", [A]);
      }),
    );
    assert.equal(erreur.code, 'GRC04', `attendu GRC04, obtenu ${erreur.code} : ${erreur.message}`);
  });

  test('il n’administre pas le Groupe : l’écriture d’une table de configuration est refusée', async () => {
    const erreur = await erreurAttendue(
      avecTransaction(pool, PERIMETRE_SYSTEME, async (c) => {
        await c.query("insert into filiales (id, code, raison_sociale) values ('FIL-SYS', 'FILSYS', 'Par le système')");
      }),
    );
    assert.equal(erreur.code, '42501', `attendu 42501, obtenu ${erreur.code} : ${erreur.message}`);
  });

  test('une COPIE de PERIMETRE_SYSTEME est refusée : la dispense tient à l’objet, pas à son contenu', async () => {
    // La dispense de `validerPerimetre` est un `perimetre === PERIMETRE_SYSTEME`.
    // Un périmètre vide fabriqué ailleurs — par une désérialisation, par une valeur
    // reçue du navigateur — ne doit surtout pas en bénéficier.
    const copie = { ...PERIMETRE_SYSTEME, filiales: [] };
    const erreur = await erreurAttendue(avecTransaction(pool, copie, async () => 'jamais atteint'));
    assert.ok(erreur instanceof ErreurPerimetre, `attendu ErreurPerimetre, obtenu ${erreur.name}`);
    assert.match(erreur.message, /aucune filiale lisible/);
  });
});
