/**
 * `src/connecteurs/` — LA COLLECTE AUTOMATIQUE DE PREUVE (lot L23, actions 23.1 à 23.4)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/connecteurs/etat` | les connecteurs, leur fraîcheur DÉRIVÉE, et ce que chaque genre sait lire |
 * | `POST` | `/api/connecteurs/:id/collecter` | l'exécuter **maintenant**, et ranger le constat |
 * | `GET`  | `/api/connecteurs/:id/historique` | l'historique du contrôle (action 23.3) |
 *
 * ── ⚠️ POURQUOI DES ROUTES PROPRES, ALORS QUE `connecteurs` EST UNE ENTITÉ ─
 *
 * `connecteurs` **est** une entité ordinaire : elle se crée, se modifie et se supprime
 * par les routes génériques, elle hérite du verrouillage optimiste, du journal, du
 * cloisonnement et de l'import généralisé, et elle voyage dans le fichier d'échange.
 * Rien de cela n'est réécrit ici.
 *
 * Ce greffon n'ajoute que ce qu'une route générique ne peut pas faire : **exécuter**
 * un connecteur — c'est-à-dire sortir du produit et regarder le monde —, et **dériver**
 * la fraîcheur d'une preuve, que la base calcule et que personne ne range.
 *
 * ⚠️ **`collectes`, elle, n'est PAS une entité, et c'est délibéré.** Un constat est une
 * **preuve**, au même titre que le journal d'audit, la main courante de crise et les
 * pièces jointes : le faire voyager dans un fichier éditable lui ôterait sa valeur
 * probante. On ne restaure pas un constat ; on en produit un nouveau.
 *
 * ── ⚠️ CE QUE LA COLLECTE NE FAIT PAS ─────────────────────────────────────
 *
 * Elle **ne conclut pas à la conformité d'une mesure**. Elle constate un fait daté, et
 * ce fait alimente la mesure : c'est un élément de preuve parmi d'autres, et l'évaluation
 * reste celle d'un humain. Un produit qui passerait une mesure au vert parce qu'un script
 * a répondu « OK » remplacerait un jugement par un ping.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import type { Configuration } from '../config/index.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

import { executeurDe, EXECUTEURS, type Constat, type Monde } from './executeurs.js';
import { mondeReel } from './monde.js';

export const CHEMIN_ETAT = '/api/connecteurs/etat';
export const CHEMIN_COLLECTER = '/api/connecteurs/:id/collecter';
export const CHEMIN_HISTORIQUE = '/api/connecteurs/:id/historique';

/** Bornes (contrôle S13). */
const HISTORIQUE_MAX = 200;

export interface OptionsConnecteurs {
  readonly pool: Pool;
  readonly config: Configuration;
  /** Remplaçable par le banc, pour éprouver les chemins d'échec. */
  readonly monde?: Monde;
}

interface LigneConnecteur {
  readonly id: string;
  readonly genre: string;
  readonly nom: string;
  readonly actif: boolean;
  readonly configuration: Record<string, unknown>;
  readonly mesure_id: string;
  readonly mesure_nom: string | null;
  readonly fraicheur_jours: number;
  readonly derniere_execution_le: Date | null;
  readonly dernier_verdict: string | null;
  readonly dernier_detail: string | null;
  readonly fraicheur: string;
  readonly constats: string;
}

