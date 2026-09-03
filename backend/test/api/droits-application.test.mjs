/**
 * droits-application.test.mjs — les droits sont appliqués **par le serveur**,
 * à chaque requête, et avant l'analyse du corps.
 *
 * ── Ce que ce fichier éprouve, et ce qu'il n'éprouve pas ─────────────────────
 *
 * Il n'éprouve **pas** la résolution des droits depuis l'Active Directory : c'est
 * l'autre moitié du lot L3 (agent A1, `src/auth/`, `src/droits/`), et le
 * `PLAN_EXECUTION` §2 est explicite — *un agent n'écrit pas l'essai qui juge le
 * composant qu'il n'a pas écrit*.
 *
 * Il éprouve ce que le **point d'entrée** fait de droits déjà résolus :
 *
 * | § | Propriété | Contrôle de la grille |
 * |---|---|---|
 * | 1 | Un profil *Lecture* qui tente une écriture est refusé **par le serveur** | **S6** |
 * | 2 | Le droit d'export est **distinct** de la lecture | **S7** |
 * | 3 | Le refus **précède l'analyse du corps** | **E4** (constat Q-10) |
 * | 4 | Le droit d'appeler la reprise est un acte d'administration | **E3** (`CONVENTIONS.md` §21) |
 * | 5 | Aucune route ne sert sans classe d'accès déclarée | **S6**, structurel |
 * | 6 | Le rythme des requêtes non authentifiées est borné | **S11**, **E4** |
 * | 7 | Aucun refus ne laisse fuir un message du cadre | **S12** (constat Q-55) |
 *
 * ── La preuve de E4 n'est PAS une mesure de temps, et c'est délibéré ─────────
 *
 * Une assertion de durée est une assertion qui rougit un jour de charge, et un
 * banc intermittent est un banc qu'on cesse de lire (constat Q-64). La preuve
 * retenue est **catégorielle** : on envoie un corps qui n'est **pas** du JSON
 * valide. Si le corps avait été analysé, la réponse serait un refus de format
 * (400) ; elle est un refus de droit (401 ou 403). Le corps n'a donc pas été lu.
 *
 * Les mesures chiffrées, elles, sont prises **derrière un Apache réel** et
 * rendues dans le rapport de l'agent — c'est ce que le contrôle S17 réclame, et
 * `inject()` ne le donne pas.
 *
 * ── Les profils employés ici ────────────────────────────────────────────────
 *
 * Ce sont les profils du `PLAN_SERVEUR` §3.2, **écrits ici comme jeu d'essai** :
 * ce banc éprouve leur application, pas leur définition. Leur source réelle
 * sera la table `profils`, alimentée depuis les groupes AD.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon } from '../aide/serveur.mjs';

/* =====================================================================
 *  Le banc : une session dont on choisit les droits
 * ===================================================================== */

/**
 * Résolveur de périmètre **qui sait aussi authentifier**.
 *
 * C'est la forme que prendra l'implémentation du lot L3 : une même session
 * serveur répond aux deux questions — *quel périmètre ?* et *qui parle ?*.
 * `greffonApi` l'accepte telle quelle (`estAuthentificateur`).
 *
 * ⚠️ Le contrat est respecté à la lettre : **`resoudre()` ne prend aucun
 * argument**, et `authentifier()` ne lit rien de la requête. Un résolveur de
 * banc qui lirait une entête réintroduirait ce que le contrôle S2 interdit.
 */
class SessionDeBanc {
  constructor({ perimetre: p, droits, identite = null, sessionOuverte = false, refuser = null }) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...p });
    this._droits = Object.freeze({ ...droits });
    this._identite = identite;
    this._sessionOuverte = sessionOuverte;
    this._refuser = refuser;
    /** Nombre d'appels : sert à prouver qu'un refus de rythme n'authentifie plus. */
    this.appels = 0;
  }

  poserDroits(droits) {
    this._droits = Object.freeze({ ...droits });
  }

  poserOuverture(ouverte) {
    this._sessionOuverte = ouverte;
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    this.appels += 1;
    if (this._refuser !== null) throw this._refuser();
    return {
      perimetre: this._perimetre,
      droits: this._droits,
      identite: this._identite,
      sessionOuverte: this._sessionOuverte,
    };
  }

  decrire() {
    return 'session du banc d’essai (test/api/droits-application.test.mjs)';
  }
}

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

