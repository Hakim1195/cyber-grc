/**
 * `src/catalogues/` — LES CATALOGUES OUVERTS (lot L26, actions 26.3, 26.4 et 26.5)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/catalogues/etat` | l'**ancienneté** de chaque catalogue et sa chaîne de versions (26.5, 26.3) |
 * | `GET` | `/api/catalogues/reprise-evaluations` | le **plan** de reprise des réponses d'une version à la suivante (26.3) |
 * | `GET` | `/api/catalogues/suggestions` | les rapprochements **proposés** entre deux référentiels (26.4) |
 *
 * ── ⚠️ TROIS LECTURES, ZÉRO ÉCRITURE — ET C'EST LE CŒUR DU LOT ─────────────
 *
 * Les quatre tables de catalogue sont des **entités ordinaires**
 * (`src/entites/index.ts`) : elles se créent, se modifient, s'importent et se
 * reprennent par les routes génériques, comme un risque ou un document. Un
 * référentiel apporté par un client (action 26.2) passe donc par le **moteur
 * d'import du lot L7**, sans une ligne écrite ici — et hérite du verrouillage
 * optimiste, du journal, du cloisonnement et du round-trip `grc-backup`.
 *
 * Ce que ce greffon ajoute, et que rien d'autre ne peut rendre, ce sont **trois
 * choses que le produit ne doit PAS décider tout seul** :
 *
 *  1. **l'ancienneté d'un catalogue** (26.5) — dérivée, jamais rangée ;
 *  2. **le plan** de reprise des réponses d'une version à la suivante (26.3) ;
 *  3. **des propositions** de correspondances entre deux référentiels (26.4).
 *
 * Les trois sont rendues **sans être appliquées**. C'est le critère 26.4 mot pour
 * mot — *une correspondance appliquée sans validation propagerait un statut de
 * conformité faux ; la suggestion est une proposition, jamais une écriture* — et
 * c'est la même règle qui gouverne 26.3 : le passage d'une version à l'autre est
 * un **geste humain**, et ce qui le rend possible est qu'on en voie le plan avant.
 *
 * ── ⚠️ POURQUOI LA REPRISE DES ÉVALUATIONS N'ÉCRIT PAS ICI ────────────────
 *
 * Elle le pourrait, en une requête. Elle ne le fait pas, pour la raison qui a
 * fait refuser une « variante simplifiée » du dépôt de pièces au lot L28 :
 * *c'est ainsi qu'on se retrouve avec deux chaînes d'écriture dont une seule est
 * éprouvée*. Les évaluations reprises sont créées par l'écran, à travers les
 * routes génériques — donc journalisées, versionnées et cloisonnées comme
 * toutes les autres.
 *
 * ── LE CLOISONNEMENT ────────────────────────────────────────────────────────
 *
 * ⚠️ Aucune requête ne nomme de filiale : c'est la **RLS** qui borne, comme dans
 * `/api/consolidation` et `/api/ebios/etat`. Le socle du Groupe (`filiale_id`
 * nul) est lisible de toutes les filiales ; une grille apportée par une filiale
 * n'est lisible que d'elle.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_ETAT = '/api/catalogues/etat';
export const CHEMIN_REPRISE = '/api/catalogues/reprise-evaluations';
export const CHEMIN_SUGGESTIONS = '/api/catalogues/suggestions';

/**
 * Bornes (contrôle S13).
 *
 * ⚠️ Elles ne sont pas décoratives. `SUGGESTIONS_MAX` borne un produit cartésien :
 * comparer les 234 questions d'AirCyber aux 93 mesures de l'Annexe A fait 21 762
 * comparaisons, ce qui est tenable — mais rien n'empêche un client d'importer une
 * grille de dix mille lignes, et le carré, lui, ne pardonne pas.
 */
const CATALOGUES_MAX = 200;
const EXIGENCES_MAX = 2000;
const PROPOSITIONS_PAR_EXIGENCE = 3;
/** En deçà, on ne propose rien : une proposition faible coûte plus qu'elle ne rend. */
const SEUIL_SIMILARITE = 0.25;

export interface OptionsCatalogues {
  readonly pool: Pool;
}

/* =====================================================================
 *  La similarité de libellé (action 26.4)
 * ===================================================================== */

