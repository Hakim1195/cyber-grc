/**
 * connecteurs.test.mjs — **LA COLLECTE AUTOMATIQUE DE PREUVE** (lots L22.4 et L23)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Action | Propriété |
 * |---|---|---|
 * | 1 | 23.4 | **AUCUN chemin d'échec ne rend « conforme »** — balayé sur le REGISTRE |
 * | 2 | 22.4 | Les deux vocabulaires — base et registre — se confrontent DANS LES DEUX SENS |
 * | 3 | 23.1 | La fraîcheur est dérivée, et « jamais constaté » n'est pas « fraîche » |
 * | 4 | 23.2 | Le PASSAGE au rouge crée une action ; rester rouge n'en crée pas |
 * | 5 | 23.4 | « indéterminé » ne crée RIEN — une panne de réseau n'accuse personne |
 * | 6 | 22.4 | Un réglage que le produit ne lit pas est REFUSÉ, pas ignoré |
 * | 7 | 23.1 | La route écrit le constat **même quand il est indéterminé** |
 *
 * ── ⚠️ LE §1 EST CELUI QUI TIENT LE LOT ───────────────────────────────────
 *
 * Il ne cite aucun exécuteur : il parcourt `EXECUTEURS`, le registre lui-même, et
 * soumet à chacun un monde qui échoue sur tout. Écrire « sauvegarde, antivirus,
 * annuaire » aurait laissé le quatrième exécuteur hors de l'épreuve le jour où on
 * l'ajoute — et c'est précisément ce jour-là que la règle compte.
 */

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
let monte;
let executeurs;

function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

async function ecrire(travail) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    travail,
    { annuler: false },
  );
}

/** Un monde qui échoue sur TOUT. C'est l'épreuve du §1. */
const MONDE_MORT = {
  plusRecenteEcriture: async () => {
    throw new Error('ENOENT: le chemin est inatteignable');
  },
  antivirus: async () => {
    throw new Error('le démon ne répond pas');
  },
  effectifDuGroupe: async () => {
    throw new Error("l'annuaire est injoignable");
  },
  maintenant: () => new Date(),
};

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  executeurs = await moduleCompile('connecteurs/executeurs.js');
  monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
});

