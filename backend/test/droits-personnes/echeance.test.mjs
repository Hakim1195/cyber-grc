/**
 * echeance.test.mjs — **LE DÉLAI D'UN MOIS, PAR LA ROUTE** (lot L20, action 20.4)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'action 20.4 tient en une phrase : *« une demande d'exercice de droits dont le
 * mois de l'article 12 §3 est écoulé passe en retard, sans intervention »*.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'échéance est DÉRIVÉE de la réception, et elle porte sa RÉFÉRENCE au texte |
 * | 2 | Le mois écoulé ⇒ « en_retard », **et rien n'a été écrit** |
 * | 3 | La prorogation PROROGE — et elle exige d'avoir été notifiée et motivée |
 * | 4 | Un REFUS se motive et se date : l'article 12 §4 le veut, le schéma l'impose |
 * | 5 | Cloisonnement : la voisine ne voit pas les personnes qui ont écrit ici |
 * | 6 | Le garde-fou ÉPROUVE les deux dérivations — et il MORD |
 *
 * ── ⚠️ LE §2 SE MESURE PAR CE QUI N'A PAS BOUGÉ ───────────────────────────
 *
 * « En retard » n'est posé par aucune écriture. L'essai relit donc, EN BASE, le
 * `statut` **et** la `version` — le compteur de verrouillage optimiste. Une
 * écriture invisible se verrait là, et c'est la seule façon de distinguer
 * « l'état est dérivé » de « l'état a été recalculé et rangé ».
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;

function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/** Sème une demande en base, sous le périmètre de sa filiale. */
async function semerDemande(id, filiale, champs = {}) {
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    async (c) => {
      await c.query(
        `insert into demandes_droits (id, filiale_id, type_demande, recue_le, canal,
                                      demandeur, contact, statut, prorogee, prorogee_le,
                                      prorogation_motif, repondue_le, motif_refus)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          filiale,
          champs.type ?? 'acces',
          champs.recueLe ?? '2026-01-15',
          champs.canal ?? 'courriel',
          champs.demandeur ?? 'Mme Aline Ferrand',
          champs.contact ?? 'aline.ferrand@exemple.test',
          champs.statut ?? 'recue',
          champs.prorogee ?? false,
          champs.prorogeeLe ?? null,
          champs.prorogationMotif ?? null,
          champs.repondueLe ?? null,
          champs.motifRefus ?? null,
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

/** La demande rendue par la route, désignée par son identifiant. */
async function vueDe(monte, id) {
  const { statut, corps } = await monte.appeler('GET', '/api/demandes-droits/etat');
  assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
  return corps.demandes.find((d) => d.id === id) ?? null;
}

/** La ligne de la base, relue sans passer par la route. */
async function enBase(id, filiale) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', filiale, [filiale]),
    async (c) =>
      (await c.query('select statut, version, recue_le from demandes_droits where id = $1', [id]))
        .rows[0] ?? null,
  );
}

/** Une date, décalée de N jours, au format que la base attend. */
function ilYA(jours) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - jours);
  return d.toISOString().slice(0, 10);
}

describe('La demande d’exercice de droits, par la route', () => {
  test('§1 — l’échéance est DÉRIVÉE, et elle porte sa RÉFÉRENCE au texte', async () => {
    await semerDemande('DSAR-1', FILIALE_A, { recueLe: '2026-01-15' });
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await vueDe(monte, 'DSAR-1');
      assert.notEqual(vue, null, 'La demande semée n’est pas rendue par la route.');
      assert.equal(
        vue.echeance,
        '2026-02-15',
        'Le délai d’un mois de l’article 12 §3 n’est pas celui qu’on croit.',
      );
      // ⚠️ La référence voyage AVEC le délai. Un chiffre réglementaire sans sa
      // source est un chiffre que personne ne peut vérifier — et celui qui le
      // vérifiera est une autorité.
      assert.match(vue.reference, /article 12 §3/u);
      assert.equal(vue.typeDemande, 'acces');
      assert.equal(vue.demandeur, 'Mme Aline Ferrand');
    } finally {
      await monte.fermer();
    }
  });

  test('§2 — le mois ÉCOULÉ ⇒ « en_retard », et RIEN n’a été écrit', async () => {
    await semerDemande('DSAR-RETARD', FILIALE_A, { recueLe: ilYA(45), statut: 'en_cours' });
    const avant = await enBase('DSAR-RETARD', FILIALE_A);
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await vueDe(monte, 'DSAR-RETARD');
      assert.equal(
        vue.etat,
        'en_retard',
        'Une demande dont le mois de l’article 12 §3 est écoulé n’apparaît pas en retard : ' +
          'le DPO ne l’apprendra que par la réclamation de la personne, ou par la CNIL.',
      );
      assert.ok(
        vue.joursRestants < 0,
        'Le reste-à-courir doit être NÉGATIF sur une demande en retard : « en retard de ' +
          '12 jours » se défend devant une autorité, « bientôt » ne se défend pas.',
      );
      // Le statut enregistré, lui, n'a pas changé : l'état est DÉRIVÉ.
      assert.equal(vue.statut, 'en_cours');
    } finally {
      await monte.fermer();
    }

    const apres = await enBase('DSAR-RETARD', FILIALE_A);
    assert.deepEqual(
      apres,
      avant,
      'La lecture de l’état a ÉCRIT dans la base. L’échéance se dérive : la ranger ' +
        'laisserait, après correction de la date de réception, un délai calculé sur ' +
        'l’ancienne — sans que personne le sache.',
    );
    assert.equal(Number(apres.version), 1, 'Le compteur de verrouillage optimiste a bougé.');
  });

  test('§3 — la prorogation PROROGE, et elle exige d’avoir été notifiée', async () => {
    // Même date de réception que le §2 : sans la prorogation, celle-ci serait en
    // retard. C'est ce qui fait DÉCIDER la prorogation, plutôt que de l'illustrer.
    await semerDemande('DSAR-PROROGEE', FILIALE_A, {
      recueLe: ilYA(45),
      statut: 'en_cours',
      prorogee: true,
      prorogeeLe: ilYA(20),
      prorogationMotif: 'Demande portant sur onze ans d’archives de paie.',
    });
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await vueDe(monte, 'DSAR-PROROGEE');
      assert.equal(
        vue.etat,
        'a_traiter',
        'La prorogation de deux mois ne proroge rien : la demande est comptée en retard ' +
          'alors que l’article 12 §3 l’autorise.',
      );
      assert.ok(vue.joursRestants > 0);
      assert.match(vue.reference, /prorogé de deux mois/u);
    } finally {
      await monte.fermer();
    }

    // ── ET LA CONTREPARTIE : une prorogation NON NOTIFIÉE n'en est pas une ──
    //
    // L'article 12 §3 second alinéa impose d'informer la personne dans le mois,
    // en motivant. Une prorogation posée sans cela fabriquerait un délai que le
    // responsable croit avoir et qu'il n'a pas.
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        perimetre('semeur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query(
            `insert into demandes_droits (id, filiale_id, type_demande, demandeur, prorogee)
                 values ('DSAR-SANS-NOTIF', $1, 'acces', 'Témoin', true)`,
            [FILIALE_A],
          );
        },
      ),
    );
    assert.match(
      String(erreur.message),
      /ck_demandes_droits_prorogation|contrainte/iu,
      `Une prorogation non notifiée a été acceptée : ${erreur.message}`,
    );
  });

  test('§4 — un REFUS se motive ET se date (RGPD art. 12 §4)', async () => {
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        perimetre('semeur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query(
            `insert into demandes_droits (id, filiale_id, type_demande, demandeur, statut)
                 values ('DSAR-REFUS-MUET', $1, 'effacement', 'Témoin', 'refusee')`,
            [FILIALE_A],
          );
        },
      ),
    );
    assert.match(
      String(erreur.message),
      /ck_demandes_droits_refus|contrainte/iu,
      'Un refus SANS motif ni date a été accepté : c’est une fin de non-recevoir ' +
        'silencieuse, et l’article 12 §4 impose exactement l’inverse — informer la ' +
        `personne dans le même délai, avec les voies de recours. ${erreur.message}`,
    );

    // Et le refus MOTIVÉ et DATÉ, lui, passe — sans quoi l'essai mesurerait un
    // schéma qui refuse tout, ce qui n'est pas la propriété voulue.
    await semerDemande('DSAR-REFUS', FILIALE_A, {
      type: 'effacement',
      statut: 'refusee',
      repondueLe: '2026-02-01',
      motifRefus: 'Conservation imposée par l’article L.3243-4 du code du travail.',
    });
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await vueDe(monte, 'DSAR-REFUS');
      assert.equal(vue.etat, 'refusee');
      assert.match(vue.motifRefus, /code du travail/u);
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — la filiale voisine ne voit pas les personnes qui ont écrit ici', async () => {
    // ⚠️ L'identifiant ne peut pas être « DSAR-B » : le semis partagé en pose déjà
    // un par filiale, sous ce nom-là. Le heurter rendrait un conflit de clé, et
    // l'essai accuserait le produit d'un défaut qui serait le sien.
    await semerDemande('DSAR-VOISINE', FILIALE_B, { demandeur: 'Herr Klaus Bergmann' });
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { corps } = await monte.appeler('GET', '/api/demandes-droits/etat');
      assert.equal(
        corps.demandes.some((d) => d.id === 'DSAR-VOISINE' || d.id === 'DSAR-B'),
        false,
        'FUITE ENTRE FILIALES : une demande reçue par la filiale allemande est visible depuis ' +
          'Toulouse — avec le NOM de la personne qui l’a écrite.',
      );
      // Contrôle de matière : la route n'est pas vide par accident.
      assert.ok(
        corps.demandes.some((d) => d.id === 'DSAR-1'),
        'Toulouse doit voir SES propres demandes : sinon l’essai passerait au vert sur une ' +
          'route en panne.',
      );
      // ⚠️ Et Toulouse voit bien SA demande du semis partagé : sans cette moitié,
      // « rien ne fuit » serait vrai d'une route qui ne rend rien du tout.
      assert.ok(corps.demandes.some((d) => d.id === 'DSAR-A'));
    } finally {
      await monte.fermer();
    }

    // Et le DPO groupe, lui, voit les deux — c'est ce qu'il vient chercher.
    const groupe = await monterPour(FILIALE_A, [FILIALE_A, FILIALE_B]);
    try {
      const { corps } = await groupe.appeler('GET', '/api/demandes-droits/etat');
      assert.ok(corps.demandes.some((d) => d.id === 'DSAR-VOISINE'));
      assert.ok(corps.demandes.some((d) => d.id === 'DSAR-1'));
    } finally {
      await groupe.fermer();
    }
  });

  test('§6 — le garde-fou ÉPROUVE les deux dérivations, et il MORD', async () => {
    const proprietaire = await base.connexion('proprietaire');
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_demandes_droits()'),
      [],
    );
    assert.equal(
      (
        await base.lignes(
          proprietaire,
          "select count(*)::int as n from controles_schema where fonction = 'f_verifier_demandes_droits'",
        )
      )[0].n,
      1,
      'Le garde-fou n’est pas au registre : un contrôle que rien n’appelle est un commentaire.',
    );

    // ── LA MORSURE ────────────────────────────────────────────────────────
    //
    // ⚠️ Mutation jouée dans une transaction ANNULÉE (leçon du 11/09). Celle-ci est
    // la plus tentante et la plus fausse : compter le mois en TRENTE JOURS. Le
    // 31 janvier donnerait alors le 2 mars — deux jours de retard que personne ne
    // verrait, sur tout le parc, et qui ne se verraient QUE devant une autorité.
    let anomalies;
    try {
      await proprietaire.query('begin');
      await proprietaire.query(`
        create or replace function f_echeance_droits(p_recue_le date, p_prorogee boolean)
        returns date language sql immutable
        set search_path = pg_catalog, public, pg_temp as $m$
          select case when p_recue_le is null then null
                      when coalesce(p_prorogee, false) then p_recue_le + 90
                      else p_recue_le + 30 end::date $m$`);
      anomalies = (
        await proprietaire.query('select objet, anomalie from f_verifier_demandes_droits()')
      ).rows;
    } finally {
      await proprietaire.query('rollback').catch(() => undefined);
    }

    assert.ok(
      anomalies.some((a) => a.anomalie === 'echeance_derivee_fausse'),
      'LE GARDE NE MORD PAS : un « mois » compté en trente jours passe au vert. Le décalage ' +
        'ne se verrait que devant une autorité, et il vaudrait pour toutes les demandes du ' +
        `parc à la fois.\n  Rendu : ${JSON.stringify(anomalies)}`,
    );
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_demandes_droits()'),
      [],
      'La transaction annulée a laissé la mutation derrière elle.',
    );
  });
});
