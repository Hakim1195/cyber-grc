/**
 * classification.test.mjs — **jusqu'où ce document peut-il circuler, et de quel
 * traitement relève-t-il ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Lot RGPD, pièces 1 et 2 — migration `027`
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le registre documentaire portait `titre`, `type`, `statut`, `proprietaire` — rien
 * qui dise le niveau de diffusion, rien qui dise si la pièce contient des données
 * personnelles, rien qui la relie au registre de l'article 30 que le produit tient
 * pourtant dans la table voisine. **Les deux registres cohabitaient sans se
 * connaître.**
 *
 * ── Ce que cet essai mesure, et où vit chaque garantie ───────────────────
 *
 *  §1 la CLASSIFICATION est obligatoire et bornée — `ck_documents_confidentialite`
 *     et le défaut `interne`. ⚠️ Le défaut est éprouvé, pas supposé : c'est lui qui
 *     décide de ce que devient un document repris d'un export antérieur à `027`, et
 *     « public par défaut » aurait été le pire réglage imaginable.
 *
 *  §2 les ÉTIQUETTES sont normalisées **dans la base** — `f_normaliser_etiquette()`.
 *     Le banc l'attaque en SQL et non par la route : une route qui normalise
 *     elle-même resterait verte le déclencheur retiré, et c'est exactement le piège
 *     du constat Q-282 (*« un essai qui promeut PAR LA ROUTE ne mesure pas le
 *     déclencheur »*).
 *
 *  §3 le RATTACHEMENT à l'article 30 ne franchit pas la frontière Groupe/filiale —
 *     `fk_documents_traitement_portee` **et** `fk_documents_traitement_coherence`.
 *     C'est le constat N-10 de la porte S1, et son rayon est ici maximal : une
 *     politique de portée Groupe rattachée au traitement LOCAL d'une filiale, que
 *     cette filiale pourrait ensuite effacer.
 *
 *  §4 les deux GARDE-FOUS mordent — on les casse un par un, et le schéma rougit.
 *     `f_verifier_references_portee()` est de CLASSE : il ne vérifie pas les trois
 *     références de cette migration, il vérifie la règle dont elles sont trois
 *     instances.
 *
 *  §5 le cloisonnement tient sur la table neuve : les étiquettes d'un document de
 *     la filiale voisine ne remontent pas.
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

let base;
let applicatif;
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
});

after(async () => {
  await base?.fermer();
});

/** Une transaction dans la filiale A, annulée par défaut. */
function dansA(travail, options) {
  return base.avecPerimetre(
    applicatif,
    perimetre('essai-027', FILIALE_A, [FILIALE_A, FILIALE_B]),
    travail,
    options,
  );
}

/** Une transaction d'administration Groupe — la seule qui écrit à `filiale_id` nul. */
function auGroupe(travail, options) {
  return base.avecPerimetre(
    applicatif,
    perimetre('essai-027', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    travail,
    options,
  );
}

/* =====================================================================
 *  §1 — LA CLASSIFICATION EST OBLIGATOIRE, BORNÉE, ET SON DÉFAUT EST SÛR
 * ===================================================================== */

describe('§1 — le niveau de diffusion', () => {
  test('les quatre niveaux passent, et EUX SEULS', async () => {
    await dansA(async (c) => {
      for (const niveau of ['public', 'interne', 'confidentiel', 'restreint']) {
        await c.query(
          `insert into documents (id, filiale_id, titre, confidentialite)
               values ($1, $2, 'Document classé', $3)`,
          [`DOC-N-${niveau}`, FILIALE_A, niveau],
        );
      }
      const { rows } = await c.query(
        "select count(*)::int as n from documents where id like 'DOC-N-%'",
      );
      assert.equal(rows[0].n, 4);
    });

    // Un cinquième niveau — « diffusion libre », qui serait le plus dangereux —
    // est refusé par la contrainte, pas par une politique d'écran.
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          `insert into documents (id, filiale_id, titre, confidentialite)
               values ('DOC-N-libre', $1, 'Document', 'diffusion libre')`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /ck_documents_confidentialite/u);
  });

  test('LE DÉFAUT EST « interne », jamais « public »', async () => {
    // C'est ce que devient un document repris d'un export antérieur à `027`, et
    // c'est le seul réglage acceptable : un document dont personne n'a tranché la
    // diffusion ne doit pas être réputé diffusable hors du groupe.
    const niveau = await dansA(async (c) => {
      await c.query(
        "insert into documents (id, filiale_id, titre) values ('DOC-DEFAUT', $1, 'Sans mention')",
        [FILIALE_A],
      );
      const { rows } = await c.query(
        "select confidentialite, donnees_personnelles from documents where id = 'DOC-DEFAUT'",
      );
      return rows[0];
    });
    assert.equal(niveau.confidentialite, 'interne');
    assert.equal(niveau.donnees_personnelles, false);
  });

  test('la colonne REFUSE le nul : « non classé » n’est pas un état', async () => {
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          `insert into documents (id, filiale_id, titre, confidentialite)
               values ('DOC-NUL', $1, 'Document', null)`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23502');
  });
});

