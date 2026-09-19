/**
 * reutilisation.test.mjs — **une preuve sert plusieurs contrôles, et le fichier
 * ne se libère qu'au DERNIER.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Action 19.4 — migration `038`. Ce que le plan appelait « le point dur »
 * ════════════════════════════════════════════════════════════════════════
 *
 * Un auditeur ISO 27001 demande la même procédure devant cinq contrôles. Le
 * produit obligeait à la DÉPOSER cinq fois : cinq lignes, cinq fichiers, cinq
 * empreintes du même contenu, cinq quotas — et, le jour où la procédure change,
 * **quatre chances d'en oublier une**.
 *
 * ── ⚠️ CE QUI REND L'ACTION DURE, ET CE QUE CE FICHIER MESURE ────────────────
 *
 * La migration `017` a fermé les constats Q-232 / Q-233 en supprimant la pièce
 * AVEC son porteur, sur **tous** les chemins de disparition. Réutiliser met
 * cette garantie en tension avec elle-même : si la pièce suit son porteur et
 * qu'elle en a cinq, le premier porteur supprimé emporte la preuve des quatre
 * autres.
 *
 * La règle devient : **une pièce suit SES porteurs, et seul le retrait du
 * dernier libère le fichier.** « Zéro orpheline » ne bouge pas d'un pouce — ce
 * qui change est la définition d'être orpheline. Les deux moitiés sont
 * mesurées ici, **sur chacun des chemins de cascade du schéma**, et les chemins
 * sont DÉRIVÉS de `pg_constraint` (`REQUETE_CASCADES`, partagée avec
 * `orphelines.test.mjs` pour que les deux familles balaient les mêmes).
 *
 * ⚠️ **Une moitié sans l'autre est pire que rien** : garder le fichier trop
 * longtemps remplit le quota de fantômes et laisse une preuve téléchargeable
 * après un effacement RGPD ; le libérer trop tôt fait délivrer un octet
 * manquant sur quatre écrans qui croient documenter leur contrôle.
 */

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import {
  monterPieces,
  pdfValide,
  perimetreDe,
  REQUETE_CASCADES,
  colonnesVersLeMemeParent,
  parentsRequis,
  SessionDEssai,
  vocabulairesClos,
} from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');
const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

let base;
let serveur;
let applicatif;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), TOUS_DROITS);
  serveur = await monterPieces(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  Outils — tous LISENT la base, aucun ne récite
 * ===================================================================== */

const existe = async (chemin) =>
  await access(chemin).then(
    () => true,
    () => false,
  );

/**
 * Requête sous le périmètre d'une filiale, en lecture.
 *
 * ⚠️ La filiale est un PARAMÈTRE, et il a fallu qu'elle le devienne : lire la
 * pièce de la filiale B sous le périmètre de A rend zéro ligne — la RLS fait son
 * office —, et l'essai accusait alors le dépôt au lieu de s'accuser lui-même.
 */
async function enBase(texte, valeurs = [], filiale = FILIALE_A) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', filiale, [filiale]),
    async (c) => (await c.query(texte, valeurs)).rows,
  );
}

/** L'adresse de délivrance d'une pièce, telle que la base la porte. */
async function adresseDe(pieceId) {
  const lignes = await enBase(
    'select entite_type, entite_id, en_vigueur from pieces_jointes where id = $1',
    [pieceId],
  );
  return lignes[0] ?? null;
}

/** Les porteurs que sert une pièce, lus dans `piece_rattachements`. */
async function porteursDe(pieceId) {
  const lignes = await enBase(
    'select entite_type, entite_id from piece_rattachements where piece_id = $1 ' +
      'order by entite_type, entite_id',
    [pieceId],
  );
  return lignes.map((l) => `${l.entite_type}/${l.entite_id}`);
}

/** Le chemin de stockage — il ne sort jamais par l'API. */
async function cheminDe(pieceId, filiale = FILIALE_A) {
  const lignes = await enBase(
    'select chemin_stockage from pieces_jointes where id = $1',
    [pieceId],
    filiale,
  );
  return lignes[0]?.chemin_stockage ?? null;
}

/** La file de purge du magasin : elle doit être vide quand la réponse est rendue. */
async function fileDePurge() {
  const lignes = await enBase('select count(*)::text as n from pieces_a_purger');
  return Number(lignes[0].n);
}

/** Les anomalies rendues par le garde-fou de l'invariant. */
async function anomaliesDeLInvariant() {
  return await enBase('select objet, anomalie from f_verifier_rattachements_pieces()');
}

