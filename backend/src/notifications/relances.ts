/**
 * L12 — Relance des échéances par courriel : l'orchestration et la tâche
 * planifiée.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Contrat : `CONVENTIONS.md` §36 · `PLAN_SERVEUR` §1.11
 * ════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier n'écrit ni protocole (`smtp.ts`), ni règle d'échéance
 * (`echeances.ts`), ni texte (`message.ts`) : il **coud**, et c'est là que
 * vivent les trois décisions qui n'appartiennent à aucun des trois.
 *
 * ── Décision 1 : l'envoi ne bloque JAMAIS une écriture (§36.2 règle 2) ───
 *
 * Il n'y a, dans tout ce lot, **aucun point d'appel depuis une écriture
 * métier**. Rien dans `src/entites/`, rien dans les routes de création : une
 * échéance se crée, se modifie et se supprime sans que ce module existe. La
 * relance est une **tâche planifiée** qui lit à froid, et une route
 * d'administration qui envoie un message de vérification. C'est la forme la plus
 * forte de la règle : *un `rollback` de courriel n'existe pas*, donc aucun
 * courriel ne partage jamais de transaction avec une donnée.
 *
 * ── Décision 2 : deux exécutions rapprochées n'envoient pas deux fois ────
 *
 * Une **fenêtre réclamée en base**, par filiale, dans `parametres`
 * (`categorie = 'notifications'`, clé `notifications.derniere_relance`).
 *
 * *Pourquoi une fenêtre, et non une marque par échéance :* une relance est
 * **périodique par nature**. Une action en retard doit être relancée demain
 * aussi ; une marque « déjà notifiée » par enregistrement dirait « plus jamais »,
 * ce qui est le contraire du besoin. Ce qu'il faut empêcher n'est pas de
 * relancer deux fois la même action — c'est d'envoyer **deux courriels dans la
 * même journée**, ce qui apprend à les ignorer.
 *
 * *Pourquoi en base, et non en mémoire :* la tâche est un `oneshot` systemd. Il
 * n'y a pas de mémoire d'un passage à l'autre, et deux exécutions concurrentes
 * (le minuteur et une relance manuelle) ne partagent aucun processus.
 *
 * *Pourquoi RÉCLAMÉE AVANT l'envoi, et non marquée après :* parce que les deux
 * ordres ont un mode d'échec, et qu'ils ne se valent pas. Marquer après, c'est
 * ré-expédier tout un lot si le processus meurt au milieu — *au moins une fois*.
 * Réclamer avant, c'est perdre une journée de relance si le processus meurt —
 * *au plus une fois*. Pour une **relance**, la seconde est la bonne : l'échéance
 * est toujours là demain, et le passage suivant la reprendra ; un doublon, lui,
 * ne se rattrape pas. La réclamation est un `update … where valeur < seuil`
 * dont on lit le nombre de lignes : **atomique**, donc juste même si deux
 * exécutions démarrent à la même seconde.
 *
 * *Et le cas du relais injoignable :* si **aucun** message n'est parti, la
 * fenêtre est **rendue** (l'ancienne valeur est réécrite) et le passage suivant
 * réessaiera. Si au moins un est parti, elle est gardée : rejouer expédierait
 * des doublons à ceux qui ont déjà reçu.
 *
 * ── Décision 3 : le périmètre, filiale par filiale ──────────────────────
 *
 * `PERIMETRE_SYSTEME` n'accorde la lecture d'aucune donnée de filiale
 * (`filiales` y est vide). Chaque filiale est donc traitée **sous un périmètre
 * borné à elle seule**, sous un identifiant qui nomme la tâche — exactement ce
 * que `db/pool.ts` appelle de ses vœux, et ce que fait déjà
 * `src/pieces/exploitation.ts`.
 *
 * ⚠️ **C'est aussi ce qui tient le cloisonnement des destinataires.** Un nom de
 * responsable qui n'existe que dans l'annuaire d'une autre filiale ne trouve
 * aucune adresse : la Row Level Security ne rend pas la ligne. Le cloisonnement
 * n'est donc **pas** un filtre écrit ici — il est sous le code, et
 * `test/notifications/cloisonnement.test.mjs` le mesure en semant deux annuaires
 * qui portent le même nom.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Configuration — TOUT existe déjà, et rien n'est à ajouter
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/config/index.ts` n'appartient pas à cet agent. Il n'a **rien à recevoir** :
 * le bloc `ConfigurationSmtp` y est complet depuis le lot L0 — `SMTP_ACTIF`,
 * `SMTP_HOTE`, `SMTP_PORT`, `SMTP_CHIFFREMENT`, `SMTP_MODE_AUTH`,
 * `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE`, `SMTP_EXPEDITEUR`,
 * `SMTP_NOM_EXPEDITEUR`, `SMTP_REDIRECTION_RECETTE` — et `.env.example` les
 * documente déjà sous « 6. Notifications par courriel (SMTP) [lot L12] ». Le
 * lien des messages vient de `SERVEUR_URL_PUBLIQUE`, qui existe aussi.
 *
 * Les deux réglages propres au rythme des relances — la fenêtre anti-doublon et
 * l'horizon — sont des **constantes de produit**, comme
 * `DELAI_REANALYSE_JOURS_PAR_DEFAUT` l'est de `src/pieces/exploitation.ts` : ce
 * sont des cadences, pas des valeurs propres à un client.
 *
 * La lecture passe par `reglages.ts`, qui prend `config` d'abord et **retombe sur
 * l'environnement** pour ce que `config` ne porterait pas encore. Cela rend ce
 * lot indépendant du calendrier des autres agents, et permet au banc de fixer
 * une cadence sans construire une configuration entière. Le tableau complet des
 * clés, de leurs défauts et du comportement quand chacune manque est dans
 * l'entête de `reglages.ts`.
 *
 * ⚠️ **Sans configuration SMTP, le lot démarre proprement et n'envoie rien** :
 * `SMTP_ACTIF=non` (la valeur par défaut) fait rendre `{ actif: false }` au
 * bilan, écrire un **avertissement** au journal technique, et s'arrêter là. Ni
 * exception, ni code de retour d'échec, ni erreur rendue à un utilisateur.
 */