/**
 * Découpe un intitulé en mots comparables.
 *
 * ⚠️ **Sans expression rationnelle, et ce n'est pas du purisme.** La règle n° 7 du
 * `docs/PLAN_PRODUIT.md` §5 interdit dans `src/` toute expression à coût non borné —
 * y compris littérale : deux passages de porte l'ont coûté (constats **Q-208** et
 * **Q-215**, 931 octets → 5 994 ms). Un parcours de caractères est linéaire **par
 * construction**, et il n'y a rien à mesurer pour s'en assurer.
 *
 * ⚠️ Les accents sont retirés par décomposition Unicode : « sécurité » et « securite »
 * désignent la même chose, et une grille importée depuis un tableur les mélange.
 *
 * ⚠️ Les mots de moins de quatre lettres sont écartés — « les », « des », « de »,
 * « the », « and ». Ils sont présents partout, et les garder ferait que **tout
 * ressemble à tout** : le bruit noierait les vraies correspondances, et l'écran
 * deviendrait un générateur de faux positifs qu'on cesse de lire.
 */
function mots(intitule: string): Set<string> {
  const resultat = new Set<string>();
  const sansAccent = intitule.normalize('NFD');
  let courant = '';
  for (const signe of sansAccent) {
    const code = signe.codePointAt(0) ?? 0;
    // Les marques combinantes (U+0300 à U+036F) : la moitié « accent » d'une
    // lettre décomposée. On les laisse tomber plutôt que de les translittérer.
    if (code >= 0x0300 && code <= 0x036f) continue;
    const minuscule = signe.toLowerCase();
    const estLettre = (minuscule >= 'a' && minuscule <= 'z') || (minuscule >= '0' && minuscule <= '9');
    if (estLettre) {
      courant += minuscule;
    } else {
      if (courant.length >= 4) resultat.add(courant);
      courant = '';
    }
  }
  if (courant.length >= 4) resultat.add(courant);
  return resultat;
}

/**
 * Indice de Jaccard : la part de mots communs dans l'union des deux intitulés.
 *
 * ⚠️ **Jaccard et non « nombre de mots communs »**, et la différence compte : un
 * intitulé très long partage mécaniquement des mots avec tout le monde. Diviser par
 * l'union pénalise la longueur, ce qui est exactement ce qu'on veut — une question
 * d'AirCyber de quarante mots ne doit pas « ressembler » aux quatre-vingt-treize
 * mesures de l'Annexe A.
 */
function similarite(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let communs = 0;
  for (const mot of a) if (b.has(mot)) communs += 1;
  const union = a.size + b.size - communs;
  return union === 0 ? 0 : communs / union;
}

