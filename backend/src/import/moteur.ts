/**
 * Le moteur d'import — **un importeur, vingt configurations dérivées.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les quatre propriétés, et l'endroit exact où chacune est tenue
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Propriété | Où elle est tenue |
 * |---|---|
 * | **tout ou rien** | `avecTransaction`, un seul appel : `appliquer()` ci-dessous. Une erreur, où qu'elle survienne, annule l'import entier |
 * | **idempotent par le FICHIER** | `imports.cle_idempotence` = sha256 des octets reçus, et l'index partiel `uq_imports_idempotence` qui le rend vrai même à deux clics simultanés |
 * | **cloisonné** | `perimetre.filialeId` est la seule filiale d'écriture, et la RLS referme derrière : `avecTransaction` pose les quatre réglages, `f_filiale_ecriture()` refuse le reste |
 * | **journalisé** | une entrée `import` dans la transaction de l'acte (§29.3), plus la ligne `imports` que la table porte pour cela |
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le constat B-3, et pourquoi ce fichier n'a qu'une transaction
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le bloquant **B-3** de la porte S2 est né d'un import qui était une **rafale
 * d'écritures indépendantes** : une coupure de VPN au milieu laissait la filiale
 * à moitié détruite. La parade n'est pas une précaution, c'est une **forme** :
 * `avecTransaction` est le seul endroit du serveur où une transaction s'ouvre,
 * et tout l'import tient dans un seul de ses appels. Il n'existe pas de chemin
 * par lequel la moitié d'un fichier puisse survivre.
 *
 * ── Le point de reprise par ligne, et ce qu'il ne desserre PAS ───────────
 *
 * Un fichier de 250 lignes dont 27 sont fausses doit dire **lesquelles**, pas
 * « échec ». Or PostgreSQL abandonne la transaction entière à la première
 * erreur : sans précaution, le rapport s'arrêterait à la première ligne fautive
 * et l'utilisateur corrigerait son fichier vingt-sept fois.
 *
 * Chaque ligne est donc écrite **sous un point de reprise** (`savepoint`) : une
 * ligne qui échoue est défaite seule, son erreur est nommée, et la lecture
 * continue. ⚠️ **Cela ne rend pas l'import partiel** — à la fin, s'il reste une
 * seule erreur, la transaction **entière** est annulée. Le point de reprise sert
 * à *collecter* les refus, jamais à *survivre* à l'un d'eux.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'import CRÉE. Il ne met pas à jour, et il ne supprime pas.
 * ════════════════════════════════════════════════════════════════════════
 *
 * C'est une décision, pas une lacune, et elle a trois motifs :
 *
 *  1. **L'identifiant vient du serveur** (constat **M-3** de la porte S2). Un
 *     modèle portant une colonne « Identifiant » ferait de chaque ligne un
 *     oracle d'existence inter-filiales — identifiant pris ailleurs → refus,
 *     identifiant libre → succès.
 *  2. **Une clé naturelle par entité serait vingt décisions métier, chacune
 *     fausse dans un cas limite** — deux prestataires homonymes, deux risques au
 *     même intitulé (`CONVENTIONS.md` §33.2, qui l'écrit pour l'idempotence et
 *     dont le raisonnement vaut identiquement ici).
 *  3. **Remplacer un jeu de données entier a déjà sa route** : `POST /api/reprise`,
 *     transactionnelle elle aussi, réservée à l'administration.
 *
 * Conséquence à dire plutôt qu'à taire : `lignes_mises_a_jour` vaut **toujours
 * zéro** pour cette route. La colonne existe pour la reprise ; la remplir d'une
 * valeur inventée serait pire que la laisser nulle.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que le journal d'audit reçoit, et pourquoi ce n'est pas une ligne par ligne
 * ════════════════════════════════════════════════════════════════════════
 *
 * `creer` est appelée avec `sansJournal`, et l'import laisse **une** entrée
 * `import`. L'arbitrage est écrit à `OptionsCreation.sansJournal`
 * (`src/entites/index.ts`) pour la reprise, et il vaut mot pour mot ici :
 *
 * > Ce que le journal doit prouver d'un import n'est pas la ligne, c'est
 * > **l'acte** : qui a repris quel fichier, quand, avec quel effet.
 *
 * ⚠️ Le coût, écrit pour qu'on puisse le refuser : le journal ne répond pas
 * « qui a créé cet incident-ci » pour une ligne importée. Deux choses y
 * répondent quand même — la colonne `cree_par` de la ligne elle-même, et la
 * ligne `imports` qui nomme le fichier, son empreinte et son auteur.
 * ⚠️ La documentation de `sansJournal` dit « le seul appelant légitime est la
 * reprise ». **Ce lot en ajoute un second**, et ce fichier est l'endroit où
 * c'est déclaré, `src/entites/` n'appartenant pas à cet agent.
 */

import { createHash } from 'node:crypto';

