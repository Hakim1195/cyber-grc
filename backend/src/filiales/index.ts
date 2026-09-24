/**
 * Création d'une filiale — **le contenu de L4 que le lot n'avait pas** (constat Q-149).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * Mesuré le 04/09/2026 : `insert into filiales` n'apparaît **nulle part** dans
 * `src/` ni dans `deploy/` — seulement dans les essais et dans
 * `db/verifier_cloisonnement.sql`. Autrement dit, le produit ne savait pas créer
 * une filiale, et l'intégration d'une société rachetée passait par un
 * administrateur de base écrivant du SQL à la main sur une table qui porte une
 * contrainte de format sur le code, un statut, et des dates d'entrée et de
 * sortie liées entre elles.
 *
 * Or le cadrage dit **« 20+ filiales, acquisitions régulières »** : créer une
 * filiale n'est pas une étape d'installation, c'est une **opération récurrente
 * du métier**. Le `PLAN_SERVEUR` §7 la range d'ailleurs explicitement dans le
 * contenu de L4, à côté du sélecteur de filiale qui, lui, a été livré.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Quatre décisions
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. `POST` ici, `GET` dans `src/api/index.ts` — et ce n'est pas un oubli.**
 * Les deux routes partagent un chemin et rien d'autre. `GET /api/filiales` est
 * une route de **session** : elle ne fait que nommer le périmètre que la session
 * porte déjà, et se déclare `{ action: 'lire', domaine: null }` — tout le monde
 * y a droit. `POST` est un acte d'**administration Groupe**, la déclaration
 * d'accès la plus forte du produit. Les réunir dans un fichier donnerait à
 * croire qu'elles se ressemblent.
 *
 * **2. L'identifiant est fabriqué par le SERVEUR, et un identifiant proposé est
 * REFUSÉ**, pas ignoré. C'est la règle du chantier depuis la vague 2 : accepter
 * un identifiant du client ouvre un oracle d'existence inter-filiales (« cet id
 * est-il pris ? »). Le générateur est `engendrerIdentifiant`, **le seul du
 * langage** — jamais de clone local (`CONVENTIONS.md` §2, et deux régressions
 * payées pour l'avoir oublié).
 *
 * **3. Créer la filiale ne suffit pas : sans ses groupes d'annuaire, personne ne
 * peut y entrer.** Le droit se résout depuis les groupes AD `GRC-<CODE>-<PROFIL>`
 * (`PLAN_SERVEUR` §3.4) ; une filiale sans groupes est une filiale que **nul ne
 * peut lire ni écrire**, y compris celui qui vient de la créer. La route
 * synchronise donc `groupes_ad` **dans la même transaction**, et rend la liste
 * des groupes que l'administrateur doit créer **dans l'annuaire** — ce que le
 * produit ne fait pas et ne doit pas faire : écrire dans l'AD du client depuis
 * une application exposée est précisément ce qu'un RSSI refuse.
 *
 * Sans ce rendu, le défaut serait **silencieux** : la filiale existerait,
 * l'écran l'afficherait, et elle resterait inaccessible sans que rien ne le
 * dise. C'est le premier cas du tableau du `CLAUDE.md` §3.
 *
 * **4. La trace au journal n'est pas écrite ici.** Le crochet `onResponse` de
 * `src/api/index.ts` journalise `administration` pour **toute** route déclarée
 * en `action: 'administrer'` — et son commentaire nommait déjà, par avance,
 * *« celle que le lot L4 écrira pour créer une filiale »*. L'écrire ici en plus
 * ferait deux entrées pour un acte.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import type { PerimetreSession } from '../db/pool.js';

import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import {
  groupesAttendus,
  lireFilialesActives,
  lireProfilsActifs,
  synchroniserGroupesAd,
} from '../droits/groupes-ad.js';
import { engendrerIdentifiant } from '../entites/index.js';
import {
  analyserDeclaration,
  filialesActives,
  filialesHorsPerimetre,
  MOTIF_HORS_PERIMETRE,
} from './declaration.js';
import type { AnomalieDeclaration, DeclarationFiliale } from './declaration.js';
import { entreeInvalide, ErreurApplicative, lireErreurPostgres } from '../erreurs/index.js';
import type { SessionAppliquee } from '../api/session.js';

/* =====================================================================
 *  1. Le corps admis
 * ===================================================================== */

/**
 * Champs acceptés à la création.
 *
 * ⚠️ **Cette liste est écrite à la main, et c'est le bon cas** — celui de la
 * seconde ligne du tableau du `CLAUDE.md` §3. Une colonne de `filiales` qu'on
 * oublierait ici ne « réussit » pas en silence : elle reste simplement à sa
 * valeur par défaut, et l'administrateur voit qu'elle manque sur la fiche. Le
 * défaut est **bruyant et réparable**, là où découvrir les colonnes dans le
 * catalogue exposerait `version`, `cree_le`, `cree_par` et `statut` à
 * l'écriture — c'est-à-dire exactement les colonnes que la vague 2 a exclues par
 * construction.
 *
 * `statut` est absent **délibérément** : une filiale se crée `active`. La faire
 * naître `archivee` ou `sortie` n'a pas de sens, et `ck_filiales_sortie` exige
 * de toute façon une date de sortie.
 */
