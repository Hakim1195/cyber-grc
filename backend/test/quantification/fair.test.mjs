/**
 * fair.test.mjs — **LA QUANTIFICATION FINANCIÈRE D'UN RISQUE** (lot L25, action 25.4)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le critère d'acceptation tient en deux phrases, et la seconde dit le défaut :
 *
 *   *« Une valeur en euros n'est affichée QUE si ses hypothèses sont saisies. Pas
 *     d'estimation par défaut : un chiffre inventé en comité de direction est pire
 *     que pas de chiffre. »*
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Une estimation complète rend le montant attendu — et il est **calculé par la base** |
 * | 2 | Un **triplet incomplet** est refusé : deux valeurs sur trois ne font pas une estimation |
 * | 3 | Un triplet **désordonné** est refusé |
 * | 4 | Un montant **sans hypothèses** est refusé |
 * | 5 | Des pertes secondaires absentes **ne valent pas zéro** : le montant est un PLANCHER, et il se dit |
 * | 6 | Le montant est **INÉCRIVABLE** : la colonne est engendrée |
 * | 7 | Cloisonnement : la voisine ne voit rien, et ne peut rien rattacher |
 * | 8 | **Une seule** quantification par risque |
 * | 9 | La quantification **suit son risque** |
 * | 10 | Le garde-fou rend 0 anomalie — **et il MORD**, cinq fois |
 * | 11 | ⚠️ **LE GARDE DU LOT, ÉLARGI** : il voit ce que sa rédaction d'origine ne voyait pas |
 *
 * ── ⚠️ LE §11 EST LE CŒUR, ET IL NE PARLE PAS DE QUANTIFICATION ────────────
 *
 * `f_verifier_ebios_cadrage()` tient depuis la migration `046` la garantie centrale
 * du lot L25 : *aucun traitement automatique ne réinterprète la cotation F × G × M*.
 * Son sixième contrôle balayait les tables dont le **nom** commence par `ebios_`.
 * La table de cette action s'appelle `risque_quantification` : **elle lui
 * échappait**.
 *
 * Et le mode de défaillance est le pire de tous : un garde qui ne regarde pas rend
 * *zéro anomalie*, c'est-à-dire exactement ce qu'il rend quand tout va bien. Le §11
 * mesure donc les DEUX : que le garde élargi mord, **et** que sa rédaction d'origine
 * ne mordait pas. Sans la seconde moitié, on ne saurait pas si l'élargissement a
 * servi à quelque chose.
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

const RISQUE_A = 'RISK-FAIR-A';
const RISQUE_B = 'RISK-FAIR-B';
const RISQUE_PLANCHER = 'RISK-FAIR-PLANCHER';

/** Écrit sous le périmètre d'une filiale, et VALIDE. */
async function ecrire(filiale, travail) {
  return await base.avecPerimetre(applicatif, perimetre('semeur', filiale, [filiale]), travail, {
    annuler: false,
  });
}

/** Lit sous le périmètre d'une filiale, sans rien valider. */
async function lire(filiale, travail) {
  return await base.avecPerimetre(applicatif, perimetre('temoin', filiale, [filiale]), travail);
}

/** Écrit dans une transaction ANNULÉE — pour mesurer un refus sans laisser de trace. */
async function essayer(filiale, travail) {
  return await base.avecPerimetre(applicatif, perimetre('sonde', filiale, [filiale]), travail);
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);

  await ecrire(FILIALE_A, async (c) => {
    await c.query(
      `insert into risques (id, filiale_id, nom) values
           ($2, $1, 'Rançongiciel — quantifié'),
           ($3, $1, 'Fuite RGPD — pertes secondaires non estimées')`,
      [FILIALE_A, RISQUE_A, RISQUE_PLANCHER],
    );
  });
  await ecrire(FILIALE_B, async (c) => {
    await c.query(`insert into risques (id, filiale_id, nom) values ($2, $1, 'Risque voisin')`, [
      FILIALE_B,
      RISQUE_B,
    ]);
  });
});

after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  §1 — Une estimation complète, et le montant que la BASE en tire
 * ===================================================================== */

