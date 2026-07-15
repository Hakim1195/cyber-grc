// Emplacement : js/data/audit_iso27001_smsi.js
// Nom du fichier : audit_iso27001_smsi.js
//
// MODÈLE D'AUDIT du référentiel « ISO/IEC 27001:2022 — Système de management »
// (chapitres 4 à 10, voir ref_iso27001_smsi.js). Pour chaque exigence du SMSI,
// un ou plusieurs POINTS DE CONTRÔLE : ce que l'auditeur doit vérifier + les preuves
// à demander. Reformulations maison (aucun texte de norme recopié).
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("iso27001-smsi", {
        // --- 4. Contexte de l'organisation ---
        "4.1": [
            { ctrl: "Vérifier que les enjeux internes et externes pertinents pour le SMSI sont identifiés, documentés et tenus à jour.", preuve: "Analyse de contexte (SWOT/PESTEL), compte rendu de revue, date de dernière mise à jour." }
        ],
        "4.2": [
            { ctrl: "Vérifier que les parties intéressées pertinentes et leurs exigences (dont légales et contractuelles) sont recensées et suivies.", preuve: "Registre des parties intéressées et de leurs exigences, veille légale/réglementaire." }
        ],
        "4.3": [
            { ctrl: "Vérifier que le périmètre du SMSI est défini, documenté et justifié (activités, sites, actifs, interfaces et dépendances), y compris les exclusions.", preuve: "Document de périmètre, schéma des interfaces, justification des exclusions." }
        ],
        "4.4": [
            { ctrl: "Vérifier que le SMSI et ses processus sont établis, mis en œuvre, tenus à jour et améliorés (approche processus et interactions).", preuve: "Description/manuel du SMSI, cartographie des processus." }
        ],

        // --- 5. Leadership ---
        "5.1": [
            { ctrl: "Vérifier l'implication effective de la direction : politique et objectifs cohérents avec la stratégie, ressources allouées, intégration aux processus métier, soutien communiqué.", preuve: "Comptes rendus de direction, décisions d'allocation de ressources, communications internes." }
        ],
        "5.2": [
            { ctrl: "Vérifier l'existence d'une politique de sécurité approuvée, adaptée à l'organisation, communiquée et disponible comme information documentée.", preuve: "Politique de sécurité datée/approuvée, preuve de diffusion, cadre d'objectifs." }
        ],
        "5.3": [
            { ctrl: "Vérifier que les rôles, responsabilités et autorités liés à la sécurité sont attribués et communiqués (dont la conformité du SMSI et le reporting à la direction).", preuve: "Organigramme sécurité, fiches de rôle (RSSI…), lettres de mission." }
        ],

        // --- 6. Planification ---
        "6.1.1": [
            { ctrl: "Vérifier que les risques et opportunités issus du contexte et des exigences sont déterminés, et que des actions sont planifiées puis intégrées au SMSI et évaluées.", preuve: "Analyse des risques et opportunités, plan d'actions, évaluation d'efficacité." }
        ],
        "6.1.2": [
            { ctrl: "Vérifier l'existence d'un processus d'appréciation des risques défini et reproductible (critères d'appréciation et d'acceptation, identification, analyse, évaluation).", preuve: "Méthodologie (EBIOS RM ou équivalent), critères documentés, registre des risques." },
            { ctrl: "Vérifier que chaque risque a un propriétaire, est coté (vraisemblance × conséquences) puis priorisé.", preuve: "Registre des risques avec propriétaires, cotation et priorisation." }
        ],
        "6.1.3": [
            { ctrl: "Vérifier que les options de traitement sont choisies, les mesures nécessaires déterminées et comparées à l'Annexe A, et qu'une déclaration d'applicabilité (SoA) est produite et approuvée.", preuve: "Plan de traitement des risques, SoA justifiée (inclusions/exclusions), accord des propriétaires du risque." }
        ],
        "6.2": [
            { ctrl: "Vérifier que des objectifs de sécurité mesurables sont fixés, communiqués, suivis et mis à jour, avec ressources, responsables et échéances.", preuve: "Tableau des objectifs et indicateurs, plans d'action, suivi périodique." }
        ],
        "6.3": [
            { ctrl: "Vérifier que les modifications du SMSI sont conduites de façon planifiée (analyse d'impact, maîtrise du changement).", preuve: "Procédure de gestion du changement du SMSI, exemples de changements planifiés." }
        ],

        // --- 7. Support ---
        "7.1": [
            { ctrl: "Vérifier que les ressources nécessaires au SMSI sont déterminées et fournies (humaines, techniques, budgétaires).", preuve: "Budget sécurité, effectifs / plan de charge, décisions d'allocation." }
        ],
        "7.2": [
            { ctrl: "Vérifier que les compétences requises sont déterminées, assurées (formation, recrutement) et prouvées.", preuve: "Matrice de compétences, plans de formation, attestations / certifications." }
        ],
        "7.3": [
            { ctrl: "Vérifier que le personnel connaît la politique, sa contribution à l'efficacité du SMSI et les conséquences d'un non-respect.", preuve: "Programme de sensibilisation, taux de participation, supports diffusés." }
        ],
        "7.4": [
            { ctrl: "Vérifier que les communications internes et externes pertinentes pour le SMSI sont définies (quoi, quand, avec qui, comment).", preuve: "Plan de communication, exemples de communications sécurité." }
        ],
        "7.5.1": [
            { ctrl: "Vérifier que la documentation exigée par la norme et celle jugée nécessaire à l'efficacité du SMSI sont présentes.", preuve: "Liste maîtresse des documents du SMSI." }
        ],
        "7.5.2": [
            { ctrl: "Vérifier que les documents sont correctement identifiés, formatés, revus et approuvés.", preuve: "Documents portant référence / version / date, preuve d'approbation." }
        ],
        "7.5.3": [
            { ctrl: "Vérifier la maîtrise de la diffusion, de l'accès, du stockage, des versions, de la conservation et de l'élimination des documents (y compris ceux d'origine externe).", preuve: "Procédure de gestion documentaire, contrôle d'accès aux documents, gestion des versions." }
        ],

        // --- 8. Fonctionnement ---
        "8.1": [
            { ctrl: "Vérifier que les processus nécessaires au traitement des risques sont mis en œuvre et maîtrisés, y compris les changements et les processus externalisés.", preuve: "Procédures opérationnelles, critères de maîtrise, suivi des processus externalisés." }
        ],
        "8.2": [
            { ctrl: "Vérifier que les appréciations des risques sont réalisées à intervalles planifiés ou lors de changements notables, et documentées.", preuve: "Appréciations datées, déclencheurs (changements), registre des risques à jour." }
        ],
        "8.3": [
            { ctrl: "Vérifier que le plan de traitement des risques est mis en œuvre et son avancement suivi.", preuve: "Plan de traitement, état d'avancement, preuves de mise en œuvre." }
        ],

        // --- 9. Évaluation des performances ---
        "9.1": [
            { ctrl: "Vérifier que l'organisation détermine quoi mesurer, avec quelles méthodes, quand et par qui, et évalue la performance et l'efficacité du SMSI.", preuve: "Plan de mesure / indicateurs, tableaux de bord, analyses." }
        ],
        "9.2.1": [
            { ctrl: "Vérifier que des audits internes sont réalisés à intervalles planifiés, couvrant la conformité aux exigences propres et à la norme, et la mise en œuvre effective.", preuve: "Rapports d'audit interne, périmètre couvert, planning." }
        ],
        "9.2.2": [
            { ctrl: "Vérifier l'existence d'un programme d'audit (fréquence, méthodes, responsabilités, planification et reporting) et l'objectivité/impartialité des auditeurs.", preuve: "Programme d'audit pluriannuel, critères de sélection des auditeurs, rapports conservés." }
        ],
        "9.3.1": [
            { ctrl: "Vérifier que la direction revoit le SMSI à intervalles planifiés.", preuve: "Planning et comptes rendus de revue de direction." }
        ],
        "9.3.2": [
            { ctrl: "Vérifier que la revue examine tous les éléments d'entrée requis (suivi des actions, évolutions du contexte, performance, non-conformités, résultats d'audit et d'appréciation des risques, retours des parties intéressées, opportunités d'amélioration).", preuve: "Ordre du jour et support de la revue couvrant les entrées normatives." }
        ],
        "9.3.3": [
            { ctrl: "Vérifier que la revue produit des décisions d'amélioration et de changement, tracées et suivies.", preuve: "Relevé de décisions de la revue, actions assignées et suivies." }
        ],

        // --- 10. Amélioration ---
        "10.1": [
            { ctrl: "Vérifier que l'organisation améliore en continu la pertinence, l'adéquation et l'efficacité du SMSI.", preuve: "Indicateurs de tendance, actions d'amélioration, bilans successifs." }
        ],
        "10.2": [
            { ctrl: "Vérifier que les non-conformités sont traitées (réaction, correction, analyse des causes, actions anti-récurrence, revue d'efficacité) et documentées.", preuve: "Registre des non-conformités et actions correctives, analyses de cause, preuve de clôture et d'efficacité." }
        ]
    });
})();
