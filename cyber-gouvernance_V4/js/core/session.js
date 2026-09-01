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
// La réserve qui accompagnait ces lignes est **levée**, et son texte était
// devenu faux (constat Q-12, même motif que l'entête de `js/core/vault.js`) : il
// annonçait que six fichiers lisaient encore `cyber-context` pour en tirer un
// filtre « donneur d'ordre ». Ils ne le lisent plus. Ce filtre — un confort
// d'affichage, jamais un périmètre de sécurité — vit désormais **en mémoire**,
// dans `window.FiltreDonneurOrdre` (`js/app.js`), et disparaît donc avec
// l'onglet. Plus aucun fichier de la SPA ne lit ni n'écrit `cyber-context`.
//
// La purge reste, et le double filet ci-dessous aussi. Ce n'est pas un reliquat :
// elle vise les postes qui ont fait tourner la version 100 % navigateur, où la
// clé est encore écrite sur le disque. Elle disparaîtra le jour où plus aucun
// poste n'aura connu cette version — c'est-à-dire pas dans ce lot.

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
        // La purge est rejouée à la FERMETURE, et pas seulement au démarrage.
        // Ce second passage ne vise plus un écrivain de l'application — il n'y
        // en a plus — mais tout ce qui pourrait réécrire ces clés pendant la
        // session sans que ce fichier le sache : une extension de navigateur, un
        // onglet resté ouvert sur une version ancienne servie par le cache, un
        // module non encore converti. La propriété tenue est celle-ci, et elle
        // ne dépend d'aucune énumération : **rien de ce qui ressemble à un
        // périmètre ne survit d'une session à l'autre** dans le navigateur.
        // Le périmètre réel, lui, ne transite jamais par là : il est résolu par
        // `/api/session` et n'a aucun mutateur ici (contrôle S2).
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
