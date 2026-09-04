/**
 * vocabulaire.test.mjs — les deux listes qui doivent coïncider, comparées.
 *
 * ── Le défaut que ce fichier rend impossible à survivre ──────────────────────
 *
 * Les trente domaines fonctionnels sont écrits **deux fois** : dans la contrainte du
 * domaine `domaine_fonctionnel` (`001_socle.sql` §1) et dans le type
 * `DomaineFonctionnelBase` de `src/droits/modele.ts`. Il n'y a pas moyen de n'en avoir
 * qu'une — TypeScript ne lit pas le catalogue PostgreSQL, et une chaîne libre côté
 * serveur ferait perdre la vérification à la compilation.
 *
 * Le `CONVENTIONS.md` §19.5 dit ce que devient une liste écrite deux fois : une
 * omission qui attend. Le remède retenu n'est pas d'éviter la duplication, c'est de la
 * rendre **mortelle** : ce fichier relève les valeurs dans le catalogue et exige
 * l'égalité EXACTE des deux ensembles, dans les deux sens. Une migration qui ajoute un
 * domaine sans toucher `modele.ts` fait rougir le banc, et réciproquement.
 *
 * La même règle vaut pour les cinq niveaux, et pour la table de projection vers le
 * vocabulaire du point d'entrée : un domaine sans rattachement ferait échouer la
 * compilation, mais un domaine rattaché à un nom que le point d'entrée ne connaît plus
 * ne se verrait qu'ici.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;
let droits;
let api;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  droits = await moduleCompile('droits/index.js');
  api = await moduleCompile('api/droits.js');
});

after(async () => {
  await base?.fermer();
});

/** Relève les valeurs admises par un domaine SQL, depuis le catalogue. */
async function valeursDuDomaine(nom) {
  const lignes = await base.lignes(
    proprietaire,
    `select m[1] as valeur
       from pg_constraint c
       join pg_type t on t.oid = c.contypid
      cross join lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') as m
      where t.typname = $1`,
    [nom],
  );
  return lignes.map((l) => l.valeur).sort();
}

