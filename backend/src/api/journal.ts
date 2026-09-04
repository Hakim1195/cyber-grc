/**
 * Consultation du journal d'audit — **les trois routes du `CONVENTIONS.md` §29.8.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existait avant son contenu
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le lot L5 se construit à plusieurs mains : un agent émet les entrées
 * (`src/entites/`, `src/api/index.ts`), un autre les rend lisibles (ici, plus la
 * migration `008_journal_lecture.sql` qui resserre la politique de lecture), un
 * troisième les affiche (`cyber-gouvernance_V4/js/modules/journal.js`). Le
 * `PLAN_EXECUTION` §2 bis l'écrit : *« le remède n'est pas de sérialiser, c'est
 * de publier le contrat d'abord »* — l'agent du chemin critique livre son
 * interface, les dépendants démarrent contre elle.
 *
 * **Il est déjà enregistré par `src/api/index.ts`.** Aucun agent n'a donc eu à
 * toucher au point d'entrée pour brancher ces routes.
 *
 * ⚠️ **CE QU'IL RESTE À FAIRE HORS DE CE FICHIER, ET SANS QUOI LES TROIS ROUTES
 * NE MONTENT PAS.** `src/api/index.ts` enregistre ce greffon avec `{}` :
 *
 *     await instance.register(greffonJournal, {});
 *
 * Il doit lui passer le pool, que `construireApi` a déjà sous la main :
 *
 *     await instance.register(greffonJournal, { pool });
 *
 * C'est l'unique changement, et il était prévu — l'entête de la version vide de
 * ce fichier le disait : *« l'agent qui implémente les routes y déclare ce dont
 * il a besoin (accès au pool, au dépôt), et `src/api/index.ts` les lui passe à
 * l'enregistrement »*. Tant qu'il n'est pas fait, le greffon **n'enregistre
 * aucune route** et le dit au journal technique en `error` : une route qui
 * existerait en rendant 503 serait une surface publique que personne n'a décidé
 * d'ouvrir, et un montage silencieux serait pire encore.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat — il fait foi au `CONVENTIONS.md` §29.8, pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Route | Déclaration d'accès | Rend |
 * |---|---|---|
 * | `GET /api/journal` | `{ action: 'lire', domaine: 'journal' }` | une page d'entrées |
 * | `GET /api/journal/export` | `{ action: 'exporter', domaine: 'journal' }` | le même jeu, en fichier |
 * | `GET /api/journal/verification` | `{ action: 'lire', domaine: 'journal' }` | `f_journal_audit_verifier()` |
 *
 * Trois points que le §29 tranche et qui ne sont pas re-décidés ici :
 *
 *  1. **`domaine: 'journal'`, jamais `'administration'`.** Le vocabulaire de
 *     décision porte quatorze domaines depuis le 04/09/2026 : régler
 *     l'application et lire trois ans d'identités ne sont pas le même droit
 *     (`src/api/droits.ts`).
 *  2. **La pagination se fait sur `numero`, jamais sur un décalage.** `numero`
 *     est strictement croissant et sans trou (`CONVENTIONS.md` §12) : c'est un
 *     curseur exact. Un `offset` sur un journal qui grandit pendant qu'on le
 *     feuillette saute des lignes.
 *
 *     Les NOMS sont normatifs depuis le 04/09/2026, et ils le sont parce qu'ils
 *     manquaient : le §29.8 figeait les chemins, les classes d'accès et les cinq
 *     filtres, mais ni le curseur ni la forme de l'enveloppe — que le serveur et
 *     l'écran allaient donc choisir chacun de son côté.
 *
 *     | Élément | Nom |
 *     |---|---|
 *     | curseur de page (entrées de `numero` **strictement inférieur**) | `avant` |
 *     | taille de page (défaut **50**, plafond **500**) | `limite` |
 *     | tableau des entrées | `entrees` |
 *     | curseur de la page suivante, `null` s'il n'y a plus rien | `suivant` |
 *
 *     Deux propriétés qui ne sont pas décoratives : **l'ordre est `numero`
 *     décroissant** — c'est ce qui rend `avant` monotone —, et **le serveur
 *     émet `suivant`** plutôt que de laisser l'écran le déduire.
 *  3. **Lire le journal est lui-même un acte tracé** — `consultation_sensible`
 *     pour la page, `export` pour le fichier, `verification_journal` pour le
 *     contrôle de chaîne. « Qui a lu le journal » est une question d'audit, et
 *     la seule table qui puisse y répondre est celle-ci.
 *
 * ⚠️ **La route d'export exige le droit d'export EN PLUS du domaine** — c'est
 * `deciderAcces` qui l'impose, sur la seule foi de la déclaration `exporter`, et
 * le contrôle a lieu dans le crochet `onRequest` du greffon parent, avant que
 * cette route s'exécute. C'est la moitié du constat **Q-89** que la porte S3
 * avait laissée ouverte : le droit d'export avait été rendu inviolable, et aucun
 * export n'était tracé. Un export du journal d'audit qui ne serait pas lui-même
 * journalisé serait la version la plus embarrassante de ce défaut.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ces routes NE font pas, et pourquoi c'est écrit
 * ════════════════════════════════════════════════════════════════════════
 *
 *  · **Aucun décompte total.** Une page ne dit pas « 1 sur 12 400 » : un
 *    `count(*)` sur trois ans de journal balaie la table à chaque écran. Le
 *    curseur `suivant` dit s'il y a une suite, ce qui est la seule chose dont
 *    l'écran ait besoin pour proposer « page suivante ».
 *  · **Aucun filtre par filiale.** Le cloisonnement n'est pas un filtre : il est
 *    tenu par la Row Level Security (`008_journal_lecture.sql` §5), sous le
 *    code. Offrir un paramètre `filiale` donnerait à croire que son absence
 *    élargit la vue, alors qu'elle ne l'élargit jamais.
 *  · **Aucune écriture, aucune purge.** La rétention à trois ans est une
 *    procédure d'exploitation sous le compte propriétaire, hors application par
 *    construction (`CONVENTIONS.md` §12).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import type { SessionAppliquee } from './session.js';

/**
 * Options du greffon.
 *
 * `pool` est **facultatif dans le type et indispensable à l'exécution**, et ce
 * décalage est un choix : le rendre obligatoire ferait échouer la compilation de
 * `src/api/index.ts`, qui enregistre encore ce greffon avec `{}` — c'est-à-dire
 * qu'un agent en bloquerait trois autres pour une ligne. Le greffon refuse donc
 * bruyamment à l'exécution plutôt que silencieusement à la compilation.
 */
