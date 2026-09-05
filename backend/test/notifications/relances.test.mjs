/**
 * relances.test.mjs — **le contrôle central du lot, et ses trois voisins.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  1. AUCUNE DONNÉE MÉTIER NE SORT PAR COURRIEL (§36.2 règle 1)
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'essai sème neuf chaînes reconnaissables — titres, noms, commentaires,
 * synthèses, toutes préfixées `ZZFUITE` — dans les six sources d'échéances, puis
 * joue la chaîne **entière** : récolte, résolution de l'annuaire, rédaction,
 * dialogue SMTP réel. Il cherche ensuite ces chaînes dans **les octets que le
 * relais a reçus** : pas dans le retour d'une fonction, pas dans ce que le code
 * croit avoir écrit — dans ce qui est sorti sur le fil.
 *
 * ⚠️ **La matière d'abord.** L'essai vérifie d'abord qu'un message est bien parti
 * et qu'il contient les décomptes attendus. Sans cela, « aucune fuite » serait le
 * verdict d'un essai qui n'a rien eu à fouiller — le défaut nommé deux fois à la
 * porte S4 (Q-108, Q-116).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  2. Les règles d'échéance sont celles de l'écran
 * ════════════════════════════════════════════════════════════════════════
 *
 * Six sources semées, six comptées ; une action **terminée** à la même date et
 * une action à **60 jours** semées exprès pour n'être PAS relancées.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  3. Deux exécutions rapprochées n'envoient pas deux fois
 * ════════════════════════════════════════════════════════════════════════
 *
 * ════════════════════════════════════════════════════════════════════════
 *  4. Un relais injoignable ne casse rien, et laisse une trace exploitable
 * ════════════════════════════════════════════════════════════════════════
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile } from '../aide/serveur.mjs';
import {
  ADRESSE_MARIE,
  MARQUE,
  SECRETS_SEMES,
  lireMessage,
  ouvrirContexte,
  semerEcheances,
  smtpVers,
} from './aide.mjs';
import { monterRelaisEssai } from './serveur-smtp.mjs';

const { envoyerRelances } = await moduleCompile('notifications/relances.js');
const { SOURCES } = await moduleCompile('notifications/echeances.js');

/** Date fixe : un essai dont le verdict dépend du jour où on le joue rougit un dimanche. */
const REFERENCE = new Date('2026-06-15T09:00:00.000Z');

let base;
let applicatif;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  await semerEcheances(base, applicatif, FILIALE_A, REFERENCE);
});

after(async () => {
  await base?.fermer();
});

/** Toutes les entrées `administration` du journal, vues du propriétaire. */
async function journalAdministration() {
  const proprietaire = await base.connexion('proprietaire');
  return await base.avecPerimetre(
    proprietaire,
    perimetre('observateur', null, [FILIALE_A]),
    async (c) =>
      (
        await c.query(
          `select "filiale_id", "resume", "valeurs_apres", "utilisateur_libelle"
             from "journal_audit" where "action" = 'administration' order by "numero"`,
        )
      ).rows,
  );
}

