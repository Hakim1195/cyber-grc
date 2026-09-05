/**
 * approbations.test.mjs — l'écran du circuit d'approbation (lot L8).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Ce que cet écran doit prouver, et à qui
 * ══════════════════════════════════════════════════════════════════════════
 *
 * *« Qui a validé cette politique ? »* est la question qu'un auditeur ISO 27001
 * pose systématiquement. Le lot L8 y répond, et cet essai mesure les quatre
 * propriétés sur lesquelles la réponse tient ou s'effondre :
 *
 *  1. **une décision avance le circuit** — un profil de niveau `validation`
 *     approuve, et l'étape suivante devient l'étape attendue ;
 *  2. **l'interface reflète le droit, et LE SERVEUR le tient** — un profil qui
 *     ne valide pas ne voit pas le bouton, *et* la requête émise malgré tout
 *     depuis la page reçoit 403 ;
 *  3. **une approbation vaut pour une VERSION** — modifier l'objet après coup
 *     fait apparaître l'avertissement de péremption, en tête d'écran ;
 *  4. **une décision hors séquence rend 409**, et l'écran dit de recharger.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  L'INTERFACE N'EST PAS LA BARRIÈRE — constat Q-116, et il est cher
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le constat **Q-116** a été payé sur un essai qui *substituait les droits dans
 * le navigateur* et interrogeait le vrai serveur — lequel, lui, avait tous les
 * domaines. Il mesurait une **substitution**, pas une **barrière**, et il était
 * vert.
 *
 * Cet essai n'a donc **aucune substitution de droits** : il ouvre une session
 * réelle, par le vrai formulaire de connexion, contre l'annuaire du banc, pour
 * deux comptes réellement différents. Ce que le serveur refuse, il le refuse
 * parce que la session **est** celle d'un profil qui n'a pas le niveau.
 *
 * Et la moitié qui manque toujours (§20.2) est ici : constater l'absence d'un
 * bouton ne démontre rien tant qu'on n'a pas constaté sa **présence** pour qui y
 * a droit. Les deux sont mesurés, sur le même objet.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  LE CHOIX DES DEUX COMPTES — mesuré, pas déduit de leur nom
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Le compte qui vient à l'esprit pour « un profil contribution » est
 * `contrib.tls`. **Il aurait fait un essai faux.** Le profil CONTRIB ne porte
 * que `actions`, `incidents`, `actifs` et `mco` : il n'a **aucun** des trois
 * domaines du lot L8. Son 403 serait prononcé pour absence de *domaine*, et
 * l'essai aurait cru mesurer le troisième axe — le *niveau* — en mesurant le
 * deuxième.
 *
 * Le compte qui éprouve vraiment le niveau est **`qualite.tls`** : le profil
 * QUALITE porte `documents` en **contribution**. Il lit donc le circuit, voit
 * tout, et ne peut pas décider — le refus vient du niveau, et de lui seul.
 * C'est nommément le profil du constat **Q-66**.
 *
 * `verifierLesDeuxProfils` le **mesure dans la charge de session** au lieu de le
 * supposer : si l'annuaire ou la projection changeaient, l'essai rougirait en
 * disant pourquoi, au lieu de rester vert en mesurant autre chose.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EXIGENCE DE MATIÈRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * *Un essai vert qui n'a rien eu à mesurer rend le même verdict qu'un essai vert
 * qui a tout mesuré.* Chaque essai ci-dessous vérifie donc d'abord qu'il **avait
 * quelque chose à compter** : un circuit non vide, un bouton réellement présent
 * pour l'autre compte, une empreinte réellement changée.
 *
 * Prérequis machine : PostgreSQL prêt ; Playwright + Chromium (`CLAUDE.md` §5) ;
 * sur SRV-Infra, `source ~/.grc-essais.env` avant `npm test`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { BASE_RECHERCHE, COMPTE_SERVICE } from '../annuaire/comptes.mjs';
import { demarrerAnnuaire } from '../annuaire/serveur-ldap.mjs';

/** Même borne que les autres familles de navigateur : plusieurs Chromium en parallèle. */
const DELAI = 60_000;

const TLS = 'FIL-APPRO-TLS';
const DEU = 'FIL-APPRO-DEU';

/** Le validateur : profil RSSI, niveau `validation` sur les trois domaines du lot. */
const VALIDEUR = { identifiant: 'rssi.tls', motDePasse: 'rssi.tls!2026' };
/** Le contributeur : profil QUALITE, `documents` en contribution. Voir l'entête. */
const CONTRIBUTEUR = { identifiant: 'qualite.tls', motDePasse: 'qualite.tls!2026' };

