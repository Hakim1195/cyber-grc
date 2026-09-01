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

    // Le CORPS ENTIER, et pas seulement le bilan : toute différence est le canal.
    // L'horodatage est le seul champ légitimement variable — on le neutralise.
    const comparable = (corps) => JSON.stringify(corps, (cle, valeur) => (cle === 'horodatage' ? '·' : valeur));
    assert.equal(
      comparable(pris.corps),
      comparable(libre.corps),
      'Les deux réponses doivent être indiscernables, champ pour champ.',
    );

    // ── Et surtout : AUCUN compteur de renommage ─────────────────────────────
    //
    // Un compteur exposé « pour la transparence » — « 1 identifiant a été renommé » —
    // rend la sonde PARFAITE sur un fichier d'un seul enregistrement : il répond
    // exactement à la question que le renommage était censé rendre inaudible. Une
    // information honnête peut être un oracle ; c'est l'usage qui décide, pas
    // l'intention.
    const texte = JSON.stringify(pris.corps);
    assert.equal(
      /renomm/i.test(texte),
      false,
      `La réponse ne doit rien dire des renommages : ${texte.slice(0, 250)}`,
    );
    assert.equal(texte.includes(FILIALE_B), false, 'La filiale voisine ne doit être nommée nulle part.');
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
  test('le même fichier se reprend AUTANT DE FOIS QU’ON VEUT, et converge (constat T-4)', async () => {
    // ── Ce que ce test affirmait, et pourquoi c'était faux ───────────────────
    //
    // Il exigeait qu'un fichier déjà repris soit REFUSÉ, au nom de l'idempotence.
    // Le troisième passage de la porte S2 a montré que cette lecture consommait le
    // fichier pour toujours : on ne pouvait plus restaurer deux fois la même
    // sauvegarde, ni fusionner puis remplacer avec le même fichier. Or c'est un geste
    // légitime — et c'est le scénario même du plan de reprise d'activité que ce
    // produit héberge (constat T-4).
    //
    // L'idempotence n'a jamais été « refuser le second appel » : c'est **converger**.
    // Rejouer un fichier doit rendre le même état, pas une erreur. L'assertion qui
    // portait cette propriété — une occurrence, pas deux — est restée telle quelle ;
    // c'est celle qui avait de la valeur, et elle en a davantage maintenant qu'elle
    // n'est plus protégée par un refus.
    const charge = instantane(12, { risques: [{ id: 'RISK-IDEMPOTENCE', nom: 'Une seule fois' }] });
    const contenu = fichier(12, charge);

    // Quatre reprises du MÊME fichier, dont un changement de mode au milieu : c'est
    // la séquence d'une restauration réelle — on fusionne, on hésite, on remplace.
    const sequence = ['fusionner', 'fusionner', 'remplacer', 'fusionner'];
    const refus = [];
    for (const [rang, mode] of sequence.entries()) {
      const reponse = await reprendre(mode, null, { contenu, nom: 'idem.json' });
      if (reponse.statut !== 200) {
        refus.push(`appel ${String(rang + 1)} (${mode}) → ${String(reponse.statut)} ${JSON.stringify(reponse.corps.message ?? '')}`);
      }
    }
    assert.deepEqual(
      refus,
      [],
      'Un fichier n’est pas consommé par sa première reprise : restaurer deux fois la même ' +
        'sauvegarde est le geste normal d’un plan de reprise d’activité.',
    );

    // ── LA propriété : convergence, pas duplication ──────────────────────────
    const occurrences = (await identifiants('risques')).filter((id) => id === 'RISK-IDEMPOTENCE');
    assert.equal(occurrences.length, 1, 'Quatre reprises, un seul enregistrement.');
  });

  test('… et la RÉ-ÉMISSION converge aussi : trois reprises, un seul clone (constat Q-2)', async () => {
    // ── Le chemin que le remède précédent a ouvert ───────────────────────────
    //
    // Le test ci-dessus reprend quatre fois un fichier dont les identifiants sont
    // libres : il éprouve la convergence du chemin NOMINAL. Il ne dit rien du
    // chemin de ré-émission — celui qu'emprunte un identifiant déjà pris dans le
    // domaine global par une ligne que l'appelant ne peut pas voir.
    //
    // Or c'est précisément là que la levée du verrou d'idempotence a ouvert une
    // porte : tant que le second passage était refusé, une ré-émission tirée au
    // hasard ne pouvait pas se répéter. Une fois le fichier rejouable, chaque
    // reprise fabriquait un clone de plus, et la référence suivait le dernier —
    // trois lignes pour un enregistrement. Septième occurrence du motif que ce
    // chantier connaît bien : le remède crée son propre chemin.
    //
    // La propriété n'est donc pas « l'identifiant ré-émis est imprévisible », mais
    // « il est LE MÊME d'une reprise à l'autre ». Elle se mesure au compte de
    // lignes, jamais à la valeur — qui, elle, ne doit rien apprendre à personne.
    const contenu = fichier(12, instantane(12, {
      // « RISK-B » appartient à la filiale voisine, invisible d'ici : c'est ce qui
      // déclenche la ré-émission (constat N-1).
      risques: [{ id: 'RISK-B', nom: 'Enregistrement dont l’identifiant est pris ailleurs' }],
      actions: [{ id: 'ACT-REEMISSION', titre: 'action qui vise le renommé', risque_id: 'RISK-B' }],
    }));

    const apresChaquePassage = [];
    for (let passage = 0; passage < 3; passage += 1) {
      const reponse = await reprendre('fusionner', null, { contenu, nom: 'reemission.json' });
      assert.equal(reponse.statut, 200, `Passage ${String(passage + 1)} : ${JSON.stringify(reponse.corps).slice(0, 200)}`);
      const vues = await base.avecPerimetre(await base.connexion('app'), lectureA, async (c) =>
        (await c.query(
          "select id from risques where nom = 'Enregistrement dont l’identifiant est pris ailleurs' order by id",
        )).rows);
      apresChaquePassage.push(vues.map((l) => l.id));
    }

    // ── LA stabilité, passage par passage ───────────────────────────────
    // C'est la propriété, et elle se lit mieux ici qu'à la fin : si le troisième
    // passage seul était compté, une ré-émission qui alterne entre deux valeurs
    // passerait un tour sur deux. On exige l'IDENTITÉ, pas seulement le compte.
    assert.deepEqual(
      apresChaquePassage[1],
      apresChaquePassage[0],
      'La deuxième reprise doit RETROUVER la ligne de la première, au même identifiant.',
    );
    assert.deepEqual(
      apresChaquePassage[2],
      apresChaquePassage[0],
      'Et la troisième aussi : une dérivation déterministe ne dépend pas du rang du passage.',
    );

    const client = await base.connexion('app');
    const lignes = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query(
        "select id from risques where nom = 'Enregistrement dont l’identifiant est pris ailleurs'",
      )).rows);
    assert.equal(
      lignes.length,
      1,
      `Trois reprises du même fichier ont fabriqué ${String(lignes.length)} enregistrement(s). ` +
        'Une ré-émission tirée au hasard ne retrouve jamais sa ligne : elle en ajoute une.',
    );

    // Et la référence pointe sur ce seul enregistrement, pas sur un clone disparu.
    const [action] = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query("select risque_id from actions where id = 'ACT-REEMISSION'")).rows);
    assert.equal(action.risque_id, lignes[0].id, 'La référence suit l’unique ligne survivante.');

    // Contrôle S12 : rien de ce calcul ne doit transparaître. La réponse ne dit pas
    // qu'un renommage a eu lieu — sinon l'oracle d'existence se rouvrirait par là.
    const derniere = await reprendre('fusionner', null, { contenu, nom: 'reemission.json' });
    assert.equal(/renomm|déjà pris|existe/i.test(JSON.stringify(derniere.corps)), false);
  });

  test('l’empreinte du fichier reste tracée : ce qui est retiré, c’est le VERROU', async () => {
    // Contrôle symétrique du précédent. Lever l'interdiction ne doit pas effacer la
    // trace : l'empreinte reste écrite dans « imports » — c'est elle qui permettra au
    // moteur d'import du lot L7 de reconnaître un fichier déjà vu, et au journal
    // d'audit du lot L5 de dire qui a rejoué quoi. Sans ce test, « on a retiré la clé
    // d'idempotence » pourrait un jour devenir « on a retiré la traçabilité ».
    const contenu = fichier(12, instantane(12, {
      risques: [{ id: 'RISK-EMPREINTE', nom: 'Tracé deux fois' }],
    }));
    await reprendre('fusionner', null, { contenu, nom: 'empreinte.json' });
    await reprendre('fusionner', null, { contenu, nom: 'empreinte.json' });

    const client = await base.connexion('app');
    const traces = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query(
        "select sha256, cle_idempotence from imports where nom_fichier = 'empreinte.json' order by cree_le",
      )).rows);

    assert.equal(traces.length, 2, 'Chaque reprise laisse SA trace, même la seconde.');
    assert.match(traces[0].sha256, /^[0-9a-f]{64}$/, 'L’empreinte du fichier est écrite.');
    assert.equal(traces[1].sha256, traces[0].sha256, 'Et c’est la même : le fichier est reconnu.');
    assert.equal(
      traces.every((l) => l.cle_idempotence === null),
      true,
      'Ce qui a disparu, c’est la clé qui INTERDISAIT le second passage — pas l’empreinte.',
    );
  });

  test('un fichier portant DEUX FOIS le même identifiant est refusé en entier (constat T-2)', async () => {
    // ── Pourquoi ce cas mérite son test ──────────────────────────────────────
    //
    // Le fichier n'est pas produit que par l'application : un exploitant en édite un
    // à la main pour rejouer une restauration partielle, une fusion de deux exports
    // colle deux collections bout à bout, un tableur en recopie une ligne. Le
    // résultat porte deux fois le même identifiant dans la même collection.
    //
    // Une reprise qui « applique dans l'ordre » écrirait le premier, puis le second
    // par-dessus : le second gagne, sans que personne l'ait décidé. C'est un
    // écrasement silencieux — le risque P1 — avec cette aggravation qu'il vient du
    // fichier lui-même et non d'une course entre deux navigateurs, donc qu'aucun
    // verrou optimiste ne peut l'attraper. La seule réponse juste est le refus.
    const avant = await compter();
    const identifiantsAvant = await identifiants('risques');

    const reponse = await reprendre('fusionner', instantane(12, {
      risques: [
        { id: 'RISK-DOUBLE', nom: 'la première ligne' },
        { id: 'RISK-DOUBLE', nom: 'la seconde, qui écraserait la première' },
        { id: 'RISK-VOISIN', nom: 'la ligne innocente du même fichier' },
      ],
    }), { nom: 'doublon.json' });

    assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps).slice(0, 300));
    assert.equal(reponse.corps.erreur, 'donnee_invalide');

    // Le message doit être exploitable : l'identifiant fautif ET la collection où le
    // chercher. « Fichier invalide » enverrait l'exploitant relire dix mille lignes.
    assert.match(reponse.corps.message, /RISK-DOUBLE/, 'Le message doit NOMMER l’identifiant en double.');
    assert.match(reponse.corps.message, /risques/, 'Et la collection où il se trouve.');

    // Contrôle S12 : nommer une donnée du fichier de l'appelant n'est pas divulguer
    // l'état du serveur. Rien d'interne ne doit sortir pour autant.
    const texte = JSON.stringify(reponse.corps).toLowerCase();
    for (const interdit of ['select ', 'insert into', 'pg_', '23505', 'mesure_catalogue', 'at object']) {
      assert.equal(texte.includes(interdit), false, `« ${interdit} » ne doit pas sortir.`);
    }

    // ── Tout ou rien : la ligne innocente n'est pas passée non plus ──────────
    assert.deepEqual(await compter(), avant, 'Un refus de fichier ne doit RIEN avoir écrit — pas même la trace d’import.');
    assert.deepEqual(
      await identifiants('risques'),
      identifiantsAvant,
      'Ni « RISK-DOUBLE », ni « RISK-VOISIN » qui voyageait dans le même fichier.',
    );

    // ── Contrôle symétrique ─────────────────────────────────────────────────
    // Le même fichier, le doublon en moins, doit passer : sans cela le test serait
    // satisfait par une route qui refuse tout fichier comportant plusieurs risques.
    const corrige = await reprendre('fusionner', instantane(12, {
      risques: [
        { id: 'RISK-DOUBLE', nom: 'la première ligne' },
        { id: 'RISK-VOISIN', nom: 'la ligne innocente du même fichier' },
      ],
    }), { nom: 'corrige.json' });
    assert.equal(corrige.statut, 200, JSON.stringify(corrige.corps).slice(0, 300));
    const apres = await identifiants('risques');
    assert.equal(apres.includes('RISK-VOISIN'), true, 'Le fichier corrigé, lui, entre bel et bien.');
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

  test('le garde-fou Groupe tient sur les DEUX chemins d’écriture de la reprise', async () => {
    // ── Deux sites d'appel, pas un ───────────────────────────────────────────
    //
    // La reprise écrit en deux passes : les enregistrements d'abord, les LIAISONS
    // ensuite (les `refs` d'une correspondance, par exemple). Le contrôle du droit
    // vit aux deux endroits, et un test qui n'éprouverait que le premier laisserait
    // le second se faire retirer sans bruit — c'est précisément ainsi que le
    // contournement du constat M-4 était passé la première fois.
    //
    // Chaque chemin est donc joué dans les deux sens : refusé à une filiale, accepté
    // d'une administration.
    const socle = await administration.appeler('POST', '/api/entites/mappings', {
      corps: { champs: { theme: 'Correspondance à enrichir', refs: { anssi: ['M1'] } } },
    });
    assert.equal(socle.statut, 201);
    const existant = socle.corps.enregistrement;

    // Chemin 1 — un ENREGISTREMENT neuf de portée Groupe.
    const neuf = instantane(12, {
      mappings: [{ id: 'MAP-CHEMIN-1', theme: 'Correspondance neuve', aide: '', refs: {} }],
    });
    assert.equal((await reprendre('fusionner', neuf, { nom: 'chemin1-filiale.json' })).statut, 403);
    assert.equal(
      (await reprendre('fusionner', neuf, { nom: 'chemin1-admin.json', par: administration })).statut,
      200,
    );

    // Chemin 2 — une LIAISON ajoutée à un enregistrement Groupe qui existe déjà.
    // Le thème ne change pas : seule la liste des codes s'enrichit. Sans le contrôle
    // du second site, une filiale ajouterait des correspondances au socle commun.
    const enrichi = instantane(12, {
      mappings: [{ ...existant, refs: { anssi: ['M1', 'M2'] } }],
    });
    const parLaFiliale = await reprendre('fusionner', enrichi, { nom: 'chemin2-filiale.json' });
    assert.equal(
      parLaFiliale.statut,
      403,
      `Enrichir les « refs » du socle depuis une filiale doit être refusé : ${JSON.stringify(parLaFiliale.corps).slice(0, 250)}`,
    );
    // ── Et le refus doit venir du contrôle, pas seulement de la base ─────────
    //
    // Mesuré : en retirant le contrôle de ce second site, l'écriture reste refusée —
    // par la RLS de PostgreSQL, `mapping_exigences` étant de niveau Groupe. Ce qui
    // change alors, c'est le MESSAGE : on passe de « cet élément appartient au socle
    // commun » à un générique « cet enregistrement, ou l'un des éléments qu'il
    // désigne, n'existe pas dans votre périmètre » — qui envoie l'exploitant chercher
    // une donnée manquante là où il n'y a qu'un droit qui manque.
    //
    // Le contrôle du second site achète donc un diagnostic juste, pas la barrière.
    // C'est cela que le test tient, et c'est cela qui se perdrait sans lui.
    assert.equal(
      `${parLaFiliale.corps.message} ${String(parLaFiliale.corps.entite ?? '')}`.includes('mappings'),
      true,
      `Le refus du chemin « liaisons » doit désigner le socle : ${JSON.stringify(parLaFiliale.corps).slice(0, 250)}`,
    );
    assert.match(parLaFiliale.corps.message, /socle commun|administration Groupe/i);
    const parLAdministration = await reprendre('fusionner', enrichi, {
      nom: 'chemin2-admin.json',
      par: administration,
    });
    assert.equal(parLAdministration.statut, 200);
    assert.equal(
      parLAdministration.corps.bilan.misAJour.mappings,
      1,
      'Et l’administration doit avoir réellement enrichi la correspondance.',
    );
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

/* =====================================================================
 *  §7 — Deux entités, un même identifiant (constat T-5)
 * ===================================================================== */

describe('Un vieil export où DEUX entités partagent un identifiant', () => {
  /** Les liaisons écrites en base, lues par une connexion tierce. */
  async function liaison(sql) {
    const client = await base.connexion('app');
    return base.avecPerimetre(client, lectureA, async (c) => (await c.query(sql)).rows);
  }

  test('chaque référence suit SON entité, pas la chaîne de caractères', async () => {
    // ── Le cas, et pourquoi il n'a rien d'exotique ───────────────────────────
    //
    // Un identifiant n'est unique que DANS sa collection : rien n'a jamais interdit
    // qu'un risque et un actif portent le même. Les vieux exports en contiennent —
    // les identifiants d'alors n'avaient pas de suffixe aléatoire, et deux modules
    // créés dans la même milliseconde produisaient la même chaîne.
    //
    // Que devient cette chaîne quand la reprise doit renommer l'une des deux ? Ici
    // le risque `RISK-B` est déjà pris par une filiale INVISIBLE, donc renommé
    // (c'est le remède du constat N-1 : on ne refuse pas, on renomme, sans quoi le
    // refus dirait « cette ligne existe ailleurs »). L'actif `RISK-B`, lui, n'entre
    // en collision avec rien et garde son identifiant.
    //
    // Un plan de renommage à plat — une seule table `ancien → nouveau` pour toutes
    // les collections — réécrirait alors AUSSI les références vers l'actif. Le lien
    // « incident → actif » pointerait vers l'identifiant neuf du risque : soit une
    // violation de clé étrangère, soit, si l'identifiant existe par ailleurs, un
    // rattachement silencieusement faux dans un registre d'incidents qui sert de
    // preuve en audit. C'est le constat T-5.
    const charge = instantane(12, {
      risques: [{ id: 'RISK-B', nom: 'le risque homonyme' }],
      // Trois entités, un seul identifiant. Deux d'entre elles sont visées par une
      // RÉFÉRENCE DE CHAMP (`actions.risque_id`, `actions.exigence_id`), la troisième
      // par une LIAISON (`incident_actifs`) : les deux chemins de réécriture du plan
      // sont donc exercés, et non un seul.
      exigences: [{ id: 'RISK-B', code: 'A.5.1', intitule: 'l’exigence homonyme' }],
      actifs: [{ id: 'RISK-B', nom: 'l’actif homonyme', risques_lies: ['RISK-B'] }],
      actions: [
        // `ck_actions_rattachement` n'admet qu'UN parent par action : il en faut donc
        // deux pour viser les deux homonymes.
        { id: 'ACT-RISQUE', titre: 'action rattachée au RISQUE', risque_id: 'RISK-B' },
        { id: 'ACT-EXIGENCE', titre: 'action rattachée à l’EXIGENCE', exigence_id: 'RISK-B' },
      ],
      incidents: [{ id: 'INC-HOMONYME', titre: 'incident touchant l’ACTIF', actifs_touches: ['RISK-B'] }],
    });

    const reponse = await reprendre('remplacer', null, {
      contenu: JSON.stringify(enveloppe(6, charge)),
      nom: 'homonymes.json',
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 400));

    const client = await base.connexion('app');
    const [risque] = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query('select id from risques')).rows);
    const [actif] = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query('select id from actifs')).rows);

    // ── L'homonymie est bien résolue, et d'un seul côté ──────────────────────
    assert.equal(actif.id, 'RISK-B', 'L’actif n’entrait en collision avec rien : il garde son identifiant.');
    assert.notEqual(risque.id, 'RISK-B', 'Le risque, lui, se heurtait à une filiale invisible : il est renommé.');
    // On éprouve la PROPRIÉTÉ, pas la forme. La première rédaction épinglait
    // « RISK-<chiffres>-<chiffres> » ; le correctif du quatrième passage a changé
    // l'alphabet du générateur, et ce test est devenu rouge sans qu'aucune
    // propriété n'ait bougé. Un essai qui décrit une mise en forme casse à chaque
    // amélioration de la mise en forme, et on prend l'habitude de le « réparer ».
    // Ce qui compte : l'identifiant est ré-émis par le SERVEUR, il porte le préfixe
    // de SON entité, et il reste recevable par le domaine « id_metier » du schéma.
    assert.ok(risque.id.startsWith('RISK-'), `Le préfixe de l’entité est conservé : ${risque.id}`);
    // La marque « -r- » n'est pas une coquetterie de mise en forme : elle DIT que
    // l'identifiant a été dérivé, et non tiré. C'est elle qui permet à la reprise de
    // savoir, sans calculer une seule empreinte, qu'aucune ré-émission n'a eu lieu
    // dans une filiale — et à l'exploitant de reconnaître une ré-émission au journal.
    assert.ok(
      risque.id.startsWith('RISK-r-'),
      `Un identifiant ré-émis s’annonce comme tel : ${risque.id}`,
    );
    assert.ok(risque.id.length > 'RISK-'.length && risque.id.length <= 64, `Longueur : ${risque.id}`);
    assert.equal(risque.id.trim(), risque.id, 'Ni blanc de bord…');
    assert.equal(risque.id.includes(','), false, '…ni virgule : le domaine « id_metier » les refuse.');

    // ── Chaque référence a suivi la bonne entité ─────────────────────────────
    const [surRisque] = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query("select risque_id from actions where id = 'ACT-RISQUE'")).rows);
    assert.equal(surRisque.risque_id, risque.id, 'La référence vers le RISQUE suit le risque renommé.');

    const [exigence] = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query('select id from exigences')).rows);
    assert.equal(exigence.id, 'RISK-B', 'L’exigence non plus n’entrait en collision avec rien.');
    const [surExigence] = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query("select exigence_id from actions where id = 'ACT-EXIGENCE'")).rows);
    assert.equal(
      surExigence.exigence_id,
      'RISK-B',
      'Et la référence vers l’EXIGENCE ne suit pas le risque : c’est le cas exact que ' +
        'le commentaire du remède décrit — renommer le risque « 7 » réécrivait ' +
        'l’« exigence_id » d’une action qui visait l’EXIGENCE « 7 ».',
    );
    assert.notEqual(surExigence.exigence_id, risque.id);

    const incidentActifs = await liaison('select incident_id, actif_id from incident_actifs');
    assert.deepEqual(
      incidentActifs,
      [{ incident_id: 'INC-HOMONYME', actif_id: 'RISK-B' }],
      'La référence vers l’ACTIF ne bouge pas : ce n’est pas la même entité, même chaîne ou non.',
    );
    assert.notEqual(
      incidentActifs[0].actif_id,
      risque.id,
      'C’est ici qu’un plan de renommage à plat se voit : il aurait rattaché l’incident au risque.',
    );

    const actifRisques = await liaison('select actif_id, risque_id from actif_risques');
    assert.deepEqual(
      actifRisques,
      [{ actif_id: 'RISK-B', risque_id: risque.id }],
      'Et la liaison qui vise LES DEUX à la fois les distingue : l’une renommée, l’autre non.',
    );
  });

  test('CONTRÔLE DE MORSURE : sans homonymie, les deux identifiants sont conservés', async () => {
    // Sans ce contre-essai, le test précédent serait satisfait par une reprise qui
    // renomme systématiquement les risques — ce qui détruirait la propriété du §2
    // (un export repris garde ses identifiants) tout en gardant les assertions
    // vertes. On rejoue la même charge avec un identifiant de risque libre.
    const charge = instantane(12, {
      risques: [{ id: 'RISK-LIBRE', nom: 'aucun homonyme' }],
      actifs: [{ id: 'RISK-LIBRE', nom: 'l’actif homonyme du risque libre', risques_lies: ['RISK-LIBRE'] }],
      actions: [{ id: 'ACT-LIBRE', titre: 'action', risque_id: 'RISK-LIBRE' }],
    });
    const reponse = await reprendre('remplacer', null, {
      contenu: JSON.stringify(enveloppe(6, charge)),
      nom: 'homonymes-libres.json',
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 400));

    assert.deepEqual(await identifiants('risques'), ['RISK-LIBRE'], 'Rien ne justifiait de renommer.');
    assert.deepEqual(await identifiants('actifs'), ['RISK-LIBRE'], 'Et l’homonymie seule n’est pas un motif.');
    assert.deepEqual(
      await liaison('select actif_id, risque_id from actif_risques'),
      [{ actif_id: 'RISK-LIBRE', risque_id: 'RISK-LIBRE' }],
      'Deux entités homonymes reliées l’une à l’autre : la liaison est écrite telle quelle.',
    );
  });
});

