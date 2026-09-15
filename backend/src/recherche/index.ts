/**
 * `src/recherche/` — LA RECHERCHE GLOBALE (lot L17, action A3)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/recherche?q=…` | retrouver un enregistrement par son nom, dans tout le produit |
 *
 * ── ⚠️ UNE RECHERCHE EST UN ORACLE, ET C'EST TOUT LE SUJET ──────────────────
 *
 * Le `docs/PLAN_EXECUTION.md` §3 le dit depuis la vague 9, et c'est pour cela
 * que l'action D3 avait été repoussée : *« une recherche est un oracle, c'est la
 * surface la plus propice à une fuite entre filiales »*. Une recherche qui
 * répond « aucun résultat » ou « un résultat » sur un terme choisi dit quelque
 * chose de ce qui existe — y compris de ce qui existe **ailleurs**.
 *
 * Quatre décisions en découlent, et aucune n'est négociable :
 *
 *  1. **C'est la RLS qui borne, jamais un filtre.** Aucune requête d'ici ne
 *     nomme de filiale : pas un `where filiale_id = $1`, pas un paramètre. La
 *     session porte son périmètre, la base coupe. Un filtre applicatif serait
 *     une barrière que le prochain chemin d'écriture contournerait — et il y a
 *     toujours un chemin de plus (constats Q-232 / Q-233).
 *
 *  2. **Les DROITS bornent aussi.** On ne cherche que dans les entités dont la
 *     session peut lire le domaine. Sans cela, un contributeur sans le domaine
 *     `journal` ou `rgpd` apprendrait, par le simple compte des résultats, ce
 *     que contiennent des écrans qu'il ne peut pas ouvrir.
 *
 *  3. **La recherche ne va pas au-delà du LIBELLÉ** — voir `cibleDeRecherche()`
 *     dans `src/entites`. Balayer le texte libre ferait de l'outil un moteur de
 *     recherche sur des commentaires dont le registre de l'article 30 dit
 *     qu'une partie porte des personnes.
 *
 *  4. **Elle consomme le MÊME budget de trace que le sondage.** Une recherche
 *     rend des lignes ; répétée en fenêtres étroites, elle extrait. Le constat
 *     Q-279 laissait justement ouvert *« paginer en fenêtres étroites échappe
 *     encore — il faudrait un compteur cumulé par session »* : le voici employé
 *     par une seconde route, plutôt qu'un second compteur qui donnerait deux
 *     budgets à la même personne.
 *
 * ── Ce qu'elle ne fait pas, et qu'il faut dire ──────────────────────────────
 *
 * Elle ne classe pas par pertinence sémantique : un préfixe passe avant une
 * occurrence interne, et c'est tout. Un vrai classement demanderait un index de
 * recherche plein texte, donc la décision du point 3, donc un autre lot.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import { avecTransaction } from '../db/pool.js';
import { chargerCatalogue, cibleDeRecherche, listerEntites } from '../entites/index.js';
import type { Catalogue, NomEntite } from '../entites/types.js';
import { ErreurApplicative } from '../erreurs/index.js';
import { DOMAINE_PAR_ENTITE } from '../api/droits.js';
import type { SessionAppliquee } from '../api/session.js';

export const CHEMIN_RECHERCHE = '/api/recherche';

/** Deux signes au minimum : en dessous, toute recherche rend tout. */
export const TERME_MIN = 2;
/** Borne de saisie. Un terme de 10 000 signes est un déni de service, pas une recherche. */
export const TERME_MAX = 100;
/**
 * Plafond de résultats RENDUS, toutes entités confondues.
 *
 * ⚠️ Ce n'est pas un confort d'affichage : c'est la borne du contrôle S13, et
 * c'est ce qui empêche une recherche sur « a » de rendre la filiale entière.
 */
export const RESULTATS_MAX = 50;
/** Plafond par entité, pour qu'une entité volumineuse n'avale pas la réponse. */
const RESULTATS_PAR_ENTITE = 10;

export interface Resultat {
  readonly entite: NomEntite;
  readonly domaine: string;
  readonly id: string;
  readonly libelle: string;
  /** `true` quand le libellé COMMENCE par le terme : sert au classement. */
  readonly prefixe: boolean;
}

export interface OptionsRecherche {
  readonly pool: Pool;
  /**
   * Compteur de lignes rendues sans trace, **partagé avec le sondage**. Injecté
   * plutôt qu'importé : deux compteurs pour la même personne seraient deux
   * budgets, et c'est exactement le défaut du constat B-6 (« un budget qui se
   * réarme n'est pas un budget »).
   */
  readonly cumuler: (cle: string, lignes: number) => number | null;
  /** Écrit une entrée de journal dans la transaction courante. */
  readonly tracer: (
    client: PoolClient,
    session: SessionAppliquee,
    cumul: number,
    rendus: number,
  ) => Promise<void>;
}

/**
 * Neutralise les jokers de `like` dans le terme de l'utilisateur.
 *
 * ⚠️ **Sans cela, « % » rend TOUT.** Ce n'est pas une coquette : un terme d'un
 * seul signe qui contourne la longueur minimale et rend la filiale entière est
 * précisément l'oracle que ce fichier existe pour fermer. `\` est échappé en
 * premier, sans quoi on échapperait les échappements.
 */
