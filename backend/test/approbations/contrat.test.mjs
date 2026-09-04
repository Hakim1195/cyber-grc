/**
 * contrat.test.mjs — **ce que le lot L8 recopie de la base, confronté à la base.**
 *
 * `CONVENTIONS.md` §33.3 : *« tout est déjà en base, y compris l'irréversibilité »*,
 * et *« la liste exacte des étapes et des statuts admis est là, et elle fait
 * foi »*. Le module de circuit recopie donc trois `check` et deux statuts lus
 * dans un déclencheur. Le `CLAUDE.md` §3 autorise une liste écrite à la main
 * **quand son omission est bruyante** — c'est le cas ici — mais il exige alors
 * qu'elle soit *« figée à deux endroits qui la comparent au réel »*.
 *
 * Ce fichier est le second endroit. Il lit `pg_catalog`, dans les **deux sens** :
 * une valeur qui manque au module comme une valeur que le module invente font
 * échouer l'essai.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { monterApprobations, profil, SessionDEssai, sessionSite } from './aide.mjs';

const RACINE_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'approbations');

let base;
let serveur;
let proprietaire;
/** @type {typeof import('../../src/approbations/circuit.js')} */
let circuit;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, await base.connexion('app'));
  circuit = await moduleCompile('approbations/circuit.js');
  serveur = await monterApprobations(
    base,
    new SessionDEssai(sessionSite(FILIALE_A), profil('validation')),
  );
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Valeurs littérales d'un `check`, lues dans sa définition rendue par PostgreSQL. */
async function valeursDuCheck(nom) {
  const definition = await base.valeur(
    proprietaire,
    'select pg_get_constraintdef(oid) from pg_constraint where conname = $1',
    [nom],
  );
  assert.ok(
    typeof definition === 'string' && definition.length > 0,
    `Contrainte « ${nom} » introuvable : le balayage ne mesure rien.`,
  );
  return [...definition.matchAll(/'([^']+)'/gu)].map((m) => m[1]).sort();
}

/* =====================================================================
 *  §1 — Le vocabulaire vient de la base, dans les deux sens
 * ===================================================================== */

describe('Le vocabulaire du circuit est celui de 001_socle.sql', () => {
  test('les trois objets sont exactement ceux de ck_approbations_objet', async () => {
    assert.deepEqual([...circuit.OBJETS].sort(), await valeursDuCheck('ck_approbations_objet'));
  });

  test('les sept étapes sont exactement celles de ck_approbations_etape', async () => {
    assert.deepEqual([...circuit.ETAPES].sort(), await valeursDuCheck('ck_approbations_etape'));
  });

  test('les cinq statuts sont exactement ceux de ck_approbations_statut', async () => {
    assert.deepEqual([...circuit.STATUTS].sort(), await valeursDuCheck('ck_approbations_statut'));
  });

  test('MORSURE : le lecteur de catalogue verrait un écart', async () => {
    // Un balayage qui rendrait toujours la même chose déclarerait vertes trois
    // listes fausses. On lui donne une contrainte dont on connaît le contenu et
    // qui n'est PAS l'une des trois.
    const documents = await valeursDuCheck('ck_documents_statut');
    assert.deepEqual(documents, ['brouillon', 'en vigueur', 'obsolète', 'à réviser']);
    assert.notDeepEqual(documents, [...circuit.STATUTS].sort());
  });

  test('les étapes des trois circuits appartiennent toutes au check', () => {
    const admises = new Set(circuit.ETAPES);
    for (const [objet, etapes] of Object.entries(circuit.CIRCUITS)) {
      assert.ok(etapes.length >= 2, `Circuit « ${objet} » suspect : ${JSON.stringify(etapes)}`);
      for (const etape of etapes) {
        assert.ok(admises.has(etape), `« ${etape} » (circuit ${objet}) n’est pas au check.`);
      }
    }
    // Les sept étapes du check sont TOUTES employées : une étape admise par la
    // base et par aucun circuit serait une étape que personne ne peut franchir.
    const employees = new Set(Object.values(circuit.CIRCUITS).flat());
    assert.deepEqual([...employees].sort(), [...circuit.ETAPES].sort());
  });

  test('les circuits sont ceux du PLAN_SERVEUR §3.5, dans cet ordre', () => {
    assert.deepEqual(circuit.CIRCUITS.document, ['redaction', 'revue', 'approbation', 'publication']);
    assert.deepEqual(circuit.CIRCUITS.risque, ['proposition', 'acceptation']);
    assert.deepEqual(circuit.CIRCUITS.audit, ['redaction', 'validation']);
  });
});

