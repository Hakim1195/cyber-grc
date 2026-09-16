/**
 * `src/aipd/` — L'ÉTAT D'UNE ANALYSE D'IMPACT (lot L20, action 20.3)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/aipd/etat` | où en est chaque analyse, et quels traitements en réclament une |
 *
 * ── ⚠️ UNE SEULE ROUTE, ET AUCUNE ÉCRITURE — C'EST VOULU ────────────────────
 *
 * Les analyses d'impact sont une **entité ordinaire** (`src/entites/index.ts`) :
 * elles se créent, se modifient et se suppriment par les routes génériques,
 * comme un risque ou un document. Elles héritent donc du verrouillage optimiste,
 * du journal, du cloisonnement, de l'import généralisé et du round-trip
 * `grc-backup` **sans qu'une ligne soit écrite ici**. Un greffon d'écriture
 * propre aurait refait ces six choses, moins bien — c'est l'arbitrage rendu pour
 * les dérogations (19.2), et il vaut à l'identique.
 *
 * Ce qui manque à cet assemblage, et que rien d'autre ne peut rendre, est
 * **l'état** : cette analyse vaut-elle encore, oui ou non ?
 *
 * ── POURQUOI L'ÉTAT NE PEUT PAS ÊTRE UNE COLONNE ────────────────────────────
 *
 * Parce qu'une colonne doit être écrite, et donc mise à jour. Un traitement
 * nocturne qui « repasse les analyses à revoir » est un traitement qui peut ne
 * pas tourner — et le jour où il ne tourne pas, le produit affirme une
 * conformité RGPD que personne n'a constatée, **en silence**.
 *
 * L'état est donc dérivé à la lecture par `f_etat_aipd()` (migration `039`),
 * seul endroit où la date de revue est comparée au jour. Une analyse dont la
 * revue est échue cesse de valoir à l'instant où le jour change, sans qu'aucun
 * code ne s'exécute — donc sans qu'aucun code ne puisse l'oublier.
 *
 * ── ET LA SECONDE MOITIÉ : CE QUI N'A PAS D'ANALYSE ─────────────────────────
 *
 * ⚠️ **Un registre des AIPD qui ne montrerait que les AIPD existantes serait un
 * registre rassurant.** La question d'un contrôle CNIL est l'inverse : *quels
 * traitements auraient dû en avoir une ?* La route rend donc aussi les
 * traitements **sans analyse**, avec la présomption de l'article 35 §3 que le
 * registre permet de mesurer (`f_aipd_presumee_requise`).
 *
 * ⚠️ **Et c'est une PRÉSOMPTION, pas une décision.** Les trois cas de l'article
 * 35 §3 ne sont pas tous représentables avec ce que le registre porte : seul
 * celui des catégories particulières l'est. Le produit dit ce qu'il sait, et
 * l'écran écrit qu'il s'agit d'une présomption — un logiciel qui trancherait
 * « AIPD non requise » sur une donnée qu'il ne détient pas rendrait un service
 * pire que rien.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_ETAT = '/api/aipd/etat';

/**
 * Plafond d'analyses et de traitements examinés en une fois.
 *
 * ⚠️ Ce n'est pas un confort. Sans lui, la route rend le registre entier de
 * l'article 30 du périmètre — c'est-à-dire, pour une session de portée Groupe,
 * la cartographie des données personnelles de vingt filiales. C'est une voie
 * d'extraction autant qu'un déni de service applicatif (contrôle S13), et c'est
 * la borne que le constat Q-304 a réclamée pour les six autres collections.
 */
const ANALYSES_MAX = 500;

export interface OptionsAipd {
  readonly pool: Pool;
}

export async function greffonAipd(instance: FastifyInstance, options: OptionsAipd): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route d'analyse d'impact atteinte sans session appliquée",
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/aipd/etat
   * -------------------------------------------------------------------
   *  Deux listes, et la seconde est celle qui compte : les analyses avec
   *  leur état dérivé, et les traitements qui n'en ont AUCUNE.
   *
   *  ⚠️ Aucune filiale n'est nommée : c'est la RLS qui borne. Une session de
   *  portée Groupe voit donc l'état des vingt filiales — ce qu'un DPO groupe
   *  vient précisément chercher.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'rgpd' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => {
          const analyses = await client.query(
            `select a.id, a.traitement_id, a.statut, a.date_analyse, a.revoir_le,
                    a.avis_dpo_le, a.consultation_cnil, a.consultation_cnil_le,
                    a.necessite_motif,
                    t.nom  as traitement_nom,
                    t.donnees_sensibles,
                    -- ⚠️ Rendu par la BASE, jamais recalculé ici : une seconde
                    -- comparaison de dates dériverait dès que l'horloge du serveur
                    -- applicatif et celle de la base diffèrent — ce qui arrive.
                    f_etat_aipd(a.statut, a.revoir_le) as etat,
                    (select count(*)::int from analyse_mesures m where m.analyse_id = a.id)
                      as mesures_prevues
               from analyses_impact a
               join traitements t on t.id = a.traitement_id
              order by a.revoir_le nulls last, a.id
              limit $1`,
            [ANALYSES_MAX],
          );

          // ── LA SECONDE MOITIÉ : les traitements SANS analyse ──────────────
          //
          // ⚠️ `not exists` et non `left join … is null` : le second rendrait
          // aussi les traitements dont l'analyse existe mais n'est pas visible du
          // périmètre — un « il n'y a rien » qui signifierait « il y a quelque
          // chose ailleurs ». La RLS borne les deux côtés ; la forme choisie fait
          // que l'absence de droit se lit comme une absence, pas comme un trou.
          const sansAnalyse = await client.query(
            `select t.id, t.nom, t.donnees_sensibles, t.filiale_id,
                    f_aipd_presumee_requise(t.donnees_sensibles) as presumee_requise
               from traitements t
              where not exists (select 1 from analyses_impact a where a.traitement_id = t.id)
              order by f_aipd_presumee_requise(t.donnees_sensibles) desc, t.nom
              limit $1`,
            [ANALYSES_MAX],
          );

          return {
            analyses: analyses.rows.map((l) => ({
              id: String(l.id),
              traitementId: String(l.traitement_id),
              traitementNom: String(l.traitement_nom),
              donneesSensibles: l.donnees_sensibles === true,
              statut: String(l.statut),
              etat: String(l.etat),
              dateAnalyse: l.date_analyse === null ? null : String(l.date_analyse),
              revoirLe: l.revoir_le === null ? null : String(l.revoir_le),
              avisDpoLe: l.avis_dpo_le === null ? null : String(l.avis_dpo_le),
              consultationCnil: l.consultation_cnil === true,
              consultationCnilLe:
                l.consultation_cnil_le === null ? null : String(l.consultation_cnil_le),
              necessiteMotif: l.necessite_motif === null ? null : String(l.necessite_motif),
              mesuresPrevues: Number(l.mesures_prevues ?? 0),
            })),
            sansAnalyse: sansAnalyse.rows.map((l) => ({
              traitementId: String(l.id),
              traitementNom: String(l.nom),
              donneesSensibles: l.donnees_sensibles === true,
              porteeGroupe: l.filiale_id === null,
              // ⚠️ « présumée », et le mot est dans le nom du champ : l'écran ne
              // doit pas pouvoir l'afficher comme une décision par mégarde.
              presumeeRequise: l.presumee_requise === true,
            })),
            tronque:
              analyses.rows.length >= ANALYSES_MAX || sansAnalyse.rows.length >= ANALYSES_MAX,
          };
        },
        { lectureSeule: true },
      );

      return await reponse.status(200).send(resultat);
    },
  );
}
