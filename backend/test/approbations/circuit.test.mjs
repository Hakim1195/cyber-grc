/**
 * circuit.test.mjs — **les trois circuits du `PLAN_SERVEUR` §3.5, joués par HTTP.**
 *
 * Ce qui est mesuré, et pourquoi chaque point l'est :
 *
 *  1. le circuit **complet** d'un document, d'un risque et d'un rapport d'audit —
 *     chaque étape horodatée, attribuée, journalisée ;
 *  2. **une** entrée `approbation` au journal par décision, ni zéro ni deux ;
 *  3. l'**empreinte** : modifier l'objet périme le circuit, le réenregistrer sans
 *     le modifier ne le périme pas ;
 *  4. l'**irréversibilité**, mordue de deux côtés — par un `update` et un
 *     `delete` directs sous le compte applicatif, et **à travers l'API** par une
 *     course réelle entre deux transactions ;
 *  5. la **morsure de la morsure** : une étape non tranchée, elle, se modifie et
 *     se supprime. Sans elle, « tout est refusé » passerait pour « la décision
 *     est protégée ».
 *
 * ⚠️ *Un essai qui n'a rien approuvé et conclut « rien n'a fui » ne prouve
 * rien.* Chaque assertion de refus est donc doublée d'un **constat d'état** : ce
 * qui est en base après le refus, et ce qui est au journal.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { erreurAttendue, FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  etapesEnBase,
  journalEnBase,
  monterApprobations,
  profil,
  SessionDEssai,
  sessionSite,
  valeurEnBase,
} from './aide.mjs';

/** Le login est celui de `USER-A` : c'est ce qui permet de résoudre `acteur_id`. */
const LOGIN = 'rssi.toulouse';

