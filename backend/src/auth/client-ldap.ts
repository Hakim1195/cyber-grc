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

/**
 * Un `SearchResultReference` désigne-t-il quelque chose que cette recherche
 * cherchait — ou un ailleurs qui ne la concerne pas ? Constat **Q-83**.
 *
 * ── Ce que la mesure contre un VRAI Active Directory a montré ──────────────
 *
 * Ce client refusait **toute** réponse portant un `SearchResultReference`, au
 * motif — juste en soi — qu'une réponse amputée annoncée comme un succès est
 * pire qu'un refus. Éprouvé le 03/09/2026 contre un contrôleur de domaine Samba
 * réel, ce refus s'est révélé **total** : aucune connexion n'aboutissait.
 *
 *     réponse TRONQUÉE de l'annuaire : un renvoi (SearchResultReference) non
 *     suivi. 1 entrée(s) reçue(s) pour une borne de 2, filtre
 *     « (&(objectClass=user)(sAMAccountName=rssi.tls)) » sous
 *     « DC=exemple,DC=interne »
 *
 * L'entrée cherchée **était là**. Ce qui accompagnait la réponse, ce sont les
 * *continuation references* qu'Active Directory émet sur toute recherche en
 * sous-arbre depuis la racine du domaine, vers les contextes de nommage qui ne
 * portent aucun compte : `CN=Configuration,…`, `DC=DomainDnsZones,…`,
 * `DC=ForestDnsZones,…`. Tout AD le fait, toujours. Le produit était donc
 * inutilisable contre l'annuaire qu'il existe pour interroger.
 *
 * C'est le constat **Q-69** — *« le détecteur de renvoi est écrit, lu, et mordu
 * par rien »* — mordu enfin, par le réel, et pris en défaut. Aucune doublure
 * n'aurait pu le montrer : elle n'émet que ce que son auteur a prévu.
 *
 * ── L'arbitrage, qui ne rend pas la barrière plus faible ───────────────────
 *
 * La propriété qu'on veut garder est *« une réponse amputée ne passe pas pour
 * complète »*. Elle ne dit rien sur les renvois en général — elle dit quelque
 * chose sur **ce qui manque à CETTE recherche**. Le discriminant est donc :
 *
 *   · un renvoi dont le DN cible est **sous la base de recherche** désigne une
 *     branche que l'on interrogeait et qu'on n'a pas lue → **troncature**, refus,
 *     exactement comme avant ;
 *   · un renvoi vers un **autre contexte de nommage** ne retire rien de ce qui
 *     était demandé → il est **consigné** et n'arrête rien.
 *
 * Un renvoi qu'on ne sait pas lire — URI vide, DN absent, forme inattendue — est
 * traité comme s'il était dans le périmètre. Le doute reste du côté du refus.
 */
export function renvoiHorsPerimetre(
  uri: string,
  base: string,
  contextes: readonly string[],
): boolean {
  const dnCible = dnDeUriLdap(uri);
  if (dnCible === null) return false; // illisible → on refuse, comme avant
  const cible = normaliserDn(dnCible);
  const racine = normaliserDn(base);
  if (racine === '') return false;

  // ⚠️ **Comparer les DN NE SUFFIT PAS, et c'est la première correction de ce
  // correctif — mesurée, pas raisonnée.** `CN=Configuration,DC=exemple,DC=interne`
  // *est* syntaxiquement sous `DC=exemple,DC=interne` : une comparaison de
  // suffixe le range donc « dans le périmètre », et le refus restait entier. La
  // hiérarchie des DN et le découpage en contextes de nommage sont deux choses
  // différentes, et c'est le second qui décide.
  //
  // On demande donc au serveur ses contextes (`namingContexts` du RootDSE) au
  // lieu d'écrire la liste `CN=Configuration` / `DomainDnsZones` /
  // `ForestDnsZones` à la main : une forêt qui en porte d'autres serait sinon
  // refusée en silence — c'est la règle « on découvre dans le catalogue » du
  // CLAUDE.md, appliquée ici à l'annuaire.
  for (const contexte of contextes) {
    const nc = normaliserDn(contexte);
    if (nc === '' || nc === racine) continue; // le NC interrogé lui-même
    if (cible === nc || cible.endsWith(`,${nc}`)) return true;
  }
  return false;
}

