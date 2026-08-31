/**
 * constats-s2.test.mjs — les trois bloquants de la porte S2, rejoués dans un vrai
 * navigateur.
 *
 * ── Ce que ces tests sont ────────────────────────────────────────────────────
 *
 * Des **tests de non-régression**, écrits d'après le rapport et non d'après le
 * correctif. Chacun rejoue le scénario que l'auditeur a joué, et exige le
 * comportement que le cadrage impose — « Aucune perte » (`PLAN_SERVEUR` §0.1).
 *
 * | Constat | Ce qu'il détruisait | Ce que le test exige |
 * |---|---|---|
 * | **B-1** | Toutes les données de la version locale d'une filiale, **avant toute reprise** | Ouvrir l'application ne détruit rien, même quand le serveur est injoignable |
 * | **B-2** | Toute la saisie ultérieure sur une fiche bloquée | Masquer le bandeau ne fait jamais dire à l'application « rien en attente » |
 * | **B-3** | Le jeu de données d'une filiale entière | L'import « Remplacer » ne détruit rien hors transaction, et l'écran ne promet plus un filet qui n'existe pas |
 *
 * ── Ce que ces tests ne sont pas ─────────────────────────────────────────────
 *
 * Ils ne vérifient pas QUE le correctif choisi est celui-ci ou celui-là. Ils
 * vérifient que **la donnée survit**. Un correctif différent qui préserverait la
 * donnée les ferait passer, et c'est voulu : un test qui épouse une implémentation
 * meurt au premier remaniement, et l'on cesse alors de le croire.
 *
 * ── Contrôle de morsure ──────────────────────────────────────────────────────
 *
 * Chacun a été joué contre le code d'AVANT le correctif (`git show ff35ea0:…`, la
 * révision que l'auditeur a examinée) sur une copie hors dépôt, et chacun tombe. Le
 * détail est dans le rapport de l'agent : un test de non-régression qui n'a jamais
 * vu la régression ne prouve rien.
 *
 * Prérequis machine : PostgreSQL préparé, Playwright global et Chromium.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { attendreApplication, lancerNavigateur, ouvrirPage, servirApplication } from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base);
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await base?.fermer();
});

/** Ce que la base contient réellement. */
async function enBase(texte, valeurs = []) {
  const client = await base.connexion('app');
  return base.avecPerimetre(client, perimetre('temoin', FILIALE_A, [FILIALE_A]), async (c) =>
    (await c.query(texte, valeurs)).rows);
}

/**
 * Écrit une base IndexedDB `cyber-grc-db` telle que la version 100 % navigateur la
 * laissait : un instantané dans `kv`, un point de restauration dans `backups`.
 *
 * C'est l'état de départ du constat B-1 — « une filiale encore en version locale ».
 */
const SEMER_BASE_HERITEE = `(() => {
  return new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open('cyber-grc-db', 12);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id' });
    };
    requete.onerror = () => rejeter(requete.error);
    requete.onsuccess = () => {
      const db = requete.result;
      const t = db.transaction(['kv', 'backups'], 'readwrite');
      t.objectStore('kv').put(
        { schemaVersion: 12, risques: [{ id: 'RISK-HERITE', nom: 'Deux ans de travail' }], clients: [] },
        'current',
      );
      t.objectStore('backups').put({ id: 'BK-1', createdAt: Date.now(), payload: { risques: [] } });
      t.oncomplete = () => { db.close(); resoudre(true); };
      t.onerror = () => rejeter(t.error);
    };
  });
})()`;

/** Vrai si la base héritée existe encore ET porte toujours son instantané. */
const LIRE_BASE_HERITEE = `(() => {
  return new Promise((resoudre) => {
    const requete = indexedDB.open('cyber-grc-db');
    requete.onerror = () => resoudre({ existe: false, risques: 0, sauvegardes: 0 });
    requete.onsuccess = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains('kv')) { db.close(); resoudre({ existe: false, risques: 0, sauvegardes: 0 }); return; }
      const t = db.transaction(['kv', 'backups'], 'readonly');
      const instantane = t.objectStore('kv').get('current');
      const sauvegardes = t.objectStore('backups').count();
      t.oncomplete = () => {
        const valeur = instantane.result;
        db.close();
        resoudre({
          existe: true,
          risques: valeur && Array.isArray(valeur.risques) ? valeur.risques.length : 0,
          sauvegardes: sauvegardes.result,
        });
      };
      t.onerror = () => { db.close(); resoudre({ existe: false, risques: 0, sauvegardes: 0 }); };
    };
  });
})()`;

/* =====================================================================
 *  B-1 — ouvrir l'application ne détruit pas l'ancien monde
 * ===================================================================== */

