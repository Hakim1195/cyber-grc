/**
 * src/campagnes/index.ts — **LES CAMPAGNES DESCENDANTES** (lot L24, actions 24.1 et 24.2)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce greffon sert, et ce qu'il NE sert pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Deux routes, et seulement deux, parce que le reste existe déjà :
 *
 *  · `GET  /api/campagnes/etat`            — l'avancement, qui se CALCULE ;
 *  · `POST /api/campagnes/:id/convoquer`   — la convocation, qui NOMME des filiales.
 *
 * Tout le reste passe par la couche d'entités générique, et c'est délibéré : créer une
 * campagne, l'ouvrir, la clore, consigner sa prise de connaissance ou son achèvement sont
 * des écritures ordinaires sur deux entités déclarées. Leur donner des routes à elles
 * aurait dupliqué le verrouillage optimiste, le journal, le diagnostic d'écriture et les
 * bornes de corps — quatre choses éprouvées ailleurs.
 *
 * ── ⚠️ POURQUOI L'AVANCEMENT NE PEUT PAS ÊTRE UNE COLONNE ────────────────
 *
 * C'est l'arbitrage de toute la série — dérogations (19.2), horloge (20.1), AIPD (20.3),
 * demandes de droits (20.4), chaîne DORA (21.1), questionnaire (21.2) :
 *
 *   *une colonne d'avancement doit être écrite, donc remise à jour ; un traitement qui la
 *   remet peut ne pas tourner ; et le jour où il ne tourne pas, le produit affirme en
 *   silence qu'une filiale a répondu quand elle n'a rien fait.*
 *
 * L'avancement d'une filiale dans une campagne, c'est **ce qu'elle a évalué du référentiel
 * demandé** : `evaluations` le dit à l'instant où on regarde.
 *
 * ── ⚠️ ET POURQUOI IL N'Y A AUCUN POURCENTAGE ICI ────────────────────────
 *
 * Le nombre de questions d'un référentiel vit dans les catalogues du frontend
 * (`js/data/ref_*.js`). Le serveur sait compter ce qui est **répondu** ; il ne sait pas ce
 * qui **reste**. Rendre un taux obligerait à recopier ce compte côté serveur — une seconde
 * source qui se tromperait le jour où BoostAerospace révise son questionnaire. **L'écran,
 * qui a le catalogue, fait la division.** C'est mot pour mot la décision de l'action 21.2.
 *
 * ── ⚠️ L'ORACLE QUE CE GREFFON NE DOIT PAS OUVRIR ───────────────────────
 *
 * Le nombre de filiales convoquées, et leur avancement respectif, sont des informations de
 * **Groupe**. Une filiale doit voir la campagne qui la convoque et sa propre part — jamais
 * celle des autres, ni même leur nombre.
 *
 * Ce n'est **pas** tenu par un `if` de cette route : c'est tenu par la **RLS**
 * (`pol_campagne_filiales_lecture`), et la route ne fait que rendre ce que la base lui
 * laisse voir. C'est la règle de `/api/consolidation` — *aucune de ses requêtes ne nomme de
 * filiale, c'est la RLS qui borne* — et un essai de `test/campagnes/` **rougit si la clause
 * tombe**, ce qui est le critère d'acceptation de l'action 24.1.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_ETAT = '/api/campagnes/etat';
export const CHEMIN_CONVOQUER = '/api/campagnes/:id/convoquer';

/**
 * Plafond de campagnes examinées en une fois.
 *
 * ⚠️ Même motif qu'au registre DORA : sans lui, une session de portée Groupe rend
 * l'historique complet de ce que le Groupe a demandé à vingt filiales, et de ce que
 * chacune n'a pas fait. C'est une voie d'extraction autant qu'un déni de service
 * applicatif, et le plafond est **DIT** à l'appelant (`tronque`), jamais tu.
 */
const CAMPAGNES_MAX = 200;

/** Nombre maximal de filiales convoquées en un appel. */
const CONVOCATION_MAX = 100;

export interface OptionsCampagnes {
  readonly pool: Pool;
}

interface LigneEtat {
  readonly id: string;
  readonly ref_id: string;
  readonly intitule: string;
  readonly ouverte_le: string | null;
  readonly echeance: string | null;
  readonly close_le: string | null;
  readonly etat: string;
}

interface LignePart {
  readonly id: string;
  readonly campagne_id: string;
  readonly filiale_id: string;
  readonly filiale: string;
  readonly filiale_code: string;
  readonly repondant: string | null;
  readonly accuse_le: string | null;
  readonly termine_le: string | null;
  readonly etat: string;
  readonly repondues: number;
}

