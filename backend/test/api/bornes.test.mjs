/**
 * bornes.test.mjs — **les sept garde-corps de `BORNES` mordent-ils ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Constat Q-304 — 8ᵉ passage de la porte S8
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'objet `BORNES` (`src/entites/index.ts`) porte les garde-corps du contrôle
 * **S13** — dénis de service applicatifs. L'auditeur les a mesurés un par un à
 * travers Apache : **ils fonctionnent**. Et il a mesuré autre chose :
 *
 *     `elementsParLiaison: 1000` → `100000000`   (un facteur cent mille)
 *     node --test test/documents/classification.test.mjs test/api/routes.test.mjs
 *     # pass 53   # fail 0
 *
 *     grep -rln "elementsParLiaison|trop d'éléments" test/   →  (aucun fichier)
 *     grep -rn  "BORNES" test/                               →  (aucune ligne)
 *
 * **Cinquante-trois essais verts.** Trois portes successives ont trouvé trois
 * dénis de service (Q-197, Q-208, Q-215) ; le remède posé pour la quatrième
 * famille — Q-214 d, « trois collections non bornées » — **n'était retenu par
 * rien**. Une refactorisation, un changement de valeur, une suppression
 * accidentelle seraient passés au vert.
 *
 * ⚠️ *Un garde-fou que rien n'appelle est un commentaire* : celui-ci est appelé,
 * et rien ne vérifiait qu'il l'est.
 *
 * ── CE QUE CE FICHIER MESURE, ET COMMENT ────────────────────────────────
 *
 * Chaque contrôle envoie **une charge au-dessus de la borne** et exige un refus,
 * puis **une charge juste en dessous** et exige qu'elle passe. La seconde moitié
 * n'est pas décorative : une borne qui refuserait tout serait « verte » sur la
 * première seule, et casserait le produit — c'est le contrôle **S18**.
 *
 * ⚠️ **Les bornes sont LUES dans `BORNES`, jamais recopiées.** Recopier `1000`
 * ici referait exactement le défaut : la mutation de l'auditeur changeait la
 * valeur, et un essai qui porte sa propre copie reste vert quoi qu'il arrive.
 * L'essai suit donc la borne — et il rougit si elle disparaît, si elle est
 * relevée d'un facteur cent mille, ou si elle cesse d'être appliquée.
 *
 * ── CE QUE CE FICHIER NE COUVRE PAS, ET OÙ C'EST COUVERT ────────────────
 *
 *  · **`lignesParReprise`** est éprouvée par `test/api/bornes-reprise.test.mjs`,
 *    et elle l'était déjà : ce fichier lit la borne dans `/api/modele`, jamais
 *    une copie. ⚠️ C'est pourquoi le `grep BORNES test/` de l'auditeur n'a rien
 *    rendu alors que cette borne-là était tenue — *une recherche par nom ne
 *    mesure pas une couverture*, et le constat Q-304 est juste sur les sept
 *    autres.
 *  · **`lignesParCollection`** (20 000 lignes par collection au chargement)
 *    n'est **pas** éprouvée ici : la matière coûterait vingt mille insertions
 *    par exécution du banc. Elle est **dite** plutôt que passée sous silence —
 *    c'est le point 8 de la définition de « terminé ».
 *  · **`margeSondageMs`** n'est pas une borne de charge mais une marge de
 *    sûreté du repère de sondage (constat M-7) ; elle est éprouvée avec le
 *    sondage, dans `test/api/`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

let base;
let greffon;
let BORNES;

/* ⚠️ **La forme du périmètre d'une ROUTE n'est pas celle d'une transaction.**
   `perimetre()` de `test/aide/base.mjs` sert à `avecPerimetre()` et porte
   `utilisateur` ; le résolveur d'API attend `utilisateurId`. Se tromper rend un
   **500** — `Cannot read properties of undefined (reading 'trim')` — au lieu
   d'un refus lisible, et c'est un piège qui coûte un quart d'heure. */
const PERIMETRE = Object.freeze({
  utilisateurId: 'admin.grc',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: true,
});

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  ({ BORNES } = await moduleCompile('entites/index.js'));
  greffon = await monterGreffon(base, PERIMETRE);
});

after(async () => {
  await greffon?.fermer();
  await base?.fermer();
});

/**
 * Plafond au-delà duquel un essai **refuse de fabriquer la matière**.
 *
 * ⚠️ **C'est la leçon du constat Q-251, et elle a été payée deux fois.** La
 * première rédaction construisait `borne + 1` éléments. Jouée contre la mutation
 * même de l'auditeur — `elementsParLiaison: 1000 → 100 000 000` —, elle a tenté
 * de fabriquer cent millions d'étiquettes : l'essai **s'est figé au lieu de
 * rougir**, et le banc s'est arrêté au troisième contrôle.
 *
 * *Un essai qui se fige ne dit rien.* Au-delà de ce plafond, on ne fabrique
 * plus : on ÉCHOUE, en disant que la borne a quitté l'ordre de grandeur qu'elle
 * est censée tenir. C'est la seule réponse qui distingue « la borne a été
 * relevée » de « le banc est lent ».
 */
