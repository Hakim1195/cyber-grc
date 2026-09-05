/**
 * Contrôle n° 7 — **l'analyse antivirale, et son échec.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Aucun dispositif ne garantit l'absence de malware
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `PLAN_SERVEUR` §1.6 ouvre sur cette phrase, le `CONVENTIONS.md` §31.4 exige
 * qu'elle se retrouve dans le code, et c'est ici qu'elle compte le plus : ClamAV
 * reconnaît **des signatures connues**. Il ne dit pas qu'un fichier est sain, il
 * dit qu'il ne reconnaît rien. La chaîne du §31.2 est une défense en profondeur
 * — liste blanche, signature binaire, refus des macros, stockage hors racine
 * web, délivrance forcée en pièce jointe, ré-analyse périodique —, et l'antivirus
 * n'en est **qu'une couche sur huit**. Le §17.5 s'applique : un garde-fou ne se
 * voit pas prêter plus de portée qu'il n'en a.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ Si ClamAV ne répond pas, la pièce n'est PAS acceptée
 * ════════════════════════════════════════════════════════════════════════
 *
 * C'est la phrase du §31.4, et elle est la raison d'être de ce fichier. Toutes
 * les défaillances — socket absent, connexion refusée, délai dépassé, réponse
 * incompréhensible, démon qui ferme sans répondre — lèvent `ErreurClamav`.
 * **Aucune ne rend un verdict.** Il n'existe pas, dans ce module, de chemin qui
 * rende « saine » sans qu'un démon l'ait dit.
 *
 * `clamavActif = non` est la seule dérogation, et elle est **bornée au
 * développement** : hors de là, `analyser()` refuse — un service de recette ou
 * de production dont l'analyse est éteinte est un service qui accepte des pièces
 * non analysées, et le faire en silence est exactement ce que le §31.4 interdit.
 * La configuration se contente d'un avertissement au démarrage
 * (`src/config/index.ts`) ; ici, c'est un refus.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le protocole
 * ════════════════════════════════════════════════════════════════════════
 *
 * `INSTREAM` (clamd) : on envoie `zINSTREAM\0`, puis une suite de blocs
 * `<longueur sur 4 octets, gros-boutiste><données>`, puis une longueur nulle qui
 * clôt le flux. Le démon répond une ligne terminée par un octet nul :
 *
 *     stream: OK\0
 *     stream: Eicar-Test-Signature FOUND\0
 *     INSTREAM size limit exceeded. ERROR\0
 *
 * **Les octets voyagent par le socket, jamais par le chemin** : le démon n'a
 * donc besoin d'aucun droit sur le magasin, qui reste lisible du seul compte de
 * service. C'est ce qui permet au magasin d'être fermé (`0700`).
 */

import { createReadStream } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';

import type { Configuration } from '../config/index.js';

/** Verdict d'une analyse. Il n'y en a que deux, et aucun n'est « je ne sais pas ». */
export type VerdictAntivirus =
  | { readonly etat: 'saine'; readonly resultat: string }
  | { readonly etat: 'infectee'; readonly signature: string; readonly resultat: string }
  /**
   * **Développement seulement.** L'analyse a été explicitement désactivée
   * (`CLAMAV_ACTIF=non`) et l'environnement l'autorise. La pièce est acceptée,
   * et la base le dit : `etat_analyse = 'erreur'`, jamais `'saine'` — on
   * n'enregistre pas comme constatée une propriété que personne n'a constatée.
   */
  | { readonly etat: 'non_analysee'; readonly resultat: string };

/** Échec de l'analyse. Sa levée **refuse** le dépôt ; elle ne le laisse jamais passer. */
export class ErreurClamav extends Error {
  public override readonly name = 'ErreurClamav';
}

/** Taille des blocs envoyés au démon. 64 kio : ni un aller-retour par octet, ni un tampon. */
const TAILLE_BLOC = 64 * 1024;

/**
 * Analyse le fichier **qui est sur le disque**.
 *
 * ⚠️ Elle prend un **chemin**, pas un tampon, et l'ordre du §31.2 en dépend :
 * le contrôle n° 7 s'exerce après l'écriture (n° 5) et après l'empreinte (n° 6),
 * sur les mêmes octets qu'eux. Analyser le tampon reçu laisserait un écart —
 * mince, mais réel — entre ce qui a été jugé sain et ce qui a été conservé.
 */
