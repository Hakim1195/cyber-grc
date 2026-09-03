// ==========================================
// router.js (CORRIGÉ - Bug du menu actif)
// ==========================================
const Router = (() => {
    let routes = {};

    function init(routeMap) {
        routes = routeMap;

        window.addEventListener("hashchange", () => {
            navigateTo(normalize(location.hash), false);
        });

        document.addEventListener("click", (e) => {
            const link = e.target.closest("a[href^='#/']");
            if (!link) return;

            e.preventDefault();
            const path = normalize(link.getAttribute("href"));
            navigateTo(path, true);
        });
    }

    function normalize(hash) {
        if (!hash || hash === "#" || hash === "#/") return "/dashboard";
        return hash.replace(/^#/, "");
    }

    function navigateTo(path, pushState = true) {
        if (pushState && location.hash !== "#" + path) {
            history.pushState(null, "", "#" + path);
        }

        const toastContainer = document.getElementById("toast-container");
        if (toastContainer) toastContainer.innerHTML = "";

        window.scrollTo(0, 0);

        // Correction : Mise à jour du menu déclenchée de l'intérieur du routeur
        if (typeof window.updateActiveNav === "function") {
            window.updateActiveNav(path);
        }

        resoudre(path);

        /* ── LES DROITS S'APPLIQUENT APRÈS LE RENDU, ET C'EST TOUT LE POINT ──
         *
         * `updateActiveNav` est appelé AVANT que le module ne rende sa vue :
         * il met à jour le menu, le fil d'Ariane et les badges, qui existent
         * déjà. Y brancher la neutralisation des boutons la ferait travailler
         * sur le balisage de l'écran PRÉCÉDENT — elle grisait les boutons de la
         * vue qu'on quitte, et laissait intacts ceux de la vue qu'on ouvre.
         * Mesuré : « Supprimer sélection » restait actif pour un profil en
         * lecture seule.
         *
         * Le seul instant où le balisage de la vue existe est **ici**, après
         * l'appel du module. Le menu, lui, reste traité par `updateActiveNav` :
         * il ne dépend d'aucun rendu.
         */
        if (typeof window.appliquerDroits === "function") window.appliquerDroits(path);
    }

    /** Appelle le module de la route, ou l'écran « introuvable ». */
    function resoudre(path) {
        for (const route in routes) {
            if (route.includes("/:")) {
                const base = route.split("/:")[0];
                if (path.startsWith(base + "/") && path.length > base.length + 1) {
                    const param = path.slice(base.length + 1);
                    routes[route](param);
                    return;
                }
            }
        }

        if (routes[path]) {
            routes[path]();
            return;
        }

        renderNotFound();
    }

    function renderNotFound() {
        const app = document.getElementById("app");
        if (!app) return;

        // Le gestionnaire est branché en JavaScript, pas par un attribut `onclick`
        // en ligne : la politique de sécurité de contenu du frontal (`script-src
        // 'self'`, sans `unsafe-inline`) refuse les gestionnaires en ligne, qui
        // deviennent alors inertes en silence — constat M-6 de la porte S2.
        app.innerHTML = `
            <section class="page" style="text-align: center; margin-top: 10vh;">
                <div style="font-size: 4rem; margin-bottom: 20px;"></div>
                <h1>Page introuvable</h1>
                <p style="color: var(--text-muted); margin-bottom: 20px;">La page que vous recherchez n'existe pas ou a été déplacée.</p>
                <button id="retour-tableau-de-bord" style="background-color: var(--primary);">
                    Retour au tableau de bord
                </button>
            </section>
        `;
        const retour = document.getElementById("retour-tableau-de-bord");
        if (retour) retour.onclick = () => navigateTo("/dashboard");
    }

    return {
        init,
        navigateTo
    };
})();