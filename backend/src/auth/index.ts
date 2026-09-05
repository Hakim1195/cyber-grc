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
import type { FilialeActive } from '../droits/resolveur.js';
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
 * ✅ **La demande de l'agent a été traitée — constat Q-91, le 04/09/2026.**
 *
 * Ce commentaire disait : *« ce n'est pas une variable de configuration, et cela
 * devrait l'être ; `AUTH_REVERIFICATION_AD` est demandée à l'orchestrateur dans
 * le rapport de l'agent »*. La demande était juste et elle est restée en l'état
 * une vague entière, pendant que `.env.example` documentait le réglage comme
 * s'il était lu. L'exploitant qui le réglait ne réglait rien.
 *
 * `config.auth.reverificationAdMinutes` le porte désormais, avec **la même valeur
 * par défaut**, écrite une seule fois — dans `src/config/index.ts`, où toutes les
 * autres sont. La constante a donc été retirée plutôt que gardée en repli : deux
 * exemplaires d'un défaut finissent par ne plus dire la même chose, et le service
 * reçoit toujours une configuration chargée (les essais passent par
 * `chargerConfiguration`, jamais par un objet partiel).
 */

/* =====================================================================
 *  Le service
 * ===================================================================== */

/**
 * Une session appliquée par l'authentification **réelle** — constat **Q-85**.
 *
 * ── Pourquoi un type de plus, et pas un champ de plus ────────────────────
 *
 * `SessionAppliquee` vit dans `src/api/session.ts`, qui n'appartient pas au
 * périmètre d'écriture de cette couche (`PLAN_EXECUTION` §2). Ce type l'**étend**
 * plutôt que de la modifier : il reste assignable partout où l'on attend une
 * `SessionAppliquee`, et il porte en plus ce que seule l'authentification réelle
 * sait — le **nom** de la filiale active.
 *
 * ── Ce qu'il reste à faire, et où ────────────────────────────────────────
 *
 * Le champ est produit ici ; il n'est pas encore **lu**. `charteSession`
 * (`src/api/index.ts`) reçoit la filiale en second argument et ne la reçoit que
 * de la session provisoire : `POST /api/connexion` et `GET /api/session` rendent
 * donc toujours `filiale_active : { id }` seul. La ligne qui manque est décrite
 * dans le rapport de l'agent B1 — un `?? session.filiale` dans `charteSession` —
 * et elle vaut pour les **deux** routes à la fois, ce qui est la raison pour
 * laquelle la donnée voyage dans la session plutôt que par un argument : le
 * greffon de connexion reçoit `charteSession` avec **un seul** paramètre, et une
 * charte enrichie d'un seul côté ferait diverger deux réponses que le
 * `CONVENTIONS.md` §26.2 exige identiques « à l'octet près ».
 */
export interface SessionAppliqueeReelle extends SessionAppliquee {
  /** La filiale active, nommée. `null` en portée Groupe sans filiale active. */
  readonly filiale: FilialeActive | null;
}

export interface ResultatConnexion {
  /** Jeton EN CLAIR, destiné au seul cookie. Ne repasse jamais par la base. */
  readonly jeton: string;
  readonly session: SessionAppliqueeReelle;
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
  /**
   * Dernière relecture de l'annuaire, par session. Mémoire seule, jamais probante.
   *
   * ⚠️ **Bornée — constat Q-214 e de la porte S8.** Elle n'était purgée qu'à la
   * déconnexion **explicite** : une session qui EXPIRE laissait son entrée, et
   * la table croissait sans borne sur un service qui tourne des mois. Les deux
   * autres registres mémoire du produit sont bornés *et* commentés sur ce
   * point ; celui-ci ne l'était pas.
   *
   * L'éviction est la plus ancienne d'abord, ce que l'ordre d'insertion d'une
   * `Map` donne gratuitement. Perdre une entrée est **sans conséquence** : la
   * revalidation se refait, c'est-à-dire qu'on interroge l'annuaire une fois de
   * plus. Le pire cas d'une éviction est un appel LDAP ; le pire cas de
   * l'absence de borne est le processus.
   */
  private readonly derniereRevalidation = new Map<string, number>();