const CHAMPS_ADMIS = Object.freeze([
  'code',
  'raison_sociale',
  'nom_court',
  'adresse',
  'code_postal',
  'ville',
  'pays',
  'telephone',
  'email',
  'site_web',
  'langue_defaut',
  'date_entree',
  'notes',
] as const);

type ChampAdmis = (typeof CHAMPS_ADMIS)[number];

/** Les deux seuls champs sans lesquels une filiale n'est pas une filiale. */
const CHAMPS_REQUIS: readonly ChampAdmis[] = Object.freeze(['code', 'raison_sociale']);

/**
 * Contrôles de forme joués **avant** la base.
 *
 * La base les tient déjà (`ck_filiales_code`, `ck_filiales_pays`) et elle reste
 * l'autorité — ceux-ci n'existent que pour **dire quoi corriger**. Une contrainte
 * `check` rend « valeur refusée » ; un administrateur qui saisit `mad` a besoin
 * de lire « le code s'écrit en majuscules ».
 */
const FORMES: Readonly<Partial<Record<ChampAdmis, { motif: RegExp; explication: string }>>> =
  Object.freeze({
    code: {
      motif: /^[A-Z0-9]{2,10}$/u,
      explication:
        'Le code identifie la filiale dans les groupes d’annuaire (GRC-<CODE>-<PROFIL>) : ' +
        '2 à 10 caractères, majuscules et chiffres uniquement.',
    },
    pays: {
      motif: /^[A-Z]{2}$/u,
      explication: 'Le pays s’écrit sur deux lettres majuscules (ISO 3166-1 alpha-2) : FR, DE, ES.',
    },
    langue_defaut: {
      motif: /^[a-z]{2}$/u,
      explication: 'La langue s’écrit sur deux lettres minuscules : fr, en, es.',
    },
    date_entree: {
      motif: /^\d{4}-\d{2}-\d{2}$/u,
      explication: 'La date d’entrée s’écrit AAAA-MM-JJ.',
    },
  });

/** Valeurs retenues, dans l'ordre de `CHAMPS_ADMIS`. */
type CorpsFiliale = Partial<Record<ChampAdmis, string>>;

/**
 * Lit et valide le corps.
 *
 * ⚠️ Un champ **inconnu est refusé, jamais ignoré** — c'est l'arbitrage de la
 * vague 2, repris tel quel : ignorer laisse croire que la valeur a été prise en
 * compte. Un client qui enverrait `statut`, `version` ou `id` doit l'apprendre.
 */
function lireCorps(brut: unknown): CorpsFiliale {
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) {
    throw entreeInvalide('Le corps de la requête doit être un objet JSON décrivant la filiale.');
  }
  const admis = new Set<string>(CHAMPS_ADMIS);
  const corps: CorpsFiliale = {};

  for (const [cle, valeur] of Object.entries(brut as Record<string, unknown>)) {
    if (!admis.has(cle)) {
      throw entreeInvalide(
        `Champ « ${cle} » inconnu pour une filiale. Champs admis : ${CHAMPS_ADMIS.join(', ')}. ` +
          'L’identifiant, le statut et les colonnes de traçabilité sont fixés par le serveur.',
      );
    }
    if (valeur === null || valeur === undefined || valeur === '') continue;
    if (typeof valeur !== 'string') {
      throw entreeInvalide(`Le champ « ${cle} » doit être une chaîne de caractères.`);
    }
    const nettoye = valeur.trim();
    if (nettoye === '') continue;
    const forme = FORMES[cle as ChampAdmis];
    if (forme !== undefined && !forme.motif.test(nettoye)) {
      throw entreeInvalide(`Champ « ${cle} » : ${forme.explication} Reçu : « ${nettoye} ».`);
    }
    corps[cle as ChampAdmis] = nettoye;
  }

  for (const requis of CHAMPS_REQUIS) {
    if (corps[requis] === undefined) {
      throw entreeInvalide(`Le champ « ${requis} » est obligatoire pour créer une filiale.`);
    }
  }
  return corps;
}

/* =====================================================================
 *  2. L'écriture, et les groupes d'annuaire qu'elle appelle
 * ===================================================================== */

export interface FilialeCreee {
  readonly id: string;
  readonly code: string;
  readonly raison_sociale: string;
  readonly statut: string;
}

