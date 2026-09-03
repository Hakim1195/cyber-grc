/**
 * La passerelle entre les droits **résolus** (trente domaines, un niveau par
 * domaine) et les droits **appliqués par le point d'entrée** (treize domaines,
 * un niveau pour la session).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi il y a deux vocabulaires, et lequel fait foi
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/api/droits.ts` (agent A2) définit **treize** domaines fonctionnels, taillés
 * pour la décision d'accès d'une route : « ce que cette entité met en jeu ». La
 * base, elle, en porte **trente** (`domaine_fonctionnel`, `001_socle.sql` §1),
 * alignés sur le menu de l'application, et c'est ce vocabulaire-là que
 * `profil_domaines` et `session_domaines` emploient.
 *
 * Aucun des deux n'a tort : le premier regroupe pour décider, le second détaille
 * pour paramétrer. Le second **fait foi**, parce que c'est lui qu'un
 * administrateur voit quand il ouvre ou ferme un domaine à un profil, et parce
 * que c'est lui que la contrainte de schéma tient. Ce fichier est la projection
 * du second sur le premier, et il est le **seul** endroit où elle a lieu.
 *
 * La table est un `Record` **exhaustif** sur les trente domaines de base : un
 * domaine ajouté à `modele.ts` sans décision de rattachement fait échouer la
 * compilation. C'est le même garde-fou que celui d'A2 sur `DOMAINE_PAR_ENTITE`,
 * pour la même raison — voir `CONVENTIONS.md` §24 : ce qu'on veut n'est pas
 * d'énumérer, c'est d'obliger un humain à trancher.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  ⚠️ CE QUE CETTE PROJECTION PERD, ET IL FAUT LE DIRE
 * ════════════════════════════════════════════════════════════════════════
 *
 * `DroitsSession` porte **un** niveau pour toute la session. Les droits résolus,
 * eux, en portent **un par domaine** : le profil *Qualité* contribue aux audits
 * et **lit** seulement la conformité. La projection ne peut pas exprimer cela —
 * elle rend le niveau le plus élevé, et la liste des domaines ouverts.
 *
 * **Conséquence concrète, mesurable, et non corrigée ici** : un profil *Qualité*
 * passe le contrôle de `deciderAcces` pour une écriture sur le domaine
 * `conformite`, alors que `session_domaines` ne lui accorde que la lecture sur
 * `exigences`, `referentiels` et `mesures`.
 *
 * Ce n'est **pas** un défaut de ce fichier : c'est la forme de `DroitsSession`,
 * qui appartient à un autre agent. Le correctif tient en un champ —
 * `niveaux: Readonly<Record<DomaineFonctionnel, NiveauAcces>>` — et il est
 * **demandé dans le rapport d'agent**, pas fait ici (`PLAN_EXECUTION` §2).
 *
 * En attendant, le contrôle fin **existe** et il est exposé :
 * `ResolveurPerimetreSession.peut(domaine, niveau)` répond sur les trente
 * domaines, avec le niveau exact. Ce qui manque n'est pas la donnée, c'est son
 * emploi par la route.
 */

import type { DomaineFonctionnel, DroitsSession, NiveauAcces } from '../api/droits.js';

import type { DomaineFonctionnelBase, NiveauDroit } from './modele.js';
import type { EtatSession } from './resolveur.js';

/**
 * Rattachement de chacun des trente domaines de la base à l'un des treize
 * domaines de décision. Exhaustif par construction — voir l'entête.
 */
export const DOMAINE_API_PAR_DOMAINE_BASE: Readonly<
  Record<DomaineFonctionnelBase, DomaineFonctionnel | null>
> = Object.freeze({
  tableau_de_bord: 'pilotage',
  synthese: 'pilotage',
  echeances: 'pilotage',
  donneurs_ordre: 'tiers',
  prestataires: 'tiers',
  personnel: 'personnel',
  actifs: 'actifs',
  cartographie: 'actifs',
  risques: 'risques',
  exigences: 'conformite',
  referentiels: 'conformite',
  mesures: 'conformite',
  correspondances: 'conformite',
  actions: 'actions',
  mco: 'actions',
  incidents: 'incidents',
  documents: 'documents',
  pieces_jointes: 'documents',
  rgpd: 'rgpd',
  bia: 'continuite',
  crise: 'continuite',
  pra: 'continuite',
  tests_pra: 'continuite',
  audits: 'audits',
  revues: 'audits',
  // ⚠️ « imports » ne se projette sur RIEN, et cette ligne a été écrite deux fois.
  //
  // Le premier jet le rattachait à « administration », au motif que reprendre un jeu
  // de données entier est un acte d'administration — ce qui est vrai de l'ACTION, pas
  // du DOMAINE. La conséquence, mesurée par le banc et non prévue : tout profil
  // portant « imports » — le RSSI de site, l'auditeur — recevait le domaine
  // « administration » dans ses droits projetés, et passait donc le contrôle de
  // domaine des routes d'administration. Un sur-octroi silencieux, introduit par une
  // table de correspondance, dans le fichier même qui prévient qu'une projection perd
  // de l'information.
  //
  // Ce qui garde la reprise fermée est le NIVEAU, pas le domaine : la route la
  // déclare en action « administrer », qui exige le niveau « administration », que
  // seul le profil ADMIN porte. Le contrôle fin reste disponible par
  // `ResolveurPerimetreSession.peut('imports', …)`.
  imports: null,
  parametres: 'administration',
  filiales: 'administration',
  droits: 'administration',
  journal: 'administration',
});

const RANG: Readonly<Record<NiveauDroit, number>> = Object.freeze({
  aucun: 0,
  lecture: 1,
  contribution: 2,
  validation: 3,
  administration: 4,
});

/**
 * Projette l'état d'une session sur la forme que le point d'entrée consomme.
 *
 * Le niveau rendu est le **plus élevé** des niveaux par domaine — voir l'avertissement
 * en tête de fichier. Une session sans aucun domaine ouvert rend `lecture` et une
 * liste vide : `deciderAcces` la refusera sur le domaine, jamais sur le niveau,
 * ce qui donne un journal technique exploitable au lieu d'un « niveau insuffisant »
 * trompeur.
 */
export function projeterDroits(etat: EtatSession): DroitsSession {
  const domaines = new Set<DomaineFonctionnel>();
  let plusHaut: NiveauDroit = 'aucun';

  for (const [base, niveau] of etat.domaines) {
    if (niveau === 'aucun') continue;
    const projete = DOMAINE_API_PAR_DOMAINE_BASE[base];
    // `null` = ce domaine de base n'a pas d'équivalent dans le vocabulaire de
    // décision des routes. Il n'en ouvre donc aucun — le défaut est fermé.
    if (projete !== null) domaines.add(projete);
    if (RANG[niveau] > RANG[plusHaut]) plusHaut = niveau;
  }

  return Object.freeze({
    niveau: (plusHaut === 'aucun' ? 'lecture' : plusHaut) satisfies NiveauAcces,
    domaines: Object.freeze([...domaines]) as readonly DomaineFonctionnel[],
    export: etat.peutExporter,
  });
}