export async function greffonCatalogues(
  instance: FastifyInstance,
  options: OptionsCatalogues,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de catalogue atteinte sans session appliquée',
      });
    }
    return session;
  };

  const texteDe = (valeur: unknown, champ: string): string => {
    if (typeof valeur !== 'string' || valeur === '') {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message: `Le paramètre « ${champ} » est obligatoire.`,
        detailJournal: `parametre ${champ} absent ou vide`,
      });
    }
    return valeur;
  };

  /* -------------------------------------------------------------------
   *  GET /api/catalogues/etat — l'ancienneté et la chaîne de versions
   * -------------------------------------------------------------------
   *  ⚠️ **Le produit ne va PAS chercher la norme sur Internet** : c'est le
   *  risque P3 du plan produit, et `IPAddressDeny=any` le rend de toute
   *  façon impossible sans un geste de l'exploitant. Ce qu'il sait faire,
   *  et qui suffit : **dater ses catalogues, et signaler l'ancienneté**.
   *
   *  ⚠️ L'ancienneté est rendue par `f_referentiel_age()`, dans la base.
   *  La recalculer ici en ferait une seconde source, qui divergerait au
   *  premier ajustement du seuil (constat **Q-219**).
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);

      const catalogues = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query(
          `select r.id, r.nom, r.editeur, r.version_referentiel as version, r.scoring,
                  r.revision, r.statut, r.remplace_id,
                  to_char(r.en_vigueur_le, 'YYYY-MM-DD') as en_vigueur_le,
                  to_char(r.archive_le,    'YYYY-MM-DD') as archive_le,
                  to_char(r.publie_le,     'YYYY-MM-DD') as publie_le,
                  r.duree_alerte_mois,
                  -- ⚠️ DÉRIVÉE par la base, jamais rangée : un état en colonne
                  -- vieillirait sans que rien n'écrive, et un catalogue marqué
                  -- « à jour » le resterait jusqu'à ce qu'un traitement repasse.
                  f_referentiel_age(r.publie_le, r.duree_alerte_mois) as age,
                  -- ⚠️ COMPTÉS, jamais rangés — même arbitrage que l'avancement
                  -- d'une campagne : une colonne « nombre d'exigences » serait
                  -- fausse le jour où un import ne repasse pas derrière.
                  (select count(*)::int from referentiel_domaines d
                    where d.referentiel_id = r.id) as domaines,
                  (select count(*)::int from referentiel_exigences e
                    where e.referentiel_id = r.id) as exigences,
                  (select count(*)::int from referentiel_traductions t
                    where t.referentiel_id = r.id) as traductions,
                  -- Les réponses déjà données sur ce catalogue, dans le périmètre
                  -- visible. ⚠️ C'est le chiffre qui rend le versionnage sérieux :
                  -- il dit ce qu'une migration de version mettrait en jeu.
                  (select count(*)::int from evaluations v
                    where v.ref_id = r.id) as evaluations,
                  (r.filiale_id is null) as portee_groupe
             from referentiels r
            order by r.statut, r.nom
            limit $1`,
          [CATALOGUES_MAX],
        );
        return rows;
      });

      return await reponse.send({ catalogues });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/catalogues/reprise-evaluations?de=…&vers=…
   * -------------------------------------------------------------------
   *  Le PLAN de reprise des réponses d'une version à la suivante (26.3).
   *
   *  ⚠️ **Rien n'est écrit, et c'est le critère de l'action** : *« le
   *  passage d'une version à l'autre est explicite et tracé »*. Explicite
   *  veut dire qu'un humain voit ce qu'il engage AVANT de l'engager — et ce
   *  que cette route rend, ce sont les trois listes qu'il doit voir :
   *
   *   · `reprises`   — le code existe des deux côtés : la réponse se reporte ;
   *   · `abandonnes` — le code a DISPARU de la nouvelle version : la réponse
   *                    reste attachée à l'ancien catalogue, qui existe toujours ;
   *   · `nouveaux`   — le code est NEUF : il reste à évaluer.
   *
   *  ⚠️ **Un code identique ne garantit pas un sens identique**, et le produit
   *  ne le prétend pas. ISO 27002:2022 a renuméroté les 114 mesures de 2013 en
   *  93 : reporter « 5.1 » sur « 5.1 » y aurait été faux dans la plupart des
   *  cas. C'est pourquoi la reprise est un GESTE, proposé code par code, et non
   *  un traitement.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_REPRISE,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const parametres = (requete.query ?? {}) as Record<string, unknown>;
      const de = texteDe(parametres['de'], 'de');
      const vers = texteDe(parametres['vers'], 'vers');

      const plan = await avecTransaction(pool, session.perimetre, async (client) => {
        // ── La chaîne doit être DÉCLARÉE ────────────────────────────────
        //
        // ⚠️ On refuse de reprendre vers un catalogue qui ne déclare pas
        // remplacer celui-ci. Sans cette barrière, la route servirait à
        // reporter les réponses d'ISO 27002 sur AirCyber — deux référentiels
        // dont les codes ne veulent rien dire l'un pour l'autre —, et le
        // résultat serait un jeu de réponses d'audit entièrement faux, produit
        // en un clic.
        const { rows: chaine } = await client.query<{ remplace_id: string | null }>(
          `select remplace_id from referentiels where id = $1`,
          [vers],
        );
        if (chaine.length === 0) {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 404,
            message: "Le référentiel d'arrivée n'existe pas dans votre périmètre.",
            detailJournal: `reprise vers ${vers} : introuvable`,
          });
        }
        if (chaine[0]?.remplace_id !== de) {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 400,
            message:
              "Ce référentiel ne déclare pas remplacer celui dont vous voulez reprendre " +
              'les réponses. Une reprise entre deux catalogues sans lien produirait des ' +
              "réponses d'audit fausses : leurs codes ne désignent pas les mêmes mesures.",
            detailJournal: `reprise ${de} -> ${vers} : chaine non declaree`,
          });
        }

        const { rows } = await client.query(
          `with ancien as (
               select e.code, e.titre
                 from referentiel_exigences e where e.referentiel_id = $1),
                nouveau as (
               select e.code, e.titre
                 from referentiel_exigences e where e.referentiel_id = $2),
                reponses as (
               select v.code, v.statut, v.maturite
                 from evaluations v where v.ref_id = $1)
           select coalesce(a.code, n.code) as code,
                  a.titre                  as titre_ancien,
                  n.titre                  as titre_nouveau,
                  (a.code is not null)     as dans_ancien,
                  (n.code is not null)     as dans_nouveau,
                  r.statut, r.maturite
             from ancien a
             full outer join nouveau n on n.code = a.code
             left  join reponses r on r.code = a.code
            order by 1
            limit $3`,
          [de, vers, EXIGENCES_MAX],
        );

        const reprises: unknown[] = [];
        const abandonnes: unknown[] = [];
        const nouveaux: unknown[] = [];
        for (const ligne of rows as {
          code: string;
          titre_ancien: string | null;
          titre_nouveau: string | null;
          dans_ancien: boolean;
          dans_nouveau: boolean;
          statut: string | null;
          maturite: number | null;
        }[]) {
          if (ligne.dans_ancien && ligne.dans_nouveau) {
            // ⚠️ Seules les exigences RÉPONDUES entrent dans le plan de reprise :
            // reporter « non évalué » n'est pas un report, c'est du bruit.
            if (ligne.statut !== null) {
              reprises.push({
                code: ligne.code,
                titre: ligne.titre_nouveau,
                titre_precedent: ligne.titre_ancien,
                // ⚠️ L'intitulé a-t-il changé sous le même code ? C'est ce qu'un
                // humain doit voir avant de reporter : le code est identique, le
                // sens peut ne pas l'être.
                intitule_modifie: ligne.titre_ancien !== ligne.titre_nouveau,
                statut: ligne.statut,
                maturite: ligne.maturite,
              });
            }
          } else if (ligne.dans_ancien) {
            abandonnes.push({
              code: ligne.code,
              titre: ligne.titre_ancien,
              repondue: ligne.statut !== null,
              statut: ligne.statut,
            });
          } else {
            nouveaux.push({ code: ligne.code, titre: ligne.titre_nouveau });
          }
        }
        return { de, vers, reprises, abandonnes, nouveaux };
      });

      return await reponse.send(plan);
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/catalogues/suggestions?source=…&cible=…
   * -------------------------------------------------------------------
   *  Les rapprochements PROPOSÉS entre deux référentiels (26.4).
   *
   *  ⚠️ **Le critère de l'action est un interdit** : *« une correspondance
   *  appliquée sans validation propagerait un statut de conformité faux. La
   *  suggestion est une proposition, jamais une écriture. »* Cette route ne
   *  touche donc à rien — pas même à `mappings`, qui est la surcouche que
   *  l'écran écrit APRÈS qu'un humain a validé.
   *
   *  ⚠️ Et elle ne rend PAS un verdict, seulement un score : c'est l'écran qui
   *  ordonne, et l'humain qui tranche. Un seuil affiché comme une décision
   *  ferait porter à une similarité de mots une équivalence normative.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_SUGGESTIONS,
    { config: { acces: { action: 'lire', domaine: 'conformite' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const parametres = (requete.query ?? {}) as Record<string, unknown>;
      const source = texteDe(parametres['source'], 'source');
      const cible = texteDe(parametres['cible'], 'cible');

      if (source === cible) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message: 'Un référentiel ne se rapproche pas de lui-même.',
          detailJournal: `suggestions ${source} == ${cible}`,
        });
      }

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        const lire = async (
          identifiant: string,
        ): Promise<{ code: string; titre: string; aide: string | null }[]> => {
          const { rows } = await client.query<{ code: string; titre: string; aide: string | null }>(
            `select e.code, e.titre, e.aide
               from referentiel_exigences e
              where e.referentiel_id = $1
              order by e.code
              limit $2`,
            [identifiant, EXIGENCES_MAX],
          );
          return rows;
        };
        return { source: await lire(source), cible: await lire(cible) };
      });

      if (resultat.source.length === 0 || resultat.cible.length === 0) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 404,
          message:
            "L'un des deux référentiels est vide ou n'existe pas dans votre périmètre.",
          detailJournal: `suggestions ${source} (${String(resultat.source.length)}) -> ` +
            `${cible} (${String(resultat.cible.length)})`,
        });
      }

      // ⚠️ Les jetons de la CIBLE sont calculés UNE FOIS, hors de la boucle : sans
      // cela, on les recalcule pour chaque exigence source — 234 × 93 découpages au
      // lieu de 93, sur la comparaison la plus lourde du produit livré.
      const cibles = resultat.cible.map((e) => ({
        code: e.code,
        titre: e.titre,
        jetons: mots(e.titre + ' ' + (e.aide ?? '')),
      }));

      const suggestions = resultat.source.map((exigence) => {
        const jetons = mots(exigence.titre + ' ' + (exigence.aide ?? ''));
        const propositions = cibles
          .map((c) => ({ code: c.code, titre: c.titre, score: similarite(jetons, c.jetons) }))
          .filter((p) => p.score >= SEUIL_SIMILARITE)
          .sort((a, b) => b.score - a.score)
          .slice(0, PROPOSITIONS_PAR_EXIGENCE)
          // Deux décimales : au-delà, le chiffre donne une précision que la
          // méthode n'a pas, et il se lit comme une mesure.
          .map((p) => ({ ...p, score: Math.round(p.score * 100) / 100 }));
        return { code: exigence.code, titre: exigence.titre, propositions };
      });

      return await reponse.send({
        source,
        cible,
        seuil: SEUIL_SIMILARITE,
        // ⚠️ On rend TOUT, y compris les exigences sans proposition : leur absence
        // est une information — elle dit où la couverture manque vraiment, et une
        // liste filtrée laisserait croire que le rapprochement est complet.
        suggestions,
      });
    },
  );
}