export interface ResultatCreation {
  readonly filiale: FilialeCreee;
  readonly groupes_ad: {
    /** À créer **dans l'annuaire** : sans eux, personne n'entre dans la filiale. */
    readonly a_creer: readonly string[];
    readonly deja_presents: readonly string[];
    /** Groupes de la table qui ne figurent plus parmi les attendus. Signalés. */
    readonly inattendus: readonly string[];
  };
}

/**
 * Crée la filiale et aligne les groupes d'annuaire, **dans une transaction**.
 *
 * Exportée pour l'essai : le cloisonnement et le refus du doublon se prouvent
 * ici, sans monter de serveur HTTP.
 */
export async function creerFiliale(
  client: PoolClient,
  corps: CorpsFiliale,
  prefixeGroupes: string,
  /**
   * Le périmètre de la session, pour la trace (constat Q-213). Il est passé
   * plutôt que relu par `current_setting` : ce que le journal nomme doit être
   * ce que le serveur a résolu, pas ce que la transaction se trouve porter.
   */
  perimetre: PerimetreSession,
): Promise<ResultatCreation> {
  const identifiant = engendrerIdentifiant('FIL');

  const colonnes = ['id', ...CHAMPS_ADMIS.filter((c) => corps[c] !== undefined)];
  const valeurs = [identifiant, ...CHAMPS_ADMIS.filter((c) => corps[c] !== undefined).map((c) => corps[c])];
  const places = colonnes.map((_, i) => `$${String(i + 1)}`).join(', ');

  // ⚠️ PAS DE `returning`, ET C'EST LA PROPRIÉTÉ LA PLUS SURPRENANTE DE CE FICHIER.
  //
  // Mesuré le 04/09/2026, après avoir cru le contraire : l'insertion passe, et
  // c'est **la relecture** qui est refusée. `f_perimetre_groupe()` est *dérivée*
  // — elle vaut vrai quand le périmètre couvre toutes les filiales **actives**.
  // Créer une filiale active en ajoute une que le périmètre ne couvre pas : la
  // fonction bascule donc à **faux dans la même transaction**, `pol_filiales_lecture`
  // retombe sur `id = any (f_filiales_lecture())`, et la ligne qu'on vient
  // d'écrire n'y est pas.
  //
  // Ce n'est **pas un défaut à contourner, c'est le modèle qui parle** : le
  // périmètre se résout depuis les groupes d'annuaire, et les groupes de la
  // filiale neuve n'existent pas encore dans l'AD. L'administrateur a donc le
  // droit de la CRÉER et aucun droit de LIRE ce qu'elle contiendra — ce qui est
  // exactement la séparation que le `PLAN_SERVEUR` §3.1 décrit. C'est aussi ce
  // qui donne tout son sens au bloc `groupes_ad` de la réponse : tant que
  // l'administrateur ne les a pas créés dans l'annuaire et ne s'est pas
  // reconnecté, la filiale lui reste invisible.
  //
  // ⚠️ Le message de PostgreSQL est trompeur — il dit « new row violates
  // row-level security policy », ce qui désigne d'ordinaire le `with check` de
  // l'insertion. Il ne distingue pas les deux. Le seul moyen de trancher a été
  // de jouer l'insertion **sans** `returning` : elle passe.
  //
  // La réponse décrit donc ce qui a été ÉCRIT, pas ce qui a été relu. `statut`
  // vaut `'active'` parce que la colonne n'est pas modifiable ici (voir
  // `CHAMPS_ADMIS`) : ce n'est pas une supposition, c'est une conséquence.
  const ligne: FilialeCreee = {
    id: identifiant,
    code: corps.code ?? '',
    raison_sociale: corps.raison_sociale ?? '',
    statut: 'active',
  };

  try {
    await client.query(
      `insert into "filiales" (${colonnes.map((c) => `"${c}"`).join(', ')})
            values (${places})`,
      valeurs,
    );
  } catch (erreur) {
    const pg = lireErreurPostgres(erreur);
    // ── Le doublon de CODE mérite un message précis, et c'est une exception
    //    assumée au traitement générique de `23505`.
    //
    //    `src/erreurs/` reste vague sur les unicités qui ne portent pas
    //    `filiale_id`, pour ne pas ouvrir d'oracle d'existence inter-filiales :
    //    « ce code est-il pris ? » apprendrait à un RSSI de site l'existence
    //    d'une acquisition qu'il n'a pas à connaître. **Ici, l'appelant porte
    //    l'administration Groupe** — la déclaration d'accès de la route l'exige
    //    et le crochet `onRequest` l'a constaté avant que cette ligne s'exécute.
    //    Les codes de filiales ne sont donc pas un oracle pour lui : c'est son
    //    annuaire. Lui dire lequel est pris est la seule réponse utilisable.
    if (pg?.code === '23505' && (pg.constraint ?? '').includes('uq_filiales_code')) {
      throw new ErreurApplicative({
        code: 'contrainte_base',
        statut: 409,
        message:
          `Le code « ${corps.code ?? ''} » est déjà porté par une filiale du groupe. ` +
          'Un code identifie la filiale dans les groupes d’annuaire : il ne peut pas être partagé.',
        detailJournal: `uq_filiales_code : code ${corps.code ?? ''} déjà pris`,
      });
    }
    throw erreur;
  }

  // ── Les groupes d'annuaire, DANS LA MÊME TRANSACTION ────────────────────
  //
  // Si la synchronisation échoue, la filiale n'est pas créée non plus : une
  // filiale sans ses groupes est inaccessible, et laisser derrière soi une
  // moitié de création serait la forme la plus discrète du défaut.
  const filiales = await lireFilialesActives(client);
  const profils = await lireProfilsActifs(client);
  const bilan = await synchroniserGroupesAd(client, groupesAttendus(prefixeGroupes, filiales, profils));

  /* ══ LA TRACE, PAR SON OBJET — constat **Q-213** de la porte S8 ══════════
   *
   * Ce fichier n'appelait **jamais** `journaliser`. La création d'une filiale
   * validait sa transaction, répondait 201, et sa seule trace venait du crochet
   * `onResponse` (`api/index.ts`) — qui ouvre **sa propre** transaction, **après**
   * la réponse, et **avale son échec**. Deux conséquences, et la première est
   * la plus grave :
   *
   *  1. si cette trace échouait, **une filiale existait sans aucune entrée au
   *     journal** — dans le registre qui fait preuve en audit ISO 27001, pour
   *     l'acte le plus structurant du produit ;
   *  2. même réussie, elle ne porte que `{ methode, route, domaine, statut }` :
   *     ni l'identifiant, ni le code, ni la raison sociale. On savait qu'une
   *     filiale avait été créée, jamais laquelle.
   *
   * ⚠️ Elle est écrite **dans la transaction de la création**, comme le veut la
   * règle 2 du §29.3 : si le journal refuse, la filiale n'est pas créée. C'est
   * le même raisonnement que la synchronisation des groupes juste au-dessus —
   * laisser derrière soi une moitié de création est la forme la plus discrète
   * du défaut.
   *
   * Ce que la trace porte : l'identité de la filiale — code et raison sociale
   * sont sa désignation officielle, pas une donnée personnelle — et le nombre
   * de groupes d'annuaire à créer. Jamais le contenu d'un enregistrement. */
  await journaliser(client, {
    action: 'creation',
    resume: 'Création d’une filiale',
    // ⚠️ `filialeId` est celui de la SESSION, pas de la filiale créée : le
    //    journal est cloisonné, et rattacher l'entrée à une filiale qui vient
    //    de naître la rendrait invisible à l'administrateur qui l'a créée.
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'filiales',
    entiteId: ligne.id,
    valeursApres: {
      code: ligne.code,
      raison_sociale: ligne.raison_sociale,
      statut: ligne.statut,
      groupes_ad_a_creer: bilan.crees.length,
    },
  });

  // Ne rendre que ce qui concerne la filiale créée : le bilan porte sur tout le
  // groupe, et l'administrateur n'a pas à trier vingt filiales pour trouver la
  // sienne. `inattendus` fait exception — c'est un signalement, pas une consigne.
  const siens = (noms: readonly string[]): readonly string[] =>
    noms.filter((nom) => nom.toUpperCase().includes(`-${ligne.code.toUpperCase()}-`));

  return {
    filiale: ligne,
    groupes_ad: {
      a_creer: siens(bilan.crees),
      deja_presents: siens(bilan.presents),
      inattendus: bilan.inattendus,
    },
  };
}

