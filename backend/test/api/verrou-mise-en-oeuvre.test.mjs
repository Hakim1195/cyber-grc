/**
 * verrou-mise-en-oeuvre.test.mjs — le risque P1 sur la moitié du modèle qui porte la
 * comparabilité entre filiales.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Le second passage de la porte S2 a saboté sept propriétés dans une copie ; deux
 * n'ont fait tomber aucun test. Celle-ci en est une : **le verrou de version de la
 * mise en œuvre**, c'est-à-dire le correctif du constat **M-2**.
 *
 * Le défaut d'origine, tel que l'auditeur l'avait montré : `versionMiseEnOeuvre` étant
 * optionnel, un appelant qui l'omettait obtenait un `update` **sans clause de
 * version**, donc un écrasement silencieux rendu `200`. Et le cas nominal l'atteignait
 * sans rien forger — deux personnes qui ouvrent le même contrôle du **socle Groupe**
 * que leur filiale n'a pas encore évalué détiennent toutes deux
 * `_versionMiseEnOeuvre: null`, n'envoient donc rien, et s'écrasent l'une l'autre.
 *
 * Mon banc éprouvait le chemin heureux — les deux versions fournies, `200` — et rien
 * d'autre. C'est le diagnostic que ce chantier a déjà posé deux fois, et que j'avais
 * moi-même formulé : *la suite reste verte parce que rien n'exerce le chemin*. Il vaut
 * aussi pour les propriétés que j'ai contribué à faire exister.
 *
 * ── Le contrat, tel que le moteur le documente ───────────────────────────────
 *
 * | Ce que l'appelant détient | Ce que le serveur fait | Qui arbitre |
 * |---|---|---|
 * | `versionMiseEnOeuvre` absent — « aucune mise en œuvre » | `insert` | l'**unicité** `(filiale_id, mesure_id)`, que la RLS ne contourne pas |
 * | `versionMiseEnOeuvre = n` | `update … and version = $n` | la clause de version |
 *
 * Dans les deux cas, perdre la course rend `409` / `GRC03` avec la version réelle,
 * **jamais un `200` muet**. Chaque ligne de ce tableau a son test ci-dessous, et le
 * dernier vérifie qu'aucun chemin n'écrase.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;

const lectureA = perimetre('temoin', FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** L'enregistrement « mesure » tel que le navigateur le reçoit, ses deux versions comprises. */
async function lireMesure(identifiant) {
  const reponse = await serveur.appeler('GET', '/api/donnees');
  return reponse.corps.data.mesures.find((m) => m.id === identifiant);
}

/** Écrit une évaluation, en choisissant précisément ce que l'appelant « détient ». */
function ecrire(identifiant, { version, versionMiseEnOeuvre, champs }) {
  return serveur.appeler('PUT', `/api/entites/mesures/${identifiant}`, {
    corps: {
      version,
      ...(versionMiseEnOeuvre === undefined ? {} : { versionMiseEnOeuvre }),
      champs,
    },
  });
}

/** Ce que la base contient réellement pour la mise en œuvre d'un contrôle. */
async function enBase(mesureId) {
  const client = await base.connexion('app');
  const lignes = await base.avecPerimetre(client, lectureA, async (c) =>
    (await c.query(
      'select statut, maturite, version from mesure_mise_en_oeuvre where mesure_id = $1 and filiale_id = $2',
      [mesureId, FILIALE_A],
    )).rows);
  return lignes;
}

/** Crée un contrôle local avec sa mise en œuvre, pour ne pas dépendre du semis. */
async function creerMesure(nom, champs = {}) {
  const reponse = await serveur.appeler('POST', '/api/entites/mesures', {
    corps: { champs: { nom, ...champs } },
  });
  assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps).slice(0, 200));
  return reponse.corps.enregistrement;
}

/* =====================================================================
 *  §1 — Le cas nominal du constat M-2 : deux « null » qui se croisent
 * ===================================================================== */

