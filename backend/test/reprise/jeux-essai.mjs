/**
 * Jeux d'essai de la reprise `grc-backup`.
 *
 * Le dépôt ne contient **aucune donnée de démonstration** et ne doit pas en
 * contenir (brief produit) : tous les fichiers d'essai sont fabriqués ici, en
 * mémoire, à partir de valeurs manifestement fictives.
 *
 * Ce fichier n'expose que des fabriques — il ne déclare aucun test.
 */

/**
 * Horloge figée : `createdAt` de l'enveloppe devient reproductible.
 *
 * ── Ce qui a disparu ici, et pourquoi ────────────────────────────────────────
 *
 * Une source d'`alea` était injectée à côté de l'horloge, pour que les
 * identifiants engendrés par la reprise soient prévisibles (`CLI-1720000000000-482`)
 * et donc assertables au caractère près. Le correctif du constat Q-1 a supprimé le
 * besoin : le module ne TIRE plus, il DÉRIVE d'une empreinte de ce qui distingue
 * l'enregistrement dans son fichier. La reproductibilité n'est plus à organiser,
 * elle est acquise — et l'option `alea` n'était plus lue par personne.
 *
 * Une option documentée que rien ne lit est pire qu'absente : le chantier l'a déjà
 * payé une fois (constat m-2, `API_FILIALE_PROVISOIRE`). Elle est donc retirée
 * plutôt que conservée par prudence.
 */
export const OPTIONS_FIGEES = Object.freeze({
  horloge: () => 1_720_000_000_000,
});

/**
 * Un identifiant engendré par la reprise est-il de la bonne forme ?
 *
 * On éprouve la PROPRIÉTÉ et non la valeur : le préfixe de l'entité, la marque
 * « -d- » (dérivé du fichier, à ne pas confondre avec le « -r- » des ré-émissions
 * du serveur), et la recevabilité par le domaine `id_metier` du schéma. La valeur
 * exacte, elle, est une empreinte : l'épingler ferait de chaque amélioration du
 * générateur une fausse alerte.
 */
export function estIdentifiantEngendre(prefixe, identifiant) {
  return (
    typeof identifiant === 'string' &&
    identifiant.startsWith(`${prefixe}-d-`) &&
    identifiant.length > prefixe.length + 3 &&
    identifiant.length <= 64 &&
    identifiant.trim() === identifiant &&
    !identifiant.includes(',')
  );
}

/**
 * Collections apparues à chaque version, dans l'ordre du portage.
 * Une v1 ne portait ni audits ni revues (ils vivaient dans deux clés
 * localStorage séparées) ; ils entrent à la v2, et ainsi de suite.
 */
const NOUVELLES_PAR_VERSION = {
  1: [
    'clients', 'exigences', 'actions', 'risques', 'actifs', 'processus',
    'crise', 'scenarios_pra', 'tests_pra', 'prestataires', 'mco_actions',
  ],
  2: ['audits', 'revues'],
  3: ['evaluations', 'mesures'],
  4: ['incidents'],
  5: ['documents'],
  6: ['traitements'],
  7: ['mappings'],
  8: ['history'],
  9: [],
  10: [],
  11: ['personnes'],
  12: [],
  // v13 — socle de risques du Groupe, et activation des référentiels par filiale.
  13: ['risque_catalogue', 'referentiels_actifs'],
  // v14 — les dérogations datées (action 19.2).
  14: ['derogations'],
  // ⚠️ v15 n'ajoute AUCUNE collection : elle ajoute un CHAMP (`documents[].mesures_ids`).
  // La table dit quelles collections apparaissent, et zéro est une réponse.
  15: [],
  // v16 non plus : cinq CHAMPS sur les mesures (efficacité, rythme de rejeu).
  16: [],
  // v17 — les analyses d'impact RGPD (article 35, action 20.3). ⚠️ Elles POINTENT
  // le registre de l'article 30 : la collection ne porte aucun champ de
  // `traitements`, seulement `traitement_id`.
  17: ['analyses_impact'],
  // v18 — les demandes d'exercice de droits (action 20.4).
  18: ['demandes_droits'],
  // v19 — la chaîne de sous-traitance des tiers (action 21.1). ⚠️ La v19 ajoute
  // AUSSI quatorze champs à `prestataires` (registre DORA, suivi contractuel) :
  // la table ne dit que les COLLECTIONS, et des champs n'en font pas une.
  19: ['prestataire_sous_traitance'],
  // v20 — le questionnaire fournisseur (action 21.2) : l'envoi et les réponses.
  20: ['questionnaires_tiers', 'questionnaire_reponses'],
  // v21 — les campagnes descendantes (L24, actions 24.1 et 24.2) : la DEMANDE du Groupe,
  // puis la PART de chaque filiale. ⚠️ L'ordre compte : la part référence la campagne, et
  // la clé est en `restrict` (§18.2) — une reprise qui les inverserait échouerait sur la
  // clé étrangère, pas en silence.
  21: ['campagnes', 'campagne_filiales'],
  // v22 — les ateliers 1 et 2 d'EBIOS RM (lot L25, actions 25.1, 25.2 et 25.5).
  // ⚠️ L'ordre suit les clés étrangères : la base de connaissances d'abord (les couples
  // source / objectif la référencent), puis l'étude, puis ce qui pend à elle — et les
  // événements redoutés APRÈS les valeurs métier, qu'ils référencent.
  //
  // ⚠️ **La collection `risques` n'apparaît PAS ici, et c'est tout le lot** : EBIOS RM
  // s'ajoute à la cotation F × G × M, il ne la remplace pas. Une v22 porte les deux.
  22: [
    'ebios_connaissances',
    'ebios_etudes',
    'ebios_valeurs_metier',
    'ebios_evenements_redoutes',
    'ebios_sources_risque',
  ],
  // v23 — les ateliers 3, 4 et 5. ⚠️ L'ordre suit les clés : les parties prenantes avant
  // les chemins qui les traversent, et ceux-ci avant les modes opératoires.
  23: [
    'ebios_parties_prenantes',
    'ebios_scenarios_strategiques',
    'ebios_scenarios_operationnels',
  ],
};

/** Collections que porte un export produit par la version `v`. */
export function collectionsDeLaVersion(v) {
  const noms = [];
  for (let i = 1; i <= v; i += 1) noms.push(...NOUVELLES_PAR_VERSION[i]);
  return noms;
}

/**
 * Instantané minimal d'une version donnée : toutes les collections de cette
 * version, vides, sauf celles fournies dans `surcharges`.
 */
export function instantane(version, surcharges = {}) {
  const charge = { schemaVersion: version };
  for (const nom of collectionsDeLaVersion(version)) charge[nom] = [];
  for (const [nom, valeur] of Object.entries(surcharges)) charge[nom] = valeur;
  return charge;
}

