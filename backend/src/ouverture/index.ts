/**
 * `src/ouverture/` — LES JETONS D'API ET LES ABONNEMENTS (lot L22)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`    | `/api/ouverture/jetons` | les jetons de la filiale — **jamais leur secret** |
 * | `POST`   | `/api/ouverture/jetons` | en émettre un : le secret est rendu **une seule fois** |
 * | `DELETE` | `/api/ouverture/jetons/:id` | le révoquer — irréversible, daté, nominatif |
 * | `GET`    | `/api/ouverture/abonnements` | les abonnements aux événements, et l'état de la file |
 * | `POST`   | `/api/ouverture/abonnements` | s'abonner |
 * | `DELETE` | `/api/ouverture/abonnements/:id` | se désabonner |
 *
 * ── ⚠️ POURQUOI CES SIX ROUTES, ET NON LES ROUTES GÉNÉRIQUES ───────────────
 *
 * Partout ailleurs dans ce produit, une table neuve devient une **entité ordinaire** et
 * hérite des routes génériques — c'est l'arbitrage rendu pour les dérogations, l'AIPD,
 * les demandes de droits, les campagnes, EBIOS RM et les catalogues, et il tient.
 *
 * Il ne tient pas ici, pour une raison précise : **le secret d'un jeton n'existe qu'une
 * fois**. Il est fabriqué par le serveur, rendu à l'appelant, et n'est plus jamais
 * retrouvable — la base n'en a que l'empreinte. Une route générique de création reçoit
 * les champs du client et rend la ligne écrite : elle ne sait pas fabriquer une valeur
 * qu'elle ne stocke pas, et elle ne sait pas la rendre une seule fois.
 *
 * ⚠️ **Et les trois tables ne sont PAS des entités du registre**, donc elles ne voyagent
 * pas dans le fichier d'échange. C'est voulu, et c'est plus qu'une conséquence :
 * restaurer une sauvegarde ressusciterait des jetons révoqués depuis. Un accès qu'on a
 * coupé ne doit pas revenir par la porte de la reprise.
 *
 * ── LE DROIT D'ÉMETTRE ─────────────────────────────────────────────────────
 *
 * ⚠️ **Émettre un jeton exige l'ADMINISTRATION**, et pas seulement le domaine : c'est
 * créer un accès qui survit à la session de celui qui l'émet. Et le jeton **ne peut
 * jamais porter plus que le compte qui l'émet** — l'intersection est faite ici, à la
 * création, sur les trois axes : niveau, domaines, droit d'export.
 *
 * ⚠️ **La limite de ce choix, dite plutôt que tue** : si l'émetteur perd des droits
 * ensuite, le jeton garde les siens jusqu'à son expiration ou sa révocation. Les
 * revérifier à chaque appel exigerait d'interroger l'annuaire à chaque requête. La
 * réponse du produit est donc l'expiration **obligatoire**, la révocation immédiate, et
 * la trace nominative de l'émetteur.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { emettreJeton } from '../auth/jetons.js';
import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';

export const CHEMIN_JETONS = '/api/ouverture/jetons';
export const CHEMIN_ABONNEMENTS = '/api/ouverture/abonnements';

/** Bornes (contrôle S13). */
const JETONS_MAX = 200;
const ABONNEMENTS_MAX = 100;
const FILE_MAX = 200;
/** Un jeton ne vit pas plus de deux ans. Au-delà, ce n'est plus un jeton : c'est un mot de passe. */
const DUREE_MAX_JOURS = 730;
const DUREE_DEFAUT_JOURS = 90;

/** L'ordre des niveaux, du plus faible au plus fort — pour l'intersection. */
const ORDRE_NIVEAUX = ['lecture', 'contribution', 'administration'] as const;
type NiveauJeton = (typeof ORDRE_NIVEAUX)[number];

export interface OptionsOuverture {
  readonly pool: Pool;
}

