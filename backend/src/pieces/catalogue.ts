/**
 * Contrôles n° 3 et n° 4 — **la liste blanche, et la signature binaire.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Aucun dispositif ne garantit l'absence de malware
 * ════════════════════════════════════════════════════════════════════════
 *
 * C'est la phrase que le `PLAN_SERVEUR` §1.6 met en tête, et que le
 * `CONVENTIONS.md` §31.4 exige de retrouver dans le code. Ce fichier ferme des
 * portes **nommées** — un exécutable renommé, une archive déguisée, un document
 * à macros —, il ne promet pas qu'il n'en reste aucune. Le §17.5 s'applique :
 * un garde-fou ne se voit pas prêter plus de portée qu'il n'en a.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi une liste BLANCHE, et pourquoi c'est ici le bon outil
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `CLAUDE.md` §3 tranche qu'une liste écrite à la main est le mauvais outil
 * *quand son incomplétude fait réussir quelque chose en silence*. Ici c'est
 * l'inverse, et c'est le cas où la liste est le bon outil : **ce qu'elle ne
 * nomme pas est refusé**. Une omission ne laisse rien passer — elle empêche un
 * dépôt légitime, bruyamment, et quelqu'un vient demander qu'on ajoute le type.
 * Une liste NOIRE aurait la propriété inverse, et c'est pourquoi le §31.2 impose
 * la blanche : `.docm`, `.xlsm`, `.pptm`, `.exe`, `.scr`, `.js`, `.hta`, `.lnk`,
 * `.iso`… aucune énumération d'interdits n'a jamais été complète.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrôle n° 4 est le seul que l'attaquant ne choisit pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'extension et le type MIME sont **déclarés par le déposant** : il les écrit
 * comme il veut. Les octets, non — ils sont ce que le fichier est. D'où la
 * règle du §31.2 : la signature doit **concorder** avec l'extension et le type
 * MIME annoncés, et c'est la signature qui a le dernier mot.
 *
 * Trois natures de reconnaissance, parce que trois familles de formats :
 *
 * | Nature | Formats | Ce qui est constaté |
 * |---|---|---|
 * | `octets` | PDF, PNG, JPEG | une suite d'octets de tête, exacte |
 * | `ooxml`  | DOCX, XLSX, PPTX | le conteneur ZIP est ouvert et **interrogé** (`zip.ts`) |
 * | `texte`  | CSV, TXT | les octets sont du texte : UTF-8 valide, sans caractère de commande |
 *
 * ⚠️ **La nature `octets` ne suffisait pas pour Office, et c'est le piège de ce
 * contrôle.** `.docx`, `.docm`, `.xlsm`, `.odt`, `.jar` et un `.zip` d'archive
 * commencent par les **mêmes** quatre octets `PK\x03\x04`. Une comparaison de
 * tête aurait déclaré conforme un `.docm` renommé — c'est-à-dire précisément ce
 * que le §31.2 demande de refuser. On ouvre donc le conteneur.
 *
 * ⚠️ **Et la nature `texte` n'est pas une dispense.** Un format sans signature
 * n'est pas un format sans contrôle : on vérifie une propriété **positive** —
 * ce sont des caractères de texte —, ce qui suffit à refuser tout binaire, un
 * exécutable ELF ou PE compris (ils portent des octets nuls dès leur en-tête).
 */

import { ErreurZip, lireEntree, lireEntrees } from './zip.js';

/* =====================================================================
 *  Ce qu'un type autorisé déclare
 * ===================================================================== */

/** Comment on constate qu'un contenu est bien de ce type. */
export type Reconnaissance =
  | { readonly genre: 'octets'; readonly prefixes: readonly string[] }
  | { readonly genre: 'ooxml'; readonly partiePrincipale: string }
  | { readonly genre: 'texte' };

export interface TypeAutorise {
  /** Clé courte, employée dans les journaux et les essais. */
  readonly cle: string;
  /** Extensions admises, en minuscules, sans le point. */
  readonly extensions: readonly string[];
  /**
   * Type MIME **constaté** — celui que la base enregistre et que la délivrance
   * renvoie. Jamais celui que le déposant a annoncé (§31.3).
   */
  readonly typeMimeConstate: string;
  /**
   * Déclarations admises du déposant.
   *
   * ⚠️ `application/octet-stream` n'y figure nulle part, **délibérément**. C'est
   * le « je ne sais pas » du MIME : l'admettre reviendrait à faire concorder
   * n'importe quoi avec n'importe quoi, et le mot « concordance » du §31.2
   * n'aurait plus d'objet. Il est traité comme une déclaration ABSENTE — voir
   * `declarationConcorde()`, qui explique pourquoi une déclaration absente ne
   * fait pas échouer le dépôt alors qu'une déclaration fausse le fait.
   */
  readonly declarationsAdmises: readonly string[];
  /**
   * Ce type est-il admis comme **logo de filiale** ?
   *
   * §31.3 : « PNG ou JPEG exclusivement — pas de SVG, qui porte du script et
   * s'afficherait *dans* l'interface ». Un logo est la seule pièce dont le
   * contenu s'exécuterait dans l'origine de l'application si on le laissait
   * faire.
   */
  readonly logo: boolean;
  readonly reconnaissance: Reconnaissance;
}

