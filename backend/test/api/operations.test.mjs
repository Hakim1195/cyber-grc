/**
 * operations.test.mjs — la propagation, le sondage, et la suppression du pivot.
 *
 * ── Ce que la porte a relevé ─────────────────────────────────────────────────
 *
 * `RAPPORT_S2` §5 : « `creer`, `supprimer`, `supprimerMesure`, `propagerMesure`,
 * `rafraichir`, `decrire` : **jamais appelés** ». Les trois premiers sont couverts par
 * `routes.test.mjs` et `entites-familles.test.mjs` ; ce fichier prend les trois autres,
 * qui sont d'une autre nature :
 *
 *  · **`propagerMesure`** est LA raison d'être du pivot « mesure de sécurité » :
 *    évaluer une mesure propage son statut vers toutes les exigences qu'elle couvre —
 *    « zéro double saisie » (`CLAUDE.md` §2). Elle touche N enregistrements en une
 *    transaction : c'est le contrôle **S14**, et une propagation à moitié appliquée
 *    laisse un tableau de conformité faux, qu'un auditeur ISO lira comme une preuve.
 *  · **`rafraichir`** est le seul mécanisme par lequel un utilisateur apprend qu'un
 *    autre a modifié quelque chose (`PLAN_SERVEUR` §1.3). C'est là que vit le constat
 *    **M-7** : « le sondage peut PERDRE DÉFINITIVEMENT la modification d'un autre
 *    utilisateur ».
 *  · **`supprimerMesure`** est la seule cascade que le schéma ne porte pas seul : les
 *    quatre références au catalogue sont en `restrict` (§17.6), et c'est le serveur qui
 *    doit délier — sans sortir de la filiale active.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;
/** Connexion SQL directe : elle sert de TÉMOIN, jamais d'acteur du scénario. */
let temoin;

const rssi = perimetre('temoin', FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
  temoin = await base.nouvelleConnexion('app');
});

after(async () => {
  await temoin?.end().catch(() => {});
  await serveur?.fermer();
  await base?.fermer();
});

async function donnees() {
  return (await serveur.appeler('GET', '/api/donnees')).corps.data;
}

async function lire(entite, identifiant) {
  return (await donnees())[entite].find((e) => e.id === identifiant);
}

/** Évalue une mesure par la route, en respectant ses deux versions. */
async function evaluer(identifiant, champs) {
  const mesure = await lire('mesures', identifiant);
  const reponse = await serveur.appeler('PUT', `/api/entites/mesures/${identifiant}`, {
    corps: {
      version: mesure._version,
      ...(mesure._versionMiseEnOeuvre === null ? {} : { versionMiseEnOeuvre: mesure._versionMiseEnOeuvre }),
      champs,
    },
  });
  assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
  return reponse.corps.enregistrement;
}

/* =====================================================================
 *  §1 — La propagation « au plus défavorable »
 * ===================================================================== */

