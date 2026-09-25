/**
 * `dossier-donneur-ordre.test.mjs` — **LE DOSSIER PRÉPARÉ SURVIT À UN RE-RENDU**
 * (migrations `070` à `073`)
 *
 * 🛑 **CE FICHIER N'EXISTE QUE PARCE QU'UN CLIC A TROUVÉ CE QUE 2 588 ESSAIS NE VOYAIENT
 * PAS.** À sa première rédaction, l'écran affichait le dossier du donneur d'ordre à
 * **250 ms** et il avait **disparu à 5 secondes** : le sondage périodique de
 * `js/core/sync.js` re-rend l'écran courant dès que la donnée bouge, `renderDetail`
 * reconstruisait la fiche, et le dossier que l'utilisateur venait de demander était effacé
 * **sous ses yeux, sans une erreur et sans un message**.
 *
 * ⚠️ **Aucune autre famille ne pouvait le voir**, et c'est ce qui rend celle-ci nécessaire :
 * les essais de module vérifient qu'un écran **se rend** ; ceux d'API, qu'une route
 * **répond**. Personne ne restait cinq secondes devant la page. C'est la quatrième leçon du
 * `docs/REPRISE.md` — *vérifier au navigateur trouve ce que deux mille essais ne voient
 * pas* —, et c'est la cinquième fois qu'elle se vérifie.
 *
 * | § | Ce qui est mesuré |
 * |---|---|
 * | 1 | l'écran des donneurs d'ordre porte les quinze champs **dès la création** |
 * | 2 | le dossier se prépare, et **il est encore là après un re-rendu** |
 * | 3 | un nom hostile est **affiché**, jamais exécuté |
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
const NOM_HOSTILE = 'Airbus <img src=x onerror="window.__xss=1">';

let base;
let serveur;
let application;
let navigateur;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  const applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-dossier', FILIALE_A, [FILIALE_A]),
    async (c) => {
      await c.query(
        `insert into clients (id, filiale_id, nom, confidentialite_plancher,
                             notification_incident_h, contact_rt_nom, contact_rt_email)
         values ('CLI-ECRAN', $1, $2, 'confidentiel', 24, 'Claire Vasseur',
                 'claire.vasseur@exemple.test')`,
        [FILIALE_A, NOM_HOSTILE],
      );
      await c.query(
        `insert into traitements_pour_client
                (id, filiale_id, client_id, intitule, categories_traitement)
         values ('TPC-ECRAN', $1, 'CLI-ECRAN', 'Hébergement de son portail',
                 'Hébergement et sauvegarde')`,
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

async function aller(page, route) {
  await page.evaluate((r) => {
    const cible = `#${r}`;
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

describe('le dossier du donneur d’ordre, jusqu’à l’écran', () => {
  test('§1 — les quinze champs sont là DÈS LA CRÉATION, pas seulement sur la fiche', async () => {
    /* La demande du RSSI est littéralement *« à partir de la création d'un nouveau donneur
     * d'ordre »*. Un formulaire de création pauvre et une fiche riche, c'est deux vérités —
     * et c'est le défaut que le lot des filiales a payé le matin du même jour. */
    const { page } = session;
    await aller(page, '/clients');
    await page.click('#addClientBtn');
    await attendreQuiescence(page, { delai: DELAI });

    const manquants = await page.evaluate(() =>
      ['nom', 'secteur', 'pays', 'lei', 'entite_financiere_dora', 'contact_rt_nom',
       'contact_rt_email', 'contact_dpo_nom', 'contact_dpo_email', 'contrat_reference',
       'contrat_debut', 'contrat_fin', 'contrat_revue_le', 'droit_audit', 'fin_de_contrat',
       'confidentialite_plancher', 'notification_incident_h']
        .filter((i) => document.getElementById(i) === null));
    assert.deepEqual(manquants, [],
      'Le formulaire de CRÉATION doit porter les mêmes champs que la fiche.');
  });

  test('🛑 §2 — LE DOSSIER PRÉPARÉ SURVIT À UN RE-RENDU DE LA FICHE', async () => {
    const { page } = session;
    await aller(page, '/clients/CLI-ECRAN');

    await page.click('#cliPreparerDossier');
    await page.waitForFunction(
      () => (document.getElementById('cliDossier')?.textContent ?? '').includes('ne transmet rien'),
      null,
      { timeout: DELAI },
    );

    // ── LA MORSURE : on re-rend la fiche, exactement comme le sondage le fait ──────
    //
    // ⚠️ **C'est la seule ligne de ce fichier qui compte.** Sans elle, l'essai serait vert
    //    sur la version fautive : le dossier S'AFFICHE, dans les deux cas. Ce qui distingue
    //    le produit correct du produit fautif est ce qui reste APRÈS.
    await aller(page, '/clients/CLI-ECRAN');
    await attendreQuiescence(page, { delai: DELAI });

    const apres = await page.evaluate(() =>
      document.getElementById('cliDossier')?.textContent ?? '');
    assert.match(apres, /ne transmet rien/u,
      'Le dossier a disparu au re-rendu : c’est exactement le défaut trouvé en cliquant le '
      + '24/09/2026 — il s’affichait à 250 ms et n’était plus là à 5 s, sans une erreur.');
    assert.match(apres, /Ce qui manque/u,
      'Les manques sont la MOITIÉ UTILE du dossier : un dossier à moitié rempli est plus '
      + 'dangereux qu’un dossier vide.');
  });

  test('§3 — un nom hostile est AFFICHÉ, jamais exécuté', async () => {
    const { page } = session;
    await aller(page, '/clients');
    const texte = await page.evaluate(() => document.getElementById('app')?.textContent ?? '');
    assert.ok(texte.includes('<img src=x'),
      'Le nom hostile doit apparaître TEL QUEL : s’il est absent, l’essai ne mesure rien.');
    assert.equal(await page.evaluate(() => window.__xss), undefined,
      'Le gestionnaire d’erreur d’image ne doit jamais s’exécuter.');
  });
});
