/**
 * orphelines.test.mjs — **une pièce jointe suit l'enregistrement qu'elle documente.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-230**, cinquième passage de la porte S8
 * ════════════════════════════════════════════════════════════════════════
 *
 * Mesuré à travers Apache, sur la recette : un risque supprimé laissait sa pièce
 * jointe **en base**, **sur le disque**, **dans le quota de la filiale**, et
 * `GET /api/pieces/risques/<supprimé>/<pj>` rendait **200 avec le contenu du
 * document**.
 *
 * La cause est structurelle et vaut d'être retenue : `pieces_jointes` porte un
 * lien **polymorphe** (`entite_type`, `entite_id`) et **aucune clé étrangère**
 * vers l'entité — relevé dans `pg_constraint`, la seule de la table vise
 * `filiales`. Le schéma ne PEUT donc pas cascader, et personne n'avait pris le
 * relais : `src/entites/` ne mentionnait jamais la table.
 *
 * ⚠️ **« Supprimer » qui ne supprime pas est une promesse rompue**, et elle
 * l'est deux fois ici : dans un outil qui sert de preuve en audit ISO 27001, et
 * dans un produit qui porte un registre RGPD — le droit à l'effacement de
 * l'article 17 ne s'arrête pas à la ligne métier.
 *
 * ── Pourquoi aucun essai ne le voyait ────────────────────────────────────
 *
 * Le banc éprouvait abondamment le dépôt, l'analyse, la délivrance et la
 * suppression **d'une pièce**. Aucun ne supprimait **son porteur**. C'est la
 * jointure entre deux familles d'essais — celle des pièces et celle des entités
 * — et personne n'habite la jointure. Quatrième occurrence sur ce chantier du
 * motif « le défaut vit ENTRE deux fichiers dont aucun n'a tort seul ».
 */

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { monterPieces, pdfValide, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

let base;
let serveur;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  const session = new SessionDEssai(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), TOUS_DROITS);
  serveur = await monterPieces(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Compte les lignes de `pieces_jointes` sous périmètre. */
async function comptePieces() {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) =>
      Number((await c.query('select count(*)::text as n from pieces_jointes')).rows[0].n),
  );
}

/** Le chemin de stockage d'une pièce — il ne sort jamais par l'API. */
async function cheminDe(pieceId) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) =>
      (await c.query('select chemin_stockage from pieces_jointes where id = $1', [pieceId]))
        .rows[0]?.chemin_stockage ?? null,
  );
}

const existe = async (chemin) =>
  await access(chemin).then(
    () => true,
    () => false,
  );

describe('Q-230 — supprimer un enregistrement retire ses pièces', () => {
  let risque;
  let piece;
  let cheminDisque;

  test('LA MATIÈRE : un risque, une pièce déposée dessus, un fichier sur le disque', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Risque qui portera une pièce' } },
    });
    assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
    risque = cree.corps.enregistrement.id;

    const avant = await comptePieces();
    const depot = await serveur.deposer(`/api/pieces/risques/${risque}`, {
      nom: 'preuve.pdf',
      type: 'application/pdf',
      contenu: pdfValide('preuve attachée au risque supprimé'),
    });
    assert.equal(depot.statut, 201, JSON.stringify(depot.corps));
    piece = depot.corps.id;
    assert.equal(await comptePieces(), avant + 1, 'la pièce doit exister avant qu’on la perde');

    const relatif = await cheminDe(piece);
    assert.ok(relatif, 'la ligne doit porter un chemin de stockage');
    cheminDisque = join(serveur.magasin, 'pieces', relatif);
    assert.equal(await existe(cheminDisque), true, 'le fichier doit être sur le disque');

    // Et il se délivre : sans quoi la suite ne prouverait rien.
    const lecture = await serveur.appeler('GET', `/api/pieces/risques/${risque}/${piece}`);
    assert.equal(lecture.statut, 200, 'la pièce doit être délivrable AVANT la suppression');
  });

  test('SUPPRIMER LE RISQUE retire la ligne, le fichier, et la délivrance', async () => {
    const avant = await comptePieces();
    const suppression = await serveur.appeler(
      'DELETE',
      `/api/entites/risques/${risque}?version=1`,
    );
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    assert.equal(
      await comptePieces(),
      avant - 1,
      'La ligne survit à son porteur : elle consomme le quota de la filiale POUR TOUJOURS, ' +
        'et personne ne peut la libérer depuis l’interface.',
    );
    assert.equal(
      await existe(cheminDisque),
      false,
      'Le fichier reste sur le disque, sans réclamant.',
    );

    const apres = await serveur.appeler('GET', `/api/pieces/risques/${risque}/${piece}`);
    assert.notEqual(
      apres.statut,
      200,
      'Le document d’un enregistrement SUPPRIMÉ reste téléchargeable. Dans un produit qui ' +
        'porte un registre RGPD, « supprimer » qui ne supprime pas est une promesse rompue.',
    );
  });

  test('SUPPRIMER UN PORTEUR NE TOUCHE PAS LA PIÈCE D’UN AUTRE', async () => {
    /* ⚠️ La moitié qui empêche le correctif d'être pire que le défaut : un
       « delete » trop large — par filiale, par type d'entité — emporterait les
       pièces des voisins, et ce serait une perte de données là où l'on voulait
       en fermer une.

       ⚠️ **Et une hypothèse que j'avais écrite à tort** : je croyais le magasin
       adressé par le CONTENU, donc deux dépôts identiques partageant un fichier.
       Mesuré ici : `engendrerCheminStockage` tire 256 bits au hasard par pièce,
       et deux dépôts du même document rendent DEUX chemins. L'essai vérifie donc
       ce qui est vrai — la pièce du voisin survit — et non ce que je supposais. */
    const contenu = pdfValide('un même document, attaché deux fois');
    const a = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Premier porteur' } },
    });
    const b = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Second porteur' } },
    });
    const idA = a.corps.enregistrement.id;
    const idB = b.corps.enregistrement.id;

    const pjA = await serveur.deposer(`/api/pieces/risques/${idA}`, {
      nom: 'partage.pdf',
      type: 'application/pdf',
      contenu,
    });
    const pjB = await serveur.deposer(`/api/pieces/risques/${idB}`, {
      nom: 'partage.pdf',
      type: 'application/pdf',
      contenu,
    });
    assert.equal(pjA.statut, 201, JSON.stringify(pjA.corps));
    assert.equal(pjB.statut, 201, JSON.stringify(pjB.corps));

    const cheminA = await cheminDe(pjA.corps.id);
    const cheminB = await cheminDe(pjB.corps.id);
    // LA MATIÈRE : deux pièces distinctes, deux fichiers distincts.
    assert.notEqual(cheminA, cheminB, 'chaque pièce a son propre objet sur le disque');
    assert.ok(cheminA && cheminB, 'les deux lignes doivent porter un chemin');

    const suppression = await serveur.appeler('DELETE', `/api/entites/risques/${idA}?version=1`);
    assert.equal(suppression.statut, 200, JSON.stringify(suppression.corps));

    assert.equal(
      await existe(join(serveur.magasin, 'pieces', cheminB)),
      true,
      'Le fichier a été retiré alors qu’un AUTRE enregistrement le réclame encore : ' +
        'supprimer un risque vient d’effacer la pièce jointe d’un second.',
    );
    const lecture = await serveur.appeler('GET', `/api/pieces/risques/${idB}/${pjB.corps.id}`);
    assert.equal(lecture.statut, 200, 'et la pièce du second porteur doit rester délivrable');
  });
});
