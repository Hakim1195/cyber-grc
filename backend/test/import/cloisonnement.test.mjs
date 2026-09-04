/**
 * cloisonnement.test.mjs — **l'idempotence par le fichier, et la filiale d'à côté.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Deux propriétés, et pourquoi elles vivent dans le même fichier
 * ════════════════════════════════════════════════════════════════════════
 *
 * Elles se mesurent sur le **même montage** : une base **non vide**, deux
 * filiales peuplées à égalité, et des imports joués **dans les deux sens**. Un
 * essai qui importerait zéro ligne et conclurait « rien n'a fui » ne prouverait
 * rien : ici, chaque mesure de non-fuite est encadrée par une mesure d'écriture
 * réelle du même volume.
 *
 *  · **Idempotence** — `imports.cle_idempotence` porte l'empreinte du fichier,
 *    et l'unicité partielle `uq_imports_idempotence` porte sur
 *    `(filiale, entité, empreinte)`. Le même fichier deux fois est sans effet ;
 *    ⚠️ **un fichier modifié d'un octet est un fichier neuf** — c'est la borne du
 *    `CONVENTIONS.md` §33.2, et elle est mesurée ici plutôt que crue.
 *  · **Cloisonnement** — un import s'applique à la filiale ACTIVE, jamais
 *    ailleurs. Le contrôle le plus dur est celui de la référence croisée : une
 *    ligne qui désigne l'enregistrement d'une filiale voisine est refusée par la
 *    clé étrangère **composite** `(id, filiale_id)`, et le refus est nommé
 *    ligne par ligne.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import {
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { csvEssai, monterImport, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');

const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

const VOLUME = 120;

let base;
let serveur;
let session;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
  serveur = await monterImport(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

beforeEach(() => {
  session.poser(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
});

async function enBase(filiale, sql, parametres = []) {
  return base.avecPerimetre(
    applicatif,
    perimetre('banc', filiale, [filiale]),
    async (client) => (await client.query(sql, parametres)).rows,
  );
}

const compter = async (filiale, sql, parametres = []) =>
  Number((await enBase(filiale, sql, parametres))[0].n);

const compterActifs = (filiale) =>
  compter(filiale, 'select count(*)::int as n from actifs');

const compterIncidents = (filiale) =>
  compter(filiale, 'select count(*)::int as n from incidents');

/** `VOLUME` actifs, préfixés pour que deux fichiers ne se confondent pas. */
function fichierActifs(prefixe) {
  const lignes = [['Nom', 'Type', 'Criticité', 'Description']];
  for (let index = 1; index <= VOLUME; index += 1) {
    lignes.push([
      `${prefixe} ${String(index).padStart(3, '0')}`,
      'Service',
      'modérée',
      `Repris de la société rachetée (${prefixe})`,
    ]);
  }
  return csvEssai(lignes);
}

/* =====================================================================
 *  1. L'idempotence porte sur le FICHIER
 * ===================================================================== */

