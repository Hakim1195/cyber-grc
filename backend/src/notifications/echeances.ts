/**
 * Les échéances, côté serveur — **la même source que l'écran, ou rien.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat : `CONVENTIONS.md` §36.3
 * ════════════════════════════════════════════════════════════════════════
 *
 * *« Le service `js/services/echeances.js` dérive déjà toutes les obligations
 * datées du produit […]. C'est la même source, et elle ne se réécrit pas côté
 * serveur : le lot L12 lit les mêmes dates, avec les mêmes règles, ou il
 * divergera. »*
 *
 * Le fichier du navigateur ne s'importe pas ici (il parle à `DataStore`, pas à
 * PostgreSQL). Ce qui se reprend, ce sont ses **règles**, et elles sont écrites
 * une par une ci-dessous, en face de la ligne du frontend dont elles viennent.
 * Toute divergence est un défaut de ce fichier, pas une décision.
 *
 * | # | Source | Règle du frontend | Traduction SQL |
 * |---|---|---|---|
 * | 1 | plan d'actions | `a.echeance` non vide et `statut ≠ « terminée »` | `echeance is not null and statut <> 'terminée'` |
 * | 2 | actions MCO | `m.datePrevue` non vide, statut ni « Réalisée » ni « Annulée » | `date_prevue is not null and statut not in ('Réalisée','Annulée')` |
 * | 3 | revues documentaires | `d.date_revue`, **ou** statut « à réviser » / « obsolète » | idem, sur `documents` |
 * | 4 | déclarations d'incidents | `déclaration_anssi` ou `_cnil` = « à déclarer » ; échéance = **détection + 72 h** ; détection inconnue → **immédiat** | `date_detection + 3` ; `null` → 0 jour |
 * | 5 | audits | `a.date` non vide et statut ≠ « réalisé » | `date_audit is not null and statut <> 'Réalisé'` |
 * | 6 | revues de direction | `r.date` non vide **et à venir** (`jours ≥ 0`) | `date_revue is not null and (date_revue - ref) >= 0` |
 *
 * ⚠️ **Deux écarts assumés, et ils sont écrits parce qu'ils sont des écarts :**
 *
 *  · **Une échéance sans date ne déclenche pas de relance.** Le frontend range
 *    un document « obsolète » sans `date_revue` dans la catégorie *Sans date* —
 *    ni en retard, ni proche. Un courriel, lui, n'a que « dans N jours » à dire :
 *    ces lignes sont donc **comptées à part** (`sansDate`) et portées au journal
 *    technique, jamais expédiées. Les taire aurait été le défaut ; les envoyer
 *    tous les jours pour l'éternité en aurait été un autre.
 *  · **Les documents de portée GROUPE (`filiale_id` nul) sont exclus.** La table
 *    est mixte : une politique du socle est lisible des vingt filiales, et la
 *    tâche tournant filiale par filiale, son propriétaire recevrait **vingt
 *    relances pour la même revue**. Aucun périmètre ne « possède » aujourd'hui
 *    ces lignes ; les rattacher est un arbitrage de produit, pas une décision de
 *    ce lot. Candidat V1.1, écrit au rapport.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ CE FICHIER NE LIT AUCUN TITRE, ET C'EST UNE GARANTIE DE STRUCTURE
 * ════════════════════════════════════════════════════════════════════════
 *
 * La règle 1 du §36.2 — *aucune donnée métier dans un courriel* — n'est pas
 * tenue par une relecture attentive de `message.ts` : elle est tenue **ici**,
 * par le fait qu'aucune des six requêtes ne sélectionne `titre`, `reference`,
 * `description`, `commentaire` ni `synthese`. Le type `Echeance` n'a pas de
 * champ où les mettre. Un futur `message.ts` distrait ne *peut pas* les écrire :
 * il n'y a rien à écrire.
 *
 * La seule valeur d'utilisateur qui entre ici est le **nom du responsable**, et
 * elle n'existe que pour être transformée en adresse par `resoudreDestinataires`.
 * Elle ne ressort jamais : `Echeance.responsables` sert au regroupement, et
 * `message.ts` ne reçoit que des nombres.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le cloisonnement n'est pas ici non plus
 * ════════════════════════════════════════════════════════════════════════
 *
 * Aucune de ces requêtes ne porte de clause `filiale_id` sur la table lue : le
 * cloisonnement est celui de la Row Level Security, sous le code, et la
 * transaction appelante pose un périmètre borné à **une seule** filiale
 * (`relances.ts`, `perimetreRelance`). Écrire la clause ici donnerait à croire
 * que le filtrage en dépend — et l'oublier un jour ne se verrait pas.
 *
 * La conséquence, mesurée par `test/notifications/cloisonnement.test.mjs` : un
 * responsable qui n'existe que dans l'annuaire d'une autre filiale n'a **pas**
 * d'adresse résolue, et ne reçoit rien.
 */