describe('Deux évaluateurs du même contrôle du socle, sans rien forger (constat M-2)', () => {
  test('la seconde évaluation est REFUSÉE, et la première survit', async () => {
    // `MESURE-G` est du socle Groupe : la filiale ne l'a jamais évaluée, donc les
    // deux navigateurs détiennent `_versionMiseEnOeuvre: null` et n'envoient rien.
    // C'est exactement la situation que l'auditeur a rejouée, et où le serveur
    // rendait deux fois `200`.
    const vue = await lireMesure('MESURE-G');
    assert.equal(vue._versionMiseEnOeuvre, null, 'Le scénario exige une mesure NON encore évaluée.');

    const alice = await ecrire('MESURE-G', {
      version: vue._version,
      champs: { statut: 'conforme', maturite: 4 },
    });
    assert.equal(alice.statut, 200);
    assert.equal(alice.corps.enregistrement.statut, 'conforme');

    // Bob part de la même vue : il ne détient toujours pas de version.
    const bob = await ecrire('MESURE-G', {
      version: vue._version,
      champs: { statut: 'non conforme', maturite: 1 },
    });
    assert.equal(bob.statut, 409, `Attendu un conflit, vu : ${JSON.stringify(bob.corps).slice(0, 250)}`);
    assert.equal(bob.corps.erreur, 'conflit_version');
    assert.equal(bob.corps.code_grc, 'GRC03');
    assert.equal(
      typeof bob.corps.version_actuelle,
      'number',
      'Sans la version réelle, l’interface ne sait pas sur quoi recharger.',
    );

    // Et surtout : le travail d'Alice est intact. C'est la seule assertion qui dit
    // vraiment « pas d'écrasement silencieux ».
    const lignes = await enBase('MESURE-G');
    assert.equal(lignes.length, 1, 'Une seule mise en œuvre : l’unicité a bien arbitré.');
    assert.equal(lignes[0].statut, 'conforme');
    assert.equal(lignes[0].maturite, 4);
  });

  test('le perdant repart de la version qu’on lui a rendue, et passe', async () => {
    // La sortie de conflit. Sans elle, le verrou serait une impasse plutôt qu'une
    // protection — et l'on ne saurait pas si le refus précédent tient au verrou ou
    // à une évaluation devenue impossible.
    const vue = await lireMesure('MESURE-G');
    assert.equal(typeof vue._versionMiseEnOeuvre, 'number', 'La mise en œuvre existe désormais.');

    const reprise = await ecrire('MESURE-G', {
      version: vue._version,
      versionMiseEnOeuvre: vue._versionMiseEnOeuvre,
      champs: { statut: 'non conforme', maturite: 1 },
    });
    assert.equal(reprise.statut, 200);
    assert.equal((await enBase('MESURE-G'))[0].statut, 'non conforme');
  });
});

/* =====================================================================
 *  §2 — Les deux chemins du contrat, un par ligne du tableau
 * ===================================================================== */

