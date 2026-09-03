/**
 * entites-familles.test.mjs — le moteur est générique : encore faut-il le prouver
 * sur plus d'une entité.
 *
 * ── Le reproche, et ce qu'il vise ────────────────────────────────────────────
 *
 * `RAPPORT_S2` §5 : « L'entité `risques` … **Les vingt autres**, l'entité scindée
 * `mesures` comprise — celle qui porte M-1 et M-2 ». Un moteur piloté par un registre
 * et par le catalogue PostgreSQL a une qualité et un danger : ce qui marche pour une
 * entité marche pour toutes **tant que les entités se ressemblent**. Les défauts se
 * logent donc exactement là où elles ne se ressemblent pas.
 *
 * Ce fichier prend une entité par FAMILLE de différence, et non un échantillon au
 * hasard :
 *
 * | Famille | Entité retenue | Ce qu'elle a de particulier |
 * |---|---|---|
 * | ordinaire, niveau filiale | `clients` | rien — c'est le témoin |
 * | liaison n-n « identifiants » | `actifs` ↔ `risques` | une table de liaison sans `filiale_id` (§7) |
 * | liaison n-n « objets » | `actifs.dependances` | des attributs portés par le lien |
 * | **mixte** | `documents` | `filiale_id` nullable, colonne **engendrée**, socle Groupe |
 * | **scindée** | `mesures` | deux tables, deux versions, deux sens du mot « statut » (§16.2) |
 * | alias de champ | `revues` | `date` → `date_revue`, `inputs` → `donnees_entree` |
 * | colonne JSONB | `prestataires.supplyChain` | document figé (§6) |
 *
 * ── La couverture est RÉCLAMÉE, pas supposée ─────────────────────────────────
 *
 * Un dernier test balaie les **21 entités du registre** et vérifie que chacune se lit,
 * se décrit, et porte un préfixe d'identifiant. Sans lui, ce fichier resterait un
 * échantillon dont personne ne saurait dire ce qu'il laisse de côté — le reproche
 * exact que la porte a formulé.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh`.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { monterGreffon, monterServeurReel } from '../aide/serveur.mjs';

/** @type {Awaited<ReturnType<typeof ouvrirBaseEssai>>} */
let base;
let serveur;
/** Une session d'administration Groupe : le seul moyen d'écrire le socle commun. */
let administration;

/** Périmètre de lecture directe, pour vérifier en base ce que la route a écrit. */
const perimetreLecture = perimetre('temoin', FILIALE_A, [FILIALE_A]);

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  serveur = await monterServeurReel(base, { authentification: 'provisoire' });
  administration = await monterGreffon(base, {
    utilisateurId: 'administrateur-groupe',
    filialeId: FILIALE_A,
    filiales: [FILIALE_A, FILIALE_B],
    perimetreGroupe: true,
    administrationGroupe: true,
  });
});

after(async () => {
  await serveur?.fermer();
  await administration?.fermer();
  await base?.fermer();
});

/** Le jeu de données courant, tel que le navigateur le reçoit. */
async function donnees() {
  const reponse = await serveur.appeler('GET', '/api/donnees');
  assert.equal(reponse.statut, 200);
  return reponse.corps.data;
}

/** Un enregistrement du jeu courant. */
async function lire(entite, identifiant) {
  return (await donnees())[entite].find((e) => e.id === identifiant);
}

/* =====================================================================
 *  §1 — Les familles, une par une
 * ===================================================================== */

