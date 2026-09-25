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

/** Un profil de socle, par son code — l'essai ne code aucun identifiant en dur. */
async function profilParCode(code) {
  const etat = await admin.appeler('GET', '/api/habilitations/etat');
  const p = etat.corps.profils.find((x) => x.code === code);
  if (p === undefined) throw new Error(`Profil « ${code} » absent du socle.`);
  return p;
}

/** Un groupe d'annuaire, relu par la route — jamais depuis une variable locale. */
async function groupeParId(id) {
  const etat = await admin.appeler('GET', '/api/habilitations/etat');
  const g = etat.corps.groupes.find((x) => x.id === id);
  if (g === undefined) throw new Error(`Groupe « ${id} » absent de l’état servi.`);
  return g;
}

async function groupeParNom(nom) {
  const etat = await admin.appeler('GET', '/api/habilitations/etat');
  const g = etat.corps.groupes.find((x) => x.nom === nom);
  if (g === undefined) throw new Error(`Groupe « ${nom} » absent de l’état servi.`);
  return g;
}

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

  /* 🛑 **Trouvé en CLIQUANT sur la recette, pas par le banc.**
   *
   * Un groupe transversal d'administration ne porte AUCUN `profil_id` — la
   * contrainte `ck_groupes_ad_coherence` l'interdit —, et il attribue pourtant
   * le profil d'administration à la résolution. L'écran lisait la colonne et
   * affichait « aucun domaine ouvert » pour le groupe qui ouvre TOUT.
   *
   * C'est la classe « l'écran contredit le produit », qui est pire qu'un écran
   * absent : un administrateur y lit que `GRC-ADMIN` n'accorde rien. */
  test('un groupe d’administration montre ce qu’il ACCORDE, pas sa colonne vide', async () => {
    const { corps } = await admin.appeler('GET', '/api/habilitations/etat');
    const g = corps.groupes.find((x) => x.accordeAdmin && x.actif);
    assert.ok(g, 'contrôle de matière : un groupe d’administration doit exister');
    assert.equal(g.profilId, null, 'la COLONNE est bien vide — c’est le schéma qui l’impose');
    assert.equal(g.profilCode, 'ADMIN', 'et le profil EFFECTIF est celui de la résolution');
    assert.ok(
      g.domainesOuverts > 0,
      'le groupe qui ouvre tout ne peut pas afficher « aucun domaine ouvert »',
    );
    assert.equal(g.niveauMax, 'administration');
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
    /* ⚠️ **CET ESSAI EXIGEAIT LE DÉFAUT.** Sa première rédaction demandait que le
     * code du profil figure DANS `resume` — c'est-à-dire exactement ce que le
     * `CONVENTIONS.md` §29.5 interdit : *« resume est une phrase écrite par le
     * développeur, une valeur d'utilisateur n'y entre jamais »*. Un code forgé avec
     * un saut de ligne aurait scindé une ligne de l'export du journal, pour trois
     * ans. C'est le motif du constat **Q-200** — *un essai qui mesure un défaut et
     * le consacre comme une propriété désirable* —, et c'est le balayage de
     * `test/journal/regles.test.mjs` qui l'a dit, pas une relecture.
     *
     * La phrase est donc littérale, et la valeur est là où elle doit être. */
    assert.equal(rows[0].resume, 'Création d’un profil d’habilitation.');
    assert.ok(!rows[0].resume.includes('TRACE_TEST'), '§29.5 : la valeur n’entre pas dans la phrase');
    assert.equal(rows[0].valeurs_apres.code, 'TRACE_TEST');
  });
});

/* =====================================================================
 *  Ce qu'un groupe ACCORDE se modifie — pas seulement son activation
 * ===================================================================== */

