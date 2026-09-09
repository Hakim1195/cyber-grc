/**
 * profil-installation.test.mjs — ce que la machine DIT d'elle-même : lot L18.2 b.
 *
 * ── Le défaut que ce fichier garde ──────────────────────────────────────────
 *
 * `install.sh --assistant` pose `CYBER_GRC_PROFIL=decouverte` quand l'exploitant
 * répond « aucun annuaire » : ni AD, ni relais de messagerie, un certificat
 * auto-signé, un compte de secours pour toute porte d'entrée. Le profil
 * s'annonçait dans la configuration et au `--diagnostic` — **deux endroits que
 * seul l'exploitant regarde**. L'utilisateur qui saisit ne voyait rien, alors
 * que c'est lui qui décide de taper une donnée réelle dans un outil produit en
 * audit. Le `PLAN_PRODUIT` L18.2 le dit sans détour : *« un profil dégradé qu'on
 * ne voit pas devient une production par oubli »*.
 *
 * ── LES TROIS PROPRIÉTÉS, ET CE QUI ARRIVE SI L'UNE TOMBE ───────────────────
 *
 *  §1  **Une valeur inconnue REFUSE le démarrage.** C'est le point le plus
 *      important du fichier, et le moins évident. La pente naturelle serait de
 *      retomber sur « production » — et une faute de frappe (`decouvert`,
 *      `Découverte`) éteindrait alors le bandeau **en silence**, c'est-à-dire
 *      produirait le défaut exact que ce profil existe pour empêcher, par le
 *      chemin le plus discret qui soit. Le `CLAUDE.md` §3 nomme la règle : une
 *      liste — ici une table de valeurs — n'est le bon outil que si son
 *      incomplétude **échoue bruyamment**.
 *
 *  §2  **Une valeur ABSENTE vaut « production ».** Toutes les installations
 *      posées avant le lot L18 n'ont pas cette variable, et aucune n'est une
 *      installation de découverte. Sans cette moitié, la mise à jour d'un parc
 *      existant ferait apparaître le bandeau partout — et un bandeau qui crie
 *      à tort apprend à ne plus le lire, y compris le jour où il dit vrai.
 *
 *  §3  **Le profil arrive au NAVIGATEUR**, dans la charte de session. Il ne
 *      suffit pas qu'il soit lu : il faut qu'il traverse. Le champ voyage dans
 *      `charteSession`, donc `POST /api/connexion` le porte aussi — le
 *      `CONVENTIONS.md` §26.2 exige les deux charges identiques à l'octet près,
 *      et `test/auth/chaine-http.test.mjs` le mesure. Ajouter le champ dans la
 *      route seule aurait rouvert le constat **Q-85** ; il est donc ajouté là
 *      où les deux le reçoivent par construction, et cet essai vérifie qu'il
 *      arrive bien jusqu'au bout.
 *
 * ⚠️ **Ce que cet essai NE prouve PAS** : que le bandeau s'affiche. Cela se
 * mesure dans un navigateur, sur le DOM rendu — `test/navigateur/profil-
 * decouverte.test.mjs`. Deux moitiés, deux fichiers, et c'est délibéré : le
 * constat **Q-194** rappelle qu'un défaut peut vivre *entre* deux surfaces dont
 * aucune n'a tort seule.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let chargerConfiguration;
let ErreurConfiguration;

/** Deux serveurs, qui ne diffèrent QUE par la variable éprouvée. */
let enProduction;
let enDecouverte;

const PERIMETRE = Object.freeze({
  utilisateurId: 'rssi-tls',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
});

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  ({ chargerConfiguration, ErreurConfiguration } = await moduleCompile('config/index.js'));
  enProduction = await monterGreffon(base, PERIMETRE);
  enDecouverte = await monterGreffon(base, PERIMETRE, { env: { CYBER_GRC_PROFIL: 'decouverte' } });
});

after(async () => {
  await enProduction?.fermer();
  await enDecouverte?.fermer();
  await base?.fermer();
});

/**
 * Le minimum que `chargerConfiguration` accepte, plus ce que l'essai éprouve.
 *
 * Écrit ici plutôt qu'emprunté à `test/aide/serveur.mjs` : cette famille éprouve
 * la LECTURE de l'environnement, et emprunter l'environnement du banc reviendrait
 * à mesurer l'aide au lieu du produit.
 */
