/**
 * transaction.test.mjs — **tout ou rien, et la morsure qui le prouve.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier mesure, et pourquoi c'est le contrôle central du lot
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le constat bloquant **B-3** de la porte S2 est né d'un import qui était une
 * rafale d'écritures indépendantes : une coupure au milieu laissait la filiale à
 * moitié détruite. Un banc qui vérifierait seulement « 250 lignes importées »
 * ne dirait rien de ce défaut-là.
 *
 * La morsure est donc jouée **dans les deux sens**, et deux fois :
 *
 *  1. **L'aperçu** écrit VRAIMENT les 250 lignes puis annule sa transaction. Il
 *     rend 250 créations, et la base en contient **zéro**. C'est la coupure
 *     après la dernière ligne.
 *  2. **La rupture au milieu** est fabriquée par une contrainte que PostgreSQL
 *     ne peut heurter **que si les lignes précédentes ont réellement été
 *     écrites** : la ligne 201 répète la clé `(filiale, référentiel, code)` de la
 *     ligne 6. Ce doublon n'existe pas en base avant l'import — il n'apparaît
 *     qu'au sein de la transaction. Le `23505` prouve donc que 199 lignes
 *     étaient physiquement là ; le compte à zéro après coup prouve qu'aucune
 *     n'a survécu.
 *
 * Et le sens inverse, sans lequel les deux premiers ne prouveraient rien : le
 * **même fichier corrigé** écrit ses 250 lignes et elles y restent.
 */

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { csvEssai, monterImport, perimetreDe, SessionDEssai, xlsxEssai } from './aide.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');

const TOUS_DROITS = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});
const LECTEUR = Object.freeze({ niveau: 'lecture', domaines: TOUS_LES_DOMAINES, export: false });

const VOLUME = 250;

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

/**
 * Lit en base **sous périmètre**.
 *
 * ⚠️ Sans cela rien ne remonte, et c'est une propriété du produit, pas un défaut
 * du banc : les tables métier portent `force row level security`.
 */
async function enBase(sql, parametres = [], filiale = FILIALE_A) {
  return base.avecPerimetre(
    applicatif,
    perimetre('banc', filiale, [filiale]),
    async (client) => (await client.query(sql, parametres)).rows,
  );
}

const compter = async (sql, parametres = [], filiale = FILIALE_A) =>
  Number((await enBase(sql, parametres, filiale))[0].n);

const compterEvaluations = (prefixe = 'C') =>
  compter(`select count(*)::int as n from evaluations where code like $1`, [`${prefixe}-%`]);

const effacerEvaluations = (prefixe) =>
  base.avecPerimetre(
    applicatif,
    perimetre('banc', FILIALE_A, [FILIALE_A]),
    async (client) => client.query(`delete from evaluations where code like $1`, [`${prefixe}-%`]),
    { annuler: false },
  );

const compterIncidents = () =>
  compter(`select count(*)::int as n from incidents where titre like 'Incident %'`);

/* =====================================================================
 *  Fabriques de fichiers
 * ===================================================================== */

/**
 * 250 évaluations, `anssi/C-001` à `C-250`.
 *
 * @param {{doublonEn?: number}} [options] `doublonEn` : numéro de LIGNE DE
 *   TABLEUR dont le code est remplacé par celui de la ligne 6 — la rupture au
 *   milieu, cf. l'entête.
 */
function fichierEvaluations({ doublonEn, prefixe = 'C' } = {}) {
  const lignes = [['Référentiel (code)', 'Code', 'Statut', 'Commentaire']];
  for (let index = 1; index <= VOLUME; index += 1) {
    const ligneTableur = index + 1;
    const code =
      ligneTableur === doublonEn
        ? `${prefixe}-005`
        : `${prefixe}-${String(index).padStart(3, '0')}`;
    lignes.push(['anssi', code, '', `Reprise filiale rachetée ${String(index)}`]);
  }
  return csvEssai(lignes);
}

/** 250 incidents, dont `fausses` lignes délibérément mauvaises. */
function fichierIncidents(fausses = new Map()) {
  const lignes = [['Titre', 'Gravité', 'Statut', 'Date de détection']];
  for (let index = 1; index <= VOLUME; index += 1) {
    const ligneTableur = index + 1;
    const defaut = fausses.get(ligneTableur);
    lignes.push(
      defaut ?? [`Incident ${String(index).padStart(3, '0')}`, 'faible', 'nouveau', '2026-03-14'],
    );
  }
  return csvEssai(lignes);
}

