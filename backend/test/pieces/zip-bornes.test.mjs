/**
 * zip-bornes.test.mjs — **la borne de décompression mord-elle sur le RÉEL,
 * ou sur ce que le fichier déclare ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-205 c** de la porte S6
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'en-tête de `src/pieces/zip.ts` écrit, depuis le lot L6, qu'*« un en-tête
 * ZIP ment »*. La leçon n'était appliquée qu'à **une branche sur deux**.
 *
 * `lireEntree()` compare `tailleDecompressee` — un champ du répertoire
 * central, c'est-à-dire une **déclaration** — à la borne. Puis :
 *
 *  - **méthode 8** (dégonflée) : `inflateRawSync(…, { maxOutputLength })`
 *    borne le RÉSULTAT. Une bombe est arrêtée par le réel, pas par le dit.
 *  - **méthode 0** (stockée) : rien ne recoupait le déclaré et le produit.
 *    Le tranchage suit `tailleCompressee`, si bien qu'une entrée annonçant
 *    « 1 octet décompressé » et portant 50 Mio de données stockées rendait
 *    **50 Mio**.
 *
 * ⚠️ Composé avec l'analyseur quadratique (**Q-197**), ce trou fait sauter le
 * facteur limitant : ce n'est plus la taille du fichier envoyé qui borne le
 * travail du serveur, c'est ce que le décompresseur consent à produire.
 *
 * ── Pourquoi un fabricant de ZIP à part ─────────────────────────────────
 *
 * `zipMinimal()` de `test/pieces/aide.mjs` écrit des ZIP **honnêtes** : il
 * calcule les deux tailles depuis les données. C'est ce qu'il faut pour tout
 * le reste du banc, et c'est exactement ce qui rend ce défaut invisible.
 * Éprouver un contrôle qui compare une déclaration au réel exige un
 * fabricant capable de **mentir** — ce que celui-ci fait, sur demande.
 */

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { before, describe, test } from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { compilerSiNecessaire, RACINE_BACKEND } from '../aide/serveur.mjs';

// ⚠️ Import DYNAMIQUE par URL `file://`, et c'est l'idiome du dépôt : `dist/`
// n'est pas suivi en Git, et le garde-fou du constat Q-52 refuse tout import
// relatif STATIQUE vers un fichier absent du commit. Un essai qui l'enfreindrait
// serait vert chez son auteur et rouge sur une machine neuve.
let ErreurZip;
let lireEntree;
let lireEntrees;

before(async () => {
  await compilerSiNecessaire();
  ({ ErreurZip, lireEntree, lireEntrees } = await import(
    `file://${join(RACINE_BACKEND, 'dist', 'pieces', 'zip.js')}`
  ));
});