after(async () => {
  await monte?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — AUCUN CHEMIN D'ÉCHEC NE REND « CONFORME » (critère 23.4)
 * ===================================================================== */

describe('§1 — le mode dégradé', () => {
  test('aucun exécuteur du REGISTRE ne rend « conforme » sur un monde mort', async () => {
    const registre = [...executeurs.EXECUTEURS.values()];
    // ⚠️ Un balayage qui ne trouve rien passe pour vert : on exige que le registre
    // soit peuplé avant de conclure quoi que ce soit de son parcours.
    assert.ok(registre.length >= 3, `le registre ne porte que ${registre.length} exécuteur(s)`);

    for (const executeur of registre) {
      /* ⚠️ **UNE CONFIGURATION RÉELLEMENT VALIDE**, et la première rédaction de ces
       * quatre lignes ne l'était pas : elle écrivait « GRC-ESSAI » dans TOUT réglage
       * dont le nom n'était pas « chemin » — y compris `age_max_heures`, qui attend un
       * nombre. L'exécuteur rendait donc « indéterminé » pour CONFIGURATION INCOMPLÈTE,
       * sans jamais interroger la source.
       *
       * Mesuré : contre la mutation « une source injoignable rend conforme », ce §
       * restait **vert**. Il couvrait la règle sans jamais la faire décider — c'est le
       * constat **Q-210**, dans l'essai écrit pour tenir le critère le plus important
       * du lot. Chaque réglage reçoit désormais une valeur de son propre type.
       */
      const configuration = {};
      for (const reglage of executeur.reglages) {
        configuration[reglage.nom] = reglage.defaut !== undefined ? reglage.defaut : '/n-existe-pas';
      }
      const constat = await executeur.executer(configuration, {
        config: {},
        monde: MONDE_MORT,
      });
      assert.equal(
        constat.verdict,
        'indetermine',
        `« ${executeur.genre} » rend « ${constat.verdict} » sur une source morte`,
      );
    }
  });

  test('une configuration INCOMPLÈTE rend « indéterminé », jamais « conforme »', async () => {
    for (const executeur of executeurs.EXECUTEURS.values()) {
      const obligatoires = executeur.reglages.filter((r) => r.obligatoire);
      if (obligatoires.length === 0) continue;
      const constat = await executeur.executer({}, { config: {}, monde: MONDE_MORT });
      assert.equal(constat.verdict, 'indetermine');
      assert.equal(constat.detail.motif, 'configuration_incomplete');
    }
  });

  test("l'antivirus qui répond SANS dater sa base rend « indéterminé »", async () => {
    // ⚠️ La tentation est de conclure « il répond, donc tout va bien ». C'est
    // exactement la fausse assurance du critère 23.4.
    const antivirus = executeurs.executeurDe('antivirus');
    const constat = await antivirus.executer(
      {},
      {
        config: {},
        monde: {
          ...MONDE_MORT,
          antivirus: async () => ({ version: 'ClamAV 1.4.2', signaturesLe: null }),
        },
      },
    );
    assert.equal(constat.verdict, 'indetermine');
    assert.equal(constat.detail.motif, 'date_des_signatures_inconnue');
  });

  test('un répertoire LISIBLE et VIDE est « non conforme », pas « indéterminé »', async () => {
    // La source a répondu, et elle a répondu « rien ». C'est un contrôle en échec,
    // pas un contrôle qu'on n'a pas pu faire — et la distinction est tout ce lot.
    const sauvegarde = executeurs.executeurDe('sauvegarde');
    const constat = await sauvegarde.executer(
      { chemin: '/quelque/part' },
      { config: {}, monde: { ...MONDE_MORT, plusRecenteEcriture: async () => null } },
    );
    assert.equal(constat.verdict, 'non_conforme');
    assert.equal(constat.detail.motif, 'aucun_depot');
  });
});

/* =====================================================================
 *  §2 — LES DEUX VOCABULAIRES SE CONFRONTENT (action 22.4)
 * ===================================================================== */

describe('§2 — la base et le registre', () => {
  test('tout genre admis par la base est servi, et réciproquement', async () => {
    const predicat = await ecrire(async (c) => {
      const { rows } = await c.query(
        `select pg_get_constraintdef(oid) as d from pg_constraint
          where conrelid = 'connecteurs'::regclass and conname = 'ck_connecteurs_genre'`,
      );
      return rows[0]?.d ?? '';
    });
    assert.notEqual(predicat, '', 'ck_connecteurs_genre est introuvable');

    const servis = [...executeurs.EXECUTEURS.keys()];
    // Sens 1 — un exécuteur qu'aucun genre n'admet : le connecteur serait INCRÉABLE.
    for (const genre of servis) {
      assert.ok(
        predicat.includes(`'${genre}'`),
        `le registre sert « ${genre} », que la base n'admet pas`,
      );
    }
    // Sens 2 — un genre admis que personne ne sert : le connecteur a l'air en place
    // et chaque passage échoue. C'est le sens qu'on oublie.
    const admis = predicat
      .split("'")
      .filter((_, i) => i % 2 === 1)
      .map((v) => v.trim());
    for (const genre of admis) {
      assert.ok(
        servis.includes(genre),
        `la base admet « ${genre} », qu'aucun exécuteur ne sert`,
      );
    }
  });

  test('les réglages déclarés par le registre sont ceux que la base admet', async () => {
    for (const executeur of executeurs.EXECUTEURS.values()) {
      const clefs = await ecrire(async (c) => {
        const { rows } = await c.query('select f_connecteur_clefs($1) as k', [executeur.genre]);
        return rows[0]?.k ?? null;
      });
      assert.ok(clefs !== null, `la base ne déclare aucun réglage pour « ${executeur.genre} »`);
      const declares = executeur.reglages.map((r) => r.nom).sort();
      assert.deepEqual(
        [...clefs].sort(),
        declares,
        `« ${executeur.genre} » : la base et le registre ne déclarent pas les mêmes réglages`,
      );
    }
  });
});

/* =====================================================================
 *  §3 — LA FRAÎCHEUR (action 23.1)
 * ===================================================================== */

describe('§3 — une preuve périmée redevient absente', () => {
  test('les quatre cas de la dérivation', async () => {
    const lire = async (expression, jours) =>
      await ecrire(async (c) => {
        const { rows } = await c.query(
          `select f_collecte_fraicheur(${expression}, $1) as f`,
          [jours],
        );
        return rows[0].f;
      });

    assert.equal(await lire('null', 7), 'jamais_constate');
    assert.equal(await lire('now()', 7), 'fraiche');
    assert.equal(await lire("now() - interval '3 days'", 7), 'fraiche');
    // ⚠️ Le cas qui tient le critère : une preuve de huit jours sous une fraîcheur
    // de sept. Une sauvegarde constatée réussie il y a onze mois n'est pas une
    // preuve de sauvegarde.
    assert.equal(await lire("now() - interval '8 days'", 7), 'perimee');
  });
});

/* =====================================================================
 *  §4 et §5 — LE PASSAGE AU ROUGE (actions 23.2 et 23.4)
 * ===================================================================== */

describe('§4 — le passage au rouge crée une action', () => {
  async function semerConnecteur(genre, configuration) {
    return await ecrire(async (c) => {
      // ⚠️ **UN SEUL CONNECTEUR PAR GENRE ET PAR FILIALE** — et le semis du banc en
      // pose déjà un de genre « sauvegarde » dans chacune, pour que le balayage de
      // cloisonnement ait de la matière. On retire donc avant de poser, au lieu de
      // contourner la règle en inventant un genre : c'est elle qu'on veut garder.
      await c.query('delete from connecteurs where genre = $1', [genre]);
      const { rows } = await c.query(
        `insert into connecteurs (filiale_id, genre, nom, mesure_id, configuration)
         values ($1, $2, $3, 'MESURE-G', $4::jsonb) returning id`,
        [FILIALE_A, genre, `Essai ${genre}`, JSON.stringify(configuration ?? {})],
      );
      return rows[0].id;
    });
  }

  async function compterActions() {
    return await ecrire(async (c) => {
      const { rows } = await c.query(
        "select count(*)::int as n from actions where titre like 'Controle automatique%'",
      );
      return rows[0].n;
    });
  }

  async function constater(connecteurId, verdict) {
    await ecrire(async (c) => {
      await c.query(
        `insert into collectes (filiale_id, connecteur_id, mesure_id, verdict, fraicheur_jours)
         values ($1, $2, 'MESURE-G', $3, 7)`,
        [FILIALE_A, connecteurId, verdict],
      );
    });
  }

  test('vert → rouge ouvre UNE action ; rouge → rouge n’en ouvre pas', async () => {
    const id = await semerConnecteur('sauvegarde', { chemin: '/tmp' });
    const avant = await compterActions();

    await constater(id, 'conforme');
    assert.equal(await compterActions(), avant, 'un constat conforme a ouvert une action');

    await constater(id, 'non_conforme');
    assert.equal(await compterActions(), avant + 1, 'le passage au rouge n’a rien ouvert');

    // ⚠️ Le second constat rouge n'ouvre RIEN : un connecteur qui passe toutes les
    // cinq minutes sur un contrôle rouge créerait 288 actions par jour, et le plan
    // d'actions deviendrait illisible — y compris le jour où il dit quelque chose.
    await constater(id, 'non_conforme');
    assert.equal(await compterActions(), avant + 1, 'rester rouge a ouvert une action de plus');
  });

  test("« indéterminé » ne crée RIEN — une panne n'accuse personne", async () => {
    const id = await semerConnecteur('antivirus', {});
    const avant = await compterActions();
    await constater(id, 'indetermine');
    assert.equal(await compterActions(), avant);
    // Et il ne masque pas le passage suivant : le rouge qui vient après ouvre bien.
    await constater(id, 'non_conforme');
    assert.equal(await compterActions(), avant + 1);
  });

  test("l'action ouverte est RATTACHÉE à la mesure surveillée", async () => {
    const rattachee = await ecrire(async (c) => {
      const { rows } = await c.query(
        `select mesure_id from actions where titre like 'Controle automatique%'
          order by cree_le desc limit 1`,
      );
      return rows[0]?.mesure_id ?? null;
    });
    // Sans ce rattachement, l'action serait à ouvrir, à lire, puis à relier à la
    // main par quelqu'un qui devine.
    assert.equal(rattachee, 'MESURE-G');
  });
});

/* =====================================================================
 *  §6 — UN RÉGLAGE QUE LE PRODUIT NE LIT PAS EST REFUSÉ (action 22.4)
 * ===================================================================== */

describe('§6 — le vocabulaire des réglages est clos', () => {
  test('une clef intruse est REFUSÉE, et le motif est le secret', async () => {
    let refus = null;
    try {
      await ecrire(async (c) => {
        await c.query(
          `insert into connecteurs (filiale_id, genre, nom, mesure_id, configuration)
           values ($1, 'antivirus', 'Intrus', 'MESURE-G',
                   '{"age_signatures_max_jours": 7, "mot_de_passe": "secret"}'::jsonb)`,
          [FILIALE_A],
        );
      });
    } catch (erreur) {
      refus = erreur;
    }
    // ⚠️ `connecteurs` voyage dans le fichier d'échange : une configuration ouverte
    // y aurait porté un mot de passe EN CLAIR. Et la parade n'est pas d'interdire ce
    // qui RESSEMBLE à un secret — `motdepasse_2` passerait.
    assert.ok(refus !== null, 'une clef intruse a été acceptée');
    assert.match(String(refus.message), /ne lit pas/u);
  });

  test('une configuration ORDINAIRE passe — une barrière qui refuse tout ne vaut rien', async () => {
    const id = await ecrire(async (c) => {
      const { rows } = await c.query(
        `insert into connecteurs (filiale_id, genre, nom, mesure_id, configuration)
         values ($1, 'annuaire', 'Annuaire du groupe', 'MESURE-G',
                 '{"groupe": "GRC-ADMIN", "effectif_min": 2}'::jsonb) returning id`,
        [FILIALE_A],
      );
      return rows[0].id;
    });
    assert.ok(typeof id === 'string' && id.length > 0);
  });
});

/* =====================================================================
 *  §7 — LA ROUTE ÉCRIT LE CONSTAT, MÊME INDÉTERMINÉ (action 23.1)
 * ===================================================================== */

describe('§7 — la route de collecte', () => {
  /**
   * ⚠️ **UN SEUL CONNECTEUR PAR GENRE ET PAR FILIALE** — l'unicité posée par la
   * `054`. Deux connecteurs d'annuaire rapporteraient deux verdicts sur la même
   * mesure, et rien ne dirait lequel fait foi. Le §4 en a déjà posé un de chaque
   * genre : ce §-ci les retire d'abord, au lieu de contourner la règle en
   * inventant un quatrième genre — ce qui aurait éprouvé autre chose.
   */
  async function poser(genre, configuration) {
    return await ecrire(async (c) => {
      await c.query('delete from connecteurs where genre = $1', [genre]);
      const { rows } = await c.query(
        `insert into connecteurs (filiale_id, genre, nom, mesure_id, configuration)
         values ($1, $2, $3, 'MESURE-G', $4::jsonb) returning id`,
        [FILIALE_A, genre, `Route ${genre}`, JSON.stringify(configuration)],
      );
      return rows[0].id;
    });
  }

  test("un constat indéterminé est ÉCRIT : un silence n'est pas une information", async () => {
    // Un connecteur qui vise un chemin inexistant : la source ne répondra pas.
    const id = await poser('sauvegarde', {
      chemin: join(tmpdir(), 'grc-essai-absent-' + Date.now()),
    });

    const { statut, corps } = await monte.appeler('POST', `/api/connecteurs/${id}/collecter`, {});
    assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
    assert.equal(corps.verdict, 'indetermine');
    // ⚠️ Ne rien écrire laisserait la dernière trace être le succès de la veille :
    // l'écran dirait « conforme, il y a un jour » pendant que la source est morte.
    assert.ok(typeof corps.collecteId === 'string' && corps.collecteId.length > 0);

    const historique = await monte.appeler('GET', `/api/connecteurs/${id}/historique`);
    assert.equal(historique.statut, 200);
    assert.equal(historique.corps.verdictCourant, 'indetermine');
    assert.equal(historique.corps.constats.length, 1);
  });

  test('un dépôt réellement écrit rend « conforme », et la fraîcheur suit', async () => {
    const repertoire = await fs.mkdtemp(join(tmpdir(), 'grc-sauvegarde-'));
    await fs.writeFile(join(repertoire, 'sauvegarde.dump'), 'x');
    const id = await poser('sauvegarde', { chemin: repertoire, age_max_heures: 24 });

    const { statut, corps } = await monte.appeler('POST', `/api/connecteurs/${id}/collecter`, {});
    assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
    assert.equal(corps.verdict, 'conforme');

    const etat = await monte.appeler('GET', '/api/connecteurs/etat');
    assert.equal(etat.statut, 200);
    const vu = etat.corps.connecteurs.find((c) => c.id === id);
    assert.ok(vu, 'le connecteur exécuté est absent de l’état');
    assert.equal(vu.fraicheur, 'fraiche');
    assert.equal(vu.dernierVerdict, 'conforme');
    // Et le genre est SERVI : un connecteur qu'aucun exécuteur ne sert est dit.
    assert.equal(vu.servi, true);

    await fs.rm(repertoire, { recursive: true, force: true });
  });

  test('un connecteur INCONNU rend 404, jamais 403', async () => {
    // Distinguer « absent » de « interdit » serait un oracle d'existence entre filiales.
    const { statut } = await monte.appeler('POST', '/api/connecteurs/CONN-inexistant/collecter', {});
    assert.equal(statut, 404);
  });
});
