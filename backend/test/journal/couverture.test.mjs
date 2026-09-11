/**
 * couverture.test.mjs — **la couverture du journal d'audit se MESURE en base.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cet essai mesure, et pourquoi il ne se lit pas dans le code
 * ════════════════════════════════════════════════════════════════════════
 *
 * Au 04/09/2026, la porte S3 a mesuré sur la recette : **4 actions émises sur
 * les 20 déclarées** par `ck_journal_audit_action`, 160 entrées, toutes venues
 * de `src/auth/`. Le constat qui compte n'est pas « il manque des appels » — on
 * l'aurait lu dans le code — mais *« un journal inaltérable et incomplet prouve
 * moins qu'il n'en a l'air »*. L'inaltérabilité était éprouvée ; la couverture,
 * non.
 *
 * Cet essai **exerce le produit**, puis compte ce qui est arrivé dans
 * `journal_audit`. Il ne lit aucune ligne de `src/`.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Deux découvertes, et zéro liste écrite à la main
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §24 et `CLAUDE.md` §3 : une liste dont l'omission fait
 * *réussir quelque chose en silence* est le mauvais outil. Ici, deux listes
 * seraient exactement cela — et elles sont donc **découvertes** :
 *
 *  1. **Les vingt actions déclarées** sont lues dans `pg_catalog`, par
 *     `pg_get_constraintdef` sur `ck_journal_audit_action`. Une action ajoutée
 *     au schéma demain entre dans le décompte sans que personne y pense ; une
 *     action retirée disparaît de même.
 *  2. **Les entités à exercer** sont lues dans `GET /api/modele`, avec leurs
 *     champs obligatoires et leurs types. Une vingt-deuxième entité ajoutée
 *     demain est créée, modifiée et supprimée par cette boucle sans qu'on
 *     touche à ce fichier — et si son chemin d'écriture oublie de journaliser,
 *     l'essai rougit **en la nommant**.
 *
 * ⚠️ **L'essai refuse de passer s'il n'a pas assez exercé.** C'est le garde-fou
 * qui manque le plus souvent : une boucle de découverte qui ne trouve rien rend
 * vert en n'éprouvant rien. Les planchers du §5 sont donc des assertions, pas
 * des commentaires — et ils sont écrits sous ce que la machine produit
 * réellement, pour ne pas devenir un essai intermittent (constat Q-64).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qui est hors de ce fichier, et où c'est
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Action | Où |
 * |---|---|
 * | les cinq de la connexion | `src/auth/`, déjà émises — `test/auth/` les éprouve |
 * | `consultation_sensible`, `verification_journal` | routes de lecture du journal, agent **J2** |
 * | `purge`, `archivage` | procédure d'exploitation (`CONVENTIONS.md` §12) — hors L5 |
 * | `approbation` | lot **L8** · `analyse_antivirus` : lot **L6** |
 *
 * ⚠️ **Toute lecture du journal déclare un périmètre** (`CONVENTIONS.md` §29.7).
 * La politique de lecture est cloisonnée depuis `008_journal_lecture.sql` : un
 * `select` sans périmètre ne rend plus rien, et une entrée à `filiale_id` nul —
 * démarrage du service, échec de connexion — n'est lue que par un périmètre
 * **Groupe**. Toutes les lectures de ce fichier passent donc par
 * `PERIMETRE_LECTEUR`, qui couvre les deux filiales du jeu d'essai.
 *
 * Prérequis machine : `bash db/dev/preparer_base_dev.sh` (et, sur SRV-Infra,
 * `source ~/.grc-essais.env` — les rôles y portent les secrets de l'installation).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { FILIALE_A, FILIALE_B, ouvrirBaseEssai, perimetre, semerJeuEssai } from '../aide/base.mjs';
import { lancerServeurProcessus, monterGreffon } from '../aide/serveur.mjs';

/* =====================================================================
 *  Le banc
 * ===================================================================== */

/**
 * Périmètre de LECTURE du journal : les deux filiales du jeu d'essai, donc
 * « toutes les filiales actives », donc `f_perimetre_groupe()` vrai. C'est ce
 * qui rend visibles les entrées transversales (`filiale_id` nul) que la
 * politique de `008_journal_lecture.sql` réserve au Groupe.
 */
const PERIMETRE_LECTEUR = perimetre('verificateur', FILIALE_A, [FILIALE_A, FILIALE_B]);

/**
 * Session du banc dont on choisit les droits. Même forme que celle de
 * `test/api/droits-application.test.mjs` — `resoudre()` sans argument,
 * `authentifier()` qui ne lit rien de la requête (contrôle S2).
 */
class SessionDeBanc {
  constructor(perimetreSession, droits) {
    this.provisoire = true;
    this._perimetre = Object.freeze({ ...perimetreSession });
    this._droits = Object.freeze({ ...droits });
  }

  async resoudre() {
    return this._perimetre;
  }

  async authentifier() {
    return { perimetre: this._perimetre, droits: this._droits, identite: null };
  }

  decrire() {
    return 'session du banc d’essai (test/journal/couverture.test.mjs)';
  }
}

let base;
let serveur;
/** Connexion SQL directe : elle LIT le journal, elle n'écrit jamais le scénario. */
let temoin;
/** Dernier numéro de la chaîne avant que le scénario ne commence. */
let depart = 0;
/** Ce que le scénario a réellement exercé — le plancher porte là-dessus. */
const exerce = { entites: [], creations: 0, modifications: 0, suppressions: 0, routes: new Set() };

