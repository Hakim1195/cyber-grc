/**
 * verrouillage-optimiste.test.mjs — le risque projet P1, mis en défaut à deux connexions.
 *
 * ── Ce qui est en jeu ────────────────────────────────────────────────────────
 *
 * `PLAN_SERVEUR` §1.4 : « le modèle actuel réécrit l'instantané complet à chaque
 * enregistrement. Transposé tel quel au serveur, LE DERNIER QUI ENREGISTRE ÉCRASE
 * SILENCIEUSEMENT LE TRAVAIL DES AUTRES. C'est le principal risque technique du projet,
 * et il est invisible tant qu'on n'est pas en production. »
 *
 * Invisible : c'est le mot qui commande la forme de ce fichier. Un écrasement ne lève
 * aucune erreur, ne remplit aucun journal et ne se voit qu'à la plainte d'un
 * utilisateur — « j'avais rempli ce champ hier ». On ne peut donc pas l'attraper en
 * lisant du code ; il faut deux écrivains réels et une horloge.
 *
 * ── Pourquoi DEUX CONNEXIONS et pas deux transactions simulées ───────────────
 *
 * Parce que la propriété est faite de deux moitiés, et qu'une seule connexion n'en
 * montre qu'une :
 *
 *   - la clause `and version = $2`, qui rend zéro ligne quand la version a bougé ;
 *   - le VERROU DE LIGNE de PostgreSQL, qui fait ATTENDRE le second écrivain jusqu'au
 *     commit du premier, puis lui fait ré-évaluer son `where` (niveau READ COMMITTED).
 *
 * La seconde moitié n'existe pas sans concurrence réelle : sur une connexion unique,
 * les écritures sont sérialisées par construction et le test passerait même si le
 * verrouillage n'existait pas. C'est exactement le défaut que la vague 1 a payé deux
 * fois (`CONVENTIONS.md` §20.3 : « la suite restait verte parce que rien n'exerçait le
 * chemin corrigé »).
 *
 * ── Le contrat que ce fichier fige pour la couche d'écriture de L2 ───────────
 *
 *   1. `update <table> set … where id = $1 and version = $2` — la clause de version
 *      n'est pas facultative, et le test « LA CLAUSE MORD » montre ce qu'on perd sans elle.
 *   2. Zéro ligne affectée n'est PAS un succès (voir aussi `update-zero.test.mjs`, qui
 *      traite les trois causes possibles de ce zéro).
 *   3. Le client ne fixe jamais `version` : le déclencheur l'impose (`CONVENTIONS.md`
 *      §3, §18.1 — contrôle S4 de la grille du `PLAN_EXECUTION` §4).
 *   4. Deux personnes sur deux enregistrements différents ne se gênent JAMAIS.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';

import {
  attendreBlocage,
  FILIALE_A,
  ouvrirBaseEssai,
  perimetre,
  pidSession,
  semerJeuEssai,
  suivre,
} from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Connexion d'inspection : elle n'écrit rien, elle observe les attentes de verrou. */
let observateur;
/** Les deux écrivains. Deux connexions distinctes, du compte applicatif, comme en production. */
let t1;
let t2;
/**
 * Numéro de processus PostgreSQL de `t2`, relevé UNE FOIS à l'ouverture.
 *
 * Il ne peut pas être demandé au moment où l'on en a besoin : le pilote `pg` met les
 * requêtes d'une même connexion EN FILE. Un `select pg_backend_pid()` posté pendant
 * qu'une écriture est bloquée sur un verrou attend derrière elle, et ne répond qu'une
 * fois le blocage résolu — c'est-à-dire trop tard, et après un délai de garde qui fait
 * échouer le test pour la mauvaise raison. Le piège a coûté un aller-retour ; il est
 * consigné ici pour qu'il n'en coûte pas un second.
 */
let pidT2;

/** Périmètre d'un RSSI de site : il lit et écrit sa filiale, et rien d'autre. */
const rssi = (utilisateur) => perimetre(utilisateur, FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  observateur = await base.connexion('proprietaire');
  const semeur = await base.connexion('app');
  await semerJeuEssai(base, semeur);
  t1 = await base.nouvelleConnexion('app');
  t2 = await base.nouvelleConnexion('app');
  pidT2 = await pidSession(t2);
});

after(async () => {
  await base?.fermer();
});

/**
 * Referme ce qu'un test aurait laissé ouvert. Sans ce filet, UN test en échec laisse
 * une transaction ouverte — souvent avortée — sur `t1` ou `t2`, et les huit suivants
 * échouent en cascade sur `25P02` en accusant le mauvais coupable. Un banc d'essai
 * doit désigner LE défaut, pas en fabriquer neuf.
 */
