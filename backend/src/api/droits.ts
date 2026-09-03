/**
 * Le modèle de droits, **tel que le point d'entrée l'applique**.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que ce fichier est, et ce qu'il n'est pas
 * ════════════════════════════════════════════════════════════════════════
 *
 * Le `PLAN_SERVEUR` §3 décrit un droit comme le croisement de **trois axes** :
 * périmètre × profil métier × niveau. Ces trois axes se *résolvent* depuis les
 * groupes Active Directory — c'est le lot L3 côté authentification, et cela
 * n'appartient pas à ce fichier.
 *
 * Ici vit **l'autre moitié** : ce que le serveur fait de ces droits **quand une
 * requête arrive**. Trois choses, et rien d'autre :
 *
 *  1. quel **domaine fonctionnel** une entité met en jeu (`DOMAINE_PAR_ENTITE`) ;
 *  2. quelle **action** une route demande (`ActionDemandee`) ;
 *  3. si les droits de la session **autorisent** cette action sur ce domaine
 *     (`deciderAcces`).
 *
 * La séparation compte : le premier morceau change quand l'annuaire du client
 * change, le second quand le produit gagne une route. Les mélanger obligerait à
 * relire l'AD pour ajouter un écran.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Pourquoi une table écrite à la main, alors que le §19.5 les proscrit
 * ════════════════════════════════════════════════════════════════════════
 *
 * `DOMAINE_PAR_ENTITE` est une liste écrite à la main, et c'est **délibéré** —
 * au titre du `CONVENTIONS.md` §24 : *ce qu'on veut ici n'est pas d'énumérer,
 * c'est d'obliger un humain à trancher.* Le domaine fonctionnel d'une entité est
 * une **décision métier** — « le registre RGPD relève du DPO, pas du RSSI » —
 * qu'aucun catalogue PostgreSQL ne porte et qu'aucune découverte ne peut rendre.
 *
 * Ce qui rend la liste tenable, c'est qu'elle **ne peut pas vieillir en
 * silence** : son type est `Record<NomEntite, DomaineFonctionnel>`. Une entité
 * ajoutée à `NomEntite` sans domaine fait **échouer la compilation**, pas un
 * essai qu'on pourrait ne pas jouer. C'est le garde-fou le plus tôt possible
 * dans la chaîne, et il ne dépend d'aucune discipline.
 *
 * Et le défaut est **fermé** : une entité dont le domaine serait inconnu à
 * l'exécution — cas qui ne peut survenir qu'en contournant les types — est
 * refusée, jamais admise.
 */

import type { NomEntite } from '../entites/types.js';
import { ErreurApplicative } from '../erreurs/index.js';

/* =====================================================================
 *  1. Les trois axes, côté application
 * ===================================================================== */

/**
 * Niveau d'accès — troisième axe du `PLAN_SERVEUR` §3.1.
 *
 * Ordonné : chaque niveau contient le précédent. `validation` n'est encore
 * exercé par aucune route (le circuit d'approbation est le lot L8) ; il est
 * néanmoins déclaré, parce qu'un niveau absent du type serait un niveau qu'un
 * profil AD ne peut pas porter, et le modèle de droits ne se découpe pas en
 * fonction de ce qui est déjà écrit.
 */
export type NiveauAcces = 'lecture' | 'contribution' | 'validation' | 'administration';

/** Rang d'un niveau : sert **uniquement** à la comparaison « au moins ». */
const RANG_NIVEAU: Readonly<Record<NiveauAcces, number>> = Object.freeze({
  lecture: 1,
  contribution: 2,
  validation: 3,
  administration: 4,
});

/**
 * Domaines fonctionnels — deuxième axe. Ce sont les regroupements que les
 * profils du `PLAN_SERVEUR` §3.2 nomment : « le service qualité a besoin des
 * audits et des documents, pas de la cartographie des vulnérabilités ».
 */
export type DomaineFonctionnel =
  /** Tableau de bord, synthèse, échéancier, courbes d'évolution. */
  | 'pilotage'
  /** Référentiels, exigences, évaluations, mesures, correspondances. */
  | 'conformite'
  /** Analyse de risques EBIOS. */
  | 'risques'
  /** Actifs critiques, processus, cartographie des dépendances. */
  | 'actifs'
  /** Plan d'actions et actions préalables (MCO). */
  | 'actions'
  /** Registre des incidents et déclarations NIS2 / RGPD. */
  | 'incidents'
  /** Cellule de crise, scénarios et tests PCA/PRA. */
  | 'continuite'
  /** Politiques et gestion documentaire. */
  | 'documents'
  /** Audits internes et revues de direction. */
  | 'audits'
  /** Donneurs d'ordre et prestataires — la chaîne d'approvisionnement. */
  | 'tiers'
  /** Registre des traitements, article 30. */
  | 'rgpd'
  /** Annuaire des personnes. */
  | 'personnel'
  /** Filiales, droits, paramètres, journal — et la reprise d'un export entier. */
  | 'administration';

