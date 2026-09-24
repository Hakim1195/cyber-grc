/**
 * gardes-eprouves.test.mjs — un garde-fou ÉPROUVE, il ne reconnaît pas un mot.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le 8ᵉ passage de la porte S8 (11/09/2026) a rendu un chiffre : **sur 41 mutations,
 * 14 ne mordent pas — et treize visent des gardes posés dans les trois jours
 * précédents.** Cinq constats — **Q-291, Q-292, Q-297, Q-299, Q-300** — sont la même
 * faute prise sous cinq angles :
 *
 *     un garde-fou qui RECONNAÎT UN MOT au lieu de MESURER UN SENS,
 *     ou une liste écrite à la main dont l'incomplétude RÉUSSIT EN SILENCE.
 *
 * La mesure qui condamne, jouée par l'auditeur :
 *
 *     check (confidentialite in ('public','interne','confidentiel','restreint') or true)
 *       → f_verifier_classification_documents() : 0 anomalie
 *       → f_verifier_schema()                   : 0 anomalie
 *       → insert … confidentialite = 'diffusion libre'  : ACCEPTÉ
 *
 * C'est **Q-281 rouvert par les gardes écrits pour le fermer**.
 *
 * ⚠️ **CE FICHIER EST LE BANC DE LA MIGRATION 028, ET C'EST TOUT SON OBJET.** Un
 * correctif fermé *dans le code* et non *dans le banc* est ce que le constat **Q-210**
 * a coûté : deux correctifs de « fuite de données » justes dans le code, cassés un par
 * un par l'auditeur, **banc resté 30/30 vert**. Chaque contrôle ci-dessous CASSE la
 * propriété et exige que le garde la nomme — jamais il ne se contente de constater
 * qu'elle tient.
 *
 * Toutes les mutations vivent dans une **transaction annulée** : rien ne survit à ce
 * fichier, et la base d'essai est de toute façon détruite par `fermer()`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { erreurAttendue, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});

after(async () => {
  await base?.fermer();
});

/**
 * Joue une mutation dans une transaction ANNULÉE et rend les anomalies que
 * `f_verifier_schema()` — le point d'appel unique — a nommées pendant qu'elle tenait.
 *
 * ⚠️ On interroge `f_verifier_schema()`, jamais le garde directement : ce qu'on veut
 * savoir n'est pas « la fonction sait-elle répondre », c'est « le DÉPLOIEMENT
 * échouerait-il ». C'est le contrôle S16, et c'est la différence entre un garde-fou et
 * un commentaire.
 */
async function anomaliesPendant(sql) {
  await proprietaire.query('begin');
  try {
    for (const instruction of sql) {
      await proprietaire.query(instruction);
    }
    const { rows } = await proprietaire.query(
      'select anomalie, objet, detail from f_verifier_schema() order by 1, 2',
    );
    return rows;
  } finally {
    await proprietaire.query('rollback');
  }
}

const nomme = (anomalies, quoi) => anomalies.some((a) => a.anomalie === quoi);
const resume = (anomalies) =>
  anomalies.length === 0
    ? '(aucune anomalie)'
    : anomalies.map((a) => `${a.anomalie} / ${a.objet}`).join(' · ');

