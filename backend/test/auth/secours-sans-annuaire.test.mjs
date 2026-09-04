/**
 * secours-sans-annuaire.test.mjs — le produit sans annuaire : Q-72 et Q-79.
 *
 * ── Pourquoi ces deux constats vivent dans le même fichier ───────────────────
 *
 * Ils décrivent la **même configuration** — `AUTH_LDAP_ACTIF=non`, une empreinte de
 * compte de secours renseignée — et ils se contredisaient : l'un disait que personne
 * ne pouvait entrer, l'autre que n'importe qui pouvait apprendre par où. Les jouer
 * ensemble est le seul moyen de voir qu'ils sont deux faces d'un même chemin, celui
 * que `deploy/install.sh` accepte en production et dont il annonce lui-même « seul le
 * compte de secours pourra ouvrir une session ».
 *
 * ── Q-72 — le compte de secours était inutilisable dans la situation exacte
 *    pour laquelle il existe ────────────────────────────────────────────────
 *
 * `src/serveur.ts` montait l'authentification réelle si `ldapActif && ldap !== null` :
 * le compte de secours était **ignoré**. Mesuré le 03/09/2026 sur une installation
 * réelle en `NODE_ENV=production`, empreinte valide renseignée : `POST /api/connexion`
 * rendait **404** — la route n'existait pas — et `GET /api/session` **503**. Ce n'était
 * pas « le secours ne secourt rien », c'était **personne ne peut ouvrir le produit**.
 *
 * ⚠️ La garde corrigée vit dans `src/serveur.ts`, **fichier réservé à l'orchestrateur**
 * (constat Q-71). Ce fichier n'y touche pas : il éprouve la **propriété** — le produit
 * s'ouvre sans annuaire — par les deux bouts, le service et le serveur monté par
 * `construireServeur()`, qui est celui que `dist/serveur.js` lance en production.
 *
 * ── Q-79 — le code HTTP révélait l'identifiant du compte de secours ──────────
 *
 * Toujours sans annuaire, `POST /api/connexion` rendait **401** pour le nom du compte
 * de secours et **503** pour tout autre. Six sondes mesurées : `secours` → 401,
 * `SECOURS` → 401 (la comparaison est insensible à la casse), `personne`, `admin`,
 * `root`, `svc-grc` → 503. **Une requête par candidat suffisait** à découvrir
 * l'identifiant que `AUTH_COMPTE_SECOURS_IDENTIFIANT` rend configurable pour qu'il ne
 * soit précisément pas devinable.
 *
 * L'essai décisif n'est donc pas « le code est 401 » : c'est que les deux refus soient
 * **indiscernables**, statut, code d'erreur, message et comportement au rythme
 * compris. Sans le comptage, ils redeviendraient distinguables à la cinquième
 * tentative — l'un se verrouille, l'autre non.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let applicatif;
/** @type {import('pg').Pool} */
let pool;

let auth;
let secours;
let droits;
let configuration;
let empreinte;

const TLS = 'FIL-SSA-TLS';
const IDENTIFIANT_SECOURS = 'brise-glace';
const MOT_DE_PASSE_SECOURS = 'secours-sans-annuaire-2026!';

/** Les noms qu'un attaquant essaierait avant tout autre. */
const CANDIDATS = ['personne', 'admin', 'root', 'svc-grc', 'administrateur', 'secours'];

function journalDEssai() {
  const lignes = [];
  const pousser = (niveau) => (donnees, message) => lignes.push({ niveau, donnees, message });
  return { lignes, error: pousser('error'), warn: pousser('warn'), info: pousser('info') };
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');

  auth = await moduleCompile('auth/index.js');
  secours = await moduleCompile('auth/secours.js');
  droits = await moduleCompile('droits/index.js');
  configuration = await moduleCompile('config/index.js');
  empreinte = await secours.engendrerEmpreinte(MOT_DE_PASSE_SECOURS);

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
      await c.query(`insert into filiales (id, code, raison_sociale) values ($1, 'TLS', 'Dedienne Toulouse')`, [TLS]);
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
  await base?.fermer();
});

/**
 * Une configuration SANS annuaire, avec le compte de secours — la configuration
 * exacte des deux constats.
 */
function configSansAnnuaire(supplement = {}) {
  return configuration.chargerConfiguration({
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
    AUTH_LDAP_ACTIF: 'non',
    AUTH_COMPTE_SECOURS_IDENTIFIANT: IDENTIFIANT_SECOURS,
    AUTH_COMPTE_SECOURS_EMPREINTE: empreinte,
    AUTH_MAX_TENTATIVES: '50',
    SERVEUR_NIVEAU_JOURNAL: 'silent',
    ...supplement,
  });
}