function environnement(supplement = {}) {
  return {
    NODE_ENV: 'production',
    SERVEUR_PORT: '3999',
    SERVEUR_URL_PUBLIQUE: 'https://grc.exemple.interne',
    BASE_HOTE: '127.0.0.1',
    BASE_PORT: '5432',
    BASE_NOM: 'inutilisee',
    BASE_UTILISATEUR: 'grc_app',
    BASE_MOT_DE_PASSE: 'sans-valeur-pour-cet-essai',
    BASE_SSL: 'desactive',
    SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
    // ⚠️ **Un annuaire est déclaré, et ce n'est pas un détail de confort.**
    // La première rédaction posait `AUTH_LDAP_ACTIF=non` sans compte de secours :
    // la configuration était alors invalide **pour une autre raison**, et le §1
    // passait au vert en attrapant une erreur qui ne parlait pas du profil. Un
    // essai qui mesure autre chose que ce qu'il annonce rend le même verdict
    // qu'un essai qui mesure — c'est le constat **Q-210**, et il a été rejoué
    // ici en écrivant ce fichier. Le §0 ci-dessous garde la réparation.
    AUTH_LDAP_ACTIF: 'oui',
    LDAP_URL: 'ldaps://annuaire.invalide.test:636',
    LDAP_DN_SERVICE: 'CN=inutilise,DC=invalide,DC=test',
    LDAP_MOT_DE_PASSE_SERVICE: 'inutilise-pour-cet-essai',
    LDAP_BASE_RECHERCHE: 'DC=invalide,DC=test',
    SERVEUR_NIVEAU_JOURNAL: 'silent',
    ...supplement,
  };
}

/* =====================================================================
 *  §0 — L'environnement de base est VALIDE
 * =====================================================================
 *
 * ⚠️ **C'est la garde du §1, et sans elle le §1 ne vaut rien.** Tout le §1
 * repose sur « le chargement échoue » ; encore faut-il qu'il échoue *à cause du
 * profil*. Si une variable requise vient à manquer dans `environnement()` — un
 * réglage rendu obligatoire par un lot futur, par exemple —, le §1 continuerait
 * de passer au vert en attrapant une erreur qui n'a rien à voir. Ce test-ci
 * rougit alors le premier, et il nomme la cause.
 * ===================================================================== */

describe("§0 — la garde : l'environnement de base charge sans erreur", () => {
  test('sans CYBER_GRC_PROFIL, cet environnement est accepté', () => {
    // Si ceci rougit, le §1 ne mesure PLUS le profil : réparez d'abord ici.
    assert.doesNotThrow(() => chargerConfiguration(environnement()));
  });
});

/* =====================================================================
 *  §1 — Une valeur inconnue REFUSE le démarrage
 * ===================================================================== */

describe('§1 — profil inconnu : le serveur refuse de démarrer', () => {
  test('une faute de frappe ne vaut PAS « production »', () => {
    // Chacune de ces valeurs est une faute plausible, et chacune éteindrait le
    // bandeau si elle retombait silencieusement sur « production ».
    // ⚠️ `DECOUVERTE` n'est PAS dans cette liste, et c'est mesuré : la lecture
    // met la valeur en minuscules, donc les capitales désignent bien le même
    // profil. La casse est une variante d'écriture, pas une faute — le §2 le
    // vérifie dans l'autre sens. Ce qui est refusé, c'est ce qui ne DÉSIGNE pas
    // un profil connu : un accent, un mot voisin, une autre langue, un « oui ».
    for (const faute of ['decouvert', 'Découverte', 'discovery', 'oui', 'demo', 'test']) {
      assert.throws(
        () => chargerConfiguration(environnement({ CYBER_GRC_PROFIL: faute })),
        ErreurConfiguration,
        `« ${faute} » aurait dû faire échouer le chargement`,
      );
    }
  });

  test('le refus NOMME la variable et les valeurs attendues', () => {
    try {
      chargerConfiguration(environnement({ CYBER_GRC_PROFIL: 'decouvert' }));
      assert.fail('le chargement aurait dû échouer');
    } catch (erreur) {
      const texte = String(erreur.message);
      // Un exploitant lit ce message sur une machine qui ne démarre pas : il
      // doit pouvoir corriger sans ouvrir le code.
      assert.match(texte, /CYBER_GRC_PROFIL/);
      assert.match(texte, /production/);
      assert.match(texte, /decouverte/);
      // Et il ne doit y avoir qu'UN problème : le profil. Sans cette ligne, un
      // environnement devenu invalide pour une autre raison satisferait encore
      // les trois `match` ci-dessus — c'est ainsi que la première rédaction de
      // ce fichier passait au vert (Q-210).
      assert.equal(erreur.problemes.length, 1, `un seul problème attendu : ${texte}`);
    }
  });
});