/* =====================================================================
 *  §2 — L'irréversibilité est LUE dans le déclencheur, pas décidée ici
 * ===================================================================== */

describe('Les statuts irréversibles sont ceux que le déclencheur verrouille', () => {
  test('f_approbations_verrou_decision() nomme « approuve » et « refuse », et rien d’autre', async () => {
    const source = await base.valeur(
      proprietaire,
      "select prosrc from pg_proc where proname = 'f_approbations_verrou_decision'",
    );
    assert.ok(typeof source === 'string' && source.includes('raise exception'));
    for (const statut of circuit.STATUTS_TRANCHES) {
      assert.ok(source.includes(`'${statut}'`), `Le déclencheur ne verrouille pas « ${statut} ».`);
    }
    // Le commentaire de la fonction le dit en toutes lettres : « Une étape
    // "annule" reste modifiable : elle n'a rien tranché. » On le vérifie plutôt
    // que de le croire.
    for (const statut of circuit.STATUTS.filter((s) => !circuit.STATUTS_TRANCHES.includes(s))) {
      assert.ok(
        !source.includes(`'${statut}'`),
        `« ${statut} » apparaît dans le verrou : la liste des statuts tranchés est fausse.`,
      );
    }
  });

  test('le déclencheur est armé en « always » — il vaut aussi contre le propriétaire', async () => {
    const etat = await base.valeur(
      proprietaire,
      `select t.tgenabled from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
        where c.relname = 'approbations' and t.tgname = 'trg_approbations_verrou'`,
    );
    // 'A' = ENABLE ALWAYS ; 'O' serait « origine seulement », donc désarmé pour
    // une session de réplication ET conservé pour le propriétaire — la nuance
    // vaut d'être mesurée plutôt que déduite du texte de la migration.
    assert.equal(etat, 'A');
  });
});

/* =====================================================================
 *  §3 — Les déclarations de route, lues chez Fastify
 * ===================================================================== */

describe('Les routes déclarent ce qu’elles exigent', () => {
  test('deux routes, et leurs déclarations sont celles du lot', () => {
    const parCle = Object.fromEntries(
      serveur.routes
        .filter((r) => r.methode === 'GET' || r.methode === 'POST')
        .map((r) => [`${r.methode} ${r.url}`, { acces: r.acces, niveauMinimal: r.niveauMinimal }]),
    );
    assert.deepEqual(parCle, {
      'GET /api/approbations/:entite/:entiteId': {
        acces: { action: 'lire', domaine: 'selon-entite' },
        niveauMinimal: undefined,
      },
      'POST /api/approbations/:entite/:entiteId': {
        acces: { action: 'ecrire', domaine: 'selon-entite' },
        niveauMinimal: 'validation',
      },
    });
  });

  test('AUCUNE écriture n’est servie sans exiger le niveau « validation »', () => {
    // Découvert, jamais récité : une route d'écriture ajoutée demain sans
    // `niveauMinimal` est nommée ici. C'est la forme du contrôle S6 appliquée au
    // troisième axe : le défaut par défaut est fermé.
    const sansNiveau = serveur.routes
      .filter((r) => r.acces?.action === 'ecrire' || r.acces?.action === 'administrer')
      .filter((r) => r.niveauMinimal === undefined)
      .map((r) => `${r.methode} ${r.url}`);
    assert.deepEqual(sansNiveau, []);
    // Morsure du balayage : il doit VOIR au moins une route d'écriture.
    assert.ok(serveur.routes.some((r) => r.acces?.action === 'ecrire'));
  });

  test('« niveauMinimal » n’est déclaré NULLE PART ailleurs — sinon il ne ferait rien', () => {
    // ── Pourquoi ce contrôle vaut d'être écrit ─────────────────────────
    //
    // `niveauMinimal` est un vocabulaire NEUF, et il n'est lu que par le crochet
    // du greffon des approbations. Une route d'un autre greffon qui le
    // déclarerait paraîtrait protégée et ne le serait pas : le crochet parent
    // ignore ce champ, et **rien ne le dirait**. C'est le premier cas du tableau
    // du `CLAUDE.md` §3 — quelque chose réussit en silence alors que c'est faux.
    //
    // Découvert chez Fastify, jamais récité : la table des routes est celle du
    // greffon réellement monté.
    const egarees = serveur.toutesRoutes
      .filter((r) => r.niveauMinimal !== undefined)
      .filter((r) => typeof r.url !== 'string' || !r.url.startsWith('/api/approbations'))
      .map((r) => `${r.methode} ${r.url}`);
    assert.deepEqual(
      egarees,
      [],
      'Ces routes déclarent un niveau minimal que personne ne lit : elles paraissent ' +
        'protégées et ne le sont pas. Voir src/approbations/niveau.ts.',
    );
    // Morsure du balayage : il doit voir bien plus que les deux routes du lot,
    // sans quoi « aucune route égarée » serait vrai faute d'avoir regardé.
    assert.ok(
      serveur.toutesRoutes.length >= 12,
      `Balayage suspect : ${String(serveur.toutesRoutes.length)} route(s) vue(s).`,
    );
  });

  test('le domaine est « selon-entite » : le crochet parent le résout seul', () => {
    // Écrire `documents` en dur sur la route la rendrait fausse pour les risques
    // et les audits ; recopier une table entité → domaine ferait une seconde
    // copie de `DOMAINE_PAR_ENTITE`, que le compilateur garde exhaustive.
    for (const route of serveur.routes) {
      if (route.acces === undefined) continue;
      assert.equal(route.acces.domaine, 'selon-entite', `${route.methode} ${route.url}`);
    }
  });
});

