/**
 * `src/derogations/` — L'ÉTAT D'UNE DÉROGATION (lot L19, action 19.2)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/derogations/etat` | ce qui couvre, ce qui ne couvre plus, et pourquoi |
 *
 * ── ⚠️ UNE SEULE ROUTE, ET AUCUNE ÉCRITURE — C'EST VOULU ────────────────────
 *
 * Les dérogations sont une **entité ordinaire** (`src/entites/index.ts`) : elles
 * se créent, se modifient et se suppriment par les routes génériques, comme un
 * risque ou un document. Elles héritent donc du verrouillage optimiste, du
 * journal, du cloisonnement, de l'import généralisé et du round-trip
 * `grc-backup` **sans qu'une ligne soit écrite ici**. Un greffon d'écriture
 * propre aurait refait ces six choses, moins bien.
 *
 * Et leur approbation passe par le circuit du lot **L8**, inchangé :
 * `POST /api/approbations/derogations/:id`. Le quatrième `objet_type` a été
 * ajouté au vocabulaire (migration `035`), et rien d'autre.
 *
 * Ce qui manque à cet assemblage — et que rien d'autre ne peut rendre — est
 * **l'état** : cette dérogation couvre-t-elle encore l'écart, oui ou non ?
 *
 * ── POURQUOI L'ÉTAT NE PEUT PAS ÊTRE UNE COLONNE ────────────────────────────
 *
 * Parce qu'une colonne doit être écrite, et donc mise à jour. Un traitement
 * nocturne qui « repasse les dérogations échues en non-conformité » est un
 * traitement qui peut ne pas tourner — et le jour où il ne tourne pas, le
 * produit affirme une conformité qui n'existe plus, **en silence**, dans un outil
 * qui sert de preuve en audit ISO 27001.
 *
 * L'état est donc **dérivé à la lecture**, par `f_etat_derogation()` (migration
 * `035`), seul endroit où l'échéance est comparée à la date du jour. Une
 * dérogation échue cesse de couvrir à l'instant où le jour change, sans qu'aucun
 * code ne s'exécute — donc sans qu'aucun code ne puisse l'oublier.
 *
 * ── ET LA DÉCISION DU CIRCUIT N'EST PAS RECALCULÉE EN SQL ───────────────────
 *
 * L'ordre des étapes d'un circuit n'est **nulle part en base** : il vit dans
 * `src/approbations/circuit.ts`, qui sait que `proposition` précède
 * `acceptation`. Ce module appelle donc `decrireCircuit()` — la même fonction que
 * l'écran d'approbation — plutôt que d'écrire un second jugement en SQL. Deux
 * rédactions de la même règle divergent, et c'est la version faible qui l'emporte
 * (`CONVENTIONS.md` §33.3).
 *
 * ⚠️ **Y compris la PÉREMPTION.** Modifier le motif ou l'échéance d'une
 * dérogation déjà acceptée périme son circuit : l'empreinte figée par la décision
 * ne correspond plus au contenu. Le produit dit alors « en attente » et non « en
 * vigueur » — c'est-à-dire que **rallonger une dérogation sans la faire
 * réapprouver ne la rallonge pas**. C'est la propriété qui empêche l'écart
 * assumé de devenir l'écart oublié, et elle vient gratuitement du lot L8.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { LigneApprobation } from '../approbations/circuit.js';
import { decrireCircuit } from '../approbations/circuit.js';
import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_ETAT = '/api/derogations/etat';

/**
 * Plafond de dérogations examinées en une fois.
 *
 * ⚠️ Ce n'est pas un confort : sans lui, la route rend le registre entier des
 * écarts assumés du périmètre — c'est-à-dire, pour une session de portée Groupe,
 * la carte des faiblesses connues de vingt filiales. C'est une voie d'extraction
 * autant qu'un déni de service applicatif (contrôle S13).
 */
const DEROGATIONS_MAX = 500;

/** Les colonnes retirées avant le calcul de l'empreinte — voir `src/approbations`. */
const COLONNES_HORS_EMPREINTE: readonly string[] = Object.freeze([
  'version',
  'cree_le',
  'cree_par',
  'modifie_le',
  'modifie_par',
]);

export interface OptionsDerogations {
  readonly pool: Pool;
}

