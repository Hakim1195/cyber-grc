/**
 * tiers-anticycle.test.mjs — **LA CHAÎNE DE SOUS-TRAITANCE NE BOUCLE PAS, ET LE
 * RANG SE DÉRIVE** (lot L21, action 21.1)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi elle existe SÉPARÉMENT du garde
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le critère 21.1 dit : *« la chaîne de sous-traitance est récursive : un
 * prestataire peut en porter d'autres. Contrainte anti-cycle **en base**, pas
 * dans la route. »*
 *
 * Le garde-fou `f_verifier_tiers()` tient la moitié catalographique — le
 * déclencheur existe, et il est armé sur ses deux événements, mesuré par
 * `tgtype`. Il **ne peut pas** tenir l'autre moitié : `CONVENTIONS.md` §41
 * interdit à un garde de schéma de lire — ou d'écrire — des lignes d'une table
 * cloisonnée, parce que `install.sh` appelle `f_verifier_schema()` **sans
 * périmètre**. Un garde qui y sèmerait sa filiale témoin échouerait pour une
 * raison étrangère au défaut cherché, ou — pire — conclurait au vert.
 *
 * C'est donc ici que la MORSURE se mesure.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | La boucle de longueur un est refusée — par une CONTRAINTE, pas un déclencheur |
 * | 2 | La boucle de longueur deux est refusée **en SQL direct** |
 * | 3 | Et elle l'est **aussi par la route générique** — les deux chemins, pas un |
 * | 4 | Une boucle longue (A→B→C→A) est refusée : le parcours est bien récursif |
 * | 5 | Le RANG se dérive, et INTERCALER un maillon déplace les rangs en aval |
 * | 6 | Le cloisonnement : la voisine ne peut pas se rattacher à un tiers qu'elle ne voit pas |
 * | 7 | Le score composite d'un tiers n'est jamais stocké : il n'existe aucune colonne |
 *
 * ── ⚠️ POURQUOI LES §2 ET §3 SONT DEUX ESSAIS ET NON UN ────────────────────
 *
 * Leçon du 10/09/2026, constat **Q-282** : *un essai qui passe par la route ne
 * mesure pas le déclencheur*, la route reposant elle-même la bonne valeur et
 * masquant l'erreur. Et réciproquement, un essai qui ne passe QUE par le SQL ne
 * dit rien de ce qu'un utilisateur reçoit — c'est le constat **Q-325**, où un
 * refus soigné arrivait à l'écran en `500` avec sa pile d'appel.
 *
 * Les deux moitiés sont nécessaires, et chacune a déjà coûté un passage de porte.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let applicatif;
let serveur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Sème un prestataire dans une filiale, hors de toute route. */
async function semerTiers(id, filiale, societe) {
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    async (c) => {
      await c.query(`insert into prestataires (id, filiale_id, societe) values ($1, $2, $3)`, [
        id,
        filiale,
        societe,
      ]);
    },
    { annuler: false },
  );
}

/** Sème une arête. Rend `null` si elle passe, le message d'erreur sinon. */
async function semerArete(id, filiale, donneur, sousTraitant) {
  try {
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', filiale, [filiale]),
      async (c) => {
        await c.query(
          `insert into prestataire_sous_traitance
               (id, filiale_id, prestataire_id, sous_traitant_id) values ($1, $2, $3, $4)`,
          [id, filiale, donneur, sousTraitant],
        );
      },
      { annuler: false },
    );
    return null;
  } catch (erreur) {
    return String(erreur.message ?? erreur);
  }
}

/** La chaîne dérivée sous un donneur d'ordre : [{ sous_traitant_id, rang }]. */
async function chaine(filiale, donneur) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('lecteur', filiale, [filiale]),
    async (c) => {
      const r = await c.query(
        `select sous_traitant_id, rang, cycle_detecte from f_chaine_sous_traitance($1, $2)`,
        [filiale, donneur],
      );
      return r.rows;
    },
  );
}

