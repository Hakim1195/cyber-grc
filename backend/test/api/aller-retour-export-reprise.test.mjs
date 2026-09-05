/**
 * aller-retour-export-reprise.test.mjs — **le produit sait-il relire sa propre
 * sauvegarde ?**
 *
 * ── Pourquoi ce fichier existe, et pourquoi il aurait dû exister avant ───────
 *
 * Constat de la porte **S6**, classe *perte de données* : `GET /api/export` puis
 * `POST /api/reprise` en mode « remplacer » rendait **409, zéro ligne
 * restaurée** — sur une base vierge portant **un seul risque saisi à la main**.
 *
 * La cause était minuscule et le silence total. La migration `012` a ajouté sur
 * `risques` une clé étrangère nullable, `catalogue_id`. `versLeFrontend` rend un
 * texte nul sous la forme d'une **chaîne vide** ; à la reprise, `""` n'est pas
 * une référence valide et l'insertion heurte `fk_risques_catalogue`. La colonne
 * n'avait pas été déclarée dans les descriptions de `src/reprise/`, qui sont ce
 * qui normalise une référence vide en `null`.
 *
 * ⚠️ **Ce qui a rendu ce défaut invisible n'est pas sa subtilité, c'est une
 * lacune de forme** : le dépôt portait des essais d'export, des essais de
 * reprise, et un aller-retour *dans le module de reprise* — mais **aucun ne
 * faisait passer la sortie d'une ROUTE dans l'entrée de l'autre**. Chaque moitié
 * était juste ; la jointure ne l'était pas. C'est le quatrième défaut de ce
 * chantier qui vit **entre** deux fichiers dont aucun n'a tort seul.
 *
 * ── Ce que cet essai garantit, et pourquoi c'est la garantie la plus chère ───
 *
 * Une sauvegarde qu'on ne sait pas relire n'est pas une sauvegarde. Et ici elle
 * porte plus que le confort d'un utilisateur : l'export d'une filiale est **la
 * seule chose qui subsiste d'elle** après `POST /api/cycle/sortie-filiale`, qui
 * est irréversible. Un aller-retour cassé transformerait une sortie de filiale
 * en destruction de données.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
let serveur;

const PERIMETRE = Object.freeze({
  utilisateurId: 'admin.grc',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: true,
});

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  serveur = await monterGreffon(base, PERIMETRE);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Compte les lignes d'une table sous le compte propriétaire. */
async function compter(table) {
  const proprietaire = await base.connexion('proprietaire');
  return await base.avecPerimetre(
    proprietaire,
    perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => Number((await c.query(`select count(*)::text as n from "${table}"`)).rows[0].n),
  );
}

