/**
 * echelles.test.mjs — **LES ÉCHELLES DE COTATION** (lot L25, action 25.3)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le critère d'acceptation tient en une phrase, et elle dit le défaut avant le
 * remède : *« une échelle modifiée après coup rend les cotations existantes
 * incomparables : le changement est versionné et daté, et les cotations portent
 * l'échelle qui les a produites »*.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Le socle du Groupe est semé, gradué, et **en vigueur** |
 * | 2 | Une valeur **hors graduation** est refusée par la BASE |
 * | 3 | Une échelle **d'un autre sujet** est refusée — une gravité ne se cote pas sur une vraisemblance |
 * | 4 | Une cotation **sans échelle** passe : c'est « non tracée », pas une erreur |
 * | 5 | Une échelle **publiée** ne se modifie plus, et l'un de ses niveaux ne se **retire** pas |
 * | 6 | Sa **graduation** ne se modifie pas davantage |
 * | 7 | Deux échelles **en vigueur** pour le même sujet : refusé |
 * | 8 | L'échelle **locale d'une voisine** ne cote rien ici |
 * | 9 | Un **niveau** ne change pas de portée sous son échelle — ce qu'une clé composite ne peut pas dire |
 * | 10 | `f_echelle_en_vigueur()` : la locale prime, le socle sinon |
 * | 11 | **LE MARQUAGE** : le dépôt estampille ce qui part, et **n'écrase pas** ce que l'appelant a dit |
 * | 12 | Le garde-fou rend 0 anomalie — **et il MORD** |
 *
 * ── ⚠️ LE §11 EST LE CŒUR, ET C'EST AUSSI CELUI QU'ON POUVAIT MANQUER ──────
 *
 * « L'appelant n'a rien dit » et « l'appelant a dit : pas d'échelle » sont deux
 * faits différents, et un déclencheur ne les distingue pas — il voit deux fois une
 * colonne nulle. S'il remplissait, la reprise d'un export d'avant cette livraison
 * repartirait **estampillée de l'échelle du jour** : le produit affirmerait qu'une
 * cotation de 2024 a été produite sur la graduation publiée hier, dans l'outil qui
 * sert de preuve en audit. C'est le motif du constat **Q-192**.
 *
 * Le §11 mesure donc les DEUX branches. Ne mesurer que la première aurait laissé
 * passer exactement le défaut que l'action existe pour fermer.
 */

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';

const RACINE = join(process.cwd());

let base;
let applicatif;
let proprietaire;

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

/** Écrit dans une transaction ANNULÉE — pour mesurer un refus sans laisser de trace. */
async function essayer(filiale, travail) {
  return await base.avecPerimetre(applicatif, perimetre('sonde', filiale, [filiale]), travail);
}

