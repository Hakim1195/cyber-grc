/**
 * consolidation.test.mjs — **la vision Groupe consolidée** (`PLAN_SERVEUR` §7, lot L4).
 *
 * ── Ce que cet essai éprouve, et pourquoi il n'a pas la forme d'un essai de RLS ──
 *
 * `test/base/rls.test.mjs` demande « la politique de cette table tient-elle ? ».
 * `test/api/chargement-filiale.test.mjs` demande « ce que le serveur envoie
 * contient-il quelque chose d'étranger ? ». Ici la question est la troisième, et
 * c'est celle qui a manqué au lot L4 : **une route qui lit DÉLIBÉRÉMENT
 * plusieurs filiales à la fois s'arrête-t-elle au bon endroit ?**
 *
 * Toutes les autres routes du produit sont cadrées sur la filiale active, et
 * leur cloisonnement se démontre en montrant qu'elles ne débordent jamais.
 * Celle-ci déborde par construction — c'est son objet. La seule chose qui
 * l'arrête est la RLS, et la seule preuve recevable est **différentielle** : le
 * même code, la même base, deux périmètres, deux résultats.
 *
 * ── Les trois pièges que ce fichier vise expressément ────────────────────────
 *
 *  1. **Un `0` qui veut dire « refusé ».** Un domaine hors des droits de la
 *     session rend `null`, jamais zéro. Dire « aucun risque dans ce groupe » à
 *     un profil qui n'a pas le domaine `risques` serait faux, et le dire dans un
 *     outil qui sert de preuve en audit est le défaut, pas l'approximation.
 *  2. **Un essai vert qui n'avait rien à mesurer.** Chaque assertion de
 *     cloisonnement est précédée d'un **contrôle de matière** : si la filiale B
 *     ne portait rien, « B est absent » serait vrai sans rien prouver. Le dépôt
 *     a produit trois essais de cette forme (Q-108, Q-116, Q-132).
 *  3. **Un paramètre qui ferait croire qu'il élargit la vue.** La route n'en
 *     porte aucun ; l'essai le vérifie en en **envoyant un** et en constatant
 *     que la réponse ne bouge pas.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh` (et, sur SRV-Infra,
 * `set -a && source ~/.grc-essais.env && set +a` — les rôles y portent les
 * secrets de l'installation, pas `dev`).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/* =====================================================================
 *  Montage
 * ===================================================================== */

let base;
/** Connexion applicative : c'est sous ce rôle que la RLS s'applique. */
let applicatif;
/** `construireConsolidation`, importée du code compilé — le vrai, pas une copie. */
let construireConsolidation;
/** Serveur monté sur un périmètre Groupe, pour éprouver la route elle-même. */
let vueGroupe;

/** Les quatorze domaines : ce que porte un profil qui a tout. */
const TOUS_DOMAINES = Object.freeze([
  'pilotage',
  'conformite',
  'risques',
  'actifs',
  'continuite',
  'incidents',
  'documents',
  'rgpd',
  'tiers',
  'audits',
  'actions',
  'personnel',
  'administration',
  'journal',
]);

/**
 * Session du banc. Le périmètre RLS et le périmètre annoncé viennent d'une
 * **source unique** : un essai où les deux divergeraient mesurerait le banc.
 */
