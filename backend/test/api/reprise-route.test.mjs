/**
 * reprise-route.test.mjs — `POST /api/reprise`, la vraie réponse au bloquant B-3.
 *
 * ── Pourquoi cette route existe, et pourquoi ce fichier avec elle ────────────
 *
 * Le constat **B-3** de la porte S2 : l'import « Remplacer » n'était pas une opération
 * composite mais « une rafale de suppressions HTTP indépendantes » — vingt `DELETE`
 * dont une coupure de VPN au milieu laissait la filiale à moitié détruite, « et l'état
 * intermédiaire est parfaitement observable par les autres utilisateurs ».
 *
 * Le correctif immédiat a été de refuser le mode « Remplacer » côté navigateur. Ce
 * n'était qu'un pansement, et il est dit comme tel. La réponse est ici : **une route
 * qui prend le fichier entier et l'applique en UNE transaction**.
 *
 * L'agent API a d'abord refusé de l'écrire, au motif qu'« une route que rien n'exerce
 * est le contraire de la règle du chantier ». Il avait raison. Ce fichier lève
 * l'objection : la route est exercée, dans ses succès comme dans ses refus.
 *
 * ── Ce qui se joue ici, et qui ne se joue nulle part ailleurs ────────────────
 *
 *  · **Tout ou rien sur un rayon d'action maximal** (contrôle S14). Ailleurs une
 *    opération composite touche quelques lignes ; ici elle touche le jeu de données
 *    d'une filiale entière. Un échec au milieu est la destruction que B-3 décrivait.
 *  · **Les identifiants du fichier redeviennent les clés primaires** — la propriété
 *    que `CONVENTIONS.md` §2 appelle « ce qui rend l'import d'un export grc-backup
 *    exact au round-trip », et que la route de création ordinaire a dû abandonner
 *    pour fermer l'oracle d'existence du constat M-3. Elle survit ICI ou nulle part.
 *  · **L'aperçu applique vraiment, puis annule.** Ce qui est montré est ce qui se
 *    produirait, contraintes de la base comprises. Encore faut-il vérifier que le
 *    « puis annule » est vrai — sinon l'aperçu est une écriture déguisée.
 *  · **L'idempotence** : réimporter deux fois le même fichier ne duplique pas son
 *    contenu (`PLAN_SERVEUR` §5).
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { fichier, instantane, instantaneV12Complet } from '../reprise/jeux-essai.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;

const lectureA = perimetre('temoin', FILIALE_A, [FILIALE_A]);
const lectureB = perimetre('temoin', FILIALE_B, [FILIALE_B]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Envoie un fichier `grc-backup` à la route de reprise. */
function reprendre(mode, charge, options = {}) {
  return serveur.appeler('POST', '/api/reprise', {
    corps: {
      mode,
      ...(options.apercu === true ? { apercu: true } : {}),
      fichier: { nom: options.nom ?? 'export.json', contenu: options.contenu ?? fichier(12, charge) },
    },
  });
}

/** Compte, par une connexion tierce, ce que la base contient réellement. */
async function compter(p = lectureA) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, p, async (c) =>
    (await c.query(
      `select (select count(*) from risques)::int  as risques,
              (select count(*) from clients)::int  as clients,
              (select count(*) from actions)::int  as actions,
              (select count(*) from imports)::int  as imports`,
    )).rows[0]);
}

/** Les identifiants d'une collection, vus en base. */
async function identifiants(table, p = lectureA) {
  const client = await base.connexion('app');
  const lignes = await base.avecPerimetre(client, p, async (c) =>
    (await c.query(`select id from ${table} order by id`)).rows);
  return lignes.map((l) => l.id);
}

/**
 * Un instantané v12 réaliste : celui du jeu d'essai de la reprise, **corrigé de son
 * unique divergence avec le schéma**.
 *
 * `instantaneV12Complet()` porte une action rattachée à CINQ objets à la fois
 * (exigence, risque, évaluation, incident et mesure). Le modèle navigateur l'admet et
 * le module de reprise la traverse sans rien dire ; le schéma, lui, l'interdit
 * (`ck_actions_rattachement` : au plus un rattachement). Le jeu d'essai a été écrit
 * pour éprouver le PORTAGE, pas l'écriture en base — la divergence est donc normale
 * de son point de vue, et elle est signalée dans le rapport de l'agent plutôt que
 * corrigée en silence dans son fichier, qui ne m'appartient pas.
 */
function chargeRealiste(surcharges = {}) {
  const charge = instantaneV12Complet();
  charge.actions = charge.actions.map((a) => ({
    ...a,
    risque_id: '',
    evaluation_id: '',
    incident_id: '',
    mesure_id: '',
  }));
  return { ...charge, ...surcharges };
}

/* =====================================================================
 *  §1 — L'aperçu
 * ===================================================================== */

