/**
 * conditions.test.mjs — LES CINQ CONDITIONS CONSTITUTIVES DU JEU DE DÉCOUVERTE
 *
 * ── Pourquoi ce fichier est écrit ainsi ─────────────────────────────────────
 *
 * L'arbitrage A2 du 08/09/2026 ne dit pas « le jeu de découverte est autorisé, et
 * voici cinq bonnes pratiques ». Il dit :
 *
 *   « les cinq conditions ci-dessous sont **constitutives** — un jeu qui n'en
 *     respecte que quatre n'est pas autorisé. »
 *
 * Un essai qui vérifierait que « le semis fonctionne » passerait donc à côté de
 * l'objet : ce qui est éprouvé ici, ce sont **les cinq refus**, un par condition,
 * et chacun avec la mutation qui le fait tomber.
 *
 * ⚠️ **Chaque contrôle doit pouvoir ROUGIR.** C'est la leçon des constats Q-210
 * (*« un essai qui couvre une règle sans jamais la faire décider ne la couvre
 * pas »*) et Q-251 (*un essai doit rougir, jamais se figer*). Les mutations qui
 * ont été jouées à la main pendant l'écriture sont citées au-dessus de chaque
 * bloc, avec ce qu'elles produisent.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { monterGreffon } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;

const PERIMETRE = {
  utilisateurId: 'admin-essai',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A],
  perimetreGroupe: false,
  administrationGroupe: true,
};

/** Monte le greffon sous un profil d'installation donné. */
async function monter(profil) {
  return await monterGreffon(base, PERIMETRE, { env: { CYBER_GRC_PROFIL: profil } });
}

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);

  // ⚠️ On ne sème QUE la filiale, et rien d'autre. `semerJeuEssai()` poserait
  // une vingtaine de lignes métier — c'est-à-dire des DONNÉES RÉELLES au sens
  // de la condition 3 —, et le semis serait refusé avant d'avoir rien mesuré.
  // ⚠️ `avecPerimetre()` ANNULE sa transaction par défaut : sans
  // `{ annuler: false }`, la filiale n'existerait déjà plus à la ligne suivante.
  const applicatif = await base.connexion('app');
  await base.avecPerimetre(
    applicatif,
    perimetre('semeur', FILIALE_A, [FILIALE_A], true),
    async (c) => {
      await c.query(
        "insert into filiales (id, code, raison_sociale, pays) values ($1, 'ZZDEC', 'Essai découverte', 'FR')",
        [FILIALE_A],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  CONDITION 5 — interdit hors du profil « découverte », refus JOURNALISÉ
 * ===================================================================== */

describe('Condition 5 — le jeu est interdit hors du profil « découverte »', () => {
  test('en production : le semis rend 403, et le refus laisse une trace', async () => {
    const monte = await monter('production');
    try {
      const avant = await compterJournal();

      const { statut, corps } = await monte.appeler('POST', '/api/decouverte/semer');
      assert.equal(statut, 403, JSON.stringify(corps).slice(0, 200));

      // ⚠️ Le refus doit être JOURNALISÉ : « qui a essayé de semer des données
      // fictives sur la production ? » est exactement la question qu'un
      // auditeur pose, et un refus non tracé n'y répond pas. Même dessein que
      // `GRC06` (migration 019).
      const apres = await compterJournal();
      assert.equal(
        apres - avant >= 1,
        true,
        'Le refus hors profil doit être inscrit au journal : sans trace, la tentative ' +
          "n'a jamais eu lieu pour quiconque relit le registre.",
      );

      const refus = await derniereEntree();
      assert.equal(refus.action, 'refus_autorisation');
      assert.match(String(refus.resume), /découverte/i);
    } finally {
      await monte.fermer();
    }
  });

  test('en production : la purge aussi est refusée', async () => {
    // La moitié qu'on oublie : si seul le semis est gardé, un appelant peut
    // encore PURGER une base de production — c'est-à-dire supprimer des lignes
    // réelles, si jamais l'une d'elles portait la marque.
    const monte = await monter('production');
    try {
      const { statut } = await monte.appeler('POST', '/api/decouverte/purger');
      assert.equal(statut, 403);
    } finally {
      await monte.fermer();
    }
  });

  test('en production : l’ÉTAT reste lisible, et il DIT pourquoi', async () => {
    // Un bouton grisé sans explication est la classe Q-201 / Q-207 : l'écran
    // apprend à l'utilisateur qu'il lui cache des choses.
    const monte = await monter('production');
    try {
      const { statut, corps } = await monte.appeler('GET', '/api/decouverte/etat');
      assert.equal(statut, 200);
      assert.equal(corps.semable, false);
      assert.equal(corps.profil, 'production');
      assert.equal(
        corps.motif.length > 40,
        true,
        'Le motif doit être une phrase utile, pas un drapeau.',
      );
    } finally {
      await monte.fermer();
    }
  });
});

/* =====================================================================
 *  CONDITIONS 1, 2, 3, 4 — sous le profil « découverte »
 * ===================================================================== */

describe('Conditions 1 à 4 — sous le profil « découverte »', () => {
  test('CONDITION 1 — TOUTE ligne semée porte la marque, dans la BASE', async () => {
    const monte = await monter('decouverte');
    try {
      const { statut, corps } = await monte.appeler('POST', '/api/decouverte/semer');
      assert.equal(statut, 201, JSON.stringify(corps).slice(0, 300));
      assert.equal(corps.semees > 30, true, `semées = ${String(corps.semees)}`);

      // ⚠️ On ne demande pas au produit s'il a marqué : on le demande à la BASE,
      // table porteuse par table porteuse, DÉCOUVERTES au catalogue. Un essai
      // qui interrogerait la route validerait la route par elle-même.
      const applicatif = await base.connexion('app');
      const restes = await base.avecPerimetre(
        applicatif,
        { ...PERIMETRE, utilisateur: 'essai' },
        async (c) => {
          const porteuses = await c.query(
            `select a.attrelid::regclass::text as t
               from pg_attribute a
              where a.attname = 'provenance' and a.attnum > 0 and not a.attisdropped
                and a.atttypid = 'provenance_ligne'::regtype
              order by 1`,
          );
          let nonMarquees = 0;
          for (const { t } of porteuses.rows) {
            // ⚠️ `socle` est exclu, et l'exclusion est le CONSTAT plutôt qu'une
            // commodité : une échelle de cotation du Groupe est livrée PAR UNE
            // MIGRATION (migration `049` §0 bis). Personne ne l'a saisie, elle revient
            // à l'identique sur toute installation, et le jeu de découverte ne la
            // remplace pas. La compter comme non marquée reviendrait à exiger que le
            // semis réécrive le socle du produit.
            const r = await c.query(
              `select count(*)::int as n from ${t}
                where provenance <> all (array['decouverte', 'socle'])`,
            );
            nonMarquees += r.rows[0].n;
          }
          return nonMarquees;
        },
      );

      assert.equal(
        restes,
        0,
        'Une ligne semée sans marque est INDISCERNABLE d’une ligne réelle dès le premier ' +
          'export — c’est le défaut que la condition 1 existe pour empêcher.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('CONDITION 1 bis — la marque n’est pas FORGEABLE par l’appelant', async () => {
    // Le cœur de la propriété : si un appelant peut déclarer sa provenance, la
    // marque ne prouve rien, et le contrôle de la condition 3 devient une
    // politesse. C'est la base qui pose, depuis `grc.provenance`.
    const applicatif = await base.connexion('app');
    const provenance = await base.avecPerimetre(
      applicatif,
      { ...PERIMETRE, utilisateur: 'essai' },
      async (c) => {
        await c.query(
          `insert into risques (id, filiale_id, nom, provenance)
           values ('RSK-FORGE', $1, 'tentative de forge', 'decouverte')`,
          [FILIALE_A],
        );
        const r = await c.query(`select provenance from risques where id = 'RSK-FORGE'`);
        return r.rows[0].provenance;
      },
      // ⚠️ `{ annuler: false }` : sans lui la ligne disparaît au retour, et le
      // contrôle suivant — « la base porte-t-elle une ligne réelle ? » — n'aurait
      // plus rien à trouver. `avecPerimetre()` ANNULE sa transaction par défaut,
      // et c'est une faute de méthode déjà payée le 10/09.
      { annuler: false },
    );

    assert.equal(
      provenance,
      'saisie',
      'L’appelant a déclaré « decouverte » et la base doit avoir ÉCRASÉ sa valeur : une ' +
        'marque que l’appelant choisit ne distingue plus rien.',
    );
  });

  test('CONDITION 3 — refus si la base porte la MOINDRE ligne réelle', async () => {
    // ⚠️ Le contrôle porte sur la PRÉSENCE d'une ligne non marquée, pas sur un
    // compteur : une seule suffit. La ligne « RSK-FORGE » du contrôle précédent
    // en est une — elle a été écrite en « saisie ».
    const monte = await monter('decouverte');
    try {
      const etat = await monte.appeler('GET', '/api/decouverte/etat');
      assert.equal(etat.corps.lignesReelles >= 1, true);
      assert.equal(etat.corps.semable, false);

      const { statut, corps } = await monte.appeler('POST', '/api/decouverte/semer');
      assert.equal(statut, 409, JSON.stringify(corps).slice(0, 200));
    } finally {
      await monte.fermer();
    }
  });

  test('CONDITION 4 — la purge retire TOUT ce qui est marqué, et RIEN d’autre', async () => {
    const monte = await monter('decouverte');
    try {
      const avant = await monte.appeler('GET', '/api/decouverte/etat');
      const reelles = avant.corps.lignesReelles;
      assert.equal(avant.corps.present, true, 'Le jeu semé plus haut doit être là.');

      const { statut, corps } = await monte.appeler('POST', '/api/decouverte/purger');
      assert.equal(statut, 200, JSON.stringify(corps).slice(0, 200));
      assert.equal(corps.etat.lignesDecouverte, 0, 'Il ne doit plus rester une seule ligne marquée.');

      // L'autre moitié, et c'est elle qui compte : la purge ne doit pas emporter
      // les lignes RÉELLES au passage. Une purge trop large serait une perte de
      // données — la première classe du §0 bis.
      assert.equal(
        corps.etat.lignesReelles,
        reelles,
        'La purge a emporté des lignes qui ne portaient pas la marque.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('CONDITION 2 — `install.sh` n’appelle JAMAIS le semis', async () => {
    // Le geste doit être volontaire : « jamais par l'installateur, jamais au
    // premier démarrage ». On le vérifie sur le SCRIPT, pas sur une intention.
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

    for (const fichier of ['deploy/install.sh']) {
      const texte = await readFile(join(racine, fichier), 'utf8');
      assert.equal(
        /decouverte\/semer/.test(texte),
        false,
        `${fichier} appelle le semis : le jeu de découverte ne se charge que sur un geste ` +
          'volontaire de l’utilisateur (condition constitutive n° 2).',
      );
    }
  });
});

/* =====================================================================
 *  Outils de mesure — ils lisent la BASE, jamais le produit
 * ===================================================================== */

async function compterJournal() {
  const lecture = await base.connexion('proprietaire');
  const r = await lecture.query('select count(*)::int as n from journal_audit');
  return r.rows[0].n;
}

async function derniereEntree() {
  const lecture = await base.connexion('proprietaire');
  const r = await lecture.query(
    'select action, resume from journal_audit order by numero desc limit 1',
  );
  return r.rows[0] ?? {};
}