/**
 * Action qu'une requête demande. Volontairement **grossière** : un droit fin par
 * route serait une seconde matrice à tenir à jour, et c'est très exactement ce
 * que le `PLAN_SERVEUR` §3.2 refuse (« plutôt qu'une matrice ingérable »).
 */
export type ActionDemandee =
  /**
   * **Aucune session exigée.** Réservé aux routes qui ne peuvent pas en avoir :
   * la connexion elle-même. Ce n'est pas une dérogation glissée dans le crochet,
   * c'est une **déclaration portée par la route** — donc lisible, dénombrable, et
   * refusée par défaut à toute route qui ne la porte pas.
   *
   * Le `CONVENTIONS.md` §26.2 tranche que `src/api/` se contente d'enregistrer le
   * greffon de connexion écrit par la couche d'authentification ; c'est
   * l'enregistrement qui pose cette déclaration, à un seul endroit.
   */
  | 'publique'
  /** Lire des données de gouvernance. */
  | 'lire'
  /** Créer, modifier, supprimer, propager. */
  | 'ecrire'
  /** Extraire un jeu de données hors de l'application (§3.3). */
  | 'exporter'
  /** Acte d'administration : reprise d'un export entier, configuration. */
  | 'administrer';

/**
 * Droits résolus d'une session.
 *
 * ⚠️ **Ce type ne dit pas d'où viennent ces droits**, et c'est le point : il est
 * rempli par la couche d'authentification (lot L3, groupes AD) et **consommé**
 * ici. La règle du `CONVENTIONS.md` §17.4 vaut mot pour mot : une route vérifie
 * un droit, elle ne se l'accorde pas.
 */
export interface DroitsSession {
  /**
   * Niveau du profil sur son périmètre — le **plus élevé** qu'il porte, et celui
   * qui s'applique aux actions transversales (charger le jeu de données,
   * exporter) qui ne visent aucun domaine en particulier.
   */
  readonly niveau: NiveauAcces;
  /** Domaines que le profil ouvre. Un domaine absent est un domaine refusé. */
  readonly domaines: readonly DomaineFonctionnel[];
  /**
   * Niveau **par domaine**, quand la couche d'authentification sait le donner.
   *
   * ── Le défaut que ce champ ferme, et qui l'a trouvé ──────────────────
   *
   * `src/droits/passerelle-api.ts` (agent A1) l'a écrit noir sur blanc en
   * projetant les trente domaines de la base sur les treize d'ici : *« un profil
   * **Qualité** passe le contrôle pour une écriture sur le domaine `conformite`,
   * alors que `session_domaines` ne lui accorde que la **lecture** sur
   * `exigences`, `referentiels` et `mesures` »*. Le constat était juste, et il
   * visait la forme de ce type-ci : un seul niveau pour toute la session ne peut
   * pas exprimer « contribue aux audits, lit la conformité ».
   *
   * Le champ est **facultatif**, et son absence se comporte comme avant : le
   * niveau de la session s'applique partout. Renseigné, il **prime** pour le
   * domaine qu'il nomme — et un domaine qu'il ne nomme pas retombe sur le niveau
   * de la session, jamais sur un accès plus large.
   */
  readonly niveaux?: Readonly<Partial<Record<DomaineFonctionnel, NiveauAcces>>>;
  /**
   * **Droit d'export, distinct de la lecture** (`PLAN_SERVEUR` §3.3, contrôle
   * S7). Un accès Groupe en lecture permet d'extraire, en un clic, la
   * cartographie complète des faiblesses du groupe : l'extraction est donc une
   * permission à part entière, accordée explicitement (`GRC-EXPORT`).
   */
  readonly export: boolean;
}

/* =====================================================================
 *  2. Ce qu'une entité met en jeu
 * ===================================================================== */

/**
 * Domaine fonctionnel de chaque entité métier.
 *
 * `Record<NomEntite, …>` **et non** `Partial<…>` : c'est ce qui fait échouer la
 * compilation le jour où une entité s'ajoute sans que personne ait tranché son
 * domaine. Voir l'entête de ce fichier.
 */
export const DOMAINE_PAR_ENTITE: Readonly<Record<NomEntite, DomaineFonctionnel>> = Object.freeze({
  clients: 'tiers',
  exigences: 'conformite',
  actions: 'actions',
  risques: 'risques',
  actifs: 'actifs',
  processus: 'actifs',
  crise: 'continuite',
  scenarios_pra: 'continuite',
  tests_pra: 'continuite',
  prestataires: 'tiers',
  mco_actions: 'actions',
  audits: 'audits',
  revues: 'audits',
  evaluations: 'conformite',
  mesures: 'conformite',
  incidents: 'incidents',
  documents: 'documents',
  traitements: 'rgpd',
  mappings: 'conformite',
  history: 'pilotage',
  personnes: 'personnel',
});

