/**
 * champs-servis.test.mjs — **ce que la route sert, l'écran doit pouvoir le lire.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Un défaut trouvé en écrivant la vérification d'intégrité, le 08/09/2026
 * ════════════════════════════════════════════════════════════════════════
 *
 * `PiecesModule.normaliserListe()` **filtre** : elle reconstruit chaque pièce
 * champ par champ, et **tout champ absent de sa liste est jeté**. C'est
 * délibéré — le panneau ne veut ni `filiale_id`, ni `signature_virale` — mais
 * cela crée une classe de défaut parfaitement silencieuse :
 *
 *   le serveur sert un champ neuf → l'écran est écrit pour l'afficher → la
 *   normalisation le jette → **la colonne reste vide, sans une erreur.**
 *
 * C'est arrivé pour de bon : `en_vigueur` et `version_piece` (action D1) ont été
 * ajoutés à la route, affichés par `ligneHtml()`, et **oubliés** dans
 * `normaliserListe()`. Le badge « En vigueur » et la colonne Version seraient
 * restés vides sur la recette. Ni le banc navigateur — qui façonne ses réponses —
 * ni les essais de module — qui vérifient qu'un écran se rend sans erreur — ne
 * pouvaient le voir : **le défaut vit entre la route et le panneau**, et personne
 * n'habite la jointure.
 *
 * ── Ce que ce fichier confronte, et pourquoi c'est une DÉCOUVERTE ────────
 *
 * Aucune liste de champs n'est écrite ici. On prend :
 *
 *  1. **la charge réelle** d'une pièce, servie par la vraie route ;
 *  2. **les champs que le panneau LIT**, extraits de son propre texte source :
 *     toute occurrence de `piece.<nom>` dans `js/modules/pieces.js` ;
 *
 * et l'on exige que l'intersection des deux passe entière par
 * `normaliserListe()`. Un champ neuf servi ET affiché est donc réclamé
 * bruyamment ; un champ servi et jamais lu ne l'est pas, ce qui est correct — le
 * panneau n'a pas à porter `filiale_id`.
 *
 * ⚠️ **Ce que ce contrôle ne fait pas** (§17.5) : il ne lit pas le HTML rendu. Un
 * champ correctement porté puis oublié dans le gabarit lui échapperait. Ce
 * qu'il ferme est la jointure, qui est là où le défaut a eu lieu.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, RACINE_FRONTEND } from '../aide/serveur.mjs';
import { monterPieces, pdfValide, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

const SOURCE_PANNEAU = join(RACINE_FRONTEND, 'js', 'modules', 'pieces.js');

let base;
let serveur;
let applicatif;
/** Le module du navigateur, évalué tel quel — aucune copie, aucun extrait. */
let panneau;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  const session = new SessionDEssai(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), TOUS_DROITS);
  serveur = await monterPieces(base, session);

  // `pieces.js` est une IIFE qui pose `window.PiecesModule`. On lui donne un
  // `window` nu : rien de ce qu'on éprouve ici ne touche au DOM.
  const fenetre = {};
  new Function('window', readFileSync(SOURCE_PANNEAU, 'utf8'))(fenetre);
  panneau = fenetre.PiecesModule;
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Les champs que le panneau lit sur une pièce — extraits de son propre texte. */
function champsLusParLePanneau() {
  const source = readFileSync(SOURCE_PANNEAU, 'utf8');
  return new Set([...source.matchAll(/\bpiece\.([a-z_][a-z0-9_]*)\b/gu)].map((m) => m[1]));
}