/* =====================================================================
 *  2 bis. L'amorçage — porter `filiales.conf` EN BASE, une fois
 * ===================================================================== */

/**
 * Ce que l'amorçage a fait, ou n'a pas fait.
 *
 * ⚠️ Les trois cas sont **nommés**, et aucun n'est « rien ». Un script
 * d'installation qui se tait quand il n'a rien fait laisse croire qu'il a
 * travaillé : c'est de cette confusion que naît le défaut que ce fichier ferme.
 */
export type StatutAmorcage =
  /** La base ne connaissait aucune filiale active : les lignes du fichier sont entrées. */
  | 'importe'
  /** Le produit connaît déjà des filiales : **le fichier n'a pas été relu**. */
  | 'deja-peuple'
  /** Le fichier ne déclare aucune filiale active : rien à porter. */
  | 'rien-a-importer';

export interface ResultatAmorcage {
  readonly statut: StatutAmorcage;
  /** Filiales actives déjà connues du produit AVANT l'amorçage. */
  readonly deja_connues: readonly string[];
  /** Codes réellement créés, dans l'ordre du fichier. */
  readonly creees: readonly string[];
  /** Lignes `active = non`, avec leur motif — voir la décision 3 de `declaration.ts`. */
  readonly hors_perimetre: readonly { readonly code: string; readonly motif: string }[];
  /** Groupes d'annuaire restant à créer **dans l'AD** après l'amorçage. */
  readonly groupes_ad_a_creer: readonly string[];
}