/** Tous les domaines existants, dérivés du type — jamais recopiés. */
export const TOUS_LES_DOMAINES: readonly DomaineFonctionnel[] = Object.freeze([
  'pilotage',
  'conformite',
  'risques',
  'actifs',
  'actions',
  'incidents',
  'continuite',
  'documents',
  'audits',
  'tiers',
  'rgpd',
  'personnel',
  'administration',
] as const);

/* =====================================================================
 *  3. La décision
 * ===================================================================== */

/** Niveau minimal exigé par chaque action. */
const NIVEAU_MINIMAL: Readonly<Record<ActionDemandee, NiveauAcces>> = Object.freeze({
  // Sans objet : `deciderAcces` n'est jamais appelée pour une route publique —
  // il n'y a pas de session dont on pourrait lire le niveau. La valeur est là
  // pour que le `Record` reste exhaustif, ce qui est le garde-fou du type.
  publique: 'lecture',
  lire: 'lecture',
  // Le droit d'export **n'est pas** un niveau : c'est une permission à part
  // (§3.3). Le niveau minimal reste donc « lecture » — un lecteur autorisé à
  // exporter le peut, un contributeur non autorisé ne le peut pas.
  exporter: 'lecture',
  ecrire: 'contribution',
  administrer: 'administration',
});

/** Le refus, avec ce qu'il faut pour le journaliser sans le dire au client. */
export interface RefusDroit {
  /** Ce que l'utilisateur lit. Ne nomme ni profil, ni groupe AD, ni domaine interne. */
  readonly message: string;
  /** Ce que l'exploitant lit dans le journal technique. */
  readonly detailJournal: string;
}

/**
 * La session a-t-elle le droit de faire **cette action** sur **ce domaine** ?
 *
 * Rend `null` quand c'est autorisé, un `RefusDroit` sinon. Trois contrôles, dans
 * cet ordre — du moins coûteux au plus précis :
 *
 *  1. le **niveau** suffit-il pour l'action ? (un profil *Lecture* qui tente une
 *     écriture est refusé **ici**, donc par le serveur — contrôle S6) ;
 *  2. le **droit d'export**, quand l'action est une extraction (contrôle S7) ;
 *  3. le **domaine** est-il ouvert au profil ?
 *
 * `domaine === null` signifie « l'action ne porte sur aucun domaine identifié » —
 * le cas d'une écriture vers une entité que le registre ne connaît pas. Le
 * contrôle de niveau s'applique quand même ; la route refusera ensuite l'entité
 * pour ce qu'elle est. Ne pas court-circuiter le contrôle de niveau dans ce cas
 * est ce qui empêche « nom d'entité inconnu » de devenir une porte dérobée.
 */
export function deciderAcces(
  droits: DroitsSession,
  action: ActionDemandee,
  domaine: DomaineFonctionnel | null,
): RefusDroit | null {
  if (action === 'publique') return null;

  const requis = NIVEAU_MINIMAL[action];
  // Le niveau qui s'applique est celui du DOMAINE quand il est connu, celui de
  // la session sinon. Jamais le plus favorable des deux : un niveau par domaine
  // sert à RESTREINDRE, et une lecture qui élargirait serait un défaut.
  const effectif = (domaine !== null ? droits.niveaux?.[domaine] : undefined) ?? droits.niveau;
  if (RANG_NIVEAU[effectif] < RANG_NIVEAU[requis]) {
    return {
      message:
        action === 'administrer'
          ? "Cette opération relève de l'administration de l'application. Votre profil ne la " +
            'porte pas.'
          : 'Votre profil vous donne un accès en consultation : vous ne pouvez pas modifier ces ' +
            'données. Contactez votre administrateur si vous devez y contribuer.',
      detailJournal:
        `niveau insuffisant : « ${effectif} » sur ${domaine ?? 'aucun domaine'} pour une action ` +
        `« ${action} » qui exige « ${requis} »`,
    };
  }

  if (action === 'exporter' && !droits.export) {
    return {
      message:
        "L'export des données est une autorisation distincte de la consultation. Votre profil " +
        'ne la porte pas : demandez-la à votre administrateur.',
      detailJournal:
        "droit d'export absent (PLAN_SERVEUR §3.3) : la session lit son périmètre mais ne peut " +
        "pas l'extraire",
    };
  }

  if (domaine !== null && !droits.domaines.includes(domaine)) {
    return {
      message:
        "Votre profil ne donne pas accès à cette partie de l'application. Contactez votre " +
        'administrateur si vous devez y travailler.',
      detailJournal: `domaine « ${domaine} » hors du profil (domaines : ${droits.domaines.join(', ')})`,
    };
  }

  return null;
}

