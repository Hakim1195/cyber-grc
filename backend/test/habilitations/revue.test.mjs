/**
 * revue.test.mjs — **la revue des droits d'accès, mesurée par la ROUTE.**
 *
 * ── Ce que ce fichier éprouve, et ce qu'il ne peut pas éprouver ──────────────
 *
 * L'OUVERTURE d'une revue lit l'annuaire : le banc n'en a pas, et la route
 * refuse alors en 503. C'est mesuré ici — et c'est le bon comportement, dit en
 * toutes lettres : *une revue vide attesterait que personne n'a d'accès.*
 *
 * Tout le reste — décider, signer, motiver, clore — se joue sur une revue
 * SEMÉE en base, et se mesure **en HTTP**. C'est la leçon du constat **Q-325** :
 * dix-huit essais mesuraient les jetons d'API sous un périmètre déjà posé, et
 * aucun n'a vu qu'un jeton émis rendait 401 à son premier usage.
 *
 * ── Les cinq propriétés qui font qu'une revue ENGAGE quelqu'un ───────────────
 *
 *  1. une décision porte son auteur ET sa date — sinon la revue n'engage
 *     personne, et c'est le seul point sur lequel un auditeur insistera ;
 *  2. « à examiner » n'en porte pas — sinon « non revu » et « revu » se
 *     confondent, et une revue paraît faite ;
 *  3. un retrait porte son motif — c'est lui qu'on relira dans six mois ;
 *  4. une clôture porte sa conclusion — sinon elle n'atteste que du fait
 *     d'avoir regardé ;
 *  5. 🛑 une revue CLOSE ne se modifie plus — une pièce qu'on peut retoucher
 *     après coup n'atteste de rien.
 *
 * ⚠️ Et une propriété qui va dans l'AUTRE sens, délibérément : **on peut clore
 * une revue dont des lignes restent à examiner**, et le produit le CHIFFRE.
 * L'interdire ferait qu'une revue de quatre cents lignes dont douze restent en
 * suspens serait impossible à clore, donc laissée ouverte indéfiniment — et une
 * revue jamais close ne prouve rien du tout.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
let admin;

const PERIMETRE_ADMIN = {
  utilisateurId: 'revue-admin',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: true,
};

/** Sème une revue et ses lignes, EN BASE : le banc n'a pas d'annuaire à balayer. */
async function semerRevue(id, lignes) {
  await base.avecPerimetre(
    applicatif,
    { ...perimetre('semeur-revue', FILIALE_A, [FILIALE_A, FILIALE_B], true) },
    async (client) => {
      await client.query(
        `insert into revues_habilitations (id, intitule, perimetre)
              values ($1, 'Revue de recette', '2 groupes déclarés')`,
        [id],
      );
      for (const l of lignes) {
        await client.query(
          `insert into revue_habilitation_lignes
             (id, revue_id, groupe_nom, compte_login, compte_nom, compte_desactive,
              indirect, profil_code, perimetre_groupe)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [l.id, id, l.groupe, l.login, l.nom, l.desactive ?? false, l.indirect ?? false,
           l.profil ?? 'RSSI', 'filiale'],
        );
      }
    },
    { annuler: false },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  admin = await monterGreffon(base, PERIMETRE_ADMIN);
});

after(async () => {
  await admin?.fermer();
  await applicatif?.end?.();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — L'OUVERTURE
 * ===================================================================== */

describe('§1 — ouvrir une revue', () => {
  test('sans annuaire, elle REFUSE et dit pourquoi — elle ne rend pas une revue vide', async () => {
    const { statut, corps } = await admin.appeler('POST', '/api/habilitations/revues', {
      corps: { intitule: 'Revue T3 2026' },
    });
    assert.equal(statut, 503);
    assert.match(
      String(corps.message),
      /revue vide attesterait/i,
      'le refus doit dire la CONSÉQUENCE, pas seulement l’absence de configuration',
    );
  });

  test('un intitulé vide est refusé en 400', async () => {
    const { statut } = await admin.appeler('POST', '/api/habilitations/revues', {
      corps: { intitule: '   ' },
    });
    assert.equal(statut, 400);
  });
});

/* =====================================================================
 *  §2 — DÉCIDER
 * ===================================================================== */

describe('§2 — décider d’un accès', () => {
  const REVUE = 'REVH-ESSAI-1';

  before(async () => {
    await semerRevue(REVUE, [
      { id: 'RHL-E1', groupe: 'GRC-TLS-RSSI', login: 'rssi.tls', nom: 'Camille Marchand' },
      { id: 'RHL-E2', groupe: 'GRC-TLS-RSSI', login: 'parti.tls', nom: 'Ancien Salarié',
        desactive: true },
      { id: 'RHL-E3', groupe: 'GRC-TLS-RSSI', login: 'indirect.tls', nom: 'Ilan Rossi',
        indirect: true },
    ]);
  });

  test('l’état rend les comptes, dont les DEUX anomalies qu’une revue cherche', async () => {
    const { statut, corps } = await admin.appeler(
      'GET',
      `/api/habilitations/revues?revue=${REVUE}`,
    );
    assert.equal(statut, 200);
    const revue = corps.revues.find((r) => r.id === REVUE);
    assert.ok(revue, 'contrôle de matière : la revue semée doit être rendue');
    assert.equal(revue.comptes.total, 3);
    assert.equal(revue.comptes.aExaminer, 3, 'à l’ouverture, rien n’est examiné');
    assert.equal(
      revue.comptes.desactives,
      1,
      'un compte DÉSACTIVÉ encore membre est l’anomalie n°1 d’une revue',
    );
    assert.equal(
      revue.comptes.indirects,
      1,
      'un accès obtenu par IMBRICATION est ce qu’une revue manuelle oublie',
    );
    assert.equal(revue.lignes.length, 3);
  });

  test('les lignes ne sont rendues QUE pour la revue demandée', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/revues');
    const revue = corps.revues.find((r) => r.id === REVUE);
    assert.equal(
      revue.lignes.length,
      0,
      'la liste ne doit pas servir le login de tout le monde à chaque affichage',
    );
    assert.equal(revue.comptes.total, 3, 'les COMPTES, eux, sont rendus : ils ne nomment personne');
  });

  test('« maintenu » est SIGNÉ et DATÉ, sans qu’on l’ait demandé', async () => {
    const avant = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = avant.corps.revues[0].lignes.find((l) => l.id === 'RHL-E1');

    const { statut } = await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-E1', {
      corps: { decision: 'maintenu', version: ligne.version },
    });
    assert.equal(statut, 200);

    const apres = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const maj = apres.corps.revues[0].lignes.find((l) => l.id === 'RHL-E1');
    assert.equal(maj.decision, 'maintenu');
    assert.equal(maj.decidePar, 'revue-admin', 'l’auteur vient de la SESSION, jamais du corps');
    assert.ok(maj.decideLe, 'une décision sans date n’engage personne');
  });

  test('« a_retirer » SANS motif est refusé en 400, avec la raison', async () => {
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues[0].lignes.find((l) => l.id === 'RHL-E2');
    const { statut, corps } = await admin.appeler(
      'PUT',
      '/api/habilitations/revues/lignes/RHL-E2',
      { corps: { decision: 'a_retirer', version: ligne.version } },
    );
    assert.equal(statut, 400);
    assert.match(String(corps.message), /six mois/i, 'le refus doit dire POURQUOI le motif compte');
  });

  test('« a_retirer » AVEC motif passe, et le motif est conservé', async () => {
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues[0].lignes.find((l) => l.id === 'RHL-E2');
    const { statut } = await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-E2', {
      corps: {
        decision: 'a_retirer',
        commentaire: 'Compte désactivé dans l’annuaire : accès à retirer.',
        version: ligne.version,
      },
    });
    assert.equal(statut, 200);

    const apres = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const maj = apres.corps.revues[0].lignes.find((l) => l.id === 'RHL-E2');
    assert.equal(maj.decision, 'a_retirer');
    assert.match(String(maj.commentaire), /désactivé/);
  });

  test('revenir à « a_examiner » EFFACE la signature — sinon « non revu » paraît revu', async () => {
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues[0].lignes.find((l) => l.id === 'RHL-E1');
    const { statut } = await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-E1', {
      corps: { decision: 'a_examiner', version: ligne.version },
    });
    assert.equal(statut, 200);

    const apres = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const maj = apres.corps.revues[0].lignes.find((l) => l.id === 'RHL-E1');
    assert.equal(maj.decidePar, null, 'une non-décision ne porte pas d’auteur');
    assert.equal(maj.decideLe, null, 'ni de date');
  });

  test('une décision inconnue du vocabulaire est refusée', async () => {
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues[0].lignes.find((l) => l.id === 'RHL-E3');
    const { statut } = await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-E3', {
      corps: { decision: 'on_verra_plus_tard', version: ligne.version },
    });
    assert.equal(statut, 400);
  });

  test('le verrouillage optimiste mord sur deux décisions concurrentes', async () => {
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues[0].lignes.find((l) => l.id === 'RHL-E3');

    const un = await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-E3', {
      corps: { decision: 'maintenu', version: ligne.version },
    });
    assert.equal(un.statut, 200);
    const deux = await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-E3', {
      corps: { decision: 'a_verifier', commentaire: 'x', version: ligne.version },
    });
    assert.equal(deux.statut, 409, 'la seconde ne doit pas écraser la première en silence');
  });
});

/* =====================================================================
 *  §3 — CLORE
 * ===================================================================== */

describe('§3 — clore une revue', () => {
  const REVUE = 'REVH-ESSAI-2';

  before(async () => {
    await semerRevue(REVUE, [
      { id: 'RHL-F1', groupe: 'GRC-DEU-RSSI', login: 'a.un', nom: 'A Un' },
      { id: 'RHL-F2', groupe: 'GRC-DEU-RSSI', login: 'b.deux', nom: 'B Deux' },
    ]);
  });

  test('sans conclusion, la clôture est refusée', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/revues');
    const revue = etat.corps.revues.find((r) => r.id === REVUE);
    const { statut, corps } = await admin.appeler(
      'POST',
      `/api/habilitations/revues/${REVUE}/clore`,
      { corps: { conclusion: '  ', version: revue.version } },
    );
    assert.equal(statut, 400);
    assert.match(String(corps.message), /d’avoir regardé/i);
  });

  test('on PEUT clore avec des lignes non examinées, et le produit les CHIFFRE', async () => {
    // Une seule des deux lignes est décidée.
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues.find((r) => r.id === REVUE).lignes.find((l) => l.id === 'RHL-F1');
    await admin.appeler('PUT', '/api/habilitations/revues/lignes/RHL-F1', {
      corps: { decision: 'maintenu', version: ligne.version },
    });

    const frais = await admin.appeler('GET', '/api/habilitations/revues');
    const revue = frais.corps.revues.find((r) => r.id === REVUE);
    const { statut, corps } = await admin.appeler(
      'POST',
      `/api/habilitations/revues/${REVUE}/clore`,
      {
        corps: {
          conclusion: 'Revue partielle : une ligne reste à instruire avec les RH.',
          prochaineLe: '2027-03-31',
          version: revue.version,
        },
      },
    );
    assert.equal(statut, 200, `reçu ${statut} — ${JSON.stringify(corps)}`);
    assert.equal(
      corps.restantes,
      1,
      'le RESTE doit être chiffré : un blocage se contourne, un chiffre se lit',
    );
  });

  test('🛑 une revue CLOSE refuse toute décision', async () => {
    const etat = await admin.appeler('GET', `/api/habilitations/revues?revue=${REVUE}`);
    const ligne = etat.corps.revues.find((r) => r.id === REVUE).lignes.find((l) => l.id === 'RHL-F2');
    const { statut, corps } = await admin.appeler(
      'PUT',
      '/api/habilitations/revues/lignes/RHL-F2',
      { corps: { decision: 'maintenu', version: ligne.version } },
    );
    assert.equal(statut, 409, `reçu ${statut} — ${JSON.stringify(corps)}`);
    assert.equal(corps.codeGrc ?? corps.code_grc, 'GRC09');
    assert.match(String(corps.message), /n’atteste de rien/i);
  });

  test('une revue close porte sa conclusion, son auteur et sa prochaine échéance', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/revues');
    const revue = corps.revues.find((r) => r.id === REVUE);
    assert.ok(revue.closeLe);
    assert.equal(revue.closePar, 'revue-admin');
    assert.match(String(revue.conclusion), /instruire avec les RH/);
    assert.equal(revue.prochaineLe, '2027-03-31');
  });

  test('une revue déjà close ne se clôt pas deux fois', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/revues');
    const revue = corps.revues.find((r) => r.id === REVUE);
    const { statut } = await admin.appeler('POST', `/api/habilitations/revues/${REVUE}/clore`, {
      corps: { conclusion: 'Encore une fois', version: revue.version },
    });
    assert.equal(statut, 409);
  });
});

/* =====================================================================
 *  §4 — LA TRACE
 * ===================================================================== */

describe('§4 — le journal d’audit', () => {
  test('la clôture d’une revue est journalisée, avec le RESTE non examiné', async () => {
    const rows = await base.avecPerimetre(
      applicatif,
      perimetre('lecteur-journal', FILIALE_A, [FILIALE_A]),
      async (client) => {
        const r = await client.query(
          `select action, resume, valeurs_apres
             from journal_audit
            where entite_type = 'revues_habilitations' and entite_id = 'REVH-ESSAI-2'
            order by numero desc limit 1`,
        );
        return r.rows;
      },
    );
    assert.equal(rows.length, 1, 'la clôture doit être journalisée');
    assert.equal(rows[0].action, 'administration');
    assert.equal(
      rows[0].valeurs_apres.lignes_non_examinees,
      1,
      'le journal porte ce que la revue n’a PAS couvert : c’est la moitié qu’on oublie',
    );
  });
});
