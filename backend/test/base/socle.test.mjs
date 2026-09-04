/**
 * socle.test.mjs — ce que `001_socle.sql` promet, éprouvé en exécution réelle.
 *
 * Le socle repose sur quatre promesses que personne ne peut vérifier en lisant du SQL :
 * le journal d'audit est en ajout seul, sa chaîne d'empreintes détecte toute retouche,
 * le verrouillage optimiste ne se contourne pas, et le périmètre de session ne survit
 * pas à la transaction. Chacune est ici mise en défaut délibérément — un test qui ne
 * peut pas échouer ne prouve rien.
 *
 * Chaque assertion vise **une** propriété nommée de `backend/db/CONVENTIONS.md` :
 *   §3  colonnes obligatoires et verrouillage optimiste (risque projet P1)
 *   §11 périmètre de session et Row Level Security
 *   §12 journal d'audit : ajout seul, chaînage, vérification
 *   §14 rôles et privilèges
 *   §15 codes d'erreur applicatifs (GRC01)
 *
 * Base neuve à chaque exécution, migrée par `db/migrate.mjs` : voir `../aide/base.mjs`.
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 *
 * Note de dépendance : ces tests portent sur le socle seul. Quand `004_rls.sql`
 * activera `force row level security`, les insertions faites ici devront satisfaire les
 * politiques — elles sont déjà exécutées sous un périmètre explicite là où c'est
 * possible. Une régression de ce fichier après `004` serait un constat à instruire,
 * pas un test à assouplir.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { erreurAttendue, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Connexion du compte propriétaire (`grc_proprietaire`) : DDL et migrations. */
let proprietaire;
/** Connexion du compte applicatif (`grc_app`) : ce que le service peut réellement faire. */
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
});

after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  Outils locaux
 * ===================================================================== */

/**
 * Exécute une instruction attendue en échec, dans sa propre transaction, et rend
 * l'erreur. La transaction est annulée dans tous les cas : une erreur SQL avorte la
 * transaction courante, et sans ce nettoyage la connexion resterait inutilisable pour
 * les tests suivants.
 */
async function refus(client, instruction) {
  await client.query('begin');
  try {
    return await erreurAttendue(client.query(instruction));
  } finally {
    // `finally` et non une simple ligne suivante : si l'instruction attendue en échec
    // réussissait, `erreurAttendue` lèverait — et la connexion resterait dans une
    // transaction ouverte, qui avalerait le DDL des tests suivants. Un banc d'essai
    // qui se sabote ainsi rend des verdicts faux, ce qui est pire qu'un test absent.
    await client.query('rollback');
  }
}

/** Insère `nombre` entrées de journal validées, et renvoie leur nombre total en base. */
async function semerJournal(nombre) {
  await proprietaire.query(
    `insert into journal_audit (action, resume)
     select 'export', 'entrée d''essai ' || g from generate_series(1, $1) g`,
    [nombre],
  );
  return base.valeur(proprietaire, 'select count(*)::int from journal_audit');
}

/** Anomalies renvoyées par la vérification du chaînage, forme compacte et comparable. */
async function anomalies(client, depuis = null) {
  const lignes = await base.lignes(
    client,
    'select numero_entree::int as numero, anomalie from f_journal_audit_verifier($1) order by numero, anomalie',
    [depuis],
  );
  return lignes.map((l) => `${l.numero}:${l.anomalie}`);
}

/* =====================================================================
 *  §12 — Journal d'audit : ajout seul
 * ===================================================================== */

