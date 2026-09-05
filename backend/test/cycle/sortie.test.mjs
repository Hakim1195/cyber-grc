/**
 * sortie.test.mjs — **une filiale qui sort du groupe** (`CONVENTIONS.md` §35.2).
 *
 * ── Les quatre propriétés qui coûtent cher si elles manquent ─────────────────
 *
 *  1. **L'export vient AVANT la bascule.** Une filiale `sortie` quitte
 *     `f_filiales_actives()`, donc tous les périmètres : l'exporter ensuite
 *     demanderait un chemin qui contourne le cloisonnement.
 *  2. **Les deux gestes sont dans la MÊME transaction.** L'essai le vérifie en
 *     **cassant la seconde écriture** et en constatant que la première a disparu.
 *     Une sortie à moitié faite laisserait un export remis pour une filiale
 *     restée active, ou une filiale basculée sans son export.
 *  3. **La filiale sortie n'entre plus dans aucun périmètre — et ses données sont
 *     toujours là.** Les deux moitiés comptent : la seconde est ce qui permet de
 *     répondre à un contrôle deux ans plus tard.
 *  4. **La trace de la sortie doit rester LISIBLE après la sortie.** C'est la
 *     décision la moins évidente du lot, et elle est mesurée ici : une entrée
 *     attribuée à la filiale qui part disparaît avec elle.
 *
 * ── L'exigence de matière ────────────────────────────────────────────────────
 *
 * Un export vide passerait tous les contrôles de forme. Chaque assertion de
 * volume est donc précédée d'un plancher : la filiale qui sort **doit** porter des
 * risques, des actifs et une pièce jointe, sinon l'essai ne mesure rien.
 *
 * Prérequis machine : PostgreSQL prêt ; sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { lireEnBase, monterCycle, perimetreDe, profil, SessionDEssai, valeurEnBase } from './aide.mjs';

/** Troisième filiale, ACTIVE et sans données : elle sert à distinguer un
 *  périmètre « Groupe » d'un périmètre « toutes les filiales qui restent ». */
const FILIALE_C = 'FIL-ESSAI-C';

let base;
let applicatif;
let proprietaire;
let session;
let serveur;
let chemins;
let cycle;

/** Le profil qui peut sortir une filiale : administration Groupe ET export. */
const DROITS_ADMIN = profil('administration', { export: true });

