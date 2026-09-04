/**
 * ingestion.test.mjs — **la chaîne des huit contrôles, empruntée par HTTP.**
 *
 * Les routes sont interrogées là où l'utilisateur les emprunte : à travers le
 * crochet `onRequest` réel, donc à travers `deciderAcces`, et à travers
 * l'analyseur de type de contenu qui porte le contrôle n° 1. *« Un contrôle doit
 * interroger le chemin que l'utilisateur emprunte, pas celui qui est commode à
 * tester. »*
 *
 * Ce qui est mesuré ici et nulle part ailleurs :
 *
 *  · le fichier **sur le disque** — son empreinte, son emplacement, son absence
 *    quand le dépôt est refusé ;
 *  · les **en-têtes de délivrance** du §31.3 ;
 *  · le fait qu'un dépôt refusé ne laisse **ni ligne, ni octet**.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import {
  archiveNue,
  executableElf,
  monterPieces,
  ooxml,
  pdfValide,
  perimetreDe,
  pngValide,
  SessionDEssai,
  svgAvecScript,
} from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const { dispositionAttachement, normaliserNomFichier } = await moduleCompile('pieces/index.js');

/** Un profil qui peut tout : l'essai porte sur la chaîne, pas sur les droits. */
const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});
/** Un profil qui lit son métier et n'écrit rien. */
const LECTEUR = Object.freeze({ niveau: 'lecture', domaines: TOUS_LES_DOMAINES, export: false });

/** L'entité à laquelle les pièces s'attachent : elle est semée par le harnais. */
const CIBLE = '/api/pieces/risques/RISK-A';

