// Emplacement : js/core/identite.js
// Nom du fichier : identite.js
//
// Identité visuelle PAR FILIALE — lot L9 (`backend/db/CONVENTIONS.md` §33.4,
// `PLAN_SERVEUR` §6). « Une société rachetée ne présente pas un rapport à la
// marque de sa maison mère. »
//
// ── Le problème que ce fichier ferme ─────────────────────────────────────────
//
// La marque de la maison mère était écrite EN DUR dans dix fichiers du
// frontend, dont les vues imprimables et l'export SVG de la matrice des risques —
// précisément les documents qu'un auditeur aura entre les mains. Ce fichier
// centralise la SEULE source de vérité pour la raison sociale et le logo
// affichés : tous deux tirés de la filiale ACTIVE telle que le serveur l'a
// résolue (`Session`), jamais d'une constante recopiée à un douzième endroit.
//
// ── Ce que ce fichier NE fait PAS, et pourquoi ───────────────────────────────
//
//  · Il n'invente aucune donnée. La raison sociale vient de `Session.courante()`
//    (elle-même tirée de `GET /api/session` → `filiale_active.raison_sociale`).
//    Les COORDONNÉES (adresse, téléphone, email, site web) existent dans la
//    table `filiales`, mais **aucune route ne les rend aujourd'hui** —
//    ni `/api/session`, ni `/api/filiales` (les deux ne rendent que
//    `id, code, raison_sociale`[, `statut`], mesuré dans `backend/src/api/`).
//    Ce fichier ne les affiche donc pas : afficher une coordonnée qu'aucune
//    route ne fournit serait la fabriquer. Voir le rapport de l'agent M3/L9
//    pour ce manque, qui n'est pas du ressort de ce lot (périmètre serveur).
//  · Il ne contrôle ni l'extension ni la signature binaire d'un logo : ce
//    contrôle est ENTIÈREMENT côté serveur (`CONVENTIONS.md` §31.2,
//    `backend/src/pieces/catalogue.ts`, `TYPES_LOGO`). Ce fichier ajoute une
//    UNIQUE vérification, en aval, sur ce qu'il s'apprête à afficher : jamais
//    un `<img>` dont le contenu récupéré n'est pas, à l'octet près, un PNG ou
//    un JPEG CONSTATÉ (`blob.type`, mesuré par le navigateur sur les octets
//    reçus — jamais un nom de fichier ni un type annoncé). C'est une deuxième
//    barrière, pas un deuxième chemin : rien ici ne décide qu'un fichier EST
//    un logo, le serveur en a déjà décidé ; ce contrôle décide seulement si ce
//    qui revient mérite un `<img src>`.
//
// ── Repli, et pourquoi il ne peut jamais être silencieux ─────────────────────
//
// Une filiale sans logo — droit insuffisant sur le domaine `administration`
// (le cas de la plupart des profils, voir le rapport de ce lot), route non
// montée, aucun fichier déposé, réseau indisponible — ne doit JAMAIS afficher
// le logo d'une AUTRE filiale ni celui de la maison mère : c'est le défaut que
// ce lot existe pour corriger. Le repli est donc TOUJOURS la raison sociale en
// texte, et ce texte ne disparaît JAMAIS au profit du logo : les deux
// coexistent. Un logo qui échoue à charger laisse la raison sociale seule à
// l'écran — jamais un vide, jamais une marque étrangère.
//
// ── Chargement du logo : asynchrone, mis en cache PAR FILIALE ────────────────
//
// La raison sociale est déjà en mémoire (`Session`) : elle s'affiche sans
// attendre. Le logo, lui, suppose un aller-retour réseau
// (`GET /api/pieces/logo` puis `GET /api/pieces/logo/:id`) : les vues qui
// veulent l'afficher rendent D'ABORD le texte (jamais bloqué), puis appellent
// `brancherLogos()`, qui complète les emplacements marqués `[data-brand-logo]`
// une fois l'image obtenue — jamais avant, même discipline que
// `js/modules/pieces.js`.

