/**
 * Lire un tableur — **XLSX et CSV, sans ajouter une dépendance.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'arbitrage, et pourquoi il n'est pas allé dans l'autre sens
 * ════════════════════════════════════════════════════════════════════════
 *
 * SheetJS est embarqué **dans le navigateur** (`js/lib/xlsx.full.min.js`), pas
 * dans le serveur : `package.json` ne porte que `fastify` et `pg`, et l'étendre
 * n'appartient pas à ce lot. Deux voies s'ouvraient :
 *
 *  (a) **CSV côté serveur, conversion XLSX au navigateur.** Écartée. La
 *      conversion vivrait dans `cyber-gouvernance_V4/`, qui appartient à un
 *      autre agent : le lot que le client qualifie de décisif dépendrait alors
 *      d'un fichier que celui-ci ne peut pas écrire, et le serveur refuserait
 *      le format même que l'utilisateur remplit. Elle déplace en outre
 *      l'empreinte d'idempotence sur le **résultat d'une transformation faite
 *      chez le client** : deux classeurs différents rendant le même CSV
 *      deviendraient « le même fichier », et la borne écrite au §33.2 — *un
 *      fichier modifié d'un octet est un fichier neuf* — cesserait d'être vraie.
 *
 *  (b) **Lire le XLSX ici.** Retenue, et à un coût borné : un `.xlsx` **est** un
 *      conteneur OOXML, et `src/pieces/zip.ts` sait déjà en ouvrir un. Ce
 *      fichier n'ajoute donc qu'un lecteur de feuille, pas un lecteur d'archive.
 *
 * ⚠️ **C'est un choix par contrainte, pas par préférence**, et il est écrit pour
 * qu'on puisse le contester — exactement comme `src/pieces/multipart.ts`
 * l'écrit du sien. Un analyseur de format écrit à la main est une surface
 * d'attaque. Celle-ci est atteinte **après** l'authentification, le contrôle des
 * droits et la borne de taille (crochet `onRequest` de `src/api/index.ts`,
 * condition E4), ce qui borne qui peut la solliciter — mais ne la rend pas juste
 * pour autant. La remplacer par une bibliothèque éprouvée est un candidat V1.1.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce module NE fait pas, et qu'il faut savoir avant de s'y fier
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Il ne lit pas `xl/styles.xml`.** Une cellule numérique formatée en date
 *    par Excel arrive donc ici comme un **nombre**, pas comme une date. Ce n'est
 *    pas une lacune contournée : c'est le contraire d'une devinette. La
 *    conversion est décidée par le **type du champ visé** (`moteur.ts`), qui est
 *    découvert dans le catalogue PostgreSQL — la seule autorité sur ce qu'une
 *    colonne attend. Lire les styles ferait dépendre l'interprétation d'une
 *    mise en forme, c'est-à-dire de ce que l'utilisateur voit plutôt que de ce
 *    que la base exige.
 *  · **Il ne lit pas les formules**, seulement leur dernier résultat calculé
 *    (`<v>`), qu'Excel écrit dans le fichier. Un classeur enregistré par un
 *    outil qui n'évalue pas les formules porte des cellules vides : elles
 *    seront rapportées comme telles, ligne par ligne.
 *  · **Il ne lit qu'une feuille** — la première de l'onglet, celle que
 *    `xl/workbook.xml` déclare en tête. Un modèle produit par ce lot met son
 *    aide sur une **seconde** feuille, précisément pour qu'elle ne soit jamais
 *    prise pour des données.
 *  · **Il refuse tout document portant une déclaration de type ou une entité**
 *    (`<!DOCTYPE`, `<!ENTITY`). C'est XXE et l'expansion d'entités fermées par
 *    construction plutôt que par prudence : aucun producteur OOXML n'en émet.
 */

import { ErreurZip, lireEntree, lireEntrees } from '../pieces/zip.js';

/* =====================================================================
 *  1. Ce qu'une lecture rend
 * ===================================================================== */

/**
 * Valeur d'une cellule, telle que le fichier la porte.
 *
 * `null` = cellule absente ou vide. **Aucune interprétation ici** : un nombre
 * reste un nombre, un texte reste un texte, et c'est `moteur.ts` qui décide ce
 * qu'en fait le champ visé.
 */
