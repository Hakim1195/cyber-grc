/**
 * socle-risques.test.mjs — **le socle de risques du Groupe, et ce qui le distingue
 * d'un ajout local.**
 *
 * ── L'erreur que cet essai existe pour rendre impossible ─────────────────────
 *
 * Le 04/09/2026, la fonctionnalité a été éprouvée à la main sur la recette : un
 * administrateur crée une entrée de catalogue, un RSSI de site la lit, tout va
 * bien. **C'était faux.** L'entrée avait été écrite sans `portee: 'groupe'`,
 * donc avec `filiale_id = <la filiale de l'administrateur>` : le RSSI la voyait
 * parce qu'elle était **chez lui**, pas parce qu'elle était commune.
 *
 * Les deux situations rendent exactement la même chose — « une entrée visible ».
 * Seule leur **différence** les distingue, et c'est la forme de cet essai :
 *
 *   · une entrée de SOCLE est vue par une filiale QUI N'EST PAS celle de son
 *     auteur ;
 *   · une entrée LOCALE ne l'est pas.
 *
 * Prouver la première sans la seconde, c'est prouver qu'on voit quelque chose —
 * pas qu'on voit ce qu'il faut.
 *
 * ── Ce qui a rendu l'erreur possible, et qui est corrigé ailleurs ────────────
 *
 * `OptionsCreation.portee` portait une réserve périmée : *« le lot L4 ouvrira ce
 * chemin, pas celui-ci »*. L4 était livré depuis la veille, et la route
 * transmettait déjà `portee`. Une réserve fausse ne se contente pas d'être
 * inutile : elle fait renoncer à essayer.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let proprietaire;
/** Administration Groupe : la seule session qui peut écrire au niveau du socle. */
let administration;
/** RSSI de Toulouse — l'auteur des ajouts locaux. */
let siteA;
/** RSSI d'Allemagne — le TÉMOIN : ce qu'il voit dit à quel niveau la ligne vit. */
let siteB;

