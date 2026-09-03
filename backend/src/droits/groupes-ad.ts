/**
 * Les groupes Active Directory : **engendrés** depuis la configuration, jamais
 * écrits à la main.
 *
 * `PLAN_SERVEUR` §3.4 fixe la convention de nommage :
 *
 *     GRC-<FILIALE>-<PROFIL>      GRC-TLS-RSSI, GRC-DEU-CONTRIB
 *     GRC-GROUPE-<PROFIL>         GRC-GROUPE-DIRECTION, GRC-GROUPE-RSSI
 *     GRC-EXPORT                  droit d'export, transversal
 *     GRC-ADMIN                   administration de l'application
 *
 * Le §19.5 — « une liste écrite à la main est une omission qui attend » — vaut
 * ici plus qu'ailleurs : la liste est le **produit cartésien** des filiales
 * actives par les profils de socle. Vingt filiales et huit profils font cent
 * soixante-deux lignes, et une filiale acquise en cours d'année en ajoute huit.
 * Écrire cela à la main, c'est garantir qu'un jour une filiale n'aura pas de
 * groupe qualité et que personne ne saura pourquoi.
 *
 * Deux usages, et il faut les distinguer :
 *
 *  · `groupesAttendus()` rend la liste **à créer côté AD**. C'est le livrable
 *    d'exploitation du §3.4, « prêt à exécuter », que l'agent de déploiement met
 *    en forme (PowerShell, LDIF, ou une demande à l'équipe IT).
 *  · `synchroniserGroupesAd()` écrit ces mêmes groupes dans la table
 *    `groupes_ad`, qui est **l'autorité applicative** : un groupe absent de la
 *    table n'accorde rien, même s'il existe dans l'annuaire (`resolution.ts`).
 *
 * ⚠️ La synchronisation **n'efface jamais** : elle ajoute ce qui manque et
 * laisse tel quel ce qui existe. Un groupe retiré du dispositif se désactive
 * (`actif = false`), ce qui conserve la trace de ce qu'il accordait — c'est
 * exactement ce que dit le commentaire de la colonne dans `001_socle.sql` §7.
 * Une synchronisation qui supprimerait retirerait des accès sans que personne
 * l'ait décidé.
 */

import type { PoolClient } from 'pg';

/** Un groupe AD attendu, et ce qu'il accorde. */
export interface GroupeAttendu {
  readonly nom: string;
  readonly perimetre: 'filiale' | 'groupe' | 'transversal';
  readonly filialeId: string | null;
  readonly profilCode: string | null;
  readonly accordeExport: boolean;
  readonly accordeAdmin: boolean;
  readonly description: string;
}

export interface FilialeConnue {
  readonly id: string;
  readonly code: string;
  readonly raisonSociale: string;
}

export interface ProfilConnu {
  readonly id: string;
  readonly code: string;
  readonly nom: string;
}

/** Segment réservé aux groupes de périmètre Groupe (`GRC-GROUPE-<PROFIL>`). */
const SEGMENT_GROUPE = 'GROUPE';

/**
 * Engendre la liste complète des groupes attendus.
 *
 * `prefixe` vient de `LDAP_PREFIXE_GROUPES` : un déploiement dont l'AD impose
 * un autre préfixe n'a rien d'autre à changer.
 */
export function groupesAttendus(
  prefixe: string,
  filiales: readonly FilialeConnue[],
  profils: readonly ProfilConnu[],
): readonly GroupeAttendu[] {
  const p = prefixe.toUpperCase();
  const attendus: GroupeAttendu[] = [];

  for (const filiale of filiales) {
    for (const profil of profils) {
      // Un administrateur d'une seule filiale n'existe pas : administrer
      // l'application est de niveau Groupe (voir `resolution.ts`).
      if (profil.code === 'ADMIN') continue;
      attendus.push({
        nom: `${p}${filiale.code}-${profil.code}`,
        perimetre: 'filiale',
        filialeId: filiale.id,
        profilCode: profil.code,
        accordeExport: false,
        accordeAdmin: false,
        description: `${profil.nom} — ${filiale.raisonSociale}`,
      });
    }
  }

  for (const profil of profils) {
    if (profil.code === 'ADMIN') continue;
    attendus.push({
      nom: `${p}${SEGMENT_GROUPE}-${profil.code}`,
      perimetre: 'groupe',
      filialeId: null,
      profilCode: profil.code,
      accordeExport: false,
      accordeAdmin: false,
      description: `${profil.nom} — périmètre Groupe, toutes filiales`,
    });
  }

  attendus.push({
    nom: `${p}EXPORT`,
    perimetre: 'transversal',
    filialeId: null,
    profilCode: null,
    accordeExport: true,
    accordeAdmin: false,
    description:
      "Droit d'extraction de données hors de l'application, distinct de la lecture " +
      '(PLAN_SERVEUR §3.3). Tout export est journalisé.',
  });

  attendus.push({
    nom: `${p}ADMIN`,
    perimetre: 'transversal',
    filialeId: null,
    profilCode: null,
    accordeExport: false,
    accordeAdmin: true,
    description:
      "Administration de l'application : filiales, droits, paramètres, journal. Accorde le " +
      'périmètre Groupe, administrer une seule filiale n’ayant pas de sens.',
  });

  return attendus;
}

