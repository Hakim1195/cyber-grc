/**
 * derogations.test.mjs — **l'écart assumé arrive-t-il jusqu'à l'écran, et
 * l'écran dit-il la vérité ?** (lot L19, action 19.2)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cette famille existe, à côté de `test/derogations/etat.test.mjs`
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'autre famille prouve que la ROUTE tient : une dérogation saisie ne couvre
 * pas, une dérogation échue ne couvre plus, la rallonger sans la faire
 * réapprouver ne la rallonge pas. Rien de tout cela ne sert si l'écran confond
 * les quatre états sous un même mot — et c'est précisément le défaut que le
 * produit a déjà produit deux fois (constats Q-201 et Q-207 : *un message qui
 * annonce une perte qui n'a pas eu lieu apprend à ne plus croire les bandeaux*).
 *
 * Ici, **ce que l'utilisateur lit** est le sujet entier.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | Le panneau existe sur la fiche, et il DIT pourquoi il est vide |
 * | 2 | On crée depuis l'écran ; elle apparaît « Non accordée », et le bandeau dit **NON couvert** |
 * | 3 | Les trois pièces sont exigées : sans motif, rien n'est créé, et on le dit |
 * | 4 | Le circuit se déplie EN PLACE, et l'acceptation fait basculer le bandeau |
 * | 5 | La liste des exigences porte le badge, dans la bonne cellule |
 * | 6 | Un motif HOSTILE ressort échappé — et l'essai le fait DÉCIDER |
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

/** Un motif qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const MOTIF_HOSTILE = 'Automate <img src=x onerror="window.__xss=1"> du fournisseur';

let base;
let navigateur;
let serveur;
let application;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // ⚠️ **Une exigence RIEN QU'À CET ESSAI**, et ce n'est pas du confort. Le semis
  // partagé pose désormais une dérogation sur « EX-A » — il le doit, pour que le
  // balayage de cloisonnement ait de la matière sur la table neuve. Travailler sur
  // « EX-A » ferait donc mesurer le semis d'un autre fichier : le §1 y trouverait
  // une dérogation là où il vérifie qu'il n'y en a aucune, et le §6 y lirait le
  // motif du semis au lieu du motif hostile de cet essai.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into exigences (id, filiale_id, code, intitule)
             values ('EX-DER', $1, 'A.8.2', 'Comptes à privilèges nominatifs')`,
        [FILIALE_A],
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

/** Ce que le panneau montre, tel qu'il est RENDU. */
async function vue(page) {
  return await page.evaluate(() => ({
    bandeau: document.querySelector('.der-bandeau')?.textContent.trim() ?? null,
    bandeauClasse: document.querySelector('.der-bandeau')?.className ?? null,
    vide: document.querySelector('#derogationsEncartCorps .chart-empty')?.textContent ?? null,
    lignes: Array.from(document.querySelectorAll('.der-table tbody tr.der-ligne')).map((tr) => ({
      texte: tr.textContent,
      etat: tr.querySelector('.status')?.textContent.trim() ?? null,
      classeEtat: tr.querySelector('.status')?.className ?? null,
    })),
  }));
}

