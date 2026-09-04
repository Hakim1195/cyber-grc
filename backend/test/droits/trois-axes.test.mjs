/**
 * trois-axes.test.mjs — périmètre × profil × niveau, éprouvés **dans les deux sens**.
 *
 * ── Ce qui est en jeu ────────────────────────────────────────────────────────
 *
 * `PLAN_SERVEUR` §3.1 : un droit est le croisement de trois axes. La résolution
 * (`src/droits/resolution.ts`) traduit des **noms de groupes** — donc des chaînes venues
 * de l'annuaire, c'est-à-dire du réseau — en droits. C'est le point où une erreur
 * accorderait un accès que personne n'a décidé.
 *
 * ── Pourquoi chaque profil est joué deux fois ───────────────────────────────
 *
 * `CONVENTIONS.md` §20.2 : *un garde-fou se vérifie dans les deux sens.* Un banc qui
 * n'éprouve que des comptes autorisés ne démontre pas une autorisation, il démontre
 * qu'un chemin existe. Chaque profil est donc éprouvé **sur ses domaines ET sur ceux
 * qu'il ne doit pas voir** — la qualité qui ne reçoit pas la cartographie compte autant
 * que la qualité qui reçoit les audits.
 *
 * Le jeu de comptes est celui du contrat de l'annuaire simulé (`CONVENTIONS.md` §25.3),
 * y compris ses deux cas négatifs : `sans.groupe`, dont les identifiants sont valides et
 * qui n'ouvre rien, et le porteur de `GRC-EXPORT` seul, qui aurait le droit d'exporter
 * mais rien à exporter.
 *
 * ⚠️ Ce fichier éprouve la **traduction** groupes → droits, pas la lecture de l'annuaire :
 * les noms de groupes lui sont donnés. La chaîne complète — liaison LDAPS, résolution
 * récursive, imbrication cyclique — est éprouvée par `test/auth/annuaire.test.mjs`,
 * contre l'annuaire simulé écrit par un autre agent.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let proprietaire;
/** @type {import('pg').Client} */
let applicatif;
let droits;

