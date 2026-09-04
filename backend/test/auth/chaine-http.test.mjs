/**
 * chaine-http.test.mjs — la chaîne ENTIÈRE, du cookie au refus : Q-84, Q-66, Q-85.
 *
 * ── Ce que ce fichier éprouve et qu'aucun autre ne peut ─────────────────────
 *
 * Les autres essais du lot coupent la chaîne quelque part. `trois-axes` s'arrête aux
 * droits résolus ; `projection-niveaux` s'arrête à la projection ; `service` s'arrête au
 * service. `droits-application` va jusqu'aux routes, mais avec des droits **fabriqués
 * par l'essai** — ce qui est juste pour éprouver la décision, et aveugle au défaut qui
 * l'a précédée : `projeterDroits()` n'émettait pas `niveaux`, et aucun essai à droits
 * fabriqués ne pouvait le voir, puisqu'ils les fabriquaient complets.
 *
 * Ici, rien n'est fabriqué : un mot de passe part sur `POST /api/connexion`, l'annuaire
 * simulé le vérifie, `groupes_ad` traduit les groupes en droits, la projection les
 * réduit au vocabulaire des routes, et une route décide. **Trois constats vivent sur ce
 * trajet, et chacun était invisible depuis les deux bouts** :
 *
 *  · **Q-84** — `/api/session` rendait 503 juste après une connexion réussie, parce que
 *    la route testait le TYPE d'un objet au lieu de ce qui avait produit la session.
 *    Connexion 200, `/api/donnees` 200, `/api/session` **503** — et c'est la première
 *    route que la SPA appelle, donc le produit était inutilisable au navigateur alors
 *    que toute la chaîne fonctionnait.
 *  · **Q-66** — le sur-octroi par domaine, mesuré contre un Active Directory réel :
 *    `qualite.tls` obtenait `niveau = contribution` sur douze domaines quand la base ne
 *    lui accorde que la lecture sur la conformité.
 *  · **Q-85** — après connexion réelle, le bandeau « Périmètre » affichait
 *    `FIL-1788477623975-…` au lieu du nom de la filiale.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let applicatif;
/** @type {import('pg').Pool} */
let pool;
/** @type {Awaited<ReturnType<typeof demarrerAnnuaire>>} */
let doublure;
/** @type {Awaited<ReturnType<typeof monterServeurReel>>} */
let serveur;

let auth;
let droits;
let configuration;

const TLS = 'FIL-CH-TLS';
const DEU = 'FIL-CH-DEU';
const RAISON_SOCIALE_TLS = 'Dedienne Aerospace Toulouse';

const QUALITE = { identifiant: 'qualite.tls', motDePasse: 'qualite.tls!2026' };
const RSSI = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };

function journalDEssai() {
  const lignes = [];
  const pousser = (niveau) => (donnees, message) => lignes.push({ niveau, donnees, message });
  return { lignes, error: pousser('error'), warn: pousser('warn'), info: pousser('info') };
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  doublure = await demarrerAnnuaire();

  auth = await moduleCompile('auth/index.js');
  droits = await moduleCompile('droits/index.js');
  configuration = await moduleCompile('config/index.js');

  pool = new pg.Pool({
    host: process.env.BASE_HOTE ?? '127.0.0.1',
    port: Number(process.env.BASE_PORT ?? '5432'),
    database: base.nom,
    user: process.env.BASE_UTILISATEUR ?? 'grc_app',
    password: process.env.BASE_MOT_DE_PASSE ?? 'dev',
    max: 5,
  });

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale) values ($1, 'TLS', $3), ($2, 'DEU', 'Dedienne Deutschland')`,
        [TLS, DEU, RAISON_SOCIALE_TLS],
      );
      const attendus = droits.groupesAttendus(
        'GRC-',
        await droits.lireFilialesActives(c),
        await droits.lireProfilsActifs(c),
      );
      await droits.synchroniserGroupesAd(c, attendus);
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, {
    authentification: 'reelle',
    env: {
      LDAP_URL: doublure.url,
      LDAP_VERIFIER_CERTIFICAT: 'non',
      LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
      LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
      LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
    },
  });
});

after(async () => {
  await serveur?.fermer();
  await pool?.end();
  await doublure?.fermer();
  await base?.fermer();
});

/** Ouvre une session par la vraie route, et rend le cookie et la charte. */
async function connecter(compte) {
  const reponse = await serveur.appeler('POST', '/api/connexion', {
    corps: compte,
    entetes: { 'content-type': 'application/json' },
  });
  assert.equal(reponse.statut, 200, `connexion refusée : ${JSON.stringify(reponse.corps)}`);
  const cookie = String(reponse.entetes['set-cookie']).split(';')[0];
  return { cookie, charte: reponse.corps, brut: reponse };
}

const avec = (cookie, options = {}) => ({
  ...options,
  entetes: { cookie, 'content-type': 'application/json', ...(options.entetes ?? {}) },
});

describe('Q-84 — après une connexion réussie, la session se lit', () => {
  test('`GET /api/session` rend 200, et non 503', async () => {
    const { cookie } = await connecter(RSSI);
    const session = await serveur.appeler('GET', '/api/session', avec(cookie));
    assert.equal(
      session.statut,
      200,
      'C’est la PREMIÈRE route que la SPA appelle au démarrage. Un 503 ici affiche ' +
        '« Serveur indisponible — l’authentification n’est pas encore installée » à ' +
        'quelqu’un qui vient de s’authentifier.',
    );
    assert.equal(session.corps.authentification.provisoire, false);
    assert.equal(session.corps.utilisateur, RSSI.identifiant);
  });

  test('les trois routes du démarrage répondent, dans l’ordre où la SPA les appelle', async () => {
    const { cookie } = await connecter(RSSI);
    for (const route of ['/api/session', '/api/modele', '/api/donnees']) {
      const r = await serveur.appeler('GET', route, avec(cookie));
      assert.equal(r.statut, 200, `${route} → ${String(r.statut)}`);
    }
  });

  test('`POST /api/connexion` rend EXACTEMENT la charge de `GET /api/session`', async () => {
    // `CONVENTIONS.md` §26.2, « à l'octet près » : le navigateur n'a alors qu'une seule
    // forme à savoir lire, et « je viens de me connecter » ne diverge jamais de « je
    // rouvre l'onglet ». C'est aussi ce qui rend Q-85 réparable d'un seul geste — une
    // charte enrichie d'un seul côté ferait diverger les deux.
    const { cookie, charte } = await connecter(QUALITE);
    const session = await serveur.appeler('GET', '/api/session', avec(cookie));
    assert.deepEqual(session.corps, charte);
  });
});

describe('Q-66 — le sur-octroi par domaine, vu de bout en bout', () => {
  test('la charte rendue au navigateur porte un niveau PAR DOMAINE', async () => {
    const { charte } = await connecter(QUALITE);
    assert.notEqual(
      charte.droits.niveaux,
      undefined,
      'Sans `niveaux`, l’interface ne peut que se fier au niveau global — et le serveur ' +
        'aussi. C’est le constat Q-66.',
    );
    assert.equal(charte.droits.niveaux.conformite, 'lecture');
    assert.equal(charte.droits.niveaux.audits, 'contribution');
    assert.equal(charte.droits.niveau, 'contribution');
  });

  test('CRITÈRE DU LOT : dans la MÊME session, audits accepté, conformité refusée', async () => {
    const { cookie } = await connecter(QUALITE);

    const audit = await serveur.appeler(
      'POST',
      '/api/entites/audits',
      avec(cookie, { corps: { champs: { reference: 'AUDIT-CH-1' } } }),
    );
    assert.equal(audit.statut, 201, JSON.stringify(audit.corps));

    const exigence = await serveur.appeler(
      'POST',
      '/api/entites/exigences',
      avec(cookie, { corps: { champs: { code: 'CH-QUAL-1', intitule: 'Écrite par la qualité' } } }),
    );
    assert.equal(
      exigence.statut,
      403,
      'Le profil Qualité vient d’ÉCRIRE sur « conformite », que la base lui donne en ' +
        'lecture seule. C’est le constat Q-66, et il est bloquant.',
    );
    assert.equal(exigence.corps.erreur, 'droit_insuffisant');
    // Le refus ne nomme ni le domaine, ni le niveau requis (§26.2, contrôle S12).
    assert.doesNotMatch(String(exigence.corps.message), /conformite|lecture|contribution/);
  });

  test('et RIEN n’a été écrit : le refus n’est pas un affichage', async () => {
    const n = await base.avecPerimetre(applicatif, perimetre('temoin', TLS, [TLS]), async (c) =>
      Number(
        (await c.query(`select count(*)::int as n from exigences where intitule = $1`, ['Écrite par la qualité']))
          .rows[0].n,
      ),
    );
    assert.equal(n, 0);
  });

  test('CONTRE-ÉPREUVE : le RSSI, lui, écrit sur la conformité', async () => {
    // Sans cette moitié, l'essai précédent serait satisfait par un serveur qui refuse
    // tout. Un garde-fou se vérifie dans les deux sens (`CONVENTIONS.md` §20.2).
    const { cookie } = await connecter(RSSI);
    const exigence = await serveur.appeler(
      'POST',
      '/api/entites/exigences',
      avec(cookie, { corps: { champs: { code: 'CH-RSSI-1', intitule: 'Écrite par le RSSI' } } }),
    );
    assert.equal(exigence.statut, 201, JSON.stringify(exigence.corps));
  });

  test('la LECTURE de la conformité reste ouverte au profil Qualité', async () => {
    const { cookie } = await connecter(QUALITE);
    const donnees = await serveur.appeler('GET', '/api/donnees', avec(cookie));
    assert.equal(donnees.statut, 200);
    assert.ok(Array.isArray(donnees.corps.data.exigences), 'la conformité se lit');
  });
});

describe('Q-85 — la session porte le NOM de sa filiale, pas seulement son identifiant', () => {
  test('à l’ouverture de session, le code et la raison sociale sont là', async () => {
    const config = configuration.chargerConfiguration({
      NODE_ENV: 'developpement',
      SERVEUR_PORT: '3999',
      BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
      BASE_PORT: process.env.BASE_PORT ?? '5432',
      BASE_NOM: base.nom,
      BASE_UTILISATEUR: process.env.BASE_UTILISATEUR ?? 'grc_app',
      BASE_MOT_DE_PASSE: process.env.BASE_MOT_DE_PASSE ?? 'dev',
      BASE_SSL: 'desactive',
      SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
      SESSION_COOKIE_SECURISE: 'non',
      LDAP_URL: doublure.url,
      LDAP_VERIFIER_CERTIFICAT: 'non',
      LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
      LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
      LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
      SERVEUR_NIVEAU_JOURNAL: 'silent',
    });
    const service = new auth.ServiceAuthentification(pool, config, journalDEssai());
    const resultat = await service.connecter({
      identifiant: RSSI.identifiant,
      motDePasse: RSSI.motDePasse,
      adresseIp: '10.8.0.1',
      agentUtilisateur: null,
    });

    // ⚠️ C'est CE champ que le bandeau « Périmètre » doit afficher. Sans lui, l'écran
    // montre `FIL-1788477623975-5208b3f525954fffb228d9aa292ec1cf` — et dans un outil
    // qui sert de preuve en audit, l'utilisateur ne sait pas dans quelle filiale il écrit.
    assert.deepEqual(resultat.session.filiale, {
      id: TLS,
      code: 'TLS',
      raisonSociale: RAISON_SOCIALE_TLS,
    });
    assert.deepEqual(resultat.resolveur.filiale(), resultat.session.filiale);

    // Et il tient à la requête SUIVANTE, celle qui présente le cookie : c'est le chemin
    // « je rouvre l'onglet », qui ne passe pas par `connecter()`.
    const requete = { headers: { cookie: `${config.session.nomCookie}=${resultat.jeton}` }, ip: '10.8.0.1' };
    const rouverte = await service.authentifier(requete);
    assert.deepEqual(rouverte.filiale, resultat.session.filiale);
  });

  test('une raison sociale corrigée en base est relue, pas mise en cache', async () => {
    const config = configuration.chargerConfiguration({
      NODE_ENV: 'developpement',
      SERVEUR_PORT: '3999',
      BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
      BASE_PORT: process.env.BASE_PORT ?? '5432',
      BASE_NOM: base.nom,
      BASE_UTILISATEUR: process.env.BASE_UTILISATEUR ?? 'grc_app',
      BASE_MOT_DE_PASSE: process.env.BASE_MOT_DE_PASSE ?? 'dev',
      BASE_SSL: 'desactive',
      SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
      SESSION_COOKIE_SECURISE: 'non',
      LDAP_URL: doublure.url,
      LDAP_VERIFIER_CERTIFICAT: 'non',
      LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
      LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
      LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
      SERVEUR_NIVEAU_JOURNAL: 'silent',
    });
    const service = new auth.ServiceAuthentification(pool, config, journalDEssai(), {
      intervalleRevalidationMs: 10 ** 9,
    });
    const resultat = await service.connecter({
      identifiant: QUALITE.identifiant,
      motDePasse: QUALITE.motDePasse,
      adresseIp: '10.8.0.2',
      agentUtilisateur: null,
    });
    assert.equal(resultat.session.filiale.raisonSociale, RAISON_SOCIALE_TLS);

    const nouvelle = 'Dedienne Aerospace Toulouse SAS';
    await base.avecPerimetre(
      applicatif,
      perimetre('decor', null, [], true),
      async (c) => {
        const { rowCount } = await c.query(`update filiales set raison_sociale = $1 where id = $2`, [
          nouvelle,
          TLS,
        ]);
        assert.equal(rowCount, 1, 'la mise à jour doit toucher une ligne');
      },
      { annuler: false },
    );

    const requete = { headers: { cookie: `${config.session.nomCookie}=${resultat.jeton}` }, ip: '10.8.0.2' };
    const rouverte = await service.authentifier(requete);
    assert.equal(
      rouverte.filiale.raisonSociale,
      nouvelle,
      'Le libellé est joint à la session au moment où elle est vérifiée. Le mémoriser ' +
        'ferait afficher l’ancienne raison sociale jusqu’à la déconnexion.',
    );

    // On remet la base dans l'état où les autres essais l'attendent.
    await base.avecPerimetre(
      applicatif,
      perimetre('decor', null, [], true),
      async (c) => c.query(`update filiales set raison_sociale = $1 where id = $2`, [RAISON_SOCIALE_TLS, TLS]),
      { annuler: false },
    );
  });
});