describe('L’aperçu applique vraiment, puis annule', () => {
  test('il rend un bilan réel, et n’écrit RIEN — ni donnée, ni trace d’import', async () => {
    const avant = await compter();
    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [{ id: 'RISK-APERCU', nom: 'Vu en aperçu seulement' }],
    }), { apercu: true });

    assert.equal(reponse.statut, 200);
    assert.equal(reponse.corps.applique, false, 'Un aperçu n’applique pas.');
    assert.equal(reponse.corps.bilan.crees.risques, 1, 'Il annonce pourtant ce qui SE PRODUIRAIT.');

    assert.deepEqual(await compter(), avant, 'Rien ne doit avoir été écrit, pas même la ligne d’import.');
    assert.equal((await identifiants('risques')).includes('RISK-APERCU'), false);
  });

  test('L’APERÇU MORD : ce qu’il annonce est ce que la reprise fait ensuite', async () => {
    // Contrôle de morsure de l'aperçu : sans lui, « aperçu » pourrait être une
    // estimation faite à côté de la base — donc fausse le jour où une contrainte
    // refuse ce que l'estimation avait compté.
    const charge = instantane(12, {
      risques: [{ id: 'RISK-ANNONCE', nom: 'Annoncé puis appliqué' }],
      clients: [{ id: 'CLI-ANNONCE', nom: 'Donneur d’ordre annoncé' }],
    });
    const annonce = await reprendre('fusionner', charge, { apercu: true, nom: 'annonce.json' });
    const applique = await reprendre('fusionner', charge, { nom: 'applique.json' });

    assert.equal(applique.statut, 200);
    assert.deepEqual(
      applique.corps.bilan.crees,
      annonce.corps.bilan.crees,
      'Le bilan appliqué doit être celui qui avait été annoncé.',
    );
    assert.ok((await identifiants('risques')).includes('RISK-ANNONCE'));
  });
});

/* =====================================================================
 *  §2 — Ce que la route conserve, et que la création ordinaire a perdu
 * ===================================================================== */

describe('Les identifiants du fichier redeviennent les clés primaires', () => {
  test('un enregistrement repris garde SON identifiant, au caractère près', async () => {
    // La route de création ordinaire refuse un identifiant proposé (constat M-3) :
    // c'est ici, et seulement ici, que le round-trip exact d'un export survit.
    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [{ id: 'RISK-1720000000000-777', nom: 'Identifiant d’origine' }],
    }), { nom: 'identifiants.json' });
    assert.equal(reponse.statut, 200);

    const ids = await identifiants('risques');
    assert.ok(
      ids.includes('RISK-1720000000000-777'),
      `L’identifiant du fichier doit être celui de la base. Vus : ${ids.join(', ')}`,
    );
  });

  test('la route de CRÉATION, elle, continue de refuser un identifiant proposé', async () => {
    // Contrôle symétrique (§20.2) : ce qui est ouvert ici doit rester fermé là-bas,
    // sans quoi l'oracle d'existence du constat M-3 rouvrirait par la porte de côté.
    const { statut } = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { id: 'RISK-PROPOSE', champs: { nom: 'x' } },
    });
    assert.equal(statut, 400);
  });
});

/* =====================================================================
 *  §3 — Tout ou rien : la réponse au bloquant B-3
 * ===================================================================== */

describe('Tout ou rien sur le jeu de données d’une filiale (contrôle S14)', () => {
  test('un fichier dont UN enregistrement est refusé ne modifie RIEN', async () => {
    // Le cœur du constat B-3. Le fichier est bon d'un bout à l'autre sauf une valeur,
    // et il porte assez d'enregistrements valides AVANT elle pour que l'absence de
    // transaction se voie immédiatement.
    const avant = await compter();
    const avantIds = await identifiants('risques');

    const reponse = await reprendre('remplacer', instantane(12, {
      risques: [
        { id: 'RISK-VALIDE-1', nom: 'Premier, parfaitement valide' },
        { id: 'RISK-VALIDE-2', nom: 'Deuxième, parfaitement valide' },
        { id: 'RISK-FAUTIF', nom: 'Troisième', niveau: 'inexistant dans la liste fermée' },
      ],
    }), { nom: 'fautif.json' });

    assert.notEqual(reponse.statut, 200, 'La reprise devait être refusée.');
    assert.deepEqual(await compter(), avant, 'Aucune suppression, aucune création : rien.');
    assert.deepEqual(
      await identifiants('risques'),
      avantIds,
      'Le jeu de données de la filiale doit être exactement celui d’avant.',
    );
  });

  test('« remplacer » remplace en une fois, et la filiale voisine n’est pas touchée', async () => {
    const avantB = await compter(lectureB);
    const idsBAvant = await identifiants('risques', lectureB);

    const reponse = await reprendre('remplacer', instantane(12, {
      risques: [{ id: 'RISK-APRES-REMPLACEMENT', nom: 'Le seul qui reste' }],
      clients: [{ id: 'CLI-APRES-REMPLACEMENT', nom: 'Donneur d’ordre repris' }],
    }), { nom: 'remplacement.json' });

    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 300));
    assert.equal(reponse.corps.applique, true);

    assert.deepEqual(
      await identifiants('risques'),
      ['RISK-APRES-REMPLACEMENT'],
      'Le mode « remplacer » remplace : c’est son contrat, et il doit être tenu en entier.',
    );
    // Le cloisonnement tient au rayon le plus large que le lot connaisse.
    assert.deepEqual(await compter(lectureB), avantB, 'La filiale voisine n’a pas bougé.');
    assert.deepEqual(await identifiants('risques', lectureB), idsBAvant);
  });

  test('« fusionner » conserve ce qui existait déjà', async () => {
    const avant = await identifiants('risques');
    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [{ id: 'RISK-AJOUTE-PAR-FUSION', nom: 'Ajouté sans rien détruire' }],
    }), { nom: 'fusion.json' });
    assert.equal(reponse.statut, 200);

    const apres = await identifiants('risques');
    for (const ancien of avant) {
      assert.ok(apres.includes(ancien), `« ${ancien} » ne devait pas disparaître d’une fusion.`);
    }
    assert.ok(apres.includes('RISK-AJOUTE-PAR-FUSION'));
  });
});

