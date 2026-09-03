/**
 * Périmètre de session — **implémentation provisoire du lot L2**.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier est, et ce qu'il n'est pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'authentification est le lot **L3** : LDAPS, groupes AD imbriqués, sessions
 * serveur, droits à trois axes (`PLAN_SERVEUR` §1.5 et §3). Rien de tout cela
 * n'existe encore. Or la couche d'accès aux données exige un `PerimetreSession`
 * — `avecTransaction` refuse de s'ouvrir sans lui — et il faut donc bien en
 * fabriquer un.
 *
 * **La propriété que ce fichier tient, et qui est la seule qui compte
 * aujourd'hui (contrôle S2 de la grille, `PLAN_SERVEUR` §2.4) :**
 *
 *   > le périmètre vient du serveur, **jamais du navigateur**.
 *
 * Elle est tenue par la **forme** autant que par le fond : `resoudre()` ne
 * prend **aucun argument**. Il n'existe donc, structurellement, aucun chemin
 * par lequel un corps de requête, une entête, un paramètre d'URL ou un cookie
 * atteindrait `grc.filiale_id` ou `grc.filiales`. Ce n'est pas une discipline
 * à tenir : c'est une signature.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que le lot L3 devra remplacer, point par point
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Ce que fait la session provisoire | Ce que L3 doit mettre à la place |
 * |---|---|
 * | Identité fixe `developpement` | L'identifiant AD de l'utilisateur connecté (`CONVENTIONS.md` §18.3 : un **login**, pas une clé primaire) |
 * | Filiale active = l'unique filiale active de la base | La filiale sélectionnée par l'utilisateur **parmi celles que ses groupes AD lui ouvrent**, mémorisée dans `sessions.filiale_active_id` |
 * | Périmètre de lecture = cette seule filiale | `session_filiales`, résolu depuis les groupes AD, groupes imbriqués compris |
 * | `administrationGroupe` **faux**, sauf échappatoire de développement explicite | Vrai seulement si profil *Administration* **et** périmètre *Groupe* (`CONVENTIONS.md` §17.4) — et c'est **ici**, dans le résolveur, que le droit se décide : aucune route ne pose ce drapeau |
 * | `perimetreGroupe` toujours **faux** | Vrai pour un périmètre Groupe (direction, RSSI groupe) |
 * | Aucun droit par domaine ni droit d'export | Les trois axes, et le **droit d'export distinct** (`PLAN_SERVEUR` §3.3, contrôle S7) |
 * | Aucune expiration, aucune limitation de rythme | Expiration d'inactivité, verrouillage temporaire (contrôle S11) |
 *
 * Le point d'accroche est l'interface `ResolveurPerimetre` : L3 en fournit une
 * autre implémentation, et **rien d'autre ne change** dans `src/api/`.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Fail-closed partout sauf en développement
 * ════════════════════════════════════════════════════════════════════════
 *
 * La session provisoire **refuse de résoudre quoi que ce soit** hors du seul
 * environnement `developpement` : l'API répond alors 503 sur toutes ses routes
 * de données. Un service déployé sans authentification ne doit pas servir de
 * données de gouvernance cyber — pas même en lecture, pas même « le temps de
 * finir L3 ».
 *
 * ⚠️ **La recette est fermée elle aussi, et c'est le point.** La première
 * rédaction ne fermait que `production`, en croyant que la recette était un
 * environnement d'essai à données jetables. Elle ne l'est pas : le
 * `PLAN_SERVEUR` §1.10 exige qu'elle soit « alimentée par une **copie réaliste
 * de la production** — tester sur une base vide ne révèle rien ». La recette
 * porte donc de la vraie donnée de gouvernance de vingt filiales, sur une VM
 * joignable par le VPN, et elle servait **et laissait écrire** sans la moindre
 * authentification (porte S2, constat M-5). Une barrière qui protège la copie
 * mais pas l'original ne protège rien.
 */

import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { Configuration } from '../config/index.js';
import { avecTransaction, PERIMETRE_SYSTEME } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import type { IdentiteAnnuaire } from '../entites/types.js';
import { ErreurApplicative } from '../erreurs/index.js';
import { DROITS_PROVISOIRES_DEVELOPPEMENT } from './droits.js';
import type { DroitsSession } from './droits.js';

export type { IdentiteAnnuaire };

