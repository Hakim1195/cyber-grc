/**
 * Serveur applicatif Cyber GRC — point d'entrée.
 *
 * Lot L0 : le socle démarre, répond sur `/api/sante` et s'arrête proprement.
 * Les entités métier, l'authentification et le journal d'audit arrivent avec
 * les lots L1 à L5 ; ce fichier fixe ce dont ils dépendront tous — chargement
 * de la configuration, pool PostgreSQL, journalisation structurée, cycle de vie.
 *
 * ── Pourquoi Fastify plutôt qu'Express ───────────────────────────────────
 *
 *  · **Validation de schéma intégrée** (JSON Schema, compilée). L'audit interne
 *    reproche à l'import actuel de « ne valider ni le schéma ni les types » ;
 *    le moteur d'import généralisé du lot L7 et les écritures ciblées du lot L2
 *    valideront au bord, sans dépendance supplémentaire.
 *  · **Journalisation structurée native** (pino, JSON sur la sortie standard →
 *    journald). Le journal d'audit inaltérable du lot L5 est en base, mais le
 *    journal technique doit être corrélable : un identifiant de requête est
 *    attribué à chaque appel et suit toute la chaîne.
 *  · **Arrêt propre intégré** : `close()` attend les requêtes en cours. Avec un
 *    verrouillage optimiste et des transactions composites (§1.4), couper une
 *    écriture en vol au redémarrage n'est pas acceptable.
 *  · **Types TypeScript de première main**, sans paquet `@types` séparé.
 *  · Surface de dépendances réduite : ce qu'Express obtient par cinq
 *    intergiciels tiers est ici dans le cœur — un argument qui compte pour un
 *    produit à maintenir trois ans sur une machine hors ligne.
 */

import { argv, exit, stderr } from 'node:process';
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';

import { greffonApi } from './api/index.js';
import { ServiceAuthentification } from './auth/index.js';
import { journaliser } from './auth/journal.js';
import { engendrerIdentifiant } from './entites/index.js';
import { chargerConfiguration, ErreurConfiguration, resumerConfiguration } from './config/index.js';
import { traduireErreur } from './erreurs/index.js';
import type { Configuration } from './config/index.js';
import { avecTransaction, creerPool, fermerPool, PERIMETRE_SYSTEME, verifierBase } from './db/pool.js';

const DEMARRE_LE = Date.now();

/* =====================================================================
 *  Construction du serveur
 * ===================================================================== */