export type Cellule = string | number | boolean | null;

export interface LigneTableur {
  /**
   * Numéro de ligne **tel que l'utilisateur le voit dans son tableur**, en-tête
   * comprise. C'est le seul numéro qui lui permette de corriger son fichier : un
   * rapport qui dirait « ligne 12 » en comptant depuis les données enverrait
   * chercher la ligne 13.
   */
  readonly numero: number;
  readonly cellules: readonly Cellule[];
}

export interface Tableur {
  readonly enTetes: readonly string[];
  /** Numéro de la ligne d'en-tête, dans le repère de l'utilisateur. */
  readonly ligneEnTetes: number;
  readonly lignes: readonly LigneTableur[];
}

/** Refus de lecture. Le message est écrit pour un exploitant, pas pour un pirate. */
export class ErreurTableur extends Error {
  public override readonly name = 'ErreurTableur';
}

/* =====================================================================
 *  2. Bornes — ce au-delà de quoi un fichier d'import n'existe pas
 * ===================================================================== */

/**
 * Lignes de données lues au plus.
 *
 * Elle borde le **travail**, pas la mémoire : chaque ligne devient une création
 * dans une transaction unique, protégée par un point de reprise. La reprise d'un
 * export a été mesurée à ~20 s pour 8 000 enregistrements (`BORNES.lignesParReprise`,
 * `src/entites/index.ts`), et l'import paie en plus un point de reprise par ligne.
 * 5 000 lignes tiennent donc dans les 60 s que le vhost accorde
 * (`ProxyTimeout 60`) avec de la marge — au-delà, le client abandonnerait alors
 * que le serveur travaille encore, ce qui est le constat **Q-19**.
 *
 * ══ MESURÉ, le 05/09/2026, écritures réelles en base ═════════════════════
 *
 *     500 lignes  →  1,23 s     2 000 lignes →  4,30 s     5 000 lignes → 10,57 s
 *
 * soit ~2,1 ms par ligne, points de reprise et relecture compris.
 *
 * ⚠️ **UNE SECONDE BORNE, PLUS BASSE, S'APPLIQUE AU SEUL FORMAT XLSX, et il
 * faut la connaître.** `src/pieces/zip.ts` refuse toute entrée dépassant
 * **4 Mio une fois décomprimée** — c'est son garde-fou contre la bombe de
 * décompression, et le desserrer n'appartient pas à ce lot : il faudrait un
 * second endroit où se décide la même borne, ce que le dépôt paie cher à chaque
 * fois. Mesuré sur des classeurs engendrés par `classeur.ts` :
 *
 *     5 000 lignes ×  4 colonnes → 1,90 Mio décomprimés → LU
 *     5 000 lignes ×  6 colonnes → 2,7  Mio             → LU
 *     3 000 lignes × 12 colonnes → 4,0  Mio             → LU
 *     5 000 lignes × 12 colonnes → 6,62 Mio             → REFUSÉ
 *
 * Un classeur large de plus de ~3 000 lignes est donc refusé — avec un message
 * qui dit quoi faire (enregistrer en CSV, ou découper), et non le nom d'une
 * partie interne du conteneur. **Le CSV, lui, va jusqu'à 5 000 lignes** : il ne
 * traverse pas de conteneur.
 */
export const LIGNES_MAX = 5000;

/** Colonnes lues au plus. Le modèle le plus large en compte douze. */
export const COLONNES_MAX = 256;

/** Caractères d'une cellule. Au-delà, ce n'est plus une saisie de tableur. */
const CARACTERES_MAX_CELLULE = 100_000;

/* =====================================================================
 *  3. CSV — RFC 4180, plus ce que les tableurs français font vraiment
 * ===================================================================== */

/**
 * Décode les octets d'un CSV.
 *
 * UTF-8 d'abord. **Si le décodage produit un caractère de remplacement**, le
 * fichier n'était pas de l'UTF-8 : Excel en français enregistre encore ses CSV
 * en Windows-1252, et une filiale qui exporte depuis un vieil outil aussi. On
 * retente donc dans cet encodage plutôt que de rendre des « Éléments » en
 * mojibake — ce qui aurait été accepté sans un mot, et écrit tel quel en base.
 */
