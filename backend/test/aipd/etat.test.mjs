/**
 * etat.test.mjs — **L'ANALYSE D'IMPACT, PAR LA ROUTE** (lot L20, action 20.3)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'action 20.3 tient en deux phrases, et la seconde est celle qu'on oublie :
 *
 *  · *« l'AIPD POINTE le registre de l'article 30, elle ne le recopie pas »* ;
 *  · *« une analyse validée dont la revue est échue redevient à revoir, sans
 *    intervention »*.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'analyse POINTE le traitement — et **le registre n'est pas dupliqué** |
 * | 2 | L'état se DÉRIVE : validée + revue échue ⇒ « a_revoir », **rien n'a été écrit** |
 * | 3 | La seconde liste : les traitements **SANS** analyse, avec leur présomption |
 * | 4 | La présomption est une PRÉSOMPTION — elle ne décide pas, et l'API le dit |
 * | 5 | Cloisonnement : la voisine ne voit ni l'analyse, ni le traitement qu'elle vise |
 * | 6 | La barrière de portée N-10 : une AIPD de Groupe ne s'appuie pas sur un local |
 * | 7 | Le garde-fou ÉPROUVE la dérivation — et il MORD |
 *
 * ── ⚠️ LE §2 SE MESURE PAR CE QUI N'A PAS BOUGÉ ───────────────────────────
 *
 * « À revoir » n'est posé par aucune écriture. L'essai relit donc, EN BASE, le
 * `statut` de l'analyse **et** sa `version` — le compteur de verrouillage
 * optimiste. Une écriture invisible se verrait là, et c'est la seule façon de
 * distinguer « l'état est dérivé » de « l'état a été recalculé et rangé ».
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;

/** Périmètre au format de l'API — `utilisateurId`, pas `utilisateur` (REPRISE §5.7). */
function perimetreApi(filialeId, filiales, administrationGroupe = false) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe,
  };
}

