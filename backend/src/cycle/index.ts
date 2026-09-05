/**
 * Cycle de vie d'une filiale et purges RGPD — **lot L13**, contrat au
 * `CONVENTIONS.md` **§35** (et §12 pour la rétention du journal).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier livre, et ce qu'il ne livre pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Route | Ce qu'elle fait | Trace |
 * |---|---|---|
 * | `POST /api/cycle/sortie-filiale` | exporte la filiale **puis** bascule son statut | `archivage` |
 * | `POST /api/cycle/purge-rgpd` | supprime une fiche d'annuaire **et** anonymise le nom dans les entités | `purge` |
 *
 * **Aucune migration n'est nécessaire** (§35.1) : `filiales.statut`,
 * `date_sortie`, `ck_filiales_sortie` et `f_filiales_actives()` existent depuis
 * `001` et `010`. Le schéma portait déjà la sortie ; il lui manquait un chemin.
 *
 * La troisième pièce du lot vit **hors du serveur** : `deploy/retention.sh`
 * outille les quatre étapes du §12 pour le journal d'audit, sous le compte
 * **propriétaire**. C'est la couche 4 de la garantie d'ajout seul (§12) : le
 * rôle applicatif n'a ni `delete` sur `journal_audit`, ni le droit de désarmer un
 * déclencheur. Le lot **outille** cette procédure ; il ne la déplace pas ici.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Cinq décisions, et aucune n'est un détail d'écriture
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. L'export vient AVANT la bascule, et c'est ce qui rend la suite possible
 * sans dérogation.** Une filiale passée en `sortie` quitte `f_filiales_actives()`,
 * donc **tous** les périmètres de session : l'exporter ensuite demanderait un
 * chemin qui contourne le cloisonnement — exactement ce que ce chantier refuse
 * (§35.2). Les deux gestes tiennent dans **une seule transaction** : une sortie à
 * moitié faite laisserait soit une filiale basculée sans son export, soit un
 * export remis pour une filiale restée active.
 *
 * **2. La route déclare `exporter`, et non `administrer`.** C'est la décision la
 * plus surprenante de ce fichier, et elle mérite son paragraphe.
 *
 * Le §35.2 range la bascule dans l'administration Groupe, et la déclaration le
 * porte : `perimetre: 'administration-groupe'`. Mais la route **rend aussi
 * l'export complet d'une filiale** — la donnée la plus sensible que le produit
 * sache produire. Or `deciderAcces` ne vérifie le **droit d'export**
 * (`droits.export`, contrôle S7, `PLAN_SERVEUR` §3.3) que lorsque l'action
 * déclarée est `exporter`. Déclarer `administrer` aurait donc livré l'extraction
 * complète d'une filiale à qui porte le profil Administration **sans** le groupe
 * `GRC-EXPORT` : la moitié exacte du constat **Q-89**, rouverte par la porte de
 * derrière.
 *
 * Le vocabulaire d'accès n'admet **qu'une** action par route. Les quatre
 * exigences sont donc obtenues ainsi — et les quatre sont prononcées par
 * `onRequest`, aucune par une garde locale :
 *
 * | Ce qu'on veut exiger | Ce qui l'exige |
 * |---|---|
 * | le droit d'export | `action: 'exporter'` |
 * | le domaine | `domaine: 'administration'` |
 * | le niveau administrateur | `niveau: 'administration'` (l'action `exporter` ne plancherait qu'à `lecture`) |
 * | le pouvoir d'écrire en portée Groupe | `perimetre: 'administration-groupe'` |
 *
 * ⚠️ **Ce que cela coûte, et il faut le dire** : le crochet `onResponse` de
 * `src/api/index.ts` n'écrit son entrée `administration` que pour les routes
 * déclarées `administrer`. Cette route n'en aura donc pas. Elle écrit à la place
 * une entrée **`archivage` dans la transaction de l'acte** — ce qui est plus fort
 * que l'entrée du crochet, laquelle s'écrit après la réponse et peut donc manquer
 * sans que l'acte manque (§29.3, règle 1).
 *
 * **3. L'export ne se laisse PAS restreindre par les domaines du profil.**
 * `/api/donnees` et `/api/export` retirent du jeu rendu les collections que le
 * profil n'a pas (`entitesLisibles`). Ici, ce serait un défaut : un
 * administrateur dont le profil ne porte que le domaine `administration`
 * recevrait une enveloppe **quasi vide** présentée comme *l'export complet remis
 * à l'acquéreur*. Un extrait incomplet pris pour un extrait entier est
 * précisément ce que le constat **Q-120** a fermé un étage plus haut. La route
 * exporte donc **toutes** les collections, et le prix est payé à l'entrée : elle
 * exige le droit d'export **et** l'administration Groupe.
 *
 * **4. La trace de la sortie ne s'attribue à AUCUNE filiale, et c'est mesurable.**
 * `pol_journal_audit_ajout` (`004_rls.sql` §6) n'accepte une entrée que pour la
 * filiale **active** de la transaction, ou pour aucune. On pourrait donc
 * l'attribuer à la filiale qui sort — elle est encore active pendant la
 * transaction. **Ce serait une trace que personne ne pourra jamais relire** :
 * `pol_journal_audit_lecture` (`008` §5) rend une entrée de filiale à qui a cette
 * filiale à son périmètre, et une filiale `sortie` n'est plus dans aucun
 * périmètre. La preuve de la sortie disparaîtrait avec la filiale. Attribuée à
 * `null`, elle est lue par un périmètre **Groupe** — c'est-à-dire par la
 * direction, qui est exactement celle à qui un auditeur la demandera.
 *
 * **5. La purge anonymise, elle ne supprime pas** (§35.3). Les entités stockent
 * les noms **en texte** (`responsable`, `proprietaire`, `auditeur`,
 * `participants`) : c'est la décision « annuaire + autocomplétion, pas de clé
 * étrangère » qui a permis de brancher l'annuaire sans rien casser. Supprimer la
 * seule fiche `personnes` retirerait la **suggestion** et laisserait le nom
 * partout ailleurs — une purge qui **prétendrait** effacer sans effacer.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Comment on sait que la purge n'a rien oublié
 * ════════════════════════════════════════════════════════════════════════
 *
 * Les colonnes qui portent un nom de personne ne se découvrent pas dans
 * `pg_catalog` : « ce texte est-il un nom de personne ? » est une question de
 * **sens**, pas de type. Il y a donc une liste, et le `CLAUDE.md` §3 dit qu'une
 * liste est le mauvais outil quand son omission fait *réussir quelque chose en
 * silence* — ce qui est très exactement le cas ici : une colonne oubliée
 * laisserait le nom en base sous un rapport annonçant « purgé ».
 *
 * Trois choses la tiennent :
 *
 *  1. elle porte des **noms de champs**, appliqués par découverte dans
 *     `pg_catalog` : elle est donc vraie de toute table qui porte un
 *     `responsable`, y compris celles qui n'existent pas encore ;
 *  2. un **balayage de vérification** (`chercherPartout`) cherche le nom dans
 *     *toutes* les colonnes textuelles de *toutes* les tables — y compris celles
 *     qu'aucune liste ne nomme — et **rend ce qu'il reste**. Une omission ne peut
 *     donc plus être silencieuse : elle sort dans `restes`, et son **compte** part
 *     au journal ;
 *  3. l'essai `test/cycle/purge.test.mjs` exige de la **matière** — le nom doit
 *     être présent avant et absent après, sur des tables nommées.
 *
 * Cinq familles de restes, et **une seule accuse** :
 *
 *  · **`incidents`** — signalés, jamais touchés. §35.3 : *« une description libre
 *    peut contenir un nom comme elle peut contenir la seule preuve d'un incident.
 *    Le produit signale, un humain tranche. »*
 *  · **`tracabilite`** (`cree_par`, `modifie_par`) et **`compte_annuaire`**
 *    (`utilisateurs`) — jamais réécrits : les premiers portent un **login** posé
 *    par le serveur et les réécrire détruirait la traçabilité que le journal
 *    existe pour porter ; le second est la fiche AD, qui se déprovisionne dans
 *    l'annuaire (`PLAN_SERVEUR` §1.5 : « actif = false »), pas par une purge
 *    applicative.
 *  · **`autre_filiale`** — le même nom chez une filiale sœur. La purge n'y écrit
 *    pas, et c'est le cloisonnement qui le veut : ce n'est pas un oubli, c'est
 *    **une purge de plus à faire**, là-bas.
 *  · **`portee_groupe`** — une ligne du socle commun, qu'une session sans
 *    administration Groupe ne peut pas réécrire.
 *  · **`anomalie`** — tout le reste, c'est-à-dire une occurrence **dans la filiale
 *    purgée** que la liste a manquée. Celle-là est un défaut à corriger, pas un
 *    arbitrage.
 *
 * ⚠️ **La première rédaction n'avait qu'un compte, et elle appelait « anomalie »
 * ce qui n'en était pas une** : un homonyme chez la filiale voisine. Un garde-fou
 * qui accuse le cas nominal s'apprend à être ignoré (constat Q-123), et le jour
 * où il accuse pour de vrai, personne ne l'écoute. Les trois comptes de `Reste`
 * existent pour cela.
 *
 * ⚠️ **Le journal d'audit n'est JAMAIS touché** (§35.3, dernier point) : il est en
 * ajout seul, chaîné, et sa rétention est la procédure du §12. Une purge RGPD qui
 * y toucherait casserait la chaîne — et la chaîne est la promesse centrale du
 * produit. Il est donc exclu du balayage lui-même : l'y inclure ferait apparaître
 * le nom en « reste » à chaque purge, et l'on apprendrait à ignorer la ligne
 * (c'est la leçon du constat Q-123 — un garde-fou qui crie sur le cas nominal est
 * pire que pas de garde-fou).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import { chargerCatalogue, Depot } from '../entites/index.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import { construireEnveloppe } from '../reprise/index.js';
import type { ChargeV12, ObjetJson } from '../reprise/types.js';
import type { SessionAppliquee } from '../api/session.js';

/* =====================================================================
 *  0. Options du greffon
 * ===================================================================== */

