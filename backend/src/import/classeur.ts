/**
 * Écrire un classeur `.xlsx` — **le strict nécessaire à un modèle vierge.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `PLAN_SERVEUR` §5 demande un **modèle Excel téléchargeable par entité**, et
 * le §33.1 dit d'où viennent ses colonnes. Reste à produire le fichier. Le
 * serveur n'a que `fastify` et `pg` : il n'y a pas de bibliothèque pour cela, et
 * `src/pieces/zip.ts` **lit** un conteneur mais n'en écrit pas.
 *
 * ⚠️ **Ce n'est pas une bibliothèque de tableur, et il ne faut pas la faire
 * grandir en une.** Elle écrit un classeur sans style, sans formule, sans
 * fusion, sans validation de saisie : un en-tête et des lignes de texte. Tout ce
 * qui manque ici manque **délibérément** — un modèle vierge n'en a pas besoin, et
 * chaque partie OOXML supplémentaire est une occasion de produire un fichier
 * qu'Excel refuse d'ouvrir.
 *
 * ── L'asymétrie avec `tableur.ts`, et pourquoi elle est saine ────────────
 *
 * Ce module **écrit** d'après le format ; `tableur.ts` **lit** d'après le
 * format. Ils ne partagent aucune ligne. C'est le même principe que le banc
 * d'essai des pièces jointes applique à son écrivain ZIP : *un producteur dérivé
 * de l'analyseur qu'il éprouve ne prouverait que leur accord*. Ici, le fait que
 * `tableur.ts` relise ce que `classeur.ts` a écrit est donc un vrai
 * aller-retour, pas une tautologie — les deux ne se connaissent que par le
 * format.
 *
 * ── Deux choix de format, tous deux pour la même raison ──────────────────
 *
 *  · **Chaînes en ligne** (`t="inlineStr"`) plutôt qu'une table de chaînes
 *    partagées. Une partie de moins, un index de moins à tenir juste, et aucune
 *    possibilité de décaler une colonne d'un cran.
 *  · **Aucune feuille de styles.** Le lecteur ne lit pas les styles (voir
 *    l'entête de `tableur.ts`) ; en écrire serait promettre une interprétation
 *    qui n'a pas lieu.
 */

import { deflateRawSync } from 'node:zlib';

/* =====================================================================
 *  1. Le contenu qu'on veut écrire
 * ===================================================================== */

export interface FeuilleAEcrire {
  /** Nom de l'onglet, tel qu'Excel l'affiche. */
  readonly nom: string;
  /** Lignes, cellules déjà rendues en texte. */
  readonly lignes: readonly (readonly string[])[];
}

/* =====================================================================
 *  2. XML — échapper, et rien d'autre
 * ===================================================================== */

/**
 * Échappe une valeur pour le corps d'un élément XML.
 *
 * Les cinq entités prédéfinies, **plus** le retrait des caractères que XML 1.0
 * n'admet pas dans un document : `\x00`–`\x08`, `\x0b`, `\x0c`, `\x0e`–`\x1f`.
 * Un libellé ne devrait jamais en porter — mais un modèle est engendré à partir
 * de noms de champs découverts dans une base, et un caractère de commande y
 * produirait un fichier qu'Excel déclare corrompu, sans dire pourquoi.
 */
export function echapperXml(valeur: string): string {
  return valeur
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

/**
 * Nom d'onglet acceptable pour Excel : 31 signes au plus, et aucun de
 * `: \ / ? * [ ]`. Un nom refusé rend le classeur inouvrable, en silence.
 */
function nomOngletValide(nom: string): string {
  const propre = nom.replace(/[:\\/?*[\]]/gu, ' ').trim();
  const borne = propre.slice(0, 31);
  return borne === '' ? 'Feuille' : borne;
}

/** Référence de cellule : `A1`, `Z1`, `AA1`… */
export function referenceCellule(colonne: number, ligne: number): string {
  let reste = colonne;
  let lettres = '';
  do {
    lettres = String.fromCharCode(65 + (reste % 26)) + lettres;
    reste = Math.floor(reste / 26) - 1;
  } while (reste >= 0);
  return `${lettres}${String(ligne)}`;
}

function feuilleXml(feuille: FeuilleAEcrire): string {
  const lignes = feuille.lignes
    .map((cellules, index) => {
      const numero = index + 1;
      const cases = cellules
        .map((valeur, colonne) =>
          valeur === ''
            ? ''
            : `<c r="${referenceCellule(colonne, numero)}" t="inlineStr">` +
              `<is><t xml:space="preserve">${echapperXml(valeur)}</t></is></c>`,
        )
        .join('');
      return `<row r="${String(numero)}">${cases}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${lignes}</sheetData></worksheet>`
  );
}

/* =====================================================================
 *  3. Le conteneur ZIP
 * ===================================================================== */

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let octet = 0; octet < 256; octet += 1) {
    let valeur = octet;
    for (let bit = 0; bit < 8; bit += 1) {
      valeur = (valeur & 1) !== 0 ? 0xedb88320 ^ (valeur >>> 1) : valeur >>> 1;
    }
    table[octet] = valeur >>> 0;
  }
  return table;
})();

function crc32(donnees: Buffer): number {
  let valeur = 0xffffffff;
  for (const octet of donnees) {
    valeur = (TABLE_CRC[(valeur ^ octet) & 0xff] ?? 0) ^ (valeur >>> 8);
  }
  return (valeur ^ 0xffffffff) >>> 0;
}