let base;
let serveur;
let session;
let proprietaire;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(sessionSite(FILIALE_A, LOGIN), profil('validation'));
  serveur = await monterApprobations(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

const url = (entite, id) => `/api/approbations/${entite}/${id}`;

async function decider(entite, id, etape, decision = 'approuve', commentaire = undefined) {
  return await serveur.appeler('POST', url(entite, id), {
    corps: { etape, decision, ...(commentaire === undefined ? {} : { commentaire }) },
  });
}

/** Écrit directement dans la base, sous le compte APPLICATIF et sous périmètre. */
async function enBase(travail, filiale = FILIALE_A, utilisateur = LOGIN) {
  return await base.avecPerimetre(
    applicatif,
    perimetre(utilisateur, filiale, [filiale]),
    travail,
    { annuler: false },
  );
}

/* =====================================================================
 *  §1 — Le circuit d'un document, de bout en bout
 * ===================================================================== */

describe('Documents : rédaction → revue → approbation → publication', () => {
  test('avant toute décision, le circuit est ouvert et attend la rédaction', async () => {
    const r = await serveur.appeler('GET', url('documents', 'DOC-A'));
    assert.equal(r.statut, 200);
    assert.equal(r.corps.objet.portee, 'filiale');
    assert.match(r.corps.objet.empreinte, /^[0-9a-f]{64}$/u);
    assert.equal(r.corps.circuit.objet, 'document');
    assert.equal(r.corps.circuit.cycle, 1);
    assert.equal(r.corps.circuit.etat, 'en_cours');
    assert.equal(r.corps.circuit.etapeAttendue, 'redaction');
    assert.deepEqual(
      r.corps.circuit.etapes.map((e) => [e.etape, e.statut, e.correspond]),
      [
        ['redaction', 'en_attente', null],
        ['revue', 'en_attente', null],
        ['approbation', 'en_attente', null],
        ['publication', 'en_attente', null],
      ],
    );
  });

  test('la première décision est écrite, datée, attribuée — et journalisée UNE fois', async () => {
    const avant = (await journalEnBase(base, proprietaire, 'approbation')).length;
    assert.equal(avant, 0, 'Le journal ne portait aucune approbation avant ce lot : c’est le point de départ.');

    const vue = await serveur.appeler('GET', url('documents', 'DOC-A'));
    const empreinteAttendue = vue.corps.objet.empreinte;

    const r = await decider('documents', 'DOC-A', 'redaction', 'approuve', 'Rédigé le 05/09.');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    assert.equal(r.corps.circuit.etapeAttendue, 'revue');

    const lignes = await etapesEnBase(base, proprietaire, 'document', 'DOC-A');
    assert.equal(lignes.length, 1);
    const [etape] = lignes;
    assert.equal(etape.filiale_id, FILIALE_A);
    assert.equal(etape.etape, 'redaction');
    assert.equal(etape.ordre, 1);
    assert.equal(etape.statut, 'approuve');
    assert.equal(etape.datee, true, 'ck_approbations_decision : une décision est datée ou n’a pas eu lieu.');
    assert.equal(etape.acteur_libelle, LOGIN);
    // `acteur_id` référence `utilisateurs(id)`, le périmètre porte le LOGIN
    // (`utilisateurs.identifiant`) : les deux diffèrent en base, et le §18.3
    // exige qu'un essai provisionne ce cas plutôt que de valider une coïncidence.
    assert.equal(etape.acteur_id, 'USER-A');
    assert.equal(etape.commentaire, 'Rédigé le 05/09.');
    assert.equal(etape.empreinte_objet, empreinteAttendue);
    assert.equal(etape.version_objet, '1');

    const journal = await journalEnBase(base, proprietaire, 'approbation');
    assert.equal(journal.length, 1, 'Une décision, une entrée. Ni zéro, ni deux.');
    assert.equal(journal[0].entite_type, 'approbations');
    assert.equal(journal[0].entite_id, r.corps.approbation);
    assert.equal(journal[0].filiale_id, FILIALE_A);
    assert.equal(journal[0].utilisateur_libelle, LOGIN);
    assert.equal(journal[0].valeurs_apres.objet_id, 'DOC-A');
    assert.equal(journal[0].valeurs_apres.etape, 'redaction');
    assert.equal(journal[0].valeurs_apres.empreinte_objet, empreinteAttendue);
    // `resume` est une phrase du développeur (§29.5) : le commentaire de
    // l'utilisateur voyage en `jsonb`, jamais dans la phrase.
    assert.ok(!journal[0].resume.includes('Rédigé le 05/09'));
    assert.equal(journal[0].valeurs_apres.commentaire, 'Rédigé le 05/09.');
  });

  test('les trois étapes suivantes closent le circuit', async () => {
    for (const etape of ['revue', 'approbation', 'publication']) {
      const r = await decider('documents', 'DOC-A', etape);
      assert.equal(r.statut, 201, `${etape} : ${JSON.stringify(r.corps)}`);
    }
    const r = await serveur.appeler('GET', url('documents', 'DOC-A'));
    assert.equal(r.corps.circuit.etat, 'complet');
    assert.equal(r.corps.circuit.etapeAttendue, null);
    assert.equal(r.corps.circuit.cycleAttendu, null);
    assert.deepEqual(
      r.corps.circuit.etapes.map((e) => [e.etape, e.statut, e.acteur, e.correspond]),
      [
        ['redaction', 'approuve', LOGIN, true],
        ['revue', 'approuve', LOGIN, true],
        ['approbation', 'approuve', LOGIN, true],
        ['publication', 'approuve', LOGIN, true],
      ],
    );
    assert.equal((await journalEnBase(base, proprietaire, 'approbation')).length, 4);
  });

  test('un circuit complet ne se rejoue pas sur un contenu inchangé', async () => {
    const r = await decider('documents', 'DOC-A', 'redaction');
    assert.equal(r.statut, 409);
    assert.equal(r.corps.erreur, 'contrainte_base');
    assert.match(r.corps.message, /déjà complet/u);
    // Constat d'état : rien n'a bougé, ni en base ni au journal.
    assert.equal((await etapesEnBase(base, proprietaire, 'document', 'DOC-A')).length, 4);
    assert.equal((await journalEnBase(base, proprietaire, 'approbation')).length, 4);
  });
});

/* =====================================================================
 *  §2 — La séquence : on ne saute pas une étape
 * ===================================================================== */

describe('Audits : rédaction → validation, et rien d’autre', () => {
  test('valider avant d’avoir rédigé est refusé, et n’écrit rien', async () => {
    const avant = (await journalEnBase(base, proprietaire, 'approbation')).length;
    const r = await decider('audits', 'AUD-A', 'validation');
    assert.equal(r.statut, 409, JSON.stringify(r.corps));
    assert.match(r.corps.message, /« redaction » doit être franchie d’abord/u);
    assert.equal((await etapesEnBase(base, proprietaire, 'audit', 'AUD-A')).length, 0);
    assert.equal((await journalEnBase(base, proprietaire, 'approbation')).length, avant);
  });

  test('une étape qui n’appartient pas au circuit de l’objet est refusée', async () => {
    // « revue » est une étape parfaitement valide pour la base : elle est au
    // `check`. Elle n'appartient simplement pas au circuit d'un audit — ce que
    // le `check` ne sait pas dire, et que le lot ajoute.
    const r = await decider('audits', 'AUD-A', 'revue');
    assert.equal(r.statut, 409);
    assert.equal((await etapesEnBase(base, proprietaire, 'audit', 'AUD-A')).length, 0);
  });

  test('rédigé puis validé : le rapport et son auteur sont figés', async () => {
    assert.equal((await decider('audits', 'AUD-A', 'redaction')).statut, 201);
    // Rejouer l'étape franchie : le circuit attend désormais la suivante.
    const rejeu = await decider('audits', 'AUD-A', 'redaction');
    assert.equal(rejeu.statut, 409);
    assert.match(rejeu.corps.message, /« validation » doit être franchie d’abord/u);

    assert.equal((await decider('audits', 'AUD-A', 'validation')).statut, 201);
    const r = await serveur.appeler('GET', url('audits', 'AUD-A'));
    assert.equal(r.corps.circuit.etat, 'complet');
    const lignes = await etapesEnBase(base, proprietaire, 'audit', 'AUD-A');
    assert.deepEqual(
      lignes.map((l) => [l.etape, l.statut, l.acteur_libelle]),
      [
        ['redaction', 'approuve', LOGIN],
        ['validation', 'approuve', LOGIN],
      ],
    );
  });
});

/* =====================================================================
 *  §3 — L'empreinte : une approbation vaut pour UNE VERSION
 * ===================================================================== */

describe('Risques : l’acceptation du risque résiduel, et sa péremption', () => {
  test('proposition acceptée : le circuit ISO 27001 est ouvert puis clos', async () => {
    // La base porte déjà une étape « acceptation » en attente (jeu d'essai) :
    // le circuit doit la RETROUVER, pas la doubler — c'est ce que l'unicité
    // (filiale, objet, étape, ordre) impose, et ce que le `on conflict` fait.
    const semees = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    assert.deepEqual(
      semees.map((l) => [l.id, l.etape, l.statut]),
      [['APPRO-A', 'acceptation', 'en_attente']],
    );

    assert.equal((await decider('risques', 'RISK-A', 'proposition')).statut, 201);
    const r = await decider('risques', 'RISK-A', 'acceptation', 'approuve', 'Risque accepté par le métier.');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    assert.equal(r.corps.circuit.etat, 'complet');

    const apres = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    assert.equal(apres.length, 2, 'La ligne semée a été TRANCHÉE, pas doublée.');
    const acceptation = apres.find((l) => l.etape === 'acceptation');
    assert.equal(acceptation.id, 'APPRO-A');
    assert.equal(acceptation.statut, 'approuve');
    assert.equal(acceptation.acteur_libelle, LOGIN);
  });

  test('réenregistrer l’objet SANS le modifier ne périme pas le circuit', async () => {
    // La version augmente, `modifie_le` et `modifie_par` changent : ce sont
    // exactement les colonnes exclues de l'empreinte. Si elles y entraient, un
    // simple enregistrement obligerait à refaire tout le circuit.
    const avant = await valeurEnBase(base, proprietaire, "select version from risques where id = 'RISK-A'");
    assert.ok(Number.isFinite(Number(avant)), 'Version illisible : l’essai ne mesure rien.');
    await enBase(async (c) => c.query("update risques set nom = nom where id = 'RISK-A'"));
    const apres = await valeurEnBase(base, proprietaire, "select version from risques where id = 'RISK-A'");
    assert.equal(Number(apres), Number(avant) + 1, 'Le déclencheur n’a pas incrémenté : l’essai ne mesure rien.');

    const r = await serveur.appeler('GET', url('risques', 'RISK-A'));
    assert.equal(r.corps.circuit.etat, 'complet');
    assert.deepEqual(
      r.corps.circuit.etapes.map((e) => e.correspond),
      [true, true],
    );
    // Et la version figée par la décision, elle, reste celle du jour de la
    // décision : c'est `version_objet`, et elle a maintenant divergé.
    assert.deepEqual(
      r.corps.circuit.etapes.map((e) => e.versionObjet),
      ['1', '1'],
    );
    assert.equal(r.corps.objet.version, Number(avant) + 1);
  });

  test('MODIFIER l’objet périme le circuit : l’empreinte ne correspond plus', async () => {
    await enBase(async (c) =>
      c.query("update risques set nom = 'Rançongiciel — analyse révisée' where id = 'RISK-A'"),
    );

    const r = await serveur.appeler('GET', url('risques', 'RISK-A'));
    assert.equal(r.corps.circuit.etat, 'perime');
    assert.deepEqual(
      r.corps.circuit.etapes.map((e) => [e.statut, e.correspond]),
      [
        ['approuve', false],
        ['approuve', false],
      ],
    );
    // « Une nouvelle version repart du début » : la prochaine décision recevable
    // est la PREMIÈRE étape, au tour SUIVANT.
    assert.equal(r.corps.circuit.etapeAttendue, 'proposition');
    assert.equal(r.corps.circuit.cycleAttendu, 2);
  });

  test('le nouveau tour repart du début, et l’ancien reste intact', async () => {
    // Reprendre au milieu est refusé : c'est tout l'objet de « repart du début ».
    const saut = await decider('risques', 'RISK-A', 'acceptation');
    assert.equal(saut.statut, 409);
    assert.match(saut.corps.message, /« proposition » doit être franchie d’abord/u);

    const r = await decider('risques', 'RISK-A', 'proposition');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    assert.equal(r.corps.circuit.cycle, 2);
    assert.equal(r.corps.circuit.etat, 'en_cours');
    assert.equal(r.corps.circuit.etapeAttendue, 'acceptation');

    // Le tour précédent est rendu tel qu'il a été décidé : deux approbations,
    // sur une empreinte qui ne correspond plus. Rien n'a été réécrit.
    const [tour1] = r.corps.circuit.historique;
    assert.equal(tour1.ordre, 1);
    assert.equal(tour1.etat, 'perime');
    assert.deepEqual(
      tour1.etapes.map((e) => [e.etape, e.statut, e.correspond]),
      [
        ['proposition', 'approuve', false],
        ['acceptation', 'approuve', false],
      ],
    );

    const lignes = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    assert.deepEqual(
      lignes.map((l) => [l.ordre, l.etape, l.statut]),
      [
        [1, 'acceptation', 'approuve'],
        [1, 'proposition', 'approuve'],
        [2, 'proposition', 'approuve'],
      ],
    );
    // Les deux tours portent des empreintes DIFFÉRENTES : c'est ce qui rend la
    // modification démontrable trois ans plus tard.
    const tour1Proposition = lignes.find((l) => l.ordre === 1 && l.etape === 'proposition');
    const tour2Proposition = lignes.find((l) => l.ordre === 2 && l.etape === 'proposition');
    assert.notEqual(tour1Proposition.empreinte_objet, tour2Proposition.empreinte_objet);
  });

  test('un refus ferme le tour : il faut modifier l’objet pour rouvrir', async () => {
    const r = await decider('risques', 'RISK-A', 'acceptation', 'refuse', 'Maîtrise insuffisante.');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    assert.equal(r.corps.circuit.etat, 'refuse');
    assert.equal(r.corps.circuit.etapeAttendue, null);

    const bloque = await decider('risques', 'RISK-A', 'proposition');
    assert.equal(bloque.statut, 409);
    assert.match(bloque.corps.message, /refusé pour cette version/u);

    // Le refus est daté et attribué comme une approbation : c'est la moitié du
    // circuit qu'on oublie, et c'est celle qu'un auditeur cherche.
    const lignes = await etapesEnBase(base, proprietaire, 'risque', 'RISK-A');
    const refus = lignes.find((l) => l.ordre === 2 && l.etape === 'acceptation');
    assert.equal(refus.statut, 'refuse');
    assert.equal(refus.datee, true);
    assert.equal(refus.acteur_libelle, LOGIN);
    assert.equal(refus.commentaire, 'Maîtrise insuffisante.');
  });
});

/* =====================================================================
 *  §4 — L'irréversibilité, mordue
 * ===================================================================== */

describe('Une étape franchie ne se défait pas', () => {
  /** L'étape de rédaction de DOC-A, approuvée au §1. */
  let tranchee;

  before(async () => {
    const lignes = await etapesEnBase(base, proprietaire, 'document', 'DOC-A');
    tranchee = lignes.find((l) => l.etape === 'redaction');
    assert.ok(tranchee !== undefined && tranchee.statut === 'approuve');
  });

  test('un « update » direct sous le compte applicatif est refusé en GRC02', async () => {
    for (const [texte, valeurs] of [
      ["update approbations set statut = 'en_attente' where id = $1", [null]],
      ['update approbations set commentaire = $2 where id = $1', [null, 'réécriture']],
      ["update approbations set acteur_libelle = 'quelqu’un d’autre' where id = $1", [null]],
    ]) {
      const erreur = await erreurAttendue(
        enBase(async (c) => c.query(texte, [tranchee.id, ...valeurs.slice(1)])),
      );
      assert.equal(erreur.code, 'GRC02', `${texte} → ${erreur.code} : ${erreur.message}`);
      assert.match(erreur.message, /irréversible/u);
    }
  });

  test('un « delete » direct sous le compte applicatif est refusé en GRC02', async () => {
    const erreur = await erreurAttendue(
      enBase(async (c) => c.query('delete from approbations where id = $1', [tranchee.id])),
    );
    assert.equal(erreur.code, 'GRC02');
  });

  test('le PROPRIÉTAIRE de la base ne peut pas davantage la défaire', async () => {
    // Le déclencheur est armé en « enable always » : il ne se contourne pas en
    // changeant de rôle. C'est la différence entre une garantie et une politique.
    // ⚠️ Le périmètre est posé, et il le faut : `approbations` porte
    // `force row level security`, si bien qu'un « delete » du propriétaire SANS
    // périmètre est refusé en **GRC04** — c'est-à-dire par le cloisonnement, et
    // non par le verrou. La première rédaction de cet essai lisait ce GRC04 et
    // se croyait verte sur l'irréversibilité : elle mesurait l'autre barrière.
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        proprietaire,
        perimetre('proprietaire', FILIALE_A, [FILIALE_A]),
        async (c) => c.query('delete from approbations where id = $1', [tranchee.id]),
      ),
    );
    assert.equal(erreur.code, 'GRC02');
  });

  test('MORSURE : une étape NON tranchée, elle, se modifie et se supprime', async () => {
    // Sans ce contraste, « tout est refusé » passerait pour « la décision est
    // protégée ». Le commentaire de la fonction le dit : « Une étape "annule"
    // reste modifiable : elle n'a rien tranché. »
    //
    // L'objet visé n'existe pas : `approbations.objet_id` est un rattachement
    // polymorphe sans clé étrangère, et cet essai ne porte que sur le verrou.
    await enBase(async (c) =>
      c.query(
        `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre, statut)
              values ('APPRO-VERROU', $1, 'document', 'DOC-INEXISTANT', 'revue', 1, 'en_attente')`,
        [FILIALE_A],
      ),
    );
    await enBase(async (c) =>
      c.query("update approbations set statut = 'annule' where id = 'APPRO-VERROU'"),
    );
    assert.equal(
      await valeurEnBase(base, proprietaire, "select statut from approbations where id = 'APPRO-VERROU'"),
      'annule',
    );
    // « annule » n'a rien tranché : elle reste modifiable, puis supprimable.
    await enBase(async (c) =>
      c.query("update approbations set commentaire = 'annulée par erreur' where id = 'APPRO-VERROU'"),
    );
    await enBase(async (c) => c.query("delete from approbations where id = 'APPRO-VERROU'"));
    assert.equal(
      await valeurEnBase(base, proprietaire, "select count(*)::int from approbations where id = 'APPRO-VERROU'"),
      0,
    );
  });

  test('À TRAVERS L’API : deux décisions simultanées, la seconde est refusée', async () => {
    // ── Pourquoi une course, et pas un simple rejeu ────────────────────
    //
    // Le rejeu d'une étape franchie est refusé plus tôt, par la séquence
    // (§2) : la route n'atteint alors jamais le déclencheur. Le seul chemin
    // qui l'atteigne est celui où la décision est écrite ENTRE la lecture de
    // la route et son écriture — c'est-à-dire une vraie course, celle de deux
    // valideurs qui cliquent en même temps.
    //
    // Elle est jouée pour de bon : une transaction concurrente insère la
    // décision et la garde ouverte ; la route se bloque sur l'index unique ;
    // la concurrente valide ; la route reprend, retombe sur la ligne tranchée,
    // et c'est le déclencheur — pas le code — qui refuse.
    await enBase(async (c) =>
      c.query("insert into documents (id, filiale_id, titre) values ('DOC-COURSE', $1, 'Charte à valider')", [
        FILIALE_A,
      ]),
    );

    const concurrente = await base.nouvelleConnexion('app');
    await concurrente.query('begin');
    await concurrente.query(
      `select set_config('grc.utilisateur', $1, true),
              set_config('grc.filiale_id',  $2, true),
              set_config('grc.filiales',    $2, true),
              set_config('grc.administration_groupe', '', true)`,
      ['valideur.concurrent', FILIALE_A],
    );
    await concurrente.query(
      `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre,
                                 statut, acteur_libelle, date_decision, empreinte_objet)
            values ('APPRO-COURSE', $1, 'document', 'DOC-COURSE', 'redaction', 1,
                    'approuve', 'valideur.concurrent', now(), $2)`,
      [FILIALE_A, 'c'.repeat(64)],
    );

    // La route part sans être attendue : elle va se bloquer sur l'index unique.
    const enVol = decider('documents', 'DOC-COURSE', 'redaction');
    await new Promise((resoudre) => setTimeout(resoudre, 300));
    await concurrente.query('commit');

    const r = await enVol;
    assert.equal(r.statut, 409, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'contrainte_base');
    assert.equal(r.corps.code_grc, 'GRC02', 'Le refus doit venir du déclencheur, pas du code.');
    assert.match(r.corps.message, /irréversible/u);
    // Aucun message de PostgreSQL ne sort (contrôle S12).
    assert.ok(!/approbations|trigger|SQL/iu.test(r.corps.message));

    // Constat d'état : la décision de la concurrente est intacte, et une seule
    // ligne existe. La course n'a pas écrit deux fois.
    const lignes = await etapesEnBase(base, proprietaire, 'document', 'DOC-COURSE');
    assert.deepEqual(
      lignes.map((l) => [l.id, l.etape, l.statut, l.acteur_libelle]),
      [['APPRO-COURSE', 'redaction', 'approuve', 'valideur.concurrent']],
    );
    // Et rien n'a été journalisé pour la décision perdue : la trace vit dans
    // la même transaction que l'écriture, donc le `rollback` l'a emportée.
    const journal = await journalEnBase(base, proprietaire, 'approbation');
    assert.equal(
      journal.filter((e) => e.valeurs_apres?.objet_id === 'DOC-COURSE').length,
      0,
      'Une décision refusée qui laisserait une trace « approbation » ferait mentir le journal.',
    );
  });
});

