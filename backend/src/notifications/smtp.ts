/**
 * Client SMTP — RFC 5321, STARTTLS (RFC 3207), et rien de plus.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et pourquoi ce n'est pas une bonne nouvelle
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le serveur n'a que deux dépendances d'exécution — `fastify` et `pg` —, et
 * `package.json` n'appartient pas à cet agent. `nodemailer` n'est donc pas
 * installé, et l'écrire soi-même est la seule voie ouverte aujourd'hui. C'est
 * le même arbitrage, pour la même raison, que `src/pieces/multipart.ts`,
 * `src/pieces/zip.ts` et le client LDAPS de `src/auth/client-ldap.ts`.
 *
 * ⚠️ **C'est un choix par contrainte, pas par préférence, et il est écrit pour
 * qu'on puisse le contester** : un client de protocole écrit à la main est une
 * surface d'attaque. Celui-ci parle à **un seul hôte, nommé dans la
 * configuration**, ne reçoit jamais de connexion entrante, et n'est atteint que
 * par la tâche planifiée et une route d'administration — ce qui borne qui peut
 * le solliciter, mais ne le rend pas juste pour autant. **Le remplacer par une
 * bibliothèque éprouvée est un candidat V1.1.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qu'il fait, et surtout ce qu'il NE fait pas
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Un destinataire par message.** Jamais deux `RCPT TO` dans la même
 *    enveloppe : un en-tête `To:` partagé dévoilerait à chaque destinataire la
 *    liste des autres — c'est-à-dire, dans un produit cloisonné par filiale, la
 *    composition d'une équipe. Le cloisonnement se perdrait par le canal le
 *    plus banal (`CONVENTIONS.md` §36.2 règle 1).
 *  · **Il ne relaie rien.** Il n'accepte ni corps ni en-tête arbitraires : le
 *    message est construit par `message.ts`, dont c'est tout le travail.
 *  · **Il ne devine pas.** Un code de réponse inattendu, une extension absente,
 *    un dépassement de borne : refus. Aucune tolérance, aucun repli silencieux.
 *  · **Il ne fait pas OAuth2.** `SMTP_MODE_AUTH=oauth2` obtiendrait un jeton
 *    d'Entra ID, ce qui est un client HTTP de plus et ne se mesure pas sur cette
 *    machine (aucun tenant). Ce mode est **refusé explicitement**, avec un motif
 *    nommé, plutôt que traité comme « aucune authentification » — ce qui aurait
 *    fait partir des messages non authentifiés là où le tenant les refuse.
 *    Candidat V1.1, écrit dans le rapport de lot.
 *  · **Il ne réessaie pas.** La reprise est la politique de l'appelant
 *    (`relances.ts`), qui seul sait si un renvoi ferait un doublon.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les trois propriétés de sûreté, et pourquoi chacune est là
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **Aucune valeur ne devient une commande.** Une adresse de destinataire
 *     vient de `personnes.email`, table que des utilisateurs écrivent. Une
 *     adresse contenant `\r\n` injecterait une commande SMTP — c'est-à-dire un
 *     second destinataire, ou un second message. `validerAdresse` refuse **avant**
 *     que quoi que ce soit parte sur le fil, et le refus est un échec nommé, pas
 *     un nettoyage silencieux (un nettoyage donnerait à croire, plus loin, que la
 *     valeur est sûre).
 *  2. **Le tampon de lecture est VIDÉ et VÉRIFIÉ à la bascule TLS.** Un serveur
 *     hostile qui écrit sa réponse `220` *et* la suite dans le même segment fait
 *     lire au client, comme venant du canal chiffré, des octets arrivés en clair
 *     (CVE-2011-0411, « STARTTLS command injection »). Tout octet resté en
 *     mémoire après le `220` fait donc échouer la connexion.
 *  3. **Les identifiants ne partent jamais en clair.** `AUTH` est refusé tant
 *     que le canal n'est pas chiffré, quelle que soit la configuration. Le
 *     `SMTP_CHIFFREMENT=aucun` de la configuration n'est un avertissement que
 *     pour un relais qui n'exige pas d'authentification ; combiné à
 *     `SMTP_MODE_AUTH=basique`, il ferait circuler le mot de passe du compte
 *     d'expédition sur le réseau du client.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qui est mesuré, et comment
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/notifications/smtp.test.mjs` monte un **vrai serveur SMTP** en
 * processus (`test/notifications/serveur-smtp.mjs`), sur la boucle locale et un
 * port éphémère, avec un certificat engendré à la volée. La bascule STARTTLS
 * est donc **constatée sur le fil** — le serveur d'essai rapporte
 * `chiffre: true` et le protocole négocié —, jamais supposée. Les trois
 * propriétés ci-dessus y ont chacune leur essai, et le serveur sait se
 * comporter mal exprès (réponse hostile, pipeline avant TLS, coupure).
 *
 * La sortie SMTP de cette machine vers Office 365 fonctionne (bannière `220`
 * mesurée) ; **aucun identifiant n'existe ici**, donc aucun envoi réel vers un
 * relais réel n'est éprouvé — c'est écrit au rapport, pas dissimulé.
 */