/** Ce qu'un refus rend au client, et rien d'autre : c'est ce qui doit être identique. */
async function refusDe(service, identifiant, motDePasse, adresseIp) {
  try {
    await service.connecter({ identifiant, motDePasse, adresseIp, agentUtilisateur: null });
    return { ouvert: true };
  } catch (erreur) {
    return {
      ouvert: false,
      statut: erreur.statut,
      code: erreur.code,
      message: erreur.message,
      // Jamais comparé entre deux chemins : c'est ce que l'EXPLOITANT lit, et il a
      // le droit d'y trouver la vraie cause. C'est même le second reproche de Q-79.
      detailJournal: erreur.detailJournal,
    };
  }
}

describe('Q-72 — sans annuaire, le produit s’ouvre quand même', () => {
  test('le service se construit, sans annuaire, et le DIT', () => {
    const config = configSansAnnuaire();
    assert.equal(config.auth.ldapActif, false);
    assert.equal(config.auth.ldap, null);
    assert.notEqual(config.auth.compteSecours, null);

    const service = new auth.ServiceAuthentification(pool, config, journalDEssai());
    assert.match(
      service.decrire(),
      /compte de secours/,
      'Le service doit annoncer le moyen qui lui reste. C’est ce que le journal de ' +
        'démarrage montre à l’exploitant, et c’est ce qui manquait.',
    );
    assert.doesNotMatch(service.decrire(), /annuaire ldap/i);
  });

  test('le compte de secours ouvre une session d’administration Groupe', async () => {
    const service = new auth.ServiceAuthentification(pool, configSansAnnuaire(), journalDEssai());
    const resultat = await service.connecter({
      identifiant: IDENTIFIANT_SECOURS,
      motDePasse: MOT_DE_PASSE_SECOURS,
      adresseIp: '10.9.0.1',
      agentUtilisateur: null,
    });

    assert.ok(resultat.jeton.length > 20, 'un jeton de session est rendu');
    assert.equal(resultat.session.perimetre.administrationGroupe, true);

    // ── Constat Q-70, vu depuis la couche qui APPLIQUE ────────────────────
    //
    // `administrationGroupe` était calculé deux fois : par le résolveur, et par
    // `perimetreDe()` qui reconstruisait un périmètre champ par champ pour la requête.
    // Le périmètre appliqué doit être le MÊME OBJET, pas un objet égal : deux objets
    // égaux aujourd'hui sont deux objets qui peuvent diverger demain, et sur ce
    // drapeau-là une divergence est un accès Groupe accordé par le hasard de la couche
    // qu'on interroge.
    assert.equal(resultat.session.perimetre, resultat.resolveur.perimetreFige);
    assert.equal(resultat.resolveur.compteSecours, true);
    assert.equal(resultat.session.droits.niveau, 'administration');
  });

  test('la garde de montage : `construireServeur` monte bien POST /api/connexion', async () => {
    // ⚠️ C'est la mesure du 03/09 rejouée : la route rendait **404**, « Aucune
    // ressource ne répond ». Le défaut n'était pas dans le service — il tenait —
    // mais dans la garde qui refusait de le construire. On passe donc par
    // `construireServeur()`, celui que `dist/serveur.js` lance, et non par le
    // service directement : le défaut vivait ENTRE les deux.
    const serveur = await monterServeurReel(base, {
      authentification: 'reelle',
      environnement: 'production',
      env: {
        AUTH_LDAP_ACTIF: 'non',
        AUTH_COMPTE_SECOURS_IDENTIFIANT: IDENTIFIANT_SECOURS,
        AUTH_COMPTE_SECOURS_EMPREINTE: empreinte,
      },
    });
    try {
      const mauvais = await serveur.appeler('POST', '/api/connexion', {
        corps: { identifiant: IDENTIFIANT_SECOURS, motDePasse: 'ce-n-est-pas-le-bon' },
        entetes: { 'content-type': 'application/json' },
      });
      assert.notEqual(
        mauvais.statut,
        404,
        'La route de connexion n’existe pas : le produit ne peut être ouvert par personne. ' +
          'C’est le constat Q-72, et c’était un bloquant.',
      );
      assert.equal(mauvais.statut, 401);

      const bon = await serveur.appeler('POST', '/api/connexion', {
        corps: { identifiant: IDENTIFIANT_SECOURS, motDePasse: MOT_DE_PASSE_SECOURS },
        entetes: { 'content-type': 'application/json' },
      });
      assert.equal(bon.statut, 200, 'Le compte de secours doit ouvrir une session.');
      assert.equal(bon.corps.utilisateur, IDENTIFIANT_SECOURS);
      assert.equal(bon.corps.administration_groupe, true);

      // Et la session ainsi ouverte sert : c'est la moitié que Q-84 avait laissée
      // à 503 après une connexion réussie.
      const cookie = String(bon.entetes['set-cookie']).split(';')[0];
      const session = await serveur.appeler('GET', '/api/session', { entetes: { cookie } });
      assert.equal(session.statut, 200, 'Après connexion, /api/session doit répondre.');
      assert.equal(session.corps.authentification.provisoire, false);
    } finally {
      await serveur.fermer();
    }
  });
});

