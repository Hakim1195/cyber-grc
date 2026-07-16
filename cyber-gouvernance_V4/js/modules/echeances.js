// Emplacement : js/modules/echeances.js
// Nom du fichier : echeances.js
//
// Module « Échéancier » : vue transversale et consolidée de toutes les échéances du
// logiciel (plan d'actions, MCO, revues documentaires, déclarations d'incidents, audits,
// revues de direction). S'appuie sur l'agrégateur `window.Echeances` (lecture seule).
// Chaque ligne renvoie vers la fiche d'origine (traçabilité).

const EcheancesModule = (() => {

    // État de filtrage (conservé entre les rafraîchissements de la liste).
    let filterType = "all";
    let filterUrgent = false;
    let filterSearch = "";

    const TYPES = [
        { key: "action", label: "Plan d'actions" },
        { key: "mco", label: "Actions MCO" },
        { key: "document", label: "Revues documentaires" },
        { key: "incident", label: "Déclarations incident" },
        { key: "audit", label: "Audits" },
        { key: "revue", label: "Revues de direction" }
    ];

    const BUCKETS = [
        { key: "retard", label: "En retard", color: "var(--color-danger)" },
        { key: "aujourdhui", label: "Aujourd'hui", color: "var(--color-danger)" },
        { key: "semaine", label: "Cette semaine", color: "var(--color-warning)" },
        { key: "mois", label: "Ce mois-ci", color: "var(--color-info)" },
        { key: "avenir", label: "Plus tard", color: "var(--text-muted)" },
        { key: "indetermine", label: "Sans date", color: "var(--text-muted)" }
    ];

    // Pastille d'urgence (couleurs sémantiques : rouge = en retard/aujourd'hui, orange = proche).
    function urgencyBadge(it) {
        const j = it.jours;
        if (j === null || j === undefined) return `<span class="status status-non-applicable">Sans date</span>`;
        if (j < 0) return `<span class="status status-non-conforme">En retard · ${-j} j</span>`;
        if (j === 0) return `<span class="status status-non-conforme">Aujourd'hui</span>`;
        if (j <= 7) return `<span class="status status-partiellement-conforme">J‑${j}</span>`;
        if (j <= 31) return `<span class="status status-partiellement-conforme">J‑${j}</span>`;
        return `<span class="status status-non-applicable">J‑${j}</span>`;
    }

    function fmtDate(iso) {
        return iso ? new Date(iso + "T00:00:00").toLocaleDateString('fr-FR') : "—";
    }

    function rowHtml(it) {
        const titre = it.titre ? escapeHtml(it.titre) : "(sans intitulé)";
        const sub = escapeHtml(it.typeLabel) + (it.sousTitre ? " · " + escapeHtml(it.sousTitre) : "");
        return `
            <a class="ech-row" href="${it.route}">
                <span class="ech-urg">${urgencyBadge(it)}</span>
                <span class="ech-main">
                    <span class="ech-title">${titre}</span>
                    <span class="ech-sub">${sub}</span>
                </span>
                <span class="ech-date">${fmtDate(it.date)}</span>
            </a>`;
    }

    // Applique les filtres courants et (re)génère la liste groupée + l'état des boutons.
    function applyFilters() {
        const all = Echeances.collect();
        const q = filterSearch.trim().toLowerCase();
        const filtered = all.filter(it => {
            if (filterType !== "all" && it.type !== filterType) return false;
            if (filterUrgent && !(it.jours !== null && it.jours <= 7)) return false;
            if (q) {
                const hay = (it.titre + " " + it.typeLabel + " " + (it.sousTitre || "")).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });

        let html = "";
        BUCKETS.forEach(b => {
            const inB = filtered.filter(it => Echeances.bucketFor(it.jours) === b.key);
            if (!inB.length) return;
            html += `
                <div class="ech-group">
                    <h3 class="ech-group-h" style="border-left:4px solid ${b.color};">${b.label} <span class="ech-count">${inB.length}</span></h3>
                    ${inB.map(rowHtml).join("")}
                </div>`;
        });
        if (!html) {
            html = `<p class="chart-empty" style="text-align:center; color:var(--text-muted); padding:24px;">Aucune échéance ne correspond aux filtres.</p>`;
        }

        const list = document.getElementById("ech-list");
        if (list) list.innerHTML = html;

        // État actif des boutons de type.
        document.querySelectorAll(".ech-fbtn[data-type]").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-type") === filterType);
        });
    }

    function counterHtml(n, label, color) {
        return `
            <div class="ech-counter">
                <div class="n" style="color:${color};">${n}</div>
                <div class="l">${label}</div>
            </div>`;
    }

    function render() {
        const app = document.getElementById("app");
        const c = Echeances.counts();

        const typeButtons = [`<button class="ech-fbtn active" data-type="all">Tous</button>`]
            .concat(TYPES.map(t => `<button class="ech-fbtn" data-type="${t.key}">${t.label}</button>`))
            .join("");

        const todayStr = new Date().toLocaleDateString('fr-FR');
        app.innerHTML = `
            <section class="page">
                <div class="print-only" style="margin-bottom:12px;">
                    <h1 style="margin:0 0 4px;">Échéancier</h1>
                    <p style="margin:0; color:#000;">État au ${todayStr} — ${c.total} échéance(s), dont ${c.retard} en retard.</p>
                </div>
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Échéancier ${Help.tip("Vue transversale de toutes les obligations datées du logiciel : échéances du plan d'actions, actions MCO, revues documentaires, déclarations d'incidents (NIS2/RGPD), audits et revues de direction. Chaque ligne renvoie vers sa fiche d'origine.")}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Toutes les échéances du dispositif, regroupées par urgence</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="window.print()" class="btn-secondary">Imprimer</button>
                    </div>
                </div>

                <div class="ech-counters no-print">
                    ${counterHtml(c.retard, "En retard", "var(--color-danger)")}
                    ${counterHtml(c.aujourdhui + c.semaine, "Sous 7 jours", "var(--color-warning)")}
                    ${counterHtml(c.mois, "Ce mois-ci", "var(--color-info)")}
                    ${counterHtml(c.total, "Total à suivre", "var(--text-main)")}
                </div>

                <div class="ech-filters no-print">
                    ${typeButtons}
                    <label style="display:inline-flex; align-items:center; gap:6px; margin-left:auto; font-size:0.85rem; color:var(--text-muted); cursor:pointer;">
                        <input type="checkbox" id="ech-urgent"> Urgents seulement (≤ 7 j)
                    </label>
                    <input type="search" id="ech-search" placeholder="Rechercher..." style="padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.85rem;">
                </div>

                <div id="ech-list"></div>
            </section>
        `;

        applyFilters();

        // Filtres par type.
        document.querySelectorAll(".ech-fbtn[data-type]").forEach(btn => {
            btn.addEventListener("click", () => { filterType = btn.getAttribute("data-type"); applyFilters(); });
        });
        // Urgents seulement.
        const urgent = document.getElementById("ech-urgent");
        if (urgent) { urgent.checked = filterUrgent; urgent.addEventListener("change", () => { filterUrgent = urgent.checked; applyFilters(); }); }
        // Recherche (conserve le focus : on ne re-rend que la liste).
        const search = document.getElementById("ech-search");
        if (search) { search.value = filterSearch; search.addEventListener("input", () => { filterSearch = search.value; applyFilters(); }); }
    }

    return { render };
})();
