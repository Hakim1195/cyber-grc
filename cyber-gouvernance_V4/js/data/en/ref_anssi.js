// Emplacement : js/data/en/ref_anssi.js
//
// TRADUCTION ANGLAISE du catalogue « anssi-hygiene » — lot L11.
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
// ════════════════════════════════════════════════════════════════════════════
// ⚠️ CONSTAT DE NUMÉROTATION — À LIRE AVANT DE TOUCHER À CE FICHIER
// ════════════════════════════════════════════════════════════════════════════
//
// LES CODES 30 À 42 DU CATALOGUE FRANÇAIS NE DÉSIGNENT PAS LES MESURES QUE LE
// GUIDE DE L'ANSSI NUMÉROTE AINSI. Ce n'est pas un défaut de traduction : il
// est dans le catalogue français, et il vaut donc pour TOUTES les langues.
// Il est mesuré, pas supposé — source : ANSSI, « Guideline for a healthy
// information system in 42 measures » (v2), outil de suivi p. 60-65, croisé
// avec l'édition française. Ce que dit le guide :
//
//   VI  Secure administration ......... 27, 28, 29            (TROIS mesures)
//   VII Manage mobile working ......... 30, 31, 32, 33
//   VIII Keep the IS up to date ....... 34, 35
//   IX  Supervise, audit, react ....... 36, 37, 38, 39, 40
//   X   To go even further ........... 41, 42
//
// Ce que porte le catalogue français, et l'écart que cela produit :
//
//   · code 30 « Réserver les comptes d'admin aux seules tâches d'admin » est
//     INSÉRÉ dans la famille administration. Le guide n'a PAS de 30e mesure
//     d'administration : sa mesure 30 est « Take measures to physically secure
//     mobile devices ». Le propos du code 30 vit, chez l'ANSSI, dans la mesure
//     8 (« distinguish the user/administrator roles ») et dans le corps de la 29 ;
//   · les codes 31 → 41 sont donc DÉCALÉS DE +1 par rapport au guide : le
//     code 34 du produit (« Encadrer l'usage des terminaux mobiles ») est la
//     mesure 33 du guide, le code 40 (« Désigner un référent sécurité ») est
//     la mesure 39, etc. ;
//   · le code 42 FUSIONNE deux mesures distinctes du guide — la 41 (analyse de
//     risque formelle) et la 42 (produits qualifiés par l'ANSSI). C'est cette
//     fusion qui ramène le total à 42 et masque le décalage ;
//   · en conséquence, le code 41 (« procédure de gestion des incidents ») est
//     classé « Pour aller plus loin », alors que le guide le range en
//     « Superviser, auditer, réagir ».
//
// Treize codes sur quarante-deux — 30 à 42 — désignent donc autre chose que ce
// que le guide désigne sous le même numéro. Un RSSI qui rapproche l'écran du
// guide officiel ne retrouve pas ses mesures, et les deux se lisent
// parfaitement.
//
// ⚠️ CE FICHIER NE CORRIGE RIEN, ET C'EST DÉLIBÉRÉ. Il traduit, il ne
// renumérote pas. Trois raisons :
//   1. le catalogue français n'est pas dans le périmètre d'écriture de ce lot ;
//   2. les auto-évaluations de l'utilisateur sont stockées par (ref_id, code)
//      — renuméroter en place réattribuerait des évaluations existantes à
//      d'autres mesures, en silence, dans un outil produit en audit ;
//   3. l'arbitrage — s'aligner sur le guide, ou assumer un référentiel maison —
//      appartient au produit, pas à une traduction.
// Le constat est remonté au registre. Tant qu'il n'est pas tranché, les titres
// anglais ci-dessous traduisent LE CATALOGUE, code par code, sans jamais se
// réaligner sur la numérotation officielle : un alignement partiel ferait
// coexister deux vérités dans le même produit.
//
// ════════════════════════════════════════════════════════════════════════════
//
// ── LES PARTIS PRIS, ET LEURS RAISONS ───────────────────────────────────────
//
// 1. LES NOMS DE FAMILLES SONT CEUX DE L'ANSSI, MOT POUR MOT. Le guide EXISTE
//    en anglais — « Guideline for a healthy information system in 42 measures »
//    — et ses dix intertitres traduisent exactement les dix familles du
//    catalogue français : « Raise awareness and train », « Know the information
//    system », « Authenticate and control accesses » (pluriel tel quel),
//    « Secure the devices », « Secure the network », « Secure administration »,
//    « Manage mobile working », « Keep the information system up to date »,
//    « Supervise, audit, react », « To go even further ». Les reprendre est
//    juste : c'est la même phrase, dans la langue de son auteur.
//
// 2. LES TITRES DE MESURES, EUX, SONT TRADUITS DU CATALOGUE — PAS RECOPIÉS DU
//    GUIDE. Deux raisons, et la seconde est la vraie. D'abord la règle du
//    dépôt : reformulations originales courtes, jamais le texte de la source.
//    Ensuite, et surtout : les titres FRANÇAIS du catalogue sont DÉJÀ des
//    reformulations, plus courtes et parfois plus larges que celles de l'ANSSI
//    (code 1, « équipes informatiques », là où le guide dit « équipes
//    opérationnelles » / « operational teams » ; code 18, « stockées et
//    échangées », là où le guide ne vise que « sent through the Internet »).
//    Recopier les titres officiels anglais ferait dire à l'écran anglais autre
//    chose qu'à l'écran français — et, avec le décalage ci-dessus, le ferait
//    dire SOUS LE MAUVAIS NUMÉRO. Le vocabulaire de l'ANSSI est donc emprunté,
//    ses phrases non : « removable media », « privileged accounts »,
//    « mobile working », « segment / segregate », « secure access gateway to
//    the Internet », « point of contact in information system security »,
//    « products and services qualified by ANSSI ».
//
// 3. « SI » S'ÉCRIT « INFORMATION SYSTEM », PAS « IS ». L'ANSSI abrège en « IS »
//    dans son guide, mais elle a une page pour poser le sigle. Ici les titres
//    tombent dans des tableaux denses, sans introduction, où « IS » se lit
//    comme le verbe. Le sigle est donc écarté partout.
//
// 4. UN ÉCART ASSUMÉ AVEC L'ANSSI, code 13. Le guide de 2017 écrit « two-factor
//    authentication » ; le catalogue français dit « authentification
//    multifacteur (MFA) », et c'est le terme qu'emploient NIS2 et DORA. Le
//    titre anglais suit le catalogue : « multi-factor authentication (MFA) ».