const TLS = 'FIL-A3-TLS';
const DEU = 'FIL-A3-DEU';

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  proprietaire = await base.connexion('proprietaire');
  applicatif = await base.connexion('app');
  droits = await moduleCompile('droits/index.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', TLS, [TLS, DEU], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'ZZA3T', 'Essai Toulouse', 'FR'),
             ($2, 'ZZA3D', 'Essai Allemagne', 'DE')`,
        [TLS, DEU],
      );

      // Les groupes AD sont ENGENDRÉS depuis la configuration, jamais écrits à la
      // main (PLAN_SERVEUR §3.4, CONVENTIONS.md §19.5). C'est le geste que
      // `deploy/` rejouera à l'installation.
      const filiales = await droits.lireFilialesActives(c);
      const profils = await droits.lireProfilsActifs(c);
      const attendus = droits.groupesAttendus('GRC-', filiales, profils);
      const bilan = await droits.synchroniserGroupesAd(c, attendus);
      assert.equal(bilan.crees.length, attendus.length);
      assert.deepEqual(bilan.inattendus, []);
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/** Résout des groupes, comme la connexion le fait, en lecture seule. */
async function resoudre(groupes, options = {}) {
  return await base.avecPerimetre(applicatif, perimetre('resolution', null, []), async (c) =>
    droits.resoudreDroits(c, groupes, options),
  );
}

/** Niveau détenu sur un domaine, ou `aucun`. */
const niveau = (resolus, domaine) => resolus.domaines.get(domaine) ?? 'aucun';

/**
 * Bascule l'état d'une ligne de configuration, **par le chemin légitime**.
 *
 * `profils` et `groupes_ad` sont des tables de configuration : leur écriture est
 * réservée à l'administration Groupe depuis la porte S1 (constat M-2). Un `update`
 * posé hors de ce chemin ne lève rien et n'affecte aucune ligne — il faut donc
 * compter les lignes touchées, sans quoi un essai serait vert sans avoir rien changé.
 */
async function ecrireConfiguration(texte, valeurs) {
  const touchees = await base.avecPerimetre(
    applicatif,
    perimetre('decor', TLS, [TLS, DEU], true),
    async (c) => (await c.query(texte, valeurs)).rowCount,
    { annuler: false },
  );
  assert.equal(touchees, 1, `Écriture de configuration sans effet : ${texte}`);
}

const basculerProfilAdmin = (actif) =>
  ecrireConfiguration(`update profils set actif = $1 where code = 'ADMIN'`, [actif]);

const basculerGroupe = (nom, actif) =>
  ecrireConfiguration(`update groupes_ad set actif = $1 where nom = $2`, [actif, nom]);

describe('L’engendrement des groupes AD suit la convention du PLAN_SERVEUR §3.4', () => {
  test('les trois formes sont produites, et l’administration n’a pas de forme « filiale »', async () => {
    const noms = await base.lignes(proprietaire, 'select nom from groupes_ad order by nom');
    const liste = noms.map((l) => l.nom);

    assert.ok(liste.includes('GRC-ZZA3T-RSSI'), 'GRC-<FILIALE>-<PROFIL>');
    assert.ok(liste.includes('GRC-GROUPE-DIRECTION'), 'GRC-GROUPE-<PROFIL>');
    assert.ok(liste.includes('GRC-EXPORT') && liste.includes('GRC-ADMIN'), 'transversaux');
    assert.ok(
      !liste.some((n) => /^GRC-ZZA3[TD]-ADMIN$/.test(n)),
      'Administrer une seule filiale n’a pas de sens : le groupe n’est pas engendré.',
    );

    // 2 filiales × 7 profils (ADMIN exclu) + 7 groupes « GROUPE » + 2 transversaux.
    assert.equal(liste.length, 2 * 7 + 7 + 2);
  });

  test('la synchronisation est idempotente et ne supprime jamais rien', async () => {
    const bilan = await base.avecPerimetre(
      applicatif,
      perimetre('decor', TLS, [TLS, DEU], true),
      async (c) => {
        const attendus = droits.groupesAttendus(
          'GRC-',
          await droits.lireFilialesActives(c),
          await droits.lireProfilsActifs(c),
        );
        return await droits.synchroniserGroupesAd(c, attendus);
      },
    );
    assert.deepEqual(bilan.crees, [], 'Rien à créer la seconde fois.');
    assert.equal(bilan.presents.length, 23);
  });
});

describe('Le premier axe — le périmètre', () => {
  test('rssi.tls : UNE filiale, et pas l’autre', async () => {
    const r = await resoudre(['GRC-ZZA3T-RSSI']);
    assert.deepEqual([...r.filiales], [TLS]);
    assert.equal(r.portee, 'filiale');
    assert.equal(r.filialeActive, TLS);
    assert.ok(!r.filiales.includes(DEU), 'Le cloisonnement commence ici : Toulouse ne lit pas Berlin.');
  });

  test('deux groupes de filiale donnent un périmètre « multi »', async () => {
    const r = await resoudre(['GRC-ZZA3T-RSSI', 'GRC-ZZA3D-CONTRIB']);
    assert.equal(r.portee, 'multi');
    assert.deepEqual([...r.filiales].sort(), [DEU, TLS].sort());
  });

  test('un groupe « GROUPE » ouvre TOUTES les filiales actives', async () => {
    const r = await resoudre(['GRC-GROUPE-DIRECTION']);
    assert.equal(r.portee, 'groupe');
    assert.deepEqual([...r.filiales].sort(), [DEU, TLS].sort());
  });

  test('la filiale préférée est retenue si elle est dans le périmètre, ignorée sinon', async () => {
    const dedans = await resoudre(['GRC-GROUPE-DIRECTION'], { filialePreferee: DEU });
    assert.equal(dedans.filialeActive, DEU);

    // Une préférence hors périmètre ne l'élargit PAS : elle est simplement ignorée.
    const dehors = await resoudre(['GRC-ZZA3T-RSSI'], { filialePreferee: DEU });
    assert.equal(dehors.filialeActive, TLS);
    assert.ok(!dehors.filiales.includes(DEU));
  });
});

describe('Le deuxième axe — le profil, et ce qu’il NE donne PAS', () => {
  test('rssi.tls : tous les domaines métier, aucun domaine d’administration', async () => {
    const r = await resoudre(['GRC-ZZA3T-RSSI']);
    assert.equal(niveau(r, 'risques'), 'validation');
    assert.equal(niveau(r, 'cartographie'), 'validation');
    for (const ferme of ['droits', 'filiales', 'parametres', 'journal']) {
      assert.equal(niveau(r, ferme), 'aucun', `Le RSSI ne doit pas porter « ${ferme} ».`);
    }
    assert.equal(r.administrateur, false);
  });

  test('contrib.tls : quatre domaines, et rien d’autre', async () => {
    const r = await resoudre(['GRC-ZZA3T-CONTRIB']);
    assert.deepEqual([...r.domaines.keys()].sort(), ['actifs', 'actions', 'incidents', 'mco']);
    assert.equal(niveau(r, 'risques'), 'aucun', 'La saisie courante ne touche pas aux risques.');
  });

  test('qualite.tls : les audits OUI, la cartographie NON — le contrat §25.3', async () => {
    const r = await resoudre(['GRC-ZZA3T-QUALITE']);
    assert.equal(niveau(r, 'audits'), 'contribution');
    assert.equal(niveau(r, 'documents'), 'contribution');
    assert.equal(niveau(r, 'exigences'), 'lecture');
    assert.equal(
      niveau(r, 'cartographie'),
      'aucun',
      'C’est le profil qui NE DOIT PAS voir la cartographie des vulnérabilités.',
    );
    assert.equal(niveau(r, 'risques'), 'aucun');
  });

  test('direction : lecture seule, sur un périmètre Groupe', async () => {
    const r = await resoudre(['GRC-GROUPE-DIRECTION']);
    assert.equal(r.portee, 'groupe');
    for (const [, valeur] of r.domaines) {
      assert.equal(valeur, 'lecture', 'La direction ne contribue nulle part.');
    }
    assert.equal(niveau(r, 'tableau_de_bord'), 'lecture');
    assert.equal(niveau(r, 'incidents'), 'aucun');
  });

  test('dpo : le RGPD en validation, la cartographie fermée', async () => {
    const r = await resoudre(['GRC-ZZA3T-DPO']);
    assert.equal(niveau(r, 'rgpd'), 'validation');
    assert.equal(niveau(r, 'incidents'), 'contribution');
    assert.equal(niveau(r, 'cartographie'), 'aucun');
  });

  test('rh : le personnel en contribution, le RGPD en LECTURE seulement', async () => {
    const r = await resoudre(['GRC-ZZA3T-RH']);
    assert.equal(niveau(r, 'personnel'), 'contribution');
    assert.equal(niveau(r, 'rgpd'), 'lecture', 'Le §3.2 dit « registre RGPD (lecture) ».');
    assert.equal(niveau(r, 'audits'), 'aucun');
  });

  test('auditeur : lecture large, écriture nulle part', async () => {
    const r = await resoudre(['GRC-ZZA3T-AUDITEUR']);
    assert.ok(r.domaines.size >= 26);
    for (const [domaine, valeur] of r.domaines) {
      assert.equal(valeur, 'lecture', `« ${domaine} » ne doit pas être ouvert en écriture.`);
    }
  });

  test('le cumul de deux groupes se fait au plus FAVORABLE, jamais au plus défavorable', async () => {
    const r = await resoudre(['GRC-ZZA3T-CONTRIB', 'GRC-ZZA3T-RSSI']);
    assert.equal(
      niveau(r, 'actions'),
      'validation',
      'Un groupe supplémentaire ne doit jamais retirer de droit.',
    );
  });
});

describe('Le troisième axe et le droit d’export — distincts l’un de l’autre', () => {
  test('un périmètre Groupe EN LECTURE n’accorde pas l’export (contrôle S7)', async () => {
    const r = await resoudre(['GRC-GROUPE-DIRECTION']);
    assert.equal(r.portee, 'groupe');
    assert.equal(
      r.peutExporter,
      false,
      'Un accès Groupe en lecture extrairait la cartographie complète des faiblesses du groupe.',
    );
  });

  test('GRC-EXPORT accorde l’export, et lui seul', async () => {
    const r = await resoudre(['GRC-GROUPE-RSSI', 'GRC-EXPORT']);
    assert.equal(r.peutExporter, true);
    assert.equal(r.portee, 'groupe');
  });

  test('GRC-EXPORT SEUL n’ouvre aucun périmètre — le droit d’exporter sans rien à exporter', async () => {
    const r = await resoudre(['GRC-EXPORT']);
    assert.equal(r.peutExporter, true);
    assert.deepEqual([...r.filiales], []);
    assert.equal(droits.ouvreUnAcces(r), false, 'Sans périmètre, aucune session ne s’ouvre.');
  });
});

describe('L’administration — condition E2, décidée par les groupes et non déclarée', () => {
  test('GRC-ADMIN accorde le profil d’administration ET le périmètre Groupe', async () => {
    const r = await resoudre(['GRC-ADMIN']);
    assert.equal(r.administrateur, true);
    assert.equal(r.portee, 'groupe');
    assert.equal(niveau(r, 'droits'), 'administration');
    assert.equal(niveau(r, 'journal'), 'administration');
    assert.equal(
      niveau(r, 'mesures'),
      'administration',
      'Sans les domaines métier, le drapeau d’administration Groupe ne serait employable nulle part.',
    );
  });

  test('AUCUN autre profil n’est administrateur', async () => {
    for (const groupe of [
      'GRC-ZZA3T-RSSI',
      'GRC-ZZA3T-QUALITE',
      'GRC-GROUPE-DIRECTION',
      'GRC-GROUPE-RSSI',
      'GRC-ZZA3T-AUDITEUR',
    ]) {
      const r = await resoudre([groupe]);
      assert.equal(r.administrateur, false, `« ${groupe} » ne doit pas être administrateur.`);
    }
  });

  test('le socle ADMIN absent fait REFUSER, il n’accorde pas tout par défaut', async () => {
    // ⚠️ L'écriture de `profils` passe par l'administration Groupe, MÊME sous le compte
    // propriétaire : `force row level security` ne l'exempte pas. Un `update` posé sans
    // le réglage n'échouerait pas — il n'affecterait AUCUNE ligne, et l'essai serait vert
    // sans avoir rien éprouvé. C'est la mise en garde de la migration 007 §2, et elle a
    // été rencontrée en écrivant ce fichier.
    await basculerProfilAdmin(false);
    try {
      await assert.rejects(
        () => resoudre(['GRC-ADMIN']),
        /profil de socle .*ADMIN.* est absent ou inactif/,
        'Un socle incomplet est une erreur d’exploitation, jamais une permission.',
      );
    } finally {
      await basculerProfilAdmin(true);
    }
  });
});

describe('Ce qui n’accorde RIEN — les cas négatifs', () => {
  test('sans.groupe : aucun groupe, aucun accès', async () => {
    const r = await resoudre([]);
    assert.deepEqual([...r.filiales], []);
    assert.equal(r.administrateur, false);
    assert.equal(r.peutExporter, false);
    assert.equal(r.domaines.size, 0);
    assert.equal(droits.ouvreUnAcces(r), false);
  });

  test('un nom de groupe INVENTÉ dans l’annuaire n’accorde rien, et il est signalé', async () => {
    // Le point de conception : le nom vient de l'AD, la DÉCISION vient de la table.
    const r = await resoudre(['GRC-ZZA3T-SUPERADMIN', 'GRC-ZZA3T-RSSI']);
    assert.deepEqual([...r.filiales], [TLS]);
    assert.equal(r.administrateur, false);
    assert.deepEqual(r.groupesIgnores, ['GRC-ZZA3T-SUPERADMIN']);
    assert.deepEqual(r.groupesReconnus, ['GRC-ZZA3T-RSSI']);
  });

  test('un groupe DÉSACTIVÉ dans la table n’accorde plus rien', async () => {
    await basculerGroupe('GRC-ZZA3T-RSSI', false);
    try {
      const r = await resoudre(['GRC-ZZA3T-RSSI']);
      assert.deepEqual([...r.filiales], []);
      assert.deepEqual(r.groupesIgnores, ['GRC-ZZA3T-RSSI']);
      assert.equal(droits.ouvreUnAcces(r), false);
    } finally {
      await basculerGroupe('GRC-ZZA3T-RSSI', true);
    }
  });

  test('la comparaison des noms est insensible à la casse, comme l’AD', async () => {
    const r = await resoudre(['grc-zza3t-rssi']);
    assert.deepEqual([...r.filiales], [TLS]);
    assert.deepEqual(r.groupesIgnores, []);
  });

  test('une filiale ARCHIVÉE sort du périmètre Groupe', async () => {
    await base.avecPerimetre(
      applicatif,
      perimetre('decor', TLS, [TLS, DEU], true),
      async (c) => {
        await c.query(`update filiales set statut = 'archivee' where id = $1`, [DEU]);
      },
      { annuler: false },
    );
    try {
      const r = await resoudre(['GRC-GROUPE-DIRECTION']);
      assert.deepEqual([...r.filiales], [TLS]);
    } finally {
      await base.avecPerimetre(
        applicatif,
        perimetre('decor', TLS, [TLS, DEU], true),
        async (c) => {
          await c.query(`update filiales set statut = 'active' where id = $1`, [DEU]);
        },
        { annuler: false },
      );
    }
  });
});