/** Enveloppe `grc-backup` en clair, au format de `buildEnvelope()` du frontend. */
export function enveloppe(version, charge, extra = {}) {
  return {
    format: 'grc-backup',
    version,
    app: 'cyber-grc-dedienne',
    createdAt: '2026-08-31T09:00:00.000Z',
    encrypted: false,
    payload: charge,
    ...extra,
  };
}

/** Enveloppe sérialisée — l'entrée réelle de la reprise. */
export function fichier(version, charge, extra = {}) {
  return JSON.stringify(enveloppe(version, charge, extra));
}

/**
 * Instantané v12 **sain et complet** : les 21 collections peuplées, tous les
 * champs du modèle documenté, identifiants au format canonique, listes fermées
 * respectées, aucune clé étrangère orpheline.
 *
 * C'est le témoin du portage : il doit traverser la chaîne sans être modifié et
 * sans produire le moindre avertissement.
 */
export function instantaneV12Complet() {
  return {
    schemaVersion: 12,
    updatedAt: 1_720_000_000_000,
    clients: [{ id: 'CLI-1720000000000-101', nom: 'Donneur d’ordre fictif', secteur: 'Aéronautique' }],
    exigences: [
      {
        id: 'EX-1720000000000-102',
        client_id: 'CLI-1720000000000-101',
        code: 'A.5.1',
        intitule: 'Politique de sécurité de l’information',
        statut_conformite: 'partiellement conforme',
        responsable: 'Personne fictive',
        commentaire: 'À reprendre lors de la revue.',
      },
    ],
    // ── UNE action, UN rattachement ────────────────────────────────────────
    //
    // Ce jeu d'essai portait une action rattachée AUX CINQ parents à la fois. Le
    // modèle n'admet pas cela : une action est liée à L'UN de — exigence, risque,
    // évaluation, incident ou mesure (`docs/DATA_MODEL.md`), et le schéma l'encode
    // depuis le lot L1 (`ck_actions_rattachement`, `002_metier_noyau.sql`). Le
    // navigateur n'en produit jamais d'autre : chaque module rattache l'action à
    // l'objet depuis lequel on la crée.
    //
    // Tant que ce jeu ne servait qu'au PORTAGE — lire un fichier, le monter de v1 à
    // v12, le réécrire — l'anomalie ne se voyait pas : le module de reprise ne
    // connaît aucune règle métier, et il a raison de n'en connaître aucune. Elle est
    // apparue le jour où le même jeu a traversé la route de reprise jusqu'à
    // PostgreSQL, qui l'a refusé (`test/api/reprise-route.test.mjs`).
    //
    // La leçon, et c'est elle qui compte : **un jeu d'essai qui ne pourrait pas
    // exister en base fait mesurer autre chose que le produit.** Les tests de
    // round-trip passaient sur un enregistrement impossible ; ils prouvaient donc
    // moins qu'ils n'en avaient l'air.
    //
    // Les cinq rattachements sont conservés — un par action — pour que le
    // VOCABULAIRE du jeu reste complet : `test/base/vocabulaire.test.mjs` balaie
    // l'union des champs d'une collection, et perdre quatre champs ici l'aveuglerait
    // sur quatre colonnes.
    actions: [
      {
        id: 'ACT-1720000000000-103',
        titre: 'Rédiger la PSSI',
        statut: 'en cours',
        responsable: 'Personne fictive',
        echeance: '2026-12-31',
        priorite: 'Haute',
        commentaire: 'Plan en cours de relecture.',
        exigence_id: 'EX-1720000000000-102',
      },
      {
        id: 'ACT-1720000000000-121',
        titre: 'Chiffrer les postes nomades',
        statut: 'à faire',
        responsable: 'Personne fictive',
        echeance: '2027-03-31',
        priorite: 'Critique',
        commentaire: 'Traite le risque de perte de matériel.',
        risque_id: 'RISK-1720000000000-104',
      },
      {
        id: 'ACT-1720000000000-122',
        titre: 'Documenter la mesure évaluée',
        statut: 'à faire',
        responsable: 'Personne fictive',
        echeance: '2027-06-30',
        priorite: 'Moyenne',
        commentaire: 'Suite de l’auto-évaluation ANSSI.',
        evaluation_id: 'EVAL-1720000000000-114',
      },
      {
        id: 'ACT-1720000000000-123',
        titre: 'Clore l’incident et en tirer le retour d’expérience',
        statut: 'en cours',
        responsable: 'Personne fictive',
        echeance: '2026-11-30',
        priorite: 'Haute',
        commentaire: 'Action corrective de l’incident.',
        incident_id: 'INC-1720000000000-116',
      },
      {
        id: 'ACT-1720000000000-124',
        titre: 'Déployer le chiffrement des postes',
        statut: 'terminée',
        responsable: 'Personne fictive',
        echeance: '2026-09-30',
        priorite: 'Basse',
        commentaire: 'Plan d’action porté par la mesure de sécurité.',
        mesure_id: 'MESURE-1720000000000-115',
      },
    ],
    risques: [
      {
        id: 'RISK-1720000000000-104',
        nom: 'Chiffrement des postes absent',
        description: 'Scénario fictif de perte de matériel.',
        f_frequence: 3,
        g_gravite: 4,
        m_maitrise: 0.7,
        score_brut: 12,
        score_residuel: 8.4,
        niveau: 'critique',
        exigences_liees: ['EX-1720000000000-102'],
      },
    ],
    actifs: [
      {
        id: 'ACTIF-1720000000000-105',
        nom: 'Serveur de fichiers',
        type: 'Matériel',
        criticite: 'élevée',
        responsable: 'Personne fictive',
        description: 'Actif fictif.',
        risques_lies: ['RISK-1720000000000-104'],
        dependances: [{ to: 'ACTIF-1720000000000-106', type: 'hosted' }],
      },
      {
        id: 'ACTIF-1720000000000-106',
        nom: 'Hyperviseur',
        type: 'Service',
        criticite: 'critique',
        responsable: 'Personne fictive',
        description: 'Actif fictif.',
        risques_lies: [],
        dependances: [],
      },
    ],
    processus: [
      {
        id: 'BIA-1720000000000-107',
        nom: 'Facturation',
        criticite: 'Critique',
        rto: '4 heures',
        rpo: '24 heures',
        responsable: 'Personne fictive',
        description: 'Processus fictif.',
        actifs_lies: ['ACTIF-1720000000000-105'],
      },
    ],
    crise: [
      {
        id: 'CRISE-1720000000000-108',
        role: 'Coordinateur de crise',
        nom: 'Personne fictive',
        telephone: '0000000000',
        email: 'contact@exemple.invalid',
        suppleant: 'Autre personne fictive',
        notes: '',
      },
    ],
    scenarios_pra: [
      {
        id: 'SCEN-1720000000000-109',
        nom: 'Rançongiciel sur le serveur de fichiers',
        description: 'Scénario fictif.',
        etapes_pca: [
          {
            titre: 'Isoler le réseau',
            realisateur: 'IT',
            responsable: 'RSSI',
            consulte: 'Direction',
            informe: 'Tous',
            actifs: 'Serveur de fichiers',
            duree: '1 h',
            statut: 'À faire',
          },
        ],
        etapes_pra: [],
      },
    ],
    tests_pra: [
      {
        id: 'TEST-1720000000000-110',
        scenario_id: 'SCEN-1720000000000-109',
        date: '2026-06-15',
        succes: 'Oui',
        type_test: 'Théorique (Sur table)',
        bilan: 'Exercice fictif concluant.',
      },
    ],
    prestataires: [
      {
        id: 'PREST-1720000000000-111',
        societe: 'Prestataire fictif',
        type: 'Prestataire IT / Cloud',
        phone: '0000000000',
        email: 'contact@exemple.invalid',
        notes: '',
        criticite: 'forte',
        acces: 'etendu',
        supplyChain: { clause: true, notif: true, audit: false, donnees: false, reversibilite: false, continuite: false },
      },
    ],
    mco_actions: [
      {
        id: 'MCO-1720000000000-112',
        titre: 'Vérifier les restaurations',
        description: 'Action fictive.',
        responsable: 'Personne fictive',
        frequence: 'Trimestrielle',
        priorite: 'Haute',
        datePrevue: '2026-09-30',
        dateReelle: '',
        dateCloture: '',
        statut: 'En cours',
        avancement: 40,
        commentaire: '',
      },
    ],
    audits: [
      {
        id: 'AUD-1720000000000-113',
        ref: 'AUD-2026-01',
        statut: 'Réalisé',
        date: '2026-05-01',
        perimetre: 'Périmètre fictif',
        auditeur: 'Personne fictive',
        audite: 'Autre personne fictive',
        synthese: 'Synthèse fictive.',
        constats: [{ type: 'Mineure', exigence: 'A.5.1', desc: 'Constat fictif.' }],
        ref_id: 'anssi-hygiene',
        items: [
          {
            code: '1',
            domaine: 'Sensibiliser',
            intitule: 'Former les équipes',
            aide: '',
            ctrl: 'Vérifier le plan de formation',
            preuve: 'Feuilles d’émargement',
            type: 'conforme',
            constat: 'Constat fictif.',
          },
        ],
      },
    ],
    revues: [
      {
        id: 'REV-1720000000000-120',
        date: '2026-03-01',
        participants: 'Personne fictive\nAutre personne fictive',
        inputs: 'Ordre du jour fictif.',
        outputs: '- Décision fictive',
      },
    ],
    evaluations: [
      {
        id: 'EVAL-1720000000000-114',
        ref_id: 'anssi-hygiene',
        code: '22',
        statut: 'partiellement conforme',
        maturite: 3,
        commentaire: 'Commentaire fictif.',
        preuves: 'Référence fictive.',
        mesure_ids: ['MESURE-1720000000000-115'],
        updatedAt: 1_720_000_000_000,
      },
    ],
    mesures: [
      {
        id: 'MESURE-1720000000000-115',
        nom: 'Chiffrement des postes de travail',
        description: 'Contrôle fictif.',
        statut: 'partiellement conforme',
        maturite: 3,
        responsable: 'Personne fictive',
        updatedAt: 1_720_000_000_000,
      },
    ],
    incidents: [
      {
        id: 'INC-1720000000000-116',
        titre: 'Tentative d’hameçonnage',
        type: 'Hameçonnage',
        gravite: 'moyenne',
        statut: 'résolu',
        date_detection: '2026-04-02',
        date_resolution: '2026-04-03',
        description: 'Incident fictif.',
        actions_immediates: 'Blocage fictif.',
        cause_racine: 'Cause fictive.',
        actifs_touches: ['ACTIF-1720000000000-105'],
        risque_id: 'RISK-1720000000000-104',
        declaration_anssi: 'non requise',
        declaration_cnil: 'non requise',
        updatedAt: 1_720_000_000_000,
      },
    ],
    documents: [
      {
        id: 'DOC-1720000000000-117',
        titre: 'Politique de sécurité (fictive)',
        type: 'Politique de sécurité (PSSI)',
        version: '1.0',
        proprietaire: 'Personne fictive',
        statut: 'en vigueur',
        date_revue: '2027-01-31',
        emplacement: 'Serveur de fichiers fictif',
        referentiels: ['anssi-hygiene'],
        notes: '',
        updatedAt: 1_720_000_000_000,
      },
    ],
    traitements: [
      {
        id: 'TRT-1720000000000-118',
        nom: 'Gestion de la paie (fictive)',
        finalite: 'Finalité fictive.',
        base_legale: 'Obligation légale',
        responsable: 'Personne fictive',
        personnes_concernees: 'Salariés',
        categories_donnees: 'Identité, coordonnées',
        donnees_sensibles: false,
        destinataires: 'Service RH',
        transfert_hors_ue: 'Non',
        duree_conservation: '5 ans',
        mesures_ids: ['MESURE-1720000000000-115'],
        notes: '',
        updatedAt: 1_720_000_000_000,
      },
    ],
    mappings: [
      {
        id: 'MAP-1720000000000-119',
        theme: 'Chiffrement',
        aide: 'Note pédagogique fictive.',
        refs: { 'anssi-hygiene': ['22'], 'iso-27002-2022': ['A.8.24'] },
      },
    ],
    history: [
      {
        id: 'HIST-1720000000000-121',
        ts: 1_720_000_000_000,
        date: '2026-08-30',
        metrics: {
          conformite: 62,
          maturite: 2.8,
          expo: 41,
          risques_crit: 3,
          actions_retard: 2,
          avancement: 55,
          incidents_ouverts: 1,
        },
      },
    ],
    personnes: [
      {
        id: 'PERS-1720000000000-122',
        nom: 'Personne fictive',
        fonction: 'RSSI',
        service: 'Sécurité',
        email: 'contact@exemple.invalid',
        telephone: '0000000000',
        notes: '',
      },
    ],
  };
}

