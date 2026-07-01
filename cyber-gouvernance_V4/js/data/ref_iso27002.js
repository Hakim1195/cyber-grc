// Emplacement : js/data/ref_iso27002.js
// Nom du fichier : ref_iso27002.js
//
// Référentiel ISO/IEC 27002:2022 — 93 mesures de sécurité en 4 thèmes.
// Contenu = REFORMULATIONS ORIGINALES COURTES + aide pédagogique (le texte de la
// norme ISO est protégé et N'EST PAS reproduit ; seuls l'identifiant de clause
// « 5.1 » et un intitulé court paraphrasé sont fournis). La norme officielle reste
// la référence : ISO/IEC 27002:2022.
//
// S'auto-enregistre dans le registre `Referentiels`.

(function () {
    if (typeof Referentiels === "undefined") return;

    Referentiels.register({
        id: "iso-27002-2022",
        nom: "ISO/IEC 27002:2022",
        editeur: "ISO/IEC",
        version: "93 mesures",
        description: "Recueil de référence des mesures de sécurité de l'information, support du système de management ISO 27001. Structurées en 4 thèmes (organisationnel, humain, physique, technologique).",
        aide: "ISO 27002 détaille les bonnes pratiques (« mesures ») que l'on sélectionne pour traiter les risques identifiés. C'est le socle d'une démarche de certification ISO 27001. Intitulés reformulés — se référer à la norme officielle pour le texte exact.",
        domaines: [
            {
                id: "org", nom: "Mesures organisationnelles", court: "Organisationnel",
                aide: "Politiques, rôles, relations fournisseurs, gestion des incidents et conformité : le pilotage de la sécurité.",
                exigences: [
                    { code: "5.1", titre: "Politiques de sécurité de l'information", aide: "Un corpus de politiques validé par la direction, publié et revu régulièrement, qui fixe le cadre." },
                    { code: "5.2", titre: "Rôles et responsabilités sécurité", aide: "Qui est responsable de quoi en matière de sécurité : rôles définis et attribués." },
                    { code: "5.3", titre: "Séparation des tâches", aide: "Répartir les tâches sensibles entre plusieurs personnes pour limiter fraude et erreurs." },
                    { code: "5.4", titre: "Responsabilités de la direction", aide: "La direction exige et soutient l'application des règles de sécurité par tous." },
                    { code: "5.5", titre: "Relations avec les autorités", aide: "Savoir qui contacter (ANSSI, CNIL, police) et maintenir ces contacts à jour." },
                    { code: "5.6", titre: "Relations avec des groupes spécialisés", aide: "Participer à des communautés/CERT pour se tenir informé des menaces et bonnes pratiques." },
                    { code: "5.7", titre: "Renseignement sur les menaces", aide: "Collecter et exploiter l'information sur les menaces (threat intelligence) pour anticiper." },
                    { code: "5.8", titre: "Sécurité dans la gestion de projet", aide: "Intégrer la sécurité dès la conception de tout projet, quelle que soit sa nature." },
                    { code: "5.9", titre: "Inventaire des actifs", aide: "Recenser informations et actifs associés, avec un propriétaire pour chacun." },
                    { code: "5.10", titre: "Usage acceptable des actifs", aide: "Règles d'utilisation des ressources et des informations, connues des utilisateurs." },
                    { code: "5.11", titre: "Restitution des actifs", aide: "Récupérer le matériel et les accès au départ d'une personne ou en fin de contrat." },
                    { code: "5.12", titre: "Classification de l'information", aide: "Classer l'information selon sa sensibilité pour la protéger à la juste mesure." },
                    { code: "5.13", titre: "Marquage de l'information", aide: "Étiqueter les documents selon leur classification (confidentiel, interne…)." },
                    { code: "5.14", titre: "Transfert de l'information", aide: "Encadrer les échanges d'information (règles, chiffrement, accords) en interne et externe." },
                    { code: "5.15", titre: "Contrôle d'accès", aide: "Politique d'accès fondée sur le besoin d'en connaître et le moindre privilège." },
                    { code: "5.16", titre: "Gestion des identités", aide: "Un cycle de vie maîtrisé des identités (création, modification, suppression)." },
                    { code: "5.17", titre: "Informations d'authentification", aide: "Gérer et protéger mots de passe, secrets et facteurs d'authentification." },
                    { code: "5.18", titre: "Droits d'accès", aide: "Attribuer, revoir et retirer les droits d'accès selon les besoins réels." },
                    { code: "5.19", titre: "Sécurité des relations fournisseurs", aide: "Encadrer la sécurité dès le choix et tout au long de la relation avec un fournisseur." },
                    { code: "5.20", titre: "Sécurité dans les accords fournisseurs", aide: "Formaliser les exigences de sécurité dans les contrats." },
                    { code: "5.21", titre: "Sécurité de la chaîne d'approvisionnement TIC", aide: "Maîtriser les risques portés par la chaîne d'approvisionnement informatique." },
                    { code: "5.22", titre: "Suivi des services fournisseurs", aide: "Surveiller, revoir et gérer les changements des services sous-traités." },
                    { code: "5.23", titre: "Sécurité de l'usage du cloud", aide: "Encadrer l'acquisition et l'usage des services cloud (responsabilités partagées)." },
                    { code: "5.24", titre: "Préparation à la gestion des incidents", aide: "Planifier et préparer la réponse aux incidents (rôles, procédures)." },
                    { code: "5.25", titre: "Évaluation des événements de sécurité", aide: "Trier les événements pour décider lesquels sont des incidents." },
                    { code: "5.26", titre: "Réponse aux incidents", aide: "Réagir aux incidents selon des procédures établies." },
                    { code: "5.27", titre: "Tirer les leçons des incidents", aide: "Capitaliser sur les incidents pour renforcer les défenses (retour d'expérience)." },
                    { code: "5.28", titre: "Collecte de preuves", aide: "Recueillir et conserver les preuves de façon exploitable (forensique)." },
                    { code: "5.29", titre: "Sécurité pendant une perturbation", aide: "Maintenir un niveau de sécurité adéquat en cas de crise ou de sinistre." },
                    { code: "5.30", titre: "Continuité TIC", aide: "Préparer les moyens informatiques à soutenir la continuité d'activité." },
                    { code: "5.31", titre: "Exigences légales et contractuelles", aide: "Identifier et respecter les obligations légales, réglementaires et contractuelles." },
                    { code: "5.32", titre: "Propriété intellectuelle", aide: "Respecter les droits de propriété intellectuelle (licences logicielles…)." },
                    { code: "5.33", titre: "Protection des enregistrements", aide: "Protéger les enregistrements contre perte, altération et accès non autorisé." },
                    { code: "5.34", titre: "Protection des données personnelles", aide: "Protéger la vie privée et les données à caractère personnel (lien RGPD)." },
                    { code: "5.35", titre: "Revue indépendante de la sécurité", aide: "Faire auditer la sécurité par une partie indépendante, à intervalles planifiés." },
                    { code: "5.36", titre: "Conformité aux politiques et normes", aide: "Vérifier régulièrement le respect des politiques et normes de sécurité." },
                    { code: "5.37", titre: "Procédures d'exploitation documentées", aide: "Documenter les procédures d'exploitation et les rendre disponibles." }
                ]
            },
            {
                id: "peo", nom: "Mesures liées aux personnes", court: "Humain",
                aide: "Le facteur humain : recrutement, sensibilisation, télétravail et signalement.",
                exigences: [
                    { code: "6.1", titre: "Vérification préalable (recrutement)", aide: "Vérifier les antécédents des candidats, proportionnellement au poste." },
                    { code: "6.2", titre: "Conditions d'embauche", aide: "Inscrire les responsabilités de sécurité dans les contrats de travail." },
                    { code: "6.3", titre: "Sensibilisation et formation", aide: "Former et sensibiliser régulièrement l'ensemble du personnel." },
                    { code: "6.4", titre: "Processus disciplinaire", aide: "Prévoir des sanctions en cas de manquement aux règles de sécurité." },
                    { code: "6.5", titre: "Responsabilités après le départ", aide: "Rappeler les obligations qui subsistent après la fin de contrat (confidentialité)." },
                    { code: "6.6", titre: "Accords de confidentialité", aide: "Faire signer des engagements de confidentialité (NDA) adaptés." },
                    { code: "6.7", titre: "Télétravail", aide: "Sécuriser le travail à distance (matériel, connexion, environnement)." },
                    { code: "6.8", titre: "Signalement des événements de sécurité", aide: "Permettre à chacun de signaler rapidement un événement suspect." }
                ]
            },
            {
                id: "phy", nom: "Mesures physiques", court: "Physique",
                aide: "Protéger les lieux, les équipements et les supports physiques.",
                exigences: [
                    { code: "7.1", titre: "Périmètres de sécurité physique", aide: "Délimiter des zones protégées autour des actifs sensibles." },
                    { code: "7.2", titre: "Contrôle des accès physiques", aide: "N'autoriser l'entrée des zones sécurisées qu'aux personnes habilitées." },
                    { code: "7.3", titre: "Sécurisation des bureaux et locaux", aide: "Protéger bureaux, salles et installations selon leur sensibilité." },
                    { code: "7.4", titre: "Surveillance physique", aide: "Détecter les accès physiques non autorisés (vidéo, alarmes)." },
                    { code: "7.5", titre: "Protection contre les menaces environnementales", aide: "Se prémunir contre incendie, dégât des eaux, catastrophes naturelles." },
                    { code: "7.6", titre: "Travail en zones sécurisées", aide: "Règles de conduite spécifiques dans les zones sensibles." },
                    { code: "7.7", titre: "Bureau propre et écran verrouillé", aide: "Ne pas laisser d'informations sensibles visibles ou une session ouverte." },
                    { code: "7.8", titre: "Emplacement et protection du matériel", aide: "Positionner et protéger les équipements contre les risques et regards indiscrets." },
                    { code: "7.9", titre: "Sécurité des actifs hors des locaux", aide: "Protéger le matériel utilisé à l'extérieur (nomadisme)." },
                    { code: "7.10", titre: "Supports de stockage", aide: "Gérer le cycle de vie des supports (usage, transport, mise au rebut)." },
                    { code: "7.11", titre: "Services supports (utilities)", aide: "Fiabiliser électricité, climatisation, réseau soutenant le SI." },
                    { code: "7.12", titre: "Sécurité du câblage", aide: "Protéger les câbles réseau et d'alimentation contre interception et dommages." },
                    { code: "7.13", titre: "Maintenance du matériel", aide: "Entretenir les équipements pour préserver leur disponibilité et intégrité." },
                    { code: "7.14", titre: "Mise au rebut / réemploi sécurisé", aide: "Effacer les données avant de jeter ou réutiliser un équipement." }
                ]
            },
            {
                id: "tec", nom: "Mesures technologiques", court: "Technologique",
                aide: "Les protections techniques : accès, malware, vulnérabilités, journalisation, réseau, cryptographie, développement sécurisé.",
                exigences: [
                    { code: "8.1", titre: "Terminaux des utilisateurs", aide: "Sécuriser postes, portables et mobiles (durcissement, protection)." },
                    { code: "8.2", titre: "Droits d'accès à privilèges", aide: "Restreindre et surveiller étroitement les comptes à privilèges." },
                    { code: "8.3", titre: "Restriction d'accès à l'information", aide: "Limiter l'accès aux informations selon la politique de contrôle d'accès." },
                    { code: "8.4", titre: "Accès au code source", aide: "Contrôler l'accès en lecture/écriture au code source et aux outils associés." },
                    { code: "8.5", titre: "Authentification sécurisée", aide: "Mettre en œuvre des mécanismes d'authentification robustes (MFA)." },
                    { code: "8.6", titre: "Gestion des capacités", aide: "Dimensionner et surveiller les ressources pour éviter les saturations." },
                    { code: "8.7", titre: "Protection contre les logiciels malveillants", aide: "Antivirus, filtrage et sensibilisation contre les malwares." },
                    { code: "8.8", titre: "Gestion des vulnérabilités techniques", aide: "Identifier, évaluer et corriger les vulnérabilités (veille + correctifs)." },
                    { code: "8.9", titre: "Gestion des configurations", aide: "Définir, appliquer et surveiller des configurations sécurisées." },
                    { code: "8.10", titre: "Suppression de l'information", aide: "Effacer les informations qui ne sont plus nécessaires (durées de conservation)." },
                    { code: "8.11", titre: "Masquage des données", aide: "Masquer/anonymiser les données sensibles quand l'usage le permet." },
                    { code: "8.12", titre: "Prévention des fuites de données", aide: "Détecter et empêcher l'exfiltration d'informations sensibles (DLP)." },
                    { code: "8.13", titre: "Sauvegarde de l'information", aide: "Sauvegarder régulièrement et tester les restaurations." },
                    { code: "8.14", titre: "Redondance des moyens de traitement", aide: "Prévoir de la redondance pour la disponibilité des services." },
                    { code: "8.15", titre: "Journalisation", aide: "Journaliser les événements pertinents et protéger les journaux." },
                    { code: "8.16", titre: "Surveillance des activités", aide: "Surveiller le SI pour détecter les comportements anormaux." },
                    { code: "8.17", titre: "Synchronisation des horloges", aide: "Synchroniser les horloges pour fiabiliser la corrélation des journaux." },
                    { code: "8.18", titre: "Utilitaires à privilèges", aide: "Encadrer l'usage des outils capables de contourner les contrôles." },
                    { code: "8.19", titre: "Installation de logiciels sur les systèmes", aide: "Maîtriser l'installation de logiciels sur les systèmes en production." },
                    { code: "8.20", titre: "Sécurité des réseaux", aide: "Protéger les réseaux et les données qui y transitent." },
                    { code: "8.21", titre: "Sécurité des services réseau", aide: "Définir et contrôler les mécanismes de sécurité des services réseau." },
                    { code: "8.22", titre: "Cloisonnement des réseaux", aide: "Segmenter les réseaux selon la sensibilité et la confiance." },
                    { code: "8.23", titre: "Filtrage web", aide: "Filtrer l'accès aux sites web pour réduire l'exposition aux menaces." },
                    { code: "8.24", titre: "Usage de la cryptographie", aide: "Définir des règles d'emploi du chiffrement et gérer les clés." },
                    { code: "8.25", titre: "Cycle de développement sécurisé", aide: "Intégrer la sécurité tout au long du développement logiciel." },
                    { code: "8.26", titre: "Exigences de sécurité applicative", aide: "Spécifier les exigences de sécurité des applications dès l'expression du besoin." },
                    { code: "8.27", titre: "Principes d'architecture sécurisée", aide: "Concevoir des systèmes selon des principes d'ingénierie sécurisée." },
                    { code: "8.28", titre: "Codage sécurisé", aide: "Appliquer des pratiques de codage évitant les vulnérabilités courantes." },
                    { code: "8.29", titre: "Tests de sécurité", aide: "Tester la sécurité pendant le développement et la recette." },
                    { code: "8.30", titre: "Développement externalisé", aide: "Encadrer et contrôler la sécurité du développement sous-traité." },
                    { code: "8.31", titre: "Séparation dev / test / production", aide: "Cloisonner les environnements pour protéger la production." },
                    { code: "8.32", titre: "Gestion des changements", aide: "Maîtriser les changements du SI par un processus formalisé." },
                    { code: "8.33", titre: "Données de test", aide: "Sélectionner et protéger les données utilisées pour les tests." },
                    { code: "8.34", titre: "Protection des systèmes pendant les audits", aide: "Encadrer les tests d'audit pour ne pas perturber les systèmes en production." }
                ]
            }
        ]
    });
})();
