/**
 * Pièces jointes — **la chaîne d'ingestion, et la délivrance.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat fait foi au `CONVENTIONS.md` §31, pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Le modèle EXISTE DÉJÀ. Il n'a pas été réinventé.** `pieces_jointes`
 * (`001_socle.sql`) porte `sha256`, `etat_analyse`, `quarantaine`,
 * `chemin_stockage`, `signature_virale`, `derniere_reanalyse` et les contraintes
 * qui les lient. `src/config/index.ts` porte les quotas, le socket ClamAV et les
 * chemins de stockage. **L6 n'a écrit aucune migration.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ Aucun dispositif ne garantit l'absence de malware
 * ════════════════════════════════════════════════════════════════════════
 *
 * C'est la phrase que le `PLAN_SERVEUR` §1.6 met en tête et que le §31.4 exige
 * de retrouver dans le code. Ce qui suit est une **défense en profondeur**, pas
 * une promesse : huit contrôles qui ferment chacun une porte nommée, et dont
 * aucun ne prétend qu'il n'en reste pas d'autres. Le §17.5 s'applique — un
 * garde-fou ne se voit pas prêter plus de portée qu'il n'en a. Le commentaire de
 * la table le dit dans les mêmes termes, et il fait foi avant ce fichier.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les huit contrôles, et OÙ chacun s'exerce
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'ordre du §31.2 est figé « parce qu'un contrôle joué trop tard ne protège
 * plus rien ». Voici où le lire, pour qu'on puisse vérifier l'ordre plutôt que
 * le croire :
 *
 * | # | Contrôle | Où |
 * |---|---|---|
 * | 1 | **taille** — avant de lire l'octet suivant | `analyseurMultipart()`, ci-dessous : l'en-tête `content-length`, puis un compteur qui refuse **pendant** la lecture |
 * | 2 | **quota de la filiale** — `sum(taille_octets)` | `depot.volumeFiliale()`, transaction en lecture seule |
 * | 3 | **extension** contre la liste blanche | `catalogue.reconnaitre()` |
 * | 4 | **signature binaire**, concordante | `catalogue.reconnaitre()` → `zip.ts` pour les formats Office |
 * | 5 | **zone d'attente**, nom aléatoire opaque, hors racine web | `magasin.ecrireEnAttente()` |
 * | 6 | **SHA-256 de ce qui a été ÉCRIT** | `magasin.empreinteDe()`, qui **relit le disque** |
 * | 7 | **ClamAV**, puis promotion ou quarantaine | `clamav.analyser()`, `magasin.promouvoir()` / `mettreEnQuarantaine()` |
 * | 8 | **la ligne n'est visible qu'après** | l'insertion a lieu **après** le n° 7, et `depot.CONDITION_DELIVRABLE` referme derrière |
 *
 * Le contrôle n° 8 est tenu **deux fois**, et ce n'est pas une redondance
 * décorative : aucune ligne n'est insérée avant que l'analyse ait rendu son
 * verdict — il n'existe donc jamais de pièce « en cours d'analyse » visible —,
 * **et** la liste comme la délivrance exigent `etat_analyse = 'saine' and not
 * quarantaine`. Le premier vaut pour l'ingestion ; le second vaudra encore le
 * jour où la ré-analyse périodique du lot d'exploitation basculera une pièce
 * déjà stockée.
 *
 * ⚠️ **Si ClamAV ne répond pas, la pièce n'est PAS acceptée** (§31.4). Le refus
 * rend **503** : ce n'est pas la faute de l'appelant, et le distinguer d'un 400
 * lui dit qu'il peut réessayer. `clamavActif = non` ne désactive l'analyse
 * **qu'en développement** — `clamav.analyser()` refuse ailleurs.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  La délivrance (§31.3)
 * ════════════════════════════════════════════════════════════════════════
 *
 * `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, et
 * **jamais le type MIME annoncé par le déposant** — celui qui a été constaté au
 * contrôle n° 4, lu dans `pieces_jointes.type_mime`. Apache ne sert aucun de ces
 * fichiers : ils vivent hors racine web (`src/config/index.ts` refuse de
 * démarrer si ce n'est pas le cas) et ne sortent que par ces routes, après le
 * contrôle des droits **et** du périmètre.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les routes, et pourquoi il y en a deux familles
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Route | Déclaration d'accès |
 * |---|---|
 * | `POST   /api/pieces/:entite/:entiteId` | `{ ecrire, selon-entite }` |
 * | `GET    /api/pieces/:entite/:entiteId` | `{ lire, selon-entite }` |
 * | `GET    /api/pieces/:entite/:entiteId/:pieceId` | `{ lire, selon-entite }` |
 * | `DELETE /api/pieces/:entite/:entiteId/:pieceId` | `{ ecrire, selon-entite }` |
 * | `POST   /api/pieces/logo` | `{ administrer, administration }` |
 * | `GET    /api/pieces/logo` | `{ lire, administration }` |
 * | `GET    /api/pieces/logo/:pieceId` | `{ lire, administration }` |
 * | `DELETE /api/pieces/logo/:pieceId` | `{ administrer, administration }` |
 *
 * **`selon-entite` impose que l'entité soit dans l'URL**, et c'est ce qui rend
 * le domaine fonctionnel déclaratif : une pièce attachée à un risque met en jeu
 * le domaine `risques`, une pièce attachée à un audit le domaine `audits`, et
 * c'est le crochet `onRequest` du greffon parent qui tranche — avant l'analyse
 * du corps, comme tout le reste (condition E4).
 *
 * ⚠️ **La seconde famille existe parce que `filiales` n'est pas une entité
 * métier.** `domaineDe()` rend `null` pour tout nom absent de
 * `DOMAINE_PAR_ENTITE` — c'est-à-dire qu'un logo déposé par la route générique
 * n'aurait **subi aucun contrôle de domaine**, seulement celui du niveau. Le
 * logo a donc ses propres routes, statiques, qui déclarent `administration`.
 * Fastify donne la priorité au segment statique sur le paramètre, et
 * l'énumération `:entite` — **dérivée** de `DOMAINE_PAR_ENTITE`, jamais
 * recopiée — refuse de toute façon `filiales`.
 *
 * ⚠️ **Et elles s'appellent `/logo`, pas `/filiales/:entiteId` : le chemin ne
 * porte AUCUN identifiant de filiale.** La première rédaction le portait, et le
 * garde-fou `test/filiales/aucun-parametre-filiale.test.mjs` l'a refusé —
 * *« /api/filiales RÉPOND, /api/session/filiale-active REÇOIT ; toute autre est
 * à justifier »*. Il avait raison, et pas seulement sur la forme : la filiale
 * dont on gère le logo est **toujours la filiale active**, que le serveur
 * résout. La prendre dans l'URL laissait un client la nommer — sans fuite
 * (`filiale_id` restait celui de la session, et la RLS avec), mais en écrivant
 * une ligne qui se disait le logo d'une autre. `entite_id` vient donc du
 * périmètre, comme `filiale_id`.
 *
 * ── Un arbitrage à contester, s'il doit l'être ───────────────────────────
 *
 * La délivrance déclare `lire`, **pas `exporter`**. Le droit d'export est une
 * permission distincte (`PLAN_SERVEUR` §3.3) qui vise l'extraction d'un *jeu de
 * données* ; exiger ce droit pour rouvrir le PDF qu'on vient d'attacher à son
 * propre audit empêcherait l'usage normal d'un profil *Contribution*. Le
 * téléchargement est en revanche **tracé** (`consultation_sensible`) : « qui a
 * téléchargé quelle pièce » reste une question d'audit à laquelle le journal
 * répond. C'est un choix, il est écrit ici pour que la porte puisse le refuser.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ LA COUTURE : `config` doit être passée, et elle ne l'est pas toujours
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/api/index.ts` enregistre ce greffon. Il doit lui passer **la
 * configuration** en plus du pool — les trois chemins du magasin, la taille
 * maximale, le quota de filiale, le socket ClamAV et son délai, et
 * l'environnement dont dépend le refus du §31.4 n'ont pas d'autre source
 * légitime :
 *
 *     await instance.register(greffonPieces, { pool, config });   // ce qu'il faut
 *     await instance.register(greffonPieces, { pool });           // ce qui a été vu
 *
 * ⚠️ **Les deux formes ont été observées à une heure d'intervalle**, ce fichier
 * étant en cours d'écriture pendant que le point d'entrée l'était aussi. La
 * conséquence est écrite ici parce qu'elle a coûté un aller-retour :
 *
 *  · **`config` reste FACULTATIVE dans le type.** La rendre obligatoire a été
 *    fait, puis défait : cela fait échouer la compilation de `src/api/index.ts`
 *    dès qu'il n'envoie que le pool — c'est-à-dire qu'un agent en bloque trois
 *    autres pour une ligne. C'est mot pour mot l'arbitrage de
 *    `OptionsJournal.pool` au lot L5.
 *  · **À l'exécution, elle est indispensable.** Sans elle, le greffon
 *    n'enregistre **aucune route** et le crie au journal technique en `error` :
 *    une route qui existerait en rendant 503 serait une surface publique que
 *    personne n'a décidé d'ouvrir, et un montage silencieux serait pire encore.
 *  · **Le banc s'adapte** (`test/pieces/aide.mjs`) : il pose lui-même le second
 *    enregistrement si, et seulement si, le point d'entrée n'a monté aucune
 *    route. La famille est donc verte dans les deux états de la couture, et
 *    aucun des deux ne la fait mentir.
 *
 * **Ce qui reste à faire hors de ce fichier, et qui tient en une ligne** :
 * `register(greffonPieces, { pool, config })` dans `src/api/index.ts`. Tant que
 * ce n'est pas fait, le produit n'a pas de pièces jointes — le banc, lui, en a.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import { DOMAINE_PAR_ENTITE } from '../api/droits.js';
import type { SessionAppliquee } from '../api/session.js';
import type { Configuration } from '../config/index.js';
import { avecTransaction } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import { engendrerIdentifiant } from '../entites/index.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import { reconnaitre } from './catalogue.js';
import { analyser, ErreurClamav } from './clamav.js';
import type { VerdictAntivirus } from './clamav.js';
import { inserer, lireDelivrable, lister, supprimer, versLaVue } from './depot.js';
import { verifierQuotaFiliale } from './exploitation.js';
import type { LignePiece } from './depot.js';
import {
  ecrireEnAttente,
  empreinteDe,
  engendrerCheminStockage,
  mettreEnQuarantaine,
  nettoyerAttente,
  ouvrirDuMagasin,
  promouvoir,
  retirerDuMagasin,
  tailleDansMagasin,
} from './magasin.js';
import { analyserMultipart, ErreurMultipart } from './multipart.js';

export interface OptionsPieces {
  /** Pool de connexions. Obligatoire — voir la leçon de `OptionsJournal.pool`. */
  readonly pool: Pool;
  /**
   * Configuration du serveur.
   *
   * ⚠️ **Facultative dans le type, indispensable à l'exécution**, et le décalage
   * est un choix : voir l'entête. Sans elle, aucune route n'est enregistrée, et
   * le greffon refuse **bruyamment** à l'exécution plutôt que silencieusement à
   * la compilation.
   */
  readonly config?: Configuration;
}

