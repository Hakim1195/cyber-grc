/**
 * bornes-reprise.test.mjs — la reprise est bornée, et le refus ne coûte rien.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Les constats **Q-19** et **Q-20** : une reprise n'avait pas de borne de volume,
 * et la chaîne de déploiement la coupe à 60 s. Un fichier trop gros était donc
 * travaillé pendant quarante secondes, puis interrompu par le frontal — sans que
 * personne n'apprenne jamais l'issue, et en occupant une connexion du pool
 * pendant tout ce temps. Dix reprises simultanées suffisaient à faire répondre
 * 500 à tout lecteur ordinaire.
 *
 * Le correctif tient en quatre propriétés, et l'agent qui l'a écrit a mesuré
 * lui-même que le banc ne le tenait pas : ses cinq mutations passaient toutes.
 * C'est l'état exact que le constat Q-21 reproche — un remède qui marche et que
 * rien ne retient. Les voici tenues :
 *
 *  1. la borne REFUSE, et son message dit le reçu ET l'admis ;
 *  2. à la borne exacte, la reprise passe et les lignes atterrissent ;
 *  3. le refus PRÉCÈDE la prise de connexion — sous pool saturé, un fichier
 *     hors borne reçoit toujours 413, quand un lecteur ordinaire reçoit 503 ;
 *  4. une connexion qui tombe n'écrit RIEN.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { fichier, instantane } from '../reprise/jeux-essai.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** La borne publiée par le modèle, relue au démarrage plutôt que recopiée. */
let BORNE;
/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;

const lectureA = perimetre('temoin', FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  // Pool volontairement ÉTROIT : la saturation s'éprouve avec deux connexions
  // retenues, pas avec dix reprises simultanées qui coûteraient une minute.
  serveur = await monterServeurReel(base, { env: { BASE_POOL_MAX: '2' } });

  const modele = await serveur.appeler('GET', '/api/modele');
  assert.equal(modele.statut, 200);
  BORNE = modele.corps.bornes?.lignesParReprise;
  assert.equal(
    typeof BORNE,
    'number',
    'La borne doit être PUBLIÉE par « /api/modele » : un client qui ne peut pas la lire ' +
      'ne peut pas scinder son fichier avant de l’envoyer.',
  );
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Un fichier `grc-backup` de `n` risques, tous marqués. */
function fichierDe(n, marque) {
  return fichier(12, instantane(12, {
    risques: Array.from({ length: n }, (_, i) => ({
      id: `RISK-${marque}-${String(i)}`,
      nom: `${marque} ${String(i)}`,
    })),
  }));
}

/** Envoie un fichier à la route de reprise, par `inject()`. */
function reprendre(n, marque) {
  return serveur.appeler('POST', '/api/reprise', {
    corps: { mode: 'fusionner', fichier: { nom: `${marque}.json`, contenu: fichierDe(n, marque) } },
  });
}

/** Lignes portant un marqueur, comptées par une connexion tierce. */
async function compter(marque) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, lectureA, async (c) =>
    Number((await c.query('select count(*)::int as n from risques where nom like $1', [`${marque} %`])).rows[0].n));
}

