/**
 * oracle.test.mjs — LA RECHERCHE GLOBALE EST UN ORACLE (lot L17, action A3)
 *
 * ── Pourquoi ce fichier porte ce nom ────────────────────────────────────────
 *
 * Le `docs/PLAN_EXECUTION.md` §3 a repoussé cette action pendant deux vagues,
 * avec un motif écrit : *« une recherche est un oracle, c'est la surface la plus
 * propice à une fuite entre filiales »*. Une recherche ne fuit pas seulement en
 * RENDANT une ligne du voisin : elle fuit en disant **combien** il y en a, ou
 * simplement qu'il y en a.
 *
 * Les contrôles vont donc par PAIRES. Un essai qui vérifierait seulement
 * « Toulouse ne voit pas la ligne allemande » passerait au vert sur une
 * recherche qui ne rend jamais rien — c'est le motif du constat Q-210, et il a
 * déjà coûté un passage de porte : *un essai qui couvre une règle sans jamais la
 * faire décider ne la couvre pas*. Chaque contrôle négatif a donc son **témoin
 * positif**, sur le même terme, à la même seconde.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Aucune fuite entre filiales — **et le témoin trouve bien la ligne** |
 * | 2 | Les DROITS bornent : un domaine fermé ne rend rien — **et l'ouvrir rend** |
 * | 3 | Les jokers de `like` sont neutralisés : « % » ne rend pas tout |
 * | 4 | Le volume est BORNÉ, et la troncature se DIT |
 * | 5 | La recherche consomme le budget de trace du sondage |
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

let base;
let recherche;
let entites;

/** Un terme qui n'existe QUE chez le voisin allemand. */
const TERME_ALLEMAND = 'Zeppelinwerk';
/** Un terme qui n'existe QUE à Toulouse. */
const TERME_TOULOUSAIN = 'Pyrenaeus';

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  recherche = await moduleCompile('recherche/index.js');
  entites = await moduleCompile('entites/index.js');

  const applicatif = await base.connexion('app');

  // Une ligne par filiale, au nom reconnaissable. ⚠️ `{ annuler: false }` :
  // `avecPerimetre()` annule par défaut, et le semis disparaîtrait.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query('insert into risques (id, filiale_id, nom) values ($1,$2,$3)', [
        'RSK-TLS-ORACLE',
        FILIALE_A,
        `Risque ${TERME_TOULOUSAIN} sur la ligne 2`,
      ]);
    },
    { annuler: false },
  );

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query('insert into risques (id, filiale_id, nom) values ($1,$2,$3)', [
        'RSK-DEU-ORACLE',
        FILIALE_B,
        `Risiko ${TERME_ALLEMAND} in der Halle`,
      ]);
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/**
 * Périmètre au format de l'API — `utilisateurId`, pas `utilisateur`.
 *
 * ⚠️ Deux formes coexistent, et elles ne sont pas interchangeables :
 * `perimetre()` de `test/aide/base.mjs` sert à `base.avecPerimetre()` (les
 * réglages `grc.*`), tandis que `monterGreffon()` reçoit la forme que
 * `PerimetreSession` décrit. Mélanger les deux rend un 500 dont la pile
 * désigne `validerPerimetre`, et pas la ligne fautive.
 */