/* =====================================================================
 *  1. La morsure — l'aperçu écrit puis défait
 * ===================================================================== */

describe('Tout ou rien — sens 1 : ce qui est écrit puis annulé ne subsiste pas', () => {
  test('un aperçu de 250 lignes en annonce 250, et la base en contient zéro', async () => {
    assert.equal(await compterEvaluations(), 0, 'la base doit être vierge avant la mesure');

    const reponse = await serveur.importer('evaluations', {
      nom: 'evaluations-filiale-rachetee.csv',
      contenu: fichierEvaluations(),
    });

    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.lues, VOLUME);
    // ⚠️ Le chiffre vient d'écritures RÉELLES : l'aperçu applique, puis annule.
    assert.equal(reponse.corps.creees, VOLUME);
    assert.equal(reponse.corps.applique, false);
    assert.equal(reponse.corps.apercu, true);

    assert.equal(await compterEvaluations(), 0, 'l’aperçu ne doit RIEN laisser en base');
    // Et pas davantage de trace d'import « appliqué ».
    assert.equal(
      await compter(`select count(*)::int as n from imports where statut = 'applique'`),
      0,
    );
  });

  test('le même fichier, appliqué, écrit ses 250 lignes et elles y restent', async () => {
    const reponse = await serveur.importer(
      'evaluations',
      { nom: 'evaluations-filiale-rachetee.csv', contenu: fichierEvaluations() },
      { appliquer: true },
    );

    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.applique, true);
    assert.equal(reponse.corps.creees, VOLUME);
    assert.equal(reponse.corps.misesAJour, 0);
    assert.equal(await compterEvaluations(), VOLUME);

    // Les valeurs sont bien celles du fichier, pas des coquilles vides.
    const [echantillon] = await enBase(
      `select "ref_id", "code", "commentaire" from evaluations where code = 'C-042'`,
    );
    assert.equal(echantillon.ref_id, 'anssi');
    assert.equal(echantillon.commentaire, 'Reprise filiale rachetée 42');

    // Nettoyage : la suite mesure une base vierge de ces lignes.
    await effacerEvaluations('C');
    assert.equal(await compterEvaluations(), 0);
  });

  test('supprimer les lignes à la main ne « déconsomme » pas le fichier — et c’est dit', async () => {
    // ⚠️ Le fichier a été appliqué, ses lignes ont été effacées à la main : le
    // réimporter ne les recrée PAS. L'idempotence porte sur le fichier, pas sur
    // l'état de la base (`CONVENTIONS.md` §33.2). C'est une limite réelle, et
    // elle est mesurée plutôt que découverte en exploitation.
    const reponse = await serveur.importer(
      'evaluations',
      { nom: 'evaluations-filiale-rachetee.csv', contenu: fichierEvaluations() },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.dejaImporte, true);
    assert.equal(reponse.corps.creees, 0);
    assert.match(reponse.corps.message, /déjà été importé/u);
    assert.equal(await compterEvaluations(), 0);
  });
});

/* =====================================================================
 *  2. La morsure — la rupture AU MILIEU
 * ===================================================================== */

describe('Tout ou rien — sens 2 : une rupture au milieu ne laisse aucune ligne', () => {
  test('la ligne 201 heurte une clé posée par la ligne 6 : 199 lignes étaient là, zéro subsiste', async () => {
    assert.equal(await compterEvaluations('D'), 0);

    const reponse = await serveur.importer(
      'evaluations',
      {
        nom: 'evaluations-doublon.csv',
        contenu: fichierEvaluations({ doublonEn: 201, prefixe: 'D' }),
      },
      { appliquer: true },
    );

    // ⚠️ Le refus porte SUR LA LIGNE 201, et sur elle seule. Cette contrainte
    // ne peut être heurtée que par une ligne présente dans la transaction :
    // aucune évaluation « C-005 » n'existait en base avant l'import. C'est la
    // preuve que les 199 lignes précédentes avaient bien été écrites.
    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.enErreur, 1);
    assert.equal(reponse.corps.erreurs.length, 1);
    assert.equal(reponse.corps.erreurs[0].ligne, 201);
    assert.equal(reponse.corps.applique, false);

    // Et le compte, après coup : aucune des 249 lignes valides ne survit.
    assert.equal(await compterEvaluations('D'), 0, 'une rupture au milieu ne doit RIEN laisser');
  });

  test('le même fichier corrigé passe entièrement — la mesure vaut dans les deux sens', async () => {
    const reponse = await serveur.importer(
      'evaluations',
      { nom: 'evaluations-corrige.csv', contenu: fichierEvaluations({ prefixe: 'D' }) },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.creees, VOLUME);
    assert.equal(await compterEvaluations('D'), VOLUME);

    await effacerEvaluations('D');
  });
});