import { argv, exit, stderr, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

import type { Pool, PoolClient } from 'pg';

import { chargerConfiguration } from '../config/index.js';
import type { Configuration } from '../config/index.js';
import { journaliser } from '../auth/journal.js';
import { avecTransaction, creerPool, fermerPool, PERIMETRE_SYSTEME } from '../db/pool.js';
import type { JournalMinimal, PerimetreSession } from '../db/pool.js';
import { lireFilialesActives } from '../droits/groupes-ad.js';
import { engendrerIdentifiant } from '../entites/index.js';
import { recolterEcheances, resoudreDestinataires, urgenceDe } from './echeances.js';
import type { Destinataire, Echeance, TypeEcheance, Urgence } from './echeances.js';
import { composerRelance } from './message.js';
import { lireReglages } from './reglages.js';
import type { ReglagesNotifications, SourceReglages } from './reglages.js';
import { ErreurSmtp, expedier } from './smtp.js';
import type { OptionsExpedition } from './smtp.js';

/* =====================================================================
 *  1. Cadences — voir « Configuration » dans l'entête
 * ===================================================================== */

/**
 * Deux exécutions séparées de moins que cela ne relancent pas deux fois.
 *
 * **20 heures et non 24** : le minuteur tourne `OnCalendar=daily` avec un
 * `RandomizedDelaySec=1800`, donc deux passages successifs peuvent être séparés
 * de 23 h 30 seulement. Une fenêtre de 24 h en sauterait un jour sur deux — le
 * genre de défaut qu'on ne voit qu'en comptant les courriels d'une semaine.
 */
export const FENETRE_RELANCE_HEURES = 20;

/**
 * Au-delà de cet horizon, une échéance n'est pas relancée.
 *
 * Sept jours, parce que c'est déjà le seuil « urgents ≤ 7 j » de l'Échéancier
 * et la borne de la catégorie `semaine` : un courriel qui parlerait d'une revue
 * de direction dans onze mois serait du bruit, et le bruit fait ignorer les
 * relances qui comptent.
 */
export const HORIZON_RELANCE_JOURS = 7;

/** Clé de la marque anti-doublon, dans `parametres`. */
const CLE_DERNIERE_RELANCE = 'notifications.derniere_relance';

/** Identité déclarée des écritures de ce lot — nommée, jamais `PERIMETRE_SYSTEME`. */
const UTILISATEUR_RELANCES = 'systeme-relances';

/* =====================================================================
 *  2. Périmètre
 * ===================================================================== */

/** Voir la décision 3 de l'entête, et `src/pieces/exploitation.ts` qui fait de même. */
function perimetreRelance(filialeId: string): PerimetreSession {
  return Object.freeze({
    utilisateurId: UTILISATEUR_RELANCES,
    filialeId,
    filiales: Object.freeze([filialeId]),
    perimetreGroupe: false,
    administrationGroupe: false,
  });
}

/* =====================================================================
 *  3. Bilan
 * ===================================================================== */

export interface BilanFiliale {
  readonly filialeId: string;
  /** `false` = la fenêtre était déjà réclamée : ce passage n'a rien envoyé, et c'est le cas nominal. */
  readonly fenetreReclamee: boolean;
  readonly echeancesRetenues: number;
  readonly destinataires: number;
  readonly messagesExpedies: number;
  readonly messagesEchoues: number;
  /** Échéances dans l'horizon dont aucun responsable n'a d'adresse dans l'annuaire. */
  readonly sansDestinataire: number;
  /** Obligations réelles mais sans date exploitable — comptées, jamais expédiées. */
  readonly sansDate: number;
  /** Motif du premier échec d'expédition, pour le journal technique. Jamais une adresse. */
  readonly motifEchec: string | null;
  /**
   * La filiale n'a pas pu être traitée du tout — défaut de base, pas de relais.
   *
   * ⚠️ **Pourquoi une filiale en échec n'arrête pas les dix-neuf autres.** La
   * première rédaction laissait l'exception remonter : un seul site dont la
   * lecture échoue — verrou, donnée aberrante, politique refusée — et **aucune
   * autre filiale du groupe n'était relancée ce jour-là**, sans que rien ne le
   * dise à part une pile d'appels. C'est la figure du banc vert qui ne mesure
   * pas ce qu'il ne regarde pas : le passage « échouait », et personne ne
   * pouvait dire combien de filiales avaient été servies. Chaque filiale est
   * donc isolée, l'échec est compté et nommé, et `main()` rend 1.
   */
  readonly erreurBase: string | null;
}

export interface BilanRelances {
  /** `false` quand `SMTP_ACTIF=non` : rien n'a été tenté, et ce n'est pas une erreur. */
  readonly actif: boolean;
  readonly filiales: readonly BilanFiliale[];
  readonly messagesExpedies: number;
  readonly messagesEchoues: number;
  /** Filiales que la base n'a pas laissé traiter. Voir `BilanFiliale.erreurBase`. */
  readonly filialesEnErreur: number;
}

export interface OptionsRelances {
  /** Date de référence de « en retard ». Le banc la fixe ; l'exploitation ne la passe pas. */
  readonly reference?: Date;
  readonly fenetreHeures?: number;
  readonly horizonJours?: number;
  /** Passé tel quel à `expedier` — le banc y met l'autorité de son serveur d'essai. */
  readonly expedition?: OptionsExpedition;
}

/* =====================================================================
 *  4. La fenêtre anti-doublon
 * ===================================================================== */

/**
 * Réclame la fenêtre d'envoi de la filiale active.
 *
 * Rend `null` si elle est déjà prise, ou la **valeur précédente** (possiblement
 * `null` au tout premier passage) si elle vient d'être réclamée — c'est elle
 * qu'il faudra réécrire pour rendre la fenêtre.
 *
 * ⚠️ L'atomicité vient du `update … where`, pas d'un `select` suivi d'un
 * `update` : deux passages simultanés lisent la même valeur, mais **un seul**
 * voit `rowCount = 1`.
 */
async function reclamerFenetre(
  client: PoolClient,
  filialeId: string,
  maintenant: Date,
  fenetreHeures: number,
): Promise<{ reclamee: boolean; valeurPrecedente: string | null }> {
  const seuil = new Date(maintenant.getTime() - fenetreHeures * 3600_000);

  // La ligne peut ne pas exister : première relance de cette filiale. On la
  // pose « vide », pour que l'`update` ci-dessous ait quelque chose à réclamer.
  // `do nothing` : une course entre deux passages se résout ici sans erreur.
  await client.query(
    `insert into "parametres"
            ("id", "filiale_id", "categorie", "cle", "valeur", "type_valeur",
             "modifiable", "libelle", "description")
     values ($1, $2, 'notifications', $3, null, 'texte', false, $4, $5)
     on conflict ("filiale_id", "cle") do nothing`,
    [
      engendrerIdentifiant('PARAM'),
      filialeId,
      CLE_DERNIERE_RELANCE,
      'Dernière relance des échéances par courriel',
      "Horodatage ISO 8601 UTC du dernier passage ayant expédié au moins un courriel. Écrit par la tâche planifiée cyber-grc-notifications ; sert de fenêtre anti-doublon (CONVENTIONS.md §36).",
    ],
  );

  const { rows } = await client.query<{ ancienne: string | null }>(
    // Le `case … when le texte a la forme attendue` évite qu'une valeur écrite
    // à la main fasse échouer la transaction sur une conversion : elle vaut
    // alors « jamais relancé », ce qui est le repli sûr — au pire un envoi de
    // plus, jamais un envoi manquant en silence.
    `update "parametres" as p
        set "valeur" = $2
       from (select "valeur" as "ancienne" from "parametres"
              where "filiale_id" = $1 and "cle" = $3) as avant
      where p."filiale_id" = $1 and p."cle" = $3
        and coalesce(
              (case when p."valeur" ~ '^\\d{4}-\\d{2}-\\d{2}T' then p."valeur"::timestamptz end),
              '-infinity'::timestamptz
            ) < $4::timestamptz
      returning avant."ancienne"`,
    [filialeId, maintenant.toISOString(), CLE_DERNIERE_RELANCE, seuil.toISOString()],
  );

  const ligne = rows[0];
  if (ligne === undefined) return { reclamee: false, valeurPrecedente: null };
  return { reclamee: true, valeurPrecedente: ligne.ancienne };
}

/** Rend la fenêtre : aucun message n'est parti, le passage suivant doit réessayer. */
async function rendreFenetre(
  client: PoolClient,
  filialeId: string,
  valeurPrecedente: string | null,
): Promise<void> {
  await client.query(
    `update "parametres" set "valeur" = $2 where "filiale_id" = $1 and "cle" = $3`,
    [filialeId, valeurPrecedente, CLE_DERNIERE_RELANCE],
  );
}

/* =====================================================================
 *  5. Regroupement
 * ===================================================================== */

interface LotDestinataire {
  readonly destinataire: Destinataire;
  readonly parUrgence: Partial<Record<Urgence, number>>;
  readonly parType: Partial<Record<TypeEcheance, number>>;
  total: number;
}

/**
 * Regroupe les échéances par destinataire.
 *
 * Une échéance à plusieurs responsables (les participants d'une revue de
 * direction) compte pour chacun : ils sont plusieurs à devoir agir.
 */
function regrouper(
  echeances: readonly Echeance[],
  annuaire: Map<string, Destinataire>,
): { lots: LotDestinataire[]; sansDestinataire: number } {
  const lots = new Map<string, LotDestinataire>();
  let sansDestinataire = 0;

  for (const echeance of echeances) {
    const joints = echeance.responsables
      .map((nom) => annuaire.get(nom.trim().toLowerCase()))
      .filter((d): d is Destinataire => d !== undefined);

    if (joints.length === 0) {
      sansDestinataire += 1;
      continue;
    }
    const urgence = urgenceDe(echeance.jours);
    for (const destinataire of joints) {
      let lot = lots.get(destinataire.email);
      if (lot === undefined) {
        lot = { destinataire, parUrgence: {}, parType: {}, total: 0 };
        lots.set(destinataire.email, lot);
      }
      lot.parUrgence[urgence] = (lot.parUrgence[urgence] ?? 0) + 1;
      lot.parType[echeance.type] = (lot.parType[echeance.type] ?? 0) + 1;
      lot.total += 1;
    }
  }
  return { lots: [...lots.values()], sansDestinataire };
}

/* =====================================================================
 *  6. Le passage
 * ===================================================================== */

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}