/**
 * Le même instantané, **en version courante (v13)**.
 *
 * ── Pourquoi les DEUX existent ───────────────────────────────────────────────
 *
 * `instantaneV12Complet()` reste : un export v12 est un fichier RÉEL, que des
 * postes ont produit et qu'il faut savoir reprendre — il doit traverser
 * exactement un palier et y gagner ses deux collections. Celui-ci sert la
 * question inverse, et la plus facile à laisser dériver : **un export à la
 * version courante ne doit traverser AUCUN palier et ne subir AUCUNE
 * modification.** Employer un v12 pour cette question-là la rendrait fausse au
 * premier ajout de collection — c'est arrivé le 04/09/2026.
 *
 * Les deux collections portent une ligne, pas un tableau vide : un round-trip
 * qui ne transporte rien ne prouve pas qu'il transporte bien.
 */
/**
 * Le même instantané, **en version courante (v14)**.
 *
 * ⚠️ `instantaneV13Complet()` reste, et il ne faut pas le « rattraper » : il
 * porte la question *« un v13 traverse-t-il exactement un palier et y gagne-t-il
 * sa collection ? »*, qui est celle d'un fichier RÉEL produit par un poste. Celui-ci
 * porte la question inverse — *« un export à la version courante ne traverse AUCUN
 * palier et ne subit AUCUNE modification »* —, et c'est elle qui dérive en silence
 * au premier ajout de collection. C'est arrivé le 04/09/2026, puis de nouveau à la
 * v14 : d'où deux jeux, et non un seul qu'on renumérote.
 */
