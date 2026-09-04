/**
 * Contrôles n° 5, 6 et la promotion — **le magasin de fichiers.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Trois propriétés, et elles se tiennent l'une l'autre
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **Hors de toute racine web.** Apache ne sert aucun de ces fichiers
 *     (§31.3). La configuration refuse de démarrer si `CHEMIN_PIECES_JOINTES`,
 *     `CHEMIN_QUARANTAINE` ou `CHEMIN_TEMPORAIRE` tombent sous `CHEMIN_FRONTEND`
 *     (`src/config/index.ts`), et refuse aussi que le magasin et la quarantaine
 *     désignent le même répertoire — « un fichier mis en quarantaine resterait
 *     délivrable ».
 *  2. **Nom aléatoire opaque.** Le nom du déposant ne touche jamais le disque.
 *     Ce n'est pas seulement une protection contre la traversée de répertoire :
 *     `001_socle.sql` explique que la dérogation d'unicité globale de
 *     `uq_pieces_jointes_chemin` **n'est vraie que si le chemin est
 *     imprédictible** — un générateur qui incorporerait l'identifiant de
 *     l'entité laisserait la filiale A occuper le chemin que la filiale B
 *     obtiendra, et B recevrait un « doublon » sur une ligne qu'elle ne peut pas
 *     lire. La forme est **imposée par la base**
 *     (`ck_pieces_jointes_chemin ~ '^([0-9a-f]{2}/)*[0-9a-f]{64}$'`), elle n'est
 *     pas choisie ici.
 *  3. **L'empreinte porte sur ce qui a été ÉCRIT.** Le §31.2 met le contrôle
 *     n° 6 après le n° 5 délibérément : « une empreinte calculée sur le flux
 *     reçu ne prouve pas ce que porte le disque ». Ce module relit donc le
 *     fichier depuis le disque pour l'empreinte, et `clamav.ts` l'y relit
 *     aussi pour l'analyse.
 *
 * ⚠️ **Ce que ce module NE fait pas** : il ne décide de rien. Il n'ouvre aucune
 * transaction, ne lit aucun droit, ne connaît ni filiale ni session. Le
 * cloisonnement est tenu par la Row Level Security sur `pieces_jointes` et par
 * les requêtes de `depot.ts` ; un chemin de stockage n'est jamais fourni par un
 * client, il est **lu dans une ligne que la base a bien voulu rendre**.
 */

import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';

import type { Configuration } from '../config/index.js';

/**
 * Le seul tirage aléatoire de ce lot.
 *
 * ── Pourquoi il n'emploie pas `engendrerIdentifiant()` ───────────────────
 *
 * Le `CONVENTIONS.md` §2 impose **un générateur aléatoire par langage** et
 * interdit qu'une fonction recopie la convention dans son coin ; c'est la règle
 * qui a coûté deux fois au chantier. Elle vise les **identifiants métier**, dont
 * la forme est `<PRÉFIXE>-<horodatage>-<aléa>` — et l'identifiant de la pièce
 * jointe, lui, est bien engendré par `engendrerIdentifiant('PJ')`.
 *
 * Le chemin de stockage n'en est pas un : sa forme est **imposée par une
 * contrainte de la base**, `^([0-9a-f]{2}/)*[0-9a-f]{64}$`, qu'un identifiant
 * métier ne satisfait pas. Il y a donc ici un **sixième site de fabrication**,
 * là où le §2 en recense cinq, et il tire 256 bits de `randomBytes` — quatre
 * fois le plancher de 52 bits, et davantage que les 128 bits du générateur du
 * serveur. Il est **unique** dans le lot : aucune autre fonction de `src/pieces/`
 * n'appelle `randomBytes`.
 *
 * ⚠️ Le §2 est hors du périmètre de cet agent : l'ajout de ce sixième site à sa
 * table est signalé, il n'est pas fait ici.
 */
export function engendrerCheminStockage(): string {
  const nom = randomBytes(32).toString('hex');
  // Deux niveaux de répartition : au-delà de quelques dizaines de milliers de
  // fichiers, un répertoire plat devient pénible à sauvegarder et à parcourir.
  // La forme reste celle qu'impose `ck_pieces_jointes_chemin`.
  return `${nom.slice(0, 2)}/${nom.slice(2, 4)}/${nom}`;
}

