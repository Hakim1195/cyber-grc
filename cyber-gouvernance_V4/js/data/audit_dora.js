// Emplacement : js/data/audit_dora.js
// Nom du fichier : audit_dora.js
//
// MODÈLE D'AUDIT du référentiel « DORA — résilience opérationnelle » (15 mesures
// sur 5 piliers, voir ref_dora.js). Un POINT DE CONTRÔLE par mesure : ce que
// l'auditeur doit vérifier + les preuves à demander. Reformulations maison
// (le règlement (UE) 2022/2554 n'est pas reproduit).
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("dora", {
        // --- Pilier 1 : Gestion du risque TIC ---
        "1.1": [{ ctrl: "Vérifier l'existence d'un cadre de gestion du risque TIC documenté, gouverné et placé sous la responsabilité de l'organe de direction.", preuve: "Cadre de gestion du risque TIC, comptes rendus de direction, politique." }],
        "1.2": [{ ctrl: "Vérifier l'identification et la cartographie des fonctions, actifs et dépendances TIC critiques.", preuve: "Cartographie des actifs/fonctions critiques, registre des dépendances." }],
        "1.3": [{ ctrl: "Vérifier les mesures de sécurité et de continuité visant à protéger et prévenir les incidents TIC.", preuve: "Politiques et mesures techniques de protection, plan de continuité." }],
        "1.4": [{ ctrl: "Vérifier les mécanismes de détection rapide des activités anormales et des incidents TIC.", preuve: "Supervision / SIEM, règles de détection, seuils d'alerte." }],
        "1.5": [{ ctrl: "Vérifier la politique de continuité et de reprise (sauvegardes, plans de reprise, objectifs RTO/RPO) et la réalisation de tests.", preuve: "Politique de continuité TIC, plans de reprise, comptes rendus de tests, RTO/RPO définis." }],

        // --- Pilier 2 : Gestion des incidents TIC ---
        "2.1": [{ ctrl: "Vérifier un processus cohérent de détection, d'enregistrement et de traitement des incidents liés aux TIC.", preuve: "Procédure de gestion des incidents TIC, registre des incidents." }],
        "2.2": [{ ctrl: "Vérifier la classification des incidents selon les critères d'importance définis (DORA et ses RTS).", preuve: "Grille de classification, exemples d'incidents classés." }],
        "2.3": [{ ctrl: "Vérifier la notification des incidents majeurs aux autorités compétentes dans les délais réglementaires (notification initiale, intermédiaire et finale).", preuve: "Procédure et preuves de notification, respect des délais." }],

        // --- Pilier 3 : Tests de résilience ---
        "3.1": [{ ctrl: "Vérifier un programme de tests réguliers des outils et systèmes TIC (scans de vulnérabilités, scénarios).", preuve: "Programme de tests, résultats, plan de remédiation." }],
        "3.2": [{ ctrl: "Vérifier la réalisation de tests d'intrusion fondés sur la menace (TLPT) pour les entités concernées.", preuve: "Rapports TLPT, périmètre, remédiation (le cas échéant selon l'entité)." }],

        // --- Pilier 4 : Risque lié aux tiers TIC ---
        "4.1": [{ ctrl: "Vérifier la tenue d'un registre des accords contractuels avec les prestataires de services TIC.", preuve: "Registre d'information des prestataires TIC, accords référencés." }],
        "4.2": [{ ctrl: "Vérifier la présence des clauses contractuelles obligatoires (accès, audit, sécurité, sous-traitance, assistance, sortie).", preuve: "Contrats prestataires TIC, clauses DORA." }],
        "4.3": [{ ctrl: "Vérifier le suivi des prestataires TIC critiques et la maîtrise du risque de concentration.", preuve: "Évaluation de criticité, suivi des prestataires, analyse de concentration." }],
        "4.4": [{ ctrl: "Vérifier l'existence de stratégies de sortie et de réversibilité pour les services TIC critiques.", preuve: "Plans de sortie / réversibilité, scénarios de transition." }],

        // --- Pilier 5 : Partage d'information ---
        "5.1": [{ ctrl: "Vérifier la participation éventuelle à des dispositifs d'échange d'information sur les cybermenaces.", preuve: "Adhésions / accords de partage, comptes rendus (dispositif volontaire)." }]
    });
})();
