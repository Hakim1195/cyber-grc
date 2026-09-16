/**
 * `src/droits-personnes/` — L'HORLOGE D'UNE DEMANDE D'EXERCICE DE DROITS
 * (lot L20, action 20.4)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/demandes-droits/etat` | ce qui est dû, pour quand, et ce qui est en retard |
 *
 * ── ⚠️ UNE SEULE ROUTE, ET AUCUNE ÉCRITURE — C'EST VOULU ────────────────────
 *
 * Les demandes sont une **entité ordinaire** (`src/entites/index.ts`) : elles se
 * créent, se modifient et se suppriment par les routes génériques. Elles héritent
 * donc du verrouillage optimiste, du journal, du cloisonnement, de l'import
 * généralisé et du round-trip `grc-backup` **sans qu'une ligne soit écrite ici**.
 * C'est l'arbitrage rendu pour les dérogations (19.2) puis les analyses d'impact
 * (20.3), et il vaut à l'identique.
 *
 * Ce qui manque à cet assemblage, et que rien d'autre ne peut rendre, est
 * **l'échéance** — et **l'état qui en découle**.
 *
 * ── POURQUOI L'ÉCHÉANCE NE PEUT PAS ÊTRE UNE COLONNE ────────────────────────
 *
 * Parce qu'une colonne doit être écrite. Corriger la date de réception d'une
 * demande — le cas ordinaire, quand on découvre qu'un courriel dormait trois
 * jours dans une boîte partagée — laisserait l'échéance calculée sur l'ancienne,
 * **sans que personne le sache**. Et un traitement nocturne qui « repasse les
 * demandes en retard » est un traitement qui peut ne pas tourner.
 *
 * L'échéance est donc dérivée à la lecture par `f_echeance_droits()`, et l'état
 * par `f_etat_demande_droits()` (migration `040`) — le mécanisme de l'action
 * 20.1, repris et non réinventé.
 *
 * ── ⚠️ CE QUE CETTE ROUTE NE FAIT PAS ───────────────────────────────────────
 *
 * Elle ne répond pas à la personne, n'extrait pas ses données et ne juge pas si
 * la demande est fondée. Elle **rend le registre et l'horloge**. Toute autre
 * lecture serait une prise de responsabilité qu'un logiciel ne peut pas porter —
 * c'est l'arbitrage de 20.2 pour les notifications aux autorités.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_ETAT = '/api/demandes-droits/etat';

/**
 * Plafond de demandes examinées en une fois.
 *
 * ⚠️ Ce n'est pas un confort. Sans lui, la route rend le registre entier des
 * personnes qui ont écrit au groupe — noms et coordonnées compris. C'est une voie
 * d'extraction autant qu'un déni de service applicatif (contrôle S13), et c'est
 * la borne que le constat Q-304 a réclamée pour les autres collections.
 */
const DEMANDES_MAX = 500;

export interface OptionsDroitsPersonnes {
  readonly pool: Pool;
}

export async function greffonDroitsPersonnes(
  instance: FastifyInstance,
  options: OptionsDroitsPersonnes,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route de demande d'exercice de droits atteinte sans session appliquée",
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/demandes-droits/etat
   * -------------------------------------------------------------------
   *  Chaque demande du périmètre, avec son échéance DÉRIVÉE, son état, et
   *  le reste-à-courir en jours.
   *
   *  ⚠️ Aucune filiale n'est nommée : c'est la RLS qui borne. Un DPO groupe
   *  voit les demandes de toutes ses filiales, une filiale ne voit que les
   *  siennes.
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
          const lignes = await client.query(
            // ⚠️ **Les dates sortent en `::text`, donc en ISO `AAAA-MM-JJ`.** Le
            // pilote `pg` rend un objet `Date` pour une colonne `date`, et
            // `String(unDate)` donne « Sun Feb 15 2026 00:00:00 GMT+0000 (…) » —
            // une chaîne dépendante de la locale, du fuseau et de la version de
            // Node, sur une valeur qui sert de preuve de délai réglementaire. Le
            // cast est fait par la BASE, une fois, plutôt que par chaque lecteur.
            `select d.id, d.type_demande, d.recue_le::text as recue_le, d.canal,
                    d.demandeur, d.contact,
                    d.identite_verifiee, d.identite_verifiee_le::text as identite_verifiee_le,
                    d.prorogee, d.prorogee_le::text as prorogee_le, d.prorogation_motif,
                    d.statut, d.repondue_le::text as repondue_le, d.motif_refus,
                    d.traitement_id,
                    t.nom as traitement_nom,
                    -- ⚠️ Rendus par la BASE, jamais recalculés ici : une seconde
                    -- arithmétique de dates dériverait dès que l'horloge du serveur
                    -- applicatif et celle de la base diffèrent — ce qui arrive.
                    f_echeance_droits(d.recue_le, d.prorogee)::text as echeance,
                    f_etat_demande_droits(d.statut, d.recue_le, d.prorogee) as etat,
                    (f_echeance_droits(d.recue_le, d.prorogee) - current_date) as jours_restants
               from demandes_droits d
               left join traitements t on t.id = d.traitement_id
              order by f_echeance_droits(d.recue_le, d.prorogee), d.id
              limit $1`,
            [DEMANDES_MAX],
          );

          return {
            demandes: lignes.rows.map((l) => ({
              id: String(l.id),
              typeDemande: String(l.type_demande),
              recueLe: String(l.recue_le),
              canal: String(l.canal),
              demandeur: String(l.demandeur),
              contact: l.contact === null ? null : String(l.contact),
              identiteVerifiee: l.identite_verifiee === true,
              identiteVerifieeLe:
                l.identite_verifiee_le === null ? null : String(l.identite_verifiee_le),
              prorogee: l.prorogee === true,
              prorogeeLe: l.prorogee_le === null ? null : String(l.prorogee_le),
              prorogationMotif: l.prorogation_motif === null ? null : String(l.prorogation_motif),
              statut: String(l.statut),
              repondueLe: l.repondue_le === null ? null : String(l.repondue_le),
              motifRefus: l.motif_refus === null ? null : String(l.motif_refus),
              traitementId: l.traitement_id === null ? null : String(l.traitement_id),
              traitementNom: l.traitement_nom === null ? null : String(l.traitement_nom),
              // L'échéance et l'état viennent de la base. `joursRestants` est
              // négatif pour une demande en retard, et l'écran doit le dire ainsi :
              // « en retard de 12 jours » se défend, « bientôt » ne se défend pas.
              echeance: l.echeance === null ? null : String(l.echeance),
              etat: String(l.etat),
              joursRestants: l.jours_restants === null ? null : Number(l.jours_restants),
              // ⚠️ La référence au texte voyage AVEC le délai. Un chiffre
              // réglementaire sans sa source est un chiffre que personne ne peut
              // vérifier — et celui qui le vérifiera est une autorité.
              reference:
                l.prorogee === true
                  ? 'RGPD, article 12 §3 — un mois, prorogé de deux mois'
                  : 'RGPD, article 12 §3 — un mois',
            })),
            tronque: lignes.rows.length >= DEMANDES_MAX,
          };
        },
        { lectureSeule: true },
      );

      return await reponse.status(200).send(resultat);
    },
  );
}
