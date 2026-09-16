/**
 * `src/attestations/` — L'ATTESTATION DE LECTURE (lot L19, action 19.1)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/attestations/a-faire` | ce que la personne connectée doit encore lire |
 * | `GET`  | `/api/attestations/documents/:documentId` | qui a attesté, et le taux de couverture |
 * | `POST` | `/api/attestations/documents/:documentId` | j'atteste avoir lu |
 *
 * ── ⚠️ ON N'ATTESTE QUE POUR SOI, ET C'EST LA DÉCISION CENTRALE ─────────────
 *
 * La personne qui atteste est **déduite de la session**, jamais reçue du client.
 * Une route qui accepterait un `personne_id` dans son corps permettrait
 * d'attester au nom d'un autre — et une preuve d'audit qu'un tiers peut
 * fabriquer ne prouve rien. C'est la même forme que le périmètre de session
 * (`PLAN_SERVEUR` §2.4) : *ce qui engage quelqu'un vient du serveur*.
 *
 * ⚠️ **Ce que cela coûte, et qu'il faut dire** : une attestation recueillie sur
 * papier ne peut pas être saisie par un administrateur. C'est assumé — la
 * saisir reviendrait à rouvrir exactement le chemin qu'on ferme. Si le besoin
 * apparaît, il demandera sa propre décision, avec sa propre trace.
 *
 * ── LA VERSION VIENT DU SERVEUR, ELLE AUSSI ─────────────────────────────────
 *
 * Le client n'envoie pas « j'ai lu la 2.1 » : le serveur lit la version en
 * vigueur du document **au moment du geste** et la fige. Sans cela, on pourrait
 * attester d'une version qu'on a choisie, ce qui vide l'attestation de son sens.
 *
 * ── CE QUE LE TAUX DE COUVERTURE COMPTE, ET SUR QUOI ────────────────────────
 *
 * Le dénominateur est **le personnel de la filiale active**, pas l'annuaire
 * entier : une PSSI de Groupe lue par dix-huit Toulousains sur vingt est à
 * 90 % *à Toulouse*, et cela ne dit rien de l'Allemagne. Agréger les deux
 * rendrait un chiffre que personne ne peut défendre en revue de direction.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';
import type { SessionAppliquee } from '../api/session.js';

export const CHEMIN_A_FAIRE = '/api/attestations/a-faire';
export const CHEMIN_DOCUMENT = '/api/attestations/documents/:documentId';

export interface OptionsAttestations {
  readonly pool: Pool;
}

/**
 * La personne de l'annuaire qui correspond à la session, dans la filiale active.
 *
 * Rend `null` quand la session n'a pas de fiche : c'est le cas d'un compte
 * d'administration qui n'est pas dans l'annuaire du personnel. Il peut alors
 * **consulter** les attestations, jamais en poser une — ce qui est juste : il ne
 * représente personne.
 */
async function personneDeLaSession(
  client: PoolClient,
  session: SessionAppliquee,
): Promise<{ id: string; nom: string } | null> {
  const r = await client.query<{ id: string; nom: string }>(
    `select id, nom from personnes
      where utilisateur_id = $1
        and (filiale_id = $2 or filiale_id is null)
      order by (filiale_id is null)
      limit 1`,
    [session.perimetre.utilisateurId, session.perimetre.filialeId],
  );
  return r.rows[0] ?? null;
}