import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

/* =====================================================================
 *  1. Types
 * ===================================================================== */

export type ChiffrementRelais = 'starttls' | 'tls' | 'aucun';
export type ModeAuthRelais = 'aucun' | 'basique' | 'oauth2';

/**
 * Ce que ce client a besoin de savoir du relais.
 *
 * Volontairement **structurellement identique** à `ConfigurationSmtp` sans en
 * dépendre : ce module ne connaît ni `Configuration`, ni l'expéditeur, ni la
 * redirection de recette — ce sont des décisions de `relances.ts`. Il en
 * découle qu'il se teste sans charger la configuration du serveur.
 */
export interface ParametresRelais {
  readonly hote: string;
  readonly port: number;
  readonly chiffrement: ChiffrementRelais;
  readonly modeAuth: ModeAuthRelais;
  readonly utilisateur: string;
  readonly motDePasse: string;
}

/** Une adresse et, facultativement, le nom affiché à côté. */
export interface Adresse {
  readonly adresse: string;
  readonly nom?: string;
}

/**
 * Un message, tel que `message.ts` le construit.
 *
 * ⚠️ `corps` est du **texte brut** et il est encodé en base64 à l'expédition :
 * ni la longueur des lignes (RFC 5321 §4.5.3.1 : 998 octets), ni un point en
 * début de ligne, ni un caractère non-ASCII ne peuvent alors casser la
 * transmission.
 */
export interface MessageSortant {
  readonly de: Adresse;
  /** **Un seul** destinataire. Voir l'entête. */
  readonly a: string;
  readonly sujet: string;
  readonly corps: string;
}

/** Ce qui a réellement eu lieu sur le fil. Sert aux essais et au journal technique. */
export interface TraceExpedition {
  /** Le canal était-il chiffré au moment du `DATA` ? */
  readonly chiffre: boolean;
  /** La bascule `STARTTLS` a-t-elle été négociée (par opposition à un TLS implicite) ? */
  readonly starttlsNegocie: boolean;
  readonly authentifie: boolean;
  /** `TLSv1.3`… ou `null` en clair. Constaté auprès de la prise, jamais déduit. */
  readonly protocoleTls: string | null;
  /** Extensions annoncées par le dernier `EHLO`, en majuscules. */
  readonly extensions: readonly string[];
  /** Identifiant du message tel qu'il a été posé dans l'en-tête `Message-ID`. */
  readonly identifiantMessage: string;
}

