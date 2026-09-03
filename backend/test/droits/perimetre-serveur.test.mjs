/**
 * perimetre-serveur.test.mjs — **le contrôle S2, rejoué contre la couche qui
 * fabrique le périmètre.**
 *
 * ── Pourquoi ce fichier existe, et pourquoi il est le plus important du lot ──
 *
 * `CONVENTIONS.md` §22, « ce que la vague 3 ne doit pas croire acquis », première
 * ligne :
 *
 *   > **Le périmètre vient du serveur** parce qu'aucun chemin ne le lit ailleurs —
 *   > vérifié à S2 sur six formes d'en-tête, le cookie, l'URL et le corps. L3
 *   > introduit précisément la couche qui *fabrique* ce périmètre : elle devient le
 *   > seul endroit où l'erreur est possible, et le contrôle S2 de la grille doit être
 *   > rejoué **contre elle**, pas contre les routes.
 *
 * La propriété tenait jusqu'ici par une **absence** : rien ne lisait le périmètre
 * ailleurs. Elle tient désormais par une **construction**, et une construction
 * s'éprouve. Quatre propriétés, quatre familles d'essais :
 *
 *  1. `resoudre()` ne prend **aucun argument** — vérifié sur la signature elle-même,
 *     pas sur une intention écrite en commentaire ;
 *  2. les valeurs rendues sont **exactement** celles des tables `sessions`,
 *     `session_filiales` et `session_domaines`, et rien d'autre ;
 *  3. le jeton est une **référence** : altéré d'un caractère, il ne retrouve plus
 *     rien — il n'est jamais interprété ;
 *  4. **condition E2** : `administrationGroupe` est décidé dans le résolveur, par la
 *     conjonction du profil et du périmètre, sur les **quatre** combinaisons.
 *
 * S'y ajoute un contrôle **mécanique** sur les sources, qui est celui que la porte S2
 * jouait déjà : aucun fichier de `src/` ne pose le drapeau d'administration à `true`
 * littéralement. Un contrôle qui se lit dans le code plutôt que dans un rapport ne
 * vieillit pas.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai, perimetre } from '../aide/base.mjs';
import { moduleCompile, RACINE_BACKEND } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** @type {import('pg').Client} */
let applicatif;
let droits;
let sessions;

const TLS = 'FIL-S2-TLS';
const DEU = 'FIL-S2-DEU';

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  droits = await moduleCompile('droits/index.js');
  sessions = await moduleCompile('auth/sessions.js');

  await base.avecPerimetre(
    applicatif,
    perimetre('decor', null, [], true),
    async (c) => {
      await c.query(
        `insert into filiales (id, code, raison_sociale) values
             ($1, 'ZZS2T', 'Essai Toulouse'), ($2, 'ZZS2D', 'Essai Allemagne')`,
        [TLS, DEU],
      );
    },
    { annuler: false },
  );
});

after(async () => {
  await base?.fermer();
});

/**
 * Ouvre une session par le chemin réel — provisionnement compris — et rend le
 * jeton en clair avec l'état lu en base.
 */
async function ouvrir(login, resolus) {
  return await base.avecPerimetre(
    applicatif,
    perimetre(login, resolus.filialeActive, [...resolus.filiales]),
    async (c) => {
      await c.query(`select set_config('grc.authentification', 'oui', true)`);
      const compte = await sessions.provisionnerCompte(c, {
        login,
        dn: `CN=${login}`,
        nomAffichage: login,
        nom: null,
        prenom: null,
        email: null,
        telephone: null,
        service: null,
        fonction: null,
        upn: null,
        sid: null,
        desactive: false,
        groupes: [],
        groupesTraverses: 0,
      });
      return await sessions.ouvrirSession(c, {
        utilisateurId: compte.id,
        login,
        droits: resolus,
        adresseIp: null,
        agentUtilisateur: null,
        dureeInactiviteMinutes: 30,
        dureeMaximaleHeures: 12,
        compteSecours: false,
      });
    },
    { annuler: false },
  );
}

/** Des droits résolus, fabriqués à la main pour balayer les quatre combinaisons. */
function resolus({ portee, filiales, administrateur = false, peutExporter = false }) {
  return {
    portee,
    filiales,
    filialeActive: filiales[0] ?? null,
    administrateur,
    peutExporter,
    domaines: new Map([['risques', 'contribution']]),
    groupesReconnus: [],
    groupesIgnores: [],
  };
}