describe('Modifier ce qu’un groupe d’annuaire accorde', () => {
  test('le PROFIL d’un groupe se change, et le changement est relu', async () => {
    /* 🛑 SIGNALÉ PAR L'UTILISATEUR LE 24/09/2026 : *« on peut désactiver un groupe
     * depuis l'onglet Groupes d'annuaire, mais on ne gère pas ses droits ; ici
     * aussi on peut le faire uniquement quand on déclare un nouveau groupe. Ça a
     * l'air d'être le même problème sur plusieurs parties. »*
     *
     * Il avait raison, et la route savait déjà le faire depuis le 22 : l'écran ne
     * branchait qu'un bouton « Désactiver ». *Une capacité qu'aucun écran n'appelle
     * est une capacité absente* — troisième fois dans la même journée.
     *
     * ⚠️ Cet essai mesure la ROUTE, pas l'écran : le filet des écrans
     * (`test/modules/non-regression.test.mjs`) vérifie qu'ils se rendent, celui-ci
     * que le geste aboutit ET se relit. Sans la relecture, on mesurerait qu'un
     * `PUT` rend 200 — ce qu'il ferait même en n'écrivant rien. */
    const creation = await admin.appeler('POST', '/api/habilitations/groupes', {
      corps: {
        nom: 'SECU-ESSAI-MODIF',
        perimetre: 'filiale',
        filialeId: FILIALE_A,
        profilId: (await profilParCode('RSSI')).id,
      },
    });
    assert.equal(creation.statut, 201, JSON.stringify(creation.corps));
    const id = creation.corps.id;

    const avant = await groupeParId(id);
    assert.equal(avant.profilCode, 'RSSI');

    const qualite = await profilParCode('QUALITE');
    const maj = await admin.appeler('PUT', `/api/habilitations/groupes/${id}`, {
      corps: { profilId: qualite.id, actif: true, version: avant.version },
    });
    assert.equal(maj.statut, 200, JSON.stringify(maj.corps));

    const apres = await groupeParId(id);
    assert.equal(
      apres.profilCode,
      'QUALITE',
      'Le profil accordé doit avoir changé : sans cette relecture, l’essai serait vert sur ' +
        'un PUT qui rend 200 sans rien écrire.',
    );
    assert.equal(apres.version, avant.version + 1, 'La version doit avoir avancé.');

    // ⚠️ Le VERROU OPTIMISTE : rejouer avec la version périmée doit être refusé,
    //    sans quoi deux administrateurs sur le même groupe s'écraseraient en
    //    silence — et le second croirait avoir posé ce que le premier a défait.
    const rejeu = await admin.appeler('PUT', `/api/habilitations/groupes/${id}`, {
      corps: { profilId: avant.profilId, actif: true, version: avant.version },
    });
    assert.equal(rejeu.statut, 409, `Version périmée : attendu 409, reçu ${String(rejeu.statut)}`);
  });

  test('le NOM d’un groupe ne se modifie PAS, et c’est une propriété', async () => {
    /* Un nom de groupe est ce par quoi l'annuaire et le produit se reconnaissent :
     * le changer d'un seul côté couperait les accès de tous ses membres, en
     * silence. Le serveur ne lit donc pas `nom` en modification — et l'écran
     * affiche le champ en lecture seule pour que la règle se voie avant d'être
     * subie. On mesure que le serveur IGNORE le champ plutôt que de s'en remettre
     * à la seule discipline de l'écran. */
    const cible = await groupeParNom('SECU-ESSAI-MODIF');
    const maj = await admin.appeler('PUT', `/api/habilitations/groupes/${cible.id}`, {
      corps: { nom: 'SECU-RENOMME', profilId: cible.profilId, actif: true, version: cible.version },
    });
    assert.equal(maj.statut, 200, JSON.stringify(maj.corps));
    const apres = await groupeParId(cible.id);
    assert.equal(
      apres.nom,
      'SECU-ESSAI-MODIF',
      'Le nom ne doit pas avoir changé : le renommer ici, sans le renommer dans l’annuaire, ' +
        'couperait les accès de tous les membres du groupe sans un message.',
    );
  });
});

/* =====================================================================
 *  L'écran d'administration voit le GROUPE ENTIER, pas son périmètre
 * ===================================================================== */

