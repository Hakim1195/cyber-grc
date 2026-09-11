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
 *
 *  §6 **Une étiquette HOSTILE est échappée** — et l'essai le fait DÉCIDER. Constat
 *     **Q-305** : la famille n'employait que des étiquettes inoffensives (`RH`,
 *     `Revue 2026`, `Site A`), si bien que retirer `escapeHtml` du seul endroit
 *     qui rend de la donnée utilisateur laissait **5 essais sur 5 au vert**.
 *     C'est le motif du constat **Q-210** : *un essai qui couvre une règle sans
 *     jamais la faire décider ne la couvre pas.*
 *
 *  §7 **Le circuit d'approbation d'un document QU'ON VIENT DE CRÉER est visible
 *     sans recharger** — constat **Q-303**. Le serveur réattribue l'identifiant à
 *     la création ; l'encart interrogeait le serveur avec l'identifiant provisoire
 *     du navigateur, recevait 404, et affirmait à l'utilisateur que son propre
 *     document « appartient à une autre filiale ».
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

  test('§6 — une étiquette HOSTILE est échappée, et l’essai le fait DÉCIDER', async () => {
    /* ══ CONSTAT Q-305 ═══════════════════════════════════════════════════════
     *
     * La base ACCEPTE ces valeurs — mesuré par l'auditeur du 8ᵉ passage :
     *
     *     POST /api/entites/documents {"etiquettes":["<img src=x onerror=alert(1)>", …]}
     *     → 201, les deux étiquettes sont STOCKÉES telles quelles
     *
     * C'est délibéré : une étiquette est du texte libre, et la base n'a pas à
     * décider de ce qu'un rendu HTML en fera. La garantie est donc **entièrement**
     * du côté de l'écran, et rien ne la mesurait : la famille n'employait que des
     * étiquettes inoffensives. `escapeHtml` retiré de l'étiquette affichée →
     * **5 essais sur 5 verts**.
     *
     * Ce contrôle sème la valeur hostile PAR LA BASE — la saisie d'écran refuse
     * la virgule et bornerait la longueur, et ce n'est pas la saisie qu'on
     * éprouve ici, c'est le RENDU. */
    const HOSTILE = '<img src=x onerror=window.__xss=1>';

    await base.avecPerimetre(
      await base.connexion('app'),
      perimetre('essai-q305', FILIALE_A, [FILIALE_A]),
      async (c) => {
        await c.query(
          `insert into document_etiquettes (document_id, etiquette, filiale_id)
               values ('DOC-A', $2, $1)
           on conflict do nothing`,
          [FILIALE_A, HOSTILE],
        );
      },
      { annuler: false },
    );

    // On recharge tout : l'étiquette doit traverser /api/donnees puis le rendu.
    session = await ouvrirApplication();
    await aller(session.page, '/documents');

    const vu = await session.page.evaluate((hostile) => {
      const corps = document.getElementById('app');
      return {
        // L'ATTAQUE A-T-ELLE PRIS ? C'est la seule question qui compte.
        injectee: window.__xss === 1,
        images: corps.querySelectorAll('img[src="x"]').length,
        // Et la valeur est-elle bien AFFICHÉE, en clair ? Un échappement qui
        // mange la valeur serait une autre façon de perdre la donnée.
        affichee: corps.innerText.includes(hostile),
      };
    }, HOSTILE);

    assert.equal(vu.injectee, false, 'L’étiquette hostile s’est exécutée dans la page.');
    assert.equal(vu.images, 0, 'Le balisage de l’étiquette a été INTERPRÉTÉ au lieu d’être rendu.');
    assert.equal(
      vu.affichee,
      true,
      'L’étiquette doit s’AFFICHER telle quelle : un échappement qui mange la valeur la ' +
        'perd tout autant, et l’utilisateur ne saurait pas ce qu’il a en base.',
    );

    // La fiche aussi — c'est un second site de rendu, et la porte S2 a trouvé
    // deux injections résiduelles dont une dans un `<option>`.
    await aller(session.page, `/documents/${documentId}`);
    const surLaFiche = await session.page.evaluate(() => ({
      injectee: window.__xss === 1,
      images: document.getElementById('app').querySelectorAll('img[src="x"]').length,
    }));
    assert.equal(surLaFiche.injectee, false);
    assert.equal(surLaFiche.images, 0);
  });

  test('§7 — le circuit d’un document QU’ON VIENT DE CRÉER est visible sans recharger', async () => {
    /* ══ CONSTAT Q-303 — ET IL EST BLOQUANT ═══════════════════════════════════
     *
     * Le serveur RÉATTRIBUE l'identifiant à la création : proposer le sien est
     * refusé (oracle d'existence inter-filiales). L'encart d'approbation
     * interrogeait donc le serveur avec l'identifiant provisoire du navigateur,
     * recevait 404, et affichait :
     *
     *     « Cet enregistrement est introuvable. Il a peut-être été supprimé, ou
     *       il appartient à une AUTRE FILIALE. »
     *
     * Deux défauts, et le second est le pire : le geste nominal — créer une
     * politique puis engager sa validation — ne se terminait pas sans un
     * rechargement ; et le produit affirmait à tort, SUR LE CLOISONNEMENT, qu'un
     * enregistrement créé dans sa propre filiale appartenait à une autre. */
    await aller(session.page, '/documents');
    await session.page.click('#addBtn');
    await session.page.waitForSelector('#save', { timeout: DELAI });
    await session.page.evaluate(() => {
      document.getElementById('titre').value = 'Politique créée par l’essai Q-303';
    });
    await session.page.click('#save');
    await attendreQuiescence(session.page, { delai: DELAI });
    // Le renommage arrive APRÈS la réponse du serveur : on attend que l'encart
    // soit chargé, sans quoi on mesurerait le « Lecture du circuit… » initial.
    await session.page.waitForFunction(
      () =>
        !(document.getElementById('approbationsEncart')?.innerText ?? '').includes(
          'Lecture du circuit',
        ),
      null,
      { timeout: DELAI },
    );

    const vu = await session.page.evaluate(() => {
      const encart = document.getElementById('approbationsEncart');
      return {
        present: encart !== null,
        idAttribut: encart?.dataset.id ?? null,
        route: window.location.hash,
        texte: encart?.innerText ?? '',
      };
    });

    assert.equal(vu.present, true, 'L’encart d’approbation doit être sur la fiche.');
    assert.equal(
      vu.route.endsWith(vu.idAttribut ?? '—'),
      true,
      `Le « data-id » du conteneur (${String(vu.idAttribut)}) doit être celui de la route ` +
        `(${vu.route}) : c’est le recalage du renommage qui le tient à jour.`,
    );
    assert.equal(
      /introuvable|autre filiale/u.test(vu.texte),
      false,
      'Le produit annonce que l’enregistrement qu’on vient de créer est introuvable, ou ' +
        'qu’il appartient à une AUTRE FILIALE. C’est faux, et c’est faux sur le ' +
        `cloisonnement (constat Q-303). Encart : « ${vu.texte.slice(0, 200)} »`,
    );
    assert.match(
      vu.texte,
      /circuit|étape|rédaction/iu,
      `Le circuit doit être LISIBLE sans rechargement. Encart : « ${vu.texte.slice(0, 200)} »`,
    );
  });

  test('§8 — L’INVERSION DÉCIDE : le DOM gagne sur l’argument — Q-303, constat B-5', async () => {
    /* ══ POURQUOI CE CONTRÔLE EXISTE ══════════════════════════════════════════
     *
     * Le correctif de Q-303 a deux moitiés, et son commentaire désigne la
     * première comme la vraie : `const i = noeud.dataset.id || id` — *« la source
     * la plus fraîche doit gagner »*. L'auditeur a remis l'ordre d'origine
     * (`id || noeud.dataset.id`) : **sept essais verts**. La seconde moitié —
     * l'annonce du recalage — appelle `brancherEncart(null, null)`, si bien que
     * l'argument est `undefined` et que **l'inversion ne décide jamais**.
     *
     * *Un essai qui couvre une règle sans jamais la faire décider ne la couvre
     * pas* — c'est le motif du constat Q-210. Le jour où un appelant transmettra
     * de nouveau un identifiant capturé, Q-303 reviendrait en silence.
     *
     * On fait donc décider l'inversion : on appelle l'encart avec un identifiant
     * PÉRIMÉ, comme le faisait `documents.js`, et l'on exige que ce soit le
     * `data-id` du conteneur qui parte au serveur. */
    await aller(session.page, `/documents/${documentId}`);

    // ⚠️ On écoute les requêtes DEPUIS PLAYWRIGHT, et non en remplaçant `fetch`
    // dans la page : un enrobage posé à l'intérieur ne mesure que ce que la page
    // veut bien lui montrer. Ce qui compte est ce qui SORT sur le réseau.
    const demandes = [];
    const ecouter = (requete) => {
      const url = requete.url();
      if (url.includes('/api/approbations/')) demandes.push(url);
    };
    session.page.on('request', ecouter);
    let vraiId;
    try {
      vraiId = await session.page.evaluate(async (perime) => {
        const encart = document.getElementById('approbationsEncart');
        // L'appelant transmet un identifiant PÉRIMÉ — la faute que l'inversion
        // existe pour absorber.
        ApprobationsModule.brancherEncart('documents', perime);
        await new Promise((r) => setTimeout(r, 1000));
        return encart.dataset.id;
      }, 'DOC-PERIME-0000000000000-zzzz');
    } finally {
      session.page.off('request', ecouter);
    }
    const vu = { vraiId, demandes };

    assert.ok(vu.demandes.length >= 1, 'L’encart n’a interrogé personne : rien n’est mesuré.');
    assert.ok(
      vu.demandes.every((u) => u.includes(vu.vraiId)),
      'L’encart a interrogé le serveur avec l’identifiant PÉRIMÉ que l’appelant lui a ' +
        'passé, au lieu du « data-id » du conteneur que le recalage tient à jour. ' +
        `Demandes : ${JSON.stringify(vu.demandes)} — attendu : ${vu.vraiId} (constat B-5).`,
    );
    assert.ok(
      vu.demandes.every((u) => !u.includes('DOC-PERIME')),
      'L’identifiant périmé est parti au serveur.',
    );
  });

  test('§9 — le filtre des traitements DÉCIDE, dans les deux sens — Q-294, constat B-11', async () => {
    /* Le filtre de Q-294 n'était mordu par rien : le remettre à « tous les
       traitements » laissait la famille verte. On le fait décider sur les DEUX
       portées — le sens OUVERT compte autant que le sens fermé, et n'éprouver
       que le second referait le défaut que Q-294 a corrigé. */
    const semis = await session.page.evaluate(() => ({
      tous: DataStore.getTraitements().map((t) => t.id),
      groupe: DataStore.getTraitements()
        .filter((t) => t._porteeGroupe === true)
        .map((t) => t.id),
      documentGroupe: (DataStore.getDocuments().find((d) => d._porteeGroupe === true) ?? {}).id,
    }));
    assert.ok(
      semis.tous.length > semis.groupe.length && semis.groupe.length > 0,
      `Le semis doit porter des traitements des DEUX portées : ${JSON.stringify(semis)}`,
    );
    assert.ok(semis.documentGroupe, 'Le semis doit porter un document de portée Groupe.');

    // (a) sur un document LOCAL : tout est proposé — c'est le sens qu'on a ouvert.
    await aller(session.page, `/documents/${documentId}`);
    const surLocal = await session.page.evaluate(() =>
      Array.from(document.querySelectorAll('#traitement_id option')).map((o) => o.value),
    );
    for (const id of semis.tous) {
      assert.ok(
        surLocal.includes(id),
        `Le traitement « ${id} » n’est pas proposé sur un document LOCAL. Le sens ` +
          '« local → Groupe » est celui que le constat Q-294 a OUVERT.',
      );
    }

    // (b) sur un document de portée GROUPE : les traitements LOCAUX disparaissent.
    await aller(session.page, `/documents/${semis.documentGroupe}`);
    const surGroupe = await session.page.evaluate(() => ({
      options: Array.from(document.querySelectorAll('#traitement_id option')).map((o) => o.value),
      note: document.getElementById('app').innerText.includes('Portée Groupe'),
    }));
    const locaux = semis.tous.filter((id) => !semis.groupe.includes(id));
    for (const id of locaux) {
      assert.ok(
        !surGroupe.options.includes(id),
        `Le traitement LOCAL « ${id} » est proposé sur un document de portée GROUPE : ` +
          'l’utilisateur choisirait une valeur que la base refuse, et le message lui dirait ' +
          'que l’élément n’existe pas dans son périmètre (constats Q-294, B-11).',
      );
    }
    for (const id of semis.groupe) {
      assert.ok(surGroupe.options.includes(id), `Le traitement de Groupe « ${id} » manque.`);
    }
    assert.equal(
      surGroupe.note,
      true,
      'L’écran doit DIRE pourquoi la liste est plus courte : une liste amputée sans un mot ' +
        'fait chercher un traitement qu’on croit avoir perdu.',
    );
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
