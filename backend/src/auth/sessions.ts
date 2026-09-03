/**
 * Le dépôt des sessions serveur : ouverture, vérification, révocation, purge —
 * et le provisionnement des comptes.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le jeton est une RÉFÉRENCE, jamais une revendication
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le navigateur ne détient qu'une chaîne opaque de 32 octets aléatoires. Le
 * serveur en conserve **l'empreinte SHA-256**, jamais le jeton lui-même
 * (`sessions.jeton_empreinte`, commentaire de `001_socle.sql` §8) : une lecture
 * de la base ne permet pas d'usurper une session.
 *
 * Et surtout : **rien de ce jeton n'est interprété**. Il sert à retrouver une
 * ligne, dont toutes les valeurs — périmètre, filiales, profil, droit d'export —
 * ont été écrites par la transaction d'ouverture depuis les groupes AD. C'est la
 * différence entière avec un jeton porteur de revendications, qu'il faudrait
 * valider et dont une faille de validation donnerait le périmètre au client.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le déprovisionnement immédiat, et pourquoi il n'attend pas la reconnexion
 * ════════════════════════════════════════════════════════════════════════
 *
 * `PLAN_SERVEUR` §1.5 : « la désactivation du compte AD, ou le retrait du
 * groupe, coupe l'accès à la connexion suivante **et invalide les sessions
 * actives** ». La seconde moitié est celle qui coûte : une session ouverte le
 * matin vit jusqu'au soir, et l'utilisateur peut avoir été licencié entre-temps.
 *
 * Deux mécanismes, et il faut les deux :
 *  · `revoquerToutesDe()` — appelé dès qu'une relecture de l'annuaire dit que le
 *    compte est désactivé ou a perdu ses groupes. La session en cours est
 *    **révoquée en base** : la requête suivante, quelle qu'elle soit, reçoit 401 ;
 *  · `verifier()` — à **chaque** requête, relit la ligne et recontrôle
 *    `utilisateurs.actif`, la révocation, l'échéance absolue et l'inactivité.
 *    Il n'y a aucun cache : une session révoquée à l'instant t est refusée à
 *    t + ε, pas à t + la durée d'un cache.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le silence des refus d'écriture, et comment il est rattrapé
 * ════════════════════════════════════════════════════════════════════════
 *
 * Depuis la migration `007`, l'écriture du substrat exige `grc.authentification`.
 * Un `insert` sans le réglage lève 42501 — bruyamment. Un `update` ou un
 * `delete`, lui, n'affecte **aucune ligne** et annonce un succès : c'est la
 * nature d'une politique `using`. La parade est ici, et nulle part ailleurs :
 * **chaque révocation et chaque purge compte les lignes affectées**, et le
 * compte est rendu à l'appelant, qui lève s'il attendait quelque chose.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { DomaineFonctionnelBase, DroitsResolus, NiveauDroit, PorteeSession } from '../droits/modele.js';
import { estDomaine, estNiveau } from '../droits/modele.js';
import type { EtatSession } from '../droits/resolveur.js';

import type { IdentiteAnnuaire } from './annuaire.js';

/* =====================================================================
 *  Jetons
 * ===================================================================== */

/** 32 octets du générateur cryptographique du système, en base64url. */
export function engendrerJeton(): string {
  return randomBytes(32).toString('base64url');
}

/** Empreinte stockée. Le jeton en clair ne vit que dans le cookie. */
export function empreinteJeton(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}

/* =====================================================================
 *  Ouverture
 * ===================================================================== */

export interface OuvertureSession {
  readonly utilisateurId: string;
  /** Le **login**, tel qu'il sera tracé au journal (`CONVENTIONS.md` §18.3). */
  readonly login: string;
  readonly droits: DroitsResolus;
  readonly adresseIp: string | null;
  readonly agentUtilisateur: string | null;
  readonly dureeInactiviteMinutes: number;
  readonly dureeMaximaleHeures: number;
  readonly compteSecours: boolean;
}

export interface SessionOuverte {
  /** Le jeton EN CLAIR. Il ne repasse jamais par la base ; il part au cookie. */
  readonly jeton: string;
  readonly etat: EtatSession;
}