afterEach(async () => {
  for (const client of [t1, t2]) {
    await client?.query('rollback').catch(() => {});
  }
});

/* =====================================================================
 *  Outils locaux
 * ===================================================================== */

/**
 * Ouvre une transaction sur `client` avec le périmètre voulu, et rend de quoi la
 * piloter pas à pas — c'est ce que `avecPerimetre` ne permet pas, puisqu'il ferme la
 * transaction avant de rendre la main. La concurrence se joue précisément dans
 * l'intervalle entre deux instructions.
 */
async function ouvrirTransaction(client, p) {
  await client.query('begin');
  await client.query(
    `select set_config('grc.utilisateur',           $1, true),
            set_config('grc.filiale_id',            $2, true),
            set_config('grc.filiales',              $3, true),
            set_config('grc.administration_groupe', $4, true)`,
    [p.utilisateur, p.filialeId ?? '', (p.filiales ?? []).join(','), p.administrationGroupe === true ? 'oui' : ''],
  );
  return {
    client,
    /** Lit la version courante — ce que fait le navigateur avant d'ouvrir une fiche. */
    async lire(id) {
      const resultat = await client.query('select version, nom from risques where id = $1', [id]);
      return resultat.rows[0];
    },
    /** L'écriture ciblée du lot L2, dans sa forme exacte. */
    ecrire(id, version, nom) {
      return client.query('update risques set nom = $3 where id = $1 and version = $2', [id, version, nom]);
    },
    valider() {
      return client.query('commit');
    },
    annuler() {
      return client.query('rollback');
    },
  };
}

/** Lit une ligne hors de toute transaction en cours, comme le ferait un troisième utilisateur. */
async function relire(id) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, rssi('temoin'), async (c) => {
    const resultat = await c.query('select version, nom from risques where id = $1', [id]);
    return resultat.rows[0];
  });
}

/* =====================================================================
 *  Le duel — deux écrivains, une seule version
 * ===================================================================== */

