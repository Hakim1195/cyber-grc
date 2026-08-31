/**
 * update-zero.test.mjs — « zéro ligne affectée » a TROIS causes, et une seule est GRC03.
 *
 * ── Le piège, tel qu'il a été signalé ────────────────────────────────────────
 *
 * `CONVENTIONS.md` §15 définit `GRC03` — « modifié entre-temps, rechargez » — comme
 * « 0 ligne sur `update … and version = $2` ». Le quatrième passage de la porte S1
 * (constat **Q-7**) a montré que ce zéro vaut aussi pour deux autres situations :
 *
 *   1. **La version est périmée** — quelqu'un a écrit avant nous. C'est GRC03.
 *   2. **La ligne n'existe pas** — identifiant inconnu, ou déjà supprimée.
 *   3. **L'écriture est refusée par la RLS** — la ligne existe, elle est même
 *      PARFAITEMENT LISIBLE d'un périmètre Groupe, mais elle appartient à une autre
 *      filiale que la filiale active, et la politique de modification ne porte que sur
 *      celle-ci (`004_rls.sql` §3 : `using (filiale_id = f_filiale_ecriture())`).
 *
 * Le rapport le dit sans détour : « **la couche d'écriture de L2 annoncera "modifié
 * entre-temps, rechargez" à un utilisateur qui n'avait tout simplement pas le droit
 * d'écrire.** À traiter dans la conception de L2, pas après. »
 *
 * Le message est absurde pour l'utilisateur — il rechargera, retrouvera exactement la
 * même version, réessaiera, échouera encore — et il est trompeur pour l'exploitant : un
 * refus de droit se présente comme un incident de concurrence, donc ne remonte nulle
 * part.
 *
 * ── Ce que ce fichier fige ───────────────────────────────────────────────────
 *
 * La couche d'écriture ne conclut JAMAIS d'un `rowCount` nul. Elle exécute une **sonde
 * de diagnostic**, et l'ordre de ses verdicts n'est pas indifférent :
 *
 *   ligne non lisible          → INTROUVABLE   (confondu à dessein avec l'absence — S12)
 *   ligne lisible, non écrivable → REFUS_ECRITURE
 *   ligne lisible, écrivable, version différente → CONFLIT (GRC03)
 *
 * Deux points méritent d'être défendus, parce qu'ils se discutent :
 *
 *  - **« introuvable » et « hors périmètre » rendent le MÊME verdict, volontairement.**
 *    Les distinguer ferait de l'API un oracle d'existence : « cet identifiant existe
 *    ailleurs dans le groupe » est une information, et le contrôle S12 dit qu'on n'en
 *    donne pas. La distinction a sa place dans le journal technique du serveur, pas
 *    dans la réponse.
 *  - **La sonde interroge `f_filiale_ecriture()`, la fonction que la POLITIQUE
 *    elle-même appelle**, plutôt qu'une comparaison réécrite dans le serveur. Une
 *    réécriture serait une seconde source de vérité, qui dériverait le jour où la
 *    politique changerait — la pathologie du §17.5 (« lire le texte d'une politique ne
 *    dit pas son sens »).
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  erreurAttendue,
  FILIALE_A,
  FILIALE_B,
  ouvrirBaseEssai,
  perimetre,
  semerJeuEssai,
} from '../aide/base.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
/** Compte applicatif : c'est le seul dont parlent les questions de ce fichier. */
let applicatif;

/** RSSI de site : ne lit et n'écrit que Toulouse. */
const site = perimetre('rssi-site', FILIALE_A, [FILIALE_A]);
/** RSSI groupe : LIT les deux filiales, mais n'écrit que dans la filiale ACTIVE (Toulouse). */
const groupe = perimetre('rssi-groupe', FILIALE_A, [FILIALE_A, FILIALE_B]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  await semerJeuEssai(base, applicatif);
});

after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  La sonde de diagnostic — ce que L2 doit exécuter après un rowCount nul
 * ===================================================================== */