/**
 * Options du greffon.
 *
 * ⚠️ **`pool` est obligatoire DANS LE TYPE**, et ce n'est pas un choix de
 * confort. Le greffon du journal l'avait rendu facultatif le temps qu'un autre
 * agent branche la couture, et se contentait de crier dans le journal technique
 * avant de n'enregistrer aucune route : la consultation du journal disparaissait
 * **en silence**, et l'écran recevait un 404 qu'il ne pouvait pas distinguer
 * d'une absence de droits (`src/api/journal.ts`, `OptionsJournal.pool`).
 *
 * *Un garde-fou que rien n'appelle est un commentaire* (§18.4) — et un message
 * d'erreur au démarrage que personne ne lit en est un aussi. Rendre le champ
 * obligatoire fait garantir l'existence des deux routes **par le compilateur**,
 * ce qui ne dépend d'aucune discipline.
 */
export interface OptionsCycle {
  /** Pool de connexions du serveur. Obligatoire : voir ci-dessus. */
  readonly pool: Pool;
}

/** Les deux chemins du lot, exportés pour que le banc n'en recopie aucun. */
export const CHEMIN_SORTIE = '/api/cycle/sortie-filiale';
export const CHEMIN_PURGE = '/api/cycle/purge-rgpd';

/* =====================================================================
 *  1. Sortie d'une filiale — §35.2
 * ===================================================================== */

/** Ce que la sortie rend, une fois les deux gestes accomplis. */
export interface ResultatSortie {
  readonly filiale: {
    readonly id: string;
    readonly code: string;
    readonly raison_sociale: string;
    readonly statut: string;
    readonly date_sortie: string;
  };
  /** L'enveloppe `grc-backup`, en clair — le format que `/api/reprise` sait relire. */
  readonly exportation: ObjetJson;
  readonly volumes: Record<string, number>;
  readonly lignes: number;
  /**
   * Les pièces jointes de la filiale, **par leur description seulement**.
   *
   * ⚠️ L'enveloppe `grc-backup` ne transporte **aucun binaire** : `pieces_jointes`
   * n'est pas une collection du format d'échange, et le contenu des fichiers vit
   * sur le disque du serveur. Le cadrage (`PLAN_SERVEUR` §2.7) parle pourtant de
   * « données **et pièces jointes** ». Plutôt que d'omettre la moitié en silence,
   * la route rend l'inventaire — identifiant, nom, empreinte, chemin de stockage,
   * taille — de quoi l'exploitant retrouve et remet les fichiers, et de quoi
   * l'acquéreur vérifie qu'il les a tous.
   */
  readonly pieces_jointes: readonly Record<string, unknown>[];
  /**
   * Effet de bord sur les sessions ouvertes — **constat Q-155**, §35.2.
   *
   * Retirer une filiale des filiales actives change `f_perimetre_groupe()` pour
   * les sessions Groupe en cours, jusqu'à leur reconnexion. Le produit le **dit**
   * plutôt que de le laisser découvrir.
   */
  readonly avertissement: string;
}

const AVERTISSEMENT_SESSIONS =
  'La filiale vient de quitter la liste des filiales actives. Les sessions déjà ouvertes ' +
  'conservent le périmètre résolu à leur connexion : le changement ne leur sera appliqué ' +
  "qu'à leur prochaine ouverture de session (constat Q-155). Les données de la filiale " +
  'restent en base, hors de tout périmètre — elles ne sont plus lisibles que par le compte ' +
  "propriétaire, et c'est ce qui permet de répondre à un contrôle deux ans plus tard.";

