// Emplacement : js/data/audit_iso27001_smsi.js
// Nom du fichier : audit_iso27001_smsi.js
//
// MODÈLE D'AUDIT du référentiel « ISO/IEC 27001:2022 — Système de management »
// (chapitres 4 à 10, voir ref_iso27001_smsi.js).
//
// GRANULARITÉ MAXIMALE : chaque clause du référentiel est éclatée en sous-exigences
// correspondant à chaque « shall » et sous-alinéa de la norme (ex. « 6.1.2a »…« 6.1.2j »).
// 143 points de contrôle pour le système de management ; avec les 93 mesures de
// l'Annexe A, le composite « ISO 27001 complet » atteint 236 exigences — la maille
// fine des guides de référence. Chaque sous-exigence est un POINT DE CONTRÔLE autonome
// (sous-code + intitulé + ce qu'il faut vérifier + preuves à demander). Le référentiel
// reste, lui, au niveau des 30 clauses (auto-évaluation lisible). Reformulations maison
// (texte ISO non reproduit).
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("iso27001-smsi", {
        // ===== 4. Contexte de l'organisation =====
        "4.1": [
            { code: "4.1a", intitule: "Enjeux externes déterminés", ctrl: "Vérifier que les enjeux externes pertinents (légaux, réglementaires, technologiques, concurrentiels, sociétaux) sont déterminés.", preuve: "Analyse de contexte externe (PESTEL), veille." },
            { code: "4.1b", intitule: "Enjeux internes déterminés", ctrl: "Vérifier que les enjeux internes pertinents (gouvernance, organisation, ressources, culture) sont déterminés.", preuve: "Analyse de contexte interne, compte rendu de revue." }
        ],
        "4.2": [
            { code: "4.2a", intitule: "Parties intéressées déterminées", ctrl: "Vérifier que les parties intéressées pertinentes pour le SMSI sont identifiées.", preuve: "Registre des parties intéressées." },
            { code: "4.2b", intitule: "Exigences légales et réglementaires déterminées", ctrl: "Vérifier que les exigences légales et réglementaires pertinentes de ces parties sont déterminées.", preuve: "Veille légale/réglementaire, registre des exigences." },
            { code: "4.2c", intitule: "Exigences contractuelles déterminées", ctrl: "Vérifier que les exigences contractuelles pertinentes (clients, partenaires) sont déterminées.", preuve: "Registre des exigences contractuelles." },
            { code: "4.2d", intitule: "Autres exigences pertinentes déterminées", ctrl: "Vérifier que les autres besoins et attentes pertinents des parties intéressées sont déterminés.", preuve: "Registre des exigences." },
            { code: "4.2e", intitule: "Exigences traitées via le SMSI", ctrl: "Vérifier que l'organisation a déterminé lesquelles de ces exigences seront traitées par le SMSI.", preuve: "Analyse d'applicabilité des exigences." }
        ],
        "4.3": [
            { code: "4.3a", intitule: "Limites déterminées (enjeux)", ctrl: "Vérifier que les limites du SMSI sont déterminées en tenant compte des enjeux (4.1).", preuve: "Document de périmètre." },
            { code: "4.3b", intitule: "Applicabilité déterminée (exigences)", ctrl: "Vérifier que l'applicabilité du SMSI tient compte des exigences des parties intéressées (4.2).", preuve: "Document de périmètre." },
            { code: "4.3c", intitule: "Interfaces et dépendances prises en compte", ctrl: "Vérifier la prise en compte des interfaces et dépendances entre les activités de l'organisation et celles d'autres organisations.", preuve: "Cartographie des interfaces/dépendances." },
            { code: "4.3d", intitule: "Périmètre documenté", ctrl: "Vérifier que le périmètre est disponible sous forme d'information documentée.", preuve: "Document de périmètre daté/approuvé." }
        ],
        "4.4": [
            { code: "4.4a", intitule: "SMSI établi", ctrl: "Vérifier que le SMSI et les processus nécessaires (et leurs interactions) sont établis.", preuve: "Description du SMSI, cartographie des processus." },
            { code: "4.4b", intitule: "SMSI mis en œuvre", ctrl: "Vérifier que le SMSI est effectivement mis en œuvre.", preuve: "Preuves de fonctionnement des processus." },
            { code: "4.4c", intitule: "SMSI tenu à jour", ctrl: "Vérifier que le SMSI est tenu à jour.", preuve: "Revues, mises à jour documentées." },
            { code: "4.4d", intitule: "SMSI amélioré en continu", ctrl: "Vérifier que le SMSI est amélioré en continu.", preuve: "Actions d'amélioration, indicateurs." }
        ],

        // ===== 5. Leadership =====
        "5.1": [
            { code: "5.1a", intitule: "Politique et objectifs alignés à la stratégie", ctrl: "Vérifier que la direction s'assure que la politique et les objectifs de sécurité sont établis et compatibles avec l'orientation stratégique.", preuve: "Politique, objectifs, lien avec la stratégie." },
            { code: "5.1b", intitule: "Intégration aux processus métier", ctrl: "Vérifier l'intégration des exigences du SMSI dans les processus métier de l'organisation.", preuve: "Processus métier intégrant la sécurité." },
            { code: "5.1c", intitule: "Ressources disponibles", ctrl: "Vérifier que les ressources nécessaires au SMSI sont disponibles.", preuve: "Budget, effectifs, décisions d'allocation." },
            { code: "5.1d", intitule: "Importance communiquée", ctrl: "Vérifier que la direction communique l'importance d'un management efficace de la sécurité et de la conformité au SMSI.", preuve: "Communications de la direction." },
            { code: "5.1e", intitule: "Atteinte des résultats assurée", ctrl: "Vérifier que la direction s'assure que le SMSI atteint les résultats attendus.", preuve: "Revues de direction, suivi des objectifs." },
            { code: "5.1f", intitule: "Personnes orientées et soutenues", ctrl: "Vérifier que la direction oriente et soutient les personnes pour contribuer à l'efficacité du SMSI.", preuve: "Actions de soutien, communications." },
            { code: "5.1g", intitule: "Amélioration continue promue", ctrl: "Vérifier que la direction promeut l'amélioration continue.", preuve: "Objectifs d'amélioration, comptes rendus." },
            { code: "5.1h", intitule: "Soutien aux autres managers", ctrl: "Vérifier que la direction soutient les autres rôles de management pertinents dans leurs domaines.", preuve: "Délégations, soutien managérial." }
        ],
        "5.2": [
            { code: "5.2a", intitule: "Politique adaptée à la finalité", ctrl: "Vérifier que la politique de sécurité est adaptée à la finalité de l'organisation.", preuve: "Politique de sécurité." },
            { code: "5.2b", intitule: "Cadre d'objectifs", ctrl: "Vérifier que la politique inclut des objectifs de sécurité ou un cadre pour les fixer.", preuve: "Politique, objectifs." },
            { code: "5.2c", intitule: "Engagement de conformité", ctrl: "Vérifier l'engagement à satisfaire les exigences applicables en matière de sécurité de l'information.", preuve: "Politique (clause d'engagement)." },
            { code: "5.2d", intitule: "Engagement d'amélioration continue", ctrl: "Vérifier l'engagement d'amélioration continue du SMSI dans la politique.", preuve: "Politique (clause d'amélioration)." },
            { code: "5.2e", intitule: "Politique documentée", ctrl: "Vérifier que la politique est disponible sous forme d'information documentée.", preuve: "Politique datée/approuvée." },
            { code: "5.2f", intitule: "Politique communiquée en interne", ctrl: "Vérifier que la politique est communiquée au sein de l'organisation.", preuve: "Preuve de diffusion interne." },
            { code: "5.2g", intitule: "Politique disponible aux parties intéressées", ctrl: "Vérifier que la politique est mise à disposition des parties intéressées, le cas échéant.", preuve: "Mise à disposition (portail, contrats)." }
        ],
        "5.3": [
            { code: "5.3a", intitule: "Responsabilités attribuées et communiquées", ctrl: "Vérifier que les responsabilités et autorités des rôles pertinents pour la sécurité sont attribuées et communiquées.", preuve: "Fiches de rôle, organigramme." },
            { code: "5.3b", intitule: "Responsabilité de conformité du SMSI", ctrl: "Vérifier l'attribution de la responsabilité de la conformité du SMSI à la norme.", preuve: "Lettre de mission, désignation." },
            { code: "5.3c", intitule: "Reporting de la performance à la direction", ctrl: "Vérifier l'attribution de la responsabilité du reporting de la performance du SMSI à la direction.", preuve: "Comptes rendus de reporting." }
        ],

        // ===== 6. Planification =====
        "6.1.1": [
            { code: "6.1.1a", intitule: "Risques et opportunités déterminés", ctrl: "Vérifier que les risques et opportunités à traiter sont déterminés à partir des enjeux (4.1) et des exigences (4.2).", preuve: "Analyse des risques et opportunités." },
            { code: "6.1.1b", intitule: "Finalité : assurer les résultats", ctrl: "Vérifier que cette détermination vise à donner l'assurance que le SMSI peut atteindre les résultats attendus.", preuve: "Lien R&O ↔ objectifs du SMSI." },
            { code: "6.1.1c", intitule: "Finalité : prévenir les effets indésirables", ctrl: "Vérifier qu'elle vise aussi à prévenir ou réduire les effets indésirables.", preuve: "Analyse des effets indésirables." },
            { code: "6.1.1d", intitule: "Finalité : amélioration continue", ctrl: "Vérifier qu'elle vise l'amélioration continue.", preuve: "Opportunités d'amélioration identifiées." },
            { code: "6.1.1e", intitule: "Actions planifiées", ctrl: "Vérifier que des actions face à ces risques/opportunités sont planifiées.", preuve: "Plan d'actions." },
            { code: "6.1.1f", intitule: "Actions intégrées et efficacité évaluée", ctrl: "Vérifier que ces actions sont intégrées aux processus du SMSI et leur efficacité évaluée.", preuve: "Intégration aux processus, évaluation d'efficacité." }
        ],
        "6.1.2": [
            { code: "6.1.2a", intitule: "Critères d'acceptation du risque établis", ctrl: "Vérifier l'établissement et la maintenance des critères d'acceptation des risques.", preuve: "Critères d'acceptation documentés." },
            { code: "6.1.2b", intitule: "Critères d'appréciation établis", ctrl: "Vérifier l'établissement des critères de réalisation des appréciations des risques.", preuve: "Critères d'appréciation documentés." },
            { code: "6.1.2c", intitule: "Appréciations cohérentes et comparables", ctrl: "Vérifier que le processus produit des résultats cohérents, valides et comparables.", preuve: "Méthodologie, exemples reproductibles." },
            { code: "6.1.2d", intitule: "Risques identifiés", ctrl: "Vérifier l'identification des risques liés à la perte de confidentialité, d'intégrité et de disponibilité de l'information.", preuve: "Registre des risques." },
            { code: "6.1.2e", intitule: "Propriétaires de risque identifiés", ctrl: "Vérifier l'attribution d'un propriétaire à chaque risque.", preuve: "Registre des risques (propriétaires)." },
            { code: "6.1.2f", intitule: "Conséquences analysées", ctrl: "Vérifier l'analyse des conséquences potentielles en cas de matérialisation des risques.", preuve: "Analyse d'impact." },
            { code: "6.1.2g", intitule: "Vraisemblance analysée", ctrl: "Vérifier l'analyse de la vraisemblance réaliste des risques.", preuve: "Cotation de vraisemblance." },
            { code: "6.1.2h", intitule: "Niveaux de risque déterminés", ctrl: "Vérifier la détermination des niveaux de risque.", preuve: "Registre coté." },
            { code: "6.1.2i", intitule: "Risques comparés aux critères", ctrl: "Vérifier la comparaison des risques analysés aux critères établis.", preuve: "Résultats d'évaluation." },
            { code: "6.1.2j", intitule: "Risques priorisés", ctrl: "Vérifier la priorisation des risques en vue de leur traitement.", preuve: "Priorisation documentée." }
        ],
        "6.1.3": [
            { code: "6.1.3a", intitule: "Options de traitement choisies", ctrl: "Vérifier le choix des options de traitement adaptées aux résultats de l'appréciation.", preuve: "Décisions de traitement." },
            { code: "6.1.3b", intitule: "Mesures nécessaires déterminées", ctrl: "Vérifier la détermination des mesures nécessaires à la mise en œuvre des options.", preuve: "Liste des mesures." },
            { code: "6.1.3c", intitule: "Comparaison à l'Annexe A", ctrl: "Vérifier la comparaison des mesures avec l'Annexe A pour s'assurer qu'aucune mesure nécessaire n'est omise.", preuve: "Analyse d'écart vs Annexe A." },
            { code: "6.1.3d", intitule: "SoA : mesures et justification d'inclusion", ctrl: "Vérifier que la déclaration d'applicabilité liste les mesures nécessaires et justifie leur inclusion.", preuve: "SoA." },
            { code: "6.1.3e", intitule: "SoA : justification des exclusions", ctrl: "Vérifier que la SoA justifie l'exclusion des mesures de l'Annexe A non retenues.", preuve: "SoA (exclusions)." },
            { code: "6.1.3f", intitule: "SoA : état de mise en œuvre", ctrl: "Vérifier que la SoA indique l'état de mise en œuvre des mesures retenues.", preuve: "SoA (statut)." },
            { code: "6.1.3g", intitule: "Plan de traitement des risques", ctrl: "Vérifier l'élaboration d'un plan de traitement des risques.", preuve: "Plan de traitement." },
            { code: "6.1.3h", intitule: "Approbation du plan de traitement", ctrl: "Vérifier l'approbation du plan de traitement par les propriétaires du risque.", preuve: "Preuve d'approbation." },
            { code: "6.1.3i", intitule: "Acceptation des risques résiduels", ctrl: "Vérifier l'acceptation des risques résiduels par les propriétaires du risque.", preuve: "Preuve d'acceptation." },
            { code: "6.1.3j", intitule: "Information documentée conservée", ctrl: "Vérifier la conservation d'informations documentées sur le processus de traitement des risques.", preuve: "Dossier de traitement des risques." }
        ],
        "6.2": [
            { code: "6.2a", intitule: "Objectifs cohérents avec la politique", ctrl: "Vérifier que les objectifs de sécurité sont cohérents avec la politique.", preuve: "Objectifs documentés." },
            { code: "6.2b", intitule: "Objectifs mesurables", ctrl: "Vérifier que les objectifs sont mesurables (si réalisable).", preuve: "Indicateurs associés." },
            { code: "6.2c", intitule: "Exigences prises en compte", ctrl: "Vérifier que les objectifs tiennent compte des exigences de sécurité applicables et des résultats d'appréciation/traitement des risques.", preuve: "Lien objectifs ↔ risques/exigences." },
            { code: "6.2d", intitule: "Objectifs surveillés", ctrl: "Vérifier que les objectifs de sécurité sont surveillés.", preuve: "Tableau de suivi des objectifs." },
            { code: "6.2e", intitule: "Objectifs communiqués", ctrl: "Vérifier que les objectifs sont communiqués aux parties concernées.", preuve: "Preuve de communication." },
            { code: "6.2f", intitule: "Objectifs mis à jour et documentés", ctrl: "Vérifier que les objectifs sont mis à jour le cas échéant et disponibles comme information documentée.", preuve: "Objectifs versionnés." },
            { code: "6.2g", intitule: "Atteinte planifiée (quoi, ressources)", ctrl: "Vérifier la planification de l'atteinte des objectifs (ce qui sera fait, ressources nécessaires).", preuve: "Plans d'action." },
            { code: "6.2h", intitule: "Atteinte planifiée (responsables, échéances)", ctrl: "Vérifier la désignation des responsables et des échéances pour l'atteinte des objectifs.", preuve: "Plans d'action (qui/quand)." },
            { code: "6.2i", intitule: "Évaluation des résultats planifiée", ctrl: "Vérifier que la manière d'évaluer les résultats est définie.", preuve: "Méthode d'évaluation des objectifs." }
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
            { code: "7.2b", intitule: "Compétences assurées", ctrl: "Vérifier que ces personnes sont compétentes (formation, expérience appropriées).", preuve: "Preuves de compétence." },
            { code: "7.2c", intitule: "Actions menées en cas d'écart", ctrl: "Vérifier que des actions sont menées pour acquérir les compétences manquantes (formation, recrutement, tutorat).", preuve: "Plan de formation, recrutement." },
            { code: "7.2d", intitule: "Efficacité des actions évaluée", ctrl: "Vérifier l'évaluation de l'efficacité des actions de développement des compétences.", preuve: "Évaluation post-formation." },
            { code: "7.2e", intitule: "Preuves de compétence conservées", ctrl: "Vérifier la conservation d'informations documentées comme preuve des compétences.", preuve: "Attestations, certifications." }
        ],
        "7.3": [
            { code: "7.3a", intitule: "Sensibilisation à la politique", ctrl: "Vérifier que les personnes sont sensibilisées à la politique de sécurité.", preuve: "Programme, participation." },
            { code: "7.3b", intitule: "Sensibilisation à la contribution", ctrl: "Vérifier la sensibilisation à la contribution de chacun à l'efficacité du SMSI et aux bénéfices d'une meilleure sécurité.", preuve: "Supports de sensibilisation." },
            { code: "7.3c", intitule: "Sensibilisation aux conséquences", ctrl: "Vérifier la sensibilisation aux conséquences d'un non-respect des exigences du SMSI.", preuve: "Supports, charte." }
        ],
        "7.4": [
            { code: "7.4a", intitule: "Contenu de communication déterminé", ctrl: "Vérifier la détermination du contenu des communications (sur quoi communiquer).", preuve: "Plan de communication." },
            { code: "7.4b", intitule: "Moments déterminés", ctrl: "Vérifier la détermination des moments de communication.", preuve: "Plan de communication (quand)." },
            { code: "7.4c", intitule: "Destinataires déterminés", ctrl: "Vérifier la détermination des destinataires (avec qui communiquer).", preuve: "Plan de communication (avec qui)." },
            { code: "7.4d", intitule: "Modalités déterminées", ctrl: "Vérifier la détermination des modalités de communication (comment).", preuve: "Plan de communication (comment)." }
        ],
        "7.5.1": [
            { code: "7.5.1a", intitule: "Documentation exigée par la norme présente", ctrl: "Vérifier la présence des informations documentées exigées par la norme.", preuve: "Liste maîtresse des documents." },
            { code: "7.5.1b", intitule: "Documentation nécessaire présente", ctrl: "Vérifier la présence des informations documentées jugées nécessaires à l'efficacité du SMSI.", preuve: "Liste maîtresse des documents." }
        ],
        "7.5.2": [
            { code: "7.5.2a", intitule: "Identification et description appropriées", ctrl: "Vérifier une identification et une description appropriées (titre, date, auteur, référence).", preuve: "Documents référencés." },
            { code: "7.5.2b", intitule: "Format et support appropriés", ctrl: "Vérifier un format et un support appropriés.", preuve: "Documents (format/version)." },
            { code: "7.5.2c", intitule: "Revue et approbation", ctrl: "Vérifier la revue et l'approbation des documents quant à leur pertinence et leur adéquation.", preuve: "Preuves d'approbation." }
        ],
        "7.5.3": [
            { code: "7.5.3a", intitule: "Disponibilité et adéquation", ctrl: "Vérifier que les documents sont disponibles et adaptés à l'utilisation, où et quand nécessaire.", preuve: "Accessibilité des documents." },
            { code: "7.5.3b", intitule: "Protection des documents", ctrl: "Vérifier que les documents sont protégés (perte de confidentialité, usage impropre, perte d'intégrité).", preuve: "Contrôle d'accès, sauvegarde." },
            { code: "7.5.3c", intitule: "Distribution, accès, récupération, usage", ctrl: "Vérifier la maîtrise de la distribution, de l'accès, de la récupération et de l'utilisation.", preuve: "Procédure de gestion documentaire." },
            { code: "7.5.3d", intitule: "Stockage et préservation", ctrl: "Vérifier la maîtrise du stockage et de la préservation (dont lisibilité).", preuve: "Modalités de stockage." },
            { code: "7.5.3e", intitule: "Maîtrise des modifications / versions", ctrl: "Vérifier la maîtrise des modifications (contrôle des versions).", preuve: "Gestion des versions." },
            { code: "7.5.3f", intitule: "Conservation et élimination", ctrl: "Vérifier la maîtrise de la conservation et de l'élimination des documents.", preuve: "Règles de conservation/élimination." },
            { code: "7.5.3g", intitule: "Documents d'origine externe maîtrisés", ctrl: "Vérifier l'identification et la maîtrise des documents d'origine externe nécessaires au SMSI.", preuve: "Registre des documents externes." }
        ],

        // ===== 8. Fonctionnement =====
        "8.1": [
            { code: "8.1a", intitule: "Processus planifiés", ctrl: "Vérifier la planification des processus nécessaires pour satisfaire les exigences et mettre en œuvre les actions (chap. 6).", preuve: "Procédures opérationnelles." },
            { code: "8.1b", intitule: "Critères des processus établis", ctrl: "Vérifier l'établissement de critères pour ces processus.", preuve: "Critères documentés." },
            { code: "8.1c", intitule: "Processus mis en œuvre selon les critères", ctrl: "Vérifier la mise en œuvre de la maîtrise des processus conformément aux critères.", preuve: "Preuves d'exécution." },
            { code: "8.1d", intitule: "Information documentée de confiance", ctrl: "Vérifier la conservation des informations documentées nécessaires pour avoir l'assurance que les processus ont été suivis comme prévu.", preuve: "Enregistrements opérationnels." },
            { code: "8.1e", intitule: "Changements planifiés maîtrisés", ctrl: "Vérifier la maîtrise des changements planifiés.", preuve: "Gestion des changements." },
            { code: "8.1f", intitule: "Changements imprévus examinés", ctrl: "Vérifier l'examen des conséquences des changements imprévus et les actions d'atténuation.", preuve: "Analyse des changements imprévus." },
            { code: "8.1g", intitule: "Processus externalisés maîtrisés", ctrl: "Vérifier que les processus, produits et services externalisés pertinents sont déterminés et maîtrisés.", preuve: "Suivi des externalisations." }
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
            { code: "9.1a", intitule: "Objet de surveillance/mesure déterminé", ctrl: "Vérifier la détermination de ce qui doit être surveillé et mesuré.", preuve: "Plan de mesure / indicateurs." },
            { code: "9.1b", intitule: "Méthodes déterminées", ctrl: "Vérifier la détermination des méthodes de surveillance, mesure, analyse et évaluation assurant des résultats valides.", preuve: "Méthodes documentées." },
            { code: "9.1c", intitule: "Moments de mesure déterminés", ctrl: "Vérifier la détermination des moments où surveiller et mesurer.", preuve: "Calendrier de mesure." },
            { code: "9.1d", intitule: "Responsables de mesure déterminés", ctrl: "Vérifier la détermination de qui surveille et mesure.", preuve: "Responsabilités de mesure." },
            { code: "9.1e", intitule: "Moments d'analyse/évaluation déterminés", ctrl: "Vérifier la détermination des moments où les résultats de surveillance et de mesure doivent être analysés et évalués.", preuve: "Plan d'analyse (quand)." },
            { code: "9.1f", intitule: "Responsables d'analyse/évaluation déterminés", ctrl: "Vérifier la détermination de qui analyse et évalue ces résultats.", preuve: "Responsabilités d'analyse." },
            { code: "9.1g", intitule: "Performance évaluée, preuves conservées", ctrl: "Vérifier l'évaluation de la performance et de l'efficacité du SMSI et la conservation des preuves documentées.", preuve: "Tableaux de bord, analyses conservées." }
        ],
        "9.2.1": [
            { code: "9.2.1a", intitule: "Audits internes réalisés", ctrl: "Vérifier la réalisation d'audits internes à intervalles planifiés.", preuve: "Rapports d'audit interne, planning." },
            { code: "9.2.1b", intitule: "Conformité vérifiée", ctrl: "Vérifier que les audits couvrent la conformité aux exigences propres de l'organisation et à celles de la norme.", preuve: "Critères d'audit, constats." },
            { code: "9.2.1c", intitule: "Mise en œuvre effective vérifiée", ctrl: "Vérifier que les audits contrôlent que le SMSI est effectivement mis en œuvre et tenu à jour.", preuve: "Constats d'audit." }
        ],
        "9.2.2": [
            { code: "9.2.2a", intitule: "Programme d'audit établi", ctrl: "Vérifier la planification, l'établissement, la mise en œuvre et le maintien d'un ou plusieurs programmes d'audit.", preuve: "Programme d'audit." },
            { code: "9.2.2b", intitule: "Importance et antériorité prises en compte", ctrl: "Vérifier que le programme tient compte de l'importance des processus et des résultats des audits précédents.", preuve: "Programme justifié." },
            { code: "9.2.2c", intitule: "Critères et périmètre définis", ctrl: "Vérifier la définition des critères et du périmètre de chaque audit.", preuve: "Plans d'audit." },
            { code: "9.2.2d", intitule: "Auditeurs objectifs et impartiaux", ctrl: "Vérifier la sélection d'auditeurs et la conduite d'audits assurant objectivité et impartialité.", preuve: "Désignation des auditeurs." },
            { code: "9.2.2e", intitule: "Résultats rapportés", ctrl: "Vérifier que les résultats des audits sont rapportés à la direction concernée.", preuve: "Diffusion des rapports." },
            { code: "9.2.2f", intitule: "Preuves conservées", ctrl: "Vérifier la conservation d'informations documentées comme preuve du programme et des résultats d'audit.", preuve: "Rapports d'audit archivés." }
        ],
        "9.3.1": [
            { code: "9.3.1a", intitule: "Revues de direction réalisées", ctrl: "Vérifier la réalisation de revues de direction à intervalles planifiés.", preuve: "Planning et comptes rendus de revue." }
        ],
        "9.3.2": [
            { code: "9.3.2a", intitule: "État des actions précédentes", ctrl: "Vérifier l'examen de l'état des actions décidées lors des revues précédentes.", preuve: "Support de revue." },
            { code: "9.3.2b", intitule: "Évolutions des enjeux", ctrl: "Vérifier l'examen des évolutions des enjeux externes et internes pertinents.", preuve: "Support de revue." },
            { code: "9.3.2c", intitule: "Évolutions des besoins des parties intéressées", ctrl: "Vérifier l'examen des évolutions des besoins et attentes des parties intéressées.", preuve: "Support de revue." },
            { code: "9.3.2d", intitule: "Retours sur la performance", ctrl: "Vérifier l'examen des retours sur la performance (non-conformités et actions correctives, résultats de mesure, résultats d'audit, atteinte des objectifs).", preuve: "Support de revue, indicateurs." },
            { code: "9.3.2e", intitule: "Retours des parties intéressées", ctrl: "Vérifier l'examen des retours des parties intéressées.", preuve: "Support de revue." },
            { code: "9.3.2f", intitule: "Résultats d'appréciation et plan de traitement", ctrl: "Vérifier l'examen des résultats de l'appréciation des risques et de l'état du plan de traitement.", preuve: "Support de revue." },
            { code: "9.3.2g", intitule: "Opportunités d'amélioration", ctrl: "Vérifier l'examen des opportunités d'amélioration continue.", preuve: "Support de revue." }
        ],
        "9.3.3": [
            { code: "9.3.3a", intitule: "Décisions d'amélioration", ctrl: "Vérifier que les sorties de revue incluent les décisions relatives aux opportunités d'amélioration continue.", preuve: "Relevé de décisions." },
            { code: "9.3.3b", intitule: "Décisions de changement du SMSI", ctrl: "Vérifier que les sorties incluent les décisions relatives aux besoins de changement du SMSI.", preuve: "Relevé de décisions." },
            { code: "9.3.3c", intitule: "Preuves conservées", ctrl: "Vérifier la conservation d'informations documentées comme preuve des résultats des revues.", preuve: "Comptes rendus signés." }
        ],

        // ===== 10. Amélioration =====
        "10.1": [
            { code: "10.1a", intitule: "Amélioration continue", ctrl: "Vérifier l'amélioration continue de la pertinence, de l'adéquation et de l'efficacité du SMSI.", preuve: "Indicateurs de tendance, actions d'amélioration." }
        ],
        "10.2": [
            { code: "10.2a", intitule: "Réaction à la non-conformité", ctrl: "Vérifier la réaction à la non-conformité (mesures pour la maîtriser et la corriger).", preuve: "Fiches de non-conformité." },
            { code: "10.2b", intitule: "Traitement des conséquences", ctrl: "Vérifier le traitement des conséquences de la non-conformité.", preuve: "Actions de remédiation." },
            { code: "10.2c", intitule: "Besoin d'agir sur les causes évalué", ctrl: "Vérifier l'évaluation du besoin d'agir pour éliminer les causes de la non-conformité.", preuve: "Analyse de la non-conformité." },
            { code: "10.2d", intitule: "Causes déterminées", ctrl: "Vérifier la revue de la non-conformité et la détermination de ses causes.", preuve: "Analyse de cause racine." },
            { code: "10.2e", intitule: "Non-conformités similaires recherchées", ctrl: "Vérifier la recherche de non-conformités similaires existantes ou potentielles.", preuve: "Analyse d'extension." },
            { code: "10.2f", intitule: "Actions correctives mises en œuvre", ctrl: "Vérifier la mise en œuvre des actions correctives nécessaires.", preuve: "Plan d'actions correctives." },
            { code: "10.2g", intitule: "Efficacité revue", ctrl: "Vérifier la revue de l'efficacité des actions correctives menées.", preuve: "Preuve de revue d'efficacité." },
            { code: "10.2h", intitule: "Modifications du SMSI si nécessaire", ctrl: "Vérifier que des modifications sont apportées au SMSI si nécessaire.", preuve: "Changements du SMSI." },
            { code: "10.2i", intitule: "Preuves : nature des NC et actions", ctrl: "Vérifier la conservation d'informations documentées sur la nature des non-conformités et les actions menées.", preuve: "Registre des non-conformités." },
            { code: "10.2j", intitule: "Preuves : résultats des actions correctives", ctrl: "Vérifier la conservation d'informations documentées sur les résultats de toute action corrective.", preuve: "Suivi de clôture des actions correctives." }
        ]
    });
})();