describe('Un garde-fou ÉPROUVE la contrainte au lieu de lire son texte — Q-292', () => {
  test('le témoin : le schéma intact ne rend AUCUNE anomalie', async () => {
    // Sans cette moitié, tous les contrôles ci-dessous passeraient au vert sur un
    // schéma déjà en défaut, et ne mesureraient rien.
    const anomalies = await anomaliesPendant([]);
    assert.equal(
      anomalies.length,
      0,
      `Schéma d’essai déjà en défaut : ${resume(anomalies)}`,
    );
  });

  test('une contrainte VIDÉE qui garde son nom et ses quatre mots est vue', async () => {
    /* C'est la mutation exacte de l'auditeur, et c'est celle qu'aucun garde ne
       voyait : le nom est le bon, les quatre littéraux sont cités, `position()` est
       satisfaite — et « diffusion libre » entre. */
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint ck_documents_confidentialite',
      `alter table documents add constraint ck_documents_confidentialite
         check (confidentialite in ('public','interne','confidentiel','restreint') or true)`,
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_laisse_passer_l_interdit'),
      'Une contrainte de classification vidée de sa substance — même nom, mêmes littéraux, ' +
        '« or true » — doit être NOMMÉE. Un garde qui compare du texte est contournable par ' +
        `qui le lit, et c’est le seul cas qui compte pour une barrière. Rendu : ${resume(anomalies)}`,
    );
  });

  test('la même contrainte vidée laisse effectivement entrer « diffusion libre »', async () => {
    /* LA MATIÈRE : sans elle, le contrôle précédent prouverait qu'une anomalie est
       émise, jamais qu'elle correspond à un vrai trou. On mesure donc le trou. */
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        'alter table documents drop constraint ck_documents_confidentialite',
      );
      await proprietaire.query(
        `alter table documents add constraint ck_documents_confidentialite
           check (confidentialite in ('public','interne','confidentiel','restreint') or true)`,
      );
      const { rows } = await proprietaire.query(
        `select (select f_contrainte_accepte('documents','ck_documents_confidentialite',
                   jsonb_build_object('confidentialite','diffusion libre'))) as accepte`,
      );
      assert.equal(
        rows[0].accepte,
        true,
        'La contrainte vidée devrait accepter « diffusion libre » : si elle le refuse, la ' +
          'mutation n’est pas celle qu’on croit et le contrôle précédent ne mesure rien.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('une pièce en ÉCART ne peut plus redevenir « en vigueur » par une contrainte creuse', async () => {
    const anomalies = await anomaliesPendant([
      'alter table pieces_jointes drop constraint ck_pieces_jointes_en_vigueur_integre',
      `alter table pieces_jointes add constraint ck_pieces_jointes_en_vigueur_integre
         check (en_vigueur is not null and etat_integrite is not null)`,
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_laisse_passer_l_interdit'),
      '« En vigueur » veut dire « celle-ci fait référence », dans un outil produit en audit. ' +
        'Une contrainte du bon nom, citant les deux colonnes, et vraie pour tout, laissait une ' +
        `pièce en écart faire foi sous un verdict vert (constat Q-285/Q-292). Rendu : ${resume(anomalies)}`,
    );
  });

  test('une barrière qui refuserait une valeur LÉGITIME est vue aussi', async () => {
    /* L'autre sens, et il compte autant : un garde qui ne dit que « c'est trop
       ouvert » laisse passer le correctif qui casse le produit pour le sécuriser —
       c'est le contrôle S18. */
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint ck_documents_statut',
      `alter table documents add constraint ck_documents_statut
         check (statut in ('brouillon','en vigueur','à réviser','obsolète'))`,
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_refuse_une_valeur_legitime'),
      '« en validation » est le PREMIER cas du déclencheur de publication : l’ôter laisse la ' +
        `barrière en place et la vide de son objet. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une contrainte SUPPRIMÉE se distingue d’une contrainte vidée', async () => {
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint ck_documents_confidentialite',
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_non_eprouvable'),
      '⚠️ « Je n’ai pas pu mesurer » ne vaut pas « c’est bon » : c’est exactement le défaut ' +
        `que ce garde ferme. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Le registre RGPD n’est pas réinscriptible, et c’est POSÉ — Q-291', () => {
  test('le rôle applicatif n’a que « select » sur colonnes_personnelles', async () => {
    /* La migration 026 AFFIRMAIT cette propriété dans deux commentaires ; le rôle
       applicatif pouvait vider la table. Un commentaire n’est pas une barrière. */
    const { rows } = await proprietaire.query(
      `select has_table_privilege('grc_app', 'colonnes_personnelles', $1) as a from unnest($2::text[]) v(x), lateral (select x) t`,
      ['select', ['select']],
    );
    assert.equal(
      rows[0].a,
      true,
      'Le service doit pouvoir LIRE le registre : la purge le lit.',
    );
    for (const verbe of ['insert', 'update', 'delete', 'truncate']) {
      const { rows: r } = await proprietaire.query(
        `select has_table_privilege('grc_app', 'colonnes_personnelles', $1) as a`,
        [verbe],
      );
      assert.equal(
        r[0].a,
        false,
        `Le rôle applicatif détient « ${verbe} » sur le registre de l’article 30 DU PRODUIT. ` +
          'Tout ce qui obtient l’exécution de SQL par l’application pourrait alors vider ou ' +
          'falsifier ce que le DPO vient lire, et la purge cesserait d’anonymiser la colonne ' +
          'touchée (constat Q-291).',
      );
    }
  });

  test('rendre l’écriture au rôle applicatif fait rougir le déploiement', async () => {
    const anomalies = await anomaliesPendant([
      'grant insert, update, delete on colonnes_personnelles to grc_app',
    ]);
    assert.ok(
      nomme(anomalies, 'registre_reinscriptible'),
      `Le garde doit MESURER le privilège, jamais l’affirmer. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une table neuve sans filiale_id que personne n’a rangée fait rougir', async () => {
    /* Le renversement : le balayage part du CATALOGUE, pas de la liste. C'est ce qui
       fait la différence entre le cas (a) et le cas (b) du `CLAUDE.md` §3 — une
       omission ÉCHOUE BRUYAMMENT au lieu de réussir en silence. */
    const anomalies = await anomaliesPendant([
      'create table registre_mystere (id id_metier primary key, valeur text)',
    ]);
    assert.ok(
      nomme(anomalies, 'table_sans_filiale_non_rangee'),
      'Une table sans « filiale_id » doit être RANGÉE — registre technique, ou écrite par ' +
        `l’application. Ne pas répondre est ce qu’a fait la migration 026. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('La compagne de portée protège LA MÊME colonne — Q-297', () => {
  const TABLE_FAUTIVE = [
    `create table t_essai_portee_b (
       id id_metier primary key,
       document_id  id_metier not null,
       autre_doc_id id_metier not null,
       filiale_id   id_metier,
       portee_groupe boolean generated always as (filiale_id is null) stored,
       constraint fk_b_coherence    foreign key (document_id,  filiale_id)
         references documents (id, filiale_id),
       constraint fk_b_portee_autre foreign key (autre_doc_id, portee_groupe)
         references documents (id, portee_groupe))`,
  ];

  test('une compagne posée sur une AUTRE colonne ne suffit plus', async () => {
    const anomalies = await anomaliesPendant(TABLE_FAUTIVE);
    assert.ok(
      nomme(anomalies, 'reference_portee_sans_compagne'),
      '`document_id` reste sans protection de portée : une ligne de portée GROUPE pourrait ' +
        'désigner une ligne LOCALE d’une filiale, et la suppression ordinaire de celle-ci ' +
        `emporterait le socle commun (constat N-10, rouvert par Q-297). Rendu : ${resume(anomalies)}`,
    );
  });

  test('la compagne posée sur LA BONNE colonne se tait — le garde n’est pas seulement bruyant', async () => {
    const anomalies = await anomaliesPendant([
      `create table t_essai_portee_c (
         id id_metier primary key,
         document_id id_metier not null,
         filiale_id  id_metier,
         portee_groupe boolean generated always as (filiale_id is null) stored,
         constraint fk_c_coherence foreign key (document_id, filiale_id)
           references documents (id, filiale_id),
         constraint fk_c_portee    foreign key (document_id, portee_groupe)
           references documents (id, portee_groupe))`,
    ]);
    assert.equal(
      anomalies.filter((a) => a.anomalie === 'reference_portee_sans_compagne')
        .length,
      0,
      'Une compagne correcte doit satisfaire le garde. Un garde qui crie sur la forme juste ' +
        `serait désarmé au premier agacement. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Le verrou d’approbation DÉCOUVRE ses colonnes — Q-299', () => {
  const PERIMETRE = perimetre('essai-q299', 'FIL-Q299', ['FIL-Q299'], true);

  /** Sème une décision TRANCHÉE, puis joue `mutation`, le tout annulé. */
  async function avecDecisionTranchee(mutation) {
    return base.avecPerimetre(proprietaire, PERIMETRE, async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, langue_defaut, statut, cree_par)
         values ('FIL-Q299','Q299','Essai Q-299','fr','active','essai-q299')`,
      );
      await c.query(
        `insert into approbations
           (id, filiale_id, objet_type, objet_id, etape, ordre, statut, date_decision,
            acteur_libelle, cree_par)
         values ('APP-Q1','FIL-Q299','document','DOC-X','approbation',1,'approuve', now(),
                 'Amélie Durand','essai-q299')`,
      );
      return mutation(c);
    });
  }

  test('changer l’IDENTIFIANT d’une décision tranchée est refusé', async () => {
    /* Mesuré ACCEPTÉ par l’auditeur : la liste comparait dix colonnes sur dix-huit et
       `id` n’y était pas. Renommer l’identifiant d’une décision rendue détache
       silencieusement ses pièces jointes — classe Q-232/Q-233. */
    const erreur = await erreurAttendue(
      avecDecisionTranchee((c) =>
        c.query(
          `update approbations set id='APP-FALSIFIE', acteur_libelle=f_mention_neutre()
            where id='APP-Q1'`,
        ),
      ),
    );
    assert.equal(
      erreur.code,
      'GRC02',
      'La propriété ÉCRITE — « la décision ne se modifie ni ne s’efface, y compris en SQL » — ' +
        'doit être la propriété TENUE. La liste énumérait ce qui ne devait pas bouger ; on ' +
        `compare désormais la ligne en bloc (constat Q-299). Reçu : ${erreur.message}`,
    );
  });

  test('une colonne AJOUTÉE DEMAIN est protégée d’office', async () => {
    /* C'est le vrai objet du renversement. Sans lui, chaque colonne future rouvrait le
       constat, sans qu'un mot le dise. */
    const erreur = await erreurAttendue(
      base.avecPerimetre(proprietaire, PERIMETRE, async (c) => {
        await c.query('alter table approbations add column note_future text');
        await c.query(
          `insert into filiales (id, code, raison_sociale, langue_defaut, statut, cree_par)
           values ('FIL-Q299','Q299','Essai Q-299','fr','active','essai-q299')`,
        );
        await c.query(
          `insert into approbations
             (id, filiale_id, objet_type, objet_id, etape, ordre, statut, date_decision,
              acteur_libelle, cree_par)
           values ('APP-Q2','FIL-Q299','document','DOC-X','approbation',1,'approuve', now(),
                   'Amélie Durand','essai-q299')`,
        );
        await c.query(
          `update approbations set note_future='falsifiée', acteur_libelle=f_mention_neutre()
            where id='APP-Q2'`,
        );
      }),
    );
    assert.equal(
      erreur.code,
      'GRC02',
      'Une colonne ajoutée après coup ne doit pas devenir librement modifiable sous couvert ' +
        `d’anonymisation. Reçu : ${erreur.message}`,
    );
  });

  test('l’ANONYMISATION légitime passe toujours — la barrière ne casse pas le produit', async () => {
    const libelle = await avecDecisionTranchee(async (c) => {
      await c.query(
        `update approbations set acteur_libelle=f_mention_neutre(), acteur_id=null
          where id='APP-Q1'`,
      );
      const { rows } = await c.query(
        `select acteur_libelle from approbations where id='APP-Q1'`,
      );
      return rows[0].acteur_libelle;
    });
    assert.equal(
      libelle,
      'personne retirée',
      'Le produit doit pouvoir répondre à une demande d’effacement RGPD sans détruire la ' +
        'preuve que le circuit a eu lieu (constat Q-284). Un verrou qui l’empêche est un ' +
        'défaut d’une autre nature, pas un correctif (contrôle S18).',
    );
  });

  test('une étape NON tranchée se supprime toujours — les trois lignes du DELETE', async () => {
    /* Elles ont été perdues une fois, et le banc l'a dit. On ne les reperd pas. */
    const restant = await base.avecPerimetre(
      proprietaire,
      PERIMETRE,
      async (c) => {
        await c.query(
          `insert into filiales (id, code, raison_sociale, langue_defaut, statut, cree_par)
         values ('FIL-Q299','Q299','Essai Q-299','fr','active','essai-q299')`,
        );
        await c.query(
          `insert into approbations (id, filiale_id, objet_type, objet_id, etape, ordre, statut, cree_par)
         values ('APP-Q3','FIL-Q299','document','DOC-X','revue',2,'en_attente','essai-q299')`,
        );
        await c.query(`delete from approbations where id='APP-Q3'`);
        const { rows } = await c.query(
          `select count(*)::int as n from approbations where id='APP-Q3'`,
        );
        return rows[0].n;
      },
    );
    assert.equal(
      restant,
      0,
      'Le déclencheur est « before update OR DELETE » : dans une suppression, `new` est NUL, ' +
        'et un « return new » ANNULE la suppression. Une étape qui n’a rien tranché deviendrait ' +
        'indestructible, en silence.',
    );
  });
});

describe('« Colonne textuelle » ne se dit qu’à UN endroit — Q-296', () => {
  /* ⚠️ **LE DÉFAUT EST LATENT, ET C'EST PRÉCISÉMENT POURQUOI IL FAUT LE FAIRE
     DÉCIDER.** Le schéma ne porte aujourd'hui aucune colonne `character varying`
     — mesuré : 284 `text`, 114 `id_metier`, aucune `varchar`. Remettre le garde
     à « text » seul laisse donc le banc entièrement vert, et le laisserait vert
     jusqu'au jour où quelqu'un écrit une `varchar`.

     C'est le motif du constat **Q-210** : *un essai qui couvre une règle sans
     jamais la faire décider ne la couvre pas.* On fabrique donc la matière — une
     colonne `varchar` dans une transaction annulée — et on exige que les deux
     moitiés du dispositif la voient. */

  test('une colonne « varchar » est réclamée au registre comme une « text »', async () => {
    const anomalies = await anomaliesPendant([
      'alter table actifs add column responsable_secours varchar(120)',
    ]);
    assert.ok(
      nomme(anomalies, 'colonne_personnelle_non_decidee'),
      'Le garde filtrait sur « text » ; la purge lit « text » ET « character varying ». Une ' +
        'colonne varchar portant un nom serait (a) jamais réclamée au registre, (b) jamais ' +
        'anonymisée, et (c) rendue en « anomalie » à CHAQUE purge sans que personne sache ' +
        `pourquoi — classe Q-194. Rendu : ${resume(anomalies)}`,
    );
  });

  test('les deux moitiés interrogent LA MÊME fonction', async () => {
    /* La propriété n'est pas « les deux filtres se ressemblent », c'est « il n'y
       a qu'un filtre ». On le mesure en comparant l'ensemble rendu par la source
       unique à celui que le garde réclame : un écart signifie qu'une seconde
       définition est réapparue quelque part. */
    await proprietaire.query('begin');
    try {
      await proprietaire.query('alter table actifs add column note_libre varchar(80)');
      const { rows } = await proprietaire.query(
        `select count(*)::int as n from f_colonnes_textuelles()
          where table_nom = 'actifs' and colonne = 'note_libre'`,
      );
      assert.equal(
        rows[0].n,
        1,
        'f_colonnes_textuelles() ne rend pas une colonne « character varying » : la source ' +
          'unique a cessé d’être la source unique.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('un domaine textuel NEUF, que personne n’a rangé, fait rougir', async () => {
    /* L'exclusion des domaines est juste pour les six qui existent — ce sont des
       formes closes. Elle serait FAUSSE EN SILENCE pour un domaine qui porterait
       de la prose. C'est le renversement de Q-295 appliqué à sa propre exception :
       une exclusion qui ne se déclare pas se transmet sans qu'un mot le dise. */
    const anomalies = await anomaliesPendant([
      'create domain note_normalisee as text check (value = btrim(value))',
    ]);
    assert.ok(
      nomme(anomalies, 'domaine_textuel_non_range'),
      'Un domaine neuf sur une base textuelle doit être rangé — « technique » ou « saisie ' +
        `libre » — avant que ses colonnes échappent au registre. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Tout identifiant métier porte son domaine — Q-310', () => {
  test('risque_catalogue refuse l’identifiant vide, comme toute autre table', async () => {
    /* Mesuré ACCEPTÉ avant la migration 029 : `risque_catalogue.id` était de type
       « text » nu, quand `risques.id` porte le domaine `id_metier`. C'est le
       constat Q-194 rejoué sur la table que la même migration 012 avait créée —
       la correction avait porté sur l'instance, pas sur la classe. */
    const { rows } = await proprietaire.query(
      `select format_type(a.atttypid, a.atttypmod) as typ
         from pg_attribute a
        where a.attrelid = 'risque_catalogue'::regclass and a.attname = 'id'`,
    );
    assert.equal(
      rows[0].typ,
      'id_metier',
      'Le domaine est ce par quoi la couche d’écriture DÉCOUVRE qu’un identifiant ne peut ' +
        'être ni vide ni non rogné : sans lui, deux lignes qui ne diffèrent que par un espace ' +
        'de bordure deviennent deux risques distincts dans le socle Groupe.',
    );
  });

  test('une colonne d’identifiant qui perd son domaine fait rougir', async () => {
    const anomalies = await anomaliesPendant([
      'drop policy pol_risque_catalogue_lecture on risque_catalogue',
      'alter table risque_catalogue alter column id type text',
    ]);
    assert.ok(
      nomme(anomalies, 'identifiant_sans_domaine'),
      `Le garde de classe doit nommer la colonne. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Un DOMAINE vidé est vu, comme une contrainte vidée — A-1', () => {
  /* ⚠️ **`f_domaine_accepte()` avait été livrée, inscrite en règle au
     `CONVENTIONS.md` §39.1 — et appelée par PERSONNE.** Deux fichiers la
     mentionnaient : celui qui la crée, et celui qui promet qu'on s'en sert.
     Conséquence mesurée au 9ᵉ passage de la porte S8 : la mutation sournoise de
     Q-292 fonctionnait encore sur les domaines, et `insert into risques (id)
     values ('')` passait sous un `f_verifier_schema()` à zéro anomalie — c'est
     **Q-310, donc Q-194, rouverts par la migration écrite le même jour pour les
     fermer**. *Un garde-fou que rien n'invoque est un commentaire.* */

  test('le domaine « id_metier » vidé par « or true » est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter domain id_metier drop constraint id_metier_check',
      "alter domain id_metier add constraint id_metier_check check (value <> '' or true)",
    ]);
    assert.ok(
      nomme(anomalies, 'domaine_laisse_passer_l_interdit'),
      'Le domaine qui borne TOUT identifiant métier du produit se vide en gardant son nom ' +
        `et ses mots. Rendu : ${resume(anomalies)}`,
    );
  });

  test('le domaine « type_entite » vidé est vu — il borne le lien polymorphe', async () => {
    const anomalies = await anomaliesPendant([
      'alter domain type_entite drop constraint type_entite_check',
      "alter domain type_entite add constraint type_entite_check check (value <> '' or true)",
    ]);
    assert.ok(
      nomme(anomalies, 'domaine_laisse_passer_l_interdit'),
      'Ce domaine borne le lien POLYMORPHE des pièces jointes : une valeur inventée ferait ' +
        'une pièce attachée sous un nom que nul déclencheur ne porte, donc une pièce qui ne ' +
        `suivrait JAMAIS son porteur (constats Q-232 / Q-233). Rendu : ${resume(anomalies)}`,
    );
  });

  test('et le témoin se tait : les six domaines intacts ne font rien rougir', async () => {
    const anomalies = await anomaliesPendant([]);
    assert.equal(
      anomalies.filter((a) => a.anomalie.startsWith('domaine_')).length,
      0,
      `Un garde qui crie sur la forme juste est désarmé au premier agacement : ${resume(anomalies)}`,
    );
  });
});

describe('La barrière document ↔ traitement est gardée — A-2', () => {
  /* ⚠️ **Les cinq pièces de la migration `030` se retiraient une par une sous un
     `f_verifier_schema()` à zéro anomalie**, et l'auditeur a joué les conséquences
     jusqu'au bout : la PSSI de portée Groupe désignant le traitement LOCAL d'une
     filiale (**N-10 rouvert**), un document de Toulouse désignant le traitement
     allemand (**lien inter-filiales**), un `traitement_id` ne référençant plus
     rien.

     La cause : `f_verifier_references_portee()` — le garde renforcé la veille pour
     cette classe précise (Q-297) — reconnaissait une clé à ceci que l'une de ses
     colonnes **s'appelle** `filiale_id`. La `030` a nommé la sienne
     `traitement_filiale_id`. *Reconnaître un NOM au lieu de mesurer ce qu'une
     chose FAIT* — la règle que le §39 venait d'écrire, retournée contre lui. */

  for (const [quoi, mutation, attendue] of [
    ['le déclencheur qui pose la filiale visée',
     'drop trigger trg_documents_traitement_portee on documents',
     'declencheur_de_portee_non_arme'],
    ['la contrainte qui ferme N-10',
     'alter table documents drop constraint ck_documents_traitement_groupe',
     'barriere_traitement_non_eprouvable'],
    ['la contrainte qui ferme le lien inter-filiales',
     'alter table documents drop constraint ck_documents_traitement_filiale',
     'barriere_traitement_non_eprouvable'],
    ['la clé de cohérence',
     'alter table documents drop constraint fk_documents_traitement_coherence',
     'cle_de_portee_absente'],
    ['la clé de portée',
     'alter table documents drop constraint fk_documents_traitement_portee',
     'cle_de_portee_absente'],
  ]) {
    test(`retirer ${quoi} fait rougir le déploiement`, async () => {
      const anomalies = await anomaliesPendant([mutation]);
      assert.ok(
        nomme(anomalies, attendue),
        `Le retrait de cette pièce doit être NOMMÉ. Rendu : ${resume(anomalies)}`,
      );
    });
  }

  test('LE GARDE DE CLASSE voit désormais la paire, quel que soit le NOM local', async () => {
    /* Le cœur du constat A-2 : la paire de la `030` était la seule dont les DEUX
       moitiés étaient invisibles. Retirer la compagne doit désormais réveiller le
       garde de classe — celui qui vaut pour toutes les clés, pas seulement pour
       celles qu'on a pensé à nommer. */
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint fk_documents_traitement_portee',
    ]);
    assert.ok(
      nomme(anomalies, 'reference_portee_sans_compagne'),
      'Le garde de CLASSE doit voir la clé de la migration 030, dont la colonne de ' +
        'cloisonnement s’appelle « traitement_filiale_id » et non « filiale_id ». Il ' +
        `regarde ce qu’elle RÉFÉRENCE, jamais son nom. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Un garde n’ÉVALUE pas un prédicat qui peut agir — A-4', () => {
  test('un prédicat qui appelle une fonction du produit n’est PAS exécuté', async () => {
    /* ⚠️ **Mesuré par l'orchestrateur, et le mécanisme n'est pas celui que le
       rapport annonçait** — c'est pourquoi on revérifie : `stable` bloque
       l'écriture DIRECTE (« INSERT is not allowed in a non-volatile function »),
       et rien de plus. Une fonction `stable` qui appelle une `volatile` écrit
       librement, et `f_contrainte_accepte()` répondait `true` comme si de rien
       n'était — sous l'identité du PROPRIÉTAIRE, `f_verifier_schema()` étant
       « security definer ». */
    await proprietaire.query('begin');
    try {
      await proprietaire.query(
        `create function f_charge_essai() returns boolean language plpgsql volatile as $x$
           begin insert into colonnes_personnelles
                 values ('__essai__','__essai__','non_personnelle',null,null,null,null,'x');
                 return true; end $x$`,
      );
      await proprietaire.query(
        `create function f_masque_essai() returns boolean language plpgsql stable as $x$
           begin return f_charge_essai(); end $x$`,
      );
      await proprietaire.query('alter table documents drop constraint ck_documents_confidentialite');
      await proprietaire.query(
        'alter table documents add constraint ck_documents_confidentialite check (f_masque_essai())',
      );
      const { rows: anomalies } = await proprietaire.query(
        `select anomalie from f_verifier_schema() where anomalie = 'contrainte_non_eprouvable'`,
      );
      assert.ok(
        anomalies.length > 0,
        'Le garde doit REFUSER d’évaluer un prédicat qui référence une fonction non native, ' +
          'et le DIRE — « je n’ai pas pu mesurer » ne vaut pas « c’est bon ».',
      );
      const { rows } = await proprietaire.query(
        `select count(*)::int as n from colonnes_personnelles where table_nom = '__essai__'`,
      );
      assert.equal(
        rows[0].n,
        0,
        'La charge a écrit : le garde a exécuté ce qu’il inspectait, sous l’identité du ' +
          'propriétaire (constat A-4).',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });
});

describe('« Éprouvée » n’est pas « validée », et le défaut est gardé — A-8, A-12', () => {
  test('une contrainte de barrière reposée « not valid » est vue', async () => {
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint ck_documents_confidentialite',
      `alter table documents add constraint ck_documents_confidentialite
         check (confidentialite in ('public','interne','confidentiel','restreint')) not valid`,
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_non_validee'),
      'Une contrainte « not valid » garde son prédicat — les témoins la jugent donc juste — ' +
        'et les lignes DÉJÀ EN BASE n’ont jamais été vérifiées. La propriété avait été ' +
        `perdue en généralisant (constat A-8). Rendu : ${resume(anomalies)}`,
    );
  });

  test('LA RÉSERVE DE LA MIGRATION 025 EST LEVÉE : plus aucune contrainte « not valid »', async () => {
    const { rows } = await proprietaire.query(
      `select c.relname || '.' || k.conname as objet
         from pg_constraint k
         join pg_class c on c.oid = k.conrelid
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        where k.contype = 'c' and not k.convalidated
        order by 1`,
    );
    assert.deepEqual(
      rows.map((l) => l.objet),
      [],
      'Une contrainte du schéma est « not valid ». La technique qui lève la réserve — un §0 ' +
        'qui pose le périmètre du groupe entier — a été inventée aux migrations 029 et 030 ; ' +
        'une réserve écrite n’est pas une réserve traitée (constat A-8).',
    );
  });

  test('le défaut « interne » de la classification est gardé', async () => {
    const anomalies = await anomaliesPendant([
      'alter table documents alter column confidentialite drop default',
    ]);
    assert.ok(
      nomme(anomalies, 'defaut_de_diffusion_perdu'),
      'Un document repris d’un export antérieur à la migration 027 serait alors réputé ' +
        'PUBLIC, ou refusé. C’est le réglage le plus discret de la classification, et le ' +
        `pire s’il bascule (constat A-12). Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Le registre franchit la frontière du TEXTE — A-3', () => {
  test('une colonne « jsonb » neuve est réclamée comme une « text »', async () => {
    const anomalies = await anomaliesPendant(['alter table actifs add column contexte jsonb']);
    assert.ok(
      nomme(anomalies, 'colonne_personnelle_non_decidee'),
      'Le renversement du constat Q-295 s’arrêtait au texte : huit colonnes « jsonb » — dont ' +
        'journal_audit.valeurs_avant et valeurs_apres, qui recopient PAR CONSTRUCTION toutes ' +
        'les colonnes déclarées personnelles — échappaient au registre qu’on présente au ' +
        `DPO. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une colonne « inet » neuve aussi — c’est la jumelle qui manquait', async () => {
    const anomalies = await anomaliesPendant(['alter table actifs add column poste inet']);
    assert.ok(
      nomme(anomalies, 'colonne_personnelle_non_decidee'),
      `Une adresse IP désigne un poste, donc une personne. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une colonne « date » ne l’est PAS : le témoin se tait', async () => {
    const anomalies = await anomaliesPendant(['alter table actifs add column revue_le date']);
    assert.equal(
      anomalies.filter((a) => a.anomalie === 'colonne_personnelle_non_decidee').length,
      0,
      'Une date d’échéance n’est pas une personne : réclamer une décision sur chacune ferait ' +
        `un registre illisible, donc non lu. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('Le registre impose la cohérence de TYPE — Q-300', () => {
  test('déclarer une colonne BOOLÉENNE « personnelle · anonymiser » fait rougir', async () => {
    /* La purge est TRANSACTIONNELLE : une seule déclaration de ce genre l'avorte
       entièrement, pour toutes les filiales — et elle se composait avec Q-291, le rôle
       applicatif pouvant écrire le registre. */
    const anomalies = await anomaliesPendant([
      `insert into colonnes_personnelles values
         ('documents','donnees_personnelles','personnelle','essai','Contrat',1095,
          'anonymiser','témoin du constat Q-300')`,
    ]);
    assert.ok(
      nomme(anomalies, 'declaration_personnelle_de_mauvais_type'),
      'Une déclaration dont le type dément le régime avorte la purge RGPD ENTIÈRE, sous un ' +
        `f_verifier_schema() au vert. Rendu : ${resume(anomalies)}`,
    );
  });
});

/* =====================================================================
 *  LA REVUE DES HABILITATIONS — migration `060`
 *
 *  ⚠️ **Une revue qui n'engage personne ne prouve rien**, et c'est la seule
 *  chose qu'un auditeur vient chercher. Les quatre contrôles ci-dessous
 *  CASSENT chacune des quatre propriétés et exigent que le garde la NOMME.
 *  Constater qu'elles tiennent ne mesurerait que le schéma du jour.
 * ===================================================================== */

describe('La revue des habilitations engage quelqu’un, et c’est ÉPROUVÉ — 060', () => {
  test('le témoin : le schéma intact ne rend AUCUNE anomalie', async () => {
    const anomalies = await anomaliesPendant([]);
    assert.equal(anomalies.length, 0, `Schéma d’essai déjà en défaut : ${resume(anomalies)}`);
  });

  test('une décision sans auteur ni date : la contrainte VIDÉE est vue', async () => {
    // La mutation de référence : le nom reste, les quatre valeurs restent, et
    // « or true » ouvre tout. C'est celle qui passait au vert avant la `028`.
    const anomalies = await anomaliesPendant([
      'alter table revue_habilitation_lignes drop constraint ck_revue_hab_signature',
      `alter table revue_habilitation_lignes add constraint ck_revue_hab_signature check (
         ((decision = 'a_examiner' and decide_par is null and decide_le is null)
          or (decision <> 'a_examiner' and decide_par is not null and decide_le is not null))
         or true)`,
    ]);
    assert.ok(
      nomme(anomalies, 'decision_sans_auteur_admise'),
      'Une décision de revue sans auteur ni date doit être NOMMÉE : sans elle, la revue ' +
        `n’engage personne, et c’est le seul point sur lequel un auditeur insistera. Rendu : ${resume(anomalies)}`,
    );
  });

  test('« a_examiner » signée : la même contrainte vidée est vue par l’AUTRE cas', async () => {
    /* ⚠️ Les deux cas partagent une contrainte, et c'est délibéré : un garde qui
       n'éprouverait qu'un des deux resterait vert sur une rédaction qui n'en
       garderait qu'une moitié. On mesure donc que la seconde moitié est nommée
       elle aussi — un garde de CLASSE ne voit pas la disparition d'une PAIRE
       (constat Q-313). */
    const anomalies = await anomaliesPendant([
      'alter table revue_habilitation_lignes drop constraint ck_revue_hab_signature',
      `alter table revue_habilitation_lignes add constraint ck_revue_hab_signature check (
         decision = 'a_examiner' or (decide_par is not null and decide_le is not null))`,
    ]);
    assert.ok(
      nomme(anomalies, 'non_decision_signee_admise'),
      '« a_examiner » ne peut pas porter d’auteur : sinon « non revu » et « revu » se ' +
        `confondent, et une revue paraît faite. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un retrait sans motif : la contrainte vidée est vue', async () => {
    const anomalies = await anomaliesPendant([
      'alter table revue_habilitation_lignes drop constraint ck_revue_hab_motif',
      `alter table revue_habilitation_lignes add constraint ck_revue_hab_motif check (
         decision not in ('a_retirer','a_verifier')
         or (commentaire is not null and commentaire <> '') or true)`,
    ]);
    assert.ok(
      nomme(anomalies, 'retrait_sans_motif_admis'),
      `Un retrait d’accès sans motif ne se défend pas six mois plus tard. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une clôture sans conclusion : la contrainte vidée est vue', async () => {
    const anomalies = await anomaliesPendant([
      'alter table revues_habilitations drop constraint ck_revues_hab_cloture',
      `alter table revues_habilitations add constraint ck_revues_hab_cloture check (
         ((close_le is null and close_par is null and conclusion is null)
          or (close_le is not null and close_par is not null and conclusion is not null
              and conclusion <> '')) or true)`,
    ]);
    assert.ok(
      nomme(anomalies, 'cloture_sans_conclusion_admise'),
      'Une revue close sans conclusion n’atteste que du fait d’avoir regardé. ' +
        `Rendu : ${resume(anomalies)}`,
    );
  });

  test('UNE CONTRAINTE QUI REFUSE TOUT est vue aussi — le contre-témoin', async () => {
    /* ⚠️ **La moitié qui manque le plus souvent.** Un garde qui n'éprouve que des
       REFUS rend zéro anomalie sur une contrainte devenue « false » : la table
       devient inutilisable — plus aucune décision n'entre — et le garde se tait,
       ce qu'il fait aussi quand tout va bien. C'est le motif du cas négatif de D3
       et du constat Q-210. */
    const anomalies = await anomaliesPendant([
      'alter table revue_habilitation_lignes drop constraint ck_revue_hab_motif',
      'alter table revue_habilitation_lignes add constraint ck_revue_hab_motif check (false)',
    ]);
    assert.ok(
      nomme(anomalies, 'cas_nominal_refuse'),
      'Une contrainte qui refuse même une décision COMPLÈTE et motivée doit être nommée : ' +
        `sinon la table est inutilisable et le garde muet. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une contrainte SUPPRIMÉE se distingue d’une contrainte vidée', async () => {
    const anomalies = await anomaliesPendant([
      'alter table revue_habilitation_lignes drop constraint ck_revue_hab_signature',
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_non_mesurable'),
      '« je n’ai pas pu mesurer » doit se distinguer de « j’ai mesuré et c’est bon » : ' +
        `les confondre rendrait le garde muet sur une barrière absente. Rendu : ${resume(anomalies)}`,
    );
  });
});

/* =====================================================================
 *  LES FICHES RÉFLEXES DE CRISE — migration `061`
 *
 *  ⚠️ **Ces quatre propriétés se vérifient le JOUR DE LA CRISE**, c'est-à-dire
 *  trop tard. C'est la raison d'être du garde-fou, et de ces mutations : un
 *  socle amputé, une fiche vide, une unicité laxiste ou une portée non tenue ne
 *  produisent aucun symptôme avant le moment où l'on sort la carte de l'armoire.
 * ===================================================================== */

describe('Les fiches réflexes tiennent, et c’est ÉPROUVÉ — 061', () => {
  test('le témoin : le schéma intact ne rend AUCUNE anomalie', async () => {
    const anomalies = await anomaliesPendant([]);
    assert.equal(anomalies.length, 0, `Schéma d’essai déjà en défaut : ${resume(anomalies)}`);
  });

  test('une fiche du socle VIDÉE de ses réflexes est nommée', async () => {
    const anomalies = await anomaliesPendant([
      "select set_config('grc.utilisateur', 'garde-fou', true)",
      "select set_config('grc.administration_groupe', 'oui', true)",
      // ⚠️ **Et une FILIALE ACTIVE**, alors qu'on supprime une ligne du SOCLE : le
      //    déclencheur `f_pieces_suivent_leur_porteur()` (migration `017`) met la
      //    purge en file dans `pieces_a_purger`, qui est CLOISONNÉE. Sans filiale
      //    active, la suppression est refusée — « Périmètre non positionné ».
      // ⚠️ L'ORDRE compte : `grc.filiales` d'abord, sinon la sous-requête sur
      //    `filiales` — cloisonnée — ne verrait aucune ligne et poserait un
      //    périmètre vide. Les identifiants sont ceux que `ouvrirBaseEssai` sème.
      "select set_config('grc.filiales', 'FIL-ESSAI-A,FIL-ESSAI-B', true)",
      "select set_config('grc.filiale_id', 'FIL-ESSAI-A', true)",
      `delete from fiche_reflexe_actions
        where fiche_id = (select id from fiches_reflexes
                           where filiale_id is null and role = 'Responsable IT / SSI (Opérationnel)')`,
    ]);
    assert.ok(
      nomme(anomalies, 'fiche_sans_reflexe'),
      'Une fiche vide imprimée est pire qu’une fiche absente : on la sort de l’armoire et ' +
        `on y cherche un geste qui n’y est pas. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un socle AMPUTÉ est nommé', async () => {
    const anomalies = await anomaliesPendant([
      "select set_config('grc.administration_groupe', 'oui', true)",
      "update fiches_reflexes set actif = false where filiale_id is null and role = 'Autre'",
    ]);
    assert.ok(
      nomme(anomalies, 'socle_incomplet'),
      `Une organisation de crise amputée se découvre le jour de la crise. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 l’unicité RAMENÉE À UNE UNICITÉ ORDINAIRE est vue', async () => {
    /* ⚠️ **La mutation la plus traître du lot.** `unique (filiale_id, lower(role))`
       et sa variante `nulls not distinct` se ressemblent trait pour trait : même
       nom, mêmes colonnes, même `create unique index`. Un garde qui relirait le
       texte ne verrait rien — et le socle du Groupe, dont `filiale_id` est nul PAR
       CONSTRUCTION, pourrait porter DEUX fiches pour le même rôle. On mesure donc
       `indnullsnotdistinct` dans le catalogue, qui ne se laisse pas imiter. */
    const anomalies = await anomaliesPendant([
      'drop index uq_fiches_reflexes_role',
      'create unique index uq_fiches_reflexes_role on fiches_reflexes (filiale_id, lower(role))',
    ]);
    assert.ok(
      nomme(anomalies, 'unicite_socle_laxiste'),
      'Deux cartes pour le même rôle, c’est deux colonnes qui se contredisent sous les ' +
        `yeux de quelqu’un qui n’a pas le temps de choisir. Rendu : ${resume(anomalies)}`,
    );
  });

  test('LA MATIÈRE : l’unicité ramenée à l’ordinaire laisse VRAIMENT entrer le doublon', async () => {
    /* Sans cette moitié, le contrôle précédent prouverait qu’une anomalie est émise,
       jamais qu’elle correspond à un vrai trou. On mesure donc le trou. */
    await proprietaire.query('begin');
    try {
      // ⚠️ Même piège que ci-dessus, du côté de l'INSERT : sans le drapeau, la
      //    politique d'ajout refuse la ligne de portée Groupe — et on mesurerait
      //    la RLS au lieu de l'unicité.
      await proprietaire.query("select set_config('grc.administration_groupe', 'oui', true)");
      await proprietaire.query('drop index uq_fiches_reflexes_role');
      await proprietaire.query(
        'create unique index uq_fiches_reflexes_role on fiches_reflexes (filiale_id, lower(role))',
      );
      await proprietaire.query(
        `insert into fiches_reflexes (id, filiale_id, role, titre)
              values ('FICHE-DOUBLON-1', null, 'Autre', 'Doublon du socle')`,
      );
      const { rows } = await proprietaire.query(
        "select count(*)::int n from fiches_reflexes where filiale_id is null and lower(role) = 'autre'",
      );
      assert.equal(
        rows[0].n,
        2,
        'L’unicité ordinaire devrait accepter le doublon du socle : si elle le refuse, la ' +
          'mutation n’est pas celle qu’on croit et le contrôle précédent ne mesure rien.',
      );
    } finally {
      await proprietaire.query('rollback');
    }
  });

  test('le déclencheur de portée DÉSARMÉ est vu', async () => {
    // ⚠️ « origin » et non « drop » : le déclencheur EXISTE encore, il est seulement
    // neutralisable par un réglage de session. C'est le constat Q-281, et c'est ce
    // qu'un garde qui vérifie l'EXISTENCE laisse passer.
    const anomalies = await anomaliesPendant([
      'alter table fiche_reflexe_actions enable replica trigger trg_fiche_reflexe_actions_portee',
    ]);
    assert.ok(
      nomme(anomalies, 'portee_non_tenue'),
      'Un déclencheur armé en « origin » ou « replica » est neutralisé par un réglage de ' +
        `session, et la garantie avec lui. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un réflexe VIDE admis est vu — contrainte creuse', async () => {
    const anomalies = await anomaliesPendant([
      'alter table fiche_reflexe_actions drop constraint ck_fiche_reflexe_actions_texte',
      `alter table fiche_reflexe_actions
         add constraint ck_fiche_reflexe_actions_texte check (texte <> '' or true)`,
    ]);
    assert.ok(
      nomme(anomalies, 'reflexe_vide_admis'),
      'Une puce sans texte sur une carte imprimée : personne ne sait s’il manque un geste ' +
        `ou s’il n’y en a pas. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une contrainte qui REFUSE TOUT est vue aussi — le contre-témoin', async () => {
    const anomalies = await anomaliesPendant([
      'alter table fiche_reflexe_actions drop constraint ck_fiche_reflexe_actions_texte',
      // ⚠️ `not valid` : PostgreSQL valide les lignes EXISTANTES à l'ajout d'une
      //    contrainte, et « check (false) » les refuserait toutes. Non validée, la
      //    contrainte s'applique quand même aux écritures — et c'est elle que
      //    `f_contrainte_accepte()` évalue, donc la mutation est bien celle qu'on croit.
      'alter table fiche_reflexe_actions add constraint ck_fiche_reflexe_actions_texte check (false) not valid',
    ]);
    assert.ok(
      nomme(anomalies, 'cas_nominal_refuse'),
      'Un garde qui n’éprouve que des refus est muet sur une table où plus rien n’entre. ' +
        `Rendu : ${resume(anomalies)}`,
    );
  });

  test('une coordonnée faite de TIRETS BAS est vue — elle IMITE une donnée', async () => {
    /* ⚠️ C'est ce que le code d'origine livrait pour les trois contacts à remplir.
       Une ligne « ______________________ » passe tout contrôle de présence, elle
       s'imprime, et le jour de la crise on compose un numéro qui n'existe pas. */
    const anomalies = await anomaliesPendant([
      "select set_config('grc.administration_groupe', 'oui', true)",
      `update contacts_urgence set coordonnee = '______________________'
        where filiale_id is null and intitule like 'Infogérant%'`,
    ]);
    assert.ok(
      nomme(anomalies, 'coordonnee_imitee'),
      `« null » se lit « à compléter » ; un trait imite une donnée. Rendu : ${resume(anomalies)}`,
    );
  });
});

/* =====================================================================
 *  LES DÉPENDANCES ENTRE ACTIFS — migration `062`
 *
 *  ⚠️ **Le défaut que ces mutations ferment ne se voit PAS à l'usage** : un type
 *  de lien retiré du vocabulaire laisse les lignes en base et les fait
 *  disparaître du graphe — saisies, stockées, invisibles. La cartographie
 *  ignore ce qu'elle ne connaît pas, et elle a raison de le faire.
 * ===================================================================== */

describe('Les natures de lien entre actifs tiennent, et c’est ÉPROUVÉ — 062', () => {
  test('le témoin : le schéma intact ne rend AUCUNE anomalie', async () => {
    const anomalies = await anomaliesPendant([]);
    assert.equal(anomalies.length, 0, `Schéma d’essai déjà en défaut : ${resume(anomalies)}`);
  });

  test('🛑 retirer UNE nature de lien est vu, et elle est NOMMÉE', async () => {
    /* ⚠️ La mutation du constat **Q-313** : la contrainte existe encore, elle porte
       le bon nom, elle cite sept valeurs sur huit. Un garde de CLASSE ne voit rien.
       Ici, `administre_par` disparaît — et avec lui la seule chose qui distingue le
       chemin d'un attaquant d'une dépendance quelconque. */
    const anomalies = await anomaliesPendant([
      'alter table actif_dependances drop constraint ck_actif_dependances_type',
      `alter table actif_dependances add constraint ck_actif_dependances_type check (
         type in ('dep','hosted','flux','backup','authentifie_par','transite_par','redonde_par'))`,
    ]);
    assert.ok(
      nomme(anomalies, 'type_de_lien_disparu'),
      `Une nature de lien retirée doit être NOMMÉE. Rendu : ${resume(anomalies)}`,
    );
    const detail = anomalies.find((a) => a.anomalie === 'type_de_lien_disparu')?.detail ?? '';
    assert.match(
      detail,
      /administre_par/,
      'Le garde doit dire LAQUELLE a disparu : « une contrainte a changé » n’aide personne.',
    );
  });

  test('un vocabulaire OUVERT est vu — le contre-témoin', async () => {
    const anomalies = await anomaliesPendant([
      'alter table actif_dependances drop constraint ck_actif_dependances_type',
      "alter table actif_dependances add constraint ck_actif_dependances_type check (type <> '')",
    ]);
    assert.ok(
      nomme(anomalies, 'vocabulaire_des_liens_ouvert'),
      'Un type inventé accepté fait disparaître le lien du graphe sans un mot — saisi, ' +
        `stocké, invisible. Rendu : ${resume(anomalies)}`,
    );
  });

  test('rendre un qualificatif OBLIGATOIRE est vu', async () => {
    /* ⚠️ Le défaut le plus insidieux du lot : rendre `delai_impact` obligatoire
       paraît rigoureux. Conséquence mesurée — les milliers de dépendances saisies
       avant la `062` deviennent inécrivables, et la fiche d'un actif refuse
       d'enregistrer sans désigner la cause. C'est le motif du constat Q-192. */
    const anomalies = await anomaliesPendant([
      'alter table actif_dependances drop constraint ck_actif_dependances_delai',
      // ⚠️ **`is not null` est INDISPENSABLE dans cette mutation**, et l'avoir
      //    oublié a fait passer l'essai au vert. Un `check (col in (…))` ne
      //    rejette JAMAIS la valeur nulle : une contrainte CHECK n'échoue que sur
      //    FALSE, et `null in (…)` vaut NULL. C'est d'ailleurs pourquoi la
      //    contrainte d'origine s'écrit « is null or … » — les deux formes sont
      //    équivalentes, et la seconde est seulement plus lisible.
      `alter table actif_dependances add constraint ck_actif_dependances_delai check (
         delai_impact is not null and delai_impact in ('immediat','heures','jour','semaine'))`,
    ]);
    assert.ok(
      nomme(anomalies, 'qualificatif_obligatoire'),
      `Une colonne neuve ne rend pas inécrivables les lignes anciennes. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un délai INVENTÉ accepté est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table actif_dependances drop constraint ck_actif_dependances_delai',
      'alter table actif_dependances add constraint ck_actif_dependances_delai check (true)',
    ]);
    assert.ok(
      nomme(anomalies, 'delai_ouvert'),
      `Une chronologie qui n’est plus comparable n’apporte rien. Rendu : ${resume(anomalies)}`,
    );
  });

  test('la NATURE retirée de la clé du lien vers un tiers est vue', async () => {
    /* ⚠️ Sans elle, un tiers qui HÉBERGE un actif et l'INFOGÈRE ne peut déclarer
       qu'un des deux — et le registre d'information DORA est faux d'une ligne. La
       mesure porte sur les COLONNES de l'index, jamais sur son nom : un index qui
       porterait le bon nom sur les mauvaises colonnes passerait tout contrôle
       textuel. */
    const anomalies = await anomaliesPendant([
      'alter table actif_prestataires drop constraint pk_actif_prestataires',
      'alter table actif_prestataires add constraint pk_actif_prestataires primary key (actif_id, prestataire_id)',
    ]);
    assert.ok(
      nomme(anomalies, 'nature_hors_cle'),
      `Héberger et infogérer sont deux engagements contractuels. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une politique retirée du lien vers un tiers est vue', async () => {
    const anomalies = await anomaliesPendant([
      'drop policy pol_actif_prestataires_maj on actif_prestataires',
    ]);
    assert.ok(
      nomme(anomalies, 'politiques_incompletes'),
      'Une arête entre un actif et un prestataire d’une AUTRE filiale passerait, et ni la ' +
        `clé étrangère ni un contrôle applicatif ne la verraient. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('🛑 La délégation temporaire ne devient pas une porte, et c’est ÉPROUVÉ — 068', () => {
  /* ⚠️ **C'est le seul lot de la série qui touche la RÉSOLUTION DES DROITS.** Un
   * garde-fou vert y vaut moins qu'ailleurs : ce qui compte est qu'il ROUGISSE
   * quand on vide chacun de ses invariants. Les sept mutations ci-dessous ont été
   * jouées à la main sur la recette avant d'être figées ici, et les sept mordent. */

  test('le témoin : le schéma intact ne rend AUCUNE anomalie', async () => {
    const anomalies = await anomaliesPendant([]);
    assert.equal(anomalies.length, 0, `Schéma d’essai déjà en défaut : ${resume(anomalies)}`);
  });

  test('🛑 L’AUTO-DÉLÉGATION : la contrainte VIDÉE est vue', async () => {
    /* L'invariant de sécurité de cette migration. Sans lui, qui détient le domaine
     * « administration » s'accorde n'importe quel profil sur n'importe quelle
     * filiale : c'est le seul chemin d'élévation de privilège que ce dispositif
     * pourrait ouvrir. La mutation garde le NOM de la contrainte — c'est celle qui
     * passait au vert avant que les gardes ÉPROUVENT (constat Q-312). */
    const anomalies = await anomaliesPendant([
      'alter table delegations_droits drop constraint ck_delegations_pas_soi_meme',
      'alter table delegations_droits add constraint ck_delegations_pas_soi_meme check (true)',
    ]);
    assert.ok(
      nomme(anomalies, 'auto_delegation_acceptee'),
      'Un compte peut s’accorder des droits à LUI-MÊME et rien ne le dit. C’est la seule ' +
        `élévation de privilège que ce lot pourrait ouvrir. Rendu : ${resume(anomalies)}`,
    );
  });

  test('CONTRE-TÉMOIN : une contrainte devenue « false » est vue AUSSI', async () => {
    /* Un garde qui n'éprouverait que le refus serait muet sur une contrainte qui
     * refuse TOUT — y compris une délégation légitime. Plus personne ne pourrait
     * déléguer, et le garde-fou resterait vert. */
    const anomalies = await anomaliesPendant([
      'alter table delegations_droits drop constraint ck_delegations_pas_soi_meme',
      'alter table delegations_droits add constraint ck_delegations_pas_soi_meme check (false)',
    ]);
    assert.ok(
      nomme(anomalies, 'contrainte_devenue_fausse'),
      `Une contrainte qui refuse tout doit être NOMMÉE. Rendu : ${resume(anomalies)}`,
    );
  });

  test('la DURÉE débornée est vue', async () => {
    const anomalies = await anomaliesPendant([
      'alter table delegations_droits drop constraint ck_delegations_duree',
      'alter table delegations_droits add constraint ck_delegations_duree check (true)',
    ]);
    assert.ok(
      nomme(anomalies, 'duree_non_bornee'),
      '« Temporaire » qui se reconduit tacitement redevient permanent : c’est exactement ' +
        `ce que ce lot existe pour empêcher. Rendu : ${resume(anomalies)}`,
    );
  });

  test('le MOTIF creux admis est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table delegations_droits drop constraint ck_delegations_motif',
      'alter table delegations_droits add constraint ck_delegations_motif check (true)',
    ]);
    assert.ok(
      nomme(anomalies, 'motif_creux_accepte'),
      `Cette ligne est celle qu’un auditeur lit. Rendu : ${resume(anomalies)}`,
    );
  });

  test('le déclencheur qui refuse le profil ADMIN, DÉSARMÉ, est vu', async () => {
    /* ⚠️ « disable » et non « drop » : c'est la forme discrète, celle qui laisse le
     * déclencheur exister. Un garde qui vérifierait seulement sa PRÉSENCE serait
     * vert ici — c'est le constat Q-281, et il est éprouvé plutôt que supposé. */
    const anomalies = await anomaliesPendant([
      'alter table delegations_droits disable trigger trg_delegations_droits_profil',
    ]);
    assert.ok(
      nomme(anomalies, 'declencheur_absent_ou_desarme'),
      'Le profil d’administration deviendrait délégable : un second chemin vers ' +
        `l’administration, hors de l’annuaire. Rendu : ${resume(anomalies)}`,
    );
  });

  test('une politique de SUPPRESSION qui apparaît est vue', async () => {
    /* Une délégation se révoque, elle ne s'efface pas : effacer effacerait la trace
     * d'un droit qui a EXISTÉ, et ce registre doit y répondre trois ans plus tard. */
    const anomalies = await anomaliesPendant([
      'create policy pol_delegations_droits_suppression on delegations_droits '
      + 'for delete using (true)',
    ]);
    assert.ok(
      nomme(anomalies, 'suppression_ouverte'),
      `Le registre des délégations passées deviendrait effaçable. Rendu : ${resume(anomalies)}`,
    );
  });

  test('la résolution ouverte à PUBLIC est vue', async () => {
    const anomalies = await anomaliesPendant([
      'grant execute on function f_delegations_actives(text) to public',
    ]);
    assert.ok(
      nomme(anomalies, 'definer_joignable_par_public'),
      'Une fonction « security definer » joignable par tous annule le cloisonnement ' +
        `qu’elle contourne légitimement (Q-136). Rendu : ${resume(anomalies)}`,
    );
  });

  test('la revue rendue AVEUGLE aux délégations est vue', async () => {
    /* Sans la colonne « source », la revue A.5.18 serait complète en apparence et
     * manquerait exactement les droits que personne n'a inscrits dans l'annuaire —
     * c'est-à-dire ceux que le produit accorde lui-même. Ce dispositif deviendrait
     * une porte dérobée, et une porte dérobée que la revue ne montre pas. */
    const anomalies = await anomaliesPendant([
      'alter table revue_habilitation_lignes drop column source cascade',
    ]);
    assert.ok(
      nomme(anomalies, 'revue_aveugle_aux_delegations'),
      `La revue des accès cesserait de voir les délégations. Rendu : ${resume(anomalies)}`,
    );
  });
});

describe('🛑 Ce que le donneur d’ordre impose MORD, et c’est ÉPROUVÉ — 070 et 071', () => {
  /* ⚠️ **Les seize mutations ci-dessous ont été jouées à la main sur une base jetable avant
   * d'être figées ici, et les seize mordent.** C'est la règle du `CONVENTIONS.md` §39 : un
   * garde-fou vert ne prouve rien tant qu'on ne l'a pas cassé. Et la moitié « non-bruit »
   * compte autant : un garde qui refuse tout serait vert aussi, et le produit serait mort. */

  test('le témoin : le schéma intact ne rend AUCUNE anomalie', async () => {
    const anomalies = await anomaliesPendant([]);
    assert.equal(anomalies.length, 0, `Schéma d’essai déjà en défaut : ${resume(anomalies)}`);
  });

  test('🛑 LE TRANSFERT HORS UNION cesse d’exiger sa garantie — vu (RGPD art. 46)', async () => {
    /* Le constat d'audit le plus fréquent. La mutation garde le NOM de la contrainte ET ses
     * littéraux, et ajoute « or true » : c'est exactement la forme qui passait au vert avant
     * que les gardes ÉPROUVENT (constat Q-312). */
    const anomalies = await anomaliesPendant([
      'alter table traitements_pour_client drop constraint ck_traitements_pour_client_transfert',
      'alter table traitements_pour_client add constraint ck_traitements_pour_client_transfert '
        + "check (transfert_hors_ue is null or btrim(transfert_hors_ue) = '' "
        + "or (transfert_garantie is not null and btrim(transfert_garantie) <> '') or true)",
    ]);
    assert.ok(
      nomme(anomalies, 'transfert_sans_garantie_admis'),
      'Le registre de l’article 30 §2 aurait l’air complet et documenterait une infraction '
        + `à l’article 46. Rendu : ${resume(anomalies)}`,
    );
  });

  test('CONTRE-TÉMOIN : un transfert AVEC sa garantie refusé est vu aussi', async () => {
    const anomalies = await anomaliesPendant([
      'alter table traitements_pour_client drop constraint ck_traitements_pour_client_transfert',
      'alter table traitements_pour_client add constraint ck_traitements_pour_client_transfert '
        + 'check (transfert_hors_ue is null)',
    ]);
    assert.ok(
      nomme(anomalies, 'transfert_legitime_refuse'),
      'Une contrainte qui refuse le cas nominal rend le registre impossible à tenir pour '
        + `tout client hors Union — pire que son absence. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 LE PLANCHER perd un niveau que les documents portent — vu', async () => {
    /* L'invariant que personne ne verrait autrement : si les deux vocabulaires divergent, le
     * plancher devient INSATISFIABLE, et le refus cite un niveau qui n'existe pas. Le garde
     * ne compare pas les deux TEXTES de contrainte — il les ÉPROUVE sur les mêmes valeurs. */
    const anomalies = await anomaliesPendant([
      'alter table clients drop constraint ck_clients_confidentialite_plancher',
      'alter table clients add constraint ck_clients_confidentialite_plancher '
        + "check (confidentialite_plancher is null or confidentialite_plancher in "
        + "('public', 'interne', 'confidentiel'))",
    ]);
    assert.ok(
      nomme(anomalies, 'plancher_refuse_un_niveau_de_document'),
      `Un client ne peut plus exiger un niveau que ses documents portent. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 et L’AUTRE MOITIÉ : les documents perdent un niveau que le plancher admet — vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint ck_documents_confidentialite',
      'alter table documents add constraint ck_documents_confidentialite '
        + "check (confidentialite in ('public', 'interne', 'confidentiel'))",
    ]);
    assert.ok(
      nomme(anomalies, 'document_refuse_un_niveau_de_plancher'),
      'Aucun document ne pourrait satisfaire ce plancher : le client verrait une exigence '
        + `contractuelle que le produit rend impossible à honorer. Rendu : ${resume(anomalies)}`,
    );
  });

  test('le plancher ouvert à n’importe quoi est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table clients drop constraint ck_clients_confidentialite_plancher',
      'alter table clients add constraint ck_clients_confidentialite_plancher check (true)',
    ]);
    assert.ok(
      nomme(anomalies, 'plancher_hors_vocabulaire_admis'),
      `Un plancher hors vocabulaire ne peut être comparé à rien. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un délai de notification de ZÉRO heure est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table clients drop constraint ck_clients_notification_incident',
      'alter table clients add constraint ck_clients_notification_incident '
        + 'check (notification_incident_h is null or notification_incident_h <= 720)',
    ]);
    assert.ok(
      nomme(anomalies, 'delai_nul_admis'),
      'L’échéance tomberait à l’instant de la détection : l’incident serait « en retard » '
        + `avant d’avoir été qualifié, et un indicateur toujours rouge n’est plus lu. Rendu : ${resume(anomalies)}`,
    );
  });

  test('la CLÉ vers le donneur d’ordre redevenue SIMPLE est vue', async () => {
    /* Une clé simple est satisfaite par une ligne d'une filiale voisine, que la RLS rend
     * invisible (§17.1) : le registre de l'article 30 §2 d'une filiale se rattacherait au
     * client d'une autre, et aucun écran ne le montrerait.
     * ⚠️ `not valid` : `add constraint` valide les lignes existantes, donc LIT une table
     *    cloisonnée — et la RLS forcée vaut aussi pour le propriétaire. */
    const anomalies = await anomaliesPendant([
      'alter table traitements_pour_client drop constraint fk_traitements_pour_client_client',
      'alter table traitements_pour_client add constraint fk_traitements_pour_client_client '
        + 'foreign key (client_id) references clients(id) on delete cascade not valid',
    ]);
    assert.ok(
      nomme(anomalies, 'cle_vers_le_client_non_composite'),
      `Le registre pourrait se rattacher au client d’une autre filiale. Rendu : ${resume(anomalies)}`,
    );
  });

  test('la CLÉ vers le prestataire redevenue SIMPLE est vue', async () => {
    const anomalies = await anomaliesPendant([
      'alter table client_sous_traitants drop constraint fk_client_sous_traitants_prestataire',
      'alter table client_sous_traitants add constraint fk_client_sous_traitants_prestataire '
        + 'foreign key (prestataire_id) references prestataires(id) on delete cascade not valid',
    ]);
    assert.ok(
      nomme(anomalies, 'cle_vers_le_prestataire_non_composite'),
      'Le dossier remis au client nommerait une société que cette filiale n’a jamais '
        + `contractée. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 L’ORDRE des niveaux de diffusion cesse d’être STRICT — vu', async () => {
    /* Deux niveaux de rang égal font qu'un document « interne » satisfait un plancher
     * « confidentiel » : le contrat s'affiche comme tenu et il ne l'est pas. */
    const anomalies = await anomaliesPendant([
      'create or replace function f_rang_confidentialite(p_niveau text) returns integer '
        + 'language sql immutable set search_path = pg_catalog, public, pg_temp as $f$ '
        + "select case p_niveau when 'public' then 1 when 'interne' then 2 "
        + "when 'confidentiel' then 2 when 'restreint' then 4 else null end; $f$",
    ]);
    assert.ok(
      nomme(anomalies, 'ordre_de_diffusion_non_strict'),
      `Un document « interne » satisferait un plancher « confidentiel ». Rendu : ${resume(anomalies)}`,
    );
  });

  test('un niveau HORS VOCABULAIRE qui reçoit un rang est vu', async () => {
    const anomalies = await anomaliesPendant([
      'create or replace function f_rang_confidentialite(p_niveau text) returns integer '
        + 'language sql immutable set search_path = pg_catalog, public, pg_temp as $f$ '
        + "select case p_niveau when 'public' then 1 when 'interne' then 2 "
        + "when 'confidentiel' then 3 when 'restreint' then 4 else 0 end; $f$",
    ]);
    assert.ok(
      nomme(anomalies, 'niveau_inconnu_range'),
      'Toute comparaison de plancher réussirait alors au hasard, au lieu d’échouer. '
        + `Rendu : ${resume(anomalies)}`,
    );
  });

  test('le DÉLAI CONTRACTUEL qui cesse de suivre son paramètre est vu', async () => {
    const anomalies = await anomaliesPendant([
      'create or replace function f_echeance_contractuelle(p_detecte_le timestamptz, '
        + 'p_date_detection date, p_delai_heures integer) returns table (regime text, '
        + 'palier text, reference text, echeance timestamptz, origine text) language sql '
        + 'immutable set search_path = pg_catalog, public, pg_temp as $f$ '
        + "select 'contractuel', 'notification_client', 'C', "
        + "coalesce(p_detecte_le, p_date_detection::timestamptz) + interval '48 hours', "
        + "'instant' where coalesce(p_detecte_le, p_date_detection::timestamptz) is not null "
        + 'and p_delai_heures is not null; $f$',
    ]);
    assert.ok(
      nomme(anomalies, 'delai_contractuel_faux'),
      `Le garde ÉPROUVE le calcul sur un instant témoin. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 une échéance calculée SANS délai convenu est vue', async () => {
    /* Une date que rien ne fonde — et c'est précisément celle qu'on ne peut pas montrer à
     * un client. La mutation retombe sur un défaut de 72 h, ce qu'un développeur pressé
     * écrirait en croyant bien faire. */
    const anomalies = await anomaliesPendant([
      'create or replace function f_echeance_contractuelle(p_detecte_le timestamptz, '
        + 'p_date_detection date, p_delai_heures integer) returns table (regime text, '
        + 'palier text, reference text, echeance timestamptz, origine text) language sql '
        + 'immutable set search_path = pg_catalog, public, pg_temp as $f$ '
        + "select 'contractuel', 'notification_client', 'C', "
        + 'coalesce(p_detecte_le, p_date_detection::timestamptz) + '
        + "make_interval(hours => coalesce(p_delai_heures, 72)), 'instant' "
        + 'where coalesce(p_detecte_le, p_date_detection::timestamptz) is not null; $f$',
    ]);
    assert.ok(
      nomme(anomalies, 'echeance_sans_delai_convenu'),
      `Le produit afficherait au client une date que rien ne fonde. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 le palier CONTRACTUEL glissé dans la fonction des échéances LÉGALES est vu', async () => {
    /* La propriété que la migration `071` PROMET, et la seule façon qu'elle a d'être fausse
     * est qu'un futur bien intentionné ajoute le palier client à la fonction de la loi. Le
     * délai d'un contrat se présenterait comme une obligation légale. */
    const anomalies = await anomaliesPendant([
      'create or replace function f_echeances_reglementaires(p_detecte_le timestamptz, '
        + 'p_date_detection date) returns table (regime text, palier text, reference text, '
        + 'echeance timestamptz, origine text) language sql immutable '
        + 'set search_path = pg_catalog, public, pg_temp as $f$ '
        + "select 'contractuel', 'notification_client', 'X', "
        + "coalesce(p_detecte_le, p_date_detection::timestamptz) + interval '24 hours', "
        + "'instant' where coalesce(p_detecte_le, p_date_detection::timestamptz) is not null; $f$",
    ]);
    assert.ok(
      nomme(anomalies, 'palier_contractuel_dans_la_loi'),
      `Le garde-fou des quatre paliers légaux devrait être désarmé pour l’accepter. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un document de portée GROUPE qui accepte un donneur d’ordre est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table documents drop constraint ck_documents_client_local',
      'alter table documents add constraint ck_documents_client_local check (true) not valid',
    ]);
    assert.ok(
      nomme(anomalies, 'document_groupe_avec_client'),
      'Un donneur d’ordre est toujours local : la clé composite ne vérifierait alors RIEN '
        + `(MATCH SIMPLE, §45). Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 une notification contractuelle SANS destinataire est vue', async () => {
    const anomalies = await anomaliesPendant([
      'alter table declarations_reglementaires drop constraint ck_declarations_reg_destinataire',
      'alter table declarations_reglementaires add constraint ck_declarations_reg_destinataire '
        + 'check (true) not valid',
    ]);
    assert.ok(
      nomme(anomalies, 'notification_contractuelle_sans_destinataire')
        || nomme(anomalies, 'declaration_autorite_avec_client'),
      'La ligne dirait « nous avons prévenu quelqu’un » sans dire qui, et le dossier '
        + `compterait la notification comme faite. Rendu : ${resume(anomalies)}`,
    );
  });

  test('un « rapport final » sous le régime contractuel est vu', async () => {
    const anomalies = await anomaliesPendant([
      'alter table declarations_reglementaires drop constraint '
        + 'ck_declarations_reglementaires_coherence',
      'alter table declarations_reglementaires add constraint '
        + 'ck_declarations_reglementaires_coherence check (true) not valid',
    ]);
    assert.ok(
      nomme(anomalies, 'palier_etranger_au_regime_contractuel'),
      `Le tableau de conformité afficherait un palier que le contrat ne prévoit pas. Rendu : ${resume(anomalies)}`,
    );
  });

  test('🛑 le déclencheur du plancher devenu IMMÉDIAT est vu', async () => {
    /* Le différé n'est pas un confort : immédiat, il refuse une reprise « remplacer »
     * parfaitement saine dont l'ordre d'insertion place le document avant le client. C'est
     * la classe des constats Q-194, Q-280 et Q-284 — *restaurer une sauvegarde gagne.*
     * ⚠️ Et le garde mesure `tgtype`, pas l'existence (constat Q-281). */
    const anomalies = await anomaliesPendant([
      'drop trigger trg_documents_plancher_client on documents',
      'create constraint trigger trg_documents_plancher_client after insert or update of '
        + 'client_id, confidentialite, filiale_id on documents for each row '
        + 'execute function f_document_respecte_le_plancher()',
    ]);
    assert.ok(
      nomme(anomalies, 'declencheur_du_plancher_absent_ou_immediat'),
      `Une reprise « remplacer » saine serait refusée. Rendu : ${resume(anomalies)}`,
    );
  });

  test('le déclencheur du plancher RETIRÉ est vu aussi', async () => {
    const anomalies = await anomaliesPendant([
      'drop trigger trg_clients_plancher_tenu on clients',
    ]);
    assert.ok(
      nomme(anomalies, 'declencheur_du_plancher_absent_ou_immediat'),
      'Sans lui, relever un plancher afficherait au client une exigence que le produit ne '
        + `tient pas — et le dossier l’affirmerait. Rendu : ${resume(anomalies)}`,
    );
  });
});
