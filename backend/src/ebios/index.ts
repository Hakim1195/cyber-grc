/**
 * `src/ebios/` — LA PERTINENCE D'UN COUPLE SOURCE / OBJECTIF (lot L25, action 25.1)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/ebios/etat` | où en est chaque étude, et **tout ce que la base DÉRIVE** de ses ateliers |
 *
 * Quatre grandeurs, et pas une n'est rangée en colonne :
 *
 *  · la **pertinence** d'un couple source / objectif (atelier 2) ;
 *  · le **niveau de menace** d'une partie prenante (atelier 3) ;
 *  · la **gravité** d'un scénario stratégique — celle de l'événement redouté
 *    qu'il réalise, remontée par la jointure ;
 *  · le **niveau** d'un scénario opérationnel (gravité × vraisemblance).
 *
 * ── ⚠️ UNE SEULE ROUTE, ET AUCUNE ÉCRITURE — C'EST VOULU ────────────────────
 *
 * Les cinq tables d'EBIOS RM sont des **entités ordinaires**
 * (`src/entites/index.ts`) : elles se créent, se modifient et se suppriment par
 * les routes génériques, comme un risque ou un document. Elles héritent donc du
 * verrouillage optimiste, du journal, du cloisonnement, de l'import généralisé
 * et du round-trip `grc-backup` **sans qu'une ligne soit écrite ici**. Un
 * greffon d'écriture propre aurait refait ces cinq choses, moins bien — c'est
 * l'arbitrage rendu pour les dérogations (19.2), reconduit à l'AIPD (20.3), aux
 * demandes de droits (20.4) et aux campagnes (24.1).
 *
 * Ce qui manque à cet assemblage, et que rien d'autre ne peut rendre, est la
 * **pertinence** d'un couple source de risque / objectif visé.
 *
 * ── POURQUOI LA PERTINENCE NE PEUT PAS ÊTRE UNE COLONNE ─────────────────────
 *
 * Parce qu'une colonne doit être écrite, et donc remise à jour. L'animateur de
 * l'atelier 2 révise la motivation d'une source en séance ; si la pertinence
 * était rangée, quelque chose devrait repasser derrière lui. Et le jour où ce
 * quelque chose ne repasse pas, l'atelier classe ses couples sur une note
 * périmée — **en silence**, dans le document qui décide de ce que les ateliers 3
 * et 4 examineront.
 *
 * Elle est donc dérivée à la lecture par `f_ebios_pertinence()` (migration
 * `046`), seul endroit du produit où les trois critères sont moyennés. Une
 * seconde rédaction — un `case` dans une requête, une moyenne dans le
 * navigateur — se mettrait à diverger au premier ajustement : c'est le constat
 * **Q-219** à l'échelle d'un chiffre, et il a déjà coûté quatre fois au chantier.
 *
 * ── ⚠️ ET CE QUE CETTE ROUTE NE FAIT PAS : DÉCIDER ──────────────────────────
 *
 * La pertinence est une **suggestion**. Retenir un couple engage toute la suite
 * de l'étude — les ateliers 3 et 4 ne travaillent que sur les couples retenus —
 * et c'est `retenue`, saisie par un humain et justifiée (contrainte
 * `ck_ebios_sources_risque_retenue`), qui le fait.
 *
 * La route ne filtre donc RIEN sur un seuil : elle rend tous les couples avec
 * leur note, et laisse l'écran les ordonner. Un produit qui écarterait tout seul
 * les couples sous un seuil ferait porter à une moyenne une décision
 * d'analyse — et le ferait sans que personne le lise.
 *
 * ⚠️ Et la suggestion **se tait dès qu'un critère manque** : `f_ebios_pertinence`
 * rend `null`, jamais une moyenne des deux autres. C'est le critère 25.4, écrit
 * pour la quantification financière et qui vaut ici mot pour mot — *un chiffre
 * qui a l'air mesuré sans l'être est pire que pas de chiffre, parce qu'il est
 * cité en comité de direction*.
 *
 * ── LE CLOISONNEMENT ────────────────────────────────────────────────────────
 *
 * ⚠️ Aucune requête ne nomme de filiale : c'est la **RLS** qui borne, comme dans
 * `/api/consolidation`. Une session de portée Groupe voit donc l'avancement des
 * études de ses filiales — ce qu'une revue de direction vient chercher — et une
 * session de filiale ne voit que les siennes, sans qu'un `if` de ce fichier ait
 * à le décider.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_ETAT = '/api/ebios/etat';

/**
 * Plafond d'études et de couples examinés en une fois.
 *
 * ⚠️ Ce n'est pas un confort. Sans lui, une session de portée Groupe rend les
 * ateliers de vingt filiales en une réponse : c'est une voie d'extraction autant
 * qu'un déni de service applicatif (contrôle S13), et c'est la borne que le
 * constat **Q-304** a réclamée pour les sept collections qui l'avaient perdue.
 */
