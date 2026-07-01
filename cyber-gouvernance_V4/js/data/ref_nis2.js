// Emplacement : js/data/ref_nis2.js
// Nom du fichier : ref_nis2.js
//
// Référentiel NIS2 — mesures de gestion des risques de cybersécurité de
// l'article 21(2) de la directive (UE) 2022/2555. Les 10 mesures (a→j) sont
// REGROUPÉES ÉDITORIALEMENT en 4 thèmes pour un radar lisible (la directive les
// énumère à plat). Reformulations originales courtes + aide pédagogique.
//
// S'auto-enregistre dans le registre `Referentiels`.

(function () {
    if (typeof Referentiels === "undefined") return;

    Referentiels.register({
        id: "nis2-art21",
        nom: "NIS2 — mesures art. 21",
        editeur: "Directive (UE) 2022/2555",
        version: "10 mesures",
        description: "Mesures minimales de gestion des risques imposées aux entités essentielles et importantes par la directive européenne NIS2 (article 21). Transposée en droit national, elle élargit fortement le périmètre des organisations concernées.",
        aide: "NIS2 impose une approche par les risques « tous risques » et rend l'organe de direction responsable. Les 10 mesures ci-dessous sont regroupées par thème pour la lisibilité ; la référence reste le texte de la directive.",
        domaines: [
            {
                id: "gouvernance", nom: "Gouvernance des risques", court: "Gouvernance",
                aide: "Analyser les risques, se doter de politiques et vérifier leur efficacité.",
                exigences: [
                    { code: "a", titre: "Politiques d'analyse des risques et de sécurité des SI", aide: "Disposer de politiques d'analyse de risque et de sécurité des systèmes d'information." },
                    { code: "f", titre: "Évaluation de l'efficacité des mesures", aide: "Mettre en place des procédures pour mesurer si les dispositifs de sécurité sont efficaces." }
                ]
            },
            {
                id: "incidents", nom: "Incidents & continuité", court: "Incidents",
                aide: "Traiter les incidents et garantir la continuité en cas de crise.",
                exigences: [
                    { code: "b", titre: "Gestion des incidents", aide: "Détecter, traiter et notifier les incidents de sécurité." },
                    { code: "c", titre: "Continuité d'activité et gestion de crise", aide: "Sauvegardes, reprise après sinistre et gestion de crise." }
                ]
            },
            {
                id: "chaine", nom: "Chaîne d'approvisionnement & développement", court: "Chaîne & Dév.",
                aide: "Sécuriser les fournisseurs et le cycle de vie des systèmes.",
                exigences: [
                    { code: "d", titre: "Sécurité de la chaîne d'approvisionnement", aide: "Maîtriser les risques liés aux fournisseurs et prestataires directs." },
                    { code: "e", titre: "Sécurité de l'acquisition, du développement et de la maintenance", aide: "Inclut la gestion et la divulgation des vulnérabilités." }
                ]
            },
            {
                id: "hygiene", nom: "Hygiène, accès & cryptographie", court: "Hygiène & Accès",
                aide: "Les fondamentaux : formation, cryptographie, gestion des accès et authentification forte.",
                exigences: [
                    { code: "g", titre: "Cyberhygiène et formation", aide: "Pratiques d'hygiène de base et formation à la cybersécurité." },
                    { code: "h", titre: "Cryptographie et chiffrement", aide: "Politiques et procédures d'usage de la cryptographie." },
                    { code: "i", titre: "Sécurité RH, contrôle d'accès et gestion des actifs", aide: "Sécurité des ressources humaines, politiques d'accès et inventaire des actifs." },
                    { code: "j", titre: "Authentification forte et communications sécurisées", aide: "Authentification multifacteur et communications (voix, vidéo, texte, urgence) sécurisées." }
                ]
            }
        ]
    });
})();
