/**
 * authentification-par-jeton.test.mjs — **UN JETON AUTHENTIFIE VRAIMENT** (lot L22)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe, et pourquoi elle est séparée
 * ════════════════════════════════════════════════════════════════════════
 *
 * 🛑 **Dix-huit essais mesuraient les jetons, et un jeton émis rendait 401.**
 *
 * `jetons_api` est cloisonnée, et la recherche par empreinte a lieu **avant** qu'un
 * périmètre existe — c'est elle qui va le produire. La ligne était donc invisible à
 * la seule transaction qui devait la voir, et tout appel par jeton était refusé avec
 * le motif « inconnu », c'est-à-dire *aucune ligne ne porte cette empreinte*.
 *
 * ⚠️ **Le banc ne pouvait pas le voir** : `test/ouverture/jetons.test.mjs` appelle
 * `verifierJeton()` sous `base.avecPerimetre(...)`, **qui pose un périmètre**. La
 * ligne y est visible, et la fonction rend le bon verdict. *Le banc mesurait la
 * fonction ; personne ne mesurait ce que l'appelant reçoit.*
 *
 * C'est mot pour mot le constat **Q-325** — « `GRC07` n'arrivait nulle part », éprouvé
 * en SQL direct et jamais par la route — reproduit huit jours plus tard dans un autre
 * lot. Cette famille est donc la seule qui monte **le serveur réel**, avec
 * **l'authentification réelle**, et qui présente un vrai `Authorization: Bearer`.
 *
 * ⚠️ Elle est séparée pour cette raison exactement : l'autre famille monte le greffon
 * sous une session provisoire, qui ne lit jamais cet en-tête. Les fondre en une seule
 * aurait redonné le confort d'un montage qui ne mesure pas le chemin réel.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterServeurReel } from '../aide/serveur.mjs';

let base;
let applicatif;
let jetons;
let empreinteSecours;

const IDENTIFIANT_SECOURS = 'brise-glace-jetons';
const MOT_DE_PASSE_SECOURS = 'jeton-de-bout-en-bout-2026!';

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  jetons = await moduleCompile('auth/jetons.js');
  const secours = await moduleCompile('auth/secours.js');
  empreinteSecours = await secours.engendrerEmpreinte(MOT_DE_PASSE_SECOURS);
});

after(async () => {
  await base?.fermer();
});

/** Écrit une ligne de jeton DIRECTEMENT, pour maîtriser le secret présenté. */
async function poserJeton(filiale, options = {}) {
  const emis = jetons.emettreJeton(filiale);
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', filiale, [filiale]),
    async (c) => {
      await c.query(
        `insert into jetons_api (filiale_id, nom, empreinte, prefixe, emis_par,
                                 niveau, domaines, peut_exporter, expire_le)
         values ($1, $2, $3, $4, 'semeur', $5, $6::text[], $7, $8)`,
        [
          filiale,
          options.nom ?? 'Jeton de bout en bout',
          emis.empreinte,
          emis.prefixe,
          options.niveau ?? 'lecture',
          options.domaines ?? ['risques', 'conformite'],
          options.export === true,
          options.expireLe ?? new Date(Date.now() + 86_400_000),
        ],
      );
    },
    { annuler: false },
  );
  return emis.secret;
}

async function avecServeur(travail) {
  const serveur = await monterServeurReel(base, {
    authentification: 'reelle',
    env: {
      AUTH_LDAP_ACTIF: 'non',
      AUTH_COMPTE_SECOURS_IDENTIFIANT: IDENTIFIANT_SECOURS,
      AUTH_COMPTE_SECOURS_EMPREINTE: empreinteSecours,
    },
  });
  try {
    return await travail(serveur);
  } finally {
    await serveur.fermer();
  }
}

