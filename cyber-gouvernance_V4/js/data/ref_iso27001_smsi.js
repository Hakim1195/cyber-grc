// Emplacement : js/data/ref_iso27001_smsi.js
// Nom du fichier : ref_iso27001_smsi.js
//
// Référentiel ISO/IEC 27001:2022 — SYSTÈME DE MANAGEMENT (chapitres 4 à 10).
// Ce sont les EXIGENCES du SMSI (les « shall » des chapitres 4-10), distinctes des
// 93 mesures de l'Annexe A (voir ref_iso27002.js). Un audit de certification /
// clause 9.2 vérifie AVANT TOUT la conformité à ces exigences de management.
//
// Contenu = REFORMULATIONS ORIGINALES COURTES + aide pédagogique (le texte de la
// norme ISO est protégé et N'EST PAS reproduit ; seuls l'identifiant de clause
// « 6.1.2 » et un intitulé court paraphrasé sont fournis). Référence officielle :
// ISO/IEC 27001:2022, chapitres 4 à 10.
//
// NB : ces exigences sont MANDATOIRES (pas d'« applicabilité » à déclarer, à la
// différence de l'Annexe A) — d'où un référentiel séparé, qui n'alimente pas la SoA.
//
// S'auto-enregistre dans le registre `Referentiels`.

