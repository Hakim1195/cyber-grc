// Emplacement : js/modules/cartographie.js
// Nom du fichier : cartographie.js
//
// Cartographie du SI & dépendances entre actifs (chantier Cartographie, schéma v9).
// Graphe SVG « fait maison » (même recette que la matrice EBIOS : formes + texte,
// export PNG via canvas, sans dépendance). Niveau 3 : propagation d'impact +
// détection des points de défaillance unique (SPOF).
//
// Modèle du lien : chaque actif porte `dependances: [{ to, type }]`. Une arête A→B
// signifie « A a besoin de B » pour TOUS les types SAUF « sauvegardé par » (backup),
// qui ne propage pas une panne de disponibilité (il porte la capacité de restauration).

const CartographieModule = (() => {

    // Types de liens (point de vue de l'actif édité). `propagates` = participe à la
    // propagation d'une panne de disponibilité (rayon d'impact / SPOF).
    const DEP_TYPES = {
        dep:    { label: "Dépend de",      short: "dépend de",      propagates: true,  color: "#2059A6", dash: "" },
        hosted: { label: "Hébergé sur",    short: "hébergé sur",    propagates: true,  color: "#6a4bbd", dash: "" },
        flux:   { label: "Alimenté par",   short: "alimenté par",   propagates: true,  color: "#0d8a8a", dash: "" },
        backup: { label: "Sauvegardé par", short: "sauvegardé par", propagates: false, color: "#2f9e5f", dash: "6 4" }
    };
    const DEP_ORDER = ["dep", "hosted", "flux", "backup"];

    // Couleurs de criticité (miroir des tokens --risk-*, sémantique stricte).
    const CRIT_COLOR = { critique: "#c0392b", "élevée": "#e67e22", "modérée": "#f1c40f", faible: "#27ae60" };
    const CRIT_ORDER = { critique: 0, "élevée": 1, "modérée": 2, faible: 3 };
    const ALL_TYPES = ["Matériel", "Logiciel", "Donnée", "Service", "Humain"];
    const ALL_CRITS = ["critique", "élevée", "modérée", "faible"];

    const USE_COLOR = "#9aa8b8";     // arête processus ↔ actif (usage)
    const SPOF_MIN_CRIT_PROC = 2;    // seuil SPOF : ≥ N processus critiques en aval

    // Géométrie du graphe (viewBox interne ; le SVG est mis à l'échelle par le conteneur).
    const NW = 158, NH = 54, VBW = 980, PAD_L = 128, PAD_R = 26,
          H_GAP = 30, V_GAP = 26, ROW_GAP = 46, BAND_TOP = 58, BAND_BOTTOM = 30;
    const NS = "http://www.w3.org/2000/svg";

    // État de la vue.
    let selected = null;
    let filters = null;
    let lastLayout = null;   // { nodes:[{id,x,y,kind,...}], edges:[{f,t,type}], height }

    function esc(s) { return (window.escapeHtml || (x => x))(s == null ? "" : String(s)); }

    /* =========================
       ASSEMBLAGE DU MODÈLE (données réelles → nœuds + arêtes)
    ========================== */
    function assemble() {
        const rawActifs = DataStore.getActifs() || [];
        const rawProc = DataStore.getProcessus() || [];
        const assetIds = new Set(rawActifs.map(a => a.id));

        const assets = rawActifs.map(a => ({
            id: a.id, kind: "asset", nom: a.nom || "Sans nom",
            type: a.type || "", criticite: a.criticite || "faible",
            deps: Array.isArray(a.dependances) ? a.dependances : []
        }));
        const procs = rawProc.map(p => ({
            id: p.id, kind: "proc", nom: p.nom || "Sans nom",
            criticite: p.criticite || "", rto: p.rto || "",
            actifs: Array.isArray(p.actifs_lies) ? p.actifs_lies : []
        }));

        const depEdges = [];
        assets.forEach(a => a.deps.forEach(d => {
            if (!d || !d.to || d.to === a.id) return;           // ignore auto-lien
            if (!assetIds.has(d.to)) return;                    // ignore cible disparue
            if (!DEP_TYPES[d.type]) return;                     // ignore type inconnu
            depEdges.push({ f: a.id, t: d.to, type: d.type });
        }));
        const procEdges = [];
        procs.forEach(p => p.actifs.forEach(aid => {
            if (assetIds.has(aid)) procEdges.push({ f: p.id, t: aid, type: "use" });
        }));

        const nodeById = {};
        assets.forEach(a => nodeById[a.id] = a);
        procs.forEach(p => nodeById[p.id] = p);
        return { assets, procs, depEdges, procEdges, nodeById };
    }

    // Arêtes qui propagent une panne (dép. hors sauvegarde + usage processus).
    function propEdges(model) {
        return model.depEdges.filter(e => DEP_TYPES[e.type].propagates).concat(model.procEdges);
    }

    // Rayon d'impact : tout ce qui (transitivement) a besoin de `id`.
    function blast(model, id) {
        const pe = propEdges(model);
        const seen = new Set(), q = [id];
        while (q.length) {
            const cur = q.shift();
            pe.forEach(e => { if (e.t === cur && !seen.has(e.f)) { seen.add(e.f); q.push(e.f); } });
        }
        return seen;
    }

    // Ensemble des SPOF (≥ SPOF_MIN_CRIT_PROC processus critiques dépendent de l'actif).
    function computeSpof(model) {
        const spof = new Set();
        model.assets.forEach(a => {
            const b = blast(model, a.id);
            let n = 0;
            b.forEach(x => { const nd = model.nodeById[x]; if (nd && nd.kind === "proc" && nd.criticite === "critique") n++; });
            if (n >= SPOF_MIN_CRIT_PROC) spof.add(a.id);
        });
        return spof;
    }

    /* =========================
       LAYOUT EN COUCHES (rang = profondeur de dépendance)
       Une arête A→B (« A dépend de B ») place B PLUS BAS (vers le socle). Les
       processus métier coiffent le graphe. Robuste aux cycles (garde de pile).
    ========================== */
    function computeLevels(assets, depEdges) {
        const adj = new Map(); assets.forEach(a => adj.set(a.id, []));
        depEdges.forEach(e => { if (adj.has(e.f) && adj.has(e.t)) adj.get(e.f).push(e.t); });
        const level = new Map(), state = new Map();
        function dfs(id) {
            if (level.has(id)) return level.get(id);
            if (state.get(id) === 1) return 0;                  // back-edge (cycle) → coupe
            state.set(id, 1);
            let lv = 0;
            adj.get(id).forEach(t => { lv = Math.max(lv, 1 + dfs(t)); });
            state.set(id, 2); level.set(id, lv); return lv;
        }
        assets.forEach(a => dfs(a.id));
        return level;
    }

    function computeLayout(model, showProc) {
        const { assets, procs, depEdges } = model;
        const level = computeLevels(assets, depEdges);
        let maxLevel = 0; assets.forEach(a => { maxLevel = Math.max(maxLevel, level.get(a.id) || 0); });

        // Regroupement par rang d'affichage (0 = haut).
        const procOffset = showProc && procs.length ? 1 : 0;
        const rows = {};
        if (procOffset) rows[0] = procs.slice();
        assets.forEach(a => {
            const r = procOffset + (maxLevel - (level.get(a.id) || 0));
            (rows[r] = rows[r] || []).push(a);
        });

        const usable = VBW - PAD_L - PAD_R;
        const perRow = Math.max(1, Math.floor((usable + H_GAP) / (NW + H_GAP)));
        const nodes = [];
        let y = BAND_TOP;
        const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);

        rowKeys.forEach(rk => {
            const list = rows[rk].slice().sort((a, b) =>
                (CRIT_ORDER[a.criticite] ?? 9) - (CRIT_ORDER[b.criticite] ?? 9) || a.nom.localeCompare(b.nom));
            for (let i = 0; i < list.length; i += perRow) {
                const chunk = list.slice(i, i + perRow);
                const totalW = chunk.length * NW + (chunk.length - 1) * H_GAP;
                const startX = PAD_L + Math.max(0, (usable - totalW) / 2);
                chunk.forEach((n, k) => nodes.push(Object.assign({}, n, {
                    x: startX + k * (NW + H_GAP), y, cx: startX + k * (NW + H_GAP) + NW / 2, cy: y + NH / 2
                })));
                y += NH + V_GAP;
            }
            y += ROW_GAP - V_GAP;
        });

        return { nodes, height: y + BAND_BOTTOM };
    }

    /* =========================
       FILTRAGE (visuel : n'affecte pas le calcul d'impact/SPOF, fait sur le graphe complet)
    ========================== */
    function visibleModel(model) {
        const f = filters;
        const okAsset = a =>
            f.types.has(a.type) && f.crits.has(a.criticite) &&
            (!f.search || a.nom.toLowerCase().includes(f.search));
        let assets = model.assets.filter(okAsset);
        let procs = f.showProc ? model.procs.filter(p => !f.search || p.nom.toLowerCase().includes(f.search)) : [];

        const visIds = new Set(assets.map(a => a.id).concat(procs.map(p => p.id)));
        let depEdges = model.depEdges.filter(e => visIds.has(e.f) && visIds.has(e.t));
        let procEdges = f.showProc ? model.procEdges.filter(e => visIds.has(e.f) && visIds.has(e.t)) : [];

        if (f.hideIsolated) {
            const linked = new Set();
            depEdges.concat(procEdges).forEach(e => { linked.add(e.f); linked.add(e.t); });
            assets = assets.filter(a => linked.has(a.id));
            procs = procs.filter(p => linked.has(p.id));
        }
        const nodeById = {};
        assets.concat(procs).forEach(n => nodeById[n.id] = n);
        return { assets, procs, depEdges, procEdges, nodeById };
    }

    /* =========================
       RENDU SVG (interactif)
    ========================== */
    function el(tag, attrs, parent) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    function anchor(n, side) {
        if (side === "top") return [n.cx, n.y];
        if (side === "bottom") return [n.cx, n.y + NH];
        if (side === "left") return [n.x, n.cy];
        return [n.x + NW, n.cy];
    }
    function edgePath(a, b) {
        let s, t, vertical = true;
        if (b.cy > a.cy + 4) { s = anchor(a, "bottom"); t = anchor(b, "top"); }
        else if (b.cy < a.cy - 4) { s = anchor(a, "top"); t = anchor(b, "bottom"); }
        else { vertical = false; if (a.cx < b.cx) { s = anchor(a, "right"); t = anchor(b, "left"); } else { s = anchor(a, "left"); t = anchor(b, "right"); } }
        const dx = t[0] - s[0], dy = t[1] - s[1];
        const c1 = vertical ? [s[0], s[1] + dy * 0.5] : [s[0] + dx * 0.5, s[1]];
        const c2 = vertical ? [t[0], t[1] - dy * 0.5] : [t[0] - dx * 0.5, t[1]];
        return `M${s[0]},${s[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${t[0]},${t[1]}`;
    }

    function renderGraph(model, spof) {
        const vm = visibleModel(model);
        const layout = computeLayout(vm, filters.showProc);
        lastLayout = { vm, layout, spof };
        const posById = {};
        layout.nodes.forEach(n => posById[n.id] = n);

        const host = document.getElementById("carto-svg-host");
        if (!host) return;
        host.innerHTML = "";
        const svg = el("svg", {
            class: "carto-graph", id: "carto-graph",
            viewBox: `0 0 ${VBW} ${layout.height}`,
            role: "img", "aria-label": "Cartographie des dépendances du système d'information"
        }, host);

        // Marqueurs de flèche (un par type + usage).
        const defs = el("defs", {}, svg);
        Object.keys(DEP_TYPES).forEach(tp => {
            const m = el("marker", { id: "carto-ar-" + tp, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
            el("path", { d: "M0,0 L10,5 L0,10 z", fill: DEP_TYPES[tp].color }, m);
        });
        const mu = el("marker", { id: "carto-ar-use", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse" }, defs);
        el("path", { d: "M0,0 L10,5 L0,10 z", fill: USE_COLOR }, mu);

        // Axe vertical « Métier → Infrastructure ».
        const axisX = 26;
        el("line", { x1: axisX, y1: BAND_TOP - 6, x2: axisX, y2: layout.height - BAND_BOTTOM, stroke: "var(--border)", "stroke-width": "1.5" }, svg);
        el("text", { x: axisX, y: BAND_TOP + 4, class: "carto-axis", "text-anchor": "middle", transform: `rotate(-90 ${axisX} ${BAND_TOP + 4})` }, svg).textContent = "MÉTIER";
        const byb = layout.height - BAND_BOTTOM - 4;
        el("text", { x: axisX, y: byb, class: "carto-axis", "text-anchor": "middle", transform: `rotate(-90 ${axisX} ${byb})` }, svg).textContent = "INFRASTRUCTURE";

        // Arêtes.
        const ge = el("g", {}, svg);
        function drawEdge(e, cls, color, dash, marker) {
            const a = posById[e.f], b = posById[e.t]; if (!a || !b) return;
            const p = el("path", { d: edgePath(a, b), class: cls, fill: "none", stroke: color, "stroke-width": "2", "marker-end": `url(#${marker})` }, ge);
            if (dash) p.setAttribute("stroke-dasharray", dash);
            p.dataset.f = e.f; p.dataset.t = e.t;
        }
        vm.procEdges.forEach(e => drawEdge(e, "carto-edge carto-edge-use", USE_COLOR, "2 4", "carto-ar-use"));
        vm.depEdges.forEach(e => drawEdge(e, "carto-edge carto-edge-dep", DEP_TYPES[e.type].color, DEP_TYPES[e.type].dash, "carto-ar-" + e.type));

        // Nœuds.
        layout.nodes.forEach(n => {
            const g = el("g", { class: "carto-node" + (n.kind === "proc" ? " is-proc" : ""), tabindex: "0", role: "button", "data-id": n.id, "data-spof": spof.has(n.id) ? "1" : "0", "aria-label": esc(n.nom) }, svg);
            el("rect", { class: "carto-spof-ring", x: n.x - 5, y: n.y - 5, width: NW + 10, height: NH + 10, rx: 13 }, g);
            el("rect", { class: "carto-card", x: n.x, y: n.y, width: NW, height: NH, rx: 9 }, g);
            const critColor = CRIT_COLOR[n.criticite] || "#94a3b8";
            el("rect", { x: n.x, y: n.y, width: 5, height: NH, rx: 2, fill: critColor }, g);
            el("circle", { cx: n.x + 20, cy: n.cy, r: 5, fill: critColor }, g);
            const t1 = el("text", { class: "carto-nlabel", x: n.x + 34, y: n.y + 22 }, g);
            t1.textContent = n.nom.length > 22 ? n.nom.slice(0, 21) + "…" : n.nom;
            const t2 = el("text", { class: "carto-nsub", x: n.x + 34, y: n.y + 39 }, g);
            t2.textContent = n.kind === "proc" ? "Processus" + (n.rto ? " · RTO " + n.rto : "") : (n.type || "Actif");
            el("text", { class: "carto-spof-badge", x: n.x + NW - 4, y: n.y - 9, "text-anchor": "end" }, g).textContent = "SPOF";
            g.addEventListener("click", () => selectNode(n.id));
            g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectNode(n.id); } });
        });

        applyHighlight();
    }

    function applyHighlight() {
        const svg = document.getElementById("carto-graph"); if (!svg) return;
        svg.querySelectorAll(".carto-node").forEach(g => g.classList.remove("is-hl", "is-dim", "is-selected"));
        svg.querySelectorAll(".carto-edge").forEach(e => e.classList.remove("is-hl", "is-dim"));
        if (!selected || !lastLayout) { svg.classList.remove("has-sel"); return; }
        svg.classList.add("has-sel");
        const b = blast(lastLayout.vm, selected);
        const hlN = new Set([selected]); b.forEach(x => hlN.add(x));
        svg.querySelectorAll(".carto-node").forEach(g => {
            const id = g.dataset.id;
            if (id === selected) g.classList.add("is-hl", "is-selected");
            else if (hlN.has(id)) g.classList.add("is-hl");
            else g.classList.add("is-dim");
        });
        svg.querySelectorAll(".carto-edge").forEach(e => {
            (hlN.has(e.dataset.f) && hlN.has(e.dataset.t)) ? e.classList.add("is-hl") : e.classList.add("is-dim");
        });
    }

    /* =========================
       PANNEAU D'ANALYSE
    ========================== */
    function renderPanel(model, spof) {
        const panel = document.getElementById("carto-panel"); if (!panel) return;
        if (!selected || !model.nodeById[selected]) {
            panel.innerHTML = `
                <h2>Analyse d'impact</h2>
                <p class="carto-empty">Cliquez sur un actif ou un processus pour explorer ses dépendances et mesurer le rayon d'impact d'une panne.</p>
                <div class="carto-note">
                    <strong>Rayon d'impact</strong> : la propagation suit les liens « dépend de », « hébergé sur » et « alimenté par » (+ l'usage des processus). Les liens de <em>sauvegarde</em> en sont exclus (ils ne provoquent pas de panne en cascade).
                </div>`;
            return;
        }
        const n = model.nodeById[selected];
        const critColor = CRIT_COLOR[n.criticite] || "#94a3b8";
        const head = `<div class="carto-head">
            <span class="carto-name">${esc(n.nom)}</span>
            ${n.criticite ? `<span class="carto-pill" style="background:${critColor}">${esc(n.criticite)}</span>` : ""}
            <span class="carto-tag">${esc(n.kind === "proc" ? "Processus métier" : (n.type || "Actif"))}</span>
        </div>`;

        // Dépendances directes de cet actif (sortantes) et ce qui en dépend (entrantes).
        const outs = model.depEdges.filter(e => e.f === selected)
            .map(e => `<li>${esc(DEP_TYPES[e.type].short)} <strong>${esc(model.nodeById[e.t] ? model.nodeById[e.t].nom : "?")}</strong></li>`);
        const inDeps = model.depEdges.filter(e => e.t === selected)
            .map(e => `<li><strong>${esc(model.nodeById[e.f] ? model.nodeById[e.f].nom : "?")}</strong> — ${esc(DEP_TYPES[e.type].short)}</li>`);

        // Rayon d'impact.
        const b = blast(model, selected);
        const impacted = Array.from(b).map(x => model.nodeById[x]).filter(Boolean);
        const impProc = impacted.filter(x => x.kind === "proc");
        const impAsset = impacted.filter(x => x.kind === "asset");
        const critProc = impProc.filter(x => x.criticite === "critique");
        const isSpof = spof.has(selected);

        const impProcList = impProc.length
            ? impProc.sort((a, c) => (CRIT_ORDER[a.criticite] ?? 9) - (CRIT_ORDER[c.criticite] ?? 9))
                .map(p => `<li><a href="#/bia/${encodeURIComponent(p.id)}">${esc(p.nom)}</a>${p.rto ? ` <span class="carto-muted">· RTO ${esc(p.rto)}</span>` : ""}${p.criticite === "critique" ? ` <span class="carto-crit-dot" title="processus critique"></span>` : ""}</li>`).join("")
            : `<li class="carto-muted">Aucun processus métier en aval.</li>`;

        panel.innerHTML = `
            <h2>Analyse d'impact — propagation</h2>
            ${head}
            <div class="carto-sect">
                <div class="carto-lbl">Si cet actif est indisponible ${Help.tip("Propagation transitive : tous les actifs et processus qui dépendent (directement ou en cascade) de cet actif. Les liens de sauvegarde sont exclus car ils ne provoquent pas de panne de disponibilité.")}</div>
                <div class="carto-impact">
                    <div class="box"><div class="n">${impAsset.length}</div><div class="c">actif(s) en aval</div></div>
                    <div class="box"><div class="n">${impProc.length}</div><div class="c">processus impacté(s)</div></div>
                    <div class="box"><div class="n" style="color:var(--color-danger)">${critProc.length}</div><div class="c">dont critiques</div></div>
                    <div class="box"><div class="n">${outs.length + inDeps.length}</div><div class="c">liens directs</div></div>
                </div>
            </div>
            ${isSpof ? `<div class="carto-spofbox"><strong>⚠ Point de défaillance unique (SPOF)</strong> ${Help.tip("Single Point Of Failure : au moins deux processus critiques dépendent de cet actif sans alternative. Sa panne interrompt plusieurs activités vitales à la fois.")}<br>Au moins ${SPOF_MIN_CRIT_PROC} processus critiques en dépendent. Priorité : redondance / plan de bascule.</div>` : ""}
            <div class="carto-sect">
                <div class="carto-lbl">Processus métier impactés</div>
                <ul class="carto-list">${impProcList}</ul>
            </div>
            <div class="carto-sect">
                <div class="carto-lbl">Dépend de</div>
                <ul class="carto-list">${outs.join("") || `<li class="carto-muted">Aucune dépendance déclarée.</li>`}</ul>
            </div>
            <div class="carto-sect">
                <div class="carto-lbl">En dépendent directement</div>
                <ul class="carto-list">${inDeps.join("") || `<li class="carto-muted">Aucun actif ne pointe vers celui-ci.</li>`}</ul>
            </div>
            <div class="carto-actions">
                ${n.kind === "asset"
                    ? `<button class="carto-btn-primary" onclick="Router.navigateTo('/actifs/${encodeURIComponent(n.id)}')">Ouvrir la fiche actif</button>`
                    : `<button class="carto-btn-primary" onclick="Router.navigateTo('/bia/${encodeURIComponent(n.id)}')">Ouvrir le processus</button>`}
                <button class="carto-btn-ghost" onclick="CartographieModule.clearSelection()">Désélectionner</button>
            </div>`;
    }

    /* =========================
       INTERACTIONS
    ========================== */
    function currentModel() { return assemble(); }

    function selectNode(id) {
        selected = (selected === id ? null : id);
        const model = currentModel();
        const spof = lastLayout ? lastLayout.spof : computeSpof(model);
        applyHighlight();
        renderPanel(model, spof);
    }
    function clearSelection() {
        selected = null;
        const model = currentModel();
        applyHighlight();
        renderPanel(model, lastLayout ? lastLayout.spof : computeSpof(model));
    }

    function refresh() {
        const model = currentModel();
        const spof = computeSpof(model);
        if (selected && !model.nodeById[selected]) selected = null;
        renderGraph(model, spof);
        renderPanel(model, spof);
        updateStats(model, spof);
    }

    function updateStats(model, spof) {
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set("carto-stat-actifs", model.assets.length);
        set("carto-stat-proc", model.procs.length);
        set("carto-stat-liens", model.depEdges.length);
        set("carto-stat-spof", spof.size);
    }

    // Filtres (appelés par les contrôles).
    function toggleType(t) { filters.types.has(t) ? filters.types.delete(t) : filters.types.add(t); syncFilterButtons(); refresh(); }
    function toggleCrit(c) { filters.crits.has(c) ? filters.crits.delete(c) : filters.crits.add(c); syncFilterButtons(); refresh(); }
    function setShowProc(v) { filters.showProc = v; refresh(); }
    function setHideIsolated(v) { filters.hideIsolated = v; refresh(); }
    function setSearch(v) { filters.search = (v || "").trim().toLowerCase(); refresh(); }

    function syncFilterButtons() {
        document.querySelectorAll("[data-ftype]").forEach(b => b.setAttribute("aria-pressed", filters.types.has(b.dataset.ftype)));
        document.querySelectorAll("[data-fcrit]").forEach(b => b.setAttribute("aria-pressed", filters.crits.has(b.dataset.fcrit)));
    }

    /* =========================
       EXPORT (SVG autonome → PNG via canvas, sans dépendance — cf. matrice.js)
    ========================== */
    function buildExportSVG() {
        if (!lastLayout) return "";
        const { vm, layout, spof } = lastLayout;
        const posById = {}; layout.nodes.forEach(n => posById[n.id] = n);
        const W = VBW, H = layout.height + 40, top = 44;
        const dateStr = new Date().toLocaleDateString("fr-FR");
        let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
        s += `<text x="26" y="26" font-size="18" font-weight="700" fill="#2059A6">Cartographie du SI &amp; dépendances</text>`;
        s += `<text x="${W - 26}" y="20" text-anchor="end" font-size="12" font-weight="700" fill="#E9631B">Dedienne Aerospace</text>`;
        s += `<text x="${W - 26}" y="36" text-anchor="end" font-size="10" fill="#6b7a8d">Exporté le ${esc(dateStr)} — ${vm.assets.length} actif(s), ${vm.depEdges.length} dépendance(s)</text>`;

        function path(a, b) { return edgePath(a, b); }
        // arêtes
        vm.procEdges.forEach(e => { const a = posById[e.f], b = posById[e.t]; if (a && b) s += `<path d="${path(a, b)}" fill="none" stroke="${USE_COLOR}" stroke-width="2" stroke-dasharray="2 4"/>`; });
        vm.depEdges.forEach(e => { const a = posById[e.f], b = posById[e.t]; if (a && b) { const dt = DEP_TYPES[e.type]; s += `<path d="${path(a, b)}" fill="none" stroke="${dt.color}" stroke-width="2"${dt.dash ? ` stroke-dasharray="${dt.dash}"` : ""}/>`; } });
        // nœuds
        layout.nodes.forEach(n => {
            const cc = CRIT_COLOR[n.criticite] || "#94a3b8";
            s += `<rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="9" fill="${n.kind === "proc" ? "#eef4fb" : "#ffffff"}" stroke="${spof.has(n.id) ? "#E9631B" : "#e2e6ea"}" stroke-width="${spof.has(n.id) ? 2 : 1.3}"/>`;
            s += `<rect x="${n.x}" y="${n.y}" width="5" height="${NH}" rx="2" fill="${cc}"/>`;
            s += `<circle cx="${n.x + 20}" cy="${n.cy}" r="5" fill="${cc}"/>`;
            const nm = n.nom.length > 22 ? n.nom.slice(0, 21) + "…" : n.nom;
            s += `<text x="${n.x + 34}" y="${n.y + 22}" font-size="12.5" font-weight="600" fill="#1f2d3d">${esc(nm)}</text>`;
            const sub = n.kind === "proc" ? "Processus" + (n.rto ? " · RTO " + n.rto : "") : (n.type || "Actif");
            s += `<text x="${n.x + 34}" y="${n.y + 39}" font-size="9.5" font-weight="600" fill="#6b7a8d">${esc(sub)}</text>`;
            if (spof.has(n.id)) s += `<text x="${n.x + NW - 4}" y="${n.y - 8}" text-anchor="end" font-size="8" font-weight="800" fill="#E9631B">SPOF</text>`;
        });
        const font = "Segoe UI, Roboto, Arial, sans-serif";
        return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}">${s}</svg>`;
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function exportSVG() {
        const str = buildExportSVG(); if (!str) return;
        triggerDownload(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), "cartographie-si.svg");
    }
    function exportPNG() {
        const str = buildExportSVG(); if (!str) return;
        const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = () => {
            const scale = 2, canvas = document.createElement("canvas");
            canvas.width = img.width * scale; canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => { if (b) triggerDownload(b, "cartographie-si.png"); else alert("Échec de la génération du PNG."); }, "image/png");
        };
        img.onerror = () => { URL.revokeObjectURL(url); alert("Échec de l'export PNG (rendu de l'image)."); };
        img.src = url;
    }

    /* =========================
       VUE PRINCIPALE
    ========================== */
    function render() {
        selected = null;
        filters = { types: new Set(ALL_TYPES), crits: new Set(ALL_CRITS), search: "", showProc: true, hideIsolated: false };
        injectStyles();

        const app = document.getElementById("app");
        const model = assemble();

        if (!model.assets.length) {
            app.innerHTML = `
                <section class="page">
                    <div class="dashboard-header"><h1>Cartographie du SI</h1></div>
                    <div class="dashboard-card" style="text-align:center; padding:40px;">
                        <p style="color:var(--text-muted); margin-bottom:16px;">Aucun actif déclaré : la cartographie a besoin d'actifs pour tracer les dépendances.</p>
                        <button onclick="Router.navigateTo('/actifs')">Déclarer des actifs</button>
                    </div>
                </section>`;
            return;
        }
        const spof = computeSpof(model);

        const typeBtns = ALL_TYPES.map(t => `<button class="carto-fbtn" data-ftype="${t}" aria-pressed="true" onclick="CartographieModule.toggleType('${t}')">${t}</button>`).join("");
        const critBtns = ALL_CRITS.map(c => `<button class="carto-fbtn" data-fcrit="${c}" aria-pressed="true" onclick="CartographieModule.toggleCrit('${c}')"><span class="carto-cdot" style="background:${CRIT_COLOR[c]}"></span>${c}</button>`).join("");

        const legend = DEP_ORDER.map(tp => `<span class="carto-lg"><span class="carto-ln" style="border-color:${DEP_TYPES[tp].color};${DEP_TYPES[tp].dash ? "border-style:dashed" : ""}"></span>${DEP_TYPES[tp].short}</span>`).join("")
            + `<span class="carto-lg"><span class="carto-ln" style="border-color:${USE_COLOR};border-style:dotted"></span>usage (processus ↔ actif)</span>`;

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Cartographie du SI &amp; dépendances ${Help.tip("Représente les actifs du système d'information et leurs dépendances typées. Cliquez sur un actif pour voir ce qui en dépend et l'impact d'une panne (propagation). Les dépendances s'éditent depuis la fiche de chaque actif.")}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Périmètre : <strong>Interne (SI global)</strong> — les dépendances s'ajoutent depuis la fiche de chaque actif.</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button onclick="CartographieModule.exportPNG()" title="Télécharger la cartographie au format image PNG">Exporter en PNG</button>
                        <button onclick="CartographieModule.exportSVG()" style="background:var(--bg-body); color:var(--text-main); border:1px solid var(--border);" title="Télécharger au format vectoriel SVG">SVG</button>
                    </div>
                </div>

                <div class="carto-stats">
                    <div class="carto-stat"><div class="k">Actifs</div><div class="v" id="carto-stat-actifs">${model.assets.length}</div></div>
                    <div class="carto-stat"><div class="k">Processus métier</div><div class="v" id="carto-stat-proc">${model.procs.length}</div></div>
                    <div class="carto-stat"><div class="k">Dépendances</div><div class="v" id="carto-stat-liens">${model.depEdges.length}</div></div>
                    <div class="carto-stat alert"><div class="k">SPOF détectés ${Help.tip("Points de défaillance unique : actifs dont dépendent au moins deux processus critiques. À redonder en priorité.")}</div><div class="v" id="carto-stat-spof">${spof.size}</div></div>
                </div>

                <div class="carto-toolbar no-print">
                    <input type="search" id="carto-search" class="carto-input" placeholder="Rechercher un actif…" oninput="CartographieModule.setSearch(this.value)" />
                    <div class="carto-fgroup" role="group" aria-label="Filtrer par type">${typeBtns}</div>
                    <div class="carto-fgroup" role="group" aria-label="Filtrer par criticité">${critBtns}</div>
                    <label class="carto-check"><input type="checkbox" checked onchange="CartographieModule.setShowProc(this.checked)"> Processus</label>
                    <label class="carto-check"><input type="checkbox" onchange="CartographieModule.setHideIsolated(this.checked)"> Masquer les isolés</label>
                </div>

                <div class="carto-grid">
                    <div class="dashboard-card carto-board">
                        <div id="carto-svg-host" class="carto-scroll"></div>
                        <div class="carto-legend">
                            ${legend}
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR.critique}"></span>critique</span>
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR["élevée"]}"></span>élevée</span>
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR["modérée"]}"></span>modérée</span>
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR.faible}"></span>faible</span>
                        </div>
                    </div>
                    <div class="dashboard-card carto-panel" id="carto-panel"></div>
                </div>
            </section>`;

        renderGraph(model, spof);
        renderPanel(model, spof);
    }

    function injectStyles() {
        if (document.getElementById("carto-styles")) return;
        const st = document.createElement("style");
        st.id = "carto-styles";
        st.textContent = `
        .carto-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 16px}
        .carto-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 15px;box-shadow:var(--shadow)}
        .carto-stat .k{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600}
        .carto-stat .v{font-size:1.5rem;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
        .carto-stat.alert .v{color:var(--primary)}
        .carto-toolbar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:14px}
        .carto-input{padding:8px 12px;border:1px solid var(--border);border-radius:8px;font:inherit;min-width:200px;background:var(--bg-card);color:var(--text-main)}
        .carto-fgroup{display:inline-flex;flex-wrap:wrap;gap:6px}
        .carto-fbtn{font:inherit;font-size:.78rem;font-weight:600;padding:5px 11px;border-radius:20px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:var(--transition)}
        .carto-fbtn[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
        .carto-cdot{width:9px;height:9px;border-radius:50%;display:inline-block}
        .carto-check{font-size:.82rem;color:var(--text-main);display:inline-flex;align-items:center;gap:6px;cursor:pointer}
        .carto-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
        .carto-board{padding:10px}
        .carto-scroll{overflow:auto;max-height:74vh}
        svg.carto-graph{display:block;width:100%;height:auto;min-width:680px}
        .carto-legend{display:flex;flex-wrap:wrap;gap:12px 18px;padding:12px 8px 4px;border-top:1px solid var(--border);margin-top:8px;font-size:.76rem;color:var(--text-muted)}
        .carto-lg{display:inline-flex;align-items:center;gap:7px}
        .carto-ln{width:24px;border-top:2.5px solid;border-radius:2px}
        .carto-panel{padding:18px;position:sticky;top:12px}
        .carto-panel h2{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:0 0 12px;font-weight:700}
        .carto-empty{color:var(--text-muted);font-size:.86rem;line-height:1.55}
        .carto-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
        .carto-name{font-size:1.05rem;font-weight:700;color:var(--text-main)}
        .carto-pill{font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:3px 9px;border-radius:20px;color:#fff}
        .carto-tag{font-size:.72rem;color:var(--text-muted);background:var(--bg-body);border:1px solid var(--border);padding:2px 8px;border-radius:6px;font-weight:600}
        .carto-sect{margin-top:15px;padding-top:13px;border-top:1px dashed var(--border)}
        .carto-lbl{font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:700;margin-bottom:8px}
        .carto-impact{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .carto-impact .box{background:var(--bg-body);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
        .carto-impact .n{font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;color:var(--text-main)}
        .carto-impact .c{font-size:.72rem;color:var(--text-muted);margin-top:4px;line-height:1.25}
        .carto-spofbox{margin-top:14px;background:var(--primary-tint);border:1px solid var(--primary);border-radius:10px;padding:11px 13px;font-size:.82rem;line-height:1.45;color:var(--text-main)}
        .carto-spofbox strong{color:var(--primary)}
        .carto-list{list-style:none;padding:0;margin:0;font-size:.84rem;line-height:1.5}
        .carto-list li{padding:3px 0;color:var(--text-main)}
        .carto-list a{color:var(--accent);text-decoration:none}
        .carto-list a:hover{text-decoration:underline}
        .carto-muted{color:var(--text-muted);font-style:italic}
        .carto-crit-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--color-danger);margin-left:2px}
        .carto-actions{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}
        .carto-btn-primary{font:inherit;font-size:.82rem;font-weight:600;padding:8px 13px;border-radius:8px;border:0;background:var(--primary);color:#fff;cursor:pointer}
        .carto-btn-ghost{font:inherit;font-size:.82rem;font-weight:600;padding:8px 13px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer}
        /* SVG */
        .carto-graph .carto-node{cursor:pointer}
        .carto-graph .carto-card{fill:var(--bg-card);stroke:var(--border);stroke-width:1.3}
        .carto-graph .carto-node.is-proc .carto-card{fill:#eef4fb}
        .carto-graph .carto-node:hover .carto-card{stroke:var(--accent)}
        .carto-graph .carto-node:focus-visible{outline:none}
        .carto-graph .carto-node:focus-visible .carto-card{stroke:var(--accent);stroke-width:2.4}
        .carto-graph .carto-nlabel{fill:var(--text-main);font-size:12.5px;font-weight:600}
        .carto-graph .carto-nsub{fill:var(--text-muted);font-size:9.5px;font-weight:600}
        .carto-graph .carto-axis{fill:var(--text-muted);font-size:9.5px;font-weight:700;letter-spacing:.12em}
        .carto-graph .carto-edge{transition:opacity .2s}
        .carto-graph .carto-spof-ring{fill:none;stroke:var(--primary);stroke-width:1.6;stroke-dasharray:4 3;display:none}
        .carto-graph .carto-spof-badge{display:none;font-size:8px;font-weight:800;fill:var(--primary);letter-spacing:.05em}
        .carto-graph .carto-node[data-spof="1"] .carto-spof-ring{display:block}
        .carto-graph .carto-node[data-spof="1"] .carto-spof-badge{display:block}
        .carto-graph .carto-node.is-selected .carto-card{stroke:var(--primary);stroke-width:2.6}
        .carto-graph.has-sel .carto-node.is-dim{opacity:.22}
        .carto-graph.has-sel .carto-edge.is-dim{opacity:.08}
        .carto-graph.has-sel .carto-edge.is-hl{stroke-width:3}
        @media (max-width:900px){ .carto-grid{grid-template-columns:1fr} .carto-stats{grid-template-columns:repeat(2,1fr)} .carto-panel{position:static} }
        `;
        document.head.appendChild(st);
    }

    return {
        render, selectNode, clearSelection, exportPNG, exportSVG,
        toggleType, toggleCrit, setShowProc, setHideIsolated, setSearch,
        // Exposés pour la fiche Actif (édition des dépendances) :
        depTypes: () => DEP_TYPES, depOrder: () => DEP_ORDER.slice()
    };
})();