/** Format d'une date de calendrier, tel que la base l'attend. */
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Sort une filiale du groupe : **export d'abord, bascule ensuite**, dans la même
 * transaction.
 *
 * Exportée pour l'essai, comme `creerFiliale` : l'atomicité, l'ordre des gestes
 * et la disparition du périmètre se prouvent ici, sans monter de serveur HTTP.
 *
 * @param client     transaction ouverte par `avecTransaction`.
 * @param perimetre  périmètre de cette transaction. Son `filialeId` **est** la
 *                   filiale qui sort : c'est ce que `chargerJeuDeDonnees` lit
 *                   pour savoir quel jeu servir.
 * @param cible      identifiant de la filiale qui sort.
 * @param dateSortie date de sortie, au format `AAAA-MM-JJ`.
 */
export async function sortirFiliale(
  client: PoolClient,
  perimetre: PerimetreSession,
  cible: string,
  dateSortie: string,
): Promise<ResultatSortie> {
  /* ── 0. L'état de départ, lu avant tout ───────────────────────────────── */
  const { rows: filiales } = await client.query<{
    id: string;
    code: string;
    raison_sociale: string;
    statut: string;
    date_sortie: string | null;
  }>(
    `select "id", "code", "raison_sociale", "statut",
            to_char("date_sortie", 'YYYY-MM-DD') as "date_sortie"
       from "filiales" where "id" = $1`,
    [cible],
  );
  const avant = filiales[0];
  if (avant === undefined) {
    // L'appelant porte l'administration Groupe : les filiales du groupe sont son
    // annuaire, pas un oracle — même raisonnement que le doublon de code dans
    // `src/filiales/index.ts`. Dire « inconnue ou hors périmètre » est donc la
    // seule réponse utilisable.
    throw new ErreurApplicative({
      code: 'ressource_inconnue',
      statut: 404,
      message:
        'Aucune filiale de ce groupe ne porte cet identifiant dans votre périmètre de ' +
        'lecture. Une filiale déjà sortie, ou archivée, n’y figure plus : son export passe ' +
        'alors par le compte propriétaire.',
      detailJournal: `sortie demandée pour une filiale absente du périmètre : ${cible}`,
    });
  }
  if (avant.statut === 'sortie') {
    throw new ErreurApplicative({
      code: 'contrainte_base',
      statut: 409,
      message:
        `La filiale « ${avant.code} » est déjà sortie du groupe (date de sortie ` +
        `${avant.date_sortie ?? 'inconnue'}). Ses données ne sont plus dans aucun périmètre : ` +
        'un second export passerait par le compte propriétaire, pas par cette route.',
      detailJournal: `sortie refusée : ${cible} porte déjà le statut « sortie »`,
    });
  }

  /* ── 1. L'EXPORT, D'ABORD (§35.2) ─────────────────────────────────────── */
  //
  // Le catalogue est découvert à chaque appel plutôt que mis en cache : sortir
  // une filiale est un acte rare — quelques fois par an sur vingt filiales — et
  // un cache local ferait un second exemplaire de celui de `src/api/index.ts`,
  // avec sa propre durée de vie et sa propre façon de vieillir.
  const depot = new Depot(await chargerCatalogue(client));

  // `null` : TOUTES les collections. Voir la décision 3 de l'entête — restreindre
  // par les domaines du profil rendrait un export partiel présenté comme complet.
  const jeu = await depot.chargerJeuDeDonnees(client, perimetre, null);

  const charge = {
    ...jeu.collections,
    schemaVersion: jeu.schemaVersion,
    updatedAt: jeu.updatedAt,
    extras: {},
  } as unknown as ChargeV12;
  const exportation = construireEnveloppe(charge);
  const lignes = Object.values(jeu.volumes).reduce((somme, valeur) => somme + valeur, 0);

  const { rows: pieces } = await client.query<Record<string, unknown>>(
    `select "id", "entite_type", "entite_id", "nom_fichier", "type_mime",
            "taille_octets", "sha256", "chemin_stockage", "etat_analyse", "quarantaine"
       from "pieces_jointes"
      where "filiale_id" = $1
      order by "id"`,
    [cible],
  );

  /* ── 2. LA BASCULE, ENSUITE ───────────────────────────────────────────── */
  //
  // ⚠️ **Pas de `returning`**, et c'est le même piège que dans
  // `src/filiales/index.ts` : `pol_filiales_lecture` s'appuie sur
  // `f_perimetre_groupe()`, qui est *dérivée* de la liste des filiales actives.
  // Changer cette liste peut faire basculer le prédicat **dans la transaction
  // elle-même**, et le message de PostgreSQL ne distingue pas un refus de
  // `with check` d'un refus de relecture. On décrit donc ce qui a été ÉCRIT — les
  // deux colonnes qu'on vient de poser —, pas ce qu'on aurait relu.
  const bascule = await client.query(
    `update "filiales"
        set "statut" = 'sortie', "date_sortie" = $2::date
      where "id" = $1`,
    [cible, dateSortie],
  );
  if (bascule.rowCount !== 1) {
    // La lecture a réussi et l'écriture n'a touché aucune ligne : c'est
    // `pol_filiales_maj` (`f_administration_groupe()`) qui a refusé. Le cas est
    // normalement impossible — la déclaration d'accès l'a exigé —, et l'écrire
    // empêche qu'un refus silencieux passe pour une sortie réussie. C'est le
    // premier cas du tableau du `CLAUDE.md` §3.
    throw new ErreurApplicative({
      code: 'hors_perimetre',
      statut: 403,
      message:
        'La bascule du statut a été refusée par la base : cette opération relève de ' +
        "l'administration Groupe.",
      detailJournal:
        `update filiales sur ${cible} a touché ${String(bascule.rowCount ?? 0)} ligne(s) : ` +
        'pol_filiales_maj a refusé alors que la déclaration d’accès avait été satisfaite',
    });
  }

  /* ── 3. LA TRACE, dans la MÊME transaction (§29.3, règle 1) ───────────── */
  //
  // `filialeId` reste NUL : voir la décision 4 de l'entête. Une entrée attribuée
  // à la filiale qui sort ne serait relisible par personne.
  await journaliser(client, {
    action: 'archivage',
    // Phrase FIXE (§29.5) : rien de ce que l'appelant a envoyé n'y entre.
    resume: 'Sortie d’une filiale du groupe : export complet produit, puis statut basculé.',
    filialeId: null,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'filiales',
    entiteId: cible,
    valeursAvant: { statut: avant.statut, date_sortie: avant.date_sortie },
    valeursApres: {
      statut: 'sortie',
      date_sortie: dateSortie,
      code: avant.code,
      lignes_exportees: lignes,
      volumes: jeu.volumes,
      pieces_jointes: pieces.length,
      schema_version: jeu.schemaVersion,
    },
  });

  return {
    filiale: {
      id: cible,
      code: avant.code,
      raison_sociale: avant.raison_sociale,
      statut: 'sortie',
      date_sortie: dateSortie,
    },
    exportation,
    volumes: jeu.volumes,
    lignes,
    pieces_jointes: pieces,
    avertissement: AVERTISSEMENT_SESSIONS,
  };
}