export interface OptionsJournal {
  /**
   * Pool de connexions du serveur.
   *
   * ⚠️ **Obligatoire, et ce n'est pas un détail de typage.** Il a été rendu
   * facultatif le temps que la couture soit branchée — l'agent qui a écrit ces
   * routes ne possédait pas `src/api/index.ts` —, et le greffon se contentait
   * alors de crier dans le journal technique avant de n'enregistrer aucune
   * route. C'était **la pire des défaillances possibles pour ce greffon-ci** :
   * la consultation du journal d'audit disparaissait en silence, et l'écran
   * recevait un 404 qu'il ne pouvait pas distinguer d'une absence de droits.
   *
   * *Un garde-fou que rien n'appelle est un commentaire* (§18.4) — et un message
   * d'erreur au démarrage que personne ne lit en est un aussi. Le rendre
   * obligatoire fait garantir l'existence des trois routes **par le
   * compilateur**, ce qui ne dépend d'aucune discipline.
   */
  readonly pool: Pool;
}

/* =====================================================================
 *  Schémas de validation au bord
 * ---------------------------------------------------------------------
 *  Ils bornent la FORME. Aucune valeur reçue n'atteint jamais du SQL : les
 *  filtres sont des **paramètres** (`$1`…`$7`), jamais des fragments de
 *  requête, et le tri comme la pagination sont fixés par le code
 *  (`CONVENTIONS.md` §17.4, contrôle S5).
 *
 *  Pas de mot-clé `format` : le serveur ne charge pas `ajv-formats`, et un
 *  `format: 'date-time'` y serait ignoré **en silence**. Les deux bornes de
 *  date sont donc validées par `Date`, comme le fait déjà `/api/rafraichir`.
 * ===================================================================== */

/**
 * Page par défaut, et plafonds. Deux valeurs, deux usages, deux schémas.
 *
 * **50 est normatif** (`CONVENTIONS.md` §29.8, arbitrage du 04/09/2026), pas un
 * goût : c'est la taille que l'écran de `js/modules/journal.js` emploie déjà.
 * Il valait 100 ici, et personne ne l'aurait vu — une page de 100 servie à un
 * écran qui en attend 50 ne casse rien, elle change seulement le moment où le
 * curseur bascule. C'est le genre d'écart qui ne se découvre qu'en comptant.
 */