/** Forme admise par la base. Vérifiée ici aussi : le disque n'attend pas la base. */
const FORME_CHEMIN = /^([0-9a-f]{2}\/)*[0-9a-f]{64}$/u;

/** Droits du magasin : rien pour le groupe, rien pour les autres. */
const MODE_REPERTOIRE = 0o700;
const MODE_FICHIER = 0o600;

/* =====================================================================
 *  Résolution d'un chemin — la ceinture, la bretelle étant dans la base
 * ===================================================================== */

/**
 * Rend le chemin absolu d'une pièce sous une racine, **ou lève**.
 *
 * Deux contrôles, et ils ne font pas double emploi :
 *
 *  · la **forme** — 64 caractères hexadécimaux, d'éventuels répertoires de
 *    répartition, rien d'autre. Aucun `..`, aucun `/` de tête, aucun octet nul,
 *    aucun nom de fichier venu d'un utilisateur ;
 *  · la **containment** — le chemin résolu doit rester sous la racine. Elle est
 *    redondante avec la précédente, et c'est voulu : c'est le contrôle qui
 *    survivrait à un assouplissement de la forme.
 */
export function resoudreDansMagasin(racine: string, cheminRelatif: string): string {
  if (!FORME_CHEMIN.test(cheminRelatif)) {
    throw new Error(`chemin de stockage hors forme : ${JSON.stringify(cheminRelatif.slice(0, 120))}`);
  }
  const base = resolve(racine);
  const cible = resolve(base, cheminRelatif);
  const ecart = relative(base, cible);
  if (ecart === '' || ecart.startsWith('..') || ecart.startsWith(`${sep}..`)) {
    throw new Error('chemin de stockage résolu hors du magasin');
  }
  return cible;
}

/* =====================================================================
 *  Contrôle n° 5 — la zone d'attente
 * ===================================================================== */

/**
 * Écrit le contenu dans la zone d'attente, sous le nom opaque déjà tiré.
 *
 * ⚠️ **Rien n'entre ici avant que les contrôles n° 1 à 4 soient passés.** C'est
 * l'ordre du §31.2, et c'est la raison pour laquelle cette fonction ne prend
 * ni nom de fichier, ni type annoncé : elle n'a rien à en faire, et les
 * recevoir donnerait à croire qu'elle les examine.
 *
 * La zone d'attente est `CHEMIN_TEMPORAIRE`, distincte du magasin : un fichier
 * qui n'a pas encore été analysé ne doit pas se trouver, fût-ce une seconde,
 * là où la délivrance va chercher.
 */
export async function ecrireEnAttente(
  config: Configuration,
  cheminStockage: string,
  contenu: Buffer,
): Promise<string> {
  const nom = cheminStockage.split('/').pop();
  if (nom === undefined || !/^[0-9a-f]{64}$/u.test(nom)) {
    throw new Error('nom de zone d’attente hors forme');
  }
  const racine = resolve(config.chemins.temporaire);
  await mkdir(racine, { recursive: true, mode: MODE_REPERTOIRE });
  const chemin = join(racine, `${nom}.attente`);
  // `wx` : refuse d'écraser. Une collision sur 256 bits n'arrive pas ; si elle
  // arrivait, il vaut mieux un échec qu'un fichier écrasé en silence.
  await writeFile(chemin, contenu, { flag: 'wx', mode: MODE_FICHIER });
  return chemin;
}

/* =====================================================================
 *  Contrôle n° 6 — l'empreinte de ce qui a été écrit
 * ===================================================================== */

/**
 * SHA-256 du fichier **tel qu'il est sur le disque**.
 *
 * ⚠️ Elle ne prend pas de tampon, et c'est tout le point du §31.2 : elle relit.
 * Le commentaire de `pieces_jointes.sha256` dit à quoi elle sert — « ce n'est
 * PAS une mesure antimalware : c'est ce qui transforme une pièce jointe en
 * preuve vérifiable ; un auditeur peut s'assurer qu'un rapport de test PRA n'a
 * pas été remplacé après coup ». Une empreinte du flux reçu ne prouverait pas
 * cela.
 */