describe('les dérogations datées, jusqu’à l’écran', () => {
  test('§1 — le panneau est là, et il DIT pourquoi il ne montre rien', async () => {
    const { page } = session;
    await aller(page, '/exigences/EX-DER');
    await attendrePanneau(page, 'derogationsEncartCorps');

    const v = await vue(page);
    assert.equal(v.lignes.length, 0);
    assert.match(
      v.vide ?? '',
      /Aucune dérogation sur cette exigence/u,
      'Un panneau vide sans motif est la classe Q-201 / Q-207.',
    );
    assert.equal(
      v.bandeau,
      null,
      'Sans aucune dérogation, il n’y a rien à annoncer : un bandeau « non couvert » ' +
        'sur une exigence qui n’a jamais demandé de dérogation crierait au loup.',
    );
    // Et le formulaire est là : sans lui, la capacité serait injoignable.
    assert.equal(
      await page.evaluate(() => document.getElementById('derCreerBtn') !== null),
      true,
    );
  });

  test('§3 — les trois pièces sont EXIGÉES, et le refus les nomme', async () => {
    const { page } = session;

    // On remplit tout SAUF le motif : c'est la pièce qu'un auditeur lit en
    // premier, et celle qu'on oublie le plus volontiers.
    await page.evaluate(() => {
      document.getElementById('derProprietaire').value = 'Claire Vasseur';
      document.getElementById('derEcheance').value = '2099-12-31';
      window.__toasts = [];
      const original = window.showToast;
      window.showToast = (message, ton) => {
        window.__toasts.push({ message, ton });
        if (typeof original === 'function') original(message, ton);
      };
      document.getElementById('derCreerBtn').click();
    });

    const etat = await page.evaluate(() => ({
      toasts: window.__toasts ?? [],
      creees: DataStore.getDerogations().length,
    }));
    // Le semis partagé pose déjà « DER-A » (et « DER-B » chez la voisine, invisible
    // d'ici) : on mesure donc qu'AUCUNE n'a été ajoutée, pas qu'il n'y en a aucune.
    assert.equal(etat.creees, 1, 'Une dérogation sans motif a été créée.');
    assert.equal(etat.toasts.length, 1, 'Le refus doit se DIRE : un clic sans effet apprend à recliquer.');
    assert.match(etat.toasts[0].message, /le motif/u, 'Le refus doit NOMMER ce qui manque.');
    assert.equal(etat.toasts[0].ton, 'error');
  });

  test('§2 — créée depuis l’écran, elle ne couvre RIEN, et le bandeau le dit', async () => {
    const { page } = session;

    await page.evaluate((motif) => {
      document.getElementById('derMotif').value = motif;
      document.getElementById('derCompensation').value =
        'Surveillance renforcée des connexions de ce compte.';
      document.getElementById('derCreerBtn').click();
    }, MOTIF_HOSTILE);

    await page.waitForFunction(
      () => document.querySelectorAll('.der-table tbody tr.der-ligne').length > 0,
      null,
      { timeout: DELAI },
    );

    const v = await vue(page);
    assert.equal(v.lignes.length, 1, 'Le panneau ne montre QUE les dérogations de CETTE exigence.');
    assert.equal(
      v.lignes[0].etat,
      'Non accordée',
      'Une dérogation SAISIE mais non approuvée s’affiche comme accordée : la simple ' +
        'saisie devient un blanc-seing à l’écran, quoi que dise le serveur.',
    );
    // ⚠️ Le badge est ROUGE et non orange : l'écart est entièrement découvert,
    // exactement comme s'il n'y avait pas de dérogation. L'orange laisserait
    // croire à une couverture partielle.
    assert.match(v.lignes[0].classeEtat ?? '', /status-non-conforme/u);
    assert.match(
      v.bandeau ?? '',
      /Écart NON couvert/u,
      'Le bandeau doit dire que l’écart n’est PAS couvert tant qu’aucune dérogation ' +
        'n’est en vigueur.',
    );
    assert.match(v.bandeauClasse ?? '', /der-bandeau--decouvert/u);
    // La compensation se lit, et elle est distincte du motif.
    assert.match(v.lignes[0].texte, /En attendant : Surveillance renforcée/u);
  });

  test('§4 — le circuit se déplie EN PLACE, et l’acceptation fait basculer le bandeau', async () => {
    const { page } = session;

    // Le circuit est replié au départ : une ligne de plus par dérogation, ouverte
    // d'office, rendrait le tableau illisible dès la troisième.
    assert.equal(
      await page.evaluate(() => document.querySelector('.der-circuit-ligne')?.hidden ?? null),
      true,
      'Le circuit doit être replié au départ.',
    );

    await page.click('.der-circuit-btn');
    // ⚠️ On mesure la VISIBILITÉ RÉELLE, pas la propriété `hidden` : une règle de
    // classe écrase le `[hidden]` du navigateur, et c'est le défaut du 16/09 —
    // la palette « ne se fermait pas » alors que l'essai était vert.
    await page.waitForFunction(
      () => {
        const l = document.querySelector('.der-circuit-ligne');
        return l !== null && l.getBoundingClientRect().height > 0;
      },
      null,
      { timeout: DELAI },
    );

    // Les deux étapes, franchies par l'écran d'approbation monté en place.
    for (const attendue of ['Proposition', 'Acceptation']) {
      await page.waitForFunction(
        () => document.getElementById('approbationsApprouver') !== null,
        null,
        { timeout: DELAI },
      );
      const titre = await page.evaluate(
        () => document.querySelector('.apr-decision h3')?.textContent ?? '',
      );
      assert.match(
        titre,
        new RegExp(attendue, 'iu'),
        `Le circuit d’une dérogation doit attendre « ${attendue} » — les deux étapes du ` +
          'risque résiduel, parce qu’accepter une dérogation EST accepter un risque résiduel.',
      );
      await page.click('#approbationsApprouver');
      await attendreQuiescence(page, { delai: DELAI });
    }

    // ══ SANS RIEN ROUVRIR : le panneau doit s'être relu tout seul ══════════
    //
    // ⚠️ **C'est le défaut trouvé dans un vrai navigateur, sur la recette, et
    // que ce banc ne voyait pas** : l'encart d'approbation se redessinait sur ce
    // que le serveur venait de rendre, et le bandeau deux lignes plus haut disait
    // encore « Écart NON couvert » sur une dérogation qui venait d'être ACCEPTÉE.
    // Classe Q-201 / Q-207 par son pire bout — *l'écran affirme le contraire de ce
    // qui vient de se produire, juste après le geste qui l'a produit.*
    //
    // L'ancienne rédaction de ce §, elle, RENAVIGUAIT avant de mesurer : elle
    // aurait été verte sur le produit défectueux. Un essai qui se replace dans un
    // état propre avant de regarder ne mesure pas ce que l'utilisateur voit.
    await page.waitForFunction(
      () => /Écart couvert/u.test(document.querySelector('.der-bandeau')?.textContent ?? ''),
      null,
      { timeout: DELAI },
    );
    const surPlace = await vue(page);
    assert.equal(
      surPlace.lignes[0].etat,
      'En vigueur',
      'La ligne n’a pas suivi la décision : le tableau garde l’état de la lecture précédente.',
    );

    // Et le rechargement complet dit la même chose — sans quoi on aurait pu
    // rafraîchir l'écran sur une valeur que la base ne porte pas.
    await aller(page, '/exigences/EX-DER');
    await attendrePanneau(page, 'derogationsEncartCorps');
    const v = await vue(page);
    assert.equal(v.lignes[0].etat, 'En vigueur');
    assert.match(v.lignes[0].classeEtat ?? '', /status-conforme/u);
    assert.match(
      v.bandeau ?? '',
      /Écart couvert jusqu'au 31\/12\/2099/u,
      'Le bandeau doit annoncer jusqu’à QUAND l’écart est couvert : une couverture sans ' +
        'date est exactement ce que l’action 19.2 existe pour empêcher.',
    );
    assert.match(v.bandeauClasse ?? '', /der-bandeau--couvert/u);
    assert.match(v.bandeau ?? '', /Claire Vasseur en répond/u, 'Et par QUI.');
  });

  test('§5 — la liste des exigences porte le badge, dans la BONNE cellule', async () => {
    const { page } = session;
    await aller(page, '/exigences');
    await page.waitForFunction(
      () => document.querySelectorAll('.der-badge').length > 0,
      null,
      { timeout: DELAI },
    );

    const badges = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.der-badge')).map((b) => ({
        texte: b.textContent,
        // La cellule qui le porte, et ce qu'elle contient d'autre.
        cellule: b.parentElement?.getAttribute('data-badges') ?? null,
        ligne: b.closest('tr')?.dataset.id ?? null,
        // ⚠️ Il ne doit PAS être dans la cellule de la case à cocher : elle est
        // large de 40 px, et le badge y disloquerait la colonne de sélection.
        dansLaCase: b.parentElement?.querySelector('.row-cb') !== null,
      })),
    );
    assert.equal(badges.length, 1, 'Un badge, sur la seule exigence qui porte une dérogation.');
    assert.equal(badges[0].ligne, 'EX-DER');
    assert.equal(badges[0].cellule, '1', 'La cellule cible est DÉSIGNÉE, jamais devinée.');
    assert.equal(badges[0].dansLaCase, false);
    assert.match(badges[0].texte, /Dérogation jusqu'au 31\/12\/2099/u);
  });

  test('§6 — un motif HOSTILE ressort échappé', async () => {
    const { page } = session;
    await aller(page, '/exigences/EX-DER');
    await attendrePanneau(page, 'derogationsEncartCorps');

    const etat = await page.evaluate(() => ({
      xss: window.__xss === 1,
      imgInjectee: document.querySelector('.der-motif img') !== null,
      motif: document.querySelector('.der-motif')?.textContent ?? '',
    }));
    assert.equal(etat.xss, false, 'Le motif de la dérogation s’est exécuté : échappement manquant.');
    assert.equal(etat.imgInjectee, false, 'Le balisage du motif a été interprété.');
    assert.match(
      etat.motif,
      /<img src=x/u,
      'Le motif doit s’afficher TEL QU’IL EST SAISI, chevrons compris.',
    );
  });
});