describe('un jeton authentifie PAR LA ROUTE', () => {
  test('🛑 GET /api/session avec un Bearer valide rend 200', async () => {
    const secret = await poserJeton(FILIALE_A);
    await avecServeur(async (serveur) => {
      const r = await serveur.appeler('GET', '/api/session', {
        entetes: { authorization: `Bearer ${secret}` },
      });
      // C'est L'ASSERTION QUI MANQUAIT. Elle valait un lot entier : sans elle, la
      // fonctionnalité était livrée, verte au banc, et inopérante.
      assert.equal(
        r.statut,
        200,
        `Un jeton valide doit ouvrir une session. Reçu ${r.statut} : ${JSON.stringify(r.corps).slice(0, 200)}`,
      );
      assert.equal(r.corps.authentification.provisoire, false);
    });
  });

  test('et il sert à LIRE, pas seulement à se présenter', async () => {
    const secret = await poserJeton(FILIALE_A, { domaines: ['risques'] });
    await avecServeur(async (serveur) => {
      const r = await serveur.appeler('GET', '/api/donnees', {
        entetes: { authorization: `Bearer ${secret}` },
      });
      assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 200));
      assert.ok(Array.isArray(r.corps.data.risques), 'le jeu de données doit arriver');
    });
  });

  test('un secret INVENTÉ rend 401', async () => {
    await avecServeur(async (serveur) => {
      const faux = jetons.emettreJeton(FILIALE_A).secret;
      const r = await serveur.appeler('GET', '/api/session', {
        entetes: { authorization: `Bearer ${faux}` },
      });
      assert.equal(r.statut, 401);
    });
  });

  test('une MARQUE DE FILIALE forgée ne donne accès à rien', async () => {
    // ⚠️ Le secret porte sa filiale en clair, pour que la vérification sache où
    // regarder. Elle n'est crue de personne : la remplacer par celle de la voisine
    // fait chercher l'empreinte là où elle n'est pas.
    const secret = await poserJeton(FILIALE_A);
    const alea = secret.slice(secret.indexOf('.') + 1);
    const forge = 'grc_' + Buffer.from(FILIALE_B, 'utf8').toString('base64url') + '.' + alea;
    assert.notEqual(forge, secret, 'la forge doit produire un secret différent');
    await avecServeur(async (serveur) => {
      const r = await serveur.appeler('GET', '/api/session', {
        entetes: { authorization: `Bearer ${forge}` },
      });
      assert.equal(r.statut, 401);
    });
  });

  test('un jeton EXPIRÉ et un jeton RÉVOQUÉ rendent le même 401', async () => {
    const expire = await poserJeton(FILIALE_A, {
      nom: 'Expiré',
      expireLe: new Date(Date.now() - 86_400_000),
    });
    const revoque = await poserJeton(FILIALE_A, { nom: 'Révoqué' });
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          "update jetons_api set revoque_le = now(), revoque_par = 'semeur' where nom = 'Révoqué'",
        );
      },
      { annuler: false },
    );
    await avecServeur(async (serveur) => {
      const a = await serveur.appeler('GET', '/api/session', {
        entetes: { authorization: `Bearer ${expire}` },
      });
      const b = await serveur.appeler('GET', '/api/session', {
        entetes: { authorization: `Bearer ${revoque}` },
      });
      assert.equal(a.statut, 401);
      assert.equal(b.statut, 401);
      // ⚠️ Indiscernables À L'OCTET PRÈS, hors la référence de requête : distinguer
      // les deux dirait à qui essaie des jetons lesquels ont existé (contrôle S12).
      const sans = (c) => JSON.stringify(c).replace(/"reference":"[^"]*"/u, '');
      assert.equal(sans(a.corps), sans(b.corps));
    });
  });

  test("l'usage est NOTÉ : un jeton qui sert laisse une trace", async () => {
    const secret = await poserJeton(FILIALE_A, { nom: 'Tracé' });
    await avecServeur(async (serveur) => {
      await serveur.appeler('GET', '/api/session', {
        entetes: { authorization: `Bearer ${secret}` },
      });
    });
    const ligne = await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        const { rows } = await c.query(
          "select usages, dernier_usage_le from jetons_api where nom = 'Tracé'",
        );
        return rows[0];
      },
      { annuler: false },
    );
    // Sans cette écriture, un jeton servirait sans trace — et c'est précisément
    // le jour où l'on regarde les traces qu'on en a besoin.
    assert.equal(Number(ligne.usages), 1);
    assert.notEqual(ligne.dernier_usage_le, null);
  });
});
