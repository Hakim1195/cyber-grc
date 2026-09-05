// Emplacement : js/data/en/ref_iso27002.js
//
// TRADUCTION ANGLAISE du catalogue « iso-27002-2022 » — lot L11.
//
// ⚠️ CE FICHIER NE DUPLIQUE PAS LE CATALOGUE. Il ne porte que des CHAÎNES,
// indexées par les identifiants du catalogue français, qui reste la source.
// Une entrée absente ou vide fait retomber la chaîne sur le français : une
// exigence non traduite reste utilisable, une exigence masquée ne l'est pas.
//
// ⚠️ Les exigences sont indexées « <domaineId>/<code> », JAMAIS par le seul
// code : rien n'interdit à deux domaines de porter le même code, et une
// traduction mal alignée mettrait le texte d'une exigence sous une autre — un
// défaut qui se lit parfaitement et qui est entièrement faux.
//
// La couverture est MESURÉE : `Referentiels.couverture("en")`, et
// `backend/test/depot/traductions-catalogues.test.mjs` la compte. Ce qui
// manque se voit ; il ne se devine pas.
//
// ── TROIS PARTIS PRIS, ET LEURS RAISONS ─────────────────────────────────────
//
// 1. TERMINOLOGIE NORMATIVE, PAS TRADUCTION DU FRANÇAIS. ISO/IEC 27002:2022 a
//    des intitulés anglais officiels, et c'est ce vocabulaire qu'un auditeur
//    lit : « control » et jamais « measure », « Statement of Applicability »,
//    « asset owner », « privileged access rights », « segregation of networks »,
//    « logging », « business continuity ». Les intitulés ont été vérifiés
//    contre plusieurs sources concordantes plutôt que devinés — d'où
//    « Physical entry » (et non le « Physical entry controls » de 2013),
//    « Networks security » (pluriel, tel quel), « Supporting utilities ».
//
// 2. VOCABULAIRE NORMATIF, MAIS PAS PHRASES NORMATIVES. Le catalogue français
//    ne reproduit pas le texte de la norme — reformulations courtes +
//    identifiant de clause — et sa traduction ne le fait pas davantage. Les
//    intitulés officiels longs sont donc RACCOURCIS en conservant leur tête
//    normative : 5.9 « Inventory of information and other associated assets »
//    devient « Inventory of information and assets ». C'est aussi ce qui garde
//    la mise en page : ces titres s'affichent dans des tableaux denses et dans
//    la déclaration d'applicabilité imprimable, et le plus long titre français
//    du catalogue fait 47 signes — les titres anglais s'y tiennent.
//
// 3. L'ORTHOGRAPHE EST SCINDÉE, DÉLIBÉRÉMENT. L'interface (`js/i18n/en.js`)
//    est en anglais britannique (« organisation », « materialised »). L'ISO,
//    elle, publie en orthographe d'Oxford (« organization »,
//    « synchronization »). Les TITRES et les noms de thèmes suivent l'ISO —
//    c'est tout l'objet de ce catalogue ; les AIDES pédagogiques, qui sont de
//    la prose produit, suivent l'interface. Là où les deux se seraient
//    heurtées dans une même entrée, l'aide est tournée autrement.
//
// ⚠️ `nom` N'EST PAS TRADUIT, ET C'EST VOULU : « ISO/IEC 27001:2022 » est une
// désignation de norme, pas une chaîne de langue. Le repli rend exactement la
// bonne valeur. La couverture affichera donc 200/201, et non 201/201 — un
// chiffre juste vaut mieux qu'un compte flatté par une non-traduction.

