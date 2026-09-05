/**
 * creation.test.mjs — **créer une filiale** (`PLAN_SERVEUR` §7, lot L4 ; constat Q-149).
 *
 * ── Ce que le produit ne savait pas faire ────────────────────────────────────
 *
 * Mesuré le 04/09/2026 : `insert into filiales` n'apparaissait **nulle part**
 * dans `src/` ni dans `deploy/` — seulement dans les essais et dans
 * `db/verifier_cloisonnement.sql`. Intégrer une société rachetée passait donc
 * par un administrateur de base écrivant du SQL à la main. Or le cadrage dit
 * « 20+ filiales, **acquisitions régulières** » : c'est une opération du métier.
 *
 * ── Les deux propriétés qui coûtent cher si elles manquent ───────────────────
 *
 *  1. **Une filiale sans ses groupes d'annuaire est inaccessible.** Le droit se
 *     résout depuis `GRC-<CODE>-<PROFIL>` : créer la ligne sans les groupes
 *     donnerait une filiale que l'écran affiche et où **personne ne peut
 *     entrer**, y compris celui qui vient de la créer. Le défaut serait
 *     silencieux — premier cas du tableau du `CLAUDE.md` §3.
 *  2. **Les deux écritures sont dans la MÊME transaction.** Une création à
 *     moitié faite est pire qu'une création refusée : elle occupe un code, elle
 *     s'affiche, et elle ne sert à rien. L'essai le vérifie en **cassant** la
 *     seconde écriture et en constatant que la première a disparu.
 *
 * ── Ce que cet essai refuse de tenir pour acquis ─────────────────────────────
 *
 * Que le refus vienne du bon endroit. Un `403` écrit dans la route serait une
 * garde locale — `test/journal-lecture/routes.test.mjs` en interdit déjà le
 * principe pour le journal, et pour la même raison : *le refus doit venir de la
 * déclaration d'accès*. L'essai le vérifie deux fois — par le comportement, et
 * mécaniquement dans la source.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { join } from 'node:path';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon, RACINE_BACKEND } from '../aide/serveur.mjs';

let base;
let applicatif;
/** Compte propriétaire : il ne sert qu'au TÉMOIN, jamais au scénario. */
let proprietaire;
/** Session portant l'administration Groupe : la seule qui peut créer. */
let administration;
/** Session de périmètre Groupe en LECTURE seule : elle doit être refusée. */
let direction;
let creerFiliale;

const PERIMETRE_ADMIN = Object.freeze({
  utilisateurId: 'admin.grc',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: true,
});

/** Même périmètre de LECTURE, sans le pouvoir d'écrire en portée Groupe. */
const PERIMETRE_DIRECTION = Object.freeze({
  ...PERIMETRE_ADMIN,
  utilisateurId: 'direction',
  administrationGroupe: false,
});

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
  ({ creerFiliale } = await moduleCompile('filiales/index.js'));
  administration = await monterGreffon(base, PERIMETRE_ADMIN);
  direction = await monterGreffon(base, PERIMETRE_DIRECTION);
});

after(async () => {
  await administration?.fermer();
  await direction?.fermer();
  await base?.fermer();
});

/**
 * Compte les lignes d'une table, **sous le compte propriétaire**.
 *
 * ⚠️ Ce témoin lisait d'abord sous le compte applicatif, avec un périmètre de
 * deux filiales — et il a rendu **2 là où la base en portait 3**. Ce n'était pas
 * un défaut du produit : `f_perimetre_groupe()` est dérivée, et créer une
 * troisième filiale active la fait basculer à faux ; le témoin cessait donc de
 * voir ce qu'il était chargé de compter, **exactement au moment où il comptait**.
 *
 * Un témoin dont la vue dépend de ce qu'il observe ne mesure rien. Celui-ci lit
 * donc sous le propriétaire, que `pol_filiales_lecture` reconnaît d'emblée
 * (`f_est_proprietaire_base()`), et il ne sert **qu'à compter** — le
 * cloisonnement, lui, s'éprouve par le compte applicatif, ailleurs.
 */