/**
 * Fournit le périmètre d'une transaction.
 *
 * ⚠️ **Aucune méthode ne prend la requête HTTP en paramètre**, et c'est le
 * contrat : une implémentation future qui en aurait besoin devra le rendre
 * explicite, donc visible en revue.
 */
export interface ResolveurPerimetre {
  /** Périmètre de la session courante. Aucun argument : voir l'entête. */
  resoudre(): Promise<PerimetreSession>;
  /** Description lisible, pour `/api/session` et le journal de démarrage. */
  decrire(): string;
  /** Vrai tant que l'authentification réelle (L3) n'est pas livrée. */
  readonly provisoire: boolean;
}

interface FilialeResolue {
  readonly id: string;
  readonly code: string;
  readonly raisonSociale: string;
}

/** Durée de mise en cache du périmètre résolu. Courte : c'est un pis-aller. */
const DUREE_CACHE_MS = 60_000;

/**
 * Filiale de travail imposée par l'exploitant, ou `null`.
 *
 * ⚠️ **Lecture directe de l'environnement, et c'est une entorse assumée.** La
 * configuration du serveur est centralisée dans `src/config/index.ts`, qui
 * n'appartient pas au périmètre de cet agent ; la variable a donc été
 * documentée dans `.env.example` sans que rien ne la lise, ce que la porte S2
 * a relevé (constat m-2). Plutôt que de laisser une variable mensongère, elle
 * est lue **ici**, au seul endroit qui s'en sert, et elle disparaîtra avec
 * cette classe : le lot L3 résout le périmètre depuis les groupes AD, et le
 * lot L4 rend le choix de la filiale à l'utilisateur.
 *
 * Ce n'est **pas** une valeur venue du navigateur (contrôle S2) : c'est
 * l'environnement du processus, posé par systemd, hors de portée du réseau.
 * `resoudre()` reste sans paramètre, et c'est cette signature qui tient la
 * propriété.
 */
/**
 * L'exploitant a-t-il ouvert l'administration Groupe sur cette machine ?
 *
 * ⚠️ **Échappatoire de développement, et rien d'autre.** Elle permet de
 * reprendre un export portant des collections de portée Groupe (les
 * correspondances inter-référentiels) tant que le modèle de droits n'existe
 * pas. Trois bornes l'encadrent :
 *
 *  · elle vaut **faux** par défaut — l'absence de réglage ne l'accorde pas ;
 *  · elle n'a aucun effet en production ni en recette, où la session
 *    provisoire refuse de résoudre quoi que ce soit (voir l'entête) ;
 *  · elle est **journalisée à chaque résolution** quand elle est active, pour
 *    qu'une machine ainsi ouverte le dise d'elle-même.
 *
 * Elle disparaît avec cette classe : le lot L3 dérive ce droit du profil
 * *Administration* et du périmètre *Groupe*, résolus depuis les groupes AD.
 *
 * ⚠️ Variable **non documentée** dans `.env.example`, qui appartient à
 * l'orchestrateur : elle lui est demandée dans le rapport. Une variable de
 * sécurité lue et non documentée est un moindre mal qu'une variable
 * documentée et non lue (constat m-2), mais c'en est un — elle doit être
 * écrite au modèle de configuration.
 */
function administrationGroupeDemandee(): boolean {
  return (process.env['API_ADMINISTRATION_GROUPE_PROVISOIRE'] ?? '').trim().toLowerCase() === 'oui';
}

function filialeDemandeeParLExploitant(): string | null {
  const brut = process.env['API_FILIALE_PROVISOIRE'];
  if (typeof brut !== 'string') return null;
  const valeur = brut.trim();
  return valeur === '' ? null : valeur;
}

export class PerimetreProvisoire implements ResolveurPerimetre {
  public readonly provisoire = true;

  private readonly pool: Pool;
  private readonly environnement: Configuration['environnement'];
  private readonly journal: { warn(donnees: unknown, message?: string): void };

  private cache: { perimetre: PerimetreSession; filiale: FilialeResolue; expire: number } | null =
    null;

  constructor(
    pool: Pool,
    config: Configuration,
    journal: { warn(donnees: unknown, message?: string): void },
  ) {
    this.pool = pool;
    this.environnement = config.environnement;
    this.journal = journal;
  }

  public decrire(): string {
    return (
      'session provisoire du lot L2 — identité fixe, filiale déduite de la base, aucun droit ' +
      "résolu. Remplacée par l'authentification Active Directory du lot L3."
    );
  }

