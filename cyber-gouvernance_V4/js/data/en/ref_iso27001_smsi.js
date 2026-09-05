// Emplacement : js/data/en/ref_iso27001_smsi.js
//
// TRADUCTION ANGLAISE du catalogue « iso27001-smsi » — lot L11.
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
// 1. VOCABULAIRE NORMATIF, MAIS PAS LES INTITULÉS TELS QUELS — ET C'EST ICI UN
//    ÉCART AVEC `en/ref_iso27002.js`, VOULU. Pour l'Annexe A, reprendre les
//    intitulés officiels était juste : ce sont des NOMS DE MESURES, distincts
//    deux à deux, et l'auditeur les cherche mot pour mot. Aux chapitres 4 à 10,
//    la même méthode casse le produit : ISO intitule « General » les clauses
//    6.1.1, 7.5.1, 9.2.1 ET 9.3.1 — quatre lignes du tableau porteraient le même
//    titre, et aucune ne se lirait. Le français les a nommées ; l'anglais les
//    nomme aussi, avec les MOTS de la norme.
//
// 2. LE MÊME PIÈGE, EN PLUS SOURNOIS, AUX CLAUSES 6.1.2/8.2 ET 6.1.3/8.3. La
//    norme y répète volontairement le même intitulé (« Information security risk
//    assessment » en 6.1.2 et en 8.2) : au chapitre 6 on DÉFINIT le processus,
//    au chapitre 8 on l'EXÉCUTE. Le français distingue (« Définir un
//    processus… » / « Réaliser les appréciations… ») et l'anglais garde cette
//    distinction — « …process » d'un côté, « Performing… » / « Implementing… »
//    de l'autre. Sans elle, un RSSI évaluerait deux fois la même chose.
//
// 3. ISMS, PAS SMSI, ET PARTOUT. « Information security management system » est
//    le terme normatif ; son sigle anglais est ISMS. Il est employé au long dans
//    la description, puis en sigle — comme le français fait de « SMSI ».
//
// 4. L'ORTHOGRAPHE EST SCINDÉE, comme dans `en/ref_iso27002.js` : les TITRES
//    suivent l'orthographe d'Oxford de l'ISO (« organization », mais
//    « programme »), les AIDES suivent l'anglais britannique de l'interface.
//    Là où les deux se heurtaient dans une même entrée, l'aide est tournée
//    autrement — c'est pourquoi aucune aide de ce fichier n'écrit le mot.
//
// ⚠️ « Nonconformity » s'écrit en un mot et sans trait d'union (clause 10.2), et
// l'amélioration est « continual », jamais « continuous » : ISO distingue les
// deux, et un rapport d'audit qui confond se fait reprendre.