export interface OptionsExpedition {
  /** Borne de bout en bout, en millisecondes. Défaut : 20 000. */
  readonly delaiMs?: number;
  /**
   * Nom annoncé au `EHLO`. Défaut : le domaine de l'expéditeur, qui est ce
   * qu'un relais attend d'un client autorisé par SPF.
   */
  readonly nomClient?: string;
  /**
   * Options TLS supplémentaires — **le seul point d'entrée des essais**, et il
   * n'affaiblit rien : le banc y passe l'autorité qui a signé le certificat de
   * son serveur d'essai, donc la poignée de main est **réellement vérifiée**.
   * En production, ce champ est absent et Node emploie le magasin du système.
   *
   * ⚠️ Il n'existe **pas** de réglage « ne pas vérifier le certificat », et il
   * ne faut pas en ajouter : ce serait exactement l'interrupteur qu'on trouve
   * un jour posé en production.
   */
  readonly tlsSupplement?: tls.ConnectionOptions;
}

/**
 * Échec d'expédition.
 *
 * `permanente` distingue ce que réessayer ne changera pas (adresse refusée,
 * authentification refusée : codes 5xx) de ce qui peut passer plus tard (relais
 * injoignable, 4xx). `relances.ts` s'en sert pour décider s'il rend la fenêtre
 * d'envoi ou s'il la garde.
 */
export class ErreurSmtp extends Error {
  public override readonly name = 'ErreurSmtp';
  public readonly permanente: boolean;
  /** Code SMTP quand le serveur en a donné un ; `null` si l'échec est réseau. */
  public readonly codeSmtp: number | null;

  constructor(message: string, options: { permanente?: boolean; codeSmtp?: number | null } = {}) {
    super(message);
    this.permanente = options.permanente ?? false;
    this.codeSmtp = options.codeSmtp ?? null;
  }
}

/* =====================================================================
 *  2. Bornes de sûreté
 * ---------------------------------------------------------------------
 *  Un échange SMTP ordinaire en est très loin. Elles ne sont pas là pour le
 *  cas nominal : elles sont là pour qu'un relais qui parle sans fin ne fasse
 *  pas grandir la mémoire du service jusqu'à `MemoryMax`.
 * ===================================================================== */

const MAX_LIGNE_REPONSE = 4 * 1024;
const MAX_REPONSE_OCTETS = 64 * 1024;
const MAX_LIGNES_REPONSE = 256;
const DELAI_DEFAUT_MS = 20_000;
const MAX_CORPS_OCTETS = 256 * 1024;

/**
 * Forme d'adresse admise.
 *
 * Volontairement **plus stricte que la RFC 5321** — qui admet les chaînes
 * citées et les domaines littéraux. Ce produit n'expédie qu'à des adresses
 * venues de l'annuaire d'entreprise ; élargir la forme n'ajouterait aucun
 * destinataire légitime et rouvrirait la porte à ce que `validerAdresse` ferme.
 * Ce qui compte ici n'est pas l'exhaustivité, c'est qu'aucun `\r`, `\n`, espace,
 * `<`, `>` ni caractère de commande ne puisse traverser.
 */
const MOTIF_ADRESSE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,63}$/u;

/**
 * Refuse une adresse **avant** qu'elle atteigne le fil.
 *
 * ⚠️ C'est la propriété 1 de l'entête, et elle vaut d'être dite en clair :
 * `personnes.email` est écrit par des utilisateurs. Une adresse valant
 * `victime@exemple.fr>\r\nRCPT TO:<autre@ailleurs.fr` ajouterait un
 * destinataire hors périmètre à une enveloppe légitime — une fuite entre
 * filiales par le canal le plus banal.
 */
export function validerAdresse(adresse: string, role: string): string {
  if (typeof adresse !== 'string' || adresse.length === 0) {
    throw new ErreurSmtp(`Adresse ${role} vide.`, { permanente: true });
  }
  if (adresse.length > 320) {
    throw new ErreurSmtp(`Adresse ${role} trop longue (${String(adresse.length)} signes).`, {
      permanente: true,
    });
  }
  if (!MOTIF_ADRESSE.test(adresse)) {
    // Le message ne recopie PAS l'adresse : il part au journal technique, et
    // une valeur d'utilisateur n'a rien à y faire (même règle que §29.5).
    throw new ErreurSmtp(`Adresse ${role} de forme refusée.`, { permanente: true });
  }
  return adresse;
}

