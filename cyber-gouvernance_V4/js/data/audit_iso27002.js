// Emplacement : js/data/audit_iso27002.js
// Nom du fichier : audit_iso27002.js
//
// MODÈLE D'AUDIT du référentiel « ISO/IEC 27001:2022 » (Annexe A — 93 mesures,
// id technique conservé « iso-27002-2022 », voir ref_iso27002.js). Un POINT DE
// CONTRÔLE par mesure : ce que l'auditeur doit vérifier + les preuves à demander.
// Reformulations maison (aucun texte de norme recopié).
//
// Enregistre aussi le MODÈLE COMPOSITE « ISO 27001 complet » = système de
// management (chap. 4-10) + Annexe A, pour auditer toute la norme en une grille.
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier ; ref_iso27001_smsi
// et audit_iso27001_smsi le sont aussi, pour le composite).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("iso-27002-2022", {
        // --- Mesures organisationnelles (5.x) ---
        "5.1": [{ ctrl: "Vérifier qu'un corpus de politiques de sécurité est défini, approuvé par la direction, publié, communiqué et revu à intervalles planifiés.", preuve: "Politiques datées/approuvées, preuve de diffusion, dates de revue." }],
        "5.2": [{ ctrl: "Vérifier que les rôles et responsabilités de sécurité sont définis et attribués selon les besoins de l'organisation.", preuve: "Matrice RACI sécurité, fiches de poste, désignations formelles." }],
        "5.3": [{ ctrl: "Vérifier que les tâches et domaines de responsabilité incompatibles sont séparés pour réduire fraude et erreur (ou compensés).", preuve: "Analyse de séparation des tâches, matrice des incompatibilités, contrôles compensatoires." }],
        "5.4": [{ ctrl: "Vérifier que la direction exige de tout le personnel l'application de la sécurité conformément aux politiques.", preuve: "Communications et engagement de la direction, notes de service." }],
        "5.5": [{ ctrl: "Vérifier que les contacts avec les autorités compétentes sont identifiés et maintenus à jour (ANSSI, CNIL, forces de l'ordre).", preuve: "Annuaire des contacts autorités, procédure d'escalade." }],
        "5.6": [{ ctrl: "Vérifier l'existence d'échanges avec des groupes d'intérêt, forums ou CERT spécialisés.", preuve: "Adhésions, abonnements CERT, comptes rendus de veille." }],
        "5.7": [{ ctrl: "Vérifier que l'information sur les menaces est collectée, analysée et exploitée pour adapter les défenses.", preuve: "Sources de threat intelligence, notes d'analyse, actions déclenchées." }],
        "5.8": [{ ctrl: "Vérifier que la sécurité est intégrée à la gestion des projets, quel qu'en soit le type.", preuve: "Méthodologie projet incluant la sécurité, jalons sécurité, exemples de projets." }],
        "5.9": [{ ctrl: "Vérifier l'existence d'un inventaire des informations et actifs associés, avec un propriétaire désigné.", preuve: "Inventaire des actifs, propriétaires, date de mise à jour." }],
        "5.10": [{ ctrl: "Vérifier que des règles d'usage acceptable des actifs et des informations sont définies et connues.", preuve: "Charte d'usage, preuve de diffusion/acceptation." }],
        "5.11": [{ ctrl: "Vérifier que le matériel et les accès sont restitués au départ des personnes ou en fin de contrat.", preuve: "Procédure de sortie, checklist de restitution, tickets." }],
        "5.12": [{ ctrl: "Vérifier que l'information est classifiée selon sa sensibilité et les exigences légales/contractuelles.", preuve: "Schéma de classification, exemples de documents classés." }],
        "5.13": [{ ctrl: "Vérifier que l'information est marquée conformément au schéma de classification.", preuve: "Procédure de marquage, exemples d'étiquetage." }],
        "5.14": [{ ctrl: "Vérifier que les transferts d'information (interne/externe) sont encadrés (règles, chiffrement, accords).", preuve: "Procédures de transfert, accords d'échange, moyens de chiffrement." }],
        "5.15": [{ ctrl: "Vérifier l'existence d'une politique de contrôle d'accès fondée sur le besoin d'en connaître et le moindre privilège.", preuve: "Politique de contrôle d'accès, matrice des droits." }],
        "5.16": [{ ctrl: "Vérifier la maîtrise du cycle de vie des identités (création, modification, suppression), y compris comptes de service.", preuve: "Processus de gestion des identités, revue des comptes." }],
        "5.17": [{ ctrl: "Vérifier que l'attribution et la gestion des secrets d'authentification sont maîtrisées et protégées.", preuve: "Politique de gestion des secrets, coffre-fort de mots de passe, procédure de réinitialisation." }],
        "5.18": [{ ctrl: "Vérifier que les droits d'accès sont attribués, revus périodiquement et retirés conformément à la politique.", preuve: "Revues d'habilitation, tickets d'attribution/retrait." }],
        "5.19": [{ ctrl: "Vérifier que les risques liés aux produits/services fournisseurs sont gérés et que des exigences de sécurité sont définies.", preuve: "Politique fournisseurs, évaluation des risques fournisseurs." }],
        "5.20": [{ ctrl: "Vérifier que les exigences de sécurité pertinentes figurent dans les accords avec chaque fournisseur.", preuve: "Contrats / clauses de sécurité, plan d'assurance sécurité." }],
        "5.21": [{ ctrl: "Vérifier que les risques de la chaîne d'approvisionnement TIC (matériels/logiciels) sont gérés.", preuve: "Analyse de la chaîne d'appro, exigences vers sous-traitants, SBOM le cas échéant." }],
        "5.22": [{ ctrl: "Vérifier le suivi, la revue et la gestion des changements des services fournisseurs.", preuve: "Revues de service (SLA), comptes rendus, gestion des changements." }],
        "5.23": [{ ctrl: "Vérifier que l'acquisition, l'usage et la sortie des services cloud sont encadrés (responsabilités partagées).", preuve: "Politique cloud, configuration de sécurité, plan de réversibilité." }],
        "5.24": [{ ctrl: "Vérifier la planification et la préparation de la réponse aux incidents (rôles, procédures, moyens).", preuve: "Plan de réponse aux incidents, rôles, procédures." }],
        "5.25": [{ ctrl: "Vérifier que les événements de sécurité sont évalués et qualifiés (incident ou non).", preuve: "Procédure de qualification, registre des événements." }],
        "5.26": [{ ctrl: "Vérifier que les incidents sont traités selon des procédures documentées.", preuve: "Fiches d'incident, procédures, journal de traitement." }],
        "5.27": [{ ctrl: "Vérifier que les enseignements tirés des incidents renforcent les mesures (retour d'expérience).", preuve: "Retours d'expérience, actions d'amélioration." }],
        "5.28": [{ ctrl: "Vérifier l'existence de procédures d'identification, de collecte et de conservation des preuves.", preuve: "Procédure forensique, chaîne de conservation des preuves." }],
        "5.29": [{ ctrl: "Vérifier le maintien d'un niveau de sécurité adéquat pendant une perturbation (crise/sinistre).", preuve: "Plan de continuité intégrant la sécurité, exercices." }],
        "5.30": [{ ctrl: "Vérifier que la continuité TIC est planifiée, mise en œuvre et testée pour soutenir la continuité d'activité (RTO/RPO).", preuve: "Plan de continuité TIC, tests de bascule/restauration." }],
        "5.31": [{ ctrl: "Vérifier l'identification et le respect des exigences légales, réglementaires et contractuelles.", preuve: "Veille juridique, registre de conformité." }],
        "5.32": [{ ctrl: "Vérifier le respect des droits de propriété intellectuelle (licences logicielles notamment).", preuve: "Inventaire des licences, contrôle de conformité logicielle." }],
        "5.33": [{ ctrl: "Vérifier que les enregistrements sont protégés contre perte, altération et accès non autorisé.", preuve: "Politique de conservation, protection des archives." }],
        "5.34": [{ ctrl: "Vérifier la protection de la vie privée et des données à caractère personnel (lien RGPD).", preuve: "Registre des traitements, mesures RGPD, analyse d'impact (AIPD) le cas échéant." }],
        "5.35": [{ ctrl: "Vérifier que la sécurité fait l'objet de revues indépendantes à intervalles planifiés.", preuve: "Rapports d'audit externe/indépendant, plan d'audit." }],
        "5.36": [{ ctrl: "Vérifier le contrôle régulier du respect des politiques, règles et normes de sécurité.", preuve: "Contrôles de conformité, revues, non-conformités relevées." }],
        "5.37": [{ ctrl: "Vérifier que les procédures d'exploitation sont documentées et disponibles pour les acteurs concernés.", preuve: "Procédures d'exploitation, accessibilité, mises à jour." }],

        // --- Mesures liées aux personnes (6.x) ---
        "6.1": [{ ctrl: "Vérifier que les antécédents des candidats sont vérifiés proportionnellement au poste et dans le respect du droit.", preuve: "Procédure de vérification préalable, preuves conservées." }],
        "6.2": [{ ctrl: "Vérifier que les contrats de travail précisent les responsabilités de sécurité.", preuve: "Clauses de sécurité des contrats, engagements signés." }],
        "6.3": [{ ctrl: "Vérifier la sensibilisation et la formation régulières de tout le personnel à la sécurité.", preuve: "Programme, taux de participation, supports." }],
        "6.4": [{ ctrl: "Vérifier l'existence d'un processus disciplinaire formalisé et communiqué en cas de violation.", preuve: "Procédure disciplinaire, référence au règlement intérieur." }],
        "6.5": [{ ctrl: "Vérifier que les obligations subsistant après la fin de contrat sont définies et communiquées.", preuve: "Clauses de confidentialité post-emploi, courriers de sortie." }],
        "6.6": [{ ctrl: "Vérifier l'existence et la signature d'accords de confidentialité (NDA) adaptés.", preuve: "Modèles de NDA, registre des signatures." }],
        "6.7": [{ ctrl: "Vérifier que le télétravail est sécurisé (matériel, connexion, environnement de travail).", preuve: "Politique de télétravail, configuration VPN/postes, consignes." }],
        "6.8": [{ ctrl: "Vérifier qu'un dispositif permet de signaler rapidement les événements de sécurité.", preuve: "Procédure et canaux de signalement, statistiques." }],

        // --- Mesures physiques (7.x) ---
        "7.1": [{ ctrl: "Vérifier la définition de périmètres de sécurité physique autour des zones sensibles.", preuve: "Plan des zones, contrôles périmétriques." }],
        "7.2": [{ ctrl: "Vérifier que l'accès aux zones sécurisées est restreint aux personnes autorisées et tracé.", preuve: "Liste des accès, journaux de badges, procédure visiteurs." }],
        "7.3": [{ ctrl: "Vérifier la protection des bureaux, salles et installations selon leur sensibilité.", preuve: "Mesures physiques, contrôle d'accès aux salles sensibles." }],
        "7.4": [{ ctrl: "Vérifier la détection des accès physiques non autorisés (vidéosurveillance, alarmes).", preuve: "Dispositifs de surveillance, journaux d'alarme." }],
        "7.5": [{ ctrl: "Vérifier la protection contre les menaces environnementales (incendie, dégât des eaux, catastrophes).", preuve: "Détection/extinction incendie, plans de prévention." }],
        "7.6": [{ ctrl: "Vérifier l'existence de règles de conduite dans les zones sécurisées.", preuve: "Consignes de zones sécurisées, contrôle d'application." }],
        "7.7": [{ ctrl: "Vérifier l'application du bureau propre et du verrouillage de session.", preuve: "Politique clean desk, verrouillage automatique, contrôles terrain." }],
        "7.8": [{ ctrl: "Vérifier que le matériel est positionné et protégé contre les risques et les regards indiscrets.", preuve: "Aménagement, protections, filtres de confidentialité." }],
        "7.9": [{ ctrl: "Vérifier la protection du matériel utilisé hors des locaux (nomadisme).", preuve: "Politique nomadisme, chiffrement, consignes." }],
        "7.10": [{ ctrl: "Vérifier la gestion du cycle de vie des supports de stockage (usage, transport, mise au rebut).", preuve: "Procédure supports, effacement/destruction sécurisée." }],
        "7.11": [{ ctrl: "Vérifier la fiabilité des services soutenant le SI (électricité, climatisation) et leurs secours.", preuve: "Onduleurs/groupes électrogènes, contrats de maintenance, tests." }],
        "7.12": [{ ctrl: "Vérifier la protection des câbles d'alimentation et réseau contre interception et dommage.", preuve: "Cheminements protégés, locaux techniques sécurisés." }],
        "7.13": [{ ctrl: "Vérifier la maintenance des équipements pour préserver disponibilité et intégrité.", preuve: "Plan de maintenance, journaux d'intervention." }],
        "7.14": [{ ctrl: "Vérifier l'effacement sécurisé des données avant mise au rebut ou réemploi.", preuve: "Procédure d'effacement/destruction, certificats." }],

        // --- Mesures technologiques (8.x) ---
        "8.1": [{ ctrl: "Vérifier la sécurisation des terminaux (durcissement, protection, chiffrement).", preuve: "Socle de durcissement, EDR/antivirus, chiffrement de disque." }],
        "8.2": [{ ctrl: "Vérifier la restriction et la surveillance étroite des accès à privilèges.", preuve: "Inventaire des comptes à privilèges, solution PAM, revues." }],
        "8.3": [{ ctrl: "Vérifier que l'accès à l'information est restreint selon la politique de contrôle d'accès.", preuve: "Matrice des droits, contrôles applicatifs." }],
        "8.4": [{ ctrl: "Vérifier le contrôle des accès en lecture/écriture au code source et aux outils associés.", preuve: "Gestion des accès au dépôt, revues d'accès." }],
        "8.5": [{ ctrl: "Vérifier la mise en œuvre de mécanismes d'authentification robustes (MFA sur les accès sensibles).", preuve: "Configuration MFA, périmètre couvert, journaux." }],
        "8.6": [{ ctrl: "Vérifier le dimensionnement et la surveillance des ressources pour éviter les saturations.", preuve: "Supervision capacitaire, seuils d'alerte, projections." }],
        "8.7": [{ ctrl: "Vérifier la protection contre les logiciels malveillants (détection, filtrage, sensibilisation).", preuve: "Antivirus/EDR, mises à jour de signatures, filtrage." }],
        "8.8": [{ ctrl: "Vérifier l'identification, l'évaluation et la correction des vulnérabilités techniques (veille + correctifs).", preuve: "Scans de vulnérabilités, délais de remédiation, patch management." }],
        "8.9": [{ ctrl: "Vérifier la définition, l'application et la surveillance de configurations sécurisées.", preuve: "Référentiels de configuration, contrôle de dérive." }],
        "8.10": [{ ctrl: "Vérifier la suppression des informations qui ne sont plus nécessaires (durées de conservation).", preuve: "Politique de rétention, procédures d'effacement." }],
        "8.11": [{ ctrl: "Vérifier le masquage/anonymisation des données sensibles quand l'usage le permet.", preuve: "Règles de masquage, exemples (environnements non-prod)." }],
        "8.12": [{ ctrl: "Vérifier les mesures de prévention des fuites de données (DLP).", preuve: "Solution DLP, règles, journaux d'alerte." }],
        "8.13": [{ ctrl: "Vérifier que les sauvegardes sont réalisées, protégées, et que les restaurations sont testées.", preuve: "Politique de sauvegarde, journaux, comptes rendus de tests de restauration." }],
        "8.14": [{ ctrl: "Vérifier la redondance des moyens de traitement pour la disponibilité requise.", preuve: "Architecture redondante, tests de bascule." }],
        "8.15": [{ ctrl: "Vérifier la journalisation des événements pertinents et la protection des journaux.", preuve: "Politique de journalisation, périmètre, protection et rétention." }],
        "8.16": [{ ctrl: "Vérifier la surveillance du SI pour détecter les comportements anormaux.", preuve: "SIEM/supervision, règles de détection, alertes." }],
        "8.17": [{ ctrl: "Vérifier la synchronisation des horloges sur une source de temps fiable.", preuve: "Configuration NTP, source de temps commune." }],
        "8.18": [{ ctrl: "Vérifier l'encadrement des utilitaires capables de contourner les contrôles.", preuve: "Restriction et traçabilité des outils d'administration privilégiés." }],
        "8.19": [{ ctrl: "Vérifier la maîtrise de l'installation de logiciels sur les systèmes en production.", preuve: "Politique d'installation, listes blanches, droits restreints." }],
        "8.20": [{ ctrl: "Vérifier la protection des réseaux et des données en transit.", preuve: "Architecture réseau sécurisée, filtrage, chiffrement." }],
        "8.21": [{ ctrl: "Vérifier la définition et le contrôle des mécanismes de sécurité des services réseau.", preuve: "Accords de service réseau, configuration, supervision." }],
        "8.22": [{ ctrl: "Vérifier la segmentation des réseaux selon la sensibilité et la confiance.", preuve: "Plan de segmentation, VLAN, règles inter-zones." }],
        "8.23": [{ ctrl: "Vérifier le filtrage des accès web pour réduire l'exposition aux menaces.", preuve: "Proxy/filtrage d'URL, catégories bloquées, journaux." }],
        "8.24": [{ ctrl: "Vérifier l'existence de règles d'usage de la cryptographie et une gestion des clés maîtrisée.", preuve: "Politique cryptographique, gestion du cycle de vie des clés." }],
        "8.25": [{ ctrl: "Vérifier l'intégration de la sécurité tout au long du cycle de développement.", preuve: "Cycle de développement sécurisé (SSDLC), jalons sécurité, revues." }],
        "8.26": [{ ctrl: "Vérifier que les exigences de sécurité des applications sont spécifiées dès l'expression du besoin.", preuve: "Cahiers des charges sécurité, exigences tracées." }],
        "8.27": [{ ctrl: "Vérifier l'application de principes d'ingénierie et d'architecture sécurisées.", preuve: "Principes d'architecture, revues de conception." }],
        "8.28": [{ ctrl: "Vérifier l'application de pratiques de codage sécurisé.", preuve: "Règles de codage, analyse statique (SAST), revues de code." }],
        "8.29": [{ ctrl: "Vérifier la réalisation de tests de sécurité en développement et en recette.", preuve: "Plans de test, analyses dynamiques (DAST)/tests d'intrusion, résultats." }],
        "8.30": [{ ctrl: "Vérifier l'encadrement et le contrôle de la sécurité du développement externalisé.", preuve: "Exigences contractuelles, revues, tests d'acceptation." }],
        "8.31": [{ ctrl: "Vérifier le cloisonnement des environnements de développement, de test et de production.", preuve: "Architecture des environnements, contrôle des accès et des flux." }],
        "8.32": [{ ctrl: "Vérifier que les changements du SI suivent un processus formalisé (demande, test, approbation, retour arrière).", preuve: "Procédure de gestion des changements, tickets, approbations." }],
        "8.33": [{ ctrl: "Vérifier la sélection et la protection des données de test (pas de données sensibles en clair).", preuve: "Politique des données de test, anonymisation." }],
        "8.34": [{ ctrl: "Vérifier l'encadrement des tests d'audit sur les systèmes en production (planification, périmètre, précautions).", preuve: "Plan de test d'audit, accords, fenêtres d'intervention." }]
    });

    // Modèle composite : audit complet d'ISO/IEC 27001 (système de management + Annexe A).
    AuditModeles.registerComposite("iso27001-complet", {
        nom: "ISO/IEC 27001:2022 — Audit complet (SMSI + Annexe A)",
        sources: ["iso27001-smsi", "iso-27002-2022"]
    });
})();
