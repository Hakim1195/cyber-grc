/**
 * marquage.test.mjs — **LE SERVEUR ESTAMPILLE LA COTATION QUI PART** (action 25.3)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille est SÉPARÉE, et pourquoi elle est la plus importante
 * ════════════════════════════════════════════════════════════════════════
 *
 * `echelles.test.mjs` mesure ce que la BASE refuse. Celle-ci mesure ce que le
 * SERVEUR écrit — et c'est là que vit la seule décision de l'action 25.3 qu'un
 * déclencheur ne pouvait pas prendre.
 *
 * « L'appelant n'a rien dit » et « l'appelant a dit : pas d'échelle » sont deux
 * faits différents. Un `before insert` voit deux fois la même chose : une colonne
 * nulle. S'il remplissait, la reprise d'un export d'avant cette livraison
 * repartirait en base **estampillée de l'échelle du jour** — le produit
 * affirmerait qu'une cotation de 2024 a été produite sur la graduation publiée
 * hier, **dans l'outil qui sert de preuve en audit**. C'est le motif du constat
 * **Q-192**, et c'est pour cela que le marquage vit dans `src/entites/`, seule
 * couche qui connaît la différence.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Créer une cotation **sans nommer l'échelle** l'estampille de celle en vigueur |
 * | 2 | La nommer **explicitement nulle** la laisse nulle — c'est le chemin de la reprise |
 * | 3 | Créer **sans coter** n'estampille rien : il n'y a rien à graduer |
 * | 4 | **Re-coter** réestampille ; **ré-enregistrer à l'identique** ne touche à rien |
 * | 5 | La filiale qui a publié la sienne est estampillée de la SIENNE, pas du socle |
 *
 * ── ⚠️ LE §4 EST CELUI QUI POUVAIT MANQUER ────────────────────────────────
 *
 * Le marquage est appelé **après** `retirerLesInchangees`. Sans cela, ouvrir une
 * fiche et l'enregistrer sans rien changer aurait réestampillé la cotation avec
 * l'échelle du jour : le produit aurait alors affirmé qu'une analyse de 2024 a été
 * refaite aujourd'hui — sur la foi d'un clic qui n'a rien modifié.
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';

const executerFichier = promisify(execFile);
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let base;
let pool;
let depot;
let avecTransaction;

const site = {
  utilisateurId: 'rssi-site',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
};
const siteB = {
  utilisateurId: 'rssi-site-b',
  filialeId: FILIALE_B,
  filiales: [FILIALE_B],
  perimetreGroupe: false,
  administrationGroupe: false,
};

function plusRecent(repertoire) {
  let date = 0;
  for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    date = Math.max(date, entree.isDirectory() ? plusRecent(chemin) : statSync(chemin).mtimeMs);
  }
  return date;
}

async function compilerSiNecessaire() {
  const cible = join(RACINE, 'dist', 'entites', 'index.js');
  let dateCible = 0;
  try {
    dateCible = statSync(cible).mtimeMs;
  } catch {
    dateCible = 0;
  }
  if (dateCible > plusRecent(join(RACINE, 'src'))) return;
  await executerFichier(
    process.execPath,
    [join(RACINE, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'],
    { cwd: RACINE },
  );
}

before(async () => {
  await compilerSiNecessaire();
  const entites = await import(`file://${join(RACINE, 'dist', 'entites', 'index.js')}`);
  const acces = await import(`file://${join(RACINE, 'dist', 'db', 'pool.js')}`);
  avecTransaction = acces.avecTransaction;

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
    nomApplication: 'cyber-grc-essai-echelles',
    proprietaire: null,
  });

  const catalogue = await avecTransaction(
    pool,
    acces.PERIMETRE_SYSTEME,
    (client) => entites.chargerCatalogue(client),
    { lectureSeule: true },
  );
  // ⚠️ Contrôle de matière : sans porteur découvert, tous les essais ci-dessous
  // passeraient « parce qu'il n'y a rien à marquer ». Un essai qui couvre une règle
  // sans jamais la faire décider ne la couvre pas (constat Q-210).
  assert.ok(
    catalogue.porteursEchelle.length >= 6,
    'f_echelle_porteurs() n’a rendu aucun porteur : le marquage ne serait mesuré nulle part',
  );
  assert.deepEqual(entites.verifierRegistre(catalogue), []);
  depot = new entites.Depot(catalogue);
});

after(async () => {
  await pool?.end().catch(() => {});
  await base?.fermer();
});

/** Relit les deux colonnes d'échelle d'un risque. */
async function echellesDe(perimetreSession, identifiant) {
  return avecTransaction(pool, perimetreSession, async (client) => {
    const { rows } = await client.query(
      'select echelle_f_id, echelle_g_id, f_frequence, g_gravite, version from risques where id = $1',
      [identifiant],
    );
    return rows[0] ?? null;
  });
}

/** L'échelle en vigueur d'un sujet, vue d'un périmètre. */
async function enVigueur(perimetreSession, sujet) {
  return avecTransaction(pool, perimetreSession, async (client) => {
    const { rows } = await client.query('select f_echelle_en_vigueur($1, $2) as id', [
      sujet,
      perimetreSession.filialeId,
    ]);
    return rows[0].id;
  });
}