/** Ce qu'une synchronisation a fait. Rendu pour être journalisé, pas deviné. */
export interface BilanSynchronisation {
  readonly crees: readonly string[];
  readonly presents: readonly string[];
  /** Groupes de la table qui ne figurent plus parmi les attendus. Signalés, jamais effacés. */
  readonly inattendus: readonly string[];
}

/**
 * Aligne `groupes_ad` sur les groupes attendus.
 *
 * ⚠️ La transaction appelante doit avoir déclaré l'**administration Groupe** :
 * `groupes_ad` est une table de configuration, son écriture y est réservée
 * depuis la porte S1 (constat M-2, `004_rls.sql` §6). Sans cela, l'insertion
 * lève 42501 — bruyamment, et c'est voulu.
 */
export async function synchroniserGroupesAd(
  client: PoolClient,
  attendus: readonly GroupeAttendu[],
): Promise<BilanSynchronisation> {
  const { rows: profils } = await client.query<{ id: string; code: string }>(
    `select "id", "code" from "profils"`,
  );
  const idParCode = new Map(profils.map((p) => [p.code, p.id]));

  const { rows: existants } = await client.query<{ nom: string }>(
    `select "nom" from "groupes_ad"`,
  );
  const dejaLa = new Set(existants.map((g) => g.nom.toLowerCase()));

  const crees: string[] = [];
  const presents: string[] = [];

  for (const groupe of attendus) {
    if (dejaLa.has(groupe.nom.toLowerCase())) {
      presents.push(groupe.nom);
      continue;
    }
    const profilId = groupe.profilCode === null ? null : (idParCode.get(groupe.profilCode) ?? null);
    if (groupe.profilCode !== null && profilId === null) {
      // Un groupe qui désignerait un profil absent violerait `ck_groupes_ad_coherence`.
      // Le refus est explicite plutôt que laissé à la contrainte : le message dit quoi
      // faire, la contrainte dirait seulement que c'est faux.
      throw new Error(
        `Profil « ${groupe.profilCode} » absent de la table « profils » : le groupe ` +
          `${groupe.nom} ne peut pas être créé. Appliquer la migration 007 (socle des profils).`,
      );
    }

    await client.query(
      `insert into "groupes_ad"
              ("id", "nom", "perimetre", "filiale_id", "profil_id",
               "accorde_export", "accorde_admin", "description")
       values (f_generer_id('GAD'), $1, $2, $3, $4, $5, $6, $7)`,
      [
        groupe.nom,
        groupe.perimetre,
        groupe.filialeId,
        profilId,
        groupe.accordeExport,
        groupe.accordeAdmin,
        groupe.description,
      ],
    );
    crees.push(groupe.nom);
  }

  const attendusEnMinuscules = new Set(attendus.map((g) => g.nom.toLowerCase()));
  const inattendus = existants
    .map((g) => g.nom)
    .filter((nom) => !attendusEnMinuscules.has(nom.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'fr'));

  return { crees, presents, inattendus };
}

/** Lit les filiales actives, dans la forme qu'attend `groupesAttendus`. */
export async function lireFilialesActives(client: PoolClient): Promise<readonly FilialeConnue[]> {
  const { rows } = await client.query<{ id: string; code: string; raison_sociale: string }>(
    `select "id", "code", "raison_sociale" from "filiales" where "statut" = 'active' order by "code"`,
  );
  return rows.map((f) => ({ id: f.id, code: f.code, raisonSociale: f.raison_sociale }));
}

/** Lit les profils actifs, dans la forme qu'attend `groupesAttendus`. */
export async function lireProfilsActifs(client: PoolClient): Promise<readonly ProfilConnu[]> {
  const { rows } = await client.query<{ id: string; code: string; nom: string }>(
    `select "id", "code", "nom" from "profils" where "actif" order by "code"`,
  );
  return rows;
}
