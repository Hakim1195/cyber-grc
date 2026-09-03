/**
 * Le greffon Fastify des routes de connexion — `POST` et `DELETE /api/connexion`.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi un greffon, et pas une route dans `src/api/`
 * ════════════════════════════════════════════════════════════════════════
 *
 * `CONVENTIONS.md` §26.2 : `src/auth/**` appartient à un agent, `src/api/**` à un
 * autre, et la route de connexion était **la seule surface que deux périmètres se
 * disputaient**. L'arbitrage est celui-ci : la route et sa logique vivent ici,
 * `src/api/index.ts` se contente d'un `register`. Aucun fichier n'est partagé.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat, et les trois points où il se joue
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **`POST /api/connexion` rend exactement la charge de `GET /api/session`**,
 *     à l'octet près. Le navigateur n'a alors qu'une seule forme à savoir lire,
 *     et le chemin « je viens de me connecter » ne diverge jamais de « je rouvre
 *     l'onglet ». Deux formes, c'est deux comportements, et le second n'est
 *     éprouvé par personne.
 *  2. **Le cookie ne porte ni `Max-Age` ni `Expires`.** L'expiration fait foi en
 *     base (`sessions.expire_le`, `derniere_activite`). Un cookie qui porte sa
 *     propre échéance est une échéance que le client peut mentir — même famille
 *     que « le périmètre vient du serveur ».
 *  3. **`DELETE /api/connexion` révoque en base**, il n'oublie pas le cookie. Un
 *     jeton dont le serveur a perdu la trace reste un jeton valable.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ OÙ CE GREFFON DOIT ÊTRE MONTÉ — et pourquoi ce n'est pas un détail
 * ════════════════════════════════════════════════════════════════════════
 *
 * `POST /api/connexion` est, par définition, appelé **sans session**. Or le
 * crochet `onRequest` du point d'entrée (`src/api/index.ts`) appelle
 * `authentifier()` sur toute requête qu'il voit, et rend 401 avant même de
 * regarder la classe d'accès de la route. Un greffon monté SOUS ce crochet
 * serait donc une route de connexion qui exige d'être déjà connecté — et le
 * défaut ne se verrait qu'à la première tentative réelle.
 *
 * **Ce greffon doit donc être enregistré sur une instance qui n'hérite pas de ce
 * crochet** : la racine du serveur, ou un contexte frère de celui de l'API — de
 * la même façon que `/api/sante`, qui vit à la racine pour rester joignable.
 * Les hooks de Fastify descendent aux enfants ; ils ne remontent pas.
 *
 * `CHEMIN_CONNEXION` est exporté pour que le montage n'ait pas à recopier le
 * chemin, et pour qu'un essai puisse vérifier que la route répond **sans**
 * cookie. C'est le seul contrôle qui distingue un montage correct d'un montage
 * qui compile.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { Configuration } from '../config/index.js';
import type { SessionAppliquee } from '../api/session.js';
import { ErreurApplicative } from '../erreurs/index.js';

import type { ServiceAuthentification } from './index.js';

/** Longueur maximale acceptée pour un identifiant et un mot de passe (S13). */
const LONGUEUR_MAX_IDENTIFIANT = 256;
const LONGUEUR_MAX_MOT_DE_PASSE = 512;

export interface OptionsGreffonConnexion {
  readonly service: ServiceAuthentification;
  readonly config: Configuration;
  /**
   * Rend la charge de `GET /api/session` pour une session appliquée. Fournie par
   * le point d'entrée, qui est le seul à savoir ce qu'il met dans cette réponse
   * — c'est ce qui garantit qu'elle est **la même**, et pas seulement semblable
   * (`CONVENTIONS.md` §26.2, « à l'octet près »).
   */
  readonly charteSession: (session: SessionAppliquee) => unknown;
}

interface CorpsConnexion {
  readonly identifiant?: unknown;
  readonly motDePasse?: unknown;
}

/**
 * Le nom des routes, exporté pour que le point d'entrée les exempte de son
 * contrôle d'authentification sans les recopier.
 */
export const CHEMIN_CONNEXION = '/api/connexion';