describe('B-1 — la base héritée survit à l’ouverture de la nouvelle application', () => {
  test('serveur INJOIGNABLE : l’application refuse de démarrer, et n’a rien effacé', async () => {
    // Le scénario exact de l'auditeur : « L'utilisateur ouvre la nouvelle adresse,
    // voit "Serveur indisponible", et ses deux ans de travail sont déjà détruits. Il
    // n'a rien fait de mal : il n'a pas encore pu se connecter. »
    const session = await ouvrirPage(navigateur);
    try {
      // On sème la base héritée AVANT toute ouverture de l'application : on charge
      // donc une page vide de la même origine.
      await session.page.goto(`${application.url}/favicon.ico`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'commit' });
      await session.page.evaluate(SEMER_BASE_HERITEE);
      const avant = await session.page.evaluate(LIRE_BASE_HERITEE);
      assert.deepEqual(avant, { existe: true, risques: 1, sauvegardes: 1 }, 'Le semis doit avoir pris.');

      // Le VPN est coupé : l'application ne joindra pas le serveur.
      application.definirApiInjoignable(true);
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      await session.page.waitForTimeout(1500);

      const apres = await session.page.evaluate(LIRE_BASE_HERITEE);
      assert.equal(
        apres.existe,
        true,
        'La base héritée doit exister encore : rien ne s’efface avant qu’une reprise ait eu lieu.',
      );
      assert.equal(apres.risques, 1, 'Et son instantané doit être intact.');
      assert.equal(apres.sauvegardes, 1, 'Ses points de restauration aussi.');
    } finally {
      application.definirApiInjoignable(false);
      await session.fermer();
    }
  });

  test('serveur JOIGNABLE : l’application démarre, et n’efface toujours rien d’office', async () => {
    // Le second volet, moins spectaculaire et tout aussi destructeur : même quand la
    // bascule réussit, l'effacement ne peut pas être une conséquence de l'ouverture.
    // Il exige un geste — c'est la règle que `persistence.js` énonce désormais.
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'commit' });
      await session.page.evaluate(SEMER_BASE_HERITEE);

      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await session.page.waitForTimeout(500);

      const apres = await session.page.evaluate(LIRE_BASE_HERITEE);
      assert.equal(apres.existe, true, 'Ouvrir l’application n’est pas un geste de suppression.');
      assert.equal(apres.risques, 1);
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  B-2 — masquer le bandeau n'efface pas la vérité
 * ===================================================================== */

describe('B-2 — un enregistrement bloqué ne disparaît pas avec son bandeau', () => {
  /** Provoque un vrai conflit de version sur RISK-A, depuis le navigateur. */
  async function provoquerUnConflit(session) {
    // Quelqu'un d'autre écrit d'abord : la version que le navigateur détient devient
    // périmée. C'est le scénario de l'auditeur, à la lettre.
    // La version courante, et non « 1 » : ce fichier joue plusieurs scénarios sur la
    // même ligne, et un test qui présume l'état laissé par le précédent est un test
    // dont l'ordre décide du verdict.
    const jeu = await serveur.appeler('GET', '/api/donnees');
    const courante = jeu.corps.data.risques.find((r) => r.id === 'RISK-A')._version;
    const reponse = await serveur.appeler('PUT', '/api/entites/risques/RISK-A', {
      corps: { version: courante, champs: { nom: 'Rançongiciel (corrigé par Bob)' } },
    });
    assert.equal(reponse.statut, 200);

    return session.page.evaluate(async () => {
      const r = window.DataStore.getRisques().find((x) => x.id === 'RISK-A');
      window.DataStore.updateRisque({ ...r, nom: 'Rançongiciel — version d’Alice' });
      await window.Sync.pousser();
      return window.Sync.etat();
    });
  }

  test('après la croix « Masquer », l’application ne dit JAMAIS « rien en attente »', async () => {
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');

      const conflit = await provoquerUnConflit(session);
      assert.ok(conflit.bloques >= 1, 'Le conflit doit bloquer l’enregistrement.');
      assert.equal(conflit.enAttente, true);

      // Le geste : la croix du bandeau.
      const aCliqué = await session.page.evaluate(() => {
        const bouton = document.getElementById('sync-fermer');
        if (!bouton) return false;
        bouton.click();
        return true;
      });
      assert.equal(aCliqué, true, 'Le bouton « Masquer » doit exister : c’est lui qu’on éprouve.');

      const apres = await session.page.evaluate(() => window.Sync.etat());
      assert.ok(
        apres.bloques >= 1,
        'L’enregistrement reste bloqué — c’est un fait, et masquer un bandeau ne le change pas.',
      );
      assert.equal(
        apres.enAttente,
        true,
        'DONC l’application doit continuer de dire qu’il reste quelque chose en attente. ' +
          'C’est exactement ce que le constat B-2 reprochait : elle affirmait le contraire.',
      );

      // Et il reste quelque chose de VISIBLE : un utilisateur qui ne lit pas la
      // console doit pouvoir s'en apercevoir.
      const visible = await session.page.evaluate(() => {
        const zone = document.getElementById('sync-banner-host');
        return zone ? zone.innerText.trim() : '';
      });
      assert.notEqual(visible, '', 'Masquer réduit la trace ; cela ne l’éteint pas.');
    } finally {
      await session.fermer();
    }
  });

  test('la saisie faite APRÈS le masquage n’est pas silencieusement perdue', async () => {
    // La suite du scénario : « Alice travaille encore 20 minutes sur cette fiche,
    // puis enregistre » — et rien ne part, sans que rien ne le dise.
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await provoquerUnConflit(session);
      await session.page.evaluate(() => {
        const bouton = document.getElementById('sync-fermer');
        if (bouton) bouton.click();
      });

      const etat = await session.page.evaluate(async () => {
        const r = window.DataStore.getRisques().find((x) => x.id === 'RISK-A');
        window.DataStore.updateRisque({ ...r, description: 'vingt minutes de travail' });
        await window.Sync.pousser();
        return window.Sync.etat();
      });

      assert.equal(
        etat.enAttente,
        true,
        'Le travail n’est pas parti : l’application doit le dire, pas afficher « tout est enregistré ».',
      );

      // Et le filet de fermeture d'onglet doit se déclencher.
      const previent = await session.page.evaluate(() => window.Sync.aDesModificationsEnAttente());
      assert.equal(previent, true, 'Fermer l’onglet doit avertir : c’est le dernier filet.');
    } finally {
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  B-3 — l'import « Remplacer » ne détruit pas une filiale
 * ===================================================================== */

describe('B-3 — l’import « Remplacer » ne détruit pas la filiale hors transaction', () => {
  test('le mode « Remplacer » ne supprime RIEN au serveur', async () => {
    // Rejoué de l'auditeur : « 8 risques, 2 documents, 1 incident avant ; 1 risque,
    // 0 document, 0 incident après ; 20 DELETE HTTP ; listBackups() → [] ; valeur de
    // retour {"ok":false}, et la destruction a eu lieu quand même. »
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');

      const avant = {
        risques: (await enBase('select id from risques')).length,
        documents: (await enBase('select id from documents')).length,
        incidents: (await enBase('select id from incidents')).length,
      };
      assert.ok(avant.risques > 0 && avant.incidents > 0, 'Le scénario n’a de sens qu’avec des données.');

      const suppressionsAvant = application.appelsPar('DELETE').length;

      const issue = await session.page.evaluate(async () => {
        const charge = { schemaVersion: 12, risques: [{ id: 'RISK-IMPORTE', nom: 'Venu d’un fichier' }] };
        try {
          const r = await window.DataStore.applyImport(charge, 'replace');
          return { refuse: false, resultat: JSON.stringify(r) };
        } catch (erreur) {
          return { refuse: true, message: String(erreur && erreur.message) };
        }
      });

      const apres = {
        risques: (await enBase('select id from risques')).length,
        documents: (await enBase('select id from documents')).length,
        incidents: (await enBase('select id from incidents')).length,
      };
      assert.deepEqual(
        apres,
        avant,
        `Le jeu de données de la filiale doit être INTACT. Issue de l’import : ${JSON.stringify(issue)}`,
      );

      const suppressions = application.appelsPar('DELETE').length - suppressionsAvant;
      assert.equal(
        suppressions,
        0,
        'Aucune suppression ne doit être émise : une rafale de DELETE indépendants n’est pas ' +
          'une opération composite (contrôle S14), et une coupure au milieu laisse la filiale ' +
          'à moitié détruite.',
      );
    } finally {
      await session.fermer();
    }
  });

  test('l’écran Paramètres ne promet plus un point de restauration qui n’existe pas', async () => {
    // Le troisième fait du piège : « le texte rassurant est resté ». Un outil de
    // preuve qui affirme un filet inexistant est plus dangereux qu'un outil qui plante.
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html#/settings`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await session.page.waitForTimeout(400);

      const ecran = await session.page.evaluate(() => document.getElementById('app').innerText);
      assert.equal(
        /point de restauration est créé avant/i.test(ecran),
        false,
        `L’écran promet encore un point de restauration. Extrait : « ${ecran.slice(0, 400)} »`,
      );

      // Et la promesse « vos données ne quittent jamais ce navigateur » (m-7) est
      // devenue fausse le jour de la bascule : elle ne doit plus être affichée.
      assert.equal(
        /ne quittent jamais ce navigateur/i.test(ecran),
        false,
        'L’application ne peut pas affirmer que les données restent locales : elles sont au serveur.',
      );

      // Contrôle de matière : on est bien sur l'écran Paramètres, et il dit quelque
      // chose. Sans cela, les deux assertions ci-dessus seraient vraies d'un écran vide.
      assert.ok(ecran.length > 200, `Écran Paramètres anormalement vide : « ${ecran.slice(0, 200)} »`);
      assert.match(ecran, /Param|sauvegarde|export/i);
    } finally {
      await session.fermer();
    }
  });
});
