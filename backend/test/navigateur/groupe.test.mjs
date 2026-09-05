/**
 * groupe.test.mjs — l'écran « Vision Groupe » (`/groupe`), lot L4.
 *
 * ── Ce que cet écran doit prouver, et à qui ─────────────────────────────────
 *
 * Le `PLAN_SERVEUR` §7 promet à la direction une **vision Groupe consolidée**.
 * La vague 4 a livré le sélecteur de filiale et le `README` §8 a marqué le lot
 * livré **en écrivant lui-même la réserve** : *« la Direction voit une filiale à
 * la fois »*. `GET /api/consolidation` a levé la moitié serveur ; cet écran est
 * l'autre moitié. Sans lui, la route existe et personne ne la regarde.
 *
 * ── LA PROPRIÉTÉ CENTRALE, ET POURQUOI ELLE EXIGE DE LA MATIÈRE ─────────────
 *
 * L'entête de `backend/src/consolidation/index.ts` (décision 3) :
 *
 *   > Un domaine non lisible rend `null`, jamais zéro. […] Rendre `0` serait
 *   > dire « aucun risque dans ce groupe », ce qui est faux, et le dire dans un
 *   > outil qui sert de preuve en audit.
 *
 * L'essai §2 ci-dessous ouvre **le même écran deux fois** — une fois avec le
 * domaine `risques` ouvert, une fois sans — et exige que la même cellule porte
 * un **nombre** dans un cas et **aucun chiffre** dans l'autre. La moitié
 * « ouvert » n'est pas décorative : sans elle, un écran qui n'afficherait
 * *jamais* de chiffre passerait au vert. C'est la leçon de **Q-108** et
 * **Q-116** — *un essai vert qui n'a rien eu à mesurer rend le même verdict
 * qu'un essai vert qui a tout mesuré*.
 *
 * ── COMMENT LE `null` EST OBTENU : PAR LE SERVEUR, JAMAIS PAR LA PAGE ───────
 *
 * ⚠️ **Le constat Q-116 dit exactement ce qu'il ne faut pas faire** : un essai y
 * substituait les droits **dans le navigateur** et interrogeait un serveur qui,
 * lui, avait tous les domaines — il mesurait une substitution, pas une barrière.
 *
 * Ici, les droits sont ceux d'une **session serveur** (`SessionDuBanc`, un
 * résolveur qui sait aussi authentifier, la forme du lot L3). Fermer le domaine
 * `risques` fait donc réellement rendre `risques: null` à
 * `construireConsolidation`, et l'écran reçoit le contrat, pas un décor.
 * Aucune route n'est interceptée dans ce fichier : `page.route` n'y figure pas.
 *
 * ── CE QUI EST MESURÉ, ET COMMENT ──────────────────────────────────────────
 *
 *  §0  matière — les deux filiales portent des données DIFFÉRENTES ;
 *  §1  deux filiales rendent deux lignes distinctes, et le total est leur somme ;
 *  §2  un domaine fermé affiche « — » et AUCUN chiffre, le même écran ouvert
 *      affichant un nombre ;
 *  §3  une session d'une seule filiale ne voit qu'une ligne ;
 *  §4  les coordonnées de la filiale active s'affichent (constat Q-160), et une
 *      coordonnée absente ne laisse pas de libellé orphelin ;
 *  §5  le taux est calculé DANS LE NAVIGATEUR, avec le catalogue : AirCyber se
 *      score Oui/Non sans CMMI, l'ANSSI en maturité (décision 4) ;
 *  §6  une raison sociale hostile se lit sans s'exécuter, et l'écran ne pose
 *      aucun gestionnaire en ligne (la CSP du vhost les rend inertes).
 *
 * Tout est mesuré dans un Chromium réel, sur le DOM rendu — jamais par une
 * expression régulière sur les sources.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';
import {
  attendreApplication,
  attendreQuiescence,
  lancerNavigateur,
  ouvrirPage,
  servirApplication,
} from '../aide/navigateur.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

/** Même raison qu'au `droits.test.mjs` : plusieurs Chromium sur peu de cœurs. */
const DELAI = 60_000;

/* =====================================================================
 *  Les droits — les quatorze domaines de `backend/src/api/droits.ts`
 * ===================================================================== */

const TOUS_LES_DOMAINES = Object.freeze([
  'pilotage', 'conformite', 'risques', 'actifs', 'actions', 'incidents',
  'continuite', 'documents', 'audits', 'tiers', 'rgpd', 'personnel',
  'administration', 'journal',
]);

/** Direction : elle voit tout, en lecture — le profil que cet écran sert. */
const TOUT_OUVERT = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/**
 * Le même profil, **sans le domaine `risques`**.
 *
 * Ce n'est pas un cas de laboratoire : le `PLAN_SERVEUR` §3.2 donne au profil
 * *DPO* `rgpd`, `incidents` et `documents`, et pas `risques`. Sa consolidation
 * doit dire « je ne vous le communique pas », et surtout pas « zéro risque ».
 */
const SANS_RISQUES = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'risques'),
  export: true,
});

/* =====================================================================
 *  La session du banc — un résolveur qui sait aussi authentifier
 * ===================================================================== */

/**
 * Forme exacte du lot L3 : une même session serveur répond aux deux questions —
 * *quel périmètre ?* et *qui parle ?*. `greffonApi` l'accepte telle quelle
 * (`estAuthentificateur`).
 *
 * ⚠️ Le contrat est respecté à la lettre : **`resoudre()` ne prend aucun
 * argument** et `authentifier()` ne lit rien de la requête. Un résolveur de banc
 * qui lirait une entête réintroduirait ce que le contrôle S2 interdit, et le
 * banc donnerait le mauvais exemple.
 */
class SessionDuBanc {
  constructor(perimetreInitial, droitsInitiaux) {
    this.provisoire = false;
    this._perimetre = Object.freeze({ ...perimetreInitial });
    this._droits = Object.freeze({ ...droitsInitiaux });
  }