import type { PoolClient } from 'pg';

/* =====================================================================
 *  1. Vocabulaire
 * ===================================================================== */

/**
 * Les six sources, avec le libellé **écrit par le développeur** qui les nomme
 * dans un courriel, et la route de l'écran qui les montre.
 *
 * ⚠️ Ces libellés sont la seule chose que le message dit du *quoi*, et c'est
 * admis : ce sont des constantes du produit, pas des valeurs de base. Aucune
 * ligne de PostgreSQL ne les a jamais touchées.
 *
 * ⚠️ Liste écrite à la main **et c'est le bon outil** (`CLAUDE.md` §3) : une
 * source oubliée ne « réussit pas en silence », elle n'est simplement pas
 * relancée — et le contrôle de `test/notifications/echeances.test.mjs` compare
 * les six clés d'ici aux six blocs de `js/services/echeances.js`, en les
 * **découvrant** dans le fichier du frontend plutôt qu'en les recopiant.
 */
export const SOURCES = Object.freeze({
  action: { libelle: "Plan d'actions", route: '#/actions' },
  mco: { libelle: 'Actions préalables (MCO)', route: '#/mco' },
  document: { libelle: 'Revues documentaires', route: '#/documents' },
  incident: { libelle: "Déclarations d'incident", route: '#/incidents' },
  audit: { libelle: 'Audits', route: '#/audits' },
  revue: { libelle: 'Revues de direction', route: '#/audits' },
} as const);

export type TypeEcheance = keyof typeof SOURCES;

/**
 * Une obligation datée.
 *
 * ⚠️ **Aucun titre, aucune description : voir l'entête.** `responsables` porte
 * des noms, pour la seule résolution d'adresse ; ils ne franchissent pas ce
 * module.
 */
export interface Echeance {
  readonly type: TypeEcheance;
  readonly id: string;
  /** Jours entiers jusqu'à l'échéance ; négatif = en retard. Jamais `null` ici. */
  readonly jours: number;
  readonly responsables: readonly string[];
}

/** Catégorie d'urgence — mêmes bornes que `Echeances.bucketFor` du frontend. */
export type Urgence = 'retard' | 'aujourdhui' | 'semaine' | 'mois' | 'avenir';

export function urgenceDe(jours: number): Urgence {
  if (jours < 0) return 'retard';
  if (jours === 0) return 'aujourdhui';
  if (jours <= 7) return 'semaine';
  if (jours <= 31) return 'mois';
  return 'avenir';
}

export interface RecolteEcheances {
  readonly echeances: readonly Echeance[];
  /**
   * Obligations réelles **sans date exploitable**, par type. Comptées, jamais
   * expédiées — voir l'écart assumé n° 1 de l'entête.
   */
  readonly sansDate: Readonly<Record<string, number>>;
}

/* =====================================================================
 *  2. Récolte
 * ===================================================================== */

/**
 * Sépare un champ « un nom par ligne » (`revues.participants`, format exact du
 * champ multi-personnes du frontend — voir le commentaire de la colonne).
 */
function nomsDe(valeur: string | null): string[] {
  if (valeur === null) return [];
  return valeur
    .split(/[\r\n]+/u)
    .map((n) => n.trim())
    .filter((n) => n !== '');
}

function unNom(valeur: string | null): string[] {
  const nom = (valeur ?? '').trim();
  return nom === '' ? [] : [nom];
}

interface LigneDatee {
  readonly id: string;
  readonly jours: number | null;
  readonly qui: string | null;
}

/**
 * Récolte les échéances de la **filiale active de la transaction**.
 *
 * `reference` est la date à partir de laquelle « en retard » se calcule. Elle
 * est un paramètre — et non `current_date` en dur — pour que le banc puisse
 * semer des dates relatives à un point fixe : un essai dont le verdict dépend
 * du jour où on le joue est un essai qui rougira un dimanche.
 */