function sessionDe(utilisateurId, filiales, domaines = TOUS_DOMAINES) {
  const p = {
    utilisateurId,
    filialeId: filiales[0] ?? null,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
  return {
    perimetre: p,
    droits: Object.freeze({ niveau: 'administration', domaines: Object.freeze([...domaines]), export: true }),
    /** Ce que `base.avecPerimetre` attend : les mêmes valeurs, sous ses noms. */
    reglages: perimetre(utilisateurId, p.filialeId, filiales, false),
  };
}

/** Joue la consolidation sous le périmètre de la session, dans sa transaction. */
async function consolider(session) {
  return await base.avecPerimetre(applicatif, session.reglages, async (client) =>
    construireConsolidation(client, session),
  );
}

/** Retrouve une filiale par son code dans une consolidation. */
const parCode = (consolidation, code) => consolidation.filiales.find((f) => f.code === code) ?? null;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  ({ construireConsolidation } = await moduleCompile('consolidation/index.js'));

  // ── Le semis commun donne déjà risques, actifs, incidents, évaluations,
  //    actions et audits **à égalité** dans les deux filiales. On y ajoute ce
  //    que les CALCULS de la route exigent, et une ASYMÉTRIE contrôlée : sans
  //    elle, « A et B sont différents » ne se distingue pas de « la route rend
  //    deux fois la même chose ».
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-consolidation', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, date_revue)
              values ('DOC-CONSO-A', $1, 'PSSI Toulouse', 'à réviser', current_date - 30)`,
        [FILIALE_A],
      );
      // Échéance dépassée ET non terminée : le seul cas « en retard ».
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, echeance)
              values ('ACT-RETARD-A', $1, 'Chiffrer les portables', 'à faire', current_date - 5)`,
        [FILIALE_A],
      );
      // Échéance dépassée mais TERMINÉE : le contre-exemple. Sans lui,
      // « en retard = 1 » serait aussi vrai d'un code qui ignore le statut.
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, echeance)
              values ('ACT-FINIE-A', $1, 'Inventaire', 'terminée', current_date - 5)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into risques (id, filiale_id, nom, niveau, score_residuel)
              values ('RISK-CRIT-A', $1, 'Arrêt de production', 'critique', 12)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into evaluations (id, filiale_id, ref_id, code, statut, maturite)
              values ('EVAL-ISO-A', $1, 'iso-27002-2022', 'A.5.1', 'conforme', 4)`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-consolidation', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut)
              values ('DOC-CONSO-B', $1, 'PSSI Allemagne', 'en vigueur')`,
        [FILIALE_B],
      );
      await c.query(
        `insert into risques (id, filiale_id, nom, niveau, score_residuel)
              values ('RISK-FAIBLE-B', $1, 'Panne réseau', 'faible', 3)`,
        [FILIALE_B],
      );
    },
    { annuler: false },
  );

  vueGroupe = await monterGreffon(base, {
    utilisateurId: 'direction',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A, FILIALE_B],
    perimetreGroupe: true,
    administrationGroupe: false,
  });
});

after(async () => {
  await vueGroupe?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §0 — Contrôle de matière : de quoi cet essai dispose-t-il ?
 * ===================================================================== */

describe('§0 — le banc a de quoi mesurer', () => {
  test('les deux filiales portent des données dans au moins cinq domaines', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));

    assert.equal(groupe.filiales.length, 2, 'le périmètre Groupe doit voir deux filiales');

    for (const code of ['ZZESSA', 'ZZESSB']) {
      const filiale = parCode(groupe, code);
      assert.ok(filiale !== null, `filiale ${code} absente de la consolidation`);
      const garnis = [
        filiale.indicateurs.conformite?.parReferentiel.length ?? 0,
        filiale.indicateurs.risques?.total ?? 0,
        filiale.indicateurs.actions?.total ?? 0,
        filiale.indicateurs.incidents?.total ?? 0,
        filiale.indicateurs.documents?.total ?? 0,
        filiale.indicateurs.actifs?.total ?? 0,
        filiale.indicateurs.audits?.total ?? 0,
      ].filter((n) => n > 0).length;
      assert.ok(
        garnis >= 5,
        `${code} ne porte des données que dans ${garnis} domaines sur 7 : un essai de ` +
          "cloisonnement sur une filiale creuse rend vert sans rien prouver. Le semis n'a " +
          'pas fait son travail.',
      );
    }
  });
});

/* =====================================================================
 *  §1 — Le cloisonnement, mesuré différentiellement
 * ===================================================================== */