/** Les chemins de cascade du schéma, dérivés de `pg_constraint`. */
async function cascadesDuSchema() {
  return await enBase(REQUETE_CASCADES);
}

/** Le modèle rendu par l'API : c'est lui qui dit les champs obligatoires. */
let modeleEntites;
/** Les valeurs admises, par « table.colonne » — chargées une fois. */
let vocabulaires;

/** Crée un enregistrement en remplissant ses seuls champs obligatoires. */
async function creer(entite, champs = {}) {
  modeleEntites ??= (await serveur.appeler('GET', '/api/modele')).corps.entites;
  // ⚠️ Le vocabulaire clos ne vient PAS du modèle : `/api/modele` rend le type
  // et l'obligation d'un champ, jamais ses valeurs admises. Il se lit dans le
  // catalogue, sans quoi une colonne à la fois obligatoire ET énumérée — la
  // première est `questionnaire_reponses.reponse`, migration `043` — recevrait
  // la valeur générique ci-dessous et rendrait `400`.
  vocabulaires ??= await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) => await vocabulairesClos(c),
  );
  const description = modeleEntites[entite];
  assert.ok(description, `« ${entite} » n’est pas une entité du modèle.`);
  const corps = { ...champs };
  for (const [champ, forme] of Object.entries(description.champs)) {
    if (!forme.obligatoire || corps[champ] !== undefined) continue;
    const admises = vocabulaires[`${entite}.${champ}`];
    corps[champ] =
      forme.type === 'entier' || forme.type === 'nombre'
        ? 1
        : forme.type === 'booleen'
          ? false
          // ⚠️ Un document STRUCTURÉ, et non une chaîne : la couche d'écriture
          // refuse « attend un document structuré » sur une colonne `jsonb`
          // obligatoire — la première est `referentiel_traductions.dictionnaire`
          // (migration `051`). Un objet vide suffit : ce que l'essai mesure est la
          // cascade, pas le contenu du document.
          : forme.type === 'json'
            ? {}
          : forme.type === 'date'
            ? '2026-12-24'
            : admises !== undefined
              ? admises[0]
              : `19.4 ${entite} ${champ}`;
  }
  const reponse = await serveur.appeler('POST', `/api/entites/${entite}`, { corps: { champs: corps } });
  assert.equal(reponse.statut, 201, `${entite} : ${JSON.stringify(reponse.corps)}`);
  return reponse.corps.enregistrement.id;
}

/**
 * Crée un enregistrement EN CRÉANT D'ABORD les parents qu'il doit nommer.
 *
 * ⚠️ `questionnaires_tiers` (migration `043`) est à la fois **parent** de
 * `questionnaire_reponses` et **enfant** de `prestataires` : le créer sans
 * nommer son tiers rend `409`, et le balayage échouait sur une entité
 * parfaitement saine. Les parents sont DÉCOUVERTS dans les mêmes cascades que
 * le reste — aucune liste à tenir.
 *
 * La profondeur est bornée : le graphe des cascades est acyclique aujourd'hui,
 * mais un essai qui BOUCLERAIT au lieu de rougir ne signalerait jamais rien
 * (constat Q-251).
 */
/**
 * La valeur d'une colonne sur une ligne déjà créée.
 *
 * ⚠️ Le nom de table et celui de colonne viennent de `pg_constraint`, jamais d'une
 * entrée : ils sont interpolés parce qu'un identifiant ne se paramètre pas en SQL,
 * et leur origine est le catalogue de la base elle-même.
 */
async function valeurDuParent(table, identifiant, colonne) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A]),
    async (c) => {
      const { rows } = await c.query(
        `select ${colonne} as valeur from ${table} where id = $1`, [identifiant]);
      return rows[0]?.valeur ?? null;
    },
  );
}

async function creerAvecParents(entite, cascades, champs = {}, profondeur = 0) {
  if (profondeur > 5) {
    throw new Error(`Chaîne de parents trop profonde à partir de « ${entite} » : ` +
      'le graphe des cascades est-il devenu cyclique ?');
  }
  const complet = { ...champs };
  for (const parent of parentsRequis(cascades, entite)) {
    if (complet[parent.colonne] === undefined) {
      complet[parent.colonne] = await creerAvecParents(parent.parent, cascades, {}, profondeur + 1);
    }
    // ── ⚠️ LES AUTRES COLONNES D'UNE CLÉ COMPOSITE ────────────────────────
    //
    // Une clé étrangère peut porter, en plus de l'identifiant du parent et de
    // `filiale_id`, une colonne MÉTIER : `referentiel_exigences` nomme son domaine
    // par `(domaine_id, referentiel_id)`, ce qui empêche une exigence de déclarer un
    // référentiel autre que celui de son domaine (migration `051`). Les remplir avec
    // la valeur générique du balayage rendait `409` — pour une raison étrangère à ce
    // que cet essai mesure.
    //
    // ⚠️ Elles sont LUES SUR LE PARENT, et découvertes dans `pg_constraint` : une
    // liste écrite ici manquerait la prochaine clé composite en silence.
    for (const paire of parent.paires_complementaires ?? []) {
      if (complet[paire.locale] !== undefined) continue;
      complet[paire.locale] = await valeurDuParent(
        parent.parent, complet[parent.colonne], paire.cible);
    }
  }
  return await creer(entite, complet);
}

