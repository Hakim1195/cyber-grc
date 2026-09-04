/**
 * Le circuit d'approbation — **lot L8**, `PLAN_SERVEUR` §3.5,
 * `CONVENTIONS.md` §33.3.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce lot n'a PAS de migration, et c'est sa première propriété
 * ════════════════════════════════════════════════════════════════════════
 *
 * `approbations` existe depuis `001_socle.sql`, et le §33.3 le dit en une
 * phrase : *« il n'y a donc rien à migrer. Le lot L8 est une API et un écran, et
 * son premier devoir est de constater ce que la base tient déjà. »* Ce que la
 * base tient, et que **rien ici ne réécrit** :
 *
 * | Garantie | Où elle vit |
 * |---|---|
 * | une décision (`approuve`, `refuse`) est **irréversible** | `f_approbations_verrou_decision()` + `trg_approbations_verrou`, armé en `always` — refuse `update` **et** `delete`, propriétaire compris, en `GRC02` |
 * | une décision est **datée** | `ck_approbations_decision` : `statut ∈ {approuve, refuse}` ⟺ `date_decision is not null` |
 * | une décision est **attribuée** | `ck_approbations_acteur` : `acteur_libelle` obligatoire dès qu'elle est tranchée |
 * | une étape n'existe **qu'une fois par tour** | `uq_approbations_etape (filiale_id, objet_type, objet_id, etape, ordre)` |
 * | une filiale ne peut pas bloquer sa voisine | la même unicité, **`filiale_id` en tête** — constat Q-2, quatrième passage de S1 |
 * | le cloisonnement | famille 1 de `004_rls.sql` : lecture sur le périmètre, écriture dans la seule filiale active |
 *
 * ⚠️ **Aucune de ces règles n'est retestée en TypeScript avant l'écriture.** La
 * route tente, la base refuse, et `traduireErreurPostgres()` rend déjà `GRC02`
 * en 409 avec un message écrit pour l'utilisateur. Un pré-contrôle « poli »
 * aurait été un doublon de la garantie, et *« le jour où les deux
 * divergeraient, c'est la version faible qui l'emporterait »* (§33.3).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce lot ajoute, et que la base ne peut pas tenir
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **L'ordre des étapes** de chacun des trois circuits (`circuit.ts`). Le
 *     `check` admet les sept étapes pour les trois objets : une contrainte de
 *     table ne sait pas exprimer une séquence.
 *  2. **L'empreinte du contenu approuvé**, calculée et comparée — c'est le point
 *     que le §33.3 signale comme « à ne pas manquer ».
 *  3. **Le rattachement de l'objet à la filiale.** `approbations.objet_id` est un
 *     rattachement **polymorphe, sans clé étrangère** : la base ne peut pas
 *     vérifier que l'objet visé appartient à la filiale qui écrit. C'est la
 *     moitié applicative du constat **Q-2** — la moitié structurelle (l'unicité
 *     `filiale_id` en tête) empêche le déni de service, celle-ci empêche
 *     d'écrire une décision qui désignerait le risque d'une autre filiale.
 *  4. **Le niveau `validation`** (`niveau.ts`), premier usage du troisième axe.
 *  5. **La trace au journal** : `approbation` était au vocabulaire de
 *     `ck_journal_audit_action` et n'était émise par personne.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  L'empreinte — pourquoi elle est calculée par PostgreSQL, et pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * Elle est `sha256(to_jsonb(ligne) − colonnes techniques)`. Trois raisons, et la
 * première est une règle du dépôt :
 *
 *  · **La liste des colonnes n'est pas écrite.** `to_jsonb(t.*)` la découvre
 *    dans le catalogue. Une colonne métier ajoutée demain entre dans l'empreinte
 *    sans que personne y pense — alors qu'une liste écrite à la main l'aurait
 *    ignorée **en silence**, et le circuit aurait certifié un contenu qui a
 *    changé : le premier cas du tableau du `CLAUDE.md` §3, celui où la liste est
 *    le mauvais outil.
 *  · Les **exclusions**, elles, sont écrites — et c'est le bon outil pour
 *    elles : en oublier une rend l'empreinte trop sensible (un simple
 *    enregistrement sans modification périmerait le circuit), ce qui est
 *    **bruyant** et se voit au premier essai. Jamais silencieux.
 *  · `version` en fait partie **parce qu'elle est déjà stockée à côté**
 *    (`version_objet`). L'inclure ferait de l'empreinte une redite du compteur ;
 *    l'exclure lui laisse dire ce qu'elle seule dit : *le contenu a changé*.
 *
 * ⚠️ **`set local timezone to 'UTC'`**, et ce n'est pas une précaution de style.
 * `to_jsonb` rend un `timestamptz` dans le fuseau **de la session** :
 * `"2026-01-02T03:04:05+00:00"` ici, `"2026-01-02T12:04:05+09:00"` ailleurs.
 * Mesuré. Aucune des trois tables n'expose aujourd'hui de `timestamptz` hors des
 * colonnes exclues — mais l'empreinte doit rester comparable **dans trois ans**,
 * y compris après l'ajout d'une colonne d'horodatage métier, et y compris depuis
 * une connexion dont le fuseau aurait été changé par ailleurs.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Enregistrement — la couture est à l'orchestrateur
 * ════════════════════════════════════════════════════════════════════════
 *
 * Ce greffon n'est pas encore monté : `src/api/index.ts` appartient à
 * l'orchestrateur. La ligne à écrire, à côté de celle du journal :
 *
 *     await instance.register(greffonApprobations, { pool });
 *
 * `pool` est **obligatoire dans le type**, exprès : c'est le compilateur qui
 * garantit alors l'existence des routes, et non la discipline de quelqu'un. Le
 * greffon du journal a payé l'autre choix — *« la consultation du journal
 * disparaissait en silence, et l'écran recevait un 404 qu'il ne pouvait pas
 * distinguer d'une absence de droits »*.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { DOMAINE_PAR_ENTITE } from '../api/droits.js';
import type { DomaineFonctionnel } from '../api/droits.js';
import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import { engendrerIdentifiant } from '../entites/index.js';
import type { NomEntite } from '../entites/types.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import {
  decrireCircuit,
  ENTITES_APPROUVABLES,
  motifDeRefus,
  OBJET_PAR_ENTITE,
} from './circuit.js';
import type {
  Decision,
  EtapeApprobation,
  LigneApprobation,
  ObjetApprouvable,
  StatutApprobation,
} from './circuit.js';
import { exigerNiveau } from './niveau.js';

export interface OptionsApprobations {
  /** Pool de connexions du serveur. Obligatoire : voir l'entête. */
  readonly pool: Pool;
}