  /** Au-delà, on évince la plus ancienne. Vingt filiales × sessions simultanées. */
  private static readonly MAX_REVALIDATIONS = 10_000;

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
    // Q-91 : la configuration prime, l'option d'essai prime sur elle. Zéro est
    // une valeur admise et significative — elle force la relecture à chaque
    // requête —, d'où `??` et non `||`, qui l'aurait remplacée par le défaut.
    this.intervalleRevalidationMs =
      options.intervalleRevalidationMs ?? config.auth.reverificationAdMinutes * 60_000;
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
        // ⚠️ **LE LOGIN, PAS LE NOM D'AFFICHAGE — constat Q-119, porte S4.**
        //
        // Cette ligne portait `identite.nomAffichage`, et le commentaire posé
        // juste en dessous en corrigeant Q-109 affirmait « le login part dans
        // `utilisateurLibelle` ci-dessus ». **Il était faux, et je l'ai écrit
        // sans le vérifier** : en retirant le login du `resume`, j'ai retiré le
        // seul endroit où il figurait en clair.
        //
        // Mesuré par l'auditeur : `GET /api/journal?utilisateur=rssi.tls` rend
        // **0 de ses 33 connexions**, en silence. Le login reste récupérable par
        // `utilisateur_id` — la colonne est peuplée, 69/69 —, mais le filtre
        // interroge le libellé, et un auditeur qui cherche par login ne trouve
        // rien sans savoir pourquoi.
        //
        // Le type le dit depuis le début : *« Identité telle que connue au
        // moment des faits — le login présenté suffit »*, et les six autres
        // sites d'appel passent tous un login. Celui-ci était le seul écart. Le
        // nom d'affichage part dans `valeursApres`, où il était déjà.
        utilisateurLibelle: identite.login,
        sessionId: session.etat.sessionId,
        adresseIp: demande.adresseIp,
        filialeId: droits.filialeActive,
        entiteType: 'sessions',
        entiteId: session.etat.sessionId,
        // §29.5 : phrase FIXE. Le login part dans `utilisateurLibelle` ci-dessus,
        // le nom d'affichage dans `valeursApres`. La phrase du compte de secours
        // reste explicite pour qu'une recherche plein texte la trouve sans
        // connaître le schéma — c'est le critère d'acceptation du lot.
        resume: parSecours
          ? 'Connexion par le COMPTE DE SECOURS applicatif — hors annuaire.'
          : 'Connexion réussie.',
        valeursApres: {
          nom_affichage: identite.nomAffichage,
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
        // §29.5 : le login est dans `utilisateurLibelle`, pas dans la phrase.
        resume: 'Déconnexion.',
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

  /**
   * ⚠️ **UN REFUS SE RENVOIE, IL NE SE LÈVE PAS D'ICI — corrigé le 04/09/2026.**
   *
   * Ce bloc écrivait deux choses puis levait, **à l'intérieur** de la
   * transaction : `avecTransaction` annule sur exception, si bien que la
   * révocation et sa trace repartaient avec elle. Le commentaire promettait
   * *« une session morte est révoquée en base une fois, et l'événement est
   * journalisé une fois »* ; la réalité était **zéro fois**, pour les deux.
   *
   * Deux mesures le disent, et elles concordent : le journal de la base de
   * recette porte 160 entrées et **aucune** `session_expiree` ; et l'essai
   * chargé de le prouver — « une session ne meurt qu'une fois » — comparait
   * `count(*)` avant et après, lisait **`0` les deux fois**, et concluait au
   * vert. Il aurait rendu le même verdict si le service avait écrit une entrée
   * par requête, c'est-à-dire dans le cas exact qu'il existe pour interdire.
   *
   * Il est resté invisible six mois parce que les deux moitiés se couvraient :
   * l'écriture était annulée, et le contrôle mesurait l'annulation contre
   * elle-même. C'est le motif du 5ᵉ passage de la porte S2 — *deux endroits
   * dont aucun n'a tort seul* —, et il a été trouvé en ajoutant au contrôle une
   * exigence de **matière** : « il doit y avoir eu quelque chose à compter ».
   *
   * La transaction rend donc un **verdict**, et l'exception est levée après le
   * `commit`. Le refus est identique pour l'appelant ; ce qui change est que la
   * trace survit.
   */
  private async etatDeLaSession(jeton: string, adresseIp: string | null): Promise<EtatSession> {
    const verdict = await avecTransactionAuthentification(
      this.pool,
      PERIMETRE_SYSTEME,
      async (client): Promise<{ etat: EtatSession } | { refus: string }> => {
        const verification = await verifierSession(
          client,
          jeton,
          this.config.session.dureeInactiviteMinutes,
        );

        if (verification.etat === null) {
          // Une session morte est révoquée en base **une fois**, et l'événement est
          // journalisé **une fois**. Sans cela, un jeton périmé rejoué en boucle
          // écrirait une entrée par requête dans un journal scellé de trois ans.
          // C'est `revoquerSession` qui rend cela vrai : la seconde requête ne
          // trouve plus la session vivante, et ne rejournalise donc pas.
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
          return { refus: verification.motif ?? 'inconnu' };
        }

        await toucherSession(client, verification.etat.sessionId);
        return { etat: verification.etat };
      },
    );

    if ('refus' in verdict) throw sessionAbsente(`session refusée, motif « ${verdict.refus} »`);
    return verdict.etat;
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
    // Éviction de la plus ancienne : l'ordre d'insertion d'une `Map` la donne
    // gratuitement (Q-214 e). Perdre une entrée coûte un appel à l'annuaire ;
    // ne pas borner coûte le processus.
    if (this.derniereRevalidation.size >= ServiceAuthentification.MAX_REVALIDATIONS) {
      const plusAncienne = this.derniereRevalidation.keys().next();
      if (plusAncienne.done !== true) this.derniereRevalidation.delete(plusAncienne.value);
    }
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
        // §29.5 : phrase fixe. `motif` et le décompte sont des valeurs — elles
        // vont dans le `jsonb`, où elles étaient d'ailleurs déjà.
        resume: 'Déprovisionnement immédiat : sessions actives révoquées.',
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
    // ══ Q-79 — LE CODE HTTP NE DOIT PAS NOMMER LE COMPTE DE SECOURS ══════
    //
    // Ce refus rendait **503**, et c'était faux deux fois.
    //
    //  · **Faux pour l'exploitant** : « le service d'annuaire ne répond pas »
    //    annonce une panne réseau, alors que l'annuaire est *délibérément
    //    désactivé* par `AUTH_LDAP_ACTIF=non`. On cherche un incident qui
    //    n'existe pas.
    //  · **Faux pour la sécurité, et c'est le constat** : avec l'annuaire
    //    désactivé, `POST /api/connexion` rendait **401** pour le seul
    //    identifiant du compte de secours et **503** pour tous les autres.
    //    Mesuré le 03/09/2026, six sondes : `secours` → 401, `SECOURS` → 401
    //    (la comparaison est insensible à la casse), `personne`, `admin`,
    //    `root`, `svc-grc` → 503. **Une requête par candidat suffisait donc à
    //    découvrir l'identifiant** que `AUTH_COMPTE_SECOURS_IDENTIFIANT` rend
    //    configurable pour qu'il ne soit précisément pas devinable.
    //
    // Le refus est donc celui d'un mot de passe faux, **à l'octet près** : même
    // statut, même message, même comptage au rythme, même écriture au journal
    // d'audit. Ce dernier point n'est pas décoratif : sans le comptage, les deux
    // chemins redeviendraient distinguables à la cinquième tentative, l'un se
    // verrouillant et l'autre non. Le vrai motif, lui, va au journal technique,
    // qui n'est lu que par l'exploitant.
    if (this.annuaire === null) {
      this.limiteur.echec(login, adresseIp);
      await this.journaliserEchec(login, adresseIp, {
        resume: 'Échec de connexion.',
        detail:
          'AUTH_LDAP_ACTIF vaut « non » et le login présenté n’est pas celui du compte de ' +
          'secours : aucun moyen de vérifier ces identifiants',
        compter: true,
      });
      throw refusAuthentification(
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
          resume: 'Échec de connexion.',
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
        // §29.5 : phrase fixe ; le login présenté est dans `utilisateurLibelle`.
        resume: 'Échec de connexion sur le COMPTE DE SECOURS applicatif.',
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
  ): SessionAppliqueeReelle {
    const etat = resolveur.etatSession();
    return {
      perimetre: perimetreDe(resolveur),
      droits: projeterDroits(etat),
      // Constat Q-85 : la filiale **nommée**, pour que la charte rendue au
      // navigateur n'ait pas qu'un identifiant technique à afficher.
      filiale: resolveur.filiale(),
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

/**
 * Le périmètre que le résolveur a figé — constat **Q-70**.
 *
 * ⚠️ Cette fonction **reconstruisait** le périmètre champ par champ, et
 * recalculait au passage `administrationGroupe = administrateur && portee ===
 * 'groupe'` : la **même** décision que `ResolveurPerimetreSession`, écrite deux
 * fois. Les deux rédactions étaient d'accord le jour où elles ont été écrites,
 * et rien n'aurait dit qu'elles avaient cessé de l'être — condition **E2** du
 * `CONVENTIONS.md` §22, où le drapeau décide de l'accès Groupe.
 *
 * Il n'y a donc plus qu'un producteur, le constructeur du résolveur, et cette
 * fonction ne fait que **lire** ce qu'il a gelé. Le mot « le même » est ici
 * littéral : c'est le même objet, pas une copie qui lui ressemble.
 */
function perimetreDe(resolveur: ResolveurPerimetreSession): PerimetreSession {
  return resolveur.perimetreFige;
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
