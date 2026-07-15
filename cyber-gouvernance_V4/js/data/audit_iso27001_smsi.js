// Emplacement : js/data/audit_iso27001_smsi.js
// Nom du fichier : audit_iso27001_smsi.js
//
// MODÈLE D'AUDIT du référentiel « ISO/IEC 27001:2022 — Système de management »
// (chapitres 4 à 10, voir ref_iso27001_smsi.js).
//
// GRANULARITÉ FINE : chaque clause du référentiel (ex. « 4.1 ») est ici ÉCLATÉE en
// sous-exigences correspondant aux « shall » élémentaires de la norme (ex. « 4.1a »,
// « 4.1b »…). Chaque sous-exigence est un POINT DE CONTRÔLE autonome (sous-code +
// intitulé + ce qu'il faut vérifier + preuves à demander). Le référentiel, lui,
// reste au niveau des 30 clauses (auto-évaluation lisible) — la finesse est portée
// par l'audit. Total : 84 points de contrôle. Reformulations maison (texte ISO non
// reproduit).
//
// Le modèle est indexé par le code de clause du référentiel (le point porte son
// propre `code`/`intitule` de sous-exigence ; il hérite du domaine = chapitre).
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("iso27001-smsi", {
        // ===== 4. Contexte de l'organisation =====
        "4.1": [
            { code: "4.1a", intitule: "Enjeux externes déterminés", ctrl: "Vérifier que les enjeux externes pertinents (légaux, réglementaires, technologiques, concurrentiels, sectoriels) sont déterminés.", preuve: "Analyse de contexte externe (PESTEL), veille, date de mise à jour." },
            { code: "4.1b", intitule: "Enjeux internes déterminés", ctrl: "Vérifier que les enjeux internes pertinents (gouvernance, organisation, ressources, culture) sont déterminés.", preuve: "Analyse de contexte interne, compte rendu de revue." }
        ],
        "4.2": [
            { code: "4.2a", intitule: "Parties intéressées déterminées", ctrl: "Vérifier que les parties intéressées pertinentes pour le SMSI sont identifiées.", preuve: "Registre des parties intéressées." },
            { code: "4.2b", intitule: "Exigences des parties intéressées déterminées", ctrl: "Vérifier que les exigences pertinentes de ces parties (dont légales et contractuelles) sont déterminées.", preuve: "Registre des exigences, veille légale/contractuelle." },
            { code: "4.2c", intitule: "Exigences traitées via le SMSI", ctrl: "Vérifier que l'organisation a déterminé lesquelles de ces exigences seront traitées par le SMSI.", preuve: "Analyse d'applicabilité des exigences." }
        ],
        "4.3": [
            { code: "4.3a", intitule: "Limites et applicabilité déterminées", ctrl: "Vérifier que les limites et l'applicabilité du SMSI sont déterminées en tenant compte des enjeux (4.1), des exigences (4.2), des interfaces et des dépendances.", preuve: "Document de périmètre, interfaces et dépendances." },
            { code: "4.3b", intitule: "Périmètre documenté", ctrl: "Vérifier que le périmètre est disponible sous forme d'information documentée.", preuve: "Document de périmètre daté/approuvé." }
        ],
        "4.4": [
            { code: "4.4a", intitule: "SMSI établi et amélioré", ctrl: "Vérifier que le SMSI et ses processus (et leurs interactions) sont établis, mis en œuvre, tenus à jour et améliorés en continu.", preuve: "Description du SMSI, cartographie des processus." }
        ],

        // ===== 5. Leadership =====
        "5.1": [
            { code: "5.1a", intitule: "Politique et objectifs alignés à la stratégie", ctrl: "Vérifier que la direction s'assure que la politique et les objectifs de sécurité sont établis et compatibles avec l'orientation stratégique.", preuve: "Politique, objectifs, lien avec la stratégie." },
            { code: "5.1b", intitule: "Intégration aux processus métier", ctrl: "Vérifier l'intégration des exigences du SMSI dans les processus métier de l'organisation.", preuve: "Processus métier intégrant la sécurité." },
            { code: "5.1c", intitule: "Ressources disponibles", ctrl: "Vérifier que les ressources nécessaires au SMSI sont disponibles.", preuve: "Budget, effectifs, décisions d'allocation." },
            { code: "5.1d", intitule: "Importance communiquée", ctrl: "Vérifier que la direction communique l'importance d'un management efficace de la sécurité et de la conformité au SMSI.", preuve: "Communications de la direction." },
            { code: "5.1e", intitule: "Atteinte des résultats assurée", ctrl: "Vérifier que la direction s'assure que le SMSI atteint les résultats attendus.", preuve: "Revues de direction, suivi des objectifs." },
            { code: "5.1f", intitule: "Personnes orientées, amélioration promue", ctrl: "Vérifier que la direction oriente et soutient les personnes, promeut l'amélioration continue et soutient les autres managers.", preuve: "Comptes rendus, actions de soutien." }
        ],
        "5.2": [
            { code: "5.2a", intitule: "Politique adaptée à la finalité", ctrl: "Vérifier que la politique de sécurité est adaptée à la finalité de l'organisation.", preuve: "Politique de sécurité." },
            { code: "5.2b", intitule: "Cadre d'objectifs", ctrl: "Vérifier que la politique inclut des objectifs de sécurité ou un cadre pour les fixer.", preuve: "Politique, objectifs." },
            { code: "5.2c", intitule: "Engagement de conformité", ctrl: "Vérifier l'engagement à satisfaire les exigences applicables en matière de sécurité de l'information.", preuve: "Politique (clause d'engagement)." },
            { code: "5.2d", intitule: "Engagement d'amélioration continue", ctrl: "Vérifier l'engagement d'amélioration continue du SMSI.", preuve: "Politique (clause d'amélioration)." },
            { code: "5.2e", intitule: "Politique documentée, communiquée, disponible", ctrl: "Vérifier que la politique est documentée, communiquée en interne et mise à disposition des parties intéressées le cas échéant.", preuve: "Preuve de diffusion et de mise à disposition." }
        ],
        "5.3": [
            { code: "5.3a", intitule: "Responsabilités attribuées et communiquées", ctrl: "Vérifier que les responsabilités et autorités des rôles pertinents pour la sécurité sont attribuées et communiquées.", preuve: "Fiches de rôle, organigramme." },
            { code: "5.3b", intitule: "Responsabilité de conformité du SMSI", ctrl: "Vérifier l'attribution de la responsabilité de la conformité du SMSI à la norme.", preuve: "Lettre de mission, désignation." },
            { code: "5.3c", intitule: "Reporting de la performance à la direction", ctrl: "Vérifier l'attribution de la responsabilité du reporting de la performance du SMSI à la direction.", preuve: "Comptes rendus de reporting." }
        ],

        // ===== 6. Planification =====
        "6.1.1": [
            { code: "6.1.1a", intitule: "Risques et opportunités déterminés", ctrl: "Vérifier que les risques et opportunités à traiter sont déterminés à partir des enjeux (4.1) et des exigences (4.2).", preuve: "Analyse des risques et opportunités." },
            { code: "6.1.1b", intitule: "Actions planifiées et évaluées", ctrl: "Vérifier que les actions face à ces risques/opportunités sont planifiées, intégrées au SMSI et que leur efficacité est évaluée.", preuve: "Plan d'actions, évaluation d'efficacité." }
        ],
        "6.1.2": [
            { code: "6.1.2a", intitule: "Critères de risque établis", ctrl: "Vérifier l'établissement et la maintenance des critères d'appréciation et d'acceptation des risques.", preuve: "Critères de risque documentés." },
            { code: "6.1.2b", intitule: "Appréciations cohérentes et comparables", ctrl: "Vérifier que le processus produit des résultats cohérents, valides et comparables.", preuve: "Méthodologie, exemples reproductibles." },
            { code: "6.1.2c", intitule: "Risques identifiés avec propriétaires", ctrl: "Vérifier l'identification des risques (perte de confidentialité, d'intégrité, de disponibilité) et l'attribution d'un propriétaire à chacun.", preuve: "Registre des risques, propriétaires." },
            { code: "6.1.2d", intitule: "Risques analysés", ctrl: "Vérifier l'analyse des risques (conséquences potentielles, vraisemblance, niveau de risque).", preuve: "Analyse cotée." },
            { code: "6.1.2e", intitule: "Risques évalués et priorisés", ctrl: "Vérifier l'évaluation des risques par comparaison aux critères et leur priorisation pour le traitement.", preuve: "Résultats d'évaluation, priorisation." }
        ],
        "6.1.3": [
            { code: "6.1.3a", intitule: "Options de traitement choisies", ctrl: "Vérifier le choix des options de traitement adaptées aux résultats de l'appréciation.", preuve: "Décisions de traitement." },
            { code: "6.1.3b", intitule: "Mesures nécessaires déterminées", ctrl: "Vérifier la détermination des mesures nécessaires à la mise en œuvre des options de traitement.", preuve: "Liste des mesures." },
            { code: "6.1.3c", intitule: "Comparaison à l'Annexe A", ctrl: "Vérifier la comparaison des mesures retenues avec l'Annexe A pour s'assurer qu'aucune mesure nécessaire n'est omise.", preuve: "Analyse d'écart vis-à-vis de l'Annexe A." },
            { code: "6.1.3d", intitule: "Déclaration d'applicabilité (SoA)", ctrl: "Vérifier la production d'une SoA (mesures retenues, justifications d'inclusion/exclusion, état de mise en œuvre).", preuve: "Déclaration d'applicabilité." },
            { code: "6.1.3e", intitule: "Plan de traitement des risques", ctrl: "Vérifier l'élaboration d'un plan de traitement des risques.", preuve: "Plan de traitement des risques." },
            { code: "6.1.3f", intitule: "Approbation des propriétaires du risque", ctrl: "Vérifier l'approbation du plan de traitement et l'acceptation des risques résiduels par les propriétaires du risque.", preuve: "Preuves d'approbation et d'acceptation." }
        ],
        "6.2": [
            { code: "6.2a", intitule: "Objectifs de sécurité définis", ctrl: "Vérifier que les objectifs de sécurité sont cohérents avec la politique, mesurables, communiqués, mis à jour et documentés.", preuve: "Objectifs documentés." },
            { code: "6.2b", intitule: "Atteinte des objectifs planifiée", ctrl: "Vérifier la planification de l'atteinte des objectifs (quoi, ressources, responsables, échéances, évaluation des résultats).", preuve: "Plans d'action, suivi." }
        ],
        "6.3": [
            { code: "6.3a", intitule: "Modifications planifiées", ctrl: "Vérifier que les modifications du SMSI sont réalisées de façon planifiée.", preuve: "Procédure de gestion du changement, exemples." }
        ],

        // ===== 7. Support =====
        "7.1": [
            { code: "7.1a", intitule: "Ressources fournies", ctrl: "Vérifier la détermination et la fourniture des ressources nécessaires au SMSI.", preuve: "Budget, effectifs, plan de charge." }
        ],
        "7.2": [
            { code: "7.2a", intitule: "Compétences déterminées", ctrl: "Vérifier la détermination des compétences nécessaires des personnes influant sur la performance de la sécurité.", preuve: "Matrice de compétences." },
            { code: "7.2b", intitule: "Compétences assurées", ctrl: "Vérifier que ces compétences sont assurées (formation, expérience) et que des actions sont prises en cas d'écart.", preuve: "Plan de formation, actions correctives." },
            { code: "7.2c", intitule: "Preuves de compétence conservées", ctrl: "Vérifier la conservation d'informations documentées comme preuve des compétences.", preuve: "Attestations, certifications." }
        ],
        "7.3": [
            { code: "7.3a", intitule: "Sensibilisation à la politique", ctrl: "Vérifier que les personnes sont sensibilisées à la politique de sécurité de l'information.", preuve: "Programme de sensibilisation, participation." },
            { code: "7.3b", intitule: "Sensibilisation à la contribution et aux conséquences", ctrl: "Vérifier la sensibilisation à la contribution de chacun à l'efficacité du SMSI et aux conséquences d'un non-respect.", preuve: "Supports, campagnes." }
        ],
        "7.4": [
            { code: "7.4a", intitule: "Communication déterminée", ctrl: "Vérifier la détermination des besoins de communication interne et externe (quoi, quand, avec qui, comment).", preuve: "Plan de communication." }
        ],
        "7.5.1": [
            { code: "7.5.1a", intitule: "Documentation exigée présente", ctrl: "Vérifier la présence de la documentation exigée par la norme et de celle jugée nécessaire à l'efficacité du SMSI.", preuve: "Liste maîtresse des documents." }
        ],
        "7.5.2": [
            { code: "7.5.2a", intitule: "Identification et format appropriés", ctrl: "Vérifier une identification, un format et un support appropriés des informations documentées.", preuve: "Documents référencés et versionnés." },
            { code: "7.5.2b", intitule: "Revue et approbation", ctrl: "Vérifier la revue et l'approbation des documents (pertinence et adéquation).", preuve: "Preuves d'approbation." }
        ],
        "7.5.3": [
            { code: "7.5.3a", intitule: "Disponibilité et protection", ctrl: "Vérifier la disponibilité et la protection des informations documentées.", preuve: "Contrôle d'accès, sauvegarde des documents." },
            { code: "7.5.3b", intitule: "Maîtrise (distribution, stockage, versions)", ctrl: "Vérifier la maîtrise de la distribution, de l'accès, du stockage, des versions, de la conservation et de l'élimination des documents.", preuve: "Procédure de gestion documentaire." },
            { code: "7.5.3c", intitule: "Documents externes maîtrisés", ctrl: "Vérifier l'identification et la maîtrise des documents d'origine externe nécessaires au SMSI.", preuve: "Registre des documents externes." }
        ],

        // ===== 8. Fonctionnement =====
        "8.1": [
            { code: "8.1a", intitule: "Processus opérationnels maîtrisés", ctrl: "Vérifier la planification, la mise en œuvre et la maîtrise des processus nécessaires (critères et maîtrise des changements).", preuve: "Procédures opérationnelles, critères de maîtrise." },
            { code: "8.1b", intitule: "Processus externalisés maîtrisés", ctrl: "Vérifier que les processus, produits et services externalisés pertinents sont déterminés et maîtrisés.", preuve: "Suivi des externalisations." },
            { code: "8.1c", intitule: "Informations documentées conservées", ctrl: "Vérifier la conservation des informations documentées confirmant que les processus ont été réalisés comme prévu.", preuve: "Enregistrements opérationnels." }
        ],
        "8.2": [
            { code: "8.2a", intitule: "Appréciations réalisées", ctrl: "Vérifier la réalisation des appréciations des risques à intervalles planifiés ou lors de changements notables.", preuve: "Appréciations datées, déclencheurs." },
            { code: "8.2b", intitule: "Résultats conservés", ctrl: "Vérifier la conservation des résultats des appréciations des risques.", preuve: "Registre des risques à jour." }
        ],
        "8.3": [
            { code: "8.3a", intitule: "Plan de traitement mis en œuvre", ctrl: "Vérifier la mise en œuvre du plan de traitement des risques.", preuve: "État d'avancement du plan." },
            { code: "8.3b", intitule: "Résultats conservés", ctrl: "Vérifier la conservation des résultats du traitement des risques.", preuve: "Preuves de mise en œuvre." }
        ],

        // ===== 9. Évaluation des performances =====
        "9.1": [
            { code: "9.1a", intitule: "Objet de la surveillance déterminé", ctrl: "Vérifier la détermination de ce qui doit être surveillé et mesuré.", preuve: "Plan de mesure / indicateurs." },
            { code: "9.1b", intitule: "Méthodes et responsabilités déterminées", ctrl: "Vérifier la détermination des méthodes, des moments et des responsables de la surveillance, de la mesure, de l'analyse et de l'évaluation.", preuve: "Plan de mesure (méthodes / qui / quand)." },
            { code: "9.1c", intitule: "Performance évaluée, preuves conservées", ctrl: "Vérifier l'évaluation de la performance et de l'efficacité du SMSI et la conservation des preuves.", preuve: "Tableaux de bord, analyses conservées." }
        ],
        "9.2.1": [
            { code: "9.2.1a", intitule: "Audits internes réalisés", ctrl: "Vérifier la réalisation d'audits internes à intervalles planifiés.", preuve: "Rapports d'audit interne, planning." },
            { code: "9.2.1b", intitule: "Conformité et mise en œuvre vérifiées", ctrl: "Vérifier que les audits couvrent la conformité aux exigences propres et à la norme, ainsi que la mise en œuvre effective.", preuve: "Périmètre des audits, constats." }
        ],
        "9.2.2": [
            { code: "9.2.2a", intitule: "Programme d'audit établi", ctrl: "Vérifier la planification, l'établissement et le maintien d'un programme d'audit (fréquence, méthodes, responsabilités, planification, reporting).", preuve: "Programme d'audit." },
            { code: "9.2.2b", intitule: "Critères et périmètre définis", ctrl: "Vérifier la définition des critères et du périmètre de chaque audit.", preuve: "Plans d'audit." },
            { code: "9.2.2c", intitule: "Auditeurs objectifs et impartiaux", ctrl: "Vérifier la sélection d'auditeurs assurant l'objectivité et l'impartialité du processus.", preuve: "Désignation des auditeurs, indépendance." },
            { code: "9.2.2d", intitule: "Résultats rapportés et conservés", ctrl: "Vérifier que les résultats des audits sont rapportés à la direction concernée et conservés.", preuve: "Rapports d'audit, diffusion." }
        ],
        "9.3.1": [
            { code: "9.3.1a", intitule: "Revues de direction réalisées", ctrl: "Vérifier la réalisation de revues de direction à intervalles planifiés.", preuve: "Planning et comptes rendus de revue." }
        ],
        "9.3.2": [
            { code: "9.3.2a", intitule: "État des actions précédentes", ctrl: "Vérifier l'examen de l'état des actions décidées lors des revues précédentes.", preuve: "Support de revue." },
            { code: "9.3.2b", intitule: "Évolutions des enjeux", ctrl: "Vérifier l'examen des évolutions des enjeux externes et internes pertinents pour le SMSI.", preuve: "Support de revue." },
            { code: "9.3.2c", intitule: "Évolutions des besoins des parties intéressées", ctrl: "Vérifier l'examen des évolutions des besoins et attentes des parties intéressées.", preuve: "Support de revue." },
            { code: "9.3.2d", intitule: "Retours sur la performance", ctrl: "Vérifier l'examen des retours sur la performance (non-conformités et actions correctives, résultats de mesure, résultats d'audit, atteinte des objectifs).", preuve: "Support de revue, indicateurs." },
            { code: "9.3.2e", intitule: "Retours des parties intéressées", ctrl: "Vérifier l'examen des retours des parties intéressées.", preuve: "Support de revue." },
            { code: "9.3.2f", intitule: "Résultats d'appréciation et plan de traitement", ctrl: "Vérifier l'examen des résultats de l'appréciation des risques et de l'état du plan de traitement.", preuve: "Support de revue." },
            { code: "9.3.2g", intitule: "Opportunités d'amélioration", ctrl: "Vérifier l'examen des opportunités d'amélioration continue.", preuve: "Support de revue." }
        ],
        "9.3.3": [
            { code: "9.3.3a", intitule: "Décisions d'amélioration", ctrl: "Vérifier que les sorties de revue incluent les décisions relatives aux opportunités d'amélioration continue.", preuve: "Relevé de décisions." },
            { code: "9.3.3b", intitule: "Décisions de changement du SMSI", ctrl: "Vérifier que les sorties de revue incluent les décisions relatives aux besoins de changement du SMSI.", preuve: "Relevé de décisions." },
            { code: "9.3.3c", intitule: "Preuves conservées", ctrl: "Vérifier la conservation d'informations documentées comme preuve des résultats des revues de direction.", preuve: "Comptes rendus signés." }
        ],

        // ===== 10. Amélioration =====
        "10.1": [
            { code: "10.1a", intitule: "Amélioration continue", ctrl: "Vérifier l'amélioration continue de la pertinence, de l'adéquation et de l'efficacité du SMSI.", preuve: "Indicateurs de tendance, actions d'amélioration." }
        ],
        "10.2": [
            { code: "10.2a", intitule: "Réaction à la non-conformité", ctrl: "Vérifier la réaction à la non-conformité (correction et maîtrise des conséquences).", preuve: "Fiches de non-conformité." },
            { code: "10.2b", intitule: "Analyse des causes", ctrl: "Vérifier l'évaluation du besoin d'agir sur les causes (analyse, recherche de non-conformités similaires).", preuve: "Analyses de cause racine." },
            { code: "10.2c", intitule: "Actions correctives mises en œuvre", ctrl: "Vérifier la mise en œuvre des actions correctives nécessaires.", preuve: "Plan d'actions correctives." },
            { code: "10.2d", intitule: "Efficacité revue", ctrl: "Vérifier la revue de l'efficacité des actions correctives menées.", preuve: "Preuve de revue d'efficacité." },
            { code: "10.2e", intitule: "Preuves conservées", ctrl: "Vérifier la conservation des preuves (nature des non-conformités, actions menées, résultats).", preuve: "Registre des non-conformités et actions." }
        ]
    });
})();