  poser(perimetreNouveau, droitsNouveaux) {
    if (perimetreNouveau !== undefined) this._perimetre = Object.freeze({ ...perimetreNouveau });
    if (droitsNouveaux !== undefined) this._droits = Object.freeze({ ...droitsNouveaux });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return {
      perimetre: this._perimetre,
      droits: this._droits,
      identite: { login: 'direction.groupe', nomAffichage: 'Direction Groupe' },
    };
  }

  decrire() {
    return 'session du banc d’essai (test/navigateur/groupe.test.mjs)';
  }
}

const PERIMETRE_GROUPE = Object.freeze({
  utilisateurId: 'direction.groupe',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: false,
});

const PERIMETRE_UNE_FILIALE = Object.freeze({
  utilisateurId: 'rssi.toulouse',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: false,
});

/* =====================================================================
 *  Ce que le semis ajoute, et pourquoi chaque ligne y est
 * ===================================================================== */

/**
 * Ville de la filiale A — **une charge hostile, littéralement en base**.
 *
 * Une raison sociale, une ville, un site web viennent de quelqu'un. L'auditeur
 * de la porte S3 a forgé un identifiant contenant du JSON et des sauts de ligne,
 * et il est arrivé tel quel dans le journal (`CONVENTIONS.md` §29.5). Cet écran
 * affichera donc un jour une valeur de ce genre : on la lui donne ici, et on
 * exige qu'elle se **lise** sans s'**exécuter**.
 */
const VILLE_HOSTILE = 'Toulouse <img src=x onerror="window.__xssGroupe = 1">';

/** Le nombre d'exigences du référentiel ANSSI dans le catalogue embarqué. */
const ANSSI_EXIGENCES = 42;
/** Idem pour AirCyber — questionnaire Oui/Non, `scoring: "conformite"`. */
const AIRCYBER_EXIGENCES = 234;

