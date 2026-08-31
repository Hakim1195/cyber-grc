/**
 * depot-contrat.test.mjs — la couche d'accès du lot L2, éprouvée contre le contrat que
 * les trois autres fichiers de ce répertoire ont figé en SQL direct.
 *
 * ── Pourquoi ce fichier vient en dernier ─────────────────────────────────────
 *
 * Les trois autres (`verrouillage-optimiste`, `update-zero`, `integrite-ecriture`,
 * `chargement-filiale`) n'ont besoin que de PostgreSQL : ils fixent ce que la base
 * garantit, indépendamment de qui l'appelle. Celui-ci vérifie que **`src/entites/`
 * respecte ce contrat** — c'est-à-dire que le serveur ne défait pas, dans son code,
 * ce que le schéma protège.
 *
 * Il n'invente aucun contrat : chaque assertion renvoie à un test SQL du même
 * répertoire, et à la ligne du plan ou des conventions dont elle vient.
 *
 * ── Ce qu'il éprouve, et à quel niveau ───────────────────────────────────────
 *
 * Au niveau du **dépôt** (`Depot`), pas des routes HTTP. C'est délibéré : les routes
 * changent de forme au fil du lot, la règle métier non. Deux points seulement sont
 * pris au niveau HTTP, parce qu'ils n'existent qu'à ce niveau — la traduction d'un
 * échec en réponse, et ce que cette réponse laisse voir (contrôle S12).
 *
 * ── Compilation ──────────────────────────────────────────────────────────────
 *
 * `src/` est en TypeScript ; ce banc d'essai est en JavaScript. Le fichier compile
 * donc `dist/` lui-même quand il manque ou qu'il est en retard sur `src/`, plutôt
 * que d'exiger un `npm run build` préalable : un test qui échoue parce qu'on a oublié
 * une commande apprend à ignorer les échecs.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  semerJeuEssai,
} from '../aide/base.mjs';

const executerFichier = promisify(execFile);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Pool du serveur, pointé sur la base d'essai : c'est le vrai `creerPool`. */
let pool;
/** Le dépôt, construit sur le catalogue réellement découvert dans la base d'essai. */
let depot;
/** Fonctions importées de `dist/` — nommées ici pour rester lisibles dans les tests. */
let avecTransaction;
let traduireErreur;

/** Périmètres de session, tels que L3 les résoudra. */
const site = {
  utilisateurId: 'rssi-site',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
};
const groupe = {
  utilisateurId: 'rssi-groupe',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: false,
};

/** Date du fichier `.ts` le plus récent de `src/` — sert à savoir si `dist/` est en retard. */
function plusRecent(repertoire) {
  let date = 0;
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    date = Math.max(date, entree.isDirectory() ? plusRecent(chemin) : statSync(chemin).mtimeMs);
  }
  return date;
}

