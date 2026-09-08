/**
 * version-en-vigueur.test.mjs — **laquelle de ces pièces fait foi ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Action **D1** de la vague 9 (`docs/PLAN_EXECUTION.md` §3)
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le lot L6 livrait le coffre : on déposait autant de fichiers qu'on voulait sur
 * une fiche document, ils étaient analysés, empreintés, délivrés. Et **rien ne
 * disait lequel était la version en vigueur** — pendant que la fiche portait un
 * champ « Version » en saisie libre, où l'on tapait « 2.1 » au-dessus du PDF de
 * la 1.4. Dans un outil produit en audit ISO 27001, c'est la pire forme de faux :
 * il est *plausible*.
 *
 * ── Ce que cet essai mesure, et où vit chaque garantie ───────────────────
 *
 *  · **une seule pièce fait foi** — `uq_pieces_jointes_en_vigueur`, index unique
 *    PARTIEL. ⚠️ La route ne peut pas le prouver seule : elle démet avant de
 *    promouvoir, si bien qu'elle resterait verte **l'index retiré**. C'est
 *    pourquoi le §2 attaque la base en direct : deux `update` concurrents, et
 *    l'on exige que PostgreSQL refuse. Retirer l'index fait rougir ce bloc-là,
 *    et lui seul aurait pu le voir ;
 *  · **rien de non délivrable ne fait foi** — `ck_pieces_jointes_en_vigueur` ;
 *  · **une pièce qui CESSE d'être délivrable est démise** —
 *    `trg_pieces_jointes_en_vigueur`. Sans lui, la ré-analyse antivirale
 *    échouerait sur la pièce en vigueur qu'elle veut mettre en quarantaine : on
 *    aurait fermé un défaut documentaire en bloquant le dispositif antimalware ;
 *  · **la fiche dit la version du fichier** — et si elle ne peut pas l'écrire,
 *    **la promotion entière échoue** (§4). C'est le point le plus important du
 *    fichier : réussir à moitié en annonçant le succès est le défaut que ce
 *    chantier a payé le plus cher.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, RACINE_FRONTEND } from '../aide/serveur.mjs';
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

/** Joue une requête sous le périmètre de la filiale d'essai. */
async function enBase(travail) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('essai-d1', FILIALE_A, [FILIALE_A]),
    travail,
  );
}

/** Crée une fiche document et rend son identifiant. */
async function creerDocument(champs) {
  const cree = await serveur.appeler('POST', '/api/entites/documents', { corps: { champs } });
  assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
  return cree.corps.enregistrement.id;
}

/** Dépose un PDF, avec son numéro de version, et rend la pièce créée. */
async function deposerVersion(documentId, nom, version) {
  const depot = await serveur.deposer(
    `/api/pieces/documents/${documentId}`,
    { nom, type: 'application/pdf', contenu: pdfValide(`${nom} — ${String(version)}`) },
    version === undefined ? [] : [{ nom: 'version', contenu: version }],
  );
  assert.equal(depot.statut, 201, JSON.stringify(depot.corps));
  return depot.corps;
}

/** La liste que la route rend — c'est ce que l'écran voit, pas ce que la base porte. */
async function listerParLaRoute(documentId) {
  const vue = await serveur.appeler('GET', `/api/pieces/documents/${documentId}`);
  assert.equal(vue.statut, 200, JSON.stringify(vue.corps));
  return vue.corps.pieces;
}

/** Le numéro de version que porte la FICHE, lu en base et non par la route. */
async function versionDeLaFiche(documentId) {
  return await enBase(
    async (c) =>
      (await c.query('select version_document from documents where id = $1', [documentId]))
        .rows[0]?.version_document ?? null,
  );
}

