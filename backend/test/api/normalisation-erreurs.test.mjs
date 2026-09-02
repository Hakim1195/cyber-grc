/**
 * normalisation-erreurs.test.mjs — UNE normalisation, pas deux (constat Q-55).
 *
 * ── Le constat, et pourquoi il n'était pas « un message oublié » ─────────────
 *
 * Le neuvième passage de la porte S2 a mesuré, derrière un Apache réel, sans
 * authentification :
 *
 *   POST /api/inconnue   {"a":   → {"erreur":"FST_ERR_CTP_INVALID_JSON_BODY",
 *                                   "message":"Body is not valid JSON but
 *                                    content-type is set to 'application/json'"}
 *
 * La même requête sur une route DU GREFFON ne fuyait rien. Le défaut n'était
 * donc pas un message manquant : c'était **une seconde normalisation, plus
 * pauvre, écrite à côté de la première** — `serveur.ts` décidait lui-même du
 * code, du statut et du message pour tout ce qui ne traverse pas le greffon.
 * Le remède en retire une au lieu d'en ajouter une : les **trois** sorties qui
 * traduisent une erreur levée — le greffon, le gestionnaire général, et le
 * point d'entrée d'avant le routage — appellent `traduireErreur`, et rien
 * d'autre. La quatrième, le 404, ne traduit rien puisque rien n'a été levé :
 * elle doit en revanche rendre le même vocabulaire de codes et la même
 * référence d'incident que les trois autres, et c'est ce que le §5 vérifie.
 *
 * ── Comment ce fichier juge, et pourquoi il n'épingle aucune phrase ──────────
 *
 * Épingler la phrase française attendue ferait de ce banc le gardien d'une
 * rédaction, pas d'une propriété — et la première reformulation le ferait
 * rougir pour rien. Ce fichier interroge donc **la source unique elle-même** :
 * il importe `traduireErreur` (le module de traduction n'a aucune dépendance
 * d'exécution, c'est écrit dans son en-tête et c'est ce qui le rend importable
 * seul) et compare le corps rendu SUR LE RÉSEAU à ce que cette fonction
 * produit pour la même erreur. La propriété tenue est « il n'existe qu'une
 * normalisation », pas « le message est celui-ci ».
 *
 * ⚠️ **Cette comparaison est vide si la normalisation elle-même se met à
 * recopier le texte du cadre** : elle serait alors d'accord avec la fuite. Les
 * deux moitiés de ce fichier sont donc indissociables :
 *
 *  · l'égalité avec `traduireErreur` voit **une seconde normalisation** ;
 *  · le balayage des marqueurs de fuite voit **une normalisation qui bavarde**.
 *
 * Aucune des deux ne remplace l'autre, et c'est pour cela qu'elles cohabitent.
 *
 * ── Pourquoi un serveur qui ÉCOUTE, et pas `inject()` ───────────────────────
 *
 *  · `frameworkErrors` traite ce que Fastify refuse **avant le routage** — une
 *    URL au pourcentage invalide. Cela se joue sur l'analyse d'une requête
 *    réelle, pas sur un objet fabriqué par le banc.
 *  · Le défaut vivait sur les routes **inconnues**. Un banc qui n'interroge que
 *    les routes du greffon ne peut pas le voir : c'est exactement ce qui s'est
 *    passé pendant huit passages.
 *
 * Le cas de l'URL malformée est mesuré **en direct**. Ce n'est pas un confort :
 * Apache 2.4.58 rend son propre `400 Bad Request` sur `/api/%zz` — mesuré sur
 * cette machine, la requête n'atteint jamais le mandataire. Derrière le frontal
 * livré, ce chemin est donc masqué ; la recette et un service interrogé
 * directement, eux, ne le sont pas.
 *
 * Prérequis machine : PostgreSQL préparé (`bash db/dev/preparer_base_dev.sh`).
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { lancerServeurProcessus } from '../aide/serveur.mjs';
import { traduireErreur } from '../../src/erreurs/index.ts';

const RACINE_BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const RACINE_SRC = join(RACINE_BACKEND, 'src');

/** Une route que le greffon possède, et une qu'il ne possède pas. */
const ROUTE_GREFFON = '/api/entites/risques';
const ROUTE_INCONNUE = '/api/route-que-personne-ne-sert';

