/**
 * `ServiceAuthentification` — l'authentification Active Directory du lot **L3**,
 * telle que le point d'entrée la consomme.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les deux questions, et pourquoi elles restent séparées
 * ════════════════════════════════════════════════════════════════════════
 *
 *     ResolveurPerimetre  →  « quel est le périmètre de la session ? »   sans argument
 *     Authentificateur    →  « cette requête-ci porte-t-elle une session ? »
 *
 * Cette classe implémente la seconde et **fabrique** la première : elle lit le
 * cookie, retrouve la session en base, et construit un `ResolveurPerimetreSession`
 * dont `resoudre()` ne prend, lui, aucun argument. Le cookie n'atteint donc jamais
 * `grc.filiales` : il sert à retrouver une ligne, dont toutes les valeurs ont été
 * écrites par la transaction d'ouverture depuis les groupes AD.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Une asymétrie assumée : fermé à l'entrée, ouvert à la revérification
 * ════════════════════════════════════════════════════════════════════════
 *
 * **Ouvrir** une session exige que l'annuaire réponde : s'il ne répond pas, le
 * service rend 503 et personne n'entre. C'est le comportement D5 du contrat de
 * doublure, et c'est la bonne façon d'échouer.
 *
 * **Revérifier** une session déjà ouverte ne peut pas obéir à la même règle. Le
 * `PLAN_SERVEUR` §1.5 impose de couper l'accès dès que l'AD désactive un compte,
 * ce qui suppose de relire l'annuaire pendant la vie de la session ; mais faire
 * dépendre les sessions **en cours** de la disponibilité de l'annuaire
 * transformerait le redémarrage d'un contrôleur de domaine en déconnexion
 * générale des vingt filiales. La revérification est donc **périodique** et
 * **tolérante à la panne** : un annuaire injoignable laisse la session vivre —
 * bornée, de toute façon, par son échéance absolue (`SESSION_DUREE_MAXIMALE`,
 * douze heures par défaut). L'écart est journalisé, pas tu.
 *
 * Dit en une phrase : on refuse d'ouvrir ce qu'on ne peut pas vérifier, on ne
 * ferme pas ce qu'on a déjà vérifié parce qu'un tiers est tombé.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que le refus ne dit pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Contrôle **S12**. Compte inconnu, mot de passe faux, compte verrouillé, compte
 * désactivé : **un seul message**, et le même. Distinguer dirait à un attaquant
 * quels logins existent, et lesquels sont déjà verrouillés. Le détail va au
 * journal technique, qui ne sort pas de la machine.
 */

import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { Authentificateur, SessionAppliquee } from '../api/session.js';
import type { Configuration } from '../config/index.js';
import { PERIMETRE_SYSTEME, avecTransaction } from '../db/pool.js';
import type { JournalMinimal, PerimetreSession } from '../db/pool.js';
import { projeterDroits } from '../droits/passerelle-api.js';
import { ouvreUnAcces, resoudreDroits } from '../droits/resolution.js';
import { ResolveurPerimetreSession } from '../droits/resolveur.js';
import type { EtatSession } from '../droits/resolveur.js';
import { ErreurApplicative } from '../erreurs/index.js';

import { ServiceAnnuaire } from './annuaire.js';
import type { FabriqueClient, IdentiteAnnuaire } from './annuaire.js';
import { ErreurAnnuaire, ErreurIdentifiants } from './client-ldap.js';
import { journaliser } from './journal.js';
import { verifierEmpreinte } from './secours.js';
import {
  assurerCompteSecours,
  compterEchec,
  desactiverCompte,
  estVerrouille,
  lireCompte,
  ouvrirSession,
  provisionnerCompte,
  revoquerSession,
  toucherSession,
  verifierSession,
} from './sessions.js';
import { LimiteurTentatives } from './tentatives.js';
import { avecTransactionAuthentification } from './transaction.js';

/* =====================================================================
 *  Messages — un seul, pour tous les refus d'authentification
 * ===================================================================== */

const MESSAGE_REFUS =
  'Identifiant ou mot de passe incorrect, ou compte temporairement bloqué. Réessayez dans ' +
  'quelques minutes, puis contactez votre support informatique.';

const MESSAGE_SESSION_ABSENTE =
  'Votre session a expiré ou n’a pas été ouverte. Reconnectez-vous pour continuer.';