describe('L12 — aucune donnée métier ne sort par courriel', () => {
  let relais;
  let contexte;
  let bilan;

  before(async () => {
    relais = await monterRelaisEssai();
    contexte = await ouvrirContexte(base, smtpVers(relais));
    bilan = await envoyerRelances(contexte.pool, contexte.config, {
      reference: REFERENCE,
      expedition: { tlsSupplement: { ca: relais.autorite } },
    });
  });

  after(async () => {
    await contexte?.fermer();
    await relais?.fermer();
  });

  /* ── LA MATIÈRE, d'abord : sans elle le contrôle ne vaut rien ────────── */

  test('un message est réellement parti, chiffré, à la bonne adresse', () => {
    assert.equal(bilan.actif, true);
    assert.equal(bilan.messagesEchoues, 0, JSON.stringify(bilan.filiales));
    assert.equal(bilan.messagesExpedies, 1, 'une seule personne a une adresse dans l’annuaire');
    assert.equal(relais.messages.length, 1, 'le relais devait avoir un message à fouiller');

    const recu = relais.messages[0];
    assert.deepEqual(recu.a, [ADRESSE_MARIE]);
    assert.equal(recu.chiffre, true);
    assert.equal(recu.authentifie, true);
    assert.ok(recu.donnees.length > 200, 'le message doit avoir du contenu à examiner');
  });

  test('le message porte bien les décomptes attendus — il DIT quelque chose', () => {
    const { corps } = lireMessage(relais.messages[0]);

    // 5 échéances pour Marie : action (-3), MCO (0), document (+5), audit (+2),
    // revue (+4). L'incident n'a pas de responsable ; l'action terminée et
    // l'action à 60 jours sont hors relance.
    assert.match(corps, /En retard .* 1/u);
    assert.match(corps, /Pour aujourd'hui .* 1/u);
    assert.match(corps, /Sous 7 jours .* 3/u);
    assert.match(corps, /Total .* 5/u);

    // Les libellés de MODULE sont des constantes du produit, jamais des valeurs
    // de base : ils ont le droit d'être là, et leur présence prouve que le
    // message est utile.
    for (const type of ['action', 'mco', 'document', 'audit', 'revue']) {
      assert.ok(corps.includes(SOURCES[type].libelle), `« ${SOURCES[type].libelle} » attendu`);
    }
    assert.ok(!corps.includes(SOURCES.incident.libelle), "l'incident n'a pas de destinataire");
    assert.match(corps, /#\/echeances/u, 'le message doit dire OÙ aller');
  });

  /* ── LE CONTRÔLE : aucune de ces neuf chaînes ne doit être sortie ────── */

  test('AUCUN titre, AUCUN nom, AUCUNE description semés ne figurent dans le message', () => {
    const { tout, entetes, corps } = lireMessage(relais.messages[0]);

    for (const secret of SECRETS_SEMES) {
      assert.ok(
        !tout.includes(secret),
        `FUITE : « ${secret} » est sorti par courriel.\n--- en-têtes ---\n${entetes}\n--- corps ---\n${corps}`,
      );
    }
    // Et le marqueur lui-même, sous toutes ses formes — un titre tronqué,
    // encodé, ou recopié dans un en-tête resterait reconnaissable.
    assert.ok(!tout.includes(MARQUE), `FUITE : la marque « ${MARQUE} » est sortie.`);
    assert.ok(
      !Buffer.from(relais.messages[0].donnees, 'utf8').includes(Buffer.from(MARQUE, 'utf8')),
      'FUITE : la marque figure dans les octets bruts remis au relais.',
    );
  });

  test("le nom du destinataire lui-même n'est pas dans le corps — la règle ne fait pas d'exception", () => {
    const { corps } = lireMessage(relais.messages[0]);
    assert.ok(!corps.includes('Marie'), 'aucune valeur de personnes.nom dans le corps');
    assert.match(corps, /^Bonjour,/u, 'la salutation est sans nom');
  });

  test('la raison sociale de la filiale ne sort pas non plus', () => {
    const { tout } = lireMessage(relais.messages[0]);
    assert.ok(!tout.includes('Essai Toulouse'));
    assert.ok(!tout.includes('ZZESSA'));
    assert.ok(!tout.includes(FILIALE_A));
  });

  /* ── La trace ─────────────────────────────────────────────────────────── */

  test('un envoi est un acte tracé : le NOMBRE de destinataires, jamais leur liste', async () => {
    const entrees = await journalAdministration();
    assert.equal(entrees.length, 1, 'une entrée « administration » pour ce passage');
    const entree = entrees[0];
    assert.equal(entree.resume, 'Relance des échéances par courriel');
    assert.equal(entree.filiale_id, FILIALE_A);
    assert.equal(entree.utilisateur_libelle, 'systeme-relances');
    assert.equal(entree.valeurs_apres.destinataires, 1);
    assert.equal(entree.valeurs_apres.messages_expedies, 1);
    // 6 et non 5, et l'écart est le point : `echeances` compte les obligations
    // DUES dans l'horizon (six), `Total` du courriel compte celles de Marie
    // (cinq). La sixième — la déclaration d'incident — n'a pas de responsable ;
    // elle est comptée à part plutôt que tue, sans quoi un exploitant ne verrait
    // jamais qu'une obligation NIS2 n'est relancée à personne.
    assert.equal(entree.valeurs_apres.echeances, 6);
    assert.equal(entree.valeurs_apres.sans_destinataire, 1);

    const serialisee = JSON.stringify(entree);
    assert.ok(!serialisee.includes(ADRESSE_MARIE), 'aucune adresse au journal');
    assert.ok(!serialisee.includes(MARQUE), 'aucune valeur métier au journal');
  });

  /* ── Les règles d'échéance ───────────────────────────────────────────── */

  test('une action TERMINÉE et une échéance à 60 jours ne sont pas relancées', () => {
    const { corps } = lireMessage(relais.messages[0]);
    // Deux actions sont dans l'horizon nominal (une en retard) mais une seule
    // est ouverte : si « terminée » n'était pas exclue, le plan d'actions
    // compterait 2 au lieu de 1, et l'action lointaine ferait 3.
    assert.match(corps, new RegExp(`${SOURCES.action.libelle} \\.+ 1`, 'u'));
  });
});

describe('L12 — deux exécutions rapprochées n’envoient pas deux fois', () => {
  let relais;
  let contexte;

  before(async () => {
    relais = await monterRelaisEssai();
    contexte = await ouvrirContexte(base, smtpVers(relais));
  });
  after(async () => {
    await contexte?.fermer();
    await relais?.fermer();
  });

  test('le second passage, cinq minutes plus tard, n’expédie rien', async () => {
    const options = { expedition: { tlsSupplement: { ca: relais.autorite } } };

    // La fenêtre a déjà été réclamée par la famille précédente, à REFERENCE.
    const cinqMinutes = new Date(REFERENCE.getTime() + 5 * 60_000);
    const second = await envoyerRelances(contexte.pool, contexte.config, {
      ...options,
      reference: cinqMinutes,
    });
    assert.equal(second.messagesExpedies, 0);
    assert.equal(relais.messages.length, 0, 'aucun message ne doit atteindre le relais');
    assert.equal(second.filiales.every((f) => !f.fenetreReclamee), true);

    // …et le lendemain, si. La fenêtre vaut 20 h : +21 h la rouvre.
    const lendemain = new Date(REFERENCE.getTime() + 21 * 3600_000);
    const troisieme = await envoyerRelances(contexte.pool, contexte.config, {
      ...options,
      reference: lendemain,
    });
    assert.equal(troisieme.messagesExpedies, 1, 'la fenêtre doit se rouvrir après 20 h');
    assert.equal(relais.messages.length, 1);
  });

  test('deux passages SIMULTANÉS : un seul réclame la fenêtre', async () => {
    // 24 h plus tard : la fenêtre est de nouveau ouverte. Deux passages partent
    // ensemble, comme le minuteur et une relance manuelle le feraient.
    const quand = new Date(REFERENCE.getTime() + 46 * 3600_000);
    const options = {
      reference: quand,
      expedition: { tlsSupplement: { ca: relais.autorite } },
    };
    const avant = relais.messages.length;
    const [a, b] = await Promise.all([
      envoyerRelances(contexte.pool, contexte.config, options),
      envoyerRelances(contexte.pool, contexte.config, options),
    ]);
    assert.equal(
      a.messagesExpedies + b.messagesExpedies,
      1,
      'la réclamation doit être atomique : un seul des deux passages envoie',
    );
    assert.equal(relais.messages.length - avant, 1);
  });
});

describe('L12 — un relais injoignable ne casse rien', () => {
  test("aucune écriture n'échoue, la fenêtre est rendue, et la trace est exploitable", async () => {
    // Un port sur lequel personne n'écoute : le relais est injoignable.
    const mort = await monterRelaisEssai();
    const portMort = mort.port;
    await mort.fermer();

    const contexte = await ouvrirContexte(
      base,
      smtpVers({ hote: '127.0.0.1', port: portMort, utilisateur: 'x', motDePasse: 'y' }),
    );
    try {
      const quand = new Date(REFERENCE.getTime() + 96 * 3600_000);
      const bilan = await envoyerRelances(contexte.pool, contexte.config, {
        reference: quand,
        expedition: { delaiMs: 3000 },
      });

      assert.equal(bilan.messagesExpedies, 0);
      assert.equal(bilan.messagesEchoues, 1, "l'échec doit être compté, pas avalé");
      const filiale = bilan.filiales.find((f) => f.filialeId === FILIALE_A);
      assert.ok(filiale.motifEchec, 'un motif exploitable, pas un silence');
      assert.match(filiale.motifEchec, /injoignable|ECONNREFUSED/u);

      // ⚠️ Les échéances existent toujours : aucune écriture métier n'a été
      // touchée. C'est la matière de « l'envoi ne bloque jamais l'écriture ».
      const proprietaire = await base.connexion('proprietaire');
      const restantes = await base.avecPerimetre(
        proprietaire,
        perimetre('observateur', FILIALE_A, [FILIALE_A]),
        async (c) => (await c.query(`select count(*)::int as n from "actions"`)).rows[0].n,
      );
      assert.ok(restantes >= 3, `les actions doivent être intactes (${restantes})`);

      // La fenêtre a été RENDUE : le passage suivant réessaie immédiatement.
      const marque = await base.avecPerimetre(
        proprietaire,
        perimetre('observateur', FILIALE_A, [FILIALE_A]),
        async (c) =>
          (
            await c.query(
              `select "valeur" from "parametres"
                where "cle" = 'notifications.derniere_relance' and "filiale_id" = $1`,
              [FILIALE_A],
            )
          ).rows[0].valeur,
      );
      assert.ok(
        new Date(marque).getTime() < quand.getTime(),
        'la fenêtre doit avoir été rendue, donc porter une date antérieure à ce passage',
      );

      // Et la trace dit ce qui s'est passé, sans adresse.
      const entrees = await journalAdministration();
      const derniere = entrees[entrees.length - 1];
      assert.equal(derniere.valeurs_apres.messages_echoues, 1);
      assert.equal(derniere.valeurs_apres.fenetre_rendue, true);
      assert.ok(derniere.valeurs_apres.motif_echec);
      assert.ok(!JSON.stringify(derniere).includes('@exemple.interne'));
    } finally {
      await contexte.fermer();
    }
  });
});

describe('L12 — sans configuration SMTP, le lot ne fait rien et ne casse rien', () => {
  test('SMTP_ACTIF=non : bilan inactif, aucun envoi, aucune exception', async () => {
    const contexte = await ouvrirContexte(base, { actif: false });
    const avertissements = [];
    try {
      const bilan = await envoyerRelances(
        contexte.pool,
        contexte.config,
        { reference: new Date(REFERENCE.getTime() + 200 * 3600_000) },
        {
          error: () => {},
          info: () => {},
          warn: (d, m) => avertissements.push(m),
        },
      );
      assert.equal(bilan.actif, false);
      assert.equal(bilan.messagesExpedies, 0);
      assert.equal(bilan.filiales.length, 0);
      assert.equal(avertissements.length, 1, "un avertissement au journal technique, et un seul");
      assert.match(avertissements[0], /SMTP_ACTIF=non/u);
    } finally {
      await contexte.fermer();
    }
  });
});

describe('L12 — réessayer ou non : ce que la fenêtre fait d’un échec', () => {
  /**
   * ⚠️ Cette famille éprouve la RÈGLE DE REPRISE, et elle existe parce que la
   * première rédaction était fausse : la fenêtre était rendue quand « aucun
   * échec n'était permanent ». Sur trois destinataires dont un porte une adresse
   * mal formée et deux tombent sur un relais qui répond 4xx, cette formulation
   * gardait la fenêtre — et les deux qui auraient reçu demain ne recevaient
   * jamais. La question juste est *« y a-t-il quelque chose que réessayer
   * changerait ? »*.
   *
   * Le montage : **une adresse mal formée dans l'annuaire** (échec permanent,
   * prononcé avant même d'ouvrir une prise) à côté d'une adresse valide, et un
   * relais qui refuse tout le monde — en 4xx d'abord, en 5xx ensuite.
   */
  const MAL_FORMEE = 'pas du tout une adresse';

  before(async () => {
    // ⚠️ Le compte d'annuaire est INDISPENSABLE depuis la porte S6 : une relance
    // ne s'adresse qu'à une fiche que l'annuaire résout. `utilisateurs` est de
    // niveau Groupe, d'où la transaction déclarée à part.
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur-l12', FILIALE_A, [FILIALE_A], true),
      async (c) => {
        await c.query(
          `insert into utilisateurs (id, identifiant, nom_affichage)
                values ('USER-MALFORMEE', 'compte.malformee', 'Adresse Cassee')
             on conflict (id) do nothing`,
        );
      },
      { annuler: false },
    );
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur-l12', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `insert into personnes (id, filiale_id, nom, email, utilisateur_id)
               values ('PERS-MALFORMEE', $1, 'Adresse Cassee', $2, 'USER-MALFORMEE')`,
          [FILIALE_A, MAL_FORMEE],
        );
        await c.query(
          `insert into actions (id, filiale_id, titre, statut, responsable, echeance)
               values ('ACT-MALFORMEE', $1, 'Action d''une adresse cassée', 'à faire', 'Adresse Cassee', $2)`,
          [FILIALE_A, new Date(REFERENCE.getTime() + 400 * 3600_000).toISOString().slice(0, 10)],
        );
      },
      { annuler: false },
    );
  });

  /** Lit la marque anti-doublon de la filiale A. */
  const marque = async () => {
    const proprietaire = await base.connexion('proprietaire');
    return await base.avecPerimetre(
      proprietaire,
      perimetre('observateur', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            `select "valeur" from "parametres"
              where "cle" = 'notifications.derniere_relance' and "filiale_id" = $1`,
            [FILIALE_A],
          )
        ).rows[0]?.valeur ?? null,
    );
  };

  test('un 4xx à côté d’une adresse mal formée REND la fenêtre : demain vaut le coup', async () => {
    const relais = await monterRelaisEssai({ refuserRcpt: 451 });
    const contexte = await ouvrirContexte(base, smtpVers(relais));
    try {
      const quand = new Date(REFERENCE.getTime() + 400 * 3600_000);
      const bilan = await envoyerRelances(contexte.pool, contexte.config, {
        reference: quand,
        expedition: { tlsSupplement: { ca: relais.autorite } },
      });
      const a = bilan.filiales.find((f) => f.filialeId === FILIALE_A);

      // ⚠️ La matière : DEUX destinataires, DEUX échecs, dont un permanent et un
      // passager. Sans les deux natures, la règle ne serait pas mise à l'épreuve.
      assert.equal(a.destinataires, 2, JSON.stringify(a));
      assert.equal(bilan.messagesExpedies, 0);
      assert.equal(a.messagesEchoues, 2);

      assert.ok(
        new Date(await marque()).getTime() < quand.getTime(),
        'la fenêtre doit être rendue : le 451 se réessaie',
      );
    } finally {
      await contexte.fermer();
      await relais.fermer();
    }
  });

  test('des échecs tous PERMANENTS gardent la fenêtre : réessayer ne changerait rien', async () => {
    const relais = await monterRelaisEssai({ refuserRcpt: true }); // 550
    const contexte = await ouvrirContexte(base, smtpVers(relais));
    try {
      const quand = new Date(REFERENCE.getTime() + 500 * 3600_000);
      const bilan = await envoyerRelances(contexte.pool, contexte.config, {
        reference: quand,
        expedition: { tlsSupplement: { ca: relais.autorite } },
      });
      const a = bilan.filiales.find((f) => f.filialeId === FILIALE_A);
      assert.equal(a.destinataires, 2);
      assert.equal(bilan.messagesExpedies, 0);
      assert.equal(a.messagesEchoues, 2);

      assert.equal(
        new Date(await marque()).getTime(),
        quand.getTime(),
        'la fenêtre doit être GARDÉE : rejouer un 550 ne ferait que le rejouer',
      );
    } finally {
      await contexte.fermer();
      await relais.fermer();
    }
  });

  test('une adresse mal formée de l’annuaire ne devient jamais une commande SMTP', async () => {
    const relais = await monterRelaisEssai();
    const contexte = await ouvrirContexte(base, smtpVers(relais));
    try {
      await envoyerRelances(contexte.pool, contexte.config, {
        reference: new Date(REFERENCE.getTime() + 600 * 3600_000),
        expedition: { tlsSupplement: { ca: relais.autorite } },
      });
      // Le destinataire valide reçoit ; le mal formé n'atteint jamais le fil.
      assert.equal(relais.messages.length, 1);
      assert.deepEqual(relais.messages[0].a, [ADRESSE_MARIE]);
      assert.ok(
        !relais.commandes.some((c) => c.includes('pas du tout')),
        'FUITE : une adresse mal formée a atteint le relais',
      );
    } finally {
      await contexte.fermer();
      await relais.fermer();
    }
  });
});

describe('L12 — une filiale en échec n’emporte pas les dix-neuf autres', () => {
  /**
   * ⚠️ **La matière est une VRAIE panne de base, pas une doublure.** La filiale B
   * reçoit une ligne `parametres` marquée `secret = true`, sur la clé même que la
   * fenêtre anti-doublon emploie : `ck_parametres_secret` interdit alors d'y
   * écrire une valeur (« not secret or (valeur is null and reference_secret is
   * not null) »). La réclamation de la fenêtre échoue donc en `23514`, pour cette
   * filiale et pour elle seule — la figure d'une donnée aberrante posée par
   * l'exploitation.
   *
   * Sans cet essai, la propriété serait une intention : la première rédaction
   * laissait l'exception remonter, et **une filiale abîmée privait le groupe
   * entier de ses relances** ce jour-là.
   */
  before(async () => {
    await semerEcheances(base, applicatif, FILIALE_B, REFERENCE, {
      suffixe: 'B',
      responsable: 'Responsable Allemagne',
      email: 'resp.allemagne@exemple.interne',
    });
    await base.avecPerimetre(
      applicatif,
      perimetre('exploitant', FILIALE_B, [FILIALE_B]),
      async (c) => {
        await c.query(
          `insert into parametres (id, filiale_id, categorie, cle, secret, reference_secret)
               values ('PARAM-CASSE', $1, 'notifications', 'notifications.derniere_relance',
                       true, 'coffre://inexistant')`,
          [FILIALE_B],
        );
      },
      { annuler: false },
    );
  });

  test('la filiale saine est servie, la filiale abîmée est NOMMÉE, et rien n’est perdu', async () => {
    const relais = await monterRelaisEssai();
    const contexte = await ouvrirContexte(base, smtpVers(relais));
    try {
      const bilan = await envoyerRelances(contexte.pool, contexte.config, {
        reference: new Date(REFERENCE.getTime() + 700 * 3600_000),
        expedition: { tlsSupplement: { ca: relais.autorite } },
      });

      assert.equal(bilan.filiales.length, 2, 'les deux filiales doivent figurer au bilan');
      const a = bilan.filiales.find((f) => f.filialeId === FILIALE_A);
      const b = bilan.filiales.find((f) => f.filialeId === FILIALE_B);

      // La saine a bien été servie — c'est la moitié qui prouve l'isolement.
      assert.equal(a.erreurBase, null);
      assert.ok(a.messagesExpedies >= 1, JSON.stringify(a));

      // L'abîmée est nommée, avec son motif, et comptée.
      assert.ok(b.erreurBase, 'la filiale en échec doit porter son motif');
      assert.equal(bilan.filialesEnErreur, 1);
      assert.equal(b.messagesExpedies, 0);

      // Le relais n'a reçu que ce qui devait partir.
      assert.equal(relais.messages.length, a.messagesExpedies);
      assert.ok(!relais.messages.some((m) => m.a.includes('resp.allemagne@exemple.interne')));
    } finally {
      await contexte.fermer();
      await relais.fermer();
    }
  });
});
