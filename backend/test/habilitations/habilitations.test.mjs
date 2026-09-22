/**
 * habilitations.test.mjs — **l'administration des droits, mesurée par la ROUTE.**
 *
 * ── Pourquoi tout est joué en HTTP, et pas fonction par fonction ─────────────
 *
 * C'est la leçon du constat **Q-325**, puis de son sosie au lot L22 : *dix-huit
 * essais mesuraient les jetons d'API et aucun n'a vu qu'un jeton émis rendait
 * 401 à son premier usage — tous appelaient la fonction sous un périmètre déjà
 * posé.* Le banc mesurait la fonction ; personne ne mesurait ce que l'appelant
 * reçoit. Ici la question est la même : un écran d'administration peut être
 * juste dans ses fonctions et refusé par le contrôle d'accès de la route, et
 * c'est alors le produit qui est cassé, pas la fonction.
 *
 * ── Les quatre propriétés qui ne doivent jamais se perdre ────────────────────
 *
 *  1. **Le verrou d'administrabilité.** Aucune écriture ne laisse le produit
 *     sans administrateur possible. ⚠️ Éprouvé par la PROPRIÉTÉ (« il ne reste
 *     plus personne pour administrer »), jamais par les deux noms qui la portent
 *     aujourd'hui — motif des constats Q-312 et Q-313.
 *  2. **La grille se REMPLACE**, elle ne fusionne pas : un domaine retiré doit
 *     disparaître, et ne pas se confondre avec un domaine omis (motif Q-66).
 *  3. **Le niveau `aucun` survit** : il ferme explicitement un domaine, ce qui
 *     se relit en revue de droits là où une absence ne se relit pas.
 *  4. **Rien n'est recalculé** : la simulation rend ce que `resoudreDroits()`
 *     rend, c'est-à-dire ce que la connexion appliquerait.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

let base;
let applicatif;
/** Monté avec l'administration Groupe : c'est le périmètre d'un administrateur. */
let admin;
/** Monté SANS administration Groupe : le témoin négatif. */
let simpleUtilisateur;

const PERIMETRE_ADMIN = {
  utilisateurId: 'essai-admin',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: true,
};

const PERIMETRE_SIMPLE = {
  utilisateurId: 'essai-contrib',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
};

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  admin = await monterGreffon(base, PERIMETRE_ADMIN);
  // ⚠️ **Droits bridés, et c'est indispensable** : le montage ordinaire passe par
  // l'authentification provisoire, qui rend des droits COMPLETS. Un témoin
  // négatif monté ainsi serait creux — il mesurerait le banc et non le produit
  // (motif du constat Q-210).
  simpleUtilisateur = await monterGreffon(base, PERIMETRE_SIMPLE, {
    authentificateur: {
      provisoire: true,
      async authentifier() {
        return {
          perimetre: PERIMETRE_SIMPLE,
          droits: Object.freeze({
            niveau: 'contribution',
            domaines: Object.freeze(['risques', 'actions']),
            niveaux: Object.freeze({ risques: 'contribution', actions: 'contribution' }),
            export: false,
          }),
        };
      },
      decrire: () => 'contributeur bridé par le banc',
    },
  });
});

/**
 * ⚠️ **LE BANC PART D'UNE BASE SANS AUCUN GROUPE D'ANNUAIRE**, c'est-à-dire
 * exactement l'état d'une installation neuve avant que l'installateur ne sème
 * les groupes. C'est cet état qui a révélé le piège de la première rédaction du
 * verrou : il refusait TOUTE écriture tant que l'administrabilité était absente,
 * donc y compris la déclaration du groupe d'administration qui l'aurait
 * rétablie. Le §0 le mesure AVANT de l'amorcer ; le §3 mesure le verrou une fois
 * la propriété acquise.
 */
