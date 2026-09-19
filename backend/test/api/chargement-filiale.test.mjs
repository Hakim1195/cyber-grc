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
// du balayage de fuite : il y est **soumis comme les 48 autres tables**, ce qui
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
  test('le catalogue est bien celui qu’on croit : le compte de tables cloisonnées', async () => {
    // Ancrage du balayage. Si une migration future ajoute ou retire une table
    // cloisonnée, ce compte change — et c'est ici qu'on veut l'apprendre, pas dans une
    // liste recopiée ailleurs qui, elle, ne dirait rien.
    // 33 depuis la migration `012` : `risque_catalogue` porte un `filiale_id`
    // nullable — socle du Groupe, plus les ajouts locaux.
    // 34 depuis la migration `017` : `pieces_a_purger`, la file des fichiers dont la
    // ligne a disparu. Elle est CLOISONNÉE à dessein — une file commune aurait été
    // plus commode à balayer, mais elle aurait laissé une filiale constater qu'une
    // autre vient de supprimer quelque chose.
    // 35 depuis la migration `027` : `document_etiquettes`, les mots de classement
    // libres d'un document. Elle naît MIXTE, comme le document qu'elle étiquette —
    // une étiquette de la PSSI du groupe est lisible partout, celle d'une procédure
    // locale ne l'est que chez elle. ⚠️ `traitements` et `traitement_mesures`, elles,
    // n'entrent PAS ici : elles y étaient déjà, et la `027` n'a fait que rendre leur
    // `filiale_id` nullable — le balayage les prend toujours.
    // 38 depuis la migration `035` : `derogations`, l'écart de conformité assumé.
    // Elle est de niveau FILIALE — `filiale_id not null` — parce qu'une dérogation
    // de portée Groupe voudrait dire « le Groupe accepte que ses vingt filiales
    // soient en écart », ce qui n'est pas une dérogation mais un changement de
    // politique.
    // 39 depuis la migration `036` : `document_mesures`, le lien qui dit quels
    // contrôles un document prouve. Elle est MIXTE, comme le document lui-même.
    // 40 depuis la migration `038` : `piece_rattachements`, les porteurs qu'une même
    // preuve sert. Elle est de niveau FILIALE — une pièce appartient toujours à la
    // filiale qui l'a déposée, y compris quand son porteur est de portée Groupe.
    // 42 depuis la migration `039` : `analyses_impact` et `analyse_mesures`
    // (action 20.3). Toutes deux MIXTES, comme `traitements`.
    // 43 depuis la migration `040` : `demandes_droits` (action 20.4). Elle est de
    // niveau FILIALE — une demande s'adresse à un responsable de traitement, qui est
    // une personne morale, donc une filiale.
    // 44 depuis la migration `041` : `main_courante` (action 20.5). EN AJOUT SEUL,
    // et pourtant porteuse des QUATRE politiques — celles de modification et de
    // suppression existent pour que le garde-fou de couverture RLS trouve une
    // écriture cloisonnée sur les quatre commandes ; sans elles, la table serait
    // rangée parmi les registres techniques, donc SORTIE de ce balayage.
    // 45 depuis la migration `042` : `prestataire_sous_traitance` (action 21.1).
    // Elle est de niveau FILIALE — une arête de sous-traitance appartient à la
    // filiale qui a contracté, et deux filiales peuvent connaître deux chaînes
    // différentes pour le même couple de sociétés, l'une ayant négocié une clause
    // que l'autre n'a pas.
    // 47 depuis la migration `043` : `questionnaires_tiers` et `questionnaire_reponses`
    // (action 21.2). Toutes deux de niveau FILIALE — une campagne de questionnaires
    // appartient à la filiale qui CONTRACTE, c'est elle qui décide ce qu'elle exige de
    // son fournisseur, et deux filiales peuvent légitimement interroger la même société
    // sur deux référentiels différents. Une portée Groupe ferait de l'exigence de l'une
    // celle de toutes. ⚠️ À ne pas confondre avec la campagne DESCENDANTE du lot L24,
    // qui va dans l'autre sens.
    // 48 depuis la migration `044` : `campagne_filiales` (lot L24, action 24.1) — la PART
    // d'une filiale dans une campagne que le Groupe a ouverte. Elle est cloisonnée, et
    // c'est tout le sujet : une filiale voit sa part et n'apprend pas combien d'autres
    // sont convoquées. ⚠️ **Et `campagnes`, elle, n'est PAS dans ce balayage** : elle ne
    // porte aucun filiale_id, elle est de niveau Groupe, et sa lecture est ouverte à
    // dessein — l'arbitrage est écrit au `CONVENTIONS.md` §24 et déclaré aux deux listes
    // que ce paragraphe impose. C'est exactement la frontière du lot : la DEMANDE est
    // commune, la RÉPONSE est propre à chacune.
    // 53 depuis la migration `046` : les CINQ tables des ateliers EBIOS RM (lot L25).
    // Quatre sont de niveau FILIALE — une étude de risque de portée Groupe voudrait dire
    // que vingt filiales partagent un périmètre et des événements redoutés, ce qui est
    // faux par construction : c'est l'exposition qui les distingue, et c'est pour cela
    // que le produit les cloisonne. La cinquième, `ebios_connaissances`, est MIXTE comme
    // `risque_catalogue` — une base de connaissances de MENACES se partage, et c'est
    // l'objet même de l'action 25.5 ; ce qui ne se partage pas, c'est l'évaluation qu'une
    // filiale en fait.
    // 56 depuis la migration `047` : les TROIS tables des ateliers 3, 4 et 5, toutes
    // de niveau FILIALE. Une partie prenante de l'écosystème est l'évaluation d'UNE
    // filiale — deux filiales peuvent légitimement dépendre du même fournisseur à des
    // degrés opposés, et une portée Groupe ferait de l'appréciation de l'une celle de
    // toutes.
    // 58 depuis la migration `049` : `echelles` et `echelle_niveaux` (action 25.3),
    // toutes deux MIXTES comme `risque_catalogue`. Le socle du Groupe est ce sur quoi
    // toutes les filiales cotent tant qu'aucune ne décide autrement — c'est ce qui
    // réconcilie le `PLAN_SERVEUR` §2.2 (« l'échelle est de niveau Groupe ») avec le
    // critère 25.3 (« configurables par filiale ») : le §2.2 énonçait une CONSÉQUENCE
    // (« sans échelle commune, les risques ne s'additionnent pas »), pas un interdit.
    // ⚠️ `echelle_niveaux` est cloisonnée bien que sa portée soit entièrement celle de
    // son échelle : le garde-fou de couverture RLS ne lit pas les déclencheurs, et une
    // table qui invoquerait ce raisonnement sans porter `filiale_id` échapperait au
    // balayage — la prochaine n'aurait peut-être pas le déclencheur.
    assert.equal(tablesCloisonnees.length, 58, `Tables trouvées : ${tablesCloisonnees.join(', ')}`);
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
    // 38 depuis la migration `036` : `document_mesures`, semée des deux côtés.
    // 39 depuis la `038` : `piece_rattachements`, posée par le déclencheur sur chaque
    // pièce du semis — sans une ligne de semis de plus, et c'est le dispositif qui le
    // veut ainsi.
    // 41 depuis la `039` : les deux tables de l'analyse d'impact, semées des deux côtés.
    // 44 depuis la `042` : `prestataire_sous_traitance`, qui a exigé un SECOND
    // prestataire dans le semis — une arête a deux bouts, et la contrainte de boucle
    // refuse qu'un tiers se sous-traite à lui-même.
    // 46 depuis la `043` : `questionnaires_tiers` et sa réponse, semées des deux côtés.
    // ⚠️ Le semis pose des dates COHÉRENTES (envoi, puis échéance) : les trois règles
    // de chronologie de la `043` vivent dans le schéma, et un semis qui les enfreindrait
    // ferait échouer toutes les familles à l'ouverture de leur base.
    // 47 depuis la `044` : `campagne_filiales`, semée POUR LES DEUX filiales. ⚠️ Le semis
    // l'écrit dans la section de niveau GROUPE, pas dans la boucle par filiale : convoquer
    // exige le drapeau d'administration, et la boucle l'efface à dessein. Semer la part
    // là-bas se ferait refuser — ce qui est le comportement voulu.
    // 57 depuis la `049` : `echelles` et `echelle_niveaux`, semées LOCALEMENT dans les
    // deux filiales (action 25.3). ⚠️ Le socle du Groupe ne suffirait pas ici : il porte
    // `filiale_id` nul, et le balayage rendrait « zéro ligne visible » pour la seule
    // raison qu'il n'y a rien de LOCAL à voir — c'est exactement l'angle mort que ce
    // contrôle de matière existe pour refuser. Le semis les pose ARCHIVÉES, pour ne pas
    // déplacer la graduation par défaut sous les autres familles du banc.
    assert.equal(
      Object.values(vuDuGroupe).filter((n) => n > 0).length,
      57,
      // 52 depuis la migration `046` : les cinq tables des ateliers EBIOS RM sont semées
      // des DEUX côtés, et la chaîne est complète — l'étude porte sa valeur métier, qui
      // porte son événement redouté, et le couple source / objectif pointe l'entrée
      // locale du socle de connaissances. Semer des lignes qui ne se référencent pas
      // aurait mesuré l'insertion, pas les clés composites.
      'Cinquante-cinq tables devaient contenir au moins une ligne allemande. Une table neuve '
        + 'sans ligne dans le semis est un angle mort : le balayage y rendrait « zéro '
        + 'visible » pour la seule raison qu’il n’y a rien à voir.',
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
    // 30 depuis la migration `012` : `risque_catalogue` est semé, socle du Groupe et
    // ajout local, précisément pour que le balayage ait de la matière sur elle.
    // 31 depuis la migration `017` : `pieces_a_purger`, semée elle aussi — une file
    // vide rendrait « rien à voir » là où l'on veut « rien qui fuie ».
    // 32 depuis la migration `027` : `document_etiquettes`, semée des deux côtés —
    // une étiquette Groupe et une étiquette par filiale.
    // 34 depuis les migrations `033` et `034` : `attestations_lecture` et
    // `declarations_reglementaires`. Elles sont semées pour la même raison que les
    // trois précédentes, et cette raison mérite d'être répétée — une table neuve
    // sans ligne rendrait « zéro visible » PARCE QU'IL N'Y A RIEN À VOIR, et se
    // présenterait comme une preuve de cloisonnement.
    // 36 depuis la migration `036` : `document_mesures`.
    // 37 depuis la migration `038` : `piece_rattachements`.
    // 39 depuis la migration `039` : `analyses_impact` et `analyse_mesures`.
    // 40 depuis la migration `040` : `demandes_droits`.
    // 41 depuis la migration `041` : `main_courante`.
    // 42 depuis la migration `042` : `prestataire_sous_traitance`.
    // 44 depuis la migration `043` : `questionnaires_tiers` et sa réponse, semées
    // dans les deux filiales — un envoi sans réponse aurait laissé la seconde vide,
    // c'est-à-dire exactement l'angle mort que ce contrôle de matière existe pour
    // refuser.
    // 45 depuis la migration `044` : `campagne_filiales`, semée pour les deux filiales.
    // 50 depuis la migration `046` : les cinq tables des ateliers EBIOS RM, semées des
    // deux côtés. ⚠️ `ebios_connaissances` y figure au titre de son versant LOCAL —
    // son socle de Groupe (filiale_id nul) est compté par l'égalité elle-même, comme
    // celui de `risque_catalogue`.
    // 55 depuis la migration `049` : `echelles` et `echelle_niveaux`, au titre de leur
    // versant LOCAL — leur socle de Groupe est compté par l'égalité elle-même, comme
    // celui de `risque_catalogue` et de `ebios_connaissances`.
    assert.equal(nonVides.length, 55, `Tables non vides : ${nonVides.join(', ')}`);
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