describe('Un champ servi ET affiché traverse la normalisation', () => {
  let servie;

  test('LA MATIÈRE : une vraie pièce, servie par la vraie route', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'Politique éprouvée par la jointure', statut: 'brouillon' } },
    });
    assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
    const doc = cree.corps.enregistrement.id;

    const depot = await serveur.deposer(
      `/api/pieces/documents/${doc}`,
      { nom: 'preuve.pdf', type: 'application/pdf', contenu: pdfValide('champs servis') },
      [{ nom: 'version', contenu: '1.4' }],
    );
    assert.equal(depot.statut, 201, JSON.stringify(depot.corps));
    await serveur.appeler('POST', `/api/pieces/documents/${doc}/${depot.corps.id}/en-vigueur`);

    const vue = await serveur.appeler('GET', `/api/pieces/documents/${doc}`);
    assert.equal(vue.statut, 200, JSON.stringify(vue.corps));
    servie = vue.corps.pieces[0];
    assert.ok(servie, 'la route doit servir la pièce déposée');

    // Contrôle de matière : sans ces valeurs, la comparaison plus bas serait
    // vraie d'un objet vide.
    assert.equal(servie.en_vigueur, true);
    assert.equal(servie.version_piece, '1.4');
    assert.match(servie.sha256, /^[0-9a-f]{64}$/u);
    assert.equal(
      servie.chemin_stockage,
      undefined,
      'le chemin de stockage ne doit JAMAIS sortir sur le réseau (§31.3)',
    );
  });

  test('AUCUN CHAMP LU PAR L’ÉCRAN N’EST JETÉ PAR LA NORMALISATION', () => {
    const lus = champsLusParLePanneau();
    assert.ok(
      lus.size >= 5,
      `Seulement ${String(lus.size)} champ(s) lu(s) trouvé(s) dans le panneau : l’extraction ` +
        'ne trouve plus son sujet, et ce contrôle mesurerait le vide.',
    );

    const [normalisee] = panneau.normaliserListe({ pieces: [servie] });
    assert.ok(normalisee, 'la normalisation doit rendre la pièce');

    const perdus = [...lus]
      .filter((champ) => Object.prototype.hasOwnProperty.call(servie, champ))
      .filter((champ) => !Object.prototype.hasOwnProperty.call(normalisee, champ))
      .sort();

    assert.deepEqual(
      perdus,
      [],
      'Ces champs sont SERVIS par la route et LUS par le panneau, mais jetés par ' +
        '`normaliserListe()` : la colonne restera vide à l’écran, sans une seule erreur. ' +
        'C’est exactement ce qui est arrivé à « en_vigueur » et « version_piece ».\n' +
        perdus.map((c) => `    · ${c}`).join('\n'),
    );
  });

  test('LES VALEURS SURVIVENT, pas seulement les clés', () => {
    /* ⚠️ Sans ce bloc, une normalisation qui poserait `en_vigueur: false` en dur
       passerait le contrôle précédent — la clé serait là. « Qu'est-ce qui
       passerait aussi » : c'est la question que ce chantier pose à chaque
       assertion. */
    const [normalisee] = panneau.normaliserListe({ pieces: [servie] });
    assert.equal(normalisee.en_vigueur, true, 'la pièce qui fait foi doit le rester après filtrage');
    assert.equal(normalisee.version_piece, '1.4');
    assert.equal(normalisee.sha256, servie.sha256, 'l’empreinte doit traverser intacte');
    assert.equal(normalisee.etat_analyse, servie.etat_analyse);
  });

  test('MORSURE : un champ retiré de la normalisation est vu', () => {
    /* On simule l'oubli exact qui a eu lieu, sur la sortie de la fonction
       plutôt que dans son texte : si le contrôle ne voyait pas ce cas-là, il ne
       verrait rien. */
    const lus = champsLusParLePanneau();
    const [normalisee] = panneau.normaliserListe({ pieces: [servie] });
    const ampute = { ...normalisee };
    delete ampute.en_vigueur;

    const perdus = [...lus]
      .filter((champ) => Object.prototype.hasOwnProperty.call(servie, champ))
      .filter((champ) => !Object.prototype.hasOwnProperty.call(ampute, champ));

    assert.deepEqual(
      perdus,
      ['en_vigueur'],
      'Le contrôle ne voit pas un champ manquant : il ne compare rien, et le bloc ' +
        'précédent est un décor.',
    );
  });
});
