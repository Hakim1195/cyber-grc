/**
 * smtp.test.mjs — **le client SMTP écrit à la main, contre un vrai serveur.**
 *
 * Ce que cette famille mesure, et qu'aucune doublure d'objet ne montrerait :
 *
 *  1. **STARTTLS est réellement négocié.** Le verdict ne vient pas du client —
 *     qui pourrait se tromper — mais du **serveur**, qui rapporte `chiffre` et le
 *     protocole constatés sur SA prise. Les deux bouts doivent le dire.
 *  2. **Rien ne part en clair par repli.** Un relais qui n'annonce pas
 *     l'extension obtient un refus, pas un message.
 *  3. **Les identifiants n'échappent pas au chiffrement** (`chiffrement: aucun`
 *     + `modeAuth: basique` → refus avant toute connexion utile).
 *  4. **L'injection de réponse STARTTLS (CVE-2011-0411) est vue.**
 *  5. **Une adresse hostile ne devient jamais une commande.**
 *  6. Les échecs sont **classés** : 5xx permanent, 4xx et réseau passagers.
 *
 * ⚠️ Chaque essai a de la matière : on ne conclut jamais « rien n'a fui » sur un
 * serveur qui n'a rien reçu. Le serveur d'essai enregistre les octets exacts, et
 * les assertions portent dessus.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { moduleCompile } from '../aide/serveur.mjs';
import { monterRelaisEssai } from './serveur-smtp.mjs';

const { encoderMessage, ErreurSmtp, expedier, validerAdresse } =
  await moduleCompile('notifications/smtp.js');

const MESSAGE = Object.freeze({
  de: { adresse: 'cyber-grc@exemple.interne', nom: 'Cyber GRC' },
  a: 'rssi@exemple.interne',
  sujet: 'Cyber GRC — 3 échéance(s) à traiter',
  corps: 'Bonjour,\r\n\r\n  En retard ... 3\r\n',
});

describe('Client SMTP — le dialogue', () => {
  let relais;
  before(async () => {
    relais = await monterRelaisEssai();
  });
  after(async () => {
    await relais?.fermer();
  });

  test('STARTTLS est négocié, et les DEUX bouts le constatent', async () => {
    const trace = await expedier(MESSAGE, relais.relais(), {
      tlsSupplement: { ca: relais.autorite },
    });

    // Le client dit…
    assert.equal(trace.starttlsNegocie, true, 'le client doit avoir basculé en TLS');
    assert.equal(trace.chiffre, true);
    assert.match(trace.protocoleTls ?? '', /^TLSv1\.[23]$/u, 'protocole réellement négocié');
    assert.equal(trace.authentifie, true);

    // …et le SERVEUR le confirme, sur SA prise. C'est lui qui fait foi.
    assert.equal(relais.messages.length, 1, "le relais devait avoir un message à compter");
    const recu = relais.messages[0];
    assert.equal(recu.chiffre, true, 'le relais doit avoir reçu le message sur un canal chiffré');
    assert.equal(recu.authentifie, true);
    assert.match(recu.protocole ?? '', /^TLSv1\.[23]$/u);
    assert.equal(recu.de, 'cyber-grc@exemple.interne');
    assert.deepEqual(recu.a, ['rssi@exemple.interne']);

    // Le corps est arrivé entier (base64 décodé) — sans quoi « rien n'a fui »
    // ne vaudrait rien : il faut que quelque chose soit arrivé.
    const separation = recu.donnees.indexOf('\r\n\r\n');
    const corps = Buffer.from(recu.donnees.slice(separation + 4), 'base64').toString('utf8');
    assert.match(corps, /En retard \.\.\. 3/u);
  });

  test('le sujet accentué voyage encodé RFC 2047, et se relit', () => {
    const { contenu } = encoderMessage(MESSAGE);
    assert.match(contenu, /^Subject: =\?UTF-8\?B\?/mu, 'sujet non ASCII → mot encodé');
    const encode = /^Subject: =\?UTF-8\?B\?([^?]+)\?=/mu.exec(contenu)?.[1] ?? '';
    assert.match(Buffer.from(encode, 'base64').toString('utf8'), /échéance/u);
  });

  test('un seul RCPT par enveloppe : la liste des destinataires ne circule pas', async () => {
    const avant = relais.commandes.length;
    await expedier(MESSAGE, relais.relais(), { tlsSupplement: { ca: relais.autorite } });
    const rcpt = relais.commandes.slice(avant).filter((c) => c.toUpperCase().startsWith('RCPT'));
    assert.equal(rcpt.length, 1);
  });
});

describe('Client SMTP — ce qui doit être refusé', () => {
  test("un relais sans STARTTLS n'obtient RIEN, jamais un repli en clair", async () => {
    const relais = await monterRelaisEssai({ sansStarttls: true });
    try {
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais(), { tlsSupplement: { ca: relais.autorite } }),
        (e) => e instanceof ErreurSmtp && /n'annonce pas STARTTLS/u.test(e.message),
      );
      // ⚠️ La matière : le serveur ne doit avoir vu ni MAIL, ni DATA.
      assert.equal(relais.messages.length, 0);
      assert.equal(
        relais.commandes.filter((c) => /^(MAIL|DATA|AUTH)/iu.test(c)).length,
        0,
        'rien de sensible ne doit avoir été envoyé sur le canal en clair',
      );
    } finally {
      await relais.fermer();
    }
  });

  test('injection de réponse STARTTLS (CVE-2011-0411) : la connexion est refusée', async () => {
    const relais = await monterRelaisEssai({ pipelineAvantTls: true });
    try {
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais(), { tlsSupplement: { ca: relais.autorite } }),
        (e) => e instanceof ErreurSmtp && /CVE-2011-0411/u.test(e.message),
      );
      assert.equal(relais.messages.length, 0);
    } finally {
      await relais.fermer();
    }
  });

  test("les identifiants ne partent jamais sur un canal en clair", async () => {
    const relais = await monterRelaisEssai();
    try {
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais({ chiffrement: 'aucun' })),
        (e) => e instanceof ErreurSmtp && e.permanente && /circulerait en clair/u.test(e.message),
      );
      assert.equal(
        relais.commandes.filter((c) => /^AUTH/iu.test(c)).length,
        0,
        "aucune commande AUTH ne doit avoir atteint le relais",
      );
    } finally {
      await relais.fermer();
    }
  });

  test('OAuth2 est refusé explicitement, pas traité comme « aucune authentification »', async () => {
    const relais = await monterRelaisEssai({ exigerAuth: true });
    try {
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais({ modeAuth: 'oauth2' })),
        (e) => e instanceof ErreurSmtp && e.permanente && /oauth2/iu.test(e.message),
      );
      assert.equal(relais.commandes.length, 0, 'aucune connexion utile ne doit avoir eu lieu');
    } finally {
      await relais.fermer();
    }
  });

  test('une adresse hostile ne devient pas une commande SMTP', async () => {
    const relais = await monterRelaisEssai();
    const hostiles = [
      'victime@exemple.fr>\r\nRCPT TO:<pirate@ailleurs.fr',
      'a@b.fr\nDATA',
      'a@b.fr\r\n.\r\nMAIL FROM:<x@y.fr>',
      'a b@exemple.fr',
      '<a@exemple.fr>',
    ];
    try {
      for (const a of hostiles) {
        await assert.rejects(
          () => expedier({ ...MESSAGE, a }, relais.relais(), { tlsSupplement: { ca: relais.autorite } }),
          (e) => e instanceof ErreurSmtp && e.permanente,
          `« ${a.slice(0, 20)}… » aurait dû être refusée`,
        );
      }
      // Matière : aucune de ces cinq tentatives n'a atteint le fil.
      assert.equal(relais.commandes.length, 0);
      assert.equal(relais.messages.length, 0);
      // Et le refus a lieu AVANT la connexion : rien n'a même été ouvert.
      assert.throws(() => validerAdresse(hostiles[0], 'destinataire'), /forme refusée/u);
    } finally {
      await relais.fermer();
    }
  });

  test('un 5xx est permanent, un relais injoignable ne l’est pas', async () => {
    const refus = await monterRelaisEssai({ refuserRcpt: true });
    try {
      await assert.rejects(
        () => expedier(MESSAGE, refus.relais(), { tlsSupplement: { ca: refus.autorite } }),
        (e) => e instanceof ErreurSmtp && e.permanente && e.codeSmtp === 550,
      );
    } finally {
      await refus.fermer();
    }

    // Un port fermé : passager, et cela doit se distinguer du refus ci-dessus.
    const mort = await monterRelaisEssai();
    const port = mort.port;
    await mort.fermer();
    await assert.rejects(
      () =>
        expedier(MESSAGE, { hote: '127.0.0.1', port, chiffrement: 'aucun', modeAuth: 'aucun', utilisateur: '', motDePasse: '' }),
      (e) => e instanceof ErreurSmtp && e.permanente === false && e.codeSmtp === null,
    );
  });

  test('un relais muet rend la main sur le délai du client, sans laisser de prise ouverte', async () => {
    const relais = await monterRelaisEssai({ muet: true });
    try {
      const debut = Date.now();
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais({ chiffrement: 'aucun', modeAuth: 'aucun' }), { delaiMs: 600 }),
        (e) => e instanceof ErreurSmtp && /n'a pas répondu/u.test(e.message),
      );
      assert.ok(Date.now() - debut < 5000, 'le délai doit être celui du client, pas celui du système');
    } finally {
      await relais.fermer();
    }
  });

  test('une coupure au milieu du dialogue est un échec nommé, pas un plantage', async () => {
    const relais = await monterRelaisEssai({ couper: 'DATA' });
    try {
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais(), { tlsSupplement: { ca: relais.autorite } }),
        (e) => e instanceof ErreurSmtp,
      );
      assert.equal(relais.messages.length, 0);
    } finally {
      await relais.fermer();
    }
  });

  test('un certificat non vérifiable fait échouer la bascule — la vérification est réelle', async () => {
    const relais = await monterRelaisEssai();
    try {
      // Sans l'autorité : le certificat auto-signé n'est pas dans le magasin du
      // système, la poignée de main doit être refusée. C'est ce qui prouve que
      // l'essai précédent, lui, a VRAIMENT vérifié quelque chose.
      await assert.rejects(
        () => expedier(MESSAGE, relais.relais()),
        (e) => e instanceof ErreurSmtp && /Poignée de main TLS refusée/u.test(e.message),
      );
      assert.equal(relais.messages.length, 0);
    } finally {
      await relais.fermer();
    }
  });
});

/* =====================================================================
 *  §7 — La CONFIGURATION refuse `aucun` en production (constat Q-267)
 * =====================================================================
 *
 * ── Pourquoi cette famille manquait, et ce qu'elle coûte ────────────────────
 *
 * Les six familles ci-dessus éprouvent le PROTOCOLE : STARTTLS est négocié,
 * `AUTH` n'échappe pas au chiffrement, une injection CVE-2011-0411 est vue.
 * Toutes prennent `chiffrement` comme une donnée d'entrée — **aucune ne
 * demandait quelles valeurs le produit accepte de LIVRER.**
 *
 * Le `docs/GUIDE_EXPLOITATION.md` §5 donnait pendant ce temps à l'exploitant,
 * comme réponse à faire à un RSSI qui la demande : « **STARTTLS est exigé** :
 * sans lui, l'envoi est refusé — il n'y a **aucun repli en clair** ». C'était
 * faux : `SMTP_CHIFFREMENT=aucun` était accepté, avec un simple avertissement
 * au journal. **Promettre une barrière qui n'existe pas est la pire classe de
 * défaut d'un guide, parce qu'elle fait renoncer à la vérifier** — porte S7,
 * constat **Q-267**.
 *
 * ⚠️ **Le banc était vert des deux côtés du correctif**, et c'est le vrai
 * enseignement : ni l'ancien comportement ni le neuf n'était mordu par quoi que
 * ce soit. Le protocole était éprouvé jusqu'à l'octet, et la porte d'entrée de
 * la configuration ne l'était pas du tout.
 *
 * La borne est `production`, délibérément : le développement et la recette
 * gardent `aucun`, sans quoi on ne pourrait plus éprouver un relais local. Ce
 * qui est refusé, c'est de le **livrer**.
 */