/* =====================================================================
 *  §5 — Les documents de portée Groupe
 * ===================================================================== */

describe('Un document du socle Groupe s’approuve dans la filiale active', () => {
  test('la portée est dite, et l’étape est rattachée à la filiale qui décide', async () => {
    const vue = await serveur.appeler('GET', url('documents', 'DOC-G'));
    assert.equal(vue.statut, 200);
    assert.equal(vue.corps.objet.portee, 'groupe');

    const r = await decider('documents', 'DOC-G', 'redaction');
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    const lignes = await etapesEnBase(base, proprietaire, 'document', 'DOC-G');
    // `approbations.filiale_id` est « not null » : l'étape ne PEUT être rattachée
    // qu'à une filiale. Voir le rapport du lot — c'est un constat sur le modèle,
    // pas un choix de cette route.
    assert.deepEqual(
      lignes.map((l) => [l.filiale_id, l.etape, l.statut]),
      [[FILIALE_A, 'redaction', 'approuve']],
    );
  });
});

/* =====================================================================
 *  §6 — Ce que la route refuse de servir
 * ===================================================================== */

describe('Les bords de la route', () => {
  test('une entité hors du circuit est refusée au bord, en 400', async () => {
    // ── L'ORDRE des deux refus, et ce qu'il a fallu corriger ───────────
    //
    // La première rédaction attendait 400 avec le profil du fichier, et
    // recevait **403**. Elle avait raison sur le fond et tort sur la mesure :
    // le crochet `onRequest` se prononce AVANT le schéma, et le profil de ce
    // fichier ne porte pas le domaine `actifs`. Le 403 était donc juste — mais
    // il ne prouvait rien de la borne du schéma, qui restait non mesurée.
    //
    // On donne donc le domaine, pour que la question soit seulement posée.
    session.poser(sessionSite(FILIALE_A, LOGIN), profil('validation', {
      domaines: ['documents', 'risques', 'audits', 'actifs'],
    }));
    try {
      const r = await serveur.appeler('GET', url('actifs', 'ACTIF-A'));
      assert.equal(r.statut, 400, JSON.stringify(r.corps));
      assert.equal(r.corps.erreur, 'donnee_invalide');
      // Et rien n'a été lu : la route n'a pas eu à connaître `actifs`.
      assert.ok(!/actifs/u.test(r.corps.message ?? ''));
    } finally {
      session.poser(sessionSite(FILIALE_A, LOGIN), profil('validation'));
    }
  });

  test('sans le domaine, c’est le CROCHET qui refuse, et plus tôt', async () => {
    // Contraste du précédent : le même chemin, sans le domaine, rend 403.
    // Sans ce couple, on ne saurait pas lequel des deux contrôles a parlé.
    const r = await serveur.appeler('GET', url('actifs', 'ACTIF-A'));
    assert.equal(r.statut, 403);
    assert.equal(r.corps.erreur, 'droit_insuffisant');
  });

  test('un objet inexistant rend 404, jamais un circuit vide', async () => {
    // Un « 200 avec zéro étape » dirait deux faussetés : que l'identifiant
    // existe, et qu'aucune approbation n'a eu lieu.
    const r = await serveur.appeler('GET', url('documents', 'DOC-QUI-N-EXISTE-PAS'));
    assert.equal(r.statut, 404);
    assert.equal(r.corps.erreur, 'ressource_inconnue');
  });

  test('un corps sans décision, ou avec une décision inventée, est refusé', async () => {
    for (const corps of [
      { etape: 'redaction' },
      { etape: 'redaction', decision: 'peut-etre' },
      { decision: 'approuve' },
      { etape: '', decision: 'approuve' },
      { etape: 'redaction', decision: 'approuve', commentaire: 'x'.repeat(4001) },
    ]) {
      const r = await serveur.appeler('POST', url('documents', 'DOC-A'), { corps });
      assert.equal(r.statut, 400, JSON.stringify({ corps, reponse: r.corps }));
    }
  });

  test('une propriété inconnue du corps est RETIRÉE, pas refusée — et rien ne la garde', async () => {
    // ⚠️ Mesuré, et contraire à ce que le schéma laisse croire.
    // `additionalProperties: false` ne rend pas 400 chez Fastify : son AJV est
    // configuré avec `removeAdditional`, et la clé inconnue est simplement
    // retirée du corps. L'essai qui attendait 400 ici avait tort, et il valait
    // mieux le mesurer que de le supposer — un schéma qu'on croit refuser et
    // qui nettoie est exactement le genre d'écart qui se découvre trop tard.
    //
    // Ce qui compte reste vrai : la clé n'atteint ni la base, ni le journal.
    const r = await serveur.appeler('POST', url('documents', 'DOC-G'), {
      corps: { etape: 'revue', decision: 'approuve', inconnu: 'charge' },
    });
    assert.equal(r.statut, 201, JSON.stringify(r.corps));
    const lignes = await etapesEnBase(base, proprietaire, 'document', 'DOC-G');
    assert.ok(!JSON.stringify(lignes).includes('charge'));
    const journal = await journalEnBase(base, proprietaire, 'approbation');
    assert.ok(!JSON.stringify(journal).includes('charge'));
  });
});
