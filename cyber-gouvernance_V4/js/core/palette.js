/**
 * palette.js — LA RECHERCHE GLOBALE À L'ÉCRAN (lot L17, action A3)
 *
 * `Ctrl+K` (ou `Cmd+K`) ouvre une palette ; on tape, on voit, on va.
 *
 * ── ⚠️ CE FICHIER EST DÉLIBÉRÉMENT MINCE, ET IL FAUT SAVOIR POURQUOI ────────
 *
 * L'utilisateur a arbitré le 15/09/2026 : **le frontend sera refait**. Tout ce
 * qui est présentation ici sera jeté. On livre donc le strict nécessaire pour
 * que la capacité soit utilisable et éprouvée de bout en bout — pas une ligne de
 * finition visuelle de plus. **La substance est côté serveur**
 * (`backend/src/recherche/`), où elle survivra à la réécriture : le
 * cloisonnement par la RLS, la borne des droits, la neutralisation des jokers,
 * le plafond de volume et le budget de trace.
 *
 * ── Trois décisions qui, elles, ne sont pas de la présentation ──────────────
 *
 *  1. **Aucun filtrage côté navigateur.** La palette affiche ce que le serveur
 *     rend, et rien d'autre. Filtrer ici donnerait l'illusion d'un
 *     cloisonnement qui ne tiendrait pas — c'est exactement la faute que la
 *     route évite en laissant la RLS couper.
 *
 *  2. **Le terme n'est pas envoyé à chaque frappe.** Un délai d'inactivité de
 *     200 ms, et jamais moins de deux signes. Sans cela, écrire « rançongiciel »
 *     déclencherait douze recherches, donc douze fois des lignes rendues — et le
 *     budget de trace du serveur (partagé avec le sondage) prendrait pour une
 *     extraction ce qui n'est qu'une saisie.
 *
 *  3. **Aucun gestionnaire en ligne.** La politique de sécurité de contenu du
 *     vhost les bloque, et l'application a été livrée un temps sans fonctionner
 *     pour cette raison exacte.
 */