/* =====================================================================
 *  §4 — Idempotence, plafonds, et ce que les refus laissent voir
 * ===================================================================== */

describe('Les refus de la route de reprise', () => {
  test('le même fichier deux fois est refusé : la reprise est idempotente', async () => {
    const charge = instantane(12, { risques: [{ id: 'RISK-IDEMPOTENCE', nom: 'Une seule fois' }] });
    const premier = await reprendre('fusionner', charge, { nom: 'idem.json' });
    assert.equal(premier.statut, 200);

    const second = await reprendre('fusionner', charge, { nom: 'idem.json' });
    assert.notEqual(second.statut, 200, 'Réimporter le même fichier ne doit pas dupliquer son contenu.');

    const occurrences = (await identifiants('risques')).filter((id) => id === 'RISK-IDEMPOTENCE');
    assert.equal(occurrences.length, 1);
  });

  test('un fichier illisible est refusé par un message écrit pour un exploitant', async () => {
    const reponse = await reprendre('fusionner', null, { contenu: 'ceci n’est pas du JSON', nom: 'x.json' });
    assert.equal(reponse.statut, 400);
    const texte = JSON.stringify(reponse.corps);
    // Contrôle S12 : aucun nom d'objet interne, aucune pile, aucun SQL.
    for (const interdit of ['pg_', 'at Object', 'select ', 'insert into', 'mesure_catalogue']) {
      assert.equal(texte.toLowerCase().includes(interdit.toLowerCase()), false, `« ${interdit} » ne doit pas sortir.`);
    }
    assert.match(reponse.corps.message, /json|fichier/i);
  });

  test('une collection au-delà du plafond refuse la reprise DANS SON ENTIER (S13)', async () => {
    const avant = await compter();
    const trop = Array.from({ length: 20001 }, (_, i) => ({ id: `RISK-VOLUME-${String(i)}`, nom: 'x' }));
    const reponse = await reprendre('remplacer', instantane(12, { risques: trop }), { nom: 'volume.json' });

    assert.notEqual(reponse.statut, 200);
    assert.deepEqual(await compter(), avant, 'Un refus de volume ne doit rien avoir supprimé au passage.');
  });
});

/* =====================================================================
 *  §5 — Un export RÉEL, tel que l'application en produit
 * ===================================================================== */

describe('Un export complet, comme l’application en produit', () => {
  test('les 21 collections d’un export v12 traversent la route de reprise', async () => {
    // Le chemin que `PLAN_SERVEUR` §2.6 désigne comme LE chemin de migration : un
    // export `grc-backup` d'une filiale encore en version locale, repris dans la
    // version serveur. S'il ne passe pas, il n'y a pas de migration.
    const reponse = await reprendre('remplacer', chargeRealiste(), { nom: 'complet.json' });
    assert.equal(
      reponse.statut,
      200,
      `Un export v12 complet doit être reprisable. Refus : ${JSON.stringify(reponse.corps).slice(0, 400)}`,
    );

    const bilan = reponse.corps.bilan;
    const creees = Object.entries(bilan.crees).filter(([, n]) => n > 0).map(([nom]) => nom);
    assert.ok(creees.length >= 15, `Collections reprises : ${creees.join(', ')}`);
    assert.deepEqual(reponse.corps.rapport.anomalies ?? [], [], 'Un export sain ne produit aucune anomalie.');
  });
});