export async function empreinteDe(chemin: string): Promise<{ sha256: string; taille: number }> {
  const empreinte = createHash('sha256');
  let taille = 0;
  const flux = createReadStream(chemin);
  for await (const morceau of flux) {
    const octets = typeof morceau === 'string' ? Buffer.from(morceau) : (morceau as Buffer);
    taille += octets.length;
    empreinte.update(octets);
  }
  return { sha256: empreinte.digest('hex'), taille };
}

/* =====================================================================
 *  Promotion, quarantaine, retrait
 * ===================================================================== */

/** Déplace la pièce analysée saine vers le magasin définitif. */
export async function promouvoir(
  config: Configuration,
  cheminAttente: string,
  cheminStockage: string,
): Promise<string> {
  return deplacer(cheminAttente, resoudreDansMagasin(config.chemins.piecesJointes, cheminStockage));
}

/**
 * Déplace la pièce **infectée** en quarantaine.
 *
 * Elle n'est pas effacée : la contrainte `ck_pieces_jointes_quarantaine` de la
 * base impose que toute ligne `etat_analyse = 'infectee'` soit en quarantaine,
 * et l'équipe sécurité doit pouvoir examiner ce qui a été présenté. Le fichier
 * quitte la zone d'attente, il ne rejoint jamais le magasin, et aucune route ne
 * sait le lire.
 */
export async function mettreEnQuarantaine(
  config: Configuration,
  cheminAttente: string,
  cheminStockage: string,
): Promise<string> {
  return deplacer(cheminAttente, resoudreDansMagasin(config.chemins.quarantaine, cheminStockage));
}

/** Ouvre une pièce du magasin en lecture. Le chemin vient d'une ligne lue en base. */
export function ouvrirDuMagasin(config: Configuration, cheminStockage: string): NodeJS.ReadableStream {
  return createReadStream(resoudreDansMagasin(config.chemins.piecesJointes, cheminStockage));
}

/** Le fichier existe-t-il, et quelle taille fait-il ? Sert au diagnostic, pas au contrôle. */
export async function tailleDansMagasin(
  config: Configuration,
  cheminStockage: string,
): Promise<number | null> {
  try {
    const etat = await stat(resoudreDansMagasin(config.chemins.piecesJointes, cheminStockage));
    return etat.size;
  } catch {
    return null;
  }
}

/**
 * Retire un fichier du magasin.
 *
 * ⚠️ **Appelée APRÈS le `commit` de la suppression, jamais avant.** L'ordre
 * n'est pas indifférent : un fichier effacé avant une transaction qui échoue
 * laisse une ligne qui pointe dans le vide — une pièce jointe qui existe en base
 * et qu'on ne peut plus délivrer, c'est-à-dire une preuve d'audit perdue.
 * L'ordre inverse laisse au pire un fichier orphelin sur le disque, que rien ne
 * délivre et qui ne coûte que de la place.
 */
export async function retirerDuMagasin(config: Configuration, cheminStockage: string): Promise<void> {
  await rm(resoudreDansMagasin(config.chemins.piecesJointes, cheminStockage), { force: true });
}

/** Efface une pièce restée en zone d'attente. Sans bruit : c'est un nettoyage. */
export async function nettoyerAttente(chemin: string): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {
    /* Le fichier a déjà été déplacé, ou n'a jamais été écrit. */
  });
}

/**
 * Déplace un fichier, y compris **entre systèmes de fichiers**.
 *
 * `rename(2)` échoue en `EXDEV` dès que la zone d'attente et le magasin ne
 * vivent pas sur le même montage — configuration parfaitement légitime, et le
 * genre de détail qui ne se découvre qu'en production. Le repli copie puis
 * efface ; il n'est pas atomique, et c'est pourquoi il n'est qu'un repli.
 */
async function deplacer(source: string, cible: string): Promise<string> {
  await mkdir(dirname(cible), { recursive: true, mode: MODE_REPERTOIRE });
  try {
    await rename(source, cible);
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== 'EXDEV') throw erreur;
    await copyFile(source, cible);
    await rm(source, { force: true });
  }
  await chmod(cible, MODE_FICHIER);
  return cible;
}
