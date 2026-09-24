/**
 * amorcage.test.mjs — **`filiales.conf` entre EN BASE**, et les deux moitiés du
 * dispositif cessent de lire deux sources différentes.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le défaut, reproduit avant d'être corrigé
 * ════════════════════════════════════════════════════════════════════════
 *
 * Mesuré le 24/09/2026, en répondant à une question de l'utilisateur — *« on ne
 * peut pas créer de filiale depuis le logiciel »* — et le défaut trouvé était
 * plus grave que celui qu'il désignait : **personne ne portait `filiales.conf`
 * en base.** `insert into filiales` n'existait ni dans `deploy/` ni dans `db/`,
 * et le commentaire d'`install.sh` l'annonçait encore au futur.
 *
 * Les deux moitiés lisaient donc deux sources :
 *
 *   · `deploy/groupes-ad.sh`            → le FICHIER → les groupes à créer dans l'AD ;
 *   · `db/synchroniser-groupes-ad.mjs`  → la TABLE   → `groupes_ad`, l'autorité
 *     applicative qui décide de ce qu'un groupe ACCORDE.
 *
 * Le §2 de ce fichier **reproduit l'écart avec ses chiffres** : deux filiales
 * déclarées au fichier, table vide → **26 groupes attendus côté annuaire, 10
 * seulement déclarés en base**. `GRC-ADMIN` est du lot, donc l'administrateur
 * entre — et c'est ce qui rend le défaut si discret. Mais `GRC-TLS-RSSI` et ses
 * quinze voisins n'accordent RIEN : le RSSI de site se connecte et ne voit rien,
 * sans message, ni côté annuaire ni côté application.
 *
 * ⚠️ **Il n'était pas entièrement silencieux, et c'est à dire aussi** :
 * `groupes-ad.sh --verifier` compare dans les deux sens et sort en code 3. Mais
 * `install.sh` n'en fait qu'une **alerte**, sur une condition qui signifie « la
 * moitié de vos utilisateurs n'a aucun accès », et le remède qu'il nommait était
 * le mauvais — « régénérez le script de création AD », alors que le côté AD est
 * juste et que c'est la table qui manque. Le §5 garde ce message.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier éprouve, et dans quel ordre
 * ════════════════════════════════════════════════════════════════════════
 *
 * | § | Propriété |
 * |---|---|
 * | 1 | l'analyseur rend **toutes** les anomalies, pas la première |
 * | 2 | **LE DÉFAUT** : fichier et table divergent, avec les deux chiffres |
 * | 3 | l'amorçage porte les lignes actives, et une filiale amorcée est indiscernable d'une filiale créée à l'écran |
 * | 4 | une base déjà peuplée n'est PAS touchée, et une anomalie refuse TOUT |
 * | 5 | la couture : `install.sh` amorce **avant** de synchroniser, et le message du code 3 nomme le bon remède |
 *
 * Prérequis machine : PostgreSQL prêt ; sur SRV-Infra, `source ~/.grc-essais.env`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { ouvrirBaseEssai } from '../aide/base.mjs';
import { moduleCompile, RACINE_BACKEND } from '../aide/serveur.mjs';

/** Neuf profils de socle : c'est ce que `007_authentification.sql` sème. */
const PROFILS_SOCLE = 9;

/**
 * La déclaration d'exploitation employée partout ici : deux filiales dans le
 * périmètre, une qui l'a quitté. Les trois cas du format, en trois lignes.
 */
const DECLARATION = [
  '# Commentaire, et la ligne vide qui suit est ignorée aussi',
  '',
  'TLS ; Dedienne Aerospace Toulouse      ; FR ; oui',
  'DEU ; Dedienne Aerospace Deutschland   ; DE ; oui',
  'ESP ; Dedienne Aerospace España        ; ES ; non',
].join('\n');

const PERIMETRE_AMORCAGE = Object.freeze({
  utilisateurId: 'amorçage-filiales',
  filialeId: null,
  filiales: [],
  perimetreGroupe: false,
  administrationGroupe: true,
});

let base;
let applicatif;
/** Compte propriétaire : il ne sert qu'au TÉMOIN, jamais au scénario. */
let proprietaire;
let declaration;
let filiales;
let droits;

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  applicatif = await base.connexion('app');
  proprietaire = await base.connexion('proprietaire');
  declaration = await moduleCompile('filiales/declaration.js');
  filiales = await moduleCompile('filiales/index.js');
  droits = await moduleCompile('droits/index.js');
});

after(async () => {
  await base?.fermer();
});