/**
 * Bruit ATTENDU d'un essai d'authentification réelle et de refus volontaires.
 *
 *  · `401` — le « suis-je déjà connecté ? » que `Vault.connecter()` tente avant
 *    d'afficher le formulaire ;
 *  · `403` — les refus que cet essai PROVOQUE (droit de validation, domaine
 *    fermé), plus `GET /api/pieces/logo` pour un profil sans `administration` ;
 *  · `409` — le refus hors séquence, provoqué lui aussi.
 *
 * `CLAUDE.md` §5 : un refus volontaire du serveur n'est pas une erreur. Une
 * exception de script, elle, ne s'accepte jamais — et n'est pas dans cette liste.
 */
const BRUIT_ATTENDU = ['401 (Unauthorized)', '403 (Forbidden)', '409 (Conflict)'];

/** Les objets semés dans la filiale TLS, et approuvables. */
const DOC = 'DOC-APPRO-1';
const DOC2 = 'DOC-APPRO-2';
/** Réservé au §6 : la CSP de production s'éprouve sur un circuit encore ouvert. */
const DOC3 = 'DOC-APPRO-3';
const RISQUE = 'RISK-APPRO-1';
const AUDIT = 'AUD-APPRO-1';

let base;
let doublure;
let serveur;
let application;
let navigateur;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  doublure = await demarrerAnnuaire();
  const droits = await moduleCompile('droits/index.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale, pays) values
             ($1, 'TLS', 'Structures Occitanes SA', 'FR'),
             ($2, 'DEU', 'Nordkraft Systeme GmbH',  'DE')`,
        [TLS, DEU],
      );
      // Groupes AD ENGENDRÉS depuis la configuration, jamais écrits à la main
      // (`PLAN_SERVEUR` §3.4) — même geste que `deploy/` à l'installation.
      await droits.synchroniserGroupesAd(
        c,
        droits.groupesAttendus(
          'GRC-',
          await droits.lireFilialesActives(c),
          await droits.lireProfilsActifs(c),
        ),
      );
      // Le compte de l'annuaire, côté base : `resoudreActeur` le cherche par
      // `identifiant`, et `fk_approbations_acteur` référence `utilisateurs(id)`.
      // Les deux DIFFÈRENT à dessein (§18.3) : un essai qui les confond valide
      // une coïncidence.
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage) values
             ('USER-RSSI-TLS', 'rssi.tls',    'Sarah Nadal'),
             ('USER-QUAL-TLS', 'qualite.tls', 'Inès Baroni')`,
      );
    },
    { annuler: false },
  );

  // Les objets approuvables, dans la filiale TLS.
  await base.avecPerimetre(
    applicatif,
    perimetre('decor', TLS, [TLS], false),
    async (c) => {
      await c.query(
        `insert into documents (id, filiale_id, titre, statut) values
             ($1, $4, 'Politique de sécurité du SI',      'brouillon'),
             ($2, $4, 'Charte informatique',              'brouillon'),
             ($3, $4, 'Procédure de gestion des accès',   'brouillon')`,
        [DOC, DOC2, DOC3, TLS],
      );
      await c.query('insert into risques (id, filiale_id, nom) values ($1, $2, $3)', [
        RISQUE, TLS, 'Rançongiciel sur le poste de production',
      ]);
      await c.query('insert into audits (id, filiale_id, reference) values ($1, $2, $3)', [
        AUDIT, TLS, 'AUDIT-2026-01',
      ]);
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
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await doublure?.fermer();
  await base?.fermer();
});

/* =====================================================================
 *  Outillage
 * ===================================================================== */

/**
 * Ouvre une page et s'authentifie par la VRAIE porte (`#login-form`).
 *
 * `test/aide/navigateur.mjs` transporte `Cookie` et `Set-Cookie` depuis le
 * constat **Q-159** : aucun relais local n'est nécessaire ici, contrairement à
 * ce que l'entête de `identite.test.mjs` décrit — il a été écrit avant.
 */
async function ouvrirEtConnecter(compte) {
  const p = await ouvrirPage(navigateur);
  await p.page.goto(application.url, { waitUntil: 'domcontentloaded' });
  await p.page.waitForSelector('#login-identifiant', { timeout: DELAI });
  await p.page.fill('#login-identifiant', compte.identifiant);
  await p.page.fill('#login-motdepasse', compte.motDePasse);
  await p.page.click('#login-btn');
  const etat = await attendreApplication(p.page, { delai: DELAI });
  assert.equal(
    etat,
    'chargee',
    `L'application ne démarre pas après connexion de ${compte.identifiant} : ` +
      JSON.stringify(p.erreursInattendues(BRUIT_ATTENDU)),
  );
  await attendreQuiescence(p.page, { delai: DELAI });
  return p;
}

