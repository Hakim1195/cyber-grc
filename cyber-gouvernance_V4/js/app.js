// Emplacement : js/app.js
// Nom du fichier : app.js

document.addEventListener("DOMContentLoaded", () => {
    // Coffre optionnel : si une protection par mot de passe est active, l'app ne
    // démarre qu'après déverrouillage. Sinon, démarrage immédiat (clé nulle).
    Vault.boot(async (dek) => {
        DataStore.setKey(dek);
        await DataStore.init();
        await startApp();
    });
});

async function startApp() {

    /* =========================
       SÉLECTEUR DE CONTEXTE (CLIENT)
    ========================== */
    if (!localStorage.getItem("cyber-context")) {
        localStorage.setItem("cyber-context", "global");
    }
    renderContextSelector();

    /* =========================
       CONFIGURATION DES ROUTES
    ========================== */
    Router.init({
        "/dashboard": () => DashboardModule.render(),
        "/synthese": () => SyntheseModule.render(),

        "/clients": () => { if (typeof ClientsModule !== "undefined") ClientsModule.renderList(); },
        "/clients/:id": (id) => { if (typeof ClientsModule !== "undefined") ClientsModule.renderDetail(id); },

        "/actifs": () => ActifsModule.renderList(),
        "/actifs/:id": (id) => ActifsModule.renderDetail(id),

        "/risques": () => RisquesModule.renderList(),
        "/risques/:id": (id) => RisquesModule.renderDetail(id),
        "/matrice": () => MatriceModule.render(),

        "/exigences": () => ExigencesModule.renderList(),
        "/exigences/:id": (id) => ExigencesModule.renderDetail(id),

        "/referentiels": () => { if (typeof ReferentielsModule !== "undefined") ReferentielsModule.renderList(); },
        "/referentiels/:id": (id) => { if (typeof ReferentielsModule !== "undefined") ReferentielsModule.renderDetail(id); },

        "/mesures": () => { if (typeof MesuresModule !== "undefined") MesuresModule.renderList(); },
        "/mesures/:id": (id) => { if (typeof MesuresModule !== "undefined") MesuresModule.renderDetail(id); },

        "/couverture": () => { if (typeof ConformiteModule !== "undefined") ConformiteModule.renderCouverture(); },
        "/soa/:id": (id) => { if (typeof ConformiteModule !== "undefined") ConformiteModule.renderSoa(id); },

        "/incidents": () => { if (typeof IncidentsModule !== "undefined") IncidentsModule.renderList(); },
        "/incidents/:id": (id) => { if (typeof IncidentsModule !== "undefined") IncidentsModule.renderDetail(id); },

        "/documents": () => { if (typeof DocumentsModule !== "undefined") DocumentsModule.renderList(); },
        "/documents/:id": (id) => { if (typeof DocumentsModule !== "undefined") DocumentsModule.renderDetail(id); },

        "/actions": () => ActionsModule.renderList(),
        "/actions/:id": (id) => ActionsModule.renderDetail(id),

        // NOUVELLES ROUTES RÉSILIENCE SÉPARÉES
        "/bia": () => { if (typeof BiaModule !== "undefined") BiaModule.renderList(); },
        "/bia/:id": (id) => { if (typeof BiaModule !== "undefined") BiaModule.renderDetail(id); },

        "/crise": () => { if (typeof CriseModule !== "undefined") CriseModule.renderList(); },
        "/crise/:id": (id) => { if (typeof CriseModule !== "undefined") CriseModule.renderDetail(id); },

        "/pra": () => { if (typeof PraScenariosModule !== "undefined") PraScenariosModule.renderList(); },
        "/pra/:id": (id) => { if (typeof PraScenariosModule !== "undefined") PraScenariosModule.renderDetail(id); },

        "/mco": () => { if (typeof PraMcoModule !== "undefined") PraMcoModule.renderList(); },
        "/mco/:id": (id) => { if (typeof PraMcoModule !== "undefined") PraMcoModule.renderDetail(id); },

        "/tests": () => { if (typeof PraTestsModule !== "undefined") PraTestsModule.renderList(); },
        "/tests/:id": (id) => { if (typeof PraTestsModule !== "undefined") PraTestsModule.renderDetail(id); },

        "/prestataires": () => { if (typeof PraPrestatairesModule !== "undefined") PraPrestatairesModule.renderList(); },
        "/prestataires/:id": (id) => { if (typeof PraPrestatairesModule !== "undefined") PraPrestatairesModule.renderDetail(id); },

	"/audits": () => { if (typeof AuditsModule !== "undefined") AuditsModule.renderList(); },
	"/audits/:id": (id) => { if (typeof AuditsModule !== "undefined") AuditsModule.renderAuditDetail(id); },

        "/settings": () => { if (typeof SettingsModule !== "undefined") SettingsModule.render(); }
    });

    /* =========================
       LANCEMENT INITIAL
    ========================== */
    const initialRoute = location.hash ? location.hash.replace(/^#/, "") : "/dashboard";
    Router.navigateTo(initialRoute, false);

    /* =========================
       RAPPEL DE SAUVEGARDE
    ========================== */
    if (typeof BackupService !== "undefined") BackupService.renderReminder();

    /* =========================
       AIDE PÉDAGOGIQUE + MENU MOBILE
    ========================== */
    if (typeof Help !== "undefined") Help.init();
    setupMobileMenu();
}

/* =========================
   MENU MOBILE (off-canvas)
========================= */
function setupMobileMenu() {
    const toggle = document.getElementById("menu-toggle");
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!toggle || !sidebar || !backdrop) return;

    const open = () => { sidebar.classList.add("open"); backdrop.classList.add("show"); };
    const close = () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); };

    toggle.onclick = () => { sidebar.classList.contains("open") ? close() : open(); };
    backdrop.onclick = close;
    // Fermer après un clic sur un lien de navigation (mobile)
    sidebar.querySelectorAll("a[href^='#/']").forEach(a => a.addEventListener("click", close));
}