let base;
let serveur;
let session;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
  serveur = await monterPieces(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/**
 * Lit en base **sous périmètre**.
 *
 * ⚠️ Sans cela, rien ne remonte, et c'est une propriété du produit et non un
 * défaut du banc : `pieces_jointes` porte `force row level security`, si bien
 * qu'une lecture sans `grc.filiales` posé rend zéro ligne — au compte
 * propriétaire comme au compte applicatif. Un essai qui interrogerait la base
 * hors périmètre confondrait « la ligne n'existe pas » avec « je n'ai pas dit
 * qui je suis », et il l'a fait à la première rédaction de ce fichier.
 */
const enBase = (texte, valeurs = []) =>
  base.avecPerimetre(applicatif, perimetre('rssi.toulouse', FILIALE_A, [FILIALE_A]), (client) =>
    base.lignes(client, texte, valeurs),
  );

/** Lit la ligne d'une pièce, y compris ce que l'API ne rend pas. */
async function ligneEnBase(pieceId) {
  const lignes = await enBase('select * from pieces_jointes where id = $1', [pieceId]);
  return lignes[0] ?? null;
}

/** Compte les pièces de la filiale, tous états confondus. */
async function compterPieces() {
  const lignes = await enBase('select count(*)::text as n from pieces_jointes where filiale_id = $1', [
    FILIALE_A,
  ]);
  return Number(lignes[0].n);
}

/** Plus grand numéro du journal, sous périmètre. */
async function dernierNumeroJournal() {
  const lignes = await enBase('select coalesce(max(numero), 0)::text as n from journal_audit');
  return Number(lignes[0].n);
}

/** Entrées du journal postérieures à un numéro. */
async function journalDepuis(numero) {
  return enBase(
    'select numero, action, resume, entite_type, entite_id, valeurs_apres from journal_audit where numero > $1 order by numero',
    [numero],
  );
}

describe('Le montage lui-même', () => {
  test('les huit routes sont montées, et CHACUNE déclare sa classe d’accès', () => {
    // Fastify ajoute un HEAD pour chaque GET (`exposeHeadRoutes`) : il hérite de
    // la déclaration de son GET, et il est compté ici plutôt que filtré — une
    // route qui existe sans classe d'accès est refusée par le crochet, HEAD
    // compris, et c'est ce qu'on veut vérifier.
    for (const route of serveur.routes) {
      assert.notEqual(route.acces, undefined, `${route.methode} ${route.url} sans classe d'accès`);
      assert.ok(typeof route.acces.action === 'string');
    }
    const declarees = serveur.routes.filter((r) => r.methode !== 'HEAD');
    assert.equal(declarees.length, 8, JSON.stringify(declarees, null, 2));
    assert.equal(serveur.routes.length - declarees.length, 4, 'un GET sans son HEAD');
    // Le logo ne déclare JAMAIS `selon-entite` : `filiales` n'est pas une entité
    // métier, et `domaineDe()` rendrait `null` — c'est-à-dire aucun contrôle de
    // domaine là où l'on croirait en avoir un.
    //
    // ⚠️ En revanche il ne déclare plus `administration` PARTOUT, et c'est une
    // correction du 04/09/2026 (constat Q-158). Les quatre routes le
    // déclaraient, par symétrie ; or la charge de session réelle d'un RSSI ne
    // porte pas ce domaine — seul `ADMIN` le porte. **La quasi-totalité des
    // profils n'aurait jamais vu la marque de sa propre filiale**, et sans
    // qu'aucune erreur ne le dise : le repli texte de l'écran absorbe le 403 en
    // silence, à dessein. Le lot L9 aurait été inerte pour presque tout le monde.
    //
    // La ligne de partage n'est donc pas l'entité, c'est l'ACTE :
    //
    //   · LIRE le logo de sa propre filiale — `domaine: null`, comme
    //     `GET /api/filiales`, et pour le même motif : une route de session, qui
    //     ne rend rien que la session ne voie déjà à l'écran ;
    //   · le DÉPOSER ou le SUPPRIMER — `administration`, parce que changer la
    //     marque d'une filiale en est un acte.
    //
    // ⚠️ Et AUCUN chemin de route ne porte d'identifiant de filiale : la filiale
    // dont on gère le logo est celle de la session. C'est ce qu'exige
    // `test/filiales/aucun-parametre-filiale.test.mjs`, et il a refusé la
    // première rédaction, qui écrivait `/api/pieces/filiales/:entiteId`.
    for (const route of serveur.routes) {
      assert.equal(
        /filiale/iu.test(route.url),
        false,
        `${route.methode} ${route.url} nomme une filiale dans son chemin`,
      );
    }
    const logos = declarees.filter((r) => r.url.startsWith('/api/pieces/logo'));
    assert.equal(logos.length, 4);
    for (const route of logos) {
      // Découvert de la route, jamais récité : c'est la MÉTHODE qui dit l'acte.
      const attendu = route.methode === 'GET' ? null : 'administration';
      assert.equal(
        route.acces.domaine,
        attendu,
        `${route.methode} ${route.url} : lire un logo n’exige aucun domaine, le changer ` +
          'exige l’administration (Q-158)',
      );
    }
    // Matière : sans les deux classes présentes, la boucle ci-dessus serait
    // vraie d'un jeu de routes où toutes déclareraient la même chose.
    assert.equal(logos.filter((r) => r.acces.domaine === null).length, 2);
    assert.equal(logos.filter((r) => r.acces.domaine === 'administration').length, 2);
    const metier = declarees.filter((r) => !r.url.startsWith('/api/pieces/logo'));
    assert.equal(metier.length, 4);
    for (const route of metier) {
      assert.equal(route.acces.domaine, 'selon-entite', `${route.methode} ${route.url}`);
    }
  });

  test('une entité inconnue est refusée par le SCHÉMA, avant tout traitement', async () => {
    const reponse = await serveur.appeler('GET', '/api/pieces/utilisateurs/USER-A');
    assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps));
  });
});

describe('Contrôle n° 8 — la ligne n’est visible qu’après l’analyse', () => {
  test('la pièce semée en `en_attente` existe en base, et n’est NI listée NI délivrable', async () => {
    // Le harnais sème `PJ-A` avec l'état par défaut, `en_attente`. C'est
    // exactement la situation que le §31.2 décrit : une pièce en cours
    // d'analyse, qui ne doit jamais sortir.
    const semee = await ligneEnBase('PJ-A');
    assert.notEqual(semee, null, 'le harnais ne sème plus de pièce jointe : plus rien à mesurer');
    assert.equal(semee.etat_analyse, 'en_attente');

    const liste = await serveur.appeler('GET', CIBLE);
    assert.equal(liste.statut, 200);
    assert.equal(
      liste.corps.pieces.some((p) => p.id === 'PJ-A'),
      false,
      'une pièce en cours d’analyse est listée',
    );

    const telechargement = await serveur.appeler('GET', `${CIBLE}/PJ-A`);
    assert.equal(telechargement.statut, 404, JSON.stringify(telechargement.corps));
  });
});

