/**
 * reprise-route.test.mjs — `POST /api/reprise`, la vraie réponse au bloquant B-3.
 *
 * ── Pourquoi cette route existe, et pourquoi ce fichier avec elle ────────────
 *
 * Le constat **B-3** de la porte S2 : l'import « Remplacer » n'était pas une opération
 * composite mais « une rafale de suppressions HTTP indépendantes » — vingt `DELETE`
 * dont une coupure de VPN au milieu laissait la filiale à moitié détruite, « et l'état
 * intermédiaire est parfaitement observable par les autres utilisateurs ».
 *
 * Le correctif immédiat a été de refuser le mode « Remplacer » côté navigateur. Ce
 * n'était qu'un pansement, et il est dit comme tel. La réponse est ici : **une route
 * qui prend le fichier entier et l'applique en UNE transaction**.
 *
 * L'agent API a d'abord refusé de l'écrire, au motif qu'« une route que rien n'exerce
 * est le contraire de la règle du chantier ». Il avait raison. Ce fichier lève
 * l'objection : la route est exercée, dans ses succès comme dans ses refus.
 *
 * ── Ce qui se joue ici, et qui ne se joue nulle part ailleurs ────────────────
 *
 *  · **Tout ou rien sur un rayon d'action maximal** (contrôle S14). Ailleurs une
 *    opération composite touche quelques lignes ; ici elle touche le jeu de données
 *    d'une filiale entière. Un échec au milieu est la destruction que B-3 décrivait.
 *  · **Les identifiants du fichier redeviennent les clés primaires** — la propriété
 *    que `CONVENTIONS.md` §2 appelle « ce qui rend l'import d'un export grc-backup
 *    exact au round-trip », et que la route de création ordinaire a dû abandonner
 *    pour fermer l'oracle d'existence du constat M-3. Elle survit ICI ou nulle part.
 *  · **L'aperçu applique vraiment, puis annule.** Ce qui est montré est ce qui se
 *    produirait, contraintes de la base comprises. Encore faut-il vérifier que le
 *    « puis annule » est vrai — sinon l'aperçu est une écriture déguisée.
 *  · **L'idempotence** : réimporter deux fois le même fichier ne duplique pas son
 *    contenu (`PLAN_SERVEUR` §5).
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  enveloppe,
  exportAncienVolumineux,
  fichier,
  instantane,
  instantaneV12Complet,
} from '../reprise/jeux-essai.mjs';
import { monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Le vrai serveur, résolveur provisoire : une session de FILIALE, sans habilitation. */
let serveur;
/**
 * Le greffon avec un périmètre d'ADMINISTRATION GROUPE.
 *
 * Le drapeau ne peut plus venir que du résolveur de périmètre — aucune route ne le
 * fabrique, et c'est ce qui a fermé le contournement de M-4. Le banc respecte ce
 * contrat : il ne force rien, il monte une session qui DÉTIENT le droit, par le point
 * d'accroche que `OptionsApi` documente pour le lot L3.
 */
let administration;

const lectureA = perimetre('temoin', FILIALE_A, [FILIALE_A]);
const lectureB = perimetre('temoin', FILIALE_B, [FILIALE_B]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
  administration = await monterGreffon(base, {
    utilisateurId: 'administrateur-groupe',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A, FILIALE_B],
    perimetreGroupe: true,
    administrationGroupe: true,
  });
});

after(async () => {
  await serveur?.fermer();
  await administration?.fermer();
  await base?.fermer();
});

/**
 * Envoie un fichier `grc-backup` à la route de reprise.
 *
 * `options.par` choisit la session : par défaut celle du serveur réel — une filiale
 * ordinaire, sans habilitation Groupe.
 */
function reprendre(mode, charge, options = {}) {
  return (options.par ?? serveur).appeler('POST', '/api/reprise', {
    corps: {
      mode,
      ...(options.apercu === true ? { apercu: true } : {}),
      fichier: { nom: options.nom ?? 'export.json', contenu: options.contenu ?? fichier(12, charge) },
    },
  });
}

/** Compte, par une connexion tierce, ce que la base contient réellement. */
async function compter(p = lectureA) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, p, async (c) =>
    (await c.query(
      `select (select count(*) from risques)::int  as risques,
              (select count(*) from clients)::int  as clients,
              (select count(*) from actions)::int  as actions,
              (select count(*) from imports)::int  as imports`,
    )).rows[0]);
}

/** Nombre de reprises tracées dans « imports » — la trace que l'aperçu ne doit pas laisser. */
async function compterImports(p = lectureA) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, p, async (c) =>
    (await c.query('select count(*)::int as n from imports')).rows[0].n);
}