/**
 * Marge d'enveloppe multipart tolérée au-dessus de la taille du fichier.
 *
 * Les frontières, les blocs d'en-têtes et les champs annexes (`description`) ne
 * font pas partie de la pièce mais voyagent avec elle. 64 kio couvrent très
 * largement seize parties d'en-têtes bornés à 8 kio ; au-delà, ce n'est plus une
 * enveloppe, c'est une charge.
 */
const MARGE_ENVELOPPE = 64 * 1024;

/** Nom du champ de formulaire portant le fichier. Un seul, et il est nommé. */
const CHAMP_FICHIER = 'fichier';
const CHAMP_DESCRIPTION = 'description';

/** Entités métier acceptées — **dérivées**, jamais recopiées (`CLAUDE.md` §3). */
const ENTITES_METIER = Object.freeze(Object.keys(DOMAINE_PAR_ENTITE).sort());

/**
 * Le logo de filiale : une valeur du domaine `type_entite`, pas une entité
 * métier. `entite_id` vaut **la filiale active**, résolue par le serveur.
 */
const ENTITE_FILIALE = 'filiales';

const SCHEMA_PARAMS_ENTITE = {
  type: 'object',
  required: ['entite', 'entiteId'],
  additionalProperties: false,
  properties: {
    entite: { type: 'string', enum: ENTITES_METIER },
    entiteId: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const SCHEMA_PARAMS_ENTITE_PIECE = {
  type: 'object',
  required: ['entite', 'entiteId', 'pieceId'],
  additionalProperties: false,
  properties: {
    entite: { type: 'string', enum: ENTITES_METIER },
    entiteId: { type: 'string', minLength: 1, maxLength: 64 },
    pieceId: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const SCHEMA_PARAMS_LOGO = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

const SCHEMA_PARAMS_LOGO_PIECE = {
  type: 'object',
  required: ['pieceId'],
  additionalProperties: false,
  properties: { pieceId: { type: 'string', minLength: 1, maxLength: 64 } },
} as const;

interface ParamsPiece {
  readonly entite?: string;
  readonly entiteId?: string;
  readonly pieceId?: string;
}

/**
 * Greffon des pièces jointes.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonPieces(
  instance: FastifyInstance,
  options: OptionsPieces,
): Promise<void> {
  const { pool, config } = options;

  // ⚠️ Le refus est BRUYANT et TOTAL : pas une route qui rendrait 503, pas un
  // montage à moitié. Voir `OptionsPieces.config` et l'entête.
  if (config === undefined) {
    instance.log.error(
      { greffon: 'pieces', correctif: 'register(greffonPieces, { pool, config })' },
      'Pièces jointes : AUCUNE ROUTE enregistrée — la configuration n’a pas été passée au ' +
        'greffon (chemins du magasin, taille maximale, quota, socket ClamAV). Le produit n’a ' +
        'donc pas de pièces jointes. Voir l’entête de src/pieces/index.ts.',
    );
    return;
  }

  /* -------------------------------------------------------------------
   *  CONTRÔLE N° 1 — la taille, avant que l'octet suivant soit lu
   * -------------------------------------------------------------------
   *  Le §31.2 le met en premier et l'explique : « un fichier hors borne ne
   *  doit jamais atteindre le disque ». Il est donc exercé **dans l'analyseur
   *  de type de contenu**, c'est-à-dire au moment où les octets arrivent —
   *  avant qu'une route s'exécute, avant qu'un chemin soit tiré, avant
   *  qu'`open(2)` soit appelé.
   *
   *  Deux gardes, et la première est gratuite :
   *
   *   · `content-length`, quand il est annoncé : on refuse **sans lire un
   *     octet** ;
   *   · un compteur pendant la lecture, pour le cas `Transfer-Encoding:
   *     chunked`, où aucune longueur n'est annoncée. C'est le cas qu'on
   *     oublie, et c'est celui qu'un attaquant choisira.
   *
   *  ⚠️ **Fastify n'applique pas `bodyLimit` à un analyseur de flux brut** :
   *  la borne écrite dans les options de route ci-dessous est une déclaration
   *  d'intention lisible, pas le contrôle. Le contrôle est ce compteur.
   * ------------------------------------------------------------------- */
  const plafondCorps = config.piecesJointes.tailleMaxOctets + MARGE_ENVELOPPE;

  instance.addContentTypeParser(
    'multipart/form-data',
    (requete: FastifyRequest, charge: NodeJS.ReadableStream, fini) => {
      const annoncee = Number(requete.headers['content-length'] ?? '0');
      if (Number.isFinite(annoncee) && annoncee > plafondCorps) {
        fini(refusDeTaille(annoncee), undefined);
        return;
      }

      const morceaux: Buffer[] = [];
      let total = 0;
      let refuse = false;

      charge.on('data', (bloc: Buffer) => {
        if (refuse) return;
        total += bloc.length;
        if (total > plafondCorps) {
          refuse = true;
          // On cesse d'accumuler sur-le-champ : la mémoire du service ne doit
          // pas dépendre de ce que l'appelant veut bien arrêter d'envoyer.
          morceaux.length = 0;
          fini(refusDeTaille(total), undefined);
          return;
        }
        morceaux.push(bloc);
      });
      charge.on('end', () => {
        if (refuse) return;
        fini(null, Buffer.concat(morceaux));
      });
      charge.on('error', (erreur: Error) => {
        if (refuse) return;
        refuse = true;
        fini(erreur, undefined);
      });
    },
  );

  /** Refus de taille. **413**, et il ne dit pas où se situe exactement la borne du corps. */
  const refusDeTaille = (mesure: number): ErreurApplicative =>
    new ErreurApplicative({
      code: 'volume_excessif',
      statut: 413,
      message:
        `Ce fichier dépasse la taille maximale autorisée ` +
        `(${String(Math.floor(config.piecesJointes.tailleMaxOctets / (1024 * 1024)))} Mio).`,
      detailJournal: `corps multipart de ${String(mesure)} o au-delà du plafond de ${String(plafondCorps)} o`,
    });

  /**
   * Session appliquée — **fail-closed**, comme `sessionDe` de `src/api/journal.ts` :
   * une route atteinte sans session est un défaut de montage, et un 500
   * explicite vaut mieux qu'une transaction sur un périmètre improvisé.
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

  /** Filiale d'écriture, ou refus explicite. On n'écrit que dans la filiale active. */
  const filialeDEcriture = (perimetre: PerimetreSession): string => {
    if (perimetre.filialeId === null) {
      throw new ErreurApplicative({
        code: 'hors_perimetre',
        statut: 403,
        message:
          'Aucune filiale active : sélectionnez la filiale dans laquelle déposer la pièce jointe.',
        detailJournal: `périmètre sans filiale active pour ${perimetre.utilisateurId}`,
      });
    }
    return perimetre.filialeId;
  };

  /** Trace, dans la transaction qui a servi le geste (§29.3). */
  const tracer = async (
    client: PoolClient,
    perimetre: PerimetreSession,
    requete: FastifyRequest,
    action: 'creation' | 'suppression' | 'consultation_sensible' | 'analyse_antivirus',
    resume: string,
    pieceId: string | null,
    details: Record<string, unknown>,
  ): Promise<void> => {
    await journaliser(client, {
      action,
      resume,
      filialeId: perimetre.filialeId,
      utilisateurLibelle: perimetre.utilisateurId,
      adresseIp: requete.ip,
      entiteType: 'pieces_jointes',
      entiteId: pieceId,
      valeursApres: details,
    });
  };

  /* ===================================================================
   *  DÉPÔT — les huit contrôles, dans l'ordre
   * =================================================================== */

  const deposer = async (
    requete: FastifyRequest,
    reponse: FastifyReply,
    entiteType: string,
    entiteId: string,
  ): Promise<FastifyReply> => {
    const { perimetre } = sessionDe(requete);
    const filialeId = filialeDEcriture(perimetre);
    const logo = entiteType === ENTITE_FILIALE;

    const corps = requete.body;
    if (!Buffer.isBuffer(corps)) {
      throw entreeInvalide(
        'Le dépôt d’une pièce jointe attend un envoi de formulaire (multipart/form-data).',
        `corps de type « ${typeof corps} » sur ${requete.method} ${String(requete.routeOptions.url)}`,
      );
    }

    let parties;
    try {
      parties = analyserMultipart(corps, String(requete.headers['content-type'] ?? ''));
    } catch (erreur) {
      throw entreeInvalide(
        'L’envoi est mal formé. Recommencez le dépôt depuis l’application.',
        erreur instanceof ErreurMultipart ? erreur.message : 'analyse multipart en échec',
      );
    }

    const fichier = parties.find((p) => p.nom === CHAMP_FICHIER && p.nomFichier !== null);
    if (fichier === undefined || fichier.nomFichier === null) {
      throw entreeInvalide(
        `L’envoi ne contient aucun fichier (champ « ${CHAMP_FICHIER} »).`,
        `parties reçues : ${parties.map((p) => p.nom).join(', ') || 'aucune'}`,
      );
    }

    const nomFichier = normaliserNomFichier(fichier.nomFichier);
    if (nomFichier === null) {
      throw entreeInvalide('Le nom du fichier est vide ou illisible. Le dépôt est refusé.');
    }
    const description = normaliserDescription(
      parties.find((p) => p.nom === CHAMP_DESCRIPTION && p.nomFichier === null)?.contenu,
    );

    /* ── Contrôle n° 1 (précis) : la taille de la PIÈCE ──────────────── */
    const taille = fichier.contenu.length;
    if (taille === 0) {
      throw entreeInvalide('Le fichier est vide. Le dépôt est refusé.');
    }
    if (taille > config.piecesJointes.tailleMaxOctets) throw refusDeTaille(taille);

    /* ── Contrôle n° 2 : le quota de la filiale ────────────────────────
     *
     *  La DÉCISION vit dans `exploitation.verifierQuotaFiliale()`, et pas ici.
     *  Elle y était déjà quand cette route a été écrite, et la recopier aurait
     *  fait deux endroits où se décide la même chose — c'est-à-dire, tôt ou
     *  tard, deux réponses différentes à la même question. La mesure elle-même
     *  reste `depot.volumeFiliale()`, `sum(taille_octets)` sur la filiale.
     *
     *  Transaction en **lecture seule** : le contrôle n° 2 précède le n° 5, et
     *  rien n'a encore touché le disque à cet instant.
     */
    const quota = await avecTransaction(
      pool,
      perimetre,
      (client) =>
        verifierQuotaFiliale(client, filialeId, taille, config.piecesJointes.quotaFilialeOctets),
      { lectureSeule: true },
    );
    if (!quota.autorise) {
      throw new ErreurApplicative({
        code: 'volume_excessif',
        statut: 413,
        message:
          'L’espace de stockage alloué à votre filiale est atteint. Supprimez des pièces ' +
          'jointes devenues inutiles, ou demandez un relèvement du quota.',
        detailJournal:
          `quota filiale ${filialeId} : ${String(quota.utiliseOctets)} o utilisés, ` +
          `${String(quota.disponibleOctets)} o disponibles, ${String(taille)} o demandés`,
      });
    }

    /* ── Contrôles n° 3 et 4 : liste blanche, puis signature ─────────── */
    const verdict = reconnaitre({
      nomFichier,
      typeDeclare: fichier.typeDeclare,
      contenu: fichier.contenu,
      logo,
    });
    if (!verdict.ok) {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message: verdict.message,
        detailJournal: `${verdict.motif} — ${verdict.detailJournal}`,
      });
    }

    /* ── Contrôle n° 5 : la zone d'attente ───────────────────────────── */
    const cheminStockage = engendrerCheminStockage();
    const cheminAttente = await ecrireEnAttente(config, cheminStockage, fichier.contenu);

    try {
      /* ── Contrôle n° 6 : l'empreinte de ce qui a été ÉCRIT ─────────── */
      const { sha256, taille: tailleEcrite } = await empreinteDe(cheminAttente);
      if (tailleEcrite !== taille) {
        throw new ErreurApplicative({
          code: 'erreur_interne',
          statut: 500,
          message: 'Le dépôt n’a pas abouti. Réessayez.',
          detailJournal:
            `taille écrite ${String(tailleEcrite)} o différente de la taille reçue ${String(taille)} o`,
        });
      }

      /* ── Contrôle n° 7 : ClamAV ─────────────────────────────────────── */
      let antivirus: VerdictAntivirus;
      try {
        antivirus = await analyser(cheminAttente, config);
      } catch (erreur) {
        await journaliserAnalyseImpossible(requete, perimetre, entiteType, entiteId, sha256, erreur);
        throw new ErreurApplicative({
          code: 'indisponible',
          statut: 503,
          message:
            'L’analyse antivirale n’a pas pu être effectuée : la pièce jointe n’est pas ' +
            'acceptée. Réessayez dans quelques instants, ou signalez l’incident.',
          detailJournal: erreur instanceof ErreurClamav ? erreur.message : String(erreur),
        });
      }

      const commun = {
        id: engendrerIdentifiant('PJ'),
        filialeId,
        entiteType,
        entiteId,
        nomFichier,
        typeMime: verdict.type.typeMimeConstate,
        extension: verdict.extension,
        tailleOctets: taille,
        sha256,
        cheminStockage,
        description,
      };

      /* ── Infectée : quarantaine, trace, et refus ─────────────────────── */
      if (antivirus.etat === 'infectee') {
        await mettreEnQuarantaine(config, cheminAttente, cheminStockage);
        await avecTransaction(pool, perimetre, async (client) => {
          const ligne = await inserer(client, {
            ...commun,
            etatAnalyse: 'infectee',
            resultatAnalyse: antivirus.resultat,
            signatureVirale: antivirus.signature,
            quarantaine: true,
          });
          await tracer(
            client,
            perimetre,
            requete,
            'analyse_antivirus',
            'Pièce jointe refusée par l’analyse antivirale et mise en quarantaine',
            ligne.id,
            {
              entite_type: entiteType,
              entite_id: entiteId,
              nom_fichier: nomFichier,
              signature: antivirus.signature,
              sha256,
              taille_octets: taille,
              quarantaine: true,
            },
          );
        });
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message:
            'L’analyse antivirale a détecté une menace dans ce fichier. Le dépôt est refusé et ' +
            'le fichier a été mis en quarantaine. Prévenez votre responsable sécurité.',
          detailJournal: `pièce infectée mise en quarantaine (signature : ${antivirus.signature})`,
        });
      }

      /* ── Saine : promotion, insertion, trace ─────────────────────────── */
      await promouvoir(config, cheminAttente, cheminStockage);
      try {
        const ligne = await avecTransaction(pool, perimetre, async (client) => {
          const inseree = await inserer(client, {
            ...commun,
            // `non_analysee` (développement, analyse éteinte) n'est PAS « saine » :
            // on n'enregistre pas comme constatée une propriété que personne n'a
            // constatée. L'état `erreur` de la base dit exactement cela, et
            // `CONDITION_DELIVRABLE` la rend non délivrable — ce qui est la
            // conséquence voulue.
            etatAnalyse: antivirus.etat === 'saine' ? 'saine' : 'erreur',
            resultatAnalyse: antivirus.resultat,
            signatureVirale: null,
            quarantaine: false,
          });
          await tracer(
            client,
            perimetre,
            requete,
            'analyse_antivirus',
            'Analyse antivirale d’une pièce jointe',
            inseree.id,
            { etat: antivirus.etat, resultat: antivirus.resultat, sha256 },
          );
          await tracer(
            client,
            perimetre,
            requete,
            'creation',
            'Dépôt d’une pièce jointe',
            inseree.id,
            {
              entite_type: entiteType,
              entite_id: entiteId,
              // Le nom du fichier est une valeur d'utilisateur : il voyage en
              // `jsonb`, jamais dans le `resume` (§29.5).
              nom_fichier: nomFichier,
              type_mime: inseree.type_mime,
              extension: inseree.extension,
              taille_octets: taille,
              sha256,
            },
          );
          return inseree;
        });
        return reponse.code(201).send(versLaVue(ligne));
      } catch (erreur) {
        // La ligne n'existe pas : le fichier ne doit pas rester. L'ordre inverse
        // — effacer avant de savoir si la transaction tient — laisserait une
        // ligne pointant dans le vide, c'est-à-dire une preuve d'audit perdue.
        await retirerDuMagasin(config, cheminStockage).catch(() => {
          /* Le magasin dira ce fichier orphelin ; la ligne, elle, n'existe pas. */
        });
        throw erreur;
      }
    } finally {
      await nettoyerAttente(cheminAttente);
    }
  };

  /**
   * Trace une analyse **qui n'a pas pu avoir lieu**.
   *
   * ⚠️ Elle enveloppe `journaliser()` dans un `try`, ce que le §29.3 réserve aux
   * appelants dont l'événement n'a **pas d'écriture métier à emporter** : c'est
   * le cas ici, le dépôt étant déjà refusé. Si la base est elle aussi
   * indisponible, l'appelant doit recevoir le 503 de l'analyse, pas une erreur
   * de journal qui masquerait la cause.
   */
  const journaliserAnalyseImpossible = async (
    requete: FastifyRequest,
    perimetre: PerimetreSession,
    entiteType: string,
    entiteId: string,
    sha256: string,
    cause: unknown,
  ): Promise<void> => {
    try {
      await avecTransaction(pool, perimetre, async (client) => {
        await tracer(
          client,
          perimetre,
          requete,
          'analyse_antivirus',
          'Analyse antivirale impossible : pièce jointe refusée',
          null,
          {
            entite_type: entiteType,
            entite_id: entiteId,
            sha256,
            cause: cause instanceof Error ? cause.message : String(cause),
          },
        );
      });
    } catch (erreurJournal) {
      requete.log.error(
        { detail: erreurJournal instanceof Error ? erreurJournal.message : String(erreurJournal) },
        'Analyse antivirale impossible ET journal inaccessible : la pièce reste refusée',
      );
    }
  };

  /* ===================================================================
   *  LISTE
   * =================================================================== */

  const listerPieces = async (
    requete: FastifyRequest,
    reponse: FastifyReply,
    entiteType: string,
    entiteId: string,
  ): Promise<FastifyReply> => {
    const { perimetre } = sessionDe(requete);

    const pieces = await avecTransaction(
      pool,
      perimetre,
      (client) => lister(client, entiteType, entiteId),
      { lectureSeule: true },
    );
    return reponse.send({ pieces: pieces.map(versLaVue) });
  };

  /* ===================================================================
   *  DÉLIVRANCE (§31.3)
   * =================================================================== */

  const delivrer = async (
    requete: FastifyRequest,
    reponse: FastifyReply,
    entiteType: string,
    entiteId: string,
  ): Promise<FastifyReply> => {
    const { perimetre } = sessionDe(requete);
    const { pieceId } = requete.params as ParamsPiece;
    if (pieceId === undefined) throw entreeInvalide('Pièce jointe non désignée.');

    const ligne = await avecTransaction(pool, perimetre, async (client) => {
      const trouvee = await lireDelivrable(client, entiteType, entiteId, pieceId);
      if (trouvee === null) return null;
      await tracer(
        client,
        perimetre,
        requete,
        'consultation_sensible',
        'Téléchargement d’une pièce jointe',
        trouvee.id,
        {
          entite_type: entiteType,
          entite_id: entiteId,
          nom_fichier: trouvee.nom_fichier,
          sha256: trouvee.sha256,
        },
      );
      return trouvee;
    });

    if (ligne === null) throw pieceIntrouvable(pieceId);

    // Le fichier a-t-il survécu ? Un flux qui échoue en cours d'envoi laisse une
    // réponse tronquée que le client prend pour un fichier ; on préfère un refus
    // franc, et un journal technique qui nomme la ligne.
    const taille = await tailleDansMagasin(config, ligne.chemin_stockage);
    if (taille === null) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Ce fichier n’est plus disponible. Signalez l’incident.',
        detailJournal: `pièce ${ligne.id} : fichier absent du magasin`,
      });
    }

    return reponse
      // ⚠️ Le type **constaté** au contrôle n° 4, jamais celui annoncé par le
      // déposant (§31.3). `nosniff` interdit au navigateur de le redeviner.
      .header('content-type', ligne.type_mime)
      .header('content-disposition', dispositionAttachement(ligne.nom_fichier))
      .header('x-content-type-options', 'nosniff')
      .header('content-length', String(taille))
      // Une pièce d'audit ne se met pas en cache partagé : elle est cloisonnée
      // par filiale, et un cache intermédiaire ne connaît pas ce cloisonnement.
      .header('cache-control', 'private, no-store')
      .send(ouvrirDuMagasin(config, ligne.chemin_stockage));
  };

  /* ===================================================================
   *  SUPPRESSION
   * =================================================================== */

  const supprimerPiece = async (
    requete: FastifyRequest,
    reponse: FastifyReply,
    entiteType: string,
    entiteId: string,
  ): Promise<FastifyReply> => {
    const { perimetre } = sessionDe(requete);
    filialeDEcriture(perimetre);
    const { pieceId } = requete.params as ParamsPiece;
    if (pieceId === undefined) throw entreeInvalide('Pièce jointe non désignée.');

    const ligne = await avecTransaction(pool, perimetre, async (client) => {
      const effacee = await supprimer(client, entiteType, entiteId, pieceId);
      if (effacee === null) return null;
      await tracer(
        client,
        perimetre,
        requete,
        'suppression',
        'Suppression d’une pièce jointe',
        effacee.id,
        {
          entite_type: entiteType,
          entite_id: entiteId,
          nom_fichier: effacee.nom_fichier,
          sha256: effacee.sha256,
          taille_octets: effacee.taille_octets,
        },
      );
      return effacee;
    });

    if (ligne === null) throw pieceIntrouvable(pieceId);

    // APRÈS le commit (voir `magasin.retirerDuMagasin`). Et **jamais** pour une
    // pièce en quarantaine : ce fichier-là est la matière de l'équipe sécurité,
    // pas un encombrement à balayer depuis une route d'application.
    if (!ligne.quarantaine) {
      await retirerDuMagasin(config, ligne.chemin_stockage).catch((erreur: unknown) => {
        requete.log.error(
          { piece: ligne.id, detail: erreur instanceof Error ? erreur.message : String(erreur) },
          'Pièce supprimée en base, fichier non retiré du magasin',
        );
      });
    }

    return reponse.code(204).send();
  };

  /* ===================================================================
   *  Enregistrement des deux familles de routes
   * =================================================================== */

  /**
   * Options d'une route de dépôt.
   *
   * `bodyLimit` est **déclaratif** : Fastify ne l'applique pas à un analyseur de
   * flux brut. Le contrôle réel est le compteur de l'analyseur ci-dessus. Il est
   * écrit ici parce qu'un lecteur cherchera la borne à cet endroit, et parce que
   * la journée où l'analyseur cesserait d'être un flux brut, elle prendrait
   * effet sans qu'on l'ait oubliée.
   */
  const optionsDepot = (schemaParams: unknown, acces: Record<string, unknown>): object => ({
    bodyLimit: plafondCorps,
    schema: { params: schemaParams },
    config: { acces },
  });

  /** Entité métier visée par une route de la famille 1. */
  const cibleMetier = (requete: FastifyRequest): { type: string; id: string } => {
    const parametres = requete.params as ParamsPiece;
    return { type: parametres.entite ?? '', id: parametres.entiteId ?? '' };
  };

  /**
   * Filiale dont on gère le logo — **celle de la session, jamais celle de l'URL**.
   *
   * C'est ce qui permet à ces routes de ne porter aucun identifiant de filiale
   * dans leur chemin (`test/filiales/aucun-parametre-filiale.test.mjs`), et c'est
   * la même règle que partout ailleurs : le périmètre vient du serveur.
   */
  const cibleLogo = (requete: FastifyRequest): string => {
    const { perimetre } = sessionDe(requete);
    if (perimetre.filialeId === null) {
      throw new ErreurApplicative({
        code: 'hors_perimetre',
        statut: 403,
        message: 'Aucune filiale active : sélectionnez la filiale dont vous gérez le logo.',
        detailJournal: `logo demandé sans filiale active pour ${perimetre.utilisateurId}`,
      });
    }
    return perimetre.filialeId;
  };

  // ── Famille 1 : les entités métier ─────────────────────────────────
  instance.post(
    '/api/pieces/:entite/:entiteId',
    optionsDepot(SCHEMA_PARAMS_ENTITE, { action: 'ecrire', domaine: 'selon-entite' }),
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const cible = cibleMetier(requete);
      return deposer(requete, reponse, cible.type, cible.id);
    },
  );

  instance.get(
    '/api/pieces/:entite/:entiteId',
    {
      schema: { params: SCHEMA_PARAMS_ENTITE },
      config: { acces: { action: 'lire', domaine: 'selon-entite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const cible = cibleMetier(requete);
      return listerPieces(requete, reponse, cible.type, cible.id);
    },
  );

  instance.get(
    '/api/pieces/:entite/:entiteId/:pieceId',
    {
      schema: { params: SCHEMA_PARAMS_ENTITE_PIECE },
      config: { acces: { action: 'lire', domaine: 'selon-entite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const cible = cibleMetier(requete);
      return delivrer(requete, reponse, cible.type, cible.id);
    },
  );

  instance.delete(
    '/api/pieces/:entite/:entiteId/:pieceId',
    {
      schema: { params: SCHEMA_PARAMS_ENTITE_PIECE },
      config: { acces: { action: 'ecrire', domaine: 'selon-entite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const cible = cibleMetier(requete);
      return supprimerPiece(requete, reponse, cible.type, cible.id);
    },
  );

  // ── Famille 2 : le logo de la filiale ACTIVE ───────────────────────
  //
  // Segments statiques : Fastify les fait passer avant le paramètre, si bien que
  // `/api/pieces/logo/<id>` ne peut pas être servi par la famille 1 — dont le
  // schéma refuserait `logo` de toute façon, l'énumération étant dérivée de
  // `DOMAINE_PAR_ENTITE`.
  instance.post(
    '/api/pieces/logo',
    optionsDepot(SCHEMA_PARAMS_LOGO, { action: 'administrer', domaine: 'administration' }),
    async (requete: FastifyRequest, reponse: FastifyReply) =>
      deposer(requete, reponse, ENTITE_FILIALE, cibleLogo(requete)),
  );

  // ── LIRE LE LOGO N'EXIGE AUCUN DOMAINE, ET C'EST UNE CORRECTION ──────
  //
  // Les deux lectures ci-dessous déclaraient `domaine: 'administration'`, par
  // symétrie avec le dépôt. Mesuré à la livraison de L9 : la charge de session
  // réelle d'un RSSI ne porte **pas** `administration` — seul le profil `ADMIN`
  // le porte. Conséquence : **la quasi-totalité des profils ne pouvait jamais
  // voir la marque de sa propre filiale**, c'est-à-dire que le lot L9 aurait été
  // inerte pour presque tout le monde, sans qu'aucune erreur ne le dise (le
  // repli texte absorbe le 403 en silence, à dessein).
  //
  // La bonne déclaration est celle de `GET /api/filiales`, et pour le même
  // motif : ce sont des routes de **session**, pas d'administration. Elles ne
  // rendent rien que la session ne voie déjà à l'écran — le logo de la filiale
  // où elle travaille, et rien d'autre : `cibleLogo()` vise **toujours** la
  // filiale active, jamais un identifiant reçu du client.
  //
  // ⚠️ Le DÉPÔT et la SUPPRESSION restent `administration` : changer la marque
  // d'une filiale est un acte d'administration, la regarder ne l'est pas.
  instance.get(
    '/api/pieces/logo',
    {
      schema: { params: SCHEMA_PARAMS_LOGO },
      config: { acces: { action: 'lire', domaine: null } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) =>
      listerPieces(requete, reponse, ENTITE_FILIALE, cibleLogo(requete)),
  );

  instance.get(
    '/api/pieces/logo/:pieceId',
    {
      schema: { params: SCHEMA_PARAMS_LOGO_PIECE },
      config: { acces: { action: 'lire', domaine: null } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) =>
      delivrer(requete, reponse, ENTITE_FILIALE, cibleLogo(requete)),
  );

  instance.delete(
    '/api/pieces/logo/:pieceId',
    {
      schema: { params: SCHEMA_PARAMS_LOGO_PIECE },
      config: { acces: { action: 'administrer', domaine: 'administration' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) =>
      supprimerPiece(requete, reponse, ENTITE_FILIALE, cibleLogo(requete)),
  );
}

/* =====================================================================
 *  Aides — pures, éprouvables seules
 * ===================================================================== */

/**
 * Refus d'une pièce introuvable.
 *
 * ⚠️ **404 et non 403, y compris quand la pièce existe dans une autre filiale.**
 * C'est la règle du `CodeApi` `ressource_inconnue` : « la ressource n'existe pas
 * *dans le périmètre lisible de la session* ». Distinguer « elle n'existe pas »
 * de « elle ne vous appartient pas » ferait de cette route un oracle
 * d'existence inter-filiales — le défaut même que la RLS ferme en dessous.
 */
function pieceIntrouvable(pieceId: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'ressource_inconnue',
    statut: 404,
    message: 'Cette pièce jointe n’existe pas, ou n’est pas disponible.',
    detailJournal: `pièce « ${pieceId} » absente du périmètre lisible, ou non délivrable`,
    entite: 'pieces_jointes',
    identifiant: pieceId,
  });
}

/**
 * Normalise le nom de fichier annoncé par le déposant.
 *
 * ⚠️ **C'est une valeur d'attaquant, et elle sert à trois choses** : elle est
 * stockée, elle part au journal d'audit, et elle revient dans un **en-tête HTTP**
 * à la délivrance. Les caractères de commande sont donc retirés — un `\r\n` dans
 * un nom de fichier est une injection d'en-tête —, le chemin est réduit à son
 * dernier segment, et la longueur est bornée.
 *
 * Ce qu'elle ne fait **pas** : fabriquer un nom de fichier sur le disque. Le nom
 * du disque est tiré au sort (§31.2, contrôle n° 5) et n'emprunte rien à
 * celui-ci. C'est ce qui rend la traversée de répertoire impossible par
 * construction, et non par nettoyage.
 */
export function normaliserNomFichier(brut: string): string | null {
  const dernier = brut.split(/[/\\]/u).pop() ?? '';
  const sansCommande = dernier.replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ').trim();
  if (sansCommande === '' || sansCommande === '.' || sansCommande === '..') return null;
  return sansCommande.length > 255 ? sansCommande.slice(0, 255) : sansCommande;
}

/** Description libre : bornée, sans caractère de commande, ou `null`. */
export function normaliserDescription(brut: Buffer | undefined): string | null {
  if (brut === undefined) return null;
  const texte = brut
    .toString('utf8')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ')
    .trim();
  if (texte === '') return null;
  return texte.length > 2000 ? texte.slice(0, 2000) : texte;
}

/**
 * En-tête `Content-Disposition` de la délivrance — RFC 6266.
 *
 * Deux formes du même nom, et les deux sont nécessaires :
 *
 *  · `filename="…"` — repli **ASCII pur**, pour les clients anciens. Tout ce qui
 *    n'est pas alphanumérique, point, tiret ou souligné devient un souligné :
 *    aucun guillemet, aucune barre oblique inverse, aucun caractère au-delà de
 *    127 ne peut donc sortir de la citation ;
 *  · `filename*=UTF-8''…` — la forme encodée du RFC 5987, qui rend le nom réel
 *    à tout navigateur en service. Le pourcentage-encodage y est intégral, ce
 *    qui met hors de portée toute injection dans l'en-tête.
 *
 * `attachment` est **inconditionnel** (§31.3) : aucune pièce, logo compris, ne
 * s'affiche dans l'origine de l'application.
 */
export function dispositionAttachement(nomFichier: string): string {
  const repli = nomFichier.replace(/[^A-Za-z0-9._-]/gu, '_').slice(0, 120) || 'piece-jointe';
  const encode = encoderRfc5987(nomFichier.slice(0, 255));
  return `attachment; filename="${repli}"; filename*=UTF-8''${encode}`;
}

/** Pourcentage-encodage du RFC 5987 : tout sauf les caractères sûrs. */
function encoderRfc5987(texte: string): string {
  return [...Buffer.from(texte, 'utf8')]
    .map((octet) => {
      const signe = String.fromCharCode(octet);
      return /[A-Za-z0-9!#$&+\-.^_`|~]/u.test(signe)
        ? signe
        : `%${octet.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

/** Ce que le catalogue accepte, pour l'écran et pour les essais. */
export { TYPES_AUTORISES, TYPES_LOGO } from './catalogue.js';
export type { LignePiece };