export async function recolterEcheances(
  client: PoolClient,
  reference: Date = new Date(),
): Promise<RecolteEcheances> {
  const jour = reference.toISOString().slice(0, 10);
  const echeances: Echeance[] = [];
  const sansDate: Record<string, number> = {};

  const verser = (
    type: TypeEcheance,
    lignes: readonly LigneDatee[],
    decoupe: (qui: string | null) => string[],
  ): void => {
    for (const ligne of lignes) {
      if (ligne.jours === null) {
        sansDate[type] = (sansDate[type] ?? 0) + 1;
        continue;
      }
      echeances.push({
        type,
        id: ligne.id,
        jours: ligne.jours,
        responsables: decoupe(ligne.qui),
      });
    }
  };

  /* 1. Plan d'actions — échéance des actions non terminées. */
  verser(
    'action',
    (
      await client.query<LigneDatee>(
        `select "id", ("echeance" - $1::date) as "jours", "responsable" as "qui"
           from "actions"
          where "echeance" is not null and "statut" <> 'terminée'`,
        [jour],
      )
    ).rows,
    unNom,
  );

  /* 2. Actions MCO — date programmée des actions non réalisées / non annulées.
        Même règle que `PraMcoModule.isEnRetard`, source unique côté frontend. */
  verser(
    'mco',
    (
      await client.query<LigneDatee>(
        `select "id", ("date_prevue" - $1::date) as "jours", "responsable" as "qui"
           from "mco_actions"
          where "date_prevue" is not null and "statut" not in ('Réalisée', 'Annulée')`,
        [jour],
      )
    ).rows,
    unNom,
  );

  /* 3. Revues documentaires — prochaine revue, ou statut « à réviser » / « obsolète ».
        `filiale_id is not null` : voir l'écart assumé n° 2 de l'entête. */
  verser(
    'document',
    (
      await client.query<LigneDatee>(
        `select "id", ("date_revue" - $1::date) as "jours", "proprietaire" as "qui"
           from "documents"
          where "filiale_id" is not null
            and ("date_revue" is not null or "statut" in ('à réviser', 'obsolète'))`,
        [jour],
      )
    ).rows,
    unNom,
  );

  /* 4. Déclarations d'incidents — obligation NIS2 / RGPD.
        Échéance = détection + 72 h ; détection inconnue → à déclarer sans délai.
        ⚠️ `incidents` ne porte AUCUN responsable : ces échéances n'ont donc pas
        de destinataire résoluble, et se retrouvent dans `sansDestinataire` du
        bilan de `relances.ts`. C'est un manque du modèle, pas un oubli d'ici :
        il est nommé au rapport de lot (candidat V1.1 — un référent par filiale). */
  verser(
    'incident',
    (
      await client.query<LigneDatee>(
        `select "id",
                coalesce(("date_detection" + 3) - $1::date, 0) as "jours",
                null::text as "qui"
           from "incidents"
          where "declaration_anssi" = 'à déclarer' or "declaration_cnil" = 'à déclarer'`,
        [jour],
      )
    ).rows,
    unNom,
  );

  /* 5. Audits — planifiés ou en cours, avec une date cible. */
  verser(
    'audit',
    (
      await client.query<LigneDatee>(
        `select "id", ("date_audit" - $1::date) as "jours", "auditeur" as "qui"
           from "audits"
          where "date_audit" is not null and "statut" <> 'Réalisé'`,
        [jour],
      )
    ).rows,
    unNom,
  );

  /* 6. Revues de direction — uniquement à venir (une revue passée est tenue). */
  verser(
    'revue',
    (
      await client.query<LigneDatee>(
        `select "id", ("date_revue" - $1::date) as "jours", "participants" as "qui"
           from "revues"
          where "date_revue" is not null and ("date_revue" - $1::date) >= 0`,
        [jour],
      )
    ).rows,
    nomsDe,
  );

  return { echeances, sansDate };
}

/* =====================================================================
 *  3. Destinataires — l'annuaire, et rien d'autre
 * ===================================================================== */

export interface Destinataire {
  readonly nom: string;
  readonly email: string;
}

/**
 * Résout des **noms** en **adresses de l'annuaire**.
 *
 * ⚠️ Règle 3 du §36.2, et elle est tenue par la forme : cette fonction ne prend
 * aucune adresse en paramètre, et `relances.ts` n'en construit aucune. La seule
 * façon d'obtenir un destinataire est de le trouver dans `personnes` — donc
 * dans le périmètre lisible de la transaction. Un produit qui accepterait une
 * adresse saisie deviendrait un relais de courriel arbitraire.
 *
 * La comparaison se fait sur le nom **replié en minuscules et détouré**, comme
 * la fiche « où c'est affecté » du module Personnel : les entités stockent le
 * nom en texte libre (`DATA_MODEL.md` §2), il n'y a pas de clé étrangère à
 * suivre.
 *
 * Une personne sans adresse n'est pas une erreur : elle n'est simplement pas
 * jointe, et le bilan la compte.
 */
