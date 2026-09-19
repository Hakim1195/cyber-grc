/**
 * `src/portail/` — LE PORTAIL FOURNISSEUR (lot L28)
 *
 * 🛑 **LE PREMIER COMPOSANT DU PRODUIT EXPOSÉ HORS VPN.** Jusqu'ici tout vivait
 * derrière un VPN ; ce greffon ouvre une porte sur l'extérieur. Sa consigne est
 * écrite au `docs/PLAN_PRODUIT.md` : *en cas de doute sur ce lot, on ne livre pas.*
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET`  | `/portail/questionnaire` | ce que le lien ouvre — et **rien d'autre** |
 * | `POST` | `/portail/reponses` | enregistrer des réponses |
 * | `POST` | `/portail/reprendre` | reprendre les réponses d'une campagne précédente |
 * | `POST` | `/portail/terminer` | déclarer terminé, et recevoir une **attestation** |
 *
 * ── ⚠️ LA SESSION DU PORTAIL N'EST PAS UNE SESSION DU PRODUIT (28.2) ──────
 *
 * Elle ne traverse pas `resoudre()`, elle n'a pas de profil, elle ne porte **aucun
 * domaine**. Son périmètre est celui **d'un seul objet** : un questionnaire, dans une
 * filiale. Toute lecture y ajoute un `where questionnaire_id = $1` **en plus** de la
 * RLS — deux barrières, parce que c'est ici que la première coûterait le plus cher.
 *
 * ⚠️ **C'est la surface la plus propice à une fuite entre filiales de tout le
 * produit**, et le plan le dit : la porte S15 y rejoue la grille §4 **entière**.
 *
 * ── ⚠️ AUCUN CHEMIN DE DÉPÔT PARALLÈLE (28.3) ────────────────────────────
 *
 * Un fichier venu de l'extérieur passe par **la** chaîne du lot L6 — ses huit
 * contrôles, ClamAV compris —, pas par une variante « simplifiée » écrite pour le
 * portail : *c'est ainsi qu'on se retrouve avec deux chaînes dont une seule est
 * éprouvée.* Le portail monte donc `greffonPieces` **tel quel**, dans sa propre portée,
 * derrière sa propre authentification. Il n'en réécrit pas une ligne.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { journaliser } from '../auth/journal.js';
import type { Configuration } from '../config/index.js';
import { avecTransaction } from '../db/pool.js';
import type { PerimetreSession } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';
import { greffonPieces } from '../pieces/index.js';

import { filialeDuLien, lienDeLaRequete, noterUsage, verifierLien } from './liens.js';
import type { AccesPortail } from './liens.js';

export const PREFIXE_PORTAIL = '/portail';

/** Bornes (contrôle S13). La surface est publique : elles comptent davantage. */
const REPONSES_MAX = 500;
const COMMENTAIRE_MAX = 2000;

export interface OptionsPortail {
  readonly pool: Pool;
  readonly config: Configuration;
}

declare module 'fastify' {
  interface FastifyRequest {
    accesPortail?: AccesPortail;
  }
}

/**
 * Le périmètre d'une session de portail.
 *
 * ⚠️ **`administrationGroupe: false`, `perimetreGroupe: false`, UNE filiale.** Rien
 * ici ne se déduit d'une valeur reçue : tout vient du lien, qui vient de la base.
 */
export function perimetreDuPortail(acces: AccesPortail): PerimetreSession {
  return Object.freeze({
    utilisateurId: `portail:${acces.lienId}`,
    filialeId: acces.filialeId,
    filiales: Object.freeze([acces.filialeId]) as readonly string[],
    perimetreGroupe: false,
    administrationGroupe: false,
  });
}

/** 404, jamais 403. Un 403 confirmerait que la cible existe (contrôle S12). */
function introuvable(detail: string): ErreurApplicative {
  return new ErreurApplicative({
    code: 'ressource_inconnue',
    statut: 404,
    message:
      'Ce lien n’est plus valable. Il a peut-être expiré, ou été révoqué. ' +
      'Demandez-en un nouveau à votre interlocuteur.',
    detailJournal: detail,
  });
}

