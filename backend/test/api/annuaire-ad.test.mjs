/**
 * annuaire-ad.test.mjs — l'annuaire `personnes` alimenté depuis l'Active Directory.
 *
 * ── Ce que le cadrage demande ────────────────────────────────────────────────
 *
 * `PLAN_SERVEUR` §1.5, dernier point : « l'annuaire `personnes` est **alimenté
 * depuis l'AD**, ce qui remplace l'actuelle correspondance par nom en texte libre
 * — les affectations (“mes actions”, “mes échéances”) deviennent fiables ».
 *
 * ── Ce qui est éprouvé ici, et ce qui ne l'est pas ───────────────────────────
 *
 * L'annuaire LDAP lui-même est une doublure écrite par un autre agent
 * (`CONVENTIONS.md` §25) : ce fichier ne l'interroge pas. Il éprouve ce que le
 * serveur **fait** d'une identité déjà résolue — la fiche qu'il crée, celle
 * qu'il reprend, celle qu'il refuse de voler, et ce qu'il n'écrase pas.
 *
 * ── Les quatre propriétés, et le défaut que chacune ferme ────────────────────
 *
 * | Propriété | Le défaut qu'elle ferme |
 * |---|---|
 * | Une fiche est créée à la première connexion | Le provisionnement automatique du §1.5 |
 * | Une fiche saisie à la main est **reprise**, pas doublée | Deux fiches par personne le jour de la bascule |
 * | Une fiche déjà rattachée n'est **jamais** capturée | Un homonyme s'approprie l'identité d'un autre |
 * | Rien n'est écrit s'il n'y a rien à changer | `version` et `modifie_par` deviendraient un compteur de connexions |
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

const PERIMETRE = Object.freeze({
  utilisateurId: 'rssi.toulouse',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
});

/** Résolveur qui authentifie aussi, et dont l'identité change entre deux appels. */
class SessionAvecIdentite {
  constructor() {
    this.provisoire = true;
    this.identite = null;
    this.sessionOuverte = false;
  }

  async resoudre() {
    return PERIMETRE;
  }

  async authentifier() {
    return {
      perimetre: PERIMETRE,
      droits: { niveau: 'administration', domaines: TOUS_DOMAINES, export: true },
      identite: this.identite,
      sessionOuverte: this.sessionOuverte,
    };
  }

  decrire() {
    return 'session du banc (test/api/annuaire-ad.test.mjs)';
  }
}

let base;
let serveur;
let session;
const journal = [];

/** Lit une fiche d'annuaire, du point de vue de la filiale. */
async function fiches(critere = '1 = 1', parametres = []) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
    (
      await c.query(
        `select id, nom, fonction, service, email, telephone, utilisateur_id, version, filiale_id
           from personnes where ${critere} order by cree_le, id`,
        parametres,
      )
    ).rows,
  );
}