describe('§1 — la consolidation s’arrête au périmètre de la session', () => {
  test('un périmètre d’une filiale ne voit pas la voisine — dans les deux sens', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    const siteA = await consolider(sessionDe('rssi-toulouse', [FILIALE_A]));
    const siteB = await consolider(sessionDe('rssi-allemagne', [FILIALE_B]));

    assert.deepEqual(
      siteA.filiales.map((f) => f.code),
      ['ZZESSA'],
      'le RSSI de Toulouse ne doit voir que sa filiale',
    );
    assert.deepEqual(
      siteB.filiales.map((f) => f.code),
      ['ZZESSB'],
      'le RSSI d’Allemagne ne doit voir que sa filiale',
    );

    // ── LA PREUVE EST DIFFÉRENTIELLE, et elle exige que B porte quelque chose.
    const bChezGroupe = parCode(groupe, 'ZZESSB');
    assert.ok(
      bChezGroupe.indicateurs.risques.total > 0,
      'B ne porte aucun risque : « A ne voit pas les risques de B » serait vrai sans rien prouver',
    );
    assert.ok(
      groupe.total.risques.total > siteA.total.risques.total,
      `le total Groupe (${groupe.total.risques.total}) doit dépasser celui de A seul ` +
        `(${siteA.total.risques.total}) : sans écart, la route ne cloisonne peut-être rien`,
    );
    assert.equal(
      siteA.total.risques.total + siteB.total.risques.total,
      groupe.total.risques.total,
      'A + B doit reconstituer le Groupe : un écart signale une ligne vue deux fois ou perdue',
    );
  });

  test('le total Groupe est la SOMME des filiales, jamais une moyenne', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    const somme = (extraire) => groupe.filiales.reduce((n, f) => n + extraire(f.indicateurs), 0);

    assert.equal(groupe.total.risques.total, somme((i) => i.risques.total));
    assert.equal(groupe.total.actions.total, somme((i) => i.actions.total));
    assert.equal(groupe.total.actions.enRetard, somme((i) => i.actions.enRetard));
    assert.equal(groupe.total.incidents.total, somme((i) => i.incidents.total));
    assert.equal(groupe.total.actifs.total, somme((i) => i.actifs.total));
  });
  test('une filiale hors du périmètre n’apparaît pas, même « sortie » du groupe', async () => {
    // ── Ce que ce cas attrape, et qu’aucun autre n’attrape ─────────────────
    //
    // `pol_filiales_lecture` ouvre la table ENTIÈRE dès que `f_perimetre_groupe()`
    // est vraie — et cette fonction ne regarde que les filiales **actives**. Une
    // filiale cédée, absente de tout périmètre, échappe donc à sa condition. Sur
    // `filiales` seule ce n’est pas une fuite ; dans une CONSOLIDATION, c’en est
    // une ligne à zéro partout, qui se lit « cette filiale va bien » là où la
    // vérité est « vous ne voyez pas ses données ».
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur-cession', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (c) => {
        await c.query(
          `insert into filiales (id, code, raison_sociale, statut, date_sortie)
                values ('FIL-CEDEE', 'ZZOUT', 'Filiale cédée en 2025', 'sortie', date '2025-06-30')
           on conflict (id) do nothing`,
        );
      },
      { annuler: false },
    );

    // Matière : la filiale cédée existe bel et bien, et la session Groupe
    // couvre toutes les filiales ACTIVES — donc `f_perimetre_groupe()` est vraie
    // et la table s’ouvrirait sans le garde-fou.
    const constat = await base.avecPerimetre(
      applicatif,
      perimetre('direction', FILIALE_A, [FILIALE_A, FILIALE_B]),
      async (c) => {
        const { rows } = await c.query('select f_perimetre_groupe() as g');
        const brut = await c.query("select count(*)::text as n from filiales where code = 'ZZOUT'");
        return { groupe: rows[0].g, lisibleEnBrut: Number(brut.rows[0].n) };
      },
    );
    assert.equal(constat.groupe, true, 'sans périmètre Groupe, ce cas ne prouve rien');
    assert.equal(
      constat.lisibleEnBrut,
      1,
      'la politique laisse bien passer la filiale cédée : c’est ce que la route doit corriger',
    );

    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    assert.deepEqual(
      groupe.filiales.map((f) => f.code),
      ['ZZESSA', 'ZZESSB'],
      'la filiale cédée ne doit PAS figurer : elle sortirait à zéro partout, ce qui se lit ' +
        '« tout va bien » au lieu de « hors de votre périmètre »',
    );
    assert.equal(groupe.perimetre.filiales, 2);
  });

});

/* =====================================================================
 *  §2 — Un domaine fermé rend `null`, jamais zéro
 * ===================================================================== */

