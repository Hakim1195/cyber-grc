/**
 * sortie-agregateur.test.mjs — **LA COPIE DU JOURNAL VERS UN AGRÉGATEUR DE LOGS**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cette famille mesure, et pourquoi chaque point y est
 * ════════════════════════════════════════════════════════════════════════
 *
 * Chaque entrée du journal d'audit est aussi écrite en une ligne JSON sur la
 * sortie standard, que `journald` recueille et qu'un `rsyslog` pousse vers
 * Graylog. Trois propriétés font toute la valeur de ce flux, et chacune se
 * perdrait sans bruit :
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | La ligne part, et elle porte QUI / QUOI / QUAND / sur QUEL objet |
 * | 2 | ⚠️ Elle ne porte **NI `valeurs_avant`, NI `valeurs_apres`** |
 * | 3 | ⚠️ Elle ne part **QU'APRÈS LE COMMIT** — un `rollback` ne laisse rien |
 * | 4 | Elle ne dépend **PAS** du niveau de journalisation du serveur |
 * | 5 | Une sortie qui échoue ne fait pas échouer la transaction |
 * | 6 | ⚠️ Une entrée **transversale** (sans filiale) s'écrit quand même |
 *
 * ── ⚠️ POURQUOI LE §3 EST LE PLUS IMPORTANT ──────────────────────────────
 *
 * `journaliser()` écrit DANS la transaction de l'appelant. Émettre la ligne au
 * moment de l'écriture mettrait dans le SIEM un événement que le `rollback`
 * efface ensuite de la base — une fausse accusation, et qui ne se corrige pas
 * une fois partie. C'est le constat **Q-301** déplacé d'un cran : là-bas le
 * journal inscrivait de fausses extractions, indélébiles trois ans ; ici la
 * copie serait indélébile chez quelqu'un d'autre.
 *
 * ── ET LE §2 EST UNE DÉCISION, PAS UN OUBLI ──────────────────────────────
 *
 * Le constat **Q-330** a rangé le CONTENU des enregistrements sous le **droit
 * d'export**, distinct de la lecture. Un flux continu vers un agrégateur n'a ni
 * identité ni droit : y verser le différentiel serait un export permanent que
 * personne n'a autorisé, vers un système où le cloisonnement par filiale
 * n'existe pas.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, RACINE_BACKEND } from '../aide/serveur.mjs';

let base;
let applicatif;
let journal;
let pool;
/** Un vrai pool : `avecTransaction` en prend un, pas un client. */
let pilote;

/** Les lignes captées à la place de la sortie standard. */
let captees = [];

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  journal = await moduleCompile('auth/journal.js');
  pool = await moduleCompile('db/pool.js');
  // ⚠️ Un POOL réel, et le même que la production emprunte : c'est
  // `avecTransaction` qu'on éprouve, pas une transaction simulée.
  pilote = new pg.Pool({
    host: base.reglages.hote,
    port: base.reglages.port,
    database: base.nom,
    user: base.reglages.app.nom,
    password: base.reglages.app.motDePasse,
    max: 2,
    application_name: 'cyber-grc-essai-sortie-journal',
  });
  journal.brancherSortieJournal((ligne) => captees.push(ligne));
});

after(async () => {
  journal?.brancherSortieJournal(null);
  await pilote?.end();
  await base?.fermer();
});

/** Écrit une entrée par le VRAI chemin : `avecTransaction` puis `journaliser`. */
async function ecrireEntree(champs = {}, { echouer = false } = {}) {
  captees = [];
  const travail = async (client) => {
    await journal.journaliser(client, {
      action: champs.action ?? 'connexion_reussie',
      resume: champs.resume ?? 'Essai de sortie vers l’agrégateur',
      utilisateurLibelle: champs.utilisateur ?? 'jdupont',
      filialeId: champs.filialeId ?? FILIALE_A,
      sessionId: champs.sessionId ?? 'SESS-ESSAI',
      adresseIp: champs.adresseIp ?? '10.0.0.7',
      entiteType: champs.entiteType ?? null,
      entiteId: champs.entiteId ?? null,
      valeursAvant: champs.valeursAvant ?? null,
      valeursApres: champs.valeursApres ?? null,
    });
    if (echouer) throw new Error('échec volontaire APRÈS l’écriture du journal');
    return true;
  };
  // ⚠️ Le périmètre au format de l'API — `utilisateurId`, pas `utilisateur`.
  //    Le mélange rend une erreur dont la pile désigne `validerPerimetre`
  //    (`docs/REPRISE.md` §5.7), et l'essai croirait avoir mesuré autre chose.
  return await pool.avecTransaction(
    pilote,
    {
      utilisateurId: 'jdupont',
      filialeId: FILIALE_A,
      filiales: [FILIALE_A],
      perimetreGroupe: false,
      administrationGroupe: false,
    },
    travail,
  );
}