describe('POST /api/operations/propager-mesure (contrôle S14)', () => {
  test('la propagation porte le statut de la mesure sur l’exigence reliée', async () => {
    await evaluer('MESURE-A', { statut: 'conforme', maturite: 4 });
    const reponse = await serveur.appeler('POST', '/api/operations/propager-mesure', {
      corps: { mesureId: 'MESURE-A' },
    });
    assert.equal(reponse.statut, 200);
    assert.equal(reponse.corps.evaluationsMisesAJour, 1);

    const evaluation = await lire('evaluations', 'EVAL-A');
    assert.equal(evaluation.statut, 'conforme');
    assert.equal(evaluation.maturite, 4);
  });

  test('AU PLUS DÉFAVORABLE : deux mesures, c’est la plus faible qui décide', async () => {
    // La règle du chantier v12 : une exigence couverte par plusieurs mesures n'est
    // conforme que si TOUTES le sont, et prend la maturité la plus basse. Sans ce
    // test, la propagation pourrait se contenter d'écraser avec la dernière lue —
    // et le tableau de conformité mentirait dans le sens qui arrange.
    const seconde = await serveur.appeler('POST', '/api/entites/mesures', {
      corps: { champs: { nom: 'Sauvegardes hors ligne', statut: 'non conforme', maturite: 1 } },
    });
    const identifiantSeconde = seconde.corps.enregistrement.id;

    const evaluation = await lire('evaluations', 'EVAL-A');
    const relie = await serveur.appeler('PUT', '/api/entites/evaluations/EVAL-A', {
      corps: { version: evaluation._version, champs: { mesure_ids: ['MESURE-A', identifiantSeconde] } },
    });
    assert.equal(relie.statut, 200);

    await serveur.appeler('POST', '/api/operations/propager-mesure', { corps: { mesureId: 'MESURE-A' } });

    const apres = await lire('evaluations', 'EVAL-A');
    assert.equal(apres.statut, 'non conforme', 'Conforme seulement si TOUTES les mesures le sont.');
    assert.equal(apres.maturite, 1, 'La maturité retenue est la plus basse.');
  });

  test('la propagation ne sort JAMAIS de la filiale active', async () => {
    // `MESURE-G` est du socle Groupe et couvre une exigence dans CHAQUE filiale.
    // Propager depuis Toulouse ne doit toucher que l'évaluation de Toulouse.
    await base.avecPerimetre(
      temoin,
      perimetre('semeur', 'FIL-ESSAI-B', ['FIL-ESSAI-B']),
      async (c) => {
        await c.query(
          "insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-B', 'MESURE-G', 'FIL-ESSAI-B')",
        );
      },
      { annuler: false },
    );
    await base.avecPerimetre(
      temoin,
      rssi,
      async (c) => {
        await c.query(
          "insert into evaluation_mesures (evaluation_id, mesure_id, filiale_id) values ('EVAL-A', 'MESURE-G', $1)",
          [FILIALE_A],
        );
      },
      { annuler: false },
    );
    await evaluer('MESURE-G', { statut: 'partiellement conforme', maturite: 2 });

    const versionB = await base.avecPerimetre(temoin, perimetre('temoin', 'FIL-ESSAI-B', ['FIL-ESSAI-B']), async (c) =>
      (await c.query("select version, statut from evaluations where id = 'EVAL-B'")).rows[0]);

    const reponse = await serveur.appeler('POST', '/api/operations/propager-mesure', {
      corps: { mesureId: 'MESURE-G' },
    });
    assert.equal(reponse.statut, 200);
    assert.ok(reponse.corps.evaluationsMisesAJour >= 1);

    const apresB = await base.avecPerimetre(temoin, perimetre('temoin', 'FIL-ESSAI-B', ['FIL-ESSAI-B']), async (c) =>
      (await c.query("select version, statut from evaluations where id = 'EVAL-B'")).rows[0]);
    assert.deepEqual(
      apresB,
      versionB,
      'L’évaluation allemande ne doit être ni modifiée, ni versionnée, ni signée par Toulouse.',
    );
  });

  test('TOUT OU RIEN : une propagation qui échoue ne laisse aucune évaluation modifiée', async () => {
    // Deux exigences couvertes par la même mesure, et un piège posé sur la SECONDE :
    // la propagation en modifie une, puis échoue. Si la transaction n'était pas
    // unique, la première resterait modifiée — un tableau de conformité à moitié vrai,
    // qu'un auditeur ISO lirait comme une preuve.
    const mesure = await serveur.appeler('POST', '/api/entites/mesures', {
      corps: { champs: { nom: 'Mesure de la propagation', statut: 'conforme', maturite: 5 } },
    });
    const identifiantMesure = mesure.corps.enregistrement.id;

    // Deux exigences, dont on ne choisit pas les identifiants : depuis le correctif
    // du constat M-3, le client ne propose plus le sien (l'oracle d'existence est
    // fermé). On les crée donc, puis on pose le piège sur celle que la propagation
    // traitera en DERNIER — l'ordre est `order by e.id`, et il est déterministe.
    const identifiants = [];
    for (const code of ['M8-PROPAG', 'M9-PROPAG']) {
      const creee = await serveur.appeler('POST', '/api/entites/evaluations', {
        corps: { champs: { ref_id: 'anssi', code, mesure_ids: [identifiantMesure] } },
      });
      assert.equal(creee.statut, 201, JSON.stringify(creee.corps));
      identifiants.push(creee.corps.enregistrement.id);
    }
    identifiants.sort();
    const derniere = identifiants[identifiants.length - 1];

    const avant = (await donnees()).evaluations
      .map((e) => `${e.id}/${e.statut}/${e.maturite}/${e._version}`)
      .sort();

    const proprietaire = await base.connexion('proprietaire');
    // Le piège est posé sur la SECONDE évaluation dans l'ordre de propagation
    // (`order by e.id`) : la première est donc déjà écrite quand l'échec survient.
    await proprietaire.query(
      'alter table evaluations add constraint zz_essai_piege check ' +
        `(id <> '${derniere}' or statut <> 'conforme')`,
    );
    try {
      const reponse = await serveur.appeler('POST', '/api/operations/propager-mesure', {
        corps: { mesureId: identifiantMesure },
      });
      assert.notEqual(reponse.statut, 200, 'La propagation devait échouer sur la seconde évaluation.');

      const apres = (await donnees()).evaluations
        .map((e) => `${e.id}/${e.statut}/${e.maturite}/${e._version}`)
        .sort();
      assert.deepEqual(apres, avant, 'Aucun état intermédiaire ne doit subsister (contrôle S14).');
    } finally {
      await proprietaire.query('alter table evaluations drop constraint zz_essai_piege');
    }
  });
});