export async function greffonPortail(
  instance: FastifyInstance,
  options: OptionsPortail,
): Promise<void> {
  const { pool, config } = options;

  /* ── L'AUTHENTIFICATION DU PORTAIL ────────────────────────────────────
   *
   * ⚠️ **Elle ne ressemble à rien d'autre dans le produit, et c'est voulu.** Pas de
   * cookie, pas de session en base, pas de profil : un secret présenté à chaque
   * requête, vérifié à chaque requête, et qui n'ouvre qu'un objet.
   *
   * ⚠️ **Le périmètre de lecture vient du SECRET** — `CONVENTIONS.md` §46. Sans cela,
   * `portail_liens` étant cloisonnée, la ligne serait invisible à la transaction qui
   * doit la lire, et **tout lien rendrait 404 à son premier usage**. C'est le défaut
   * mesuré le même jour au lot L22, et la règle a été écrite pour ne pas le refaire. */
  instance.addHook('onRequest', async (requete: FastifyRequest) => {
    const entete = requete.headers['x-grc-lien'];
    const requeteAvecQuery = requete.query as Record<string, unknown> | undefined;
    const secret =
      lienDeLaRequete(Array.isArray(entete) ? entete[0] : entete) ??
      lienDeLaRequete(requeteAvecQuery?.['lien']);
    if (secret === null) throw introuvable('portail : aucun lien présenté');

    const filiale = filialeDuLien(secret);
    if (filiale === null) throw introuvable('portail : lien de forme inattendue');

    const verdict = await avecTransaction(
      pool,
      {
        utilisateurId: 'portail',
        filialeId: filiale,
        filiales: [filiale],
        perimetreGroupe: false,
        administrationGroupe: false,
      },
      async (client) => {
        const resultat = await verifierLien(client, secret);
        if ('refus' in resultat) return resultat;
        await noterUsage(client, resultat.acces.lienId);
        return resultat;
      },
    );

    if ('refus' in verdict) {
      // ⚠️ Les quatre motifs sont distincts ICI et indiscernables au-dehors.
      throw introuvable(`portail : lien refusé, motif « ${verdict.refus} »`);
    }

    requete.accesPortail = verdict.acces;
    // ⚠️ **La session du produit est fabriquée ICI**, avec un périmètre d'un seul
    // objet et AUCUN domaine. C'est ce qui permet de monter `greffonPieces` tel
    // quel : la chaîne de dépôt lit `requete.sessionGrc`, comme partout ailleurs.
    requete.sessionGrc = {
      perimetre: perimetreDuPortail(verdict.acces),
      droits: { niveau: 'contribution', domaines: ['tiers'], export: false },
    } as SessionAppliquee;
  });

  const accesDe = (requete: FastifyRequest): AccesPortail => {
    const acces = requete.accesPortail;
    if (acces === undefined) throw introuvable('portail : accès absent après le crochet');
    return acces;
  };

  /* -------------------------------------------------------------------
   *  GET /portail/questionnaire — ce que le lien ouvre, et RIEN d'autre
   * ------------------------------------------------------------------- */
  instance.get(
    '/questionnaire',
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const acces = accesDe(requete);
      const charge = await avecTransaction(
        pool,
        perimetreDuPortail(acces),
        async (client) => {
          const { rows: entetes } = await client.query(
            `select q.id, q.intitule, q.ref_id, q.echeance, q.envoye_le, q.recu_le,
                    f.raison_sociale as filiale
               from questionnaires_tiers q
               left join filiales f on f.id = q.filiale_id
              where q.id = $1`,
            [acces.questionnaireId],
          );
          if (entetes.length === 0) return null;

          // ⚠️ **Les QUESTIONS viennent du catalogue de référentiels** (lot L26),
          // qui est de portée Groupe : elles ne disent rien de la filiale.
          const { rows: questions } = await client.query(
            `select e.code, e.titre, d.nom as domaine
               from referentiel_exigences e
               left join referentiel_domaines d
                      on d.id = e.domaine_id and d.referentiel_id = e.referentiel_id
              where e.referentiel_id = $1
              order by d.rang, e.rang`,
            [entetes[0].ref_id],
          );

          // ⚠️ **Un `where questionnaire_id` EN PLUS de la RLS.** Deux barrières :
          // la RLS borne la filiale, celui-ci borne l'objet. C'est ici que la
          // première coûterait le plus cher si elle cédait.
          const { rows: reponses } = await client.query(
            `select code, reponse, commentaire, reprise_donnee_le
               from questionnaire_reponses
              where questionnaire_id = $1
              order by code`,
            [acces.questionnaireId],
          );
          return { entete: entetes[0], questions, reponses };
        },
      );

      if (charge === null) throw introuvable('portail : questionnaire absent');

      await avecTransaction(pool, perimetreDuPortail(acces), async (client) => {
        await journaliser(client, {
          action: 'portail_ouverture',
          resume: 'Ouverture du portail fournisseur par un lien.',
          filialeId: acces.filialeId,
          utilisateurLibelle: `portail:${acces.lienId}`,
          adresseIp: requete.ip,
          entiteType: 'questionnaires_tiers',
          entiteId: acces.questionnaireId,
        });
      });

      // ⚠️ **Aucune donnée du client au-delà du questionnaire.** Pas de liste de
      // prestataires, pas de mesures, pas de risques : le fournisseur voit son
      // questionnaire, et rien d'autre (critère 28.2).
      return await reponse.send({
        questionnaire: {
          intitule: charge.entete.intitule,
          referentiel: charge.entete.ref_id,
          echeance: charge.entete.echeance,
          envoyeLe: charge.entete.envoye_le,
          termine: charge.entete.recu_le !== null,
          demandeur: charge.entete.filiale,
        },
        destinataire: acces.destinataire,
        questions: charge.questions,
        reponses: charge.reponses,
      });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /portail/reponses
   * ------------------------------------------------------------------- */
  instance.post(
    '/reponses',
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const acces = accesDe(requete);
      const corps = (requete.body ?? {}) as Record<string, unknown>;
      const brut = Array.isArray(corps['reponses']) ? corps['reponses'] : [];
      if (brut.length === 0 || brut.length > REPONSES_MAX) {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message: 'Envoyez entre une et 500 réponses à la fois.',
          detailJournal: `portail : ${String(brut.length)} réponses hors bornes`,
        });
      }

      const ecrites = await avecTransaction(
        pool,
        perimetreDuPortail(acces),
        async (client) => {
          let n = 0;
          for (const piece of brut) {
            if (typeof piece !== 'object' || piece === null) continue;
            const sac = piece as Record<string, unknown>;
            const code = typeof sac['code'] === 'string' ? sac['code'].slice(0, 60) : '';
            const valeur =
              typeof sac['reponse'] === 'string' ? sac['reponse'].slice(0, 60) : '';
            if (code === '' || valeur === '') continue;
            const commentaire =
              typeof sac['commentaire'] === 'string'
                ? sac['commentaire'].slice(0, COMMENTAIRE_MAX)
                : null;

            // ⚠️ **Une réponse SAISIE ICI perd sa date d'origine** : elle n'est plus
            // une reprise, elle est une réponse donnée aujourd'hui. Laisser la date
            // d'une reprise sur une valeur modifiée serait présenter du neuf comme
            // de l'ancien — ou l'inverse, qui est un faux en audit (28.6).
            await client.query(
              `insert into questionnaire_reponses
                   (filiale_id, questionnaire_id, code, reponse, commentaire)
               values ($1, $2, $3, $4, $5)
               -- ⚠️ L'unicité porte (filiale_id, questionnaire_id, code) — elle est
               -- CLOISONNÉE, comme toutes les unicités du produit (§19.1). La nommer
               -- à moitié rend 42P10, et c'est ce que le banc a dit.
               on conflict (filiale_id, questionnaire_id, code) do update
                  set reponse = excluded.reponse,
                      commentaire = excluded.commentaire,
                      reprise_de_id = null,
                      reprise_donnee_le = null`,
              [acces.filialeId, acces.questionnaireId, code, valeur, commentaire],
            );
            n += 1;
          }

          await journaliser(client, {
            action: 'portail_reponse',
            resume: 'Réponses enregistrées depuis le portail fournisseur.',
            filialeId: acces.filialeId,
            utilisateurLibelle: `portail:${acces.lienId}`,
            adresseIp: requete.ip,
            entiteType: 'questionnaires_tiers',
            entiteId: acces.questionnaireId,
            valeursApres: { enregistrees: n },
          });
          return n;
        },
      );

      return await reponse.send({ enregistrees: ecrites });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /portail/reprendre — action 28.6
   * -------------------------------------------------------------------
   *  ⚠️ **Une réponse reprise porte SA DATE D'ORIGINE, et l'écran la montre.**
   *  Une réponse de 2024 présentée comme neuve serait un faux en audit.
   * ------------------------------------------------------------------- */
  instance.post(
    '/reprendre',
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const acces = accesDe(requete);
      const reprises = await avecTransaction(
        pool,
        perimetreDuPortail(acces),
        async (client) => {
          // ⚠️ **Le questionnaire précédent est cherché PAR LE MÊME PRESTATAIRE ET
          // LE MÊME RÉFÉRENTIEL**, dans la même filiale. Le fournisseur ne peut donc
          // pas reprendre les réponses d'un autre : la requête ne lui laisse aucun
          // paramètre, et la RLS borne par-dessus.
          const { rows } = await client.query<{ n: string }>(
            `with courant as (
                 select id, filiale_id, prestataire_id, ref_id
                   from questionnaires_tiers where id = $1
             ), precedent as (
                 select q.id, q.recu_le
                   from questionnaires_tiers q, courant c
                  where q.filiale_id = c.filiale_id
                    and q.prestataire_id = c.prestataire_id
                    and q.ref_id = c.ref_id
                    and q.id <> c.id
                    and q.recu_le is not null
                  order by q.recu_le desc
                  limit 1
             )
             insert into questionnaire_reponses
                 (filiale_id, questionnaire_id, code, reponse, commentaire,
                  reprise_de_id, reprise_donnee_le)
             select c.filiale_id, c.id, r.code, r.reponse, r.commentaire,
                    r.id,
                    /* ── ⚠️ LA DATE D'ORIGINE, ET CE QU'ELLE N'EST PAS ──────────
                     *
                     * Elle VOYAGE : si la réponse reprise était elle-même une reprise,
                     * c'est la date la plus ancienne qui compte. Sans ce coalesce,
                     * une réponse vieillirait d'une campagne à chaque reprise et
                     * redeviendrait « neuve » — exactement le faux qu'on ferme.
                     *
                     * ⚠️ **Et le repli est « recu_le » DU QUESTIONNAIRE PRÉCÉDENT,
                     * pas « cree_le » de la ligne.** La première rédaction prenait
                     * « cree_le », et le banc l'a démentie : « cree_le » est la date où la LIGNE est
                     * entrée dans ce système — pour des réponses arrivées par le
                     * moteur d'import du lot L7, c'est la date de l'import, pas celle
                     * de la réponse. « recu_le » est le jour où le fournisseur a
                     * réellement rendu sa copie, et c'est la date qu'un auditeur
                     * reconnaît. */
                    coalesce(r.reprise_donnee_le, p.recu_le, r.cree_le::date)
               from questionnaire_reponses r, courant c, precedent p
              where r.questionnaire_id = p.id
             on conflict (filiale_id, questionnaire_id, code) do nothing
             returning 1 as n`,
            [acces.questionnaireId],
          );
          await journaliser(client, {
            action: 'portail_reponse',
            resume: 'Reprise des réponses d’une campagne précédente.',
            filialeId: acces.filialeId,
            utilisateurLibelle: `portail:${acces.lienId}`,
            adresseIp: requete.ip,
            entiteType: 'questionnaires_tiers',
            entiteId: acces.questionnaireId,
            valeursApres: { reprises: rows.length },
          });
          return rows.length;
        },
      );
      return await reponse.send({ reprises });
    },
  );

  /* -------------------------------------------------------------------
   *  POST /portail/terminer — action 28.7, l'attestation
   * -------------------------------------------------------------------
   *  ⚠️ **C'est ce qui fait qu'un fournisseur accepte de répondre sérieusement :
   *  il y gagne quelque chose.** Un récapitulatif de ce qu'IL a déclaré, daté,
   *  qu'il peut resservir à ses autres clients.
   *
   *  ⚠️ **Aucune donnée du client n'y figure** — ni le nom de la filiale, ni
   *  l'intitulé interne de la campagne, ni quoi que ce soit du demandeur.
   * ------------------------------------------------------------------- */
  instance.post(
    '/terminer',
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const acces = accesDe(requete);
      const attestation = await avecTransaction(
        pool,
        perimetreDuPortail(acces),
        async (client) => {
          await client.query(
            `update questionnaires_tiers set recu_le = current_date
              where id = $1 and recu_le is null`,
            [acces.questionnaireId],
          );
          const { rows } = await client.query<{
            ref_id: string;
            total: string;
            repondues: string;
          }>(
            `select q.ref_id,
                    (select count(*) from referentiel_exigences e
                      where e.referentiel_id = q.ref_id)::text as total,
                    (select count(*) from questionnaire_reponses r
                      where r.questionnaire_id = q.id)::text as repondues
               from questionnaires_tiers q where q.id = $1`,
            [acces.questionnaireId],
          );
          await journaliser(client, {
            action: 'portail_reponse',
            resume: 'Questionnaire déclaré terminé depuis le portail.',
            filialeId: acces.filialeId,
            utilisateurLibelle: `portail:${acces.lienId}`,
            adresseIp: requete.ip,
            entiteType: 'questionnaires_tiers',
            entiteId: acces.questionnaireId,
          });
          return rows[0] ?? null;
        },
      );

      if (attestation === null) throw introuvable('portail : questionnaire absent');

      return await reponse.send({
        attestation: {
          // ⚠️ Le destinataire est le FOURNISSEUR lui-même : c'est son attestation.
          fournisseur: acces.destinataire,
          referentiel: attestation.ref_id,
          questions: Number.parseInt(attestation.total, 10),
          repondues: Number.parseInt(attestation.repondues, 10),
          etablieLe: new Date().toISOString().slice(0, 10),
          mention:
            'Ce récapitulatif atteste des réponses que vous avez déclarées, à la date ' +
            'ci-dessus. Il n’engage que vous, et ne porte aucune donnée du demandeur.',
        },
      });
    },
  );

  /* -------------------------------------------------------------------
   *  LE DÉPÔT DE PREUVE — action 28.3
   * -------------------------------------------------------------------
   *  ⚠️ **`greffonPieces` est monté TEL QUEL.** Pas une variante, pas une
   *  route « simplifiée » : *c'est ainsi qu'on se retrouve avec deux chaînes
   *  dont une seule est éprouvée.* Les huit contrôles du lot L6 — extension,
   *  type déclaré, taille, signature binaire, écriture, empreinte, ClamAV,
   *  quarantaine — s'exercent sur un fichier venu de l'Internet public
   *  exactement comme sur un fichier déposé depuis le VPN.
   * ------------------------------------------------------------------- */
  await instance.register(greffonPieces, { pool, config });
}
