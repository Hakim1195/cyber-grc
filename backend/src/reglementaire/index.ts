/**
 * `src/reglementaire/` — L'HORLOGE RÉGLEMENTAIRE (lot L20, action 20.1)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/reglementaire/echeances` | ce qui est dû, pour quand, et depuis quelle détection |
 * | `POST` | `/api/reglementaire/incidents/:incidentId/declarations` | consigner une déclaration faite |
 *
 * ── ⚠️ CE QUE CE MODULE NE FAIT PAS, ET QUI EST LE PLUS IMPORTANT ──────────
 *
 * **Le produit ne transmet RIEN à une autorité.** Il calcule les échéances, il
 * prépare, il consigne ce qui a été fait. C'est un humain qui envoie, et c'est
 * écrit noir sur blanc dans le critère 20.2 : *« toute autre lecture serait une
 * prise de responsabilité que le logiciel ne peut pas porter »*.
 *
 * Un outil qui déclarerait tout seul à l'ANSSI engagerait son exploitant sur le
 * fond d'un dossier qu'il n'a pas relu. La frontière est ici, et elle est nette.
 *
 * ── LES ÉCHÉANCES SONT DÉRIVÉES, PAS STOCKÉES ──────────────────────────────
 *
 * `f_echeances_reglementaires()` (migration `034`) est **le seul endroit** où les
 * quatre délais existent. Ce module ne recalcule rien : il appelle. Une seconde
 * rédaction — ici, dans l'échéancier, dans le navigateur — divergerait au premier
 * ajustement, et deux comptes de la même échéance réglementaire est la pire
 * chose qu'un outil produit en audit puisse afficher.
 *
 * ── ET L'ORIGINE SE DIT ────────────────────────────────────────────────────
 *
 * `incidents.date_detection` est une date NUE. Quand l'instant précis
 * (`detecte_le`) manque, l'horloge repart de minuit et la route rend
 * `origine: 'date_seule'`. *Une horloge dont on ignore l'origine ne se défend pas
 * devant l'ANSSI* — le critère 20.1 le dit, et l'écran doit pouvoir l'écrire.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';
import type { SessionAppliquee } from '../api/session.js';

export const CHEMIN_ECHEANCES = '/api/reglementaire/echeances';
export const CHEMIN_DECLARER = '/api/reglementaire/incidents/:incidentId/declarations';

/** Bornes de saisie — contrôle S13. */
const REFERENCE_MAX = 200;
const COMMENTAIRE_MAX = 2000;
/**
 * Plafond d'incidents examinés en une fois.
 *
 * ⚠️ Ce n'est pas un confort : sans lui, la route rend une ligne par incident et
 * par palier — quatre fois le registre entier —, ce qui en ferait une voie
 * d'extraction et un déni de service applicatif à la fois.
 */
const INCIDENTS_MAX = 500;

export interface OptionsReglementaire {
  readonly pool: Pool;
}