/**
 * Porte la déclaration d'exploitation en base, **si et seulement si** le produit
 * ne connaît encore aucune filiale active.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Quatre décisions, et la première est la plus importante
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. Cette fonction n'écrit PAS dans `filiales` : elle appelle `creerFiliale`.**
 * Un second écrivain aurait été un second jeu de règles — l'identifiant engendré,
 * le refus du doublon avec son message, la synchronisation de `groupes_ad` dans la
 * même transaction, et la trace au journal du constat **Q-213**. Tout cela existe
 * déjà, une fois. L'amorçage n'est donc qu'une **boucle sur le chemin normal**, et
 * c'est ce qui garantit qu'une filiale amorcée est indiscernable d'une filiale
 * créée à l'écran. *On ne recopie pas une règle, on l'appelle.*
 *
 * **2. « La base connaît-elle des filiales ? » se lit par `f_filiales_actives()`,
 * jamais par `select from filiales`.** Et ce n'est pas un détail de style :
 * `f_perimetre_groupe()` exige **au moins une** filiale active, donc elle est
 * FAUSSE sur une base neuve ; `pol_filiales_lecture` retombe alors sur
 * `id = any (f_filiales_lecture())`, c'est-à-dire sur rien. Un `select count(*)
 * from filiales` rendrait **0 sur une base peuplée** dont le périmètre n'est pas
 * posé — et l'amorçage croirait devoir tout réécrire. `f_filiales_actives()` est
 * `security definer` : elle répond la vérité, hors de tout périmètre.
 *
 * **3. Une base déjà peuplée n'est pas touchée, et l'amorçage le DIT.** Le
 * fichier est une déclaration d'installation ; à partir du moment où le produit
 * connaît son périmètre, c'est la **table** qui fait foi, et une acquisition se
 * déclare à l'écran. Relire le fichier à chaque mise à jour rouvrirait la
 * question « qui a raison ? » — c'est-à-dire le défaut que cet amorçage ferme.
 *
 * **4. Une anomalie de forme fait ÉCHOUER l'amorçage entier**, et ne se contente
 * pas d'écarter la ligne fautive. Une ligne mal formée produit un code de
 * filiale faux, donc des noms de groupes faux, et un nom de groupe faux ne se
 * voit qu'au moment où quelqu'un ne peut pas se connecter.
 *
 * @param client   transaction ouverte, périmètre d'administration Groupe posé.
 * @param contenu  contenu brut de `filiales.conf`.
 */
export async function amorcerFiliales(
  client: PoolClient,
  contenu: string,
  prefixeGroupes: string,
  perimetre: PerimetreSession,
): Promise<ResultatAmorcage> {
  const declaration = analyserDeclaration(contenu);
  if (declaration.anomalies.length > 0) {
    throw new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message:
        'La déclaration des filiales est invalide, et RIEN n’a été importé : ' +
        declaration.anomalies
          .map((a: AnomalieDeclaration) => `ligne ${String(a.ligne)} : ${a.message}`)
          .join(' · '),
      detailJournal: `filiales.conf : ${String(declaration.anomalies.length)} anomalie(s)`,
    });
  }

  const dejaConnues = await lireFilialesActives(client);
  const horsPerimetre = filialesHorsPerimetre(declaration).map((f: DeclarationFiliale) => ({
    code: f.code,
    motif: MOTIF_HORS_PERIMETRE,
  }));

  if (dejaConnues.length > 0) {
    return Object.freeze({
      statut: 'deja-peuple' as const,
      deja_connues: dejaConnues.map((f) => f.code),
      creees: [],
      hors_perimetre: horsPerimetre,
      groupes_ad_a_creer: [],
    });
  }

  const aCreer = filialesActives(declaration);
  if (aCreer.length === 0) {
    return Object.freeze({
      statut: 'rien-a-importer' as const,
      deja_connues: [],
      creees: [],
      hors_perimetre: horsPerimetre,
      groupes_ad_a_creer: [],
    });
  }

  const creees: string[] = [];
  const groupes: string[] = [];
  for (const filiale of aCreer) {
    const resultat = await creerFiliale(
      client,
      { code: filiale.code, raison_sociale: filiale.raisonSociale, pays: filiale.pays },
      prefixeGroupes,
      perimetre,
    );
    creees.push(resultat.filiale.code);
    groupes.push(...resultat.groupes_ad.a_creer);
  }

  return Object.freeze({
    statut: 'importe' as const,
    deja_connues: [],
    creees: Object.freeze(creees),
    hors_perimetre: horsPerimetre,
    // ⚠️ Les transversaux et les `<PRÉFIXE>GROUPE-<PROFIL>` n'apparaissent pas ici :
    //    `creerFiliale` ne rend que les groupes de LA filiale créée. C'est voulu —
    //    ceux-là ne dépendent d'aucune filiale et la synchronisation les a posés au
    //    premier passage. La liste complète se relève par `deploy/groupes-ad.sh`.
    groupes_ad_a_creer: Object.freeze([...new Set(groupes)].sort()),
  });
}

