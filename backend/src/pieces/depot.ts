/**
 * Accès à `pieces_jointes` — **des requêtes, et rien d'autre.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Deux règles, et elles ne se négocient pas
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **Tout est paramétré.** Aucune valeur reçue d'un client n'entre dans le
 *     texte d'une requête, jamais. C'est la condition d'entrée E1 du
 *     `CONVENTIONS.md` §22, et elle est ici la **seule** parade tant que les
 *     tables de session restent écrivables sans condition par le rôle applicatif
 *     (§17.4). Les noms de colonnes, eux, sont écrits en clair — ce sont des
 *     constantes du programme, pas des données.
 *  2. **Le cloisonnement n'est pas dans ce fichier.** Il est dans les quatre
 *     politiques de `pieces_jointes` (`004_rls.sql` §3, famille « niveau
 *     filiale ») : lecture sur le périmètre, écriture dans la seule filiale
 *     active. Aucune requête d'ici ne porte de clause `filiale_id` **pour
 *     filtrer** — en écrire une donnerait à croire que le filtrage en dépend, et
 *     ce serait faux dans les deux sens. La seule exception est le calcul du
 *     quota, qui a besoin de la filiale comme **sujet** de la mesure, et non
 *     comme barrière ; le commentaire l'y redit.
 *
 * ⚠️ **`version`, `cree_le` et `cree_par` ne sont jamais nommés à l'insertion.**
 * C'est le troisième piège que la vague 2 a fermé : ces colonnes sont exclues
 * par construction, et `cree_par` reçoit `f_utilisateur_courant()`, qui lit le
 * périmètre posé par `avecTransaction`. Les nommer permettrait à un chemin de
 * les poser lui-même — c'est-à-dire de signer une écriture au nom d'un autre.
 */

import type { PoolClient } from 'pg';

/** Une ligne de `pieces_jointes`, telle que les routes la manipulent. */
export interface LignePiece {
  readonly id: string;
  readonly filiale_id: string;
  readonly entite_type: string;
  readonly entite_id: string;
  readonly nom_fichier: string;
  readonly type_mime: string;
  readonly extension: string | null;
  readonly taille_octets: number;
  readonly sha256: string;
  readonly chemin_stockage: string;
  readonly etat_analyse: string;
  readonly resultat_analyse: string | null;
  readonly signature_virale: string | null;
  readonly date_analyse: Date | null;
  readonly quarantaine: boolean;
  readonly description: string | null;
  /** LA pièce qui fait foi pour son porteur — migration 018, action D1. */
  readonly en_vigueur: boolean;
  /** Numéro de version que le déposant a donné À CE FICHIER. */
  readonly version_piece: string | null;
  readonly version: number;
  readonly cree_le: Date;
  readonly cree_par: string;
}

/**
 * Colonnes rendues aux routes.
 *
 * `chemin_stockage` en fait partie — les routes en ont besoin pour ouvrir le
 * fichier —, mais il **ne sort jamais sur le réseau** : `versLaVue()` le retire.
 * Le publier donnerait à un déposant le moyen de vérifier ses hypothèses sur la
 * façon dont le nom est tiré, ce qui est exactement ce que la dérogation
 * d'unicité de `001_socle.sql` demande de ne pas offrir.
 */
const COLONNES = [
  'id',
  'filiale_id',
  'entite_type',
  'entite_id',
  'nom_fichier',
  'type_mime',
  'extension',
  'taille_octets',
  'sha256',
  'chemin_stockage',
  'etat_analyse',
  'resultat_analyse',
  'signature_virale',
  'date_analyse',
  'quarantaine',
  'description',
  'en_vigueur',
  'version_piece',
  'version',
  'cree_le',
  'cree_par',
] as const;

const LISTE_COLONNES = COLONNES.map((c) => `"${c}"`).join(', ');

/**
 * Ce que la base rend est **délivrable** — contrôle n° 8 du §31.2.
 *
 * *« La ligne n'est visible de l'application qu'après [l'analyse] : une pièce en
 * cours d'analyse n'est jamais délivrable. »* La condition est écrite **ici**,
 * dans une constante partagée par la liste et par la délivrance, plutôt que
 * recopiée dans chaque requête : deux copies d'une même condition finissent par
 * ne plus dire la même chose, et celle-ci est la dernière barrière avant qu'un
 * fichier infecté sorte.
 *
 * Elle est doublement close : l'état doit être `saine` **et** la quarantaine
 * levée. La base garantit déjà qu'une pièce `infectee` est en quarantaine
 * (`ck_pieces_jointes_quarantaine`) ; elle ne garantit pas l'inverse, et une
 * pièce mise en quarantaine par l'exploitation sans changer d'état resterait
 * délivrable si l'on ne regardait que l'état.
 */