interface EntreeAEcrire {
  readonly nom: string;
  readonly contenu: Buffer;
}

/**
 * Assemble un conteneur ZIP « dégonflé ».
 *
 * Méthode 8 (deflate) et non 0 (stocké) : c'est celle que produisent Word et
 * Excel, donc celle que traverse un vrai classeur en arrivant dans
 * `src/pieces/zip.ts`. Écrire en « stocké » aurait été plus simple et aurait
 * éprouvé un chemin que les fichiers réels n'empruntent pas.
 *
 * Les horodatages MS-DOS sont laissés à zéro : un modèle vierge n'a pas de date
 * de modification qui veuille dire quelque chose, et une date fausse en aurait
 * l'air. Conséquence voulue : **deux téléchargements du même modèle donnent le
 * même octet** — ce qui rend l'empreinte du modèle stable, donc vérifiable.
 */
function assemblerZip(entrees: readonly EntreeAEcrire[]): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;

  for (const entree of entrees) {
    const nom = Buffer.from(entree.nom, 'utf8');
    const compresse = deflateRawSync(entree.contenu, { level: 9 });
    const controle = crc32(entree.contenu);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    local.writeUInt16LE(20, 4); // version minimale
    local.writeUInt16LE(0x0800, 6); // bit 11 : nom de fichier en UTF-8
    local.writeUInt16LE(8, 8); // méthode : dégonflé
    local.writeUInt32LE(controle, 14);
    local.writeUInt32LE(compresse.length, 18);
    local.writeUInt32LE(entree.contenu.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, nom, compresse);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(controle, 16);
    central.writeUInt32LE(compresse.length, 20);
    central.writeUInt32LE(entree.contenu.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);

    decalage += local.length + nom.length + compresse.length;
  }

  const corpsLocaux = Buffer.concat(locaux);
  const corpsCentraux = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(corpsCentraux.length, 12);
  fin.writeUInt32LE(corpsLocaux.length, 16);
  return Buffer.concat([corpsLocaux, corpsCentraux, fin]);
}

/* =====================================================================
 *  4. Le classeur
 * ===================================================================== */

/**
 * Écrit un classeur `.xlsx` d'une ou plusieurs feuilles.
 *
 * Les cinq parties sont le minimum qu'exige ECMA-376 pour qu'Excel ouvre le
 * fichier : le catalogue des types, la relation racine, le classeur, ses
 * relations, et chaque feuille.
 */
export function ecrireXlsx(feuilles: readonly FeuilleAEcrire[]): Buffer {
  if (feuilles.length === 0) throw new Error('Un classeur porte au moins une feuille.');

  const chemins = feuilles.map((_, index) => `xl/worksheets/sheet${String(index + 1)}.xml`);

  const typesContenu =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-' +
    'officedocument.spreadsheetml.sheet.main+xml"/>' +
    chemins
      .map(
        (chemin) =>
          `<Override PartName="/${chemin}" ContentType="application/vnd.openxmlformats-` +
          'officedocument.spreadsheetml.worksheet+xml"/>',
      )
      .join('') +
    '</Types>';

  const relationsRacine =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/' +
    'relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';

  const classeur =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    feuilles
      .map(
        (feuille, index) =>
          `<sheet name="${echapperXml(nomOngletValide(feuille.nom))}" ` +
          `sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`,
      )
      .join('') +
    '</sheets></workbook>';

  const relationsClasseur =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    feuilles
      .map(
        (_, index) =>
          `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/` +
          `officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
      )
      .join('') +
    '</Relationships>';

  const entrees: EntreeAEcrire[] = [
    { nom: '[Content_Types].xml', contenu: Buffer.from(typesContenu, 'utf8') },
    { nom: '_rels/.rels', contenu: Buffer.from(relationsRacine, 'utf8') },
    { nom: 'xl/workbook.xml', contenu: Buffer.from(classeur, 'utf8') },
    { nom: 'xl/_rels/workbook.xml.rels', contenu: Buffer.from(relationsClasseur, 'utf8') },
    ...feuilles.map((feuille, index) => ({
      nom: chemins[index] ?? `xl/worksheets/sheet${String(index + 1)}.xml`,
      contenu: Buffer.from(feuilleXml(feuille), 'utf8'),
    })),
  ];

  return assemblerZip(entrees);
}

/* =====================================================================
 *  5. Le CSV, pour qui ne veut pas d'un classeur
 * ===================================================================== */

/**
 * Écrit un CSV — séparateur `;`, guillemets RFC 4180, **BOM UTF-8**.
 *
 * ⚠️ Le BOM n'est pas décoratif : sans lui, Excel sous Windows ouvre un CSV
 * UTF-8 en Windows-1252 et affiche « Ã‰chÃ©ance » en tête de colonne. C'est le
 * défaut symétrique de celui que `tableur.ts` rattrape à la lecture, et il vaut
 * mieux le fermer des deux côtés.
 */
export function ecrireCsv(lignes: readonly (readonly string[])[]): Buffer {
  const corps = lignes
    .map((cellules) =>
      cellules
        .map((valeur) =>
          /[";\r\n]/u.test(valeur) ? `"${valeur.replace(/"/gu, '""')}"` : valeur,
        )
        .join(';'),
    )
    .join('\r\n');
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${corps}\r\n`, 'utf8')]);
}
