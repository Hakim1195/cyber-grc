/**
 * routes.test.mjs — les deux routes du lot, **sur le vrai greffon d'API**.
 *
 * Le montage est celui de `test/approbations/aide.mjs` : on SONDE d'abord si
 * `src/api/index.ts` monte déjà `greffonNotifications`, et on ne le pose
 * soi-même que sinon. Le jour où l'orchestrateur écrit son `register`, cette
 * famille bascule sur le chemin du produit sans rien casser — et la ligne
 * d'enregistrement devient elle-même éprouvée.
 *
 * Rien n'est simulé du chemin d'accès : les requêtes passent par le crochet
 * `onRequest` du produit (rythme, identité, filiale active, `deciderAcces` sur la
 * déclaration de la route) puis par son traitement d'erreur réel.
 *
 * ⚠️ **Le relais de cette famille est en CLAIR (`chiffrement: 'aucun'`), et c'est
 * délibéré.** La route appelle `expedier` sans options TLS — comme en production,
 * où le magasin du système fait foi —, si bien qu'un certificat auto-signé y est
 * refusé : *« Poignée de main TLS refusée : self-signed certificate »*, mesuré.
 * Deux issues étaient possibles : ouvrir dans le produit une option TLS que seul
 * le banc emploierait, ou éprouver ici la ROUTE et laisser le chiffrement à
 * `smtp.test.mjs` et `relances.test.mjs`, qui le mesurent contre le même serveur.
 * La seconde a été retenue : une option de contournement TLS dans le code de
 * production est exactement l'interrupteur qu'on retrouve un jour posé en
 * production.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RACINE_BACKEND } from '../aide/serveur.mjs';
import {
  CHEMIN_ETAT,
  CHEMIN_TEST,
  SessionDEssai,
  lireMessage,
  monterNotifications,
  smtpVers,
} from './aide.mjs';

/** Relais en clair : voir l'entête. */
const EN_CLAIR = Object.freeze({ chiffrement: 'aucun', modeAuth: 'aucun' });
import { monterRelaisEssai } from './serveur-smtp.mjs';

const { TOUS_LES_DOMAINES } = await moduleCompile('api/droits.js');

const ADMIN = Object.freeze({ niveau: 'administration', domaines: TOUS_LES_DOMAINES, export: true });
/** Un profil complet SAUF le domaine « administration » : c'est lui qui doit refuser. */
const SANS_ADMINISTRATION = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'administration'),
  export: true,
});

const sessionSite = (filiale, utilisateur) =>
  Object.freeze({
    utilisateurId: utilisateur,
    filialeId: filiale,
    filiales: [filiale],
    perimetreGroupe: false,
    administrationGroupe: false,
  });

const IDENTITE = Object.freeze({ login: 'rssi.toulouse', nomAffichage: 'RSSI Toulouse' });

let base;
let applicatif;
let relais;
let session;
let monte;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // L'annuaire de l'appelant : `USER-A` / `rssi.toulouse` existe déjà
  // (`semerJeuEssai`), on lui donne une fiche d'annuaire avec une adresse.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l12', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
             values ('PERS-MOI', $1, 'RSSI Toulouse', 'rssi.toulouse@exemple.interne', 'USER-A')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  // La fiche de la VOISINE, pour prouver que la route ne peut pas l'atteindre.
  // ⚠️ Transaction SÉPARÉE, filiale active = B : la politique d'écriture de
  // `personnes` exige `filiale_id = f_filiale_ecriture()`. La poser dans la
  // transaction de A rend `42501` — mesuré, et c'est la RLS qui fait son travail.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l12', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query(
        `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
             values ('PERS-VOISIN', $1, 'RSSI Allemagne', 'rssi.allemagne@exemple.interne', 'USER-B')`,
        [FILIALE_B],
      );
    },
    { annuler: false },
  );

  relais = await monterRelaisEssai();
  session = new SessionDEssai(sessionSite(FILIALE_A, 'rssi.toulouse'), ADMIN, IDENTITE);
  monte = await monterNotifications(base, session, smtpVers(relais, EN_CLAIR));
});

after(async () => {
  await monte?.fermer();
  await relais?.fermer();
  await base?.fermer();
});

