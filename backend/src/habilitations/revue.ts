/**
 * `src/habilitations/revue.ts` — **la revue périodique des droits d'accès.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce qui distingue cet écran d'un panneau d'administration
 * ════════════════════════════════════════════════════════════════════════
 *
 * L'ISO 27001 exige, au titre de l'**A.5.18**, que les droits d'accès soient
 * revus à intervalles réguliers ; NIS2 attend le même geste. C'est la question
 * qu'un auditeur pose juste après avoir vu la matrice :
 *
 *     « Montrez-moi la dernière revue. Qui l'a faite, quand, sur quoi,
 *       et qu'en a-t-on conclu ? »
 *
 * Sans cela, le produit détient la donnée et ne sait pas produire la pièce.
 *
 * ── LA LECTURE À L'ENVERS ───────────────────────────────────────────────────
 *
 * Tout le produit interroge l'annuaire **depuis une personne** : « à quels
 * groupes appartient-elle ? ». Une revue pose la question **inverse** : « qui
 * appartient à ce groupe ? ». Aucune réponse ne se déduit de l'autre, et le
 * produit n'en gardait aucune — il ne stocke pas les appartenances, il les
 * RÉSOUT à chaque connexion. `ServiceAnnuaire.membresDuGroupe()` a été écrite
 * pour ce lot, en lecture seule, et elle suit les imbrications.
 *
 * ── ⚠️ L'INSTANTANÉ EST FIGÉ ────────────────────────────────────────────────
 *
 * Une ligne garde le login, le nom et le groupe **tels qu'ils étaient à
 * l'ouverture**. Les relire à l'affichage rendrait la revue inutilisable en
 * audit : on ne saurait plus ce qui a été revu, seulement ce qui existe
 * aujourd'hui. *Ce qui sert de preuve ne se recalcule pas* — même raisonnement
 * que l'empreinte d'une approbation (lot L8) et que la main courante (20.5).
 *
 * ── 🛑 ET LE PRODUIT N'EXÉCUTE PAS SES PROPRES CONCLUSIONS ──────────────────
 *
 * La décision « à retirer » est consignée, datée, attribuée — et **exécutée par
 * l'administrateur de l'annuaire**. Outre que le produit n'a aucune capacité
 * d'écriture LDAP, c'est le principe même de l'exercice : quelqu'un décide,
 * quelqu'un d'autre applique. Une revue qui exécuterait ses conclusions serait
 * une revue sans contrôle.
 */

import type { PoolClient } from 'pg';

import { journaliser } from '../auth/journal.js';
import type { PerimetreSession } from '../db/pool.js';
import { engendrerIdentifiant, verifierIdentifiant } from '../entites/index.js';
import { entreeInvalide, ErreurApplicative } from '../erreurs/index.js';

/** Plafond de lignes d'une revue. Vingt filiales × neuf profils × N membres. */
export const LIGNES_MAX = 5_000;
/** Plafond de revues rendues à l'écran. */
export const REVUES_MAX = 100;

export type Decision = 'a_examiner' | 'maintenu' | 'a_retirer' | 'a_verifier';
const DECISIONS = new Set<Decision>(['a_examiner', 'maintenu', 'a_retirer', 'a_verifier']);

/** Ce qu'un balayage de l'annuaire a rapporté, groupe par groupe. */
export interface MembresParGroupe {
  readonly groupe: string;
  readonly perimetre: string;
  readonly profilCode: string | null;
  readonly membres: readonly {
    readonly login: string;
    readonly nom: string;
    readonly desactive: boolean;
    readonly indirect: boolean;
  }[];
  /** Le groupe est-il introuvable dans l'annuaire ? C'est un CONSTAT de la revue. */
  readonly absentDeLAnnuaire: boolean;
  readonly tronque: boolean;
}

export interface LigneRevue {
  readonly id: string;
  readonly groupeNom: string;
  readonly compteLogin: string;
  readonly compteNom: string;
  readonly compteDesactive: boolean;
  readonly indirect: boolean;
  readonly profilCode: string | null;
  readonly perimetreGroupe: string;
  readonly decision: Decision;
  readonly decidePar: string | null;
  readonly decideLe: string | null;
  readonly commentaire: string | null;
  readonly version: number;
}

export interface RevueDecrite {
  readonly id: string;
  readonly intitule: string;
  readonly perimetre: string;
  readonly ouverteLe: string;
  readonleParOuverture?: never;
  readonly ouvertePar: string;
  readonly closeLe: string | null;
  readonly closePar: string | null;
  readonly conclusion: string | null;
  readonly prochaineLe: string | null;
  readonly balayageTronque: boolean;
  readonly version: number;
  readonly comptes: {
    readonly total: number;
    readonly aExaminer: number;
    readonly maintenu: number;
    readonly aRetirer: number;
    readonly aVerifier: number;
    /** Comptes désactivés dans l'annuaire mais encore membres. L'anomalie n°1. */
    readonly desactives: number;
    /** Accès obtenus par imbrication : ce qu'une revue manuelle oublie. */
    readonly indirects: number;
  };
  readonly lignes: readonly LigneRevue[];
}

