// Emplacement : js/data/en/ref_aircyber.js
//
// TRADUCTION ANGLAISE du catalogue « aircyber » — lot L11.
//
// ⚠️ CE FICHIER NE DUPLIQUE PAS LE CATALOGUE. Il ne porte que des CHAÎNES,
// indexées par les identifiants du catalogue français, qui reste la source.
// Une entrée absente ou vide fait retomber la chaîne sur le français : une
// exigence non traduite reste utilisable, une exigence masquée ne l'est pas.
//
// ⚠️ Les exigences sont indexées « <domaineId>/<code> », JAMAIS par le seul
// code : rien n'interdit à deux domaines de porter le même code, et une
// traduction mal alignée mettrait le texte d'une exigence sous une autre — un
// défaut qui se lit parfaitement et qui est entièrement faux. Les 234 clés
// ci-dessous ont été ENGENDRÉES depuis le catalogue français, puis confrontées
// à lui dans les deux sens : 0 orpheline, 0 manquante.
//
// La couverture est MESURÉE : `Referentiels.couverture("en")`, et
// `backend/test/depot/traductions-catalogues.test.mjs` la compte. Ce qui
// manque se voit ; il ne se devine pas.
//
// ════════════════════════════════════════════════════════════════════════════
// ⚠️ CE QUE LA COUVERTURE VA AFFICHER, ET POURQUOI CE N'EST PAS UN OUBLI
// ════════════════════════════════════════════════════════════════════════════
//
// L'instrument compte 502 chaînes pour ce référentiel : 4 au niveau du
// référentiel, 3 par domaine (10) et **2 par exigence** (234) — un titre et une
// aide. Ce fichier en traduit **266**, et les 236 autres n'existent pas :
//
//   · **AUCUNE des 234 exigences du catalogue français ne porte d'aide.** Le
//     questionnaire AirCyber est fait de questions fermées qui se suffisent ;
//     le catalogue n'a jamais rempli ce champ. Écrire ici 234 aides anglaises
//     donnerait à l'écran ANGLAIS une pédagogie que l'écran FRANÇAIS n'a pas —
//     et le catalogue français est la source, pas l'inverse. 234 emplacements
//     restent donc vides parce qu'ils sont vides des deux côtés ;
//   · **`nom` et `version` ne sont pas traduits, et c'est voulu.**
//     « AirCyber (BoostAerospace) » est un nom de programme et un nom
//     d'entreprise ; « 234 questions » s'écrit à l'identique dans les deux
//     langues. Le repli rend exactement la bonne valeur, et c'est le parti pris
//     déjà tenu par `en/ref_iso27002.js` pour `nom` : un chiffre juste vaut
//     mieux qu'un compte flatté par une non-traduction.
//
// ⚠️ **`clLabels` — les domaines CL0 à CL6 — n'a pas non plus d'entrée, pour
// DEUX raisons dont la seconde suffirait.** D'abord, les sept libellés sont
// **déjà en anglais dans le catalogue français** (« Governance », « Malwares »,
// « Identity & access management »… — ils viennent tels quels de
// BoostAerospace) : il n'y a rien à traduire. Ensuite, `traduire()`
// (`js/data/referentiels.js`) ne recopie que `nom`, `version`, `editeur`,
// `description`, `aide` et `domaines` : une clé `clLabels` déclarée ici ne
// serait **jamais lue**. La déclarer donnerait l'illusion d'un travail fait.
//
// ── LES PARTIS PRIS DE TRADUCTION, ET LEURS RAISONS ─────────────────────────
//
// 1. VOCABULAIRE NORMALISÉ, PAS TRADUCTION LITTÉRALE. Le lecteur est un RSSI ou
//    un consultant anglophone de la filière aéronautique : il lit le vocabulaire
//    d'ISO/IEC 27001:2022 en anglais. D'où « security control » et jamais
//    « security measure », « segregation » / « segmentation » selon le sens de
//    « cloisonnement », « backup », « hardening », « least privilege »,
//    « privileged accounts », « interested party », « business continuity plan »,
//    « penetration test », « supply chain risk assessment ». « Habilitation »
//    rend « authorisation » (droits) ou « security clearance » (3.1.2, où le
//    français vise l'habilitation d'État) — deux notions que le même mot
//    français recouvre, et qu'un seul mot anglais aurait confondues.
//
// 2. L'ANGLAIS EST BRITANNIQUE, comme `en/ref_iso27002.js` et `js/i18n/en.js` :
//    « organisation », « authorisation », « prioritisation », « behaviour »,
//    « centre » (Security Operations Centre), « defence ». Aucune entrée de ce
//    fichier ne cite un titre normatif ISO, donc rien n'oblige ici à
//    l'orthographe d'Oxford — la scission assumée par le catalogue ISO n'a pas
//    lieu d'être reproduite.
//
// 3. LA FORME INTERROGATIVE EST CONSERVÉE, question par question. C'est un
//    questionnaire d'auto-évaluation : on y répond Oui / Non / N-A, et une
//    question retournée en énoncé cesserait d'appeler une réponse. Les
//    questions du français qui en enchaînent deux (2.1, 3.5, Ext10, Ext40…) en
//    enchaînent deux en anglais.
//
// 4. TROIS MOTS FRANÇAIS POUR TROIS MOTS ANGLAIS, et l'écart avec la consigne
//    est assumé. « Fournisseur » → *supplier*, « sous-traitant » →
//    *subcontractor*, « prestataire » / « intervenant externe » → *contractor*.
//    Rendre « sous-traitant » par *supplier* aurait été juste isolément, mais
//    5.14 et 5.14.1 écrivent « vos sous-traitants ET fournisseurs » dans la même
//    phrase : les confondre y perdait une distinction que le français fait.
//
// 5. QUELQUES TERMES DE MÉTIER, FIXÉS UNE FOIS POUR TOUTES. « Parc
//    informatique » → *IT estate* (et non *IT park*, qui ne veut rien dire) ;
//    « station blanche » → *media sanitisation station* ; « banc de
//    production » → *production test bench* ; « charte d'utilisation » →
//    *acceptable use policy* ; « rupture protocolaire » → *protocol break* ;
//    « machine de rebond » → *jump server* ; « politique de bureau propre » →
//    *clear desk and clear screen policy* (A.7.7) ; « onduleur » →
//    *uninterruptible power supply (UPS)* ; « vidéosurveillance » → *CCTV* ;
//    « automaticien » → *control engineer* ; « micrologiciel » → *firmware* ;
//    « donneur d'ordre » / « client » → *customer* (jamais *client*, réservé
//    dans ce fichier aux postes clients).
//
// 6. DEUX ERREURS DE LA SOURCE NE SONT PAS RECOPIÉES, et les recopier aurait
//    fait écrire du faux à un lecteur qui, lui, connaît les sigles :
//      · 5.9.1 développe « WAF » en « web access filtering » ; le sigle est
//        *web application firewall*, et c'est ce que l'anglais écrit ;
//      · Ext7 cite « ISO 62443 » ; la norme des systèmes industriels est
//        *IEC 62443*.
//    Ce sont deux corrections de FAIT, pas de traduction. Elles ne touchent pas
//    le catalogue français — hors périmètre — mais elles méritent un constat.
//
// 7. LES SCORIES DE L'EXPORT CSV SONT NETTOYÉES EN ANGLAIS. Le catalogue
//    français porte, tel qu'il a été engendré, des guillemets orphelins au
//    milieu ou en fin de question (4.11, 5.11, 5.14.2) et une majuscule
//    manquante en tête (7.2, « documentation, la nomenclature… »). L'anglais
//    rend la phrase entière, sans ces scories : elles n'ont pas de sens à
//    traduire. Là encore, le français n'est pas modifié.
//
// 8. NIVEAUX DE LABEL : Bronze / Argent / Or → **Bronze / Silver / Gold**. Rien
//    à faire ici, et c'est heureux : le catalogue stocke déjà `"bronze"`,
//    `"silver"`, `"gold"` comme identifiants, et leurs libellés d'écran vivent
//    dans `js/i18n/`. Aucune entrée de ce fichier ne les nomme.
//
// ⚠️ AUCUNE valeur de ce fichier ne porte « inférieur à » ni « supérieur à » :
//    ces chaînes partent dans du HTML, et un contrôle du banc les y refuse.
//    L'engendrement vérifie la propriété avant d'écrire le fichier.

