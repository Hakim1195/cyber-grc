/**
 * chargement-filiale.test.mjs — « à la connexion, le backend renvoie l'intégralité du
 * jeu de données de la filiale active » (`PLAN_SERVEUR` §1.3). Intégralité de LA SIENNE.
 *
 * ── Pourquoi ce fichier existe, alors que `test/base/rls.test.mjs` éprouve déjà la RLS ─
 *
 * Ce ne sont pas les mêmes questions. `rls.test.mjs` demande « la politique de cette
 * table tient-elle ? », table par table, propriété par propriété. Ici la question est
 * celle du lot L2 : **« ce que le serveur s'apprête à envoyer au navigateur contient-il
 * quelque chose qui ne devrait pas s'y trouver ? »**
 *
 * La différence est celle de l'oubli. Le chargement initial est un BALAYAGE : il lit
 * toutes les entités, y compris celles auxquelles personne ne pense — les pièces
 * jointes, les imports, les approbations, l'historique. Un chargement qui emprunterait
 * le compte propriétaire, ou `pool.query()` au lieu d'`avecTransaction`, ou qui
 * ajouterait demain une table sans y penser, fuirait sur ces tables-là. La forme du test
 * suit donc la forme du risque : il **découvre les tables dans le catalogue** au lieu de
 * les réciter (`CONVENTIONS.md` §19.5 — « une liste écrite à la main est une omission qui
 * attend »), et il **réclame sa propre couverture** : un balayage qui ne trouve rien à
 * cacher passe au vert sans rien prouver.
 *
 * ── Les deux erreurs symétriques ─────────────────────────────────────────────
 *
 * Un chargement peut se tromper dans les deux sens, et les deux coûtent cher :
 *
 *   - **rendre trop** : une ligne de la filiale voisine part dans la charge utile ;
 *   - **rendre trop peu** : un chargement qui filtrerait naïvement `filiale_id = $1`
 *     perdrait tout le SOCLE DE GROUPE (`filiale_id` nul) — la PSSI, le catalogue de
 *     contrôles, l'annuaire du groupe. L'application s'ouvrirait, vide de son référentiel
 *     commun, et personne ne verrait d'erreur.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
  TABLES_LIAISON,
} from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Compte applicatif : le chargement initial se fera sous ce compte, et sous périmètre. */
let applicatif;
/** Compte propriétaire : lecture du catalogue et DDL du contrôle de morsure. */
let proprietaire;
/** Tables portant une colonne `filiale_id`, découvertes dans le catalogue. */
let tablesCloisonnees;

/** Le RSSI de Toulouse : c'est SON chargement initial que l'on regarde. */
const site = perimetre('rssi-site', FILIALE_A, [FILIALE_A]);
/** Le RSSI groupe : il sert de témoin — ce qu'il voit est ce qui EXISTE. */
const groupe = perimetre('rssi-groupe', FILIALE_A, [FILIALE_A, FILIALE_B]);

// ── LA DÉROGATION DU JOURNAL A DISPARU — condition E6, migration 008 ──────
//
// `const DEROGATION_JOURNAL = 'journal_audit'` vivait ici, avec ce commentaire :
// *« le jour où L5 la referme, ce test tombera et l'exclusion devra disparaître
// avec lui. »* C'est arrivé le 04/09/2026. `journal_audit` n'est donc plus exclu
// du balayage de fuite : il y est **soumis comme les 47 autres tables**, ce qui
// est plus fort que n'importe quelle assertion écrite à la main pour lui.
//
// L'essai qui réclamait la dérogation n'a pas été supprimé pour autant — il a
// été **retourné** (voir plus bas). Supprimer aurait retiré la seule ligne qui
// documente la fermeture à l'endroit exact où la dette était consignée.