export async function greffonCampagnes(
  instance: FastifyInstance,
  options: OptionsCampagnes,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de campagne atteinte sans session appliquée',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/campagnes/etat
   * -------------------------------------------------------------------
   *  Où en est chaque campagne, et où en est chaque part VISIBLE.
   *
   *  ⚠️ Les deux états viennent de la BASE (`f_etat_campagne`,
   *  `f_etat_part_campagne`) : une seconde comparaison de dates en TypeScript
   *  dériverait dès que l'horloge du serveur applicatif et celle de la base
   *  diffèrent — et elles diffèrent, ne serait-ce que d'une seconde autour de
   *  minuit, c'est-à-dire précisément au moment où « en retard » bascule.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        await client.query("set local timezone to 'UTC'");

        const campagnes = await client.query<LigneEtat>(
          `select c.id, c.ref_id, c.intitule,
                  c.ouverte_le::text as ouverte_le,
                  c.echeance::text   as echeance,
                  c.close_le::text   as close_le,
                  f_etat_campagne(c.ouverte_le, c.echeance, c.close_le) as etat
             from campagnes c
            order by c.echeance nulls last, c.intitule
            limit $1`,
          [CAMPAGNES_MAX],
        );

        // AUCUNE clause de filiale ici, et c'est le point : c'est la RLS qui borne
        // (`pol_campagne_filiales_lecture`). Une filiale reçoit sa part, une session de
        // portée Groupe reçoit celles de son périmètre — la même requête pour les deux,
        // ce qui est la seule façon de ne pas se tromper sur l'une des deux.
        //
        // `repondues` compte les évaluations RENSEIGNÉES de la filiale sur le référentiel
        // demandé. La jointure porte `filiale_id` : sans elle, on compterait les réponses
        // d'une autre filiale — invisibles, donc comptées à zéro, ce qui serait FAUX
        // plutôt que vide.
        const parts = await client.query<LignePart>(
          `select p.id, p.campagne_id, p.filiale_id,
                  f.raison_sociale as filiale, f.code as filiale_code,
                  p.repondant,
                  p.accuse_le::text  as accuse_le,
                  p.termine_le::text as termine_le,
                  f_etat_part_campagne(p.termine_le, c.echeance, c.close_le) as etat,
                  (select count(*)::int
                     from evaluations e
                    where e.filiale_id = p.filiale_id
                      and e.ref_id = c.ref_id
                      and e.statut <> '') as repondues
             from campagne_filiales p
             join campagnes c on c.id = p.campagne_id
             join filiales  f on f.id = p.filiale_id
            order by f.code`,
        );

        const parId = new Map<string, LignePart[]>();
        for (const part of parts.rows) {
          const liste = parId.get(String(part.campagne_id)) ?? [];
          liste.push(part);
          parId.set(String(part.campagne_id), liste);
        }

        return {
          campagnes: campagnes.rows.map((c) => {
            const miennes = parId.get(String(c.id)) ?? [];
            return {
              id: String(c.id),
              refId: String(c.ref_id),
              intitule: String(c.intitule),
              ouverteLe: c.ouverte_le === null ? null : String(c.ouverte_le),
              echeance: c.echeance === null ? null : String(c.echeance),
              closeLe: c.close_le === null ? null : String(c.close_le),
              etat: String(c.etat),
              parts: miennes.map((p) => ({
                id: String(p.id),
                filiale: String(p.filiale),
                filialeCode: String(p.filiale_code),
                repondant: p.repondant === null ? null : String(p.repondant),
                accuseLe: p.accuse_le === null ? null : String(p.accuse_le),
                termineLe: p.termine_le === null ? null : String(p.termine_le),
                etat: String(p.etat),
                // Un COMPTE, jamais un taux : voir l'entête. L'écran divise.
                repondues: Number(p.repondues ?? 0),
              })),
              // Ce nombre n'est PAS « combien de filiales sont convoquées » : c'est
              // « combien j'en vois ». Pour une filiale, il vaut 1 — et il doit valoir 1,
              // sans quoi le produit lui apprendrait la taille du groupe convoqué.
              partsVisibles: miennes.length,
            };
          }),
          tronque: campagnes.rows.length >= CAMPAGNES_MAX,
          motif:
            campagnes.rows.length === 0
              ? 'Aucune campagne n’a été ouverte. Une campagne, c’est le Groupe qui demande ' +
                'un référentiel à plusieurs filiales, pour une date — et qui suit ensuite ' +
                'l’avancement de chacune.'
              : '',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/campagnes/:id/convoquer
   * -------------------------------------------------------------------
   *  ⚠️ **LA SEULE ROUTE DU PRODUIT QUI NOMME DES FILIALES EN ÉCRITURE**, et
   *  cela demande un mot, parce que le principe directeur du chantier dit
   *  l'inverse : *le périmètre vient du serveur, jamais d'une valeur transmise
   *  par le navigateur* — et `filiale_id` est retiré de tout ce que la couche
   *  d'entités expose, précisément pour qu'aucune charge utile n'invite un
   *  client à choisir une filiale.
   *
   *  Convoquer est l'exception, et elle est irréductible : le geste consiste
   *  littéralement à désigner d'autres filiales que la sienne. Trois barrières
   *  la tiennent, et aucune n'est facultative :
   *
   *   1. **le droit** — `administrer` sur le domaine `administration`, refusé
   *      par le crochet `onRequest` avant que cette fonction ne s'exécute ;
   *   2. **le périmètre** — chaque filiale nommée doit appartenir au périmètre
   *      de la session. Une session qui couvre deux filiales ne peut pas
   *      convoquer la troisième, et le refus ne dit pas si elle existe ;
   *   3. **la base** — la politique d'insertion de `campagne_filiales` exige le
   *      drapeau d'administration Groupe, et la clé étrangère exige une filiale
   *      réelle. Si les deux premières barrières étaient contournées, celle-ci
   *      refuserait encore.
   *
   *  ⚠️ Et le refus de la barrière 2 est **indistinguable** d'une filiale qui
   *  n'existe pas : sans cela, la route deviendrait un oracle d'existence de
   *  filiales — le même défaut que le constat B-1 a fermé côté comptes.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_CONVOQUER,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', minLength: 1, maxLength: 200 } },
        },
        body: {
          type: 'object',
          required: ['filiales'],
          additionalProperties: false,
          properties: {
            filiales: {
              type: 'array',
              minItems: 1,
              maxItems: CONVOCATION_MAX,
              items: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
        },
      },
      config: { acces: { action: 'administrer', domaine: 'administration' } },
    },
    async (
      requete: FastifyRequest<{ Params: { id: string }; Body: { filiales: string[] } }>,
      reponse: FastifyReply,
    ) => {
      const session = sessionDe(requete);
      const campagneId = requete.params.id;
      // Dédoublonnage AVANT d'écrire : convoquer deux fois la même filiale dans un seul
      // appel heurterait l'unicité (filiale, campagne) et ferait échouer tout l'appel
      // pour une maladresse de saisie.
      const demandees = [...new Set(requete.body.filiales)];

      // BARRIÈRE 2 — le périmètre de la session. Elle est appliquée AVANT toute écriture,
      // et son message ne distingue pas « hors de votre périmètre » de « n'existe pas »
      // (oracle d'existence).
      const autorisees = new Set(session.perimetre.filiales);
      const hors = demandees.filter((f) => !autorisees.has(f));
      if (hors.length > 0) {
        throw new ErreurApplicative({
          code: 'hors_perimetre',
          statut: 403,
          message:
            'Une des filiales désignées n’est pas dans votre périmètre. Vous ne pouvez ' +
            'convoquer que les filiales que vous administrez.',
          detailJournal: `convocation refusée : ${String(hors.length)} filiale(s) hors périmètre`,
        });
      }

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        // La campagne doit exister. Elle est de niveau Groupe et lisible de partout : ce
        // « select » ne referme donc aucun oracle, il évite seulement d'écrire des parts
        // qui pendraient dans le vide — ce que la clé en `restrict` refuserait de toute
        // façon, mais avec un message de base plutôt qu'un message de métier.
        const campagne = await client.query<{ id: string }>(
          `select id from campagnes where id = $1`,
          [campagneId],
        );
        if (campagne.rowCount === 0) {
          throw new ErreurApplicative({
            code: 'ressource_inconnue',
            statut: 404,
            message: 'Cette campagne n’existe pas.',
            detailJournal: 'convocation pour une campagne inexistante',
          });
        }

        // `on conflict do nothing` sur l'unicité (filiale, campagne) : convoquer une
        // filiale DÉJÀ convoquée n'est pas une faute, c'est un geste répété — et le faire
        // échouer obligerait l'écran à connaître l'état avant d'agir. Ce qui est rendu dit
        // combien de parts ont réellement été créées.
        const ajoutees = await client.query<{ id: string; filiale_id: string }>(
          `insert into campagne_filiales (filiale_id, campagne_id)
                select f.id, $2
                  from filiales f
                 where f.id = any($1::text[])
             on conflict (filiale_id, campagne_id) do nothing
              returning id, filiale_id`,
          [demandees, campagneId],
        );

        return {
          campagneId,
          convoquees: ajoutees.rowCount ?? 0,
          // Ce que la route NE rend pas : la liste des filiales déjà convoquées. Elle
          // serait commode à l'écran et ouvrirait exactement l'oracle que la RLS ferme —
          // l'écran la lit par `GET /api/campagnes/etat`, sous la politique.
          deja: demandees.length - (ajoutees.rowCount ?? 0),
        };
      });

      return await reponse.status(201).send(resultat);
    },
  );
}
