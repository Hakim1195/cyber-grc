/**
 * integrite.test.mjs — **le fichier est-il encore celui qu'on a empreinté ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Une promesse à moitié tenue, mesurée le 08/09/2026
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le contrôle n° 6 du §31.2 calcule le SHA-256 **sur ce qui a été écrit** —
 * `empreinteDe()` relit le disque plutôt que d'empreinter ce qui a été reçu. Le
 * commentaire de `pieces_jointes.sha256` en tire la promesse : *« c'est ce qui
 * transforme une pièce jointe en preuve vérifiable — un auditeur peut s'assurer
 * qu'un rapport de test PRA n'a pas été remplacé après coup. »*
 *
 * Mesuré par balayage de `src/` : **`empreinteDe()` n'avait qu'UN SEUL appelant**,
 * le dépôt. L'empreinte était écrite, stockée, servie — et **mordue par rien**.
 * C'est la définition même d'un garde-fou qui n'est qu'un commentaire (§18.4),
 * et cette fois il portait la promesse centrale du coffre documentaire.
 *
 * ── Les trois verdicts, et pourquoi les trois sont éprouvés ──────────────
 *
 *  · `conforme` — sans ce cas, « tout est en écart » passerait pour un contrôle
 *    qui marche, et le produit crierait sur chaque pièce saine ;
 *  · `ecart` — le cas pour lequel tout ceci existe. On **altère réellement les
 *    octets sur le disque** : un essai qui se contenterait de changer le
 *    `sha256` en base mesurerait la comparaison, pas la relecture ;
 *  · `fichier_absent` — la preuve a disparu et la fiche continue de l'annoncer.
 *
 * ⚠️ **Et ce que ces essais NE prouvent PAS** (§17.5) : que l'intégrité est
 * garantie. Qui peut écrire dans le magasin peut aussi mettre le `sha256` à jour
 * en base. Ce dispositif attrape la corruption, la restauration partielle et la
 * substitution faite hors de l'application — pas un adversaire qui tient les deux.
 */

