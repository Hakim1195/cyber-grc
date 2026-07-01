// Emplacement : js/data/mappings.js
// Nom du fichier : mappings.js
//
// Catalogue STATIQUE de CORRESPONDANCES (équivalences) inter-référentiels.
// Chaque groupe rassemble les exigences qui traitent d'un même thème de sécurité
// dans plusieurs référentiels (ANSSI ↔ ISO 27002 ↔ NIS2 ↔ DORA). Il sert de socle
// « pré-rempli » : l'utilisateur peut ensuite l'enrichir/le corriger (ses ajouts et
// modifications vivent dans DataStore, tableau `mappings`, en surcouche).
//
// Objectif : accélérer la couverture croisée et la SoA — relier une même « mesure de
// sécurité » à toutes les exigences équivalentes d'un coup (zéro double saisie).
//
// ⚠️ Les correspondances sont INDICATIVES (reformulations maison). Elles n'engagent
// pas les éditeurs des normes ; se référer aux textes officiels pour l'analyse fine.
// Les codes doivent exister dans les référentiels (js/data/ref_*.js).

const MappingCatalog = (() => {

    // Référentiels affichés par défaut en colonnes (les correspondances portent sur eux).
    const CORE_REFS = ["anssi-hygiene", "iso-27002-2022", "nis2-art21", "dora"];

    // Un groupe : { id, theme, aide, refs: { <refId>: [codes...] } }
    const groups = [
        {
            id: "map-politiques",
            theme: "Politiques de sécurité & gouvernance",
            aide: "Le cadre documentaire (politiques, rôles, engagement de la direction) qui pilote toute la démarche de sécurité.",
            refs: { "anssi-hygiene": ["40"], "iso-27002-2022": ["5.1", "5.2", "5.4", "5.36"], "nis2-art21": ["a"], "dora": ["1.1"] }
        },
        {
            id: "map-risques",
            theme: "Analyse et gestion des risques",
            aide: "Identifier, évaluer et traiter les risques, puis vérifier l'efficacité des mesures retenues.",
            refs: { "anssi-hygiene": ["42"], "iso-27002-2022": [], "nis2-art21": ["a", "f"], "dora": ["1.1", "1.2"] }
        },
        {
            id: "map-sensibilisation",
            theme: "Sensibilisation et formation",
            aide: "Former les équipes et sensibiliser tous les utilisateurs : le premier rempart de la sécurité.",
            refs: { "anssi-hygiene": ["1", "2"], "iso-27002-2022": ["6.3"], "nis2-art21": ["g"], "dora": [] }
        },
        {
            id: "map-rh",
            theme: "Sécurité des ressources humaines",
            aide: "Intégrer la sécurité au cycle RH : recrutement, engagements contractuels, sanctions, départs.",
            refs: { "anssi-hygiene": ["6"], "iso-27002-2022": ["6.1", "6.2", "6.4", "6.5", "6.6"], "nis2-art21": ["i"], "dora": [] }
        },
        {
            id: "map-actifs",
            theme: "Inventaire et cartographie des actifs",
            aide: "Connaître son SI : recenser serveurs, applications, flux et données, avec un propriétaire pour chaque actif.",
            refs: { "anssi-hygiene": ["4", "5", "7"], "iso-27002-2022": ["5.9", "5.10", "5.11"], "nis2-art21": ["i"], "dora": ["1.2"] }
        },
        {
            id: "map-acces",
            theme: "Contrôle d'accès et gestion des identités",
            aide: "Chaque personne est identifiée et n'accède qu'au strict nécessaire (moindre privilège).",
            refs: { "anssi-hygiene": ["8", "9"], "iso-27002-2022": ["5.15", "5.16", "5.18", "8.3"], "nis2-art21": ["i"], "dora": [] }
        },
        {
            id: "map-auth",
            theme: "Authentification (mots de passe & MFA)",
            aide: "Des secrets robustes, protégés, et une authentification multifacteur pour les accès sensibles.",
            refs: { "anssi-hygiene": ["10", "11", "12", "13"], "iso-27002-2022": ["5.17", "8.5"], "nis2-art21": ["j"], "dora": [] }
        },
        {
            id: "map-privileges",
            theme: "Comptes et accès à privilèges",
            aide: "Maîtriser les comptes d'administration : les plus convoités car ils ouvrent l'ensemble du SI.",
            refs: { "anssi-hygiene": ["5", "27", "28", "29", "30"], "iso-27002-2022": ["8.2", "8.18"], "nis2-art21": ["i"], "dora": [] }
        },
        {
            id: "map-postes",
            theme: "Durcissement des postes et configurations",
            aide: "Un socle de configuration homogène et durci sur tout le parc, géré de façon centralisée.",
            refs: { "anssi-hygiene": ["14", "16", "17"], "iso-27002-2022": ["8.1", "8.9"], "nis2-art21": ["g"], "dora": ["1.3"] }
        },
        {
            id: "map-malware",
            theme: "Protection contre les logiciels malveillants",
            aide: "Antivirus, filtrage et vigilance pour bloquer virus, rançongiciels et autres codes malveillants.",
            refs: { "anssi-hygiene": ["14"], "iso-27002-2022": ["8.7"], "nis2-art21": ["g"], "dora": ["1.3"] }
        },
        {
            id: "map-vulnerabilites",
            theme: "Gestion des vulnérabilités et des mises à jour",
            aide: "Appliquer vite les correctifs et remplacer ce qui n'est plus maintenu : fermer les failles connues.",
            refs: { "anssi-hygiene": ["35", "36"], "iso-27002-2022": ["8.8"], "nis2-art21": ["e"], "dora": ["3.1"] }
        },
        {
            id: "map-sauvegardes",
            theme: "Sauvegardes et restauration",
            aide: "Des sauvegardes régulières, déconnectées et surtout testées : la meilleure parade au rançongiciel.",
            refs: { "anssi-hygiene": ["38"], "iso-27002-2022": ["8.13"], "nis2-art21": ["c"], "dora": ["1.5"] }
        },
        {
            id: "map-continuite",
            theme: "Continuité d'activité et reprise",
            aide: "Préparer la reprise après sinistre : plans, redondance et objectifs de temps/point de reprise.",
            refs: { "anssi-hygiene": ["38"], "iso-27002-2022": ["5.29", "5.30", "8.14"], "nis2-art21": ["c"], "dora": ["1.5"] }
        },
        {
            id: "map-journalisation",
            theme: "Journalisation et supervision",
            aide: "Sans journaux, pas de détection : activer, protéger et surveiller les traces des composants essentiels.",
            refs: { "anssi-hygiene": ["37"], "iso-27002-2022": ["8.15", "8.16", "8.17"], "nis2-art21": ["b"], "dora": ["1.4"] }
        },
        {
            id: "map-incidents",
            theme: "Gestion des incidents",
            aide: "Savoir détecter, qualifier, traiter et capitaliser sur les incidents de sécurité.",
            refs: { "anssi-hygiene": ["41"], "iso-27002-2022": ["5.24", "5.25", "5.26", "5.27", "6.8"], "nis2-art21": ["b"], "dora": ["2.1", "2.2"] }
        },
        {
            id: "map-notification",
            theme: "Notification des incidents aux autorités",
            aide: "Déclarer les incidents majeurs dans les délais réglementaires (NIS2, RGPD, DORA) aux bons interlocuteurs.",
            refs: { "anssi-hygiene": [], "iso-27002-2022": ["5.5"], "nis2-art21": ["b"], "dora": ["2.3"] }
        },
        {
            id: "map-reseau",
            theme: "Sécurité et cloisonnement du réseau",
            aide: "Segmenter le réseau, sécuriser le Wi-Fi, la passerelle Internet et les interconnexions avec les tiers.",
            refs: { "anssi-hygiene": ["19", "20", "22", "23", "25"], "iso-27002-2022": ["8.20", "8.21", "8.22", "8.23"], "nis2-art21": [], "dora": ["1.3"] }
        },
        {
            id: "map-cryptographie",
            theme: "Cryptographie et chiffrement",
            aide: "Chiffrer les données sensibles (stockées, échangées, emportées) et gérer les clés.",
            refs: { "anssi-hygiene": ["18", "32"], "iso-27002-2022": ["8.24"], "nis2-art21": ["h"], "dora": [] }
        },
        {
            id: "map-messagerie",
            theme: "Sécurité de la messagerie",
            aide: "Anti-spam, anti-hameçonnage, filtrage des pièces jointes et authentification des expéditeurs (SPF/DKIM/DMARC).",
            refs: { "anssi-hygiene": ["24"], "iso-27002-2022": ["5.14"], "nis2-art21": [], "dora": [] }
        },
        {
            id: "map-nomadisme",
            theme: "Nomadisme et télétravail",
            aide: "Protéger les équipements qui sortent des locaux : chiffrement, VPN, politique dédiée aux mobiles.",
            refs: { "anssi-hygiene": ["31", "33", "34"], "iso-27002-2022": ["6.7", "7.9"], "nis2-art21": [], "dora": [] }
        },
        {
            id: "map-physique",
            theme: "Sécurité physique",
            aide: "Protéger locaux techniques, équipements et accès physiques : un accès physique contourne bien des protections.",
            refs: { "anssi-hygiene": ["26"], "iso-27002-2022": ["7.1", "7.2", "7.3", "7.4"], "nis2-art21": [], "dora": [] }
        },
        {
            id: "map-developpement",
            theme: "Développement sécurisé",
            aide: "Intégrer la sécurité tout au long du cycle de développement (conception, codage, tests, environnements séparés).",
            refs: { "anssi-hygiene": [], "iso-27002-2022": ["8.25", "8.26", "8.28", "8.29", "8.31"], "nis2-art21": ["e"], "dora": [] }
        },
        {
            id: "map-tiers",
            theme: "Sécurité des relations fournisseurs",
            aide: "Encadrer la sécurité dès le choix d'un fournisseur et tout au long de la relation (contrat, suivi).",
            refs: { "anssi-hygiene": ["3"], "iso-27002-2022": ["5.19", "5.20", "5.22"], "nis2-art21": ["d"], "dora": ["4.1", "4.2", "4.3"] }
        },
        {
            id: "map-supplychain",
            theme: "Chaîne d'approvisionnement TIC",
            aide: "Maîtriser les risques portés par la chaîne d'approvisionnement informatique, dont le cloud et la réversibilité.",
            refs: { "anssi-hygiene": ["3"], "iso-27002-2022": ["5.21", "5.23"], "nis2-art21": ["d"], "dora": ["4.2", "4.4"] }
        },
        {
            id: "map-donnees-personnelles",
            theme: "Protection des données personnelles",
            aide: "Protéger la vie privée et les données à caractère personnel (lien direct avec le RGPD).",
            refs: { "anssi-hygiene": [], "iso-27002-2022": ["5.34", "8.11"], "nis2-art21": [], "dora": [] }
        },
        {
            id: "map-tests",
            theme: "Tests de sécurité et audits",
            aide: "Éprouver régulièrement la sécurité : audits, revues indépendantes, tests d'intrusion.",
            refs: { "anssi-hygiene": ["39"], "iso-27002-2022": ["5.35", "8.29", "8.34"], "nis2-art21": ["f"], "dora": ["3.1", "3.2"] }
        },
        {
            id: "map-classification",
            theme: "Classification et protection de l'information",
            aide: "Classer l'information selon sa sensibilité et la protéger à la juste mesure (marquage, DLP).",
            refs: { "anssi-hygiene": ["4"], "iso-27002-2022": ["5.12", "5.13", "8.12"], "nis2-art21": [], "dora": [] }
        },
        {
            id: "map-veille",
            theme: "Veille et partage sur les menaces",
            aide: "Se tenir informé des menaces et participer aux dispositifs d'échange pour renforcer la résilience collective.",
            refs: { "anssi-hygiene": [], "iso-27002-2022": ["5.6", "5.7"], "nis2-art21": [], "dora": ["5.1"] }
        }
    ];

    function coreRefs() { return CORE_REFS.slice(); }
    // Copie défensive : le catalogue statique ne doit jamais être muté (les édits
    // utilisateur vivent dans DataStore).
    function all() { return JSON.parse(JSON.stringify(groups)); }
    function get(id) { const g = groups.find(x => x.id === id); return g ? JSON.parse(JSON.stringify(g)) : null; }
    function has(id) { return groups.some(x => x.id === id); }

    return { coreRefs, all, get, has };
})();