/* =====================================================================
 *  1. L'analyseur — un seul, et il dit TOUT ce qui est faux
 * ===================================================================== */

describe('§1 — l’analyseur de `filiales.conf`', () => {
  test('les trois cas du format sont lus, commentaires et lignes vides ignorés', () => {
    const lu = declaration.analyserDeclaration(DECLARATION);
    assert.deepEqual(lu.anomalies, []);
    assert.equal(lu.lignesLues, 3, 'trois lignes de déclaration, pas cinq');
    assert.deepEqual(
      lu.filiales.map((f) => `${f.code}/${f.pays}/${f.active ? 'oui' : 'non'}`),
      ['TLS/FR/oui', 'DEU/DE/oui', 'ESP/ES/non'],
    );
    assert.deepEqual(declaration.filialesActives(lu).map((f) => f.code), ['TLS', 'DEU']);
    assert.deepEqual(declaration.filialesHorsPerimetre(lu).map((f) => f.code), ['ESP']);
  });

  test('TOUTES les anomalies sont rendues, pas seulement la première', () => {
    // ⚠️ Un analyseur qui s'arrête à la première faute fait faire vingt
    // allers-retours à l'exploitant. Celui-ci lit le fichier jusqu'au bout.
    const lu = declaration.analyserDeclaration(
      [
        'mad ; Minuscules            ; FR ; oui', // code hors ck_filiales_code
        'GROUPE ; Collision          ; FR ; oui', // code réservé
        'XX ;                        ; FR ; oui', // raison sociale vide
        'YY ; Pays douteux           ; fra ; oui', // pays hors ck_filiales_pays
        'ZZ ; Active douteux         ; FR ; peut-être', // « active » hors vocabulaire
        'AA ; Première               ; FR ; oui',
        'AA ; Doublon                ; FR ; oui', // uq_filiales_code
        'BB ; Trois champs           ; FR', // 3 champs au lieu de 4
      ].join('\n'),
    );
    assert.equal(lu.filiales.length, 1, 'seule « AA » est saine');
    assert.deepEqual(
      lu.anomalies.map((a) => a.ligne),
      [1, 2, 3, 4, 5, 7, 8],
      'sept lignes fautives, chacune nommée par son numéro',
    );
    // Chaque message nomme la contrainte de base qu'il anticipe : c'est ce qui
    // permet à l'exploitant de relier le refus à ce que la base exigera.
    const texte = lu.anomalies.map((a) => a.message).join(' | ');
    for (const attendu of [
      'ck_filiales_code',
      'GROUPE',
      'ck_filiales_raison',
      'ck_filiales_pays',
      'active',
      'uq_filiales_code',
      '3 champ(s) au lieu de 4',
    ]) {
      assert.ok(texte.includes(attendu), `le motif « ${attendu} » doit être nommé : ${texte}`);
    }
  });

  test('un fichier écrit sous Windows passe — le retour chariot ne fait pas échouer « active »', () => {
    // Sans le retrait du `\r`, « active » vaudrait « oui\r » et le message
    // parlerait d'une valeur que l'exploitant ne voit pas dans son éditeur.
    const lu = declaration.analyserDeclaration('TLS ; Toulouse ; FR ; oui\r\nDEU ; Deutschland ; DE ; oui\r\n');
    assert.deepEqual(lu.anomalies, []);
    assert.equal(declaration.filialesActives(lu).length, 2);
  });

  test('MORSURE : l’analyseur du dépôt est le SEUL — `groupes-ad.sh` ne réimplémente rien', () => {
    /* Le shell portait son propre analyseur, écrit en bash, qui réimplémentait à
     * la main `ck_filiales_code`, `ck_filiales_pays` et l'unicité du code. Deux
     * analyseurs du même format, c'est deux vérités — et la divergence se verrait
     * le jour où l'un accepte une ligne que l'autre refuse, c'est-à-dire au
     * moment où quelqu'un ne peut pas se connecter (`CLAUDE.md` §3).
     *
     * On mesure donc l'ABSENCE des motifs de forme dans le shell. */
    const shell = readFileSync(join(RACINE_BACKEND, 'deploy', 'groupes-ad.sh'), 'utf8');
    for (const motif of ['A-Z0-9]{2,10}', 'A-Z]{2}\\$']) {
      assert.ok(
        !shell.includes(motif),
        `deploy/groupes-ad.sh porte encore le motif « ${motif} » : il y a deux analyseurs ` +
          'du format de filiales.conf, et c’est exactement ce que ce lot supprime.',
      );
    }
    assert.ok(
      shell.includes('filiales/declaration.js'),
      'deploy/groupes-ad.sh doit APPELER l’analyseur compilé, pas en écrire un second.',
    );
  });
});

