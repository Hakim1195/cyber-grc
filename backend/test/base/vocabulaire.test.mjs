/**
 * vocabulaire.test.mjs — le schéma porte-t-il TOUT ce qu'un export existant transporte ?
 *
 * Constat M-8 du premier passage de la porte S2, et ce n'était pas un oubli cosmétique :
 * `traitements.notes` était collecté par le formulaire RGPD depuis l'origine, absent du
 * schéma, et donc retiré du corps par le serveur avant enregistrement. Le bandeau
 * prévenait — « champs non reconnus par le serveur, donc non enregistrés » — mais **un
 * export `grc-backup` existant porte ces notes, et la reprise les perdait en silence**,
 * sur le registre de l'article 30.
 *
 * Un champ manquant ne se voit ni au déploiement, ni à la recette, ni dans un test de
 * cloisonnement : rien n'échoue. Il se voit une seule fois, quand quelqu'un cherche une
 * note qu'il a saisie il y a six mois. C'est le genre de défaut qui appelle un balayage
 * plutôt qu'une relecture.
 *
 * CE QUE CE FICHIER BALAIE, et pourquoi cette source-là. Le jeu d'essai v12 de la reprise
 * (`test/reprise/jeux-essai.mjs`) EST un export `grc-backup` complet : les 21 collections
 * du modèle navigateur, tous champs renseignés. C'est exactement la matière que le risque
 * nomme, et c'est une source EXHAUSTIVE — à la différence d'une extraction des
 * formulaires, qui ne suit pas les indirections (`readForm()`, `Object.assign`) et
 * donnerait un filet qu'on croirait complet. Le §17.5 vaut ici aussi : un garde-fou
 * auquel on prête plus de portée qu'il n'en a endort la vigilance.
 *
 * La confrontation se fait avec le CATALOGUE de la base, pas avec le registre du serveur
 * (`src/entites`) : si le registre et le schéma se trompaient ensemble, ce balayage le
 * dirait quand même.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { instantaneV12Complet } from '../reprise/jeux-essai.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});

after(async () => {
  await base?.fermer();
});

/** Collection du modèle navigateur -> table qui la porte (CONVENTIONS.md §16). */
const TABLE = Object.freeze({
  clients: 'clients', exigences: 'exigences', actions: 'actions', risques: 'risques',
  actifs: 'actifs', processus: 'processus', crise: 'crise', scenarios_pra: 'scenarios_pra',
  tests_pra: 'tests_pra', prestataires: 'prestataires', mco_actions: 'mco_actions',
  audits: 'audits', revues: 'revues', evaluations: 'evaluations',
  // La SCISSION du §16.2 : une entité navigateur, deux tables serveur.
  mesures: 'mesure_catalogue',
  incidents: 'incidents', documents: 'documents', traitements: 'traitements',
  mappings: 'mappings', history: 'history', personnes: 'personnes',
});

/**
 * Les champs qui ne sont PAS une colonne de la table principale, et où ils vont.
 *
 * Liste écrite à la main, et le §19.5 ne l'admet qu'à une condition : que le garde-fou
 * vérifie qu'elle reste juste. Le second test le fait — chaque destination déclarée doit
 * exister dans le catalogue, sinon la dispense ne porte plus sur rien et couvrirait le
 * prochain champ du même nom.
 *
 * La part irréductible est là et il faut la dire : « ce champ va-t-il ailleurs, ou
 * manque-t-il ? » est un jugement de sens que le catalogue ne rendra jamais. Ce que le
 * balayage garantit, c'est qu'aucun champ ne passe SANS qu'on ait répondu.
 */