const ETUDES_MAX = 200;
const COUPLES_MAX = 1000;
const PARTIES_MAX = 1000;
const SCENARIOS_MAX = 1000;

export interface OptionsEbios {
  readonly pool: Pool;
}

export async function greffonEbios(
  instance: FastifyInstance,
  options: OptionsEbios,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route d'atelier EBIOS RM atteinte sans session appliquée",
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/ebios/etat
   * -------------------------------------------------------------------
   *  Deux listes : les études avec ce qu'elles contiennent DÉJÀ, et les
   *  couples source/objectif avec leur pertinence suggérée.
   *
   *  ⚠️ Les comptes sont COMPTÉS, jamais rangés — même arbitrage que
   *  l'avancement d'une campagne (24.1). Une colonne « nombre de valeurs
   *  métier » serait fausse le jour où un traitement ne repasse pas.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'risques' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => {
          const etudes = await client.query(
            `select e.id, e.filiale_id, e.nom, e.statut, e.responsable,
                    e.debut_le, e.validee_le,
                    (select count(*)::int from ebios_valeurs_metier v
                      where v.etude_id = e.id) as valeurs_metier,
                    (select count(*)::int from ebios_evenements_redoutes r
                       join ebios_valeurs_metier v on v.id = r.valeur_metier_id
                      where v.etude_id = e.id) as evenements_redoutes,
                    -- ⚠️ La gravité la plus HAUTE, et non une moyenne : une
                    -- moyenne de gravités dilue l'événement catastrophique dans
                    -- les anodins, et c'est lui qui commande l'analyse.
                    (select max(r.gravite) from ebios_evenements_redoutes r
                       join ebios_valeurs_metier v on v.id = r.valeur_metier_id
                      where v.etude_id = e.id) as gravite_max,
                    (select count(*)::int from ebios_sources_risque s
                      where s.etude_id = e.id) as sources,
                    (select count(*)::int from ebios_sources_risque s
                      where s.etude_id = e.id and s.retenue) as sources_retenues
               from ebios_etudes e
              order by e.debut_le desc, e.id
              limit $1`,
            [ETUDES_MAX],
          );

          const couples = await client.query(
            `select s.id, s.etude_id, s.source, s.objectif_vise, s.connaissance_id,
                    s.motivation, s.ressources, s.activite, s.retenue, s.justification,
                    -- ⚠️ Rendue par la BASE, jamais recalculée ici. Une seconde
                    -- moyenne — dans cette route, dans le navigateur — divergerait
                    -- au premier ajustement de la règle, et deux comptes de la même
                    -- grandeur est ce qu'un outil produit en audit ne peut pas se
                    -- permettre (constat Q-219).
                    f_ebios_pertinence(s.motivation, s.ressources, s.activite) as pertinence
               from ebios_sources_risque s
              order by s.retenue desc,
                       f_ebios_pertinence(s.motivation, s.ressources, s.activite)
                         desc nulls last,
                       s.source
              limit $1`,
            [COUPLES_MAX],
          );

          // ── Atelier 3 : l'écosystème, et le niveau de menace DÉRIVÉ ──────
          const parties = await client.query(
            `select p.id, p.etude_id, p.nom, p.categorie, p.prestataire_id,
                    p.dependance, p.penetration, p.maturite, p.confiance,
                    -- ⚠️ Rendu par la BASE (f_ebios_niveau_menace), jamais recalculé ici
                    -- ni dans le navigateur : deux rédactions divergeraient au premier
                    -- ajustement de la règle (constat Q-219).
                    f_ebios_niveau_menace(p.dependance, p.penetration,
                                          p.maturite, p.confiance) as niveau_menace
               from ebios_parties_prenantes p
              order by f_ebios_niveau_menace(p.dependance, p.penetration,
                                             p.maturite, p.confiance) desc nulls last,
                       p.nom
              limit $1`,
            [PARTIES_MAX],
          );

          // ── Atelier 3 : les chemins, dont la GRAVITÉ vient de la jointure ──
          //
          // ⚠️ `join` et non `left join` : les deux clés sont `not null` et composites,
          // et un chemin sans source ni événement redouté n'existe pas. Un `left join`
          // laisserait croire le contraire, et rendrait des lignes qu'aucun écran ne
          // saurait afficher.
          const strategiques = await client.query(
            `select s.id, s.etude_id, s.nom, s.chemin,
                    s.source_id, r.source, r.objectif_vise,
                    s.evenement_redoute_id, e.nom as evenement_redoute, e.gravite,
                    s.partie_prenante_id, p.nom as partie_prenante
               from ebios_scenarios_strategiques s
               join ebios_sources_risque r on r.id = s.source_id
               join ebios_evenements_redoutes e on e.id = s.evenement_redoute_id
               left join ebios_parties_prenantes p on p.id = s.partie_prenante_id
              order by e.gravite desc nulls last, s.nom
              limit $1`,
            [SCENARIOS_MAX],
          );

          // ── Atelier 4 et 5 : le mode opératoire, son niveau, sa décision ───
          const operationnels = await client.query(
            `select o.id, o.scenario_strategique_id, s.etude_id, o.nom, o.mode_operatoire,
                    o.actif_id, o.vraisemblance, o.decision, o.justification_decision,
                    o.risque_id, e.gravite,
                    -- Gravité du chemin × vraisemblance du mode opératoire, dérivées
                    -- toutes deux : la première par la jointure, la seconde par la
                    -- fonction. Aucune n'est rangée.
                    f_ebios_niveau_scenario(e.gravite, o.vraisemblance) as niveau
               from ebios_scenarios_operationnels o
               join ebios_scenarios_strategiques s on s.id = o.scenario_strategique_id
               join ebios_evenements_redoutes e on e.id = s.evenement_redoute_id
              order by f_ebios_niveau_scenario(e.gravite, o.vraisemblance) desc nulls last,
                       o.nom
              limit $1`,
            [SCENARIOS_MAX],
          );

          return {
            etudes: etudes.rows.map((l) => ({
              id: String(l.id),
              nom: String(l.nom),
              statut: String(l.statut),
              responsable: l.responsable === null ? null : String(l.responsable),
              debutLe: l.debut_le === null ? null : String(l.debut_le),
              valideeLe: l.validee_le === null ? null : String(l.validee_le),
              valeursMetier: Number(l.valeurs_metier ?? 0),
              evenementsRedoutes: Number(l.evenements_redoutes ?? 0),
              graviteMax: l.gravite_max === null ? null : Number(l.gravite_max),
              sources: Number(l.sources ?? 0),
              sourcesRetenues: Number(l.sources_retenues ?? 0),
            })),
            couples: couples.rows.map((l) => ({
              id: String(l.id),
              etudeId: String(l.etude_id),
              source: String(l.source),
              objectifVise: String(l.objectif_vise),
              connaissanceId: l.connaissance_id === null ? null : String(l.connaissance_id),
              motivation: l.motivation === null ? null : Number(l.motivation),
              ressources: l.ressources === null ? null : Number(l.ressources),
              activite: l.activite === null ? null : Number(l.activite),
              // ⚠️ « suggérée », et le mot est dans le nom du champ : l'écran ne
              // doit pas pouvoir l'afficher comme une décision par mégarde. Même
              // précaution que `presumeeRequise` de l'AIPD (20.3).
              pertinenceSuggeree: l.pertinence === null ? null : Number(l.pertinence),
              retenue: l.retenue === true,
              justification: l.justification === null ? null : String(l.justification),
            })),
            partiesPrenantes: parties.rows.map((l) => ({
              id: String(l.id),
              etudeId: String(l.etude_id),
              nom: String(l.nom),
              categorie: String(l.categorie),
              prestataireId: l.prestataire_id === null ? null : String(l.prestataire_id),
              dependance: l.dependance === null ? null : Number(l.dependance),
              penetration: l.penetration === null ? null : Number(l.penetration),
              maturite: l.maturite === null ? null : Number(l.maturite),
              confiance: l.confiance === null ? null : Number(l.confiance),
              // ⚠️ Rendu par la BASE. Le mot « suggéré » n'y est pas, et c'est une
              // différence avec la pertinence d'un couple : celui-ci est un CALCUL de la
              // méthode — exposition rapportée à la fiabilité —, pas une aide au
              // jugement. Ce qui reste humain ici, c'est la cotation des quatre critères.
              niveauMenace: l.niveau_menace === null ? null : Number(l.niveau_menace),
            })),
            scenariosStrategiques: strategiques.rows.map((l) => ({
              id: String(l.id),
              etudeId: String(l.etude_id),
              nom: String(l.nom),
              sourceId: String(l.source_id),
              source: String(l.source),
              objectifVise: String(l.objectif_vise),
              evenementRedouteId: String(l.evenement_redoute_id),
              evenementRedoute: String(l.evenement_redoute),
              // ⚠️ La gravité vient de l'ÉVÉNEMENT REDOUTÉ, par la jointure — jamais
              // d'une colonne du scénario. Une colonne créerait une seconde réponse à la
              // même question, qui vieillirait à la prochaine réévaluation de l'atelier 1.
              gravite: l.gravite === null ? null : Number(l.gravite),
              partiePrenanteId: l.partie_prenante_id === null ? null : String(l.partie_prenante_id),
              partiePrenante: l.partie_prenante === null ? null : String(l.partie_prenante),
              chemin: l.chemin === null ? null : String(l.chemin),
            })),
            scenariosOperationnels: operationnels.rows.map((l) => ({
              id: String(l.id),
              scenarioStrategiqueId: String(l.scenario_strategique_id),
              etudeId: String(l.etude_id),
              nom: String(l.nom),
              modeOperatoire: l.mode_operatoire === null ? null : String(l.mode_operatoire),
              actifId: l.actif_id === null ? null : String(l.actif_id),
              vraisemblance: l.vraisemblance === null ? null : Number(l.vraisemblance),
              // La gravité du chemin stratégique, remontée par la jointure — même motif.
              gravite: l.gravite === null ? null : Number(l.gravite),
              niveau: l.niveau === null ? null : String(l.niveau),
              decision: l.decision === null ? null : String(l.decision),
              justificationDecision:
                l.justification_decision === null ? null : String(l.justification_decision),
              risqueId: l.risque_id === null ? null : String(l.risque_id),
            })),
            tronque:
              etudes.rows.length >= ETUDES_MAX ||
              couples.rows.length >= COUPLES_MAX ||
              parties.rows.length >= PARTIES_MAX ||
              strategiques.rows.length >= SCENARIOS_MAX ||
              operationnels.rows.length >= SCENARIOS_MAX,
          };
        },
        { lectureSeule: true },
      );

      return await reponse.status(200).send(resultat);
    },
  );
}
