// Emplacement : js/data/audit_nis2.js
// Nom du fichier : audit_nis2.js
//
// MODÈLE D'AUDIT du référentiel « NIS2 — mesures art. 21 » (10 mesures a→j, voir
// ref_nis2.js). Un ou plusieurs POINTS DE CONTRÔLE par mesure : ce que l'auditeur
// doit vérifier + les preuves à demander. Reformulations maison (texte de la
// directive non reproduit).
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("nis2-art21", {
        "a": [
            { ctrl: "Vérifier l'existence de politiques d'analyse des risques et de sécurité des systèmes d'information, approuvées et tenues à jour.", preuve: "Politique de sécurité des SI, méthodologie d'analyse de risque, preuve d'approbation et de revue." },
            { ctrl: "Vérifier l'implication et la responsabilité de l'organe de direction (approbation des mesures de gestion des risques, supervision, formation des dirigeants — NIS2 art. 20).", preuve: "Comptes rendus de direction, preuve d'approbation, attestations de formation des dirigeants." }
        ],
        "b": [
            { ctrl: "Vérifier le dispositif de détection, de traitement et de notification des incidents, avec respect des délais NIS2 (alerte précoce sous 24 h, notification sous 72 h, rapport final sous 1 mois).", preuve: "Procédure de gestion des incidents, registre, preuves de notification au CSIRT/autorité, délais constatés." }
        ],
        "c": [
            { ctrl: "Vérifier la continuité d'activité : sauvegardes, plan de reprise après sinistre et gestion de crise, testés.", preuve: "PCA/PRA, politique de sauvegarde, comptes rendus d'exercices de crise." }
        ],
        "d": [
            { ctrl: "Vérifier la maîtrise des risques liés aux fournisseurs et prestataires directs (exigences de sécurité, évaluation, suivi).", preuve: "Politique fournisseurs, clauses de sécurité, évaluations de risque fournisseur." }
        ],
        "e": [
            { ctrl: "Vérifier l'intégration de la sécurité à l'acquisition, au développement et à la maintenance des SI, y compris la gestion et la divulgation des vulnérabilités.", preuve: "Politique de développement sécurisé, processus de gestion des vulnérabilités, politique de divulgation coordonnée." }
        ],
        "f": [
            { ctrl: "Vérifier l'existence de procédures pour évaluer l'efficacité des mesures de gestion des risques de cybersécurité.", preuve: "Indicateurs/KPI de sécurité, audits, revues d'efficacité." }
        ],
        "g": [
            { ctrl: "Vérifier la mise en œuvre de pratiques d'hygiène informatique de base et de formations à la cybersécurité.", preuve: "Programme de sensibilisation/formation, socle d'hygiène, taux de participation." }
        ],
        "h": [
            { ctrl: "Vérifier l'existence de politiques et procédures d'usage de la cryptographie et du chiffrement.", preuve: "Politique cryptographique, périmètre de chiffrement, gestion des clés." }
        ],
        "i": [
            { ctrl: "Vérifier les mesures de sécurité des ressources humaines, la politique de contrôle d'accès et l'inventaire/gestion des actifs.", preuve: "Politique RH sécurité, politique de contrôle d'accès, inventaire des actifs." }
        ],
        "j": [
            { ctrl: "Vérifier le recours à l'authentification multifacteur et à des communications sécurisées (voix, vidéo, texte et communications d'urgence).", preuve: "Configuration MFA, solutions de communication sécurisées, périmètre couvert." }
        ]
    });
})();
