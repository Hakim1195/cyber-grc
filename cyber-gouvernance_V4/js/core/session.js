// Emplacement : js/core/session.js
// Nom du fichier : session.js
//
// Périmètre de la session, **tel que le serveur le résout** (PLAN_SERVEUR §2.4,
// contrôle S2 de la grille de sécurité).
//
// ── La propriété que ce fichier tient ────────────────────────────────────────
//
//   > Le périmètre vient du serveur. Le navigateur ne le choisit pas, ne le
//   > mémorise pas, et ne le transmet pas.
//
// Elle est tenue par la forme : il n'existe **aucun mutateur**. `charger()` lit
// `/api/session` et rien d'autre ne peut écrire dans l'objet rendu (il est gelé).
// Un futur sélecteur de filiale (lot L4) changera la filiale ACTIVE côté serveur,
// puis rechargera cette session — jamais l'inverse.
//
// ── Nettoyage des restes de la version 100 % navigateur ──────────────────────
//
// L'ancienne application conservait dans `localStorage` une clé `cyber-context`
// (« Périmètre Actif » de la barre latérale) et une clé `cyber-vault` (coffre de
// chiffrement au repos). Ni l'une ni l'autre n'a de sens dans l'édition Groupe :
// le périmètre vient d'ici, et le chiffrement au repos est celui du disque de la
// VM (§1.9). `purgerRestesNavigateur()` les efface au démarrage.
//
// ⚠️ Réserve à connaître : `cyber-context` est aussi lu par six fichiers hors du
// périmètre de cet agent (`js/app.js`, quatre modules, `js/services/exportExcel.js`),
// où il sert de filtre « donneur d'ordre » et non de périmètre de sécurité. La
// purge faite ici l'empêche de SURVIVRE d'une session à l'autre ; le retirer
// complètement suppose de toucher ces six fichiers, ce qui est signalé au rapport.

const Session = (() => {
    "use strict";

    // Clés de l'ancienne application locale. Aucune ne doit persister.
    const CLES_OBSOLETES = [
        "cyber-context",              // « périmètre » choisi dans le navigateur
        "cyber-vault",                // coffre de chiffrement au repos (§1.9)
        "cyber-current",              // instantané de repli des données
        "cyber-gouvernance-data",     // miroir en clair de la base
        "cyber-audits",               // reliquats de la migration v1
        "cyber-revues"
    ];

    let etat = null;    // dernier périmètre résolu par le serveur (gelé)

    let purgeInstallee = false;

    function purger() {
        CLES_OBSOLETES.forEach(cle => {
            try { localStorage.removeItem(cle); } catch (e) { /* stockage indisponible : rien à purger */ }
        });
    }

    function purgerRestesNavigateur() {
        purger();
        // `js/app.js` réécrit `cyber-context` juste après le démarrage, et quatre
        // modules le relisent : ces six fichiers ne sont pas du ressort de ce lot.
        // La purge est donc rejouée à la fermeture, de sorte que **rien de ce qui
        // ressemble à un périmètre ne survive d'une session à l'autre** dans le
        // navigateur. Le périmètre réel, lui, ne transite jamais par là : il est
        // résolu par `/api/session` et n'a aucun mutateur ici (contrôle S2).
        if (!purgeInstallee) {
            purgeInstallee = true;
            try {
                window.addEventListener("pagehide", purger);
                window.addEventListener("beforeunload", purger);
            } catch (e) { /* environnement sans fenêtre */ }
        }
    }

    // Interroge le serveur. Aucune donnée n'est transmise : la signature n'a pas
    // de paramètre, et c'est le contrat (contrôle S2).
    async function charger() {
        const brut = await Api.session();
        const filiale = brut.filiale_active || {};
        etat = Object.freeze({
            utilisateur: brut.utilisateur || "",
            filialeId: filiale.id || "",
            filialeCode: filiale.code || "",
            filialeNom: filiale.raison_sociale || "",
            perimetreLecture: Object.freeze((brut.perimetre_lecture || []).slice()),
            perimetreGroupe: !!brut.perimetre_groupe,
            administrationGroupe: !!brut.administration_groupe,
            provisoire: !!(brut.authentification && brut.authentification.provisoire),
            descriptionAuth: (brut.authentification && brut.authentification.description) || "",
            schemaVersion: brut.schema_version || null
        });
        return etat;
    }

    function courante() { return etat; }
    function chargee() { return etat !== null; }

    // Libellé d'affichage de la filiale active (barre latérale, exports, entêtes
    // d'impression au lot L9). Rien ici ne décide d'un droit.
    function libelleFiliale() {
        if (!etat) return "";
        if (etat.filialeNom && etat.filialeCode) return etat.filialeNom + " (" + etat.filialeCode + ")";
        return etat.filialeNom || etat.filialeCode || etat.filialeId || "";
    }

    return { charger, courante, chargee, libelleFiliale, purgerRestesNavigateur };
})();

window.Session = Session;