function decoderTexte(contenu: Buffer): string {
  const utf8 = contenu.toString('utf8');
  if (!utf8.includes('�')) return retirerBom(utf8);
  try {
    return retirerBom(new TextDecoder('windows-1252', { fatal: false }).decode(contenu));
  } catch {
    // `TextDecoder` sans ICU complet ne connaît pas cet encodage : on garde
    // l'UTF-8, caractères de remplacement compris. Ils seront visibles.
    return retirerBom(utf8);
  }
}

function retirerBom(texte: string): string {
  return texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
}

/**
 * Devine le séparateur de la **première ligne**, hors guillemets.
 *
 * Excel en français écrit `;`, Excel en anglais `,`, un export de base de
 * données `\t`. Le fichier ne le dit nulle part : on compte, sur la seule ligne
 * dont on sait qu'elle porte des en-têtes, et le plus fréquent gagne. À égalité
 * — c'est-à-dire quand aucun n'apparaît —, `;` est retenu : c'est celui que
 * produit le modèle téléchargé depuis ce lot.
 */
export function devinerSeparateur(premiereLigne: string): string {
  const comptes = new Map<string, number>([
    [';', 0],
    [',', 0],
    ['\t', 0],
  ]);
  let dansGuillemets = false;
  for (let index = 0; index < premiereLigne.length; index += 1) {
    const signe = premiereLigne[index] ?? '';
    if (signe === '"') {
      dansGuillemets = !dansGuillemets;
      continue;
    }
    if (dansGuillemets) continue;
    const compte = comptes.get(signe);
    if (compte !== undefined) comptes.set(signe, compte + 1);
  }
  let meilleur = ';';
  let meilleurCompte = 0;
  for (const [signe, compte] of comptes) {
    if (compte > meilleurCompte) {
      meilleur = signe;
      meilleurCompte = compte;
    }
  }
  return meilleur;
}

/**
 * Découpe un CSV.
 *
 * RFC 4180 : les champs peuvent être cités, un guillemet dans un champ cité
 * s'écrit `""`, une fin de ligne dans un champ cité en fait partie. Les fins de
 * ligne `\r\n` et `\n` sont acceptées ; un `\r` seul (vieux Mac) l'est aussi,
 * parce qu'un fichier venu d'une filiale rachetée n'a pas d'âge garanti.
 *
 * ⚠️ **Toute cellule est rendue comme du TEXTE.** Un CSV ne porte aucun type :
 * prétendre le contraire ferait de « 007 » le nombre 7, et d'un code de mesure
 * « 1-2 » une date. C'est `moteur.ts` qui convertit, d'après le champ visé.
 */
export function lireCsv(contenu: Buffer): Tableur {
  const texte = decoderTexte(contenu);
  const finPremiereLigne = texte.search(/\r\n|\n|\r/u);
  const separateur = devinerSeparateur(
    finPremiereLigne < 0 ? texte : texte.slice(0, finPremiereLigne),
  );

  const lignesBrutes: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let cite = false;

  const finirChamp = (): void => {
    ligne.push(champ.length > CARACTERES_MAX_CELLULE ? champ.slice(0, CARACTERES_MAX_CELLULE) : champ);
    champ = '';
  };
  const finirLigne = (): void => {
    finirChamp();
    lignesBrutes.push(ligne);
    ligne = [];
  };

  for (let index = 0; index < texte.length; index += 1) {
    const signe = texte[index] ?? '';
    if (cite) {
      if (signe !== '"') {
        champ += signe;
        continue;
      }
      if (texte[index + 1] === '"') {
        champ += '"';
        index += 1;
        continue;
      }
      cite = false;
      continue;
    }
    if (signe === '"' && champ === '') {
      cite = true;
      continue;
    }
    if (signe === separateur) {
      finirChamp();
      continue;
    }
    if (signe === '\n') {
      finirLigne();
      continue;
    }
    if (signe === '\r') {
      if (texte[index + 1] === '\n') index += 1;
      finirLigne();
      continue;
    }
    champ += signe;
  }
  // Un fichier qui ne finit pas par une fin de ligne a quand même une dernière
  // ligne. Ne pas la prendre perdrait un enregistrement, en silence.
  if (champ !== '' || ligne.length > 0) finirLigne();

  return assembler(lignesBrutes.map((cellules) => cellules.map((valeur) => valeur)));
}

