/**
 * serveur-smtp.mjs — un **vrai serveur SMTP**, en processus, pour éprouver le
 * client écrit à la main.
 *
 * ── Ce qu'il est, et ce qu'il n'est pas ─────────────────────────────────────
 *
 * Un serveur qui parle la RFC 5321 sur le fil, sur `127.0.0.1` et un **port
 * éphémère** (jamais un port fixe : plusieurs bancs tournent en parallèle sur
 * cette machine). Le client s'y connecte sans rien savoir de ce fichier — c'est
 * la seule façon d'éprouver un client de protocole.
 *
 * Il vit dans `backend/test/**` et n'est **jamais** importé par `backend/src/**`
 * (même règle que l'annuaire simulé du `CONVENTIONS.md` §25.1).
 *
 * ⚠️ **Aucun identifiant SMTP réel n'existe sur cette machine.** La sortie vers
 * `smtp.office365.com:587` fonctionne (bannière `220` mesurée), mais rien ne
 * permet de s'y authentifier : ce serveur est donc le seul endroit où la chaîne
 * complète — STARTTLS, AUTH, MAIL/RCPT/DATA — se mesure de bout en bout. La
 * limite est écrite au rapport de lot, pas dissimulée.
 *
 * ── Ce qu'il sait faire de travers, et pourquoi ─────────────────────────────
 *
 * Une doublure n'émet que ce que son auteur a prévu (§25, limite structurelle) :
 * on lui apprend donc explicitement à mal se comporter, parce que c'est là que
 * vivent les défauts du client.
 *
 *  · `sansStarttls`      — n'annonce pas l'extension : le client doit REFUSER
 *                          d'expédier en clair, jamais se replier ;
 *  · `pipelineAvantTls`  — écrit sa réponse « 220 » ET des octets de plus dans le
 *                          même segment, avant la poignée de main : c'est
 *                          l'injection de réponse STARTTLS (CVE-2011-0411), et le
 *                          client doit la voir ;
 *  · `refuserAuth`       — rend 535 : le message ne doit pas partir ;
 *  · `refuserRcpt`       — rend 550 par défaut, ou le code donné : c'est ainsi
 *                          qu'on distingue un échec PERMANENT (5xx) d'un échec
 *                          PASSAGER (4xx), distinction dont dépend la reprise ;
 *  · `muet`              — accepte la connexion et ne répond jamais : le client
 *                          doit rendre la main sur son propre délai ;
 *  · `couper`            — ferme la prise au milieu du dialogue.
 *
 * ── Ce qu'il enregistre ─────────────────────────────────────────────────────
 *
 * Chaque message accepté est rangé dans `messages` avec **les octets exacts
 * reçus** (`donnees`), l'enveloppe, et l'état réel du canal (`chiffre`,
 * `protocole`). C'est `donnees` que l'essai central fouille à la recherche des
 * titres semés en base : on cherche dans ce que le RELAIS a reçu, pas dans ce
 * que le code croit avoir écrit.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

/**
 * Engendre un certificat auto-signé pour `127.0.0.1`.
 *
 * ⚠️ **SAN `IP:127.0.0.1`, et aucune résolution de nom.** Une entrée
 * `/etc/hosts` posée à la main est verte chez son auteur et rouge ailleurs
 * (constat Q-… du banc : « 614 sur 628 sur une machine neuve »). Le banc ne
 * résout donc aucun nom : le client se connecte à l'adresse littérale, et le
 * certificat le prouve par son SAN d'adresse.
 */
function engendrerCertificat() {
  const repertoire = mkdtempSync(join(tmpdir(), 'grc-smtp-essai-'));
  execFileSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', join(repertoire, 'relais.key'),
      '-out', join(repertoire, 'relais.crt'),
      '-days', '2', '-subj', '/CN=relais-essai.exemple.interne',
      '-addext', 'subjectAltName=DNS:relais-essai.exemple.interne,IP:127.0.0.1',
      '-addext', 'basicConstraints=critical,CA:FALSE',
    ],
    { stdio: 'ignore' },
  );
  return {
    repertoire,
    cle: readFileSync(join(repertoire, 'relais.key')),
    certificat: readFileSync(join(repertoire, 'relais.crt')),
  };
}

