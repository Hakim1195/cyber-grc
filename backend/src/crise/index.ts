/**
 * `src/crise/` — LA MAIN COURANTE DE CRISE (lot L20, action 20.5)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/main-courante/:incidentId` | le récit de la crise, et l'état de sa chaîne |
 * | `POST` | `/api/main-courante/:incidentId` | ajouter une entrée — **et rien d'autre** |
 *
 * ── ⚠️ NI `PUT`, NI `DELETE` — ET CE N'EST PAS UN OUBLI ─────────────────────
 *
 * Une main courante rééditable ne prouve rien. Une correction s'**ajoute**, elle
 * ne remplace pas : c'est le critère de l'action 20.5, et la base le tient par
 * les quatre couches du `CONVENTIONS.md` §12 — privilèges retirés, déclencheurs
 * de refus par instruction, armement `always`, propriétaire distinct. Les routes
 * n'ajoutent rien à cette garantie ; elles s'y conforment.
 *
 * ── POURQUOI CE N'EST PAS UNE ENTITÉ ORDINAIRE ──────────────────────────────
 *
 * Les dérogations, les analyses d'impact et les demandes de droits passent par
 * les routes génériques de `src/entites/` — elles y gagnent le verrouillage
 * optimiste, le journal, l'import et le round-trip `grc-backup` sans une ligne de
 * code. La main courante, non, et pour une raison de fond : **la moitié de ce que
 * la couche générique offre n'a aucun sens ici.** Le verrouillage optimiste sert
 * à arbitrer deux modifications concurrentes ; il n'y a pas de modification. La
 * mise à jour et la suppression sont refusées par la base. Le round-trip
 * `grc-backup` ferait voyager une chaîne d'empreintes dans un fichier que
 * l'utilisateur peut éditer — et la réimporter la reconstituerait, c'est-à-dire
 * la referait, ce qui lui ôterait sa valeur.
 *
 * C'est le modèle de `journal_audit`, qui n'est pas non plus une entité
 * ordinaire, et pour les mêmes raisons.
 *
 * ── ⚠️ CE QUE LA VÉRIFICATION PROUVE, ET CE QU'ELLE NE PROUVE PAS ───────────
 *
 * `GET` rend l'état de la chaîne. Il **ne protège pas contre le DBA système** —
 * `root` et le propriétaire de la base peuvent désactiver un déclencheur — il
 * rend son passage **détectable**. Le §12 le dit du journal d'audit ; il faut le
 * dire ici aussi, plutôt que de laisser croire à une garantie qui n'existe pas
 * (`CONVENTIONS.md` §17.5).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import { journaliser } from '../auth/journal.js';
import type { PerimetreSession } from '../db/pool.js';
import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN = '/api/main-courante/:incidentId';

/**
 * Plafond d'entrées rendues en une fois.
 *
 * ⚠️ Une main courante de crise longue en porte des centaines. Le plafond est
 * donc plus haut que celui des autres collections — et il existe quand même :
 * sans borne, une seule requête rend tout le récit de toutes les crises d'un
 * périmètre (constat Q-304).
 */
const ENTREES_MAX = 2000;

/** Le vocabulaire fermé de `ck_main_courante_categorie`, relevé dans la migration `041`. */
const CATEGORIES: ReadonlySet<string> = new Set([
  'constat',
  'decision',
  'action',
  'communication',
  'escalade',
  'cloture',
]);

/** Borne du texte, alignée sur `ck_main_courante_texte`. */
const TEXTE_MAX = 8000;

export interface OptionsCrise {
  readonly pool: Pool;
}

