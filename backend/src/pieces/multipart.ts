/**
 * Analyse d'un corps `multipart/form-data` — RFC 7578, et rien de plus.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et pourquoi ce n'est pas une bonne nouvelle
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le serveur n'a que deux dépendances d'exécution — `fastify` et `pg` —, et
 * `package.json` n'appartient pas à cet agent. `@fastify/multipart` n'est donc
 * pas installé, et l'écrire soi-même est la seule voie ouverte aujourd'hui.
 *
 * ⚠️ **C'est un choix par contrainte, pas par préférence, et il est écrit pour
 * qu'on puisse le contester** : un analyseur de protocole écrit à la main est
 * une surface d'attaque, et celui-ci est atteint **après** l'authentification
 * et le contrôle des droits (crochet `onRequest` de `src/api/index.ts`,
 * condition E4), ce qui borne qui peut le solliciter — mais ne le rend pas juste
 * pour autant. Le remplacer par une bibliothèque éprouvée est un candidat V1.1.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qu'il fait, et surtout ce qu'il NE fait pas
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · Il travaille sur un **tampon déjà borné** : le contrôle n° 1 du §31.2 a
 *    déjà refusé tout ce qui dépasse (`index.ts`, analyseur de type de contenu).
 *    Il n'alloue donc rien qui ne soit déjà en mémoire.
 *  · Il **ne décode aucun transfert** : `Content-Transfer-Encoding` est ignoré
 *    par le RFC 7578 §4.7, et un `base64` annoncé serait rendu tel quel — ce que
 *    les contrôles n° 3 et 4 refuseraient, faute de signature reconnaissable.
 *  · Il **ne devine pas** : pas de frontière tolérée, pas de fin de partie
 *    approximative, pas de `\n` accepté à la place de `\r\n`. Ce qu'il ne
 *    comprend pas est refusé.
 *  · Il **ne touche pas au disque**, et ne connaît aucun chemin.
 *
 * ⚠️ **Le nom de fichier qu'il rend est une valeur d'ATTAQUANT.** Il n'est ni
 * nettoyé ni tronqué ici : le nettoyer au passage donnerait à croire, plus loin,
 * qu'il est sûr. Il l'est d'autant moins qu'il ne sert **jamais** à fabriquer un
 * chemin (le nom sur le disque est tiré au sort, §31.2 contrôle n° 5) et qu'il
 * doit être cité, jamais concaténé, dans l'en-tête de délivrance.
 */

/** Une partie du corps, telle qu'elle a été reçue. */
export interface PartieMultipart {
  /** Nom du champ de formulaire (`name="…"`), tel quel. */
  readonly nom: string;
  /** Nom de fichier annoncé (`filename="…"`), ou `null` pour un champ simple. */
  readonly nomFichier: string | null;
  /** Type MIME annoncé par le déposant, ou `null`. **Jamais une constatation.** */
  readonly typeDeclare: string | null;
  readonly contenu: Buffer;
}

/** Refus d'analyse. Le message est destiné au journal, pas à l'utilisateur. */
export class ErreurMultipart extends Error {
  public override readonly name = 'ErreurMultipart';
}

/** Bornes de sûreté — un envoi ordinaire en est très loin. */
const MAX_PARTIES = 16;
const MAX_ENTETES_OCTETS = 8 * 1024;

const CRLF = Buffer.from('\r\n', 'latin1');
const CRLFCRLF = Buffer.from('\r\n\r\n', 'latin1');

/**
 * Extrait la frontière déclarée dans l'en-tête `content-type`.
 *
 * Le RFC 2046 §5.1.1 borne la frontière à 70 caractères d'un alphabet fermé ;
 * on l'applique, parce qu'une frontière libre serait un motif de recherche
 * fourni par l'appelant.
 */
export function frontiereDe(entete: string): string {
  const trouve = /;\s*boundary\s*=\s*("([^"]+)"|([^;\s]+))/iu.exec(entete);
  const valeur = trouve?.[2] ?? trouve?.[3] ?? null;
  if (valeur === null || valeur === '') {
    throw new ErreurMultipart('en-tête content-type sans frontière (boundary)');
  }
  if (valeur.length > 70 || !/^[0-9A-Za-z'()+_,\-./:=?]+$/u.test(valeur)) {
    throw new ErreurMultipart('frontière multipart hors de la forme admise par le RFC 2046');
  }
  return valeur;
}

