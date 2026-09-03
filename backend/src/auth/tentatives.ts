/**
 * Limitation du rythme des tentatives de connexion, et verrouillage temporaire
 * (contrôle **S11** : « martèlement de la connexion : verrouillage temporaire
 * effectif, échecs journalisés »).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier limite, et ce qu'il ne limite pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il y a **deux** limitations de rythme dans ce serveur, et les confondre serait
 * une erreur de conception :
 *
 *  · `src/api/limiteur.ts` (agent A2) borne le **rythme des requêtes HTTP**, en
 *    `onRequest`, avant l'analyse du corps — c'est la condition d'entrée **E4** ;
 *  · celui-ci borne les **tentatives d'authentification** : combien de fois un
 *    identifiant donné, ou une adresse donnée, peut présenter un mot de passe
 *    faux avant d'être écarté.
 *
 * Le second ne peut pas vivre en `onRequest` : il lui faut l'identifiant, qui
 * est **dans le corps**. Ce n'est pas une entorse à E4 — E4 borne ce qui se paie
 * *avant* de savoir qui parle ; ici, on sait.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Deux compteurs, parce qu'un seul laisse toujours une porte
 * ════════════════════════════════════════════════════════════════════════
 *
 * **En base**, sur `utilisateurs` (`tentatives_echouees`, `verrouille_jusqu_a`) :
 * c'est le verrouillage qui compte pour un compte connu. Il survit au
 * redémarrage du service, et un auditeur peut le lire.
 *
 * **En mémoire**, par identifiant et par adresse : c'est le seul filet contre le
 * balayage de logins **inconnus**, qui n'ont aucune ligne en base à incrémenter.
 * Sans lui, essayer dix mille logins inexistants ne coûterait rien — et c'est
 * exactement ce que fait une reconnaissance avant une attaque ciblée.
 *
 * Trois propriétés du compteur en mémoire, et la troisième est la plus facile à
 * oublier :
 *  1. il est **borné** (`ENTREES_MAX`) : sinon il devient lui-même le déni de
 *     service qu'il prétend éviter (contrôle S13) ;
 *  2. il **s'efface** au succès, pour l'identifiant comme pour l'adresse ;
 *  3. il ne compte **que les échecs d'authentification** — un 503 « annuaire
 *     injoignable » n'est pas un mot de passe faux, et verrouiller les comptes
 *     d'une entreprise entière parce qu'un contrôleur de domaine redémarre
 *     transformerait une panne en incident de sécurité.
 */

/** Nombre d'entrées suivies en mémoire. Au-delà, les plus anciennes s'effacent. */
const ENTREES_MAX = 20_000;

export type Horloge = () => number;

interface Compteur {
  echecs: number;
  /** Date (ms) jusqu'à laquelle la clé est écartée, ou 0. */
  bloqueJusqua: number;
  /** Dernier mouvement, pour l'éviction. */
  vu: number;
}

/** Verdict rendu avant de tenter quoi que ce soit. */
export interface VerdictTentative {
  readonly bloque: boolean;
  /** Secondes restantes, pour le journal technique. Jamais renvoyé au client. */
  readonly resteS: number;
  /** Ce qui bloque : un identifiant martelé, ou une adresse. */
  readonly cause: 'identifiant' | 'adresse' | null;
}

const PASSE: VerdictTentative = Object.freeze({ bloque: false, resteS: 0, cause: null });

export interface ReglagesTentatives {
  /** `AUTH_MAX_TENTATIVES`. */
  readonly maxTentatives: number;
  /** `AUTH_DUREE_VERROUILLAGE`, en minutes. */
  readonly dureeVerrouillageMinutes: number;
  /**
   * Multiplicateur appliqué au compteur d'ADRESSE. Une adresse porte
   * légitimement plusieurs personnes — un poste partagé, un relais, le pare-feu
   * du site : la borner comme un compte unique bloquerait un étage entier au
   * cinquième mot de passe faux de la journée.
   */
  readonly facteurAdresse?: number;
}

export class LimiteurTentatives {
  private readonly reglages: Required<ReglagesTentatives>;
  private readonly horloge: Horloge;
  private readonly parIdentifiant = new Map<string, Compteur>();
  private readonly parAdresse = new Map<string, Compteur>();

