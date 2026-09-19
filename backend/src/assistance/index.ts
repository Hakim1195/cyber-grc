/**
 * `src/assistance/` — L'ASSISTANCE PAR IA (lot L27, arbitrage A1 du 08/09/2026)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/assistance/etat` | le mode de cette filiale, les usages ouverts, l'avertissement |
 * | `POST` | `/api/assistance/preparer` | compose l'invite et la REND, **sans rien envoyer** |
 * | `POST` | `/api/assistance/demander` | envoie, et rend un verdict |
 * | `GET`  | `/api/assistance/appels` | ce qui est parti, et ce qui est revenu |
 *
 * ── ⚠️ POURQUOI DEUX ROUTES LÀ OÙ UNE SUFFIRAIT ───────────────────────────
 *
 * `preparer` existe pour la **barrière n° 4** : *« ce qui part est minimisé, et MONTRÉ
 * avant de partir ; l'utilisateur voit le texte exact qui sera transmis, et peut
 * l'annuler »*. Une seule route qui composerait et enverrait dans le même appel rendrait
 * cette promesse invérifiable — l'écran montrerait ce qu'il aurait composé lui-même, pas
 * ce que le serveur a envoyé.
 *
 * ⚠️ **Les deux composent par la MÊME fonction**, et `demander` recompose au lieu de
 * faire confiance au texte que le client renvoie. Sinon un client pourrait soumettre
 * autre chose que ce qu'il a montré : *la barrière protégerait l'utilisateur honnête et
 * personne d'autre.*
 *
 * ── ⚠️ CE QUE CE GREFFON N'ÉCRIT JAMAIS ───────────────────────────────────
 *
 * Rien, dans les données métier. **L'IA propose, un humain décide** : ce que
 * l'utilisateur retient repart par les routes ordinaires, avec leurs contrôles
 * ordinaires. Les seules écritures d'ici sont la **trace** de l'appel — barrière n° 5,
 * *une porte dérobée dont personne ne sait qu'elle a servi n'est pas une porte de secours*.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import type { Configuration } from '../config/index.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

import { soumettre, transportReel } from './fournisseur.js';
import type { TransportAssistance } from './fournisseur.js';
import { composer, estUsageConnu, USAGES } from './usages.js';
import type { Matiere, UsageAssistance } from './usages.js';

export const CHEMIN_ETAT = '/api/assistance/etat';
export const CHEMIN_PREPARER = '/api/assistance/preparer';
export const CHEMIN_DEMANDER = '/api/assistance/demander';
export const CHEMIN_APPELS = '/api/assistance/appels';

/** Bornes (contrôle S13). */
const APPELS_MAX = 100;
const MATIERE_MAX = 40;

export interface OptionsAssistance {
  readonly pool: Pool;
  readonly config: Configuration;
  readonly transport?: TransportAssistance;
}

interface LigneActivation {
  readonly mode: string;
  readonly destination: string;
  readonly usages: string[];
  readonly actif: boolean;
  readonly fournisseur: string;
  readonly lieu_hebergement: string;
}