describe('L12 — les routes', () => {
  test('les deux routes existent et DÉCLARENT leur classe d’accès', () => {
    const parUrl = Object.fromEntries(monte.routes.map((r) => [`${r.methode} ${r.url}`, r.acces]));
    assert.deepEqual(parUrl[`GET ${CHEMIN_ETAT}`], { action: 'lire', domaine: 'administration' });
    assert.deepEqual(parUrl[`POST ${CHEMIN_TEST}`], { action: 'ecrire', domaine: 'administration' });
  });

  test('GET /etat rend l’état du relais, et AUCUN secret', async () => {
    const { statut, corps } = await monte.appeler('GET', CHEMIN_ETAT);
    assert.equal(statut, 200);
    assert.equal(corps.actif, true);
    assert.equal(corps.hote, relais.hote);
    assert.equal(corps.chiffrement, 'aucun', "celui du relais de CETTE famille — voir l'entête");
    assert.equal(corps.mode_auth, 'aucun');
    assert.equal(corps.derniere_relance, null, 'aucune relance n’a encore eu lieu');

    // ⚠️ La matière : le mot de passe EXISTE dans la configuration servie — sans
    // quoi « aucun secret » serait le verdict d'un essai sans secret à trouver.
    assert.ok(monte.config.smtp.motDePasse.length > 0, 'il faut un secret à ne pas trouver');
    const serialisee = JSON.stringify(corps);
    assert.ok(!serialisee.includes(monte.config.smtp.motDePasse));
    assert.ok(!/mot_de_passe|motDePasse|secret/iu.test(serialisee));
  });

  test('POST /test expédie à l’adresse D’ANNUAIRE de l’appelant, et le trace', async () => {
    const avant = relais.messages.length;
    const { statut, corps } = await monte.appeler('POST', CHEMIN_TEST, { corps: {} });
    assert.equal(statut, 200);
    assert.equal(corps.expedie, true);
    assert.equal(corps.motif, null);

    assert.equal(relais.messages.length - avant, 1);
    const recu = relais.messages[relais.messages.length - 1];
    assert.deepEqual(recu.a, ['rssi.toulouse@exemple.interne']);

    // Le message de vérification ne porte ni chiffre ni identité.
    const { tout } = lireMessage(recu);
    assert.ok(!tout.includes('RSSI Toulouse'));
    assert.ok(!tout.includes(FILIALE_A));

    // Trace : le NOMBRE de destinataires, jamais l'adresse.
    const proprietaire = await base.connexion('proprietaire');
    const entrees = await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', null, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            `select "resume", "valeurs_apres", "utilisateur_libelle", "filiale_id"
               from "journal_audit" where "action" = 'administration' order by "numero" desc limit 1`,
          )
        ).rows,
    );
    assert.equal(entrees.length, 1);
    assert.equal(entrees[0].resume, 'Vérification du relais de messagerie');
    assert.equal(entrees[0].filiale_id, FILIALE_A);
    assert.equal(entrees[0].utilisateur_libelle, 'rssi.toulouse');
    assert.equal(entrees[0].valeurs_apres.destinataires, 1);
    assert.equal(entrees[0].valeurs_apres.expedie, true);
    assert.ok(!JSON.stringify(entrees[0]).includes('@exemple.interne'));
  });

  test('POST /test : les trois noms d’adresse plausibles rendent 400', async () => {
    for (const corps of [
      { destinataire: 'pirate@ailleurs.fr' },
      { a: 'pirate@ailleurs.fr' },
      { email: 'pirate@ailleurs.fr' },
    ]) {
      const avant = relais.messages.length;
      const reponse = await monte.appeler('POST', CHEMIN_TEST, { corps });
      assert.equal(reponse.statut, 400, JSON.stringify(reponse.corps));
      assert.equal(relais.messages.length, avant, 'aucun message ne doit être parti');
    }
    // Matière : le même appel SANS champ passe — le refus vient du champ, pas
    // d'une route cassée.
    const ok = await monte.appeler('POST', CHEMIN_TEST, { corps: {} });
    assert.equal(ok.statut, 200);
  });

  test('un nom d’adresse NON prévu est retiré en silence — et le message part quand même au bon endroit', async () => {
    // ⚠️ Ce que cet essai fixe est la propriété RÉELLE, et elle est plus forte
    // que le 400 ci-dessus : Fastify compile avec `removeAdditional: true`, donc
    // un quatrième nom serait STRIPPÉ, pas refusé. Ce qui protège n'est pas le
    // schéma, c'est que le gestionnaire ne lit jamais le corps.
    const avant = relais.messages.length;
    const { statut } = await monte.appeler('POST', CHEMIN_TEST, {
      corps: { recipient: 'pirate@ailleurs.fr', envoyerA: 'pirate@ailleurs.fr' },
    });
    assert.equal(statut, 200);
    assert.equal(relais.messages.length - avant, 1);
    assert.deepEqual(
      relais.messages[relais.messages.length - 1].a,
      ['rssi.toulouse@exemple.interne'],
      'FUITE : une adresse du corps a choisi le destinataire',
    );
    assert.ok(
      !relais.messages.some((m) => m.a.some((a) => a.includes('pirate'))),
      'FUITE : le relais a vu une adresse fournie par l’appelant',
    );
  });

  test('mécaniquement : le gestionnaire des routes ne lit JAMAIS le corps de la requête', () => {
    // Même geste que `test/journal-lecture/routes.test.mjs`, qui interdit tout
    // `statut: 403` dans le corps de `src/api/journal.ts` : la propriété se
    // constate sur le texte du module, pas sur une intention.
    const source = readFileSync(join(RACINE_BACKEND, 'src', 'notifications', 'index.ts'), 'utf8');
    const code = source
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/u.test(l))
      .join('\n');
    // On interdit l'ACCÈS `…​.body`, pas la clé `body:` du schéma — qui, elle,
    // doit rester : c'est elle qui produit le 400 explicite sur les trois noms.
    assert.ok(/schema:\s*\{\s*body:/u.test(code), 'le schéma de corps doit rester déclaré');
    assert.ok(
      !/\.\s*body\b/u.test(code),
      'le gestionnaire lit le corps de la requête : la garantie structurelle est perdue',
    );
  });

  test('sans le domaine « administration », les deux routes rendent 403', async () => {
    session.poser(sessionSite(FILIALE_A, 'rssi.toulouse'), SANS_ADMINISTRATION, IDENTITE);
    try {
      const avant = relais.messages.length;
      assert.equal((await monte.appeler('GET', CHEMIN_ETAT)).statut, 403);
      assert.equal((await monte.appeler('POST', CHEMIN_TEST, { corps: {} })).statut, 403);
      assert.equal(relais.messages.length, avant, 'un refus ne doit rien expédier');
    } finally {
      session.poser(sessionSite(FILIALE_A, 'rssi.toulouse'), ADMIN, IDENTITE);
    }
  });

  test('un appelant sans fiche d’annuaire obtient un refus lisible, pas un envoi au hasard', async () => {
    session.poser(sessionSite(FILIALE_A, 'inconnu.au.bataillon'), ADMIN, {
      login: 'inconnu.au.bataillon',
      nomAffichage: 'Inconnu Au Bataillon',
    });
    try {
      const avant = relais.messages.length;
      const { statut, corps } = await monte.appeler('POST', CHEMIN_TEST, { corps: {} });
      assert.equal(statut, 409);
      assert.match(corps.message ?? '', /annuaire/iu);
      assert.equal(relais.messages.length, avant);
    } finally {
      session.poser(sessionSite(FILIALE_A, 'rssi.toulouse'), ADMIN, IDENTITE);
    }
  });

  test("l'adresse de la filiale VOISINE est hors d'atteinte, même en portant son nom", async () => {
    // La session est celle de A ; l'identité prétend être la personne de B.
    // La RLS ne rend pas sa fiche : la route doit refuser, pas écrire à B.
    session.poser(sessionSite(FILIALE_A, 'rssi.allemagne'), ADMIN, {
      login: 'rssi.allemagne',
      nomAffichage: 'RSSI Allemagne',
    });
    try {
      const avant = relais.messages.length;
      const { statut } = await monte.appeler('POST', CHEMIN_TEST, { corps: {} });
      assert.equal(statut, 409, 'aucune fiche lisible dans le périmètre de A');
      assert.equal(relais.messages.length, avant);
      assert.ok(
        !relais.messages.some((m) => m.a.includes('rssi.allemagne@exemple.interne')),
        'FUITE : la voisine a reçu un message depuis une session de A',
      );
    } finally {
      session.poser(sessionSite(FILIALE_A, 'rssi.toulouse'), ADMIN, IDENTITE);
    }
  });
});

describe('L12 — un relais injoignable n’est pas une panne du produit', () => {
  test('POST /test rend 200 avec « expedie: false » et un motif, jamais 500', async () => {
    const mort = await monterRelaisEssai();
    const port = mort.port;
    await mort.fermer();

    const sessionLocale = new SessionDEssai(sessionSite(FILIALE_A, 'rssi.toulouse'), ADMIN, IDENTITE);
    const isole = await monterNotifications(
      base,
      sessionLocale,
      smtpVers({ hote: '127.0.0.1', port, utilisateur: 'x', motDePasse: 'y' }, EN_CLAIR),
    );
    try {
      const { statut, corps } = await isole.appeler('POST', CHEMIN_TEST, { corps: {} });
      assert.equal(statut, 200, 'un relais absent est le RÉSULTAT de la vérification');
      assert.equal(corps.expedie, false);
      assert.match(corps.motif ?? '', /injoignable|ECONNREFUSED/u);
    } finally {
      await isole.fermer();
    }
  });

  test('SMTP_ACTIF=non : POST /test rend 409, GET /etat reste lisible', async () => {
    const sessionLocale = new SessionDEssai(sessionSite(FILIALE_A, 'rssi.toulouse'), ADMIN, IDENTITE);
    const isole = await monterNotifications(base, sessionLocale, { actif: false });
    try {
      const etat = await isole.appeler('GET', CHEMIN_ETAT);
      assert.equal(etat.statut, 200);
      assert.equal(etat.corps.actif, false);
      assert.equal(etat.corps.hote, null);

      const essai = await isole.appeler('POST', CHEMIN_TEST, { corps: {} });
      assert.equal(essai.statut, 409);
      assert.match(essai.corps.message ?? '', /relais/iu);
    } finally {
      await isole.fermer();
    }
  });
});
