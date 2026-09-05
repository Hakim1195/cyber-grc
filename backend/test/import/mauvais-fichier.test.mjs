/**
 * mauvais-fichier.test.mjs — **le fichier qui n'a rien à voir, et ce que le
 * produit lui répond.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le constat Q-202, et pourquoi il ne se voyait nulle part ailleurs
 * ════════════════════════════════════════════════════════════════════════
 *
 * Toutes les autres familles déposent un fichier **de la bonne entité**, juste
 * ou faux. Aucune ne déposait le fichier d'à côté — un export d'annuaire sur
 * « Revues de direction », le geste le plus banal qui soit. Mesuré par la porte
 * S6, avant correction :
 *
 *     POST /api/import/revues?appliquer=oui   « Nom;Prénom;Service »
 *       → 200 { lues: 3, creees: 3, enErreur: 0,
 *               colonnesInconnues: ["Nom","Prénom","Service"],
 *               message: "3 enregistrement(s) ont été créés." }
 *     EN BASE : trois revues de direction ENTIÈREMENT NULLES.
 *
 * `revues` est la seule entité importable dont **aucune** colonne n'est
 * obligatoire (`003_metier_operations.sql` §9). Le garde-fou « colonne
 * obligatoire absente » ne pouvait donc rien : `champs` restait vide, et
 * `inserer()` écrivait `insert into "revues" ("id","filiale_id")`. Le registre
 * des revues de direction **fait preuve en audit ISO 27001** : l'utilisateur y
 * versait des revues vides, et le produit lui répondait que tout s'était bien
 * passé. Premier cas du tableau du `CLAUDE.md` §3 — *quelque chose réussit en
 * silence alors que c'est faux*.
 *
 * ⚠️ **Ce fichier n'écrit AUCUNE liste des entités sans colonne obligatoire.**
 * Il les **découvre** dans `GET /api/import/modeles`, qui les dérive lui-même de
 * `decrire()`. Une entité qui perdrait demain sa dernière colonne obligatoire
 * serait couverte le jour même ; une liste, elle, aurait attendu que quelqu'un
 * la relise.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { csvEssai, monterImport, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');

const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/** L'export d'annuaire qu'un utilisateur pressé dépose sur le mauvais écran. */
const FICHIER_ANNUAIRE = [
  ['Nom', 'Prénom', 'Service'],
  ['Dupont', 'Marie', 'RH'],
  ['Martin', 'Paul', 'Production'],
  ['Nguyen', 'Linh', 'Qualité'],
];

let base;
let applicatif;
let serveur;
let session;
let modeles;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
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

beforeEach(() => {
  session.poser(perimetreDe('rssi.toulouse', FILIALE_A), TOUS_DROITS);
});

/** En-têtes du modèle publié pour une entité, dans son ordre d'affichage. */
function libellesDe(entite) {
  const modele = modeles.entites.find((candidat) => candidat.entite === entite);
  assert.ok(modele !== undefined, `le modèle de « ${entite} » doit être publié`);
  return modele.colonnes.map((colonne) => colonne.libelle);
}

/**
 * Remplit une ligne **d'après le TYPE publié** de chaque colonne.
 *
 * ⚠️ Ni les libellés ni les noms de champ ne sont recopiés ici. Le registre des
 * entités porte des alias — `revues` expose `date`, `inputs`, `outputs` pour
 * `date_revue`, `donnees_entree`, `donnees_sortie` —, et un essai qui les
 * recopierait passerait en n'important rien le jour où l'un d'eux changerait :
 * il confondrait « ce fichier est bon » et « ce fichier est étranger », c'est-à-
 * dire les deux seules choses que ce fichier existe pour distinguer.
 */
function ligneRemplie(entite, jour) {
  const modele = modeles.entites.find((candidat) => candidat.entite === entite);
  return modele.colonnes.map((colonne) => {
    switch (colonne.type) {
      case 'date':
        return jour;
      case 'horodatage':
        return `${jour}T09:00:00.000Z`;
      case 'entier':
      case 'nombre':
        return '1';
      case 'booleen':
        return 'oui';
      case 'json':
        return '{}';
      default:
        return `Valeur ${colonne.libelle} du ${jour}`;
    }
  });
}