/* =====================================================================
 *  §2 — LES ÉTIQUETTES, NORMALISÉES DANS LA BASE
 * ===================================================================== */

describe('§2 — les étiquettes', () => {
  test('les espaces sont ramenés à un, et les extrémités rognées', async () => {
    const valeur = await dansA(async (c) => {
      await c.query(
        `insert into document_etiquettes (document_id, etiquette, filiale_id)
             values ('DOC-A', '   audit    2026  ', $1)`,
        [FILIALE_A],
      );
      const { rows } = await c.query(
        "select etiquette from document_etiquettes where document_id = 'DOC-A' and etiquette like 'audit%'",
      );
      return rows[0]?.etiquette;
    });
    assert.equal(valeur, 'audit 2026');
  });

  test('LA CASSE EST CONSERVÉE, mais deux variantes de casse sont LA MÊME étiquette', async () => {
    // Sans cela, « RGPD » et « rgpd » coexisteraient sur la même fiche et le filtre
    // par étiquette n'en ramènerait qu'une — un filtre qui perd des lignes en
    // silence est pire que pas de filtre.
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', 'RGPD', $1)`,
          [FILIALE_A],
        );
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', 'rgpd', $1)`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23505');
    assert.match(erreur.message, /à la casse près/u);
  });

  test('ni virgule ni point-virgule : l’étiquette voyage dans des listes jointes', async () => {
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', 'client Airbus, confidentiel', $1)`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
  });

  test('une étiquette faite d’espaces est REFUSÉE, pas avalée', async () => {
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', '     ', $1)`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.message, /ne classe rien/u);
  });

  test('UNE MODIFICATION vers la variante de casse est refusée AUSSI — Q-298', async () => {
    /* ══ LE CHEMIN QUE LE GARDE MESURAIT EXACTEMENT, ET QU'IL NE COUVRAIT PAS ══
     *
     * `trg_document_etiquettes_normalise` était `before insert` SEUL, et
     * `f_verifier_classification_documents()` vérifiait exactement `(tgtype & 4)`
     * — c'est-à-dire qu'il mesurait le chemin couvert et pas celui qui ne l'était
     * pas. Mesuré par l'auditeur du 8ᵉ passage :
     *
     *     insérer la variante de casse   → REFUS
     *     MODIFIER vers la variante      → « RGPD » et « rgpd » coexistent
     *
     * « Un filtre qui perd des lignes en silence est pire que pas de filtre » —
     * le commentaire de la `027`, pris en défaut par le chemin qu'elle n'avait
     * pas armé. */
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', 'AUDIT', $1), ('DOC-A', 'revue', $1)`,
          [FILIALE_A],
        );
        await c.query(
          `update document_etiquettes set etiquette = 'audit'
            where document_id = 'DOC-A' and etiquette = 'revue'`,
        );
      }),
    );
    assert.equal(erreur.code, '23505');
  });

  test('LA MORSURE : il faut casser LES DEUX barrières pour que la casse passe', async () => {
    /* ══ DEUX REMÈDES, ET ILS NE FONT PAS DOUBLE EMPLOI — Q-298 ════════════════
     *
     * Avant la `030`, la propriété ne tenait qu'au DÉCLENCHEUR : le désarmer
     * suffisait, et l'essai le mesurait ainsi. Elle tient désormais aussi par un
     * INDEX UNIQUE sur `(filiale_id, document_id, lower(etiquette))`, c'est-à-dire
     * **par la forme et non par une procédure** : un index survit à un déclencheur
     * désarmé, à une migration, à `psql`. *Une route ne voit que son chemin ; il y
     * en a toujours un de plus.*
     *
     * Ce contrôle le mesure en trois temps : le déclencheur seul retiré ne suffit
     * plus, les deux retirés laissent entrer, et le garde-fou NOMME les deux
     * manques.
     *
     * ⚠️ **Dans une transaction ANNULÉE, et sur la MÊME connexion.** Le constat
     * Q-281 a été payé par une restauration écrite à la main qui a laissé un
     * déclencheur désarmé ; un `rollback` ne peut rien laisser derrière lui. */
    const perimetreMutation = perimetre('essai-027-morsure', FILIALE_A, [FILIALE_A]);

    // 1. Le déclencheur seul désarmé : l'INDEX tient encore.
    const erreur = await erreurAttendue(
      base.avecPerimetre(proprietaire, perimetreMutation, async (c) => {
        await c.query(
          'alter table document_etiquettes disable trigger trg_document_etiquettes_normalise',
        );
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', 'MUTATION', $1), ('DOC-A', 'mutation', $1)`,
          [FILIALE_A],
        );
      }),
    );
    assert.equal(
      erreur.code,
      '23505',
      'Le déclencheur désarmé, l’index unique doit tenir seul : c’est toute la raison de ' +
        'sa présence (constat Q-298).',
    );

    // 2. Les deux retirés : les variantes entrent, et le garde NOMME les deux manques.
    const vu = await base.avecPerimetre(proprietaire, perimetreMutation, async (c) => {
      await c.query(
        'alter table document_etiquettes disable trigger trg_document_etiquettes_normalise',
      );
      await c.query('drop index uq_document_etiquettes_casse');
      await c.query(
        `insert into document_etiquettes (document_id, etiquette, filiale_id)
             values ('DOC-A', 'MUTATION', $1), ('DOC-A', 'mutation', $1)`,
        [FILIALE_A],
      );
      return {
        passees: (
          await c.query(
            `select count(*)::int as n from document_etiquettes
              where document_id = 'DOC-A' and lower(etiquette) = 'mutation'`,
          )
        ).rows[0].n,
        // Et le garde-fou du schéma le DIT, au lieu de laisser les barrières
        // mortes sous un verdict vert (constat Q-281).
        anomalies: (
          await c.query(
            'select anomalie from f_verifier_classification_documents() order by 1',
          )
        ).rows.map((l) => l.anomalie),
      };
    });

    assert.equal(
      vu.passees,
      2,
      'Les deux barrières retirées, les deux variantes entrent : la propriété vient bien ' +
        'd’elles.',
    );
    assert.deepEqual(vu.anomalies, ['normalisation_non_armee', 'unicite_casse_absente']);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  §3 — LE RATTACHEMENT NE FRANCHIT PAS LA FRONTIÈRE
 * ===================================================================== */

describe('§3 — documents.traitement_id', () => {
  test('LE CAS QUI A RENDU LA MIGRATION NÉCESSAIRE : Groupe vers Groupe', async () => {
    // Avant `027`, `traitements.filiale_id` était `not null` : la PSSI du groupe
    // n'aurait pu se rattacher à AUCUN traitement de l'article 30. Le semis pose ce
    // rattachement ; on le relit ici depuis une filiale ORDINAIRE, sans pouvoir
    // d'administration, parce que c'est la lecture qui compte — un socle commun que
    // seule l'administration verrait ne serait pas un socle commun.
    const vu = await dansA(async (c) => {
      const { rows } = await c.query(
        `select d.traitement_id, t.nom, t.filiale_id
           from documents d join traitements t on t.id = d.traitement_id
          where d.id = 'DOC-G'`,
      );
      return rows[0];
    });
    assert.equal(vu.traitement_id, 'TRT-G');
    assert.equal(vu.filiale_id, null, 'Le traitement rattaché est LUI AUSSI de portée Groupe.');
  });

  test('UN DOCUMENT DE PORTÉE GROUPE NE POINTE PAS VERS UN TRAITEMENT LOCAL', async () => {
    // Le rayon du constat N-10, à son maximum : la filiale propriétaire du
    // traitement local pourrait ensuite l'effacer, et le socle commun des vingt
    // filiales perdrait son rattachement sans que personne l'ait décidé.
    //
    // ⚠️ **Depuis la migration `030`, c'est `ck_documents_traitement_groupe` (23514)
    // qui refuse, et non plus la clé de portée (23503).** La propriété est la même ;
    // la barrière a changé de nature parce que la règle a cessé d'être symétrique —
    // constat **Q-294**, voir le contrôle suivant. Ce qui est éprouvé ici est le
    // REFUS, pas le numéro de la contrainte qui le prononce.
    const erreur = await erreurAttendue(
      auGroupe(async (c) => {
        await c.query("update documents set traitement_id = 'TRT-A' where id = 'DOC-G'");
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /ck_documents_traitement_groupe/u);
  });

  test('MAIS UN DOCUMENT LOCAL RELÈVE D’UN TRAITEMENT DE GROUPE — Q-294', async () => {
    /* ══ LE SENS QU'ON OUVRE, ET POURQUOI ═══════════════════════════════════
     *
     * La règle de la `027` était SYMÉTRIQUE ; le danger ne l'est pas. Un
     * traitement de portée Groupe n'est effaçable que par l'administration
     * Groupe, jamais par la filiale qui le désigne : le rattachement d'un
     * document LOCAL à ce traitement ne peut donc pas se vider sous les pieds
     * de qui que ce soit.
     *
     * Mesuré par l'auditeur du 8ᵉ passage : le produit SERVAIT le traitement de
     * Groupe, l'OFFRAIT dans le `<select>` de la fiche, et le REFUSAIT en 409 —
     * en disant à l'utilisateur que l'élément « n'existe pas dans votre
     * périmètre » alors qu'il était affiché sous ses yeux. Dix-neuf filiales ne
     * pouvaient rattacher aucune de leurs procédures au traitement que le Groupe
     * opère pour elles. */
    const vu = await dansA(async (c) => {
      await c.query("update documents set traitement_id = 'TRT-G' where id = 'DOC-A'");
      const { rows } = await c.query(
        `select traitement_id, traitement_filiale_id, traitement_portee_groupe
           from documents where id = 'DOC-A'`,
      );
      return rows[0];
    });
    assert.equal(vu.traitement_id, 'TRT-G');
    assert.equal(
      vu.traitement_filiale_id,
      null,
      'Le déclencheur doit POSER la filiale du traitement visé — nulle pour un traitement ' +
        'de portée Groupe. C’est elle qui permet aux deux clés de tenir une règle qui est ' +
        'une DISJONCTION, et qu’aucune clé étrangère ne saurait exprimer seule.',
    );
    assert.equal(vu.traitement_portee_groupe, true);
  });

  test('UN DOCUMENT LOCAL NE POINTE PAS VERS LE TRAITEMENT D’UNE AUTRE FILIALE', async () => {
    /* ⚠️ Le sens ouvert par Q-294 est « local → GROUPE », jamais « local → une
       AUTRE filiale ». Depuis la `030`, **deux barrières le refusent, et laquelle
       parle dépend de ce que l'appelant VOIT** :

        · si le traitement allemand n'est pas dans le périmètre de LECTURE, le
          déclencheur ne le trouve pas et rend `GRC07` — sans distinguer « il
          n'existe pas » de « il ne vous est pas visible », ce qui est voulu : la
          distinction serait l'oracle d'existence que le produit ferme depuis la
          porte S2 ;
        · s'il est lisible — c'est le cas ici, `dansA` lit les deux filiales —,
          le déclencheur pose `traitement_filiale_id = FIL-B` et c'est
          `ck_documents_traitement_filiale` qui refuse en `23514`.

       Ce qui est éprouvé est le REFUS ; les deux chemins sont mesurés, et aucun
       ne laisse passer. */
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query("update documents set traitement_id = 'TRT-B' where id = 'DOC-A'");
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /ck_documents_traitement_filiale/u);
  });

  test('… et le traitement d’une autre filiale INVISIBLE rend GRC07, sans oracle', async () => {
    /* L'autre moitié du contrôle précédent : depuis un périmètre qui ne lit que
       Toulouse, le traitement allemand n'est pas trouvé, et le refus ne dit pas
       s'il existe. */
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        perimetre('essai-q294-aveugle', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query("update documents set traitement_id = 'TRT-B' where id = 'DOC-A'");
        },
      ),
    );
    assert.equal(erreur.code, 'GRC07');
    assert.equal(
      /FIL|filiale/iu.test(erreur.message.replace('votre périmètre', '')),
      false,
      'Le refus ne doit nommer aucune filiale : ce serait dire à Toulouse que ce ' +
        'traitement existe ailleurs.',
    );
  });

  test('LE DÉCLENCHEUR ÉCRASE CE QUE LE CLIENT AURAIT ENVOYÉ', async () => {
    /* `traitement_filiale_id` est une valeur DÉRIVÉE D'UNE AUTRE LIGNE. La croire
       sur parole rouvrirait un oracle d'existence inter-filiales : il suffirait
       d'envoyer la filiale qui arrange pour satisfaire la clé de cohérence. */
    const vu = await dansA(async (c) => {
      await c.query(
        `update documents set traitement_id = 'TRT-G', traitement_filiale_id = $1
          where id = 'DOC-A'`,
        [FILIALE_A],
      );
      const { rows } = await c.query(
        "select traitement_filiale_id from documents where id = 'DOC-A'",
      );
      return rows[0];
    });
    assert.equal(
      vu.traitement_filiale_id,
      null,
      'Le périmètre vient du serveur, et cela vaut aussi pour une valeur dérivée d’une ' +
        'autre ligne (PLAN_SERVEUR §2.4).',
    );
  });

  test('UN TRAITEMENT RATTACHÉ NE S’EFFACE PAS EN SILENCE (restrict)', async () => {
    // `on delete set null` était le premier choix, et PostgreSQL 17 le refuse sur
    // une clé qui contient une colonne engendrée — même avec la liste de colonnes
    // de la version 15. La barrière est donc `restrict`, et le déliage vit dans la
    // couche applicative, à la filiale près (bloquant B-1 de la porte S1).
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query("delete from traitements where id = 'TRT-A'");
      }),
    );
    assert.equal(erreur.code, '23503');

    // Délié d'abord, il s'efface — et le document survit, sans son rattachement.
    const restant = await dansA(async (c) => {
      await c.query("update documents set traitement_id = null where traitement_id = 'TRT-A'");
      await c.query("delete from traitement_mesures where traitement_id = 'TRT-A'");
      await c.query("delete from traitements where id = 'TRT-A'");
      const { rows } = await c.query("select traitement_id from documents where id = 'DOC-A'");
      return rows[0];
    });
    assert.equal(restant.traitement_id, null);
  });
});

