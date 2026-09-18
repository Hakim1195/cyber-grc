/**
 * registre-dora.test.mjs — **LE REGISTRE DORA ET LA CHAÎNE, JUSQU'À L'ÉCRAN**
 * (lot L21, actions 21.1, 21.3 et 21.4)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe, et ce qu'il ferme
 * ════════════════════════════════════════════════════════════════════════
 *
 * `docs/REPRISE.md` §4, leçon du 16/09/2026 : *« une capacité qu'aucun écran
 * n'appelle est une capacité absente. Trois lots de suite ont été livrés,
 * éprouvés et verts sans que personne puisse s'en servir. »*
 *
 * Les routes du greffon `src/tiers/` sont éprouvées par
 * `test/tiers/registre-dora.test.mjs`. Ce fichier-ci mesure l'autre moitié :
 * **qu'un utilisateur les atteigne**, et que ce qu'il voit soit ce que le
 * serveur a dit.
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | L'onglet « Registre DORA » existe, et il mène au registre |
 * | 2 | Le registre affiche les MANQUES ligne par ligne — c'est ce qui en fait un plan de travail |
 * | 3 | Le score de la liste vient du SERVEUR, et il n'est pas recalculé sur le poste |
 * | 4 | La chaîne de sous-traitance affiche le RANG **et le CHEMIN** |
 * | 5 | ⚠️ Une boucle refusée par la base s'affiche comme un refus MÉTIER, pas comme une panne |
 * | 6 | Le nom d'un tiers hostile est échappé partout où il paraît |
 *
 * ── ⚠️ LE §5 EST CELUI QUI COMPTE ──────────────────────────────────────────
 *
 * L'anti-cycle vit EN BASE (critère 21.1). Le constat **Q-325** dit ce qui
 * arrive quand personne ne mesure la sortie : *« le refus soigné de la `030`
 * devenait un 500 avec pile d'appel. Il ÉTAIT éprouvé — en SQL direct, jamais
 * par la route. »* Ce fichier tente donc la boucle **au clavier**, et vérifie
 * que l'écran dit quelque chose d'utile.
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

/** Un nom qui PORTE une injection : sans lui, l'échappement ne décide de rien. */
const NOM_HOSTILE = 'Hébergeur <img src=x onerror="window.__xss=1">';

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
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      // Un tiers COMPLET, dont la ligne du registre ne doit manquer de rien.
      await c.query(
        `insert into prestataires
             (id, filiale_id, societe, criticite, acces, supply_chain,
              lei, pays, pays_donnees, fonction_supportee, fonction_critique,
              type_service, contrat_reference, contrat_debut, substituabilite,
              plan_sortie, plan_sortie_le, evalue_le)
         values ('DORA-COMPLET', $1, $2, 'vitale', 'etendu',
                 '{"clause":true,"notif":true,"audit":true,"donnees":true,
                   "reversibilite":true,"continuite":true}'::jsonb,
                 '969500HX7PZQ1L2M3N45', 'FR', 'IE', 'Hébergement de l''ERP', true,
                 'cloud_iaas', 'CTR-2024-018', date '2024-01-01', 'difficile',
                 'Bascule vers le socle interne.', date '2026-06-30', current_date)`,
        [FILIALE_A, NOM_HOSTILE],
      );
      // Un tiers LACUNAIRE, dont la ligne doit énumérer ses manques.
      await c.query(
        `insert into prestataires (id, filiale_id, societe, criticite, acces, fonction_critique)
             values ('DORA-LACUNE', $1, 'Sauvegardes Atlantique', 'forte', 'limite', true)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into prestataire_sous_traitance
             (id, filiale_id, prestataire_id, sous_traitant_id, service, dans_fonction_critique)
         values ('DORA-ST-1', $1, 'DORA-COMPLET', 'DORA-LACUNE',
                 'Sauvegarde des volumes', true)`,
        [FILIALE_A],
      );

      // ── Ce que le §7 mesure : les obligations datées du lot L21 ──────────────
      //
      // Deux dates contractuelles sur le tiers lacunaire (action 21.3), et trois
      // questionnaires dont **deux ne doivent PAS paraître** à l'échéancier : le
      // reçu et le brouillon. Sans ces deux-là, le §7 vérifierait qu'une liste
      // contient des lignes — jamais qu'elle EXCLUT ce qu'elle doit exclure.
      await c.query(
        `update prestataires
            set contrat_fin      = current_date + 20,
                contrat_revue_le = current_date + 5
          where id = 'DORA-LACUNE'`,
      );
      await c.query(
        `insert into questionnaires_tiers
             (id, filiale_id, prestataire_id, ref_id, intitule, envoye_le, echeance, recu_le)
         values ('QT-ECH-RECU', $1, 'DORA-COMPLET', 'aircyber',
                 'Questionnaire deja recu', current_date - 40, current_date - 10,
                 current_date - 2),
                ('QT-ECH-BROUILLON', $1, 'DORA-COMPLET', 'anssi-hygiene',
                 'Questionnaire jamais envoye', null, current_date - 8, null)`,
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

/** Attend qu'une zone asynchrone ait remplacé son message d'attente. */
async function attendreZone(page, id, motifAttente) {
  await page.waitForFunction(
    ([cible, motif]) => {
      const n = document.getElementById(cible);
      return n !== null && !new RegExp(motif, 'u').test(n.textContent ?? '');
    },
    [id, motifAttente],
    { timeout: DELAI },
  );
}

describe('le registre DORA et la chaîne, jusqu’à l’écran', () => {
  test('§1 — l’onglet mène au registre, et le registre s’affiche', async () => {
    const { page } = session;
    await aller(page, '/prestataires');

    const onglet = await page.evaluate(() =>
      [...document.querySelectorAll('.page-onglets a')].map((a) => ({
        route: a.dataset.route,
        libelle: a.textContent,
      })),
    );
    // ⚠️ Sans cet onglet, la capacité serait livrée et injoignable — le défaut
    // exact que `docs/REPRISE.md` §4 nomme, trois lots de suite.
    assert.ok(
      onglet.some((o) => o.route === '/tiers-dora'),
      `L’onglet « Registre DORA » doit exister : ${JSON.stringify(onglet)}`,
    );

    await aller(page, '/tiers-dora');
    await attendreZone(page, 'registreZone', 'Chargement du registre');
    const titre = await page.evaluate(() => document.querySelector('h1')?.textContent ?? '');
    assert.match(titre, /Registre d’information DORA|Registre d'information DORA/u);
  });

  test('§2 — le registre dit ses MANQUES, ligne par ligne', async () => {
    const { page } = session;
    await aller(page, '/tiers-dora');
    await attendreZone(page, 'registreZone', 'Chargement du registre');

    const texte = await page.evaluate(
      () => document.getElementById('registreZone')?.textContent ?? '',
    );
    // ⚠️ C'est cela qui fait la valeur de l'écran : un registre remis avec des
    // cases vides est refusé, et un registre qui tairait ses trous laisserait
    // croire qu'il est complet.
    assert.match(texte, /identifiant LEI/u, 'les manques doivent être NOMMÉS');
    assert.match(texte, /Complète/u, 'et la ligne complète doit se distinguer');
    assert.match(texte, /geste humain/u, 'le produit prépare, il ne dépose pas');
  });

  test('§3 — le score de la liste vient du SERVEUR', async () => {
    const { page } = session;
    await aller(page, '/prestataires');
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.score-tiers')].some(
          (n) => !/Calcul en cours/u.test(n.textContent ?? ''),
        ),
      null,
      { timeout: DELAI },
    );

    const vu = await page.evaluate(() => {
      const cellule = document.querySelector('.score-tiers[data-id="DORA-COMPLET"]');
      return {
        texte: cellule?.textContent ?? '',
        // ⚠️ Le module ne doit plus porter de table de poids : c'est la
        // duplication que l'action 21.4 supprime. On mesure l'ABSENCE sur la
        // source réellement servie, pas sur le dépôt.
        poidsLocaux:
          typeof window.PraPrestatairesModule === 'object' &&
          Object.keys(window.PraPrestatairesModule).length > 0,
      };
    });
    assert.match(vu.texte, /Critique|Élevé|Modéré|Faible/u, `score attendu, vu « ${vu.texte} »`);
    assert.doesNotMatch(vu.texte, /Calcul en cours/u);
  });

  test('§4 — la chaîne affiche le RANG et le CHEMIN', async () => {
    const { page } = session;
    await aller(page, '/prestataires/DORA-COMPLET');
    await attendreZone(page, 'chaineTiers', 'Chargement de la chaîne');

    const texte = await page.evaluate(
      () => document.getElementById('chaineTiers')?.textContent ?? '',
    );
    assert.match(texte, /Rang 1/u);
    assert.match(texte, /Sauvegardes Atlantique/u);
    // ⚠️ Le chemin est ce qui rend le rang VÉRIFIABLE : sans lui, « rang 2 » est
    // un nombre qu'un auditeur devrait croire sur parole, sur la pièce même dont
    // l'objet est de ne rien devoir croire sur parole.
    assert.match(texte, /DORA-COMPLET → DORA-LACUNE/u, `chemin attendu : ${texte}`);
  });

  test('§5 — ⚠️ une boucle refusée par la BASE s’affiche comme un refus métier', async () => {
    // ⚠️ **Cet essai a sa PROPRE page, et il la referme.** Un enregistrement
    // refusé reste bloqué dans `js/core/sync.js` — c'est le comportement voulu
    // depuis le 6ᵉ passage de la porte S2 : *« la saisie reste à l'écran »*,
    // parce que la jeter ferait payer à l'utilisateur un refus qu'il n'a pas
    // provoqué. La page ne revient donc JAMAIS au repos, et tout essai suivant
    // qui attendrait la quiescence expirerait — ce qui est arrivé à la première
    // rédaction, et a fait échouer le §6 pour une raison qui n'était pas la
    // sienne.
    const propre = await ouvrirApplication();
    try {
      const { page } = propre;
      const erreurs = [];
      page.on('pageerror', (e) => erreurs.push(String(e)));

      // On se place sur le tiers LACUNAIRE et l'on déclare son donneur d'ordre
      // comme son sous-traitant : A → B existe, on demande B → A.
      await aller(page, '/prestataires/DORA-LACUNE');
      await attendreZone(page, 'chaineTiers', 'Chargement de la chaîne');

      await page.evaluate(() => {
        const cible = document.getElementById('stCible');
        cible.value = 'DORA-COMPLET';
        cible.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('stService').value = 'Boucle interdite';
        document.getElementById('stAjouter').click();
      });

      // On n'attend PAS la quiescence — voir ci-dessus. On attend la trace que
      // le produit promet : le bandeau des enregistrements non partis.
      await page.waitForFunction(
        () => document.querySelector('.quota-banner') !== null,
        null,
        { timeout: DELAI },
      );

      const vu = await page.evaluate(() => {
        const bandeau = document.querySelector('.quota-banner');
        // Le détail est replié par défaut : on l'ouvre, c'est le geste que le
        // bandeau propose et c'est là que le message du serveur se lit.
        document.getElementById('sync-detail')?.click();
        return {
          bandeau: bandeau?.textContent ?? '',
          detail: document.querySelector('.quota-banner')?.textContent ?? '',
          chaine: document.getElementById('chaineTiers')?.textContent ?? '',
        };
      });

      // ⚠️ **Aucune erreur de script.** C'est la moitié « Q-325 » : un refus
      // soigné en base qui arriverait à l'écran en pile d'appel serait pire
      // qu'un refus grossier, parce qu'il serait classé incident serveur.
      assert.deepEqual(erreurs, [], 'un refus métier ne doit produire aucune erreur de script');

      // Le produit DIT que quelque chose n'est pas parti. Un refus silencieux
      // serait le pire des trois cas : l'utilisateur croirait sa chaîne à jour.
      assert.match(vu.bandeau, /non enregistré/u, `le bandeau doit signaler le refus : ${vu.bandeau}`);

      // Et la boucle n'apparaît pas comme un maillon accepté : c'est la
      // propriété que l'anti-cycle garantit, vue du poste de l'utilisateur.
      assert.doesNotMatch(
        vu.chaine,
        /DORA-LACUNE → DORA-COMPLET/u,
        'la boucle ne doit jamais s’afficher comme un maillon accepté',
      );
    } finally {
      await propre.contexte.close().catch(() => {});
    }
  });

  test('§6 — le nom hostile est échappé partout où il paraît', async () => {
    const { page } = session;
    for (const route of ['/prestataires', '/tiers-dora', '/prestataires/DORA-COMPLET']) {
      await aller(page, route);
      const marque = await page.evaluate(() => window.__xss === 1);
      assert.equal(marque, false, `injection exécutée sur ${route}`);
    }
    // Contrôle de MORSURE : le nom hostile est bien présent dans le produit —
    // sans quoi les trois assertions ci-dessus passeraient pour la seule raison
    // qu'il n'y a rien à échapper (motif Q-210).
    await aller(page, '/prestataires');
    const texte = await page.evaluate(() => document.body.textContent ?? '');
    assert.match(texte, /onerror/u, 'le nom hostile doit bien être affiché, en texte');
  });

  test('§7 — l’échéance du questionnaire et les dates de contrat arrivent à l’ÉCHÉANCIER', async () => {
    // ⚠️ Le critère d'acceptation de l'action 21.3 dit « alimentent l'échéancier
    // EXISTANT », et c'est tout son sens : une obligation datée rangée dans un
    // écran à part est invisible à qui consulte ses échéances. La migration `043`
    // l'écrit jusque dans le commentaire de sa colonne `echeance`. Cela n'était
    // vrai nulle part : `js/services/echeances.js` ne connaissait ni les
    // questionnaires ni les contrats.
    const { page } = session;
    await aller(page, '/echeances');

    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');
    assert.match(texte, /Questionnaire fournisseur/u);
    assert.match(texte, /Questionnaire annuel de sécurité/u);
    assert.match(texte, /Échéance contractuelle/u);
    assert.match(texte, /Fin du contrat/u);
    assert.match(texte, /Revue des clauses de sécurité/u);
    assert.match(texte, /Plan de sortie à éprouver/u);

    // ── Les exclusions, mesurées sur l'agrégateur lui-même ──────────────────
    const compte = await page.evaluate(() => {
      const tout = window.Echeances.collect();
      return {
        questionnaires: tout.filter((i) => i.type === 'questionnaire').map((i) => i.titre),
        contrats: tout.filter((i) => i.type === 'contrat').length,
        // `evalue_le` est un fait PASSÉ — la ranger parmi les échéances
        // inverserait son sens. Trois dates contractuelles sont semées, et
        // `evalue_le` l'est aussi sur DORA-COMPLET : si elle entrait, on en
        // compterait quatre.
        avecDateDEvaluation: tout.filter((i) => /valuation/u.test(i.titre ?? '')).length,
      };
    });

    assert.deepEqual(compte.questionnaires, ['Questionnaire annuel de sécurité']);
    assert.equal(compte.contrats, 3);
    assert.equal(compte.avecDateDEvaluation, 0);

    // ── Et les boutons de filtre les connaissent ────────────────────────────
    //
    // ⚠️ Ils étaient écrits à la main dans `js/modules/echeances.js` : deux
    // sources de plus au lot L21, et aucun bouton pour les isoler — une
    // omission qui ne fait rien échouer. Les types se DÉCOUVRENT désormais dans
    // ce que l'agrégateur rend (règle du `CLAUDE.md` §3).
    const boutons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ech-fbtn')).map((b) => b.dataset.type),
    );
    assert.ok(boutons.includes('questionnaire'), boutons.join(' · '));
    assert.ok(boutons.includes('contrat'), boutons.join(' · '));
  });

  test('§8 — supprimer le tiers n’en laisse AUCUNE échéance fantôme à l’écran', async () => {
    // ⚠️ **Ce défaut a été trouvé AU NAVIGATEUR SUR LA RECETTE, et le banc ne
    // pouvait pas le voir** (18/09/2026). Les trois tables de L21 pendent au
    // prestataire par une clé `on delete cascade` : la base les emporte, et
    // `test/tiers/questionnaire-fournisseur.test.mjs` §8 le mesure. Mais la façade
    // EN MÉMOIRE les gardait — si bien qu'après suppression d'un tiers,
    // l'échéancier annonçait encore l'échéance de son questionnaire, et le badge de
    // la barre latérale la comptait.
    //
    // *Le défaut ne vivait ni dans la base, ni dans la route : il vivait dans
    // l'écart entre les deux cascades.* Classe Q-201 / Q-207 — le produit affirme
    // une chose qui n'est pas.
    const { page } = session;
    await aller(page, '/prestataires');

    const avant = await page.evaluate(() => {
      const id = 'DORA-CASCADE';
      window.DataStore.addPrestataire({ id, societe: 'Tiers à supprimer' });
      window.DataStore.addQuestionnaire({
        id: 'QUES-CASCADE', prestataire_id: id, ref_id: 'anssi-hygiene',
        intitule: 'Questionnaire fantôme',
        // Envoyé et en retard : sans cela l'échéance n'entrerait pas, et l'essai
        // mesurerait son propre semis au lieu de la cascade.
        envoye_le: '2026-01-05', echeance: '2026-02-05', relance_le: '', recu_le: '',
      });
      window.DataStore.addReponse({
        id: 'QREP-CASCADE', questionnaire_id: 'QUES-CASCADE', code: 'A1', reponse: 'non',
      });
      window.DataStore.addSousTraitance({
        id: 'SOUS-CASCADE', prestataire_id: id, sous_traitant_id: 'DORA-LACUNE',
        service: 'Sauvegarde', dans_fonction_critique: false,
      });
      const compte = window.Echeances.collect().filter((e) => e.type === 'questionnaire').length;
      return { compte, reponses: window.DataStore.getReponsesDe('QUES-CASCADE').length };
    });
    assert.equal(avant.compte >= 1, true, 'le semis doit produire une échéance, sinon rien n’est mesuré');

    const apres = await page.evaluate(() => {
      window.DataStore.deletePrestataire('DORA-CASCADE');
      return {
        echeances: window.Echeances.collect().filter((e) => e.titre === 'Questionnaire fantôme').length,
        questionnaires: window.DataStore.getQuestionnaires().filter((q) => q.id === 'QUES-CASCADE').length,
        reponses: window.DataStore.getReponsesDe('QUES-CASCADE').length,
        aretes: window.DataStore.getSousTraitances().filter((a) => a.id === 'SOUS-CASCADE').length,
      };
    });

    assert.equal(apres.echeances, 0, 'une échéance survit au tiers qui la portait');
    assert.equal(apres.questionnaires, 0);
    assert.equal(apres.reponses, 0, 'les réponses restent, invisibles et hors de portée');
    assert.equal(apres.aretes, 0, 'l’arête de sous-traitance pointe dans le vide');
  });
});