  constructor(reglages: ReglagesTentatives, horloge: Horloge = Date.now) {
    this.reglages = {
      maxTentatives: reglages.maxTentatives,
      dureeVerrouillageMinutes: reglages.dureeVerrouillageMinutes,
      facteurAdresse: reglages.facteurAdresse ?? 4,
    };
    this.horloge = horloge;
  }

  /**
   * L'identifiant, ou l'adresse, est-il écarté en ce moment ?
   *
   * ⚠️ Le verdict ne dit **jamais** au client lequel des deux : « votre compte
   * est verrouillé » apprend à un attaquant que le compte existe (contrôle S12).
   * Le champ `cause` est destiné au journal technique.
   */
  public verifier(identifiant: string, adresse: string | null): VerdictTentative {
    const maintenant = this.horloge();

    const surIdentifiant = this.parIdentifiant.get(cle(identifiant));
    if (surIdentifiant !== undefined && surIdentifiant.bloqueJusqua > maintenant) {
      return {
        bloque: true,
        resteS: Math.ceil((surIdentifiant.bloqueJusqua - maintenant) / 1000),
        cause: 'identifiant',
      };
    }

    if (adresse !== null) {
      const surAdresse = this.parAdresse.get(adresse);
      if (surAdresse !== undefined && surAdresse.bloqueJusqua > maintenant) {
        return {
          bloque: true,
          resteS: Math.ceil((surAdresse.bloqueJusqua - maintenant) / 1000),
          cause: 'adresse',
        };
      }
    }

    return PASSE;
  }

  /** Un échec d'AUTHENTIFICATION. Ni un 503, ni un refus de droit. */
  public echec(identifiant: string, adresse: string | null): void {
    this.incrementer(this.parIdentifiant, cle(identifiant), this.reglages.maxTentatives);
    if (adresse !== null) {
      this.incrementer(
        this.parAdresse,
        adresse,
        this.reglages.maxTentatives * this.reglages.facteurAdresse,
      );
    }
  }

  /** Une authentification réussie efface les deux compteurs. */
  public succes(identifiant: string, adresse: string | null): void {
    this.parIdentifiant.delete(cle(identifiant));
    if (adresse !== null) this.parAdresse.delete(adresse);
  }

  /** Compteurs suivis. Pour le journal d'exploitation et les essais. */
  public taille(): { identifiants: number; adresses: number } {
    return { identifiants: this.parIdentifiant.size, adresses: this.parAdresse.size };
  }

  private incrementer(table: Map<string, Compteur>, clef: string, seuil: number): void {
    const maintenant = this.horloge();
    this.evincer(table, maintenant);

    const compteur = table.get(clef) ?? { echecs: 0, bloqueJusqua: 0, vu: maintenant };
    compteur.echecs += 1;
    compteur.vu = maintenant;
    if (compteur.echecs >= seuil) {
      compteur.bloqueJusqua = maintenant + this.reglages.dureeVerrouillageMinutes * 60_000;
      compteur.echecs = 0;
    }
    table.set(clef, compteur);
  }

  /**
   * Écarte ce qui a expiré, puis, si la table déborde encore, les entrées vues
   * le plus anciennement. Une table de compteurs sans borne est un vecteur de
   * saturation mémoire — le remède devenu le mal (S13).
   */
  private evincer(table: Map<string, Compteur>, maintenant: number): void {
    if (table.size < ENTREES_MAX) return;

    for (const [clef, compteur] of table) {
      if (compteur.bloqueJusqua <= maintenant && maintenant - compteur.vu > 3_600_000) {
        table.delete(clef);
      }
    }
    if (table.size < ENTREES_MAX) return;

    const parAnciennete = [...table.entries()].sort((a, b) => a[1].vu - b[1].vu);
    for (const [clef] of parAnciennete.slice(0, Math.ceil(ENTREES_MAX / 10))) table.delete(clef);
  }
}

/** Les identifiants sont insensibles à la casse, comme l'annuaire. */
function cle(identifiant: string): string {
  return identifiant.trim().toLowerCase();
}
