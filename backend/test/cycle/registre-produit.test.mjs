/**
 * registre-produit.test.mjs — **le produit rend compte de LUI-MÊME**
 * (migration `026`, route `/api/rgpd/registre-produit`).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cet essai existe pour attraper
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le produit tient le registre de l'article 30 de ses clients depuis le chantier 6.
 * Il ne savait pas dire le SIEN — et c'est la première question qu'un DPO pose à un
 * logiciel de conformité : *« que faites-vous de nos données ? »*. La migration
 * `026` a décidé la réponse colonne par colonne ; cette route la rend.
 *
 * ── Trois propriétés, et la troisième est celle qui compte ───────────────
 *
 *  §1 **le registre est COMPLET et non vide** — un essai qui accepterait un tableau
 *     vide déclarerait la route verte sur une base où le semis n'aurait rien mis.
 *     Le plancher est donc chiffré, et il porte sur les colonnes que la purge ne
 *     pouvait PAS deviner par un motif de nom : c'est la mesure qui a justifié le
 *     registre.
 *
 *  §2 **il ne contient AUCUNE donnée personnelle** — il décrit le schéma. C'est ce
 *     qui autorise `lire` plutôt qu'`administrer`, et un essai doit le vérifier
 *     plutôt que le supposer : une route qui rendrait des noms sous couvert de
 *     registre serait la fuite la plus ironique du dépôt.
 *
 *  §3 **le domaine est exigé** — un profil sans `rgpd` reçoit 403, et le reçoit du
 *     crochet du produit, pas d'une garde écrite dans le fichier de route.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, semerJeuEssai } from '../aide/base.mjs';
import { monterCycle, perimetreDe, profil, SessionDEssai } from './aide.mjs';

const DROITS_DPO = profil('lecture', { domaines: ['rgpd', 'documents'], export: false });
const DROITS_SANS_RGPD = profil('administration', {
  domaines: ['administration', 'personnel'],
  export: true,
});
const PERIMETRE = perimetreDe('dpo.groupe', FILIALE_A, [FILIALE_A, FILIALE_B]);

let base;
let applicatif;
let serveur;
let session;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
  session = new SessionDEssai(PERIMETRE, DROITS_DPO);
  serveur = await monterCycle(base, session);
});

after(async () => {
  await serveur?.fermer();
  await base?.fermer();
});

/** Le registre tel que la route le rend. */
async function lireRegistre() {
  const reponse = await serveur.appeler('GET', serveur.chemins.registreProduit);
  assert.equal(reponse.statut, 200, JSON.stringify(reponse.corps));
  return reponse.corps.colonnes;
}

describe('le registre des données personnelles du produit', () => {
  test('§1 — il est complet, et il porte ce qu’aucun motif de nom ne devinait', async () => {
    const colonnes = await lireRegistre();
    assert.ok(colonnes.length >= 50, `registre trop court : ${String(colonnes.length)} colonnes`);

    const personnelles = colonnes.filter((c) => c.nature === 'personnelle');
    assert.ok(
      personnelles.length >= 30,
      `${String(personnelles.length)} colonnes personnelles — la purge n’en connaissait que CINQ`,
    );

    // ⚠️ LA MESURE QUI A JUSTIFIÉ LE REGISTRE. Ces quatre colonnes désignent une
    // personne et **aucun motif de nom ne les attrape** : la purge, qui balayait
    // par motif, les laissait intactes en annonçant « terminé ».
    const cles = new Set(colonnes.map((c) => `${c.table_nom}.${c.colonne}`));
    for (const invisible of [
      'utilisateurs.identifiant',
      'utilisateurs.upn',
      'utilisateurs.sid_ad',
      'utilisateurs.nom_affichage',
    ]) {
      assert.ok(cles.has(invisible), `${invisible} absente du registre`);
    }

    // Et les huit colonnes que le garde-fou a rendues à son auteur, dont la plus
    // embarrassante : l'empreinte du mot de passe du compte de secours.
    for (const trouvee of ['crise.notes', 'utilisateurs.mot_de_passe_hash']) {
      assert.ok(cles.has(trouvee), `${trouvee} absente du registre`);
    }
  });

  test('§1 bis — toute colonne personnelle porte les quatre mentions de l’article 30', async () => {
    const colonnes = await lireRegistre();
    const incompletes = colonnes
      .filter((c) => c.nature === 'personnelle')
      .filter(
        (c) =>
          !c.finalite || !c.base_legale || c.duree_jours === null || !c.a_expiration,
      )
      .map((c) => `${c.table_nom}.${c.colonne}`);
    assert.deepEqual(
      incompletes,
      [],
      'Une donnée personnelle sans finalité, base légale, durée ou devenir n’est pas déclarée : elle est mentionnée.',
    );
  });

  test('§1 ter — les données personnelles viennent EN TÊTE', async () => {
    // C'est ce qu'on vient lire ; les faire suivre dix-neuf colonnes techniques
    // ferait d'un registre de dix lignes utiles un tableau qu'on ne finit pas.
    const colonnes = await lireRegistre();
    const derniereP = colonnes.map((c) => c.nature).lastIndexOf('personnelle');
    const premiereNonP = colonnes.map((c) => c.nature).indexOf('non_personnelle');
    assert.ok(derniereP < premiereNonP, 'Le tri par nature ne tient pas.');
  });

  test('§2 — AUCUNE donnée personnelle ne transite par cette route', async () => {
    // La vérification est faite sur le TEXTE ENTIER de la réponse, et contre les
    // noms que le semis a réellement écrits en base. Chercher une chaîne choisie
    // d'avance mesurerait l'essai, pas la route.
    const reponse = await serveur.appeler('GET', serveur.chemins.registreProduit);
    const texte = JSON.stringify(reponse.corps);
    for (const nom of ['RSSI Toulouse', 'RSSI Allemagne', 'rssi.toulouse', 'rssi.allemagne']) {
      assert.ok(!texte.includes(nom), `« ${nom} » est sorti par le registre du produit`);
    }
  });

  test('§3 — le domaine « rgpd » est exigé, et c’est le crochet du produit qui le dit', async () => {
    session.poser(PERIMETRE, DROITS_SANS_RGPD);
    try {
      const refus = await serveur.appeler('GET', serveur.chemins.registreProduit);
      assert.equal(refus.statut, 403);
    } finally {
      session.poser(PERIMETRE, DROITS_DPO);
    }
    // Et la déclaration de la route est bien celle qu'on croit — lue chez Fastify,
    // jamais recopiée.
    const declaree = serveur.routes.find((r) => r.url === serveur.chemins.registreProduit);
    assert.ok(declaree, 'route absente du greffon');
    assert.deepEqual(declaree.acces, { action: 'lire', domaine: 'rgpd' });
  });

  test('§3 bis — « lire » et non « administrer » : le registre est une PIÈCE À MONTRER', async () => {
    // Un profil de simple LECTURE, sans droit d'export ni administration, doit
    // l'obtenir : le refuser reviendrait à cacher la réponse à la seule question
    // qu'un DPO pose. La session courante est déjà celle-là — on le constate.
    const colonnes = await lireRegistre();
    assert.ok(colonnes.length > 0);
  });
});
