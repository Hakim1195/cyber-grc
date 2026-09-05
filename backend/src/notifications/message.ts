/**
 * La rédaction d'une relance — **le point du lot, et sa seule règle dure.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Règle 1 du `CONVENTIONS.md` §36.2 : aucune donnée métier dans un courriel
 * ════════════════════════════════════════════════════════════════════════
 *
 * *« Un courriel traverse des serveurs que le client ne maîtrise pas, et le
 * produit est cloisonné par filiale : écrire "le risque Rançongiciel sur l'ERP
 * de Hambourg est en retard" dans un message sortant annulerait le
 * cloisonnement par le canal le plus banal. Le message dit quoi faire et où,
 * jamais quoi. Un lien, un compte, une échéance — pas un contenu. »*
 *
 * ── Comment cette règle est TENUE, et non seulement rappelée ─────────────
 *
 * Par la **forme du paramètre**. `composerRelance` ne reçoit que des nombres et
 * une URL de configuration : `BilanRelance` n'a pas un seul champ où un titre,
 * un nom ou une description pourrait entrer. En amont, `echeances.ts` ne
 * *sélectionne* aucune de ces colonnes — le type `Echeance` n'a pas de champ
 * `titre`. Il n'y a donc, entre PostgreSQL et l'octet expédié, **aucun chemin**
 * par lequel une valeur de base atteigne le corps du message.
 *
 * C'est ce qui rend la propriété vérifiable au lieu d'être promise :
 * `test/notifications/message.test.mjs` sème des enregistrements aux titres
 * reconnaissables, joue la chaîne entière jusqu'aux octets remis au serveur
 * SMTP, et **cherche ces chaînes dans ce que le relais a reçu**. Sans cette
 * matière semée, l'essai serait vert sans rien avoir mesuré — le défaut que la
 * porte S4 a nommé deux fois (constats Q-108 et Q-116).
 *
 * ── Ce que le message révèle malgré tout, et qui n'est pas nul ───────────
 *
 * Des **nombres**, et donc l'existence d'obligations en retard, module par
 * module. « 1 déclaration d'incident » dit à un serveur de messagerie
 * intermédiaire que cette organisation a un incident à déclarer. Le §36.2
 * autorise explicitement « un compte, un nombre, un lien » ; c'est donc le
 * maximum admis, et non zéro. Réduire davantage — un message qui dirait
 * seulement « vous avez des échéances » — est possible et ne coûterait que
 * l'utilité de la relance. **C'est un arbitrage, il est écrit ici pour être
 * contestable**, et il se change dans cette seule fonction.
 *
 * Ce que le message ne dit **pas**, et qu'il aurait été facile d'y mettre : le
 * nom de la filiale (`filiales.raison_sociale`), le nom du destinataire
 * (`personnes.nom`), le libellé d'un statut, l'identifiant d'un enregistrement.
 * Aucun n'est un nombre, et « Hambourg » est exactement l'exemple du §36.2.
 */

import type { TypeEcheance, Urgence } from './echeances.js';
import { SOURCES } from './echeances.js';

/**
 * Tout ce que la rédaction connaît d'une relance : **des entiers**.
 *
 * ⚠️ N'ajoutez pas de champ texte ici. Ce type est la barrière ; un champ
 * `titre`, `filiale` ou `destinataire` la retirerait, et le contrôle central du
 * lot cesserait de mesurer quoi que ce soit.
 */
export interface BilanRelance {
  readonly parUrgence: Readonly<Partial<Record<Urgence, number>>>;
  readonly parType: Readonly<Partial<Record<TypeEcheance, number>>>;
}

export interface RelanceRedigee {
  readonly sujet: string;
  readonly corps: string;
  /** Nombre d'échéances couvertes — sert au bilan, jamais au texte. */
  readonly total: number;
}

/** L'ordre d'affichage des urgences, du plus pressant au moins pressant. */
const ORDRE_URGENCE: readonly { readonly cle: Urgence; readonly libelle: string }[] = Object.freeze([
  { cle: 'retard', libelle: 'En retard' },
  { cle: 'aujourdhui', libelle: "Pour aujourd'hui" },
  { cle: 'semaine', libelle: 'Sous 7 jours' },
  { cle: 'mois', libelle: 'Sous 31 jours' },
  { cle: 'avenir', libelle: 'Plus tard' },
]);

