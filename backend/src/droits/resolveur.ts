/**
 * `ResolveurPerimetre`, implémentation réelle du lot L3 — **le seul endroit du
 * serveur où un périmètre se fabrique.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ Lire ceci avant de modifier une seule ligne de ce fichier
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `CONVENTIONS.md` §22, « ce que la vague 3 ne doit pas croire acquis », dit
 * précisément ceci :
 *
 *   > **Le périmètre vient du serveur** parce qu'aucun chemin ne le lit
 *   > ailleurs — vérifié à S2 sur six formes d'en-tête, le cookie, l'URL et le
 *   > corps. L3 introduit précisément la couche qui *fabrique* ce périmètre :
 *   > elle devient le seul endroit où l'erreur est possible, et le contrôle S2
 *   > de la grille doit être rejoué contre elle, pas contre les routes.
 *
 * C'est ce fichier. Voici les quatre propriétés qui tiennent la barrière, et
 * chacune est éprouvée par `test/droits/perimetre-serveur.test.mjs` :
 *
 *  1. **`resoudre()` ne prend aucun argument.** C'était déjà la signature de la
 *     session provisoire, et elle est conservée telle quelle. Il n'existe donc
 *     structurellement aucun paramètre par lequel un corps, une en-tête, une
 *     URL ou un cookie atteindrait `grc.filiales`.
 *  2. **Les valeurs du périmètre ne sont lues que dans la base.** `filiales`
 *     vient de `session_filiales`, `filialeId` de `sessions.filiale_active_id`,
 *     `perimetreGroupe` et `administrationGroupe` de `sessions.perimetre` et
 *     `sessions.administrateur`. Ces lignes ont été écrites par la transaction
 *     d'ouverture de session, depuis les groupes AD, et rien d'autre ne peut
 *     les écrire (migration `007`, condition E1).
 *  3. **La seule donnée venue du navigateur est un jeton opaque, et il ne sert
 *     qu'à RETROUVER une ligne.** Le jeton est haché ; l'empreinte est comparée
 *     à `sessions.jeton_empreinte`. Aucune de ses valeurs n'est *interprétée* :
 *     un jeton est une référence, jamais une revendication. C'est la
 *     différence, et elle est entière, entre un identifiant de session et un
 *     jeton porteur de revendications qu'il faudrait valider.
 *  4. **L'état est un instantané figé**, pris par la couche d'authentification
 *     au début de la requête et gelé (`Object.freeze`). Le résolveur ne
 *     recalcule rien et ne met rien en cache : il n'y a pas de fenêtre pendant
 *     laquelle un périmètre pourrait être modifié entre sa vérification et son
 *     emploi.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Condition E2 : le drapeau d'administration se décide ICI
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §22, ligne E2 : « le drapeau `grc.administration_groupe`
 * cesse d'être une déclaration que la session fait sur elle-même : le modèle à
 * trois axes décide du profil *Administration* et du périmètre *Groupe* **avant**
 * de le poser ».
 *
 * Il se décide donc dans `resoudre()`, et nulle part ailleurs :
 *
 *     administrationGroupe = session.administrateur ET session.perimetre = 'groupe'
 *
 * Les deux termes viennent de la base, écrits à l'ouverture de session depuis
 * `groupes_ad`. **Aucune route ne pose ce drapeau** : elle le reçoit dans le
 * périmètre, ou elle ne l'a pas.
 */

import type { PerimetreSession } from '../db/pool.js';

import type { DomaineFonctionnelBase, NiveauDroit, PorteeSession } from './modele.js';
import { suffit } from './modele.js';

/**
 * L'état d'une session, tel que la couche d'authentification vient de le lire
 * en base.
 *
 * ⚠️ **Ce type n'est jamais construit à partir d'une requête HTTP.** Il est
 * produit par `src/auth/sessions.ts`, à partir des lignes de `sessions`,
 * `session_filiales` et `session_domaines`. Le passer autrement — depuis un
 * corps analysé, par exemple — reviendrait à laisser le navigateur choisir son
 * périmètre, ce que la propriété 2 de l'entête interdit.
 */
export interface EtatSession {
  readonly sessionId: string;
  /** Le **login** de l'utilisateur (`CONVENTIONS.md` §18.3), pas sa clé primaire. */
  readonly login: string;
  readonly utilisateurId: string;
  readonly portee: PorteeSession;
  readonly filiales: readonly string[];
  readonly filialeActive: string | null;
  readonly administrateur: boolean;
  readonly peutExporter: boolean;
  readonly domaines: ReadonlyMap<DomaineFonctionnelBase, NiveauDroit>;
  readonly expireLe: Date;
  readonly derniereActivite: Date;
  /** Compte de secours applicatif, hors annuaire (`PLAN_SERVEUR` §0.3). */
  readonly compteSecours: boolean;
}