export async function greffonDerogations(
  instance: FastifyInstance,
  options: OptionsDerogations,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de dérogation atteinte sans session appliquée',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/derogations/etat
   * -------------------------------------------------------------------
   *  Pour chaque dérogation du périmètre : son état dérivé, l'exigence
   *  qu'elle vise, et l'état de son circuit d'approbation.
   *
   *  ⚠️ Aucune filiale n'est nommée : c'est la RLS qui borne. Une session de
   *  portée Groupe voit donc les écarts assumés de toutes ses filiales — ce
   *  qu'une revue de direction vient précisément chercher.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        // `set local` : le réglage meurt avec la transaction. `to_jsonb` rend un
        // timestamptz dans le fuseau de la session — sans cela, l'empreinte
        // dépendrait du fuseau de qui la calcule, et une décision paraîtrait
        // périmée d'un poste à l'autre. Même motif que `src/approbations`.
        await client.query("set local timezone to 'UTC'");

        const lignes = await client.query(
          `select d.id, d.filiale_id, d.exigence_id, d.proprietaire, d.motif,
                  d.accordee_le, d.echeance, d.compensation, d.version,
                  e.code     as exigence_code,
                  e.intitule as exigence_intitule,
                  e.statut_conformite,
                  encode(sha256(convert_to(
                      (to_jsonb(d.*) - $1::text[])::text, 'UTF8')), 'hex') as empreinte
             from derogations d
             join exigences e
                  on e.id = d.exigence_id and e.filiale_id = d.filiale_id
            order by d.echeance desc
            limit $2`,
          [[...COLONNES_HORS_EMPREINTE], DEROGATIONS_MAX],
        );

        if (lignes.rows.length === 0) {
          return {
            derogations: [],
            tronque: false,
            // Ce que l'écran doit pouvoir dire quand il ne montre rien : un vide
            // sans explication apprend à ne plus croire ce qu'on montre.
            motif:
              'Aucune dérogation n’est enregistrée dans votre périmètre. Une dérogation sert ' +
              'à assumer un écart de conformité pour une durée bornée, avec un propriétaire, ' +
              'un motif et une approbation.',
          };
        }

        // Les étapes d'approbation de TOUTES ces dérogations, en une requête.
        // ⚠️ `filiale_id` entre dans l'appariement : `objet_id` est un rattachement
        // polymorphe, et l'unicité de `approbations` commence par la filiale
        // (constat Q-2) — deux filiales peuvent porter chacune une étape désignant
        // le même identifiant, et c'est voulu.
        const etapes = await client.query(
          `select a.objet_id, a.filiale_id, a.id, a.etape, a.ordre, a.statut,
                  a.acteur_id, a.acteur_libelle, a.date_decision, a.commentaire,
                  a.version_objet, a.empreinte_objet
             from approbations a
            where a.objet_type = 'derogation'
              and a.objet_id = any ($1::text[])
            order by a.ordre, a.cree_le`,
          [lignes.rows.map((l) => String(l.id))],
        );

        const parObjet = new Map<string, LigneApprobation[]>();
        for (const e of etapes.rows) {
          const cle = `${String(e.objet_id)} ${String(e.filiale_id)}`;
          const liste = parObjet.get(cle) ?? [];
          liste.push({
            id: String(e.id),
            etape: e.etape,
            ordre: Number(e.ordre),
            statut: e.statut,
            acteurId: e.acteur_id === null ? null : String(e.acteur_id),
            acteurLibelle: e.acteur_libelle === null ? null : String(e.acteur_libelle),
            dateDecision: e.date_decision === null ? null : String(e.date_decision),
            commentaire: e.commentaire === null ? null : String(e.commentaire),
            versionObjet: e.version_objet === null ? null : String(e.version_objet),
            empreinteObjet: e.empreinte_objet === null ? null : String(e.empreinte_objet),
          });
          parObjet.set(cle, liste);
        }

        // L'état de chaque circuit, puis l'état de chaque dérogation — et c'est
        // la BASE qui rend le second, jamais ce fichier.
        const decisions: (string | null)[] = [];
        const circuits: { etat: string; etapeAttendue: string | null }[] = [];
        for (const l of lignes.rows) {
          const cle = `${String(l.id)} ${String(l.filiale_id)}`;
          const circuit = decrireCircuit('derogation', parObjet.get(cle) ?? [], String(l.empreinte));
          circuits.push({ etat: circuit.etat, etapeAttendue: circuit.etapeAttendue });
          // ⚠️ Seul un circuit **complet ET à jour** vaut « approuve ». Un circuit
          // « perime » — l'objet a changé depuis la décision — ne vaut rien : c'est
          // ce qui empêche de rallonger une dérogation sans la faire réapprouver.
          decisions.push(
            circuit.etat === 'complet' ? 'approuve' : circuit.etat === 'refuse' ? 'refuse' : null,
          );
        }

        const etats = await client.query<{ etat: string }>(
          `select f_etat_derogation(t.echeance, t.decision) as etat
             from unnest($1::date[], $2::text[]) with ordinality as t(echeance, decision, rang)
            order by t.rang`,
          [lignes.rows.map((l) => l.echeance), decisions],
        );

        return {
          derogations: lignes.rows.map((l, i) => ({
            id: String(l.id),
            exigenceId: String(l.exigence_id),
            exigenceCode: String(l.exigence_code),
            exigenceIntitule: String(l.exigence_intitule),
            statutConformite: String(l.statut_conformite),
            proprietaire: String(l.proprietaire),
            motif: String(l.motif),
            compensation: l.compensation === null ? null : String(l.compensation),
            accordeeLe: String(l.accordee_le),
            echeance: String(l.echeance),
            // ⚠️ Rendu par la BASE (`f_etat_derogation`), pas calculé ici : une
            // seconde comparaison de dates dériverait dès que l'horloge du serveur
            // applicatif et celle de la base diffèrent — ce qui arrive.
            etat: String(etats.rows[i]?.etat ?? 'en_attente'),
            circuit: circuits[i]?.etat ?? 'en_cours',
            etapeAttendue: circuits[i]?.etapeAttendue ?? null,
          })),
          tronque: lignes.rows.length >= DEROGATIONS_MAX,
          motif: '',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );
}
