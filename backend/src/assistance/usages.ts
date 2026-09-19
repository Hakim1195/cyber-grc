/**
 * `src/assistance/usages.ts` — LES CINQ USAGES, ET PAS UN DE PLUS (lot L27)
 *
 * ── ⚠️ CE QUE L'ASSISTANCE NE FAIT JAMAIS ─────────────────────────────────
 *
 * **Elle propose ; un humain décide.** Aucun de ces cinq usages n'écrit en base, et
 * aucun ne porte de décision de conformité. Le module tout entier est **sans effet de
 * bord sur les données métier** : il compose un texte, il le soumet, il rend ce qui
 * revient. Ce que l'utilisateur en fait passe par les routes ordinaires, avec leurs
 * contrôles ordinaires.
 *
 * ── ⚠️ LA MINIMISATION EST UNE **DÉCOUVERTE**, PAS UNE LISTE (barrière n° 4) ──
 *
 * Le plan produit est explicite : *« cette liste est appliquée par une découverte — les
 * tables et colonnes concernées sont dérivées du catalogue, jamais énumérées à la main :
 * une colonne ajoutée demain doit être exclue par défaut, pas incluse par oubli »*.
 *
 * C'est pourquoi **rien ici ne lit la base**. Chaque usage reçoit une matière déjà
 * choisie par l'appelant — un identifiant, un titre, un code — et ne compose qu'à partir
 * d'elle. Ce qui n'est pas passé en argument ne peut pas partir : *l'inclusion est un
 * geste, l'exclusion est l'état par défaut.*
 *
 * ⚠️ **Ne partent jamais, quelle que soit la configuration** : le contenu des pièces
 * jointes, les entrées du journal d'audit, les fiches de l'annuaire des personnes, et
 * toute donnée d'une autre filiale que l'active. Les trois premiers parce qu'aucun usage
 * ne les prend en argument ; le quatrième parce que la RLS borne la lecture de
 * l'appelant, comme partout.
 */

/** Les cinq usages arbitrés. Le vocabulaire est CLOS, et la base le tient aussi. */
export const USAGES = Object.freeze([
  'correspondances',
  'brouillon_politique',
  'resume_incident',
  'reponse_questionnaire',
  'recherche',
] as const);

export type UsageAssistance = (typeof USAGES)[number];

export function estUsageConnu(valeur: string): valeur is UsageAssistance {
  return (USAGES as readonly string[]).includes(valeur);
}

/** Bornes de composition (contrôle S13). Un envoi n'est pas un dépôt de fichier. */
const MATIERE_MAX = 40;
const CHAMP_MAX = 500;

/** Une pièce de matière : ce que l'appelant a explicitement choisi de soumettre. */
export interface Matiere {
  readonly etiquette: string;
  readonly valeur: string;
}

export interface InviteComposee {
  readonly usage: UsageAssistance;
  /** Le texte EXACT qui partira. C'est lui que l'écran montre avant l'envoi. */
  readonly texte: string;
  /** Ce que l'assistance est autorisée à rendre, dit en toutes lettres. */
  readonly attendu: string;
}

function propre(valeur: string): string {
  // ⚠️ On borne, et on retire les sauts de ligne de la VALEUR : sans cela, une
  // valeur saisie pourrait fabriquer une ligne « Consigne : … » et se faire passer
  // pour une instruction. C'est l'injection d'invite, et elle se ferme à la source
  // — pas par une consigne qui demanderait au modèle de ne pas se laisser faire.
  return valeur.replace(/[\r\n\t]+/gu, ' ').trim().slice(0, CHAMP_MAX);
}

/** L'en-tête commun : ce que l'assistance doit faire, et ce qu'elle ne doit pas faire. */
function cadre(consigne: string, interdit: string): string {
  return (
    `${consigne}\n` +
    `Contrainte : ${interdit}\n` +
    "Contrainte : n'invente aucun fait qui ne soit pas dans les éléments ci-dessous. " +
    "Si les éléments ne suffisent pas, dis-le au lieu de compléter.\n" +
    'Contrainte : réponds en français, en texte simple, sans balise.\n'
  );
}

/**
 * Compose l'invite d'un usage.
 *
 * ⚠️ **Le texte rendu est celui qui partira, à l'octet près.** L'écran le montre, et
 * l'utilisateur peut l'annuler (barrière n° 4). Une composition faite ailleurs, au
 * moment de l'envoi, rendrait ce que l'écran a montré non vérifiable.
 */
export function composer(usage: UsageAssistance, matiere: readonly Matiere[]): InviteComposee {
  const pieces = matiere
    .slice(0, MATIERE_MAX)
    .map((m) => `- ${propre(m.etiquette)} : ${propre(m.valeur)}`)
    .join('\n');

  switch (usage) {
    case 'correspondances':
      return {
        usage,
        texte:
          cadre(
            "Propose les rapprochements plausibles entre ces exigences de référentiels.",
            "ne conclus RIEN sur la conformité, et n'attribue aucun statut",
          ) + `\nÉléments :\n${pieces}\n`,
        attendu:
          'Des rapprochements PROPOSÉS, à valider un par un. ' +
          'Un statut de conformité propagé à tort est un faux en audit.',
      };
    case 'brouillon_politique':
      return {
        usage,
        texte:
          cadre(
            'Rédige un BROUILLON de politique à partir de ce canevas et de ces éléments.',
            "ne présente pas ce texte comme approuvé, ni comme applicable en l'état",
          ) + `\nÉléments :\n${pieces}\n`,
        attendu:
          'Un brouillon à relire et à faire approuver. La publication reste soumise ' +
          'au circuit d’approbation (code GRC06), qui en est seul maître.',
      };
    case 'resume_incident':
      return {
        usage,
        texte:
          cadre(
            "Résume cet incident de sécurité en quelques phrases factuelles.",
            "ne qualifie pas l'incident au regard de NIS2 ou du RGPD, et ne propose " +
              'aucun contenu de déclaration à une autorité',
          ) + `\nÉléments :\n${pieces}\n`,
        attendu:
          'Une synthèse à relire. Le produit ne remplit ni la déclaration ANSSI, ni ' +
          'la CNIL : il prépare, un humain envoie.',
      };
    case 'reponse_questionnaire':
      return {
        usage,
        texte:
          cadre(
            'Propose une réponse à cette question de questionnaire client, à partir ' +
              'des seuls éléments de preuve fournis.',
            "n'affirme rien qui ne soit appuyé par un élément ci-dessous",
          ) + `\nÉléments :\n${pieces}\n`,
        attendu:
          'Une proposition de réponse. Elle n’est PAS envoyée : c’est une saisie ' +
          'que l’utilisateur relit, corrige et valide.',
      };
    case 'recherche':
      return {
        usage,
        texte:
          cadre(
            'Reformule cette demande en langage courant sous forme de critères de ' +
              'recherche simples.',
            "ne propose aucun critère portant sur une autre filiale que celle en cours",
          ) + `\nÉléments :\n${pieces}\n`,
        attendu:
          'Des critères de recherche. ⚠️ Ils n’élargissent jamais le périmètre : la ' +
          'RLS borne le résultat côté serveur, comme partout.',
      };
  }
}