/** Les identifiants d'une collection, vus en base. */
async function identifiants(table, p = lectureA) {
  const client = await base.connexion('app');
  const lignes = await base.avecPerimetre(client, p, async (c) =>
    (await c.query(`select id from ${table} order by id`)).rows);
  return lignes.map((l) => l.id);
}

/* =====================================================================
 *  §1 — L'aperçu
 * ===================================================================== */

describe('L’aperçu applique vraiment, puis annule', () => {
  test('il rend un bilan réel, et n’écrit RIEN — ni donnée, ni trace d’import', async () => {
    const avant = await compter();
    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [{ id: 'RISK-APERCU', nom: 'Vu en aperçu seulement' }],
    }), { apercu: true });

    assert.equal(reponse.statut, 200);
    assert.equal(reponse.corps.applique, false, 'Un aperçu n’applique pas.');
    assert.equal(reponse.corps.bilan.crees.risques, 1, 'Il annonce pourtant ce qui SE PRODUIRAIT.');

    assert.deepEqual(await compter(), avant, 'Rien ne doit avoir été écrit, pas même la ligne d’import.');
    assert.equal((await identifiants('risques')).includes('RISK-APERCU'), false);
  });

  test('L’APERÇU MORD : ce qu’il annonce est ce que la reprise fait ensuite', async () => {
    // Contrôle de morsure de l'aperçu : sans lui, « aperçu » pourrait être une
    // estimation faite à côté de la base — donc fausse le jour où une contrainte
    // refuse ce que l'estimation avait compté.
    const charge = instantane(12, {
      risques: [{ id: 'RISK-ANNONCE', nom: 'Annoncé puis appliqué' }],
      clients: [{ id: 'CLI-ANNONCE', nom: 'Donneur d’ordre annoncé' }],
    });
    const annonce = await reprendre('fusionner', charge, { apercu: true, nom: 'annonce.json' });
    const applique = await reprendre('fusionner', charge, { nom: 'applique.json' });

    assert.equal(applique.statut, 200);
    assert.deepEqual(
      applique.corps.bilan.crees,
      annonce.corps.bilan.crees,
      'Le bilan appliqué doit être celui qui avait été annoncé.',
    );
    assert.ok((await identifiants('risques')).includes('RISK-ANNONCE'));
  });
});

/* =====================================================================
 *  §1 bis — L'aperçu ne renseigne pas l'attaquant (constat N-1)
 * ===================================================================== */

