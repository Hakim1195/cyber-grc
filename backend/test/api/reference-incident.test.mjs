/**
 * reference-incident.test.mjs — la référence d'un incident vient du SERVEUR.
 *
 * ── Le constat, et pourquoi il n'était pas cosmétique ────────────────────────
 *
 * Constat **Q-39** : `requestIdHeader: 'x-request-id'` faisait lire à Fastify
 * un en-tête **de la requête** pour en faire `requete.id`. Or cette valeur est
 * double :
 *
 *  · c'est ce que l'API rend au client sous le nom **`reference`** dans toute
 *    réponse d'erreur — le jeton qu'on donne au support ;
 *  · c'est la clé **`reqId`** que pino pose sur les six lignes de journal d'une
 *    requête — la clé de corrélation.
 *
 * La personne tracée choisissait donc la clé sous laquelle un exploitant la
 * retrouve. Elle pouvait la répéter : **deux requêtes portant le même en-tête
 * recevaient la même référence**, et chercher une référence rendait deux
 * requêtes. C'est cette propriété-là — et pas la forme de la valeur — que ce
 * fichier tient.
 *
 * ── Pourquoi un serveur qui ÉCOUTE, et pas `inject()` ────────────────────────
 *
 * Deux choses ne s'observent pas autrement, et le défaut vivait dans les deux :
 *
 *  1. **l'en-tête d'une vraie requête** : `inject()` en accepte, mais c'est
 *     alors le banc qui décide de ce que le réseau apporte ;
 *  2. **le journal**. `construireServeur` construit son pino sur le descripteur
 *     1, à la construction. Rien, dans le processus d'essai, ne peut s'y
 *     intercaler après coup. Le journal se lit donc là où il est écrit — en
 *     faisant du serveur ce qu'il est en production : un processus séparé.
 *
 * `lancerServeurProcessus` (test/aide/serveur.mjs) joue le chemin de démarrage
 * RÉEL, `demarrer()` compris.
 *
 * ── Ce qui est assertionné, et ce qui ne l'est PAS ───────────────────────────
 *
 * **Pas la forme exacte de l'identifiant.** Le générateur a changé de forme
 * deux fois en une journée, et un banc qui épinglerait `/^REQ-\d+-[0-9a-z]{25}$/`
 * serait à reprendre à chaque fois — pour rien, puisque cette forme n'est pas
 * ce qui protège. Ce qui est normatif :
 *
 *  · le **préfixe `REQ-`**, qui dit « cette référence a été engendrée par ce
 *    serveur » — l'effet second utile du remède, et ce qui compte pour le
 *    journal inaltérable du lot L5 ;
 *  · le fait que **deux appels diffèrent**, quoi que le client envoie.
 *
 * Prérequis machine : PostgreSQL préparé (`bash db/dev/preparer_base_dev.sh`).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { exigerSilence } from '../aide/assertions.mjs';
import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { lancerServeurProcessus } from '../aide/serveur.mjs';

/** Ce que le client tente d'imposer. */
const IMPOSEE = 'REFERENCE-CHOISIE-PAR-LE-CLIENT';

/**
 * Une route d'erreur qui rend une `reference`.
 *
 * Le gestionnaire 404 n'en rend pas ; celui des erreurs, si. On prend donc un
 * refus de validation — le chemin le moins cher qui traverse `setErrorHandler`.
 */
const ROUTE_ERREUR = '/api/rafraichir?depuis=pas-un-horodatage';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await lancerServeurProcessus(base);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Appelle la route d'erreur, éventuellement avec un `x-request-id` imposé. */
async function appeler(imposee) {
  const reponse = await fetch(`${serveur.url}${ROUTE_ERREUR}`, {
    headers: imposee === undefined ? {} : { 'x-request-id': imposee },
  });
  const corps = await reponse.json();
  return { statut: reponse.status, corps };
}

/**
 * Attend que le journal ait reçu les lignes de la requête qu'on vient de faire.
 *
 * Le journal est écrit par un AUTRE processus : sa dernière ligne (« request
 * completed ») arrive après la réponse. Attendre une durée serait un pari ; on
 * attend l'ÉVÉNEMENT — la ligne de fin portant la référence en question.
 */
