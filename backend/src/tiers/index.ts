/**
 * `src/tiers/` — LE REGISTRE D'INFORMATION DORA ET LE RISQUE FOURNISSEUR
 * (lot L21, actions 21.1, 21.3 et 21.4)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/tiers/bareme` | les poids du score, pour que l'écran ne les recopie pas |
 * | `GET` | `/api/tiers/etat` | par tiers : score composite, niveau, contrat, profondeur de chaîne |
 * | `GET` | `/api/tiers/chaine/:id` | la chaîne de sous-traitance d'un tiers, avec ses RANGS dérivés |
 * | `GET` | `/api/tiers/registre-dora` | le registre d'information, prêt à être remis |
 * | `GET` | `/api/tiers/questionnaires` | où en est chaque questionnaire envoyé — état DÉRIVÉ |
 *
 * ── ⚠️ AUCUNE ÉCRITURE ICI, ET C'EST VOULU ─────────────────────────────────
 *
 * Les prestataires et leurs arêtes de sous-traitance sont des **entités
 * ordinaires** (`src/entites/index.ts`) : elles se créent, se modifient et se
 * suppriment par les routes génériques, comme un risque ou un document. Elles
 * héritent donc du verrouillage optimiste, du journal, du cloisonnement, de
 * l'import généralisé (L7) et du round-trip `grc-backup` **sans qu'une ligne
 * soit écrite ici**. Un greffon d'écriture propre aurait refait ces six choses,
 * moins bien — c'est l'arbitrage des dérogations (19.2), et il vaut mot pour mot.
 *
 * Ce qui manque à cet assemblage, et que rien d'autre ne peut rendre, tient en
 * trois questions :
 *
 *   · *quel risque ce tiers me fait-il porter, AUJOURD'HUI ?* — le score
 *     composite de l'action 21.4, dont deux des quatre facteurs bougent tout
 *     seuls ;
 *   · *qui travaille derrière lui ?* — la chaîne de l'article 29 de DORA, dont
 *     le rang se dérive ;
 *   · *qu'est-ce que je remets à l'autorité ?* — le registre d'information.
 *
 * ── POURQUOI LE SCORE NE PEUT PAS ÊTRE UNE COLONNE ─────────────────────────
 *
 * Parce qu'une colonne doit être écrite, et donc remise à jour. Deux de ses
 * quatre facteurs changent **sans qu'aucune écriture ait lieu** : l'ancienneté
 * de la dernière évaluation vieillit d'un jour par jour, et la couverture des
 * exigences de chaîne dépend d'un sac `supply_chain` qu'une autre saisie peut
 * modifier. Un score rangé serait donc faux dès le lendemain, et il le serait
 * **en silence** — dans l'outil qui sert de preuve en audit.
 *
 * Il est donc **dérivé à la lecture**, par `f_score_prestataire()` (migration
 * `042`), seul endroit du produit où ces quatre facteurs se combinent.
 *
 * ── ET LE BARÈME EST SERVI, PAS RECOPIÉ ────────────────────────────────────
 *
 * `js/modules/pra_prestataires.js` portait depuis le premier chantier `CRIT_W`
 * et `ACCES_W` — les mêmes poids, écrits une seconde fois. Tant que le score
 * était un produit de deux facteurs, la duplication était visible et inoffensive.
 * À quatre facteurs, dont deux que le navigateur ne connaît pas, elle cesse de
 * l'être. `GET /api/tiers/bareme` rend donc les poids, et l'écran calcule son
 * aperçu AVEC eux (`CLAUDE.md` §3 : *on découvre, on ne recopie pas*).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_BAREME = '/api/tiers/bareme';
export const CHEMIN_ETAT = '/api/tiers/etat';
export const CHEMIN_CHAINE = '/api/tiers/chaine/:id';
export const CHEMIN_REGISTRE = '/api/tiers/registre-dora';
export const CHEMIN_QUESTIONNAIRES = '/api/tiers/questionnaires';

/**
 * Plafond de tiers examinés en une fois.
 *
 * ⚠️ Ce n'est pas un confort. Sans lui, la route rend, pour une session de
 * portée Groupe, **la carte complète des fournisseurs de vingt filiales avec
 * leurs faiblesses classées par gravité** — c'est-à-dire exactement le document
 * qu'un concurrent ou un attaquant viendrait chercher. C'est une voie
 * d'extraction autant qu'un déni de service applicatif (contrôle S13), et le
 * plafond est DIT à l'appelant (`tronque`), jamais tu.
 */