export async function analyser(chemin: string, config: Configuration): Promise<VerdictAntivirus> {
  if (!config.piecesJointes.clamavActif) {
    if (config.environnement !== 'developpement') {
      throw new ErreurClamav(
        `analyse antivirale désactivée en environnement « ${config.environnement} » : ` +
          'la pièce est refusée (CONVENTIONS.md §31.4)',
      );
    }
    return { etat: 'non_analysee', resultat: 'analyse désactivée (CLAMAV_ACTIF=non, développement)' };
  }

  const reponse = await dialoguer(chemin, config.piecesJointes.clamavSocket, config.piecesJointes.clamavDelaiMs);
  return interpreter(reponse);
}

/**
 * Interprète la ligne rendue par le démon.
 *
 * ⚠️ **Le cas par défaut est un refus, pas un « sain ».** Une réponse
 * inconnue — version de clamd différente, socket qui parle un autre protocole,
 * réponse tronquée — est une analyse qui n'a pas eu lieu. Rendre « saine » sur
 * ce qu'on n'a pas compris est la faute que ce module existe pour ne pas
 * commettre.
 */
export function interpreter(reponse: string): VerdictAntivirus {
  const ligne = reponse.replace(/\0+$/u, '').trim();

  if (/\bERROR$/u.test(ligne)) {
    throw new ErreurClamav(`clamd a rendu une erreur : ${ligne}`);
  }
  if (/\bOK$/u.test(ligne)) {
    return { etat: 'saine', resultat: ligne };
  }
  /* ⚠️ LU PAR DÉCOUPAGE, ET NON PAR UNE EXPRESSION — constat **Q-216** de la
     porte S8 (troisième passage).

     Cette ligne portait `/^\s*[^:]*:\s*(.+?)\s+FOUND$/u`, et c'était **la plus
     coûteuse de tout `src/`** : mesurée à **3 204 octets → 13 346 ms**, ×8 de
     temps pour ×2 d'entrée. Le `^` ancre `\s*`, mais il n'ancre **ni**
     l'ambiguïté entre `\s*` et `[^:]*` — qui peuvent tous deux consommer les
     mêmes espaces, d'où un nombre exponentiel de découpages à essayer — **ni**
     le `(.+?)\s+` qui suit.

     ⚠️ **Il n'y a pas de chemin d'attaque, et c'est justement le point.**
     `interpreter()` n'a aucun appelant hors de ce fichier, et son sujet est la
     réponse du démon LOCAL (`stream: <signature> FOUND\0`) : ni le nom du
     fichier déposé ni son contenu n'y entrent. Ce qui était en défaut n'était
     pas le produit, c'était **le garde-fou** qui prétendait couvrir cette
     classe et exonérait cette ligne — parce qu'il cherchait une ORTHOGRAPHE
     (`[^x]*`) au lieu de MESURER un coût. Le contrôle mesure désormais, et
     cette ligne est la seule qu'il ait trouvée.

     Le format de clamd est fixe : `<nom du flux>: <signature> FOUND`. Trois
     `indexOf` le lisent, chacun en une passe. */
  const SUFFIXE = ' FOUND';
  if (ligne.endsWith(SUFFIXE)) {
    const deuxPoints = ligne.indexOf(':');
    if (deuxPoints >= 0) {
      const signature = ligne.slice(deuxPoints + 1, ligne.length - SUFFIXE.length).trim();
      if (signature !== '') {
        return { etat: 'infectee', signature, resultat: ligne };
      }
    }
  }
  throw new ErreurClamav(`réponse de clamd incomprise : ${JSON.stringify(ligne.slice(0, 200))}`);
}

/**
 * Ouvre le socket, pousse le fichier, rend la ligne de réponse.
 *
 * Tout ce qui peut mal se passer se termine en `ErreurClamav` — y compris la
 * fin de connexion **sans réponse**, qui est le cas qu'on oublie : un démon
 * arrêté en cours d'envoi ferme proprement, et une lecture naïve rendrait la
 * chaîne vide, que `interpreter()` refuserait de toute façon. On la nomme ici
 * pour que le journal dise ce qui s'est passé.
 */