const CONDITION_DELIVRABLE = `"etat_analyse" = 'saine' and not "quarantaine"`;

/* =====================================================================
 *  Contrôle n° 2 — le quota de la filiale
 * ===================================================================== */

/**
 * Volume déjà occupé par la filiale, en octets.
 *
 * ⚠️ **La clause `filiale_id = $1` n'est pas une barrière**, c'est le sujet de
 * la mesure : sans elle, une session de périmètre Groupe additionnerait le
 * volume de vingt filiales et refuserait un dépôt de dix kilo-octets. La
 * barrière reste la politique de lecture, qui empêche `$1` de désigner une
 * filiale hors périmètre — la somme serait alors nulle, jamais celle d'une
 * autre.
 *
 * Les pièces en **quarantaine sont comptées** : elles occupent le disque, et une
 * filiale ne doit pas pouvoir remplir la machine en envoyant des fichiers
 * infectés.
 */
export async function volumeFiliale(client: PoolClient, filialeId: string): Promise<number> {
  const resultat = await client.query<{ volume: string }>(
    `select coalesce(sum("taille_octets"), 0)::text as volume
       from "pieces_jointes"
      where "filiale_id" = $1::text`,
    [filialeId],
  );
  return Number(resultat.rows[0]?.volume ?? '0');
}

/* =====================================================================
 *  Écriture
 * ===================================================================== */

/** Ce qu'une insertion demande. Tout est constaté, rien n'est déclaré. */
export interface PieceAInserer {
  readonly id: string;
  readonly filialeId: string;
  readonly entiteType: string;
  readonly entiteId: string;
  readonly nomFichier: string;
  /** Le type **constaté**, jamais celui que le déposant a annoncé (§31.3). */
  readonly typeMime: string;
  readonly extension: string;
  readonly tailleOctets: number;
  readonly sha256: string;
  readonly cheminStockage: string;
  readonly etatAnalyse: 'saine' | 'infectee' | 'erreur';
  readonly resultatAnalyse: string;
  readonly signatureVirale: string | null;
  readonly quarantaine: boolean;
  readonly description: string | null;
  /**
   * Numéro de version du FICHIER, tel que le déposant l'annonce.
   *
   * ⚠️ Il n'est **jamais** contrôlé : « 1.0 », « v2 projet », « Rév. C » sont
   * tous légitimes selon la maison. Ce qui est garanti, c'est qu'il voyage
   * *avec* le fichier — et que `documents.version_document` en soit alimenté
   * plutôt que frappé à côté (migration 018).
   */
  readonly versionPiece: string | null;
}

/**
 * Insère la ligne, **après** l'analyse.
 *
 * `date_analyse` est posée par la requête (`now()`), pas par le serveur
 * d'application : la contrainte `ck_pieces_jointes_analyse` l'exige dès que
 * l'état n'est ni `en_attente` ni `en_cours`, et l'horloge qui fait foi dans le
 * journal d'audit est celle de la base.
 */
export async function inserer(client: PoolClient, piece: PieceAInserer): Promise<LignePiece> {
  const resultat = await client.query<LignePiece>(
    `insert into "pieces_jointes"
            ("id", "filiale_id", "entite_type", "entite_id", "nom_fichier", "type_mime",
             "extension", "taille_octets", "sha256", "chemin_stockage", "etat_analyse",
             "resultat_analyse", "signature_virale", "date_analyse", "quarantaine",
             "description", "version_piece")
     values ($1, $2, $3::type_entite, $4, $5, $6, $7, $8::bigint, $9, $10, $11,
             $12, $13, now(), $14, $15, $16)
     returning ${LISTE_COLONNES}`,
    [
      piece.id,
      piece.filialeId,
      piece.entiteType,
      piece.entiteId,
      piece.nomFichier,
      piece.typeMime,
      piece.extension,
      String(piece.tailleOctets),
      piece.sha256,
      piece.cheminStockage,
      piece.etatAnalyse,
      piece.resultatAnalyse,
      piece.signatureVirale,
      piece.quarantaine,
      piece.description,
      piece.versionPiece,
    ],
  );
  const ligne = resultat.rows[0];
  if (ligne === undefined) throw new Error('insertion de la pièce jointe sans ligne rendue');
  return normaliser(ligne);
}