/**
 * `session_filiales` — le périmètre RÉSOLU d'une session — porte un `filiale_id` et sa
 * politique de lecture est `using (true)` : elle fait partie des « tables ouvertes » du
 * substrat d'authentification, écrivables et lisibles sans condition par le rôle
 * applicatif. C'est la dette explicitement reportée du §17.4, **condition d'entrée du
 * lot L3**.
 *
 * Elle n'est donc pas une fuite du chargement — c'est un report écrit — mais elle
 * commande une règle pour la couche de chargement de L2, et c'est pour cela qu'elle est
 * nommée ici : **le chargement initial ne peut pas être piloté par « toute table portant
 * filiale_id »**. Une découverte automatique, si commode soit-elle, emporterait le
 * périmètre des sessions des autres filiales dans la charge utile envoyée au navigateur.
 * La liste des entités à charger doit être celle des ENTITÉS MÉTIER, explicite.
 */
const DEROGATION_SESSION = 'session_filiales';

/** Les deux tables que le balayage écarte — et que deux tests dédiés réclament. */
const DEROGATIONS = [DEROGATION_SESSION];

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);

  tablesCloisonnees = (
    await base.lignes(
      proprietaire,
      `select c.relname::text as nom
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'filiale_id'
        where n.nspname = 'public' and c.relkind = 'r'
          and a.attnum > 0 and not a.attisdropped
        order by 1`,
    )
  ).map((l) => l.nom);
});

after(async () => {
  await base?.fermer();
});

/** Nom de table venu du catalogue : contrôlé à l'endroit exact de son interpolation. */
function tableSure(nom) {
  if (!/^[a-z_][a-z0-9_]*$/.test(nom)) throw new Error(`Nom de table refusé : « ${nom} ».`);
  return nom;
}

/** Compte, sous le périmètre donné, les lignes de chaque table répondant à `condition`. */
async function compter(p, condition) {
  return base.avecPerimetre(applicatif, p, async (c) => {
    /** @type {Record<string, number>} */
    const compte = {};
    for (const nom of tablesCloisonnees) {
      const resultat = await c.query(`select count(*)::int as n from ${tableSure(nom)} where ${condition}`);
      compte[nom] = resultat.rows[0].n;
    }
    return compte;
  });
}

/* =====================================================================
 *  Le balayage — rien de la filiale voisine
 * ===================================================================== */