describe('Le vocabulaire du modèle de droits est le même en base et dans le code', () => {
  test('les trente domaines fonctionnels coïncident, dans les deux sens', async () => {
    const enBase = await valeursDuDomaine('domaine_fonctionnel');
    const dansLeCode = [...droits.DOMAINES].sort();

    assert.equal(enBase.length, 30, 'Le décompte lui-même est une donnée : 001_socle.sql §1.');
    assert.deepEqual(
      dansLeCode,
      enBase,
      'Un domaine ajouté en base sans être ajouté à `modele.ts` serait résolu en « aucun » ' +
        'par le défaut fermé : le droit existerait en base et n’ouvrirait rien.',
    );
  });

  test('les cinq niveaux de droit coïncident', async () => {
    const enBase = await valeursDuDomaine('niveau_droit');
    assert.deepEqual([...droits.NIVEAUX].sort(), enBase);
  });

  test('chaque domaine de base a une DÉCISION de rattachement — fût-elle « aucun »', () => {
    const table = droits.DOMAINE_API_PAR_DOMAINE_BASE;
    for (const domaine of droits.DOMAINES) {
      assert.ok(
        Object.hasOwn(table, domaine),
        `Le domaine « ${domaine} » n’a pas de rattachement : la projection le perdrait ` +
          'en silence, ce que le type Record est censé rendre impossible.',
      );
    }
  });

  test('la liste des domaines SANS équivalent est arbitrée, pas subie', () => {
    // `null` n'est pas un oubli : c'est une décision, et elle doit rester rare et
    // visible. Ce contrôle oblige un humain à trancher chaque fois qu'un domaine de
    // base cesse d'avoir un équivalent de décision (CONVENTIONS.md §24, l'esprit de
    // la liste écrite à la main : obliger à décider, pas énumérer).
    const sansEquivalent = Object.entries(droits.DOMAINE_API_PAR_DOMAINE_BASE)
      .filter(([, projete]) => projete === null)
      .map(([base_]) => base_)
      .sort();
    assert.deepEqual(
      sansEquivalent,
      ['imports'],
      'Un domaine de plus sans équivalent doit être justifié dans passerelle-api.ts.',
    );
  });

  test('aucun rattachement ne vise un domaine que le point d’entrée ne connaît pas', () => {
    const connus = new Set(api.TOUS_LES_DOMAINES);
    for (const [base_, projete] of Object.entries(droits.DOMAINE_API_PAR_DOMAINE_BASE)) {
      if (projete === null) continue;
      assert.ok(
        connus.has(projete),
        `« ${base_} » est projeté sur « ${projete} », que src/api/droits.ts ne déclare pas.`,
      );
    }
  });

  test('MORSURE : la projection n’accorde PAS « administration » à qui a « imports »', () => {
    // Le défaut réel, trouvé par le banc et non prévu. Le premier jet rattachait
    // `imports` à `administration`, au motif que reprendre un jeu de données entier
    // est un acte d'administration — vrai de l'ACTION, faux du DOMAINE. Conséquence :
    // le RSSI de site et l'auditeur, qui portent `imports` parmi leurs vingt-six
    // domaines, recevaient `administration` dans leurs droits projetés et passaient
    // le contrôle de domaine des routes d'administration.
    //
    // Cet essai est la morsure : il rougit si la ligne redevient
    // `imports: 'administration'`.
    const etat = {
      domaines: new Map([
        ['imports', 'contribution'],
        ['risques', 'validation'],
      ]),
      peutExporter: false,
    };
    const projetes = droits.projeterDroits(etat);
    assert.ok(projetes.domaines.includes('risques'));
    assert.ok(
      !projetes.domaines.includes('administration'),
      'Un domaine sans équivalent de décision n’en ouvre AUCUN : le défaut est fermé.',
    );
    assert.equal(projetes.niveau, 'validation', 'Le niveau, lui, reste le plus élevé détenu.');
  });

  test('les TROIS domaines d’administration projettent sur « administration »', () => {
    for (const domaine of ['droits', 'filiales', 'parametres']) {
      const projetes = droits.projeterDroits({
        domaines: new Map([[domaine, 'administration']]),
        peutExporter: false,
      });
      assert.deepEqual(projetes.domaines, ['administration'], domaine);
    }
  });

  // ── Arbitrage de l'ouverture du lot L5 ────────────────────────────────
  //
  // Ils étaient QUATRE à se projeter sur « administration ». `journal` s'en est
  // détaché : régler l'application et lire trois ans d'identités, d'adresses IP
  // et de valeurs avant/après ne sont pas le même droit (`src/api/droits.ts`).
  //
  // Cet essai éprouve la propriété dans les DEUX SENS (§20.2), parce que
  // l'affirmer d'un seul côté ne prouverait rien : porter « journal » n'ouvre
  // pas l'administration, ET porter l'un des trois autres n'ouvre pas le
  // journal. C'est le second sens qui compte : c'est la porte que ce détachement
  // ferme, et elle serait restée ouverte avec un essai qui n'aurait regardé que
  // le premier.
  test('MORSURE : « journal » et « administration » ne s’ouvrent pas l’un l’autre', () => {
    const parLeJournal = droits.projeterDroits({
      domaines: new Map([['journal', 'administration']]),
      peutExporter: false,
    });
    assert.deepEqual(
      parLeJournal.domaines,
      ['journal'],
      'Lire le journal n’administre pas l’application.',
    );

    for (const domaine of ['droits', 'filiales', 'parametres']) {
      const projetes = droits.projeterDroits({
        domaines: new Map([[domaine, 'administration']]),
        peutExporter: false,
      });
      assert.ok(
        !projetes.domaines.includes('journal'),
        `« ${domaine} » n’ouvre pas le journal d’audit : une barrière qui n’arrête ` +
          'que ceux qu’une autre arrête déjà n’est pas une barrière (Q-89).',
      );
    }
  });

  test('un domaine explicitement fermé (« aucun ») n’ouvre rien', () => {
    const projetes = droits.projeterDroits({
      domaines: new Map([['cartographie', 'aucun']]),
      peutExporter: false,
    });
    assert.deepEqual(projetes.domaines, []);
  });

  test('le cumul se fait au plus FAVORABLE, et la comparaison est ordonnée', () => {
    assert.equal(droits.cumuler('lecture', 'administration'), 'administration');
    assert.equal(droits.cumuler('administration', 'lecture'), 'administration');
    assert.equal(droits.cumuler('aucun', 'lecture'), 'lecture');
    // Un groupe supplémentaire ne retire jamais rien : voir `modele.ts`.
    assert.equal(droits.cumuler('validation', 'aucun'), 'validation');

    assert.equal(droits.suffit('contribution', 'lecture'), true);
    assert.equal(droits.suffit('lecture', 'contribution'), false);
    // « aucun » n'est jamais suffisant, même exigé contre lui-même : un domaine
    // explicitement fermé reste fermé.
    assert.equal(droits.suffit('aucun', 'aucun'), false);
  });

  test('le défaut est FERMÉ : une valeur hors vocabulaire n’est ni un domaine ni un niveau', () => {
    assert.equal(droits.estDomaine('cartographie'), true);
    assert.equal(droits.estDomaine('CARTOGRAPHIE'), false);
    assert.equal(droits.estDomaine('tout'), false);
    assert.equal(droits.estNiveau('administration'), true);
    assert.equal(droits.estNiveau('super-administration'), false);
  });
});