before(async () => {
  base = await ouvrirBaseEssai(import.meta.url);
  await semerJeuEssai(base, await base.connexion('app'));
  temoin = await base.nouvelleConnexion('app');
});

after(async () => {
  await serveur?.fermer();
  await temoin?.end().catch(() => {});
  await base?.fermer();
});

/* =====================================================================
 *  Lecture du journal — toujours sous périmètre (§29.7)
 * ===================================================================== */

async function lireJournal(sql, parametres = []) {
  return await base.avecPerimetre(temoin, PERIMETRE_LECTEUR, async (client) => {
    const { rows } = await client.query(sql, parametres);
    return rows;
  });
}

/** Les entrées écrites depuis le début du scénario, dans l'ordre de la chaîne. */
async function entreesDuScenario(conditionSql = '', parametres = []) {
  return await lireJournal(
    `select numero, action, filiale_id, utilisateur_libelle, adresse_ip, entite_type, entite_id,
            resume, valeurs_avant, valeurs_apres
       from journal_audit
      where numero > $1 ${conditionSql}
      order by numero`,
    [depart, ...parametres],
  );
}

/* =====================================================================
 *  Découverte 1 — les actions DÉCLARÉES, lues dans pg_catalog
 * ===================================================================== */

/**
 * Les valeurs admises par `ck_journal_audit_action`, extraites de la définition
 * que PostgreSQL rend. Aucune n'est recopiée ici : le jour où le schéma en
 * ajoute une, elle entre dans le dénominateur toute seule.
 */