/** Corps que le lecteur JSON de Fastify refuse, chacun pour sa raison. */
const CORPS_REFUSES = [
  ['tronqué', '{"a":'],
  ['vide', ''],
];

/**
 * Ce qu'aucune réponse ne doit porter.
 *
 * ── Pourquoi une liste ici, alors que ce dépôt s'en méfie ────────────────────
 *
 * Parce qu'une entrée manquante ne rend rien de faux VERT : elle rend le
 * balayage moins large, et l'autre moitié du fichier — l'égalité avec la
 * normalisation — continue de juger. C'est le cas où une liste coûte de la
 * couverture, jamais une fausse assurance (`CONVENTIONS.md` §17.5).
 */
const MARQUEURS_DE_FUITE = [
  ['la nomenclature interne du cadre', /FST_[A-Z0-9_]+/],
  ['le nom du cadre', /fastify/i],
  ['le lecteur de corps, en anglais', /Body is not valid JSON|valid url component|content-type is set/i],
  ['une pile d’appel', /\bat\s+\S+\s*\([^)]*:\d+:\d+\)|\.[jt]s:\d+:\d+/],
  ['un chemin du serveur', /\/(?:home|opt|usr|var|root)\/[A-Za-z0-9_./-]+/],
];

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await lancerServeurProcessus(base);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/**
 * Une requête HTTP dont le banc maîtrise TOUT — jusqu'au chemin brut.
 *
 * `fetch` réécrit l'URL avant de l'émettre ; ce fichier a besoin d'envoyer
 * `/api/%zz` tel quel, donc il descend d'un étage.
 */
function brute(methode, chemin, entetes = {}, corps = undefined) {
  return new Promise((resoudre, rejeter) => {
    const requete = http.request(
      { host: '127.0.0.1', port: serveur.port, method: methode, path: chemin, headers: entetes },
      (reponse) => {
        let texte = '';
        reponse.on('data', (morceau) => { texte += String(morceau); });
        reponse.on('end', () => {
          let corpsJson = null;
          try { corpsJson = JSON.parse(texte); } catch { corpsJson = null; }
          resoudre({ statut: reponse.statusCode, texte, corps: corpsJson });
        });
      },
    );
    requete.on('error', rejeter);
    if (corps !== undefined) requete.write(corps);
    requete.end();
  });
}

const JSON_ENTETES = { 'content-type': 'application/json' };

/** Aucun marqueur de fuite dans ce qui est parti sur le réseau. */
function exigerAucuneFuite(vue, quoi) {
  for (const [nom, motif] of MARQUEURS_DE_FUITE) {
    assert.equal(
      motif.test(vue.texte),
      false,
      `${quoi} laisse passer ${nom} (${String(motif)}). Le contrôle S12 veut deux ` +
        `destinataires et deux textes : le détail va au journal, jamais à la réponse. ` +
        `Reçu : ${vue.texte.slice(0, 300)}`,
    );
  }
}

/** Ce que LA normalisation produit pour une erreur du cadre de statut donné. */
function normalisationDe(statut, codeCadre) {
  const erreur = Object.assign(new Error('texte interne du cadre, qui ne doit pas sortir'), {
    statusCode: statut,
    code: codeCadre,
  });
  return traduireErreur(erreur).corps();
}

/* =====================================================================
 *  §1 — La famille, pas le membre
 * ===================================================================== */