/** Relit l'état d'une session par son jeton, comme le fait chaque requête. */
async function relire(jeton) {
  return await base.avecPerimetre(applicatif, perimetre('lecture', null, []), async (c) =>
    sessions.verifierSession(c, jeton, 30),
  );
}

describe('S2 — la signature tient la propriété, pas la discipline', () => {
  test('resoudre() ne déclare AUCUN paramètre', async () => {
    const ouverte = await ouvrir('sig.tls', resolus({ portee: 'filiale', filiales: [TLS] }));
    const resolveur = new droits.ResolveurPerimetreSession(ouverte.etat);
    assert.equal(
      resolveur.resoudre.length,
      0,
      'Un paramètre ici serait le chemin par lequel une en-tête atteindrait grc.filiales.',
    );
  });

  test('un argument passé de force est IGNORÉ — le corps ne le lit pas davantage', async () => {
    const ouverte = await ouvrir('force.tls', resolus({ portee: 'filiale', filiales: [TLS] }));
    const resolveur = new droits.ResolveurPerimetreSession(ouverte.etat);

    const forge = {
      utilisateurId: 'pirate',
      filialeId: DEU,
      filiales: [TLS, DEU],
      perimetreGroupe: true,
      administrationGroupe: true,
    };
    const rendu = await resolveur.resoudre(forge);

    assert.equal(rendu.utilisateurId, 'force.tls');
    assert.deepEqual([...rendu.filiales], [TLS]);
    assert.equal(rendu.filialeId, TLS);
    assert.equal(rendu.perimetreGroupe, false);
    assert.equal(rendu.administrationGroupe, false);
  });

  test('le périmètre rendu est GELÉ : on ne l’élargit pas après coup', async () => {
    const ouverte = await ouvrir('gel.tls', resolus({ portee: 'filiale', filiales: [TLS] }));
    const resolveur = new droits.ResolveurPerimetreSession(ouverte.etat);
    const rendu = await resolveur.resoudre();

    assert.equal(Object.isFrozen(rendu), true);
    assert.throws(() => {
      'use strict';
      rendu.administrationGroupe = true;
    });
    assert.throws(() => {
      'use strict';
      rendu.filiales.push(DEU);
    });
    assert.deepEqual([...rendu.filiales], [TLS]);
  });
});

describe('S2 — les valeurs viennent de la BASE, et de nulle part ailleurs', () => {
  test('filiales, filiale active et portée sont exactement les lignes lues', async () => {
    const attendus = resolus({ portee: 'multi', filiales: [DEU, TLS] });
    const ouverte = await ouvrir('multi.grc', attendus);

    const relu = await relire(ouverte.jeton);
    assert.notEqual(relu.etat, null);
    const resolveur = new droits.ResolveurPerimetreSession(relu.etat);
    const rendu = await resolveur.resoudre();

    assert.deepEqual([...rendu.filiales].sort(), [DEU, TLS].sort());
    assert.equal(rendu.filialeId, DEU);
    assert.equal(rendu.perimetreGroupe, false);
    assert.equal(rendu.utilisateurId, 'multi.grc');
  });

  test('le jeton est une RÉFÉRENCE : altéré d’un caractère, il ne retrouve rien', async () => {
    const ouverte = await ouvrir('ref.tls', resolus({ portee: 'filiale', filiales: [TLS] }));

    const bon = await relire(ouverte.jeton);
    assert.notEqual(bon.etat, null, 'Le jeton intact retrouve bien sa session.');

    // Un caractère changé : si le jeton portait des revendications, il resterait
    // largement lisible. Comme il n'est qu'une clé, il ne désigne plus rien.
    const altere = `${ouverte.jeton.slice(0, -1)}${ouverte.jeton.slice(-1) === 'A' ? 'B' : 'A'}`;
    const mauvais = await relire(altere);
    assert.equal(mauvais.etat, null);
    assert.equal(mauvais.motif, 'inconnue');
    assert.equal(mauvais.sessionId, null, 'Rien n’est rendu, pas même l’existence d’une session.');
  });

  test('le jeton en clair n’est JAMAIS stocké : la base ne porte que son empreinte', async () => {
    const ouverte = await ouvrir('empreinte.tls', resolus({ portee: 'filiale', filiales: [TLS] }));
    const trouve = await base.valeur(
      applicatif,
      `select count(*)::int from sessions where jeton_empreinte = $1`,
      [ouverte.jeton],
    );
    assert.equal(trouve, 0, 'Une lecture de la base ne doit pas permettre d’usurper une session.');

    const parEmpreinte = await base.valeur(
      applicatif,
      `select count(*)::int from sessions where jeton_empreinte = $1`,
      [sessions.empreinteJeton(ouverte.jeton)],
    );
    assert.equal(parEmpreinte, 1);
  });
});