/* =====================================================================
 *  Ce qui n'entre pas dans l'empreinte
 * ===================================================================== */

/**
 * Colonnes de **traçabilité technique**, retirées avant le calcul.
 *
 * Elles bougent à chaque écriture sans que le contenu change : les garder
 * ferait périmer un circuit au premier enregistrement sans modification, et
 * l'utilisateur devrait tout recommencer sans comprendre pourquoi.
 *
 * ⚠️ Liste écrite à la main **et c'est le bon outil** : une omission ici est
 * bruyante (un circuit qui périme trop vite se voit au premier essai), jamais
 * silencieuse. Le banc la fige en approuvant, en réenregistrant l'objet **sans
 * le modifier**, et en vérifiant que le circuit tient toujours.
 */
const COLONNES_HORS_EMPREINTE: readonly string[] = Object.freeze([
  'version',
  'cree_le',
  'cree_par',
  'modifie_le',
  'modifie_par',
]);

/* =====================================================================
 *  Schémas de validation au bord
 * ---------------------------------------------------------------------
 *  Ils bornent la FORME. Aucune valeur reçue n'atteint du SQL : le nom de
 *  l'entité choisit une requête **littérale** parmi trois (voir `lireObjet`),
 *  et tout le reste part en paramètre (§17.4, contrôle S5).
 * ===================================================================== */