/** Les quatre verdicts possibles. Trois sont rendus au client, le quatrième est un bogue. */
const INTROUVABLE = 'INTROUVABLE_OU_HORS_PERIMETRE';
const REFUS = 'REFUS_ECRITURE';
const CONFLIT = 'CONFLIT_DE_VERSION';
const INCOHERENT = 'ZERO_INEXPLIQUE';

/**
 * Diagnostique un `update` resté sans effet, dans la transaction où il a eu lieu.
 *
 * La forme retenue est **une seule instruction** : l'écriture et la sonde partagent
 * alors le même instantané, et aucune écriture concurrente ne peut se glisser entre les
 * deux pour rendre le verdict faux. Le test « la sonde en deux temps se fait doubler »
 * plus bas montre ce que coûte la forme naïve.
 *
 * @param {import('pg').Client} c connexion, transaction déjà ouverte et périmètre posé
 * @param {string} table table de niveau filiale (les tables mixtes ont leur variante)
 * @param {string} id identifiant métier visé
 * @param {number} version version que le client a lue, et transmise
 * @param {string} valeur nouvelle valeur de la colonne `nom`
 */
async function ecrireEtDiagnostiquer(c, table, id, version, valeur) {
  const resultat = await c.query(
    `with maj as (
         update ${table} set nom = $3 where id = $1 and version = $2 returning 1
     )
     select (select count(*)::int from maj)                as ecrites,
            (select version from ${table} where id = $1)   as version_en_base,
            (select filiale_id = f_filiale_ecriture()
               from ${table} where id = $1)                as ecrivable`,
    [id, version, valeur],
  );
  const { ecrites, version_en_base: enBase, ecrivable } = resultat.rows[0];
  if (ecrites === 1) return { ecrites, verdict: null };
  // L'ordre compte, et c'est tout l'enjeu : un refus de droit prime sur un conflit de
  // version. Les deux peuvent être vrais en même temps, et annoncer « rechargez » à
  // quelqu'un qui n'a pas le droit d'écrire est précisément le défaut Q-7.
  if (enBase === null) return { ecrites, verdict: INTROUVABLE };
  if (ecrivable !== true) return { ecrites, verdict: REFUS };
  if (enBase !== version) return { ecrites, verdict: CONFLIT };
  return { ecrites, verdict: INCOHERENT };
}

/** Ouvre une transaction, y joue `travail`, et annule : chaque test repart du même état. */
const dans = (p, travail) => base.avecPerimetre(applicatif, p, travail);

/* =====================================================================
 *  Les trois causes, une par test
 * ===================================================================== */

