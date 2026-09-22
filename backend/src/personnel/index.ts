/**
 * `src/personnel/` — **L'ANNUAIRE DU PRODUIT ALIMENTÉ DEPUIS L'ACTIVE DIRECTORY**
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/api/personnel/annuaire`            | chercher des personnes dans l'AD |
 * | `POST` | `/api/personnel/annuaire/importer`   | en créer les fiches, dans la filiale ACTIVE |
 * | `POST` | `/api/personnel/annuaire/rafraichir` | remettre les fiches rattachées à jour, et SIGNALER les départs |
 *
 * ════════════════════════════════════════════════════════════════════════
 *  POURQUOI CE LOT EXISTE
 * ════════════════════════════════════════════════════════════════════════
 *
 * Utilisateur, 22/09/2026 : *« je voulais que les gens cités ici soient également
 * les comptes AD des gens, car au final le personnel en vrai ce sont aussi les
 * salariés, donc ça serait logique de trouver les gens qui sont concernés et que
 * ça soit également directement depuis l'AD. »*
 *
 * ⚠️ **LA MOITIÉ EXISTAIT DÉJÀ, ET ELLE ÉTAIT INVISIBLE.**
 * `personnes.utilisateur_id` existe depuis la migration `002`, et
 * `EntitesService.synchroniserAnnuaire()` aligne la fiche de quiconque **ouvre
 * une session** sur ce que l'annuaire dit de lui — nom d'affichage, `title` →
 * fonction, `department` → service, courriel, téléphone —, avec trois
 * précautions déjà écrites : rattachement par COMPTE et jamais par le nom (un
 * homonyme ne capture pas la fiche), reprise d'une fiche saisie à la main **une
 * seule fois**, et rien n'est écrasé par du vide.
 *
 * Ce qui manquait tient en trois points, et ce lot les ferme :
 *
 *  1. **la synchronisation ne se déclenche qu'à la CONNEXION**, donc uniquement
 *     pour les gens qui ont un compte GRC. Un salarié qui ne se connecte jamais
 *     — la plupart — n'apparaît jamais. D'où la RECHERCHE et l'IMPORT ;
 *  2. **rien ne le montrait à l'écran** : `utilisateur_id` est une colonne
 *     réservée, et le module « Personnel » ne pouvait même pas afficher « compte
 *     d'annuaire ». D'où le champ dérivé `_compteAd` ;
 *  3. **aucune re-synchronisation** : un changement de service, une mutation, un
 *     départ ne remontaient jamais aux fiches de ceux qui ne se connectent pas.
 *     D'où `rafraichir`.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  🛑 LES QUATRE DÉCISIONS QUI TIENNENT CE LOT
 * ════════════════════════════════════════════════════════════════════════
 *
 * **1. On n'importe PAS l'annuaire entier.** Importer tout l'AD, c'est importer
 * les données personnelles de gens qui ne sont **pas** utilisateurs de l'outil —
 * `personnes.nom`, `email` et `telephone` figurent au registre de l'article 30
 * du produit lui-même. La recherche exige un **filtre**, et l'import une
 * **liste de logins choisis** : on importe les personnes DÉSIGNABLES, celles qui
 * peuvent porter une responsabilité. C'est la minimisation de l'article 5.1.c,
 * appliquée à notre propre outil.
 *
 * **2. L'import écrit dans la FILIALE ACTIVE, et cela suffit.** Une table de
 * correspondance « unité d'organisation → filiale » avait été envisagée : elle
 * aurait été une **seconde source** pour ce que la session dit déjà. L'écran
 * interroge l'unité d'organisation qu'on lui donne, et écrit là où la session
 * écrit — la règle de tout le produit, sans exception à retenir.
 *
 * **3. 🛑 UN DÉPART NE SUPPRIME RIEN. IL SE SIGNALE.** Une personne partie porte
 * encore douze actions, trois documents et une place dans la cellule de crise :
 * effacer sa fiche les orphelinerait **en silence**, et les entités stockent le
 * nom en texte libre — le lien ne se reconstituerait pas. `rafraichir` rend donc
 * la liste des comptes **désactivés ou disparus** de l'annuaire, et c'est un
 * humain qui décide. Le produit ne déprovisionne pas à la place des RH.
 *
 * **4. Ce qui ne change PAS** : les entités métier continuent de stocker le nom
 * en **texte libre**. C'est ce qui garantit le round-trip d'un export
 * `grc-backup`, et c'est écrit dans le commentaire de la table depuis L1. Le
 * rattachement n'apporte pas une clé étrangère : il apporte un **nom
 * d'affichage qui fait autorité** et un compte sans ambiguïté.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { ServiceAuthentification } from '../auth/index.js';
import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import { avecTransaction } from '../db/pool.js';
import { engendrerIdentifiant, verifierIdentifiant } from '../entites/index.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';

export const PREFIXE = '/api/personnel/annuaire';

/** Plafond d'une recherche. Au-delà, on affine le filtre — on n'aspire pas. */
const RESULTATS_MAX = 100;
/** Plafond d'un import. Un geste d'import reste un geste, pas un transfert. */
const IMPORT_MAX = 200;
/** Plafond de fiches rafraîchies en une fois : chacune coûte un aller-retour LDAP. */
const RAFRAICHIR_MAX = 200;