describe('L’aperçu n’est pas un oracle d’existence (constat N-1, contrôle S12)', () => {
  /** Deux sondes identiques à l'identifiant près : l'une prise, l'autre libre. */
  async function sonder(identifiant, options = {}) {
    const charge = instantane(12, { risques: [{ id: identifiant, nom: 'sonde' }] });
    return reprendre('fusionner', charge, {
      nom: `sonde-${identifiant}-${options.apercu === true ? 'apercu' : 'applique'}.json`,
      ...(options.apercu === true ? { apercu: true } : {}),
    });
  }

  test('EN APERÇU : un identifiant pris ailleurs et un identifiant libre sont indiscernables', async () => {
    // Le constat N-1 : le mode aperçu redonnait en une requête ce que la route de
    // création avait cessé de dire (constat M-3) — « cet identifiant existe-t-il dans
    // une filiale que je ne vois pas ? ». Et il ne laissait aucune trace, puisqu'un
    // aperçu n'écrit pas la ligne d'import : la sonde était gratuite ET muette.
    //
    // `RISK-B` appartient à la filiale allemande, invisible d'ici. La réponse doit
    // être la même que pour un identifiant qui n'existe nulle part.
    const pris = await sonder('RISK-B', { apercu: true });
    const libre = await sonder('RISK-CERTAINEMENT-LIBRE-1', { apercu: true });

    assert.equal(pris.statut, libre.statut, 'Les deux statuts doivent être identiques.');
    assert.deepEqual(
      pris.corps.bilan.crees,
      libre.corps.bilan.crees,
      'Le bilan ne doit pas trahir l’existence de la ligne voisine.',
    );
    assert.equal(
      JSON.stringify(pris.corps).includes(FILIALE_B),
      false,
      'La filiale voisine ne doit être nommée nulle part.',
    );
  });

  test('APPLIQUÉ : même indiscernabilité, et la ligne voisine n’est pas touchée', async () => {
    const avantVoisine = await base.avecPerimetre(await base.connexion('app'), lectureB, async (c) =>
      (await c.query("select id, nom from risques where id = 'RISK-B'")).rows);

    const pris = await sonder('RISK-B');
    const libre = await sonder('RISK-CERTAINEMENT-LIBRE-2');
    assert.equal(pris.statut, libre.statut);
    assert.equal(pris.corps.bilan.crees.risques, libre.corps.bilan.crees.risques);

    // ── Ce que cela coûte, et qu'il faut savoir ─────────────────────────────
    //
    // Pour que les deux réponses se ressemblent, l'identifiant pris est RENOMMÉ
    // plutôt que refusé. Le round-trip exact — la propriété que la route de reprise
    // est seule à préserver — cède donc sur ce cas précis, et c'est le bon
    // arbitrage : mieux vaut une reprise fidèle à 99 % qu'un oracle inter-filiales.
    // Le banc le fige pour que ce ne soit pas une surprise le jour où quelqu'un
    // comparera un export à sa reprise.
    const chezMoi = await base.avecPerimetre(await base.connexion('app'), lectureA, async (c) =>
      (await c.query("select id from risques where nom = 'sonde' order by id")).rows);
    assert.ok(chezMoi.length >= 2, 'Les deux sondes doivent avoir été créées.');
    assert.equal(
      chezMoi.some((l) => l.id === 'RISK-B'),
      false,
      'L’identifiant pris ailleurs ne peut pas être réutilisé : il est renommé.',
    );

    const apresVoisine = await base.avecPerimetre(await base.connexion('app'), lectureB, async (c) =>
      (await c.query("select id, nom from risques where id = 'RISK-B'")).rows);
    assert.deepEqual(apresVoisine, avantVoisine, 'La ligne allemande doit être intacte.');
  });

  test('l’aperçu ne laisse AUCUNE trace, l’application en laisse une', async () => {
    // L'autre moitié du constat N-1 : une sonde gratuite est une sonde qu'on peut
    // répéter. La trace d'import est ce qui rendra la répétition visible le jour où
    // le journal d'audit existera (lot L5) ; encore faut-il qu'elle soit écrite —
    // et seulement quand quelque chose a été écrit.
    const avant = await compterImports();
    await sonder('RISK-TRACE-APERCU', { apercu: true });
    assert.equal(await compterImports(), avant, 'Un aperçu n’écrit rien, pas même sa trace.');

    await sonder('RISK-TRACE-APPLIQUEE');
    assert.equal(await compterImports(), avant + 1, 'Une reprise appliquée est tracée.');
  });
});

/* =====================================================================
 *  §2 — Ce que la route conserve, et que la création ordinaire a perdu
 * ===================================================================== */

describe('Les identifiants du fichier redeviennent les clés primaires', () => {
  test('un enregistrement repris garde SON identifiant, au caractère près', async () => {
    // La route de création ordinaire refuse un identifiant proposé (constat M-3) :
    // c'est ici, et seulement ici, que le round-trip exact d'un export survit.
    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [{ id: 'RISK-1720000000000-777', nom: 'Identifiant d’origine' }],
    }), { nom: 'identifiants.json' });
    assert.equal(reponse.statut, 200);

    const ids = await identifiants('risques');
    assert.ok(
      ids.includes('RISK-1720000000000-777'),
      `L’identifiant du fichier doit être celui de la base. Vus : ${ids.join(', ')}`,
    );
  });

  test('la route de CRÉATION, elle, continue de refuser un identifiant proposé', async () => {
    // Contrôle symétrique (§20.2) : ce qui est ouvert ici doit rester fermé là-bas,
    // sans quoi l'oracle d'existence du constat M-3 rouvrirait par la porte de côté.
    const { statut } = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { id: 'RISK-PROPOSE', champs: { nom: 'x' } },
    });
    assert.equal(statut, 400);
  });
});

/* =====================================================================
 *  §3 — Tout ou rien : la réponse au bloquant B-3
 * ===================================================================== */

