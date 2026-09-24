/**
 * La **délégation temporaire de droits** — migration `068`.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier fait, et ce qu'il refuse de faire
 * ════════════════════════════════════════════════════════════════════════
 *
 * Demandé par l'utilisateur le 24/09/2026 : *« donner des droits spécifiques
 * temporaires à un user »*. Le besoin est réel — un auditeur externe trois
 * semaines, un remplacement de congé, quelqu'un qu'on ajoute à la cellule de
 * crise pour 48 heures — et il se règle aujourd'hui en ajoutant la personne à un
 * groupe d'annuaire. Ce geste est **permanent par défaut**, et personne ne s'en
 * souvient : c'est ce que toute revue d'accès finit par trouver.
 *
 * 🛑 **Le danger n'est donc pas l'octroi, c'est l'OUBLI.** Une délégation datée
 * qui expire d'elle-même est strictement meilleure qu'une appartenance de groupe
 * que nul ne retire.
 *
 * ── LES SIX PROPRIÉTÉS, ET OÙ ELLES SONT TENUES ─────────────────────────────
 *
 * Elles sont **posées dans la base**, pas surveillées ici : une route s'oublie,
 * une contrainte non (`CONVENTIONS.md` §39). Ce fichier n'en réécrit aucune — il
 * traduit les refus de PostgreSQL en messages qu'un administrateur peut agir.
 *
 *  1. **additive seulement** — `f_delegations_actives()` ne rend que des octrois ;
 *  2. **date de fin obligatoire**, l'état se **dérive** (`f_etat_delegation`) ;
 *  3. **motif substantiel** (`ck_delegations_motif`) ;
 *  4. 🛑 **pas d'auto-délégation** (`ck_delegations_pas_soi_meme`) — l'invariant
 *     de sécurité : sans lui, qui détient le domaine « administration »
 *     s'accorde n'importe quoi ;
 *  5. **visible en revue des accès** (`revue_habilitation_lignes.source`) ;
 *  6. **durée bornée** à 90 jours (`ck_delegations_duree`).
 *
 * ── CE QU'UNE DÉLÉGATION N'ACCORDE JAMAIS ───────────────────────────────────
 *
 * 🛑 Ni **l'administration de l'application**, ni **le droit d'export** : ceux-là
 * viennent de groupes transversaux de l'annuaire et y restent. Et le **profil
 * d'administration** est refusé dès l'écriture, par un déclencheur.
 *
 * ── DEUX ARBITRAGES DE FORME ────────────────────────────────────────────────
 *
 * ⚠️ **Une délégation se RÉVOQUE, elle ne se supprime pas** — il n'existe aucune
 * politique de suppression sur la table. Effacer effacerait la trace d'un droit
 * qui a EXISTÉ, et ce registre doit y répondre trois ans plus tard.
 *
 * ⚠️ **Le login est VÉRIFIÉ dans l'annuaire quand il y en a un**, et le refus le
 * dit ; sans annuaire, la délégation est acceptée et l'écran annonce qu'elle n'a
 * pas pu être vérifiée. Un login mal orthographié n'accorde rien — silencieusement
 * — et c'est précisément l'écart le plus coûteux du contrôle de cohérence.
 */