async function actionsDeclarees() {
  const { rows } = await temoin.query(
    `select pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
      where t.relname = 'journal_audit' and c.conname = 'ck_journal_audit_action'`,
  );
  assert.equal(rows.length, 1, 'La contrainte ck_journal_audit_action doit exister.');
  const valeurs = [...rows[0].definition.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(
    valeurs.length >= 15,
    `Définition de contrainte illisible : ${rows[0].definition}. ` +
      "L'essai doit DÉCOUVRIR les actions, pas se rabattre sur une liste.",
  );
  return new Set(valeurs);
}

/* =====================================================================
 *  Découverte 2 — les entités, et une charge minimale par entité
 * ===================================================================== */

/**
 * Fabrique une valeur plausible pour un champ obligatoire, d'après son type.
 *
 * Elle ne sait pas satisfaire une clé étrangère : une entité dont un champ
 * obligatoire vise une autre entité (`tests_pra.scenario_id`) verra sa création
 * refusée, et l'essai la comptera comme **non exercée** au lieu de la taire.
 * C'est voulu : mieux vaut un plancher honnête qu'une liste d'exceptions.
 */
function valeurPour(champ, description) {
  switch (description.type) {
    case 'entier':
    case 'nombre':
      return 1;
    case 'booleen':
      return false;
    case 'date':
      return '2026-09-04';
    case 'horodatage':
      return '2026-09-04T08:00:00.000Z';
    case 'json':
      return {};
    default:
      // `ref_id` est un identifiant de référentiel du catalogue statique ;
      // « anssi » est celui que le jeu d'essai emploie déjà.
      return champ === 'ref_id' ? 'anssi' : `Essai J1 ${champ}`;
  }
}

function chargeMinimale(modele) {
  const champs = {};
  for (const [champ, description] of Object.entries(modele.champs)) {
    if (description.obligatoire) champs[champ] = valeurPour(champ, description);
  }
  return champs;
}

/** Un champ texte modifiable, pour éprouver le différentiel d'une modification. */
function champTexteModifiable(modele) {
  for (const [champ, description] of Object.entries(modele.champs)) {
    if (description.type === 'texte' && description.obligatoire) return champ;
  }
  for (const [champ, description] of Object.entries(modele.champs)) {
    if (description.type === 'texte') return champ;
  }
  return null;
}

/* =====================================================================
 *  §1 — Le scénario : on exerce le produit, en processus RÉEL
 * ===================================================================== */

describe('Le produit est exercé, puis le journal est compté', () => {
  test('démarrage, écritures, export, reprise, propagation, arrêt', async (t) => {
    // ── Le point de départ de la mesure ────────────────────────────────
    // Le jeu d'essai partagé sème lui-même deux entrées `export` : sans ce
    // repère, l'essai compterait la couverture du SEMEUR pour la sienne.
    const [{ max }] = await lireJournal('select coalesce(max(numero), 0) as max from journal_audit');
    depart = Number(max);

    // ── `demarrage` : il faut un VRAI processus ─────────────────────────
    // L'entrée est écrite par `demarrer()`, que seul un lancement direct
    // atteint : un serveur monté en mémoire par `construireServeur` ne passe
    // jamais par là. Et c'est bien la propriété qu'on veut — « le journal doit
    // pouvoir montrer un trou de service » (§29.2).
    serveur = await lancerServeurProcessus(base, { authentification: 'provisoire' });
    const appeler = async (methode, chemin, corps) => {
      const reponse = await fetch(`${serveur.url}${chemin}`, {
        method: methode,
        ...(corps === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      const texte = await reponse.text();
      let charge = texte;
      try {
        charge = JSON.parse(texte);
      } catch {
        /* réponse non JSON : le test verra le texte brut */
      }
      return { statut: reponse.status, corps: charge };
    };

    // ── La boucle de découverte : créer, modifier, supprimer, par entité ─
    const modele = (await appeler('GET', '/api/modele')).corps;
    assert.ok(
      Object.keys(modele.entites).length >= 20,
      `Modèle inattendu : ${String(Object.keys(modele.entites).length)} entité(s).`,
    );

    for (const [entite, description] of Object.entries(modele.entites)) {
      const creation = await appeler('POST', `/api/entites/${entite}`, {
        champs: chargeMinimale(description),
      });
      if (creation.statut !== 201) {
        // Clé étrangère non satisfiable, portée Groupe réservée, unicité
        // métier : l'entité n'est pas exercée, et le plancher du §5 en tient
        // compte. On le DIT plutôt que de l'ignorer.
        t.diagnostic(`entité non exercée : ${entite} → ${String(creation.statut)}`);
        continue;
      }
      const cree = creation.corps.enregistrement;
      exerce.creations += 1;

      const champ = champTexteModifiable(description);
      let version = cree._version;
      if (champ !== null) {
        const modification = await appeler('PUT', `/api/entites/${entite}/${cree.id}`, {
          version,
          ...(cree._versionMiseEnOeuvre == null
            ? {}
            : { versionMiseEnOeuvre: cree._versionMiseEnOeuvre }),
          champs: { [champ]: 'Valeur modifiée par l’essai de couverture' },
        });
        if (modification.statut === 200) {
          exerce.modifications += 1;
          version = modification.corps.enregistrement._version;
        } else {
          t.diagnostic(`modification refusée : ${entite} → ${String(modification.statut)}`);
        }
      }

      const suppression = await appeler(
        'DELETE',
        `/api/entites/${entite}/${cree.id}?version=${String(version)}`,
      );
      if (suppression.statut === 200) exerce.suppressions += 1;
      else t.diagnostic(`suppression refusée : ${entite} → ${String(suppression.statut)}`);

      exerce.entites.push(entite);
    }

    // ── La propagation, opération composite ────────────────────────────
    const propagation = await appeler('POST', '/api/operations/propager-mesure', {
      mesureId: 'MESURE-A',
    });
    assert.equal(propagation.statut, 200, JSON.stringify(propagation.corps).slice(0, 400));
    exerce.routes.add('POST /api/operations/propager-mesure');

    // ── `export` : la moitié restante du constat Q-89 ───────────────────
    const exportation = await appeler('GET', '/api/export');
    assert.equal(exportation.statut, 200, JSON.stringify(exportation.corps).slice(0, 400));
    exerce.routes.add('GET /api/export');

    // ── `import` et `administration` : la reprise du fichier qu'on vient
    //    d'exporter. C'est le geste réel — l'export d'une filiale se reprend.
    const reprise = await appeler('POST', '/api/reprise', {
      mode: 'fusionner',
      fichier: { nom: 'essai-couverture.json', contenu: JSON.stringify(exportation.corps) },
    });
    assert.equal(reprise.statut, 200, JSON.stringify(reprise.corps).slice(0, 400));
    exerce.routes.add('POST /api/reprise');

    // ── Un APERÇU n'écrit rien, donc ne trace rien : la trace suit la
    //    transaction, et l'aperçu annule la sienne (§29.3, règle 1).
    const apercu = await appeler('POST', '/api/reprise', {
      mode: 'fusionner',
      apercu: true,
      fichier: { nom: 'apercu.json', contenu: JSON.stringify(exportation.corps) },
    });
    assert.equal(apercu.statut, 200, JSON.stringify(apercu.corps).slice(0, 400));

    // ── `arret` : SIGTERM, arrêt propre, dernier maillon du segment ─────
    await serveur.fermer();
    serveur = null;
  });

  /* -------------------------------------------------------------------
   *  §2 — Le refus de droit : une session VALIDE à qui le droit manque
   * ------------------------------------------------------------------- */
  test('un refus de droit laisse une trace — et seulement celui d’une session valide', async () => {
    const session = new SessionDeBanc(
      { ...PERIMETRE_LECTEUR, utilisateurId: 'lectrice.seule', perimetreGroupe: true },
      { niveau: 'lecture', domaines: ['pilotage', 'conformite'], export: false },
    );
    const greffon = await monterGreffon(base, session._perimetre, { resolveur: session });
    try {
      // Une écriture refusée par le NIVEAU, et un export refusé par le DROIT
      // d'export : deux refus de nature différente, tous deux post-authentification.
      const ecriture = await greffon.appeler('POST', '/api/entites/risques', {
        corps: { champs: { nom: 'Tentative sans droit' } },
      });
      assert.equal(ecriture.statut, 403, JSON.stringify(ecriture.corps));

      const extraction = await greffon.appeler('GET', '/api/export');
      assert.equal(extraction.statut, 403, JSON.stringify(extraction.corps));
      exerce.routes.add('refus de droit');

      /* ══ CONSTAT **Q-209** DE LA PORTE S8 — l'autre moitié de la question ══
       *
       * Cet essai vérifiait que le REFUS d'export est tracé. Il ne demandait
       * jamais ce que fait le **succès** de l'autre route qui rend le même
       * contenu : `GET /api/donnees` appelle la même fonction avec les mêmes
       * arguments, ne demande pas le droit d'export — c'est la route de
       * chargement de l'application, l'exiger empêcherait tout lecteur
       * d'ouvrir le produit — et ne laissait **aucune trace**.
       *
       * Mesuré par l'auditeur, par la route réelle : `/api/export` → 403
       * journalisé ; `/api/donnees` → 200 avec 25 collections, et le journal
       * muet. Un `curl` suivi d'un `jq` produisait un `grc-backup` valide.
       * La lettre du contrôle S7 passait ; son intention non.
       *
       * Ce qui est éprouvé ici est donc la trace, pas la barrière : la
       * question « qui a extrait le jeu de données complet ? » doit avoir une
       * réponse **pour les deux chemins**. */
      const avantChargement = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Chargement du jeu%'",
      );
      const chargement = await greffon.appeler('GET', '/api/donnees');
      assert.equal(
        chargement.statut,
        200,
        'La route de chargement doit rester ouverte à un lecteur : c’est par elle que ' +
          `l’application s’ouvre. ${JSON.stringify(chargement.corps)}`,
      );
      // LA MATIÈRE : elle rend bien le jeu complet, sinon tracer ne prouve rien.
      assert.ok(
        Object.keys(chargement.corps.data ?? {}).length >= 5,
        `Le chargement rend ${String(Object.keys(chargement.corps.data ?? {}).length)} ` +
          'collection(s) : trop peu pour que la trace ait un objet.',
      );
      const apresChargement = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Chargement du jeu%'",
      );
      assert.equal(
        apresChargement.length,
        avantChargement.length + 1,
        'Une extraction complète du jeu de données doit laisser UNE trace, même quand elle ' +
          'passe par la route de chargement plutôt que par `/api/export`. Sans elle, le ' +
          'droit d’export ne protège pas ce qu’il prétend protéger, et un auditeur ' +
          'ISO 27001 n’a pas de réponse à sa première question.',
      );
      exerce.routes.add('chargement du jeu de données');

      /* ══ Q-302 — LE JEU D'UNE PETITE FILIALE NE SORT PLUS SANS TRACE ═══
       *
       * L'échappée que Q-279 avait nommée — « paginer en fenêtres étroites » —
       * a été mesurée INATTEIGNABLE par l'auditeur du 8ᵉ passage : `rafraichir`
       * n'a pas de borne supérieure. **L'échappée réelle n'était nommée nulle
       * part** : il suffit que la filiale soit petite. Dix-huit lignes sont le
       * jeu entier d'une filiale qui vient d'être acquise, et dix-huit est sous
       * le seuil de vingt-cinq — donc zéro trace, pour un compte dont
       * `GET /api/export` rend 403.
       *
       * Le cumul par appelant referme cela : plusieurs sondages qui rendent
       * chacun peu, mais BEAUCOUP en tout, finissent par être nommés.
       *
       * ⚠️ On sème ici moins que le seuil, et on sonde DEUX FOIS. Chaque
       * sondage reste « ordinaire » ; leur somme ne l'est pas.
       *
       * ⚠️ **Ce paragraphe vient AVANT celui de Q-279, et l'ordre est
       * normatif** : le cumul est un état qui vit dans le serveur, et le semis
       * de trente lignes du paragraphe suivant le pousse d'emblée au-delà du
       * premier palier. Mesurer le cumul après lui ne mesurerait plus rien. */
      const avantCumul = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Extraction du jeu%'",
      );
      const marqueur = `q302-${String(Date.now())}`;
      // La fenêtre est prise AVANT le semis : on ne fait sortir que ces douze
      // lignes-là, sans quoi c'est le volume d'un seul appel qu'on mesurerait —
      // l'ancien discriminant, et non le cumul.
      const fenetre = new Date().toISOString();
      await base.avecPerimetre(
        await base.connexion('app'),
        session._perimetre,
        async (c) => {
          for (let i = 0; i < 15; i += 1) {
            await c.query(
              `insert into "mesure_catalogue" ("id", "filiale_id", "nom", "cree_par")
               values ($1, $2, $3, $4)`,
              [`MES-${marqueur}-${String(i)}`, FILIALE_A, `Cumul Q-302 ${String(i)}`, 'lectrice.seule'],
            );
          }
        },
        { annuler: false },
      );

      const premier = await greffon.appeler(
        'GET',
        `/api/rafraichir?depuis=${encodeURIComponent(fenetre)}`,
      );
      assert.equal(premier.statut, 200, JSON.stringify(premier.corps));
      const sortiesPremier = Object.values(premier.corps.modifications ?? {}).reduce(
        (n, l) => n + l.length,
        0,
      );
      // LA MATIÈRE : chaque sondage doit rester SOUS le seuil, sans quoi c'est
      // l'ancien discriminant qu'on mesurerait.
      assert.ok(
        sortiesPremier > 0 && sortiesPremier < 25 && sortiesPremier * 2 >= 25,
        `Ce contrôle exige un sondage « ordinaire » dont DEUX dépassent le seuil : ` +
          `${String(sortiesPremier)} ligne(s) sorties. Au-delà du seuil, c’est le volume d’un ` +
          'seul appel qui tracerait ; en deçà de la moitié, deux sondages ne le franchiraient ' +
          'pas et le contrôle passerait au vert sans rien mesurer.',
      );

      const second = await greffon.appeler(
        'GET',
        `/api/rafraichir?depuis=${encodeURIComponent(fenetre)}`,
      );
      assert.equal(second.statut, 200, JSON.stringify(second.corps));

      const apresCumul = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Extraction du jeu%'",
      );
      const cumulees = apresCumul
        .slice(avantCumul.length)
        .filter((e) => e.valeurs_apres.motif === 'cumul_par_session');
      assert.equal(
        cumulees.length,
        1,
        'Deux sondages « ordinaires » dont la SOMME dépasse le seuil doivent laisser UNE ' +
          'trace de cumul. Sans elle, le jeu complet d’une petite filiale sort sans trace ' +
          'pour un compte dont le droit d’export est refusé — et la condition d’échappement ' +
          'est « la filiale est récente » (constat Q-302). ' +
          `Rendu : ${JSON.stringify(apresCumul.slice(avantCumul.length).map((e) => e.valeurs_apres.motif))}`,
      );
      assert.ok(
        cumulees[0].valeurs_apres.cumul >= 25,
        'L’entrée doit porter le CUMUL, c’est-à-dire le chiffre qui justifie la trace.',
      );

      /* ══ Q-279 — LE VOLUME REND, PAS LA FENÊTRE DEMANDÉE ═══════════════
       *
       * Le 7ᵉ passage de la porte S8 a mesuré, à travers Apache, avec un
       * compte dont `GET /api/export` rend **403** :
       *
       *     GET /api/rafraichir?depuis=<maintenant − 11 h 30>
       *       → 200, la même charge que `/api/donnees`, **delta de journal = 0**
       *
       * La ligne du registre qui avait fermé **Q-242** affirmait que la borne
       * « ne se contourne pas en avançant `depuis` ». La mesure l'a démentie :
       * `rafraichir` n'a pas de borne SUPÉRIEURE — un `depuis` sous le seuil
       * n'est pas une fenêtre étroite, c'est **toute la traîne**.
       *
       * ⚠️ **Ce paragraphe éprouve le nouveau discriminant : ce qui SORT.**
       * La fenêtre demandée est délibérément **récente** — hors de portée de
       * l'ancienne borne —, et c'est le volume rendu qui doit déclencher la
       * trace. */
      const avantSondage = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Extraction du jeu%'",
      );

      /* ⚠️ **LA MATIÈRE se sème ICI, et le seuil du produit ne se baisse pas
         pour l'essai.** Le jeu d'essai ordinaire ne rend que six lignes à cette
         session : le contrôle refusait de conclure — c'est ce que sa garde
         « trop peu pour que ce contrôle ait un objet » existe pour empêcher.
         On lui donne donc de quoi mesurer plutôt que d'abaisser
         `LIGNES_SONDAGE_ORDINAIRE_MAX`, ce qui aurait affaibli le PRODUIT pour
         faire passer un ESSAI — l'inverse exact de ce qu'on cherche. */
      await base.avecPerimetre(
        await base.connexion('app'),
        session._perimetre,
        async (c) => {
          for (let i = 0; i < 30; i += 1) {
            await c.query(
              `insert into "mesure_catalogue" ("id", "filiale_id", "nom", "cree_par")
               values ($1, $2, $3, $4)`,
              [
                `MES-${String(Date.now())}-q279${String(i).padStart(3, '0')}`,
                FILIALE_A,
                `Mesure de volume pour le constat Q-279 (${String(i)})`,
                'lectrice.seule',
              ],
            );
          }
        },
        { annuler: false },
      );

      const recent = new Date(Date.now() - 60_000).toISOString();
      const sondage = await greffon.appeler(
        'GET',
        `/api/rafraichir?depuis=${encodeURIComponent(recent)}`,
      );
      assert.equal(sondage.statut, 200, JSON.stringify(sondage.corps));
      // LA MATIÈRE : le jeu semé est récent, donc ce sondage « ordinaire »
      // rend en fait tout. Sans cette moitié, la trace ne prouverait rien.
      const rendues = Object.values(sondage.corps.volumes ?? {}).reduce((n, v) => n + v, 0);
      assert.ok(
        rendues >= 25,
        `Le sondage rend ${String(rendues)} ligne(s) : trop peu pour que ce contrôle ait ` +
          'un objet. Le jeu d’essai doit être plus fourni, ou le seuil revu — mais ' +
          'l’essai ne doit PAS passer au vert en n’ayant rien mesuré.',
      );
      const apresSondage = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Extraction du jeu%'",
      );
      assert.equal(
        apresSondage.length,
        avantSondage.length + 1,
        'Un sondage qui rend le jeu doit laisser UNE trace, même quand sa fenêtre est ' +
          'récente. L’ancien discriminant regardait la fenêtre DEMANDÉE ; c’est le volume ' +
          'RENDU qui distingue un sondage d’une extraction (constat Q-279).',
      );
      const traceSondage = apresSondage[apresSondage.length - 1];
      assert.equal(
        traceSondage.valeurs_apres.motif,
        'volume_rendu',
        'La trace doit dire CE QUI l’a déclenchée : un auditeur distingue « on a demandé ' +
          'loin » de « on a beaucoup reçu ».',
      );

      /* ══ Q-301 — LE CHIFFRE INSCRIT DOIT ÊTRE CELUI QUI EST SORTI ═══════
       *
       * Le paragraphe ci-dessus se contentait du DÉCLENCHEMENT, et il se
       * semait trente lignes fraîches : dans son scénario, l'inventaire et le
       * delta valent tous deux trente. L'erreur de variable — compter
       * `volumes` au lieu de `modifications` — lui était donc **invisible**,
       * et elle a traversé le 7ᵉ passage de la porte S8.
       *
       * On exige ici que le nombre inscrit au journal **inaltérable** soit
       * celui des lignes réellement envoyées, et non l'inventaire de la
       * filiale. Une entrée qui affirme « 30 lignes rendues » quand zéro l'a
       * été ne peut plus être démentie : le journal est en ajout seul. */
      const sorties = Object.values(sondage.corps.modifications ?? {}).reduce(
        (n, l) => n + l.length,
        0,
      );
      assert.equal(
        traceSondage.valeurs_apres.lignes,
        sorties,
        'Le journal inaltérable doit inscrire LE NOMBRE DE LIGNES SORTIES ' +
          `(${String(sorties)}), pas l'inventaire de la filiale ` +
          `(${String(Object.values(sondage.corps.volumes ?? {}).reduce((n, v) => n + v, 0))}). ` +
          'Constat Q-301 : l’entrée portait sa propre réfutation — « 30 lignes rendues » ' +
          'à côté de « collections: 0 ».',
      );
      assert.ok(
        sorties >= 25,
        `Ce contrôle n’a d’objet que si le sondage SORT vraiment : ${String(sorties)} ligne(s).`,
      );

      /* ══ Q-301 — ET UN SONDAGE AU REPOS N'ÉCRIT RIEN ════════════════════
       *
       * C'est la moitié qui mord. La filiale porte ici plus de lignes que le
       * seuil ; un discriminant qui regarde l'INVENTAIRE tracerait donc
       * **chaque battement** de la SPA — mesuré sur la recette : trois
       * accusations d'extraction en soixante-dix secondes, pour un onglet que
       * personne ne touche, soit ≈ 3 750 par jour, indélébiles trois ans.
       *
       * La fenêtre est ici volontairement **postérieure** au semis : le delta
       * est vide, rien ne sort, rien ne doit être écrit. */
      const avantRepos = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Extraction du jeu%'",
      );
      const repos = await greffon.appeler(
        'GET',
        `/api/rafraichir?depuis=${encodeURIComponent(new Date().toISOString())}`,
      );
      assert.equal(repos.statut, 200, JSON.stringify(repos.corps));
      const sortiesAuRepos = Object.values(repos.corps.modifications ?? {}).reduce(
        (n, l) => n + l.length,
        0,
      );
      assert.equal(sortiesAuRepos, 0, 'Le sondage au repos ne doit rien rendre.');
      // LA MATIÈRE : sans elle, ce contrôle passerait au vert sur une filiale
      // vide, où l'inventaire lui-même est sous le seuil.
      const inventaireAuRepos = Object.values(repos.corps.volumes ?? {}).reduce(
        (n, v) => n + v,
        0,
      );
      assert.ok(
        inventaireAuRepos >= 25,
        `L’inventaire de la filiale est de ${String(inventaireAuRepos)} ligne(s) : sous le ` +
          'seuil, ce contrôle ne distinguerait pas les deux variables et n’aurait pas d’objet.',
      );
      const apresRepos = await entreesDuScenario(
        "and action = 'consultation_sensible' and resume like 'Extraction du jeu%'",
      );
      assert.equal(
        apresRepos.length,
        avantRepos.length,
        'Un sondage AU REPOS — delta vide — ne doit inscrire AUCUNE entrée au journal ' +
          'inaltérable, quelle que soit la taille de la filiale (constat Q-301). Une SPA ' +
          'ouverte sans un geste écrirait sinon ≈ 3 750 fausses accusations d’extraction ' +
          'par jour et par onglet, dans le registre qui sert de preuve en audit.',
      );
      exerce.routes.add('sondage de rafraîchissement');
    } finally {
      await greffon.fermer();
    }

    const refus = await entreesDuScenario("and action = 'refus_autorisation'");
    assert.ok(
      refus.length >= 2,
      `Deux refus de droit ont été prononcés ; le journal en porte ${String(refus.length)}.`,
    );
    for (const entree of refus) {
      assert.equal(entree.utilisateur_libelle, 'lectrice.seule');
      assert.equal(entree.filiale_id, FILIALE_A, 'Le refus est imputé à la filiale active.');
      assert.ok(entree.valeurs_apres.route.startsWith('/api/'), 'La route est un gabarit.');
    }
    // §29.3, l'encadré : un refus d'IDENTITÉ n'écrit rien. Le vérifier ici,
    // c'est vérifier que la trace n'est pas devenue une arme.
    assert.equal(
      refus.filter((e) => e.valeurs_apres.action_exigee === undefined).length,
      0,
      'Une entrée de refus sans action exigée ne vient pas de l’étape 4 du crochet.',
    );
  });
});