/** CRC-32, table calculée une fois — le format l'exige, le contrôle ne le lit pas. */
const TABLE = (() => {
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
  for (const octet of buffer) c = TABLE[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Fabrique un ZIP d'une entrée, en laissant MENTIR chaque champ de taille.
 *
 * @param {{nom: string, contenu: Buffer, methode?: 0|8, tailleDecompresseeDeclaree?: number}} e
 */
function zipMenteur(e) {
  const nom = Buffer.from(e.nom, 'utf8');
  const methode = e.methode ?? 0;
  const charge = methode === 8 ? deflateRawSync(e.contenu) : e.contenu;
  const declaree = e.tailleDecompresseeDeclaree ?? e.contenu.length;
  const crc = crc32(e.contenu);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(methode, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(charge.length, 18);
  local.writeUInt32LE(declaree, 22);
  local.writeUInt16LE(nom.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(methode, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(charge.length, 20);
  central.writeUInt32LE(declaree, 24);
  central.writeUInt16LE(nom.length, 28);
  central.writeUInt32LE(0, 42);

  const locaux = Buffer.concat([local, nom, charge]);
  const centraux = Buffer.concat([central, nom]);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(1, 8);
  fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(centraux.length, 12);
  fin.writeUInt32LE(locaux.length, 16);
  return Buffer.concat([locaux, centraux, fin]);
}

const MAX = 4 * 1024 * 1024; // MAX_DECOMPRESSE de src/pieces/zip.ts
const lire = (zip, nom) => lireEntree(zip, lireEntrees(zip), nom);

describe('La borne de décompression mord sur le réel, pas sur la déclaration (Q-205 c)', () => {
  test('MÉTHODE 0 — une entrée qui MENT sur sa taille est refusée, pas servie', () => {
    // Le cas exact du constat : déclarer 1 octet, en porter cinq millions.
    const enorme = Buffer.alloc(5 * 1024 * 1024, 0x41);
    const zip = zipMenteur({
      nom: 'xl/worksheets/sheet1.xml',
      contenu: enorme,
      methode: 0,
      tailleDecompresseeDeclaree: 1,
    });

    assert.throws(
      () => lire(zip, 'xl/worksheets/sheet1.xml'),
      (erreur) => {
        assert.ok(erreur instanceof ErreurZip, `attendu ErreurZip, reçu ${String(erreur)}`);
        assert.match(erreur.message, /stockée|annonce/u);
        return true;
      },
      'Une entrée stockée doit être bornée par ses OCTETS RÉELS. La déclaration du ' +
        'répertoire central est ce que le fichier veut nous faire croire.',
    );
  });

  test('LA MATIÈRE : la charge dépassait bien la borne, sinon l’essai ne prouve rien', () => {
    // Sans cette moitié, l'essai précédent passerait aussi avec 10 octets — et
    // l'on croirait avoir éprouvé une borne qu'on n'a jamais approchée.
    assert.ok(5 * 1024 * 1024 > MAX, 'La charge d’essai doit dépasser MAX_DECOMPRESSE.');
  });

  test('MÉTHODE 0 — une entrée HONNÊTE et sous la borne passe toujours', () => {
    // Le contrôle symétrique. Sans lui, « tout refuser » satisferait le premier
    // essai, et l'import de classeurs cesserait de fonctionner.
    const contenu = Buffer.from('<?xml version="1.0"?><worksheet/>', 'utf8');
    const zip = zipMenteur({ nom: 'part.xml', contenu, methode: 0 });
    assert.deepEqual(lire(zip, 'part.xml'), contenu);
  });

  test('MÉTHODE 8 — une entrée dégonflée honnête passe, et rend l’original', () => {
    const contenu = Buffer.from('a'.repeat(100_000), 'utf8');
    const zip = zipMenteur({ nom: 'part.xml', contenu, methode: 8 });
    assert.deepEqual(lire(zip, 'part.xml'), contenu);
  });

  test('MÉTHODE 8 — une déclaration qui ne correspond pas au produit est refusée', () => {
    // La branche 8 était déjà bornée par `maxOutputLength` ; elle ne DISAIT rien
    // d'un en-tête qui ment sous la borne. Un fichier fabriqué pour tromper un
    // contrôle amont — ClamAV, un antivirus de passerelle — se reconnaît là.
    const contenu = Buffer.from('a'.repeat(50_000), 'utf8');
    const zip = zipMenteur({
      nom: 'part.xml',
      contenu,
      methode: 8,
      tailleDecompresseeDeclaree: 12,
    });
    assert.throws(
      () => lire(zip, 'part.xml'),
      (erreur) => {
        assert.ok(erreur instanceof ErreurZip);
        assert.match(erreur.message, /annonce 12 octets/u);
        return true;
      },
    );
  });

  test('LE REFUS RESTE UNE ErreurZip, jamais une erreur nue de zlib', () => {
    // ⚠️ Le correctif introduit un `throw` DANS le `try` qui enveloppait
    // `inflateRawSync`. Sans le `if (erreur instanceof ErreurZip) throw erreur`,
    // le message précis serait ré-emballé en « décompression refusée », et
    // l'exploitant perdrait la seule information qui distingue une bombe d'un
    // fichier corrompu.
    const zip = zipMenteur({
      nom: 'part.xml',
      contenu: Buffer.from('a'.repeat(50_000), 'utf8'),
      methode: 8,
      tailleDecompresseeDeclaree: 12,
    });
    try {
      lire(zip, 'part.xml');
      assert.fail('devait lever');
    } catch (erreur) {
      assert.doesNotMatch(
        erreur.message,
        /décompression refusée/u,
        'Le message précis ne doit pas être ré-emballé par le rattrapage de zlib.',
      );
    }
  });
});
