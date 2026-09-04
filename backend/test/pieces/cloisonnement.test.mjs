/**
 * cloisonnement.test.mjs — **une pièce d’une autre filiale n’est ni listée, ni
 * délivrable, ni supprimable.**
 *
 * ── Ce que cette famille mesure, et ce qu'elle ne mesure PAS ─────────────────
 *
 * Le cloisonnement n'est **pas** dans `src/pieces/` : il est dans les quatre
 * politiques de `pieces_jointes` (`004_rls.sql` §3), sous le code. Aucune
 * requête de `depot.ts` ne porte de clause `filiale_id` pour filtrer, et c'est
 * délibéré — en écrire une donnerait à croire que le filtrage en dépend.
 *
 * Cette famille éprouve donc **que le lot L6 n'a pas contourné la barrière** :
 * qu'aucune des quatre routes n'ouvre un chemin de lecture, de délivrance ou de
 * suppression au-delà du périmètre, et qu'aucune ne distingue « n'existe pas »
 * de « ne vous appartient pas » — la distinction ferait de la route un oracle
 * d'existence inter-filiales.
 *
 * ⚠️ **La preuve est symétrique.** A ne voit pas B, ET B ne voit pas A. Une
 * mesure dans un seul sens laisserait passer un filtrage qui ne tiendrait que
 * grâce à l'ordre de création des lignes.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { monterPieces, pdfValide, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');

const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/** Chaque filiale a son propre risque, semé par le harnais. */
const CIBLE = { A: '/api/pieces/risques/RISK-A', B: '/api/pieces/risques/RISK-B' };

let base;
let serveur;
let session;
let applicatif;
/** Pièce déposée par chaque filiale, dans SA filiale. */
const pieces = {};