describe('Une entité par famille de différence', () => {
  test('ordinaire — « clients » : créer, modifier, supprimer, avec sa version', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/clients', {
      corps: { champs: { nom: 'Aéronautique du Sud', secteur: 'Aéronautique' } },
    });
    assert.equal(cree.statut, 201);
    const id = cree.corps.enregistrement.id;
    assert.match(id, /^CLI-/);

    const modifie = await serveur.appeler('PUT', `/api/entites/clients/${id}`, {
      corps: { version: 1, champs: { secteur: 'Défense' } },
    });
    assert.equal(modifie.corps.enregistrement.secteur, 'Défense');
    assert.equal(modifie.corps.enregistrement.nom, 'Aéronautique du Sud');

    assert.equal((await serveur.appeler('DELETE', `/api/entites/clients/${id}?version=2`)).statut, 200);
    assert.equal(await lire('clients', id), undefined);
  });

  test('liaison n-n « identifiants » — un actif porte ses risques, et le lien se retire', async () => {
    // La table `actif_risques` n'a pas de `filiale_id` : sa politique est sa seule
    // défense (§7). Ce que le moteur en fait doit donc être éprouvé, pas supposé.
    const cree = await serveur.appeler('POST', '/api/entites/actifs', {
      corps: { champs: { nom: 'Serveur de sauvegarde', risques_lies: ['RISK-A', 'RISK2-A'] } },
    });
    assert.equal(cree.statut, 201);
    const id = cree.corps.enregistrement.id;
    assert.deepEqual([...cree.corps.enregistrement.risques_lies].sort(), ['RISK-A', 'RISK2-A']);

    // Remplacement complet de la liaison : le lien retiré doit disparaître.
    const modifie = await serveur.appeler('PUT', `/api/entites/actifs/${id}`, {
      corps: { version: 1, champs: { risques_lies: ['RISK2-A'] } },
    });
    assert.deepEqual(modifie.corps.enregistrement.risques_lies, ['RISK2-A']);

    // Liste vide : la liaison se vide, elle ne « garde pas la dernière valeur ».
    const videe = await serveur.appeler('PUT', `/api/entites/actifs/${id}`, {
      corps: { version: 2, champs: { risques_lies: [] } },
    });
    assert.deepEqual(videe.corps.enregistrement.risques_lies, []);
  });

  test('liaison n-n « objets » — les dépendances d’un actif portent leur type', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/actifs', {
      corps: {
        champs: {
          nom: 'Baie de stockage',
          dependances: [{ to: 'ACTIF-A', type: 'dep' }, { to: 'ACTIF2-A', type: 'backup' }],
        },
      },
    });
    assert.equal(cree.statut, 201);
    const dependances = cree.corps.enregistrement.dependances;
    assert.equal(dependances.length, 2);
    assert.deepEqual(
      dependances.map((d) => `${d.to}/${d.type}`).sort(),
      ['ACTIF-A/dep', 'ACTIF2-A/backup'],
      'L’attribut porté par le lien doit survivre à l’aller-retour.',
    );
  });

  test('liaison n-n — un lien vers la filiale voisine est refusé, pas ignoré', async () => {
    // Le point que le §7 des conventions appelle « l'angle mort » : les clés
    // étrangères ne peuvent rien ici, seule la politique parle.
    const { statut } = await serveur.appeler('POST', '/api/entites/actifs', {
      corps: { champs: { nom: 'Actif douteux', risques_lies: ['RISK-B'] } },
    });
    assert.notEqual(statut, 201, 'Un lien Toulouse → Allemagne ne doit pas être créé.');

    // Et rien n'est resté derrière : l'opération est composite, donc tout ou rien.
    const restes = (await donnees()).actifs.filter((a) => a.nom === 'Actif douteux');
    assert.deepEqual(restes, []);
  });

  test('mixte — « documents » : le socle Groupe se lit de partout et ne s’écrit pas d’ici', async () => {
    const socle = await lire('documents', 'DOC-G');
    assert.equal(socle.titre, 'PSSI du groupe', 'Le socle est rendu au chargement.');

    const refus = await serveur.appeler('PUT', '/api/entites/documents/DOC-G', {
      corps: { version: socle._version, champs: { titre: 'PSSI réécrite par une filiale' } },
    });
    assert.equal(refus.statut, 403);
    assert.equal(refus.corps.code_grc, undefined);
    assert.match(refus.corps.message, /Groupe/);

    // Contrôle symétrique (§20.2) : une administration Groupe, elle, y arrive.
    const accepte = await administration.appeler('PUT', '/api/entites/documents/DOC-G', {
      corps: { version: socle._version, champs: { titre: 'PSSI du groupe — révision 2026' } },
    });
    assert.equal(accepte.statut, 200);
    assert.equal((await lire('documents', 'DOC-G')).titre, 'PSSI du groupe — révision 2026');
  });

  test('mixte — la colonne ENGENDRÉE ne se laisse ni écrire ni deviner (§18.6)', async () => {
    // `documents.portee_groupe` entre dans une clé étrangère et PostgreSQL refuse
    // qu'on lui donne une valeur : le moteur ne doit jamais la nommer, et un client
    // qui la propose doit être refusé au bord plutôt qu'ignoré.
    const propose = await serveur.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'Procédure', portee_groupe: true } },
    });
    assert.equal(propose.statut, 400);
    assert.match(propose.corps.message, /portee_groupe/);

    // Et la création ordinaire, elle, fonctionne — la colonne est calculée par la base.
    const cree = await serveur.appeler('POST', '/api/entites/documents', {
      corps: { champs: { titre: 'Procédure de sauvegarde', statut: 'brouillon' } },
    });
    assert.equal(cree.statut, 201);
  });

  test('scindée — « mesures » : deux tables, deux versions, un seul enregistrement', async () => {
    // Ce que le frontend voit est UNE entité ; le serveur en tient deux (§16.2).
    // Les deux compteurs de version sont rendus séparément, et c'est ce qui rend le
    // verrouillage optimiste possible des deux côtés.
    const locale = await lire('mesures', 'MESURE-A');
    assert.equal(locale.nom, 'Mesure locale', 'Champ du CATALOGUE.');
    assert.equal(locale.statut, '', 'Champ de la MISE EN ŒUVRE — un autre sens du mot « statut ».');
    assert.equal(typeof locale._version, 'number');
    assert.equal(typeof locale._versionMiseEnOeuvre, 'number');

    const evalue = await serveur.appeler('PUT', '/api/entites/mesures/MESURE-A', {
      corps: {
        version: locale._version,
        versionMiseEnOeuvre: locale._versionMiseEnOeuvre,
        champs: { statut: 'conforme', maturite: 4 },
      },
    });
    assert.equal(evalue.statut, 200);
    assert.equal(evalue.corps.enregistrement.statut, 'conforme');
    assert.equal(evalue.corps.enregistrement.maturite, 4);
    assert.equal(
      evalue.corps.enregistrement._version,
      locale._version,
      'Évaluer une mesure ne modifie pas la DÉFINITION du contrôle : sa version ne bouge pas.',
    );
    assert.equal(evalue.corps.enregistrement._versionMiseEnOeuvre, locale._versionMiseEnOeuvre + 1);
  });

  test('scindée — créer une mesure crée la définition ET sa mise en œuvre locale', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/mesures', {
      corps: { champs: { nom: 'Journalisation centralisée', statut: 'partiellement conforme', maturite: 2 } },
    });
    assert.equal(cree.statut, 201);
    assert.equal(cree.corps.enregistrement.statut, 'partiellement conforme');
    assert.equal(cree.corps.enregistrement._versionMiseEnOeuvre, 1);

    // Les colonnes RÉSERVÉES du catalogue (cycle de vie, référence, domaine) ne sont
    // pas modifiables depuis cette interface : le registre le dit, le bord le refuse.
    const reserve = await serveur.appeler('PUT', `/api/entites/mesures/${cree.corps.enregistrement.id}`, {
      corps: { version: 1, champs: { reference: 'ISO-A.8.15' } },
    });
    assert.equal(reserve.statut, 400);
  });

  test('alias — « revues » : les noms du navigateur ne sont pas ceux des colonnes', async () => {
    const cree = await serveur.appeler('POST', '/api/entites/revues', {
      corps: { champs: { date: '2026-06-15', inputs: 'Tableau de bord', outputs: 'Décisions' } },
    });
    assert.equal(cree.statut, 201);
    const rendu = cree.corps.enregistrement;
    assert.equal(rendu.date, '2026-06-15');
    assert.equal(rendu.inputs, 'Tableau de bord');
    assert.equal(rendu.outputs, 'Décisions');
    // Le nom de colonne ne remonte JAMAIS au navigateur : ce serait une seconde
    // convention, et un jour les deux divergeraient.
    assert.equal(Object.keys(rendu).includes('date_revue'), false);
    assert.equal(Object.keys(rendu).includes('donnees_entree'), false);

    // ⚠️ Observation, et non exigence : le nom de COLONNE est également accepté en
    // ENTRÉE (`date_revue` → 201). Le banc ne le juge pas — l'arbitrage appartient à
    // l'agent API — mais il le fige, pour que le jour où l'un des deux noms cesse
    // d'être admis, ce soit une décision et non une surprise.
    const parLaColonne = await serveur.appeler('POST', '/api/entites/revues', {
      corps: { champs: { date_revue: '2026-06-16' } },
    });
    assert.equal(parLaColonne.statut, 201);
    assert.equal(parLaColonne.corps.enregistrement.date, '2026-06-16', 'Rendu sous le nom du navigateur.');
  });

  test('le « non renseigné » du navigateur est accepté partout où il l’était (M-8)', async () => {
    // Constat M-8 : « le "non renseigné" du navigateur (chaîne vide) est refusé par
    // les énumérations du schéma ». Les deux conventions — la chaîne vide du modèle
    // navigateur, le NULL du schéma — ne se rencontraient nulle part, et le résultat
    // était le refus de l'enregistrement ENTIER.
    //
    // Le balayage porte sur les colonnes que l'auditeur a nommées, et il vérifie les
    // deux moitiés : l'écriture passe, ET la valeur devient NULL en base — sans quoi
    // une chaîne vide dans une colonne énumérée serait une bombe à retardement pour
    // le premier `check` ajouté plus tard.
    const cas = [
      ['prestataires', { societe: 'Sous-traitance SA', criticite: '', acces: '', type: '' }],
      ['traitements', { nom: 'Recrutement', base_legale: '', duree_conservation: '' }],
      ['actifs', { nom: 'Poste nomade', type: '', criticite: '' }],
      ['risques', { nom: 'Risque non coté', niveau: '' }],
    ];
    const echecs = [];
    for (const [entite, champs] of cas) {
      const reponse = await serveur.appeler('POST', `/api/entites/${entite}`, { corps: { champs } });
      if (reponse.statut !== 201) {
        echecs.push(`${entite} → ${reponse.statut} ${JSON.stringify(reponse.corps.message ?? '')}`);
      }
    }
    assert.deepEqual(echecs, [], 'Un formulaire laissé dans son état par défaut doit s’enregistrer.');

    // Et le vide est devenu NULL, pas une chaîne vide stockée.
    const stocke = await base.avecPerimetre(
      await base.connexion('app'),
      perimetreLecture,
      async (c) =>
        (await c.query("select criticite, acces from prestataires where societe = 'Sous-traitance SA'")).rows[0],
    );
    assert.deepEqual(stocke, { criticite: null, acces: null });
  });

  test('JSONB — « prestataires.supplyChain » : un document figé traverse sans être touché', async () => {
    const document = { criteres: ['ISO 27001', 'NIS2'], niveaux: { acces: 'limite' }, note: 3 };
    const cree = await serveur.appeler('POST', '/api/entites/prestataires', {
      corps: { champs: { societe: 'Infogérance du Sud', supplyChain: document } },
    });
    assert.equal(cree.statut, 201);
    assert.deepEqual(cree.corps.enregistrement.supplyChain, document);

    // Aller-retour : ce qui a été écrit est ce qui est relu, structure comprise.
    const relu = await lire('prestataires', cree.corps.enregistrement.id);
    assert.deepEqual(relu.supplyChain, document);
  });
});