export function construireServeur(config: Configuration, pool: Pool): FastifyInstance {
  const serveur = Fastify({
    logger: {
      level: config.serveur.niveauJournal,
      // Horodatage ISO 8601 : lisible tel quel dans journald, et comparable
      // avec l'horodatage du journal d'audit en base (source NTP commune, §1.7).
      timestamp: () => `,"heure":"${new Date().toISOString()}"`,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[masqué]',
      },
    },
    // Apache est le seul point d'entrée : l'adresse réelle du client est lue
    // dans X-Forwarded-For, mais uniquement si elle vient du frontal déclaré.
    // Elle sera tracée dans le journal des connexions réussies et échouées (§1.7).
    trustProxy: config.serveur.proxyDeConfiance,
    bodyLimit: config.serveur.tailleMaxCorpsOctets,

    /* ══ DEUX DÉLAIS QUI N'EXISTAIENT PAS — constat Q-214 a (porte S8) ══════
     *
     * Fastify n'en pose **aucun** par défaut. Le seul délai du produit était
     * `ProxyTimeout 60` d'Apache — or ce fichier défend explicitement ailleurs
     * le chemin « sans passer par Apache » (recette, laboratoire, boucle
     * locale), et sur ce chemin un client lent tenait une connexion **sans
     * borne**. Un garde-fou qui vit dans le frontal ne protège pas ce qui ne
     * passe pas par le frontal.
     *
     * `connectionTimeout` borne l'établissement et l'inactivité de la prise ;
     * `requestTimeout` borne le temps d'arrivée d'une requête complète — c'est
     * lui qui coupe l'envoi goutte-à-goutte d'un corps de douze mégaoctets.
     *
     * Les valeurs sont plus LARGES que le `ProxyTimeout 60` d'Apache, et c'est
     * délibéré : derrière le frontal, c'est Apache qui doit trancher le premier
     * — sans quoi le serveur couperait une requête qu'Apache croit encore en
     * cours, et l'appelant recevrait un 502 au lieu du 504 qui dit la vérité.
     * Ces deux bornes ne servent donc que le chemin direct. */
    connectionTimeout: 120_000,
    requestTimeout: 90_000,
    // ══ Q-39 : LA RÉFÉRENCE D'UN INCIDENT NE SE CHOISIT PAS ═════════════
    //
    // `requestIdHeader` valait « x-request-id ». Fastify lisait donc cet
    // en-tête DE LA REQUÊTE et en faisait `requete.id` ; `genReqId` n'était
    // appelé qu'à défaut. Mesuré contre le serveur qui écoute :
    //
    //   sans en-tête          → reference = "e4282df0-f896-…"   (du serveur)
    //   en-tête imposé        → reference = "REFERENCE-CHOISIE-PAR-LE-CLIENT"
    //   deux requêtes, même en-tête → deux fois la même référence
    //   2 000 signes          → repris tels quels, sur CHAQUE ligne de journal
    //
    // Or cette valeur est double : c'est ce que l'API rend au client sous le
    // nom « reference » dans toute réponse d'erreur, ET la clé `reqId` que
    // pino pose sur les six lignes de journal d'une requête. La personne
    // tracée choisissait donc la clé sous laquelle un exploitant la retrouve —
    // elle pouvait la répéter, la faire entrer en collision, ou noyer une
    // référence sous mille requêtes homonymes. Rien ne fuyait, rien ne
    // s'injectait (pino encode en JSON, et j'ai vérifié qu'aucune structure ne
    // se casse) : ce qui était perdu, c'est la traçabilité elle-même.
    //
    // ── Ce que l'en-tête servait à faire : RIEN ──────────────────────────
    //
    // `requestIdHeader` existe pour hériter la corrélation d'un frontal ou
    // d'une chaîne de traçage. Ici, aucun producteur : le vhost livré ne pose
    // pas cet en-tête (il pose `X-Forwarded-Proto`, et rien d'autre), le
    // frontend ne l'envoie pas, le banc ne s'en sert pas. Avant ce correctif,
    // `src/serveur.ts` était **le seul fichier du dépôt à le mentionner**.
    // C'était donc une surface d'attaque sans usage.
    //
    // ── Le remède, en deux couches ───────────────────────────────────────
    //
    // 1. Le serveur engendre TOUJOURS la référence, et ne lit plus l'en-tête
    //    pour la fabriquer. `engendrerIdentifiant` est le générateur unique du
    //    serveur (CONVENTIONS.md §2) : 128 bits, gardé au démarrage. Le
    //    préfixe « REQ- » a un second effet, utile à qui lit un journal — une
    //    référence qui ne commence pas par « REQ- » n'a pas été engendrée ici.
    // 2. Ce que le client a envoyé n'est pas jeté pour autant : il est
    //    conservé À PART, sous un autre nom, et clairement comme sa valeur à
    //    lui (voir le crochet `onRequest` plus bas).
    //
    // La troisième piste — effacer l'en-tête au frontal — vaut d'être prise
    // AUSSI, et elle est signalée à l'agent de déploiement : le vhost efface
    // déjà `X-Forwarded-For` et cinq autres, pour la raison exactement
    // symétrique qu'il énonce lui-même. Mais elle ne pouvait pas être le seul
    // remède : elle ne protège ni la recette, ni un service interrogé sans
    // passer par Apache — et ce chantier a payé assez cher les barrières
    // uniques.
    genReqId: () => engendrerIdentifiant('REQ'),
    requestIdHeader: false,
    // ── Q-55, second membre de la famille ────────────────────────────────
    //
    // Certaines erreurs du cadre sont levées AVANT le routage, donc avant que
    // `setErrorHandler` puisse les voir : une URL au pourcentage invalide en
    // est une. Sans ce point d'entrée, Fastify répondait avec son sérialiseur
    // par défaut, et cela sortait tel quel :
    //
    //   GET /api/%zz → {"error":"Bad Request","code":"FST_ERR_BAD_URL",
    //                   "message":"'/api/%zz' is not a valid url component",
    //                   "statusCode":400}
    //
    // Apache l'absorbe (il rend son propre 400), si bien que le cas ne se voit
    // pas derrière le frontal livré. Ce n'est pas une raison de le laisser :
    // la recette et un service interrogé directement ne sont pas protégés, et
    // ce chantier a payé plusieurs fois le prix des barrières uniques.
    //
    // On passe par LA normalisation, comme le reste — pas par une troisième.
    frameworkErrors: (erreur, requete, reponse) => {
      const traduite = traduireErreur(erreur);
      requete.log.warn(
        { erreur: traduite.code, detail: traduite.detailJournal, reference: requete.id },
        'Requête refusée avant routage',
      );
      // Le `reply` de ce point d'entrée porte des génériques plus étroits que
      // ceux d'une route : il ne connaît aucun schéma de réponse. Le passage
      // par `FastifyReply` dit cela, et rien de plus.
      void (reponse as FastifyReply)
        .code(traduite.statut)
        .send({ ...traduite.corps(), reference: requete.id });
    },
  });

  // ══ Q-39 (seconde couche) — CE CROCHET A CHANGÉ DE MÉTIER ═══════════════
  //
  // Il a été écrit pour rendre service : garder la corrélation d'un client qui
  // porte la sienne, à part de la nôtre, plutôt que de la jeter. Cet usage est
  // mort, et il faut le dire au lieu de laisser le code le suggérer — le vhost
  // livré efface désormais `X-Request-Id`, si bien que derrière Apache ce
  // crochet **ne se déclenche jamais**. Observé, avec un serveur d'écho à la
  // place du service et les lignes `RequestHeader` extraites du fichier livré :
  //
  //   à travers Apache : x-request-id présent ? false
  //   en direct        : x-request-id présent ? true  (valeur du client intacte)
  //
  // ── Ce qu'il est devenu, et pourquoi il reste ────────────────────────────
  //
  // Un TÉMOIN. Puisque le frontal efface cet en-tête et que personne ne le
  // produit — ni le frontend, ni le vhost, ni le banc —, sa présence à
  // l'arrivée signifie exactement l'une de deux choses, et les deux méritent
  // d'être vues :
  //
  //  1. quelque chose parle au service **sans passer par Apache** — donc hors
  //     TLS, hors en-têtes de sécurité, et demain hors authentification ;
  //  2. le nettoyage du vhost **ne fait pas ce qu'il dit**.
  //
  // Le second n'est pas une hypothèse. `RequestHeader unset` prend un nom
  // LITTÉRAL ; un motif générique est accepté par `apachectl configtest`, qui
  // rend « Syntax OK », et n'efface rien. Mesuré ici, les noms littéraux
  // remplacés par « unset X-* » :
  //
  //   configtest      : Syntax OK
  //   x-request-id    : traverse, valeur du client conservée
  //   x-forwarded-for : « 10.0.0.1, 127.0.0.1 » — l'adresse FORGÉE en tête,
  //                     c'est-à-dire le défaut même que ce bloc du vhost
  //                     existe pour empêcher
  //
  // Une protection au frontal peut donc être silencieusement vide, et l'outil
  // qui vérifie la configuration la bénit. Ce crochet est la seule chose du
  // produit qui s'en apercevrait. C'est ce qui a emporté l'arbitrage : le
  // retirer aurait été défendable — un chemin que le déploiement rend
  // inatteignable est un chemin que personne n'éprouve —, mais on aurait retiré
  // le témoin en gardant la barrière faillible.
  //
  // ⚠️ Ce qu'il n'est PAS, et il faut le dire aussi net : ni une barrière — la
  // vraie tient une ligne plus haut, `requestIdHeader: false`, et elle tient
  // seule —, ni une alerte : rien ne lit ce journal aujourd'hui. C'est une
  // ligne qu'un exploitant trouvera s'il cherche, et que le journal d'audit du
  // lot L5 pourra reprendre. Le niveau est donc `warn` et non `info` :
  // derrière un déploiement correct il ne sort pas, et quand il sort, c'est
  // qu'une chose supposée impossible s'est produite.
  //
  // ⚠️ ET SI UNE CHAÎNE DE CORRÉLATION ARRIVE UN JOUR — le vhost le dit déjà,
  // et il faut que les deux fichiers le disent : **retirer la ligne
  // « RequestHeader unset X-Request-Id » du vhost et ajouter un producteur de
  // cet en-tête vont ensemble, jamais l'un sans l'autre.** Retirer la ligne
  // seule rouvre Q-39 sur ce témoin, qui deviendrait bavard sans rien dire ;
  // ajouter un producteur seul donne un en-tête qu'Apache efface, donc une
  // corrélation qui n'arrive jamais. Ce jour-là, ce crochet redevient ce pour
  // quoi il avait été écrit, et son niveau doit redescendre à `info`.
  //
  // La valeur reste bornée à 64 signes et débarrassée de ses caractères de
  // contrôle : la mesure a montré que 2 000 signes passaient et se recopiaient
  // sur chaque ligne de journal — inutile sur un disque qui doit tenir trois
  // ans de rétention (PLAN_SERVEUR §1.7), et d'autant moins souhaitable que
  // cette valeur est, par construction, choisie par qui ne devrait pas être là.
  serveur.addHook('onRequest', async (requete) => {
    const brut = requete.headers['x-request-id'];
    const valeur = typeof brut === 'string' ? brut : null;
    if (valeur === null || valeur === '') return;
    const propre = valeur.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64);
    if (propre === '') return;
    requete.log.warn(
      { referenceClient: propre },
      'En-tête « x-request-id » reçu du client : le frontal devrait l’effacer et personne ne le ' +
        'produit. Cette requête n’est pas passée par Apache, ou le nettoyage du vhost est ' +
        'inopérant. ' +
        'La référence servie reste celle du serveur.',
    );
  });

  // Défense en profondeur : les en-têtes de sécurité sont posés par Apache
  // (§1.9), mais l'API les porte aussi. Si le service devait un jour être
  // interrogé sans passer par le frontal, ces réponses resteraient sûres.
  serveur.addHook('onSend', async (_requete, reponse) => {
    reponse.header('x-content-type-options', 'nosniff');
    // Aucune réponse de l'API n'est mise en cache : elles portent toutes des
    // données de gouvernance, cloisonnées par filiale et par droits.
    reponse.header('cache-control', 'no-store');
  });

  /**
   * Sonde de disponibilité.
   *
   * Volontairement avare : statut, version, état de la base. Rien qui renseigne
   * un attaquant sur la topologie interne. Le détail de l'erreur part au
   * journal, pas dans la réponse.
   *
   * `logLevel: 'warn'` évite de noyer le journal sous les appels de supervision.
   */
  serveur.get('/api/sante', { logLevel: 'warn' }, async (_requete, reponse) => {
    const base = await verifierBase(pool);

    if (!base.ok) {
      serveur.log.error(
        { base: base.message, latence_ms: base.latenceMs },
        'Sonde de santé : base de données injoignable',
      );
    }

    return reponse.code(base.ok ? 200 : 503).send({
      statut: base.ok ? 'ok' : 'degrade',
      application: 'cyber-grc',
      version: config.version,
      environnement: config.environnement,
      heure: new Date().toISOString(),
      duree_fonctionnement_s: Math.round((Date.now() - DEMARRE_LE) / 1000),
      base: { ok: base.ok, latence_ms: base.latenceMs },
    });
  });

  /**
   * API du lot L2 — chargement initial, écritures ciblées, sondage.
   *
   * Enregistrée comme greffon, donc **encapsulée** : son propre traitement
   * d'erreurs (qui garantit qu'aucun message de PostgreSQL ne sort, contrôle
   * S12) s'applique à ses routes, et à elles seules. La sonde de santé
   * ci-dessus reste servie par le traitement générique.
   *
   * Le greffon découvre le catalogue PostgreSQL au démarrage et **refuse de
   * démarrer** si son registre d'entités ne correspond plus au schéma
   * (`ErreurRegistre`) : c'est le contrôle S16 — un garde-fou que rien
   * n'appelle est un commentaire.
   */
  /**
   * Lot L3 — le câblage qui rend l'authentification vivante.
   *
   * ⚠️ **Ce fichier n'appartenait à aucun rôle**, et ce câblage manquait : les
   * couches d'A1 (`src/auth/`) et d'A2 (`src/api/`) étaient écrites, éprouvées
   * et **reliées par personne**. Sans ces trois lignes, il n'y a ni route de
   * connexion ni authentification réelle — **et le banc reste vert**, chaque
   * moitié étant verte de son côté. C'est la forme exacte du défaut que ce
   * chantier traque : un défaut qui vit ENTRE deux fichiers dont aucun n'a
   * tort seul (porte S2, 5ᵉ passage).
   *
   * Le service **est** l'`Authentificateur` et fait monter `POST` et
   * `DELETE /api/connexion` : il se passe seul, sans `authentificateur` en plus
   * (`CONVENTIONS.md` §26.2).
   *
   * **Quand le service réel prend la place du provisoire** : dès qu'il existe
   * UN MOYEN DE S'AUTHENTIFIER — l'annuaire, ou le compte de secours. Sinon on
   * retombe sur la session provisoire, ce qui n'est pas un repli silencieux :
   * elle **refuse de résoudre hors du développement** et rend 503 sur toutes
   * les routes de données, recette comprise (`src/api/session.ts`).
   *
   * ⚠️ **Cette condition ne portait que sur l'annuaire, et la phrase qui le
   * justifiait était fausse** — constat Q-72, mesuré le 03/09/2026 sur une
   * installation réelle en `NODE_ENV=production`. Elle disait : « en production
   * les variables `LDAP_*` sont exigées au démarrage, le service réel y est
   * donc toujours celui-ci ». Or `AUTH_LDAP_ACTIF=non` est un chemin SOUTENU :
   * `deploy/install.sh` l'accepte en production et annonce lui-même « seul le
   * compte de secours pourra ouvrir une session », et `src/config/index.ts`
   * n'exige les `LDAP_*` que si l'annuaire est actif. Mesuré dans cette
   * configuration, empreinte de secours valide renseignée :
   *
   *     POST /api/connexion  ->  404 « Aucune ressource ne répond »
   *     GET  /api/session    ->  503 « L'authentification n'est pas encore installée »
   *
   * Autrement dit le compte de secours était inutilisable **dans la situation
   * exacte pour laquelle il existe**, et le produit ne pouvait être ouvert par
   * personne. `ServiceAuthentification` savait déjà tenir sans annuaire —
   * `src/auth/index.ts` met `annuaire` à `null`, annonce « compte de secours »
   * parmi ses moyens et porte un refus dédié à `AUTH_LDAP_ACTIF = non`. Rien
   * ne manquait que cette garde-ci, qui refusait de le construire.
   *
   * C'est, une fois de plus, un défaut vivant ENTRE deux fichiers dont aucun
   * n'a tort seul — et une **justification** devenue fausse que personne n'a
   * relue quand la configuration qu'elle décrivait a cessé d'être la seule.
   */
  const authentification =
    (config.auth.ldapActif && config.auth.ldap !== null) ||
    config.auth.compteSecours !== null
      ? new ServiceAuthentification(pool, config, serveur.log)
      : undefined;

  if (authentification === undefined) {
    serveur.log.warn(
      { environnement: config.environnement },
      "Aucun moyen d'authentification configuré — ni annuaire, ni compte de " +
        "secours : l'authentification réelle n'est pas montée. La session " +
        'provisoire prend le relais et REFUSE de servir des données hors ' +
        'développement (503).',
    );
  }

  void serveur.register(greffonApi, {
    pool,
    config,
    serviceAuthentification: authentification,
  });

  serveur.setNotFoundHandler((requete, reponse) => {
    // Q-55 (second constat, trouvé en mesurant le périmètre) — cette réponse
    // ne portait AUCUNE référence d'incident. Q-39 avait fermé le fait que la
    // référence soit choisie par le client ; il restait qu'elle était
    // simplement ABSENTE sur les chemins qui ne passent pas par le greffon —
    // « route inconnue », « méthode non prévue », « segment très long ». Un
    // utilisateur qui appelle le support depuis l'un de ces cas n'avait rien à
    // donner.
    //
    // L'URL est bornée : elle est réfléchie dans la réponse, et elle vient de
    // l'appelant. Mesuré avant de la borner — une requête de 4 005 signes
    // rendait 4 083 signes. L'amplification est faible et le corps est du JSON
    // (donc pas de balisage exécutable), mais renvoyer sans limite ce qu'on
    // reçoit n'a aucune contrepartie : au-delà, l'URL n'apprend plus rien à
    // qui lit le message.
    const cible = `${requete.method} ${requete.url}`;
    const lisible = cible.length > 120 ? `${cible.slice(0, 120)}…` : cible;
    void reponse.code(404).send({
      erreur: 'ressource_inconnue',
      message: `Aucune ressource ne répond à ${lisible}.`,
      reference: requete.id,
    });
  });

  // ══ Q-55 — CONTRÔLE S12 : LES ERREURS NE RENSEIGNENT PAS L'ATTAQUANT ══
  //
  // Ce gestionnaire avait deux branches, et la seconde renvoyait `erreur.code`
  // et `erreur.message` TELS QUELS. Pour une erreur du cadre — c'est-à-dire
  // levée par Fastify avant d'atteindre une route —, cela sortait sa
  // nomenclature interne. Mesuré derrière un Apache réel, en production, sans
  // authentification :
  //
  //   POST /api/inconnue   {"a":     → {"erreur":"FST_ERR_CTP_INVALID_JSON_BODY",
  //                                     "message":"Body is not valid JSON but
  //                                      content-type is set to 'application/json'"}
  //   POST /api/inconnue   (vide)    → {"erreur":"FST_ERR_CTP_EMPTY_JSON_BODY", …}
  //
  // Le second n'était pas au constat : il est sorti d'avoir mesuré la famille
  // entière avant d'en boucher un membre. C'est la raison pour laquelle le
  // remède ci-dessous ne vise aucun message en particulier.
  //
  // ── Pourquoi le greffon, lui, ne bavardait pas ───────────────────────────
  //
  // Parce qu'il normalise : son gestionnaire passe par `traduireErreur`, qui
  // range déjà les 4xx du cadre dans un message neutre (branche m-1) et met le
  // texte d'origine au `detailJournal` — donc au journal, jamais à la réponse.
  // La même requête sur une route DU GREFFON ne fuyait rien ; sur une route
  // qu'il ne possède pas, elle tombait ici. Le défaut n'était donc pas un
  // message oublié, c'était **une seconde normalisation**, plus pauvre, écrite
  // à côté de la première.
  //
  // ── Le remède est donc d'en retirer une, pas d'en ajouter une ────────────
  //
  // Ce gestionnaire délègue à `traduireErreur`, la même fonction que le
  // greffon. Il ne décide plus ni du code, ni du statut, ni du message : il
  // journalise et il répond. Deux normalisations qui se ressemblent finissent
  // par diverger — ce chantier en a dix démonstrations écrites, et celle-ci en
  // est la onzième.
  serveur.setErrorHandler((erreur: FastifyError, requete, reponse) => {
    const traduite = traduireErreur(erreur);

    // Le détail d'origine ne sort pas, mais il ne se perd pas non plus :
    // `detailJournal` porte le texte du cadre, et c'est ce qu'un exploitant
    // relie à la réponse par la référence.
    const trace = { erreur: traduite.code, detail: traduite.detailJournal, reference: requete.id };
    if (traduite.statut >= 500) {
      requete.log.error({ ...trace, pile: erreur.stack }, 'Erreur non traitée');
    } else {
      requete.log.warn(trace, 'Requête refusée');
    }

    void reponse.code(traduite.statut).send({ ...traduite.corps(), reference: requete.id });
  });

  return serveur;
}

