/**
 * documentaire.test.mjs — **LA RECHERCHE DOCUMENTAIRE, PAR LA ROUTE**
 * (lot L16, action D3 — migration `059`)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * `oracle.test.mjs` mesure la recherche GLOBALE (L17, A3) : un `ilike` sur les
 * libellés de quatre entités. Celle-ci mesure la recherche **documentaire** :
 * un index plein texte sur `titre`, `type` et `notes` des documents. Les deux
 * routes coexistent parce qu'elles ne répondent pas à la même question.
 *
 * ⚠️ **Tout passe par la ROUTE**, jamais par la fonction seule — constat
 * **Q-325** : un refus soigné en base arrivait à l'écran en `500` avec sa pile
 * d'appel. *Personne ne mesurait ce que l'utilisateur reçoit.*
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Elle ignore les ACCENTS et les FLEXIONS — le gain réel sur un `ilike` |
 * | 2 | ⚠️ L'ORACLE : un terme qui n'existe que chez la voisine ne remonte JAMAIS — **et le témoin trouve** |
 * | 3 | Le TITRE passe devant l'ANNOTATION : c'est le second garde-corps de l'arbitrage sur `notes` |
 * | 4 | ⚠️ Elle ne rend JAMAIS l'extrait — elle dit OÙ, pas QUOI |
 * | 5 | Les DROITS bornent : sans le domaine `documents`, rien — **et l'ouvrir rend** |
 * | 6 | Les bornes de saisie : trop court se dit, trop long se refuse |
 * | 7 | ⚠️ LA MUTATION RGPD : vider `notes` retire le document de l'index DANS LA MÊME INSTRUCTION |
 * | 8 | ⚠️ LE GARDE-FOU MORD : cassé, `f_sans_accent()` fait rougir `f_verifier_recherche_documentaire()` |
 *
 * ── ⚠️ POURQUOI LE §4 EST LE PLUS IMPORTANT, ET LE MOINS ÉVIDENT ───────────
 *
 * `documents.notes` est `non_personnelle` au registre de l'article 30 — donc
 * licite à indexer — mais son régime est **« signaler »** : *« un nom peut y
 * figurer »*. Rendre l'extrait qui a produit la correspondance ferait du
 * produit un moteur de recherche **sur les personnes que ces annotations
 * nomment**, et ce n'est pas ce qu'on a construit.
 *
 * Le §4 mesure donc une ABSENCE, ce qui est toujours le plus fragile : il
 * vérifie que la réponse entière — sérialisée — ne contient **nulle part** le
 * texte de l'annotation, et qu'elle dit néanmoins « trouvé dans les notes ».
 *
 * ── ⚠️ ET LE §7 EST CELUI QUI JUSTIFIE LA FORME DE LA COLONNE ──────────────
 *
 * L'index est une colonne **engendrée**, et non une colonne tenue par un
 * déclencheur. La différence ne se voit qu'ici : la purge de l'article 17 qui
 * vide `notes` vide l'index dans la même instruction, sans qu'aucun code ne
 * l'y aide. Un index tenu autrement aurait pu **survivre à la donnée qu'il
 * indexe** — c'est-à-dire garder une trace de ce qu'on vient d'effacer.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let applicatif;
/** Session de Toulouse, tous domaines ouverts. */
let toulouse;
/** Session qui porte AUSSI l'Allemagne — le témoin positif du §2. */
let groupe;
/** Session de Toulouse SANS le domaine « documents » — le §5. */
let sansDocuments;

/** Un terme qui n'existe QUE dans le document allemand. */
const TERME_VOISIN = 'Zeppelinwerk';
/** Un nom de personne, au milieu d'une annotation — le sujet du §4 et du §7. */
const NOM_EN_NOTE = 'Ollier';
/** La phrase entière de l'annotation : le §4 vérifie qu'AUCUN morceau ne sort. */
const NOTE = `Revue conduite avec le chiffrement des sauvegardes en tête, relancée par Mme ${NOM_EN_NOTE}.`;

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

function perimetreApi(utilisateurId, filialeId, filiales) {
  return {
    utilisateurId,
    filialeId,
    filiales,
    perimetreGroupe: filiales.length > 1,
    administrationGroupe: false,
  };
}