/* =====================================================================
 *  §8 — Le geste de MASSE, recompté EN BASE (constat Q-13)
 * =====================================================================
 *
 *  Le quatrième passage de la porte a trouvé, dans le générateur de la reprise,
 *  la troisième réapparition du même défaut : mille valeurs d'aléa, et **un
 *  identifiant engendré par mesure**. Mesuré sur 250 enregistrements dans la même
 *  milliseconde : 231 identifiants distincts sur 250. Les conséquences n'étaient
 *  pas celles qu'on attend d'un défaut d'aléa —
 *
 *   · un `400` qui reprochait au fichier un doublon que le SERVEUR venait de
 *     fabriquer, ce qui envoie l'exploitant corriger un fichier sain ;
 *   · un export ancien parfaitement légitime irreprenable une fois sur neuf.
 *
 *  Le correctif a été démontré par son auteur, sur ses propres scripts, hors
 *  dépôt. Le banc, lui, ne recomptait **jamais en base après un geste de masse** :
 *  ses reprises portent une poignée d'enregistrements, et une collision sur mille
 *  valeurs ne s'y voit pas. C'est le trou que ce paragraphe ferme — et il le ferme
 *  du seul côté qui compte, celui où les lignes atterrissent.
 * ===================================================================== */

describe('Une reprise de 250 mesures, recomptée en base', () => {
  /** Le nombre du constat : 250 tirages dans la même milliseconde. */
  const LOT = 250;

  /** Ce que la base contient pour un marqueur donné, des DEUX côtés de l'entité scindée. */
  async function comptesMesures(marqueur) {
    const client = await base.connexion('app');
    return base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query(
        `select (select count(*)          from mesure_catalogue     where nom like $1)::int as catalogue,
                (select count(distinct id) from mesure_catalogue     where nom like $1)::int as catalogue_distincts,
                (select count(*)          from mesure_mise_en_oeuvre m
                   where exists (select 1 from mesure_catalogue c
                                  where c.id = m.mesure_id and c.nom like $1))::int          as mise_en_oeuvre,
                (select count(distinct m.id) from mesure_mise_en_oeuvre m
                   where exists (select 1 from mesure_catalogue c
                                  where c.id = m.mesure_id and c.nom like $1))::int          as mise_en_oeuvre_distincts`,
        [marqueur],
      )).rows[0]);
  }

  /** Les identifiants du catalogue portant un marqueur, tels qu'ils sont en base. */
  async function identifiantsMesures(marqueur) {
    const client = await base.connexion('app');
    const lignes = await base.avecPerimetre(client, lectureA, async (c) =>
      (await c.query('select id from mesure_catalogue where nom like $1 order by id', [marqueur])).rows);
    return lignes.map((l) => l.id);
  }

  test('250 mesures AVEC identifiant : 250 définitions et 250 mises en œuvre', async () => {
    const mesures = Array.from({ length: LOT }, (_, i) => ({
      id: `MESURE-1699000000000-${String(i)}`,
      nom: `Contrôle de masse n° ${String(i)}`,
      statut: 'conforme',
      maturite: 3,
    }));

    const reponse = await reprendre('fusionner', instantane(12, { mesures }), { nom: 'masse-avec-id.json' });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 400));
    assert.equal(reponse.corps.bilan.crees.mesures, LOT, 'Le bilan doit annoncer les 250.');

    // ── Et la base doit les porter, des deux côtés de l'entité scindée ──────
    const comptes = await comptesMesures('Contrôle de masse n° %');
    assert.deepEqual(
      comptes,
      {
        catalogue: LOT,
        catalogue_distincts: LOT,
        mise_en_oeuvre: LOT,
        mise_en_oeuvre_distincts: LOT,
      },
      'Un bilan qui annonce 250 et une base qui en porte moins est exactement le défaut ' +
        'du bloquant : l’import réussit, et il écrit faux.',
    );

    // Les identifiants du fichier restent les clés primaires (§2, round-trip exact).
    assert.deepEqual(
      await identifiantsMesures('Contrôle de masse n° %'),
      mesures.map((m) => m.id).sort(),
    );
  });

  test('250 mesures SANS identifiant : le serveur en engendre 250 DISTINCTS', async () => {
    // ── Le chemin qui écrivait faux ─────────────────────────────────────────
    //
    // Un export ancien livre des enregistrements sans identifiant exploitable ; la
    // reprise en fabrique un. C'est ici que mille valeurs d'aléa se voyaient — 231
    // distincts sur 250 — et le symptôme n'était pas une ligne perdue en silence :
    // c'était un `400` reprochant au fichier un doublon que le serveur venait
    // d'inventer. L'exploitant partait corriger un fichier sain.
    const mesures = Array.from({ length: LOT }, (_, i) => ({
      nom: `Contrôle anonyme n° ${String(i)}`,
      statut: 'partiellement conforme',
      maturite: 2,
    }));
    const contenu = fichier(12, instantane(12, { mesures }));

    const reponse = await reprendre('fusionner', null, { contenu, nom: 'masse-sans-id.json' });
    assert.equal(
      reponse.statut,
      200,
      `Un fichier sain doit être repris : ${JSON.stringify(reponse.corps).slice(0, 400)}`,
    );
    assert.equal(
      /doublon|deux fois/i.test(JSON.stringify(reponse.corps)),
      false,
      'Aucun doublon ne doit être reproché à un fichier qui n’en porte pas.',
    );

    const comptes = await comptesMesures('Contrôle anonyme n° %');
    assert.deepEqual(comptes, {
      catalogue: LOT,
      catalogue_distincts: LOT,
      mise_en_oeuvre: LOT,
      mise_en_oeuvre_distincts: LOT,
    });

    // Chaque identifiant engendré s'annonce comme tel : la marque « -d- » du §2 dit
    // « le fichier n'apportait pas d'identifiant », et se distingue du « -r- » des
    // ré-émissions. C'est une propriété — la provenance —, pas un encodage.
    const engendres = await identifiantsMesures('Contrôle anonyme n° %');
    const horsConvention = engendres.filter((id) => !id.startsWith('MESURE-d-') || id.length > 64);
    assert.deepEqual(horsConvention, [], 'Identifiants engendrés hors convention du §2.');
  });

  test('deux enregistrements RIGOUREUSEMENT identiques reçoivent deux identifiants', async () => {
    // ── Ce que le RANG garantit, et que le contenu ne garantit pas ───────────
    //
    // La dérivation prend `(collection, rang, contenu)`. Le contenu sert la
    // convergence — un fichier rejoué retombe sur ses identifiants ; c'est le RANG
    // qui assure l'unicité DANS le fichier. Sans lui, deux lignes rigoureusement
    // identiques se dériveraient au même identifiant : la seconde écraserait la
    // première, ou la clé primaire refuserait — et l'on reprocherait au fichier un
    // doublon qu'il ne porte pas.
    //
    // Un export ancien en contient : deux processus BIA homonymes, deux mesures
    // recopiées d'un modèle. Le cas n'a rien de théorique.
    const jumelles = Array.from({ length: 4 }, () => ({
      nom: 'Contrôle jumeau, sans rien qui le distingue',
      statut: 'conforme',
      maturite: 1,
    }));

    const reponse = await reprendre('fusionner', instantane(12, { mesures: jumelles }), {
      nom: 'jumelles.json',
    });
    assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 400));

    const comptes = await comptesMesures('Contrôle jumeau,%');
    assert.equal(comptes.catalogue, jumelles.length, 'Quatre lignes confiées, quatre lignes écrites.');
    assert.equal(
      comptes.catalogue_distincts,
      jumelles.length,
      'Quatre identifiants distincts : c’est le rang qui les sépare, pas le contenu.',
    );
    assert.equal(comptes.mise_en_oeuvre, jumelles.length);
    assert.equal(comptes.mise_en_oeuvre_distincts, jumelles.length);
  });

  test('LE MÊME fichier rejoué n’ajoute AUCUNE ligne, un AUTRE ajoute les siennes', async () => {
    // La dérivation converge : c'est ce qui distingue « engendrer » de « tirer ».
    // Un tirage rendrait 250 lignes de plus à chaque passage, et l'exploitant qui
    // restaure deux fois sa sauvegarde doublerait son référentiel sans le voir.
    const mesures = Array.from({ length: LOT }, (_, i) => ({
      nom: `Contrôle rejoué n° ${String(i)}`,
      statut: 'conforme',
    }));
    const contenu = fichier(12, instantane(12, { mesures }));

    const premier = await reprendre('fusionner', null, { contenu, nom: 'masse-rejouee.json' });
    assert.equal(premier.statut, 200, JSON.stringify(premier.corps).slice(0, 300));
    const apresPremier = await comptesMesures('Contrôle rejoué n° %');
    const identifiantsPremier = await identifiantsMesures('Contrôle rejoué n° %');
    assert.equal(apresPremier.catalogue, LOT);

    const second = await reprendre('fusionner', null, { contenu, nom: 'masse-rejouee.json' });
    assert.equal(second.statut, 200, JSON.stringify(second.corps).slice(0, 300));
    assert.equal(second.corps.bilan.crees.mesures ?? 0, 0, 'Le second passage ne CRÉE rien.');

    assert.deepEqual(
      await comptesMesures('Contrôle rejoué n° %'),
      apresPremier,
      'Rejouer le même fichier ne doit ajouter aucune ligne, d’aucun des deux côtés.',
    );
    assert.deepEqual(
      await identifiantsMesures('Contrôle rejoué n° %'),
      identifiantsPremier,
      'Et ce sont les MÊMES lignes : la dérivation retombe sur ses identifiants.',
    );

    // ── Contrôle symétrique : rien n'est confondu ───────────────────────────
    // Sans lui, ce test serait satisfait par une reprise qui n'écrit plus rien du
    // tout — la convergence deviendrait de l'inertie.
    const autres = Array.from({ length: 10 }, (_, i) => ({
      nom: `Contrôle d’un autre fichier n° ${String(i)}`,
      statut: 'non conforme',
    }));
    const troisieme = await reprendre('fusionner', instantane(12, { mesures: autres }), {
      nom: 'masse-autre.json',
    });
    assert.equal(troisieme.statut, 200, JSON.stringify(troisieme.corps).slice(0, 300));
    assert.equal(troisieme.corps.bilan.crees.mesures, 10, 'Un AUTRE fichier ajoute bien ses lignes.');

    const autreEnBase = await comptesMesures('Contrôle d’un autre fichier n° %');
    assert.equal(autreEnBase.catalogue, 10);
    assert.equal(autreEnBase.mise_en_oeuvre, 10);
    assert.deepEqual(
      await comptesMesures('Contrôle rejoué n° %'),
      apresPremier,
      'Et il ne touche pas aux lignes du premier : deux fichiers ne se confondent pas.',
    );
  });
});