/* =====================================================================
 *  Démarrage
 * ===================================================================== */

export async function demarrer(): Promise<void> {
  let config: Configuration;
  try {
    config = chargerConfiguration();
  } catch (erreur) {
    signalerConfigurationInvalide(erreur);
    exit(1);
  }

  const pool = creerPool(config.base);
  const serveur = construireServeur(config, pool);

  for (const avertissement of config.avertissements) {
    serveur.log.warn({ configuration: true }, avertissement);
  }

  // La base est vérifiée au démarrage, mais son indisponibilité n'empêche pas
  // le service de se lancer : un redémarrage de PostgreSQL provoquerait sinon
  // une boucle de redémarrages, moins diagnosticable qu'un service en marche
  // qui répond 503 sur `/api/sante`.
  const etatBase = await verifierBase(pool);
  if (etatBase.ok) {
    serveur.log.info({ latence_ms: etatBase.latenceMs }, 'Base de données joignable');
  } else {
    serveur.log.error(
      { erreur: etatBase.message },
      'Base de données injoignable au démarrage ; le service démarre en mode dégradé',
    );
  }

  installerArretPropre(serveur, pool, config);

  try {
    await serveur.listen({ host: config.serveur.hote, port: config.serveur.port });
  } catch (erreur) {
    serveur.log.fatal({ erreur: (erreur as Error).message }, "Échec de l'ouverture du port d'écoute");
    await fermerPool(pool).catch(() => undefined);
    exit(1);
  }

  await tracerCycleDeVie(serveur, pool, config, 'demarrage');
  serveur.log.info(resumerConfiguration(config), 'Serveur Cyber GRC démarré');
}

