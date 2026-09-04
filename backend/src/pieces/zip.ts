/**
 * Lecture d'un conteneur ZIP — **le strict nécessaire au contrôle n° 4.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, alors que le §31 ne parle pas de ZIP
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le contrôle n° 4 du `CONVENTIONS.md` §31.2 exige que **la signature binaire
 * concorde avec l'extension et le type MIME annoncés**. Pour un PDF ou un PNG,
 * la signature est une suite d'octets de tête et le contrôle tient en une
 * comparaison. Pour les formats Office modernes, elle ne prouve rien : `.docx`,
 * `.xlsx`, `.pptx`, `.docm`, `.xlsm`, `.pptm`, `.odt`, `.jar` et un banal `.zip`
 * commencent **tous** par les quatre mêmes octets, `PK\x03\x04`.
 *
 * Autrement dit : sur les trois types Office de la liste blanche, une
 * comparaison d'octets de tête laisserait passer exactement ce que le §31
 * demande de refuser — **les formats à macros et les archives**. Il suffirait de
 * renommer `charge.docm` en `charge.docx`.
 *
 * Le contrôle doit donc regarder **ce que le conteneur contient**, et c'est ce
 * que ce module rend possible :
 *
 *  · la liste des entrées, qui dit s'il s'y trouve un `vbaProject.bin` ;
 *  · le contenu de `[Content_Types].xml`, qui dit **de quel type le document se
 *    déclare lui-même** — un `.docm` renommé continue d'y déclarer sa partie
 *    principale « macroEnabled », parce que Word ne saurait plus l'ouvrir
 *    autrement. C'est la propriété qu'un attaquant ne peut pas retirer sans
 *    casser son propre document.
 *
 * ⚠️ **Ce n'est pas une bibliothèque ZIP**, et il ne faut pas la faire grandir
 * en une. Elle lit le répertoire central, elle décomprime **une** entrée nommée,
 * elle refuse tout ce qu'elle ne comprend pas. Rien de ce qu'elle rend n'est
 * écrit sur le disque, et rien n'est extrait « au cas où ».
 *
 * ── Ce qu'elle refuse, et pourquoi le refus est la bonne réponse ─────────
 *
 * ZIP64, archives multi-volumes, chiffrement, méthodes de compression autres que
 * « stocké » et « dégonflé » : **refusés**, pas contournés. Un document Office
 * de moins de 25 Mio produit par Word, Excel ou PowerPoint n'en emploie aucun.
 * Refuser ce qu'on ne sait pas lire est la seule attitude sûre pour un contrôle
 * de sécurité : ce qu'on ne comprend pas, on ne le déclare pas conforme.
 *
 * ⚠️ Et la phrase qui gouverne tout ce lot : **aucun dispositif ne garantit
 * l'absence de malware.** Ce module ferme une porte nommée, il n'en ferme aucune
 * autre (`CONVENTIONS.md` §31.4, §17.5).
 */

import { inflateRawSync } from 'node:zlib';

/** Signature du répertoire central : `PK\x01\x02`. */
const SIG_CENTRAL = 0x02014b50;
/** Signature d'un en-tête local : `PK\x03\x04`. */
const SIG_LOCAL = 0x04034b50;
/** Signature de fin de répertoire central : `PK\x05\x06`. */
const SIG_FIN = 0x06054b50;

/**
 * Bornes de sûreté. Elles ne sont pas des réglages : ce sont les bornes au-delà
 * desquelles un document Office ordinaire n'existe pas, et où continuer à lire
 * ne servirait plus qu'à travailler pour un attaquant.
 */
const MAX_ENTREES = 4096;
/** `[Content_Types].xml` d'un classeur de 400 feuilles pèse quelques dizaines de kio. */
const MAX_DECOMPRESSE = 4 * 1024 * 1024;
/** Le commentaire de fin d'archive tient sur 16 bits : la zone à balayer est bornée. */
const MAX_COMMENTAIRE = 0xffff;

/** Entrée du répertoire central, réduite à ce que le contrôle regarde. */
export interface EntreeZip {
  /** Nom tel qu'il est stocké, séparateurs `/` compris. */
  readonly nom: string;
  readonly methode: number;
  readonly tailleCompressee: number;
  readonly tailleDecompressee: number;
  readonly decalageLocal: number;
}

/** Ce qu'un conteneur illisible rend : un motif, jamais une exception muette. */
export class ErreurZip extends Error {
  public override readonly name = 'ErreurZip';
}

/**
 * Lit le répertoire central et rend les entrées.
 *
 * @throws {ErreurZip} dès que la structure n'est pas celle d'un ZIP simple.
 */