/**
 * Découpe le corps.
 *
 * L'algorithme suit le RFC à la lettre : on se place sur la première frontière,
 * puis chaque tour lit un bloc d'en-têtes terminé par une ligne vide, puis un
 * contenu qui court jusqu'à `CRLF--frontière`.
 */
export function analyserMultipart(corps: Buffer, enteteContentType: string): PartieMultipart[] {
  const frontiere = frontiereDe(enteteContentType);
  const marqueur = Buffer.from(`--${frontiere}`, 'latin1');
  const separateur = Buffer.concat([CRLF, marqueur]);

  let position = corps.indexOf(marqueur);
  if (position < 0) throw new ErreurMultipart('aucune frontière dans le corps');
  position += marqueur.length;

  const parties: PartieMultipart[] = [];

  for (;;) {
    // Après une frontière : soit « -- » (fin du corps), soit une fin de ligne.
    if (corps.length >= position + 2 && corps[position] === 0x2d && corps[position + 1] === 0x2d) {
      return parties;
    }
    const finLigne = corps.indexOf(CRLF, position);
    if (finLigne < 0) throw new ErreurMultipart('frontière non terminée');
    position = finLigne + CRLF.length;

    const finEntetes = corps.indexOf(CRLFCRLF, position);
    if (finEntetes < 0) throw new ErreurMultipart('bloc d’en-têtes de partie non terminé');
    if (finEntetes - position > MAX_ENTETES_OCTETS) {
      throw new ErreurMultipart('bloc d’en-têtes de partie hors borne');
    }
    const entetes = corps.subarray(position, finEntetes).toString('utf8');
    position = finEntetes + CRLFCRLF.length;

    const finContenu = corps.indexOf(separateur, position);
    if (finContenu < 0) throw new ErreurMultipart('partie non terminée par une frontière');
    const contenu = corps.subarray(position, finContenu);
    position = finContenu + separateur.length;

    const disposition = enteteDe(entetes, 'content-disposition');
    if (disposition === null) throw new ErreurMultipart('partie sans content-disposition');
    const nom = parametreDe(disposition, 'name');
    if (nom === null) throw new ErreurMultipart('partie sans nom de champ');

    parties.push({
      nom,
      nomFichier: parametreDe(disposition, 'filename'),
      typeDeclare: enteteDe(entetes, 'content-type'),
      // `Buffer.from` et non la vue : la vue garderait le corps entier en
      // mémoire tant que la partie vit, et le corps entier fait 25 Mio.
      contenu: Buffer.from(contenu),
    });

    if (parties.length > MAX_PARTIES) {
      throw new ErreurMultipart(`plus de ${String(MAX_PARTIES)} parties dans le corps`);
    }
  }
}

/** Valeur d'un en-tête de partie, insensible à la casse. */
function enteteDe(bloc: string, nom: string): string | null {
  for (const ligne of bloc.split('\r\n')) {
    const separateur = ligne.indexOf(':');
    if (separateur < 0) continue;
    if (ligne.slice(0, separateur).trim().toLowerCase() === nom) {
      return ligne.slice(separateur + 1).trim();
    }
  }
  return null;
}

/**
 * Paramètre d'un en-tête (`name="…"`, `filename="…"`).
 *
 * ⚠️ **`filename*` (RFC 5987) est délibérément ignoré.** Les navigateurs ne
 * l'emploient pas en `multipart/form-data` — ils envoient le nom en UTF-8 brut
 * dans `filename` —, et le décoder ouvrirait un second chemin d'analyse pour la
 * même valeur d'attaquant. Un chemin, pas deux.
 */
function parametreDe(entete: string, nom: string): string | null {
  const cite = new RegExp(`;\\s*${nom}\\s*=\\s*"([^"]*)"`, 'iu').exec(entete);
  if (cite?.[1] !== undefined) return cite[1];
  const nu = new RegExp(`;\\s*${nom}\\s*=\\s*([^;\\s]+)`, 'iu').exec(entete);
  return nu?.[1] ?? null;
}