/* =====================================================================
 *  Journal d'audit — démarrage et arrêt du service
 * ===================================================================== */

/**
 * Écrit au journal d'audit le démarrage ou l'arrêt du service.
 *
 * ── Pourquoi ces deux entrées existent ───────────────────────────────────
 *
 * `CONVENTIONS.md` §29.2 : « `demarrage`, `arret` — `src/serveur.ts` : **le
 * journal doit pouvoir montrer un trou de service** ». Sans elles, une période
 * sans aucune entrée est indiscernable de deux choses très différentes : une
 * nuit sans utilisateur, ou un service arrêté pendant qu'on touchait à la base.
 * Un auditeur qui lit le journal trois ans plus tard n'a aucun autre moyen de
 * faire la différence — `journalctl` est purgé bien avant.
 *
 * ── Trois propriétés ────────────────────────────────────────────────────
 *
 *  · **Périmètre système, `filiale_id` nul.** L'événement est transversal : il
 *    n'appartient à aucune filiale, et la politique d'ajout l'admet
 *    explicitement (`004_rls.sql` §6). `utilisateur_id` sera nul lui aussi —
 *    c'est le cas « traitement système » que le déclencheur de chaînage
 *    documente, pas un défaut.
 *  · **Elle n'empêche jamais le service de démarrer ni de s'arrêter.** La base
 *    peut être injoignable : le §  « mode dégradé » de `demarrer()` existe
 *    précisément pour cela, et un service qui refuserait de démarrer parce que
 *    son journal est indisponible transformerait un incident de base en
 *    indisponibilité totale. L'échec part au journal technique en `error`.
 *  · **`resume` est une phrase fixe** (§29.5), et le peu de contexte utile part
 *    en `jsonb` — sans aucun secret de configuration (§29.6) : ni identifiants
 *    de base, ni URL d'annuaire, ni chemins. L'environnement, la version et le
 *    port suffisent à situer un trou de service.
 */