  /** Filiale active résolue, pour l'affichage. Ne sert jamais à décider. */
  public async filiale(): Promise<FilialeResolue> {
    await this.resoudre();
    if (this.cache === null) throw this.refusEnvironnement();
    return this.cache.filiale;
  }

  public async resoudre(): Promise<PerimetreSession> {
    if (this.environnement !== 'developpement') throw this.refusEnvironnement();

    const maintenant = Date.now();
    if (this.cache !== null && this.cache.expire > maintenant) return this.cache.perimetre;

    const filiale = await this.lireFilialeUnique();

    const perimetre: PerimetreSession = Object.freeze({
      // `CONVENTIONS.md` §18.3 : ce réglage désigne un LOGIN. Et §19.2 :
      // « systeme » est réservé à la sentinelle des traitements internes — un
      // compte provisoire ne doit surtout pas la capturer.
      utilisateurId: 'developpement',
      filialeId: filiale.id,
      filiales: Object.freeze([filiale.id]) as readonly string[],
      perimetreGroupe: false,
      // ── Fail-closed, et c'est ICI que la barrière se tient ──────────────
      //
      // Le drapeau n'est pas un privilège que la base arbitre (§17.4) : c'est
      // une déclaration que la session fait sur elle-même. Il n'a donc de
      // valeur que si **une seule** couche le pose, et si cette couche sait de
      // quel droit elle parle. Cette couche, c'est le résolveur de périmètre —
      // aujourd'hui provisoire, demain l'authentification du lot L3.
      //
      // Aucune route ne le pose, et cela se vérifie en balayant `src/` à la
      // recherche d'une affectation littérale de ce champ à vrai : il n'y en a
      // aucune. (Le motif n'est pas recopié ici — l'écrire en toutes lettres
      // ferait de ce commentaire la seule occurrence, et le balayage
      // répondrait « trouvé » à qui vérifie qu'il ne trouve rien. La leçon est
      // fraîche : je venais de l'appliquer ailleurs et je l'ai manquée ici.)
      // Le premier jet avait un `enAdministrationGroupe` qui l'accordait à la route de
      // reprise ; la porte S2 a montré ce que cela coûtait, et il a été retiré
      // plutôt que corrigé : une route vérifie un droit, elle ne se l'accorde
      // pas. Il vaut donc
      // faux par défaut, et il ne devient vrai que si l'exploitant l'a demandé
      // explicitement, sur une machine de développement.
      administrationGroupe: administrationGroupeDemandee(),
    });

    if (perimetre.administrationGroupe) {
      this.journal.warn(
        { administration_groupe: true },
        "Session provisoire (lot L2) : l'administration Groupe est OUVERTE par " +
          'API_ADMINISTRATION_GROUPE_PROVISOIRE. Le socle commun aux filiales est écrivable ' +
          "depuis cette machine. À n'employer qu'en développement.",
      );
    }

    this.cache = { perimetre, filiale, expire: maintenant + DUREE_CACHE_MS };
    return perimetre;
  }

  /** Vide le cache : appelé quand une filiale vient d'être créée ou archivée. */
  public oublier(): void {
    this.cache = null;
  }

  private refusEnvironnement(): ErreurApplicative {
    return new ErreurApplicative({
      code: 'indisponible',
      statut: 503,
      message:
        "L'authentification n'est pas encore installée sur ce serveur : il ne peut pas servir " +
        'de données. Contactez votre exploitant.',
      detailJournal:
        `refus fail-closed : la session provisoire du lot L2 ne sert qu'en « developpement » ; ` +
        `environnement courant « ${this.environnement} ». La recette est fermée au même titre ` +
        "que la production (PLAN_SERVEUR §1.10 : elle porte une copie réaliste de la " +
        "production). L'authentification Active Directory est le lot L3.",
    });
  }