describe('Deux écritures sur la même version : une seule passe (PLAN_SERVEUR §1.4)', () => {
  test('la seconde écriture n’affecte AUCUNE ligne, et le travail de la première survit', async () => {
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));

    // Les deux ouvrent la même fiche et y lisent la même version : c'est la situation
    // ordinaire de deux personnes qui travaillent le même matin.
    const vueAlice = await alice.lire('RISK-A');
    const vueBob = await bob.lire('RISK-A');
    assert.equal(vueAlice.version, vueBob.version, 'Les deux doivent partir de la même version.');

    const gagnante = await alice.ecrire('RISK-A', vueAlice.version, 'Rançongiciel — analyse d’Alice');
    assert.equal(gagnante.rowCount, 1);
    await alice.valider();

    const perdante = await bob.ecrire('RISK-A', vueBob.version, 'Rançongiciel — analyse de Bob');
    assert.equal(perdante.rowCount, 0, 'Zéro ligne : c’est le refus, et c’est GRC03 côté API.');
    await bob.valider();

    const finale = await relire('RISK-A');
    assert.equal(finale.nom, 'Rançongiciel — analyse d’Alice', 'Le travail d’Alice ne doit pas avoir été écrasé.');
    assert.equal(finale.version, vueAlice.version + 1, 'Une seule écriture a eu lieu : une seule incrémentation.');
  });

  test('LA CLAUSE MORD : sans « and version = $2 », Bob écrase Alice sans que rien ne le dise', async () => {
    // Contrôle de morsure. On rejoue le duel EXACTEMENT à l'identique, en retirant la
    // seule chose qui protège : la clause de version. Sans ce contrôle, le test
    // précédent passerait aussi bien contre une couche d'écriture qui n'aurait jamais
    // implémenté le verrouillage — il suffirait que Bob soit lent.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));

    const vueBob = await bob.lire('RISK2-A');
    await alice.ecrire('RISK2-A', (await alice.lire('RISK2-A')).version, 'Fuite de données — analyse d’Alice');
    await alice.valider();

    const perdante = await bob.client.query(
      'update risques set nom = $2 where id = $1', // ← la clause de version en moins
      ['RISK2-A', 'Fuite de données — analyse de Bob'],
    );
    await bob.valider();

    assert.equal(perdante.rowCount, 1, 'Sans la clause, l’écriture de Bob passe : rien ne l’arrête.');
    const finale = await relire('RISK2-A');
    assert.equal(
      finale.nom,
      'Fuite de données — analyse de Bob',
      'C’est le risque P1 en une ligne : le travail d’Alice a disparu, sans erreur, sans trace.',
    );
    assert.equal(vueBob.version, 1, 'Et Bob croyait toujours travailler sur la version qu’il avait lue.');
  });

  test('écriture VRAIMENT simultanée : Bob ATTEND le commit d’Alice, puis reçoit zéro ligne', async () => {
    // Le cas que le duel séquentiel ne montre pas : les deux écritures partent avant
    // que l'une ait validé. PostgreSQL fait attendre Bob sur le verrou de ligne, puis
    // lui fait RÉ-ÉVALUER son « where » sur la version fraîche (READ COMMITTED).
    // C'est cette ré-évaluation qui transforme l'attente en refus, et rien d'autre.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));
    const depart = (await alice.lire('RISK-A')).version;

    await alice.ecrire('RISK-A', depart, 'Rançongiciel — Alice écrit la première');

    // Bob part SANS attendre : c'est tout l'objet du test.
    const tentative = suivre(bob.ecrire('RISK-A', depart, 'Rançongiciel — Bob écrit en même temps'));
    const etatObserve = await attendreBlocage(base, observateur, pidT2);
    assert.equal(
      tentative.etat.terminee,
      false,
      `Bob devrait être bloqué sur le verrou de ligne d’Alice (observé : ${etatObserve}).`,
    );

    await alice.valider();
    const perdante = await tentative.promesse;
    assert.equal(perdante.rowCount, 0, 'Débloqué, Bob doit constater que sa version n’est plus la bonne.');
    await bob.valider();

    assert.equal((await relire('RISK-A')).nom, 'Rançongiciel — Alice écrit la première');
  });

  test('ordre inverse : la propriété est symétrique, ce n’est pas Alice qui gagne toujours', async () => {
    // Une propriété qui ne tiendrait que dans un sens serait un artefact de l'ordre
    // dans lequel le test ouvre ses connexions.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));
    const depart = (await alice.lire('RISK-A')).version;
    await bob.lire('RISK-A');

    assert.equal((await bob.ecrire('RISK-A', depart, 'Rançongiciel — Bob d’abord')).rowCount, 1);
    await bob.valider();
    assert.equal((await alice.ecrire('RISK-A', depart, 'Rançongiciel — Alice ensuite')).rowCount, 0);
    await alice.valider();

    assert.equal((await relire('RISK-A')).nom, 'Rançongiciel — Bob d’abord');
  });

  test('après rechargement, le perdant réécrit — et c’est la seule issue offerte', async () => {
    // « L'interface affiche "modifié entre-temps" et propose de recharger
    // l'enregistrement » (§1.4). Ce test éprouve la sortie de conflit, sans quoi le
    // verrouillage serait une impasse plutôt qu'une protection.
    const bob = await ouvrirTransaction(t2, rssi('bob'));
    const perimee = (await bob.lire('RISK-A')).version - 1;
    assert.equal((await bob.ecrire('RISK-A', perimee, 'tentative périmée')).rowCount, 0);
    await bob.annuler();

    const apres = await ouvrirTransaction(t2, rssi('bob'));
    const rechargee = await apres.lire('RISK-A');
    assert.equal((await apres.ecrire('RISK-A', rechargee.version, 'Rançongiciel — Bob après rechargement')).rowCount, 1);
    await apres.valider();

    const finale = await relire('RISK-A');
    assert.equal(finale.nom, 'Rançongiciel — Bob après rechargement');
    assert.equal(finale.version, rechargee.version + 1);
  });

  test('deux ENTITÉS différentes ne se gênent jamais, même sans commit intermédiaire', async () => {
    // L'autre moitié de la promesse du §1.4, et celle qu'on oublie de vérifier : une
    // protection qui sérialiserait tout le monde serait inutilisable à vingt filiales.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));

    const vueAlice = await alice.lire('RISK-A');
    const vueBob = await bob.lire('RISK2-A');

    // Aucune des deux ne valide avant que l'autre ait écrit : si un verrou trop large
    // existait (verrou de table, verrou d'instantané), la seconde attendrait ici.
    const ecritureAlice = suivre(alice.ecrire('RISK-A', vueAlice.version, 'Rançongiciel — Alice'));
    const ecritureBob = suivre(bob.ecrire('RISK2-A', vueBob.version, 'Fuite de données — Bob'));

    assert.equal((await ecritureAlice.promesse).rowCount, 1);
    assert.equal((await ecritureBob.promesse).rowCount, 1);
    await alice.valider();
    await bob.valider();

    assert.equal((await relire('RISK-A')).nom, 'Rançongiciel — Alice');
    assert.equal((await relire('RISK2-A')).nom, 'Fuite de données — Bob');
  });

  test('le conflit est par ENREGISTREMENT, pas par champ : rien n’est fusionné en douce', async () => {
    // Décision de conception à rendre visible plutôt qu'à découvrir en recette : Alice
    // et Bob modifient DEUX COLONNES DIFFÉRENTES de la même fiche, et il y a quand même
    // conflit. Une fusion silencieuse par champ serait un autre écrasement — celui des
    // hypothèses de l'un par les valeurs de l'autre.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));
    const depart = (await alice.lire('RISK-A')).version;
    await bob.lire('RISK-A');

    assert.equal(
      (await alice.client.query('update risques set g_gravite = $3 where id = $1 and version = $2', ['RISK-A', depart, 4])).rowCount,
      1,
    );
    await alice.valider();
    assert.equal(
      (await bob.client.query('update risques set f_frequence = $3 where id = $1 and version = $2', ['RISK-A', depart, 2])).rowCount,
      0,
      'Deux colonnes différentes, une seule version : le refus est attendu et voulu.',
    );
    await bob.valider();
  });
});

