/**
 * Client LDAP v3 minimal — liaison simple et recherche, sur LDAPS de préférence.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qu'il fait, et les quatre bornes qu'il pose
 * ════════════════════════════════════════════════════════════════════════
 *
 * Trois opérations : `lier` (BindRequest, authentification simple), `rechercher`
 * (SearchRequest) et `fermer` (UnbindRequest puis fermeture). C'est tout ce dont
 * l'authentification a besoin (`PLAN_SERVEUR` §1.5).
 *
 * Un annuaire est un **tiers** : il peut être lent, bavard, ou hostile. Quatre
 * bornes, qui répondent une à une aux pannes du contrat de doublure (`CONVENTIONS`
 * §25.2, comportement D5) et au contrôle S13 :
 *
 *  1. **Délai de garde par opération** (`LDAP_DELAI`) : au-delà, la socket est
 *     détruite et l'opération refusée. Un annuaire qui ne répond pas n'ouvre pas
 *     de session — il ne fait pas non plus attendre indéfiniment une requête HTTP.
 *  2. **Borne d'octets reçus** : au-delà de `OCTETS_MAX`, la connexion est
 *     rompue. Sans elle, un annuaire compromis épuiserait la mémoire du service.
 *  3. **Borne d'entrées** par recherche, doublée du `sizeLimit` du protocole :
 *     la borne de protocole est une politesse que le serveur peut ignorer, celle
 *     du client ne l'est pas.
 *  4. **Réponse tronquée = erreur**, jamais un résultat partiel. Une recherche
 *     dont la fin n'arrive pas ne rend pas les entrées déjà reçues : l'appelant
 *     en déduirait une appartenance de groupe incomplète, donc un périmètre
 *     faux — silencieusement.
 *
 * ⚠️ **Ce module ne décide de rien.** Il ne connaît ni les groupes `GRC-`, ni les
 * profils, ni les sessions. Il transporte. La décision est dans `annuaire.ts` et
 * `src/droits/`.
 */

import { readFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';

import {
  booleen,
  chaine,
  element,
  entier,
  enumeration,
  ETIQUETTE,
  lireElement,
  lireEnfants,
  sequence,
  valeurEntiere,
  valeurTexte,
} from './ber.js';
import type { ElementBer } from './ber.js';
import { encoderFiltre } from './filtre-ldap.js';

/* =====================================================================
 *  Constantes du protocole
 * ===================================================================== */

const OPERATION = Object.freeze({
  demandeLiaison: 0x60,
  reponseLiaison: 0x61,
  demandeDeliaison: 0x42,
  demandeRecherche: 0x63,
  entreeRecherche: 0x64,
  finRecherche: 0x65,
  renvoiRecherche: 0x73,
  authentificationSimple: 0x80,
});

/** Codes de résultat LDAP employés ici (RFC 4511 §4.1.9). */
export const RESULTAT = Object.freeze({
  succes: 0,
  limiteTailleAtteinte: 4,
  renvoi: 10,
  objetInexistant: 32,
  identifiantsInvalides: 49,
});

/** Portée d'une recherche. */
export type PorteeRecherche = 'base' | 'unNiveau' | 'sousArbre';
const CODE_PORTEE: Readonly<Record<PorteeRecherche, number>> = Object.freeze({
  base: 0,
  unNiveau: 1,
  sousArbre: 2,
});

/** Borne d'octets acceptés d'un annuaire sur une connexion (contrôle S13). */
const OCTETS_MAX = 8 * 1024 * 1024;

/* =====================================================================
 *  Erreurs
 * ===================================================================== */

/** L'annuaire n'a pas répondu, ou a mal répondu. Jamais la faute de l'utilisateur. */
export class ErreurAnnuaire extends Error {
  public readonly nomErreur = 'ErreurAnnuaire';
  /** Détail technique : va au journal du serveur, jamais au navigateur (S12). */
  public readonly detailJournal: string;
  constructor(detailJournal: string) {
    super("l'annuaire est injoignable ou a répondu de façon inattendue");
    this.name = 'ErreurAnnuaire';
    this.detailJournal = detailJournal;
  }
}

/**
 * Les identifiants présentés sont refusés par l'annuaire (code 49).
 *
 * Distinguée d'`ErreurAnnuaire` **dans le code**, jamais dans la réponse : le
 * message rendu à l'utilisateur est le même dans les deux cas (contrôle S12).
 */
export class ErreurIdentifiants extends Error {
  public readonly nomErreur = 'ErreurIdentifiants';
  constructor(message = 'identifiants refusés par l’annuaire') {
    super(message);
    this.name = 'ErreurIdentifiants';
  }
}

/* =====================================================================
 *  Types publics
 * ===================================================================== */

export interface OptionsClientLdap {
  readonly url: string;
  /** Chemin du fichier d'autorité de certification, ou `null`. */
  readonly ca: string | null;
  readonly verifierCertificat: boolean;
  readonly delaiMs: number;
}

export interface EntreeLdap {
  readonly dn: string;
  /** Attributs, en minuscules, chacun multivalué (LDAP l'est toujours). */
  readonly attributs: ReadonlyMap<string, readonly string[]>;
  /**
   * Les mêmes valeurs, **non décodées**. Certains attributs d'Active Directory
   * sont binaires — `objectSid` au premier chef, qui est l'identifiant stable
   * d'un compte (001_socle.sql §6). Les lire en UTF-8 les mutilerait
   * silencieusement, et un identifiant mutilé mais unique passerait tous les
   * contrôles.
   */
  readonly attributsBruts: ReadonlyMap<string, readonly Buffer[]>;
}

export interface OptionsRecherche {
  readonly base: string;
  readonly portee: PorteeRecherche;
  /** Filtre textuel **déjà substitué et échappé** (voir `filtre-ldap.ts`). */
  readonly filtre: string;
  readonly attributs: readonly string[];
  /** Borne du client, doublant le `sizeLimit` du protocole. */
  readonly tailleMax: number;
}

/** Ce que le client sait faire — l'interface que la couche annuaire consomme. */
export interface Annuaire {
  lier(dn: string, motDePasse: string): Promise<void>;
  rechercher(options: OptionsRecherche): Promise<readonly EntreeLdap[]>;
  fermer(): Promise<void>;
}

/* =====================================================================
 *  Le client
 * ===================================================================== */

interface AttenteReponse {
  readonly resoudre: (elements: readonly ElementBer[]) => void;
  readonly rejeter: (erreur: Error) => void;
  readonly recues: ElementBer[];
  /** Étiquette de l'opération qui clôt l'échange. */
  readonly etiquetteFin: number;
}

export class ClientLdap implements Annuaire {
  private readonly socket: net.Socket;
  private readonly delaiMs: number;
  private readonly attentes = new Map<number, AttenteReponse>();

  private tampon: Buffer = Buffer.alloc(0);
  private octetsRecus = 0;
  private prochainId = 1;
  private rompu: Error | null = null;

  private constructor(socket: net.Socket, delaiMs: number) {
    this.socket = socket;
    this.delaiMs = delaiMs;

    socket.on('data', (morceau: Buffer) => this.recevoir(morceau));
    socket.on('error', (erreur: Error) =>
      this.rompre(new ErreurAnnuaire(`socket : ${erreur.message}`)),
    );
    socket.on('close', () =>
      this.rompre(
        new ErreurAnnuaire('la connexion à l’annuaire s’est fermée avant la fin de l’échange'),
      ),
    );
  }

  /* ---- Connexion ---------------------------------------------------- */

  public static async connecter(options: OptionsClientLdap): Promise<ClientLdap> {
    const url = new URL(options.url);
    const chiffre = url.protocol === 'ldaps:';
    const hote = url.hostname;
    const port = url.port === '' ? (chiffre ? 636 : 389) : Number.parseInt(url.port, 10);

    const socket = await new Promise<net.Socket>((resoudre, rejeter) => {
      const minuteur = setTimeout(() => {
        rejeter(
          new ErreurAnnuaire(
            `délai de connexion dépassé (${options.delaiMs} ms) vers ${hote}:${port}`,
          ),
        );
      }, options.delaiMs);

      const surEchec = (erreur: Error): void => {
        clearTimeout(minuteur);
        rejeter(new ErreurAnnuaire(`connexion à ${hote}:${port} : ${erreur.message}`));
      };

      if (chiffre) {
        const parametres: tls.ConnectionOptions = {
          host: hote,
          port,
          servername: hote,
          rejectUnauthorized: options.verifierCertificat,
        };
        if (options.ca !== null) parametres.ca = readFileSync(options.ca, 'utf8');

        const brut = tls.connect(parametres, () => {
          clearTimeout(minuteur);
          brut.removeListener('error', surEchec);
          resoudre(brut);
        });
        brut.once('error', surEchec);
      } else {
        const brut = net.connect({ host: hote, port }, () => {
          clearTimeout(minuteur);
          brut.removeListener('error', surEchec);
          resoudre(brut);
        });
        brut.once('error', surEchec);
      }
    });

    socket.setNoDelay(true);
    return new ClientLdap(socket, options.delaiMs);
  }

  /* ---- Opérations --------------------------------------------------- */

  /**
   * Liaison simple. Un mot de passe vide est refusé **ici** et non par
   * l'annuaire : la RFC 4513 §5.1.2 en fait une liaison ANONYME qui réussit,
   * ce qui ferait d'un mot de passe vide un moyen d'authentification.
   */
  public async lier(dn: string, motDePasse: string): Promise<void> {
    if (dn.trim() === '' || motDePasse === '') {
      throw new ErreurIdentifiants(
        'nom distinctif ou mot de passe vide : une liaison anonyme n’authentifie personne',
      );
    }

    const corps = element(
      OPERATION.demandeLiaison,
      Buffer.concat([
        entier(3),
        chaine(dn),
        element(OPERATION.authentificationSimple, Buffer.from(motDePasse, 'utf8')),
      ]),
    );

    const reponses = await this.echanger(corps, OPERATION.reponseLiaison);
    const derniere = reponses[reponses.length - 1];
    if (derniere === undefined) throw new ErreurAnnuaire('réponse de liaison absente');

    const code = this.lireCodeResultat(derniere);
    if (code === RESULTAT.identifiantsInvalides) throw new ErreurIdentifiants();
    if (code !== RESULTAT.succes) {
      throw new ErreurAnnuaire(`liaison refusée par l’annuaire, code de résultat ${code}`);
    }
  }

  public async rechercher(options: OptionsRecherche): Promise<readonly EntreeLdap[]> {
    const corps = element(
      OPERATION.demandeRecherche,
      Buffer.concat([
        chaine(options.base),
        enumeration(CODE_PORTEE[options.portee]),
        enumeration(0), // neverDerefAliases
        entier(options.tailleMax),
        entier(Math.max(1, Math.ceil(this.delaiMs / 1000))),
        booleen(false), // typesOnly
        encoderFiltre(options.filtre),
        element(
          ETIQUETTE.sequence,
          Buffer.concat(options.attributs.map((a) => chaine(a))),
        ),
      ]),
    );

    const reponses = await this.echanger(corps, OPERATION.finRecherche, options.tailleMax);
    const entrees: EntreeLdap[] = [];

    for (const reponse of reponses) {
      if (reponse.etiquette === OPERATION.entreeRecherche) {
        entrees.push(this.lireEntree(reponse));
        continue;
      }
      if (reponse.etiquette === OPERATION.renvoiRecherche) {
        // Un renvoi désigne un autre annuaire. On ne le suit PAS : suivre un renvoi,
        // c'est laisser l'annuaire choisir à qui le service présente le compte de
        // service. Il est ignoré, et l'absence de résultat sera traitée comme telle.
        continue;
      }
      if (reponse.etiquette === OPERATION.finRecherche) {
        const code = this.lireCodeResultat(reponse);
        if (code === RESULTAT.objetInexistant) return [];
        // La limite de taille atteinte n'est pas une erreur : c'est la borne demandée.
        if (code !== RESULTAT.succes && code !== RESULTAT.limiteTailleAtteinte) {
          throw new ErreurAnnuaire(`recherche refusée par l’annuaire, code de résultat ${code}`);
        }
      }
    }

    return entrees;
  }

  public async fermer(): Promise<void> {
    if (this.rompu === null) {
      try {
        this.socket.write(
          sequence(entier(this.prochainId++), element(OPERATION.demandeDeliaison, Buffer.alloc(0))),
        );
      } catch {
        // La socket est déjà partie : il n'y a rien à saluer.
      }
    }
    this.rompu ??= new ErreurAnnuaire('connexion fermée par le client');
    this.socket.destroy();
    await Promise.resolve();
  }

  /* ---- Mécanique ---------------------------------------------------- */

  private async echanger(
    corps: Buffer,
    etiquetteFin: number,
    tailleMax = 1,
  ): Promise<readonly ElementBer[]> {
    if (this.rompu !== null) throw this.rompu;

    const id = this.prochainId++;
    const message = sequence(entier(id), corps);

    return new Promise<readonly ElementBer[]>((resoudre, rejeter) => {
      const minuteur = setTimeout(() => {
        this.attentes.delete(id);
        this.rompre(
          new ErreurAnnuaire(`l’annuaire n’a pas répondu dans le délai de ${this.delaiMs} ms`),
        );
      }, this.delaiMs);

      this.attentes.set(id, {
        etiquetteFin,
        recues: [],
        resoudre: (elements) => {
          clearTimeout(minuteur);
          resoudre(elements);
        },
        rejeter: (erreur) => {
          clearTimeout(minuteur);
          rejeter(erreur);
        },
      });

      // La borne d'entrées du client : elle double celle du protocole, qu'un serveur
      // peut ignorer. Retenue ici pour le contrôle de dépassement dans `recevoir`.
      this.plafondsParId.set(id, tailleMax);

      try {
        this.socket.write(message);
      } catch (erreur) {
        this.attentes.delete(id);
        clearTimeout(minuteur);
        rejeter(
          new ErreurAnnuaire(
            `écriture vers l’annuaire : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
          ),
        );
      }
    });
  }

  private readonly plafondsParId = new Map<number, number>();

  private recevoir(morceau: Buffer): void {
    this.octetsRecus += morceau.length;
    if (this.octetsRecus > OCTETS_MAX) {
      this.rompre(
        new ErreurAnnuaire(
          `l’annuaire a envoyé plus de ${OCTETS_MAX} octets sur une connexion : rupture (S13)`,
        ),
      );
      return;
    }

    this.tampon = this.tampon.length === 0 ? morceau : Buffer.concat([this.tampon, morceau]);

    for (;;) {
      let message: ElementBer | null;
      try {
        message = lireElement(this.tampon, 0);
      } catch (erreur) {
        this.rompre(
          new ErreurAnnuaire(
            `flux LDAP illisible : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
          ),
        );
        return;
      }
      if (message === null) return; // message incomplet : on attend la suite
      this.tampon = this.tampon.subarray(message.fin);

      try {
        this.distribuer(message);
      } catch (erreur) {
        this.rompre(
          erreur instanceof Error ? erreur : new ErreurAnnuaire('réponse LDAP inexploitable'),
        );
        return;
      }
    }
  }

  private distribuer(message: ElementBer): void {
    if (message.etiquette !== ETIQUETTE.sequence) {
      throw new ErreurAnnuaire('message LDAP qui n’est pas une séquence');
    }
    const enfants = lireEnfants(message.contenu);
    const identifiant = enfants[0];
    const operation = enfants[1];
    if (identifiant === undefined || operation === undefined) {
      throw new ErreurAnnuaire('message LDAP sans identifiant ou sans opération');
    }

    const id = valeurEntiere(identifiant);
    const attente = this.attentes.get(id);
    if (attente === undefined) return; // réponse à une opération abandonnée : ignorée

    attente.recues.push(operation);

    const plafond = this.plafondsParId.get(id) ?? 1;
    if (attente.recues.length > plafond + 8) {
      this.attentes.delete(id);
      this.plafondsParId.delete(id);
      attente.rejeter(
        new ErreurAnnuaire(
          `l’annuaire a renvoyé plus de ${plafond} entrées malgré la borne demandée`,
        ),
      );
      return;
    }

    if (operation.etiquette === attente.etiquetteFin) {
      this.attentes.delete(id);
      this.plafondsParId.delete(id);
      attente.resoudre(attente.recues);
    }
  }

  private rompre(erreur: Error): void {
    if (this.rompu !== null) return;
    this.rompu = erreur;
    for (const [id, attente] of this.attentes) {
      this.attentes.delete(id);
      this.plafondsParId.delete(id);
      attente.rejeter(erreur);
    }
    this.socket.destroy();
  }

  private lireCodeResultat(reponse: ElementBer): number {
    const champs = lireEnfants(reponse.contenu);
    const code = champs[0];
    if (code === undefined) throw new ErreurAnnuaire('résultat LDAP sans code');
    return valeurEntiere(code);
  }

  private lireEntree(reponse: ElementBer): EntreeLdap {
    const champs = lireEnfants(reponse.contenu);
    const nom = champs[0];
    const liste = champs[1];
    if (nom === undefined) throw new ErreurAnnuaire('entrée LDAP sans nom distinctif');

    const attributs = new Map<string, string[]>();
    const bruts = new Map<string, Buffer[]>();
    if (liste !== undefined) {
      for (const attribut of lireEnfants(liste.contenu)) {
        const parties = lireEnfants(attribut.contenu);
        const type = parties[0];
        const valeurs = parties[1];
        if (type === undefined) continue;
        const cle = valeurTexte(type).toLowerCase();
        const elements = valeurs === undefined ? [] : lireEnfants(valeurs.contenu);
        attributs.set(cle, [...(attributs.get(cle) ?? []), ...elements.map(valeurTexte)]);
        bruts.set(cle, [
          ...(bruts.get(cle) ?? []),
          ...elements.map((e) => Buffer.from(e.contenu)),
        ]);
      }
    }

    return { dn: valeurTexte(nom), attributs, attributsBruts: bruts };
  }
}