  /**
   * Lit la filiale de travail dans la base.
   *
   * `filiales` est de niveau Groupe et lisible sans périmètre (politique
   * `using (true)`, migration `004_rls.sql` §6) : le périmètre système suffit,
   * et il ne donne accès à **aucune** donnée métier.
   *
   * Trois cas, trois comportements, et aucun n'est un choix silencieux :
   *  · une seule filiale active → c'est elle ;
   *  · aucune → refus, avec le geste à faire ;
   *  · plusieurs → la première par code, **avec un avertissement à chaque
   *    résolution**. Ce n'est pas satisfaisant, et c'est écrit comme tel : le
   *    choix appartient à l'utilisateur, et c'est le sélecteur de filiale du
   *    lot L4 qui le lui rendra.
   */
  private async lireFilialeUnique(): Promise<FilialeResolue> {
    const choisie = filialeDemandeeParLExploitant();
    const filiales = await avecTransaction(
      this.pool,
      PERIMETRE_SYSTEME,
      async (client) => {
        const { rows } = await client.query<{
          id: string;
          code: string;
          raison_sociale: string;
        }>(
          `select "id", "code", "raison_sociale"
             from "filiales"
            where "statut" = 'active'
            order by "code"
            limit 50`,
        );
        return rows;
      },
      { lectureSeule: true },
    );

    // ── m-2 : la variable documentée est désormais LUE ──────────────────
    // `API_FILIALE_PROVISOIRE` était documentée dans `.env.example` et lue par
    // personne (porte S2, constat m-2). Une variable documentée et sans effet
    // est pire qu'absente : un exploitant la renseigne et croit avoir choisi.
    if (choisie !== null) {
      const retenue = filiales.find((f) => f.id === choisie || f.code === choisie);
      if (retenue === undefined) {
        throw new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message:
            "La filiale de travail configurée sur ce serveur n'existe pas, ou n'est pas " +
            "active. Contactez votre exploitant.",
          detailJournal:
            `API_FILIALE_PROVISOIRE = « ${choisie} » ne correspond à aucune filiale active ` +
            `(codes disponibles : ${filiales.map((f) => f.code).join(', ')})`,
        });
      }
      return { id: retenue.id, code: retenue.code, raisonSociale: retenue.raison_sociale };
    }

    const premiere = filiales[0];
    if (premiere === undefined) {
      throw new ErreurApplicative({
        code: 'indisponible',
        statut: 503,
        message:
          "Aucune filiale active n'est enregistrée : le serveur n'a pas de périmètre de travail. " +
          "L'exploitant doit en créer une avant la mise en service.",
        detailJournal: 'aucune ligne active dans « filiales »',
      });
    }

    if (filiales.length > 1) {
      this.journal.warn(
        { filiales: filiales.map((f) => f.code), retenue: premiere.code },
        'Session provisoire (lot L2) : plusieurs filiales actives, la première par code est ' +
          "retenue. Le choix appartient à l'utilisateur — sélecteur de filiale du lot L4, " +
          'périmètre résolu depuis les groupes AD au lot L3.',
      );
    }

    return { id: premiere.id, code: premiere.code, raisonSociale: premiere.raison_sociale };
  }
}

/* =====================================================================
 *  Lot L3 — l'authentification vue du point d'entrée
 * =====================================================================
 *
 *  ⚠️ Ce qui suit **n'élargit pas** `ResolveurPerimetre` : son contrat est
 *  intact, `resoudre()` ne prend toujours aucun argument, et c'est cette
 *  signature qui tient le contrôle S2 (« le périmètre ne vient jamais du
 *  navigateur »).
 *
 *  Ce qui s'ajoute est une **seconde question**, que le lot L2 n'avait pas à
 *  poser et que le lot L3 ne peut pas éviter :
 *
 *      ResolveurPerimetre  →  « quel est le périmètre de la session ? »
 *      Authentificateur    →  « cette requête-ci porte-t-elle une session ? »
 *
 *  La seconde est **par nature attachée à une requête** — un cookie de session
 *  s'y trouve, pas ailleurs. La mélanger à la première aurait donné à
 *  `resoudre()` un paramètre `requete`, c'est-à-dire précisément le chemin par
 *  lequel un en-tête atteindrait `grc.filiale_id`. Les deux interfaces restent
 *  donc séparées, et l'implémentation du lot L3 les tient ensemble sans que le
 *  périmètre cesse d'être décidé par le serveur.
 * ===================================================================== */

/**
 * Session appliquée à **une** requête : son périmètre et ses droits.
 *
 * Les deux viennent du serveur. Aucun champ n'est lu dans la requête HTTP, et
 * aucune route ne les construit — elles les constatent.
 */