export function neutraliserJokers(terme: string): string {
  return terme.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Les entités réellement cherchables pour cette session : celles qui portent un
 * libellé **et** dont le domaine est lisible.
 */
export function entitesCherchables(
  catalogue: Catalogue,
  peutLire: (domaine: string) => boolean,
): readonly { entite: NomEntite; table: string; libelle: string; domaine: string }[] {
  const retenues: { entite: NomEntite; table: string; libelle: string; domaine: string }[] = [];
  for (const entite of listerEntites()) {
    const domaine = DOMAINE_PAR_ENTITE[entite];
    if (!peutLire(domaine)) continue;
    const cible = cibleDeRecherche(catalogue, entite);
    if (cible === null) continue;
    retenues.push({ entite, table: cible.table, libelle: cible.libelle, domaine });
  }
  return retenues;
}

/**
 * Cherche le terme dans les libellés des entités autorisées.
 *
 * ⚠️ **Aucune filiale n'est nommée.** Les seuls paramètres sont le motif et les
 * bornes ; c'est la politique de sécurité de ligne qui décide de ce qui est
 * visible. Un essai le vérifie en cherchant un terme qui n'existe que chez le
 * voisin.
 */
export async function chercher(
  client: PoolClient,
  catalogue: Catalogue,
  peutLire: (domaine: string) => boolean,
  terme: string,
): Promise<readonly Resultat[]> {
  const cherchables = entitesCherchables(catalogue, peutLire);
  if (cherchables.length === 0) return [];

  const motif = `%${neutraliserJokers(terme)}%`;
  const debut = `${neutraliserJokers(terme)}%`;

  // Les noms de table et de colonne viennent du CATALOGUE : liste blanche close
  // par construction, la seule interpolation d'identifiant que le
  // `CONVENTIONS.md` §17.4 admette. Aucune valeur d'utilisateur n'entre ici —
  // le terme voyage en paramètre, et rien qu'en paramètre.
  const morceaux = cherchables.map(
    (c) => `(
      select '${c.entite}'::text as entite,
             id::text            as id,
             "${c.libelle}"::text as libelle,
             ("${c.libelle}"::text ilike $2 escape '\\') as prefixe
        from "${c.table}"
       where "${c.libelle}"::text ilike $1 escape '\\'
       order by ("${c.libelle}"::text ilike $2 escape '\\') desc, "${c.libelle}"
       limit ${String(RESULTATS_PAR_ENTITE)}
    )`,
  );

  const resultat = await client.query<{
    entite: string;
    id: string;
    libelle: string;
    prefixe: boolean;
  }>(`${morceaux.join(' union all ')} limit ${String(RESULTATS_MAX)}`, [motif, debut]);

  const domaines = new Map(cherchables.map((c) => [c.entite as string, c.domaine]));
  return resultat.rows
    .map((r) => ({
      entite: r.entite as NomEntite,
      domaine: domaines.get(r.entite) ?? '',
      id: r.id,
      libelle: r.libelle,
      prefixe: r.prefixe === true,
    }))
    .sort((a, b) =>
      a.prefixe === b.prefixe
        ? a.libelle.localeCompare(b.libelle, 'fr')
        : a.prefixe
          ? -1
          : 1,
    )
    .slice(0, RESULTATS_MAX);
}

/* =====================================================================
 *  LE GREFFON
 * ===================================================================== */

export async function greffonRecherche(
  instance: FastifyInstance,
  options: OptionsRecherche,
): Promise<void> {
  const { pool, cumuler, tracer } = options;

  instance.get(
    CHEMIN_RECHERCHE,
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = requete.sessionGrc;
      if (session === undefined) {
        throw new ErreurApplicative({
          code: 'erreur_interne',
          statut: 500,
          message: 'Le serveur ne peut pas traiter cette demande.',
          detailJournal: 'route de recherche atteinte sans session appliquée',
        });
      }

      const brut = (requete.query as { q?: unknown }).q;
      const terme = typeof brut === 'string' ? brut.trim() : '';

      if (terme.length < TERME_MIN) {
        // ⚠️ On rend 200 avec une liste VIDE et le motif, jamais une erreur :
        // l'utilisateur tape, et chaque frappe passerait ici. Un 400 par
        // caractère ferait du journal technique une trace de frappe.
        return await reponse.status(200).send({
          resultats: [],
          tronque: false,
          motif: `Tapez au moins ${String(TERME_MIN)} caractères.`,
        });
      }
      if (terme.length > TERME_MAX) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message: `Le terme de recherche est limité à ${String(TERME_MAX)} caractères.`,
          detailJournal: `terme de recherche de ${String(terme.length)} caractères`,
        });
      }

      const resultats = await avecTransaction(pool, session.perimetre, async (client) => {
        const catalogue = await chargerCatalogue(client);
        const trouves = await chercher(
          client,
          catalogue,
          // ⚠️ La lecture d'un domaine se juge sur `droits.domaines` — la liste
          // que la couche d'authentification a résolue. Un domaine absent est un
          // domaine refusé (`DroitsSession`), et c'est ce qui borne la recherche
          // aux écrans que cette session peut réellement ouvrir.
          (domaine) => (session.droits.domaines as readonly string[]).includes(domaine),
          terme,
        );

        // Le MÊME budget que le sondage : une recherche rend des lignes, et
        // répétée elle extrait. Voir le point 4 de l'entête.
        const cumul = cumuler(session.perimetre.utilisateurId, trouves.length);
        if (cumul !== null) await tracer(client, session, cumul, trouves.length);

        return trouves;
      });

      return await reponse.status(200).send({
        resultats,
        tronque: resultats.length >= RESULTATS_MAX,
        motif:
          resultats.length >= RESULTATS_MAX
            ? `Seuls les ${String(RESULTATS_MAX)} premiers résultats sont affichés : précisez votre recherche.`
            : '',
      });
    },
  );
}