describe('§1 — une estimation complète rend le montant attendu', () => {
  test('un événement par an, mille de perte primaire, deux cents de secondaire → 1200', async () => {
    // ⚠️ Des valeurs rondes, et c'est volontaire : un témoin dont on ne peut pas
    // recalculer le résultat de tête ne dit pas si la formule est juste — il dit
    // seulement qu'elle n'a pas changé. La moyenne PERT d'un triplet constant est
    // cette constante, et le produit des deux moyennes se lit à l'œil.
    const ligne = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        `insert into risque_quantification
             (filiale_id, risque_id, devise,
              frequence_min, frequence_probable, frequence_max,
              perte_min, perte_probable, perte_max,
              secondaire_min, secondaire_probable, secondaire_max,
              hypotheses, evaluee_le)
         values ($1, $2, 'EUR', 1, 1, 1, 1000, 1000, 1000, 200, 200, 200,
                 'Sinistralité relevée sur les trois derniers exercices.', current_date)
         returning perte_annualisee::text as ale, secondaire_estimee`,
        [FILIALE_A, RISQUE_A],
      );
      return rows[0];
    });

    assert.equal(Number(ligne.ale), 1200);
    assert.equal(ligne.secondaire_estimee, true);
  });

  test('la pondération PERT n’est pas une moyenne arithmétique', async () => {
    // (1 + 4×2 + 9) / 6 = 3 — une moyenne arithmétique rendrait 4. C'est le seul cas
    // qui distingue les deux, et c'est celui qu'une rédaction fautive du dénominateur
    // laisse passer : un « / 3 » doublerait TOUTES les pertes annualisées du groupe,
    // sous une forme parfaitement plausible.
    const { rows } = await proprietaire.query(
      `select f_fair_moyenne_pert(1, 2, 9)::text as pert`,
    );
    assert.equal(Number(rows[0].pert), 3);
  });
});

/* =====================================================================
 *  §2 à §4 — CE QUE LA BASE REFUSE D'ÉCRIRE
 * ===================================================================== */

describe('§2 — un triplet incomplet est refusé', () => {
  test('deux valeurs sur trois ne font pas une estimation', async () => {
    // ⚠️ La tentation était de laisser passer et de rendre `null` : la dérivation le
    // fait déjà. Mais la LIGNE existerait alors, avec une estimation à moitié saisie
    // que l'écran présenterait comme une estimation — et personne ne saurait si le
    // montant manque parce que le calcul se tait ou parce que la saisie est en cours.
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, frequence_min, frequence_probable,
                hypotheses, evaluee_le)
           values ($1, $2, 1, 2, 'Deux valeurs sur trois.', current_date)`,
          [FILIALE_A, RISQUE_PLANCHER],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /triplet_frequence/);
  });
});

describe('§3 — un triplet désordonné est refusé', () => {
  test('un minimum au-dessus du maximum n’est pas une saisie discutable', async () => {
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, perte_min, perte_probable, perte_max,
                hypotheses, evaluee_le)
           values ($1, $2, 9000, 2000, 3000, 'Triplet à l’envers.', current_date)`,
          [FILIALE_A, RISQUE_PLANCHER],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /ordre_perte/);
  });
});

describe('§4 — un montant sans hypothèses est refusé', () => {
  test('la règle est dans le SCHÉMA, pas dans l’écran', async () => {
    // ⚠️ Pourquoi le schéma et pas l'écran : le moteur d'import du lot L7 écrit lui
    // aussi des lignes, et il ne passe par aucun écran. Une règle posée à un seul
    // étage est une règle qu'un chemin contourne — et il y a toujours un chemin de
    // plus (leçon de `f_pieces_suivent_leur_porteur`, CONVENTIONS.md §8.1).
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, perte_min, perte_probable, perte_max,
                hypotheses, evaluee_le)
           values ($1, $2, 1, 2, 3, '', current_date)`,
          [FILIALE_A, RISQUE_PLANCHER],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /hypotheses/);
  });

  test('et « not null » ferme l’autre moitié', async () => {
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification (filiale_id, risque_id, evaluee_le)
           values ($1, $2, current_date)`,
          [FILIALE_A, RISQUE_PLANCHER],
        );
      }),
    );
    assert.equal(erreur.code, '23502');
  });
});

/* =====================================================================
 *  §5 — LE PLANCHER : une perte secondaire absente ne vaut pas zéro
 * ===================================================================== */

