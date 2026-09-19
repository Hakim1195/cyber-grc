/**
 * acces.test.mjs — **LE PORTAIL FOURNISSEUR** (lot L28)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  🛑 LE PREMIER COMPOSANT DU PRODUIT EXPOSÉ HORS VPN
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le plan le dit : *« la porte S15 est la plus exigeante du plan […] ici le refus doit
 * être la position par défaut : en cas de doute sur ce lot, on ne livre pas »*. Cette
 * famille mesure donc d'abord ce que le portail **REFUSE**, et ensuite ce qu'il permet.
 *
 * | § | Action | Propriété |
 * |---|---|---|
 * | 1 | — | **Fermé par défaut** : sans `PORTAIL_ACTIF`, AUCUNE route n'est montée |
 * | 2 | 28.1 | Lien inconnu, expiré, révoqué : **404, jamais 403** — et indiscernables |
 * | 3 | 28.1 | Le lien porte sa filiale, et une **marque forgée** ne donne accès à rien |
 * | 4 | 28.2 | Le portail voit **son** questionnaire, et rien d'autre |
 * | 5 | 28.2 | Un lien de la filiale A n'atteint **rien** de la filiale B |
 * | 6 | 28.6 | Une réponse reprise porte **sa date d'origine** |
 * | 7 | 28.7 | L'attestation ne porte **aucune donnée du client** |
 * | 8 | 28.8 | Ouverture, réponse et dépôt sont **journalisés** |
 * | 9 | 28.3 | Le dépôt passe par **LA** chaîne du lot L6, pas par une variante |
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';

let base;
let applicatif;
let liens;
let secours;
let empreinteSecours;

const IDENTIFIANT_SECOURS = 'brise-glace-portail';
const MOT_DE_PASSE_SECOURS = 'portail-hors-vpn-2026!';

async function ecrire(filiale, travail) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    travail,
    { annuler: false },
  );
}

/** Sème un questionnaire, et rend son identifiant. */
async function semerQuestionnaire(filiale, suffixe) {
  return await ecrire(filiale, async (c) => {
    const { rows } = await c.query(
      `insert into questionnaires_tiers
           (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le, echeance)
       values ($1, $2, $3, 'anssi-hygiene', 'Questionnaire de recette',
               current_date, current_date + 30)
       returning id`,
      // ⚠️ Le prestataire est celui de LA FILIALE — la clé est composite, et un
      // identifiant inventé rend 23503 : le comportement voulu, mais ici c'est le
      // semis qui serait fautif, pas le produit.
      [`QT-PORTAIL-${suffixe}`, filiale, filiale === FILIALE_A ? 'PRESTA-A' : 'PRESTA-B'],
    );
    return rows[0].id;
  });
}