describe('§0 — l’amorçage, quand rien n’existe encore', () => {
  test('sur une base sans groupe d’annuaire, l’écriture reste POSSIBLE', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    assert.equal(
      etat.corps.groupes.filter((g) => g.actif && g.accordeAdmin).length,
      0,
      'contrôle de matière : le banc doit bien partir d’une base non administrable',
    );

    const { statut } = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: { code: 'AMORCAGE', nom: 'Profil d’amorçage' },
    });
    assert.equal(
      statut,
      201,
      'un verrou qui refuse pendant que la propriété est ABSENTE interdit le geste ' +
        'même qui la rétablirait',
    );
  });

  test('puis la synchronisation déclare les groupes, dont celui d’administration', async () => {
    const { statut, corps } = await admin.appeler(
      'POST',
      '/api/habilitations/groupes/synchroniser',
    );
    assert.equal(statut, 200);
    assert.ok(corps.crees.length > 0, `groupes créés : ${corps.crees.length}`);

    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const administrateurs = etat.corps.groupes.filter((g) => g.actif && g.accordeAdmin);
    assert.equal(administrateurs.length, 1, 'un seul groupe transversal d’administration');
    assert.equal(administrateurs[0].nom, `${etat.corps.prefixeGroupes}ADMIN`);
  });
});

after(async () => {
  await admin?.fermer();
  await simpleUtilisateur?.fermer();
  await applicatif?.end?.();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — L'ÉTAT : ce que l'écran reçoit
 * ===================================================================== */

describe('§1 — GET /api/habilitations/etat', () => {
  test('rend les trente domaines, les cinq niveaux et les profils de socle', async () => {
    const { statut, corps } = await admin.appeler('GET', '/api/habilitations/etat');
    assert.equal(statut, 200);

    assert.equal(corps.domaines.length, 30, 'les trente domaines fonctionnels');
    assert.deepEqual(corps.niveaux, [
      'aucun',
      'lecture',
      'contribution',
      'validation',
      'administration',
    ]);

    // ⚠️ CONTRÔLE DE MATIÈRE. Sans lui, toutes les assertions qui suivent
    // seraient vraies sur une base vide — c'est la forme creuse des constats
    // Q-108, Q-116 et Q-132.
    assert.ok(corps.profils.length >= 8, `profils semés : ${corps.profils.length}`);

    const admin7 = corps.profils.find((p) => p.code === 'ADMIN');
    assert.ok(admin7, 'le profil ADMIN du socle');
    assert.equal(admin7.socle, true);
    assert.equal(
      admin7.domaines.droits,
      'administration',
      "ADMIN porte le domaine « droits » en administration — c'est ce qui rend le produit administrable",
    );
  });

  test('chaque domaine dit sur quel domaine de décision il se projette', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/etat');
    const imports = corps.domaines.find((d) => d.code === 'imports');
    assert.equal(
      imports.domaineApi,
      null,
      '« imports » ne se projette sur RIEN — un sur-octroi silencieux a déjà été ' +
        'introduit en le rattachant à « administration »',
    );
    const journal = corps.domaines.find((d) => d.code === 'journal');
    assert.equal(journal.domaineApi, 'journal', 'le journal a son propre domaine, pas administration');
  });

  test('« aucun » est RENDU, jamais transformé en absence', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/etat');
    const qualite = corps.profils.find((p) => p.code === 'QUALITE');
    assert.ok(qualite, 'le profil QUALITE du socle');
    assert.equal(
      qualite.domaines.cartographie,
      'aucun',
      'la fermeture explicite de la cartographie doit rester LISIBLE en revue de droits',
    );
  });

  test('une session sans administration ne lit pas la matrice', async () => {
    const { statut } = await simpleUtilisateur.appeler('GET', '/api/habilitations/etat');
    assert.ok(
      statut === 403 || statut === 401,
      `une session ordinaire doit être refusée, reçu ${statut}`,
    );
  });
});

/* =====================================================================
 *  §2 — LES PROFILS
 * ===================================================================== */