/* =====================================================================
 *  2 ter. L'inventaire — ce que l'écran d'administration affiche
 * ===================================================================== */

export interface LigneInventaire {
  readonly id: string;
  readonly code: string;
  readonly raison_sociale: string;
  readonly pays: string | null;
  readonly statut: string;
  readonly date_entree: string | null;
  readonly date_sortie: string | null;
  /** Les groupes d'annuaire que cette filiale exige, par la convention. */
  readonly groupes_attendus: readonly string[];
  /** Ceux d'entre eux que `groupes_ad` ne déclare pas. Devrait être vide. */
  readonly groupes_non_declares: readonly string[];
  /** La session peut-elle LIRE cette filiale ? Conditionne la sortie. */
  readonly dans_mon_perimetre: boolean;
}

export interface Inventaire {
  readonly filiales: readonly LigneInventaire[];
  /** Groupes transversaux et de portée Groupe : ils ne dépendent d'aucune filiale. */
  readonly groupes_transversaux: readonly string[];
  readonly groupes_non_declares_transversaux: readonly string[];
  /** Le préfixe en vigueur — l'écran en a besoin pour le script PowerShell. */
  readonly prefixe_groupes: string;
}

/**
 * L'inventaire complet du périmètre, **tous statuts confondus**.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi une route de plus, alors que `GET /api/filiales` existe
 * ════════════════════════════════════════════════════════════════════════
 *
 * `GET /api/filiales` est une route de **session** : elle nomme le périmètre que
 * la session porte déjà (`where id = any($1)` sur `session_filiales`), et tout le
 * monde y a droit. Elle ne peut donc **pas** servir cet écran : une filiale
 * `archivee` ou `sortie` a quitté tous les périmètres, et c'est précisément celle
 * qu'un administrateur veut voir pour savoir qu'elle est sortie. Lui faire rendre
 * plus serait élargir une route que tout le monde appelle.
 *
 * ⚠️ **La lecture passe par le propriétaire des données, pas par la RLS**, et il
 * faut le dire : `f_filiales_actives()` ne rend que les actives, et un `select`
 * direct sur `filiales` retombe sur `f_filiales_lecture()` dès que
 * `f_perimetre_groupe()` est fausse. La route est donc déclarée en
 * `administration-groupe` — la plus forte du produit — et c'est **la déclaration
 * d'accès qui borne**, pas une garde écrite dans le corps.
 *
 * ⚠️ Elle rend aussi, pour chaque filiale, **les groupes d'annuaire qu'elle
 * exige** et ceux que `groupes_ad` ne déclare pas. Sans cela l'écran afficherait
 * une filiale saine là où personne ne peut entrer — le premier cas du tableau du
 * `CLAUDE.md` §3, et le défaut même que ce lot ferme.
 */
export async function lireInventaire(
  client: PoolClient,
  prefixeGroupes: string,
  perimetre: PerimetreSession,
): Promise<Inventaire> {
  const { rows } = await client.query<{
    id: string;
    code: string;
    raison_sociale: string;
    pays: string | null;
    statut: string;
    date_entree: string | null;
    date_sortie: string | null;
  }>(
    /* 🛑 `f_filiales_inventaire()` ET NON `select from filiales` — migration `065`,
     * trouvé EN CLIQUANT sur la recette. `pol_filiales_lecture` retombe sur
     * `id = any (f_filiales_lecture())` dès que `f_perimetre_groupe()` est fausse,
     * et créer une filiale active la fait basculer à faux dans la session qui la
     * crée : l'écran **perdait la ligne qu'il venait d'écrire**, tout en annonçant
     * sa création dans l'encart juste au-dessus. Un administrateur en concluait que
     * la création avait échoué, la refaisait, et recevait un refus de doublon sur un
     * code qu'il ne voyait nulle part.
     *
     * ⚠️ Le tri vit DANS la fonction : le refaire ici en ferait un second tri, et
     * deux tris finissent par diverger. */
    `select "id", "code", "raison_sociale", "pays", "statut",
            to_char("date_entree", 'YYYY-MM-DD') as "date_entree",
            to_char("date_sortie", 'YYYY-MM-DD') as "date_sortie"
       from f_filiales_inventaire()`,
  );

  const profils = await lireProfilsActifs(client);
  const actives = rows
    .filter((f) => f.statut === 'active')
    .map((f) => ({ id: f.id, code: f.code, raisonSociale: f.raison_sociale }));
  const attendus = groupesAttendus(prefixeGroupes, actives, profils);

  const { rows: declares } = await client.query<{ nom: string }>(
    `select "nom" from "groupes_ad" where "actif"`,
  );
  const dejaLa = new Set(declares.map((g) => g.nom.toUpperCase()));

  const pourFiliale = (id: string): readonly string[] =>
    attendus.filter((g) => g.filialeId === id).map((g) => g.nom);
  const transversaux = attendus.filter((g) => g.filialeId === null).map((g) => g.nom);
  const absents = (noms: readonly string[]): readonly string[] =>
    noms.filter((n) => !dejaLa.has(n.toUpperCase()));

  return Object.freeze({
    filiales: rows.map((f) => {
      const siens = pourFiliale(f.id);
      return Object.freeze({
        id: f.id,
        code: f.code,
        raison_sociale: f.raison_sociale,
        pays: f.pays,
        statut: f.statut,
        date_entree: f.date_entree,
        date_sortie: f.date_sortie,
        groupes_attendus: siens,
        groupes_non_declares: absents(siens),
        dans_mon_perimetre: perimetre.filiales.includes(f.id),
      });
    }),
    groupes_transversaux: transversaux,
    groupes_non_declares_transversaux: absents(transversaux),
    prefixe_groupes: prefixeGroupes,
  });
}

