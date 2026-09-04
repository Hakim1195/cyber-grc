/**
 * Le niveau **`validation`**, exigé par déclaration et prononcé dans un crochet
 * `onRequest` — jamais dans le corps d'une route.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et ce qu'il faudrait pour qu'il disparaisse
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/api/droits.ts` déclare quatre niveaux, dont `validation`, avec ce
 * commentaire : *« `validation` n'est encore exercé par aucune route (le circuit
 * d'approbation est le lot L8) ; il est néanmoins déclaré, parce qu'un niveau
 * absent du type serait un niveau qu'un profil AD ne peut pas porter. »* Le lot
 * L8 est ce premier usage.
 *
 * ⚠️ **Le vocabulaire d'accès ne sait pas encore l'exprimer.** Une déclaration
 * de route porte une `action` et un `domaine` ; le niveau minimal s'en déduit
 * par `NIVEAU_MINIMAL`, qui associe :
 *
 *     lire → lecture · ecrire → contribution · administrer → administration
 *
 * Il n'existe **aucune action dont le niveau minimal soit `validation`**. Une
 * route d'approbation déclarée `ecrire` serait donc ouverte à un profil
 * *Contribution* — c'est-à-dire à quiconque peut rédiger le document qu'il
 * s'agit d'approuver, ce qui vide le circuit de son sens.
 *
 * **Le correctif durable tient en deux lignes, et il est hors du périmètre de ce
 * lot** (`src/api/droits.ts`, propriété de l'orchestrateur) :
 *
 *     export type ActionDemandee = … | 'valider';
 *     const NIVEAU_MINIMAL = { …, valider: 'validation' };
 *
 * Le jour où elles seront écrites, les routes déclareront
 * `{ action: 'valider', domaine: 'selon-entite' }`, `deciderAcces` tranchera
 * comme pour tout le reste, et **ce fichier entier sera supprimé**. Il est écrit
 * pour être jetable, et sa suppression ne changera rien au comportement observé :
 * `test/approbations/droits.test.mjs` mesure des statuts, pas des chemins.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qu'il fait, et surtout ce qu'il ne fait pas
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · Il **resserre**, il n'ouvre jamais. Le crochet du greffon parent s'est déjà
 *    prononcé — rythme, identité, filiale active, action, domaine, périmètre —
 *    et a laissé passer. Celui-ci ne peut qu'ajouter un refus.
 *  · Il ne **duplique aucun classement de niveaux** : la comparaison est
 *    `suffit()` de `src/droits/modele.ts`, la même fonction que la couche
 *    d'authentification emploie pour résoudre les groupes AD. Réécrire un
 *    `RANG_NIVEAU` local serait le doublon silencieux que le §33.3 proscrit.
 *  · Il lit le niveau **du domaine** quand la session en donne un, et celui de
 *    la session sinon — exactement la règle de `deciderAcces` : *« jamais le
 *    plus favorable des deux : un niveau par domaine sert à RESTREINDRE. »*
 *  · Il est **déclaratif** : ce qu'il exige est écrit dans les options de la
 *    route (`config.niveauMinimal`), donc lisible et dénombrable, comme
 *    `config.acces`. Une route de ce greffon qui l'oublierait serait servie sans
 *    l'exigence — c'est pourquoi le banc lit la table des routes chez Fastify et
 *    refuse toute écriture qui ne le déclare pas.
 *  · Il est **encapsulé** : posé par `instance.register(...)`, il ne s'applique
 *    qu'aux routes de ce greffon. Aucune autre route du produit n'en voit la
 *    couleur.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { DomaineFonctionnel, NiveauAcces } from '../api/droits.js';
import { refuserDroit } from '../api/droits.js';
import { suffit } from '../droits/modele.js';
import { ErreurApplicative } from '../erreurs/index.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Niveau minimal exigé **en plus** de la classe d'accès `acces`.
     *
     * Lu par le crochet ci-dessous, qui n'appartient qu'au greffon des
     * approbations. Absent, la route s'en tient à ce que `deciderAcces` a
     * décidé.
     */
    niveauMinimal?: NiveauAcces;
  }
}

/**
 * Pose le crochet sur l'instance **encapsulée** du greffon.
 *
 * @param domaineDe rend le domaine que la requête met en jeu, ou `null` si elle
 *   n'en vise aucun. C'est le greffon qui le sait — il connaît la forme de ses
 *   propres URL —, et non ce fichier.
 * @param tracerRefus écrit l'entrée `refus_autorisation` du `CONVENTIONS.md`
 *   §29.2. Elle est confiée au greffon plutôt que faite ici : le journal
 *   s'écrit dans une transaction, et l'ouverture d'une transaction n'appartient
 *   qu'à `avecTransaction`. **Un échec d'écriture n'annule pas le refus** —
 *   c'est l'exception que le §29.3 accorde nommément au refus de droit, qui n'a
 *   aucune écriture métier à emporter.
 */
export function exigerNiveau(
  instance: FastifyInstance,
  domaineDe: (requete: FastifyRequest) => DomaineFonctionnel | null,
  tracerRefus: (requete: FastifyRequest, detail: string) => Promise<void>,
): void {
  instance.addHook('onRequest', async (requete: FastifyRequest) => {
    const exige = requete.routeOptions.config.niveauMinimal;
    if (exige === undefined) return;

    // Le crochet parent a posé la session ; s'il ne l'a pas fait, c'est un
    // défaut de montage et non un refus d'accès — même arbitrage que
    // `sessionDe()` dans `src/api/journal.ts`. Un `return` silencieux ici
    // laisserait passer l'écriture qu'on prétend garder.
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal:
          `route « ${requete.method} ${requete.routeOptions.url ?? requete.url} » atteinte sans ` +
          'session appliquée : le crochet onRequest du greffon parent ne s’est pas exécuté',
      });
    }

    const domaine = domaineDe(requete);
    const detenu: NiveauAcces =
      (domaine !== null ? session.droits.niveaux?.[domaine] : undefined) ?? session.droits.niveau;

    if (suffit(detenu, exige)) return;

    const refus = {
      // Le message ne nomme ni le niveau requis ni le domaine : les énumérer
      // dirait à qui n'y a pas droit ce qu'il faudrait obtenir. Il dit en
      // revanche ce qui est refusé — approuver — parce que c'est le geste que
      // l'utilisateur vient de faire, et qu'un refus qu'on ne rattache pas à
      // son geste est incompréhensible.
      message:
        'Approuver ou refuser une étape relève d’un profil de validation. Votre profil vous ' +
        'permet de préparer le dossier, pas de le trancher : demandez la décision à la ' +
        'personne qui en a la charge.',
      detailJournal:
        `niveau insuffisant pour le circuit d’approbation : « ${detenu} » sur ` +
        `${domaine ?? 'aucun domaine'}, « ${exige} » exigé (PLAN_SERVEUR §3.5)`,
    };
    requete.log.warn(
      {
        utilisateur: session.perimetre.utilisateurId,
        route: requete.routeOptions.url ?? requete.url,
        detail: refus.detailJournal,
      },
      'Accès refusé : le circuit d’approbation exige le niveau « validation »',
    );
    await tracerRefus(requete, refus.detailJournal);
    throw refuserDroit(refus);
  });
}