/* =====================================================================
 *  §4 — Le refus vient du CROCHET, pas d'une garde dans la route
 * ===================================================================== */

describe('Aucune garde d’accès n’est écrite dans le corps des routes', () => {
  test('src/approbations/index.ts ne décide d’aucun droit', () => {
    // Même contrôle que `test/journal-lecture/routes.test.mjs`, et pour la même
    // raison : une garde écrite dans une route est un second endroit où le
    // modèle de droits se décide, donc un endroit où il peut diverger et qu'une
    // route neuve oublierait.
    //
    // Le crochet de niveau vit dans un fichier SÉPARÉ (`niveau.ts`) exprès :
    // c'est ce qui rend ce balayage possible sans l'assouplir.
    const source = readFileSync(join(RACINE_SRC, 'index.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    for (const garde of ['deciderAcces', 'refuserDroit', 'droit_insuffisant', '.droits']) {
      assert.ok(
        !code.includes(garde),
        `« ${garde} » apparaît dans le corps de src/approbations/index.ts : le refus doit ` +
          'venir de la déclaration d’accès, jamais d’une garde locale.',
      );
    }

    // ── Le seul 403 admis, et pourquoi il l'est ────────────────────────
    //
    // La première rédaction de cet essai interdisait tout « statut: 403 ». Elle
    // était trop large, et c'est le banc qui l'a dit : `verifierRattachement`
    // en émet un.
    //
    // Le discriminant n'est pas le statut, c'est **ce qui décide**. Un 403 qui
    // regarde le PROFIL double le modèle de droits — celui-là est proscrit. Un
    // 403 qui regarde la LIGNE (« cet objet appartient à une autre filiale »)
    // ne double rien du tout : `approbations.objet_id` est polymorphe et sans
    // clé étrangère, la base ne PEUT pas se prononcer, et sans lui une filiale
    // écrirait une décision désignant le risque d'une autre — c'est le constat
    // Q-2 côté applicatif. `src/pieces/index.ts` procède exactement ainsi.
    const codes403 = [
      ...new Set([...code.matchAll(/code: '([a-z_]+)',\s*\n\s*statut: 403/gu)].map((m) => m[1])),
    ];
    assert.deepEqual(
      codes403,
      ['hors_perimetre'],
      'Un 403 qui ne soit pas « hors_perimetre » est apparu : seul un refus portant sur la ' +
        'LIGNE est admis ici ; un refus portant sur le PROFIL appartient au crochet.',
    );

    // Morsure : le balayage doit voir le fichier qu'il croit lire.
    assert.ok(code.includes("instance.post(\n    '/api/approbations/:entite/:entiteId'"));
  });

  test('l’irréversibilité n’est PAS réécrite en TypeScript', () => {
    // §33.3 : « un agent qui réécrirait la règle d'irréversibilité en TypeScript
    // ferait un doublon silencieux de la garantie ». Le module ne doit donc
    // jamais refuser lui-même une décision au motif qu'une étape est tranchée :
    // il tente, et la base refuse en GRC02.
    const sources = ['index.ts', 'circuit.ts', 'niveau.ts'].map((f) =>
      readFileSync(join(RACINE_SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/^\s*\/\/.*$/gmu, ''),
    );
    for (const code of sources) {
      assert.ok(!code.includes('GRC02'), 'Le code émet un GRC02 : il double le déclencheur.');
      assert.ok(
        !/irr[ée]versib/iu.test(code),
        'Une règle d’irréversibilité est écrite hors commentaire : c’est le doublon du §33.3.',
      );
    }
  });
});