/* =====================================================================
 *  4. XLSX — le conteneur OOXML, lu par `src/pieces/zip.ts`
 * ===================================================================== */

/** Parties du conteneur, avec leur nom canonique. */
const PARTIE_CLASSEUR = 'xl/workbook.xml';
const PARTIE_RELATIONS = 'xl/_rels/workbook.xml.rels';
const PARTIE_CHAINES = 'xl/sharedStrings.xml';
const PARTIE_FEUILLE_PAR_DEFAUT = 'xl/worksheets/sheet1.xml';

/**
 * Rend le texte d'une partie XML, **après avoir refusé toute déclaration de
 * type ou d'entité**.
 *
 * C'est la seule défense de ce module contre XXE et l'expansion d'entités, et
 * elle est volontairement brutale : on ne neutralise pas, on refuse. Aucun
 * producteur OOXML n'écrit de `<!DOCTYPE` dans ces parties ; un fichier qui en
 * porte un n'est pas un classeur qu'on veut lire.
 */
function texteDePartie(brut: Buffer | null, nom: string): string | null {
  if (brut === null) return null;
  const texte = brut.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/iu.test(texte)) {
    throw new ErreurTableur(
      `Ce classeur porte une déclaration XML que le serveur refuse de traiter (${nom}). ` +
        'Réenregistrez-le depuis votre tableur, puis recommencez.',
    );
  }
  return texte;
}

/** Décode les entités XML prédéfinies et les références numériques. */
export function decoderXml(texte: string): string {
  if (!texte.includes('&')) return texte;
  return texte.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entier, corps: string) => {
    const forme = corps.toLowerCase();
    if (forme === 'lt') return '<';
    if (forme === 'gt') return '>';
    if (forme === 'amp') return '&';
    if (forme === 'quot') return '"';
    if (forme === 'apos') return "'";
    if (forme.startsWith('#x')) {
      const point = Number.parseInt(forme.slice(2), 16);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entier;
    }
    if (forme.startsWith('#')) {
      const point = Number.parseInt(forme.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entier;
    }
    // Une entité que ce module ne connaît pas est rendue telle quelle : elle
    // n'est jamais RÉSOLUE, ce qui est le point (voir `texteDePartie`).
    return entier;
  });
}

/** Valeur d'un attribut dans un bloc d'attributs, ou `null`. */
function attribut(attributs: string, nom: string): string | null {
  const trouve = new RegExp(`\\b${nom}\\s*=\\s*"([^"]*)"`, 'u').exec(attributs);
  return trouve?.[1] === undefined ? null : decoderXml(trouve[1]);
}

/** Contenu concaténé de tous les `<t>` d'un fragment (les runs `<r>` compris). */
function textesDe(fragment: string): string {
  let texte = '';
  const balises = /<t\b[^>]*?\/>|<t\b[^>]*>([\s\S]*?)<\/t>/gu;
  let trouve: RegExpExecArray | null = balises.exec(fragment);
  while (trouve !== null) {
    texte += decoderXml(trouve[1] ?? '');
    if (texte.length > CARACTERES_MAX_CELLULE) return texte.slice(0, CARACTERES_MAX_CELLULE);
    trouve = balises.exec(fragment);
  }
  return texte;
}

/** Table des chaînes partagées, indexée par position — `<si/>` vide compris. */
function lireChainesPartagees(xml: string | null): readonly string[] {
  if (xml === null) return [];
  const chaines: string[] = [];
  const items = /<si\b[^>]*?\/>|<si\b[^>]*>([\s\S]*?)<\/si>/gu;
  let trouve: RegExpExecArray | null = items.exec(xml);
  while (trouve !== null) {
    // ⚠️ La branche auto-fermante compte AUSSI : `<si/>` occupe une position.
    // La sauter décalerait toutes les chaînes suivantes — c'est-à-dire écrirait
    // en base la valeur de la cellule d'à côté, sans un mot.
    chaines.push(trouve[1] === undefined ? '' : textesDe(trouve[1]));
    trouve = items.exec(xml);
  }
  return chaines;
}

