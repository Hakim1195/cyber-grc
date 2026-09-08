/**
 * enumerations.test.mjs — **les vingt et une énumérations de la reprise, confrontées
 * au schéma.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe : un défaut trouvé en écrivant le lot L16
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/reprise/index.ts` valide chaque champ énuméré d'un export `grc-backup`
 * contre une liste de valeurs **écrite à la main**. C'est le bon outil
 * (`CLAUDE.md` §3) : une valeur absente fait **échouer bruyamment** une reprise,
 * jamais réussir en silence. Mais la règle exige alors de **figer la liste à deux
 * endroits qui la comparent au réel** — et le second endroit n'existait pas.
 *
 * Il a manqué exactement une fois, et de la pire manière : la migration `019`
 * (action D5) ajoute « en validation » à `ck_documents_statut`, et cette liste-là
 * ne l'a pas su. **Rien ne l'aurait dit avant qu'un exploitant restaure un export
 * parfaitement légitime et se le voie refuser** — c'est-à-dire au moment où l'on a
 * le moins envie d'un défaut. Le défaut n'était ni dans la migration ni dans la
 * reprise : il vivait **entre les deux**, motif que ce chantier a rencontré plus
 * de dix fois.
 *
 * ── Comment la confrontation est faite, et pourquoi pas autrement ────────
 *
 * On ne recopie **aucune** correspondance collection → table → colonne : elle
 * serait une troisième liste à tenir, avec ses alias (`version` → `version_document`),
 * et son omission rendrait une énumération non gardée **en silence** — soit très
 * exactement le défaut qu'on ferme.
 *
 * On **découvre** donc dans `pg_constraint` : pour chaque énumération, on cherche
 * les `check` du schéma dont l'ensemble de littéraux **recoupe** le sien.
 *
 *   · un `check` dont l'ensemble est **égal** → l'énumération est à jour ;
 *   · un `check` qui **recoupe sans être égal** → c'est la dérive, et c'est ce
 *     qu'on refuse. Le message dit ce qui manque de chaque côté ;
 *   · **aucun recoupement** → l'énumération ne décrit rien du schéma serveur. Le
 *     cas existe (des valeurs propres au modèle du navigateur) ; il est **épinglé**
 *     ci-dessous, de sorte qu'une énumération orpheline de plus soit bruyante.
 *
 * ⚠️ **Ce que ce contrôle ne fait pas** (§17.5) : il ne prouve pas que le `check`
 * trouvé est bien *celui* de la colonne visée. Deux colonnes du schéma peuvent
 * porter le même vocabulaire — c'est le cas des quatre statuts de conformité, et
 * des deux colonnes de déclaration d'incident. Ce n'est pas gênant pour ce qu'il
 * garde : la **dérive** fait échouer l'égalité, quelle que soit la colonne
 * trouvée.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';

const { DESCRIPTIONS } = await moduleCompile('reprise/index.js');

/**
 * Les énumérations qui ne décrivent **aucun** `check` du schéma serveur.
 *
 * Liste écrite à la main **et c'est le bon outil** : une énumération orpheline de
 * plus fait rougir ce fichier, et quelqu'un doit dire si c'est normal. La liste
 * inverse — les énumérations *exemptées* du contrôle — serait le mauvais outil,
 * puisque son incomplétude passerait inaperçue.
 */
const SANS_CONTREPARTIE = Object.freeze([]);

let base;
let proprietaire;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
});
after(async () => {
  await base?.fermer();
});

/** Tous les `check` du schéma, avec l'ensemble de leurs littéraux. */
async function checksDuSchema() {
  const lignes = await base.lignes(
    proprietaire,
    `select c.conname as nom,
            t.relname as table_,
            pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'c' and n.nspname = 'public'`,
  );
  return lignes.map((l) => ({
    nom: l.nom,
    table: l.table_,
    valeurs: new Set([...l.definition.matchAll(/'((?:[^']|'')*)'/gu)].map((m) => m[1].replace(/''/gu, "'"))),
  }));
}

const memeEnsemble = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));

