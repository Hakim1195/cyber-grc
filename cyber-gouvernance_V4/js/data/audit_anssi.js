// Emplacement : js/data/audit_anssi.js
// Nom du fichier : audit_anssi.js
//
// MODÈLE D'AUDIT du référentiel « Hygiène informatique (ANSSI) » — 42 mesures.
// Pour chaque mesure (code 1 à 42, voir ref_anssi.js), un ou plusieurs POINTS DE
// CONTRÔLE d'audit : ce que l'auditeur doit vérifier + les preuves à demander.
// Reformulations maison, fidèles à l'intention du guide public de l'ANSSI
// (aucun texte de norme recopié).
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.register("anssi-hygiene", {
        // --- Sensibiliser et former ---
        "1": [
            { ctrl: "Vérifier qu'un plan de formation à la cybersécurité couvre les administrateurs, techniciens et développeurs, qu'il est suivi et actualisé selon les menaces et les technologies employées.", preuve: "Plan de formation, attestations/certificats, feuilles d'émargement, budget alloué, dates des dernières sessions." },
            { ctrl: "Vérifier que les personnes en charge de l'exploitation maîtrisent les procédures de sécurité de leur périmètre (durcissement, correctifs, réaction aux alertes).", preuve: "Procédures d'exploitation, comptes rendus d'habilitation, entretiens d'audit." }
        ],
        "2": [
            { ctrl: "Vérifier l'existence d'un dispositif de sensibilisation régulier de tous les utilisateurs (hameçonnage, mots de passe, pièces jointes, mobilité) et la traçabilité de la participation.", preuve: "Supports de sensibilisation, calendrier, taux de participation, campagnes de faux hameçonnage." },
            { ctrl: "Vérifier qu'une charte d'usage du SI est diffusée, signée et opposable aux utilisateurs.", preuve: "Charte informatique, preuves de diffusion/signature, annexion au règlement intérieur." }
        ],
        "3": [
            { ctrl: "Vérifier que les contrats d'infogérance fixent des exigences de sécurité explicites (niveaux de service, localisation des données, encadrement de la sous-traitance).", preuve: "Contrats et plan d'assurance sécurité (PAS), annexes sécurité, clauses d'audit et de réversibilité." },
            { ctrl: "Vérifier l'existence d'un droit de regard effectif (audit, reporting sécurité) et de clauses de réversibilité en fin de contrat.", preuve: "Comptes rendus d'audit du prestataire, tableaux de bord de service, plan de réversibilité." }
        ],

        // --- Connaître le système d'information ---
        "4": [
            { ctrl: "Vérifier l'existence d'une cartographie du SI tenue à jour (serveurs, applications, flux, interconnexions).", preuve: "Cartographie applicative et réseau, date de dernière mise à jour, responsable de la tenue." },
            { ctrl: "Vérifier que les données les plus sensibles sont identifiées, localisées et classifiées selon leur sensibilité.", preuve: "Politique de classification, registre/inventaire des données sensibles, marquage." }
        ],
        "5": [
            { ctrl: "Vérifier la tenue d'un inventaire exhaustif et à jour des comptes à privilèges (administrateurs de domaine, root, comptes de service) et de leurs détenteurs.", preuve: "Extraction des comptes à privilèges, revue périodique des habilitations, dates de dernière revue." }
        ],
        "6": [
            { ctrl: "Vérifier l'existence d'un processus formalisé de gestion des arrivées, départs et mobilités déclenchant la création, la modification et surtout la suppression des accès en temps utile.", preuve: "Procédure (arrivée/mobilité/départ), tickets associés, revue des comptes désactivés, recherche de comptes orphelins." }
        ],
        "7": [
            { ctrl: "Vérifier que seuls les équipements identifiés et conformes à la politique sont autorisés à se connecter au réseau.", preuve: "Inventaire du parc, configuration du contrôle d'admission (NAC/802.1X), journal des équipements refusés." }
        ],

        // --- Authentifier et contrôler les accès ---
        "8": [
            { ctrl: "Vérifier que chaque utilisateur dispose d'un compte nominatif (absence de comptes génériques partagés) et que les rôles utilisateur et administrateur sont distincts.", preuve: "Annuaire des comptes, politique de nommage, liste et justification des éventuels comptes partagés." }
        ],
        "9": [
            { ctrl: "Vérifier l'application du principe de moindre privilège (droits attribués au juste besoin) et l'existence de revues d'habilitations périodiques.", preuve: "Matrice des droits/rôles, comptes rendus de revue des accès, procédure d'attribution et de retrait." }
        ],
        "10": [
            { ctrl: "Vérifier l'existence et l'application technique d'une politique de mots de passe robustes (longueur, complexité, blocage après tentatives).", preuve: "Politique de mot de passe, configuration appliquée (GPO/annuaire), paramètres effectifs constatés." }
        ],
        "11": [
            { ctrl: "Vérifier que les mots de passe ne sont jamais stockés en clair mais sous forme d'empreintes salées, y compris dans les applications internes.", preuve: "Documentation technique, revue de configuration/code, résultats de tests." }
        ],
        "12": [
            { ctrl: "Vérifier que tous les comptes, mots de passe et clés par défaut (équipements, applications, comptes constructeur) ont été modifiés à la mise en service.", preuve: "Procédure de recette/durcissement, échantillon d'équipements, résultats de scan." }
        ],
        "13": [
            { ctrl: "Vérifier le déploiement de l'authentification multifacteur sur les accès sensibles (administration, accès distants, messagerie, applications exposées).", preuve: "Configuration MFA, périmètre couvert, journaux d'authentification, exceptions justifiées." }
        ],

        // --- Sécuriser les postes de travail ---
        "14": [
            { ctrl: "Vérifier l'existence d'un socle de configuration durci appliqué de façon homogène à tous les postes et serveurs (services inutiles désactivés, antivirus, comptes limités).", preuve: "Guide de durcissement, images/masters de référence, rapports de conformité de configuration." }
        ],
        "15": [
            { ctrl: "Vérifier l'encadrement de l'usage des supports amovibles (restriction, analyse antivirale à la connexion, chiffrement si autorisé).", preuve: "Politique des supports amovibles, configuration de blocage/contrôle, journaux d'usage." }
        ],
        "16": [
            { ctrl: "Vérifier que les configurations sont appliquées et contrôlées de façon centralisée (GPO, MDM, outil de gestion de parc) sur l'ensemble du périmètre.", preuve: "Console de gestion centralisée, rapports de conformité, périmètre effectivement couvert." }
        ],
        "17": [
            { ctrl: "Vérifier que le pare-feu local est activé et configuré sur les postes et serveurs, bloquant les connexions non sollicitées (y compris entre postes).", preuve: "Configuration du pare-feu local, échantillon de postes, règles appliquées." }
        ],
        "18": [
            { ctrl: "Vérifier que les données sensibles sont chiffrées au repos et en transit (postes, supports, échanges externes).", preuve: "Politique de chiffrement, configuration (BitLocker/LUKS, TLS), périmètre couvert." }
        ],

        // --- Sécuriser le réseau ---
        "19": [
            { ctrl: "Vérifier le cloisonnement du réseau en zones de sensibilité (bureautique, serveurs, industriel, DMZ) limitant la propagation latérale.", preuve: "Schéma d'architecture réseau, matrice des flux, configuration VLAN/filtrage inter-zones." }
        ],
        "20": [
            { ctrl: "Vérifier la sécurisation du Wi-Fi (chiffrement fort, authentification) et l'isolation d'un éventuel réseau invité vis-à-vis du réseau interne.", preuve: "Configuration des bornes, séparation des SSID, journaux d'authentification." }
        ],
        "21": [
            { ctrl: "Vérifier l'emploi de protocoles réseau sécurisés (HTTPS, SSH, SFTP…) et l'abandon des protocoles transmettant en clair.", preuve: "Inventaire des protocoles/services, résultats de scan, configuration des services." }
        ],
        "22": [
            { ctrl: "Vérifier la présence d'une passerelle Internet sécurisée (filtrage d'URL, proxy, journalisation des accès sortants).", preuve: "Configuration du proxy/passerelle, catégories filtrées, journaux d'accès." }
        ],
        "23": [
            { ctrl: "Vérifier que les services exposés sur Internet sont isolés dans une DMZ, coupée du cœur du SI.", preuve: "Schéma d'architecture, règles de filtrage, liste des services exposés." }
        ],
        "24": [
            { ctrl: "Vérifier la protection de la messagerie (anti-spam, anti-hameçonnage, filtrage des pièces jointes) et l'authentification des expéditeurs (SPF, DKIM, DMARC).", preuve: "Configuration de la passerelle de messagerie, enregistrements DNS SPF/DKIM/DMARC, statistiques de filtrage." }
        ],
        "25": [
            { ctrl: "Vérifier que les interconnexions avec les partenaires sont chiffrées, filtrées et limitées au strict nécessaire.", preuve: "Inventaire des interconnexions, configuration VPN/filtrage, conventions d'interconnexion." }
        ],
        "26": [
            { ctrl: "Vérifier le contrôle des accès physiques aux locaux techniques (salles serveurs, baies de brassage) et la traçabilité des entrées.", preuve: "Liste des accès autorisés, journaux de badges, procédure d'accompagnement des visiteurs." }
        ],

        // --- Sécuriser l'administration ---
        "27": [
            { ctrl: "Vérifier que les postes et serveurs d'administration n'ont pas d'accès direct à Internet.", preuve: "Configuration réseau des postes d'administration, règles de filtrage, revue des flux sortants." }
        ],
        "28": [
            { ctrl: "Vérifier que l'administration s'effectue via un réseau dédié et cloisonné (VLAN d'administration, bastion/rebond).", preuve: "Schéma du réseau d'administration, configuration du bastion, matrice des flux d'admin." }
        ],
        "29": [
            { ctrl: "Vérifier que les droits d'administration sont limités au strict besoin et réévalués périodiquement.", preuve: "Liste des administrateurs, revue des privilèges, justification des habilitations élevées." }
        ],
        "30": [
            { ctrl: "Vérifier que les comptes d'administration sont réservés aux seules tâches d'administration (compte bureautique distinct pour la navigation et la messagerie).", preuve: "Politique de comptes, échantillon d'administrateurs, absence de messagerie/navigation sur les comptes à privilèges." }
        ],

        // --- Gérer le nomadisme ---
        "31": [
            { ctrl: "Vérifier la protection physique des terminaux nomades (verrouillage automatique, filtre de confidentialité, consignes anti-vol/perte).", preuve: "Politique de nomadisme, configuration du verrouillage, consignes diffusées." }
        ],
        "32": [
            { ctrl: "Vérifier le chiffrement systématique des disques des postes portables et des supports emportés en mobilité.", preuve: "Configuration du chiffrement de disque, périmètre couvert, rapport de conformité." }
        ],
        "33": [
            { ctrl: "Vérifier que les accès distants passent par un tunnel chiffré et authentifié (VPN) assorti d'une authentification forte.", preuve: "Configuration VPN, MFA associée, journaux de connexion, périmètre des accès distants." }
        ],
        "34": [
            { ctrl: "Vérifier l'encadrement des terminaux mobiles (MDM, applications autorisées, cloisonnement pro/perso, effacement à distance).", preuve: "Politique mobile, configuration MDM, périmètre enrôlé, procédure d'effacement." }
        ],

        // --- Maintenir le SI à jour ---
        "35": [
            { ctrl: "Vérifier l'existence et l'application d'une politique de mises à jour (délais d'application des correctifs de sécurité selon la criticité).", preuve: "Politique de patch management, rapports de déploiement, délais constatés, vulnérabilités résiduelles." }
        ],
        "36": [
            { ctrl: "Vérifier l'identification des composants en fin de support et l'existence d'un plan de remplacement ou de mesures compensatoires.", preuve: "Inventaire des versions/OS, échéances de fin de support, plan de migration/mesures compensatoires." }
        ],

        // --- Superviser, auditer, réagir ---
        "37": [
            { ctrl: "Vérifier la journalisation de l'activité des composants essentiels, la synchronisation temporelle (NTP) et la durée de conservation des journaux.", preuve: "Politique de journalisation, périmètre couvert, durée de rétention, source de temps commune." }
        ],
        "38": [
            { ctrl: "Vérifier que les sauvegardes sont réalisées régulièrement, qu'au moins une copie est déconnectée/hors ligne, et que les restaurations sont testées.", preuve: "Politique de sauvegarde, planning, journaux de sauvegarde, comptes rendus de tests de restauration." }
        ],
        "39": [
            { ctrl: "Vérifier la réalisation d'audits ou contrôles de sécurité périodiques et le suivi des écarts via un plan d'actions.", preuve: "Programme d'audit, rapports d'audit/tests d'intrusion, plan d'actions et preuves de suivi." }
        ],
        "40": [
            { ctrl: "Vérifier la désignation formelle d'un référent/responsable sécurité, avec rôle, moyens et rattachement définis.", preuve: "Lettre de mission ou fiche de poste, organigramme, comptes rendus d'activité." }
        ],

        // --- Pour aller plus loin ---
        "41": [
            { ctrl: "Vérifier l'existence d'une procédure de gestion des incidents (détection, qualification, confinement, communication, rôles) connue des acteurs.", preuve: "Procédure de gestion des incidents, annuaire de crise, retours d'expérience, exercices réalisés." }
        ],
        "42": [
            { ctrl: "Vérifier la réalisation d'une analyse de risque formelle orientant les priorités de sécurité, et le recours aux produits/services qualifiés lorsque c'est pertinent.", preuve: "Analyse de risque (EBIOS RM ou équivalent), plan de traitement du risque, liste des solutions qualifiées ANSSI utilisées." }
        ]
    });
})();
