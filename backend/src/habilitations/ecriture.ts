/**
 * `src/habilitations/ecriture.ts` — **modifier le modèle de droits, sans jamais
 * pouvoir le refermer sur soi.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  🛑 LE VERROU D'ADMINISTRABILITÉ — à lire avant de toucher à ce fichier
 * ════════════════════════════════════════════════════════════════════════
 *
 * Toute écriture de ce module passe par `verifierAdministrabilite()`, **dans la
 * même transaction**, et la transaction est annulée si la propriété est perdue :
 *
 *     il reste au moins un profil ACTIF portant `droits` en `administration`,
 *     ET au moins un groupe d'annuaire ACTIF qui accorde l'administration.
 *
 * Sans ce verrou, un administrateur peut se retirer l'administration en trois
 * clics — désactiver le profil ADMIN, fermer son domaine `droits`, ou
 * désactiver `GRC-ADMIN` — et **plus personne au monde ne peut rouvrir le
 * produit** : les droits viennent de l'annuaire, l'annuaire est lu à travers
 * `groupes_ad`, et `groupes_ad` n'est écrivable que par l'administration. Le
 * seul recours serait le compte de secours, quand il est configuré, et un accès
 * `psql`. C'est exactement la classe de défaut que ce projet appelle *« le
 * produit détruit le travail de son utilisateur »* — sauf qu'ici il se détruit
 * lui-même.
 *
 * ⚠️ **Le verrou MESURE, il ne reconnaît pas un nom.** La tentation était
 * d'interdire de toucher au profil dont le code est `ADMIN` et au groupe nommé
 * `GRC-ADMIN`. C'eût été la faute des constats **Q-312** et **Q-313** : un
 * déploiement peut parfaitement administrer par un profil `SECU_GLOBALE` et un
 * groupe `SEC-ADMINISTRATEURS`, et le garde n'aurait rien vu. Ce qui est
 * mesuré est donc la PROPRIÉTÉ — « quelqu'un peut-il encore administrer ? » —
 * et non les deux noms qui la portent aujourd'hui.
 *
 * ── CE QUE CE FICHIER N'ÉCRIT PAS, ET NE POURRA JAMAIS ÉCRIRE ───────────────
 *
 * **L'Active Directory.** Arbitrage de l'utilisateur, 22/09/2026 : *« on
 * n'écrit jamais sur l'AD depuis ce logiciel »*. Le produit lit l'annuaire, le
 * compare à ce qu'il attend, et **rend la commande à exécuter** — jamais plus.
 * C'est la même discipline qu'à l'action 20.2 (le produit prépare une
 * déclaration, l'humain l'envoie) et qu'au lot L21 (le questionnaire s'exporte,
 * le produit n'envoie rien). Elle a ici une raison de plus : aucun
 * administrateur d'annuaire n'accordera un droit d'écriture à un outil de GRC,
 * et le lui demander ferait échouer le déploiement sur un détail.
 */

