// Emplacement : js/data/en/ref_dora.js
//
// TRADUCTION ANGLAISE du catalogue « dora » — lot L11.
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
// ── LES PARTIS PRIS, ET LEURS RAISONS ───────────────────────────────────────
//
// 1. LE RÈGLEMENT EST PUBLIÉ EN ANGLAIS, ET CETTE VERSION FAIT FOI. Le
//    règlement (UE) 2022/2554 a 24 versions linguistiques également
//    authentiques : l'anglais n'est pas une traduction du français, c'en est un
//    ORIGINAL. Le vocabulaire est donc celui du règlement — et il est très
//    stable d'un article à l'autre : « ICT risk management framework » (art. 6),
//    « Protection and prevention » (art. 9), « ICT-related incident management
//    process » (art. 17), « Key contractual provisions » (art. 30),
//    « exit strategies » (art. 28), « threat-led penetration testing » (art. 26),
//    « management body », « competent authorities ».
//
// 2. « TIC » SE TRADUIT « ICT », JAMAIS « IT ». C'est le sigle du règlement, et
//    il qualifie presque chaque terme composé : ICT risk, ICT assets, ICT
//    services, ICT third-party service providers, ICT-related incidents. Rendre
//    « risque TIC » par « IT risk » ferait perdre le mot que le lecteur cherche.
//
// 3. VOCABULAIRE DU RÈGLEMENT, MAIS PAS PHRASES DU RÈGLEMENT. Le catalogue
//    français ne reproduit pas le texte — reformulations courtes + numéro de
//    pilier — et sa traduction ne le fait pas davantage.
//
// ⚠️ UN ÉCART ASSUMÉ AVEC LE FRANÇAIS, exigence 4.3. Le français dit
// « Surveillance des prestataires critiques », et la tentation était d'écrire
// « Oversight of critical ICT providers ». C'EST FAUX ICI : dans DORA,
// « Oversight » (majuscule, art. 31 s.) désigne le cadre européen exercé par les
// autorités de surveillance sur les prestataires désignés critiques — pas ce que
// fait l'entité financière. L'obligation de l'entité, elle, est de MONITORER ses
// prestataires. Le titre dit donc « Monitoring », et le contresens est évité.

Referentiels.registerTraduction("dora", "en", {
    version: "5 pillars",
    nom: "DORA — operational resilience",
    description: "The European framework for digital operational resilience in the financial sector: ICT risk management, incidents, testing, third-party risk and information sharing.",
    aide: "DORA aims to make sure that financial entities withstand ICT disruption. The 5 pillars are summarised here as indicative measures; the regulation and its technical standards (RTS/ITS) remain the reference.",

    domaines: {
        p1: {
            nom: "ICT risk management", court: "ICT risk",
            aide: "A governance and control framework for ICT risk, driven by the management body."
        },
        p2: {
            nom: "ICT-related incident management", court: "Incidents",
            aide: "Handle, classify and report ICT-related incidents."
        },
        p3: {
            nom: "Resilience testing", court: "Testing",
            aide: "Test resilience regularly, up to advanced threat-led testing."
        },
        p4: {
            nom: "ICT third-party risk", court: "Third parties",
            aide: "Control the dependency on ICT service providers, cloud included."
        },
        p5: {
            nom: "Information sharing", court: "Sharing",
            aide: "Exchange cyber threat information to strengthen collective resilience."
        }
    },

    exigences: {
        // ── Pillar 1 — ICT risk management (Chapter II) ─────────────────────
        "p1/1.1": { titre: "ICT risk management framework", aide: "Governance, accountability of the management body, and a documented framework." },
        "p1/1.2": { titre: "Identification of assets and dependencies", aide: "Identify the critical ICT-supported business functions, assets and dependencies." },
        "p1/1.3": { titre: "Protection and prevention", aide: "Security and continuity measures that prevent incidents." },
        "p1/1.4": { titre: "Detection of anomalous activities", aide: "Promptly detect abnormal activity and ICT-related incidents." },
        "p1/1.5": { titre: "ICT business continuity and recovery policy", aide: "Backups, recovery plans, recovery time and recovery point objectives (RTO/RPO)." },

        // ── Pillar 2 — ICT-related incidents (Chapter III) ──────────────────
        "p2/2.1": { titre: "ICT-related incident management process", aide: "Detect, record and handle incidents consistently." },
        "p2/2.2": { titre: "Classification of incidents", aide: "Assess how significant an incident is against defined criteria." },
        "p2/2.3": { titre: "Reporting of major incidents", aide: "Report major ICT-related incidents to the competent authorities within the deadlines." },

        // ── Pillar 3 — Resilience testing (Chapter IV) ──────────────────────
        "p3/3.1": { titre: "Digital operational resilience testing programme", aide: "Regularly test ICT tools and systems (vulnerability assessments, scenario-based tests)." },
        "p3/3.2": { titre: "Advanced testing (TLPT)", aide: "Threat-led penetration testing, for the entities that fall in scope." },

        // ── Pillar 4 — ICT third-party risk (Chapter V) ─────────────────────
        "p4/4.1": { titre: "Register of information on ICT providers", aide: "Maintain the register of information on all contractual arrangements for the use of ICT services." },
        "p4/4.2": { titre: "Key contractual provisions", aide: "Mandatory clauses (access, audit, security, subcontracting)." },
        "p4/4.3": { titre: "Monitoring of critical ICT providers", aide: "Follow up on critical ICT third-party service providers, and watch for concentration risk." },
        "p4/4.4": { titre: "Exit strategies", aide: "Plan for reversibility and for exiting critical ICT services." },

        // ── Pillar 5 — Information sharing (Chapter VI) ─────────────────────
        "p5/5.1": { titre: "Cyber threat information sharing", aide: "Take part in information-sharing arrangements on cyber threat information and intelligence." }
    }
});