export async function greffonAssistance(
  instance: FastifyInstance,
  options: OptionsAssistance,
): Promise<void> {
  const { pool, config } = options;
  const transport = options.transport ?? transportReel;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route d'assistance atteinte sans session appliquée",
      });
    }
    return session;
  };

  /** L'activation de la filiale ACTIVE, ou `null` — c'est-à-dire le mode local. */
  const activationDe = async (session: SessionAppliquee): Promise<LigneActivation | null> =>
    await avecTransaction(pool, session.perimetre, async (client) => {
      const { rows } = await client.query<LigneActivation>(
        `select mode, destination, usages, actif, fournisseur, lieu_hebergement
           from ia_activation where filiale_id = $1`,
        [session.perimetre.filialeId],
      );
      return rows[0] ?? null;
    });

  const usageDe = (corps: Record<string, unknown>): UsageAssistance => {
    const brut = String(corps['usage'] ?? '');
    if (!estUsageConnu(brut)) {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message:
          `« ${brut.slice(0, 40)} » n’est pas un usage de l’assistance. Cinq sont ` +
          'arbitrés, et pas un de plus.',
        detailJournal: `assistance : usage inconnu ${JSON.stringify(brut).slice(0, 80)}`,
      });
    }
    return brut;
  };

  const matiereDe = (corps: Record<string, unknown>): Matiere[] => {
    const brut = corps['matiere'];
    if (!Array.isArray(brut)) return [];
    return brut.slice(0, MATIERE_MAX).flatMap((piece) => {
      if (typeof piece !== 'object' || piece === null) return [];
      const sac = piece as Record<string, unknown>;
      const etiquette = typeof sac['etiquette'] === 'string' ? sac['etiquette'] : '';
      const valeur = typeof sac['valeur'] === 'string' ? sac['valeur'] : '';
      if (etiquette === '' || valeur === '') return [];
      return [{ etiquette, valeur }];
    });
  };

  /**
   * Le mode de cette filiale, et ce qu'il autorise.
   *
   * ⚠️ **Une filiale sans ligne d'activation est en mode LOCAL**, et c'est le défaut
   * qui n'a besoin de rien. L'absence est sûre ; c'est l'ouverture qui demande un geste.
   *
   * ⚠️ **Et une filiale sans activation NE PEUT PAS déclencher un appel externe**,
   * même en empruntant l'écran d'une filiale qui l'a : le mode est résolu **ici**, à
   * partir de la filiale ACTIVE de la session, et jamais d'une valeur du client.
   */
  const modeDe = async (
    session: SessionAppliquee,
    usage: UsageAssistance,
  ): Promise<{ mode: 'local' | 'externe'; destination?: string }> => {
    const activation = await activationDe(session);
    if (activation === null || !activation.actif) return { mode: 'local' };
    if (!config.assistance.externeAutorisee) {
      // ⚠️ La ligne existe, et la barrière n° 1 a été retirée depuis : on retombe en
      // LOCAL, pas en erreur. Retirer l'autorisation doit refermer la porte, pas
      // casser le produit.
      return { mode: 'local' };
    }
    if (!activation.usages.includes(usage)) {
      // ⚠️ Ouvrir le mode externe n'ouvre pas tous les usages d'un coup : un usage
      // non déclaré reste LOCAL, et l'écran le dit.
      return { mode: 'local' };
    }
    return { mode: 'externe', destination: activation.destination };
  };

  /* -------------------------------------------------------------------
   *  GET /api/assistance/etat
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ETAT,
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const activation = await activationDe(session);
      const externe =
        activation !== null && activation.actif && config.assistance.externeAutorisee;

      return await reponse.send({
        usages: USAGES,
        // Le modèle local est-il installé ? Sinon, l'écran doit le dire AVANT que
        // l'utilisateur compose une demande qui rendra « indisponible ».
        localConfigure: config.assistance.urlLocale !== '',
        mode: externe ? 'externe' : 'local',
        usagesExternes: externe ? activation.usages : [],
        // ⚠️ **BARRIÈRE N° 6** : l'avertissement est PERMANENT tant que le mode est
        // actif — pas une fenêtre à fermer. Même mécanique que le bandeau du profil
        // découverte (18.2 b), pour la même raison : *ce qu'on ne voit pas devient
        // une habitude*.
        avertissement: externe
          ? `Assistance EXTERNE active : ce que vous soumettez part chez ${activation.fournisseur}` +
            ` (hébergement : ${activation.lieu_hebergement}). Chaque envoi est journalisé.`
          : null,
        fournisseur: externe ? activation.fournisseur : null,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/assistance/preparer — barrière n° 4 : MONTRER avant d'envoyer
   * -------------------------------------------------------------------
   *  ⚠️ **Elle n'envoie rien, et elle n'écrit rien.** C'est une composition
   *  pure : l'écran affiche ce qu'elle rend, et l'utilisateur décide.
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_PREPARER,
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = (requete.body ?? {}) as Record<string, unknown>;
      const usage = usageDe(corps);
      const invite = composer(usage, matiereDe(corps));
      const mode = await modeDe(session, usage);

      return await reponse.send({
        usage,
        mode: mode.mode,
        destination: mode.destination ?? null,
        // Le texte EXACT qui partira. C'est le point de la route.
        texte: invite.texte,
        attendu: invite.attendu,
        octets: Buffer.byteLength(invite.texte, 'utf8'),
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/assistance/demander
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_DEMANDER,
    { config: { acces: { action: 'lire', domaine: null } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = (requete.body ?? {}) as Record<string, unknown>;
      const usage = usageDe(corps);

      // ⚠️ **ON RECOMPOSE, on ne fait pas confiance au texte renvoyé par le client.**
      // Sinon la barrière n° 4 protégerait l'utilisateur honnête et personne d'autre :
      // un client pourrait montrer un texte et en soumettre un autre.
      const invite = composer(usage, matiereDe(corps));
      const mode = await modeDe(session, usage);

      /* ── L'APPEL A LIEU HORS TRANSACTION ────────────────────────────
       * Tenir une transaction ouverte pendant qu'un modèle réfléchit garderait un
       * verrou et une connexion du pool pendant tout le délai. C'est la même règle
       * qu'au lot L23, et elle a la même raison. */
      const resultat = await soumettre(
        { invite: invite.texte, mode: mode.mode, destination: mode.destination },
        config,
        transport,
      );

      await avecTransaction(pool, session.perimetre, async (client) => {
        await client.query(
          `insert into ia_appels
               (filiale_id, usage_ia, mode, destination, invite, reponse, verdict, octets)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            session.perimetre.filialeId,
            usage,
            mode.mode,
            mode.destination ?? null,
            invite.texte,
            resultat.texte,
            resultat.verdict,
            resultat.octets,
          ],
        );

        /* ── BARRIÈRE N° 5 : le journal d'audit, en AJOUT SEUL ─────────
         * ⚠️ **Seuls les appels EXTERNES y entrent.** Un appel local ne sort pas de
         * la machine : le tracer au journal inaltérable pendant trois ans en ferait
         * un registre d'usage du produit, ce qu'il n'est pas — et c'est le motif
         * exact du constat Q-301, où une route écrivait 3 750 entrées par jour.
         * ⚠️ §29.5 : la phrase est écrite ici, et ne porte aucune valeur saisie. */
        if (mode.mode === 'externe') {
          await journaliser(client, {
            action: 'ia_externe',
            resume: 'Envoi à une assistance externe.',
            filialeId: session.perimetre.filialeId,
            utilisateurLibelle: session.perimetre.utilisateurId,
            adresseIp: requete.ip,
            entiteType: 'ia_appels',
            valeursApres: {
              usage,
              destination: mode.destination ?? null,
              verdict: resultat.verdict,
              octets: resultat.octets,
            },
          });
        }
      });

      return await reponse.send({
        usage,
        mode: mode.mode,
        verdict: resultat.verdict,
        texte: resultat.texte,
        motif: resultat.motif,
        attendu: invite.attendu,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/assistance/appels
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_APPELS,
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const appels = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query(
          `select id, usage_ia, mode, destination, survenu_le, verdict, octets,
                  cree_par
             from ia_appels
            order by survenu_le desc
            limit $1`,
          [APPELS_MAX],
        );
        return rows;
      });
      // ⚠️ **Ni `invite`, ni `reponse` dans cette liste.** Elles peuvent nommer des
      // personnes — le registre de l'article 30 les déclare « personnelles » —, et
      // une liste d'audit n'a pas besoin du texte pour dire qui a envoyé quoi, quand
      // et où. Qui veut le texte ouvre l'appel, et cette lecture-là se trace.
      return await reponse.send({ appels });
    },
  );
}