describe('« UPDATE 0 » : trois causes, trois verdicts (constat Q-7 de la porte S1)', () => {
  test('cause 1 — la version est périmée : c’est un conflit, et c’est GRC03', async () => {
    const vu = await dans(site, async (c) => {
      const version = (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version;
      // Quelqu'un a écrit entre le chargement de la fiche et l'enregistrement.
      await c.query("update risques set description = 'écriture d’un tiers' where id = 'RISK-A' and version = $1", [version]);
      return ecrireEtDiagnostiquer(c, 'risques', 'RISK-A', version, 'ma version à moi');
    });
    assert.equal(vu.ecrites, 0);
    assert.equal(vu.verdict, CONFLIT, 'La ligne est là, elle est écrivable : seule la version a bougé.');
  });

  test('cause 2 — la ligne n’existe pas : rien à recharger', async () => {
    const vu = await dans(site, (c) => ecrireEtDiagnostiquer(c, 'risques', 'RISK-INCONNU', 1, 'peu importe'));
    assert.equal(vu.ecrites, 0);
    assert.equal(vu.verdict, INTROUVABLE);
  });

  test('cause 3 — l’écriture est refusée par la RLS, sur une ligne PARFAITEMENT LISIBLE', async () => {
    // Le cas exact de Q-7, et le seul des trois qu'un développeur ne soupçonne pas :
    // le RSSI groupe LIT la ligne allemande (elle est dans son périmètre de lecture),
    // il voit sa version, il peut la citer — et il ne peut pas l'écrire, parce qu'il
    // n'écrit que dans sa filiale ACTIVE.
    const vu = await dans(groupe, async (c) => {
      const ligne = (await c.query("select version from risques where id = 'RISK-B'")).rows[0];
      assert.ok(ligne, 'La ligne doit être LISIBLE : sans cela, ce test se confondrait avec la cause 2.');
      return ecrireEtDiagnostiquer(c, 'risques', 'RISK-B', ligne.version, 'écriture hors filiale active');
    });
    assert.equal(vu.ecrites, 0);
    assert.equal(vu.verdict, REFUS, 'Ce n’est pas « rechargez » : c’est « vous n’écrivez pas ici ».');
  });

  test('cause 3 bis — hors périmètre de LECTURE, le refus se confond avec l’absence, à dessein', async () => {
    // Même ligne, vue d'un RSSI de site : elle n'est pas lisible. Le verdict est
    // volontairement celui de la cause 2 — contrôle S12, « les erreurs ne renseignent
    // pas l'attaquant ». La réponse ne doit pas apprendre que RISK-B existe ailleurs.
    const vu = await dans(site, (c) => ecrireEtDiagnostiquer(c, 'risques', 'RISK-B', 1, 'depuis Toulouse'));
    assert.equal(vu.ecrites, 0);
    assert.equal(vu.verdict, INTROUVABLE);

    const inexistante = await dans(site, (c) => ecrireEtDiagnostiquer(c, 'risques', 'RISK-NEXISTE-PAS', 1, 'x'));
    assert.deepEqual(
      vu,
      inexistante,
      'Une ligne cachée et une ligne absente doivent être INDISCERNABLES du client.',
    );
  });
});

/* =====================================================================
 *  Ce que le zéro seul ne dit pas
 * ===================================================================== */

describe('Le zéro, à lui seul, ne distingue rien', () => {
  test('LE ZÉRO MORD : les quatre situations rendent exactement « rowCount = 0 »', async () => {
    // Contrôle de morsure du fichier entier. Si ce test venait à échouer — si une des
    // quatre situations se mettait à lever une erreur ou à affecter une ligne — alors
    // la sonde ne serait plus nécessaire pour ce cas-là, et il faudrait le dire. Tant
    // qu'il passe, il démontre que « rowCount === 0 → GRC03 » est FAUX trois fois sur
    // quatre.
    const zeros = await dans(groupe, async (c) => {
      const versionA = (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version;
      const versionB = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
      const compter = async (id, version) =>
        (await c.query('update risques set nom = $3 where id = $1 and version = $2', [id, version, 'tentative'])).rowCount;
      return {
        versionPerimee: await compter('RISK-A', versionA + 41),
        ligneAbsente: await compter('RISK-INCONNU', 1),
        rlsRefuseEcriture: await compter('RISK-B', versionB),
        rlsCacheLaLigne: await compter('DOC-G', 1),
      };
    });
    assert.deepEqual(zeros, {
      versionPerimee: 0,
      ligneAbsente: 0,
      rlsRefuseEcriture: 0,
      rlsCacheLaLigne: 0,
    });
  });

  test('LA SONDE NAÏVE MORD : ne regarder que la version rend le verdict Q-7 mot pour mot', async () => {
    // Contrôle de morsure de la sonde. On retire d'elle la seule chose qui la distingue
    // d'un test de version — l'interrogation de `f_filiale_ecriture()` — et l'on
    // retrouve exactement le défaut annoncé par le rapport : « modifié entre-temps »
    // servi à quelqu'un qui n'avait pas le droit d'écrire.
    const verdictNaif = await dans(groupe, async (c) => {
      const version = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
      const ecrites = (await c.query(
        'update risques set nom = $3 where id = $1 and version = $2',
        ['RISK-B', version, 'écriture hors filiale active'],
      )).rowCount;
      if (ecrites === 1) return 'ECRITE';
      const enBase = (await c.query("select version from risques where id = 'RISK-B'")).rows[0]?.version ?? null;
      return enBase === null ? INTROUVABLE : CONFLIT; // ← la sonde amputée : pas de test d'écrivabilité
    });
    assert.equal(verdictNaif, CONFLIT, 'C’est le défaut, reproduit : un refus de droit déguisé en conflit.');

    // Et la sonde complète, sur la même situation, dit autre chose.
    const verdictComplet = await dans(groupe, async (c) => {
      const version = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
      return (await ecrireEtDiagnostiquer(c, 'risques', 'RISK-B', version, 'écriture hors filiale active')).verdict;
    });
    assert.equal(verdictComplet, REFUS);
    assert.notEqual(verdictComplet, verdictNaif, 'Les deux causes ne doivent pas rendre le même code.');
  });

  test('quand les DEUX sont vrais, le refus de droit prime sur le conflit', async () => {
    // Situation réelle : la fiche allemande a été modifiée depuis, ET le RSSI groupe
    // n'a pas le droit de l'écrire. Annoncer « rechargez » ferait recharger pour rien ;
    // le message utile est celui du droit.
    const verdict = await dans(groupe, async (c) => {
      const version = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
      return (await ecrireEtDiagnostiquer(c, 'risques', 'RISK-B', version - 1, 'les deux à la fois')).verdict;
    });
    assert.equal(verdict, REFUS);
  });

  test('la sonde en DEUX TEMPS se fait doubler : le diagnostic doit tenir en une instruction', async () => {
    // Pourquoi `ecrireEtDiagnostiquer` tient en une seule instruction. En deux temps,
    // une écriture concurrente validée entre l'« update » et la sonde change le verdict :
    // le refus de droit se déguise en conflit de version, et l'on revient au défaut Q-7
    // par un autre chemin.
    const voisin = await base.nouvelleConnexion('app');
    try {
      const verdict = await dans(groupe, async (c) => {
        const version = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
        const ecrites = (await c.query(
          'update risques set nom = $3 where id = $1 and version = $2',
          ['RISK-B', version, 'écriture hors filiale active'],
        )).rowCount;
        assert.equal(ecrites, 0);

        // L'Allemagne, elle, a parfaitement le droit d'écrire sa propre ligne.
        await base.avecPerimetre(
          voisin,
          perimetre('rssi-allemagne', FILIALE_B, [FILIALE_B]),
          async (v) => {
            await v.query("update risques set description = 'travail allemand' where id = 'RISK-B' and version = $1", [version]);
          },
          { annuler: false },
        );

        const enBase = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
        return enBase === version ? REFUS : CONFLIT;
      });
      assert.equal(verdict, CONFLIT, 'La sonde différée a changé d’avis : elle n’est pas fiable.');
    } finally {
      await voisin.end().catch(() => {});
    }
  });
});

/* =====================================================================
 *  Les zéros qui n'en sont pas — ce qui, au contraire, fait du bruit
 * ===================================================================== */

describe('Tout refus n’est pas silencieux : ce qui lève, et ce qu’il faut en faire', () => {
  test('déplacer une ligne vers une autre filiale est refusé BRUYAMMENT (42501)', async () => {
    // Le « with check » de la politique de modification, lui, lève. Une couche
    // d'écriture qui ne traite que le zéro laisserait cette erreur remonter telle
    // quelle jusqu'au navigateur — avec le nom de la politique et celui de la table.
    const erreur = await erreurAttendue(
      dans(site, async (c) => {
        const version = (await c.query("select version from risques where id = 'RISK-A'")).rows[0].version;
        await c.query('update risques set filiale_id = $3 where id = $1 and version = $2', ['RISK-A', version, FILIALE_B]);
      }),
    );
    assert.equal(erreur.code, '42501');
    assert.match(erreur.message, /row-level security/i);
  });

  test('périmètre non posé : GRC04, une erreur — surtout pas un zéro silencieux', async () => {
    // Défaut de programmation, pas erreur d'utilisateur : la transaction n'a pas
    // déclaré son périmètre. Il doit être IMPOSSIBLE de le confondre avec un conflit.
    const vierge = await base.nouvelleConnexion('app');
    try {
      await vierge.query('begin');
      const erreur = await erreurAttendue(
        vierge.query("update risques set nom = 'sans périmètre' where id = 'RISK-A' and version = 1"),
      );
      assert.equal(erreur.code, 'GRC04');
      await vierge.query('rollback');
    } finally {
      await vierge.end().catch(() => {});
    }
  });

  test('la SUPPRESSION porte exactement le même piège, et appelle la même sonde', async () => {
    // `delete … where id = $1 and version = $2` rend zéro pour les mêmes trois causes.
    // Le rappeler ici évite qu'une couche traite l'un et oublie l'autre.
    const vu = await dans(groupe, async (c) => {
      const version = (await c.query("select version from risques where id = 'RISK-B'")).rows[0].version;
      const supprimees = (await c.query('delete from risques where id = $1 and version = $2', ['RISK-B', version])).rowCount;
      const ligne = (await c.query(
        "select version, filiale_id = f_filiale_ecriture() as ecrivable from risques where id = 'RISK-B'",
      )).rows[0];
      return { supprimees, ecrivable: ligne.ecrivable, toujoursLa: ligne.version === version };
    });
    assert.deepEqual(vu, { supprimees: 0, ecrivable: false, toujoursLa: true });
  });
});

/* =====================================================================
 *  Les tables mixtes : une quatrième situation, du même zéro
 * ===================================================================== */

describe('Tables mixtes : administrer le socle Groupe sans l’avoir déclaré (§17.4)', () => {
  test('modifier une ligne de portée Groupe sans « administration_groupe » rend zéro, pas GRC03', async () => {
    // La politique des tables mixtes est un `case` : une ligne à `filiale_id` nul n'est
    // écrivable que si la transaction s'est déclarée en administration Groupe. Sans
    // cette déclaration, l'écriture ne lève rien — elle ne fait rien. Une couche qui
    // conclut « GRC03 » enverra l'administrateur recharger une PSSI que personne n'a
    // touchée.
    const vu = await dans(groupe, async (c) => {
      const ligne = (await c.query("select version from documents where id = 'DOC-G'")).rows[0];
      const ecrites = (await c.query(
        'update documents set titre = $3 where id = $1 and version = $2',
        ['DOC-G', ligne.version, 'PSSI modifiée sans déclaration'],
      )).rowCount;
      const sonde = (await c.query(
        `select version,
                case when filiale_id is null then f_administration_groupe()
                     else filiale_id = f_filiale_ecriture() end as ecrivable
           from documents where id = 'DOC-G'`,
      )).rows[0];
      return { ecrites, version: sonde.version, ecrivable: sonde.ecrivable };
    });
    assert.equal(vu.ecrites, 0);
    assert.equal(vu.ecrivable, false, 'La sonde des tables mixtes interroge f_administration_groupe().');
  });

  test('la même écriture passe dès que la transaction se déclare en administration Groupe', async () => {
    // Contrôle symétrique (§20.2) : un garde-fou qui restreint doit aussi montrer que
    // ce qui doit rester permis l'est. Sans ce test, le précédent serait satisfait par
    // une base où PERSONNE ne peut plus administrer le socle.
    const administrateur = perimetre('rssi-groupe', FILIALE_A, [FILIALE_A, FILIALE_B], true);
    const ecrites = await dans(administrateur, async (c) => {
      const ligne = (await c.query("select version from documents where id = 'DOC-G'")).rows[0];
      return (await c.query(
        'update documents set titre = $3 where id = $1 and version = $2',
        ['DOC-G', ligne.version, 'PSSI du groupe — révision 2026'],
      )).rowCount;
    });
    assert.equal(ecrites, 1);
  });
});