import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { monterPieces, pdfValide, perimetreDe, SessionDEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const { verifierIntegriteStock } = await moduleCompile('pieces/exploitation.js');
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

async function enBase(travail) {
  return await base.avecPerimetre(applicatif, perimetre('essai-integrite', FILIALE_A, [FILIALE_A]), travail);
}

/** Dépose une pièce sur un document neuf et rend `{ doc, piece, fichier }`. */
async function deposerUnePiece(titre, contenu) {
  const cree = await serveur.appeler('POST', '/api/entites/documents', {
    corps: { champs: { titre, statut: 'brouillon' } },
  });
  assert.equal(cree.statut, 201, JSON.stringify(cree.corps));
  const doc = cree.corps.enregistrement.id;

  const depot = await serveur.deposer(`/api/pieces/documents/${doc}`, {
    nom: 'preuve.pdf',
    type: 'application/pdf',
    contenu,
  });
  assert.equal(depot.statut, 201, JSON.stringify(depot.corps));

  const relatif = await enBase(
    async (c) =>
      (await c.query('select chemin_stockage from pieces_jointes where id = $1', [depot.corps.id]))
        .rows[0].chemin_stockage,
  );
  return { doc, piece: depot.corps, fichier: join(serveur.magasin, 'pieces', relatif) };
}

const verifier = async (doc, pieceId) =>
  await serveur.appeler('GET', `/api/pieces/documents/${doc}/${pieceId}/integrite`);

/** Entrées `verification_integrite` du journal, sous périmètre. */
async function tracesIntegrite() {
  return await enBase(
    async (c) =>
      (
        await c.query(
          `select entite_id, valeurs_apres from journal_audit
            where action = 'verification_integrite' order by numero`,
        )
      ).rows,
  );
}

describe('La route de vérification rapproche le fichier de son empreinte', () => {
  test('CONFORME : un fichier intact est reconnu comme tel', async () => {
    const { doc, piece } = await deposerUnePiece('Politique intacte', pdfValide('intacte'));
    const r = await verifier(doc, piece.id);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(r.corps.verdict, 'conforme');
    assert.equal(r.corps.sha256_constate, piece.sha256, 'l’empreinte relue doit être celle du dépôt');
    assert.equal(r.corps.taille_constatee, piece.taille_octets);
  });

  test('ÉCART : les octets du disque sont ALTÉRÉS, et le produit le voit', async () => {
    /* ⚠️ On altère le FICHIER, pas la ligne. Changer le `sha256` en base
       mesurerait une comparaison de deux colonnes ; ce qu'on veut mesurer, c'est
       que le produit RELIT le disque. C'est la différence entre un contrôle et
       un décor. */
    const { doc, piece, fichier } = await deposerUnePiece('Politique substituée', pdfValide('origine'));

    const avant = await readFile(fichier);
    await writeFile(fichier, pdfValide('un texte substitué après coup'));
    const apres = await readFile(fichier);
    assert.notEqual(
      Buffer.compare(avant, apres),
      0,
      'la matière : le fichier doit réellement avoir changé sur le disque',
    );

    const r = await verifier(doc, piece.id);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(
      r.corps.verdict,
      'ecart',
      'Le fichier a été remplacé sur le disque et le produit répond « conforme » : ' +
        'l’empreinte ne prouve plus rien, et elle est présentée comme une preuve d’audit.',
    );
    assert.equal(r.corps.sha256_attendu, piece.sha256);
    assert.notEqual(r.corps.sha256_constate, piece.sha256);
    assert.match(r.corps.sha256_constate, /^[0-9a-f]{64}$/u);
  });

  test('FICHIER ABSENT : la preuve a disparu, et la fiche l’annonce encore', async () => {
    const { doc, piece, fichier } = await deposerUnePiece('Politique effacée', pdfValide('effacee'));
    await rm(fichier);

    const r = await verifier(doc, piece.id);
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(r.corps.verdict, 'fichier_absent');
    assert.equal(r.corps.sha256_constate, null);

    // La pièce reste listée : c'est précisément ce qui rend le verdict utile.
    const liste = await serveur.appeler('GET', `/api/pieces/documents/${doc}`);
    assert.equal(liste.corps.pieces.length, 1, 'la liste continue d’annoncer la pièce');
  });

  test('LA TRACE : les TROIS verdicts sont journalisés, pas seulement les mauvais', async () => {
    /* Un journal qui ne garderait que les mauvaises nouvelles ne permettrait pas
       de répondre à « quand cette pièce a-t-elle été vérifiée pour la dernière
       fois ? », qui est la question d'un auditeur. */
    const traces = await tracesIntegrite();
    const verdicts = traces.map((t) => t.valeurs_apres.verdict).sort();
    assert.deepEqual(
      verdicts,
      ['conforme', 'ecart', 'fichier_absent'],
      `Les trois vérifications n’ont pas toutes laissé de trace : ${JSON.stringify(verdicts)}`,
    );
    for (const trace of traces) {
      assert.ok(trace.entite_id, 'la trace doit nommer LA pièce, pas « une » pièce');
      assert.match(trace.valeurs_apres.sha256_attendu, /^[0-9a-f]{64}$/u);
    }
  });

  test('LA ROUTE NE PERSISTE RIEN — c’est le balayage qui inscrit', async () => {
    /* Arbitrage écrit dans `src/pieces/index.ts` : une session de périmètre
       Groupe qui vérifie la pièce d’une filiale voisine — qu’elle a le droit de
       LIRE — verrait l’`update` toucher zéro ligne. Le produit répondrait
       « vérifiée » sans avoir rien inscrit : réussir en silence. On mesure donc
       que la colonne n’a PAS bougé. */
    const etats = await enBase(
      async (c) =>
        (await c.query('select distinct etat_integrite from pieces_jointes order by 1')).rows,
    );
    assert.deepEqual(
      etats.map((l) => l.etat_integrite),
      ['non_verifiee'],
      'La route a inscrit un verdict en base : elle est déclarée « lire », et cette écriture ' +
        'échouerait silencieusement sur la pièce d’une autre filiale.',
    );
  });
});

describe('Le balayage périodique inscrit ce qu’il constate', () => {
  test('IL TROUVE L’ÉCART, l’inscrit, et le journalise', async () => {
    const resultat = await verifierIntegriteStock(
      serveur.pool,
      serveur.config,
      { delaiMaxJours: 0, limiteParExecution: 100 },
      undefined,
    );

    assert.ok(resultat.examinees >= 3, `seulement ${String(resultat.examinees)} pièce(s) rapprochée(s)`);
    assert.equal(resultat.ecarts.length, 1, JSON.stringify(resultat.ecarts));
    assert.equal(resultat.absents.length, 1, JSON.stringify(resultat.absents));
    assert.ok(resultat.conformes.length >= 1, 'au moins une pièce doit être conforme');

    const etats = await enBase(
      async (c) =>
        (
          await c.query(
            `select etat_integrite, count(*)::int as n, count(derniere_verification)::int as datees
               from pieces_jointes group by etat_integrite order by 1`,
          )
        ).rows,
    );
    const par = Object.fromEntries(etats.map((l) => [l.etat_integrite, l.n]));
    assert.equal(par.ecart, 1, JSON.stringify(etats));
    assert.equal(par.fichier_absent, 1, JSON.stringify(etats));
    assert.ok(par.conforme >= 1, JSON.stringify(etats));
    // ⚠️ La contrainte `ck_pieces_jointes_integrite_datee` se lit dans les DEUX
    // sens, et l'essai aussi : un verdict est daté, une absence de verdict ne
    // l'est pas. Le second cas existe pour de bon ici — le harnais sème une pièce
    // en `en_attente`, que le balayage écarte à dessein (elle n'est pas
    // délivrable). N'éprouver que le premier sens laisserait passer une date
    // posée sur une pièce que personne n'a rapprochée.
    for (const ligne of etats) {
      assert.equal(
        ligne.datees,
        ligne.etat_integrite === 'non_verifiee' ? 0 : ligne.n,
        `« ${ligne.etat_integrite} » : ${String(ligne.datees)} datée(s) sur ${String(ligne.n)} — ` +
          'ck_pieces_jointes_integrite_datee devrait l’avoir refusé.',
      );
    }
    assert.ok(
      etats.some((l) => l.etat_integrite === 'non_verifiee'),
      'Aucune pièce non vérifiée : le second sens de la contrainte n’est pas éprouvé, et ce ' +
        'contrôle ne mesure plus qu’une moitié.',
    );
  });

  test('MORSURE : sans relecture du disque, l’écart serait invisible', async () => {
    /* On remet le contenu d'origine sous l'un des fichiers et l'on exige que le
       balayage suivant CHANGE d'avis. Un contrôle qui rendrait toujours le même
       verdict — ou qui lirait la colonne au lieu du fichier — resterait vert au
       premier passage et ne verrait jamais rien bouger. */
    const { doc, piece, fichier } = await deposerUnePiece('Politique réparée', pdfValide('origine v1'));
    await writeFile(fichier, pdfValide('altérée'));
    assert.equal((await verifier(doc, piece.id)).corps.verdict, 'ecart');

    await writeFile(fichier, pdfValide('origine v1'));
    const apres = await verifier(doc, piece.id);
    assert.equal(
      apres.corps.verdict,
      'conforme',
      'Le verdict ne change pas quand le fichier redevient conforme : la vérification ne lit ' +
        'pas le disque, elle récite un état.',
    );
  });
});