export async function greffonReglementaire(
  instance: FastifyInstance,
  options: OptionsReglementaire,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route réglementaire atteinte sans session appliquée',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/reglementaire/echeances
   * -------------------------------------------------------------------
   *  Pour chaque incident **à déclarer**, les quatre paliers, ce qui a été
   *  fait, et le reste-à-courir.
   *
   *  ⚠️ Aucune filiale n'est nommée : c'est la RLS qui borne. Une session de
   *  portée Groupe voit donc les incidents de toutes ses filiales, ce qui est
   *  exactement ce qu'une direction attend d'un tableau réglementaire.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ECHEANCES,
    { config: { acces: { action: 'lire', domaine: 'incidents' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const r = await client.query(
          `select i.id            as incident_id,
                  i.titre,
                  i.gravite,
                  i.date_detection,
                  i.detecte_le,
                  i.declaration_anssi,
                  i.declaration_cnil,
                  e.regime, e.palier, e.reference, e.echeance, e.origine,
                  d.fait_le, d.reference as accuse_reception
             from incidents i
             cross join lateral f_echeances_reglementaires(i.detecte_le, i.date_detection) e
             left join declarations_reglementaires d
                    on d.incident_id = i.id
                   and d.regime = e.regime
                   and d.palier = e.palier
            where i.declaration_anssi = 'à déclarer'
               or i.declaration_cnil  = 'à déclarer'
            order by e.echeance
            limit $1`,
          [INCIDENTS_MAX * 4],
        );

        const maintenant = Date.now();
        const lignes = r.rows.map((l) => {
          const echeance = new Date(String(l.echeance));
          const fait = l.fait_le !== null;
          const resteMs = echeance.getTime() - maintenant;
          return {
            incidentId: String(l.incident_id),
            titre: String(l.titre),
            gravite: l.gravite === null ? null : String(l.gravite),
            regime: String(l.regime),
            palier: String(l.palier),
            // La référence au TEXTE, rendue avec l'échéance. Un délai
            // réglementaire sans sa source est un chiffre que personne ne peut
            // vérifier — et celui qui le vérifiera est un auditeur.
            texte: String(l.reference),
            echeance: echeance.toISOString(),
            // ⚠️ L'origine du calcul, TOUJOURS rendue : « instant » ou
            // « date_seule ». Voir l'entête.
            origine: String(l.origine),
            fait,
            faitLe: fait ? new Date(String(l.fait_le)).toISOString() : null,
            accuseReception: l.accuse_reception === null ? null : String(l.accuse_reception),
            // `null` quand c'est fait : un reste-à-courir sur une obligation
            // remplie n'a pas de sens, et l'afficher en « en retard » serait
            // annoncer un problème qui n'existe pas (classe Q-201 / Q-207).
            resteHeures: fait ? null : Math.round((resteMs / 3_600_000) * 10) / 10,
            enRetard: !fait && resteMs < 0,
          };
        });

        return {
          echeances: lignes,
          tronque: r.rows.length >= INCIDENTS_MAX * 4,
          // Ce que l'écran doit pouvoir dire quand il ne montre rien.
          motif:
            lignes.length === 0
              ? 'Aucun incident n’est marqué « à déclarer » dans votre périmètre.'
              : '',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/reglementaire/incidents/:incidentId/declarations
   * -------------------------------------------------------------------
   *  Consigner une déclaration **déjà faite** à une autorité, avec son
   *  accusé de réception.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_DECLARER,
    {
      config: { acces: { action: 'ecrire', domaine: 'incidents' } },
      schema: {
        body: {
          type: 'object',
          required: ['regime', 'palier'],
          additionalProperties: false,
          properties: {
            regime: { type: 'string', enum: ['nis2', 'rgpd'] },
            palier: {
              type: 'string',
              enum: ['alerte_precoce', 'notification', 'rapport_final', 'notification_cnil'],
            },
            reference: { type: 'string', minLength: 1, maxLength: REFERENCE_MAX },
            commentaire: { type: 'string', maxLength: COMMENTAIRE_MAX },
          },
        },
      },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const incidentId = String((requete.params as { incidentId?: string }).incidentId ?? '');
      const corps = requete.body as {
        regime: string;
        palier: string;
        reference?: string;
        commentaire?: string;
      };

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const incident = await client.query<{ id: string }>(
          'select id from incidents where id = $1',
          [incidentId],
        );
        if (incident.rows.length === 0) {
          // 404 indistinct : trancher « n'existe pas » / « pas votre périmètre »
          // serait l'oracle d'existence fermé depuis la porte S2.
          throw new ErreurApplicative({
            code: 'ressource_inconnue',
            statut: 404,
            message: 'Cet incident n’existe pas dans votre périmètre.',
            detailJournal: `déclaration sur un incident hors périmètre (${incidentId})`,
          });
        }

        // ⚠️ La cohérence régime/palier est tenue PAR LA BASE
        // (`ck_declarations_reglementaires_coherence`). On ne la réécrit pas
        // ici : deux rédactions de la même règle divergent, et c'est la base
        // qui doit gagner — elle est le seul chemin que l'import, la reprise et
        // `psql` empruntent aussi.
        await client.query(
          `insert into declarations_reglementaires
                 (filiale_id, incident_id, regime, palier, reference, commentaire)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (incident_id, regime, palier, filiale_id) do update
              set fait_le     = now(),
                  reference   = excluded.reference,
                  commentaire = excluded.commentaire`,
          [
            session.perimetre.filialeId,
            incidentId,
            corps.regime,
            corps.palier,
            corps.reference ?? null,
            corps.commentaire ?? null,
          ],
        );

        await journaliser(client, {
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          action: 'administration',
          entiteType: 'incidents',
          entiteId: incidentId,
          // §29.5 : phrase du développeur, valeurs en jsonb.
          resume: 'Déclaration réglementaire consignée pour un incident.',
          valeursApres: {
            regime: corps.regime,
            palier: corps.palier,
            reference: corps.reference ?? null,
          },
        });

        return { consigne: true, regime: corps.regime, palier: corps.palier };
      });

      return await reponse.status(201).send(resultat);
    },
  );
}