/**
 * Refuse une URL publique inutilisable **avant** qu'elle atteigne un en-tête ou
 * un corps de message.
 *
 * `SERVEUR_URL_PUBLIQUE` est une valeur de configuration, pas d'utilisateur —
 * mais elle finit dans un message expédié, et une configuration se copie-colle.
 * Le contrôle est ici plutôt que dans `config/index.ts`, qui ne m'appartient
 * pas ; il est bon marché et il ne dépend d'aucune discipline.
 */
function baseLien(urlPublique: string): string {
  const url = urlPublique.trim().replace(/\/+$/u, '');
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/u.test(url)) {
    throw new Error(
      `SERVEUR_URL_PUBLIQUE inutilisable pour un lien de relance : « ${url.slice(0, 60)} ».`,
    );
  }
  return url;
}

function ligne(libelle: string, valeur: number, largeur = 34): string {
  const points = '.'.repeat(Math.max(2, largeur - libelle.length));
  return `  ${libelle} ${points} ${String(valeur)}`;
}

/**
 * Rédige la relance d'**un** destinataire.
 *
 * Le nom du destinataire n'apparaît nulle part, pas même en salutation : c'est
 * une valeur de `personnes.nom`, et la règle ne fait pas d'exception pour les
 * politesses. Son adresse est dans l'enveloppe, ce qui est inévitable ; son
 * nom, non.
 */
export function composerRelance(bilan: BilanRelance, urlPublique: string): RelanceRedigee {
  const base = baseLien(urlPublique);

  const urgences = ORDRE_URGENCE.map((u) => ({ ...u, valeur: bilan.parUrgence[u.cle] ?? 0 })).filter(
    (u) => u.valeur > 0,
  );
  const total = urgences.reduce((somme, u) => somme + u.valeur, 0);
  const enRetard = bilan.parUrgence.retard ?? 0;

  const sujet =
    enRetard > 0
      ? `Cyber GRC — ${String(total)} échéance(s) à traiter, dont ${String(enRetard)} en retard`
      : `Cyber GRC — ${String(total)} échéance(s) à traiter`;

  const modules = (Object.keys(SOURCES) as TypeEcheance[])
    .map((type) => ({ type, valeur: bilan.parType[type] ?? 0 }))
    .filter((m) => m.valeur > 0)
    .map((m) => `${ligne(SOURCES[m.type].libelle, m.valeur, 30)}   ${base}/${SOURCES[m.type].route}`);

  const corps = [
    'Bonjour,',
    '',
    "L'application Cyber GRC signale des obligations datées qui vous sont attribuées.",
    '',
    ...urgences.map((u) => ligne(u.libelle, u.valeur)),
    ligne('Total', total),
    '',
    'Répartition par module :',
    '',
    ...modules,
    '',
    `Échéancier complet : ${base}/#/echeances`,
    '',
    '--',
    "Message engendré automatiquement par Cyber GRC. Il ne contient volontairement",
    "aucune donnée de l'application : le détail n'est lisible qu'après authentification,",
    'dans votre périmètre. Inutile de répondre à ce message.',
    '',
  ].join('\r\n');

  return { sujet, corps, total };
}

/**
 * Le message du **bouton de test** du `PLAN_SERVEUR` §1.11.
 *
 * Il ne porte aucun chiffre : son objet est de prouver que le relais accepte et
 * délivre, rien d'autre. Il ne dit pas non plus *qui* l'a demandé — l'identité
 * de l'opérateur est dans le journal d'audit, qui est cloisonné ; un courriel ne
 * l'est pas.
 */
export function composerTest(urlPublique: string): RelanceRedigee {
  const base = baseLien(urlPublique);
  return {
    sujet: 'Cyber GRC — message de vérification du relais',
    total: 0,
    corps: [
      'Bonjour,',
      '',
      "Ce message vérifie que le relais de messagerie configuré pour Cyber GRC",
      'accepte et délivre le courrier sortant. Sa réception suffit : il n’y a rien',
      'à faire.',
      '',
      `Application : ${base}/`,
      '',
      '--',
      'Message engendré automatiquement par Cyber GRC. Inutile de répondre.',
      '',
    ].join('\r\n'),
  };
}