/** Pose un lien et rend son secret. */
async function poserLien(filiale, questionnaireId, options = {}) {
  const emis = liens.emettreLien(filiale);
  await ecrire(filiale, async (c) => {
    await c.query(
      `insert into portail_liens
           (filiale_id, questionnaire_id, empreinte, prefixe, destinataire, expire_le,
            revoque_le)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        filiale,
        questionnaireId,
        emis.empreinte,
        emis.prefixe,
        options.destinataire ?? 'contact@fournisseur.example',
        options.expireLe ?? new Date(Date.now() + 7 * 86_400_000),
        options.revoqueLe ?? null,
      ],
    );
  });
  return emis.secret;
}

async function avecPortail(travail, options = {}) {
  const serveur = await monterServeurReel(base, {
    authentification: 'reelle',
    env: {
      AUTH_LDAP_ACTIF: 'non',
      AUTH_COMPTE_SECOURS_IDENTIFIANT: IDENTIFIANT_SECOURS,
      AUTH_COMPTE_SECOURS_EMPREINTE: empreinteSecours,
      ...(options.ferme === true
        ? {}
        : { PORTAIL_ACTIF: 'oui', PORTAIL_URL_PUBLIQUE: 'https://portail.exemple.interne' }),
    },
  });
  try {
    return await travail(serveur);
  } finally {
    await serveur.fermer();
  }
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  liens = await moduleCompile('portail/liens.js');
  secours = await moduleCompile('auth/secours.js');
  empreinteSecours = await secours.engendrerEmpreinte(MOT_DE_PASSE_SECOURS);
  await ecrire(FILIALE_A, async (c) => {
    await c.query(
      `insert into prestataires (id, filiale_id, societe)
       values ('PRESTA-A', $1, 'Fournisseur A') on conflict do nothing`,
      [FILIALE_A],
    );
  });
  await ecrire(FILIALE_B, async (c) => {
    await c.query(
      `insert into prestataires (id, filiale_id, societe)
       values ('PRESTA-B', $1, 'Fournisseur B') on conflict do nothing`,
      [FILIALE_B],
    );
  });
});

after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  §1 — FERMÉ PAR DÉFAUT
 * ===================================================================== */

describe('§1 — la surface n’existe pas tant qu’on ne l’ouvre pas', () => {
  test('sans PORTAIL_ACTIF, AUCUNE route du portail n’est montée', async () => {
    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('GET', '/portail/questionnaire');
      // ⚠️ **404, et non 503** : pas une route qui refuserait, pas un montage à
      // moitié — la surface n'existe pas. *Ce qui n'est pas monté ne peut pas être
      // attaqué.*
      assert.equal(r.statut, 404);
      assert.equal(r.corps.erreur, 'ressource_inconnue');
    }, { ferme: true });
  });

  test('et l’ouvrir SANS URL publique refuse le démarrage', async () => {
    const cfg = await moduleCompile('config/index.js');
    let refus = null;
    try {
      cfg.chargerConfiguration({
        NODE_ENV: 'developpement',
        BASE_HOTE: '127.0.0.1', BASE_PORT: '5432', BASE_NOM: base.nom,
        BASE_UTILISATEUR: 'grc_app',
        BASE_MOT_DE_PASSE: process.env['BASE_MOT_DE_PASSE'] ?? 'dev',
        SESSION_SECRET: 'x'.repeat(64), AUTH_LDAP_ACTIF: 'non',
        SERVEUR_URL_PUBLIQUE: 'https://grc.exemple.interne',
        PORTAIL_ACTIF: 'oui',
      });
    } catch (erreur) {
      refus = erreur;
    }
    // Sans elle, les liens remis aux fournisseurs ne mènent nulle part — et le
    // produit les aurait émis quand même (classe du constat Q-199).
    assert.ok(refus !== null, 'le portail s’est ouvert sans URL publique');
    assert.match(String(refus.message), /PORTAIL_URL_PUBLIQUE/u);
  });
});

/* =====================================================================
 *  §2 et §3 — LES REFUS
 * ===================================================================== */

describe('§2 — les refus, et ils sont indiscernables', () => {
  test('inconnu, expiré, révoqué : 404, jamais 403, et la MÊME réponse', async () => {
    const q = await semerQuestionnaire(FILIALE_A, 'A');
    const inconnu = liens.emettreLien(FILIALE_A).secret;
    const expire = await poserLien(FILIALE_A, q, {
      expireLe: new Date(Date.now() - 86_400_000),
    });
    const revoque = await poserLien(FILIALE_A, q, { revoqueLe: new Date() });

    await avecPortail(async (serveur) => {
      const reponses = [];
      for (const secret of [inconnu, expire, revoque]) {
        const r = await serveur.appeler('GET', '/portail/questionnaire', {
          entetes: { 'x-grc-lien': secret },
        });
        assert.equal(r.statut, 404, `statut ${r.statut} pour un lien refusé`);
        reponses.push(JSON.stringify(r.corps).replace(/"reference":"[^"]*"/u, ''));
      }
      // ⚠️ **Indiscernables à l'octet près.** Distinguer « inconnu » de « révoqué »
      // dirait à qui essaie des liens au hasard lesquels ont existé — et la surface
      // est PUBLIQUE.
      assert.equal(reponses[0], reponses[1]);
      assert.equal(reponses[1], reponses[2]);
    });
  });

  test('aucun lien du tout : 404 aussi', async () => {
    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('GET', '/portail/questionnaire');
      assert.equal(r.statut, 404);
    });
  });
});

describe('§3 — la marque de filiale n’est crue de personne', () => {
  test('une marque FORGÉE ne donne accès à rien', async () => {
    const q = await semerQuestionnaire(FILIALE_A, 'A2');
    const bon = await poserLien(FILIALE_A, q);
    const alea = bon.slice(bon.indexOf('.') + 1);
    const forge = 'grcp_' + Buffer.from(FILIALE_B, 'utf8').toString('base64url') + '.' + alea;
    assert.notEqual(forge, bon);

    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('GET', '/portail/questionnaire', {
        entetes: { 'x-grc-lien': forge },
      });
      // L'empreinte doit encore correspondre à une ligne DE CETTE filiale-là :
      // chercher ailleurs ne trouve rien, et rend le même 404.
      assert.equal(r.statut, 404);
    });
  });

  test('un lien de forme inattendue est refusé au bord', async () => {
    await avecPortail(async (serveur) => {
      for (const mauvais of ['grcp_', 'grcp_sans点.x', 'pas-un-lien', 'grcp_' + 'z'.repeat(400)]) {
        const r = await serveur.appeler('GET', '/portail/questionnaire', {
          entetes: { 'x-grc-lien': mauvais },
        });
        assert.equal(r.statut, 404, `statut ${r.statut} pour « ${mauvais.slice(0, 20)} »`);
      }
    });
  });
});

/* =====================================================================
 *  §4 et §5 — LE CLOISONNEMENT
 * ===================================================================== */

describe('§4 — le portail voit SON questionnaire, et rien d’autre', () => {
  test('🛑 le périmètre du portail ne porte NI Groupe NI administration', async () => {
    /* ⚠️ **CETTE ASSERTION A ÉTÉ AJOUTÉE PARCE QU'UNE MUTATION PASSAIT.**
     *
     * Muter `perimetreGroupe` et `administrationGroupe` à `true` dans la session du
     * portail laissait les treize autres essais **verts** : la RLS borne encore la
     * filiale, donc la voisine restait invisible, et le §5 ne voyait rien. Ce que la
     * mutation ouvrait, elle, ne se voit pas d'un questionnaire — c'est l'écriture
     * de lignes de **portée Groupe** et la lecture des entrées **transversales** du
     * journal, que le produit réserve au périmètre Groupe (§29.7).
     *
     * *Un essai qui couvre une règle sans jamais la faire décider ne la couvre pas*
     * — constat **Q-210**, et cette fois sur la surface publique du produit.
     *
     * Le périmètre EST la propriété : on le mesure directement, sur la fonction qui
     * le fabrique, plutôt que d'espérer qu'un de ses effets se voie ailleurs.
     */
    const portail = await moduleCompile('portail/index.js');
    const p = portail.perimetreDuPortail({
      lienId: 'PLIEN-1', filialeId: FILIALE_A,
      questionnaireId: 'QT-1', destinataire: 'x@y.example',
    });
    assert.equal(p.perimetreGroupe, false, 'le portail ne voit JAMAIS le Groupe');
    assert.equal(p.administrationGroupe, false, 'le portail n’administre RIEN');
    assert.deepEqual(p.filiales, [FILIALE_A], 'une filiale, et une seule');
    assert.equal(p.filialeId, FILIALE_A);
    // Et l'identité dit d'où elle vient : il n'y a pas de compte fournisseur, et
    // fabriquer un login ferait croire à une identité que personne n'a vérifiée.
    assert.match(p.utilisateurId, /^portail:/u);
  });

  test('un lien valide ouvre son questionnaire', async () => {
    const q = await semerQuestionnaire(FILIALE_A, 'A3');
    const secret = await poserLien(FILIALE_A, q, { destinataire: 'marie@fournisseur.example' });
    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('GET', '/portail/questionnaire', {
        entetes: { 'x-grc-lien': secret },
      });
      assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 200));
      assert.equal(r.corps.questionnaire.intitule, 'Questionnaire de recette');
      assert.equal(r.corps.destinataire, 'marie@fournisseur.example');
      // ⚠️ **Aucune donnée du client au-delà du questionnaire** : pas de liste de
      // prestataires, pas de mesures, pas de risques (critère 28.2).
      assert.equal(r.corps.prestataires, undefined);
      assert.equal(r.corps.mesures, undefined);
      assert.equal(r.corps.risques, undefined);
    });
  });

  test('§5 — un lien de la filiale A n’atteint RIEN de la filiale B', async () => {
    const qa = await semerQuestionnaire(FILIALE_A, 'A4');
    const qb = await semerQuestionnaire(FILIALE_B, 'B4');
    // La filiale B répond à son questionnaire.
    await ecrire(FILIALE_B, async (c) => {
      await c.query(
        `insert into questionnaire_reponses (filiale_id, questionnaire_id, code, reponse)
         values ($1, $2, '1', 'oui')`,
        [FILIALE_B, qb],
      );
    });
    const secretA = await poserLien(FILIALE_A, qa);

    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('GET', '/portail/questionnaire', {
        entetes: { 'x-grc-lien': secretA },
      });
      assert.equal(r.statut, 200);
      // ⚠️ Deux barrières : la RLS borne la filiale, et un `where questionnaire_id`
      // borne l'objet. C'est ici que la première coûterait le plus cher.
      assert.deepEqual(r.corps.reponses, []);
      const rendu = JSON.stringify(r.corps);
      assert.ok(!rendu.includes(qb), 'le questionnaire de la voisine est cité');
      assert.ok(!rendu.includes(FILIALE_B), 'la filiale voisine est citée');
    });
  });
});

/* =====================================================================
 *  §6 à §8 — RÉPONDRE, REPRENDRE, ATTESTER
 * ===================================================================== */

describe('§6 — répondre, et reprendre', () => {
  test('les réponses s’enregistrent, et elles sont relues', async () => {
    const q = await semerQuestionnaire(FILIALE_A, 'A5');
    const secret = await poserLien(FILIALE_A, q);
    await avecPortail(async (serveur) => {
      const envoi = await serveur.appeler('POST', '/portail/reponses', {
        entetes: { 'x-grc-lien': secret, 'content-type': 'application/json' },
        corps: { reponses: [{ code: '1', reponse: 'oui', commentaire: 'Fait en 2026.' }] },
      });
      assert.equal(envoi.statut, 200, JSON.stringify(envoi.corps).slice(0, 200));
      assert.equal(envoi.corps.enregistrees, 1);

      const relu = await serveur.appeler('GET', '/portail/questionnaire', {
        entetes: { 'x-grc-lien': secret },
      });
      const une = relu.corps.reponses.find((x) => x.code === '1');
      assert.equal(une.reponse, 'oui');
      // ⚠️ Une réponse SAISIE n'est pas une reprise : elle n'a pas de date d'origine.
      assert.equal(une.reprise_donnee_le, null);
    });
  });

  test('🛑 une réponse REPRISE porte sa DATE D’ORIGINE', async () => {
    // Une campagne précédente, reçue, avec une réponse ancienne.
    const ancien = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        // ⚠️ `envoye_le` est OBLIGATOIRE dès qu'on pose `recu_le` : on ne reçoit pas
        // un questionnaire qu'on n'a pas envoyé. Le schéma le tient, et il a raison.
        `insert into questionnaires_tiers
             (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le, recu_le)
         values ('QT-PORTAIL-VIEUX', $1, 'PRESTA-A', 'anssi-hygiene',
                 'Campagne 2024', date '2024-05-01', date '2024-06-01')
         returning id`,
        [FILIALE_A],
      );
      await c.query(
        `insert into questionnaire_reponses (filiale_id, questionnaire_id, code, reponse)
         values ($1, $2, '2', 'oui')`,
        [FILIALE_A, rows[0].id],
      );
      // ⚠️ **On ne rétro-date RIEN**, et c'est ce que le banc a appris : `cree_le`
      // est non réinscriptible par déclencheur (§18.1), et c'est juste — c'est la
      // date où la LIGNE est entrée dans ce système, pas celle où le fournisseur a
      // répondu. La date d'origine d'une reprise est donc `recu_le` DU
      // QUESTIONNAIRE PRÉCÉDENT, posée ci-dessus au 1er juin 2024.
      return rows[0].id;
    });
    assert.ok(ancien);

    const neuf = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        `insert into questionnaires_tiers
             (id, filiale_id, prestataire_id, ref_id, intitule)
         values ('QT-PORTAIL-NEUF', $1, 'PRESTA-A', 'anssi-hygiene', 'Campagne 2026')
         returning id`,
        [FILIALE_A],
      );
      return rows[0].id;
    });
    const secret = await poserLien(FILIALE_A, neuf);

    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('POST', '/portail/reprendre', {
        entetes: { 'x-grc-lien': secret, 'content-type': 'application/json' },
        corps: {},
      });
      assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 200));
      assert.equal(r.corps.reprises, 1);

      const relu = await serveur.appeler('GET', '/portail/questionnaire', {
        entetes: { 'x-grc-lien': secret },
      });
      const reprise = relu.corps.reponses.find((x) => x.code === '2');
      assert.ok(reprise, 'la réponse reprise est absente');
      // 🛑 **Une réponse de 2024 présentée comme neuve serait un faux en audit.**
      assert.equal(String(reprise.reprise_donnee_le).slice(0, 10), '2024-06-01');
    });
  });

  test('et MODIFIER une réponse reprise lui RETIRE sa date d’origine', async () => {
    const secret = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        "select empreinte from portail_liens where questionnaire_id = 'QT-PORTAIL-NEUF'",
      );
      return rows.length > 0;
    });
    assert.ok(secret);
    const lien = await poserLien(FILIALE_A, 'QT-PORTAIL-NEUF');
    await avecPortail(async (serveur) => {
      await serveur.appeler('POST', '/portail/reponses', {
        entetes: { 'x-grc-lien': lien, 'content-type': 'application/json' },
        corps: { reponses: [{ code: '2', reponse: 'non' }] },
      });
      const relu = await serveur.appeler('GET', '/portail/questionnaire', {
        entetes: { 'x-grc-lien': lien },
      });
      const modifiee = relu.corps.reponses.find((x) => x.code === '2');
      assert.equal(modifiee.reponse, 'non');
      // ⚠️ Laisser la date d'une reprise sur une valeur MODIFIÉE serait présenter du
      // neuf comme de l'ancien — l'autre moitié du même faux.
      assert.equal(modifiee.reprise_donnee_le, null);
    });
  });
});

describe('§7 — l’attestation', () => {
  test('elle ne porte AUCUNE donnée du client', async () => {
    const q = await semerQuestionnaire(FILIALE_A, 'A6');
    const secret = await poserLien(FILIALE_A, q, { destinataire: 'paul@fournisseur.example' });
    await avecPortail(async (serveur) => {
      const r = await serveur.appeler('POST', '/portail/terminer', {
        entetes: { 'x-grc-lien': secret, 'content-type': 'application/json' },
        corps: {},
      });
      assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 200));
      assert.equal(r.corps.attestation.fournisseur, 'paul@fournisseur.example');
      // ⚠️ C'est SON attestation : elle atteste de ce qu'IL a déclaré, et c'est ce
      // qui fait qu'un fournisseur accepte de répondre sérieusement.
      const rendu = JSON.stringify(r.corps);
      assert.ok(!rendu.includes('Toulouse'), 'le nom du demandeur y figure');
      assert.ok(!rendu.includes(FILIALE_A), 'la filiale du demandeur y figure');
      assert.ok(!rendu.includes('Questionnaire de recette'), 'l’intitulé interne y figure');
    });
  });
});

describe('§8 — tout est journalisé', () => {
  test('ouverture et réponse laissent chacune leur trace', async () => {
    const compter = async (action) =>
      await ecrire(FILIALE_A, async (c) => {
        const { rows } = await c.query(
          'select count(*)::int as n from journal_audit where action = $1',
          [action],
        );
        return rows[0].n;
      });
    assert.ok((await compter('portail_ouverture')) > 0, 'aucune ouverture tracée');
    assert.ok((await compter('portail_reponse')) > 0, 'aucune réponse tracée');

    const entree = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        `select utilisateur_libelle, resume from journal_audit
          where action = 'portail_ouverture' order by horodatage desc limit 1`,
      );
      return rows[0];
    });
    // ⚠️ **Pas de login inventé** : il n'y a pas de compte fournisseur, et en
    // fabriquer un ferait croire à une identité que personne n'a vérifiée.
    assert.match(entree.utilisateur_libelle, /^portail:/u);
    assert.equal(entree.resume, 'Ouverture du portail fournisseur par un lien.');
  });
});

/* =====================================================================
 *  §9 — LE DÉPÔT PASSE PAR *LA* CHAÎNE
 * ===================================================================== */

describe('§9 — aucun chemin de dépôt parallèle', () => {
  test('le portail monte greffonPieces TEL QUEL — la route du dépôt répond', async () => {
    const q = await semerQuestionnaire(FILIALE_A, 'A7');
    const secret = await poserLien(FILIALE_A, q);
    await avecPortail(async (serveur) => {
      // Un corps qui n'est pas un envoi de formulaire : la CHAÎNE le refuse, avec
      // son message à elle. C'est la preuve qu'on est bien dans la chaîne du lot L6
      // et non dans une variante écrite pour le portail.
      const r = await serveur.appeler('POST', '/portail/api/pieces/risques/RISK-A', {
        entetes: { 'x-grc-lien': secret, 'content-type': 'application/json' },
        corps: { pas: 'un fichier' },
      });
      assert.notEqual(r.statut, 404, 'la route de dépôt n’est pas montée dans le portail');
      assert.ok(r.statut >= 400 && r.statut < 500, `statut ${r.statut}`);
    });
  });
});