/* =====================================================================
 *  §2 — Absente, la variable vaut « production »
 * ===================================================================== */

describe('§2 — la valeur par défaut', () => {
  test('variable absente ⇒ production, sans avertissement', () => {
    const config = chargerConfiguration(environnement());
    assert.equal(config.profil, 'production');
    assert.equal(
      config.avertissements.some((a) => /CYBER_GRC_PROFIL/.test(a)),
      false,
      "une installation ordinaire ne doit pas s'entendre reprocher un profil",
    );
  });

  test('variable vide ⇒ production : install.sh écrit parfois une ligne vide', () => {
    assert.equal(chargerConfiguration(environnement({ CYBER_GRC_PROFIL: '' })).profil, 'production');
    assert.equal(
      chargerConfiguration(environnement({ CYBER_GRC_PROFIL: '   ' })).profil,
      'production',
    );
  });

  test('« decouverte » est lu, et il AVERTIT au démarrage', () => {
    const config = chargerConfiguration(environnement({ CYBER_GRC_PROFIL: 'decouverte' }));
    assert.equal(config.profil, 'decouverte');
    // L'avertissement part au journal à chaque démarrage : une machine ainsi
    // posée le dit d'elle-même, sans qu'on ait à l'interroger.
    assert.equal(
      config.avertissements.some((a) => /CYBER_GRC_PROFIL/.test(a)),
      true,
    );
  });

  test('la casse et les espaces sont tolérés : « Production », «  decouverte  »', () => {
    assert.equal(
      chargerConfiguration(environnement({ CYBER_GRC_PROFIL: 'Production' })).profil,
      'production',
    );
    assert.equal(
      chargerConfiguration(environnement({ CYBER_GRC_PROFIL: '  decouverte  ' })).profil,
      'decouverte',
    );
  });

  test('le résumé journalisé porte le profil, et aucun secret', async () => {
    const { resumerConfiguration } = await moduleCompile('config/index.js');
    const resume = resumerConfiguration(
      chargerConfiguration(environnement({ CYBER_GRC_PROFIL: 'decouverte' })),
    );
    assert.equal(resume.profil, 'decouverte');
    assert.equal(
      JSON.stringify(resume).includes('secret-de-banc-d-essai'),
      false,
      'le résumé ne doit porter aucun secret',
    );
  });
});

/* =====================================================================
 *  §3 — Le profil traverse jusqu'au navigateur
 * ===================================================================== */

describe('§3 — la charte de session le porte', () => {
  test('installation de découverte : /api/session le dit', async () => {
    const reponse = await enDecouverte.appeler('GET', '/api/session');
    assert.equal(reponse.statut, 200);
    assert.equal(reponse.corps.installation.profil, 'decouverte');
  });

  test('installation ordinaire : le champ est là, et vaut « production »', async () => {
    const reponse = await enProduction.appeler('GET', '/api/session');
    assert.equal(reponse.statut, 200);
    // ⚠️ Le champ est TOUJOURS présent, et jamais omis quand il vaut
    // « production ». Un champ absent laisserait le navigateur deviner, et
    // « je n'en sais rien » finirait par s'afficher comme « découverte » ou
    // l'inverse selon qui écrit le code.
    assert.equal(reponse.corps.installation.profil, 'production');
  });

  test('la charte ne divulgue rien de plus sur le profil', async () => {
    const reponse = await enDecouverte.appeler('GET', '/api/session');
    // Le profil dit ce qui MANQUE à l'installation, jamais comment y entrer :
    // pas d'identifiant de compte de secours, pas de chemin de configuration.
    assert.deepEqual(Object.keys(reponse.corps.installation), ['profil']);
  });
});
