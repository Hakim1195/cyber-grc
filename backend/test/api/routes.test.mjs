/**
 * routes.test.mjs — les sept points d'entrée du lot L2, appelés pour de bon.
 *
 * ── Pourquoi ce fichier n'existait pas, et pourquoi il existe maintenant ─────
 *
 * `RAPPORT_S2` §5 : « **Aucune route.** Rien n'importe `dist/api/index.js`, rien ne
 * monte Fastify, rien n'appelle `inject()` ». Le banc d'essai du lot éprouvait le
 * comportement de PostgreSQL et celui du dépôt, et s'arrêtait là — si bien que six des
 * vingt et un constats de la porte vivaient dans l'espace laissé vide.
 *
 * Les propriétés éprouvées ici n'existent qu'au niveau HTTP :
 *
 *  · **le code de statut**, qui est ce que le navigateur voit et ce sur quoi
 *    `js/core/sync.js` décide de bloquer ou non un enregistrement. Un `409` porteur de
 *    `code_grc: GRC03` déclenche « rechargez » ; un `403` ne doit surtout pas le
 *    porter, sans quoi le constat **Q-7** — fermé côté moteur — se rouvrirait un étage
 *    plus haut ;
 *  · **l'indistinguabilité du 404** (contrôle S12), qui se juge sur le corps rendu, pas
 *    sur un motif interne ;
 *  · **les en-têtes** posés par `onSend`, et le gestionnaire de route inconnue, qui
 *    vivent dans `serveur.ts` et non dans le greffon ;
 *  · **la barrière fail-closed** de la session provisoire, qui est un comportement de
 *    la route et de rien d'autre.
 *
 * Le serveur monté est le VRAI : `construireServeur()`, celui que `dist/serveur.js`
 * lance. Voir `test/aide/serveur.mjs`.
 *
 * ── Ce que ce fichier ne couvre pas, et où c'est couvert ─────────────────────
 *
 * Les constats de la porte S2 encore ouverts ont leur propre fichier —
 * `constats-s2.test.mjs` — parce qu'ils sont **rouges par construction** tant que le
 * correctif n'est pas livré. Les mêmer ici rendrait ce fichier illisible et masquerait
 * une régression ordinaire dans du rouge attendu.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Le serveur réel, résolveur provisoire : une seule filiale, celle de Toulouse. */
let serveur;
/** Le greffon seul, avec un périmètre de LECTURE Groupe : le seul moyen d'atteindre le 403. */
let vueGroupe;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
  vueGroupe = await monterGreffon(base, {
    utilisateurId: 'rssi-groupe',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A, FILIALE_B],
    perimetreGroupe: true,
    administrationGroupe: false,
  });
});

after(async () => {
  await serveur?.fermer();
  await vueGroupe?.fermer();
  await base?.fermer();
});

/** Lit la version courante d'un enregistrement, par la route de chargement. */
async function versionDe(entite, identifiant) {
  const reponse = await serveur.appeler('GET', '/api/donnees');
  const ligne = reponse.corps.data[entite].find((e) => e.id === identifiant);
  return ligne === undefined ? null : ligne._version;
}

/* =====================================================================
 *  §1 — Les sept points d'entrée répondent
 * ===================================================================== */

