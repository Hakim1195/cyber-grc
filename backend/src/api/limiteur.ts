/**
 * Limitation du rythme des requêtes **non authentifiées**.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qu'elle protège, et ce qu'elle ne protège pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `PLAN_SERVEUR` §1.9 demande une « limitation du rythme des tentatives de
 * connexion, verrouillage temporaire ». La **route de connexion** appartient à
 * la couche d'authentification (lot L3, agent A1) : ce fichier ne la borne pas.
 *
 * Ce qu'il borne est l'autre moitié, celle qui vit au **point d'entrée de
 * l'API** : le martèlement d'un service de gouvernance par quelqu'un **qui n'a
 * pas de session**. C'est la condition d'entrée **E4** — la limitation de rythme
 * s'exerce en `onRequest`, avant l'analyse du corps — et c'est la moitié qui
 * décide du coût d'une requête hostile.
 *
 * ── Pourquoi seules les requêtes non authentifiées sont comptées ─────────
 *
 * Un utilisateur authentifié est **identifié, journalisé et borné par le pool**
 * de connexions ; le brider au point d'entrée ajouterait une panne possible
 * (dix personnes derrière la même passerelle VPN partagent une adresse) sans
 * rien fermer que le pool ne ferme déjà. Une requête sans session, elle, ne
 * coûte rien à émettre et n'est attribuable à personne : c'est celle-là qu'il
 * faut rendre chère.
 *
 * ⚠️ **Ce que cette classe n'est pas** : une protection contre un déni de
 * service distribué, ni contre une inondation venue de mille adresses. Elle
 * compte par adresse, et une adresse se change. Le §17.5 s'applique — *son
 * commentaire ne lui prête pas plus de portée qu'elle n'en a*. Ce qu'elle rend
 * impossible est précis : essayer mille fois, depuis un poste, de deviner ce que
 * le serveur veut bien répondre sans identité.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le compteur est lui-même borné
 * ════════════════════════════════════════════════════════════════════════
 *
 * Un registre indexé par adresse et sans plafond est **lui-même** un déni de
 * service : mille adresses forgées, mille entrées en mémoire (contrôle S13). Le
 * registre est donc plafonné, et une entrée est évincée avant d'être créée quand
 * le plafond est atteint. L'éviction retire les entrées **expirées** d'abord ;
 * s'il n'y en a pas, la plus ancienne cède — ce qui, dans le pire des cas,
 * relâche un attaquant : c'est le bon sens de la panne, un registre saturé ne
 * doit pas bloquer les autres appelants.
 */

/** Horloge injectable : un essai ne dort pas quinze minutes pour prouver l'expiration. */
export type Horloge = () => number;

export interface ReglagesLimiteur {
  /** Nombre de requêtes non authentifiées tolérées dans la fenêtre, par adresse. */
  readonly budget: number;
  /** Durée de la fenêtre et du verrouillage, en millisecondes. */
  readonly fenetreMs: number;
  /** Nombre maximal d'adresses suivies simultanément. */
  readonly adressesMax: number;
  readonly horloge?: Horloge;
}

interface Compteur {
  /** Refus non authentifiés observés dans la fenêtre courante. */
  refus: number;
  /** Fin de la fenêtre courante, en millisecondes. */
  expire: number;
  /** Fin du verrouillage, quand il est prononcé. */
  verrouilleJusqua: number;
}

/** Verdict rendu à `onRequest`. */
export interface VerdictRythme {
  readonly bloque: boolean;
  /** Secondes à attendre — rendues telles quelles dans l'en-tête `Retry-After`. */
  readonly attendreS: number;
}

const PASSE: VerdictRythme = Object.freeze({ bloque: false, attendreS: 0 });

export class LimiteurRythme {
  private readonly budget: number;
  private readonly fenetreMs: number;
  private readonly adressesMax: number;
  private readonly horloge: Horloge;
  private readonly compteurs = new Map<string, Compteur>();