/** Sème une analyse d'impact en base, sous le périmètre de sa filiale. */
async function semerAnalyse(id, filiale, traitement, champs = {}) {
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    async (c) => {
      await c.query(
        `insert into analyses_impact (id, filiale_id, traitement_id, statut, date_analyse,
                                      revoir_le, necessite_motif)
             values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          filiale,
          traitement,
          champs.statut ?? 'validee',
          champs.dateAnalyse ?? '2026-01-15',
          champs.revoirLe ?? null,
          champs.motif ?? 'Traitement à grande échelle de données de santé (art. 35 §3 b).',
        ],
      );
    },
    { annuler: false },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  // Le semis partagé pose un traitement par filiale ; on lui donne des données
  // sensibles pour que la présomption du §4 ait de la matière à décider.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query("update traitements set donnees_sensibles = true where id = 'TRT-A'");
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

async function monterPour(filiale, filiales, administrationGroupe = false) {
  return await monterGreffon(base, perimetreApi(filiale, filiales, administrationGroupe));
}

/** L'état rendu par la route, pour une analyse nommée. */
async function etatDe(monte, id) {
  const { statut, corps } = await monte.appeler('GET', '/api/aipd/etat');
  assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
  return corps.analyses.find((a) => a.id === id) ?? null;
}

/** La ligne de la base, relue sans passer par la route. */
async function enBase(id, filiale) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', filiale, [filiale]),
    async (c) =>
      (await c.query('select statut, version, revoir_le from analyses_impact where id = $1', [id]))
        .rows[0] ?? null,
  );
}

describe('L’analyse d’impact, par la route', () => {
  test('§1 — elle POINTE le traitement, et le registre de l’article 30 n’est PAS dupliqué', async () => {
    await semerAnalyse('AIPD-1', FILIALE_A, 'TRT-A', { revoirLe: '2099-12-31' });
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await etatDe(monte, 'AIPD-1');
      assert.notEqual(vue, null, 'L’analyse semée n’est pas rendue par la route.');
      assert.equal(vue.traitementId, 'TRT-A');
      // Le nom du traitement vient de la JOINTURE, pas d'une colonne recopiée.
      assert.equal(vue.traitementNom, (await nomDuTraitement('TRT-A', FILIALE_A)));

      // ⚠️ LE CRITÈRE D'ACCEPTATION, MESURÉ DANS LE CATALOGUE : aucune colonne du
      // registre de l'article 30 n'a de jumelle dans `analyses_impact`. Une copie
      // de la finalité ou des catégories de données ferait exister deux réponses à
      // la même question, et la seconde vieillirait sans que personne le sache.
      const doublons = await base.lignes(
        await base.connexion('proprietaire'),
        `select a.attname
           from pg_attribute a
          where a.attrelid = 'analyses_impact'::regclass and a.attnum > 0 and not a.attisdropped
            and a.attname in (select b.attname from pg_attribute b
                               where b.attrelid = 'traitements'::regclass
                                 and b.attnum > 0 and not b.attisdropped)
            and a.attname not in ('id', 'filiale_id', 'portee_groupe', 'version', 'cree_le',
                                  'cree_par', 'modifie_le', 'modifie_par', 'provenance')
          order by a.attname`,
      );
      assert.deepEqual(
        doublons.map((d) => d.attname),
        [],
        'Ces colonnes existent des DEUX côtés : l’analyse d’impact recopie le registre de ' +
          'l’article 30 au lieu de le désigner. C’est le critère d’acceptation de 20.3, et ' +
          'la copie vieillira sans que personne le sache.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§2 — validée + revue ÉCHUE ⇒ « a_revoir », et RIEN n’a été écrit', async () => {
    await semerAnalyse('AIPD-ECHUE', FILIALE_A, 'TRT-A', { revoirLe: '2026-01-31' });
    const avant = await enBase('AIPD-ECHUE', FILIALE_A);
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await etatDe(monte, 'AIPD-ECHUE');
      assert.equal(
        vue.etat,
        'a_revoir',
        'Une analyse validée dont la revue est échue continue de valoir : le produit affirme ' +
          'une conformité RGPD que personne n’a constatée — et il l’affirmera jusqu’à ce ' +
          'qu’un humain y repasse.',
      );
      // Elle reste « validée » en base : l'état est DÉRIVÉ.
      assert.equal(vue.statut, 'validee');
    } finally {
      await monte.fermer();
    }

    const apres = await enBase('AIPD-ECHUE', FILIALE_A);
    assert.deepEqual(
      apres,
      avant,
      'La lecture de l’état a ÉCRIT dans la base. L’état se dérive : le ranger obligerait ' +
        'quelque chose à repasser, et le jour où ce quelque chose ne passe pas, le produit ' +
        'affirme une conformité qui n’existe plus.',
    );
    assert.equal(Number(apres.version), 1, 'Le compteur de verrouillage optimiste a bougé.');
  });

  test('§3 — la SECONDE liste : les traitements sans analyse', async () => {
    // ⚠️ Sans cette liste, le registre des AIPD serait un registre rassurant : il
    // montrerait les analyses faites, et tairait celles qui manquent. La question
    // d'un contrôle CNIL est l'inverse.
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `insert into traitements (id, filiale_id, nom, donnees_sensibles)
               values ('TRT-SANS-AIPD', $1, 'Vidéoprotection du site', true)`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { corps } = await monte.appeler('GET', '/api/aipd/etat');
      const manquante = corps.sansAnalyse.find((s) => s.traitementId === 'TRT-SANS-AIPD');
      assert.notEqual(
        manquante,
        undefined,
        'Un traitement sans analyse d’impact n’apparaît nulle part : le registre de ' +
          'l’article 35 ne dirait que ce qui a été fait, jamais ce qui manque.',
      );
      assert.equal(manquante.presumeeRequise, true);
      // Et le traitement QUI A une analyse n'y figure pas : les deux listes sont
      // disjointes, sans quoi l'écran compterait deux fois.
      assert.equal(
        corps.sansAnalyse.some((s) => s.traitementId === 'TRT-A'),
        false,
        'Un traitement analysé figure dans la liste des traitements SANS analyse.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§4 — la présomption est une PRÉSOMPTION : elle ne décide pas', async () => {
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `insert into traitements (id, filiale_id, nom, donnees_sensibles)
               values ('TRT-ORDINAIRE', $1, 'Annuaire interne', false)`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { corps } = await monte.appeler('GET', '/api/aipd/etat');
      const ordinaire = corps.sansAnalyse.find((s) => s.traitementId === 'TRT-ORDINAIRE');
      assert.notEqual(ordinaire, undefined);
      assert.equal(ordinaire.presumeeRequise, false);

      // ⚠️ LA MOITIÉ QUI COMPTE : le traitement ordinaire est RENDU QUAND MÊME. Un
      // produit qui ne rendrait que les traitements « présumés requis » aurait
      // TRANCHÉ — et il aurait tranché sur les deux critères de l'article 35 §3
      // qu'il ne sait pas mesurer (profilage systématique, surveillance d'un lieu
      // public). Le responsable de traitement doit voir sa liste ENTIÈRE.
      assert.ok(
        corps.sansAnalyse.length >= 2,
        'Seuls les traitements « présumés requis » sont rendus : le produit a TRANCHÉ sur ' +
          'des critères qu’il ne détient pas. La présomption informe, elle ne filtre pas.',
      );
      // Le champ porte « presumee » dans son nom : l'écran ne peut pas l'afficher
      // comme une décision par mégarde.
      assert.ok(Object.keys(ordinaire).includes('presumeeRequise'));
      assert.equal(Object.keys(ordinaire).includes('requise'), false);
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — la filiale voisine ne voit ni l’analyse, ni le traitement qu’elle vise', async () => {
    const monte = await monterPour(FILIALE_B, [FILIALE_B]);
    try {
      const { corps } = await monte.appeler('GET', '/api/aipd/etat');
      assert.equal(
        corps.analyses.some((a) => a.id === 'AIPD-1' || a.id === 'AIPD-ECHUE'),
        false,
        'FUITE ENTRE FILIALES : l’analyse d’impact de Toulouse est visible depuis l’Allemagne.',
      );
      assert.equal(
        corps.sansAnalyse.some((s) => s.traitementId.startsWith('TRT-SANS')),
        false,
        'FUITE : le registre de l’article 30 de la filiale voisine est rendu.',
      );
      // ⚠️ Contrôle de MATIÈRE, et il a changé de sujet en cours de route : le semis
      // partagé pose désormais une analyse dans CHAQUE filiale, si bien que « TRT-B »
      // n'est plus dans la liste des traitements sans analyse — il est dans l'autre.
      // La propriété reste la même : la voisine voit SES lignes, sinon l'essai
      // passerait au vert sur une route en panne.
      assert.ok(
        corps.analyses.some((a) => a.traitementId === 'TRT-B'),
        'La voisine doit voir SES propres analyses : sinon l’essai passerait au vert sur ' +
          'une route en panne, et « aucune fuite » ne voudrait plus rien dire.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§6 — une AIPD de portée GROUPE ne peut pas s’appuyer sur un traitement LOCAL', async () => {
    // Constat N-10, et il vaut ici exactement comme ailleurs : l'analyse que vingt
    // filiales lisent ne doit pas dépendre d'une ligne qu'UNE filiale peut effacer.
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        perimetre('admin', FILIALE_A, [FILIALE_A], true),
        async (c) => {
          await c.query(
            `insert into analyses_impact (id, filiale_id, traitement_id, statut)
                 values ('AIPD-N10', null, 'TRT-A', 'requise')`,
          );
        },
      ),
    );
    assert.match(
      String(erreur.message),
      /ck_analyses_impact_portee|contrainte/iu,
      `Une AIPD de portée Groupe a pu s’appuyer sur un traitement local : ${erreur.message}`,
    );

    // ── ET LE SENS OUVERT : local → Groupe, qui est le cas le plus fréquent ──
    await base.avecPerimetre(
      applicatif,
      perimetre('admin', FILIALE_A, [FILIALE_A], true),
      async (c) => {
        await c.query(
          `insert into traitements (id, filiale_id, nom, donnees_sensibles)
               values ('TRT-GROUPE-AIPD', null, 'Paie du Groupe', true)`,
        );
        await c.query(
          `insert into analyses_impact (id, filiale_id, traitement_id, statut)
               values ('AIPD-LOCALE', $1, 'TRT-GROUPE-AIPD', 'requise')`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await etatDe(monte, 'AIPD-LOCALE');
      assert.notEqual(
        vue,
        null,
        'Le sens OUVERT est fermé : une filiale ne peut plus analyser l’impact d’un ' +
          'traitement que le Groupe opère pour elle — c’est le cas le plus fréquent.',
      );
      assert.equal(vue.etat, 'a_faire');
    } finally {
      await monte.fermer();
    }
  });

  test('§7 — le garde-fou ÉPROUVE la dérivation, et il MORD', async () => {
    const proprietaire = await base.connexion('proprietaire');
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_analyses_impact()'),
      [],
    );
    assert.equal(
      (
        await base.lignes(
          proprietaire,
          "select count(*)::int as n from controles_schema where fonction = 'f_verifier_analyses_impact'",
        )
      )[0].n,
      1,
      'Le garde-fou n’est pas au registre : un contrôle que rien n’appelle est un commentaire.',
    );

    // ── LA MORSURE ────────────────────────────────────────────────────────
    //
    // ⚠️ Mutation jouée dans une transaction ANNULÉE (leçon du 11/09) : muter puis
    // « réparer dans un finally » laisse l'état de côté le jour où l'assertion lève.
    // La mutation choisie est celle qui fait le plus de dégâts en silence — une
    // dérivation qui rend « valide » pour tout le monde, c'est-à-dire un
    // distributeur de quitus RGPD.
    let anomalies;
    try {
      await proprietaire.query('begin');
      await proprietaire.query(`
        create or replace function f_etat_aipd(p_statut text, p_revoir_le date)
        returns text language sql immutable
        set search_path = pg_catalog, public, pg_temp as $m$ select 'valide'::text $m$`);
      anomalies = (
        await proprietaire.query('select objet, anomalie from f_verifier_analyses_impact()')
      ).rows;
    } finally {
      await proprietaire.query('rollback').catch(() => undefined);
    }

    assert.ok(
      anomalies.some((a) => a.anomalie === 'etat_derive_faux'),
      'LE GARDE NE MORD PAS : une dérivation qui rend « valide » pour toutes les analyses ' +
        'passe au vert. Le produit deviendrait un distributeur de quitus RGPD, sur tout le ' +
        `parc à la fois.\n  Rendu : ${JSON.stringify(anomalies)}`,
    );
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_analyses_impact()'),
      [],
      'La transaction annulée a laissé la mutation derrière elle.',
    );
  });
});

/** Le nom du traitement, relu en base — jamais recopié dans l'essai. */
async function nomDuTraitement(id, filiale) {
  const lignes = await base.avecPerimetre(
    applicatif,
    perimetre('temoin', filiale, [filiale]),
    async (c) => (await c.query('select nom from traitements where id = $1', [id])).rows,
  );
  return lignes[0]?.nom ?? null;
}
