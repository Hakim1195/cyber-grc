/**
 * ateliers.test.mjs — **LES ATELIERS 1 ET 2 D'EBIOS RM** (lot L25, actions 25.1,
 * 25.2 et 25.5)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le critère d'acceptation de l'action 25.1 est écrit **en négatif**, et c'est ce
 * qui rend cette famille particulière : *« les risques cotés en F × G × M restent
 * valides et lisibles. Une migration qui les réinterpréterait réattribuerait EN
 * SILENCE des cotations produites en audit »*. Une propriété négative ne se voit
 * pas à l'usage — elle ne se mesure qu'en la cherchant.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | **EN ADDITION** : la cotation F × G × M est intacte, et conduire un atelier n'y écrit RIEN |
 * | 2 | La pertinence se DÉRIVE — et la lire n'écrit pas |
 * | 3 | Elle **SE TAIT** dès qu'un critère manque : pas d'estimation par défaut |
 * | 4 | Retenir un couple **sans justification** est refusé par la BASE |
 * | 5 | La valeur métier POINTE le BIA — et le BIA n'est pas dupliqué |
 * | 6 | Les clés composites mordent : on ne rattache rien à l'étude d'une voisine |
 * | 7 | Cloisonnement : la voisine ne voit ni l'étude, ni ses couples |
 * | 8 | Le socle de connaissances du Groupe est partagé ; un ajout local ne l'est pas |
 * | 9 | Le garde-fou ÉPROUVE la dérivation — et il MORD |
 * | 10 | Supprimer un processus RÉFÉRENCÉ délie la valeur métier **sans casser la purge** |
 * | 11 | Le niveau de menace d'une partie prenante se DÉRIVE, et **se tait** |
 * | 12 | La gravité d'un chemin vient de l'événement redouté — **aucune colonne** |
 * | 13 | **Accepter** un risque sans écrire pourquoi est refusé par la BASE |
 * | 14 | Rattacher un scénario à un risque n'écrit **RIEN** dans ce risque |
 * | 15 | Le garde de CLASSE des `set null` composites mord — **et ne fait pas de bruit** |
 *
 * ── ⚠️ LE §1 SE MESURE PAR CE QUI N'A PAS BOUGÉ ───────────────────────────
 *
 * On relit les cinq colonnes de cotation d'un risque **et sa `version`** — le
 * compteur de verrouillage optimiste — avant et après avoir conduit un atelier
 * complet. Une écriture invisible se verrait là, et c'est la seule façon de
 * distinguer « EBIOS RM s'ajoute » de « EBIOS RM a réinterprété en silence ».
 *
 * C'est le motif du constat **Q-192**, où la renumérotation du catalogue ANSSI a
 * été refusée pour cette raison exacte : les auto-évaluations y sont stockées par
 * `(ref_id, code)`, et les renuméroter les aurait réattribuées sans un mot.
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
let proprietaire;

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

/** Joue une écriture sous le périmètre d'une filiale, et la VALIDE. */
async function ecrire(filiale, travail) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    travail,
    { annuler: false },
  );
}

/** Lit sous le périmètre d'une filiale, sans rien valider. */
async function lire(filiale, travail) {
  return await base.avecPerimetre(applicatif, perimetre('temoin', filiale, [filiale]), travail);
}

/** Sème une étude et, si on le demande, ses valeurs métier et ses couples. */
async function semerEtude(id, filiale, nom = 'Étude d’essai') {
  await ecrire(filiale, async (c) => {
    await c.query(
      `insert into ebios_etudes (id, filiale_id, nom, statut, debut_le)
           values ($1, $2, $3, 'en_cours', '2026-02-03')`,
      [id, filiale, nom],
    );
  });
}