/** Lit en base **sous périmètre** : les tables métier forcent la RLS. */
async function compterRevues() {
  return base.avecPerimetre(
    applicatif,
    perimetre('banc', FILIALE_A, [FILIALE_A]),
    async (client) => Number((await client.query('select count(*)::int as n from revues')).rows[0].n),
  );
}

/* =====================================================================
 *  1. Le geste exact du constat
 * ===================================================================== */

describe('Le mauvais fichier déposé sur « Revues de direction » — constat Q-202', () => {
  test('un export d’annuaire est REFUSÉ, ligne par ligne, et rien n’entre en base', async () => {
    const avant = await compterRevues();

    const reponse = await serveur.importer(
      'revues',
      { nom: 'annuaire-du-personnel.csv', contenu: csvEssai(FICHIER_ANNUAIRE) },
      { appliquer: true },
    );

    // ⚠️ 200 et « 3 enregistrement(s) ont été créés » avant correction.
    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.applique, false);
    assert.equal(reponse.corps.creees, 0);
    assert.equal(reponse.corps.lues, 3);
    // Le refus est celui de CHAQUE ligne : l'utilisateur voit combien il en a
    // déposé, pas une phrase générale sur son fichier.
    assert.equal(reponse.corps.enErreur, 3);
    assert.deepEqual(
      reponse.corps.erreurs.map((e) => e.ligne),
      [2, 3, 4],
    );
    assert.match(reponse.corps.message, /refusées/u);
    // Les colonnes sans destination restent dites — elles l'étaient déjà, et
    // c'est le STATUT et la PHRASE qui mentaient.
    assert.deepEqual([...reponse.corps.colonnesInconnues].sort(), ['Nom', 'Prénom', 'Service']);

    assert.equal(await compterRevues(), avant, 'aucune revue vide ne doit subsister');
  });

  test('l’aperçu dit la même chose que l’application — il ne promet pas un succès', async () => {
    const reponse = await serveur.importer('revues', {
      nom: 'annuaire-du-personnel.csv',
      contenu: csvEssai(FICHIER_ANNUAIRE),
    });
    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, 0);
    assert.equal(reponse.corps.enErreur, 3);
  });
});

/* =====================================================================
 *  2. Le sens inverse — sans lequel le refus ne prouverait rien
 * ===================================================================== */

describe('Le sens inverse — un vrai fichier de revues passe entièrement', () => {
  test('trois revues correctes sont créées, avec leurs valeurs', async () => {
    const avant = await compterRevues();
    // ⚠️ Les en-têtes sont LUES dans le modèle publié, jamais recopiées : un
    // libellé qui changerait ferait sinon passer cet essai en n'important rien,
    // c'est-à-dire en confondant « le fichier est bon » et « il est étranger ».
    const fichier = csvEssai([
      libellesDe('revues'),
      ligneRemplie('revues', '2026-03-14'),
      ligneRemplie('revues', '2026-06-20'),
      ligneRemplie('revues', '2026-09-12'),
    ]);

    const reponse = await serveur.importer(
      'revues',
      { nom: 'revues-2026.csv', contenu: fichier },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.applique, true);
    assert.equal(reponse.corps.creees, 3);
    assert.equal(reponse.corps.enErreur, 0);
    assert.equal(await compterRevues(), avant + 3);

    // ⚠️ La contre-épreuve exacte du constat : les trois lignes portent des
    // VALEURS, là où le défaut en écrivait trois entièrement nulles.
    const [remplies] = await base.avecPerimetre(
      applicatif,
      perimetre('banc', FILIALE_A, [FILIALE_A]),
      async (client) =>
        (
          await client.query(
            `select count(*)::int as n from revues
              where date_revue in ('2026-03-14', '2026-06-20', '2026-09-12')
                and participants is not null
                and donnees_entree is not null
                and donnees_sortie is not null`,
          )
        ).rows,
    );
    assert.equal(remplies.n, 3, 'les quatre colonnes métier doivent être renseignées');
  });

  test('UNE seule colonne renseignée suffit : le refus vise « aucun champ », pas « tous »', async () => {
    // ⚠️ Matière : une garde écrite « toutes les colonnes attendues » refuserait
    // ceci, et refuserait donc la moitié des fichiers légitimes.
    const avant = await compterRevues();
    const reponse = await serveur.importer(
      'revues',
      {
        nom: 'revues-participants-seuls.csv',
        contenu: csvEssai([
          ['Participants', 'Service', 'Bâtiment'],
          ['Direction, RSSI', 'RH', 'A'],
          ['Comité de sécurité', 'Qualité', 'B'],
        ]),
      },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, 2);
    // Les deux colonnes étrangères restent signalées, sans faire échouer.
    assert.deepEqual([...reponse.corps.colonnesInconnues].sort(), ['Bâtiment', 'Service']);
    assert.equal(await compterRevues(), avant + 2);
  });

  test('une ligne vide au milieu reste IGNORÉE, elle n’est pas refusée', async () => {
    const avant = await compterRevues();
    const reponse = await serveur.importer(
      'revues',
      {
        nom: 'revues-avec-respiration.csv',
        contenu: csvEssai([
          ['Date de la revue', 'Participants'],
          ['2027-01-15', 'Direction'],
          ['', ''],
          ['2027-04-15', 'RSSI'],
        ]),
      },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, 2);
    assert.equal(reponse.corps.ignorees, 1);
    assert.equal(reponse.corps.enErreur, 0);
    assert.equal(await compterRevues(), avant + 2);
  });
});

