/**
 * L'écriture au journal d'audit — **le seul point du serveur qui insère dans
 * `journal_audit`.**
 *
 * `PLAN_SERVEUR` §1.7, `CONVENTIONS.md` §12 et **§29** (qui fait foi pour le lot
 * L5) : le journal est en **ajout seul**, chaîné par empreinte, retenu trois
 * ans.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce fichier a changé de statut au lot L5 — et il faut le dire
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il s'appelait « les écritures que fait la couche d'authentification », et il
 * l'était : `journaliser()` n'était appelée que depuis `src/auth/index.ts`.
 * Mesuré à la porte S3, ce que cela donnait en base — **4 actions émises sur
 * les 20 déclarées** par `ck_journal_audit_action`, 160 entrées, toutes de la
 * connexion. *Un journal inaltérable et incomplet prouve moins qu'il n'en a
 * l'air.*
 *
 * Il est désormais **partagé** : `src/entites/` (créations, modifications,
 * suppressions, reprise), `src/api/index.ts` (refus de droit, export,
 * administration) et `src/serveur.ts` (démarrage, arrêt) écrivent par ici. Il
 * reste sous `src/auth/` parce que c'est là que l'identité vit et que le
 * déplacer aurait cassé le périmètre disjoint de la vague ; ce n'est pas une
 * propriété du journal, c'est une adresse.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Cinq règles, et aucune n'est une précaution de style
 * ════════════════════════════════════════════════════════════════════════
 *
 *  1. **L'acteur ne vient pas de l'appelant.** `utilisateur_id` est écrasé par
 *     le déclencheur de chaînage, qui résout le LOGIN `grc.utilisateur` dans
 *     `utilisateurs.identifiant` (`CONVENTIONS.md` §17.8 et §18.3). Ce module
 *     ne fournit donc jamais cette colonne — il fournit `utilisateur_libelle`,
 *     confort de lecture explicitement prévu pour survivre à la suppression du
 *     compte **et** pour couvrir l'échec de connexion sur un login inconnu.
 *     Même chose pour `numero`, `horodatage`, `empreinte` et
 *     `empreinte_precedente` : le déclencheur écrase ce qu'on lui enverrait,
 *     et il n'existe donc aucun moyen de forger une entrée cohérente (§12).
 *  2. **`filiale_id` reste nul** pour tout ce qui précède la résolution du
 *     périmètre, et pour ce qui est transversal (démarrage du service). La
 *     politique d'ajout l'admet explicitement ; une valeur posée au hasard
 *     serait, elle, refusée — `f_filiale_ecriture()` exige la filiale **active**
 *     de la session, et vérifie qu'elle appartient au périmètre lisible
 *     (`004_rls.sql` §6, `CONVENTIONS.md` §17.9).
 *  3. **Rien de secret n'entre dans une entrée** (§29.6) : pas de mot de passe,
 *     pas de jeton, pas d'empreinte de jeton, pas de secret de configuration,
 *     pas de contenu de pièce jointe. Le journal se lit à froid, trois ans plus
 *     tard, par des gens qui n'étaient pas là (contrôle S8).
 *  4. **`resume` est une phrase écrite par le développeur** (§29.5). Une valeur
 *     d'utilisateur n'y entre jamais : elle a deux sorties, `utilisateur_libelle`
 *     pour l'identité présentée et `valeurs_apres` en `jsonb` pour le reste, où
 *     l'encodage est le problème de PostgreSQL et non celui de qui écrit la
 *     phrase. `normaliserResume()` ci-dessous est la ceinture, pas la règle.
 *  5. **L'émission vit dans la transaction de l'écriture** (§29.3). `journaliser`
 *     prend le `PoolClient` en cours, jamais une connexion à elle : un
 *     `rollback` emporte la trace, et une écriture ne peut pas réussir sans sa
 *     trace. Un événement qui n'a pas de transaction à lui en ouvre une (refus
 *     de droit, démarrage, arrêt).
 */

import type { PoolClient } from 'pg';

/**
 * Les vingt actions que déclare `ck_journal_audit_action` (`001_socle.sql` §9).
 *
 * ⚠️ **C'est une liste écrite à la main, et c'est le bon outil ici** — le
 * discriminant du `CLAUDE.md` §3 étant *ce qui arrive le jour où elle devient
 * incomplète*. Une action absente d'ici ne compile pas ; une action présente ici
 * mais absente de la contrainte fait **échouer l'insertion bruyamment**
 * (`23514`). Dans les deux sens, l'omission crie. Ce serait le mauvais outil si
 * elle faisait réussir quelque chose en silence : ce n'est pas le cas.
 *
 * Ce qu'aucune liste ne doit tenir, en revanche, c'est **qui émet quoi** : la
 * couverture se mesure en base (`test/journal/couverture.test.mjs`), en
 * comparant les actions réellement émises aux actions déclarées, lues dans
 * `pg_catalog`.
 */
export type ActionJournal =
  | 'connexion_reussie'
  | 'connexion_echouee'
  | 'deconnexion'
  | 'session_expiree'
  | 'session_revoquee'
  | 'refus_autorisation'
  | 'creation'
  | 'modification'
  | 'suppression'
  | 'consultation_sensible'
  | 'export'
  | 'import'
  | 'administration'
  | 'approbation'
  | 'analyse_antivirus'
  | 'purge'
  | 'archivage'
  | 'demarrage'
  | 'arret'
  | 'verification_journal';