/* =====================================================================
 *  §3 — La MESURE : combien d'actions sur combien
 * ===================================================================== */

describe('La couverture, mesurée en base', () => {
  test('le compte d’actions réellement émises est celui que le lot L5 promet', async (t) => {
    const declarees = await actionsDeclarees();
    const emises = await lireJournal(
      `select action, count(*)::int as n
         from journal_audit where numero > $1 group by action order by action`,
      [depart],
    );
    const parAction = new Map(emises.map((l) => [l.action, l.n]));

    t.diagnostic(`actions déclarées : ${String(declarees.size)}`);
    t.diagnostic(
      `actions émises par ce scénario : ${String(parAction.size)} — ` +
        [...parAction].map(([a, n]) => `${a}=${String(n)}`).join(' '),
    );

    // ── Ce que CE scénario doit produire ───────────────────────────────
    //
    // Neuf actions, et pas une liste d'émetteurs : chacune est le RÉSULTAT
    // observable d'un geste que le scénario vient de faire. Une omission ici
    // rougit — c'est le bon usage d'une liste (`CLAUDE.md` §3).
    const attendues = [
      'demarrage',
      'creation',
      'modification',
      'suppression',
      'export',
      'import',
      'administration',
      'refus_autorisation',
      'arret',
    ];
    const manquantes = attendues.filter((a) => !parAction.has(a));
    assert.deepEqual(
      manquantes,
      [],
      `Le produit a été exercé, et ces actions n’ont laissé AUCUNE trace : ${manquantes.join(', ')}. ` +
        `Actions vues : ${[...parAction.keys()].join(', ')}.`,
    );

    // Toute action émise doit être déclarée — sinon la contrainte l'aurait
    // refusée, mais l'écrire ici fait de l'essai la mesure du §29.2 et non
    // seulement celle du schéma.
    for (const action of parAction.keys()) {
      assert.ok(declarees.has(action), `Action émise hors du vocabulaire déclaré : ${action}.`);
    }

    // ── Les quatre reportées, PAR ÉCRIT et avec leur lot (§29.2) ────────
    // Elles ne sont pas émises, et l'essai le constate au lieu de le supposer :
    // le jour où L6 émettra `analyse_antivirus`, cette assertion rougira et
    // quelqu'un mettra le tableau du §29.2 à jour. C'est le but.
    for (const reportee of ['purge', 'archivage', 'approbation', 'analyse_antivirus']) {
      assert.ok(
        declarees.has(reportee),
        `${reportee} doit rester déclarée dans le schéma, même reportée.`,
      );
      assert.equal(
        parAction.get(reportee),
        undefined,
        `${reportee} est reportée par écrit (§29.2) : ce scénario ne devrait pas l’émettre.`,
      );
    }
  });

  /* -------------------------------------------------------------------
   *  §4 — Ce que chaque entrée DIT (§29.4)
   * ------------------------------------------------------------------- */
  test('création, modification, suppression portent le bon différentiel', async () => {
    const creations = await entreesDuScenario("and action = 'creation'");
    const modifications = await entreesDuScenario("and action = 'modification'");
    const suppressions = await entreesDuScenario("and action = 'suppression'");

    for (const entree of creations) {
      assert.equal(entree.valeurs_avant, null, '§29.4 : une création n’a pas d’avant.');
      assert.ok(entree.valeurs_apres !== null, 'Une création porte l’enregistrement créé.');
      assert.equal(entree.valeurs_apres.id, entree.entite_id);
      assert.equal(entree.filiale_id, FILIALE_A);
    }

    for (const entree of suppressions) {
      assert.equal(entree.valeurs_apres, null, '§29.4 : une suppression n’a pas d’après.');
      assert.ok(entree.valeurs_avant !== null, 'Une suppression porte l’enregistrement supprimé.');
      assert.equal(entree.valeurs_avant.id, entree.entite_id);
    }

    // Le différentiel : les CHAMPS MODIFIÉS, des deux côtés, et rien d'autre.
    const ciblees = modifications.filter((e) => e.valeurs_avant !== null);
    assert.ok(
      ciblees.length >= 5,
      `Trop peu de modifications ciblées pour en juger : ${String(ciblees.length)}.`,
    );
    for (const entree of ciblees) {
      const avant = Object.keys(entree.valeurs_avant);
      const apres = Object.keys(entree.valeurs_apres);
      assert.ok(avant.length > 0, 'Un différentiel vide n’est pas une modification.');
      assert.ok(
        avant.length <= 5,
        `§29.4 : le différentiel, pas le doublon — ${String(avant.length)} champs dans valeurs_avant.`,
      );
      for (const champ of avant) {
        assert.ok(apres.includes(champ), `Le champ ${champ} manque du côté « après ».`);
        assert.notDeepEqual(
          entree.valeurs_avant[champ],
          entree.valeurs_apres[champ],
          `Le champ ${champ} n’a pas changé : « ce qui n’a pas changé ne s’écrit pas ».`,
        );
      }
    }
  });

  test('une reprise laisse UNE entrée import, pas une par ligne', async () => {
    const imports = await entreesDuScenario("and action = 'import'");
    assert.equal(imports.length, 1, 'Une reprise appliquée, une entrée — l’aperçu n’en écrit pas.');
    const [entree] = imports;
    assert.equal(entree.valeurs_apres.mode, 'fusionner');
    assert.match(entree.valeurs_apres.sha256, /^[0-9a-f]{64}$/, 'Le fichier repris est identifié.');
    assert.ok(entree.valeurs_apres.lus > 0, 'Le bilan doit dire ce que le fichier apportait.');
    // Le fichier a apporté plusieurs dizaines d'enregistrements : si le moteur
    // journalisait ligne à ligne, on le verrait ici, pas ailleurs.
    //
    // La reprise est le DERNIER acte du scénario, avant l'arrêt : tout ce qui
    // porte un numéro supérieur au sien vient d'elle. Rien n'en vient — sauf
    // l'`administration` de sa propre route et l'`arret` du service.
    const apres = await entreesDuScenario('and numero > $2', [entree.numero]);
    const parLigne = apres.filter((e) =>
      ['creation', 'modification', 'suppression'].includes(e.action),
    );
    assert.equal(
      parLigne.length,
      0,
      `La reprise a repris ${String(entree.valeurs_apres.lus)} enregistrement(s) et laissé ` +
        `${String(parLigne.length)} trace(s) ligne à ligne : la granularité choisie est UNE ` +
        'entrée par acte (OptionsCreation.sansJournal).',
    );
  });

  test('l’export dit ce qui est sorti, et l’administration dit qui a agi', async () => {
    const exports = await entreesDuScenario("and action = 'export'");
    assert.ok(exports.length >= 1, 'Aucun export tracé : c’est le constat Q-89, seconde moitié.');
    for (const entree of exports) {
      assert.equal(entree.valeurs_apres.format, 'grc-backup');
      assert.ok(entree.valeurs_apres.lignes > 0, 'Un export vide n’est pas ce qui a été servi.');
      assert.ok(entree.adresse_ip !== null, 'D’où l’extraction a-t-elle été demandée ?');
    }

    const administration = await entreesDuScenario("and action = 'administration'");
    assert.ok(administration.length >= 1, 'Aucun acte d’administration tracé.');
    for (const entree of administration) {
      assert.ok(entree.valeurs_apres.statut < 400, 'Un échec n’est pas un acte d’administration.');
      assert.equal(entree.valeurs_apres.domaine, 'administration');
    }
  });

  test('démarrage et arrêt encadrent le segment, sans filiale et sans acteur', async () => {
    const cycle = await entreesDuScenario("and action in ('demarrage','arret')");
    assert.equal(cycle.length, 2, 'Un démarrage, un arrêt.');
    assert.equal(cycle[0].action, 'demarrage', 'Le démarrage précède tout le reste.');
    assert.equal(cycle[1].action, 'arret');
    for (const entree of cycle) {
      assert.equal(entree.filiale_id, null, 'Un événement de service n’appartient à aucune filiale.');
      assert.equal(entree.utilisateur_libelle, 'systeme');
    }
    // Le segment est bien encadré : rien du scénario n'est hors des deux bornes.
    const dedans = await entreesDuScenario(
      "and action in ('creation','export','import') and numero between $2 and $3",
      [cycle[0].numero, cycle[1].numero],
    );
    assert.ok(dedans.length > 0, 'Les écritures du scénario tombent entre démarrage et arrêt.');
  });

  /* -------------------------------------------------------------------
   *  §5 — LES PLANCHERS : l'essai refuse de rendre vert sans avoir exercé
   * ------------------------------------------------------------------- */
  test('PLANCHER — l’essai a réellement exercé le produit', async (t) => {
    t.diagnostic(
      `entités exercées : ${String(exerce.entites.length)} (${exerce.entites.join(', ')})`,
    );
    t.diagnostic(
      `créations ${String(exerce.creations)} · modifications ${String(exerce.modifications)} · ` +
        `suppressions ${String(exerce.suppressions)}`,
    );

    // Mesuré le 04/09/2026 : 17 entités créées, 17 modifiées, 17 supprimées.
    // Les planchers sont posés en dessous — assez bas pour ne pas rougir sur une
    // machine plus lente, assez haut pour qu'un chemin d'écriture qui cesserait
    // de journaliser ne puisse pas passer inaperçu.
    assert.ok(
      exerce.entites.length >= 14,
      `Seulement ${String(exerce.entites.length)} entité(s) exercée(s) : un balayage qui ne trouve ` +
        'rien rend vert en n’éprouvant rien.',
    );
    assert.ok(exerce.creations >= 14, `créations exercées : ${String(exerce.creations)}`);
    assert.ok(exerce.modifications >= 12, `modifications exercées : ${String(exerce.modifications)}`);
    assert.ok(exerce.suppressions >= 14, `suppressions exercées : ${String(exerce.suppressions)}`);
    /* ⚠️ Ce compte est ÉPINGLÉ, et il a rougi en passant de 4 à 5, puis de 5 à
       6 — c'est ce qu'il doit faire. La cinquième route est `GET /api/donnees`
       (constat **Q-209**) : elle rend le même contenu que `/api/export` et ne
       laissait aucune trace. La **sixième** est `GET /api/rafraichir` (constat
       **Q-279**, 7ᵉ passage de la porte S8) : elle rendait le jeu **sans
       aucune trace** dès que la fenêtre demandée restait sous le seuil de
       session, et le cas nominal — après un import, tout porte un `updatedAt`
       récent — l'atteignait sans le chercher.
       Une route de plus doit être reconnue ici en connaissance de cause ; une
       route qui disparaîtrait ne doit pas s'effacer en silence. */
    assert.equal(exerce.routes.size, 6, `routes exercées : ${[...exerce.routes].join(', ')}`);

    // Et le journal doit avoir vu passer AU MOINS autant d'écritures que le
    // scénario en a réussi. C'est le lien entre « j'ai exercé » et « c'est
    // tracé » : sans lui, les deux moitiés de l'essai ne se parlent pas.
    const [{ n }] = await lireJournal(
      `select count(*)::int as n from journal_audit
        where numero > $1 and action in ('creation','modification','suppression')`,
      [depart],
    );
    assert.ok(
      Number(n) >= exerce.creations + exerce.modifications + exerce.suppressions,
      `${String(exerce.creations + exerce.modifications + exerce.suppressions)} écritures réussies, ` +
        `${String(n)} tracées.`,
    );
  });
});