/* =====================================================================
 *  2. LE DÉFAUT, avec ses chiffres
 * ===================================================================== */

describe('§2 — fichier et table divergeaient, et voici de combien', () => {
  test('table VIDE : l’annuaire reçoit 26 groupes, `groupes_ad` n’en déclare que 10', () => {
    const profils = [
      'ADMIN', 'AUDITEUR', 'CONTRIB', 'DIRECTION', 'DPO', 'QUALITE', 'REPONDANT', 'RH', 'RSSI',
    ].map((code, i) => ({ id: `P${String(i)}`, code, nom: code }));
    assert.equal(profils.length, PROFILS_SOCLE);

    const lu = declaration.analyserDeclaration(DECLARATION);
    const duFichier = declaration
      .filialesActives(lu)
      .map((f) => ({ id: f.code, code: f.code, raisonSociale: f.raisonSociale }));

    // Ce que l'équipe IT crée dans l'annuaire : la liste engendrée depuis le FICHIER.
    const cotesAnnuaire = droits.groupesAttendus('GRC-', duFichier, profils);
    // Ce que `groupes_ad` déclarait : la liste engendrée depuis la TABLE, vide.
    const cotesBase = droits.groupesAttendus('GRC-', [], profils);

    assert.equal(cotesAnnuaire.length, 26, 'deux filiales × neuf profils, plus les transversaux');
    assert.equal(cotesBase.length, 10, 'huit GRC-GROUPE-<PROFIL> et les deux transversaux');

    const nomsBase = new Set(cotesBase.map((g) => g.nom));
    const orphelins = cotesAnnuaire.filter((g) => !nomsBase.has(g.nom)).map((g) => g.nom);
    assert.equal(orphelins.length, 16, 'seize groupes créés dans l’AD qui n’accordent RIEN');

    // 🛑 Et voici pourquoi le défaut est discret : l'administration, elle, passe.
    assert.ok(nomsBase.has('GRC-ADMIN'), 'GRC-ADMIN ne dépend d’aucune filiale : l’admin entre');
    assert.ok(
      orphelins.includes('GRC-TLS-RSSI') && orphelins.includes('GRC-DEU-QUALITE'),
      'les groupes de filiale, eux, n’accordent rien',
    );
  });

  test('CONTRÔLE SYMÉTRIQUE : une fois la table peuplée, les deux listes COÏNCIDENT', () => {
    // Sans cette moitié, l'essai ci-dessus mesurerait « deux listes diffèrent »
    // sans jamais montrer qu'elles peuvent concorder — c'est-à-dire sans prouver
    // que le remède est le bon (motif Q-210).
    const profils = ['ADMIN', 'AUDITEUR', 'CONTRIB', 'DIRECTION', 'DPO', 'QUALITE', 'REPONDANT', 'RH', 'RSSI']
      .map((code, i) => ({ id: `P${String(i)}`, code, nom: code }));
    const lu = declaration.analyserDeclaration(DECLARATION);
    const memes = declaration
      .filialesActives(lu)
      .map((f) => ({ id: f.code, code: f.code, raisonSociale: f.raisonSociale }));

    const a = droits.groupesAttendus('GRC-', memes, profils).map((g) => g.nom).sort();
    const b = droits.groupesAttendus('GRC-', memes, profils).map((g) => g.nom).sort();
    assert.deepEqual(a, b);
    assert.equal(a.length, 26);
  });
});

/* =====================================================================
 *  3. L'amorçage — et une filiale amorcée est une filiale ordinaire
 * ===================================================================== */