describe('E2 — le drapeau d’administration Groupe, sur ses quatre combinaisons', () => {
  const cas = [
    { nom: 'administrateur ET Groupe', administrateur: true, portee: 'groupe', attendu: true },
    { nom: 'administrateur SANS Groupe', administrateur: true, portee: 'filiale', attendu: false },
    { nom: 'Groupe SANS administrateur', administrateur: false, portee: 'groupe', attendu: false },
    { nom: 'ni l’un ni l’autre', administrateur: false, portee: 'filiale', attendu: false },
  ];

  for (const [index, c] of cas.entries()) {
    test(`${c.nom} → administrationGroupe = ${String(c.attendu)}`, async () => {
      const ouverte = await ouvrir(
        `e2.cas${String(index)}`,
        resolus({
          portee: c.portee,
          filiales: c.portee === 'groupe' ? [DEU, TLS] : [TLS],
          administrateur: c.administrateur,
        }),
      );
      // Relu depuis la BASE : la décision ne doit pas dépendre de ce que l'ouverture
      // avait en mémoire.
      const relu = await relire(ouverte.jeton);
      const resolveur = new droits.ResolveurPerimetreSession(relu.etat);
      const rendu = await resolveur.resoudre();
      assert.equal(rendu.administrationGroupe, c.attendu);
      assert.equal(rendu.perimetreGroupe, c.portee === 'groupe');
    });
  }

  test('MÉCANIQUE : aucun fichier de src/ ne pose le drapeau à « true » littéralement', () => {
    // Le contrôle que la porte S2 jouait déjà, étendu aux fichiers neufs. Il ne
    // remplace pas les essais ci-dessus : il attrape la ligne qu'on écrirait un jour
    // « juste pour déboguer », et que personne ne relirait.
    const fautifs = [];
    const parcourir = (repertoire) => {
      for (const entree of readdirSync(repertoire)) {
        const chemin = join(repertoire, entree);
        if (statSync(chemin).isDirectory()) {
          parcourir(chemin);
          continue;
        }
        if (!chemin.endsWith('.ts')) continue;
        const texte = readFileSync(chemin, 'utf8');
        // Une AFFECTATION littérale à vrai. La conjonction calculée du résolveur
        // (`etat.administrateur && …`) n'en est pas une, et c'est exactement la
        // distinction qui compte.
        if (/administrationGroupe\s*:\s*true/.test(texte)) fautifs.push(chemin);
      }
    };
    parcourir(join(RACINE_BACKEND, 'src'));
    assert.deepEqual(
      fautifs,
      [],
      'Une route vérifie un droit, elle ne se l’accorde pas (CONVENTIONS.md §17.4).',
    );
  });
});

describe('Les droits fins existent, et le défaut est fermé', () => {
  test('peut() répond sur les trente domaines, avec le niveau exact', async () => {
    const attendus = resolus({ portee: 'filiale', filiales: [TLS] });
    const ouverte = await ouvrir('fin.tls', attendus);
    const resolveur = new droits.ResolveurPerimetreSession((await relire(ouverte.jeton)).etat);

    assert.equal(resolveur.niveauSur('risques'), 'contribution');
    assert.equal(resolveur.peut('risques', 'lecture'), true);
    assert.equal(resolveur.peut('risques', 'contribution'), true);
    assert.equal(resolveur.peut('risques', 'validation'), false);

    // Un domaine jamais accordé : le défaut est « aucun », donc rien.
    assert.equal(resolveur.niveauSur('journal'), 'aucun');
    assert.equal(resolveur.peut('journal', 'lecture'), false);
  });

  test('le droit d’export ne se déduit ni du périmètre ni du niveau', async () => {
    const sansExport = await ouvrir(
      'exp.non',
      resolus({ portee: 'groupe', filiales: [DEU, TLS], administrateur: true }),
    );
    const r1 = new droits.ResolveurPerimetreSession((await relire(sansExport.jeton)).etat);
    assert.equal(
      r1.peutExporter(),
      false,
      'Groupe + administration ne donnent toujours pas l’export : c’est GRC-EXPORT (S7).',
    );

    const avecExport = await ouvrir(
      'exp.oui',
      resolus({ portee: 'filiale', filiales: [TLS], peutExporter: true }),
    );
    const r2 = new droits.ResolveurPerimetreSession((await relire(avecExport.jeton)).etat);
    assert.equal(r2.peutExporter(), true);
  });
});