describe('§5 — pertes secondaires absentes : un PLANCHER, et il se dit', () => {
  test('le montant ne porte que la perte primaire, et la marque le dit', async () => {
    const ligne = await ecrire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        `insert into risque_quantification
             (filiale_id, risque_id,
              frequence_min, frequence_probable, frequence_max,
              perte_min, perte_probable, perte_max, hypotheses, evaluee_le)
         values ($1, $2, 2, 2, 2, 500, 500, 500,
                 'Amende de l’article 83 NON estimée : avis juridique manquant.', current_date)
         returning perte_annualisee::text as ale, secondaire_estimee`,
        [FILIALE_A, RISQUE_PLANCHER],
      );
      return rows[0];
    });

    assert.equal(Number(ligne.ale), 1000, '2 événements par an × 500 de perte primaire');
    // ⚠️ **C'est CETTE assertion qui tient le critère.** Sans la marque, 1000 se lit
    // comme un total ; avec elle, l'écran écrit « ≥ 1 000 € ». Un plancher présenté
    // comme un total est une estimation par défaut DANS LE SENS RASSURANT — celle que
    // le critère 25.4 interdit nommément, et la plus dangereuse des deux.
    assert.equal(
      ligne.secondaire_estimee,
      false,
      'Sans cette marque, un plancher se présente comme un total.',
    );
  });

  test('et un triplet secondaire à moitié saisi reste refusé', async () => {
    // Le cas le plus retors des trois : l'absence de pertes secondaires est LICITE,
    // donc rien ne distinguerait « non estimée » de « saisie à moitié » si la
    // contrainte tombait.
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, secondaire_min, secondaire_probable,
                hypotheses, evaluee_le)
           values ($1, $2, 10, 20, 'Secondaire à moitié.', current_date)`,
          [FILIALE_A, RISQUE_B],
        );
      }),
    );
    assert.equal(erreur.code, '23514');
    assert.match(erreur.constraint ?? '', /triplet_secondaire/);
  });
});

/* =====================================================================
 *  §6 — LE MONTANT EST INÉCRIVABLE
 * ===================================================================== */

describe('§6 — le montant ne se pose pas à la main', () => {
  test('la colonne est ENGENDRÉE : PostgreSQL refuse qu’on lui donne une valeur', async () => {
    // ⚠️ C'est ce qui rend le montant impossible à forger. Si `perte_annualisee` était
    // une colonne ordinaire, la couche d'écriture la remplirait avec ce que le
    // navigateur envoie — et le nombre affiché cesserait d'être celui que les
    // hypothèses produisent, sans que rien ne le dise. Le garde-fou le mesure aussi,
    // mais un refus de la BASE est la seule preuve qui ne se contourne pas.
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, perte_annualisee, hypotheses, evaluee_le)
           values ($1, $2, 999999, 'Montant posé à la main.', current_date)`,
          [FILIALE_A, RISQUE_B],
        );
      }),
    );
    assert.equal(erreur.code, '428C9');
  });
});

/* =====================================================================
 *  §7 — CLOISONNEMENT
 * ===================================================================== */

describe('§7 — la voisine ne voit rien, et ne rattache rien', () => {
  test('la quantification de A est invisible de B', async () => {
    // ⚠️ **On compte CE QUI VIENT DE A, pas le total.** Le semis commun quantifie un
    // risque dans CHAQUE filiale : exiger zéro ligne ici mesurerait l'absence de semis,
    // et l'essai deviendrait creux le jour où il en gagne un — ou, pire, rougirait pour
    // une raison étrangère à ce qu'il annonce.
    const vu = await lire(FILIALE_B, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from risque_quantification where risque_id = any ($1)`,
        [[RISQUE_A, RISQUE_PLANCHER]],
      );
      return rows[0].n;
    });
    assert.equal(vu, 0, 'le coût d’un incident chez la voisine n’a pas à être lisible ici');
  });

  test('B ne peut pas quantifier un risque de A — même en connaissant son identifiant', async () => {
    // ⚠️ La clé est COMPOSITE : une clé simple serait satisfaite par une ligne
    // INVISIBLE de la filiale voisine (`CONVENTIONS.md` §17.1), et la quantification
    // d'un incident se retrouverait accrochée au risque d'une autre filiale — un
    // rattachement qu'aucun écran ne montrerait jamais.
    const erreur = await erreurAttendue(
      essayer(FILIALE_B, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, hypotheses, evaluee_le)
           values ($1, $2, 'Rattachement croisé.', current_date)`,
          [FILIALE_B, RISQUE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23503');
  });
});

/* =====================================================================
 *  §8 et §9 — UNICITÉ ET CASCADE
 * ===================================================================== */

describe('§8 — une seule quantification par risque', () => {
  test('deux seraient SOMMÉES par la consolidation, et compteraient le sinistre deux fois', async () => {
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risque_quantification
               (filiale_id, risque_id, hypotheses, evaluee_le)
           values ($1, $2, 'La seconde.', current_date)`,
          [FILIALE_A, RISQUE_A],
        );
      }),
    );
    assert.equal(erreur.code, '23505');
  });
});

describe('§9 — la quantification suit son risque', () => {
  test('supprimer le risque emporte sa quantification', async () => {
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom) values ('RISK-FAIR-TMP', $1, 'Éphémère')`,
        [FILIALE_A],
      );
      await c.query(
        `insert into risque_quantification (filiale_id, risque_id, hypotheses, evaluee_le)
         values ($1, 'RISK-FAIR-TMP', 'À emporter.', current_date)`,
        [FILIALE_A],
      );
    });

    const reste = await ecrire(FILIALE_A, async (c) => {
      await c.query(`delete from risques where id = 'RISK-FAIR-TMP'`);
      const { rows } = await c.query(
        `select count(*)::int as n from risque_quantification where risque_id = 'RISK-FAIR-TMP'`,
      );
      return rows[0].n;
    });
    assert.equal(reste, 0, 'une quantification orpheline serait invisible et hors de portée de la purge');
  });
});