Referentiels.registerTraduction("aircyber", "en", {
    description: "Cyber security maturity questionnaire of the aerospace supply chain (AirCyber / BoostAerospace programme). Self-assessment of practices, with a label level (Bronze / Silver / Gold), a priority and a classification domain (CL0-CL6).",
    aide: "Questionnaire used across the aerospace supply chain. Each question carries, where it is known, its label level (Bronze/Silver/Gold), its priority and its CL0-CL6 domain. Tool inventory questions are not included. The level/priority/CL mapping covers 156 of the 234 questions.",

    domaines: {
        phys: {
            nom: "Physical security of premises", court: "Physical",
            aide: "Access to buildings and server rooms, and protection against power cuts and environmental hazards."
        },
        parc: {
            nom: "Inventory and mapping of the IT estate", court: "Inventory",
            aide: "Knowing your IT estate and your network: the basis of any control."
        },
        ident: {
            nom: "Identities and authorisations", court: "Identities",
            aide: "Named accounts, pre-employment screening and authorisations."
        },
        acces: {
            nom: "Access and vulnerability management", court: "Access",
            aide: "The access lifecycle, rights, and the watch on vulnerabilities and patches."
        },
        serveurs: {
            nom: "Server hardening and monitoring", court: "Servers",
            aide: "Hardening sensitive servers, and protecting and monitoring the information system."
        },
        donnees: {
            nom: "Backups and data protection", court: "Data",
            aide: "Regular, tested backups, and the ownership and protection of data."
        },
        ot: {
            nom: "Industrial systems (OT)", court: "Industrial",
            aide: "Segregation, mapping and protection of the industrial production environments."
        },
        clients: {
            nom: "Customer security requirements", court: "Customers",
            aide: "The information security requirements of your customers, and how far you comply with them."
        },
        gouv: {
            nom: "Cyber governance and risk", court: "Governance",
            aide: "Awareness of the risks, budget, insurance and the steering of cyber security."
        },
        ext: {
            nom: "Extended questions (Ext)", court: "Extended",
            aide: "Additional questions from the questionnaire, to probe maturity further."
        }
    },

    exigences: {
        // ── Physical security of premises ───────────────────────────────────────
        "phys/1.1": { titre: "Is access to your buildings, offices and IT facilities controlled and restricted (for example by locked doors, card readers, and devices to prevent, detect and respond to theft)?" },
        "phys/1.2": { titre: "Is the perimeter of your server rooms and technical areas secured by a fence, an entry barrier, CCTV and an alarm?" },
        "phys/1.3": { titre: "Is the perimeter of your premises secured by security guards with a night watch, an entry barrier, CCTV and an alarm?" },
        "phys/1.4": { titre: "Are visitors escorted at all times while on your premises?" },
        "phys/1.5": { titre: "Do you use uninterruptible power supplies (UPS) or backup batteries to maintain power during an outage?" },
        "phys/1.6": { titre: "Do you have a clear desk and clear screen policy covering papers and sensitive removable storage media?" },
        "phys/1.7": { titre: "If you have several geographical IT sites, do you visit them regularly to check physical and IT security (at least once every 2 years)?" },

        // ── Inventory and mapping of the IT estate ──────────────────────────────
        "parc/2.1": { titre: "Do you keep a complete, up-to-date inventory of your IT estate (servers, desktops, laptops, printers, network equipment, smartphones)? Do you keep an accurate, up-to-date inventory of the assets (workstations, servers) involved in producing for your customers?" },
        "parc/2.1.1": { titre: "Do you have a complete network diagram of your company?" },
        "parc/2.1.2": { titre: "Is your map of networks and permitted protocols available and updated automatically?" },
        "parc/2.1.3": { titre: "Have you deployed a solution (such as NAC or DHCP monitoring) to detect and monitor new equipment connecting to your internal network (PCs, servers, printers, routers)?" },
        "parc/2.10": { titre: "Do you define and apply an automatic backup policy for the critical components, with a tested restore procedure?" },
        "parc/2.11": { titre: "Have you set rules on how users may connect peripherals to their computers (never plugging in a USB stick found by chance, scanning partners' sticks with anti-virus, not connecting arbitrary accessories)?" },
        "parc/2.2": { titre: "Is the list of your IT estate updated regularly (servers, desktops, laptops, printers, network equipment, smartphones)?" },
        "parc/2.3": { titre: "Is there a person or a department assigned to managing the IT system?" },
        "parc/2.4": { titre: "Do you have a point of contact for information system security (a CISO or equivalent)?" },
        "parc/2.4.1": { titre: "Has your organisation put an information security policy and its supporting directives in place? Do you communicate them to all users and project managers?" },
        "parc/2.5": { titre: "Do you use a tool to make sure that all your workstations (servers, laptops, desktops) are secured consistently (identical security policies across machines, management of deviations)?" },
        "parc/2.5.1": { titre: "Do you use a tool to make sure that all your smartphones are secured consistently (identical security policies across devices, management of deviations)?" },
        "parc/2.6": { titre: "Have you deployed a malware detection tool (anti-virus) across the whole office IT estate and on the servers?" },
        "parc/2.7": { titre: "Have you deployed a behaviour-based tool (EDR) to remove or quarantine malware across the whole IT estate?" },
        "parc/2.8": { titre: "Are corporate smartphones managed by your IT team (for example password configuration and the anti-virus policy)?" },
        "parc/2.8.1": { titre: "Do corporate smartphones have a dedicated security policy?" },
        "parc/2.8.2": { titre: "Are corporate smartphones managed centrally, with a tool that controls their configuration and security posture?" },
        "parc/2.9": { titre: "Do you have a central solution to enable, retain (for at least one year) and configure the logs of the most important components, such as the firewalls or the Internet access?" },
        "parc/2.9.1": { titre: "Do you analyse the logs of the most important components (servers, desktops, laptops, printers, network equipment, smartphones) — for example real-time monitoring and investigation, or a SOC?" },
        "parc/2.9.2": { titre: "Do you enable, retain for at least one year and configure the administrator authentication logs on network equipment, servers and computers?" },
        "parc/2.9.3": { titre: "Do you follow a procedure to implement log recording on the most important components, such as the firewalls and the Internet access?" },
        "parc/2.9.4": { titre: "Do you harden the default configuration of your Active Directory (AD) server, and retain the AD authentication logs for at least one year? This covers hardening the operating system (restricting the protocols and services that run, forbidding direct Internet access from the server, disabling default accounts) and the Active Directory settings (read-only AD, validation of the policies and of the security rules applied to AD-managed workstations, restricted and hardened passwords for privileged accounts)." },
        "parc/2.9.5": { titre: "Have you completed the hardening of your Active Directory server — applying all the good practice, or formally accepting the residual risks of the controls not deployed — and enabled detailed alerting on a security incident (detailed log configuration, log monitoring)?" },

        // ── Identities and authorisations ───────────────────────────────────────
        "ident/3.1": { titre: "Does every employee have a named user account on the IT and production environments?" },
        "ident/3.1.1": { titre: "Where necessary, do you screen the nationality and background of employees before hiring (for example criminal record checks or references), according to the role they will hold in the company (senior staff, IT staff, maintenance staff)?" },
        "ident/3.1.2": { titre: "Where security constraints have been identified — a required security clearance, for instance — do you check the background and the suitability of new hires (criminal record, nationality)?" },
        "ident/3.2": { titre: "Can you confirm that the accounts given to users to reach and use the information system (computer, server, cloud) hold no administrator rights? Administrators can change security settings, install software and devices, and reach every file on the computer." },
        "ident/3.3": { titre: "Do you keep a complete inventory of privileged (administrator) accounts, and do you keep it up to date?" },
        "ident/3.3.1": { titre: "If administrator accounts are used on the machines, do you have a solution to control their security (password strength, account lockout, remote password change)?" },
        "ident/3.4": { titre: "Do you train the operational teams (network, security and system administrators, project managers, developers, the CISO) in information system security?" },
        "ident/3.5": { titre: "Do you raise users' awareness of the rules, the expected behaviour and the information security instructions that govern day-to-day work? Is this confirmed by signing an acceptable use policy for the information systems, setting out the cyber security rules they must follow, or a legally binding equivalent (an annex to the internal rules, or the employment contract)?" },
        "ident/3.5.1": { titre: "Do you run systematic cyber security training for all employees and contractors, tailored to their role in the company, and do you track attendance?" },
        "ident/3.6": { titre: "Are users given the security measures needed when travelling with their laptop (privacy screen, security cable, VPN, encryption, monitoring)?" },

        // ── Access and vulnerability management ─────────────────────────────────
        "acces/4.1": { titre: "Is there a joiner and leaver procedure for users and administrators?" },
        "acces/4.10": { titre: "Do you subscribe to a news feed informing you of new cyber security vulnerabilities and alerts, such as those published by government CERTs (ANSSI in France, NIST in the US) or by international security watch sites?" },
        "acces/4.11": { titre: "Have you set up or contracted professional security alerting services tailored to your company, its sector of activity and the IT equipment you have deployed (commercial or sector CERTs, threat intelligence services)?" },
        "acces/4.2": { titre: "Does installing software on a user's computer require administrator rights, obtained through a separate authentication with an admin account or through IT support?" },
        "acces/4.2.1": { titre: "Do you manage user accounts centrally and securely, with the ability to detect abnormal behaviour (credential theft, use on non-standard servers, password guessing attempts)?" },
        "acces/4.3": { titre: "Do you protect the passwords stored on the systems (encryption)?" },
        "acces/4.4": { titre: "Is there a password management policy (renewal frequency, minimum security constraints, special characters, length, a specific policy for administrator profiles)?" },
        "acces/4.4.1": { titre: "Do you change the default passwords and account names across the IT estate?" },
        "acces/4.5": { titre: "Do you regularly update the components of your IT estate (servers, desktops, laptops, printers, network equipment, smartphones)?" },
        "acces/4.6": { titre: "Do you anticipate the end of support for software and systems?" },
        "acces/4.6.1": { titre: "To head off potential vulnerabilities (unknown or out-of-date software), do you check the versions of the software installed across your IT estate?" },
        "acces/4.6.2": { titre: "Do you keep a list of the permitted and forbidden software?" },
        "acces/4.7": { titre: "Do you follow, at least weekly, a procedure for handling the security alerts and advisories issued by CERTs (Computer Emergency Response Teams) and by software vendors?" },
        "acces/4.8": { titre: "Is there a Security Operations Centre (SOC) that detects and monitors the security of the information system?" },
        "acces/4.8.1": { titre: "Do you centralise security incidents and events through SIEM (Security Information and Event Management) collection tools?" },
        "acces/4.8.2": { titre: "Do you monitor user devices such as desktops, laptops, smartphones and USB sticks?" },
        "acces/4.8.3": { titre: "Is there an alerting tool that can automatically shut down or isolate parts of the estate during a major incident?" },
        "acces/4.8.4": { titre: "Is there a Network Operations Centre (NOC) monitoring your network and able to detect security incidents?" },
        "acces/4.8.5": { titre: "Do you block unauthorised connections to your network?" },
        "acces/4.8.6": { titre: "Have you deployed network probes, and do you monitor them, to detect malicious or abnormal activity?" },
        "acces/4.9": { titre: "Are there escalation and alerting processes for security incidents?" },
        "acces/4.9.1": { titre: "Have you deployed solutions on PCs and servers that detect abnormal behaviour and either block it or raise an alert (IDS/IPS)?" },

        // ── Server hardening and monitoring ─────────────────────────────────────
        "serveurs/5.1": { titre: "Do you know which are the most sensitive servers in your estate?" },
        "serveurs/5.10": { titre: "Is Internet traffic monitored, with both alerts and indicators (KPIs) on how company data is used over the Internet?" },
        "serveurs/5.10.1": { titre: "Do you encrypt the connections between your company sites and your partners?" },
        "serveurs/5.10.2": { titre: "If browsing to non-work websites is allowed, have you deployed a secure browsing solution that isolates it from the standard IT network?" },
        "serveurs/5.11": { titre: "Do you have a guest Wi-Fi access isolated from the rest of the company network (a specific connection, a dedicated Wi-Fi)?" },
        "serveurs/5.12": { titre: "Do you have secured Wi-Fi with separation of uses (personal, industrial, business, guest)?" },
        "serveurs/5.13": { titre: "Is there an email filtering system (anti-spam, removal of suspicious attachments)?" },
        "serveurs/5.13.1": { titre: "Do you give users an easy way to encrypt the content of their emails?" },
        "serveurs/5.14": { titre: "Do you secure the network interconnections with your subcontractors and suppliers?" },
        "serveurs/5.14.1": { titre: "Do you provide a secure exchange platform for your subcontractors and suppliers?" },
        "serveurs/5.14.2": { titre: "If your website is hosted inside the company, do you separate it and the Internet-facing services from the rest of the corporate network, through a segregated network zone such as a DMZ?" },
        "serveurs/5.15": { titre: "Do you allow only devices that are identified and managed by the information system to connect to the network?" },
        "serveurs/5.17": { titre: "For remote access to your information system (mobile or on-call users, remote sites, preventive or corrective maintenance), have you systematically put in place a security solution that guarantees identification and strong authentication of the user (VPN combined with MFA, personal, unique and non-transferable credentials, certificates)?" },
        "serveurs/5.2": { titre: "Do you use security equipment to protect and segment your internal network (firewall, proxy)?" },
        "serveurs/5.2.1": { titre: "Do you run a firewall on the client machines (laptops, desktops)?" },
        "serveurs/5.2.2": { titre: "Do you review the firewall configuration at least once a year?" },
        "serveurs/5.3": { titre: "Does your network architecture favour secure communications, allowing unsecured ones only by exception and isolating them from the rest of the network? For example, encouraging encrypted communications and forbidding insecure protocols: configuring the network, workstation and server firewalls to block Telnet on port 23 across the local network, Windows shares over Samba v1, and NTLMv1 authentication." },
        "serveurs/5.4": { titre: "Do you use strong authentication to reach your corporate email from the Internet (two-factor authentication with a phone, account lockout against password guessing, regular password changes, complex passwords)?" },
        "serveurs/5.5": { titre: "Do you use strong authentication, and monitor logins with alerts on failure, when connecting to sensitive equipment such as the administration of IT equipment, of cloud services and of websites?" },
        "serveurs/5.5.1": { titre: "Do you use single sign-on (SSO) for HTTP applications, or enterprise SSO with an automated password manager?" },
        "serveurs/5.6": { titre: "Do you administer the information system over a dedicated network, segregated from the Internet and from user workstations, and secured by protocol-break mechanisms (jump servers, an administration bastion, proxying)?" },
        "serveurs/5.6.1": { titre: "Do the workstations carry a protection that stops users opening an unsecured Internet connection — by plugging in a modem, a 3G USB dongle or a smartphone — while the same computer is connected to the corporate network?" },
        "serveurs/5.7": { titre: "Do you protect yourself against the threats that come with removable media?" },
        "serveurs/5.7.1": { titre: "Do you encrypt sensitive data on removable media with no action required from users (transparent automatic encryption)?" },
        "serveurs/5.8": { titre: "Has every device connected to the company information system (computer, tablet, smartphone) been through a formal prior approval procedure?" },
        "serveurs/5.8.1": { titre: "Do you have full control over the work environment holding corporate applications and data on mobile devices (a sealed separation between the personal and work environments)?" },
        "serveurs/5.9": { titre: "Is Internet access filtered through a proxy server?" },
        "serveurs/5.9.1": { titre: "Do you protect the web servers reachable from outside the company network with filtering equipment such as a web application firewall (WAF)?" },

        // ── Backups and data protection ─────────────────────────────────────────
        "donnees/6.1": { titre: "Is important data backed up regularly?" },
        "donnees/6.10": { titre: "Have you established that your company data must be assigned to identified owners, with their responsibilities set out (HR data, engineering design data)?" },
        "donnees/6.2": { titre: "Are your backups protected in a secured room?" },
        "donnees/6.3": { titre: "Do you use a centrally managed data storage and backup system, such as a cloud service (AWS, Office 365 SharePoint, OneDrive, Google Drive)?" },
        "donnees/6.4": { titre: "Do you encrypt the hard disks of computers and smartphones with no interaction from users (transparent automatic encryption)?" },
        "donnees/6.5": { titre: "Do you deploy solutions to manage the protection of company data (detection of confidential data leakage, roles and responsibilities)?" },
        "donnees/6.6": { titre: "Do you carry out regular security audits (application, network, process), and then apply the corrective actions that follow?" },
        "donnees/6.6.1": { titre: "Do you check the compliance of your company's subsidiaries?" },
        "donnees/6.6.2": { titre: "Do you regularly review your firewall rules?" },
        "donnees/6.7": { titre: "Do you run regular penetration tests on your information system and on those of your subsidiaries, and then apply the corrective actions that follow?" },
        "donnees/6.7.1": { titre: "Do you run penetration tests on your company's websites, and then apply the corrective actions that follow?" },
        "donnees/6.7.2": { titre: "Do you regularly check and update your cyber attack detection capabilities — for example by updating the security monitoring rules after penetration tests on your systems, or through security project management?" },
        "donnees/6.8": { titre: "Do you have the means and tools needed to encrypt sensitive data sent outside the company?" },
        "donnees/6.9": { titre: "Do you define a data classification policy based on how the data is used (public, company confidential, confidential) and on the protection rules to apply to it?" },
        "donnees/6.9.1": { titre: "Have you deployed a solution that classifies your company data automatically, or that helps decide how to protect data classified as sensitive?" },
        "donnees/6.9.2": { titre: "Do you have a solution that blocks the sending of unprotected confidential data, or encrypts it systematically before it is saved or sent outside your information system?" },

        // ── Industrial systems (OT) ─────────────────────────────────────────────
        "ot/7.0": { titre: "Do you segregate the industrial production environment from the other environments (qualification, pre-production, corporate information systems)?" },
        "ot/7.1.1": { titre: "Have you mapped your industrial information system, identifying its most sensitive components?" },
        "ot/7.1.2": { titre: "Do you back up the most sensitive parts of your industrial information systems (configuration, source code and data)?" },
        "ot/7.1.3": { titre: "Are the backups of your information systems tested regularly?" },
        "ot/7.10": { titre: "Is there an architecture, and are there management rules, defined specifically for these systems?" },
        "ot/7.11": { titre: "Are the change processes and the dedicated IACS solutions subject to an annual technical security compliance audit?" },
        "ot/7.12": { titre: "Are the ICS components covered by a threat and vulnerability monitoring process?" },
        "ot/7.13": { titre: "Is there a security monitoring centre for your network (SOC, NOC, backup status) able to detect security incidents and backup failures, and to actively monitor the industrial systems (IACS)?" },
        "ot/7.14": { titre: "When an incident occurs in production, do you investigate whether it could have a malicious cause?" },
        "ot/7.2": { titre: "Are the documentation, the parts list and the diagrams of the ICS equipment kept up to date?" },
        "ot/7.3": { titre: "Is there a documented crisis management process (for example recovery of operations after a system crash)?" },
        "ot/7.4": { titre: "Is the documentation on ICS design, components and operation stored with an appropriate level of security?" },
        "ot/7.5": { titre: "Is there a qualified person or a dedicated department for the design, operation and monitoring of the ICS equipment?" },
        "ot/7.6": { titre: "Is there an ICS security awareness or training programme for employees and subcontractors?" },
        "ot/7.7": { titre: "Have the users, control engineers and administrators of the industrial automation and control systems (IACS) signed an acceptable use policy covering cyber security good practice?" },
        "ot/7.8": { titre: "Are procedures in place to manage the ICS lifecycle?" },
        "ot/7.9": { titre: "Do you use a dedicated, segregated network to administer the ICS?" },

        // ── Customer security requirements ──────────────────────────────────────
        "clients/8.1": { titre: "Do your customers place specific requirements on you for managing information system security (for example in invitations to tender, or as contract clauses)?" },
        "clients/8.2": { titre: "If so, how far do you comply with those requirements?" },
        "clients/8.3": { titre: "If so, do those requirements differ from one customer to another?" },
        "clients/8.4": { titre: "Have you, in turn, placed specific cyber security requirements on your own suppliers?" },

        // ── Cyber governance and risk ───────────────────────────────────────────
        "gouv/9.1": { titre: "Do you have a good grasp of the full range of cyber security risks (outsourced IT, data loss, company reputation, cyber espionage, legal risk)?" },
        "gouv/9.10": { titre: "Do your insurance policies cover you for business interruption caused by an IT security problem?" },
        "gouv/9.2": { titre: "Is there a specific budget for IT management in the company (hardware, monitoring, maintenance, security)?" },
        "gouv/9.3": { titre: "If so, how large is that budget each year (%)?" },
        "gouv/9.4": { titre: "What share of that IT budget is currently allocated to cyber security (%)?" },
        "gouv/9.5": { titre: "After how long an outage of your information systems would your business suffer a measurable impact?" },
        "gouv/9.6": { titre: "Do you consider yourself sufficiently protected today against the risks that come with IT and the Internet?" },
        "gouv/9.7": { titre: "To your knowledge, have you ever been the victim of a cyber attack?" },
        "gouv/9.7.1": { titre: "Have you put in place, documented and tested at least annually a security incident handling procedure that assures you of reacting quickly and involving the right people, internal or external?" },
        "gouv/9.8": { titre: "Have you ever carried out a cyber risk assessment of your company?" },
        "gouv/9.8.1": { titre: "Do you review your company's cyber risk level each year by revisiting its risk assessments?" },
        "gouv/9.8.2": { titre: "Do you have a software solution for risk management that reports the cyber risk level, more or less automatically, and supports its treatment?" },
        "gouv/9.9": { titre: "Do you hold an insurance policy covering IT risk (equipment and cyber attack)?" },

        // ── Extended questions (Ext) ────────────────────────────────────────────
        "ext/Ext1": { titre: "Do you export cyber security logs outside the environment that generates them, so as to guarantee their integrity?" },
        "ext/Ext10": { titre: "Mapping: are the physical devices, the software platforms and the systems within the organisation inventoried and categorised? Do you have a map of all the product's interfaces with other systems, and does it include every protocol used and the flow matrix?" },
        "ext/Ext11": { titre: "When you have requested remote access to a customer's information system for your employees, do you systematically tell that customer when the access must be revoked (after an employee leaves, for instance)?" },
        "ext/Ext12": { titre: "Do you apply a security hardening policy to the configuration of your workstations and servers?" },
        "ext/Ext13": { titre: "Does the anti-virus automatically scan the servers, the workstations and the USB sticks connected to the production test benches?" },
        "ext/Ext14": { titre: "Do you disable automatic execution (autorun) for newly connected devices on PCs, laptops and servers?" },
        "ext/Ext15": { titre: "Do you have a policy for updating the anti-virus signature databases and engines at least daily across the standard estate, with exceptions managed for specific equipment?" },
        "ext/Ext16": { titre: "Do you have a central management console for the update mechanisms of the protection against malicious code execution across the estate?" },
        "ext/Ext17": { titre: "Do you test the effectiveness of the anti-malware protection?" },
        "ext/Ext18": { titre: "Do you apply security controls matched to the classification level of the data handled on each medium (laptop, USB, email)?" },
        "ext/Ext19": { titre: "Is there a procedure to create, change and remove the access of the users and administrators involved in the production environments?" },
        "ext/Ext2": { titre: "Do you enable log generation and recording on your IT equipment?" },
        "ext/Ext20": { titre: "Do you systematically set an expiry date when creating accounts for interns or external contractors in the production environments?" },
        "ext/Ext21": { titre: "Do you create named accounts for each employee of a contractor company?" },
        "ext/Ext22": { titre: "Do you update your systems in line with the vendors' recommendations (updates, configuration)?" },
        "ext/Ext23": { titre: "Have you put in place a vulnerability management process for your services (identification, classification, prioritisation, remediation and mitigation)?" },
        "ext/Ext24": { titre: "Do you follow decommissioning processes (certificate of destruction, complete erasure of files) before assets are disposed of (workstations, servers)?" },
        "ext/Ext25": { titre: "Are the media awaiting destruction stored in an environment with restricted and controlled access?" },
        "ext/Ext26": { titre: "Are the backup systems checked regularly to confirm that they work correctly?" },
        "ext/Ext27": { titre: "Do you run crisis management training and simulation exercises?" },
        "ext/Ext28": { titre: "Do you hold an insurance policy against the consequences of an incident: physical damage, IT damage, cyber damage, business interruption?" },
        "ext/Ext29": { titre: "Is your organisation certified in cyber security? Please provide the certificate and the details of the certification scope." },
        "ext/Ext3": { titre: "Do you use a secure exchange platform with your customers for sensitive information?" },
        "ext/Ext30": { titre: "Do you have a typical functional diagram showing the cycle of exchanges (physical and digital) and the production flows between you and your customers for making a product, including internal exchanges and customer deliveries on removable media?" },
        "ext/Ext31": { titre: "In the industrial environment, do you take account of the sensitivity of the information exchanged with your customers?" },
        "ext/Ext32": { titre: "Is a project security management plan drawn up, implemented, delivered and communicated to your customers, so that every interested party understands the project's expectations and their own roles and responsibilities? Does that plan name the point of contact accountable for cyber security activities during the project?" },
        "ext/Ext33": { titre: "Do you have an incident handling process — covering personal data breaches — that provides for notifying customers when an incident affects the product or the services supplied to them?" },
        "ext/Ext34": { titre: "Do you identify where the data and assets processed or operated under the contract are located, including your customers' personal data where relevant, especially when it is held in shared cloud spaces (backup and disaster recovery locations included)? If so, please explain how you proceed, and list the countries where the data is located." },
        "ext/Ext35": { titre: "Do you handle the information and data supplied by your customers, or produced under the contract, in line with the latest version of their information protection directive?" },
        "ext/Ext36": { titre: "Do you use cloud environments to produce or process your customers' data? If so, do you separate the data by customer, at least logically, across every environment (production, backup)?" },
        "ext/Ext37": { titre: "Have you identified the maximum tolerable outage of your production line against your customer contracts?" },
        "ext/Ext38": { titre: "Is access to the various development environments granted on the least privilege principle — not giving every user access to every environment, but using user groups tied to specific equipment?" },
        "ext/Ext39": { titre: "Do you have a policy for default log generation in the products delivered to customers, recording the product's main actions?" },
        "ext/Ext4": { titre: "Do you use only the Internet access points defined within the company?" },
        "ext/Ext40": { titre: "Can you list the physical production sites involved in the services supplied to your customers? Do you have an up-to-date diagram of the network interconnections between you and them (IP mapping, servers and addressing)?" },
        "ext/Ext41": { titre: "Are the suppliers and third-party partners of information systems, components and services identified, prioritised and assessed through a supply chain risk assessment process?" },
        "ext/Ext42": { titre: "Is a cyber security point of contact identified for the production facilities?" },
        "ext/Ext43": { titre: "Have you formalised the security rules to apply in the production environments, and trained the staff concerned?" },
        "ext/Ext44": { titre: "Are the workstations in the production environment updated regularly?" },
        "ext/Ext45": { titre: "Do you update the spare workstations held in stock before putting them back into service?" },
        "ext/Ext46": { titre: "Do you have technical means or processes to trace who performed an action in the production environments (authentication logs, correlation between the shift roster and the accounts used)?" },
        "ext/Ext47": { titre: "Are the system and anti-virus logs enabled in the production environments?" },
        "ext/Ext48": { titre: "Have you defined controls governing the use of privileged accounts (creation, change, removal, and specific rules for generic accounts)? If so, please give details." },
        "ext/Ext49": { titre: "Where shared accounts are used in the production environments, do you have security controls beyond the password to log in (physical access control to the room holding the production workstations, or software such as a transparent screen lock)?" },
        "ext/Ext5": { titre: "Do you have a business continuity plan describing the processes and technologies in place to restore critical servers, network equipment, laptops and desktops after an incident?" },
        "ext/Ext50": { titre: "Do you carry out at least two update campaigns a year on the production equipment?" },
        "ext/Ext51": { titre: "Do you change the default passwords and account names in your customers' production environments?" },
        "ext/Ext52": { titre: "Do you have a means of detecting foreign or unauthorised connections to the servers used by your industrial systems, so as to qualify them and block them where needed?" },
        "ext/Ext53": { titre: "Is the production Wi-Fi network dedicated and isolated from the other Wi-Fi networks?" },
        "ext/Ext54": { titre: "Do you disable Wi-Fi and wireless connections by default on your equipment (industrial production test benches)?" },
        "ext/Ext55": { titre: "Do you provide media sanitisation stations, open to all users, to confirm that the removable media used for your customers' production carry nothing harmful?" },
        "ext/Ext56": { titre: "Do you apply specific restrictions or controls governing the use of removable devices in the production environments?" },
        "ext/Ext57": { titre: "Is one of the anti-virus engines used on the media sanitisation stations different from the one used on the workstations?" },
        "ext/Ext58": { titre: "Do you have security controls that govern and secure BYOD use in your customers' production environments (network connection, anti-malware protection)?" },
        "ext/Ext59": { titre: "Do you have a crisis and incident handling process for incidents in your customers' production, shared with those customers (alerting the customer's security manager)?" },
        "ext/Ext6": { titre: "Are your crisis management, business continuity and disaster recovery plans designed to include your contractors and suppliers?" },
        "ext/Ext60": { titre: "Do your external contractors and suppliers sign the acceptable use and cyber security good practice policy for the industrial automation and control systems (IACS)? Do you archive those signed documents?" },
        "ext/Ext61": { titre: "Have you ever carried out a cyber risk assessment of your production information systems?" },
        "ext/Ext62": { titre: "Do you update the risks affecting your production information systems at least annually?" },
        "ext/Ext63": { titre: "Are the findings of the risk assessment taken into account in the company's business continuity plan?" },
        "ext/Ext64": { titre: "Where the backups are held in a storage room, is physical access to it regulated?" },
        "ext/Ext65": { titre: "Do you have an IT disaster recovery plan for the production environments, including the production machines and test benches?" },
        "ext/Ext66": { titre: "Is access to the archives restricted or physically protected (keys, badges)?" },
        "ext/Ext67": { titre: "Does your backup policy cover the data and the products supplied to your customers?" },
        "ext/Ext68": { titre: "Can you identify the server rooms used under the contract for each of your customers?" },
        "ext/Ext69": { titre: "Do you hold the details of the customer contacts to alert on a security incident, and have you given your customers your own contacts so that they can be reached when they raise an alert?" },
        "ext/Ext7": { titre: "Has your organisation put in place a body of directives, processes, procedures and instructions based on a cyber security good practice baseline or standard (ISO 27001/27002, NIST, IEC 62443, CMMC)? If so, which framework do you use?" },
        "ext/Ext70": { titre: "Do you audit your supply chain regularly where it is connected to your information system, or where equipment and devices are routinely exchanged (compliance audit or technical audit)? If so, please state the frequency." },
        "ext/Ext71": { titre: "Do you pass your customers' security requirements down contractually to your suppliers and third-party partners, so that they implement the appropriate controls to meet the project objectives?" },
        "ext/Ext72": { titre: "Do you back up the configurations regularly, so that the environments can be restored after a security incident?" },
        "ext/Ext73": { titre: "Do you have a secure coding good practice baseline for each language your developers use?" },
        "ext/Ext74": { titre: "Are developers systematically trained in secure development good practice, based on a recognised baseline?" },
        "ext/Ext75": { titre: "At the start of each project, do you have a process to identify and approve the software versions and libraries to be used, confirming that they carry no known vulnerabilities, so as to secure both the product and the development environment?" },
        "ext/Ext76": { titre: "During development, do you keep control of the development environments by actively watching for vulnerabilities in the software versions installed (operating systems, libraries)?" },
        "ext/Ext77": { titre: "At the start of each project, do you have a process to identify and approve the firmware versions and the hardware COTS components to be used, confirming that they carry no known vulnerabilities, so as to secure both the product and the development environment?" },
        "ext/Ext78": { titre: "Do you have hardening principles that reduce the attack surface?" },
        "ext/Ext79": { titre: "Before each project starts, do you have a process for hardening the development environments, for example disabling the functions, ports, protocols and components that are not used?" },
        "ext/Ext8": { titre: "Is the business continuity plan reviewed and tested regularly?" },
        "ext/Ext80": { titre: "If you store your development code in public collaborative spaces (GitHub, cloud services), do you have a code storage policy that identifies, for instance, the cases in which the practice is not allowed?" },
        "ext/Ext81": { titre: "To confirm that secure code and design rules have been implemented, is a code audit systematically carried out, at least at the end of a product's development, and are the corrective actions applied before the product is delivered?" },
        "ext/Ext82": { titre: "To confirm that secure code and design rules have been implemented, are security tests carried out at least before delivery, or throughout the product development cycle?" },
        "ext/Ext83": { titre: "Do you have tools that check the security of the code (static analysis, dynamic analysis, or analysis of third-party components)?" },
        "ext/Ext84": { titre: "Do you run a penetration test on the products you develop before delivering them to your customers?" },
        "ext/Ext85": { titre: "Do you have a security by design policy that systematically reviews whether a risk assessment applies to the products and services before they are delivered to customers, so as to identify the risks and the controls that treat them, and do you tell your customers this has been done before delivery?" },
        "ext/Ext86": { titre: "Do you check that the deliveries, whether initial or updates, are free of malware and vulnerabilities?" },
        "ext/Ext87": { titre: "If a product is suspected of having been tampered with, do you have the means to investigate and establish it?" },
        "ext/Ext88": { titre: "Do you run anti-virus or anti-malware scans on the environments where the software code is stored, to confirm that no malicious code is present?" },
        "ext/Ext89": { titre: "During delivery, do you have the means (such as a hash function or a signature) to guarantee the integrity and the authenticity of the software that makes up the solution developed?" },
        "ext/Ext9": { titre: "Do you identify the types of data you handle so as to treat them accordingly: personal data, data regulated by country, export-controlled data, sensitive data, other types of data (please specify)?" },
        "ext/Ext90": { titre: "Before delivery, do you inspect and disinfect the storage media and the equipment before use, to confirm that they hold no malicious code? Once the inspection is done, do you keep the media and equipment in a secured store?" },
        "ext/Ext91": { titre: "Once in service, are changes within the product approved in line with the defined project security plan before they are implemented?" },
        "ext/Ext92": { titre: "Do you have security capabilities to protect your customers' development environments, for example defence-in-depth equipment (IDS, IPS), central access rights management (PAM, privileged access management) and monitoring facilities (NOC, SOC)?" },
        "ext/Ext93": { titre: "Does your development process include the cyber security activities needed to obtain a security certification for the products and services where that is required? Please detail the certifications this development process can achieve." },
        "ext/Ext94": { titre: "Where the product or service processes your customers' personal data, do you make sure you comply with the GDPR (data location, data retention, and mechanisms for access, rectification and erasure)?" }
    }
});