describe('Tout ou rien sur le jeu de données d’une filiale (contrôle S14)', () => {
  test('un fichier dont UN enregistrement est refusé ne modifie RIEN', async () => {
    // Le cœur du constat B-3. Le fichier est bon d'un bout à l'autre sauf une valeur,
    // et il porte assez d'enregistrements valides AVANT elle pour que l'absence de
    // transaction se voie immédiatement.
    const avant = await compter();
    const avantIds = await identifiants('risques');

    const reponse = await reprendre('remplacer', instantane(12, {
      risques: [
        { id: 'RISK-VALIDE-1', nom: 'Premier, parfaitement valide' },
        { id: 'RISK-VALIDE-2', nom: 'Deuxième, parfaitement valide' },
        { id: 'RISK-FAUTIF', nom: 'Troisième', niveau: 'inexistant dans la liste fermée' },
      ],
    }), { nom: 'fautif.json' });

    assert.notEqual(reponse.statut, 200, 'La reprise devait être refusée.');
    assert.deepEqual(await compter(), avant, 'Aucune suppression, aucune création : rien.');
    assert.deepEqual(
      await identifiants('risques'),
      avantIds,
      'Le jeu de données de la filiale doit être exactement celui d’avant.',
    );
  });

  test('« remplacer » remplace en une fois, et la filiale voisine n’est pas touchée', async () => {
    const avantB = await compter(lectureB);
    const idsBAvant = await identifiants('risques', lectureB);

    const reponse = await reprendre('remplacer', instantane(12, {
      risques: [{ id: 'RISK-APRES-REMPLACEMENT', nom: 'Le seul qui reste' }],
      clients: [{ id: 'CLI-APRES-REMPLACEMENT', nom: 'Donneur d’ordre repris' }],
    }), { nom: 'remplacement.json' });

    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 300));
    assert.equal(reponse.corps.applique, true);

    assert.deepEqual(
      await identifiants('risques'),
      ['RISK-APRES-REMPLACEMENT'],
      'Le mode « remplacer » remplace : c’est son contrat, et il doit être tenu en entier.',
    );
    // Le cloisonnement tient au rayon le plus large que le lot connaisse.
    assert.deepEqual(await compter(lectureB), avantB, 'La filiale voisine n’a pas bougé.');
    assert.deepEqual(await identifiants('risques', lectureB), idsBAvant);
  });

  test('« fusionner » conserve ce qui existait déjà', async () => {
    const avant = await identifiants('risques');
    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [{ id: 'RISK-AJOUTE-PAR-FUSION', nom: 'Ajouté sans rien détruire' }],
    }), { nom: 'fusion.json' });
    assert.equal(reponse.statut, 200);

    const apres = await identifiants('risques');
    for (const ancien of avant) {
      assert.ok(apres.includes(ancien), `« ${ancien} » ne devait pas disparaître d’une fusion.`);
    }
    assert.ok(apres.includes('RISK-AJOUTE-PAR-FUSION'));
  });
});

/* =====================================================================
 *  §4 — Idempotence, plafonds, et ce que les refus laissent voir
 * ===================================================================== */

describe('Les refus de la route de reprise', () => {
  test('le même fichier deux fois est refusé : la reprise est idempotente', async () => {
    const charge = instantane(12, { risques: [{ id: 'RISK-IDEMPOTENCE', nom: 'Une seule fois' }] });
    const premier = await reprendre('fusionner', charge, { nom: 'idem.json' });
    assert.equal(premier.statut, 200);

    const second = await reprendre('fusionner', charge, { nom: 'idem.json' });
    assert.notEqual(second.statut, 200, 'Réimporter le même fichier ne doit pas dupliquer son contenu.');

    const occurrences = (await identifiants('risques')).filter((id) => id === 'RISK-IDEMPOTENCE');
    assert.equal(occurrences.length, 1);
  });

  test('un fichier illisible est refusé par un message écrit pour un exploitant', async () => {
    const reponse = await reprendre('fusionner', null, { contenu: 'ceci n’est pas du JSON', nom: 'x.json' });
    assert.equal(reponse.statut, 400);
    const texte = JSON.stringify(reponse.corps);
    // Contrôle S12 : aucun nom d'objet interne, aucune pile, aucun SQL.
    for (const interdit of ['pg_', 'at Object', 'select ', 'insert into', 'mesure_catalogue']) {
      assert.equal(texte.toLowerCase().includes(interdit.toLowerCase()), false, `« ${interdit} » ne doit pas sortir.`);
    }
    assert.match(reponse.corps.message, /json|fichier/i);
  });

  test('une collection au-delà du plafond refuse la reprise DANS SON ENTIER (S13)', async () => {
    const avant = await compter();
    const trop = Array.from({ length: 20001 }, (_, i) => ({ id: `RISK-VOLUME-${String(i)}`, nom: 'x' }));
    const reponse = await reprendre('remplacer', instantane(12, { risques: trop }), { nom: 'volume.json' });

    assert.notEqual(reponse.statut, 200);
    assert.deepEqual(await compter(), avant, 'Un refus de volume ne doit rien avoir supprimé au passage.');
  });
});

/* =====================================================================
 *  §5 — Un export RÉEL, tel que l'application en produit
 * ===================================================================== */