/**
 * Passe en revue toutes les filiales actives et expédie les relances dues.
 *
 * ⚠️ **Ne lève pas sur un relais injoignable.** Un échec d'expédition est un
 * incident d'exploitation : il est compté, journalisé (technique et audit), et
 * la fonction rend son bilan. La seule chose qui puisse lever ici est un défaut
 * de base — et la tâche est alors bel et bien en panne.
 */
export async function envoyerRelances(
  pool: Pool,
  config: SourceReglages,
  options: OptionsRelances = {},
  journal?: JournalMinimal,
): Promise<BilanRelances> {
  const reglages = lireReglages(config);
  if (reglages.repliees.length > 0) {
    // Un repli silencieux ferait croire à une configuration qui n'existe pas.
    journal?.warn(
      { cles: reglages.repliees },
      "Relance des échéances : des réglages ont été repris de l'environnement, faute d'être portés par la configuration du serveur.",
    );
  }
  if (!reglages.actif) {
    journal?.warn(
      { reglage: 'SMTP_ACTIF' },
      "Relance des échéances : aucun relais configuré (SMTP_ACTIF=non). Aucun courriel n'est expédié ; ce n'est pas une erreur.",
    );
    return { actif: false, filiales: [], messagesExpedies: 0, messagesEchoues: 0, filialesEnErreur: 0 };
  }

  const maintenant = options.reference ?? new Date();
  const fenetreHeures = options.fenetreHeures ?? reglages.fenetreHeures;
  const horizon = options.horizonJours ?? reglages.horizonJours;

  const filiales = await avecTransaction(pool, PERIMETRE_SYSTEME, (c) => lireFilialesActives(c), {
    lectureSeule: true,
  });

  const bilans: BilanFiliale[] = [];
  for (const filiale of filiales) {
    try {
      bilans.push(
        await traiterFiliale(pool, reglages, filiale.id, {
          maintenant,
          fenetreHeures,
          horizon,
          expedition: options.expedition,
          journal,
        }),
      );
    } catch (erreur) {
      // Voir `BilanFiliale.erreurBase` : une filiale en échec n'emporte pas les
      // dix-neuf autres, et son échec est nommé plutôt que remonté nu.
      const motif = messageErreur(erreur).slice(0, 500);
      journal?.error(
        { filialeId: filiale.id, motif },
        'Relance des échéances : cette filiale n’a pas pu être traitée ; les suivantes le sont.',
      );
      bilans.push({
        filialeId: filiale.id,
        fenetreReclamee: false,
        echeancesRetenues: 0,
        destinataires: 0,
        messagesExpedies: 0,
        messagesEchoues: 0,
        sansDestinataire: 0,
        sansDate: 0,
        motifEchec: null,
        erreurBase: motif,
      });
    }
  }

  return {
    actif: true,
    filiales: bilans,
    messagesExpedies: bilans.reduce((s, b) => s + b.messagesExpedies, 0),
    messagesEchoues: bilans.reduce((s, b) => s + b.messagesEchoues, 0),
    filialesEnErreur: bilans.filter((b) => b.erreurBase !== null).length,
  };
}