describe('Q-79 — le code HTTP ne nomme plus le compte de secours', () => {
  test('les six sondes rendent le MÊME refus, à l’octet près', async () => {
    // La mesure du 03/09 : `secours` → 401, tous les autres → 503. Une requête par
    // candidat suffisait à trouver l'identifiant.
    const service = new auth.ServiceAuthentification(pool, configSansAnnuaire(), journalDEssai());
    const observes = [];
    for (const candidat of CANDIDATS) {
      observes.push({
        candidat,
        ...(await refusDe(service, candidat, 'un-mot-de-passe-quelconque', '10.9.1.1')),
      });
    }

    for (const o of observes) {
      assert.equal(o.ouvert, false, `${o.candidat} ne doit pas entrer`);
      assert.equal(
        o.statut,
        401,
        `« ${o.candidat} » rend ${String(o.statut)}. Un 503 sur les seuls noms qui ne sont ` +
          'PAS le compte de secours désigne celui qui l’est.',
      );
      assert.equal(o.code, 'non_authentifie');
    }

    const distincts = new Set(observes.map((o) => `${String(o.statut)}|${o.code}|${o.message}`));
    assert.equal(
      distincts.size,
      1,
      'Les refus doivent être INDISCERNABLES. Observé : ' +
        observes.map((o) => `${o.candidat} → ${String(o.statut)}`).join(', '),
    );
  });

  test('le vrai identifiant, mot de passe faux, rend exactement le même refus', async () => {
    const service = new auth.ServiceAuthentification(pool, configSansAnnuaire(), journalDEssai());
    const vu = (r) => ({ ouvert: r.ouvert, statut: r.statut, code: r.code, message: r.message });
    const inconnu = await refusDe(service, 'personne', 'x'.repeat(20), '10.9.2.1');
    const secoursFaux = await refusDe(service, IDENTIFIANT_SECOURS, 'x'.repeat(20), '10.9.2.1');
    assert.deepEqual(vu(secoursFaux), vu(inconnu));
  });

  test('la casse ne trahit rien non plus', async () => {
    // Mesuré : `SECOURS` rendait 401 comme `secours` — la comparaison est insensible
    // à la casse, et c'est voulu. Ce qui ne l'était pas, c'est que ce 401 tranchait
    // sur les 503 voisins.
    const service = new auth.ServiceAuthentification(pool, configSansAnnuaire(), journalDEssai());
    const vu = (r) => ({ ouvert: r.ouvert, statut: r.statut, code: r.code, message: r.message });
    const majuscules = await refusDe(service, IDENTIFIANT_SECOURS.toUpperCase(), 'faux', '10.9.3.1');
    const inconnu = await refusDe(service, 'PERSONNE', 'faux', '10.9.3.1');
    assert.deepEqual(vu(majuscules), vu(inconnu));
    assert.equal(majuscules.statut, 401);
  });

  test('le refus est aussi identique VU DU RÉSEAU, sur la route réelle', async () => {
    // Le constat a été mesuré sur `POST /api/connexion`, pas sur le service : c'est
    // là que la mesure doit être rejouée. Le contrôle S12 — « les erreurs ne
    // renseignent pas l'attaquant » — se vérifie sur ce que le réseau rend.
    const serveur = await monterServeurReel(base, {
      authentification: 'reelle',
      environnement: 'production',
      env: {
        AUTH_LDAP_ACTIF: 'non',
        AUTH_COMPTE_SECOURS_IDENTIFIANT: IDENTIFIANT_SECOURS,
        AUTH_COMPTE_SECOURS_EMPREINTE: empreinte,
        AUTH_MAX_TENTATIVES: '50',
      },
    });
    try {
      const vues = [];
      for (const candidat of [...CANDIDATS, IDENTIFIANT_SECOURS, IDENTIFIANT_SECOURS.toUpperCase()]) {
        const r = await serveur.appeler('POST', '/api/connexion', {
          corps: { identifiant: candidat, motDePasse: 'mot-de-passe-faux' },
          entetes: { 'content-type': 'application/json' },
        });
        vues.push({ candidat, statut: r.statut, erreur: r.corps?.erreur, message: r.corps?.message });
      }

      const signatures = new Set(
        vues.map((v) => `${String(v.statut)}|${String(v.erreur)}|${String(v.message)}`),
      );
      assert.equal(
        signatures.size,
        1,
        'Sur le réseau, les refus doivent être identiques. Observé : ' +
          vues.map((v) => `${v.candidat} → ${String(v.statut)}`).join(', '),
      );
      assert.equal(vues[0].statut, 401);
      assert.equal(vues[0].erreur, 'non_authentifie');
      assert.doesNotMatch(
        String(vues[0].message),
        /annuaire/i,
        'Le message ne doit plus annoncer une panne d’annuaire : il est délibérément ' +
          'désactivé, et l’exploitant irait chercher un incident réseau qui n’existe pas.',
      );
    } finally {
      await serveur.fermer();
    }
  });

  test('les deux chemins comptent PAREIL au rythme — sinon ils redeviennent distincts', async () => {
    // Sans comptage, l'énumération reviendrait par la porte du verrouillage : marteler
    // le compte de secours finit par le bloquer, marteler un nom inconnu jamais. La
    // différence se lit alors au bout de N tentatives, au lieu de la première.
    const config = configSansAnnuaire({ AUTH_MAX_TENTATIVES: '3', AUTH_DUREE_VERROUILLAGE: '15' });

    const surSecours = new auth.ServiceAuthentification(pool, config, journalDEssai());
    const surInconnu = new auth.ServiceAuthentification(pool, config, journalDEssai());
    const traceSecours = [];
    const traceInconnu = [];
    for (let i = 0; i < 4; i += 1) {
      traceSecours.push(await refusDe(surSecours, IDENTIFIANT_SECOURS, 'faux', '10.9.4.1'));
      traceInconnu.push(await refusDe(surInconnu, 'jamais-vu', 'faux', '10.9.4.2'));
    }

    // Ce que le client voit reste identique tout du long — c'est la propriété.
    assert.deepEqual(
      traceInconnu.map((r) => ({ statut: r.statut, code: r.code, message: r.message })),
      traceSecours.map((r) => ({ statut: r.statut, code: r.code, message: r.message })),
      'Au-delà du seuil, les deux chemins doivent encore rendre la même chose.',
    );

    // Et le compteur a bien mordu des DEUX côtés : le 4ᵉ refus n'est plus « mot de
    // passe » mais « rythme dépassé », et il l'est pour le nom inconnu comme pour le
    // compte de secours. C'est ce que le journal technique montre, et lui seul — le
    // client, lui, ne voit aucune différence.
    assert.match(
      traceInconnu[3].detailJournal,
      /limitation du rythme/,
      'Un login inconnu qui ne compte pas au rythme redevient distinguable au bout de ' +
        'N tentatives : l’un se verrouille, l’autre non.',
    );
    assert.match(traceSecours[3].detailJournal, /limitation du rythme/);
  });

  test('le journal d’audit, lui, dit la VRAIE raison — il n’est lu que par l’exploitant', async () => {
    const service = new auth.ServiceAuthentification(pool, configSansAnnuaire(), journalDEssai());
    await refusDe(service, 'un-nom-tout-a-fait-unique-9182', 'faux', '10.9.5.1');

    const lignes = await base.lignes(
      applicatif,
      `select resume, valeurs_apres from journal_audit
        where utilisateur_libelle = 'un-nom-tout-a-fait-unique-9182' order by numero desc limit 1`,
    );
    assert.equal(lignes.length, 1, 'L’échec doit être journalisé, comme tout autre échec.');
    assert.match(
      JSON.stringify(lignes[0].valeurs_apres),
      /AUTH_LDAP_ACTIF/,
      'Le détail technique doit nommer la cause réelle : c’est le second reproche du ' +
        'constat — l’exploitant cherchait une panne réseau qui n’existait pas.',
    );
  });
});