describe('Les sept points d’entrée du lot L2 répondent', () => {
  test('GET /api/sante — la sonde du lot L0 vit toujours, et voit la base', async () => {
    const { statut, corps } = await serveur.appeler('GET', '/api/sante');
    assert.equal(statut, 200);
    assert.equal(corps.statut, 'ok');
    assert.equal(corps.base.ok, true);
    // Volontairement avare (S8) : rien sur la topologie interne.
    const texte = JSON.stringify(corps);
    assert.equal(texte.includes(base.nom), false, 'Le nom de la base ne doit pas sortir.');
    assert.equal(texte.includes('5432'), false, 'Ni le port de PostgreSQL.');
  });

  test('GET /api/session — dit qui l’on est ET ce que cette session vaut', async () => {
    const { statut, corps } = await serveur.appeler('GET', '/api/session');
    assert.equal(statut, 200);
    assert.equal(corps.filiale_active.id, FILIALE_A);
    assert.deepEqual(corps.perimetre_lecture, [FILIALE_A]);
    assert.equal(corps.administration_groupe, false, 'Fail-closed : aucune écriture Groupe.');
    // La dette est portée dans la réponse elle-même : un auditeur l'interroge sans
    // ouvrir le code. C'est une propriété à conserver, donc à éprouver.
    assert.equal(corps.authentification.provisoire, true);
    assert.match(corps.authentification.lot_attendu, /L3/);
  });

  test('GET /api/modele — décrit les 21 entités, et ne fuit aucun nom de table', async () => {
    const { statut, corps } = await serveur.appeler('GET', '/api/modele');
    assert.equal(statut, 200);
    assert.equal(Object.keys(corps.entites).length, 21);
    assert.equal(corps.schemaVersion, 12);

    const texte = JSON.stringify(corps);
    for (const interdit of ['mesure_catalogue', 'mesure_mise_en_oeuvre', 'evaluation_mesures', base.nom]) {
      assert.equal(texte.includes(interdit), false, `« ${interdit} » ne doit pas apparaître.`);
    }
    // L'entité scindée est annoncée comme telle : c'est une information de modèle,
    // pas une information de schéma.
    assert.equal(corps.entites.mesures.scindee, true);
  });

  test('GET /api/donnees — rend le jeu de la filiale, dans la forme de « data »', async () => {
    const { statut, corps } = await serveur.appeler('GET', '/api/donnees');
    assert.equal(statut, 200);
    assert.equal(corps.data.schemaVersion, 12);
    assert.ok(corps.data.risques.some((r) => r.id === 'RISK-A'));
    assert.ok(corps.data.documents.some((d) => d.id === 'DOC-G'), 'Le socle Groupe fait partie du chargement.');

    // Le cloisonnement, vu de la route et non de SQL (contrôle S1).
    const texte = JSON.stringify(corps);
    assert.equal(texte.includes(FILIALE_B), false);
    for (const identifiant of ['RISK-B', 'ACTIF-B', 'DOC-B', 'INC-B']) {
      assert.equal(texte.includes(`"${identifiant}"`), false, `${identifiant} ne doit pas être rendu.`);
    }
  });

  test('GET /api/rafraichir — rend ce qui a changé, les volumes, et l’état de troncature', async () => {
    const depuis = new Date(Date.now() - 3600_000).toISOString();
    const { statut, corps } = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(depuis)}`);
    assert.equal(statut, 200);
    assert.equal(corps.tronque, false);
    assert.equal(typeof corps.horodatage, 'string');
    assert.ok(corps.modifications.risques.some((r) => r.id === 'RISK-A'));
    assert.equal(corps.volumes.risques, 2, 'Les volumes servent à détecter les suppressions.');

    // Un « depuis » postérieur à tout ne rend rien, mais rend quand même les volumes.
    const futur = new Date(Date.now() + 3600_000).toISOString();
    const apres = await serveur.appeler('GET', `/api/rafraichir?depuis=${encodeURIComponent(futur)}`);
    assert.deepEqual(apres.corps.modifications, {});
    assert.equal(apres.corps.volumes.risques, 2);
  });

  test('GET /api/rafraichir — un horodatage illisible est refusé au bord', async () => {
    const mauvais = await serveur.appeler('GET', '/api/rafraichir?depuis=pas-une-date');
    assert.equal(mauvais.statut, 400);
    assert.equal(mauvais.corps.erreur, 'donnee_invalide');
    const absent = await serveur.appeler('GET', '/api/rafraichir');
    assert.equal(absent.statut, 400, 'Le paramètre est requis par le schéma.');
  });

  test('POST /api/entites/:entite — crée, engendre l’identifiant, rend 201', async () => {
    const { statut, corps } = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Panne du système d’information' } },
    });
    assert.equal(statut, 201);
    assert.match(corps.enregistrement.id, /^RISK-\d+-[0-9a-z]+$/, 'Convention d’identifiant du §2.');
    assert.equal(corps.enregistrement._version, 1);
    assert.equal(corps.enregistrement.nom, 'Panne du système d’information');

    // Et l'enregistrement est réellement dans le jeu de données rendu ensuite.
    const apres = await serveur.appeler('GET', '/api/donnees');
    assert.ok(apres.corps.data.risques.some((r) => r.id === corps.enregistrement.id));
  });

  test('PUT /api/entites/:entite/:id — écriture ciblée, et la version avance', async () => {
    const version = await versionDe('risques', 'RISK-A');
    const { statut, corps } = await serveur.appeler('PUT', '/api/entites/risques/RISK-A', {
      corps: { version, champs: { description: 'Analyse revue en séance' } },
    });
    assert.equal(statut, 200);
    assert.equal(corps.enregistrement._version, version + 1);
    assert.equal(corps.enregistrement.description, 'Analyse revue en séance');
    assert.equal(corps.enregistrement.nom, 'Rançongiciel', 'Sémantique PARTIELLE : le reste ne bouge pas.');
  });

  test('DELETE /api/entites/:entite/:id — supprime, avec contrôle de version', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/clients', {
      corps: { champs: { nom: 'Donneur d’ordre jetable' } },
    });
    const identifiant = cree.corps.enregistrement.id;

    const { statut, corps } = await serveur.appeler('DELETE', `/api/entites/clients/${identifiant}?version=1`);
    assert.equal(statut, 200);
    assert.deepEqual(corps, { supprime: true });

    const apres = await serveur.appeler('GET', '/api/donnees');
    assert.equal(apres.corps.data.clients.some((c) => c.id === identifiant), false);
  });

  test('POST /api/operations/propager-mesure — l’opération composite répond', async () => {
    const { statut, corps } = await serveur.appeler('POST', '/api/operations/propager-mesure', {
      corps: { mesureId: 'MESURE-A' },
    });
    assert.equal(statut, 200);
    assert.equal(corps.evaluationsMisesAJour, 1);
    assert.equal(corps.evaluations[0].id, 'EVAL-A');

    // Une mesure sans exigence reliée n'est pas une erreur : zéro propagation.
    const vide = await serveur.appeler('POST', '/api/operations/propager-mesure', {
      corps: { mesureId: 'MESURE-INEXISTANTE' },
    });
    assert.equal(vide.statut, 200);
    assert.equal(vide.corps.evaluationsMisesAJour, 0);
  });
});

/* =====================================================================
 *  §2 — Les codes qui décident
 * ===================================================================== */

describe('Les trois codes qui décident, vus par HTTP', () => {
  test('409 — conflit de version : « GRC03 » ET la version réelle', async () => {
    // C'est le contrat sur lequel `js/core/sync.js` s'appuie pour bloquer un
    // enregistrement et proposer le rechargement. Les trois éléments comptent :
    // le statut, le code applicatif du §15, et la version à recharger.
    const version = await versionDe('risques', 'RISK-A');
    const { statut, corps } = await serveur.appeler('PUT', '/api/entites/risques/RISK-A', {
      corps: { version: version - 1, champs: { nom: 'écriture périmée' } },
    });
    assert.equal(statut, 409);
    assert.equal(corps.erreur, 'conflit_version');
    assert.equal(corps.code_grc, 'GRC03');
    assert.equal(corps.version_actuelle, version, 'Sans elle, l’interface fait un aller-retour de plus.');
  });

  test('403 — écriture hors filiale active : SURTOUT PAS « GRC03 »', async () => {
    // Le constat Q-7 de la porte S1, un étage plus haut. Si ce code portait
    // « GRC03 », l'interface enverrait recharger une fiche que personne n'a touchée,
    // et que l'utilisateur n'a pas le droit d'écrire. Le message doit parler de
    // périmètre, pas de concurrence.
    const { statut, corps } = await vueGroupe.appeler('PUT', '/api/entites/risques/RISK-B', {
      corps: { version: 1, champs: { nom: 'écriture hors filiale active' } },
    });
    assert.equal(statut, 403);
    assert.equal(corps.erreur, 'hors_perimetre');
    assert.equal(corps.code_grc, undefined, 'Un refus de droit n’est pas un conflit de version.');
    assert.equal(corps.version_actuelle, undefined, 'La rendre confirmerait la lecture de la ligne.');
    assert.match(corps.message, /filiale/i);
  });

  test('404 — absente et cachée rendent une réponse INDISCERNABLE (contrôle S12)', async () => {
    const cachee = await serveur.appeler('PUT', '/api/entites/risques/RISK-B', {
      corps: { version: 1, champs: { nom: 'x' } },
    });
    const absente = await serveur.appeler('PUT', '/api/entites/risques/RISK-NEXISTE-PAS', {
      corps: { version: 1, champs: { nom: 'x' } },
    });
    assert.equal(cachee.statut, 404);
    assert.equal(absente.statut, 404);

    // À l'identifiant que l'appelant vient d'envoyer près, et à la référence de
    // requête près (un UUID par requête, sans rapport avec la donnée).
    const normaliser = (corps) => ({ ...corps, identifiant: null, reference: null });
    assert.deepEqual(normaliser(cachee.corps), normaliser(absente.corps));
    assert.equal(JSON.stringify(cachee.corps).includes(FILIALE_B), false);
  });

  test('403 et 404 se distinguent l’un de l’autre — la lecture change le verdict', async () => {
    // Contrôle de morsure du couple : la même ligne, la même écriture, deux
    // périmètres. Si les deux rendaient le même code, la distinction du §8.7 ne
    // serait pas exercée et le fichier ne prouverait rien.
    const depuisSite = await serveur.appeler('PUT', '/api/entites/risques/RISK-B', {
      corps: { version: 1, champs: { nom: 'x' } },
    });
    const depuisGroupe = await vueGroupe.appeler('PUT', '/api/entites/risques/RISK-B', {
      corps: { version: 1, champs: { nom: 'x' } },
    });
    assert.notEqual(depuisSite.statut, depuisGroupe.statut);
    assert.deepEqual([depuisSite.statut, depuisGroupe.statut], [404, 403]);
  });

  test('409 aussi en SUPPRESSION : le même piège, le même code', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/clients', {
      corps: { champs: { nom: 'Donneur d’ordre à supprimer' } },
    });
    const identifiant = cree.corps.enregistrement.id;
    const { statut, corps } = await serveur.appeler('DELETE', `/api/entites/clients/${identifiant}?version=99`);
    assert.equal(statut, 409);
    assert.equal(corps.code_grc, 'GRC03');
    // La ligne est toujours là : un refus n'est pas une suppression silencieuse.
    const apres = await serveur.appeler('GET', '/api/donnees');
    assert.ok(apres.corps.data.clients.some((c) => c.id === identifiant));
  });

  test('la SUPPRESSION exige sa version : sans elle, la route refuse (constat m-8)', async () => {
    // `PLAN_SERVEUR` §1.4 range explicitement sous le risque P1 le geste « supprimer
    // une ligne que quelqu'un vient de modifier ». Une suppression sans contrôle de
    // version est cet écrasement-là, en pire : il n'y a rien à recharger ensuite.
    const cree = await serveur.appeler('POST', '/api/entites/clients', {
      corps: { champs: { nom: 'Donneur d’ordre témoin' } },
    });
    const identifiant = cree.corps.enregistrement.id;

    const sansVersion = await serveur.appeler('DELETE', `/api/entites/clients/${identifiant}`);
    assert.equal(sansVersion.statut, 400, 'La version est requise, pas facultative.');

    // Et la ligne est toujours là : un refus de forme ne supprime rien.
    assert.ok((await serveur.appeler('GET', '/api/donnees')).corps.data.clients.some((c) => c.id === identifiant));
    assert.equal((await serveur.appeler('DELETE', `/api/entites/clients/${identifiant}?version=1`)).statut, 200);
  });

  test('400 — un champ inconnu est refusé au bord, et nommé', async () => {
    const { statut, corps } = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'x', filiale_id: FILIALE_B } },
    });
    assert.equal(statut, 400);
    assert.equal(corps.erreur, 'donnee_invalide');
    assert.match(corps.message, /filiale_id/);
  });

  test('l’ORACLE D’EXISTENCE est fermé : le client ne propose plus d’identifiant (M-3)', async () => {
    // Constat M-3 de la porte S2 : « l'oracle que le diagnostic refuse de construire,
    // la route de création le donne en une requête ». Le client choisissait son
    // identifiant, l'unicité de la clé primaire ignore la RLS, et les deux réponses
    // — « fait doublon » contre « créé » — disaient si la ligne existait DANS UNE
    // AUTRE FILIALE.
    //
    // Ce test ne vérifie pas seulement que les deux réponses se ressemblent : il
    // vérifie que la QUESTION ne peut plus être posée.
    const surIdentifiantExistantAilleurs = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { id: 'RISK-B', champs: { nom: 'sonde' } },
    });
    const surIdentifiantInexistant = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { id: 'RISK-CERTAINEMENT-INEXISTANT', champs: { nom: 'sonde' } },
    });

    assert.equal(surIdentifiantExistantAilleurs.statut, 400);
    assert.equal(surIdentifiantInexistant.statut, 400);
    const normaliser = (corps) => ({ ...corps, reference: null });
    assert.deepEqual(
      normaliser(surIdentifiantExistantAilleurs.corps),
      normaliser(surIdentifiantInexistant.corps),
      'Les deux réponses doivent être indiscernables.',
    );

    // Et rien n'a été créé — la variante silencieuse du constat.
    const apres = await serveur.appeler('GET', '/api/donnees');
    assert.equal(apres.corps.data.risques.some((r) => r.nom === 'sonde'), false);
  });

  test('400 — une entité inconnue ne touche jamais le moteur', async () => {
    for (const nom of ['inconnue', 'risques2', 'pg_class']) {
      const { statut } = await serveur.appeler('POST', `/api/entites/${nom}`, { corps: { champs: {} } });
      assert.equal(statut, 400, `« ${nom} » doit être refusée.`);
    }
    // Une tentative d'injection est arrêtée par le schéma de la route, avant tout.
    const injection = await serveur.appeler('GET', '/api/entites/risques%22%3B%20drop%20table%20risques%3B%20--');
    assert.ok(injection.statut === 400 || injection.statut === 404);
    const intactes = await serveur.appeler('GET', '/api/donnees');
    assert.equal(intactes.statut, 200, 'Et la base est intacte.');
  });
});

/* =====================================================================
 *  §3 — En-têtes, route inconnue, plafonds (S10, S13)
 * ===================================================================== */

describe('Ce que le serveur pose sur toutes ses réponses', () => {
  test('« nosniff » et « no-store » sur chaque réponse, succès comme échec', async () => {
    const appels = [
      await serveur.appeler('GET', '/api/sante'),
      await serveur.appeler('GET', '/api/donnees'),
      await serveur.appeler('GET', '/api/pas-une-route'),
      await serveur.appeler('PUT', '/api/entites/risques/RISK-NEXISTE-PAS', { corps: { version: 1, champs: {} } }),
    ];
    for (const reponse of appels) {
      assert.equal(reponse.entetes['x-content-type-options'], 'nosniff');
      assert.equal(reponse.entetes['cache-control'], 'no-store');
    }
  });

  test('une route inconnue rend un 404 propre, sans pile ni détail interne', async () => {
    const { statut, corps } = await serveur.appeler('GET', '/api/pas-une-route');
    assert.equal(statut, 404);
    assert.equal(corps.erreur, 'ressource_inconnue');
    assert.equal(JSON.stringify(corps).includes('at Object'), false);
  });

  test('un corps hors plafond est refusé sans être lu (contrôle S13)', async () => {
    // 26 Mio par défaut. On envoie plus, et l'on vérifie que le serveur ne meurt pas
    // et refuse. Ce qui compte : ce n'est pas un 500, et la réponse arrive.
    const enorme = JSON.stringify({ champs: { nom: 'x'.repeat(30 * 1024 * 1024) } });
    const { statut } = await serveur.appeler('POST', '/api/entites/risques', {
      corps: enorme,
      entetes: { 'content-type': 'application/json' },
    });
    assert.notEqual(statut, 201, 'Un corps de 30 Mo ne doit pas être accepté.');
    // Le serveur répond encore.
    const apres = await serveur.appeler('GET', '/api/sante');
    assert.equal(apres.statut, 200);
  });
});

/* =====================================================================
 *  §4 — La barrière fail-closed de la session provisoire
 * ===================================================================== */

describe('L’habilitation Groupe ne se fabrique nulle part (suite du constat M-4)', () => {
  /**
   * Fichiers autorisés à ÉCRIRE `administrationGroupe`, et la raison de chacun.
   *
   * Toute autre écriture est une reprise du défaut que ce banc a isolé : la route de
   * reprise se déclarait administratrice pour pouvoir écrire le socle commun, ce
   * qu'aucune session n'avait demandé. Le correctif n'a pas ajouté un contrôle de
   * plus — il a supprimé la possibilité : **le drapeau ne peut venir que du résolveur
   * de périmètre.**
   */
  const AUTORISES = Object.freeze({
    'db/pool.ts': 'déclare le champ du périmètre et la sentinelle systeme (faux)',
    'api/session.ts': 'LE résolveur : c’est là, et seulement là, que le droit se décide',
  });

  test('aucun fichier hors du résolveur ne pose le drapeau d’administration', async () => {
    // Garde-fou STRUCTUREL, découvert et non récité (CONVENTIONS.md §19.5) : il
    // balaie `src/`, il ne consulte aucune liste de routes. Une route ajoutée demain
    // qui se déclarerait administratrice serait signalée le jour où elle est écrite,
    // et non à la porte de sécurité suivante.
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');
    const racine = join(RACINE_BACKEND, 'src');

    const fichiers = [];
    const parcourir = (repertoire) => {
      for (const entree of readdirSync(repertoire, { withFileTypes: true })) {
        const chemin = join(repertoire, entree.name);
        if (entree.isDirectory()) parcourir(chemin);
        else if (entree.name.endsWith('.ts')) fichiers.push(chemin);
      }
    };
    parcourir(racine);
    assert.ok(fichiers.length >= 6, `Balayage suspect : ${String(fichiers.length)} fichier(s).`);

    // Une ÉCRITURE, pas une mention : « administrationGroupe: … » (littéral d'objet)
    // ou « .administrationGroupe = … » (affectation). Lire le champ reste libre —
    // c'est même ce que fait le contrôle du droit.
    const ecriture = /(^|[^.\w])administrationGroupe\s*[:=][^=]/;
    const fautifs = [];
    for (const chemin of fichiers) {
      const relatif = relative(racine, chemin).split('\\').join('/');
      if (AUTORISES[relatif] !== undefined) continue;
      const lignes = readFileSync(chemin, 'utf8').split('\n');
      lignes.forEach((ligne, i) => {
        const utile = ligne.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (ecriture.test(utile)) fautifs.push(`${relatif}:${String(i + 1)} ${ligne.trim().slice(0, 90)}`);
      });
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces lignes posent le drapeau d’administration hors du résolveur de périmètre. ' +
        'C’est par là que le contournement du constat M-4 était passé.',
    );
  });

  test('LE BALAYAGE MORD : il doit VOIR le drapeau là où il est légitime', async () => {
    // Contrôle de morsure du balayage : un motif qui ne trouve rien nulle part
    // rendrait « aucun fautif » pour la pire des raisons. On vérifie donc qu'il
    // trouve bien les écritures autorisées, dans les deux fichiers qui les portent.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');

    const ecriture = /(^|[^.\w])administrationGroupe\s*[:=][^=]/;
    for (const relatif of Object.keys(AUTORISES)) {
      const texte = readFileSync(join(RACINE_BACKEND, 'src', relatif), 'utf8');
      const trouvees = texte.split('\n').filter((ligne) => ecriture.test(ligne.replace(/\/\/.*$/, '')));
      assert.ok(
        trouvees.length > 0,
        `Le motif ne voit rien dans ${relatif} : il ne verrait pas davantage une route fautive.`,
      );
    }
  });

  test('et le serveur réel n’a AUCUNE habilitation Groupe par défaut', async () => {
    // La moitié comportementale : la barrière est fermée à la livraison. L'ouvrir
    // demande une variable d'environnement explicite, documentée, sans effet hors
    // développement — et le journal le crie quand elle est posée.
    const session = await serveur.appeler('GET', '/api/session');
    assert.equal(session.corps.administration_groupe, false);

    // Conséquence directe et vérifiable : une écriture de portée Groupe est refusée.
    const socle = await serveur.appeler('POST', '/api/entites/mappings', {
      corps: { champs: { theme: 'Correspondance du socle' } },
    });
    assert.equal(socle.statut, 403);
    assert.equal(socle.corps.erreur, 'hors_perimetre');
  });
});

describe('La session provisoire est fail-closed en production (contrôle S6)', () => {
  test('en production, aucune donnée n’est servie ni écrite', async () => {
    const production = await monterServeurReel(base, { environnement: 'production' });
    try {
      // La sonde de santé reste servie : elle ne lit aucune donnée métier.
      assert.equal((await production.appeler('GET', '/api/sante')).statut, 200);

      for (const [methode, url, corps] of [
        ['GET', '/api/session', undefined],
        ['GET', '/api/donnees', undefined],
        ['POST', '/api/entites/risques', { champs: { nom: 'tentative en production' } }],
      ]) {
        const reponse = await production.appeler(methode, url, corps === undefined ? {} : { corps });
        assert.equal(reponse.statut, 503, `${methode} ${url} doit être refusé en production.`);
        assert.equal(reponse.corps.erreur, 'indisponible');
      }

      // Contrôle de morsure du contrôle lui-même : rien n'a été écrit.
      const compte = await base.avecPerimetre(
        await base.connexion('app'),
        perimetre('temoin', FILIALE_A, [FILIALE_A]),
        async (c) => (await c.query("select count(*)::int as n from risques where nom = 'tentative en production'")).rows[0].n,
      );
      assert.equal(compte, 0);
    } finally {
      await production.fermer();
    }
  });
});