describe('§2 — un domaine hors des droits rend null, et null n’est pas zéro', () => {
  test('un profil restreint voit ses domaines, et NULL sur les autres', async () => {
    const complet = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    const restreint = await consolider(
      sessionDe('dpo', [FILIALE_A, FILIALE_B], ['rgpd', 'documents']),
    );

    // ── Matière : ce qui est nul chez le restreint doit être NON NUL chez le
    //    complet, sinon « c'est null » ne dit rien du contrôle de droits.
    assert.ok(
      complet.total.risques !== null && complet.total.risques.total > 0,
      'sans risques visibles pour un profil complet, le null du profil restreint ne prouve rien',
    );
    assert.ok(complet.total.incidents.total > 0);

    assert.equal(restreint.total.risques, null, 'domaine « risques » fermé : null attendu');
    assert.equal(restreint.total.incidents, null, 'domaine « incidents » fermé : null attendu');
    assert.equal(restreint.total.conformite, null, 'domaine « conformite » fermé : null attendu');
    assert.equal(restreint.total.actifs, null);
    assert.equal(restreint.total.audits, null);
    assert.equal(restreint.total.actions, null);

    // ── Et ce qui est ouvert reste mesuré, sinon le profil ne verrait rien du
    //    tout et le test passerait pour une raison qui n'est pas la bonne.
    assert.ok(
      restreint.total.documents !== null && restreint.total.documents.total > 0,
      'le domaine « documents » est ouvert à ce profil : il doit porter des chiffres',
    );

    for (const filiale of restreint.filiales) {
      assert.equal(filiale.indicateurs.risques, null);
      assert.notEqual(
        filiale.indicateurs.risques,
        0,
        'zéro dirait « aucun risque » ; le profil n’a simplement pas le droit de savoir',
      );
    }
  });
});

/* =====================================================================
 *  §3 — Les calculs : « en retard », « revue échue », portée Groupe
 * ===================================================================== */