describe('Le socle des huit profils est complet et conforme au PLAN_SERVEUR §3.2', () => {
  test('les huit profils de socle existent', async () => {
    const codes = await base.lignes(
      proprietaire,
      `select code from profils where socle order by code`,
    );
    assert.deepEqual(codes.map((l) => l.code), [
      'ADMIN',
      'AUDITEUR',
      'CONTRIB',
      'DIRECTION',
      'DPO',
      'QUALITE',
      'RH',
      'RSSI',
    ]);
  });

  test('le contributeur est borné à QUATRE domaines — ni plus, ni moins', async () => {
    const domaines = await base.lignes(
      proprietaire,
      `select d.domaine from profil_domaines d join profils p on p.id = d.profil_id
        where p.code = 'CONTRIB' order by d.domaine`,
    );
    assert.deepEqual(domaines.map((l) => l.domaine), ['actifs', 'actions', 'incidents', 'mco']);
  });

  test('la qualité ne voit PAS la cartographie, et c’est écrit explicitement', async () => {
    // « aucun » plutôt que l'absence : un domaine fermé se relit en revue de droits,
    // une absence ne se relit pas (001_socle.sql §4).
    const niveau = await base.valeur(
      proprietaire,
      `select d.niveau from profil_domaines d join profils p on p.id = d.profil_id
        where p.code = 'QUALITE' and d.domaine = 'cartographie'`,
    );
    assert.equal(niveau, 'aucun');
  });

  test('les quatre domaines d’administration n’appartiennent qu’au profil ADMIN', async () => {
    const porteurs = await base.lignes(
      proprietaire,
      `select distinct p.code
         from profil_domaines d join profils p on p.id = d.profil_id
        where d.domaine in ('droits', 'filiales', 'parametres', 'journal')
          and d.niveau <> 'aucun'
        order by p.code`,
    );
    assert.deepEqual(
      porteurs.map((l) => l.code),
      ['ADMIN'],
      'La question d’audit « le RSSI peut-il modifier le journal ? » se répond ici.',
    );
  });

  test('l’auditeur externe n’a AUCUNE écriture nulle part', async () => {
    const audela = await base.lignes(
      proprietaire,
      `select d.domaine, d.niveau
         from profil_domaines d join profils p on p.id = d.profil_id
        where p.code = 'AUDITEUR' and d.niveau not in ('aucun', 'lecture')`,
    );
    assert.deepEqual(audela, []);
  });
});