export async function resoudreDestinataires(
  client: PoolClient,
  noms: readonly string[],
): Promise<Map<string, Destinataire>> {
  const cherches = [...new Set(noms.map((n) => n.trim().toLowerCase()).filter((n) => n !== ''))];
  const par = new Map<string, Destinataire>();
  if (cherches.length === 0) return par;

  // ── UNE RELANCE NE S'ADRESSE QU'À UNE FICHE QUE L'ANNUAIRE RÉSOUT ──────
  //
  // Constat de la porte S6, classe « fuite de données ». Le `CONVENTIONS.md`
  // §36.2 justifie tout le dessin de ce lot ainsi : *« personnes.email est
  // alimenté par l'AD ; accepter une adresse tapée à la main ferait du produit
  // un relais de courriel arbitraire »*. **C'était faux dans le produit livré** :
  // `email` est un champ ordinaire de `personnes`, et le niveau minimal
  // d'écriture y est `contribution`.
  //
  // Mesuré : une session de contribution a repointé une fiche vers
  // `exfiltration@attaquant.example` — 200, persisté. Et comme `utilisateur_id`
  // y est nul, la resynchronisation depuis l'AD **ne repasse jamais** sur cette
  // fiche : elle ne corrige que celles qui résolvent un compte réel. À partir du
  // lendemain matin, un produit installé sur site, accessible par VPN seulement,
  // aurait posté chaque jour vers l'extérieur le détail des obligations en
  // retard d'une filiale.
  //
  // `utilisateur_id is not null` referme la fuite **au point que le contrat
  // nomme** : seule une fiche rattachée à un compte de l'annuaire reçoit du
  // courrier. C'est plus sûr que de réserver la colonne en écriture — l'annuaire
  // se remplit aussi à la main, pour des prestataires qui ne se connectent pas,
  // et leur interdire une adresse casserait l'autocomplétion sans rien protéger.
  //
  // ⚠️ **Ce qui reste, et qui est assumé** : une adresse saisie à la main
  // s'affiche toujours dans le produit. Elle ne reçoit simplement **rien**, et
  // le bilan compte la personne comme « sans destinataire joignable ». Une
  // relance qui n'atteint personne se voit ; une relance qui atteint un
  // inconnu, non.
  //
  // ── L'ORDRE EST NORMATIF, ET SON ABSENCE ÉTAIT UNE FUITE ────────────────
  //
  // Constat de la porte S6, classe « fuite de données ». Cette requête n'avait
  // **aucun `ORDER BY`**, et le code retenait « la première adresse trouvée ».
  // Or `personnes` est une table **mixte** : une fiche de portée Groupe et la
  // fiche locale d'un homonyme sont **toutes deux visibles** depuis une filiale.
  // Rien ne les départageait, et l'ordre physique décidait.
  //
  // Mesuré : le destinataire d'une relance a basculé d'une fiche Groupe vers la
  // fiche locale **après un simple `update` sur un champ de notes** — c'est-à-dire
  // qu'une modification sans rapport changeait à qui partent les retards d'une
  // filiale. Un courriel sort de la machine ; se tromper de destinataire n'est
  // pas une gêne d'affichage.
  //
  // ⚠️ **La LOCALE gagne, et ce n'est pas arbitraire.** Une relance porte les
  // échéances d'UNE filiale : sa destinataire est la personne que cette filiale
  // a inscrite à son annuaire, pas l'homonyme du siège. Le socle Groupe est un
  // repli — il sert quand la filiale n'a pas sa propre fiche.
  //
  // ⚠️ Et le départage est **total** : `filiale_id` d'abord, puis `id` — sans le
  // second, deux fiches locales homonymes rouvriraient exactement le même
  // défaut, une lettre plus loin.
  const { rows } = await client.query<{ nom: string; email: string }>(
    `select "nom", "email"
       from "personnes"
      where lower(btrim("nom")) = any ($1::text[])
        and "email" is not null and btrim("email") <> ''
        and "utilisateur_id" is not null
      order by ("filiale_id" is null) asc, "filiale_id" asc, "id" asc`,
    [cherches],
  );

  for (const ligne of rows) {
    const cle = ligne.nom.trim().toLowerCase();
    // L'ordre ci-dessus rend ce « premier arrivé » DÉTERMINISTE : la fiche de la
    // filiale, à défaut celle du Groupe, et à égalité le plus petit identifiant.
    if (!par.has(cle)) par.set(cle, { nom: ligne.nom.trim(), email: ligne.email.trim() });
  }
  return par;
}