/**
 * Le refus, prêt à partir sur le réseau.
 *
 * Le code est `droit_insuffisant` et le statut **403** — le contrat du
 * `CONVENTIONS.md` §26.2 : *« affiche un refus ; ne déconnecte pas, et ne
 * propose pas de recommencer »*. Il est distinct du **401** `non_authentifie`,
 * qui ouvre l'écran de connexion, et distinct d'`hors_perimetre`, qui dit
 * « cette ligne-ci n'est pas à vous » et non « ce geste-là n'est pas le vôtre ».
 *
 * Le message ne nomme ni le domaine attendu, ni le niveau requis : les énumérer
 * dirait à qui n'y a pas droit **ce qu'il faudrait obtenir**.
 */
export function refuserDroit(refus: RefusDroit): ErreurApplicative {
  return new ErreurApplicative({
    code: 'droit_insuffisant',
    statut: 403,
    message: refus.message,
    detailJournal: refus.detailJournal,
  });
}

/**
 * Droits d'un profil qui peut tout, sur tout — **et le mot « tout » est le
 * problème** : cette valeur n'est pas un profil du `PLAN_SERVEUR` §3.2, c'est la
 * doublure de la session provisoire tant que l'authentification n'existe pas.
 *
 * Elle est acceptable pour une raison, et une seule : la session provisoire
 * **refuse de résoudre quoi que ce soit hors du développement**
 * (`session.ts`, barrière *fail-closed*). En production comme en recette, aucune
 * requête n'atteint donc ces droits — le serveur répond 503 avant.
 *
 * Elle disparaît avec la session provisoire.
 */
export const DROITS_PROVISOIRES_DEVELOPPEMENT: DroitsSession = Object.freeze({
  niveau: 'administration',
  domaines: TOUS_LES_DOMAINES,
  export: true,
});

/* =====================================================================
 *  4. Ce qu'une route déclare — et pourquoi elle est OBLIGÉE de le déclarer
 * ===================================================================== */

/**
 * Classe d'accès d'une route, **portée par la route elle-même**.
 *
 * ── Pourquoi sur la route, et non dans une table à côté ─────────────────
 *
 * Une table « chemin → droit » tenue à part est un annuaire au sens du
 * `CONVENTIONS.md` §19.5 : elle ne dit rien du jour où une route s'ajoute, elle
 * l'ignore **en silence**, et la route neuve est servie sans contrôle. C'est la
 * forme exacte du défaut que la grille appelle S6 — *aucun point d'entrée sans
 * contrôle*.
 *
 * Déclarée dans les options de la route, la classe d'accès voyage avec elle :
 * l'oubli n'est plus une omission invisible mais **une route qui ne fonctionne
 * pas**, parce que le crochet `onRequest` refuse ce qu'il ne sait pas classer.
 * Un garde-fou dont l'oubli se voit à la première requête vaut mieux qu'une
 * liste dont l'oubli se voit à la porte de sécurité suivante.
 */
export interface DeclarationAcces {
  readonly action: ActionDemandee;
  /**
   * Domaine mis en jeu :
   *  · un domaine fixe, quand la route en vise un seul ;
   *  · `'selon-entite'` quand il se déduit du paramètre d'URL `:entite` ;
   *  · `null` quand la route est transversale (le chargement du jeu de données
   *    entier, la description du modèle) — le **niveau** et, pour un export, le
   *    droit d'export restent alors les seuls contrôles, et le filtrage par
   *    domaine se fait sur le contenu rendu, pas sur l'accès à la route.
   */
  readonly domaine: DomaineFonctionnel | 'selon-entite' | null;
}

/**
 * Entités qu'un profil a le droit de **lire**, dérivées de ses domaines.
 *
 * C'est ce qui rend le contrôle S6 vrai en lecture aussi : un profil *Qualité*
 * ne doit pas « ne pas voir » la cartographie des vulnérabilités parce que son
 * menu la cache — il ne doit pas la **recevoir**. Le chargement initial livre
 * donc des collections vides pour les domaines qu'il n'a pas.
 */
export function entitesLisibles(droits: DroitsSession): ReadonlySet<NomEntite> {
  const ouvertes = new Set<NomEntite>();
  for (const [entite, domaine] of Object.entries(DOMAINE_PAR_ENTITE) as [
    NomEntite,
    DomaineFonctionnel,
  ][]) {
    if (droits.domaines.includes(domaine)) ouvertes.add(entite);
  }
  return ouvertes;
}
