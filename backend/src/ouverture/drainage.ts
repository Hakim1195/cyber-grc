/**
 * L22, action 22.3 — LE DRAINAGE DE LA FILE DES ÉVÉNEMENTS SORTANTS.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ CE FICHIER EST LE SEUL DU PRODUIT QUI APPELLE UN SERVEUR TIERS
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il s'exécute dans une **unité systemd distincte** — `cyber-grc-evenements.service` —,
 * exactement comme les relances du lot L12 et comme rsyslog pour le journal d'audit.
 * Le service web, lui, garde `IPAddressDeny=any` **intact** : *une barrière physique,
 * pas une promesse* (constat **Q-199**, où L12 a été livré incapable d'envoyer, avec un
 * banc vert).
 *
 * Trois raisons, et chacune a déjà coûté quelque chose :
 *
 *   1. le durcissement réseau du service applicatif reste entier ;
 *   2. la requête d'un utilisateur n'attend pas un serveur tiers en panne — un webhook
 *      synchrone, c'est une création d'incident qui met trente secondes le jour où
 *      l'outil d'en face ne répond plus ;
 *   3. un envoi qui échoue doit pouvoir être **rejoué**, et il faut pour cela qu'il
 *      existe quelque part.
 *
 * ── CE QUI PART, ET CE QUI NE PART JAMAIS ───────────────────────────────
 *
 * La charge a été figée à l'enfilement par `f_enfiler_evenement()`, et elle ne porte
 * **que de quoi venir chercher** : le type d'événement, l'entité, son identifiant, la
 * filiale, l'instant. **Pas le contenu.** Un webhook part vers un tiers ; y mettre la
 * description d'un incident de sécurité serait une extraction de données par la porte
 * qu'on vient d'ouvrir.
 *
 * ── L'ABANDON, ET POURQUOI IL EXISTE ────────────────────────────────────
 *
 * Après `TENTATIVES_MAX` échecs, l'événement passe à `abandonne`. Sans cela, une URL
 * morte ferait grossir la file indéfiniment et ferait payer à chaque passage le coût
 * d'un serveur qui ne répondra jamais. ⚠️ Et l'abandon **se voit** : l'écran compte les
 * événements en attente et en échec, et l'abonnement porte ses échecs consécutifs.
 */