export async function greffonAttestations(
  instance: FastifyInstance,
  options: OptionsAttestations,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route d’attestation atteinte sans session appliquée',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/attestations/a-faire
   * -------------------------------------------------------------------
   *  Les documents EN VIGUEUR qui exigent une attestation et que la
   *  personne connectée n'a pas encore attestés — ou qu'elle a attestés
   *  dans une version ANTÉRIEURE à celle qui fait foi aujourd'hui.
   *
   *  ⚠️ Le second cas est le plus important, et c'est celui qu'on oublie :
   *  une politique révisée doit être relue. Ne compter que « jamais
   *  attesté » ferait dire au produit « tout le monde est à jour » le
   *  lendemain d'une refonte de la PSSI.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_A_FAIRE,
    { config: { acces: { action: 'lire', domaine: 'documents' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const moi = await personneDeLaSession(client, session);
        if (moi === null) {
          return { personne: null, aFaire: [], motif: MOTIF_SANS_FICHE };
        }

        // Aucune filiale n'est nommée : c'est la RLS qui borne ce que la
        // session voit des documents, et la barrière de portée de la
        // migration `033` qui borne ce qu'elle peut attester.
        const r = await client.query(
          `select d.id, d.titre, d.type, d.version_document,
                  a.version_document as version_attestee,
                  a.atteste_le
             from documents d
             left join attestations_lecture a
                    on a.document_id = d.id
                   and a.personne_id = $1
            where d.attestation_requise
              and d.statut = 'en vigueur'
              and (a.id is null
                   or a.version_document is distinct from d.version_document)
            order by d.titre`,
          [moi.id],
        );

        return {
          personne: moi,
          aFaire: r.rows.map((l) => ({
            id: String(l.id),
            titre: String(l.titre),
            type: l.type === null ? null : String(l.type),
            version: l.version_document === null ? null : String(l.version_document),
            // Dire POURQUOI c'est à faire : jamais lu, ou lu dans une version
            // qui n'est plus celle qui fait foi. Les deux n'appellent pas la
            // même réaction de la part de qui les lit.
            motif: l.atteste_le === null ? 'jamais_atteste' : 'version_perimee',
            versionAttestee: l.version_attestee === null ? null : String(l.version_attestee),
          })),
          motif: '',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/attestations/documents/:documentId
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_DOCUMENT,
    { config: { acces: { action: 'lire', domaine: 'documents' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const documentId = String((requete.params as { documentId?: string }).documentId ?? '');

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const doc = await client.query<{
          id: string;
          titre: string;
          version_document: string | null;
          attestation_requise: boolean;
        }>(
          'select id, titre, version_document, attestation_requise from documents where id = $1',
          [documentId],
        );
        if (doc.rows.length === 0) {
          // ⚠️ Le 404 ne distingue pas « n'existe pas » de « pas dans votre
          // périmètre » : trancher serait l'oracle d'existence que le produit
          // ferme depuis la porte S2.
          throw new ErreurApplicative({
            code: 'ressource_inconnue',
            statut: 404,
            message: 'Ce document n’existe pas dans votre périmètre.',
            detailJournal: `attestations demandées pour un document hors périmètre (${documentId})`,
          });
        }
        const d = doc.rows[0]!;

        const faites = await client.query(
          `select a.personne_id, p.nom, a.version_document, a.atteste_le, a.commentaire
             from attestations_lecture a
             join personnes p on p.id = a.personne_id
            where a.document_id = $1
            order by a.atteste_le desc`,
          [documentId],
        );

        // Le dénominateur : le personnel de la FILIALE ACTIVE. Voir l'entête.
        const effectif = await client.query<{ n: string }>(
          'select count(*)::text as n from personnes where filiale_id = $1',
          [session.perimetre.filialeId],
        );
        const total = Number(effectif.rows[0]?.n ?? 0);

        // On ne compte que les attestations portant la version EN VIGUEUR :
        // une attestation périmée n'est pas une couverture.
        const aJour = faites.rows.filter(
          (l) => String(l.version_document ?? '') === String(d.version_document ?? ''),
        ).length;

        return {
          document: {
            id: d.id,
            titre: d.titre,
            version: d.version_document,
            attestationRequise: d.attestation_requise,
          },
          attestations: faites.rows.map((l) => ({
            personneId: String(l.personne_id),
            nom: String(l.nom),
            version: l.version_document === null ? null : String(l.version_document),
            atteste_le: l.atteste_le,
            commentaire: l.commentaire === null ? null : String(l.commentaire),
            aJour: String(l.version_document ?? '') === String(d.version_document ?? ''),
          })),
          couverture: {
            aJour,
            effectif: total,
            // ⚠️ Rendu `null` et non `0` quand l'effectif est nul : un taux de
            // 0 % sur une filiale sans personnel serait faux, et il alimenterait
            // un indicateur de direction. Un domaine sans réponse rend `null`,
            // jamais zéro — c'est la règle de `/api/consolidation`.
            taux: total === 0 ? null : Math.round((aJour / total) * 100),
          },
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/attestations/documents/:documentId — j'atteste
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_DOCUMENT,
    {
      config: { acces: { action: 'lire', domaine: 'documents' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { commentaire: { type: 'string', maxLength: 2000 } },
        },
      },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const documentId = String((requete.params as { documentId?: string }).documentId ?? '');
      const commentaire = (requete.body as { commentaire?: string } | undefined)?.commentaire ?? null;

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const moi = await personneDeLaSession(client, session);
        if (moi === null) {
          throw new ErreurApplicative({
            code: 'droit_insuffisant',
            statut: 403,
            message: MOTIF_SANS_FICHE,
            detailJournal:
              `attestation refusée : aucune fiche de personnel pour ` +
              `${session.perimetre.utilisateurId}`,
          });
        }

        const doc = await client.query<{
          version_document: string | null;
          attestation_requise: boolean;
          statut: string;
        }>(
          'select version_document, attestation_requise, statut from documents where id = $1',
          [documentId],
        );
        if (doc.rows.length === 0) {
          throw new ErreurApplicative({
            code: 'ressource_inconnue',
            statut: 404,
            message: 'Ce document n’existe pas dans votre périmètre.',
            detailJournal: `attestation sur un document hors périmètre (${documentId})`,
          });
        }
        const d = doc.rows[0]!;
        if (!d.attestation_requise) {
          throw new ErreurApplicative({
            code: 'contrainte_base',
            statut: 409,
            message: 'Ce document ne demande pas d’attestation de lecture.',
            detailJournal: `attestation sur un document qui ne l’exige pas (${documentId})`,
          });
        }

        // ⚠️ Une attestation vaut pour UNE version. Réattester après révision
        // MET À JOUR la ligne plutôt que d'en créer une seconde : l'unicité
        // (document, personne, filiale) l'impose, et c'est le bon modèle —
        // « qui a lu la version en vigueur » est la question, pas « combien de
        // fois quelqu'un a cliqué ».
        await client.query(
          `insert into attestations_lecture
                 (filiale_id, document_id, personne_id, version_document, commentaire)
           values ($1, $2, $3, $4, $5)
           on conflict (document_id, personne_id, filiale_id) do update
              set version_document = excluded.version_document,
                  commentaire      = excluded.commentaire,
                  atteste_le       = now()`,
          [session.perimetre.filialeId, documentId, moi.id, d.version_document, commentaire],
        );

        await journaliser(client, {
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          action: 'attestation',
          entiteType: 'documents',
          entiteId: documentId,
          // §29.5 : la phrase est du développeur, les valeurs vont en jsonb.
          resume: 'Attestation de lecture d’un document.',
          valeursApres: {
            personne_id: moi.id,
            version_document: d.version_document,
          },
        });

        return { atteste: true, version: d.version_document, personne: moi };
      });

      return await reponse.status(201).send(resultat);
    },
  );
}

/**
 * Le motif rendu à un compte sans fiche de personnel.
 *
 * ⚠️ Il DIT pourquoi, plutôt que de rendre une liste vide : un écran qui ne
 * montre rien sans expliquer apprend à ne plus croire ce qu'il montre — c'est la
 * classe des constats Q-201 / Q-207.
 */
const MOTIF_SANS_FICHE =
  'Votre compte n’a pas de fiche dans l’annuaire du personnel de cette filiale. Vous pouvez ' +
  'consulter les attestations, mais pas en poser une : une attestation engage une personne, ' +
  'et le produit ne peut pas deviner laquelle.';