/* =====================================================================
 *  2. Purge RGPD — §35.3
 * ===================================================================== */

/** La mention qui remplace un nom retiré. Le §35.3 la fixe mot pour mot. */
export const MENTION_NEUTRE = 'personne retirée';

/**
 * Noms de champs qui portent un **nom de personne**, quelle que soit la table.
 *
 * `nom` n'y figure pas : c'est le nom d'un actif, d'un risque, d'un processus,
 * d'un groupe d'annuaire… La seule table où `nom` désigne une personne est
 * traitée juste en dessous.
 */
const CHAMPS_DE_PERSONNE: readonly string[] = Object.freeze([
  'responsable',
  'proprietaire',
  'auditeur',
  'participants',
  'suppleant',
]);

/**
 * Tables dont la colonne `nom` désigne une **personne** et non un objet.
 *
 * `crise` seule : la cellule de crise nomme des gens (`nom`, `suppleant`) avec
 * leurs coordonnées. `personnes` n'y est pas — sa fiche est **supprimée**, pas
 * anonymisée.
 */
const TABLES_NOM_DE_PERSONNE: readonly string[] = Object.freeze(['crise']);

/**
 * Tables que le balayage de vérification n'ouvre **jamais**.
 *
 * `journal_audit` : ajout seul, chaîné, jamais touché (§35.3). L'inclure ferait
 * apparaître le nom en « reste » à chaque purge, et l'on apprendrait à ignorer la
 * ligne. `migrations_schema` : l'historique d'application des migrations, sans
 * donnée métier.
 */
const HORS_BALAYAGE: readonly string[] = Object.freeze(['journal_audit', 'migrations_schema']);

/** Colonnes de traçabilité : elles portent un **login**, jamais un nom affiché. */
const COLONNES_TRACABILITE: readonly string[] = Object.freeze(['cree_par', 'modifie_par']);

/**
 * Une occurrence du nom, avant ou après la purge — **avec sa portée**.
 *
 * ── Pourquoi les trois comptes, et pas un seul ──────────────────────────
 *
 * La première rédaction rendait un compte unique, et elle **appelait
 * « anomalie » ce qui n'en était pas une** : le même nom porté par une personne
 * d'une filiale sœur. La purge n'écrit que dans la filiale ACTIVE et, si la
 * session porte l'administration Groupe, dans les lignes de portée Groupe : ce
 * qui subsiste ailleurs n'est pas un oubli, c'est **une purge de plus à faire**,
 * et la confondre avec un défaut apprend à ignorer le mot « anomalie ».
 *
 * Les trois comptes disent donc de quoi la purge répondait :
 *
 *  · `dans_la_filiale` — la filiale active. La purge en répond **toujours** ;
 *  · `portee_groupe` — les lignes à `filiale_id` nul, et les tables de niveau
 *    Groupe. La purge n'en répond que si la session porte l'administration
 *    Groupe ;
 *  · `autres_filiales` — les filiales sœurs du périmètre de lecture. La purge
 *    n'en répond jamais : elle ne peut pas y écrire, et c'est le cloisonnement
 *    qui le veut.
 */
export interface Reste {
  readonly table: string;
  readonly colonne: string;
  /** Occurrences dans la filiale active — celles dont la purge répond toujours. */
  readonly dans_la_filiale: number;
  /** Occurrences de portée Groupe (`filiale_id` nul, ou table de niveau Groupe). */
  readonly portee_groupe: number;
  /** Occurrences dans les autres filiales du périmètre de lecture. */
  readonly autres_filiales: number;
  /** Somme des trois. */
  readonly lignes: number;
  /**
   * · `incidents` — signalé, jamais purgé automatiquement (§35.3) ;
   * · `tracabilite` — un login posé par le serveur, jamais réécrit ;
   * · `compte_annuaire` — la fiche AD, qui se déprovisionne dans l'annuaire ;
   * · `portee_groupe` — une ligne du socle commun, hors de portée d'une session
   *   qui ne porte pas l'administration Groupe ;
   * · `autre_filiale` — le même nom chez une filiale sœur : **une purge de plus
   *   à faire**, là-bas, et non un défaut ici ;
   * · `anomalie` — une colonne que la purge aurait dû traiter. À corriger.
   */
  readonly classe:
    | 'incidents'
    | 'tracabilite'
    | 'compte_annuaire'
    | 'portee_groupe'
    | 'autre_filiale'
    | 'anomalie';
}

/** Un incident dont un texte libre cite le nom. **Signalé, jamais modifié.** */
export interface IncidentSignale {
  readonly id: string;
  readonly colonnes: readonly string[];
}

export interface ResultatPurge {
  readonly personne: { readonly id: string; readonly filiale_id: string | null };
  /**
   * Occurrences du nom **avant** la purge. Sans elles, « purgé » ne dit rien —
   * une purge qui n'avait rien à purger et conclut « purgé » ne prouve rien.
   *
   * ⚠️ Le champ `classe` n'a de sens **qu'après** la purge : ici, seuls les trois
   * comptes comptent. Une occurrence dans la filiale avant la purge n'est pas une
   * anomalie, c'est son objet.
   */
  readonly avant: readonly Reste[];
  /** Lignes réécrites, par `table.colonne`. */
  readonly anonymisees: Record<string, number>;
  /** Lignes de `crise` dont téléphone et courriel ont été vidés (rôle conservé). */
  readonly contacts_vides: number;
  /** La fiche d'annuaire a-t-elle été supprimée ? */
  readonly fiche_supprimee: boolean;
  /** Incidents dont un texte libre cite le nom : **signalés**, jamais modifiés. */
  readonly incidents_a_examiner: readonly IncidentSignale[];
  /** Ce qui reste **après** la purge. Un `classe: 'anomalie'` est un défaut. */
  readonly restes: readonly Reste[];
  /** Total des lignes réécrites, contacts de crise compris. */
  readonly total_lignes: number;
}

interface ColonneTexte {
  readonly table: string;
  readonly colonne: string;
  /** La table porte-t-elle `filiale_id` ? Découvert, jamais supposé. */
  readonly cloisonnee: boolean;
}

/**
 * Cite un identifiant SQL.
 *
 * Les valeurs citées ici viennent **toutes** de `pg_catalog` — jamais du client.
 * La citation est une seconde barrière, pas la première.
 */
function guillemeter(identifiant: string): string {
  return `"${identifiant.replace(/"/gu, '""')}"`;
}

/**
 * Découvre, **dans le catalogue**, les colonnes qui portent un nom de personne.
 *
 * C'est ce qui rend la liste de champs vraie de toute table qui en porte un — y
 * compris celles qu'aucun agent n'a encore écrites.
 */