/**
 * Le même instantané, **en version courante (v15)**.
 *
 * ⚠️ Il ne gagne pas une collection mais un CHAMP : `documents[].mesures_ids`, la liste
 * des contrôles qu'un document prouve (action 19.3). Le jeu lui en donne un **non vide** —
 * un round-trip qui ne transporte rien ne prouve pas qu'il transporte bien.
 */
/**
 * Le même instantané, **en version courante (v16)**.
 *
 * ⚠️ Cinq CHAMPS de plus sur les mesures — l'efficacité (19.6) et le rythme de rejeu
 * (19.5) —, et le jeu leur donne des valeurs NON VIDES : un round-trip qui ne transporte
 * rien ne prouve pas qu'il transporte bien. La ligne choisie est celle qui fait tout
 * l'intérêt de l'action 19.6 : **maturité 4 et efficacité « inefficace »** — documenté,
 * planifié, supervisé… et la restauration échoue.
 */
/**
 * Instantané COMPLET à la version courante — v17.
 *
 * ⚠️ L'analyse d'impact POINTE un traitement du même instantané
 * (`TRT-1720000000000-118`) : c'est ce lien-là qui doit survivre au round-trip,
 * et un identifiant inventé ne mesurerait rien. Elle ne recopie AUCUN champ du
 * registre de l'article 30 — c'est le critère d'acceptation de l'action 20.3.
 */
/**
 * Instantané COMPLET à la version courante — v18.
 *
 * ⚠️ La demande d'exercice de droits emporte les données personnelles d'un TIERS
 * — la personne qui exerce ses droits. C'est délibéré et nécessaire : un export
 * qui perdrait le nom perdrait la preuve d'avoir répondu à quelqu'un.
 */
export function instantaneV18Complet() {
  return {
    ...instantaneV17Complet(),
    schemaVersion: 18,
    demandes_droits: [
      {
        id: 'DSAR-1720000000000-205',
        type_demande: 'acces',
        recue_le: '2026-02-03',
        canal: 'courriel',
        demandeur: 'Mme Aline Ferrand',
        contact: 'aline.ferrand@exemple.test',
        identite_verifiee: true,
        identite_verifiee_le: '2026-02-04',
        prorogee: false,
        prorogee_le: null,
        prorogation_motif: null,
        statut: 'repondue',
        repondue_le: '2026-02-20',
        reponse_resume: 'Copie des données de paie adressée par courrier recommandé.',
        motif_refus: null,
        traitement_id: 'TRT-1720000000000-118',
      },
    ],
  };
}

/**
 * Instantané COMPLET à la version courante — v19.
 *
 * ⚠️ **La chaîne de sous-traitance relie DEUX prestataires du même instantané**, et
 * c'est ce lien-là qui doit survivre au round-trip : un identifiant inventé ne
 * mesurerait rien. Il a donc fallu un SECOND prestataire — l'instantané n'en portait
 * qu'un depuis la v1, et une arête a besoin de deux bouts.
 *
 * ⚠️ Et le tiers porte ses champs du registre DORA (21.1) et de son suivi contractuel
 * (21.3). Le SCORE, lui, n'y est pas : il se dérive côté serveur, et le figer dans un
 * fichier rendrait « faible », six mois plus tard, un tiers que personne n'a réévalué.
 */
export function instantaneV19Complet() {
  const base = instantaneV18Complet();
  return {
    ...base,
    schemaVersion: 19,
    prestataires: [
      {
        ...base.prestataires[0],
        lei: '969500HX7PZQ1L2M3N45',
        pays: 'FR',
        fonction_supportee: 'Hébergement de l’ERP de production',
        fonction_critique: true,
        type_service: 'cloud_iaas',
        pays_donnees: 'IE',
        substituabilite: 'difficile',
        contrat_reference: 'CTR-2024-018',
        contrat_debut: '2024-01-01',
        contrat_fin: '2027-12-31',
        contrat_revue_le: '2026-11-30',
        plan_sortie: 'Réversibilité par export mensuel chiffré ; bascule vers le socle interne.',
        plan_sortie_le: '2026-06-30',
        evalue_le: '2026-01-15',
      },
      {
        id: 'PREST-1720000000000-206',
        societe: 'Sauvegardes Atlantique',
        type: 'Prestataire IT / Cloud',
        phone: null,
        email: null,
        notes: null,
        criticite: 'forte',
        acces: 'limite',
        supplyChain: {},
        lei: null,
        pays: 'FR',
        fonction_supportee: 'Sauvegarde externalisée de l’ERP',
        fonction_critique: true,
        type_service: 'hebergement',
        pays_donnees: 'FR',
        substituabilite: 'facile',
        contrat_reference: null,
        contrat_debut: null,
        contrat_fin: null,
        contrat_revue_le: null,
        plan_sortie: null,
        plan_sortie_le: null,
        evalue_le: null,
      },
    ],
    prestataire_sous_traitance: [
      {
        id: 'SOUS-1720000000000-207',
        prestataire_id: 'PREST-1720000000000-111',
        sous_traitant_id: 'PREST-1720000000000-206',
        service: 'Sauvegarde et restauration des volumes de l’ERP',
        dans_fonction_critique: true,
      },
    ],
  };
}