import type { PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import { engendrerIdentifiant } from '../entites/index.js';
import { entreeInvalide, ErreurApplicative, lireErreurPostgres } from '../erreurs/index.js';
import type { PerimetreSession } from '../db/pool.js';

/* =====================================================================
 *  1. Ce que la lecture rend
 * ===================================================================== */

export interface LigneDelegation {
  readonly id: string;
  readonly login: string;
  readonly profilId: string;
  readonly profilCode: string | null;
  readonly profilNom: string | null;
  readonly perimetre: string;
  readonly filialeId: string | null;
  readonly filialeCode: string | null;
  readonly debut: string;
  readonly fin: string;
  readonly motif: string;
  readonly accordePar: string;
  readonly revoqueeLe: string | null;
  readonly revoqueePar: string | null;
  readonly motifRevocation: string | null;
  /** DÉRIVÉ par la base : `a_venir` · `active` · `expiree` · `revoquee`. */
  readonly etat: string;
  /** Jours restants pour une délégation active — négatif n'existe pas ici. */
  readonly joursRestants: number | null;
  readonly version: number;
}

/**
 * Plafond de matière.
 *
 * ⚠️ Toute collection servie en porte un (`CONVENTIONS.md`, constat Q-304) : une
 * lecture non bornée est une porte ouverte le jour où la table grossit.
 */
const DELEGATIONS_MAX = 500;

export async function lireDelegations(
  client: PoolClient,
): Promise<{ readonly delegations: readonly LigneDelegation[]; readonly tronque: boolean }> {
  const { rows } = await client.query<{
    id: string;
    login: string;
    profil_id: string;
    profil_code: string | null;
    profil_nom: string | null;
    perimetre: string;
    filiale_cible_id: string | null;
    filiale_code: string | null;
    debut: string;
    fin: string;
    motif: string;
    accorde_par: string;
    revoquee_le: string | null;
    revoquee_par: string | null;
    motif_revocation: string | null;
    etat: string;
    jours_restants: number | null;
    version: number;
  }>(
    /* ⚠️ `f_filiales_inventaire()` et non `filiales` — migrations `065` et `067`,
     * trois fois payé le 24/09/2026 : la jointure perdrait la filiale que la
     * session ne lit pas, et l'écran afficherait une colonne vide sur la
     * délégation qui vient d'être accordée.
     *
     * ⚠️ L'état se DÉRIVE ici aussi, par la même fonction : le recalculer en
     * TypeScript en ferait une seconde vérité. */
    `select d."id", d."login", d."profil_id", p."code" as profil_code, p."nom" as profil_nom,
            d."perimetre", d."filiale_cible_id", f."code" as filiale_code,
            to_char(d."debut", 'YYYY-MM-DD') as "debut",
            to_char(d."fin", 'YYYY-MM-DD') as "fin",
            d."motif", d."accorde_par",
            to_char(d."revoquee_le", 'YYYY-MM-DD"T"HH24:MI:SSOF') as "revoquee_le",
            d."revoquee_par", d."motif_revocation",
            f_etat_delegation(d."debut", d."fin", d."revoquee_le") as "etat",
            case when d."revoquee_le" is null and current_date between d."debut" and d."fin"
                 then (d."fin" - current_date) end as "jours_restants",
            d."version"
       from "delegations_droits" d
       left join "profils" p on p."id" = d."profil_id"
       left join f_filiales_inventaire() f on f."id" = d."filiale_cible_id"
      order by case f_etat_delegation(d."debut", d."fin", d."revoquee_le")
                 when 'active' then 0 when 'a_venir' then 1 else 2 end,
               d."fin" desc, d."login"
      limit $1`,
    [DELEGATIONS_MAX + 1],
  );

  const tronque = rows.length > DELEGATIONS_MAX;
  return Object.freeze({
    tronque,
    delegations: rows.slice(0, DELEGATIONS_MAX).map((r) =>
      Object.freeze({
        id: r.id,
        login: r.login,
        profilId: r.profil_id,
        profilCode: r.profil_code,
        profilNom: r.profil_nom,
        perimetre: r.perimetre,
        filialeId: r.filiale_cible_id,
        filialeCode: r.filiale_code,
        debut: r.debut,
        fin: r.fin,
        motif: r.motif,
        accordePar: r.accorde_par,
        revoqueeLe: r.revoquee_le,
        revoqueePar: r.revoquee_par,
        motifRevocation: r.motif_revocation,
        etat: r.etat,
        joursRestants: r.jours_restants === null ? null : Number(r.jours_restants),
        version: r.version,
      }),
    ),
  });
}

/* =====================================================================
 *  2. L'octroi
 * ===================================================================== */

export interface DelegationEntrante {
  readonly login?: unknown;
  readonly profilId?: unknown;
  readonly perimetre?: unknown;
  readonly filialeId?: unknown;
  readonly debut?: unknown;
  readonly fin?: unknown;
  readonly motif?: unknown;
}

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** Texte obligatoire, borné, et refusé plutôt qu'ignoré s'il est du mauvais type. */
function texteObligatoire(valeur: unknown, champ: string, max: number): string {
  if (typeof valeur !== 'string') {
    throw entreeInvalide(`Le champ « ${champ} » est obligatoire et doit être une chaîne.`);
  }
  const nettoye = valeur.trim();
  if (nettoye === '') throw entreeInvalide(`Le champ « ${champ} » est obligatoire.`);
  if (nettoye.length > max) {
    throw entreeInvalide(`Le champ « ${champ} » dépasse ${String(max)} caractères.`);
  }
  return nettoye;
}

/**
 * Accorde une délégation.
 *
 * ⚠️ **Les six propriétés ne sont PAS revérifiées ici** — elles sont des
 * contraintes de la base, et les revérifier en TypeScript en ferait une seconde
 * rédaction qui divergerait (constat Q-219). Ce qui est fait ici est de
 * **traduire** le refus de PostgreSQL en une phrase qu'un administrateur peut
 * agir : « violates check constraint ck_delegations_pas_soi_meme » n'apprend rien
 * à personne.
 */
export async function accorderDelegation(
  client: PoolClient,
  corps: DelegationEntrante,
  perimetre: PerimetreSession,
): Promise<{ readonly id: string }> {
  const login = texteObligatoire(corps.login, 'login', 256).toLowerCase();
  const profilId = texteObligatoire(corps.profilId, 'profilId', 64);
  const motif = texteObligatoire(corps.motif, 'motif', 2_000);
  const portee = String(corps.perimetre ?? '');
  if (portee !== 'filiale' && portee !== 'groupe') {
    throw entreeInvalide(
      'Le périmètre d’une délégation vaut « filiale » ou « groupe ». ' +
        'Il n’existe pas de délégation « transversale » : l’export et l’administration ' +
        'viennent de groupes de l’annuaire, et une délégation n’y touche jamais.',
    );
  }
  const filialeId = portee === 'filiale' ? texteObligatoire(corps.filialeId, 'filialeId', 64) : null;

  const debut = corps.debut === undefined || corps.debut === null || corps.debut === ''
    ? null
    : texteObligatoire(corps.debut, 'debut', 10);
  const fin = texteObligatoire(corps.fin, 'fin', 10);
  if (debut !== null && !FORME_DATE.test(debut)) {
    throw entreeInvalide('La date de début s’écrit AAAA-MM-JJ.');
  }
  if (!FORME_DATE.test(fin)) throw entreeInvalide('La date de fin s’écrit AAAA-MM-JJ.');

  const id = engendrerIdentifiant('DELEG');
  try {
    await client.query(
      `insert into "delegations_droits"
              ("id", "login", "profil_id", "perimetre", "filiale_cible_id",
               "debut", "fin", "motif", "accorde_par")
       values ($1, $2, $3, $4, $5, coalesce($6::date, current_date), $7::date, $8, $9)`,
      [id, login, profilId, portee, filialeId, debut, fin, motif, perimetre.utilisateurId],
    );
  } catch (erreur) {
    throw traduireRefus(erreur, login);
  }

  await journaliser(client, {
    action: 'administration',
    // §29.5 : phrase littérale. Le login, le motif et les dates partent en jsonb.
    resume: 'Octroi d’une délégation temporaire de droits',
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'profils',
    entiteId: id,
    valeursApres: {
      beneficiaire: login,
      profil_id: profilId,
      perimetre: portee,
      filiale_cible_id: filialeId,
      debut: debut ?? '(aujourd’hui)',
      fin,
      motif,
    },
  });

  return { id };
}

/* =====================================================================
 *  3. La révocation — une délégation ne se supprime pas
 * ===================================================================== */

export async function revoquerDelegation(
  client: PoolClient,
  id: string,
  motifRevocation: unknown,
  version: unknown,
  perimetre: PerimetreSession,
): Promise<void> {
  const motif = texteObligatoire(motifRevocation, 'motif', 2_000);
  const numero = Number(version);
  if (!Number.isInteger(numero)) {
    throw entreeInvalide('La version attendue de l’enregistrement est absente ou invalide.');
  }

  const { rows } = await client.query<{ login: string; revoquee_le: string | null }>(
    `select "login", "revoquee_le" from "delegations_droits" where "id" = $1`,
    [id],
  );
  const avant = rows[0];
  if (avant === undefined) {
    throw new ErreurApplicative({
      code: 'ressource_inconnue',
      statut: 404,
      message: 'Cette délégation n’existe pas.',
    });
  }
  if (avant.revoquee_le !== null) {
    throw new ErreurApplicative({
      code: 'contrainte_base',
      statut: 409,
      message:
        'Cette délégation est déjà révoquée. Une révocation est une décision datée : la ' +
        'rejouer écraserait son auteur et sa date par ceux d’aujourd’hui.',
      detailJournal: `délégation ${id} déjà révoquée`,
    });
  }

  const maj = await client.query(
    `update "delegations_droits"
        set "revoquee_le" = now(), "revoquee_par" = $1, "motif_revocation" = $2
      where "id" = $3 and "version" = $4`,
    [perimetre.utilisateurId, motif, id, numero],
  );
  if (maj.rowCount === 0) {
    throw new ErreurApplicative({
      code: 'conflit_version',
      statut: 409,
      message:
        'Cette délégation a été modifiée entre-temps. Rechargez l’écran : écraser la ' +
        'décision de quelqu’un d’autre sans la voir serait pire que ce refus.',
      detailJournal: `délégations ${id} : version ${String(numero)} périmée`,
    });
  }

  await journaliser(client, {
    action: 'administration',
    resume: 'Révocation d’une délégation temporaire de droits',
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'profils',
    entiteId: id,
    valeursApres: { beneficiaire: avant.login, motif_revocation: motif },
  });
}

/* =====================================================================
 *  4. Traduire les refus de la base
 * ===================================================================== */

/**
 * Chaque contrainte de la `068` a sa phrase, et elle **nomme la conséquence**.
 *
 * ⚠️ Un message qui dirait « violates check constraint ck_delegations_duree »
 * n'apprend rien : celui qui le lit veut savoir *ce qu'on lui refuse et pourquoi*.
 * C'est la même discipline que le refus du code d'une filiale.
 */
function traduireRefus(erreur: unknown, login: string): unknown {
  const pg = lireErreurPostgres(erreur);
  const contrainte = pg?.constraint ?? '';

  if (contrainte === 'ck_delegations_pas_soi_meme') {
    return new ErreurApplicative({
      code: 'contrainte_base',
      statut: 409,
      message:
        'On ne se délègue pas des droits à soi-même. C’est le seul chemin d’élévation de ' +
        'privilège que ce dispositif pourrait ouvrir, et il est fermé dans la base : une ' +
        'délégation est une décision prise POUR quelqu’un d’autre, et son auteur en répond.',
      detailJournal: `auto-délégation refusée pour ${login}`,
    });
  }
  if (contrainte === 'ck_delegations_duree') {
    return new ErreurApplicative({
      code: 'contrainte_base',
      statut: 400,
      message:
        'Une délégation dure 90 jours au plus. « Temporaire » qui se reconduit tacitement ' +
        'redevient permanent : prolonger est une NOUVELLE décision, avec son motif et son ' +
        'auteur.',
      detailJournal: 'durée de délégation hors borne',
    });
  }
  if (contrainte === 'ck_delegations_motif') {
    return new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message:
        'Le motif doit dire quelque chose — dix caractères au moins. Cette ligne est celle ' +
        'qu’un auditeur lit : « RAS » est une habitude, pas une justification.',
      detailJournal: 'motif de délégation trop court',
    });
  }
  if (contrainte === 'ck_delegations_periode') {
    return new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message: 'La date de fin ne peut pas précéder la date de début.',
      detailJournal: 'période de délégation inversée',
    });
  }
  if (contrainte === 'ck_delegations_portee') {
    return new ErreurApplicative({
      code: 'donnee_invalide',
      statut: 400,
      message:
        'Une délégation de périmètre « filiale » nomme sa filiale ; une délégation de ' +
        'périmètre « groupe » n’en nomme aucune.',
      detailJournal: 'portée de délégation incohérente',
    });
  }
  // Le déclencheur du profil d'administration lève un `check_violation` sans nom
  // de contrainte : son message porte déjà l'explication et le conseil.
  if (pg?.code === '23514' && contrainte === '') {
    return new ErreurApplicative({
      code: 'contrainte_base',
      statut: 409,
      message:
        'Le profil d’administration ne se délègue pas. Administrer l’application est un ' +
        'acte de portée Groupe, attaché au groupe transversal d’administration de ' +
        'l’annuaire : ouvrir un second chemin vers lui contredirait la règle que tout le ' +
        'dispositif répète — les droits viennent de l’annuaire. Un administrateur en congé ' +
        'se remplace DANS L’ANNUAIRE.',
      detailJournal: 'délégation du profil ADMIN refusée',
    });
  }
  return erreur;
}