import { journaliser } from '../auth/journal.js';
import type { Depot } from '../entites/index.js';
import { engendrerIdentifiant } from '../entites/index.js';
import type { NomEntite } from '../entites/types.js';
import type { PerimetreSession } from '../db/pool.js';
import { avecTransaction } from '../db/pool.js';
import { traduireErreur } from '../erreurs/index.js';
import type { CodeApi, ContexteTraduction } from '../erreurs/index.js';
import type { Pool, PoolClient } from 'pg';

import type { ColonneModele, ModeleEntite } from './modele.js';
import { correspondanceEnTetes } from './modele.js';
import type { Cellule, SourceImport } from './tableur.js';
import { ErreurTableur, LIGNES_MAX, ligneVide, lireTableur } from './tableur.js';

/* =====================================================================
 *  1. Le rapport — ce que l'appelant lit, aperçu comme application
 * ===================================================================== */

export interface ErreurLigne {
  /** Numéro de ligne **dans le tableur de l'utilisateur**, en-tête comprise. */
  readonly ligne: number;
  /** Libellé de la colonne fautive, ou `null` quand l'erreur porte sur la ligne. */
  readonly colonne: string | null;
  /** Valeur refusée, tronquée. Elle vient de l'utilisateur : jamais dans un `resume`. */
  readonly valeur: string | null;
  readonly message: string;
}

export interface RapportImport {
  readonly entite: NomEntite;
  readonly source: SourceImport;
  readonly nomFichier: string;
  readonly sha256: string;
  readonly octets: number;
  /**
   * Vrai si l'appelant a DEMANDÉ un aperçu.
   *
   * ⚠️ Ce champ dit le **mode demandé**, pas l'issue : c'est `applique` qui dit
   * si quoi que ce soit a été écrit. Les confondre a été tenté, et cela faisait
   * répondre « aperçu » à qui avait demandé une application refusée.
   */
  readonly apercu: boolean;
  /** Vrai si, et seulement si, l'import a été validé en base. */
  readonly applique: boolean;
  /**
   * Vrai si **ce fichier exact** a déjà été appliqué à cette filiale et cette
   * entité. Rien n'a été écrit, et ce n'est pas une erreur.
   */
  readonly dejaImporte: boolean;
  /** Ligne `imports` de l'import déjà appliqué, ou de celui-ci. */
  readonly importId: string | null;
  readonly debutLe: string | null;
  readonly lues: number;
  readonly creees: number;
  readonly misesAJour: number;
  readonly ignorees: number;
  readonly enErreur: number;
  /** Bornées à `ERREURS_RAPPORTEES` ; `enErreur` porte le compte réel. */
  readonly erreurs: readonly ErreurLigne[];
  /** En-têtes du fichier qu'aucun champ ne reçoit. Signalées, jamais avalées. */
  readonly colonnesInconnues: readonly string[];
  /** Colonnes obligatoires absentes du fichier. */
  readonly colonnesManquantes: readonly string[];
  /** Champs de liaison que le modèle n'expose pas (voir `modele.ts`). */
  readonly liaisonsExclues: readonly string[];
  /** Phrase destinée à l'utilisateur. */
  readonly message: string;
}

/**
 * Erreurs détaillées rendues au plus.
 *
 * Un fichier dont **toutes** les lignes sont fausses produirait sinon 5 000
 * entrées dans la réponse et autant de lignes dans `import_erreurs`. Le compte
 * réel reste dans `enErreur` : la borne tronque le détail, jamais le chiffre.
 */
export const ERREURS_RAPPORTEES = 200;

/* =====================================================================
 *  2. Conversion d'une cellule vers ce que le champ attend
 * ===================================================================== */

/**
 * ⚠️ **Cette fonction ne VALIDE pas ; elle TRADUIT.**
 *
 * La validation — bornes, formats, listes fermées, chaîne vide interdite — vit
 * dans `convertirPourLaBase` (`src/entites/index.ts`) et dans les contraintes du
 * schéma. La recopier ici ferait deux endroits où se décide la même chose,
 * c'est-à-dire, tôt ou tard, deux réponses différentes à la même question.
 *
 * Ce qui est fait ici, et qu'aucune autre couche ne peut faire : passer de ce
 * qu'un **tableur** porte — un nombre de série pour une date, « oui » pour un
 * booléen, une virgule décimale — à ce que le modèle du navigateur emploie.
 */