/**
 * Instantané COMPLET à la version courante — v20.
 *
 * ⚠️ **Les réponses pointent l'envoi, et l'envoi pointe un prestataire du même
 * instantané** : c'est cette double jointure qui doit survivre au round-trip. Un
 * identifiant inventé ne mesurerait rien.
 *
 * ⚠️ Et le questionnaire ne porte AUCUN texte de question : `code` fait la
 * jointure avec le catalogue du référentiel. C'est le critère d'acceptation de
 * l'action 21.2, et il vaut aussi pour le format d'échange.
 */
export function instantaneV21Complet() {
  const base = instantaneV20Complet();
  return {
    ...base,
    schemaVersion: 21,
    campagnes: [
      {
        id: 'CAMP-1720000000000-210',
        ref_id: 'anssi-hygiene',
        intitule: 'Hygiène ANSSI — campagne annuelle du Groupe',
        ouverte_le: '2026-01-15',
        echeance: '2026-06-30',
        close_le: null,
        notes: 'Décidée en comité de direction du 12 janvier.',
      },
    ],
    campagne_filiales: [
      {
        id: 'CAMPF-1720000000000-211',
        campagne_id: 'CAMP-1720000000000-210',
        repondant: 'Marie Dupont',
        accuse_le: '2026-01-20',
        termine_le: null,
        notes: 'Deux chapitres restent à évaluer.',
      },
    ],
  };
}

/**
 * Instantané COMPLET à la version courante — v23.
 *
 * Les trois collections des ateliers 3, 4 et 5, chaînées **dans le même instantané** :
 * la partie prenante appartient à l'étude, le chemin relie le couple RETENU à l'événement
 * redouté en passant par elle, et le mode opératoire pend au chemin.
 *
 * ⚠️ **Le mode opératoire se rattache au RISQUE du jeu d'essai** (`RISK-…`), et c'est ce
 * lien qui doit survivre au round-trip : il est la seule chose qui relie EBIOS RM au
 * registre F × G × M — et c'est un LIEN, pas une conversion. La collection `risques` du
 * même instantané n'en porte aucune trace, ce qui est exactement le critère 25.1.
 *
 * ⚠️ Et **aucun NIVEAU ne voyage** : ni celui de la partie prenante, ni celui du mode
 * opératoire, ni la gravité du chemin. Les faire voyager les figerait au jour de l'export.
 */
export function instantaneV23Complet() {
  const base = instantaneV22Complet();
  return {
    ...base,
    schemaVersion: 23,
    ebios_parties_prenantes: [
      {
        id: 'EBPP-1720000000000-219',
        etude_id: 'EBET-1720000000000-214',
        nom: 'Mainteneur de la supervision',
        categorie: 'fournisseur',
        prestataire_id: 'PREST-1720000000000-111',
        dependance: 4,
        penetration: 3,
        maturite: 2,
        confiance: 2,
        notes: 'Accès distant permanent, contrat renouvelé en 2025.',
      },
    ],
    ebios_scenarios_strategiques: [
      {
        id: 'EBSS-1720000000000-220',
        etude_id: 'EBET-1720000000000-214',
        source_id: 'EBSR-1720000000000-217',
        evenement_redoute_id: 'EBER-1720000000000-216',
        partie_prenante_id: 'EBPP-1720000000000-219',
        nom: 'Le cybercriminel passe par le mainteneur de la supervision',
        chemin: 'Accès distant du mainteneur, puis rebond vers l’ordonnancement.',
        notes: null,
      },
    ],
    ebios_scenarios_operationnels: [
      {
        id: 'EBSO-1720000000000-221',
        scenario_strategique_id: 'EBSS-1720000000000-220',
        nom: 'Hameçonnage ciblé du compte de maintenance',
        mode_operatoire: 'Courriel façonné depuis des sources ouvertes, puis élévation.',
        connaissance_id: 'EBCO-1720000000000-213',
        actif_id: 'ACTIF-1720000000000-105',
        vraisemblance: 3,
        decision: 'reduire',
        justification_decision: null,
        // ⚠️ Le lien vers le registre F × G × M du MÊME instantané.
        risque_id: 'RISK-1720000000000-104',
        notes: null,
      },
    ],
  };
}

/**
 * Instantané COMPLET en v22.
 *
 * Les cinq collections des ateliers 1 et 2 d'EBIOS RM (lot L25, actions 25.1, 25.2
 * et 25.5), chacune reliée à la précédente DANS LE MÊME INSTANTANÉ : c'est cette
 * chaîne — étude → valeur métier → événement redouté, et étude → couple source /
 * objectif → base de connaissances — qui doit survivre au round-trip. Un
 * identifiant inventé ne mesurerait rien.
 *
 * ⚠️ **La valeur métier pointe le processus du BIA du même jeu d'essai**
 * (`BIA-1720000000000-107`), et ce n'est pas un détail : c'est le lien que
 * l'action 25.2 exige — *on POINTE le BIA, on ne le recopie pas*. Ni criticité,
 * ni RTO, ni RPO ne figurent ici.
 *
 * ⚠️ **Et aucun couple ne porte sa PERTINENCE.** Elle se dérive de ses trois
 * critères côté serveur (`f_ebios_pertinence`). La faire voyager la figerait au
 * jour de l'export, alors que l'animateur révise ses critères en séance — et un
 * fichier repris six mois plus tard classerait les couples sur des notes périmées.
 */