/** L'identifiant de l'échelle du Groupe pour un sujet. */
async function echelleDuGroupe(sujet) {
  return await lire(FILIALE_A, async (c) => {
    const { rows } = await c.query(
      `select id from echelles where filiale_id is null and sujet = $1 and statut = 'en_vigueur'`,
      [sujet],
    );
    return rows[0]?.id ?? null;
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

/* =====================================================================
 *  §1 — Le socle du Groupe
 * ===================================================================== */

describe('§1 — le socle du Groupe est semé, gradué et en vigueur', () => {
  test('quatre sujets, chacun en vigueur, chacun avec ses niveaux', async () => {
    const etat = await lire(FILIALE_A, async (c) => {
      const { rows } = await c.query(`
        select e.sujet, e.revision, e.statut, e.en_vigueur_le is not null as datee,
               count(n.id)::int as niveaux
          from echelles e left join echelle_niveaux n on n.echelle_id = e.id
         where e.filiale_id is null
         group by e.sujet, e.revision, e.statut, e.en_vigueur_le
         order by e.sujet`);
      return rows;
    });

    assert.equal(etat.length, 4, 'quatre sujets de cotation, et pas un de plus');
    assert.deepEqual(
      etat.map((r) => r.sujet),
      ['criteres_partie_prenante', 'criteres_source', 'gravite', 'vraisemblance'],
    );
    for (const ligne of etat) {
      assert.equal(ligne.statut, 'en_vigueur');
      assert.equal(ligne.revision, 1);
      // ⚠️ La moitié « datée » du critère 25.3. Sans date, on saurait qu'une
      // graduation a changé, jamais quand — donc jamais quelles cotations sont d'avant.
      assert.equal(ligne.datee, true, `l'échelle « ${ligne.sujet} » est publiée sans date`);
      assert.equal(ligne.niveaux, 4, `l'échelle « ${ligne.sujet} » n'a pas ses quatre niveaux`);
    }
  });

  test('le socle du Groupe est lisible de TOUTES les filiales', async () => {
    const vuDeB = await lire(FILIALE_B, async (c) => {
      const { rows } = await c.query(
        `select count(*)::int as n from echelles where filiale_id is null`);
      return rows[0].n;
    });
    assert.equal(vuDeB, 4, 'une filiale qui ne décide rien doit pouvoir coter sur le socle');
  });
});

/* =====================================================================
 *  §2 à §4 — Ce qu'une cotation peut nommer
 * ===================================================================== */

describe('§2-4 — une cotation appartient à l’échelle qu’elle nomme', () => {
  test('§2 — une valeur hors graduation est refusée, et le refus la nomme', async () => {
    const gravite = await echelleDuGroupe('gravite');
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risques (id, filiale_id, nom, g_gravite, echelle_g_id)
               values ('RISK-HORS', $1, 'sonde', 7, $2)`,
          [FILIALE_A, gravite],
        );
      }),
    );
    assert.match(String(erreur.message), /n'est pas un niveau de l'échelle/);
    assert.match(String(erreur.message), /g_gravite/);
  });

  test('§3 — une gravité cotée sur une échelle de vraisemblance est refusée', async () => {
    const vraisemblance = await echelleDuGroupe('vraisemblance');
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risques (id, filiale_id, nom, g_gravite, echelle_g_id)
               values ('RISK-SUJET', $1, 'sonde', 3, $2)`,
          [FILIALE_A, vraisemblance],
        );
      }),
    );
    // ⚠️ Le défaut que ce refus ferme ne produit AUCUNE valeur hors borne : 3 est un
    // niveau valide des deux échelles. Seul le sujet les distingue.
    assert.match(String(erreur.message), /gradue « vraisemblance »/);
  });

  test('§4 — une cotation SANS échelle passe : « non tracée » n’est pas une erreur', async () => {
    // C'est ce qui rend la reprise d'un export d'avant la v24 possible. Le refuser
    // interdirait de restaurer la sauvegarde qui sert à restaurer.
    await ecrire(FILIALE_A, async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom, f_frequence, g_gravite)
             values ('RISK-NONTRACE', $1, 'historique', 2, 9)`,
        [FILIALE_A],
      );
    });
    const ligne = await lire(FILIALE_A, async (c) => {
      const { rows } = await c.query(
        `select echelle_f_id, echelle_g_id, g_gravite from risques where id = 'RISK-NONTRACE'`);
      return rows[0];
    });
    assert.equal(ligne.echelle_f_id, null);
    assert.equal(ligne.echelle_g_id, null);
    assert.equal(Number(ligne.g_gravite), 9, 'la valeur hors graduation est CONSERVÉE telle quelle');
  });
});

/* =====================================================================
 *  §5 à §7 — Une échelle publiée est figée
 * ===================================================================== */

describe('§5-7 — une échelle publiée se remplace, elle ne se retouche pas', () => {
  test('§5 — son nom ne se modifie plus', async () => {
    const erreurMaj = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        { ...perimetre('sonde', FILIALE_A, [FILIALE_A]), administrationGroupe: true },
        async (c) => {
          await c.query(
            `update echelles set nom = 'autre chose' where filiale_id is null and sujet = 'gravite'`);
        },
      ),
    );
    assert.match(String(erreurMaj.message), /est publiée : « nom » ne se modifie plus/);
  });

  test('§5 bis — RETIRER un niveau est refusé, et le refus vient au COMMIT', async () => {
    // ⚠️ **Différé à dessein.** Un `before delete` ne peut pas distinguer le retrait d'un
    // niveau de la disparition de l'échelle entière : il refusait donc la sortie d'une
    // filiale et la reprise « remplacer ». Évalué au commit, le même prédicat dit le
    // contraire — l'échelle n'est plus là, il n'y a plus de graduation à protéger.
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        { ...perimetre('sonde', FILIALE_A, [FILIALE_A]), administrationGroupe: true },
        async (c) => {
          await c.query(
            `delete from echelle_niveaux n using echelles e
              where n.echelle_id = e.id and e.filiale_id is null and e.sujet = 'gravite'
                and n.valeur = 4`);
        },
        { annuler: false },
      ),
    );
    assert.match(String(erreur.message), /ne se retire pas/);
  });

  test('§5 ter — ET LA REPRISE PASSE : échelle publiée ET ses niveaux, en une transaction', async () => {
    // ⚠️ **C'est le défaut que le banc a trouvé, et il était BLOQUANT** : la première
    // rédaction du §6 de la migration `049` interdisait d'ajouter un niveau à une échelle
    // publiée, sans exception. `GET /api/export` puis `POST /api/reprise « remplacer »`
    // rendait alors **409** — le produit produisait une sauvegarde qu'il refusait de
    // relire. Classe des trois conflits de la migration `041`, et des constats Q-194 et
    // Q-284 : *restaurer une sauvegarde gagne*.
    //
    // ⚠️ Et l'exemption est jouée DANS UN POINT DE REPRISE, parce que la couche
    // d'écriture en pose un à chaque insertion : la première rédaction du discriminant
    // comparait `xmin` à `pg_current_xact_id()`, qui rend la transaction de PREMIER
    // NIVEAU — elle n'aurait joué sur aucun chemin réel.
    // ⚠️ La transaction est ANNULÉE à la fin : ce qu'on mesure est que l'écriture
    // ABOUTIT, pas qu'elle subsiste — et une échelle locale en vigueur de plus
    // changerait la graduation par défaut sous les essais suivants.
    const niveaux = await essayer(FILIALE_A, async (c) => {
      await c.query('savepoint pr_essai');
      await c.query(
        `insert into echelles (id, filiale_id, sujet, nom, revision, statut, en_vigueur_le)
             values ('ECHL-REPRISE', $1, 'gravite', 'venue du fichier', 9, 'en_vigueur',
                     current_date)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into echelle_niveaux (filiale_id, echelle_id, valeur, libelle)
             values ($1, 'ECHL-REPRISE', 1, 'Faible'), ($1, 'ECHL-REPRISE', 2, 'Forte')`,
        [FILIALE_A],
      );
      await c.query('release savepoint pr_essai');
      const { rows } = await c.query(
        `select count(*)::int as n from echelle_niveaux where echelle_id = 'ECHL-REPRISE'`);
      return rows[0].n;
    });
    assert.equal(niveaux, 2);
  });

  test('§6 — sa graduation ne se modifie pas davantage', async () => {
    const gravite = await echelleDuGroupe('gravite');
    const erreur = await erreurAttendue(
      base.avecPerimetre(
        applicatif,
        { ...perimetre('sonde', FILIALE_A, [FILIALE_A]), administrationGroupe: true },
        async (c) => {
          await c.query(
            `insert into echelle_niveaux (filiale_id, echelle_id, valeur, libelle)
                 values (null, $1, 5, 'Catastrophique')`,
            [gravite],
          );
        },
      ),
    );
    // Figer l'échelle sans figer ses niveaux n'aurait rien figé : c'est la graduation
    // qui donne son sens à une cotation, pas le nom de l'échelle.
    assert.match(String(erreur.message), /sont figés : elle est publiée/);
  });

  test('§7 — deux révisions en vigueur pour le même sujet : refusé', async () => {
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into echelles (id, filiale_id, sujet, nom, revision, statut, en_vigueur_le)
               values ('ECHL-X1', $1, 'gravite', 'locale 2', 2, 'en_vigueur', current_date),
                      ('ECHL-X2', $1, 'gravite', 'locale 3', 3, 'en_vigueur', current_date)`,
          [FILIALE_A],
        );
      }),
    );
    // Sans cette unicité, « l'échelle en vigueur » cesse d'être une expression définie.
    assert.match(String(erreur.message), /uq_echelles_en_vigueur/);
  });
});