/* =====================================================================
 *  3. Encodage du message
 * ===================================================================== */

/** Un en-tête ne peut porter aucun caractère de commande : c'est la moitié « en-tête » de la propriété 1. */
function valeurEnTeteSure(valeur: string, nom: string): string {
  if (/[\r\n ]/u.test(valeur)) {
    throw new ErreurSmtp(`En-tête « ${nom} » : caractère de commande refusé.`, { permanente: true });
  }
  return valeur;
}

/**
 * Encode un texte d'en-tête au format RFC 2047 s'il n'est pas ASCII.
 *
 * « Échéance » et « À déclarer » sont du français : sans cet encodage, le sujet
 * arriverait accentué en octets bruts — ce que certains relais réécrivent et
 * d'autres refusent. En base64 plutôt qu'en « quoted-printable » : plus court à
 * écrire, plus court à relire, et sans cas particulier sur `=`, `?` ou l'espace.
 */
export function encoderEnTete(texte: string): string {
  valeurEnTeteSure(texte, 'texte encodé');
  // eslint-disable-next-line no-control-regex
  if (/^[ -~]*$/u.test(texte)) return texte;
  const brut = Buffer.from(texte, 'utf8');
  // RFC 2047 borne un « mot encodé » à 75 signes ; on découpe en tranches de
  // 45 octets, dont la base64 tient en 60 signes, marges d'en-tête comprises.
  const morceaux: string[] = [];
  for (let i = 0; i < brut.length; i += 45) {
    morceaux.push(`=?UTF-8?B?${brut.subarray(i, i + 45).toString('base64')}?=`);
  }
  return morceaux.join('\r\n ');
}

/** `Nom <adresse>` — le nom encodé, l'adresse déjà validée. */
function formaterAdresse(a: Adresse): string {
  const adresse = validerAdresse(a.adresse, 'expéditeur');
  if (a.nom === undefined || a.nom.trim() === '') return `<${adresse}>`;
  return `${encoderEnTete(a.nom.trim())} <${adresse}>`;
}

/** Date au format RFC 5322, en UTC — aucune dépendance à `Intl` ni au fuseau de la VM. */
function dateRfc5322(quand: Date): string {
  const jours = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mois = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nn = (n: number): string => String(n).padStart(2, '0');
  return (
    `${jours[quand.getUTCDay()] ?? 'Mon'}, ${nn(quand.getUTCDate())} ` +
    `${mois[quand.getUTCMonth()] ?? 'Jan'} ${String(quand.getUTCFullYear())} ` +
    `${nn(quand.getUTCHours())}:${nn(quand.getUTCMinutes())}:${nn(quand.getUTCSeconds())} +0000`
  );
}

/** Domaine de l'expéditeur : ce qu'un relais attend au `EHLO` d'un client autorisé par SPF. */
function domaineDe(adresse: string): string {
  const arobase = adresse.lastIndexOf('@');
  const domaine = arobase >= 0 ? adresse.slice(arobase + 1) : '';
  return domaine === '' ? 'localhost' : domaine;
}

export interface MessageEncode {
  readonly identifiant: string;
  readonly contenu: string;
}

/**
 * Sérialise le message en RFC 5322.
 *
 * Exporté **pour être éprouvé sans réseau** : c'est ici que le contrôle central
 * du lot s'exerce — chercher, dans `contenu`, les titres semés en base et n'en
 * trouver aucun.
 */
