/**
 * service.test.mjs — la chaîne complète : connexion, session, révocation,
 * déprovisionnement, compte de secours, limitation du rythme.
 *
 * ── Ce qui est éprouvé ici, et qui ne l'est nulle part ailleurs ──────────────
 *
 * Les autres fichiers du lot éprouvent des morceaux : `annuaire.test.mjs` la lecture
 * de l'annuaire, `trois-axes.test.mjs` la traduction des groupes en droits,
 * `substrat-session.test.mjs` la fermeture du substrat. Celui-ci les met bout à bout,
 * contre une **vraie base** et contre l'**annuaire simulé** de l'agent A4 : c'est le
 * seul endroit où l'on voit ce que l'utilisateur voit.
 *
 * Les critères d'acceptation du lot y sont joués littéralement :
 *
 *  · « une appartenance **indirecte** ouvre l'accès » — `dpo`, membre de
 *    `GRC-IMBRIQUE-DPO`, obtient les droits de `GRC-TLS-DPO` ;
 *  · « le retrait du groupe le coupe **et invalide les sessions en cours**, pas
 *    seulement la connexion suivante » — la session ouverte est révoquée **en base**,
 *    et la requête suivante reçoit un refus ;
 *  · « le compte de secours est journalisé à **chaque** usage » — réussi comme refusé.
 *
 * ── Ce qui n'est pas éprouvé ici, et pourquoi ───────────────────────────────
 *
 * Les routes HTTP (`POST`/`DELETE /api/connexion`) sont montées par le point d'entrée,
 * qui appartient à un autre agent : le greffon est écrit, son montage ne l'est pas
 * encore. Ce qui est éprouvé est le **service** que ces routes appellent, et la forme
 * du cookie. C'est écrit dans le rapport d'agent plutôt que passé sous silence.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { COMPTE_SERVICE, BASE_RECHERCHE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let applicatif;
/** @type {import('pg').Pool} */
let pool;
/** @type {Awaited<ReturnType<typeof demarrerAnnuaire>>} */
let doublure;

let auth;
let secours;
let droits;
let config;
let journalCapture;

const TLS = 'FIL-SV-TLS';
const DEU = 'FIL-SV-DEU';
const MOT_DE_PASSE_SECOURS = 'secours-de-banc-2026!';