const MESSAGE_SANS_ACCES =
  'Votre compte est reconnu, mais aucun accès à cette application ne lui est ouvert. ' +
  'Contactez votre administrateur.';

const MESSAGE_ANNUAIRE =
  'Le service d’annuaire ne répond pas : la connexion est momentanément impossible. ' +
  'Réessayez dans quelques instants.';

function refusAuthentification(detailJournal: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'non_authentifie',
    statut: 401,
    message: MESSAGE_REFUS,
    detailJournal,
  });
}

function sessionAbsente(detailJournal: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'non_authentifie',
    statut: 401,
    message: MESSAGE_SESSION_ABSENTE,
    detailJournal,
  });
}

function annuaireIndisponible(detailJournal: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'indisponible',
    statut: 503,
    message: MESSAGE_ANNUAIRE,
    detailJournal,
  });
}

/* =====================================================================
 *  Options
 * ===================================================================== */

export interface OptionsAuthentification {
  /** Fabrique de client LDAP. Le banc y branche la doublure de `test/annuaire/`. */
  readonly fabriqueClient?: FabriqueClient;
  /**
   * Délai entre deux relectures de l'annuaire pour une session en cours.
   * Zéro force la relecture à chaque requête — les essais s'en servent.
   */
  readonly intervalleRevalidationMs?: number;
  /** Horloge injectable, pour éprouver l'expiration sans attendre. */
  readonly horloge?: () => number;
}

/**
 * Cinq minutes par défaut.
 *
 * ⚠️ **Ce n'est pas une variable de configuration, et cela devrait l'être.**
 * `backend/.env.example` appartient à l'orchestrateur (`PLAN_EXECUTION` §2) :
 * `AUTH_REVERIFICATION_AD` lui est **demandée dans le rapport de l'agent**, elle
 * n'est pas ajoutée ici. En attendant, la constante est ce qu'elle prétend être
 * — une valeur par défaut nommée, pas un nombre perdu dans une ligne de code.
 */
const REVALIDATION_PAR_DEFAUT_MS = 5 * 60_000;

/* =====================================================================
 *  Le service
 * ===================================================================== */

export interface ResultatConnexion {
  /** Jeton EN CLAIR, destiné au seul cookie. Ne repasse jamais par la base. */
  readonly jeton: string;
  readonly session: SessionAppliquee;
  readonly resolveur: ResolveurPerimetreSession;
}

export class ServiceAuthentification implements Authentificateur {
  public readonly provisoire = false;

  private readonly pool: Pool;
  private readonly config: Configuration;
  private readonly journal: JournalMinimal;
  private readonly annuaire: ServiceAnnuaire | null;
  private readonly limiteur: LimiteurTentatives;
  private readonly intervalleRevalidationMs: number;
  private readonly horloge: () => number;
  /** Dernière relecture de l'annuaire, par session. Mémoire seule, jamais probante. */
  private readonly derniereRevalidation = new Map<string, number>();

  constructor(
    pool: Pool,
    config: Configuration,
    journal: JournalMinimal,
    options: OptionsAuthentification = {},
  ) {
    this.pool = pool;
    this.config = config;
    this.journal = journal;
    this.horloge = options.horloge ?? Date.now;
    this.intervalleRevalidationMs =
      options.intervalleRevalidationMs ?? REVALIDATION_PAR_DEFAUT_MS;
    this.annuaire =
      config.auth.ldapActif && config.auth.ldap !== null
        ? new ServiceAnnuaire(config.auth.ldap, options.fabriqueClient)
        : null;
    this.limiteur = new LimiteurTentatives(
      {
        maxTentatives: config.auth.maxTentatives,
        dureeVerrouillageMinutes: config.auth.dureeVerrouillageMinutes,
      },
      this.horloge,
    );
  }