export function encoderMessage(message: MessageSortant, quand: Date = new Date()): MessageEncode {
  const de = formaterAdresse(message.de);
  const a = validerAdresse(message.a, 'destinataire');
  const sujet = encoderEnTete(message.sujet);

  const corps = Buffer.from(message.corps, 'utf8');
  if (corps.length > MAX_CORPS_OCTETS) {
    throw new ErreurSmtp(`Corps de message trop long (${String(corps.length)} octets).`, {
      permanente: true,
    });
  }

  // Aléa cryptographique, comme partout ailleurs dans ce produit
  // (`CONVENTIONS.md` §2) : un identifiant de message prévisible permettrait de
  // relier deux envois, ou d'en forger un troisième qui se fasse passer pour eux.
  const identifiant = `<${Date.now().toString(36)}.${randomBytes(12).toString('hex')}@${domaineDe(
    message.de.adresse,
  )}>`;

  const base64 = corps.toString('base64').replace(/(.{76})/gu, '$1\r\n');

  const enTetes = [
    `From: ${de}`,
    `To: <${a}>`,
    `Subject: ${sujet}`,
    `Date: ${dateRfc5322(quand)}`,
    `Message-ID: ${identifiant}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    // Une relance automatique ne doit ni déclencher de réponse d'absence, ni
    // revenir en boucle : deux en-têtes que les relais honorent largement.
    'Auto-Submitted: auto-generated',
    'X-Auto-Response-Suppress: All',
  ];

  return { identifiant, contenu: `${enTetes.join('\r\n')}\r\n\r\n${base64}\r\n` };
}

/** RFC 5321 §4.5.2 : un point en début de ligne est doublé, faute de quoi il termine le message. */
function bourrerPoints(contenu: string): string {
  return contenu.replace(/^\./gmu, '..');
}

/* =====================================================================
 *  4. Le dialogue
 * ===================================================================== */

interface Reponse {
  readonly code: number;
  readonly lignes: readonly string[];
}

/**
 * Lecteur de réponses SMTP, attaché à une prise et **transférable** à la prise
 * TLS qui la remplace.
 *
 * `resteEnTampon()` est ce qui rend la propriété 2 vérifiable : après le `220`
 * de STARTTLS, il doit rendre zéro.
 */
class LecteurSmtp {
  private tampon = '';
  private recus = 0;
  private prise: net.Socket;
  private attente: { resoudre: () => void; rejeter: (e: Error) => void } | null = null;
  private erreur: Error | null = null;
  private termine = false;

  constructor(prise: net.Socket) {
    this.prise = prise;
    this.brancher(prise);
  }

  private brancher(prise: net.Socket): void {
    prise.on('data', (bloc: Buffer) => {
      this.recus += bloc.length;
      if (this.recus > MAX_REPONSE_OCTETS) {
        this.signaler(new ErreurSmtp('Le relais a répondu au-delà de la borne admise.'));
        return;
      }
      this.tampon += bloc.toString('utf8');
      this.reveiller();
    });
    prise.on('error', (e: Error) => {
      this.signaler(e);
    });
    prise.on('close', () => {
      this.termine = true;
      this.reveiller();
    });
  }

  /** Reprend la lecture sur la prise chiffrée, en repartant d'un tampon vide. */
  remplacerPrise(prise: net.Socket): void {
    this.prise.removeAllListeners('data');
    this.prise.removeAllListeners('error');
    this.prise.removeAllListeners('close');
    this.prise = prise;
    this.tampon = '';
    this.recus = 0;
    this.termine = false;
    this.brancher(prise);
  }

  resteEnTampon(): number {
    return this.tampon.length;
  }

  private signaler(e: Error): void {
    this.erreur ??= e;
    this.reveiller();
  }

  private reveiller(): void {
    const attente = this.attente;
    if (attente === null) return;
    this.attente = null;
    if (this.erreur !== null) attente.rejeter(this.erreur);
    else attente.resoudre();
  }

  /** Extrait une réponse complète du tampon, ou `null` s'il en manque. */
  private extraire(): Reponse | null {
    const lignes: string[] = [];
    let position = 0;
    for (;;) {
      const fin = this.tampon.indexOf('\r\n', position);
      if (fin < 0) {
        if (this.tampon.length - position > MAX_LIGNE_REPONSE) {
          throw new ErreurSmtp('Ligne de réponse SMTP au-delà de la borne admise.');
        }
        return null;
      }
      const ligne = this.tampon.slice(position, fin);
      position = fin + 2;
      if (ligne.length < 4) {
        throw new ErreurSmtp(`Réponse SMTP mal formée (${String(ligne.length)} signes).`);
      }
      const code = Number(ligne.slice(0, 3));
      if (!Number.isInteger(code) || code < 100 || code > 599) {
        throw new ErreurSmtp('Réponse SMTP sans code lisible.');
      }
      lignes.push(ligne.slice(4));
      if (lignes.length > MAX_LIGNES_REPONSE) {
        throw new ErreurSmtp('Réponse SMTP à trop de lignes.');
      }
      // `-` = continuation, espace = dernière ligne. Tout autre séparateur est
      // une réponse qu'on ne comprend pas, donc un refus (jamais une tolérance).
      const separateur = ligne[3];
      if (separateur === ' ') {
        this.tampon = this.tampon.slice(position);
        return { code, lignes };
      }
      if (separateur !== '-') {
        throw new ErreurSmtp('Réponse SMTP au séparateur inattendu.');
      }
    }
  }

  async lire(): Promise<Reponse> {
    for (;;) {
      if (this.erreur !== null) throw this.erreur;
      const reponse = this.extraire();
      if (reponse !== null) return reponse;
      if (this.termine) {
        throw new ErreurSmtp('Le relais a fermé la connexion avant de répondre.');
      }
      await new Promise<void>((resoudre, rejeter) => {
        this.attente = { resoudre, rejeter };
      });
    }
  }
}

function ecrire(prise: net.Socket, texte: string): Promise<void> {
  return new Promise((resoudre, rejeter) => {
    prise.write(texte, (e) => {
      if (e) rejeter(e);
      else resoudre();
    });
  });
}

/** Les extensions annoncées, en majuscules, mot-clé en tête de ligne. */
function extensionsDe(reponse: Reponse): string[] {
  return reponse.lignes.slice(1).map((l) => l.trim().toUpperCase());
}

function annonce(extensions: readonly string[], mot: string): boolean {
  return extensions.some((e) => e === mot || e.startsWith(`${mot} `));
}

/**
 * Expédie **un** message à **un** destinataire.
 *
 * Rend ce qui a réellement eu lieu ; lève `ErreurSmtp` sinon. Ne réessaie
 * jamais, ne journalise rien : l'appelant décide des deux.
 */
export async function expedier(
  message: MessageSortant,
  relais: ParametresRelais,
  options: OptionsExpedition = {},
): Promise<TraceExpedition> {
  if (relais.modeAuth === 'oauth2') {
    // Refus nommé plutôt que repli silencieux — voir l'entête.
    throw new ErreurSmtp(
      "SMTP_MODE_AUTH=oauth2 n'est pas implémenté par ce lot : l'obtention d'un jeton Entra ID reste à faire (candidat V1.1). Aucun message n'est expédié plutôt que d'en expédier sans authentification.",
      { permanente: true },
    );
  }

  // Le message est encodé — donc validé — AVANT d'ouvrir la moindre prise :
  // une adresse refusée ne doit pas coûter une connexion au relais.
  const encode = encoderMessage(message);
  const expediteur = validerAdresse(message.de.adresse, 'expéditeur');
  const destinataire = validerAdresse(message.a, 'destinataire');
  const nomClient = valeurEnTeteSure(options.nomClient ?? domaineDe(expediteur), 'EHLO');

  const delaiMs = options.delaiMs ?? DELAI_DEFAUT_MS;
  let prise: net.Socket | null = null;
  let minuterie: NodeJS.Timeout | null = null;

  const echeance = new Promise<never>((_, rejeter) => {
    minuterie = setTimeout(() => {
      rejeter(new ErreurSmtp(`Le relais n'a pas répondu en ${String(delaiMs)} ms.`));
      prise?.destroy();
    }, delaiMs);
    minuterie.unref();
  });

  try {
    return await Promise.race([
      (async (): Promise<TraceExpedition> => {
        prise = await ouvrir(relais, options);
        const lecteur = new LecteurSmtp(prise);

        const attendre = async (attendus: readonly number[], quoi: string): Promise<Reponse> => {
          const reponse = await lecteur.lire();
          if (!attendus.includes(reponse.code)) {
            throw new ErreurSmtp(
              `${quoi} : le relais a répondu ${String(reponse.code)}.`,
              // 5xx = définitif au sens de la RFC ; 4xx = passager.
              { permanente: reponse.code >= 500, codeSmtp: reponse.code },
            );
          }
          return reponse;
        };

        const commander = async (
          ligne: string,
          attendus: readonly number[],
          quoi: string,
        ): Promise<Reponse> => {
          await ecrire(prise as net.Socket, `${ligne}\r\n`);
          return await attendre(attendus, quoi);
        };

        await attendre([220], 'Bannière');

        let chiffre = relais.chiffrement === 'tls';
        let starttlsNegocie = false;
        let extensions = extensionsDe(await commander(`EHLO ${nomClient}`, [250], 'EHLO'));

        if (relais.chiffrement === 'starttls') {
          if (!annonce(extensions, 'STARTTLS')) {
            throw new ErreurSmtp(
              "Le relais n'annonce pas STARTTLS alors que SMTP_CHIFFREMENT=starttls. Rien n'est expédié en clair par repli.",
              { permanente: true },
            );
          }
          await commander('STARTTLS', [220], 'STARTTLS');

          // ── PROPRIÉTÉ 2 : le tampon doit être VIDE (CVE-2011-0411) ──────
          // Tout octet déjà reçu à cet instant est arrivé EN CLAIR ; le lire
          // après la bascule reviendrait à le créditer du chiffrement.
          if (lecteur.resteEnTampon() > 0) {
            throw new ErreurSmtp(
              `Le relais a émis ${String(lecteur.resteEnTampon())} octet(s) après « 220 » et avant la poignée de main TLS : injection de réponse (CVE-2011-0411).`,
              { permanente: true },
            );
          }

          const chiffree = await basculerTls(prise, relais.hote, options);
          lecteur.remplacerPrise(chiffree);
          prise = chiffree;
          chiffre = true;
          starttlsNegocie = true;

          // RFC 3207 §4.2 : le client DOIT rejouer EHLO, le serveur ayant le
          // droit d'annoncer d'autres extensions une fois chiffré — c'est
          // précisément là qu'AUTH apparaît chez Office 365.
          extensions = extensionsDe(await commander(`EHLO ${nomClient}`, [250], 'EHLO (après TLS)'));
        }

        let authentifie = false;
        if (relais.modeAuth === 'basique') {
          // ── PROPRIÉTÉ 3 : jamais d'identifiants en clair ────────────────
          if (!chiffre) {
            throw new ErreurSmtp(
              "SMTP_MODE_AUTH=basique avec un canal non chiffré : le mot de passe du compte d'expédition circulerait en clair. Refusé.",
              { permanente: true },
            );
          }
          if (!annonce(extensions, 'AUTH')) {
            throw new ErreurSmtp("Le relais n'annonce aucune méthode AUTH.", { permanente: true });
          }
          // `AUTH PLAIN` en une passe : la forme la plus simple, et la seule
          // dont le contenu ne transite pas en deux morceaux devinables.
          const jeton = Buffer.from(
            ` ${relais.utilisateur} ${relais.motDePasse}`,
            'utf8',
          ).toString('base64');
          await commander(`AUTH PLAIN ${jeton}`, [235], 'AUTH');
          authentifie = true;
        }

        await commander(`MAIL FROM:<${expediteur}>`, [250], 'MAIL FROM');
        await commander(`RCPT TO:<${destinataire}>`, [250, 251], 'RCPT TO');
        await commander('DATA', [354], 'DATA');
        await ecrire(prise, `${bourrerPoints(encode.contenu)}.\r\n`);
        await attendre([250], 'Fin de message');

        // `QUIT` est poli, pas indispensable : un relais qui ne répond pas au
        // revoir n'annule pas un message déjà accepté par le « 250 » ci-dessus.
        try {
          await commander('QUIT', [221], 'QUIT');
        } catch {
          /* le message est accepté ; l'au revoir n'est pas une preuve. */
        }

        return {
          chiffre,
          starttlsNegocie,
          authentifie,
          protocoleTls: prise instanceof tls.TLSSocket ? prise.getProtocol() : null,
          extensions,
          identifiantMessage: encode.identifiant,
        };
      })(),
      echeance,
    ]);
  } catch (erreur) {
    if (erreur instanceof ErreurSmtp) throw erreur;
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    throw new ErreurSmtp(`Relais injoignable ou dialogue interrompu : ${detail}`);
  } finally {
    if (minuterie !== null) clearTimeout(minuterie);
    (prise as net.Socket | null)?.destroy();
  }
}

