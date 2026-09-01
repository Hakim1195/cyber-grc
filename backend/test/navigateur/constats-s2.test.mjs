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
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
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
      await attendreQuiescence(session.page);
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
  /** Compteur : chaque conflit provoqué doit porter une valeur inédite (voir ci-dessous). */
  let conflitsProvoques = 0;

  /** Provoque un vrai conflit de version sur RISK-A, depuis le navigateur. */
  async function provoquerUnConflit(session) {
    // Quelqu'un d'autre écrit d'abord : la version que le navigateur détient devient
    // périmée. C'est le scénario de l'auditeur, à la lettre.
    // La version courante, et non « 1 » : ce fichier joue plusieurs scénarios sur la
    // même ligne, et un test qui présume l'état laissé par le précédent est un test
    // dont l'ordre décide du verdict.
    //
    // ── Et une valeur RÉELLEMENT NOUVELLE, à chaque appel ────────────────────
    //
    // Nouveau contrat du moteur, assumé : **un enregistrement qui ne change rien
    // n'avance plus la version**. Ce fichier appelle cette fonction deux fois ; le
    // second appel réécrivait la valeur que le premier avait déjà posée, n'écrivait
    // donc rien, la version ne bougeait pas — et Alice ne rencontrait plus aucun
    // conflit. Le test tombait sans que rien ne soit cassé dans le produit.
    //
    // C'était mon défaut, et il est instructif : un jeu d'essai qui répète une valeur
    // mesure ce que le moteur veut bien réécrire, pas ce que l'utilisateur subit. Un
    // compteur suffit à le fermer.
    conflitsProvoques += 1;
    const jeu = await serveur.appeler('GET', '/api/donnees');
    const courante = jeu.corps.data.risques.find((r) => r.id === 'RISK-A')._version;
    const reponse = await serveur.appeler('PUT', '/api/entites/risques/RISK-A', {
      corps: {
        version: courante,
        champs: { nom: `Rançongiciel (corrigé par Bob, ${String(conflitsProvoques)})` },
      },
    });
    assert.equal(reponse.statut, 200);
    assert.equal(
      (await serveur.appeler('GET', '/api/donnees')).corps.data.risques.find((r) => r.id === 'RISK-A')._version,
      courante + 1,
      'L’écriture de Bob doit VRAIMENT avancer la version : sinon Alice ne rencontrera pas de conflit.',
    );

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
      await attendreQuiescence(session.page);

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
      await attendreQuiescence(session.page);
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
 *  M-6 — l'interface sous la CSP du vhost de production
 * ===================================================================== */

describe('M-6 — sous la CSP de production, l’interface répond encore', () => {
  /**
   * La politique de sécurité de contenu **exacte** du vhost du lot L0
   * (`deploy/apache/cyber-grc.conf`). Recopiée ici plutôt que lue du fichier : le
   * fichier appartient au lot L0, et un test qui lirait la configuration passerait
   * au vert le jour où quelqu'un l'affaiblirait. C'est la valeur ATTENDUE qui est
   * l'objet du test — la divergence entre les deux est signalée par l'assertion qui
   * suit, pas masquée.
   */
  const CSP_PRODUCTION =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
    "frame-src 'none'; child-src 'none'; worker-src 'none'; media-src 'none'; " +
    "manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

  test('la CSP du dépôt est bien celle qu’on éprouve', async () => {
    // Contrôle de matière : si le vhost change, ce test le dit, et l'on saura que le
    // scénario ci-dessous a cessé de décrire la production.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { RACINE_BACKEND } = await import('../aide/serveur.mjs');
    const vhost = readFileSync(join(RACINE_BACKEND, 'deploy', 'apache', 'cyber-grc.conf'), 'utf8');
    assert.ok(
      vhost.includes(CSP_PRODUCTION),
      'La CSP du vhost a changé : mettre à jour CSP_PRODUCTION, puis relire ce scénario.',
    );
  });

  test('aucun ÉCRAN ne porte de gestionnaire en ligne : sinon il est inerte', async () => {
    // Constat M-6 : « L'application DÉMARRE (les <script src> sont bien 'self'), puis
    // une large part de l'interface est INERTE, EN SILENCE ». Un `onclick=` en
    // attribut est du script en ligne : `script-src 'self'` le refuse.
    //
    // ── Pourquoi ce test regarde le DOM et pas seulement la console ──────────
    //
    // Parce qu'un refus n'est journalisé QU'AU MOMENT OÙ le gestionnaire est
    // déclenché. Une première version de ce test se contentait de parcourir les
    // écrans en lisant la console : elle passait au vert sur une page qui portait
    // trois attributs `onclick`, simplement parce que personne n'avait cliqué. Un
    // test qui passe quoi qu'on fasse ne prouve rien — c'est la règle du chantier, et
    // elle vient de s'appliquer à moi.
    //
    // La propriété se lit donc dans le DOM, où elle est vraie ou fausse sans qu'on
    // ait à deviner quel bouton un utilisateur touchera.
    const session = await ouvrirPage(navigateur);
    try {
      application.definirCsp(CSP_PRODUCTION);

      // TOUTES les routes de l'application, et non un échantillon : ce test est
      // l'instrument de mesure de la conversion en cours dans `js/modules/**`, et un
      // instrument qui ne regarde que huit écrans sur vingt-huit annoncerait la fin
      // du travail avant l'heure. La liste est celle de `js/app.js`.
      const ecrans = [
        '#/dashboard', '#/synthese', '#/echeances', '#/clients', '#/personnel',
        '#/actifs', '#/cartographie', '#/risques', '#/matrice', '#/exigences',
        '#/referentiels', '#/mesures', '#/mapping', '#/couverture', '#/soa',
        '#/actions', '#/incidents', '#/documents', '#/rgpd', '#/bia',
        '#/crise', '#/crise-fiches', '#/pra', '#/mco', '#/tests',
        '#/prestataires', '#/audits', '#/settings',
      ];
      // Les FICHES et les FORMULAIRES comptent autant que les listes : un
      // gestionnaire en ligne sur un bouton « Enregistrer » rend la saisie
      // impossible, et aucune liste ne le montrerait. Les identifiants viennent du
      // jeu d'essai partagé.
      const fiches = [
        '#/risques/RISK-A', '#/exigences/EX-A', '#/actifs/ACTIF-A', '#/clients/CLI-A',
        '#/actions/ACT-A', '#/incidents/INC-A', '#/documents/DOC-A', '#/rgpd/TRT-A',
        '#/bia/BIA-A', '#/personnel/PERS-A', '#/prestataires/PRES-A', '#/audits/AUD-A',
        '#/mesures/MESURE-A', '#/pra/SCEN-A',
      ];

      const enLigne = [];
      /** Ce que le balayage a réellement vu — sans quoi il pourrait passer sur du vide. */
      const couverture = { ecrans: 0, formulaires: 0, caracteres: 0 };
      for (const route of [...ecrans, ...fiches]) {
        await session.page.goto(`${application.url}/index.html${route}`, { waitUntil: 'domcontentloaded' });
        assert.equal(await attendreApplication(session.page), 'chargee', `L’écran ${route} doit s’afficher.`);
        await session.page.waitForTimeout(200);
        couverture.ecrans += 1;
        couverture.caracteres += await session.page.evaluate(
          () => (document.getElementById('app')?.innerHTML ?? '').length,
        );
        const trouves = await session.page.evaluate(() => {
          const elements = Array.from(
            document.querySelectorAll('[onclick],[onchange],[oninput],[onsubmit],[onkeyup]'),
          );
          const exemple = elements[0];
          return {
            nombre: elements.length,
            exemple:
              exemple === undefined
                ? null
                : `<${exemple.tagName.toLowerCase()} ${
                    exemple.getAttributeNames().find((n) => n.startsWith('on')) ?? 'on?'
                  }="${(exemple.getAttribute('onclick') ?? exemple.getAttribute('onchange') ?? '').slice(0, 60)}">`,
          };
        });
        if (trouves.nombre > 0) {
          enLigne.push(`${route} : ${String(trouves.nombre)} gestionnaire(s), ex. ${trouves.exemple}`);
        }

        // Et le formulaire de création, quand l'écran en propose un : c'est le geste
        // le plus coûteux à perdre, et il n'est visible qu'après un clic.
        const aFormulaire = await session.page.evaluate(() => {
          const bouton = document.getElementById('addBtn');
          if (bouton === null) return false;
          bouton.click();
          return true;
        });
        if (aFormulaire) {
          couverture.formulaires += 1;
          await session.page.waitForTimeout(150);
          const dansLeFormulaire = await session.page.evaluate(
            () => document.querySelectorAll('[onclick],[onchange],[oninput],[onsubmit],[onkeyup]').length,
          );
          if (dansLeFormulaire > 0) {
            enLigne.push(`${route} (formulaire) : ${String(dansLeFormulaire)} gestionnaire(s)`);
          }
        }
      }

      // ── La couverture est RÉCLAMÉE ────────────────────────────────────────
      //
      // « Aucun gestionnaire trouvé » est aussi ce que rend un balayage qui n'a rien
      // affiché. On exige donc que les écrans aient produit de la matière, et qu'un
      // nombre plancher de formulaires de création ait été ouvert.
      assert.equal(couverture.ecrans, ecrans.length + fiches.length, 'Tous les écrans doivent être visités.');
      assert.ok(
        couverture.caracteres > 200_000,
        `Balayage suspect : ${String(couverture.caracteres)} caractères de HTML rendus en tout.`,
      );
      // Neuf écrans exposent un bouton « Nouveau » sous l'identifiant `addBtn` ; les
      // autres créent depuis une fiche parente ou n'ont pas de création. Le plancher
      // est donc la valeur mesurée : il parlera si un écran perd son bouton.
      assert.ok(
        couverture.formulaires >= 9,
        `Seulement ${String(couverture.formulaires)} formulaire(s) de création ouvert(s).`,
      );

      assert.deepEqual(
        enLigne,
        [],
        'Chaque écran listé porte des gestionnaires que la CSP de production rendra inertes, ' +
          'en silence. Le remède est `addEventListener`, que le dépôt emploie déjà partout ailleurs.',
      );
      const refus = session.erreursConsole.filter((e) => /Content Security Policy|inline event handler/i.test(e));
      assert.deepEqual(refus, [], 'Et aucun refus n’a été journalisé pendant le parcours.');
      assert.deepEqual(session.erreursScript, []);
    } finally {
      application.definirCsp(null);
      await session.fermer();
    }
  });

  test('LE DÉTECTEUR MORD : un gestionnaire en ligne déclenché EST vu', async () => {
    // Contrôle de morsure du test précédent, et il est indispensable : il prouve que
    // le banc VERRAIT le défaut si l'application le portait. On plante un
    // gestionnaire en ligne, on le déclenche, et l'on vérifie deux choses — qu'il
    // n'a pas tourné, et que le refus est arrivé jusqu'au journal du banc.
    const session = await ouvrirPage(navigateur);
    try {
      application.definirCsp(CSP_PRODUCTION);
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await attendreQuiescence(session.page);

      await session.page.evaluate(() => {
        const bouton = document.createElement('button');
        bouton.id = 'zz-morsure-csp';
        bouton.setAttribute('onclick', 'window.__gestionnaireALanceTourne = true;');
        document.body.appendChild(bouton);
      });
      await session.page.click('#zz-morsure-csp');
      await session.page.waitForTimeout(200);

      assert.equal(
        await session.page.evaluate(() => window.__gestionnaireALanceTourne === true),
        false,
        'Sous cette CSP, un gestionnaire en ligne NE DOIT PAS s’exécuter.',
      );
      const refus = session.erreursConsole.filter((e) => /inline event handler/i.test(e));
      assert.equal(refus.length, 1, 'Et le banc doit avoir vu le refus, sinon il ne verra jamais rien.');
    } finally {
      application.definirCsp(null);
      await session.fermer();
    }
  });
});

/* =====================================================================
 *  B-3 — l'import « Remplacer » ne détruit pas une filiale
 * ===================================================================== */

describe('B-3 — l’import « Remplacer » ne détruit pas la filiale hors transaction', () => {
  test('« Remplacer » passe par UNE transaction serveur, et n’émet aucun DELETE', async () => {
    // ── L'arbitrage, et ce que ce test est devenu ────────────────────────────
    //
    // Première version : « le mode Remplacer ne supprime RIEN », parce que le
    // correctif immédiat avait été de le refuser côté navigateur — un pansement, et
    // il était dit comme tel. La vraie réponse est arrivée depuis : une route de
    // reprise qui prend le fichier entier et l'applique en UNE transaction serveur
    // (`POST /api/reprise`, couverte par `test/api/reprise-route.test.mjs`).
    //
    // Le test suit donc l'arbitrage, et vérifie la propriété qui compte vraiment :
    // le remplacement a bien lieu, MAIS PAS PAR UNE RAFALE. C'est la formulation
    // exacte du constat B-3 — « vingt requêtes DELETE, sans transaction : une coupure
    // de VPN au milieu laisse la filiale à moitié détruite, et l'état intermédiaire
    // est parfaitement observable par les autres utilisateurs ».
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await attendreQuiescence(session.page);

      const avant = (await enBase('select id from risques')).length;
      assert.ok(avant > 0, 'Le scénario n’a de sens qu’avec des données à remplacer.');
      const suppressionsAvant = application.appelsPar('DELETE').length;

      const issue = await session.page.evaluate(async () => {
        const charge = {
          schemaVersion: 12,
          risques: [{ id: 'RISK-VENU-DU-FICHIER', nom: 'Venu d’un fichier' }],
        };
        try {
          return { refuse: false, resultat: await window.DataStore.applyImport(charge, 'replace') };
        } catch (erreur) {
          return { refuse: true, message: String(erreur && erreur.message) };
        }
      });

      assert.equal(
        application.appelsPar('DELETE').length - suppressionsAvant,
        0,
        'AUCUNE suppression une par une : c’est le cœur du constat B-3. ' +
          `Issue de l’import : ${JSON.stringify(issue).slice(0, 300)}`,
      );

      // Deux issues sont acceptables, et une seule est inacceptable : détruire hors
      // transaction. Si l'import est appliqué, il doit l'avoir été entièrement.
      if (issue.refuse) {
        assert.equal(
          (await enBase('select id from risques')).length,
          avant,
          'Un import refusé ne doit rien avoir détruit.',
        );
      } else {
        const apres = await enBase('select id from risques');
        assert.deepEqual(
          apres.map((r) => r.id),
          ['RISK-VENU-DU-FICHIER'],
          'Un remplacement appliqué doit l’être ENTIÈREMENT, et sous l’identifiant du fichier.',
        );
      }
    } finally {
      await session.fermer();
    }
  });

  test('un fichier fautif ne laisse RIEN à moitié détruit', async () => {
    // L'autre moitié, et celle qui coûtait la filiale : l'échec au milieu. Le fichier
    // porte des enregistrements valides PUIS une valeur refusée — sans transaction,
    // les premiers seraient écrits et les données d'origine déjà supprimées.
    const session = await ouvrirPage(navigateur);
    try {
      await session.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(session.page), 'chargee');
      await attendreQuiescence(session.page);

      const avant = (await enBase('select id from risques order by id')).map((r) => r.id);
      const suppressionsAvant = application.appelsPar('DELETE').length;

      const issue = await session.page.evaluate(async () => {
        const charge = {
          schemaVersion: 12,
          risques: [
            { id: 'RISK-BON-1', nom: 'Valide' },
            { id: 'RISK-BON-2', nom: 'Valide aussi' },
            { id: 'RISK-FAUTIF', nom: 'Troisième', niveau: 'valeur hors de la liste fermée' },
          ],
        };
        try {
          return { refuse: false, resultat: await window.DataStore.applyImport(charge, 'replace') };
        } catch (erreur) {
          return { refuse: true, message: String(erreur && erreur.message) };
        }
      });

      assert.deepEqual(
        (await enBase('select id from risques order by id')).map((r) => r.id),
        avant,
        `Le jeu de données doit être EXACTEMENT celui d’avant. Issue : ${JSON.stringify(issue).slice(0, 300)}`,
      );
      assert.equal(application.appelsPar('DELETE').length - suppressionsAvant, 0);
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
      await attendreQuiescence(session.page);
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