/**
 * Chemin de la **première feuille de l'onglet**, d'après `workbook.xml` et ses
 * relations. Rend le chemin par défaut si l'un des deux manque.
 */
function cheminPremiereFeuille(classeur: string | null, relations: string | null): string {
  if (classeur === null || relations === null) return PARTIE_FEUILLE_PAR_DEFAUT;
  const feuille = /<sheet\b([^>]*)\/?>/u.exec(classeur);
  const identifiant =
    feuille?.[1] === undefined
      ? null
      : (attribut(feuille[1], 'r:id') ?? attribut(feuille[1], 'id'));
  if (identifiant === null) return PARTIE_FEUILLE_PAR_DEFAUT;

  const relation = new RegExp(`<Relationship\\b[^>]*\\bId="${identifiant}"[^>]*>`, 'u').exec(
    relations,
  );
  const cible = relation === null ? null : attribut(relation[0], 'Target');
  if (cible === null || cible === '') return PARTIE_FEUILLE_PAR_DEFAUT;
  // Une cible absolue commence par `/` et se lit depuis la racine du conteneur ;
  // une cible relative se lit depuis `xl/`.
  return cible.startsWith('/') ? cible.slice(1) : `xl/${cible.replace(/^\.\//u, '')}`;
}

/** Indice de colonne (0 fondé) d'une référence `A1`, `AB12`. Rend `null` si absente. */
export function indiceColonne(reference: string | null): number | null {
  if (reference === null) return null;
  const lettres = /^([A-Z]+)/u.exec(reference.toUpperCase())?.[1];
  if (lettres === undefined) return null;
  let indice = 0;
  for (const lettre of lettres) indice = indice * 26 + (lettre.charCodeAt(0) - 64);
  return indice - 1;
}