/* =====================================================================
 *  Le compteur de version lui-même
 * ===================================================================== */

describe('Le numéro de version n’appartient pas au client (CONVENTIONS §3, §18.1)', () => {
  test('une écriture qui prétend fixer « version » est ignorée, pas refusée', async () => {
    // Contrôle S4 : « le client ne peut pas fixer version ». Ignoré et non refusé,
    // parce qu'un export grc-backup en contient (§18.1) : la reprise ne doit pas
    // échouer, elle doit simplement ne pas croire ce qu'on lui donne.
    const client = await base.connexion('app');
    const apres = await base.avecPerimetre(client, rssi('malin'), async (c) => {
      const avant = (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version;
      const resultat = await c.query(
        'update risques set nom = $3, version = 999 where id = $1 and version = $2',
        ['RISK-A', avant, 'tentative de fixer la version'],
      );
      assert.equal(resultat.rowCount, 1, "L'écriture doit passer : c'est la valeur qui est ignorée.");
      return {
        avant,
        stockee: (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version,
      };
    });
    assert.equal(apres.stockee, apres.avant + 1, 'Le déclencheur impose old.version + 1, quoi que le client demande.');
  });

  test('la version ne recule pas, et deux écritures successives comptent pour deux', async () => {
    const client = await base.connexion('app');
    const suite = await base.avecPerimetre(client, rssi('alice'), async (c) => {
      const lire = async () => (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version;
      const v0 = await lire();
      await c.query('update risques set nom = $2 where id = $1 and version = $3', ['RISK-A', 'premier jet', v0]);
      const v1 = await lire();
      await c.query('update risques set nom = $2 where id = $1 and version = $3', ['RISK-A', 'second jet', v1]);
      return [v0, v1, await lire()];
    });
    assert.deepEqual(suite, [suite[0], suite[0] + 1, suite[0] + 2]);
  });

  test('une transaction ANNULÉE ne consomme pas de version : le voisin n’est pas puni', async () => {
    // Cas mal couvert par les tests de concurrence classiques, et pourtant fréquent :
    // Alice ouvre une fiche, écrit, et sa transaction échoue (délai de garde, erreur
    // applicative). Si son incrémentation survivait, Bob recevrait un « modifié
    // entre-temps » pour une modification qui n'a jamais eu lieu.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));
    const depart = (await bob.lire('RISK2-A')).version;

    assert.equal((await alice.ecrire('RISK2-A', depart, 'écriture qui sera annulée')).rowCount, 1);
    await alice.annuler();

    assert.equal(
      (await bob.ecrire('RISK2-A', depart, 'écriture de Bob, toujours légitime')).rowCount,
      1,
      'La version lue par Bob doit rester valide : rien n’a été écrit.',
    );
    await bob.valider();
    assert.equal((await relire('RISK2-A')).nom, 'écriture de Bob, toujours légitime');
  });

  test('suppression contre modification : le supprimé l’emporte, et l’autre reçoit zéro ligne', async () => {
    // Troisième forme du duel, et celle qui mène droit au fichier voisin : ici le zéro
    // ne veut pas dire « version périmée » mais « la ligne n'existe plus ». Voir
    // `update-zero.test.mjs`.
    const alice = await ouvrirTransaction(t1, rssi('alice'));
    const bob = await ouvrirTransaction(t2, rssi('bob'));

    const cible = 'RISK-JETABLE';
    await alice.client.query('insert into risques (id, filiale_id, nom) values ($1, $2, $3)', [cible, FILIALE_A, 'à supprimer']);
    await alice.valider();

    const alice2 = await ouvrirTransaction(t1, rssi('alice'));
    const vueBob = await bob.lire(cible);
    assert.equal((await alice2.client.query('delete from risques where id = $1 and version = $2', [cible, vueBob.version])).rowCount, 1);
    await alice2.valider();

    assert.equal((await bob.ecrire(cible, vueBob.version, 'modification d’une ligne disparue')).rowCount, 0);
    await bob.valider();
  });
});