export interface OptionsPersonnel {
  readonly pool: Pool;
  readonly serviceAuthentification?: ServiceAuthentification;
}

interface LigneFiche {
  readonly id: string;
  readonly nom: string;
  readonly fonction: string | null;
  readonly service: string | null;
  readonly email: string | null;
  readonly telephone: string | null;
  readonly utilisateur_id: string | null;
  readonly login_annuaire: string | null;
  /** Le login à interroger : celui de la fiche, ou celui de son compte. */
  readonly identifiant: string | null;
}

export async function greffonPersonnel(
  instance: FastifyInstance,
  options: OptionsPersonnel,
): Promise<void> {
  const { pool } = options;
  const auth = options.serviceAuthentification;

  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: "route d'annuaire atteinte sans session appliquée",
      });
    }
    return session;
  };

  const exigerAnnuaire = (): ServiceAuthentification => {
    if (auth === undefined || !auth.annuaireDisponible()) {
      throw new ErreurApplicative({
        code: 'indisponible',
        statut: 503,
        message:
          'L’annuaire n’est pas configuré sur ce déploiement (`AUTH_LDAP_ACTIF=non`) : il ' +
          'n’y a rien à chercher. Les fiches du personnel se saisissent alors à la main, ' +
          'comme avant.',
      });
    }
    return auth;
  };

  /** La filiale d'écriture de la session — celle où l'import atterrit. */
  const filialeActive = (session: SessionAppliquee): string => {
    const filiale = session.perimetre.filialeId;
    if (filiale === null || filiale === '') {
      throw new ErreurApplicative({
        code: 'hors_perimetre',
        statut: 403,
        message:
          'Aucune filiale active : choisissez la filiale dans laquelle importer ces ' +
          'personnes. Une fiche d’annuaire appartient à un site, comme toute donnée du ' +
          'produit.',
      });
    }
    return filiale;
  };

  /* -------------------------------------------------------------------
   *  GET /api/personnel/annuaire?recherche=…&base=…
   * -------------------------------------------------------------------
   *  ⚠️ **L'appel LDAP est fait HORS transaction.** Tenir une connexion
   *  PostgreSQL pendant un aller-retour vers un annuaire qui peut ne pas
   *  répondre épuise le pool à la première panne d'AD — et le produit
   *  devient alors injoignable pour tout le monde à cause d'un écran de
   *  recherche.
   * ------------------------------------------------------------------- */
  instance.get(
    PREFIXE,
    { config: { acces: { action: 'lire', domaine: 'personnel' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const q = requete.query as { recherche?: unknown; base?: unknown } | undefined;

      /* ⚠️ **L'entrée se valide AVANT la disponibilité**, et l'ordre compte : un
       * filtre d'un caractère est malformé que l'annuaire soit configuré ou non.
       * Rendre 503 sur une demande invalide enverrait l'exploitant vérifier sa
       * configuration pour une faute de frappe. */
      const texte = typeof q?.recherche === 'string' ? q.recherche.trim() : '';
      if (texte.length < 2) {
        throw entreeInvalide(
          'Indiquez au moins deux caractères. On n’aspire pas un annuaire : on y cherche ' +
            'les personnes qu’on veut pouvoir désigner.',
        );
      }
      const base = typeof q?.base === 'string' && q.base.trim() !== '' ? q.base.trim() : null;

      /* ⚠️ **Et l'absence d'annuaire se DIT, elle ne se rend pas comme une liste
       * vide.** « Aucun annuaire à interroger » et « personne ne correspond » sont
       * deux faits différents, et les confondre ferait croire à l'exploitant que
       * l'annuaire de son client ne contient personne. Classe Q-201 / Q-207. */
      const service = exigerAnnuaire();
      const lu = await service.rechercherPersonnesAnnuaire(texte, base);
      if (lu === undefined) return await reponse.status(200).send({ personnes: [], tronque: false });

      // Ce que la filiale a DÉJÀ : l'écran doit distinguer « à importer » de
      // « déjà là », sinon on crée des doublons en croyant compléter.
      const connus = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => {
          const r = await client.query<{ identifiant: string }>(
            `select u."identifiant"
               from "personnes" p
               join "utilisateurs" u on u."id" = p."utilisateur_id"
              where p."utilisateur_id" is not null`,
          );
          return new Set(r.rows.map((x) => x.identifiant.toLowerCase()));
        },
        { lectureSeule: true },
      );

      return await reponse.status(200).send({
        personnes: lu.personnes.map((p) => ({
          ...p,
          dejaRattachee: connus.has(p.login.toLowerCase()),
        })),
        tronque: lu.tronque,
        max: RESULTATS_MAX,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/personnel/annuaire/importer   { logins: [...] }
   * ------------------------------------------------------------------- */
  instance.post(
    `${PREFIXE}/importer`,
    { config: { acces: { action: 'ecrire', domaine: 'personnel' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const corps = requete.body as { logins?: unknown } | undefined;
      const logins = Array.isArray(corps?.logins)
        ? [...new Set(corps.logins.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))]
        : [];
      if (logins.length === 0) throw entreeInvalide('Choisissez au moins une personne.');
      if (logins.length > IMPORT_MAX) {
        throw entreeInvalide(
          `Un import porte au plus ${IMPORT_MAX} personnes. Au-delà, c’est un transfert ` +
            'd’annuaire — et un transfert d’annuaire demande une décision que ce bouton ne ' +
            'porte pas.',
        );
      }

      // L'entrée validée, on exige l'annuaire — même ordre qu'à la recherche.
      const service = exigerAnnuaire();
      const filiale = filialeActive(session);

      /* ⚠️ **Toutes les lectures LDAP d'abord, la transaction ensuite.** Même
       * motif qu'à la recherche, et il compte davantage ici : la transaction
       * ÉCRIT, et la tenir ouverte pendant deux cents aller-retours réseau
       * bloquerait les lignes touchées tout ce temps. */
      const identites: {
        login: string;
        nom: string;
        email: string | null;
        telephone: string | null;
        service: string | null;
        fonction: string | null;
        desactive: boolean;
      }[] = [];
      const introuvables: string[] = [];
      for (const login of logins) {
        const identite = await service.relireIdentite(login);
        if (identite === null || identite === undefined) {
          introuvables.push(login);
          continue;
        }
        identites.push({
          login: identite.login,
          nom: identite.nomAffichage.trim(),
          email: identite.email,
          telephone: identite.telephone,
          service: identite.service,
          fonction: identite.fonction,
          desactive: identite.desactive,
        });
      }

      const bilan = await avecTransaction(pool, session.perimetre, async (client) => {
        let creees = 0;
        let misesAJour = 0;
        const desactives: string[] = [];

        for (const i of identites) {
          if (i.nom === '') continue;
          if (i.desactive) desactives.push(i.login);

          /* ⚠️ **Le rattachement se fait par COMPTE quand il existe, par le NOM
           * une seule fois sinon** — exactement la règle de
           * `synchroniserAnnuaire()`, et pour les mêmes raisons : un homonyme
           * d'une autre filiale ne peut pas capturer la fiche, et la bascule ne
           * crée pas un doublon là où la filiale avait déjà saisi la personne. */
          const utilisateur = await client.query<{ id: string }>(
            `select "id" from "utilisateurs" where lower("identifiant") = lower($1)`,
            [i.login],
          );
          const utilisateurId = utilisateur.rows[0]?.id ?? null;

          let existante: LigneFiche | null = null;
          if (utilisateurId !== null) {
            const r = await client.query<LigneFiche>(
              `select p."id", p."nom", p."fonction", p."service", p."email", p."telephone",
                      p."utilisateur_id", p."login_annuaire", null::text as identifiant
                 from "personnes" p
                where p."utilisateur_id" = $1 and p."filiale_id" = $2 limit 1`,
              [utilisateurId, filiale],
            );
            existante = r.rows[0] ?? null;
          }
          /* ⚠️ **La reprise par LOGIN vient AVANT la reprise par NOM**, et l'ordre
           * n'est pas indifférent : le login est exact, le nom est une
           * correspondance de chaîne. Sans ce premier passage, deux imports
           * successifs de la même personne créeraient deux fiches — l'unicité de
           * la migration `063` refuserait la seconde, et l'écran rendrait un 409
           * que personne ne comprendrait. */
          if (existante === null) {
            const r = await client.query<LigneFiche>(
              `select p."id", p."nom", p."fonction", p."service", p."email", p."telephone",
                      p."utilisateur_id", p."login_annuaire", null::text as identifiant
                 from "personnes" p
                where p."filiale_id" = $1 and lower(p."login_annuaire") = lower($2)
                limit 1`,
              [filiale, i.login],
            );
            existante = r.rows[0] ?? null;
          }
          if (existante === null) {
            const r = await client.query<LigneFiche>(
              `select p."id", p."nom", p."fonction", p."service", p."email", p."telephone",
                      p."utilisateur_id", p."login_annuaire", null::text as identifiant
                 from "personnes" p
                where p."filiale_id" = $1 and lower(p."nom") = lower($2)
                  and p."utilisateur_id" is null and p."login_annuaire" is null
                order by p."cree_le" limit 1`,
              [filiale, i.nom],
            );
            existante = r.rows[0] ?? null;
          }

          if (existante === null) {
            const id = engendrerIdentifiant('PERS');
            verifierIdentifiant(id);
            await client.query(
              `insert into "personnes"
                      ("id", "filiale_id", "utilisateur_id", "login_annuaire", "nom",
                       "fonction", "service", "email", "telephone")
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [id, filiale, utilisateurId, i.login, i.nom, i.fonction, i.service,
               i.email, i.telephone],
            );
            creees += 1;
          } else {
            /* ⚠️ **Rien n'est écrasé par du vide** : l'annuaire qui ne rend pas
             * de téléphone ne doit pas effacer celui que la filiale a saisi.
             * Seule une valeur RENSEIGNÉE par l'annuaire fait autorité — c'est
             * la règle de `synchroniserAnnuaire()`, reprise à l'identique. */
            const aEcrire: Record<string, string | null> = {};
            if (existante.nom !== i.nom) aEcrire['nom'] = i.nom;
            if (i.fonction !== null && existante.fonction !== i.fonction) {
              aEcrire['fonction'] = i.fonction;
            }
            if (i.service !== null && existante.service !== i.service) {
              aEcrire['service'] = i.service;
            }
            if (i.email !== null && existante.email !== i.email) aEcrire['email'] = i.email;
            if (i.telephone !== null && existante.telephone !== i.telephone) {
              aEcrire['telephone'] = i.telephone;
            }
            const rattacher = existante.utilisateur_id === null && utilisateurId !== null;
            // Une fiche saisie à la main et retrouvée par son nom gagne son login :
            // c'est ce qui la rendra rafraîchissable, et c'est tout l'objet de la `063`.
            const marquer = existante.login_annuaire === null;

            if (Object.keys(aEcrire).length > 0 || rattacher || marquer) {
              const colonnes = Object.keys(aEcrire);
              const valeurs = Object.values(aEcrire);
              const affectations = colonnes.map((c, n) => `"${c}" = $${String(n + 1)}`);
              if (rattacher) {
                affectations.push(`"utilisateur_id" = $${String(valeurs.length + 1)}`);
                valeurs.push(utilisateurId);
              }
              if (marquer) {
                affectations.push(`"login_annuaire" = $${String(valeurs.length + 1)}`);
                valeurs.push(i.login);
              }
              await client.query(
                `update "personnes" set ${affectations.join(', ')}
                  where "id" = $${String(valeurs.length + 1)}`,
                [...valeurs, existante.id],
              );
              misesAJour += 1;
            }
          }
        }

        /* La trace porte des CHIFFRES et des logins, jamais les fiches : le
         * journal garde trois ans, et y recopier nom, courriel et téléphone en
         * ferait un second annuaire que personne n'a décidé (§29). */
        await journaliser(client, {
          action: 'import',
          resume: `Import de ${String(identites.length)} fiche(s) depuis l’annuaire`,
          filialeId: filiale,
          utilisateurLibelle: session.perimetre.utilisateurId,
          entiteType: 'personnes',
          valeursApres: {
            demandes: logins.length,
            creees,
            mises_a_jour: misesAJour,
            introuvables: introuvables.length,
            desactives_dans_l_annuaire: desactives.length,
          },
        });

        return { creees, misesAJour, desactives };
      });

      return await reponse.status(200).send({
        ...bilan,
        introuvables,
        rappel:
          'Les entités métier continuent de stocker le NOM en texte libre : le ' +
          'rattachement apporte un nom d’affichage qui fait autorité, pas une clé ' +
          'étrangère. Rien de ce qui existait n’a été relié automatiquement.',
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /api/personnel/annuaire/rafraichir
   * -------------------------------------------------------------------
   *  🛑 **Il ne supprime RIEN.** Il remet à jour ce que l'annuaire dit, et
   *  SIGNALE les comptes désactivés ou disparus. Une personne partie porte
   *  encore des actions, des documents et une place dans la cellule de
   *  crise ; effacer sa fiche les orphelinerait en silence, et les entités
   *  stockant le nom en texte libre, le lien ne se reconstituerait pas.
   * ------------------------------------------------------------------- */
  instance.post(
    `${PREFIXE}/rafraichir`,
    { config: { acces: { action: 'ecrire', domaine: 'personnel' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const service = exigerAnnuaire();

      const fiches = await avecTransaction(
        pool,
        session.perimetre,
        async (client) => {
          const r = await client.query<LigneFiche>(
            /* ⚠️ **`coalesce` et `left join`, et c'est le correctif du jour.** La
             * première rédaction ne parcourait que les fiches rattachées à un
             * COMPTE — or l'import vise les gens qui ne se connectent JAMAIS, donc
             * ceux qui n'en ont pas. Le rafraîchissement ignorait exactement les
             * fiches qui en ont le plus besoin : une mutation, un changement de
             * service, un DÉPART n'y remontaient jamais. */
            `select p."id", p."nom", p."fonction", p."service", p."email", p."telephone",
                    p."utilisateur_id", p."login_annuaire",
                    coalesce(u."identifiant", p."login_annuaire") as identifiant
               from "personnes" p
               left join "utilisateurs" u on u."id" = p."utilisateur_id"
              where p."utilisateur_id" is not null or p."login_annuaire" is not null
              order by p."nom"
              limit $1`,
            [RAFRAICHIR_MAX],
          );
          return r.rows;
        },
        { lectureSeule: true },
      );

      // Toutes les lectures LDAP d'abord — voir l'import.
      const vues = new Map<
        string,
        { nom: string; email: string | null; telephone: string | null;
          service: string | null; fonction: string | null; desactive: boolean } | null
      >();
      for (const fiche of fiches) {
        if (fiche.identifiant === null) continue;
        const identite = await service.relireIdentite(fiche.identifiant);
        vues.set(
          fiche.id,
          identite === null || identite === undefined
            ? null
            : {
                nom: identite.nomAffichage.trim(),
                email: identite.email,
                telephone: identite.telephone,
                service: identite.service,
                fonction: identite.fonction,
                desactive: identite.desactive,
              },
        );
      }

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        let misesAJour = 0;
        const partis: { id: string; nom: string; login: string; motif: string }[] = [];

        for (const fiche of fiches) {
          const vue = vues.get(fiche.id);
          if (vue === undefined) continue;
          if (vue === null) {
            partis.push({
              id: fiche.id, nom: fiche.nom, login: fiche.identifiant ?? '',
              motif: 'disparu de l’annuaire',
            });
            continue;
          }
          if (vue.desactive) {
            partis.push({
              id: fiche.id, nom: fiche.nom, login: fiche.identifiant ?? '',
              motif: 'compte désactivé dans l’annuaire',
            });
          }

          const aEcrire: Record<string, string | null> = {};
          if (vue.nom !== '' && fiche.nom !== vue.nom) aEcrire['nom'] = vue.nom;
          if (vue.fonction !== null && fiche.fonction !== vue.fonction) {
            aEcrire['fonction'] = vue.fonction;
          }
          if (vue.service !== null && fiche.service !== vue.service) aEcrire['service'] = vue.service;
          if (vue.email !== null && fiche.email !== vue.email) aEcrire['email'] = vue.email;
          if (vue.telephone !== null && fiche.telephone !== vue.telephone) {
            aEcrire['telephone'] = vue.telephone;
          }
          if (Object.keys(aEcrire).length === 0) continue;

          const colonnes = Object.keys(aEcrire);
          const valeurs = Object.values(aEcrire);
          await client.query(
            `update "personnes" set ${colonnes.map((c, n) => `"${c}" = $${String(n + 1)}`).join(', ')}
              where "id" = $${String(colonnes.length + 1)}`,
            [...valeurs, fiche.id],
          );
          misesAJour += 1;
        }

        await journaliser(client, {
          action: 'administration',
          resume: `Rafraîchissement de ${String(fiches.length)} fiche(s) depuis l’annuaire`,
          filialeId: session.perimetre.filialeId,
          utilisateurLibelle: session.perimetre.utilisateurId,
          entiteType: 'personnes',
          valeursApres: {
            examinees: fiches.length,
            mises_a_jour: misesAJour,
            a_verifier: partis.length,
          },
        });

        return { examinees: fiches.length, misesAJour, partis };
      });

      return await reponse.status(200).send({
        ...resultat,
        tronque: fiches.length >= RAFRAICHIR_MAX,
        rappel:
          'Aucune fiche n’a été supprimée, et aucune ne le sera : une personne partie ' +
          'porte encore des actions, des documents et parfois une place dans la cellule ' +
          'de crise. C’est à vous de décider, en connaissance de ce qui pend à son nom.',
      });
    },
  );
}