/**
 * Ancien nom, conservé le temps que rien ne le référence plus.
 * @deprecated employer `ActionJournal`.
 */
export type ActionAuth = ActionJournal;

export interface EntreeJournal {
  readonly action: ActionJournal;
  /**
   * Phrase lisible, **écrite par le développeur** (§29.5). Ni secret, ni pile
   * d'appel, ni nom d'objet interne — et surtout aucune valeur d'utilisateur.
   */
  readonly resume: string;
  /** Identité telle que connue au moment des faits — le login présenté suffit. */
  readonly utilisateurLibelle?: string | null;
  readonly sessionId?: string | null;
  readonly adresseIp?: string | null;
  /** Renseigné seulement quand le périmètre est résolu ET que l'événement lui appartient. */
  readonly filialeId?: string | null;
  /** Doit appartenir au domaine `type_entite` (`001_socle.sql` §1) — sinon `23514`. */
  readonly entiteType?: string | null;
  readonly entiteId?: string | null;
  /** État précédent des **seuls champs modifiés** (§29.4). */
  readonly valeursAvant?: Record<string, unknown> | null;
  /** Charge structurée : l'enregistrement créé, le différentiel, un bilan… jamais de secret. */
  readonly valeursApres?: Record<string, unknown> | null;
}

/**
 * Neutralise ce qui scinderait une ligne d'export.
 *
 * ── Le défaut qu'elle borde, et ce qu'elle ne répare pas ─────────────────
 *
 * L'auditeur de la porte S3 a forgé un login contenant du JSON et des sauts de
 * ligne : il est arrivé **littéralement** dans le journal, par un `resume`
 * construit en concaténant le login. Le chaînage n'en a pas souffert et rien
 * n'a fui — mais l'export du journal est un livrable du lot, et un export texte
 * scinderait la ligne (§29.5, §29.8).
 *
 * ⚠️ **Ceci est une ceinture, pas la règle.** La règle est de ne pas concaténer,
 * et elle vaut d'abord pour l'appelant : normaliser une valeur d'utilisateur ne
 * la rend pas légitime dans `resume`, cela l'y rend seulement inoffensive. Les
 * entrées de la couche d'authentification concatènent encore le login présenté
 * (`src/auth/index.ts`, hors du périmètre de cet agent) ; cette fonction fait
 * que, d'ici que ce soit corrigé, aucune entrée du journal ne porte de
 * caractère de commande.
 *
 * Ce qu'elle fait : remplace tout caractère de contrôle — `\r`, `\n`, `\t`, et
 * l'ensemble C0/C1 — par une espace, réduit les suites d'espaces, et borne à
 * 2 000 signes. Ce qu'elle **ne** fait pas : échapper les guillemets ou les
 * points-virgules, qui sont des caractères de texte ordinaires ; c'est au
 * format d'export de les citer (§29.8), pas à l'émetteur de les mutiler.
 */
export function normaliserResume(texte: string): string {
  const sansCommande = texte.replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ');
  const compact = sansCommande.replace(/\s{2,}/gu, ' ').trim();
  return compact.length > 2000 ? `${compact.slice(0, 1997)}...` : compact;
}

/**
 * Écrit une entrée. La transaction appelante décide de son périmètre : c'est
 * elle qui fixe l'acteur (`grc.utilisateur`) et la filiale d'écriture.
 *
 * ⚠️ **Elle ne rattrape aucune erreur, et c'est la règle 2 du §29.3** : si
 * l'insertion échoue, la transaction de l'appelant échoue avec elle. Un journal
 * qu'on peut faire taire en le saturant n'est pas inaltérable. Les seuls
 * appelants autorisés à envelopper cet appel dans un `try` sont ceux dont
 * l'événement n'a **pas** d'écriture métier à emporter — le refus de droit, le
 * démarrage et l'arrêt du service —, et ils le disent à l'endroit où ils le
 * font.
 */
export async function journaliser(client: PoolClient, entree: EntreeJournal): Promise<void> {
  await client.query(
    `insert into "journal_audit"
            ("filiale_id", "utilisateur_libelle", "session_id", "adresse_ip",
             "action", "entite_type", "entite_id", "resume",
             "valeurs_avant", "valeurs_apres")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entree.filialeId ?? null,
      entree.utilisateurLibelle ?? null,
      entree.sessionId ?? null,
      entree.adresseIp ?? null,
      entree.action,
      entree.entiteType ?? null,
      entree.entiteId ?? null,
      normaliserResume(entree.resume),
      serialiser(entree.valeursAvant),
      serialiser(entree.valeursApres),
    ],
  );
}

/**
 * Sérialise une charge `jsonb`, ou rend `null`.
 *
 * Un objet **vide** vaut `null` : `{}` dans `valeurs_avant` se lirait « rien
 * n'a changé », ce qui est faux d'une modification, alors que `null` se lit
 * « non renseigné » — et c'est ce que la colonne veut dire (§29.4, `creation`
 * n'a pas d'avant, `suppression` pas d'après).
 */
function serialiser(valeurs: Record<string, unknown> | null | undefined): string | null {
  if (valeurs === undefined || valeurs === null) return null;
  if (Object.keys(valeurs).length === 0) return null;
  return JSON.stringify(valeurs);
}
