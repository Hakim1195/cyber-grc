// Emplacement : js/data/ref_aircyber.js
// Nom du fichier : ref_aircyber.js
//
// Référentiel AirCyber (BoostAerospace) — questionnaire de maturité cybersécurité de
// la filière aéronautique. Généré depuis l'export CSV du questionnaire fourni.
// Les questions d'inventaire d'outils (« quel outil / quelles solutions utilisez-vous »)
// sont écartées (non auto-évaluables). 67 questions écartées ; 234 conservées.
//
// S'auto-enregistre dans le registre `Referentiels`.

(function () {
    if (typeof Referentiels === "undefined") return;
    Referentiels.register({
    "id": "aircyber",
    "nom": "AirCyber (BoostAerospace)",
    "editeur": "BoostAerospace",
    "version": "234 questions",
    "description": "Questionnaire de maturité cybersécurité de la filière aéronautique (programme AirCyber / BoostAerospace). Auto-évaluation des pratiques, support de la démarche de labellisation Bronze / Silver / Gold.",
    "aide": "Questionnaire utilisé dans la supply chain aéronautique pour évaluer et améliorer la cybersécurité des fournisseurs. Les questions d'inventaire d'outils (« quel outil utilisez-vous ») ne sont pas reprises ici : l'auto-évaluation porte sur les pratiques.",
    "domaines": [
        {
            "id": "phys",
            "nom": "Sécurité physique des locaux",
            "court": "Physique",
            "aide": "Accès aux bâtiments, salles serveurs, protection contre les coupures et l'environnement.",
            "exigences": [
                {
                    "code": "1.1",
                    "titre": "Les accès à vos bâtiments, bureaux et installations informatiques sont-ils contrôlés et limités (par exemple par l'utilisation de portes verrouillées, de lecteurs de cartes magnétiques, de dispositifs de prévention, de détection et d'intervention en cas de vol, etc.) ?"
                },
                {
                    "code": "1.2",
                    "titre": "L'enceinte de vos salles serveurs et locaux techniques est-elle sécurisée par une clôture, une barrière à l'entrée, une vidéosurveillance , et une alarme ?"
                },
                {
                    "code": "1.3",
                    "titre": "L'enceinte de vos locaux est-elle sécurisée par des gardiens avec une surveillance de nuit, une barrière à l'entrée, une vidéosurveillance et une alarme ?"
                },
                {
                    "code": "1.4",
                    "titre": "Les visiteurs sont-ils accompagnés en permanence dans vos locaux ?"
                },
                {
                    "code": "1.5",
                    "titre": "Utilisez-vous des onduleurs ou des batteries de secours (pour assurer l'alimentation en cas de coupure de courant) ?"
                },
                {
                    "code": "1.6",
                    "titre": "Avez-vous une politique de bureau (physique et verrouillage écran) propre pour les papiers et les supports de stockage amovibles sensibles ?"
                },
                {
                    "code": "1.7",
                    "titre": "Si vous avez plusieurs sites géographiques informatiques effectuez-vous des visites pour vérifier la sécurité physique et informatique régulièrement (min. 1 fois tous les 2 ans)"
                }
            ]
        },
        {
            "id": "parc",
            "nom": "Inventaire & cartographie du parc",
            "court": "Inventaire",
            "aide": "Connaître son parc informatique et son réseau : la base de toute maîtrise.",
            "exigences": [
                {
                    "code": "2.1",
                    "titre": "Avez-vous un inventaire complet et à jour de votre parc informatique ? (serveurs, PC de bureau, PC portable, imprimante , équipements réseaux, smartphones, etc..)Disposez-vous d'un inventaire précis et à jour des actifs (poste de travail, serveur...) entrant dans la production de vos clients ?"
                },
                {
                    "code": "2.1.1",
                    "titre": "Avez-vous un schéma réseaux complet de votre société ?"
                },
                {
                    "code": "2.1.2",
                    "titre": "Votre cartographie réseaux et protocoles autorisés est-elle disponible et automatiquement mise à jour ?"
                },
                {
                    "code": "2.1.3",
                    "titre": "Avez-vous mis en place une solution de détection et de surveillance (type NAC, surveillance DHCP) de la connexion de nouveaux équipements (type PC, serveur, imprimante, box) sur votre réseau interne ?"
                },
                {
                    "code": "2.10",
                    "titre": "Définissez-vous et appliquez-vous une politique de sauvegarde automatique des composants critiques avec une procédure de restauration testée?"
                },
                {
                    "code": "2.11",
                    "titre": "Avez-vous définit des règles concernant le comportement des utilisateurs vis-à-vis des périphériques qu'ils pourraient brancher sur leurs ordinateurs (interdire de brancher une clé usb trouvée par hasard, faire un scan antivirus des clés des partenaires, ne pas brancher n'importe quel accessoire sur son pc…)?"
                },
                {
                    "code": "2.2",
                    "titre": "La liste de votre parc informatique est-il mis à jour régulièrement ? (serveurs, PC de bureau, PC portable, imprimantes, équipements réseaux, smartphones, etc.)"
                },
                {
                    "code": "2.3",
                    "titre": "Existe-t-il une personne ou un département affecté à la gestion du système informatique ?"
                },
                {
                    "code": "2.4",
                    "titre": "Avez-vous un référent en sécurité des systèmes d’information (RSSI ou équivalent) ?"
                },
                {
                    "code": "2.4.1",
                    "titre": "Votre organisation a-t-elle mis en place une politique de sécurité de l'information et des directives associées ? Les communiquez-vous à l'ensemble des utilisateurs et des responsables projet ?"
                },
                {
                    "code": "2.5",
                    "titre": "Utilisez-vous un outil pour vous assurer que l'ensemble de vos postes de travail (serveurs, PC portable, PC de bureau) sont sécurisés d'une manière homogène (politiques de sécurité identiques entre les postes, gestion des écarts, etc.)"
                },
                {
                    "code": "2.5.1",
                    "titre": "Utilisez-vous un outil pour vous assurer que l'ensemble de vos smartphones sont sécurisés d'une manière homogène (politiques de sécurité identiques entre les postes, gestion des écarts, etc.)"
                },
                {
                    "code": "2.6",
                    "titre": "Avez-vous implémenté un outil de détection des programmes malveillants (antivirus) sur l’ensemble du parc informatique bureautique et sur les serveurs ?"
                },
                {
                    "code": "2.7",
                    "titre": "Avez-vous implémenté un outil de suppression ou de mise en quarantaine des programmes malveillants basé sur la détection de comportement (EDR) sur l’ensemble du parc informatique ?"
                },
                {
                    "code": "2.8",
                    "titre": "Les smartphones d'entreprise sont-ils gérés par votre équipe informatique ? (par exemple : configuration des mots de passe et de la politique des anti-virus)"
                },
                {
                    "code": "2.8.1",
                    "titre": "Les smartphones d'entreprise ont-ils une politique de sécurité dédiée ?"
                },
                {
                    "code": "2.8.2",
                    "titre": "Les smartphones d'entreprise sont-ils gérés de manière centrale avec un outil permettant de contrôler leur configuration, état de sécurité ?"
                },
                {
                    "code": "2.9",
                    "titre": "Disposez-vous d'une solution centralisée pour activer, conserver (au moins un an) et configurer les journaux des composants les plus importants comme les firewalls ou les accès internet ?"
                },
                {
                    "code": "2.9.1",
                    "titre": "Analysez-vous les journaux des composants (serveurs, PC de bureau, PC portable, imprimante , équipements réseaux, smartphones, ...) les plus importants (exemple : supervision/investigation temps réel, SOC, etc.) ?"
                },
                {
                    "code": "2.9.2",
                    "titre": "Activez-vous, gardez-vous au moins pendant un an et configurez-vous les journaux des authentifications des administrateurs sur les équipements réseaux, serveurs et ordinateurs?"
                },
                {
                    "code": "2.9.3",
                    "titre": "Utilisez-vous une procédure pour implémenter l'enregistrement des journaux des composants les plus importants comme les firewall, les accès internet ?"
                },
                {
                    "code": "2.9.4",
                    "titre": "Sécurisez-vous la configuration par défaut de votre serveur Active Directory (AD) et gardez-vous au moins pendant un an les logs avec les informations d’authentification sur l’AD? (Durcissement du système d’exploitation (restreindre les protocoles et services exécutés, interdire l’accès internet direct depuis le serveur, désactiver les comptes par défaut) et du paramétrage du service Active Directory (AD en lecture seule, validation des politiques, des règles de sécurité des postes de travail gérés via l’AD, restriction et sécurisation des mots de passe des comptes à privilèges…)."
                },
                {
                    "code": "2.9.5",
                    "titre": "Avez-vous terminé la sécurisation de votre serveur active directory (en appliquant l’ensemble des bonnes pratiques ou accepté les risques résiduels des mesures non déployées) et en permettant la génération d’alertes détaillées en cas d’incident sécurité (configuration des journaux détaillés, surveillance des journaux) ?"
                }
            ]
        },
        {
            "id": "ident",
            "nom": "Identités & habilitations",
            "court": "Identités",
            "aide": "Comptes nominatifs, vérifications à l'embauche et habilitations.",
            "exigences": [
                {
                    "code": "3.1",
                    "titre": "Chaque employé dispose-t-il d'un identifiant informatique nominatif sur les environnements IT ou de production ?"
                },
                {
                    "code": "3.1.1",
                    "titre": "Effectuez-vous une vérification de la nationalité, des antécédents des employés avant leur embauche quand nécessaire (par exemple : demande casier judiciaire, prise de références), en fonction de leur rôle prévu au sein de l'entreprise (par exemple personnel sénior, personnel informatique, personnel d'entretien) ?"
                },
                {
                    "code": "3.1.2",
                    "titre": "Lorsque des contraintes de sécurité ont été identifiées, habilitation requise par exemple, vérifiez-vous les antécédents et l'adéquation du profil des nouveaux embauchés (casier judiciaire/nationalité) ?"
                },
                {
                    "code": "3.2",
                    "titre": "Confirmez-vous que les comptes affectés aux utilisateurs pour accéder et utiliser le système d'information (ordinateur, serveur, cloud) ne disposent pas de droits administrateur (les administrateurs peuvent modifier les paramètres de sécurité, installer des logiciels et des périphériques et accéder à tous les fichiers de l'ordinateur) ?"
                },
                {
                    "code": "3.3",
                    "titre": "Disposez-vous d'un inventaire exhaustif des comptes à privilèges (d'administration) et le maintenez-vous à jour ?"
                },
                {
                    "code": "3.3.1",
                    "titre": "Si vous utilisez des comptes d'administrateurs sur les machines, avez-vous une solution en place pour contrôler leur sécurité (sécurité du mot de passe, blocage du compte, changement à distance, etc.)?"
                },
                {
                    "code": "3.4",
                    "titre": "Formez-vous les équipes opérationnelles, (administrateurs réseau, sécurité et système, chefs de projet, développeurs, RSSI) à la sécurité des systèmes d'information ?"
                },
                {
                    "code": "3.5",
                    "titre": "Sensibilisez-vous les utilisateurs aux règles, bons comportements à adopter et consignes de sécurité de l’information régissant l’activité quotidienne ?Ceci est-il confirmé par la signature d’une charte des systèmes d’information précisant les règles, et consignes cybersécurité qu’ils doivent respecter, ou un équivalent juridiquement opposable (comme annexe règlement intérieur, contrat de travail)?"
                },
                {
                    "code": "3.5.1",
                    "titre": "Mettez-vous en place des formations systématique en cybersécurité pour l'ensemble des employés, et contractants, adaptées ou customisées en fonction de leur rôle dans l'entreprise et effectuez-vous le suivi de participation à ces formations?"
                },
                {
                    "code": "3.6",
                    "titre": "Les utilisateurs ont-ils à leur disposition des moyens de sécurité informatique liés aux déplacements sur leur PC portable? (Filtre écran, câble de sécurité, VPN, chiffrement, surveillance,…)"
                }
            ]
        },
        {
            "id": "acces",
            "nom": "Gestion des accès & vulnérabilités",
            "court": "Accès",
            "aide": "Cycle de vie des accès, droits, veille sur les failles et correctifs.",
            "exigences": [
                {
                    "code": "4.1",
                    "titre": "Existe-t-il une procédure d'entrée et de départ concernant les utilisateurs et administrateurs ?"
                },
                {
                    "code": "4.10",
                    "titre": "Avez-vous souscrit à un flux d'actualité vous informant des nouvelles failles cybersécurité et d'alertes cybersécurité comme ceux proposés par les CERT gouvernementaux (ANSSI FR, NIST US), les sites de veille sécurité internationaux ?"
                },
                {
                    "code": "4.11",
                    "titre": "Avez-vous mis en place ou contracté des services d'alertes sécurité professionnels et customisés pour votre entreprise, son secteur d'activité, les équipements informatiques que vous avez déployés etc. ? (CERT\" professionnels ou sectoriels, services de Threat Intelligence) ?\""
                },
                {
                    "code": "4.2",
                    "titre": "Faut-il des droits d'administration nécessitant une authentification différente avec un compte admin ou un support informatique aux utilisateurs pour installer des logiciels sur leurs ordinateurs ?"
                },
                {
                    "code": "4.2.1",
                    "titre": "Avez-vous une gestion centralisée et sécurisée des comptes des utilisateurs capable de détecter des comportements anormaux (vol d'identifiants, utilisation sur des serveurs non standard, tentative de découverte du mot de passe…)?"
                },
                {
                    "code": "4.3",
                    "titre": "Protégez-vous les mots de passe stockés sur les systèmes (chiffrement) ?"
                },
                {
                    "code": "4.4",
                    "titre": "Existe-t-il une politique de gestion des mots de passe (fréquence de mise à jour, contraintes minimum de sécurité, caractères spéciaux, nombre de caractères, politique spécifique pour les profils administrateurs…) ?"
                },
                {
                    "code": "4.4.1",
                    "titre": "Changez-vous les mots de passe et identifiants par défaut du parc informatique ?"
                },
                {
                    "code": "4.5",
                    "titre": "Faites-vous régulièrement des mises à jour des composants (serveurs, PC de bureau, PC portable, imprimantes , équipements réseaux, smartphones, etc..) sur votre parc informatique ?"
                },
                {
                    "code": "4.6",
                    "titre": "Anticipez-vous la fin de la maintenance des logiciels et systèmes ?"
                },
                {
                    "code": "4.6.1",
                    "titre": "Afin d’éviter les failles potentielles (logiciel inconnu, non mis à jour…) vérifiez-vous les versions des logiciels installés sur votre parc informatique ?"
                },
                {
                    "code": "4.6.2",
                    "titre": "Avez-vous la liste des logiciels autorisés et interdits ?"
                },
                {
                    "code": "4.7",
                    "titre": "Suivez-vous au moins de manière hebdomadaire une procédure de gestion des alertes et avis de sécurité de CERT (Computer Emergency Response Team) et des éditeurs de logiciels ?"
                },
                {
                    "code": "4.8",
                    "titre": "Existe-t-il un centre d’opération de sécurité SOC (Security OperationCenter) permettant la détection et la supervision de la sécurité du système d'information ?"
                },
                {
                    "code": "4.8.1",
                    "titre": "Centralisez-vous au travers d’outils de collecte SIEM (Security Information Event Management) les incidents et évènements de sécurité ?"
                },
                {
                    "code": "4.8.2",
                    "titre": "Supervisez-vous les périphériques des utilisateurs comme par exemple : PC fixe, PC portable, smartphone, clé USB, etc... ?"
                },
                {
                    "code": "4.8.3",
                    "titre": "Existe-t-il un outil d’alerte permettant d’exécuter un arrêt automatique ou une isolation de certain éléments du parc en cas d’incident majeur ?"
                },
                {
                    "code": "4.8.4",
                    "titre": "Existe-t-il un centre de supervision de votre réseau permettant la détection des incidents de sécurité (NOC (Network Operations Center))?"
                },
                {
                    "code": "4.8.5",
                    "titre": "Bloquez-vous les connexions non autorisées à votre réseau ?"
                },
                {
                    "code": "4.8.6",
                    "titre": "Avez-vous déployé et supervisez-vous des sondes réseau pour détecter des activités malicieuses ou anormales?"
                },
                {
                    "code": "4.9",
                    "titre": "Existe-t-il des processus d'escalade et d'alerte des incidents de sécurité ?"
                },
                {
                    "code": "4.9.1",
                    "titre": "Avez-vous mis en place des solutions sur les PC et les Serveurs permettant de détecter des comportements anormaux, les bloquer ou alerter (IDS/IPS) ?"
                }
            ]
        },
        {
            "id": "serveurs",
            "nom": "Sécurisation des serveurs & supervision",
            "court": "Serveurs",
            "aide": "Durcissement des serveurs sensibles, protection et surveillance du SI.",
            "exigences": [
                {
                    "code": "5.1",
                    "titre": "Connaissez-vous les serveurs les plus sensibles de votre parc ?"
                },
                {
                    "code": "5.10",
                    "titre": "Existe-t-il une surveillance du trafic Internet avec des alertes mais aussi des indicateurs (KPI) sur l'utilisation des données de l'entreprise sur Internet ?"
                },
                {
                    "code": "5.10.1",
                    "titre": "Chiffrez-vous vos connexions entre vos différents sites de votre société et vos partenaires ?"
                },
                {
                    "code": "5.10.2",
                    "titre": "Si vous avez autorisé la navigation vers des sites internet non-professionnel, avez-vous déployé une solution de navigation sécurisée pour ces sites l'isolant du réseau informatique standard?"
                },
                {
                    "code": "5.11",
                    "titre": "Avez-vous un accès Wifi visiteur\" isolé du reste du réseau de l’Entreprise ? (Connexion spécifique, Wifi dédié ?)\""
                },
                {
                    "code": "5.12",
                    "titre": "Avez-vous un accès Wifi sécurisé avec une séparation des usages ? ( personnel , industriel, professionnelle , visiteur, etc.)"
                },
                {
                    "code": "5.13",
                    "titre": "Existe-t-il un système de filtrage des E-mails ? (Anti-spam, suppression des fichiers joints suspects, etc…)"
                },
                {
                    "code": "5.13.1",
                    "titre": "Offrez-vous aux utilisateurs la possibilité de chiffrer facilement le contenu des E-mails ?"
                },
                {
                    "code": "5.14",
                    "titre": "Sécurisez-vous les interconnexions réseau avec vos sous-traitants et fournisseurs ?"
                },
                {
                    "code": "5.14.1",
                    "titre": "Offrez-vous une plateforme d’échange sécurisé pour vos sous-traitants et fournisseurs ?"
                },
                {
                    "code": "5.14.2",
                    "titre": "Si votre site Web est hébergé à l'intérieur de l'entreprise, séparez-vous votre site Web et les services accessibles par Internet du reste du réseau de l'entreprise (via une zone réseaux ségréguée, type DMZ\") ? \""
                },
                {
                    "code": "5.15",
                    "titre": "N’autorisez-vous la connexion au réseau qu'aux appareils identifiés et gérés par le système d'information ?"
                },
                {
                    "code": "5.17",
                    "titre": "Pour l'accès à distance à votre système d'information (utilisateurs nomades ou d'astreinte, sites distants, actions de maintenance préventives ou correctives) avez-vous systématiquement mis en place une solution de sécurité garantissant une identification et une authentification forte de l'utilisateur (VPN associé à de la MFA, identifiant/mot de passe personnels, uniques et incessibles, certificats, ...) ?"
                },
                {
                    "code": "5.2",
                    "titre": "Utilisez-vous des équipements de sécurité pour protéger et cloisonner votre réseau interne. (Firewall, proxy, etc.) ?"
                },
                {
                    "code": "5.2.1",
                    "titre": "Utilisez-vous un firewall sur les postes clients ? (PC portable, PC de bureau) ?"
                },
                {
                    "code": "5.2.2",
                    "titre": "Contrôlez-vous la configuration des firewall au moins une fois par an ?"
                },
                {
                    "code": "5.3",
                    "titre": "Avez-vous une architecture réseau privilégiant les communications sécurisées et n'autorisant que de manière exceptionnelle les communications non-sécurisées en les isolant du reste du réseau. Par exemple, encourager les communications chiffrées et interdire les protocoles non sécurisés (ex : configurer les pare-feu réseau et sur les postes de travail/serveurs pour interdire le protocole telnet-23 dans le réseau local, l'utilisation de partages Windows via Samba v1, l'authentification NTLMv1, etc.) ?"
                },
                {
                    "code": "5.4",
                    "titre": "Utilisez-vous une authentification forte pour la connexion à vos mails entreprise depuis Internet (double authentification avec téléphone et / ou blocage des comptes contre les essais de mots de passe, changement de mot de passe régulier, mot de passe complexe) ?"
                },
                {
                    "code": "5.5",
                    "titre": "Utilisez-vous une authentification forte et surveillez-vous (alertes en cas d'échec) la connexion aux équipements sensibles comme par exemple : l’administration des équipements IT, l'administration des services cloud et sites internet ?"
                },
                {
                    "code": "5.5.1",
                    "titre": "Utilisez-vous des fonctionnalités SSO (single sign on) pour les applications http ou E-SSO avec un gestionnaire de mots de passe automatisé ?"
                },
                {
                    "code": "5.6",
                    "titre": "Utilisez-vous un réseau dédié, cloisonné (internet, poste utilisateur) et sécurisé par des mécanismes de ruptures protocolaires (machines de rebond, bastion d'administration, proxyfication, etc.) pour l’administration du système d’information ?"
                },
                {
                    "code": "5.6.1",
                    "titre": "Avez-vous une protection sur les postes de travail pour éviter que les utilisateurs puissent ouvrir des réseaux internet sans sécurité en branchant par exemple un modem / clé usb 3G, smartphone et en même temps avoir ces même ordinateurs connectés au réseau de l'entreprise ?"
                },
                {
                    "code": "5.7",
                    "titre": "Vous protégez-vous des menaces relatives à l'utilisation de supports amovibles ?"
                },
                {
                    "code": "5.7.1",
                    "titre": "Chiffrez-vous les données sensibles sur des supports amovibles sans aucune action requise de la part des utilisateurs (chiffrement automatique transparent) ?"
                },
                {
                    "code": "5.8",
                    "titre": "Tous les équipements (ordinateur, tablette, smartphone), connectés au système d’information de l’entreprise ont-ils fait l’objet d’une procédure formelle et préalable d’approbation ?"
                },
                {
                    "code": "5.8.1",
                    "titre": "Avez-vous un contrôle total sur l’environnement professionnel des applications d'entreprise / données sur les appareils mobiles? (Etanchéité des environnements personnel et professionnel)"
                },
                {
                    "code": "5.9",
                    "titre": "Les accès à internet sont-ils filtrés par un serveur mandataire (proxy) ?"
                },
                {
                    "code": "5.9.1",
                    "titre": "Protégez-vous vos serveurs web accessibles de l’extérieur du réseau de la société par des équipement de filtrage type WAF (web access filtering) ?"
                }
            ]
        },
        {
            "id": "donnees",
            "nom": "Sauvegardes & protection des données",
            "court": "Données",
            "aide": "Sauvegardes régulières et testées, responsabilité et protection des données.",
            "exigences": [
                {
                    "code": "6.1",
                    "titre": "Les données importantes sont-elles sauvegardées régulièrement ?"
                },
                {
                    "code": "6.10",
                    "titre": "Avez-vous défini que les données de votre entreprise devaient être associées à des responsables identifiés et leurs responsabilités (données des RH, données du bureau d'étude, etc.)"
                },
                {
                    "code": "6.2",
                    "titre": "Vos sauvegardes sont-elles protégées dans un local sécurisé ?"
                },
                {
                    "code": "6.3",
                    "titre": "Utilisez-vous un système de stockage et de sauvegarde des données piloté en central, comme un Cloud (AWS, O365 Sharepoint, OneDrive, google drive,…) ?"
                },
                {
                    "code": "6.4",
                    "titre": "Chiffrez-vous les disques durs des ordinateurs, smartphones sans aucune interaction des utilisateurs (chiffrage automatique transparent) ?"
                },
                {
                    "code": "6.5",
                    "titre": "Mettez-vous en place des solutions de gestion de protection des données de l’entreprise (détection de fuite des données confidentielles, rôles et responsabilités …) ?"
                },
                {
                    "code": "6.6",
                    "titre": "Procédez-vous à des audits de sécurité réguliers (applicatif, réseau, processus), puis appliquez-vous les actions correctives associées ?"
                },
                {
                    "code": "6.6.1",
                    "titre": "Vérifiez-vous la conformité des filiales de votre entreprise ?"
                },
                {
                    "code": "6.6.2",
                    "titre": "Effectuez-vous régulièrement des vérifications des règles de vos Firewalls ?"
                },
                {
                    "code": "6.7",
                    "titre": "Procédez-vous à des tests d'intrusion (pentest) réguliers sur votre SI et de vos filiales, puis appliquez-vous les actions correctives associées ?"
                },
                {
                    "code": "6.7.1",
                    "titre": "Procédez-vous à des tests d'intrusion (pentest) des sites web de votre société, puis appliquez-vous les actions correctives associées ?"
                },
                {
                    "code": "6.7.2",
                    "titre": "Vérifiez-vous et mettez-vous à jour régulièrement vos dispositifs de détection d'attaque cyber ? (Via par exemple la mise à jour des règles de supervision sécurité suite aux pentests effectués sur vos systèmes, ou une gestion de projet sécurité)"
                },
                {
                    "code": "6.8",
                    "titre": "Avez-vous à disposition les moyens et outils nécessaires pour chiffrer les données sensibles envoyées à l'extérieur de l'entreprise ?"
                },
                {
                    "code": "6.9",
                    "titre": "Définissez-vous une politique de classification des données en fonction de leur usage (public, confidentiel entreprise, confidentiel…) et des règles de protection à appliquer à ces données ?"
                },
                {
                    "code": "6.9.1",
                    "titre": "Avez-vous mis en place une solution de classification automatique des données de votre entreprise, ou d'aide à la prise de décision de protection d'une données qui serait classifiée sensible?"
                },
                {
                    "code": "6.9.2",
                    "titre": "Avez-vous une solution permettant d'interdire l'envoi de données confidentielles non protégées ou de procéder à leur chiffrement systématique avant qu'elles soient enregistrées ou envoyées en dehors de votre système d'information ?"
                }
            ]
        },
        {
            "id": "ot",
            "nom": "Systèmes industriels (OT)",
            "court": "Industriel",
            "aide": "Cloisonnement, cartographie et protection des environnements de production industriels.",
            "exigences": [
                {
                    "code": "7.0",
                    "titre": "Mettez-vous en place un cloisonnement entre l'environnement de production industriel et les autres environnements (qualification, pré-production, systèmes d'information entreprise, etc.) ?"
                },
                {
                    "code": "7.1.1",
                    "titre": "Avez-vous effectué une cartographie de votre système d'information industriel en identifiant les éléments le plus sensibles?"
                },
                {
                    "code": "7.1.2",
                    "titre": "Effectuez-vous des sauvegardes des éléments les plus sensibles de vos systèmes d'information industriel (configuration, code source et données)?"
                },
                {
                    "code": "7.1.3",
                    "titre": "Est-ce que les sauvegardes de vos systèmes d'information sont régulièrement testées?"
                },
                {
                    "code": "7.10",
                    "titre": "Existe-t-il une architecture et des règles de gestion spécifiquement définies ?"
                },
                {
                    "code": "7.11",
                    "titre": "Les processus de changement, les solutions dédiées de l’IACS font-ils l'objet d'un audit de conformité technique sécurité annuel ?"
                },
                {
                    "code": "7.12",
                    "titre": "Les composants de l’ICS font ils l’objet d'un processus de surveillance des menaces et des vulnérabilités ?"
                },
                {
                    "code": "7.13",
                    "titre": "Existe-t-il un centre de supervision sécurité (SOC, NOC (Network Operations Center), backup status...) de votre réseau permettant la détection des incidents de sécurité, problème de backup, et/ou surveillance active de l'Informatique industrielle (IACS) ?"
                },
                {
                    "code": "7.14",
                    "titre": "Lorsqu'un incident survient dans la production, investiguez-vous pour identifier si cet incident pourrait être causé par un élément malveillant ?"
                },
                {
                    "code": "7.2",
                    "titre": "documentation, la nomenclature et les schémas des équipements ICS sont-ils tenus à jour ?"
                },
                {
                    "code": "7.3",
                    "titre": "Existe-t-il un processus documenté de gestion des crises ? (comme par exemple, la reprise d’activité après un crash système)"
                },
                {
                    "code": "7.4",
                    "titre": "La documentation relative à la conception, aux composants et à l'exploitation des ICS est-elle stockée avec un niveau de sécurité approprié ?"
                },
                {
                    "code": "7.5",
                    "titre": "Existe-t-il une personne qualifiée ou un département dédié à la conception, l’exploitation, et la surveillance des équipements de l’ICS ?"
                },
                {
                    "code": "7.6",
                    "titre": "Existe-t-il un programme de sensibilisation ou de formation en matière de sécurité des ICS pour les employés et sous-traitants ?"
                },
                {
                    "code": "7.7",
                    "titre": "Les utilisateurs, automaticiens et administrateurs des systèmes contrôle d'automatisation industrielle (IACS) ont-ils signés une charte d'utilisation et de bonnes pratiques cybersécurité ?"
                },
                {
                    "code": "7.8",
                    "titre": "Des procédures sont-elles en place pour gérer le cycle de vie des ICS ?"
                },
                {
                    "code": "7.9",
                    "titre": "Utilisez-vous un réseau dédié et cloisonné pour l’administration des ICS ?"
                }
            ]
        },
        {
            "id": "clients",
            "nom": "Exigences clients (SSI)",
            "court": "Clients",
            "aide": "Exigences de sécurité des donneurs d'ordre et niveau de conformité.",
            "exigences": [
                {
                    "code": "8.1",
                    "titre": "Avez-vous des exigences précises de vos clients en matière de gestion de la sécurité des SI ? (par exemple : appels d'offres, clauses dans les contrats)"
                },
                {
                    "code": "8.2",
                    "titre": "Si oui, quel est votre degré de conformité vis-à-vis de ces exigences ?"
                },
                {
                    "code": "8.3",
                    "titre": "Si oui, ces exigences sont-elles différentes d'un client à l'autre ?"
                },
                {
                    "code": "8.4",
                    "titre": "Avez-vous pour votre part mis en place des exigences particulières en termes de cyber sécurité vis-à-vis de vos propres fournisseurs ?"
                }
            ]
        },
        {
            "id": "gouv",
            "nom": "Gouvernance & risques cyber",
            "court": "Gouvernance",
            "aide": "Connaissance des risques, budget, assurance et pilotage de la cybersécurité.",
            "exigences": [
                {
                    "code": "9.1",
                    "titre": "Connaissez-vous bien l'ensemble des risques liés à la Cyber sécurité ? (Infogérances, Perte de données, image de l'entreprise, cyber-espionnage, risque légal…)"
                },
                {
                    "code": "9.10",
                    "titre": "Vos différents contrats d’assurance vous couvrent-ils en cas de perte d'activité liée à un problème de sécurité informatique ?"
                },
                {
                    "code": "9.2",
                    "titre": "Existe-t-il un budget spécifique lié à la gestion informatique dans l'entreprise ? (Matériel / suivi / maintenance / sécurité ?)"
                },
                {
                    "code": "9.3",
                    "titre": "Si oui, à combien s'élève ce budget par an (%) ?"
                },
                {
                    "code": "9.4",
                    "titre": "Quelle part de ce budget ‘informatique’ est actuellement allouée à la cyber sécurité (%)?"
                },
                {
                    "code": "9.5",
                    "titre": "A partir de quelle durée d’interruption de vos Systèmes d’Information vos activités subiront-elles un impact quantifiable ?"
                },
                {
                    "code": "9.6",
                    "titre": "Aujourd'hui, pensez-vous être suffisamment protégé contre les risques liés à l'informatique et à l'internet ?"
                },
                {
                    "code": "9.7",
                    "titre": "Avez-vous, à votre connaissance, déjà été victime d'une cyber attaque ?"
                },
                {
                    "code": "9.7.1",
                    "titre": "Avez-vous mis en place, documenté et testé au moins annuellement un procédure de gestion de problèmes sécurité vous permettant d'être assuré de pouvoir réagir rapidement et d'impliquer les bonnes personnes internes ou externes?"
                },
                {
                    "code": "9.8",
                    "titre": "Avez-vous déjà effectué une analyse de risque cyber sur votre entreprise ?"
                },
                {
                    "code": "9.8.1",
                    "titre": "Révisez-vous annuellement le niveau de risque cyber de votre entreprise en révisant les analyses de risques de votre entreprise ?"
                },
                {
                    "code": "9.8.2",
                    "titre": "Avez-vous une solution informatisée pour la gestion du risque vous permettant de manière plus ou moins automatisée de remonter le niveau de risque cyber et de le traiter ?"
                },
                {
                    "code": "9.9",
                    "titre": "Disposez-vous d'un contrat d'assurance lié au risque informatique ? (Matériel et cyberattaque ?)"
                }
            ]
        },
        {
            "id": "ext",
            "nom": "Questions étendues (Ext)",
            "court": "Étendu",
            "aide": "Questions complémentaires du questionnaire, pour approfondir la maturité.",
            "exigences": [
                {
                    "code": "Ext1",
                    "titre": "Externalisez-vous des logs de cybersécurité (hors de l'environnement où ils sont générés) pour garantir leur intégrité ?"
                },
                {
                    "code": "Ext10",
                    "titre": "Cartographie :Les appareils physiques, les plates-formes logicielles, les systèmes au sein de l'organisation sont-ils inventoriés et catégorisés ?Disposez-vous d'une cartographie de l'ensemble des interfaces du produit avec d'autres systèmes ? Cette cartographie inclut-elle l'ensemble des protocoles utilisés et la matrice de flux ?"
                },
                {
                    "code": "Ext11",
                    "titre": "Lorsque vous avez demandé une connexion à distance au système d'information de vos clients pour vos employés, est-ce que vous informez systématiquement vos clients lorsque ces accès doivent être révoqués (par exemple suite au départ d'un employé) ?"
                },
                {
                    "code": "Ext12",
                    "titre": "Mettez-vous en place une politique de durcissement sécurité de la configuration sur vos postes de travail et serveurs ?"
                },
                {
                    "code": "Ext13",
                    "titre": "L'antivirus scanne-t-il automatiquement les serveurs, postes de travail et les clés USB connectées aux bancs de production ?"
                },
                {
                    "code": "Ext14",
                    "titre": "Désactivez-vous les exécutions automatiques des nouveaux périphériques branchés sur les PCs, laptops et serveurs (autorun) ?"
                },
                {
                    "code": "Ext15",
                    "titre": "Avez-vous une politique de mise à jour des bases de signature et moteurs de l'antivirus au moins quotidienne sur l'ensemble du parc standard avec une gestion des exceptions pour les équipements spécifiques ?"
                },
                {
                    "code": "Ext16",
                    "titre": "Possédez-vous un système de gestion centralisée (console) des mécanismes de mise à jour de la protection contre l'exécution de code malveillant sur le parc ?"
                },
                {
                    "code": "Ext17",
                    "titre": "Testez-vous l'efficacité des programmes de protection contre les malwares ?"
                },
                {
                    "code": "Ext18",
                    "titre": "Mettez-vous en place des mesures de sécurité adaptées au niveaux de classification des données manipulées sur les supports (Laptop, USB, email, …) ?"
                },
                {
                    "code": "Ext19",
                    "titre": "Existe-t-il une procédure permettant de créer, de mettre à jour et de supprimer les accès des utilisateurs et administrateurs impliqués sur les environnements de production ?"
                },
                {
                    "code": "Ext2",
                    "titre": "Activez vous les fonctions de génération et d'enregistrement des logs sur vos equipements informatique ?"
                },
                {
                    "code": "Ext20",
                    "titre": "Définissez-vous systématiquement une date de fin lors de la création des comptes stagiaires, ou externes (prestataires) dans les environnements de production ?"
                },
                {
                    "code": "Ext21",
                    "titre": "Créez-vous des comptes nominatifs pour chaque employé d'une société de prestataires ?"
                },
                {
                    "code": "Ext22",
                    "titre": "Mettez-vous à jour vos systèmes suivant les recommandations des éditeurs (mise à jour, configuration, …) ?"
                },
                {
                    "code": "Ext23",
                    "titre": "Avez-vous mis en place un processus de gestion des vulnérabilités de vos services (identification, classification, priorisation, remédiation et atténuation des vulnérabilités) ?"
                },
                {
                    "code": "Ext24",
                    "titre": "Mettez-vous en place des process de décommissionnement (pv de destruction, suppression totale des fichiers) avant la mise au rebut des actifs (poste de travail, serveurs) ?"
                },
                {
                    "code": "Ext25",
                    "titre": "Les supports en attente de destruction sont-ils stockés dans un environnement avec un accès restreint et contrôlé ?"
                },
                {
                    "code": "Ext26",
                    "titre": "Les dispositifs de sauvegarde font-ils l'objet de contrôles réguliers pour s'assurer de leur bon fonctionnement ?"
                },
                {
                    "code": "Ext27",
                    "titre": "Mettez-vous en place des sessions de formation/de simulation de gestion de crise ?"
                },
                {
                    "code": "Ext28",
                    "titre": "Disposez-vous d'un contrat d'assurance pour vous protéger des conséquences d'un incident tel que : - dommages physiques- dommages informatiques- dommages cyber- perte d'activité"
                },
                {
                    "code": "Ext29",
                    "titre": "Est-ce que votre organisation est certifiée en cybersécurité ?Merci de fournir le certificat et les informations concernant le champ et périmètre de certification."
                },
                {
                    "code": "Ext3",
                    "titre": "Utilisez-vous une plateforme d'échanges sécurisée avec vos clients pour l'échange d'informations sensibles ?"
                },
                {
                    "code": "Ext30",
                    "titre": "Disposez-vous d'un schéma fonctionnel type présentant le cycle des différents échanges (matériel et immatériel), flux de production entre vos clients et vous, pour la confection d'un produit, incluant les échanges internes ou livraisons clients sur support amovible ?"
                },
                {
                    "code": "Ext31",
                    "titre": "Prenez-vous en compte, dans l'environnement industriel, la sensibilité des informations échangées avec vos clients ?"
                },
                {
                    "code": "Ext32",
                    "titre": "Un plan de gestion de la sécurité projet est-il élaboré, mis en œuvre, remis et communiqué à vos clients pour garantir que toutes les parties prenantes comprennent les attentes du projet et leurs rôles et responsabilités ?(Ce plan inclut-il le point de contact responsable des activités de cybersécurité pendant le projet ?)"
                },
                {
                    "code": "Ext33",
                    "titre": "Disposez-vous d'un processus de gestion des incidents (incluant les incidents relatifs aux violations de données) qui prévoit de notifier les clients lorsqu'un incident concerne le produit/les services qui lui sont fournis ?"
                },
                {
                    "code": "Ext34",
                    "titre": "Identifiez-vous la localisation des données / biens qui sont traités / opérés dans le cadre de la prestation (en incluant si besoin les données personnelles de vos clients surtout lorsque celles-ci sont stockées dans des espaces partagés de type cloud (localisations de sauvegarde et de reprise d'activité incluses) ?Si la réponse est oui, expliquez comment vous procédez SVP (et détaillez les pays où sont localisées les données)."
                },
                {
                    "code": "Ext35",
                    "titre": "Traitez-vous l'information ou les données transmises par vos clients ou produites dans le cadre de la prestation selon la dernière version de la directive de vos clients relative à la Protection de l'Information ?"
                },
                {
                    "code": "Ext36",
                    "titre": "Utilisez-vous des environnements Cloud pour la production ou le traitement des données de vos clients ?Si oui, séparez-vous les données par client à minima de manière logicielle dans tous les environnements (production, sauvegarde, ...) ?"
                },
                {
                    "code": "Ext37",
                    "titre": "Avez-vous identifié la durée maximale d'interruption admissible de votre chaîne de production par rapport à vos contrats clients ?"
                },
                {
                    "code": "Ext38",
                    "titre": "Les accès aux différents environnements de développement sont-ils accordés selon le principe du moindre privilège (ne pas donner les accès à tous les environnements à tous les utilisateurs mais utiliser une configuration avec des groupes d'utilisateurs associés à certains équipements) ?"
                },
                {
                    "code": "Ext39",
                    "titre": "Avez-vous une politique de génération de logs par défaut des produits livrés aux clients qui enregistre les actions principales du produit?"
                },
                {
                    "code": "Ext4",
                    "titre": "Utilisez-vous uniquement les accès internet définis au sein de l'entreprise ?"
                },
                {
                    "code": "Ext40",
                    "titre": "Savez-vous lister les sites physiques de production rentrant dans les services fournis à vos clients ?Disposez-vous d'un schéma à jour présentant les interconnexions réseau entre vos clients et vous (cartographie IP, serveurs, et adressage) ?"
                },
                {
                    "code": "Ext41",
                    "titre": "Les fournisseurs et les partenaires tiers des systèmes, composants et services d'information sont-ils identifiés, classés par ordre de priorité et évalués à l'aide d'un processus d'évaluation des risques lié à la chaîne d'approvisionnement ?"
                },
                {
                    "code": "Ext42",
                    "titre": "Un référent cybersécurité (point focal) est-il identifié pour les moyens de production ?"
                },
                {
                    "code": "Ext43",
                    "titre": "Avez-vous formalisé des règles de sécurité à appliquer sur les environnements de production et formé les collaborateurs concernés ?"
                },
                {
                    "code": "Ext44",
                    "titre": "Les postes de travail de l'environnement de production sont-ils régulièrement mis à jour ?"
                },
                {
                    "code": "Ext45",
                    "titre": "Assurez-vous une mise à jour des postes de travail en stock (spare) avant de les remettre en service ?"
                },
                {
                    "code": "Ext46",
                    "titre": "Disposez-vous de moyens techniques ou de processus afin de retrouver l'auteur d'une action sur les environnements de production (journaux d'authentification, corrélation entre planning de shift et les comptes utilisés) ?"
                },
                {
                    "code": "Ext47",
                    "titre": "Les logs systèmes et antivirus sont-ils activés sur les environnements de production ?"
                },
                {
                    "code": "Ext48",
                    "titre": "Avez-vous défini des mesures encadrant l'utilisation des comptes à privilèges (création, mise à jour, suppression, règles particulières en cas de comptes génériques) ?Si la réponse est oui, détaillez SVP."
                },
                {
                    "code": "Ext49",
                    "titre": "En cas d'utilisation de comptes mutualisés sur les environnements de production, disposez-vous d'autres mesures de sécurité que le mot de passe pour vous connecter aux environnements de production (contrôle d'accès physique à la salle hébergeant les postes de travail de production et/ou solutions logicielles de type transparent screen lock)?"
                },
                {
                    "code": "Ext5",
                    "titre": "Possédez-vous un plan de continuité d'activité décrivant les processus et technologies en place pour la restauration des serveurs critiques, équipements réseau, ordinateurs portables et fixes après un incident ?"
                },
                {
                    "code": "Ext50",
                    "titre": "Effectuez-vous à minima deux mises à jour sur les équipements de production par an ?"
                },
                {
                    "code": "Ext51",
                    "titre": "Changez-vous les mots de passe et identifiants par défaut sur les environnements de production de vos clients ?"
                },
                {
                    "code": "Ext52",
                    "titre": "Possédez-vous un moyen permettant de détecter les connexions étrangères ou non autorisées aux serveurs utilisés par vos systèmes industriels afin de les qualifier et de les bloquer au besoin ?"
                },
                {
                    "code": "Ext53",
                    "titre": "Le réseau wifi de production est-il dédié et isolé des autres réseaux wifi ?"
                },
                {
                    "code": "Ext54",
                    "titre": "Désactivez-vous par défaut les connexions wifi/sans fil sur vos équipements (bancs de production industriels) ?"
                },
                {
                    "code": "Ext55",
                    "titre": "Disposez-vous de stations blanches accessibles à tous les utilisateurs afin de vous assurer de l'innocuité des médias amovibles utilisés pour la production de vos clients ?"
                },
                {
                    "code": "Ext56",
                    "titre": "Mettez-vous en place des restrictions particulières ou des mesures spécifiques encadrant l'utilisation des périphériques amovibles dans les environnements de production ?"
                },
                {
                    "code": "Ext57",
                    "titre": "Un des antivirus utilisé sur les stations blanches est-il différent de celui utilisé sur les postes de travail ?"
                },
                {
                    "code": "Ext58",
                    "titre": "Disposez-vous de mesures de sécurité pour encadrer et sécuriser les usages du BYOD dans les environnements de production de vos clients (notamment connexion au réseau, protection anti-malware, ...) ?"
                },
                {
                    "code": "Ext59",
                    "titre": "Avez-vous un processus de gestion de crise/d'incidents pour les incidents de production de vos clients partagé avec vos clients (alerte du Responsable Sécurité de votre client) ?"
                },
                {
                    "code": "Ext6",
                    "titre": "Vos plans de gestion de crise, de continuité et de reprise d'activités sont-ils conçus en incluant vos prestataires/fournisseurs ?"
                },
                {
                    "code": "Ext60",
                    "titre": "Vos intervenants externes et fournisseurs signent-ils la charte d'utilisation et de bonnes pratiques cybersécurité relative aux systèmes de contrôle d'automatisation industrielle (IACS) ?Archivez-vous ces documents signés ?"
                },
                {
                    "code": "Ext61",
                    "titre": "Avez-vous déjà effectué une analyse de risque cyber sur vos systèmes d'information de production ?"
                },
                {
                    "code": "Ext62",
                    "titre": "Mettez-vous à jour à minima annuellement les risques concernant vos systèmes d'information de production ?"
                },
                {
                    "code": "Ext63",
                    "titre": "Les éléments identifiés lors de l'analyse des risques sont-ils pris en compte dans le PCA de l'entreprise ?"
                },
                {
                    "code": "Ext64",
                    "titre": "Les accès physiques à la salle de stockage (lorsque c'est le cas) des sauvegardes sont-ils réglementés ?"
                },
                {
                    "code": "Ext65",
                    "titre": "Possédez-vous un plan de secours informatique sur les environnements de production y compris les machines et bancs de production ?"
                },
                {
                    "code": "Ext66",
                    "titre": "Les accès aux archives sont-ils restreints ou protégés physiquement (clés ou badge...) ?"
                },
                {
                    "code": "Ext67",
                    "titre": "Votre politique de sauvegarde prend t-elle en compte les données et produits fournis à vos clients ?"
                },
                {
                    "code": "Ext68",
                    "titre": "Savez-vous identifier les salles serveurs utilisées dans le cadre de la prestation pour chacun de vos clients ?"
                },
                {
                    "code": "Ext69",
                    "titre": "Disposez-vous des coordonnées de vos points de contact de vos clients à alerter en cas d'incident de sécurité et réciproquement des points de contact sont-ils transmis à vos clients afin de répondre en cas d'alerte ?"
                },
                {
                    "code": "Ext7",
                    "titre": "Votre organisation a-t-elle mis en place un ensemble de directives, processus, procédure et instructions associés et basés sur un référentiel de bonnes pratiques cybersécurité ou cadre normatif (ISO 27001/27002, NIST, ISO 62443, CMMC….) ?Si c'est le cas, quel cadre utilisez-vous ?"
                },
                {
                    "code": "Ext70",
                    "titre": "Réalisez-vous des audits réguliers de votre chaîne d'approvisionnement, lorsqu'elle est connectée à votre système d'information ou lorsque des équipements/appareils sont régulièrement échangés (audit de conformité ou audit technique) ?Si c'est le cas, précisez la fréquence SVP."
                },
                {
                    "code": "Ext71",
                    "titre": "Répercutez-vous contractuellement auprès de vos fournisseurs et partenaires tiers les exigences de sécurité de vos clients afin qu'ils mettent en œuvre les mesures appropriées pour atteindre les objectifs projet ?"
                },
                {
                    "code": "Ext72",
                    "titre": "Réalisez-vous une sauvegarde régulière des configurations afin de restaurer les environnements en cas d'incident de sécurité ?"
                },
                {
                    "code": "Ext73",
                    "titre": "Disposez-vous d'un référentiel de bonnes pratiques cyber de développement sur chaque langage utilisé par vos développeurs ?"
                },
                {
                    "code": "Ext74",
                    "titre": "Les développeurs sont-ils systématiquement formés aux bonnes pratiques de développement sécurisé sur la base d'un référentiel connu ?"
                },
                {
                    "code": "Ext75",
                    "titre": "Au démarrage de chaque projet, disposez-vous d'un processus d'identification et de validation des versions logicielles et autres librairies à utiliser afin de vous assurer de l'absence de vulnérabilités connues dans ces logiciels et librairies, de manière à garantir la sécurité du produit et l'environnement de développement ?"
                },
                {
                    "code": "Ext76",
                    "titre": "Pendant la phase de développement, assurez-vous la maîtrise des environnements de développement en réalisant une veille active des vulnérabilités qui tient compte des versions logicielles installées (systèmes d'exploitation, librairies, …) ?"
                },
                {
                    "code": "Ext77",
                    "titre": "Au démarrage de chaque projet, disposez-vous d'un processus d'identification et de validation des versions de micrologiciels et des COTS matériels à utiliser afin de vous assurer de l'absence de vulnérabilités connues, de manière à garantir la sécurité du produit et l'environnement de développement ?"
                },
                {
                    "code": "Ext78",
                    "titre": "Disposez-vous de principes de durcissement de manière à réduire la surface d'attaque ?"
                },
                {
                    "code": "Ext79",
                    "titre": "Avant la mise en place de chaque projet, disposez-vous d'un processus de durcissement des environnements de développement, incluant par exemple la désactivation des fonctions, ports, protocoles ou composants non utilisés ?"
                },
                {
                    "code": "Ext8",
                    "titre": "Le plan de continuité d'activité est-il revu et testé régulièrement ?"
                },
                {
                    "code": "Ext80",
                    "titre": "Si vous stockez vos codes de développements dans des espaces de partage collaboratifs publics (GITHUB, services cloud, …), avez-vous une politique de stockage des développements, permettant d'identifier par exemple dans quels cas cette pratique n'est pas autorisée ?"
                },
                {
                    "code": "Ext81",
                    "titre": "Afin de s'assurer de l'implémentation de code sécurisé et de règles de conception, un audit de code est-il systématiquement réalisé, a minima à la fin du développement d'un produit, et les mesures correctives sont-elles mises en œuvre avant la livraison du produit ?"
                },
                {
                    "code": "Ext82",
                    "titre": "Afin de s'assurer de l'implémentation de code sécurisé et de règles de conception, des tests de sécurité sont-ils réalisés à minima avant la livraison et/ou tout au long du cycle de développement du produit ?"
                },
                {
                    "code": "Ext83",
                    "titre": "Disposez-vous d'outils de vérification de sécurité du code (par exemple des outils d'analyse statique, dynamique ou des composants tiers) ?"
                },
                {
                    "code": "Ext84",
                    "titre": "Réalisez-vous un test d'intrusion sur les produits développés avant leur livraison à vos clients ?"
                },
                {
                    "code": "Ext85",
                    "titre": "Avez-vous une politique Security By design impliquant une revue d'applicabilité systématique d'une analyse de risque réalisée sur les produits/services avant leur livraison aux clients dans le but d'identifier les risques et les mesures pour les maitriser et informez-vous vos clients de cette réalisation avant livraison ?"
                },
                {
                    "code": "Ext86",
                    "titre": "Contrôlez-vous que les livraisons (initiale ou mise à jour) sont exempts de malware et de vulnérabilités ?"
                },
                {
                    "code": "Ext87",
                    "titre": "En cas de suspicion d'altération d'un produit, disposez-vous de moyens pour réaliser une investigation afin de l'identifier ?"
                },
                {
                    "code": "Ext88",
                    "titre": "Réalisez-vous des scans antivirus ou anti-malware sur les environnements où sont stockés le code logiciel afin de vous assurer de l'absence de code malveillant ?"
                },
                {
                    "code": "Ext89",
                    "titre": "Durant la phase de livraison, disposez-vous de moyens (tels qu'une fonction de hachage ou de signature) pour garantir l'intégrité ou l'authenticité des logiciels constituant la solution développée ?"
                },
                {
                    "code": "Ext9",
                    "titre": "Identifiez-vous les types de données que vous manipulez de manière à les traiter en conséquence : - données personnelles- données régulées par pays- données soumises au contrôle des exportations- données sensibles- autres types de données (merci de préciser)"
                },
                {
                    "code": "Ext90",
                    "titre": "Avant la livraison, réalisez-vous l'inspection et la désinfection des supports de stockage et des équipements avant leur usage, afin de vous assurer que ceux-ci ne contiennent aucun code malveillant ? Une fois que l'inspection est effectuée, est-ce que vous stockez les médias / équipements dans un lieu de stockage sécurisé?"
                },
                {
                    "code": "Ext91",
                    "titre": "Après la mise en service, les changements au sein du produit sont-ils approuvés selon le plan de sécurité projet défini avant leur mise en œuvre ?"
                },
                {
                    "code": "Ext92",
                    "titre": "Disposez-vous d'éléments de sécurité afin de garantir la sécurité des environnements de développement de vos clients par exemple :- équipements de défense en profondeur (IDS, IPS)- solutions de gestion centralisée des droits d'accès (PAM - Priviledge Access Management)- moyens de supervision (NOC, SOC) ?"
                },
                {
                    "code": "Ext93",
                    "titre": "Est-ce que votre processus de développement inclut des activités de cybersécurité permettant d'obtenir une certification de sécurité des produits/services lorsque c'est nécessaire? Merci de détailler les certifications qui peuvent être obtenues avec ce processus de développement."
                },
                {
                    "code": "Ext94",
                    "titre": "Dans le cas où le produit ou service traite des données personnelles de vos clients est-ce que vous vous assurez de respecter la réglementation RGPD (localisation des données, conservation des données, mécanismes permettant l'accès/la modification/l'effacement des données) ?"
                }
            ]
        }
    ]
});
})();
