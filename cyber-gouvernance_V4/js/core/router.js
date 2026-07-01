// ==========================================
// 📁 router.js (CORRIGÉ - Bug du menu actif)
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

        // ✅ Correction : Mise à jour du menu déclenchée de l'intérieur du routeur
        if (typeof window.updateActiveNav === "function") {
            window.updateActiveNav(path);
        }

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

        app.innerHTML = `
            <section class="page" style="text-align: center; margin-top: 10vh;">
                <div style="font-size: 4rem; margin-bottom: 20px;">🧭</div>
                <h1>Page introuvable</h1>
                <p style="color: var(--text-muted); margin-bottom: 20px;">La page que vous recherchez n'existe pas ou a été déplacée.</p>
                <button onclick="Router.navigateTo('/dashboard')" style="background-color: var(--primary);">
                    Retour au tableau de bord
                </button>
            </section>
        `;
    }

    return {
        init,
        navigateTo
    };
})();