describe('Une route inconnue ne raconte pas le cadre (constat Q-55)', () => {
  test('LE CORPS TRONQUÉ ET LE CORPS VIDE : deux membres, une seule famille', async () => {
    // Le constat ne nommait que le premier. Le second est sorti d'avoir mesuré
    // la famille entière avant d'en boucher un membre — et c'est la raison
    // d'être de cet essai : il ne vise pas un message, il vise un chemin.
    const attendu = normalisationDe(400, 'FST_ERR_CTP_INVALID_JSON_BODY');

    for (const [nom, corps] of CORPS_REFUSES) {
      const vue = await brute('POST', ROUTE_INCONNUE, JSON_ENTETES, corps);

      exigerAucuneFuite(vue, `Un corps ${nom} sur une route inconnue`);

      assert.equal(vue.statut, 400, `Un corps ${nom} est une entrée invalide, pas autre chose.`);
      assert.notEqual(vue.corps, null, `La réponse doit rester du JSON. Reçu : ${vue.texte.slice(0, 200)}`);
      assert.equal(
        vue.corps.erreur,
        attendu.erreur,
        `Le code rendu n’est pas celui de la normalisation du produit. Un corps ${nom} sur ` +
          `une route inconnue doit sortir par LE MÊME chemin que partout ailleurs.`,
      );
      assert.equal(
        vue.corps.message,
        attendu.message,
        `Le message rendu n’est pas celui de la normalisation du produit : il y a une ` +
          `SECONDE normalisation quelque part. Reçu : ${String(vue.corps.message)}`,
      );
      assert.match(
        String(vue.corps.reference ?? ''),
        /^REQ-/,
        'Sans référence, l’utilisateur qui appelle le support n’a rien à donner.',
      );
    }
  });
});

/* =====================================================================
 *  §2 — L'erreur d'AVANT le routage
 * ===================================================================== */

describe('Ce que Fastify refuse avant de router passe par la même porte', () => {
  test('GET /api/%zz — l’URL malformée, mesurée EN DIRECT', async () => {
    // Ce chemin ne traverse ni le greffon, ni `setErrorHandler` : Fastify le
    // rejette pendant l'analyse de la requête, donc avant tout routage. Sans le
    // point d'entrée `frameworkErrors`, il sortait par le sérialiseur par
    // défaut du cadre — `FST_ERR_BAD_URL` et sa phrase anglaise.
    //
    // ⚠️ Interrogé DIRECTEMENT, et c'est mesuré : Apache 2.4.58 rend son propre
    // 400 sur ce chemin, la requête n'atteint jamais le mandataire. Un contrôle
    // qui passerait par le frontal serait vert sans rien avoir éprouvé — la
    // leçon du septième passage, à un étage de plus.
    const vue = await brute('GET', '/api/%zz');

    exigerAucuneFuite(vue, 'Une URL au pourcentage invalide');

    assert.equal(vue.statut, 400);
    assert.notEqual(vue.corps, null, `Réponse non JSON : ${vue.texte.slice(0, 200)}`);

    const attendu = normalisationDe(400, 'FST_ERR_BAD_URL');
    assert.equal(vue.corps.erreur, attendu.erreur);
    assert.equal(
      vue.corps.message,
      attendu.message,
      'Une erreur levée avant le routage doit être traduite comme les autres, ' +
        'sinon il existe un troisième texte pour dire la même chose.',
    );
    assert.match(String(vue.corps.reference ?? ''), /^REQ-/);
  });
});

/* =====================================================================
 *  §3 — Une seule normalisation
 * ===================================================================== */