let base;
let applicatif;
let session;
let serveur;
let application;
let navigateur;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);

  // ── L'ASYMÉTRIE, ET LE MOTIF DE CHAQUE LIGNE ──────────────────────────
  //
  // Le semis commun donne aux deux filiales **exactement les mêmes comptes**.
  // Sans asymétrie, « A et B rendent deux colonnes différentes » ne se
  // distingue pas de « l'écran rend deux fois la même colonne » — et l'essai
  // serait vert dans les deux cas.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-groupe', FILIALE_A, [FILIALE_A]),
    async (c) => {
      // Deux risques cotés : `expositionResiduelle` a alors de la matière, et
      // « — » y voudra dire quelque chose.
      await c.query(
        `insert into risques (id, filiale_id, nom, niveau, score_residuel) values
             ('RISK-CRIT-A',  $1, 'Arrêt de production', 'critique', 12),
             ('RISK-CRIT2-A', $1, 'Compromission ERP',   'critique',  9)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into actifs (id, filiale_id, nom, criticite)
              values ('ACTIF3-A', $1, 'Automate de ligne', 'critique')`,
        [FILIALE_A],
      );
      // Échéance dépassée ET non terminée : le seul cas « en retard ».
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, echeance)
              values ('ACT-RETARD-A', $1, 'Chiffrer les portables', 'à faire', current_date - 5)`,
        [FILIALE_A],
      );
      // Échéance dépassée mais TERMINÉE : le contre-exemple. Sans lui, « en
      // retard = 1 » serait aussi vrai d'un code qui ignore le statut.
      await c.query(
        `insert into actions (id, filiale_id, titre, statut, echeance)
              values ('ACT-FINIE-A', $1, 'Inventaire', 'terminée', current_date - 5)`,
        [FILIALE_A],
      );
      await c.query(
        `insert into documents (id, filiale_id, titre, statut, date_revue)
              values ('DOC-REVUE-A', $1, 'Procédure de sauvegarde', 'à réviser', current_date - 30)`,
        [FILIALE_A],
      );

      // ── Conformité : des identifiants de référentiel DU CATALOGUE ────────
      //
      // Le semis commun pose `ref_id = 'anssi'`, qui n'est PAS dans le
      // catalogue embarqué (« anssi-hygiene »). On le garde — il exerce le
      // chemin « hors catalogue » — et on y ajoute du réel.
      //
      // Cinq conformes cotés 4, deux non conformes, une non applicable :
      //   applicables = 42 − 1 = 41   (le CATALOGUE, pas les 8 lignes en base)
      //   conformes   = 5
      // Si le dénominateur était le nombre d'évaluations trouvées, le taux
      // vaudrait 5/7 = 71 % au lieu de 12 %. Les deux définitions se
      // distinguent donc d'un seul coup d'œil.
      for (let i = 1; i <= 5; i += 1) {
        await c.query(
          `insert into evaluations (id, filiale_id, ref_id, code, statut, maturite)
                values ($2, $1, 'anssi-hygiene', $3, 'conforme', 4)`,
          [FILIALE_A, `EVAL-AN-C${String(i)}-A`, `AN-C${String(i)}`],
        );
      }
      for (let i = 1; i <= 2; i += 1) {
        await c.query(
          `insert into evaluations (id, filiale_id, ref_id, code, statut)
                values ($2, $1, 'anssi-hygiene', $3, 'non conforme')`,
          [FILIALE_A, `EVAL-AN-N${String(i)}-A`, `AN-N${String(i)}`],
        );
      }
      await c.query(
        `insert into evaluations (id, filiale_id, ref_id, code, statut)
              values ('EVAL-AN-NA-A', $1, 'anssi-hygiene', 'AN-NA', 'non applicable')`,
        [FILIALE_A],
      );
      // ── AirCyber, avec une MATURITÉ délibérément renseignée ──────────────
      //
      // Le référentiel se score `"conformite"` : il n'a pas de CMMI, et sa
      // maturité doit être **ignorée** par la moyenne (décision 4). Trois
      // lignes cotées 5 : si elles entraient dans la moyenne de la filiale A,
      // celle-ci passerait de 0,5 à 0,1. L'écart est visible à l'œil nu.
      for (let i = 1; i <= 3; i += 1) {
        await c.query(
          `insert into evaluations (id, filiale_id, ref_id, code, statut, maturite)
                values ($2, $1, 'aircyber', $3, 'conforme', 5)`,
          [FILIALE_A, `EVAL-AC${String(i)}-A`, `AC-${String(i)}`],
        );
      }
    },
    { annuler: false },
  );

  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-groupe', FILIALE_B, [FILIALE_B]),
    async (c) => {
      await c.query(
        `insert into risques (id, filiale_id, nom, niveau, score_residuel)
              values ('RISK-FAIBLE-B', $1, 'Panne réseau', 'faible', 3)`,
        [FILIALE_B],
      );
      // Un incident à déclarer : `aDeclarer` a de la matière, et ce n'est pas
      // le même compte que `total`.
      await c.query(
        `insert into incidents (id, filiale_id, titre, gravite, declaration_anssi)
              values ('INC-DECL-B', $1, 'Exfiltration suspectée', 'critique', 'à déclarer')`,
        [FILIALE_B],
      );
      for (let i = 1; i <= 2; i += 1) {
        await c.query(
          `insert into evaluations (id, filiale_id, ref_id, code, statut)
                values ($2, $1, 'anssi-hygiene', $3, 'conforme')`,
          [FILIALE_B, `EVAL-AN-C${String(i)}-B`, `AN-C${String(i)}`],
        );
      }
    },
    { annuler: false },
  );

  // ── Les coordonnées de la filiale active (constat Q-160) ────────────────
  //
  // ⚠️ `telephone` est laissé NUL **à dessein** : c'est la moitié qui manque à
  // l'essai « les coordonnées s'affichent ». Sans une coordonnée absente, rien
  // ne distingue un écran qui les rend toutes d'un écran qui rend un libellé
  // « Téléphone » suivi de rien — ce qui, sur un document d'audit, ressemble à
  // une adresse tronquée.
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur-groupe', FILIALE_A, [FILIALE_A, FILIALE_B], true),
    async (c) => {
      await c.query(
        `update filiales set nom_court = 'Essai TLS', adresse = '12 rue de la Découverte',
                             code_postal = '31400', ville = $2, email = 'contact@essai.invalid',
                             site_web = 'https://essai.invalid', telephone = null
           where id = $1`,
        [FILIALE_A, VILLE_HOSTILE],
      );
    },
    { annuler: false },
  );

  session = new SessionDuBanc(PERIMETRE_GROUPE, TOUT_OUVERT);
  serveur = await monterGreffon(base, PERIMETRE_GROUPE, { resolveur: session });
  application = await servirApplication(serveur);
  navigateur = await lancerNavigateur();
});

after(async () => {
  await navigateur?.close().catch(() => {});
  await application?.fermer();
  await serveur?.fermer();
  await applicatif?.end?.().catch(() => {});
  await base?.fermer();
});

/* =====================================================================
 *  Outillage — on lit le DOM RENDU, jamais les sources
 * ===================================================================== */

/**
 * Ouvre l'application, va sur `/groupe`, et attend que le tableau soit rendu.
 *
 * `perimetreVoulu` / `droitsVoulus` sont posés sur la session **serveur** avant
 * l'ouverture : c'est le serveur qui décidera, pas la page.
 */
async function ouvrirGroupe(perimetreVoulu, droitsVoulus) {
  session.poser(perimetreVoulu, droitsVoulus);
  const page = await ouvrirPage(navigateur);
  await page.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(
    await attendreApplication(page.page, { delai: DELAI }),
    'chargee',
    'L’application doit démarrer.',
  );
  await attendreQuiescence(page.page, { delai: DELAI });
  await page.page.evaluate(() => { window.location.hash = '#/groupe'; });
  // On attend le TABLEAU, ou l'écran d'erreur : sans cette seconde branche, un
  // refus du serveur ferait expirer l'attente au lieu de dire ce qu'il s'est
  // passé.
  await page.page.waitForSelector('#groupeCorps .grp-table, #groupeCorps .grp-erreur', {
    timeout: DELAI,
  });
  return page;
}

/** Texte d'une cellule du tableau comparatif, tel qu'un lecteur le voit. */
function cellule(page, filialeId, cel) {
  return page.evaluate(
    ([f, c]) => {
      const ligne = document.querySelector(`tr[data-filiale="${f}"]`);
      if (ligne === null) return null;
      const cellule2 = ligne.querySelector(`[data-cel="${c}"]`);
      return cellule2 === null ? null : cellule2.textContent.replace(/\s+/gu, ' ').trim();
    },
    [filialeId, cel],
  );
}

/** Les identifiants de filiale réellement rendus, dans l'ordre du tableau. */
function lignesRendues(page) {
  return page.evaluate(() =>
    Array.prototype.map.call(
      document.querySelectorAll('#groupeCorps tbody tr[data-filiale]'),
      (tr) => tr.getAttribute('data-filiale'),
    ));
}

/** Le premier entier d'un texte de cellule, ou `null` s'il n'y en a aucun. */
function entier(texte) {
  if (texte === null) return null;
  const trouve = /-?\d+/u.exec(texte);
  return trouve === null ? null : Number(trouve[0]);
}

/* =====================================================================
 *  §0 — Contrôle de matière : de quoi cet essai dispose-t-il ?
 * ===================================================================== */

describe('§0 — le banc a de quoi mesurer', () => {
  test('les deux filiales portent des comptes DIFFÉRENTS, sinon rien ne se distingue', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      const rendues = await lignesRendues(page.page);
      assert.deepEqual(
        [...rendues].sort(),
        [FILIALE_A, FILIALE_B].sort(),
        `Le périmètre Groupe doit rendre exactement deux lignes. Vu : ${JSON.stringify(rendues)}`,
      );

      // Au moins quatre domaines où A et B ne disent PAS la même chose : sans
      // cela, l'essai §1 serait satisfait par un écran qui recopie une colonne.
      const differents = [];
      for (const cel of ['risques', 'actifs', 'actions', 'incidents', 'documents', 'exposition']) {
        const a = await cellule(page.page, FILIALE_A, cel);
        const b = await cellule(page.page, FILIALE_B, cel);
        assert.notEqual(a, null, `La cellule « ${cel} » de la filiale A n’est pas rendue.`);
        assert.notEqual(b, null, `La cellule « ${cel} » de la filiale B n’est pas rendue.`);
        if (a !== b) differents.push(cel);
      }
      assert.ok(
        differents.length >= 4,
        `Le semis ne distingue les deux filiales que sur ${String(differents.length)} colonne(s) ` +
          `(${JSON.stringify(differents)}). Un essai « deux colonnes différentes » n’aurait ` +
          'alors presque rien à mesurer.',
      );

      assert.deepEqual(page.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §1 — Deux filiales, deux lignes, et le total est leur SOMME
 * ===================================================================== */

describe('§1 — la consolidation additionne les filiales, elle ne les moyenne pas', () => {
  test('chaque colonne de compte du total vaut la somme des deux filiales', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      // ⚠️ Uniquement des COMPTES. Le taux de conformité est un rapport : la
      // somme de deux pourcentages n'a aucun sens, et l'exiger enseignerait
      // une fausse règle à qui lira cet essai.
      const comptes = [
        'risques', 'exposition', 'actions', 'actions_retard',
        'incidents', 'incidents_declarer', 'documents', 'documents_revue',
        'actifs', 'audits',
      ];

      let observes = 0;
      for (const cel of comptes) {
        const a = entier(await cellule(page.page, FILIALE_A, cel));
        const b = entier(await cellule(page.page, FILIALE_B, cel));
        const t = entier(await cellule(page.page, '__total__', cel));
        assert.notEqual(t, null, `Le total ne rend rien pour « ${cel} ».`);
        assert.equal(
          t, (a ?? 0) + (b ?? 0),
          `Total Groupe faux sur « ${cel} » : ${String(t)} alors que ` +
            `${String(a)} + ${String(b)} = ${String((a ?? 0) + (b ?? 0))}.`,
        );
        if ((a ?? 0) + (b ?? 0) > 0) observes += 1;
      }
      // Un total de zéros partout vaudrait « somme exacte » sans rien prouver.
      assert.ok(
        observes >= 6,
        `Seules ${String(observes)} colonnes portent une somme non nulle : l’égalité ` +
          'mesurée ne prouverait presque rien.',
      );

      // Les chiffres attendus, écrits en clair — ils viennent du semis ci-dessus.
      assert.equal(entier(await cellule(page.page, FILIALE_A, 'risques')), 4);
      assert.equal(entier(await cellule(page.page, FILIALE_B, 'risques')), 3);
      assert.equal(entier(await cellule(page.page, '__total__', 'risques')), 7);
      assert.equal(entier(await cellule(page.page, FILIALE_A, 'exposition')), 21);
      assert.equal(entier(await cellule(page.page, FILIALE_B, 'exposition')), 3);
      assert.equal(entier(await cellule(page.page, FILIALE_A, 'actions_retard')), 1);
      assert.equal(entier(await cellule(page.page, FILIALE_B, 'actions_retard')), 0);
      assert.equal(entier(await cellule(page.page, FILIALE_B, 'incidents_declarer')), 1);

      assert.deepEqual(page.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await page.fermer();
    }
  });

  test('les documents de PORTÉE GROUPE sont comptés à part, jamais dans une filiale', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      // `DOC-G` (« PSSI du groupe ») est à `filiale_id` nul. Le compter dans
      // chaque filiale le compterait autant de fois qu'il y a de filiales.
      const portee = await page.page.evaluate(() => {
        const el = document.querySelector('[data-cel="pg_documents"]');
        return el === null ? null : el.textContent.trim();
      });
      assert.equal(portee, '1', 'La PSSI du groupe doit être comptée une fois, hors filiale.');

      assert.equal(entier(await cellule(page.page, FILIALE_A, 'documents')), 2);
      assert.equal(entier(await cellule(page.page, FILIALE_B, 'documents')), 1);
      assert.equal(
        entier(await cellule(page.page, '__total__', 'documents')), 3,
        'Le total des documents ne doit PAS inclure ceux de portée Groupe.',
      );

      assert.deepEqual(page.erreursInattendues(), []);
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §2 — L'ESSAI LE PLUS IMPORTANT DU LOT
 *
 *  Un domaine fermé affiche « — » et AUCUN chiffre ; le même écran, domaine
 *  ouvert, affiche un nombre. Sans les deux moitiés, on mesure un rendu, pas
 *  une distinction.
 * ===================================================================== */

describe('§2 — « — » veut dire « non communiqué », et jamais « zéro »', () => {
  test('la même cellule porte un NOMBRE domaine ouvert, et AUCUN CHIFFRE domaine fermé', async () => {
    /* ── Moitié 1 : le domaine est ouvert. C'est la MATIÈRE. ──────────────
     * Sans elle, un écran qui n'afficherait jamais de chiffre — parce qu'il
     * est cassé, parce que la route rend 403, parce que le tableau est vide —
     * passerait cet essai au vert. C'est exactement Q-108 : l'essai comptait
     * `0` avant et `0` après, et concluait au vert.
     */
    const ouvert = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    let texteOuvert;
    let expositionOuverte;
    try {
      texteOuvert = await cellule(ouvert.page, FILIALE_A, 'risques');
      expositionOuverte = await cellule(ouvert.page, FILIALE_A, 'exposition');
      assert.match(
        texteOuvert ?? '', /\d/u,
        `Domaine « risques » OUVERT : la cellule doit porter un nombre. Vue : « ${String(texteOuvert)} ».`,
      );
      assert.equal(entier(texteOuvert), 4);
      assert.match(expositionOuverte ?? '', /\d/u);
      assert.deepEqual(ouvert.erreursInattendues(), []);
    } finally {
      await ouvert.fermer();
    }

    /* ── Moitié 2 : le même écran, le domaine fermé PAR LE SERVEUR ────────
     * `SANS_RISQUES` est posé sur la session serveur : `construireConsolidation`
     * rend réellement `risques: null`. Rien n'est intercepté côté navigateur —
     * c'est la différence entre cet essai et celui que le constat Q-116
     * condamne.
     */
    const ferme = await ouvrirGroupe(PERIMETRE_GROUPE, SANS_RISQUES);
    try {
      // D'abord : le serveur a-t-il bien fermé le domaine ? Sans cette
      // vérification, un « — » pourrait venir d'un écran cassé.
      const contrat = await ferme.page.evaluate(async () => {
        const r = await fetch('api/consolidation', { credentials: 'same-origin', cache: 'no-store' });
        const c = await r.json();
        const a = c.filiales.find((f) => f.active === true) ?? c.filiales[0];
        return {
          statut: r.status,
          risquesEstNul: a.indicateurs.risques === null,
          actionsEstNul: a.indicateurs.actions === null,
        };
      });
      assert.equal(contrat.statut, 200, 'La route doit répondre : le domaine « pilotage » est ouvert.');
      assert.equal(
        contrat.risquesEstNul, true,
        'Le SERVEUR doit rendre `risques: null` : sans cela, cet essai mesurerait la page, pas le contrat.',
      );
      assert.equal(
        contrat.actionsEstNul, false,
        'Le domaine « actions » reste ouvert : c’est le témoin qui prouve que seule la ' +
          'fermeture de « risques » agit.',
      );

      for (const cel of ['risques', 'exposition']) {
        const texte = await cellule(ferme.page, FILIALE_A, cel);
        assert.notEqual(texte, null, `La cellule « ${cel} » doit exister même domaine fermé.`);
        assert.equal(
          /\d/u.test(texte), false,
          `⚠️ Domaine « risques » FERMÉ : la cellule « ${cel} » porte un chiffre (« ${texte} »). ` +
            'Un zéro y voudrait dire « aucun risque dans ce groupe », ce qui est faux — c’est ' +
            'la décision 3 de `src/consolidation/index.ts`, et elle n’est pas négociable dans ' +
            'un outil qui sert de preuve en audit.',
        );
        assert.match(texte, /—/u, `La cellule « ${cel} » doit porter un tiret explicite.`);
      }

      // Le témoin : « actions », resté ouvert, porte toujours un nombre sur le
      // MÊME écran. Sans lui, un écran entièrement en tirets serait vert.
      const temoin = await cellule(ferme.page, FILIALE_A, 'actions');
      assert.match(
        temoin ?? '', /\d/u,
        `Sur le même écran, la colonne « actions » doit rester chiffrée (vue : « ${String(temoin)} »). ` +
          'Sinon ce n’est pas une distinction, c’est un écran vide.',
      );

      // Le total aussi : sommer des `null` ne les rend pas lisibles.
      const totalRisques = await cellule(ferme.page, '__total__', 'risques');
      assert.equal(
        /\d/u.test(totalRisques), false,
        `Le TOTAL porte un chiffre (« ${totalRisques} ») alors que le domaine est fermé : ` +
          'un domaine illisible ne devient pas lisible en le sommant.',
      );

      assert.deepEqual(ferme.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await ferme.fermer();
    }
  });

  test('le panneau de répartitions dit « non communiqué », et ne montre aucun compte', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, SANS_RISQUES);
    try {
      const carte = await page.page.evaluate(() => {
        const el = document.querySelector('[data-rep="Risques par niveau"]');
        return el === null ? null : el.textContent.replace(/\s+/gu, ' ').trim();
      });
      assert.notEqual(carte, null, 'La carte « Risques par niveau » doit rester à l’écran.');
      assert.equal(
        /\d/u.test(carte), false,
        `La carte des risques porte un chiffre alors que le domaine est fermé : « ${carte} ».`,
      );
      assert.match(carte, /non communiqué/iu, 'Elle doit DIRE pourquoi elle est vide.');

      // Témoin sur le même écran : une carte dont le domaine est ouvert.
      const temoin = await page.page.evaluate(() => {
        const el = document.querySelector('[data-rep="Actions par statut"]');
        return el === null ? null : el.textContent.replace(/\s+/gu, ' ').trim();
      });
      assert.match(temoin ?? '', /\d/u, 'La carte « Actions par statut » doit, elle, porter des comptes.');

      assert.deepEqual(page.erreursInattendues(), []);
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §3 — Une session d'UNE seule filiale ne voit qu'une ligne
 * ===================================================================== */

describe('§3 — l’écran ne montre que ce que le périmètre ouvre', () => {
  test('un périmètre d’une filiale rend une seule ligne, et rien de la voisine', async () => {
    const page = await ouvrirGroupe(PERIMETRE_UNE_FILIALE, TOUT_OUVERT);
    try {
      const rendues = await lignesRendues(page.page);
      assert.deepEqual(
        rendues, [FILIALE_A],
        `Une session d’une seule filiale ne doit voir qu’elle. Vu : ${JSON.stringify(rendues)}`,
      );

      // Rien de la voisine, nulle part dans la page — ni son identifiant, ni sa
      // raison sociale, ni son code. Un tableau juste et un panneau bavard
      // feraient tout de même fuir.
      const texte = await page.page.evaluate(() => document.body.textContent);
      for (const trace of [FILIALE_B, 'Essai Allemagne', 'ZZESSB']) {
        assert.equal(
          texte.includes(trace), false,
          `La trace « ${trace} » de la filiale voisine apparaît dans une page cadrée sur une ` +
            'seule filiale.',
        );
      }

      // Le total doit alors valoir la filiale elle-même, et non zéro.
      assert.equal(
        entier(await cellule(page.page, '__total__', 'risques')),
        entier(await cellule(page.page, FILIALE_A, 'risques')),
      );
      // Et le bandeau doit annoncer un périmètre PARTIEL, pas Groupe.
      const bandeau = await page.page.evaluate(() => {
        const el = document.getElementById('groupePerimetre');
        return el === null ? null : el.textContent.replace(/\s+/gu, ' ').trim();
      });
      assert.match(bandeau ?? '', /partiel/iu, `Bandeau vu : « ${String(bandeau)} ».`);
      assert.match(bandeau ?? '', /1 filiale/u);

      assert.deepEqual(page.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §3 bis — Un écran qui n'a rien pu lire le DIT
 * ===================================================================== */

describe('§3 bis — refusé n’est pas vide', () => {
  test('sans le domaine « pilotage », l’écran explique le refus au lieu d’afficher un groupe vide', async () => {
    /* Un tableau vide se lirait « le groupe n'a rien » — le pire mensonge que
     * cet écran puisse faire, et le pendant exact de ce que `journal.js` évite
     * (« un écran de journal qui affiche rien quand il n'a rien pu lire »).
     * Le refus vient du SERVEUR : `/api/consolidation` déclare
     * `{ action: 'lire', domaine: 'pilotage' }`, et le crochet `onRequest`
     * refuse avant d'atteindre la route. */
    const sansPilotage = Object.freeze({
      niveau: 'administration',
      domaines: TOUS_LES_DOMAINES.filter((d) => d !== 'pilotage'),
      export: true,
    });
    session.poser(PERIMETRE_GROUPE, sansPilotage);
    const page = await ouvrirPage(navigateur);
    try {
      await page.page.goto(`${application.url}/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(await attendreApplication(page.page, { delai: DELAI }), 'chargee');
      await page.page.evaluate(() => { window.location.hash = '#/groupe'; });
      await page.page.waitForSelector('#groupeCorps .grp-erreur', { timeout: DELAI });

      // Le serveur refuse bien, et par le DROIT — pas par une route absente.
      const refus = await page.page.evaluate(async () => {
        const r = await fetch('api/consolidation', { credentials: 'same-origin', cache: 'no-store' });
        let code = null;
        try { code = (await r.json()).erreur; } catch { /* corps non JSON */ }
        return { statut: r.status, code };
      });
      assert.equal(refus.statut, 403, 'Le refus doit être un refus de DROIT.');
      assert.equal(refus.code, 'droit_insuffisant');

      const texte = await page.page.evaluate(() => {
        const el = document.querySelector('#groupeCorps');
        return el === null ? '' : el.textContent.replace(/\s+/gu, ' ').trim();
      });
      assert.match(texte, /n’a pas accès|n'a pas accès/u, `Vu : « ${texte.slice(0, 200)} ».`);
      assert.match(texte, /pilotage/u, 'Le message doit nommer le domaine manquant.');

      // Et surtout : AUCUN tableau, aucun total, aucun zéro rassurant.
      const tableau = await page.page.evaluate(() =>
        document.querySelectorAll('#groupeCorps .grp-table').length);
      assert.equal(tableau, 0, 'Aucun tableau ne doit être rendu : il ne dirait rien de vrai.');

      // Les exceptions de script, elles, ne s'acceptent jamais — même sur un
      // refus volontaire. Le 403 journalisé par le navigateur est admis.
      assert.deepEqual(page.erreursScript, [], 'CLAUDE.md §5 : aucune exception de script.');
      assert.deepEqual(page.erreursInattendues(['403', 'Failed to load resource']), []);
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §4 — Les coordonnées de la filiale active (constat Q-160)
 * ===================================================================== */

describe('§4 — les coordonnées s’affichent, et une absence ne laisse pas de libellé orphelin', () => {
  test('adresse, ville, courriel et site web sont rendus ; le téléphone absent ne laisse rien', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      const coord = await page.page.evaluate(() => {
        const sortie = {};
        document.querySelectorAll('.grp-coord-l[data-coord]').forEach((el) => {
          const dd = el.querySelector('dd');
          sortie[el.getAttribute('data-coord')] = dd === null ? '' : dd.textContent.trim();
        });
        return sortie;
      });

      assert.equal(coord['Adresse'], '12 rue de la Découverte');
      assert.equal(coord['Ville'], `31400 ${'Toulouse <img src=x onerror="window.__xssGroupe = 1">'}`);
      assert.equal(coord['Courriel'], 'contact@essai.invalid');
      assert.equal(coord['Site web'], 'https://essai.invalid');
      assert.equal(coord['Nom court'], 'Essai TLS');
      assert.equal(coord['Pays'], 'FR');

      // ⚠️ LA MOITIÉ QUI COMPTE : `telephone` est nul en base. Ni le libellé ni
      // la ligne ne doivent subsister — un « Téléphone » suivi de rien, sur un
      // entête de rapport d'audit, se lit comme une donnée tronquée.
      assert.equal(
        Object.prototype.hasOwnProperty.call(coord, 'Téléphone'), false,
        `Un libellé orphelin subsiste pour une coordonnée absente : ${JSON.stringify(coord)}`,
      );
      const texteCarte = await page.page.evaluate(() => {
        const dl = document.querySelector('.grp-coord');
        return dl === null ? '' : dl.textContent;
      });
      assert.equal(
        /Téléphone/u.test(texteCarte), false,
        'Le mot « Téléphone » ne doit pas figurer : la donnée est absente.',
      );

      // Le site web doit être cliquable — et seulement parce qu'il porte `https:`.
      const href = await page.page.evaluate(() => {
        const a = document.querySelector('.grp-coord-l[data-coord="Site web"] a');
        return a === null ? null : a.getAttribute('href');
      });
      assert.equal(href, 'https://essai.invalid');

      assert.deepEqual(page.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §5 — Le taux est calculé DANS LE NAVIGATEUR, avec le catalogue
 * ===================================================================== */

describe('§5 — le serveur rend des comptes ; le catalogue décide de ce qu’ils valent', () => {
  test('le dénominateur est le CATALOGUE, pas le nombre de lignes en base', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      // Garde-fou : si le catalogue embarqué changeait de taille, les chiffres
      // ci-dessous seraient faux — et l'essai doit le DIRE, pas échouer sur une
      // égalité incompréhensible.
      const tailles = await page.page.evaluate(() => ({
        anssi: Referentiels.countExigences(Referentiels.get('anssi-hygiene')),
        aircyber: Referentiels.countExigences(Referentiels.get('aircyber')),
        scoringAircyber: Referentiels.get('aircyber').scoring,
      }));
      assert.equal(
        tailles.anssi, ANSSI_EXIGENCES,
        'Le catalogue ANSSI a changé de taille : les attendus de cet essai sont à recalculer.',
      );
      assert.equal(tailles.aircyber, AIRCYBER_EXIGENCES);
      assert.equal(tailles.scoringAircyber, 'conformite');

      // Ligne du référentiel ANSSI, au niveau Groupe :
      //   A : 5 conformes, 2 non conformes, 1 non applicable → 42 − 1 = 41 applicables
      //   B : 2 conformes, aucune NA                          → 42 applicables
      //   applicables = 83, conformes = 7 → 8 %
      // Si le dénominateur était le nombre d'évaluations trouvées (10), le taux
      // vaudrait 70 %. Les deux définitions ne se confondent pas.
      const ligneAnssi = await page.page.evaluate(() => {
        const tr = document.querySelector('tr[data-ref="anssi-hygiene"]');
        if (tr === null) return null;
        const lire = (c) => {
          const el = tr.querySelector(`[data-cel="${c}"]`);
          return el === null ? null : el.textContent.replace(/\s+/gu, ' ').trim();
        };
        return { evaluees: lire('evaluees'), applicables: lire('applicables'),
                 conformes: lire('conformes'), taux: lire('taux'), maturite: lire('maturite') };
      });
      assert.notEqual(ligneAnssi, null, 'La ligne « anssi-hygiene » doit figurer au détail.');
      assert.equal(ligneAnssi.evaluees, '10', 'Dix évaluations en base pour l’ANSSI (8 + 2).');
      assert.equal(
        ligneAnssi.applicables, '83',
        'Le dénominateur doit être le CATALOGUE par filiale (42 − 1) + 42 = 83, jamais le ' +
          'nombre de lignes trouvées en base.',
      );
      assert.equal(ligneAnssi.conformes, '7');
      assert.equal(entier(ligneAnssi.taux), 8);

      assert.deepEqual(page.erreursInattendues(), []);
    } finally {
      await page.fermer();
    }
  });

  test('AirCyber se score Oui/Non SANS maturité, et n’entre pas dans la moyenne CMMI', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      const ligneAc = await page.page.evaluate(() => {
        const tr = document.querySelector('tr[data-ref="aircyber"]');
        if (tr === null) return null;
        const lire = (c) => {
          const el = tr.querySelector(`[data-cel="${c}"]`);
          return el === null ? null : el.textContent.replace(/\s+/gu, ' ').trim();
        };
        return { cotation: tr.children[1].textContent.trim(),
                 applicables: lire('applicables'), maturite: lire('maturite') };
      });
      assert.notEqual(ligneAc, null, 'La ligne « aircyber » doit figurer au détail.');
      assert.equal(ligneAc.cotation, 'Oui / Non', 'AirCyber se répond Oui/Non — pas en CMMI.');
      assert.equal(ligneAc.applicables, String(AIRCYBER_EXIGENCES));
      assert.match(
        ligneAc.maturite, /—/u,
        'AirCyber ne doit porter AUCUNE maturité, même si la base en contient une.',
      );

      /* ── LE DISCRIMINANT ────────────────────────────────────────────────
       * La filiale A porte trois questions AirCyber cotées 5 en base, et cinq
       * mesures ANSSI cotées 4.
       *   correct  : 20 / 42 = 0,476 → « 0.5 »
       *   si AirCyber était compté : (20 + 15) / (42 + 234) = 0,127 → « 0.1 »
       * Les deux valeurs se distinguent à l'œil nu — c'est tout l'objet de la
       * décision 4 de `src/consolidation/index.ts`.
       */
      const maturiteA = await cellule(page.page, FILIALE_A, 'maturite');
      assert.equal(
        maturiteA, '0.5',
        `Moyenne CMMI de la filiale A : « ${String(maturiteA)} ». « 0.1 » signifierait que la ` +
          'maturité d’AirCyber a été comptée — or ce référentiel n’en a pas.',
      );

      assert.deepEqual(page.erreursInattendues(), []);
    } finally {
      await page.fermer();
    }
  });

  test('le taux du GROUPE se cumule filiale par filiale, jamais sur un catalogue unique', async () => {
    /* ── LE PIÈGE QUE CET ESSAI GARDE ────────────────────────────────────
     *
     * Le serveur, quand il cumule, **fusionne `parReferentiel` par `refId`** :
     * les décomptes de statut de vingt filiales se retrouvent sur une seule
     * entrée « anssi-hygiene ». Le dénominateur, lui, vient du catalogue et
     * vaut 42 exigences **par filiale**. Calculer le taux du groupe sur
     * `total.conformite` diviserait donc la somme des conformes de vingt
     * filiales par UN SEUL catalogue — et rendrait, à la limite, un taux
     * supérieur à 100 %.
     *
     * Les deux calculs se séparent ici :
     *   correct   : (41+1+234) + (42+1) = 319 applicables, 10 conformes → 3 %
     *               maturité 20 / (42 + 43) = 0,235 → « 0.2 »
     *   fusionné  : 41 + 2 + 234 = 277 applicables, 10 conformes → 4 %
     *               maturité 20 / 43 = 0,465 → « 0.5 »
     *
     * Cet essai a été écrit APRÈS une mutation : le premier jet du fichier
     * n'assertait rien sur la ligne de total, et la mutation « calculer le
     * total sur `total.conformite` » passait au vert. C'est la règle du
     * dépôt — *un correctif accepté n'est pas un correctif sûr, la seule
     * preuve est la mutation*.
     */
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      const taux = await cellule(page.page, '__total__', 'conformite');
      const maturite = await cellule(page.page, '__total__', 'maturite');
      assert.equal(
        entier(taux), 3,
        `Taux du groupe : « ${String(taux)} ». « 4 % » signifierait que le catalogue a été ` +
          'compté une seule fois pour deux filiales.',
      );
      assert.equal(
        maturite, '0.2',
        `Maturité du groupe : « ${String(maturite)} ». « 0.5 » signifierait le même défaut ` +
          'sur le dénominateur CMMI.',
      );

      // Et le témoin : chaque filiale garde SON taux, différent de celui du groupe.
      const a = await cellule(page.page, FILIALE_A, 'conformite');
      const b = await cellule(page.page, FILIALE_B, 'conformite');
      assert.equal(entier(a), 3, `Filiale A : « ${String(a)} » (8 conformes sur 276 applicables).`);
      assert.equal(entier(b), 5, `Filiale B : « ${String(b)} » (2 conformes sur 43 applicables).`);
      assert.notEqual(a, b, 'Les deux filiales doivent porter des taux distincts.');

      assert.deepEqual(page.erreursInattendues(), []);
    } finally {
      await page.fermer();
    }
  });

  test('un référentiel absent du catalogue est SIGNALÉ, jamais silencieusement ignoré', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      // Le semis commun pose `ref_id = 'anssi'`, qui n'est pas dans le catalogue.
      const ligne = await page.page.evaluate(() => {
        const tr = document.querySelector('tr[data-ref="anssi"]');
        return tr === null ? null : tr.textContent.replace(/\s+/gu, ' ').trim();
      });
      assert.notEqual(
        ligne, null,
        'Un référentiel présent en base et absent du catalogue doit tout de même apparaître : ' +
          'le faire disparaître serait une omission qui réussit en silence.',
      );
      assert.match(ligne, /hors catalogue/u, `Il doit être signalé comme tel. Vu : « ${ligne} ».`);

      assert.deepEqual(page.erreursInattendues(), []);
    } finally {
      await page.fermer();
    }
  });
});