describe('§2 — les profils', () => {
  let idCree = null;

  test('créer un profil propre au déploiement', async () => {
    const { statut, corps } = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: {
        code: 'RSSI_SITE',
        nom: 'RSSI de site',
        description: 'Profil ajusté pour ce déploiement.',
        niveauDefaut: 'contribution',
      },
    });
    assert.equal(statut, 201);
    assert.ok(corps.id.startsWith('PROF-'));
    idCree = corps.id;

    assert.equal(
      corps.effetDifferé,
      true,
      "l'écran doit dire que les droits ne changent qu'à la prochaine connexion",
    );
  });

  test('le profil créé n’est JAMAIS marqué « socle »', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/etat');
    const nouveau = corps.profils.find((p) => p.id === idCree);
    assert.equal(
      nouveau.socle,
      false,
      '« socle » marque ce que le PRODUIT livre : un déploiement ne peut pas s’y ajouter',
    );
  });

  test('un code hors convention est refusé en 400, pas en 500', async () => {
    const { statut, corps } = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: { code: 'rssi site', nom: 'Mauvais code' },
    });
    assert.equal(statut, 400, `reçu ${statut} — ${JSON.stringify(corps)}`);
  });

  test('un code déjà pris est refusé', async () => {
    const { statut } = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: { code: 'RSSI_SITE', nom: 'Doublon' },
    });
    assert.equal(statut, 400);
  });

  test('la grille REMPLACE : un domaine retiré disparaît', async () => {
    const pose = async (domaines) =>
      await admin.appeler('PUT', `/api/habilitations/profils/${idCree}/domaines`, {
        corps: { domaines },
      });

    let r = await pose({ actifs: 'contribution', risques: 'lecture', cartographie: 'aucun' });
    assert.equal(r.statut, 200);

    let etat = await admin.appeler('GET', '/api/habilitations/etat');
    let profil = etat.corps.profils.find((p) => p.id === idCree);
    assert.deepEqual(profil.domaines, {
      actifs: 'contribution',
      risques: 'lecture',
      cartographie: 'aucun',
    });

    // On retire « risques ». Une fusion l'aurait laissé — et l'administrateur
    // croirait l'avoir fermé.
    r = await pose({ actifs: 'contribution', cartographie: 'aucun' });
    assert.equal(r.statut, 200);
    etat = await admin.appeler('GET', '/api/habilitations/etat');
    profil = etat.corps.profils.find((p) => p.id === idCree);
    assert.equal(profil.domaines.risques, undefined, 'le domaine retiré doit AVOIR DISPARU');
    assert.equal(profil.domaines.cartographie, 'aucun', '« aucun » survit au remplacement');
  });

  test('un domaine inconnu du modèle est refusé', async () => {
    const { statut } = await admin.appeler('PUT', `/api/habilitations/profils/${idCree}/domaines`, {
      corps: { domaines: { teleportation: 'administration' } },
    });
    assert.equal(statut, 400);
  });

  test('le verrouillage optimiste mord sur une modification concurrente', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const profil = etat.corps.profils.find((p) => p.id === idCree);

    const premier = await admin.appeler('PUT', `/api/habilitations/profils/${idCree}`, {
      corps: { nom: 'RSSI de site (v2)', niveauDefaut: 'contribution', version: profil.version },
    });
    assert.equal(premier.statut, 200);

    const second = await admin.appeler('PUT', `/api/habilitations/profils/${idCree}`, {
      corps: { nom: 'RSSI de site (v3)', niveauDefaut: 'contribution', version: profil.version },
    });
    assert.equal(second.statut, 409, 'la version périmée doit rendre GRC03');
    assert.equal(second.corps.codeGrc ?? second.corps.code_grc, 'GRC03');
  });

  test('un profil de SOCLE ne se supprime pas', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const rssi = etat.corps.profils.find((p) => p.code === 'RSSI');
    const { statut, corps } = await admin.appeler(
      'DELETE',
      `/api/habilitations/profils/${rssi.id}`,
    );
    assert.equal(statut, 400);
    assert.match(String(corps.message), /livré avec le produit/i);
  });

  test('un profil encore attribué par un groupe nomme les groupes en cause', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const porteur = etat.corps.profils.find((p) => p.groupesPorteurs > 0);
    if (porteur === undefined) return; // aucun groupe semé : rien à mesurer

    // On fabrique un profil hors socle attribué à un groupe, pour éprouver le
    // refus SANS dépendre du socle.
    const cree = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: { code: 'JETABLE', nom: 'Profil jetable' },
    });
    const groupe = await admin.appeler('POST', '/api/habilitations/groupes', {
      corps: {
        nom: 'GRC-ESSAI-JETABLE',
        perimetre: 'groupe',
        profilId: cree.corps.id,
      },
    });
    assert.equal(groupe.statut, 201);

    const { statut, corps } = await admin.appeler(
      'DELETE',
      `/api/habilitations/profils/${cree.corps.id}`,
    );
    assert.equal(statut, 400);
    assert.match(String(corps.message), /GRC-ESSAI-JETABLE/);
  });

  test('un profil hors socle et non attribué se supprime', async () => {
    const cree = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: { code: 'EPHEMERE', nom: 'Éphémère' },
    });
    const { statut } = await admin.appeler(
      'DELETE',
      `/api/habilitations/profils/${cree.corps.id}`,
    );
    assert.equal(statut, 200);
  });
});

