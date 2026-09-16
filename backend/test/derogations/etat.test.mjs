/**
 * etat.test.mjs — **LES DÉROGATIONS DATÉES, PAR LA ROUTE** (lot L19, action 19.2)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'action 19.2 tient dans une phrase : *« une dérogation échue redevient une
 * non-conformité, sans intervention »*. Tout le reste — la table, le circuit,
 * l'écran — est au service de cette phrase, et c'est elle qu'on éprouve.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Une dérogation SAISIE ne couvre pas : il faut que le circuit l'ait acceptée |
 * | 2 | Acceptée et non échue : « en vigueur » |
 * | 3 | Acceptée et ÉCHUE : « échue » — **et rien n'a été écrit dans `exigences`** |
 * | 4 | La RALLONGER sans la faire réapprouver **ne la rallonge pas** |
 * | 5 | Refusée : « refusée », quelle que soit l'échéance |
 * | 6 | Cloisonnement : la voisine ne voit rien, et son écart n'est pas couvert ici |
 * | 7 | Le garde-fou du schéma ÉPROUVE la dérivation — et il MORD |
 *
 * ── ⚠️ LE §3 EST LE CŒUR, ET IL SE MESURE PAR CE QUI N'A PAS BOUGÉ ─────────
 *
 * Une dérogation échue « redevient » une non-conformité **parce qu'elle n'a
 * jamais cessé d'en être une** : `exigences.statut_conformite` n'est pas touché,
 * ni à l'octroi, ni à l'expiration. C'est ce qui rend la propriété vraie sans
 * qu'aucun traitement n'ait à repasser — et donc sans qu'aucun traitement ne
 * puisse oublier de repasser.
 *
 * L'essai le vérifie dans les deux sens : le statut de l'exigence est relu **en
 * base**, et sa `version` — le compteur de verrouillage optimiste — doit être
 * restée à 1. Une écriture invisible se verrait là.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;

/** Périmètre au format de l'API — `utilisateurId`, pas `utilisateur` (REPRISE §5.7). */
function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/** Sème une dérogation en base, sous le périmètre de sa filiale. */
async function semerDerogation(id, filiale, exigence, echeance, champs = {}) {
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    async (c) => {
      await c.query(
        `insert into derogations (id, filiale_id, exigence_id, proprietaire, motif,
                                  accordee_le, echeance, compensation)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          filiale,
          exigence,
          champs.proprietaire ?? 'Claire Vasseur',
          champs.motif ?? 'Automate du fournisseur incompatible avant le renouvellement.',
          champs.accordeeLe ?? '2026-01-01',
          echeance,
          champs.compensation ?? null,
        ],
      );
    },
    { annuler: false },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
});

after(async () => {
  await base?.fermer();
});

async function monterPour(filiale, filiales) {
  return await monterGreffon(base, perimetreApi(filiale, filiales));
}

/** L'état rendu par la route, pour une dérogation nommée. */
async function etatDe(monte, id) {
  const { statut, corps } = await monte.appeler('GET', '/api/derogations/etat');
  assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
  return corps.derogations.find((d) => d.id === id) ?? null;
}

/** Franchit une étape du circuit L8 sur une dérogation. */
async function decider(monte, id, etape, decision) {
  const { statut, corps } = await monte.appeler('POST', `/api/approbations/derogations/${id}`, {
    corps: { etape, decision },
  });
  assert.equal(statut, 201, `${etape}/${decision} : ${JSON.stringify(corps).slice(0, 300)}`);
  return corps;
}

describe('Les dérogations datées, par la route', () => {
  test('§1 et §2 — une dérogation SAISIE ne couvre pas ; acceptée, elle couvre', async () => {
    // Une échéance lointaine : ce qui se joue ici est l'approbation, pas la date.
    await semerDerogation('DER-1', FILIALE_A, 'EX-A', '2099-12-31');
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      // ── §1 : saisie, et rien d'autre ──────────────────────────────────
      const saisie = await etatDe(monte, 'DER-1');
      assert.notEqual(saisie, null, 'La dérogation semée n’est pas rendue par la route.');
      assert.equal(
        saisie.etat,
        'en_attente',
        'Une dérogation SAISIE mais non acceptée couvrirait l’écart : la simple saisie ' +
          'deviendrait un blanc-seing, et le circuit d’approbation ne servirait plus à rien.',
      );
      // Elle dit ce qu'elle vise, et l'état de l'exigence : sans cela, l'écran ne
      // pourrait pas expliquer ce qui est couvert.
      // ⚠️ **LES DATES SORTENT EN ISO, ET C'EST UNE CORRECTION.** Le pilote `pg`
      // rend un objet `Date` pour une colonne `date` : `String(unDate)` donnait
      // « Sun Feb 15 2026 00:00:00 GMT+0000 (…) », une chaîne dépendante de la
      // locale, du fuseau et de la version de Node — sur la valeur qui dit
      // jusqu'à quand un écart de conformité est couvert. Trouvé en écrivant
      // l'action 20.4, qui posait la même question.
      assert.match(
        saisie.echeance,
        /^\d{4}-\d{2}-\d{2}$/u,
        `L’échéance ne sort pas en ISO : « ${saisie.echeance} ». Un consommateur autre que ` +
          'notre propre écran — un export, un tableur, un autre outil — la lirait de travers, ' +
          'ou pas du tout.',
      );
      assert.match(saisie.accordeeLe, /^\d{4}-\d{2}-\d{2}$/u);
      assert.equal(saisie.exigenceId, 'EX-A');
      assert.equal(saisie.exigenceCode, 'A.5.1');
      assert.equal(saisie.statutConformite, 'non conforme');
      assert.equal(saisie.etapeAttendue, 'proposition', 'Le circuit dit ce qu’il attend.');

      // ── §2 : le circuit va jusqu'au bout ──────────────────────────────
      await decider(monte, 'DER-1', 'proposition', 'approuve');
      const aMiChemin = await etatDe(monte, 'DER-1');
      assert.equal(
        aMiChemin.etat,
        'en_attente',
        'Une SEULE des deux étapes suffirait à couvrir : le circuit serait décoratif.',
      );

      await decider(monte, 'DER-1', 'acceptation', 'approuve');
      const acceptee = await etatDe(monte, 'DER-1');
      assert.equal(acceptee.etat, 'en_vigueur');
      assert.equal(acceptee.circuit, 'complet');
    } finally {
      await monte.fermer();
    }
  });

  test('§3 — ÉCHUE : elle ne couvre plus, et RIEN n’a été écrit dans l’exigence', async () => {
    // Accordée hier, échue hier : le cas nominal d'un écart qu'on a laissé courir.
    await semerDerogation('DER-2', FILIALE_A, 'EX-A', '2026-01-02', {
      accordeeLe: '2026-01-01',
    });
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      await decider(monte, 'DER-2', 'proposition', 'approuve');
      await decider(monte, 'DER-2', 'acceptation', 'approuve');

      const echue = await etatDe(monte, 'DER-2');
      assert.equal(
        echue.etat,
        'echue',
        'UNE DÉROGATION EXPIRÉE CONTINUE DE COUVRIR L’ÉCART. C’est le défaut que toute ' +
          'l’action 19.2 existe pour empêcher : une non-conformité qui ne revient jamais.',
      );
      assert.equal(echue.circuit, 'complet', 'Le circuit, lui, reste complet : il a bien eu lieu.');

      // ── LA MOITIÉ QUI COMPTE : ce qui n'a pas bougé ────────────────────
      //
      // « Redevient une non-conformité sans intervention » est vrai PARCE QUE
      // rien n'a jamais été écrit. On le mesure sur le statut ET sur `version` :
      // une écriture, même annulée aussitôt, aurait fait avancer le compteur de
      // verrouillage optimiste.
      const exigence = await base.avecPerimetre(
        applicatif,
        perimetre('observateur', FILIALE_A, [FILIALE_A]),
        async (c) =>
          (
            await c.query(
              'select statut_conformite, version from exigences where id = $1',
              ['EX-A'],
            )
          ).rows[0],
      );
      assert.equal(exigence.statut_conformite, 'non conforme');
      assert.equal(
        Number(exigence.version),
        1,
        'Le compteur de version de l’exigence a bougé : quelque chose a ÉCRIT dans ' +
          '« exigences ». C’est exactement ce que l’action 19.2 refuse — dès qu’un ' +
          'traitement doit repasser, il peut ne pas repasser.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§4 — la RALLONGER sans la faire réapprouver NE la rallonge pas', async () => {
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      // DER-2 est acceptée et échue. On repousse son échéance de trois ans,
      // directement en base — le geste qu'un utilisateur ferait par l'écran.
      await base.avecPerimetre(
        applicatif,
        perimetre('semeur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query(
            "update derogations set echeance = date '2099-12-31' where id = 'DER-2'",
          );
        },
        { annuler: false },
      );

      const rallongee = await etatDe(monte, 'DER-2');
      assert.equal(
        rallongee.circuit,
        'perime',
        'Modifier une dérogation acceptée doit PÉRIMER son circuit : l’empreinte figée ' +
          'par la décision ne correspond plus au contenu.',
      );
      assert.equal(
        rallongee.etat,
        'en_attente',
        'UNE DÉROGATION SE RALLONGE TOUTE SEULE. Il suffirait de repousser la date pour ' +
          'que l’écart reste couvert sans que personne ne redécide — c’est-à-dire que ' +
          'l’écart assumé deviendrait l’écart oublié.',
      );
      assert.equal(
        rallongee.etapeAttendue,
        'proposition',
        'Le circuit doit REPARTIR du début, et le dire.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — refusée : elle ne couvre pas, quelle que soit son échéance', async () => {
    await semerDerogation('DER-3', FILIALE_A, 'EX-A', '2099-12-31');
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      await decider(monte, 'DER-3', 'proposition', 'approuve');
      await decider(monte, 'DER-3', 'acceptation', 'refuse');
      const refusee = await etatDe(monte, 'DER-3');
      assert.equal(
        refusee.etat,
        'refusee',
        'Un refus sans effet est pire que de ne pas demander.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§6 — la filiale voisine ne voit rien, et son écart n’est pas couvert ici', async () => {
    await semerDerogation('DER-DEU', FILIALE_B, 'EX-B', '2099-12-31', {
      proprietaire: 'Klaus Weber',
      motif: 'Wartungsfenster des Lieferanten.',
    });

    const chezA = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { corps } = await chezA.appeler('GET', '/api/derogations/etat');
      const identifiants = corps.derogations.map((d) => d.id);
      assert.equal(
        identifiants.includes('DER-DEU'),
        false,
        'FUITE ENTRE FILIALES : la dérogation de la voisine est rendue à Toulouse.',
      );
      // Le semis pose « DER-B » chez la voisine : elle non plus ne doit pas venir.
      assert.equal(identifiants.includes('DER-B'), false);
      // ⚠️ CONTRÔLE DE MORSURE : sans lui, « rien n'a fui » vaudrait pour une
      // route qui ne rend jamais rien. Toulouse doit voir LES SIENNES.
      assert.ok(
        identifiants.includes('DER-1'),
        'La route ne rend RIEN : le « rien n’a fui » ci-dessus ne mesure pas le ' +
          'cloisonnement, il mesure une route muette.',
      );
    } finally {
      await chezA.fermer();
    }

    // Et la voisine voit la sienne, et elle seule : la symétrie est la preuve
    // que le cloisonnement borne, au lieu de simplement cacher.
    const chezB = await monterPour(FILIALE_B, [FILIALE_B]);
    try {
      const { corps } = await chezB.appeler('GET', '/api/derogations/etat');
      const identifiants = corps.derogations.map((d) => d.id).sort();
      // « DER-B » vient du semis partagé, « DER-DEU » de cet essai : les deux sont
      // allemandes, et aucune des quatre toulousaines n'est là.
      assert.deepEqual(identifiants, ['DER-B', 'DER-DEU']);
    } finally {
      await chezB.fermer();
    }
  });

  test('§7 — le garde-fou ÉPROUVE la dérivation, et il MORD', async () => {
    const proprietaire = await base.connexion('proprietaire');

    // ── D'abord : le schéma est sain ──────────────────────────────────────
    const sain = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A, FILIALE_B]),
      async (c) => (await c.query('select * from f_verifier_derogations()')).rows,
    );
    assert.deepEqual(sain, [], `Anomalies inattendues : ${JSON.stringify(sain)}`);

    // ── Puis LA MORSURE, dans une transaction ANNULÉE ─────────────────────
    //
    // ⚠️ Annulée, jamais rattrapée par un `finally` : une mutation laissée en
    // base casserait la recette, et c'est arrivé (leçon du 10/09, constat Q-281).
    // `avecPerimetre` annule par défaut — c'est exactement ce qu'on veut ici.
    const anomalies = await base.avecPerimetre(
      proprietaire,
      perimetre('mutant', null, [FILIALE_A, FILIALE_B]),
      async (c) => {
        // La mutation : la dérivation oublie l'échéance et couvre TOUJOURS.
        // C'est la forme la plus plausible du défaut — un « or true » de plus.
        await c.query(`
          create or replace function f_etat_derogation(p_echeance date, p_decision text)
          returns text language sql stable
              set search_path = pg_catalog, public, pg_temp as
          $m$ select case when p_decision = 'refuse' then 'refusee'
                          when p_decision is distinct from 'approuve' then 'en_attente'
                          else 'en_vigueur' end $m$;`);
        return (await c.query('select anomalie, detail from f_verifier_derogations()')).rows;
      },
    );

    assert.ok(
      anomalies.some((a) => a.anomalie === 'derivation_derogation_fausse'),
      'LE GARDE NE MORD PAS : la dérivation peut cesser de regarder l’échéance sans ' +
        `qu’aucune anomalie ne soit levée. Rendu : ${JSON.stringify(anomalies)}`,
    );
    assert.ok(
      anomalies.some((a) => /EXPIRÉE CONTINUERAIT DE COUVRIR/u.test(String(a.detail))),
      'Le garde mord, mais son message ne dit pas CE QUE la disparition produit — et ' +
        'c’est ce qui fait la différence entre une anomalie qu’on comprend et une ' +
        'anomalie qu’on désarme.',
    );

    // ── CONTRÔLE DE MORSURE : la vraie fonction est bien revenue ──────────
    const apres = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A, FILIALE_B]),
      async (c) => (await c.query('select * from f_verifier_derogations()')).rows,
    );
    assert.deepEqual(
      apres,
      [],
      'La transaction de mutation n’a pas été annulée : la base porte encore la fonction ' +
        'cassée. C’est la faute du 10/09 — muter sur une COPIE, et annuler.',
    );
  });
});