describe('Les énumérations de la reprise disent le schéma', () => {
  test('LA MATIÈRE : le catalogue est là, et il porte des énumérations', () => {
    const total = Object.values(DESCRIPTIONS).reduce((n, d) => n + d.enumerations.length, 0);
    assert.ok(
      total >= 20,
      `Seulement ${String(total)} énumération(s) : le catalogue de reprise n’a pas été lu, ` +
        'et ce fichier mesurerait le vide.',
    );
  });

  test('AUCUNE DÉRIVE entre une liste écrite à la main et le « check » du schéma', async () => {
    const checks = await checksDuSchema();
    const derives = [];
    const orphelines = [];

    for (const [collection, description] of Object.entries(DESCRIPTIONS)) {
      for (const enumeration of description.enumerations) {
        const attendues = new Set(enumeration.valeurs);
        const recoupants = checks.filter((c) => [...attendues].some((v) => c.valeurs.has(v)));
        if (recoupants.length === 0) {
          orphelines.push(`${collection}.${enumeration.champ}`);
          continue;
        }
        if (recoupants.some((c) => memeEnsemble(attendues, c.valeurs))) continue;

        // Le plus proche : celui qui partage le plus de valeurs. C'est celui dont
        // l'écart est le plus instructif.
        const proche = recoupants
          .map((c) => ({ c, communes: [...attendues].filter((v) => c.valeurs.has(v)).length }))
          .sort((a, b) => b.communes - a.communes)[0].c;
        const manquantesIci = [...proche.valeurs].filter((v) => !attendues.has(v));
        const manquantesLa = [...attendues].filter((v) => !proche.valeurs.has(v));
        derives.push(
          `${collection}.${enumeration.champ} ↔ ${proche.table}.${proche.nom} : ` +
            `la reprise ignore [${manquantesIci.join(', ')}]` +
            (manquantesLa.length ? ` ; le schéma ignore [${manquantesLa.join(', ')}]` : ''),
        );
      }
    }

    assert.deepEqual(
      derives,
      [],
      'Une valeur admise par le schéma et inconnue de la reprise ne se voit PAS à ' +
        'l’écriture : elle fera REFUSER un export parfaitement légitime, au moment où ' +
        'quelqu’un restaure. C’est le défaut que la migration 019 a introduit et que ce ' +
        'contrôle existe pour empêcher.\n' +
        derives.map((d) => `    · ${d}`).join('\n'),
    );

    assert.deepEqual(
      orphelines,
      [...SANS_CONTREPARTIE],
      'Une énumération de la reprise ne correspond à aucun « check » du schéma. Ce n’est ' +
        'pas forcément une faute — le modèle du navigateur peut porter des valeurs que le ' +
        'serveur ne contraint pas —, mais quelqu’un doit le dire, et l’inscrire dans ' +
        'SANS_CONTREPARTIE avec son motif.',
    );
  });

  test('MORSURE : le contrôle voit une dérive qu’on lui pose', async () => {
    /* ⚠️ Sans ce bloc, le précédent serait vert sur un lecteur qui ne trouve
       jamais rien — et c'est l'exacte forme de décor que ce chantier traque :
       « la question utile n'est pas est-ce que ça passe, c'est qu'est-ce qui
       passerait aussi ». On retire une valeur d'un `check` réel et l'on exige que
       la comparaison la voie. */
    const checks = await checksDuSchema();
    const documents = checks.find((c) => c.nom === 'ck_documents_statut');
    assert.ok(documents, 'ck_documents_statut doit exister : sans elle, ce fichier ne prouve rien');
    assert.ok(
      documents.valeurs.has('en validation'),
      'Le « check » du schéma n’admet plus « en validation » : la migration 019 a-t-elle ' +
        'été défaite ?',
    );

    const ampute = { ...documents, valeurs: new Set([...documents.valeurs]) };
    ampute.valeurs.delete('en validation');
    const attendues = new Set(DESCRIPTIONS.documents.enumerations[0].valeurs);
    assert.equal(
      memeEnsemble(attendues, ampute.valeurs),
      false,
      'Une valeur retirée du « check » laisse la comparaison ÉGALE : le contrôle ne compare ' +
        'rien, et le bloc précédent est un décor.',
    );
    assert.equal(memeEnsemble(attendues, documents.valeurs), true);
  });
});