const AILLEURS = Object.freeze({
  // Vaut pour toutes les collections.
  '*': { updatedAt: { colonne: 'modifie_le', table: null } },
  traitements: { mesures_ids: { table: 'traitement_mesures' } },
  evaluations: { mesure_ids: { table: 'evaluation_mesures' } },
  risques: { exigences_liees: { table: 'risque_exigences' }, actifs_lies: { table: 'actif_risques' } },
  actifs: { risques_lies: { table: 'actif_risques' }, dependances: { table: 'actif_dependances' } },
  processus: { actifs_lies: { table: 'processus_actifs' } },
  incidents: { actifs_touches: { table: 'incident_actifs' } },
  documents: { referentiels: { table: 'document_referentiels' } },
  mappings: { refs: { table: 'mapping_exigences' }, _deleted: { colonne: 'masque', table: 'mappings' } },
  mesures: {
    // Le versant FILIALE de la scission : ces quatre-là vivent dans la mise en oeuvre.
    statut: { colonne: 'statut', table: 'mesure_mise_en_oeuvre' },
    maturite: { colonne: 'maturite', table: 'mesure_mise_en_oeuvre' },
    responsable: { colonne: 'responsable', table: 'mesure_mise_en_oeuvre' },
    commentaire: { colonne: 'commentaire', table: 'mesure_mise_en_oeuvre' },
    exigences_liees: { table: 'evaluation_mesures' },
  },
  // Alias de nommage : le modèle navigateur est en anglais par endroits, le schéma tient
  // la convention française (CONVENTIONS.md §2).
  prestataires: {
    phone: { colonne: 'telephone', table: 'prestataires' },
    supplyChain: { colonne: 'supply_chain', table: 'prestataires' },
  },
  tests_pra: { date: { colonne: 'date_test', table: 'tests_pra' } },
  mco_actions: {
    datePrevue: { colonne: 'date_prevue', table: 'mco_actions' },
    dateReelle: { colonne: 'date_reelle', table: 'mco_actions' },
    dateCloture: { colonne: 'date_cloture', table: 'mco_actions' },
  },
  audits: {
    ref: { colonne: 'reference', table: 'audits' },
    date: { colonne: 'date_audit', table: 'audits' },
  },
  revues: {
    date: { colonne: 'date_revue', table: 'revues' },
    inputs: { colonne: 'donnees_entree', table: 'revues' },
    outputs: { colonne: 'donnees_sortie', table: 'revues' },
  },
  history: {
    ts: { colonne: 'horodatage', table: 'history' },
    date: { colonne: 'date_point', table: 'history' },
  },
});

/** Colonnes du schéma, par table. */
async function catalogue() {
  const lignes = await base.lignes(
    proprietaire,
    `select c.relname::text as t, a.attname::text as colonne
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and a.attnum > 0 and not a.attisdropped`,
  );
  const par = new Map();
  for (const { t, colonne } of lignes) {
    if (!par.has(t)) par.set(t, new Set());
    par.get(t).add(colonne);
  }
  return par;
}

describe('Le schéma porte tout ce qu’un export v12 transporte (constat M-8)', () => {
  test('AUCUN champ de l’export n’est sans destination', async () => {
    const cols = await catalogue();
    const charge = instantaneV12Complet();

    const manquants = [];
    let champs = 0;
    let collections = 0;
    for (const [entite, lignes] of Object.entries(charge)) {
      if (!Array.isArray(lignes)) continue;
      collections += 1;
      const table = TABLE[entite];
      assert.ok(table, `Collection sans table déclarée : ${entite}.`);
      assert.ok(cols.has(table), `Table absente du catalogue : ${table}.`);

      const vus = new Set(lignes.flatMap((l) => Object.keys(l)));
      champs += vus.size;
      for (const champ of vus) {
        if (cols.get(table).has(champ)) continue;
        if (AILLEURS['*'][champ] || (AILLEURS[entite] ?? {})[champ]) continue;
        manquants.push(`${entite}.${champ}`);
      }
    }

    // Le balayage doit avoir de la matière : un jeu d'essai amputé rendrait « aucun
    // manquant » pour la pire des raisons.
    assert.equal(collections, 21, 'Les 21 collections du modèle v12 doivent être balayées.');
    assert.ok(champs >= 170, `Balayage suspect : ${champs} champ(s) seulement.`);
    assert.deepEqual(
      manquants, [],
      'Ces champs voyagent dans un export existant et le schéma ne les porte nulle part : '
        + 'la reprise les perdrait EN SILENCE.',
    );
  });

  test('et la colonne du constat M-8 est bien là, nommément', async () => {
    // Un balayage qui passe sur une liste vide passerait aussi. Celui-ci nomme le champ
    // qui manquait, pour que sa disparition ne se confonde pas avec un jeu d'essai réduit.
    const cols = await catalogue();
    assert.ok(cols.get('traitements').has('notes'),
      'traitements.notes — le champ du constat M-8, collecté par le module RGPD.');
    assert.ok(instantaneV12Complet().traitements.some((t) => 'notes' in t),
      'Le jeu d’essai v12 doit continuer de le transporter, sinon le balayage ne le voit plus.');
  });

  test('la liste des destinations ne se PÉRIME pas (CONVENTIONS §19.5)', async () => {
    // Une dispense qui ne désigne plus rien est pire qu'une dispense absente : elle
    // couvrirait, en silence, le prochain champ qui reprendrait ce nom.
    const cols = await catalogue();
    const perimees = [];
    for (const [entite, champs] of Object.entries(AILLEURS)) {
      for (const [champ, destination] of Object.entries(champs)) {
        const { table, colonne } = destination;
        if (table === null) continue; // dérivé, sans destination en base
        if (!cols.has(table)) { perimees.push(`${entite}.${champ} -> table ${table}`); continue; }
        if (colonne && !cols.get(table).has(colonne)) {
          perimees.push(`${entite}.${champ} -> ${table}.${colonne}`);
        }
      }
    }
    assert.deepEqual(perimees, []);
  });
});