interface ContexteFiliale {
  readonly maintenant: Date;
  readonly fenetreHeures: number;
  readonly horizon: number;
  readonly expedition?: OptionsExpedition;
  readonly journal?: JournalMinimal;
}

async function traiterFiliale(
  pool: Pool,
  reglages: ReglagesNotifications,
  filialeId: string,
  ctx: ContexteFiliale,
): Promise<BilanFiliale> {
  const perimetre = perimetreRelance(filialeId);
  const vide = (fenetreReclamee: boolean, sansDate = 0): BilanFiliale => ({
    filialeId,
    fenetreReclamee,
    echeancesRetenues: 0,
    destinataires: 0,
    messagesExpedies: 0,
    messagesEchoues: 0,
    sansDestinataire: 0,
    sansDate,
    motifEchec: null,
    erreurBase: null,
  });

  /* ── Transaction 1 : lire, résoudre, réclamer la fenêtre ──────────────
   *  Tout ce qui touche la base **avant** l'envoi tient dans une seule
   *  transaction : la fenêtre n'est réclamée que s'il y a effectivement
   *  quelque chose à envoyer. Réclamer pour rien ferait sauter la relance
   *  du lendemain sur une filiale qui n'avait rien aujourd'hui. */
  const prepare = await avecTransaction(pool, perimetre, async (client) => {
    const recolte = await recolterEcheances(client, ctx.maintenant);
    const sansDate = Object.values(recolte.sansDate).reduce((s, n) => s + n, 0);
    const retenues = recolte.echeances.filter((e) => e.jours <= ctx.horizon);
    if (retenues.length === 0) return { rien: true as const, sansDate };

    const annuaire = await resoudreDestinataires(
      client,
      retenues.flatMap((e) => e.responsables),
    );
    const { lots, sansDestinataire } = regrouper(retenues, annuaire);
    if (lots.length === 0) {
      // Rien à envoyer, mais quelque chose à dire : des obligations sont dues
      // et personne n'est joignable. La fenêtre n'est PAS réclamée — demain,
      // l'annuaire aura peut-être été complété.
      return { rien: true as const, sansDate, sansDestinataire, echeances: retenues.length };
    }

    const fenetre = await reclamerFenetre(client, filialeId, ctx.maintenant, ctx.fenetreHeures);
    if (!fenetre.reclamee) return { rien: true as const, sansDate, dejaReclamee: true as const };

    return {
      rien: false as const,
      sansDate,
      sansDestinataire,
      echeances: retenues.length,
      lots,
      valeurPrecedente: fenetre.valeurPrecedente,
    };
  });

  if (prepare.rien) {
    if (prepare.sansDestinataire !== undefined && prepare.sansDestinataire > 0) {
      ctx.journal?.warn(
        { filialeId, echeances: prepare.echeances, sansDestinataire: prepare.sansDestinataire },
        "Relance des échéances : des obligations sont dues, et aucun responsable n'a d'adresse dans l'annuaire.",
      );
    }
    return { ...vide(false, prepare.sansDate), sansDestinataire: prepare.sansDestinataire ?? 0 };
  }

  /* ── Hors transaction : l'expédition ──────────────────────────────────
   *  Aucune connexion à la base n'est tenue pendant que l'on parle au relais.
   *  Une prise SMTP qui traîne ne doit pas immobiliser une connexion du pool,
   *  ni buter sur `idle_in_transaction_session_timeout`. */
  let expedies = 0;
  let echoues = 0;
  let motifEchec: string | null = null;
  /**
   * Au moins un échec **passager** (relais injoignable, 4xx) ?
   *
   * ⚠️ Et non « aucun échec permanent », qui était la première rédaction et qui
   * était fausse : sur trois destinataires dont un porte une adresse mal formée
   * (échec permanent) et deux tombent sur un relais injoignable (échecs
   * passagers), « aucun permanent » gardait la fenêtre — et les deux qui
   * auraient reçu demain ne recevaient jamais. La question à poser est
   * *« y a-t-il quelque chose que réessayer changerait ? »*, pas
   * *« tout est-il réessayable ? »*.
   */
  let auMoinsUnPassager = false;

  for (const lot of prepare.lots) {
    const redigee = composerRelance(
      { parUrgence: lot.parUrgence, parType: lot.parType },
      reglages.urlPublique,
    );
    // Recette : toutes les relances partent vers une seule boîte (§1.10). La
    // configuration refuse déjà ce réglage en production.
    const destination = reglages.redirectionRecette ?? lot.destinataire.email;

    try {
      const trace = await expedier(
        {
          de: { adresse: reglages.expediteur, nom: reglages.nomExpediteur },
          a: destination,
          sujet: redigee.sujet,
          corps: redigee.corps,
        },
        reglages.relais,
        ctx.expedition,
      );
      expedies += 1;
      ctx.journal?.info(
        { filialeId, chiffre: trace.chiffre, protocole: trace.protocoleTls, echeances: lot.total },
        'Relance des échéances expédiée.',
      );
    } catch (erreur) {
      echoues += 1;
      // ⚠️ Le motif ne recopie **jamais** l'adresse : il part au journal
      // d'audit, où une valeur d'utilisateur n'a rien à faire (§29.5).
      // Borné : un relais bavard ne doit pas gonfler une entrée de journal
      // conservée trois ans. La cause tient toujours dans les premiers signes.
      motifEchec ??= messageErreur(erreur).slice(0, 500);
      if (!(erreur instanceof ErreurSmtp) || !erreur.permanente) auMoinsUnPassager = true;
      ctx.journal?.error(
        { filialeId, motif: messageErreur(erreur) },
        "Relance des échéances : le relais n'a pas accepté le message.",
      );
    }
  }

  /* ── Transaction 2 : la trace, et le sort de la fenêtre ───────────────
   *  Après l'envoi, parce qu'elle décrit ce qui a EU LIEU. Si le processus
   *  meurt entre les deux, la fenêtre est réclamée sans trace : un envoi non
   *  journalisé est un défaut, il est signalé au journal technique par la
   *  disparition du message de fin — et le passage du lendemain repart d'un
   *  état cohérent. L'inverse (tracer d'abord) écrirait une trace fausse. */
  const rendue = expedies === 0 && auMoinsUnPassager;
  await avecTransaction(pool, perimetre, async (client) => {
    if (rendue) await rendreFenetre(client, filialeId, prepare.valeurPrecedente);
    await journaliser(client, {
      action: 'administration',
      // Phrase FIXE, écrite par le développeur (§29.5). Aucune valeur d'utilisateur.
      resume: 'Relance des échéances par courriel',
      utilisateurLibelle: UTILISATEUR_RELANCES,
      filialeId,
      valeursApres: {
        // ⚠️ Le NOMBRE de destinataires, jamais leur liste (§36.3).
        destinataires: prepare.lots.length,
        messages_expedies: expedies,
        messages_echoues: echoues,
        echeances: prepare.echeances,
        sans_destinataire: prepare.sansDestinataire,
        fenetre_rendue: rendue,
        ...(motifEchec === null ? {} : { motif_echec: motifEchec }),
      },
    });
  });

  return {
    filialeId,
    fenetreReclamee: true,
    echeancesRetenues: prepare.echeances,
    destinataires: prepare.lots.length,
    messagesExpedies: expedies,
    messagesEchoues: echoues,
    sansDestinataire: prepare.sansDestinataire,
    sansDate: prepare.sansDate,
    motifEchec,
    erreurBase: null,
  };
}