/** Dépose une pièce et rend `{ id, chemin, disque }`. */
async function deposerSur(entite, identifiant, nom, filiale = FILIALE_A) {
  const depot = await serveur.deposer(`/api/pieces/${entite}/${identifiant}`, {
    nom,
    type: 'application/pdf',
    contenu: pdfValide(`preuve ${nom}`),
  });
  assert.equal(depot.statut, 201, JSON.stringify(depot.corps));
  const chemin = await cheminDe(depot.corps.id, filiale);
  assert.ok(chemin, 'la ligne doit porter un chemin de stockage');
  return { id: depot.corps.id, chemin, disque: join(serveur.magasin, 'pieces', chemin) };
}

/** Réutilise une preuve : la rattache à un porteur de plus. */
async function reutiliser(versEntite, versId, { piece, depuisEntite, depuisId }) {
  return await serveur.appeler('POST', `/api/pieces/${versEntite}/${versId}/rattachements`, {
    corps: { piece_id: piece, depuis_entite: depuisEntite, depuis_entite_id: depuisId },
  });
}

/* =====================================================================
 *  §1 — LA MATIÈRE
 * ===================================================================== */

describe('19.4 — une preuve déposée UNE fois sert plusieurs contrôles', () => {
  let document;
  let mesure;
  let piece;

  test('LA MATIÈRE : un document, un contrôle, une procédure déposée sur le document', async () => {
    document = await creer('documents', { titre: 'Procédure de chiffrement' });
    mesure = await creer('mesures', { nom: 'Chiffrement des postes' });
    piece = await deposerSur('documents', document, 'chiffrement.pdf');

    assert.deepEqual(await porteursDe(piece.id), [`documents/${document}`]);
    assert.equal(await existe(piece.disque), true);
  });

  test('RÉUTILISER ne dépose RIEN : une ligne, un fichier, une empreinte, un quota', async () => {
    const avant = await enBase(
      'select count(*)::text as n, coalesce(sum(taille_octets), 0)::text as o from pieces_jointes',
    );

    const reponse = await reutiliser('mesures', mesure, {
      piece: piece.id,
      depuisEntite: 'documents',
      depuisId: document,
    });
    assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps));

    const apres = await enBase(
      'select count(*)::text as n, coalesce(sum(taille_octets), 0)::text as o from pieces_jointes',
    );
    assert.deepEqual(
      apres[0],
      avant[0],
      'RÉUTILISER A DÉPOSÉ : le compte de pièces ou le volume a bougé. C’est précisément ce que ' +
        '19.4 existe pour empêcher — cinq exemplaires de la même procédure, et quatre chances ' +
        'd’en oublier une le jour où elle change.',
    );
    assert.deepEqual(await porteursDe(piece.id), [`documents/${document}`, `mesures/${mesure}`]);
  });

  test('LA MÊME preuve se liste et se délivre DES DEUX côtés', async () => {
    for (const [entite, identifiant] of [
      ['documents', document],
      ['mesures', mesure],
    ]) {
      const liste = await serveur.appeler('GET', `/api/pieces/${entite}/${identifiant}`);
      assert.equal(liste.statut, 200);
      assert.deepEqual(
        liste.corps.pieces.map((p) => p.id),
        [piece.id],
        `la preuve doit figurer sur l’écran de ${entite}`,
      );
      // ⚠️ L'écran doit SAVOIR qu'elle sert ailleurs, sinon « Supprimer » ment.
      assert.equal(
        liste.corps.pieces[0].autres_porteurs.length,
        1,
        'la liste doit dire que la pièce sert un autre porteur : sans cela, l’écran annoncerait ' +
          'une suppression qui n’a pas lieu (classe Q-201 / Q-207).',
      );
      const lecture = await serveur.appeler(
        'GET',
        `/api/pieces/${entite}/${identifiant}/${piece.id}`,
      );
      assert.equal(lecture.statut, 200, `la preuve doit se délivrer depuis ${entite}`);
    }
  });

  test('UN SECOND CLIC n’est pas une erreur, et ne crée pas de doublon', async () => {
    const encore = await reutiliser('mesures', mesure, {
      piece: piece.id,
      depuisEntite: 'documents',
      depuisId: document,
    });
    assert.equal(encore.statut, 200);
    assert.equal(encore.corps.deja_rattache, true);
    assert.equal((await porteursDe(piece.id)).length, 2);
  });

  test('ON NE RÉUTILISE PAS CE QU’ON NE POURRAIT PAS TÉLÉCHARGER', async () => {
    const autre = await creer('mesures', { nom: 'Contrôle témoin' });
    const leurre = await creer('documents', { titre: 'Document leurre' });
    // La pièce existe, mais pas sous CE porteur d'origine-là : un identifiant
    // deviné ne suffit pas. C'est la même exigence que la délivrance (§31.3) —
    // l'URL doit être cohérente avec ce qu'elle prétend désigner.
    const refus = await reutiliser('mesures', autre, {
      piece: piece.id,
      depuisEntite: 'documents',
      depuisId: leurre,
    });
    assert.equal(refus.statut, 404, JSON.stringify(refus.corps));
    assert.equal((await porteursDe(piece.id)).length, 2);
  });

  test('LE DROIT SE VÉRIFIE SUR LES DEUX PORTEURS, pas seulement sur la destination', async () => {
    // ⚠️ C'est la seule route du produit qui met en jeu DEUX domaines
    // fonctionnels, et le crochet d'accès n'en tranche qu'un — celui de l'URL.
    // Sans le contrôle que la route ajoute, un profil privé du domaine
    // « documents » lirait la PSSI par la bande, depuis l'écran d'un contrôle.
    const sansDocuments = Object.freeze({
      niveau: 'administration',
      domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'documents'),
      export: true,
    });
    const cible = await creer('mesures', { nom: 'Contrôle sans droit documentaire' });
    session.poser(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), sansDocuments);
    try {
      const refus = await reutiliser('mesures', cible, {
        piece: piece.id,
        depuisEntite: 'documents',
        depuisId: document,
      });
      assert.equal(
        refus.statut,
        403,
        'Un profil sans le domaine « documents » a pu rattacher une pièce déposée sur un ' +
          'document : la lecture fermée de face s’obtient par la bande.',
      );
    } finally {
      session.poser(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), TOUS_DROITS);
    }
  });

  test('DÉTACHER n’est pas SUPPRIMER : le fichier reste tant qu’un porteur sert', async () => {
    const detachement = await serveur.appeler(
      'DELETE',
      `/api/pieces/documents/${document}/${piece.id}`,
    );
    assert.equal(detachement.statut, 204);

    assert.equal(
      await existe(piece.disque),
      true,
      'LE FICHIER A ÉTÉ LIBÉRÉ TROP TÔT : le contrôle qui invoque cette procédure délivrerait ' +
        'un octet manquant.',
    );
    assert.deepEqual(await porteursDe(piece.id), [`mesures/${mesure}`]);
    // L'adresse de délivrance a suivi : sans cela, l'URL désignerait un porteur
    // que la pièce ne sert plus.
    const adresse = await adresseDe(piece.id);
    assert.equal(adresse.entite_type, 'mesures');
    assert.equal(adresse.entite_id, mesure);
    assert.equal(
      (await serveur.appeler('GET', `/api/pieces/mesures/${mesure}/${piece.id}`)).statut,
      200,
    );
    assert.equal(
      (await serveur.appeler('GET', `/api/pieces/documents/${document}/${piece.id}`)).statut,
      404,
      'La preuve ne doit plus se délivrer depuis le porteur dont on l’a détachée.',
    );
    assert.equal(await fileDePurge(), 0, 'Un détachement ne met RIEN dans la file de purge.');
  });

  test('LE DERNIER DÉTACHEMENT libère : ligne, fichier, délivrance, file vide', async () => {
    const dernier = await serveur.appeler('DELETE', `/api/pieces/mesures/${mesure}/${piece.id}`);
    assert.equal(dernier.statut, 204);

    assert.equal(await adresseDe(piece.id), null, 'LIGNE ORPHELINE : la pièce est restée en base.');
    assert.equal(await existe(piece.disque), false, 'FICHIER RÉSIDUEL : le magasin garde le fichier.');
    assert.deepEqual(await porteursDe(piece.id), []);
    assert.equal(
      (await serveur.appeler('GET', `/api/pieces/mesures/${mesure}/${piece.id}`)).statut,
      404,
    );
    assert.equal(await fileDePurge(), 0);
  });

  test('LE JOURNAL DIT CE QUI S’EST PASSÉ : un détachement n’est pas une suppression', async () => {
    const lignes = await enBase(
      "select action, resume from journal_audit where entite_id = $1 and action in " +
        "('suppression', 'modification') order by numero",
      [piece.id],
    );
    const resumes = lignes.map((l) => l.resume);
    assert.ok(
      resumes.some((r) => r.startsWith('Détachement')),
      'Le détachement doit s’inscrire POUR CE QU’IL EST. L’appeler « suppression » écrirait une ' +
        'fausse accusation de plus dans un registre qui ne s’efface pas — classe Q-301.\n' +
        `  Trouvé : ${resumes.join(' · ')}`,
    );
    assert.ok(
      resumes.some((r) => r.startsWith('Suppression')),
      `Le retrait du dernier rattachement doit s’inscrire comme une suppression. Trouvé : ${resumes.join(' · ')}`,
    );
  });
});