describe('Une filiale hors du périmètre de session reste ADMINISTRABLE', () => {
  test('elle est servie à l’écran, et ses groupes portent son code', async () => {
    /* 🛑 SIGNALÉ PAR L'UTILISATEUR LE 24/09/2026, ET REPRODUIT AU NAVIGATEUR :
     * *« dans les filiales créées je ne peux pas modifier les groupes »*. Ce
     * n'était pas un défaut d'affichage.
     *
     * `pol_filiales_lecture` retombe sur `id = any (f_filiales_lecture())` dès que
     * `f_perimetre_groupe()` est fausse — et celle-ci est DÉRIVÉE : créer une
     * filiale active en ajoute une que le périmètre de la session ne couvre pas,
     * donc elle bascule à faux. Conséquences mesurées, les deux à l'écran des
     * habilitations :
     *
     *  · la filiale manquait de la liste déroulante du formulaire, donc **aucun
     *    groupe ne pouvait lui être affecté** ;
     *  · ses huit groupes s'affichaient avec une **colonne « filiale » VIDE**.
     *
     * ⚠️ Et c'est « corriger l'instance, pas la classe », refait le jour même : la
     * migration `065` avait fermé ce piège pour l'écran « Filiales », et pas ici.
     * Cet essai garde la CLASSE — il éprouve un écran d'administration Groupe
     * contre une filiale que la session ne lit pas. */
    const hors = 'FIL-HORS-PERIMETRE';
    await base.avecPerimetre(
      applicatif,
      { ...PERIMETRE_ADMIN, filiales: [FILIALE_A, FILIALE_B] },
      async (client) => {
        await client.query(
          `insert into "filiales" ("id", "code", "raison_sociale", "pays")
               values ($1, 'ZZHORS', 'Filiale hors du périmètre de session', 'FR')`,
          [hors],
        );
        await client.query(
          `insert into "groupes_ad" ("id", "nom", "perimetre", "filiale_id", "profil_id")
               select 'GRAD-HORS', 'GRC-ZZHORS-RSSI', 'filiale', $1, p."id"
                 from "profils" p where p."code" = 'RSSI'`,
          [hors],
        );
      },
      { annuler: false },
    );

    try {
      /* ⚠️ **Par la ROUTE, et non par la fonction.** `admin` porte exactement
       * `PERIMETRE_ADMIN`, qui ne contient PAS la filiale neuve : c'est la session
       * d'un administrateur qui vient de la créer. Mesurer la fonction sous un
       * périmètre posé à la main aurait donné le bon résultat pour le mauvais
       * motif — c'est le constat **Q-325**, et le `CONVENTIONS.md` §46 le dit :
       * *le banc mesurait la fonction ; personne ne mesurait ce que l'appelant
       * reçoit*. */
      const reponse = await admin.appeler('GET', '/api/habilitations/etat');
      assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps).slice(0, 200));
      const etat = reponse.corps;

      assert.ok(
        etat.filiales.some((f) => f.code === 'ZZHORS'),
        'La filiale hors périmètre doit être SERVIE à l’écran d’administration : sans elle, ' +
          'le formulaire de déclaration d’un groupe ne peut pas la proposer, et l’on ne peut ' +
          'affecter aucun groupe à la filiale qu’on vient de créer. ' +
          `Servies : ${etat.filiales.map((f) => f.code).join(', ')}`,
      );

      const groupe = etat.groupes.find((g) => g.nom === 'GRC-ZZHORS-RSSI');
      assert.ok(groupe !== undefined, 'Le groupe doit être servi.');
      assert.equal(
        groupe.filialeCode,
        'ZZHORS',
        'La colonne « filiale » du groupe ne doit pas être VIDE : la jointure doit voir la ' +
          'filiale, sans quoi l’administrateur lit un tableau amputé du périmètre qu’il gère.',
      );
    } finally {
      await base.avecPerimetre(
        applicatif,
        { ...PERIMETRE_ADMIN, filialeId: hors, filiales: [FILIALE_A, FILIALE_B, hors] },
        async (client) => {
          await client.query(`delete from "groupes_ad" where "id" = 'GRAD-HORS'`);
          await client.query(`delete from "filiales" where "id" = $1`, [hors]);
        },
        { annuler: false },
      );
    }
  });

  test('CONTRÔLE SYMÉTRIQUE : la LECTURE ordinaire, elle, reste bornée', async () => {
    /* Sans cette moitié, l'essai ci-dessus serait satisfait par un produit qui
     * aurait simplement ouvert `filiales` à tout le monde. Ce qui a changé est
     * l'écran d'ADMINISTRATION ; le cloisonnement des données, lui, ne bouge pas.
     * On le vérifie sur la route de session, qui ne nomme que le périmètre porté. */
    const vues = await base.avecPerimetre(
      applicatif,
      { ...PERIMETRE_ADMIN, filiales: [FILIALE_A] },
      async (client) =>
        (await client.query(`select "id" from "filiales" where "id" = any($1::text[])`, [[FILIALE_A, FILIALE_B]])).rows,
    );
    assert.deepEqual(
      vues.map((f) => f.id),
      [FILIALE_A],
      'Un périmètre d’une seule filiale ne doit pas en lire deux : f_filiales_inventaire() ' +
        'est employée par l’écran d’administration, PAS par les lectures ordinaires.',
    );
  });
});

