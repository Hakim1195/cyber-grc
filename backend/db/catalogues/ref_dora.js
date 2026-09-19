// Emplacement : js/data/ref_dora.js
// Nom du fichier : ref_dora.js
//
// Référentiel DORA — Règlement (UE) 2022/2554 sur la résilience opérationnelle
// numérique du secteur financier. Représentation SYNTHÉTIQUE des 5 piliers en
// mesures reformulées (le règlement n'est pas reproduit). Pertinent pour les
// entités financières et leurs prestataires TIC.
//
// S'auto-enregistre dans le registre `Referentiels`.

(function () {
    if (typeof Referentiels === "undefined") return;

    Referentiels.register({
        id: "dora",
        nom: "DORA — résilience opérationnelle",
        editeur: "Règlement (UE) 2022/2554",
        version: "5 piliers",
        description: "Cadre européen de résilience opérationnelle numérique pour le secteur financier : gestion du risque TIC, incidents, tests, risque lié aux tiers et partage d'information.",
        aide: "DORA vise à garantir que les acteurs financiers résistent aux perturbations informatiques. Synthèse des 5 piliers en mesures indicatives ; la référence reste le règlement et ses normes techniques (RTS/ITS).",
        domaines: [
            {
                id: "p1", nom: "Gestion du risque TIC", court: "Risque TIC",
                aide: "Un cadre de gouvernance et de maîtrise du risque informatique piloté par la direction.",
                exigences: [
                    { code: "1.1", titre: "Cadre de gestion du risque TIC", aide: "Gouvernance, responsabilité de l'organe de direction et cadre documenté." },
                    { code: "1.2", titre: "Cartographie des actifs et dépendances", aide: "Identifier les fonctions, actifs et dépendances TIC critiques." },
                    { code: "1.3", titre: "Protection et prévention", aide: "Mesures de sécurité et de continuité pour prévenir les incidents." },
                    { code: "1.4", titre: "Détection des anomalies", aide: "Détecter rapidement les activités anormales et les incidents TIC." },
                    { code: "1.5", titre: "Politique de continuité et de reprise", aide: "Sauvegardes, plans de reprise, objectifs de temps et de point de reprise." }
                ]
            },
            {
                id: "p2", nom: "Gestion des incidents TIC", court: "Incidents",
                aide: "Traiter, classer et déclarer les incidents liés aux TIC.",
                exigences: [
                    { code: "2.1", titre: "Processus de gestion des incidents TIC", aide: "Détecter, enregistrer et traiter les incidents de manière cohérente." },
                    { code: "2.2", titre: "Classification des incidents", aide: "Évaluer l'importance des incidents selon des critères définis." },
                    { code: "2.3", titre: "Notification des incidents majeurs", aide: "Déclarer les incidents majeurs aux autorités compétentes dans les délais." }
                ]
            },
            {
                id: "p3", nom: "Tests de résilience", court: "Tests",
                aide: "Éprouver régulièrement la résilience, jusqu'aux tests avancés fondés sur la menace.",
                exigences: [
                    { code: "3.1", titre: "Programme de tests de résilience", aide: "Tester régulièrement outils et systèmes TIC (vulnérabilités, scénarios)." },
                    { code: "3.2", titre: "Tests avancés (TLPT)", aide: "Tests d'intrusion fondés sur la menace pour les entités concernées." }
                ]
            },
            {
                id: "p4", nom: "Risque lié aux tiers TIC", court: "Tiers TIC",
                aide: "Maîtriser la dépendance aux prestataires informatiques, dont le cloud.",
                exigences: [
                    { code: "4.1", titre: "Registre des prestataires TIC", aide: "Tenir un registre des accords avec les fournisseurs de services TIC." },
                    { code: "4.2", titre: "Exigences contractuelles clés", aide: "Clauses obligatoires (accès, audit, sécurité, sous-traitance)." },
                    { code: "4.3", titre: "Surveillance des prestataires critiques", aide: "Suivre les prestataires TIC critiques et concentrer les risques." },
                    { code: "4.4", titre: "Stratégie de sortie", aide: "Prévoir la réversibilité et la sortie des services critiques." }
                ]
            },
            {
                id: "p5", nom: "Partage d'information", court: "Partage",
                aide: "Échanger sur les cybermenaces pour renforcer la résilience collective.",
                exigences: [
                    { code: "5.1", titre: "Partage de renseignements sur les menaces", aide: "Participer à des dispositifs d'échange d'information sur les cybermenaces." }
                ]
            }
        ]
    });
})();