/* =====================================================================
 *  §4 — LES GARDE-FOUS MORDENT
 * ===================================================================== */

describe('§4 — les garde-fous', () => {
  /**
   * Joue une MUTATION du schéma, puis la question, puis **annule tout**.
   *
   * ⚠️ Deux leçons de ce chantier tiennent dans cette fonction, et toutes deux ont
   * été payées ici même :
   *
   *  · **le périmètre est indispensable, même au propriétaire.** Rétablir une clé
   *    étrangère fait VALIDER les lignes existantes, donc BALAYER la table — et
   *    `force row level security` s'applique au propriétaire : sans `grc.filiales`,
   *    la restauration échoue en `GRC04`. C'est exactement le §0 de la migration
   *    `012`, et il s'est rappelé à moi de la même façon, par un message qui ne
   *    nomme pas sa cause.
   *
   *  · **on mute dans une transaction qu'on ANNULE** — constat Q-281, où ma
   *    restauration « à la main » avait laissé un déclencheur désarmé sur la
   *    recette. Un `rollback` ne peut rien laisser derrière lui ; un `finally`,
   *    si — il suffit qu'il échoue.
   */
  function enMutant(travail) {
    return base.avecPerimetre(
      proprietaire,
      perimetre('essai-027-mutation', FILIALE_A, [FILIALE_A, FILIALE_B], true),
      travail,
    );
  }

  test('un schéma sain ne signale rien', async () => {
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_references_portee()'),
      [],
    );
    assert.deepEqual(
      await base.lignes(proprietaire, 'select * from f_verifier_classification_documents()'),
      [],
    );
  });

  test('LE GARDE EST DE CLASSE : il réclame la compagne de portée, où qu’elle manque', async () => {
    // ⚠️ On ne casse PAS `documents.traitement_id`, qui est l'instance que la
    // migration vient d'ajouter : on casse `traitement_mesures`, une liaison
    // écrite deux ans plus tôt. Le garde-fou la réclame sans qu'aucune ligne le
    // nomme — c'est la définition d'un contrôle de classe.
    const vu = await enMutant(async (c) => {
      await c.query('alter table traitement_mesures drop constraint fk_traitement_mesures_portee');
      const reclame = (
        await c.query('select objet, anomalie from f_verifier_references_portee()')
      ).rows;
      // Et il remonte jusqu'au point d'appel unique : un garde-fou que
      // f_verifier_schema() n'appelle pas est un commentaire.
      const parLePointDAppel = (
        await c.query(
          "select distinct controle from f_verifier_schema() where objet like 'traitement_mesures%'",
        )
      ).rows;
      return { reclame, parLePointDAppel };
    });

    assert.deepEqual(vu.reclame, [
      {
        objet: 'traitement_mesures.fk_traitement_mesures_traitement',
        anomalie: 'reference_portee_sans_compagne',
      },
    ]);
    assert.deepEqual(vu.parLePointDAppel, [{ controle: 'references_portee' }]);
    // La transaction a été annulée : le schéma est intact, sans qu'aucune
    // restauration écrite à la main ait eu à réussir.
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('LE CONTENU de la contrainte est mesuré, pas son NOM', async () => {
    // Constat Q-283 : un garde qui mesure la longueur ne mesure pas l'originalité.
    // Ici, une contrainte qui garde son NOM en perdant deux niveaux passerait un
    // contrôle par nom — et rendrait inécrivables les documents qui les portaient.
    //
    // ⚠️ `not valid` : le jeu d'essai porte déjà un document « confidentiel », et
    // une contrainte rétrécie ne peut donc pas être validée sur l'existant. C'est
    // sans importance ici — la mutation porte sur la DÉFINITION, qui est
    // exactement ce que le garde-fou lit.
    const anomalies = await enMutant(async (c) => {
      await c.query('alter table documents drop constraint ck_documents_confidentialite');
      await c.query(
        `alter table documents add constraint ck_documents_confidentialite
             check (confidentialite in ('public', 'interne')) not valid`,
      );
      return (
        await c.query(
          'select anomalie, detail from f_verifier_classification_documents() order by detail',
        )
      ).rows;
    });

    assert.equal(anomalies.length, 2, 'Deux niveaux perdus, deux anomalies.');
    assert.ok(anomalies.every((a) => a.anomalie === 'niveau_de_diffusion_perdu'));
    assert.ok(anomalies.some((a) => a.detail.includes('confidentiel')));
    assert.ok(anomalies.some((a) => a.detail.includes('restreint')));
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('la contrainte RETIRÉE est réclamée, et pas seulement rétrécie', async () => {
    const anomalies = await enMutant(async (c) => {
      await c.query('alter table documents drop constraint ck_documents_confidentialite');
      return (
        await c.query('select objet, anomalie from f_verifier_classification_documents()')
      ).rows;
    });
    assert.deepEqual(anomalies, [
      { objet: 'documents.ck_documents_confidentialite', anomalie: 'niveaux_non_bornes' },
    ]);
  });

  test('LE TYPE compte aussi : un booléen ramené à du texte est réclamé', async () => {
    // `donnees_personnelles` en texte accepterait « non », « Non », « n » et
    // « faux » comme autant de vérités distinctes — c'est le §5 des conventions,
    // et c'est un défaut que ce produit a déjà connu.
    const anomalies = await enMutant(async (c) => {
      await c.query(
        'alter table documents alter column donnees_personnelles type text ' +
          'using donnees_personnelles::text',
      );
      return (
        await c.query('select objet, anomalie from f_verifier_classification_documents()')
      ).rows;
    });
    assert.deepEqual(anomalies, [
      {
        objet: 'documents.donnees_personnelles',
        anomalie: 'classification_absente_ou_facultative',
      },
    ]);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });

  test('une colonne de classification rendue FACULTATIVE est réclamée', async () => {
    const anomalies = await enMutant(async (c) => {
      await c.query('alter table documents alter column confidentialite drop not null');
      return (
        await c.query('select objet, anomalie from f_verifier_classification_documents()')
      ).rows;
    });
    assert.deepEqual(anomalies, [
      { objet: 'documents.confidentialite', anomalie: 'classification_absente_ou_facultative' },
    ]);
    assert.deepEqual(await base.lignes(proprietaire, 'select * from f_verifier_schema()'), []);
  });
});

/* =====================================================================
 *  §5 — LE CLOISONNEMENT TIENT SUR LA TABLE NEUVE
 * ===================================================================== */

describe('§5 — cloisonnement des étiquettes', () => {
  test('les étiquettes de la filiale voisine ne remontent pas ; celles du Groupe, si', async () => {
    const vues = await base.avecPerimetre(
      applicatif,
      perimetre('essai-027', FILIALE_A, [FILIALE_A]),
      async (c) => {
        const { rows } = await c.query(
          'select document_id, etiquette from document_etiquettes order by 1, 2',
        );
        return rows;
      },
    );
    const documents = vues.map((v) => v.document_id);
    assert.ok(documents.includes('DOC-A'), 'Sa propre étiquette, oui.');
    assert.ok(documents.includes('DOC-G'), 'Celle du socle Groupe, oui — le document l’est aussi.');
    assert.ok(
      !documents.includes('DOC-B'),
      'Celle de la filiale voisine, JAMAIS — et c’est tout l’objet du cloisonnement.',
    );
  });

  test('on n’étiquette pas le document d’une autre filiale', async () => {
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        perimetre('essai-027', FILIALE_A, [FILIALE_A, FILIALE_B]),
        async (c) => {
          await c.query(
            `insert into document_etiquettes (document_id, etiquette, filiale_id)
                 values ('DOC-B', 'intrusion', $1)`,
            [FILIALE_B],
          );
        },
      ),
    );
    // La politique d'écriture ne connaît que la filiale ACTIVE : on lit son
    // périmètre, on n'écrit que là où l'on est.
    assert.equal(erreur.code, '42501');
  });

  test('le socle Groupe ne s’étiquette PAS sans administration Groupe', async () => {
    const erreur = await erreurAttendue(
      dansA(async (c) => {
        await c.query(
          "insert into document_etiquettes (document_id, etiquette) values ('DOC-G', 'sans droit')",
        );
      }),
    );
    assert.equal(erreur.code, '42501');
  });
});