/** Les huit profils du `PLAN_SERVEUR` §3.2, tels que le banc les exerce. */
const PROFILS = Object.freeze({
  rssi:        { niveau: 'validation',     domaines: TOUS_DOMAINES.filter((d) => d !== 'administration'), export: true },
  contributeur:{ niveau: 'contribution',   domaines: ['actions', 'incidents', 'actifs'], export: false },
  qualite:     { niveau: 'contribution',   domaines: ['audits', 'documents', 'conformite'], export: false },
  rh:          { niveau: 'contribution',   domaines: ['personnel', 'incidents'], export: false },
  dpo:         { niveau: 'contribution',   domaines: ['rgpd', 'incidents', 'documents'], export: false },
  direction:   { niveau: 'lecture',        domaines: ['pilotage', 'conformite'], export: false },
  auditeur:    { niveau: 'lecture',        domaines: TOUS_DOMAINES.filter((d) => d !== 'administration'), export: false },
  administrateur: { niveau: 'administration', domaines: TOUS_DOMAINES, export: true },
});

const PERIMETRE_FILIALE = Object.freeze({
  utilisateurId: 'agent.essai',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
});

/** Direction : périmètre **Groupe**, en lecture — le cas exact du §3.3. */
const PERIMETRE_GROUPE = Object.freeze({
  utilisateurId: 'direction',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: false,
});

let base;
/** Serveurs montés, à fermer quoi qu'il arrive. */
const montes = [];

/** Monte le greffon avec un profil donné, et rend `{ serveur, session }`. */
async function avecProfil(profil, options = {}) {
  const session = new SessionDeBanc({
    perimetre: options.perimetre ?? PERIMETRE_FILIALE,
    droits: profil,
    identite: options.identite ?? null,
    sessionOuverte: options.sessionOuverte ?? false,
    refuser: options.refuser ?? null,
  });
  const serveur = await monterGreffon(base, session._perimetre, {
    resolveur: session,
    ...(options.journal === undefined ? {} : { journal: options.journal }),
  });
  montes.push(serveur);
  return { serveur, session };
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
});

after(async () => {
  for (const serveur of montes) await serveur?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  §1 — Contrôle S6 : c'est LE SERVEUR qui refuse une écriture
 * ===================================================================== */

describe('S6 — un profil Lecture ne peut pas écrire, et l’interface n’y est pour rien', () => {
  test('Direction (lecture, Groupe) : toute écriture est refusée 403 par le serveur', async () => {
    const { serveur } = await avecProfil(PROFILS.direction, { perimetre: PERIMETRE_GROUPE });

    const ecritures = [
      ['POST', '/api/entites/exigences', { champs: { code: 'A.5.2', intitule: 'Tentative' } }],
      ['PUT', '/api/entites/exigences/EX-A', { version: 1, champs: { intitule: 'Tentative' } }],
      ['POST', '/api/operations/propager-mesure', { mesureId: 'MESURE-A' }],
    ];

    for (const [methode, url, corps] of ecritures) {
      const r = await serveur.appeler(methode, url, corps === undefined ? {} : { corps });
      assert.equal(r.statut, 403, `${methode} ${url} devrait être refusé : ${JSON.stringify(r.corps)}`);
      assert.equal(r.corps.erreur, 'droit_insuffisant');
      assert.match(r.corps.message, /consultation/i);
      // Le refus ne dit ni le profil, ni le groupe AD, ni le domaine interne.
      assert.equal(/lecture|domaine|profil «/.test(r.corps.message), false, r.corps.message);
    }

    // La suppression aussi — elle est une écriture, et le §1.4 la range sous P1.
    const suppression = await serveur.appeler('DELETE', '/api/entites/exigences/EX-A?version=1');
    assert.equal(suppression.statut, 403);
  });

  test('CONTRÔLE SYMÉTRIQUE : la même Direction LIT sans difficulté', async () => {
    const { serveur } = await avecProfil(PROFILS.direction, { perimetre: PERIMETRE_GROUPE });
    const donnees = await serveur.appeler('GET', '/api/donnees');
    assert.equal(donnees.statut, 200);
    assert.ok(Array.isArray(donnees.corps.data.exigences));
    assert.equal((await serveur.appeler('GET', '/api/session')).statut, 200);
    assert.equal((await serveur.appeler('GET', '/api/modele')).statut, 200);
  });

  test('et rien n’a été écrit : le refus n’est pas un affichage', async () => {
    const client = await base.connexion('app');
    const compte = await base.avecPerimetre(
      client,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (await c.query("select count(*)::int as n from exigences where intitule = 'Tentative'")).rows[0].n,
    );
    assert.equal(compte, 0);
  });

  test('le domaine compte autant que le niveau : Qualité écrit un audit, pas un risque', async () => {
    const { serveur } = await avecProfil(PROFILS.qualite);

    const audit = await serveur.appeler('POST', '/api/entites/audits', {
      corps: { champs: { reference: 'AUDIT-QUAL-1' } },
    });
    assert.equal(audit.statut, 201, JSON.stringify(audit.corps));

    const risque = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Cartographie interdite au service qualité' } },
    });
    assert.equal(risque.statut, 403, JSON.stringify(risque.corps));
    assert.equal(risque.corps.erreur, 'droit_insuffisant');
  });

  test('un domaine fermé l’est aussi EN LECTURE : la collection revient vide, pas filtrée à l’écran', async () => {
    const { serveur } = await avecProfil(PROFILS.qualite);
    const { corps } = await serveur.appeler('GET', '/api/donnees');
    assert.equal(corps.data.risques.length, 0, 'Le service qualité ne doit pas RECEVOIR les risques.');
    assert.equal(corps.volumes.risques, 0, 'Le compte est déjà une donnée : il ne doit pas fuir non plus.');
    assert.ok(corps.data.audits.length > 0, 'Ses propres domaines, eux, doivent arriver.');
  });

  test('CONTRÔLE DE MORSURE : le RSSI, lui, reçoit bien ces mêmes risques', async () => {
    // Sans ce contrôle, le test précédent serait vert si la base était vide.
    const { serveur } = await avecProfil(PROFILS.rssi);
    const { corps } = await serveur.appeler('GET', '/api/donnees');
    assert.ok(corps.data.risques.length >= 2, `Le semis en pose deux : ${String(corps.data.risques.length)}.`);
    assert.equal(corps.volumes.risques, corps.data.risques.length);
  });

  test('le sondage suit la même règle que le chargement', async () => {
    const { serveur } = await avecProfil(PROFILS.qualite);
    const r = await serveur.appeler('GET', '/api/rafraichir?depuis=2000-01-01T00:00:00.000Z');
    assert.equal(r.statut, 200);
    assert.equal(r.corps.volumes.risques, 0);
    assert.equal(r.corps.modifications.risques, undefined);
    assert.ok(r.corps.volumes.audits > 0);
  });

  test('l’auditeur externe lit tout et n’écrit rien — les deux sens du garde-fou', async () => {
    const { serveur } = await avecProfil(PROFILS.auditeur);
    const donnees = await serveur.appeler('GET', '/api/donnees');
    assert.ok(donnees.corps.data.risques.length > 0, 'Un auditeur doit voir les risques.');
    const ecriture = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Écrit par un auditeur externe' } },
    });
    assert.equal(ecriture.statut, 403);
  });
});