import { createHmac } from 'node:crypto';
import { argv, stderr, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

import { chargerConfiguration } from '../config/index.js';
import { avecTransaction, creerPool, fermerPool } from '../db/pool.js';

/** Événements traités en un passage. Borne de charge, pas de confort. */
const LOT_MAX = 100;
/** Au-delà, l'événement est abandonné : une URL morte ne doit pas grossir sans fin. */
const TENTATIVES_MAX = 5;
/** Un tiers qui ne répond pas ne doit pas retenir le passage entier. */
const DELAI_MS = 10_000;

/**
 * Périmètre de la tâche.
 *
 * ⚠️ Elle voit **toutes** les filiales : c'est une tâche système, pas une session.
 * `administrationGroupe` reste FAUX — elle n'écrit aucune ligne de portée Groupe, et
 * ouvrir ce qu'on n'emploie pas est la définition d'un sur-octroi.
 */
const PERIMETRE_TACHE = Object.freeze({
  utilisateurId: 'tache-evenements',
  filialeId: null,
  filiales: Object.freeze([]) as readonly string[],
  perimetreGroupe: true,
  administrationGroupe: false,
});

export interface BilanDrainage {
  readonly examines: number;
  readonly envoyes: number;
  readonly echecs: number;
  readonly abandonnes: number;
}

interface LigneFile {
  readonly id: string;
  readonly filiale_id: string;
  readonly abonnement_id: string;
  readonly evenement: string;
  readonly charge: Record<string, unknown>;
  readonly tentatives: number;
  readonly url: string;
  readonly actif: boolean;
  readonly secret_signature: string | null;
}

/**
 * Signe la charge, quand l'abonnement porte un secret.
 *
 * ⚠️ **HMAC et non un simple condensat** : un condensat de la charge seule serait
 * recalculable par n'importe qui — il prouverait que la charge n'a pas changé en
 * chemin, jamais qu'elle vient de nous. L'abonné vérifie avec le secret qu'on lui a
 * remis une fois, à la création.
 */
function signer(secret: string, corps: string): string {
  return createHmac('sha256', secret).update(corps, 'utf8').digest('hex');
}

/**
 * Draine la file une fois.
 *
 * ⚠️ **Chaque événement a sa propre transaction.** Un seul tiers en panne ne doit pas
 * annuler les envois réussis du même passage — c'est la leçon du lot L7, où une reprise
 * transactionnelle est juste parce qu'elle porte UN fichier, et où un envoi ne l'est pas
 * parce qu'il porte N destinataires indépendants.
 */
export async function drainer(pool: Parameters<typeof avecTransaction>[0]): Promise<BilanDrainage> {
  const aTraiter = await avecTransaction(pool, PERIMETRE_TACHE, async (client) => {
    const { rows } = await client.query<LigneFile>(
      `select e.id, e.filiale_id, e.abonnement_id, e.evenement, e.charge, e.tentatives,
              a.url, a.actif, a.secret_signature
         from evenements_sortants e
         join abonnements_evenements a on a.id = e.abonnement_id
        where e.statut in ('en_attente', 'echec')
        order by e.cree_le
        limit $1`,
      [LOT_MAX],
    );
    return rows;
  });

  let envoyes = 0;
  let echecs = 0;
  let abandonnes = 0;

  for (const ligne of aTraiter) {
    // ⚠️ Un abonnement DÉSACTIVÉ entre l'enfilement et l'envoi : on abandonne
    // l'événement plutôt que de l'envoyer. Désactiver un abonnement doit arrêter
    // les envois, y compris ceux déjà en file — sans quoi le geste ne veut rien dire.
    if (!ligne.actif) {
      await marquer(pool, ligne.id, 'abandonne', ligne.tentatives, 'abonnement désactivé');
      abandonnes += 1;
      continue;
    }

    const corps = JSON.stringify(ligne.charge);
    let statutHttp = 0;
    let detail: string | null = null;

    try {
      const controleur = new AbortController();
      const minuteur = setTimeout(() => { controleur.abort(); }, DELAI_MS);
      try {
        const entetes: Record<string, string> = {
          'content-type': 'application/json',
          'x-grc-evenement': ligne.evenement,
        };
        // ⚠️ **LA SIGNATURE, quand l'abonnement en porte une.** Sans elle, l'abonné
        // n'a aucun moyen de distinguer un événement venu de nous d'un événement
        // forgé par quiconque connaît son URL — et une URL de webhook finit toujours
        // par se retrouver quelque part.
        if (ligne.secret_signature !== null) {
          entetes['x-grc-signature'] = signer(ligne.secret_signature, corps);
        }
        const reponse = await fetch(ligne.url, {
          method: 'POST',
          headers: entetes,
          body: corps,
          signal: controleur.signal,
        });
        statutHttp = reponse.status;
      } finally {
        clearTimeout(minuteur);
      }
    } catch (erreur) {
      detail = erreur instanceof Error ? erreur.message : String(erreur);
    }

    const reussi = statutHttp >= 200 && statutHttp < 300;
    const tentatives = ligne.tentatives + 1;
    if (reussi) {
      await marquer(pool, ligne.id, 'envoye', tentatives, `HTTP ${String(statutHttp)}`,
                    ligne.abonnement_id, statutHttp, true);
      envoyes += 1;
    } else if (tentatives >= TENTATIVES_MAX) {
      await marquer(pool, ligne.id, 'abandonne', tentatives,
                    detail ?? `HTTP ${String(statutHttp)}`, ligne.abonnement_id, statutHttp, false);
      abandonnes += 1;
    } else {
      await marquer(pool, ligne.id, 'echec', tentatives,
                    detail ?? `HTTP ${String(statutHttp)}`, ligne.abonnement_id, statutHttp, false);
      echecs += 1;
    }
  }

  return { examines: aTraiter.length, envoyes, echecs, abandonnes };
}

async function marquer(
  pool: Parameters<typeof avecTransaction>[0],
  identifiant: string,
  statut: string,
  tentatives: number,
  detail: string | null,
  abonnement?: string,
  statutHttp?: number,
  reussi?: boolean,
): Promise<void> {
  await avecTransaction(pool, PERIMETRE_TACHE, async (client) => {
    await client.query(
      `update evenements_sortants
          set statut = $2, tentatives = $3,
              envoye_le = case when $2 = 'envoye' then now() else null end,
              dernier_detail = left($4, 1000)
        where id = $1`,
      [identifiant, statut, tentatives, detail],
    );
    if (abonnement !== undefined) {
      await client.query(
        `update abonnements_evenements
            set dernier_envoi_le = now(), dernier_statut = $2,
                -- ⚠️ Le compteur d'échecs CONSÉCUTIFS se remet à zéro au premier
                -- succès : c'est ce qui distingue « cet outil est mort » de « il a
                -- hoqueté une fois ». Un compteur cumulatif ferait passer pour
                -- morte une destination qui répond neuf fois sur dix.
                echecs_consecutifs = case when $3 then 0 else echecs_consecutifs + 1 end
          where id = $1`,
        [abonnement, statutHttp ?? null, reussi === true],
      );
    }
  });
}

async function main(): Promise<void> {
  const config = chargerConfiguration(process.env);
  const pool = creerPool(config.base);
  try {
    const bilan = await drainer(pool);
    stdout.write(
      `Événements sortants : ${String(bilan.examines)} examiné(s), ` +
        `${String(bilan.envoyes)} envoyé(s), ${String(bilan.echecs)} en échec, ` +
        `${String(bilan.abandonnes)} abandonné(s).\n`,
    );
    // ⚠️ Tout ce qui a été tenté a échoué : plus probablement une liste blanche
    // `IPAddressAllow` oubliée qu'une série de coïncidences. L'exploitant doit le
    // voir dans `systemctl status`, pas au fond du journal (constat Q-65).
    if (bilan.envoyes === 0 && bilan.echecs + bilan.abandonnes > 0) {
      process.exitCode = 1;
    }
  } catch (erreur) {
    stderr.write(
      `Événements sortants : échec — ${erreur instanceof Error ? erreur.message : String(erreur)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await fermerPool(pool);
  }
}

const executeDirectement = argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;
if (executeDirectement) {
  void main();
}
