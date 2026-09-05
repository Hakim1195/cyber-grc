/**
 * Les deux routes du lot L12 — état du relais, et **bouton de test**.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Enregistrement — la couture appartient à l'orchestrateur
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/api/index.ts` n'appartient pas à cet agent. La ligne à écrire, à côté de
 * celle des approbations :
 *
 *     await instance.register(greffonNotifications, { pool, config });
 *
 * `pool` **et** `config` sont obligatoires dans le type, exprès : c'est alors le
 * compilateur qui garantit l'existence des routes, et non la discipline de
 * quelqu'un. Le greffon du journal a payé l'autre choix — *« la consultation du
 * journal disparaissait en silence, et l'écran recevait un 404 qu'il ne pouvait
 * pas distinguer d'une absence de droits »*.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Route | Déclaration d'accès | Rend |
 * |---|---|---|
 * | `GET /api/notifications/etat` | `{ action: 'lire', domaine: 'administration' }` | l'état du relais et la date de la dernière relance de la filiale active |
 * | `POST /api/notifications/test` | `{ action: 'ecrire', domaine: 'administration' }` | expédie **un** message de vérification à l'adresse d'annuaire de l'appelant |
 *
 * ── Trois choses que ces routes ne font pas, et pourquoi ─────────────────
 *
 *  1. **Aucune ne prend d'adresse.** Le corps de `POST /test` est vide et le
 *     schéma le refuse autrement. C'est la règle 3 du §36.2 tenue **par la
 *     forme** : il n'existe aucun champ où écrire une adresse, donc aucun moyen
 *     de faire du produit un relais de courriel arbitraire. Le destinataire est
 *     l'appelant lui-même, retrouvé dans `personnes` — l'annuaire, la seule
 *     source admise.
 *  2. **Aucune ne déclenche la campagne de relances.** Elle appartient au
 *     minuteur systemd (`deploy/systemd/cyber-grc-notifications.timer`). Une
 *     route qui l'ouvrirait donnerait à une session le moyen d'expédier vingt
 *     filiales de courriels d'un clic — et de rejouer la fenêtre anti-doublon
 *     pour rien. Un exploitant qui veut forcer un passage joue
 *     `systemctl start cyber-grc-notifications.service`, ce qui est tracé par
 *     systemd **et** au journal d'audit.
 *  3. **Aucune ne rend de secret.** `GET /etat` dit l'hôte, le port, le mode de
 *     chiffrement et le mode d'authentification — jamais `SMTP_MOT_DE_PASSE`,
 *     jamais `SMTP_OAUTH_CLIENT_SECRET`. Le contrôle S8 se lit à froid trois ans
 *     plus tard ; une réponse d'API se lit aujourd'hui, dans un navigateur.
 *
 * ⚠️ **`POST /test` est un envoi, donc un acte tracé** : action `administration`
 * au journal, avec **un** destinataire — le nombre, jamais l'adresse (§36.3).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import type { Configuration } from '../config/index.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';
import { composerTest } from './message.js';
import { lireReglages } from './reglages.js';
import { ErreurSmtp, expedier } from './smtp.js';

export interface OptionsNotifications {
  /** Pool de connexions du serveur. Obligatoire : voir l'entête. */
  readonly pool: Pool;
  /** Configuration complète : le relais et l'URL publique des liens. Obligatoire. */
  readonly config: Configuration;
}

/**
 * Le corps de `POST /test` est **vide**.
 *
 * ⚠️ **Ce schéma sert au diagnostic, pas à la sûreté** — et il faut le dire dans
 * cet ordre, parce que l'inverse serait faux et rassurant.
 *
 * Ce qui protège est **structurel** : le gestionnaire de cette route ne lit
 * jamais `requete.body`. Il n'existe donc aucune valeur du corps, quel qu'en soit
 * le nom, qui puisse choisir un destinataire. `test/notifications/routes.test.mjs`
 * le vérifie mécaniquement, sur le texte de ce fichier — comme
 * `test/journal-lecture/routes.test.mjs` interdit tout `statut: 403` dans le
 * corps de `src/api/journal.ts`.
 *
 * Le schéma ajoute deux choses par-dessus :
 *
 *  · `additionalProperties: false` — Fastify compile avec `removeAdditional:
 *    true` : une propriété inconnue est donc **retirée en silence**, jamais
 *    refusée. Mesuré (le premier essai de cette route attendait un 400 et
 *    recevait un 200) ;
 *  · les trois noms ci-dessous, déclarés `not: {}` pour produire un **400
 *    explicite** — même geste que le champ `id` de `SCHEMA_CREATION`
 *    (`src/api/index.ts`, constat M-3). Un client qui croit pouvoir choisir le
 *    destinataire l'apprend, au lieu de croire que ça a marché.
 *
 * ⚠️ Cette liste est écrite à la main et elle est **incomplète par nature** : un
 * quatrième nom serait retiré en silence. C'est acceptable ICI, et seulement
 * ici, parce que son omission ne produit aucun envoi indu — le gestionnaire ne
 * lit pas le corps. Ce n'est pas une barrière, c'est un message d'erreur.
 */
const SCHEMA_TEST_VIDE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    destinataire: { not: {} },
    a: { not: {} },
    email: { not: {} },
  },
} as const;

export { envoyerRelances, FENETRE_RELANCE_HEURES, HORIZON_RELANCE_JOURS } from './relances.js';
export type { BilanFiliale, BilanRelances, OptionsRelances } from './relances.js';
export { lireReglages } from './reglages.js';
export type { ReglagesNotifications, SourceReglages } from './reglages.js';

// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonNotifications(
  instance: FastifyInstance,
  options: OptionsNotifications,
): Promise<void> {
  const { pool, config } = options;
  // Réglages lus par `reglages.ts` : `config` d'abord, l'environnement en repli
  // tant que la couture n'est pas branchée. Lus UNE fois, à l'enregistrement :
  // une configuration ne change pas sans redémarrage du service.
  const reglages = lireReglages(config);

  /** Fail-closed, comme `sessionDe` des autres greffons. */
  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal:
          `route « ${requete.method} ${requete.routeOptions.url ?? requete.url} » atteinte sans ` +
          'session appliquée : le crochet onRequest du greffon parent ne s’est pas exécuté',
      });
    }
    return session;
  };

  /**
   * Retrouve l'adresse **d'annuaire** de l'appelant.
   *
   * Deux critères dans une seule requête, ordonnés : le compte applicatif
   * d'abord (`personnes.utilisateur_id`, alimenté par le provisionnement AD),
   * le nom affiché ensuite — une fiche saisie à la main n'a pas de compte lié.
   * Deux requêtes successives auraient été deux règles qui divergent.
   *
   * ⚠️ La Row Level Security s'applique : une personne hors périmètre n'est pas
   * rendue, et l'appelant ne peut donc pas se faire expédier le message à
   * l'adresse de quelqu'un d'une autre filiale.
   */
  const adresseDe = async (client: PoolClient, session: SessionAppliquee): Promise<string> => {
    const login = session.perimetre.utilisateurId;
    const nomAffichage = session.identite?.nomAffichage ?? '';
    const { rows } = await client.query<{ email: string }>(
      `select p."email",
              (case when u."identifiant" is not null then 0 else 1 end) as "rang"
         from "personnes" p
         left join "utilisateurs" u
                on u."id" = p."utilisateur_id" and lower(u."identifiant") = lower($1)
        where p."email" is not null and btrim(p."email") <> ''
          and (u."identifiant" is not null
               or ($2 <> '' and lower(btrim(p."nom")) = lower(btrim($2))))
        order by "rang", p."id"
        limit 1`,
      [login, nomAffichage],
    );
    const trouvee = rows[0];
    if (trouvee === undefined) {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 409,
        message:
          "Aucune adresse de courriel n'est associée à votre compte dans l'annuaire. Un message de vérification ne peut partir que vers une adresse de l'annuaire.",
        detailJournal: `aucune ligne de « personnes » avec adresse pour ${login}`,
      });
    }
    return trouvee.email;
  };

  /* -------------------------------------------------------------------
   *  GET /api/notifications/etat
   * ------------------------------------------------------------------- */
  instance.get(
    '/api/notifications/etat',
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const { perimetre } = sessionDe(requete);

      const derniere = await avecTransaction(
        pool,
        perimetre,
        async (client) => {
          const { rows } = await client.query<{ valeur: string | null }>(
            `select "valeur" from "parametres"
              where "cle" = 'notifications.derniere_relance'
                and "filiale_id" = $1`,
            [perimetre.filialeId],
          );
          return rows[0]?.valeur ?? null;
        },
        { lectureSeule: true },
      );

      return reponse.send({
        actif: reglages.actif,
        // Aucun secret : voir le point 3 de l'entête.
        hote: reglages.actif ? reglages.relais.hote : null,
        port: reglages.actif ? reglages.relais.port : null,
        chiffrement: reglages.relais.chiffrement,
        mode_auth: reglages.relais.modeAuth,
        expediteur: reglages.actif ? reglages.expediteur : null,
        redirection_recette: reglages.redirectionRecette !== null,
        derniere_relance: derniere,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/notifications/test — le « bouton de test » du §1.11
   * ------------------------------------------------------------------- */
  instance.post(
    '/api/notifications/test',
    {
      schema: { body: SCHEMA_TEST_VIDE },
      config: { acces: { action: 'ecrire', domaine: 'administration' } },
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const { perimetre } = session;

      if (!reglages.actif) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 409,
          message:
            "Aucun relais de messagerie n'est configuré (SMTP_ACTIF). Renseignez-le dans /etc/cyber-grc/env avant de lancer une vérification.",
          detailJournal: 'POST /api/notifications/test avec SMTP_ACTIF=non',
        });
      }

      const adresse = await avecTransaction(pool, perimetre, (c) => adresseDe(c, session), {
        lectureSeule: true,
      });
      const destination = reglages.redirectionRecette ?? adresse;
      const redigee = composerTest(reglages.urlPublique);

      let expedie = false;
      let motif: string | null = null;
      try {
        await expedier(
          {
            de: { adresse: reglages.expediteur, nom: reglages.nomExpediteur },
            a: destination,
            sujet: redigee.sujet,
            corps: redigee.corps,
          },
          reglages.relais,
        );
        expedie = true;
      } catch (erreur) {
        // ⚠️ Un relais injoignable n'est PAS une erreur du serveur : c'est le
        // résultat que la vérification cherchait. La route rend 200 avec
        // `expedie: false` et le motif — un 500 aurait fait croire à une panne
        // du produit, et un 502 aurait été rejoué par le navigateur.
        motif = erreur instanceof ErreurSmtp ? erreur.message : String(erreur);
        requete.log.warn({ motif }, 'Vérification du relais : échec.');
      }

      await avecTransaction(pool, perimetre, async (client) => {
        await journaliser(client, {
          action: 'administration',
          resume: 'Vérification du relais de messagerie',
          utilisateurLibelle: session.identite?.login ?? perimetre.utilisateurId,
          filialeId: perimetre.filialeId,
          valeursApres: {
            // Le NOMBRE, jamais l'adresse (§36.3).
            destinataires: 1,
            expedie,
            ...(motif === null ? {} : { motif_echec: motif }),
          },
        });
      });

      return reponse.send({ expedie, motif });
    },
  );
}