/* =====================================================================
 *  §3 — 🛑 LE VERROU D'ADMINISTRABILITÉ
 *
 *  ⚠️ **Mesuré par la PROPRIÉTÉ, pas par les noms.** Le verrou ne connaît ni
 *  « ADMIN » ni « GRC-ADMIN » : il compte combien de profils actifs portent
 *  `droits` en `administration` et combien de groupes actifs accordent
 *  l'administration. Un déploiement qui administre par `SECU_GLOBALE` et
 *  `SEC-ADMINISTRATEURS` est protégé de la même façon.
 * ===================================================================== */

describe('§3 — le verrou d’administrabilité', () => {
  test('on ne peut pas retirer le dernier profil qui administre les droits', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const administrants = etat.corps.profils.filter(
      (p) => p.actif && p.domaines.droits === 'administration',
    );
    assert.equal(
      administrants.length,
      1,
      'le socle n’en porte qu’un : c’est ce qui rend la mesure concluante',
    );

    const seul = administrants[0];
    const grille = { ...seul.domaines };
    delete grille.droits;

    const { statut, corps } = await admin.appeler(
      'PUT',
      `/api/habilitations/profils/${seul.id}/domaines`,
      { corps: { domaines: grille } },
    );
    assert.equal(statut, 409, `reçu ${statut} — ${JSON.stringify(corps)}`);
    assert.equal(corps.codeGrc ?? corps.code_grc, 'GRC08');
    assert.match(String(corps.message), /impossible à administrer/i);
  });

  test('et la transaction est ANNULÉE : la grille n’a pas bougé', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const seul = etat.corps.profils.find((p) => p.code === 'ADMIN');
    assert.equal(
      seul.domaines.droits,
      'administration',
      'le refus doit avoir tout annulé, pas seulement empêché le commit de la dernière ligne',
    );
  });

  test('on ne peut pas désactiver le dernier profil administrateur', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const seul = etat.corps.profils.find((p) => p.code === 'ADMIN');
    const { statut, corps } = await admin.appeler('PUT', `/api/habilitations/profils/${seul.id}`, {
      corps: {
        nom: seul.nom,
        description: seul.description,
        niveauDefaut: seul.niveauDefaut,
        actif: false,
        version: seul.version,
      },
    });
    assert.equal(statut, 409);
    assert.equal(corps.codeGrc ?? corps.code_grc, 'GRC08');
  });

  test('on ne peut pas désactiver le dernier groupe qui accorde l’administration', async () => {
    const etat = await admin.appeler('GET', '/api/habilitations/etat');
    const admins = etat.corps.groupes.filter((g) => g.actif && g.accordeAdmin);
    if (admins.length === 0) return; // aucun groupe d'administration semé

    // On les désactive tous sauf le dernier, puis on mesure le refus sur celui-là.
    for (const g of admins.slice(0, -1)) {
      const r = await admin.appeler('PUT', `/api/habilitations/groupes/${g.id}`, {
        corps: { actif: false, version: g.version },
      });
      assert.equal(r.statut, 200);
    }
    const dernier = admins[admins.length - 1];
    const apres = await admin.appeler('GET', '/api/habilitations/etat');
    const frais = apres.corps.groupes.find((g) => g.id === dernier.id);
    const { statut, corps } = await admin.appeler(
      'PUT',
      `/api/habilitations/groupes/${dernier.id}`,
      { corps: { actif: false, version: frais.version } },
    );
    assert.equal(statut, 409, `reçu ${statut} — ${JSON.stringify(corps)}`);
    assert.equal(corps.codeGrc ?? corps.code_grc, 'GRC08');

    // On remet ce qu'on a désactivé : un essai ne laisse pas la base dégradée
    // pour le suivant.
    for (const g of admins.slice(0, -1)) {
      const etatCourant = await admin.appeler('GET', '/api/habilitations/etat');
      const ligne = etatCourant.corps.groupes.find((x) => x.id === g.id);
      await admin.appeler('PUT', `/api/habilitations/groupes/${g.id}`, {
        corps: { actif: true, version: ligne.version },
      });
    }
  });
});