describe('Le produit sait relire sa propre sauvegarde — par les ROUTES', () => {
  test('GET /api/export puis POST /api/reprise « remplacer » aboutit, et restitue', async () => {
    // ── 1. La matière. Sans elle, « la reprise a réussi » serait vrai d'un
    //    fichier vide, et c'est très exactement le genre d'essai vert qui a
    //    laissé passer ce défaut ailleurs.
    const avant = {
      risques: await compter('risques'),
      actifs: await compter('actifs'),
      incidents: await compter('incidents'),
    };
    assert.ok(
      avant.risques >= 2 && avant.actifs >= 2 && avant.incidents >= 1,
      `Matière insuffisante : ${JSON.stringify(avant)}. Un aller-retour sur une base creuse ` +
        'ne prouve rien.',
    );

    // ⚠️ LE CAS EXACT DU DÉFAUT : un risque SANS entrée de catalogue. C'est la
    //    saisie libre, celle que le brief conserve — et celle dont la clé
    //    étrangère nulle repartait en chaîne vide.
    const cree = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Risque saisi librement, hors catalogue' } },
    });
    assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
    assert.ok(
      cree.corps.enregistrement.catalogue_id === null ||
        cree.corps.enregistrement.catalogue_id === '',
      'ce risque doit précisément NE PAS porter de référence de catalogue',
    );

    // ── 2. L'export, par sa route.
    const exporte = await serveur.appeler('GET', '/api/export');
    assert.equal(exporte.statut, 200, JSON.stringify(exporte.corps));
    const enveloppe = exporte.corps;
    assert.equal(enveloppe.format, 'grc-backup');
    assert.ok(
      Array.isArray(enveloppe.payload.risques) && enveloppe.payload.risques.length >= 3,
      "l'export doit porter les risques semés ET celui qu'on vient de créer",
    );

    // ── 3. La reprise, par sa route, avec CE QUE L'EXPORT A RENDU — pas une
    //    charge fabriquée pour l'occasion. C'est toute la différence.
    const reprise = await serveur.appeler('POST', '/api/reprise', {
      corps: { mode: 'remplacer', fichier: { nom: 'export.json', contenu: JSON.stringify(enveloppe) } },
    });
    assert.equal(
      reprise.statut,
      200,
      'La reprise de son propre export doit aboutir. Un 409 ici signifie que le produit ' +
        `produit une sauvegarde qu'il refuse de relire : ${JSON.stringify(reprise.corps)}`,
    );

    // ── 4. Et elle a RESTITUÉ, pas seulement accepté.
    const apres = {
      risques: await compter('risques'),
      actifs: await compter('actifs'),
      incidents: await compter('incidents'),
    };
    assert.deepEqual(
      apres,
      { risques: avant.risques + 1, actifs: avant.actifs, incidents: avant.incidents },
      'Le mode « remplacer » doit reconstituer exactement ce que l’export portait.',
    );
  });

  test('LE RISQUE SANS CATALOGUE survit à l’aller-retour, sa référence toujours nulle', async () => {
    // La moitié qui nomme le défaut. Un `count` égal passerait aussi si la
    // colonne revenait avec une valeur inventée.
    const proprietaire = await base.connexion('proprietaire');
    const lignes = await base.avecPerimetre(
      proprietaire,
      perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) =>
        (
          await c.query(
            "select catalogue_id from risques where nom = 'Risque saisi librement, hors catalogue'",
          )
        ).rows,
    );
    assert.equal(lignes.length, 1, 'le risque doit avoir survécu à la reprise');
    assert.equal(
      lignes[0].catalogue_id,
      null,
      'Sa référence de catalogue doit être NULLE, pas une chaîne vide : c’est « saisie libre », ' +
        'et une chaîne vide n’est pas une référence.',
    );
  });

  test('LA RESTAURATION D’UNE SAUVEGARDE SAINE N’AVERTIT DE RIEN', async () => {
    /* ── Mesuré sur la RECETTE, à travers Apache, le 05/09/2026 ────────────
     *
     * `POST /api/reprise` sur un export du produit rendait
     * `champsIgnores: ["personnes._porteeGroupe"]`, dont `src/api/index.ts`
     * fait la phrase « 1 champ(s) sans destination » dans le rapport remis à
     * l'utilisateur. Restaurer une sauvegarde parfaitement saine affichait
     * donc un avertissement.
     *
     * `_porteeGroupe` est un champ que LE SERVEUR AJOUTE (constat Q-176) : il
     * n'est la colonne de rien, la reprise a raison de ne pas l'écrire, et
     * tort de le nommer. Même famille que Q-201 et Q-134 — un message qui
     * annonce un problème qui n'existe pas apprend à ne plus lire les
     * messages, y compris le jour où ils disent vrai.
     *
     * ⚠️ Le filtre porte sur le PRÉFIXE, jamais sur les trois noms connus.
     */
    const exporte = await serveur.appeler('GET', '/api/export');
    assert.equal(exporte.statut, 200);

    // LA MATIÈRE : l'export doit RÉELLEMENT porter un champ structurel, sinon
    // l'assertion suivante serait verte sur un export qui n'en a jamais eu.
    const personnes = exporte.corps.payload.personnes ?? [];
    assert.ok(
      personnes.some((p) => Object.keys(p).some((c) => c.startsWith('_'))),
      'Aucun champ a souligne initial dans l export : cet essai ne mesure rien. ' +
        `(cles vues : ${JSON.stringify(Object.keys(personnes[0] ?? {}))})`,
    );

    const reprise = await serveur.appeler('POST', '/api/reprise', {
      corps: {
        mode: 'fusionner',
        fichier: { nom: 'export.json', contenu: JSON.stringify(exporte.corps) },
      },
    });
    assert.equal(reprise.statut, 200, JSON.stringify(reprise.corps));
    assert.deepEqual(
      reprise.corps.bilan.champsIgnores,
      [],
      'Une sauvegarde produite par le produit lui-meme ne doit rien lui faire signaler. ' +
        'Les champs a souligne initial sont structurels : les taire est juste, les nommer ' +
        'fabrique une inquietude sans objet.',
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : un risque RELIÉ au socle survit avec son lien', async () => {
    // Sans lui, « la référence est nulle » serait aussi vrai d'un aller-retour
    // qui jetterait la colonne entière.
    const catalogue = await serveur.appeler('POST', '/api/entites/risque_catalogue', {
      corps: { champs: { nom: 'Menace de référence pour l’aller-retour' } },
    });
    assert.equal(catalogue.statut, 201, JSON.stringify(catalogue.corps));
    const identifiant = catalogue.corps.enregistrement.id;

    const relie = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Risque relié au socle', catalogue_id: identifiant } },
    });
    assert.equal(relie.statut, 201, JSON.stringify(relie.corps));

    const exporte = await serveur.appeler('GET', '/api/export');
    assert.equal(exporte.statut, 200);
    const reprise = await serveur.appeler('POST', '/api/reprise', {
      corps: {
        mode: 'remplacer',
        fichier: { nom: 'export.json', contenu: JSON.stringify(exporte.corps) },
      },
    });
    assert.equal(reprise.statut, 200, JSON.stringify(reprise.corps));

    const proprietaire = await base.connexion('proprietaire');
    const lignes = await base.avecPerimetre(
      proprietaire,
      perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) =>
        (await c.query("select catalogue_id from risques where nom = 'Risque relié au socle'")).rows,
    );
    assert.equal(lignes.length, 1);
    assert.equal(
      lignes[0].catalogue_id,
      identifiant,
      'Le lien vers le socle doit survivre à l’aller-retour, à l’identifiant près.',
    );
  });
});