/* =====================================================================
 *  Le domaine « type_entite » connaît TOUTES les entités du produit
 * ===================================================================== */

describe('Le journal sait nommer chaque entité que le produit sait écrire', () => {
  /**
   * ── Pourquoi cet essai existe, et ce qu'il a coûté de ne pas l'avoir ──
   *
   * `journal_audit.entite_type` porte le domaine `type_entite`, dont le `check`
   * énumère les entités désignables. **Toute création écrit une entrée au
   * journal** : une entité absente du domaine rend donc sa création
   * *impossible*, et le refus arrive sous la forme d'un `23514` sur
   * `type_entite_check`, traduit à l'utilisateur en « une valeur de
   * l'enregistrement n'est pas admise » — un message qui ne désigne rien.
   *
   * Rencontré le 04/09/2026 en exposant `risque_catalogue` par la couche
   * générique : la table était juste, ses politiques étaient justes, et c'est la
   * TRACE qui refusait. Une demi-heure pour comprendre, parce que rien ne reliait
   * les deux listes.
   *
   * ⚠️ Le défaut ne se voit **qu'à l'exécution, et qu'une entité à la fois** :
   * ajouter deux entités et n'en éprouver qu'une laisse l'autre cassée. C'est
   * exactement le premier cas du tableau du `CLAUDE.md` §3 — sauf qu'ici l'échec
   * est bruyant mais **tardif**, et qu'il coûte au client, pas au banc.
   *
   * La confrontation se fait entre DEUX SOURCES DÉCOUVERTES : les valeurs
   * admises par le domaine, lues dans `pg_catalog`, et le registre applicatif,
   * lu dans le code compilé. Aucune liste n'est écrite ici.
   */
  test('CHAQUE entité du registre applicatif est admise par le domaine « type_entite »', async () => {
    const { listerEntites } = await moduleCompile('entites/index.js');
    const entites = listerEntites();

    const [{ definition }] = await base.lignes(
      proprietaire,
      `select pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_type t on t.oid = c.contypid
        where t.typname = 'type_entite' and c.contype = 'c'`,
    );

    // Découverte : on lit les littéraux du `check`, on ne les récite pas.
    const admises = new Set([...definition.matchAll(/'([a-z0-9_]+)'/gu)].map((m) => m[1]));

    // ── Contrôle de matière, dans les DEUX sens ────────────────────────
    // Un domaine vide, ou un registre vide, rendrait « aucun manquant » vrai
    // sans rien prouver. Le dépôt a produit trois essais de cette forme.
    assert.ok(
      admises.size >= 30,
      `Le domaine n'admet que ${admises.size} valeur(s) : la lecture du « check » a échoué, ` +
        'et cet essai ne mesure rien.',
    );
    assert.ok(
      entites.length >= 20,
      `Le registre ne porte que ${entites.length} entité(s) : la lecture du module compilé a ` +
        'échoué.',
    );

    const absentes = entites.filter((nom) => !admises.has(nom));
    assert.deepEqual(
      absentes,
      [],
      'Ces entités du produit ne sont pas admises par le domaine « type_entite » : leur ' +
        'CRÉATION échouera en 23514 dès la première tentative, parce que la trace au journal ' +
        'ne peut pas les nommer. Étendre le domaine par une migration — PostgreSQL n’ajoute ' +
        'pas une valeur, il faut réécrire la contrainte entière.',
    );
  });

  test('MORSURE : une entité inventée est bien vue comme absente', async () => {
    // La contrepartie du test précédent : sans elle, « aucune absente » serait
    // aussi ce que rendrait un balayage qui ne regarde rien.
    const [{ definition }] = await base.lignes(
      proprietaire,
      `select pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_type t on t.oid = c.contypid
        where t.typname = 'type_entite' and c.contype = 'c'`,
    );
    const admises = new Set([...definition.matchAll(/'([a-z0-9_]+)'/gu)].map((m) => m[1]));
    assert.equal(admises.has('entite_qui_nexiste_pas'), false);
    assert.equal(admises.has('risque_catalogue'), true, 'la table de la migration 012 doit y être');
  });
});