async function tracerCycleDeVie(
  serveur: FastifyInstance,
  pool: Pool,
  config: Configuration,
  quoi: 'demarrage' | 'arret',
  motif: string | null = null,
): Promise<void> {
  try {
    await avecTransaction(pool, PERIMETRE_SYSTEME, async (client) => {
      await journaliser(client, {
        action: quoi,
        // Transversal : aucune filiale ne le porte (§29.7, troisième cas).
        filialeId: null,
        utilisateurLibelle: 'systeme',
        resume:
          quoi === 'demarrage'
            ? 'Démarrage du service applicatif.'
            : 'Arrêt du service applicatif.',
        valeursApres: {
          environnement: config.environnement,
          version: config.version,
          ecoute: `${config.serveur.hote}:${String(config.serveur.port)}`,
          ...(motif === null ? {} : { motif }),
          ...(quoi === 'arret' ? { duree_service_s: Math.round((Date.now() - DEMARRE_LE) / 1000) } : {}),
        },
      });
    });
  } catch (erreur) {
    serveur.log.error(
      { erreur: erreur instanceof Error ? erreur.message : String(erreur), evenement: quoi },
      'Écriture au journal d’audit impossible : le cycle de vie du service n’a PAS été tracé. ' +
        'Le journal montrera un trou de service sans en donner la cause.',
    );
  }
}