/* =====================================================================
 *  3. Greffon
 * ===================================================================== */

export interface OptionsFiliales {
  readonly pool?: Pool;
  /** `LDAP_PREFIXE_GROUPES` : le préfixe des groupes d'annuaire (`GRC-` par défaut). */
  readonly prefixeGroupes?: string;
  /**
   * Le service d'authentification, **en lecture seule**, pour proposer des
   * candidats depuis l'annuaire. Absent = la proposition répond 503, et le dit.
   */
  readonly auth?: ServiceAnnuaire;
}

/**
 * Ce que ce greffon demande au service d'authentification — et rien de plus.
 *
 * 🛑 **Deux méthodes, toutes deux en LECTURE.** Écrire l'interface au lieu
 * d'importer le service entier n'est pas un raffinement de typage : c'est ce qui
 * rend visible, à la lecture, que cet écran ne peut pas toucher à l'annuaire. Le
 * client LDAP du produit n'implémente de toute façon que `lier`, `rechercher`,
 * `fermer` — *une capacité absente ne se réactive pas par une erreur de
 * configuration* (arbitrage utilisateur du 22/09/2026).
 */
export interface ServiceAnnuaire {
  annuaireDisponible(): boolean;
  unitesOrganisationAnnuaire(base: string | null): Promise<
    | {
        readonly unites: readonly {
          readonly nom: string;
          readonly dn: string;
          readonly description: string | null;
        }[];
        readonly tronque: boolean;
      }
    | undefined
  >;
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonFiliales(
  instance: FastifyInstance,
  options: OptionsFiliales,
): Promise<void> {
  const { pool } = options;
  if (pool === undefined) {
    instance.log.error(
      'greffonFiliales enregistré sans pool : POST /api/filiales ne sera pas montée.',
    );
    return;
  }
  const prefixeGroupes = options.prefixeGroupes ?? 'GRC-';
  const { auth } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Session absente sur une route d’administration : défaut de montage.',
      });
    }
    return session;
  };

  instance.post(
    '/api/filiales',
    {
      // ── LA DÉCLARATION LA PLUS FORTE DU PRODUIT, et chacun de ses trois
      //    termes est nécessaire :
      //
      //    · `administrer` — c'est ce qui déclenche la trace `administration`
      //      du crochet `onResponse`, sans une ligne écrite ici ;
      //    · `administration` — le domaine ; un profil qui ne l'a pas est
      //      refusé par `deciderAcces` ;
      //    · `administration-groupe` — le PÉRIMÈTRE. Sans lui, la route s'en
      //      remettrait au `42501` de `pol_filiales_ajout`, c'est-à-dire à un
      //      **500** rendu pour ce qui est un refus de droit. Et la note de
      //      `PerimetreSession` est formelle : ce réglage n'est pas une
      //      barrière côté base — la barrière est la déclaration ci-dessous.
      config: {
        acces: { action: 'administrer', domaine: 'administration', perimetre: 'administration-groupe' },
      },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = lireCorps(requete.body);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) =>
        creerFiliale(client, corps, prefixeGroupes, session.perimetre),
      );

      return await reponse.status(201).send(resultat);
    },
  );

  /* ── L'inventaire ─────────────────────────────────────────────────────
   *
   * ⚠️ `/api/filiales/inventaire` et non un paramètre sur `GET /api/filiales` :
   * celle-là est une route de SESSION que tout le monde appelle, et l'élargir
   * pour un écran d'administration aurait ouvert à tous ce que seul un
   * administrateur doit voir — une filiale sortie, par exemple. Le §30.2 dit la
   * même chose du sélecteur de filiale : une route dédiée, jamais un paramètre
   * ajouté à une route existante.
   */
  instance.get(
    '/api/filiales/inventaire',
    {
      /* ⚠️ **`lire` + `administration`, et PAS `administration-groupe`.** Le
       * troisième terme n'est pas un cran de sévérité de plus : sa définition dit
       * *« la transaction écrit-elle des lignes de portée Groupe ? »* — c'est une
       * déclaration d'ÉCRITURE (`PerimetreSession`, `CONVENTIONS.md` §17.4). La
       * porter sur un `GET` serait en mésuser, et surtout refuser l'écran à un
       * compte qui a le droit de le lire. Ce qui borne ici est le DOMAINE : un
       * profil sans « administration » est refusé par `deciderAcces`. C'est
       * exactement la déclaration des trois lectures de `src/habilitations/`, et
       * il n'y a pas deux façons de garder le même genre d'écran.
       */
      config: { acces: { action: 'lire', domaine: 'administration' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const inventaire = await avecTransaction(pool, session.perimetre, async (client) =>
        lireInventaire(client, prefixeGroupes, session.perimetre),
      );
      return await reponse.status(200).send(inventaire);
    },
  );

  /* ── Les candidats de l'annuaire — une PROPOSITION ────────────────────
   *
   * ⚠️ **L'entrée se valide AVANT la disponibilité de l'annuaire.** Une base de
   * recherche malformée est malformée qu'un annuaire soit configuré ou non, et
   * rendre 503 enverrait l'exploitant vérifier sa configuration pour une faute de
   * frappe. Même arbitrage que les routes du personnel, et pour le même motif.
   *
   * ⚠️ **L'absence d'annuaire se DIT** (503) plutôt que de se rendre comme une
   * liste vide : « aucun annuaire à interroger » et « rien à proposer » sont deux
   * faits différents, et confondre les deux est le motif des constats Q-201/Q-207.
   */
  instance.get(
    '/api/filiales/candidats-annuaire',
    {
      // Même déclaration que l'inventaire, et pour le même motif : c'est une
      // LECTURE — de l'annuaire, en l'occurrence, et rien d'autre.
      config: { acces: { action: 'lire', domaine: 'administration' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      sessionDe(requete);
      const brut = (requete.query as { base?: unknown } | undefined)?.base;
      if (brut !== undefined && typeof brut !== 'string') {
        throw entreeInvalide('Le paramètre « base » doit être un nom distinctif (DN).');
      }
      const base = typeof brut === 'string' ? brut.trim() : '';
      // Un DN porte au moins un « = » : le refuser ici évite d'envoyer à
      // l'annuaire une valeur dont on sait déjà qu'elle n'en est pas un.
      if (base !== '' && !base.includes('=')) {
        throw entreeInvalide(
          'Le paramètre « base » doit être un nom distinctif : OU=Sites,DC=exemple,DC=interne. ' +
            `Reçu : « ${base} ».`,
        );
      }

      if (auth === undefined || !auth.annuaireDisponible()) {
        throw new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message:
            'L’annuaire n’est pas configuré sur ce déploiement (`AUTH_LDAP_ACTIF=non`) : il ' +
            'n’y a rien à proposer. Les filiales se déclarent alors à la main — ce qui reste ' +
            'le chemin normal : l’annuaire ne connaît pas vos filiales, il connaît des unités ' +
            'd’organisation.',
        });
      }

      const lu = await auth.unitesOrganisationAnnuaire(base === '' ? null : base);
      if (lu === undefined) return await reponse.status(200).send({ unites: [], tronque: false });

      // Ce que le produit connaît DÉJÀ : l'écran doit distinguer « à déclarer »
      // de « déjà là », sinon on propose de créer ce qui existe.
      const connues = await avecTransaction(pool, sessionDe(requete).perimetre, async (client) => {
        // Même motif que l'inventaire : un `select` direct perdrait les filiales que
        // le périmètre de la session ne couvre pas, et l'écran proposerait de créer
        // ce qui existe déjà (migration `065`).
        const { rows } = await client.query<{ code: string; raison_sociale: string }>(
          `select "code", "raison_sociale" from f_filiales_inventaire()`,
        );
        return rows;
      });
      const deja = new Set([
        ...connues.map((f) => f.code.toUpperCase()),
        ...connues.map((f) => f.raison_sociale.toLocaleUpperCase('fr')),
      ]);

      return await reponse.status(200).send({
        unites: lu.unites.map((u) => ({
          ...u,
          // ⚠️ Une PROPOSITION de code, pas une décision : l'administrateur la
          // corrige. Les lettres et chiffres de la tête du nom, en majuscules,
          // bornés à dix — c'est le domaine de `ck_filiales_code`.
          code_propose: u.nom
            .toLocaleUpperCase('fr')
            .replace(/[^A-Z0-9]/gu, '')
            .slice(0, 10),
          deja_declaree: deja.has(u.nom.toLocaleUpperCase('fr')),
        })),
        tronque: lu.tronque,
      });
    },
  );
}