function perimetreApi(utilisateurId, filialeId, filiales) {
  return {
    utilisateurId,
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/** Joue `chercher()` sous un périmètre donné, avec tous les domaines ouverts. */
async function chercherSous(perim, terme, peutLire = () => true) {
  const applicatif = await base.connexion('app');
  return await base.avecPerimetre(applicatif, perim, async (c) => {
    const catalogue = await entites.chargerCatalogue(c);
    return await recherche.chercher(c, catalogue, peutLire, terme);
  });
}

/* =====================================================================
 *  §1 — Aucune fuite entre filiales, ET le témoin trouve
 * ===================================================================== */

describe('§1 — la recherche ne franchit pas la frontière des filiales', () => {
  test('Toulouse ne trouve RIEN de ce qui n’existe qu’en Allemagne', async () => {
    const trouves = await chercherSous(
      perimetre('rssi-tls', FILIALE_A, [FILIALE_A]),
      TERME_ALLEMAND,
    );
    assert.deepEqual(
      trouves.map((r) => r.id),
      [],
      'Une ligne de la filiale voisine est ressortie : c’est une fuite entre filiales, la ' +
        'première classe du §0 bis.',
    );
  });

  test('TÉMOIN POSITIF — une session qui PORTE l’Allemagne trouve la même ligne', async () => {
    // Sans ce contrôle, le précédent serait vert sur une recherche qui ne rend
    // jamais rien. C'est le motif du constat Q-210, et il a coûté un passage.
    const trouves = await chercherSous(
      perimetre('rssi-groupe', FILIALE_B, [FILIALE_A, FILIALE_B]),
      TERME_ALLEMAND,
    );
    assert.deepEqual(
      trouves.map((r) => r.id),
      ['RSK-DEU-ORACLE'],
      'La recherche ne trouve rien alors que la ligne est dans le périmètre : le contrôle ' +
        'négatif ci-dessus ne mesurerait donc rien.',
    );
  });

  test('ET LE COMPTE NE FUIT PAS NON PLUS : Toulouse ne voit que la sienne', async () => {
    // Une recherche fuit aussi en disant COMBIEN il y en a ailleurs. On cherche
    // un terme présent des deux côtés — « Risi » ne l'est pas ; on prend donc le
    // terme toulousain et on vérifie l'exactitude du compte.
    const trouves = await chercherSous(
      perimetre('rssi-tls', FILIALE_A, [FILIALE_A]),
      TERME_TOULOUSAIN,
    );
    assert.equal(trouves.length, 1);
    assert.equal(trouves[0].id, 'RSK-TLS-ORACLE');
  });

  test('AUCUNE requête de recherche ne nomme de filiale — c’est la RLS qui borne', async () => {
    // Contrôle de FORME, et il a sa raison : un filtre applicatif serait une
    // barrière que le prochain chemin contournerait. La propriété se tient dans
    // le code source, elle ne se déduit pas d'un résultat.
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'recherche', 'index.ts'),
      'utf8',
    );
    const sql = source.slice(source.indexOf('const morceaux'), source.indexOf('const resultat'));
    assert.equal(
      /filiale/i.test(sql),
      false,
      'La requête de recherche nomme une filiale. Le cloisonnement doit venir de la RLS, ' +
        'jamais d’un filtre écrit ici.',
    );
  });
});

/* =====================================================================
 *  §2 — Les droits bornent, et l'ouverture rend
 * ===================================================================== */

describe('§2 — un domaine fermé ne rend rien, un domaine ouvert rend', () => {
  test('sans le domaine « risques », la ligne toulousaine n’existe pas', async () => {
    const trouves = await chercherSous(
      perimetre('contrib', FILIALE_A, [FILIALE_A]),
      TERME_TOULOUSAIN,
      (domaine) => domaine !== 'risques',
    );
    assert.deepEqual(
      trouves.map((r) => r.id),
      [],
      'Un domaine que la session ne peut pas lire est ressorti par la recherche : elle ' +
        'renseigne alors sur des écrans qu’on ne peut pas ouvrir.',
    );
  });

  test('TÉMOIN — avec le domaine, la même recherche rend la ligne', async () => {
    const trouves = await chercherSous(
      perimetre('rssi-tls', FILIALE_A, [FILIALE_A]),
      TERME_TOULOUSAIN,
      (domaine) => domaine === 'risques',
    );
    assert.deepEqual(trouves.map((r) => r.id), ['RSK-TLS-ORACLE']);
  });

  test('aucun domaine ouvert : la recherche rend une liste VIDE, pas une erreur', async () => {
    const trouves = await chercherSous(
      perimetre('sans-droit', FILIALE_A, [FILIALE_A]),
      TERME_TOULOUSAIN,
      () => false,
    );
    assert.deepEqual(trouves, []);
  });
});

/* =====================================================================
 *  §3 — Les jokers de `like` sont neutralisés
 * ===================================================================== */