describe('Le greffon et le reste du serveur disent la même chose', () => {
  test('LE CŒUR DU CONSTAT : même corps malformé, même code, même message, DEUX références', async () => {
    // C'est l'essai que le défaut ne pouvait pas passer. Le greffon normalisait
    // déjà ; `serveur.ts` non. Comparer les deux chemins — plutôt que de
    // vérifier chacun contre une phrase écrite dans le banc — fait apparaître
    // la divergence quel que soit le texte choisi de part et d'autre.
    const surGreffon = await brute('POST', ROUTE_GREFFON, JSON_ENTETES, '{"a":');
    const surInconnue = await brute('POST', ROUTE_INCONNUE, JSON_ENTETES, '{"a":');

    assert.equal(
      surInconnue.statut,
      surGreffon.statut,
      'Le même refus rend deux statuts selon la route touchée : il y a deux normalisations.',
    );
    assert.equal(
      surInconnue.corps?.erreur,
      surGreffon.corps?.erreur,
      `Deux codes pour un même refus : greffon « ${String(surGreffon.corps?.erreur)} », ` +
        `route inconnue « ${String(surInconnue.corps?.erreur)} ». C'est le constat Q-55.`,
    );
    assert.equal(
      surInconnue.corps?.message,
      surGreffon.corps?.message,
      `Deux messages pour un même refus : « ${String(surInconnue.corps?.message)} » contre ` +
        `« ${String(surGreffon.corps?.message)} ».`,
    );

    // ── Et l'autre moitié : le partage du texte n'est pas le partage du jeton ──
    // Deux réponses identiques mot pour mot doivent rester DEUX incidents, sans
    // quoi la référence ne désigne plus une requête (constat Q-39).
    assert.match(String(surGreffon.corps?.reference ?? ''), /^REQ-/);
    assert.match(String(surInconnue.corps?.reference ?? ''), /^REQ-/);
    assert.notEqual(
      surInconnue.corps?.reference,
      surGreffon.corps?.reference,
      'Deux requêtes distinctes doivent porter deux références : mutualiser le message ' +
        'ne doit pas avoir mutualisé le jeton donné au support.',
    );
  });
});

/* =====================================================================
 *  §4 — Contrôle symétrique
 * ===================================================================== */

describe('Normaliser n’est pas aplatir (contrôle symétrique)', () => {
  test('UN CONFLIT DE VERSION garde son statut, son code GRC03 et sa version', async () => {
    // ── La moitié sans laquelle le remède serait une régression ──────────────
    //
    // « Aucune réponse ne raconte le cadre » serait satisfait par un serveur
    // qui rendrait « une erreur est survenue » à tout le monde. Or `js/core/
    // sync.js` se branche sur `code_grc: GRC03` pour bloquer un enregistrement
    // et proposer le rechargement : un aplatissement ferait disparaître ce
    // signal sans qu'aucun essai de fuite ne s'en aperçoive.
    const avant = await brute('GET', '/api/donnees');
    const version = avant.corps.data.risques.find((r) => r.id === 'RISK-A')._version;

    const premiere = await brute('PUT', '/api/entites/risques/RISK-A', JSON_ENTETES,
      JSON.stringify({ version, champs: { nom: 'Écriture qui gagne la course' } }));
    assert.equal(premiere.statut, 200, `L’écriture de référence doit passer : ${premiere.texte.slice(0, 200)}`);

    const perimee = await brute('PUT', '/api/entites/risques/RISK-A', JSON_ENTETES,
      JSON.stringify({ version, champs: { nom: 'Écriture périmée' } }));

    assert.equal(perimee.statut, 409, 'Un conflit de version reste un 409.');
    assert.equal(perimee.corps?.erreur, 'conflit_version');
    assert.equal(
      perimee.corps?.code_grc,
      'GRC03',
      'Le code du §15 est le contrat sur lequel l’interface s’appuie : il ne se normalise pas.',
    );
    assert.equal(
      perimee.corps?.version_actuelle,
      version + 1,
      'La version réelle épargne un aller-retour au rechargement : elle doit survivre.',
    );
    assert.match(String(perimee.corps?.reference ?? ''), /^REQ-/);

    // Le message reste français et actionnable — pas le texte du cadre.
    exigerAucuneFuite(perimee, 'Un conflit de version');
    assert.ok(
      String(perimee.corps?.message ?? '').length > 20,
      'Un refus que l’utilisateur peut corriger doit lui dire quoi faire.',
    );
    assert.notEqual(
      perimee.corps?.message,
      normalisationDe(400, 'FST_ERR_CTP_INVALID_JSON_BODY').message,
      'Le message générique du cadre a mangé celui du conflit : normaliser les fuites ne doit ' +
        'pas revenir à ne plus rien dire à personne.',
    );
  });
});

/* =====================================================================
 *  §5 — La référence, sur chaque sortie d'erreur
 * ===================================================================== */