async function compter(sql, parametres = []) {
  return await base.avecPerimetre(
    proprietaire,
    perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      const { rows } = await c.query(sql, parametres);
      return Number(rows[0].n);
    },
  );
}

/* =====================================================================
 *  §1 — La création nominale, et ce qu'elle entraîne
 * ===================================================================== */

describe('§1 — créer une filiale crée aussi de quoi y entrer', () => {
  test('la filiale est créée, son identifiant vient du SERVEUR', async () => {
    const avant = await compter('select count(*)::text as n from filiales');
    assert.ok(avant >= 2, 'matière : le semis doit poser au moins deux filiales');

    const { statut, corps } = await administration.appeler('POST', '/api/filiales', {
      corps: {
        code: 'MAD',
        raison_sociale: 'Dedienne Iberia SA',
        nom_court: 'Iberia',
        pays: 'ES',
        ville: 'Madrid',
        langue_defaut: 'es',
        date_entree: '2026-09-01',
      },
    });

    assert.equal(statut, 201, `création refusée : ${JSON.stringify(corps)}`);
    assert.equal(corps.filiale.code, 'MAD');
    assert.equal(corps.filiale.raison_sociale, 'Dedienne Iberia SA');
    assert.equal(corps.filiale.statut, 'active', 'une filiale se crée active');
    assert.match(
      corps.filiale.id,
      /^FIL-\d+-[0-9a-z]{20,}$/u,
      'l’identifiant doit venir du générateur unique du langage (CONVENTIONS.md §2)',
    );

    assert.equal(await compter('select count(*)::text as n from filiales'), avant + 1);
  });

  test('SI LE JOURNAL REFUSE, LA FILIALE N’EXISTE PAS (constat Q-218)', async () => {
    /* ══════════════════════════════════════════════════════════════════════
       Le constat Q-213 a mis la trace DANS la transaction, et l'essai qui suit
       vérifie qu'elle est écrite. Le troisième passage de la porte S8 a montré
       que **rien ne vérifiait l'autre moitié** : un mutant qui enveloppait
       `journaliser` d'un `try { … } catch {}` laissait le banc **entièrement
       vert**. La propriété qui compte — *une filiale ne peut pas exister sans
       son entrée au journal* — n'était affirmée par personne.

       C'est la règle 2 du §29.3, et elle n'a de valeur que mordue : un journal
       qu'on peut faire taire en le saturant n'est pas inaltérable.

       ⚠️ La panne est fabriquée par un déclencheur qui REFUSE l'insertion au
       journal — c'est ce que produirait un disque plein, une contrainte violée
       ou une chaîne rompue. Il est posé sous le compte PROPRIÉTAIRE, sur une
       base d'essai jetable, et retiré dans le `finally` : sans cela il ferait
       échouer tout ce qui suit dans ce fichier, et l'on chercherait longtemps.
       ══════════════════════════════════════════════════════════════════════ */
    const avecPanne = async (travail) => {
      await base.avecPerimetre(
        proprietaire,
        perimetre('poseur-de-panne', FILIALE_A, [FILIALE_A, FILIALE_B], true),
        async (c) => {
          await c.query(`create or replace function f_essai_journal_en_panne()
                         returns trigger language plpgsql as $$
                         begin raise exception 'journal indisponible (essai Q-218)'; end; $$`);
          await c.query(`create trigger trg_essai_journal_en_panne
                         before insert on journal_audit
                         for each row execute function f_essai_journal_en_panne()`);
        },
        // ⚠️ `annuler: false`. Sans cela `avecPerimetre` ANNULE sa transaction,
        //    le déclencheur disparaît avant l'appel, et l'essai passe au vert en
        //    n'ayant rien éprouvé — la classe de défaut que ce fichier traque.
        { annuler: false },
      );
      try {
        return await travail();
      } finally {
        await base.avecPerimetre(
          proprietaire,
          perimetre('poseur-de-panne', FILIALE_A, [FILIALE_A, FILIALE_B], true),
          async (c) => {
            await c.query('drop trigger if exists trg_essai_journal_en_panne on journal_audit');
            await c.query('drop function if exists f_essai_journal_en_panne()');
          },
          { annuler: false },
        );
      }
    };

    const avant = await compter('select count(*)::text as n from filiales');
    const reponse = await avecPanne(async () =>
      administration.appeler('POST', '/api/filiales', {
        corps: { code: 'ZZZ', raison_sociale: 'Filiale qui ne doit pas naître', pays: 'FR' },
      }),
    );

    assert.notEqual(
      reponse.statut,
      201,
      'La création a RÉUSSI alors que le journal refusait. Une filiale existerait sans ' +
        'aucune entrée au registre qui fait preuve en audit ISO 27001 — pour l’acte le plus ' +
        `structurant du produit. Réponse : ${JSON.stringify(reponse.corps)}`,
    );
    assert.equal(
      await compter('select count(*)::text as n from filiales'),
      avant,
      'La transaction doit être ANNULÉE en entier : ni filiale, ni groupes d’annuaire. ' +
        'Un demi-acte est la forme la plus discrète du défaut.',
    );

    // LA MATIÈRE : la panne était bien levée, et la création remarche après.
    const apres = await administration.appeler('POST', '/api/filiales', {
      corps: { code: 'ZZY', raison_sociale: 'Filiale témoin', pays: 'FR' },
    });
    assert.equal(
      apres.statut,
      201,
      'Sans ce contrôle, un déclencheur resté en place ferait passer l’essai précédent ' +
        `pour la mauvaise raison : ${JSON.stringify(apres.corps)}`,
    );
  });

  test('LA CRÉATION LAISSE UNE TRACE QUI NOMME LA FILIALE (constat Q-213)', async () => {
    /* ══════════════════════════════════════════════════════════════════════
       Ce fichier n'appelait **jamais** `journaliser`. La création validait sa
       transaction, répondait 201, et sa seule trace venait du crochet
       `onResponse` — qui ouvre SA PROPRE transaction, APRÈS la réponse, et
       AVALE son échec.

       Deux conséquences, et la première est la plus grave : si cette trace
       échouait, **une filiale existait sans aucune entrée au journal**, dans le
       registre qui fait preuve en audit ISO 27001, pour l'acte le plus
       structurant du produit. Et même réussie, elle ne portait que la route et
       le statut : on savait qu'une filiale avait été créée, **jamais
       laquelle**.

       ⚠️ La trace est désormais écrite DANS la transaction de la création : si
       le journal refuse, la filiale n'est pas créée. Même raisonnement que la
       synchronisation des groupes d'annuaire — laisser derrière soi une moitié
       de création est la forme la plus discrète du défaut.
       ══════════════════════════════════════════════════════════════════════ */
    const entrees = async () =>
      await base.avecPerimetre(
        proprietaire,
        perimetre('temoin-journal', FILIALE_A, [FILIALE_A, FILIALE_B], true),
        async (c) =>
          (
            await c.query(
              `select "entite_id", "valeurs_apres", "utilisateur_libelle"
                 from "journal_audit"
                where "action" = 'creation' and "entite_type" = 'filiales'
                order by "numero"`,
            )
          ).rows,
      );

    const avant = await entrees();
    const { statut, corps } = await administration.appeler('POST', '/api/filiales', {
      corps: { code: 'OSL', raison_sociale: 'Dedienne Nordics AS', pays: 'NO' },
    });
    assert.equal(statut, 201, JSON.stringify(corps));

    const apres = await entrees();
    assert.equal(
      apres.length,
      avant.length + 1,
      'Une création de filiale doit laisser UNE entrée au journal, écrite par la route ' +
        'elle-même — pas par un crochet qui s’exécute après la réponse et avale ses échecs.',
    );

    const derniere = apres[apres.length - 1];
    assert.equal(
      derniere.entite_id,
      corps.filiale.id,
      'La trace doit nommer LA filiale créée : « une filiale a été créée » sans dire ' +
        'laquelle ne répond à aucune question d’audit.',
    );
    assert.equal(derniere.valeurs_apres.code, 'OSL');
    assert.equal(derniere.valeurs_apres.raison_sociale, 'Dedienne Nordics AS');
    assert.equal(
      derniere.valeurs_apres.statut,
      'active',
      'le statut est ce qui fait basculer f_perimetre_groupe : il doit être au journal',
    );
  });

  test('les groupes d’annuaire de la filiale existent, et sont RENDUS à créer', async () => {
    const { statut, corps } = await administration.appeler('POST', '/api/filiales', {
      corps: { code: 'LIS', raison_sociale: 'Dedienne Portugal Lda', pays: 'PT' },
    });
    assert.equal(statut, 201, JSON.stringify(corps));

    // ── Matière : sans groupes rendus, « la liste est correcte » ne dit rien.
    assert.ok(
      corps.groupes_ad.a_creer.length >= 3,
      `seulement ${corps.groupes_ad.a_creer.length} groupe(s) rendu(s) : une filiale sans ` +
        'groupes est une filiale où personne ne peut entrer, et l’essai n’aurait rien mesuré',
    );
    for (const nom of corps.groupes_ad.a_creer) {
      assert.match(nom, /^GRC-LIS-/u, `« ${nom} » ne concerne pas la filiale créée`);
    }

    // Et ils sont en base, écrits par la MÊME requête HTTP.
    const enBase = await compter(
      'select count(*)::text as n from groupes_ad where filiale_id = (select id from filiales where code = $1)',
      ['LIS'],
    );
    assert.equal(
      enBase,
      corps.groupes_ad.a_creer.length,
      'ce qui est annoncé à créer dans l’annuaire doit exister dans la table',
    );
  });
});