/* =====================================================================
 *  Lecture
 * ===================================================================== */

/** Pièces **délivrables** attachées à une entité. */
export async function lister(
  client: PoolClient,
  entiteType: string,
  entiteId: string,
): Promise<LignePiece[]> {
  const resultat = await client.query<LignePiece>(
    `select ${LISTE_COLONNES}
       from "pieces_jointes"
      where "entite_type" = $1::type_entite
        and "entite_id" = $2::text
        and ${CONDITION_DELIVRABLE}
      order by "en_vigueur" desc, "cree_le" desc, "id" desc`,
    [entiteType, entiteId],
  );
  return resultat.rows.map(normaliser);
}

/**
 * Une pièce **délivrable**, désignée par son entité et son identifiant.
 *
 * Les trois clés sont exigées ensemble : une pièce d'une autre entité n'est pas
 * délivrable par cette route même si son identifiant est connu. Ce n'est pas le
 * cloisonnement — c'est la RLS qui le tient —, c'est la cohérence de l'URL avec
 * ce qu'elle prétend désigner.
 */
export async function lireDelivrable(
  client: PoolClient,
  entiteType: string,
  entiteId: string,
  pieceId: string,
): Promise<LignePiece | null> {
  const resultat = await client.query<LignePiece>(
    `select ${LISTE_COLONNES}
       from "pieces_jointes"
      where "id" = $1::text
        and "entite_type" = $2::type_entite
        and "entite_id" = $3::text
        and ${CONDITION_DELIVRABLE}`,
    [pieceId, entiteType, entiteId],
  );
  const ligne = resultat.rows[0];
  return ligne === undefined ? null : normaliser(ligne);
}

/**
 * Supprime une pièce et rend la ligne effacée, ou `null`.
 *
 * ⚠️ **`returning` sert à savoir quel fichier retirer du disque**, et le retrait
 * a lieu **après** le `commit` (voir `magasin.retirerDuMagasin`). Le `delete`
 * n'exclut pas les pièces en quarantaine : une pièce infectée doit pouvoir être
 * retirée, sans quoi le quota d'une filiale se remplirait de choses que
 * personne ne peut effacer.
 */
export async function supprimer(
  client: PoolClient,
  entiteType: string,
  entiteId: string,
  pieceId: string,
): Promise<LignePiece | null> {
  const resultat = await client.query<LignePiece>(
    `delete from "pieces_jointes"
      where "id" = $1::text
        and "entite_type" = $2::type_entite
        and "entite_id" = $3::text
     returning ${LISTE_COLONNES}`,
    [pieceId, entiteType, entiteId],
  );
  const ligne = resultat.rows[0];
  return ligne === undefined ? null : normaliser(ligne);
}

/* =====================================================================
 *  La version en vigueur — action D1 de la vague 9
 * ===================================================================== */

/**
 * Démet toutes les pièces « en vigueur » du porteur, et rend combien l'étaient.
 *
 * ⚠️ **Cette requête N'EST PAS le cloisonnement, et elle n'est pas non plus
 * l'unicité.** Le cloisonnement est la politique d'écriture (`filiale_id =
 * f_filiale_ecriture()`), qui fait qu'elle ne touche jamais la pièce d'une
 * autre filiale ; l'unicité est `uq_pieces_jointes_en_vigueur`, qui refuserait
 * la promotion suivante si celle-ci avait manqué quelqu'un. Elle est ici pour
 * une seule raison : **rendre la promotion possible**, l'index étant partiel et
 * strict.
 *
 * Elle est jouée AVANT la promotion, dans la même transaction. L'ordre inverse
 * heurterait l'index — et un `on conflict` serait pire : il masquerait le cas
 * où deux pièces sont déjà en vigueur, c'est-à-dire l'anomalie même que
 * l'index existe pour rendre impossible.
 */