describe('Toute réponse d’erreur porte une référence d’incident', () => {
  test('LES QUATRE PORTES DE SORTIE, interrogées une par une', async () => {
    // Q-39 avait fermé le fait que la référence soit CHOISIE par le client ; il
    // restait qu'elle était simplement ABSENTE partout où le greffon ne passe
    // pas. Cet essai couvre les sorties connues ; celui qui suit va chercher
    // celles qu'on aurait ajoutées sans le dire.
    const sondes = [
      ['greffon — validation refusée', 'GET', '/api/rafraichir?depuis=pas-un-horodatage', {}, undefined],
      ['404 — route inconnue', 'GET', '/api/rien-du-tout', {}, undefined],
      ['404 — méthode non prévue', 'DELETE', '/api/sante', {}, undefined],
      ['avant routage — URL malformée', 'GET', '/api/%zz', {}, undefined],
      ['cadre — corps illisible sur une route inconnue', 'POST', ROUTE_INCONNUE, JSON_ENTETES, '{"a":'],
      ['cadre — type de contenu refusé', 'POST', ROUTE_GREFFON, { 'content-type': 'text/troll' }, 'x'],
    ];

    for (const [nom, methode, chemin, entetes, corps] of sondes) {
      const vue = await brute(methode, chemin, entetes, corps);
      assert.ok(vue.statut >= 400, `${nom} devait échouer (reçu ${String(vue.statut)}).`);
      assert.match(
        String(vue.corps?.reference ?? ''),
        /^REQ-/,
        `${nom} : la réponse ne porte aucune référence d’incident. Le jeton qu’on donne au ` +
          `support n’existe pas sur ce chemin. Reçu : ${vue.texte.slice(0, 200)}`,
      );
      exigerAucuneFuite(vue, nom);
    }
  });

  test('AUCUNE SORTIE D’ERREUR N’EST ÉCRITE SANS ELLE — découvert dans la source', async () => {
    // ── Pourquoi ce contrôle statique double le précédent ────────────────────
    //
    // La liste de sondes ci-dessus est une liste : une porte ajoutée demain n'y
    // serait pas, et son absence de référence passerait inaperçue. Celui-ci ne
    // liste rien — il PARCOURT `src/` et exige que tout corps d'erreur envoyé
    // sur le réseau (reconnu à sa clé `erreur:` ou à `corps()`, la forme unique
    // de `ErreurApplicative`) porte `reference`. Un cinquième point de sortie
    // écrit sans elle rougit ici, où qu'il soit.
    const fichiers = [];
    const parcourir = (dossier) => {
      for (const entree of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, entree.name);
        if (entree.isDirectory()) parcourir(chemin);
        else if (entree.name.endsWith('.ts')) fichiers.push(chemin);
      }
    };
    parcourir(RACINE_SRC);

    // Le parcours doit voir TOUT le code du serveur, et pas seulement ce qu'il
    // se trouve rencontrer. On le confronte à ce que la COMPILATION produit :
    // `dist/` est engendré par `tsc` à partir de ce même `src/`, donc les deux
    // ensembles se correspondent un pour un. Un parcours qui s'arrêterait à
    // mi-chemin — un sous-dossier oublié, un lien symbolique non suivi —
    // rougit ici, sans qu'aucun nombre soit écrit à la main.
    const compiles = [];
    const parcourirDist = (dossier) => {
      for (const entree of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, entree.name);
        if (entree.isDirectory()) parcourirDist(chemin);
        else if (entree.name.endsWith('.js')) compiles.push(chemin);
      }
    };
    parcourirDist(join(RACINE_BACKEND, 'dist'));
    assert.equal(
      fichiers.length,
      compiles.length,
      `Le parcours de « src/ » a trouvé ${String(fichiers.length)} fichiers là où la ` +
        `compilation en produit ${String(compiles.length)}. Deux lectures possibles, et ` +
        'aucune n’est anodine : le parcours ne voit plus tout le code, ou bien `dist/` ' +
        'garde un fichier dont la source a disparu — auquel cas le serveur mis à l’épreuve ' +
        'n’est plus tout à fait celui du dépôt (`npm run nettoyer` puis rejouer).',
    );

    const sansCommentaires = (texte) =>
      texte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    /**
     * Les arguments de chaque `.send(` d'un fichier.
     *
     * ── Pourquoi un compteur de parenthèses et pas un motif ────────────────
     *
     * Une première version bornait l'argument à 400 signes. Le contrôle de
     * cohérence qui suit l'a prise en défaut sur-le-champ : `src/api/index.ts`
     * contient dix envois, dont **deux** que cette borne ne voyait pas — leur
     * corps est plus long. Deux envois invisibles, c'est deux envois que ce
     * contrôle n'aurait jamais jugés, en restant vert. On lit donc l'argument
     * jusqu'à sa parenthèse fermante, sans nombre magique.
     */
    const argumentsEnvoyes = (source) => {
      const trouves = [];
      let inexploitables = 0;
      for (let i = source.indexOf('.send('); i !== -1; i = source.indexOf('.send(', i + 1)) {
        let profondeur = 0;
        let fin = -1;
        for (let j = i + '.send'.length; j < source.length; j += 1) {
          const c = source[j];
          if (c === '(') profondeur += 1;
          else if (c === ')') {
            profondeur -= 1;
            if (profondeur === 0) { fin = j; break; }
          }
        }
        if (fin === -1) inexploitables += 1;
        else trouves.push(source.slice(i + '.send('.length, fin));
      }
      return { trouves, inexploitables };
    };

    let envoisExamines = 0;
    for (const chemin of fichiers) {
      const source = sansCommentaires(readFileSync(chemin, 'utf8'));
      const { trouves, inexploitables } = argumentsEnvoyes(source);

      // Ce que le lecteur n'a pas su lire, il le DIT. Un envoi illisible n'est
      // pas un envoi conforme : c'est un envoi non jugé, et le laisser passer
      // en silence est précisément la faute que ce fichier traque ailleurs.
      assert.equal(
        inexploitables,
        0,
        `${chemin} contient ${String(inexploitables)} envoi(s) dont ce contrôle n'a pas su ` +
          'lire l’argument : ce qu’il ne voit pas, il ne le juge pas.',
      );

      for (const argument of trouves) {
        const estCorpsDErreur = /\berreur\s*:/.test(argument) || /\bcorps\(\)/.test(argument);
        if (!estCorpsDErreur) continue;
        envoisExamines += 1;
        assert.match(
          argument,
          /\breference\b/,
          `${chemin} envoie un corps d’erreur sans « reference ». Un utilisateur arrivé par ` +
            `ce chemin n’a rien à donner au support, et le journal n’a rien à quoi relier sa ` +
            `réponse. Vu : ${argument.replace(/\s+/g, ' ').slice(0, 200)}`,
        );
      }
    }
    assert.ok(
      envoisExamines >= 4,
      `Seuls ${String(envoisExamines)} envois d’erreur ont été examinés : le motif ne trouve ` +
        'plus les points de sortie, donc ce contrôle ne contrôle plus rien.',
    );
  });
});