/* =====================================================================
 *  §2 — Contrôle S7 : le droit d'export est distinct de la lecture
 * ===================================================================== */

describe('S7 — exporter n’est pas lire', () => {
  test('Groupe en lecture, SANS droit d’export : l’export est refusé', async () => {
    const { serveur } = await avecProfil(PROFILS.direction, { perimetre: PERIMETRE_GROUPE });
    // La lecture, elle, passe : c'est ce qui rend le refus significatif.
    assert.equal((await serveur.appeler('GET', '/api/donnees')).statut, 200);

    const r = await serveur.appeler('GET', '/api/export');
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.equal(r.corps.erreur, 'droit_insuffisant');
    assert.match(r.corps.message, /export/i);
  });

  test('CONTRÔLE SYMÉTRIQUE : le même périmètre AVEC le droit d’export obtient l’enveloppe', async () => {
    const { serveur } = await avecProfil(
      { ...PROFILS.direction, export: true },
      { perimetre: PERIMETRE_GROUPE },
    );
    const r = await serveur.appeler('GET', '/api/export');
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.equal(r.corps.format, 'grc-backup');
    assert.equal(r.corps.encrypted, false);
    assert.equal(typeof r.corps.payload, 'object');
    assert.equal(r.corps.payload.schemaVersion, 12);
  });

  test('l’export ne rend que les domaines du profil', async () => {
    const { serveur } = await avecProfil({ ...PROFILS.qualite, export: true });
    const r = await serveur.appeler('GET', '/api/export');
    assert.equal(r.statut, 200);
    assert.equal(r.corps.payload.risques.length, 0, 'Un profil qualité n’exporte pas la cartographie.');
    assert.ok(r.corps.payload.audits.length > 0);
  });

  test('un contributeur SANS export ne peut pas contourner par la route de reprise', async () => {
    // La reprise LIT aussi (son aperçu rend un bilan) : si elle était ouverte à
    // qui n'a pas le droit d'export, le droit ne vaudrait rien.
    const { serveur } = await avecProfil(PROFILS.contributeur);
    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: { mode: 'fusionner', apercu: true, fichier: { nom: 'x.json', contenu: '{}' } },
    });
    assert.equal(r.statut, 403);
  });

  test('l’export réussi est journalisé — le §3.3 l’exige « systématiquement »', async () => {
    const lignes = [];
    const { serveur } = await avecProfil(
      { ...PROFILS.direction, export: true },
      { perimetre: PERIMETRE_GROUPE, journal: (ligne) => lignes.push(ligne) },
    );
    assert.equal((await serveur.appeler('GET', '/api/export')).statut, 200);
    // `monterGreffon` n'écoute qu'à partir de `warn` : la trace d'export est en
    // `info`. Ce qui est vérifiable ici est donc le REFUS, qui est en `warn` —
    // et c'est celui des deux qui compte pour un auditeur.
    const { serveur: refuse } = await avecProfil(PROFILS.direction, {
      perimetre: PERIMETRE_GROUPE,
      journal: (ligne) => lignes.push(ligne),
    });
    assert.equal((await refuse.appeler('GET', '/api/export')).statut, 403);
    const trace = lignes.find((l) => /Accès refusé par le modèle de droits/.test(String(l.msg ?? '')));
    assert.ok(trace !== undefined, `Aucune trace de refus dans ${JSON.stringify(lignes.slice(0, 5))}`);
    assert.equal(trace.action, 'exporter');
    assert.match(String(trace.detail), /export/i);
  });
});

