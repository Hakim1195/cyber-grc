/**
 * `src/parametres/` — LES RÉGLAGES, catalogue de Groupe et surcharges de filiale
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/parametres` | les réglages EFFECTIFS du périmètre, et d'où vient chaque valeur |
 * | `PUT` | `/api/parametres/:cle` | régler — ou revenir à la valeur du Groupe |
 *
 * ── ⚠️ UN MAGASIN FERMÉ, ET C'EST TOUT L'INTÉRÊT ────────────────────────────
 *
 * Ces routes n'acceptent **que les clés du catalogue** — les lignes de
 * `parametres` dont `filiale_id` est nul, posées par une migration. Une clé
 * libre serait un réglage que le produit ne lit pas : l'exploitant le modifie,
 * croit avoir agi, et rien ne change. C'est le constat **Q-91**, et le dépôt
 * porte déjà un garde-fou pour cette classe sur `.env.example`.
 *
 * Trois barrières, et chacune ferme un chemin différent :
 *
 *  1. **la route** refuse une clé absente du catalogue (ici) ;
 *  2. **le schéma** refuse qu'une surcharge orpheline subsiste
 *     (`f_verifier_parametres_catalogue()`, migration `048`) ;
 *  3. **le dépôt** refuse qu'une clé entre au catalogue sans qu'un fichier de
 *     `cyber-gouvernance_V4/js/` la lise
 *     (`test/depot/reglages-catalogue-lus.test.mjs`).
 *
 * ── LE CLOISONNEMENT, ET CE QU'IL DONNE GRATUITEMENT ────────────────────────
 *
 * `parametres` est MIXTE et porte ses quatre politiques depuis la `001` : la
 * lecture du catalogue est ouverte à toutes les filiales, son écriture exige
 * l'administration Groupe, et une filiale n'écrit que SA ligne. Ces routes ne
 * refont donc **aucun contrôle de périmètre** : elles lisent et écrivent, et
 * c'est la RLS qui borne — la règle de `/api/consolidation`.
 *
 * ── ⚠️ CE QUE « RÉGLER À LA VALEUR DU GROUPE » VEUT DIRE ────────────────────
 *
 * Envoyer une valeur vide **supprime la surcharge** au lieu d'écrire une chaîne
 * vide. La nuance compte : une filiale qui « remet à 7 » alors que le Groupe est
 * à 7 doit pouvoir revenir à *hérité*, sinon le jour où le Groupe passe à 3 elle
 * reste à 7 sans que personne se souvienne pourquoi.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_LISTE = '/api/parametres';
export const CHEMIN_REGLER = '/api/parametres/:cle';

/**
 * Plafond de réglages rendus. Le catalogue est fermé et tient en quelques
 * dizaines de lignes ; la borne existe pour que ce reste vrai (contrôle S13).
 */
const REGLAGES_MAX = 200;

/** Longueur maximale d'une valeur saisie — au-delà, ce n'est plus un réglage. */
const VALEUR_MAX = 500;

const SCHEMA_REGLER = {
  type: 'object',
  additionalProperties: false,
  required: ['valeur'],
  properties: { valeur: { type: 'string', maxLength: VALEUR_MAX } },
} as const;

interface LigneReglage {
  readonly cle: string;
  readonly categorie: string;
  readonly libelle: string | null;
  readonly description: string | null;
  readonly type_valeur: string;
  readonly valeur_defaut: string | null;
  readonly modifiable: boolean;
  readonly valeur_filiale: string | null;
  readonly id_filiale: string | null;
}

export interface OptionsParametres {
  readonly pool: Pool;
}