Referentiels.registerTraduction("anssi-hygiene", "en", {
    version: "42 measures",
    nom: "Cyber hygiene (ANSSI)",
    description: "A baseline of good practice for strengthening the security of an information system. An excellent starting point — approachable and concrete — before the more demanding frameworks (ISO 27001, NIS2, DORA).",
    aide: "Published by ANSSI, the French national cybersecurity agency, this guide gathers elementary measures which, once applied, head off the great majority of common incidents.",

    domaines: {
        sensibiliser: {
            nom: "Raise awareness and train", court: "Awareness",
            aide: "People are the first line of defence: trained teams and users who know the basics drive the number of incidents down."
        },
        connaitre: {
            nom: "Know the information system", court: "Knowledge",
            aide: "You only protect well what you know: mapping, inventories and access management."
        },
        acces: {
            nom: "Authenticate and control accesses", court: "Access",
            aide: "Every person is identified and reaches only what they need, with solid authentication."
        },
        postes: {
            nom: "Secure the devices", court: "Devices",
            aide: "Workstations and servers hardened consistently, protected against removable media, with their data encrypted."
        },
        reseau: {
            nom: "Secure the network", court: "Network",
            aide: "Segmentation, encrypted protocols, a controlled Internet gateway and email protection."
        },
        administration: {
            nom: "Secure administration", court: "Administration",
            aide: "Administering the information system is the most coveted target: it deserves a dedicated, separated environment."
        },
        nomadisme: {
            nom: "Manage mobile working", court: "Mobile working",
            aide: "Equipment that leaves the premises (laptops, handsets) calls for protections of its own."
        },
        maj: {
            nom: "Keep the information system up to date", court: "Updates",
            aide: "Patches close known holes: apply them fast, and replace whatever is no longer maintained."
        },
        superviser: {
            nom: "Supervise, audit, react", court: "Supervise",
            aide: "Detect, back up, check and know how to react: security is steered over time."
        },
        avance: {
            nom: "To go even further", court: "Going further",
            aide: "Once the baseline is in place, formalise crisis management and risk analysis."
        }
    },

    exigences: {
        // ── I. Raise awareness and train ────────────────────────────────────
        "sensibiliser/1": { titre: "Train the IT teams in security", aide: "Administrators and technicians configure and run the information system day to day: they must be trained in good practice and in current threats." },
        "sensibiliser/2": { titre: "Raise all users' awareness of the basics", aide: "Passwords, phishing, attachments: every employee is a link in the security chain. Regular awareness work pays for itself many times over." },
        "sensibiliser/3": { titre: "Control the risks of outsourced IT services", aide: "Where a provider runs all or part of the information system, the contract must set clear security requirements and a right of scrutiny (audit, reversibility)." },

        // ── II. Know the information system ─────────────────────────────────
        "connaitre/4": { titre: "Map the information system and locate sensitive data", aide: "An inventory of servers, applications and flows, and the location of the most critical information: the basis of any protection." },
        "connaitre/5": { titre: "Keep an up-to-date inventory of privileged accounts", aide: "Administrator accounts are prime targets. You must know at all times who holds them, and what for." },
        "connaitre/6": { titre: "Manage joiners, movers and leavers", aide: "Creating, changing and above all withdrawing access at the right moment prevents orphan accounts that stay usable after someone has left." },
        "connaitre/7": { titre: "Allow only controlled devices onto the network", aide: "An unknown machine plugged into the network is a way in: accept only equipment that is identified and compliant with the policy." },

        // ── III. Authenticate and control accesses ──────────────────────────
        "acces/8": { titre: "Identify each user by name", aide: "Named accounts (no shared accounts) and separation of the user and administrator roles are what make actions traceable." },
        "acces/9": { titre: "Grant rights on need alone (least privilege)", aide: "Everyone reaches only the resources their job requires: that is what limits the impact of a compromised account." },
        "acces/10": { titre: "Enforce robust password rules", aide: "Sufficient length and complexity: a weak password is broken in seconds." },
        "acces/11": { titre: "Protect stored passwords", aide: "They must never be kept in the clear, only as fingerprints (salted hashing)." },
        "acces/12": { titre: "Change default credentials and secrets", aide: "Factory 'admin/admin' accounts are public knowledge: change them at installation time." },
        "acces/13": { titre: "Prefer multi-factor authentication (MFA)", aide: "A second factor (code, app, hardware key) makes a stolen password no longer enough to log in." },

        // ── IV. Secure the devices ──────────────────────────────────────────
        "postes/14": { titre: "Set a minimum security baseline across the estate", aide: "A hardened, consistent configuration (anti-virus, limited accounts, needless services switched off) on every workstation and server." },
        "postes/15": { titre: "Govern the use of removable media", aide: "USB sticks spread malware readily: restrict them, scan them, and encrypt their contents where needed." },
        "postes/16": { titre: "Manage configurations centrally", aide: "A central tool (GPO, MDM) applies and checks the same rules everywhere, with no machine left out." },
        "postes/17": { titre: "Activate the firewall on workstations", aide: "Each machine's own firewall blocks unsolicited connections, including between machines on the same network." },
        "postes/18": { titre: "Encrypt sensitive data at rest and in transit", aide: "Encryption makes the data unreadable if equipment is stolen or traffic intercepted." },

        // ── V. Secure the network ───────────────────────────────────────────
        "reseau/19": { titre: "Segment the network into sensitivity zones", aide: "Separating the zones (office, servers, industrial) limits how far an attack spreads from one to the next." },
        "reseau/20": { titre: "Secure the Wi-Fi and separate its uses", aide: "Strong Wi-Fi encryption, and a guest network kept isolated from the internal one." },
        "reseau/21": { titre: "Use secure network protocols", aide: "Prefer the encrypted versions (HTTPS, SSH, SFTP…) over legacy protocols that transmit in the clear." },
        "reseau/22": { titre: "Implement a secure Internet access gateway", aide: "Filtering, proxying and logging frame outbound access and block dangerous sites or flows." },
        "reseau/23": { titre: "Segregate Internet-facing services (DMZ)", aide: "Servers reachable from the Internet sit in a buffer zone, cut off from the heart of the information system." },
        "reseau/24": { titre: "Protect professional email", aide: "Anti-spam, anti-phishing, attachment filtering and sender authentication (SPF, DKIM, DMARC)." },
        "reseau/25": { titre: "Secure the interconnections with partners", aide: "Dedicated links to third parties must be encrypted, filtered and held to the strict minimum." },
        "reseau/26": { titre: "Control physical access to technical areas", aide: "Server rooms and patch cabinets protected: physical access bypasses a great many logical protections." },

        // ── VI. Secure administration ───────────────────────────────────────
        // ⚠️ Le code 30 est propre au catalogue : voir le constat en entête.
        "administration/27": { titre: "Cut Internet access from administration tools", aide: "The workstations and servers used to administer the information system must not browse the Internet (risk of compromise)." },
        "administration/28": { titre: "Dedicate and separate the administration network", aide: "Administering over a separate network stops an attacker on the office network from reaching the admin consoles." },
        "administration/29": { titre: "Reduce administration rights to strict need", aide: "The fewer accounts that hold elevated rights, the smaller the privileged attack surface." },
        "administration/30": { titre: "Use admin accounts for admin tasks only", aide: "An administrator uses a standard account for office work, and their privileged account only to administer." },

        // ── VII. Manage mobile working ──────────────────────────────────────
        "nomadisme/31": { titre: "Physically secure mobile devices", aide: "Locking, privacy screens and vigilance against the theft or loss of laptops and smartphones." },
        "nomadisme/32": { titre: "Encrypt devices and media taken off site", aide: "A lost computer must not give up its data: full-disk encryption is essential away from the office." },
        "nomadisme/33": { titre: "Secure the remote connection (VPN)", aide: "Access from outside goes through an encrypted, authenticated tunnel into the information system." },
        "nomadisme/34": { titre: "Adopt a policy for mobile devices", aide: "A dedicated policy for smartphones and tablets (MDM, permitted applications, work/personal separation)." },

        // ── VIII. Keep the information system up to date ────────────────────
        "maj/35": { titre: "Apply an update policy", aide: "Installing security patches promptly closes known holes before they are exploited." },
        "maj/36": { titre: "Anticipate obsolescence (end of support)", aide: "Software or a system that no longer receives patches becomes a permanent vulnerability: plan its replacement." },

        // ── IX. Supervise, audit, react ─────────────────────────────────────
        "superviser/37": { titre: "Log the activity of the key components", aide: "Without logs you neither detect nor understand an attack. Enabling and retaining them is the basis of detection." },
        "superviser/38": { titre: "Back up regularly and test the restores", aide: "Offline, tested backups are the best answer to ransomware. An untested backup is not a backup." },
        "superviser/39": { titre: "Undertake regular security audits", aide: "Regular checks and tests reveal the gaps, to be closed through the action plan." },
        "superviser/40": { titre: "Designate a security point of contact", aide: "One identified person steers security and is the focal point for alerts and decisions." },

        // ── X. To go even further ───────────────────────────────────────────
        // ⚠️ Le code 42 fusionne deux mesures du guide : voir le constat en entête.
        "avance/41": { titre: "Define a security incident management procedure", aide: "Knowing in advance who does what (detection, containment, communication) buys decisive time on the day." },
        "avance/42": { titre: "Carry out a risk assessment and favour qualified products", aide: "A formal risk assessment sets the priorities; products and services qualified by ANSSI carry extra assurance." }
    }
});
