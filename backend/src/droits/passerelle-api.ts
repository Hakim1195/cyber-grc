/**
 * La passerelle entre les droits **résolus** (trente domaines, un niveau par
 * domaine) et les droits **appliqués par le point d'entrée** (quatorze domaines,
 * un niveau pour la session).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi il y a deux vocabulaires, et lequel fait foi
 * ════════════════════════════════════════════════════════════════════════
 *
 * `src/api/droits.ts` définit **quatorze** domaines fonctionnels, taillés
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
 *  CE QUE CETTE PROJECTION PERD, ET CE QU'ELLE NE PERD PLUS — constat Q-66
 * ════════════════════════════════════════════════════════════════════════
 *
 * `DroitsSession.niveau` porte **un** niveau pour toute la session. Les droits
 * résolus, eux, en portent **un par domaine** : le profil *Qualité* contribue
 * aux audits et **lit** seulement la conformité. Ce champ-là ne peut pas
 * exprimer cela — il rend le niveau le plus élevé.
 *
 * ── Ce que ça coûtait, mesuré ────────────────────────────────────────────
 *
 * Cette projection l'écrivait, et ne le corrigeait pas : *« un profil Qualité
 * passe le contrôle de `deciderAcces` pour une écriture sur le domaine
 * `conformite`, alors que `session_domaines` ne lui accorde que la lecture »*.
 * Le 03/09/2026, contre un Active Directory réel, la conséquence a été
 * chiffrée : `qualite.tls` obtenait `niveau = contribution` sur **douze**
 * domaines de décision, quand la base ne lui en ouvre que sept, dont trois en
 * lecture seule. Le constat **Q-66** est resté ouvert deux tours parce que la
 * moitié consommatrice a été livrée sans la moitié productrice : `DroitsSession`
 * porte le champ `niveaux` depuis l'agent A2, et `deciderAcces` le lit
 * (`src/api/droits.ts`, « le niveau qui s'applique est celui du DOMAINE quand il
 * est connu ») — mais **rien ne l'émettait**. Un champ facultatif que personne ne
 * renseigne se comporte exactement comme un champ absent, en silence.
 *
 * ── Ce que cette fonction émet désormais ─────────────────────────────────
 *
 * `niveaux[d]` = le **plus haut** des niveaux tenus sur les domaines de base qui
 * se projettent sur `d`. Trois propriétés, et chacune est éprouvée par
 * `test/droits/projection-niveaux.test.mjs` :
 *
 *  1. **`niveaux[d]` ne dépasse jamais `niveau`.** C'est un maximum pris sur un
 *     sous-ensemble de celui qui produit `niveau` : la comparaison est vraie par
 *     construction, et l'essai la joue sur les huit profils de socle. Le champ
 *     **restreint**, il ne desserre jamais — un champ qui pourrait élargir aurait
 *     transformé un correctif de sur-octroi en sur-octroi.
 *  2. **Tout domaine ouvert est nommé.** `domaines` et les clés de `niveaux` sont
 *     le même ensemble, et l'essai le vérifie des deux côtés. Un domaine ouvert
 *     mais absent de `niveaux` retomberait sur `niveau`, c'est-à-dire sur le
 *     défaut que ce champ existe pour fermer.
 *  3. **Un domaine à « aucun » n'entre nulle part** — ni dans `domaines`, ni dans
 *     `niveaux`. `cartographie` est fermée explicitement au profil *Qualité*
 *     (`007_authentification.sql`), et cette fermeture doit rester lisible.
 *
 * ── Ce que ça ne corrige PAS, et il faut le dire ─────────────────────────
 *
 * Trente domaines se projettent sur quatorze : plusieurs domaines de base
 * partagent une case. `exigences`, `referentiels`, `mesures` et `correspondances`
 * tombent tous sur `conformite`. Un profil qui contribuerait aux `exigences` et
 * ne lirait que les `mesures` obtiendrait donc `conformite = contribution`, et
 * pourrait écrire une mesure. **Prendre le minimum à la place refuserait une
 * écriture légitime sur les exigences** — c'est-à-dire échanger un sur-octroi
 * contre un sous-octroi silencieux, ce qui est pire : le premier se mesure, le
 * second se contourne par une demande de droits que personne ne comprend.
 *
 * La granularité de décision est celle de la route, et c'est le vocabulaire à
 * quatorze domaines. Aucun profil de socle n'est dans ce cas aujourd'hui — l'essai
 * le **vérifie** plutôt que de l'affirmer, sur les huit profils. Le jour où un
 * profil paramétré le sera, le contrôle fin existe déjà et il est exposé :
 * `ResolveurPerimetreSession.peut(domaine, niveau)` répond sur les trente
 * domaines, avec le niveau exact.
 */