export function lireEntrees(donnees: Buffer): readonly EntreeZip[] {
  const finRepertoire = trouverFinRepertoire(donnees);

  // Archive répartie sur plusieurs volumes : le disque courant et celui du
  // répertoire central doivent être 0. Autre chose = on ne lit pas tout.
  if (donnees.readUInt16LE(finRepertoire + 4) !== 0 || donnees.readUInt16LE(finRepertoire + 6) !== 0) {
    throw new ErreurZip('archive répartie sur plusieurs volumes');
  }

  const nombre = donnees.readUInt16LE(finRepertoire + 10);
  const debut = donnees.readUInt32LE(finRepertoire + 16);

  // 0xFFFF / 0xFFFFFFFF sont les sentinelles ZIP64. On ne lit pas ZIP64 : on
  // le dit, plutôt que de lire un décalage qui ne veut rien dire.
  if (nombre === 0xffff || debut === 0xffffffff) {
    throw new ErreurZip('archive au format ZIP64');
  }
  if (nombre > MAX_ENTREES) {
    throw new ErreurZip(`archive à ${String(nombre)} entrées`);
  }
  if (debut >= donnees.length) {
    throw new ErreurZip('répertoire central hors des données');
  }

  const entrees: EntreeZip[] = [];
  let position = debut;

  for (let index = 0; index < nombre; index += 1) {
    if (position + 46 > donnees.length || donnees.readUInt32LE(position) !== SIG_CENTRAL) {
      throw new ErreurZip('répertoire central tronqué');
    }
    const drapeaux = donnees.readUInt16LE(position + 8);
    // Bit 0 : entrée chiffrée. Une entrée qu'on ne peut pas lire est une entrée
    // qu'on ne peut pas contrôler.
    if ((drapeaux & 0x0001) !== 0) throw new ErreurZip('entrée chiffrée');

    const longueurNom = donnees.readUInt16LE(position + 28);
    const longueurExtra = donnees.readUInt16LE(position + 30);
    const longueurCommentaire = donnees.readUInt16LE(position + 32);
    const finEntree = position + 46 + longueurNom + longueurExtra + longueurCommentaire;
    if (finEntree > donnees.length) throw new ErreurZip('entrée du répertoire tronquée');

    entrees.push({
      // Le bit 11 signale un nom en UTF-8 ; les producteurs Office le posent.
      // Décoder en UTF-8 dans tous les cas est sans danger ici : le nom ne sert
      // qu'à des comparaisons, jamais à fabriquer un chemin sur le disque.
      nom: donnees.subarray(position + 46, position + 46 + longueurNom).toString('utf8'),
      methode: donnees.readUInt16LE(position + 10),
      tailleCompressee: donnees.readUInt32LE(position + 20),
      tailleDecompressee: donnees.readUInt32LE(position + 24),
      decalageLocal: donnees.readUInt32LE(position + 42),
    });
    position = finEntree;
  }

  return entrees;
}

/**
 * Décomprime **une** entrée nommée, et rend `null` si elle n'existe pas.
 *
 * La comparaison de nom est exacte : on cherche `[Content_Types].xml` à la
 * racine, pas « un fichier qui s'appelle à peu près comme ça ».
 */
export function lireEntree(
  donnees: Buffer,
  entrees: readonly EntreeZip[],
  nom: string,
): Buffer | null {
  const entree = entrees.find((e) => e.nom === nom);
  if (entree === undefined) return null;

  if (entree.tailleDecompressee > MAX_DECOMPRESSE) {
    throw new ErreurZip(`entrée « ${nom} » décompressée à ${String(entree.tailleDecompressee)} o`);
  }

  const local = entree.decalageLocal;
  if (local + 30 > donnees.length || donnees.readUInt32LE(local) !== SIG_LOCAL) {
    throw new ErreurZip(`en-tête local absent pour « ${nom} »`);
  }
  const longueurNom = donnees.readUInt16LE(local + 26);
  const longueurExtra = donnees.readUInt16LE(local + 28);
  const debut = local + 30 + longueurNom + longueurExtra;
  const fin = debut + entree.tailleCompressee;
  if (fin > donnees.length) throw new ErreurZip(`données tronquées pour « ${nom} »`);

  const brut = donnees.subarray(debut, fin);
  if (entree.methode === 0) return Buffer.from(brut);
  if (entree.methode !== 8) {
    throw new ErreurZip(`méthode de compression ${String(entree.methode)} non gérée`);
  }
  try {
    // `maxOutputLength` : c'est le garde-fou contre la bombe de décompression.
    // Sans lui, une entrée annonçant 4 Mio pourrait en produire mille.
    return inflateRawSync(brut, { maxOutputLength: MAX_DECOMPRESSE });
  } catch (erreur) {
    throw new ErreurZip(
      `décompression refusée pour « ${nom} » : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    );
  }
}

/**
 * Retrouve l'enregistrement de fin de répertoire central.
 *
 * Il se cherche **depuis la fin**, parce qu'il est suivi d'un commentaire de
 * longueur variable. On borne le balayage à ce que le format autorise : au-delà,
 * ce n'est plus un ZIP, c'est autre chose qui contient les mêmes quatre octets.
 */
function trouverFinRepertoire(donnees: Buffer): number {
  const minimum = Math.max(0, donnees.length - MAX_COMMENTAIRE - 22);
  for (let position = donnees.length - 22; position >= minimum; position -= 1) {
    if (donnees.readUInt32LE(position) === SIG_FIN) {
      // Le commentaire annoncé doit finir exactement à la fin du fichier :
      // c'est ce qui distingue le vrai enregistrement d'une coïncidence
      // d'octets à l'intérieur des données compressées.
      const longueurCommentaire = donnees.readUInt16LE(position + 20);
      if (position + 22 + longueurCommentaire === donnees.length) return position;
    }
  }
  throw new ErreurZip('fin de répertoire central introuvable');
}