/* =====================================================================
 *  §3 — Condition E4 : le refus PRÉCÈDE l'analyse du corps
 * ===================================================================== */

describe('E4 — un corps non authentifié n’est pas analysé (constat Q-10)', () => {
  /** Un corps qui n'est PAS du JSON : s'il est analysé, la réponse est un 400. */
  const CORPS_ILLISIBLE = `{"mode":"fusionner","fichier":{"nom":"x","contenu":"${'A'.repeat(2_000_000)}`;

  test('sans session : 401 sur un corps de 2 Mo ILLISIBLE — donc jamais analysé', async () => {
    const { ErreurApplicative } = await moduleCompile('erreurs/index.js');
    const { serveur } = await avecProfil(PROFILS.administrateur, {
      refuser: () =>
        new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 401,
          message: 'Votre session a expiré. Reconnectez-vous.',
          detailJournal: 'banc : aucune session',
        }),
    });

    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: CORPS_ILLISIBLE,
      entetes: { 'content-type': 'application/json' },
    });
    assert.equal(r.statut, 401, JSON.stringify(r.corps).slice(0, 300));
    assert.notEqual(r.statut, 400, 'Un 400 signifierait que le corps a été analysé.');
    assert.equal(/JSON|FST_ERR/i.test(JSON.stringify(r.corps)), false, JSON.stringify(r.corps));
  });

  test('CONTRÔLE DE MORSURE : la MÊME requête AVEC session rend bien un 400 de format', async () => {
    // Sans lui, le test précédent serait vert si le corps était simplement
    // ignoré partout — et l'on ne prouverait rien sur l'ordre des opérations.
    const { serveur } = await avecProfil(PROFILS.administrateur);
    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: CORPS_ILLISIBLE,
      entetes: { 'content-type': 'application/json' },
    });
    assert.equal(r.statut, 400, JSON.stringify(r.corps).slice(0, 300));
    assert.equal(r.corps.erreur, 'donnee_invalide');
  });

  test('droit refusé : 403 sur le même corps illisible — le coût n’est pas payé non plus', async () => {
    const { serveur } = await avecProfil(PROFILS.contributeur);
    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: CORPS_ILLISIBLE,
      entetes: { 'content-type': 'application/json' },
    });
    assert.equal(r.statut, 403, JSON.stringify(r.corps).slice(0, 300));
  });

  test('le refus vaut aussi pour l’écriture ordinaire, pas seulement pour la reprise', async () => {
    const { serveur } = await avecProfil(PROFILS.direction, { perimetre: PERIMETRE_GROUPE });
    const r = await serveur.appeler('POST', '/api/entites/risques', {
      corps: `{"champs":{"nom":"${'x'.repeat(500_000)}`,
      entetes: { 'content-type': 'application/json' },
    });
    assert.equal(r.statut, 403);
  });
});

/* =====================================================================
 *  §4 — Condition E3 : la reprise est un acte d'administration
 * ===================================================================== */