export function instantaneV22Complet() {
  const base = instantaneV21Complet();
  return {
    ...base,
    schemaVersion: 22,
    ebios_connaissances: [
      {
        id: 'EBCO-1720000000000-212',
        genre: 'source_risque',
        reference: 'SR-01',
        nom: 'Cybercriminel organisé',
        objectif_vise: 'Obtenir une rançon',
        phase: null,
        categorie: 'Rançongiciel',
        description: 'Groupe structuré opérant par affiliation, motivé par le gain.',
        origine: 'sectoriel',
        statut: 'active',
        archive_le: null,
      },
      {
        id: 'EBCO-1720000000000-213',
        genre: 'mode_operatoire',
        reference: 'MO-01',
        nom: 'Hameçonnage ciblé d’un compte à privilèges',
        objectif_vise: null,
        phase: 'rentrer',
        categorie: 'Accès initial',
        description: 'Courriel façonné à partir de sources ouvertes.',
        origine: 'interne',
        statut: 'active',
        archive_le: null,
      },
    ],
    ebios_etudes: [
      {
        id: 'EBET-1720000000000-214',
        nom: 'Atelier EBIOS RM — chaîne de production, exercice 2026',
        perimetre: 'Le site de production et son système de supervision. Hors périmètre : la paie.',
        cadre: 'Demandé par la direction industrielle. Animé en quatre demi-journées.',
        responsable: 'Marie Dupont',
        statut: 'en_cours',
        debut_le: '2026-02-03',
        validee_le: null,
        notes: 'Atelier 2 terminé, atelier 3 à programmer.',
      },
    ],
    ebios_valeurs_metier: [
      {
        id: 'EBVM-1720000000000-215',
        etude_id: 'EBET-1720000000000-214',
        nom: 'Ordonnancement de la production',
        nature: 'processus',
        // ⚠️ Le processus du BIA du même instantané : c'est le lien de l'action 25.2.
        processus_id: 'BIA-1720000000000-107',
        responsable: 'Marie Dupont',
        description: 'Décide ce qui est fabriqué, dans quel ordre, sur quelle ligne.',
      },
    ],
    ebios_evenements_redoutes: [
      {
        id: 'EBER-1720000000000-216',
        valeur_metier_id: 'EBVM-1720000000000-215',
        nom: 'Arrêt de l’ordonnancement pendant plus de 24 heures',
        besoin: 'disponibilite',
        gravite: 4,
        impacts: 'Arrêt des lignes, pénalités de retard contractuelles, image client.',
        description: 'Constaté lors de l’exercice de continuité de novembre.',
      },
    ],
    ebios_sources_risque: [
      {
        id: 'EBSR-1720000000000-217',
        etude_id: 'EBET-1720000000000-214',
        source: 'Cybercriminel organisé',
        objectif_vise: 'Obtenir une rançon',
        connaissance_id: 'EBCO-1720000000000-212',
        motivation: 4,
        ressources: 3,
        activite: 4,
        retenue: true,
        justification: 'Deux fournisseurs du secteur touchés en dix-huit mois.',
      },
      {
        id: 'EBSR-1720000000000-218',
        etude_id: 'EBET-1720000000000-214',
        source: 'Concurrent',
        objectif_vise: 'Obtenir le plan de fabrication',
        connaissance_id: null,
        motivation: 3,
        ressources: 2,
        activite: 1,
        retenue: false,
        justification: 'Aucun signal ; réexaminer à la prochaine étude.',
      },
    ],
  };
}

/**
 * Instantané COMPLET en v21.
 *
 * ⚠️ **La part pointe la campagne du MÊME instantané** : c'est cette jointure qui doit
 * survivre au round-trip, et un identifiant inventé ne mesurerait rien.
 *
 * ⚠️ Et ni la campagne ni la part ne portent d'AVANCEMENT : il se compte dans
 * « evaluations » sur le référentiel demandé. Le faire voyager dans le fichier le figerait
 * au jour de l'export — une reprise faite six mois plus tard rendrait « à 60 % » une
 * campagne depuis longtemps terminée.
 */
export function instantaneV20Complet() {
  const base = instantaneV19Complet();
  return {
    ...base,
    schemaVersion: 20,
    questionnaires_tiers: [
      {
        id: 'QUES-1720000000000-208',
        prestataire_id: 'PREST-1720000000000-111',
        ref_id: 'aircyber',
        intitule: 'AirCyber — niveau Bronze',
        envoye_le: '2026-02-01',
        echeance: '2026-03-01',
        relance_le: '2026-02-20',
        recu_le: '2026-02-27',
        notes: 'Envoyé par courriel au RSSI du fournisseur.',
      },
    ],
    questionnaire_reponses: [
      {
        id: 'QREP-1720000000000-209',
        questionnaire_id: 'QUES-1720000000000-208',
        code: 'CL1.1',
        reponse: 'partiel',
        commentaire: 'Chiffrement en place sur les portables, pas sur les postes fixes.',
        preuve: 'Politique de chiffrement v3, §4',
      },
    ],
  };
}

export function instantaneV17Complet() {
  return {
    ...instantaneV16Complet(),
    schemaVersion: 17,
    analyses_impact: [
      {
        id: 'AIPD-1720000000000-204',
        traitement_id: 'TRT-1720000000000-118',
        statut: 'validee',
        necessite_motif:
          'Traitement à grande échelle de données de santé des salariés (art. 35 §3 b).',
        date_analyse: '2026-02-10',
        risques_identifies:
          'Accès non autorisé aux arrêts de travail ; conservation au-delà du nécessaire.',
        mesures_prevues:
          'Chiffrement au repos, restriction du profil « RH-santé », purge automatique à 3 ans.',
        avis_dpo: 'Favorable sous réserve de la purge automatique.',
        avis_dpo_le: '2026-02-12',
        consultation_cnil: false,
        consultation_cnil_le: null,
        revoir_le: '2028-02-10',
        mesures_ids: ['MESURE-1720000000000-115'],
      },
    ],
  };
}

export function instantaneV16Complet() {
  const base = instantaneV15Complet();
  return {
    ...base,
    schemaVersion: 16,
    mesures: base.mesures.map((m, i) =>
      i === 0
        ? {
            ...m,
            efficacite: 'inefficace',
            efficacite_constatee_le: '2026-03-12',
            efficacite_preuve: 'Test de restauration du 12/03 : échec sur la base 3.',
            frequence_controle: 'Trimestrielle',
            dernier_controle: '2026-03-12',
          }
        : m,
    ),
  };
}

export function instantaneV15Complet() {
  const base = instantaneV14Complet();
  return {
    ...base,
    schemaVersion: 15,
    documents: base.documents.map((d, i) => ({
      ...d,
      mesures_ids: i === 0 ? ['MESURE-1720000000000-115'] : [],
    })),
  };
}

export function instantaneV14Complet() {
  return {
    ...instantaneV13Complet(),
    schemaVersion: 14,
    derogations: [
      {
        id: 'DER-1720000000000-203',
        exigence_id: 'EX-1720000000000-102',
        proprietaire: 'Claire Vasseur',
        motif: 'Automate du fournisseur incompatible avant le renouvellement de la ligne.',
        accordee_le: '2026-01-15',
        echeance: '2026-12-31',
        compensation: 'Surveillance renforcée des connexions de ce compte.',
      },
    ],
  };
}

export function instantaneV13Complet() {
  return {
    ...instantaneV12Complet(),
    schemaVersion: 13,
    risque_catalogue: [
      {
        id: 'RCAT-1720000000000-201',
        reference: 'R-001',
        nom: 'Rançongiciel',
        description: 'Chiffrement des données par un tiers, avec demande de rançon.',
        categorie: 'Malveillance',
        origine: 'referentiel',
        statut: 'active',
      },
    ],
    referentiels_actifs: [
      {
        id: 'REFA-1720000000000-202',
        ref_id: 'anssi',
        origine: 'socle_groupe',
        obligatoire: true,
        actif: true,
        motif: 'Socle imposé par le Groupe.',
      },
    ],
  };
}