export function convertirCellule(
  cellule: Cellule,
  colonne: ColonneModele,
): { valeur: unknown } | { erreur: string } {
  if (cellule === null) return { valeur: null };
  if (typeof cellule === 'string' && cellule.trim() === '') return { valeur: null };

  switch (colonne.type) {
    case 'texte': {
      if (typeof cellule === 'boolean') return { valeur: cellule ? 'oui' : 'non' };
      return { valeur: typeof cellule === 'number' ? String(cellule) : cellule };
    }

    case 'entier':
    case 'nombre': {
      if (typeof cellule === 'number') return { valeur: cellule };
      if (typeof cellule === 'boolean') return { erreur: 'un nombre est attendu' };
      const nombre = lireNombre(cellule);
      return nombre === null ? { erreur: 'un nombre est attendu' } : { valeur: nombre };
    }

    case 'booleen': {
      if (typeof cellule === 'boolean') return { valeur: cellule };
      if (typeof cellule === 'number') {
        if (cellule === 1) return { valeur: true };
        if (cellule === 0) return { valeur: false };
        return { erreur: 'répondez « oui » ou « non »' };
      }
      const mot = cellule.trim().toLowerCase();
      if (MOTS_VRAI.has(mot)) return { valeur: true };
      if (MOTS_FAUX.has(mot)) return { valeur: false };
      return { erreur: 'répondez « oui » ou « non »' };
    }

    case 'date': {
      if (typeof cellule === 'number') {
        // `Math.floor` AVANT la conversion : une série portant une heure
        // (43831,75 = le 1ᵉʳ janvier 2020 à 18 h) arrondirait sinon au jour
        // suivant dès 12 h, et une échéance changerait de date en silence.
        const iso = depuisSerieExcel(Math.floor(cellule));
        return iso === null ? { erreur: 'cette date n’existe pas' } : { valeur: iso.slice(0, 10) };
      }
      if (typeof cellule === 'boolean') return { erreur: 'une date est attendue (AAAA-MM-JJ)' };
      const jour = lireDate(cellule);
      return jour === null
        ? { erreur: 'une date est attendue (AAAA-MM-JJ ou JJ/MM/AAAA)' }
        : { valeur: jour };
    }

    case 'horodatage': {
      if (typeof cellule === 'number') {
        // Un horodatage peut arriver de deux mondes : la série d'un tableur
        // (jours depuis 1899) ou les millisecondes du modèle navigateur. Les
        // deux sont des nombres, et rien dans le fichier ne les distingue —
        // sauf leur ordre de grandeur, qui les sépare de sept chiffres.
        const iso =
          cellule > SERIE_EXCEL_MAX ? depuisMillisecondes(cellule) : depuisSerieExcel(cellule);
        return iso === null ? { erreur: 'cet horodatage n’existe pas' } : { valeur: iso };
      }
      if (typeof cellule === 'boolean') return { erreur: 'un horodatage est attendu' };
      return { valeur: cellule };
    }

    case 'json': {
      if (typeof cellule !== 'string') return { erreur: 'un document JSON est attendu' };
      try {
        const document: unknown = JSON.parse(cellule);
        if (typeof document !== 'object' || document === null) {
          return { erreur: 'un document JSON est attendu (objet ou liste)' };
        }
        return { valeur: document };
      } catch {
        return { erreur: 'ce document JSON est mal formé' };
      }
    }
  }
}

const MOTS_VRAI = new Set(['oui', 'o', 'vrai', 'true', 'yes', 'y', 'x', '1']);
const MOTS_FAUX = new Set(['non', 'n', 'faux', 'false', 'no', '0']);

/** Au-delà de cette série, le nombre est une durée en millisecondes, pas un jour. */
const SERIE_EXCEL_MAX = 2_958_465; // 9999-12-31

/**
 * Lit un nombre saisi dans un tableur.
 *
 * Les séparateurs de milliers — espace ordinaire, insécable, insécable étroite —
 * sont retirés, et la **virgule décimale** est acceptée : c'est ce qu'écrit un
 * tableur configuré en français, et refuser « 3,5 » à un utilisateur français
 * serait refuser pour rien.
 *
 * ⚠️ La virgule n'est acceptée **que** comme séparateur décimal unique
 * (`3,5`), jamais comme séparateur de milliers (`1,500`) : les deux usages
 * coexistent selon les pays, et deviner lequel s'applique ferait de 1,500 tantôt
 * mille cinq cents, tantôt un et demi. Une valeur ambiguë est refusée, avec son
 * numéro de ligne.
 */
export function lireNombre(texte: string): number | null {
  const propre = texte.replace(/[\s\u00a0\u202f\u2009]/gu, '').trim();
  if (propre === '') return null;
  if (/^[+-]?\d+(?:,\d+)?$/u.test(propre)) {
    const nombre = Number(propre.replace(',', '.'));
    return Number.isFinite(nombre) ? nombre : null;
  }
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(propre)) {
    const nombre = Number(propre);
    return Number.isFinite(nombre) ? nombre : null;
  }
  return null;
}

/** Lit une date ISO (`AAAA-MM-JJ`) ou française (`JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`). */
export function lireDate(texte: string): string | null {
  const propre = texte.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/u.exec(propre);
  if (iso !== null) return jourValide(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const francaise = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u.exec(propre);
  if (francaise !== null) {
    return jourValide(Number(francaise[3]), Number(francaise[2]), Number(francaise[1]));
  }
  return null;
}

/** Rend `AAAA-MM-JJ` si le jour existe vraiment (le 31 février n'existe pas). */
function jourValide(annee: number, mois: number, jour: number): string | null {
  if (!Number.isInteger(annee) || annee < 1 || annee > 9999) return null;
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) return null;
  if (!Number.isInteger(jour) || jour < 1 || jour > 31) return null;
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1) return null;
  if (date.getUTCDate() !== jour) return null;
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