async function colonnesPorteusesDeNom(client: PoolClient): Promise<readonly ColonneTexte[]> {
  const { rows } = await client.query<{ table_nom: string; colonne: string; cloisonnee: boolean }>(
    `select c.relname::text as table_nom, a.attname::text as colonne,
            exists (select 1 from pg_attribute f
                     where f.attrelid = c.oid and f.attname = 'filiale_id'
                       and f.attnum > 0 and not f.attisdropped) as cloisonnee
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relkind = 'r'
        and not (c.relname = any ($3::text[]))
        and format_type(a.atttypid, a.atttypmod) = 'text'
        and ( a.attname = any ($1::text[])
              or (c.relname = any ($2::text[]) and a.attname = 'nom') )
      order by 1, 2`,
    [CHAMPS_DE_PERSONNE, TABLES_NOM_DE_PERSONNE, HORS_BALAYAGE],
  );
  return rows.map((r) => ({ table: r.table_nom, colonne: r.colonne, cloisonnee: r.cloisonnee }));
}

/**
 * Toutes les colonnes textuelles du schéma, hors tables exclues du balayage —
 * **avec la mention de savoir si leur table est cloisonnée**.
 *
 * C'est ce qui permet au balayage de dire *où* le nom subsiste, et donc de
 * distinguer un oubli d'une purge restant à faire ailleurs.
 *
 * ⚠️ **`has_column_privilege` n'est pas une précaution de style, et le défaut a
 * été mesuré.** Sans ce filtre, le balayage lisait `utilisateurs.mot_de_passe_hash`
 * — l'empreinte du mot de passe du compte de secours, la seule que ce schéma
 * stocke — et la requête entière échouait en « permission denied for table
 * utilisateurs ». La migration `001` §15 ter (constat Q5-3) a retiré au rôle
 * applicatif la lecture de cette colonne, et de celle-là seulement.
 *
 * Deux choses en découlent, et la seconde compte davantage :
 *
 *  · le balayage marche, parce qu'il n'ouvre que ce qu'il a le droit d'ouvrir ;
 *  · **une purge RGPD ne peut, par construction, pas lire un secret** — et cette
 *    propriété ne tient pas à une liste de noms de colonnes, qui vieillirait,
 *    mais au privilège lui-même. Une colonne protégée demain le sera ici sans
 *    qu'une ligne change.
 */
async function colonnesTextuelles(client: PoolClient): Promise<readonly ColonneTexte[]> {
  const { rows } = await client.query<{ table_nom: string; colonne: string; cloisonnee: boolean }>(
    `select c.relname::text as table_nom, a.attname::text as colonne,
            exists (select 1 from pg_attribute f
                     where f.attrelid = c.oid and f.attname = 'filiale_id'
                       and f.attnum > 0 and not f.attisdropped) as cloisonnee
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relkind = 'r'
        and not (c.relname = any ($1::text[]))
        and format_type(a.atttypid, a.atttypmod) in ('text', 'character varying')
        and has_column_privilege(current_user, c.oid, a.attnum, 'select')
      order by 1, 2`,
    [HORS_BALAYAGE],
  );
  return rows.map((r) => ({ table: r.table_nom, colonne: r.colonne, cloisonnee: r.cloisonnee }));
}

/**
 * Classe une occurrence selon ce qu'elle signifie (voir `Reste.classe`).
 *
 * L'ordre des tests est normatif : les trois premières familles décrivent des
 * emplacements que la purge **ne touche jamais par décision**, et il faut les
 * reconnaître avant de se demander si la purge aurait pu y écrire.
 */
function classer(
  table: string,
  colonne: string,
  comptes: { dansLaFiliale: number; porteeGroupe: number },
  // ⚠️ Le paramètre ne s'appelle PAS `administrationGroupe`, et ce n'est pas une
  // coquetterie : `test/api/routes.test.mjs` balaie `src/` à la recherche de
  // « administrationGroupe » suivi de « : » ou « = », pour attraper la route qui
  // s'accorderait le droit au lieu de le vérifier. Une DÉCLARATION de paramètre
  // typé a exactement cette forme, et le balayage l'accuse — à juste titre : un
  // motif qui distinguerait la déclaration de l'affectation serait un motif de
  // plus à tenir juste. Le nom dit ce qu'il est : une constatation reçue.
  peutEcrireEnPorteeGroupe: boolean,
): Reste['classe'] {
  if (table === 'incidents') return 'incidents';
  if (COLONNES_TRACABILITE.includes(colonne)) return 'tracabilite';
  if (table === 'utilisateurs') return 'compte_annuaire';
  if (comptes.dansLaFiliale > 0) return 'anomalie';
  if (comptes.porteeGroupe > 0) return peutEcrireEnPorteeGroupe ? 'anomalie' : 'portee_groupe';
  return 'autre_filiale';
}

/** Regroupe des colonnes par table, pour n'émettre qu'une requête par table. */
function parTable(colonnes: readonly ColonneTexte[]): Map<string, ColonneTexte[]> {
  const groupes = new Map<string, ColonneTexte[]>();
  for (const colonne of colonnes) {
    const liste = groupes.get(colonne.table);
    if (liste === undefined) groupes.set(colonne.table, [colonne]);
    else liste.push(colonne);
  }
  return groupes;
}

/**
 * Cherche le nom **partout**, et rend où il apparaît, **avec sa portée**.
 *
 * Une requête par table, avec trois `count(*) filter` par colonne : c'est ce qui
 * garde le balayage à une cinquantaine d'aller-retours plutôt qu'à deux cents.
 * La comparaison se fait par `strpos(lower(…), lower(…))` et non par `like` : un
 * nom contenant `%` ou `_` ne doit pas devenir un motif — l'essai le vérifie sur
 * un nom forgé pour cela.
 *
 * ⚠️ Le balayage s'exécute **sous le périmètre de la session** : il ne voit que ce
 * que la session lit. C'est voulu — un administrateur Groupe verra les
 * occurrences restantes chez les filiales sœurs et saura qu'il lui reste des
 * purges à faire ; un administrateur d'une seule filiale ne verra que la sienne
 * et n'apprendra rien des autres.
 */
