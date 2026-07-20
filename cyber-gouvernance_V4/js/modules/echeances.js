// Emplacement : js/modules/echeances.js
// Nom du fichier : echeances.js
//
// Module « Échéancier » : vue transversale et consolidée de toutes les échéances du
// logiciel (plan d'actions, MCO, revues documentaires, déclarations d'incidents, audits,
// revues de direction). S'appuie sur l'agrégateur `window.Echeances` (lecture seule).
// Deux vues : liste groupée par urgence et calendrier mensuel. Export Excel & .ICS.
// Chaque ligne / pastille renvoie vers la fiche d'origine (traçabilité).

const EcheancesModule = (() => {

    // État de filtrage et d'affichage (conservé entre les rafraîchissements).
    let filterType = "all";
    let filterUrgent = false;
    let filterSearch = "";
    let viewMode = "list";              // "list" | "calendar"
    let calYear = null, calMonth = null; // mois affiché en vue calendrier

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
    const BUCKET_LABEL = { retard: "En retard", aujourdhui: "Aujourd'hui", semaine: "Cette semaine", mois: "Ce mois-ci", avenir: "Plus tard", indetermine: "Sans date" };

    const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

    /* ---------- Helpers d'affichage ---------- */

    // Pastille d'urgence (couleurs sémantiques : rouge = en retard/aujourd'hui, orange = proche).
    function urgencyBadge(it) {
        const j = it.jours;
        if (j === null || j === undefined) return `<span class="status status-non-applicable">Sans date</span>`;
        if (j < 0) return `<span class="status status-non-conforme">En retard · ${-j} j</span>`;
        if (j === 0) return `<span class="status status-non-conforme">Aujourd'hui</span>`;
        if (j <= 31) return `<span class="status status-partiellement-conforme">J‑${j}</span>`;
        return `<span class="status status-non-applicable">J‑${j}</span>`;
    }

    // Couleur d'urgence pour une pastille de calendrier.
    function urgencyColor(j) {
        if (j === null || j === undefined) return "var(--text-muted)";
        if (j <= 0) return "var(--color-danger)";
        if (j <= 7) return "var(--color-warning)";
        if (j <= 31) return "var(--color-info)";
        return "var(--accent)";
    }

    function fmtDate(iso) {
        return iso ? new Date(iso + "T00:00:00").toLocaleDateString('fr-FR') : "—";
    }

    function pad2(n) { return String(n).padStart(2, "0"); }

    // Applique les filtres courants à l'ensemble des échéances.
    function getFiltered() {
        const all = Echeances.collect();
        const q = filterSearch.trim().toLowerCase();
        return all.filter(it => {
            if (filterType !== "all" && it.type !== filterType) return false;
            if (filterUrgent && !(it.jours !== null && it.jours <= 7)) return false;
            if (q) {
                const hay = (it.titre + " " + it.typeLabel + " " + (it.sousTitre || "")).toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
    }

    /* ---------- Vue LISTE ---------- */

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

    function listBody(filtered) {
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
        if (!html) html = `<p class="chart-empty" style="text-align:center; color:var(--text-muted); padding:24px;">Aucune échéance ne correspond aux filtres.</p>`;
        return html;
    }

    /* ---------- Vue CALENDRIER ---------- */

    function calendarBody(filtered) {
        // Regroupe les échéances datées par jour (ISO yyyy-mm-dd).
        const byDate = {};
        filtered.forEach(it => {
            if (!it.date || it.jours === null) return;
            (byDate[it.date] = byDate[it.date] || []).push(it);
        });
        const sansDate = filtered.filter(it => it.jours === null).length;

        const first = new Date(calYear, calMonth, 1);
        const monthTitle = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const offset = (first.getDay() + 6) % 7;                 // lundi = 0
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

        const now = new Date(); now.setHours(0, 0, 0, 0);

        let cells = "";
        for (let i = 0; i < offset; i++) cells += `<div class="ech-cal-cell empty"></div>`;
        for (let day = 1; day <= daysInMonth; day++) {
            const iso = calYear + "-" + pad2(calMonth + 1) + "-" + pad2(day);
            const isToday = (calYear === now.getFullYear() && calMonth === now.getMonth() && day === now.getDate());
            const items = byDate[iso] || [];
            const shown = items.slice(0, 3);
            const chips = shown.map(it =>
                `<a class="ech-chip" href="${it.route}" style="background:${urgencyColor(it.jours)};" title="${escapeHtml(it.typeLabel)} — ${escapeHtml(it.titre || "")}">${escapeHtml(it.titre || it.typeLabel)}</a>`
            ).join("");
            const more = items.length > shown.length ? `<span class="ech-more">+${items.length - shown.length} autre(s)</span>` : "";
            cells += `
                <div class="ech-cal-cell${isToday ? " today" : ""}">
                    <span class="ech-cal-daynum">${day}</span>
                    ${chips}${more}
                </div>`;
        }

        const dows = DOW.map(d => `<div class="ech-cal-dow">${d}</div>`).join("");
        const note = sansDate > 0 ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">${sansDate} échéance(s) sans date ne figurent pas au calendrier (visibles en vue liste).</p>` : "";

        return `
            <div class="ech-cal-head no-print">
                <button class="btn-secondary" id="ech-cal-prev" aria-label="Mois précédent">‹</button>
                <span class="ech-cal-title">${monthTitle}</span>
                <button class="btn-secondary" id="ech-cal-next" aria-label="Mois suivant">›</button>
                <button class="btn-secondary" id="ech-cal-today" style="margin-left:8px;">Aujourd'hui</button>
            </div>
            <div class="ech-cal-grid">
                ${dows}
                ${cells}
            </div>
            ${note}`;
    }

    /* ---------- Corps (liste ou calendrier) ---------- */

    function renderBody() {
        const filtered = getFiltered();
        const body = document.getElementById("ech-body");
        if (!body) return;
        body.innerHTML = viewMode === "calendar" ? calendarBody(filtered) : listBody(filtered);

        // (Re)câblage des boutons de navigation du calendrier (recréés à chaque rendu).
        if (viewMode === "calendar") {
            const prev = document.getElementById("ech-cal-prev");
            const next = document.getElementById("ech-cal-next");
            const tod = document.getElementById("ech-cal-today");
            if (prev) prev.onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderBody(); };
            if (next) next.onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderBody(); };
            if (tod) tod.onclick = () => { const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); renderBody(); };
        }

        // État actif des boutons de vue.
        document.querySelectorAll(".ech-vbtn[data-view]").forEach(b => b.classList.toggle("active", b.getAttribute("data-view") === viewMode));
    }

    /* ---------- Exports ---------- */

    // Lignes du tableur (pure → testable sans déclencher de téléchargement).
    function buildRows() {
        return Echeances.collect().map(it => ({
            "Type": it.typeLabel,
            "Intitulé": it.titre || "",
            "Détail": it.sousTitre || "",
            "Échéance": it.date ? fmtDate(it.date) : "",
            "Jours restants": it.jours === null ? "" : it.jours,
            "Urgence": BUCKET_LABEL[Echeances.bucketFor(it.jours)] || "",
            "Statut": it.statut || ""
        }));
    }

    function exportExcel() {
        if (typeof XLSX === "undefined") { alert("La bibliothèque d'export Excel (SheetJS) n'est pas chargée."); return; }
        const rows = buildRows();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Message": "Aucune échéance" }]);
        ws['!cols'] = [{ wch: 22 }, { wch: 42 }, { wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, "Échéancier");
        XLSX.writeFile(wb, "Echeancier_" + new Date().toISOString().slice(0, 10) + ".xlsx");
        if (window.showToast) window.showToast("Échéancier exporté (Excel).", "success");
    }

    // Construit le contenu VCALENDAR (pure → testable). Une échéance datée = un événement « journée ».
    function buildICS() {
        const items = Echeances.collect().filter(it => it.date && it.jours !== null);
        const esc = s => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
        const now = new Date();
        const dstamp = now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + "T" +
            pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";
        const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cyber GRC//Echeancier//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
        items.forEach((it, idx) => {
            const ymd = it.date.replace(/-/g, "");
            const end = new Date(it.date + "T00:00:00"); end.setDate(end.getDate() + 1);
            const ymdEnd = end.getFullYear() + pad2(end.getMonth() + 1) + pad2(end.getDate());
            lines.push("BEGIN:VEVENT");
            lines.push("UID:grc-ech-" + idx + "-" + ymd + "@cyber-grc");
            lines.push("DTSTAMP:" + dstamp);
            lines.push("DTSTART;VALUE=DATE:" + ymd);
            lines.push("DTEND;VALUE=DATE:" + ymdEnd);
            lines.push("SUMMARY:" + esc("[" + it.typeLabel + "] " + (it.titre || "")));
            lines.push("DESCRIPTION:" + esc((it.sousTitre || "") + (it.statut ? " — " + it.statut : "")));
            lines.push("END:VEVENT");
        });
        lines.push("END:VCALENDAR");
        return lines.join("\r\n");
    }

    function exportICS() {
        const count = Echeances.collect().filter(it => it.date && it.jours !== null).length;
        if (!count) { alert("Aucune échéance datée à exporter."); return; }
        const blob = new Blob([buildICS()], { type: "text/calendar;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Echeancier_" + new Date().toISOString().slice(0, 10) + ".ics";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (window.showToast) window.showToast(count + " échéance(s) exportée(s) (.ics).", "success");
    }

    /* ---------- Rendu principal ---------- */

    function counterHtml(n, label, color) {
        return `<div class="ech-counter"><div class="n" style="color:${color};">${n}</div><div class="l">${label}</div></div>`;
    }

    function render() {
        const app = document.getElementById("app");
        const c = Echeances.counts();
        if (calYear === null) { const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); }

        const typeButtons = [`<button class="ech-fbtn${filterType === "all" ? " active" : ""}" data-type="all">Tous</button>`]
            .concat(TYPES.map(t => `<button class="ech-fbtn${filterType === t.key ? " active" : ""}" data-type="${t.key}">${t.label}</button>`))
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
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <button id="ech-export-xlsx" class="btn-secondary">Excel</button>
                        <button id="ech-export-ics" class="btn-secondary">Agenda (.ics)</button>
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
                    <span class="ech-viewtoggle">
                        <button class="ech-vbtn${viewMode === "list" ? " active" : ""}" data-view="list">Liste</button>
                        <button class="ech-vbtn${viewMode === "calendar" ? " active" : ""}" data-view="calendar">Calendrier</button>
                    </span>
                    ${typeButtons}
                    <label style="display:inline-flex; align-items:center; gap:6px; margin-left:auto; font-size:0.85rem; color:var(--text-muted); cursor:pointer;">
                        <input type="checkbox" id="ech-urgent"> Urgents seulement (≤ 7 j)
                    </label>
                    <input type="search" id="ech-search" placeholder="Rechercher..." style="padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.85rem;">
                </div>

                <div id="ech-body"></div>
            </section>
        `;

        renderBody();

        // Vue liste / calendrier.
        document.querySelectorAll(".ech-vbtn[data-view]").forEach(btn => {
            btn.addEventListener("click", () => { viewMode = btn.getAttribute("data-view"); renderBody(); });
        });
        // Filtres par type.
        document.querySelectorAll(".ech-fbtn[data-type]").forEach(btn => {
            btn.addEventListener("click", () => {
                filterType = btn.getAttribute("data-type");
                document.querySelectorAll(".ech-fbtn[data-type]").forEach(b => b.classList.toggle("active", b === btn));
                renderBody();
            });
        });
        // Urgents seulement.
        const urgent = document.getElementById("ech-urgent");
        if (urgent) { urgent.checked = filterUrgent; urgent.addEventListener("change", () => { filterUrgent = urgent.checked; renderBody(); }); }
        // Recherche (le champ est hors de #ech-body → focus conservé au rafraîchissement).
        const search = document.getElementById("ech-search");
        if (search) { search.value = filterSearch; search.addEventListener("input", () => { filterSearch = search.value; renderBody(); }); }
        // Exports.
        const bx = document.getElementById("ech-export-xlsx");
        const bi = document.getElementById("ech-export-ics");
        if (bx) bx.addEventListener("click", exportExcel);
        if (bi) bi.addEventListener("click", exportICS);
    }

    return { render, exportExcel, exportICS, buildRows, buildICS };
})();
