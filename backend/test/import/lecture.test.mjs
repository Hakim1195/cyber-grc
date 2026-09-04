/**
 * lecture.test.mjs — **le lecteur de tableur, éprouvé seul.**
 *
 * Aucune base : ce fichier ne mesure que `src/import/tableur.ts`,
 * `src/import/classeur.ts` et les conversions de `src/import/moteur.ts`. Il est
 * donc rapide, et il rougit pour une raison qu'on peut lire sans démêler une
 * transaction d'un droit d'accès.
 *
 * ⚠️ **Les fichiers d'essai sont fabriqués par `aide.mjs`, écrit d'après le
 * format et non d'après le lecteur** : chaînes partagées là où le producteur du
 * produit emploie des chaînes en ligne, entrées ZIP stockées là où il dégonfle,
 * feuilles nommées `feuilleN.xml` là où la convention dit `sheetN.xml`. Un
 * producteur dérivé du lecteur qu'il éprouve ne prouverait que leur accord.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { moduleCompile } from '../aide/serveur.mjs';
import { csvEssai, xlsxEssai, zipEssai } from './aide.mjs';

const { devinerSeparateur, lireCsv, lireTableur, lireXlsx, ErreurTableur, LIGNES_MAX } =
  await moduleCompile('import/tableur.js');
const { ecrireCsv, ecrireXlsx, echapperXml, referenceCellule } =
  await moduleCompile('import/classeur.js');
const { convertirCellule, depuisSerieExcel, lireDate, lireNombre } =
  await moduleCompile('import/moteur.js');

const COLONNE = (type, obligatoire = false) => ({
  champ: 'x',
  libelle: 'X',
  type,
  obligatoire,
});

describe('CSV — le format que personne ne déclare', () => {
  test('devine le séparateur sur la première ligne, hors guillemets', () => {
    assert.equal(devinerSeparateur('a;b;c'), ';');
    assert.equal(devinerSeparateur('a,b,c'), ',');
    assert.equal(devinerSeparateur('a\tb\tc'), '\t');
    // Trois virgules DANS un champ cité ne font pas du CSV un fichier à virgules.
    assert.equal(devinerSeparateur('a;"b,c,d,e";f'), ';');
  });

  test('lit les guillemets, les doubles guillemets et les sauts de ligne internes', () => {
    const contenu = Buffer.from(
      'Titre;Description\r\n' +
        '"Incident ""majeur""";"première ligne\nseconde ligne"\r\n' +
        'Simple;sans citation\r\n',
      'utf8',
    );
    const tableur = lireCsv(contenu);
    assert.deepEqual(tableur.enTetes, ['Titre', 'Description']);
    assert.equal(tableur.lignes.length, 2);
    assert.deepEqual(tableur.lignes[0].cellules, [
      'Incident "majeur"',
      'première ligne\nseconde ligne',
    ]);
    // Le numéro est celui du TABLEUR : en-tête = 1, première donnée = 2.
    assert.equal(tableur.lignes[0].numero, 2);
  });

  test('la dernière ligne compte même sans fin de ligne finale', () => {
    const tableur = lireCsv(Buffer.from('A;B\r\n1;2\r\n3;4', 'utf8'));
    assert.equal(tableur.lignes.length, 2);
    assert.deepEqual(tableur.lignes[1].cellules, ['3', '4']);
  });

  test('un BOM UTF-8 ne devient pas le premier caractère de l’en-tête', () => {
    const avecBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('Titre;Gravité\r\nA;faible\r\n', 'utf8'),
    ]);
    assert.deepEqual(lireCsv(avecBom).enTetes, ['Titre', 'Gravité']);
  });

  test('un CSV en Windows-1252 est lu, pas rendu en mojibake', () => {
    // C'est ce qu'enregistre Excel en français quand on ne lui demande rien.
    const contenu = Buffer.from('Titre;Gravit\xe9\r\nIncident r\xe9solu;\xe9lev\xe9e\r\n', 'latin1');
    const tableur = lireCsv(contenu);
    assert.deepEqual(tableur.enTetes, ['Titre', 'Gravité']);
    assert.deepEqual(tableur.lignes[0].cellules, ['Incident résolu', 'élevée']);
  });

  test('un aller-retour par le producteur du produit conserve les valeurs', () => {
    const octets = ecrireCsv([
      ['Titre', 'Description'],
      ['Avec ; un point-virgule', 'Avec "des guillemets"'],
    ]);
    const tableur = lireCsv(octets);
    assert.deepEqual(tableur.enTetes, ['Titre', 'Description']);
    assert.deepEqual(tableur.lignes[0].cellules, [
      'Avec ; un point-virgule',
      'Avec "des guillemets"',
    ]);
  });
});

describe('XLSX — le conteneur OOXML', () => {
  test('lit une feuille à chaînes partagées, désignée par workbook.xml', () => {
    const octets = xlsxEssai([
      ['Titre', 'Gravité', 'Avancement'],
      ['Incident A', 'faible', 42],
      ['Incident B', 'élevée', 7],
    ]);
    const { source, tableur } = lireTableur(octets);
    assert.equal(source, 'excel');
    assert.deepEqual(tableur.enTetes, ['Titre', 'Gravité', 'Avancement']);
    assert.deepEqual(tableur.lignes[0].cellules, ['Incident A', 'faible', 42]);
    assert.equal(typeof tableur.lignes[0].cellules[2], 'number');
  });

  test('une CELLULE VIDE au milieu ne décale pas les colonnes', () => {
    // La cellule B2 n'est pas écrite du tout : c'est ce que produit un tableur.
    const octets = xlsxEssai([
      ['Titre', 'Type', 'Description'],
      ['Incident A', null, 'sans type'],
    ]);
    const { tableur } = lireTableur(octets);
    assert.deepEqual(tableur.lignes[0].cellules, ['Incident A', null, 'sans type']);
  });

  test('une LIGNE VIDE conserve la numérotation de l’utilisateur', () => {
    const octets = xlsxEssai([
      ['Titre'],
      ['Incident A'],
      [null], // ligne 3 : aucune cellule écrite
      ['Incident B'],
    ]);
    const { tableur } = lireTableur(octets);
    // La ligne 3 n'existe pas dans le fichier ; « Incident B » reste en ligne 4.
    const derniere = tableur.lignes[tableur.lignes.length - 1];
    assert.deepEqual(derniere.cellules, ['Incident B']);
    assert.equal(derniere.numero, 4);
  });

  test('un booléen d’Excel arrive comme un booléen', () => {
    const octets = xlsxEssai([['Sensible'], [true], [false]]);
    const { tableur } = lireTableur(octets);
    assert.equal(tableur.lignes[0].cellules[0], true);
    assert.equal(tableur.lignes[1].cellules[0], false);
  });

  test('un classeur portant un DOCTYPE est refusé, pas neutralisé', () => {
    const feuille =
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&e;</t></is></c></row></sheetData>' +
      '</worksheet>';
    const octets = zipEssai([
      {
        nom: '[Content_Types].xml',
        contenu: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      },
      { nom: 'xl/worksheets/sheet1.xml', contenu: feuille },
    ]);
    assert.throws(() => lireXlsx(octets), ErreurTableur);
  });

  test('un fichier qui n’est pas un conteneur ZIP est refusé avec un message lisible', () => {
    assert.throws(
      () => lireXlsx(Buffer.from('PK\x03\x04ceci n’est pas une archive', 'latin1')),
      (erreur) => erreur instanceof ErreurTableur && /classeur/iu.test(erreur.message),
    );
  });

  test('le format est reconnu par la SIGNATURE, jamais par l’extension', () => {
    // Un classeur nommé « .csv » reste un classeur.
    assert.equal(lireTableur(xlsxEssai([['A'], ['1']])).source, 'excel');
    assert.equal(lireTableur(csvEssai([['A'], ['1']])).source, 'csv');
  });

  test('un fichier vide est refusé', () => {
    assert.throws(() => lireTableur(Buffer.alloc(0)), ErreurTableur);
  });

  test('un classeur au-delà de la borne de décompression dit QUOI FAIRE', () => {
    // ⚠️ La borne est celle de `src/pieces/zip.ts` — 4 Mio décomprimés —, et elle
    // n'appartient pas à ce lot. Mesuré : 5 000 lignes × 12 colonnes pèsent
    // 6,62 Mio décomprimés. Le message ne doit nommer aucune partie interne du
    // conteneur : il doit dire à l'utilisateur ce qu'il peut faire.
    const lignes = [Array.from({ length: 12 }, (_, c) => `Colonne ${String(c)}`)];
    for (let i = 1; i <= 5000; i += 1) {
      lignes.push(
        Array.from({ length: 12 }, (_, c) => `Valeur ${String(i)}-${String(c)} texte ordinaire`),
      );
    }
    const octets = ecrireXlsx([{ nom: 'x', lignes }]);
    assert.throws(
      () => lireTableur(octets),
      (erreur) =>
        erreur instanceof ErreurTableur &&
        /CSV/u.test(erreur.message) &&
        !/sheet1|xl\/|décompressée/u.test(erreur.message),
    );
  });

  test(`au-delà de ${String(LIGNES_MAX)} lignes, la lecture refuse`, () => {
    const lignes = [['Titre']];
    for (let index = 0; index < LIGNES_MAX + 5; index += 1) lignes.push([`Ligne ${String(index)}`]);
    assert.throws(() => lireCsv(csvEssai(lignes)), ErreurTableur);
  });
});

describe('Aller-retour — ce que le produit ÉCRIT, le produit le RELIT', () => {
  test('un classeur écrit par `classeur.ts` est relu par `tableur.ts`', () => {
    const octets = ecrireXlsx([
      { nom: 'incidents', lignes: [['Titre', 'Gravité'], ['Incident « A »', 'élevée']] },
      { nom: 'Aide', lignes: [['Colonne', 'Type'], ['Titre', 'texte']] },
    ]);
    const { source, tableur } = lireTableur(octets);
    assert.equal(source, 'excel');
    assert.deepEqual(tableur.enTetes, ['Titre', 'Gravité']);
    // ⚠️ La SECONDE feuille ne doit jamais être lue comme des données : c'est
    // pour cela que l'aide y vit.
    assert.equal(tableur.lignes.length, 1);
    assert.deepEqual(tableur.lignes[0].cellules, ['Incident « A »', 'élevée']);
  });

  test('deux écritures du même modèle donnent le même octet', () => {
    const un = ecrireXlsx([{ nom: 'x', lignes: [['A', 'B']] }]);
    const deux = ecrireXlsx([{ nom: 'x', lignes: [['A', 'B']] }]);
    assert.ok(un.equals(deux), 'un modèle doit être reproductible à l’octet près');
  });

  test('les références de cellule montent correctement au-delà de Z', () => {
    assert.equal(referenceCellule(0, 1), 'A1');
    assert.equal(referenceCellule(25, 3), 'Z3');
    assert.equal(referenceCellule(26, 3), 'AA3');
    assert.equal(referenceCellule(51, 1), 'AZ1');
    assert.equal(referenceCellule(52, 1), 'BA1');
  });

  test('les caractères de commande sont retirés avant d’entrer dans le XML', () => {
    assert.equal(echapperXml('a bc'), 'abc');
    assert.equal(echapperXml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
  });
});

describe('Conversion d’une cellule — traduire, pas valider', () => {
  test('un nombre à virgule française est lu ; un nombre ambigu est refusé', () => {
    assert.equal(lireNombre('3,5'), 3.5);
    assert.equal(lireNombre('1 234'), 1234);
    assert.equal(lireNombre('1 234,5'), 1234.5);
    assert.equal(lireNombre('-7'), -7);
    // « 1,500 » vaut mille cinq cents ici et un et demi là : on refuse plutôt
    // que de deviner.
    assert.equal(lireNombre('1.500,25'), null);
    assert.equal(lireNombre('abc'), null);
  });

  test('une date se lit en ISO comme en français, et le 31 février est refusé', () => {
    assert.equal(lireDate('2026-03-14'), '2026-03-14');
    assert.equal(lireDate('14/03/2026'), '2026-03-14');
    assert.equal(lireDate('14-03-2026'), '2026-03-14');
    assert.equal(lireDate('2026-02-31'), null);
    assert.equal(lireDate('31/02/2026'), null);
    assert.equal(lireDate('pas une date'), null);
  });

  test('une série de tableur devient une date, heure comprise ou tronquée', () => {
    // 43831 = 1er janvier 2020 dans le repère d'Excel.
    assert.ok(depuisSerieExcel(43831).startsWith('2020-01-01'));
    const apresMidi = convertirCellule(43831.75, COLONNE('date'));
    // ⚠️ 18 h ne doit pas faire basculer l'échéance au 2 janvier.
    assert.equal(apresMidi.valeur, '2020-01-01');
    const horodatage = convertirCellule(43831.5, COLONNE('horodatage'));
    assert.equal(horodatage.valeur, '2020-01-01T12:00:00.000Z');
  });

  test('un booléen se dit « oui », « non », et rien d’autre ne passe en silence', () => {
    assert.equal(convertirCellule('oui', COLONNE('booleen')).valeur, true);
    assert.equal(convertirCellule('NON', COLONNE('booleen')).valeur, false);
    assert.equal(convertirCellule('x', COLONNE('booleen')).valeur, true);
    assert.equal(convertirCellule(1, COLONNE('booleen')).valeur, true);
    assert.ok('erreur' in convertirCellule('peut-être', COLONNE('booleen')));
    assert.ok('erreur' in convertirCellule(7, COLONNE('booleen')));
  });

  test('un document JSON mal formé est nommé, pas avalé', () => {
    assert.deepEqual(convertirCellule('{"a":1}', COLONNE('json')).valeur, { a: 1 });
    assert.ok('erreur' in convertirCellule('{a:1}', COLONNE('json')));
    // Un scalaire JSON valide n'est pas un document.
    assert.ok('erreur' in convertirCellule('42', COLONNE('json')));
  });

  test('une cellule vide rend `null` — et non la chaîne vide, qui écraserait un défaut', () => {
    assert.equal(convertirCellule(null, COLONNE('texte')).valeur, null);
    assert.equal(convertirCellule('   ', COLONNE('texte')).valeur, null);
  });
});
