/**
 * preuve-et-horloge.test.mjs — **les deux capacités du lot L19/L20 arrivent-elles
 * jusqu'à l'utilisateur ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cet essai existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/attestations/lecture.test.mjs` et `test/reglementaire/horloge.test.mjs`
 * prouvent que les ROUTES tiennent. Cela ne prouvait rien de ce qui compte : au
 * moment d'écrire ces lignes, **aucun écran n'appelait ces routes**, et le
 * drapeau `documents.attestation_requise` — la seule chose qui déclenche toute
 * la chaîne — **n'était posable par aucun formulaire**. Deux lots livrés,
 * éprouvés, verts, et **inaccessibles**.
 *
 * C'est la classe du constat **Q-325** prise par l'autre bout : *l'essai prouvait
 * que le mécanisme fonctionne ; personne ne mesurait ce que l'utilisateur
 * reçoit.* Ici, ce que l'utilisateur reçoit est le sujet entier.
 *
 * ── LES SIX PROPRIÉTÉS ──────────────────────────────────────────────────
 *
 *  §1 **Le drapeau se pose depuis l'écran, et il revient.** On coche la case, on
 *     enregistre, on **recharge tout** — donc on repasse par `/api/donnees` — et
 *     le panneau change d'état. Sans ce §, la capacité reste injoignable.
 *
 *  §2 **J'atteste depuis l'écran, et la couverture bouge.** Le taux passe d'un
 *     chiffre à un autre, et les deux sont mesurés dans le DOM rendu.
 *
 *  §3 **Ni la personne ni la version ne voyagent depuis le navigateur.** Mesuré
 *     sur le corps HTTP réellement émis, pas sur le code source : c'est la seule
 *     façon de s'assurer qu'aucune signature ne les a réintroduits.
 *
 *  §4 **Le tableau de bord DIT ce qui reste à lire, et pourquoi.** « Jamais lue »
 *     et « Révisée » n'appellent pas la même réaction ; les confondre est la
 *     classe Q-201 / Q-207.
 *
 *  §5 **Les QUATRE paliers réglementaires arrivent à l'écran, avec leur texte.**
 *     Le bandeau qu'ils remplacent n'en annonçait que trois, et il les recopiait
 *     dans le navigateur — deux rédactions de la même obligation.
 *
 *  §6 **Un titre HOSTILE ressort échappé**, et l'essai le fait DÉCIDER : sans un
 *     titre qui porte des chevrons, retirer `escapeHtml` de ces deux fichiers
 *     laisserait tout au vert (constats Q-210, Q-305).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

const DELAI = 60_000;

/**
 * ⚠️ **L'identité de la session provisoire est « developpement »**, et c'est
 * `utilisateurId` — la clé primaire d'`utilisateurs`, pas un identifiant de
 * connexion (`src/api/session.ts`). Une personne rattachée à autre chose ne
 * serait jamais reconnue, et le panneau dirait « votre compte n'a pas de fiche »
 * sans que rien ne soit cassé.
 */
const COMPTE_SESSION = 'developpement';