/* =====================================================================
 *  §2 — LES SIX CHEMINS DE CASCADE
 * ===================================================================== */

describe('19.4 — sur CHAQUE chemin de cascade, la preuve partagée survit puis se libère', () => {
  test('LA MATIÈRE : les chemins sont DÉRIVÉS du schéma, jamais récités', async () => {
    const cascades = await cascadesDuSchema();
    // Six au 16/09/2026 — clients→exigences, exigences/risques/evaluations/incidents→actions,
    // scenarios_pra→tests_pra. Le nombre n'est pas gardé : ce qui est gardé, c'est
    // qu'il y en ait. Un balayage qui ne balaie rien rend « aucun défaut »
    // exactement comme un produit sain (motif Q-210).
    assert.ok(
      cascades.length >= 6,
      `Seulement ${String(cascades.length)} cascade(s) découverte(s) : le prédicat ne reconnaît ` +
        'plus le schéma, et le balayage ci-dessous ne mesurerait plus rien.',
    );
  });

  test('CHAQUE cascade : la preuve réutilisée CHANGE D’ADRESSE au lieu de mourir', async () => {
    /* ⚠️ **Le balayage se borne aux enfants qui PEUVENT porter une pièce.** La
     * route de dépôt n'accepte qu'une **entité du registre** — la liste est DÉRIVÉE
     * de `DOMAINE_PAR_ENTITE` —, et trois enfants de cascade n'en sont pas :
     * `evenements_sortants`, `collectes`, `portail_liens`. Ce sont des files et des
     * preuves, auxquelles aucune pièce jointe ne se rattache.
     *
     * ⚠️ **L'exclusion est MESURÉE dans `test/pieces/orphelines.test.mjs`**, qui
     * demande à la route d'accepter un dépôt sur chacune et exige le refus : une
     * entité oubliée du registre sortirait sinon du filet **en silence**. */
    modeleEntites ??= (await serveur.appeler('GET', '/api/modele')).corps.entites;
    const cascades = (await cascadesDuSchema()).filter(
      (c) => modeleEntites[c.enfant] !== undefined,
    );
    const echecs = [];

    for (const { parent, enfant, colonne } of cascades) {
      // Le second porteur est choisi HORS du chemin éprouvé, pour que la cascade
      // ne l'emporte pas elle aussi — sinon l'essai mesurerait « tout a disparu »
      // et passerait pour la mauvaise raison.
      const secondType = enfant === 'documents' || parent === 'documents' ? 'risques' : 'documents';
      const idParent = await creerAvecParents(parent, cascades);
      // ⚠️ Un enfant peut nommer le même parent par PLUSIEURS colonnes — voir
      // `colonnesVersLeMemeParent`. Chacune reçoit un parent DISTINCT.
      const rattachements = { [colonne]: idParent };
      for (const autre of colonnesVersLeMemeParent(cascades, parent, enfant)) {
        if (autre !== colonne) rattachements[autre] = await creerAvecParents(parent, cascades);
      }
      const idEnfant = await creerAvecParents(enfant, cascades, rattachements);
      const idSecond = await creer(secondType);
      const piece = await deposerSur(enfant, idEnfant, `partagee-${enfant}.pdf`);

      const rattachement = await reutiliser(secondType, idSecond, {
        piece: piece.id,
        depuisEntite: enfant,
        depuisId: idEnfant,
      });
      assert.equal(rattachement.statut, 201, `${enfant} → ${secondType} : ${JSON.stringify(rattachement.corps)}`);

      const suppression = await serveur.appeler('DELETE', `/api/entites/${parent}/${idParent}?version=1`);
      assert.equal(suppression.statut, 200, `${parent} : ${JSON.stringify(suppression.corps)}`);

      try {
        // L'enfant DOIT avoir disparu, sans quoi on mesurerait l'absence de cascade.
        const restes = await enBase('select count(*)::text as n from ' + enfant + ' where id = $1', [
          idEnfant,
        ]);
        assert.equal(restes[0].n, '0', `la cascade ${parent} → ${enfant} n’a pas eu lieu`);

        assert.equal(
          await existe(piece.disque),
          true,
          'LE FICHIER A ÉTÉ LIBÉRÉ PAR LA CASCADE : la preuve que le second porteur invoque a ' +
            'disparu du magasin.',
        );
        assert.deepEqual(await porteursDe(piece.id), [`${secondType}/${idSecond}`]);
        const adresse = await adresseDe(piece.id);
        assert.equal(adresse?.entite_type, secondType, 'l’adresse de délivrance doit avoir suivi');
        assert.equal(adresse?.entite_id, idSecond);
        assert.equal(
          adresse?.en_vigueur,
          false,
          '« Faire foi » est une propriété du COUPLE pièce-porteur : elle ne se transmet pas au ' +
            'porteur suivant.',
        );
        assert.equal(
          (await serveur.appeler('GET', `/api/pieces/${secondType}/${idSecond}/${piece.id}`)).statut,
          200,
          'la preuve doit rester délivrable depuis le porteur qui la sert encore',
        );
        assert.equal(await fileDePurge(), 0);

        // ── Puis le DERNIER porteur : là, et là seulement, le fichier part ────
        const dernier = await serveur.appeler(
          'DELETE',
          `/api/entites/${secondType}/${idSecond}?version=1`,
        );
        assert.equal(dernier.statut, 200, JSON.stringify(dernier.corps));
        assert.equal(
          await adresseDe(piece.id),
          null,
          'LIGNE ORPHELINE : la pièce a survécu à son dernier porteur.',
        );
        assert.equal(
          await existe(piece.disque),
          false,
          'FICHIER RÉSIDUEL : le dernier porteur a disparu et le fichier est resté dans le magasin.',
        );
        assert.equal(await fileDePurge(), 0);
      } catch (erreur) {
        echecs.push(`${parent} → ${enfant} (${colonne}) : ${erreur.message}`);
      }
    }

    assert.deepEqual(
      echecs,
      [],
      'Des chemins de cascade traitent mal une preuve partagée :\n  · ' + echecs.join('\n  · '),
    );
  });
});