describe('§3 — « % » ne rend pas tout', () => {
  test('la fonction de neutralisation échappe les trois signes', () => {
    assert.equal(recherche.neutraliserJokers('100%'), '100\\%');
    assert.equal(recherche.neutraliserJokers('a_b'), 'a\\_b');
    // Le `\` est échappé EN PREMIER, sinon on échapperait les échappements.
    assert.equal(recherche.neutraliserJokers('a\\b'), 'a\\\\b');
  });

  test('chercher « % » ne rend RIEN, alors que sans échappement il rendrait tout', async () => {
    const tout = await chercherSous(perimetre('rssi-tls', FILIALE_A, [FILIALE_A]), 'ORACLE-ABSENT');
    assert.deepEqual(tout, [], 'témoin : un terme absent ne rend rien');

    const jokers = await chercherSous(perimetre('rssi-tls', FILIALE_A, [FILIALE_A]), '%%');
    assert.deepEqual(
      jokers,
      [],
      'Le joker de « like » a traversé : un terme de deux signes rend alors la filiale ' +
        'entière, ce qui est l’extraction que le plafond est censé empêcher.',
    );
  });
});

/* =====================================================================
 *  §4 et §5 — bornes et trace, par la ROUTE
 * ===================================================================== */

describe('§4 et §5 — la route borne, et elle laisse une trace', () => {
  test('un terme trop court rend 200 et une liste vide — jamais une erreur', async () => {
    // L'utilisateur tape : chaque frappe passe ici. Un 400 par caractère ferait
    // du journal technique une trace de frappe.
    const monte = await monterGreffon(base, perimetreApi('rssi-tls', FILIALE_A, [FILIALE_A]));
    try {
      const { statut, corps } = await monte.appeler('GET', '/api/recherche?q=a');
      assert.equal(statut, 200);
      assert.deepEqual(corps.resultats, []);
      assert.equal(corps.motif.length > 0, true, 'L’écran doit pouvoir DIRE pourquoi c’est vide.');
    } finally {
      await monte.fermer();
    }
  });

  test('un terme démesuré est refusé — contrôle S13', async () => {
    const monte = await monterGreffon(base, perimetreApi('rssi-tls', FILIALE_A, [FILIALE_A]));
    try {
      const long = 'a'.repeat(recherche.TERME_MAX + 1);
      const { statut } = await monte.appeler('GET', `/api/recherche?q=${long}`);
      assert.equal(statut, 400);
    } finally {
      await monte.fermer();
    }
  });

  test('la route trouve, et le résultat porte son entité et son domaine', async () => {
    const monte = await monterGreffon(base, perimetreApi('rssi-tls', FILIALE_A, [FILIALE_A]));
    try {
      const { statut, corps } = await monte.appeler(
        'GET',
        `/api/recherche?q=${encodeURIComponent(TERME_TOULOUSAIN)}`,
      );
      assert.equal(statut, 200, JSON.stringify(corps).slice(0, 200));
      assert.equal(corps.resultats.length, 1);
      assert.equal(corps.resultats[0].entite, 'risques');
      assert.equal(corps.resultats[0].domaine, 'risques');
      assert.equal(corps.resultats[0].id, 'RSK-TLS-ORACLE');
      assert.equal(corps.tronque, false);
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — le CUMUL de lignes rendues finit par laisser une trace', async () => {
    // La recherche consomme le budget du sondage : répétée, elle extrait. On
    // cherche donc en boucle et on constate que le journal finit par bouger.
    const monte = await monterGreffon(base, perimetreApi('chercheur-insistant', FILIALE_A, [FILIALE_A]));
    try {
      const lecture = await base.connexion('proprietaire');
      const compter = async () => {
        const r = await lecture.query(
          "select count(*)::int as n from journal_audit where action = 'consultation_sensible'",
        );
        return r.rows[0].n;
      };
      const avant = await compter();

      for (let i = 0; i < 40; i += 1) {
        await monte.appeler('GET', `/api/recherche?q=${encodeURIComponent(TERME_TOULOUSAIN)}`);
      }

      const apres = await compter();
      assert.equal(
        apres > avant,
        true,
        'Quarante recherches n’ont laissé AUCUNE trace : le budget de lignes rendues sans ' +
          'trace ne couvre donc pas cette route, et une extraction par fenêtres étroites ' +
          'y échappe — c’est la réserve laissée ouverte par le constat Q-279.',
      );
    } finally {
      await monte.fermer();
    }
  });
});