describe('Chargement initial : rien de la filiale voisine (PLAN_SERVEUR §1.3, §2.4)', () => {
  test('le catalogue est bien celui qu’on croit : 32 tables portent « filiale_id »', async () => {
    // Ancrage du balayage. Si une migration future ajoute ou retire une table
    // cloisonnée, ce compte change — et c'est ici qu'on veut l'apprendre, pas dans une
    // liste recopiée ailleurs qui, elle, ne dirait rien.
    assert.equal(tablesCloisonnees.length, 32, `Tables trouvées : ${tablesCloisonnees.join(', ')}`);
    for (const derogation of DEROGATIONS) {
      assert.ok(tablesCloisonnees.includes(derogation), `${derogation} doit être dans le balayage.`);
    }
  });

  test('AUCUNE ligne de la filiale allemande n’est visible du RSSI de Toulouse', async () => {
    const vuDeToulouse = await compter(site, `filiale_id = '${FILIALE_B}'`);
    const fuites = Object.entries(vuDeToulouse).filter(([nom, n]) => n > 0 && !DEROGATIONS.includes(nom));
    assert.deepEqual(fuites, [], 'Chaque entrée est une table par laquelle la charge utile fuirait.');
  });

  test('LE BALAYAGE A DE LA MATIÈRE : il y avait bien quelque chose à cacher, table par table', async () => {
    // La moitié qui manque le plus souvent. « Zéro ligne visible » est aussi ce que
    // rend une table VIDE : sans ce contrôle, le test précédent passerait au vert sur
    // une base où le semis aurait échoué en silence.
    const vuDuGroupe = await compter(groupe, `filiale_id = '${FILIALE_B}'`);
    const sansMatiere = Object.entries(vuDuGroupe).filter(([, n]) => n === 0).map(([nom]) => nom);

    // Exception unique et RÉCLAMÉE : `groupes_ad` porte un `filiale_id` nullable pour
    // une raison de chronologie (le groupe AD « GRC-EXPORT » est transversal, §4), et
    // n'a par construction aucune ligne locale. Le jour où une ligne de filiale y
    // apparaît, ce test le dira, et le jeu d'essai devra la couvrir.
    assert.deepEqual(sansMatiere, ['groupes_ad']);
    assert.equal(
      Object.values(vuDuGroupe).filter((n) => n > 0).length,
      31,
      'Trente et une tables devaient contenir au moins une ligne allemande.',
    );
  });

  test('LE BALAYAGE MORD : une politique de lecture ouverte est immédiatement signalée', async () => {
    // Contrôle de morsure. On ouvre la politique de lecture d'UNE table — le défaut le
    // plus banal qui soit, un `using (true)` laissé après une mise au point — et l'on
    // vérifie que le balayage le voit. Restauré ensuite dans sa forme EXACTE, puis
    // confirmé par les garde-fous du schéma.
    await proprietaire.query('alter policy pol_risques_lecture on risques using (true)');
    try {
      const vuDeToulouse = await compter(site, `filiale_id = '${FILIALE_B}'`);
      const fuites = Object.entries(vuDeToulouse)
        .filter(([nom, n]) => n > 0 && !DEROGATIONS.includes(nom))
        .map(([nom]) => nom);
      assert.deepEqual(fuites, ['risques'], 'Le balayage doit nommer la table qui fuit.');
    } finally {
      await proprietaire.query(
        'alter policy pol_risques_lecture on risques using (filiale_id = any (f_filiales_lecture()))',
      );
    }
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
    const vuApres = await compter(site, `filiale_id = '${FILIALE_B}'`);
    assert.equal(vuApres.risques, 0, 'Et la porte doit être refermée derrière le contrôle.');
  });

  test('les liaisons sans « filiale_id » ne rendent pas non plus les liens allemands', async () => {
    // L'angle mort du §7 : ces six tables ne peuvent pas porter la filiale, et le
    // balayage précédent ne les voit donc pas. Leur politique est leur seule défense,
    // et un chargement initial les lit comme les autres.
    const vu = await base.avecPerimetre(applicatif, site, async (c) => ({
      risque_exigences: (await c.query("select count(*)::int as n from risque_exigences where risque_id = 'RISK-B'")).rows[0].n,
      actif_risques: (await c.query("select count(*)::int as n from actif_risques where actif_id = 'ACTIF-B'")).rows[0].n,
      processus_actifs: (await c.query("select count(*)::int as n from processus_actifs where processus_id = 'BIA-B'")).rows[0].n,
      actif_dependances: (await c.query("select count(*)::int as n from actif_dependances where actif_id = 'ACTIF-B'")).rows[0].n,
      incident_actifs: (await c.query("select count(*)::int as n from incident_actifs where incident_id = 'INC-B'")).rows[0].n,
      import_erreurs: (await c.query("select count(*)::int as n from import_erreurs where import_id = 'IMP-B'")).rows[0].n,
    }));
    assert.deepEqual(vu, {
      risque_exigences: 0,
      actif_risques: 0,
      processus_actifs: 0,
      actif_dependances: 0,
      incident_actifs: 0,
      import_erreurs: 0,
    });
    assert.equal(TABLES_LIAISON.length, Object.keys(vu).length, 'Les six liaisons doivent toutes être interrogées.');

    // Et la matière est là : le RSSI groupe, lui, voit les six liens allemands.
    const vuDuGroupe = await base.avecPerimetre(applicatif, groupe, async (c) =>
      (await c.query("select count(*)::int as n from risque_exigences where risque_id = 'RISK-B'")).rows[0].n);
    assert.equal(vuDuGroupe, 1);
  });
});

/* =====================================================================
 *  L'erreur symétrique — rendre trop peu
 * ===================================================================== */

