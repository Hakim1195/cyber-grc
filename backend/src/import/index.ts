/**
 * Import généralisé — **un importeur, vingt configurations dérivées.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  LE CONTRAT FAIT FOI AU `CONVENTIONS.md` §33.1 ET §33.2, pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * Deux points s'y tranchent, et aucun ne se re-décide :
 *
 *  1. **Les colonnes se DÉCOUVRENT.** `Depot.decrire()` rend déjà, pour chaque
 *     entité, `{ champ: { type, obligatoire } }`. Vingt configurations écrites à
 *     la main seraient vingt omissions qui attendent (§19.5). Ce qui ne se
 *     dérive pas — le **libellé humain** d'une colonne et son ordre — s'écrit,
 *     parce qu'une omission y est bruyante : la colonne s'affiche sous son nom
 *     technique. C'est `modele.ts`.
 *  2. **L'idempotence porte sur le FICHIER**, par `imports.cle_idempotence`
 *     (`empreinte_sha256`, déjà en base). Réimporter le même fichier dans la
 *     même filiale est sans effet, et le dit. C'est `moteur.ts`.
 *
 * ⚠️ **La table `imports` existe depuis `001_socle.sql`**, avec `import_erreurs`
 * pour le rapport ligne à ligne. **Aucune migration n'a été écrite.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les trois routes, et leur déclaration d'accès
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Route | Déclaration | Ce qu'elle fait |
 * |---|---|---|
 * | `GET  /api/import/modeles` | `{ lire, null }` | le catalogue des modèles : entités, colonnes, libellés, types |
 * | `GET  /api/import/:entite/modele` | `{ lire, selon-entite }` | télécharge le modèle vierge (`.xlsx` par défaut, `.csv` sur demande) |
 * | `POST /api/import/:entite` | `{ ecrire, selon-entite }` | dépose un fichier rempli — **aperçu** par défaut, application sur demande |
 *
 * **`selon-entite` impose que l'entité soit dans l'URL**, et c'est ce qui rend le
 * domaine fonctionnel déclaratif : importer des risques met en jeu le domaine
 * `risques`, importer des traitements le domaine `rgpd`, et c'est le crochet
 * `onRequest` du greffon parent qui tranche — avant l'analyse du corps, comme
 * tout le reste (condition E4).
 *
 * ── Un arbitrage à contester, s'il doit l'être ───────────────────────────
 *
 * Le dépôt déclare **`ecrire`, pas `administrer`**. `POST /api/reprise` exige
 * l'administration parce qu'elle **remplace ou fusionne le jeu de données entier**
 * d'une filiale — l'opération la plus destructrice du produit. Un import par
 * entité, lui, **ne fait que créer** : il ne remplace rien, ne supprime rien, et
 * ne met rien à jour (voir l'entête de `moteur.ts`). Exiger l'administration
 * pour charger cinquante actifs interdirait le geste même que le client qualifie
 * de décisif à tous les profils *Contribution*, c'est-à-dire à ceux qui
 * intègrent une société rachetée. C'est un choix, il est écrit ici pour que la
 * porte puisse le refuser.
 *
 * ⚠️ Ce que cela ne desserre pas : le niveau **`contribution`** reste exigé, le
 * **domaine de l'entité** reste exigé, la **filiale active** reste la seule où
 * l'on écrit, et la RLS referme derrière. Un profil *Lecture* est refusé par
 * `deciderAcces`, avant que son fichier soit lu.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'aperçu est le défaut, et ce n'est pas une politesse
 * ════════════════════════════════════════════════════════════════════════
 *
 * `POST /api/import/:entite` **n'écrit rien** tant que `appliquer=oui` n'est pas
 * demandé. Un aperçu applique VRAIMENT l'import puis annule sa transaction — le
 * même procédé que `POST /api/reprise` —, si bien que les chiffres qu'il rend
 * sont ceux d'un import réel et non une estimation. C'est la seule façon de
 * répondre honnêtement à « que va-t-il se passer ».
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { Configuration } from '../config/index.js';
import { avecTransaction, PERIMETRE_SYSTEME } from '../db/pool.js';
import { chargerCatalogue, Depot, listerEntites } from '../entites/index.js';
import type { NomEntite } from '../entites/types.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import type { ContexteTraduction } from '../erreurs/index.js';
import { analyserMultipart, ErreurMultipart } from '../pieces/multipart.js';
import type { SessionAppliquee } from '../api/session.js';

import { ecrireCsv, ecrireXlsx } from './classeur.js';
import { construireModeles } from './modele.js';
import type { ModeleEntite } from './modele.js';
import { executerImport } from './moteur.js';
import { ErreurTableur, LIGNES_MAX } from './tableur.js';

export interface OptionsImport {
  readonly pool: Pool;
  readonly config: Configuration;
}

/* =====================================================================
 *  Bornes
 * ===================================================================== */