export async function greffonParametres(
  instance: FastifyInstance,
  options: OptionsParametres,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route de réglages atteinte sans session appliquée',
      });
    }
    return session;
  };

  /* -------------------------------------------------------------------
   *  GET /api/parametres
   * -------------------------------------------------------------------
   *  ⚠️ **`domaine: null` — la LECTURE est ouverte à toute session, et c'est
   *  une décision.** Les réglages commandent le comportement du produit pour
   *  tout le monde : le seuil « urgent » de l'échéancier, le préavis d'une
   *  revue documentaire. Les réserver au domaine « administration » ferait que
   *  l'écran d'un contributeur retomberait sur les valeurs écrites en dur,
   *  **en silence**, pendant que l'administrateur en voit d'autres — deux
   *  produits sous un seul nom.
   *
   *  L'ÉCRITURE, elle, reste un acte d'administration : voir plus bas.
   *
   *  ⚠️ `left join` depuis le CATALOGUE, et non l'inverse : ce qui existe est
   *  la liste des réglages décidés. Partir des surcharges donnerait une liste
   *  qui change selon ce qu'une filiale a déjà réglé — et un écran qui
   *  n'affiche que ce qu'on a touché ne montre jamais ce qui reste à régler.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_LISTE,
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const filialeId = session.perimetre.filialeId;

      const lignes = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => {
          const { rows } = await client.query<LigneReglage>(
            `select c.cle, c.categorie, c.libelle, c.description, c.type_valeur,
                    c.valeur_defaut, c.modifiable,
                    f.valeur as valeur_filiale, f.id as id_filiale
               from parametres c
               left join parametres f
                 on f.cle = c.cle and f.filiale_id = $1
              where c.filiale_id is null
              order by c.categorie, c.cle
              limit $2`,
            [filialeId, REGLAGES_MAX],
          );
          return rows;
        },
        { lectureSeule: true },
      );

      return await reponse.status(200).send({
        reglages: lignes.map((l) => ({
          cle: l.cle,
          categorie: l.categorie,
          libelle: l.libelle,
          description: l.description,
          typeValeur: l.type_valeur,
          valeurGroupe: l.valeur_defaut,
          // ⚠️ La valeur EFFECTIVE, celle que le produit applique. L'écran n'a pas
          //    à refaire ce choix : deux rédactions du même arbitrage finiraient
          //    par différer, et personne ne saurait laquelle s'applique.
          valeur: l.valeur_filiale ?? l.valeur_defaut,
          // « hérité » se lit sur l'ABSENCE de surcharge, pas sur l'égalité des
          // valeurs : une filiale qui règle explicitement la même valeur que le
          // Groupe a pris une décision, et elle doit rester visible.
          herite: l.valeur_filiale === null,
          modifiable: l.modifiable,
        })),
      });
    },
  );

  instance.put(
    CHEMIN_REGLER,
    {
      schema: { body: SCHEMA_REGLER },
      config: { acces: { action: 'administrer', domaine: 'administration' } },
    },
    async (
      requete: FastifyRequest<{ Params: { cle: string }; Body: { valeur: string } }>,
      reponse: FastifyReply,
    ) => {
      const session = sessionDe(requete);
      const filialeId = session.perimetre.filialeId;
      if (filialeId === null) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message:
            'Aucune filiale active : un réglage appartient à une filiale, et une session ' +
            'de portée Groupe doit en choisir une avant de régler.',
          detailJournal: 'PUT /api/parametres sans filiale active',
        });
      }

      const cle = requete.params.cle;
      const brut = requete.body.valeur.trim();

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        // ── 1. La clé est-elle AU CATALOGUE ? ──────────────────────────────
        const { rows } = await client.query<{
          type_valeur: string;
          modifiable: boolean;
          libelle: string | null;
          valeur_defaut: string | null;
        }>(
          `select type_valeur, modifiable, libelle, valeur_defaut
             from parametres where filiale_id is null and cle = $1`,
          [cle],
        );
        const catalogue = rows[0];
        if (catalogue === undefined) {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 400,
            message:
              `Le réglage « ${cle} » n'existe pas. Les réglages sont un ensemble FERMÉ : ` +
              "chacun est déclaré par une migration, avec son libellé et un endroit du " +
              'produit qui le lit. Un réglage libre serait un réglage que rien ne lit.',
            detailJournal: `réglage hors catalogue refusé : ${cle}`,
          });
        }
        if (!catalogue.modifiable) {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 400,
            message:
              `Le réglage « ${cle} » n'est pas modifiable depuis l'application : c'est un ` +
              "paramètre technique, ajustable par l'exploitation.",
            detailJournal: `réglage non modifiable refusé : ${cle}`,
          });
        }

        // ── 2. Vide = revenir à la valeur du Groupe ────────────────────────
        if (brut === '') {
          const efface = await client.query(
            'delete from parametres where filiale_id = $1 and cle = $2',
            [filialeId, cle],
          );
          if ((efface.rowCount ?? 0) > 0) {
            await journaliser(client, {
              action: 'administration',
              filialeId,
              utilisateurLibelle: session.perimetre.utilisateurId,
              resume: 'Réglage remis à la valeur du Groupe.',
              entiteType: 'parametres',
              entiteId: cle,
              valeursApres: { cle, herite: true },
            });
          }
          return { valeur: catalogue.valeur_defaut, herite: true };
        }

        // ── 3. La valeur respecte-t-elle le TYPE déclaré ? ─────────────────
        //
        // ⚠️ Le type vient du CATALOGUE, jamais du corps de la requête : un
        // appelant qui choisirait le type de ce qu'il envoie ne serait pas
        // validé, il serait cru.
        if (catalogue.type_valeur === 'entier' && !/^\d{1,9}$/u.test(brut)) {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 400,
            message: `Le réglage « ${catalogue.libelle ?? cle} » attend un nombre entier positif.`,
            detailJournal: `réglage ${cle} : « ${brut} » n'est pas un entier`,
          });
        }
        if (catalogue.type_valeur === 'booleen' && brut !== 'oui' && brut !== 'non') {
          throw new ErreurApplicative({
            code: 'donnee_invalide',
            statut: 400,
            message: `Le réglage « ${catalogue.libelle ?? cle} » attend « oui » ou « non ».`,
            detailJournal: `réglage ${cle} : « ${brut} » n'est pas un booléen`,
          });
        }

        // ── 4. La surcharge de la filiale ──────────────────────────────────
        //
        // ⚠️ `on conflict` sur `(filiale_id, cle)` — l'unicité que la `001` a
        // posée en « nulls not distinct ». Deux réglages de la même filiale sur
        // la même clé sont un doublon, et c'est elle qui l'interdit.
        const ancien = await client.query<{ valeur: string | null }>(
          'select valeur from parametres where filiale_id = $1 and cle = $2',
          [filialeId, cle],
        );
        await client.query(
          `insert into parametres (id, filiale_id, categorie, cle, valeur, type_valeur)
                select f_generer_id('PARAM'), $1, c.categorie, c.cle, $3, c.type_valeur
                  from parametres c where c.filiale_id is null and c.cle = $2
           on conflict (filiale_id, cle) do update set valeur = excluded.valeur`,
          [filialeId, cle, brut],
        );
        await journaliser(client, {
          action: 'administration',
          filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          resume: 'Réglage modifié pour cette filiale.',
          entiteType: 'parametres',
          entiteId: cle,
          // ⚠️ Les valeurs vont en jsonb, jamais dans la phrase : §29.5, et un
          //    contrôle statique le vérifie.
          valeursAvant: ancien.rows[0] === undefined ? null : { valeur: ancien.rows[0].valeur },
          valeursApres: { valeur: brut },
        });
        return { valeur: brut, herite: false };
      });

      return await reponse.status(200).send(resultat);
    },
  );
}