const SCHEMA_PARAMS = {
  type: 'object',
  required: ['entite', 'entiteId'],
  additionalProperties: false,
  properties: {
    entite: { type: 'string', enum: ENTITES_APPROUVABLES },
    entiteId: { type: 'string', minLength: 1, maxLength: 64 },
  },
} as const;

const SCHEMA_DECISION = {
  type: 'object',
  required: ['etape', 'decision'],
  additionalProperties: false,
  properties: {
    etape: { type: 'string', minLength: 1, maxLength: 32 },
    decision: { type: 'string', enum: ['approuve', 'refuse'] },
    // Un commentaire est une valeur d'utilisateur : il est stocké, rendu, et
    // porté au journal en `jsonb` — jamais concaténé dans une phrase (§29.5).
    commentaire: { type: 'string', maxLength: 4000 },
  },
} as const;

interface ParamsApprobation {
  readonly entite?: string;
  readonly entiteId?: string;
}

interface CorpsDecision {
  readonly etape: string;
  readonly decision: Decision;
  readonly commentaire?: string;
}

/** L'objet visé, tel que la base le rend. */
interface ObjetVise {
  /** `null` = portée Groupe (seuls les documents en ont). */
  readonly filialeId: string | null;
  readonly version: number;
  readonly empreinte: string;
}

/* =====================================================================
 *  Le greffon
 * ===================================================================== */

// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonApprobations(
  instance: FastifyInstance,
  options: OptionsApprobations,
): Promise<void> {
  const { pool } = options;

  /** Session appliquée — **fail-closed**, comme partout ailleurs. */
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
   * Domaine mis en jeu, lu **comme le crochet parent le lit** : dans le
   * paramètre `entite`, à travers `DOMAINE_PAR_ENTITE`. La table de domaines
   * n'est pas recopiée — c'est elle que le compilateur garde exhaustive.
   */
  const domaineDe = (requete: FastifyRequest): DomaineFonctionnel | null => {
    const params = requete.params as ParamsApprobation | undefined;
    const nom = params?.entite;
    if (nom === undefined || !Object.prototype.hasOwnProperty.call(OBJET_PAR_ENTITE, nom)) {
      return null;
    }
    return DOMAINE_PAR_ENTITE[nom as NomEntite] ?? null;
  };

  /**
   * Écrit l'entrée `refus_autorisation` d'un refus de niveau (§29.2).
   *
   * Elle ouvre **sa propre transaction** : le refus se prononce dans
   * `onRequest`, avant toute transaction métier (§29.3, règle 3). Et son échec
   * n'annule pas le refus — c'est l'exception que le §29.3 accorde nommément
   * aux événements qui n'ont aucune écriture à emporter. La refuser ici
   * transformerait une panne du journal en autorisation.
   */
  const tracerRefus = async (requete: FastifyRequest, detail: string): Promise<void> => {
    const session = requete.sessionGrc;
    if (session === undefined) return;
    try {
      await avecTransaction(pool, session.perimetre, async (client) => {
        await journaliser(client, {
          action: 'refus_autorisation',
          // Phrase FIXE (§29.5) : rien de ce qui varie n'y entre.
          resume: 'Décision d’approbation refusée : niveau de validation absent du profil.',
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          adresseIp: requete.ip,
          entiteType: 'approbations',
          valeursApres: {
            methode: requete.method,
            route: requete.routeOptions.url ?? null,
            motif: 'niveau_validation_absent',
            detail,
          },
        });
      });
    } catch (erreur) {
      requete.log.warn(
        { detail: erreur instanceof Error ? erreur.message : String(erreur) },
        'Le refus d’approbation n’a pas pu être journalisé ; il reste prononcé',
      );
    }
  };

  exigerNiveau(instance, domaineDe, tracerRefus);

  /* -------------------------------------------------------------------
   *  Lecture de l'objet visé — trois requêtes LITTÉRALES
   * -------------------------------------------------------------------
   *  Le nom de la table ne peut pas être un paramètre lié. Plutôt que de
   *  l'interpoler — même « validé », même issu d'une table close —, on choisit
   *  entre trois requêtes écrites en toutes lettres : **aucune chaîne venue de
   *  la requête n'entre jamais dans du SQL** (§17.4, condition E1).
   *
   *  ⚠️ Ce n'est PAS le compilateur qui borne le `switch` : `entite` est un
   *  `string`, et un `switch` exhaustif sur les trois entités demanderait un
   *  type littéral que le paramètre d'URL n'a pas. Ce qui borne, c'est le schéma
   *  de la route (`enum: ENTITES_APPROUVABLES`, dérivé de `OBJET_PAR_ENTITE`) —
   *  et le `default` refuse au lieu de servir, de sorte qu'un désaccord entre le
   *  schéma et ce `switch` rend 400, jamais une requête improvisée.
   *
   *  Le cloisonnement n'est PAS dans ces requêtes : il est dans la politique de
   *  lecture (`004_rls.sql`, famille 1 et 2), sous le code. Une clause écrite
   *  ici donnerait à croire que le filtrage dépend d'elle.
   * ------------------------------------------------------------------- */
  const lireObjet = async (
    client: PoolClient,
    entite: string,
    id: string,
  ): Promise<ObjetVise | null> => {
    const empreinte = `encode(sha256(convert_to(
        (to_jsonb(t.*) - $2::text[])::text, 'UTF8')), 'hex') as empreinte`;

    // `set local` : le réglage meurt avec la transaction. Voir l'entête —
    // `to_jsonb` rend un timestamptz dans le fuseau de la session.
    await client.query("set local timezone to 'UTC'");

    let texte: string;
    switch (entite) {
      case 'documents':
        texte = `select t.filiale_id, t.version, ${empreinte} from documents t where t.id = $1`;
        break;
      case 'risques':
        texte = `select t.filiale_id, t.version, ${empreinte} from risques t where t.id = $1`;
        break;
      case 'audits':
        texte = `select t.filiale_id, t.version, ${empreinte} from audits t where t.id = $1`;
        break;
      default:
        // Inatteignable : le schéma de la route borne `entite` à ces trois
        // valeurs. Refusé plutôt que servi — un `default` permissif serait la
        // porte dérobée que le schéma prétend fermer.
        throw entreeInvalide(
          'Cette entité ne relève pas du circuit d’approbation. Le circuit couvre les ' +
            'politiques, les risques et les rapports d’audit.',
        );
    }

    const resultat = await client.query(texte, [id, [...COLONNES_HORS_EMPREINTE]]);
    const ligne = resultat.rows[0] as
      | { filiale_id: string | null; version: number; empreinte: string }
      | undefined;
    if (ligne === undefined) return null;
    return { filialeId: ligne.filiale_id, version: ligne.version, empreinte: ligne.empreinte };
  };

  /**
   * Les étapes écrites pour cet objet, **dans la filiale à qui le circuit
   * appartient**.
   *
   * ── Pourquoi une clause de filiale ICI, alors que la RLS cloisonne déjà ──
   *
   * Elle ne remplace pas la RLS : elle **désambiguïse**. `objet_id` est un
   * rattachement polymorphe, et l'unicité de la table commence par `filiale_id`
   * (constat Q-2) — deux filiales peuvent donc parfaitement porter chacune une
   * étape désignant le MÊME `objet_id`. C'est voulu : c'est ce qui empêche l'une
   * de bloquer l'autre.
   *
   * Sans cette clause, une session au périmètre **Groupe** — qui lit légitimement
   * les deux filiales — verrait les deux jeux d'étapes **fondus en un seul
   * circuit**, et le déciderait complet, périmé ou refusé au vu de décisions
   * prises ailleurs. Le cloisonnement n'aurait pas fui ; la lecture, elle, aurait
   * menti. Mesuré par `test/approbations/cloisonnement.test.mjs`.
   *
   * La filiale retenue est celle de l'objet ; pour un document de **portée
   * Groupe** (`filiale_id` nul), c'est la filiale **active**, puisque
   * `approbations.filiale_id` est « not null » et que l'étape a donc été écrite
   * là. `null` — un lecteur Groupe sans filiale active — rend tout ce qui est
   * lisible : c'est la seule réponse honnête, et elle reste cloisonnée par la RLS.
   */
  const lireEtapes = async (
    client: PoolClient,
    objet: ObjetApprouvable,
    objetId: string,
    filialeCircuit: string | null,
  ): Promise<LigneApprobation[]> => {
    const resultat = await client.query(
      `select "id", "etape", "ordre", "statut", "acteur_id", "acteur_libelle",
              "date_decision", "commentaire", "version_objet", "empreinte_objet"
         from "approbations"
        where "objet_type" = $1 and "objet_id" = $2
          and ($3::text is null or "filiale_id" = $3::text)
        order by "ordre", "cree_le"`,
      [objet, objetId, filialeCircuit],
    );
    return (
      resultat.rows as {
        id: string;
        etape: EtapeApprobation;
        ordre: number;
        statut: StatutApprobation;
        acteur_id: string | null;
        acteur_libelle: string | null;
        date_decision: Date | null;
        commentaire: string | null;
        version_objet: string | null;
        empreinte_objet: string | null;
      }[]
    ).map((l) => ({
      id: l.id,
      etape: l.etape,
      ordre: l.ordre,
      statut: l.statut,
      acteurId: l.acteur_id,
      acteurLibelle: l.acteur_libelle,
      dateDecision: l.date_decision === null ? null : l.date_decision.toISOString(),
      commentaire: l.commentaire,
      versionObjet: l.version_objet,
      empreinteObjet: l.empreinte_objet,
    }));
  };

  /**
   * Identifiant d'annuaire de l'acteur, quand il en a un.
   *
   * `fk_approbations_acteur` référence `utilisateurs(id)`, tandis que le
   * périmètre de session porte le **login** (`utilisateurs.identifiant`) — la
   * distinction du §18.3, et elle est réelle : les deux diffèrent en base.
   *
   * ⚠️ **`acteur_libelle` est renseigné dans tous les cas**, et c'est lui qui
   * répond à « qui a validé cette politique ? » : le commentaire de colonne
   * l'écrit — *« conservée en clair (…) doit rester répondable même après le
   * départ de l'intéressé »*. Un compte supprimé rendrait `acteur_id` inutile ;
   * il ne rend pas la question sans réponse.
   */
  const resoudreActeur = async (client: PoolClient, login: string): Promise<string | null> => {
    const resultat = await client.query(
      'select "id" from "utilisateurs" where "identifiant" = $1',
      [login],
    );
    const ligne = resultat.rows[0] as { id: string } | undefined;
    return ligne?.id ?? null;
  };

  /**
   * Refuse proprement une décision demandée **sans filiale active**.
   *
   * ⚠️ **Elle est appelée AVANT `avecTransaction`, et l'ordre est le fond du
   * sujet.** Elle vivait d'abord dans `verifierRattachement`, donc *dans* la
   * transaction — et elle n'y servait à rien : `avecTransaction` appelle
   * `validerPerimetre()` en tout premier, qui refuse un périmètre sans filiale
   * active par une `ErreurPerimetre`, c'est-à-dire par un **500**. Mesuré :
   * `500 !== 403`. Le garde-fou était écrit, placé après la barrière qu'il
   * devait devancer, et n'a jamais été atteint.
   *
   * Le sélecteur de filiale du lot L4 admet une session dont la filiale
   * d'écriture reste à choisir (`CONVENTIONS.md` §30.2 : pas de repli, pas de
   * valeur par défaut). Ce n'est pas un défaut de programmation, c'est un choix
   * que l'utilisateur n'a pas encore fait — et cela se lui dit. Même arbitrage
   * que `filialeDEcriture()` dans `src/pieces/index.ts`.
   */
  const exigerFilialeActive = (perimetre: PerimetreSession): void => {
    if (perimetre.filialeId !== null) return;
    throw new ErreurApplicative({
      code: 'hors_perimetre',
      statut: 403,
      message:
        'Aucune filiale active : sélectionnez la filiale dans laquelle vous prenez cette ' +
        'décision. Une approbation appartient à une filiale, jamais au groupe entier.',
      detailJournal:
        `décision d’approbation demandée sans filiale active par ${perimetre.utilisateurId}`,
    });
  };

  /** L'objet est-il écrivable depuis la filiale active ? */
  const verifierRattachement = (objet: ObjetVise, perimetre: PerimetreSession): void => {
    // Portée Groupe (document du socle) : l'étape est écrite dans la filiale
    // active. Voir la note « portee » de la réponse — c'est une adoption
    // LOCALE, pas une approbation de niveau Groupe, et l'écran doit le dire.
    if (objet.filialeId === null) return;
    if (objet.filialeId === perimetre.filialeId) return;
    throw new ErreurApplicative({
      code: 'hors_perimetre',
      statut: 403,
      message:
        'Cet enregistrement appartient à une autre filiale : son circuit d’approbation se ' +
        'déroule chez elle. Basculez votre filiale active pour y participer.',
      detailJournal:
        'Q-2 (porte S1) : tentative d’écrire une étape d’approbation rattachée à la filiale ' +
        `active alors que l’objet appartient à une autre. approbations.objet_id est polymorphe ` +
        'et sans clé étrangère : la base ne peut pas le refuser.',
    });
  };

  /* -------------------------------------------------------------------
   *  GET /api/approbations/:entite/:entiteId — l'état du circuit
   * -------------------------------------------------------------------
   *  Lecture seule, et **non journalisée**. Ce n'est pas un oubli : lire
   *  « qui a validé cette politique » est le geste ordinaire d'un auditeur,
   *  et le tracer écrirait une entrée par affichage de fiche. Le journal
   *  d'audit trace les DÉCISIONS (`approbation`) et les refus
   *  (`refus_autorisation`) ; la consultation sensible est réservée au journal
   *  lui-même (§29.8).
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/approbations/:entite/:entiteId',
    {
      schema: { params: SCHEMA_PARAMS },
      config: { acces: { action: 'lire', domaine: 'selon-entite' } },
    },
    async (
      requete: FastifyRequest<{ Params: { entite: string; entiteId: string } }>,
      reponse: FastifyReply,
    ) => {
      const { perimetre } = sessionDe(requete);
      const { entite, entiteId } = requete.params;
      const objetType = OBJET_PAR_ENTITE[entite];
      if (objetType === undefined) throw inconnue(entite, entiteId);

      const vue = await avecTransaction(
        pool,
        perimetre,
        async (client) => {
          const objet = await lireObjet(client, entite, entiteId);
          if (objet === null) return null;
          const lignes = await lireEtapes(
            client,
            objetType,
            entiteId,
            objet.filialeId ?? perimetre.filialeId,
          );
          return { objet, lignes };
        },
        { lectureSeule: true },
      );

      // 404 et non « 200 avec un circuit vide » : le §20.1 ferme les oracles.
      // Un circuit vide rendu pour une ligne d'une autre filiale dirait que
      // l'identifiant existe ; il dirait aussi, à tort, qu'aucune approbation
      // n'a eu lieu. Les deux sont faux, et le second est le pire.
      if (vue === null) throw inconnue(entite, entiteId);

      const circuit = decrireCircuit(objetType, vue.lignes, vue.objet.empreinte);
      return reponse.send({
        objet: {
          entite,
          id: entiteId,
          version: vue.objet.version,
          empreinte: vue.objet.empreinte,
          // « groupe » : le document appartient au socle commun. Son circuit
          // est alors tenu PAR FILIALE — approbations.filiale_id est « not
          // null ». Voir le rapport du lot : c'est un constat, pas un choix.
          portee: vue.objet.filialeId === null ? 'groupe' : 'filiale',
        },
        circuit: {
          objet: circuit.objet,
          cycle: circuit.cycle,
          etat: circuit.etat,
          etapeAttendue: circuit.etapeAttendue,
          cycleAttendu: circuit.cycleAttendu,
          etapes: circuit.etapes,
          historique: circuit.historique,
          // Jamais vide en principe ; jamais tue non plus. Une étape écrite
          // hors du circuit de son objet (reprise d'un export ancien) doit
          // apparaître, pas disparaître de l'écran.
          horsCircuit: circuit.horsCircuit,
        },
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/approbations/:entite/:entiteId — franchir une étape
   * -------------------------------------------------------------------
   *  Tout se passe dans **une seule transaction** : la lecture de l'objet, le
   *  calcul de son empreinte, la vérification de la séquence, l'écriture de
   *  l'étape et sa trace au journal. Un `rollback` emporte l'ensemble — il n'y
   *  a pas d'état où l'étape existe sans sa trace, ni l'inverse (§29.3).
   * ------------------------------------------------------------------- */
  instance.post(
    '/api/approbations/:entite/:entiteId',
    {
      schema: { params: SCHEMA_PARAMS, body: SCHEMA_DECISION },
      config: {
        acces: { action: 'ecrire', domaine: 'selon-entite' },
        // ⚠️ Le troisième axe, exigé par DÉCLARATION — voir `niveau.ts`. Le
        // refus se prononce dans un crochet `onRequest`, avant l'analyse du
        // corps, comme tous les autres refus du produit.
        niveauMinimal: 'validation',
      },
    },
    async (
      requete: FastifyRequest<{
        Params: { entite: string; entiteId: string };
        Body: CorpsDecision;
      }>,
      reponse: FastifyReply,
    ) => {
      const { perimetre } = sessionDe(requete);
      const { entite, entiteId } = requete.params;
      const { decision, commentaire } = requete.body;
      const objetType = OBJET_PAR_ENTITE[entite];
      if (objetType === undefined) throw inconnue(entite, entiteId);

      const etape = requete.body.etape as EtapeApprobation;
      // AVANT la transaction : `avecTransaction` refuserait d'abord, en 500.
      exigerFilialeActive(perimetre);

      const resultat = await avecTransaction(pool, perimetre, async (client) => {
        const objet = await lireObjet(client, entite, entiteId);
        if (objet === null) throw inconnue(entite, entiteId);
        verifierRattachement(objet, perimetre);

        // En écriture, la filiale du circuit est nécessairement la filiale
        // active : `verifierRattachement` vient de le garantir, et
        // `pol_approbations_ajout` ne laisserait pas écrire ailleurs.
        const lignes = await lireEtapes(client, objetType, entiteId, perimetre.filialeId);
        const circuit = decrireCircuit(objetType, lignes, objet.empreinte);

        const motif = motifDeRefus(circuit, etape);
        if (motif !== null) {
          throw new ErreurApplicative({
            // 409 : ce n'est pas la forme de la demande qui est fautive, c'est
            // l'état du circuit au moment où elle arrive. Le même code que le
            // refus d'irréversibilité de la base, et c'est voulu : pour l'écran,
            // les deux se traitent pareil — recharger la fiche.
            code: 'contrainte_base',
            statut: 409,
            message: motif,
            detailJournal:
              `étape « ${etape} » hors séquence : le circuit ${objetType} attend ` +
              `« ${circuit.etapeAttendue ?? 'aucune'} » au tour ${String(circuit.cycleAttendu ?? circuit.cycle)} ` +
              `(état « ${circuit.etat} »)`,
          });
        }

        const ordre = circuit.cycleAttendu ?? circuit.cycle;
        const acteurId = await resoudreActeur(client, perimetre.utilisateurId);
        const identifiant = engendrerIdentifiant('APPRO');

        // ── L'écriture, et ce qui la refuse ────────────────────────────
        //
        // `on conflict … do update` retombe sur la ligne qui existe déjà pour
        // cette étape de ce tour — celle qu'une reprise a pu déposer en
        // « en_attente ». **Si elle est tranchée, le déclencheur refuse** :
        // c'est là, et là seulement, que vit l'irréversibilité.
        //
        // L'unicité visée commence par `filiale_id` (constat Q-2) : le conflit
        // ne peut donc jamais venir d'une ligne d'une autre filiale, c'est-à-dire
        // d'une ligne invisible. Aucun oracle d'existence n'est ouvert ici.
        const ecrit = await client.query(
          `insert into "approbations"
                  ("id", "filiale_id", "objet_type", "objet_id", "version_objet",
                   "empreinte_objet", "etape", "ordre", "statut", "acteur_id",
                   "acteur_libelle", "date_decision", "commentaire")
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12)
           on conflict on constraint "uq_approbations_etape" do update
              set "version_objet"   = excluded."version_objet",
                  "empreinte_objet" = excluded."empreinte_objet",
                  "statut"          = excluded."statut",
                  "acteur_id"       = excluded."acteur_id",
                  "acteur_libelle"  = excluded."acteur_libelle",
                  "date_decision"   = excluded."date_decision",
                  "commentaire"     = excluded."commentaire"
           returning "id"`,
          [
            identifiant,
            perimetre.filialeId,
            objetType,
            entiteId,
            String(objet.version),
            objet.empreinte,
            etape,
            ordre,
            decision,
            acteurId,
            perimetre.utilisateurId,
            commentaire ?? null,
          ],
        );
        const pose = (ecrit.rows[0] as { id: string } | undefined)?.id ?? identifiant;

        // ── UNE entrée au journal, ni zéro ni deux ─────────────────────
        //
        // Dans la MÊME transaction : une décision d'approbation qui réussirait
        // sans laisser de trace serait précisément ce que ce circuit existe
        // pour empêcher. `resume` est une phrase fixe ; le commentaire de
        // l'utilisateur voyage en `jsonb`, où l'encodage est le problème de
        // PostgreSQL (§29.5).
        await journaliser(client, {
          action: 'approbation',
          resume:
            decision === 'approuve'
              ? 'Étape du circuit d’approbation franchie.'
              : 'Étape du circuit d’approbation refusée.',
          filialeId: perimetre.filialeId,
          utilisateurLibelle: perimetre.utilisateurId,
          adresseIp: requete.ip,
          entiteType: 'approbations',
          entiteId: pose,
          valeursApres: {
            objet_type: objetType,
            objet_id: entiteId,
            entite,
            etape,
            ordre,
            statut: decision,
            version_objet: String(objet.version),
            empreinte_objet: objet.empreinte,
            ...(commentaire === undefined ? {} : { commentaire }),
          },
        });

        const apres = await lireEtapes(client, objetType, entiteId, perimetre.filialeId);
        return { pose, circuit: decrireCircuit(objetType, apres, objet.empreinte), objet };
      });

      return reponse.code(201).send({
        approbation: resultat.pose,
        objet: {
          entite,
          id: entiteId,
          version: resultat.objet.version,
          empreinte: resultat.objet.empreinte,
          portee: resultat.objet.filialeId === null ? 'groupe' : 'filiale',
        },
        circuit: {
          objet: resultat.circuit.objet,
          cycle: resultat.circuit.cycle,
          etat: resultat.circuit.etat,
          etapeAttendue: resultat.circuit.etapeAttendue,
          cycleAttendu: resultat.circuit.cycleAttendu,
          etapes: resultat.circuit.etapes,
          historique: resultat.circuit.historique,
          horsCircuit: resultat.circuit.horsCircuit,
        },
      });
    },
  );
}

/**
 * « Cette ligne n'existe pas *dans votre périmètre* » — et rien de plus.
 *
 * Le même refus pour une ligne absente et pour une ligne d'une autre filiale :
 * les distinguer ferait de la route un oracle d'existence inter-filiales
 * (`CONVENTIONS.md` §20.1).
 */
function inconnue(entite: string, id: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'ressource_inconnue',
    statut: 404,
    message: 'Cet enregistrement est introuvable. Il a peut-être été supprimé entre-temps.',
    detailJournal: `approbations : ${entite}/${id} hors du périmètre lisible ou inexistant`,
  });
}