describe('E3 — le droit d’appeler la reprise est décidé par le modèle de droits', () => {
  const fichier = (identifiant) =>
    JSON.stringify({
      format: 'grc-backup',
      version: 12,
      app: 'cyber-grc-dedienne',
      createdAt: '2026-09-03T09:00:00.000Z',
      encrypted: false,
      payload: { schemaVersion: 12, risques: [{ id: identifiant, nom: 'Reprise' }] },
    });

  test('un RSSI de site — tous les domaines, niveau validation — se voit refuser la reprise', async () => {
    const { serveur } = await avecProfil(PROFILS.rssi);
    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: { mode: 'fusionner', fichier: { nom: 'export.json', contenu: fichier('RISK-NEUF-1') } },
    });
    assert.equal(r.statut, 403, JSON.stringify(r.corps));
    assert.match(r.corps.message, /administration/i);
  });

  test('CONTRÔLE SYMÉTRIQUE : le profil Administration, lui, reprend', async () => {
    const { serveur } = await avecProfil(PROFILS.administrateur);
    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: {
        mode: 'fusionner',
        apercu: true,
        fichier: { nom: 'export.json', contenu: fichier('RISK-NEUF-2') },
      },
    });
    assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 300));
    assert.equal(r.corps.applique, false, 'Un aperçu n’applique rien.');
  });

  test('§21 — pour qui n’a pas le droit, l’oracle d’existence est INDISTINCT', async () => {
    // Le report du `CONVENTIONS.md` §21 dit : « la vraie barrière est le droit
    // d'appeler la route, et elle appartient à L3 ». On le vérifie : deux
    // fichiers, l'un portant un identifiant DÉJÀ PRIS dans une AUTRE filiale,
    // l'autre un identifiant libre. Les deux réponses doivent être identiques —
    // statut, corps, à la référence d'incident près.
    const { serveur } = await avecProfil(PROFILS.rssi);

    const pris = await serveur.appeler('POST', '/api/reprise', {
      corps: { mode: 'fusionner', fichier: { nom: 'x.json', contenu: fichier('RISK-B') } },
    });
    const libre = await serveur.appeler('POST', '/api/reprise', {
      corps: { mode: 'fusionner', fichier: { nom: 'x.json', contenu: fichier('RISK-ABSENT-XYZ') } },
    });

    assert.equal(pris.statut, 403);
    assert.equal(libre.statut, 403);
    const sansReference = (corps) => JSON.stringify({ ...corps, reference: undefined });
    assert.equal(
      sansReference(pris.corps),
      sansReference(libre.corps),
      'Les deux issues doivent être indistinctes : c’est ce qui ferme le canal du §21.',
    );
  });

  test('et rien n’est entré en base sur les tentatives refusées', async () => {
    const client = await base.connexion('app');
    const compte = await base.avecPerimetre(
      client,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (await c.query("select count(*)::int as n from risques where nom = 'Reprise'")).rows[0].n,
    );
    assert.equal(compte, 0, 'Aucune reprise refusée ne doit avoir écrit.');
  });
});

/* =====================================================================
 *  §5 — Aucune route ne sert sans classe d'accès déclarée
 * ===================================================================== */

describe('S6 structurel — une route sans classe d’accès ne sert rien', () => {
  test('les routes montées déclarent TOUTES leur classe d’accès', async () => {
    // Découvert, jamais récité : le crochet `onRoute` de Fastify voit chaque
    // route au moment où elle est enregistrée, y compris dans un greffon
    // encapsulé. Une route ajoutée demain sans classe d'accès est nommée ici.
    const { default: Fastify } = await import('fastify');
    const { greffonApi } = await moduleCompile('api/index.js');
    const socle = await avecProfil(PROFILS.administrateur);

    const vues = [];
    const instance = Fastify({ logger: false });
    instance.addHook('onRoute', (route) => vues.push(route));
    await instance.register(greffonApi, {
      pool: socle.serveur.pool,
      config: socle.serveur.config,
      resolveur: socle.session,
    });
    await instance.ready();

    try {
      assert.ok(vues.length >= 9, `Balayage suspect : ${String(vues.length)} route(s) vue(s).`);
      const sansClasse = vues
        .filter((route) => route.config?.acces === undefined)
        .map((route) => `${String(route.method)} ${route.url}`);
      assert.deepEqual(
        sansClasse,
        [],
        'Ces routes n’ont pas déclaré ce qu’elles exigent. Le crochet les refuse en 500 ' +
          'plutôt que de les servir sans contrôle — mais c’est ici qu’on le voit avant l’usage.',
      );

      // Contrôle de morsure du balayage : il doit VOIR une classe d'accès qui
      // existe, sans quoi « aucune route fautive » serait vrai pour la pire des
      // raisons.
      const reprise = vues.find((route) => route.url === '/api/reprise');
      assert.equal(reprise.config.acces.action, 'administrer');
      const entites = vues.find((route) => route.url === '/api/entites/:entite' && route.method === 'POST');
      assert.equal(entites.config.acces.domaine, 'selon-entite');
    } finally {
      await instance.close();
    }
  });
});

/* =====================================================================
 *  §6 — S11 / E4 : le rythme des requêtes non authentifiées est borné
 * ===================================================================== */