/** Journal minimal qui retient ce qu'on lui dit : les avertissements comptent. */
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
  secours = await moduleCompile('auth/secours.js');
  droits = await moduleCompile('droits/index.js');
  const greffon = await moduleCompile('auth/greffon.js');
  const configuration = await moduleCompile('config/index.js');

  config = configuration.chargerConfiguration({
    NODE_ENV: 'developpement',
    SERVEUR_PORT: '3999',
    BASE_HOTE: process.env.BASE_HOTE ?? '127.0.0.1',
    BASE_PORT: process.env.BASE_PORT ?? '5432',
    BASE_NOM: base.nom,
    BASE_UTILISATEUR: 'grc_app',
    BASE_MOT_DE_PASSE: 'dev',
    BASE_SSL: 'desactive',
    SESSION_SECRET: 'secret-de-banc-d-essai-sans-valeur-aucune-0123456789',
    SESSION_DUREE_INACTIVITE: '30',
    SESSION_DUREE_MAXIMALE: '12',
    SESSION_COOKIE_SECURISE: 'non',
    LDAP_URL: doublure.url,
    LDAP_VERIFIER_CERTIFICAT: 'non',
    LDAP_DN_SERVICE: COMPTE_SERVICE.dn,
    LDAP_MOT_DE_PASSE_SERVICE: COMPTE_SERVICE.motDePasse,
    LDAP_BASE_RECHERCHE: BASE_RECHERCHE,
    AUTH_MAX_TENTATIVES: '3',
    AUTH_DUREE_VERROUILLAGE: '15',
    AUTH_COMPTE_SECOURS_IDENTIFIANT: 'secours',
    AUTH_COMPTE_SECOURS_EMPREINTE: await secours.engendrerEmpreinte(MOT_DE_PASSE_SECOURS),
    SERVEUR_NIVEAU_JOURNAL: 'silent',
  });

  // Exporté pour l'essai du cookie : le greffon est monté par le point d'entrée,
  // mais la forme du cookie est décidée ici.
  globalThis.__greffon = greffon;

  pool = new pg.Pool({
    host: config.base.hote,
    port: config.base.port,
    database: base.nom,
    user: 'grc_app',
    password: 'dev',
    max: 5,
  });

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale) values
             ($1, 'TLS', 'Dedienne Toulouse'), ($2, 'DEU', 'Dedienne Deutschland')`,
        [TLS, DEU],
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
});

after(async () => {
  await pool?.end();
  await doublure?.fermer();
  await base?.fermer();
});

/** Un service d'authentification neuf, pour ne pas partager les compteurs. */
function service(options = {}) {
  journalCapture = journalDEssai();
  return new auth.ServiceAuthentification(pool, config, journalCapture, options);
}

/** Une requête Fastify minimale : en-têtes et adresse, rien d'autre. */
const requete = (cookie, ip = '10.0.0.1') => ({
  headers: cookie === null ? {} : { cookie: `${config.session.nomCookie}=${cookie}` },
  ip,
});

/** Les entrées du journal d'audit, les plus récentes d'abord. */
async function journalAudit(limite = 5) {
  return await base.lignes(
    applicatif,
    `select action, resume, utilisateur_libelle, utilisateur_id
       from journal_audit order by numero desc limit $1`,
    [limite],
  );
}

describe('Connexion — les trois axes résolus depuis l’annuaire, jusqu’à la base', () => {
  test('rssi.tls entre : une filiale, ses domaines, aucun droit d’export', async () => {
    const resultat = await service().connecter({
      identifiant: 'rssi.tls',
      motDePasse: 'rssi.tls!2026',
      adresseIp: '10.0.0.1',
      agentUtilisateur: 'Banc/1.0',
    });

    const p = await resultat.resolveur.resoudre();
    assert.deepEqual([...p.filiales], [TLS]);
    assert.equal(p.filialeId, TLS);
    assert.equal(p.perimetreGroupe, false);
    assert.equal(p.administrationGroupe, false);
    assert.equal(p.utilisateurId, 'rssi.tls');

    assert.equal(resultat.session.droits.export, false);
    assert.ok(resultat.session.droits.domaines.includes('conformite'));
    assert.ok(
      !resultat.session.droits.domaines.includes('administration'),
      'Le RSSI ne porte pas les domaines d’administration.',
    );
    assert.equal(resultat.session.sessionOuverte, true);
  });

  test('le compte est PROVISIONNÉ à la première connexion, et retrouvé à la seconde', async () => {
    const avant = await base.valeur(
      applicatif,
      `select count(*)::int from utilisateurs where identifiant = 'contrib.tls'`,
    );
    assert.equal(avant, 0, 'Aucune administration manuelle des comptes (PLAN_SERVEUR §1.5).');

    await service().connecter({
      identifiant: 'contrib.tls',
      motDePasse: 'contrib.tls!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    const apres = await base.lignes(
      applicatif,
      `select identifiant, nom_affichage, email, actif from utilisateurs where identifiant = 'contrib.tls'`,
    );
    assert.equal(apres.length, 1);
    assert.equal(apres[0].nom_affichage, 'Malik Ferrand');
    assert.equal(apres[0].actif, true);

    await service().connecter({
      identifiant: 'contrib.tls',
      motDePasse: 'contrib.tls!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    const compte = await base.valeur(
      applicatif,
      `select count(*)::int from utilisateurs where identifiant = 'contrib.tls'`,
    );
    assert.equal(compte, 1, 'La seconde connexion rafraîchit, elle ne clone pas.');
  });

  test('CRITÈRE DU LOT : une appartenance INDIRECTE ouvre l’accès', async () => {
    // `dpo` n'est membre que de `GRC-IMBRIQUE-DPO`, lui-même membre de `GRC-TLS-DPO`.
    // Sans résolution récursive, ce compte n'a aucun périmètre et la connexion échoue.
    const resultat = await service().connecter({
      identifiant: 'dpo',
      motDePasse: 'dpo!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    const p = await resultat.resolveur.resoudre();
    assert.deepEqual([...p.filiales], [TLS]);
    assert.equal(resultat.resolveur.niveauSur('rgpd'), 'validation');
    assert.equal(resultat.resolveur.niveauSur('cartographie'), 'aucun');
  });

  test('direction : périmètre Groupe, lecture seule, sans export', async () => {
    const resultat = await service().connecter({
      identifiant: 'direction',
      motDePasse: 'direction!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    const p = await resultat.resolveur.resoudre();
    assert.equal(p.perimetreGroupe, true);
    assert.deepEqual([...p.filiales].sort(), [DEU, TLS].sort());
    assert.equal(p.administrationGroupe, false, 'La direction n’administre rien.');
    assert.equal(resultat.session.droits.niveau, 'lecture');
    assert.equal(resultat.session.droits.export, false);
  });

  test('rssi.groupe : périmètre Groupe ET droit d’export (contrôle S7)', async () => {
    const resultat = await service().connecter({
      identifiant: 'rssi.groupe',
      motDePasse: 'rssi.groupe!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    assert.equal(resultat.session.droits.export, true);
    assert.equal((await resultat.resolveur.resoudre()).perimetreGroupe, true);
  });

  test('admin : le SEUL à porter le drapeau d’administration Groupe (E2)', async () => {
    const resultat = await service().connecter({
      identifiant: 'admin',
      motDePasse: 'admin!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    const p = await resultat.resolveur.resoudre();
    assert.equal(p.administrationGroupe, true);
    assert.equal(p.perimetreGroupe, true);
  });

  test('sans.groupe : identifiants VALIDES, aucun accès — et aucune session créée', async () => {
    const avant = await base.valeur(applicatif, 'select count(*)::int from sessions');
    await assert.rejects(
      () =>
        service().connecter({
          identifiant: 'sans.groupe',
          motDePasse: 'sans.groupe!2026',
          adresseIp: null,
          agentUtilisateur: null,
        }),
      (erreur) => erreur.code === 'droit_insuffisant' && erreur.statut === 403,
    );
    const apres = await base.valeur(applicatif, 'select count(*)::int from sessions');
    assert.equal(apres, avant, 'Un compte sans périmètre n’ouvre pas de session.');

    const [entree] = await journalAudit(1);
    assert.equal(entree.action, 'refus_autorisation');
    assert.equal(entree.utilisateur_libelle, 'sans.groupe');
  });
});

describe('La session — vérification, expiration, déconnexion', () => {
  test('le jeton rendu ouvre les requêtes suivantes', async () => {
    const s = service();
    const { jeton } = await s.connecter({
      identifiant: 'rssi.tls',
      motDePasse: 'rssi.tls!2026',
      adresseIp: '10.0.0.1',
      agentUtilisateur: null,
    });

    const appliquee = await s.authentifier(requete(jeton));
    assert.equal(appliquee.perimetre.utilisateurId, 'rssi.tls');
    assert.deepEqual([...appliquee.perimetre.filiales], [TLS]);
    assert.notEqual(appliquee.sessionOuverte, true, 'Seule la connexion « ouvre » la session.');
  });

  test('sans cookie, la requête est refusée par un 401 — et il ne dit rien de plus', async () => {
    const s = service();
    await assert.rejects(
      () => s.authentifier(requete(null)),
      (erreur) => erreur.code === 'non_authentifie' && erreur.statut === 401,
    );
  });

  test('un jeton INVENTÉ ne trouve rien, et ne le dit pas autrement', async () => {
    const s = service();
    await assert.rejects(
      () => s.authentifier(requete('jeton-completement-invente')),
      (erreur) => erreur.code === 'non_authentifie' && erreur.statut === 401,
    );
  });

  test('la déconnexion RÉVOQUE en base, elle n’oublie pas le cookie', async () => {
    const s = service();
    const { jeton } = await s.connecter({
      identifiant: 'qualite.tls',
      motDePasse: 'qualite.tls!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    await s.authentifier(requete(jeton));

    assert.equal(await s.deconnecter(requete(jeton)), true);

    const revoquee = await base.valeur(
      applicatif,
      `select count(*)::int from sessions s
         join utilisateurs u on u.id = s.utilisateur_id
        where u.identifiant = 'qualite.tls' and s.revoquee_le is not null
          and s.motif_revocation = 'deconnexion'`,
    );
    assert.ok(revoquee >= 1, 'Un jeton dont le serveur a perdu la trace resterait valable.');

    await assert.rejects(
      () => s.authentifier(requete(jeton)),
      (erreur) => erreur.statut === 401,
    );
  });

  test('une session EXPIRÉE est révoquée UNE fois et journalisée UNE fois', async () => {
    const s = service();
    const { jeton } = await s.connecter({
      identifiant: 'rssi.tls',
      motDePasse: 'rssi.tls!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });

    // On vieillit la session par le chemin légitime : la transaction d'ouverture de
    // session est la seule qui puisse écrire ici.
    //
    // C'est l'INACTIVITÉ qu'on avance, et non l'échéance absolue : la contrainte
    // `ck_sessions_expiration` impose `expire_le > cree_le`, si bien qu'une échéance
    // reculée dans le passé est refusée par la base. Elle a raison — une session dont
    // l'échéance précède la création n'a jamais existé — et l'essai a dû changer de
    // levier plutôt que de contourner la contrainte.
    await base.avecPerimetre(
      applicatif,
      perimetre('vieillissement', TLS, [TLS]),
      async (c) => {
        await c.query(`select set_config('grc.authentification', 'oui', true)`);
        const touchees = await c.query(
          `update sessions set derniere_activite = now() - interval '2 hours'
            where jeton_empreinte = $1`,
          [(await moduleCompile('auth/sessions.js')).empreinteJeton(jeton)],
        );
        assert.equal(touchees.rowCount, 1, 'Le vieillissement doit avoir eu lieu.');
      },
      { annuler: false },
    );

    await assert.rejects(() => s.authentifier(requete(jeton)), (e) => e.statut === 401);
    const apresUn = await base.valeur(
      applicatif,
      `select count(*)::int from journal_audit where action = 'session_expiree'`,
    );

    // Rejouée : le jeton mort ne doit pas écrire une entrée par requête dans un
    // journal scellé de trois ans.
    await assert.rejects(() => s.authentifier(requete(jeton)), (e) => e.statut === 401);
    const apresDeux = await base.valeur(
      applicatif,
      `select count(*)::int from journal_audit where action = 'session_expiree'`,
    );
    assert.equal(apresDeux, apresUn, 'Une session ne meurt qu’une fois.');
  });
});

describe('CRITÈRE DU LOT — le retrait d’un groupe invalide les sessions EN COURS', () => {
  test('la session ouverte est révoquée, pas seulement la connexion suivante', async () => {
    // `intervalleRevalidationMs: 0` force la relecture à chaque requête : en
    // production, elle a lieu périodiquement (voir `src/auth/index.ts`).
    const s = service({ intervalleRevalidationMs: 0 });
    const { jeton } = await s.connecter({
      identifiant: 'contrib.tls',
      motDePasse: 'contrib.tls!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });

    // La session fonctionne.
    const avant = await s.authentifier(requete(jeton));
    assert.deepEqual([...avant.perimetre.filiales], [TLS]);

    // L'AD retire le groupe, PENDANT que la session vit.
    doublure.retirerDuGroupe('contrib.tls', 'GRC-TLS-CONTRIB');
    try {
      await assert.rejects(
        () => s.authentifier(requete(jeton)),
        (erreur) => erreur.statut === 401,
        'C’est la moitié qui coûte : « invalide les sessions actives » (PLAN_SERVEUR §1.5).',
      );

      // Et la révocation est EN BASE, pas seulement en mémoire.
      const etat = await base.lignes(
        applicatif,
        `select u.actif, s.revoquee_le is not null as revoquee, s.motif_revocation
           from sessions s join utilisateurs u on u.id = s.utilisateur_id
          where u.identifiant = 'contrib.tls' order by s.cree_le desc limit 1`,
      );
      assert.equal(etat[0].actif, false, 'Le compte est désactivé, pas seulement la session.');
      assert.equal(etat[0].revoquee, true);
      assert.match(etat[0].motif_revocation, /retrait des groupes/);

      const [entree] = await journalAudit(1);
      assert.equal(entree.action, 'session_revoquee');
      assert.match(entree.resume, /Déprovisionnement immédiat/);
    } finally {
      doublure.remettreDansGroupe('contrib.tls', 'GRC-TLS-CONTRIB');
    }
  });

  test('un compte DÉSACTIVÉ dans l’AD perd sa session en cours', async () => {
    const s = service({ intervalleRevalidationMs: 0 });
    const { jeton } = await s.connecter({
      identifiant: 'rssi.groupe',
      motDePasse: 'rssi.groupe!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });
    await s.authentifier(requete(jeton));

    doublure.desactiver('rssi.groupe');
    try {
      await assert.rejects(() => s.authentifier(requete(jeton)), (e) => e.statut === 401);
      const motif = await base.valeur(
        applicatif,
        `select s.motif_revocation from sessions s join utilisateurs u on u.id = s.utilisateur_id
          where u.identifiant = 'rssi.groupe' order by s.cree_le desc limit 1`,
      );
      assert.match(motif, /désactivé dans l’annuaire/);
    } finally {
      doublure.reactiver('rssi.groupe');
    }
  });

  test('un annuaire INJOIGNABLE ne déconnecte PAS le groupe entier', async () => {
    // L'asymétrie assumée : fermé à l'entrée, ouvert à la revérification. Faire
    // dépendre les sessions en cours de la disponibilité de l'annuaire ferait d'un
    // redémarrage de contrôleur de domaine une déconnexion générale.
    const s = service({ intervalleRevalidationMs: 0 });
    const { jeton } = await s.connecter({
      identifiant: 'qualite.tls',
      motDePasse: 'qualite.tls!2026',
      adresseIp: null,
      agentUtilisateur: null,
    });

    doublure.definirPanne({ refuserConnexions: true });
    try {
      const survivante = await s.authentifier(requete(jeton));
      assert.equal(survivante.perimetre.utilisateurId, 'qualite.tls');
      assert.ok(
        journalCapture.lignes.some((l) => l.niveau === 'warn' && /annuaire ne répond pas/.test(l.message)),
        'L’écart est journalisé, pas tu.',
      );
    } finally {
      doublure.definirPanne({ refuserConnexions: false });
    }
  });

  test('mais un annuaire injoignable REFUSE d’ouvrir une session neuve', async () => {
    const s = service();
    doublure.definirPanne({ refuserConnexions: true });
    try {
      await assert.rejects(
        () =>
          s.connecter({
            identifiant: 'rssi.tls',
            motDePasse: 'rssi.tls!2026',
            adresseIp: null,
            agentUtilisateur: null,
          }),
        (erreur) => erreur.code === 'indisponible' && erreur.statut === 503,
      );
    } finally {
      doublure.definirPanne({ refuserConnexions: false });
    }
  });
});

describe('Le compte de secours — journalisé à CHAQUE usage', () => {
  test('il ouvre une session d’administration Groupe, hors annuaire', async () => {
    const resultat = await service().connecter({
      identifiant: 'secours',
      motDePasse: MOT_DE_PASSE_SECOURS,
      adresseIp: '10.0.0.9',
      agentUtilisateur: null,
    });
    const p = await resultat.resolveur.resoudre();
    assert.equal(p.administrationGroupe, true);
    assert.equal(resultat.resolveur.compteSecours, true);

    const [entree] = await journalAudit(1);
    assert.equal(entree.action, 'connexion_reussie');
    assert.match(entree.resume, /COMPTE DE SECOURS/);
    assert.notEqual(entree.utilisateur_id, null, 'La trace est imputée au compte.');
  });

  test('un mot de passe faux sur le compte de secours est journalisé AUSSI', async () => {
    const s = service();
    await assert.rejects(
      () =>
        s.connecter({
          identifiant: 'secours',
          motDePasse: 'ce-n-est-pas-le-bon',
          adresseIp: '10.0.0.9',
          agentUtilisateur: null,
        }),
      (erreur) => erreur.statut === 401,
    );
    const [entree] = await journalAudit(1);
    assert.equal(entree.action, 'connexion_echouee');
    assert.match(entree.resume, /COMPTE DE SECOURS/);
  });

  test('l’empreinte scrypt refuse ce qui n’est pas le mot de passe, et rien d’autre', async () => {
    const empreinte = await secours.engendrerEmpreinte('un-mot-de-passe-assez-long');
    assert.equal(await secours.verifierEmpreinte('un-mot-de-passe-assez-long', empreinte), true);
    assert.equal(await secours.verifierEmpreinte('un-mot-de-passe-assez-lonh', empreinte), false);
    assert.equal(await secours.verifierEmpreinte('', empreinte), false);
    // Une empreinte mal formée REFUSE, elle ne lève pas : le comportement sûr est de
    // refuser, pas de laisser une exception se confondre avec une panne.
    assert.equal(await secours.verifierEmpreinte('x', 'pas-une-empreinte'), false);
    assert.equal(await secours.verifierEmpreinte('x', 'scrypt$99$8$1$AAAA$AAAA'), false);
  });

  test('un mot de passe de secours trop court est REFUSÉ à l’engendrement', async () => {
    await assert.rejects(() => secours.engendrerEmpreinte('court'), /trop court/);
  });
});

describe('Limitation du rythme et verrouillage (contrôle S11)', () => {
  test('le martèlement finit par être écarté, et le verrouillage est EN BASE', async () => {
    const s = service();
    for (let essai = 0; essai < config.auth.maxTentatives; essai += 1) {
      await assert.rejects(
        () =>
          s.connecter({
            identifiant: 'rssi.tls',
            motDePasse: 'faux',
            adresseIp: '10.0.0.66',
            agentUtilisateur: null,
          }),
        (erreur) => erreur.statut === 401,
      );
    }

    const verrouille = await base.valeur(
      applicatif,
      `select verrouille_jusqu_a is not null and verrouille_jusqu_a > now()
         from utilisateurs where identifiant = 'rssi.tls'`,
    );
    assert.equal(verrouille, true, 'Le verrouillage survit au redémarrage du service.');

    // Et le BON mot de passe est refusé tant que le verrou tient : c'est ce qui rend
    // le verrouillage effectif plutôt que décoratif.
    await assert.rejects(
      () =>
        s.connecter({
          identifiant: 'rssi.tls',
          motDePasse: 'rssi.tls!2026',
          adresseIp: '10.0.0.66',
          agentUtilisateur: null,
        }),
      (erreur) => erreur.statut === 401,
    );
  });

  test('un 503 ne verrouille PERSONNE — une panne n’est pas une tentative', async () => {
    const s = service();
    doublure.definirPanne({ refuserConnexions: true });
    try {
      for (let essai = 0; essai < 6; essai += 1) {
        await assert.rejects(
          () =>
            s.connecter({
              identifiant: 'direction',
              motDePasse: 'direction!2026',
              adresseIp: '10.0.0.77',
              agentUtilisateur: null,
            }),
          (erreur) => erreur.statut === 503,
        );
      }
    } finally {
      doublure.definirPanne({ refuserConnexions: false });
    }

    const verrouille = await base.valeur(
      applicatif,
      `select coalesce(verrouille_jusqu_a > now(), false) from utilisateurs where identifiant = 'direction'`,
    );
    assert.equal(
      verrouille,
      false,
      'Verrouiller sur une panne transformerait un incident d’exploitation en blocage général.',
    );

    // Et le compte se reconnecte immédiatement, la panne levée.
    const reprise = await s.connecter({
      identifiant: 'direction',
      motDePasse: 'direction!2026',
      adresseIp: '10.0.0.77',
      agentUtilisateur: null,
    });
    assert.equal((await reprise.resolveur.resoudre()).perimetreGroupe, true);
  });

  test('le compteur en mémoire distingue l’identifiant de l’adresse', async () => {
    const tentatives = await moduleCompile('auth/tentatives.js');
    let horloge = 1_000_000;
    const limiteur = new tentatives.LimiteurTentatives(
      { maxTentatives: 3, dureeVerrouillageMinutes: 5, facteurAdresse: 4 },
      () => horloge,
    );

    assert.equal(limiteur.verifier('bob', '10.0.0.1').bloque, false);
    for (let i = 0; i < 3; i += 1) limiteur.echec('bob', '10.0.0.1');
    assert.equal(limiteur.verifier('bob', '10.0.0.1').bloque, true, 'Trois échecs : écarté.');
    assert.equal(
      limiteur.verifier('alice', '10.0.0.1').bloque,
      false,
      'Une adresse porte plusieurs personnes : un poste partagé ne bloque pas l’étage.',
    );

    // Le verrou expire, il ne dure pas éternellement.
    horloge += 5 * 60_000 + 1;
    assert.equal(limiteur.verifier('bob', '10.0.0.1').bloque, false);

    // Un succès efface les deux compteurs.
    for (let i = 0; i < 2; i += 1) limiteur.echec('carl', '10.0.0.2');
    limiteur.succes('carl', '10.0.0.2');
    for (let i = 0; i < 2; i += 1) limiteur.echec('carl', '10.0.0.2');
    assert.equal(limiteur.verifier('carl', '10.0.0.2').bloque, false);
  });
});

describe('Le cookie de session — la forme fixée au CONVENTIONS.md §26.2', () => {
  test('HttpOnly, SameSite=Strict, Path=/, et AUCUNE échéance côté client', () => {
    const greffon = globalThis.__greffon;
    const entete = greffon.cookieDeSession(config, 'jeton-de-banc');

    assert.match(entete, /^grc_session=jeton-de-banc;/);
    assert.match(entete, /HttpOnly/);
    assert.match(entete, /SameSite=Strict/);
    assert.match(entete, /Path=\//);
    assert.doesNotMatch(
      entete,
      /Max-Age|Expires/,
      'Un cookie qui porte sa propre échéance est une échéance que le client peut mentir.',
    );
  });

  test('Secure suit SESSION_COOKIE_SECURISE, dans les deux sens', () => {
    const greffon = globalThis.__greffon;
    assert.doesNotMatch(greffon.cookieDeSession(config, 'x'), /Secure/);
    const durci = { ...config, session: { ...config.session, cookieSecurise: true } };
    assert.match(greffon.cookieDeSession(durci, 'x'), /Secure/);
  });

  test('la lecture du cookie ne se laisse pas tromper par un nom voisin', async () => {
    const module = await moduleCompile('auth/index.js');
    assert.equal(module.lireCookie('grc_session=abc', 'grc_session'), 'abc');
    assert.equal(module.lireCookie('autre=1; grc_session=abc; encore=2', 'grc_session'), 'abc');
    assert.equal(
      module.lireCookie('grc_session_autre=piege', 'grc_session'),
      null,
      'Un préfixe commun ne doit pas être pris pour le cookie de session.',
    );
    assert.equal(module.lireCookie(undefined, 'grc_session'), null);
    assert.equal(module.lireCookie('grc_session=', 'grc_session'), null);
  });
});
