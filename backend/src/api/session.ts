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

import type { Pool } from 'pg';

import type { Configuration } from '../config/index.js';
import { avecTransaction, PERIMETRE_SYSTEME } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

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