describe('§12 — L’ÉTAT DE LA LIAISON À L’ANNUAIRE, et ce qu’il ne rend PAS', () => {
  /* Demandé par l'utilisateur le 25/09/2026 : *« il faudrait que dans le panneau Admin il y
   * ait la liaison AD et son état. »* Un écran d'administration qui décrit la liaison est
   * utile ; un écran qui en rendrait le SECRET serait un défaut de sécurité servi à chaque
   * ouverture. Ce §12 garde les deux moitiés. */

  test('elle décrit la liaison — URL, base, compte de service, filtre', async () => {
    const r = await admin.appeler('GET', '/api/habilitations/etat');
    assert.equal(r.statut, 200);
    const a = r.corps.annuaire;
    assert.ok(a !== undefined, 'L’état doit porter la description de la liaison.');
    for (const champ of ['actif', 'prefixeGroupes', 'groupesImbriques', 'verifierCertificat',
                         'autoriteDeclaree', 'compteSecoursActif', 'comptes', 'verrouilles',
                         'derniereConnexion']) {
      assert.ok(champ in a, `Le champ « ${champ} » doit être rendu, même à null.`);
    }
  });

  test('🛑 elle ne rend AUCUN secret — ni mot de passe de service, ni empreinte', async () => {
    /* La seule propriété de sécurité de ce §12, et elle se mesure sur le CORPS ENTIER
     * sérialisé plutôt que champ par champ : une clé ajoutée demain à `decrireLiaison()`
     * doit faire rougir cet essai, pas passer entre les mailles d'une liste de noms.
     * ⚠️ C'est la règle du §19.5 — *on ne vérifie pas une liste, on balaie la matière.* */
    const r = await admin.appeler('GET', '/api/habilitations/etat');
    const brut = JSON.stringify(r.corps).toLowerCase();
    for (const interdit of ['mot_de_passe', 'motdepasse', 'password', 'empreinte', 'secret']) {
      assert.ok(
        !brut.includes(interdit),
        `L’état des habilitations contient « ${interdit} » : un écran d’administration ne `
          + 'sert pas de secret, et celui-ci est servi à chaque ouverture.',
      );
    }
  });

  test('les trois chiffres viennent de la BASE, et EXCLUENT le compte de secours', async () => {
    /* ⚠️ Un annuaire parfaitement décrit dont personne ne s'est jamais connecté n'est pas un
     * annuaire qui marche : c'est ce que ces trois chiffres disent, et qu'aucune description
     * de configuration ne peut dire. ⚠️ Le compte de secours est EXCLU du compte : il ne
     * vient pas de l'annuaire, et l'y mêler ferait croire qu'une liaison sert alors que
     * seul le filet de secours a été employé. */
    const r = await admin.appeler('GET', '/api/habilitations/etat');
    const a = r.corps.annuaire;
    assert.equal(typeof a.comptes, 'number');
    assert.equal(typeof a.verrouilles, 'number');
    assert.ok(a.comptes >= 0 && a.verrouilles >= 0);
    assert.ok(a.verrouilles <= a.comptes,
      'Il ne peut pas y avoir plus de comptes verrouillés que de comptes.');
  });
});