/** Un titre qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const TITRE_HOSTILE = 'Charte <img src=x onerror="window.__xss=1">';

let base;
let navigateur;
let serveur;
let application;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));

  const applicatif = await base.connexion('app');
  await base.avecPerimetre(
    applicatif,
    // ⚠️ `administrationGroupe` — quatrième argument. Sans lui, l'insertion dans
    // `utilisateurs` est refusée en 42501 : sa politique d'écriture est réservée
    // à l'administration Groupe ou à la transaction d'ouverture de session
    // (migration `007`, constat M-2 de la porte S1). Le fonctionnement courant
    // n'écrit pas là, et c'est voulu.
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      // Le compte que la session provisoire portera, et la personne qui lui
      // correspond : c'est ce rattachement qui fait qu'on peut attester.
      await c.query(
        `insert into utilisateurs (id, identifiant, nom_affichage)
             values ($1, 'developpement', 'Compte de développement')`,
        [COMPTE_SESSION],
      );
      await c.query(
        `insert into personnes (id, filiale_id, nom, utilisateur_id)
             values ('PERS-ATT-ECRAN', $1, 'Claire Vasseur', $2)`,
        [FILIALE_A, COMPTE_SESSION],
      );
      // Le document sur lequel tout se joue. Il part SANS attestation requise :
      // c'est l'écran qui doit pouvoir l'exiger (§1).
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, version_document,
                                confidentialite, attestation_requise)
             values ('DOC-PREUVE', $1, $2, 'en vigueur', '1.0', 'interne', false)`,
        [FILIALE_A, TITRE_HOSTILE],
      );
      // L'incident dont l'horloge doit partir. `detecte_le` est renseigné : on
      // mesure d'abord le cas NOMINAL, celui où l'origine est un instant.
      await c.query(
        `update incidents
            set declaration_anssi = 'à déclarer',
                declaration_cnil  = 'à déclarer',
                date_detection    = current_date,
                detecte_le        = now() - interval '2 hours'
          where id = 'INC-A'`,
      );
      // ⚠️ Le semis pose déjà une déclaration « nis2 / notification » sur INC-A.
      // On la retire : sinon le palier le plus visible arriverait déjà fait, et
      // le §5 mesurerait un écran où il ne reste rien à faire.
      await c.query(
        "delete from declarations_reglementaires where incident_id = 'INC-A'",
      );
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
  session = await ouvrirApplication();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

async function ouvrirApplication() {
  const s = await ouvrirPage(navigateur);
  await s.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await attendreApplication(s.page, { delai: DELAI }), 'chargee');
  await attendreQuiescence(s.page, { delai: DELAI });
  return s;
}

/** Va sur une route par l'ADRESSE — le geste réel. */
async function aller(page, route) {
  await page.evaluate((r) => {
    const cible = '#' + r;
    const app = document.getElementById('app');
    if (app !== null) app.innerHTML = '';
    if (window.location.hash === cible) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else window.location.hash = cible;
  }, route);
  await page.waitForFunction(
    () => (document.getElementById('app')?.innerHTML.trim().length ?? 0) > 0,
    null,
    { timeout: DELAI },
  );
  await attendreQuiescence(page, { delai: DELAI });
}

/** Attend qu'un panneau asynchrone ait remplacé son « Lecture… ». */
async function attendrePanneau(page, id) {
  await page.waitForFunction(
    (corpsId) => {
      const n = document.getElementById(corpsId);
      return n !== null && !/Lecture\s*…/u.test(n.textContent ?? '');
    },
    id,
    { timeout: DELAI },
  );
}