describe('Idempotence — le même fichier, deux fois, sans effet', () => {
  test('le premier import écrit ses 120 lignes', async () => {
    const avant = await compterActifs(FILIALE_A);
    const reponse = await serveur.importer(
      'actifs',
      { nom: 'actifs-rachat.csv', contenu: fichierActifs('Actif repris') },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, VOLUME);
    assert.equal(await compterActifs(FILIALE_A), avant + VOLUME);
  });

  test('le même fichier, réenvoyé, ne crée rien — et le DIT', async () => {
    const avant = await compterActifs(FILIALE_A);
    const reponse = await serveur.importer(
      'actifs',
      { nom: 'actifs-rachat.csv', contenu: fichierActifs('Actif repris') },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.dejaImporte, true);
    assert.equal(reponse.corps.creees, 0);
    assert.equal(reponse.corps.applique, false);
    assert.match(reponse.corps.message, /déjà été importé/u);
    // La réponse désigne l'import d'origine et sa date : l'utilisateur peut
    // vérifier plutôt que croire.
    assert.ok(typeof reponse.corps.importId === 'string' && reponse.corps.importId.length > 0);
    assert.ok(typeof reponse.corps.debutLe === 'string');
    assert.equal(await compterActifs(FILIALE_A), avant);
  });

  test('un renommage du fichier n’y change rien : l’empreinte porte sur le CONTENU', async () => {
    const avant = await compterActifs(FILIALE_A);
    const reponse = await serveur.importer(
      'actifs',
      { nom: 'copie-de-actifs-rachat (1).csv', contenu: fichierActifs('Actif repris') },
      { appliquer: true },
    );
    assert.equal(reponse.corps.dejaImporte, true);
    assert.equal(await compterActifs(FILIALE_A), avant);
  });

  test('un aperçu du même fichier le dit aussi, plutôt que d’annoncer 120 créations', async () => {
    const reponse = await serveur.importer('actifs', {
      nom: 'actifs-rachat.csv',
      contenu: fichierActifs('Actif repris'),
    });
    assert.equal(reponse.corps.dejaImporte, true);
    assert.equal(reponse.corps.creees, 0);
  });

  test('⚠️ LA BORNE : un fichier modifié d’UN SEUL OCTET est un fichier neuf', async () => {
    const original = fichierActifs('Actif repris');
    const modifie = Buffer.from(original);
    // Un « e » minuscule devient majuscule, quelque part dans une description.
    const position = modifie.indexOf(Buffer.from('Repris de la société', 'utf8'));
    assert.ok(position > 0, 'la fabrique doit produire le texte attendu');
    modifie[position] = 0x72; // « R » → « r »

    assert.equal(modifie.length, original.length);
    assert.equal(
      [...original].filter((octet, position) => octet !== modifie[position]).length,
      1,
      'les deux fichiers doivent différer d’EXACTEMENT un octet',
    );

    const avant = await compterActifs(FILIALE_A);
    const reponse = await serveur.importer(
      'actifs',
      { nom: 'actifs-rachat.csv', contenu: modifie },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.dejaImporte, false);
    assert.equal(reponse.corps.creees, VOLUME);
    assert.equal(await compterActifs(FILIALE_A), avant + VOLUME);
    // ⚠️ Conséquence à connaître : l'idempotence protège du double clic et du
    // rejeu, PAS de la ressaisie. C'est l'aperçu qui protège du second cas.
  });

  test('la trace `imports` porte l’empreinte, l’auteur et les volumes', async () => {
    const traces = await enBase(
      FILIALE_A,
      `select "statut", "source", "nom_fichier", "sha256", "cle_idempotence",
              "utilisateur_libelle", "lignes_lues", "lignes_creees", "lignes_mises_a_jour"
         from imports where statut = 'applique' order by debut_le`,
    );
    assert.equal(traces.length, 2, 'deux fichiers distincts, deux traces appliquées');
    for (const trace of traces) {
      assert.equal(trace.source, 'csv');
      assert.equal(trace.utilisateur_libelle, 'rssi.toulouse');
      assert.equal(trace.lignes_lues, VOLUME);
      assert.equal(trace.lignes_creees, VOLUME);
      // L'import CRÉE : il ne met rien à jour, et la colonne ne prétend pas
      // le contraire (voir l'entête de `src/import/moteur.ts`).
      assert.equal(trace.lignes_mises_a_jour, 0);
      assert.equal(trace.cle_idempotence, trace.sha256);
      assert.match(trace.sha256, /^[0-9a-f]{64}$/u);
    }
    assert.notEqual(traces[0].sha256, traces[1].sha256);
  });
});

/* =====================================================================
 *  2. Le cloisonnement — dans les deux sens, sur une base NON VIDE
 * ===================================================================== */