Referentiels.registerTraduction("iso-27002-2022", "en", {
    description: "Annex A controls of ISO/IEC 27001:2022, the certifiable standard for an information security management system (ISMS). Arranged in 4 themes (organizational, people, physical, technological).",
    aide: "ISO/IEC 27001 is the certifiable ISMS standard. Its Annex A lists 93 controls, from which the Statement of Applicability (SoA) selects those that apply to treat the identified risks. Titles are reworded — refer to the official standard for the exact text.",

    domaines: {
        org: {
            nom: "Organizational controls", court: "Organizational",
            aide: "Policies, roles, supplier relationships, incident management and compliance: how security is steered."
        },
        peo: {
            nom: "People controls", court: "People",
            aide: "The human factor: screening, awareness, remote working and reporting."
        },
        phy: {
            nom: "Physical controls", court: "Physical",
            aide: "Protecting premises, equipment and physical media."
        },
        tec: {
            nom: "Technological controls", court: "Technological",
            aide: "Technical protection: access, malware, vulnerabilities, logging, networks, cryptography, secure development."
        }
    },

    exigences: {
        // ── Organizational controls (5.1 – 5.37) ────────────────────────────
        "org/5.1": { titre: "Policies for information security", aide: "A body of policies approved by management, published and reviewed at planned intervals, that sets the frame." },
        "org/5.2": { titre: "Information security roles and responsibilities", aide: "Who is accountable for what in security: roles defined and allocated." },
        "org/5.3": { titre: "Segregation of duties", aide: "Split conflicting duties between several people to limit fraud and error." },
        "org/5.4": { titre: "Management responsibilities", aide: "Management requires and supports everyone in applying the security rules." },
        "org/5.5": { titre: "Contact with authorities", aide: "Know who to contact (national cyber authority, data protection authority, police) and keep those contacts current." },
        "org/5.6": { titre: "Contact with special interest groups", aide: "Take part in specialist forums and CERTs to keep up with threats and good practice." },
        "org/5.7": { titre: "Threat intelligence", aide: "Collect and use information on threats in order to anticipate them." },
        "org/5.8": { titre: "Information security in project management", aide: "Build security into every project from the design stage, whatever its nature." },
        "org/5.9": { titre: "Inventory of information and assets", aide: "List information and associated assets, each with a named asset owner." },
        "org/5.10": { titre: "Acceptable use of information and assets", aide: "Rules for using resources and information, made known to users." },
        "org/5.11": { titre: "Return of assets", aide: "Recover equipment and access rights when someone leaves or a contract ends." },
        "org/5.12": { titre: "Classification of information", aide: "Classify information by sensitivity so it is protected in proportion." },
        "org/5.13": { titre: "Labelling of information", aide: "Label documents according to their classification (confidential, internal…)." },
        "org/5.14": { titre: "Information transfer", aide: "Govern information exchange (rules, encryption, agreements), inside and outside." },
        "org/5.15": { titre: "Access control", aide: "An access policy built on need-to-know and least privilege." },
        "org/5.16": { titre: "Identity management", aide: "A controlled identity life cycle (creation, change, removal)." },
        "org/5.17": { titre: "Authentication information", aide: "Manage and protect passwords, secrets and authentication factors." },
        "org/5.18": { titre: "Access rights", aide: "Grant, review and withdraw access rights against real business need." },
        "org/5.19": { titre: "Information security in supplier relationships", aide: "Address security from supplier selection and throughout the relationship." },
        "org/5.20": { titre: "Information security in supplier agreements", aide: "Set the security requirements down in the contract." },
        "org/5.21": { titre: "Information security in the ICT supply chain", aide: "Control the risks carried by the ICT supply chain." },
        "org/5.22": { titre: "Monitoring and review of supplier services", aide: "Monitor, review and manage change in outsourced services." },
        "org/5.23": { titre: "Information security for use of cloud services", aide: "Govern the acquisition and use of cloud services (shared responsibility)." },
        "org/5.24": { titre: "Incident management planning and preparation", aide: "Plan and prepare the response to incidents (roles, procedures)." },
        "org/5.25": { titre: "Assessment and decision on security events", aide: "Triage events to decide which of them are incidents." },
        "org/5.26": { titre: "Response to information security incidents", aide: "Respond to incidents following documented procedures." },
        "org/5.27": { titre: "Learning from information security incidents", aide: "Turn incidents into stronger defences (lessons learned)." },
        "org/5.28": { titre: "Collection of evidence", aide: "Collect and preserve evidence so that it stays usable (forensics)." },
        "org/5.29": { titre: "Information security during disruption", aide: "Keep security at an adequate level during a crisis or a disaster." },
        "org/5.30": { titre: "ICT readiness for business continuity", aide: "Make IT capable of supporting business continuity." },
        "org/5.31": { titre: "Legal, regulatory and contractual requirements", aide: "Identify and meet legal, statutory, regulatory and contractual obligations." },
        "org/5.32": { titre: "Intellectual property rights", aide: "Respect intellectual property rights (software licences and the like)." },
        "org/5.33": { titre: "Protection of records", aide: "Protect records against loss, alteration and unauthorised access." },
        "org/5.34": { titre: "Privacy and protection of PII", aide: "Protect privacy and personally identifiable information (GDPR)." },
        "org/5.35": { titre: "Independent review of information security", aide: "Have security reviewed by an independent party at planned intervals." },
        "org/5.36": { titre: "Compliance with policies, rules and standards", aide: "Check regularly that security policies and standards are being followed." },
        "org/5.37": { titre: "Documented operating procedures", aide: "Document operating procedures and make them available." },

        // ── People controls (6.1 – 6.8) ─────────────────────────────────────
        "peo/6.1": { titre: "Screening (pre-employment)", aide: "Check candidates' background, in proportion to the post." },
        "peo/6.2": { titre: "Terms and conditions of employment", aide: "Write security responsibilities into employment contracts." },
        "peo/6.3": { titre: "Awareness, education and training", aide: "Train all staff and raise their awareness, regularly." },
        "peo/6.4": { titre: "Disciplinary process", aide: "Provide for sanctions where security rules are breached." },
        "peo/6.5": { titre: "Responsibilities after employment ends", aide: "Restate the duties that outlive the contract (confidentiality)." },
        "peo/6.6": { titre: "Confidentiality or non-disclosure agreements", aide: "Have suitable confidentiality undertakings (NDAs) signed." },
        "peo/6.7": { titre: "Remote working", aide: "Secure work away from the office (device, connection, surroundings)." },
        "peo/6.8": { titre: "Information security event reporting", aide: "Let anyone report a suspicious event quickly." },

        // ── Physical controls (7.1 – 7.14) ──────────────────────────────────
        "phy/7.1": { titre: "Physical security perimeters", aide: "Draw protected areas around sensitive assets." },
        "phy/7.2": { titre: "Physical entry", aide: "Let only authorised people into secure areas." },
        "phy/7.3": { titre: "Securing offices, rooms and facilities", aide: "Protect offices, rooms and facilities to match their sensitivity." },
        "phy/7.4": { titre: "Physical security monitoring", aide: "Detect unauthorised physical access (CCTV, alarms)." },
        "phy/7.5": { titre: "Protection against environmental threats", aide: "Guard against fire, water damage and natural disasters." },
        "phy/7.6": { titre: "Working in secure areas", aide: "Specific rules of conduct inside sensitive areas." },
        "phy/7.7": { titre: "Clear desk and clear screen", aide: "Leave no sensitive information in view and no session unlocked." },
        "phy/7.8": { titre: "Equipment siting and protection", aide: "Site and protect equipment against hazards and prying eyes." },
        "phy/7.9": { titre: "Security of assets off-premises", aide: "Protect equipment used away from the site (mobile working)." },
        "phy/7.10": { titre: "Storage media", aide: "Manage the media life cycle (use, transport, disposal)." },
        "phy/7.11": { titre: "Supporting utilities", aide: "Make the power, cooling and network that carry IT dependable." },
        "phy/7.12": { titre: "Cabling security", aide: "Protect network and power cabling against interception and damage." },
        "phy/7.13": { titre: "Equipment maintenance", aide: "Maintain equipment to preserve its availability and integrity." },
        "phy/7.14": { titre: "Secure disposal or re-use of equipment", aide: "Erase the data before equipment is discarded or re-used." },

        // ── Technological controls (8.1 – 8.34) ─────────────────────────────
        "tec/8.1": { titre: "User endpoint devices", aide: "Secure desktops, laptops and mobiles (hardening, protection)." },
        "tec/8.2": { titre: "Privileged access rights", aide: "Restrict privileged accounts and watch them closely." },
        "tec/8.3": { titre: "Information access restriction", aide: "Limit access to information in line with the access control policy." },
        "tec/8.4": { titre: "Access to source code", aide: "Control read and write access to source code and its tooling." },
        "tec/8.5": { titre: "Secure authentication", aide: "Put strong authentication mechanisms in place (MFA)." },
        "tec/8.6": { titre: "Capacity management", aide: "Size and watch resources so that they do not run out." },
        "tec/8.7": { titre: "Protection against malware", aide: "Anti-malware, filtering and awareness against malicious code." },
        "tec/8.8": { titre: "Management of technical vulnerabilities", aide: "Find, assess and fix vulnerabilities (watch plus patching)." },
        "tec/8.9": { titre: "Configuration management", aide: "Define, apply and monitor secure configurations." },
        "tec/8.10": { titre: "Information deletion", aide: "Delete information that is no longer needed (retention periods)." },
        "tec/8.11": { titre: "Data masking", aide: "Mask or anonymise sensitive data wherever the use allows." },
        "tec/8.12": { titre: "Data leakage prevention", aide: "Detect and stop the exfiltration of sensitive information (DLP)." },
        "tec/8.13": { titre: "Information backup", aide: "Back up regularly, and test the restores." },
        "tec/8.14": { titre: "Redundancy of information processing facilities", aide: "Provide redundancy so that services stay available." },
        "tec/8.15": { titre: "Logging", aide: "Log the relevant events, and protect the logs themselves." },
        "tec/8.16": { titre: "Monitoring activities", aide: "Monitor systems to detect abnormal behaviour." },
        "tec/8.17": { titre: "Clock synchronization", aide: "Keep clocks aligned so that log correlation can be trusted." },
        "tec/8.18": { titre: "Use of privileged utility programs", aide: "Govern tools capable of overriding system controls." },
        "tec/8.19": { titre: "Installation of software on operational systems", aide: "Control software installation on production systems." },
        "tec/8.20": { titre: "Networks security", aide: "Protect the networks and the data that crosses them." },
        "tec/8.21": { titre: "Security of network services", aide: "Define and check the security mechanisms of network services." },
        "tec/8.22": { titre: "Segregation of networks", aide: "Segment networks by sensitivity and by trust." },
        "tec/8.23": { titre: "Web filtering", aide: "Filter access to websites to cut exposure to threats." },
        "tec/8.24": { titre: "Use of cryptography", aide: "Set rules for using encryption, and manage the keys." },
        "tec/8.25": { titre: "Secure development life cycle", aide: "Build security in throughout software development." },
        "tec/8.26": { titre: "Application security requirements", aide: "State application security requirements from the outset." },
        "tec/8.27": { titre: "Secure architecture and engineering principles", aide: "Design systems on secure engineering principles." },
        "tec/8.28": { titre: "Secure coding", aide: "Apply coding practices that avoid the common vulnerabilities." },
        "tec/8.29": { titre: "Security testing in development and acceptance", aide: "Test security during development and acceptance." },
        "tec/8.30": { titre: "Outsourced development", aide: "Direct and check security in outsourced development." },
        "tec/8.31": { titre: "Separation of development, test and production", aide: "Keep environments apart in order to protect production." },
        "tec/8.32": { titre: "Change management", aide: "Control system changes through a formal process." },
        "tec/8.33": { titre: "Test information", aide: "Select and protect the data used for testing." },
        "tec/8.34": { titre: "Protection of systems during audit testing", aide: "Plan audit tests so that production systems are not disturbed." }
    }
});