/** Numéro de ligne d'une référence `A12`. Rend `null` si absent. */
function numeroLigne(reference: string | null): number | null {
  const chiffres = reference === null ? undefined : /(\d+)$/u.exec(reference)?.[1];
  if (chiffres === undefined) return null;
  const numero = Number.parseInt(chiffres, 10);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** Lit une feuille et rend ses lignes brutes, indexées par position de colonne. */
function lireFeuille(xml: string, chaines: readonly string[]): Map<number, Cellule[]> {
  const parLigne = new Map<number, Cellule[]>();
  const lignes = /<row\b([^>]*?)\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/gu;

  let trouveLigne: RegExpExecArray | null = lignes.exec(xml);
  let position = 0;
  while (trouveLigne !== null) {
    position += 1;
    if (parLigne.size > LIGNES_MAX + 1) {
      throw new ErreurTableur(
        `Ce fichier porte plus de ${String(LIGNES_MAX)} lignes de données. ` +
          'Découpez-le en plusieurs imports.',
      );
    }
    const attributs = trouveLigne[1] ?? trouveLigne[2] ?? '';
    const corps = trouveLigne[3] ?? '';
    // `r` est facultatif dans la norme : à défaut, la ligne est à sa position.
    const numero = numeroLigne(`A${attribut(attributs, 'r') ?? ''}`) ?? position;

    const cellules: Cellule[] = [];
    const balises = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/gu;
    let trouveCellule: RegExpExecArray | null = balises.exec(corps);
    let colonneSuivante = 0;
    while (trouveCellule !== null) {
      const attributsCellule = trouveCellule[1] ?? trouveCellule[2] ?? '';
      const contenu = trouveCellule[3] ?? '';
      const colonne = indiceColonne(attribut(attributsCellule, 'r')) ?? colonneSuivante;
      colonneSuivante = colonne + 1;
      if (colonne < COLONNES_MAX) {
        while (cellules.length < colonne) cellules.push(null);
        cellules[colonne] = valeurCellule(attribut(attributsCellule, 't'), contenu, chaines);
      }
      trouveCellule = balises.exec(corps);
    }
    parLigne.set(numero, cellules);
    trouveLigne = lignes.exec(xml);
  }
  return parLigne;
}

/** Interprète le contenu d'une cellule d'après son attribut de type. */
function valeurCellule(type: string | null, contenu: string, chaines: readonly string[]): Cellule {
  const brut = /<v\b[^>]*?\/>|<v\b[^>]*>([\s\S]*?)<\/v>/u.exec(contenu)?.[1];
  const texteV = brut === undefined ? null : decoderXml(brut);

  switch (type) {
    case 's': {
      // Index dans la table des chaînes partagées. Un index hors table est une
      // cellule vide, pas une exception : le fichier est peut-être tronqué, et
      // ce défaut-là se voit mieux dans le rapport que dans une pile d'appel.
      const indice = texteV === null ? Number.NaN : Number.parseInt(texteV, 10);
      return Number.isInteger(indice) ? (chaines[indice] ?? null) : null;
    }
    case 'inlineStr':
      return textesDe(contenu) || null;
    case 'b':
      return texteV === '1';
    case 'e':
      // Erreur de formule (`#N/A`, `#REF!`). Rendue telle quelle : elle échouera
      // à la conversion, avec son texte, et l'utilisateur saura quoi corriger.
      return texteV;
    case 'str':
    case 'd':
      return texteV;
    default: {
      if (texteV === null || texteV.trim() === '') return null;
      const nombre = Number(texteV);
      return Number.isFinite(nombre) ? nombre : texteV;
    }
  }
}

/** Lit un classeur `.xlsx`. */
export function lireXlsx(contenu: Buffer): Tableur {
  let entrees;
  try {
    entrees = lireEntrees(contenu);
  } catch (erreur) {
    throw new ErreurTableur(
      "Ce fichier n'est pas un classeur Excel exploitable : " +
        (erreur instanceof ErreurZip ? erreur.message : 'conteneur illisible') +
        '.',
    );
  }

  let classeur: string | null;
  let relations: string | null;
  let chaines: readonly string[];
  let cheminFeuille: string;
  let feuille: string | null;
  try {
    classeur = texteDePartie(lireEntree(contenu, entrees, PARTIE_CLASSEUR), PARTIE_CLASSEUR);
    relations = texteDePartie(lireEntree(contenu, entrees, PARTIE_RELATIONS), PARTIE_RELATIONS);
    chaines = lireChainesPartagees(
      texteDePartie(lireEntree(contenu, entrees, PARTIE_CHAINES), PARTIE_CHAINES),
    );
    cheminFeuille = cheminPremiereFeuille(classeur, relations);
    feuille = texteDePartie(lireEntree(contenu, entrees, cheminFeuille), cheminFeuille);
  } catch (erreur) {
    if (erreur instanceof ErreurTableur) throw erreur;
    // ── La borne de décompression, dite en français et pas en chemin interne ──
    //
    // `src/pieces/zip.ts` refuse une entrée dépassant 4 Mio une fois décomprimée
    // — c'est son garde-fou contre la bombe de décompression, et il n'appartient
    // pas à ce lot de le desserrer (voir la note de `LIGNES_MAX`). Le message
    // brut nomme une partie interne du conteneur, ce qui n'aide personne : on
    // dit plutôt ce que l'utilisateur peut FAIRE.
    if (erreur instanceof ErreurZip && /décompressée/u.test(erreur.message)) {
      throw new ErreurTableur(
        'Ce classeur est trop volumineux pour être analysé. Enregistrez-le au format CSV, ' +
          'ou découpez-le en plusieurs fichiers de moins de 3 000 lignes.',
      );
    }
    throw new ErreurTableur(
      'Ce classeur ne peut pas être lu : ' +
        (erreur instanceof ErreurZip ? erreur.message : 'partie interne illisible') +
        '.',
    );
  }

  if (feuille === null) {
    throw new ErreurTableur(
      'Ce classeur ne contient aucune feuille lisible. Réenregistrez-le au format .xlsx.',
    );
  }

  const parLigne = lireFeuille(feuille, chaines);
  const numeros = [...parLigne.keys()].sort((a, b) => a - b);
  // ⚠️ On reconstruit la suite en respectant les NUMÉROS du fichier : une feuille
  // dont la ligne 7 est vide n'écrit pas de `<row r="7">`, et compacter ferait
  // dire « ligne 12 » au rapport pour la ligne 13 de l'utilisateur.
  const grille: { numero: number; cellules: Cellule[] }[] = numeros.map((numero) => ({
    numero,
    cellules: parLigne.get(numero) ?? [],
  }));
  return assemblerNumerotees(grille);
}

/* =====================================================================
 *  5. Assemblage commun
 * ===================================================================== */

/** Une ligne est vide si aucune de ses cellules ne porte quoi que ce soit. */
export function ligneVide(cellules: readonly Cellule[]): boolean {
  return cellules.every(
    (cellule) => cellule === null || (typeof cellule === 'string' && cellule.trim() === ''),
  );
}

/** Assemble des lignes non numérotées (CSV) : la position fait le numéro. */
function assembler(grille: readonly (readonly string[])[]): Tableur {
  return assemblerNumerotees(
    grille.map((cellules, index) => ({
      numero: index + 1,
      cellules: cellules.map((valeur) => (valeur === '' ? null : valeur)),
    })),
  );
}

/**
 * Assemble des lignes déjà numérotées.
 *
 * La **première ligne non vide** porte les en-têtes : un fichier qui commence
 * par une ligne de titre ou par un saut reste exploitable, et son numéro est
 * conservé pour le rapport.
 */
function assemblerNumerotees(
  grille: readonly { numero: number; cellules: readonly Cellule[] }[],
): Tableur {
  const premiere = grille.findIndex((ligne) => !ligneVide(ligne.cellules));
  if (premiere < 0) {
    throw new ErreurTableur('Ce fichier est vide : aucune ligne d’en-tête n’a été trouvée.');
  }
  const enTete = grille[premiere];
  if (enTete === undefined) {
    throw new ErreurTableur('Ce fichier est vide : aucune ligne d’en-tête n’a été trouvée.');
  }

  const enTetes = enTete.cellules
    .slice(0, COLONNES_MAX)
    .map((cellule) => (cellule === null ? '' : String(cellule).trim()));

  const lignes = grille
    .slice(premiere + 1)
    .map((ligne) => ({ numero: ligne.numero, cellules: ligne.cellules.slice(0, COLONNES_MAX) }));

  if (lignes.length > LIGNES_MAX) {
    throw new ErreurTableur(
      `Ce fichier porte ${String(lignes.length)} lignes de données, au-delà des ` +
        `${String(LIGNES_MAX)} qu'un import accepte. Découpez-le en plusieurs fichiers.`,
    );
  }

  return { enTetes, ligneEnTetes: enTete.numero, lignes };
}

/* =====================================================================
 *  6. Le point d'entrée : reconnaître le format
 * ===================================================================== */

/** Format retenu, dans le vocabulaire de `imports.source` (`ck_imports_source`). */
export type SourceImport = 'excel' | 'csv';

/**
 * Lit un fichier d'import.
 *
 * Le format est décidé par la **signature binaire**, pas par l'extension : un
 * `.csv` qui est en réalité un classeur, ou l'inverse, est un accident courant
 * chez qui exporte depuis un vieil outil. `PK\x03\x04` désigne un conteneur ZIP,
 * donc un `.xlsx` ; tout le reste est traité en CSV.
 */
export function lireTableur(contenu: Buffer): { source: SourceImport; tableur: Tableur } {
  if (contenu.length === 0) {
    throw new ErreurTableur('Le fichier est vide. Aucun import n’a été tenté.');
  }
  const estZip =
    contenu.length >= 4 &&
    contenu[0] === 0x50 &&
    contenu[1] === 0x4b &&
    contenu[2] === 0x03 &&
    contenu[3] === 0x04;
  return estZip
    ? { source: 'excel', tableur: lireXlsx(contenu) }
    : { source: 'csv', tableur: lireCsv(contenu) };
}