const LIMITE_PAGE_DEFAUT = 50;
const LIMITE_PAGE_MAX = 500;
const LIMITE_EXPORT = 50_000;

const FILTRES_COMMUNS = {
  depuis: { type: 'string', minLength: 10, maxLength: 40 },
  jusqu_a: { type: 'string', minLength: 10, maxLength: 40 },
  // `action` et `entite_type` partent en paramètre : une valeur inconnue ne
  // rend rien, elle ne casse rien. Les borner à une énumération écrite ici
  // ferait une seconde copie de `ck_journal_audit_action` — et deux copies
  // d'une même liste finissent par ne plus dire la même chose (§19.5).
  action: { type: 'string', minLength: 1, maxLength: 32 },
  utilisateur: { type: 'string', minLength: 1, maxLength: 128 },
  entite_type: { type: 'string', minLength: 1, maxLength: 32 },
  /** Curseur : n'affiche que les entrées **antérieures** à ce numéro. */
  avant: { type: 'integer', minimum: 1 },
} as const;

// Deux schémas plutôt qu'un, parce que les deux routes n'ont pas le même
// plafond et qu'un plafond appliqué en silence est un plafond qu'on découvre
// en comptant ses lignes. Un écran demande une page ; un auditeur emporte un
// extrait. Dépasser se solde par un 400, jamais par une troncature muette.
const SCHEMA_PAGE = {
  type: 'object',
  additionalProperties: false,
  properties: { ...FILTRES_COMMUNS, limite: { type: 'integer', minimum: 1, maximum: LIMITE_PAGE_MAX } },
} as const;

const SCHEMA_EXPORT = {
  type: 'object',
  additionalProperties: false,
  properties: { ...FILTRES_COMMUNS, limite: { type: 'integer', minimum: 1, maximum: LIMITE_EXPORT } },
} as const;

const SCHEMA_VERIFICATION = {
  type: 'object',
  additionalProperties: false,
  properties: { depuis: { type: 'integer', minimum: 1 } },
} as const;

/**
 * Colonnes rendues, dans l'ordre où l'écran et le fichier les présentent.
 *
 * ⚠️ **`empreinte` et `empreinte_precedente` en font partie, à dessein.** Ce ne
 * sont pas des secrets : ce sont les maillons de la chaîne, et un auditeur qui
 * emporte un extrait du journal doit pouvoir le recouper avec
 * `f_journal_audit_verifier()`. Un extrait sans ses empreintes est une copie
 * qu'on ne peut plus rattacher à l'original.
 */
const COLONNES = [
  'numero',
  'id',
  'horodatage',
  'filiale_id',
  'utilisateur_id',
  'utilisateur_libelle',
  'session_id',
  'adresse_ip',
  'action',
  'entite_type',
  'entite_id',
  'resume',
  'valeurs_avant',
  'valeurs_apres',
  'version_application',
  'empreinte_precedente',
  'empreinte',
] as const;

interface Filtres {
  readonly depuis: string | null;
  readonly jusquA: string | null;
  readonly action: string | null;
  readonly utilisateur: string | null;
  readonly entiteType: string | null;
  readonly avant: number | null;
  readonly limite: number;
}

interface QuerystringJournal {
  readonly depuis?: string;
  readonly jusqu_a?: string;
  readonly action?: string;
  readonly utilisateur?: string;
  readonly entite_type?: string;
  readonly avant?: number;
  readonly limite?: number;
}