Referentiels.registerTraduction("iso27001-smsi", "en", {
    version: "Clauses 4-10 · ISMS",
    nom: "ISO/IEC 27001:2022 — Management system",
    description: "The requirements for the information security management system (ISMS) of ISO/IEC 27001:2022 — clauses 4 to 10: context, leadership, planning, support, operation, performance evaluation and improvement. These are the requirements a clause 9.2 audit checks, alongside the Annex A controls.",
    aide: "Where Annex A lists security controls (from which the Statement of Applicability selects), clauses 4 to 10 are the MANDATORY management system requirements: they describe how security is steered over time (PDCA). Titles are reworded — refer to the official standard for the exact text.",

    domaines: {
        c4: {
            nom: "4. Context of the organization", court: "Context",
            aide: "Lay the foundations: understand the context, identify the interested parties, and set the scope of the ISMS."
        },
        c5: {
            nom: "5. Leadership", court: "Leadership",
            aide: "Commitment from top management: policy, resources and responsibilities."
        },
        c6: {
            nom: "6. Planning", court: "Planning",
            aide: "Treat the risks, set objectives and plan the changes."
        },
        c7: {
            nom: "7. Support", court: "Support",
            aide: "The means: resources, competence, awareness, communication and documentation."
        },
        c8: {
            nom: "8. Operation", court: "Operation",
            aide: "Execute: control the operations, and carry out risk assessment and risk treatment."
        },
        c9: {
            nom: "9. Performance evaluation", court: "Evaluation",
            aide: "Check: measure performance, audit, and hold the management review."
        },
        c10: {
            nom: "10. Improvement", court: "Improvement",
            aide: "Move forward: improve continually and deal with nonconformities."
        }
    },

    exigences: {
        // ── 4. Context of the organization ──────────────────────────────────
        "c4/4.1": { titre: "Understanding the organization and its context", aide: "Identify the internal and external issues relevant to the ISMS (purpose, business, regulation, environment)." },
        "c4/4.2": { titre: "Interested parties and their requirements", aide: "Determine the relevant interested parties (customers, authorities, employees…) and their requirements, legal and contractual ones included." },
        "c4/4.3": { titre: "Determining the scope of the ISMS", aide: "Set the boundaries and applicability of the system: activities, sites, assets, interfaces and dependencies." },
        "c4/4.4": { titre: "Establishing and improving the ISMS", aide: "Establish, maintain and continually improve the ISMS and its processes, in line with the standard." },

        // ── 5. Leadership ───────────────────────────────────────────────────
        "c5/5.1": { titre: "Leadership and commitment", aide: "Top management drives the policy, builds it into the business processes, provides the resources and backs the people involved." },
        "c5/5.2": { titre: "Information security policy", aide: "A policy that fits the business, frames the objectives, and is communicated and available as documented information." },
        "c5/5.3": { titre: "Roles, responsibilities and authorities", aide: "Assign and communicate who is responsible for ISMS conformity and for reporting on its performance." },

        // ── 6. Planning ─────────────────────────────────────────────────────
        "c6/6.1.1": { titre: "Actions to address risks and opportunities", aide: "From the context (4.1) and the requirements (4.2), determine the risks and opportunities to address, and plan the actions." },
        "c6/6.1.2": { titre: "Information security risk assessment process", aide: "A repeatable method to identify, analyse and evaluate risks, with assessment and acceptance criteria." },
        "c6/6.1.3": { titre: "Information security risk treatment process", aide: "Choose the options, determine the controls (compared against Annex A), produce the Statement of Applicability and the treatment plan, and obtain the risk owners' approval." },
        "c6/6.2": { titre: "Information security objectives and planning", aide: "Objectives consistent with the policy, measurable, monitored, with resources, owners and deadlines." },
        "c6/6.3": { titre: "Planning of changes to the ISMS", aide: "Carry out any change needed to the ISMS in a planned manner (new in the 2022 edition)." },

        // ── 7. Support ──────────────────────────────────────────────────────
        "c7/7.1": { titre: "Resources", aide: "Determine and allocate the resources needed to establish, implement, maintain and improve the ISMS." },
        "c7/7.2": { titre: "Competence", aide: "Determine the competence required, acquire it (training, recruitment) and retain evidence of it." },
        "c7/7.3": { titre: "Awareness", aide: "Everyone knows the policy, their own contribution to the effectiveness of the ISMS, and what failing to comply means." },
        "c7/7.4": { titre: "Communication", aide: "Determine what to communicate about the ISMS, when, with whom and how." },
        "c7/7.5.1": { titre: "Required documented information", aide: "The ISMS holds the documentation the standard requires, plus whatever is judged necessary for it to be effective." },
        "c7/7.5.2": { titre: "Creating and updating documented information", aide: "Appropriate identification, format and media; review and approval." },
        "c7/7.5.3": { titre: "Control of documented information", aide: "Availability, protection, distribution, versioning, retention and disposal; control of documents of external origin." },

        // ── 8. Operation ────────────────────────────────────────────────────
        "c8/8.1": { titre: "Operational planning and control", aide: "Implement the processes needed to treat the risks, and keep control of changes and of outsourced processes." },
        "c8/8.2": { titre: "Performing the risk assessments", aide: "Assess the risks at planned intervals, or when a significant change occurs, and retain evidence." },
        "c8/8.3": { titre: "Implementing the risk treatment plan", aide: "Carry out the risk treatment plan and retain evidence of it." },

        // ── 9. Performance evaluation ───────────────────────────────────────
        "c9/9.1": { titre: "Monitoring, measurement, analysis and evaluation", aide: "Determine what to measure, by which methods, when and by whom, so as to evaluate the performance and effectiveness of the ISMS." },
        "c9/9.2.1": { titre: "Internal audit", aide: "Check at planned intervals that the ISMS conforms to its own requirements and to the standard, and is effectively implemented." },
        "c9/9.2.2": { titre: "Internal audit programme", aide: "Plan the frequency, methods and responsibilities; objective and impartial auditors; results reported and retained." },
        "c9/9.3.1": { titre: "Management review", aide: "Top management reviews the ISMS at planned intervals to confirm its continuing suitability, adequacy and effectiveness." },
        "c9/9.3.2": { titre: "Management review inputs", aide: "Status of earlier actions, changes in context, performance, nonconformities, audit and risk assessment results, feedback from interested parties." },
        "c9/9.3.3": { titre: "Management review results", aide: "Produce decisions on continual improvement and on changes to the ISMS, and retain evidence of them." },

        // ── 10. Improvement ─────────────────────────────────────────────────
        "c10/10.1": { titre: "Continual improvement", aide: "Continually improve the suitability, adequacy and effectiveness of the system." },
        "c10/10.2": { titre: "Nonconformity and corrective action", aide: "React, correct, analyse the causes, act to prevent recurrence, check that it worked and retain evidence." }
    }
});
