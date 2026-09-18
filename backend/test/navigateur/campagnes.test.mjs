/**
 * campagnes.test.mjs — **LES CAMPAGNES DESCENDANTES, JUSQU'À L'ÉCRAN** (lot L24)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * `docs/REPRISE.md` §4 : *« une capacité qu'aucun écran n'appelle est une capacité
 * absente. Trois lots de suite ont été livrés, éprouvés et verts sans que personne
 * puisse s'en servir. »* Les routes du greffon `src/campagnes/` sont éprouvées par
 * `test/campagnes/descendantes.test.mjs` ; ce fichier-ci mesure l'autre moitié.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'onglet « Campagnes du Groupe » existe, et il mène à l'écran |
 * | 1 bis | ⚠️ Le bloc « Ouvrir une campagne » est proposé à qui en a le DROIT, et à lui seul |
 * | 2 | L'écran DIVISE : il rend un taux là où le serveur ne rend qu'un compte |
 * | 3 | ⚠️ Une campagne OUVERTE arrive dans l'échéancier ; un BROUILLON n'y arrive pas |
 * | 3 bis | ⚠️ Déconvoquer PUIS supprimer : le cycle de vie complet arrive EN BASE |
 * | 4 | Un intitulé hostile est affiché, jamais exécuté |
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
import { monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

const DELAI = 60_000;

/** Un intitulé qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const INTITULE_HOSTILE = 'Campagne <img src=x onerror="window.__xss=1">';

let base;
let navigateur;
let serveur;
let application;
let session;
/** Le même produit, servi par une session qui porte l'administration Groupe (§1 bis). */
let serveurAdmin;
let applicationAdmin;

const TOUS_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel', 'administration',
]);

/**
 * Une session dont on CHOISIT le périmètre et les droits.
 *
 * ⚠️ Elle existe pour une raison précise, et il faut la lire avant de la remplacer par
 * l'échappatoire `API_ADMINISTRATION_GROUPE_PROVISOIRE` : ce drapeau est lu par le
 * résolveur provisoire, qui **met son périmètre en cache soixante secondes**. Deux mesures
 * successives dans un même essai renvoient donc la même réponse, et l'essai croirait
 * mesurer deux cas là où il n'en mesure qu'un. Deux serveurs, deux résolveurs : chacun dit
 * ce qu'il est, et le cache de l'un n'atteint pas l'autre.
 */