/** Tous les identifiants d'un instantané, collection par collection. */
export function identifiantsDe(charge) {
  const sortie = {};
  for (const [nom, valeur] of Object.entries(charge)) {
    if (!Array.isArray(valeur)) continue;
    sortie[nom] = valeur.map((enr) => (enr && typeof enr === 'object' ? enr.id : null));
  }
  return sortie;
}

/** Les anomalies d'un rapport portant un code donné. */
export function anomalies(rapport, code) {
  return rapport.anomalies.filter((a) => a.code === code);
}

/** Le palier `de → vers` d'un rapport. */
export function palier(rapport, de, vers) {
  return rapport.paliers.find((p) => p.de === de && p.vers === vers);
}

/* =====================================================================
 *  UN EXPORT COMME UN CLIENT EN ENVERRAIT
 * ===================================================================== */

/**
 * Fabrique un export `grc-backup` **tel qu'un site encore en version locale en
 * produirait aujourd'hui** : ancien, volumineux, et écrit dans les conventions de
 * son époque.
 *
 * ── Pourquoi ce jeu-là, en plus de `instantaneV12Complet()` ─────────────────
 *
 * `instantaneV12Complet()` est un témoin : une ligne par collection, à jour, propre.
 * Il éprouve la FIDÉLITÉ du portage. Il n'éprouve pas ce qu'un fichier réel a de
 * pénible :
 *
 *  · **Il est ancien.** Un site qui n'a pas ouvert l'application depuis deux ans
 *    exporte en v6 : ni correspondances, ni historique, ni annuaire, un MCO en
 *    `{ etat, date, notes }` et des évaluations à `mesure_id` unique. La reprise
 *    doit traverser six paliers avant d'atteindre PostgreSQL.
 *  · **Ses identifiants n'ont pas de suffixe aléatoire.** `RISK-1699123456789` était
 *    la convention avant le chantier 9 ; le domaine `id_metier` les accepte, et le
 *    round-trip doit les rendre TELS QUELS — c'est la propriété que la route de
 *    reprise est seule à préserver depuis le constat M-3.
 *  · **Il est volumineux.** Quelques centaines d'enregistrements, avec des liaisons
 *    n-n peuplées : de quoi voir si la reprise tient en une transaction sans
 *    dépasser un délai de garde, et si un plafond se déclenche là où il ne faut pas.
 *
 * Les identifiants sont **déterministes** (dérivés du rang), sans quoi deux
 * exécutions produiraient des fichiers différents et la clé d'idempotence de la
 * route ne voudrait plus rien dire.
 *
 * @param {{parCollection?: number, base?: number}} [options]
 *        `parCollection` : enregistrements par collection (défaut 30) ;
 *        `base` : horodatage de départ des identifiants.
 */