export const greffonConnexion: FastifyPluginAsync<OptionsGreffonConnexion> = async (
  instance: FastifyInstance,
  options: OptionsGreffonConnexion,
): Promise<void> => {
  const { service, config, charteSession } = options;

  instance.post(
    CHEMIN_CONNEXION,
    {
      // Le corps d'une connexion est minuscule. La borne est posée ici pour que
      // la route ne dépende pas de la borne globale du serveur (S13).
      bodyLimit: 4 * 1024,
    },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const corps = (requete.body ?? {}) as CorpsConnexion;
      const identifiant = texteBorne(corps.identifiant, LONGUEUR_MAX_IDENTIFIANT, 'identifiant');
      const motDePasse = texteBorne(corps.motDePasse, LONGUEUR_MAX_MOT_DE_PASSE, 'mot de passe');

      const resultat = await service.connecter({
        identifiant,
        motDePasse,
        adresseIp: typeof requete.ip === 'string' && requete.ip !== '' ? requete.ip : null,
        agentUtilisateur: enteteTexte(requete.headers['user-agent']),
      });

      reponse.header('set-cookie', cookieDeSession(config, resultat.jeton));
      // `no-store` sur la réponse qui porte la session : elle ne doit vivre dans
      // aucun cache intermédiaire, ni dans l'historique du navigateur (S10).
      reponse.header('cache-control', 'no-store');
      return charteSession(resultat.session);
    },
  );

  instance.delete(
    CHEMIN_CONNEXION,
    {},
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      await service.deconnecter(requete);
      // Le cookie est effacé même si aucune session n'a été trouvée : un jeton
      // périmé qui resterait dans le navigateur ferait reparaître un 401 à chaque
      // requête, et l'utilisateur croirait la déconnexion ratée.
      reponse.header('set-cookie', cookieEfface(config));
      reponse.header('cache-control', 'no-store');
      reponse.code(204);
      return null;
    },
  );
};

/* =====================================================================
 *  Le cookie
 * ===================================================================== */

/**
 * Construit l'en-tête `Set-Cookie` de la session.
 *
 * `HttpOnly` — inaccessible au script, donc à une injection de contenu ;
 * `SameSite=Strict` — jamais envoyé sur une navigation venue d'un autre site,
 * ce qui ferme la falsification de requête inter-site sans jeton dédié ;
 * `Secure` — piloté par `SESSION_COOKIE_SECURISE`, et la configuration refuse
 * de le désactiver en production ;
 * **ni `Max-Age` ni `Expires`** — voir le point 2 de l'entête.
 */
export function cookieDeSession(config: Configuration, jeton: string): string {
  const morceaux = [
    `${config.session.nomCookie}=${jeton}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (config.session.cookieSecurise) morceaux.push('Secure');
  return morceaux.join('; ');
}

/** Efface le cookie : même attributs, valeur vide, échéance dans le passé. */
export function cookieEfface(config: Configuration): string {
  const morceaux = [
    `${config.session.nomCookie}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (config.session.cookieSecurise) morceaux.push('Secure');
  return morceaux.join('; ');
}

/* =====================================================================
 *  Lecture du corps
 * ===================================================================== */

/**
 * Extrait une chaîne bornée du corps.
 *
 * Le refus est un **400 générique** : dire « le champ identifiant est absent »
 * n'apprend rien à un utilisateur légitime que l'écran ne lui dise déjà, et
 * renseigne un attaquant sur la forme attendue (S12). Le détail va au journal.
 */
function texteBorne(valeur: unknown, longueurMax: number, quoi: string): string {
  if (typeof valeur !== 'string' || valeur === '') {
    throw new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message: 'Identifiant et mot de passe sont attendus.',
      detailJournal: `champ « ${quoi} » absent ou du mauvais type`,
    });
  }
  if (valeur.length > longueurMax) {
    throw new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message: 'Identifiant et mot de passe sont attendus.',
      detailJournal: `champ « ${quoi} » de ${valeur.length} caractères, borne ${longueurMax}`,
    });
  }
  return valeur;
}

function enteteTexte(valeur: string | string[] | undefined): string | null {
  if (typeof valeur === 'string') return valeur;
  if (Array.isArray(valeur)) return valeur[0] ?? null;
  return null;
}