/**
 * `servername` (SNI) **seulement pour un nom**, jamais pour une adresse IP.
 *
 * RFC 6066 §3 l'interdit, et Node l'annonce désormais déprécié
 * (`DEP0123`) — mesuré : *« Setting the TLS ServerName to an IP address is not
 * permitted by RFC 6066. This will be ignored in a future version. »* Un relais
 * désigné par son IP (le cas du banc, et celui d'une VM sans DNS interne) doit
 * continuer de fonctionner le jour où Node cessera de l'ignorer poliment.
 *
 * ⚠️ Cela n'affaiblit pas la vérification : l'identité du certificat reste
 * contrôlée par `checkServerIdentity`, contre le SAN `IP:` du certificat.
 */
function sni(hote: string): { servername?: string } {
  return net.isIP(hote) === 0 ? { servername: hote } : {};
}

/** Ouvre la prise : TLS implicite (465) ou clair (587/25). */
function ouvrir(relais: ParametresRelais, options: OptionsExpedition): Promise<net.Socket> {
  return new Promise((resoudre, rejeter) => {
    const echouer = (e: Error): void => {
      rejeter(e);
    };
    if (relais.chiffrement === 'tls') {
      const prise = tls.connect(
        { host: relais.hote, port: relais.port, ...sni(relais.hote), ...options.tlsSupplement },
        () => {
          prise.removeListener('error', echouer);
          resoudre(prise);
        },
      );
      prise.once('error', echouer);
      return;
    }
    const prise = net.connect({ host: relais.hote, port: relais.port }, () => {
      prise.removeListener('error', echouer);
      resoudre(prise);
    });
    prise.once('error', echouer);
  });
}

/**
 * Bascule la prise en clair vers TLS.
 *
 * `servername` porte l'hôte **configuré**, jamais une valeur reçue du relais :
 * c'est ce que le certificat doit prouver. Aucun réglage n'affaiblit la
 * vérification (voir `OptionsExpedition.tlsSupplement`).
 */
function basculerTls(
  prise: net.Socket,
  hote: string,
  options: OptionsExpedition,
): Promise<tls.TLSSocket> {
  return new Promise((resoudre, rejeter) => {
    const echouer = (e: Error): void => {
      rejeter(new ErreurSmtp(`Poignée de main TLS refusée : ${e.message}`));
    };
    const chiffree = tls.connect(
      {
        socket: prise,
        host: hote,
        ...sni(hote),
        minVersion: 'TLSv1.2',
        ...options.tlsSupplement,
      },
      () => {
        chiffree.removeListener('error', echouer);
        resoudre(chiffree);
      },
    );
    chiffree.once('error', echouer);
  });
}