/* =====================================================================
 *  §3 — LE CLOISONNEMENT ET LE GARDE-FOU
 * ===================================================================== */

describe('19.4 — le cloisonnement et l’invariant', () => {
  test('ON NE RÉUTILISE PAS LA PIÈCE D’UNE AUTRE FILIALE', async () => {
    // La pièce est déposée dans B ; la session travaille dans A et LIT les deux.
    // Elle la voit donc — et ne peut pas la rattacher : `pol_piece_rattachements_ajout`
    // exige la filiale ACTIVE. Une réutilisation inter-filiales créerait une preuve
    // dont le retrait dépend d'un geste qu'on ne peut pas faire.
    try {
      session.poser(perimetreDe('admin.grc', FILIALE_B, [FILIALE_A, FILIALE_B]), TOUS_DROITS);
      const documentB = await creer('documents', { titre: 'Politique de B' });
      const pieceB = await deposerSur('documents', documentB, 'politique-b.pdf', FILIALE_B);

      session.poser(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A, FILIALE_B]), TOUS_DROITS);
      const mesureA = await creer('mesures', { nom: 'Contrôle de A' });
      const refus = await reutiliser('mesures', mesureA, {
        piece: pieceB.id,
        depuisEntite: 'documents',
        depuisId: documentB,
      });
      assert.notEqual(
        refus.statut,
        201,
        'La pièce d’une autre filiale a été rattachée : c’est une fuite entre filiales.',
      );
      const porteurs = await enBase(
        'select entite_type, entite_id from piece_rattachements where piece_id = $1',
        [pieceB.id],
        FILIALE_B,
      );
      assert.equal(porteurs.length, 1, 'la pièce de B ne doit servir que le porteur de B');
    } finally {
      // ⚠️ La session est un ÉTAT PARTAGÉ entre les essais du fichier : la laisser
      // sur B ferait échouer les suivants pour une raison qui n'est pas la leur —
      // c'est ce qui vient d'arriver, et le diagnostic a coûté un passage.
      session.poser(perimetreDe('admin.grc', FILIALE_A, [FILIALE_A]), TOUS_DROITS);
    }
  });

  test('LA SECONDE BARRIÈRE : sans la réadresse, la base REFUSE plutôt que de détruire', async () => {
    // ── ⚠️ CE QUE CET ESSAI A COÛTÉ, ET POURQUOI IL EXISTE ────────────────
    //
    // La première rédaction de cette famille croyait éprouver la clause
    // `not exists (… piece_rattachements …)` du déclencheur. **Mutation jouée,
    // banc VERT** : la clause n'était jamais le filtre discriminant, parce que
    // la réadresse (`trg_piece_rattachements_retrait`) sort la pièce du champ
    // avant qu'on y arrive. C'est le motif exact du constat Q-210 — *un essai
    // qui couvre une règle sans jamais la faire décider ne la couvre pas*.
    //
    // La clause n'est pas morte pour autant : c'est la barrière **fail-closed**
    // du dispositif. Le jour où la réadresse manque — déclencheur désarmé,
    // migration incomplète —, elle fait REFUSER la suppression au lieu de
    // laisser détruire une preuve que quatre contrôles invoquent. On la fait
    // donc décider, en retirant la première barrière.
    const document = await creer('documents', { titre: 'Preuve à deux barrières' });
    const mesure = await creer('mesures', { nom: 'Contrôle à deux barrières' });
    const piece = await deposerSur('documents', document, 'deux-barrieres.pdf');
    const rattachement = await reutiliser('mesures', mesure, {
      piece: piece.id,
      depuisEntite: 'documents',
      depuisId: document,
    });
    assert.equal(rattachement.statut, 201, JSON.stringify(rattachement.corps));

    // ⚠️ Tout se joue dans une transaction ANNULÉE, et le déclencheur est remis
    // par l'annulation elle-même : le DDL est transactionnel, et « réparer dans
    // un finally » laisse l'état de côté le jour où l'assertion lève (leçon du
    // 11/09, et du déclencheur laissé désarmé sur la recette au 10/09).
    const proprietaire = await base.connexion('proprietaire');
    let verdict;
    try {
      await proprietaire.query('begin');
      await proprietaire.query(
        'alter table piece_rattachements disable trigger trg_piece_rattachements_retrait',
      );
      await proprietaire.query("select set_config('grc.authentification', 'oui', true)");
      await proprietaire.query("select set_config('grc.utilisateur', 'morsure', true)");
      await proprietaire.query("select set_config('grc.filiale_id', $1, true)", [FILIALE_A]);
      await proprietaire.query("select set_config('grc.filiales', $1, true)", [FILIALE_A]);
      try {
        await proprietaire.query('delete from documents where id = $1', [document]);
        verdict = { refus: false, code: null };
      } catch (erreur) {
        verdict = { refus: true, code: erreur.code };
      }
    } finally {
      await proprietaire.query('rollback').catch(() => undefined);
      proprietaire.release?.();
    }

    assert.equal(
      verdict.refus,
      true,
      'LA SECONDE BARRIÈRE EST TOMBÉE : sans la réadresse, supprimer le document a DÉTRUIT une ' +
        'preuve que le contrôle invoque encore — en silence, et sans que rien ne refuse. La ' +
        'clause « not exists (… piece_rattachements …) » du déclencheur est ce qui tient ce ' +
        'cas : elle ne supprime que ce qui ne sert plus rien, et la ceinture GRC05 refuse le ' +
        'reste plutôt que de laisser une orpheline (constats Q-232 / Q-233).',
    );
    assert.equal(verdict.code, 'GRC05', `refus attendu en GRC05, obtenu ${String(verdict.code)}`);

    // La base n'a pas bougé : la transaction a été annulée.
    assert.deepEqual(await porteursDe(piece.id), [`documents/${document}`, `mesures/${mesure}`]);
    assert.deepEqual(await anomaliesDeLInvariant(), []);
  });

  test('LE GARDE-FOU NE REND AUCUNE LIGNE, et il est joué par f_verifier_schema()', async () => {
    assert.deepEqual(await anomaliesDeLInvariant(), []);
    const branche = await enBase(
      "select count(*)::text as n from controles_schema where fonction = 'f_verifier_rattachements_pieces'",
    );
    assert.equal(
      branche[0].n,
      '1',
      'Le garde-fou n’est pas au registre : un contrôle que rien n’appelle est un commentaire.',
    );
  });

  test('L’INVARIANT EST IMPOSÉ : retirer le rattachement d’origine est REFUSÉ par la base', async () => {
    // ── ⚠️ CE QUE CET ESSAI MESURE, ET CE QU'IL A CORRIGÉ ────────────────
    //
    // La première rédaction de 19.4 SURVEILLAIT l'invariant : un garde-fou
    // comptait les pièces délivrées à une adresse qu'elles ne servaient plus. Il
    // mesurait juste, et il était faux pour une autre raison — il lisait une
    // table cloisonnée, et `install.sh` appelle `f_verifier_schema()` SANS
    // périmètre : le contrôle levait `GRC04` au lieu de rendre son verdict.
    //
    // La propriété a été déplacée dans le schéma (`fk_pieces_jointes_adresse`,
    // différée). Elle n'est donc plus constatée après coup : elle est
    // **impossible à enfreindre**, y compris depuis `psql`. C'est ce que mesure
    // cet essai — et c'est un cran de plus que ce que 19.4 demandait.
    const document = await creer('documents', { titre: 'Témoin d’invariant' });
    const mesure = await creer('mesures', { nom: 'Contrôle témoin d’invariant' });
    const piece = await deposerSur('documents', document, 'invariant.pdf');
    assert.equal(
      (
        await reutiliser('mesures', mesure, {
          piece: piece.id,
          depuisEntite: 'documents',
          depuisId: document,
        })
      ).statut,
      201,
    );

    const proprietaire = await base.connexion('proprietaire');
    let verdict;
    try {
      await proprietaire.query('begin');
      await proprietaire.query(
        'alter table piece_rattachements disable trigger trg_piece_rattachements_retrait',
      );
      await proprietaire.query("select set_config('grc.authentification', 'oui', true)");
      await proprietaire.query("select set_config('grc.utilisateur', 'morsure', true)");
      await proprietaire.query("select set_config('grc.filiale_id', $1, true)", [FILIALE_A]);
      await proprietaire.query("select set_config('grc.filiales', $1, true)", [FILIALE_A]);
      try {
        // Sans la réadresse, retirer le rattachement d'origine laisserait la pièce
        // délivrée à une adresse qu'elle ne sert plus. La clé étrangère différée
        // refuse — AU COMMIT, c'est-à-dire au seul moment où la question a un sens.
        await proprietaire.query(
          'delete from piece_rattachements where piece_id = $1 and entite_type = $2 and entite_id = $3',
          [piece.id, 'documents', document],
        );
        await proprietaire.query('commit');
        verdict = { refus: false, contrainte: null };
      } catch (erreur) {
        verdict = { refus: true, contrainte: erreur.constraint };
      }
    } finally {
      await proprietaire.query('rollback').catch(() => undefined);
      proprietaire.release?.();
    }

    assert.equal(
      verdict.refus,
      true,
      'L’INVARIANT N’EST PLUS IMPOSÉ : une pièce peut être délivrée à une adresse qu’elle ne ' +
        'sert plus. La suppression de ce porteur cesserait alors de la retirer — Q-232 et ' +
        'Q-233 rouverts, par la porte que 19.4 a ouverte.',
    );
    assert.equal(verdict.contrainte, 'fk_pieces_jointes_adresse');
    assert.deepEqual(await porteursDe(piece.id), [`documents/${document}`, `mesures/${mesure}`]);
  });

  test('LA MORSURE : retirer l’invariant du schéma fait rougir le garde-fou', async () => {
    // ⚠️ Mutation jouée dans une transaction ANNULÉE (leçon du 11/09) : muter puis
    // « réparer dans un finally » laisse l'état de côté le jour où l'assertion lève,
    // et c'est ainsi qu'un déclencheur est resté désarmé sur la recette le 10/09.
    const proprietaire = await base.connexion('proprietaire');
    let anomalies;
    try {
      await proprietaire.query('begin');
      await proprietaire.query(
        'alter table pieces_jointes drop constraint fk_pieces_jointes_adresse',
      );
      anomalies = (
        await proprietaire.query('select objet, anomalie from f_verifier_rattachements_pieces()')
      ).rows;
    } finally {
      await proprietaire.query('rollback').catch(() => undefined);
      proprietaire.release?.();
    }

    assert.ok(
      anomalies.some((a) => a.anomalie === 'invariant_adresse_absent'),
      'LE GARDE NE MORD PAS : la clé qui porte tout le dispositif peut disparaître sous ' +
        'zéro anomalie. C’est le motif du constat Q-312 — une barrière écrite, et gardée ' +
        `par personne.\n  Rendu : ${JSON.stringify(anomalies)}`,
    );
    assert.deepEqual(await anomaliesDeLInvariant(), []);
  });
});
