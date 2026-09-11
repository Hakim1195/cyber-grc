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