describe("Journal d'audit — ajout seul (CONVENTIONS §12)", () => {
  before(async () => {
    // Le compte applicatif doit pouvoir écrire : c'est tout ce qu'il doit pouvoir faire.
    await applicatif.query(
      "insert into journal_audit (action, resume) values ('demarrage', 'amorçage du banc d''essai')",
    );
  });

  test('couche 1 — le compte applicatif n’a pas le verbe SQL', async () => {
    // `revoke update, delete, truncate … from grc_app` : la tentative est arrêtée par
    // le contrôle de privilèges, avant même d'atteindre le déclencheur.
    for (const instruction of [
      "update journal_audit set resume = 'falsifié'",
      'delete from journal_audit',
      'truncate journal_audit',
    ]) {
      const erreur = await refus(applicatif, instruction);
      assert.equal(
        erreur.code,
        '42501',
        `« ${instruction} » aurait dû être refusée à grc_app faute de privilège (reçu : ${erreur.code}).`,
      );
    }
  });

  test('couche 2 — le propriétaire lui-même est refusé, avec le code GRC01', async () => {
    // C'est la question d'audit : le RSSI, administrateur applicatif, peut-il corriger
    // le journal ? Non — et l'échec est bruyant, pas silencieux.
    for (const [instruction, operation] of [
      ["update journal_audit set resume = 'falsifié'", 'UPDATE'],
      ['delete from journal_audit', 'DELETE'],
      ['truncate journal_audit', 'TRUNCATE'],
    ]) {
      const erreur = await refus(proprietaire, instruction);
      assert.equal(erreur.code, 'GRC01', `« ${instruction} » : SQLSTATE attendu GRC01.`);
      assert.match(erreur.message, new RegExp(`opération ${operation} refusée`));
    }
  });

  test('un update qui ne toucherait aucune ligne est refusé lui aussi', async () => {
    // Le déclencheur est « for each statement » précisément pour cela : un
    // « for each row » ne se déclencherait sur aucune ligne, et l'opération
    // réussirait sans rien faire — l'appelant croirait le journal modifiable.
    const erreur = await refus(proprietaire, "update journal_audit set resume = 'x' where 1 = 0");
    assert.equal(erreur.code, 'GRC01');
  });

  test('couche 2 sans couche 1 — le privilège rendu ne rouvre pas la porte', async () => {
    // On retire volontairement la première couche pour éprouver la seconde. C'est le
    // scénario « un administrateur accorde le droit par erreur, ou une migration mal
    // écrite le rétablit » : le déclencheur doit encore tenir seul.
    await proprietaire.query('grant update, delete, truncate on journal_audit to grc_app');
    try {
      for (const instruction of [
        "update journal_audit set resume = 'falsifié'",
        'delete from journal_audit',
        'truncate journal_audit',
      ]) {
        const erreur = await refus(applicatif, instruction);
        assert.equal(
          erreur.code,
          'GRC01',
          `Privilège rendu, « ${instruction} » aurait dû être arrêtée par le déclencheur.`,
        );
      }
    } finally {
      // Rétablissement systématique : les tests suivants supposent le socle intact.
      await proprietaire.query('revoke update, delete, truncate on journal_audit from grc_app');
    }
  });

  test('couche 3 — les déclencheurs sont « enable always »', async () => {
    // `session_replication_role = replica` désarme les déclencheurs ordinaires. Le
    // contournement est ici sans effet, ce que traduit tgenabled = 'A'. La preuve
    // fonctionnelle exigerait un superutilisateur, que ni grc_app ni
    // grc_proprietaire ne sont — et c'est très bien ainsi.
    const etats = await base.lignes(
      proprietaire,
      `select tgname, tgenabled from pg_trigger
        where tgrelid = 'journal_audit'::regclass and not tgisinternal
        order by tgname`,
    );
    assert.equal(etats.length, 4, 'Quatre déclencheurs attendus : chaînage + trois refus.');
    for (const { tgname, tgenabled } of etats) {
      assert.equal(tgenabled, 'A', `${tgname} n'est pas en « enable always ».`);
    }
  });

  test('couche 4 — le compte applicatif ne possède pas la table', async () => {
    // Seul le propriétaire peut désactiver un déclencheur. Si grc_app possédait
    // journal_audit, les couches 2 et 3 ne vaudraient plus rien.
    const proprietaireTable = await base.valeur(
      proprietaire,
      "select pg_get_userbyid(relowner) from pg_class where oid = 'journal_audit'::regclass",
    );
    assert.notEqual(proprietaireTable, 'grc_app');
  });
});

/* =====================================================================
 *  §12 — Chaînage par empreinte
 * ===================================================================== */