/**
 * Le résolveur d'une session ouverte.
 *
 * Une instance vaut **pour une requête** : la couche d'authentification en
 * fabrique une à partir de l'état qu'elle vient de vérifier, et la jette avec la
 * requête. Rien n'est mémorisé d'une requête à l'autre — une session révoquée
 * entre deux requêtes est refusée à la suivante, sans délai de cache.
 */
export class ResolveurPerimetreSession {
  /** Faux : c'est l'authentification réelle. Lu par `/api/session`. */
  public readonly provisoire = false;

  private readonly etat: EtatSession;
  private readonly perimetre: PerimetreSession;

  constructor(etat: EtatSession) {
    this.etat = etat;

    // ── Condition E2 : la décision se prend ici, et une seule fois ────────
    //
    // Le drapeau n'est PAS un privilège que la base arbitre (§17.4) : c'est une
    // déclaration que la session fait sur elle-même. Il n'a donc de valeur que
    // si une seule couche le pose, et si cette couche sait de quel droit elle
    // parle. Cette couche, c'est celle-ci : les deux termes de la conjonction
    // viennent de `sessions`, écrite depuis les groupes AD par la transaction
    // d'ouverture de session.
    const administrationGroupe = etat.administrateur && etat.portee === 'groupe';

    this.perimetre = Object.freeze({
      utilisateurId: etat.login,
      filialeId: etat.filialeActive,
      filiales: Object.freeze([...etat.filiales]) as readonly string[],
      perimetreGroupe: etat.portee === 'groupe',
      administrationGroupe,
    });
  }

  /**
   * Périmètre de la session courante. **Aucun argument** : voir l'entête,
   * propriété 1. Un appelant qui passerait quelque chose serait ignoré par la
   * signature comme par le corps.
   */
  public async resoudre(): Promise<PerimetreSession> {
    return await Promise.resolve(this.perimetre);
  }

  public decrire(): string {
    const axe =
      this.etat.portee === 'groupe'
        ? 'Groupe'
        : this.etat.portee === 'multi'
          ? `${this.etat.filiales.length} filiales`
          : 'une filiale';
    return (
      `session Active Directory de « ${this.etat.login} » — périmètre ${axe}, ` +
      `${this.etat.domaines.size} domaine(s) ouvert(s)` +
      (this.etat.peutExporter ? ', export autorisé' : ', sans droit d’export') +
      (this.etat.administrateur ? ', profil Administration' : '')
    );
  }

  /* ---- Les droits, pour le point d'entrée -------------------------- */

  /** Identifiant de la session. Sert au journal d'audit, jamais à décider. */
  public get sessionId(): string {
    return this.etat.sessionId;
  }

  /** Clé primaire du compte : c'est elle que `journal_audit` référence. */
  public get utilisateurId(): string {
    return this.etat.utilisateurId;
  }

  public get login(): string {
    return this.etat.login;
  }

  public get compteSecours(): boolean {
    return this.etat.compteSecours;
  }

  /** Niveau détenu sur un domaine. `aucun` par défaut — le défaut est fermé. */
  public niveauSur(domaine: DomaineFonctionnelBase): NiveauDroit {
    return this.etat.domaines.get(domaine) ?? 'aucun';
  }

  /** Le niveau détenu sur ce domaine atteint-il celui qu'on exige ? */
  public peut(domaine: DomaineFonctionnelBase, exige: NiveauDroit): boolean {
    return suffit(this.niveauSur(domaine), exige);
  }

  /**
   * **Droit d'export, distinct de la lecture** (`PLAN_SERVEUR` §3.3, contrôle
   * S7). Un accès Groupe en lecture ne l'accorde pas : il faut `GRC-EXPORT`.
   */
  public peutExporter(): boolean {
    return this.etat.peutExporter;
  }

  /** Tous les domaines ouverts, pour l'interface conditionnelle (A3). */
  public domainesOuverts(): ReadonlyMap<DomaineFonctionnelBase, NiveauDroit> {
    return this.etat.domaines;
  }

  /** L'état complet, en lecture seule. Réservé au journal et aux essais. */
  public etatSession(): EtatSession {
    return this.etat;
  }
}