/** Une requête ordinaire — c'est elle qui déclenche l'alignement. */
async function requete() {
  const r = await serveur.appeler('GET', '/api/session');
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  return r;
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  session = new SessionAvecIdentite();
  serveur = await monterGreffon(base, PERIMETRE, {
    resolveur: session,
    journal: (ligne) => journal.push(ligne),
  });
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — Provisionnement
 * ===================================================================== */

describe('L’annuaire est alimenté depuis l’AD, à l’ouverture de session', () => {
  test('une identité inconnue crée sa fiche, avec les attributs de l’AD', async () => {
    session.identite = {
      login: 'rssi.toulouse',
      nomAffichage: 'Camille Duverger',
      email: 'camille.duverger@exemple.interne',
      telephone: '+33 5 61 00 00 00',
      service: 'Direction des systèmes d’information',
      fonction: 'RSSI',
      utilisateurId: 'USER-A',
    };
    session.sessionOuverte = true;
    await requete();

    const [fiche] = await fiches('utilisateur_id = $1', ['USER-A']);
    assert.ok(fiche !== undefined, 'Aucune fiche créée pour le compte USER-A.');
    assert.equal(fiche.nom, 'Camille Duverger');
    assert.equal(fiche.fonction, 'RSSI');
    assert.equal(fiche.service, 'Direction des systèmes d’information');
    assert.equal(fiche.email, 'camille.duverger@exemple.interne');
    assert.equal(fiche.telephone, '+33 5 61 00 00 00');
    assert.equal(fiche.filiale_id, FILIALE_A, 'La fiche est rattachée à la filiale de travail.');
    assert.match(fiche.id, /^PERS-/, 'L’identifiant suit la convention du §2.');
    assert.equal(fiche.version, 1);
  });

  test('une requête ordinaire, hors ouverture de session, ne touche RIEN', async () => {
    // Aligner à chaque requête ferait de « modifié par » un compteur de clics —
    // et `version` est une donnée d'audit, pas un compteur de connexions.
    session.sessionOuverte = false;
    session.identite = { ...session.identite, fonction: 'Directeur de la sécurité' };
    await requete();

    const [fiche] = await fiches('utilisateur_id = $1', ['USER-A']);
    assert.equal(fiche.fonction, 'RSSI', 'La fiche a bougé hors d’une ouverture de session.');
    assert.equal(fiche.version, 1);
  });

  test('une réouverture SANS changement n’incrémente pas la version', async () => {
    session.sessionOuverte = true;
    session.identite = { ...session.identite, fonction: 'RSSI' };
    await requete();
    await requete();

    const [fiche] = await fiches('utilisateur_id = $1', ['USER-A']);
    assert.equal(fiche.version, 1, 'Trois ouvertures sans changement ont écrit dans la fiche.');
  });

  test('un attribut modifié dans l’AD est repris, et lui seul', async () => {
    session.sessionOuverte = true;
    session.identite = { ...session.identite, fonction: 'Directrice de la sécurité' };
    await requete();

    const [fiche] = await fiches('utilisateur_id = $1', ['USER-A']);
    assert.equal(fiche.fonction, 'Directrice de la sécurité');
    assert.equal(fiche.version, 2, 'Une modification réelle, une version.');
    assert.equal(fiche.email, 'camille.duverger@exemple.interne', 'Le reste n’a pas bougé.');
  });

  test('un attribut ABSENT de l’AD n’efface pas ce que la filiale a saisi', async () => {
    // Un annuaire qui ne rend pas de téléphone ne doit pas effacer celui que
    // quelqu'un est allé chercher. Seule une valeur RENSEIGNÉE fait autorité.
    session.sessionOuverte = true;
    session.identite = {
      login: 'rssi.toulouse',
      nomAffichage: 'Camille Duverger',
      telephone: '',
      service: null,
      utilisateurId: 'USER-A',
    };
    await requete();

    const [fiche] = await fiches('utilisateur_id = $1', ['USER-A']);
    assert.equal(fiche.telephone, '+33 5 61 00 00 00');
    assert.equal(fiche.service, 'Direction des systèmes d’information');
  });
});

/* =====================================================================
 *  §2 — La bascule : reprendre sans doubler, sans voler
 * ===================================================================== */

describe('La bascule depuis la correspondance par nom en texte libre', () => {
  test('une fiche saisie à la main est REPRISE, pas doublée', async () => {
    // `PERS-A` — « Responsable de site » — est semée à la main dans la filiale A,
    // comme elle l'aurait été par un RSSI avant la bascule.
    const avant = await fiches("nom = 'Responsable de site'");
    assert.equal(avant.length, 1, 'Le semis en pose exactement une.');
    assert.equal(avant[0].utilisateur_id, null);

    session.identite = {
      login: 'resp.site',
      nomAffichage: 'Responsable de site',
      fonction: 'Responsable de site industriel',
      utilisateurId: 'USER-B',
    };
    session.sessionOuverte = true;
    await requete();

    const apres = await fiches("nom = 'Responsable de site'");
    assert.equal(apres.length, 1, 'La bascule a créé un doublon au lieu de reprendre la fiche.');
    assert.equal(apres[0].id, avant[0].id, 'C’est bien la MÊME fiche.');
    assert.equal(apres[0].utilisateur_id, 'USER-B', 'Elle porte désormais le compte applicatif.');
    assert.equal(apres[0].fonction, 'Responsable de site industriel');
  });

  test('une fiche DÉJÀ rattachée n’est jamais capturée par un homonyme', async () => {
    // Le cas qui compte : quelqu'un d'autre porte le même nom d'affichage. La
    // reprise par le nom ne doit jouer qu'une fois, et seulement sur une fiche
    // libre — sinon un homonyme hérite des affectations d'un collègue.
    session.identite = {
      login: 'homonyme',
      nomAffichage: 'Responsable de site',
      fonction: 'Autre personne, même nom',
      utilisateurId: 'USER-A',
    };
    session.sessionOuverte = true;
    await requete();

    const toutes = await fiches("nom = 'Responsable de site'");
    assert.equal(toutes.length, 2, 'L’homonyme doit obtenir SA fiche, pas celle du voisin.');
    const volee = toutes.find((f) => f.utilisateur_id === 'USER-B');
    assert.ok(volee !== undefined, 'La fiche de USER-B a été capturée.');
    assert.equal(volee.fonction, 'Responsable de site industriel', 'Et elle n’a pas été réécrite.');
  });

  test('CONTRÔLE DE MORSURE : sans identité, l’annuaire n’est pas touché', async () => {
    const avant = await fiches();
    session.identite = null;
    session.sessionOuverte = true;
    await requete();
    const apres = await fiches();
    assert.equal(apres.length, avant.length);
  });
});

/* =====================================================================
 *  §3 — Un échec d'annuaire ne referme pas la porte
 * ===================================================================== */

describe('L’annuaire est un confort, pas une barrière', () => {
  test('une identité que la base refuse n’empêche pas la session de servir', async () => {
    // `utilisateur_id` porte une clé étrangère vers `utilisateurs` : un compte
    // inconnu la viole. Refuser la session pour cette raison empêcherait un RSSI
    // d'ouvrir son plan de continuité un jour d'incident.
    journal.length = 0;
    session.identite = {
      login: 'compte.fantome',
      nomAffichage: 'Compte sans utilisateur',
      utilisateurId: 'USER-INEXISTANT',
    };
    session.sessionOuverte = true;

    const r = await serveur.appeler('GET', '/api/session');
    assert.equal(r.statut, 200, 'La session doit continuer malgré l’échec de l’annuaire.');

    const alerte = journal.find((l) => /annuaire/i.test(String(l.msg ?? '')));
    assert.ok(alerte !== undefined, `Aucune alerte dans ${JSON.stringify(journal.slice(0, 4))}`);
    assert.equal(alerte.login, 'compte.fantome');

    const orphelines = await fiches("nom = 'Compte sans utilisateur'");
    assert.equal(orphelines.length, 0, 'Rien ne doit avoir été écrit à moitié.');
  });

  test('et la donnée reste servie normalement après cet échec', async () => {
    const r = await serveur.appeler('GET', '/api/donnees');
    assert.equal(r.statut, 200);
    assert.ok(r.corps.data.risques.length > 0);
  });
});