/* =====================================================================
 *  §6 — Ce qui s'affiche vient de quelqu'un
 * ===================================================================== */

describe('§6 — la donnée hostile se lit, elle ne s’exécute pas', () => {
  test('une ville forgée arrive LITTÉRALEMENT à l’écran, et rien ne s’exécute', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      const execute = await page.page.evaluate(() => window.__xssGroupe);
      assert.equal(
        execute, undefined,
        'La charge hostile de `filiales.ville` s’est EXÉCUTÉE : `escapeHtml` manque quelque part.',
      );

      // Elle doit bien être là — sinon l'essai ci-dessus est vert parce que la
      // valeur n'a jamais été rendue.
      const lu = await page.page.evaluate(() => {
        const dd = document.querySelector('.grp-coord-l[data-coord="Ville"] dd');
        return dd === null ? null : dd.textContent;
      });
      assert.match(
        lu ?? '', /<img src=x onerror=/u,
        `La ville hostile doit être LUE telle quelle. Vue : « ${String(lu)} ».`,
      );
      // Et rendue comme du TEXTE, pas comme un élément.
      const images = await page.page.evaluate(() =>
        document.querySelectorAll('.grp-coord img, #groupeCorps img').length);
      assert.equal(images, 0, 'Aucune balise ne doit avoir été créée depuis la donnée.');

      assert.deepEqual(page.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await page.fermer();
    }
  });

  test('l’écran ne pose AUCUN gestionnaire en ligne — la CSP du vhost les rend inertes', async () => {
    const page = await ouvrirGroupe(PERIMETRE_GROUPE, TOUT_OUVERT);
    try {
      // Constat M-6 de la porte S2 : soixante-quatre gestionnaires en ligne
      // bloqués par `script-src 'self'`, et une interface morte en production.
      // On mesure le DOM RENDU, pas la source du fichier.
      const fautifs = await page.page.evaluate(() => {
        const trouve = [];
        document.querySelectorAll('#groupeCorps *, #groupeDetail *').forEach((el) => {
          Array.prototype.forEach.call(el.attributes, (a) => {
            if (/^on/iu.test(a.name)) trouve.push(`${el.tagName}[${a.name}]`);
          });
        });
        return trouve;
      });
      assert.deepEqual(fautifs, [], `Gestionnaires en ligne rendus : ${JSON.stringify(fautifs)}`);

      // Et les gestes branchés APRÈS rendu fonctionnent : le détail d'une
      // filiale s'ouvre au clic. L'identifiant est relu dans le DOM, jamais
      // capturé en chaîne.
      await page.page.click(`tr[data-filiale="${FILIALE_A}"]`);
      await page.page.waitForSelector(`#groupeDetail [data-detail="${FILIALE_A}"]`, { timeout: DELAI });
      const detail = await page.page.evaluate(
        (f) => {
          const el = document.querySelector(`#groupeDetail [data-detail="${f}"]`);
          return el === null ? null : el.textContent.replace(/\s+/gu, ' ').trim();
        },
        FILIALE_A,
      );
      assert.match(detail ?? '', /Répartitions/u, 'Le clic doit ouvrir le détail de la filiale.');

      assert.deepEqual(page.erreursInattendues(), [], 'CLAUDE.md §5 : zéro erreur.');
    } finally {
      await page.fermer();
    }
  });
});