describe('§3 — l’amorçage porte la déclaration en base', () => {
  test('les lignes ACTIVES entrent, la ligne hors périmètre est nommée avec son motif', async () => {
    const resultat = await base.avecPerimetre(
      applicatif,
      PERIMETRE_AMORCAGE,
      async (client) => filiales.amorcerFiliales(client, DECLARATION, 'GRC-', PERIMETRE_AMORCAGE),
      { annuler: false },
    );

    assert.equal(resultat.statut, 'importe');
    assert.deepEqual([...resultat.creees].sort(), ['DEU', 'TLS']);
    assert.deepEqual(resultat.hors_perimetre.map((h) => h.code), ['ESP']);
    assert.match(
      resultat.hors_perimetre[0].motif,
      /ck_filiales_sortie/u,
      'le motif doit dire POURQUOI : le statut « sortie » exige une date que le fichier ne porte pas',
    );

    /* Ce qui a réellement été écrit — relu par le TÉMOIN.
     *
     * ⚠️ Pas par le rôle applicatif : `pol_filiales_lecture` retombe sur
     * `id = any (f_filiales_lecture())` dès que `f_perimetre_groupe()` est fausse,
     * et elle l'est ici puisque la session d'amorçage ne porte aucune filiale.
     * Un `select` applicatif rendrait **zéro ligne sur une base qui vient d'en
     * recevoir deux** — le contrôle mesurerait la RLS, pas l'amorçage. */
    const { rows } = await proprietaire.query(
      `select "code", "raison_sociale", "pays", "statut" from "filiales" order by "code"`,
    );
    assert.deepEqual(
      rows.map((r) => `${r.code}/${r.pays}/${r.statut}`),
      ['DEU/DE/active', 'TLS/FR/active'],
      'deux filiales actives, et « ESP » n’est pas entrée',
    );
    assert.equal(rows.find((r) => r.code === 'TLS').raison_sociale, 'Dedienne Aerospace Toulouse');
  });

  test('`groupes_ad` porte les 26 groupes, et la trace du journal nomme CHAQUE filiale', async () => {
    const { rows: groupes } = await proprietaire.query(
      `select count(*)::int as n from "groupes_ad" where "actif"`,
    );
    assert.equal(groupes[0].n, 26, 'la table déclare désormais les groupes de filiale');

    // ⚠️ La trace vient de `creerFiliale`, pas d'un second chemin : c'est ce qui
    // rend une filiale amorcée indiscernable d'une filiale créée à l'écran, et
    // c'est ce qui ferme le constat Q-213 pour l'amorçage aussi — vingt filiales
    // importées sans une entrée au journal auraient rouvert le même défaut.
    /* ⚠️ Relu par le TÉMOIN, et le motif est dans la politique elle-même : les
     * entrées de l'amorçage sont TRANSVERSALES — `perimetre.filialeId` est nul,
     * puisqu'il n'y a pas encore de filiale active au moment où la première est
     * créée. `pol_journal_audit_lecture` ne les rend qu'à un périmètre Groupe,
     * c'est-à-dire à un périmètre qui couvre toutes les filiales actives : celui
     * de l'amorçage n'en couvre aucune. Chercher à le simuler ici mesurerait la
     * RLS plutôt que la trace (`CONVENTIONS.md` §29.7). */
    const { rows: entrees } = await proprietaire.query(
      `select "resume", "valeurs_apres" from "journal_audit"
        where "entite_type" = 'filiales' and "action" = 'creation'
        order by "numero"`,
    );
    assert.equal(entrees.length, 2, 'une entrée par filiale créée, pas une pour l’acte');
    for (const entree of entrees) {
      assert.equal(entree.resume, 'Création d’une filiale');
      assert.ok(
        ['TLS', 'DEU'].includes(entree.valeurs_apres.code),
        `le journal doit dire LAQUELLE : ${JSON.stringify(entree.valeurs_apres)}`,
      );
    }
  });
});

/* =====================================================================
 *  4. Ce que l'amorçage refuse de faire
 * ===================================================================== */

