/**
 * migrations-sur-donnees.test.mjs — **une migration de reprise se joue sur des
 * DONNÉES, jamais sur une base vide.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe — le 16/09/2026, et ça a coûté un déploiement
 * ════════════════════════════════════════════════════════════════════════
 *
 * La migration `038` a été livrée avec **2 031 essais verts**, `verifier-types`
 * propre, et un §0 qui posait un réglage de session **QUI N'EXISTE PAS** —
 * `grc.filiales_lecture` au lieu de `grc.filiales`. Le déploiement l'a refusée
 * en `GRC04` sur la recette, dans la minute.
 *
 * ⚠️ **Le banc ne pouvait pas le voir, et la raison est structurelle** :
 * `ouvrirBaseEssai()` applique TOUTES les migrations sur une base **vide**, puis
 * sème. Une migration qui reprend des données existantes n'en rencontre donc
 * jamais — et les politiques RLS, qui sont évaluées par le scan, ne décident de
 * rien quand il n'y a rien à scanner. **Tout le §2 d'une migration de reprise
 * échappait au banc.**
 *
 * Deux défauts distincts vivaient là, et le second est plus profond que le
 * premier :
 *
 *  1. le **périmètre de LECTURE** mal nommé — une faute de frappe, que n'importe
 *     quelle ligne de données aurait révélée ;
 *  2. le **périmètre d'ÉCRITURE**, qui ne peut PAS être « tout le groupe » : la
 *     politique d'ajout n'admet que la filiale ACTIVE, et il n'y en a qu'une à la
 *     fois. Une reprise qui insère pour vingt filiales d'un seul `insert` est
 *     refusée — non parce qu'elle est massive, mais parce qu'elle prétend écrire
 *     chez les voisins. La `038` boucle donc sur les filiales.
 *
 * ── CE QUE CETTE FAMILLE MESURE ─────────────────────────────────────────
 *
 * Elle monte une base **arrêtée à la migration précédente**, la SÈME — donc avec
 * des pièces jointes dans **deux filiales distinctes** —, puis applique la
 * migration de reprise par le **vrai `db/migrate.mjs`**. C'est le geste exact du
 * déploiement, et c'est le seul montage du banc où il a lieu.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';

/**
 * La migration éprouvée, et celle où l'on s'arrête d'abord.
 *
 * ⚠️ Écrites à la main **à dessein** (`CLAUDE.md` §3, cas (b)) : ce sont des
 * valeurs qu'un humain doit choisir. Le jour où une `039` reprend des données à
 * son tour, le bon geste est d'ajouter un `describe` ici — pas de rendre la
 * découverte automatique pour que le fichier cesse de vieillir. Une famille qui
 * s'adapte toute seule cesse de poser la question.
 */
const AVANT = '037';

/**
 * Les deux filiales et les quelques lignes que la reprise doit rencontrer.
 *
 * ⚠️ **On N'EMPLOIE PAS `semerJeuEssai()` ici, et c'est structurel.** Le semis
 * partagé écrit dans TOUTES les tables du schéma — y compris celles qu'une
 * migration postérieure à `AVANT` n'a pas encore créées. Le jour où une `039`
 * est arrivée, ce fichier a rougi pour cette raison exacte, et pas pour celle
 * qu'il mesure. Un essai qui se périme à chaque migration suivante est un essai
 * qu'on finit par ajuster sans le lire.
 *
 * Le semis est donc MINIMAL : ce que la `038` reprend, et rien d'autre — des
 * pièces jointes, dans deux filiales.
 */