export async function demettreLesEnVigueur(
  client: PoolClient,
  entiteType: string,
  entiteId: string,
): Promise<number> {
  const resultat = await client.query(
    `update "pieces_jointes"
        set "en_vigueur" = false
      where "entite_type" = $1::type_entite
        and "entite_id" = $2::text
        and "en_vigueur"`,
    [entiteType, entiteId],
  );
  return resultat.rowCount ?? 0;
}

/**
 * Marque une pièce **délivrable** comme celle qui fait foi.
 *
 * Rend `null` quand la pièce n'existe pas dans le périmètre, n'appartient pas à
 * ce porteur, ou n'est pas délivrable — les trois se confondent à dessein, pour
 * la même raison que `lireDelivrable` : distinguer renseignerait sur ce qui
 * existe ailleurs.
 *
 * ⚠️ La condition de délivrabilité est écrite ici **en plus** de la contrainte
 * `ck_pieces_jointes_en_vigueur`, et ce n'est pas un doublon inutile : sans
 * elle, désigner un fichier en quarantaine rendrait une **violation de
 * contrainte** — un 409 qui parle de la base — au lieu d'un 404 qui parle du
 * produit. La contrainte reste la barrière ; celle-ci est la politesse.
 */
export async function marquerEnVigueur(
  client: PoolClient,
  entiteType: string,
  entiteId: string,
  pieceId: string,
): Promise<LignePiece | null> {
  const resultat = await client.query<LignePiece>(
    `update "pieces_jointes"
        set "en_vigueur" = true
      where "id" = $1::text
        and "entite_type" = $2::type_entite
        and "entite_id" = $3::text
        and ${CONDITION_DELIVRABLE}
     returning ${LISTE_COLONNES}`,
    [pieceId, entiteType, entiteId],
  );
  const ligne = resultat.rows[0];
  return ligne === undefined ? null : normaliser(ligne);
}

/**
 * Recopie le numéro de version de la pièce en vigueur sur la fiche document.
 *
 * ⚠️ **Rend le nombre de lignes touchées, et l'appelant DOIT le regarder.**
 * `documents` est une table mixte : une politique de portée Groupe n'est
 * modifiable qu'en transaction d'administration Groupe (`004_rls.sql` §4). Une
 * session de filiale qui promeut une pièce sur une telle fiche verrait donc
 * `0` — et si l'appelant l'ignorait, le produit annoncerait « version en
 * vigueur mise à jour » en n'ayant rien écrit. C'est la forme exacte du défaut
 * que ce chantier traque depuis dix passages : **réussir en silence**.
 *
 * `version` (le compteur de verrouillage optimiste) n'est PAS incrémenté ici, et
 * `modifie_le` / `modifie_par` le sont par `trg_documents_maj`. Le choix est
 * délibéré : la version en vigueur est une propriété de la PIÈCE, dont la fiche
 * n'est que le reflet ; incrémenter le compteur ferait échouer l'enregistrement
 * qu'un utilisateur a peut-être ouvert à côté, sans qu'il ait touché au champ.
 */
export async function refleterVersionSurDocument(
  client: PoolClient,
  documentId: string,
  versionPiece: string | null,
): Promise<number> {
  const resultat = await client.query(
    `update "documents"
        set "version_document" = $2::text
      where "id" = $1::text`,
    [documentId, versionPiece],
  );
  return resultat.rowCount ?? 0;
}

/**
 * `taille_octets` est un `bigint` : le pilote le rend en **chaîne**, par
 * prudence de précision. Une pièce plafonne à quelques dizaines de mégaoctets ;
 * la convertir ici évite qu'un `"12"` parte sur le réseau là où l'écran attend
 * un nombre — et qu'une comparaison de quota se fasse entre chaînes.
 */
function normaliser(ligne: LignePiece): LignePiece {
  return { ...ligne, taille_octets: Number(ligne.taille_octets) };
}

/**
 * Vue publique d'une pièce : ce qui part sur le réseau.
 *
 * ⚠️ **`chemin_stockage` est retiré**, et c'est la seule raison d'être de cette
 * fonction. `sha256` reste : c'est ce qui transforme la pièce en preuve
 * vérifiable, et le déposant doit pouvoir le recouper.
 */
export function versLaVue(ligne: LignePiece): Record<string, unknown> {
  const { chemin_stockage: _ignore, ...reste } = ligne;
  return reste;
}