describe('Le dépôt estampille la cotation qui part', () => {
  test('§1 — créer une cotation sans nommer l’échelle l’estampille', async () => {
    const cree = await avecTransaction(pool, site, (client) =>
      depot.creer(client, site, 'risques', {
        nom: 'Panne du poste de supervision',
        f_frequence: 2,
        g_gravite: 3,
        m_maitrise: 0.3,
      }),
    );

    const ligne = await echellesDe(site, cree.id);
    const socleV = await enVigueur(site, 'vraisemblance');
    const socleG = await enVigueur(site, 'gravite');

    assert.equal(ligne.echelle_f_id, socleV);
    assert.equal(ligne.echelle_g_id, socleG);
    // ⚠️ Et les valeurs ne bougent pas : marquer, ce n'est pas convertir.
    assert.equal(Number(ligne.f_frequence), 2);
    assert.equal(Number(ligne.g_gravite), 3);
  });

  test('§2 — nommer l’échelle explicitement NULLE la laisse nulle', async () => {
    // C'est le chemin de la reprise d'un export d'avant la v24 : le fichier porte la
    // colonne, vide. La remplir attribuerait la graduation d'aujourd'hui à une cotation
    // produite on ne sait quand — le défaut que l'action 25.3 existe pour fermer.
    const cree = await avecTransaction(pool, site, (client) =>
      depot.creer(client, site, 'risques', {
        nom: 'Cotation historique reprise d’un export',
        f_frequence: 2,
        g_gravite: 3,
        echelle_f_id: null,
        echelle_g_id: null,
      }),
    );

    const ligne = await echellesDe(site, cree.id);
    assert.equal(ligne.echelle_f_id, null, 'le dépôt a écrasé un « pas d’échelle » explicite');
    assert.equal(ligne.echelle_g_id, null);
  });

  test('§3 — créer sans coter n’estampille rien', async () => {
    const cree = await avecTransaction(pool, site, (client) =>
      depot.creer(client, site, 'risques', { nom: 'Risque identifié, pas encore coté' }),
    );
    const ligne = await echellesDe(site, cree.id);
    assert.equal(ligne.echelle_f_id, null);
    assert.equal(ligne.echelle_g_id, null);
  });

  test('§4 — re-coter réestampille ; ré-enregistrer à l’identique ne touche à rien', async () => {
    const cree = await avecTransaction(pool, site, (client) =>
      depot.creer(client, site, 'risques', {
        nom: 'Risque révisé',
        f_frequence: 2,
        g_gravite: 3,
        echelle_f_id: null,
        echelle_g_id: null,
      }),
    );
    const apresCreation = await echellesDe(site, cree.id);
    assert.equal(apresCreation.echelle_g_id, null);

    // (a) ré-enregistrer la MÊME gravité : rien ne part, donc rien n'est marqué.
    await avecTransaction(pool, site, (client) =>
      depot.modifier(client, site, 'risques', cree.id, apresCreation.version, { g_gravite: 3 }),
    );
    const apresIdentique = await echellesDe(site, cree.id);
    assert.equal(
      apresIdentique.echelle_g_id,
      null,
      'ouvrir une fiche et l’enregistrer sans rien changer a réattribué une échelle',
    );
    assert.equal(apresIdentique.version, apresCreation.version, 'et rien n’a été écrit');

    // (b) coter AUTREMENT : la cotation est produite maintenant, elle porte
    //     l'échelle d'aujourd'hui.
    await avecTransaction(pool, site, (client) =>
      depot.modifier(client, site, 'risques', cree.id, apresIdentique.version, { g_gravite: 4 }),
    );
    const apresRecotation = await echellesDe(site, cree.id);
    assert.equal(apresRecotation.echelle_g_id, await enVigueur(site, 'gravite'));
    // ⚠️ Et la vraisemblance, qu'on n'a pas touchée, reste NON TRACÉE : on marque la
    // cotation qu'on vient de produire, pas la ligne entière.
    assert.equal(apresRecotation.echelle_f_id, null);
  });

  test('§5 — la filiale qui a publié la sienne est estampillée de la SIENNE', async () => {
    await avecTransaction(pool, siteB, async (client) => {
      await client.query(
        `insert into echelles (id, filiale_id, sujet, nom, revision, statut)
             values ('ECHL-LOCB', $1, 'gravite', 'Gravité — filiale B', 2, 'brouillon')`,
        [FILIALE_B],
      );
      await client.query(
        `insert into echelle_niveaux (filiale_id, echelle_id, valeur, libelle)
             values ($1, 'ECHL-LOCB', 1, 'Faible'), ($1, 'ECHL-LOCB', 5, 'Maximale')`,
        [FILIALE_B],
      );
      await client.query(
        `update echelles set statut = 'en_vigueur', en_vigueur_le = current_date
           where id = 'ECHL-LOCB'`,
      );
    });

    // ⚠️ La valeur 5 n'existe PAS sur le socle du Groupe : si le dépôt estampillait le
    // socle, la base refuserait la ligne. L'essai mesure donc les deux moitiés à la fois.
    const cree = await avecTransaction(pool, siteB, (client) =>
      depot.creer(client, siteB, 'risques', { nom: 'Coté sur l’échelle locale', g_gravite: 5 }),
    );
    const ligne = await echellesDe(siteB, cree.id);
    assert.equal(ligne.echelle_g_id, 'ECHL-LOCB');

    // Et la filiale A continue de coter sur le socle : la publication de B ne déborde pas.
    const chezA = await enVigueur(site, 'gravite');
    assert.notEqual(chezA, 'ECHL-LOCB');
  });
});