const Palette = (() => {
    "use strict";

    /** Délai d'inactivité avant d'interroger le serveur. Voir la décision 2. */
    const DELAI_FRAPPE_MS = 200;

    /**
     * Où mène un résultat, par entité.
     *
     * ⚠️ **Cette liste est écrite à la main, et c'est un choix assumé** — cas (b)
     * du `CLAUDE.md` §3 : son incomplétude n'ouvre rien et ne détruit rien, elle
     * rend un résultat NON CLIQUABLE, et le résultat s'affiche quand même avec
     * le nom de son entité. La dégradation est donc visible à l'écran, pas
     * silencieuse. ⚠️ Elle ne peut pas être découverte : le serveur rend un nom
     * d'ENTITÉ, et la correspondance avec une route de la SPA n'existe nulle
     * part ailleurs — c'est une décision de navigation, pas une donnée.
     */
    const ROUTES = {
        risques: "/risques",
        actifs: "/actifs",
        processus: "/bia",
        actions: "/actions",
        incidents: "/incidents",
        documents: "/documents",
        clients: "/clients",
        personnes: "/personnel",
        prestataires: "/prestataires",
        audits: "/audits",
        revues: "/audits",
        exigences: "/exigences",
        mesures: "/mesures",
        traitements: "/rgpd",
        crise: "/crise",
        scenarios_pra: "/pra",
        tests_pra: "/tests",
        mco_actions: "/mco",
        evaluations: "/referentiels",
        mappings: "/mapping",
        risque_catalogue: "/socle",
        referentiels_actifs: "/referentiels-actifs"
    };

    let racine = null;
    let champ = null;
    let corps = null;
    let minuteur = null;
    let requeteEnCours = 0;

    function esc(v) {
        return (window.escapeHtml || String)(v == null ? "" : String(v));
    }

    function construire() {
        if (racine) return;
        racine = document.createElement("div");
        racine.className = "palette-fond no-print";
        racine.hidden = true;
        racine.innerHTML =
            '<div class="palette" role="dialog" aria-modal="true" aria-label="Recherche globale">' +
            '  <input type="search" class="palette-champ" id="palette-champ" autocomplete="off"' +
            '         placeholder="Rechercher un risque, un actif, un document…" aria-label="Rechercher">' +
            '  <div class="palette-corps" id="palette-corps" role="listbox"></div>' +
            '  <div class="palette-pied">Entrée pour ouvrir · Échap pour fermer</div>' +
            "</div>";
        document.body.appendChild(racine);
        champ = racine.querySelector("#palette-champ");
        corps = racine.querySelector("#palette-corps");

        // Cliquer HORS de la palette la ferme ; cliquer dedans, non.
        racine.addEventListener("click", function (e) { if (e.target === racine) fermer(); });
        champ.addEventListener("input", function () { programmer(champ.value); });
        champ.addEventListener("keydown", function (e) {
            if (e.key === "Escape") { fermer(); return; }
            if (e.key === "Enter") {
                const premier = corps.querySelector(".palette-item[data-href]");
                if (premier) aller(premier.getAttribute("data-href"));
            }
        });
    }

    function ouvrir() {
        construire();
        racine.hidden = false;
        champ.value = "";
        corps.innerHTML = '<div class="palette-vide">Tapez au moins deux caractères.</div>';
        champ.focus();
    }

    function fermer() {
        if (racine) racine.hidden = true;
    }

    function aller(href) {
        fermer();
        window.location.hash = "#" + href;
    }

    function programmer(terme) {
        if (minuteur) window.clearTimeout(minuteur);
        minuteur = window.setTimeout(function () { interroger(terme); }, DELAI_FRAPPE_MS);
    }

    function interroger(terme) {
        const mien = ++requeteEnCours;
        if (!terme || terme.trim().length < 2) {
            corps.innerHTML = '<div class="palette-vide">Tapez au moins deux caractères.</div>';
            return;
        }
        Api.recherche(terme).then(function (reponse) {
            // Une réponse arrivée APRÈS une frappe plus récente est périmée : la
            // rendre ferait clignoter des résultats qui ne correspondent plus à
            // ce qui est tapé.
            if (mien !== requeteEnCours) return;
            rendre(reponse);
        }).catch(function (e) {
            if (mien !== requeteEnCours) return;
            corps.innerHTML = '<div class="palette-vide">' +
                esc(e && e.message ? e.message : "La recherche n’a pas abouti.") + "</div>";
        });
    }

    function rendre(reponse) {
        const resultats = (reponse && reponse.resultats) || [];
        if (!resultats.length) {
            corps.innerHTML = '<div class="palette-vide">Aucun résultat.</div>';
            return;
        }
        let html = resultats.map(function (r) {
            const route = ROUTES[r.entite];
            const href = route ? route + "/" + r.id : null;
            // Sans route connue, on affiche quand même : la dégradation est
            // visible, et l'utilisateur sait au moins où l'enregistrement vit.
            return '<div class="palette-item"' + (href ? ' data-href="' + esc(href) + '"' : "") +
                ' role="option" tabindex="0">' +
                '<span class="palette-libelle">' + esc(r.libelle) + "</span>" +
                '<span class="palette-entite">' + esc(r.entite) + "</span></div>";
        }).join("");
        if (reponse.motif) html += '<div class="palette-vide">' + esc(reponse.motif) + "</div>";
        corps.innerHTML = html;

        corps.querySelectorAll(".palette-item[data-href]").forEach(function (item) {
            // ⚠️ L'identifiant est LU DANS L'ATTRIBUT au moment du clic, jamais
            // capturé en chaîne dans la fermeture : le serveur réattribue les
            // identifiants à la création, et une fermeture qui a capturé
            // l'ancien viserait un enregistrement disparu, EN SILENCE
            // (`CLAUDE.md` §3).
            item.addEventListener("click", function () { aller(item.getAttribute("data-href")); });
            item.addEventListener("keydown", function (e) {
                if (e.key === "Enter") aller(item.getAttribute("data-href"));
            });
        });
    }

    function installer() {
        document.addEventListener("keydown", function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
                e.preventDefault();
                if (racine && !racine.hidden) fermer(); else ouvrir();
            }
        });
    }

    return { installer, ouvrir, fermer };
})();

window.Palette = Palette;