describe('La borne de volume de la reprise (constat Q-19)', () => {
  test('AU-DELÀ : refus 413, et le message dit le REÇU et l’ADMIS', async () => {
    // Un message qui dirait seulement « fichier trop gros » laisserait
    // l'exploitant deviner de combien scinder. Les deux nombres sont le remède.
    const recu = BORNE + 2400;
    const reponse = await reprendre(recu, 'HORS');

    assert.equal(reponse.statut, 413, JSON.stringify(reponse.corps).slice(0, 300));
    assert.equal(reponse.corps.erreur, 'volume_excessif');
    assert.match(reponse.corps.message, new RegExp(String(recu)), 'Le message doit dire ce qu’il a REÇU.');
    assert.match(reponse.corps.message, new RegExp(String(BORNE)), 'Et ce qu’il ADMET.');
    assert.match(
      reponse.corps.message,
      /rien n’a été modifié|rien n'a été modifié/i,
      'Et que le refus est total : une reprise à moitié appliquée serait le pire des états.',
    );
    assert.equal(await compter('HORS'), 0, 'Un refus de volume n’écrit rien.');
  });

  test('À LA BORNE EXACTE : la reprise passe, et les lignes SONT en base', async () => {
    // ── Pourquoi la borne exacte, et non « un fichier raisonnable » ──────────
    //
    // Un essai qui accepterait 200 enregistrements ne dirait rien de l'endroit
    // où la borne se trouve : elle pourrait valoir 300 ou un milliard, il
    // resterait vert. Le couple « BORNE acceptée / BORNE+1 refusée » dit les
    // deux à la fois, pour le même prix, et il tombe aussi bien quand on relâche
    // la borne que quand on la resserre.
    const dedans = await reprendre(BORNE, 'DANS');
    assert.equal(dedans.statut, 200, JSON.stringify(dedans.corps).slice(0, 300));
    assert.equal(dedans.corps.bilan.crees.risques, BORNE);
    assert.equal(
      await compter('DANS'),
      BORNE,
      'Ce que le bilan annonce doit être ce que la base porte : c’est la leçon du bloquant T-1.',
    );

    const juste = await reprendre(BORNE + 1, 'JUSTE');
    assert.equal(juste.statut, 413, `Un enregistrement de plus doit être refusé : ${JSON.stringify(juste.corps).slice(0, 200)}`);
    assert.equal(await compter('JUSTE'), 0);
  });
});