import type { DomaineFonctionnel, DroitsSession, NiveauAcces } from '../api/droits.js';

import type { DomaineFonctionnelBase, NiveauDroit } from './modele.js';
import type { EtatSession } from './resolveur.js';

/**
 * Rattachement de chacun des trente domaines de la base à l'un des quatorze
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
  // ⚠️ « journal » ne se projette PLUS sur « administration » — arbitrage de
  // l'ouverture du lot L5, motivé dans `src/api/droits.ts`.
  //
  // Les trois lignes au-dessus se rejoignent parce qu'un administrateur des
  // filiales, des droits ou des paramètres administre *l'application*. Lire le
  // journal d'audit n'est pas administrer l'application : c'est lire trois ans
  // d'identités, d'adresses IP et de valeurs avant/après, y compris les
  // siennes. Le `PLAN_SERVEUR` §3.2 en fait un domaine à part ; la projection
  // le rejoignait quand même, et c'est exactement la perte d'information dont
  // l'entête de ce fichier prévient.
  //
  // Ce que ça change, mesuré : rien aujourd'hui — `ADMIN` est le seul profil du
  // socle à porter l'un des quatre. Ce que ça empêche : que le premier profil
  // paramétré recevant « paramètres » hérite du journal sans que personne l'ait
  // décidé. Une barrière qui n'arrête que ceux qu'une autre arrête déjà n'est
  // pas une barrière (constat Q-89).
  journal: 'journal',
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
 * Deux niveaux sont rendus, et ils ne servent pas à la même chose :
 *
 *  · **`niveau`** — le plus élevé de tous. Il s'applique aux actions qui ne
 *    visent **aucun** domaine : charger le jeu de données, lire sa propre
 *    session, exporter. `deciderAcces` retombe dessus quand `domaine` vaut
 *    `null`, et c'est le seul cas où il décide encore seul.
 *  · **`niveaux`** — un niveau **par domaine de décision**, qui prime dès que la
 *    route en nomme un. C'est le correctif du constat **Q-66** ; voir l'entête.
 *
 * Une session sans aucun domaine ouvert rend `lecture`, une liste vide et une
 * table vide : `deciderAcces` la refusera sur le domaine, jamais sur le niveau,
 * ce qui donne un journal technique exploitable au lieu d'un « niveau
 * insuffisant » trompeur.
 */
export function projeterDroits(etat: EtatSession): DroitsSession {
  const domaines = new Set<DomaineFonctionnel>();
  // Typé sur `NiveauAcces` — donc SANS « aucun » : le `continue` ci-dessous le
  // retire, et le type le constate au lieu d'un transtypage qui l'affirmerait.
  const niveaux = new Map<DomaineFonctionnel, NiveauAcces>();
  let plusHaut: NiveauDroit = 'aucun';

  for (const [base, niveau] of etat.domaines) {
    if (niveau === 'aucun') continue;
    const projete = DOMAINE_API_PAR_DOMAINE_BASE[base];
    // `null` = ce domaine de base n'a pas d'équivalent dans le vocabulaire de
    // décision des routes. Il n'en ouvre donc aucun — le défaut est fermé.
    if (projete !== null) {
      domaines.add(projete);
      // Plusieurs domaines de base tombent sur le même domaine de décision : on
      // garde le plus haut. Prendre le plus bas refuserait une écriture légitime
      // sur l'un d'eux — voir « ce que ça ne corrige pas », en tête de fichier.
      const deja = niveaux.get(projete);
      if (deja === undefined || RANG[niveau] > RANG[deja]) niveaux.set(projete, niveau);
    }
    if (RANG[niveau] > RANG[plusHaut]) plusHaut = niveau;
  }

  return Object.freeze({
    niveau: (plusHaut === 'aucun' ? 'lecture' : plusHaut) satisfies NiveauAcces,
    domaines: Object.freeze([...domaines]) as readonly DomaineFonctionnel[],
    // `niveaux` est TOUJOURS rendu, même vide. Un champ facultatif qu'on n'émet
    // que « quand on peut » est celui qui a laissé Q-66 ouvert deux tours : le
    // consommateur était juste, et il ne recevait rien.
    niveaux: Object.freeze(Object.fromEntries(niveaux)),
    export: etat.peutExporter,
  });
}