describe("Journal d'audit — chaînage par empreinte (CONVENTIONS §12)", () => {
  const ENTREES = 5;

  before(async () => {
    await semerJournal(ENTREES);
  });

  test('un journal sain ne renvoie aucune anomalie', async () => {
    assert.deepEqual(await anomalies(proprietaire), []);
  });

  test('la chaîne est numérotée sans trou et chaque maillon pointe le précédent', async () => {
    const lignes = await base.lignes(
      proprietaire,
      'select numero::int as numero, empreinte, empreinte_precedente from journal_audit order by numero',
    );
    assert.equal(lignes[0].numero, 1);
    assert.equal(lignes[0].empreinte_precedente, null, "L'entrée de genèse ne pointe rien.");
    for (let index = 1; index < lignes.length; index += 1) {
      assert.equal(lignes[index].numero, lignes[index - 1].numero + 1);
      assert.equal(lignes[index].empreinte_precedente, lignes[index - 1].empreinte);
    }
  });

  test('falsification naïve d’une ligne : empreinte_invalide', async () => {
    // Désactiver un déclencheur est le SEUL chemin de falsification, et il demande
    // le propriétaire de la base. C'est exactement le scénario que le chaînage est
    // censé rendre détectable a posteriori (CONVENTIONS §12, « ce qui n'est pas
    // couvert »). Tout se passe dans une transaction annulée en sortie.
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_maj');
      await proprietaire.query("update journal_audit set resume = 'falsifié' where numero = 3");

      assert.deepEqual(await anomalies(proprietaire), ['3:empreinte_invalide']);
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('falsification soignée (empreinte recalculée) : chainage_rompu sur la suivante', async () => {
    // Le falsificateur avisé recalcule l'empreinte de la ligne qu'il retouche : elle
    // redevient cohérente avec elle-même. C'est là que le CHAÎNAGE fait son travail —
    // l'entrée suivante déclare une empreinte précédente qui n'existe plus.
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_maj');
      await proprietaire.query(
        `update journal_audit j
            set resume = 'falsifié',
                empreinte = encode(sha256(convert_to(
                    f_journal_audit_charge_utile(
                        j.numero, j.id, j.horodatage, j.filiale_id, j.utilisateur_id,
                        j.utilisateur_libelle, j.session_id, j.adresse_ip, j.action,
                        j.entite_type, j.entite_id, 'falsifié', j.valeurs_avant,
                        j.valeurs_apres, j.version_application, j.empreinte_precedente),
                    'UTF8')), 'hex')
          where j.numero = 3`,
      );

      const trouvees = await anomalies(proprietaire);
      assert.deepEqual(
        trouvees,
        ['4:chainage_rompu'],
        'La ligne retouchée redevient cohérente, mais la chaîne, elle, ne suit plus.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('suppression d’une ligne : numero_manquant', async () => {
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_suppr');
      await proprietaire.query('delete from journal_audit where numero = 3');

      const trouvees = await anomalies(proprietaire);
      assert.ok(
        trouvees.includes('4:numero_manquant'),
        `Trou dans la numérotation non détecté (anomalies : ${trouvees.join(', ')}).`,
      );
      assert.ok(
        trouvees.includes('4:chainage_rompu'),
        'La disparition d’un maillon rompt aussi la chaîne d’empreintes.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('le journal est intact après les falsifications annulées', async () => {
    // Garde-fou du banc d'essai lui-même : si un « rollback » avait été oublié, les
    // tests suivants raisonneraient sur un journal corrompu sans le savoir.
    assert.deepEqual(await anomalies(proprietaire), []);
  });

  test('vérification partielle : chaine_tronquee est informatif, pas une alerte', async () => {
    const trouvees = await anomalies(proprietaire, 3);
    assert.deepEqual(trouvees, ['3:chaine_tronquee']);
  });
});

/* =====================================================================
 *  §12 — Le client ne peut rien forger
 * ===================================================================== */

describe("Journal d'audit — le client ne peut rien forger (CONVENTIONS §12)", () => {
  test('numero, horodatage et empreintes fournis par le client sont écrasés', async () => {
    const dernier = await base.lignes(
      proprietaire,
      'select numero::int as numero, empreinte from journal_audit order by numero desc limit 1',
    );
    const attenduNumero = (dernier[0]?.numero ?? 0) + 1;
    const attenduPrecedente = dernier[0]?.empreinte ?? null;

    // ── LA FORGE EST COMMISE, PLUS ANNULÉE — migration 008, condition E6 ──
    //
    // Ce bloc ouvrait une transaction, insérait, relisait et **annulait**, le
    // tout sous le compte applicatif. Depuis que la lecture du journal est
    // cloisonnée, la relecture ne rend plus rien : la ligne forgée ne porte
    // aucune filiale — c'est ce qui la rend insérable —, et une entrée
    // transversale est réservée au périmètre Groupe (§29.7), impossible à poser
    // ici puisque cette base n'a aucune filiale active.
    //
    // Deux rôles, et le partage est celui du sens de l'essai :
    //   · **l'INSERT reste sous `applicatif`** — c'est le sujet : « le CLIENT ne
    //     peut rien forger ». Le faire sous le propriétaire aurait éprouvé
    //     quelqu'un d'autre ;
    //   · **la RELECTURE passe sous `proprietaire`** — ce n'est pas le sujet,
    //     c'est l'instrument de mesure, et le §29.7 lui accorde la chaîne
    //     entière précisément pour que le chaînage puisse numéroter.
    //
    // Le `rollback` disparaît avec la transaction : deux connexions distinctes
    // ne voient pas les écritures non validées l'une de l'autre. Ça ne coûte
    // rien — `ouvrirBaseEssai` monte une base neuve par fichier d'essai, et le
    // journal est en ajout seul de toute façon : il n'y avait rien à nettoyer.

    // Valeurs volontairement plausibles : le domaine empreinte_sha256 impose
    // 64 caractères hexadécimaux, donc un « FORGE » serait rejeté par le type
    // avant d'atteindre le déclencheur. Ici, rien ne distingue ces valeurs de
    // vraies empreintes — et elles sont pourtant écrasées.
    await applicatif.query(
      `insert into journal_audit
           (numero, horodatage, empreinte, empreinte_precedente, action, resume)
       values ($1, timestamptz '2000-01-01 00:00:00+00', $2, $3, 'export', 'tentative de forge')`,
      [999_999, 'a'.repeat(64), 'b'.repeat(64)],
    );

    const lignes = await base.lignes(
      proprietaire,
      `select numero::int as numero, empreinte, empreinte_precedente,
              horodatage > now() - interval '1 minute' as horodatage_recent
         from journal_audit where resume = 'tentative de forge'`,
    );
    assert.equal(
      lignes.length,
      1,
      'La ligne forgée doit exister : sans elle, les assertions ci-dessous ne portent sur rien.',
    );
    const ligne = lignes[0];

    assert.equal(ligne.numero, attenduNumero, 'Le numéro vient du déclencheur, pas du client.');
    assert.equal(ligne.empreinte_precedente, attenduPrecedente, 'La chaîne est reprise en base.');
    assert.notEqual(ligne.empreinte, 'a'.repeat(64), "L'empreinte annoncée a été écrasée.");
    assert.equal(ligne.horodatage_recent, true, "L'horodatage est celui du serveur.");

    // Et le résultat reste une chaîne saine : la forge n'a pas laissé de trace.
    assert.deepEqual(await anomalies(proprietaire), []);
  });
});

/* =====================================================================
 *  §3 — Verrouillage optimiste (risque projet P1)
 * ===================================================================== */

describe('Verrouillage optimiste (CONVENTIONS §3, risque projet P1)', () => {
  const IDENTIFIANT = 'FIL-1720000000000-001';

  /**
   * Crée la filiale d'essai dans une transaction confiée à `travail`, puis annule.
   *
   * La fixture DÉCLARE qu'elle administre : créer une filiale est un acte
   * d'administration Groupe depuis le second passage de la porte de sécurité S1
   * (constat N-2), `filiales` ayant rejoint les tables de configuration —
   * `CONVENTIONS.md` §17.4. Sans le réglage, l'insertion est refusée par la politique
   * d'écriture (`42501`), et c'est le comportement voulu : le `force row level security`
   * y soumet même le compte propriétaire, qui est celui employé ici.
   *
   * Ce n'est pas un assouplissement : le jeu d'essai dit désormais ce qu'il fait, au lieu
   * de s'appuyer sur une écriture que n'importe quelle filiale pouvait faire sur la fiche
   * de n'importe quelle autre.
   *
   * Le réglage vaut pour TOUTE la transaction, et pas seulement pour l'insertion, parce
   * que ces trois tests prennent `filiales` pour SUJET : ils la modifient pour éprouver le
   * verrouillage optimiste. Ce qu'ils vérifient — l'incrément de `version`, le gel de
   * `cree_le` / `cree_par`, le « zéro ligne » d'une version périmée — est porté par le
   * déclencheur `f_maj_tracabilite()` et ne dépend en rien du drapeau : la propriété
   * éprouvée est donc inchangée, seule la déclaration d'intention est ajoutée.
   */
  async function avecFiliale(travail) {
    await base.avecPerimetre(proprietaire, perimetre('jdupont', IDENTIFIANT), async (client) => {
      await client.query("select set_config('grc.administration_groupe', 'oui', true)");
      await client.query(
        `insert into filiales (id, code, raison_sociale) values ($1, 'TLS', 'Dedienne Toulouse')`,
        [IDENTIFIANT],
      );
      await travail(client);
    });
  }

  test('une version périmée n’affecte aucune ligne — c’est le conflit GRC03 de l’API', async () => {
    await avecFiliale(async (client) => {
      const premiere = await client.query(
        "update filiales set nom_court = 'Toulouse' where id = $1 and version = $2",
        [IDENTIFIANT, 1],
      );
      assert.equal(premiere.rowCount, 1, "La première écriture, à jour, doit passer.");

      // Second écrivain, resté sur la version 1 : il n'écrase rien. L'API traduit
      // ce « zéro ligne » en GRC03 « modifié entre-temps » (CONVENTIONS §15).
      const seconde = await client.query(
        "update filiales set nom_court = 'Écrasement' where id = $1 and version = $2",
        [IDENTIFIANT, 1],
      );
      assert.equal(seconde.rowCount, 0, 'Une version périmée ne doit rien écraser.');

      const nomCourt = await base.valeur(client, 'select nom_court from filiales where id = $1', [
        IDENTIFIANT,
      ]);
      assert.equal(nomCourt, 'Toulouse', "L'écriture perdante n'a laissé aucune trace.");
    });
  });

  test('le déclencheur incrémente version et ignore la valeur envoyée par le client', async () => {
    await avecFiliale(async (client) => {
      await client.query('update filiales set nom_court = $2, version = 42 where id = $1', [
        IDENTIFIANT,
        'Toulouse',
      ]);
      const version = await base.valeur(client, 'select version from filiales where id = $1', [
        IDENTIFIANT,
      ]);
      assert.equal(
        version,
        2,
        'La version est old.version + 1 ; la valeur du client (42) doit être ignorée.',
      );
    });
  });

  test('cree_le et cree_par sont gelés, modifie_le et modifie_par sont posés par la base', async () => {
    await avecFiliale(async (client) => {
      const avant = (
        await base.lignes(client, 'select cree_le, cree_par, modifie_le from filiales where id = $1', [
          IDENTIFIANT,
        ])
      )[0];
      assert.equal(avant.cree_par, 'jdupont', 'cree_par vient de f_utilisateur_courant().');
      assert.equal(avant.modifie_le, null, "Une ligne jamais modifiée n'a pas de date de modification.");

      await client.query(
        `update filiales
            set nom_court = 'Toulouse',
                cree_par  = 'pirate',
                cree_le   = timestamptz '2000-01-01 00:00:00+00'
          where id = $1`,
        [IDENTIFIANT],
      );

      const apres = (
        await base.lignes(
          client,
          'select cree_le, cree_par, modifie_le, modifie_par from filiales where id = $1',
          [IDENTIFIANT],
        )
      )[0];
      assert.equal(apres.cree_par, 'jdupont', 'cree_par est non réinscriptible.');
      assert.deepEqual(apres.cree_le, avant.cree_le, 'cree_le est non réinscriptible.');
      assert.notEqual(apres.modifie_le, null, 'modifie_le est posé par le déclencheur.');
      assert.equal(apres.modifie_par, 'jdupont', 'modifie_par vient de f_utilisateur_courant().');
    });
  });
});

/* =====================================================================
 *  §11 — Périmètre de session
 * ===================================================================== */

describe('Périmètre de session (CONVENTIONS §11)', () => {
  /** Connexion dédiée : on observe ici l'état d'une session, il ne doit rien lui arriver d'autre. */
  let session;

  before(async () => {
    session = await base.nouvelleConnexion('app');
  });

  /** Les trois fonctions de contexte, lues d'un coup. */
  async function contexte(client) {
    const lignes = await base.lignes(
      client,
      `select f_utilisateur_courant() as utilisateur,
              f_filiale_courante()    as filiale,
              f_filiales_autorisees() as filiales`,
    );
    return lignes[0];
  }

  test('sans réglage : « systeme », aucune filiale active, périmètre vide', async () => {
    // C'est le contexte des migrations et des timers systemd : attribué, mais sans
    // aucun accès aux données d'une filiale.
    const etat = await contexte(session);
    assert.equal(etat.utilisateur, 'systeme');
    assert.equal(etat.filiale, null);
    assert.deepEqual(etat.filiales, []);
  });

  test('le périmètre posé par set_config(…, true) est lu par les trois fonctions', async () => {
    await base.avecPerimetre(
      session,
      perimetre('jdupont', 'FIL-A', ['FIL-A', 'FIL-B']),
      async (client) => {
        const etat = await contexte(client);
        assert.equal(etat.utilisateur, 'jdupont');
        assert.equal(etat.filiale, 'FIL-A', 'La filiale ACTIVE est le périmètre d’écriture.');
        assert.deepEqual(etat.filiales, ['FIL-A', 'FIL-B'], 'Le périmètre de LECTURE peut être plus large.');
      },
    );
  });

  test('le périmètre meurt au rollback', async () => {
    await base.avecPerimetre(session, perimetre('jdupont', 'FIL-A'), async () => {});
    const etat = await contexte(session);
    assert.equal(etat.utilisateur, 'systeme');
    assert.equal(etat.filiale, null);
    assert.deepEqual(etat.filiales, []);
  });

  test('le périmètre meurt au COMMIT — la condition du pool de connexions', async () => {
    // C'est l'assertion la plus importante du fichier. Une connexion rendue au pool
    // après un commit ne doit pas emporter le périmètre de l'utilisateur précédent :
    // sans cela, la requête suivante — un autre utilisateur, une autre filiale —
    // hériterait d'un périmètre qui n'est pas le sien. Le cloisonnement entier tient
    // à ce que « set local » soit bien local.
    await base.avecPerimetre(session, perimetre('mdurand', 'FIL-Z', ['FIL-Z']), async () => {}, {
      annuler: false,
    });

    const etat = await contexte(session);
    assert.equal(etat.utilisateur, 'systeme', 'Le réglage n’a pas survécu au commit.');
    assert.equal(etat.filiale, null);
    assert.deepEqual(etat.filiales, []);
  });

  test('une session vierge du pool ne voit aucun périmètre résiduel', async () => {
    const autre = await base.nouvelleConnexion('app');
    const etat = await contexte(autre);
    assert.equal(etat.utilisateur, 'systeme');
    assert.deepEqual(etat.filiales, []);
  });
});

/* =====================================================================
 *  §14 — Rôles et privilèges
 * ===================================================================== */

describe('Rôles et privilèges (CONVENTIONS §14)', () => {
  test('grc_app n’a ni SUPERUSER, ni BYPASSRLS, ni CREATEROLE, ni CREATEDB', async () => {
    // BYPASSRLS rendrait toute la Row Level Security décorative ; SUPERUSER rendrait
    // le reste sans objet. C'est le contrôle S1 de la grille de sécurité.
    const role = (
      await base.lignes(
        proprietaire,
        `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
           from pg_roles where rolname = 'grc_app'`,
      )
    )[0];
    assert.ok(role, 'Le rôle grc_app doit exister (db/dev/preparer_base_dev.sh).');
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
    assert.equal(role.rolcreaterole, false);
    assert.equal(role.rolcreatedb, false);
  });

  test('grc_app ne possède aucune table du schéma', async () => {
    // Couche 4 de l'ajout seul : seul le propriétaire peut désactiver un déclencheur.
    const possedees = await base.lignes(
      proprietaire,
      `select c.relname
         from pg_class c
         join pg_roles r on r.oid = c.relowner
         join pg_namespace n on n.oid = c.relnamespace
        where r.rolname = 'grc_app' and n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
        order by 1`,
    );
    assert.deepEqual(
      possedees.map((l) => l.relname),
      [],
      'Le rôle applicatif ne doit posséder aucun objet : il ne pourrait plus être bridé.',
    );
  });

  test('grc_app n’a que select et insert sur journal_audit', async () => {
    const droits = (
      await base.lignes(
        proprietaire,
        `select has_table_privilege('grc_app', 'journal_audit', 'select')   as lecture,
                has_table_privilege('grc_app', 'journal_audit', 'insert')   as ajout,
                has_table_privilege('grc_app', 'journal_audit', 'update')   as modification,
                has_table_privilege('grc_app', 'journal_audit', 'delete')   as suppression,
                has_table_privilege('grc_app', 'journal_audit', 'truncate') as vidage`,
      )
    )[0];
    assert.equal(droits.lecture, true, 'Le service doit pouvoir consulter le journal.');
    assert.equal(droits.ajout, true, 'Le service doit pouvoir écrire au journal.');
    assert.equal(droits.modification, false);
    assert.equal(droits.suppression, false);
    assert.equal(droits.vidage, false);
  });

  test('grc_app a bien le CRUD sur les tables métier (privilèges par défaut du §0)', async () => {
    // Contrôle symétrique : si les « alter default privileges » de 001 sautaient, le
    // service ne pourrait plus rien écrire et les tests ci-dessus passeraient quand
    // même. Une restriction n'a de valeur que si le cas nominal est vérifié aussi.
    const droits = (
      await base.lignes(
        proprietaire,
        `select has_table_privilege('grc_app', 'filiales', 'select') as lecture,
                has_table_privilege('grc_app', 'filiales', 'insert') as ajout,
                has_table_privilege('grc_app', 'filiales', 'update') as modification,
                has_table_privilege('grc_app', 'filiales', 'delete') as suppression`,
      )
    )[0];
    assert.deepEqual(droits, { lecture: true, ajout: true, modification: true, suppression: true });
  });

  test('grc_lecture est en lecture seule', async () => {
    const droits = (
      await base.lignes(
        proprietaire,
        `select has_table_privilege('grc_lecture', 'filiales', 'select') as lecture,
                has_table_privilege('grc_lecture', 'filiales', 'insert') as ajout,
                has_table_privilege('grc_lecture', 'filiales', 'update') as modification,
                has_table_privilege('grc_lecture', 'filiales', 'delete') as suppression,
                has_table_privilege('grc_lecture', 'journal_audit', 'select') as journal`,
      )
    )[0];
    assert.deepEqual(droits, {
      lecture: true,
      ajout: false,
      modification: false,
      suppression: false,
      journal: true,
    });
  });

  test('le propriétaire des tables n’est pas le compte du service', async () => {
    const proprietaires = await base.lignes(
      proprietaire,
      `select distinct pg_get_userbyid(c.relowner) as proprietaire
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    assert.equal(proprietaires.length, 1, 'Toutes les tables doivent avoir le même propriétaire.');
    assert.notEqual(proprietaires[0].proprietaire, 'grc_app');
  });
});

/* =====================================================================
 *  Entropie des identifiants engendrés (CONVENTIONS §2)
 * =====================================================================
 *
 *  Constat BLOQUANT du troisième passage de la porte S2, et son histoire vaut d'être
 *  écrite ici plutôt que perdue : le PREMIER banc d'essai de la vague 1 avait déjà mesuré
 *  et signalé le défaut — « ids engendrés: 100, distincts: 95, millisecondes distinctes:
 *  2 » — avec la remarque que c'est le générateur du serveur, celui de l'import et de la
 *  reprise, où une collision devient un refus d'écriture. La mesure existait ; ce qui
 *  manquait était le test qui la REJOUE. Deux vagues plus tard, mille valeurs d'aléa ont
 *  produit le seul bloquant du passage : un import annonçant 250 lignes en écrivait 223,
 *  sans signaler le moindre incident, et le questionnaire AirCyber perdait 13 réponses sur
 *  234 — donc un score de conformité faux, dans un outil qui sert de preuve en audit.
 *
 *  Ces tests tiennent la propriété pour qu'elle ne se reperde pas. Le premier est le seul
 *  qui compte vraiment : il MESURE, en volume, dans les conditions qui déclenchent le
 *  défaut — quelques centaines de tirages dans la même milliseconde.
 */

describe('Identifiants engendrés par le serveur (CONVENTIONS §2)', () => {
  /** Tire `n` identifiants en une seule requête : ils tombent dans la même milliseconde. */
  async function tirer(n, prefixe = 'RISK') {
    return (await base.lignes(
      proprietaire,
      `select f_generer_id($1) as v from generate_series(1, $2)`,
      [prefixe, n],
    )).map((l) => l.v);
  }

  test('250 tirages dans la même milliseconde : AUCUNE collision', async () => {
    // 250, parce que c'est la taille du lot du constat. Le test vérifie d'abord qu'il
    // éprouve bien ce qu'il annonce : si les tirages s'étalaient sur des centaines de
    // millisecondes, l'absence de collision ne prouverait rien du générateur.
    const ids = await tirer(250);
    const millisecondes = new Set(ids.map((v) => v.split('-')[1]));
    assert.ok(
      millisecondes.size <= 10,
      `Le test doit tirer dans un très petit nombre de millisecondes ; il en a vu ${millisecondes.size}.`,
    );
    assert.equal(
      new Set(ids).size, 250,
      `Collisions : ${250 - new Set(ids).size}. Une collision de clé primaire fait perdre une `
        + 'ligne au milieu d’un lot annoncé complet (porte S2).',
    );
  });

  test('20 000 tirages : toujours aucune collision', async () => {
    // Très au-delà du besoin — un import du questionnaire AirCyber en fait 234 — mais
    // c'est le volume qui donne au chiffre sa valeur : à 1 000 valeurs d'aléa, celui-ci
    // rendait des milliers de doublons.
    const ids = await tirer(20_000);
    assert.equal(new Set(ids).size, 20_000);
  });

  test('le FORMAT de la convention est tenu, segment par segment', async () => {
    // §2 fige « <PRÉFIXE>-<millisecondes>-<aléa> ». Le correctif élargit le troisième
    // segment ; il ne touche pas aux deux premiers, et l'horodatage reste la clé de tri.
    const [id] = await tirer(1, 'mesure');
    const segments = id.split('-');
    assert.equal(segments.length, 3, `Trois segments attendus : ${id}`);
    assert.equal(segments[0], 'MESURE', 'Le préfixe est mis en capitales.');
    assert.match(segments[1], /^\d{13}$/, 'Millisecondes depuis l’époque Unix.');
    assert.match(segments[2], /^[0-9a-f]{32}$/, 'Part aléatoire : 32 caractères hexadécimaux.');

    // Et l'horodatage est bien celui de maintenant, pas une constante.
    const ecart = Math.abs(Date.now() - Number(segments[1]));
    assert.ok(ecart < 60_000, `Horodatage incohérent : ${segments[1]}`);
  });

  test('la longueur reste dans le domaine, et le déborder est BRUYANT', async () => {
    // id_metier plafonne à 64 caractères. Le plus long préfixe du produit est « MESURE » ;
    // ce test fige la marge, pour qu'un élargissement futur de l'aléa ne la mange pas en
    // silence — le défaut se verrait alors à l'import, pas ici.
    const [id] = await tirer(1, 'MESURE');
    assert.equal(id.length, 53);
    assert.ok(id.length <= 64 - 11, 'Au moins onze caractères de marge sous le plafond du domaine.');

    // Contrôle symétrique : au-delà, la contrainte de domaine refuse, elle ne tronque pas.
    const erreur = await refus(proprietaire, `select f_generer_id('${'P'.repeat(20)}')`);
    assert.equal(erreur.code, '23514', 'Un préfixe démesuré doit échouer, pas produire un id tronqué.');
  });

  test('le JOURNAL D’AUDIT tire ses identifiants du même générateur', async () => {
    // Ce n'est pas un détail de plus : une collision sur journal_audit.id refuse la trace
    // au moment précis où elle doit être écrite, sur la seule table dont l'objet est de
    // faire preuve. Le lien est constaté dans le catalogue plutôt que supposé.
    const defaut = await base.valeur(
      proprietaire,
      `select pg_get_expr(d.adbin, d.adrelid)
         from pg_attrdef d
         join pg_class c on c.oid = d.adrelid
         join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
        where c.relname = 'journal_audit' and a.attname = 'id'`,
    );
    assert.match(defaut, /f_generer_id\('LOG'/);
  });

  test('LE GARDE-FOU MORD : l’ancien générateur à mille valeurs est REFUSÉ', async () => {
    // Contrôle de morsure sur le garde-fou, pas sur le générateur : on remet la fonction
    // dans sa forme d'origine, celle qui a produit le bloquant, et on exige que le
    // déploiement le dise.
    await proprietaire.query(
      `create or replace function f_generer_id(p_prefixe text) returns id_metier
           language sql volatile set search_path = pg_catalog, public, pg_temp as $x$
         select (upper(p_prefixe) || '-'
                 || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '-'
                 || floor(random() * 1000)::integer::text)::id_metier;
       $x$`,
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        'select objet, anomalie from f_verifier_entropie_identifiants()',
      );
      assert.deepEqual(anomalies, [
        { objet: 'f_generer_id', anomalie: 'identifiant_entropie_faible' },
      ]);

      // Et il remonte par le POINT D'APPEL : c'est ce qui le rend branché sur les deux
      // chemins de déploiement sans qu'aucun fichier ait changé (CONVENTIONS §19.4).
      const parLePoint = await base.lignes(
        proprietaire,
        "select controle from f_verifier_schema() where objet = 'f_generer_id'",
      );
      assert.deepEqual(parLePoint.map((l) => l.controle), ['entropie_identifiants']);

      // La preuve par la mesure, tant qu'on y est : la forme fautive collisionne.
      const ids = await tirer(250);
      assert.ok(
        new Set(ids).size < 250,
        'La forme d’origine DOIT collisionner : sinon ce test ne prouve rien.',
      );
    } finally {
      await proprietaire.query(
        `create or replace function f_generer_id(p_prefixe text) returns id_metier
             language sql volatile set search_path = pg_catalog, public, pg_temp as $x$
           select (upper(p_prefixe) || '-'
                   || (extract(epoch from clock_timestamp()) * 1000)::bigint::text || '-'
                   || replace(gen_random_uuid()::text, '-', ''))::id_metier;
         $x$`,
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('LE BALAYAGE MORD : un autre tirage étroit sous une unicité est réclamé', async () => {
    // Le motif « une valeur qui se veut unique, engendrée par une expression étroite » ne
    // vit jamais seul. Le balayage cherche la FORME dans le catalogue, pas le nom de la
    // fonction qui la portait — une colonne future y tombera sans que ce fichier bouge.
    await proprietaire.query(
      `create table essai_entropie (
           id text not null default ('E-' || floor(random() * 1000)::text),
           constraint pk_essai_entropie primary key (id))`,
    );
    try {
      const anomalies = await base.lignes(
        proprietaire,
        "select objet, anomalie from f_verifier_entropie_identifiants() "
          + "where objet like 'essai_entropie%'",
      );
      assert.deepEqual(anomalies, [
        { objet: 'essai_entropie.id', anomalie: 'valeur_unique_a_hasard_etroit' },
      ]);
    } finally {
      await proprietaire.query('drop table if exists essai_entropie');
    }

    // Contrôle symétrique : le même tirage sur une colonne SANS promesse d'unicité ne
    // déclenche rien — un garde-fou qui crierait sur tout ne serait plus lu.
    await proprietaire.query(
      `create table essai_entropie (
           id text not null, echantillon integer default floor(random() * 1000),
           constraint pk_essai_entropie primary key (id))`,
    );
    try {
      assert.deepEqual(
        await base.lignes(
          proprietaire,
          "select objet from f_verifier_entropie_identifiants() where objet like 'essai_entropie%'",
        ),
        [],
      );
    } finally {
      await proprietaire.query('drop table if exists essai_entropie');
    }
  });
});