export function exportAncienVolumineux(options = {}) {
  const n = options.parCollection ?? 30;
  const t0 = options.base ?? 1_699_000_000_000;
  /** Identifiant à l'ANCIENNE : préfixe + horodatage, sans suffixe aléatoire. */
  const id = (prefixe, rang) => `${prefixe}-${String(t0 + rang)}`;
  const suite = (nombre, fabrique) => Array.from({ length: nombre }, (_, i) => fabrique(i));

  const clients = suite(Math.max(2, Math.round(n / 5)), (i) => ({
    id: id('CLI', i),
    nom: `Donneur d’ordre ${String(i + 1)}`,
    secteur: i % 2 === 0 ? 'Aéronautique' : 'Défense',
  }));

  const exigences = suite(n, (i) => ({
    id: id('EX', 1000 + i),
    client_id: clients[i % clients.length].id,
    code: `A.${String(5 + (i % 9))}.${String(1 + (i % 7))}`,
    intitule: `Exigence de sécurité n° ${String(i + 1)}`,
    statut_conformite: ['conforme', 'partiellement conforme', 'non conforme', 'non applicable'][i % 4],
    responsable: `Responsable ${String(i % 7)}`,
    commentaire: i % 3 === 0 ? 'Revue annuelle à programmer.' : '',
  }));

  const risques = suite(n, (i) => ({
    id: id('RISK', 2000 + i),
    nom: `Scénario de risque n° ${String(i + 1)}`,
    description: 'Scénario issu de l’atelier EBIOS Risk Manager.',
    f_frequence: (i % 4) + 1,
    g_gravite: (i % 4) + 1,
    m_maitrise: Number(((i % 10) / 10).toFixed(1)),
    score_brut: ((i % 4) + 1) * ((i % 4) + 1),
    score_residuel: Number((((i % 4) + 1) * ((i % 4) + 1) * 0.7).toFixed(2)),
    niveau: ['faible', 'élevé', 'critique'][i % 3],
    // Liaison n-n peuplée : c'est elle qui coûte le plus cher à la reprise.
    exigences_liees: [exigences[i % exigences.length].id, exigences[(i + 1) % exigences.length].id],
  }));

  const actifs = suite(n, (i) => ({
    id: id('ACTIF', 3000 + i),
    nom: `Actif ${String(i + 1)}`,
    type: ['Matériel', 'Logiciel', 'Service', 'Donnée'][i % 4],
    // Le vocabulaire est celui des FORMULAIRES de l'application (`js/modules/*.js`),
    // jamais une invention de ce fichier : c'est de l'accord entre ce vocabulaire et
    // le schéma que parle le constat M-8.
    criticite: ['faible', 'modérée', 'élevée', 'critique'][i % 4],
    responsable: `Responsable ${String(i % 5)}`,
    description: 'Actif du périmètre industriel.',
    risques_lies: [risques[i % risques.length].id],
    dependances: i === 0 ? [] : [{ to: id('ACTIF', 3000 + i - 1), type: ['dep', 'hosted', 'flux', 'backup'][i % 4] }],
  }));

  const processus = suite(Math.max(2, Math.round(n / 3)), (i) => ({
    id: id('BIA', 4000 + i),
    nom: `Processus métier ${String(i + 1)}`,
    criticite: ['Faible', 'Modérée', 'Élevée', 'Critique'][i % 4],
    rto: ['4 heures', '24 heures', '48 heures', '1 semaine'][i % 4],
    rpo: ['4 heures', '24 heures', '1 semaine', '1 mois'][i % 4],
    responsable: `Responsable ${String(i % 4)}`,
    description: 'Processus soumis au BIA.',
    actifs_lies: [actifs[i % actifs.length].id],
  }));

  const scenarios = suite(Math.max(2, Math.round(n / 6)), (i) => ({
    id: id('SCEN', 5000 + i),
    nom: `Sinistre ${String(i + 1)}`,
    description: 'Scénario de continuité.',
    etapes_pca: [],
    etapes_pra: [],
  }));

  const mesures = suite(Math.max(2, Math.round(n / 3)), (i) => ({
    id: id('MESURE', 6000 + i),
    nom: `Mesure de sécurité ${String(i + 1)}`,
    description: 'Contrôle du socle.',
    statut: ['conforme', 'partiellement conforme', 'non conforme', ''][i % 4],
    maturite: i % 6,
    responsable: `Responsable ${String(i % 3)}`,
    commentaire: '',
  }));

  return {
    // v6 : ni mappings (v7), ni history (v8), ni personnes (v11).
    schemaVersion: 6,
    updatedAt: t0,
    clients,
    exigences,
    actions: suite(n, (i) => ({
      id: id('ACT', 7000 + i),
      titre: `Action corrective ${String(i + 1)}`,
      statut: ['à faire', 'en cours', 'terminée'][i % 3],
      responsable: `Responsable ${String(i % 6)}`,
      echeance: `2027-${String((i % 12) + 1).padStart(2, '0')}-15`,
      priorite: ['Basse', 'Moyenne', 'Haute', 'Critique'][i % 4],
      commentaire: '',
      // UN seul rattachement, comme le modèle l'exige.
      exigence_id: exigences[i % exigences.length].id,
    })),
    risques,
    actifs,
    processus,
    crise: suite(Math.max(2, Math.round(n / 6)), (i) => ({
      id: id('CRISE', 8000 + i),
      role: `Rôle de crise ${String(i + 1)}`,
      nom: `Personne ${String(i + 1)}`,
      telephone: '0000000000',
      email: `contact${String(i)}@exemple.invalid`,
      suppleant: '',
      notes: '',
    })),
    scenarios_pra: scenarios,
    tests_pra: suite(Math.max(2, Math.round(n / 6)), (i) => ({
      id: id('TEST', 9000 + i),
      scenario_id: scenarios[i % scenarios.length].id,
      date: `2026-0${String((i % 9) + 1)}-10`,
      type_test: ['Théorique (Sur table)', 'Technique (Simulation)', 'Technique (Basculement réel)'][i % 3],
      participants: 'Équipe IT',
      succes: i % 2 === 0 ? 'Oui' : 'Non',
      constats: '',
    })),
    prestataires: suite(Math.max(2, Math.round(n / 4)), (i) => ({
      id: id('PRES', 10000 + i),
      societe: `Prestataire ${String(i + 1)}`,
      type: ['Prestataire IT / Cloud', 'Assureur Cyber', 'Client Majeur', 'Autorité', 'Autre'][i % 5],
      phone: '',
      email: '',
      notes: '',
      // Le « non renseigné » de l'époque : la chaîne vide (constat M-8).
      criticite: '',
      acces: '',
    })),
    // MCO à l'ANCIENNE (avant v10) : le palier v9 → v10 doit le convertir.
    mco_actions: suite(Math.max(2, Math.round(n / 4)), (i) => ({
      id: id('MCO', 11000 + i),
      titre: `Vérification récurrente ${String(i + 1)}`,
      etat: i % 2 === 0 ? 'OK' : 'KO',
      date: i % 2 === 0 ? `2026-0${String((i % 9) + 1)}-01` : '',
      notes: i % 2 === 0 ? 'RAS' : 'À reprendre',
    })),
    audits: suite(Math.max(2, Math.round(n / 6)), (i) => ({
      id: id('AUD', 12000 + i),
      reference: `AUDIT-2026-${String(i + 1).padStart(3, '0')}`,
      date: `2026-0${String((i % 9) + 1)}-20`,
      auditeur: `Auditeur ${String(i % 3)}`,
      perimetre: 'Périmètre industriel',
      statut: ['Planifié', 'En cours', 'Réalisé'][i % 3],
      items: [],
      constats: [],
    })),
    revues: suite(Math.max(2, Math.round(n / 8)), (i) => ({
      id: id('REV', 13000 + i),
      date: `2026-0${String((i % 9) + 1)}-28`,
      participants: 'Direction, RSSI',
      inputs: 'Tableau de bord de conformité',
      outputs: 'Décisions de la revue',
    })),
    // Évaluations à l'ANCIENNE (avant v12) : « mesure_id » unique, converti en tableau.
    evaluations: suite(n, (i) => ({
      id: id('EVAL', 14000 + i),
      ref_id: 'anssi',
      code: `M${String(i + 1)}`,
      statut: ['conforme', 'partiellement conforme', 'non conforme', 'non applicable'][i % 4],
      maturite: i % 6,
      commentaire: '',
      preuves: '',
      mesure_id: mesures[i % mesures.length].id,
    })),
    mesures,
    documents: suite(Math.max(2, Math.round(n / 4)), (i) => ({
      id: id('DOC', 15000 + i),
      titre: `Politique ou procédure ${String(i + 1)}`,
      type: ['Politique de sécurité (PSSI)', 'Charte informatique', 'Procédure', 'Registre', 'Autre'][i % 5],
      version: `1.${String(i % 5)}`,
      proprietaire: `Responsable ${String(i % 3)}`,
      statut: ['brouillon', 'en vigueur', 'à réviser', 'obsolète'][i % 4],
      date_revue: `2027-0${String((i % 9) + 1)}-01`,
      emplacement: '',
      notes: '',
      referentiels: ['anssi'],
    })),
    incidents: suite(Math.max(2, Math.round(n / 3)), (i) => ({
      id: id('INC', 16000 + i),
      titre: `Incident ${String(i + 1)}`,
      type: ['Hameçonnage', 'Rançongiciel', 'Intrusion / compromission', 'Fuite de données', 'Autre'][i % 5],
      gravite: ['faible', 'moyenne', 'élevée', 'critique'][i % 4],
      statut: ['nouveau', 'en cours', 'résolu', 'clôturé'][i % 4],
      date_detection: `2026-0${String((i % 9) + 1)}-05`,
      description: '',
      declaration_anssi: 'non requise',
      declaration_cnil: 'non requise',
      actifs_touches: [actifs[i % actifs.length].id],
    })),
    traitements: suite(Math.max(2, Math.round(n / 4)), (i) => ({
      id: id('TRT', 17000 + i),
      nom: `Traitement RGPD ${String(i + 1)}`,
      finalite: 'Gestion administrative',
      base_legale: ['Consentement', 'Contrat', 'Obligation légale', 'Intérêt légitime'][i % 4],
      responsable: `Responsable ${String(i % 3)}`,
      personnes_concernees: 'Salariés',
      categories_donnees: 'Identité, coordonnées',
      donnees_sensibles: false,
      destinataires: 'Service RH',
      transfert_hors_ue: '',
      duree_conservation: '5 ans',
      mesures_ids: [mesures[i % mesures.length].id],
    })),
  };
}