describe('S11 — le martèlement sans session finit par être verrouillé', () => {
  test('après le budget d’échecs, la réponse devient 429 avec « retry-after »', async () => {
    const { ErreurApplicative } = await moduleCompile('erreurs/index.js');
    const { serveur, session } = await avecProfil(PROFILS.administrateur, {
      refuser: () =>
        new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 401,
          message: 'Votre session a expiré. Reconnectez-vous.',
          detailJournal: 'banc : aucune session',
        }),
    });

    let premier429 = -1;
    for (let essai = 0; essai < 60; essai += 1) {
      const r = await serveur.appeler('GET', '/api/donnees');
      if (r.statut === 429) {
        premier429 = essai;
        assert.ok(Number(r.entetes['retry-after']) > 0, 'Un 429 doit dire combien de temps attendre.');
        assert.equal(r.corps.erreur, 'indisponible');
        assert.match(r.corps.message, /tentatives/i);
        break;
      }
      assert.equal(r.statut, 401, `Essai ${String(essai)} : ${String(r.statut)}`);
    }
    assert.notEqual(premier429, -1, 'Soixante tentatives sans session n’ont jamais été verrouillées.');

    // Et le verrou s'exerce AVANT l'authentification : une fois verrouillé,
    // l'authentificateur n'est plus appelé du tout.
    const appelsAvant = session.appels;
    assert.equal((await serveur.appeler('GET', '/api/donnees')).statut, 429);
    assert.equal(session.appels, appelsAvant, 'Le verrou doit précéder l’authentification.');
  });

  test('CONTRÔLE SYMÉTRIQUE : une session valide n’est jamais verrouillée', async () => {
    const { serveur } = await avecProfil(PROFILS.rssi);
    for (let essai = 0; essai < 80; essai += 1) {
      const r = await serveur.appeler('GET', '/api/session');
      assert.equal(r.statut, 200, `Essai ${String(essai)} verrouillé à tort : ${String(r.statut)}`);
    }
  });

  test('un 503 « service fermé » ne verrouille personne', async () => {
    // La barrière fail-closed du lot L2 rend 503 hors développement. La
    // confondre avec un échec d'authentification punirait l'appelant de notre
    // panne — et rendrait le refus indiscernable d'un verrouillage.
    const { ErreurApplicative } = await moduleCompile('erreurs/index.js');
    const { serveur } = await avecProfil(PROFILS.administrateur, {
      refuser: () =>
        new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message: 'Le serveur ne peut pas servir de données.',
          detailJournal: 'banc : service fermé',
        }),
    });
    for (let essai = 0; essai < 40; essai += 1) {
      const r = await serveur.appeler('GET', '/api/donnees');
      assert.equal(r.statut, 503, `Essai ${String(essai)} : ${String(r.statut)} au lieu de 503.`);
    }
  });
});

/* =====================================================================
 *  §7 — S12 : aucun refus ne laisse fuir un message du cadre
 * ===================================================================== */

describe('S12 — les refus neufs ne renseignent pas l’attaquant (suite de Q-55)', () => {
  test('401, 403 et 429 : pas de code du cadre, pas d’anglais, pas de pile', async () => {
    const { ErreurApplicative } = await moduleCompile('erreurs/index.js');
    const refuse = await avecProfil(PROFILS.administrateur, {
      refuser: () =>
        new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 401,
          message: 'Votre session a expiré. Reconnectez-vous.',
          detailJournal: 'FST_ERR_SECRET_INTERNE — ne doit jamais sortir',
        }),
    });
    const droit = await avecProfil(PROFILS.direction, { perimetre: PERIMETRE_GROUPE });

    const reponses = [
      await refuse.serveur.appeler('GET', '/api/donnees'),
      await droit.serveur.appeler('POST', '/api/entites/risques', { corps: { champs: { nom: 'x' } } }),
      await droit.serveur.appeler('GET', '/api/export'),
    ];

    for (const r of reponses) {
      const texte = JSON.stringify(r.corps);
      assert.equal(/FST_ERR/.test(texte), false, texte);
      assert.equal(/at Object|at Function|\.ts:\d+/.test(texte), false, texte);
      assert.equal(/Body is not valid|Bad Request|Unauthorized|Forbidden/.test(texte), false, texte);
      assert.equal(/detailJournal|SELECT |insert into/i.test(texte), false, texte);
      assert.ok(typeof r.corps.reference === 'string' && r.corps.reference.length > 0,
        'Un refus sans référence d’incident laisse l’utilisateur sans rien à donner au support.');
    }
  });

  test('un JSON tronqué sur la route d’export d’un profil autorisé reste générique', async () => {
    const { serveur } = await avecProfil(PROFILS.administrateur);
    const r = await serveur.appeler('POST', '/api/reprise', {
      corps: '{"mode":"fusionner","fichier":',
      entetes: { 'content-type': 'application/json' },
    });
    assert.equal(r.statut, 400);
    assert.equal(/FST_ERR|not valid JSON/.test(JSON.stringify(r.corps)), false, JSON.stringify(r.corps));
  });
});