/* =====================================================================
 *  §2 — Les refus, et d'où ils viennent
 * ===================================================================== */

describe('§2 — ce qui est refusé, et par qui', () => {
  test('un périmètre Groupe en LECTURE ne crée pas de filiale', async () => {
    const avant = await compter('select count(*)::text as n from filiales');
    const { statut, corps } = await direction.appeler('POST', '/api/filiales', {
      corps: { code: 'ZZNON', raison_sociale: 'Ne doit pas exister' },
    });

    assert.equal(statut, 403, 'lire le groupe entier ne donne pas le droit de le changer');
    assert.match(
      String(corps.message ?? ''),
      /administration Groupe/iu,
      'le message doit nommer le droit qui manque, pas parler du journal',
    );
    assert.equal(
      await compter('select count(*)::text as n from filiales'),
      avant,
      'aucune filiale ne doit avoir été écrite',
    );
  });

  test('LE REFUS NE VIENT PAS DE LA ROUTE : aucun 403 dans le greffon', () => {
    // Même contrôle mécanique que `test/journal-lecture/routes.test.mjs` : une
    // garde locale marcherait, et ferait diverger le refus de sa déclaration. Le
    // crochet `onRequest` est le seul endroit où un accès se refuse.
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'filiales', 'index.ts'), 'utf8');
    const gardes = [...source.matchAll(/statut:\s*403/gu)];
    assert.equal(
      gardes.length,
      0,
      'le greffon contient une garde 403 : le refus doit venir de la déclaration d’accès',
    );
    // Contrôle symétrique : la déclaration existe bien, sinon l'assertion
    // ci-dessus serait vraie d'un fichier qui ne protège rien.
    assert.match(
      source,
      /perimetre:\s*'administration-groupe'/u,
      'la route doit DÉCLARER l’administration Groupe, faute de quoi rien ne la refuse',
    );
  });

  test('un identifiant proposé est REFUSÉ, pas ignoré', async () => {
    const { statut, corps } = await administration.appeler('POST', '/api/filiales', {
      corps: { id: 'FIL-CHOISI', code: 'ZZID', raison_sociale: 'Identifiant imposé' },
    });
    assert.equal(statut, 400);
    assert.match(String(corps.message ?? ''), /« id »/u, 'le champ fautif doit être nommé');
    assert.equal(
      await compter("select count(*)::text as n from filiales where code = 'ZZID'"),
      0,
      'un corps refusé n’écrit rien',
    );
  });

  test('un code mal formé dit COMMENT l’écrire', async () => {
    const { statut, corps } = await administration.appeler('POST', '/api/filiales', {
      corps: { code: 'mad', raison_sociale: 'Minuscules' },
    });
    assert.equal(statut, 400);
    assert.match(String(corps.message ?? ''), /majuscules/iu);
  });

  test('un code déjà pris rend 409, et le dit précisément', async () => {
    const { statut, corps } = await administration.appeler('POST', '/api/filiales', {
      corps: { code: 'ZZESSA', raison_sociale: 'Doublon de code' },
    });
    assert.equal(statut, 409);
    assert.match(
      String(corps.message ?? ''),
      /ZZESSA/u,
      'l’appelant porte l’administration Groupe : les codes de filiales sont son annuaire, ' +
        'pas un oracle — lui dire lequel est pris est la seule réponse utilisable',
    );
  });
});