/* =====================================================================
 *  §8 à §10 — Portée et choix de l'échelle
 * ===================================================================== */

describe('§8-10 — la portée d’une échelle, et celle de ses niveaux', () => {
  before(async () => {
    // Une échelle LOCALE à la filiale B, publiée dans les règles.
    await ecrire(FILIALE_B, async (c) => {
      await c.query(
        `insert into echelles (id, filiale_id, sujet, nom, revision, statut)
             values ('ECHL-VOISINE', $1, 'gravite', 'Gravité — filiale voisine', 2, 'brouillon')`,
        [FILIALE_B],
      );
      await c.query(
        `insert into echelle_niveaux (filiale_id, echelle_id, valeur, libelle)
             values ($1, 'ECHL-VOISINE', 1, 'Faible'), ($1, 'ECHL-VOISINE', 2, 'Forte')`,
        [FILIALE_B],
      );
      await c.query(
        `update echelles set statut = 'en_vigueur', en_vigueur_le = current_date
           where id = 'ECHL-VOISINE'`);
    });
  });

  test('§8 — l’échelle locale d’une voisine ne cote rien ici', async () => {
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into risques (id, filiale_id, nom, g_gravite, echelle_g_id)
               values ('RISK-VOISINE', $1, 'sonde', 2, 'ECHL-VOISINE')`,
          [FILIALE_A],
        );
      }),
    );
    // ⚠️ La RLS empêche déjà de la LIRE : le refus dit donc « introuvable dans le
    // périmètre », et c'est la bonne réponse — elle n'apprend rien sur son existence.
    assert.match(String(erreur.message), /introuvable dans le périmètre|appartient à la filiale/);
  });

  test('§9 — un niveau ne change pas de portée sous son échelle', async () => {
    // ⚠️ Aucune clé étrangère composite ne rattraperait cela : MATCH SIMPLE — le défaut
    // de PostgreSQL — satisfait toute clé dont une colonne est nulle, et `filiale_id`
    // l'est pour tout le socle du Groupe. C'est un DÉCLENCHEUR qui le tient.
    const erreur = await erreurAttendue(
      essayer(FILIALE_A, async (c) => {
        await c.query(
          `insert into echelles (id, filiale_id, sujet, nom, revision, statut)
               values ('ECHL-BR', null, 'gravite', 'brouillon du Groupe', 9, 'brouillon')`);
        await c.query(
          `insert into echelle_niveaux (filiale_id, echelle_id, valeur, libelle)
               values ($1, 'ECHL-BR', 1, 'un')`,
          [FILIALE_A],
        );
      }),
    );
    assert.match(String(erreur.message), /doit être celle de son échelle|row-level security/);
  });

  test('§10 — f_echelle_en_vigueur : la locale prime, le socle sinon', async () => {
    const socle = await echelleDuGroupe('gravite');

    const pourB = await lire(FILIALE_B, async (c) => {
      const { rows } = await c.query(`select f_echelle_en_vigueur('gravite', $1) as id`, [FILIALE_B]);
      return rows[0].id;
    });
    assert.equal(pourB, 'ECHL-VOISINE', 'la filiale qui a publié la sienne cote dessus');

    const pourA = await lire(FILIALE_A, async (c) => {
      const { rows } = await c.query(`select f_echelle_en_vigueur('gravite', $1) as id`, [FILIALE_A]);
      return rows[0].id;
    });
    assert.equal(pourA, socle, 'la filiale qui ne décide rien cote sur le socle du Groupe');
  });
});

/* =====================================================================
 *  §12 — Le garde-fou
 * ===================================================================== */

describe('§12 — le garde-fou rend 0 anomalie, et il MORD', () => {
  test('sur le schéma livré : rien à dire', async () => {
    const { rows } = await proprietaire.query('select * from f_verifier_echelles()');
    assert.deepEqual(rows, [], 'le schéma livré ne doit rien faire dire au garde-fou');
  });

  test('une colonne porteuse non déclarée le fait rougir', async () => {
    // ⚠️ Le balayage part du CATALOGUE, jamais de la déclaration (`CONVENTIONS.md`
    // §39.3) : une colonne « echelle_%_id » ajoutée sans être déclarée ne serait gardée
    // par rien, et accepterait une échelle de n'importe quel sujet sous 0 anomalie.
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table actifs add column echelle_bidon_id id_metier');
      const { rows } = await proprietaire.query('select * from f_verifier_echelles()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'porteur_non_declare');
      assert.equal(rows[0].objet, 'actifs.echelle_bidon_id');
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('un déclencheur dont les ÉVÉNEMENTS ont changé le fait rougir', async () => {
    // ⚠️ Constat **Q-281** : deux gardes vérifiaient qu'un déclencheur existe et est armé
    // pendant que ses événements avaient été déplacés — 0 anomalie, deux barrières mortes.
    await proprietaire.query('begin');
    try {
      await proprietaire.query('drop trigger trg_risques_echelle_g_id on risques');
      await proprietaire.query(
        `create trigger trg_risques_echelle_g_id before insert on risques
             for each row execute function f_cotation_dans_son_echelle('echelle_g_id')`);
      await proprietaire.query('alter table risques enable always trigger trg_risques_echelle_g_id');
      const { rows } = await proprietaire.query('select * from f_verifier_echelles()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'declencheur_cotation_mal_arme');
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('une clé étrangère passée en « set null » le fait rougir', async () => {
    // ⚠️ « Elle existe » ne suffit pas : un `set null` laisserait la cotation en place en
    // effaçant SILENCIEUSEMENT ce qui la rend interprétable. C'est le pire des trois.
    await proprietaire.query('begin');
    try {
      await proprietaire.query(`select set_config('grc.filiales', '', true)`);
      await proprietaire.query(`select set_config('grc.utilisateur', 'sonde', true)`);
      await proprietaire.query('alter table risques drop constraint fk_risques_echelle_g');
      await proprietaire.query(
        `alter table risques add constraint fk_risques_echelle_g
             foreign key (echelle_g_id) references echelles (id) on delete set null`);
      const { rows } = await proprietaire.query('select * from f_verifier_echelles()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'cle_echelle_sans_restrict');
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('une contrainte qui n’interdit plus rien le fait rougir', async () => {
    // ⚠️ Le texte d'une contrainte peut porter son nom, ses quatre littéraux, et ne plus
    // rien refuser : « … or true » suffit (constats Q-291, Q-312). Seule l'ÉVALUATION du
    // prédicat sur une ligne témoin le voit.
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table echelles drop constraint ck_echelles_sujet');
      await proprietaire.query(
        `alter table echelles add constraint ck_echelles_sujet check (sujet in
             ('vraisemblance', 'gravite', 'criteres_source', 'criteres_partie_prenante') or true)`);
      const { rows } = await proprietaire.query('select * from f_verifier_echelles()');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].anomalie, 'contrainte_ne_refuse_plus');
    } finally {
      await proprietaire.query('rollback');
    }
  });
});
