/**
 * La traduction « appartenances de groupe → droits », et c'est le cœur du lot L3.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le point qui décide de tout : d'où vient l'autorité
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'annuaire rend des **noms de groupes**, c'est-à-dire des chaînes de
 * caractères venues du réseau. Elles n'accordent rien par elles-mêmes : elles
 * sont **cherchées** dans `groupes_ad`, une table du schéma dont l'écriture est
 * réservée à l'administration Groupe depuis la porte S1 (constat M-2). Un nom
 * qui ne s'y trouve pas, ou dont la ligne est inactive, n'accorde rien et est
 * **journalisé comme ignoré**.
 *
 * Dit autrement : le nom vient de l'AD, la **décision** vient du groupe. Un
 * administrateur AD qui inventerait `GRC-TLS-RSSI` sans que personne l'ait
 * enregistré côté application n'ouvre aucun accès. C'est la même règle que
 * partout ailleurs dans ce chantier — le périmètre vient du serveur.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Les trois formes de groupe, et ce que chacune accorde
 * ════════════════════════════════════════════════════════════════════════
 *
 * `groupes_ad.perimetre` (contrainte `ck_groupes_ad_coherence`, `001_socle.sql` §7) :
 *
 * | Forme | Exemple | Accorde |
 * |---|---|---|
 * | `filiale` | `GRC-TLS-RSSI` | la filiale nommée, et les domaines du profil |
 * | `groupe` | `GRC-GROUPE-DIRECTION` | **toutes** les filiales actives, et les domaines du profil |
 * | `transversal` | `GRC-EXPORT`, `GRC-ADMIN` | le droit d'export, ou l'administration |
 *
 * **`GRC-ADMIN` accorde le périmètre Groupe**, et c'est un arbitrage qu'il faut
 * écrire : la contrainte de schéma interdit à un groupe transversal de porter un
 * profil, si bien que `accorde_admin` doit dire à lui seul ce qu'il ouvre. Le
 * contrat de doublure (`CONVENTIONS.md` §25.3) est explicite — le compte `admin`
 * ne porte que `GRC-ADMIN` et « le profil Administration, et lui seul, pose le
 * drapeau Groupe ». Administrer l'application est par nature un acte de niveau
 * Groupe : il n'y a pas d'administrateur d'une seule filiale.
 *
 * Les domaines d'un administrateur viennent du profil de socle `ADMIN`
 * (migration `007` §6). S'il est absent ou inactif, la résolution **refuse**
 * plutôt que d'accorder tous les domaines par défaut : un socle incomplet est
 * une erreur d'exploitation, pas une permission.
 */

import type { PoolClient } from 'pg';

import { cumuler, estDomaine, estNiveau } from './modele.js';
import type { DomaineFonctionnelBase, DroitsResolus, NiveauDroit, PorteeSession } from './modele.js';

/** Le socle du modèle de droits manque en base. Exploitation, pas utilisateur. */
export class ErreurSocleDroits extends Error {
  public readonly nomErreur = 'ErreurSocleDroits';
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSocleDroits';
  }
}

/** Code du profil de socle attribué par un groupe `accorde_admin`. */
const CODE_PROFIL_ADMINISTRATION = 'ADMIN';

interface LigneGroupe {
  readonly nom: string;
  readonly perimetre: PorteeSession | 'transversal';
  readonly filiale_id: string | null;
  readonly profil_id: string | null;
  readonly accorde_export: boolean;
  readonly accorde_admin: boolean;
}

export interface OptionsResolution {
  /** Filiale préférée de l'utilisateur (`utilisateurs.filiale_defaut_id`). */
  readonly filialePreferee?: string | null;
}

/**
 * Résout les trois axes.
 *
 * `client` est une connexion **déjà dans une transaction** : la résolution lit
 * `groupes_ad`, `profils`, `profil_domaines` et `filiales`, dont la lecture est
 * ouverte par construction (`004_rls.sql` §6 — elles sont lues *pour* résoudre
 * les droits, donc avant que le périmètre existe).
 */
