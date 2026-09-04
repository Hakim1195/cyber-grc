/**
 * regles.test.mjs — les trois règles du §29 qui ne sont pas une question de
 * couverture, et qu'un journal complet mais bavard trahirait quand même.
 *
 * | § | Propriété | Contrat |
 * |---|---|---|
 * | 1 | **Une valeur d'utilisateur n'entre jamais dans `resume`** | `CONVENTIONS.md` §29.5 |
 * | 2 | **Aucun `resume` ne porte de caractère de commande** — un export texte rendrait UNE ligne | §29.5, §29.8 |
 * | 3 | **L'écriture métier échoue avec sa trace** | §29.3, règle 2 |
 * | 4 | **Rien de secret n'entre dans une entrée** | §29.6 |
 *
 * ── Pourquoi le §1 ne se relit pas, il se forge ──────────────────────────
 *
 * L'auditeur de la porte S3 n'a pas relu le code : il a **forgé un login
 * contenant du JSON et des sauts de ligne**, et il est arrivé littéralement
 * dans le journal. C'est la seule preuve qui vaut, et c'est celle que ce
 * fichier rejoue — sur les valeurs que les émetteurs du lot L5 manipulent : le
 * nom d'un fichier repris, la valeur d'un champ créé, l'identité d'une session
 * refusée.
 *
 * ── Pourquoi le §3 casse le journal exprès ───────────────────────────────
 *
 * *« Une écriture ne peut pas réussir sans sa trace. Si l'insertion au journal
 * échoue, la transaction échoue. Un journal qu'on peut faire taire en le
 * saturant n'est pas inaltérable. »* La seule façon de le prouver est de faire
 * échouer l'insertion — un déclencheur posé par le **propriétaire** de la base,
 * le temps de l'essai — et de constater que l'enregistrement métier n'existe
 * pas ensuite. Un essai qui se contenterait de lire l'absence de `try` dans le
 * code mesurerait la rédaction, pas le comportement.
 *
 * ⚠️ Toute lecture du journal déclare un périmètre (`CONVENTIONS.md` §29.7).
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { moduleCompile, monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

/**
 * La valeur hostile : un saut de ligne (qui scinderait une ligne d'export), un
 * retour chariot, un guillemet et un point-virgule (les deux séparateurs qu'un
 * format texte doit citer), et du JSON pour faire bonne mesure. C'est, à peu de
 * choses près, ce que l'auditeur a forgé.
 */
const HOSTILE = 'Ana\r\nlyse";DROP--{"action":"purge"} fin';

const PERIMETRE_LECTEUR = perimetre('verificateur', FILIALE_A, [FILIALE_A, FILIALE_B]);

let base;
let serveur;
let temoin;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  temoin = await base.nouvelleConnexion('app');
});

after(async () => {
  await temoin?.end().catch(() => {});
  await serveur?.fermer();
  await base?.fermer();
});

async function lireJournal(sql, parametres = []) {
  return await base.avecPerimetre(temoin, PERIMETRE_LECTEUR, async (client) => {
    const { rows } = await client.query(sql, parametres);
    return rows;
  });
}

/* =====================================================================
 *  §1 — La valeur hostile ne passe pas par `resume`
 * ===================================================================== */

