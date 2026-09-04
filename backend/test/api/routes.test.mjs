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
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
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

  test('GET /api/modele — décrit les 23 entités, et ne fuit aucun nom de table', async () => {
    const { statut, corps } = await serveur.appeler('GET', '/api/modele');
    assert.equal(statut, 200);
    assert.equal(Object.keys(corps.entites).length, 23);
    assert.equal(corps.schemaVersion, 13);

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
    assert.equal(corps.data.schemaVersion, 13);
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
    'api/session.ts': 'le résolveur PROVISOIRE du lot L2, tant qu’il existe',
  });

  /**
   * Répertoires autorisés à écrire le drapeau — **et la raison est la condition
   * d'entrée E2 elle-même**.
   *
   * `CONVENTIONS.md` §22, E2 : *« le modèle à trois axes décide du profil
   * Administration et du périmètre Groupe **avant** de le poser »*. Ce sont donc
   * exactement ces deux répertoires-là, et aucun autre :
   *
   *  · `droits/` — le modèle à trois axes. C'est **là** que la décision se
   *    prend, à partir des groupes AD résolus ;
   *  · `auth/` — la session serveur, qui porte cette décision dans le périmètre
   *    qu'elle rend à chaque requête.
   *
   * ⚠️ **`api/` n'y est pas, et c'est tout le sujet.** Le greffon monte les
   * routes : aucune ligne de `api/index.ts` ne doit poser ce drapeau. La règle
   * « une route vérifie un droit, elle ne se l'accorde pas » se lit donc encore
   * dans ce balayage, entière.
   */
  const PREFIXES_AUTORISES = Object.freeze({
    'droits/': 'le modèle de droits à trois axes — c’est là que la décision se prend (E2)',
    'auth/': 'la session serveur, qui porte la décision du modèle de droits (E2)',
  });

  /** Un chemin est-il couvert par une des deux listes ? */
  const estAutorise = (relatif) =>
    AUTORISES[relatif] !== undefined ||
    Object.keys(PREFIXES_AUTORISES).some((prefixe) => relatif.startsWith(prefixe));

  /**
   * Fichiers autorisés à POSER LE RÉGLAGE DE SESSION `grc.administration_groupe`.
   *
   * ── Pourquoi c'est une propriété distincte de la précédente ───────────────
   *
   * Le champ TypeScript `administrationGroupe` est une *intention* ; le privilège
   * réel, celui que PostgreSQL arbitre, est le **réglage de session**. Un code qui
   * n'écrirait jamais le champ mais poserait `set_config('grc.administration_groupe',
   * 'oui', true)` avant sa requête obtiendrait exactement le droit que le champ est
   * censé porter — et le balayage précédent ne verrait rien.
   *
   * Les deux balayages ne se remplacent donc pas : l'un garde le nom du champ, l'autre
   * le nom du réglage. Le second est celui qui compte pour la base.
   */
  const AUTORISES_REGLAGE = Object.freeze({
    'db/pool.ts': 'appliquerPerimetre() — le seul endroit qui pose les quatre réglages de session',
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
    //
    // ⚠️ **Le motif excluait un point devant le nom, et c'était un trou.** Il
    // annonçait couvrir « .administrationGroupe = … » et ne le couvrait pas :
    // `perimetre.administrationGroupe = true` passait. Trouvé par le contrôle de
    // morsure du balayage voisin, qui essaie cette forme-là explicitement — un
    // garde-fou éprouvé par un autre garde-fou, ce qui est le seul moyen de
    // découvrir qu'un motif ne mord pas là où son commentaire le promet.
    // Lire reste libre : une lecture n'est jamais suivie de « : » ou de « = ».
    const ecriture = /(^|[^\w])administrationGroupe\s*[:=][^=]/;
    // ── Le littéral `false` n'est pas une écriture du drapeau — vague 4 ────
    //
    // Ce balayage a accusé `src/pieces/exploitation.ts`, qui construit un
    // périmètre pour un travail de fond avec `administrationGroupe: false`. Or
    // l'essai voisin — « E2, le drapeau n'est JAMAIS accordé par une constante »
    // — écrit noir sur blanc que *« un `administrationGroupe: false` est
    // l'inverse : le refus »*. Les deux garde-fous se contredisaient.
    //
    // L'arbitrage suit celui des deux qui porte la propriété **qui ne
    // vieillit pas** : ce qu'on interdit est de **s'accorder** le droit, pas de
    // le refuser. Le balayage ignore donc le littéral `false` — et **rien
    // d'autre** : `: true` reste accusé, et `: uneVariable` aussi, parce qu'une
    // variable peut valoir vrai. C'est le cas dangereux, et il est intact.
    //
    // ⚠️ La solution qu'on choisit d'ordinaire — allonger la liste de fichiers
    // autorisés — aurait été la mauvaise, et l'essai voisin dit pourquoi :
    // *« une liste de fichiers vieillit ; elle ne dit plus rien du jour où un
    // fichier DÉJÀ autorisé s'accorde le droit au lieu de le dériver »*.
    const refusExplicite = /(^|[^\w])administrationGroupe\s*[:=]\s*false\s*[,;)}]/;
    const fautifs = [];
    for (const chemin of fichiers) {
      const relatif = relative(racine, chemin).split('\\').join('/');
      if (estAutorise(relatif)) continue;
      const lignes = readFileSync(chemin, 'utf8').split('\n');
      lignes.forEach((ligne, i) => {
        const utile = ligne.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (ecriture.test(utile) && !refusExplicite.test(utile)) {
          fautifs.push(`${relatif}:${String(i + 1)} ${ligne.trim().slice(0, 90)}`);
        }
      });
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces lignes posent le drapeau d’administration hors du résolveur de périmètre. ' +
        'C’est par là que le contournement du constat M-4 était passé.',
    );
  });

  test('E2 — le drapeau n’est JAMAIS accordé par une constante, nulle part', async () => {
    // ── Pourquoi cette propriété-ci, en plus de la liste de fichiers ──────
    //
    // Une liste de fichiers autorisés vieillit : la vague 3 vient d'y ajouter
    // deux répertoires, et la vague 4 en ajoutera d'autres. Elle ne dit donc
    // plus rien du jour où un fichier *déjà autorisé* s'accorde le droit au
    // lieu de le dériver — et c'est très exactement le défaut du constat M-4,
    // simplement déménagé.
    //
    // La propriété qui ne vieillit pas est celle-ci : **le drapeau est toujours
    // le résultat d'une décision, jamais une constante vraie**. Un
    // `administrationGroupe: true` littéral, où qu'il soit, est un droit qu'on
    // s'accorde. Un `administrationGroupe: false` est l'inverse — le refus par
    // défaut — et reste permis.
    //
    // Elle est vraie de tout `src/`, listes ou pas, et elle s'étend d'elle-même
    // aux fichiers que personne n'a encore écrits.
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

    // `administrationGroupe: true` ou `.administrationGroupe = true`, avec ou
    // sans espaces, suivi de ce qui termine une expression — virgule,
    // point-virgule, accolade, fin de ligne.
    const accorde = /(^|[^\w])administrationGroupe\s*[:=]\s*true(?![\w$])/;
    const fautifs = [];
    for (const chemin of fichiers) {
      const relatif = relative(racine, chemin).split('\\').join('/');
      readFileSync(chemin, 'utf8').split('\n').forEach((ligne, i) => {
        const utile = ligne.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (accorde.test(utile)) fautifs.push(`${relatif}:${String(i + 1)} ${ligne.trim().slice(0, 90)}`);
      });
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces lignes ACCORDENT l’administration Groupe par une constante, au lieu de la dériver ' +
        'du modèle de droits. C’est le constat M-4 sous une autre forme : un droit qu’on se ' +
        'donne n’est pas un droit qu’on vérifie.',
    );

    // ── Contrôle de morsure : le motif doit voir une constante fautive ────
    // Sans lui, « aucun fautif » serait vrai parce que le motif ne voit rien.
    for (const echantillon of [
      '  administrationGroupe: true,',
      '      administrationGroupe: true',
      'perimetre.administrationGroupe = true;',
      '  const p = { administrationGroupe: true };',
    ]) {
      assert.ok(accorde.test(echantillon), `Le motif ne voit pas « ${echantillon.trim()} ».`);
    }
    // Et il doit laisser passer ce qui est légitime : le refus, et la dérivation.
    for (const echantillon of [
      '    administrationGroupe: false,',
      "    administrationGroupe: etat.administrateur && etat.portee === 'groupe',",
      '    administrationGroupe: administrationGroupeDemandee(),',
    ]) {
      assert.equal(accorde.test(echantillon), false, `Le motif mord à tort sur « ${echantillon.trim()} ».`);
    }
  });

  test('E2 — les répertoires nouvellement autorisés portent bien la décision', async () => {
    // Une autorisation qui ne couvre rien est une autorisation qu'on a oublié de
    // retirer : elle élargit le balayage sans contrepartie. On vérifie donc que
    // chaque préfixe autorisé porte au moins une écriture du drapeau — et que
    // cette écriture est une **dérivation**, pas une constante.
    const { readdirSync, readFileSync, existsSync } = await import('node:fs');
    const { join, relative } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');
    const racine = join(RACINE_BACKEND, 'src');

    const ecriture = /(^|[^\w])administrationGroupe\s*[:=][^=]/;
    const inutiles = [];
    for (const prefixe of Object.keys(PREFIXES_AUTORISES)) {
      const repertoire = join(racine, prefixe);
      // Le répertoire peut ne pas exister : la vague 3 est en cours, et un
      // balayage qui EXIGERAIT sa présence ferait rougir le banc d'un autre
      // agent pendant qu'il écrit. Ce qu'on refuse est l'autorisation qui
      // couvre un répertoire présent et muet.
      if (!existsSync(repertoire)) continue;
      let vues = 0;
      const parcourir = (dossier) => {
        for (const entree of readdirSync(dossier, { withFileTypes: true })) {
          const chemin = join(dossier, entree.name);
          if (entree.isDirectory()) {
            parcourir(chemin);
            continue;
          }
          if (!entree.name.endsWith('.ts')) continue;
          for (const ligne of readFileSync(chemin, 'utf8').split('\n')) {
            if (ecriture.test(ligne.replace(/\/\/.*$/, ''))) vues += 1;
          }
        }
      };
      parcourir(repertoire);
      if (vues === 0) inutiles.push(`${prefixe} (${relative(racine, repertoire)})`);
    }
    assert.deepEqual(
      inutiles,
      [],
      'Ces répertoires sont autorisés à poser le drapeau d’administration et n’en font rien : ' +
        'l’autorisation élargit le balayage sans contrepartie, et doit être retirée.',
    );
  });

  test('aucun fichier hors du pool ne POSE le réglage « grc.administration_groupe »', async () => {
    // Le pendant du balayage précédent, côté base. `f_administration_groupe()` lit ce
    // réglage et rien d'autre : qui le pose détient le droit, quel que soit l'état du
    // champ TypeScript. Poser le réglage ailleurs que dans `appliquerPerimetre`, c'est
    // s'accorder l'administration Groupe pour la durée d'une transaction.
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

    // Une POSE, pas une lecture : `set_config('grc.administration_groupe', …)` ou
    // `set grc.administration_groupe = …`. `current_setting(…)` reste libre — c'est
    // ce que fait la base pour décider.
    const pose = /(set_config\s*\(\s*['"`]grc\.administration_groupe|set\s+grc\.administration_groupe\s*=)/i;
    const fautifs = [];
    for (const chemin of fichiers) {
      const relatif = relative(racine, chemin).split('\\').join('/');
      if (AUTORISES_REGLAGE[relatif] !== undefined) continue;
      readFileSync(chemin, 'utf8').split('\n').forEach((ligne, i) => {
        if (pose.test(ligne.replace(/\/\/.*$/, ''))) {
          fautifs.push(`${relatif}:${String(i + 1)} ${ligne.trim().slice(0, 90)}`);
        }
      });
    }
    assert.deepEqual(
      fautifs,
      [],
      'Ces lignes posent elles-mêmes le réglage de session qui accorde l’administration Groupe. ' +
        'Le champ TypeScript peut rester à faux : c’est CE réglage que PostgreSQL arbitre.',
    );
  });

  test('LE BALAYAGE MORD : il doit VOIR le drapeau là où il est légitime', async () => {
    // Contrôle de morsure du balayage : un motif qui ne trouve rien nulle part
    // rendrait « aucun fautif » pour la pire des raisons. On vérifie donc qu'il
    // trouve bien les écritures autorisées, dans les deux fichiers qui les portent.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');

    const ecriture = /(^|[^\w])administrationGroupe\s*[:=][^=]/;
    for (const relatif of Object.keys(AUTORISES)) {
      const texte = readFileSync(join(RACINE_BACKEND, 'src', relatif), 'utf8');
      const trouvees = texte.split('\n').filter((ligne) => ecriture.test(ligne.replace(/\/\/.*$/, '')));
      assert.ok(
        trouvees.length > 0,
        `Le motif ne voit rien dans ${relatif} : il ne verrait pas davantage une route fautive.`,
      );
    }

    // Et le second motif, celui du réglage de session, doit voir la pose légitime.
    const pose = /(set_config\s*\(\s*['"`]grc\.administration_groupe|set\s+grc\.administration_groupe\s*=)/i;
    for (const relatif of Object.keys(AUTORISES_REGLAGE)) {
      const texte = readFileSync(join(RACINE_BACKEND, 'src', relatif), 'utf8');
      assert.ok(
        texte.split('\n').some((ligne) => pose.test(ligne.replace(/\/\/.*$/, ''))),
        `Le motif de POSE ne voit rien dans ${relatif} : il ne verrait pas davantage une pose fautive.`,
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
  /**
   * TOUS les points d'entrée qui touchent aux données, avec de quoi les appeler.
   *
   * ── Pourquoi la liste, et pourquoi elle est ici ──────────────────────────
   *
   * Le troisième passage de la porte a relevé que `POST /api/reprise` n'était couvert
   * par aucun essai en production : « T-3 serait tombé si le banc l'avait couvert ».
   * Le défaut n'était pas dans le test qui existait — il était dans ce qu'il ne
   * regardait pas. Une route neuve échappait à la barrière parce que le banc éprouvait
   * trois routes choisies à la main.
   *
   * La parade tient en deux temps : la liste ci-dessous, et le test suivant qui la
   * confronte aux routes **réellement montées** dans Fastify. Une route ajoutée demain
   * sans être ajoutée ici fait échouer le second, et le premier la couvre dès qu'elle
   * y entre. C'est la seule forme d'exhaustivité qu'un banc puisse tenir sans réciter
   * (`CONVENTIONS.md` §19.5).
   */
  const POINTS_DENTREE = Object.freeze([
    ['GET', '/api/session', undefined],
    ['GET', '/api/modele', undefined],
    ['GET', '/api/donnees', undefined],
    // L'extraction du jeu de données entier — le droit d'export du
    // `PLAN_SERVEUR` §3.3. Elle est ici pour la même raison que les autres :
    // hors développement, elle ne doit rien servir du tout.
    ['GET', '/api/export', undefined],
    ['GET', '/api/rafraichir?depuis=2026-01-01T00:00:00.000Z', undefined],
    // Les trois routes du journal d'audit (lot L5, `CONVENTIONS.md` §29.8). Elles
    // sont ici pour une raison plus forte que les autres : hors développement,
    // une consultation du journal servie sans identité livrerait trois ans
    // d'identités, d'adresses IP et de valeurs avant/après — et l'export en
    // livrerait le fichier. C'est la table dont l'objet est de faire preuve ;
    // elle ne peut pas être la seule à sortir de la barrière.
    // Les huit routes des pièces jointes (lot L6). Elles sont ici pour la raison
    // qui vaut pour toutes : hors développement, une pièce servie sans identité
    // livrerait un document que son déposant croyait cloisonné. ⚠️ Cet essai
    // était vert **parce que la couture était débranchée** — il rougit dès que
    // `register(greffonPieces, { pool, config })` est écrit, ce qui est
    // exactement ce qu'un contrôle doit faire quand une surface apparaît.
    ['POST', '/api/pieces/risques/RISK-A', undefined],
    ['GET', '/api/pieces/risques/RISK-A', undefined],
    ['GET', '/api/pieces/risques/RISK-A/PJ-A', undefined],
    ['DELETE', '/api/pieces/risques/RISK-A/PJ-A', undefined],
    ['POST', '/api/pieces/logo', undefined],
    ['GET', '/api/pieces/logo', undefined],
    ['GET', '/api/pieces/logo/PJ-A', undefined],
    ['DELETE', '/api/pieces/logo/PJ-A', undefined],
    ['GET', '/api/journal', undefined],
    ['GET', '/api/journal/export', undefined],
    ['GET', '/api/journal/verification', undefined],
    // Le sélecteur de filiale du lot L4 (`CONVENTIONS.md` §30.2). Il est ici pour
    // la raison qui vaut pour tous les autres, et une de plus : c'est la seule
    // route du produit qui reçoit un identifiant de filiale, et une route qui
    // déplacerait un périmètre d'écriture sans identité serait la forme la plus
    // directe du défaut que le §30.1 décrit.
    ['PUT', '/api/session/filiale-active', { filiale: 'FIL-TENTATIVE' }],
    // La liste des filiales du périmètre de session (lot L4) : servie sans
    // identité, elle donnerait la cartographie des filiales du groupe.
    ['GET', '/api/filiales', undefined],
    // Les trois routes de l'import généralisé (lot L7). Servies sans identité,
    // la première dirait la forme exacte du modèle de données, et la troisième
    // laisserait n'importe qui écrire 5 000 lignes dans une filiale.
    ['GET', '/api/import/modeles', undefined],
    ['GET', '/api/import/incidents/modele', undefined],
    ['POST', '/api/import/incidents', undefined],
    // Les deux routes du circuit d'approbation (lot L8). Servies sans identité,
    // elles diraient qui a validé quoi — et la seconde PRONONCERAIT une décision
    // irréversible au nom de personne, dans le mécanisme dont tout l'objet est
    // d'attribuer une décision à quelqu'un.
    ['GET', '/api/approbations/documents/DOC-A', undefined],
    ['POST', '/api/approbations/documents/DOC-A', { etape: 'redaction', decision: 'approuve' }],
    // La création de filiale (lot L4, constat Q-149). Servie sans identité, elle
    // laisserait n'importe qui inscrire une société dans le groupe — et créer,
    // au passage, ses groupes d'annuaire.
    ['POST', '/api/filiales', { code: 'ZZFERM', raison_sociale: 'Créée sans identité' }],
    // La consolidation Groupe (lot L4, la part que le lot avait laissée ouverte).
    // Elle est ici pour une raison qui lui est propre : c'est la SEULE route du
    // produit qui lit délibérément plusieurs filiales à la fois. Servie sans
    // identité, elle ne livrerait pas une filiale mais le groupe entier — les
    // volumes, les incidents à déclarer et le retard de chacune des vingt.
    ['GET', '/api/consolidation', undefined],
    ['POST', '/api/entites/risques', { champs: { nom: 'tentative' } }],
    ['PUT', '/api/entites/risques/RISK-A', { version: 1, champs: { nom: 'tentative' } }],
    ['DELETE', '/api/entites/risques/RISK-A?version=1', undefined],
    ['POST', '/api/operations/propager-mesure', { mesureId: 'MESURE-A' }],
    ['POST', '/api/reprise', {
      mode: 'fusionner',
      fichier: {
        nom: 'tentative.json',
        contenu: JSON.stringify({
          format: 'grc-backup',
          version: 12,
          app: 'cyber-grc-dedienne',
          createdAt: '2026-08-31T09:00:00.000Z',
          encrypted: false,
          payload: { schemaVersion: 12, risques: [{ id: 'RISK-PROD', nom: 'tentative' }] },
        }),
      },
    }],
  ]);

  /**
   * Recompose les routes RÉELLEMENT montées à partir de l'arbre de Fastify.
   *
   * `printRoutes()` rend un arbre, pas une liste : un enfant n'y porte que son propre
   * segment (`/:identifiant` sous `/api/entites/:entite`), et Fastify expose en plus un
   * `HEAD` pour chaque `GET`. Lire l'arbre ligne à ligne — ce que faisait la première
   * version de ce test — produisait `PUT /:identifiant`, qui ne ressemble à aucune
   * route : le contrôle criait au manque sur une route pourtant couverte, et se serait
   * tu sur une vraie omission dès qu'on l'aurait « corrigé » en relâchant la
   * comparaison. L'indentation porte la profondeur, quatre caractères par niveau.
   */
  function routesMontees(instance) {
    const table = instance.printRoutes({ commonPrefix: false });
    const pile = [];
    const montees = new Set();
    for (const ligne of table.split('\n')) {
      const marque = /^([\s│]*)(?:├──|└──)\s(\S+)(?:\s+\(([^)]+)\))?/u.exec(ligne);
      if (marque === null) continue;
      const profondeur = marque[1].length / 4;
      pile.length = profondeur;
      pile[profondeur] = marque[2];
      if (marque[3] === undefined) continue; // nœud de branchement sans méthode propre
      const chemin = pile.join('').replace(/(.)\/$/, '$1');
      for (const methode of marque[3].split(',')) montees.add(`${methode.trim()} ${chemin}`);
    }
    return montees;
  }

  /** Met une entrée du banc à la forme du routeur : `MÉTHODE /chemin/:parametre`. */
  /**
   * La forme de routeur d'une URL de sonde — **demandée à Fastify, plus devinée**.
   *
   * ⚠️ Cette fonction normalisait à la main, par deux expressions régulières qui
   * ne connaissaient que `/entites/…`. Le lot L6 a monté huit routes sous
   * `/api/pieces/…`, et le contrôle « la liste est complète » a rougi en les
   * déclarant non éprouvées — alors qu'elles l'étaient : c'est la NORMALISATION
   * qui ne savait pas les reconnaître.
   *
   * Le remède habituel — ajouter deux motifs — aurait tenu jusqu'au lot suivant.
   * Le routeur, lui, sait déjà : `findRoute()` rend la route qu'une URL atteint
   * réellement, paramètres compris. On lui demande donc, au lieu de réécrire à
   * côté de lui une seconde table de correspondance qui divergera (`CONVENTIONS.md`
   * §19.5 — *une liste écrite à la main est une omission qui attend*).
   *
   * Le repli sur l'URL nue n'est pas un défaut : une sonde qui ne résout vers
   * aucune route est précisément ce que le contrôle doit signaler.
   */
  function formeRouteur(methode, url, instance) {
    const chemin = url.split('?')[0];
    const trouvee = instance?.findRoute?.({ method: methode, url: chemin });
    // `findRoute` rend `{ handler, params, searchParams }` — les VALEURS des
    // paramètres, pas le modèle d'URL. On le reconstruit : chaque segment qui
    // est la valeur d'un paramètre redevient `:nom`. Le routeur décide donc de
    // ce qui est un paramètre, et l'essai n'en décide rien.
    if (trouvee?.params === undefined) return `${methode} ${chemin}`;
    const parNom = new Map(Object.entries(trouvee.params).map(([nom, valeur]) => [String(valeur), nom]));
    const modele = chemin
      .split('/')
      .map((segment) => (parNom.has(segment) ? `:${parNom.get(segment)}` : segment))
      .join('/');
    return `${methode} ${modele}`;
  }

  test('LE GÉNÉRATEUR QUI ÉCRIT : 250 créations d’affilée, 250 identifiants distincts', async () => {
    // ── La leçon du constat Q-1, appliquée à ce banc ─────────────────────────
    //
    // Le banc portait déjà un essai d'entropie — 250 puis 20 000 tirages — sur le
    // générateur SQL. Celui-là n'écrit rien : aucune ligne du produit ne passe par
    // lui. Le générateur qui écrit vraiment est celui du serveur, appelé par la
    // route de création, et il n'était mesuré nulle part. Un essai d'entropie sur
    // un générateur inerte rassure sans rien prouver — c'est exactement la forme
    // de défaut que cette porte a relevée trois fois.
    //
    // On mesure donc le CHEMIN RÉEL : la route, la base, et les identifiants tels
    // qu'ils y sont écrits. Aucune fonction n'est appelée à part.
    const LOT = 250;
    const marque = `Entropie ${String(Date.now())}`;
    const rendus = [];
    for (let i = 0; i < LOT; i += 1) {
      const reponse = await serveur.appeler('POST', '/api/entites/risques', {
        corps: { champs: { nom: `${marque} n° ${String(i + 1)}` } },
      });
      assert.equal(reponse.statut, 201, JSON.stringify(reponse.corps).slice(0, 200));
      rendus.push(reponse.corps.enregistrement.id);
    }

    assert.equal(
      new Set(rendus).size,
      LOT,
      'Deux créations consécutives ne doivent jamais rendre le même identifiant.',
    );

    // ── Et ce sont les identifiants qui distinguent, PAS l'horloge ──────────
    //
    // Chaque création passe ici par une transaction : l'horodatage avance donc à
    // presque chaque appel, et « 250 identifiants distincts » serait vrai même
    // d'un générateur sans aléa du tout. Première rédaction de ce test : elle
    // exigeait des horodatages répétés, et échouait pour cette raison — elle
    // décrivait la boucle du navigateur, pas ce chemin-ci.
    //
    // On mesure donc la part VARIABLE seule. Le dernier champ est l'aléa ; si le
    // format changeait pour n'en plus avoir qu'un, `pop()` rendrait l'identifiant
    // entier et l'assertion resterait vraie de ce qu'elle veut dire.
    const alea = new Set(rendus.map((id) => id.split('-').pop()));
    assert.equal(
      alea.size,
      LOT,
      `Sur ${String(LOT)} créations, l’aléa n’a pris que ${String(alea.size)} valeurs distinctes. ` +
        'Un générateur dont l’aléa se répète perd des lignes dès que l’horodatage cesse ' +
        'de varier — c’est le bloquant T-1, et il n’a pas besoin d’une boucle serrée pour ' +
        'se produire : deux postes qui écrivent la même milliseconde suffisent.',
    );

    // Et la preuve par la base : 250 confiées, 250 écrites, aucune écrasée.
    const client = await base.connexion('app');
    const enBase = await base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
      (await c.query('select count(*)::int as n, count(distinct id)::int as d from risques where nom like $1', [
        `${marque} %`,
      ])).rows[0]);
    assert.equal(enBase.n, LOT, `${String(LOT)} créations, ${String(enBase.n)} lignes.`);
    assert.equal(enBase.d, LOT, 'Et autant d’identifiants distincts.');
  });

  test('AUCUN point d’entrée ne sert de données hors développement (constat T-3)', async () => {
    // ── Ce que le lot L3 a changé, et pourquoi cet essai est PLUS fort qu'avant ──
    //
    // Avant L3, la barrière était unique : la session provisoire refusait de
    // résoudre hors du développement, et chaque route rendait 503. L'essai montait
    // donc un serveur de production et comptait les 503.
    //
    // Depuis L3 il y a DEUX barrières, et elles ne se remplacent pas :
    //
    //   1. sans AUCUN moyen d'authentification, le serveur REFUSE DE DÉMARRER —
    //      la faute de déploiement est prise à l'allumage, pas à chaque requête ;
    //   2. avec l'authentification réelle, une requête sans session est refusée
    //      en `onRequest`, avant l'analyse du corps (condition E4) — 401, plus 503.
    //
    // Les deux sont éprouvées ici. Se contenter de la seconde laisserait passer
    // une installation sans annuaire ni compte de secours ; se contenter de la
    // première laisserait passer une installation correcte mais grande ouverte.
    for (const environnement of ['production', 'recette']) {
      // ── Barrière 1 : rien pour authentifier ───────────────────────────────
      //
      // ⚠️ Elle ne vaut QU'EN PRODUCTION, et l'écart est délibérément éprouvé ici
      // plutôt que tu : `src/config/index.ts` gate ce refus sur `estProduction`.
      // En recette, un serveur sans annuaire ni compte de secours démarre — et
      // c'est la forme du constat M-5, où une barrière protégeait la production
      // et pas la recette, laquelle porte « une copie réaliste de la production »
      // (`PLAN_SERVEUR` §1.10). Ici rien ne fuit — la session provisoire refuse de
      // résoudre et rend 503 partout —, mais l'exploitant ne l'apprend qu'au
      // premier appel. Constat Q-73.
      if (environnement === 'production') {
        await assert.rejects(
          () => monterServeurReel(base, { authentification: 'provisoire', environnement }),
          (erreur) => {
            assert.match(
              String(erreur.message),
              /moyen d’authentification|moyen d'authentification/,
              'Un serveur de production sans annuaire NI compte de secours a démarré. ' +
                'Le refus doit venir de la configuration, au démarrage : une installation ' +
                'muette est une installation ouverte.',
            );
            return true;
          },
        );
      } else {
        // Recette : elle démarre. Ce qui doit alors tenir, c'est le refus à la
        // requête — et il tient, sinon la copie réaliste serait servie sans identité.
        const sansAuth = await monterServeurReel(base, { authentification: 'provisoire', environnement });
        try {
          const reponse = await sansAuth.appeler('GET', '/api/donnees');
          assert.equal(reponse.statut, 503, 'Recette sans authentification : rien ne doit être servi.');
          assert.equal(reponse.corps?.erreur, 'indisponible');
        } finally {
          await sansAuth.fermer();
        }
      }

      // ── Barrière 2 : authentification réelle, aucune session → rien n'est servi ──
      // ⚠️ Le rythme est desserré POUR CET ESSAI, et il faut dire pourquoi.
      //
      // La barrière éprouvée ici est celle de l'IDENTITÉ : « aucun point d'entrée
      // ne sert de données sans authentification ». Le limiteur de rythme en est
      // une autre, et elle refuse elle aussi — en 429. Avec sa borne ordinaire
      // (20 refus par adresse), la sonde épuise le budget avant la fin de la
      // liste, et les derniers points d'entrée sont refusés **par le limiteur**.
      //
      // L'essai passerait quand même, puisque rien n'est servi. C'est justement
      // le danger : il cesserait de mesurer la barrière qu'il nomme, et un jour
      // où l'authentification manquerait sur la dernière route, il rendrait vert
      // — le 429 la couvrant. Un contrôle doit interroger le chemin qu'il
      // prétend interroger, sinon il se mesure lui-même (7ᵉ passage de S2).
      //
      // Le limiteur a sa propre famille d'essais (`test/api/limiteur-rythme`).
      const serveurFerme = await monterServeurReel(base, {
        authentification: 'reelle',
        environnement,
        env: { API_RYTHME_MAX_ANONYME: '1000' },
      });
      try {
        const servis = [];
        for (const [methode, url, corps] of POINTS_DENTREE) {
          const reponse = await serveurFerme.appeler(methode, url, corps === undefined ? {} : { corps });
          // 401 « non_authentifie » est le refus attendu depuis E4. 503
          // « indisponible » reste admis : c'est le refus de la session provisoire,
          // et il vaut si le résolveur n'a pas pu se prononcer. Tout le reste est
          // une donnée servie sans identité.
          const refuse =
            (reponse.statut === 401 && reponse.corps?.erreur === 'non_authentifie') ||
            (reponse.statut === 503 && reponse.corps?.erreur === 'indisponible');
          if (!refuse) {
            servis.push(
              `${environnement} · ${methode} ${url} → ${String(reponse.statut)} ${String(reponse.corps?.erreur ?? '')}`,
            );
          }
          // Fastify expose un `HEAD` pour chaque `GET` : la moitié des routes montées
          // vit là. `HEAD` ne rend pas de corps, seul le statut est jugeable — c'est
          // assez pour distinguer un refus d'un 200.
          if (methode === 'GET') {
            const tete = await serveurFerme.appeler('HEAD', url);
            if (tete.statut !== 401 && tete.statut !== 503) {
              servis.push(`${environnement} · HEAD ${url} → ${String(tete.statut)}`);
            }
          }
        }
        assert.deepEqual(
          servis,
          [],
          'Chaque entrée est un point d’entrée qui sert des données de gouvernance sans ' +
            'authentification. La sonde de santé est la seule exception admise.',
        );

        // Contrôle symétrique : la sonde de santé, elle, doit répondre — un serveur
        // muet est indiagnosticable, et elle ne lit aucune donnée métier.
        assert.equal((await serveurFerme.appeler('GET', '/api/sante')).statut, 200);
      } finally {
        await serveurFerme.fermer();
      }
    }
  });

  test('LA LISTE EST COMPLÈTE : elle couvre toutes les routes réellement montées', async () => {
    // Contrôle de morsure du test précédent. Une liste écrite à la main est une
    // omission qui attend ; celle-ci est confrontée au routeur de Fastify, qui sait
    // ce qui est monté. Une route ajoutée sans être couverte est nommée ici.
    const montees = routesMontees(serveur.instance);

    // Contrôle de morsure du lecteur d'arbre lui-même : s'il rendait des segments nus,
    // il ne signalerait plus jamais rien d'utile. La route imbriquée est la preuve.
    assert.ok(
      montees.has('PUT /api/entites/:entite/:identifiant'),
      `Lecteur d’arbre en défaut, il ne recompose plus les routes imbriquées : ${[...montees].join(' · ')}`,
    );
    assert.ok(montees.size >= 12, `Routeur illisible : ${[...montees].join(' · ')}`);

    const couvertes = new Set();
    for (const [methode, url] of POINTS_DENTREE) {
      couvertes.add(formeRouteur(methode, url, serveur.instance));
      if (methode === 'GET') couvertes.add(formeRouteur('HEAD', url, serveur.instance));
    }
    // `/api/sante` est délibérément hors barrière : elle est éprouvée à part.
    const manquantes = [...montees].filter((route) => !couvertes.has(route) && !route.endsWith('/api/sante'));
    assert.deepEqual(
      manquantes,
      [],
      'Ces routes sont montées et ne sont pas éprouvées en environnement fermé. ' +
        'C’est par là que le constat T-3 est passé.',
    );
  });

  test('en production, aucune donnée n’est servie ni écrite', async () => {
    // Depuis L3, un serveur de production PORTE une authentification réelle — sans
    // quoi il ne démarre pas (essai T-3 ci-dessus). Le refus attendu n'est donc plus
    // le 503 de la session provisoire mais le 401 de l'absence de session, rendu en
    // `onRequest` avant l'analyse du corps (condition E4).
    const production = await monterServeurReel(base, { authentification: 'reelle', environnement: 'production' });
    try {
      // La sonde de santé reste servie : elle ne lit aucune donnée métier.
      assert.equal((await production.appeler('GET', '/api/sante')).statut, 200);

      for (const [methode, url, corps] of [
        ['GET', '/api/session', undefined],
        ['GET', '/api/donnees', undefined],
        ['POST', '/api/entites/risques', { champs: { nom: 'tentative en production' } }],
      ]) {
        const reponse = await production.appeler(methode, url, corps === undefined ? {} : { corps });
        assert.equal(reponse.statut, 401, `${methode} ${url} doit être refusé en production.`);
        assert.equal(reponse.corps.erreur, 'non_authentifie');
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