/* =====================================================================
 *  §3 — L'atomicité, éprouvée en cassant la seconde écriture
 * ===================================================================== */

describe('§3 — une création à moitié faite est pire qu’une création refusée', () => {
  test('MORSURE : si les groupes d’annuaire échouent, la filiale n’existe pas', async () => {
    const avant = await compter('select count(*)::text as n from filiales');

    // Un client qui laisse passer l'insertion de la filiale et fait échouer la
    // suite : c'est exactement la panne qu'on redoute (perte de connexion,
    // contrainte inattendue) et la seule façon de prouver que la transaction
    // couvre les deux écritures.
    const casse = {
      query: async (texte, parametres) => {
        if (typeof texte === 'string' && texte.includes('insert into "groupes_ad"')) {
          throw new Error('panne simulée pendant la synchronisation des groupes d’annuaire');
        }
        return await applicatif.query(texte, parametres);
      },
    };

    let leve = null;
    try {
      await base.avecPerimetre(
        applicatif,
        perimetre('admin.grc', FILIALE_A, [FILIALE_A, FILIALE_B], true),
        async () => creerFiliale(casse, { code: 'ZZCUT', raison_sociale: 'Coupée en deux' }, 'GRC-'),
        { annuler: false },
      );
    } catch (erreur) {
      leve = erreur;
    }

    assert.ok(leve !== null, 'la panne simulée doit remonter : sans erreur, rien n’est prouvé');
    assert.equal(
      await compter("select count(*)::text as n from filiales where code = 'ZZCUT'"),
      0,
      'la filiale a survécu à l’échec de ses groupes : les deux écritures ne sont pas ' +
        'dans la même transaction, et le produit peut créer des filiales inaccessibles',
    );
    assert.equal(await compter('select count(*)::text as n from filiales'), avant);
  });
});

