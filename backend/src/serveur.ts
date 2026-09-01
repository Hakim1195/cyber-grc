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
import type { FastifyError, FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

import { greffonApi } from './api/index.js';
import { engendrerIdentifiant } from './entites/index.js';
import { chargerConfiguration, ErreurConfiguration, resumerConfiguration } from './config/index.js';
import type { Configuration } from './config/index.js';
import { creerPool, fermerPool, verifierBase } from './db/pool.js';

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
  });

  // Q-39 (seconde couche) — la valeur du client, gardée mais jamais confondue.
  //
  // Un client qui porte sa propre corrélation a une raison légitime de vouloir
  // la retrouver dans le journal. On la journalise donc, sous un nom qui dit
  // d'où elle vient, et jamais à la place de la nôtre. Elle ne repart pas dans
  // la réponse : le client sait ce qu'il a envoyé, et l'y renvoyer rendrait de
  // nouveau les deux valeurs confusables.
  //
  // Bornée à 64 signes et débarrassée de ses caractères de contrôle : la
  // mesure a montré que 2 000 signes passaient, et étaient recopiés sur chaque
  // ligne de journal de la requête — un facteur d'amplification gratuit sur un
  // disque qui doit tenir trois ans de rétention (PLAN_SERVEUR §1.7).
  serveur.addHook('onRequest', async (requete) => {
    const brut = requete.headers['x-request-id'];
    const valeur = typeof brut === 'string' ? brut : null;
    if (valeur === null || valeur === '') return;
    const propre = valeur.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64);
    if (propre === '') return;
    requete.log.info(
      { referenceClient: propre },
      'Référence de corrélation fournie par le client (elle ne remplace pas celle du serveur)',
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
  void serveur.register(greffonApi, { pool, config });

  serveur.setNotFoundHandler((requete, reponse) => {
    void reponse.code(404).send({
      erreur: 'ressource_inconnue',
      message: `Aucune ressource ne répond à ${requete.method} ${requete.url}.`,
    });
  });

  serveur.setErrorHandler((erreur: FastifyError, requete, reponse) => {
    const code = erreur.statusCode ?? 500;

    if (code >= 500) {
      requete.log.error({ erreur: erreur.message, pile: erreur.stack }, 'Erreur non traitée');
      // Le message interne ne sort jamais : il pourrait révéler une requête SQL
      // ou un chemin du serveur. La référence permet de retrouver la trace.
      void reponse.code(code).send({
        erreur: 'erreur_interne',
        message: "Le serveur n'a pas pu traiter la demande. L'incident est journalisé.",
        reference: requete.id,
      });
      return;
    }

    requete.log.warn({ erreur: erreur.message, code }, 'Requête refusée');
    void reponse.code(code).send({
      erreur: erreur.code ?? 'requete_invalide',
      message: erreur.message,
      reference: requete.id,
    });
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

  serveur.log.info(resumerConfiguration(config), 'Serveur Cyber GRC démarré');
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