/* =====================================================================
 *  §2 — Le sondage de rafraîchissement
 * ===================================================================== */

describe('GET /api/rafraichir — ce qu’un utilisateur apprend des autres', () => {
  test('une création faite ailleurs remonte au sondage suivant', async () => {
    const premier = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(new Date().toISOString())}`);
    const depuis = premier.corps.horodatage;

    const cree = await serveur.appeler('POST', '/api/entites/actions', {
      corps: { champs: { titre: 'Chiffrer les portables' } },
    });
    assert.equal(cree.statut, 201);

    const second = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(depuis)}`);
    assert.equal(second.statut, 200);
    assert.ok(
      (second.corps.modifications.actions ?? []).some((a) => a.id === cree.corps.enregistrement.id),
      'Le sondage doit rendre la création faite entre les deux appels.',
    );
  });

  test('une SUPPRESSION ne remonte pas, mais l’écart de volume la trahit', async () => {
    // Limite assumée et documentée : faute de pierres tombales, le sondage ne rend
    // pas les suppressions. Le filet est le compte par collection. Ce test fige la
    // limite ET le filet — le jour où le lot L5 apportera les pierres tombales, il
    // faudra le relire.
    const cree = await serveur.appeler('POST', '/api/entites/actions', {
      corps: { champs: { titre: 'Action éphémère' } },
    });
    const identifiant = cree.corps.enregistrement.id;
    const avant = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(new Date().toISOString())}`);

    assert.equal((await serveur.appeler('DELETE', `/api/entites/actions/${identifiant}?version=1`)).statut, 200);

    const apres = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(avant.corps.horodatage)}`);
    assert.equal(
      (apres.corps.modifications.actions ?? []).some((a) => a.id === identifiant),
      false,
      'Le sondage ne sait pas rendre une suppression : c’est écrit, et c’est vrai.',
    );
    assert.equal(
      apres.corps.volumes.actions,
      avant.corps.volumes.actions - 1,
      'Le volume, lui, a baissé : c’est ce qui dit au client de recharger.',
    );
  });

  test('une modification VALIDÉE APRÈS le sondage n’est pas perdue (constat M-7)', async () => {
    // Le constat M-7 de la porte S2, rejoué : l'horodatage rendu au client est pris
    // APRÈS la lecture, alors qu'un écrivain concurrent estampille `modifie_le` à
    // l'OUVERTURE de sa transaction — donc avant — et valide APRÈS. Le sondage suivant
    // demande « ce qui a changé depuis » et ne voit rien. Les volumes n'ayant pas
    // bougé, le filet « écart de volume ⇒ rechargement » ne se déclenche pas non plus.
    //
    // Conséquence : sur un tableau de bord de conformité, une valeur périmée est lue
    // comme courante. C'est exactement ce qu'un auditeur ISO regarde.
    const bob = await base.nouvelleConnexion('app');
    try {
      const cible = await lire('risques', 'RISK-A');

      // 1. Bob ouvre sa transaction et écrit, SANS valider.
      await bob.query('begin');
      await bob.query(
        `select set_config('grc.utilisateur', 'bob', true),
                set_config('grc.filiale_id', $1, true),
                set_config('grc.filiales', $1, true),
                set_config('grc.administration_groupe', '', true)`,
        [FILIALE_A],
      );
      await bob.query('update risques set description = $2 where id = $1 and version = $3', [
        'RISK-A',
        'écriture de Bob',
        cible._version,
      ]);

      // 2. Alice sonde pendant ce temps : elle ne voit rien, c'est normal.
      const sondage = await serveur.appeler(
        'GET',
        `/api/rafraichir?depuis=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`,
      );
      const horodatage = sondage.corps.horodatage;

      // 3. Bob valide. Sa ligne porte un `modifie_le` ANTÉRIEUR à l'horodatage rendu.
      await bob.query('commit');

      // 4. Alice re-sonde depuis l'horodatage qu'on lui a donné.
      const apres = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(horodatage)}`);
      const vue = (apres.corps.modifications.risques ?? []).find((r) => r.id === 'RISK-A');

      assert.ok(
        vue !== undefined,
        'L’écriture de Bob doit remonter au sondage suivant : sinon elle est perdue pour Alice, ' +
          'définitivement, et rien ne le dit.',
      );
      assert.equal(vue.description, 'écriture de Bob');
    } finally {
      await bob.query('rollback').catch(() => {});
      await bob.end().catch(() => {});
    }
  });

  test('le sondage reste cloisonné : rien de la filiale voisine', async () => {
    await base.avecPerimetre(
      temoin,
      perimetre('allemagne', 'FIL-ESSAI-B', ['FIL-ESSAI-B']),
      async (c) => {
        await c.query(
          "insert into actions (id, filiale_id, titre) values ('ACT-ALLEMANDE', 'FIL-ESSAI-B', 'Action allemande')",
        );
      },
      { annuler: false },
    );
    const sondage = await serveur.appeler(
      'GET',
      `/api/rafraichir?depuis=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`,
    );
    assert.equal(JSON.stringify(sondage.corps).includes('ACT-ALLEMANDE'), false);
  });
});

/* =====================================================================
 *  §3 — La suppression du pivot
 * ===================================================================== */

describe('DELETE sur « mesures » — la cascade que le schéma ne porte pas seul', () => {
  test('supprimer une mesure DÉLIE les exigences et CONSERVE les actions', async () => {
    // Comportement du frontend d'aujourd'hui (`deleteMesure`), transposé au serveur :
    // les quatre références au catalogue sont en `restrict` (§17.6), donc c'est le
    // serveur qui délie — et il ne délie que dans SA filiale.
    const cree = await serveur.appeler('POST', '/api/entites/mesures', {
      corps: { champs: { nom: 'Mesure à supprimer' } },
    });
    const identifiant = cree.corps.enregistrement.id;

    const evaluation = await lire('evaluations', 'EVAL-A');
    await serveur.appeler('PUT', '/api/entites/evaluations/EVAL-A', {
      corps: { version: evaluation._version, champs: { mesure_ids: [identifiant] } },
    });
    const action = await serveur.appeler('POST', '/api/entites/actions', {
      corps: { champs: { titre: 'Action rattachée à la mesure', mesure_id: identifiant } },
    });
    assert.equal(action.statut, 201);

    const suppression = await serveur.appeler('DELETE', `/api/entites/mesures/${identifiant}?version=1`);
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    const apres = await donnees();
    assert.equal(apres.mesures.some((m) => m.id === identifiant), false);
    assert.deepEqual(
      apres.evaluations.find((e) => e.id === 'EVAL-A').mesure_ids,
      [],
      'L’exigence est déliée, pas supprimée.',
    );
    const actionApres = apres.actions.find((a) => a.id === action.corps.enregistrement.id);
    assert.ok(actionApres, 'L’action est CONSERVÉE : c’est du travail planifié.');
    assert.equal(actionApres.mesure_id, '', 'Elle est simplement déliée de sa mesure.');
  });

  test('supprimer un contrôle du socle référencé par une AUTRE filiale est refusé', async () => {
    // Le constat B-1 de la porte S1, côté serveur : une suppression dans le socle
    // commun ne doit pas modifier les données de vingt filiales à leur insu.
    const reponse = await serveur.appeler('DELETE', '/api/entites/mesures/MESURE-G?version=1');
    assert.notEqual(reponse.statut, 200);

    // Et la mise en oeuvre allemande est intacte.
    const intacte = await base.avecPerimetre(temoin, perimetre('temoin', 'FIL-ESSAI-B', ['FIL-ESSAI-B']), async (c) =>
      (await c.query("select count(*)::int as n from evaluation_mesures where mesure_id = 'MESURE-G'")).rows[0].n);
    assert.equal(intacte, 1);
  });
});