/**
 * Greffon de consultation du journal.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonJournal(
  instance: FastifyInstance,
  options: OptionsJournal,
): Promise<void> {
  // `pool` est obligatoire : le repli qui existait ici — journaliser une erreur
  // puis n'enregistrer aucune route — a été retiré avec le typage facultatif.
  // Voir `OptionsJournal.pool`.
  const { pool } = options;

  /**
   * Session appliquée à cette requête — **fail-closed**, comme `sessionDe` du
   * greffon parent : une route atteinte sans session est un défaut de montage,
   * et un 500 explicite vaut mieux qu'une transaction sur un périmètre
   * improvisé.
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

  /**
   * Lit les filtres de l'URL et les rend sous une forme close.
   *
   * Les deux bornes de date sont converties **ici** : plus loin, il n'existe
   * plus de chaîne libre, seulement des valeurs typées qui partent en
   * paramètres.
   */
  const filtresDe = (requete: QuerystringJournal, limiteDefaut: number, limiteMax: number): Filtres => {
    const date = (valeur: string | undefined, nom: string): string | null => {
      if (valeur === undefined) return null;
      const analysee = new Date(valeur);
      if (Number.isNaN(analysee.getTime())) {
        throw entreeInvalide(`Le paramètre « ${nom} » n'est pas un horodatage valide.`);
      }
      return analysee.toISOString();
    };

    const depuis = date(requete.depuis, 'depuis');
    const jusquA = date(requete.jusqu_a, 'jusqu_a');
    if (depuis !== null && jusquA !== null && depuis > jusquA) {
      throw entreeInvalide("La borne « depuis » est postérieure à la borne « jusqu_a ».");
    }

    return {
      depuis,
      jusquA,
      action: requete.action ?? null,
      utilisateur: requete.utilisateur ?? null,
      entiteType: requete.entite_type ?? null,
      avant: requete.avant ?? null,
      limite: Math.min(requete.limite ?? limiteDefaut, limiteMax),
    };
  };

  /**
   * La requête, **entièrement paramétrée**.
   *
   * `order by numero desc` et le curseur `numero < $6` : le §29.8 tranche que la
   * pagination se fait sur `numero`, jamais sur un décalage. `numero` est
   * strictement croissant et sans trou (§12) — un `offset` sur un journal qui
   * grandit pendant qu'on le feuillette saute des lignes, et ce sont
   * précisément les lignes les plus récentes qu'on saute.
   *
   * ⚠️ Le **cloisonnement n'est pas ici** : il est dans la politique de lecture
   * (`008_journal_lecture.sql` §5), sous le code. Cette requête n'a donc aucune
   * clause de filiale, et c'est voulu — une clause écrite ici donnerait à croire
   * que le filtrage dépend d'elle.
   */
  const lirePage = async (client: PoolClient, filtres: Filtres): Promise<Record<string, unknown>[]> => {
    const resultat = await client.query(
      `select ${COLONNES.map((c) => `"${c}"`).join(', ')}
         from "journal_audit"
        where ($1::timestamptz is null or "horodatage" >= $1::timestamptz)
          and ($2::timestamptz is null or "horodatage" <  $2::timestamptz)
          and ($3::text is null or "action" = $3::text)
          and ($4::text is null or "utilisateur_libelle" = $4::text or "utilisateur_id" = $4::text)
          and ($5::text is null or "entite_type"::text = $5::text)
          and ($6::bigint is null or "numero" < $6::bigint)
        order by "numero" desc
        limit $7::int`,
      [
        filtres.depuis,
        filtres.jusquA,
        filtres.action,
        filtres.utilisateur,
        filtres.entiteType,
        filtres.avant,
        filtres.limite,
      ],
    );
    return resultat.rows as Record<string, unknown>[];
  };

  /**
   * Trace la consultation, **dans la transaction qui l'a servie** (§29.3).
   *
   * Une lecture du journal qui réussirait sans laisser de trace serait
   * exactement le défaut que ce lot ferme : « qui a lu le journal » est une
   * question d'audit. Elle est donc écrite avant le `commit`, et un échec
   * d'écriture emporte la lecture — le client reçoit une erreur plutôt qu'une
   * page non tracée.
   *
   * `resume` est une **phrase écrite par le développeur** (§29.5) : aucune
   * valeur reçue du client n'y entre. Les filtres partent en `valeurs_apres`,
   * en `jsonb`, où l'encodage est le problème de PostgreSQL.
   */
  const tracer = async (
    client: PoolClient,
    perimetre: PerimetreSession,
    requete: FastifyRequest,
    action: 'consultation_sensible' | 'export' | 'verification_journal',
    resume: string,
    details: Record<string, unknown>,
  ): Promise<void> => {
    await journaliser(client, {
      action,
      resume,
      filialeId: perimetre.filialeId,
      utilisateurLibelle: perimetre.utilisateurId,
      adresseIp: requete.ip,
      valeursApres: details,
    });
  };

  /** Filtres tels qu'ils partent au journal : lisibles, et sans valeur nulle. */
  const filtresTraces = (filtres: Filtres): Record<string, unknown> => {
    const trace: Record<string, unknown> = { limite: filtres.limite };
    if (filtres.depuis !== null) trace.depuis = filtres.depuis;
    if (filtres.jusquA !== null) trace.jusqu_a = filtres.jusquA;
    if (filtres.action !== null) trace.action = filtres.action;
    if (filtres.utilisateur !== null) trace.utilisateur = filtres.utilisateur;
    if (filtres.entiteType !== null) trace.entite_type = filtres.entiteType;
    if (filtres.avant !== null) trace.avant = filtres.avant;
    return trace;
  };

  /* -------------------------------------------------------------------
   *  GET /api/journal — une page d'entrées
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/journal',
    {
      schema: { querystring: SCHEMA_PAGE },
      config: { acces: { action: 'lire', domaine: 'journal' } },
    },
    async (requete: FastifyRequest<{ Querystring: QuerystringJournal }>, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      const filtres = filtresDe(requete.query, LIMITE_PAGE_DEFAUT, LIMITE_PAGE_MAX);

      const page = await avecTransaction(pool, perimetre, async (client) => {
        const entrees = await lirePage(client, filtres);
        await tracer(
          client,
          perimetre,
          requete,
          'consultation_sensible',
          'Consultation du journal d’audit',
          { ...filtresTraces(filtres), lignes: entrees.length },
        );
        return entrees;
      });

      // Le curseur de la page suivante est le plus PETIT numéro rendu : la page
      // est triée décroissant, et la suite se demande par « avant ». Il vaut
      // null dès que la page est incomplète — il n'y a alors rien après.
      //
      // `Number(...)` parce que le pilote rend un `bigint` en CHAÎNE, par
      // prudence de précision, et que le paramètre `avant` est déclaré entier :
      // rendre une chaîne obligerait l'appelant à la reconvertir pour la
      // renvoyer. Le journal atteindrait 2^53 entrées après quelques millions
      // d'années de service ; l'écart de précision est théorique, l'aller-retour
      // ne l'est pas.
      const suivant =
        page.length < filtres.limite ? null : Number(page[page.length - 1]?.numero ?? 0) || null;

      // ── L'ENVELOPPE EST NORMATIVE (§29.8) : « entrees » et « suivant » SŒURS ──
      //
      // Elle portait « pagination: { limite, suivant } ». La forme n'était fixée
      // nulle part, l'écran a choisi la sienne, et deux moitiés du même lot se
      // seraient croisées sans se voir — l'écran lisant « corps.suivant » sur un
      // serveur qui rendait « corps.pagination.suivant », donc feuilletant une
      // seule page en croyant les avoir toutes. Le §29.8 tranche : les deux clés
      // sont sœurs. « limite » reste rendue, en information — elle dit quelle
      // taille de page a EFFECTIVEMENT été servie, ce qu'un client qui n'a rien
      // demandé ne peut pas deviner.
      //
      // Et c'est le SERVEUR qui émet « suivant ». L'écran sait le déduire — le
      // plus petit numéro de la page —, mais cette déduction n'est juste que si
      // l'on connaît la taille de page ; or une taille de page est un réglage.
      return reponse.send({ entrees: page, suivant, limite: filtres.limite });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/journal/export — le même jeu, en fichier
   * -------------------------------------------------------------------
   *  ══ Le format se prouve sur une entrée HOSTILE ═════════════════════
   *
   *  L'auditeur de la porte S3 a forgé un login contenant du JSON et des sauts
   *  de ligne ; il est arrivé littéralement dans le journal. Le chaînage n'en a
   *  pas souffert et rien n'a fui — mais **un export texte scinderait la
   *  ligne**, et un extrait de journal dont une entrée est coupée en deux n'est
   *  plus une preuve, c'est un document qu'on peut contester.
   *
   *  Le format retenu est donc RFC 4180, et il est cité intégralement plutôt
   *  qu'assaini : `\r\n`, `"` et `;` sont des caractères de TEXTE, et les
   *  mutiler à l'export ferait mentir l'extrait sur ce que la base contient.
   *  Une valeur citée peut contenir un saut de ligne : elle occupe alors
   *  plusieurs lignes physiques et **une seule ligne logique**, ce que tout
   *  analyseur conforme retrouve. C'est cette propriété que
   *  `test/journal-lecture/export.test.mjs` mesure en ré-analysant la sortie.
   *
   *  Séparateur `;` et non `,` : c'est le séparateur de liste des Excel
   *  francophones, et l'extrait est destiné à un auditeur, pas à un programme.
   *  BOM UTF-8 en tête, pour la même raison — sans lui, Excel lit « Ã© ».
   *
   *  ⚠️ **L'extrait est PLAFONNÉ à 50 000 entrées, et il est construit en
   *  mémoire.** Ce n'est pas un flux : sur trois ans de journal, un extrait sans
   *  bornes de date atteindrait la mémoire du service avant d'atteindre le
   *  disque de l'auditeur. Le plafond est un refus explicite — dépasser rend
   *  400 — plutôt qu'une troncature muette, qui donnerait à l'auditeur un
   *  extrait incomplet qu'il croirait entier. Un export en flux, et l'extrait
   *  par année qu'appelle la rétention à trois ans (`CONVENTIONS.md` §12), sont
   *  à traiter le jour où le volume le justifie ; il est de 161 entrées.
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/journal/export',
    {
      schema: { querystring: SCHEMA_EXPORT },
      config: { acces: { action: 'exporter', domaine: 'journal' } },
    },
    async (requete: FastifyRequest<{ Querystring: QuerystringJournal }>, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      // ⚠️ **UN DE PLUS QUE LE PLAFOND — constat Q-120, porte S4.**
      //
      // Le commentaire au-dessus de cette route promettait : *« le plafond est
      // un refus explicite — dépasser rend 400 — plutôt qu'une troncature
      // muette, qui donnerait à l'auditeur un extrait incomplet qu'il croirait
      // entier. »* Le 400 ne portait que sur le **paramètre** `limite` ; le
      // nombre de lignes n'était jamais compté. Au-delà de 50 000 entrées
      // lisibles, tout export rendait les 50 000 plus récentes **en se
      // présentant comme l'extrait demandé** — exactement ce que la phrase
      // disait vouloir éviter.
      //
      // On demande donc **un enregistrement de plus que le plafond**. S'il
      // arrive, c'est qu'il y avait de quoi tronquer : on refuse, en disant
      // comment obtenir la suite. Compter d'abord par un `count(*)` coûterait un
      // second parcours (~400 ms mesurés sur 20 000 entrées) pour la même
      // information.
      //
      // ⚠️ **Le refus ne vise que le plafond IMPLICITE**, et la nuance a été
      // trouvée par le banc : la première rédaction refusait aussi un `limite`
      // explicitement demandé, ce qui rendait le paramètre inutilisable — un
      // appelant qui demande deux lignes et reçoit 400 n'a pas été protégé, il a
      // été empêché.
      //
      // Le discriminant est **qui a posé la borne** : le plafond du serveur,
      // que l'appelant ne voit pas et croit donc ne pas atteindre ; ou son
      // propre paramètre, qu'il a écrit et dont il attend précisément l'effet.
      // Seul le premier ment.
      const filtres = filtresDe(requete.query, LIMITE_EXPORT, LIMITE_EXPORT);
      const borneDemandee = requete.query.limite !== undefined;
      const sonde = { ...filtres, limite: filtres.limite + 1 };

      const lignes = await avecTransaction(pool, perimetre, async (client) => {
        const entrees = await lirePage(client, sonde);
        if (!borneDemandee && entrees.length > filtres.limite) {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 400,
            message:
              `L'extrait dépasse ${String(filtres.limite)} entrées. Restreignez-le par une ` +
              'date, une action ou un utilisateur, ou reprenez-le par tranches avec le ' +
              'paramètre « avant ». Un extrait tronqué serait pris pour un extrait complet.',
            detailJournal:
              `Q-120 : export refusé, plus de ${String(filtres.limite)} entrées lisibles ` +
              'dans le périmètre pour ces filtres',
          });
        }
        await tracer(
          client,
          perimetre,
          requete,
          'export',
          'Export du journal d’audit',
          { ...filtresTraces(filtres), lignes: entrees.length, format: 'csv' },
        );
        // La sonde a demandé un enregistrement de plus : il ne part pas dans le
        // fichier. Sans cette coupe, un `limite` explicite rendrait n+1 lignes.
        return entrees.slice(0, filtres.limite);
      });

      const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      return reponse
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="journal-audit-${horodatage}.csv"`)
        .send(construireCsv(lignes));
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/journal/verification — la chaîne est-elle intacte ?
   * -------------------------------------------------------------------
   *  **Aucune ligne = journal sain** (`CONVENTIONS.md` §12). La réponse porte
   *  donc `sain: true` et un tableau vide : dire « sain » explicitement évite
   *  qu'un écran interprète un tableau vide comme « pas encore vérifié ».
   *
   *  `f_journal_audit_verifier()` est « security definer » depuis la migration
   *  008 — elle doit parcourir la chaîne ENTIÈRE, sans quoi elle signalerait un
   *  trou de numérotation à chaque frontière de périmètre. Ce qu'elle rend n'est
   *  jamais du contenu : un numéro, un identifiant, un horodatage, un nom
   *  d'anomalie et deux empreintes.
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/journal/verification',
    {
      schema: { querystring: SCHEMA_VERIFICATION },
      // ⚠️ `perimetre: 'groupe'` — constat **Q-118**, porte S4. La chaîne est une
      // propriété du GROUPE : elle enjambe les périmètres par construction, et
      // c'est la raison d'être du `security definer`. Exposée à une filiale, la
      // fonction devenait un **oracle exact** — pour tout `N`, le numéro, l'`id`
      // et l'horodatage à la microseconde de l'entrée n° N, et au-delà du dernier
      // maillon le volume total du journal du groupe. Mesuré : 11 maillons hors
      // périmètre reconstruits sur 14.
      //
      // Le refus se prononce dans `onRequest`, pas ici : `routes.test.mjs`
      // interdit toute garde `403` écrite dans ce fichier, et il a raison — un
      // refus déclaré se compte et se lit, un refus codé s'oublie.
      //
      // ⚠️ Cela ne ferme PAS le canal SQL : `grc_app` conserve `execute` sur la
      // fonction, nécessaire à cette route. C'est le risque assumé du §17.4.
      config: { acces: { action: 'lire', domaine: 'journal', perimetre: 'groupe' } },
    },
    async (
      requete: FastifyRequest<{ Querystring: { depuis?: number } }>,
      reponse: FastifyReply,
    ) => {
      const { perimetre } = sessionDe(requete);

      const depuis = requete.query.depuis ?? null;

      const anomalies = await avecTransaction(pool, perimetre, async (client) => {
        const resultat = await client.query(
          `select "numero_entree", "id_entree", "horodatage_entree", "anomalie", "detail"
             from f_journal_audit_verifier($1::bigint)`,
          [depuis],
        );
        await tracer(
          client,
          perimetre,
          requete,
          'verification_journal',
          'Vérification du chaînage du journal d’audit',
          { depuis, anomalies: resultat.rowCount ?? 0 },
        );
        return resultat.rows as Record<string, unknown>[];
      });

      // ══ `sain` ignore les anomalies INFORMATIVES — constat Q-123 ═══════
      //
      // `chaine_tronquee` n'est pas une falsification : le `CONVENTIONS.md` §12
      // la range explicitement en *informatif*. Elle dit « la vérification
      // démarre après le premier maillon », ce qui est exactement ce qu'on a
      // demandé en passant `depuis`.
      //
      // La route la comptait pourtant comme une anomalie, si bien que **la
      // vérification partielle que le §12 PRESCRIT** — « contrôle rapide sur les
      // entrées récentes » — rendait `sain: false` sur une chaîne parfaitement
      // intacte. Un exploitant qui suit la prescription lisait une alerte de
      // falsification, et la seule façon d'obtenir `sain: true` était de
      // renoncer à `depuis`, c'est-à-dire de parcourir trois ans à chaque
      // contrôle.
      //
      // ⚠️ Un garde-fou qui crie sur le cas nominal est un garde-fou qu'on
      // apprend à ignorer — et c'est **pire** que pas de garde-fou : le jour où
      // il crie pour de vrai, personne ne l'écoute. Le §17.5 vaut dans les deux
      // sens : on ne prête pas à un contrôle plus de portée qu'il n'en a, et on
      // ne lui fait pas dire plus d'alarme qu'il n'en constate.
      //
      // Les anomalies restent TOUTES rendues — on n'en cache aucune. Seul le
      // verdict distingue ce qui accuse de ce qui renseigne.
      const accusatrices = anomalies.filter((a) => a['anomalie'] !== 'chaine_tronquee');

      return reponse.send({
        sain: accusatrices.length === 0,
        depuis,
        anomalies,
      });
    },
  );
}

/* =====================================================================
 *  CSV — RFC 4180, séparateur « ; »
 * ===================================================================== */