/**
 * Convertit une **série de date de tableur** en horodatage ISO.
 *
 * Le repère est le 30 décembre 1899 : c'est ce qui compense, pour toutes les
 * dates postérieures au 1ᵉʳ mars 1900, le 29 février 1900 que Lotus 1-2-3 croyait
 * exister et qu'Excel a conservé par compatibilité.
 *
 * ⚠️ **Les séries 1 à 60 sont donc décalées d'un jour** par rapport à ce
 * qu'affiche Excel — c'est-à-dire les dates de janvier et février 1900. Ce n'est
 * pas corrigé : aucune donnée de gouvernance cyber ne porte une date de 1900, et
 * un correctif pour une plage que personne n'emploie serait du code que rien ne
 * mord. Le dire vaut mieux que le taire (`CONVENTIONS.md` §17.5).
 */
export function depuisSerieExcel(serie: number): string | null {
  if (!Number.isFinite(serie) || serie < 1 || serie > SERIE_EXCEL_MAX) return null;
  const repere = Date.UTC(1899, 11, 30);
  const millisecondes = repere + Math.round(serie * 86_400_000);
  const date = new Date(millisecondes);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function depuisMillisecondes(valeur: number): string | null {
  if (!Number.isFinite(valeur)) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/* =====================================================================
 *  3. Analyse du fichier — pure, hors transaction
 * ===================================================================== */

interface LigneAConstruire {
  readonly numero: number;
  readonly champs: Record<string, unknown>;
}

interface Analyse {
  readonly source: SourceImport;
  readonly lues: number;
  readonly ignorees: number;
  readonly aConstruire: readonly LigneAConstruire[];
  readonly erreurs: readonly ErreurLigne[];
  readonly colonnesInconnues: readonly string[];
  readonly colonnesManquantes: readonly string[];
}

/** Tronque une valeur d'utilisateur avant de la citer dans un rapport. */
function citer(cellule: Cellule | undefined): string | null {
  if (cellule === null || cellule === undefined) return null;
  const texte = String(cellule);
  return texte.length > 120 ? `${texte.slice(0, 117)}...` : texte;
}

/**
 * Lit le fichier et prépare les enregistrements — **sans toucher à la base**.
 *
 * Analyser avant d'ouvrir une transaction n'est pas une commodité : c'est ce qui
 * fait qu'un fichier illisible, hors borne ou mal en-tête ne consomme **aucune
 * connexion du pool**. Dix imports simultanés d'un fichier refusé suffisaient
 * autrement à faire répondre 500 à tout lecteur ordinaire (constat **Q-20**).
 */
export function analyserFichier(modele: ModeleEntite, contenu: Buffer): Analyse {
  const { source, tableur } = lireTableur(contenu);
  const correspondance = correspondanceEnTetes(modele, tableur.enTetes);

  const erreurs: ErreurLigne[] = [];

  if (correspondance.doublons.length > 0) {
    erreurs.push({
      ligne: tableur.ligneEnTetes,
      colonne: null,
      valeur: correspondance.doublons.join(', '),
      message:
        'Cette colonne apparaît plusieurs fois dans le fichier : retirez le doublon, sinon ' +
        'la valeur retenue dépendrait de l’ordre des colonnes.',
    });
  }

  /* ── LA COLONNE OBLIGATOIRE ABSENTE DU FICHIER ─────────────────────
   *
   *  ⚠️ **Ce refus a manqué à la première rédaction, et son absence produisait
   *  exactement le défaut que ce lot existe pour fermer.** Un fichier de trente
   *  incidents sans colonne « Titre » rendait **200, zéro erreur, zéro ligne
   *  créée** : chaque ligne était bien écartée — l'obligatoire manquait — mais
   *  aucune n'émettait d'erreur, pour ne pas répéter trente fois la même
   *  phrase. Le compte tombait donc à zéro **en silence**, et l'utilisateur
   *  lisait « import réussi ». C'est le premier cas du tableau du `CLAUDE.md`
   *  §3 — *quelque chose réussit en silence alors que c'est faux*.
   *
   *  Le fait est celui du FICHIER, pas de la ligne : il est donc dit **une
   *  fois**, sur la ligne d'en-tête, et il suffit à faire refuser l'import.
   * ------------------------------------------------------------------- */
  if (correspondance.manquantes.length > 0) {
    erreurs.push({
      ligne: tableur.ligneEnTetes,
      colonne: null,
      valeur: null,
      message:
        `Ce fichier n'a pas de colonne « ${correspondance.manquantes
          .map((colonne) => colonne.libelle)
          .join(' », « ')} », et cette valeur est obligatoire. ` +
        'Repartez du modèle téléchargeable, puis recommencez.',
    });
  }

  const aConstruire: LigneAConstruire[] = [];
  let ignorees = 0;

  for (const ligne of tableur.lignes) {
    if (ligneVide(ligne.cellules)) {
      // Une ligne vide au milieu d'un fichier est une respiration, pas une
      // donnée. Elle est COMPTÉE (`lignes_ignorees`) plutôt que passée sous
      // silence : « 250 lignes lues, 3 ignorées » se vérifie ; « 247 créées »
      // seul laisse croire à une perte.
      ignorees += 1;
      continue;
    }

    const champs: Record<string, unknown> = {};
    let ligneFautive = false;

    correspondance.parPosition.forEach((colonne, position) => {
      if (colonne === null) return;
      const cellule = ligne.cellules[position] ?? null;
      const resultat = convertirCellule(cellule, colonne);
      if ('erreur' in resultat) {
        ligneFautive = true;
        erreurs.push({
          ligne: ligne.numero,
          colonne: colonne.libelle,
          valeur: citer(cellule),
          message: `Colonne « ${colonne.libelle} » : ${resultat.erreur}.`,
        });
        return;
      }
      // Une valeur absente n'est PAS écrite : le champ est omis, et la valeur
      // par défaut du schéma s'applique. Envoyer `null` écraserait ce défaut.
      if (resultat.valeur !== null) champs[colonne.champ] = resultat.valeur;
    });

    // Les obligatoires manquantes se disent ici, ligne par ligne, plutôt que
    // par un `23502` de PostgreSQL traduit après coup : le message nomme la
    // colonne telle qu'elle est écrite dans le fichier.
    for (const colonne of modele.colonnes) {
      if (!colonne.obligatoire) continue;
      if (champs[colonne.champ] !== undefined) continue;
      // Une colonne absente du fichier est déjà signalée en tête du rapport :
      // la répéter sur chacune des 250 lignes noierait tout le reste.
      if (correspondance.manquantes.some((manquante) => manquante.champ === colonne.champ)) {
        ligneFautive = true;
        continue;
      }
      ligneFautive = true;
      erreurs.push({
        ligne: ligne.numero,
        colonne: colonne.libelle,
        valeur: null,
        message: `Colonne « ${colonne.libelle} » : cette valeur est obligatoire.`,
      });
    }

    if (!ligneFautive) aConstruire.push({ numero: ligne.numero, champs });
  }

  return {
    source,
    lues: tableur.lignes.length,
    ignorees,
    aConstruire,
    erreurs,
    colonnesInconnues: correspondance.inconnues,
    colonnesManquantes: correspondance.manquantes.map((colonne) => colonne.libelle),
  };
}

/* =====================================================================
 *  4. L'application — une transaction, et une seule
 * ===================================================================== */

/**
 * Sentinelle d'annulation volontaire.
 *
 * Elle sert à deux choses qui se ressemblent et qu'il ne faut pas confondre :
 * l'**aperçu**, qui écrit vraiment puis défait tout pour ne rien laisser ; et le
 * **refus**, qui défait tout parce qu'une ligne au moins est fausse. Dans les
 * deux cas, `avecTransaction` voit une exception et émet son `rollback` — c'est
 * la seule façon d'annuler sans que ce fichier ouvre une transaction lui-même.
 */
class AnnulationVolontaire extends Error {
  public override readonly name = 'AnnulationVolontaire';
  constructor(public readonly motif: 'apercu' | 'erreurs' | 'doublon') {
    super(`import annulé volontairement : ${motif}`);
  }
}

export interface OptionsImport {
  readonly pool: Pool;
  readonly depot: Depot;
  readonly modele: ModeleEntite;
  readonly perimetre: PerimetreSession;
  readonly nomFichier: string;
  readonly contenu: Buffer;
  /** `true` : on mesure et on annule. Rien n'est écrit, et le rapport le dit. */
  readonly apercu: boolean;
  readonly adresseIp?: string | null;
  /**
   * Ce que la traduction des refus doit savoir du schéma — unicités,
   * validations, noms d'objets internes —, découvert dans le catalogue par
   * l'appelant. Sans lui, un refus de la base reste compréhensible mais moins
   * précis ; avec lui, il nomme la colonne fautive.
   */
  readonly contexteErreurs?: ContexteTraduction;
  /**
   * Colonnes portées par chaque contrainte du schéma (`check`, clé étrangère,
   * unicité), **découvertes dans le catalogue** par l'appelant.
   *
   * Elles servent à répondre à la seule question que le message traduit ne
   * répond pas toujours : *quelle colonne de MON fichier*. Un refus de la base
   * nomme une contrainte ; l'utilisateur, lui, ne connaît que l'en-tête de sa
   * colonne. La correspondance est dérivée, jamais écrite.
   */
  readonly colonnesParContrainte?: ReadonlyMap<string, readonly string[]>;
}

/** Ligne `imports` d'un import déjà appliqué. */
interface ImportAnterieur {
  readonly id: string;
  readonly debut_le: Date;
}

/**
 * Exécute un import.
 *
 * @throws {ErreurTableur} fichier illisible ou hors borne — **avant** toute
 *   connexion à la base.
 */
export async function executerImport(options: OptionsImport): Promise<RapportImport> {
  const { pool, depot, modele, perimetre, contenu, apercu } = options;
  const filialeId = perimetre.filialeId;
  if (filialeId === null) {
    // Ne devrait pas arriver : la route l'exige avant d'appeler. Écrit quand
    // même, parce qu'un import sans filiale active écrirait « quelque part ».
    throw new ErreurTableur(
      'Aucune filiale active : sélectionnez la filiale dans laquelle importer ce fichier.',
    );
  }

  const sha256 = createHash('sha256').update(contenu).digest('hex');
  const analyse = analyserFichier(modele, contenu);

  const commun = {
    entite: modele.entite,
    source: analyse.source,
    nomFichier: options.nomFichier,
    sha256,
    octets: contenu.length,
    misesAJour: 0,
    lues: analyse.lues,
    ignorees: analyse.ignorees,
    colonnesInconnues: analyse.colonnesInconnues,
    colonnesManquantes: analyse.colonnesManquantes,
    liaisonsExclues: modele.liaisonsExclues,
  };

  /**
   * Le DÉTAIL, borné — et le COMPTE, qui ne l'est pas.
   *
   * ⚠️ Les deux sont séparés depuis qu'ils ont été confondus : la liste étant
   * triée par numéro de ligne avant d'être rendue, un marqueur de troncature
   * glissé dedans se serait retrouvé **en tête** et aurait chassé les vraies
   * erreurs de la fenêtre rendue. Le compte, lui, doit rester exact quel que
   * soit le nombre de lignes fausses.
   */
  const erreurs: ErreurLigne[] = [...analyse.erreurs];
  let nombreEnErreur = analyse.erreurs.length;
  let creees = 0;
  let anterieur: ImportAnterieur | null = null;
  let importId: string | null = null;

  try {
    await avecTransaction(pool, perimetre, async (client) => {
      /* ── L'idempotence, d'abord : ce fichier a-t-il déjà été appliqué ? ──
       *
       *  Cette lecture est une COURTOISIE — elle donne un message clair. La
       *  barrière, elle, est l'index partiel `uq_imports_idempotence` : deux
       *  clics simultanés passent tous deux ce `select`, et c'est l'index qui
       *  refuse le second. Confondre les deux serait le défaut classique du
       *  contrôle-puis-agit.
       */
      anterieur = await lireImportAnterieur(client, filialeId, modele.entite, sha256);
      if (anterieur !== null) throw new AnnulationVolontaire('doublon');

      for (const ligne of analyse.aConstruire) {
        // ⚠️ Un point de reprise par ligne : il permet de COLLECTER les refus,
        // il ne fait pas survivre l'import à l'un d'eux (voir l'entête).
        await client.query('savepoint pr_import_ligne');
        try {
          await depot.creer(client, perimetre, modele.entite, ligne.champs, {
            // Une entrée d'audit par ligne ferait 5 000 entrées chaînées pour
            // un acte unique. Voir l'entête, et `OptionsCreation.sansJournal`.
            sansJournal: true,
          });
          await client.query('release savepoint pr_import_ligne');
          creees += 1;
        } catch (erreur) {
          // ⚠️ Si le POINT DE REPRISE lui-même ne peut pas être défait, la
          // transaction n'est plus utilisable : continuer la boucle
          // fabriquerait 5 000 « lignes fausses » à partir d'une connexion
          // perdue. On relaie l'erreur d'origine, qui est la vraie.
          try {
            await client.query('rollback to savepoint pr_import_ligne');
          } catch {
            throw erreur;
          }

          // ⚠️ **Une panne n'est pas une ligne fausse.** `traduireErreur` est le
          // seul endroit du serveur qui décide ce qu'un refus veut dire, et il
          // garantit qu'aucun nom d'objet interne ne sort. On lui demande donc
          // le message ET le code : les codes ci-dessous désignent un problème
          // de DONNÉE, imputable à la ligne ; tout le reste — pool saturé, base
          // injoignable, défaut de programmation — abandonne l'import entier
          // plutôt que d'accuser le fichier de l'utilisateur.
          const refus = traduireErreur(erreur, options.contexteErreurs ?? {});
          if (!REFUS_DE_LIGNE.has(refus.code)) throw erreur;
          const colonne = colonneEnCause(erreur, modele, options.colonnesParContrainte);
          nombreEnErreur += 1;
          // Au-delà de la borne, on cesse de constituer le DÉTAIL — mais on
          // continue de COMPTER : le rapport doit dire combien de lignes sont
          // fausses, pas seulement les deux cents premières.
          if (erreurs.length < ERREURS_RAPPORTEES) {
            erreurs.push({
              ligne: ligne.numero,
              colonne: colonne?.libelle ?? null,
              valeur:
                colonne === undefined ? null : citer(ligne.champs[colonne.champ] as Cellule),
              message: refus.message,
            });
          }
        }
      }

      if (nombreEnErreur > 0) throw new AnnulationVolontaire('erreurs');
      if (apercu) throw new AnnulationVolontaire('apercu');

      /* ── Rien n'a échoué : on trace, puis on valide ────────────────── */
      importId = engendrerIdentifiant('IMP');
      await client.query(
        `insert into "imports" ("id", "filiale_id", "utilisateur_libelle", "entite", "source",
                                "nom_fichier", "sha256", "taille_octets", "cle_idempotence",
                                "statut", "lignes_lues", "lignes_creees", "lignes_mises_a_jour",
                                "lignes_ignorees", "lignes_en_erreur", "fin_le", "message")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $7, 'applique', $9, $10, 0, $11, 0, now(), $12)`,
        [
          importId,
          filialeId,
          perimetre.utilisateurId,
          modele.entite,
          analyse.source,
          options.nomFichier,
          sha256,
          contenu.length,
          analyse.lues,
          creees,
          analyse.ignorees,
          `import ${analyse.source} de ${String(creees)} ligne(s) — ` +
            `${String(analyse.colonnesInconnues.length)} colonne(s) sans destination`,
        ],
      );

      // §29.3 : la trace vit dans la transaction de l'écriture. Aucun `try` —
      // si le journal refuse, l'import entier est annulé avec lui.
      await journaliser(client, {
        action: 'import',
        filialeId,
        utilisateurLibelle: perimetre.utilisateurId,
        adresseIp: options.adresseIp ?? null,
        entiteType: 'imports',
        entiteId: importId,
        // Phrase FIXE (§29.5). Le nom du fichier vient de l'utilisateur : il
        // part en `jsonb`, jamais dans le résumé.
        resume: 'Import d’un fichier : des enregistrements ont été créés dans la filiale.',
        valeursApres: {
          entite: modele.entite,
          source: analyse.source,
          fichier: options.nomFichier,
          sha256,
          octets: contenu.length,
          lues: analyse.lues,
          creees,
          ignorees: analyse.ignorees,
          colonnes_sans_destination: analyse.colonnesInconnues,
        },
      });
    });
  } catch (erreur) {
    if (!(erreur instanceof AnnulationVolontaire)) throw erreur;
    if (erreur.motif === 'doublon') {
      const deja = anterieur as ImportAnterieur | null;
      return {
        ...commun,
        apercu,
        applique: false,
        dejaImporte: true,
        importId: deja?.id ?? null,
        debutLe: deja?.debut_le.toISOString() ?? null,
        creees: 0,
        enErreur: 0,
        erreurs: [],
        message:
          'Ce fichier a déjà été importé dans cette filiale : rien n’a été modifié. ' +
          'Un fichier modifié, même d’un seul caractère, sera traité comme un nouvel import.',
      };
    }
    if (erreur.motif === 'erreurs') {
      // ⚠️ Le rapport se lit dans l'ordre du TABLEUR. Les refus de conversion
      // sont collectés avant les refus de la base, si bien que sans ce tri la
      // ligne 3 s'affichait après la ligne 5 — et l'utilisateur descendait son
      // fichier deux fois.
      erreurs.sort((a, b) => a.ligne - b.ligne || (a.colonne ?? '').localeCompare(b.colonne ?? ''));
      // ⚠️ La transaction de DONNÉES est annulée : aucune ligne ne subsiste.
      // La trace du refus s'écrit dans une transaction à elle — sinon elle
      // serait défaite avec ce qu'elle est censée relater.
      const trace = await tracerRefus(options, filialeId, analyse, sha256, erreurs, nombreEnErreur);
      return {
        ...commun,
        apercu,
        applique: false,
        dejaImporte: false,
        importId: trace,
        debutLe: null,
        creees: 0,
        enErreur: nombreEnErreur,
        erreurs,
        message:
          `${String(nombreEnErreur)} ligne(s) de ce fichier ont été refusées : ` +
          'aucune donnée n’a été enregistrée. Corrigez ces lignes, puis réimportez le fichier.' +
          (nombreEnErreur > erreurs.length
            ? ` Les ${String(erreurs.length)} premières sont détaillées ci-dessous.`
            : ''),
      };
    }
    // Aperçu : tout a été écrit puis défait. Les chiffres sont ceux d'un import
    // réel, ce qui est le seul aperçu qui ne mente pas.
    return {
      ...commun,
      apercu: true,
      applique: false,
      dejaImporte: false,
      importId: null,
      debutLe: null,
      creees,
      enErreur: 0,
      erreurs: [],
      message:
        `Aperçu : ${String(creees)} enregistrement(s) seraient créés. ` +
        'Rien n’a été enregistré — validez pour appliquer.',
    };
  }

  return {
    ...commun,
    apercu: false,
    applique: true,
    dejaImporte: false,
    importId,
    debutLe: null,
    creees,
    enErreur: 0,
    erreurs: [],
    message: `${String(creees)} enregistrement(s) ont été créés.`,
  };
}

/**
 * Codes de refus imputables à **une ligne du fichier**.
 *
 * ⚠️ Écrire cette liste est délibéré, et c'est le bon outil : une omission y est
 * **bruyante** — l'import entier échoue au lieu d'imputer le refus à une ligne —
 * alors que l'inverse, une liste trop large, ferait passer une panne du serveur
 * pour « 5 000 lignes fausses » et enverrait un utilisateur corriger un fichier
 * qui n'a rien. Le type `CodeApi` fait échouer la compilation sur un code qui
 * n'existe pas.
 */
/**
 * Colonne du FICHIER mise en cause par un refus de la base.
 *
 * PostgreSQL nomme une contrainte (`ck_incidents_gravite`,
 * `fk_incidents_risque`) ou, pour un `not null`, directement une colonne.
 * L'utilisateur, lui, ne connaît que l'en-tête de sa colonne. On traverse donc
 * la correspondance **découverte dans le catalogue**, puis on retrouve la
 * colonne du modèle qui porte ce nom technique.
 *
 * Rend `undefined` dès que la correspondance n'est pas certaine : une colonne
 * désignée à tort enverrait corriger la mauvaise case, ce qui est pire que de
 * n'en désigner aucune.
 */
function colonneEnCause(
  erreur: unknown,
  modele: ModeleEntite,
  colonnesParContrainte: ReadonlyMap<string, readonly string[]> | undefined,
): ColonneModele | undefined {
  const base = (erreur as { erreurBase?: Record<string, unknown> } | null)?.erreurBase;
  if (base === undefined) return undefined;

  const candidates: string[] = [];
  if (typeof base['column'] === 'string') candidates.push(base['column']);
  if (typeof base['constraint'] === 'string') {
    candidates.push(...(colonnesParContrainte?.get(base['constraint']) ?? []));
  }

  const trouvees = modele.colonnes.filter((colonne) => candidates.includes(colonne.champ));
  // Une contrainte composite qui vise deux colonnes du modèle ne désigne rien
  // de précis : on préfère se taire.
  return trouvees.length === 1 ? trouvees[0] : undefined;
}

const REFUS_DE_LIGNE: ReadonlySet<CodeApi> = new Set<CodeApi>([
  'donnee_invalide',
  'contrainte_base',
  'conflit_version',
  'hors_perimetre',
  'ressource_inconnue',
  'volume_excessif',
]);

/* =====================================================================
 *  5. Les deux écritures de traçabilité
 * ===================================================================== */

async function lireImportAnterieur(
  client: PoolClient,
  filialeId: string,
  entite: NomEntite,
  sha256: string,
): Promise<ImportAnterieur | null> {
  const { rows } = await client.query<ImportAnterieur>(
    `select "id", "debut_le" from "imports"
      where "filiale_id" = $1 and "entite" = $2 and "cle_idempotence" = $3
        and "statut" = 'applique'
      order by "debut_le" desc limit 1`,
    [filialeId, entite, sha256],
  );
  return rows[0] ?? null;
}

/**
 * Écrit la trace d'un import refusé, **dans une transaction à elle**.
 *
 * Elle ne peut pas vivre dans la transaction de l'import : celle-ci est annulée,
 * et la trace le serait avec elle. Elle ne pose donc **pas** `cle_idempotence` —
 * un refus ne consomme pas le fichier, et l'utilisateur doit pouvoir réimporter
 * le même après correction, ou le même tel quel pour revoir le rapport.
 *
 * ⚠️ Un échec de cette écriture **n'échoue pas la requête** : le rapport
 * d'erreurs est déjà constitué, et le perdre pour un défaut de trace ferait
 * payer à l'utilisateur un problème qui n'est pas le sien. L'échec part au
 * journal technique de l'appelant.
 */
async function tracerRefus(
  options: OptionsImport,
  filialeId: string,
  analyse: Analyse,
  sha256: string,
  erreurs: readonly ErreurLigne[],
  nombreEnErreur: number,
): Promise<string | null> {
  const identifiant = engendrerIdentifiant('IMP');
  try {
    await avecTransaction(options.pool, options.perimetre, async (client) => {
      await client.query(
        `insert into "imports" ("id", "filiale_id", "utilisateur_libelle", "entite", "source",
                                "nom_fichier", "sha256", "taille_octets", "statut",
                                "lignes_lues", "lignes_creees", "lignes_mises_a_jour",
                                "lignes_ignorees", "lignes_en_erreur", "fin_le", "message")
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'echoue', $9, 0, 0, $10, $11, now(), $12)`,
        [
          identifiant,
          filialeId,
          options.perimetre.utilisateurId,
          options.modele.entite,
          analyse.source,
          options.nomFichier,
          sha256,
          options.contenu.length,
          analyse.lues,
          analyse.ignorees,
          nombreEnErreur,
          options.apercu
            ? 'aperçu refusé : aucune donnée écrite'
            : 'import refusé : aucune donnée écrite',
        ],
      );
      for (const erreur of erreurs.slice(0, ERREURS_RAPPORTEES)) {
        await client.query(
          `insert into "import_erreurs" ("import_id", "ligne", "colonne", "valeur", "message")
           values ($1, $2, $3, $4, $5)
           on conflict do nothing`,
          [identifiant, erreur.ligne, erreur.colonne, erreur.valeur, erreur.message],
        );
      }
    });
    return identifiant;
  } catch {
    return null;
  }
}

export { AnnulationVolontaire, ErreurTableur, LIGNES_MAX };