describe('§29.5 — une valeur d’utilisateur n’entre jamais dans `resume`', () => {
  test('la valeur d’un champ créé part en jsonb, INTACTE, et pas dans la phrase', async () => {
    const creation = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: HOSTILE } },
    });
    assert.equal(creation.statut, 201, JSON.stringify(creation.corps));
    const identifiant = creation.corps.enregistrement.id;

    const [entree] = await lireJournal(
      `select resume, valeurs_apres from journal_audit
        where action = 'creation' and entite_id = $1`,
      [identifiant],
    );
    assert.ok(entree !== undefined, 'La création doit être tracée.');

    // La phrase est celle du développeur, et rien d'autre.
    assert.equal(entree.resume, 'Création d’un enregistrement.');
    assert.ok(!entree.resume.includes('Ana'), 'La valeur ne doit pas entrer dans `resume`.');

    // Et la valeur, elle, est conservée INTACTE là où l'encodage est le
    // problème de PostgreSQL : le journal doit rester une preuve, pas un
    // résumé approximatif de ce que l'utilisateur a écrit.
    assert.equal(
      entree.valeurs_apres.nom,
      HOSTILE,
      'La valeur métier doit survivre telle quelle dans `valeurs_apres`.',
    );
  });

  test('le nom d’un fichier repris part en jsonb, et pas dans la phrase', async () => {
    const exportation = await serveur.appeler('GET', '/api/export');
    assert.equal(exportation.statut, 200);

    const reprise = await serveur.appeler('POST', '/api/reprise', {
      corps: {
        mode: 'fusionner',
        fichier: { nom: `${HOSTILE}.json`, contenu: JSON.stringify(exportation.corps) },
      },
    });
    assert.equal(reprise.statut, 200, JSON.stringify(reprise.corps).slice(0, 300));

    const [entree] = await lireJournal(
      `select resume, valeurs_apres from journal_audit
        where action = 'import' order by numero desc limit 1`,
    );
    assert.ok(entree !== undefined, 'La reprise doit être tracée.');
    assert.ok(!entree.resume.includes('Ana'), 'Le nom du fichier ne doit pas entrer dans `resume`.');
    assert.equal(entree.valeurs_apres.fichier, `${HOSTILE}.json`);
  });

  test('l’identité d’une session refusée va dans sa COLONNE, pas dans la phrase', async () => {
    // §29.5 : `utilisateur_libelle` est l'une des deux sorties admises. Elle
    // reçoit donc la valeur intacte — c'est son objet — et `resume` n'en voit
    // rien. On refuse une lecture de journal à une session qui n'a pas le
    // domaine : un refus post-authentification, le seul que l'on trace.
    const perimetreHostile = {
      ...PERIMETRE_LECTEUR,
      utilisateurId: HOSTILE,
      perimetreGroupe: true,
    };
    const session = {
      provisoire: true,
      async resoudre() {
        return perimetreHostile;
      },
      async authentifier() {
        return {
          perimetre: perimetreHostile,
          droits: { niveau: 'lecture', domaines: ['pilotage'], export: false },
          identite: null,
        };
      },
      decrire() {
        return 'session forgée (test/journal/regles.test.mjs)';
      },
    };

    const greffon = await monterGreffon(base, perimetreHostile, { resolveur: session });
    try {
      const refus = await greffon.appeler('POST', '/api/entites/risques', {
        corps: { champs: { nom: 'écriture refusée' } },
      });
      assert.equal(refus.statut, 403, JSON.stringify(refus.corps));
    } finally {
      await greffon.fermer();
    }

    const [entree] = await lireJournal(
      `select resume, utilisateur_libelle from journal_audit
        where action = 'refus_autorisation' order by numero desc limit 1`,
    );
    assert.ok(entree !== undefined, 'Le refus de droit doit être tracé.');
    assert.ok(!entree.resume.includes('Ana'), 'L’identité ne doit pas entrer dans `resume`.');
    // Le libellé porte l'identité — normalisée de ses caractères de commande,
    // parce que la colonne est lue, exportée et imprimée (§2 ci-dessous).
    assert.ok(
      entree.utilisateur_libelle.includes('lyse";DROP'),
      `Le libellé doit porter l’identité présentée : ${String(entree.utilisateur_libelle)}`,
    );
  });
});

/* =====================================================================
 *  §2 — Aucun `resume` ne scinde une ligne d'export
 * ===================================================================== */

describe('§29.8 — un export texte rendrait UNE ligne par entrée', () => {
  test('aucun `resume` du journal ne porte de caractère de commande', async () => {
    const lignes = await lireJournal(
      `select numero, action, resume from journal_audit where resume is not null`,
    );
    assert.ok(lignes.length >= 5, `Trop peu d’entrées pour juger : ${String(lignes.length)}.`);
    const fautives = lignes.filter((l) => /[\u0000-\u001f\u007f-\u009f]/u.test(l.resume));
    assert.deepEqual(
      fautives.map((l) => `${String(l.numero)}/${l.action}`),
      [],
      'Un saut de ligne dans `resume` scinde la ligne d’un export texte du journal.',
    );
  });

  test('LA NORMALISATION MORD : elle voit passer une phrase forgée', async () => {
    // Sans elle, ce `resume` scinderait la ligne. On l'écrit par le VRAI
    // chemin d'écriture — `journaliser` sur une transaction réelle — pour que
    // l'essai mesure la fonction en service et non une copie.
    const { journaliser } = await moduleCompile('auth/journal.js');
    const client = await base.connexion('app');
    await base.avecPerimetre(
      client,
      perimetre('forgeron', FILIALE_A, [FILIALE_A, FILIALE_B]),
      async (c) => {
        await journaliser(c, {
          action: 'administration',
          filialeId: FILIALE_A,
          utilisateurLibelle: 'forgeron',
          resume: `Phrase\r\nsur deux lignes\ttabulée.`,
        });
      },
      { annuler: false },
    );

    const [entree] = await lireJournal(
      `select resume from journal_audit where action = 'administration' order by numero desc limit 1`,
    );
    assert.equal(entree.resume, 'Phrase sur deux lignes tabulée.');
  });
});

