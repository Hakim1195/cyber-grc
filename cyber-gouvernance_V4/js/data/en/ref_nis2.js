// Emplacement : js/data/en/ref_nis2.js
//
// TRADUCTION ANGLAISE du catalogue « nis2-art21 » — lot L11.
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
// ── LE PARTI PRIS, ET SA RAISON ─────────────────────────────────────────────
//
// LA DIRECTIVE EST PUBLIÉE EN ANGLAIS, ET CETTE VERSION FAIT FOI. La directive
// (UE) 2022/2555 a 24 versions linguistiques également authentiques : l'anglais
// n'est donc pas une traduction du français, c'en est un ORIGINAL. Traduire ici
// « depuis le français » produirait un vocabulaire que le RSSI ne retrouverait
// dans aucun texte — d'où « incident handling » et non « incident management »,
// « supply chain security », « basic cyber hygiene practices », « multi-factor
// authentication », « human resources security », qui sont les mots de
// l'article 21(2), points a) à j).
//
// ⚠️ VOCABULAIRE DE L'ARTICLE, MAIS PAS PHRASES DE L'ARTICLE. Le catalogue
// français ne reproduit pas le texte de la directive — reformulations courtes +
// lettre du point — et sa traduction ne le fait pas davantage. Le point e),
// « security in network and information systems acquisition, development and
// maintenance, including vulnerability handling and disclosure », est donc
// RACCOURCI dans le titre, sa fin passant en aide : ces titres s'affichent dans
// des tableaux denses et sur les axes d'un radar.
//
// ⚠️ UN ÉCART ASSUMÉ AVEC LE FRANÇAIS, point j). Le catalogue français dit
// « authentification forte », qui est l'idiome français (et celui de l'ANSSI) ;
// la directive, elle, écrit « multi-factor authentication or continuous
// authentication solutions ». Le titre anglais suit la DIRECTIVE, pas le
// français : c'est le terme qu'un lecteur anglophone cherchera.

Referentiels.registerTraduction("nis2-art21", "en", {
    version: "10 measures",
    nom: "NIS2 — Article 21 measures",
    description: "The minimum risk-management measures that the European NIS2 Directive (Article 21) imposes on essential and important entities. Transposed into national law, it widens considerably the range of organisations concerned.",
    aide: "NIS2 requires an all-hazards approach to risk and makes the management body accountable. The 10 measures below are grouped into themes for readability; the text of the directive remains the reference.",

    domaines: {
        gouvernance: {
            nom: "Risk governance", court: "Governance",
            aide: "Analyse the risks, adopt policies and check that they actually work."
        },
        incidents: {
            nom: "Incidents & continuity", court: "Incidents",
            aide: "Handle incidents and keep the business running through a crisis."
        },
        chaine: {
            nom: "Supply chain & development", court: "Supply chain",
            aide: "Secure the suppliers and the life cycle of the systems."
        },
        hygiene: {
            nom: "Hygiene, access & cryptography", court: "Hygiene & access",
            aide: "The fundamentals: training, cryptography, access management and multi-factor authentication."
        }
    },

    exigences: {
        // ── Risk governance — points a) and f) ──────────────────────────────
        "gouvernance/a": { titre: "Risk analysis and information system security policies", aide: "Hold policies on risk analysis and on the security of information systems." },
        "gouvernance/f": { titre: "Assessing the effectiveness of the measures", aide: "Put procedures in place to assess whether the cybersecurity risk-management measures are effective." },

        // ── Incidents & continuity — points b) and c) ───────────────────────
        "incidents/b": { titre: "Incident handling", aide: "Detect, handle and report security incidents." },
        "incidents/c": { titre: "Business continuity and crisis management", aide: "Backup management, disaster recovery and crisis management." },

        // ── Supply chain & development — points d) and e) ───────────────────
        "chaine/d": { titre: "Supply chain security", aide: "Control the risks carried by direct suppliers and service providers." },
        "chaine/e": { titre: "Security in acquisition, development and maintenance", aide: "Covers vulnerability handling and disclosure as well." },

        // ── Hygiene, access & cryptography — points g) to j) ────────────────
        "hygiene/g": { titre: "Cyber hygiene and training", aide: "Basic cyber hygiene practices and cybersecurity training." },
        "hygiene/h": { titre: "Cryptography and encryption", aide: "Policies and procedures governing the use of cryptography." },
        "hygiene/i": { titre: "HR security, access control and asset management", aide: "Human resources security, access control policies and the asset inventory." },
        "hygiene/j": { titre: "Multi-factor authentication and secured communications", aide: "Multi-factor authentication, and secured voice, video, text and emergency communications." }
    }
});
