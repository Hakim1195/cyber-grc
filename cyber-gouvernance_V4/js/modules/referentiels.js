// Emplacement : js/modules/referentiels.js
// Nom du fichier : referentiels.js
//
// Module RÉFÉRENTIELS : auto-évaluation de la conformité par rapport à un
// référentiel de sécurité (à ce stade : Hygiène ANSSI, 42 mesures).
//   - /referentiels        → liste des référentiels + profil de maturité (radar)
//   - /referentiels/:id    → auto-évaluation détaillée (statut, maturité 0-5,
//                            commentaire, preuves, actions correctives) par domaine.
// Les évaluations sont persistées dans DataStore (`evaluations`, clé ref_id + code).
//
// Cas particulier : un référentiel « questionnaire » (`scoring: "conformite"`,
// ex. AirCyber) se répond en Oui / Non / N-A, sans échelle de maturité CMMI.
// Son score = réponses « Oui » ÷ questions applicables (les N/A sont exclues,
// une question non répondue compte comme « Non ») ; son radar peut être filtré
// par niveau de label (Global / Bronze / Argent / Or).

const ReferentielsModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    /* =========================
       RÉFÉRENCES MÉTIER (statuts, maturité)
    ========================== */
    const STATUTS = [
        { v: "",                        label: "Non évalué",              cls: "status-non-evaluee" },
        { v: "conforme",                label: "Conforme",                cls: "status-conforme" },
        { v: "partiellement conforme",  label: "Partiellement conforme",  cls: "status-partiellement-conforme" },
        { v: "non conforme",            label: "Non conforme",            cls: "status-non-conforme" },
        { v: "non applicable",          label: "Non applicable",          cls: "status-non-applicable" }
    ];
    function statutMeta(v) { return STATUTS.find(s => s.v === (v || "")) || STATUTS[0]; }

    // Échelle de maturité inspirée des modèles CMMI (0 à 5).
    const MATURITES = [
        { v: 0, label: "0 — Néant" },
        { v: 1, label: "1 — Initial (informel)" },
        { v: 2, label: "2 — Reproductible" },
        { v: 3, label: "3 — Défini (documenté)" },
        { v: 4, label: "4 — Maîtrisé (mesuré)" },
        { v: 5, label: "5 — Optimisé" }
    ];
    const MATURITE_AIDE = "Niveau de maîtrise de la mesure, de 0 (rien en place) à 5 (processus optimisé et amélioré en continu). Échelle inspirée du CMMI.";

    // Référentiel « questionnaire » (AirCyber) : réponses Oui / Non / N-A, score en
    // taux de conformité, sans échelle de maturité CMMI (inadaptée à ce format).
    function isQuestionnaire(ref) { return !!(ref && ref.scoring === "conformite"); }

    // Mêmes VALEURS de statut que STATUTS (compatibilité pivot « Mesure de sécurité »,
    // correspondances, SoA), mais libellées comme les réponses du questionnaire.
    // « Partiellement conforme » n'est pas proposé ; une évaluation héritée portant
    // ce statut reste affichée (option injectée dans rowHtml).
    const STATUTS_QUESTIONNAIRE = [
        { v: "",               label: "Non évalué", cls: "status-non-evaluee" },
        { v: "conforme",       label: "Oui",        cls: "status-conforme" },
        { v: "non conforme",   label: "Non",        cls: "status-non-conforme" },
        { v: "non applicable", label: "N/A",        cls: "status-non-applicable" }
    ];
    function statutsFor(ref) { return isQuestionnaire(ref) ? STATUTS_QUESTIONNAIRE : STATUTS; }

    const SCORE_AIDE = "Score = réponses « Oui » ÷ questions applicables. Les questions N/A sont exclues du calcul ; une question non répondue compte comme « Non ». Pas d'échelle de maturité CMMI pour ce questionnaire.";

    function scoreColor(pct) {   // pct 0-100 ou null — teinte indicative du score
        if (pct === null) return "var(--color-gray)";
        if (pct >= 90) return "var(--color-success)";
        if (pct >= 50) return "var(--color-warning)";
        return "var(--color-danger)";
    }

    // Présentation du score d'un agrégat { evaluated, conformite } de questionnaire :
    // « — » tant que rien n'est répondu, « N/A » si tout est exclu, sinon « xx % ».
    function scoreOf(agg) {
        if (!agg.evaluated) return { html: "—", txt: "—", col: "var(--color-gray)" };
        if (agg.conformite === null) return { html: "N/A", txt: "N/A", col: "var(--color-gray)" };
        return { html: agg.conformite + "<span>%</span>", txt: agg.conformite + " %", col: scoreColor(agg.conformite) };
    }

    // Métadonnées AirCyber (niveau de label, priorité). Attributs statiques par question.
    const NIVEAUX = [
        { v: "bronze", label: "Bronze", cls: "niv-bronze" },
        { v: "silver", label: "Argent", cls: "niv-silver" },
        { v: "gold",   label: "Or",     cls: "niv-gold" }
    ];
    function niveauMeta(v) { return NIVEAUX.find(n => n.v === v) || null; }
    // Teinte du tracé du radar quand il est restreint à un niveau (mêmes tons que les badges).
    const NIVEAU_COLORS = { bronze: "#8a5320", silver: "#4b5563", gold: "#9a7209" };
    const PRIOS = {
        high:   { label: "Haute",   cls: "prio-high" },
        medium: { label: "Moyenne", cls: "prio-medium" },
        low:    { label: "Basse",   cls: "prio-low" }
    };
    // Un référentiel porte-t-il des niveaux de label (AirCyber) ?
    function hasNiveaux(ref) {
        return (ref.domaines || []).some(d => (d.exigences || []).some(e => e.niveau));
    }
    function clLabelOf(ref, cl) { return (ref.clLabels && ref.clLabels[cl]) ? `${cl} — ${ref.clLabels[cl]}` : cl; }

    // Conformité par niveau de label (Bronze/Argent/Or) : « suis-je prêt pour ce label ? ».
    function computeNiveauReadiness(ref) {
        const res = {};
        NIVEAUX.forEach(n => res[n.v] = { total: 0, applicable: 0, conformes: 0, evaluated: 0 });
        (ref.domaines || []).forEach(d => (d.exigences || []).forEach(ex => {
            if (!ex.niveau || !res[ex.niveau]) return;
            const r = res[ex.niveau]; r.total++;
            const ev = DataStore.getEvaluation(ref.id, ex.code);
            const statut = ev ? (ev.statut || "") : "";
            if (statut) r.evaluated++;
            if (statut === "non applicable") return;
            r.applicable++;
            if (statut === "conforme") r.conformes++;
        }));
        NIVEAUX.forEach(n => { const r = res[n.v]; r.conformite = r.applicable ? Math.round(r.conformes / r.applicable * 100) : null; });
        return res;
    }

    function niveauReadinessHtml(readiness) {
        const rows = NIVEAUX.map(n => {
            const r = readiness[n.v]; const pct = r.conformite;
            const col = pct === null ? "var(--color-gray)" : (pct >= 90 ? "var(--color-success)" : pct >= 50 ? "var(--color-warning)" : "var(--color-danger)");
            return `<div class="ref-niv-row">
                <span class="niv-badge ${n.cls}">${n.label}</span>
                <div class="progress-bar small" style="flex:1; margin:0 10px;"><div class="progress-fill" style="width:${pct === null ? 0 : pct}%; background:${col};"></div></div>
                <span class="ref-niv-pct" style="color:${col};">${pct === null ? "—" : pct + "%"}</span>
                <span class="ref-niv-cnt">${r.conformes}/${r.applicable}</span>
            </div>`;
        }).join("");
        return `<div class="ref-readiness">
            <h4 style="margin:16px 0 8px;">Préparation au label ${Help.tip("Part des questions conformes pour chaque niveau AirCyber (Bronze, Argent, Or). Vous êtes « prêt » pour un niveau quand toutes ses questions applicables sont conformes.")}</h4>
            ${rows}
        </div>`;
    }

    function filterBarHtml(ref) {
        const nivBtns = `<button class="ref-filter-niv active" data-niv="">Tous</button>` +
            NIVEAUX.map(n => `<button class="ref-filter-niv" data-niv="${n.v}">${n.label}</button>`).join("");
        const clOpts = `<option value="">Tous domaines CL</option>` +
            Object.keys(ref.clLabels || {}).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(clLabelOf(ref, k))}</option>`).join("");
        return `<div class="ref-filters" id="ref-filters">
            <span class="ref-filters__lbl">Filtrer par niveau :</span>
            <div class="ref-filter-nivs">${nivBtns}</div>
            <select id="ref-filter-cl" aria-label="Filtrer par domaine CL">${clOpts}</select>
            <span class="ref-filter-count" id="ref-filter-count"></span>
        </div>`;
    }

    /* =========================
       CALCUL DES SCORES
    ========================== */
    // Agrège les évaluations d'un référentiel : maturité moyenne (0-5), taux de
    // conformité (%) et avancement de l'évaluation, au global et par domaine.
    // Règles : « non applicable » exclu des moyennes ; « non évalué » compte comme
    // maturité 0 et non conforme (mais reste dans le dénominateur applicable).
    function computeScores(ref) {
        const g = { total: 0, evaluated: 0, applicable: 0, conformes: 0, partiels: 0, matSum: 0 };
        const domaines = ref.domaines.map(d => {
            const dd = { id: d.id, nom: d.nom, court: d.court || d.nom, total: 0, evaluated: 0, applicable: 0, conformes: 0, partiels: 0, matSum: 0 };
            d.exigences.forEach(ex => {
                const ev = DataStore.getEvaluation(ref.id, ex.code);
                const statut = ev ? (ev.statut || "") : "";
                const mat = ev ? (Number(ev.maturite) || 0) : 0;
                dd.total++; g.total++;
                if (statut && statut !== "") { dd.evaluated++; g.evaluated++; }
                if (statut === "non applicable") return;
                dd.applicable++; g.applicable++;
                dd.matSum += mat; g.matSum += mat;
                if (statut === "conforme") { dd.conformes++; g.conformes++; }
                if (statut === "partiellement conforme") { dd.partiels++; g.partiels++; }
            });
            dd.maturite = dd.applicable ? (dd.matSum / dd.applicable) : 0;
            dd.conformite = dd.applicable ? Math.round((dd.conformes / dd.applicable) * 100) : null;
            return dd;
        });
        g.maturite = g.applicable ? (g.matSum / g.applicable) : 0;
        g.conformite = g.applicable ? Math.round((g.conformes / g.applicable) * 100) : null;
        return { global: g, domaines };
    }

    function maturiteColor(m) {   // m sur 5 — teinte indicative (non sémantique de statut)
        if (m >= 4) return "var(--color-success)";
        if (m >= 2.5) return "var(--color-warning)";
        if (m > 0) return "var(--color-danger)";
        return "var(--color-gray)";
    }

    /* =========================
       AXES DU RADAR
    ========================== */
    // Par défaut : un axe par domaine thématique (libellé court). Pour un
    // référentiel doté de domaines de classification (`clLabels`, ex. AirCyber
    // CL0-CL6), le profil est calculé PAR DOMAINE CL : chaque axe agrège toutes
    // les questions portant ce code CL, quel que soit leur thème. Mêmes règles
    // que computeScores (« non applicable » exclu ; « non évalué » compte 0 dans
    // le dénominateur applicable). Les questions sans code CL ne sont pas
    // représentées (elles restent comptées partout ailleurs).
    // Valeur d'un axe : taux de « Oui » pour un questionnaire, maturité/5 sinon.
    // `niveau` (optionnel) restreint le calcul aux questions de ce niveau de label.
    function computeClAxes(ref, niveau) {
        if (!ref.clLabels) return null;
        const quest = isQuestionnaire(ref);
        const codes = Object.keys(ref.clLabels).sort();
        const acc = {};
        codes.forEach(c => { acc[c] = { total: 0, applicable: 0, matSum: 0, oui: 0 }; });
        ref.domaines.forEach(d => d.exigences.forEach(ex => {
            if (!ex.cl || !acc[ex.cl]) return;
            if (niveau && ex.niveau !== niveau) return;
            acc[ex.cl].total++;
            const ev = DataStore.getEvaluation(ref.id, ex.code);
            const statut = ev ? (ev.statut || "") : "";
            if (statut === "non applicable") return;
            acc[ex.cl].applicable++;
            acc[ex.cl].matSum += ev ? (Number(ev.maturite) || 0) : 0;
            if (statut === "conforme") acc[ex.cl].oui++;
        }));
        return codes.filter(c => acc[c].total > 0).map(c => ({
            label: wrapLabel(c + " · " + ref.clLabels[c]),
            value: quest
                ? (acc[c].applicable ? acc[c].oui / acc[c].applicable : 0)
                : (acc[c].applicable ? acc[c].matSum / acc[c].applicable : 0) / 5
        }));
    }

    // Coupe un libellé long en 2 lignes max (coupure aux mots, ~22 caractères).
    function wrapLabel(txt) {
        if (txt.length <= 22) return txt;
        const words = txt.split(" ");
        const lines = [""];
        words.forEach(w => {
            const cur = lines[lines.length - 1];
            if (cur && (cur + " " + w).length > 22) lines.push(w);
            else lines[lines.length - 1] = cur ? cur + " " + w : w;
        });
        if (lines.length > 2) lines.splice(2, lines.length - 2, lines.slice(2).join(" "));
        return lines;
    }

    // Axes du radar d'un référentiel : domaines CL si définis, sinon thématiques.
    // `niveau` ne concerne que les référentiels à domaines CL (AirCyber).
    function radarAxesFor(ref, sc, niveau) {
        return computeClAxes(ref, niveau) || sc.domaines.map(d => ({ label: d.court, value: d.maturite / 5 }));
    }

    /* =========================
       SÉLECTEUR DE NIVEAU DU RADAR (questionnaire AirCyber)
    ========================== */
    // État du rendu courant de la fiche : "" = global, sinon bronze/silver/gold.
    let radarNiveau = "";

    function radarLevelsHtml() {
        const btns = [{ v: "", label: "Global" }].concat(NIVEAUX.map(n => ({ v: n.v, label: n.label })));
        return `<div class="ref-radar-levels" id="ref-radar-levels" role="group" aria-label="Niveau de label affiché dans le radar">
            ${btns.map(b => `<button type="button" class="ref-filter-niv ${radarNiveau === b.v ? "active" : ""}" data-niv="${b.v}">${b.label}</button>`).join("")}
            ${Help.tip("Affichez le profil par domaine au global ou restreint aux seules questions d'un niveau de label (Bronze, Argent, Or) : une vue granulaire pour préparer le niveau visé.")}
        </div>`;
    }

    function radarColor() { return NIVEAU_COLORS[radarNiveau] || ""; }

    // Note sous le radar : nombre de questions représentées par la vue courante.
    function radarNoteText(ref) {
        let n = 0;
        ref.domaines.forEach(d => d.exigences.forEach(ex => {
            if (ex.cl && (!radarNiveau || ex.niveau === radarNiveau)) n++;
        }));
        const nm = niveauMeta(radarNiveau);
        return nm ? `${n} question(s) de niveau ${nm.label}.` : `${n} questions rattachées à un domaine CL.`;
    }

    /* =========================
       RADAR SVG (maturité par domaine)
    ========================== */
    function radarSvg(axes, color, ariaLabel) {
        const col = color || "var(--primary)";
        const n = axes.length;
        if (!n) return "";
        // Libellés multi-lignes (domaines CL) → viewBox élargie pour éviter la coupe.
        const isMulti = axes.some(a => Array.isArray(a.label));
        const W = isMulti ? 600 : 520, H = 430, cx = W / 2, cy = 205, R = 140;
        const rings = [0.25, 0.5, 0.75, 1];
        const ang = i => (-90 + i * 360 / n) * Math.PI / 180;
        const pt = (i, r) => [cx + Math.cos(ang(i)) * R * r, cy + Math.sin(ang(i)) * R * r];
        const fmt = ([x, y]) => x.toFixed(1) + "," + y.toFixed(1);

        const grid = rings.map(r =>
            `<polygon points="${axes.map((_, i) => fmt(pt(i, r))).join(" ")}" fill="none" stroke="var(--border)" stroke-width="1"/>`
        ).join("");
        const spokes = axes.map((_, i) => {
            const [x, y] = pt(i, 1);
            return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
        }).join("");
        const dataPts = axes.map((a, i) => fmt(pt(i, Math.max(0, Math.min(1, a.value))))).join(" ");
        const dataPoly = `<polygon points="${dataPts}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="2"/>`;
        const dots = axes.map((a, i) => {
            const [x, y] = pt(i, Math.max(0, Math.min(1, a.value)));
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${col}"/>`;
        }).join("");
        const labels = axes.map((a, i) => {
            const lines = Array.isArray(a.label) ? a.label : [a.label];
            const [x, y] = pt(i, 1.14);
            const cosA = Math.cos(ang(i)), sinA = Math.sin(ang(i));
            const anchor = cosA > 0.3 ? "start" : (cosA < -0.3 ? "end" : "middle");
            let dy = sinA > 0.5 ? 12 : (sinA < -0.5 ? -6 : 4);
            // Bloc multi-ligne : au-dessus du radar il s'étend vers le haut,
            // sur les côtés il se centre verticalement.
            if (sinA < -0.5) dy -= (lines.length - 1) * 12;
            else if (sinA <= 0.5) dy -= (lines.length - 1) * 6;
            const tspans = lines.map((l, k) =>
                `<tspan x="${x.toFixed(1)}" dy="${k === 0 ? 0 : 12}">${escapeHtml(l)}</tspan>`
            ).join("");
            return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="var(--text-muted)">${tspans}</text>`;
        }).join("");

        return `<svg viewBox="0 0 ${W} ${H}" class="ref-radar-svg" role="img" aria-label="${ariaLabel || "Radar de maturité par domaine"}">${grid}${spokes}${dataPoly}${dots}${labels}</svg>`;
    }

    /* =========================
       LISTE DES RÉFÉRENTIELS
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const refs = (typeof Referentiels !== "undefined") ? Referentiels.all() : [];

        const cards = refs.map(ref => {
            const sc = computeScores(ref);
            const axes = radarAxesFor(ref, sc);
            const pctEval = sc.global.total ? Math.round((sc.global.evaluated / sc.global.total) * 100) : 0;
            const conf = sc.global.conformite;
            const isQ = isQuestionnaire(ref);
            const s = scoreOf(sc.global);
            const kpis = isQ
                ? `<div class="ref-kpi">
                        <div class="ref-kpi__val" style="color:${s.col};">${s.html}</div>
                        <div class="ref-kpi__lbl">Score de conformité ${Help.tip(SCORE_AIDE)}</div>
                    </div>
                    <div class="ref-kpi">
                        <div class="ref-kpi__val">${sc.global.conformes}<span>/${sc.global.applicable}</span></div>
                        <div class="ref-kpi__lbl">Réponses « Oui » ${Help.tip("Questions répondues « Oui » sur le total des questions applicables (les N/A sont exclues).")}</div>
                    </div>
                    <div class="ref-kpi">
                        <div class="ref-kpi__val">${sc.global.evaluated}<span>/${sc.global.total}</span></div>
                        <div class="ref-kpi__lbl">Questions évaluées</div>
                    </div>`
                : `<div class="ref-kpi">
                        <div class="ref-kpi__val" style="color:${maturiteColor(sc.global.maturite)};">${sc.global.maturite.toFixed(1)}<span>/5</span></div>
                        <div class="ref-kpi__lbl">Maturité moyenne ${Help.tip(MATURITE_AIDE)}</div>
                    </div>
                    <div class="ref-kpi">
                        <div class="ref-kpi__val">${conf === null ? "—" : conf + "<span>%</span>"}</div>
                        <div class="ref-kpi__lbl">Conformité ${Help.tip("Part des mesures applicables jugées « conformes » (les mesures non applicables sont exclues).")}</div>
                    </div>
                    <div class="ref-kpi">
                        <div class="ref-kpi__val">${sc.global.evaluated}<span>/${sc.global.total}</span></div>
                        <div class="ref-kpi__lbl">Mesures évaluées</div>
                    </div>`;
            return `
                <div class="dashboard-card ref-card">
                    <div class="ref-card__head">
                        <div>
                            <h3 style="margin:0;">${escapeHtml(ref.nom)}</h3>
                            <p style="color:var(--text-muted); font-size:0.85rem; margin:4px 0 0;">${escapeHtml(ref.editeur)} · ${escapeHtml(ref.version)}</p>
                        </div>
                        <span class="badge">${sc.global.total} ${isQ ? "questions" : "mesures"}</span>
                    </div>
                    <p style="color:var(--text-muted); font-size:0.9rem; margin:10px 0 14px;">${escapeHtml(ref.description)}</p>

                    <div class="ref-kpis">${kpis}</div>
                    <div class="progress-bar small" style="margin:6px 0 16px;"><div class="progress-fill" style="width:${pctEval}%; background:var(--accent);"></div></div>

                    <div class="ref-radar">${radarSvg(axes, "", isQ ? "Radar de conformité par domaine" : "")}</div>

                    <button class="ref-open" data-id="${ref.id}" style="width:100%; justify-content:center; background:var(--primary);">Évaluer ce référentiel</button>
                </div>`;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Référentiels de sécurité</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Auto-évaluez votre conformité et suivez votre maturité par domaine. ${Help.tip("Un référentiel est un ensemble structuré de bonnes pratiques (ANSSI, ISO 27001, NIS2…). L'auto-évaluation situe votre organisation et alimente le plan d'actions.")}</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <a href="#/mapping" class="btn-secondary">Correspondances →</a>
                        <a href="#/couverture" class="btn-secondary">Couverture croisée →</a>
                    </div>
                </div>

                ${refs.length === 0
                    ? `<div class="empty-state"><h3>Aucun référentiel chargé</h3><p>Le catalogue de référentiels n'a pas pu être chargé.</p></div>`
                    : `<div class="ref-grid">${cards}</div>`}

                <div class="dashboard-card" style="margin-top:1.5rem;">
                    <h3 style="margin-top:0;">Éviter la double saisie : le pivot « Mesure de sécurité »</h3>
                    <p style="color:var(--text-muted); font-size:0.9rem;">Une même <strong>mesure de sécurité</strong> (MFA, sauvegardes, cloisonnement…) couvre souvent des exigences de <em>plusieurs</em> référentiels. Reliez vos exigences à une <a href="#/mesures" style="color:var(--accent);">mesure de sécurité</a>, évaluez-la une fois puis <strong>propagez</strong> : le statut s'applique partout. Voyez les recouvrements dans la <a href="#/couverture" style="color:var(--accent);">couverture croisée</a> et gagnez du temps avec les <a href="#/mapping" style="color:var(--accent);">correspondances inter-référentiels</a> (relier tout un thème à une mesure d'un clic).</p>
                </div>
            </section>`;

        app.querySelectorAll(".ref-open").forEach(btn => {
            btn.onclick = () => Router.navigateTo("/referentiels/" + btn.dataset.id);
        });
    }

    /* =========================
       DÉTAIL / AUTO-ÉVALUATION D'UN RÉFÉRENTIEL
    ========================== */
    function renderDetail(id) {
        const app = document.getElementById("app");
        const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(id) : null;

        if (!ref) {
            app.innerHTML = `<section class="page"><h1>Référentiel introuvable</h1><p>Ce référentiel n'existe pas ou n'est plus disponible.</p><button onclick="Router.navigateTo('/referentiels')">Retour aux référentiels</button></section>`;
            return;
        }

        const sc = computeScores(ref);
        const isQ = isQuestionnaire(ref);
        radarNiveau = "";   // la fiche s'ouvre toujours sur le profil global
        const showNiv = hasNiveaux(ref);
        const readinessHtml = showNiv ? niveauReadinessHtml(computeNiveauReadiness(ref)) : "";
        const filtersHtml = showNiv ? filterBarHtml(ref) : "";

        const domainSections = ref.domaines.map((d, di) => {
            const dsc = sc.domaines[di];
            const ds = scoreOf(dsc);
            const rows = d.exigences.map(ex => rowHtml(ref, ex)).join("");
            return `
                <details class="ref-domain" ${di === 0 ? "open" : ""}>
                    <summary>
                        <span class="ref-domain__name">${escapeHtml(d.nom)} ${d.aide ? Help.tip(d.aide) : ""}</span>
                        <span class="ref-domain__score">
                            <span class="ref-domain__mat" data-dom="${d.id}" style="color:${isQ ? ds.col : maturiteColor(dsc.maturite)};">${isQ ? ds.txt : dsc.maturite.toFixed(1) + "/5"}</span>
                            <span class="ref-domain__count" data-dom="${d.id}">${dsc.evaluated}/${dsc.total} évaluées</span>
                        </span>
                    </summary>
                    <table class="data-table ref-table">
                        <thead>
                            <tr>
                                <th style="width:52px;">N°</th>
                                <th>${isQ ? "Question" : "Mesure"}</th>
                                <th style="width:200px;">${isQ ? `Réponse ${Help.tip("Oui : la pratique est en place. Non : elle ne l'est pas. N/A : la question ne s'applique pas à votre contexte (exclue du score).")}` : "Statut"}</th>
                                ${isQ ? "" : `<th style="width:96px; text-align:center;">Maturité ${Help.tip(MATURITE_AIDE)}</th>`}
                                <th style="width:90px; text-align:center;">Détail</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </details>`;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(ref.nom)}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">${escapeHtml(ref.editeur)} · ${escapeHtml(ref.version)} — <a href="#/referentiels" style="color:var(--accent);">tous les référentiels</a></p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        ${ref.id === "aircyber" ? `<input type="file" id="aircyberCsv" accept=".csv" hidden><button id="importCsvBtn" class="btn-secondary" title="Importer vos réponses depuis l'export CSV du questionnaire AirCyber">Importer mes réponses (CSV)</button>` : ""}
                        <a href="#/soa/${escapeHtml(ref.id)}" class="btn-secondary">Déclaration d'applicabilité (SoA)</a>
                        <button id="resetRefBtn" style="background:transparent; color:var(--text-muted); border:1px solid var(--border);">Réinitialiser</button>
                    </div>
                </div>

                <div class="synthese-message info" style="padding:10px; font-size:0.9rem;">${escapeHtml(ref.aide)}</div>

                <div class="dashboard-grid ref-detail-grid">
                    <div class="dashboard-card ref-scorecard">
                        <h3 style="margin-top:0;">${isQ ? "Profil de conformité par domaine" : "Profil de maturité par domaine"}</h3>
                        ${showNiv && ref.clLabels ? radarLevelsHtml() : ""}
                        <div class="ref-radar" id="ref-radar">${radarSvg(radarAxesFor(ref, sc, radarNiveau), radarColor(), isQ ? "Radar de conformité par domaine" : "")}</div>
                        ${ref.clLabels ? `<p style="font-size:0.78rem; color:var(--text-muted); margin:10px 0 0;">Axes : domaines de classification (${escapeHtml(Object.keys(ref.clLabels).sort().join(", "))}) — <span id="ref-radar-note">${escapeHtml(radarNoteText(ref))}</span> ${Help.tip(isQ ? "Chaque axe agrège toutes les questions du domaine de classification (CL), indépendamment du chapitre du questionnaire. Valeur de l'axe : part de réponses « Oui » parmi les questions applicables (N/A exclues ; une question non répondue compte comme « Non »). Les questions sans domaine CL connu ne sont pas représentées dans le radar mais restent comptées dans la synthèse et les scores par chapitre." : "Chaque axe agrège toutes les questions du domaine de classification (CL), indépendamment du chapitre du questionnaire. Les questions sans domaine CL connu ne sont pas représentées dans le radar mais restent comptées dans la synthèse et les scores par chapitre.")}</p>` : ""}
                    </div>
                    <div class="dashboard-card">
                        <h3 style="margin-top:0;">Synthèse</h3>
                        <div class="ref-kpis ref-kpis--stack">
                            ${isQ ? `
                            <div class="ref-kpi">
                                <div class="ref-kpi__val" id="kpi-score" style="color:${scoreOf(sc.global).col};">${scoreOf(sc.global).html}</div>
                                <div class="ref-kpi__lbl">Score de conformité ${Help.tip(SCORE_AIDE)}</div>
                            </div>
                            <div class="ref-kpi">
                                <div class="ref-kpi__val" id="kpi-oui">${sc.global.conformes}<span>/${sc.global.applicable}</span></div>
                                <div class="ref-kpi__lbl">Réponses « Oui » ${Help.tip("Questions répondues « Oui » sur le total des questions applicables (les N/A sont exclues).")}</div>
                            </div>` : `
                            <div class="ref-kpi">
                                <div class="ref-kpi__val" id="kpi-mat" style="color:${maturiteColor(sc.global.maturite)};">${sc.global.maturite.toFixed(1)}<span>/5</span></div>
                                <div class="ref-kpi__lbl">Maturité moyenne</div>
                            </div>
                            <div class="ref-kpi">
                                <div class="ref-kpi__val" id="kpi-conf">${sc.global.conformite === null ? "—" : sc.global.conformite + "<span>%</span>"}</div>
                                <div class="ref-kpi__lbl">Conformité</div>
                            </div>`}
                            <div class="ref-kpi">
                                <div class="ref-kpi__val" id="kpi-eval">${sc.global.evaluated}<span>/${sc.global.total}</span></div>
                                <div class="ref-kpi__lbl">${isQ ? "Questions évaluées" : "Mesures évaluées"}</div>
                            </div>
                        </div>
                        <p style="font-size:0.82rem; color:var(--text-muted); margin-top:14px;">${isQ
                            ? `Répondez <strong>Oui / Non / N-A</strong> à chaque question ci-dessous : le score et le radar se mettent à jour en temps réel. Ouvrez le <strong>Détail</strong> d'une question pour ajouter un commentaire, des preuves et des actions correctives.`
                            : `Renseignez chaque mesure ci-dessous : le statut et la maturité mettent à jour le radar en temps réel. Ouvrez le <strong>Détail</strong> d'une mesure pour ajouter un commentaire, des preuves et des actions correctives.`}</p>
                        <div id="ref-readiness-box">${readinessHtml}</div>
                    </div>
                </div>

                ${filtersHtml}
                <div id="ref-domains">${domainSections}</div>
            </section>`;

        wireDetail(ref);
    }

    // Ligne d'une mesure (2 <tr> : la ligne principale + une ligne de détail repliable).
    function rowHtml(ref, ex) {
        const isQ = isQuestionnaire(ref);
        const ev = DataStore.getEvaluation(ref.id, ex.code);
        const statut = ev ? (ev.statut || "") : "";
        const mat = ev ? (Number(ev.maturite) || 0) : 0;
        const meta = statutMeta(statut);
        const actionsCount = ev ? DataStore.getActionsByEvaluation(ev.id).length : 0;

        // Statut hérité hors liste (ex : « partiellement conforme » propagé sur un
        // questionnaire) : on l'injecte pour ne pas masquer la valeur enregistrée.
        const statuts = statutsFor(ref).slice();
        if (statut && !statuts.some(s => s.v === statut)) statuts.push(statutMeta(statut));
        const statutOpts = statuts.map(s => `<option value="${s.v}" ${s.v === statut ? "selected" : ""}>${s.label}</option>`).join("");
        const matOpts = MATURITES.map(m => `<option value="${m.v}" ${m.v === mat ? "selected" : ""}>${m.v}</option>`).join("");

        // Badges de métadonnées (AirCyber) : niveau de label, priorité, domaine CL.
        const badges = [];
        const nm = ex.niveau ? niveauMeta(ex.niveau) : null;
        if (nm) badges.push(`<span class="niv-badge ${nm.cls}" title="Niveau de label AirCyber">${nm.label}</span>`);
        if (ex.priorite && PRIOS[ex.priorite]) badges.push(`<span class="prio-badge ${PRIOS[ex.priorite].cls}" title="Priorité">${PRIOS[ex.priorite].label}</span>`);
        if (ex.cl) badges.push(`<span class="cl-badge" title="${escapeHtml(clLabelOf(ref, ex.cl))}">${escapeHtml(ex.cl)}</span>`);
        const badgesHtml = badges.length ? ` <span class="ref-badges">${badges.join("")}</span>` : "";

        return `
            <tr class="ref-row" data-code="${ex.code}" data-niveau="${escapeHtml(ex.niveau || "")}" data-cl="${escapeHtml(ex.cl || "")}">
                <td><strong>${escapeHtml(ex.code)}</strong></td>
                <td>${escapeHtml(ex.titre)} ${ex.aide ? Help.tip(ex.aide) : ""}${badgesHtml}</td>
                <td><select class="ref-statut sel-${meta.cls}" data-code="${ex.code}" aria-label="${isQ ? "Réponse à la question" : "Statut de la mesure"} ${escapeHtml(ex.code)}">${statutOpts}</select></td>
                ${isQ ? "" : `<td style="text-align:center;"><select class="ref-mat" data-code="${ex.code}" aria-label="Maturité de la mesure ${escapeHtml(ex.code)}">${matOpts}</select></td>`}
                <td style="text-align:center;"><button class="ref-toggle" data-toggle="${ex.code}" aria-expanded="false" title="Ouvrir le détail">Détail${actionsCount ? ` <span class="ref-badge-count">${actionsCount}</span>` : ""}</button></td>
            </tr>
            <tr class="ref-detail-row" data-detail="${ex.code}" hidden>
                <td colspan="${isQ ? 4 : 5}">${detailPanelHtml(ref, ex, ev)}</td>
            </tr>`;
    }

    function detailPanelHtml(ref, ex, ev) {
        const commentaire = ev ? (ev.commentaire || "") : "";
        const preuves = ev ? (ev.preuves || "") : "";
        const mesureId = ev ? (ev.mesure_id || "") : "";
        const mesures = DataStore.getMesures();
        const linked = mesureId ? DataStore.getMesureById(mesureId) : null;
        const mesureOpts = `<option value="">— Aucune —</option>` +
            mesures.map(m => `<option value="${m.id}" ${m.id === mesureId ? "selected" : ""}>${escapeHtml(m.nom)}</option>`).join("");

        return `
            <div class="ref-detail-panel">
                <div class="ref-detail-grid2">
                    <div class="form-group" style="margin:0;">
                        <label>Commentaire / justification</label>
                        <textarea class="ref-comment" data-code="${ex.code}" placeholder="État des lieux, écarts constatés, décisions…">${escapeHtml(commentaire)}</textarea>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label>Preuves ${Help.tip("Références des éléments justifiant l'évaluation : procédure, capture, ticket, nom de document… (l'application ne stocke pas les fichiers).")}</label>
                        <textarea class="ref-preuves" data-code="${ex.code}" placeholder="Ex : PSSI §4.2, export AD du 12/03, ticket #1240…">${escapeHtml(preuves)}</textarea>
                    </div>
                </div>

                <div class="ref-mesure-row">
                    <label>Couverte par la mesure de sécurité ${Help.tip("Reliez cette exigence à une « mesure de sécurité » transverse. En évaluant la mesure puis en la propageant, vous mettez à jour d'un coup toutes les exigences qu'elle couvre (zéro double saisie).")}</label>
                    <div class="ref-mesure-controls">
                        <select class="ref-mesure" data-code="${ex.code}" aria-label="Mesure de sécurité couvrant l'exigence ${escapeHtml(ex.code)}">${mesureOpts}</select>
                        <button type="button" class="ref-new-mesure" data-code="${ex.code}">＋ Nouvelle</button>
                        ${linked ? `<a href="#/mesures/${linked.id}" class="ref-mesure-link">Ouvrir la fiche →</a>` : ""}
                    </div>
                </div>

                <div class="ref-actions-block" data-code="${ex.code}">
                    ${actionsBlockHtml(ref, ex.code)}
                </div>
            </div>`;
    }

    // Re-rend le panneau de détail d'une mesure (après lien/création de mesure).
    function refreshPanel(ref, code) {
        const root = document.getElementById("ref-domains");
        const cell = root && root.querySelector(`tr.ref-detail-row[data-detail="${cssEsc(code)}"] > td`);
        if (!cell) return;
        const ex = (typeof Referentiels !== "undefined") ? Referentiels.findExigence(ref, code) : { code };
        const ev = DataStore.getEvaluation(ref.id, code);
        cell.innerHTML = detailPanelHtml(ref, ex || { code }, ev);
    }

    // Bloc « actions correctives » d'une mesure (liste + formulaire de création).
    function actionsBlockHtml(ref, code) {
        const ev = DataStore.getEvaluation(ref.id, code);
        const actions = ev ? DataStore.getActionsByEvaluation(ev.id) : [];
        const list = actions.length
            ? `<ul class="ref-actions-list">${actions.map(a => `
                    <li>
                        <a href="#/actions/${a.id}" style="color:var(--accent);">${escapeHtml(a.titre)}</a>
                        <span class="status ${statutClassForAction(a.statut)}" style="margin-left:8px;">${escapeHtml(a.statut)}</span>
                    </li>`).join("")}</ul>`
            : `<p style="color:var(--text-muted); font-size:0.85rem; margin:4px 0;">Aucune action corrective planifiée.</p>`;

        return `
            <div class="ref-actions-head">
                <strong>Actions correctives ${Help.tip("Planifiez une action pour combler un écart. Elle apparaît dans le plan d'actions global, tracée jusqu'à cette mesure du référentiel.")}</strong>
                <button class="ref-add-action" data-code="${code}" style="font-size:0.8rem; padding:4px 10px;">Planifier une action</button>
            </div>
            ${list}
            <form class="ref-action-form" data-code="${code}" hidden>
                <div class="ref-action-form__row">
                    <input class="ref-act-titre" placeholder="Intitulé de l'action *" />
                    <select class="ref-act-prio">
                        <option value="Basse">Basse</option>
                        <option value="Moyenne" selected>Moyenne</option>
                        <option value="Haute">Haute</option>
                        <option value="Critique">Critique</option>
                    </select>
                    <input type="date" class="ref-act-echeance" />
                    <button type="button" class="ref-act-save" data-code="${code}">Créer</button>
                </div>
            </form>`;
    }

    function statutClassForAction(statut) {
        const s = String(statut).toLowerCase();
        if (s === "terminée") return "status-conforme";
        if (s === "en cours") return "status-partiellement-conforme";
        return "status-non-conforme";
    }

    /* =========================
       INTERACTIONS (délégation)
    ========================== */
    function wireDetail(ref) {
        const root = document.getElementById("ref-domains");
        if (!root) return;

        // Lit l'état complet d'une ligne dans le DOM (pour un upsert cohérent).
        function persist(code) { return DataStore.upsertEvaluation(readRowState(ref, code, root)); }

        // Changement de statut ou de maturité → persiste + rafraîchit scores/badges.
        root.addEventListener("change", (e) => {
            const el = e.target;
            if (el.classList.contains("ref-statut") || el.classList.contains("ref-mat")) {
                const code = el.dataset.code;
                persist(code);
                updateRowBadge(code);
                refreshScores(ref);
            } else if (el.classList.contains("ref-mesure")) {
                // Lien vers une mesure de sécurité (pivot) → enregistre mesure_id.
                const code = el.dataset.code;
                const state = readRowState(ref, code, root);
                state.mesure_id = el.value || null;
                DataStore.upsertEvaluation(state);
                refreshPanel(ref, code);
            }
        });

        // Commentaire / preuves : persistance à la perte de focus.
        root.addEventListener("blur", (e) => {
            const el = e.target;
            if (el.classList.contains("ref-comment") || el.classList.contains("ref-preuves")) {
                persist(el.dataset.code);
            }
        }, true);

        // Clics : repli/détail, ouverture du formulaire d'action, création d'action.
        root.addEventListener("click", (e) => {
            const toggle = e.target.closest(".ref-toggle");
            if (toggle) {
                const code = toggle.dataset.toggle;
                const row = root.querySelector(`tr.ref-detail-row[data-detail="${cssEsc(code)}"]`);
                if (row) {
                    const nowHidden = !row.hidden;
                    row.hidden = nowHidden;
                    toggle.setAttribute("aria-expanded", String(!nowHidden));
                }
                return;
            }
            const addBtn = e.target.closest(".ref-add-action");
            if (addBtn) {
                const form = root.querySelector(`form.ref-action-form[data-code="${cssEsc(addBtn.dataset.code)}"]`);
                if (form) { form.hidden = !form.hidden; if (!form.hidden) { const i = form.querySelector(".ref-act-titre"); if (i) i.focus(); } }
                return;
            }
            const saveBtn = e.target.closest(".ref-act-save");
            if (saveBtn) {
                createActionFor(ref, saveBtn.dataset.code, root);
                return;
            }
            const newMes = e.target.closest(".ref-new-mesure");
            if (newMes) {
                const code = newMes.dataset.code;
                const nom = prompt("Nom de la nouvelle mesure de sécurité :");
                if (nom && nom.trim()) {
                    const mid = UI.genId("MESURE");
                    DataStore.addMesure({ id: mid, nom: nom.trim(), description: "", statut: "", maturite: 0, responsable: "", updatedAt: Date.now() });
                    const state = readRowState(ref, code, root);
                    state.mesure_id = mid;
                    DataStore.upsertEvaluation(state);
                    if (window.showToast) window.showToast("Mesure créée et liée.", "success");
                    refreshPanel(ref, code);
                }
                return;
            }
        });

        document.getElementById("resetRefBtn").onclick = () => {
            const n = DataStore.getEvaluationsByRef(ref.id).length;
            if (n === 0) { if (window.showToast) window.showToast("Aucune évaluation à réinitialiser.", "info"); return; }
            if (confirm(`Réinitialiser l'évaluation de « ${ref.nom} » ?\n${n} évaluation(s) et leurs actions correctives seront supprimées.`)) {
                DataStore.deleteEvaluationsByRef(ref.id);
                if (window.showToast) window.showToast("Évaluation réinitialisée.", "success");
                renderDetail(ref.id);
            }
        };

        // Import des réponses depuis un export CSV (AirCyber).
        const importBtn = document.getElementById("importCsvBtn");
        const csvInput = document.getElementById("aircyberCsv");
        if (importBtn && csvInput) {
            importBtn.onclick = () => {
                if (!confirm("Importer vos réponses écrasera les réponses actuelles de ce questionnaire pour les questions concernées (Oui, Non ou N/A selon le fichier). Continuer ?")) return;
                csvInput.click();
            };
            csvInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    const res = importAnswersFromCsv(ref, ev.target.result);
                    if (window.showToast) window.showToast(`Import terminé : ${res.imported} réponse(s) appliquée(s)${res.skipped ? `, ${res.skipped} ignorée(s)` : ""}.`, res.imported ? "success" : "info");
                    renderDetail(ref.id);
                };
                reader.readAsText(file);
                csvInput.value = "";
            };
        }

        // Sélecteur de niveau du radar (Global / Bronze / Argent / Or — AirCyber).
        const radarLevels = document.getElementById("ref-radar-levels");
        if (radarLevels) {
            radarLevels.querySelectorAll(".ref-filter-niv").forEach(btn => btn.addEventListener("click", () => {
                radarNiveau = btn.dataset.niv || "";
                radarLevels.querySelectorAll(".ref-filter-niv").forEach(b => b.classList.toggle("active", b === btn));
                refreshRadar(ref);
            }));
        }

        // Filtres par niveau de label / domaine CL (AirCyber).
        const filters = document.getElementById("ref-filters");
        if (filters) {
            const applyFilters = () => {
                const activeBtn = filters.querySelector(".ref-filter-niv.active");
                const niv = activeBtn ? (activeBtn.dataset.niv || "") : "";
                const clSel = document.getElementById("ref-filter-cl");
                const cl = clSel ? clSel.value : "";
                const rootEl = document.getElementById("ref-domains");
                rootEl.querySelectorAll("tr.ref-detail-row").forEach(dr => dr.hidden = true);
                rootEl.querySelectorAll(".ref-toggle").forEach(t => t.setAttribute("aria-expanded", "false"));
                let shown = 0;
                rootEl.querySelectorAll("details.ref-domain").forEach(det => {
                    let vis = 0;
                    det.querySelectorAll("tr.ref-row").forEach(row => {
                        const ok = (!niv || row.dataset.niveau === niv) && (!cl || row.dataset.cl === cl);
                        row.style.display = ok ? "" : "none";
                        if (ok) { vis++; shown++; }
                    });
                    det.style.display = vis ? "" : "none";
                    if (vis && (niv || cl)) det.open = true;
                });
                const cnt = document.getElementById("ref-filter-count");
                if (cnt) cnt.textContent = (niv || cl) ? `${shown} question(s) affichée(s)` : "";
            };
            filters.querySelectorAll(".ref-filter-niv").forEach(btn => btn.addEventListener("click", () => {
                filters.querySelectorAll(".ref-filter-niv").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                applyFilters();
            }));
            const clSel = document.getElementById("ref-filter-cl");
            if (clSel) clSel.addEventListener("change", applyFilters);
        }
    }

    // Mappe les réponses d'un export CSV (Numéro ; Question ; Réponse) vers des
    // évaluations. Les questions d'inventaire d'outils et les codes hors référentiel
    // sont ignorés. Barème : Oui→conforme, Non→non conforme, N/A→non applicable,
    // Partiellement→partiel (héritage). Les autres réponses (noms d'outils, vide)
    // sont ignorées. La maturité CMMI n'est pas renseignée (sans objet pour un
    // questionnaire Oui/Non ; le score se calcule sur le statut seul).
    function importAnswersFromCsv(ref, text) {
        let rows;
        try {
            const clean = String(text || "").replace(/^﻿/, "");
            const wb = XLSX.read(clean, { type: "string", raw: true, FS: ";" });
            rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
        } catch (e) { console.error("Lecture CSV impossible", e); return { imported: 0, skipped: 0 }; }
        if (!rows || rows.length < 2) return { imported: 0, skipped: 0 };

        const header = rows[0].map(h => String(h || "").toLowerCase());
        let repCol = header.findIndex(h => h.indexOf("répon") >= 0 || h.indexOf("repon") >= 0);
        if (repCol < 0) repCol = rows[0].length - 1;
        const isTool = q => /^\s*quel(le)?s?\s+(outils?|solutions?)/i.test(String(q || ""));
        const MAP = {
            "oui": { statut: "conforme" },
            "non": { statut: "non conforme" },
            "partiellement conforme": { statut: "partiellement conforme" }
        };

        let imported = 0, skipped = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (!row) continue;
            const code = String(row[0] == null ? "" : row[0]).trim();
            const question = row[1];
            const ans = String(row[repCol] == null ? "" : row[repCol]).trim();
            if (!code || isTool(question)) continue;
            if (!Referentiels.findExigence(ref, code)) continue;   // code absent (ex : tool-picker exclu)
            const al = ans.toLowerCase();
            let mapped = MAP[al];
            if (!mapped && al.indexOf("n/a") === 0) mapped = { statut: "non applicable" };
            if (!mapped) { skipped++; continue; }                  // réponse vide ou non interprétable
            DataStore.upsertEvaluation({ ref_id: ref.id, code, statut: mapped.statut });
            imported++;
        }
        return { imported, skipped };
    }

    function createActionFor(ref, code, root) {
        const form = root.querySelector(`form.ref-action-form[data-code="${cssEsc(code)}"]`);
        if (!form) return;
        const titre = form.querySelector(".ref-act-titre").value.trim();
        if (!titre) { alert("L'intitulé de l'action est obligatoire."); return; }

        // Garantit l'existence de l'évaluation (pour disposer d'un evaluation_id).
        const ev = DataStore.upsertEvaluation(readRowState(ref, code, root));
        DataStore.addAction({
            id: UI.genId("ACT"),
            titre,
            priorite: form.querySelector(".ref-act-prio").value,
            statut: "à faire",
            responsable: "",
            echeance: form.querySelector(".ref-act-echeance").value,
            commentaire: "",
            exigence_id: null,
            risque_id: null,
            evaluation_id: ev.id
        });
        if (window.showToast) window.showToast("Action corrective créée et liée à la mesure.", "success");

        // Rafraîchit le bloc actions + le compteur de la ligne.
        const block = root.querySelector(`.ref-actions-block[data-code="${cssEsc(code)}"]`);
        if (block) block.innerHTML = actionsBlockHtml(ref, code);
        updateActionsCount(code, ref);
    }

    function readRowState(ref, code, root) {
        const q = sel => root.querySelector(`${sel}[data-code="${cssEsc(code)}"]`);
        const statutEl = q("select.ref-statut"), matEl = q("select.ref-mat");
        const comEl = q("textarea.ref-comment"), preEl = q("textarea.ref-preuves");
        const state = {
            ref_id: ref.id, code,
            statut: statutEl ? statutEl.value : "",
            commentaire: comEl ? comEl.value.trim() : "",
            preuves: preEl ? preEl.value.trim() : ""
        };
        // Questionnaire : pas de sélecteur de maturité — le champ est omis pour ne
        // pas écraser une valeur stockée (upsertEvaluation est une mise à jour partielle).
        if (matEl) state.maturite = Number(matEl.value) || 0;
        return state;
    }

    // Met à jour le compteur d'actions affiché sur le bouton « Détail ».
    function updateActionsCount(code, ref) {
        const root = document.getElementById("ref-domains");
        const btn = root && root.querySelector(`.ref-toggle[data-toggle="${cssEsc(code)}"]`);
        if (!btn) return;
        const ev = DataStore.getEvaluation(ref.id, code);
        const n = ev ? DataStore.getActionsByEvaluation(ev.id).length : 0;
        btn.innerHTML = "Détail" + (n ? ` <span class="ref-badge-count">${n}</span>` : "");
    }

    // Met à jour la pastille de statut d'une ligne (couleur du <select>).
    function updateRowBadge(code) {
        const root = document.getElementById("ref-domains");
        const sel = root && root.querySelector(`select.ref-statut[data-code="${cssEsc(code)}"]`);
        if (!sel) return;
        STATUTS.forEach(s => sel.classList.remove("sel-" + (s.cls || "")));
        sel.classList.add("sel-" + statutMeta(sel.value).cls);
    }

    // Recalcule et réinjecte le radar (vue de niveau courante) + sa note.
    function refreshRadar(ref, sc) {
        const radar = document.getElementById("ref-radar");
        if (!radar) return;
        const isQ = isQuestionnaire(ref);
        radar.innerHTML = radarSvg(radarAxesFor(ref, sc || computeScores(ref), radarNiveau), radarColor(), isQ ? "Radar de conformité par domaine" : "");
        const note = document.getElementById("ref-radar-note");
        if (note) note.textContent = radarNoteText(ref);
    }

    // Recalcule et réinjecte KPIs, radar et scores par domaine (sans re-render global).
    function refreshScores(ref) {
        const sc = computeScores(ref);
        const isQ = isQuestionnaire(ref);
        const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
        if (isQ) {
            const s = scoreOf(sc.global);
            setHtml("kpi-score", s.html);
            const kpiScore = document.getElementById("kpi-score"); if (kpiScore) kpiScore.style.color = s.col;
            setHtml("kpi-oui", sc.global.conformes + "<span>/" + sc.global.applicable + "</span>");
        } else {
            setHtml("kpi-mat", sc.global.maturite.toFixed(1) + "<span>/5</span>");
            const kpiMat = document.getElementById("kpi-mat"); if (kpiMat) kpiMat.style.color = maturiteColor(sc.global.maturite);
            setHtml("kpi-conf", sc.global.conformite === null ? "—" : sc.global.conformite + "<span>%</span>");
        }
        setHtml("kpi-eval", sc.global.evaluated + "<span>/" + sc.global.total + "</span>");
        if (hasNiveaux(ref)) setHtml("ref-readiness-box", niveauReadinessHtml(computeNiveauReadiness(ref)));

        refreshRadar(ref, sc);

        sc.domaines.forEach(d => {
            const matEl = document.querySelector(`.ref-domain__mat[data-dom="${cssEsc(d.id)}"]`);
            if (matEl) {
                if (isQ) { const ds = scoreOf(d); matEl.textContent = ds.txt; matEl.style.color = ds.col; }
                else { matEl.textContent = d.maturite.toFixed(1) + "/5"; matEl.style.color = maturiteColor(d.maturite); }
            }
            const cntEl = document.querySelector(`.ref-domain__count[data-dom="${cssEsc(d.id)}"]`);
            if (cntEl) cntEl.textContent = d.evaluated + "/" + d.total + " évaluées";
        });
    }

    // Échappe une valeur pour un sélecteur d'attribut CSS (les codes sont numériques,
    // mais on reste robuste).
    function cssEsc(v) {
        if (window.CSS && CSS.escape) return CSS.escape(v);
        return String(v).replace(/["\\\]]/g, "\\$&");
    }

    return { renderList, renderDetail };
})();