describe('Un export complet, comme l’application en produit', () => {
  test('les DEUX routes disent la même chose du socle commun — dans les deux sens', async () => {
    // ── Ce que ce test a servi à trouver, et ce qu'il garde ──────────────────
    //
    // Il a d'abord été rouge : le constat M-4 était fermé sur la route de création,
    // et la route de reprise écrivait la même table par un autre chemin — « le
    // remède crée son propre chemin » (`CONVENTIONS.md` §20.3). Une session de
    // filiale posait une correspondance visible des vingt filiales, sans droit à
    // produire et sans journal pour l'attribuer.
    //
    // Le correctif a fait mieux que la parade attendue : **aucun endroit du serveur
    // ne fabrique plus le drapeau d'administration**, il ne peut venir que du
    // résolveur de périmètre. Le test reste, comme garde de non-régression, et il
    // vérifie désormais les deux sens — une porte fermée des deux côtés pour une
    // filiale, ouverte des deux côtés pour une administration. Sans la seconde
    // moitié, il serait satisfait par un serveur où plus personne ne peut tenir le
    // catalogue de correspondances.
    const charge = instantane(12, {
      mappings: [{ id: 'MAP-PAR-LA-REPRISE', theme: 'Correspondance du socle', aide: '', refs: {} }],
    });

    const filialeParLaReprise = await reprendre('fusionner', charge, { nom: 'mappings-filiale.json' });
    const filialeParLaCreation = await serveur.appeler('POST', '/api/entites/mappings', {
      corps: { champs: { theme: 'Correspondance du socle' } },
    });
    assert.equal(filialeParLaCreation.statut, 403, 'La création refuse à une filiale.');
    assert.equal(filialeParLaReprise.statut, 403, 'La reprise doit refuser de la même façon.');

    const adminParLaReprise = await reprendre('fusionner', charge, {
      nom: 'mappings-administration.json',
      par: administration,
    });
    const adminParLaCreation = await administration.appeler('POST', '/api/entites/mappings', {
      corps: { champs: { theme: 'Correspondance posée par le Groupe' } },
    });
    assert.equal(adminParLaCreation.statut, 201, 'La création accepte d’une administration.');
    assert.equal(adminParLaReprise.statut, 200, 'La reprise aussi : les deux routes s’accordent.');
  });

  test('reprendre un export complet est un ACTE D’ADMINISTRATION — refusé à une filiale', async () => {
    // ── Le sens a changé, et c'est une décision, pas une régression ──────────
    //
    // Ce test exigeait naguère qu'un export v12 complet passe, point. Il passait
    // parce que rien ne vérifiait le droit : la route de reprise écrivait le socle
    // commun sans le demander à personne — le contournement du constat M-4 que ce
    // banc avait isolé.
    //
    // Depuis, le drapeau d'administration ne peut plus venir que du résolveur de
    // périmètre. Un export du modèle navigateur porte la surcouche `mappings`, de
    // portée Groupe : le reprendre EST une écriture dans le socle commun aux vingt
    // filiales, donc un acte d'administration. C'est cohérent avec le geste réel —
    // intégrer une société rachetée, c'est créer la filiale puis charger ses
    // données, de bout en bout sous une habilitation Groupe.
    //
    // Le test le dit désormais dans les DEUX sens. Se contenter de passer une
    // session habilitée aurait fait disparaître ce qu'il prouvait.
    const avantRisques = await identifiants('risques');
    const importsAvant = await compterImports();
    assert.ok(avantRisques.length > 0, 'Le scénario n’a de sens que si la filiale a des données à perdre.');

    const reponse = await reprendre('remplacer', instantaneV12Complet(), { nom: 'complet-filiale.json' });

    assert.equal(reponse.statut, 403, JSON.stringify(reponse.corps).slice(0, 300));
    assert.equal(reponse.corps.erreur, 'hors_perimetre');
    assert.equal(reponse.corps.code_grc, undefined, 'Un refus de droit n’est pas un conflit de version.');
    assert.match(reponse.corps.message, /administration Groupe/i);

    // Le refus doit DÉSIGNER ce qui l'a provoqué — sans quoi l'exploitant reçoit
    // « c'est du socle commun » sans savoir quelle partie de son fichier l'est.
    //
    // La désignation a déjà changé de place une fois : elle était dans la phrase
    // (« Ce fichier apporte des données de portée Groupe (mappings) ») quand le
    // contrôle vivait dans la route ; elle est dans le champ « entite » depuis qu'il
    // vit dans le moteur — ce qui couvre plus de chemins, et c'est mieux. Le test
    // exige donc la PROPRIÉTÉ, pas l'endroit : que l'information soit là.
    const designation = `${reponse.corps.message} ${String(reponse.corps.entite ?? '')}`;
    assert.match(
      designation,
      /mappings/,
      `Le refus ne désigne pas la collection en cause : ${JSON.stringify(reponse.corps)}`,
    );

    // ── Le refus précède l'écriture, et cela se vérifie par ses traces ──────
    //
    // « Rien du fichier n'est en base » ne suffit pas : en mode « remplacer », la
    // purge de la filiale vient AVANT l'application, et un contrôle placé après elle
    // laisserait une filiale vidée. On vérifie donc les trois traces qu'un refus
    // tardif laisserait — les données d'origine, la ligne de journal d'import, et le
    // compte des collections.
    const apres = await identifiants('risques');
    assert.equal(apres.includes('RISK-1720000000000-104'), false, 'Rien du fichier ne doit être en base.');
    assert.deepEqual(apres, avantRisques, 'La filiale ne doit pas avoir été purgée avant le refus.');
    assert.equal(
      await compterImports(),
      importsAvant,
      'Un refus n’est pas une reprise : il ne laisse pas de trace d’import.',
    );
  });

  test('… et ACCEPTÉ d’une administration Groupe : les 21 collections traversent', async () => {
    // L'autre moitié, et elle compte autant (§20.2, « un garde-fou se vérifie dans
    // les deux sens ») : sans elle, ce fichier serait satisfait par un serveur où
    // PERSONNE ne peut plus migrer une filiale — ce qui fermerait la porte S2 en
    // supprimant la fonction plutôt qu'en la protégeant.
    const reponse = await reprendre('remplacer', instantaneV12Complet(), {
      nom: 'complet-administration.json',
      par: administration,
    });
    assert.equal(
      reponse.statut,
      200,
      `Une administration Groupe doit pouvoir migrer une filiale. Refus : ${JSON.stringify(reponse.corps).slice(0, 400)}`,
    );

    const creees = Object.entries(reponse.corps.bilan.crees).filter(([, n]) => n > 0).map(([nom]) => nom);
    assert.ok(creees.includes('mappings'), 'La surcouche de correspondances doit être reprise.');
    assert.ok(creees.length >= 15, `Collections reprises : ${creees.join(', ')}`);
    assert.deepEqual(reponse.corps.rapport.anomalies ?? [], [], 'Un export sain ne produit aucune anomalie.');
  });

  test('LE DROIT MORD : la même session, les deux fichiers, deux verdicts opposés', async () => {
    // Contrôle de morsure du couple. Il ne suffit pas que le refus et l'acceptation
    // existent : il faut que ce soit L'HABILITATION qui les sépare, et rien d'autre.
    // On envoie donc le MÊME contenu, à la même route, à la même seconde, et l'on
    // ne fait varier que la session. Si les deux verdicts se rejoignaient — dans un
    // sens ou dans l'autre — ce fichier ne prouverait plus rien.
    const charge = instantane(12, {
      mappings: [{ id: 'MAP-MORSURE', theme: 'Correspondance du socle', aide: '', refs: {} }],
    });
    const contenu = fichier(12, charge);

    const parLaFiliale = await reprendre('fusionner', null, { contenu, nom: 'morsure-filiale.json' });
    const parLAdministration = await reprendre('fusionner', null, {
      contenu,
      nom: 'morsure-administration.json',
      par: administration,
    });

    assert.equal(parLaFiliale.statut, 403);
    assert.equal(parLAdministration.statut, 200);
    assert.notEqual(
      parLaFiliale.statut,
      parLAdministration.statut,
      'Seule l’habilitation distingue ces deux appels : si elle cessait de compter, ils se rejoindraient.',
    );

    // Symétrie utile : un fichier SANS collection de portée Groupe ne demande aucune
    // habilitation. Sans ce contrôle, l'exigence pourrait s'être élargie à tout, et
    // la migration d'une filiale ordinaire deviendrait impossible sans le dire.
    const sansSocle = fichier(12, instantane(12, {
      risques: [{ id: 'RISK-SANS-SOCLE', nom: 'Purement local' }],
    }));
    const ordinaire = await reprendre('fusionner', null, { contenu: sansSocle, nom: 'sans-socle.json' });
    assert.equal(ordinaire.statut, 200, 'Une reprise purement locale ne doit exiger aucune habilitation.');
  });
});