export async function greffonConnecteurs(
  instance: FastifyInstance,
  options: OptionsConnecteurs,
): Promise<void> {
  const { pool, config } = options;
  const monde = options.monde ?? mondeReel(config);

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de connecteur atteinte sans session appliquée',
      });
    }
    return session;
  };

  const identifiantDe = (requete: FastifyRequest): string => {
    const { id } = requete.params as { id?: string };
    if (typeof id !== 'string' || id === '' || id.length > 120) {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message: 'Le connecteur demandé est introuvable.',
        detailJournal: 'identifiant de connecteur absent ou hors borne',
      });
    }
    return id;
  };

  /* -------------------------------------------------------------------
   *  GET /api/connecteurs/etat
   * -------------------------------------------------------------------
   *  ⚠️ La fraîcheur est DÉRIVÉE par `f_collecte_fraicheur()`, dans la
   *  base. La recalculer ici en ferait une seconde source, qui
   *  divergerait au premier ajustement (constat **Q-219**). Et une
   *  colonne « valide » vieillirait sans que rien n'écrive.
   *
   *  ⚠️ Les réglages que chaque genre sait lire sont lus par
   *  `f_connecteur_clefs()` — **la base fait foi**, l'écran la suit.
   *  Le registre des exécuteurs y ajoute ce que la base ne sait pas
   *  dire : le libellé, l'objet du contrôle, et l'aide de chaque réglage.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const charge = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query<LigneConnecteur>(
          `select c.id, c.genre, c.nom, c.actif, c.configuration, c.mesure_id,
                  m.nom as mesure_nom,
                  c.fraicheur_jours, c.derniere_execution_le,
                  c.dernier_verdict, c.dernier_detail,
                  f_collecte_fraicheur(c.derniere_execution_le, c.fraicheur_jours)
                      as fraicheur,
                  (select count(*) from collectes k where k.connecteur_id = c.id)::text
                      as constats
             from connecteurs c
             left join mesure_catalogue m on m.id = c.mesure_id
            order by c.nom`,
        );

        // Le vocabulaire des réglages, lu DANS LA BASE.
        const genres: Record<string, readonly string[]> = {};
        for (const genre of EXECUTEURS.keys()) {
          const { rows: clefs } = await client.query<{ clefs: string[] | null }>(
            'select f_connecteur_clefs($1) as clefs',
            [genre],
          );
          genres[genre] = clefs[0]?.clefs ?? [];
        }
        return { rows, genres };
      });

      const genresServis = [...EXECUTEURS.values()].map((executeur) => ({
        genre: executeur.genre,
        libelle: executeur.libelle,
        objet: executeur.objet,
        reglages: executeur.reglages.map((reglage) => ({
          ...reglage,
          // ⚠️ Un réglage que le registre déclare et que la base refuse serait un
          // champ de formulaire dont la saisie est rejetée. Le banc l'interdit ;
          // l'écran, lui, n'affiche que ce que la base admet.
          admis: (charge.genres[executeur.genre] ?? []).includes(reglage.nom),
        })),
      }));

      return await reponse.send({
        connecteurs: charge.rows.map((ligne) => ({
          id: ligne.id,
          genre: ligne.genre,
          nom: ligne.nom,
          actif: ligne.actif,
          configuration: ligne.configuration,
          mesureId: ligne.mesure_id,
          mesureNom: ligne.mesure_nom,
          fraicheurJours: ligne.fraicheur_jours,
          derniereExecutionLe: ligne.derniere_execution_le?.toISOString() ?? null,
          dernierVerdict: ligne.dernier_verdict,
          dernierDetail: ligne.dernier_detail,
          fraicheur: ligne.fraicheur,
          constats: Number.parseInt(ligne.constats, 10),
          // Un connecteur dont aucun exécuteur ne sert le genre : ce ne devrait
          // jamais arriver (le banc confronte les deux vocabulaires), et si cela
          // arrive, on le DIT plutôt que de l'afficher comme les autres.
          servi: executeurDe(ligne.genre) !== null,
        })),
        genres: genresServis,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/connecteurs/:id/collecter
   * -------------------------------------------------------------------
   *  ⚠️ **L'exécution a lieu HORS TRANSACTION**, et l'écriture après.
   *  Tenir une transaction ouverte pendant qu'on interroge un annuaire
   *  qui ne répond pas garderait un verrou et une connexion du pool
   *  pendant tout le délai — c'est ainsi qu'un contrôle qui échoue fait
   *  tomber le service qu'il surveille.
   *
   *  ⚠️ **Et le constat est écrit MÊME quand il est « indeterminé ».**
   *  Ne rien écrire ferait que la dernière trace resterait le succès de
   *  la veille : l'écran dirait « conforme, il y a un jour » pendant que
   *  la source est morte depuis. Un « je ne sais pas » daté est une
   *  information ; un silence n'en est pas une.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_COLLECTER,
    { config: { acces: { action: 'ecrire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = identifiantDe(requete);

      const connecteur = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query<LigneConnecteur>(
          `select c.id, c.genre, c.nom, c.actif, c.configuration, c.mesure_id,
                  c.fraicheur_jours
             from connecteurs c where c.id = $1`,
          [id],
        );
        return rows[0] ?? null;
      });

      if (connecteur === null) {
        // ⚠️ **404 et non 403** : un connecteur d'une autre filiale est invisible,
        // et distinguer « absent » de « interdit » serait un oracle d'existence.
        throw new ErreurApplicative({
          code: 'ressource_inconnue',
          statut: 404,
          message: 'Ce connecteur est introuvable.',
          detailJournal: `connecteur ${id} hors perimetre ou absent`,
        });
      }
      if (!connecteur.actif) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 409,
          message:
            'Ce connecteur est désactivé : il ne produit plus de constat tant qu’il ne ' +
            'sera pas réactivé.',
          detailJournal: `connecteur ${id} inactif`,
        });
      }

      const executeur = executeurDe(connecteur.genre);
      if (executeur === null) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 409,
          message: `Aucun exécuteur ne sert le genre « ${connecteur.genre} ».`,
          detailJournal: `genre ${connecteur.genre} sans executeur`,
        });
      }

      let constat: Constat;
      try {
        constat = await executeur.executer(connecteur.configuration ?? {}, { config, monde });
      } catch (erreur) {
        // ⚠️ **Un exécuteur qui jette rend « indeterminé », jamais une erreur 500.**
        // Une panne de collecte n'est pas une panne du produit, et l'utilisateur doit
        // voir le constat — daté — plutôt qu'un écran d'erreur sans trace.
        constat = {
          verdict: 'indetermine',
          detail: {
            motif: 'executeur_en_echec',
            explication:
              "Le contrôle n'a pas pu être mené à son terme. Ce n'est pas un échec du " +
              'contrôle : c’est une absence de constat.',
            reponse: (erreur instanceof Error ? erreur.message : String(erreur)).slice(0, 500),
          },
        };
      }

      const ecrit = await avecTransaction(pool, session.perimetre, async (client) => {
          const { rows } = await client.query<{ id: string; constate_le: Date }>(
            `insert into collectes
                 (filiale_id, connecteur_id, mesure_id, verdict, fraicheur_jours, detail)
             values ($1, $2, $3, $4, $5, $6::jsonb)
             returning id, constate_le`,
            [
              session.perimetre.filialeId,
              connecteur.id,
              connecteur.mesure_id,
              constat.verdict,
              connecteur.fraicheur_jours,
              JSON.stringify(constat.detail),
            ],
          );
          // Le résumé porté par le connecteur : ce que l'écran lit sans jointure.
          await client.query(
            `update connecteurs
                set derniere_execution_le = now(), dernier_verdict = $2,
                    dernier_detail = left($3, 2000)
              where id = $1`,
            [connecteur.id, constat.verdict, String(constat.detail.motif ?? '')],
          );
          /* ⚠️ **§29.5 : le résumé est une PHRASE ÉCRITE, sans une interpolation.**
           *
           * La première rédaction y glissait le verdict et le genre. Les deux sont
           * des vocabulaires clos, donc inoffensifs — et le contrôle mécanique les a
           * refusés quand même, **à raison** : un vocabulaire clos aujourd'hui est un
           * champ libre demain, et ce jour-là personne ne relira cette ligne. Les
           * trois phrases sont donc littérales, et le détail part en `valeursApres`,
           * qui est un document structuré et non la phrase. */
          await journaliser(client, {
            action: 'modification',
            resume:
              constat.verdict === 'conforme'
                ? 'Collecte automatique : le contrôle est constaté tenu.'
                : constat.verdict === 'non_conforme'
                  ? 'Collecte automatique : le contrôle est constaté en échec.'
                  : 'Collecte automatique : le contrôle n’a pas pu être constaté.',
            filialeId: session.perimetre.filialeId,
            utilisateurLibelle: session.perimetre.utilisateurId,
            adresseIp: requete.ip,
            entiteType: 'connecteurs',
            entiteId: connecteur.id,
            valeursApres: {
              operation: 'collecte',
              genre: connecteur.genre,
              verdict: constat.verdict,
              motif: constat.detail.motif ?? null,
            },
          });
          return rows[0] ?? null;
      });

      return await reponse.send({
        connecteurId: connecteur.id,
        collecteId: ecrit?.id ?? null,
        constateLe: ecrit?.constate_le.toISOString() ?? null,
        verdict: constat.verdict,
        detail: constat.detail,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/connecteurs/:id/historique — action 23.3
   * -------------------------------------------------------------------
   *  ⚠️ **« Depuis quand » est la question**, et c'est pour cela que
   *  chaque passage écrit une ligne plutôt que d'écraser la précédente.
   *  Un contrôle qui ne garde que son dernier état ne sait pas dire
   *  « rouge depuis trois semaines » — or c'est cela qu'un auditeur
   *  demande, jamais la couleur du jour.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_HISTORIQUE,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = identifiantDe(requete);

      const charge = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows: existe } = await client.query(
          'select 1 from connecteurs where id = $1',
          [id],
        );
        if (existe.length === 0) return null;

        const { rows } = await client.query<{
          id: string;
          constate_le: Date;
          verdict: string;
          fraicheur_jours: number;
          detail: Record<string, unknown>;
          fraicheur: string;
        }>(
          `select k.id, k.constate_le, k.verdict, k.fraicheur_jours, k.detail,
                  f_collecte_fraicheur(k.constate_le, k.fraicheur_jours) as fraicheur
             from collectes k
            where k.connecteur_id = $1
            order by k.constate_le desc
            limit $2`,
          [id, HISTORIQUE_MAX],
        );

        // ⚠️ **« Depuis quand » se COMPTE**, il ne se range pas : la date à
        // laquelle le verdict courant s'est installé est le premier constat, en
        // remontant, qui porte encore ce verdict-là.
        let depuis: Date | null = null;
        const courant = rows[0]?.verdict ?? null;
        for (const ligne of rows) {
          if (ligne.verdict !== courant) break;
          depuis = ligne.constate_le;
        }

        return { rows, courant, depuis };
      });

      if (charge === null) {
        throw new ErreurApplicative({
          code: 'ressource_inconnue',
          statut: 404,
          message: 'Ce connecteur est introuvable.',
          detailJournal: `historique demande pour ${id}, hors perimetre ou absent`,
        });
      }

      return await reponse.send({
        connecteurId: id,
        verdictCourant: charge.courant,
        depuisLe: charge.depuis?.toISOString() ?? null,
        constats: charge.rows.map((ligne) => ({
          id: ligne.id,
          constateLe: ligne.constate_le.toISOString(),
          verdict: ligne.verdict,
          fraicheurJours: ligne.fraicheur_jours,
          fraicheur: ligne.fraicheur,
          detail: ligne.detail,
        })),
      });
    },
  );
}
