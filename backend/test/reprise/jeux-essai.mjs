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
 * Horloge et aléa figés : les identifiants engendrés par la reprise deviennent
 * reproductibles (`<PRÉFIXE>-1720000000000-482`), donc assertables.
 */
export const OPTIONS_FIGEES = Object.freeze({
  horloge: () => 1_720_000_000_000,
  alea: () => 0.482,
});

/** Identifiant qu'engendre la reprise sous `OPTIONS_FIGEES`. */
export function idEngendre(prefixe) {
  return `${prefixe}-1720000000000-482`;
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
        risque_id: 'RISK-1720000000000-104',
        evaluation_id: 'EVAL-1720000000000-114',
        incident_id: 'INC-1720000000000-116',
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