/* =====================================================================
 *  §4 — LES GROUPES D'ANNUAIRE
 * ===================================================================== */

describe('§4 — les groupes d’annuaire', () => {
  test('la cohérence des trois formes est refusée en 400, avec un message', async () => {
    const cas = [
      { nom: 'GRC-X-1', perimetre: 'filiale', profilId: null },
      { nom: 'GRC-X-2', perimetre: 'groupe', filialeId: FILIALE_A, profilId: null },
      { nom: 'GRC-X-3', perimetre: 'transversal' },
    ];
    for (const corps of cas) {
      const r = await admin.appeler('POST', '/api/habilitations/groupes', { corps });
      assert.equal(r.statut, 400, `${corps.nom} aurait dû être refusé — reçu ${r.statut}`);
      assert.ok(String(r.corps.message).length > 30, 'le refus doit EXPLIQUER, pas citer une contrainte');
    }
  });

  test('le nom est unique, insensible à la casse — comme l’annuaire', async () => {
    const un = await admin.appeler('POST', '/api/habilitations/groupes', {
      corps: { nom: 'GRC-CASSE-TEST', perimetre: 'transversal', accordeExport: true },
    });
    assert.equal(un.statut, 201);
    const deux = await admin.appeler('POST', '/api/habilitations/groupes', {
      corps: { nom: 'grc-casse-test', perimetre: 'transversal', accordeExport: true },
    });
    assert.equal(deux.statut, 400);
  });

  test('la synchronisation AJOUTE et n’efface jamais', async () => {
    const avant = await admin.appeler('GET', '/api/habilitations/etat');
    const { statut, corps } = await admin.appeler(
      'POST',
      '/api/habilitations/groupes/synchroniser',
    );
    assert.equal(statut, 200);
    assert.ok(Array.isArray(corps.crees));

    // ⚠️ Elle peut créer : les §2 ont ajouté des profils, et la liste attendue
    // est le produit cartésien filiales × profils ACTIFS. Ce qui se mesure est
    // donc l'IDEMPOTENCE — rejouée aussitôt, elle ne crée plus rien.
    const rejeu = await admin.appeler('POST', '/api/habilitations/groupes/synchroniser');
    assert.equal(rejeu.statut, 200);
    assert.equal(rejeu.corps.crees.length, 0, 'rejouée sans rien changer, elle ne crée rien');

    const apres = await admin.appeler('GET', '/api/habilitations/etat');
    assert.ok(
      apres.corps.groupes.length >= avant.corps.groupes.length,
      'une synchronisation ne retire jamais un groupe : elle le signale',
    );
    // Tous les groupes d'avant sont encore là.
    for (const g of avant.corps.groupes) {
      assert.ok(
        apres.corps.groupes.some((x) => x.id === g.id),
        `le groupe ${g.nom} a disparu — une synchronisation ne supprime pas`,
      );
    }
  });
});