describe('D1 — une seule pièce fait foi, et c’est elle qui donne le numéro', () => {
  let doc;
  let v1;
  let v2;

  test('LA MATIÈRE : une fiche, deux fichiers numérotés, aucun ne fait foi', async () => {
    doc = await creerDocument({
      titre: 'Politique de sécurité du SI',
      type: 'Politique de sécurité (PSSI)',
      // La saisie libre d'origine — celle qui pouvait mentir. On la pose
      // exprès : la suite prouve que la promotion la remplace.
      version: '0.9-projet',
      statut: 'brouillon',
    });
    v1 = await deposerVersion(doc, 'pssi-v1.pdf', '1.0');
    v2 = await deposerVersion(doc, 'pssi-v2.pdf', '2.0');

    assert.equal(v1.version_piece, '1.0', 'le numéro doit voyager AVEC le fichier');
    assert.equal(v2.version_piece, '2.0');
    assert.equal(v1.en_vigueur, false, 'un dépôt ne fait pas foi de lui-même');
    assert.equal(v2.en_vigueur, false);
    assert.equal(
      await versionDeLaFiche(doc),
      '0.9-projet',
      'tant qu’aucune pièce ne fait foi, la saisie de la fiche subsiste',
    );
  });

  test('PROMOUVOIR : une pièce fait foi, et la FICHE porte SON numéro', async () => {
    const promue = await serveur.appeler(
      'POST',
      `/api/pieces/documents/${doc}/${v1.id}/en-vigueur`,
    );
    assert.equal(promue.statut, 200, JSON.stringify(promue.corps));
    assert.equal(promue.corps.en_vigueur, true);

    const pieces = await listerParLaRoute(doc);
    assert.deepEqual(
      pieces.filter((p) => p.en_vigueur).map((p) => p.id),
      [v1.id],
      'exactement une pièce doit faire foi',
    );
    assert.equal(
      await versionDeLaFiche(doc),
      '1.0',
      'La fiche annonce encore « 0.9-projet » alors que le fichier qui fait foi est la 1.0 : ' +
        'c’est le faux plausible que l’action D1 ferme.',
    );
  });

  test('PROMOUVOIR L’AUTRE : la première passe à l’HISTORIQUE, sans disparaître', async () => {
    const promue = await serveur.appeler(
      'POST',
      `/api/pieces/documents/${doc}/${v2.id}/en-vigueur`,
    );
    assert.equal(promue.statut, 200, JSON.stringify(promue.corps));

    const pieces = await listerParLaRoute(doc);
    assert.deepEqual(
      pieces.filter((p) => p.en_vigueur).map((p) => p.id),
      [v2.id],
      'la désignation doit démettre la précédente',
    );
    assert.equal(pieces.length, 2, 'l’historique reste : c’est la raison d’être du lot');

    // ⚠️ La moitié qui compte pour un auditeur : « montrez-moi la v1 ».
    const ancienne = await serveur.appeler('GET', `/api/pieces/documents/${doc}/${v1.id}`);
    assert.equal(
      ancienne.statut,
      200,
      'La version précédente n’est plus téléchargeable : on a confondu « faire l’historique » ' +
        'et « supprimer ». Un audit demande précisément l’ancienne version.',
    );
    assert.equal(await versionDeLaFiche(doc), '2.0');
  });

  test('UNE PIÈCE SANS NUMÉRO retire le numéro de la fiche, et ne le laisse pas mentir', async () => {
    const sansNumero = await deposerVersion(doc, 'pssi-sans-numero.pdf', undefined);
    assert.equal(sansNumero.version_piece, null);

    const promue = await serveur.appeler(
      'POST',
      `/api/pieces/documents/${doc}/${sansNumero.id}/en-vigueur`,
    );
    assert.equal(promue.statut, 200, JSON.stringify(promue.corps));
    assert.equal(
      await versionDeLaFiche(doc),
      null,
      'La fiche garde « 2.0 » alors que le fichier qui fait foi ne porte aucun numéro : ' +
        'le champ recommencerait à annoncer une version que rien ne soutient.',
    );

    // On repose la 2.0 pour la suite du fichier.
    await serveur.appeler('POST', `/api/pieces/documents/${doc}/${v2.id}/en-vigueur`);
    assert.equal(await versionDeLaFiche(doc), '2.0');
  });
});

