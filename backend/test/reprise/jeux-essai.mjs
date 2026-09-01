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