describe('Le socle de Groupe fait partie du chargement (erreur symétrique)', () => {
  test('la PSSI, le catalogue de contrôles et l’annuaire du groupe sont rendus à Toulouse', async () => {
    // Un chargement écrit « where filiale_id = $1 » les perdrait tous les quatre, sans
    // erreur et sans bruit. Les tables mixtes se chargent avec leur portée Groupe.
    const vu = await base.avecPerimetre(applicatif, site, async (c) => ({
      document: (await c.query("select titre from documents where id = 'DOC-G'")).rows[0]?.titre,
      mesure: (await c.query("select nom from mesure_catalogue where id = 'MESURE-G'")).rows[0]?.nom,
      personne: (await c.query("select nom from personnes where id = 'PERS-G'")).rows[0]?.nom,
      parametre: (await c.query("select cle from parametres where id = 'PARAM-G'")).rows[0]?.cle,
    }));
    assert.deepEqual(vu, {
      document: 'PSSI du groupe',
      mesure: 'Chiffrement des postes',
      personne: 'RSSI groupe',
      parametre: 'essai.groupe',
    });
  });

  // ⚠️ `journal_audit` est soumis au BALAYAGE DE FUITE ci-dessus, mais pas à
  // l'égalité ci-dessous — et la nuance n'est pas un aménagement de confort.
  //
  // Pour les 31 autres tables, `filiale_id is null` désigne le **socle de
  // Groupe** : la PSSI, le catalogue de contrôles, l'annuaire — des lignes
  // partagées, que chaque filiale doit voir, et dont l'absence serait une perte.
  // Pour le journal, `filiale_id is null` désigne tout autre chose : un
  // événement **transversal** — un échec de connexion, un démarrage de service —
  // qui précède la résolution du périmètre. Le §29.7 le réserve au périmètre
  // Groupe, parce que les rendre visibles à chaque filiale donnerait à chacune
  // la liste des logins du groupe entier.
  //
  // Les deux règles portent le même `null` et disent l'inverse. Comparer le
  // journal à « ses lignes + le socle » exigerait donc de Toulouse qu'elle voie
  // ce que E6 lui interdit — l'essai passerait aujourd'hui par chance, la base
  // d'essai n'ayant aucune entrée transversale, et tomberait le jour où l'une
  // apparaîtrait, **pour une raison correcte**.
  const HORS_EGALITE_SOCLE = [...DEROGATIONS, 'journal_audit'];

  test('la charge utile de Toulouse = ses lignes + le socle, ni plus ni moins', async () => {
    // La formulation exacte de « intégralité du jeu de données de la filiale active » :
    // ce que voit le RSSI de site doit être, table par table, ce que le RSSI groupe
    // compte pour Toulouse et pour le socle. Un écart dans un sens est une fuite, dans
    // l'autre une perte.
    const vuDeToulouse = await compter(site, 'true');
    const attendu = await compter(groupe, `filiale_id = '${FILIALE_A}' or filiale_id is null`);
    for (const nom of tablesCloisonnees) {
      if (HORS_EGALITE_SOCLE.includes(nom)) continue;
      assert.equal(vuDeToulouse[nom], attendu[nom], `Table « ${nom} » : charge utile inattendue.`);
    }
    // Contrôle de matière : la comparaison ne doit pas porter sur des tables vides.
    const nonVides = tablesCloisonnees.filter((nom) => !HORS_EGALITE_SOCLE.includes(nom) && vuDeToulouse[nom] > 0);
    assert.equal(nonVides.length, 29, `Tables non vides : ${nonVides.join(', ')}`);
  });

  // La contrepartie de l'exclusion ci-dessus : ce qui n'est plus vérifié par
  // l'égalité est vérifié ici, explicitement, et dans les deux sens.
  test('JOURNAL : une entrée transversale est réservée au périmètre Groupe (§29.7)', async () => {
    await base.avecPerimetre(
      applicatif,
      groupe,
      async (c) => {
        await c.query(
          "insert into journal_audit (action, resume) values ('connexion_echouee', 'compte inconnu')",
        );
      },
      { annuler: false },
    );

    const vueGroupe = await base.avecPerimetre(applicatif, groupe, async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id is null')).rows[0].n);
    assert.ok(vueGroupe >= 1, 'Le périmètre Groupe doit voir les entrées transversales.');

    const vueSite = await base.avecPerimetre(applicatif, site, async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id is null')).rows[0].n);
    assert.equal(
      vueSite,
      0,
      'Un échec de connexion n’appartient à aucune filiale : le rendre visible à chacune ' +
        'donnerait à toutes la liste des logins du groupe (§29.7, troisième cas).',
    );
  });
});

/* =====================================================================
 *  La dérogation du journal, réclamée plutôt qu'inscrite
 * ===================================================================== */

describe('Journal d’audit : la dérogation de lecture est réclamée, pas subie', () => {
  // ── L'ESSAI EST RETOURNÉ, pas supprimé ────────────────────────────────
  //
  // Il disait : « depuis Toulouse, l'entrée de journal allemande EST visible —
  // dette datée du lot L5 », et il ajoutait *« si ce test tombe, c'est une BONNE
  // nouvelle »*. Il est tombé, et la bonne nouvelle est la migration 008.
  //
  // Sa consigne était de le supprimer. On le retourne à la place : supprimer
  // aurait retiré la seule ligne qui documente la fermeture **à l'endroit exact
  // où la dette était consignée**, et le lecteur suivant n'aurait trouvé qu'une
  // absence — c'est-à-dire rien. Ce qui est ici maintenant est plus fort que ce
  // qui y était : `journal_audit` est en outre soumis au balayage de fuite
  // général, dont il était exclu.
  test('depuis Toulouse, l’entrée de journal allemande est INVISIBLE — E6 fermée', async () => {
    // ⚠️ La mesure porte sur une table NON VIDE, et c'est indispensable : la
    // garde de périmètre s'évalue par ligne, si bien qu'un `0` sur une table
    // vide ne distinguerait pas « rien à voir » de « rien de contrôlé »
    // (constat Q-104). L'entrée allemande existe — le périmètre B la voit.
    const siteAllemand = perimetre('rssi-site', FILIALE_B, [FILIALE_B]);
    const vueDepuisB = await base.avecPerimetre(applicatif, siteAllemand, async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id = $1', [FILIALE_B])).rows[0].n);
    assert.equal(vueDepuisB, 1, 'L’entrée existe : sans cela, le zéro ci-dessous ne prouverait rien.');

    const vueDepuisA = await base.avecPerimetre(applicatif, site, async (c) =>
      (await c.query('select count(*)::int as n from journal_audit where filiale_id = $1', [FILIALE_B])).rows[0].n);
    assert.equal(
      vueDepuisA,
      0,
      'Toulouse lit le registre allemand : la condition E6 est rouverte, et le journal ' +
        'de chaque filiale cesse d’être le sien.',
    );
  });

  test('depuis Toulouse, le PÉRIMÈTRE de la session allemande est visible — dette du lot L3', async () => {
    // Même geste, autre dérogation. `session_filiales` dit quelles filiales une session
    // a le droit de lire ; sa politique est ouverte (§17.4). Ce test la réclame : le
    // jour où L3 la referme, il tombera, et `session_filiales` devra sortir des
    // exclusions du balayage.
    //
    // Ce qu'il faut en retenir POUR L2, et qui ne dépend pas de L3 : la couche de
    // chargement ne peut pas découvrir ses tables par « porte un filiale_id ».
    const vue = await base.avecPerimetre(applicatif, site, async (c) =>
      (await c.query('select count(*)::int as n from session_filiales where filiale_id = $1', [FILIALE_B])).rows[0].n);
    assert.equal(vue, 1, 'La lecture du substrat d’authentification n’est pas cloisonnée : report écrit du §17.4.');
  });

  test('le chargement initial d’une filiale n’emporte donc PAS le journal d’audit', async () => {
    // Conséquence directe et opérationnelle pour L2 : le journal n'est pas une entité
    // du jeu de données rendu au navigateur. Il se consulte par un écran dédié, avec
    // ses propres droits (§1.7). Ce test n'éprouve pas du code — il fixe une frontière
    // que la couche de chargement doit respecter, et rappelle pourquoi.
    const chaine = await base.lignes(proprietaire, 'select * from f_journal_audit_verifier()');
    assert.deepEqual(chaine, [], 'Et la chaîne du journal reste intacte après tout ce qui précède.');
  });
});