/* =====================================================================
 *  §6 — Ce que la réponse REFLÈTE de la requête
 * ===================================================================== */

describe('Le 404 ne renvoie pas sans borne ce qu’on lui a envoyé', () => {
  test('UNE URL DÉMESURÉE est citée tronquée, pas recopiée', async () => {
    // Constat connexe, trouvé en mesurant Q-55 : le gestionnaire 404 réfléchit
    // l'URL reçue. Avant la borne, une requête de 4 005 signes rendait 4 083
    // signes. L'amplification est faible et le corps est du JSON — mais renvoyer
    // sans limite ce qu'on reçoit n'a aucune contrepartie, et un correctif sans
    // essai est ce que ce chantier a payé le plus cher.
    const courte = await brute('GET', '/api/inconnue-courte');
    const longue = await brute('GET', `/api/${'a'.repeat(4000)}`);

    assert.equal(longue.statut, 404);
    assert.ok(
      longue.texte.length < courte.texte.length + 400,
      `Le corps du 404 grandit avec l’URL reçue : ${String(courte.texte.length)} signes pour ` +
        `une URL courte, ${String(longue.texte.length)} pour une URL de 4 000. La citation ` +
        'doit être bornée.',
    );
    assert.match(String(longue.corps?.reference ?? ''), /^REQ-/);
  });
});
