/**
 * `src/sous-traitance/` — LE DOSSIER QU'ON REMET AU DONNEUR D'ORDRE
 * (migrations `070` et `071`, demande du RSSI du client — 24/09/2026)
 *
 * | Méthode | Route | Objet |
 * |---|---|---|
 * | `GET` | `/api/clients/:id/dossier` | « Comment nous traitons vos données », assemblé |
 *
 * ── ⚠️ AUCUNE ÉCRITURE ICI, ET C'EST LE MÊME ARBITRAGE QUE `src/tiers/` ──────
 *
 * Le donneur d'ordre, son registre de l'article 30 §2 et la déclaration de ses
 * sous-traitants ultérieurs sont des **entités ordinaires**
 * (`src/entites/index.ts`) : elles se créent, se modifient et se suppriment par
 * les routes génériques. Elles héritent donc du verrouillage optimiste, du
 * journal, du cloisonnement, de l'import généralisé (L7) et du round-trip
 * `grc-backup` **sans qu'une ligne soit écrite ici**. Un greffon d'écriture
 * propre aurait refait ces six choses, moins bien.
 *
 * Ce qui manque à cet assemblage, et que rien d'autre ne peut rendre, tient en
 * une question : *qu'est-ce qu'on montre au client ?* Un client ne lit pas six
 * écrans. Il lit un document, et ce document doit être vrai le jour où on
 * l'imprime.
 *
 * ── 🛑 LES QUATRE RÈGLES QUE CETTE ROUTE NE PEUT PAS ENFREINDRE ─────────────
 *
 * **1. LE PRODUIT NE TRANSMET RIEN.** Il assemble, un humain envoie. C'est la
 *    règle des formulaires ANSSI et CNIL (action 20.2) et celle du questionnaire
 *    fournisseur (21.2), et elle vaut ici mot pour mot : aucune adresse du client
 *    n'est appelée, aucun courriel n'est formé. Le bouton dira « préparer ».
 *
 * **2. LE DOSSIER DIT SES MANQUES, rubrique par rubrique.** *Un dossier à moitié
 *    rempli est plus dangereux qu'un dossier vide — vide, on le remplit ; à
 *    moitié rempli, on l'envoie.* Chaque rubrique rend `manques[]`, et le manque
 *    est NOMMÉ avec ce que le texte attend.
 *
 * **3. UNE RUBRIQUE QUE LA SESSION N'A PAS LE DROIT DE LIRE EST DITE RETENUE,
 *    JAMAIS OMISE.** C'est le constat **Q-335** : l'écran du journal faisait
 *    disparaître deux blocs sans un mot, et rien ne distinguait « il n'y a rien »
 *    de « on vous le cache ». Ici, un compte qui porte l'export RGPD mais pas le
 *    domaine « documents » reçoit `documents: { retenue: 'documents' }` — le
 *    dossier dit qu'il est incomplet, et pourquoi. Sans cela, il affirmerait
 *    « aucun document » à un client qui en a douze.
 *
 * **4. ELLE EXIGE LE DROIT D'EXPORT.** Un dossier de conformité complet est une
 *    extraction — c'est ce que le `PLAN_SERVEUR` §3.3 range parmi les
 *    extractions, et le contrôle S7 vérifie qu'aucune route ne rend un jeu
 *    complet sans ce droit. ⚠️ Le domaine exigé est **`rgpd`** et non `tiers` :
 *    le cœur du dossier est le registre de l'article 30 §2, dont le propriétaire
 *    est le DPO.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';

import type { SessionAppliquee } from '../api/session.js';
import { avecTransaction } from '../db/pool.js';
import { ErreurApplicative } from '../erreurs/index.js';
import { deciderAcces } from '../api/droits.js';
import type { DomaineFonctionnel } from '../api/droits.js';

/** Plafond de matière : aucune collection rendue n'est non bornée (motif Q-214 d). */
const DOSSIER_MAX = 500;

/** Une rubrique du dossier : rendue, ou RETENUE en le disant (règle 3 de l'entête). */
type Rubrique<T> = { readonly lignes: readonly T[] } | { readonly retenue: DomaineFonctionnel };

