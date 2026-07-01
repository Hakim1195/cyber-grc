// Emplacement : js/data/ref_anssi.js
// Nom du fichier : ref_anssi.js
//
// Référentiel « Hygiène informatique » de l'ANSSI — 42 mesures, regroupées en
// 10 familles. Contenu = REFORMULATIONS ORIGINALES COURTES + aide pédagogique
// (aucun texte de norme copié). Le guide complet reste la référence :
// https://cyber.gouv.fr (Guide d'hygiène informatique en 42 mesures).
//
// S'auto-enregistre dans le registre `Referentiels` (chargé avant ce fichier).

(function () {
    if (typeof Referentiels === "undefined") return;

    Referentiels.register({
        id: "anssi-hygiene",
        nom: "Hygiène informatique (ANSSI)",
        editeur: "ANSSI",
        version: "42 mesures",
        description: "Socle de bonnes pratiques pour renforcer la sécurité d'un système d'information. Un excellent point de départ, accessible et concret, avant les référentiels plus exigeants (ISO 27001, NIS2, DORA).",
        aide: "Publié par l'Agence nationale de la sécurité des systèmes d'information (ANSSI), ce guide rassemble des mesures élémentaires qui, appliquées, évitent la grande majorité des incidents courants.",
        domaines: [
            {
                id: "sensibiliser", nom: "Sensibiliser et former", court: "Sensibiliser",
                aide: "L'humain est le premier rempart : des équipes formées et des utilisateurs sensibilisés font chuter le nombre d'incidents.",
                exigences: [
                    { code: "1", titre: "Former les équipes informatiques à la sécurité", aide: "Administrateurs et techniciens configurent et exploitent le SI au quotidien : ils doivent être formés aux bonnes pratiques et aux menaces actuelles." },
                    { code: "2", titre: "Sensibiliser tous les utilisateurs aux réflexes de base", aide: "Mots de passe, hameçonnage, pièces jointes : chaque collaborateur est un maillon de la sécurité. Une sensibilisation régulière est très rentable." },
                    { code: "3", titre: "Maîtriser les risques liés à l'infogérance", aide: "Quand un prestataire gère tout ou partie du SI, le contrat doit fixer des exigences de sécurité claires et un droit de regard (audit, réversibilité)." }
                ]
            },
            {
                id: "connaitre", nom: "Connaître le système d'information", court: "Connaître",
                aide: "On ne protège bien que ce que l'on connaît : cartographie, inventaires et gestion des accès.",
                exigences: [
                    { code: "4", titre: "Cartographier le SI et repérer les données sensibles", aide: "Inventaire des serveurs, applications et flux, et localisation des informations les plus critiques : la base de toute protection." },
                    { code: "5", titre: "Tenir un inventaire à jour des comptes à privilèges", aide: "Les comptes administrateurs sont des cibles de choix. Il faut savoir en permanence qui les détient et pour quel usage." },
                    { code: "6", titre: "Gérer les arrivées, départs et changements de poste", aide: "Créer, modifier et surtout retirer les accès au bon moment évite les comptes orphelins exploitables après un départ." },
                    { code: "7", titre: "N'autoriser sur le réseau que les équipements maîtrisés", aide: "Un poste inconnu branché au réseau est une porte d'entrée : n'accepter que le matériel identifié et conforme à la politique." }
                ]
            },
            {
                id: "acces", nom: "Authentifier et contrôler les accès", court: "Accès",
                aide: "Chaque personne est identifiée et n'accède qu'à ce dont elle a besoin, avec une authentification solide.",
                exigences: [
                    { code: "8", titre: "Identifier nommément chaque utilisateur", aide: "Des comptes nominatifs (pas de comptes partagés) et la séparation des rôles utilisateur / administrateur rendent les actions traçables." },
                    { code: "9", titre: "Attribuer les droits au juste besoin (moindre privilège)", aide: "Chacun n'accède qu'aux ressources nécessaires à sa fonction : on limite ainsi l'impact d'un compte compromis." },
                    { code: "10", titre: "Imposer des règles de mots de passe robustes", aide: "Longueur et complexité suffisantes : un mot de passe faible se casse en quelques secondes." },
                    { code: "11", titre: "Protéger les mots de passe stockés", aide: "Ils ne doivent jamais être conservés en clair, mais sous forme d'empreintes (hachage salé)." },
                    { code: "12", titre: "Changer les identifiants et secrets par défaut", aide: "Les comptes « admin/admin » d'usine sont publiquement connus : à modifier dès l'installation." },
                    { code: "13", titre: "Privilégier l'authentification multifacteur (MFA)", aide: "Un second facteur (code, application, clé physique) rend un mot de passe volé insuffisant pour se connecter." }
                ]
            },
            {
                id: "postes", nom: "Sécuriser les postes de travail", court: "Postes",
                aide: "Postes et serveurs durcis de façon homogène, protégés des supports amovibles et du chiffrement des données.",
                exigences: [
                    { code: "14", titre: "Définir un socle de sécurité minimal sur tout le parc", aide: "Configuration durcie et homogène (antivirus, comptes limités, services inutiles désactivés) sur chaque poste et serveur." },
                    { code: "15", titre: "Encadrer l'usage des supports amovibles", aide: "Les clés USB propagent facilement des logiciels malveillants : restreindre, analyser et si besoin chiffrer leur contenu." },
                    { code: "16", titre: "Gérer les configurations de façon centralisée", aide: "Un outil central (GPO, MDM) applique et vérifie partout les mêmes règles, sans oublier de postes." },
                    { code: "17", titre: "Activer le pare-feu local des postes", aide: "Le pare-feu de chaque machine bloque les connexions non sollicitées, y compris entre postes d'un même réseau." },
                    { code: "18", titre: "Chiffrer les données sensibles stockées et échangées", aide: "Le chiffrement rend les données illisibles en cas de vol de matériel ou d'interception." }
                ]
            },
            {
                id: "reseau", nom: "Sécuriser le réseau", court: "Réseau",
                aide: "Cloisonnement, protocoles chiffrés, passerelle Internet maîtrisée et protection de la messagerie.",
                exigences: [
                    { code: "19", titre: "Cloisonner le réseau en zones de sensibilité", aide: "Séparer les zones (bureautique, serveurs, industriel) limite la propagation d'une attaque d'une zone à l'autre." },
                    { code: "20", titre: "Sécuriser le Wi-Fi et séparer les usages", aide: "Chiffrement fort du Wi-Fi et réseau invité isolé du réseau interne." },
                    { code: "21", titre: "Utiliser des protocoles réseau sécurisés", aide: "Préférer les versions chiffrées (HTTPS, SSH, SFTP…) aux protocoles historiques qui transmettent en clair." },
                    { code: "22", titre: "Mettre en place une passerelle Internet sécurisée", aide: "Filtrage, proxy et journalisation encadrent les accès sortants et bloquent les sites ou flux dangereux." },
                    { code: "23", titre: "Isoler les services exposés sur Internet (DMZ)", aide: "Les serveurs accessibles depuis Internet sont placés dans une zone tampon, coupée du cœur du SI." },
                    { code: "24", titre: "Protéger la messagerie professionnelle", aide: "Anti-spam, anti-hameçonnage, filtrage des pièces jointes et authentification des expéditeurs (SPF, DKIM, DMARC)." },
                    { code: "25", titre: "Sécuriser les interconnexions avec les partenaires", aide: "Les liaisons dédiées avec des tiers doivent être chiffrées, filtrées et limitées au strict nécessaire." },
                    { code: "26", titre: "Contrôler l'accès physique aux locaux techniques", aide: "Salles serveurs et baies de brassage protégées : un accès physique contourne beaucoup de protections logiques." }
                ]
            },
            {
                id: "administration", nom: "Sécuriser l'administration", court: "Administration",
                aide: "L'administration du SI est la cible la plus convoitée : elle mérite un environnement dédié et cloisonné.",
                exigences: [
                    { code: "27", titre: "Couper l'accès Internet des outils d'administration", aide: "Les postes et serveurs servant à administrer le SI ne doivent pas naviguer sur Internet (risque de compromission)." },
                    { code: "28", titre: "Dédier et cloisonner le réseau d'administration", aide: "Administrer via un réseau séparé empêche un attaquant du réseau bureautique d'atteindre les consoles d'admin." },
                    { code: "29", titre: "Limiter les droits d'administration au strict besoin", aide: "Moins de comptes disposent de droits élevés, plus la surface d'attaque privilégiée est réduite." },
                    { code: "30", titre: "Réserver les comptes d'admin aux seules tâches d'admin", aide: "Un administrateur utilise un compte standard pour la bureautique et son compte à privilèges uniquement pour administrer." }
                ]
            },
            {
                id: "nomadisme", nom: "Gérer le nomadisme", court: "Nomadisme",
                aide: "Les équipements qui sortent des locaux (portables, mobiles) exigent des protections spécifiques.",
                exigences: [
                    { code: "31", titre: "Protéger physiquement les terminaux nomades", aide: "Verrouillage, filtre de confidentialité et vigilance contre le vol ou la perte des portables et smartphones." },
                    { code: "32", titre: "Chiffrer les postes et supports emportés", aide: "Un ordinateur perdu ne doit pas livrer ses données : le chiffrement du disque est indispensable en mobilité." },
                    { code: "33", titre: "Sécuriser la connexion à distance (VPN)", aide: "Les accès depuis l'extérieur passent par un tunnel chiffré et authentifié vers le SI." },
                    { code: "34", titre: "Encadrer l'usage des terminaux mobiles", aide: "Une politique dédiée aux smartphones et tablettes (MDM, applications autorisées, cloisonnement pro / perso)." }
                ]
            },
            {
                id: "maj", nom: "Maintenir le SI à jour", court: "Mises à jour",
                aide: "Les correctifs ferment les failles connues : les appliquer vite et remplacer ce qui n'est plus maintenu.",
                exigences: [
                    { code: "35", titre: "Appliquer une politique de mises à jour", aide: "Installer rapidement les correctifs de sécurité ferme les failles connues avant qu'elles ne soient exploitées." },
                    { code: "36", titre: "Anticiper l'obsolescence (fin de support)", aide: "Un logiciel ou système qui ne reçoit plus de correctifs devient une vulnérabilité permanente : planifier son remplacement." }
                ]
            },
            {
                id: "superviser", nom: "Superviser, auditer, réagir", court: "Superviser",
                aide: "Détecter, sauvegarder, contrôler et savoir réagir : la sécurité se pilote dans la durée.",
                exigences: [
                    { code: "37", titre: "Journaliser l'activité des composants essentiels", aide: "Sans journaux (logs), on ne détecte ni ne comprend une attaque. Les activer et les conserver est la base de la détection." },
                    { code: "38", titre: "Sauvegarder régulièrement et tester les restaurations", aide: "Des sauvegardes déconnectées et testées sont la meilleure parade contre un rançongiciel. Une sauvegarde non testée n'en est pas une." },
                    { code: "39", titre: "Réaliser des audits de sécurité périodiques", aide: "Contrôles et tests réguliers révèlent les écarts, à corriger via le plan d'actions." },
                    { code: "40", titre: "Désigner un référent sécurité", aide: "Une personne identifiée pilote la sécurité et centralise les alertes et les décisions." }
                ]
            },
            {
                id: "avance", nom: "Pour aller plus loin", court: "Aller + loin",
                aide: "Une fois le socle acquis, formaliser la gestion de crise et l'analyse de risque.",
                exigences: [
                    { code: "41", titre: "Définir une procédure de gestion des incidents", aide: "Savoir à l'avance qui fait quoi (détection, confinement, communication) fait gagner un temps décisif le jour J." },
                    { code: "42", titre: "Mener une analyse de risque et privilégier les produits qualifiés", aide: "Une analyse de risque formelle oriente les priorités ; les produits et services qualifiés par l'ANSSI offrent des garanties supplémentaires." }
                ]
            }
        ]
    });
})();