const montes = [];

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, await base.connexion('app'));

  const monter = async (per) => {
    const serveur = await monterGreffon(base, per);
    montes.push(serveur);
    return serveur;
  };

  administration = await monter({
    utilisateurId: 'admin.grc',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A, FILIALE_B],
    perimetreGroupe: true,
    administrationGroupe: true,
  });
  siteA = await monter({
    utilisateurId: 'rssi.toulouse',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
  siteB = await monter({
    utilisateurId: 'rssi.allemagne',
    filialeId: FILIALE_B,
    filiales: [FILIALE_B],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
});

after(async () => {
  for (const serveur of montes) await serveur?.fermer();
  await base?.fermer();
});

/** Les noms du socle que cette session voit, par le chargement initial. */
async function catalogueVuPar(serveur) {
  const { statut, corps } = await serveur.appeler('GET', '/api/donnees');
  assert.equal(statut, 200);
  return (corps.data ?? corps).risque_catalogue.map((r) => r.nom).sort();
}

/** Portée réelle d'une entrée, LUE EN BASE — la seule source qui tranche. */
async function porteeEnBase(nom) {
  const lignes = await base.avecPerimetre(
    proprietaire,
    perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      const { rows } = await c.query(
        'select filiale_id from risque_catalogue where nom = $1',
        [nom],
      );
      return rows;
    },
  );
  assert.equal(lignes.length, 1, `« ${nom} » : ${lignes.length} ligne(s) au lieu d’une.`);
  return lignes[0].filiale_id === null ? 'groupe' : lignes[0].filiale_id;
}

/* =====================================================================
 *  §1 — Le socle est commun, l'ajout local ne l'est pas
 * ===================================================================== */

describe('§1 — ce qui distingue le socle d’un ajout local', () => {
  test('une entrée de SOCLE est vue par une filiale qui n’est pas celle de son auteur', async () => {
    const creation = await administration.appeler('POST', '/api/entites/risque_catalogue', {
      corps: {
        champs: { nom: 'Compromission de la chaîne de mise à jour', categorie: 'Malveillance', origine: 'referentiel' },
        portee: 'groupe',
      },
    });
    assert.equal(creation.statut, 201, JSON.stringify(creation.corps));

    // ── La lecture qui TRANCHE : la portée vient de la base, pas de la réponse.
    assert.equal(
      await porteeEnBase('Compromission de la chaîne de mise à jour'),
      'groupe',
      'Sans « portee: groupe », la ligne serait écrite dans la filiale ACTIVE de son auteur — ' +
        'et tout le reste de cet essai passerait pour de mauvaises raisons.',
    );

    // L'auteur écrit depuis la filiale A ; c'est B qui fait la démonstration.
    //
    // ⚠️ On regarde la PRÉSENCE, pas le contenu entier : le semis partagé pose
    // déjà un socle et un ajout local par filiale, et une égalité stricte
    // mesurerait le décor plutôt que la propriété.
    assert.ok(
      (await catalogueVuPar(siteB)).includes('Compromission de la chaîne de mise à jour'),
      'L’Allemagne doit voir une entrée écrite depuis Toulouse au niveau du Groupe.',
    );
    assert.ok((await catalogueVuPar(siteA)).includes('Compromission de la chaîne de mise à jour'));
  });

  test('un ajout LOCAL n’est vu que par sa filiale — c’est ce qui donne son sens au socle', async () => {
    const creation = await siteA.appeler('POST', '/api/entites/risque_catalogue', {
      corps: { champs: { nom: 'Grève portuaire de Toulouse', categorie: 'Environnement' } },
    });
    assert.equal(creation.statut, 201, JSON.stringify(creation.corps));
    assert.equal(await porteeEnBase('Grève portuaire de Toulouse'), FILIALE_A);

    // ── LE DIFFÉRENTIEL, et c'est la seule chose que cet essai prouve vraiment.
    const vuDeA = await catalogueVuPar(siteA);
    const vuDeB = await catalogueVuPar(siteB);

    assert.ok(
      vuDeA.includes('Grève portuaire de Toulouse') && vuDeA.includes('Compromission de la chaîne de mise à jour'),
      `Toulouse doit voir le socle ET son ajout. Vu : ${vuDeA.join(', ')}`,
    );
    assert.equal(
      vuDeB.includes('Grève portuaire de Toulouse'),
      false,
      'L’Allemagne voit le socle et RIEN de l’ajout toulousain. Si elle le voyait, la ' +
        '« portée locale » ne voudrait rien dire — et l’essai précédent serait vert pour la ' +
        'mauvaise raison.',
    );
    assert.ok(
      vuDeB.includes('Compromission de la chaîne de mise à jour'),
      'Contrôle de matière : l’Allemagne doit tout de même voir le socle, sinon « elle ne voit ' +
        'pas l’ajout » serait vrai d’une session qui ne voit rien.',
    );
  });

  test('LA PORTÉE EST LISIBLE PAR L’ÉCRAN, sans que la filiale soit nommée', async () => {
    // ── Le constat qui a fait ajouter ce champ ──────────────────────────
    //
    // `filiale_id` est retiré de tout ce que l'API expose — le périmètre vient
    // du serveur, et une charge utile qui nommerait des filiales inviterait un
    // client à en choisir une. Conséquence mesurée le 04/09/2026 : **aucun écran
    // ne pouvait distinguer une entrée du socle d'un ajout local**. Les deux se
    // lisent, les deux s'affichent, et seule leur portée les sépare.
    //
    // `_porteeGroupe` dit S'IL Y A une filiale, jamais LAQUELLE : il n'ouvre
    // donc aucun oracle.
    const { corps } = await siteA.appeler('GET', '/api/donnees');
    const catalogue = (corps.data ?? corps).risque_catalogue;

    const socle = catalogue.filter((r) => r._porteeGroupe === true);
    const locales = catalogue.filter((r) => r._porteeGroupe === false);

    // ── Matière, dans les deux sens : sans les deux familles, « le champ
    //    distingue » serait vrai d'un champ constant.
    assert.ok(socle.length > 0, 'aucune entrée de socle : le champ ne distingue rien.');
    assert.ok(locales.length > 0, 'aucun ajout local : le champ ne distingue rien.');
    assert.equal(socle.length + locales.length, catalogue.length, 'une ligne sans portée');

    // Et il ne nomme AUCUNE filiale.
    for (const ligne of catalogue) {
      assert.equal(ligne.filiale_id, undefined, 'la charge utile ne doit nommer aucune filiale');
    }

    // Le champ dit la vérité : on la confronte à la base.
    for (const ligne of socle) {
      assert.equal(await porteeEnBase(ligne.nom), 'groupe', `« ${ligne.nom} » annoncé au socle`);
    }
  });
});

/* =====================================================================
 *  §2 — Écrire au niveau du socle est réservé, et le refus n'écrit rien
 * ===================================================================== */

describe('§2 — le socle se lit par tous, il ne s’écrit pas par tous', () => {
  test('un RSSI de site qui demande la portée Groupe est refusé, et RIEN n’est écrit', async () => {
    const avant = (await catalogueVuPar(siteA)).length;
    assert.ok(avant > 0, 'matière : le catalogue doit déjà porter quelque chose.');

    const { statut, corps } = await siteA.appeler('POST', '/api/entites/risque_catalogue', {
      corps: { champs: { nom: 'Tentative de socle' }, portee: 'groupe' },
    });

    assert.equal(statut, 403, JSON.stringify(corps));
    assert.equal(corps.erreur, 'hors_perimetre');
    assert.doesNotMatch(
      String(corps.message ?? ''),
      /lot L4|pas encore/iu,
      'Le message ne doit plus renvoyer à un lot livré : une réserve périmée fait renoncer à ' +
        'essayer, et c’est exactement ce qui a coûté une fausse démonstration le 04/09.',
    );

    assert.equal(
      (await catalogueVuPar(siteA)).length,
      avant,
      'Un refus qui laisserait une ligne derrière lui serait pire que pas de refus.',
    );
    assert.equal((await catalogueVuPar(siteB)).includes('Tentative de socle'), false);
  });

  test('l’administration Groupe, elle, écrit au socle — contrôle symétrique', async () => {
    // Sans lui, « le site est refusé » serait aussi vrai d'une route cassée pour
    // tout le monde.
    const { statut } = await administration.appeler('POST', '/api/entites/risque_catalogue', {
      corps: { champs: { nom: 'Défaillance d’un fournisseur unique' }, portee: 'groupe' },
    });
    assert.equal(statut, 201);
    assert.equal(await porteeEnBase('Défaillance d’un fournisseur unique'), 'groupe');
    assert.ok((await catalogueVuPar(siteB)).includes('Défaillance d’un fournisseur unique'));
  });
});

/* =====================================================================
 *  §3 — Le lien depuis un risque de filiale
 * ===================================================================== */

describe('§3 — une filiale instancie le socle sans le modifier', () => {
  test('un risque de filiale se relie à une entrée du socle, et le lien est FACULTATIF', async () => {
    const catalogue = await base.avecPerimetre(
      proprietaire,
      perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) => {
        const { rows } = await c.query(
          "select id from risque_catalogue where nom = 'Compromission de la chaîne de mise à jour'",
        );
        return rows[0].id;
      },
    );

    const relie = await siteB.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Rançongiciel sur l’ERP de Hambourg', catalogue_id: catalogue } },
    });
    assert.equal(relie.statut, 201, JSON.stringify(relie.corps));
    assert.equal(relie.corps.enregistrement.catalogue_id, catalogue);

    // ── FACULTATIF : la saisie libre est conservée, et c'est une exigence du
    //    brief, pas une commodité.
    const libre = await siteB.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Risque propre à Hambourg, hors catalogue' } },
    });
    assert.equal(libre.statut, 201, JSON.stringify(libre.corps));
    assert.ok(
      libre.corps.enregistrement.catalogue_id === null ||
        libre.corps.enregistrement.catalogue_id === '',
      'Un risque sans entrée de catalogue doit rester un risque valide.',
    );
  });
});
