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

    /* ══ ET LA BORNE ELLE-MÊME EST TENUE — constat B-4 ═══════════════════════
     *
     * L'assertion ci-dessus **lit la borne qu'elle prétend garder** : le jeu
     * d'essai rend quelques lignes, et l'inégalité est trivialement vraie quelle
     * que soit la valeur. Elle mesure « le produit respecte la borne qu'il
     * déclare », jamais « la borne déclarée est sûre » — et c'est précisément la
     * mutation que le constat Q-304 existe pour voir.
     *
     * Ce qui rend une borne SÛRE est son ordre de grandeur : elle doit rester
     * dans ce que le produit est fait pour contenir. `lignesParSondage` borne ce
     * qu'un seul sondage renvoie ; au-delà de quelques milliers, ce n'est plus un
     * sondage, c'est une extraction — et c'est exactement le constat Q-301. */
    assert.ok(
      BORNES.lignesParSondage >= 100 && BORNES.lignesParSondage <= 20000,
      `La borne « lignesParSondage » vaut ${String(BORNES.lignesParSondage)} : hors de ` +
        'l’ordre de grandeur d’un sondage. Sous 100 elle casserait le rafraîchissement ' +
        'ordinaire ; au-delà de 20 000 elle cesserait de borner quoi que ce soit, et le ' +
        'sondage deviendrait une extraction que rien ne retient (constats Q-304, B-4).',
    );
  });

  test('lignesParLiaison — la borne est TENUE, et pas seulement déclarée', async () => {
    /* ══ CONSTAT B-4 ══════════════════════════════════════════════════════════
     *
     * Cette borne n'apparaissait que dans le contrôle « les huit bornes existent
     * et sont des nombres » : la relever d'un facteur mille laissait tout au vert.
     *
     * Elle borne le nombre de lignes de LIAISON rapportées pour une collection —
     * les étiquettes d'un document, les mesures d'un traitement. La fabriquer
     * coûterait cent mille insertions par exécution du banc ; on tient donc
     * l'ordre de grandeur, comme pour `lignesParSondage`, et **on le dit** plutôt
     * que de laisser croire la borne éprouvée. */
    assert.ok(
      BORNES.lignesParLiaison >= 1000 && BORNES.lignesParLiaison <= 1000000,
      `La borne « lignesParLiaison » vaut ${String(BORNES.lignesParLiaison)} : hors de ` +
        'l’ordre de grandeur des liaisons d’une filiale. Au-delà d’un million, elle ' +
        'cesserait de retenir la lecture d’une collection entière (constat B-4).',
    );
    // LA MATIÈRE : la borne est bien CELLE QUE LE PRODUIT SERT, et non une copie
    // que ce fichier porterait — c'est ce qui la rend sensible à la mutation.
    const modele = await greffon.appeler('GET', '/api/modele');
    assert.equal(modele.statut, 200);
    assert.equal(
      modele.corps.bornes.lignesParLiaison,
      BORNES.lignesParLiaison,
      'La borne servie par /api/modele diverge de celle du moteur.',
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

  test('B-2 — un traitement invisible rend un REFUS LISIBLE, jamais un 500', async () => {
    /* ══ LE REFUS ÉTAIT ÉCRIT, ET IL N'ARRIVAIT NULLE PART ════════════════════
     *
     * Le déclencheur de la migration `030` refuse un traitement que la session ne
     * voit pas, avec un message soigné et un `hint`. `src/erreurs/index.ts` ne
     * connaissait pas le code `GRC07` : il tombait dans le générique, et
     * l'utilisateur recevait **500 « Le serveur n'a pas pu traiter la demande »**,
     * avec une pile d'appel au journal technique. Une faute de saisie classée
     * incident serveur, et reproductible à volonté.
     *
     * ⚠️ **Pourquoi le banc ne pouvait pas le voir** : `GRC07` ÉTAIT éprouvé,
     * mais **en SQL direct**, jamais par la route. *L'essai prouvait que le
     * déclencheur se déclenche ; personne ne mesurait ce que l'utilisateur
     * reçoit.* C'est la moitié du chemin — et c'est la classe Q-194. */
    const refus = await greffon.appeler('POST', '/api/entites/documents', {
      corps: {
        champs: { titre: 'Vers un traitement absent',
                  traitement_id: 'TRT-0000000000000-inexistant' },
      },
    });
    assert.notEqual(
      refus.statut,
      500,
      `Une valeur que l’utilisateur vient de saisir ne doit jamais rendre un incident ` +
        `serveur : ${JSON.stringify(refus.corps)}`,
    );
    assert.equal(refus.statut, 400, JSON.stringify(refus.corps).slice(0, 300));
    assert.match(
      String(refus.corps.message ?? ''),
      /n’existe pas dans votre périmètre|n'existe pas dans votre périmètre/u,
      `Le refus doit DIRE quoi corriger : ${JSON.stringify(refus.corps)}`,
    );
  });

  test('B-3 — un refus de portée ne nomme AUCUNE colonne que le client ignore', async () => {
    /* L'autre sens du même correctif rendait au client « les champs (filiale_id,
       traitement_filiale_id) » — deux colonnes dont aucune n'est servie par
       `/api/modele`. Le message était inutilisable pour l'utilisateur légitime, et
       il révélait à un attaquant interne qu'une valeur de portée est **dérivée et
       stockée**. ⚠️ Le commentaire du code justifiait de les nommer par « ce sont
       les noms que l'appelant a lui-même envoyés » : *la règle était écrite, vingt
       lignes au-dessus de la ligne qui la viole.* */
    const modele = await greffon.appeler('GET', '/api/modele');
    assert.equal(modele.statut, 200);
    const connus = new Set(
      Object.values(modele.corps.entites).flatMap((e) => Object.keys(e.champs ?? {})),
    );
    // LA MATIÈRE : les deux colonnes en cause sont bien INCONNUES du client.
    assert.equal(connus.has('filiale_id'), false);
    assert.equal(connus.has('traitement_filiale_id'), false);

    // Un document de portée GROUPE vers un traitement LOCAL : le sens N-10, fermé.
    const traitementLocal = await greffon.appeler('POST', '/api/entites/traitements', {
      corps: { champs: { nom: 'Paie de la filiale' } },
    });
    assert.equal(traitementLocal.statut, 201, JSON.stringify(traitementLocal.corps));

    const refus = await greffon.appeler('POST', '/api/entites/documents', {
      corps: {
        champs: { titre: 'PSSI du groupe',
                  traitement_id: traitementLocal.corps.enregistrement.id },
        portee: 'groupe',
      },
    });
    assert.ok(
      refus.statut >= 400 && refus.statut < 500,
      `Le sens « Groupe → local » doit être refusé : ${JSON.stringify(refus.corps)}`,
    );
    const message = String(refus.corps.message ?? '');
    for (const interne of ['filiale_id', 'traitement_filiale_id', 'portee_groupe']) {
      assert.equal(
        message.includes(interne),
        false,
        `Le refus nomme « ${interne} », que le client ne connaît pas : « ${message} »`,
      );
    }
    assert.match(
      message,
      /portée Groupe|socle commun|frontière/u,
      `Le refus doit parler de la RÈGLE, en termes que l’utilisateur comprend : « ${message} »`,
    );
  });

  test('B-1 — sur une MODIFICATION bloquée non plus, on ne conseille pas de recharger', async () => {
    /* Q-308 avait été fermé sur la seule **création**. Un `PUT` en doublon
       répondait encore *« n'a pas pu être CRÉÉ … Rechargez la liste »* : faux sur
       le verbe, et destructeur sur le conseil — recharger jette le formulaire.
       *Le discriminant n'est pas le verbe HTTP, c'est que l'utilisateur a une
       saisie sous les yeux.* */
    const doc = await greffon.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'À modifier', etiquettes: ['unique'] } },
    });
    assert.equal(doc.statut, 201, JSON.stringify(doc.corps).slice(0, 300));

    const refus = await greffon.appeler(
      'PUT',
      `/api/entites/documents/${doc.corps.enregistrement.id}`,
      {
        corps: {
          version: doc.corps.enregistrement._version,
          champs: { etiquettes: ['RGPD', 'rgpd'] },
        },
      },
    );
    assert.equal(refus.statut, 409, JSON.stringify(refus.corps).slice(0, 300));
    const message = String(refus.corps.message ?? '');
    assert.equal(
      /recharg/iu.test(message),
      false,
      `Le produit conseille de RECHARGER sur une modification bloquée : « ${message} ». ` +
        'Recharger jette la saisie — c’est le bloquant du 6ᵉ passage de la porte S2, ' +
        'fermé sur une moitié seulement (constats Q-308 puis B-1).',
    );
    assert.equal(
      /pas pu être créé/iu.test(message),
      false,
      `Le message parle de CRÉATION là où l’utilisateur MODIFIE : « ${message} »`,
    );
  });

  test('S18 — ET LE PRODUIT FONCTIONNE TOUJOURS : juste en dessous, tout passe', async () => {
    /* La moitié qui empêche « corriger la sécurité en cassant la fonction ».
       Chaque charge est construite JUSTE en dessous de sa borne. */
    // ⚠️ **LE PLAFOND DE MATIÈRE VAUT ICI AUSSI — constat B-4.** La première
    // rédaction construisait `BORNES.champsParEnregistrement - 10` champs. Contre
    // la mutation `80 → 100 000 000`, le contrôle précédent rendait bien le bon
    // verdict — puis CELUI-CI fabriquait cent millions de clés et **le banc ne
    // rendait jamais la main** (tué à 100 s, code 124, pas rouge). *Le plafond a
    // été posé à un endroit et oublié à l'autre, dans le fichier écrit pour poser
    // le plafond.*
    justeAuDessus('champsParEnregistrement', BORNES.champsParEnregistrement);
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