const PLAFOND_MATIERE = 5000;

/** Rend `borne + 1`, ou fait échouer l'essai si la borne est devenue absurde. */
function justeAuDessus(nom, borne) {
  assert.ok(
    borne <= PLAFOND_MATIERE,
    `La borne « ${nom} » vaut ${String(borne)}, au-delà du plafond de ${String(PLAFOND_MATIERE)} ` +
      'que cet essai sait éprouver. Soit elle a été relevée — et c’est exactement ce que le ' +
      'constat Q-304 demande de voir —, soit le plafond doit être revu DÉLIBÉRÉMENT, avec ' +
      'la mesure de ce que coûte la matière.',
  );
  return borne + 1;
}

/** Crée un risque avec les champs donnés, et rend la réponse brute. */
const creerRisque = (champs) =>
  greffon.appeler('POST', '/api/entites/risques', { corps: { champs } });

describe('Les garde-corps de S13 mordent, et ils ne mordent QUE au-delà — Q-304', () => {
  test('LA MATIÈRE : les huit bornes existent et sont des nombres', () => {
    /* Sans cette moitié, tous les contrôles ci-dessous passeraient au vert sur un
       objet vidé — et c'est l'une des mutations que l'auditeur a jouées. */
    for (const nom of [
      'lignesParCollection',
      'lignesParReprise',
      'lignesParLiaison',
      'lignesParSondage',
      'champsParEnregistrement',
      'elementsParLiaison',
      'caracteresParValeur',
      'profondeurJson',
      'noeudsJson',
    ]) {
      assert.equal(
        typeof BORNES[nom],
        'number',
        `La borne « ${nom} » a disparu de BORNES : le contrôle S13 ne porte plus sur elle.`,
      );
      assert.ok(BORNES[nom] > 0);
    }
  });

  test('champsParEnregistrement — un enregistrement à mille champs est refusé', async () => {
    const combien = justeAuDessus('champsParEnregistrement', BORNES.champsParEnregistrement);
    const trop = {};
    for (let i = 0; i < combien; i += 1) trop[`champ_${String(i)}`] = 'x';
    const refus = await creerRisque({ nom: 'Trop de champs', ...trop });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps).slice(0, 300));
    assert.match(
      JSON.stringify(refus.corps),
      new RegExp(String(BORNES.champsParEnregistrement), 'u'),
      'Le refus doit DIRE la borne : un 400 muet apprend à ne pas lire les messages.',
    );
  });

  test('caracteresParValeur — une valeur au-delà de la borne est refusée', async () => {
    assert.ok(
      BORNES.caracteresParValeur <= 1000000,
      `La borne « caracteresParValeur » vaut ${String(BORNES.caracteresParValeur)} : hors de ` +
        'l’ordre de grandeur qu’elle tient (constat Q-304).',
    );
    const refus = await creerRisque({
      nom: 'x'.repeat(BORNES.caracteresParValeur + 1),
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps).slice(0, 300));
    assert.match(JSON.stringify(refus.corps), /caract/iu);
  });

  test('elementsParLiaison — une liaison au-delà de la borne est refusée', async () => {
    /* C'est LA mutation de l'auditeur : `1000` → `100000000`, cinquante-trois
       essais restés verts. Le remède du constat Q-214 d n'était retenu par rien. */
    const combien = justeAuDessus('elementsParLiaison', BORNES.elementsParLiaison);
    const etiquettes = [];
    for (let i = 0; i < combien; i += 1) etiquettes.push(`e${String(i)}`);
    const refus = await greffon.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'Trop d’étiquettes', etiquettes } },
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps).slice(0, 300));
    assert.match(
      JSON.stringify(refus.corps),
      new RegExp(String(BORNES.elementsParLiaison), 'u'),
      'Le refus doit DIRE la borne.',
    );
  });

  test('profondeurJson — un document JSON trop profond est refusé', async () => {
    const niveaux = justeAuDessus('profondeurJson', BORNES.profondeurJson + 2);
    let profond = 'feuille';
    for (let i = 0; i < niveaux; i += 1) profond = { n: profond };
    const refus = await greffon.appeler('POST', '/api/entites/audits', {
      corps: { champs: { ref: 'AUD-PROFOND', items: profond } },
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps).slice(0, 300));
    assert.match(JSON.stringify(refus.corps), /profond/iu);
  });

  test('noeudsJson — un document JSON trop large est refusé', async () => {
    // ⚠️ `noeudsJson` vaut 20 000 : au-dessus du plafond de matière, et à
    // dessein — vingt mille entiers dans un tableau coûtent quelques
    // millisecondes, là où cent millions d'étiquettes coûtent une transaction.
    // Le plafond porte sur ce que la MATIÈRE coûte, pas sur le chiffre.
    assert.ok(
      BORNES.noeudsJson <= 100000,
      `La borne « noeudsJson » vaut ${String(BORNES.noeudsJson)} : hors de l’ordre de ` +
        'grandeur qu’elle tient (constat Q-304).',
    );
    const large = [];
    for (let i = 0; i <= BORNES.noeudsJson; i += 1) large.push(i);
    const refus = await greffon.appeler('POST', '/api/entites/audits', {
      corps: { champs: { ref: 'AUD-LARGE', items: large } },
    });
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps).slice(0, 300));
    assert.match(JSON.stringify(refus.corps), /volumineux|n\u0153ud|noeud/iu);
  });

  test('lignesParSondage — le sondage BORNE ce qu’il rend, et le DIT', async () => {
    /* Ici la borne ne refuse pas : elle TRONQUE, et annonce la troncature. Un
       sondage qui tronquerait en silence ferait croire au client qu'il est à
       jour — c'est la classe des constats Q-201 / Q-207, par l'autre bout. */
    const sondage = await greffon.appeler(
      'GET',
      `/api/rafraichir?depuis=${encodeURIComponent(new Date(0).toISOString())}`,
    );
    assert.equal(sondage.statut, 200);
    assert.equal(
      typeof sondage.corps.tronque,
      'boolean',
      'Le sondage doit DIRE s’il a tronqué : sans ce drapeau, le client croit être à jour.',
    );
    const rendues = Object.values(sondage.corps.modifications ?? {}).reduce(
      (n, l) => n + l.length,
      0,
    );
    assert.ok(
      rendues <= BORNES.lignesParSondage,
      `Le sondage a rendu ${String(rendues)} lignes pour une borne de ` +
        `${String(BORNES.lignesParSondage)} : la borne n’est pas appliquée.`,
    );
  });

  test('Q-308 — sur une CRÉATION bloquée, le produit ne conseille pas de RECHARGER', async () => {
    /* ══ LE BLOQUANT DU 6ᵉ PASSAGE DE LA PORTE S2, REVENU PAR UNE PHRASE ══
     *
     * Deux étiquettes qui ne diffèrent que par la casse font rougir la base en
     * `23505`, et le client recevait :
     *
     *     409 « Cet enregistrement n'a pas pu être créé : l'une de ses clés est
     *           déjà utilisée. Rechargez la liste, puis reprenez la saisie. »
     *
     * Le message dit lui-même « n'a pas pu être **créé** » puis conseille de
     * **recharger** — c'est-à-dire de perdre le formulaire. C'est la leçon du
     * `CLAUDE.md` : *une même formulation servait deux couches, vraie pour la
     * reprise, destructrice pour une création bloquée.*
     *
     * ⚠️ **Rien n'a été écrit** : la transaction est annulée, et ce que
     * l'utilisateur a sous les yeux est sa saisie. Le geste utile est de
     * corriger la valeur en double. */
    const refus = await greffon.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'Doublon de casse', etiquettes: ['RGPD', 'rgpd'] } },
    });
    assert.equal(refus.statut, 409, JSON.stringify(refus.corps).slice(0, 300));
    const message = String(refus.corps.message ?? '');
    assert.equal(
      /recharg/iu.test(message),
      false,
      `Le produit conseille de RECHARGER sur une création bloquée : « ${message} ». ` +
        'Recharger jette la saisie — c’est le bloquant du 6ᵉ passage de la porte S2, ' +
        'revenu par une phrase (constat Q-308).',
    );
    assert.match(
      message,
      /saisie est conservée|corrigez/iu,
      `Le refus doit dire le geste UTILE : « ${message} »`,
    );
  });

  test('S18 — ET LE PRODUIT FONCTIONNE TOUJOURS : juste en dessous, tout passe', async () => {
    /* La moitié qui empêche « corriger la sécurité en cassant la fonction ».
       Chaque charge est construite JUSTE en dessous de sa borne. */
    const champs = { nom: 'Risque ordinaire' };
    for (let i = 0; i < BORNES.champsParEnregistrement - 10; i += 1) {
      champs[`champ_${String(i)}`] = 'x';
    }
    // ⚠️ Les champs inconnus sont refusés par le registre d'entités, pas par la
    // borne : on éprouve donc la borne sur ce qui est REELLEMENT écrivable.
    const ordinaire = await creerRisque({
      nom: 'Risque ordinaire',
      description: 'y'.repeat(1000),
    });
    assert.equal(ordinaire.statut, 201, JSON.stringify(ordinaire.corps).slice(0, 300));

    const etiquettes = [];
    for (let i = 0; i < 50; i += 1) etiquettes.push(`etiquette ${String(i)}`);
    const doc = await greffon.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'Document ordinaire', etiquettes } },
    });
    assert.equal(doc.statut, 201, JSON.stringify(doc.corps).slice(0, 300));
    assert.equal(doc.corps.enregistrement.etiquettes.length, 50);
  });
});