/* =========================
   FIL D'ARIANE
========================= */
const ROUTE_META = {
    "/dashboard":    { s: "Pilotage",   t: "Tableau de bord" },
    "/synthese":     { s: "Pilotage",   t: "Synthèse Direction" },
    "/actions":      { s: "Pilotage",   t: "Plan d'actions" },
    "/incidents":    { s: "Risques",    t: "Incidents" },
    "/documents":    { s: "Conformité", t: "Gestion documentaire" },
    "/risques":      { s: "Risques",    t: "Risques (EBIOS)" },
    "/matrice":      { s: "Risques",    t: "Matrice des risques" },
    "/actifs":       { s: "Risques",    t: "Actifs critiques" },
    "/exigences":    { s: "Conformité", t: "Exigences (ISO/NIS2)" },
    "/referentiels": { s: "Conformité", t: "Référentiels" },
    "/mesures":      { s: "Conformité", t: "Mesures de sécurité" },
    "/couverture":   { s: "Conformité", t: "Couverture croisée" },
    "/soa":          { s: "Conformité", t: "Déclaration d'applicabilité" },
    "/clients":      { s: "Conformité", t: "Donneurs d'ordre" },
    "/audits":       { s: "Conformité", t: "Contrôles & Audits" },
    "/bia":          { s: "Continuité", t: "BIA (Impact Métier)" },
    "/crise":        { s: "Continuité", t: "Cellule de Crise" },
    "/pra":          { s: "Continuité", t: "Scénarios PCA/PRA" },
    "/mco":          { s: "Continuité", t: "Actions Préalables (MCO)" },
    "/tests":        { s: "Continuité", t: "Historique des Tests" },
    "/prestataires": { s: "Continuité", t: "Prestataires & Tiers" },
    "/settings":     { s: "Administration", t: "Paramètres & Sauvegardes" }
};

window.renderBreadcrumb = function(route) {
    const el = document.getElementById("breadcrumb");
    if (!el) return;
    const segs = route.split("/").filter(Boolean);
    const base = "/" + (segs[0] || "dashboard");
    const meta = ROUTE_META[base];
    if (!meta) { el.innerHTML = ""; return; }
    const detail = segs.length > 1 ? " / <b>Fiche</b>" : "";
    el.innerHTML = `${meta.s} / <b>${meta.t}</b>${detail}`;
};

/* =========================
   GESTION DU SÉLECTEUR DE CLIENT
========================= */
window.renderContextSelector = function() {
    const sidebarHeader = document.querySelector(".sidebar-header");
    if (!sidebarHeader) return;

    const existing = document.getElementById("context-selector-container");
    if (existing) existing.remove();

    const clients = DataStore.getClients();
    const currentContext = localStorage.getItem("cyber-context");

    const container = document.createElement("div");
    container.id = "context-selector-container";

    let optionsHtml = `<option value="global" style="color: #333; background: #fff;" ${currentContext === "global" ? "selected" : ""}>Vue Globale (Interne + Tous clients)</option>`;
    clients.forEach(c => {
        optionsHtml += `<option value="${c.id}" style="color: #333; background: #fff;" ${currentContext === c.id ? "selected" : ""}>${c.nom}</option>`;
    });

    container.innerHTML = `
        <div class="sidebar-divider">Périmètre Actif</div>
        <select id="context-selector" style="width: 100%; padding: 6px; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; font-size: 0.85rem; cursor: pointer; outline: none;">
            ${optionsHtml}
        </select>
    `;

    sidebarHeader.appendChild(container);

    document.getElementById("context-selector").addEventListener("change", (e) => {
        localStorage.setItem("cyber-context", e.target.value);
        if (window.showToast) window.showToast("Périmètre de travail mis à jour.", "info");
        Router.navigateTo(location.hash.replace(/^#/, ""), false);
    });
};

/* =========================
   GESTION DU MENU ACTIF
========================= */
window.updateActiveNav = function(route) {
    const segments = route.split("/").filter(Boolean);
    const baseRoute = "/" + (segments[0] || "dashboard");

    document.querySelectorAll(".main-nav a[data-route]").forEach(link => {
        const linkRoute = link.getAttribute("data-route");
        if (linkRoute === baseRoute) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });

    if (window.renderBreadcrumb) window.renderBreadcrumb(route);
};

/* =========================
   UTILITAIRE : TOASTS
========================= */
window.showToast = function(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};