const perimetreAdmin = () =>
  perimetreDe('admin.grc', FILIALE_A, [FILIALE_A, FILIALE_B, FILIALE_C], {
    perimetreGroupe: true,
    administrationGroupe: true,
  });

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  await semerJeuEssai(base, applicatif);
  cycle = await moduleCompile('cycle/index.js');

  // La troisième filiale, posée par le chemin du produit : administration Groupe.
  await base.avecPerimetre(
    applicatif,
    perimetre('decor', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays)
              values ($1, 'ZZESSC', 'Essai Espagne', 'ES')`,
        [FILIALE_C],
      );
    },
    { annuler: false },
  );

  session = new SessionDEssai(perimetreAdmin(), DROITS_ADMIN);
  serveur = await monterCycle(base, session);
  chemins = serveur.chemins;
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Compte des lignes sous le PROPRIÉTAIRE, avec un périmètre explicite et large. */
async function compter(sql, valeurs = []) {
  const n = await valeurEnBase(base, proprietaire, sql, valeurs, {
    utilisateur: 'temoin',
    filialeId: null,
    filiales: [FILIALE_A, FILIALE_B, FILIALE_C],
  });
  return Number(n ?? 0);
}

/* =====================================================================
 *  §0 — La matière : sans elle, tout ce qui suit serait décoratif
 * ===================================================================== */

describe('§0 — la filiale qui va sortir porte réellement des données', () => {
  test('elle a des risques, des actifs, une pièce jointe et une entrée de journal', async () => {
    assert.ok(
      (await compter('select count(*) from risques where filiale_id = $1', [FILIALE_B])) >= 2,
      'sans risques chez la filiale qui sort, « l’export est complet » ne mesure rien',
    );
    assert.ok((await compter('select count(*) from actifs where filiale_id = $1', [FILIALE_B])) >= 2);
    assert.equal(await compter('select count(*) from pieces_jointes where filiale_id = $1', [FILIALE_B]), 1);
    assert.ok(
      (await compter('select count(*) from journal_audit where filiale_id = $1', [FILIALE_B])) >= 1,
      'le registre de la filiale doit contenir quelque chose, sinon le §4 comparerait 0 à 0',
    );
  });

  test('les trois filiales sont ACTIVES avant la sortie', async () => {
    const actives = await lireEnBase(base, proprietaire, 'select id from f_filiales_actives()');
    assert.deepEqual(
      actives.map((l) => l.id).sort(),
      [FILIALE_A, FILIALE_B, FILIALE_C].sort(),
    );
  });
});

/* =====================================================================
 *  §1 — La sortie nominale
 * ===================================================================== */

describe('§1 — exporter, puis basculer', () => {
  let reponse;

  test('la route rend l’enveloppe grc-backup ET le statut basculé', async () => {
    const avant = await compter('select count(*) from risques where filiale_id = $1', [FILIALE_B]);

    reponse = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_B, date_sortie: '2026-09-30' },
    });
    assert.equal(reponse.statut, 200, `sortie refusée : ${JSON.stringify(reponse.corps)}`);

    const { corps } = reponse;
    assert.equal(corps.filiale.id, FILIALE_B);
    assert.equal(corps.filiale.code, 'ZZESSB');
    assert.equal(corps.filiale.statut, 'sortie');
    assert.equal(corps.filiale.date_sortie, '2026-09-30');

    // ── L'enveloppe est celle du format d'échange, pas une forme improvisée
    assert.equal(corps.exportation.format, 'grc-backup');
    assert.equal(corps.exportation.encrypted, false);
    assert.equal(typeof corps.exportation.payload, 'object');

    // ── MATIÈRE : l'export porte ce que la filiale portait
    assert.equal(
      corps.exportation.payload.risques.length,
      avant,
      'l’export doit rendre TOUS les risques de la filiale qui sort',
    );
    assert.ok(corps.lignes > 0, 'un export vide passerait tous les contrôles de forme');
    assert.equal(corps.volumes.risques, avant);
  });

  test('l’export est cadré sur la filiale qui SORT, pas sur la filiale active de l’admin', async () => {
    // L'administrateur a FILIALE_A pour filiale active. Si la route exportait sa
    // filiale à lui, l'acquéreur recevrait les données d'une autre société — et
    // le contrôle de forme ci-dessus n'y verrait rien.
    const identifiants = reponse.corps.exportation.payload.risques.map((r) => r.id).sort();
    assert.deepEqual(
      identifiants,
      ['RISK-B', 'RISK2-B'],
      'l’export porte les risques de la mauvaise filiale',
    );
  });

  test('les pièces jointes sont INVENTORIÉES, et l’enveloppe dit ne pas les porter', () => {
    assert.equal(reponse.corps.pieces_jointes.length, 1);
    const piece = reponse.corps.pieces_jointes[0];
    assert.equal(piece.id, 'PJ-B');
    assert.equal(typeof piece.sha256, 'string');
    assert.equal(piece.sha256.length, 64);
    assert.equal(typeof piece.chemin_stockage, 'string');
    assert.equal(
      reponse.corps.exportation.payload.pieces_jointes,
      undefined,
      'grc-backup ne transporte aucun binaire : l’inventaire est la seule promesse tenable',
    );
  });

  test('l’effet de bord sur les sessions ouvertes est DIT, pas laissé à découvrir (Q-155)', () => {
    assert.match(reponse.corps.avertissement, /Q-155/u);
    assert.match(reponse.corps.avertissement, /sessions déjà ouvertes/iu);
  });
});

/* =====================================================================
 *  §2 — Ce que la sortie change, et ce qu'elle ne change pas
 * ===================================================================== */

describe('§2 — hors de tout périmètre, et pourtant intacte', () => {
  test('la filiale sortie ne figure plus parmi les filiales ACTIVES', async () => {
    const actives = await lireEnBase(base, proprietaire, 'select id from f_filiales_actives()');
    const ids = actives.map((l) => l.id);
    assert.ok(!ids.includes(FILIALE_B), 'une filiale sortie reste offerte aux périmètres');
    assert.ok(ids.includes(FILIALE_A) && ids.includes(FILIALE_C), 'les autres doivent rester');
  });

  test('la RÉSOLUTION du périmètre, celle du produit, ne la propose plus', async () => {
    // ⚠️ On interroge la fonction que la couche de droits emploie réellement
    // (`src/droits/groupes-ad.ts`), pas une requête réécrite pour l'essai : une
    // réimplémentation prouverait que l'essai sait filtrer, pas que le produit le fait.
    const droits = await moduleCompile('droits/groupes-ad.js');
    const vues = await base.avecPerimetre(
      applicatif,
      perimetre('resolution', null, [FILIALE_A, FILIALE_C]),
      async (c) => droits.lireFilialesActives(c),
    );
    assert.ok(
      !vues.some((f) => f.id === FILIALE_B),
      'la filiale sortie serait encore proposée à la résolution d’un périmètre',
    );
  });

  test('SES DONNÉES SONT TOUJOURS LÀ, lisibles du propriétaire', async () => {
    // C'est la seconde moitié, et c'est elle qui permet de répondre à un contrôle
    // deux ans plus tard. Une sortie qui supprimerait les lignes serait une
    // destruction, pas un archivage (§35.2).
    assert.ok((await compter('select count(*) from risques where filiale_id = $1', [FILIALE_B])) >= 2);
    assert.ok((await compter('select count(*) from actifs where filiale_id = $1', [FILIALE_B])) >= 2);
    assert.equal(await compter('select count(*) from pieces_jointes where filiale_id = $1', [FILIALE_B]), 1);
    assert.equal(
      await compter("select count(*) from filiales where id = $1 and statut = 'sortie'", [FILIALE_B]),
      1,
    );
  });

  test('une session Groupe des filiales RESTANTES ne lit plus le registre de la sortante', async () => {
    // ── C'est la mesure qui justifie la décision 4 du greffon ────────────
    //
    // `pol_journal_audit_lecture` rend une entrée de filiale à qui a cette filiale
    // à son périmètre. Après la sortie, plus aucun périmètre ne la contient : le
    // registre de la filiale sortante devient illisible de tous. Une trace de
    // sortie qui lui aurait été attribuée aurait disparu avec elle.
    const lues = await base.avecPerimetre(
      applicatif,
      perimetre('rssi.groupe', FILIALE_A, [FILIALE_A, FILIALE_C]),
      async (c) =>
        (await c.query('select count(*)::int as n from journal_audit where filiale_id = $1', [FILIALE_B]))
          .rows[0].n,
    );
    assert.equal(lues, 0, 'le registre d’une filiale sortie reste lisible : le cloisonnement a bougé');

    // Contrôle symétrique : sans lui, « 0 » vaudrait pour une table vide.
    assert.ok(
      (await compter('select count(*) from journal_audit where filiale_id = $1', [FILIALE_B])) >= 1,
      'la table doit contenir ces entrées : le propriétaire les voit, la session non',
    );
  });
});

/* =====================================================================
 *  §3 — La trace : une entrée, transversale, et LISIBLE
 * ===================================================================== */

describe('§3 — la sortie est tracée, et la trace survit à la filiale', () => {
  test('exactement UNE entrée « archivage », sans filiale, décrivant la sortie', async () => {
    const lignes = await lireEnBase(
      base,
      proprietaire,
      `select numero::int as numero, filiale_id, entite_type, entite_id, resume,
              valeurs_avant, valeurs_apres, utilisateur_libelle
         from journal_audit where action = 'archivage' order by numero`,
      [],
      { filiales: [FILIALE_A, FILIALE_B, FILIALE_C] },
    );
    assert.equal(lignes.length, 1, 'ni zéro, ni deux entrées pour un acte');
    const entree = lignes[0];
    assert.equal(entree.filiale_id, null, 'la trace doit être transversale (décision 4)');
    assert.equal(entree.entite_type, 'filiales');
    assert.equal(entree.entite_id, FILIALE_B);
    assert.equal(entree.utilisateur_libelle, 'admin.grc');
    assert.equal(entree.valeurs_avant.statut, 'active');
    assert.equal(entree.valeurs_apres.statut, 'sortie');
    assert.equal(entree.valeurs_apres.date_sortie, '2026-09-30');
    assert.ok(entree.valeurs_apres.lignes_exportees > 0, 'le volume exporté doit être tracé');
    assert.equal(entree.valeurs_apres.pieces_jointes, 1);
    // §29.5 : la phrase est écrite par le développeur, aucune valeur ne s'y glisse.
    assert.ok(!entree.resume.includes(FILIALE_B));
    assert.ok(!entree.resume.includes('ZZESSB'));
  });

  test('LA TRACE RESTE LISIBLE d’un périmètre Groupe après la sortie', async () => {
    // Le périmètre Groupe est celui qui couvre toutes les filiales ACTIVES : après
    // la sortie, c'est [A, C]. `pol_journal_audit_lecture` rend les entrées sans
    // filiale au seul périmètre Groupe — c'est-à-dire à la direction, qui est
    // exactement celle à qui un auditeur demandera cette preuve.
    const lue = await base.avecPerimetre(
      applicatif,
      perimetre('direction', FILIALE_A, [FILIALE_A, FILIALE_C]),
      async (c) =>
        (await c.query("select count(*)::int as n from journal_audit where action = 'archivage'"))
          .rows[0].n,
    );
    assert.equal(lue, 1, 'la preuve de la sortie doit rester lisible de la direction');
  });

  test('et elle NE l’est PAS depuis un périmètre d’une seule filiale', async () => {
    // Sans la troisième filiale, ce contrôle serait faux : un périmètre d'une
    // seule filiale serait « Groupe » dès qu'il ne resterait qu'elle.
    const lue = await base.avecPerimetre(
      applicatif,
      perimetre('rssi.tls', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (await c.query("select count(*)::int as n from journal_audit where action = 'archivage'"))
          .rows[0].n,
    );
    assert.equal(lue, 0, 'une entrée transversale ne doit pas descendre à une filiale');
  });
});

/* =====================================================================
 *  §4 — MORSURE, classe dure : l'atomicité
 * ===================================================================== */

describe('§4 — une sortie qui échoue ne laisse AUCUNE trace', () => {
  test('MORSURE : la seconde écriture cassée, la première a disparu', async () => {
    const avantStatut = await compter(
      "select count(*) from filiales where id = $1 and statut = 'active'",
      [FILIALE_C],
    );
    assert.equal(avantStatut, 1, 'matière : la filiale doit être active avant la morsure');
    const avantArchivages = await compter("select count(*) from journal_audit where action = 'archivage'");

    // Un client qui laisse passer l'export et la bascule, et fait échouer la
    // TRACE : c'est la panne qu'on redoute, et la seule façon de prouver que la
    // transaction couvre les deux écritures.
    const casse = {
      query: async (texte, valeurs) => {
        if (typeof texte === 'string' && texte.includes('insert into "journal_audit"')) {
          throw new Error('panne simulée pendant l’écriture de la trace');
        }
        return await applicatif.query(texte, valeurs);
      },
    };

    let leve = null;
    try {
      await base.avecPerimetre(
        applicatif,
        perimetre('admin.grc', FILIALE_C, [FILIALE_A, FILIALE_C], true),
        async () =>
          cycle.sortirFiliale(
            casse,
            {
              utilisateurId: 'admin.grc',
              filialeId: FILIALE_C,
              filiales: [FILIALE_A, FILIALE_C],
              perimetreGroupe: true,
              administrationGroupe: true,
            },
            FILIALE_C,
            '2026-09-30',
          ),
        { annuler: false },
      );
    } catch (erreur) {
      leve = erreur;
    }

    assert.ok(leve !== null, 'la panne simulée doit remonter : sans erreur, rien n’est prouvé');
    assert.equal(
      await compter("select count(*) from filiales where id = $1 and statut = 'active'", [FILIALE_C]),
      1,
      'LE STATUT A ÉTÉ BASCULÉ SANS SA TRACE : les deux écritures ne sont pas dans la même ' +
        'transaction, et le produit peut sortir une filiale sans que rien ne l’atteste',
    );
    assert.equal(
      await compter("select count(*) from filiales where id = $1 and statut = 'sortie'", [FILIALE_C]),
      0,
    );
    assert.equal(
      await compter("select count(*) from journal_audit where action = 'archivage'"),
      avantArchivages,
      'aucune entrée d’archivage ne doit avoir survécu à l’échec',
    );
  });

  test('CONTRÔLE DE MORSURE : la même sortie réussit une fois la panne retirée', async () => {
    const reponse = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_C },
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
    assert.equal(
      await compter("select count(*) from filiales where id = $1 and statut = 'sortie'", [FILIALE_C]),
      1,
      'sans ce contrôle, la morsure ci-dessus serait verte sur un chemin toujours en panne',
    );
    // La date par défaut est celle du jour, et elle est réellement posée.
    assert.match(reponse.corps.filiale.date_sortie, /^\d{4}-\d{2}-\d{2}$/u);
  });
});

/* =====================================================================
 *  §5 — Les refus, et d'où ils viennent
 * ===================================================================== */

describe('§5 — ce qui est refusé, et par quel contrôle', () => {
  const rendreLaSession = () => session.poser(perimetreAdmin(), DROITS_ADMIN);

  test('une filiale DÉJÀ SORTIE rend 409, et dit où passe son export', async () => {
    rendreLaSession();
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_B },
    });
    assert.equal(statut, 409);
    assert.match(String(corps.message ?? ''), /déjà sortie/iu);
    assert.match(String(corps.message ?? ''), /propriétaire/iu);
  });

  test('un périmètre Groupe en LECTURE seule ne sort aucune filiale', async () => {
    session.poser(
      perimetreDe('direction', FILIALE_A, [FILIALE_A, FILIALE_C], {
        perimetreGroupe: true,
        administrationGroupe: false,
      }),
      DROITS_ADMIN,
    );
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_A },
    });
    assert.equal(statut, 403);
    assert.match(String(corps.message ?? ''), /administration Groupe/iu);
    rendreLaSession();
  });

  test('SANS LE DROIT D’EXPORT, la sortie est refusée — c’est la moitié de Q-89', async () => {
    // ── La raison d'être de `action: 'exporter'` sur cette route ─────────
    //
    // La route rend l'extraction complète d'une filiale. Déclarée `administrer`,
    // elle l'aurait livrée à qui porte le profil Administration sans porter le
    // groupe d'export — c'est-à-dire un export complet, silencieux, hors
    // permission. `deciderAcces` ne regarde `droits.export` que si l'action
    // déclarée est `exporter`.
    session.poser(perimetreAdmin(), profil('administration', { export: false }));
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_A },
    });
    assert.equal(statut, 403, 'un administrateur sans droit d’export sort une filiale entière');
    assert.match(String(corps.message ?? ''), /export/iu);
    rendreLaSession();
  });

  test('un niveau « contribution » ne suffit pas, même avec le droit d’export', async () => {
    session.poser(perimetreAdmin(), profil('contribution', { export: true }));
    const { statut } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_A },
    });
    assert.equal(statut, 403);
    rendreLaSession();
  });

  test('une filiale hors du périmètre de LECTURE est refusée, en le disant', async () => {
    session.poser(
      perimetreDe('admin.local', FILIALE_A, [FILIALE_A], { administrationGroupe: true }),
      DROITS_ADMIN,
    );
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_C },
    });
    assert.equal(statut, 403);
    assert.equal(corps.erreur, 'hors_perimetre');
    assert.match(String(corps.message ?? ''), /on n’exporte pas ce que l’on ne lit pas/iu);
    rendreLaSession();
  });

  test('un champ inconnu est REFUSÉ, pas ignoré, et il est nommé', async () => {
    rendreLaSession();
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_A, statut: 'sortie' },
    });
    assert.equal(statut, 400);
    assert.match(String(corps.message ?? ''), /« statut »/u);
    assert.equal(
      await compter("select count(*) from filiales where id = $1 and statut = 'active'", [FILIALE_A]),
      1,
      'un corps refusé n’écrit rien',
    );
  });

  test('une date mal formée dit comment l’écrire', async () => {
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: FILIALE_A, date_sortie: '30/09/2026' },
    });
    assert.equal(statut, 400);
    assert.match(String(corps.message ?? ''), /AAAA-MM-JJ/u);
  });

  test('une filiale inconnue rend 404, sans prétendre qu’elle existe ailleurs', async () => {
    const { statut, corps } = await serveur.appeler('POST', chemins.sortie, {
      corps: { filiale_id: 'FIL-INEXISTANTE' },
    });
    // Hors périmètre de lecture AVANT d'être inconnue : le contrôle de portée
    // passe en premier, et c'est le bon ordre — on ne dit pas à qui n'a pas le
    // droit de lire si la ligne existe.
    assert.ok(statut === 403 || statut === 404, `statut inattendu : ${String(statut)}`);
    assert.ok(typeof corps.message === 'string' && corps.message.length > 0);
  });
});

/* =====================================================================
 *  §6 — Mécanique : la déclaration d'accès, telle que Fastify la porte
 * ===================================================================== */

describe('§6 — le refus vient de la DÉCLARATION, pas d’une garde', () => {
  test('la route porte les quatre exigences, lues chez Fastify', () => {
    const route = serveur.toutesRoutes.find(
      (r) => r.url === chemins.sortie && String(r.methode).toUpperCase().includes('POST'),
    );
    assert.notEqual(route, undefined, 'la route n’est pas montée : le harnais ne mesure rien');
    assert.deepEqual(route.acces, {
      action: 'exporter',
      domaine: 'administration',
      niveau: 'administration',
      perimetre: 'administration-groupe',
    });
  });

  test('LA DÉCLARATION A DES DENTS : deciderAcces refuse sans droit d’export', async () => {
    // On interroge la fonction du produit, avec la déclaration lue chez Fastify —
    // pas une copie. Sans ce contrôle, « la route déclare X » serait vrai d'un X
    // qui ne refuserait rien.
    const droits = await moduleCompile('api/droits.js');
    const route = serveur.toutesRoutes.find(
      (r) => r.url === chemins.sortie && String(r.methode).toUpperCase().includes('POST'),
    );
    const sans = droits.deciderAcces(
      profil('administration', { export: false }),
      route.acces.action,
      route.acces.domaine,
      route.acces.niveau,
    );
    assert.notEqual(sans, null, 'la déclaration n’exige pas le droit d’export');

    const avec = droits.deciderAcces(
      profil('administration', { export: true }),
      route.acces.action,
      route.acces.domaine,
      route.acces.niveau,
    );
    assert.equal(avec, null, 'contrôle symétrique : un profil complet doit passer');
  });

  test('aucune garde « 403 » ne refuse un DROIT dans le greffon', async () => {
    // Les deux `403` du fichier constatent un refus de la BASE sur une ligne
    // (`hors_perimetre`), jamais un droit : un droit se refuse dans `onRequest`,
    // de façon déclarative et dénombrable.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'cycle', 'index.ts'), 'utf8');
    const gardes = [...source.matchAll(/statut:\s*403/gu)];
    for (const _ of gardes) void _;
    const codes = [...source.matchAll(/code:\s*'([a-z_]+)',\s*\n\s*statut:\s*403/gu)].map((m) => m[1]);
    assert.equal(
      gardes.length,
      codes.length,
      'un 403 du greffon ne porte pas de code applicatif : impossible de dire ce qu’il refuse',
    );
    assert.deepEqual(
      [...new Set(codes)],
      ['hors_perimetre'],
      'un refus de DROIT est écrit dans la route : il doit venir de la déclaration d’accès',
    );
  });

  test('le greffon ne fabrique aucun drapeau d’administration Groupe', async () => {
    // ── Le MÊME motif que le balayage du dépôt (`test/api/routes.test.mjs`) ──
    //
    // Il est rejoué ici pour que le défaut se voie à l'écriture du lot, et non à
    // la porte de sécurité suivante. Il a d'ailleurs mordu : une DÉCLARATION de
    // paramètre TypeScript — `administrationGroupe: boolean` — a exactement la
    // forme d'une affectation, et le balayage l'accuse. À juste titre : un motif
    // qui distinguerait les deux serait un motif de plus à tenir juste. Le
    // paramètre a été renommé.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'cycle', 'index.ts'), 'utf8');
    const motif = /(^|[^\w])administrationGroupe\s*[:=][^=]/u;
    const lignes = source.split('\n').filter((l) => motif.test(l.replace(/\/\/.*$/u, '')));
    assert.deepEqual(lignes, [], 'une route vérifie un droit, elle ne se l’accorde pas (§17.4)');
    // Contrôle de morsure : sans lui, « aucune ligne » vaudrait pour un motif mort.
    assert.equal(motif.test('  administrationGroupe: true,'), true);
    assert.equal(motif.test('perimetre.administrationGroupe && x'), false);
  });
});