/* =====================================================================
 *  §2 — La couverture, réclamée
 * ===================================================================== */

describe('Les 21 entités du registre, sans échantillonnage', () => {
  test('chaque entité du modèle est décrite, chargée, et porte un préfixe', async () => {
    const modele = (await serveur.appeler('GET', '/api/modele')).corps;
    const jeu = await donnees();
    const noms = Object.keys(modele.entites).sort();
    assert.equal(noms.length, 21);

    for (const nom of noms) {
      const description = modele.entites[nom];
      assert.match(description.prefixe, /^[A-Z][A-Z0-9]*$/, `${nom} : préfixe d’identifiant attendu.`);
      assert.ok(Object.keys(description.champs).length > 0, `${nom} : aucun champ décrit.`);
      assert.ok(Array.isArray(jeu[nom]), `${nom} : absente du jeu de données chargé.`);
    }
  });

  test('chaque entité se CRÉE par sa route, avec ses seuls champs obligatoires', async () => {
    // Le balayage qui manquait. Il ne prouve pas que chaque entité est complète — il
    // prouve que le chemin d'écriture générique fonctionne pour toutes, ce qui est
    // exactement ce qu'un moteur piloté par registre doit garantir.
    //
    // Les valeurs minimales viennent du modèle rendu par l'API : `obligatoire: true`.
    // Aucune liste n'est recopiée ici (§19.5) ; les quelques entités dont la création
    // exige une référence à une autre entité sont renseignées par le jeu d'essai.
    const modele = (await serveur.appeler('GET', '/api/modele')).corps;
    const references = {
      tests_pra: { scenario_id: 'SCEN-A' },
      evaluations: { ref_id: 'anssi', code: 'BALAYAGE-1' },
      history: { date: '2026-12-25' },
      mappings: { theme: 'Balayage' },
      referentiels_actifs: { ref_id: 'anssi', origine: 'ajout_local' },
    };

    const echecs = [];
    for (const [nom, description] of Object.entries(modele.entites)) {
      const champs = { ...(references[nom] ?? {}) };
      for (const [champ, forme] of Object.entries(description.champs)) {
        if (!forme.obligatoire || champs[champ] !== undefined) continue;
        champs[champ] =
          forme.type === 'entier' || forme.type === 'nombre'
            ? 1
            : forme.type === 'booleen'
              ? false
              : forme.type === 'date'
                ? '2026-12-24'
                : forme.type === 'json'
                  ? {}
                  : `Balayage ${nom}`;
      }
      // `mappings` est de NIVEAU GROUPE (CONVENTIONS.md §16.4) : sa création est
      // réservée à une administration Groupe depuis le correctif du constat M-4 de
      // la porte S2. Le balayage passe donc par la session qui en a le droit — et le
      // test suivant réclame que la session de filiale, elle, soit refusée.
      const appelant = nom === 'mappings' ? administration : serveur;
      const reponse = await appelant.appeler('POST', `/api/entites/${nom}`, { corps: { champs } });
      if (reponse.statut !== 201) {
        echecs.push(`${nom} → ${reponse.statut} ${JSON.stringify(reponse.corps.message ?? reponse.corps)}`);
      }
    }
    assert.deepEqual(echecs, [], 'Chaque entité doit être créable par la route générique.');
  });

  test('« mappings » est de niveau Groupe : une filiale ne le réécrit pas (constat M-4)', async () => {
    // La correspondance ANSSI↔ISO↔NIS2↔DORA est une référence COMMUNE aux vingt
    // filiales. La porte S2 a montré qu'une session de filiale pouvait y créer,
    // modifier et supprimer — « une action de filiale modifie, pour vingt filiales,
    // une référence commune, sans droit à produire et sans journal pour l'attribuer ».
    const depuisLaFiliale = await serveur.appeler('POST', '/api/entites/mappings', {
      corps: { champs: { theme: 'forgé depuis une filiale' } },
    });
    assert.equal(depuisLaFiliale.statut, 403);
    assert.equal(depuisLaFiliale.corps.code_grc, undefined);

    // Contrôle symétrique : l'administration Groupe, elle, y a droit — sans quoi ce
    // test serait satisfait par une base où plus personne ne peut tenir le catalogue.
    const depuisLeGroupe = await administration.appeler('POST', '/api/entites/mappings', {
      corps: { champs: { theme: 'Chiffrement des données au repos' } },
    });
    assert.equal(depuisLeGroupe.statut, 201);

    // Et la suppression suit la même règle. Le code exact du refus appartient à
    // l'agent API (403 « hors périmètre » ou 400 « entrée refusée ») ; ce que le banc
    // exige, c'est que la ligne SURVIVE à la tentative — c'est cela, le constat M-4.
    const identifiant = depuisLeGroupe.corps.enregistrement.id;
    const refuse = await serveur.appeler('DELETE', `/api/entites/mappings/${identifiant}?version=1`);
    assert.notEqual(refuse.statut, 200, 'Une filiale ne supprime pas une référence commune.');
    const survivants = (await donnees()).mappings.filter((m) => m.id === identifiant);
    assert.equal(survivants.length, 1, 'La correspondance doit être intacte après le refus.');

    assert.equal(
      (await administration.appeler('DELETE', `/api/entites/mappings/${identifiant}?version=1`)).statut,
      200,
    );
  });

  test('LE BALAYAGE MORD : une entité inconnue du registre n’est pas créable', async () => {
    // Contrôle de morsure du balayage : s'il acceptait n'importe quel nom, le test
    // précédent ne prouverait rien de la couverture — seulement que POST répond.
    const { statut } = await serveur.appeler('POST', '/api/entites/filiales', { corps: { champs: { code: 'X' } } });
    assert.equal(statut, 400, '« filiales » n’est pas au registre : la route doit refuser.');
  });
});
