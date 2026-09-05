/**
 * direction-voit-le-groupe.test.mjs — **le profil qui EXISTE, que voit-il ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat **Q-181**, laissé à l'arbitrage puis tranché le 05/09/2026
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le lot L4 a livré `/api/consolidation` et l'écran `#/groupe` : la vision
 * consolidée, **destinée à la Direction** (`PLAN_SERVEUR` §3.1). La route lit
 * sept familles et rend `null` — jamais zéro — pour un domaine que la session
 * ne peut pas lire. C'est le bon comportement.
 *
 * Le profil `DIRECTION` semé par la migration `007` n'en portait aucune, hors
 * la conformité. L'écran bâti pour la Direction lui affichait donc « — » sur
 * les risques, les incidents, le plan d'actions, les documents, les actifs et
 * les audits — c'est-à-dire sur presque tout ce qu'examine une revue de
 * direction ISO 27001.
 *
 * ⚠️ **Pourquoi le banc ne pouvait pas le voir**, et c'est la leçon utile :
 * les essais de consolidation **montent leurs propres droits**. Ils vérifient
 * que la route respecte les droits qu'on lui donne — ce qu'elle fait — et ne
 * posent jamais la question *« et le profil que l'installation SÈME, que
 * voit-il ? »*. Un essai qui fabrique ses conditions ne mesure pas le produit
 * livré.
 *
 * ── Ce que cet essai tient, et comment ──────────────────────────────────
 *
 * La règle est : **le profil doit couvrir exactement ce que l'écran qui lui est
 * destiné agrège.** Les familles ne sont donc PAS recopiées ici — elles sont
 * DÉCOUVERTES dans `src/consolidation/index.ts`, sur les lignes `lisibles.has(…)`
 * qui décident du `null`. Une huitième famille ajoutée à la route fera rougir
 * cet essai tant que le profil ne la porte pas.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { compilerSiNecessaire, RACINE_BACKEND } from '../aide/serveur.mjs';

let base;
let proprietaire;
// ⚠️ Import DYNAMIQUE : `dist/` n'est pas suivi en Git, et le garde-fou du
// constat Q-52 refuse tout import relatif STATIQUE vers un fichier absent du
// commit — vert chez son auteur, rouge sur une machine neuve.
let DOMAINE_PAR_ENTITE;
let DOMAINE_API_PAR_DOMAINE_BASE;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  await compilerSiNecessaire();
  ({ DOMAINE_PAR_ENTITE } = await import(
    `file://${join(RACINE_BACKEND, 'dist', 'api', 'droits.js')}`
  ));
  ({ DOMAINE_API_PAR_DOMAINE_BASE } = await import(
    `file://${join(RACINE_BACKEND, 'dist', 'droits', 'passerelle-api.js')}`
  ));
});

after(async () => {
  await base?.fermer();
});

/** Les familles dont `/api/consolidation` fait dépendre un `null`. Découvertes. */
function famillesDeLaConsolidation() {
  const source = readFileSync(join(RACINE_BACKEND, 'src', 'consolidation', 'index.ts'), 'utf8');
  const corps = source.slice(source.indexOf('const lisibles = entitesLisibles'));
  return [...new Set([...corps.matchAll(/lisibles\.has\('([a-z_]+)'\)/gu)].map((m) => m[1]))];
}

/** Les domaines que porte le profil semé, lus EN BASE. */
async function domainesDuProfil(code) {
  const { rows } = await base.avecPerimetre(
    proprietaire,
    perimetre('temoin', FILIALE_A, [FILIALE_A], true),
    async (c) =>
      await c.query(
        `select d.domaine, d.niveau from profil_domaines d
           join profils p on p.id = d.profil_id
          where p.code = $1 order by d.domaine`,
        [code],
      ),
  );
  return rows;
}

describe('Q-181 — le profil DIRECTION couvre ce que la vision Groupe agrège', () => {
  test('LA MATIÈRE : la route fait bien dépendre plusieurs familles des droits', () => {
    // Sans cette moitié, une route dont on aurait retiré les gardes rendrait
    // cet essai vert en ne demandant plus rien.
    const familles = famillesDeLaConsolidation();
    assert.ok(
      familles.length >= 6,
      `Seulement ${String(familles.length)} famille(s) découverte(s) dans la route : le ` +
        'balayage ne trouve plus les `lisibles.has(…)`, et tout ce qui suit serait vert ' +
        'pour rien.',
    );
  });

  test('chaque famille agrégée est LISIBLE par le profil semé à l’installation', async () => {
    const rows = await domainesDuProfil('DIRECTION');
    assert.ok(rows.length > 0, 'Le profil DIRECTION doit exister et porter des domaines.');

    // Projection base → API, par la table du produit (jamais recopiée ici).
    const projetes = new Set(
      rows.map((r) => DOMAINE_API_PAR_DOMAINE_BASE[r.domaine]).filter((d) => d != null),
    );

    const aveugles = famillesDeLaConsolidation().filter(
      (famille) => !projetes.has(DOMAINE_PAR_ENTITE[famille]),
    );
    assert.deepEqual(
      aveugles,
      [],
      'La vision Groupe affichera « — » sur ces familles pour la Direction, alors que ' +
        'l’écran est bâti pour elle :\n' +
        aveugles.map((f) => `    · ${f} (domaine « ${DOMAINE_PAR_ENTITE[f]} »)`).join('\n') +
        '\nSoit le profil doit porter le domaine, soit la route ne doit pas agréger la ' +
        'famille. Un écran qui montre un tiret à celui pour qui il est fait est un écran ' +
        'qui ment poliment.',
    );
  });

  test('LA BORNE : la Direction reste en LECTURE, et n’a gagné aucun domaine sensible', async () => {
    // Le contrôle symétrique. Sans lui, « donner tous les domaines à DIRECTION »
    // satisferait l'essai précédent — et ce serait un sur-octroi silencieux, la
    // figure exacte du commentaire de `passerelle-api.ts` sur « imports ».
    const rows = await domainesDuProfil('DIRECTION');
    assert.deepEqual(
      rows.filter((r) => r.niveau !== 'lecture'),
      [],
      'La Direction consulte ; elle ne saisit pas. Un niveau au-dessus de « lecture » ici ' +
        'est un droit d’écriture accordé sans que personne l’ait demandé.',
    );

    const interdits = ['journal', 'droits', 'parametres', 'filiales', 'rgpd', 'personnel'];
    assert.deepEqual(
      rows.map((r) => r.domaine).filter((d) => interdits.includes(d)),
      [],
      'Ces domaines ne relèvent pas d’une vision consolidée : le journal appartient à ' +
        'l’ADMIN, le registre RGPD au DPO, et l’annuaire n’est pas un indicateur de ' +
        'pilotage. Élargir « pour faire bonne mesure » est exactement ce que refuse le ' +
        'commentaire de « imports » dans passerelle-api.ts.',
    );
  });
});
