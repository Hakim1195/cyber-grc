/**
 * ouverture.test.mjs — **LES CATALOGUES OUVERTS** (lot L26, actions 26.2 à 26.5)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Action | Propriété |
 * |---|---|---|
 * | 1 | 26.5 | L'ancienneté est DÉRIVÉE, et « inconnue » n'est JAMAIS « à jour » |
 * | 2 | 26.5 | Le signal S'ALLUME sur le parc livré — sinon on ne saurait pas qu'il marche |
 * | 3 | 26.3 | Le plan de reprise refuse une chaîne NON DÉCLARÉE |
 * | 4 | 26.3 | Et il rend TROIS listes, dont celle des intitulés qui ont changé sous le même code |
 * | 5 | 26.4 | Les suggestions PROPOSENT, et n'écrivent rien |
 * | 6 | 26.2 | Une grille apportée par une filiale se comporte comme un catalogue livré |
 *
 * ── ⚠️ LE §2 EST CELUI QU'ON POUVAIT MANQUER ──────────────────────────────
 *
 * La migration `051` livre le mécanisme de veille en entier — colonne, dérivation,
 * garde-fou — et **sans aucune fenêtre de surveillance** : les six catalogues
 * rendaient « non surveillé », et le produit ne signalait rien. Jamais. Le défaut a
 * été vu **en cliquant sur la recette**, après un banc entièrement vert.
 *
 * *Une capacité qu'aucune donnée n'active est une capacité absente* — variante de
 * la leçon du `docs/REPRISE.md` §4, où c'était un écran qui manquait. Le §2 exige
 * donc qu'au moins un catalogue du socle soit RÉELLEMENT signalé : un voyant qui ne
 * s'allume sur rien est un voyant dont personne ne saura, le jour venu, s'il marche.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  FILIALE_A,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
let monte;

function perimetreApi(filialeId, filiales, administrationGroupe = false) {
  return {
    utilisateurId: 'USER-A',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe,
  };
}

/** Écrit sous le périmètre d'une filiale, et VALIDE. */
async function ecrire(filiale, travail) {
  return await base.avecPerimetre(applicatif, perimetre('semeur', filiale, [filiale]), travail, {
    annuler: false,
  });
}

/** Écrit une ligne de portée GROUPE (le socle). */
async function ecrireSocle(travail) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('admin-groupe', FILIALE_A, [FILIALE_A], true),
    travail,
    { annuler: false },
  );
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  monte = await monterGreffon(base, perimetreApi(FILIALE_A, [FILIALE_A]));
});

after(async () => {
  await monte?.fermer();
  await base?.fermer();
});

async function etat() {
  const { statut, corps } = await monte.appeler('GET', '/api/catalogues/etat');
  assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
  return corps.catalogues;
}

/* =====================================================================
 *  §1 et §2 — LA VEILLE (action 26.5)
 * ===================================================================== */

describe('§1 — l’ancienneté est dérivée, et « inconnue » n’est jamais « à jour »', () => {
  test('les quatre états, et celui d’AirCyber en particulier', async () => {
    const catalogues = await etat();
    const parId = new Map(catalogues.map((c) => [c.id, c]));

    // ⚠️ **Le cas qui compte.** Le questionnaire d'AirCyber ne porte pas de date de
    // parution publique et vérifiable. Lui en inventer une rendrait le signal faux
    // DANS LE SENS RASSURANT — celui qu'on ne va pas vérifier.
    assert.equal(parId.get('aircyber').age, 'date_inconnue');
    assert.equal(parId.get('aircyber').publie_le, null);

    // Et les textes normatifs portent la leur.
    for (const id of ['anssi-hygiene', 'iso-27002-2022', 'nis2-art21', 'dora']) {
      assert.ok(parId.get(id).publie_le, `« ${id} » doit porter sa date de parution.`);
      assert.notEqual(parId.get(id).age, 'date_inconnue');
    }
  });

  test('les comptes sont COMPTÉS, jamais rangés', async () => {
    const parId = new Map((await etat()).map((c) => [c.id, c]));
    assert.equal(parId.get('iso-27002-2022').exigences, 93);
    assert.equal(parId.get('anssi-hygiene').exigences, 42);
    assert.equal(parId.get('aircyber').exigences, 234);
    assert.equal(parId.get('anssi-hygiene').traductions, 1);
  });
});