/** Compile `src/` si `dist/` manque ou date d'avant la dernière modification. */
async function compilerSiNecessaire() {
  const cible = join(RACINE, 'dist', 'entites', 'index.js');
  let dateCible = 0;
  try {
    dateCible = statSync(cible).mtimeMs;
  } catch {
    dateCible = 0;
  }
  if (dateCible > plusRecent(join(RACINE, 'src'))) return;
  await executerFichier(process.execPath, [join(RACINE, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], {
    cwd: RACINE,
  });
}

before(async () => {
  await compilerSiNecessaire();
  const entites = await import(`file://${join(RACINE, 'dist', 'entites', 'index.js')}`);
  const acces = await import(`file://${join(RACINE, 'dist', 'db', 'pool.js')}`);
  const erreurs = await import(`file://${join(RACINE, 'dist', 'erreurs', 'index.js')}`);
  avecTransaction = acces.avecTransaction;
  traduireErreur = erreurs.traduireErreur;

  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  pool = acces.creerPool({
    hote: process.env.BASE_HOTE ?? '127.0.0.1',
    port: Number.parseInt(process.env.BASE_PORT ?? '5432', 10),
    nom: base.nom,
    utilisateur: process.env.BASE_UTILISATEUR ?? 'grc_app',
    motDePasse: process.env.BASE_MOT_DE_PASSE ?? 'dev',
    ssl: { mode: 'desactive', ca: null },
    poolMax: 5,
    delaiConnexionMs: 5000,
    delaiInactiviteMs: 5000,
    delaiRequeteMs: 15000,
    delaiTransactionInactiveMs: 15000,
    delaiVerrouMs: 5000,
    nomApplication: 'cyber-grc-essai-depot',
    proprietaire: null,
  });

  const catalogue = await avecTransaction(
    pool,
    acces.PERIMETRE_SYSTEME,
    (client) => entites.chargerCatalogue(client),
    { lectureSeule: true },
  );
  // Le garde-fou du module doit être muet sur une base migrée : s'il parle, ce n'est
  // pas le test qui est faux, c'est le registre qui a divergé du schéma (contrôle S16).
  assert.deepEqual(entites.verifierRegistre(catalogue), []);
  depot = new entites.Depot(catalogue);
});

after(async () => {
  await pool?.end().catch(() => {});
  await base?.fermer();
});

/** Lit la version courante d'un risque, hors de toute écriture. */
async function versionDe(p, identifiant) {
  return avecTransaction(pool, p, async (client) => {
    const resultat = await client.query('select version from risques where id = $1', [identifiant]);
    return resultat.rows[0]?.version ?? null;
  });
}

/* =====================================================================
 *  Les trois causes du « UPDATE 0 », vues du dépôt
 * ===================================================================== */

describe('Le dépôt distingue les trois causes (miroir de update-zero.test.mjs)', () => {
  test('version périmée → motif « conflit_version », et la version réelle est rendue', async () => {
    const version = await versionDe(site, 'RISK-A');
    const erreur = await erreurAttendue(
      avecTransaction(pool, site, (client) =>
        depot.modifier(client, site, 'risques', 'RISK-A', version - 1, { nom: 'tentative périmée' })),
    );
    assert.equal(erreur.motif, 'conflit_version');
    assert.equal(erreur.versionActuelle, version, 'L’interface a besoin de la version réelle pour recharger.');
  });

  test('ligne d’une autre filiale, VISIBLE → motif « refus_perimetre », surtout pas un conflit', async () => {
    // Le constat Q-7, au niveau du serveur cette fois : sans cette distinction, le RSSI
    // groupe recevrait « modifié entre-temps, rechargez » pour une ligne que personne
    // n'a touchée et qu'il n'a pas le droit d'écrire.
    const version = await versionDe(groupe, 'RISK-B');
    assert.ok(version !== null, 'La ligne doit être LISIBLE du périmètre Groupe.');
    const erreur = await erreurAttendue(
      avecTransaction(pool, groupe, (client) =>
        depot.modifier(client, groupe, 'risques', 'RISK-B', version, { nom: 'écriture hors filiale active' })),
    );
    assert.equal(erreur.motif, 'refus_perimetre');
    assert.notEqual(erreur.motif, 'conflit_version');
  });

  test('ligne inconnue et ligne hors périmètre de lecture rendent le MÊME motif (S12)', async () => {
    const inconnue = await erreurAttendue(
      avecTransaction(pool, site, (client) =>
        depot.modifier(client, site, 'risques', 'RISK-NEXISTE-PAS', 1, { nom: 'x' })),
    );
    const cachee = await erreurAttendue(
      avecTransaction(pool, site, (client) => depot.modifier(client, site, 'risques', 'RISK-B', 1, { nom: 'x' })),
    );
    assert.equal(inconnue.motif, 'introuvable');
    assert.equal(cachee.motif, 'introuvable');
    assert.equal(
      inconnue.message,
      cachee.message,
      'Deux messages différents feraient de l’API un oracle d’existence inter-filiales.',
    );
  });
});

/* =====================================================================
 *  Le duel, au niveau du dépôt
 * ===================================================================== */

describe('Deux écritures concurrentes passent par le dépôt : une seule aboutit', () => {
  test('la seconde reçoit « conflit_version », et le travail de la première survit', async () => {
    // Deux transactions réelles, deux connexions distinctes du pool : c'est la
    // situation de deux navigateurs ouverts sur la même fiche.
    const version = await versionDe(site, 'RISK2-A');

    const gagnante = await avecTransaction(pool, site, (client) =>
      depot.modifier(client, site, 'risques', 'RISK2-A', version, { nom: 'analyse d’Alice' }));
    assert.equal(gagnante.nom, 'analyse d’Alice');

    const erreur = await erreurAttendue(
      avecTransaction(pool, site, (client) =>
        depot.modifier(client, site, 'risques', 'RISK2-A', version, { nom: 'analyse de Bob' })),
    );
    assert.equal(erreur.motif, 'conflit_version');

    const finale = await avecTransaction(pool, site, async (client) =>
      (await client.query("select nom from risques where id = 'RISK2-A'")).rows[0].nom);
    assert.equal(finale, 'analyse d’Alice', 'Le risque P1 : rien ne doit avoir été écrasé.');
  });

  test('le client ne fixe ni « version », ni « cree_par » : le dépôt REFUSE le champ', async () => {
    // Choix du lot L2, plus strict que la base — qui, elle, IGNORE ces colonnes
    // (`CONVENTIONS.md` §18.1, éprouvé par integrite-ecriture.test.mjs). Refuser à
    // l'entrée est légitime tant que le refus est explicite : c'est une entrée
    // malformée, pas une écriture silencieusement amputée.
    const version = await versionDe(site, 'RISK-A');
    for (const champ of ['version', 'cree_par', 'cree_le']) {
      const erreur = await erreurAttendue(
        avecTransaction(pool, site, (client) =>
          depot.modifier(client, site, 'risques', 'RISK-A', version, { [champ]: 'valeur forgée' })),
      );
      assert.equal(erreur.motif, 'donnee_invalide', `Le champ « ${champ} » doit être refusé.`);
    }
  });
});

/* =====================================================================
 *  Chargement initial
 * ===================================================================== */

describe('Chargement initial par le dépôt (miroir de chargement-filiale.test.mjs)', () => {
  test('le jeu de données de Toulouse ne contient AUCUN identifiant allemand', async () => {
    const jeu = await avecTransaction(pool, site, (client) => depot.chargerJeuDeDonnees(client, site), {
      lectureSeule: true,
    });

    // Le semis nomme les lignes allemandes « …-B » et porte leur filiale : on cherche
    // les deux, dans la charge utile entière, sans présumer de sa forme.
    const charge = JSON.stringify(jeu);
    assert.equal(charge.includes(FILIALE_B), false, 'La filiale allemande ne doit apparaître nulle part.');
    for (const identifiant of ['RISK-B', 'DOC-B', 'ACTIF-B', 'INC-B', 'PJ-B', 'MMO-B']) {
      assert.equal(charge.includes(`"${identifiant}"`), false, `${identifiant} ne doit pas être rendu.`);
    }

    // Contrôle de matière : la charge utile n'est pas vide, et elle porte bien les
    // lignes de Toulouse ET le socle de Groupe (l'erreur symétrique).
    assert.ok(charge.includes('"RISK-A"'), 'Les lignes de Toulouse doivent être rendues.');
    assert.ok(charge.includes('"DOC-G"'), 'Le socle de Groupe doit être rendu.');
    // Plancher, et non égalité : la valeur exacte dépend du registre d'entités, qui
    // bouge encore. Ce qui doit être vrai en toutes circonstances, c'est que la charge
    // utile n'est pas vide — sans quoi les quatre contrôles ci-dessus seraient
    // satisfaits par un chargement qui ne rend RIEN.
    const total = Object.values(jeu.volumes).reduce((somme, n) => somme + n, 0);
    assert.ok(total >= 20, `Charge utile anormalement maigre : ${total} enregistrements.`);
  });
});

/* =====================================================================
 *  Ce que l'échec laisse voir (contrôle S12)
 * ===================================================================== */

describe('Les erreurs ne renseignent pas l’attaquant (contrôle S12)', () => {
  test('un refus de la base devient un message sans table, sans SQL et sans pile', async () => {
    // On provoque un vrai refus PostgreSQL — déplacer une ligne vers une autre
    // filiale, refusé par le « with check » de la politique — et l'on regarde ce que
    // le traducteur d'erreurs en fait.
    const erreur = await erreurAttendue(
      avecTransaction(pool, site, (client) =>
        client.query('update risques set filiale_id = $2 where id = $1', ['RISK-A', FILIALE_B])),
    );
    assert.equal(erreur.code, '42501');

    const traduite = traduireErreur(erreur);
    const corps = JSON.stringify(traduite.corps());
    for (const interdit of ['risques', 'row-level security', 'pol_', 'update', 'pg_', 'at Object.']) {
      assert.equal(
        corps.toLowerCase().includes(interdit.toLowerCase()),
        false,
        `La réponse ne doit pas contenir « ${interdit} » : ${corps}`,
      );
    }
    assert.ok(traduite.detailJournal, 'Le détail existe — mais pour le journal technique, pas pour la réponse.');
  });

  test('la réponse est la MÊME pour une ligne absente et pour une ligne d’une autre filiale', async () => {
    // Renvoyer l'identifiant que l'appelant vient lui-même d'envoyer n'apprend rien à
    // personne ; ce qui ferait oracle, c'est que les DEUX réponses diffèrent. On les
    // compare donc à l'identifiant près, et l'on vérifie qu'aucune ne nomme la filiale
    // voisine.
    const cachee = traduireErreur(
      await erreurAttendue(
        avecTransaction(pool, site, (client) => depot.modifier(client, site, 'risques', 'RISK-B', 1, { nom: 'x' })),
      ),
    ).corps();
    const absente = traduireErreur(
      await erreurAttendue(
        avecTransaction(pool, site, (client) =>
          depot.modifier(client, site, 'risques', 'RISK-NEXISTE-PAS', 1, { nom: 'x' })),
      ),
    ).corps();

    assert.deepEqual({ ...cachee, identifiant: null }, { ...absente, identifiant: null });
    assert.equal(JSON.stringify(cachee).includes(FILIALE_B), false, 'La filiale voisine ne doit pas être nommée.');
    assert.equal(cachee.version_actuelle, undefined, 'Rendre la version confirmerait l’existence de la ligne.');
  });
});