/* =====================================================================
 *  §6 — Un export tel qu'un client en enverrait
 * ===================================================================== */

describe('Le dernier chemin non éprouvé : un vieil export réel, de bout en bout', () => {
  test('un export v6 volumineux traverse six paliers ET atterrit en base', async () => {
    // Ce que `PLAN_SERVEUR` §2.6 désigne comme LE chemin de migration, et que rien
    // n'avait parcouru en entier : un fichier produit par un site resté en version
    // locale — ancien, volumineux, aux conventions de son époque — lu, monté de v6 à
    // v12, puis appliqué à PostgreSQL en une transaction.
    //
    // Les tests de `test/reprise/**` éprouvent le portage sans base ; ceux du §1 au
    // §5 éprouvent la route sur des jeux courts et actuels. Entre les deux, il restait
    // ce trou : personne n'avait vérifié qu'un fichier RÉEL survivait aux deux moitiés
    // bout à bout.
    const ancien = exportAncienVolumineux({ parCollection: 30 });
    const contenu = JSON.stringify(enveloppe(6, ancien));
    const enregistrements = Object.values(ancien).filter(Array.isArray).reduce((s, a) => s + a.length, 0);
    assert.ok(enregistrements > 200, `Le fichier doit être volumineux : ${String(enregistrements)}.`);

    const reponse = await reprendre('remplacer', null, { contenu, nom: 'export-site-2024.json' });
    assert.equal(
      reponse.statut,
      200,
      `Un export v6 réel doit être reprisable : ${JSON.stringify(reponse.corps).slice(0, 400)}`,
    );

    // Les six paliers ont bien été traversés — sinon on aurait éprouvé un v12 déguisé.
    assert.equal(reponse.corps.rapport.version_origine, 6);
    assert.equal(reponse.corps.rapport.version_cible, 12);
    assert.equal(reponse.corps.rapport.paliers.length, 6, 'v6 → v12, c’est six paliers.');

    // Et tout est arrivé : le compte des créations doit égaler celui du fichier.
    const crees = Object.values(reponse.corps.bilan.crees).reduce((s, n) => s + n, 0);
    assert.equal(crees, enregistrements, 'Chaque enregistrement du fichier doit avoir atterri.');
  });

  test('les identifiants SANS suffixe aléatoire sont rendus tels quels', async () => {
    // La convention d'avant le chantier 9 : `RISK-1699123456789`, sans aléa. Le
    // domaine `id_metier` les accepte, et c'est la route de reprise — seule — qui
    // préserve encore l'identifiant du fichier depuis le constat M-3. Si elle les
    // réécrivait, réimporter un export ne serait plus un round-trip mais une copie.
    const ancien = exportAncienVolumineux({ parCollection: 8, base: 1_699_500_000_000 });
    await reprendre('remplacer', null, {
      contenu: JSON.stringify(enveloppe(6, ancien)),
      nom: 'export-identifiants.json',
    });

    const attendus = ancien.risques.map((r) => r.id).sort();
    assert.match(attendus[0], /^RISK-\d+$/, 'Le jeu doit bien porter des identifiants sans aléa.');
    assert.deepEqual(await identifiants('risques'), attendus);
  });

  test('les paliers ont VRAIMENT converti : le MCO et les évaluations sont au format d’aujourd’hui', async () => {
    // Contrôle de matière du test précédent : « 200 » ne dit pas que la migration a
    // fait quelque chose. On vérifie les deux conversions que ce fichier impose —
    // celles qui, mal faites, feraient perdre du sens sans faire échouer la reprise.
    const ancien = exportAncienVolumineux({ parCollection: 6, base: 1_699_900_000_000 });
    const reponse = await reprendre('remplacer', null, {
      contenu: JSON.stringify(enveloppe(6, ancien)),
      nom: 'export-paliers.json',
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 300));

    const jeu = (await serveur.appeler('GET', '/api/donnees')).corps.data;

    // v9 → v10 : { etat, date, notes } devient un suivi d'action planifiée.
    const mco = jeu.mco_actions[0];
    assert.ok(mco, 'Le MCO doit avoir été repris.');
    assert.equal(Object.hasOwn(mco, 'etat'), false, 'L’ancien champ ne doit plus exister.');
    assert.ok(
      ['À planifier', 'En cours', 'Réalisée', 'Annulée'].includes(mco.statut),
      `Statut converti attendu, vu « ${String(mco.statut)} ».`,
    );

    // v11 → v12 : « mesure_id » unique devient « mesure_ids[] ».
    const evaluation = jeu.evaluations.find((e) => (e.mesure_ids ?? []).length > 0);
    assert.ok(evaluation, 'Le lien exigence → mesure doit avoir survécu au palier v12.');
    assert.equal(Object.hasOwn(evaluation, 'mesure_id'), false);

    // Et rien n'a été inventé : un export v6 ne porte ni correspondances, ni
    // historique, ni annuaire, et la reprise ne doit pas en fabriquer.
    //
    // La mesure porte sur ce que CETTE reprise a créé, pas sur le contenu de la
    // table : `mappings` est de niveau Groupe et survit donc au « remplacer », qui
    // ne purge que la filiale. Compter les lignes ferait dépendre le verdict des
    // tests joués avant — un test dont l'ordre décide du résultat ne mesure rien.
    for (const absente of ['mappings', 'history', 'personnes']) {
      assert.equal(
        reponse.corps.bilan.crees[absente] ?? 0,
        0,
        `« ${absente} » n’existait pas en v6 : la reprise ne doit rien y créer.`,
      );
    }
    assert.ok(Array.isArray(jeu.personnes), 'La collection existe côté modèle, même vide.');
  });

  test('TOUT jeu d’essai de la reprise est acceptable au SCHÉMA, pas seulement au module', async () => {
    // ── La leçon du jeu d'essai fautif, transformée en garde-fou ──────────────
    //
    // `jeux-essai.mjs` portait une action rattachée aux cinq parents à la fois. Le
    // module de reprise l'acceptait — il ne connaît aucune règle métier, et il a
    // raison de n'en connaître aucune —, si bien que les tests de round-trip
    // passaient sur un enregistrement que PostgreSQL refuse. Ils prouvaient donc
    // moins qu'ils n'en avaient l'air : **un jeu d'essai qui ne pourrait pas exister
    // en base fait mesurer autre chose que le produit.**
    //
    // ── Pourquoi ce test-ci passe par une ADMINISTRATION ─────────────────────
    //
    // Il mesure UNE chose : est-ce que le schéma accepte ces enregistrements ? Le
    // droit d'écrire le socle commun est une autre question, et elle a son propre
    // test (« reprendre un export complet est un acte d'administration »). Les jouer
    // ici sous une session de filiale les ferait échouer pour DÉFAUT DE DROIT, ce
    // qui masquerait exactement ce que ce test cherche — un refus du schéma.
    //
    // Le risque de cette séparation est qu'un refus de droit se glisse dans le
    // résultat sans qu'on le voie. Il est fermé : les deux natures de refus sont
    // distinguées ci-dessous, et un `hors_perimetre` fait échouer ce test avec un
    // message qui renvoie à l'autre.
    const jeux = [
      ['v1 minimal', 1, instantane(1, { risques: [{ id: 'RISK-1699000000001', nom: 'Risque d’un vieux poste' }] })],
      ['v6 volumineux', 6, exportAncienVolumineux({ parCollection: 6, base: 1_697_000_000_000 })],
      ['v12 complet', 12, instantaneV12Complet()],
    ];

    const refusDeSchema = [];
    const refusDeDroit = [];
    for (const [nom, version, charge] of jeux) {
      // « remplacer », et non « fusionner » : la purge de la filiale précède
      // l'application, si bien que le verdict ne dépend pas de ce que les tests
      // précédents ont laissé — une unicité métier (un code d'exigence, un point
      // d'historique du jour) ferait sinon échouer le jeu pour la mauvaise raison.
      // L'aperçu annule le tout ensuite.
      const reponse = await administration.appeler('POST', '/api/reprise', {
        corps: {
          mode: 'remplacer',
          apercu: true,
          fichier: { nom: `${nom}.json`, contenu: JSON.stringify(enveloppe(version, charge)) },
        },
      });
      if (reponse.statut === 200) continue;
      const ligne = `${nom} → ${String(reponse.statut)} ${JSON.stringify(reponse.corps.message ?? '')}`;
      if (reponse.corps.erreur === 'hors_perimetre') refusDeDroit.push(ligne);
      else refusDeSchema.push(ligne);
    }

    assert.deepEqual(
      refusDeDroit,
      [],
      'Ce test mesure le SCHÉMA : un refus de droit ici veut dire que la session du banc a ' +
        'perdu son habilitation, et que le fichier ne mesure plus ce qu’il annonce.',
    );
    assert.deepEqual(
      refusDeSchema,
      [],
      'Chaque entrée est un jeu d’essai qui ne pourrait pas exister en base.',
    );
  });

  test('un vieil export FAUTIF ne laisse rien à moitié repris', async () => {
    // Le tout-ou-rien, sur le rayon le plus large que le lot connaisse : 240
    // enregistrements valides, une valeur refusée à la fin. Sans transaction unique,
    // la filiale serait vidée puis à moitié remplie.
    const avant = await identifiants('risques');
    const ancien = exportAncienVolumineux({ parCollection: 30, base: 1_698_000_000_000 });
    ancien.incidents[ancien.incidents.length - 1].gravite = 'catastrophique';

    const reponse = await reprendre('remplacer', null, {
      contenu: JSON.stringify(enveloppe(6, ancien)),
      nom: 'export-fautif.json',
    });
    assert.notEqual(reponse.statut, 200, 'La reprise devait être refusée.');
    assert.deepEqual(
      await identifiants('risques'),
      avant,
      'Le jeu de données doit être exactement celui d’avant : ni purgé, ni à moitié rempli.',
    );
  });
});