describe('Le verrou de la mise en œuvre n’est pas facultatif', () => {
  test('« versionMiseEnOeuvre » ABSENT sur une mise en œuvre existante : refusé, jamais écrasé', async () => {
    // LE cœur du constat M-2, et le sabotage qui ne mordait pas : omettre le champ
    // rendait un `update` sans clause de version, donc un `200` muet. Il doit
    // désormais emprunter le chemin de l'INSERT, que l'unicité arbitre.
    const mesure = await creerMesure('Contrôle évalué une fois', { statut: 'conforme', maturite: 5 });
    assert.equal(typeof mesure._versionMiseEnOeuvre, 'number');

    const sansVersion = await ecrire(mesure.id, {
      version: mesure._version,
      champs: { statut: 'non conforme', maturite: 0 },
    });

    assert.equal(
      sansVersion.statut,
      409,
      'Omettre le verrou ne doit pas donner le droit d’écraser : ' +
        `vu ${String(sansVersion.statut)} ${JSON.stringify(sansVersion.corps).slice(0, 200)}`,
    );
    assert.equal(sansVersion.corps.code_grc, 'GRC03');

    const lignes = await enBase(mesure.id);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].statut, 'conforme', 'L’évaluation d’origine doit être intacte.');
    assert.equal(lignes[0].maturite, 5);
  });

  test('« versionMiseEnOeuvre » PÉRIMÉ : conflit, avec la version réelle', async () => {
    const mesure = await creerMesure('Contrôle à deux mains', { statut: 'conforme', maturite: 3 });
    const detenue = mesure._versionMiseEnOeuvre;

    // Quelqu'un d'autre écrit d'abord : la version détenue devient périmée.
    const premier = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue,
      champs: { statut: 'partiellement conforme' },
    });
    assert.equal(premier.statut, 200);

    const second = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue,
      champs: { statut: 'non conforme' },
    });
    assert.equal(second.statut, 409);
    assert.equal(second.corps.code_grc, 'GRC03');
    assert.equal(second.corps.version_actuelle, detenue + 1);
    assert.equal((await enBase(mesure.id))[0].statut, 'partiellement conforme');
  });

  test('« versionMiseEnOeuvre » PÉRIMÉ sur une requête QUI N’ÉCRIT RIEN de ce côté : encore un conflit', async () => {
    // ── D'où vient ce test ──────────────────────────────────────────────────
    //
    // D'une contre-épreuve écrite pour le test précédent, et qui a trouvé mieux que
    // ce qu'elle cherchait. Le cas périmé « ordinaire » se voit : deux valeurs qui
    // s'excluent, un `update … where version = $n` qui ne trouve pas sa ligne, un
    // 409. Mais une requête peut ne rien avoir à écrire DANS LA MOITIÉ FILIALE et
    // présenter tout de même une version pour elle — le navigateur renvoie le
    // formulaire entier, versions comprises, et l'utilisateur n'a corrigé qu'un
    // libellé du catalogue.
    //
    // Le serveur n'avait alors aucune raison de visiter `mesure_mise_en_oeuvre` :
    // rien à y mettre. Il ne LISAIT donc même pas sa version, et rendait 200. Ce 200
    // vaut, pour l'interface, « ta vue est à jour » : la saisie suivante repart d'une
    // maturité périmée et l'écrase. C'est P1 par la moitié que personne ne regarde —
    // la version d'une entité scindée vit dans `mesure_mise_en_oeuvre`, pas dans
    // `mesure_catalogue`, et c'est la seule écriture du produit dont le verrou
    // pouvait s'ouvrir sans que quiconque s'en aperçoive.
    const mesure = await creerMesure('Contrôle immobile', { statut: 'conforme', maturite: 2 });
    const detenue = mesure._versionMiseEnOeuvre;

    // Quelqu'un d'autre modifie la MISE EN ŒUVRE, et elle seule : la version du
    // catalogue ne bouge pas, celle de la mise en œuvre avance.
    const autre = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue,
      champs: { maturite: 4 },
    });
    assert.equal(autre.statut, 200);
    assert.equal(
      autre.corps.enregistrement._version,
      mesure._version,
      'Le scénario exige que la version du CATALOGUE soit restée juste…',
    );
    assert.equal(
      autre.corps.enregistrement._versionMiseEnOeuvre,
      detenue + 1,
      '…et que celle de la MISE EN ŒUVRE ait vraiment avancé.',
    );

    // ── Le retardataire renvoie son formulaire ──────────────────────────────
    // Il ne touche qu'un champ du catalogue, et il y remet la valeur qui s'y trouve
    // déjà : sa requête n'écrit rien, ni d'un côté ni de l'autre. Elle présente
    // pourtant une version de mise en œuvre, et cette version est fausse.
    const immobile = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue,
      champs: { nom: 'Contrôle immobile' },
    });
    assert.equal(
      immobile.statut,
      409,
      'Une version présentée doit être vérifiée même quand il n’y a rien à écrire ' +
        'du côté qu’elle protège — sans quoi 200 veut dire « à jour » à tort.',
    );
    assert.equal(immobile.corps.code_grc, 'GRC03');
    assert.equal(immobile.corps.version_actuelle, detenue + 1, 'Et le retardataire repart de la vraie version.');

    // Le voisin n'a rien perdu au passage : un conflit ne doit pas écrire à moitié.
    assert.equal((await enBase(mesure.id))[0].maturite, 4);
    assert.equal((await enBase(mesure.id))[0].version, detenue + 1);

    // ── Le même défaut par l'autre porte ────────────────────────────────────
    // Cette fois la requête écrit bien dans la moitié filiale, mais y remet la
    // valeur déjà en place. L'`update` porte sa clause de version : il ne trouve
    // rien, et c'est encore un conflit — pas un 200 « rien à faire ».
    const memeValeur = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue,
      champs: { statut: 'conforme' },
    });
    assert.equal(memeValeur.statut, 409, 'Réécrire la valeur en place ne dispense pas du verrou.');
    assert.equal(memeValeur.corps.code_grc, 'GRC03');

    // ── Contrôle symétrique (§20.2) ─────────────────────────────────────────
    // Sans lui, un serveur qui refuserait TOUTE requête sans effet passerait ce
    // test — et l'application deviendrait inutilisable au premier formulaire
    // renvoyé sans modification.
    const ajour = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue + 1,
      champs: { nom: 'Contrôle immobile' },
    });
    assert.equal(ajour.statut, 200, 'La MÊME requête sans effet, avec la bonne version, doit passer.');
    assert.equal(
      ajour.corps.enregistrement._versionMiseEnOeuvre,
      detenue + 1,
      'Et ne rien écrire ne consomme pas de version : deux lectures concurrentes restent valides.',
    );
  });

  test('« versionMiseEnOeuvre » sur une mise en œuvre EFFACÉE : conflit, pas de résurrection', async () => {
    // Le troisième chemin, et le plus discret : la mise en œuvre a disparu entre la
    // lecture et l'écriture. Un `insert` de rattrapage recréerait la ligne à l'insu
    // de celui qui l'a supprimée ; le contrat dit « rechargez ».
    const mesure = await creerMesure('Contrôle dont l’évaluation disparaît', { statut: 'conforme' });
    const detenue = mesure._versionMiseEnOeuvre;

    const client = await base.connexion('app');
    await base.avecPerimetre(
      client,
      perimetre('menage', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query('delete from mesure_mise_en_oeuvre where mesure_id = $1 and filiale_id = $2', [
          mesure.id,
          FILIALE_A,
        ]);
      },
      { annuler: false },
    );
    assert.deepEqual(await enBase(mesure.id), [], 'La mise en œuvre doit bien avoir disparu.');

    const tardif = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: detenue,
      champs: { statut: 'non conforme' },
    });
    assert.equal(tardif.statut, 409, JSON.stringify(tardif.corps).slice(0, 200));
    assert.deepEqual(
      await enBase(mesure.id),
      [],
      'Un conflit ne doit RIEN créer : la résurrection silencieuse est le défaut, pas le remède.',
    );
  });

  test('les deux versions justes : l’écriture passe, et chacune avance à son rythme', async () => {
    // Contrôle symétrique (§20.2). Sans lui, ce fichier serait satisfait par un
    // serveur où PLUS AUCUNE évaluation ne passe — ce qui fermerait M-2 en
    // supprimant la fonction.
    const mesure = await creerMesure('Contrôle ordinaire');
    const reponse = await ecrire(mesure.id, {
      version: mesure._version,
      versionMiseEnOeuvre: mesure._versionMiseEnOeuvre,
      champs: { statut: 'conforme', maturite: 2 },
    });
    assert.equal(reponse.statut, 200);
    assert.equal(
      reponse.corps.enregistrement._version,
      mesure._version,
      'Évaluer ne modifie pas la DÉFINITION du contrôle : sa version ne bouge pas.',
    );
    assert.equal(reponse.corps.enregistrement._versionMiseEnOeuvre, mesure._versionMiseEnOeuvre + 1);
  });
});