describe('D1 — l’unicité est tenue par la BASE, et cet essai l’attaque en direct', () => {
  test('DEUX PIÈCES EN VIGUEUR EN MÊME TEMPS : PostgreSQL refuse', async () => {
    /* ⚠️ **C'est le bloc que la route ne peut pas remplacer.** `POST …/en-vigueur`
       démet avant de promouvoir : elle resterait verte l'index retiré, et
       l'invariant serait perdu sans qu'un seul essai rougisse. On écrit donc
       DIRECTEMENT en base, ce que la route ne fait jamais — c'est le seul moyen
       de mesurer la contrainte plutôt que la politesse de l'appelant.

       C'est aussi la morsure que le critère d'acceptation de D1 réclame :
       « une mutation qui retirerait l'unicité fait rougir le banc ». */
    const doc = await creerDocument({ titre: 'Charte informatique', statut: 'brouillon' });
    const a = await deposerVersion(doc, 'charte-a.pdf', '1.0');
    const b = await deposerVersion(doc, 'charte-b.pdf', '1.1');

    /* ⚠️ **Les deux écritures DANS LA MÊME transaction.** `avecPerimetre` annule
       par défaut — c'est ce qui rend les essais indépendants de leur ordre —, si
       bien que deux appels séparés auraient posé « en vigueur » puis l'auraient
       défait avant le second : l'index n'aurait jamais eu deux lignes à départager
       et l'essai serait resté vert **l'index retiré**. C'est exactement le genre
       de décor que ce chantier appelle « un essai qui passerait aussi ». */
    const refus = await enBase(async (c) => {
      await c.query('update pieces_jointes set en_vigueur = true where id = $1', [a.id]);
      return await c
        .query('update pieces_jointes set en_vigueur = true where id = $1', [b.id])
        .then(
          () => null,
          (erreur) => erreur,
        );
    });

    assert.ok(
      refus,
      'DEUX pièces de la même fiche portent « en vigueur » : la question « quelle version ' +
        'fait foi ? » a maintenant deux réponses, dans un outil produit en audit. ' +
        'L’index unique partiel uq_pieces_jointes_en_vigueur a-t-il été retiré ?',
    );
    assert.equal(refus.code, '23505', `attendu une violation d’unicité, reçu ${refus.code}`);
  });

  test('UN FICHIER EN QUARANTAINE NE PEUT PAS FAIRE FOI', async () => {
    const doc = await creerDocument({ titre: 'Procédure de sauvegarde', statut: 'brouillon' });
    const piece = await deposerVersion(doc, 'sauvegarde.pdf', '1.0');

    const refus = await enBase(async (c) =>
      c
        .query('update pieces_jointes set quarantaine = true, en_vigueur = true where id = $1', [
          piece.id,
        ])
        .then(
          () => null,
          (erreur) => erreur,
        ),
    );
    assert.ok(
      refus,
      'Un fichier isolé par l’antivirus vient d’être désigné comme la version officielle ' +
        'd’une politique de sécurité. ck_pieces_jointes_en_vigueur a-t-elle été retirée ?',
    );
    assert.equal(refus.code, '23514', `attendu une violation de contrainte, reçu ${refus.code}`);
  });

  test('LA RÉ-ANALYSE DÉMET, elle n’échoue pas — sans quoi l’antivirus serait bloqué', async () => {
    /* ⚠️ La moitié qui empêche le remède d'être pire que le mal. La ré-analyse
       périodique met en quarantaine un fichier propre depuis six mois — c'est sa
       raison d'être sur trois ans de rétention. Si elle heurtait la contrainte
       ci-dessus, la gestion documentaire bloquerait le dispositif antimalware. */
    const doc = await creerDocument({ titre: 'Plan de continuité', statut: 'brouillon' });
    const piece = await deposerVersion(doc, 'pca.pdf', '3.0');
    const promue = await serveur.appeler(
      'POST',
      `/api/pieces/documents/${doc}/${piece.id}/en-vigueur`,
    );
    assert.equal(promue.statut, 200, JSON.stringify(promue.corps));

    const apres = await enBase(async (c) => {
      await c.query(
        `update pieces_jointes
            set quarantaine = true, etat_analyse = 'infectee',
                resultat_analyse = 'ré-analyse : signature trouvée',
                derniere_reanalyse = now()
          where id = $1`,
        [piece.id],
      );
      return (
        await c.query('select en_vigueur, quarantaine from pieces_jointes where id = $1', [
          piece.id,
        ])
      ).rows[0];
    });

    assert.equal(apres.quarantaine, true, 'la mise en quarantaine doit aboutir');
    assert.equal(
      apres.en_vigueur,
      false,
      'La pièce mise en quarantaine fait toujours foi : le registre désigne comme version ' +
        'officielle un fichier que le produit refuse de délivrer.',
    );
  });
});