describe('la preuve de lecture et l’horloge réglementaire, jusqu’à l’écran', () => {
  test('§1 — le drapeau se pose DEPUIS L’ÉCRAN, et le panneau change d’état', async () => {
    const { page } = session;
    await aller(page, '/documents/DOC-PREUVE');
    await attendrePanneau(page, 'attestationsEncartCorps');

    // Avant : le panneau dit qu'il n'y a rien à faire, et il dit POURQUOI.
    const avant = await page.evaluate(
      () => document.getElementById('attestationsEncartCorps').textContent,
    );
    assert.match(avant, /n['’]exige pas d['’]attestation/u,
      'Un panneau vide sans motif est la classe Q-201 / Q-207.');
    assert.equal(
      await page.evaluate(() => document.getElementById('attestationsEncartBtn') !== null),
      false,
      'Le bouton d’attestation ne doit pas exister sur un document qui n’en demande pas.',
    );

    // La case existe — sans elle, la capacité entière est injoignable.
    assert.equal(
      await page.evaluate(() => document.getElementById('attestation_requise') !== null),
      true,
      'Sans cette case, aucun écran ne peut activer l’attestation de lecture.',
    );

    await page.evaluate(() => {
      document.getElementById('attestation_requise').checked = true;
    });
    await page.click('#saveBtn');
    await attendreQuiescence(page, { delai: DELAI });

    // ── LE RECHARGEMENT COMPLET : on repasse par /api/donnees ────────────
    session = await ouvrirApplication();
    await aller(session.page, '/documents/DOC-PREUVE');

    assert.equal(
      await session.page.evaluate(
        () => DataStore.getDocumentById('DOC-PREUVE').attestation_requise,
      ),
      true,
      'Le drapeau n’a pas survécu à l’aller-retour : le champ ne traverse pas la couche.',
    );
    assert.equal(
      await session.page.evaluate(() => document.getElementById('attestation_requise').checked),
      true,
      'La case revient décochée : le formulaire ne relit pas ce qu’il a écrit.',
    );
  });

  test('§2 et §3 — j’atteste, la couverture bouge, et rien d’identifiant ne part', async () => {
    const { page } = session;
    await attendrePanneau(page, 'attestationsEncartCorps');

    // Avant : personne n'a attesté. Le taux est mesuré DANS LE DOM RENDU.
    const tauxAvant = await page.evaluate(
      () => document.querySelector('.att-taux')?.textContent.replace(/\s/gu, '') ?? null,
    );
    assert.equal(tauxAvant, '0%', 'Le taux de départ doit être 0 %, et non « — ».');

    // ── §3 : on capture le corps RÉELLEMENT émis ─────────────────────────
    const corpsEmis = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/attestations/')) {
        corpsEmis.push(r.postData() ?? '');
      }
    });

    await page.evaluate(() => {
      document.getElementById('attestationsEncartReserve').value = 'Lu, sans réserve.';
      // La confirmation est native : on la neutralise, le geste n'est pas le sujet.
      window.confirm = () => true;
      document.getElementById('attestationsEncartBtn').click();
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.att-table tbody tr').length > 0,
      null,
      { timeout: DELAI },
    );

    assert.equal(corpsEmis.length, 1, 'Une attestation, une requête.');
    const envoye = JSON.parse(corpsEmis[0] || '{}');
    assert.deepEqual(Object.keys(envoye).sort(), ['commentaire'],
      'Le navigateur ne doit envoyer QUE le commentaire : ni la personne, ni la version. ' +
      'Une preuve qu’un tiers peut fabriquer ne prouve rien.');

    // Le taux a bougé, et la ligne porte le nom que le SERVEUR a résolu.
    const apres = await page.evaluate(() => ({
      taux: document.querySelector('.att-taux')?.textContent.replace(/\s/gu, '') ?? null,
      lignes: Array.from(document.querySelectorAll('.att-table tbody tr')).map(
        (tr) => tr.textContent,
      ),
    }));
    assert.notEqual(apres.taux, '0%', 'Le taux n’a pas bougé après une attestation.');
    assert.equal(apres.lignes.length, 1);
    assert.match(apres.lignes[0], /Claire Vasseur/u,
      'Le nom vient de l’annuaire, résolu par le serveur depuis la session.');
    assert.match(apres.lignes[0], /1\.0/u, 'La version figée doit être celle en vigueur.');
    assert.match(apres.lignes[0], /Lu, sans réserve\./u);
  });

  test('§4 — le tableau de bord dit ce qui reste à lire, et POURQUOI', async () => {
    // On révise le document : l'attestation posée au §2 devient périmée. C'est le
    // cas qu'on oublie, et c'est le plus important — ne compter que « jamais
    // attesté » ferait dire « tout le monde est à jour » le lendemain d'une
    // refonte de la PSSI.
    const applicatif = await base.connexion('app');
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          "update documents set version_document = '2.0' where id = 'DOC-PREUVE'",
        );
      },
      { annuler: false },
    );

    session = await ouvrirApplication();
    await aller(session.page, '/dashboard');
    await attendrePanneau(session.page, 'attestationsBlocCorps');

    const bloc = await session.page.evaluate(() => ({
      texte: document.getElementById('attestationsBlocCorps').textContent,
      items: Array.from(document.querySelectorAll('.att-a-faire-item')).map((li) => ({
        id: li.dataset.id,
        texte: li.textContent,
      })),
    }));
    assert.equal(bloc.items.length, 1, bloc.texte.slice(0, 200));
    assert.equal(bloc.items[0].id, 'DOC-PREUVE');
    assert.match(bloc.items[0].texte, /Révisée/u,
      'Le motif doit distinguer « révisée depuis » de « jamais lue ».');
    assert.match(bloc.items[0].texte, /1\.0/u, 'La version DÉJÀ lue se dit.');
    assert.match(bloc.items[0].texte, /2\.0/u, 'La version EN VIGUEUR se dit.');
  });

  test('§5 — les QUATRE paliers arrivent à l’écran, avec leur texte et leur origine', async () => {
    await aller(session.page, '/incidents/INC-A');
    await attendrePanneau(session.page, 'reglementaireEncartCorps');

    const vu = await session.page.evaluate(() => ({
      origine: document.querySelector('.reg-origine')?.textContent ?? '',
      lignes: Array.from(document.querySelectorAll('.reg-table tbody tr')).map(
        (tr) => tr.textContent,
      ),
      // Le bandeau qu'il remplace : il ne doit plus être rendu du tout.
      ancienBandeau: document.body.textContent.includes('alerte 24 h · notification 72 h'),
    }));

    assert.equal(vu.lignes.length, 4,
      'Trois paliers NIS2 et le 72 h du RGPD : le bandeau remplacé n’en annonçait que trois.');
    // Chaque ligne porte SA référence au texte. Un délai réglementaire sans sa
    // source est un chiffre que personne ne peut vérifier — et celui qui le
    // vérifiera est un auditeur.
    for (const reference of [
      'NIS2, article 23 §4 a)',
      'NIS2, article 23 §4 b)',
      'NIS2, article 23 §4 d)',
      'RGPD, article 33',
    ]) {
      assert.ok(
        vu.lignes.some((l) => l.includes(reference)),
        `La référence « ${reference} » n’arrive pas à l’écran.`,
      );
    }
    assert.match(vu.origine, /instant de détection/u,
      'L’origine de l’horloge se dit TOUJOURS : une horloge dont on ignore l’origine ne ' +
      'se défend pas devant l’ANSSI.');
    assert.equal(vu.ancienBandeau, false,
      'Le bandeau qui recopiait les délais dans le navigateur doit avoir disparu : deux ' +
      'rédactions de la même obligation réglementaire divergent au premier ajustement.');

    // Et l'on consigne une déclaration DÉJÀ FAITE — le seul geste que le produit
    // propose. Il n'existe aucun bouton « déclarer à l'ANSSI », et c'est le point.
    const boutons = await session.page.evaluate(() =>
      Array.from(document.querySelectorAll('#reglementaireEncart button')).map((b) =>
        b.textContent.trim(),
      ),
    );
    assert.deepEqual(boutons, ['Consigner'],
      'Le produit ne transmet rien à une autorité : un seul geste, et il CONSIGNE.');

    await session.page.evaluate(() => {
      document.getElementById('reglementaireEncartRef').value = 'ANSSI-2026-00042';
      document.getElementById('reglementaireEncartBtn').click();
    });
    await session.page.waitForFunction(
      () => document.querySelectorAll('.reg-ligne--ok').length > 0,
      null,
      { timeout: DELAI },
    );
    const consigne = await session.page.evaluate(
      () => document.querySelector('.reg-ligne--ok')?.textContent ?? '',
    );
    assert.match(consigne, /Déclarée/u);
  });

  test('§6 — un titre HOSTILE ressort échappé, des deux côtés', async () => {
    // Le document porte `<img src=x onerror=…>` dans son titre depuis le semis.
    // S'il était injecté brut, le navigateur poserait `window.__xss`.
    await aller(session.page, '/dashboard');
    await attendrePanneau(session.page, 'attestationsBlocCorps');

    const etat = await session.page.evaluate(() => ({
      xss: window.__xss === 1,
      imgInjectee: document.querySelector('.att-a-faire-titre img') !== null,
      titre: document.querySelector('.att-a-faire-titre')?.textContent ?? '',
    }));
    assert.equal(etat.xss, false, 'Le titre du document s’est exécuté : échappement manquant.');
    assert.equal(etat.imgInjectee, false, 'Le balisage du titre a été interprété.');
    assert.match(etat.titre, /<img src=x/u,
      'Le titre doit s’afficher TEL QU’IL EST SAISI, chevrons compris.');
  });
});