describe('§3 — ce qui se calcule est calculé, et ce qui se découvre est découvert', () => {
  test('« en retard » regarde l’échéance ET le statut', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    const a = parCode(groupe, 'ZZESSA');
    const b = parCode(groupe, 'ZZESSB');

    // A porte une action dépassée non terminée, une dépassée TERMINÉE, et une
    // sans échéance. Une seule est en retard.
    assert.equal(a.indicateurs.actions.enRetard, 1, 'l’action terminée ne doit pas compter');
    assert.equal(b.indicateurs.actions.enRetard, 0, 'B n’a aucune action datée');
    assert.ok(
      a.indicateurs.actions.sansEcheance >= 1,
      'le semis commun pose une action sans échéance : elle doit être comptée à part',
    );
  });

  test('une revue de document dépassée est vue, et seulement dans sa filiale', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    assert.equal(parCode(groupe, 'ZZESSA').indicateurs.documents.revueEchue, 1);
    assert.equal(parCode(groupe, 'ZZESSB').indicateurs.documents.revueEchue, 0);
  });

  test('les répartitions sont DÉCOUVERTES, pas récitées', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    const niveaux = groupe.total.risques.parNiveau;

    // Les valeurs viennent de la base, telles qu'elles y sont. Rien dans le code
    // de la route ne les énumère : une valeur ajoutée demain à la contrainte
    // `ck_risques_niveau` apparaîtra ici sans qu'on touche à rien.
    assert.equal(niveaux['critique'], 1, 'le risque critique de A doit apparaître sous sa clé');
    assert.equal(niveaux['faible'], 1, 'le risque faible de B doit apparaître sous sa clé');
    assert.ok(
      niveaux['non renseigné'] > 0,
      'les risques du semis n’ont pas de niveau : ils doivent se ranger sous « non renseigné », ' +
        'pas disparaître',
    );
    assert.equal(
      Object.values(niveaux).reduce((x, y) => x + y, 0),
      groupe.total.risques.total,
      'la répartition doit épuiser le total : une valeur non prévue ne doit RIEN perdre',
    );

    const statuts = groupe.total.documents.parStatut;
    assert.equal(statuts['à réviser'], 1);
    assert.ok(statuts['en vigueur'] >= 1);
  });

  test('la portée Groupe est comptée à part, jamais dans une filiale', async () => {
    const session = sessionDe('direction', [FILIALE_A, FILIALE_B]);
    const groupe = await consolider(session);

    // `DOC-G` — la PSSI du groupe — porte `filiale_id` nul. La compter dans
    // chaque filiale la compterait vingt fois en production ; l'oublier ferait
    // disparaître le socle documentaire commun. Les deux sont des défauts, et la
    // seule assertion qui les attrape tous les deux est une LOI DE CONSERVATION :
    // ce que la session voit en base doit se retrouver, une fois et une seule,
    // dans la consolidation.
    const visibles = await base.avecPerimetre(applicatif, session.reglages, async (c) => {
      const { rows } = await c.query(
        `select count(*) filter (where filiale_id is not null)::text as en_filiale,
                count(*) filter (where filiale_id is null)::text     as en_groupe
           from documents`,
      );
      return { enFiliale: Number(rows[0].en_filiale), enGroupe: Number(rows[0].en_groupe) };
    });

    assert.ok(
      visibles.enGroupe >= 1 && visibles.enFiliale >= 2,
      `matière insuffisante : ${visibles.enGroupe} document(s) de portée Groupe et ` +
        `${visibles.enFiliale} en filiale. Sans les deux, la loi de conservation est vraie ` +
        'pour une mauvaise raison.',
    );

    const sommeFiliales = groupe.filiales.reduce((n, f) => n + f.indicateurs.documents.total, 0);
    assert.equal(
      sommeFiliales,
      visibles.enFiliale,
      'les filiales doivent porter exactement les documents cloisonnés — ni plus, ni moins',
    );
    assert.equal(
      groupe.porteeGroupe.documents.total,
      visibles.enGroupe,
      'la portée Groupe doit porter exactement les documents à filiale_id nul',
    );
    assert.equal(
      groupe.total.documents.total,
      sommeFiliales,
      'le total par filiale ne doit PAS inclure la portée Groupe : elle est rendue à part',
    );
  });

  test('la conformité rend des COMPTES par référentiel, pas un taux', async () => {
    const groupe = await consolider(sessionDe('direction', [FILIALE_A, FILIALE_B]));
    const a = parCode(groupe, 'ZZESSA').indicateurs.conformite;
    const refs = new Map(a.parReferentiel.map((r) => [r.refId, r]));

    assert.ok(refs.has('anssi'), 'le référentiel ANSSI du semis doit être rendu');
    assert.ok(refs.has('iso-27002-2022'), 'le second référentiel doit être rendu séparément');

    const iso = refs.get('iso-27002-2022');
    assert.equal(iso.parStatut['conforme'], 1);
    assert.equal(iso.maturiteRenseignees, 1);
    assert.equal(iso.maturiteSomme, 4, 'somme et compte, jamais une moyenne : elles se ré-agrègent');

    // Aucune clé « taux », « score » ou « pourcentage » : le serveur ne possède
    // pas la définition (AirCyber se score sans CMMI, l'ANSSI avec).
    for (const clef of Object.keys(iso)) {
      assert.ok(
        !/taux|score|pourcent/i.test(clef),
        `le serveur ne doit pas rendre « ${clef} » : la définition du score vit dans le ` +
          'catalogue des référentiels, côté navigateur',
      );
    }
  });
});

/* =====================================================================
 *  §4 — La route : aucun paramètre de filiale, et une trace au journal
 * ===================================================================== */