async function attendreJournalDe(reference, delai = 15000) {
  const echeance = Date.now() + delai;
  for (;;) {
    const lignes = serveur.journal.filter((l) => l.reqId === reference);
    if (lignes.some((l) => /request completed/.test(String(l.msg ?? '')))) return lignes;
    if (Date.now() > echeance) {
      throw new Error(
        `Aucune ligne de fin pour « ${reference} » en ${String(delai)} ms. La référence rendue ` +
          'au client doit être la clé de corrélation du journal : si elle ne l’est pas, le ' +
          'jeton donné au support ne mène nulle part.',
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/* =====================================================================
 *  §1 — La référence ne se choisit pas
 * ===================================================================== */

describe('La référence d’un incident vient du serveur (constat Q-39)', () => {
  test('LE SENS NÉGATIF : la valeur imposée par le client n’est PAS la référence', async () => {
    const { statut, corps } = await appeler(IMPOSEE);

    assert.equal(statut, 400, JSON.stringify(corps).slice(0, 200));
    assert.equal(
      typeof corps.reference,
      'string',
      `La réponse d’erreur doit porter une référence — c’est le jeton qu’on donne au ` +
        `support : ${JSON.stringify(corps)}`,
    );
    assert.notEqual(
      corps.reference,
      IMPOSEE,
      'Le client a choisi la clé sous laquelle un exploitant le retrouvera (constat Q-39). ' +
        'Il pouvait la répéter, la faire entrer en collision, ou noyer une référence sous ' +
        'mille requêtes homonymes.',
    );
    // ── La PROPRIÉTÉ, pas l'expression ────────────────────────────────────
    // « REQ- » dit : cette référence a été engendrée par ce serveur. C'est ce
    // qui se lit dans un journal, et ce qui comptera quand la valeur entrera
    // dans un enregistrement inaltérable (lot L5). La longueur, l'alphabet et
    // le nombre de segments ne sont PAS normatifs — le générateur a changé de
    // forme deux fois en une journée.
    assert.ok(
      corps.reference.startsWith('REQ-'),
      `La référence doit porter la marque du serveur : « ${corps.reference} ».`,
    );
    // Et elle est bien la clé du journal : sans cela, le jeton ne mène nulle part.
    const lignes = await attendreJournalDe(corps.reference);
    assert.ok(lignes.length >= 2, `Le journal doit porter la requête sous cette clé : ${lignes.length} ligne(s).`);
  });

  test('LA NON-COLLISION : deux requêtes de MÊME en-tête, deux références distinctes', async () => {
    // ── La propriété que le défaut retirait, et la seule qui compte pour un
    //    exploitant : chercher une référence rendait deux requêtes.
    const premiere = await appeler(IMPOSEE);
    const seconde = await appeler(IMPOSEE);

    assert.notEqual(
      premiere.corps.reference,
      seconde.corps.reference,
      `Deux requêtes distinctes ont reçu la MÊME référence (« ${premiere.corps.reference} ») ` +
        'parce qu’elles portaient le même en-tête. Un exploitant qui cherche cette référence ' +
        'trouve deux requêtes, et rien ne lui dit laquelle est la sienne (constat Q-39).',
    );
    for (const reference of [premiere.corps.reference, seconde.corps.reference]) {
      assert.ok(reference.startsWith('REQ-'), `Référence sans la marque du serveur : « ${reference} ».`);
    }

    // Contrôle symétrique : SANS en-tête, la référence est engendrée pareil.
    // Sans lui, « les deux diffèrent » serait satisfait par un serveur qui
    // n’engendre que lorsqu’on tente de lui forcer la main.
    const sansEnTete = await appeler();
    assert.ok(sansEnTete.corps.reference.startsWith('REQ-'));
    assert.notEqual(sansEnTete.corps.reference, premiere.corps.reference);
  });
});

/* =====================================================================
 *  §2 — Ce que le client a envoyé n'est pas jeté
 * ===================================================================== */

describe('La valeur du client survit, à côté et jamais à la place (constat Q-39)', () => {
  /** La ligne de journal qui garde la valeur du client, pour une référence. */
  function ligneClient(lignes) {
    return lignes.find((l) => l.referenceClient !== undefined) ?? null;
  }

  test('CONTRÔLE SYMÉTRIQUE : la valeur du client est JOURNALISÉE, telle qu’envoyée', async () => {
    // ── Sans cette moitié, un remède qui JETTERAIT purement l'en-tête
    //    passerait pour bon. Or un client qui porte sa propre corrélation a une
    //    raison légitime de vouloir la retrouver : elle est donc conservée,
    //    sous un nom qui dit d'où elle vient.
    const { corps } = await appeler(IMPOSEE);
    const lignes = await attendreJournalDe(corps.reference);
    const ligne = ligneClient(lignes);

    assert.notEqual(
      ligne,
      null,
      'La valeur envoyée par le client a été JETÉE : le remède serait alors une perte, et ' +
        `personne ne pourrait plus corréler depuis son côté. Lignes : ${JSON.stringify(lignes).slice(0, 400)}`,
    );
    assert.equal(ligne.referenceClient, IMPOSEE, 'Et elle doit être conservée telle qu’envoyée.');
    assert.match(String(ligne.msg ?? ''), /client/i, 'Le message doit dire d’où vient cette valeur.');

    // …et elle ne repart PAS dans la réponse : l'y renvoyer rendrait les deux
    // valeurs de nouveau confusables. Absence appariée : l'essai qui fait
    // paraître cette même valeur est celui-ci, deux assertions plus haut.
    exigerSilence(
      JSON.stringify(corps),
      new RegExp(IMPOSEE),
      'CONTRÔLE SYMÉTRIQUE : la valeur du client est JOURNALISÉE, telle qu’envoyée (ligne de journal)',
    );
  });

  test('BORNÉE À 64 SIGNES : 2 000 signes ne sont pas recopiés sur chaque ligne', async () => {
    // La mesure qui a enrichi le constat : l'en-tête était non borné, et sa
    // valeur recopiée sur CHAQUE ligne de journal d'une requête — un facteur
    // d'amplification gratuit sur un disque qui doit tenir trois ans (§1.7).
    const longue = 'A'.repeat(2000);
    const { corps } = await appeler(longue);
    const lignes = await attendreJournalDe(corps.reference);
    const ligne = ligneClient(lignes);

    assert.notEqual(ligne, null, 'La valeur longue doit être journalisée, bornée — pas ignorée.');
    assert.equal(
      ligne.referenceClient.length,
      64,
      `Journalisée sur ${String(ligne.referenceClient.length)} signes au lieu de 64. Une entrée ` +
        'non bornée recopiée sur chaque ligne d’une requête est une amplification offerte à ' +
        'qui veut remplir le disque de journal.',
    );
    assert.equal(ligne.referenceClient, 'A'.repeat(64), 'Et c’est bien le DÉBUT de ce qui a été envoyé.');

    // Contrôle symétrique du bornage : une valeur courte n'est pas tronquée.
    // Sans lui, « longueur 64 » serait satisfait par un remède qui remplirait.
    const courte = await appeler('corrélation-courte');
    const ligneCourte = ligneClient(await attendreJournalDe(courte.corps.reference));
    assert.equal(ligneCourte.referenceClient, 'corrélation-courte', 'Une valeur courte passe entière.');
  });

  test('LA NON-CONFUSION : sur AUCUNE ligne, les deux valeurs ne coïncident', async () => {
    // ── Le défaut, dans sa forme la plus simple : les deux étaient la même
    //    valeur. Tant qu'elles le sont, tout le reste — le préfixe, le
    //    bornage, le nom du champ — n'est que de la décoration.
    const rang = serveur.journal.length;
    const references = [];
    for (const imposee of [IMPOSEE, IMPOSEE, 'B'.repeat(2000), 'corrélation-courte']) {
      references.push((await appeler(imposee)).corps.reference);
    }
    for (const reference of references) await attendreJournalDe(reference);

    const confuses = serveur
      .depuis(rang)
      .filter((l) => l.referenceClient !== undefined && l.reqId === l.referenceClient);
    assert.deepEqual(
      confuses,
      [],
      'Des lignes de journal portent la même valeur comme référence du serveur et comme ' +
        'référence du client : les deux sont de nouveau confusables, et c’est exactement le ' +
        `constat Q-39.\n${JSON.stringify(confuses).slice(0, 400)}`,
    );

    // Et le contrôle de morsure de cette assertion : il FAUT que des lignes
    // portant les deux valeurs aient été examinées. Une comparaison qui ne
    // s’applique à rien est vraie pour rien.
    const examinees = serveur.depuis(rang).filter((l) => l.referenceClient !== undefined);
    assert.equal(
      examinees.length,
      references.length,
      `Une ligne « référence du client » par requête était attendue ; ${String(examinees.length)} ` +
        'vue(s). Sans elles, l’assertion ci-dessus ne compare rien.',
    );
    for (const ligne of examinees) {
      assert.ok(String(ligne.reqId ?? '').startsWith('REQ-'), `reqId sans la marque : ${String(ligne.reqId)}`);
    }
  });
});