describe('§2 — le signal S’ALLUME sur le parc livré', () => {
  test('au moins un catalogue du socle est « à vérifier », et c’est VRAI', async () => {
    // ⚠️ **Sans cette assertion, la veille pouvait être livrée INERTE** — et elle l'a
    // été : la migration `051` posait la colonne, la dérivation et le garde-fou, et
    // aucune fenêtre de surveillance. Les six catalogues rendaient « non surveillé »,
    // et le produit ne signalait rien. Jamais. Un voyant qui ne s'allume sur rien est
    // un voyant dont personne ne saura, le jour venu, s'il marche.
    const catalogues = (await etat()).filter((c) => c.portee_groupe);
    const surveilles = catalogues.filter((c) => c.age !== 'non_surveille');
    const aVerifier = catalogues.filter((c) => c.age === 'a_verifier');

    assert.ok(
      surveilles.length >= 5,
      `Seulement ${String(surveilles.length)} catalogue(s) surveillé(s) : « non surveillé » ` +
        'ne se distingue pas, à l’écran, de « rien à signaler ».',
    );
    assert.ok(
      aVerifier.length >= 1,
      'Aucun catalogue du socle n’est signalé. Le guide d’hygiène de l’ANSSI date de ' +
        '2017 : s’il passe pour à jour, la fenêtre ou la dérivation est fausse.',
    );
    assert.ok(aVerifier.some((c) => c.id === 'anssi-hygiene'));
  });
});

/* =====================================================================
 *  §3 et §4 — LA REPRISE DES RÉPONSES (action 26.3)
 * ===================================================================== */

describe('§3 — une chaîne NON DÉCLARÉE est refusée', () => {
  test('on ne reporte pas les réponses d’ISO 27002 sur AirCyber', async () => {
    // ⚠️ Sans cette barrière, la route servirait à reporter en un clic des réponses
    // d'un référentiel sur un autre dont les codes ne veulent rien dire pour lui —
    // et le résultat serait un jeu de réponses d'audit entièrement faux.
    const { statut, corps } = await monte.appeler(
      'GET', '/api/catalogues/reprise-evaluations?de=iso-27002-2022&vers=aircyber');
    assert.equal(statut, 400, JSON.stringify(corps));
    assert.match(corps.message, /ne déclare pas remplacer/);
  });

  test('et un référentiel d’arrivée inexistant rend 404', async () => {
    const { statut } = await monte.appeler(
      'GET', '/api/catalogues/reprise-evaluations?de=dora&vers=inexistant');
    assert.equal(statut, 404);
  });
});