describe('§4 — GET /api/consolidation', () => {
  test('rend la consolidation du périmètre résolu par le serveur', async () => {
    const { statut, corps } = await vueGroupe.appeler('GET', '/api/consolidation');
    assert.equal(statut, 200);
    assert.equal(corps.perimetre.groupe, true);
    assert.equal(corps.perimetre.filiales, 2);
    assert.equal(corps.filiales.length, 2);
    assert.equal(
      corps.filiales.filter((f) => f.active).length,
      1,
      'exactement une filiale est celle sur laquelle la session écrit',
    );
  });

  test('un paramètre « filiale » n’élargit ni ne restreint rien — il n’existe pas', async () => {
    const nu = await vueGroupe.appeler('GET', '/api/consolidation');
    const force = await vueGroupe.appeler(
      'GET',
      `/api/consolidation?filiale=${encodeURIComponent(FILIALE_B)}&filiales=${encodeURIComponent(FILIALE_B)}`,
    );

    assert.equal(force.statut, 200);
    // `horodatage` bouge d'un appel à l'autre : c'est le seul champ qui doit bouger.
    const sansHorodatage = (c) => JSON.stringify({ ...c, horodatage: 0 });
    assert.equal(
      sansHorodatage(force.corps),
      sansHorodatage(nu.corps),
      'la réponse doit être insensible à tout paramètre de filiale',
    );
  });

  /* ═══════════════════════════════════════════════════════════════════
     ⚠️ CET ESSAI DISAIT L'INVERSE, ET IL AVAIT TORT — constat **Q-200**

     Il vérifiait que le journal ne bougeait PAS, en citant une règle que
     `src/pieces/index.ts:745` contredit depuis le lot L6 : le dépôt trace
     déjà un téléchargement de pièce jointe sous `consultation_sensible`.

     C'est la cinquième occurrence sur ce chantier du motif « un essai qui
     MESURE un défaut et le CONSACRE comme une propriété désirable ». Il
     n'était pas faux au sens où il mentait sur ce que fait le code — il
     l'était au sens où il **ne posait jamais la question** : *et le jour où
     l'on demandera qui a consulté les chiffres du groupe, saura-t-on
     répondre ?*
     ═══════════════════════════════════════════════════════════════════ */
  test('consulter la consolidation LAISSE UNE TRACE, et une seule', async () => {
    // ⚠️ SOUS PÉRIMÈTRE. Le journal ne se lit pas nu depuis la fermeture de la
    //    condition E6 : une connexion sans périmètre rend zéro ligne — pas une
    //    erreur. Un essai qui interroge la table sans périmètre lit donc « 0 »
    //    et conclut « rien n'a été écrit », alors qu'il n'a rien eu le droit de
    //    voir. C'est le piège exact de Q-108, sous un autre habit.
    const entrees = async () =>
      await base.avecPerimetre(
        applicatif,
        perimetre('lecteur-journal', FILIALE_A, [FILIALE_A, FILIALE_B], true),
        async (client) =>
          (
            await client.query(
              `select "action", "resume", "valeurs_apres", "utilisateur_libelle"
                 from "journal_audit" where "action" = 'consultation_sensible'
                order by "numero"`,
            )
          ).rows,
      );

    const avant = await entrees();
    const { statut, corps } = await vueGroupe.appeler('GET', '/api/consolidation');
    assert.equal(statut, 200);
    const apres = await entrees();

    assert.equal(
      apres.length,
      avant.length + 1,
      'UNE lecture du groupe entier doit laisser UNE entrée : ni zéro — la question « qui a ' +
        'consulté les chiffres consolidés ? » serait sans réponse en audit —, ni deux, qui ' +
        'signalerait une trace posée deux fois sur le même geste.',
    );

    const derniere = apres[apres.length - 1];
    assert.match(derniere.resume, /consolidée du groupe/u);
    assert.equal(derniere.utilisateur_libelle, 'direction', 'la trace doit nommer l’acteur — pas le rôle SQL, la session');

    // ── Ce que la trace a le droit de porter, et rien de plus. Le journal est
    //    lisible par un profil qui n'a pas forcément le droit de lire les
    //    enregistrements eux-mêmes : y déverser des noms d'actifs ou de risques
    //    en ferait un canal de fuite (c'est la leçon de Q-118).
    const details = derniere.valeurs_apres;
    assert.deepEqual(
      Object.keys(details).sort(),
      ['filiales_lues', 'perimetre_groupe'],
      'La trace ne porte que des NOMBRES et un booléen. Tout champ supplémentaire doit être ' +
        'justifié ici : un nom d’enregistrement dans le journal est une fuite par la trace.',
    );
    assert.equal(details.filiales_lues, corps.filiales.length);
    assert.equal(details.perimetre_groupe, corps.perimetre.groupe);
  });

  test('LA MATIÈRE : le journal n’était pas vide avant, sinon tout ce qui précède est creux', async () => {
    // Sans cette moitié, l'essai précédent passerait aussi sur une base où le
    // journal ne s'écrit jamais — et c'est précisément le genre de vert qui a
    // laissé passer Q-108, où l'on comparait 0 à 0 en concluant au succès.
    const rows = await base.avecPerimetre(
      applicatif,
      perimetre('lecteur-journal', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      async (client) =>
        (await client.query('select count(*)::text as n from journal_audit')).rows,
    );
    assert.ok(
      Number(rows[0].n) >= 2,
      `Le journal porte ${rows[0].n} entrée(s) : trop peu pour que le compte ci-dessus mesure ` +
        'quoi que ce soit.',
    );
  });
});
