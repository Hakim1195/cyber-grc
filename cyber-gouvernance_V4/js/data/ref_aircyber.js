// Emplacement : js/data/ref_aircyber.js
// Nom du fichier : ref_aircyber.js
//
// Référentiel « AirCyber (préparation) » — AUTO-POSITIONNEMENT INDICATIF inspiré
// des attentes de cybersécurité de la filière aéronautique (démarche de maturité
// Bronze / Silver / Gold portée par BoostAerospace). Contenu 100 % ORIGINAL :
// ce n'est PAS le questionnaire officiel AirCyber et cela ne remplace pas
// l'évaluation officielle. Utile à un sous-traitant aéro (ex. Dedienne) pour se
// préparer et suivre ses progrès.
//
// S'auto-enregistre dans le registre `Referentiels`.

(function () {
    if (typeof Referentiels === "undefined") return;

    Referentiels.register({
        id: "aircyber-prep",
        nom: "AirCyber (préparation)",
        editeur: "Filière aéronautique",
        version: "Auto-positionnement",
        description: "Auto-positionnement indicatif pour préparer une évaluation de maturité cyber de la filière aéronautique (approche Bronze / Silver / Gold). Contenu original — ne remplace pas l'évaluation officielle AirCyber / BoostAerospace.",
        aide: "Pour un sous-traitant aéronautique, la cybersécurité est un critère d'accès aux marchés. Ce référentiel indicatif aide à se situer et à progresser vers les niveaux Bronze, Silver puis Gold. Les intitulés sont des reformulations maison des bonnes pratiques attendues.",
        domaines: [
            {
                id: "gouv", nom: "Gouvernance & organisation", court: "Gouvernance",
                aide: "Piloter la cybersécurité : responsable désigné, politique, analyse de risque.",
                exigences: [
                    { code: "G1", titre: "Responsable cybersécurité désigné", aide: "Une personne identifiée pilote la sécurité et est connue de la direction." },
                    { code: "G2", titre: "Politique de sécurité formalisée", aide: "Un document cadre validé par la direction, communiqué au personnel." },
                    { code: "G3", titre: "Analyse de risque des activités sensibles", aide: "Identifier les activités et données critiques pour les clients aéronautiques." }
                ]
            },
            {
                id: "prot", nom: "Protection des systèmes", court: "Protection",
                aide: "Les fondamentaux techniques : accès, postes, réseau, mises à jour.",
                exigences: [
                    { code: "P1", titre: "Gestion des accès et authentification forte", aide: "Comptes nominatifs, moindre privilège et MFA sur les accès sensibles." },
                    { code: "P2", titre: "Durcissement et protection des postes", aide: "Antivirus, mises à jour, comptes limités sur l'ensemble du parc." },
                    { code: "P3", titre: "Cloisonnement du réseau", aide: "Séparer bureautique, production et éventuels systèmes industriels." },
                    { code: "P4", titre: "Protection des données clients", aide: "Chiffrement et contrôle des échanges de données sensibles (plans, spécifications)." }
                ]
            },
            {
                id: "det", nom: "Détection & journalisation", court: "Détection",
                aide: "Voir ce qui se passe pour détecter une attaque à temps.",
                exigences: [
                    { code: "D1", titre: "Journalisation des systèmes clés", aide: "Activer et conserver les journaux des composants importants." },
                    { code: "D2", titre: "Surveillance et alertes", aide: "Détecter les comportements anormaux et être alerté." }
                ]
            },
            {
                id: "reac", nom: "Réaction & continuité", court: "Réaction",
                aide: "Savoir réagir à un incident et redémarrer l'activité.",
                exigences: [
                    { code: "R1", titre: "Procédure de gestion des incidents", aide: "Qui fait quoi en cas d'incident, avec les contacts utiles." },
                    { code: "R2", titre: "Sauvegardes testées", aide: "Sauvegardes régulières, déconnectées et dont la restauration est testée." },
                    { code: "R3", titre: "Plan de continuité", aide: "Pouvoir maintenir ou reprendre l'activité après une perturbation." }
                ]
            },
            {
                id: "chain", nom: "Chaîne d'approvisionnement", court: "Chaîne appro.",
                aide: "La sécurité se propage à vos propres fournisseurs et sous-traitants.",
                exigences: [
                    { code: "C1", titre: "Exigences cyber envers les fournisseurs", aide: "Répercuter des exigences de sécurité sur vos propres sous-traitants." },
                    { code: "C2", titre: "Sensibilisation du personnel", aide: "Former les collaborateurs aux risques (hameçonnage, fuite de plans…)." }
                ]
            }
        ]
    });
})();