const TIERS_MAX = 500;

/** Les six exigences de chaîne d'approvisionnement (NIS2 art. 21 / DORA). */
const EXIGENCES_CHAINE = Object.freeze([
  'clause',
  'notif',
  'audit',
  'donnees',
  'reversibilite',
  'continuite',
]);

export interface OptionsTiers {
  readonly pool: Pool;
}

/** Part des exigences de chaîne satisfaites, ou `null` si le sac est absent. */
function couvertureDe(sac: unknown): number | null {
  if (sac === null || typeof sac !== 'object' || Array.isArray(sac)) return null;
  const cases = sac as Record<string, unknown>;
  // ⚠️ **Un sac VIDE rend `null`, pas zéro**, et la nuance est le cœur du sujet :
  // « aucune case cochée » et « personne n'a encore regardé » n'appellent pas la
  // même réaction, et le score les traite différemment — une couverture inconnue
  // ne retranche rien, elle ne protège pas. C'est la règle de
  // `/api/consolidation` (« null, jamais zéro ») appliquée à un ratio.
  if (Object.keys(cases).length === 0) return null;
  const satisfaites = EXIGENCES_CHAINE.filter((nom) => cases[nom] === true).length;
  return satisfaites / EXIGENCES_CHAINE.length;
}

export async function greffonTiers(
  instance: FastifyInstance,
  options: OptionsTiers,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de tiers atteinte sans session appliquée',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/tiers/bareme
   * -------------------------------------------------------------------
   *  Les poids du score composite, tels que la BASE les tient. L'écran s'en
   *  sert pour son aperçu en cours de saisie — un enregistrement qui n'existe
   *  pas encore ne peut pas être scoré par le serveur.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_BAREME,
    { config: { acces: { action: 'lire', domaine: 'tiers' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const bareme = await avecTransaction(pool, session.perimetre, async (client) => {
        const r = await client.query<{ bareme: unknown }>('select f_bareme_prestataire() as bareme');
        return r.rows[0]?.bareme ?? null;
      });
      return await reponse.status(200).send({
        bareme,
        // Les six exigences de chaîne, servies elles aussi : l'écran les affiche
        // déjà avec leurs libellés, mais c'est le SERVEUR qui décide ce qui entre
        // dans le calcul de la couverture. Deux listes divergeraient.
        exigencesChaine: [...EXIGENCES_CHAINE],
      });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/tiers/etat
   * -------------------------------------------------------------------
   *  Pour chaque tiers du périmètre : son score composite, son niveau, l'état
   *  de son contrat et la profondeur de sa chaîne de sous-traitance.
   *
   *  ⚠️ Aucune filiale n'est nommée : c'est la RLS qui borne. Une session de
   *  portée Groupe voit donc les tiers de toutes ses filiales — ce qu'une revue
   *  de direction et un exercice DORA viennent précisément chercher.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'tiers' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        await client.query("set local timezone to 'UTC'");

        const lignes = await client.query(
          // ⚠️ **Les dates sortent en `::text`, donc en ISO `AAAA-MM-JJ`.** Le
          // pilote `pg` rend un objet `Date` pour une colonne `date`, et
          // `String(unDate)` donne une chaîne dépendante de la locale, du fuseau
          // et de la version de Node. Le cast appartient à la BASE, une fois,
          // pas à chaque lecteur (leçon de l'action 19.2).
          `select p.id, p.filiale_id, p.societe, p.type, p.criticite, p.acces,
                  p.supply_chain, p.lei, p.pays, p.pays_donnees,
                  p.fonction_supportee, p.fonction_critique, p.type_service,
                  p.substituabilite, p.contrat_reference,
                  p.contrat_debut::text    as contrat_debut,
                  p.contrat_fin::text      as contrat_fin,
                  p.contrat_revue_le::text as contrat_revue_le,
                  p.plan_sortie, p.plan_sortie_le::text as plan_sortie_le,
                  p.evalue_le::text as evalue_le,
                  -- La profondeur de la chaîne, DÉRIVÉE. « coalesce(max(rang), 0) » :
                  -- un tiers sans sous-traitant a une chaîne de profondeur zéro, ce
                  -- qui n'est pas la même chose qu'une chaîne inconnue.
                  (select coalesce(max(c.rang), 0)
                     from f_chaine_sous_traitance(p.filiale_id, p.id) c) as profondeur,
                  (select count(*)::int
                     from f_chaine_sous_traitance(p.filiale_id, p.id) c
                    where c.rang = 1) as sous_traitants_directs,
                  (select bool_or(c.cycle_detecte)
                     from f_chaine_sous_traitance(p.filiale_id, p.id) c) as cycle_detecte
             from prestataires p
            order by p.societe
            limit $1`,
          [TIERS_MAX],
        );

        if (lignes.rows.length === 0) {
          return {
            tiers: [],
            tronque: false,
            // Ce que l'écran doit pouvoir dire quand il ne montre rien : un vide
            // sans explication apprend à ne plus croire ce qu'on montre
            // (classe des constats Q-201 / Q-207).
            motif:
              'Aucun prestataire n’est enregistré dans votre périmètre. Le registre ' +
              'd’information DORA se construit à partir de cette liste : chaque tiers y ' +
              'porte son identifiant LEI, la fonction qu’il soutient, son contrat et sa ' +
              'chaîne de sous-traitance.',
          };
        }

        // Le score est rendu par la BASE — une seconde combinaison des quatre
        // facteurs, écrite ici, divergerait au premier ajustement du barème, et
        // la comparaison des dates dépendrait de l'horloge du serveur applicatif
        // plutôt que de celle de la base.
        const couvertures = lignes.rows.map((l) => couvertureDe(l.supply_chain));
        const scores = await client.query<{ score: number | null; niveau: string }>(
          `select f_score_prestataire(t.criticite, t.acces, t.substituabilite,
                                      t.couverture, t.evalue_le) as score,
                  f_niveau_prestataire(
                      f_score_prestataire(t.criticite, t.acces, t.substituabilite,
                                          t.couverture, t.evalue_le)) as niveau
             from unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::date[])
                  with ordinality as t(criticite, acces, substituabilite, couverture,
                                       evalue_le, rang)
            order by t.rang`,
          [
            lignes.rows.map((l) => l.criticite),
            lignes.rows.map((l) => l.acces),
            lignes.rows.map((l) => l.substituabilite),
            couvertures,
            lignes.rows.map((l) => l.evalue_le),
          ],
        );

        return {
          tiers: lignes.rows.map((l, i) => ({
            id: String(l.id),
            societe: String(l.societe),
            type: l.type === null ? null : String(l.type),
            criticite: l.criticite === null ? null : String(l.criticite),
            acces: l.acces === null ? null : String(l.acces),
            substituabilite: l.substituabilite === null ? null : String(l.substituabilite),
            couverture: couvertures[i],
            evalueLe: l.evalue_le === null ? null : String(l.evalue_le),
            lei: l.lei === null ? null : String(l.lei),
            pays: l.pays === null ? null : String(l.pays),
            paysDonnees: l.pays_donnees === null ? null : String(l.pays_donnees),
            fonctionSupportee:
              l.fonction_supportee === null ? null : String(l.fonction_supportee),
            fonctionCritique: l.fonction_critique === true,
            typeService: l.type_service === null ? null : String(l.type_service),
            contratReference: l.contrat_reference === null ? null : String(l.contrat_reference),
            contratDebut: l.contrat_debut === null ? null : String(l.contrat_debut),
            contratFin: l.contrat_fin === null ? null : String(l.contrat_fin),
            contratRevueLe: l.contrat_revue_le === null ? null : String(l.contrat_revue_le),
            planSortie: l.plan_sortie === null ? null : String(l.plan_sortie),
            planSortieLe: l.plan_sortie_le === null ? null : String(l.plan_sortie_le),
            profondeurChaine: Number(l.profondeur ?? 0),
            sousTraitantsDirects: Number(l.sous_traitants_directs ?? 0),
            // ⚠️ Vrai seulement si un cycle EXISTE DÉJÀ en base — arrivé par une
            // reprise antérieure à la migration `042`. L'écran doit le dire :
            // une chaîne cyclique est tronquée à la lecture, et un registre
            // silencieusement amputé est pire qu'un registre absent.
            cycleDetecte: l.cycle_detecte === true,
            // Rendus par la BASE (`f_score_prestataire`), jamais calculés ici.
            score: scores.rows[i]?.score ?? null,
            niveau: scores.rows[i]?.niveau ?? 'non_evalue',
          })),
          tronque: lignes.rows.length >= TIERS_MAX,
          motif: '',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/tiers/chaine/:id
   * -------------------------------------------------------------------
   *  La chaîne de sous-traitance d'un tiers, avec le RANG de chaque maillon —
   *  dérivé, jamais rangé (action 21.1, DORA article 29).
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_CHAINE,
    { config: { acces: { action: 'lire', domaine: 'tiers' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const identifiant = String((requete.params as { id?: unknown }).id ?? '');

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        // ⚠️ **La filiale du tiers est LUE, jamais reçue.** La croire sur parole
        // rouvrirait un oracle d'existence inter-filiales : il suffirait
        // d'envoyer la filiale qui arrange pour interroger la chaîne d'un tiers
        // qu'on ne voit pas. C'est la RLS qui répond ici — si la ligne n'est pas
        // lisible, la requête ne rend rien, et l'on répond « introuvable » sans
        // distinguer « n'existe pas » de « pas à vous ».
        const tiers = await client.query<{ filiale_id: string; societe: string }>(
          'select filiale_id, societe from prestataires where id = $1',
          [identifiant],
        );
        const ligne = tiers.rows[0];
        if (ligne === undefined) {
          return null;
        }

        const maillons = await client.query(
          `select c.sous_traitant_id, c.rang, c.chemin, c.cycle_detecte,
                  p.societe, p.pays, p.lei,
                  a.service, a.dans_fonction_critique
             from f_chaine_sous_traitance($1, $2) c
             join prestataires p
                  on p.id = c.sous_traitant_id and p.filiale_id = $1
             left join prestataire_sous_traitance a
                  on a.filiale_id = $1
                 and a.sous_traitant_id = c.sous_traitant_id
                 and a.prestataire_id = c.chemin[array_length(c.chemin, 1) - 1]
            order by c.rang, p.societe`,
          [ligne.filiale_id, identifiant],
        );

        return {
          id: identifiant,
          societe: String(ligne.societe),
          maillons: maillons.rows.map((m) => ({
            id: String(m.sous_traitant_id),
            societe: String(m.societe),
            rang: Number(m.rang),
            pays: m.pays === null ? null : String(m.pays),
            lei: m.lei === null ? null : String(m.lei),
            service: m.service === null ? null : String(m.service),
            dansFonctionCritique: m.dans_fonction_critique === true,
            // Le chemin complet : c'est lui qui rend le rang VÉRIFIABLE par un
            // auditeur, au lieu d'un nombre qu'il faudrait croire.
            chemin: Array.isArray(m.chemin) ? m.chemin.map((e: unknown) => String(e)) : [],
            cycleDetecte: m.cycle_detecte === true,
          })),
          motif:
            maillons.rows.length === 0
              ? 'Aucune sous-traitance n’est déclarée pour ce tiers. L’article 29 de DORA ' +
                'demande de connaître les sous-traitants qui interviennent dans une ' +
                'fonction critique ou importante : une chaîne vide est une réponse, à ' +
                'condition qu’elle ait été vérifiée.'
              : '',
        };
      });

      if (resultat === null) {
        throw new ErreurApplicative({
          code: 'ressource_inconnue',
          statut: 404,
          message: 'Ce prestataire n’existe pas dans votre périmètre.',
          detailJournal: 'chaîne demandée pour un prestataire hors périmètre ou inexistant',
        });
      }
      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/tiers/questionnaires
   * -------------------------------------------------------------------
   *  Où en est chaque questionnaire envoyé : son état DÉRIVÉ, et ce que le
   *  fournisseur a répondu jusqu'ici.
   *
   *  ⚠️ **L'état n'est pas une colonne**, et le motif est celui de toute la
   *  série : « en retard » se constate à l'instant où le jour change, sans
   *  qu'aucun traitement ne s'exécute — donc sans qu'aucun traitement ne puisse
   *  l'oublier.
   *
   *  ⚠️ **Le compte des réponses n'inclut PAS le nombre de questions.** Le
   *  produit ne sait pas combien de questions porte « aircyber » : le catalogue
   *  vit dans le frontend. Rendre un pourcentage ici obligerait à recopier ce
   *  compte côté serveur — une seconde source qui se tromperait le jour où le
   *  référentiel change. L'écran, qui a le catalogue, fait la division.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_QUESTIONNAIRES,
    { config: { acces: { action: 'lire', domaine: 'tiers' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        await client.query("set local timezone to 'UTC'");

        const lignes = await client.query(
          `select q.id, q.prestataire_id, q.ref_id, q.intitule,
                  q.envoye_le::text  as envoye_le,
                  q.echeance::text   as echeance,
                  q.relance_le::text as relance_le,
                  q.recu_le::text    as recu_le,
                  p.societe,
                  f_etat_questionnaire(q.envoye_le, q.echeance, q.recu_le) as etat,
                  (select count(*)::int from questionnaire_reponses r
                    where r.questionnaire_id = q.id and r.filiale_id = q.filiale_id) as reponses,
                  (select count(*)::int from questionnaire_reponses r
                    where r.questionnaire_id = q.id and r.filiale_id = q.filiale_id
                      and r.reponse = 'non') as reponses_non,
                  (select count(*)::int from questionnaire_reponses r
                    where r.questionnaire_id = q.id and r.filiale_id = q.filiale_id
                      and r.reponse = 'partiel') as reponses_partiel
             from questionnaires_tiers q
             join prestataires p
                  on p.id = q.prestataire_id and p.filiale_id = q.filiale_id
            order by q.echeance nulls last, p.societe
            limit $1`,
          [TIERS_MAX],
        );

        return {
          questionnaires: lignes.rows.map((l) => ({
            id: String(l.id),
            prestataireId: String(l.prestataire_id),
            societe: String(l.societe),
            refId: String(l.ref_id),
            intitule: l.intitule === null ? null : String(l.intitule),
            envoyeLe: l.envoye_le === null ? null : String(l.envoye_le),
            echeance: l.echeance === null ? null : String(l.echeance),
            relanceLe: l.relance_le === null ? null : String(l.relance_le),
            recuLe: l.recu_le === null ? null : String(l.recu_le),
            // Rendu par la BASE : une seconde comparaison de dates dériverait dès
            // que l'horloge du serveur applicatif et celle de la base diffèrent.
            etat: String(l.etat),
            reponses: Number(l.reponses ?? 0),
            // Ce qui intéresse vraiment un acheteur : ce à quoi le fournisseur a
            // répondu NON, ou à moitié. Un compte de réponses seul ne dit rien.
            reponsesNon: Number(l.reponses_non ?? 0),
            reponsesPartiel: Number(l.reponses_partiel ?? 0),
          })),
          tronque: lignes.rows.length >= TIERS_MAX,
          motif:
            lignes.rows.length === 0
              ? 'Aucun questionnaire n’a été envoyé dans votre périmètre. Un questionnaire ' +
                'se construit depuis un référentiel existant, s’exporte, se remplit hors ' +
                'ligne par le fournisseur, et se réimporte par le moteur d’import.'
              : '',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/tiers/registre-dora
   * -------------------------------------------------------------------
   *  Le registre d'information de l'article 28 §3 de DORA, sous la forme d'un
   *  tableau de lignes prêtes à être remises.
   *
   *  ── ⚠️ CE QUE CETTE ROUTE EST, ET CE QU'ELLE N'EST PAS ────────────────
   *
   *  Elle rend **le contenu** du registre : une ligne par arrangement
   *  contractuel, avec les champs que le règlement énumère. Elle ne produit
   *  **pas** les gabarits XBRL des normes techniques d'exécution des autorités
   *  européennes — c'est un format de dépôt, versionné par l'ESA, qui change
   *  sans prévenir et dont la génération serait un lot à elle seule.
   *
   *  Le produit **prépare, l'humain dépose** : c'est la même règle que pour les
   *  formulaires ANSSI et CNIL de l'action 20.2, et elle est écrite ici pour que
   *  personne ne croie le contraire en lisant le nom de la route.
   *
   *  ⚠️ **Elle exige le droit d'EXPORT**, et non la simple lecture. Un registre
   *  d'information complet est la cartographie des dépendances critiques du
   *  groupe : c'est exactement ce que le `PLAN_SERVEUR` §3.3 range parmi les
   *  extractions, et le contrôle S7 vérifie qu'aucune route ne rend le jeu
   *  complet sans ce droit.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_REGISTRE,
    { config: { acces: { action: 'exporter', domaine: 'tiers' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        await client.query("set local timezone to 'UTC'");

        const lignes = await client.query(
          `select p.id, p.filiale_id, f.raison_sociale as filiale, f.code as filiale_code,
                  p.societe, p.lei, p.pays, p.pays_donnees,
                  p.fonction_supportee, p.fonction_critique, p.type_service,
                  p.contrat_reference,
                  p.contrat_debut::text    as contrat_debut,
                  p.contrat_fin::text      as contrat_fin,
                  p.contrat_revue_le::text as contrat_revue_le,
                  p.substituabilite, p.plan_sortie_le::text as plan_sortie_le,
                  p.evalue_le::text as evalue_le
             from prestataires p
             join filiales f on f.id = p.filiale_id
            order by f.code, p.societe
            limit $1`,
          [TIERS_MAX],
        );

        const sousTraitances = await client.query(
          `select a.prestataire_id, a.sous_traitant_id, a.service,
                  a.dans_fonction_critique, s.societe, s.lei, s.pays
             from prestataire_sous_traitance a
             join prestataires s
                  on s.id = a.sous_traitant_id and s.filiale_id = a.filiale_id
            order by s.societe`,
        );

        const parDonneur = new Map<string, unknown[]>();
        for (const s of sousTraitances.rows) {
          const cle = String(s.prestataire_id);
          const liste = parDonneur.get(cle) ?? [];
          liste.push({
            id: String(s.sous_traitant_id),
            societe: String(s.societe),
            lei: s.lei === null ? null : String(s.lei),
            pays: s.pays === null ? null : String(s.pays),
            service: s.service === null ? null : String(s.service),
            dansFonctionCritique: s.dans_fonction_critique === true,
          });
          parDonneur.set(cle, liste);
        }

        // ── LES MANQUES SONT DITS, PAS TUS ─────────────────────────────
        //
        // ⚠️ C'est le point le plus utile de cette route, et le plus facile à
        // omettre. Un registre remis avec des cases vides est refusé ; un
        // registre qui ne signale pas ses propres trous laisse croire qu'il est
        // complet. Chaque ligne porte donc la liste de ce qui lui manque **pour
        // la remise**, et la route rend le compte — c'est ce qui transforme un
        // tableau en plan de travail.
        const obligatoires: readonly (readonly [string, string])[] = [
          ['lei', 'identifiant LEI'],
          ['pays', 'pays du prestataire'],
          ['fonction_supportee', 'fonction supportée'],
          ['type_service', 'type de service TIC'],
          ['contrat_reference', 'référence du contrat'],
          ['contrat_debut', 'date de début du contrat'],
          ['pays_donnees', 'pays de traitement des données'],
        ];

        const registre = lignes.rows.map((l) => {
          const manques = obligatoires
            .filter(([colonne]) => {
              const valeur = (l as Record<string, unknown>)[colonne];
              return valeur === null || valeur === undefined || valeur === '';
            })
            .map(([, libelle]) => libelle);
          // ⚠️ La substituabilité et le plan de sortie ne sont exigés que pour
          // une fonction CRITIQUE ou importante (article 28 §8) : les réclamer
          // partout ferait deux cents alertes dont cent quatre-vingts sans objet,
          // et la première chose qu'on fait d'une alerte sans objet est de cesser
          // de la lire.
          if (l.fonction_critique === true) {
            if (l.substituabilite === null) manques.push('substituabilité (fonction critique)');
            if (l.plan_sortie_le === null) manques.push('plan de sortie daté (fonction critique)');
          }
          return {
            id: String(l.id),
            filiale: String(l.filiale),
            filialeCode: String(l.filiale_code),
            societe: String(l.societe),
            lei: l.lei === null ? null : String(l.lei),
            pays: l.pays === null ? null : String(l.pays),
            paysDonnees: l.pays_donnees === null ? null : String(l.pays_donnees),
            fonctionSupportee:
              l.fonction_supportee === null ? null : String(l.fonction_supportee),
            fonctionCritique: l.fonction_critique === true,
            typeService: l.type_service === null ? null : String(l.type_service),
            contratReference: l.contrat_reference === null ? null : String(l.contrat_reference),
            contratDebut: l.contrat_debut === null ? null : String(l.contrat_debut),
            contratFin: l.contrat_fin === null ? null : String(l.contrat_fin),
            contratRevueLe: l.contrat_revue_le === null ? null : String(l.contrat_revue_le),
            substituabilite: l.substituabilite === null ? null : String(l.substituabilite),
            planSortieLe: l.plan_sortie_le === null ? null : String(l.plan_sortie_le),
            evalueLe: l.evalue_le === null ? null : String(l.evalue_le),
            sousTraitants: parDonneur.get(String(l.id)) ?? [],
            manques,
          };
        });

        return {
          registre,
          tronque: lignes.rows.length >= TIERS_MAX,
          lignesIncompletes: registre.filter((l) => l.manques.length > 0).length,
          fonctionsCritiques: registre.filter((l) => l.fonctionCritique).length,
          // ⚠️ Dit à l'écran, et non laissé à deviner : le produit PRÉPARE le
          // registre, il ne le DÉPOSE pas. Aucune donnée ne part d'ici vers une
          // autorité — c'est la même règle qu'aux formulaires ANSSI et CNIL.
          avertissement:
            'Ce registre est préparé par le produit ; sa remise à l’autorité reste un ' +
            'geste humain. Les gabarits de dépôt des autorités européennes évoluent ' +
            'indépendamment de ce logiciel : vérifiez le format attendu avant de déposer.',
        };
      });

      return await reponse.status(200).send(resultat);
    },
  );
}