describe('Cloisonnement — un import s’applique à la filiale active, jamais ailleurs', () => {
  test('importer dans A ne touche pas B ; importer dans B ne touche pas A', async () => {
    const departA = await compterIncidents(FILIALE_A);
    const departB = await compterIncidents(FILIALE_B);
    // ⚠️ La base n'est PAS vide : les deux filiales portent déjà leurs lignes.
    assert.ok(departA > 0 && departB > 0, 'la mesure exige de la matière des deux côtés');

    const dansA = csvEssai([
      ['Titre', 'Gravité'],
      ...Array.from({ length: 30 }, (_, i) => [`Incident A-${String(i)}`, 'faible']),
    ]);
    const reponseA = await serveur.importer(
      'incidents',
      { nom: 'incidents-A.csv', contenu: dansA },
      { appliquer: true },
    );
    assert.equal(reponseA.statut, 200, JSON.stringify(reponseA.corps));
    assert.equal(reponseA.corps.creees, 30);
    assert.equal(await compterIncidents(FILIALE_A), departA + 30);
    assert.equal(await compterIncidents(FILIALE_B), departB, 'B ne doit pas avoir bougé');

    // ── L'autre sens : la même mesure, depuis la filiale voisine ────────
    session.poser(perimetreDe('rssi.allemagne', FILIALE_B), TOUS_DROITS);
    const dansB = csvEssai([
      ['Titre', 'Gravité'],
      ...Array.from({ length: 17 }, (_, i) => [`Incident B-${String(i)}`, 'élevée']),
    ]);
    const reponseB = await serveur.importer(
      'incidents',
      { nom: 'incidents-B.csv', contenu: dansB },
      { appliquer: true },
    );
    assert.equal(reponseB.statut, 200, JSON.stringify(reponseB.corps));
    assert.equal(reponseB.corps.creees, 17);
    assert.equal(await compterIncidents(FILIALE_B), departB + 17);
    assert.equal(
      await compterIncidents(FILIALE_A),
      departA + 30,
      'A ne doit pas avoir bougé pendant l’import de B',
    );

    // Et les lignes portent bien la filiale de la session qui les a écrites.
    const chezA = await enBase(
      FILIALE_A,
      `select count(*)::int as n from incidents where titre like 'Incident B-%'`,
    );
    assert.equal(Number(chezA[0].n), 0, 'aucune ligne de B n’est visible depuis A');
  });

  test('le MÊME fichier s’applique dans chaque filiale : l’idempotence est cloisonnée', async () => {
    const contenu = csvEssai([
      ['Titre', 'Gravité'],
      ['Incident partagé', 'moyenne'],
    ]);
    session.poser(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
    const dansA = await serveur.importer(
      'incidents',
      { nom: 'partage.csv', contenu },
      { appliquer: true },
    );
    assert.equal(dansA.corps.creees, 1, JSON.stringify(dansA.corps));

    session.poser(perimetreDe('rssi.allemagne', FILIALE_B), TOUS_DROITS);
    const dansB = await serveur.importer(
      'incidents',
      { nom: 'partage.csv', contenu },
      { appliquer: true },
    );
    // ⚠️ L'unicité porte sur `(filiale, entité, empreinte)` : le même fichier
    // n'est un doublon que DANS SA FILIALE. Vingt filiales qui reprennent le
    // même gabarit rempli ne se bloquent pas les unes les autres.
    assert.equal(dansB.corps.dejaImporte, false, JSON.stringify(dansB.corps));
    assert.equal(dansB.corps.creees, 1);
  });

  test('une ligne qui désigne l’enregistrement d’une AUTRE filiale est refusée, nommément', async () => {
    session.poser(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
    const departA = await compterIncidents(FILIALE_A);
    const departB = await compterIncidents(FILIALE_B);

    // `RISK-B` existe — dans la filiale voisine. La clé étrangère est
    // COMPOSITE `(risque_id, filiale_id)` : depuis A, elle ne peut pas être
    // satisfaite, et la ligne invisible ne peut donc pas être visée.
    const contenu = csvEssai([
      ['Titre', 'Risque (identifiant)'],
      ['Incident local 1', 'RISK-A'],
      ['Incident qui vise la voisine', 'RISK-B'],
      ['Incident local 2', 'RISK-A'],
    ]);
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'reference-croisee.csv', contenu },
      { appliquer: true },
    );

    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.enErreur, 1);
    assert.equal(reponse.corps.erreurs[0].ligne, 3);
    assert.equal(reponse.corps.erreurs[0].colonne, 'Risque (identifiant)');
    assert.equal(reponse.corps.erreurs[0].valeur, 'RISK-B');
    // Le message ne dit pas « RISK-B existe ailleurs » : ce serait l'oracle.
    assert.ok(
      !/autre filiale|existe ailleurs|FIL-ESSAI-B/iu.test(reponse.corps.erreurs[0].message),
      reponse.corps.erreurs[0].message,
    );
    // Tout ou rien : les deux lignes valides ne sont pas passées non plus.
    assert.equal(await compterIncidents(FILIALE_A), departA);
    assert.equal(await compterIncidents(FILIALE_B), departB);
  });

  test('le même fichier, débarrassé de la référence croisée, passe entièrement', async () => {
    const departA = await compterIncidents(FILIALE_A);
    const contenu = csvEssai([
      ['Titre', 'Risque (identifiant)'],
      ['Incident local 1', 'RISK-A'],
      ['Incident qui reste chez lui', 'RISK-A'],
      ['Incident local 2', 'RISK-A'],
    ]);
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'reference-locale.csv', contenu },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, 3);
    assert.equal(await compterIncidents(FILIALE_A), departA + 3);

    const lignes = await enBase(
      FILIALE_A,
      `select "risque_id" from incidents where titre = 'Incident qui reste chez lui'`,
    );
    assert.equal(lignes[0].risque_id, 'RISK-A');
  });

  test('la trace d’un import de A n’est pas lisible depuis B', async () => {
    const depuisA = await compter(
      FILIALE_A,
      `select count(*)::int as n from imports where nom_fichier = 'incidents-A.csv'`,
    );
    assert.equal(depuisA, 1);
    const depuisB = await compter(
      FILIALE_B,
      `select count(*)::int as n from imports where nom_fichier = 'incidents-A.csv'`,
    );
    assert.equal(depuisB, 0, 'la trace d’un import suit la filiale de l’import');
  });
});