/* =====================================================================
 *  3. Le rapport ligne par ligne
 * ===================================================================== */

describe('27 lignes fausses sur 250 : le rapport dit LESQUELLES', () => {
  /**
   * Vingt-sept défauts, de trois natures qui ne sont pas décelées au même
   * endroit — c'est le point : le rapport doit être homogène quelle que soit la
   * couche qui refuse.
   */
  function vingtSeptDefauts() {
    const fausses = new Map();
    // 9 valeurs refusées par le SCHÉMA (liste fermée `ck_incidents_gravite`).
    for (let index = 0; index < 9; index += 1) {
      fausses.set(10 + index, [`Incident faux ${String(index)}`, 'catastrophique', 'nouveau', '2026-03-14']);
    }
    // 9 dates refusées par la CONVERSION (le 31 février n'existe pas).
    for (let index = 0; index < 9; index += 1) {
      fausses.set(60 + index, [`Incident daté ${String(index)}`, 'faible', 'nouveau', '31/02/2026']);
    }
    // 9 titres manquants — obligatoire absent, refusé avant toute écriture.
    for (let index = 0; index < 9; index += 1) {
      fausses.set(120 + index, ['', 'faible', 'nouveau', '2026-03-14']);
    }
    return fausses;
  }

  test('27 erreurs nommées, avec leur numéro de ligne, et pas une ligne écrite', async () => {
    const avant = await compterIncidents();
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'incidents-250.csv', contenu: fichierIncidents(vingtSeptDefauts()) },
      { appliquer: true },
    );

    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps).slice(0, 600));
    assert.equal(reponse.corps.lues, VOLUME);
    assert.equal(reponse.corps.enErreur, 27);
    assert.equal(reponse.corps.erreurs.length, 27);

    const lignes = reponse.corps.erreurs.map((e) => e.ligne);
    const attendues = [...vingtSeptDefauts().keys()].sort((a, b) => a - b);
    // ⚠️ **Déjà triées par numéro de ligne** : c'est dans cet ordre qu'on corrige
    // un fichier. Les refus de conversion sont collectés avant ceux de la base,
    // et sans tri la ligne 10 s'affichait après la ligne 60.
    assert.deepEqual(lignes, attendues, 'le rapport doit être trié par ligne');

    // Chaque erreur nomme LA COLONNE du fichier — y compris celles que seule la
    // base refuse, dont la contrainte est traduite en colonne par le catalogue.
    const parLigne = new Map(reponse.corps.erreurs.map((e) => [e.ligne, e]));
    assert.equal(parLigne.get(10).colonne, 'Gravité', 'refus du schéma : colonne nommée');
    assert.equal(parLigne.get(60).colonne, 'Date de détection');
    assert.equal(parLigne.get(120).colonne, 'Titre');

    // Chaque erreur PORTE UN MESSAGE, et aucun ne laisse fuir PostgreSQL.
    for (const erreur of reponse.corps.erreurs) {
      assert.ok(erreur.message.length > 10, JSON.stringify(erreur));
      assert.ok(
        !/relation|column|constraint|ck_incidents|pg_|SQLSTATE/iu.test(erreur.message),
        `message trop bavard : ${erreur.message}`,
      );
    }
    // Les trois natures de défaut se distinguent dans le rapport.
    const messages = reponse.corps.erreurs.map((e) => e.message).join(' | ');
    assert.match(messages, /obligatoire/u);
    assert.match(messages, /date/iu);

    // ⚠️ Et surtout : rien n'a été écrit.
    assert.equal(await compterIncidents(), avant);
  });

  test('le refus laisse une trace consultable — statut « échoué », erreurs ligne à ligne', async () => {
    const [trace] = await enBase(
      `select "id", "statut", "lignes_lues", "lignes_en_erreur", "cle_idempotence", "nom_fichier"
         from imports where nom_fichier = 'incidents-250.csv' order by debut_le desc limit 1`,
    );
    assert.equal(trace.statut, 'echoue');
    assert.equal(trace.lignes_lues, VOLUME);
    assert.equal(trace.lignes_en_erreur, 27);
    // ⚠️ Un refus ne CONSOMME pas le fichier : la clé d'idempotence reste nulle,
    // sans quoi l'utilisateur ne pourrait plus réimporter le fichier corrigé.
    assert.equal(trace.cle_idempotence, null);

    const erreurs = await enBase(
      `select "ligne", "colonne", "message" from import_erreurs where import_id = $1 order by ligne`,
      [trace.id],
    );
    assert.equal(erreurs.length, 27);
    assert.equal(erreurs[0].ligne, 10);
  });

  test('quand TOUT est faux, le compte reste exact et le détail reste borné', async () => {
    // ⚠️ Le détail est borné à 200 entrées ; le COMPTE ne l'est pas. Les deux
    // ont été confondus une fois : la liste étant triée par numéro de ligne, un
    // marqueur de troncature glissé dedans se retrouvait en tête et chassait les
    // vraies erreurs de la fenêtre rendue.
    const toutes = new Map();
    for (let ligne = 2; ligne <= VOLUME + 1; ligne += 1) {
      toutes.set(ligne, [`Incident tout faux ${String(ligne)}`, 'catastrophique', 'nouveau', '']);
    }
    const avant = await compterIncidents();
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'tout-faux.csv', contenu: fichierIncidents(toutes) },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 409);
    assert.equal(reponse.corps.enErreur, VOLUME, 'le compte porte les 250 lignes');
    assert.equal(reponse.corps.erreurs.length, 200, 'le détail est borné à 200');
    assert.match(reponse.corps.message, /250 ligne\(s\)/u);
    assert.match(reponse.corps.message, /200 premières/u);
    // Le détail commence bien à la PREMIÈRE ligne fausse, pas à un marqueur.
    assert.equal(reponse.corps.erreurs[0].ligne, 2);
    assert.equal(await compterIncidents(), avant);

    const [trace] = await enBase(
      `select "lignes_en_erreur" from imports where nom_fichier = 'tout-faux.csv'`,
    );
    assert.equal(trace.lignes_en_erreur, VOLUME);
  });

  test('une ligne vide est comptée comme ignorée, jamais comme un enregistrement', async () => {
    const contenu = csvEssai([
      ['Titre', 'Gravité'],
      ['Incident vide-1', 'faible'],
      ['', ''],
      ['Incident vide-2', 'faible'],
    ]);
    const reponse = await serveur.importer('incidents', { nom: 'trous.csv', contenu });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.lues, 3);
    assert.equal(reponse.corps.ignorees, 1);
    assert.equal(reponse.corps.creees, 2);
  });

  test('une colonne inconnue est SIGNALÉE plutôt qu’avalée en silence', async () => {
    const contenu = csvEssai([
      ['Titre', 'Coût estimé'],
      ['Incident colonne-en-trop', '12000'],
    ]);
    const reponse = await serveur.importer('incidents', { nom: 'colonne.csv', contenu });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.deepEqual(reponse.corps.colonnesInconnues, ['Coût estimé']);
  });

  test('une obligatoire absente du fichier est dite UNE fois, pas 250 fois', async () => {
    const lignes = [['Gravité', 'Statut']];
    for (let index = 0; index < 30; index += 1) lignes.push(['faible', 'nouveau']);
    const reponse = await serveur.importer('incidents', {
      nom: 'sans-titre.csv',
      contenu: csvEssai(lignes),
    });
    assert.equal(reponse.statut, 409, JSON.stringify(reponse.corps).slice(0, 400));
    assert.deepEqual(reponse.corps.colonnesManquantes, ['Titre']);
    // Le rapport ne noie pas l'utilisateur sous trente répétitions de la même
    // phrase : la colonne manquante est un fait du FICHIER, pas de la ligne.
    // ⚠️ Mais il REFUSE : la première rédaction rendait 200 avec zéro création
    // et zéro erreur, c'est-à-dire un import « réussi » qui n'importait rien.
    assert.equal(reponse.corps.enErreur, 1);
    assert.equal(reponse.corps.erreurs.length, 1);
    assert.equal(reponse.corps.erreurs[0].ligne, 1, 'le fait est celui de l’en-tête');
    assert.match(reponse.corps.erreurs[0].message, /Titre/u);
    assert.equal(reponse.corps.creees, 0);
  });
});