/* =====================================================================
 *  §3 — L'écriture métier échoue AVEC sa trace
 * ===================================================================== */

describe('§29.3 règle 2 — une écriture ne peut pas réussir sans sa trace', () => {
  test('journal en panne : la création échoue, et RIEN n’est écrit en base', async () => {
    const proprietaire = await base.connexion('proprietaire');
    // Un déclencheur qui refuse toute insertion au journal — c'est ce qu'un
    // journal saturé, verrouillé ou corrompu produirait. Il est posé par le
    // PROPRIÉTAIRE : le rôle applicatif ne peut pas toucher aux déclencheurs de
    // cette table (§12, couche 4), et c'est justement ce qui rend la propriété
    // intéressante.
    await proprietaire.query(`
      create or replace function f_essai_journal_en_panne() returns trigger
        language plpgsql as $$ begin
          raise exception 'journal indisponible (essai J1)' using errcode = '57014';
        end $$`);
    await proprietaire.query(`
      create trigger trg_essai_journal_en_panne before insert on journal_audit
        for each row execute function f_essai_journal_en_panne()`);

    try {
      const creation = await serveur.appeler('POST', '/api/entites/risques', {
        corps: { champs: { nom: 'Risque qui ne doit pas survivre' } },
      });
      assert.ok(
        creation.statut >= 500,
        `La création devait échouer avec son journal, elle a rendu ${String(creation.statut)}.`,
      );
    } finally {
      await proprietaire.query('drop trigger trg_essai_journal_en_panne on journal_audit');
      await proprietaire.query('drop function f_essai_journal_en_panne()');
    }

    // La preuve est là : la ligne métier n'existe pas. Un `rollback` a emporté
    // l'écriture ET sa trace, ensemble.
    const donnees = await serveur.appeler('GET', '/api/donnees');
    assert.equal(donnees.statut, 200);
    const survivant = donnees.corps.data.risques.find(
      (r) => r.nom === 'Risque qui ne doit pas survivre',
    );
    assert.equal(
      survivant,
      undefined,
      'Un enregistrement a survécu à l’échec de sa propre trace : le journal peut être ' +
        'réduit au silence en le saturant.',
    );
  });

  test('CONTRÔLE — la même création réussit une fois le journal rétabli', async () => {
    const creation = await serveur.appeler('POST', '/api/entites/risques', {
      corps: { champs: { nom: 'Risque qui doit survivre' } },
    });
    assert.equal(creation.statut, 201, JSON.stringify(creation.corps));
    const [entree] = await lireJournal(
      `select action from journal_audit where entite_id = $1`,
      [creation.corps.enregistrement.id],
    );
    assert.equal(entree?.action, 'creation', 'L’essai précédent mesurait bien la panne, pas le vide.');
  });
});

/* =====================================================================
 *  §4 — Rien de secret dans une entrée
 * ===================================================================== */

describe('§29.6 — le journal se lit à froid, trois ans plus tard', () => {
  test('aucune entrée ne porte de clé de secret dans ses charges jsonb', async () => {
    const lignes = await lireJournal(
      `select numero, action, valeurs_avant, valeurs_apres from journal_audit
        where valeurs_avant is not null or valeurs_apres is not null`,
    );
    assert.ok(lignes.length >= 5, `Trop peu de charges pour juger : ${String(lignes.length)}.`);
    // `sha256` n'est pas un secret : c'est l'empreinte du FICHIER repris, et
    // c'est elle qui permet de dire quel fichier a été appliqué. Le motif ne la
    // vise donc pas.
    const interdit = /mot.?de.?passe|password|jeton|token|secret|empreinte_jeton/i;
    const fautives = [];
    for (const ligne of lignes) {
      for (const charge of [ligne.valeurs_avant, ligne.valeurs_apres]) {
        if (charge === null) continue;
        for (const cle of Object.keys(charge)) {
          if (interdit.test(cle)) fautives.push(`${String(ligne.numero)}/${ligne.action}: ${cle}`);
        }
      }
    }
    assert.deepEqual(fautives, [], 'Une clé de secret dans le journal d’audit.');
  });
});