/** Ouvre la fiche de circuit d'un objet, et attend qu'elle soit peinte. */
async function ouvrirFiche(page, entite, id) {
  await page.evaluate(
    ([e, i]) => ApprobationsModule.ouvrirFiche(e, i),
    [entite, id],
  );
  await page.waitForFunction(
    () => {
      const n = document.getElementById('approbationsFiche');
      return n !== null && n.innerHTML.indexOf('Lecture du circuit') === -1 && n.innerHTML.trim() !== '';
    },
    null,
    { timeout: DELAI },
  );
}

/** L'état du circuit tel que le SERVEUR le rend, lu depuis la page. */
async function circuitDuServeur(page, entite, id) {
  return await page.evaluate(
    ([e, i]) => ApprobationsModule.lireCircuit(e, i),
    [entite, id],
  );
}

/**
 * Émet une décision **depuis la page**, et rend `{ statut, code, message }`.
 *
 * ⚠️ C'est ici que se joue « l'interface n'est pas la barrière » : la requête
 * part du navigateur authentifié, avec son vrai cookie de session, vers le vrai
 * serveur. Aucun droit n'est substitué.
 */
async function deciderDepuisLaPage(page, entite, id, etape, decision) {
  return await page.evaluate(
    async ([e, i, et, d]) => {
      try {
        const charge = await ApprobationsModule.decider(e, i, et, d, 'essai');
        return { statut: 201, code: null, message: null, circuit: charge.circuit };
      } catch (err) {
        return {
          statut: err.statut ?? 0,
          code: err.code ?? null,
          message: err.message ?? null,
          circuit: null,
        };
      }
    },
    [entite, id, etape, decision],
  );
}

/** Le bloc `droits` que le serveur a résolu pour la session de cette page. */
async function droitsDeSession(page) {
  return await page.evaluate(() => {
    const s = window.Session.courante();
    return {
      niveau: s.droits.niveau,
      domaines: [...s.droits.domaines],
      niveaux: JSON.parse(JSON.stringify(s.droits.niveaux)),
    };
  });
}

/* =====================================================================
 *  §0 — La matière : les deux comptes sont-ils vraiment ce qu'on croit ?
 * ===================================================================== */