/**
 * Crée la session et ses deux tables filles.
 *
 * ⚠️ La transaction appelante **doit** avoir posé `grc.authentification`
 * (`avecTransactionAuthentification`). Sans cela, l'insertion lève 42501 :
 * c'est exactement ce que la condition E1 exige.
 */
export async function ouvrirSession(
  client: PoolClient,
  ouverture: OuvertureSession,
): Promise<SessionOuverte> {
  const jeton = engendrerJeton();
  const empreinte = empreinteJeton(jeton);

  const { rows } = await client.query<{ id: string; expire_le: Date; derniere_activite: Date }>(
    `insert into "sessions"
            ("id", "jeton_empreinte", "utilisateur_id", "filiale_active_id", "perimetre",
             "administrateur", "peut_exporter", "adresse_ip", "agent_utilisateur", "expire_le")
     values (f_generer_id('SESS'), $1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 || ' hours')::interval)
     returning "id", "expire_le", "derniere_activite"`,
    [
      empreinte,
      ouverture.utilisateurId,
      ouverture.droits.filialeActive,
      ouverture.droits.portee,
      ouverture.droits.administrateur,
      ouverture.droits.peutExporter,
      ouverture.adresseIp,
      // L'agent utilisateur est borné : c'est une en-tête libre, et le journal
      // n'a pas à porter deux kilo-octets de chaîne choisie par le client (S13).
      ouverture.agentUtilisateur === null ? null : ouverture.agentUtilisateur.slice(0, 512),
      String(ouverture.dureeMaximaleHeures),
    ],
  );

  const ligne = rows[0];
  if (ligne === undefined) throw new Error('Ouverture de session : aucune ligne rendue.');

  for (const filiale of ouverture.droits.filiales) {
    await client.query(
      `insert into "session_filiales" ("session_id", "filiale_id") values ($1, $2)`,
      [ligne.id, filiale],
    );
  }

  for (const [domaine, niveau] of ouverture.droits.domaines) {
    await client.query(
      `insert into "session_domaines" ("session_id", "domaine", "niveau") values ($1, $2, $3)`,
      [ligne.id, domaine, niveau],
    );
  }

  return {
    jeton,
    etat: Object.freeze({
      sessionId: ligne.id,
      login: ouverture.login,
      utilisateurId: ouverture.utilisateurId,
      portee: ouverture.droits.portee,
      filiales: Object.freeze([...ouverture.droits.filiales]) as readonly string[],
      filialeActive: ouverture.droits.filialeActive,
      administrateur: ouverture.droits.administrateur,
      peutExporter: ouverture.droits.peutExporter,
      domaines: ouverture.droits.domaines,
      expireLe: ligne.expire_le,
      derniereActivite: ligne.derniere_activite,
      compteSecours: ouverture.compteSecours,
    }),
  };
}

/* =====================================================================
 *  Vérification
 * ===================================================================== */

/** Pourquoi une session présentée n'est pas acceptée. Va au journal, pas au client. */
export type MotifRefusSession =
  | 'inconnue'
  | 'revoquee'
  | 'expiree'
  | 'inactive'
  | 'compte_desactive';

export interface VerificationSession {
  readonly etat: EtatSession | null;
  readonly motif: MotifRefusSession | null;
  /** Login connu même en cas de refus, pour que le journal impute l'événement. */
  readonly login: string | null;
  readonly sessionId: string | null;
}

interface LigneSession {
  readonly id: string;
  readonly utilisateur_id: string;
  readonly identifiant: string;
  readonly actif: boolean;
  readonly compte_secours: boolean;
  readonly filiale_active_id: string | null;
  readonly perimetre: string;
  readonly administrateur: boolean;
  readonly peut_exporter: boolean;
  readonly expire_le: Date;
  readonly derniere_activite: Date;
  readonly revoquee_le: Date | null;
}

/**
 * Retrouve une session par son jeton et vérifie qu'elle est encore valable.
 *
 * Cinq refus possibles, dans l'ordre où ils sont contrôlés. L'ordre compte peu
 * pour la sécurité — tous refusent — mais beaucoup pour le journal : « session
 * révoquée » et « session expirée » ne s'expliquent pas de la même façon à un
 * exploitant.
 */