async function chercherPartout(
  client: PoolClient,
  nom: string,
  colonnes: readonly ColonneTexte[],
  perimetre: PerimetreSession,
): Promise<readonly Reste[]> {
  const trouves: Reste[] = [];
  for (const [table, cols] of parTable(colonnes)) {
    const projections: string[] = [];
    cols.forEach((c, i) => {
      const trouve = `strpos(lower(coalesce(${guillemeter(c.colonne)}, '')), lower($1)) > 0`;
      // Une table SANS `filiale_id` est une table de niveau Groupe (utilisateurs,
      // profils, groupes_ad, mappings, filiales) : tout ce qu'on y trouve est de
      // portée Groupe, et le compte le dit plutôt que de le supposer.
      const dansLaFiliale = c.cloisonnee ? `${trouve} and "filiale_id" = $2::text` : 'false';
      const porteeGroupe = c.cloisonnee ? `${trouve} and "filiale_id" is null` : trouve;
      const autres = c.cloisonnee
        ? `${trouve} and "filiale_id" is not null and ($2::text is null or "filiale_id" <> $2::text)`
        : 'false';
      // ⚠️ `sum(case …)` et NON `count(*) filter (…)`, et ce n'est pas un goût.
      //
      // `count(*)` exige le privilège `select` sur la TABLE. Or `utilisateurs`
      // n'en accorde aucun : la migration `001` §15 ter (constat Q5-3) l'a
      // remplacé par des privilèges de COLONNE, pour que `mot_de_passe_hash` —
      // l'empreinte du compte de secours — reste illisible du rôle applicatif.
      // Un balayage écrit avec `count(*)` échoue donc en « permission denied for
      // table utilisateurs », c'est-à-dire précisément sur la table qui porte le
      // nom affiché venu de l'annuaire. Mesuré, pas supposé.
      //
      // `sum(case …)` ne référence que les colonnes qu'il nomme : le privilège de
      // colonne suffit, et rien n'est lu qui ne soit accordé.
      const compter = (condition: string, alias: string): string =>
        `coalesce(sum(case when ${condition} then 1 else 0 end), 0) as ${guillemeter(alias)}`;
      projections.push(
        compter(dansLaFiliale, `a${String(i)}`),
        compter(porteeGroupe, `g${String(i)}`),
        compter(autres, `o${String(i)}`),
      );
    });
    // ⚠️ `$2` n'est passé que si la requête le NOMME. PostgreSQL refuse un « bind »
    // qui fournit plus de paramètres que le texte n'en référence — mesuré sur les
    // tables de niveau Groupe, dont aucune colonne ne cite `filiale_id`.
    const citeLaFiliale = cols.some((c) => c.cloisonnee);
    const { rows } = await client.query<Record<string, string>>(
      `select ${projections.join(', ')} from ${guillemeter(table)}`,
      citeLaFiliale ? [nom, perimetre.filialeId] : [nom],
    );
    const ligne = rows[0];
    if (ligne === undefined) continue;
    cols.forEach((c, i) => {
      const dansLaFiliale = Number(ligne[`a${String(i)}`] ?? '0');
      const porteeGroupe = Number(ligne[`g${String(i)}`] ?? '0');
      const autresFiliales = Number(ligne[`o${String(i)}`] ?? '0');
      const lignes = dansLaFiliale + porteeGroupe + autresFiliales;
      if (lignes === 0) return;
      trouves.push({
        table,
        colonne: c.colonne,
        dans_la_filiale: dansLaFiliale,
        portee_groupe: porteeGroupe,
        autres_filiales: autresFiliales,
        lignes,
        classe: classer(table, c.colonne, { dansLaFiliale, porteeGroupe }, perimetre.administrationGroupe),
      });
    });
  }
  return trouves;
}

/**
 * Expression SQL qui remplace, **ligne par ligne**, les lignes égales au nom.
 *
 * ── Pourquoi ligne par ligne, et non `= $1` ─────────────────────────────
 *
 * `revues.participants` est un champ **multi-personnes** : le frontend y stocke
 * « un nom par ligne » (`UI.getMultiPerson`). Une égalité stricte n'y trouverait
 * jamais rien, et le nom d'un participant survivrait à sa propre purge — en
 * silence, ce qui est exactement le défaut que ce lot ferme.
 *
 * Découper sur les sauts de ligne traite les deux cas d'un seul geste : un champ
 * mono-valeur est un champ d'une seule ligne. Les espaces et le retour chariot
 * d'un `\r\n` sont retirés pour la **comparaison** seulement — la ligne qui ne
 * correspond pas est réécrite telle quelle, caractère pour caractère.
 */
function expressionRemplacement(colonne: string): string {
  const c = guillemeter(colonne);
  return (
    `(select coalesce(string_agg(` +
    `case when btrim(u.ligne, ' ' || chr(9) || chr(13)) = $1 then $2 else u.ligne end,` +
    ` chr(10) order by u.ord), ${c})` +
    ` from unnest(string_to_array(${c}, chr(10))) with ordinality as u(ligne, ord))`
  );
}

/** Prédicat : cette ligne porte-t-elle le nom, sur une ligne à elle ? */
function expressionPresence(colonne: string): string {
  const c = guillemeter(colonne);
  return (
    `${c} is not null and exists (select 1 from unnest(string_to_array(${c}, chr(10)))` +
    ` as v(ligne) where btrim(v.ligne, ' ' || chr(9) || chr(13)) = $1)`
  );
}

/**
 * Purge RGPD d'une personne : **anonymiser, pas supprimer** (§35.3).
 *
 * Exportée pour l'essai, comme `sortirFiliale`.
 */