describe('La copie du journal vers un agrégateur de logs', () => {
  test('§1 — la ligne part, et elle dit QUI a fait QUOI, QUAND, sur QUEL objet', async () => {
    await ecrireEntree({ resume: 'Connexion réussie' });

    assert.equal(captees.length, 1, 'Une entrée écrite doit produire une ligne, et une seule.');
    const ligne = captees[0];
    assert.equal(ligne.flux, 'journal_audit', 'Le marqueur de flux est ce par quoi un agrégateur route.');
    assert.equal(ligne.action, 'connexion_reussie');
    assert.equal(ligne.utilisateur, 'jdupont');
    assert.equal(ligne.filiale_id, FILIALE_A);
    assert.equal(ligne.adresse_ip, '10.0.0.7');
    assert.equal(ligne.resume, 'Connexion réussie');
    assert.match(ligne.heure, /^\d{4}-\d{2}-\d{2}T/u, 'L’heure doit être comparable à celle du registre.');
  });

  test('§2 — elle ne porte NI valeurs_avant, NI valeurs_apres', async () => {
    await ecrireEntree({
      action: 'modification',
      entiteType: 'risques',
      entiteId: 'RISK-A',
      resume: 'Modification d’un risque',
      valeursAvant: { nom: 'Ancien nom très sensible' },
      valeursApres: { nom: 'Nouveau nom très sensible' },
    });

    const ligne = captees[0];
    assert.notEqual(ligne, undefined);
    const texte = JSON.stringify(ligne);
    assert.equal(
      texte.includes('sensible'),
      false,
      'Le CONTENU des enregistrements est parti vers l’agrégateur. Le constat Q-330 le range ' +
        'sous le DROIT D’EXPORT, distinct de la lecture : un flux continu n’a ni identité ni ' +
        'droit, et le verser là serait un export permanent que personne n’a autorisé — vers ' +
        'un système où le cloisonnement par filiale n’existe pas.',
    );
    for (const interdit of ['valeurs_avant', 'valeurs_apres', 'valeursAvant', 'valeursApres']) {
      assert.equal(Object.hasOwn(ligne, interdit), false, `« ${interdit} » ne doit pas voyager.`);
    }
    // Contrôle de matière : la ligne dit quand même QUI a fait QUOI sur QUEL objet.
    assert.equal(ligne.entite_type, 'risques');
    assert.equal(ligne.entite_id, 'RISK-A');
  });

  test('§3 — un ROLLBACK ne laisse RIEN partir', async () => {
    // ⚠️ LA PROPRIÉTÉ CENTRALE. Sans elle, le SIEM recevrait des événements que la
    // base n'a jamais gardés — et une fausse accusation partie chez quelqu'un
    // d'autre ne se corrige pas (classe du constat Q-301).
    await assert.rejects(() => ecrireEntree({ resume: 'Ne doit jamais arriver' }, { echouer: true }));

    assert.deepEqual(
      captees,
      [],
      'Une transaction annulée a tout de même émis sa ligne. Le SIEM porterait un événement ' +
        'que la base n’a pas gardé.',
    );

    // Et la base non plus ne l'a pas gardée : le contrôle de matière du contrôle.
    const reste = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query("select count(*)::int as n from journal_audit where resume = 'Ne doit jamais arriver'")
        ).rows[0].n,
    );
    assert.equal(Number(reste), 0, 'L’entrée annulée ne doit pas non plus être en base.');
  });

  test('§4 — la sortie ne dépend PAS du niveau de journalisation', async () => {
    // ⚠️ Elle n'emprunte pas le logger du serveur, et c'est le point : avec
    // `SERVEUR_NIVEAU_JOURNAL=warn`, une ligne émise en « info » disparaîtrait EN
    // SILENCE — un réglage d'exploitation ferait taire la piste d'audit sans que
    // personne l'ait voulu. On mesure donc que la fonction par défaut écrit
    // directement sur la sortie standard, sans consulter aucun niveau.
    const source = journal.brancherSortieJournal.toString();
    assert.equal(typeof journal.brancherSortieJournal, 'function');
    assert.equal(
      source.includes('niveau') || source.includes('level'),
      false,
      'Le branchement consulte un niveau de journalisation : la piste d’audit deviendrait ' +
        'silencieuse sur un serveur réglé en « warn ».',
    );
    // ⚠️ Et il n'existe AUCUN interrupteur de configuration : le couper se fait
    // chez le consommateur (une règle rsyslog), jamais par un réglage du produit.
    // Un réglage de plus serait un réglage de plus à oublier, et son oubli ferait
    // disparaître la piste d'audit du SIEM sans qu'aucun écran ne le dise.
    const exemple = readFileSync(join(RACINE_BACKEND, '.env.example'), 'utf8');
    assert.equal(
      /JOURNAL_SORTIE|SIEM|SYSLOG|AGREGATEUR/u.test(exemple),
      false,
      'Un réglage d’activation de la copie est apparu : le couper doit se faire chez le ' +
        'consommateur, pas dans le produit.',
    );
  });

  test('§6 — UNE ENTRÉE TRANSVERSALE (sans filiale) s’écrit quand même', async () => {
    // ⚠️ **LA RÉGRESSION QUE CE CONTRÔLE FIGE, ET QUI A ÉTÉ TROUVÉE PAR LE BANC.**
    //
    // La première rédaction de la copie lisait le numéro de chaîne par
    // `insert … returning`. PostgreSQL applique la politique de LECTURE au
    // `returning` : une entrée sans filiale — démarrage, arrêt, refus
    // d'autorisation — n'est lisible par personne, et l'insertion échouait en
    // 42501. Or ces appelants-là sont précisément ceux qui ont le droit
    // d'envelopper `journaliser()` dans un `try` : l'échec était AVALÉ, et le
    // service démarrait sans tracer son propre démarrage.
    //
    // *Un enrichissement de confort avait cassé la piste d'audit, en silence.*
    captees = [];
    const travail = async (client) => {
      await journal.journaliser(client, {
        action: 'demarrage',
        resume: 'Démarrage du service applicatif.',
        utilisateurLibelle: 'systeme',
        filialeId: null,
      });
      return true;
    };
    // ⚠️ `PERIMETRE_SYSTEME`, l'OBJET exporté — pas une copie de son contenu.
    //    La dispense de `validerPerimetre` tient à l'identité de l'objet, et un
    //    littéral de même forme est refusé : c'est ce qui empêche un appelant de
    //    s'octroyer le périmètre système en recopiant ses champs.
    await pool.avecTransaction(pilote, pool.PERIMETRE_SYSTEME, travail);

    assert.equal(captees.length, 1, 'Une entrée transversale doit produire sa ligne, comme les autres.');
    assert.equal(captees[0].filiale_id, null);
    assert.equal(captees[0].action, 'demarrage');

    const enBase = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            "select count(*)::int as n from journal_audit where action = 'demarrage' and filiale_id is null",
          )
        ).rows[0].n,
    );
    // ⚠️ Elle est en BASE même si la session d'essai ne la voit pas : le compte
    //    peut valoir zéro par la politique de lecture, et c'est correct. Ce qui
    //    compte est que l'écriture n'ait pas ÉCHOUÉ — ce que l'absence de rejet
    //    ci-dessus établit, et que ce compte ne peut ni confirmer ni démentir.
    assert.ok(Number(enBase) >= 0);
  });

  test('§5 — une sortie qui ÉCHOUE ne fait pas échouer la transaction', async () => {
    // Le registre en base est la source ; la copie est un confort de corrélation.
    // La perdre ne doit rien casser — sans quoi un agrégateur en panne emporterait
    // le produit avec lui.
    journal.brancherSortieJournal(() => {
      throw new Error('agrégateur indisponible');
    });
    try {
      await assert.doesNotReject(() => ecrireEntree({ resume: 'La sortie tombe, pas le produit' }));
    } finally {
      journal.brancherSortieJournal((ligne) => captees.push(ligne));
    }

    const present = await base.avecPerimetre(
      applicatif,
      perimetre('temoin', FILIALE_A, [FILIALE_A]),
      async (c) =>
        (
          await c.query(
            "select count(*)::int as n from journal_audit where resume = 'La sortie tombe, pas le produit'",
          )
        ).rows[0].n,
    );
    assert.equal(Number(present), 1, 'L’entrée doit être en base malgré l’échec de la copie.');
  });
});