export async function greffonSousTraitance(
  instance: FastifyInstance,
  pool: Pool,
): Promise<void> {
  const sessionDe = (requete: FastifyRequest): SessionAppliquee => {
    const session = requete.sessionGrc;
    if (session === undefined) {
      throw new ErreurApplicative({
        code: 'erreur_interne',
        statut: 500,
        message: 'Le serveur ne peut pas traiter cette demande.',
        detailJournal: 'route du dossier client atteinte sans session appliquée',
      });
    }
    return session;
  };

  /**
   * Le dossier n'est pas un `select` : c'est un assemblage de rubriques, chacune
   * gardée par SON domaine. Cette fonction dit si la session peut lire une
   * rubrique — et son verdict est RENDU au demandeur, jamais avalé (règle 3 de
   * l'entête, constat Q-335).
   */
  const peutLire = (requete: FastifyRequest, domaine: DomaineFonctionnel): boolean =>
    deciderAcces(sessionDe(requete).droits, 'lire', domaine) === null;

  instance.get(
    '/api/clients/:id/dossier',
    { config: { acces: { action: 'exporter', domaine: 'rgpd' } } },
    async (requete: FastifyRequest, reponse: FastifyReply) => {
      const session = sessionDe(requete);
      const id = String((requete.params as Record<string, unknown>).id ?? '');
      if (id === '') {
        throw new ErreurApplicative({
          code: 'donnee_invalide',
          statut: 400,
          message: 'Le dossier se demande pour un donneur d’ordre précis.',
        });
      }

      const resultat = await avecTransaction(pool, session.perimetre, async (client) => {
        await client.query("set local timezone to 'UTC'");

        /* ── (1) L'IDENTITÉ, LE CONTRAT, ET CE QUE LE CLIENT IMPOSE ────────── */
        const { rows: clients } = await client.query(
          `select c.id, c.nom, c.secteur, c.pays, c.lei, c.entite_financiere_dora,
                  c.contact_rt_nom, c.contact_rt_email,
                  c.contact_dpo_nom, c.contact_dpo_email,
                  c.contrat_reference,
                  c.contrat_debut::text    as contrat_debut,
                  c.contrat_fin::text      as contrat_fin,
                  c.contrat_revue_le::text as contrat_revue_le,
                  c.droit_audit, c.fin_de_contrat, c.confidentialite_plancher,
                  c.notification_incident_h,
                  f.raison_sociale as filiale, f.code as filiale_code
             from clients c
             join filiales f on f.id = c.filiale_id
            where c.id = $1`,
          [id],
        );

        // ⚠️ **404 et jamais 403** : un donneur d'ordre de la filiale voisine est
        //    INVISIBLE par la RLS, et répondre « interdit » confirmerait qu'il
        //    existe. C'est la règle du lot L28 (« 404 jamais 403 ») appliquée ici.
        if (clients.length === 0) {
          throw new ErreurApplicative({
            code: 'ressource_inconnue',
            statut: 404,
            message: 'Ce donneur d’ordre est introuvable dans votre périmètre.',
          });
        }
        const c = clients[0] as Record<string, unknown>;

        /* ── (2) LE REGISTRE DE L'ARTICLE 30 §2 ─────────────────────────────
         * Le domaine de la route EST « rgpd » : cette rubrique est donc toujours
         * rendue, et la garder derrière un second contrôle serait du bruit. */
        const { rows: registre } = await client.query(
          `select t.id, t.intitule, t.categories_traitement, t.categories_donnees,
                  t.personnes_concernees, t.donnees_sensibles, t.instruction_reference,
                  t.transfert_hors_ue, t.transfert_garantie, t.duree_conservation,
                  t.fin_de_traitement, t.revue_le::text as revue_le,
                  coalesce(
                    (select count(*) from traitement_client_mesures m
                      where m.traitement_pour_client_id = t.id), 0) as mesures
             from traitements_pour_client t
            where t.client_id = $1
            order by t.intitule
            limit $2`,
          [id, DOSSIER_MAX],
        );

        /* ── (3) LES MESURES DE SÉCURITÉ RATTACHÉES (art. 30 §2 d, art. 32) ──
         * Domaine « conformite » : le pivot des mesures y vit. */
        let mesures: Rubrique<Record<string, unknown>>;
        if (peutLire(requete, 'conformite')) {
          const { rows } = await client.query(
            `select distinct mc.id, mc.nom,
                    mo.statut, mo.maturite
               from traitement_client_mesures m
               join traitements_pour_client t
                 on t.id = m.traitement_pour_client_id
               join mesure_catalogue mc on mc.id = m.mesure_id
               left join mesure_mise_en_oeuvre mo
                 on mo.mesure_id = mc.id and mo.filiale_id = m.filiale_id
              where t.client_id = $1
              order by mc.nom
              limit $2`,
            [id, DOSSIER_MAX],
          );
          mesures = { lignes: rows };
        } else {
          mesures = { retenue: 'conformite' };
        }

        /* ── (4) LES SOUS-TRAITANTS ULTÉRIEURS (art. 28 §2 et §4) ───────────
         * Domaine « tiers ». ⚠️ Le PAYS est rendu : un transfert hors Union se
         * voit là, et pas seulement dans le registre. */
        let sousTraitants: Rubrique<Record<string, unknown>>;
        if (peutLire(requete, 'tiers')) {
          const { rows } = await client.query(
            `select s.prestataire_id, p.societe, p.pays, p.pays_donnees, p.lei,
                    s.role, s.autorise_le::text as autorise_le
               from client_sous_traitants s
               join prestataires p on p.id = s.prestataire_id
              where s.client_id = $1
              order by p.societe
              limit $2`,
            [id, DOSSIER_MAX],
          );
          sousTraitants = { lignes: rows };
        } else {
          sousTraitants = { retenue: 'tiers' };
        }

        /* ── (5) LES EXIGENCES CONTRACTUELLES ET LEUR COUVERTURE ────────────
         * ⚠️ Rien de neuf : `exigences.client_id` existe depuis la migration
         *    `002`. C'est l'ISO 27001 A.5.31, et le dossier ne fait que le lire. */
        let exigences: Rubrique<Record<string, unknown>>;
        if (peutLire(requete, 'conformite')) {
          const { rows } = await client.query(
            `select statut_conformite, count(*)::integer as nombre
               from exigences
              where client_id = $1
              group by statut_conformite
              order by statut_conformite`,
            [id],
          );
          exigences = { lignes: rows };
        } else {
          exigences = { retenue: 'conformite' };
        }

        /* ── (6) LES DOCUMENTS QUI LUI APPARTIENNENT, ET LEUR CLASSIFICATION ─ */
        let documents: Rubrique<Record<string, unknown>>;
        if (peutLire(requete, 'documents')) {
          const { rows } = await client.query(
            `select id, titre, statut, confidentialite, donnees_personnelles
               from documents
              where client_id = $1
              order by titre
              limit $2`,
            [id, DOSSIER_MAX],
          );
          documents = { lignes: rows };
        } else {
          documents = { retenue: 'documents' };
        }

        /* ── (7) LES INCIDENTS QUI ONT TOUCHÉ SES DONNÉES ───────────────────
         * ⚠️ L'ÉCHÉANCE DE NOTIFICATION EST DÉRIVÉE EN BASE, par
         *    `f_echeance_contractuelle()` — jamais recalculée ici. La recopier en
         *    TypeScript en ferait une seconde source (constat Q-219), et les deux
         *    divergeraient le jour où le délai change. */
        let incidents: Rubrique<Record<string, unknown>>;
        if (peutLire(requete, 'incidents')) {
          const { rows } = await client.query(
            `select i.id, i.titre, i.gravite, i.statut,
                    i.date_detection::text as date_detection,
                    e.echeance::text       as notifier_avant,
                    d.fait_le::text        as notifie_le,
                    d.reference            as notification_reference
               from incidents i
               cross join lateral f_echeance_contractuelle(
                              i.detecte_le, i.date_detection, $2::integer) e
               left join declarations_reglementaires d
                      on d.incident_id = i.id
                     and d.regime = 'contractuel'
              where i.client_id = $1
              order by i.date_detection desc nulls last
              limit $3`,
            [id, c.notification_incident_h, DOSSIER_MAX],
          );
          incidents = { lignes: rows };
        } else {
          incidents = { retenue: 'incidents' };
        }

        /* ── (8) LES DEMANDES D'EXERCICE DE DROITS QU'IL NOUS A TRANSMISES ── */
        const { rows: demandes } = await client.query(
          `select id, type_demande, statut, recue_le::text as recue_le,
                  repondue_le::text as repondue_le
             from demandes_droits
            where client_id = $1
            order by recue_le desc nulls last
            limit $2`,
          [id, DOSSIER_MAX],
        );

        return { c, registre, mesures, sousTraitants, exigences, documents, incidents, demandes };
      });

      /* ── LES MANQUES, ET C'EST LA MOITIÉ UTILE DU DOSSIER ────────────────
       *
       * 🛑 Ils ne sont pas un ornement : *un dossier à moitié rempli est plus
       * dangereux qu'un dossier vide.* Chaque manque nomme ce que le texte
       * attend, et il est RANGÉ par gravité — « bloquant » veut dire qu'envoyer
       * le dossier en l'état documente une infraction.
       */
      const c = resultat.c;
      const manques: { gravite: 'bloquant' | 'majeur' | 'mineur'; sujet: string }[] = [];

      const vide = (v: unknown): boolean => v === null || v === undefined || v === '';

      // Article 30 §2 a) : le texte NOMME ces deux contacts. Sans eux, ce n'est
      // pas un registre incomplet — ce n'en est pas un.
      if (vide(c.contact_rt_nom) && vide(c.contact_rt_email)) {
        manques.push({
          gravite: 'bloquant',
          sujet:
            'aucun contact du responsable de traitement — RGPD art. 30 §2 a), qui l’exige ' +
            'nommément. C’est aussi le destinataire d’une notification de violation ' +
            '(art. 33 §2) : sans lui, l’obligation n’a personne à prévenir.',
        });
      }
      if (vide(c.contact_dpo_nom) && vide(c.contact_dpo_email)) {
        manques.push({
          gravite: 'majeur',
          sujet:
            'aucun contact du délégué à la protection des données du client — RGPD ' +
            'art. 30 §2 a), qui le nomme à côté du responsable de traitement.',
        });
      }
      if (resultat.registre.length === 0) {
        manques.push({
          gravite: 'bloquant',
          sujet:
            'aucun traitement déclaré pour le compte de ce donneur d’ordre. Si nous ' +
            'traitons des données personnelles pour lui, le registre de l’article 30 §2 ' +
            'est obligatoire — et c’est le premier document qu’une autorité demande au ' +
            'sous-traitant.',
        });
      }
      if (vide(c.fin_de_contrat)) {
        manques.push({
          gravite: 'majeur',
          sujet:
            'le sort des données en fin de contrat n’est pas convenu — RGPD art. 28 §3 g) ' +
            '(restitution ou suppression).',
        });
      }
      if (vide(c.notification_incident_h)) {
        manques.push({
          gravite: 'majeur',
          sujet:
            'aucun délai contractuel de notification d’incident. Le produit ne peut donc ' +
            'armer aucune échéance vers ce client, et c’est souvent le délai le plus court ' +
            'de tous — plus court que les 72 h de NIS2.',
        });
      }
      if (vide(c.confidentialite_plancher)) {
        manques.push({
          gravite: 'mineur',
          sujet:
            'aucun niveau de diffusion minimal imposé par ce client. Rien ne s’oppose ' +
            'alors à ce qu’un document lui appartenant soit classé « public ».',
        });
      }
      if (vide(c.droit_audit)) {
        manques.push({
          gravite: 'mineur',
          sujet: 'la modalité du droit d’audit n’est pas renseignée — RGPD art. 28 §3 h).',
        });
      }

      // Article 46 : la contrainte de base l'empêche à l'écriture, mais un
      // registre repris d'un export ancien peut porter le cas. On le dit.
      for (const t of resultat.registre as Record<string, unknown>[]) {
        if (!vide(t.transfert_hors_ue) && vide(t.transfert_garantie)) {
          manques.push({
            gravite: 'bloquant',
            sujet: `« ${String(t.intitule)} » déclare un transfert hors Union sans garantie identifiée — RGPD art. 46.`,
          });
        }
        if (Number(t.mesures ?? 0) === 0) {
          manques.push({
            gravite: 'majeur',
            sujet: `« ${String(t.intitule)} » ne rattache aucune mesure de sécurité — RGPD art. 30 §2 d), renvoyé à l’art. 32.`,
          });
        }
        if (vide(t.instruction_reference)) {
          manques.push({
            gravite: 'mineur',
            sujet: `« ${String(t.intitule)} » ne désigne aucune instruction documentée — RGPD art. 28 §3 a).`,
          });
        }
      }

      // 🛑 UN SOUS-TRAITANT ULTÉRIEUR NON AUTORISÉ EST UNE INFRACTION, pas un
      //    retard administratif — art. 28 §2.
      if ('lignes' in resultat.sousTraitants) {
        for (const s of resultat.sousTraitants.lignes as Record<string, unknown>[]) {
          if (vide(s.autorise_le)) {
            manques.push({
              gravite: 'bloquant',
              sujet: `« ${String(s.societe)} » intervient sur les données de ce client sans autorisation datée du responsable de traitement — RGPD art. 28 §2.`,
            });
          }
        }
      }

      // ⚠️ DORA ne s'applique QUE si le client est une entité financière. Le
      //    réclamer partout ferait des alertes sans objet, et la première chose
      //    qu'on fait d'une alerte sans objet est de cesser de la lire.
      if (c.entite_financiere_dora === true) {
        if (vide(c.lei)) {
          manques.push({
            gravite: 'majeur',
            sujet:
              'ce donneur d’ordre est une entité financière et son LEI manque : il en a ' +
              'besoin pour son registre d’information DORA (art. 28 §3), que nous devons ' +
              'alimenter en tant que prestataire de services TIC.',
          });
        }
        if (vide(c.contrat_reference)) {
          manques.push({
            gravite: 'majeur',
            sujet:
              'entité financière sans référence d’arrangement contractuel — DORA art. 30 ' +
              'impose un contrat écrit dont les clauses sont énumérées.',
          });
        }
      }

      if ('lignes' in resultat.incidents) {
        for (const i of resultat.incidents.lignes as Record<string, unknown>[]) {
          if (!vide(i.notifier_avant) && vide(i.notifie_le)) {
            manques.push({
              gravite: 'bloquant',
              sujet: `l’incident « ${String(i.titre)} » n’a pas été notifié à ce client, et son échéance contractuelle est le ${String(i.notifier_avant).slice(0, 16)}.`,
            });
          }
        }
      }

      const rang = { bloquant: 0, majeur: 1, mineur: 2 } as const;
      manques.sort((a, b) => rang[a.gravite] - rang[b.gravite]);

      return reponse.send({
        // ⚠️ Rendu EN TÊTE et non déduit par l'écran : c'est ce qui permet au
        //    document imprimé de porter la mention, et le lot L18 a montré qu'une
        //    mention que l'écran doit reconstituer finit par manquer à l'impression.
        avertissement:
          'Ce dossier est PRÉPARÉ par le produit. Il ne transmet rien : sa remise au ' +
          'donneur d’ordre est un geste humain, et son contenu engage la filiale qui le ' +
          'remet.',
        client: resultat.c,
        registreArticle30: resultat.registre,
        mesures: resultat.mesures,
        sousTraitants: resultat.sousTraitants,
        exigences: resultat.exigences,
        documents: resultat.documents,
        incidents: resultat.incidents,
        demandesDroits: resultat.demandes,
        manques,
      });
    },
  );
}