const Identite = (() => {
    "use strict";

    const NOM_PRODUIT = "Cyber GRC";

    /** Le SEUL vocabulaire admis pour un `<img>` de marque — jamais un SVG (§33.4). */
    const TYPES_IMAGE_ADMIS = Object.freeze(["image/png", "image/jpeg"]);

    function session() {
        try { return (typeof Session !== "undefined") ? Session.courante() : null; }
        catch (e) { return null; }
    }

    /** La raison sociale de la filiale ACTIVE, ou "" si la session n'est pas résolue. */
    function raisonSociale() {
        const s = session();
        return (s && s.filialeNom) ? s.filialeNom : "";
    }

    /** Jamais vide : la raison sociale, ou `repli` (par défaut le nom du produit). */
    function raisonSocialeOuRepli(repli) {
        const r = raisonSociale();
        return r || (repli !== undefined ? repli : NOM_PRODUIT);
    }

    /**
     * Ligne d'entête ou de pied de page imprimable : "«Raison sociale» ·
     * complément". C'est LE seul appel à faire partout où la marque de la
     * maison mère était écrite en dur (`CONVENTIONS.md` §33.4) — le résultat
     * est une donnée de filiale et doit donc encore passer par `escapeHtml`
     * chez l'appelant, comme toute donnée injectée en DOM.
     */
    function piedImpression(complement) {
        const rs = raisonSocialeOuRepli(NOM_PRODUIT);
        return complement ? (rs + " · " + String(complement)) : rs;
    }

    /** Titre d'onglet : "Cyber GRC — «Raison sociale»", ou "Cyber GRC" seul. */
    function libelleOnglet() {
        const r = raisonSociale();
        return r ? (NOM_PRODUIT + " — " + r) : NOM_PRODUIT;
    }

    /* =====================================================================
       LOGO — asynchrone, en cache PAR FILIALE ACTIVE
    ===================================================================== */

    /** Filiale pour laquelle `promesseLogo` a été engagée, ou `null`. */
    let filialeEnCache = null;
    /** Promesse en cours ou résolue : rend une URL d'objet, ou `null`. */
    let promesseLogo = null;
    /** Dernière URL d'objet créée, pour la révoquer quand la filiale change. */
    let derniereUrl = null;

    /**
     * Ramène la réponse à un tableau de pièces, tolérant à la forme exacte de
     * l'enveloppe — même motif qu'au `js/modules/pieces.js` : le §31 fige la
     * chaîne et la délivrance, jamais le nom du champ qui porte la liste.
     */
    function normaliserListe(charge) {
        if (Array.isArray(charge)) return charge;
        if (charge && typeof charge === "object") {
            const candidat = ["pieces", "pieces_jointes", "entrees", "items", "resultats"]
                .map(c => charge[c]).find(Array.isArray);
            if (candidat) return candidat;
        }
        return [];
    }

    /** La plus récente pièce délivrable de la liste (analysée saine, hors quarantaine), ou `null`. */
    function plusRecenteDelivrable(pieces) {
        return pieces
            .filter(p => p && typeof p === "object" && p.id &&
                String(p.etat_analyse) === "saine" && p.quarantaine !== true)
            .sort((a, b) => String(b.cree_le || "").localeCompare(String(a.cree_le || "")))[0] || null;
    }

    /**
     * Charge le logo de la filiale active. Ne lève JAMAIS : un droit
     * insuffisant, une route absente, l'absence de tout logo déposé ou un
     * réseau indisponible rendent tous `null` — c'est le repli visible sur la
     * raison sociale, et il ne doit surtout pas ressembler à une erreur de
     * script (aucun `console.error`, jamais de promesse rejetée qui remonte).
     *
     * @returns {Promise<string|null>} une URL d'objet (`blob:`) prête pour un
     *   `<img src>`, ou `null` si rien n'est affichable.
     */
    async function logo() {
        const s = session();
        const filialeId = s ? s.filialeId : null;
        if (!filialeId) return null;
        if (filialeEnCache === filialeId && promesseLogo) return promesseLogo;

        if (filialeEnCache !== filialeId && derniereUrl) {
            try { URL.revokeObjectURL(derniereUrl); } catch (e) { /* déjà révoquée */ }
            derniereUrl = null;
        }
        filialeEnCache = filialeId;

        promesseLogo = (async () => {
            if (typeof Api === "undefined" || !Api.logoFiliale || !Api.telechargerLogoFiliale) return null;
            let pieces;
            try {
                pieces = normaliserListe(await Api.logoFiliale());
            } catch (e) {
                // Route absente sur cette installation, droit insuffisant sur
                // le domaine `administration` (la majorité des profils),
                // session expirée : un repli silencieux, jamais une exception
                // qui remonterait à l'appelant ni un `console.error` qui
                // casserait le « 0 erreur » exigé du banc.
                console.info("Identite.logo() : logo indisponible (" +
                    (e && e.message ? e.message : "cause inconnue") + ").");
                return null;
            }
            const piece = plusRecenteDelivrable(pieces);
            if (!piece) return null;
            let blob;
            try {
                blob = await Api.telechargerLogoFiliale(piece.id);
            } catch (e) {
                console.info("Identite.logo() : téléchargement du logo refusé (" +
                    (e && e.message ? e.message : "cause inconnue") + ").");
                return null;
            }
            // ── LA BARRIÈRE QUE §33.4 EXIGE ──────────────────────────────────
            // Jamais un `<img>` dont le contenu récupéré n'est pas un PNG ou un
            // JPEG CONSTATÉ. Défense en profondeur (§17.5) : le serveur a déjà
            // refusé un SVG au dépôt (`catalogue.ts`, `TYPES_LOGO`) ; ceci ne
            // décide rien à sa place, ça n'affiche pas ce qui échapperait à sa
            // propre règle si, un jour, ce n'était plus vrai.
            if (!blob || TYPES_IMAGE_ADMIS.indexOf(blob.type) === -1) return null;
            const url = URL.createObjectURL(blob);
            derniereUrl = url;
            return url;
        })();
        return promesseLogo;
    }

    /**
     * Complète tous les emplacements `[data-brand-logo]` actuellement dans le
     * DOM avec le logo de la filiale active, s'il y en a un. N'efface JAMAIS
     * le texte de repli déjà affiché à côté : elle ne fait qu'AJOUTER l'image
     * une fois obtenue, sans bloquer le rendu qui l'a précédée.
     */
    function brancherLogos() {
        const cibles = document.querySelectorAll("[data-brand-logo]");
        if (!cibles.length) return;
        logo().then(url => {
            if (!url) return;
            cibles.forEach(img => {
                // La vue a pu changer pendant l'aller-retour réseau.
                if (!document.body.contains(img)) return;
                img.src = url;
                img.alt = raisonSocialeOuRepli("");
                img.hidden = false;
            });
        });
    }

    /**
     * Point d'entrée de l'écran (barre latérale + titre d'onglet) : appelé au
     * démarrage et après chaque bascule de filiale réussie (`js/app.js`).
     * Rien ici n'est mémorisé plus longtemps que la session en cours.
     */
    function brancherEnTete() {
        try { document.title = libelleOnglet(); } catch (e) { /* environnement sans document */ }
        const lien = document.getElementById("brandLink");
        if (lien) lien.setAttribute("aria-label", raisonSocialeOuRepli(NOM_PRODUIT) + " — Tableau de bord");
        const texte = document.getElementById("brandText");
        if (texte) texte.textContent = raisonSocialeOuRepli(NOM_PRODUIT);
        brancherLogos();
    }

    return {
        NOM_PRODUIT,
        raisonSociale, raisonSocialeOuRepli, piedImpression, libelleOnglet,
        logo, brancherLogos, brancherEnTete,
        // Exposé pour le banc d'essai : la garde de type (PNG/JPEG constatés,
        // jamais SVG) se vérifie en la confrontant à un blob forgé, jamais en
        // supposant que le serveur ne se trompera jamais (§17.5).
        contrat: Object.freeze({ typesImageAdmis: TYPES_IMAGE_ADMIS })
    };
})();

window.Identite = Identite;
