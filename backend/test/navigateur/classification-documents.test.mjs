/**
 * classification-documents.test.mjs — **la classification traverse-t-elle
 * réellement l'écran, le réseau, la base, et revient-elle ?**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi cet essai existe, et pourquoi il est dans CETTE famille
 * ════════════════════════════════════════════════════════════════════════
 *
 * `test/documents/classification.test.mjs` prouve que la BASE tient : niveaux
 * bornés, étiquettes normalisées, rattachement qui ne franchit pas la frontière.
 * Cela ne prouve **rien** de ce qui compte pour l'utilisateur — que le champ
 * qu'il remplit arrive jusque-là, et que ce qu'il relit ensuite est ce qu'il a
 * écrit.
 *
 * C'est exactement la classe du constat **Q-194** — *« le défaut vivait entre
 * trois fichiers dont aucun n'avait tort seul, et aucun essai ne faisait passer
 * la sortie d'une route dans l'entrée d'une autre »* — et celle du défaut trouvé
 * la veille de la migration `020` : `normaliserListe()` filtrait les champs, et
 * deux colonnes neuves seraient restées **vides sur la recette, sans une erreur**.
 * Un champ neuf que le navigateur envoie et ne relit pas est le défaut le plus
 * silencieux que ce produit sache produire.
 *
 * ── LES CINQ PROPRIÉTÉS ─────────────────────────────────────────────────
 *
 *  §1 **L'aller-retour complet.** On remplit le formulaire dans un Chromium réel,
 *     on enregistre, on **recharge la page entière** — donc on repasse par
 *     `/api/donnees` — et l'on exige de retrouver les quatre informations :
 *     niveau, drapeau, rattachement, étiquettes.
 *
 *  §2 **Le badge de diffusion n'emprunte AUCUNE couleur de statut.** Vert, orange,
 *     rouge et gris qualifient une CONFORMITÉ (`CLAUDE.md` §2) ; un document
 *     restreint n'est pas « critique ». Mesuré sur la classe RENDUE, pas sur le
 *     code source.
 *
 *  §3 **Une étiquette refusée le DIT.** Une valeur avalée en silence est une
 *     valeur que l'utilisateur croit enregistrée — le motif exact des constats
 *     Q-201 et Q-207, pris par l'autre bout.
 *
 *  §4 **Le signal « public + données personnelles » se voit.** C'est la seule
 *     chose de tout ce lot que la base n'interdit PAS — parce qu'elle a des cas
 *     légitimes (un document public nomme son DPO, article 13) —, donc la seule
 *     qui n'existe que si l'écran la montre.
 *
 *  §5 **Le registre du produit se charge par l'écran RGPD**, et il ne sort aucun
 *     nom de personne.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterServeurReel } from '../aide/serveur.mjs';

const DELAI = 60_000;

let base;
let navigateur;
let serveur;
let application;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
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

describe('la classification documentaire, de l’écran à la base et retour', () => {
  let documentId;

  test('§1 — on remplit, on enregistre, on RECHARGE TOUT, et on retrouve', async () => {
    const { page } = session;

    // Le document local semé par le banc porte déjà un traitement local : on
    // travaille sur LUI, parce que c'est la fiche qu'un utilisateur ouvre.
    await aller(page, '/documents/DOC-A');
    documentId = 'DOC-A';

    // Le bloc de classification est là, et il propose les quatre niveaux — pas
    // trois, pas cinq. Une liste d'écran plus courte que la contrainte rendrait
    // des documents inéditables sans qu'un seul essai SQL le voie.
    const niveaux = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#confidentialite option')).map((o) => o.value),
    );
    assert.deepEqual(niveaux, ['public', 'interne', 'confidentiel', 'restreint']);

    await page.evaluate(() => {
      const sel = document.getElementById('confidentialite');
      sel.value = 'restreint';
      sel.dispatchEvent(new Event('change'));
      document.getElementById('donnees_personnelles').checked = true;
      const input = document.querySelector('#etiquettes .mp-input');
      const bouton = document.querySelector('#etiquettes .mp-addbtn');
      for (const valeur of ['  Revue   2026 ', 'RH']) {
        input.value = valeur;
        bouton.click();
      }
    });

    // La note du niveau suit le choix : c'est ce qui explique « restreint » à
    // quelqu'un qui ne connaît pas l'échelle.
    const note = await page.evaluate(
      () => document.getElementById('confidentialiteNote').textContent,
    );
    assert.match(note, /juridique/u);

    await page.click('#saveBtn');
    await attendreQuiescence(page, { delai: DELAI });

    // ── LE RECHARGEMENT COMPLET : on repasse par /api/donnees ────────────
    session = await ouvrirApplication();
    await aller(session.page, `/documents/${documentId}`);

    const relu = await session.page.evaluate((id) => {
      const d = DataStore.getDocumentById(id);
      return {
        confidentialite: d.confidentialite,
        donnees_personnelles: d.donnees_personnelles,
        traitement_id: d.traitement_id,
        etiquettes: (d.etiquettes ?? []).slice().sort(),
      };
    }, documentId);

    assert.equal(relu.confidentialite, 'restreint');
    assert.equal(relu.donnees_personnelles, true);
    assert.equal(relu.traitement_id, 'TRT-A', 'Le rattachement semé survit à l’enregistrement.');
    // « Site A » vient du semis : les étiquettes déjà posées survivent à un
    // enregistrement qui en ajoute d'autres. Ce n'est pas un détail — la liaison
    // est réécrite en entier à chaque enregistrement, et c'est exactement là
    // qu'une étiquette existante disparaîtrait sans un mot.
    assert.deepEqual(relu.etiquettes, ['RH', 'Revue 2026', 'Site A'],
      'Les espaces ont été ramenés à un — par la base, et l’écran relit ce qu’elle a écrit.');

    // Et le formulaire le REMONTRE : relire la base ne suffit pas, c'est le
    // champ qui doit revenir garni.
    const dansLeFormulaire = await session.page.evaluate(() => ({
      niveau: document.getElementById('confidentialite').value,
      coche: document.getElementById('donnees_personnelles').checked,
      chips: Array.from(document.querySelectorAll('#etiquettes .mp-label'))
        .map((e) => e.textContent.trim()).sort(),
    }));
    assert.equal(dansLeFormulaire.niveau, 'restreint');
    assert.equal(dansLeFormulaire.coche, true);
    assert.deepEqual(dansLeFormulaire.chips, ['RH', 'Revue 2026', 'Site A']);
  });

  test('§2 — le badge de diffusion n’emprunte AUCUNE couleur de statut', async () => {
    await aller(session.page, '/documents');
    const badges = await session.page.evaluate(() =>
      Array.from(document.querySelectorAll('.diffusion')).map((e) => ({
        classe: e.className,
        texte: e.textContent.trim(),
      })),
    );
    assert.ok(badges.length > 0, 'Aucun badge de diffusion rendu : la colonne ne sert à rien.');
    for (const b of badges) {
      assert.ok(
        !/\bstatus\b|status-conforme|status-non-conforme|status-partiellement-conforme|status-non-applicable/u.test(b.classe),
        `Le badge « ${b.texte} » emprunte une classe de STATUT : ${b.classe}`,
      );
    }
    assert.ok(badges.some((b) => b.texte === 'Restreint'));
  });

  test('§3 — une étiquette refusée le DIT, elle n’est pas avalée', async () => {
    await aller(session.page, `/documents/${documentId}`);
    const avant = await session.page.evaluate(
      () => document.querySelectorAll('#etiquettes .mp-label').length,
    );

    const message = await session.page.evaluate(() => {
      let dit = '';
      const ancien = window.showToast;
      window.showToast = (texte) => { dit = texte; };
      try {
        const input = document.querySelector('#etiquettes .mp-input');
        input.value = 'client Airbus, confidentiel';
        document.querySelector('#etiquettes .mp-addbtn').click();
      } finally {
        window.showToast = ancien;
      }
      return dit;
    });
    assert.match(message, /virgule/u);

    const apres = await session.page.evaluate(
      () => document.querySelectorAll('#etiquettes .mp-label').length,
    );
    assert.equal(apres, avant, 'La valeur refusée ne doit pas entrer non plus.');
  });

  test('§4 — « public + données personnelles » se voit, et se dit sans accuser', async () => {
    // On rend le document public en gardant le drapeau : la base l'accepte, et
    // c'est précisément pour cela que l'écran doit le montrer.
    await aller(session.page, `/documents/${documentId}`);
    await session.page.evaluate(() => {
      document.getElementById('confidentialite').value = 'public';
    });
    await session.page.click('#saveBtn');
    await attendreQuiescence(session.page, { delai: DELAI });

    await aller(session.page, '/documents');
    const bandeau = await session.page.evaluate(() => {
      const el = document.getElementById('alerteExposition');
      return el === null ? null : el.innerText.trim();
    });
    assert.ok(bandeau, 'Le signal le plus utile du lot n’existe que si l’écran le montre.');
    assert.match(bandeau, /données personnelles/u);
    // Il SIGNALE, il n'accuse pas : la combinaison a des cas légitimes, et le
    // texte doit le dire — sans quoi on apprend à ne plus lire les bandeaux.
    assert.match(bandeau, /pas une faute/u);

    // Et le bouton filtre réellement la liste.
    await session.page.click('#voirExposes');
    await attendreQuiescence(session.page, { delai: DELAI });
    const niveaux = await session.page.evaluate(() =>
      Array.from(document.querySelectorAll('tbody .diffusion')).map((e) => e.textContent.trim()),
    );
    assert.ok(niveaux.length > 0);
    assert.ok(niveaux.every((n) => n === 'Public'));
  });

  test('§5 — l’écran RGPD charge le registre de l’outil, et n’en sort aucun nom', async () => {
    await aller(session.page, '/rgpd');
    await session.page.click('#chargerRegistreProduit');
    await session.page.waitForFunction(
      () => (document.querySelectorAll('#registreProduit tbody tr').length ?? 0) > 0,
      null,
      { timeout: DELAI },
    );

    const vu = await session.page.evaluate(() => ({
      lignes: document.querySelectorAll('#registreProduit tbody tr').length,
      texte: document.getElementById('registreProduit').innerText,
    }));
    assert.ok(vu.lignes >= 50, `registre trop court à l’écran : ${String(vu.lignes)} lignes`);
    assert.match(vu.texte, /utilisateurs\.identifiant/u,
      'La colonne qu’aucun motif de nom ne devinait doit être LÀ, sous les yeux du DPO.');
    for (const nom of ['RSSI Toulouse', 'RSSI Allemagne']) {
      assert.ok(!vu.texte.includes(nom), `« ${nom} » est affiché dans le registre du produit`);
    }
  });
});