describe('Le chemin nominal — dépôt, liste, délivrance', () => {
  let piece;
  const contenu = pdfValide('rapport de test PRA 2026');

  test('un PDF sain est accepté, et la réponse ne dit pas où il est rangé', async () => {
    const reponse = await serveur.deposer(CIBLE, {
      nom: 'rapport test PRA.pdf',
      type: 'application/pdf',
      contenu,
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    piece = reponse.corps;

    assert.equal(piece.nom_fichier, 'rapport test PRA.pdf');
    assert.equal(piece.type_mime, 'application/pdf');
    assert.equal(piece.extension, 'pdf');
    assert.equal(piece.taille_octets, contenu.length);
    assert.equal(piece.etat_analyse, 'saine');
    assert.equal(piece.quarantaine, false);
    assert.match(piece.id, /^PJ-\d+-[0-9a-z]+$/u);

    // ⚠️ Le chemin de stockage ne sort pas : le publier donnerait au déposant de
    // quoi vérifier ses hypothèses sur la façon dont le nom est tiré.
    assert.equal('chemin_stockage' in piece, false, JSON.stringify(Object.keys(piece)));
  });

  test('contrôle n° 6 — l’empreinte est celle du fichier SUR LE DISQUE', async () => {
    const ligne = await ligneEnBase(piece.id);
    assert.match(ligne.chemin_stockage, /^([0-9a-f]{2}\/)*[0-9a-f]{64}$/u);

    const surDisque = await readFile(join(serveur.config.chemins.piecesJointes, ligne.chemin_stockage));
    const empreinteDisque = createHash('sha256').update(surDisque).digest('hex');

    assert.equal(ligne.sha256, empreinteDisque, 'l’empreinte en base ne décrit pas le disque');
    assert.equal(piece.sha256, empreinteDisque);
    assert.equal(empreinteDisque, createHash('sha256').update(contenu).digest('hex'));
    assert.equal(surDisque.length, contenu.length);
  });

  test('contrôle n° 5 — le nom sur le disque n’emprunte RIEN au nom déposé', async () => {
    const ligne = await ligneEnBase(piece.id);
    const nom = ligne.chemin_stockage.split('/').pop();
    assert.equal(nom.length, 64);
    for (const fragment of ['rapport', 'test', 'PRA', 'pdf', 'RISK', FILIALE_A]) {
      assert.equal(
        ligne.chemin_stockage.toLowerCase().includes(fragment.toLowerCase()),
        false,
        `« ${fragment} » se retrouve dans le chemin de stockage`,
      );
    }
  });

  test('la pièce est listée', async () => {
    const liste = await serveur.appeler('GET', CIBLE);
    assert.equal(liste.statut, 200);
    const vue = liste.corps.pieces.find((p) => p.id === piece.id);
    assert.notEqual(vue, undefined);
    assert.equal('chemin_stockage' in vue, false);
  });

  test('§31.3 — la délivrance force le téléchargement et interdit le reniflage', async () => {
    const reponse = await serveur.appeler('GET', `${CIBLE}/${piece.id}`);
    assert.equal(reponse.statut, 200);
    assert.equal(reponse.entetes['x-content-type-options'], 'nosniff');
    assert.match(reponse.entetes['content-disposition'], /^attachment;/u);
    assert.equal(reponse.entetes['content-type'], 'application/pdf');
    assert.equal(Buffer.compare(reponse.brut, contenu), 0, 'le contenu délivré diffère du dépôt');
  });

  test('HEAD sur la délivrance rend les mêmes en-têtes, et aucun corps', async () => {
    // Fastify ajoute un HEAD pour chaque GET. Il passe par le MÊME gestionnaire,
    // donc par la même ouverture de flux : il faut vérifier qu'il n'y meurt pas,
    // sans quoi le produit livrerait une route montée qui rend 500.
    const reponse = await serveur.appeler('HEAD', `${CIBLE}/${piece.id}`);
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.entetes['x-content-type-options'], 'nosniff');
    assert.match(reponse.entetes['content-disposition'], /^attachment;/u);
    assert.equal(reponse.brut.length, 0, 'un HEAD a renvoyé un corps');
  });

  test('⚠️ le type délivré est celui qui a été CONSTATÉ, jamais celui qui a été annoncé', async () => {
    // Le déposant annonce `application/vnd.ms-excel` — ce que fait un Windows
    // francophone d'un `.csv`. Le type constaté est `text/csv`, et c'est lui qui
    // est enregistré puis renvoyé.
    const reponse = await serveur.deposer(CIBLE, {
      nom: 'export.csv',
      type: 'application/vnd.ms-excel',
      contenu: Buffer.from('nom;valeur\néolienne;12\n', 'utf8'),
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.type_mime, 'text/csv');

    const delivrance = await serveur.appeler('GET', `${CIBLE}/${reponse.corps.id}`);
    assert.equal(delivrance.entetes['content-type'], 'text/csv');
    assert.notEqual(delivrance.entetes['content-type'], 'application/vnd.ms-excel');
  });

  test('un conteneur Office valide passe la chaîne entière', async () => {
    const reponse = await serveur.deposer(CIBLE, { nom: 'budget.xlsx', type: null, contenu: ooxml('xlsx') });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    assert.equal(
      reponse.corps.type_mime,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  test('la suppression retire la ligne ET le fichier', async () => {
    const depose = await serveur.deposer(CIBLE, {
      nom: 'jetable.pdf',
      type: 'application/pdf',
      contenu: pdfValide('jetable'),
    });
    assert.equal(depose.statut, 201);
    const ligne = await ligneEnBase(depose.corps.id);
    const chemin = join(serveur.config.chemins.piecesJointes, ligne.chemin_stockage);
    await readFile(chemin); // présent

    const suppression = await serveur.appeler('DELETE', `${CIBLE}/${depose.corps.id}`);
    assert.equal(suppression.statut, 204);
    assert.equal(await ligneEnBase(depose.corps.id), null);
    await assert.rejects(readFile(chemin), /ENOENT/u);
  });
});

describe('Contrôles n° 3 et 4 — ce qui est refusé ne laisse NI ligne NI octet', () => {
  const refus = [
    { titre: 'un exécutable renommé `.pdf`', nom: 'rapport.pdf', type: 'application/pdf', contenu: executableElf() },
    { titre: 'un `.docm` renommé `.docx`', nom: 'budget.docx', type: null, contenu: ooxml('docm') },
    { titre: 'une archive renommée `.xlsx`', nom: 'archive.xlsx', type: null, contenu: archiveNue() },
    { titre: 'un `.exe`', nom: 'charge.exe', type: null, contenu: executableElf() },
    { titre: 'un `.svg`', nom: 'schema.svg', type: 'image/svg+xml', contenu: svgAvecScript() },
    { titre: 'un fichier vide', nom: 'vide.pdf', type: 'application/pdf', contenu: Buffer.alloc(0) },
  ];

  for (const cas of refus) {
    test(`${cas.titre} est refusé, et rien n’est écrit`, async () => {
      const avant = await compterPieces();
      const reponse = await serveur.deposer(CIBLE, cas);
      assert.equal(reponse.statut, 400, `${cas.titre} : ${JSON.stringify(reponse.corps)}`);
      assert.equal(await compterPieces(), avant, `${cas.titre} : une ligne a été écrite`);

      // Ni dans le magasin, ni dans la zone d'attente.
      for (const racine of [serveur.config.chemins.piecesJointes, serveur.config.chemins.temporaire]) {
        const restes = await listerFichiers(racine);
        assert.equal(
          restes.some((f) => f.taille === cas.contenu.length && cas.contenu.length > 0),
          false,
          `${cas.titre} : un fichier de sa taille traîne sous ${racine}`,
        );
      }
    });
  }

  test('⚠️ le refus de signature ne dit pas comment le contourner', async () => {
    const reponse = await serveur.deposer(CIBLE, {
      nom: 'rapport.pdf',
      type: 'application/pdf',
      contenu: executableElf(),
    });
    assert.equal(reponse.statut, 400);
    const message = reponse.corps.message;
    for (const indice of ['%PDF', 'PK', 'magic', 'signature', 'octet de tête', '7f454c46']) {
      assert.equal(
        message.toLowerCase().includes(indice.toLowerCase()),
        false,
        `le message livre « ${indice} » : ${message}`,
      );
    }
  });
});

describe('§31.3 — le logo de filiale, PNG ou JPEG exclusivement', () => {
  const cible = '/api/pieces/logo';

  test('un `.svg` est refusé comme logo', async () => {
    const reponse = await serveur.deposer(cible, {
      nom: 'marque.svg',
      type: 'image/svg+xml',
      contenu: svgAvecScript(),
    });
    assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps));
  });

  test('un `.pdf` est refusé comme logo — la règle du logo mord aussi', async () => {
    const reponse = await serveur.deposer(cible, {
      nom: 'marque.pdf',
      type: 'application/pdf',
      contenu: pdfValide(),
    });
    assert.equal(reponse.statut, 400);
    assert.match(reponse.corps.message, /logo/iu);
  });

  test('un PNG est accepté, et délivré en pièce jointe — jamais en ligne', async () => {
    const reponse = await serveur.deposer(cible, {
      nom: 'marque.png',
      type: 'image/png',
      contenu: pngValide(),
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.entite_type, 'filiales');

    const delivrance = await serveur.appeler('GET', `${cible}/${reponse.corps.id}`);
    assert.equal(delivrance.statut, 200);
    // Le logo est le seul fichier qu'un écran voudrait afficher : il sort quand
    // même en `attachment` (§31.3), et l'écran s'en fait un objet de données.
    assert.match(delivrance.entetes['content-disposition'], /^attachment;/u);
    assert.equal(delivrance.entetes['content-type'], 'image/png');
  });
});

describe('Le nom du fichier est une valeur d’attaquant', () => {
  test('un nom hostile — mais TRANSPORTABLE — ne casse pas l’en-tête de délivrance', async () => {
    // ⚠️ Ce que le transport peut porter, et ce qu'il ne peut pas.
    //
    // La première rédaction de cet essai envoyait un `filename` contenant un
    // retour chariot, et elle mesurait autre chose que ce qu'elle croyait : un
    // CRLF dans un `filename` scinde le BLOC D'EN-TÊTES de la partie multipart,
    // si bien que le nom reçu était « rap » — l'analyseur avait déjà tranché, et
    // l'en-tête de délivrance n'était jamais éprouvé. Aucun navigateur n'envoie
    // cela ; ils encodent. On envoie donc ici ce qu'un navigateur peut
    // réellement produire, et le cas du caractère de commande se mesure sur la
    // fonction qui le traite, deux essais plus bas.
    const hostile = 'rapport; nom=x <script>alert(1)</script> été «â» ../../etc.pdf';
    const reponse = await serveur.deposer(CIBLE, {
      nom: hostile,
      type: 'application/pdf',
      contenu: pdfValide('hostile'),
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    // Le chemin est réduit à son dernier segment : « ../../etc.pdf » ne voyage pas.
    assert.equal(reponse.corps.nom_fichier.includes('/'), false, reponse.corps.nom_fichier);
    assert.equal(reponse.corps.extension, 'pdf');

    const delivrance = await serveur.appeler('GET', `${CIBLE}/${reponse.corps.id}`);
    assert.equal(delivrance.statut, 200);
    const disposition = delivrance.entetes['content-disposition'];
    assert.match(disposition, /^attachment; filename="[A-Za-z0-9._-]*"; filename\*=UTF-8''/u);
    // Le repli ASCII ne laisse sortir ni guillemet, ni barre oblique, ni « < ».
    const repli = /filename="([^"]*)"/u.exec(disposition)[1];
    assert.equal(/^[A-Za-z0-9._-]+$/u.test(repli), true, repli);
    // Et la forme encodée ne porte que des caractères sûrs.
    const encode = disposition.split("filename*=UTF-8''")[1];
    assert.equal(/^[A-Za-z0-9!#$&+\-.^_`|~%]+$/u.test(encode), true, encode);
  });

  test('`normaliserNomFichier` retire ce qui scinderait un en-tête ou une ligne de journal', () => {
    assert.equal(normaliserNomFichier('a\r\nX-Injecte: oui.pdf'), 'a X-Injecte: oui.pdf');
    assert.equal(normaliserNomFichier('/etc/passwd'), 'passwd');
    assert.equal(normaliserNomFichier('C:\\Windows\\notes.txt'), 'notes.txt');
    assert.equal(normaliserNomFichier('   '), null);
    assert.equal(normaliserNomFichier('..'), null);
    assert.equal(normaliserNomFichier('x'.repeat(400)).length, 255);
  });

  test('`dispositionAttachement` ne produit jamais de caractère de commande', () => {
    for (const nom of ['a\r\nX: y.pdf', '"; rm -rf /".pdf', 'é'.repeat(300), '\u0000.pdf']) {
      const entete = dispositionAttachement(nom);
      assert.equal(/[\u0000-\u001f]/u.test(entete), false, JSON.stringify(entete));
      assert.match(entete, /^attachment; filename="[A-Za-z0-9._-]*"; filename\*=UTF-8''/u);
    }
  });
});

describe('Le journal d’audit — la couverture que le lot L5 attend', () => {
  test('un dépôt émet `analyse_antivirus` PUIS `creation`, sans valeur d’utilisateur dans le résumé', async () => {
    const depart = await dernierNumeroJournal();
    const reponse = await serveur.deposer(CIBLE, {
      nom: 'trace.pdf',
      type: 'application/pdf',
      contenu: pdfValide('trace'),
    });
    assert.equal(reponse.statut, 201);

    const entrees = await journalDepuis(depart);
    const actions = entrees.map((e) => e.action);
    assert.deepEqual(actions, ['analyse_antivirus', 'creation'], JSON.stringify(entrees, null, 2));

    const creation = entrees[1];
    assert.equal(creation.entite_type, 'pieces_jointes');
    assert.equal(creation.entite_id, reponse.corps.id);
    // §29.5 : aucune valeur d'utilisateur dans `resume`. Le nom du fichier
    // voyage en `jsonb`, où l'encodage est le problème de PostgreSQL.
    assert.equal(creation.resume.includes('trace.pdf'), false, creation.resume);
    assert.equal(creation.valeurs_apres.nom_fichier, 'trace.pdf');
    assert.equal(creation.valeurs_apres.sha256, reponse.corps.sha256);
  });

  test('un téléchargement est tracé en `consultation_sensible`', async () => {
    const depose = await serveur.deposer(CIBLE, {
      nom: 'lue.pdf',
      type: 'application/pdf',
      contenu: pdfValide('lue'),
    });
    const depart = await dernierNumeroJournal();
    const delivrance = await serveur.appeler('GET', `${CIBLE}/${depose.corps.id}`);
    assert.equal(delivrance.statut, 200);

    const entrees = await journalDepuis(depart);
    assert.deepEqual(
      entrees.map((e) => e.action),
      ['consultation_sensible'],
      JSON.stringify(entrees),
    );
    assert.equal(entrees[0].entite_id, depose.corps.id);
  });

  test('une suppression est tracée', async () => {
    const depose = await serveur.deposer(CIBLE, {
      nom: 'ephemere.pdf',
      type: 'application/pdf',
      contenu: pdfValide('ephemere'),
    });
    const depart = await dernierNumeroJournal();
    await serveur.appeler('DELETE', `${CIBLE}/${depose.corps.id}`);
    const entrees = await journalDepuis(depart);
    assert.deepEqual(entrees.map((e) => e.action), ['suppression']);
  });
});

describe('Les droits — le refus vient du crochet, pas de la route', () => {
  test('un profil `lecture` ne peut pas déposer, et le sait avant que le corps soit lu', async () => {
    session.poser(perimetreDe('lecteur', FILIALE_A), LECTEUR);
    try {
      const avant = await compterPieces();
      const reponse = await serveur.deposer(CIBLE, {
        nom: 'interdit.pdf',
        type: 'application/pdf',
        contenu: pdfValide('interdit'),
      });
      assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps));
      assert.equal(await compterPieces(), avant);
    } finally {
      session.poser(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
    }
  });

  test('un profil sans le domaine `administration` ne dépose pas de logo', async () => {
    session.poser(perimetreDe('rssi.toulouse', FILIALE_A), {
      niveau: 'administration',
      domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'administration'),
      export: true,
    });
    try {
      const reponse = await serveur.deposer('/api/pieces/logo', {
        nom: 'marque.png',
        type: 'image/png',
        contenu: pngValide(),
      });
      assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps));
    } finally {
      session.poser(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
    }
  });
});

describe('Contrôles n° 1 et 2 — la taille, puis le quota', () => {
  test('un fichier au-delà de la borne rend 413, et n’atteint pas le disque', async () => {
    const menu = await monterPieces(base, session, { piecesJointes: { tailleMaxOctets: 4096 } });
    try {
      const gros = Buffer.concat([pdfValide('gros'), Buffer.alloc(8192, 0x20)]);
      const reponse = await menu.deposer(CIBLE, { nom: 'gros.pdf', type: 'application/pdf', contenu: gros });
      assert.equal(reponse.statut, 413, JSON.stringify(reponse.corps));
      assert.deepEqual(await listerFichiers(menu.config.chemins.piecesJointes), []);
      assert.deepEqual(await listerFichiers(menu.config.chemins.temporaire), []);

      // Sous la borne, le même chemin accepte.
      const petit = await menu.deposer(CIBLE, {
        nom: 'petit.pdf',
        type: 'application/pdf',
        contenu: pdfValide('petit'),
      });
      assert.equal(petit.statut, 201, JSON.stringify(petit.corps));
    } finally {
      await menu.fermer();
    }
  });

  test('une longueur ANNONCÉE hors borne est refusée sans qu’un octet soit lu', async () => {
    const menu = await monterPieces(base, session, { piecesJointes: { tailleMaxOctets: 4096 } });
    try {
      const { corpsMultipart } = await import('./aide.mjs');
      const enveloppe = corpsMultipart([
        { nom: 'fichier', nomFichier: 'petit.pdf', type: 'application/pdf', contenu: pdfValide('petit') },
      ]);
      const reponse = await menu.appeler('POST', CIBLE, {
        corps: enveloppe.corps,
        entetes: {
          'content-type': enveloppe.contentType,
          // Le corps est minuscule ; c'est l'ANNONCE qui est hors borne.
          'content-length': String(50 * 1024 * 1024),
        },
      });
      assert.equal(reponse.statut, 413, JSON.stringify(reponse.corps));
    } finally {
      await menu.fermer();
    }
  });

  test('le quota de la filiale refuse le dépôt suivant', async () => {
    // Le harnais a déjà semé une pièce de 4096 octets déclarés : le quota se
    // calcule sur `sum(taille_octets)`, pas sur ce que ce montage a déposé.
    const occupe = Number(
      (
        await enBase(
          'select coalesce(sum(taille_octets),0)::text as v from pieces_jointes where filiale_id = $1',
          [FILIALE_A],
        )
      )[0].v,
    );
    assert.ok(occupe > 0, 'aucun volume occupé : le quota n’a rien à mesurer');

    const menu = await monterPieces(base, session, {
      piecesJointes: { quotaFilialeOctets: occupe + 10 },
    });
    try {
      const reponse = await menu.deposer(CIBLE, {
        nom: 'trop.pdf',
        type: 'application/pdf',
        contenu: pdfValide('un contenu qui dépasse les dix octets restants'),
      });
      assert.equal(reponse.statut, 413, JSON.stringify(reponse.corps));
      assert.match(reponse.corps.message, /quota|stockage/iu);
      assert.deepEqual(await listerFichiers(menu.config.chemins.piecesJointes), []);
    } finally {
      await menu.fermer();
    }
  });
});

/** Fichiers présents sous une racine, récursivement. Rend `[]` si elle n'existe pas. */
async function listerFichiers(racine) {
  const { readdir, stat } = await import('node:fs/promises');
  const trouves = [];
  const parcourir = async (chemin) => {
    let entrees;
    try {
      entrees = await readdir(chemin, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entree of entrees) {
      const complet = join(chemin, entree.name);
      if (entree.isDirectory()) await parcourir(complet);
      else trouves.push({ chemin: complet, taille: (await stat(complet)).size });
    }
  };
  await parcourir(racine);
  return trouves;
}