/* =====================================================================
 *  4. Le journal d'audit
 * ===================================================================== */

describe('Le journal — une entrée pour l’ACTE, pas une par ligne', () => {
  async function journalDepuis(numero) {
    return enBase(
      `select "numero", "action", "entite_type", "valeurs_apres"
         from journal_audit where numero > $1 order by numero`,
      [numero],
    );
  }

  test('250 créations laissent UNE entrée `import` et aucune entrée `creation`', async () => {
    const [depart] = await enBase(
      `select coalesce(max("numero"), 0)::bigint as n from journal_audit`,
    );
    const contenu = fichierIncidents();
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'incidents-journal.csv', contenu },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));

    const entrees = await journalDepuis(depart.n);
    assert.deepEqual(
      entrees.map((e) => e.action),
      ['import'],
      'un import laisse une entrée, pas 250',
    );
    const charge = entrees[0].valeurs_apres;
    assert.equal(charge.entite, 'incidents');
    assert.equal(charge.creees, VOLUME);
    assert.equal(charge.fichier, 'incidents-journal.csv');
    assert.equal(charge.sha256, reponse.corps.sha256);
    assert.equal(entrees[0].entite_type, 'imports');
  });

  test('un aperçu n’écrit AUCUNE entrée de journal — il n’a rien fait', async () => {
    const [depart] = await enBase(
      `select coalesce(max("numero"), 0)::bigint as n from journal_audit`,
    );
    await serveur.importer('incidents', {
      nom: 'apercu-sans-trace.csv',
      contenu: fichierIncidents(),
    });
    assert.deepEqual(await journalDepuis(depart.n), []);
  });
});