(function () {
    if (typeof Referentiels === "undefined") return;

    Referentiels.register({
        id: "iso27001-smsi",
        nom: "ISO/IEC 27001:2022 — Système de management",
        editeur: "ISO/IEC",
        version: "Chap. 4-10 · SMSI",
        description: "Exigences du système de management de la sécurité de l'information (SMSI) d'ISO/IEC 27001:2022 — chapitres 4 à 10 : contexte, leadership, planification, support, fonctionnement, évaluation des performances et amélioration. Ce sont ces exigences que vérifie un audit clause 9.2 (en complément des mesures de l'Annexe A).",
        aide: "Là où l'Annexe A liste des mesures de sécurité (parmi lesquelles on choisit via la SoA), les chapitres 4 à 10 sont les exigences OBLIGATOIRES du système de management : elles décrivent comment piloter la sécurité dans la durée (PDCA). Intitulés reformulés — se référer à la norme officielle pour le texte exact.",
        domaines: [
            {
                id: "c4", nom: "4. Contexte de l'organisation", court: "Contexte",
                aide: "Poser les fondations : comprendre l'organisation, ses parties intéressées et fixer le périmètre du SMSI.",
                exigences: [
                    { code: "4.1", titre: "Comprendre l'organisation et son contexte", aide: "Identifier les enjeux internes et externes pertinents pour le SMSI (finalité, métier, réglementation, environnement)." },
                    { code: "4.2", titre: "Identifier les parties intéressées et leurs exigences", aide: "Déterminer les parties intéressées pertinentes (clients, autorités, salariés…) et leurs exigences, y compris légales et contractuelles." },
                    { code: "4.3", titre: "Définir le périmètre du SMSI", aide: "Fixer les limites et l'applicabilité du système : activités, sites, actifs, interfaces et dépendances." },
                    { code: "4.4", titre: "Établir et améliorer le SMSI", aide: "Mettre en place, tenir à jour et améliorer en continu le SMSI et ses processus conformément à la norme." }
                ]
            },
            {
                id: "c5", nom: "5. Leadership", court: "Leadership",
                aide: "L'engagement de la direction : politique, ressources et responsabilités.",
                exigences: [
                    { code: "5.1", titre: "Démontrer le leadership et l'engagement de la direction", aide: "La direction impulse la politique, l'intègre aux processus métier, fournit les ressources et soutient les acteurs." },
                    { code: "5.2", titre: "Établir une politique de sécurité de l'information", aide: "Une politique adaptée à l'organisation, cadrant les objectifs, communiquée et disponible comme information documentée." },
                    { code: "5.3", titre: "Attribuer rôles, responsabilités et autorités", aide: "Désigner et communiquer les responsabilités pour la conformité du SMSI et le reporting de sa performance." }
                ]
            },
            {
                id: "c6", nom: "6. Planification", court: "Planification",
                aide: "Traiter les risques, fixer des objectifs et planifier les changements.",
                exigences: [
                    { code: "6.1.1", titre: "Planifier les actions face aux risques et opportunités", aide: "À partir du contexte (4.1) et des exigences (4.2), déterminer les risques et opportunités à traiter et planifier les actions." },
                    { code: "6.1.2", titre: "Définir un processus d'appréciation des risques", aide: "Méthode reproductible d'identification, d'analyse et d'évaluation des risques, avec critères d'appréciation et d'acceptation." },
                    { code: "6.1.3", titre: "Définir un processus de traitement des risques", aide: "Choisir les options, déterminer les mesures (comparaison à l'Annexe A), produire la SoA et le plan de traitement, obtenir l'accord des propriétaires du risque." },
                    { code: "6.2", titre: "Fixer des objectifs de sécurité et planifier leur atteinte", aide: "Objectifs cohérents avec la politique, mesurables, suivis, avec ressources, responsables et échéances." },
                    { code: "6.3", titre: "Planifier les modifications du SMSI", aide: "Conduire de façon planifiée les changements nécessaires au SMSI (nouveauté de la version 2022)." }
                ]
            },
            {
                id: "c7", nom: "7. Support", court: "Support",
                aide: "Les moyens : ressources, compétences, sensibilisation, communication et documentation.",
                exigences: [
                    { code: "7.1", titre: "Fournir les ressources nécessaires au SMSI", aide: "Déterminer et allouer les ressources pour établir, mettre en œuvre, tenir à jour et améliorer le SMSI." },
                    { code: "7.2", titre: "Assurer les compétences des personnes", aide: "Déterminer les compétences requises, les acquérir (formation, recrutement) et en conserver la preuve." },
                    { code: "7.3", titre: "Sensibiliser le personnel", aide: "Chacun connaît la politique, sa contribution à l'efficacité du SMSI et les conséquences d'un non-respect." },
                    { code: "7.4", titre: "Organiser la communication interne et externe", aide: "Déterminer quoi, quand, avec qui et comment communiquer au sujet du SMSI." },
                    { code: "7.5.1", titre: "Tenir les informations documentées exigées", aide: "Le SMSI inclut la documentation exigée par la norme et celle jugée nécessaire à son efficacité." },
                    { code: "7.5.2", titre: "Maîtriser la création et la mise à jour des documents", aide: "Identification, format et support appropriés ; revue et approbation." },
                    { code: "7.5.3", titre: "Maîtriser la diffusion et la protection des documents", aide: "Disponibilité, protection, distribution, versions, conservation et élimination ; maîtrise des documents d'origine externe." }
                ]
            },
            {
                id: "c8", nom: "8. Fonctionnement", court: "Fonctionnement",
                aide: "Exécuter : maîtriser les opérations et mettre en œuvre l'appréciation et le traitement des risques.",
                exigences: [
                    { code: "8.1", titre: "Planifier et maîtriser les opérations", aide: "Mettre en œuvre les processus nécessaires au traitement des risques, maîtriser les changements et les processus externalisés." },
                    { code: "8.2", titre: "Réaliser les appréciations des risques planifiées", aide: "Apprécier les risques à intervalles planifiés ou lors de changements notables, et en conserver la preuve." },
                    { code: "8.3", titre: "Mettre en œuvre le plan de traitement des risques", aide: "Exécuter le plan de traitement des risques et en conserver la preuve." }
                ]
            },
            {
                id: "c9", nom: "9. Évaluation des performances", court: "Évaluation",
                aide: "Vérifier : mesurer la performance, auditer et faire la revue de direction.",
                exigences: [
                    { code: "9.1", titre: "Surveiller, mesurer, analyser et évaluer", aide: "Déterminer quoi mesurer, avec quelles méthodes, quand et par qui, pour évaluer la performance et l'efficacité du SMSI." },
                    { code: "9.2.1", titre: "Réaliser des audits internes", aide: "Vérifier à intervalles planifiés que le SMSI est conforme aux exigences propres et à la norme, et effectivement mis en œuvre." },
                    { code: "9.2.2", titre: "Établir un programme d'audit interne", aide: "Planifier fréquence, méthodes et responsabilités ; auditeurs objectifs et impartiaux ; résultats rapportés et conservés." },
                    { code: "9.3.1", titre: "Réaliser des revues de direction", aide: "La direction revoit le SMSI à intervalles planifiés pour s'assurer de sa pertinence, adéquation et efficacité." },
                    { code: "9.3.2", titre: "Examiner les éléments d'entrée requis", aide: "Suivi des actions, évolutions du contexte, performance, non-conformités, résultats d'audit et d'appréciation des risques, retours des parties intéressées." },
                    { code: "9.3.3", titre: "Acter les décisions de la revue", aide: "Produire des décisions d'amélioration continue et de changement du SMSI, et en conserver la preuve." }
                ]
            },
            {
                id: "c10", nom: "10. Amélioration", court: "Amélioration",
                aide: "Progresser : améliorer en continu et traiter les non-conformités.",
                exigences: [
                    { code: "10.1", titre: "Améliorer en continu le SMSI", aide: "Améliorer en permanence la pertinence, l'adéquation et l'efficacité du système." },
                    { code: "10.2", titre: "Traiter les non-conformités et mener les actions correctives", aide: "Réagir, corriger, analyser les causes, agir pour éviter la récurrence, vérifier l'efficacité et conserver la preuve." }
                ]
            }
        ]
    });
})();
