/**
 * catalogue.test.mjs — **les contrôles n° 3 et n° 4, éprouvés seuls.**
 *
 * Aucune base, aucun serveur : la liste blanche et la signature binaire sont des
 * fonctions pures, et ce fichier les interroge comme telles. Ce qui traverse la
 * chaîne complète est dans `ingestion.test.mjs`.
 *
 * ⚠️ **Ce fichier commence par refuser de mesurer le vide.** Le dépôt a déjà
 * produit trois essais verts qui ne mesuraient rien ; un essai qui trouverait
 * une liste blanche vide, ou dépourvue de type ZIP, passerait au vert sans avoir
 * rien éprouvé. Le premier `describe` échoue dans ce cas, et il le dit.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { moduleCompile } from '../aide/serveur.mjs';
import {
  archiveNue,
  executableElf,
  jpegValide,
  ooxml,
  pdfValide,
  pngValide,
  svgAvecScript,
} from './aide.mjs';

const { TYPES_AUTORISES, TYPES_LOGO, extensionDe, reconnaitre, typePourExtension } =
  await moduleCompile('pieces/catalogue.js');

/** Un dépôt ordinaire : ce que le contrôle voit d'un envoi sain. */
const depot = (nom, contenu, type = null, logo = false) =>
  reconnaitre({ nomFichier: nom, typeDeclare: type, contenu, logo });

describe('La matière : sans elle, le reste ne prouve rien', () => {
  test('la liste blanche existe, et porte les trois natures de reconnaissance', () => {
    assert.ok(TYPES_AUTORISES.length >= 6, `liste blanche à ${TYPES_AUTORISES.length} types`);

    const natures = new Set(TYPES_AUTORISES.map((t) => t.reconnaissance.genre));
    // Les trois natures doivent être représentées : si `ooxml` disparaissait, les
    // essais « .docm renommé » et « archive renommée » ci-dessous seraient encore
    // verts (ils refuseraient par l'extension) sans plus rien mesurer du n° 4.
    for (const nature of ['octets', 'ooxml', 'texte']) {
      assert.ok(natures.has(nature), `aucun type de nature « ${nature} » dans la liste blanche`);
    }

    assert.ok(TYPES_LOGO.length >= 2, 'aucun type admis comme logo : le §31.3 n’est plus mesuré');
    for (const type of TYPES_LOGO) {
      assert.equal(type.reconnaissance.genre, 'octets', `logo « ${type.cle} » sans signature d’octets`);
    }
  });

  test('les formats que le §31.2 refuse ne sont dans aucune extension admise', () => {
    const admises = new Set(TYPES_AUTORISES.flatMap((t) => t.extensions));
    const interdits = [
      'docm', 'xlsm', 'pptm', 'xlsb', 'doc', 'xls',
      'exe', 'dll', 'com', 'scr', 'msi', 'bat', 'cmd', 'ps1', 'sh', 'jar', 'js', 'hta', 'lnk',
      'zip', '7z', 'rar', 'tar', 'gz', 'iso',
      'svg', 'html', 'htm', 'xml',
    ];
    for (const extension of interdits) {
      assert.equal(admises.has(extension), false, `« .${extension} » figure dans la liste blanche`);
    }
    // Contre-épreuve : la liste d'interdits ci-dessus doit être comparée à
    // QUELQUE CHOSE. Si les extensions admises étaient vides, la boucle passerait.
    assert.ok(admises.size >= 8, `seulement ${admises.size} extensions admises`);
  });

  test('aucun `application/octet-stream` dans les déclarations admises', () => {
    for (const type of TYPES_AUTORISES) {
      assert.equal(
        type.declarationsAdmises.includes('application/octet-stream'),
        false,
        `« ${type.cle} » admet octet-stream comme déclaration : la concordance ne veut plus rien dire`,
      );
    }
  });
});

describe('Contrôle n° 3 — la liste blanche', () => {
  test('l’extension lue est la DERNIÈRE, pas la première', () => {
    assert.equal(extensionDe('rapport.pdf.exe'), 'exe');
    assert.equal(extensionDe('rapport.PDF'), 'pdf');
    assert.equal(extensionDe('sans-extension'), null);
    assert.equal(extensionDe('.cache'), null);
    assert.equal(extensionDe('fin.'), null);
    // Le chemin est réduit à son dernier segment : un nom de partie multipart
    // peut en contenir un.
    assert.equal(extensionDe('../../etc/passwd.pdf'), 'pdf');
  });

  test('un `.exe` est refusé sur son extension, avant qu’on lise ses octets', () => {
    const verdict = depot('charge.exe', executableElf());
    assert.equal(verdict.ok, false);
    assert.equal(verdict.motif, 'extension_refusee');
    // Le message énumère ce qui est admis : c'est une règle, pas un mode d'emploi.
    assert.match(verdict.message, /\.pdf/u);
  });

  test('un `.svg` est refusé — comme logo comme partout ailleurs', () => {
    for (const logo of [false, true]) {
      const verdict = depot('logo.svg', svgAvecScript(), 'image/svg+xml', logo);
      assert.equal(verdict.ok, false, `.svg accepté (logo=${logo})`);
      assert.equal(verdict.motif, 'extension_refusee');
    }
  });

  test('un PDF est refusé COMME LOGO, et accepté ailleurs', () => {
    const refuse = depot('logo.pdf', pdfValide(), 'application/pdf', true);
    assert.equal(refuse.ok, false);
    assert.equal(refuse.motif, 'logo_refuse');
    assert.match(refuse.message, /SVG/u);

    const accepte = depot('rapport.pdf', pdfValide(), 'application/pdf', false);
    assert.equal(accepte.ok, true);
  });

  test('PNG et JPEG passent comme logo', () => {
    assert.equal(depot('logo.png', pngValide(), 'image/png', true).ok, true);
    assert.equal(depot('logo.jpg', jpegValide(), 'image/jpeg', true).ok, true);
    assert.equal(depot('logo.jpeg', jpegValide(), 'image/jpeg', true).ok, true);
  });

  test('une déclaration MIME fausse est refusée ; une déclaration absente ne l’est pas', () => {
    const menteur = depot('rapport.pdf', pdfValide(), 'image/png');
    assert.equal(menteur.ok, false);
    assert.equal(menteur.motif, 'declaration_incoherente');

    for (const declaration of [null, '', 'application/octet-stream', 'application/pdf; charset=binary']) {
      const verdict = depot('rapport.pdf', pdfValide(), declaration);
      assert.equal(verdict.ok, true, `déclaration « ${String(declaration)} » refusée à tort`);
    }
  });
});

