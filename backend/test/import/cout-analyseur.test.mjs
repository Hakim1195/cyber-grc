/**
 * cout-analyseur.test.mjs — **ce que coûte un fichier hostile, mesuré.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-208** de la porte S8 — et Q-197 ROUVERT
 * ════════════════════════════════════════════════════════════════════════
 *
 * La porte S6 avait trouvé cinq expressions rationnelles à alternative
 * appariée dans `src/import/tableur.ts` et les avait rendues linéaires. La
 * porte S8 en a trouvé **deux autres dans le même fichier**, à quelques lignes
 * de la note qui déclarait la famille fermée :
 *
 *  · `numeroLigne` — `/(\d+)$/` **non ancrée à gauche**, appliquée à l'attribut
 *    `r` d'un `<row>`, qui vient du fichier. **Quadratique.** Mesuré par
 *    l'auditeur : 322 octets → 2 059 ms, 468 octets → **35 472 ms**, et de
 *    l'ordre d'heures au plafond de décompression de 4 Mio.
 *  · `cheminPremiereFeuille` — `new RegExp` **bâtie depuis le `r:id`** du
 *    fichier et appliquée à `workbook.xml.rels`, fourni par le même fichier.
 *    Les deux moitiés d'une catastrophe voyagent dans la même archive.
 *    **Exponentiel** : 635 octets → 2 040 ms, et ×2 par caractère du sujet.
 *
 * ⚠️ **Deux passages, deux oublis.** Ce n'est pas un défaut d'attention : c'est
 * qu'une règle formulée « n'écrivez pas de motif catastrophique » demande de
 * juger chaque site, un par un, à chaque relecture. Cet essai la remplace par
 * deux choses qui ne demandent aucun jugement :
 *
 *  1. **un interdit absolu** — plus aucun `new RegExp` dans ce fichier ;
 *  2. **une mesure** — les formes hostiles connues doivent rester sous seuil.
 *
 * Le seuil est large (2 000 ms) à dessein : il doit tenir sur une machine
 * chargée sans jamais laisser passer un défaut, et les mesures après correction
 * sont de **1 à 2 ms**. Une marge de mille fois n'est pas de la prudence, c'est
 * la distance entre « linéaire » et « quadratique ».
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { before, describe, test } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { compilerSiNecessaire, RACINE_BACKEND } from '../aide/serveur.mjs';

let lireTableur;

before(async () => {
  await compilerSiNecessaire();
  ({ lireTableur } = await import(`file://${join(RACINE_BACKEND, 'dist', 'import', 'tableur.js')}`));
});

/* ── Un fabricant de classeur, minimal et honnête sur ses tailles ────────── */

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buffer) {
  let c = 0xffffffff;
  for (const octet of buffer) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entrees) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = Buffer.from(e.nom, 'utf8');
    const donnees = Buffer.from(e.contenu, 'utf8');
    const charge = deflateRawSync(donnees);
    const crc = crc32(donnees);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(charge.length, 18);
    local.writeUInt32LE(donnees.length, 22);
    local.writeUInt16LE(nom.length, 26);
    locaux.push(local, nom, charge);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(charge.length, 20);
    central.writeUInt32LE(donnees.length, 24);
    central.writeUInt16LE(nom.length, 28);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nom);
    decalage += 30 + nom.length + charge.length;
  }
  const lb = Buffer.concat(locaux);
  const cb = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(cb.length, 12);
  fin.writeUInt32LE(lb.length, 16);
  return Buffer.concat([lb, cb, fin]);
}

const FEUILLE_MINIMALE =
  '<worksheet><sheetData><row r=\"1\"><c><v>1</v></c></row></sheetData></worksheet>';

function classeur({ identifiant = 'rId1', relation = 'rId1', feuille = FEUILLE_MINIMALE }) {
  return zip([
    { nom: '[Content_Types].xml', contenu: '<Types/>' },
    {
      nom: 'xl/workbook.xml',
      contenu: `<workbook><sheets><sheet name="F" r:id="${identifiant}"/></sheets></workbook>`,
    },
    {
      nom: 'xl/_rels/workbook.xml.rels',
      contenu:
        `<Relationships><Relationship Id="${relation}" Target="worksheets/sheet1.xml"/>` +
        '</Relationships>',
    },
    { nom: 'xl/worksheets/sheet1.xml', contenu: feuille },
  ]);
}

const SEUIL_MS = 2000;

/** Joue la lecture et rend le temps écoulé, quel que soit le verdict. */
function coutDe(archive) {
  const debut = process.hrtime.bigint();
  try {
    lireTableur(archive);
  } catch {
    /* Le refus est un verdict acceptable ; ce qu'on mesure est le TEMPS. */
  }
  return Number(process.hrtime.bigint() - debut) / 1e6;
}