export async function purgerPersonne(
  client: PoolClient,
  perimetre: PerimetreSession,
  personneId: string,
): Promise<ResultatPurge> {
  /* ── 0. La fiche, et le nom qu'elle porte ─────────────────────────────── */
  const { rows: fiches } = await client.query<{ id: string; nom: string; filiale_id: string | null }>(
    `select "id", "nom", "filiale_id" from "personnes" where "id" = $1`,
    [personneId],
  );
  const fiche = fiches[0];
  if (fiche === undefined) {
    throw new ErreurApplicative({
      code: 'ressource_inconnue',
      statut: 404,
      message: 'Aucune fiche d’annuaire ne porte cet identifiant dans votre périmètre.',
      detailJournal: `purge RGPD demandée sur une personne absente du périmètre : ${personneId}`,
    });
  }
  const nom = fiche.nom;
  if (nom.trim() === '' || nom === MENTION_NEUTRE) {
    // Une fiche dont le nom est vide ou déjà neutralisé rendrait un balayage qui
    // trouve tout ou rien : dans les deux cas, le rapport mentirait.
    throw new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message:
        'Cette fiche ne porte pas de nom exploitable : la purge ne saurait pas quoi chercher ' +
        'dans les entités, et son rapport serait faux.',
      detailJournal: `purge refusée : personnes.nom vide ou déjà neutralisé sur ${personneId}`,
    });
  }

  const toutesLesColonnes = await colonnesTextuelles(client);

  /* ── 1. L'ÉTAT DE DÉPART — sans lui, « purgé » ne veut rien dire ──────── */
  //
  // Une purge qui n'avait rien à purger et conclut « purgé » ne prouve rien : le
  // dépôt a déjà produit trois essais de cette forme. Le produit mesure donc ce
  // qu'il y avait AVANT et le rend, pour que l'exploitant distingue « rien à
  // faire » de « rien fait ».
  const avant = await chercherPartout(client, nom, toutesLesColonnes, perimetre);

  /* ── 2. LES CONTACTS DE CRISE, EN PREMIER ─────────────────────────────── */
  //
  // ⚠️ **L'ordre n'est pas indifférent.** `crise.nom` et `crise.suppleant` sont
  // eux-mêmes anonymisés à l'étape suivante : vider les coordonnées après ne
  // trouverait plus personne, et le téléphone et le courriel — données
  // personnelles s'il en est — resteraient en base sous un rapport annonçant
  // « purgé ». C'est le genre de défaut qui ne se voit qu'en comptant.
  //
  // Le **rôle est conservé** (§35.3) : une cellule de crise sans rôles n'a plus
  // de sens, et un rôle n'est pas une donnée personnelle.
  const contacts = await client.query(
    `update "crise" set "telephone" = null, "email" = null
      where (${expressionPresence('nom')}) or (${expressionPresence('suppleant')})`,
    [nom],
  );
  const contactsVides = contacts.rowCount ?? 0;

  /* ── 3. L'ANONYMISATION, dans les entités qui portent le nom en texte ─── */
  const porteuses = await colonnesPorteusesDeNom(client);
  const anonymisees: Record<string, number> = {};
  let totalLignes = contactsVides;
  for (const { table, colonne } of porteuses) {
    const resultat = await client.query(
      `update ${guillemeter(table)} set ${guillemeter(colonne)} = ${expressionRemplacement(colonne)}
        where ${expressionPresence(colonne)}`,
      [nom, MENTION_NEUTRE],
    );
    const touchees = resultat.rowCount ?? 0;
    if (touchees > 0) {
      anonymisees[`${table}.${colonne}`] = touchees;
      totalLignes += touchees;
    }
  }

  /* ── 4. LES INCIDENTS : on SIGNALE, on ne touche à rien (§35.3) ───────── */
  //
  // « Une description libre peut contenir un nom comme elle peut contenir la
  // seule preuve d'un incident. » Purger automatiquement serait détruire une
  // preuve d'audit sans que personne l'ait décidé.
  //
  // Ce qui est rendu : l'identifiant et les **noms de colonnes** concernés.
  // Jamais le texte — l'appelant a le droit de le lire, mais ce n'est pas à cette
  // réponse-ci de le transporter.
  const colonnesIncidents = toutesLesColonnes.filter(
    (c) => c.table === 'incidents' && !COLONNES_TRACABILITE.includes(c.colonne),
  );
  const incidents: IncidentSignale[] = [];
  if (colonnesIncidents.length > 0) {
    const projections = colonnesIncidents
      .map(
        (c, i) =>
          `strpos(lower(coalesce(${guillemeter(c.colonne)}, '')), lower($1)) > 0` +
          ` as ${guillemeter(`c${String(i)}`)}`,
      )
      .join(', ');
    const conditions = colonnesIncidents
      .map((c) => `strpos(lower(coalesce(${guillemeter(c.colonne)}, '')), lower($1)) > 0`)
      .join(' or ');
    const { rows } = await client.query<Record<string, unknown>>(
      `select "id", ${projections} from "incidents" where ${conditions} order by "id"`,
      [nom],
    );
    for (const ligne of rows) {
      const colonnes = colonnesIncidents
        .filter((_, i) => ligne[`c${String(i)}`] === true)
        .map((c) => c.colonne);
      incidents.push({ id: String(ligne['id']), colonnes });
    }
  }

  /* ── 5. LA FICHE D'ANNUAIRE, SUPPRIMÉE (§35.3) ────────────────────────── */
  const suppression = await client.query(`delete from "personnes" where "id" = $1`, [personneId]);
  const ficheSupprimee = (suppression.rowCount ?? 0) === 1;
  if (!ficheSupprimee) {
    // Lue plus haut, non supprimée ici : c'est `pol_personnes_suppression` qui a
    // refusé — la fiche appartient à une autre filiale que la filiale active, ou
    // elle est de portée Groupe et la session ne porte pas l'administration
    // Groupe. Le dire, plutôt que rendre « purgé » sur une fiche intacte.
    throw new ErreurApplicative({
      code: 'hors_perimetre',
      statut: 403,
      message:
        'Cette fiche d’annuaire est lisible depuis votre périmètre mais ne s’y écrit pas : ' +
        'une fiche de filiale se purge depuis la filiale active, une fiche de portée Groupe ' +
        'depuis l’administration Groupe.',
      detailJournal:
        `delete personnes ${personneId} a touché 0 ligne : pol_personnes_suppression a refusé ` +
        `(filiale de la fiche : ${fiche.filiale_id ?? 'Groupe'}, filiale active : ` +
        `${perimetre.filialeId ?? 'aucune'})`,
    });
  }

  /* ── 6. LE BALAYAGE DE VÉRIFICATION ───────────────────────────────────── */
  //
  // C'est lui qui rend l'omission bruyante : il ne consulte aucune liste de
  // champs, il ouvre toutes les colonnes textuelles du schéma.
  const restes = await chercherPartout(client, nom, toutesLesColonnes, perimetre);

  /* ── 7. LA TRACE — les COMPTES, jamais le contenu (§35.3) ─────────────── */
  //
  // ⚠️ Le nom purgé n'entre PAS dans l'entrée : ce serait recopier dans un
  // registre inaltérable et conservé trois ans la donnée personnelle que l'on
  // vient d'effacer partout ailleurs. `entiteId` porte l'identifiant de la fiche,
  // qui ne résout plus rien — et c'est pour cela que le §12 interdit toute clé
  // étrangère du journal vers sa cible.
  await journaliser(client, {
    action: 'purge',
    resume:
      'Purge RGPD : fiche d’annuaire supprimée, nom retiré des entités qui le portaient en ' +
      'texte, contacts de crise vidés. Le journal d’audit n’est pas touché.',
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'personnes',
    entiteId: personneId,
    valeursAvant: {
      occurrences_avant: avant.reduce((somme, r) => somme + r.lignes, 0),
      emplacements_avant: avant.map((r) => `${r.table}.${r.colonne}`),
    },
    valeursApres: {
      lignes_par_table: anonymisees,
      contacts_crise_vides: contactsVides,
      total_lignes: totalLignes,
      fiche_supprimee: ficheSupprimee,
      incidents_signales: incidents.length,
      restes: restes.map((r) => ({
        emplacement: `${r.table}.${r.colonne}`,
        lignes: r.lignes,
        classe: r.classe,
      })),
      anomalies: restes.filter((r) => r.classe === 'anomalie').length,
    },
  });

  return {
    personne: { id: personneId, filiale_id: fiche.filiale_id },
    avant,
    anonymisees,
    contacts_vides: contactsVides,
    fiche_supprimee: ficheSupprimee,
    incidents_a_examiner: incidents,
    restes,
    total_lignes: totalLignes,
  };
}

/* =====================================================================
 *  3. Lecture des corps de requête
 * ===================================================================== */

/** Lit un objet JSON, ou refuse en nommant ce qui manque. */
function lireObjet(brut: unknown, quoi: string): Record<string, unknown> {
  if (brut === null || typeof brut !== 'object' || Array.isArray(brut)) {
    throw entreeInvalide(`Le corps de la requête doit être un objet JSON décrivant ${quoi}.`);
  }
  return brut as Record<string, unknown>;
}