/**
 * Message d'échec de configuration : lisible par un exploitant, en français,
 * avec la liste complète des corrections à apporter. Il part sur la sortie
 * d'erreur (donc dans `journalctl`) avant même que le journal ne soit ouvert.
 */
function signalerConfigurationInvalide(erreur: unknown): void {
  const lignes: string[] = [
    '',
    '  ┌─────────────────────────────────────────────────────────────┐',
    '  │  Cyber GRC — démarrage refusé : configuration invalide       │',
    '  └─────────────────────────────────────────────────────────────┘',
    '',
  ];

  if (erreur instanceof ErreurConfiguration) {
    for (const probleme of erreur.problemes) lignes.push(`  · ${probleme}`);
  } else {
    lignes.push(`  · ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }

  lignes.push(
    '',
    '  Fichier attendu : /etc/cyber-grc/env  (modèle : backend/.env.example)',
    '  Après correction : systemctl restart cyber-grc',
    '',
  );

  stderr.write(`${lignes.join('\n')}\n`);
}

/* =====================================================================
 *  Arrêt propre
 * ===================================================================== */

function installerArretPropre(serveur: FastifyInstance, pool: Pool, config: Configuration): void {
  let arretEnCours = false;

  const arreter = async (motif: string, codeSortie: number): Promise<void> => {
    if (arretEnCours) return;
    arretEnCours = true;

    serveur.log.info({ motif }, 'Arrêt demandé : fin des requêtes en cours');

    // Filet : si une requête ne rend jamais la main, systemd finirait par
    // envoyer SIGKILL. Mieux vaut trancher nous-mêmes, en le journalisant, un
    // peu avant l'échéance de TimeoutStopSec.
    const filet = setTimeout(() => {
      serveur.log.fatal(
        { delai_ms: config.serveur.delaiArretMs },
        "Arrêt propre impossible dans le délai imparti : sortie forcée",
      );
      exit(1);
    }, config.serveur.delaiArretMs);

    try {
      await serveur.close();
      // Après `close()` — les requêtes en cours sont finies, leurs propres
      // entrées sont donc déjà dans la chaîne — et AVANT `fermerPool`, qui
      // ferme la seule voie par laquelle cette entrée peut s'écrire. L'ordre
      // est ce qui fait de `arret` le dernier maillon du segment.
      await tracerCycleDeVie(serveur, pool, config, 'arret', motif);
      await fermerPool(pool);
      clearTimeout(filet);
      serveur.log.info({ motif }, 'Arrêt propre terminé');
      exit(codeSortie);
    } catch (erreur) {
      clearTimeout(filet);
      serveur.log.error({ erreur: (erreur as Error).message }, "Erreur pendant l'arrêt");
      exit(1);
    }
  };

  // SIGTERM : arrêt et redémarrage par systemd (mise à jour, `systemctl stop`).
  process.on('SIGTERM', () => void arreter('SIGTERM', 0));
  // SIGINT : Ctrl-C en développement.
  process.on('SIGINT', () => void arreter('SIGINT', 0));

  // Un défaut de programmation ne doit pas laisser le service dans un état
  // indéterminé : on journalise, on ferme, systemd redémarre (Restart=on-failure).
  process.on('uncaughtException', (erreur) => {
    serveur.log.fatal({ erreur: erreur.message, pile: erreur.stack }, 'Exception non interceptée');
    void arreter('exception', 1);
  });
  process.on('unhandledRejection', (raison) => {
    serveur.log.fatal(
      { erreur: raison instanceof Error ? raison.message : String(raison) },
      'Promesse rejetée sans traitement',
    );
    void arreter('rejet', 1);
  });
}

/* =====================================================================
 *  Exécution directe
 * ===================================================================== */

// Le module ne démarre rien s'il est importé (tests, outils d'exploitation) :
// seul un lancement direct (`node dist/serveur.js`) ouvre le port.
const lanceDirectement =
  argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;

if (lanceDirectement) {
  await demarrer();
}