/* =====================================================================
 *  5. Les droits, et la borne
 * ===================================================================== */

describe('Le refus vient du crochet, avant que le fichier soit lu', () => {
  test('un profil `lecture` ne peut pas importer, et rien n’est écrit', async () => {
    session.poser(perimetreDe('lecteur', FILIALE_A), LECTEUR);
    const avant = await compterIncidents();
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'interdit.csv', contenu: fichierIncidents() },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps));
    assert.equal(await compterIncidents(), avant);
  });

  test('un profil sans le domaine de l’entité est refusé, entité par entité', async () => {
    session.poser(perimetreDe('rssi.toulouse', FILIALE_A), {
      niveau: 'administration',
      domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'incidents'),
      export: true,
    });
    const refus = await serveur.importer('incidents', {
      nom: 'hors-domaine.csv',
      contenu: fichierIncidents(),
    });
    assert.equal(refus.statut, 403, JSON.stringify(refus.corps));

    // Le même profil garde le droit d'importer ce qui relève de ses domaines.
    const accepte = await serveur.importer('actifs', {
      nom: 'actifs.csv',
      contenu: csvEssai([['Nom'], ['Serveur applicatif']]),
    });
    assert.equal(accepte.statut, 200, JSON.stringify(accepte.corps));
  });

  test('sans filiale active, l’import est refusé plutôt qu’écrit « quelque part »', async () => {
    session.poser(perimetreDe('sans.filiale', null, [FILIALE_A]), TOUS_DROITS);
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'sans-filiale.csv', contenu: fichierIncidents() },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps));
  });
});

describe('Les bornes — un fichier hors gabarit ne consomme rien', () => {
  test('un envoi sans partie « fichier » est refusé', async () => {
    const reponse = await serveur.appeler('POST', '/api/import/incidents', {
      corps: 'rien du tout',
      entetes: { 'content-type': 'multipart/form-data; boundary=xyz' },
    });
    assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps));
  });

  test('un fichier qui n’est ni un classeur ni un CSV exploitable est refusé, sans 500', async () => {
    const reponse = await serveur.importer('incidents', {
      nom: 'photo.xlsx',
      contenu: Buffer.from('PK\x03\x04\x00\x00\x00 ceci est une photo', 'latin1'),
    });
    assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.erreur, 'donnee_invalide');
  });

  test('un classeur XLSX réel emprunte le même chemin qu’un CSV', async () => {
    const contenu = xlsxEssai([
      ['Titre', 'Gravité', 'Date de détection'],
      ['Incident xlsx-1', 'élevée', 45000],
      ['Incident xlsx-2', 'faible', '2026-01-05'],
    ]);
    const reponse = await serveur.importer(
      'incidents',
      { nom: 'incidents.xlsx', contenu },
      { appliquer: true },
    );
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(reponse.corps.source, 'excel');
    assert.equal(reponse.corps.creees, 2);

    const [ligne] = await enBase(
      `select "gravite", "date_detection" from incidents where titre = 'Incident xlsx-1'`,
    );
    assert.equal(ligne.gravite, 'élevée');
    // 45000 dans le repère du tableur = 2023-03-15.
    assert.equal(ligne.date_detection.toISOString().slice(0, 10), '2023-03-15');
  });
});