/** Le DN d'une URL LDAP (`ldap://hôte/<DN>?attrs?portée?filtre`), ou `null`. */
function dnDeUriLdap(uri: string): string | null {
  const sansSchema = uri.replace(/^ldaps?:\/\//i, '');
  const barre = sansSchema.indexOf('/');
  if (barre === -1) return null;
  const apres = sansSchema.slice(barre + 1);
  const dn = apres.split('?')[0] ?? '';
  let decode = dn;
  try {
    decode = decodeURIComponent(dn);
  } catch {
    /* URI mal encodée : on compare ce qu'on a plutôt que de perdre l'information */
  }
  return decode.trim() === '' ? null : decode;
}

/** Comparaison de DN sans prétention : casse et espaces autour des virgules. */
function normaliserDn(dn: string): string {
  return dn
    .split(',')
    .map((p) => p.trim())
    .join(',')
    .toLowerCase();
}

export interface OptionsRecherche {
  readonly base: string;
  readonly portee: PorteeRecherche;
  /** Filtre textuel **déjà substitué et échappé** (voir `filtre-ldap.ts`). */
  readonly filtre: string;
  readonly attributs: readonly string[];
  /** Borne du client, doublant le `sizeLimit` du protocole. */
  readonly tailleMax: number;
  /**
   * La borne atteinte doit-elle être tenue pour une TRONCATURE ?
   *
   * Seul l'appelant sait ce que sa borne signifie, et les deux cas existent :
   *  · une borne qui est un **filet de sécurité** — « au plus 250 groupes » — est
   *    atteinte uniquement si quelque chose déborde : `true` ;
   *  · une borne qui est une **attente** — « au plus 2 entrées, la seconde signalant
   *    un doublon » — est atteinte normalement : `false`, et c'est l'appelant qui
   *    interprète.
   *
   * Le détecteur principal, lui, ne dépend pas de ce drapeau : `sizeLimitExceeded`
   * et tout renvoi font échouer la recherche dans tous les cas.
   */
  readonly bornePleineEstTroncature?: boolean;
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
    const renvoisRecus: string[] = [];

    for (const reponse of reponses) {
      if (reponse.etiquette === OPERATION.entreeRecherche) {
        entrees.push(this.lireEntree(reponse));
        continue;
      }
      if (reponse.etiquette === OPERATION.renvoiRecherche) {
        // Un renvoi désigne une PARTIE DE LA RÉPONSE qui vit ailleurs. On ne le suit
        // pas — suivre un renvoi, c'est laisser l'annuaire choisir à qui le service
        // présente son compte. Reste à savoir si ce qui vit ailleurs faisait
        // partie de ce qu'on cherchait : voir `renvoiHorsPerimetre()`.
        // On COLLECTE ici et l'on classe après la boucle : classer exige les
        // contextes de nommage du serveur, qui se demandent par une recherche —
        // impossible au milieu du dépouillement de celle-ci.
        renvoisRecus.push(...this.lireRenvois(reponse));
        continue;
      }
      if (reponse.etiquette === OPERATION.finRecherche) {
        const code = this.lireCodeResultat(reponse);
        if (code === RESULTAT.objetInexistant) return [];
        if (code === RESULTAT.limiteTailleAtteinte) {
          throw this.troncature(options, entrees.length, 'sizeLimitExceeded (code 4)');
        }
        if (code !== RESULTAT.succes) {
          throw new ErreurAnnuaire(`recherche refusée par l’annuaire, code de résultat ${code}`);
        }
      }
    }

    if (renvoisRecus.length > 0) {
      const contextes = await this.contextesDeNommage();
      const dedans = renvoisRecus.filter((uri) => !renvoiHorsPerimetre(uri, options.base, contextes));
      if (dedans.length > 0) {
        throw this.troncature(
          options,
          entrees.length,
          `un renvoi (SearchResultReference) non suivi vers « ${dedans[0]} »`,
        );
      }
      // Les renvois écartés sont EXPOSÉS, jamais tus : `derniersRenvoisEcartes` est
      // lu par le banc, qui exige de pouvoir NOMMER ce qui a été ignoré. Un
      // écartement muet redeviendrait ce que ce constat reproche à l'ancienne
      // version — une décision invisible sur ce qui compose la réponse.
      this.derniersRenvoisEcartes = renvoisRecus;
    } else {
      this.derniersRenvoisEcartes = [];
    }
    if (options.bornePleineEstTroncature === true && entrees.length >= options.tailleMax) {
      throw this.troncature(options, entrees.length, `la borne de ${options.tailleMax} atteinte`);
    }

    return entrees;
  }

  /**
   * Une réponse incomplète est une ERREUR, jamais un résultat.
   *
   * ── Le défaut que ce refus ferme (constat Q-68) ─────────────────────────
   *
   * Active Directory plafonne une recherche à 1 000 entrées (`MaxPageSize`). Une
   * liste de groupes tronquée **ne lève rien** : elle rend simplement MOINS de
   * groupes, donc MOINS de droits. Un RSSI perd son accès, aucune ligne de journal
   * ne l'explique, et le banc reste vert. C'est la forme exacte du défaut que ce
   * chantier traque — quelque chose réussit en silence alors que c'est faux.
   *
   * Un refus bruyant est récupérable : l'exploitant lit le plafond et le filtre dans
   * le message, et pagine ou resserre la recherche. Une autorisation silencieusement
   * rabotée ne l'est pas — personne ne sait qu'il faut la récupérer.
   *
   * ⚠️ **Ce que ce refus n'est pas** : la pagination. Le client ne sait pas demander
   * de page suivante (contrôle `1.2.840.113556.1.4.319`, non implémenté). Il sait
   * seulement DIRE qu'il n'a pas tout reçu, ce qui est la moitié qui protège.
   */
  private troncature(
    options: OptionsRecherche,
    recues: number,
    cause: string,
  ): ErreurAnnuaire {
    return new ErreurAnnuaire(
      `réponse TRONQUÉE de l’annuaire : ${cause}. ${recues} entrée(s) reçue(s) pour une borne ` +
        `de ${options.tailleMax}, filtre « ${options.filtre} » sous « ${options.base} ». ` +
        'La liste est refusée plutôt que rendue amputée : une appartenance de groupe ' +
        'incomplète retirerait des droits en silence (constat Q-68).',
    );
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
        // ⚠️ NE PAS retirer l'attente avant `rompre()` : c'est `rompre()` qui rejette
        // les promesses en cours, en parcourant `this.attentes`. La retirer d'abord la
        // soustrait à ce parcours, et la promesse de CETTE opération n'est alors jamais
        // rejetée — l'appel reste suspendu pour toujours. Mesuré : le banc de la panne
        // « réponse lente » (comportement D5) ne rendait jamais la main, alors même que
        // le délai de garde se déclenchait bien.
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

  /**
   * Les URL d'un `SearchResultReference` : `[APPLICATION 19] SEQUENCE OF LDAPURL`,
   * chaque URL étant une chaîne d'octets. Un renvoi sans URL lisible rend une
   * liste contenant une chaîne vide — et non une liste vide — pour que
   * `renvoiHorsPerimetre()` le traite comme illisible, donc comme un refus.
   */
  /**
   * Les renvois écartés par la dernière recherche, hors du périmètre interrogé.
   * Vide quand il n'y en a pas eu. Exposé pour que le banc puisse **nommer** ce
   * qui a été ignoré : une décision sur la complétude d'une réponse ne doit pas
   * être invisible (constat Q-83).
   */
  public derniersRenvoisEcartes: readonly string[] = [];

  /**
   * Les contextes de nommage du serveur, demandés au RootDSE et gardés en cache
   * pour la durée de la connexion.
   *
   * Demandés, jamais devinés : écrire à la main `CN=Configuration`,
   * `DC=DomainDnsZones` et `DC=ForestDnsZones` marcherait sur l'annuaire d'à
   * côté et se tairait sur celui du client, dont la forêt en porte peut-être
   * d'autres. C'est la règle du dépôt — *on découvre dans le catalogue* —
   * appliquée à l'annuaire.
   *
   * Si le RootDSE ne répond pas ou ne porte pas l'attribut, on rend une liste
   * VIDE : aucun renvoi n'est alors tenu pour hors périmètre, et l'on retombe
   * sur le refus d'avant. **Le doute reste du côté du refus.**
   */
  private async contextesDeNommage(): Promise<readonly string[]> {
    if (this.contextesCache !== null) return this.contextesCache;
    if (this.dansRootDse) return []; // pas de récursion : le RootDSE ne se sonde pas lui-même
    this.dansRootDse = true;
    try {
      const entrees = await this.rechercher({
        base: '',
        portee: 'base',
        filtre: '(objectClass=*)',
        attributs: ['namingContexts'],
        tailleMax: 5,
      });
      const valeurs = entrees[0]?.attributs.get('namingcontexts') ?? [];
      this.contextesCache = [...valeurs];
    } catch {
      // Un RootDSE muet n'est pas une raison de refuser une authentification :
      // c'est une raison de ne rien écarter, donc de se comporter comme avant.
      this.contextesCache = [];
    } finally {
      this.dansRootDse = false;
    }
    return this.contextesCache;
  }

  private contextesCache: readonly string[] | null = null;
  private dansRootDse = false;

  private lireRenvois(reponse: ElementBer): readonly string[] {
    const uris = lireEnfants(reponse.contenu).map((el) => valeurTexte(el));
    return uris.length === 0 ? [''] : uris;
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