import type { PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import type { PerimetreSession } from '../db/pool.js';
import { estDomaine, estNiveau } from '../droits/modele.js';
import type { NiveauDroit } from '../droits/modele.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';
import { engendrerIdentifiant, verifierIdentifiant } from '../entites/index.js';

/** Format imposé par `ck_profils_code` — repris ici pour rendre 400 et non 500. */
const FORME_CODE = /^[A-Z0-9_]{2,20}$/;

/* =====================================================================
 *  Le verrou d'administrabilité
 * ===================================================================== */

/**
 * Mesure si le produit est administrable : au moins un profil ACTIF portant
 * `droits` en `administration`, ET au moins un groupe d'annuaire ACTIF qui
 * accorde l'administration.
 */
export async function mesurerAdministrabilite(
  client: PoolClient,
): Promise<{ readonly profils: number; readonly groupes: number; readonly intacte: boolean }> {
  const { rows } = await client.query<{ profils: string; groupes: string }>(
    `select (select count(*)
               from "profil_domaines" d
               join "profils" p on p."id" = d."profil_id"
              where p."actif" and d."domaine" = 'droits'
                and d."niveau" = 'administration')::text as profils,
            (select count(*) from "groupes_ad"
              where "actif" and "accorde_admin")::text as groupes`,
  );
  const profils = Number(rows[0]?.profils ?? '0');
  const groupes = Number(rows[0]?.groupes ?? '0');
  return { profils, groupes, intacte: profils > 0 && groupes > 0 };
}

/**
 * Refuse une écriture qui **ferait perdre** l'administrabilité.
 *
 * ⚠️ **« Ferait perdre », et non « laisserait absente » — la nuance a été
 * trouvée par le banc, et elle est la différence entre un garde-fou et un
 * piège.** La première rédaction refusait toute écriture dès que la propriété
 * n'était pas vérifiée **à l'arrivée**, sans regarder le départ. Mesuré : sur
 * une base dont `groupes_ad` est vide — une base neuve, avant que
 * l'installateur ne sème les groupes —, **plus aucune écriture n'était
 * possible**, y compris celle qui aurait déclaré le groupe d'administration
 * manquant. Le garde-fou interdisait exactement le geste qui l'aurait satisfait.
 *
 * La propriété correcte est donc **différentielle** : si l'administrabilité
 * était déjà perdue au début de la transaction, l'écriture passe — elle ne peut
 * qu'améliorer la situation ou la laisser telle quelle. Si elle était intacte,
 * elle doit l'être encore.
 *
 * Appelée **après** l'écriture et **avant** le `commit` : c'est la seule
 * position qui mesure l'état d'arrivée. `avant` est mesuré au début de
 * l'opération, par l'appelant.
 */
export async function verifierAdministrabilite(
  client: PoolClient,
  avant: { readonly intacte: boolean },
): Promise<void> {
  const apres = await mesurerAdministrabilite(client);
  if (apres.intacte) return;
  // Elle était DÉJÀ perdue : cette écriture n'en est pas la cause, et la
  // refuser rendrait la situation irréparable depuis le produit.
  if (!avant.intacte) return;

  const profils = apres.profils;
  const groupes = apres.groupes;

  const manque =
    profils === 0 && groupes === 0
      ? 'plus aucun profil actif n’administre les habilitations, et plus aucun groupe ' +
        'd’annuaire actif n’accorde l’administration'
      : profils === 0
        ? 'plus aucun profil actif ne porte le domaine « Habilitations » au niveau ' +
          '« administration »'
        : 'plus aucun groupe d’annuaire actif n’accorde l’administration';

  throw new ErreurApplicative({
    code: 'contrainte_base',
    statut: 409,
    message:
      `Cette modification est refusée : ${manque}. Le produit deviendrait impossible à ` +
      'administrer — les droits viennent de l’annuaire, et seule l’administration peut ' +
      'écrire la correspondance qui les résout. Gardez au moins un profil administrateur ' +
      'actif et un groupe d’annuaire qui l’accorde.',
    detailJournal: `verrou d'administrabilité : profils=${profils}, groupes=${groupes}`,
    codeGrc: 'GRC08',
  });
}

/* =====================================================================
 *  Les profils
 * ===================================================================== */

export interface ProfilEntrant {
  readonly code?: unknown;
  readonly nom?: unknown;
  readonly description?: unknown;
  readonly niveauDefaut?: unknown;
  readonly actif?: unknown;
  readonly version?: unknown;
}

function texte(valeur: unknown, champ: string, max: number, obligatoire: boolean): string | null {
  if (valeur === undefined || valeur === null) {
    if (obligatoire) throw entreeInvalide(`Le champ « ${champ} » est obligatoire.`);
    return null;
  }
  if (typeof valeur !== 'string') throw entreeInvalide(`Le champ « ${champ} » doit être du texte.`);
  const net = valeur.trim();
  if (net === '') {
    if (obligatoire) throw entreeInvalide(`Le champ « ${champ} » ne peut pas être vide.`);
    return null;
  }
  if (net.length > max) {
    throw entreeInvalide(`Le champ « ${champ} » dépasse ${max} caractères.`);
  }
  return net;
}

function niveau(valeur: unknown, champ: string): NiveauDroit {
  if (typeof valeur !== 'string' || !estNiveau(valeur)) {
    throw entreeInvalide(
      `Le champ « ${champ} » doit être l’un des cinq niveaux : aucun, lecture, ` +
        'contribution, validation, administration.',
    );
  }
  return valeur;
}

export async function creerProfil(
  client: PoolClient,
  corps: ProfilEntrant,
  perimetre: PerimetreSession,
): Promise<{ readonly id: string }> {
  const code = texte(corps.code, 'code', 20, true) as string;
  if (!FORME_CODE.test(code)) {
    throw entreeInvalide(
      'Le code d’un profil s’écrit en majuscules, chiffres et tirets bas, de 2 à 20 ' +
        'caractères (exemple : RSSI_SITE). C’est le suffixe du groupe d’annuaire, et la ' +
        'convention de nommage doit rester vérifiable.',
    );
  }
  const nom = texte(corps.nom, 'nom', 200, true) as string;
  const description = texte(corps.description, 'description', 2_000, false);
  const niveauDefaut = niveau(corps.niveauDefaut ?? 'lecture', 'niveauDefaut');

  const avant = await mesurerAdministrabilite(client);

  const deja = await client.query(`select 1 from "profils" where "code" = $1`, [code]);
  if (deja.rowCount !== null && deja.rowCount > 0) {
    throw entreeInvalide(`Un profil portant le code « ${code} » existe déjà.`);
  }

  const id = engendrerIdentifiant('PROF');
  verifierIdentifiant(id);
  // ⚠️ `socle` vaut TOUJOURS `false` ici, et ce n'est pas négociable : `socle`
  //    marque ce que le PRODUIT livre, pas ce qu'un déploiement crée. Le laisser
  //    au choix de l'appelant effacerait la frontière socle / spécifique du
  //    `PLAN_SERVEUR` §0.5, qui est ce qui rend une montée de version lisible.
  await client.query(
    `insert into "profils" ("id", "code", "nom", "description", "niveau_defaut",
                            "socle", "actif")
     values ($1, $2, $3, $4, $5, false, true)`,
    [id, code, nom, description, niveauDefaut],
  );

  await journaliser(client, {
    action: 'administration',
    resume: `Création du profil d’habilitation « ${code} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'profils',
    entiteId: id,
    valeursApres: { code, nom, niveau_defaut: niveauDefaut, socle: false, actif: true },
  });

  await verifierAdministrabilite(client, avant);
  return { id };
}

export async function modifierProfil(
  client: PoolClient,
  id: string,
  corps: ProfilEntrant,
  perimetre: PerimetreSession,
): Promise<void> {
  const administrabilite = await mesurerAdministrabilite(client);
  const avant = await lireProfil(client, id);

  const nom = texte(corps.nom, 'nom', 200, true) as string;
  const description = texte(corps.description, 'description', 2_000, false);
  const niveauDefaut = niveau(corps.niveauDefaut ?? avant.niveau_defaut, 'niveauDefaut');
  const actif = corps.actif === undefined ? avant.actif : corps.actif === true;

  // Verrouillage optimiste, comme toute entité du produit (risque P1).
  const version = Number(corps.version);
  if (!Number.isInteger(version)) {
    throw entreeInvalide('La version attendue de l’enregistrement est absente ou invalide.');
  }
  const maj = await client.query(
    `update "profils"
        set "nom" = $1, "description" = $2, "niveau_defaut" = $3, "actif" = $4,
            "version" = "version" + 1
      where "id" = $5 and "version" = $6`,
    [nom, description, niveauDefaut, actif, id, version],
  );
  if (maj.rowCount === 0) {
    throw new ErreurApplicative({
      code: 'conflit_version',
      statut: 409,
      message:
        'Ce profil a été modifié par quelqu’un d’autre depuis son affichage. Rechargez ' +
        'l’écran pour voir l’état courant, puis refaites votre modification.',
      codeGrc: 'GRC03',
      entite: 'profils',
      identifiant: id,
      versionActuelle: Number(avant.version),
    });
  }

  await journaliser(client, {
    action: 'administration',
    resume: `Modification du profil d’habilitation « ${avant.code} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'profils',
    entiteId: id,
    valeursAvant: {
      nom: avant.nom,
      description: avant.description,
      niveau_defaut: avant.niveau_defaut,
      actif: avant.actif,
    },
    valeursApres: { nom, description, niveau_defaut: niveauDefaut, actif },
  });

  await verifierAdministrabilite(client, administrabilite);
}

/**
 * Remplace la grille de domaines d'un profil, en entier.
 *
 * ⚠️ **Un remplacement, jamais une fusion.** Une écriture partielle — « pose ce
 * domaine à contribution » — obligerait l'écran à connaître l'état d'arrivée
 * pour savoir ce qu'il n'a pas envoyé, et un domaine RETIRÉ ne se distinguerait
 * pas d'un domaine omis. Le défaut n'est pas théorique : c'est le motif du
 * champ facultatif qu'on n'émet que « quand on peut » (constat Q-66).
 *
 * ⚠️ Et le niveau `aucun` est CONSERVÉ tel quel, jamais transformé en absence :
 * il ferme un domaine **explicitement**, ce qui se relit en revue de droits là
 * où une absence ne se relit pas (`001_socle.sql` §4).
 */
export async function poserGrille(
  client: PoolClient,
  id: string,
  grilleEntrante: unknown,
  perimetre: PerimetreSession,
): Promise<void> {
  const administrabilite = await mesurerAdministrabilite(client);
  const avant = await lireProfil(client, id);

  if (grilleEntrante === null || typeof grilleEntrante !== 'object' || Array.isArray(grilleEntrante)) {
    throw entreeInvalide('La grille de domaines doit être un objet { domaine: niveau }.');
  }
  const grille = new Map<string, NiveauDroit>();
  for (const [domaine, valeur] of Object.entries(grilleEntrante as Record<string, unknown>)) {
    if (!estDomaine(domaine)) {
      throw entreeInvalide(`Le domaine « ${domaine} » n’existe pas dans le modèle de droits.`);
    }
    grille.set(domaine, niveau(valeur, domaine));
  }

  const ancienne = await client.query<{ domaine: string; niveau: string }>(
    `select "domaine", "niveau" from "profil_domaines" where "profil_id" = $1`,
    [id],
  );

  await client.query(`delete from "profil_domaines" where "profil_id" = $1`, [id]);
  if (grille.size > 0) {
    await client.query(
      `insert into "profil_domaines" ("profil_id", "domaine", "niveau")
       select $1, d, n from unnest($2::text[], $3::text[]) as t(d, n)`,
      [id, [...grille.keys()], [...grille.values()]],
    );
  }

  await journaliser(client, {
    action: 'administration',
    resume: `Grille de domaines du profil « ${avant.code} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'profils',
    entiteId: id,
    valeursAvant: Object.fromEntries(ancienne.rows.map((l) => [l.domaine, l.niveau])),
    valeursApres: Object.fromEntries(grille),
  });

  await verifierAdministrabilite(client, administrabilite);
}

export async function supprimerProfil(
  client: PoolClient,
  id: string,
  perimetre: PerimetreSession,
): Promise<void> {
  const administrabilite = await mesurerAdministrabilite(client);
  const avant = await lireProfil(client, id);

  // ⚠️ `socle` est **non supprimable** — c'est le commentaire de la colonne, et
  //    c'est ce qui garantit qu'une montée de version du produit retrouve ses
  //    profils. Il reste MODIFIABLE : un client ajuste légitimement ce que son
  //    RSSI voit, et le lui interdire l'obligerait à cloner huit profils.
  if (avant.socle) {
    throw entreeInvalide(
      `Le profil « ${avant.code} » est livré avec le produit : il ne se supprime pas. ` +
        'Vous pouvez le désactiver — ce qui conserve la trace de ce qu’il accordait — ou ' +
        'modifier sa grille de domaines.',
    );
  }

  // Un profil encore attribué par un groupe d'annuaire ne se supprime pas :
  // la clé étrangère de `groupes_ad` est en `restrict`, et le message du
  // 23503 nu ne dirait à personne QUELS groupes sont en cause.
  const porteurs = await client.query<{ nom: string }>(
    `select "nom" from "groupes_ad" where "profil_id" = $1 order by "nom" limit 20`,
    [id],
  );
  if (porteurs.rows.length > 0) {
    throw entreeInvalide(
      `Le profil « ${avant.code} » est encore attribué par ${porteurs.rows.length} groupe(s) ` +
        `d’annuaire : ${porteurs.rows.map((g) => g.nom).join(', ')}. Détachez-les d’abord — ` +
        'supprimer le profil retirerait leurs droits à leurs membres sans que personne ' +
        'l’ait décidé.',
    );
  }

  await client.query(`delete from "profils" where "id" = $1`, [id]);

  await journaliser(client, {
    action: 'administration',
    resume: `Suppression du profil d’habilitation « ${avant.code} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'profils',
    entiteId: id,
    valeursAvant: { code: avant.code, nom: avant.nom, niveau_defaut: avant.niveau_defaut },
  });

  await verifierAdministrabilite(client, administrabilite);
}

interface LigneProfilBrute {
  readonly id: string;
  readonly code: string;
  readonly nom: string;
  readonly description: string | null;
  readonly niveau_defaut: NiveauDroit;
  readonly socle: boolean;
  readonly actif: boolean;
  readonly version: number;
}

async function lireProfil(client: PoolClient, id: string): Promise<LigneProfilBrute> {
  const { rows } = await client.query<LigneProfilBrute>(
    `select "id", "code", "nom", "description", "niveau_defaut", "socle", "actif", "version"
       from "profils" where "id" = $1`,
    [id],
  );
  const ligne = rows[0];
  if (ligne === undefined) {
    throw new ErreurApplicative({
      code: 'ressource_inconnue',
      statut: 404,
      message: 'Ce profil d’habilitation n’existe pas.',
    });
  }
  return ligne;
}

/* =====================================================================
 *  Les groupes d'annuaire
 * ===================================================================== */

export interface GroupeEntrant {
  readonly nom?: unknown;
  readonly perimetre?: unknown;
  readonly filialeId?: unknown;
  readonly profilId?: unknown;
  readonly accordeExport?: unknown;
  readonly accordeAdmin?: unknown;
  readonly description?: unknown;
  readonly actif?: unknown;
  readonly version?: unknown;
}

const PORTEES = new Set(['filiale', 'groupe', 'transversal']);

export async function creerGroupe(
  client: PoolClient,
  corps: GroupeEntrant,
  perimetre: PerimetreSession,
): Promise<{ readonly id: string }> {
  const nom = texte(corps.nom, 'nom', 256, true) as string;
  const portee = String(corps.perimetre ?? '');
  if (!PORTEES.has(portee)) {
    throw entreeInvalide('Le périmètre d’un groupe vaut « filiale », « groupe » ou « transversal ».');
  }
  const filialeId = texte(corps.filialeId, 'filialeId', 64, false);
  const profilId = texte(corps.profilId, 'profilId', 64, false);
  const accordeExport = corps.accordeExport === true;
  const accordeAdmin = corps.accordeAdmin === true;
  const description = texte(corps.description, 'description', 2_000, false);

  // La cohérence des trois formes est tenue par `ck_groupes_ad_coherence`. On la
  // rejoue ici pour rendre un message, pas une violation de contrainte : ce que
  // PostgreSQL dirait — « new row violates check constraint » — n'apprend rien à
  // l'administrateur qui remplit le formulaire.
  if (portee === 'filiale' && (filialeId === null || profilId === null)) {
    throw entreeInvalide('Un groupe de périmètre « filiale » doit nommer sa filiale ET son profil.');
  }
  if (portee === 'groupe' && (filialeId !== null || profilId === null)) {
    throw entreeInvalide(
      'Un groupe de périmètre « groupe » porte un profil et AUCUNE filiale : il ouvre ' +
        'le Groupe entier.',
    );
  }
  if (portee === 'transversal' && (filialeId !== null || profilId !== null || (!accordeExport && !accordeAdmin))) {
    throw entreeInvalide(
      'Un groupe transversal n’a ni filiale ni profil, et accorde l’export ou ' +
        'l’administration — sinon il n’accorde rien.',
    );
  }

  const administrabilite = await mesurerAdministrabilite(client);

  const deja = await client.query(`select 1 from "groupes_ad" where lower("nom") = lower($1)`, [nom]);
  if (deja.rowCount !== null && deja.rowCount > 0) {
    throw entreeInvalide(`Un groupe d’annuaire portant le nom « ${nom} » est déjà déclaré.`);
  }

  const id = engendrerIdentifiant('GRAD');
  verifierIdentifiant(id);
  await client.query(
    `insert into "groupes_ad" ("id", "nom", "perimetre", "filiale_id", "profil_id",
                               "accorde_export", "accorde_admin", "description", "actif")
     values ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
    [id, nom, portee, filialeId, profilId, accordeExport, accordeAdmin, description],
  );

  await journaliser(client, {
    action: 'administration',
    resume: `Déclaration du groupe d’annuaire « ${nom} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'groupes_ad',
    entiteId: id,
    valeursApres: {
      nom,
      perimetre: portee,
      filiale_id: filialeId,
      profil_id: profilId,
      accorde_export: accordeExport,
      accorde_admin: accordeAdmin,
    },
  });

  await verifierAdministrabilite(client, administrabilite);
  return { id };
}