async function semerCouple(id, filiale, etude, champs = {}) {
  await ecrire(filiale, async (c) => {
    await c.query(
      `insert into ebios_sources_risque
           (id, filiale_id, etude_id, source, objectif_vise,
            motivation, ressources, activite, retenue, justification)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        filiale,
        etude,
        champs.source ?? 'Cybercriminel organisé',
        champs.objectif ?? 'Obtenir une rançon',
        // ⚠️ `??` serait un PIÈGE ici, et il s'est refermé à la première rédaction :
        // `null ?? 3` vaut 3, si bien que le couple « incomplet » du §3 arrivait
        // COMPLET en base et que l'essai mesurait autre chose que ce qu'il annonce.
        // On distingue donc « absent du jeu d'essai » de « volontairement nul ».
        'motivation' in champs ? champs.motivation : 4,
        'ressources' in champs ? champs.ressources : 3,
        'activite' in champs ? champs.activite : 4,
        champs.retenue ?? false,
        champs.justification ?? null,
      ],
    );
  });
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
});

after(async () => {
  await base?.fermer();
});

async function monterPour(filiale, filiales, administrationGroupe = false) {
  return await monterGreffon(base, perimetreApi(filiale, filiales, administrationGroupe));
}

/** Le couple, tel que la route le rend. */
async function coupleVu(monte, id) {
  const { statut, corps } = await monte.appeler('GET', '/api/ebios/etat');
  assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
  return corps.couples.find((c) => c.id === id) ?? null;
}

describe('Les ateliers 1 et 2 d’EBIOS RM', () => {
  test('§1 — EN ADDITION : conduire un atelier n’écrit RIEN dans « risques »', async () => {
    // L'état de la cotation AVANT — les cinq colonnes ET le compteur de version.
    const avant = await lire(
      FILIALE_A,
      async (c) =>
        (
          await c.query(
            `select id, f_frequence, g_gravite, m_maitrise, score_brut, score_residuel,
                    niveau, version
               from risques order by id`,
          )
        ).rows,
    );
    assert.ok(avant.length > 0, 'Le jeu d’essai ne porte aucun risque : le §1 ne mesurerait rien.');

    // On conduit un atelier COMPLET : étude, valeur métier, événement redouté, couple.
    await semerEtude('EBET-1', FILIALE_A, 'Chaîne de production — 2026');
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into ebios_valeurs_metier (id, filiale_id, etude_id, nom, nature, processus_id)
             values ('EBVM-1', $1, 'EBET-1', 'Ordonnancement', 'processus',
                     (select id from processus limit 1))`,
        [FILIALE_A],
      );
      await c.query(
        `insert into ebios_evenements_redoutes
             (id, filiale_id, valeur_metier_id, nom, besoin, gravite)
             values ('EBER-1', $1, 'EBVM-1', 'Arrêt de plus de 24 h', 'disponibilite', 4)`,
        [FILIALE_A],
      );
    });
    await semerCouple('EBSR-1', FILIALE_A, 'EBET-1');

    const apres = await lire(
      FILIALE_A,
      async (c) =>
        (
          await c.query(
            `select id, f_frequence, g_gravite, m_maitrise, score_brut, score_residuel,
                    niveau, version
               from risques order by id`,
          )
        ).rows,
    );

    assert.deepEqual(
      apres,
      avant,
      'Conduire un atelier EBIOS RM a MODIFIÉ le registre des risques. C’est très exactement ' +
        'ce que le critère 25.1 refuse : les cotations F × G × M ont été produites en audit, ' +
        'et les réinterpréter les réattribue EN SILENCE (motif du constat Q-192). Les deux ' +
        'méthodes cohabitent sans se parler.',
    );
  });

  test('§2 — la pertinence se DÉRIVE, et la lire n’écrit pas', async () => {
    const avant = await lire(
      FILIALE_A,
      async (c) =>
        (await c.query('select version, motivation from ebios_sources_risque where id = $1', ['EBSR-1']))
          .rows[0],
    );

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await coupleVu(monte, 'EBSR-1');
      assert.notEqual(vue, null, 'Le couple semé n’est pas rendu par la route.');
      // 4, 3, 4 → moyenne 3,67 → 4.
      assert.equal(
        vue.pertinenceSuggeree,
        4,
        'La pertinence rendue n’est pas la moyenne arrondie des trois critères. Elle vient de ' +
          'f_ebios_pertinence() : si la route la recalculait, les deux rédactions ' +
          'divergeraient au premier ajustement de la règle (constat Q-219).',
      );
    } finally {
      await monte.fermer();
    }

    const apres = await lire(
      FILIALE_A,
      async (c) =>
        (await c.query('select version, motivation from ebios_sources_risque where id = $1', ['EBSR-1']))
          .rows[0],
    );
    assert.deepEqual(
      apres,
      avant,
      'Lire la pertinence a ÉCRIT dans la base. Elle se dérive : la ranger obligerait quelque ' +
        'chose à la remettre après chaque révision d’un critère, et l’animateur en révise en séance.',
    );
  });

  test('§3 — la suggestion SE TAIT dès qu’un critère manque', async () => {
    await semerCouple('EBSR-INCOMPLET', FILIALE_A, 'EBET-1', {
      source: 'Concurrent',
      objectif: 'Obtenir le plan de fabrication',
      motivation: 3,
      ressources: null,
      activite: 4,
    });

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const vue = await coupleVu(monte, 'EBSR-INCOMPLET');
      assert.equal(
        vue.pertinenceSuggeree,
        null,
        'Le produit a calculé une pertinence sur DEUX critères sur trois. C’est le défaut que ' +
          'le critère 25.4 nomme : un chiffre qui a l’air mesuré sans l’être est pire que pas ' +
          'de chiffre, parce qu’il est cité en comité de direction.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§4 — retenir un couple SANS justification est refusé par la base', async () => {
    const erreur = await erreurAttendue(
      ecrire(FILIALE_A, async (c) => {
        await c.query(
          `insert into ebios_sources_risque
               (id, filiale_id, etude_id, source, objectif_vise, retenue)
               values ('EBSR-SANS-MOTIF', $1, 'EBET-1', 'Initié', 'Nuire', true)`,
          [FILIALE_A],
        );
      }),
    );
    assert.match(
      String(erreur.constraint ?? erreur.message),
      /ck_ebios_sources_risque_retenue/u,
      'Un couple a pu être RETENU sans justification. Les ateliers 3 et 4 ne travailleront que ' +
        'sur les couples retenus : la décision qui engage toute la suite de l’étude deviendrait ' +
        'intraçable, et c’est la pièce qu’un auditeur demande en premier.',
    );
  });

  test('§5 — la valeur métier POINTE le BIA, et le BIA n’est PAS dupliqué', async () => {
    const lien = await lire(
      FILIALE_A,
      async (c) =>
        (
          await c.query(
            `select v.processus_id, p.nom, p.criticite
               from ebios_valeurs_metier v join processus p on p.id = v.processus_id
              where v.id = 'EBVM-1'`,
          )
        ).rows[0],
    );
    assert.notEqual(lien, undefined, 'La valeur métier ne pointe aucun processus du BIA.');

    // ⚠️ LE CRITÈRE 25.2, MESURÉ DANS LE CATALOGUE : aucune colonne du BIA n'a de
    // jumelle ici. Recopier la criticité, le RTO ou le RPO ferait exister deux
    // réponses à la même question, et la seconde vieillirait sans que personne le sache.
    const doublons = await base.lignes(
      proprietaire,
      `select a.attname
         from pg_attribute a
        where a.attrelid = 'ebios_valeurs_metier'::regclass and a.attnum > 0 and not a.attisdropped
          and a.attname in (select b.attname from pg_attribute b
                             where b.attrelid = 'processus'::regclass
                               and b.attnum > 0 and not b.attisdropped)
          and a.attname not in ('id', 'filiale_id', 'nom', 'description', 'responsable',
                                'version', 'cree_le', 'cree_par', 'modifie_le', 'modifie_par',
                                'provenance')
        order by a.attname`,
    );
    assert.deepEqual(
      doublons.map((d) => d.attname),
      [],
      'Ces colonnes existent des DEUX côtés : la valeur métier recopie le bilan d’impact au ' +
        'lieu de le désigner. C’est le critère d’acceptation de 25.2, et la copie vieillira.',
    );
  });

  test('§6 — les clés composites mordent : rien ne se rattache à l’étude d’une voisine', async () => {
    await semerEtude('EBET-VOISINE', FILIALE_B, 'Étude de la voisine');

    const erreur = await erreurAttendue(
      ecrire(FILIALE_A, async (c) => {
        await c.query(
          `insert into ebios_valeurs_metier (id, filiale_id, etude_id, nom, nature)
               values ('EBVM-FUITE', $1, 'EBET-VOISINE', 'Tentative', 'information')`,
          [FILIALE_A],
        );
      }),
    );
    assert.match(
      String(erreur.constraint ?? erreur.message),
      /fk_ebios_valeurs_metier_etude/u,
      'Une valeur métier a pu se rattacher à l’étude d’une AUTRE filiale. Les contrôles ' +
        'd’intégrité de PostgreSQL contournent délibérément la RLS : une clé SIMPLE est ' +
        'satisfaite par une ligne invisible (CONVENTIONS.md §17.1), et la voisine qui la ' +
        'supprimerait détruirait ici un travail qu’elle ignore.',
    );
  });

  test('§7 — la voisine ne voit ni l’étude, ni ses couples', async () => {
    const monte = await monterPour(FILIALE_B, [FILIALE_B]);
    try {
      const { statut, corps } = await monte.appeler('GET', '/api/ebios/etat');
      assert.equal(statut, 200);
      assert.equal(
        corps.etudes.some((e) => e.id === 'EBET-1'),
        false,
        'La filiale B voit l’étude de la filiale A. C’est une fuite entre filiales, sur ' +
          'l’écran qui porte l’analyse de risque — c’est-à-dire ce qu’un attaquant irait lire ' +
          'en premier.',
      );
      assert.equal(
        corps.couples.some((c) => c.id === 'EBSR-1'),
        false,
        'La filiale B voit les sources de risque retenues CONTRE la filiale A.',
      );
      // Et elle voit bien la sienne : « rien » n'est pas la bonne réponse non plus.
      assert.equal(corps.etudes.some((e) => e.id === 'EBET-VOISINE'), true);
    } finally {
      await monte.fermer();
    }
  });

  test('§8 — le socle du Groupe est partagé ; un ajout LOCAL ne l’est pas', async () => {
    // Le socle : `filiale_id` nul, écrit par l'administration Groupe seule.
    await base.avecPerimetre(
      applicatif,
      { ...perimetre('groupe', FILIALE_A, [FILIALE_A, FILIALE_B]), administrationGroupe: true },
      async (c) => {
        await c.query(
          `insert into ebios_connaissances (id, filiale_id, genre, nom, objectif_vise, origine)
               values ('EBCO-SOCLE', null, 'source_risque', 'Cybercriminel organisé',
                       'Obtenir une rançon', 'sectoriel')`,
        );
      },
      { annuler: false },
    );
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into ebios_connaissances (id, filiale_id, genre, nom, objectif_vise)
             values ('EBCO-LOCAL', $1, 'source_risque', 'Sous-traitant du site', 'Détourner')`,
        [FILIALE_A],
      );
    });

    const vuDeB = await lire(
      FILIALE_B,
      async (c) => (await c.query('select id from ebios_connaissances order by id')).rows,
    );
    const ids = vuDeB.map((l) => l.id);
    assert.equal(
      ids.includes('EBCO-SOCLE'),
      true,
      'Le socle du Groupe n’est pas visible de la filiale B : une base de connaissances qui ne ' +
        'se partage pas est l’inverse de ce que l’action 25.5 apporte.',
    );
    assert.equal(
      ids.includes('EBCO-LOCAL'),
      false,
      'L’ajout LOCAL de la filiale A est visible de la filiale B — fuite entre filiales. ' +
        'C’est aussi cette barrière qui rend inoffensive la clé simple de connaissance_id.',
    );
  });

  test('§9 — le garde-fou ÉPROUVE la dérivation, et il MORD', async () => {
    const vert = await base.lignes(proprietaire, 'select * from f_verifier_ebios_cadrage()');
    assert.deepEqual(vert, [], 'Le garde-fou rougit sur un schéma sain.');

    // ⚠️ On MUTE dans une transaction ANNULÉE — jamais avec un `finally` qui
    // restaure : une restauration ratée laisse le schéma cassé pour les essais
    // suivants, et c'est arrivé sur la recette (leçon du 10/09/2026).
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        `create or replace function f_ebios_pertinence(p_motivation smallint,
                                                       p_ressources smallint,
                                                       p_activite smallint)
         returns smallint language sql immutable
         set search_path = pg_catalog, public, pg_temp as
         $x$ select round((coalesce(p_motivation,0) + coalesce(p_ressources,0)
                           + coalesce(p_activite,0))::numeric / 3)::smallint $x$`,
      );
      const mordu = await base.lignes(proprietaire, 'select * from f_verifier_ebios_cadrage()');
      assert.ok(
        mordu.some((l) => l.anomalie === 'derivation_pertinence_fausse'),
        'Le garde-fou n’a PAS mordu sur une dérivation qui invente une pertinence à partir de ' +
          'deux critères sur trois. Un garde qui ne mord pas dit que l’essai ne fait pas ' +
          'décider la règle (constat Q-210).',
      );
    } finally {
      await proprietaire.query('rollback');
    }

    // Et la contrainte de retenue, elle aussi nommée UNE PAR UNE (§39.7).
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        'alter table ebios_sources_risque drop constraint ck_ebios_sources_risque_retenue',
      );
      const mordu = await base.lignes(proprietaire, 'select * from f_verifier_ebios_cadrage()');
      assert.ok(
        mordu.some((l) => l.anomalie === 'ebios_piece_manquante'),
        'Le garde-fou n’a pas vu disparaître la contrainte qui exige une justification.',
      );
    } finally {
      await proprietaire.query('rollback');
    }

    // ⚠️ ET LE CONTRÔLE QUI PORTE LE CRITÈRE 25.1 : un déclencheur EBIOS qui
    // écrirait dans « risques » doit être refusé. C'est la propriété NÉGATIVE du
    // §1, rendue mécanique — une phrase dans un plan ne retient personne.
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        `create or replace function f_essai_ebios_ecrit() returns trigger language plpgsql as
         $x$ begin update risques set g_gravite = 1 where filiale_id = new.filiale_id;
             return new; end $x$`,
      );
      await proprietaire.query(
        `create trigger trg_essai_ebios_ecrit after insert on ebios_evenements_redoutes
             for each row execute function f_essai_ebios_ecrit()`,
      );
      const mordu = await base.lignes(proprietaire, 'select * from f_verifier_ebios_cadrage()');
      assert.ok(
        mordu.some((l) => l.anomalie === 'ebios_ecrit_dans_risques'),
        'Un déclencheur EBIOS peut écrire dans « risques » sans que rien ne le dise. Le ' +
          '« EN ADDITION » tiendrait alors à la seule bonne volonté du prochain, et la forme ' +
          'du défaut serait la pire qui soit : quelque chose réussit en silence alors que ' +
          'c’est faux.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('§11 — le niveau de menace se DÉRIVE des quatre critères, et se tait', async () => {
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into ebios_parties_prenantes
             (id, filiale_id, etude_id, nom, categorie, dependance, penetration, maturite, confiance)
             values ('EBPP-1', $1, 'EBET-1', 'Mainteneur', 'fournisseur', 4, 3, 2, 2)`,
        [FILIALE_A],
      );
      // ⚠️ Une seule cotation manquante : la suggestion doit se TAIRE. C'est le
      // critère 25.4, et il vaut pour les quatre dérivations du lot.
      await c.query(
        `insert into ebios_parties_prenantes
             (id, filiale_id, etude_id, nom, categorie, dependance, penetration, maturite)
             values ('EBPP-MUET', $1, 'EBET-1', 'Partenaire', 'partenaire', 4, 4, 4)`,
        [FILIALE_A],
      );
    });

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { statut, corps } = await monte.appeler('GET', '/api/ebios/etat');
      assert.equal(statut, 200);
      const vue = corps.partiesPrenantes.find((p) => p.id === 'EBPP-1');
      assert.notEqual(vue, undefined, 'La partie prenante semée n’est pas rendue.');
      // (4 × 3) / (2 × 2) = 3.00
      assert.equal(
        Number(vue.niveauMenace),
        3,
        'Le niveau de menace n’est pas exposition ÷ fiabilité. Il vient de ' +
          'f_ebios_niveau_menace() : si la route le recalculait, les deux rédactions ' +
          'divergeraient au premier ajustement (constat Q-219).',
      );
      const muet = corps.partiesPrenantes.find((p) => p.id === 'EBPP-MUET');
      assert.equal(
        muet.niveauMenace,
        null,
        'Le produit a calculé une menace sur TROIS critères sur quatre. Un chiffre qui a ' +
          'l’air mesuré sans l’être est pire que pas de chiffre (critère 25.4).',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('§12 — la gravité d’un chemin vient de l’ÉVÉNEMENT REDOUTÉ, pas d’une colonne', async () => {
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into ebios_scenarios_strategiques
             (id, filiale_id, etude_id, source_id, evenement_redoute_id, partie_prenante_id, nom)
             values ('EBSS-1', $1, 'EBET-1', 'EBSR-1', 'EBER-1', 'EBPP-1',
                     'Le cybercriminel passe par le mainteneur')`,
        [FILIALE_A],
      );
    });

    // ⚠️ LE CRITÈRE, MESURÉ DANS LE CATALOGUE : aucune colonne de gravité ni de niveau.
    // Une colonne créerait une seconde réponse à la même question, qui vieillirait dès la
    // prochaine réévaluation de l'atelier 1 — motif de l'AIPD (migration 039).
    const jumelles = await base.lignes(
      proprietaire,
      `select a.attname
         from pg_attribute a
        where a.attrelid = 'ebios_scenarios_strategiques'::regclass
          and a.attnum > 0 and not a.attisdropped
          and a.attname in ('gravite', 'gravite_scenario', 'niveau', 'vraisemblance')
        order by 1`,
    );
    assert.deepEqual(
      jumelles.map((l) => l.attname),
      [],
      'Cette table porte une colonne de gravité ou de niveau : elle recopie ce que ' +
        'l’événement redouté porte déjà, et la copie vieillira sans que personne le sache.',
    );

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { corps } = await monte.appeler('GET', '/api/ebios/etat');
      const vue = corps.scenariosStrategiques.find((x) => x.id === 'EBSS-1');
      assert.notEqual(vue, undefined);
      assert.equal(Number(vue.gravite), 4, 'La gravité doit venir de la jointure (EBER-1 = 4).');
      assert.equal(vue.partiePrenante, 'Mainteneur');
    } finally {
      await monte.fermer();
    }
  });

  test('§13 — ACCEPTER sans écrire pourquoi est refusé par la base', async () => {
    const erreur = await erreurAttendue(
      ecrire(FILIALE_A, async (c) => {
        await c.query(
          `insert into ebios_scenarios_operationnels
               (id, filiale_id, scenario_strategique_id, nom, decision)
               values ('EBSO-SANS-MOTIF', $1, 'EBSS-1', 'Hameçonnage', 'accepter')`,
          [FILIALE_A],
        );
      }),
    );
    assert.match(
      String(erreur.constraint ?? erreur.message),
      /ck_ebios_scenarios_operationnels_acceptation/u,
      'Un risque a pu être ACCEPTÉ sans justification. C’est la seule des quatre décisions ' +
        'qui ne produit aucun travail visible : sans sa phrase, elle est indistinguable ' +
        'd’un oubli — et c’est exactement ce qu’un auditeur vient chercher.',
    );

    // CONTRÔLE SYMÉTRIQUE : « réduire » n’exige rien, et doit passer.
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into ebios_scenarios_operationnels
             (id, filiale_id, scenario_strategique_id, nom, decision, vraisemblance, risque_id)
             values ('EBSO-1', $1, 'EBSS-1', 'Hameçonnage ciblé', 'reduire', 3,
                     (select id from risques limit 1))`,
        [FILIALE_A],
      );
    });
  });

  test('§14 — rattacher un scénario à un risque n’écrit RIEN dans ce risque', async () => {
    // ⚠️ Le §1 mesure qu'un atelier ne touche pas au registre. Celui-ci mesure le cas
    // LIMITE : le seul endroit du produit où une table EBIOS DÉSIGNE un risque. Si la
    // conversion devait se produire quelque part, c'est ici.
    const lien = await lire(
      FILIALE_A,
      async (c) =>
        (
          await c.query(
            `select o.risque_id, r.f_frequence, r.g_gravite, r.m_maitrise,
                    r.score_brut, r.score_residuel, r.niveau, r.version
               from ebios_scenarios_operationnels o
               join risques r on r.id = o.risque_id
              where o.id = 'EBSO-1'`,
          )
        ).rows[0],
    );
    assert.notEqual(lien, undefined, 'Le scénario ne pointe aucun risque : le §14 ne mesure rien.');
    assert.equal(
      Number(lien.version),
      1,
      'Le compteur de verrouillage optimiste du risque a bougé : quelque chose y a écrit. ' +
        'Le rattachement est un LIEN, pas une conversion — les cotations ont été produites ' +
        'en audit (critère 25.1, motif du constat Q-192).',
    );
    for (const colonne of ['f_frequence', 'g_gravite', 'm_maitrise', 'score_brut']) {
      assert.notEqual(
        lien[colonne],
        undefined,
        `La colonne « ${colonne} » a disparu du risque rattaché.`,
      );
    }

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const { corps } = await monte.appeler('GET', '/api/ebios/etat');
      const vue = corps.scenariosOperationnels.find((x) => x.id === 'EBSO-1');
      // Gravité 4 (de l'événement redouté) × vraisemblance 3 = 12 → critique.
      assert.equal(vue.niveau, 'critique');
      assert.equal(vue.decision, 'reduire');
    } finally {
      await monte.fermer();
    }
  });

  test('§15 — le garde de CLASSE des « set null » composites mord, et ne fait pas de bruit', async () => {
    const vert = await base.lignes(proprietaire, 'select * from f_verifier_set_null_composites()');
    assert.deepEqual(vert, [], 'Le garde de classe rougit sur un schéma sain.');

    await proprietaire.query('begin');
    try {
      // ⚠️ La validation d'une contrainte LIT la table cloisonnée : sans périmètre, elle
      // échoue pour une raison étrangère à ce qu'on mesure (`CONVENTIONS.md` §41).
      await proprietaire.query("select set_config('grc.utilisateur', 'mutation', true)");
      await proprietaire.query(
        "select set_config('grc.filiales', (select string_agg(id, ',') from filiales), true)",
      );
      await proprietaire.query(
        'alter table ebios_scenarios_operationnels drop constraint fk_ebios_scenarios_operationnels_actif',
      );
      await proprietaire.query(
        `alter table ebios_scenarios_operationnels add constraint fk_ebios_scenarios_operationnels_actif
           foreign key (actif_id, filiale_id) references actifs (id, filiale_id) on delete set null`,
      );
      const mordu = await base.lignes(proprietaire, 'select * from f_verifier_set_null_composites()');
      assert.ok(
        mordu.some((l) => l.anomalie === 'set_null_sans_liste_de_colonnes'),
        'Une clé composite en « set null » SANS liste de colonnes n’est pas vue. ' +
          'PostgreSQL nullifie alors toute la clé, « filiale_id » comprise : supprimer un ' +
          'parent référencé échoue en 23502, et la purge de « remplacer » avec lui — ' +
          'c’est-à-dire toute restauration de sauvegarde.',
      );
    } finally {
      await proprietaire.query('rollback');
    }

    // ⚠️ ET LE NON-BRUIT : une clé SIMPLE en « set null » n’est PAS réclamée. Un garde qui
    // crie pour rien finit ignoré (constat Q-64), et le schéma en porte plusieurs —
    // `incidents.risque_id` la première.
    const simples = await base.lignes(
      proprietaire,
      `select count(*)::int as n from pg_constraint
        where contype = 'f' and confdeltype = 'n' and array_length(conkey, 1) = 1`,
    );
    assert.ok(
      Number(simples[0].n) > 0,
      'Le schéma ne porte aucune clé SIMPLE en « set null » : le non-bruit ne mesure rien.',
    );
  });

  test('§10 — supprimer un processus RÉFÉRENCÉ délie la valeur métier, sans casser la purge', async () => {
    // ⚠️ **CE QUE CET ESSAI ÉPROUVE A ÉTÉ TROUVÉ PAR LE BANC, PAS PAR UNE RELECTURE.**
    //
    // La première rédaction de la migration écrivait `on delete set null` SANS liste de
    // colonnes. PostgreSQL met alors à NULL **toutes** les colonnes de la clé —
    // `filiale_id` comprise, et elle est `not null`. Supprimer un processus RÉFÉRENCÉ
    // échouait donc en 23502, et le message remis à l'utilisateur devenait
    // *« Le champ filiale_id est obligatoire »* sur une opération qui n'écrit rien de tel.
    //
    // Ce n'était pas théorique : la purge de `POST /api/reprise` en mode « remplacer »
    // supprime les processus de la filiale, et **toute restauration de sauvegarde
    // tombait**. Dix essais de `test/api/reprise-route.test.mjs` l'ont dit d'un coup.
    //
    // L'essai est ici, et pas seulement là-bas, parce que c'est ICI qu'est la cause : un
    // essai qui ne vit que chez la victime laisse la prochaine migration refaire la faute.
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into processus (id, filiale_id, nom) values ('BIA-DELIE', $1, 'Processus à supprimer')`,
        [FILIALE_A],
      );
      await c.query(
        `insert into ebios_valeurs_metier (id, filiale_id, etude_id, nom, nature, processus_id)
             values ('EBVM-DELIE', $1, 'EBET-1', 'Valeur reliée', 'processus', 'BIA-DELIE')`,
        [FILIALE_A],
      );
    });

    await ecrire(FILIALE_A, async (c) => {
      await c.query("delete from processus where id = 'BIA-DELIE'");
    });

    const apres = await lire(
      FILIALE_A,
      async (c) =>
        (
          await c.query(
            "select nom, nature, processus_id, filiale_id from ebios_valeurs_metier where id = 'EBVM-DELIE'",
          )
        ).rows[0],
    );

    assert.notEqual(
      apres,
      undefined,
      'La valeur métier a disparu avec le processus. Le lien est FACULTATIF : elle garde son ' +
        'nom, ses événements redoutés et sa place dans l’étude — elle ne perd que le lien.',
    );
    assert.equal(apres.processus_id, null, 'Le lien devait être délié.');
    assert.equal(
      apres.filiale_id,
      FILIALE_A,
      'LE CLOISONNEMENT A ÉTÉ NULLIFIÉ AVEC LE LIEN. C’est ce que fait un « on delete set ' +
        'null » sans liste de colonnes sur une clé composite : il nullifie TOUTE la clé, ' +
        '« filiale_id » comprise. La colonne étant « not null », la suppression échoue en ' +
        '23502 — et avec elle la purge de « remplacer », donc toute restauration de sauvegarde.',
    );

    // Et le garde-fou du schéma le dit AUSSI, sans avoir besoin d'une ligne à supprimer.
    const vert = await base.lignes(proprietaire, 'select * from f_verifier_ebios_cadrage()');
    assert.deepEqual(vert, [], 'Le garde-fou rougit sur un schéma sain.');
  });
});