async function dialoguer(chemin: string, socketClamav: string, delaiMs: number): Promise<string> {
  return new Promise<string>((resoudre, rejeter) => {
    const lecture = createReadStream(chemin, { highWaterMark: TAILLE_BLOC });
    let socket: Socket | null = null;
    let recu = Buffer.alloc(0);
    let termine = false;

    // ⚠️ **LE GESTIONNAIRE D'ERREUR DE LECTURE SE POSE ICI, ET NULLE PART
    // AILLEURS — constat Q-135, porte S5.**
    //
    // Il était posé **à l'intérieur de `socket.on('connect')`**, c'est-à-dire
    // après un aller-retour réseau. `createReadStream` émet pourtant son `error`
    // dès la première boucle d'événements si le fichier est illisible — donc
    // AVANT que le gestionnaire existe. Node traite alors un `error` sans
    // écouteur comme une exception non rattrapée : **le processus meurt**.
    //
    // Mesuré par l'auditeur **6 fois sur 6** sur le point d'entrée réel — celui
    // que le timer systemd lance, et qui n'a aucun filet. Le serveur d'API en a
    // un, qui le convertit en `exit(1)` puis redémarrage : moins visible, pas
    // moins grave.
    //
    // La règle générale, et elle vaut au-delà de ce fichier : **un flux reçoit
    // son gestionnaire d'erreur dans la même instruction qui le crée.** Tout ce
    // qui s'interpose — un `await`, un rappel, une condition — est une fenêtre
    // pendant laquelle une erreur tue le processus.
    lecture.on('error', (erreur) => {
      echouer(new ErreurClamav(`lecture du fichier à analyser impossible : ${erreur.message}`));
    });

    const minuteur = setTimeout(() => {
      echouer(new ErreurClamav(`aucune réponse de clamd après ${String(delaiMs)} ms`));
    }, delaiMs);
    // Le minuteur ne doit pas maintenir le processus en vie à lui seul.
    minuteur.unref();

    const nettoyer = (): void => {
      clearTimeout(minuteur);
      lecture.destroy();
      socket?.destroy();
    };

    const echouer = (erreur: Error): void => {
      if (termine) return;
      termine = true;
      nettoyer();
      rejeter(
        erreur instanceof ErreurClamav
          ? erreur
          : new ErreurClamav(`${erreur.name}: ${erreur.message}`),
      );
    };

    const reussir = (valeur: string): void => {
      if (termine) return;
      termine = true;
      nettoyer();
      resoudre(valeur);
    };

    socket = connect(socketClamav);
    socket.on('error', (erreur) => {
      echouer(new ErreurClamav(`clamd injoignable sur « ${socketClamav} » : ${erreur.message}`));
    });
    socket.on('data', (bloc: Buffer) => {
      recu = Buffer.concat([recu, bloc]);
      // La réponse est terminée par un octet nul : on n'attend pas la fermeture
      // du socket pour la lire, clamd la gardant ouverte en mode « z ».
      if (recu.includes(0)) reussir(recu.toString('utf8'));
    });
    socket.on('end', () => {
      if (recu.length > 0) reussir(recu.toString('utf8'));
      else echouer(new ErreurClamav('clamd a fermé la connexion sans répondre'));
    });

    socket.on('connect', () => {
      const cible = socket;
      if (cible === null) return;
      cible.write(Buffer.from('zINSTREAM\0', 'latin1'));

      // `error` est déjà branché, à la création du flux — voir plus haut (Q-135).
      lecture.on('data', (morceau: string | Buffer) => {
        const octets = typeof morceau === 'string' ? Buffer.from(morceau) : morceau;
        const entete = Buffer.alloc(4);
        entete.writeUInt32BE(octets.length, 0);
        // Contre-pression : si le noyau n'accepte plus, on suspend la lecture
        // jusqu'au vidage. Sans cela, un fichier de 25 Mio remplirait la
        // mémoire du processus au lieu du tampon du socket.
        if (!cible.write(Buffer.concat([entete, octets]))) {
          lecture.pause();
          cible.once('drain', () => lecture.resume());
        }
      });
      lecture.on('end', () => {
        const fin = Buffer.alloc(4);
        fin.writeUInt32BE(0, 0);
        cible.write(fin);
      });
    });
  });
}