export async function greffonCrise(instance: FastifyInstance, options: OptionsCrise): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de main courante atteinte sans session appliquée',
      });
    }
    return session;
  };

  const filialeDEcriture = (perimetre: PerimetreSession): string => {
    if (perimetre.filialeId === null) {
      throw new ErreurApplicative({
        code: 'hors_perimetre',
        statut: 403,
        message:
          'Aucune filiale active : sélectionnez la filiale dont vous tenez la main courante.',
        detailJournal: `main courante sans filiale active pour ${perimetre.utilisateurId}`,
      });
    }
    return perimetre.filialeId;
  };

  const incidentDe = (requete: FastifyRequest): string => {
    const { incidentId } = requete.params as { incidentId?: string };
    if (incidentId === undefined || incidentId === '') {
      throw entreeInvalide('Incident non désigné.');
    }
    return incidentId;
  };

  const SCHEMA_PARAMS = {
    type: 'object',
    required: ['incidentId'],
    properties: { incidentId: { type: 'string', minLength: 1, maxLength: 64 } },
  };

  /* -------------------------------------------------------------------
   *  GET /api/main-courante/:incidentId
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN,
    {
      schema: { params: SCHEMA_PARAMS },
      config: { acces: { action: 'lire', domaine: 'continuite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      const incidentId = incidentDe(requete);

      const resultat = await avecTransaction(
        pool,
        perimetre,
        async (client) => {
          const entrees = await client.query(
            `select m.id, m.numero,
                    to_char(m.horodatage at time zone 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS"Z"') as horodatage,
                    m.auteur, m.auteur_libelle, m.categorie, m.texte, m.empreinte
               from main_courante m
              where m.incident_id = $1::text
              order by m.numero
              limit $2`,
            [incidentId, ENTREES_MAX],
          );

          // ⚠️ La vérification de la chaîne se joue DANS LA MÊME transaction que
          // la lecture : rendre des entrées d'un instant et un verdict d'un autre
          // laisserait un intervalle où l'un des deux est faux.
          const anomalies = await client.query(
            'select numero, anomalie, detail from f_main_courante_verifier($1::text)',
            [incidentId],
          );

          return {
            entrees: entrees.rows.map((l) => ({
              id: String(l.id),
              numero: Number(l.numero),
              horodatage: String(l.horodatage),
              auteur: String(l.auteur),
              auteurLibelle: l.auteur_libelle === null ? null : String(l.auteur_libelle),
              categorie: String(l.categorie),
              texte: String(l.texte),
              empreinte: String(l.empreinte),
            })),
            // `sain` est VRAI quand la chaîne ne porte aucune anomalie. ⚠️ Il ne
            // dit pas « personne n'a rien touché » : il dit « rien de ce qui se
            // détecte n'a eu lieu ». La nuance est écrite dans le commentaire de
            // `f_main_courante_verifier()`, et l'écran doit la porter aussi.
            sain: anomalies.rows.length === 0,
            anomalies: anomalies.rows.map((a) => ({
              numero: a.numero === null ? null : Number(a.numero),
              anomalie: String(a.anomalie),
              detail: String(a.detail),
            })),
            tronque: entrees.rows.length >= ENTREES_MAX,
          };
        },
        { lectureSeule: true },
      );

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/main-courante/:incidentId — AJOUTER, et rien d'autre
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN,
    {
      schema: { params: SCHEMA_PARAMS },
      config: { acces: { action: 'ecrire', domaine: 'continuite' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);
      const filialeId = filialeDEcriture(perimetre);
      const incidentId = incidentDe(requete);

      const corps = (requete.body ?? {}) as Record<string, unknown>;
      const texte = typeof corps.texte === 'string' ? corps.texte.trim() : '';
      const categorie = typeof corps.categorie === 'string' ? corps.categorie : 'constat';
      const auteurLibelle =
        typeof corps.auteur_libelle === 'string' ? corps.auteur_libelle.trim() : '';

      if (texte === '') {
        throw entreeInvalide(
          'Une entrée de main courante porte un texte : ce qui a été constaté, décidé ou fait.',
        );
      }
      if (texte.length > TEXTE_MAX) {
        throw entreeInvalide(
          `Cette entrée dépasse ${String(TEXTE_MAX)} caractères. Découpez-la en plusieurs ` +
            'entrées : elles resteront dans l’ordre.',
        );
      }
      if (!CATEGORIES.has(categorie)) {
        throw entreeInvalide('Catégorie inconnue pour une entrée de main courante.');
      }

      // ⚠️ NI `numero`, NI `horodatage`, NI `auteur`, NI les empreintes ne sont
      // nommés ici : le déclencheur de chaînage les écrase tous. Les nommer
      // donnerait à un appelant le moyen de forger une entrée cohérente — c'est
      // le constat N-5, et c'est ce qui distingue une preuve d'un formulaire.
      const creee = await avecTransaction(pool, perimetre, async (client) => {
        // ── ⚠️ L'INCIDENT EXISTE-T-IL ? CE N'EST PAS LE CLOISONNEMENT ────────
        //
        // La table ne porte **aucune clé étrangère** vers `incidents` : le récit
        // d'une crise doit survivre à la suppression de ce qu'il décrit (§12
        // point 3, la règle du journal d'audit). Rien n'empêcherait donc une faute
        // de frappe de créer un récit que personne ne retrouverait.
        //
        // Cette lecture est de la QUALITÉ DE DONNÉE, pas une barrière : le
        // cloisonnement est tenu par la RLS, et le refus ne distingue pas « il
        // n'existe pas » de « il n'est pas à vous » — trancher renseignerait sur
        // ce qui existe ailleurs.
        const cible = await client.query(
          'select 1 from incidents where id = $1::text limit 1',
          [incidentId],
        );
        if (cible.rowCount === 0) {
          throw new ErreurApplicative({
            code: 'ressource_inconnue',
            statut: 404,
            message: 'Cet incident n’existe pas dans votre périmètre.',
            detailJournal: `main courante sur incident absent du périmètre : ${incidentId}`,
          });
        }

        const insertion = await client.query<{ id: string; numero: number }>(
          `insert into main_courante (filiale_id, incident_id, categorie, texte, auteur_libelle)
                values ($1::text, $2::text, $3::text, $4::text, $5::text)
             returning id, numero`,
          [filialeId, incidentId, categorie, texte, auteurLibelle === '' ? null : auteurLibelle],
        );
        const ligne = insertion.rows[0];
        if (ligne === undefined) {
          throw new Error('insertion de main courante sans ligne rendue');
        }

        // ⚠️ Le journal d'audit enregistre l'ACTE, pas le texte : recopier le
        // contenu y ferait exister une seconde version de la même phrase, dans un
        // registre qui, lui, ne s'efface jamais — et la purge RGPD ne pourrait
        // plus atteindre l'une sans laisser l'autre.
        await journaliser(client, {
          action: 'creation',
          resume: 'Entrée ajoutée à la main courante de crise',
          utilisateurLibelle: perimetre.utilisateurId,
          filialeId,
          // ⚠️ `entiteType` doit appartenir au domaine `type_entite`. On nomme
          // l'INCIDENT, ce qui est vrai — l'entrée lui appartient — et évite
          // d'élargir le domaine pour une table qui n'est pas une entité
          // ordinaire (§40.1 s'applique aux tables qu'une route générique crée).
          entiteType: 'incidents',
          entiteId: incidentId,
          valeursApres: { numero: ligne.numero, categorie },
        });

        return { id: String(ligne.id), numero: Number(ligne.numero) };
      });

      return await reponse.status(201).send(creee);
    },
  );
}