/* =====================================================================
 *  La liste blanche
 * ===================================================================== */

/**
 * Les types acceptés, et rien d'autre.
 *
 * ⚠️ **Ne pas y ajouter un type sans regarder sa nature de reconnaissance.**
 * Ajouter `.odt` en `octets: ['PK\x03\x04']` rouvrirait, pour tous les formats
 * ZIP à la fois, le trou que la nature `ooxml` vient de fermer.
 *
 * Ce qui est refusé et qu'on lit **par l'absence** : archives (`.zip`, `.7z`,
 * `.rar`, `.tar`, `.gz`), exécutables (`.exe`, `.dll`, `.scr`, `.com`, `.msi`,
 * `.bat`, `.cmd`, `.ps1`, `.sh`, `.jar`), formats à macros (`.docm`, `.xlsm`,
 * `.pptm`, et les `.doc`/`.xls` anciens qui en portent aussi), et **`.svg`**,
 * qui est du script déguisé en image.
 */
export const TYPES_AUTORISES: readonly TypeAutorise[] = Object.freeze([
  Object.freeze({
    cle: 'pdf',
    extensions: Object.freeze(['pdf']),
    typeMimeConstate: 'application/pdf',
    declarationsAdmises: Object.freeze(['application/pdf']),
    logo: false,
    reconnaissance: Object.freeze({ genre: 'octets', prefixes: Object.freeze(['%PDF-']) }),
  }),
  Object.freeze({
    cle: 'png',
    extensions: Object.freeze(['png']),
    typeMimeConstate: 'image/png',
    declarationsAdmises: Object.freeze(['image/png']),
    logo: true,
    reconnaissance: Object.freeze({
      genre: 'octets',
      prefixes: Object.freeze(['\x89PNG\r\n\x1a\n']),
    }),
  }),
  Object.freeze({
    cle: 'jpeg',
    extensions: Object.freeze(['jpg', 'jpeg']),
    typeMimeConstate: 'image/jpeg',
    declarationsAdmises: Object.freeze(['image/jpeg', 'image/jpg']),
    logo: true,
    reconnaissance: Object.freeze({ genre: 'octets', prefixes: Object.freeze(['\xff\xd8\xff']) }),
  }),
  Object.freeze({
    cle: 'docx',
    extensions: Object.freeze(['docx']),
    typeMimeConstate: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    declarationsAdmises: Object.freeze([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
    logo: false,
    reconnaissance: Object.freeze({
      genre: 'ooxml',
      partiePrincipale:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    }),
  }),
  Object.freeze({
    cle: 'xlsx',
    extensions: Object.freeze(['xlsx']),
    typeMimeConstate: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    declarationsAdmises: Object.freeze([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]),
    logo: false,
    reconnaissance: Object.freeze({
      genre: 'ooxml',
      partiePrincipale:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    }),
  }),
  Object.freeze({
    cle: 'pptx',
    extensions: Object.freeze(['pptx']),
    typeMimeConstate: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    declarationsAdmises: Object.freeze([
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]),
    logo: false,
    reconnaissance: Object.freeze({
      genre: 'ooxml',
      partiePrincipale:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    }),
  }),
  Object.freeze({
    cle: 'csv',
    extensions: Object.freeze(['csv']),
    typeMimeConstate: 'text/csv',
    // Les tableurs francophones annoncent volontiers un CSV comme un classeur
    // Excel : c'est le système d'exploitation du déposant qui parle, pas lui.
    declarationsAdmises: Object.freeze([
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
    ]),
    logo: false,
    reconnaissance: Object.freeze({ genre: 'texte' }),
  }),
  Object.freeze({
    cle: 'txt',
    extensions: Object.freeze(['txt']),
    typeMimeConstate: 'text/plain',
    declarationsAdmises: Object.freeze(['text/plain']),
    logo: false,
    reconnaissance: Object.freeze({ genre: 'texte' }),
  }),
]) as readonly TypeAutorise[];

/** Types admis comme logo de filiale. Dérivé, jamais recopié. */
export const TYPES_LOGO: readonly TypeAutorise[] = Object.freeze(
  TYPES_AUTORISES.filter((t) => t.logo),
);

/* =====================================================================
 *  Extension
 * ===================================================================== */

/**
 * Extension d'un nom de fichier, en minuscules et sans le point.
 *
 * ⚠️ **Elle lit le DERNIER point, et c'est le point du contrôle.**
 * `rapport.pdf.exe` a pour extension `exe`, pas `pdf` — c'est ce que le système
 * du destinataire lira, et c'est donc ce que la liste blanche doit examiner.
 * Retenir la première extension serait faire au déposant le cadeau de son
 * déguisement.
 */
export function extensionDe(nomFichier: string): string | null {
  const base = nomFichier.split(/[/\\]/u).pop() ?? '';
  const point = base.lastIndexOf('.');
  if (point <= 0 || point === base.length - 1) return null;
  const extension = base.slice(point + 1).toLowerCase();
  return /^[a-z0-9]{1,16}$/u.test(extension) ? extension : null;
}

/** Type de la liste blanche portant cette extension, ou `null`. */
export function typePourExtension(extension: string): TypeAutorise | null {
  return TYPES_AUTORISES.find((t) => t.extensions.includes(extension)) ?? null;
}

/* =====================================================================
 *  Le verdict
 * ===================================================================== */

/** Motif de refus. Grossier vers l'extérieur, précis vers le journal. */
export type MotifRefus =
  | 'extension_absente'
  | 'extension_refusee'
  | 'logo_refuse'
  | 'declaration_incoherente'
  | 'signature_incoherente'
  | 'macros'
  | 'archive';

export type Verdict =
  | { readonly ok: true; readonly type: TypeAutorise; readonly extension: string }
  | {
      readonly ok: false;
      readonly motif: MotifRefus;
      /** Ce que l'utilisateur lit. Il dit ce qui est refusé, jamais comment passer. */
      readonly message: string;
      /** Ce qui part au journal technique, et ne sort pas de la machine. */
      readonly detailJournal: string;
    };

/**
 * Contrôles n° 3 et n° 4, **dans cet ordre**.
 *
 * L'ordre du §31.2 n'est pas une préférence : l'extension d'abord — c'est une
 * comparaison de chaîne, elle ne lit pas le contenu —, la signature ensuite,
 * qui ouvre les octets. Un fichier dont l'extension est refusée n'a jamais à
 * être analysé.
 */
export function reconnaitre(parametres: {
  readonly nomFichier: string;
  readonly typeDeclare: string | null;
  readonly contenu: Buffer;
  /** Le dépôt vise-t-il le logo d'une filiale ? */
  readonly logo: boolean;
}): Verdict {
  const { nomFichier, typeDeclare, contenu, logo } = parametres;

  /* ── Contrôle n° 3 : la liste blanche ────────────────────────────── */

  const extension = extensionDe(nomFichier);
  if (extension === null) {
    return {
      ok: false,
      motif: 'extension_absente',
      message: 'Ce fichier n’a pas d’extension exploitable. Le dépôt est refusé.',
      detailJournal: `nom de fichier sans extension exploitable (${String(nomFichier.length)} signes)`,
    };
  }

  const type = typePourExtension(extension);
  if (type === null) {
    return {
      ok: false,
      motif: 'extension_refusee',
      message:
        `Les fichiers « .${extension} » ne sont pas acceptés. Formats admis : ` +
        `${extensionsAdmises(false).join(', ')}.`,
      detailJournal: `extension « ${extension} » hors liste blanche`,
    };
  }

  // Le logo est restreint DANS le contrôle n° 3, pas après : c'est une liste
  // blanche plus étroite, pas une exception posée plus loin.
  if (logo && !type.logo) {
    return {
      ok: false,
      motif: 'logo_refuse',
      message:
        `Un logo de filiale doit être une image ${extensionsAdmises(true).join(' ou ')}. ` +
        'Les autres formats sont refusés, y compris SVG.',
      detailJournal: `type « ${type.cle} » refusé comme logo de filiale (§31.3)`,
    };
  }

  // La déclaration du déposant, quand il en fait une.
  if (!declarationConcorde(type, typeDeclare)) {
    return {
      ok: false,
      motif: 'declaration_incoherente',
      message: 'Le type annoncé ne correspond pas à l’extension du fichier. Le dépôt est refusé.',
      detailJournal: `type annoncé « ${String(typeDeclare)} » incompatible avec « ${extension} »`,
    };
  }

  /* ── Contrôle n° 4 : la signature binaire ────────────────────────── */

  return constater(type, extension, contenu);
}

/**
 * Une déclaration absente ne fait pas échouer le dépôt ; une déclaration
 * **fausse**, si.
 *
 * ── L'arbitrage, écrit pour qu'on puisse le contester ────────────────────
 *
 * Le §31.2 exige que la signature concorde avec « l'extension **et** le type
 * MIME annoncés ». Prise à la lettre, cette phrase exigerait un type MIME
 * exact — or c'est le système d'exploitation du déposant qui le fabrique, pas
 * lui : un poste Linux sans `shared-mime-info` annonce `application/octet-stream`
 * pour un `.docx` parfaitement valide, et un Windows francophone annonce
 * `application/vnd.ms-excel` pour un `.csv`.
 *
 * Refuser ces dépôts empêcherait un usage légitime **sans rien fermer** : la
 * signature, elle, est vérifiée dans tous les cas et c'est elle qui tranche.
 * Une déclaration vide, absente ou `application/octet-stream` est donc traitée
 * comme **l'absence de déclaration** — parce que c'en est une. Une déclaration
 * qui affirme autre chose est refusée.
 */
function declarationConcorde(type: TypeAutorise, typeDeclare: string | null): boolean {
  if (typeDeclare === null) return true;
  const nettoye = typeDeclare.split(';')[0]?.trim().toLowerCase() ?? '';
  if (nettoye === '' || nettoye === 'application/octet-stream') return true;
  return type.declarationsAdmises.includes(nettoye);
}

/** Constate ce que le contenu EST. Le seul contrôle que l'attaquant ne choisit pas. */
function constater(type: TypeAutorise, extension: string, contenu: Buffer): Verdict {
  const reconnaissance = type.reconnaissance;

  if (reconnaissance.genre === 'octets') {
    const tete = contenu.subarray(0, 32).toString('latin1');
    if (reconnaissance.prefixes.some((prefixe) => tete.startsWith(prefixe))) {
      return { ok: true, type, extension };
    }
    return {
      ok: false,
      motif: 'signature_incoherente',
      message: REFUS_DE_CONTENU,
      detailJournal:
        `signature binaire incompatible avec « ${type.cle} » ` +
        `(tête : ${empreinteLisible(contenu)})`,
    };
  }

  if (reconnaissance.genre === 'texte') {
    const anomalie = anomalieDeTexte(contenu);
    if (anomalie === null) return { ok: true, type, extension };
    return {
      ok: false,
      motif: 'signature_incoherente',
      message: REFUS_DE_CONTENU,
      detailJournal: `contenu annoncé « ${type.cle} » mais ${anomalie}`,
    };
  }

  return constaterOoxml(type, extension, contenu, reconnaissance.partiePrincipale);
}

/**
 * Message unique du refus de contenu.
 *
 * ⚠️ **Il ne dit pas ce qui était attendu**, et c'est délibéré : « il manquait
 * `%PDF-` en tête » est un mode d'emploi. Le détail part au journal, où il sert
 * au diagnostic sans servir à personne d'autre.
 */
const REFUS_DE_CONTENU =
  'Le contenu de ce fichier ne correspond pas à son extension. Le dépôt est refusé.';

/**
 * Message du refus des macros.
 *
 * Celui-ci **nomme** ce qui est refusé, à la différence du refus de contenu :
 * c'est une règle de l'organisation, pas un contournement possible. Un
 * utilisateur à qui l'on refuse son classeur doit savoir qu'il lui faut
 * l'enregistrer sans macro — sans quoi il recommencera, et il finira par
 * l'envoyer par courriel.
 */
const REFUS_MACROS =
  'Les documents contenant des macros ne sont pas acceptés. Enregistrez le fichier ' +
  'dans un format sans macro (.docx, .xlsx, .pptx) avant de le déposer.';

/**
 * Le conteneur ZIP est **ouvert**, pas seulement reniflé.
 *
 * Trois refus, dans l'ordre où ils coûtent le moins cher :
 *
 *  1. ce n'est pas un ZIP lisible → refus (et pas une archive extraite « pour
 *     voir ») ;
 *  2. il n'y a pas de `[Content_Types].xml` → **c'est une archive**, pas un
 *     document Office. C'est le refus des archives du §31.2, et il ne repose sur
 *     aucune énumération d'extensions ;
 *  3. le document se déclare à macros, ou porte un `vbaProject.bin` → refus.
 *     C'est la propriété qu'un `.docm` renommé `.docx` ne peut pas perdre :
 *     Word ne saurait plus l'ouvrir.
 */
function constaterOoxml(
  type: TypeAutorise,
  extension: string,
  contenu: Buffer,
  partiePrincipale: string,
): Verdict {
  let entrees;
  try {
    entrees = lireEntrees(contenu);
  } catch (erreur) {
    return {
      ok: false,
      motif: 'signature_incoherente',
      message: REFUS_DE_CONTENU,
      detailJournal:
        `conteneur illisible pour « ${type.cle} » : ` +
        (erreur instanceof ErreurZip ? erreur.message : 'erreur inattendue'),
    };
  }

  if (entrees.some((e) => e.nom.toLowerCase().endsWith('vbaproject.bin'))) {
    return {
      ok: false,
      motif: 'macros',
      message: REFUS_MACROS,
      detailJournal: 'le conteneur porte un projet VBA (vbaProject.bin)',
    };
  }

  let typesDeContenu: Buffer | null;
  try {
    typesDeContenu = lireEntree(contenu, entrees, '[Content_Types].xml');
  } catch (erreur) {
    return {
      ok: false,
      motif: 'signature_incoherente',
      message: REFUS_DE_CONTENU,
      detailJournal: `[Content_Types].xml illisible : ${
        erreur instanceof ErreurZip ? erreur.message : 'erreur inattendue'
      }`,
    };
  }

  if (typesDeContenu === null) {
    return {
      ok: false,
      motif: 'archive',
      message: 'Ce fichier est une archive, pas un document. Les archives ne sont pas acceptées.',
      detailJournal: `archive ZIP sans [Content_Types].xml déposée en « ${extension} »`,
    };
  }

  const declaration = typesDeContenu.toString('utf8');
  if (/macroenabled|vnd\.ms-office\.vbaproject/iu.test(declaration)) {
    return {
      ok: false,
      motif: 'macros',
      message: REFUS_MACROS,
      detailJournal: 'le document déclare une partie principale « macroEnabled »',
    };
  }

  // La partie principale attendue doit être DÉCLARÉE par le document lui-même.
  // Un `.xlsx` renommé `.docx` échoue ici, et un ZIP portant un
  // `[Content_Types].xml` bricolé n'ouvrira dans aucun logiciel Office.
  if (!declaration.includes(partiePrincipale)) {
    return {
      ok: false,
      motif: 'signature_incoherente',
      message: REFUS_DE_CONTENU,
      detailJournal: `partie principale attendue non déclarée pour « ${type.cle} »`,
    };
  }

  return { ok: true, type, extension };
}

/**
 * Le contenu est-il du texte ? Rend `null` si oui, sinon ce qui cloche.
 *
 * Le contrôle est **positif** : on ne cherche pas des octets interdits, on exige
 * une propriété — UTF-8 valide, sans caractère de commande hors tabulation,
 * retour chariot et saut de ligne. Un ELF, un PE, un ZIP ou un PNG échouent tous
 * dès leurs premiers octets.
 */
function anomalieDeTexte(contenu: Buffer): string | null {
  if (contenu.includes(0)) return 'il contient des octets nuls';

  let texte: string;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(contenu);
  } catch {
    return "il n'est pas de l'UTF-8 valide";
  }

  // C0 hors \t \n \r, plus DEL et la plage C1. U+2028 et U+2029 sont des sauts
  // de ligne Unicode légitimes dans un fichier texte : ils ne sont pas refusés
  // ici, seules les commandes le sont.
  const commande = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.exec(texte);
  if (commande !== null) {
    const point = commande[0].codePointAt(0) ?? 0;
    return `il contient un caractère de commande (U+${point
      .toString(16)
      .toUpperCase()
      .padStart(4, '0')})`;
  }
  return null;
}

/** Extensions admises, pour un message d'erreur. Dérivées, jamais recopiées. */
function extensionsAdmises(logoSeulement: boolean): readonly string[] {
  const source = logoSeulement ? TYPES_LOGO : TYPES_AUTORISES;
  return source.flatMap((t) => t.extensions).map((e) => `.${e}`);
}

/**
 * Tête du fichier, rendue lisible pour le journal technique.
 *
 * Hexadécimal, huit octets, **jamais le contenu** : le journal se lit à trois
 * ans de distance par des gens qui n'ont pas déposé le fichier.
 */
function empreinteLisible(contenu: Buffer): string {
  return contenu.subarray(0, 8).toString('hex');
}