/**
 * Taille maximale d'un fichier d'import.
 *
 * Un classeur de 5 000 lignes sur douze colonnes pèse ~200 kio ; 12 Mio laissent
 * une marge considérable pour un fichier chargé de mise en forme, tout en
 * bornant ce qui est tenu **en mémoire** — le serveur est mono-fil, et deux
 * imports simultanés de 25 Mio figeraient `/api/sante` avec le reste.
 *
 * Elle est en outre plafonnée par la borne de corps du serveur : deux vérités
 * sur la même question finissent par diverger, et c'est la plus petite qui doit
 * gagner.
 */
const TAILLE_MAX_IMPORT_OCTETS = 12 * 1024 * 1024;

/** Marge d'enveloppe multipart — frontières, en-têtes de parties, champs annexes. */
const MARGE_ENVELOPPE = 64 * 1024;

/** Nom du champ de formulaire portant le fichier. Un seul, et il est nommé. */
const CHAMP_FICHIER = 'fichier';

/** Entités acceptées dans l'URL — **dérivées** du registre, jamais recopiées. */
const ENTITES = Object.freeze([...listerEntites()].sort());

const SCHEMA_PARAMS_ENTITE = {
  type: 'object',
  required: ['entite'],
  additionalProperties: false,
  properties: { entite: { type: 'string', enum: ENTITES } },
} as const;

const SCHEMA_QUERY_MODELE = {
  type: 'object',
  additionalProperties: false,
  properties: { format: { type: 'string', enum: ['xlsx', 'csv'] } },
} as const;

const SCHEMA_QUERY_IMPORT = {
  type: 'object',
  additionalProperties: false,
  properties: { appliquer: { type: 'string', enum: ['oui', 'non'] } },
} as const;

/* =====================================================================
 *  Le greffon
 * ===================================================================== */

// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonImport(
  instance: FastifyInstance,
  options: OptionsImport,
): Promise<void> {
  const { pool, config } = options;

  const plafondCorps =
    Math.min(TAILLE_MAX_IMPORT_OCTETS, config.serveur.tailleMaxCorpsOctets) + MARGE_ENVELOPPE;
  const tailleMaxFichier = Math.min(
    TAILLE_MAX_IMPORT_OCTETS,
    config.serveur.tailleMaxCorpsOctets,
  );

  /* -------------------------------------------------------------------
   *  La taille, AVANT que l'octet suivant soit lu
   * -------------------------------------------------------------------
   *  Même motif que le contrôle n° 1 du §31.2, et pour la même raison : un
   *  fichier hors borne ne doit jamais être assemblé en mémoire. Deux gardes,
   *  et la première est gratuite — `content-length` quand il est annoncé, puis
   *  un compteur pendant la lecture pour le cas `Transfer-Encoding: chunked`,
   *  où aucune longueur n'est annoncée. C'est le cas qu'on oublie, et c'est
   *  celui qu'un attaquant choisira.
   *
   *  ⚠️ Fastify n'applique pas `bodyLimit` à un analyseur de flux brut : la
   *  borne écrite dans les options de route est une déclaration d'intention
   *  lisible, pas le contrôle. Le contrôle est ce compteur.
   *
   *  Le parseur est posé sur **ce greffon**, qui est encapsulé : il ne touche
   *  ni celui des pièces jointes, ni aucune autre route du serveur.
   * ------------------------------------------------------------------- */
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

  const refusDeTaille = (mesure: number): ErreurApplicative =>
    new ErreurApplicative({
      code: 'volume_excessif',
      statut: 413,
      message:
        'Ce fichier dépasse la taille maximale d’un import ' +
        `(${String(Math.floor(tailleMaxFichier / (1024 * 1024)))} Mio). ` +
        'Découpez-le en plusieurs fichiers.',
      detailJournal: `corps d'import de ${String(mesure)} o au-delà du plafond de ${String(plafondCorps)} o`,
    });

  /* -------------------------------------------------------------------
   *  Le dépôt et les modèles — découverts une fois, gardés
   * ------------------------------------------------------------------- */
  let depot: Depot | null = null;
  let modeles: ReadonlyMap<NomEntite, ModeleEntite> | null = null;
  /**
   * Ce que la traduction des refus doit savoir du schéma.
   *
   * **Découvert, jamais listé** — et passé en paramètre, pour que `src/erreurs/`
   * reste sans dépendance d'exécution. C'est le même montage que
   * `contexteErreurs` de `src/api/index.ts`, et il sert la même propriété :
   * aucun nom d'objet interne ne sort, et un refus de `check` nomme la colonne
   * plutôt qu'une contrainte.
   */
  let contexteErreurs: ContexteTraduction = {};
  /** Colonnes de chaque contrainte — **découvertes**, jamais recopiées. */
  let colonnesParContrainte: ReadonlyMap<string, readonly string[]> = new Map();

  /**
   * Découvre le catalogue et construit les modèles.
   *
   * ════════════════════════════════════════════════════════════════════
   *  ⚠️ CE MODULE N'APPELLE **PAS** le garde-fou du registre, et c'est délibéré
   * ════════════════════════════════════════════════════════════════════
   *
   * La première rédaction l'appelait, par prudence. `test/api/identifiants.test.mjs`
   * l'a refusé, et il a raison : *« un seul appelant hors du module qui déclare,
   * et cet appelant est celui qui tient la porte de démarrage. Deux points de
   * démarrage, c'est un point de démarrage qu'on oubliera de brancher. »* La
   * porte est `assurerDepot` de `src/api/index.ts` : elle est branchée sur
   * `onReady`, elle **retient** son verdict, et un registre incohérent y fait
   * échouer le démarrage du service. Aucune route d'import n'est donc
   * atteignable dans cet état.
   *
   * ── La fenêtre résiduelle, écrite plutôt que tue (§17.5) ─────────────
   *
   * Si la base est **injoignable au démarrage**, la porte du parent laisse le
   * service démarrer (503 transitoire) et se rejoue à la première requête qui
   * l'emprunte. Une requête d'import qui arriverait avant celles-là verrait un
   * catalogue non confronté au registre. En pratique le cas ne se présente pas —
   * le navigateur appelle `/api/session` puis `/api/donnees` avant d'afficher
   * quoi que ce soit, et ces deux routes passent par la porte —, mais ce n'est
   * vrai que **par l'ordre du client**, pas par construction.
   *
   * ⚠️ **Ce qui la fermerait tient en une ligne, et elle n'appartient pas à ce
   * module** : `instance.decorate('depotGrc', assurerDepot)` dans
   * `src/api/index.ts`, dont ce greffon se servirait au lieu de découvrir le
   * catalogue lui-même.
   *
   * Le reste de l'arbitrage est inchangé : une base injoignable est
   * **transitoire** — 503, on retentera à la requête suivante.
   */
  const assurerModeles = async (): Promise<{
    depot: Depot;
    modeles: ReadonlyMap<NomEntite, ModeleEntite>;
  }> => {
    if (depot !== null && modeles !== null) return { depot, modeles };

    const catalogue = await avecTransaction(pool, PERIMETRE_SYSTEME, chargerCatalogue, {
      lectureSeule: true,
    });
    depot = new Depot(catalogue);
    modeles = construireModeles(depot);
    contexteErreurs = {
      nomsInternes: new Set(catalogue.tables.keys()),
      unicites: catalogue.unicites,
      validations: catalogue.validations,
    };
    const parContrainte = new Map<string, readonly string[]>();
    for (const [nom, validation] of catalogue.validations) parContrainte.set(nom, validation.colonnes);
    for (const [nom, unicite] of catalogue.unicites) parContrainte.set(nom, unicite.colonnes);
    for (const cle of catalogue.clesEtrangeres) parContrainte.set(cle.nom, cle.colonnes);
    colonnesParContrainte = parContrainte;
    return { depot, modeles };
  };

  /**
   * Session appliquée — **fail-closed**. Une route atteinte sans session est un
   * défaut de montage, et un 500 explicite vaut mieux qu'une transaction sur un
   * périmètre improvisé.
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

  /** Modèle de l'entité visée par l'URL. */
  const modeleDe = async (requete: FastifyRequest): Promise<ModeleEntite> => {
    const { modeles: tous } = await assurerModeles();
    const nom = (requete.params as { entite?: string }).entite ?? '';
    const modele = tous.get(nom as NomEntite);
    if (modele === undefined) {
      // Le schéma de route a déjà refusé tout nom hors de l'énumération : ce
      // refus-ci ne peut survenir que si le registre et l'énumération
      // divergeaient. Il est écrit pour que la divergence soit dite, pas subie.
      throw entreeInvalide(
        'Cette catégorie de données ne peut pas être importée.',
        `entité « ${nom} » absente des modèles d'import`,
      );
    }
    return modele;
  };

  /* ===================================================================
   *  GET /api/import/modeles — le catalogue, pour l'écran
   * =================================================================== */
  instance.get(
    '/api/import/modeles',
    { config: { acces: { action: 'lire', domaine: null } } },
    async (_requete: FastifyRequest, reponse: FastifyReply) => {
      const { modeles: tous } = await assurerModeles();
      return reponse.send({
        lignesMax: LIGNES_MAX,
        tailleMaxOctets: tailleMaxFichier,
        entites: [...tous.values()].map((modele) => ({
          entite: modele.entite,
          domaine: modele.domaine,
          colonnes: modele.colonnes.map((colonne) => ({
            champ: colonne.champ,
            libelle: colonne.libelle,
            type: colonne.type,
            obligatoire: colonne.obligatoire,
          })),
          // Nommées, jamais tues : un utilisateur qui cherche « dépendances »
          // dans le modèle des actifs doit apprendre qu'elles n'y sont pas.
          liaisonsExclues: modele.liaisonsExclues,
        })),
      });
    },
  );

  /* ===================================================================
   *  GET /api/import/:entite/modele — le fichier vierge
   * ===================================================================
   *  Il ne contient AUCUNE donnée : c'est un formulaire vide. Il déclare donc
   *  `lire` et non `exporter` — le droit d'export vise l'extraction d'un jeu de
   *  données (`PLAN_SERVEUR` §3.3), et l'exiger ici empêcherait un contributeur
   *  de télécharger le gabarit qu'il a le droit de remplir.
   * =================================================================== */
  instance.get(
    '/api/import/:entite/modele',
    {
      schema: { params: SCHEMA_PARAMS_ENTITE, querystring: SCHEMA_QUERY_MODELE },
      config: { acces: { action: 'lire', domaine: 'selon-entite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const modele = await modeleDe(requete);
      const format = (requete.query as { format?: string }).format ?? 'xlsx';

      const enTetes = modele.colonnes.map((colonne) => colonne.libelle);
      // ── La feuille d'aide vit sur un SECOND onglet ────────────────────
      // Jamais sous l'en-tête : une ligne d'explication placée dans la feuille
      // de données serait relue comme un enregistrement le jour où
      // l'utilisateur renvoie le fichier — et créerait un actif nommé
      // « texte, obligatoire ».
      const aide: string[][] = [
        ['Colonne', 'Nom technique', 'Type attendu', 'Obligatoire'],
        ...modele.colonnes.map((colonne) => [
          colonne.libelle,
          colonne.champ,
          libelleDuType(colonne.type),
          colonne.obligatoire ? 'oui' : 'non',
        ]),
      ];
      if (modele.liaisonsExclues.length > 0) {
        aide.push([]);
        aide.push([
          'Non repris par l’import :',
          modele.liaisonsExclues.join(', '),
          'ces liens se saisissent dans l’application',
          '',
        ]);
      }

      const nomFichier = `modele-import-${modele.entite}.${format}`;
      const corps =
        format === 'csv'
          ? ecrireCsv([enTetes])
          : ecrireXlsx([
              { nom: nomOnglet(modele.entite), lignes: [enTetes] },
              { nom: 'Aide', lignes: aide },
            ]);

      return reponse
        .header(
          'content-type',
          format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        // Le nom est fabriqué par le serveur à partir d'un nom d'entité issu
        // d'une énumération close : aucune valeur d'utilisateur n'entre dans
        // cet en-tête.
        .header('content-disposition', `attachment; filename="${nomFichier}"`)
        .header('x-content-type-options', 'nosniff')
        .header('content-length', String(corps.length))
        .header('cache-control', 'private, no-store')
        .send(corps);
    },
  );

  /* ===================================================================
   *  POST /api/import/:entite — déposer un fichier rempli
   * =================================================================== */
  instance.post(
    '/api/import/:entite',
    {
      bodyLimit: plafondCorps,
      schema: { params: SCHEMA_PARAMS_ENTITE, querystring: SCHEMA_QUERY_IMPORT },
      config: { acces: { action: 'ecrire', domaine: 'selon-entite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      if (perimetre.filialeId === null) {
        throw new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 403,
          message:
            'Aucune filiale active : sélectionnez la filiale dans laquelle importer ce fichier.',
          detailJournal: `import demandé sans filiale active pour ${perimetre.utilisateurId}`,
        });
      }

      const modele = await modeleDe(requete);
      const { depot: instanceDepot } = await assurerModeles();
      // ⚠️ L'application est un geste EXPLICITE. Le défaut est l'aperçu : un
      // client qui oublie le paramètre ne détruit rien, il regarde.
      const apercu = (requete.query as { appliquer?: string }).appliquer !== 'oui';

      const corps = requete.body;
      if (!Buffer.isBuffer(corps)) {
        throw entreeInvalide(
          'L’import attend un envoi de formulaire (multipart/form-data).',
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
      if (fichier.contenu.length > tailleMaxFichier) throw refusDeTaille(fichier.contenu.length);

      const nomFichier = normaliserNomFichier(fichier.nomFichier);
      if (nomFichier === null) {
        throw entreeInvalide('Le nom du fichier est vide ou illisible. L’import est refusé.');
      }

      let rapport;
      try {
        rapport = await executerImport({
          pool,
          depot: instanceDepot,
          modele,
          perimetre,
          nomFichier,
          contenu: fichier.contenu,
          apercu,
          adresseIp: requete.ip,
          contexteErreurs,
          colonnesParContrainte,
        });
      } catch (erreur) {
        // Un fichier illisible ou hors borne est une **entrée invalide**, pas
        // une panne : il n'a coûté aucune connexion du pool, et son message est
        // écrit pour l'exploitant qui doit corriger son fichier.
        if (erreur instanceof ErreurTableur) {
          throw entreeInvalide(erreur.message, `import refusé à la lecture : ${erreur.message}`);
        }
        throw erreur;
      }

      // 409 quand des lignes sont refusées : la requête est bien formée, mais
      // l'état demandé est en conflit avec ce que la base accepte. Un 200 ferait
      // passer un refus pour un succès dans tout client qui ne lit que le
      // statut — et le rapport est le même dans les deux cas.
      return reponse.code(rapport.enErreur > 0 ? 409 : 200).send(rapport);
    },
  );
}

/* =====================================================================
 *  Aides — pures, éprouvables seules
 * ===================================================================== */

/** Type attendu, dit en français plutôt qu'en vocabulaire de catalogue. */
export function libelleDuType(type: string): string {
  switch (type) {
    case 'texte':
      return 'texte';
    case 'entier':
      return 'nombre entier';
    case 'nombre':
      return 'nombre';
    case 'booleen':
      return 'oui / non';
    case 'date':
      return 'date (AAAA-MM-JJ ou JJ/MM/AAAA)';
    case 'horodatage':
      return 'date et heure';
    case 'json':
      return 'document JSON';
    default:
      return type;
  }
}

/** Nom d'onglet du modèle : le nom de l'entité, borné par Excel à 31 signes. */
function nomOnglet(entite: string): string {
  return entite.slice(0, 31);
}

/**
 * Normalise le nom de fichier annoncé par le déposant.
 *
 * ⚠️ **C'est une valeur d'attaquant**, et elle sert à trois choses : elle est
 * stockée dans `imports.nom_fichier`, elle part au journal d'audit en `jsonb`, et
 * elle revient dans le rapport. Les caractères de commande sont retirés — un
 * `\r\n` dans un nom de fichier est une injection d'en-tête —, le chemin est
 * réduit à son dernier segment, et la longueur est bornée.
 *
 * Ce qu'elle ne fait **pas** : fabriquer un chemin sur le disque. L'import n'en
 * écrit aucun ; le fichier ne quitte jamais la mémoire.
 */
export function normaliserNomFichier(brut: string): string | null {
  const dernier = brut.split(/[/\\]/u).pop() ?? '';
  const sansCommande = dernier.replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ').trim();
  if (sansCommande === '' || sansCommande === '.' || sansCommande === '..') return null;
  return sansCommande.length > 255 ? sansCommande.slice(0, 255) : sansCommande;
}