export async function verifierSession(
  client: PoolClient,
  jeton: string,
  dureeInactiviteMinutes: number,
): Promise<VerificationSession> {
  const { rows } = await client.query<LigneSession>(
    `select s."id", s."utilisateur_id", u."identifiant", u."actif", u."compte_secours",
            s."filiale_active_id", s."perimetre", s."administrateur", s."peut_exporter",
            s."expire_le", s."derniere_activite", s."revoquee_le"
       from "sessions" s
       join "utilisateurs" u on u."id" = s."utilisateur_id"
      where s."jeton_empreinte" = $1`,
    [empreinteJeton(jeton)],
  );

  const ligne = rows[0];
  if (ligne === undefined) {
    return { etat: null, motif: 'inconnue', login: null, sessionId: null };
  }

  const refus = (motif: MotifRefusSession): VerificationSession => ({
    etat: null,
    motif,
    login: ligne.identifiant,
    sessionId: ligne.id,
  });

  if (ligne.revoquee_le !== null) return refus('revoquee');
  if (!ligne.actif) return refus('compte_desactive');

  const maintenant = Date.now();
  if (ligne.expire_le.getTime() <= maintenant) return refus('expiree');
  if (ligne.derniere_activite.getTime() + dureeInactiviteMinutes * 60_000 <= maintenant) {
    return refus('inactive');
  }

  const { rows: filiales } = await client.query<{ filiale_id: string }>(
    `select "filiale_id" from "session_filiales" where "session_id" = $1 order by "filiale_id"`,
    [ligne.id],
  );
  const { rows: domaines } = await client.query<{ domaine: string; niveau: string }>(
    `select "domaine", "niveau" from "session_domaines" where "session_id" = $1`,
    [ligne.id],
  );

  const carte = new Map<DomaineFonctionnelBase, NiveauDroit>();
  for (const d of domaines) {
    // Défaut fermé : une valeur hors vocabulaire n'ouvre rien (voir `modele.ts`).
    if (estDomaine(d.domaine) && estNiveau(d.niveau)) carte.set(d.domaine, d.niveau);
  }

  return {
    motif: null,
    login: ligne.identifiant,
    sessionId: ligne.id,
    etat: Object.freeze({
      sessionId: ligne.id,
      login: ligne.identifiant,
      utilisateurId: ligne.utilisateur_id,
      portee: ligne.perimetre as PorteeSession,
      filiales: Object.freeze(filiales.map((f) => f.filiale_id)) as readonly string[],
      filialeActive: ligne.filiale_active_id,
      administrateur: ligne.administrateur,
      peutExporter: ligne.peut_exporter,
      domaines: carte,
      expireLe: ligne.expire_le,
      derniereActivite: ligne.derniere_activite,
      compteSecours: ligne.compte_secours,
    }),
  };
}

/* =====================================================================
 *  Entretien
 * ===================================================================== */

/**
 * Rafraîchit `derniere_activite`.
 *
 * @param graceMs n'écrit que si la dernière écriture remonte à plus longtemps
 *   que cela. Sans ce garde, toute lecture deviendrait une écriture — un
 *   `update` par requête sur une table qu'aucun index ne protège de la
 *   contention, pour une précision dont personne n'a besoin.
 */
export async function toucherSession(
  client: PoolClient,
  sessionId: string,
  graceMs = 30_000,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `update "sessions"
        set "derniere_activite" = now()
      where "id" = $1
        and "revoquee_le" is null
        and "derniere_activite" < now() - ($2 || ' milliseconds')::interval`,
    [sessionId, String(graceMs)],
  );
  return (rowCount ?? 0) > 0;
}

/** Révoque une session. Rend le nombre de lignes touchées — voir l'entête. */
export async function revoquerSession(
  client: PoolClient,
  sessionId: string,
  motif: string,
): Promise<number> {
  const { rowCount } = await client.query(
    `update "sessions" set "revoquee_le" = now(), "motif_revocation" = $2
      where "id" = $1 and "revoquee_le" is null`,
    [sessionId, motif],
  );
  return rowCount ?? 0;
}