async function semerLeStrictNecessaire() {
  const client = await base.connexion('app');
  // ⚠️ `avecPerimetre(..., true)` — le quatrième argument est
  // `administrationGroupe`, et sans lui l'écriture dans `filiales` est refusée en
  // 42501 : sa politique est réservée à l'administration Groupe (migration `007`,
  // constat M-2 de la porte S1). Le fonctionnement courant n'écrit pas là.
  await base.avecPerimetre(
    client,
    perimetre('semeur', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'TLS', 'Filiale de Toulouse', 'FR'),
             ($2, 'DEU', 'Filiale allemande',   'DE')`,
        [FILIALE_A, FILIALE_B],
      );
    },
    { annuler: false },
  );

  // ⚠️ Une filiale à la fois, comme la reprise elle-même : la politique d'écriture
  // n'admet que la filiale ACTIVE, et c'est précisément la contrainte que la `038`
  // a dû apprendre. Un semis qui l'ignorerait n'éprouverait pas ce qu'il prétend.
  for (const [filiale, suffixe] of [
    [FILIALE_A, 'A'],
    [FILIALE_B, 'B'],
  ]) {
    await base.avecPerimetre(
      client,
      perimetre('semeur', filiale, [filiale]),
      async (c) => {
        await c.query(
          `insert into risques (id, filiale_id, nom) values ($1, $2, 'Rançongiciel')`,
          [`RISK-${suffixe}`, filiale],
        );
        const empreinte = suffixe.toLowerCase().repeat(64).slice(0, 64);
        await c.query(
          `insert into pieces_jointes (id, filiale_id, entite_type, entite_id, nom_fichier,
                                       type_mime, taille_octets, sha256, chemin_stockage)
               values ($1, $2, 'risques', $3, 'analyse.pdf', 'application/pdf', 4096, $4, $5)`,
          [`PJ-${suffixe}`, filiale, `RISK-${suffixe}`, empreinte, `ab/${empreinte}`],
        );
      },
      { annuler: false },
    );
  }
}

let base;
let proprietaire;
let applicatif;

before(async () => {
  // ⚠️ `jusquA` — la base s'arrête AVANT la migration qu'on éprouve. Sans cela,
  // elle serait déjà appliquée, et le reste de ce fichier mesurerait une
  // migration idempotente qui ne fait rien.
  base = await ouvrirBaseEssai(import.meta.url, { jusquA: AVANT });
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  await semerLeStrictNecessaire();
});

after(async () => {
  await base?.fermer();
});

/** Lecture sous le périmètre d'une filiale. */
async function enBase(texte, valeurs = [], filiale = FILIALE_A) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', filiale, [filiale]),
    async (c) => (await c.query(texte, valeurs)).rows,
  );
}

/**
 * Lecture sous le périmètre des DEUX filiales.
 *
 * ⚠️ **Le propriétaire n'y échappe pas** : la RLS est FORCÉE, et une lecture sans
 * périmètre lève `GRC04` même sous `grc_proprietaire`. C'est précisément ce qui
 * rend la règle du `CONVENTIONS.md` §41 nécessaire — et ce que cet essai a
 * rencontré en premier, sur sa propre requête de contrôle.
 */
async function surLeGroupe(texte, valeurs = []) {
  return await base.avecPerimetre(
    applicatif,
    perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B]),
    async (c) => (await c.query(texte, valeurs)).rows,
  );
}

describe('La migration 038 se joue sur une base DÉJÀ PEUPLÉE', () => {
  test('LA MATIÈRE : des pièces existent, dans DEUX filiales, et la table n’existe pas encore', async () => {
    // Sans cette moitié, « la migration passe » serait vrai d'une base où il n'y
    // a rien à reprendre — c'est-à-dire du montage qui a laissé passer le défaut.
    const pieces = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A, FILIALE_B]),
      async (c) =>
        (await c.query('select filiale_id, count(*)::int as n from pieces_jointes group by 1 order by 1'))
          .rows,
    );
    assert.equal(
      pieces.length,
      2,
      `La reprise doit rencontrer des pièces dans DEUX filiales, sans quoi la politique ` +
        `d’écriture n’a rien à refuser. Trouvé : ${JSON.stringify(pieces)}`,
    );
    for (const ligne of pieces) assert.ok(ligne.n > 0);

    const table = await base.lignes(
      proprietaire,
      "select to_regclass('public.piece_rattachements') is null as absente",
    );
    assert.equal(table[0].absente, true, `La base d’essai doit être arrêtée à la ${AVANT}.`);
  });

  test('LA REPRISE PASSE, et elle rattache CHAQUE pièce des DEUX filiales', async () => {
    // Le geste du déploiement, à l'identique : le vrai `db/migrate.mjs`, sur la
    // base peuplée. Une exception ici est un déploiement refusé sur la recette.
    await base.migrer();

    const compte = await surLeGroupe(
      `select (select count(*) from pieces_jointes)::int       as pieces,
              (select count(*) from piece_rattachements)::int  as rattachements,
              (select count(*) from pieces_jointes p
                where not exists (select 1 from piece_rattachements r
                                   where r.piece_id = p.id and r.filiale_id = p.filiale_id
                                     and r.entite_type = p.entite_type
                                     and r.entite_id = p.entite_id))::int as sans_rattachement`,
    );
    assert.equal(
      compte[0].sans_rattachement,
      0,
      'Des pièces existantes n’ont PAS été reprises : elles seraient délivrées à une adresse ' +
        'que la clé fk_pieces_jointes_adresse n’admet pas, et la suppression de leur porteur ' +
        'cesserait de les retirer (Q-232 / Q-233 rouverts par la reprise elle-même).',
    );
    assert.equal(compte[0].rattachements, compte[0].pieces);
    assert.ok(compte[0].pieces > 0);

    // Et les DEUX filiales sont servies : une reprise qui n'aurait posé que la
    // filiale active aurait laissé l'autre derrière, en silence.
    const parFiliale = await surLeGroupe(
      'select filiale_id, count(*)::int as n from piece_rattachements group by 1 order by 1',
    );
    assert.equal(
      parFiliale.length,
      2,
      `La reprise n’a servi qu’une filiale : ${JSON.stringify(parFiliale)}. La politique ` +
        'd’ajout n’admet que la filiale ACTIVE — la migration doit les parcourir.',
    );
  });

  test('LE SCHÉMA EST SAIN, et le garde-fou neuf est joué SANS périmètre', async () => {
    // ⚠️ La moitié qui a manqué : `install.sh` appelle `f_verifier_schema()` dans
    // une transaction SANS périmètre. Un garde qui lirait une table cloisonnée y
    // lèverait GRC04 — c'est la règle du `CONVENTIONS.md` §41, et elle se vérifie
    // ici, sur la connexion du propriétaire, hors de tout `avecPerimetre`.
    const anomalies = await base.lignes(proprietaire, 'select * from f_verifier_schema()');
    assert.deepEqual(anomalies, []);

    const consigne = await base.lignes(
      proprietaire,
      "select count(*)::int as n from controles_schema where fonction = 'f_verifier_rattachements_pieces'",
    );
    assert.equal(consigne[0].n, 1);
  });

  test('L’INVARIANT VAUT AUSSI POUR LES LIGNES REPRISES', async () => {
    // Une reprise peut poser les lignes et laisser l'invariant faux : la clé
    // étrangère est différée, donc elle a été vérifiée AU COMMIT de la migration.
    // On le redit ici depuis l'application, sur une pièce du semis — c'est-à-dire
    // sur une ligne que la migration n'a pas créée, seulement rattachée.
    const porteurs = await enBase(
      'select entite_type, entite_id from piece_rattachements where piece_id = $1',
      ['PJ-A'],
    );
    assert.deepEqual(porteurs, [{ entite_type: 'risques', entite_id: 'RISK-A' }]);
  });
});