/* =====================================================================
 *  §29.5 — la règle tient à la SOURCE, plus seulement par la ceinture
 * ===================================================================== */

describe('Aucune valeur d’utilisateur n’est concaténée dans « resume » (§29.5)', () => {
  // ── Pourquoi ce contrôle est STATIQUE, et pourquoi il fallait les deux ──
  //
  // `normaliserResume()` neutralise les caractères de commande dans toute entrée
  // qui passe par `journaliser()` : c'est la **ceinture**, et elle rend l'export
  // du journal inscindable quoi qu'écrive l'appelant. Elle ne rend pas la règle
  // vraie pour autant — normaliser une valeur d'utilisateur ne la rend pas
  // légitime dans une phrase, elle l'y rend seulement inoffensive.
  //
  // La règle est : `resume` est une phrase écrite par le développeur. Elle se
  // tient donc à la source, et seule une lecture du CODE peut le dire — un essai
  // de comportement ne verrait qu'une phrase normalisée, c'est-à-dire propre.
  //
  // ⚠️ Sept sites la violaient encore après l'écriture du §29 : ils vivaient tous
  // dans `src/auth/`, hors du périmètre de l'agent qui a écrit le contrat, et
  // c'est exactement pour cela qu'un garde-fou vaut mieux qu'une consigne.
  const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

  /** Toutes les sources du serveur, avec leur chemin. */
  function sources() {
    const trouves = [];
    const parcourir = (repertoire) => {
      for (const entree of readdirSync(repertoire)) {
        const chemin = join(repertoire, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (entree.endsWith('.ts')) trouves.push([chemin, readFileSync(chemin, 'utf8')]);
      }
    };
    parcourir(racine);
    return trouves;
  }

  test('LA SOURCE N’EST PAS VIDE : on lit bien des fichiers, et ils portent des résumés', () => {
    const fichiers = sources();
    assert.ok(fichiers.length >= 20, `Seulement ${String(fichiers.length)} sources lues.`);
    const avecResume = fichiers.filter(([, texte]) => texte.includes('resume:')).length;
    assert.ok(
      avecResume >= 3,
      `Seulement ${String(avecResume)} fichier(s) écrivent un « resume » : le motif de ` +
        'recherche est cassé, et ce contrôle rendrait vert en n’éprouvant rien.',
    );
  });

  test('AUCUN « resume: » n’interpole une valeur', () => {
    // Un gabarit contenant `${` est une interpolation. C'est volontairement
    // grossier : la seule façon d'y échapper est d'écrire une phrase littérale,
    // ce qui est précisément la règle.
    const fautifs = [];
    for (const [chemin, texte] of sources()) {
      texte.split('\n').forEach((ligne, i) => {
        if (/resume:\s*`[^`]*\$\{/.test(ligne)) {
          fautifs.push(`${chemin.slice(chemin.indexOf('src/'))}:${String(i + 1)}`);
        }
      });
    }
    assert.deepEqual(
      fautifs,
      [],
      '§29.5 : « resume » est une phrase écrite par le développeur. Une valeur ' +
        'd’utilisateur a deux sorties — « utilisateurLibelle » pour l’identité présentée, ' +
        '« valeursApres » (jsonb) pour le reste — et aucune n’est la phrase.',
    );
  });

  test('MORSURE : le détecteur voit bien une interpolation', () => {
    const echantillon = 'await journaliser(c, { resume: `Connexion de « ${login} ».` });';
    assert.ok(
      /resume:\s*`[^`]*\$\{/.test(echantillon),
      'Le détecteur ne reconnaît plus une interpolation : il ne signalerait plus rien.',
    );
    assert.ok(
      !/resume:\s*`[^`]*\$\{/.test("await journaliser(c, { resume: 'Connexion réussie.' });"),
      'Le détecteur accuse une phrase littérale : il rendrait la règle intenable.',
    );
  });
});
