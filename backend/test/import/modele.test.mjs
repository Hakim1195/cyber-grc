/**
 * modele.test.mjs — **les colonnes se découvrent, et le modèle se télécharge.**
 *
 * Ce que ce fichier mesure, et que rien d'autre ne mesure :
 *
 *  · le modèle est **dérivé de `Depot.decrire()`** — il n'existe nulle part de
 *    liste de champs, et le banc le vérifie en confrontant les deux sources
 *    plutôt qu'en recopiant ce qu'il attend ;
 *  · **aucune colonne « identifiant »** n'existe, sur aucune des 21 entités —
 *    c'est le constat **M-3**, et une seule entité qui en porterait une rouvrirait
 *    l'oracle d'existence inter-filiales ;
 *  · les **déclarations d'accès** que Fastify voit réellement, lues sur les
 *    routes montées et non recopiées ;
 *  · le **gabarit téléchargé** s'ouvre par le lecteur du produit, et la feuille
 *    d'aide n'est jamais prise pour des données.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { monterImport, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const { listerEntites } = await moduleCompile('entites/index.js');
const { correspondanceEnTetes, libelleDe, normaliserEnTete } =
  await moduleCompile('import/modele.js');
const { lireTableur } = await moduleCompile('import/tableur.js');

const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

let base;
let serveur;
let session;
let modeles;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
  serveur = await monterImport(base, session);
  const reponse = await serveur.appeler('GET', '/api/import/modeles');
  assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
  modeles = reponse.corps;
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

describe('La couture — les routes que le point d’entrée monte', () => {
  test('les trois routes existent, et portent les déclarations attendues', () => {
    // ⚠️ `HEAD` est ajouté par Fastify pour chaque `GET`, et il porte la MÊME
    // déclaration d'accès. C'est ce qu'on veut : une route sans déclaration est
    // refusée par le crochet (fail-closed), et un `HEAD` qui échapperait au
    // contrôle des droits serait un oracle de plus.
    const vues = serveur.routes.map((r) => `${r.methode} ${r.url}`).sort();
    assert.deepEqual(vues, [
      'GET /api/import/:entite/modele',
      'GET /api/import/modeles',
      'HEAD /api/import/:entite/modele',
      'HEAD /api/import/modeles',
      'POST /api/import/:entite',
    ]);
    for (const route of serveur.routes) {
      assert.notEqual(route.acces, undefined, `${route.methode} ${route.url} sans déclaration`);
    }
    const acces = Object.fromEntries(
      serveur.routes.map((r) => [`${r.methode} ${r.url}`, r.acces]),
    );
    assert.deepEqual(acces['GET /api/import/modeles'], { action: 'lire', domaine: null });
    assert.deepEqual(acces['GET /api/import/:entite/modele'], {
      action: 'lire',
      domaine: 'selon-entite',
    });
    // ⚠️ `ecrire`, PAS `administrer` : l'arbitrage est écrit dans l'entête de
    // `src/import/index.ts`, et ce contrôle est là pour qu'il ne dérive pas
    // sans qu'on s'en aperçoive — dans un sens comme dans l'autre.
    assert.deepEqual(acces['POST /api/import/:entite'], {
      action: 'ecrire',
      domaine: 'selon-entite',
    });
  });

  test('la couture est branchée dans `src/api/index.ts`', () => {
    // Si elle ne l'était pas, le banc aurait monté le greffon lui-même et cette
    // famille serait quand même verte : on DIT donc ce qu'on a rencontré.
    assert.equal(
      serveur.coutureBranchee,
      true,
      'src/api/index.ts doit enregistrer greffonImport avec { pool, config }',
    );
  });
});

describe('Le modèle est DÉRIVÉ, il n’est pas écrit', () => {
  test('les 21 entités du registre ont un modèle, sans exception ni liste', () => {
    const attendues = [...listerEntites()].sort();
    const rendues = modeles.entites.map((e) => e.entite).sort();
    assert.deepEqual(rendues, attendues);
    assert.equal(rendues.length, 21);
  });

  test('les colonnes coïncident champ pour champ avec `GET /api/modele`', async () => {
    // ⚠️ La confrontation est le contrôle : si un jour le modèle d'import se
    // mettait à porter sa propre liste, ce test rougirait au premier écart —
    // c'est-à-dire au premier champ ajouté au produit.
    const reponse = await serveur.appeler('GET', '/api/modele');
    assert.equal(reponse.statut, 200);
    const source = reponse.corps.entites;

    for (const modele of modeles.entites) {
      const attendus = Object.keys(source[modele.entite].champs).sort();
      const rendus = modele.colonnes.map((c) => c.champ).sort();
      assert.deepEqual(rendus, attendus, `entité ${modele.entite}`);

      for (const colonne of modele.colonnes) {
        const reference = source[modele.entite].champs[colonne.champ];
        assert.equal(colonne.type, reference.type, `${modele.entite}.${colonne.champ} : type`);
        assert.equal(
          colonne.obligatoire,
          reference.obligatoire,
          `${modele.entite}.${colonne.champ} : obligatoire`,
        );
      }

      const liaisons = source[modele.entite].liaisons.map((l) => l.champ).sort();
      assert.deepEqual([...modele.liaisonsExclues].sort(), liaisons, `liaisons ${modele.entite}`);
    }
  });

  test('AUCUNE entité ne porte de colonne « identifiant » — constat M-3', () => {
    for (const modele of modeles.entites) {
      for (const colonne of modele.colonnes) {
        assert.notEqual(colonne.champ, 'id', `${modele.entite} porte une colonne id`);
        assert.ok(
          !/^identifiant$/iu.test(colonne.libelle),
          `${modele.entite}.${colonne.champ} s'affiche « ${colonne.libelle} »`,
        );
      }
    }
  });

  test('les obligatoires passent devant, et l’ordre imposé passe devant elles', () => {
    const risques = modeles.entites.find((e) => e.entite === 'risques');
    assert.deepEqual(
      risques.colonnes.slice(0, 5).map((c) => c.champ),
      ['nom', 'description', 'f_frequence', 'g_gravite', 'm_maitrise'],
    );
    // Sans ordre imposé, l'obligatoire vient en tête.
    const incidents = modeles.entites.find((e) => e.entite === 'incidents');
    assert.equal(incidents.colonnes[0].champ, 'titre');
    assert.equal(incidents.colonnes[0].obligatoire, true);
  });

  test('un libellé absent se voit : la colonne s’affiche sous son nom technique', () => {
    assert.equal(libelleDe('risques', 'f_frequence'), 'Vraisemblance F (1 à 4)');
    assert.equal(libelleDe('incidents', 'titre'), 'Titre');
    // Un champ que la liste ne nomme pas — le cas de l'omission, rendu visible.
    assert.equal(libelleDe('incidents', 'champ_inconnu_demain'), 'champ_inconnu_demain');
  });

  test('les liaisons n-n sont nommées comme exclues, pas passées sous silence', () => {
    const actifs = modeles.entites.find((e) => e.entite === 'actifs');
    assert.deepEqual([...actifs.liaisonsExclues].sort(), ['dependances', 'risques_lies']);
    assert.ok(!actifs.colonnes.some((c) => c.champ === 'dependances'));
  });

  test('les bornes de l’import sont publiées avec le modèle', () => {
    assert.equal(typeof modeles.lignesMax, 'number');
    assert.ok(modeles.lignesMax > 0);
    assert.ok(modeles.tailleMaxOctets > 0);
  });
});

describe('Reconnaître les en-têtes d’un fichier rempli à la main', () => {
  const modele = {
    entite: 'incidents',
    domaine: 'incidents',
    liaisonsExclues: [],
    colonnes: [
      { champ: 'titre', libelle: 'Titre', type: 'texte', obligatoire: true },
      { champ: 'gravite', libelle: 'Gravité', type: 'texte', obligatoire: false },
      { champ: 'date_detection', libelle: 'Date de détection', type: 'date', obligatoire: false },
    ],
  };

  test('la casse, les accents et la ponctuation ne font pas rater une colonne', () => {
    assert.equal(normaliserEnTete('Date de détection'), 'datededetection');
    const trouvee = correspondanceEnTetes(modele, ['TITRE', 'gravite', 'date de detection']);
    assert.deepEqual(
      trouvee.parPosition.map((c) => c?.champ ?? null),
      ['titre', 'gravite', 'date_detection'],
    );
    assert.deepEqual(trouvee.inconnues, []);
    assert.deepEqual(trouvee.manquantes, []);
  });

  test('le nom technique est reconnu aussi — celui qui a renommé la colonne a raison', () => {
    const trouvee = correspondanceEnTetes(modele, ['titre', 'date_detection']);
    assert.deepEqual(
      trouvee.parPosition.map((c) => c?.champ ?? null),
      ['titre', 'date_detection'],
    );
  });

  test('une colonne inconnue est SIGNALÉE, jamais avalée', () => {
    const trouvee = correspondanceEnTetes(modele, ['Titre', 'Coût estimé']);
    assert.deepEqual(trouvee.inconnues, ['Coût estimé']);
  });

  test('une obligatoire absente et un doublon sont tous deux dits', () => {
    const sansTitre = correspondanceEnTetes(modele, ['Gravité']);
    assert.deepEqual(
      sansTitre.manquantes.map((c) => c.champ),
      ['titre'],
    );
    const enDouble = correspondanceEnTetes(modele, ['Titre', 'titre']);
    assert.deepEqual(enDouble.doublons, ['Titre']);
  });
});

describe('Le gabarit téléchargeable', () => {
  test('le classeur s’ouvre par le lecteur du produit, et ses en-têtes sont les libellés', async () => {
    const reponse = await serveur.appeler('GET', '/api/import/incidents/modele');
    assert.equal(reponse.statut, 200);
    assert.match(
      reponse.entetes['content-type'],
      /spreadsheetml\.sheet/u,
      reponse.entetes['content-type'],
    );
    assert.match(reponse.entetes['content-disposition'], /attachment; filename="modele-import-incidents\.xlsx"/u);
    assert.equal(reponse.entetes['x-content-type-options'], 'nosniff');

    const { source, tableur } = lireTableur(reponse.brut);
    assert.equal(source, 'excel');
    const incidents = modeles.entites.find((e) => e.entite === 'incidents');
    assert.deepEqual(tableur.enTetes, incidents.colonnes.map((c) => c.libelle));
    // ⚠️ Le gabarit ne porte AUCUNE ligne de données : une ligne d'exemple
    // reviendrait en base le jour où l'utilisateur renvoie le fichier.
    assert.equal(tableur.lignes.length, 0);
  });

  test('la feuille d’aide existe, et elle n’est pas lue comme des données', async () => {
    const reponse = await serveur.appeler('GET', '/api/import/actifs/modele');
    const texte = reponse.brut.toString('latin1');
    // Deux feuilles dans le conteneur, et la seconde s'appelle « Aide ».
    assert.match(texte, /xl\/worksheets\/sheet2\.xml/u);
    const { tableur } = lireTableur(reponse.brut);
    assert.equal(tableur.lignes.length, 0, 'la feuille d’aide ne doit pas devenir des données');
  });

  test('le format CSV est servi sur demande, avec le BOM qu’Excel attend', async () => {
    const reponse = await serveur.appeler('GET', '/api/import/actifs/modele?format=csv');
    assert.equal(reponse.statut, 200);
    assert.match(reponse.entetes['content-type'], /text\/csv/u);
    assert.deepEqual([...reponse.brut.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const { source, tableur } = lireTableur(reponse.brut);
    assert.equal(source, 'csv');
    const actifs = modeles.entites.find((e) => e.entite === 'actifs');
    assert.deepEqual(tableur.enTetes, actifs.colonnes.map((c) => c.libelle));
  });

  test('un gabarit vierge, renvoyé tel quel, n’importe rien et ne casse rien', async () => {
    const gabarit = await serveur.appeler('GET', '/api/import/actifs/modele');
    const reponse = await serveur.importer(
      'actifs',
      { nom: 'modele-vierge.xlsx', contenu: gabarit.brut },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.lues, 0);
    assert.equal(reponse.corps.creees, 0);
  });

  test('une entité inconnue est refusée par le schéma de route', async () => {
    const reponse = await serveur.appeler('GET', '/api/import/filiales/modele');
    assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps));
  });
});