/* =====================================================================
 *  §4 — La trace : un acte d'administration, une entrée
 * ===================================================================== */

describe('§4 — créer une filiale est un acte tracé', () => {
  test('une création écrit UNE entrée « administration », ni zéro ni deux', async () => {
    const avant = await compter(
      "select count(*)::text as n from journal_audit where action = 'administration'",
    );

    const { statut } = await administration.appeler('POST', '/api/filiales', {
      corps: { code: 'ZZTRC', raison_sociale: 'Filiale tracée' },
    });
    assert.equal(statut, 201);

    // Le crochet `onResponse` trace après la réponse : on lui laisse le temps,
    // sans dormir à l'aveugle — on attend que le compte bouge, ou qu'il soit
    // clair qu'il ne bougera pas.
    let apres = avant;
    for (let essai = 0; essai < 40 && apres === avant; essai += 1) {
      await new Promise((r) => setTimeout(r, 25));
      apres = await compter(
        "select count(*)::text as n from journal_audit where action = 'administration'",
      );
    }

    assert.equal(
      apres,
      avant + 1,
      apres === avant
        ? 'aucune trace : le crochet onResponse ne voit pas cette route comme un acte ' +
          'd’administration — vérifier « action: administrer » dans sa déclaration'
        : `${String(apres - avant)} traces pour un acte : le greffon journalise en plus du crochet`,
    );
  });
});