class SessionDeBanc {
  constructor(perimetre_, droits) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perimetre_ });
    this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return { perimetre: this._perimetre, droits: this._droits, identite: null, sessionOuverte: false };
  }

  decrire() {
    return 'session du banc d’essai (test/navigateur/campagnes.test.mjs)';
  }
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // ⚠️ Les campagnes s'écrivent sous administration Groupe (politique de la `044`).
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-l24', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      await c.query(
        `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance)
         values ('CAMP-ECRAN', 'anssi-hygiene', $1, current_date - 20, current_date + 9)`,
        [INTITULE_HOSTILE],
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id, repondant, accuse_le)
         values ('CF-ECRAN', $1, 'CAMP-ECRAN', 'RSSI Toulouse', current_date - 18)`,
        [FILIALE_A],
      );
      // Un BROUILLON avec une échéance : il ne doit PAS entrer dans l'échéancier.
      await c.query(
        `insert into campagnes (id, ref_id, intitule, echeance)
         values ('CAMP-ECRAN-BROUILLON', 'anssi-hygiene', 'Brouillon invisible',
                 current_date + 4)`,
      );
      await c.query(
        `insert into campagne_filiales (id, filiale_id, campagne_id)
         values ('CF-ECRAN-BROUILLON', $1, 'CAMP-ECRAN-BROUILLON')`,
        [FILIALE_A],
      );
      // Deux exigences renseignées sur le référentiel demandé : de quoi voir un TAUX.
      await c.query(
        `insert into evaluations (id, filiale_id, ref_id, code, statut)
         values ('EV-H1', $1, 'anssi-hygiene', '1', 'conforme'),
                ('EV-H2', $1, 'anssi-hygiene', '2', 'non conforme')`,
        [FILIALE_A],
      );
    },
    { annuler: false },
  );

  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  application = await servirApplication(serveur);

  // ── Le SECOND montage : une session qui porte l'administration Groupe ──────
  const perimetreAdmin = {
    utilisateurId: 'USER-A',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A],
    perimetreGroupe: false,
    administrationGroupe: true,
  };
  serveurAdmin = await monterGreffon(base, perimetreAdmin, {
    resolveur: new SessionDeBanc(perimetreAdmin, {
      niveau: 'administration', domaines: TOUS_DOMAINES, export: true,
    }),
  });
  applicationAdmin = await servirApplication(serveurAdmin);

  navigateur = await lancerNavigateur();
  session = await ouvrirApplication();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await applicationAdmin?.fermer();
  await serveur?.fermer();
  await serveurAdmin?.fermer();
  await base?.fermer();
});

async function ouvrirApplication(cible = null) {
  const s = await ouvrirPage(navigateur);
  await s.page.goto(`${(cible ?? application).url}/index.html`, { waitUntil: 'domcontentloaded' });
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

describe('les campagnes descendantes, jusqu’à l’écran', () => {
  test('§1 — l’onglet mène à l’écran, et l’écran affiche la campagne', async () => {
    const { page } = session;
    await aller(page, '/referentiels');

    // L'onglet existe, et il porte la route : c'est une VUE de la conformité, pas une
    // entrée de menu de plus (`docs/PLAN_INTERFACE.md`).
    const onglets = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a,button'))
        .map((e) => e.getAttribute('href') ?? '')
        .filter((h) => h.includes('/campagnes')),
    );
    assert.ok(onglets.length > 0, 'un onglet doit mener aux campagnes');

    await aller(page, '/campagnes');
    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');
    assert.match(texte, /Campagnes du Groupe/u);
    assert.match(texte, /anssi-hygiene/u);
    // L'état vient du SERVEUR : la campagne est ouverte, son échéance est à venir.
    assert.match(texte, /En cours/u);
  });

  test('§1 bis — ⚠️ le bloc « Ouvrir une campagne » est proposé à qui en a le DROIT', async () => {
    // ⚠️ **CE §1 BIS EXISTE PARCE QUE LE DÉFAUT S'EST PRODUIT**, et qu'aucun essai ne le
    // voyait : la première rédaction de l'écran lisait `Session.perimetre`, qui n'existe
    // pas. Résultat mesuré AU NAVIGATEUR SUR LA RECETTE : le bloc de création était
    // invisible pour `admin.grc` — le seul compte qui en a le droit —, l'écran s'affichait
    // parfaitement, et la console ne disait rien. *Une capacité qu'aucun écran n'appelle
    // est une capacité absente* (`docs/REPRISE.md` §4).
    //
    // ── Comment les DEUX moitiés se mesurent, et pourquoi ainsi ────────────────
    //
    // Le drapeau vient du RÉSOLVEUR, et deux montages le disent différemment. ⚠️ La voie
    // qui paraissait plus simple — basculer `API_ADMINISTRATION_GROUPE_PROVISOIRE` et
    // recharger — a été ESSAYÉE et MESURÉE FAUSSE : le résolveur provisoire met son
    // périmètre en cache **soixante secondes**, si bien que la seconde mesure rendait la
    // première. L'essai aurait mesuré deux fois le même cas en croyant en mesurer deux.
    //
    // Les deux moitiés sont nécessaires : sans la positive, l'essai consacrerait l'absence
    // du bloc comme une propriété désirable — le défaut même qu'il vient de trouver ; sans
    // la négative, il serait vrai d'un écran qui proposerait la création à tout le monde.
    const mesurer = async (cible) => {
      const s = await ouvrirApplication(cible);
      await aller(s.page, '/campagnes');
      const vu = await s.page.evaluate(() => ({
        admin: window.Session.courante().administrationGroupe,
        bloc: document.getElementById('campCreer') !== null,
      }));
      await s.page.close();
      return vu;
    };

    const avecDroit = await mesurer(applicationAdmin);
    const sansDroit = await mesurer(application);

    assert.equal(avecDroit.admin, true, 'ce montage doit porter l’administration Groupe');
    assert.equal(avecDroit.bloc, true, 'le bloc de création doit être proposé à qui en a le droit');
    assert.equal(sansDroit.admin, false, 'la session provisoire ordinaire n’administre pas');
    assert.equal(sansDroit.bloc, false, 'sans l’administration Groupe, le bloc ne doit pas être proposé');

    // ⚠️ Et ce que l'écran cache ne PROTÈGE rien : la barrière est la politique RLS de la
    // `044`, plus le droit `administrer` de la route de convocation. `test/campagnes/`
    // §4 les éprouve contre le vrai serveur ; ici on mesure la courtoisie, pas la barrière.
  });

  test('§2 — l’écran DIVISE : un taux là où le serveur ne rend qu’un compte', async () => {
    // ⚠️ C'est la moitié de l'action 24.2 qui n'appartient PAS au serveur : il rend
    // « 2 » — le nombre d'exigences renseignées — et ignore combien le référentiel en
    // porte, parce que le catalogue vit dans le frontend. L'écran, qui l'a, divise.
    const { page } = session;
    await aller(page, '/campagnes');
    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');

    // Hygiène ANSSI porte 42 mesures : 2 / 42 = 5 %.
    assert.match(texte, /2 \/ 42/u);
    assert.match(texte, /5 %/u);
  });

  test('§3 — ⚠️ une campagne OUVERTE arrive à l’échéancier, un BROUILLON n’y arrive pas', async () => {
    const { page } = session;
    await aller(page, '/echeances');

    const etat = await page.evaluate(() => {
      const tout = window.Echeances.collect();
      const campagnes = tout.filter((e) => e.type === 'campagne');
      return {
        titres: campagnes.map((e) => e.titre),
        jours: campagnes.map((e) => e.jours),
        boutons: Array.from(document.querySelectorAll('.ech-fbtn')).map((b) => b.dataset.type),
      };
    });

    // La campagne ouverte est là, à +9 jours. ⚠️ Et elle n'est pas seule : le semis
    // commun porte « Hygiène ANSSI — campagne annuelle du Groupe », ouverte et jamais
    // terminée, donc légitimement due elle aussi. On mesure donc PAR TITRE et non par
    // compte — un compte figé ici se périmerait au premier semis qui bouge, et l'essai
    // rougirait pour une raison étrangère à ce qu'il mesure.
    const rangs = new Map(etat.titres.map((t, i) => [t, etat.jours[i]]));
    assert.ok(rangs.has(INTITULE_HOSTILE), JSON.stringify(etat.titres));
    assert.equal(rangs.get(INTITULE_HOSTILE), 9);
    // …et le BROUILLON n'y est pas, bien qu'il porte une échéance plus proche (+4 j).
    // Un brouillon du Groupe ne demande rien à personne : le compter parmi les retards
    // fabriquerait une alerte que personne ne s'est infligée.
    assert.equal(etat.titres.some((t) => /Brouillon/u.test(t)), false);
    assert.ok(etat.boutons.includes('campagne'), etat.boutons.join(' · '));
  });

  test('§3 bis — ⚠️ supprimer une campagne ET sa part en un geste ARRIVE EN BASE', async () => {
    // ⚠️ **CE §3 BIS EXISTE PARCE QUE LE DÉFAUT S'EST PRODUIT SUR LA RECETTE.** Supprimer
    // une campagne du Groupe et sa part dans le même geste rendait **trois 409** et
    // laissait la campagne EN BASE, alors que l'écran l'avait retirée. L'écart entre ce
    // que l'utilisateur voit et ce qui existe est la classe **Q-201 / Q-207**.
    //
    // La cause ne vivait ni dans l'écran ni dans la base : `js/core/sync.js` poussait les
    // suppressions dans l'ordre des COLLECTIONS — le porteur avant ses enfants, qui est
    // l'ordre juste pour CRÉER et l'inverse de celui qu'il faut pour SUPPRIMER. La clé
    // `fk_campagne_filiales_campagne`, en `restrict` par le §18.2, refusait.
    //
    // ⚠️ Et c'est un essai DE BOUT EN BOUT à dessein : le geste part de l'écran, et la
    // vérification se fait DANS LA BASE. Mesurer la mémoire du navigateur aurait rendu
    // vert — c'est précisément ce que l'écran affirmait à tort.
    //
    // Un porteur et son enfant, créés côté serveur pour que le geste ait de la matière.
    await base.avecPerimetre(
      await base.connexion('app'),
      perimetre('semeur-l24', FILIALE_A, [FILIALE_A], true),
      async (c) => {
        await c.query(
          `insert into campagnes (id, ref_id, intitule, ouverte_le, echeance)
           values ('CAMP-SUPPR', 'anssi-hygiene', 'À supprimer avec sa part',
                   current_date - 5, current_date + 5)`,
        );
        await c.query(
          `insert into campagne_filiales (id, filiale_id, campagne_id)
           values ('CF-SUPPR', $1, 'CAMP-SUPPR')`,
          [FILIALE_A],
        );
      },
      { annuler: false },
    );

    // ⚠️ LE GESTE SE JOUE SOUS L'ADMINISTRATION GROUPE, et l'essai l'a appris en rougissant :
    //    la politique `pol_campagnes_suppression` de la `044` réserve la suppression d'une
    //    campagne au Groupe — une filiale ne détruit pas la demande qu'on lui adresse. Joué
    //    sous la session ordinaire, le refus était JUSTE, et l'essai aurait accusé le
    //    correctif d'ordonnancement d'un défaut qui n'était pas le sien.
    const admin = await ouvrirApplication(applicationAdmin);
    // ⚠️ ON ÉCOUTE CE QUE LE NAVIGATEUR REÇOIT, et c'est ce qui rend cet essai sensible à
    //    l'ORDRE. La première rédaction ne regardait que l'état final de la base : elle
    //    passait AUSSI sans le correctif, parce qu'un repassage finit par réussir — donc
    //    elle ne mesurait pas ce qu'elle prétendait mesurer. *Un essai qu'aucune mutation
    //    ne fait rougir ne couvre rien* (constat Q-210), et la mutation a été jouée pour
    //    s'en assurer : sans `suppressions.reverse()`, le refus ci-dessous apparaît.
    const refus = [];
    admin.page.on('response', (r) => {
      if (r.status() === 409) refus.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    await aller(admin.page, '/campagnes');

    // ⚠️ **LE PARCOURS RÉEL PASSE PAR LE BOUTON « DÉCONVOQUER »**, et c'est le point : sans
    //    lui, les parts des filiales que cette session ne CHARGE pas restaient en base et
    //    la campagne était indestructible. On clique donc comme l'utilisateur, boîte de
    //    dialogue comprise.
    admin.page.once('dialog', (d) => d.accept());
    const bouton = await admin.page.$(
      `.part-retirer[data-campagne="CAMP-SUPPR"]`,
    );
    assert.notEqual(bouton, null, 'l’écran doit proposer « Déconvoquer » à l’administration Groupe');
    await bouton.click();
    await attendreQuiescence(admin.page, { delai: DELAI });

    const vu = await admin.page.evaluate(async () => {
      await window.Sync.recharger();
      const avant = window.DataStore.getCampagnes().some((c) => c.id === 'CAMP-SUPPR');
      window.DataStore.deleteCampagne('CAMP-SUPPR');
      await window.Sync.cycle();
      return { avant, apres: window.DataStore.getCampagnes().some((c) => c.id === 'CAMP-SUPPR') };
    });
    await admin.page.close();
    assert.equal(vu.avant, true, 'le jeu doit porter la campagne avant le geste');
    assert.equal(vu.apres, false, 'l’écran doit l’avoir retirée');

    // ⚠️ LA MESURE QUI COMPTE : ce que la BASE dit, pas ce que l'écran affirme.
    const restant = await base.avecPerimetre(
      await base.connexion('app'),
      perimetre('verif', FILIALE_A, [FILIALE_A]),
      async (c) => ({
        campagnes: Number(
          (await c.query(`select count(*)::int as n from campagnes where id = 'CAMP-SUPPR'`)).rows[0].n,
        ),
        parts: Number(
          (await c.query(`select count(*)::int as n from campagne_filiales where id = 'CF-SUPPR'`)).rows[0].n,
        ),
      }),
    );
    // ⚠️ AUCUN REFUS : le premier essai doit réussir. Trois 409 en rafale sur un geste
    //    légitime, c'est ce que la recette a rendu le 18/09 — et même rattrapés par un
    //    repassage, ils laissent une fenêtre pendant laquelle l'écran et la base ne disent
    //    pas la même chose, plus trois refus dans le journal d'un produit qui sert de
    //    preuve en audit.
    assert.deepEqual(
      refus, [],
      'la suppression a été refusée avant d’aboutir : les suppressions partent dans ' +
        'l’ordre des collections — le porteur avant ses enfants — et la clé en « restrict » ' +
        'refuse. C’est l’ordre INVERSE qu’il faut (js/core/sync.js).',
    );
    assert.equal(restant.parts, 0, 'la part doit avoir été supprimée');
    assert.equal(
      restant.campagnes, 0,
      'la campagne survit en base alors que l’écran l’a retirée : les suppressions partent ' +
        'dans le mauvais ordre, et la clé en « restrict » refuse le porteur avant ses enfants.',
    );
  });

  test('§4 — l’intitulé hostile est affiché, jamais exécuté', async () => {
    const { page } = session;
    await aller(page, '/campagnes');

    const xss = await page.evaluate(() => window.__xss === 1);
    assert.equal(xss, false, 'l’intitulé hostile a été exécuté');

    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');
    assert.match(texte, /onerror/u, 'le texte doit être AFFICHÉ, donc échappé, pas retiré');
    const images = await page.evaluate(
      () => document.querySelectorAll('#app img[src="x"]').length,
    );
    assert.equal(images, 0, 'aucune balise ne doit avoir été interprétée');
  });
});
