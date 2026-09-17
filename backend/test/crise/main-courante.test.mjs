/**
 * main-courante.test.mjs — **une main courante rééditable ne prouve rien**
 * (lot L20, action 20.5)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | On ajoute, et le SERVEUR pose numéro, horodatage, auteur et empreintes |
 * | 2 | **On ne modifie pas, on ne supprime pas, on ne vide pas** — `GRC01` |
 * | 3 | La chaîne est PAR INCIDENT : deux crises ne se mêlent pas |
 * | 4 | Une entrée RETOUCHÉE se voit — et la suivante aussi |
 * | 5 | Une entrée RETIRÉE se voit |
 * | 6 | Cloisonnement : la voisine ne lit pas le récit d'une crise qui n'est pas la sienne |
 * | 7 | Le garde-fou MESURE les quatre couches — et il MORD |
 *
 * ── ⚠️ LE §2 EST LE CŒUR, ET IL SE MESURE PAR TROIS REFUS ─────────────────
 *
 * L'ajout seul n'est pas une politique d'écran : c'est quatre couches dans la
 * base (`CONVENTIONS.md` §12). L'essai les éprouve **sous le rôle applicatif**,
 * celui que l'API emploie — pas sous le propriétaire, qui peut tout. Éprouver
 * sous le propriétaire mesurerait une garantie que personne n'a.
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

function perimetreApi(filialeId, filiales) {
  return {
    utilisateurId: 'admin.grc',
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
});

after(async () => {
  await base?.fermer();
});

async function monterPour(filiale, filiales) {
  return await monterGreffon(base, perimetreApi(filiale, filiales));
}

/** Ajoute une entrée par la route, et rend ce que le serveur a posé. */
async function ajouter(monte, incident, texte, categorie = 'constat') {
  const { statut, corps } = await monte.appeler('POST', `/api/main-courante/${incident}`, {
    corps: { texte, categorie },
  });
  assert.equal(statut, 201, JSON.stringify(corps).slice(0, 300));
  return corps;
}

/** Le récit rendu par la route. */
async function lire(monte, incident) {
  const { statut, corps } = await monte.appeler('GET', `/api/main-courante/${incident}`);
  assert.equal(statut, 200, JSON.stringify(corps).slice(0, 300));
  return corps;
}