export interface SessionAppliquee {
  readonly perimetre: PerimetreSession;
  readonly droits: DroitsSession;
  /**
   * Identité de l'annuaire, quand la couche d'authentification en dispose.
   * Absente pour la session provisoire, qui n'interroge aucun annuaire.
   */
  readonly identite?: IdentiteAnnuaire | null;
  /**
   * Vrai à la **première** requête d'une session ouverte. C'est le seul moment
   * où l'annuaire `personnes` est resynchronisé : le faire à chaque requête
   * transformerait une lecture en écriture, et incrémenterait la `version` de
   * la fiche à chaque clic.
   */
  readonly sessionOuverte?: boolean;
}

/**
 * Port d'authentification — **implémenté par le lot L3** (agent A1, LDAPS,
 * sessions serveur, trois axes), consommé ici.
 *
 * `authentifier` **lève** une `ErreurApplicative` plutôt que de rendre un
 * verdict à interpréter : le point d'entrée n'a alors aucun chemin où « oublier
 * de regarder le résultat ». Un refus faute de session porte le statut **401**,
 * un service qui ne peut pas répondre le **503** — et les deux ne se confondent
 * pas, parce que le second ne doit verrouiller personne.
 */
export interface Authentificateur {
  /**
   * @param requete requête entrante, **lue seule** — jamais son corps, qui n'est
   *   pas encore analysé à ce stade (condition d'entrée **E4**).
   */
  authentifier(requete: FastifyRequest): Promise<SessionAppliquee>;
  /** Description lisible, pour `/api/session` et le journal de démarrage. */
  decrire(): string;
  /** Vrai tant que l'authentification réelle n'est pas livrée. */
  readonly provisoire: boolean;
}

/**
 * Cet objet sait-il aussi authentifier ?
 *
 * ── Pourquoi cette question se pose ─────────────────────────────────────
 *
 * Les deux interfaces sont séparées **par nécessité** (voir l'encadré
 * ci-dessus) : l'une ne prend pas la requête, l'autre ne peut pas s'en passer.
 * Mais rien n'oblige à en faire **deux objets** — et l'implémentation du lot L3
 * n'en fera qu'un : c'est la même session serveur qui dit qui parle et quel
 * périmètre lui revient. Les séparer en deux instances obligerait à les tenir
 * cohérentes, c'est-à-dire à recréer le défaut que la séparation évite.
 *
 * `greffonApi` accepte donc un objet qui porte les deux contrats, et n'enveloppe
 * dans l'authentification provisoire que ce qui ne porte que le premier.
 */
export function estAuthentificateur(
  candidat: ResolveurPerimetre | Authentificateur,
): candidat is ResolveurPerimetre & Authentificateur {
  return typeof (candidat as Authentificateur).authentifier === 'function';
}

/**
 * Authentification provisoire : **il n'y en a pas**.
 *
 * Elle enveloppe le `ResolveurPerimetre` en place et rend les droits d'un profil
 * qui peut tout. Ce n'est acceptable que parce que la barrière du dessus est
 * totale : `PerimetreProvisoire.resoudre()` **refuse de résoudre hors du
 * développement**, et le 503 qu'elle lève traverse cette classe sans être
 * transformé. En production comme en recette, aucune requête n'atteint donc ces
 * droits — c'est vérifié par le banc, sur toutes les routes montées.
 *
 * ⚠️ **Elle ne verrouille personne et ne compte rien** : un 503 n'est pas un
 * échec d'authentification (voir `limiteur.ts`). Le rythme ne se limite que
 * lorsqu'il y a des identités à protéger, c'est-à-dire à partir du moment où
 * l'authentification réelle est branchée.
 */
export class AuthentificationProvisoire implements Authentificateur {
  public readonly provisoire = true;

  private readonly resolveur: ResolveurPerimetre;

  constructor(resolveur: ResolveurPerimetre) {
    this.resolveur = resolveur;
  }

  public async authentifier(_requete: FastifyRequest): Promise<SessionAppliquee> {
    // Aucune lecture de la requête : la ligne du dessus le dit, le paramètre
    // préfixé d'un souligné le prouve à la compilation.
    const perimetre = await this.resolveur.resoudre();
    return { perimetre, droits: DROITS_PROVISOIRES_DEVELOPPEMENT };
  }

  public decrire(): string {
    return (
      "aucune authentification : session provisoire du lot L2, droits complets, refusée hors " +
      `développement — ${this.resolveur.decrire()}`
    );
  }
}