  constructor(reglages: ReglagesLimiteur) {
    this.budget = Math.max(1, reglages.budget);
    this.fenetreMs = Math.max(1000, reglages.fenetreMs);
    this.adressesMax = Math.max(16, reglages.adressesMax);
    this.horloge = reglages.horloge ?? Date.now;
  }

  /**
   * L'adresse est-elle verrouillée ? **Ne consomme rien** : c'est un contrôle,
   * appelé avant toute autre chose dans `onRequest`, y compris avant de savoir
   * si la requête porte une session valide.
   */
  public verifier(adresse: string): VerdictRythme {
    const compteur = this.compteurs.get(adresse);
    if (compteur === undefined) return PASSE;
    const maintenant = this.horloge();

    if (compteur.verrouilleJusqua > maintenant) {
      return { bloque: true, attendreS: Math.ceil((compteur.verrouilleJusqua - maintenant) / 1000) };
    }
    // Fenêtre écoulée : l'entrée ne sert plus à rien, elle part.
    if (compteur.expire <= maintenant) this.compteurs.delete(adresse);
    return PASSE;
  }

  /**
   * Enregistre **un refus faute de session valide**. Rend le verdict qui en
   * résulte : le franchissement du budget verrouille immédiatement, et la
   * requête qui l'a franchi reçoit déjà le refus de rythme.
   *
   * ⚠️ Un 503 « le service ne peut pas répondre » **n'est pas** un échec
   * d'authentification et ne doit pas passer par ici : verrouiller un appelant
   * pour une indisponibilité du serveur, c'est punir quelqu'un de notre panne.
   */
  public enregistrerRefus(adresse: string): VerdictRythme {
    const maintenant = this.horloge();
    let compteur = this.compteurs.get(adresse);

    if (compteur === undefined || compteur.expire <= maintenant) {
      this.faireDeLaPlace(maintenant);
      compteur = { refus: 0, expire: maintenant + this.fenetreMs, verrouilleJusqua: 0 };
      this.compteurs.set(adresse, compteur);
    }

    compteur.refus += 1;
    if (compteur.refus >= this.budget) {
      compteur.verrouilleJusqua = maintenant + this.fenetreMs;
      return { bloque: true, attendreS: Math.ceil(this.fenetreMs / 1000) };
    }
    return PASSE;
  }

  /** Nombre d'adresses suivies. Sert aux essais et à une éventuelle sonde. */
  public taille(): number {
    return this.compteurs.size;
  }

  /** Vide le registre — recette et essais uniquement. */
  public oublierTout(): void {
    this.compteurs.clear();
  }

  private faireDeLaPlace(maintenant: number): void {
    if (this.compteurs.size < this.adressesMax) return;

    for (const [cle, compteur] of this.compteurs) {
      if (compteur.expire <= maintenant && compteur.verrouilleJusqua <= maintenant) {
        this.compteurs.delete(cle);
      }
    }
    // Toujours plein : la plus ancienne entrée cède. `Map` conserve l'ordre
    // d'insertion, la première est donc la plus ancienne.
    while (this.compteurs.size >= this.adressesMax) {
      const premiere = this.compteurs.keys().next();
      if (premiere.done === true) break;
      this.compteurs.delete(premiere.value);
    }
  }
}

/**
 * Refus de rythme, prêt à partir.
 *
 * Le message ne dit **ni le budget, ni le compte atteint** : les publier
 * apprendrait à l'appelant comment rester juste en dessous. Il dit la seule
 * chose utile — attendre — et l'en-tête `Retry-After` porte la durée, comme le
 * veut la norme HTTP.
 */
export function messageRefusRythme(): string {
  return (
    'Trop de tentatives depuis ce poste. Attendez quelques minutes avant de réessayer ; ' +
    'si le problème persiste, contactez votre exploitant.'
  );
}