/**
 * Révoque **toutes** les sessions actives d'un compte : c'est le geste du
 * déprovisionnement immédiat (`PLAN_SERVEUR` §1.5).
 */
export async function revoquerSessionsDe(
  client: PoolClient,
  utilisateurId: string,
  motif: string,
): Promise<number> {
  const { rowCount } = await client.query(
    `update "sessions" set "revoquee_le" = now(), "motif_revocation" = $2
      where "utilisateur_id" = $1 and "revoquee_le" is null`,
    [utilisateurId, motif],
  );
  return rowCount ?? 0;
}

/** Supprime les sessions closes depuis longtemps. Entretien, jamais sécurité. */
export async function purgerSessions(client: PoolClient, retentionJours = 30): Promise<number> {
  const { rowCount } = await client.query(
    `delete from "sessions"
      where ("revoquee_le" is not null and "revoquee_le" < now() - ($1 || ' days')::interval)
         or "expire_le" < now() - ($1 || ' days')::interval`,
    [String(retentionJours)],
  );
  return rowCount ?? 0;
}

/* =====================================================================
 *  Comptes
 * ===================================================================== */

export interface CompteApplicatif {
  readonly id: string;
  readonly identifiant: string;
  readonly actif: boolean;
  readonly compteSecours: boolean;
  readonly filialeDefautId: string | null;
}

export async function lireCompte(
  client: PoolClient,
  login: string,
): Promise<CompteApplicatif | null> {
  const { rows } = await client.query<{
    id: string;
    identifiant: string;
    actif: boolean;
    compte_secours: boolean;
    filiale_defaut_id: string | null;
  }>(
    `select "id", "identifiant", "actif", "compte_secours", "filiale_defaut_id"
       from "utilisateurs" where lower("identifiant") = lower($1)`,
    [login],
  );
  const ligne = rows[0];
  if (ligne === undefined) return null;
  return {
    id: ligne.id,
    identifiant: ligne.identifiant,
    actif: ligne.actif,
    compteSecours: ligne.compte_secours,
    filialeDefautId: ligne.filiale_defaut_id,
  };
}

/**
 * Provisionne ou rafraîchit un compte depuis l'annuaire.
 *
 * `PLAN_SERVEUR` §1.5 : « un utilisateur inconnu mais membre d'un groupe
 * autorisé est créé à sa première connexion. Aucune administration manuelle des
 * comptes. » Cette fonction n'est appelée qu'**après** que la résolution des
 * droits a établi que le compte ouvre un accès : provisionner quelqu'un qui n'a
 * aucun groupe reviendrait à peupler la table avec l'annuaire entier, un login
 * à la fois.
 *
 * ⚠️ « systeme » est **réservé** (`CONVENTIONS.md` §19.2) : la contrainte
 * `ck_utilisateurs_identifiant_reserve` refuserait l'insertion, mais le refus
 * arriverait sous la forme d'un 23514 opaque. Il est donc écarté ici, avec un
 * message qui dit pourquoi.
 */
export async function provisionnerCompte(
  client: PoolClient,
  identite: IdentiteAnnuaire,
): Promise<{ id: string; cree: boolean }> {
  if (identite.login.trim().toLowerCase() === 'systeme') {
    throw new Error(
      "L'identifiant « systeme » est réservé à la sentinelle des traitements internes " +
        '(CONVENTIONS.md §19.2) : un compte de l’annuaire ne peut pas le porter, sans quoi ' +
        'tous les événements système lui seraient imputés dans un journal scellé.',
    );
  }

  const existant = await lireCompte(client, identite.login);

  if (existant !== null) {
    await client.query(
      `update "utilisateurs"
          set "nom_affichage" = $2, "email" = $3, "nom" = $4, "prenom" = $5,
              "upn" = coalesce($6, "upn"), "sid_ad" = coalesce($7, "sid_ad"),
              "derniere_connexion" = now(), "derniere_synchro_ad" = now(),
              "actif" = true, "tentatives_echouees" = 0, "verrouille_jusqu_a" = null
        where "id" = $1`,
      [
        existant.id,
        identite.nomAffichage,
        identite.email,
        identite.nom,
        identite.prenom,
        identite.upn,
        identite.sid,
      ],
    );
    return { id: existant.id, cree: false };
  }

  const { rows } = await client.query<{ id: string }>(
    `insert into "utilisateurs"
            ("id", "identifiant", "upn", "sid_ad", "nom", "prenom", "nom_affichage", "email",
             "derniere_connexion", "derniere_synchro_ad")
     values (f_generer_id('USR'), $1, $2, $3, $4, $5, $6, $7, now(), now())
     returning "id"`,
    [
      identite.login,
      identite.upn,
      identite.sid,
      identite.nom,
      identite.prenom,
      identite.nomAffichage,
      identite.email,
    ],
  );
  const ligne = rows[0];
  if (ligne === undefined) throw new Error('Provisionnement : aucune ligne rendue.');
  return { id: ligne.id, cree: true };
}