/* =====================================================================
 *  7. Point d'entrée CLI — cible du minuteur systemd
 * ---------------------------------------------------------------------
 *  Même forme que `src/pieces/exploitation.ts` et `src/serveur.ts` :
 *  `node dist/notifications/relances.js` fait un passage et s'arrête.
 * ===================================================================== */

function construireJournalConsole(): JournalMinimal {
  return {
    error: (donnees, message) => {
      console.error(message ?? '', donnees);
    },
    warn: (donnees, message) => {
      console.warn(message ?? '', donnees);
    },
    info: (donnees, message) => {
      console.info(message ?? '', donnees);
    },
  };
}

async function main(): Promise<void> {
  let config: Configuration;
  try {
    config = chargerConfiguration();
  } catch (erreur) {
    stderr.write(`Relance des échéances : configuration invalide — ${messageErreur(erreur)}\n`);
    exit(1);
    return;
  }

  const journal = construireJournalConsole();
  const pool = creerPool(config.base, journal);
  try {
    const bilan = await envoyerRelances(pool, config, {}, journal);

    if (!bilan.actif) {
      stdout.write(
        "Relance des échéances : SMTP_ACTIF=non — aucun relais configuré, rien à expédier.\n",
      );
      return;
    }

    stdout.write(
      `Relance des échéances : ${String(bilan.filiales.length)} filiale(s) passée(s) en revue, ` +
        `${String(bilan.messagesExpedies)} message(s) expédié(s), ` +
        `${String(bilan.messagesEchoues)} échec(s)` +
        `${bilan.filialesEnErreur > 0 ? `, ${String(bilan.filialesEnErreur)} filiale(s) non traitée(s)` : ''}.\n`,
    );
    for (const f of bilan.filiales) {
      if (f.erreurBase !== null) {
        stdout.write(`  ${f.filialeId} — NON TRAITÉE : ${f.erreurBase}\n`);
        continue;
      }
      if (!f.fenetreReclamee) continue;
      stdout.write(
        `  ${f.filialeId} — ${String(f.echeancesRetenues)} échéance(s), ` +
          `${String(f.destinataires)} destinataire(s), ` +
          `${String(f.messagesExpedies)} expédié(s), ${String(f.messagesEchoues)} en échec` +
          `${f.sansDestinataire > 0 ? `, ${String(f.sansDestinataire)} sans destinataire` : ''}` +
          `${f.motifEchec === null ? '' : ` — ${f.motifEchec}`}\n`,
      );
    }

    // Tout ce qui a été tenté a échoué : plus probablement un relais injoignable
    // pour l'ensemble du passage qu'une série de coïncidences. Un exploitant doit
    // le voir dans `systemctl status`, pas seulement au fond du journal.
    if (bilan.messagesExpedies === 0 && bilan.messagesEchoues > 0) {
      process.exitCode = 1;
    }
    // Une filiale non traitée est un défaut d'exploitation, même si les autres
    // ont reçu : sans cela, le passage rendrait 0 en ayant sauté un site.
    if (bilan.filialesEnErreur > 0) {
      process.exitCode = 1;
    }
  } catch (erreur) {
    stderr.write(`Relance des échéances : échec — ${messageErreur(erreur)}\n`);
    process.exitCode = 1;
  } finally {
    await fermerPool(pool);
  }
}

const executeDirectement = argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;

if (executeDirectement) {
  void main();
}