/* =====================================================================
 *  Ouvrir une revue : figer l'instantané
 * ===================================================================== */

export async function ouvrirRevue(
  client: PoolClient,
  intitule: string,
  perimetreTexte: string,
  balayage: readonly MembresParGroupe[],
  prochaineLe: string | null,
  perimetre: PerimetreSession,
): Promise<{ readonly id: string; readonly lignes: number; readonly tronque: boolean }> {
  const id = engendrerIdentifiant('REVH');
  verifierIdentifiant(id);

  const tronque = balayage.some((g) => g.tronque);

  await client.query(
    `insert into "revues_habilitations"
            ("id", "intitule", "perimetre", "prochaine_le", "balayage_tronque")
     values ($1, $2, $3, $4, $5)`,
    [id, intitule, perimetreTexte, prochaineLe, tronque],
  );

  const lignes: {
    id: string;
    groupe: string;
    login: string;
    nom: string;
    desactive: boolean;
    indirect: boolean;
    profil: string | null;
    portee: string;
  }[] = [];

  for (const groupe of balayage) {
    for (const membre of groupe.membres) {
      if (lignes.length >= LIGNES_MAX) break;
      const ligneId = engendrerIdentifiant('RHL');
      verifierIdentifiant(ligneId);
      lignes.push({
        id: ligneId,
        groupe: groupe.groupe,
        login: membre.login,
        nom: membre.nom,
        desactive: membre.desactive,
        indirect: membre.indirect,
        profil: groupe.profilCode,
        portee: groupe.perimetre,
      });
    }
  }

  if (lignes.length > 0) {
    await client.query(
      `insert into "revue_habilitation_lignes"
              ("id", "revue_id", "groupe_nom", "compte_login", "compte_nom",
               "compte_desactive", "indirect", "profil_code", "perimetre_groupe")
       select t.id, $1, t.groupe, t.login, t.nom, t.desactive, t.indirect, t.profil, t.portee
         from unnest($2::text[], $3::text[], $4::text[], $5::text[],
                     $6::boolean[], $7::boolean[], $8::text[], $9::text[])
              as t(id, groupe, login, nom, desactive, indirect, profil, portee)`,
      [
        id,
        lignes.map((l) => l.id),
        lignes.map((l) => l.groupe),
        lignes.map((l) => l.login),
        lignes.map((l) => l.nom),
        lignes.map((l) => l.desactive),
        lignes.map((l) => l.indirect),
        lignes.map((l) => l.profil),
        lignes.map((l) => l.portee),
      ],
    );
  }

  await journaliser(client, {
    action: 'administration',
    resume: `Ouverture d’une revue des habilitations : « ${intitule} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'revues_habilitations',
    entiteId: id,
    valeursApres: {
      intitule,
      perimetre: perimetreTexte,
      groupes: balayage.length,
      lignes: lignes.length,
      balayage_tronque: tronque,
    },
  });

  return { id, lignes: lignes.length, tronque };
}

/* =====================================================================
 *  Décider d'une ligne
 * ===================================================================== */

export async function deciderLigne(
  client: PoolClient,
  ligneId: string,
  decision: unknown,
  commentaire: unknown,
  version: unknown,
  perimetre: PerimetreSession,
): Promise<void> {
  if (typeof decision !== 'string' || !DECISIONS.has(decision as Decision)) {
    throw entreeInvalide(
      'La décision vaut « a_examiner », « maintenu », « a_retirer » ou « a_verifier ».',
    );
  }
  const motif =
    typeof commentaire === 'string' && commentaire.trim() !== '' ? commentaire.trim() : null;

  /* ⚠️ Le motif est exigé par le SCHÉMA (`ck_revue_hab_motif`). On rejoue la
   * règle ici pour rendre un 400 qui explique, et non une violation de
   * contrainte : « new row violates check constraint » n'apprend rien à qui
   * remplit le formulaire. La barrière, elle, reste celle de la base. */
  if ((decision === 'a_retirer' || decision === 'a_verifier') && motif === null) {
    throw entreeInvalide(
      'Un retrait ou une vérification demande un motif : c’est lui qu’on relira dans six ' +
        'mois, quand personne ne se souviendra du contexte.',
    );
  }

  const v = Number(version);
  if (!Number.isInteger(v)) {
    throw entreeInvalide('La version attendue de la ligne est absente ou invalide.');
  }

  const courante = await client.query<{ revue_id: string; decision: string; version: number }>(
    `select "revue_id", "decision", "version" from "revue_habilitation_lignes" where "id" = $1`,
    [ligneId],
  );
  const avant = courante.rows[0];
  if (avant === undefined) {
    throw new ErreurApplicative({
      code: 'ressource_inconnue',
      statut: 404,
      message: 'Cette ligne de revue n’existe pas.',
    });
  }

  /* 🛑 **Une revue CLOSE ne se modifie plus.** C'est ce qui lui donne sa valeur
   * probante : une pièce qu'on peut retoucher après coup n'atteste de rien.
   * La base ne le tient pas — la contrainte porterait sur deux tables —, et
   * c'est donc ici, avec sa mesure. */
  const revue = await client.query<{ close_le: string | null; intitule: string }>(
    `select "close_le", "intitule" from "revues_habilitations" where "id" = $1`,
    [avant.revue_id],
  );
  if (revue.rows[0]?.close_le != null) {
    throw new ErreurApplicative({
      code: 'contrainte_base',
      statut: 409,
      message:
        'Cette revue est close : ses décisions ne se modifient plus. Une pièce qu’on peut ' +
        'retoucher après coup n’atteste de rien. Ouvrez une nouvelle revue.',
      codeGrc: 'GRC09',
    });
  }

  const signe = decision !== 'a_examiner';
  const maj = await client.query(
    `update "revue_habilitation_lignes"
        set "decision" = $1,
            "commentaire" = $2,
            "decide_par" = case when $3::boolean then $4 else null end,
            "decide_le"  = case when $3::boolean then now() else null end
      where "id" = $5 and "version" = $6`,
    [decision, motif, signe, perimetre.utilisateurId, ligneId, v],
  );
  if (maj.rowCount === 0) {
    throw new ErreurApplicative({
      code: 'conflit_version',
      statut: 409,
      message:
        'Cette ligne a été décidée par quelqu’un d’autre depuis son affichage. Rechargez ' +
        'la revue pour voir sa décision.',
      codeGrc: 'GRC03',
      entite: 'revue_habilitation_lignes',
      identifiant: ligneId,
      versionActuelle: Number(avant.version),
    });
  }
}

/* =====================================================================
 *  Clore une revue
 * ===================================================================== */

export async function cloreRevue(
  client: PoolClient,
  id: string,
  conclusion: unknown,
  prochaineLe: unknown,
  version: unknown,
  perimetre: PerimetreSession,
): Promise<{ readonly restantes: number }> {
  const texte = typeof conclusion === 'string' ? conclusion.trim() : '';
  if (texte === '') {
    throw entreeInvalide(
      'Une revue se clôt avec une conclusion : sans elle, elle n’atteste que du fait ' +
        'd’avoir regardé.',
    );
  }
  const v = Number(version);
  if (!Number.isInteger(v)) {
    throw entreeInvalide('La version attendue de la revue est absente ou invalide.');
  }

  /* ⚠️ **On CLÔT une revue dont des lignes restent à examiner, et on le DIT.**
   *
   * L'interdire était la première rédaction, et c'était une faute : une revue
   * de quatre cents lignes dont douze restent en suspens serait alors
   * impossible à clore, donc laissée ouverte indéfiniment — et une revue jamais
   * close ne prouve rien du tout. Le produit consigne donc le RESTE, dans la
   * revue et dans le journal, et l'écran l'affiche. *Un chiffre qu'on voit vaut
   * mieux qu'un blocage qu'on contourne.*
   */
  const restantes = await client.query<{ n: string }>(
    `select count(*)::text as n from "revue_habilitation_lignes"
      where "revue_id" = $1 and "decision" = 'a_examiner'`,
    [id],
  );
  const reste = Number(restantes.rows[0]?.n ?? '0');

  const maj = await client.query<{ intitule: string }>(
    `update "revues_habilitations"
        set "close_le" = now(), "close_par" = $1, "conclusion" = $2,
            "prochaine_le" = coalesce($3, "prochaine_le"),
            "version" = "version" + 1
      where "id" = $4 and "version" = $5 and "close_le" is null
      returning "intitule"`,
    [perimetre.utilisateurId, texte, prochaineLe ?? null, id, v],
  );
  if (maj.rowCount === 0) {
    throw new ErreurApplicative({
      code: 'conflit_version',
      statut: 409,
      message:
        'Cette revue a déjà été close, ou modifiée depuis son affichage. Rechargez ' +
        'l’écran.',
      codeGrc: 'GRC03',
      entite: 'revues_habilitations',
      identifiant: id,
    });
  }

  await journaliser(client, {
    action: 'administration',
    resume: `Clôture de la revue des habilitations « ${maj.rows[0]?.intitule ?? id} »`,
    filialeId: perimetre.filialeId,
    utilisateurLibelle: perimetre.utilisateurId,
    entiteType: 'revues_habilitations',
    entiteId: id,
    valeursApres: { conclusion: texte, lignes_non_examinees: reste },
  });

  return { restantes: reste };
}

/* =====================================================================
 *  Lire
 * ===================================================================== */

export async function lireRevues(
  client: PoolClient,
  idDetaille: string | null,
): Promise<readonly RevueDecrite[]> {
  const revues = await client.query<{
    id: string;
    intitule: string;
    perimetre: string;
    ouverte_le: string;
    ouverte_par: string;
    close_le: string | null;
    close_par: string | null;
    conclusion: string | null;
    prochaine_le: string | null;
    balayage_tronque: boolean;
    version: number;
  }>(
    `select "id", "intitule", "perimetre",
            to_char("ouverte_le" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as ouverte_le,
            "ouverte_par",
            to_char("close_le"   at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as close_le,
            "close_par", "conclusion", "prochaine_le"::text as prochaine_le,
            "balayage_tronque", "version"
       from "revues_habilitations"
      order by "ouverte_le" desc
      limit $1`,
    [REVUES_MAX],
  );
  if (revues.rows.length === 0) return [];

  const comptes = await client.query<{
    revue_id: string;
    total: string;
    a_examiner: string;
    maintenu: string;
    a_retirer: string;
    a_verifier: string;
    desactives: string;
    indirects: string;
  }>(
    `select "revue_id",
            count(*)::text as total,
            count(*) filter (where "decision" = 'a_examiner')::text as a_examiner,
            count(*) filter (where "decision" = 'maintenu')::text    as maintenu,
            count(*) filter (where "decision" = 'a_retirer')::text   as a_retirer,
            count(*) filter (where "decision" = 'a_verifier')::text  as a_verifier,
            count(*) filter (where "compte_desactive")::text         as desactives,
            count(*) filter (where "indirect")::text                 as indirects
       from "revue_habilitation_lignes"
      where "revue_id" = any($1::text[])
      group by "revue_id"`,
    [revues.rows.map((r) => r.id)],
  );
  const parRevue = new Map(comptes.rows.map((c) => [c.revue_id, c]));

  // ⚠️ Les LIGNES ne sont rendues que pour la revue OUVERTE à l'écran. Les
  // rendre toutes servirait, pour dix revues de quatre cents lignes, le nom et
  // le login de quatre mille personnes à chaque affichage de la liste.
  let lignes: LigneRevue[] = [];
  if (idDetaille !== null) {
    const r = await client.query<{
      id: string;
      groupe_nom: string;
      compte_login: string;
      compte_nom: string;
      compte_desactive: boolean;
      indirect: boolean;
      profil_code: string | null;
      perimetre_groupe: string;
      decision: string;
      decide_par: string | null;
      decide_le: string | null;
      commentaire: string | null;
      version: number;
    }>(
      `select "id", "groupe_nom", "compte_login", "compte_nom", "compte_desactive",
              "indirect", "profil_code", "perimetre_groupe", "decision", "decide_par",
              to_char("decide_le" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decide_le,
              "commentaire", "version"
         from "revue_habilitation_lignes"
        where "revue_id" = $1
        order by "compte_desactive" desc, "decision", "groupe_nom", "compte_login"
        limit $2`,
      [idDetaille, LIGNES_MAX],
    );
    lignes = r.rows.map((l) => ({
      id: l.id,
      groupeNom: l.groupe_nom,
      compteLogin: l.compte_login,
      compteNom: l.compte_nom,
      compteDesactive: l.compte_desactive,
      indirect: l.indirect,
      profilCode: l.profil_code,
      perimetreGroupe: l.perimetre_groupe,
      decision: l.decision as Decision,
      decidePar: l.decide_par,
      decideLe: l.decide_le,
      commentaire: l.commentaire,
      version: Number(l.version),
    }));
  }

  return revues.rows.map((r) => {
    const c = parRevue.get(r.id);
    return Object.freeze({
      id: r.id,
      intitule: r.intitule,
      perimetre: r.perimetre,
      ouverteLe: r.ouverte_le,
      ouvertePar: r.ouverte_par,
      closeLe: r.close_le,
      closePar: r.close_par,
      conclusion: r.conclusion,
      prochaineLe: r.prochaine_le,
      balayageTronque: r.balayage_tronque,
      version: Number(r.version),
      comptes: Object.freeze({
        total: Number(c?.total ?? '0'),
        aExaminer: Number(c?.a_examiner ?? '0'),
        maintenu: Number(c?.maintenu ?? '0'),
        aRetirer: Number(c?.a_retirer ?? '0'),
        aVerifier: Number(c?.a_verifier ?? '0'),
        desactives: Number(c?.desactives ?? '0'),
        indirects: Number(c?.indirects ?? '0'),
      }),
      lignes: r.id === idDetaille ? Object.freeze(lignes) : [],
    }) as RevueDecrite;
  });
}