/** Fin de ligne du RFC : CRLF, et non le `\n` d'Unix. */
const FIN_LIGNE = '\r\n';

/**
 * Cite un champ selon le RFC 4180.
 *
 * ⚠️ **Elle cite toujours**, sans se demander si c'est nécessaire. Une citation
 * conditionnelle demanderait de reconnaître « les cas dangereux », c'est-à-dire
 * de tenir une liste de caractères — et une liste écrite à la main est une
 * omission qui attend. Citer tout coûte deux octets par champ et ne peut pas se
 * tromper. Le seul échappement du format est le guillemet doublé.
 */
function citer(valeur: unknown): string {
  // `instanceof Date` AVANT `typeof === 'object'` : le pilote `pg` rend un
  // `timestamptz` en objet `Date`, qu'un `JSON.stringify` citerait une seconde
  // fois — l'horodatage serait alors entouré de guillemets À L'INTÉRIEUR du
  // champ, et l'extrait deviendrait faux sans que rien ne le dise.
  const texte =
    valeur === null || valeur === undefined
      ? ''
      : valeur instanceof Date
        ? valeur.toISOString()
        : typeof valeur === 'object'
          ? JSON.stringify(valeur)
          : String(valeur);
  return `"${desamorcer(texte).replace(/"/gu, '""')}"`;
}