  public decrire(): string {
    const moyens: string[] = [];
    if (this.annuaire !== null) moyens.push(`annuaire ${this.config.auth.ldap?.url ?? 'LDAPS'}`);
    if (this.config.auth.compteSecours !== null) moyens.push('compte de secours');
    return (
      `authentification du lot L3 — ${moyens.join(' et ') || 'aucun moyen configuré'} ; ` +
      `verrouillage après ${this.config.auth.maxTentatives} échecs, ` +
      `${this.config.auth.dureeVerrouillageMinutes} min ; ` +
      `session : ${this.config.session.dureeInactiviteMinutes} min d'inactivité, ` +
      `${this.config.session.dureeMaximaleHeures} h au maximum`
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  Ouverture de session
   * ═══════════════════════════════════════════════════════════════════ */

  /**
   * Vérifie des identifiants, résout les trois axes, ouvre la session.
   *
   * L'ordre des étapes est celui de la sûreté, pas celui de la commodité :
   * le rythme d'abord (S11), l'identité ensuite, les droits enfin. Personne ne
   * paie une résolution de groupes pour un mot de passe faux.
   */
  public async connecter(demande: {
    identifiant: string;
    motDePasse: string;
    adresseIp: string | null;
    agentUtilisateur: string | null;
  }): Promise<ResultatConnexion> {
    const login = demande.identifiant.trim();
    if (login === '' || demande.motDePasse === '') {
      throw refusAuthentification('identifiant ou mot de passe vide');
    }

    const verdict = this.limiteur.verifier(login, demande.adresseIp);
    if (verdict.bloque) {
      await this.journaliserEchec(login, demande.adresseIp, {
        resume: 'Connexion refusée : trop de tentatives.',
        detail: `rythme dépassé sur ${verdict.cause}, encore ${verdict.resteS} s`,
        compter: false,
      });
      throw refusAuthentification(
        `limitation du rythme : ${verdict.cause}, ${verdict.resteS} s restantes`,
      );
    }

    const secours = this.config.auth.compteSecours;
    const parSecours =
      secours !== null && login.toLowerCase() === secours.identifiant.trim().toLowerCase();

    const identite = parSecours
      ? await this.verifierCompteSecours(login, demande.motDePasse, demande.adresseIp)
      : await this.verifierParAnnuaire(login, demande.motDePasse, demande.adresseIp);

    this.limiteur.succes(login, demande.adresseIp);

    // ── Les trois axes, résolus en LECTURE SEULE, avant toute écriture ────
    const droits = await avecTransaction(
      this.pool,
      PERIMETRE_SYSTEME,
      async (client) => {
        const compte = await lireCompte(client, identite.login);
        return await resoudreDroits(client, identite.groupes, {
          filialePreferee: compte?.filialeDefautId ?? null,
        });
      },
      { lectureSeule: true },
    );

    if (!ouvreUnAcces(droits)) {
      await this.journaliserEchec(identite.login, demande.adresseIp, {
        action: 'refus_autorisation',
        resume: 'Connexion refusée : aucun périmètre ouvert par les groupes de l’annuaire.',
        detail:
          `groupes présentés : ${identite.groupes.join(', ') || '(aucun)'} ; ` +
          `reconnus : ${droits.groupesReconnus.join(', ') || '(aucun)'}`,
        compter: false,
      });
      throw new ErreurApplicative({
        code: 'droit_insuffisant',
        statut: 403,
        message: MESSAGE_SANS_ACCES,
        detailJournal:
          `aucune filiale résolue pour « ${identite.login} » : ` +
          `${identite.groupes.length} groupe(s) présenté(s), ` +
          `${droits.groupesReconnus.length} reconnu(s) dans groupes_ad`,
      });
    }

    // ── L'écriture : provisionnement, session, journal — une transaction ──
    const perimetre = perimetreDeTravail(identite.login, droits.filiales, droits.filialeActive);

    const ouverte = await avecTransactionAuthentification(this.pool, perimetre, async (client) => {
      const compte = parSecours
        ? {
            id: await assurerCompteSecours(client, identite.login, secours?.empreinte ?? ''),
            cree: false,
          }
        : await provisionnerCompte(client, identite);

      const session = await ouvrirSession(client, {
        utilisateurId: compte.id,
        login: identite.login,
        droits,
        adresseIp: demande.adresseIp,
        agentUtilisateur: demande.agentUtilisateur,
        dureeInactiviteMinutes: this.config.session.dureeInactiviteMinutes,
        dureeMaximaleHeures: this.config.session.dureeMaximaleHeures,
        compteSecours: parSecours,
      });

      await journaliser(client, {
        action: 'connexion_reussie',
        utilisateurLibelle: identite.nomAffichage,
        sessionId: session.etat.sessionId,
        adresseIp: demande.adresseIp,
        filialeId: droits.filialeActive,
        entiteType: 'sessions',
        entiteId: session.etat.sessionId,
        resume: parSecours
          ? // Critère d'acceptation du lot : « le compte de secours est journalisé à
            // chaque usage ». La phrase est explicite pour qu'une recherche plein texte
            // dans le journal la trouve sans connaître le schéma.
            `Connexion par le COMPTE DE SECOURS applicatif « ${identite.login} » — hors annuaire.`
          : `Connexion réussie de « ${identite.login} » (${identite.nomAffichage}).`,
        valeursApres: {
          perimetre: droits.portee,
          filiales: droits.filiales.length,
          administrateur: droits.administrateur,
          peut_exporter: droits.peutExporter,
          domaines: droits.domaines.size,
          compte_secours: parSecours,
          compte_provisionne: compte.cree,
          groupes_reconnus: droits.groupesReconnus,
          groupes_ignores: droits.groupesIgnores,
        },
      });

      return session;
    });

    if (droits.groupesIgnores.length > 0) {
      this.journal.warn(
        { login: identite.login, ignores: droits.groupesIgnores },
        'Connexion : des groupes de l’annuaire ne correspondent à aucune ligne active de ' +
          '« groupes_ad ». Ils n’accordent rien — c’est la table qui décide, pas l’annuaire.',
      );
    }

    const resolveur = new ResolveurPerimetreSession(ouverte.etat);
    return {
      jeton: ouverte.jeton,
      resolveur,
      session: this.appliquer(resolveur, identite, true),
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
   *  Vérification d'une requête
   * ═══════════════════════════════════════════════════════════════════ */

  /**
   * @param requete lue **seule** — jamais son corps, qui n'est pas encore
   *   analysé à ce stade (condition d'entrée E4).
   */
  public async authentifier(requete: FastifyRequest): Promise<SessionAppliquee> {
    const jeton = lireCookie(requete.headers.cookie, this.config.session.nomCookie);
    if (jeton === null) throw sessionAbsente('aucun cookie de session sur la requête');

    const adresseIp = adresseDe(requete);
    const etat = await this.etatDeLaSession(jeton, adresseIp);
    await this.revaliderSiNecessaire(etat, adresseIp);

    const resolveur = new ResolveurPerimetreSession(etat);
    return this.appliquer(resolveur, null, false);
  }

  /** Ferme la session portée par la requête. Révoquée **en base**, pas oubliée. */
  public async deconnecter(requete: FastifyRequest): Promise<boolean> {
    const jeton = lireCookie(requete.headers.cookie, this.config.session.nomCookie);
    if (jeton === null) return false;

    const adresseIp = adresseDe(requete);
    return await avecTransactionAuthentification(this.pool, PERIMETRE_SYSTEME, async (client) => {
      const verification = await verifierSession(
        client,
        jeton,
        this.config.session.dureeInactiviteMinutes,
      );
      if (verification.sessionId === null) return false;

      const touchees = await revoquerSession(client, verification.sessionId, 'deconnexion');
      await journaliser(client, {
        action: 'deconnexion',
        utilisateurLibelle: verification.login,
        sessionId: verification.sessionId,
        adresseIp,
        resume: `Déconnexion de « ${verification.login ?? 'inconnu'} ».`,
      });
      this.derniereRevalidation.delete(verification.sessionId);
      return touchees > 0;
    });
  }

  /** Nombre de sessions dont la revalidation est suivie. Exploitation et essais. */
  public tailleSuiviRevalidation(): number {
    return this.derniereRevalidation.size;
  }

  /* ---- Étapes internes --------------------------------------------- */

  private async etatDeLaSession(jeton: string, adresseIp: string | null): Promise<EtatSession> {
    return await avecTransactionAuthentification(this.pool, PERIMETRE_SYSTEME, async (client) => {
      const verification = await verifierSession(
        client,
        jeton,
        this.config.session.dureeInactiviteMinutes,
      );

      if (verification.etat === null) {
        // Une session morte est révoquée en base **une fois**, et l'événement est
        // journalisé **une fois**. Sans cela, un jeton périmé rejoué en boucle
        // écrirait une entrée par requête dans un journal scellé de trois ans.
        if (
          verification.sessionId !== null &&
          (verification.motif === 'expiree' || verification.motif === 'inactive')
        ) {
          await revoquerSession(client, verification.sessionId, verification.motif);
          await journaliser(client, {
            action: 'session_expiree',
            utilisateurLibelle: verification.login,
            sessionId: verification.sessionId,
            adresseIp,
            resume:
              verification.motif === 'expiree'
                ? 'Session close : échéance absolue atteinte.'
                : 'Session close : inactivité prolongée.',
          });
        }
        throw sessionAbsente(`session refusée, motif « ${verification.motif ?? 'inconnu'} »`);
      }

      await toucherSession(client, verification.etat.sessionId);
      return verification.etat;
    });
  }

  /**
   * Relit l'annuaire pour une session en cours, au plus une fois par intervalle.
   *
   * Trois issues :
   *  · le compte est **désactivé** ou **a perdu ses groupes** → compte désactivé,
   *    sessions révoquées, 401 immédiat. C'est le déprovisionnement du §1.5 ;
   *  · le compte est intact → rien, jusqu'au prochain intervalle ;
   *  · l'**annuaire ne répond pas** → la session survit, et l'écart est
   *    journalisé. Voir l'asymétrie assumée, en tête de fichier.
   */
  private async revaliderSiNecessaire(etat: EtatSession, adresseIp: string | null): Promise<void> {
    if (this.annuaire === null || etat.compteSecours) return;

    const maintenant = this.horloge();
    const derniere = this.derniereRevalidation.get(etat.sessionId) ?? 0;
    if (maintenant - derniere < this.intervalleRevalidationMs) return;
    this.derniereRevalidation.set(etat.sessionId, maintenant);

    let identite: IdentiteAnnuaire | null;
    try {
      identite = await this.annuaire.relire(etat.login);
    } catch (erreur) {
      this.journal.warn(
        {
          login: etat.login,
          detail: erreur instanceof ErreurAnnuaire ? erreur.detailJournal : String(erreur),
        },
        'Revalidation de session : l’annuaire ne répond pas. La session en cours est ' +
          'CONSERVÉE — un annuaire indisponible ne doit pas déconnecter le groupe entier. ' +
          'Elle reste bornée par son échéance absolue.',
      );
      return;
    }

    const perdu =
      identite === null ||
      identite.desactive ||
      (await this.perimetreVide(identite.groupes, etat.login));

    if (!perdu) return;

    const motif =
      identite === null
        ? 'compte absent de l’annuaire'
        : identite.desactive
          ? 'compte désactivé dans l’annuaire'
          : 'retrait des groupes d’accès';

    await avecTransactionAuthentification(this.pool, PERIMETRE_SYSTEME, async (client) => {
      const { sessionsRevoquees } = await desactiverCompte(client, etat.utilisateurId, motif);
      await journaliser(client, {
        action: 'session_revoquee',
        utilisateurLibelle: etat.login,
        sessionId: etat.sessionId,
        adresseIp,
        entiteType: 'utilisateurs',
        entiteId: etat.utilisateurId,
        resume:
          `Déprovisionnement immédiat de « ${etat.login} » : ${motif}. ` +
          `${sessionsRevoquees} session(s) active(s) révoquée(s).`,
        valeursApres: { motif, sessions_revoquees: sessionsRevoquees },
      });
    });

    this.derniereRevalidation.delete(etat.sessionId);
    throw sessionAbsente(`session révoquée en cours de route : ${motif}`);
  }

  private async perimetreVide(groupes: readonly string[], login: string): Promise<boolean> {
    const droits = await avecTransaction(
      this.pool,
      PERIMETRE_SYSTEME,
      async (client) => await resoudreDroits(client, groupes),
      { lectureSeule: true },
    );
    if (ouvreUnAcces(droits)) return false;
    this.journal.warn(
      { login, groupes },
      'Revalidation : plus aucun groupe reconnu n’ouvre de périmètre pour ce compte.',
    );
    return true;
  }

  private async verifierParAnnuaire(
    login: string,
    motDePasse: string,
    adresseIp: string | null,
  ): Promise<IdentiteAnnuaire> {
    if (this.annuaire === null) {
      throw annuaireIndisponible(
        'AUTH_LDAP_ACTIF vaut « non » et le login présenté n’est pas celui du compte de secours',
      );
    }

    // Verrouillage persistant : il vaut pour un compte CONNU, et survit au
    // redémarrage du service, à la différence du compteur en mémoire.
    const bloqueEnBase = await avecTransaction(
      this.pool,
      PERIMETRE_SYSTEME,
      async (client) => {
        const compte = await lireCompte(client, login);
        if (compte === null) return false;
        return await estVerrouille(client, compte.id);
      },
      { lectureSeule: true },
    );
    if (bloqueEnBase) {
      await this.journaliserEchec(login, adresseIp, {
        resume: 'Connexion refusée : compte temporairement verrouillé.',
        detail: 'verrouillage persistant actif (utilisateurs.verrouille_jusqu_a)',
        compter: false,
      });
      throw refusAuthentification('compte verrouillé en base');
    }

    try {
      const identite = await this.annuaire.authentifier(login, motDePasse);
      if (identite.desactive) {
        await this.journaliserEchec(login, adresseIp, {
          resume: 'Connexion refusée : compte désactivé dans l’annuaire.',
          detail: 'userAccountControl porte le bit ACCOUNTDISABLE',
          compter: false,
        });
        throw refusAuthentification('compte désactivé dans l’annuaire');
      }
      return identite;
    } catch (erreur) {
      if (erreur instanceof ErreurIdentifiants) {
        this.limiteur.echec(login, adresseIp);
        await this.journaliserEchec(login, adresseIp, {
          resume: `Échec de connexion pour « ${login} ».`,
          detail: erreur.message,
          compter: true,
        });
        throw refusAuthentification(`identifiants refusés : ${erreur.message}`);
      }
      if (erreur instanceof ErreurAnnuaire) {
        // ⚠️ Un 503 n'est PAS un échec d'authentification : il ne compte pas au
        // rythme et ne verrouille personne (CONVENTIONS.md §26.2). Verrouiller sur
        // une panne d'annuaire transformerait un incident d'exploitation en
        // blocage de tous les comptes du groupe.
        this.journal.error(
          { login, detail: erreur.detailJournal },
          'Connexion impossible : l’annuaire est injoignable ou a mal répondu.',
        );
        throw annuaireIndisponible(erreur.detailJournal);
      }
      throw erreur;
    }
  }

  private async verifierCompteSecours(
    login: string,
    motDePasse: string,
    adresseIp: string | null,
  ): Promise<IdentiteAnnuaire> {
    const secours = this.config.auth.compteSecours;
    if (secours === null) throw refusAuthentification('compte de secours désactivé');

    const bon = await verifierEmpreinte(motDePasse, secours.empreinte);
    if (!bon) {
      this.limiteur.echec(login, adresseIp);
      await this.journaliserEchec(login, adresseIp, {
        resume: `Échec de connexion sur le COMPTE DE SECOURS « ${login} ».`,
        detail: 'empreinte scrypt non concordante',
        compter: true,
      });
      throw refusAuthentification('compte de secours : mot de passe refusé');
    }

    // Le compte de secours ne vient d'aucun annuaire : ses groupes sont ceux que
    // la configuration lui accorde par construction — l'administration de
    // l'application, et rien d'autre. Le nom du groupe suit le préfixe configuré,
    // pour que `groupes_ad` le reconnaisse comme n'importe quel autre.
    const prefixe = this.config.auth.ldap?.prefixeGroupes ?? 'GRC-';
    return {
      login,
      dn: `(compte de secours applicatif)`,
      nomAffichage: `Compte de secours (${login})`,
      nom: null,
      prenom: null,
      email: null,
      telephone: null,
      service: null,
      fonction: null,
      upn: null,
      sid: null,
      desactive: false,
      groupes: [`${prefixe.toUpperCase()}ADMIN`],
      groupesTraverses: 1,
    };
  }

  private async journaliserEchec(
    login: string,
    adresseIp: string | null,
    quoi: {
      action?: 'connexion_echouee' | 'refus_autorisation';
      resume: string;
      detail: string;
      compter: boolean;
    },
  ): Promise<void> {
    try {
      await avecTransactionAuthentification(this.pool, PERIMETRE_SYSTEME, async (client) => {
        if (quoi.compter) {
          const compte = await lireCompte(client, login);
          if (compte !== null) {
            await compterEchec(
              client,
              compte.id,
              this.config.auth.maxTentatives,
              this.config.auth.dureeVerrouillageMinutes,
            );
          }
        }
        await journaliser(client, {
          action: quoi.action ?? 'connexion_echouee',
          // L'acteur d'un échec n'est pas résolu : `grc.utilisateur` vaut « systeme »
          // ici, et le déclencheur de chaînage mettra `utilisateur_id` à null. C'est
          // le cas explicitement prévu par le commentaire de la colonne — le libellé
          // texte porte alors l'identité présentée, et lui seul (§17.8).
          utilisateurLibelle: login,
          adresseIp,
          resume: quoi.resume,
          valeursApres: { detail: quoi.detail },
        });
      });
    } catch (erreur) {
      // Un journal qui échoue ne doit pas transformer un refus en 500 : le refus
      // reste un refus. L'échec d'écriture, lui, doit être visible côté exploitant.
      this.journal.error(
        { login, erreur: erreur instanceof Error ? erreur.message : String(erreur) },
        'Écriture au journal d’audit impossible pour un échec de connexion.',
      );
    }
  }

  private appliquer(
    resolveur: ResolveurPerimetreSession,
    identite: IdentiteAnnuaire | null,
    sessionOuverte: boolean,
  ): SessionAppliquee {
    const etat = resolveur.etatSession();
    return {
      perimetre: perimetreDe(resolveur),
      droits: projeterDroits(etat),
      identite:
        identite === null
          ? null
          : {
              login: identite.login,
              nomAffichage: identite.nomAffichage,
              email: identite.email,
              telephone: identite.telephone,
              service: identite.service,
              fonction: identite.fonction,
              utilisateurId: etat.utilisateurId,
            },
      sessionOuverte,
    };
  }
}

/* =====================================================================
 *  Fonctions libres
 * ===================================================================== */

/**
 * Périmètre de la transaction d'ouverture de session.
 *
 * ⚠️ Il n'est **pas** construit à partir d'une requête : ses trois valeurs
 * sortent de la résolution des groupes AD. `administrationGroupe` y vaut
 * toujours **faux** — l'ouverture de session n'écrit aucune ligne de portée
 * Groupe, et il n'y a pas de raison d'ouvrir ce qu'on n'emploie pas.
 */
function perimetreDeTravail(
  login: string,
  filiales: readonly string[],
  filialeActive: string | null,
): PerimetreSession {
  return Object.freeze({
    utilisateurId: login,
    filialeId: filialeActive,
    filiales: Object.freeze([...filiales]) as readonly string[],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
}

/** Le périmètre que le résolveur a figé. Lu ici sans passer par `resoudre()`. */
function perimetreDe(resolveur: ResolveurPerimetreSession): PerimetreSession {
  const etat = resolveur.etatSession();
  return Object.freeze({
    utilisateurId: etat.login,
    filialeId: etat.filialeActive,
    filiales: Object.freeze([...etat.filiales]) as readonly string[],
    perimetreGroupe: etat.portee === 'groupe',
    // Condition E2 : la même décision que dans le résolveur, et elle vient des
    // deux mêmes colonnes. Elle n'est jamais prise ailleurs.
    administrationGroupe: etat.administrateur && etat.portee === 'groupe',
  });
}

/**
 * Lit un cookie dans l'en-tête `Cookie`.
 *
 * ⚠️ **Écrit à la main, et c'est un choix documenté.** `cookie` et
 * `set-cookie-parser` sont présents dans `node_modules` comme dépendances
 * **transitives** de Fastify ; s'en servir sans les déclarer serait la dette
 * silencieuse que le `CONVENTIONS.md` §28 refuse explicitement — elle disparaît
 * le jour où Fastify change d'implémentation, sans qu'aucun `package.json` ne
 * l'annonce. Vingt lignes de lecture d'en-tête coûtent moins qu'une dépendance
 * invisible ; `@fastify/cookie` est **demandé dans le rapport** si l'écriture du
 * cookie devait se complexifier.
 *
 * Le format est celui de la RFC 6265 §4.2.1 : des paires `nom=valeur` séparées
 * par « ; ». La valeur n'est pas décodée : le jeton est du base64url, qui ne
 * contient aucun caractère à échapper.
 */
export function lireCookie(entete: string | undefined, nom: string): string | null {
  if (entete === undefined || entete === '') return null;
  for (const morceau of entete.split(';')) {
    const separateur = morceau.indexOf('=');
    if (separateur < 0) continue;
    if (morceau.slice(0, separateur).trim() !== nom) continue;
    const valeur = morceau.slice(separateur + 1).trim();
    return valeur === '' ? null : valeur;
  }
  return null;
}

/** Adresse de l'appelant, telle que Fastify la calcule. Jamais un en-tête brut. */
function adresseDe(requete: FastifyRequest): string | null {
  const ip = requete.ip;
  return typeof ip === 'string' && ip !== '' ? ip : null;
}