describe('Q-208 — le coût d’un fichier hostile reste borné', () => {
  test('un `<row r="…">` de 200 000 chiffres ne bloque pas la boucle', () => {
    const archive = classeur({
      feuille:
        `<worksheet><sheetData><row r="${'9'.repeat(200_000)}z">` +
        '<c><v>1</v></c></row></sheetData></worksheet>',
    });
    // LA MATIÈRE : l'archive doit rester minuscule — c'est tout le propos.
    assert.ok(
      archive.length < 2000,
      `L’archive fait ${String(archive.length)} octets : le propos du constat est qu’un ` +
        'fichier de quelques centaines d’octets suffit.',
    );
    const cout = coutDe(archive);
    assert.ok(
      cout < SEUIL_MS,
      `La lecture a pris ${cout.toFixed(0)} ms pour ${String(archive.length)} octets ` +
        `(seuil ${String(SEUIL_MS)}). L’auditeur a mesuré 35 472 ms sur cette forme.`,
    );
  });

  test('LA PROGRESSION EST LINÉAIRE — c’est ce qui distingue un correctif d’un répit', () => {
    // Un seuil seul peut être satisfait par un code deux fois moins lent mais
    // toujours quadratique. Le RAPPORT le dit, lui.
    const forme = (n) =>
      classeur({
        feuille:
          `<worksheet><sheetData><row r="${'9'.repeat(n)}z">` +
          '<c><v>1</v></c></row></sheetData></worksheet>',
      });
    const petit = Math.max(coutDe(forme(100_000)), 0.05);
    const grand = coutDe(forme(400_000));
    assert.ok(
      grand / petit < 12,
      `×4 d’entrée coûte ×${(grand / petit).toFixed(1)} de temps (${petit.toFixed(2)} → ` +
        `${grand.toFixed(2)} ms) : au-delà de ×12, ce n’est plus linéaire. Quadratique ` +
        'donnerait ×16, et l’auditeur a mesuré ×17.',
    );
  });

  test('un `r:id` catastrophique appliqué à un sujet complice ne bloque pas', () => {
    // Les deux moitiés — le motif et le sujet — voyagent dans la MÊME archive.
    const archive = classeur({ identifiant: '(a+)+$', relation: 'a'.repeat(32) });
    const cout = coutDe(archive);
    assert.ok(
      cout < SEUIL_MS,
      `La lecture a pris ${cout.toFixed(0)} ms (seuil ${String(SEUIL_MS)}). L’auditeur a ` +
        'mesuré 2 040 ms avec un sujet de 28 caractères, et ×2 par caractère ajouté.',
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : un classeur légitime se lit toujours', () => {
    // Sans lui, « tout refuser très vite » satisferait les trois essais ci-dessus.
    const archive = classeur({
      feuille:
        '<worksheet><sheetData>' +
        '<row r="1"><c t="inlineStr"><is><t>Nom</t></is></c></row>' +
        '<row r="2"><c t="inlineStr"><is><t>Rançongiciel</t></is></c></row>' +
        '</sheetData></worksheet>',
    });
    const { source, tableur } = lireTableur(archive);
    assert.equal(source, 'excel');
    assert.deepEqual([...tableur.enTetes], ['Nom']);
    assert.equal(tableur.lignes.length, 1, JSON.stringify(tableur.lignes));
    assert.equal(tableur.lignes[0].cellules[0], 'Rançongiciel');
  });
});

describe('Q-215 — aucune expression n’est CONSTRUITE dans l’analyseur', () => {
  /* ══════════════════════════════════════════════════════════════════════
     CE BLOC A ÉTÉ RÉDUIT — constat **Q-216**, troisième passage de S8.

     Il portait aussi un détecteur qui cherchait la forme dangereuse dans le
     TEXTE du motif (`[^x]*` sans ancre), et une liste d'exemptions mesurées.
     Le troisième passage a montré que ce détecteur **ne couvrait pas sa propre
     classe** : il ne connaissait qu'une orthographe — `[\s\S]*?` passait, or
     c'est la forme même de Q-197 —, son exonération d'ancre était posée à la
     LIGNE et non à l'expression, et l'une de ses exemptions invoquait une borne
     qui ne s'appliquait pas à la ligne exemptée (Q-217).

     Il est remplacé par `test/depot/cout-expressions.test.mjs`, qui ne
     reconnaît rien : il **joue chaque expression de `src/` contre des sujets
     hostiles et lit sa croissance**. Une orthographe nouvelle ne le trompe pas.

     ⚠️ **Ce qui reste ici, et pourquoi ce n'est pas redondant** : une
     expression CONSTRUITE depuis les données ne peut pas être mesurée
     statiquement — son motif n'existe qu'à l'exécution, et c'est le fichier
     d'entrée qui l'écrit. La mesure ne peut rien contre elle ; seul l'interdit
     le peut. Les deux contrôles couvrent donc deux moitiés disjointes.
     ══════════════════════════════════════════════════════════════════════ */

  test('AUCUN `new RegExp` — un motif écrit par le fichier ne se mesure pas', () => {
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'import', 'tableur.ts'), 'utf8');
    const sansCommentaires = source
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/(^|[^:])\/\/[^\n]*/gu, '$1')
      .replace(/^\s*\*.*$/gmu, '');
    const fautes = sansCommentaires
      .split('\n')
      .map((ligne, i) => [i + 1, ligne])
      .filter(([, ligne]) => ligne.includes('new RegExp'))
      .map(([n, l]) => `${String(n)}: ${l.trim()}`);
    assert.deepEqual(
      fautes,
      [],
      'Une expression CONSTRUITE laisse un octet du fichier devenir un motif : le contrôle ' +
        'de coût ne peut pas la mesurer, puisque son motif n’existe qu’à l’exécution. ' +
        '`elementsXml` et `indexOf` font le même travail en temps linéaire.',
    );
  });

  test('LE CONTRÔLE MORD — une construction fabriquée est bien vue', () => {
    const fautif = 'const r = new RegExp(`<Rel Id="${identifiant}">`, \'u\');';
    assert.equal(
      fautif.split('\n').filter((l) => l.includes('new RegExp')).length,
      1,
      'la forme de Q-208 b',
    );
  });
});