/**
 * Session dont on CHOISIT les droits.
 *
 * ⚠️ **Sans elle, le §5 ne mesurerait rien.** `monterGreffon` seul retombe sur
 * `DROITS_PROVISOIRES_DEVELOPPEMENT`, qui ouvre tous les domaines : un essai
 * qui passerait un périmètre « sans documents » verrait le serveur l'ignorer et
 * rendre 200. *Un essai qui croit régler un droit qu'il ne règle pas est un
 * essai qui consacre le défaut qu'il cherche* (leçon de `registre-dora`).
 *
 * Le contrat est respecté à la lettre : `resoudre()` ne prend aucun argument.
 */
class SessionDeBanc {
  constructor(perim, domaines) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perim });
    this._droits = Object.freeze({
      niveau: 'validation',
      domaines: Object.freeze(domaines.slice()),
      export: true,
    });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return {
      perimetre: this._perimetre,
      droits: this._droits,
      identite: null,
      sessionOuverte: false,
    };
  }

  decrire() {
    return 'session du banc d’essai (test/recherche/documentaire.test.mjs)';
  }
}

/** Sème un document hors de toute route, dans la filiale demandée. */
async function semerDocument(filiale, id, titre, type, notes) {
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, type, notes, statut)
         values ($1, $2, $3, $4, $5, 'en vigueur')`,
        [id, filiale, titre, type, notes],
      );
    },
    { annuler: false },
  );
}

/** Interroge la route, et rend `{ statut, corps }`. */
async function chercher(session, terme) {
  return await session.appeler(
    'GET',
    `/api/recherche/documents?q=${encodeURIComponent(terme)}`,
  );
}

/** Les identifiants rendus, dans l'ordre du serveur. */
function identifiants(corps) {
  return (corps.resultats ?? []).map((r) => r.id);
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  const perimA = perimetreApi('USER-A', FILIALE_A, [FILIALE_A]);
  toulouse = await monterGreffon(base, perimA, {
    resolveur: new SessionDeBanc(perimA, TOUS_DOMAINES),
  });
  sansDocuments = await monterGreffon(base, perimA, {
    resolveur: new SessionDeBanc(
      perimA,
      TOUS_DOMAINES.filter((d) => d !== 'documents'),
    ),
  });
  const perimGroupe = perimetreApi('USER-A', FILIALE_B, [FILIALE_A, FILIALE_B]);
  groupe = await monterGreffon(base, perimGroupe, {
    resolveur: new SessionDeBanc(perimGroupe, TOUS_DOMAINES),
  });

  // ── Le jeu de ce fichier ─────────────────────────────────────────────
  // Trois documents à Toulouse, un chez la voisine. Chacun porte UNE
  // propriété qu'un § vient mesurer, et aucun n'en porte deux : un jeu où
  // deux essais dépendent de la même ligne fait tomber les deux ensemble
  // pour une raison qui n'appartient qu'à l'un.
  await semerDocument(
    FILIALE_A, 'DOC-D3-CHIFFR',
    'Politique de chiffrement des postes',
    'Politique de sécurité (PSSI)',
    null,
  );
  await semerDocument(
    FILIALE_A, 'DOC-D3-NOTE',
    'Revue trimestrielle du parc',
    'Procédure',
    NOTE,
  );
  await semerDocument(
    FILIALE_A, 'DOC-D3-ACCENT',
    'Sécurité des accès distants',
    // ⚠️ APOSTROPHE DROITE, et ce n'est pas un détail de style : le vocabulaire
    // clos de `ck_documents_type` porte « d'accès » avec l'apostrophe droite, et
    // la typographique — celle que ce dépôt emploie partout ailleurs en prose —
    // fait échouer l'insertion. Le semis a rougi ici avant que quoi que ce soit
    // d'autre soit mesuré.
    "Politique de contrôle d'accès",
    null,
  );
  await semerDocument(
    FILIALE_B, 'DOC-D3-VOISIN',
    `${TERME_VOISIN} Verschluesselung`,
    'Registre',
    null,
  );
});

after(async () => {
  await toulouse?.fermer();
  await sansDocuments?.fermer();
  await groupe?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — accents et flexions
 * ===================================================================== */

describe('§1 — elle ignore les accents et les flexions', () => {
  test('« securite » sans accent trouve « Sécurité »', async () => {
    // ⚠️ C'est le gain réel sur l'`ilike` de la recherche globale, et il n'est
    // pas cosmétique : un utilisateur qui tape sans accent — ce que fait tout
    // le monde sur un clavier pressé — concluait jusqu'ici que le document
    // n'existe pas. Dans l'outil où il vient PROUVER qu'il existe.
    const { statut, corps } = await chercher(toulouse, 'securite');
    assert.equal(statut, 200, JSON.stringify(corps));
    assert.ok(
      identifiants(corps).includes('DOC-D3-ACCENT'),
      `« securite » n’a pas trouvé « Sécurité des accès distants » : ${JSON.stringify(identifiants(corps))}`,
    );
  });

  test('« chiffrer » trouve « chiffrement » — la racinisation française agit', async () => {
    const { statut, corps } = await chercher(toulouse, 'chiffrer');
    assert.equal(statut, 200, JSON.stringify(corps));
    assert.ok(
      identifiants(corps).includes('DOC-D3-CHIFFR'),
      'Sans la racinisation, la recherche redevient un « ilike » à la lettre près, ' +
        'c’est-à-dire ce qu’elle remplace.',
    );
  });

  test('un terme ÉTRANGER ne rend rien — l’index ne correspond pas à tout', async () => {
    // Le pendant indispensable des deux précédents : sans lui, une expression
    // dégénérée qui correspond à n'importe quoi les passerait au vert, et la
    // recherche deviendrait l'oracle que l'action D3 existe pour fermer.
    const { statut, corps } = await chercher(toulouse, 'hydroelectrique');
    assert.equal(statut, 200);
    assert.deepEqual(identifiants(corps), []);
  });
});

/* =====================================================================
 *  §2 — l'oracle
 * ===================================================================== */

describe('§2 — la recherche ne franchit pas la frontière des filiales', () => {
  test('⚠️ Toulouse ne trouve RIEN de ce qui n’existe qu’en Allemagne', async () => {
    const { statut, corps } = await chercher(toulouse, TERME_VOISIN);
    assert.equal(statut, 200, JSON.stringify(corps));
    assert.deepEqual(
      identifiants(corps),
      [],
      'Un document de la filiale voisine est ressorti : c’est une fuite entre filiales, ' +
        'la première classe du `PLAN_EXECUTION.md` §0 bis.',
    );
    // ⚠️ Et le COMPTE ne fuit pas non plus : « zéro » doit être zéro, pas une
    // liste tronquée qui laisserait deviner qu'il y avait quelque chose.
    assert.equal(corps.tronque, false);
  });

  test('TÉMOIN POSITIF — une session qui PORTE l’Allemagne trouve le même document', async () => {
    // Sans ce contrôle, le précédent serait vert sur une route qui ne rend
    // jamais rien. Constat Q-210, et il a déjà coûté un passage de porte.
    const { statut, corps } = await chercher(groupe, TERME_VOISIN);
    assert.equal(statut, 200, JSON.stringify(corps));
    assert.deepEqual(
      identifiants(corps),
      ['DOC-D3-VOISIN'],
      'La recherche ne trouve rien alors que le document est dans le périmètre : le ' +
        'contrôle négatif ci-dessus ne mesurerait donc rien.',
    );
  });

  test('AUCUNE requête de la route ne nomme de filiale — c’est la RLS qui borne', async () => {
    // Contrôle de FORME, et il a sa raison : un filtre applicatif serait une
    // barrière que le prochain chemin d'écriture contournerait, et il y a
    // toujours un chemin de plus (constats Q-232 / Q-233). La propriété se
    // tient dans le code source ; elle ne se déduit pas d'un résultat.
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const source = await readFile(
      fileURLToPath(new URL('../../src/recherche/index.ts', import.meta.url)),
      'utf8',
    );
    const requete = source.slice(
      source.indexOf('with q as ('),
      source.indexOf('order by c.pertinence desc'),
    );
    assert.ok(requete.length > 0, 'la requête documentaire est introuvable dans la source');
    assert.equal(
      /filiale_id/.test(requete),
      false,
      'La requête de recherche documentaire nomme « filiale_id » : elle a cessé de ' +
        's’en remettre à la RLS.',
    );
  });
});

/* =====================================================================
 *  §3 — le classement
 * ===================================================================== */

describe('§3 — le titre passe devant l’annotation', () => {
  test('un terme présent dans un TITRE et dans une NOTE range le titre en premier', async () => {
    // ⚠️ Ce n'est pas un confort de classement : c'est le second garde-corps de
    // l'arbitrage sur `notes` (migration `059`, entête). Le poids « C » fait que
    // l'usage normal du produit ne rencontre pas les annotations.
    const { statut, corps } = await chercher(toulouse, 'chiffrement');
    assert.equal(statut, 200, JSON.stringify(corps));
    const ids = identifiants(corps);
    assert.ok(ids.includes('DOC-D3-CHIFFR'), 'le document dont le TITRE porte le terme');
    assert.ok(ids.includes('DOC-D3-NOTE'), 'le document dont la NOTE porte le terme');
    assert.equal(
      ids[0],
      'DOC-D3-CHIFFR',
      'L’annotation est passée devant le titre : les poids A/B/C ont cessé d’agir, et ' +
        'avec eux le garde-corps qui range les notes en dernier.',
    );
  });
});

/* =====================================================================
 *  §4 — elle dit OÙ, jamais QUOI
 * ===================================================================== */

describe('§4 — la route ne rend jamais l’extrait', () => {
  test('⚠️ un nom présent dans une NOTE remonte le document, et RIEN de la phrase', async () => {
    const { statut, corps } = await chercher(toulouse, NOM_EN_NOTE);
    assert.equal(statut, 200, JSON.stringify(corps));
    assert.deepEqual(identifiants(corps), ['DOC-D3-NOTE']);

    // La réponse ENTIÈRE, sérialisée : ni le nom, ni un morceau de la phrase.
    const rendu = JSON.stringify(corps);
    assert.equal(
      rendu.includes(NOM_EN_NOTE),
      false,
      'Le nom écrit dans l’annotation est ressorti dans la réponse. Le produit devient ' +
        'un moteur de recherche SUR LES PERSONNES que ces notes nomment, et ce n’est pas ' +
        'ce qui a été construit (migration `059`, arbitrage sur `notes`).',
    );
    assert.equal(
      rendu.includes('sauvegardes en tête'),
      false,
      'Un morceau de l’annotation est ressorti : la route rend l’extrait.',
    );
    assert.equal(rendu.includes('notes":'), false, 'la colonne `notes` ne doit pas sortir');
  });

  test('… et elle dit néanmoins OÙ la correspondance a eu lieu', async () => {
    // L'absence mesurée ci-dessus serait satisfaite par une route qui ne rend
    // rien d'utile. Celle-ci doit répondre à « pourquoi ce document ? ».
    const { corps } = await chercher(toulouse, NOM_EN_NOTE);
    assert.deepEqual(corps.resultats[0].ou, ['notes']);
    assert.equal(corps.resultats[0].titre, 'Revue trimestrielle du parc');
  });

  test('un terme du TITRE se signale comme tel', async () => {
    const { corps } = await chercher(toulouse, 'distants');
    const trouve = corps.resultats.find((r) => r.id === 'DOC-D3-ACCENT');
    assert.ok(trouve, 'le document doit remonter');
    assert.deepEqual(trouve.ou, ['titre']);
  });
});

/* =====================================================================
 *  §5 — les droits
 * ===================================================================== */

describe('§5 — sans le domaine « documents », la recherche n’existe pas', () => {
  test('⚠️ une session sans le domaine est REFUSÉE — pas « zéro résultat »', async () => {
    // La nuance est tout le sujet : rendre « zéro résultat » à qui n'a pas le
    // domaine dirait déjà quelque chose — à savoir qu'il n'y a rien à ce terme.
    // Un refus, lui, ne dit rien du fonds.
    const { statut } = await chercher(sansDocuments, 'chiffrement');
    assert.notEqual(
      statut,
      200,
      'Une session sans le domaine « documents » a obtenu une réponse : elle apprend, ' +
        'par le simple compte des résultats, ce que contient un écran qu’elle ne peut ' +
        'pas ouvrir.',
    );
  });

  test('TÉMOIN — la même recherche, domaine ouvert, rend le document', async () => {
    const { statut, corps } = await chercher(toulouse, 'chiffrement');
    assert.equal(statut, 200);
    assert.ok(identifiants(corps).includes('DOC-D3-CHIFFR'));
  });
});

/* =====================================================================
 *  §6 — les bornes de saisie
 * ===================================================================== */

describe('§6 — les bornes de saisie', () => {
  test('un terme trop court rend 200 et le DIT — jamais une erreur', async () => {
    // ⚠️ L'utilisateur tape, et chaque frappe passe ici. Un 400 par caractère
    // ferait du journal technique une trace de frappe.
    const { statut, corps } = await chercher(toulouse, 'a');
    assert.equal(statut, 200);
    assert.deepEqual(corps.resultats, []);
    assert.match(corps.motif, /au moins 2/);
  });

  test('un terme démesuré est REFUSÉ', async () => {
    const { statut, corps } = await chercher(toulouse, 'a'.repeat(101));
    assert.equal(statut, 400, JSON.stringify(corps));
    assert.equal(corps.erreur, 'donnee_invalide');
  });
});

/* =====================================================================
 *  §7 — la propriété RGPD de la colonne engendrée
 * ===================================================================== */

describe('§7 — vider la note retire le document de l’index, dans la même instruction', () => {
  test('⚠️ LA MUTATION RGPD : après la purge de `notes`, le nom ne trouve plus rien', async () => {
    // Le document est trouvable par le nom écrit dans son annotation…
    const avant = await chercher(toulouse, NOM_EN_NOTE);
    assert.deepEqual(identifiants(avant.corps), ['DOC-D3-NOTE'], 'témoin de départ');

    // …on vide `notes`, comme le ferait la purge de l'article 17. AUCUN code du
    // produit n'est appelé : c'est un `update` nu, en SQL.
    await base.avecPerimetre(
      applicatif,
      perimetre('purge', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query("update documents set notes = null where id = 'DOC-D3-NOTE'");
      },
      { annuler: false },
    );

    const apres = await chercher(toulouse, NOM_EN_NOTE);
    assert.deepEqual(
      identifiants(apres.corps),
      [],
      'L’index a SURVÉCU à la donnée qu’il indexe : il garde une trace de ce qu’on vient ' +
        'd’effacer. C’est exactement ce que la colonne ENGENDRÉE existe pour empêcher — ' +
        'un index tenu par un déclencheur, ou par un traitement de fond, aurait pu ' +
        'rester en arrière.',
    );
  });

  test('… et le document reste trouvable par son TITRE : on a vidé la note, pas le document', async () => {
    // La moitié qui empêche le remède d'être pire que le mal : un index qui se
    // viderait entièrement à la première purge serait une perte de capacité.
    const { corps } = await chercher(toulouse, 'trimestrielle');
    assert.ok(identifiants(corps).includes('DOC-D3-NOTE'));
  });
});

/* =====================================================================
 *  §8 — le garde-fou mord
 * ===================================================================== */

describe('§8 — le garde-fou éprouve vraiment la chaîne', () => {
  test('au repos, il ne signale rien', async () => {
    const lignes = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => (await c.query('select * from f_verifier_recherche_documentaire()')).rows,
    );
    assert.deepEqual(lignes, []);
  });

  test('⚠️ LA MUTATION : un repli d’accents qui ne replie plus fait ROUGIR le garde', async () => {
    // ⚠️ **Dans une transaction ANNULÉE, et sous le PROPRIÉTAIRE** : le rôle
    // applicatif ne peut pas remplacer une fonction, et une restauration par
    // `finally` a déjà laissé un déclencheur désarmé derrière elle sur la
    // recette (leçon du 10/09). `rollback` défait TOUT, la redéfinition
    // comprise — le DDL est transactionnel en PostgreSQL.
    const proprietaire = await base.nouvelleConnexion('proprietaire');
    let anomalies = [];
    try {
      await proprietaire.query('begin');
      await proprietaire.query(`
        create or replace function f_sans_accent(p_texte text)
        returns text language sql immutable parallel safe
        returns null on null input
        set search_path = pg_catalog, public, pg_temp as $f$ select p_texte $f$`);
      anomalies = (
        await proprietaire.query('select * from f_verifier_recherche_documentaire()')
      ).rows;
    } finally {
      await proprietaire.query('rollback').catch(() => {});
      await proprietaire.end().catch(() => {});
    }

    assert.ok(
      anomalies.length > 0,
      'Le garde-fou reste VERT alors que le repli d’accents ne replie plus rien : il ' +
        'reconnaît la présence de la fonction au lieu d’éprouver la chaîne (§39.1).',
    );
    assert.ok(
      anomalies.some((a) => a.anomalie === 'recherche_documentaire_fausse'),
      `anomalies rendues : ${JSON.stringify(anomalies.map((a) => a.anomalie))}`,
    );
  });

  test('et après annulation, il est revenu — une restauration qu’on ne vérifie pas est une restauration qu’on croit', async () => {
    const lignes = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) => (await c.query('select * from f_verifier_recherche_documentaire()')).rows,
    );
    assert.deepEqual(lignes, []);
  });
});