describe('§4 — le plan rend TROIS listes, et il dit ce qui a changé', () => {
  before(async () => {
    // Une révision du catalogue local de la filiale : un code repris à l'identique,
    // un code repris SOUS UN AUTRE INTITULÉ, un code abandonné, un code neuf.
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into referentiel_exigences
             (id, filiale_id, domaine_id, referentiel_id, code, titre, rang)
             values ('REFE-ANCIEN-2', $1, 'REFD-A', 'REFT-A', '1.2',
                     'Une revue annuelle est-elle conduite ?', 2)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into referentiels (id, filiale_id, nom, revision, statut, remplace_id,
                                   en_vigueur_le)
             values ('REFT-A-V2', $1, 'Grille du donneur d''ordre, révision 2', 2,
                     'en_vigueur', 'REFT-A', current_date)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into referentiel_domaines (id, filiale_id, referentiel_id, code, nom, rang)
             values ('REFD-A-V2', $1, 'REFT-A-V2', 'gouvernance', 'Gouvernance', 1)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into referentiel_exigences
             (id, filiale_id, domaine_id, referentiel_id, code, titre, rang)
             values ('REFE-V2-11', $1, 'REFD-A-V2', 'REFT-A-V2', '1.1',
                     'Une politique de sécurité est-elle formalisée ET APPROUVÉE ?', 1),
                    ('REFE-V2-13', $1, 'REFD-A-V2', 'REFT-A-V2', '1.3',
                     'Un responsable est-il nommément désigné ?', 2)`,
        [FILIALE_A],
      );
      // Les réponses données sur l'ANCIENNE version.
      await c.query(
        `insert into evaluations (id, filiale_id, ref_id, code, statut, maturite)
             values ('EVAL-REP-11', $1, 'REFT-A', '1.1', 'conforme', 4),
                    ('EVAL-REP-12', $1, 'REFT-A', '1.2', 'partiellement conforme', 2)`,
        [FILIALE_A],
      );
    });
  });

  test('reprises, abandonnées, à évaluer — et l’intitulé modifié est SIGNALÉ', async () => {
    const { statut, corps } = await monte.appeler(
      'GET', '/api/catalogues/reprise-evaluations?de=REFT-A&vers=REFT-A-V2');
    assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));

    assert.deepEqual(corps.reprises.map((r) => r.code), ['1.1']);
    // ⚠️ **C'est l'assertion qui porte le critère 26.3.** Un code identique ne
    // garantit pas un sens identique : ISO 27002:2022 a renuméroté les 114 mesures de
    // 2013 en 93. L'humain doit VOIR que l'intitulé a changé sous le même code, sans
    // quoi « explicite et tracé » ne veut rien dire.
    assert.equal(corps.reprises[0].intitule_modifie, true);
    assert.equal(corps.reprises[0].statut, 'conforme');

    assert.deepEqual(corps.abandonnes.map((r) => r.code), ['1.2']);
    assert.equal(corps.abandonnes[0].repondue, true);
    assert.deepEqual(corps.nouveaux.map((r) => r.code), ['1.3']);
  });

  test('⚠️ et le plan N’ÉCRIT RIEN : aucune évaluation n’apparaît sur la révision', async () => {
    // Le critère est là : la route rend un PLAN. Les évaluations reprises sont créées
    // par l'écran, à travers les routes génériques — donc journalisées, versionnées et
    // cloisonnées comme toutes les autres. Une route « reprendre » eût été plus courte
    // et aurait ouvert une seconde chaîne d'écriture, dont une seule est éprouvée.
    await monte.appeler('GET', '/api/catalogues/reprise-evaluations?de=REFT-A&vers=REFT-A-V2');
    const restees = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => {
        const { rows } = await c.query(
          `select count(*)::int as n from evaluations where ref_id = 'REFT-A-V2'`);
        return rows[0].n;
      },
    );
    assert.equal(restees, 0, 'Consulter un plan ne doit rien écrire.');
  });
});

/* =====================================================================
 *  §5 — LES CORRESPONDANCES PROPOSÉES (action 26.4)
 * ===================================================================== */

describe('§5 — les suggestions proposent, et n’écrivent rien', () => {
  test('NIS2 et ISO 27002 : des rapprochements plausibles, avec leur score', async () => {
    const { statut, corps } = await monte.appeler(
      'GET', '/api/catalogues/suggestions?source=nis2-art21&cible=iso-27002-2022');
    assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));

    assert.equal(corps.suggestions.length, 10, 'Les dix exigences de l’article 21 sont rendues.');
    const avec = corps.suggestions.filter((s) => s.propositions.length > 0);
    // ⚠️ **Un seul suffit, et le chiffre bas est la VÉRITÉ de la méthode.** La
    // similarité de libellés rapproche « Sécurité de la chaîne d'approvisionnement »
    // (NIS2) de « Sécurité de la chaîne d'approvisionnement TIC » (ISO 5.21) — ce qui
    // est juste — et se tait sur « Sécurité RH, contrôle d'accès et gestion des
    // actifs », dont l'équivalent ISO est éclaté en quinze mesures. Exiger davantage
    // ferait baisser le seuil, donc fabriquer du bruit : *une proposition faible coûte
    // plus qu'elle ne rend*.
    assert.ok(
      avec.length >= 1,
      'Aucun rapprochement proposé entre NIS2 et l’Annexe A : le calcul de similarité ' +
        'ne mord plus, et l’écran deviendrait une page vide qui a l’air normale.',
    );
    for (const s of avec) {
      for (const p of s.propositions) {
        assert.ok(p.score >= corps.seuil, 'aucune proposition sous le seuil annoncé');
        assert.ok(p.score <= 1);
      }
    }

    // ⚠️ **Les exigences SANS proposition restent dans la liste**, et c'est une
    // information : leur absence dit où la couverture manque vraiment. Une liste
    // filtrée laisserait croire que le rapprochement est complet.
    assert.ok(corps.suggestions.some((s) => s.propositions.length === 0));
  });

  test('⚠️ et AUCUNE correspondance n’est créée : la route ne fait que proposer', async () => {
    const avant = await base.avecPerimetre(
      applicatif, perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => (await c.query('select count(*)::int as n from mappings')).rows[0].n);
    await monte.appeler(
      'GET', '/api/catalogues/suggestions?source=nis2-art21&cible=iso-27002-2022');
    const apres = await base.avecPerimetre(
      applicatif, perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => (await c.query('select count(*)::int as n from mappings')).rows[0].n);
    assert.equal(
      apres, avant,
      'Une correspondance appliquée sans validation propagerait un statut de ' +
        'conformité faux d’un référentiel à l’autre, dans un outil produit en audit.',
    );
  });

  test('un référentiel ne se rapproche pas de lui-même', async () => {
    const { statut } = await monte.appeler(
      'GET', '/api/catalogues/suggestions?source=dora&cible=dora');
    assert.equal(statut, 400);
  });
});

/* =====================================================================
 *  §6 — UNE GRILLE APPORTÉE SE COMPORTE COMME UN CATALOGUE LIVRÉ (26.2)
 * ===================================================================== */

describe('§6 — la grille d’une filiale est un catalogue comme un autre', () => {
  test('elle est rendue par l’état, avec sa portée LOCALE', async () => {
    const locale = (await etat()).find((c) => c.id === 'REFT-A');
    assert.ok(locale, 'La grille apportée par la filiale doit être rendue.');
    assert.equal(locale.portee_groupe, false);
    assert.equal(locale.scoring, 'conformite');
    // ⚠️ Elle porte sa propre fenêtre de surveillance : ce n'est pas au Groupe de
    // décider au bout de combien de temps la grille d'un donneur d'ordre a vieilli.
    assert.equal(locale.duree_alerte_mois, 36);
  });

  test('⚠️ et la voisine ne la voit PAS — le socle, si', async () => {
    const { FILIALE_B } = await import('../aide/base.mjs');
    const chezB = await monterGreffon(base, perimetreApi(FILIALE_B, [FILIALE_B]));
    try {
      const { corps } = await chezB.appeler('GET', '/api/catalogues/etat');
      const ids = corps.catalogues.map((c) => c.id);
      assert.ok(!ids.includes('REFT-A'), 'La grille de Toulouse n’a rien à faire chez la voisine.');
      assert.ok(ids.includes('REFT-B'), 'La sienne, en revanche, doit y être.');
      assert.ok(ids.includes('anssi-hygiene'), 'Et le socle du Groupe est lisible de toutes.');
    } finally {
      await chezB.fermer();
    }
  });
});