/**
 * Désamorce une valeur que le tableur destinataire évaluerait — constat **Q-121**.
 *
 * ── Ce que `citer()` protège, et ce qu'elle ne protège pas ───────────────
 *
 * La citation RFC 4180 protège la **structure** de la ligne : elle garantit
 * qu'un `;` ou un saut de ligne dans une valeur ne scinde pas l'enregistrement.
 * Elle ne protège rien contre l'**interprétation** — un tableur retire les
 * guillemets, *puis* évalue toute cellule commençant par `=`, `+`, `-` ou `@`.
 *
 * Et ce format est explicitement destiné à un tableur : BOM UTF-8 « pour
 * Excel », séparateur `;` des Excel francophones. La cible d'une charge n'est
 * donc pas le serveur — c'est **le poste du RSSI ou de l'auditeur externe qui
 * ouvre l'extrait**. `=WEBSERVICE(…)` exfiltre, `=HYPERLINK(…)` invite au clic.
 *
 * ⚠️ **Et la valeur vient d'un attaquant NON AUTHENTIFIÉ** : `utilisateur_libelle`
 * porte, pour une connexion refusée, le login présenté. Mesuré à la porte S4 :
 * cinq charges sur cinq ressortaient intactes.
 *
 * ── Pourquoi une apostrophe, et pourquoi la base n'est pas touchée ───────
 *
 * L'apostrophe en tête est la convention que les tableurs lisent comme « ceci
 * est du texte » ; elle n'est pas affichée. Elle est posée **à l'export
 * seulement** : le journal est en ajout seul et fait preuve — on ne réécrit pas
 * ce qu'il contient, on rend inoffensive la copie qu'on transmet.
 *
 * ⚠️ **Le contrat §29.8 n'exigeait que `\r\n`, `"` et `;`.** Le lot a livré
 * exactement cela : l'omission est celle du contrat, pas celle de qui l'a
 * appliqué. Le §29.8 est corrigé en même temps que cette fonction.
 */
function desamorcer(texte: string): string {
  // La liste est écrite à la main **à dessein**, et c'est le bon outil ici
  // (`CLAUDE.md` §3) : son incomplétude ne fait rien réussir en silence — elle
  // laisse passer une charge que la mesure de la porte reverra. Ce sont les
  // quatre amorces de formule des tableurs, plus les deux caractères qu'ils
  // ignorent avant de les lire.
  return /^[=+\-@\t\r]/u.test(texte) ? `'${texte}` : texte;
}

/**
 * Construit l'extrait CSV.
 *
 * Le BOM est en tête pour Excel ; il ne fait pas partie du format et tout
 * analyseur conforme l'ignore ou le rend comme premier caractère du premier
 * en-tête — c'est pourquoi l'essai le retire avant de ré-analyser.
 */
export function construireCsv(lignes: readonly Record<string, unknown>[]): string {
  const entete = COLONNES.map((c) => citer(c)).join(';');
  const corps = lignes.map((ligne) => COLONNES.map((c) => citer(ligne[c])).join(';'));
  return `﻿${[entete, ...corps].join(FIN_LIGNE)}${FIN_LIGNE}`;
}