describe('Contrôle n° 4 — la signature binaire, le seul que l’attaquant ne choisit pas', () => {
  test('un exécutable renommé `.pdf` est refusé PAR SA SIGNATURE', () => {
    const verdict = depot('rapport-trimestriel.pdf', executableElf(), 'application/pdf');
    assert.equal(verdict.ok, false);
    // Le motif est bien celui du n° 4 : l'extension et la déclaration étaient
    // toutes deux crédibles, seul le contenu ne l'était pas.
    assert.equal(verdict.motif, 'signature_incoherente');
    // ⚠️ Le message ne dit pas ce qui était attendu : « il manquait %PDF- » est
    // un mode d'emploi.
    assert.equal(/%PDF|magic|signature|octet/iu.test(verdict.message), false, verdict.message);
    // Le détail, lui, part au journal.
    assert.match(verdict.detailJournal, /7f454c46/u);
  });

  test('un exécutable renommé `.txt` est refusé : le texte est un contrôle POSITIF', () => {
    const verdict = depot('notes.txt', executableElf(), 'text/plain');
    assert.equal(verdict.ok, false);
    assert.equal(verdict.motif, 'signature_incoherente');
    assert.match(verdict.detailJournal, /octets nuls/u);
  });

  test('un PNG renommé `.jpg` est refusé', () => {
    assert.equal(depot('photo.jpg', pngValide(), 'image/jpeg').ok, false);
  });

  test('un texte réel passe ; un texte à caractères de commande ne passe pas', () => {
    assert.equal(depot('liste.csv', Buffer.from('nom;valeur\néolienne;12\n', 'utf8')).ok, true);
    const commande = depot('liste.csv', Buffer.from('nom;valeur\u0007\n', 'utf8'));
    assert.equal(commande.ok, false);
    assert.match(commande.detailJournal, /U\+0007/u);
    const brise = depot('liste.csv', Buffer.from([0xc3, 0x28]));
    assert.equal(brise.ok, false);
    assert.match(brise.detailJournal, /UTF-8/u);
  });

  test('les trois conteneurs Office valides passent', () => {
    for (const cle of ['docx', 'xlsx', 'pptx']) {
      const verdict = depot(`document.${cle}`, ooxml(cle), null);
      assert.equal(verdict.ok, true, `« .${cle} » refusé à tort : ${verdict.detailJournal ?? ''}`);
      assert.equal(verdict.type.cle, cle);
    }
  });

  test('⚠️ un `.docm` renommé `.docx` est refusé — le piège du contrôle n° 4', () => {
    // Les deux commencent par les mêmes quatre octets `PK\x03\x04` : une
    // comparaison de tête l'aurait accepté.
    const macros = ooxml('docm');
    assert.deepEqual([...macros.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    assert.deepEqual([...ooxml('docx').subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

    const verdict = depot('budget.docx', macros, null);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.motif, 'macros');
    assert.match(verdict.message, /macro/iu);
  });

  test('une archive ZIP renommée `.docx` est refusée COMME ARCHIVE', () => {
    const verdict = depot('dossier.docx', archiveNue(), null);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.motif, 'archive');
    assert.match(verdict.message, /archive/iu);
  });

  test('un `.xlsx` qui est en réalité un `.docx` est refusé', () => {
    const verdict = depot('classeur.xlsx', ooxml('docx'), null);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.motif, 'signature_incoherente');
  });

  test('un ZIP tronqué est refusé, sans exception qui remonte', () => {
    const verdict = depot('document.docx', ooxml('docx').subarray(0, 60), null);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.motif, 'signature_incoherente');
  });
});

describe('Cohérence interne du catalogue', () => {
  test('chaque extension mène à un seul type, et son type la reconnaît', () => {
    const vues = new Set();
    for (const type of TYPES_AUTORISES) {
      for (const extension of type.extensions) {
        assert.equal(vues.has(extension), false, `« .${extension} » déclarée deux fois`);
        vues.add(extension);
        assert.equal(typePourExtension(extension)?.cle, type.cle);
      }
    }
    assert.ok(vues.size >= 8);
  });

  test('le type MIME constaté n’est jamais vide, et figure dans ses déclarations admises', () => {
    for (const type of TYPES_AUTORISES) {
      assert.notEqual(type.typeMimeConstate, '');
      assert.ok(
        type.declarationsAdmises.includes(type.typeMimeConstate),
        `« ${type.cle} » refuserait sa propre déclaration canonique`,
      );
    }
  });
});