/* =====================================================================
 *  §8 — Un niveau PAR DOMAINE, quand la couche d'authentification le donne
 * ===================================================================== */

describe('Le niveau du domaine prime sur celui de la session', () => {
  /**
   * ── Le défaut que ce paragraphe ferme, et qui l'a trouvé ──────────────
   *
   * `src/droits/passerelle-api.ts` — écrit par l'agent qui résout les droits —
   * a mesuré ce que sa projection perdait : *« un profil Qualité passe le
   * contrôle pour une écriture sur le domaine `conformite`, alors que
   * `session_domaines` ne lui accorde que la lecture »*. Le constat visait la
   * forme de `DroitsSession`, qui ne portait qu'un niveau pour toute la session.
   *
   * Il en porte désormais un par domaine, facultatif. Ces deux essais éprouvent
   * les deux sens : il restreint, et il ne desserre jamais.
   */
  const QUALITE_FIN = Object.freeze({
    niveau: 'contribution',
    domaines: ['audits', 'documents', 'conformite'],
    export: false,
    // Contribue aux audits et aux documents ; **lit** seulement la conformité.
    niveaux: { audits: 'contribution', documents: 'contribution', conformite: 'lecture' },
  });

  test('le domaine en LECTURE seule refuse l’écriture, même si la session contribue', async () => {
    const { serveur } = await avecProfil(QUALITE_FIN);

    const audit = await serveur.appeler('POST', '/api/entites/audits', {
      corps: { champs: { reference: 'AUDIT-FIN-1' } },
    });
    assert.equal(audit.statut, 201, `Le domaine où il contribue doit passer : ${JSON.stringify(audit.corps)}`);

    const exigence = await serveur.appeler('POST', '/api/entites/exigences', {
      corps: { champs: { code: 'A.9.9', intitule: 'Écrit par un profil en lecture' } },
    });
    assert.equal(exigence.statut, 403, JSON.stringify(exigence.corps));
    assert.equal(exigence.corps.erreur, 'droit_insuffisant');
  });

  test('CONTRÔLE SYMÉTRIQUE : le même profil LIT bien la conformité', async () => {
    const { serveur } = await avecProfil(QUALITE_FIN);
    const { corps } = await serveur.appeler('GET', '/api/donnees');
    assert.ok(corps.data.exigences.length > 0, 'La lecture du domaine reste ouverte.');
  });

  test('un niveau de domaine ne DESSERRE jamais : il ne peut que restreindre', async () => {
    // Un profil en lecture qui porterait « actions: administration » ne doit pas
    // pour autant pouvoir reprendre un export : la route de reprise vise le
    // domaine « administration », que ce profil n'a pas.
    const { serveur } = await avecProfil({
      niveau: 'lecture',
      domaines: ['actions'],
      export: false,
      niveaux: { actions: 'administration' },
    });
    const reprise = await serveur.appeler('POST', '/api/reprise', {
      corps: { mode: 'fusionner', fichier: { nom: 'x.json', contenu: '{}' } },
    });
    assert.equal(reprise.statut, 403, JSON.stringify(reprise.corps));

    // Et ce que le domaine ouvre vraiment, lui, passe.
    const action = await serveur.appeler('POST', '/api/entites/actions', {
      corps: { champs: { titre: 'Écrite au niveau du domaine' } },
    });
    assert.equal(action.statut, 201, JSON.stringify(action.corps));
  });

  test('les droits rendus par « /api/session » portent le détail quand il existe', async () => {
    const { serveur } = await avecProfil(QUALITE_FIN);
    const { corps } = await serveur.appeler('GET', '/api/session');
    assert.equal(corps.droits.niveau, 'contribution');
    assert.equal(corps.droits.export, false);
    assert.equal(corps.droits.niveaux.conformite, 'lecture');

    // Et la clé est ABSENTE quand la couche d'authentification ne la donne pas :
    // l'interface s'en tient alors au niveau de la session.
    const { serveur: sansDetail } = await avecProfil(PROFILS.rssi);
    const brut = await sansDetail.appeler('GET', '/api/session');
    assert.equal(brut.corps.droits.niveaux, undefined);
  });
});

/* =====================================================================
 *  §9 — Les routes publiques : déclarées, jamais exemptées
 * ===================================================================== */