export async function resoudreDroits(
  client: PoolClient,
  groupesPresentes: readonly string[],
  options: OptionsResolution = {},
): Promise<DroitsResolus> {
  const normalises = [...new Set(groupesPresentes.map((g) => g.trim().toLowerCase()))].filter(
    (g) => g !== '',
  );

  const { rows: lignes } = await client.query<LigneGroupe>(
    `select "nom", "perimetre", "filiale_id", "profil_id", "accorde_export", "accorde_admin"
       from "groupes_ad"
      where "actif" and lower("nom") = any($1::text[])
      order by "nom"`,
    [normalises],
  );

  const reconnus = new Set(lignes.map((l) => l.nom.toLowerCase()));
  const groupesIgnores = groupesPresentes
    .filter((g) => !reconnus.has(g.trim().toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'fr'));

  const filiales = new Set<string>();
  const profils = new Set<string>();
  let porteeGroupe = false;
  let administrateur = false;
  let peutExporter = false;

  for (const ligne of lignes) {
    if (ligne.accorde_export) peutExporter = true;

    if (ligne.accorde_admin) {
      administrateur = true;
      // Voir l'entête : administrer l'application est de niveau Groupe.
      porteeGroupe = true;
      profils.add(await idDuProfilDAdministration(client));
      continue;
    }

    if (ligne.perimetre === 'filiale' && ligne.filiale_id !== null) filiales.add(ligne.filiale_id);
    if (ligne.perimetre === 'groupe') porteeGroupe = true;
    if (ligne.profil_id !== null) profils.add(ligne.profil_id);
  }

  if (porteeGroupe) {
    const { rows } = await client.query<{ id: string }>(
      `select "id" from "filiales" where "statut" = 'active' order by "code"`,
    );
    for (const ligne of rows) filiales.add(ligne.id);
  }

  const domaines = await lireDomaines(client, [...profils]);

  // Un profil dont AUCUN groupe ne donne de filiale n'ouvre rien : le périmètre est
  // le premier axe, et il n'a pas de valeur par défaut. C'est le cas du compte
  // `sans.groupe` du contrat §25.3, et celui d'un porteur de `GRC-EXPORT` seul —
  // qui aurait le droit d'exporter, mais rien à exporter.
  const listeFiliales = [...filiales].sort((a, b) => a.localeCompare(b, 'fr'));

  const portee: PorteeSession = porteeGroupe
    ? 'groupe'
    : listeFiliales.length > 1
      ? 'multi'
      : 'filiale';

  const preferee = options.filialePreferee ?? null;
  const filialeActive =
    preferee !== null && listeFiliales.includes(preferee) ? preferee : (listeFiliales[0] ?? null);

  return {
    portee,
    filiales: listeFiliales,
    filialeActive,
    administrateur,
    peutExporter,
    domaines,
    groupesReconnus: lignes.map((l) => l.nom),
    groupesIgnores,
  };
}

/** Le compte a-t-il un périmètre, donc un accès ? Le seul critère d'ouverture. */
export function ouvreUnAcces(droits: DroitsResolus): boolean {
  return droits.filiales.length > 0;
}

async function idDuProfilDAdministration(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `select "id" from "profils" where "code" = $1 and "actif"`,
    [CODE_PROFIL_ADMINISTRATION],
  );
  const ligne = rows[0];
  if (ligne === undefined) {
    throw new ErreurSocleDroits(
      `Le profil de socle « ${CODE_PROFIL_ADMINISTRATION} » est absent ou inactif : un groupe ` +
        "d'administration ne peut donc ouvrir aucun domaine. Refus, plutôt que d'accorder " +
        'les trente domaines par défaut. Voir la migration 007 §6.',
    );
  }
  return ligne.id;
}

async function lireDomaines(
  client: PoolClient,
  profils: readonly string[],
): Promise<ReadonlyMap<DomaineFonctionnelBase, NiveauDroit>> {
  const cumul = new Map<DomaineFonctionnelBase, NiveauDroit>();
  if (profils.length === 0) return cumul;

  const { rows } = await client.query<{ domaine: string; niveau: string }>(
    `select d."domaine", d."niveau"
       from "profil_domaines" d
       join "profils" p on p."id" = d."profil_id"
      where d."profil_id" = any($1::text[]) and p."actif"`,
    [[...profils]],
  );

  for (const ligne of rows) {
    // Défaut FERMÉ : une valeur que le vocabulaire ne connaît pas n'accorde rien.
    // Elle ne peut venir que d'une divergence entre la base et `modele.ts`, que le
    // banc éprouve — mais si elle survient, elle ne doit pas ouvrir un domaine.
    if (!estDomaine(ligne.domaine) || !estNiveau(ligne.niveau)) continue;
    if (ligne.niveau === 'aucun') {
      // « aucun » ferme EXPLICITEMENT un domaine — mais il ne retire pas ce qu'un
      // autre groupe accorde : le cumul est au plus favorable (`modele.ts`), et un
      // rang nul ne peut pas gagner. Le poser tout de même rend le domaine visible
      // en revue de droits, ce qui est sa raison d'être (001_socle.sql §4).
      cumul.set(ligne.domaine, cumul.get(ligne.domaine) ?? 'aucun');
      continue;
    }
    cumul.set(ligne.domaine, cumuler(cumul.get(ligne.domaine) ?? 'aucun', ligne.niveau));
  }

  return cumul;
}