/* =====================================================================
 *  §10 — LE GARDE-FOU REND 0 ANOMALIE, ET IL MORD
 * ===================================================================== */

describe('§10 — le garde-fou de la quantification', () => {
  test('sur le schéma livré : rien à dire', async () => {
    const { rows } = await proprietaire.query('select * from f_verifier_quantification_fair()');
    assert.deepEqual(rows, [], 'le schéma livré ne doit rien faire dire au garde-fou');
  });

  test('MUTATION 1 — la pondération PERT changée le fait rougir', async () => {
    await proprietaire.query('begin');
    try {
      await proprietaire.query(`
        create or replace function f_fair_moyenne_pert(p_min numeric, p_probable numeric, p_max numeric)
        returns numeric language sql immutable parallel safe
        set search_path = pg_catalog, public, pg_temp as
        $m$ select case when num_nulls(p_min, p_probable, p_max) > 0 then null
                        else (p_min + 4 * p_probable + p_max) / 3 end; $m$`);
      const { rows } = await proprietaire.query('select * from f_verifier_quantification_fair()');
      assert.ok(rows.length > 0, 'un « / 3 » au lieu du « / 6 » doublerait toutes les pertes du groupe');
      assert.ok(rows.some((r) => r.anomalie === 'moyenne_pert_fausse'));
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 2 — un triplet incomplet qui rendrait un nombre le fait rougir', async () => {
    // ⚠️ La mutation la plus proche du critère : la fonction rend la moyenne de ce
    // qu'elle a, au lieu de se taire. C'est « un chiffre qui a l'air mesuré ».
    await proprietaire.query('begin');
    try {
      await proprietaire.query(`
        create or replace function f_fair_moyenne_pert(p_min numeric, p_probable numeric, p_max numeric)
        returns numeric language sql immutable parallel safe
        set search_path = pg_catalog, public, pg_temp as
        $m$ select case when num_nulls(p_min, p_probable, p_max) = 3 then null
                        else (coalesce(p_min, 0) + 4 * coalesce(p_probable, 0)
                              + coalesce(p_max, 0)) / 6 end; $m$`);
      const { rows } = await proprietaire.query('select * from f_verifier_quantification_fair()');
      assert.ok(rows.some((r) => r.anomalie === 'moyenne_pert_fausse'));
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 3 — une contrainte vidée par « or true » le fait rougir', async () => {
    // ⚠️ Constat **Q-312** : `check (… or true)` porte le bon nom, cite les bons
    // littéraux, n'interdit rien — et cinq gardes passaient au vert dessus. Le garde
    // ÉPROUVE donc le prédicat sur une ligne témoin, au lieu d'en relire le texte.
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        'alter table risque_quantification drop constraint ck_risque_quantification_hypotheses');
      await proprietaire.query(
        `alter table risque_quantification add constraint ck_risque_quantification_hypotheses
             check (hypotheses <> '' or true)`);
      const { rows } = await proprietaire.query('select * from f_verifier_quantification_fair()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'contrainte_videe_de_sa_substance');
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 4 — une contrainte qui REFUSE TOUT le fait rougir aussi', async () => {
    // ⚠️ Le second sens, et sans lui le contrôle précédent se satisferait d'une
    // barrière devenue `check (false)` — qui refuse le témoin, donc « mord », pendant
    // que le produit devient inutilisable. *Une morsure sans non-bruit ne mesure que
    // la moitié d'une barrière.*
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        'alter table risque_quantification drop constraint ck_risque_quantification_devise');
      await proprietaire.query(
        // ⚠️ `not valid` : la table porte déjà des lignes en euros, et une contrainte
        // validée les refuserait AVANT que le garde-fou ait eu son mot à dire. Elle
        // s'applique tout de même aux écritures futures — c'est bien une barrière qui
        // refuse tout, et c'est ce que le garde doit voir.
        `alter table risque_quantification add constraint ck_risque_quantification_devise
             check (devise = 'XXX') not valid`);
      const { rows } = await proprietaire.query('select * from f_verifier_quantification_fair()');
      assert.ok(rows.some((r) => r.anomalie === 'contrainte_refuse_une_ligne_valide'));
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('MUTATION 5 — la colonne dérivée redevenue ordinaire le fait rougir', async () => {
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table risque_quantification drop column perte_annualisee');
      await proprietaire.query('alter table risque_quantification add column perte_annualisee numeric');
      const { rows } = await proprietaire.query('select * from f_verifier_quantification_fair()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'colonne_derivee_non_engendree');
    } finally {
      await proprietaire.query('rollback');
    }
  });
});

/* =====================================================================
 *  §11 — LE GARDE DU LOT, ÉLARGI
 * ===================================================================== */

describe('§11 — le garde du lot voit désormais ce qu’il ne voyait pas', () => {
  test('sur le schéma livré : rien à dire', async () => {
    const { rows } = await proprietaire.query('select * from f_verifier_ebios_cadrage()');
    assert.deepEqual(rows, []);
  });

  test('un déclencheur d’une table NON-ebios qui écrit dans « risques » est vu', async () => {
    await proprietaire.query('begin');
    try {
      await proprietaire.query(`
        create or replace function f_mutant_fair() returns trigger
        language plpgsql set search_path = pg_catalog, public, pg_temp as
        $m$ begin update risques set score_brut = 1 where id = new.risque_id; return new; end; $m$`);
      await proprietaire.query(`
        create trigger trg_mutant_fair after insert on risque_quantification
            for each row execute function f_mutant_fair()`);

      const { rows } = await proprietaire.query('select * from f_verifier_ebios_cadrage()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'ebios_ecrit_dans_risques');
      assert.equal(rows[0].objet, 'risque_quantification');
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('⚠️ et la rédaction D’ORIGINE, elle, ne voyait RIEN — mesuré, pas supposé', async () => {
    // ⚠️ **C'est la moitié de l'essai qui justifie l'élargissement.** Sans elle, on
    // saurait que le garde actuel mord, sans savoir si l'élargissement a servi à
    // quelque chose. On repose donc le balayage `like 'ebios\\_%'` de la migration
    // `046`, on remet la même mutation, et l'on exige **zéro anomalie** — la preuve
    // que la garantie centrale du lot avait cessé de s'appliquer en silence.
    //
    // C'est la forme la plus dangereuse de défaillance d'un garde-fou : *zéro
    // anomalie* est aussi ce qu'il rend quand tout va bien.
    await proprietaire.query('begin');
    try {
      await proprietaire.query(`
        create or replace function f_verifier_ebios_cadrage()
        returns table (objet text, anomalie text, detail text)
        language plpgsql stable set search_path = pg_catalog, public, pg_temp as
        $m$
        declare v_table text;
        begin
          for v_table in
            select c.relname::text from pg_class c
              join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
             where c.relname like 'ebios\\_%'
               and exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                            where t.tgrelid = c.oid and not t.tgisinternal
                              and p.prosrc ~* '\\m(update|insert\\s+into|delete\\s+from)\\s+risques\\M')
          loop
            objet := v_table; anomalie := 'ebios_ecrit_dans_risques'; detail := '';
            return next;
          end loop;
          return;
        end; $m$`);
      await proprietaire.query(`
        create or replace function f_mutant_fair() returns trigger
        language plpgsql set search_path = pg_catalog, public, pg_temp as
        $m$ begin update risques set score_brut = 1 where id = new.risque_id; return new; end; $m$`);
      await proprietaire.query(`
        create trigger trg_mutant_fair after insert on risque_quantification
            for each row execute function f_mutant_fair()`);

      const { rows } = await proprietaire.query('select * from f_verifier_ebios_cadrage()');
      assert.deepEqual(
        rows,
        [],
        'Le balayage par NOM ne voyait rien : c’est la mesure qui justifie son élargissement.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });
});