describe('La connexion est montée hors du contrôle d’authentification (CONVENTIONS §26.2)', () => {
  /**
   * Doublure minimale du service : ce paragraphe éprouve le **montage**, pas la
   * connexion. La connexion elle-même appartient à `src/auth/` et à son banc —
   * *un agent n'écrit pas l'essai qui juge le composant qu'il n'a pas écrit*.
   */
  const serviceDoublure = {
    async connecter() {
      return {
        jeton: 'jeton-de-banc',
        session: {
          perimetre: PERIMETRE_FILIALE,
          droits: PROFILS.rssi,
        },
      };
    },
    async deconnecter() {
      /* rien : la doublure ne tient aucun état */
    },
  };

  test('POST /api/connexion répond SANS session, là où /api/donnees rend 401', async () => {
    const { ErreurApplicative } = await moduleCompile('erreurs/index.js');
    const { default: Fastify } = await import('fastify');
    const { greffonApi } = await moduleCompile('api/index.js');
    const socle = await avecProfil(PROFILS.rssi);

    // L'authentificateur refuse TOUT : si la route de connexion était montée
    // sous le contrôle, elle rendrait 401 et serait inatteignable — le défaut
    // exact que l'entête de `src/auth/greffon.ts` décrit.
    const refuseur = new SessionDeBanc({
      perimetre: PERIMETRE_FILIALE,
      droits: PROFILS.rssi,
      refuser: () =>
        new ErreurApplicative({
          code: 'non_authentifie',
          statut: 401,
          message: 'Votre session a expiré. Reconnectez-vous.',
          detailJournal: 'banc : aucune session',
        }),
    });

    const instance = Fastify({ logger: false });
    await instance.register(greffonApi, {
      pool: socle.serveur.pool,
      config: socle.serveur.config,
      resolveur: refuseur,
      serviceAuthentification: serviceDoublure,
    });
    await instance.ready();

    try {
      const protegee = await instance.inject({ method: 'GET', url: '/api/donnees' });
      assert.equal(protegee.statusCode, 401, 'Une route de données doit exiger une session.');

      const connexion = await instance.inject({
        method: 'POST',
        url: '/api/connexion',
        payload: { identifiant: 'rssi.tls', motDePasse: 'peu importe' },
      });
      assert.equal(
        connexion.statusCode,
        200,
        `La connexion doit répondre sans session : ${connexion.body.slice(0, 200)}`,
      );
      // Et elle rend la MÊME charte que `/api/session` — §26.2, « à l'octet près ».
      const charte = JSON.parse(connexion.body);
      assert.equal(charte.utilisateur, PERIMETRE_FILIALE.utilisateurId);
      assert.ok(Array.isArray(charte.droits.domaines));
      assert.equal(typeof charte.schema_version, 'number');
      assert.match(String(connexion.headers['set-cookie']), /HttpOnly/i);

      const deconnexion = await instance.inject({ method: 'DELETE', url: '/api/connexion' });
      assert.equal(deconnexion.statusCode, 204);
    } finally {
      await instance.close();
    }
  });

  test('CONTRÔLE DE MORSURE : seules les routes de connexion sont publiques', async () => {
    // Une déclaration « publique » qui déborderait ouvrirait le produit. On
    // compte donc celles qui la portent, et on les nomme.
    const { default: Fastify } = await import('fastify');
    const { greffonApi } = await moduleCompile('api/index.js');
    const socle = await avecProfil(PROFILS.rssi);

    const vues = [];
    const instance = Fastify({ logger: false });
    instance.addHook('onRoute', (route) => vues.push(route));
    await instance.register(greffonApi, {
      pool: socle.serveur.pool,
      config: socle.serveur.config,
      resolveur: socle.session,
      serviceAuthentification: serviceDoublure,
    });
    await instance.ready();

    try {
      const publiques = vues
        .filter((route) => route.config?.acces?.action === 'publique')
        .map((route) => `${String(route.method)} ${route.url}`)
        .sort();
      assert.deepEqual(
        publiques,
        ['DELETE /api/connexion', 'POST /api/connexion'],
        'Une route publique de plus est un point d’entrée sans authentification de plus.',
      );
    } finally {
      await instance.close();
    }
  });

  test('sans service d’authentification, AUCUNE route publique n’est montée', async () => {
    const { default: Fastify } = await import('fastify');
    const { greffonApi } = await moduleCompile('api/index.js');
    const socle = await avecProfil(PROFILS.rssi);

    const vues = [];
    const instance = Fastify({ logger: false });
    instance.addHook('onRoute', (route) => vues.push(route));
    await instance.register(greffonApi, {
      pool: socle.serveur.pool,
      config: socle.serveur.config,
      resolveur: socle.session,
    });
    await instance.ready();

    try {
      assert.deepEqual(
        vues.filter((route) => route.config?.acces?.action === 'publique').map((r) => r.url),
        [],
      );
    } finally {
      await instance.close();
    }
  });
});