/* =====================================================================
 *  3. La garde est DÉRIVÉE — aucune liste d'entités n'est écrite ici
 * ===================================================================== */

describe('Toute entité sans colonne obligatoire, découverte et non listée', () => {
  test('le banc trouve lui-même les entités concernées — et il y en a', () => {
    const sansObligatoire = modeles.entites
      .filter((modele) => !modele.colonnes.some((colonne) => colonne.obligatoire))
      .map((modele) => modele.entite);
    // ⚠️ Sans cette assertion, la boucle suivante passerait en ne mesurant RIEN
    // le jour où la découverte cesserait de rendre quoi que ce soit.
    assert.ok(sansObligatoire.length > 0, 'la découverte doit rendre au moins une entité');
    assert.ok(sansObligatoire.includes('revues'), 'revues est le cas connu du constat Q-202');
  });

  test('chacune refuse un fichier étranger, sans qu’aucune ne soit nommée ici', async () => {
    const sansObligatoire = modeles.entites.filter(
      (modele) => !modele.colonnes.some((colonne) => colonne.obligatoire),
    );

    for (const modele of sansObligatoire) {
      const reponse = await serveur.importer(
        modele.entite,
        {
          // Un nom de fichier distinct par entité : l'idempotence porte sur le
          // couple (filiale, entité, empreinte), et deux entités partageant le
          // même contenu rendraient « déjà importé » plutôt qu'un refus.
          nom: `annuaire-${modele.entite}.csv`,
          contenu: csvEssai([
            ['Nom', 'Prénom', 'Service'],
            ['Dupont', 'Marie', modele.entite],
          ]),
        },
        { appliquer: true },
      );
      assert.equal(reponse.statut, 409, `${modele.entite} : ${JSON.stringify(reponse.corps)}`);
      assert.equal(reponse.corps.applique, false, `${modele.entite} : rien ne doit être appliqué`);
      assert.equal(reponse.corps.creees, 0, `${modele.entite} : aucune création`);
      assert.ok(reponse.corps.enErreur > 0, `${modele.entite} : le refus doit être compté`);
    }
  });

  test('une entité AVEC obligatoire refuse comme avant : un constat d’en-tête, pas un par ligne', async () => {
    // Non-régression : la garde nouvelle ne doit pas doubler le message que le
    // constat d'en-tête émet déjà — il serait répété sur chacune des lignes.
    const reponse = await serveur.importer(
      'incidents',
      {
        nom: 'annuaire-incidents.csv',
        contenu: csvEssai([
          ['Nom', 'Prénom', 'Service'],
          ['Dupont', 'Marie', 'RH'],
          ['Martin', 'Paul', 'Production'],
        ]),
      },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, 0);
    assert.equal(reponse.corps.enErreur, 1, 'le fait est celui du FICHIER, dit une seule fois');
    assert.match(reponse.corps.erreurs[0].message, /obligatoire/u);
    assert.deepEqual(reponse.corps.colonnesManquantes, ['Titre']);
  });
});