/** Bascule la session sur une filiale. Jamais depuis une requête (contrôle S2). */
const regarderDepuis = (filiale) =>
  session.poser(perimetreDe(`rssi.${filiale}`, filiale, [filiale]), TOUS_DROITS);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(perimetreDe('rssi.a', FILIALE_A), TOUS_DROITS);
  serveur = await monterPieces(base, session);

  for (const [suffixe, filiale] of [['A', FILIALE_A], ['B', FILIALE_B]]) {
    regarderDepuis(filiale);
    const reponse = await serveur.deposer(CIBLE[suffixe], {
      nom: `confidentiel-${suffixe}.pdf`,
      type: 'application/pdf',
      contenu: pdfValide(`secret de la filiale ${suffixe}`),
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    pieces[suffixe] = reponse.corps;
  }
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

describe('La matière : les deux filiales ont réellement une pièce chacune', () => {
  test('deux pièces, deux filiales, deux empreintes distinctes', async () => {
    assert.notEqual(pieces.A, undefined);
    assert.notEqual(pieces.B, undefined);
    assert.notEqual(pieces.A.id, pieces.B.id);
    assert.notEqual(pieces.A.sha256, pieces.B.sha256);

    // Vu du propriétaire du périmètre Groupe, les deux lignes existent : sans
    // cela, « B ne voit pas A » serait vrai d'une base vide.
    const toutes = await base.avecPerimetre(
      applicatif,
      perimetre('controleur', FILIALE_A, [FILIALE_A, FILIALE_B]),
      (client) =>
        base.lignes(client, 'select id, filiale_id from pieces_jointes where id = any($1)', [
          [pieces.A.id, pieces.B.id],
        ]),
    );
    assert.equal(toutes.length, 2, JSON.stringify(toutes));
    assert.deepEqual(
      Object.fromEntries(toutes.map((l) => [l.id, l.filiale_id])),
      { [pieces.A.id]: FILIALE_A, [pieces.B.id]: FILIALE_B },
    );
  });
});

describe('Depuis A, rien de B ne remonte — et réciproquement', () => {
  for (const [ici, ailleurs] of [
    ['A', 'B'],
    ['B', 'A'],
  ]) {
    const filialeIci = ici === 'A' ? FILIALE_A : FILIALE_B;

    test(`depuis ${ici} : la liste de l’entité de ${ailleurs} est VIDE`, async () => {
      regarderDepuis(filialeIci);
      const liste = await serveur.appeler('GET', CIBLE[ailleurs]);
      // 200 et zéro ligne, pas 403 : la route existe, c'est le contenu qui est
      // cloisonné. Un 403 dirait « il y a quelque chose ici ».
      assert.equal(liste.statut, 200, JSON.stringify(liste.corps));
      assert.deepEqual(liste.corps.pieces, [], JSON.stringify(liste.corps));
    });

    test(`depuis ${ici} : la pièce de ${ailleurs} n’est PAS délivrable`, async () => {
      regarderDepuis(filialeIci);
      const reponse = await serveur.appeler('GET', `${CIBLE[ailleurs]}/${pieces[ailleurs].id}`);
      assert.equal(reponse.statut, 404, JSON.stringify(reponse.corps));
      // Aucun octet du fichier voisin.
      assert.equal(reponse.brut.includes('secret de la filiale'), false);
    });

    test(`depuis ${ici} : la pièce de ${ailleurs} n’est pas délivrable non plus par SON URL`, async () => {
      // Même identifiant, mais présenté sous l'entité de la filiale d'ici : ni
      // l'un ni l'autre ne doit ouvrir un chemin.
      regarderDepuis(filialeIci);
      const reponse = await serveur.appeler('GET', `${CIBLE[ici]}/${pieces[ailleurs].id}`);
      assert.equal(reponse.statut, 404, JSON.stringify(reponse.corps));
    });

    test(`depuis ${ici} : supprimer la pièce de ${ailleurs} est un 404, et elle SURVIT`, async () => {
      regarderDepuis(filialeIci);
      const reponse = await serveur.appeler('DELETE', `${CIBLE[ailleurs]}/${pieces[ailleurs].id}`);
      assert.equal(reponse.statut, 404, JSON.stringify(reponse.corps));

      // La contre-épreuve : chez elle, la pièce est toujours là.
      regarderDepuis(ailleurs === 'A' ? FILIALE_A : FILIALE_B);
      const chezElle = await serveur.appeler('GET', `${CIBLE[ailleurs]}/${pieces[ailleurs].id}`);
      assert.equal(chezElle.statut, 200, 'la suppression d’ailleurs a porté');
    });

    test(`depuis ${ici} : le 404 ne distingue pas « ailleurs » d’« inexistante »`, async () => {
      regarderDepuis(filialeIci);
      const voisine = await serveur.appeler('GET', `${CIBLE[ailleurs]}/${pieces[ailleurs].id}`);
      const inventee = await serveur.appeler('GET', `${CIBLE[ailleurs]}/PJ-0000000000000-inexistante`);
      assert.equal(voisine.statut, inventee.statut);
      // Les corps ne diffèrent que par la référence d'incident et l'identifiant
      // demandé : ni le message ni le code ne trahissent l'existence.
      assert.equal(voisine.corps.message, inventee.corps.message);
      assert.equal(voisine.corps.erreur, inventee.corps.erreur);
    });
  }

  test('chez elle, chaque pièce est délivrable et intacte', async () => {
    for (const suffixe of ['A', 'B']) {
      regarderDepuis(suffixe === 'A' ? FILIALE_A : FILIALE_B);
      const reponse = await serveur.appeler('GET', `${CIBLE[suffixe]}/${pieces[suffixe].id}`);
      assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
      assert.equal(
        reponse.brut.toString('latin1').includes(`secret de la filiale ${suffixe}`),
        true,
      );
    }
  });
});

describe('Le dépôt écrit dans la filiale ACTIVE, jamais ailleurs', () => {
  test('une pièce déposée depuis B porte `filiale_id` = B', async () => {
    regarderDepuis(FILIALE_B);
    const reponse = await serveur.deposer(CIBLE.B, {
      nom: 'nouvelle.pdf',
      type: 'application/pdf',
      contenu: pdfValide('nouvelle depuis B'),
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.filiale_id, FILIALE_B);
  });

  test('sans filiale active, le dépôt est refusé — on n’écrit que là où l’on est', async () => {
    // Périmètre de lecture Groupe, aucune filiale d'écriture : c'est la
    // situation d'une direction qui consolide et ne saisit pas.
    session.poser(
      {
        utilisateurId: 'direction',
        filialeId: null,
        filiales: [FILIALE_A, FILIALE_B],
        perimetreGroupe: true,
        administrationGroupe: false,
      },
      TOUS_DROITS,
    );
    const reponse = await serveur.deposer(CIBLE.A, {
      nom: 'sans-filiale.pdf',
      type: 'application/pdf',
      contenu: pdfValide('sans filiale'),
    });
    assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps));
    assert.match(reponse.corps.message, /filiale/iu);
  });

  test('un périmètre Groupe LIT les deux filiales — la barrière n’est pas un aveuglement', async () => {
    session.poser(
      {
        utilisateurId: 'direction',
        filialeId: FILIALE_A,
        filiales: [FILIALE_A, FILIALE_B],
        perimetreGroupe: true,
        administrationGroupe: false,
      },
      TOUS_DROITS,
    );
    const listeA = await serveur.appeler('GET', CIBLE.A);
    const listeB = await serveur.appeler('GET', CIBLE.B);
    assert.ok(listeA.corps.pieces.length >= 1, JSON.stringify(listeA.corps));
    assert.ok(listeB.corps.pieces.length >= 1, JSON.stringify(listeB.corps));
    // C'est la contre-épreuve des essais précédents : leurs listes vides
    // venaient du périmètre, et non d'un filtrage qui masquerait tout.
  });
});
