/**
 * Consultation du journal d'audit — **la couture, publiée avant les agents qui
 * la rempliront.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi ce fichier existe avant son contenu
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le lot L5 se construit à plusieurs mains : un agent émet les entrées
 * (`src/entites/`, `src/api/index.ts`), un autre les rend lisibles (ici, plus la
 * migration qui resserre la politique de lecture), un troisième les affiche
 * (`cyber-gouvernance_V4/js/modules/journal.js`). Le `PLAN_EXECUTION` §2 bis
 * l'écrit : *« le remède n'est pas de sérialiser, c'est de publier le contrat
 * d'abord »* — l'agent du chemin critique livre son interface, les dépendants
 * démarrent contre elle. C'est ce qui a fonctionné en vague 2 avec
 * `ResolveurPerimetre`, et c'est ce que ce fichier est.
 *
 * **Il est déjà enregistré par `src/api/index.ts`.** Aucun agent n'a donc à
 * toucher au point d'entrée pour brancher ses routes — ce qui les aurait mis à
 * deux sur le même fichier, et le §2 exige des périmètres disjoints au fichier
 * près.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Le contrat — il fait foi au `CONVENTIONS.md` §29.8, pas ici
 * ════════════════════════════════════════════════════════════════════════
 *
 * | Route | Déclaration d'accès | Rend |
 * |---|---|---|
 * | `GET /api/journal` | `{ action: 'lire', domaine: 'journal' }` | une page d'entrées |
 * | `GET /api/journal/export` | `{ action: 'exporter', domaine: 'journal' }` | le même jeu, en fichier |
 * | `GET /api/journal/verification` | `{ action: 'lire', domaine: 'journal' }` | `f_journal_audit_verifier()` |
 *
 * Trois points que le §29 tranche et qu'il ne faut pas re-décider ici :
 *
 *  1. **`domaine: 'journal'`, jamais `'administration'`.** Le vocabulaire de
 *     décision porte quatorze domaines depuis le 04/09/2026 : régler
 *     l'application et lire trois ans d'identités ne sont pas le même droit
 *     (`src/api/droits.ts`, et la morsure dans `test/droits/vocabulaire.test.mjs`).
 *  2. **La pagination se fait sur `numero`, jamais sur un décalage.** `numero`
 *     est strictement croissant et sans trou (`CONVENTIONS.md` §12) : c'est un
 *     curseur exact. Un `offset` sur un journal qui grandit pendant qu'on le
 *     feuillette saute des lignes.
 *  3. **Lire le journal est lui-même un acte tracé** — action
 *     `consultation_sensible`. « Qui a lu le journal » est une question d'audit,
 *     et la seule table qui puisse y répondre est celle-ci.
 *
 * ⚠️ **La route d'export exige le droit d'export EN PLUS du domaine.** C'est la
 * moitié du constat **Q-89** que la porte S3 a laissée ouverte : le droit
 * d'export a été rendu inviolable, et aucun export n'est tracé. Un export du
 * journal d'audit qui ne serait pas lui-même journalisé serait la version la
 * plus embarrassante de ce défaut.
 */

import type { FastifyInstance } from 'fastify';

/**
 * Options du greffon. Vide pour l'instant : l'agent qui implémente les routes y
 * déclare ce dont il a besoin (accès au pool, au dépôt), et `src/api/index.ts`
 * les lui passe à l'enregistrement.
 */
export interface OptionsJournal {
  readonly reserve?: never;
}

/**
 * Greffon de consultation du journal.
 *
 * ⚠️ **N'enregistre aucune route pour l'instant, et c'est délibéré.** Une route
 * qui existerait en rendant 501 serait une surface publique que personne n'a
 * décidé d'ouvrir ; un greffon vide est une couture. Le §29.8 dit exactement
 * quoi mettre ici.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function greffonJournal(
  _instance: FastifyInstance,
  _options: OptionsJournal,
): Promise<void> {
  // Lot L5 — voir `CONVENTIONS.md` §29.8.
}