describe('La main courante de crise, par la route', () => {
  test('§1 — on ajoute, et le SERVEUR pose tout ce qui fait la preuve', async () => {
    // ⚠️ Un incident NEUF, et non celui du semis partagé : le semis pose déjà une
    // entrée sur « INC-A », si bien que la première ajoutée y porterait le numéro 2.
    // L'essai mesurerait alors le semis, pas la numérotation.
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `insert into incidents (id, filiale_id, titre) values ('INC-A-NEUF', $1, 'Crise neuve')`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );

    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      const premiere = await ajouter(monte, 'INC-A-NEUF', 'Alerte reçue de l’hébergeur.', 'constat');
      assert.equal(premiere.numero, 1, 'La première entrée d’une crise porte le numéro 1.');
      const seconde = await ajouter(monte, 'INC-A-NEUF', 'Cellule de crise réunie.', 'decision');
      assert.equal(seconde.numero, 2);

      const recit = await lire(monte, 'INC-A-NEUF');
      assert.equal(recit.entrees.length, 2);
      assert.equal(recit.sain, true, JSON.stringify(recit.anomalies));

      const [a, b] = recit.entrees;
      // ⚠️ L'auteur vient de la SESSION, jamais du corps de la requête : une
      // trace inaltérable dont l'acteur est déclaré par le client garantit
      // l'intégrité d'une FAUSSE preuve (constat N-5).
      assert.equal(a.auteur, 'admin.grc');
      assert.match(a.horodatage, /^\d{4}-\d{2}-\d{2}T/u, 'L’horodatage doit sortir en ISO.');
      assert.equal(a.empreinte.length, 64, 'L’empreinte est un sha256 hexadécimal.');
      assert.notEqual(a.empreinte, b.empreinte);
    } finally {
      await monte.fermer();
    }
  });

  test('§2 — on ne modifie pas, on ne supprime pas, on ne vide pas', async () => {
    // ⚠️ SOUS LE RÔLE APPLICATIF, celui que l'API emploie. Éprouver sous le
    // propriétaire mesurerait une garantie que personne n'a : le propriétaire
    // peut désactiver un déclencheur, et le §12 le dit en toutes lettres.
    for (const [geste, sql] of [
      ['modification', "update main_courante set texte = 'réécrit'"],
      ['suppression', 'delete from main_courante'],
      ['vidage', 'truncate main_courante'],
    ]) {
      const erreur = await erreurAttendue(
        base.avecPerimetre(
          applicatif,
          perimetre('admin.grc', FILIALE_A, [FILIALE_A]),
          async (c) => {
            await c.query(sql);
          },
        ),
      );
      // GRC01 quand le déclencheur parle, 42501 quand le privilège manque —
      // les deux sont des refus, et les DEUX couches doivent être là. On exige
      // donc l'un OU l'autre, et le §7 vérifie séparément que les deux existent.
      assert.ok(
        erreur.code === 'GRC01' || erreur.code === '42501',
        `Le ${geste} d’une entrée de main courante a été ACCEPTÉ (code ${String(erreur.code)}). ` +
          'Une main courante rééditable ne prouve rien : c’est le critère de l’action 20.5.',
      );
    }

    // ⚠️ ET LE CAS QU'ON OUBLIE : un `update` qui ne toucherait AUCUNE ligne.
    // Un déclencheur posé « for each row » ne le verrait pas, et l'ajout seul
    // aurait un trou que personne ne mesure.
    const vide = await erreurAttendue(
      base.avecPerimetre(applicatif, perimetre('admin.grc', FILIALE_A, [FILIALE_A]), async (c) => {
        await c.query("update main_courante set texte = 'x' where id = 'MC-INEXISTANT'");
      }),
    );
    assert.ok(
      vide.code === 'GRC01' || vide.code === '42501',
      'Un UPDATE qui ne touche aucune ligne a été accepté : le refus est posé « for each ' +
        'row » au lieu de « for each statement », et l’ajout seul a un trou.',
    );
  });

  test('§3 — la chaîne est PAR INCIDENT : deux crises ne se mêlent pas', async () => {
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      // `INC-A-NEUF` porte déjà deux entrées (§1) ; une seconde crise repart à 1.
      await base.avecPerimetre(
        applicatif,
        perimetre('semeur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query(
            `insert into incidents (id, filiale_id, titre) values ('INC-A2', $1, 'Seconde crise')`,
            [FILIALE_A],
          );
        },
        { annuler: false },
      );
      const premiere = await ajouter(monte, 'INC-A2', 'Autre crise, autre récit.');
      assert.equal(
        premiere.numero,
        1,
        'La seconde crise reprend la numérotation de la première : un export de l’une ' +
          'porterait des trous, et prouverait qu’il manque des entrées qui ne la regardent pas.',
      );

      const recitA = await lire(monte, 'INC-A-NEUF');
      const recitA2 = await lire(monte, 'INC-A2');
      assert.equal(recitA.entrees.length, 2);
      assert.equal(recitA2.entrees.length, 1);
      assert.equal(recitA.sain, true);
      assert.equal(recitA2.sain, true);
    } finally {
      await monte.fermer();
    }
  });

  test('§4 — une entrée RETOUCHÉE se voit, et la RECALCULER ne sauve pas', async () => {
    // ── ⚠️ DEUX ADVERSAIRES, ET LE SECOND EST LE VRAI ──────────────────────
    //
    // Le `CONVENTIONS.md` §12 distingue trois gestes, et chacun est trahi par
    // autre chose :
    //   · retoucher le CONTENU          → `empreinte_invalide` SUR CETTE ENTRÉE ;
    //   · retoucher le contenu ET l'empreinte → `chainage_rompu` SUR LA SUIVANTE ;
    //   · retirer une entrée            → `numero_manquant` ET `chainage_rompu`.
    //
    // ⚠️ **La première rédaction de cet essai exigeait les DEUX anomalies d'un
    // seul geste**, et elle a rougi — à juste titre : retoucher le texte sans
    // toucher à l'empreinte ne rompt aucun chaînage, puisque l'empreinte stockée
    // de l'entrée précédente n'a pas bougé. L'essai affirmait une propriété que
    // le mécanisme ne promet pas, et la pente était de « corriger » le mécanisme
    // pour qu'il la tienne. C'est le geste qu'on ne fait pas.
    //
    // Les mutations sont jouées sous le PROPRIÉTAIRE et dans des transactions
    // ANNULÉES : c'est exactement l'adversaire que le chaînage vise — celui qui a
    // les droits de la base, et contre qui les quatre couches ne peuvent rien.
    const proprietaire = await base.connexion('proprietaire');

    const avecAdversaire = async (travail) => {
      let resultat;
      try {
        await proprietaire.query('begin');
        await proprietaire.query("select set_config('grc.authentification', 'oui', true)");
        await proprietaire.query("select set_config('grc.utilisateur', 'adversaire', true)");
        await proprietaire.query("select set_config('grc.filiale_id', $1, true)", [FILIALE_A]);
        await proprietaire.query("select set_config('grc.filiales', $1, true)", [FILIALE_A]);
        await proprietaire.query(
          'alter table main_courante disable trigger trg_main_courante_interdit_maj',
        );
        resultat = await travail();
      } finally {
        await proprietaire.query('rollback').catch(() => undefined);
      }
      return resultat;
    };

    // ── (a) La retouche SEULE : l'entrée elle-même est trahie ──────────────
    const retouche = await avecAdversaire(async () => {
      const mute = await proprietaire.query(
        `update main_courante set texte = 'Rien d’anormal, tout va bien.'
          where incident_id = 'INC-A-NEUF' and numero = 1`,
      );
      assert.equal(mute.rowCount, 1, 'La mutation n’a touché aucune ligne : elle ne mesure rien.');
      return (
        await proprietaire.query(
          "select numero, anomalie from f_main_courante_verifier('INC-A-NEUF')",
        )
      ).rows;
    });
    assert.ok(
      retouche.some((v) => v.numero === 1 && v.anomalie === 'empreinte_invalide'),
      'Une entrée retouchée passe inaperçue : le récit d’une crise peut être réécrit par qui ' +
        `a les droits de la base, sans laisser de trace.\n  Rendu : ${JSON.stringify(retouche)}`,
    );

    // ── (b) La retouche AVEC empreinte recalculée : la SUIVANTE la trahit ──
    //
    // C'est l'adversaire qui a lu le schéma. Il refait l'empreinte de l'entrée
    // qu'il réécrit, et celle-ci redevient cohérente avec elle-même. Ce qui le
    // trahit est ailleurs : `empreinte_precedente` de l'entrée SUIVANTE a été
    // figée à l'écriture, et elle ne correspond plus.
    const recalculee = await avecAdversaire(async () => {
      await proprietaire.query(
        `update main_courante m
            set texte = 'Rien d’anormal, tout va bien.',
                empreinte = encode(sha256(convert_to(
                    f_main_courante_charge_utile(
                        m.numero, m.id, m.horodatage, m.filiale_id, m.incident_id,
                        m.auteur, m.auteur_libelle, m.categorie,
                        'Rien d’anormal, tout va bien.', m.empreinte_precedente),
                    'UTF8')), 'hex')
          where m.incident_id = 'INC-A-NEUF' and m.numero = 1`,
      );
      return (
        await proprietaire.query(
          "select numero, anomalie from f_main_courante_verifier('INC-A-NEUF')",
        )
      ).rows;
    });
    assert.equal(
      recalculee.some((v) => v.numero === 1 && v.anomalie === 'empreinte_invalide'),
      false,
      'L’entrée retouchée ET recalculée devrait être cohérente avec elle-même : si elle ne ' +
        'l’est pas, l’essai ne mesure pas l’adversaire qu’il croit mesurer.',
    );
    assert.ok(
      recalculee.some((v) => v.numero === 2 && v.anomalie === 'chainage_rompu'),
      'RECALCULER L’EMPREINTE SUFFIT À EFFACER LA TRACE : un adversaire qui a lu le schéma ' +
        'réécrit le récit d’une crise sans que rien ne le dise. C’est le chaînage qui doit le ' +
        `trahir, par l’entrée SUIVANTE.\n  Rendu : ${JSON.stringify(recalculee)}`,
    );

    // Les deux transactions sont annulées : la base n'a pas bougé.
    const monte = await monterPour(FILIALE_A, [FILIALE_A]);
    try {
      assert.equal((await lire(monte, 'INC-A-NEUF')).sain, true);
    } finally {
      await monte.fermer();
    }
  });

  test('§5 — une entrée RETIRÉE se voit', async () => {
    const proprietaire = await base.connexion('proprietaire');
    let verdict;
    try {
      await proprietaire.query('begin');
      await proprietaire.query("select set_config('grc.authentification', 'oui', true)");
      await proprietaire.query("select set_config('grc.utilisateur', 'adversaire', true)");
      await proprietaire.query("select set_config('grc.filiale_id', $1, true)", [FILIALE_A]);
      await proprietaire.query("select set_config('grc.filiales', $1, true)", [FILIALE_A]);
      await proprietaire.query(
        'alter table main_courante disable trigger trg_main_courante_interdit_suppr',
      );
      await proprietaire.query(
        "delete from main_courante where incident_id = 'INC-A-NEUF' and numero = 1",
      );
      verdict = (
        await proprietaire.query(
          "select numero, anomalie from f_main_courante_verifier('INC-A-NEUF')",
        )
      ).rows;
    } finally {
      await proprietaire.query('rollback').catch(() => undefined);
    }

    assert.ok(
      verdict.length > 0,
      'Une entrée retirée ne laisse aucune trace : « il ne s’est rien passé entre 3 h et 4 h » ' +
        'deviendrait indémontrable — et c’est précisément l’heure qui intéresse un enquêteur.',
    );
    assert.ok(
      verdict.some((v) => v.anomalie === 'numero_manquant' || v.anomalie === 'chainage_rompu'),
      `Rendu : ${JSON.stringify(verdict)}`,
    );
  });

  test('§6 — la voisine ne lit pas le récit d’une crise qui n’est pas la sienne', async () => {
    const monte = await monterPour(FILIALE_B, [FILIALE_B]);
    try {
      const recit = await lire(monte, 'INC-A');
      assert.deepEqual(
        recit.entrees,
        [],
        'FUITE ENTRE FILIALES : le récit de la crise de Toulouse est lisible depuis ' +
          'l’Allemagne — heure par heure, décision par décision.',
      );
      // ⚠️ Et le verdict est « sain » sur une chaîne VIDE, ce qui est juste : rien
      // ne manque dans ce qu'on ne voit pas. Un « corrompu » serait une fuite d'un
      // autre genre — il apprendrait qu'il existe quelque chose ailleurs.
      assert.equal(recit.sain, true);
    } finally {
      await monte.fermer();
    }
  });

  test('§7 — le garde-fou MESURE les quatre couches, et il MORD', async () => {
    const proprietaire = await base.connexion('proprietaire');
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_main_courante()'), []);
    assert.equal(
      (
        await base.lignes(
          proprietaire,
          "select count(*)::int as n from controles_schema where fonction = 'f_verifier_main_courante'",
        )
      )[0].n,
      1,
    );

    // ── LA MORSURE, sur les deux couches les plus faciles à perdre ─────────
    for (const [nom, mutation, anomalie] of [
      [
        'le privilège rendu au rôle applicatif',
        'grant update on main_courante to grc_app',
        'ajout_seul_privilege',
      ],
      [
        'le déclencheur ramené « par ligne »',
        `drop trigger trg_main_courante_interdit_maj on main_courante;
         create trigger trg_main_courante_interdit_maj before update on main_courante
           for each row execute function f_interdit_modification()`,
        'ajout_seul_declencheur_mal_arme',
      ],
    ]) {
      let anomalies;
      try {
        await proprietaire.query('begin');
        await proprietaire.query(mutation);
        anomalies = (
          await proprietaire.query('select objet, anomalie from f_verifier_main_courante()')
        ).rows;
      } finally {
        await proprietaire.query('rollback').catch(() => undefined);
      }
      assert.ok(
        anomalies.some((a) => a.anomalie === anomalie),
        `LE GARDE NE MORD PAS sur « ${nom} » : une des quatre couches du §12 peut tomber sous ` +
          `zéro anomalie.\n  Rendu : ${JSON.stringify(anomalies)}`,
      );
    }

    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_main_courante()'),
      [],
      'Une transaction annulée a laissé une mutation derrière elle.',
    );
  });
});