/**
 * Le plus faible des deux niveaux.
 *
 * ⚠️ **C'est la moitié « niveau » de l'intersection**, et elle doit être écrite ici
 * plutôt que devinée : un jeton « administration » émis par un contributeur serait une
 * élévation de privilège par la porte qu'on vient d'ouvrir.
 */
function plusFaible(demande: string, porte: string): NiveauJeton {
  const rangDemande = ORDRE_NIVEAUX.indexOf(demande as NiveauJeton);
  const rangPorte = ORDRE_NIVEAUX.indexOf(porte as NiveauJeton);
  const rang = Math.min(rangDemande === -1 ? 0 : rangDemande, rangPorte === -1 ? 0 : rangPorte);
  return ORDRE_NIVEAUX[rang] ?? 'lecture';
}

export async function greffonOuverture(
  instance: FastifyInstance,
  options: OptionsOuverture,
): Promise<void> {
  const { pool } = options;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route d'ouverture atteinte sans session appliquée",
      });
    }
    return session;
  };

  const filialeDe = (session: SessionAppliquee): string => {
    const filiale = session.perimetre.filialeId;
    if (filiale === null) {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message:
          'Aucune filiale active. Un jeton et un abonnement appartiennent à une filiale : ' +
          'choisissez-en une avant de les gérer.',
        detailJournal: 'ouverture : aucune filiale active',
      });
    }
    return filiale;
  };

  const texte = (valeur: unknown, champ: string, maximum: number): string => {
    if (typeof valeur !== 'string' || valeur.trim() === '' || valeur.length > maximum) {
      throw new ErreurApplicative({
        code: 'donnee_invalide',
        statut: 400,
        message: `Le champ « ${champ} » est obligatoire et fait au plus ${String(maximum)} signes.`,
        detailJournal: `ouverture : champ ${champ} invalide`,
      });
    }
    return valeur.trim();
  };

  /* -------------------------------------------------------------------
   *  GET /api/ouverture/jetons
   * -------------------------------------------------------------------
   *  ⚠️ **L'empreinte NE SORT PAS.** Elle ne permet pas de retrouver le
   *  secret, mais elle permettrait de vérifier une hypothèse : celui qui
   *  a une liste de secrets possibles saurait lequel est le bon sans
   *  faire un seul appel — donc sans rien laisser au limiteur de rythme.
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_JETONS,
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const jetons = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query(
          `select j.id, j.nom, j.prefixe, j.emis_par, j.niveau, j.domaines,
                  j.peut_exporter, j.expire_le, j.revoque_le, j.revoque_par,
                  j.dernier_usage_le, j.usages, j.cree_le,
                  -- ⚠️ DÉRIVÉ, jamais rangé : un état « expiré » en colonne
                  -- vieillirait sans que rien n'écrive, et un jeton mort
                  -- passerait pour vivant jusqu'à ce qu'un traitement repasse.
                  case when j.revoque_le is not null then 'revoque'
                       when j.expire_le <= now()     then 'expire'
                       else 'actif' end as etat
             from jetons_api j
            order by j.cree_le desc
            limit $1`,
          [JETONS_MAX],
        );
        return rows;
      });
      return await reponse.send({ jetons });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/ouverture/jetons — le secret, une seule fois
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_JETONS,
    { config: { acces: { action: 'administrer', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const filiale = filialeDe(session);
      const corps = (requete.body ?? {}) as Record<string, unknown>;

      const nom = texte(corps['nom'], 'nom', 120);
      const jours = Number(corps['jours'] ?? DUREE_DEFAUT_JOURS);
      if (!Number.isFinite(jours) || jours < 1 || jours > DUREE_MAX_JOURS) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message:
            `La durée de vie d'un jeton est comprise entre 1 et ${String(DUREE_MAX_JOURS)} ` +
            'jours. Au-delà, ce n’est plus un jeton : c’est un mot de passe qui ne change jamais.',
          detailJournal: `ouverture : duree ${String(jours)} hors bornes`,
        });
      }

      // ── ⚠️ L'INTERSECTION AVEC LES DROITS DE L'ÉMETTEUR ──────────────
      //
      // C'est le critère 22.1 : *« un jeton ne peut jamais porter plus que le
      // compte qui l'a créé »*. Les trois axes sont intersectés, et chacun a
      // son mode de défaillance propre si on l'oublie :
      //   · le NIVEAU — un jeton « administration » émis par un contributeur
      //     serait une élévation de privilège ;
      //   · les DOMAINES — un jeton lirait le journal d'audit alors que son
      //     émetteur ne le peut pas ;
      //   · l'EXPORT — qui est une permission à part entière, jamais un
      //     niveau (`PLAN_SERVEUR` §3.3).
      const droits = session.droits;
      const demandes = Array.isArray(corps['domaines'])
        ? (corps['domaines'] as unknown[]).map((d) => String(d))
        : [];
      // ⚠️ La comparaison passe par une projection en chaînes : `droits.domaines` est
      // typé, `demandes` vient du réseau. Convertir le TYPÉ vers la chaîne, et non
      // l'inverse — un transtypage du côté de l'entrée ferait croire au compilateur
      // qu'une valeur du réseau est un domaine connu, ce qu'elle n'est pas encore.
      const permis = new Set<string>(droits.domaines.map((d) => String(d)));

      /* ── ⚠️ UN DOMAINE HORS DES DROITS FAIT REFUSER, IL N'EST PAS RETRANCHÉ ──
       *
       * La première rédaction écrivait `demandes.filter((d) => permis.has(d))` et
       * ne refusait que si la liste devenait vide. Le jeton rendu « marchait »,
       * sans le domaine demandé — et l'intégration échouait des semaines plus tard,
       * sur un 403 que personne ne rattachait à cette émission-là.
       *
       * C'est la classe des constats **Q-201 / Q-207** : un produit qui fait
       * silencieusement autre chose que ce qu'on lui a demandé apprend à ne plus
       * croire ce qu'il affiche. On refuse, et on nomme le domaine. */
      const refuses = demandes.filter((d) => !permis.has(d));
      if (refuses.length > 0) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message:
            `Votre compte ne porte pas ${refuses.length > 1 ? 'les domaines' : 'le domaine'} ` +
            `« ${refuses.join(' », « ')} » : un jeton ne peut pas porter plus que celui qui ` +
            'l’émet. Retirez-les de la demande, ou faites émettre le jeton par un compte ' +
            'qui les porte.',
          detailJournal: `ouverture : domaines ${JSON.stringify(refuses)} hors droits`,
        });
      }
      const domaines = demandes;
      if (domaines.length === 0) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message:
            'Choisissez au moins un domaine, parmi ceux que votre propre compte porte. ' +
            'Un jeton qui ne porte rien est un accès ouvert sans qu’on sache pour quoi.',
          detailJournal: 'ouverture : aucun domaine demandé',
        });
      }

      /* ── ⚠️ LE NIVEAU SE RABAT SUR LE PLUS FAIBLE DES DOMAINES DEMANDÉS ─────
       *
       * La première rédaction comparait au seul `droits.niveau`, qui est le
       * niveau **le plus élevé** que le compte porte, tous domaines confondus.
       * Or `droits.niveaux` donne le niveau PAR DOMAINE, et les deux diffèrent
       * exactement dans le cas qui compte : un compte administrateur de
       * l'application, mais simple lecteur sur les risques, aurait obtenu un
       * jeton « administration » **sur le domaine des risques**.
       *
       * Le jeton ne portant qu'UN niveau pour tous ses domaines, c'est le plus
       * faible des domaines demandés qui s'applique. Rabattre sur le plus fort
       * rendrait l'intersection décorative. */
      let plafond = droits.niveau;
      for (const domaine of domaines) {
        const parDomaine = droits.niveaux?.[domaine as keyof typeof droits.niveaux];
        plafond = plusFaible(plafond, parDomaine ?? droits.niveau);
      }
      const niveau = plusFaible(String(corps['niveau'] ?? 'lecture'), plafond);
      const peutExporter = corps['peut_exporter'] === true && droits.export;

      // ⚠️ Le secret PORTE sa filiale (voir `emettreJeton`) : c'est ce qui permet à
      // la vérification de poser son périmètre de lecture avant de chercher
      // l'empreinte, dans une table cloisonnée.
      const emis = emettreJeton(filiale);
      const expireLe = new Date(Date.now() + jours * 24 * 3600 * 1000);

      const ligne = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `insert into jetons_api
               (filiale_id, nom, empreinte, prefixe, emis_par, niveau, domaines,
                peut_exporter, expire_le)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           returning id`,
          [
            filiale,
            nom,
            emis.empreinte,
            emis.prefixe,
            session.perimetre.utilisateurId,
            niveau,
            domaines,
            peutExporter,
            expireLe.toISOString(),
          ],
        );
        const identifiant = rows[0]?.id ?? null;
        await journaliser(client, {
          action: 'administration',
          utilisateurLibelle: session.perimetre.utilisateurId,
          filialeId: filiale,
          entiteType: 'jetons_api',
          entiteId: identifiant,
          // ⚠️ §29.5 : aucune valeur d'utilisateur dans la phrase. Le nom du
          // jeton est une saisie libre — il vit dans l'entité désignée, pas ici.
          resume: 'Émission d’un jeton d’API.',
        });
        return identifiant;
      });

      return await reponse.status(201).send({
        id: ligne,
        prefixe: emis.prefixe,
        expire_le: expireLe.toISOString(),
        niveau,
        domaines,
        peut_exporter: peutExporter,
        // ⚠️ **LA SEULE FOIS OÙ LE SECRET EXISTE HORS DE LA MÉMOIRE DU SERVEUR.**
        // La base n'en a que l'empreinte : s'il est perdu, il n'y a pas de
        // « mot de passe oublié » — on en émet un autre et on révoque celui-ci.
        secret: emis.secret,
        avertissement:
          'Ce secret ne sera plus jamais affiché. Copiez-le maintenant : le serveur ' +
          'n’en garde qu’une empreinte, et ne sait pas le retrouver.',
      });
    },
  );

  /* -------------------------------------------------------------------
   *  DELETE /api/ouverture/jetons/:id — révoquer
   * -------------------------------------------------------------------
   *  ⚠️ **Révoquer n'est pas supprimer.** La ligne reste, datée et
   *  nominative : savoir qu'un accès a existé, qui l'a émis et qui l'a
   *  coupé est exactement ce qu'un audit vient chercher. Une suppression
   *  effacerait la question en même temps que la réponse.
   * ------------------------------------------------------------------- */
  instance.delete(
    `${CHEMIN_JETONS}/:id`,
    { config: { acces: { action: 'administrer', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const identifiant = String((requete.params as { id?: unknown }).id ?? '');

      const touchees = await avecTransaction(pool, session.perimetre, async (client) => {
        const resultat = await client.query(
          `update jetons_api
              set revoque_le = now(), revoque_par = $2
            where id = $1 and revoque_le is null`,
          [identifiant, session.perimetre.utilisateurId],
        );
        if ((resultat.rowCount ?? 0) > 0) {
          await journaliser(client, {
            action: 'administration',
            utilisateurLibelle: session.perimetre.utilisateurId,
            filialeId: session.perimetre.filialeId,
            entiteType: 'jetons_api',
            entiteId: identifiant,
            resume: 'Révocation d’un jeton d’API.',
          });
        }
        return resultat.rowCount ?? 0;
      });

      // ⚠️ **404 et non 403** quand le jeton n'existe pas, n'est pas dans le
      // périmètre, ou est déjà révoqué : les trois cas sont indiscernables pour
      // l'appelant. Distinguer « pas à vous » de « inexistant » ferait de cette
      // route un oracle d'existence (contrôle S12).
      if (touchees === 0) {
        throw new ErreurApplicative({
          code: 'ressource_inconnue',
          statut: 404,
          message: 'Ce jeton n’existe pas, ou il est déjà révoqué.',
          detailJournal: `ouverture : révocation sans effet sur ${identifiant}`,
        });
      }
      return await reponse.send({ revoque: true });
    },
  );

  /* -------------------------------------------------------------------
   *  GET /api/ouverture/abonnements
   * ------------------------------------------------------------------- */
  instance.get(
    CHEMIN_ABONNEMENTS,
    { config: { acces: { action: 'lire', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const etat = await avecTransaction(pool, session.perimetre, async (client) => {
        const abonnements = await client.query(
          `select a.id, a.evenement, a.nom, a.url, a.actif, a.dernier_envoi_le,
                  a.dernier_statut, a.echecs_consecutifs,
                  (a.secret_signature is not null) as signe,
                  (select count(*)::int from evenements_sortants e
                    where e.abonnement_id = a.id and e.statut in ('en_attente', 'echec'))
                    as en_attente
             from abonnements_evenements a
            order by a.evenement, a.nom
            limit $1`,
          [ABONNEMENTS_MAX],
        );
        // L'état de la file, pour que l'écran dise si quelque chose part.
        const file = await client.query(
          `select e.statut, count(*)::int as n
             from evenements_sortants e group by e.statut order by 1`,
        );
        const derniers = await client.query(
          `select e.id, e.evenement, e.statut, e.tentatives, e.cree_le, e.envoye_le,
                  e.dernier_detail
             from evenements_sortants e
            order by e.cree_le desc
            limit $1`,
          [FILE_MAX],
        );
        /* ── ⚠️ LES ÉVÉNEMENTS RÉELLEMENT ÉMIS, ET LA LEÇON QUI VA AVEC ────
         *
         * Ce n'est **pas** la liste qu'admet `ck_abonnements_evenements_evenement` :
         * les deux diffèrent au moment exact où cela compte — un événement admis
         * par la contrainte et qu'aucun émetteur ne produit donnerait un abonnement
         * qui a l'air en place et ne se déclenche jamais.
         *
         * ⚠️ **Et ce n'est pas non plus le seul catalogue des déclencheurs**, ce
         * qu'était la première rédaction. Elle a été vue **en cliquant sur la
         * recette** : le menu déroulant ne proposait que trois événements sur
         * quatre, `echeance_franchie` manquant — parce qu'un franchissement
         * d'échéance n'est l'insertion d'AUCUNE ligne et qu'aucun déclencheur ne
         * peut le voir. *La correction du matin, refaite d'un cran plus haut le
         * soir même, dans l'écran écrit pour la porter.*
         *
         * La source est donc `f_evenements_emis()`, la déclaration que la migration
         * `056` confronte au catalogue dans les deux sens. */
        const emis = await client.query<{ evenement: string }>(
          'select evenement from f_evenements_emis() order by 1',
        );
        return {
          abonnements: abonnements.rows,
          file: file.rows,
          derniers: derniers.rows,
          evenementsEmis: emis.rows.map((r) => r.evenement),
        };
      });
      return await reponse.send(etat);
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/ouverture/abonnements
   * ------------------------------------------------------------------- */
  instance.post(
    CHEMIN_ABONNEMENTS,
    { config: { acces: { action: 'administrer', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const filiale = filialeDe(session);
      const corps = (requete.body ?? {}) as Record<string, unknown>;

      const evenement = texte(corps['evenement'], 'evenement', 64);
      const nom = texte(corps['nom'], 'nom', 120);
      const url = texte(corps['url'], 'url', 500);
      if (!url.startsWith('https://')) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message:
            'La destination doit être en « https:// ». La charge porte le nom de votre ' +
            'filiale et l’identifiant d’un incident de sécurité : en clair sur le réseau, ' +
            'c’est une fuite — et elle serait invisible, puisque l’envoi « réussit ».',
          detailJournal: 'ouverture : URL non chiffrée refusée',
        });
      }

      // Le secret de signature, fabriqué par le serveur comme celui d'un jeton :
      // l'abonné en a besoin pour vérifier que l'événement vient bien de nous.
      // ⚠️ La signature d'un webhook n'est pas un jeton d'API : elle ne sert jamais à
      // s'authentifier ici, et sa marque de filiale est sans objet. On passe la
      // filiale quand même — le format reste unique, et un second fabricant de
      // secrets serait un générateur de plus (`CONVENTIONS.md` §2).
      const signature = emettreJeton(filiale);

      const identifiant = await avecTransaction(pool, session.perimetre, async (client) => {
        const { rows } = await client.query<{ id: string }>(
          `insert into abonnements_evenements
               (filiale_id, evenement, nom, url, secret_signature)
           values ($1, $2, $3, $4, $5) returning id`,
          // ⚠️ **EN CLAIR, et c'est nécessaire** : un secret de signature est partagé
          // par construction — les deux bouts doivent le connaître. En garder une
          // empreinte rendrait la signature incalculable. Voir le commentaire de la
          // colonne, migration `053` : son vol permet de forger des événements VERS
          // l'abonné, jamais de lire quoi que ce soit ici.
          [filiale, evenement, nom, url, signature.secret],
        );
        const cree = rows[0]?.id ?? null;
        await journaliser(client, {
          action: 'administration',
          utilisateurLibelle: session.perimetre.utilisateurId,
          filialeId: filiale,
          entiteType: 'abonnements_evenements',
          entiteId: cree,
          resume: 'Abonnement à un événement sortant.',
        });
        return cree;
      });

      return await reponse.status(201).send({
        id: identifiant,
        evenement,
        // Même règle que pour un jeton : le secret n'existe qu'une fois.
        secret: signature.secret,
        avertissement:
          'Ce secret de signature ne sera plus jamais affiché. Il sert à votre outil à ' +
          'vérifier que l’événement vient bien de nous.',
      });
    },
  );

  /* -------------------------------------------------------------------
   *  DELETE /api/ouverture/abonnements/:id
   * -------------------------------------------------------------------
   *  ⚠️ Ici, on SUPPRIME — contrairement au jeton. Un abonnement n'est pas
   *  un accès : c'est une destination. Le garder « révoqué » n'apprendrait
   *  rien à un audit, et la cascade emporte les événements en attente, qui
   *  n'ont plus de destination.
   * ------------------------------------------------------------------- */
  instance.delete(
    `${CHEMIN_ABONNEMENTS}/:id`,
    { config: { acces: { action: 'administrer', domaine: 'administration' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const identifiant = String((requete.params as { id?: unknown }).id ?? '');

      const touchees = await avecTransaction(pool, session.perimetre, async (client) => {
        const resultat = await client.query(
          `delete from abonnements_evenements where id = $1`,
          [identifiant],
        );
        if ((resultat.rowCount ?? 0) > 0) {
          await journaliser(client, {
            action: 'administration',
            utilisateurLibelle: session.perimetre.utilisateurId,
            filialeId: session.perimetre.filialeId,
            entiteType: 'abonnements_evenements',
            entiteId: identifiant,
            resume: 'Retrait d’un abonnement à un événement sortant.',
          });
        }
        return resultat.rowCount ?? 0;
      });

      if (touchees === 0) {
        throw new ErreurApplicative({
          code: 'ressource_inconnue',
          statut: 404,
          message: 'Cet abonnement n’existe pas.',
          detailJournal: `ouverture : retrait sans effet sur ${identifiant}`,
        });
      }
      return await reponse.send({ retire: true });
    },
  );
}