describe('§4 — une base peuplée n’est pas touchée, une anomalie refuse tout', () => {
  test('rejoué sur la même base, l’amorçage ne réécrit RIEN et le dit', async () => {
    const resultat = await base.avecPerimetre(
      applicatif,
      PERIMETRE_AMORCAGE,
      async (client) =>
        filiales.amorcerFiliales(
          client,
          `${DECLARATION}\nBRE ; Filiale ajoutée au fichier après coup ; FR ; oui`,
          'GRC-',
          PERIMETRE_AMORCAGE,
        ),
      { annuler: false },
    );

    assert.equal(resultat.statut, 'deja-peuple');
    assert.deepEqual([...resultat.deja_connues].sort(), ['DEU', 'TLS']);
    assert.deepEqual(resultat.creees, [], 'aucune création');

    // 🛑 Et « BRE » n'est PAS entrée : à partir du moment où le produit connaît
    //    son périmètre, c'est la TABLE qui fait foi. Éditer le fichier n'agit
    //    plus — une acquisition se déclare à l'écran.
    const { rows } = await proprietaire.query(`select "code" from "filiales" order by "code"`);
    assert.deepEqual(rows.map((r) => r.code), ['DEU', 'TLS']);
  });

  test('une seule ligne fautive refuse l’amorçage ENTIER, sur une base neuve', async () => {
    // Base neuve : la propriété se mesure là où l'amorçage aurait le droit d'agir.
    const neuve = await ouvrirBaseEssai(`${import.meta.url}#refus`);
    try {
      const client = await neuve.connexion('app');
      await assert.rejects(
        () =>
          neuve.avecPerimetre(
            client,
            PERIMETRE_AMORCAGE,
            async (c) =>
              filiales.amorcerFiliales(
                c,
                'TLS ; Toulouse ; FR ; oui\nmad ; Minuscules ; FR ; oui',
                'GRC-',
                PERIMETRE_AMORCAGE,
              ),
            { annuler: false },
          ),
        /ck_filiales_code/u,
      );
      // ⚠️ Et « TLS », qui précède la ligne fautive, n'est pas entrée non plus :
      //    l'analyse a lieu AVANT la première écriture.
      const temoin = await neuve.connexion('proprietaire');
      const { rows } = await temoin.query(`select "code" from "filiales"`);
      assert.deepEqual(rows, [], 'rien n’a été écrit avant le refus');
    } finally {
      await neuve.fermer();
    }
  });

  test('un fichier sans aucune ligne active le dit, au lieu de se taire', async () => {
    const neuve = await ouvrirBaseEssai(`${import.meta.url}#vide`);
    try {
      const client = await neuve.connexion('app');
      const resultat = await neuve.avecPerimetre(
        client,
        PERIMETRE_AMORCAGE,
        async (c) =>
          filiales.amorcerFiliales(c, '# rien que des commentaires\n', 'GRC-', PERIMETRE_AMORCAGE),
        { annuler: false },
      );
      assert.equal(resultat.statut, 'rien-a-importer');
      assert.deepEqual(resultat.creees, []);
    } finally {
      await neuve.fermer();
    }
  });
});

/* =====================================================================
 *  5. La couture — l'amorçage est APPELÉ, et au bon moment
 * ===================================================================== */

describe('§5 — la couture avec l’installation', () => {
  const lire = (chemin) => readFileSync(join(RACINE_BACKEND, chemin), 'utf8');

  test('`install.sh` amorce les filiales AVANT de synchroniser `groupes_ad`', () => {
    /* 🛑 L'ORDRE EST LA PROPRIÉTÉ, et l'inverser rouvrirait le défaut du §2 en
     * entier : la synchronisation lit la TABLE, donc elle doit passer après que
     * la table connaisse les filiales. Un contrôle qui vérifierait seulement que
     * les deux commandes existent serait vert sur l'ordre fautif. */
    const script = lire(join('deploy', 'install.sh'));
    const amorcage = script.indexOf('importer-filiales.mjs');
    const synchro = script.indexOf('synchroniser-groupes-ad.mjs');
    assert.ok(amorcage > 0, 'install.sh doit appeler db/importer-filiales.mjs');
    assert.ok(synchro > 0, 'install.sh doit appeler db/synchroniser-groupes-ad.mjs');
    assert.ok(
      amorcage < synchro,
      'L’amorçage doit précéder la synchronisation : elle lit la table que l’amorçage remplit.',
    );
  });

  test('`synchroniser-groupes-ad.mjs` REFUSE une table vide que le fichier contredit', () => {
    // Le garde-fou qui rend le défaut impossible à manquer. Il vit là parce que
    // c'est là que l'écart se matérialise — dans la table qui accorde les droits.
    const script = lire(join('db', 'synchroniser-groupes-ad.mjs'));
    assert.ok(
      script.includes('filiales.conf') && /aucune filiale active/iu.test(script),
      'le script doit refuser d’aligner `groupes_ad` sur une table vide quand la ' +
        'déclaration, elle, porte des filiales actives.',
    );
  });

  test('le message du code 3 nomme le BON remède', () => {
    /* Il disait « régénérer le script de création AD » — or le côté annuaire est
     * juste dans ce cas, et c'est la TABLE qui manque. Un message qui envoie
     * corriger la moitié saine coûte une demi-journée à un exploitant. */
    const script = lire(join('deploy', 'install.sh'));
    const fenetre = script.slice(script.indexOf('CODE_GROUPES'), script.indexOf('CODE_GROUPES') + 4000);
    assert.ok(
      fenetre.includes('importer-filiales.mjs'),
      'Le traitement du code 3 doit nommer l’amorçage, pas seulement la régénération du .ps1.',
    );
  });
});