describe('Le refus PRÉCÈDE la prise de connexion (constat Q-20)', () => {
  /** Retient `n` connexions du pool, joue quelque chose, puis les rend. */
  async function poolSature(action) {
    const retenues = [];
    try {
      // Le pool est monté à 2 : deux prises suffisent à le remplir.
      retenues.push(await serveur.pool.connect());
      retenues.push(await serveur.pool.connect());
      return await action();
    } finally {
      for (const client of retenues) client.release();
    }
  }

  test('POOL SATURÉ : un fichier hors borne reçoit 413, un lecteur ordinaire 503', async () => {
    // ── La propriété, énoncée sans délai ────────────────────────────────────
    //
    // On pourrait mesurer que le refus arrive « en moins d'une seconde ». Ce
    // serait vrai, et fragile : une machine chargée le rendrait faux sans qu'une
    // seule propriété ait bougé. La forme robuste est un STATUT — sous un pool
    // entièrement occupé, un fichier hors borne reçoit quand même son 413, ce
    // qui n'est possible que si le refus n'a demandé aucune connexion. Le même
    // essai mesure la contre-épreuve : un lecteur ordinaire, lui, reçoit 503.
    const { horsBorne, lecteur } = await poolSature(async () => ({
      horsBorne: await reprendre(BORNE + 2400, 'SATURE'),
      lecteur: await serveur.appeler('GET', '/api/donnees'),
    }));

    assert.equal(
      horsBorne.statut,
      413,
      'Un fichier hors borne doit être refusé SANS connexion : sinon chaque refus fait ' +
        `attendre les autres, et c’est le constat Q-20. Reçu : ${JSON.stringify(horsBorne.corps).slice(0, 200)}`,
    );
    assert.equal(horsBorne.corps.erreur, 'volume_excessif');
    assert.equal(await compter('SATURE'), 0);

    // ── Q-20 : la saturation SE DIT, elle ne se déguise pas en panne ────────
    assert.equal(
      lecteur.statut,
      503,
      `Un pool plein est un état passager : il se rend en 503, jamais en 500 « erreur ` +
        `interne » — le navigateur ne reconnaîtrait pas qu’il peut réessayer. ` +
        `Reçu : ${JSON.stringify(lecteur.corps).slice(0, 200)}`,
    );
    assert.equal(lecteur.corps.erreur, 'indisponible');
    assert.match(lecteur.corps.message, /réessayez/i, 'Et le message dit quoi faire.');
    assert.equal(
      /pool|connexion|pg|postgres/i.test(JSON.stringify(lecteur.corps)),
      false,
      'Sans nommer un rouage interne (contrôle S12).',
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : au repos, le même lecteur passe, et jamais en 503', async () => {
    // Sans cette moitié, l'essai précédent serait satisfait par un serveur qui
    // rend 503 en toutes circonstances — c'est-à-dire par un serveur en panne.
    const lecteur = await serveur.appeler('GET', '/api/donnees');
    assert.equal(lecteur.statut, 200, JSON.stringify(lecteur.corps).slice(0, 200));
    assert.equal(Array.isArray(lecteur.corps.data.risques), true);
  });
});

describe('Une connexion qui tombe n’écrit rien (constat Q-19)', () => {
  /**
   * Attend que le serveur ait FINI de traiter la requête abandonnée.
   *
   * ── Pourquoi ce n'est pas une attente de durée ───────────────────────────
   *
   * La rédaction attendue était « trois fois la durée pleine mesurée ». Elle est
   * juste et elle est fragile : sur une machine plus lente, l'essai conclut
   * « rien n'a été écrit » alors qu'il a seulement regardé trop tôt. Ce serait
   * un décor de la meilleure espèce — vert, plausible, et faux.
   *
   * On attend donc un ÉVÉNEMENT, et le produit en offre un : la connexion que la
   * reprise a prise au pool. Tant qu'elle est tenue, la transaction est en
   * cours ; quand elle revient, la transaction est finie — validée ou défaite —
   * et il n'y a plus rien à attendre. L'attente ne dépend d'aucune vitesse, et
   * elle ne peut pas conclure trop tôt. Elle reste bornée par sécurité, et cette
   * borne ÉCHOUE bruyamment plutôt que de laisser croire à une réussite.
   */
  async function attendreFinDeTraitement(delai = 30000) {
    const occupees = () => serveur.pool.totalCount - serveur.pool.idleCount;
    const echeance = Date.now() + delai;
    let stables = 0;
    while (Date.now() < echeance) {
      await new Promise((resoudre) => setTimeout(resoudre, 200));
      stables = occupees() === 0 ? stables + 1 : 0;
      if (stables >= 2) return;
    }
    throw new Error(
      `Le serveur tient encore ${String(occupees())} connexion(s) après ${String(delai)} ms : ` +
        'la reprise abandonnée n’a jamais été défaite, et l’essai ne peut rien conclure.',
    );
  }

  test('ABANDON en cours de reprise : ZÉRO ligne écrite', async () => {
    // ── Il faut un VRAI port ────────────────────────────────────────────────
    // `inject()` n'ouvre pas de socket : il n'y a donc pas de fermeture à
    // observer, et le témoin d'abandon ne se déclencherait jamais. L'essai
    // écoute pour de bon, et coupe pour de bon.
    const url = await serveur.ecouter();
    const envoyer = (marque, signal) =>
      fetch(`${url}/api/reprise`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'fusionner',
          fichier: { nom: `${marque}.json`, contenu: fichierDe(2000, marque) },
        }),
        ...(signal === undefined ? {} : { signal }),
      });

    // ── Moitié symétrique, jouée EN PREMIER ─────────────────────────────────
    // Le même fichier, sans abandon, DOIT aboutir. Sans elle, « zéro ligne »
    // serait satisfait par une route qui n'écrit jamais rien.
    const complet = await envoyer('COMPLET');
    assert.equal(complet.status, 200, `La reprise non abandonnée doit aboutir : ${await complet.text()}`);
    assert.equal(await compter('COMPLET'), 2000, 'Et ses 2 000 lignes doivent être en base.');

    // ── L'abandon ───────────────────────────────────────────────────────────
    // Une demi-seconde : assez pour que la transaction soit engagée — la reprise
    // complète ci-dessus a duré plusieurs secondes —, trop peu pour qu'elle
    // s'achève.
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 500);
    let issue = 'aboutie';
    try {
      await envoyer('ABANDON', controleur.signal);
    } catch (erreur) {
      issue = erreur.name;
    } finally {
      clearTimeout(minuteur);
    }
    assert.equal(issue, 'AbortError', 'Le scénario EXIGE que le client soit parti avant la réponse.');

    // On attend que le serveur ait fini — l'événement, pas un délai.
    await attendreFinDeTraitement();

    assert.equal(
      await compter('ABANDON'),
      0,
      'Une reprise dont le client est parti ne doit RIEN laisser : la moitié d’un fichier ' +
        'appliquée est le pire état possible pour un registre qui sert de preuve en audit.',
    );
  });
});