/**
 * Désactive un compte et **révoque ses sessions dans la même transaction**.
 *
 * Les deux gestes ne se séparent pas : désactiver sans révoquer laisserait la
 * session en cours travailler jusqu'à son expiration, ce que le
 * `PLAN_SERVEUR` §1.5 refuse explicitement.
 */
export async function desactiverCompte(
  client: PoolClient,
  utilisateurId: string,
  motif: string,
): Promise<{ sessionsRevoquees: number }> {
  await client.query(`update "utilisateurs" set "actif" = false where "id" = $1`, [utilisateurId]);
  const sessionsRevoquees = await revoquerSessionsDe(client, utilisateurId, motif);
  return { sessionsRevoquees };
}

/** Enregistre un échec de connexion sur un compte connu, et verrouille au seuil. */
export async function compterEchec(
  client: PoolClient,
  utilisateurId: string,
  maxTentatives: number,
  dureeVerrouillageMinutes: number,
): Promise<{ verrouille: boolean }> {
  const { rows } = await client.query<{ verrouille: boolean }>(
    `update "utilisateurs"
        set "tentatives_echouees" = "tentatives_echouees" + 1,
            "verrouille_jusqu_a" = case
              when "tentatives_echouees" + 1 >= $2
                then now() + ($3 || ' minutes')::interval
              else "verrouille_jusqu_a" end
      where "id" = $1
      returning ("verrouille_jusqu_a" is not null and "verrouille_jusqu_a" > now()) as "verrouille"`,
    [utilisateurId, maxTentatives, String(dureeVerrouillageMinutes)],
  );
  return { verrouille: rows[0]?.verrouille ?? false };
}

/** Le compte est-il verrouillé en base à cet instant ? */
export async function estVerrouille(client: PoolClient, utilisateurId: string): Promise<boolean> {
  const { rows } = await client.query<{ verrouille: boolean }>(
    `select ("verrouille_jusqu_a" is not null and "verrouille_jusqu_a" > now()) as "verrouille"
       from "utilisateurs" where "id" = $1`,
    [utilisateurId],
  );
  return rows[0]?.verrouille ?? false;
}

/** Crée, si besoin, le compte applicatif du compte de secours. */
export async function assurerCompteSecours(
  client: PoolClient,
  identifiant: string,
  empreinte: string,
): Promise<string> {
  const existant = await lireCompte(client, identifiant);
  if (existant !== null) {
    await client.query(
      `update "utilisateurs"
          set "mot_de_passe_hash" = $2, "compte_secours" = true, "actif" = true
        where "id" = $1`,
      [existant.id, empreinte],
    );
    return existant.id;
  }

  const { rows } = await client.query<{ id: string }>(
    `insert into "utilisateurs"
            ("id", "identifiant", "nom_affichage", "compte_secours", "mot_de_passe_hash")
     values (f_generer_id('USR'), $1, $2, true, $3)
     returning "id"`,
    [identifiant, `Compte de secours (${identifiant})`, empreinte],
  );
  const ligne = rows[0];
  if (ligne === undefined) throw new Error('Compte de secours : aucune ligne rendue.');
  return ligne.id;
}