/* =====================================================================
 *  §3 — Deux connexions réelles, sur la moitié « mise en œuvre »
 * ===================================================================== */

describe('Le duel P1, joué sur la mise en œuvre et non sur la définition', () => {
  test('deux écritures concurrentes : une passe, l’autre reçoit GRC03', async () => {
    // `verrouillage-optimiste.test.mjs` joue ce duel en SQL direct sur `risques`.
    // Ici il passe par la route, sur la table que le constat M-2 avait laissée sans
    // arbitre — et c'est là que la comparabilité entre filiales se joue.
    const mesure = await creerMesure('Contrôle disputé', { statut: 'conforme', maturite: 1 });
    const vue = { version: mesure._version, versionMiseEnOeuvre: mesure._versionMiseEnOeuvre };

    const [alice, bob] = await Promise.all([
      ecrire(mesure.id, { ...vue, champs: { statut: 'conforme', maturite: 5 } }),
      ecrire(mesure.id, { ...vue, champs: { statut: 'non conforme', maturite: 0 } }),
    ]);

    const codes = [alice.statut, bob.statut].sort();
    assert.deepEqual(codes, [200, 409], 'Une seule des deux écritures doit aboutir.');

    const gagnante = alice.statut === 200 ? alice : bob;
    const lignes = await enBase(mesure.id);
    assert.equal(lignes.length, 1);
    assert.equal(
      lignes[0].statut,
      gagnante.corps.enregistrement.statut,
      'Ce que la base contient doit être ce que la gagnante a écrit, et rien d’autre.',
    );
  });

  test('AUCUN CHEMIN N’ÉCRASE : le balayage des quatre formes d’appel', async () => {
    // Contrôle de morsure du fichier entier. On rejoue les quatre façons d'écrire
    // une évaluation déjà écrite par quelqu'un d'autre, et l'on exige qu'AUCUNE ne
    // remplace la valeur en place. Si un jour l'une d'elles redevenait un `update`
    // sans clause, ce test le dirait — et il le dirait quel que soit le chemin
    // emprunté, ce qui est précisément ce qui manquait.
    const mesure = await creerMesure('Contrôle témoin', { statut: 'conforme', maturite: 4 });
    const detenue = mesure._versionMiseEnOeuvre;

    // Un tiers avance la mise en œuvre : tout ce qui suit est donc périmé.
    assert.equal(
      (await ecrire(mesure.id, {
        version: mesure._version,
        versionMiseEnOeuvre: detenue,
        champs: { statut: 'partiellement conforme', maturite: 2 },
      })).statut,
      200,
    );

    const formes = [
      ['version de mise en œuvre absente', { version: mesure._version }],
      ['version de mise en œuvre périmée', { version: mesure._version, versionMiseEnOeuvre: detenue }],
      ['version nulle explicite', { version: mesure._version, versionMiseEnOeuvre: null }],
      ['version d’un autre âge', { version: mesure._version, versionMiseEnOeuvre: 999 }],
    ];

    const passees = [];
    for (const [nom, enveloppe] of formes) {
      const reponse = await ecrire(mesure.id, { ...enveloppe, champs: { statut: 'non conforme', maturite: 0 } });
      if (reponse.statut === 200) passees.push(`${nom} → 200`);
    }
    assert.deepEqual(passees, [], 'Chaque entrée est une forme d’appel qui écrase sans arbitre.');

    const lignes = await enBase(mesure.id);
    assert.equal(lignes[0].statut, 'partiellement conforme', 'La valeur en place doit être intacte.');
    assert.equal(lignes[0].maturite, 2);
  });
});