describe('§7 — ce que la configuration accepte de LIVRER', () => {
  const base = (supplement) => ({
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
    AUTH_LDAP_ACTIF: 'oui',
    LDAP_URL: 'ldaps://annuaire.invalide.test:636',
    LDAP_DN_SERVICE: 'CN=inutilise,DC=invalide,DC=test',
    LDAP_MOT_DE_PASSE_SERVICE: 'inutilise-pour-cet-essai',
    LDAP_BASE_RECHERCHE: 'DC=invalide,DC=test',
    SERVEUR_NIVEAU_JOURNAL: 'silent',
    SMTP_ACTIF: 'oui',
    SMTP_HOTE: 'relais.invalide.test',
    // ⚠️ `SMTP_MODE_AUTH`, et non `SMTP_AUTH` : la première rédaction s'est
    // trompée de nom, et l'environnement de base est alors devenu invalide pour
    // une raison étrangère au chiffrement — trois variables requises manquantes.
    // **La garde du §0 l'a attrapée immédiatement**, ce qui est exactement ce
    // pour quoi elle est écrite (constat Q-210 : un essai qui échoue pour une
    // autre raison que celle qu'il annonce rend le même verdict qu'un essai qui
    // mesure).
    SMTP_MODE_AUTH: 'aucun',
    SMTP_EXPEDITEUR: 'grc@exemple.interne',
    ...supplement,
  });

  test('LA GARDE : cet environnement charge, chiffrement mis à part', async () => {
    // Sans cette moitié, l'essai suivant passerait au vert en attrapant une
    // erreur qui ne parle pas du chiffrement — c'est le constat Q-210, rejoué
    // une fois de trop sur ce chantier pour ne pas le prévenir ici.
    const { chargerConfiguration } = await moduleCompile('config/index.js');
    assert.doesNotThrow(() => chargerConfiguration(base({ SMTP_CHIFFREMENT: 'starttls' })));
    assert.doesNotThrow(() => chargerConfiguration(base({ SMTP_CHIFFREMENT: 'tls' })));
  });

  test('en PRODUCTION, `aucun` avec un relais actif REFUSE le démarrage', async () => {
    const { chargerConfiguration, ErreurConfiguration } = await moduleCompile('config/index.js');
    try {
      chargerConfiguration(base({ SMTP_CHIFFREMENT: 'aucun' }));
      assert.fail('un relais en clair ne doit pas pouvoir être livré');
    } catch (erreur) {
      assert.ok(erreur instanceof ErreurConfiguration);
      // Le message doit servir à quelqu'un qui lit un service qui refuse de
      // démarrer : la variable, et la valeur à mettre.
      assert.match(erreur.message, /SMTP_CHIFFREMENT/);
      assert.match(erreur.message, /starttls/);
      assert.equal(erreur.problemes.length, 1, `un seul problème attendu : ${erreur.message}`);
    }
  });

  test('sans relais, `aucun` ne gêne personne : la garde vise l’ENVOI, pas la valeur', async () => {
    const { chargerConfiguration } = await moduleCompile('config/index.js');
    // `SMTP_ACTIF=non` est l'état par défaut d'une installation qui n'a pas
    // encore de relais ; refuser là serait refuser de démarrer pour un réglage
    // qui ne sert à rien.
    assert.doesNotThrow(() =>
      chargerConfiguration(base({ SMTP_ACTIF: 'non', SMTP_CHIFFREMENT: 'aucun' })),
    );
  });

  test('en DÉVELOPPEMENT et en RECETTE, `aucun` reste possible', async () => {
    const { chargerConfiguration } = await moduleCompile('config/index.js');
    for (const env of ['developpement', 'recette']) {
      assert.doesNotThrow(
        () => chargerConfiguration(base({ NODE_ENV: env, SMTP_CHIFFREMENT: 'aucun' })),
        `« ${env} » doit pouvoir éprouver un relais local en clair`,
      );
    }
  });
});
