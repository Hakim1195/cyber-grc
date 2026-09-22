/**
 * `src/habilitations/` — **L'ADMINISTRATION DES DROITS, ENFIN VISIBLE.**
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`    | `/api/habilitations/etat`            | la matrice : profils × 30 domaines, groupes d'annuaire, comptes |
 * | `POST`   | `/api/habilitations/profils`         | créer un profil propre à ce déploiement |
 * | `PUT`    | `/api/habilitations/profils/:id`     | nom, description, niveau par défaut, activation |
 * | `PUT`    | `/api/habilitations/profils/:id/domaines` | poser la grille, en entier |
 * | `DELETE` | `/api/habilitations/profils/:id`     | supprimer un profil hors socle |
 * | `POST`   | `/api/habilitations/groupes`         | déclarer un groupe d'annuaire |
 * | `PUT`    | `/api/habilitations/groupes/:id`     | ce qu'il accorde — jamais son nom |
 * | `POST`   | `/api/habilitations/groupes/synchroniser` | engendrer les groupes manquants **dans la table** |
 * | `GET`    | `/api/habilitations/annuaire`        | déclaration ↔ annuaire réel : les quatre écarts |
 * | `POST`   | `/api/habilitations/simuler`         | « que verrait ce compte, et pourquoi ? » |
 *
 * ════════════════════════════════════════════════════════════════════════
 *  POURQUOI CE LOT EXISTE
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le modèle de droits à trois axes — périmètre × profil × niveau — est
 * **construit depuis le lot L1**, gardé par la RLS, éprouvé par le banc, et il
 * décide de chaque requête du produit. **Aucune route ne l'exposait.** Mesuré le
 * 22/09/2026 : zéro route touchant `profils`, `profil_domaines` ou `groupes_ad`,
 * et la section « Administration » du menu ne portait qu'Imports, Journal et
 * Paramètres.
 *
 * Conséquence, et c'est l'utilisateur qui l'a formulée : *« il n'y a aucune
 * visibilité des droits, et surtout on ne peut pas gérer les droits »*. Un outil
 * qui sert de preuve en audit ISO 27001 et qui ne sait pas montrer sa propre
 * matrice d'habilitations a un trou à l'endroit exact où l'auditeur regarde
 * (A.5.18, revue des droits d'accès).
 *
 * Ce lot ne refond donc **rien** : il rend visible et modifiable ce qui existe.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  LES QUATRE PROPRIÉTÉS À NE PAS DÉFAIRE
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. 🛑 Le produit n'écrit JAMAIS dans l'annuaire.** Arbitrage de
 * l'utilisateur du 22/09/2026, et c'est une capacité absente : `ClientLdap`
 * n'implémente aucune opération d'écriture LDAP. `POST …/groupes/synchroniser`
 * écrit dans **la table** `groupes_ad`, jamais dans l'AD — le nom de la route le
 * dit, et son commentaire aussi. Ce que le produit rend pour l'annuaire, c'est
 * une **liste à créer**, que l'administrateur exécute.
 *
 * **2. Les droits sont résolus À LA CONNEXION et figés dans la session.** Une
 * modification faite ici ne prend effet qu'à la **prochaine connexion** des
 * personnes concernées. L'écran le dit, en toutes lettres, à chaque écriture :
 * un administrateur qui croit avoir fermé un accès à l'instant est exactement la
 * fausse assurance que ce projet traque depuis dix passages de porte.
 *
 * **3. Le verrou d'administrabilité.** Aucune écriture ne peut laisser le
 * produit sans administrateur possible — voir `ecriture.ts`, qui le MESURE au
 * lieu de reconnaître deux noms.
 *
 * **4. Rien n'est recalculé.** `resoudreDroits()`, `groupesAttendus()`,
 * `DOMAINE_API_PAR_DOMAINE_BASE` : ce sont les fonctions de la connexion qui
 * répondent, pas une seconde rédaction. Un écran d'administration qui affiche un
 * droit que le produit n'applique pas est pire qu'un écran absent.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { ServiceAuthentification } from '../auth/index.js';
import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import {
  groupesAttendus,
  lireFilialesActives,
  lireProfilsActifs,
  synchroniserGroupesAd,
} from '../droits/groupes-ad.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import { journaliser } from '../auth/journal.js';

import { comparerAnnuaire, simuler } from './annuaire.js';
import type { IdentiteSimulee, LectureAnnuaire } from './annuaire.js';
import {
  creerGroupe,
  creerProfil,
  modifierGroupe,
  modifierProfil,
  mesurerAdministrabilite,
  poserGrille,
  supprimerProfil,
  verifierAdministrabilite,
} from './ecriture.js';
import { lireEtat } from './lecture.js';

export const PREFIXE = '/api/habilitations';

export interface OptionsHabilitations {
  readonly pool: Pool;
  /** Préfixe de nommage des groupes d'annuaire. Absent = annuaire non configuré. */
  readonly prefixeGroupes?: string;
  /** Sert UNIQUEMENT à LIRE l'annuaire. Absent = `AUTH_LDAP_ACTIF=non`. */
  readonly serviceAuthentification?: ServiceAuthentification;
}