describe('§1 — la boucle de longueur un est refusée par une CONTRAINTE', () => {
  test('un tiers ne peut pas se sous-traiter à lui-même', async () => {
    await semerTiers('TIERS-SOI', FILIALE_A, 'Autarcie SA');
    const erreur = await semerArete('ST-SOI', FILIALE_A, 'TIERS-SOI', 'TIERS-SOI');

    assert.ok(erreur, 'la boucle de longueur un doit être refusée');
    // ⚠️ C'est bien la CONTRAINTE qui refuse, et non le déclencheur : une boucle
    // de longueur un n'a pas de chemin, donc `f_chaine_sous_traitance` ne la
    // trouverait pas. Les deux mécanismes couvrent deux cas disjoints, et c'est
    // pour cela qu'il en faut deux.
    assert.match(erreur, /ck_prestataire_sous_traitance_boucle/);
  });
});

describe('§2 — la boucle de longueur deux est refusée EN SQL DIRECT', () => {
  test('A → B posée, B → A refusée', async () => {
    await semerTiers('TIERS-A1', FILIALE_A, 'Hébergeur Alpha');
    await semerTiers('TIERS-B1', FILIALE_A, 'Sauvegardes Beta');

    assert.equal(await semerArete('ST-A1B1', FILIALE_A, 'TIERS-A1', 'TIERS-B1'), null);

    const erreur = await semerArete('ST-B1A1', FILIALE_A, 'TIERS-B1', 'TIERS-A1');
    assert.ok(erreur, 'la boucle doit être refusée');
    assert.match(erreur, /referme une boucle/);
    // Le message NOMME le chemin : sans lui, l'utilisateur devrait reconstituer
    // à la main la chaîne qui referme, sur un graphe qu'il ne voit pas en entier.
    assert.match(erreur, /TIERS-A1/);
  });

  test('⚠️ LA MUTATION : sans le déclencheur, la boucle passerait', async () => {
    // Un essai qui ne fait jamais DÉCIDER la règle ne la couvre pas (constat
    // Q-210). On désarme le déclencheur, on rejoue, et l'on vérifie que la
    // boucle passe — puis on le réarme. Sans cette mesure, l'essai précédent
    // serait resté vert sur une base où le déclencheur aurait disparu.
    //
    // ⚠️ **Dans une transaction ANNULÉE**, et sous le PROPRIÉTAIRE : le rôle
    // applicatif ne peut pas désarmer un déclencheur — c'est précisément la
    // quatrième couche du §12 —, et une restauration par `finally` a déjà laissé
    // un déclencheur désarmé derrière elle sur la recette (leçon du 10/09).
    const proprietaire = await base.nouvelleConnexion('proprietaire');
    try {
      await proprietaire.query('begin');
      await proprietaire.query(
        `alter table prestataire_sous_traitance disable trigger trg_prestataire_sous_traitance_cycle`,
      );
      await proprietaire.query(`select set_config('grc.filiales', $1, true)`, [FILIALE_A]);
      // ⚠️ La clé est `grc.filiale_id`, pas `grc.filiale_active` : la première
      // rédaction s'est trompée de nom et a reçu `GRC04` — c'est-à-dire le refus
      // d'une transaction sans périmètre, et non le succès qu'elle croyait
      // mesurer. *Un essai qui échoue pour une raison étrangère à son sujet est
      // un essai qui ne mesure pas son sujet.*
      await proprietaire.query(`select set_config('grc.filiale_id', $1, true)`, [FILIALE_A]);
      await proprietaire.query(`select set_config('grc.utilisateur', 'mutation', true)`);

      await proprietaire.query(
        `insert into prestataire_sous_traitance
             (id, filiale_id, prestataire_id, sous_traitant_id)
         values ('ST-MUTANT', $1, 'TIERS-B1', 'TIERS-A1')`,
        [FILIALE_A],
      );
      // Elle passe : la seule chose qui l'empêchait est le déclencheur.
      const compte = await proprietaire.query(
        `select count(*)::int as n from prestataire_sous_traitance where id = 'ST-MUTANT'`,
      );
      assert.equal(compte.rows[0].n, 1, 'désarmé, le déclencheur ne refuse plus rien');
    } finally {
      // `rollback` défait TOUT — la ligne mutante ET le désarmement, qui est
      // lui-même transactionnel en PostgreSQL.
      await proprietaire.query('rollback').catch(() => {});
      await proprietaire.end().catch(() => {});
    }

    // Et l'on re-mesure que le déclencheur est bien revenu : une restauration
    // qu'on ne vérifie pas est une restauration qu'on croit.
    const erreur = await semerArete('ST-B1A1-BIS', FILIALE_A, 'TIERS-B1', 'TIERS-A1');
    assert.ok(erreur, 'après annulation, le déclencheur doit avoir retrouvé sa place');
    assert.match(erreur, /referme une boucle/);
  });
});