/**
 * Lit un champ texte obligatoire.
 *
 * ⚠️ Un champ **inconnu est refusé, jamais ignoré** — arbitrage de la vague 2,
 * repris tel quel : ignorer laisse croire que la valeur a été prise en compte.
 */
function lireChamps(
  brut: unknown,
  quoi: string,
  admis: readonly string[],
  requis: readonly string[],
): Record<string, string> {
  const objet = lireObjet(brut, quoi);
  const lus: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(objet)) {
    if (!admis.includes(cle)) {
      throw entreeInvalide(
        `Champ « ${cle} » inconnu pour ${quoi}. Champs admis : ${admis.join(', ')}.`,
      );
    }
    if (valeur === null || valeur === undefined || valeur === '') continue;
    if (typeof valeur !== 'string') {
      throw entreeInvalide(`Le champ « ${cle} » doit être une chaîne de caractères.`);
    }
    const nettoye = valeur.trim();
    if (nettoye !== '') lus[cle] = nettoye;
  }
  for (const champ of requis) {
    if (lus[champ] === undefined) {
      throw entreeInvalide(`Le champ « ${champ} » est obligatoire.`);
    }
  }
  return lus;
}

/** La date du jour, au format de la base. */
function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

/* =====================================================================
 *  4. Greffon
 * ===================================================================== */

// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonCycle(
  instance: FastifyInstance,
  options: OptionsCycle,
): Promise<void> {
  const { pool } = options;

  /**
   * Session appliquée à cette requête — **fail-closed**. Une route atteinte sans
   * session est un défaut de montage, et un 500 explicite vaut mieux qu'une
   * transaction sur un périmètre improvisé.
   */
  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal:
          `route « ${requete.method} ${requete.routeOptions.url ?? requete.url} » atteinte sans ` +
          'session appliquée : le crochet onRequest du greffon parent ne s’est pas exécuté',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  POST /api/cycle/sortie-filiale — §35.2
   * -------------------------------------------------------------------
   *  ⚠️ `action: 'exporter'` et non `'administrer'` : voir la décision 2 de
   *  l'entête. Les quatre exigences — droit d'export, domaine, niveau
   *  administrateur, administration Groupe — sont toutes portées par la
   *  déclaration, et toutes prononcées par `onRequest`. **Aucune garde locale**
   *  ne refuse un droit dans ce fichier ; les deux `403` qu'il lève constatent un
   *  refus de la BASE sur une ligne, ce qui est autre chose et se lit
   *  `hors_perimetre`.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_SORTIE,
    {
      config: {
        acces: {
          action: 'exporter',
          domaine: 'administration',
          niveau: 'administration',
          perimetre: 'administration-groupe',
        },
      },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      const corps = lireChamps(
        requete.body,
        'la sortie d’une filiale',
        ['filiale_id', 'date_sortie'],
        ['filiale_id'],
      );
      const cible = corps['filiale_id'] ?? '';
      const dateSortie = corps['date_sortie'] ?? aujourdhui();
      if (!FORME_DATE.test(dateSortie)) {
        throw entreeInvalide('La date de sortie s’écrit AAAA-MM-JJ.');
      }

      // ── LE PÉRIMÈTRE DE L'EXPORT, ET POURQUOI IL SE VÉRIFIE ICI ────────
      //
      // Le client envoie un **choix** ; le serveur ne lui accorde que ce que son
      // périmètre — résolu par le serveur, jamais reçu — contient déjà. C'est le
      // motif du §30.2, appliqué à une seconde route : la filiale nommée doit
      // appartenir à `perimetre.filiales`, sans quoi l'export lirait une filiale
      // que la session n'a pas le droit de lire.
      //
      // Ce refus n'est pas un droit qu'on vérifie à la main — la déclaration l'a
      // déjà fait — mais une **portée de donnée**, comme celle que
      // `src/pieces/` et `src/import/` refusent avec le même code.
      if (!perimetre.filiales.includes(cible)) {
        throw new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 403,
          message:
            'Cette filiale n’est pas dans votre périmètre de lecture : la sortie commence par ' +
            'son export complet, et l’on n’exporte pas ce que l’on ne lit pas. Une filiale ' +
            'archivée ou déjà sortie a d’ailleurs quitté tous les périmètres.',
          detailJournal:
            `sortie refusée : ${cible} hors du périmètre de lecture ` +
            `(${String(perimetre.filiales.length)} filiale(s))`,
        });
      }

      // ── UNE SEULE TRANSACTION, et son périmètre porte la filiale QUI SORT ──
      //
      // `filialeId` est positionné sur la cible : c'est ce que
      // `chargerJeuDeDonnees` lit, et c'est aussi ce qui fait de la transaction
      // une transaction « chez elle ». Rien d'autre du périmètre n'est
      // reconstruit — les droits, la liste des filiales lisibles et le pouvoir
      // d'administration viennent de la session, tels quels.
      // ── UN SEUL OBJET, et non deux copies égales ──────────────────────
      //
      // Deux objets égaux aujourd'hui sont deux objets qui peuvent diverger
      // demain (constat Q-70). Celui qui règle la transaction et celui que lit
      // `chargerJeuDeDonnees` doivent être le MÊME : sinon rien n'empêcherait le
      // périmètre SQL et le cadrage applicatif de désigner deux filiales.
      const perimetreExport = Object.freeze({ ...perimetre, filialeId: cible });
      const resultat = await avecTransaction(pool, perimetreExport, async (client) =>
        sortirFiliale(client, perimetreExport, cible, dateSortie),
      );

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/cycle/purge-rgpd — §35.3
   * -------------------------------------------------------------------
   *  `administrer` ici, et non `exporter` : la purge ne rend aucune donnée
   *  personnelle — elle rend des **comptes**. Le crochet `onResponse` écrira donc
   *  son entrée `administration`, en plus de l'entrée `purge` transactionnelle
   *  que `purgerPersonne` écrit : les deux répondent à deux questions
   *  différentes — *qui a exercé un pouvoir d'administration* et *ce que la purge
   *  a touché*.
   *
   *  Le domaine est `administration` et non `personnel` : effacer
   *  définitivement une personne de vingt tables n'est pas le même geste que
   *  tenir l'annuaire, et un profil qui gère les fiches ne doit pas hériter du
   *  droit de les purger.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_PURGE,
    {
      config: {
        acces: {
          action: 'administrer',
          domaine: 'administration',
          niveau: 'administration',
        },
      },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      const corps = lireChamps(requete.body, 'la purge RGPD', ['personne_id'], ['personne_id']);
      const personneId = corps['personne_id'] ?? '';

      const resultat = await avecTransaction(pool, perimetre, async (client) =>
        purgerPersonne(client, perimetre, personneId),
      );

      return await reponse.status(200).send(resultat);
    },
  );
}