/* =====================================================================
 *  §5 — LA COHÉRENCE AVEC L'ANNUAIRE
 * ===================================================================== */

describe('§5 — GET /api/habilitations/annuaire', () => {
  test('sans annuaire configuré, le verdict DIT qu’il n’a rien lu', async () => {
    const { statut, corps } = await admin.appeler('GET', '/api/habilitations/annuaire');
    assert.equal(statut, 200);
    assert.equal(
      corps.annuaireDisponible,
      false,
      'le banc monte sans LDAP : la route doit le dire au lieu de conclure',
    );
    assert.deepEqual(
      corps.declaresSansAnnuaire,
      [],
      'un verdict rendu SANS avoir lu l’annuaire serait faux dans le sens rassurant',
    );
    assert.equal(corps.comptes.reels, null, '« aucun groupe lu » n’est pas « zéro groupe »');
    assert.ok(corps.comptes.attendus > 0, 'la liste attendue, elle, se calcule sans annuaire');
  });

  test('les groupes attendus et non déclarés sont nommés', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/annuaire');
    assert.ok(Array.isArray(corps.attendusSansDeclaration));
    for (const g of corps.attendusSansDeclaration) {
      assert.ok(g.nom.startsWith(corps.prefixe), `${g.nom} doit porter le préfixe`);
    }
  });
});

/* =====================================================================
 *  §6 — LA SIMULATION
 * ===================================================================== */

describe('§6 — POST /api/habilitations/simuler', () => {
  test('sans annuaire, elle refuse en 503 et DIT pourquoi', async () => {
    const { statut, corps } = await admin.appeler('POST', '/api/habilitations/simuler', {
      corps: { identifiant: 'rssi.tls' },
    });
    assert.equal(statut, 503);
    assert.match(String(corps.message), /annuaire/i);
  });

  test('un identifiant vide est refusé en 400', async () => {
    const { statut } = await admin.appeler('POST', '/api/habilitations/simuler', {
      corps: { identifiant: '   ' },
    });
    assert.equal(statut, 400);
  });

  test('une session ordinaire ne peut pas simuler', async () => {
    const { statut } = await simpleUtilisateur.appeler('POST', '/api/habilitations/simuler', {
      corps: { identifiant: 'rssi.tls' },
    });
    assert.ok(statut === 403 || statut === 401, `reçu ${statut}`);
  });
});

/* =====================================================================
 *  §7 — LA TRACE
 * ===================================================================== */

describe('§7 — le journal d’audit', () => {
  test('chaque écriture laisse une entrée « administration » nommant l’objet', async () => {
    const cree = await admin.appeler('POST', '/api/habilitations/profils', {
      corps: { code: 'TRACE_TEST', nom: 'Profil tracé' },
    });
    assert.equal(cree.statut, 201);

    /* ⚠️ **La relecture passe par un PÉRIMÈTRE.** `journal_audit` est cloisonné
     * et `force row level security` vaut jusqu'au propriétaire : une requête
     * sans périmètre rend zéro ligne — c'est-à-dire exactement ce que rendrait
     * un produit qui ne journalise pas. La première rédaction de cet essai
     * tombait dans ce piège, et aurait échoué de la même façon sur un serveur
     * parfaitement correct. */
    const rows = await base.avecPerimetre(
      applicatif,
      perimetre('lecteur-journal', FILIALE_A, [FILIALE_A]),
      async (client) => {
        const r = await client.query(
          `select action, resume, entite_type, entite_id, valeurs_apres
             from journal_audit
            where entite_type = 'profils' and entite_id = $1
            order by numero desc limit 1`,
          [cree.corps.id],
        );
        return r.rows;
      },
    );
    assert.equal(rows.length, 1, 'la création d’un profil doit être journalisée');
    assert.equal(rows[0].action, 'administration');
    assert.match(rows[0].resume, /TRACE_TEST/);
    assert.equal(rows[0].valeurs_apres.code, 'TRACE_TEST');
  });
});