const UTILISATEUR_ATTENDU = 'relais@exemple.interne';
const MOT_DE_PASSE_ATTENDU = 'secret-de-banc-sans-valeur';

/**
 * Monte le serveur.
 *
 * @param {{sansStarttls?: boolean, pipelineAvantTls?: boolean, refuserAuth?: boolean,
 *          refuserRcpt?: boolean|number, muet?: boolean, couper?: string,
 *          exigerAuth?: boolean}} options
 */
export async function monterRelaisEssai(options = {}) {
  const pki = engendrerCertificat();
  const contexte = tls.createSecureContext({ key: pki.cle, cert: pki.certificat });

  /** Messages acceptés, dans l'ordre. */
  const messages = [];
  /** Toutes les commandes vues, toutes connexions confondues — sert aux essais d'injection. */
  const commandes = [];
  /**
   * Prises ouvertes. `server.close()` ATTEND la fin des connexions : un essai de
   * panne en laisse toujours une, et `fermer()` figerait indéfiniment sans ceci.
   * Mesuré sur l'annuaire simulé, même piège.
   */
  const prises = new Set();

  const gerer = (priseInitiale) => {
    prises.add(priseInitiale);
    priseInitiale.on('close', () => prises.delete(priseInitiale));
    priseInitiale.on('error', () => {
      /* une coupure d'essai n'est pas un défaut */
    });

    if (options.muet === true) return; // accepte, ne répond jamais.

    let prise = priseInitiale;
    let tampon = '';
    let chiffre = false;
    let authentifie = false;
    let etat = 'commande'; // 'commande' | 'donnees'
    let enveloppe = { de: null, a: [], donnees: '' };

    const ecrire = (texte) => {
      if (!prise.destroyed) prise.write(texte);
    };

    const ehlo = () => {
      const lignes = ['250-relais-essai.exemple.interne'];
      lignes.push('250-SIZE 10485760');
      if (!chiffre && options.sansStarttls !== true) lignes.push('250-STARTTLS');
      if (chiffre) lignes.push('250-AUTH PLAIN LOGIN');
      lignes.push('250 8BITMIME');
      // La dernière ligne porte un espace, les autres un tiret : c'est ce que
      // le lecteur du client doit savoir distinguer.
      ecrire(`${lignes.join('\r\n')}\r\n`);
    };

    const basculerTls = () => {
      prise.removeAllListeners('data');
      const chiffree = new tls.TLSSocket(prise, { isServer: true, secureContext: contexte });
      chiffree.on('error', () => {
        /* une poignée de main refusée par le client est un verdict d'essai */
      });
      chiffree.on('secure', () => {
        chiffre = true;
      });
      prises.add(chiffree);
      chiffree.on('close', () => prises.delete(chiffree));
      prise = chiffree;
      tampon = '';
      brancher();
    };

    const traiterLigne = (ligne) => {
      if (etat === 'donnees') {
        if (ligne === '.') {
          etat = 'commande';
          messages.push({
            de: enveloppe.de,
            a: [...enveloppe.a],
            donnees: enveloppe.donnees,
            chiffre,
            authentifie,
            protocole: chiffre && prise.getProtocol ? prise.getProtocol() : null,
          });
          enveloppe = { de: null, a: [], donnees: '' };
          ecrire('250 2.0.0 Message accepte\r\n');
          return;
        }
        // Dé-bourrage du point (RFC 5321 §4.5.2), côté serveur cette fois.
        enveloppe.donnees += `${ligne.startsWith('..') ? ligne.slice(1) : ligne}\r\n`;
        return;
      }

      commandes.push(ligne);
      const verbe = ligne.split(' ')[0].toUpperCase();

      if (options.couper === verbe) {
        prise.destroy();
        return;
      }

      switch (verbe) {
        case 'EHLO':
        case 'HELO':
          ehlo();
          return;
        case 'STARTTLS':
          if (options.sansStarttls === true) {
            ecrire('500 5.5.1 Commande inconnue\r\n');
            return;
          }
          if (options.pipelineAvantTls === true) {
            // ⚠️ Hostile À DESSEIN : la réponse ET des octets de plus dans le
            // même segment, avant la poignée de main. Un client qui ne vide pas
            // son tampon les créditera du chiffrement.
            ecrire('220 2.0.0 Pret pour TLS\r\n250 injecte-en-clair\r\n');
          } else {
            ecrire('220 2.0.0 Pret pour TLS\r\n');
          }
          basculerTls();
          return;
        case 'AUTH': {
          if (!chiffre) {
            ecrire('538 5.7.11 Chiffrement requis\r\n');
            return;
          }
          if (options.refuserAuth === true) {
            ecrire('535 5.7.8 Identifiants refuses\r\n');
            return;
          }
          const parties = ligne.split(' ');
          const jeton = Buffer.from(parties[2] ?? '', 'base64').toString('utf8').split(' ');
          if (jeton[1] === UTILISATEUR_ATTENDU && jeton[2] === MOT_DE_PASSE_ATTENDU) {
            authentifie = true;
            ecrire('235 2.7.0 Authentification acceptee\r\n');
          } else {
            ecrire('535 5.7.8 Identifiants refuses\r\n');
          }
          return;
        }
        case 'MAIL':
          if (options.exigerAuth === true && !authentifie) {
            ecrire('530 5.7.0 Authentification requise\r\n');
            return;
          }
          enveloppe.de = /<([^>]*)>/.exec(ligne)?.[1] ?? null;
          ecrire('250 2.1.0 Expediteur accepte\r\n');
          return;
        case 'RCPT':
          if (options.refuserRcpt !== undefined && options.refuserRcpt !== false) {
            // `true` → 550 (permanent) ; un nombre → ce code-là, ce qui permet
            // d'éprouver un 4xx passager sans écrire un second serveur.
            const code = options.refuserRcpt === true ? 550 : Number(options.refuserRcpt);
            ecrire(`${String(code)} ${code >= 500 ? '5.1.1 Destinataire inconnu' : '4.2.1 Boite temporairement indisponible'}\r\n`);
            return;
          }
          enveloppe.a.push(/<([^>]*)>/.exec(ligne)?.[1] ?? null);
          ecrire('250 2.1.5 Destinataire accepte\r\n');
          return;
        case 'DATA':
          etat = 'donnees';
          ecrire('354 Envoyez le message, terminez par un point seul\r\n');
          return;
        case 'QUIT':
          ecrire('221 2.0.0 Au revoir\r\n');
          prise.end();
          return;
        case 'RSET':
          enveloppe = { de: null, a: [], donnees: '' };
          ecrire('250 2.0.0 Reinitialise\r\n');
          return;
        default:
          ecrire('502 5.5.2 Commande non implementee\r\n');
      }
    };

    const brancher = () => {
      prise.on('data', (bloc) => {
        tampon += bloc.toString('utf8');
        for (;;) {
          const fin = tampon.indexOf('\r\n');
          if (fin < 0) break;
          const ligne = tampon.slice(0, fin);
          tampon = tampon.slice(fin + 2);
          traiterLigne(ligne);
        }
      });
    };

    ecrire('220 relais-essai.exemple.interne ESMTP Cyber GRC banc d essai\r\n');
    brancher();
  };

  const serveur = createServer(gerer);
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const port = serveur.address().port;

  return {
    hote: '127.0.0.1',
    port,
    messages,
    commandes,
    /** L'autorité à passer au client : le certificat est son propre signataire. */
    autorite: pki.certificat,
    /** Identifiants que ce relais accepte — jamais un secret réel. */
    utilisateur: UTILISATEUR_ATTENDU,
    motDePasse: MOT_DE_PASSE_ATTENDU,

    /** Paramètres prêts à passer à `expedier`. */
    relais(supplement = {}) {
      return {
        hote: '127.0.0.1',
        port,
        chiffrement: 'starttls',
        modeAuth: 'basique',
        utilisateur: UTILISATEUR_ATTENDU,
        motDePasse: MOT_DE_PASSE_ATTENDU,
        ...supplement,
      };
    },

    async fermer() {
      for (const p of prises) p.destroy();
      prises.clear();
      await new Promise((resoudre) => serveur.close(resoudre));
      rmSync(pki.repertoire, { recursive: true, force: true });
    },
  };
}