describe('D1 — le reflet qui n’écrit rien fait ÉCHOUER la promotion', () => {
  test('UNE FICHE INTROUVABLE : 403, et RIEN n’est écrit', async () => {
    /* `pieces_jointes` porte un rattachement POLYMORPHE, sans clé étrangère : on
       peut donc attacher une pièce à un identifiant de document qui n'existe pas.
       C'est le chemin le plus court pour éprouver ce que la route fait quand le
       reflet ne touche AUCUNE ligne — la situation réelle étant une politique de
       PORTÉE GROUPE, qu'une session de filiale ne peut pas modifier.

       Ce qui est mesuré ici n'est pas le 403 : c'est que la transaction est
       annulée EN ENTIER. Laisser la pièce promue donnerait « en vigueur : 2.1 »
       au panneau des pièces et « version : 1.4 » sur la fiche, tous deux sans
       erreur — deux réponses à la même question. */
    const fantome = 'DOC-1700000000000-ffffffffffff';
    const piece = await deposerVersion(fantome, 'orpheline.pdf', '9.9');

    const refus = await serveur.appeler(
      'POST',
      `/api/pieces/documents/${fantome}/${piece.id}/en-vigueur`,
    );
    assert.equal(refus.statut, 403, JSON.stringify(refus.corps));

    const etat = await enBase(
      async (c) =>
        (await c.query('select en_vigueur from pieces_jointes where id = $1', [piece.id])).rows[0],
    );
    assert.equal(
      etat.en_vigueur,
      false,
      'La pièce est restée promue alors que la route a répondu 403 : la transaction n’a pas ' +
        'été annulée en entier, et l’écran des pièces contredira désormais la fiche.',
    );
  });
});

describe('D4 — « resté ailleurs » ne se confond plus avec « détenu ici »', () => {
  test('LA BASE le dit dans le commentaire de colonne', async () => {
    const commentaire = await enBase(
      async (c) =>
        (
          await c.query(
            `select col_description('documents'::regclass, a.attnum) as note
               from pg_attribute a
              where a.attrelid = 'documents'::regclass and a.attname = 'emplacement'`,
          )
        ).rows[0]?.note ?? '',
    );
    assert.match(
      commentaire,
      /RESTÉ AILLEURS/u,
      'Le commentaire de documents.emplacement ne dit plus que ce champ est une RÉFÉRENCE ' +
        'externe. C’est le premier endroit que lit qui écrit une route ou une migration : ' +
        'sans lui, le champ redevient confondable avec une pièce détenue par l’application.',
    );
  });

  test('L’ÉCRAN ne réaffirme plus que l’application ne stocke rien', () => {
    /* ⚠️ Cet essai garde une PHRASE, et il faut dire pourquoi c'est légitime ici
       (§17.5) : la phrase « l'application ne stocke pas le fichier lui-même » a
       été vraie — du produit 100 % navigateur — et elle est restée dans trois
       endroits de cet écran une vague entière après que le lot L6 l'eut rendue
       fausse. Ce n'est pas une coquette : un utilisateur qui la lit ne cherche
       pas le panneau des pièces jointes, et c'est très exactement ce qui est
       arrivé — l'utilisateur ne l'avait pas trouvé (`docs/PLAN_EXECUTION.md` §3,
       vague 9). */
    const source = readFileSync(join(RACINE_FRONTEND, 'js', 'modules', 'documents.js'), 'utf8');
    const lignes = source
      .split('\n')
      .filter((ligne) => /ne stocke pas les fichiers|ne stocke pas le fichier/u.test(ligne))
      // La seule occurrence admise est celle qui NOMME la phrase pour dire
      // qu'elle est fausse.
      .filter((ligne) => !/FAUSSE|était vraie/u.test(ligne));
    assert.deepEqual(
      lignes,
      [],
      'L’écran des documents affirme de nouveau que l’application ne stocke pas les fichiers. ' +
        'C’est faux depuis le lot L6, et cette phrase est ce qui empêche de chercher le ' +
        'panneau des pièces jointes.',
    );
    assert.match(
      source,
      /Document resté ailleurs/u,
      'Le champ « emplacement » a perdu son étiquette « Document resté ailleurs » : il ' +
        'redevient confondable avec les pièces que l’application détient (action D4).',
    );
  });
});