/** Longueur maximale d'un login soumis à la simulation. Borne d'entrée. */
const LOGIN_MAX = 256;

export async function greffonHabilitations(
  instance: FastifyInstance,
  options: OptionsHabilitations,
): Promise<void> {
  const { pool } = options;
  const prefixeGroupes = options.prefixeGroupes ?? 'GRC-';
  const auth = options.serviceAuthentification;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route d'habilitations atteinte sans session appliquée",
      });
    }
    return session;
  };

  const identifiantDe = (requete: FastifyRequest): string => {
    const params = requete.params as { id?: unknown } | undefined;
    const id = params?.id;
    if (typeof id !== 'string' || id.trim() === '') {
      throw entreeInvalide("L'identifiant est absent de l'adresse.");
    }
    return id;
  };

  const corpsDe = (requete: FastifyRequest): Record<string, unknown> => {
    const corps = requete.body;
    if (corps === null || typeof corps !== 'object' || Array.isArray(corps)) {
      throw entreeInvalide('Le corps de la demande doit être un objet JSON.');
    }
    return corps as Record<string, unknown>;
  };

  /* ── LA LECTURE ────────────────────────────────────────────────────────
   *
   * Domaine `administration`, action `lire`. ⚠️ Et non `administrer` : lire la
   * matrice des habilitations est ce qu'un auditeur vient faire, et exiger le
   * niveau d'administration pour la LIRE obligerait à donner l'écriture à qui
   * veut seulement regarder. C'est le motif du droit d'export, distinct de la
   * lecture (`PLAN_SERVEUR` §3.3), retourné dans l'autre sens.
   * ------------------------------------------------------------------- */
  instance.get(
    `${PREFIXE}/etat`,
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const etat = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => await lireEtat(client, prefixeGroupes),
        { lectureSeule: true },
      );
      return await reponse.status(200).send(etat);
    },
  );

  /* ── LES ÉCRITURES ─────────────────────────────────────────────────────
   *
   * Les trois termes de la déclaration sont nécessaires, et c'est la plus forte
   * du produit — même forme qu'à `POST /api/filiales` :
   *   · `administrer` déclenche la trace `administration` du crochet ;
   *   · `administration` est le domaine, refusé à qui ne l'a pas ;
   *   · `administration-groupe` est le PÉRIMÈTRE, sans lequel la route s'en
   *     remettrait au 42501 de la politique RLS — c'est-à-dire à un **500**
   *     rendu pour ce qui est un refus de droit.
   * ------------------------------------------------------------------- */
  const ACCES_ECRITURE = {
    acces: {
      action: 'administrer',
      domaine: 'administration',
      perimetre: 'administration-groupe',
    },
  } as const;

  instance.post(
    `${PREFIXE}/profils`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = corpsDe(requete);
      const resultat = await avecTransaction(pool, session.perimetre, async (client) =>
        creerProfil(client, corps, session.perimetre),
      );
      return await reponse.status(201).send({ ...resultat, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  instance.put(
    `${PREFIXE}/profils/:id`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = identifiantDe(requete);
      const corps = corpsDe(requete);
      await avecTransaction(pool, session.perimetre, async (client) =>
        modifierProfil(client, id, corps, session.perimetre),
      );
      return await reponse.status(200).send({ id, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  instance.put(
    `${PREFIXE}/profils/:id/domaines`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = identifiantDe(requete);
      const corps = corpsDe(requete);
      await avecTransaction(pool, session.perimetre, async (client) =>
        poserGrille(client, id, corps['domaines'], session.perimetre),
      );
      return await reponse.status(200).send({ id, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  instance.delete(
    `${PREFIXE}/profils/:id`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = identifiantDe(requete);
      await avecTransaction(pool, session.perimetre, async (client) =>
        supprimerProfil(client, id, session.perimetre),
      );
      return await reponse.status(200).send({ id, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  instance.post(
    `${PREFIXE}/groupes`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = corpsDe(requete);
      const resultat = await avecTransaction(pool, session.perimetre, async (client) =>
        creerGroupe(client, corps, session.perimetre),
      );
      return await reponse.status(201).send({ ...resultat, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  instance.put(
    `${PREFIXE}/groupes/:id`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = identifiantDe(requete);
      const corps = corpsDe(requete);
      await avecTransaction(pool, session.perimetre, async (client) =>
        modifierGroupe(client, id, corps, session.perimetre),
      );
      return await reponse.status(200).send({ id, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/habilitations/groupes/synchroniser
   * -------------------------------------------------------------------
   *  🛑 **ÉCRIT DANS LA TABLE `groupes_ad`, PAS DANS L'ANNUAIRE.** Elle
   *  engendre la liste attendue par la convention de nommage et ajoute ce
   *  qui manque à la déclaration applicative. Les groupes correspondants
   *  doivent exister dans l'AD — `GET …/annuaire` dit lesquels manquent.
   *
   *  ⚠️ Elle **n'efface jamais** : un groupe retiré du dispositif se
   *  désactive, ce qui conserve la trace de ce qu'il accordait. Une
   *  synchronisation qui supprimerait retirerait des accès sans que
   *  personne l'ait décidé (`src/droits/groupes-ad.ts`).
   * ------------------------------------------------------------------- */
  instance.post(
    `${PREFIXE}/groupes/synchroniser`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const bilan = await avecTransaction(pool, session.perimetre, async (client) => {
        const administrabilite = await mesurerAdministrabilite(client);
        // La liste attendue est le produit cartésien des filiales actives par
        // les profils actifs — engendrée, jamais écrite à la main (§19.5).
        const attendus = groupesAttendus(
          prefixeGroupes,
          await lireFilialesActives(client),
          await lireProfilsActifs(client),
        );
        const resultat = await synchroniserGroupesAd(client, attendus);
        await journaliser(client, {
          action: 'administration',
          resume: 'Synchronisation de la déclaration des groupes d’annuaire',
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          entiteType: 'groupes_ad',
          valeursApres: {
            crees: resultat.crees.length,
            presents: resultat.presents.length,
            inattendus: resultat.inattendus.length,
          },
        });
        await verifierAdministrabilite(client, administrabilite);
        return resultat;
      });
      return await reponse.status(200).send({ ...bilan, ...RAPPEL_PROCHAINE_CONNEXION });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/habilitations/annuaire — le contrôle de cohérence
   * -------------------------------------------------------------------
   *  LECTURE SEULE, des deux côtés. Elle sort sur le réseau : c'est une
   *  action `lire` du domaine `administration`, et non `administrer` —
   *  constater un écart n'est pas le corriger.
   * ------------------------------------------------------------------- */
  instance.get(
    `${PREFIXE}/annuaire`,
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      /* ⚠️ **L'appel LDAP est fait HORS transaction, avant elle.** Tenir une
       * connexion PostgreSQL ouverte pendant un aller-retour réseau vers un
       * annuaire qui peut ne pas répondre est le moyen le plus sûr d'épuiser
       * le pool sous la première panne d'AD — et le produit deviendrait alors
       * injoignable pour tout le monde à cause d'un écran d'administration. */
      let lecture: LectureAnnuaire | undefined;
      if (auth !== undefined && auth.annuaireDisponible()) {
        lecture = await auth.listerGroupesAnnuaire();
      }

      const resultat = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => await comparerAnnuaire(client, prefixeGroupes, lecture),
        { lectureSeule: true },
      );
      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/habilitations/simuler — « que verrait ce compte ? »
   * -------------------------------------------------------------------
   *  `POST` et non `GET` : le login voyagerait sinon dans l'adresse, donc
   *  dans le journal d'accès d'Apache et dans l'historique du navigateur.
   *  C'est un identifiant de personne (§29.8), et il n'a rien à y faire.
   * ------------------------------------------------------------------- */
  instance.post(
    `${PREFIXE}/simuler`,
    { config: ACCES_ECRITURE },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = corpsDe(requete);
      const brut = corps['identifiant'];
      if (typeof brut !== 'string' || brut.trim() === '') {
        throw entreeInvalide('Indiquez le login du compte à simuler.');
      }
      const login = brut.trim();
      if (login.length > LOGIN_MAX) {
        throw entreeInvalide(`Un login ne dépasse pas ${LOGIN_MAX} caractères.`);
      }

      if (auth === undefined || !auth.annuaireDisponible()) {
        throw new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message:
            'L’annuaire n’est pas configuré sur ce déploiement (`AUTH_LDAP_ACTIF=non`) : la ' +
            'simulation lit les groupes d’une personne dans l’annuaire, et il n’y a rien à ' +
            'lire.',
        });
      }

      // Hors transaction — même motif qu'à la route de cohérence.
      const identite = await auth.relireIdentite(login);

      const simulee: IdentiteSimulee | null =
        identite === null || identite === undefined
          ? null
          : {
              login: identite.login,
              nomAffichage: identite.nomAffichage,
              email: identite.email,
              service: identite.service,
              fonction: identite.fonction,
              desactive: identite.desactive,
              groupes: identite.groupes,
            };

      const resultat = await avecTransaction(pool, session.perimetre, async (client) =>
        simuler(client, login, simulee, session.perimetre),
      );
      return await reponse.status(200).send(resultat);
    },
  );
}

/**
 * Ce que toute écriture rappelle, et que l'écran affiche mot pour mot.
 *
 * ⚠️ **Sans ce rappel, l'écran ment par omission.** Les droits sont résolus à la
 * connexion et figés dans la session (`sessions`, `session_domaines`) : retirer
 * un domaine à un profil ne retire rien à qui est déjà connecté. Un
 * administrateur qui ferme un accès en urgence doit savoir que la fermeture
 * n'est pas immédiate — et quoi faire pour qu'elle le soit.
 */
const RAPPEL_PROCHAINE_CONNEXION = Object.freeze({
  effetDifferé: true,
  rappel:
    'Les droits sont résolus à la connexion et figés dans la session : cette modification ' +
    'ne s’appliquera aux personnes concernées qu’à leur PROCHAINE connexion. Pour un effet ' +
    'immédiat, révoquez leurs sessions.',
});