describe('§3 — et la ROUTE rend un refus lisible, pas une pile d’appel', () => {
  test('la route générique refuse la boucle avec un message utile', async () => {
    await semerTiers('TIERS-R1', FILIALE_A, 'Réseau Gamma');
    assert.equal(await semerArete('ST-A1R1', FILIALE_A, 'TIERS-A1', 'TIERS-R1'), null);

    const reponse = await serveur.appeler('POST', '/api/entites/prestataire_sous_traitance', {
      corps: {
        champs: {
          prestataire_id: 'TIERS-R1',
          sous_traitant_id: 'TIERS-A1',
          service: 'Boucle interdite',
        },
      },
    });

    // ⚠️ **Ce que cet essai mesure vraiment : ce que l'UTILISATEUR reçoit.**
    // Le constat Q-325 est né d'un refus soigné en base qui arrivait à l'écran
    // en `500` avec sa pile d'appel : l'essai prouvait que le déclencheur se
    // déclenche, personne ne mesurait ce qui sortait de la route.
    assert.notEqual(reponse.statut, 500, 'un refus métier ne sort jamais en 500');
    assert.ok(
      reponse.statut >= 400 && reponse.statut < 500,
      `refus attendu, reçu ${reponse.statut}`,
    );
    const message = String(reponse.corps?.message ?? '');
    assert.ok(message.length > 0, 'le refus doit porter un message');
    // Aucune fuite de plomberie : ni nom de fonction, ni « at », ni SQL.
    assert.doesNotMatch(message, /f_chaine_sous_traitance|plpgsql|\bat \//);
  });
});

describe('§4 — une boucle LONGUE est refusée : le parcours est bien récursif', () => {
  test('A → B → C posées, C → A refusée', async () => {
    await semerTiers('LONG-A', FILIALE_B, 'Alpha');
    await semerTiers('LONG-B', FILIALE_B, 'Beta');
    await semerTiers('LONG-C', FILIALE_B, 'Gamma');

    assert.equal(await semerArete('ST-LAB', FILIALE_B, 'LONG-A', 'LONG-B'), null);
    assert.equal(await semerArete('ST-LBC', FILIALE_B, 'LONG-B', 'LONG-C'), null);

    const erreur = await semerArete('ST-LCA', FILIALE_B, 'LONG-C', 'LONG-A');
    assert.ok(erreur, 'une boucle de longueur trois doit être refusée comme les autres');
    assert.match(erreur, /referme une boucle/);
  });
});

describe('§5 — le RANG se DÉRIVE, et intercaler un maillon déplace l’aval', () => {
  test('A → B → C : B est de rang 1, C de rang 2', async () => {
    const rangs = await chaine(FILIALE_B, 'LONG-A');
    const parId = new Map(rangs.map((l) => [l.sous_traitant_id, l.rang]));

    assert.equal(parId.get('LONG-B'), 1);
    assert.equal(parId.get('LONG-C'), 2);
    assert.ok(
      rangs.every((l) => l.cycle_detecte === false),
      'aucun cycle ne doit être détecté sur une chaîne saine',
    );
  });

  test('⚠️ INTERCALER un maillon déplace les rangs en aval, SANS qu’aucun traitement ne repasse', async () => {
    // C'est la propriété qui justifie de ne pas RANGER le rang, et c'est elle
    // qu'on mesure. On insère D entre A et B — A → D, D → B — et l'on constate
    // que C, qu'on n'a pas touché, est passé du rang 2 au rang 3.
    await semerTiers('LONG-D', FILIALE_B, 'Delta');
    assert.equal(await semerArete('ST-LAD', FILIALE_B, 'LONG-A', 'LONG-D'), null);
    assert.equal(await semerArete('ST-LDB', FILIALE_B, 'LONG-D', 'LONG-B'), null);

    const rangs = await chaine(FILIALE_B, 'LONG-A');
    // B est atteignable par DEUX chemins désormais (direct, et via D) : le
    // parcours rend les deux, et c'est juste — une chaîne de sous-traitance
    // n'est pas un arbre, et aplatir les doublons masquerait le second contrat.
    const rangsDeC = rangs.filter((l) => l.sous_traitant_id === 'LONG-C').map((l) => l.rang);
    assert.ok(rangsDeC.includes(3), `C doit désormais apparaître au rang 3 (rangs : ${rangsDeC})`);
    assert.ok(rangsDeC.includes(2), 'et rester au rang 2 par le chemin direct A → B → C');
  });
});

describe('§6 — cloisonnement : on ne se rattache pas à un tiers qu’on ne voit pas', () => {
  test('la filiale B ne peut pas déclarer une sous-traitance vers un tiers de la filiale A', async () => {
    // ⚠️ **C'est l'oracle d'existence que la clé composite ferme.** Une clé
    // simple sur `prestataire_id` serait satisfaite par une ligne INVISIBLE de
    // la voisine — les contrôles d'intégrité de PostgreSQL contournent
    // délibérément la RLS —, et la filiale B apprendrait, par le simple fait que
    // l'écriture passe, que « TIERS-A1 » existe chez A.
    const erreur = await semerArete('ST-FUITE', FILIALE_B, 'LONG-A', 'TIERS-A1');
    assert.ok(erreur, 'le rattachement transfrontalier doit être refusé');
    assert.match(erreur, /fk_prestataire_sous_traitance_soustraitant|viole la contrainte|violates/i);
  });

  test('et la chaîne d’une filiale ne montre rien de la voisine', async () => {
    const vueDeB = await chaine(FILIALE_B, 'TIERS-A1');
    assert.deepEqual(vueDeB, [], 'la chaîne d’un tiers de la filiale A est vide vue de B');
  });
});

describe('§7 — le score composite n’est NULLE PART stocké', () => {
  test('aucune colonne de « prestataires » ne porte un score figé', async () => {
    // Le critère 21.4 : *« le score est DÉRIVÉ et recalculé, jamais stocké
    // figé »*. On le mesure dans le CATALOGUE plutôt qu'en relisant la
    // migration : c'est la base qui répond, et la réponse reste juste le jour
    // où quelqu'un ajoute la colonne « par commodité ».
    const colonnes = await base.lignes(
      await base.connexion('proprietaire'),
      `select a.attname::text as nom
         from pg_attribute a
        where a.attrelid = 'prestataires'::regclass and a.attnum > 0 and not a.attisdropped`,
    );
    const noms = colonnes.map((l) => l.nom);
    for (const interdit of ['score', 'score_risque', 'niveau_risque', 'risque_inherent']) {
      assert.ok(
        !noms.includes(interdit),
        `« ${interdit} » est une colonne : le score serait alors figé au jour où on l’écrit, ` +
          `alors que deux de ses quatre facteurs — la couverture des exigences de chaîne et ` +
          `l’ancienneté de l’évaluation — bougent tout seuls.`,
      );
    }
  });

  test('le score se recalcule : vieillir une évaluation change le niveau, sans écriture', async () => {
    const c = await base.connexion('proprietaire');
    // ⚠️ **Le cas est choisi POUR ENJAMBER un palier**, et ce n'est pas un
    // arrangement : la première rédaction prenait un tiers « forte × etendu »,
    // dont les deux versions tombaient du même côté du seuil — l'essai était donc
    // rouge sur une fonction parfaitement juste. *Un essai qui ne fait pas DÉCIDER
    // la règle ne la couvre pas* (constat Q-210), et il ne la réfute pas non plus.
    //
    // « moyenne × etendu » vaut 6 — le palier « modéré » —, et deux ans plus tard
    // 8, c'est-à-dire « élevé ». C'est exactement la bascule que la date doit
    // produire, et elle la produit sans qu'une seule ligne soit écrite.
    const frais = await c.query(
      `select f_niveau_prestataire(
                f_score_prestataire('moyenne', 'etendu', null, 0, current_date)) as n`,
    );
    const vieux = await c.query(
      `select f_niveau_prestataire(
                f_score_prestataire('moyenne', 'etendu', null, 0, current_date - 900)) as n`,
    );
    assert.notEqual(
      frais.rows[0].n,
      vieux.rows[0].n,
      'une évaluation de plus de deux ans doit changer le niveau — sinon la date ne sert à rien',
    );
  });
});