describe('§0 — les deux profils, mesurés et non déduits de leur nom', () => {
  test('rssi.tls valide les documents ; qualite.tls les lit et contribue, sans valider', async (t) => {
    t.diagnostic('Constat Q-66 : le niveau par domaine, et non le niveau de session.');

    const validateur = await ouvrirEtConnecter(VALIDEUR);
    const contributeur = await ouvrirEtConnecter(CONTRIBUTEUR);
    try {
      const dv = await droitsDeSession(validateur.page);
      const dc = await droitsDeSession(contributeur.page);

      // ── EXIGENCE DE MATIÈRE ────────────────────────────────────────────
      // Sans domaines résolus, tout ce qui suit mesurerait un bloc vide.
      assert.ok(
        dv.domaines.length > 0 && dc.domaines.length > 0,
        'Les deux sessions doivent porter des domaines, sinon rien n’est éprouvé : ' +
          `${JSON.stringify({ dv, dc })}`,
      );

      assert.ok(
        dv.domaines.includes('documents'),
        `rssi.tls doit porter le domaine « documents » : ${JSON.stringify(dv)}`,
      );
      assert.equal(
        dv.niveaux.documents,
        'validation',
        `rssi.tls doit valider les documents, sinon le cas POSITIF est vide : ${JSON.stringify(dv)}`,
      );

      // Le cœur de l'arbitrage : le domaine est OUVERT, le niveau est INSUFFISANT.
      assert.ok(
        dc.domaines.includes('documents'),
        'qualite.tls doit LIRE les documents : sans cela, son 403 viendrait du domaine ' +
          `absent et non du niveau, et l’essai mesurerait le mauvais axe. ${JSON.stringify(dc)}`,
      );
      assert.equal(
        dc.niveaux.documents,
        'contribution',
        'qualite.tls doit être en CONTRIBUTION sur les documents — pas en lecture (il ' +
          'écrirait alors nulle part), pas en validation (il n’y aurait rien à refuser). ' +
          JSON.stringify(dc),
      );

      // Et la démonstration que le nom ne suffit pas : le profil CONTRIB, lui,
      // n'a AUCUN des trois domaines du lot. Écrit ici pour que le prochain
      // lecteur n'aille pas le chercher.
      t.diagnostic(
        `rssi.tls → documents=${dv.niveaux.documents} · qualite.tls → documents=${dc.niveaux.documents}` +
          ` · qualite.tls porte risques ? ${String(dc.domaines.includes('risques'))}`,
      );

      assert.deepEqual(validateur.erreursInattendues(BRUIT_ATTENDU), []);
      assert.deepEqual(contributeur.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await validateur.fermer();
      await contributeur.fermer();
    }
  });
});

/* =====================================================================
 *  §1 — Une décision avance le circuit
 * ===================================================================== */

describe('§1 — approuver fait avancer le circuit', () => {
  test('rssi.tls approuve « rédaction » : « revue » devient l’étape attendue', async (t) => {
    const p = await ouvrirEtConnecter(VALIDEUR);
    try {
      await ouvrirFiche(p.page, 'documents', DOC);

      const avant = await circuitDuServeur(p.page, 'documents', DOC);
      // ── EXIGENCE DE MATIÈRE : un circuit vide n'a rien à faire avancer ──
      assert.ok(
        avant.circuit.etapes.length >= 2,
        `Le circuit du document doit compter au moins deux étapes : ${JSON.stringify(avant.circuit.etapes)}`,
      );
      assert.equal(avant.circuit.etapeAttendue, 'redaction');
      assert.equal(avant.circuit.etat, 'en_cours');

      // Le bouton EST là, et il est cliqué — pas appelé en JavaScript.
      const bouton = p.page.locator('#approbationsApprouver');
      assert.equal(
        await bouton.count(),
        1,
        'Le bouton d’approbation doit être présent pour un profil de niveau validation : ' +
          'sans lui, la moitié négative de l’essai suivant ne prouverait rien.',
      );
      await p.page.fill('#approbationsCommentaire', 'Relu et conforme à la trame groupe.');
      await bouton.click();

      await p.page.waitForSelector('#approbationsMessage', { timeout: DELAI });
      const message = await p.page.locator('#approbationsMessage').innerText();
      assert.match(message, /approuvée/i, `Message inattendu après approbation : ${message}`);

      const apres = await circuitDuServeur(p.page, 'documents', DOC);
      assert.equal(
        apres.circuit.etapeAttendue,
        'revue',
        `Après « rédaction », le circuit doit attendre « revue » : ${JSON.stringify(apres.circuit)}`,
      );
      assert.equal(apres.circuit.cycle, 1, 'La même version reste au TOUR 1 — `ordre` est un tour.');

      const redaction = apres.circuit.etapes.find((e) => e.etape === 'redaction');
      assert.equal(redaction.statut, 'approuve');
      assert.equal(
        redaction.acteur,
        'rssi.tls',
        `La décision doit être attribuée au compte réel : ${JSON.stringify(redaction)}`,
      );
      assert.equal(
        redaction.commentaire,
        'Relu et conforme à la trame groupe.',
        'Le commentaire saisi doit être conservé tel quel.',
      );
      // L'empreinte a été figée sur la version courante : elle correspond encore.
      assert.equal(redaction.correspond, true);

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — L'interface n'est pas la barrière (constat Q-116)
 * ===================================================================== */

describe('§2 — le bouton absent, ET le serveur qui refuse', () => {
  test('qualite.tls ne voit pas le bouton — et sa requête reçoit 403 du serveur', async (t) => {
    t.diagnostic(
      'Aucun droit n’est substitué : la session est réellement celle de qualite.tls.',
    );
    const p = await ouvrirEtConnecter(CONTRIBUTEUR);
    try {
      await ouvrirFiche(p.page, 'documents', DOC2);

      // ── EXIGENCE DE MATIÈRE : il doit y avoir une décision À PRENDRE ────
      // Un circuit clos n'afficherait pas de bouton non plus, et l'essai
      // serait vert sans avoir rien éprouvé.
      const vu = await circuitDuServeur(p.page, 'documents', DOC2);
      assert.equal(
        vu.circuit.etapeAttendue,
        'redaction',
        'Le circuit doit ATTENDRE une étape, sinon l’absence de bouton ne prouve rien : ' +
          JSON.stringify(vu.circuit),
      );

      // 1) L'interface ne propose pas la décision…
      assert.equal(
        await p.page.locator('#approbationsApprouver').count(),
        0,
        'Un profil sans le niveau « validation » ne doit pas voir le bouton d’approbation.',
      );
      assert.equal(
        await p.page.locator('#approbationsSansDroit').count(),
        1,
        'L’écran doit DIRE pourquoi il n’y a pas de bouton, et non se taire.',
      );
      // …et elle ne le dit pas sur le ton d'une panne : pas de `role="alert"`.
      const note = await p.page.locator('#approbationsSansDroit').getAttribute('role');
      assert.equal(
        note,
        null,
        'Un droit manquant n’est pas une erreur : cette note ne doit pas être une alerte.',
      );

      // 2) …et le SERVEUR refuse la même décision, envoyée depuis la page.
      //    C'est la moitié que le constat Q-116 a coûtée.
      const refus = await deciderDepuisLaPage(p.page, 'documents', DOC2, 'redaction', 'approuve');
      assert.equal(
        refus.statut,
        403,
        `Le serveur doit refuser la décision, quoi qu’affiche l’interface : ${JSON.stringify(refus)}`,
      );
      assert.equal(
        refus.code,
        'droit_insuffisant',
        'Le refus doit venir du NIVEAU (droit_insuffisant), et non du périmètre : ' +
          JSON.stringify(refus),
      );

      // 3) Et rien n'a été écrit : le circuit est inchangé.
      const apres = await circuitDuServeur(p.page, 'documents', DOC2);
      assert.equal(apres.circuit.etapeAttendue, 'redaction');
      assert.deepEqual(
        apres.circuit.etapes.filter((e) => e.statut !== 'en_attente'),
        [],
        `Aucune étape ne doit avoir été écrite : ${JSON.stringify(apres.circuit.etapes)}`,
      );

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });

  test('qualite.tls ne porte pas le domaine « risques » : la lecture même est refusée', async (t) => {
    const p = await ouvrirEtConnecter(CONTRIBUTEUR);
    try {
      const refus = await p.page.evaluate(async ([id]) => {
        try {
          await ApprobationsModule.lireCircuit('risques', id);
          return { statut: 200, code: null };
        } catch (err) {
          return { statut: err.statut ?? 0, code: err.code ?? null };
        }
      }, [RISQUE]);
      assert.equal(
        refus.statut,
        403,
        `Le domaine « risques » est fermé à ce profil : la lecture doit être refusée. ${JSON.stringify(refus)}`,
      );
      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Une approbation vaut pour une VERSION
 * ===================================================================== */

describe('§3 — modifier l’objet périme les décisions déjà prises', () => {
  test('après approbation, une modification fait apparaître l’avertissement en tête d’écran', async (t) => {
    const p = await ouvrirEtConnecter(VALIDEUR);
    try {
      // ── Une décision, d'abord : sans elle, il n'y a rien à périmer ──────
      const pose = await deciderDepuisLaPage(p.page, 'audits', AUDIT, 'redaction', 'approuve');
      assert.equal(pose.statut, 201, `L’étape doit être écrite : ${JSON.stringify(pose)}`);

      const avant = await circuitDuServeur(p.page, 'audits', AUDIT);
      const empreinteAvant = avant.objet.empreinte;
      assert.equal(avant.circuit.etat, 'en_cours');
      assert.equal(
        avant.circuit.etapes.find((e) => e.etape === 'redaction').correspond,
        true,
        'Avant modification, la décision doit correspondre au contenu.',
      );

      // ── La modification de l'objet, hors de l'écran d'approbation ───────
      // Écrite en base sous le périmètre de la filiale : `audits` porte
      // `force row level security`, une écriture sans périmètre rendrait GRC04.
      await base.avecPerimetre(
        applicatif,
        perimetre('modificateur', TLS, [TLS], false),
        async (c) => {
          await c.query('update audits set synthese = $2 where id = $1', [
            AUDIT, 'Constats revus après la visite du 12 septembre.',
          ]);
        },
        { annuler: false },
      );

      const apres = await circuitDuServeur(p.page, 'audits', AUDIT);
      // ── EXIGENCE DE MATIÈRE : l'empreinte a-t-elle VRAIMENT changé ? ────
      // Sans ce contrôle, une empreinte figée rendrait l'essai vert en
      // n'ayant rien modifié — et c'est précisément le défaut qu'une liste de
      // colonnes écrite à la main produirait côté serveur.
      assert.notEqual(
        apres.objet.empreinte,
        empreinteAvant,
        'Modifier le contenu doit changer l’empreinte, sinon rien n’est éprouvé.',
      );
      assert.equal(
        apres.circuit.etat,
        'perime',
        `Le circuit doit être périmé : ${JSON.stringify(apres.circuit)}`,
      );
      assert.equal(
        apres.circuit.etapes.find((e) => e.etape === 'redaction').correspond,
        false,
        'La décision prise sur l’ancienne version ne doit plus correspondre.',
      );
      // Le nouveau tour repart du début.
      assert.equal(apres.circuit.etapeAttendue, 'redaction');
      assert.equal(apres.circuit.cycleAttendu, 2, '« Repartir du début » = TOUR suivant.');

      // ── Et l'écran le dit EN PREMIER ────────────────────────────────────
      await ouvrirFiche(p.page, 'audits', AUDIT);
      const alerte = p.page.locator('.apr-peremption');
      assert.equal(await alerte.count(), 1, 'L’avertissement de péremption doit être affiché.');
      const texte = await alerte.innerText();
      assert.match(texte, /modifié/i, `Avertissement inattendu : ${texte}`);

      // « En premier » se mesure : l'avertissement précède le tableau des
      // étapes dans l'ordre du document, il n'est pas relégué en bas de page.
      const enTete = await p.page.evaluate(() => {
        const conteneur = document.getElementById('approbationsFiche');
        const avertissement = conteneur.querySelector('.apr-peremption');
        const tableau = conteneur.querySelector('.apr-table');
        if (!avertissement || !tableau) return null;
        // `DOCUMENT_POSITION_FOLLOWING` = le tableau vient APRÈS l'avertissement.
        return (avertissement.compareDocumentPosition(tableau) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      assert.equal(
        enTete,
        true,
        'L’avertissement de péremption doit précéder le tableau des étapes : c’est la ' +
          'première chose qu’un auditeur doit lire.',
      );

      // L'étape périmée est signalée dans le tableau, pas seulement en tête.
      assert.equal(
        await p.page.locator('.apr-etape--perimee').count(),
        1,
        'L’étape périmée doit être signalée dans le tableau des étapes.',
      );

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — Hors séquence : 409, et l'écran dit de recharger
 * ===================================================================== */

describe('§4 — une décision hors séquence rend 409', () => {
  test('deux onglets, une course réelle : le second reçoit 409 et l’écran propose de recharger', async (t) => {
    t.diagnostic(
      'Pas de 409 fabriqué : le premier onglet franchit l’étape que le second croit encore ouverte.',
    );
    const onglet1 = await ouvrirEtConnecter(VALIDEUR);
    const onglet2 = await ouvrirEtConnecter(VALIDEUR);
    try {
      // Le second onglet affiche la fiche : le circuit du risque attend
      // « proposition », et le bouton porte cette étape.
      await ouvrirFiche(onglet2.page, 'risques', RISQUE);
      const vu = await circuitDuServeur(onglet2.page, 'risques', RISQUE);
      assert.equal(
        vu.circuit.etapeAttendue,
        'proposition',
        `Le circuit du risque doit attendre « proposition » : ${JSON.stringify(vu.circuit)}`,
      );
      assert.equal(
        await onglet2.page.locator('#approbationsApprouver').count(),
        1,
        'Le bouton doit être là : sans lui, il n’y a pas de course à provoquer.',
      );

      // Pendant ce temps, le premier onglet franchit l'étape.
      const pose = await deciderDepuisLaPage(onglet1.page, 'risques', RISQUE, 'proposition', 'approuve');
      assert.equal(pose.statut, 201, `L’étape doit être écrite : ${JSON.stringify(pose)}`);
      assert.equal(pose.circuit.etapeAttendue, 'acceptation');

      // Le second onglet clique sur un bouton devenu obsolète.
      await onglet2.page.fill('#approbationsCommentaire', 'Saisie à ne pas perdre.');
      await onglet2.page.click('#approbationsApprouver');
      await onglet2.page.waitForSelector('#approbationsMessage', { timeout: DELAI });

      const message = await onglet2.page.locator('#approbationsMessage').innerText();
      assert.match(
        message,
        /recharg/i,
        `L’écran doit dire de RECHARGER la fiche : ${message}`,
      );
      assert.equal(
        await onglet2.page.locator('#approbationsRecharger').count(),
        1,
        'Le geste doit être un BOUTON, jamais la touche F5 : recharger le navigateur ' +
          'effacerait la saisie (leçon Q-29).',
      );

      // Et le 409 est bien celui du serveur, pas une invention de l'écran.
      const rejoue = await deciderDepuisLaPage(onglet2.page, 'risques', RISQUE, 'proposition', 'approuve');
      assert.equal(
        rejoue.statut,
        409,
        `Le refus hors séquence doit être un 409 : ${JSON.stringify(rejoue)}`,
      );

      // La saisie survit au refus : c'est ce que « rien n'a été écrit » vaut
      // pour l'utilisateur.
      const saisie = await onglet2.page.locator('#approbationsCommentaire').inputValue();
      assert.equal(
        saisie,
        'Saisie à ne pas perdre.',
        'Le commentaire doit rester à l’écran après un refus : rien n’a été écrit côté serveur.',
      );

      assert.deepEqual(onglet1.erreursInattendues(BRUIT_ATTENDU), []);
      assert.deepEqual(onglet2.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await onglet1.fermer();
      await onglet2.fermer();
    }
  });
});

/* =====================================================================
 *  §5 — L'écran /approbations, et l'encart des fiches
 * ===================================================================== */

describe('§5 — la liste et la couture', () => {
  test('l’écran /approbations groupe ce qui attend une décision, péremption en tête', async (t) => {
    const p = await ouvrirEtConnecter(VALIDEUR);
    try {
      await p.page.evaluate(() => { window.location.hash = '#/approbations'; });
      await p.page.waitForFunction(
        () => {
          const n = document.getElementById('approbationsCorps');
          return n !== null && n.innerHTML.indexOf('Interrogation des circuits') === -1
            && n.innerHTML.trim() !== '';
        },
        null,
        { timeout: DELAI },
      );

      // ── EXIGENCE DE MATIÈRE : la liste doit avoir compté quelque chose ──
      const lignes = await p.page.locator('#approbationsCorps .apr-ligne').count();
      assert.ok(
        lignes >= 4,
        `La liste doit porter les quatre objets semés au moins : ${String(lignes)} ligne(s).`,
      );

      // Le groupe « périmé » existe (l'audit du §3), et il vient en premier.
      const groupes = await p.page.evaluate(() =>
        [...document.querySelectorAll('#approbationsCorps .apr-groupe')].map((g) => ({
          alerte: g.classList.contains('apr-groupe--alerte'),
          titre: (g.querySelector('h2')?.textContent ?? '').trim(),
        })),
      );
      assert.ok(groupes.length > 0, `Aucun groupe rendu : ${JSON.stringify(groupes)}`);
      assert.equal(
        groupes[0].alerte,
        true,
        'Le groupe des circuits périmés doit venir en premier : ' + JSON.stringify(groupes),
      );

      // Un clic ouvre la fiche — l'identifiant est relu dans le DOM au clic.
      await p.page.locator('#approbationsCorps .apr-ligne').first().click();
      await p.page.waitForSelector('#approbationsFiche', { timeout: DELAI });

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });

  test('l’encart destiné aux fiches Document / Risque / Audit se monte et se charge', async (t) => {
    t.diagnostic(
      'Point de couture : documents.js, risques.js et audits.js sont hors du périmètre ' +
        'de cet agent — c’est l’orchestrateur qui branchera ces deux appels.',
    );
    const p = await ouvrirEtConnecter(VALIDEUR);
    try {
      // Le geste exact que les trois modules feront : un conteneur, puis
      // `monterDans` — qui compose `encartHtml` et `brancherEncart`.
      await p.page.evaluate(([id]) => {
        const app = document.getElementById('app');
        app.innerHTML = '<section class="page"><div id="essaiEncart"></div></section>';
        ApprobationsModule.monterDans('essaiEncart', 'documents', id);
      }, [DOC]);

      await p.page.waitForFunction(
        () => {
          const n = document.getElementById('approbationsEncartCorps');
          return n !== null && n.innerHTML.indexOf('Lecture du circuit') === -1
            && n.innerHTML.trim() !== '';
        },
        null,
        { timeout: DELAI },
      );

      // L'encart montre le circuit RÉEL du document approuvé au §1.
      const texte = await p.page.locator('#approbationsEncart').innerText();
      assert.match(texte, /Circuit d’approbation|Circuit d'approbation/, `Encart inattendu : ${texte}`);
      assert.match(texte, /Revue/, `L’étape attendue doit apparaître : ${texte}`);
      assert.match(texte, /rssi\.tls/, `L’acteur de la décision doit apparaître : ${texte}`);

      // ── Le lien « Ouvrir la fiche » n'a pas de sens DANS la fiche ────────
      // L'encart y vit déjà ; le lien pointerait sur la page en cours. Il doit
      // en revanche rester sur l'écran /approbations, où il mène ailleurs :
      // les deux moitiés, sinon on mesure une absence et non une règle.
      assert.equal(
        await p.page.locator('#approbationsEncart .apr-lien-objet').count(),
        0,
        'L’encart ne doit pas proposer d’ouvrir la fiche sur laquelle il est déjà.',
      );
      await ouvrirFiche(p.page, 'documents', DOC);
      assert.equal(
        await p.page.locator('#approbationsFiche .apr-lien-objet').count(),
        1,
        'L’écran /approbations, lui, doit mener à la fiche de l’objet.',
      );

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });

  test('un commentaire hostile se LIT, il ne s’exécute pas', async (t) => {
    const p = await ouvrirEtConnecter(VALIDEUR);
    const CHARGE = '<img src=x onerror="window.__pwn_appro__=1"><script>window.__pwn_appro__=2;</script>';
    try {
      // La décision porte la charge hostile, écrite par la vraie route.
      const pose = await p.page.evaluate(
        async ([id, charge]) => {
          try {
            await ApprobationsModule.decider('documents', id, 'revue', 'approuve', charge);
            return { statut: 201 };
          } catch (err) {
            return { statut: err.statut ?? 0, message: err.message ?? null };
          }
        },
        [DOC, CHARGE],
      );
      assert.equal(pose.statut, 201, `L’étape doit être écrite : ${JSON.stringify(pose)}`);

      await ouvrirFiche(p.page, 'documents', DOC);
      const pwn = await p.page.evaluate(() => window.__pwn_appro__);
      assert.equal(pwn, undefined, 'Le commentaire ne doit jamais s’exécuter.');

      // Et il se LIT : échappé, mais entier — un commentaire tronqué serait une
      // preuve d'audit amputée.
      const texte = await p.page.locator('#approbationsFiche').innerText();
      assert.ok(
        texte.includes('onerror'),
        `Le commentaire doit s’afficher littéralement : ${texte.slice(0, 400)}`,
      );

      assert.deepEqual(p.erreursInattendues(BRUIT_ATTENDU), []);
    } finally {
      await p.fermer();
    }
  });
});

/* =====================================================================
 *  §6 — Sous la CSP RÉELLE du vhost de production
 * =====================================================================
 *
 * `CLAUDE.md` §5 : *« L'application a été livrée un temps sans fonctionner dans
 * sa configuration de déploiement : soixante-quatre gestionnaires en ligne
 * étaient bloqués par la politique de sécurité de contenu du vhost, et aucun
 * test ne l'avait vu. »* Un écran neuf qui ne serait éprouvé que sans CSP
 * répéterait exactement ce défaut.
 *
 * ⚠️ **La politique est LUE dans le vhost, jamais recopiée ici** — c'est la
 * règle du §5. Le précédent de `constats-s2.test.mjs` la recopie *à dessein*,
 * parce que son objet est la FORCE de la politique : un test qui la lirait
 * passerait au vert le jour où on l'affaiblirait. Ce n'est pas l'objet ici :
 * ce §6 mesure que **cet écran fonctionne sous ce que le vhost sert réellement**,
 * quel qu'il soit. Lire est donc le bon geste, et le contrôle de matière
 * ci-dessous refuse une politique qui n'interdirait rien.
 * ===================================================================== */

describe('§6 — l’écran fonctionne sous la CSP du vhost livré', () => {
  test('la décision passe, et aucun gestionnaire n’est rendu inerte', async (t) => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');

    const vhost = readFileSync(
      join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf'), 'utf8',
    );
    const trouve = /Content-Security-Policy\s+"([^"]+)"/.exec(vhost);
    assert.ok(trouve !== null, 'Aucune CSP trouvée dans le vhost : le relevé est faux.');
    const csp = trouve[1];

    // ── EXIGENCE DE MATIÈRE ────────────────────────────────────────────────
    // Une politique permissive ne prouverait rien : c'est `script-src 'self'`
    // qui rend un `onclick=` inerte, et c'est lui qu'on veut voir à l'œuvre.
    assert.ok(
      csp.includes("script-src 'self'") && !csp.includes("script-src 'self' 'unsafe-inline'"),
      `La CSP relevée n'interdit pas le script en ligne : rien ne serait éprouvé. ${csp}`,
    );
    t.diagnostic(`CSP relevée dans le vhost : ${csp.slice(0, 90)}…`);

    application.definirCsp(csp);
    let p;
    try {
      p = await ouvrirEtConnecter(VALIDEUR);
      await ouvrirFiche(p.page, 'documents', DOC3);

      // Le circuit doit être OUVERT : sur un circuit clos il n'y aurait aucun
      // gestionnaire à rendre inerte, et le vert ne dirait rien.
      const vu = await circuitDuServeur(p.page, 'documents', DOC3);
      assert.equal(vu.circuit.etapeAttendue, 'redaction', JSON.stringify(vu.circuit));

      const bouton = p.page.locator('#approbationsApprouver');
      assert.equal(await bouton.count(), 1, 'Le bouton doit être rendu sous la CSP.');
      await p.page.fill('#approbationsCommentaire', 'Décidé sous la politique du vhost.');
      await bouton.click();

      // La décision a-t-elle réellement eu lieu ? Le gestionnaire a donc été
      // exécuté — ce qu'un `onclick=` en attribut n'aurait pas pu faire ici.
      await p.page.waitForSelector('#approbationsMessage', { timeout: DELAI });
      const apres = await circuitDuServeur(p.page, 'documents', DOC3);
      assert.equal(
        apres.circuit.etapeAttendue,
        'revue',
        `Sous la CSP réelle, la décision doit aboutir : ${JSON.stringify(apres.circuit)}`,
      );

      // Aucune violation de CSP : elles arrivent en `console.error`.
      const bruit = p.erreursInattendues(BRUIT_ATTENDU);
      assert.deepEqual(
        bruit,
        [],
        `Sous la CSP du vhost, l'écran doit rester silencieux : ${JSON.stringify(bruit)}`,
      );
    } finally {
      application.definirCsp(null);
      await p?.fermer();
    }
  });
});
