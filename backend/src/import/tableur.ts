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
 *
 * ⚠️ **Cette borne borne le TRAVAIL, et il a fallu la corriger pour que ce soit
 * vrai.** Elle ne tombait qu'à l'assemblage — après que le découpage avait
 * construit les deux millions de lignes du fichier et que la grille les avait
 * recopiées : 3,81 Mio d'entrée faisaient **+936 Mio de tas pour un fichier
 * refusé** (constat **Q-198**). Elle mord désormais **pendant** le découpage
 * (`lireCsv`) et **pendant** la lecture de la feuille (`lireFeuille`) ; l'
 * assemblage la reprononce, en filet.
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

  /* ── Pourquoi ce découpage BORNE au fil de l'eau ─────────────────────
   *
   *  Constat **Q-198**. Ce découpage construisait *toutes* les lignes, puis
   *  l'assemblage les recopiait *toutes*, et la borne des 5 000 ne tombait
   *  qu'après. Elle était donc **déclarée et non appliquée** : elle bornait le
   *  résultat, jamais le travail.
   *
   *  ══ MESURÉ, avant correction ═════════════════════════════════════════
   *
   *      « a\n » × 2 000 000 — 3,81 Mio, moins d'un tiers du plafond de corps —
   *        → refus en 1 445 ms, mais le tas passe de 144 à 1 080 Mio : +936 Mio,
   *          soit **×243 l'entrée, pour un fichier REFUSÉ** ;
   *      « \n » × 2 000 000 (que des sauts avant l'en-tête) → +710 Mio.
   *
   *  `deploy/systemd/cyber-grc.service` pose `MemoryHigh=1G`/`MemoryMax=2G` :
   *  au plafond de corps, une **seule** requête franchit le plafond du cgroup et
   *  `Restart=on-failure` relance le service — pour les vingt filiales.
   *
   *  La parade tient en une distinction : on cesse de **construire** dès la
   *  borne franchie, on continue de **compter**. Le refus garde donc son chiffre
   *  exact — c'est lui qui dit à l'utilisateur de combien il déborde —, et la
   *  mémoire n'a jamais porté que 5 002 lignes.
   * ------------------------------------------------------------------- */

  const grille: { numero: number; cellules: Cellule[] }[] = [];
  let champ = '';
  /** Vrai tant qu'aucun caractère n'est entré dans le champ courant. */
  let champVide = true;
  /** Vrai dès qu'un caractère de la ligne courante a été consommé. */
  let ligneEnCours = false;
  let ligne: Cellule[] = [];
  let cite = false;
  /** Lignes VUES depuis le début, y compris celles qu'on ne garde pas. */
  let vues = 0;
  /** Numéro de la ligne d'en-têtes ; 0 tant qu'aucune ligne non vide n'est passée. */
  let numeroEnTetes = 0;
  /** Faux dès la borne franchie : on ne construit plus, on compte encore. */
  let construire = true;

  // ⚠️ `champVide` et `ligneEnCours` sont tenus dans les DEUX modes. L'automate
  // de guillemets consulte « le champ est-il vide ? » pour décider si un `"`
  // ouvre une citation : le déduire de `champ`, qui cesse d'être alimenté,
  // ferait avaler des fins de ligne en mode comptage — et le chiffre du refus
  // ne serait plus celui du fichier.
  const ajouter = (signe: string): void => {
    champVide = false;
    ligneEnCours = true;
    if (construire && champ.length <= CARACTERES_MAX_CELLULE) champ += signe;
  };

  const finirChamp = (): void => {
    // La borne de colonnes s'applique ICI plutôt qu'à l'assemblage, pour la même
    // raison : une ligne de deux millions de champs se construisait entièrement
    // avant d'être tronquée à 256.
    if (construire && ligne.length < COLONNES_MAX) {
      ligne.push(
        champ === ''
          ? null
          : champ.length > CARACTERES_MAX_CELLULE
            ? champ.slice(0, CARACTERES_MAX_CELLULE)
            : champ,
      );
    }
    champ = '';
    champVide = true;
  };

  const finirLigne = (): void => {
    finirChamp();
    vues += 1;
    ligneEnCours = false;
    const cellules = ligne;
    ligne = [];
    if (!construire) return;
    if (numeroEnTetes === 0) {
      // Avant les en-têtes, un saut de ligne n'est qu'un saut : le retenir
      // coûterait un tableau par saut — 710 Mio pour 3,8 Mio de sauts — sans
      // rien apporter, le numéro conservé de l'en-tête suffisant à recaler le
      // repère de l'utilisateur.
      if (ligneVide(cellules)) return;
      numeroEnTetes = vues;
    }
    grille.push({ numero: vues, cellules });
    // En-têtes comprises : LIGNES_MAX lignes de données en font LIGNES_MAX + 1.
    if (grille.length > LIGNES_MAX + 1) construire = false;
  };

  for (let index = 0; index < texte.length; index += 1) {
    const signe = texte[index] ?? '';
    if (cite) {
      if (signe !== '"') {
        ajouter(signe);
        continue;
      }
      if (texte[index + 1] === '"') {
        ajouter('"');
        index += 1;
        continue;
      }
      cite = false;
      continue;
    }
    if (signe === '"' && champVide) {
      ligneEnCours = true;
      cite = true;
      continue;
    }
    if (signe === separateur) {
      ligneEnCours = true;
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
    ajouter(signe);
  }
  // Un fichier qui ne finit pas par une fin de ligne a quand même une dernière
  // ligne. Ne pas la prendre perdrait un enregistrement, en silence.
  if (ligneEnCours) finirLigne();

  // Le refus se prononce sur ce qui a été COMPTÉ, pas sur ce qui a été construit.
  if (numeroEnTetes > 0 && vues - numeroEnTetes > LIGNES_MAX) {
    throw refusTropDeLignes(vues - numeroEnTetes);
  }
  return assemblerNumerotees(grille);
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

/** Vrai si le caractère n'est ni lettre, ni chiffre, ni souligné (bord de mot). */
function borneDeMot(code: number): boolean {
  return !(
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

/** Vrai si le caractère est une espace au sens XML. */
function estEspace(caractere: string): boolean {
  return caractere === ' ' || caractere === '\t' || caractere === '\n' || caractere === '\r';
}

/**
 * Valeur d'un attribut dans un bloc d'attributs, ou `null`.
 *
 * ⚠️ **Lu par un balayage, et non par une expression rationnelle construite.**
 * Cette fonction bâtissait un `new RegExp` depuis `nom`. Le nom vient toujours
 * d'un littéral du code — ce n'était donc pas exploitable —, mais la porte S8 a
 * trouvé DEUX autres constructions d'expression alimentées par les DONNÉES
 * (constat **Q-208**), à quelques lignes de la note où la porte S6 disait avoir
 * fermé la famille. Deux passages, deux oublis.
 *
 * La règle qui remplace la vigilance : **il n'y a plus aucun `new RegExp` dans
 * ce fichier**, et un contrôle mécanique le vérifie. Un interdit absolu se
 * relit d'un coup d'œil ; « n'interpolez que des littéraux » demande de juger
 * chaque site, et c'est ce jugement qui a manqué deux fois.
 *
 * Le balayage reproduit l'ancien comportement, bord de mot compris — y compris
 * le fait que chercher « id » trouve « r:id », le deux-points étant une borne de
 * mot. `cheminPremiereFeuille` s'appuie sur cette tolérance par son ordre
 * d'essai, et la changer ici modifierait un comportement qu'aucun essai ne
 * décrit.
 */
function attribut(attributs: string, nom: string): string | null {
  let curseur = 0;
  for (;;) {
    const debut = attributs.indexOf(nom, curseur);
    if (debut < 0) return null;
    curseur = debut + 1;
    if (debut > 0 && !borneDeMot(attributs.charCodeAt(debut - 1))) continue;

    let i = debut + nom.length;
    while (i < attributs.length && estEspace(attributs.charAt(i))) i += 1;
    if (attributs.charAt(i) !== '=') continue;
    i += 1;
    while (i < attributs.length && estEspace(attributs.charAt(i))) i += 1;
    if (attributs.charAt(i) !== '"') continue;
    const ouvrant = i + 1;
    const fermant = attributs.indexOf('"', ouvrant);
    if (fermant < 0) continue;
    return decoderXml(attributs.slice(ouvrant, fermant));
  }
}

/**
 * Élément XML rencontré : ses attributs bruts, et son corps s'il en a un.
 *
 * `corps === null` désigne la forme vide `<x …/>`. Elle **compte** — un `<si/>`
 * occupe une position dans la table des chaînes, et la sauter décalerait toutes
 * les suivantes, c'est-à-dire écrirait en base la valeur de la cellule d'à côté.
 */
interface ElementXml {
  readonly attributs: string;
  readonly corps: string | null;
}

/**
 * Parcourt les `<nom …>…</nom>` d'un fragment, **en une seule passe**.
 *
 * ══ Pourquoi ce n'est pas une expression rationnelle ═════════════════════
 *
 * La forme évidente — `<nom …>([\s\S]*?)</nom>` répétée par `exec` — est
 * **quadratique dès qu'une balise n'est pas refermée**, et c'est le constat
 * **Q-197** : l'alternative appariée fait balayer *tout le reste de la partie*
 * avant d'échouer, puis `exec` reprend à la balise ouvrante suivante et rebalaie
 * la même chose. Une passe complète par balise ouvrante.
 *
 * ══ MESURÉ, avant correction, sur `<row r="1">` répété ══════════════════
 *
 *     10 000 →   451 ms      20 000 → 1 638 ms      40 000 → 6 408 ms
 *
 * soit 3,6× et 3,9× pour 2× d'entrée — et 40 000 balises tiennent en **1 084
 * octets** une fois comprimées, sous toutes les bornes du produit. Node est
 * mono-fil et cette lecture est synchrone : pendant ces secondes-là, ni le point
 * de santé, ni la connexion à l'annuaire, ni les dix-neuf autres filiales ne
 * sont servis. Et `LIGNES_MAX` ne mord pas : elle compte les lignes **closes**,
 * et il n'y en a aucune.
 *
 * Ici, tout se cherche par `indexOf` **depuis un curseur qui n'avance jamais à
 * reculons** : les portions examinées sont disjointes, donc le coût total est
 * celui du fragment, une fois. Aucune expression rationnelle non plus pour les
 * attributs — `<nom[^>]*>` rebalaie et rebrousse le reste de la chaîne à chaque
 * position candidate, ce qui rétablirait exactement le défaut qu'on ferme.
 *
 * ⚠️ **Une ouverture sans fermeture fait REFUSER le classeur**, elle n'est plus
 * ignorée. L'échec est en outre définitif : si `</nom>` est absent au-delà du
 * curseur, il l'est au-delà de toute position ultérieure — chercher plus loin
 * serait la boucle quadratique, écrite autrement. Aucun producteur OOXML n'émet
 * de balise ouverte ; en ignorer une ferait perdre des lignes **en silence**,
 * ce que le `CLAUDE.md` §3 range dans le premier cas — *quelque chose réussit
 * alors que c'est faux*.
 */
function* elementsXml(fragment: string, nom: string): Generator<ElementXml> {
  const ouverture = `<${nom}`;
  const fermeture = `</${nom}>`;
  let curseur = 0;
  for (;;) {
    const debut = fragment.indexOf(ouverture, curseur);
    if (debut < 0) return;
    const apresNom = debut + ouverture.length;
    const suivant = fragment[apresNom] ?? '';
    // Ce qui suit le nom termine la balise ou ouvre ses attributs : sans cette
    // condition, `<row` apparierait `<rowBreaks`.
    if (suivant !== '>' && suivant !== '/' && !/\s/u.test(suivant)) {
      curseur = apresNom;
      continue;
    }
    const finOuverture = fragment.indexOf('>', apresNom);
    if (finOuverture < 0) throw balisePasRefermee(nom);
    const attributs = fragment.slice(apresNom, finOuverture);
    curseur = finOuverture + 1;
    if (attributs.endsWith('/')) {
      // `<x …/>` : la barre appartient à la syntaxe, pas aux attributs.
      yield { attributs: attributs.slice(0, -1), corps: null };
      continue;
    }
    const fin = fragment.indexOf(fermeture, curseur);
    if (fin < 0) throw balisePasRefermee(nom);
    yield { attributs, corps: fragment.slice(curseur, fin) };
    curseur = fin + fermeture.length;
  }
}

/** Refus d'un classeur tronqué. Il dit quoi faire, pas quelle balise manque où. */
function balisePasRefermee(nom: string): ErreurTableur {
  return new ErreurTableur(
    `Ce classeur est incomplet : une balise « ${nom} » n’est jamais refermée. ` +
      'Réenregistrez-le depuis votre tableur, puis recommencez.',
  );
}

/** Corps du **premier** `<nom>` d'un fragment ; `null` s'il est vide ou absent. */
function corpsDuPremier(fragment: string, nom: string): string | null {
  for (const element of elementsXml(fragment, nom)) return element.corps;
  return null;
}

/** Contenu concaténé de tous les `<t>` d'un fragment (les runs `<r>` compris). */
function textesDe(fragment: string): string {
  let texte = '';
  for (const element of elementsXml(fragment, 't')) {
    texte += decoderXml(element.corps ?? '');
    if (texte.length > CARACTERES_MAX_CELLULE) return texte.slice(0, CARACTERES_MAX_CELLULE);
  }
  return texte;
}

/** Table des chaînes partagées, indexée par position — `<si/>` vide compris. */
function lireChainesPartagees(xml: string | null): readonly string[] {
  if (xml === null) return [];
  const chaines: string[] = [];
  for (const element of elementsXml(xml, 'si')) {
    chaines.push(element.corps === null ? '' : textesDe(element.corps));
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

  /* ⚠️ CETTE LIGNE CONSTRUISAIT UNE EXPRESSION RATIONNELLE DEPUIS LE FICHIER —
     constat **Q-208 b** de la porte S8, et c'est un déni de service EXPONENTIEL.

     `identifiant` est l'attribut `r:id` de `workbook.xml`, c'est-à-dire des
     octets d'attaquant, et il était interpolé TEL QUEL dans un `new RegExp`
     appliqué à `workbook.xml.rels` — lui aussi fourni par le même fichier.
     Les deux moitiés voyagent dans la même archive : un motif catastrophique
     (`(a+)+$`) et un sujet qui le fait rétro-agir. Mesuré : **635 octets, 2 040
     ms de boucle bloquée**, et ×2 par caractère ajouté au sujet.

     ⚠️ **Le correctif n'est pas d'échapper l'identifiant.** Échapper marcherait,
     et laisserait la prochaine interpolation revenir sans que rien ne le dise.
     On retire la construction d'expression : le générateur `elementsXml` parcourt
     déjà les éléments en temps linéaire, et la comparaison d'un identifiant est
     une **égalité de chaînes**, pas une recherche de motif. */
  let cible: string | null = null;
  for (const element of elementsXml(relations, 'Relationship')) {
    if (attribut(element.attributs, 'Id') === identifiant) {
      cible = attribut(element.attributs, 'Target');
      break;
    }
  }
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

/**
 * Numéro de ligne d'une référence `A12`. Rend `null` si absent.
 *
 * ⚠️ **Lu par un balayage, pas par une expression rationnelle** — constat
 * **Q-208 a** de la porte S8. `/(\d+)$/` n'est pas ancrée à gauche : sur une
 * suite de chiffres suivie d'un non-chiffre, le moteur réessaie à CHAQUE
 * position, soit une passe complète par caractère. L'attribut `r` d'un `<row>`
 * est fourni par le fichier, et la borne `LIGNES_MAX` compte les `<row>`, pas
 * la longueur de `r` : **un seul suffisait**. Mesuré : 322 octets → 2 059 ms,
 * 468 octets → 35 472 ms, et de l'ordre d'heures au plafond de décompression.
 *
 * Le balayage part de la fin et s'arrête au premier non-chiffre : chaque
 * caractère est vu une fois, il n'y a rien à réessayer.
 */
function numeroLigne(reference: string | null): number | null {
  if (reference === null) return null;
  const fin = reference.length;
  let debut = fin;
  while (debut > 0) {
    const code = reference.charCodeAt(debut - 1);
    if (code < 48 || code > 57) break;
    debut -= 1;
  }
  if (debut === fin) return null;
  // Une feuille de calcul ne dépasse pas 1 048 576 lignes : au-delà de sept
  // chiffres, ce n'est pas un numéro de ligne, et il est inutile de convertir
  // deux cent mille chiffres pour le découvrir. L'ancienne rédaction rendait
  // déjà `null` dans ce cas — par `Number.isSafeInteger`, mais après le travail.
  if (fin - debut > 7) return null;
  const numero = Number.parseInt(reference.slice(debut, fin), 10);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** Lit une feuille et rend ses lignes brutes, indexées par position de colonne. */
function lireFeuille(xml: string, chaines: readonly string[]): Map<number, Cellule[]> {
  const parLigne = new Map<number, Cellule[]>();
  let position = 0;

  for (const element of elementsXml(xml, 'row')) {
    position += 1;
    // ⚠️ La borne compte les lignes **LUES**, et non les lignes retenues. Elle
    // regardait `parLigne.size`, c'est-à-dire le nombre de numéros DISTINCTS :
    // une feuille répétant `<row r="1">` cent mille fois la laissait au repos et
    // faisait tout le travail quand même. Ce qu'on borne est le travail.
    if (position > LIGNES_MAX + 1) {
      throw new ErreurTableur(
        `Ce fichier porte plus de ${String(LIGNES_MAX)} lignes de données. ` +
          'Découpez-le en plusieurs imports.',
      );
    }
    // `r` est facultatif dans la norme : à défaut, la ligne est à sa position.
    const numero = numeroLigne(`A${attribut(element.attributs, 'r') ?? ''}`) ?? position;

    const cellules: Cellule[] = [];
    let colonneSuivante = 0;
    for (const cellule of elementsXml(element.corps ?? '', 'c')) {
      const contenu = cellule.corps ?? '';
      const colonne = indiceColonne(attribut(cellule.attributs, 'r')) ?? colonneSuivante;
      colonneSuivante = colonne + 1;
      if (colonne < COLONNES_MAX) {
        while (cellules.length < colonne) cellules.push(null);
        cellules[colonne] = valeurCellule(attribut(cellule.attributs, 't'), contenu, chaines);
      }
    }
    parLigne.set(numero, cellules);
  }
  return parLigne;
}

/** Interprète le contenu d'une cellule d'après son attribut de type. */
function valeurCellule(type: string | null, contenu: string, chaines: readonly string[]): Cellule {
  // ⚠️ Un `exec` non global n'est PAS à l'abri du défaut Q-197 : sur `<v>`
  // répété sans fermeture, le moteur réessaie à chaque position candidate et
  // rebalaie le reste de la cellule — quadratique dans un seul `<c>`. Mesuré à
  // 1 677 ms pour 40 000 `<v>`, alors que l'audit n'avait nommé que les quatre
  // expressions globales. Même parcours que les autres, donc.
  const brut = corpsDuPremier(contenu, 'v');
  const texteV = brut === null ? null : decoderXml(brut);

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

/**
 * Le refus chiffré des lignes en trop — **écrit à un seul endroit**.
 *
 * Deux couches le prononcent : le découpage CSV, qui l'atteint AVANT d'avoir
 * tout construit (constat Q-198), et l'assemblage, qui reste le filet du XLSX.
 * Deux rédactions du même refus finiraient par ne plus dire le même chiffre.
 */
function refusTropDeLignes(lignes: number): ErreurTableur {
  return new ErreurTableur(
    `Ce fichier porte ${String(lignes)} lignes de données, au-delà des ` +
      `${String(LIGNES_MAX)} qu'un import accepte. Découpez-le en plusieurs fichiers.`,
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

  if (lignes.length > LIGNES_MAX) throw refusTropDeLignes(lignes.length);

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