/**
 * Modifie un groupe d'annuaire — ce qu'il ACCORDE, jamais ce qu'il EST.
 *
 * ⚠️ Le **nom** et le **périmètre** ne se modifient pas. Le nom est la clé qui
 * apparie la déclaration à l'annuaire réel : le changer sans changer l'AD
 * détacherait silencieusement tous ses membres. Le périmètre est lié au nom par
 * la convention `GRC-<FILIALE>-<PROFIL>` ; le changer seul produirait une ligne
 * dont le nom ment. Pour l'un ou l'autre : on déclare un nouveau groupe et on
 * désactive l'ancien, ce qui laisse une trace de ce qu'il accordait.
 */
export async function modifierGroupe(
  client: PoolClient,
  id: string,
  corps: GroupeEntrant,
  perimetre: PerimetreSession,
): Promise<void> {
  const { rows } = await client.query<{
    id: string;
    nom: string;
    perimetre: string;
    profil_id: string | null;
    accorde_export: boolean;
    accorde_admin: boolean;
    description: string | null;
    actif: boolean;
    version: number;
  }>(
    `select "id", "nom", "perimetre", "profil_id", "accorde_export", "accorde_admin",
            "description", "actif", "version"
       from "groupes_ad" where "id" = $1`,
    [id],
  );
  const avant = rows[0];
  if (avant === undefined) {
    throw new ErreurApplicative({
      code: 'ressource_inconnue',
      statut: 404,
      message: 'Ce groupe d’annuaire n’est pas déclaré dans l’application.',
    });
  }
  const administrabilite = await mesurerAdministrabilite(client);

  const profilId =
    avant.perimetre === 'transversal'
      ? null
      : (texte(corps.profilId, 'profilId', 64, false) ?? avant.profil_id);
  if (avant.perimetre !== 'transversal' && profilId === null) {
    throw entreeInvalide('Un groupe de périmètre « filiale » ou « groupe » doit porter un profil.');
  }
  const description = texte(corps.description, 'description', 2_000, false);
  const actif = corps.actif === undefined ? avant.actif : corps.actif === true;
  const accordeExport =
    avant.perimetre === 'transversal' && corps.accordeExport !== undefined
      ? corps.accordeExport === true
      : avant.accorde_export;
  const accordeAdmin =
    avant.perimetre === 'transversal' && corps.accordeAdmin !== undefined
      ? corps.accordeAdmin === true
      : avant.accorde_admin;
  if (avant.perimetre === 'transversal' && !accordeExport && !accordeAdmin) {
    throw entreeInvalide(
      'Un groupe transversal qui n’accorde ni l’export ni l’administration n’accorde ' +
        'rien : désactivez-le plutôt que de le vider.',
    );
  }

  const version = Number(corps.version);
  if (!Number.isInteger(version)) {
    throw entreeInvalide('La version attendue de l’enregistrement est absente ou invalide.');
  }
  const maj = await client.query(
    `update "groupes_ad"
        set "profil_id" = $1, "description" = $2, "actif" = $3,
            "accorde_export" = $4, "accorde_admin" = $5, "version" = "version" + 1
      where "id" = $6 and "version" = $7`,
    [profilId, description, actif, accordeExport, accordeAdmin, id, version],
  );
  if (maj.rowCount === 0) {
    throw new ErreurApplicative({
      code: 'conflit_version',
      statut: 409,
      message:
        'Ce groupe d’annuaire a été modifié par quelqu’un d’autre depuis son affichage. ' +
        'Rechargez l’écran, puis refaites votre modification.',
      codeGrc: 'GRC03',
      entite: 'groupes_ad',
      identifiant: id,
      versionActuelle: Number(avant.version),
    });
  }

  await journaliser(client, {
    action: 'administration',
    resume: `Modification du groupe d’annuaire « ${avant.nom} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'groupes_ad',
    entiteId: id,
    valeursAvant: {
      profil_id: avant.profil_id,
      actif: avant.actif,
      accorde_export: avant.accorde_export,
      accorde_admin: avant.accorde_admin,
    },
    valeursApres: {
      profil_id: profilId,
      actif,
      accorde_export: accordeExport,
      accorde_admin: accordeAdmin,
    },
  });

  await verifierAdministrabilite(client, administrabilite);
}
