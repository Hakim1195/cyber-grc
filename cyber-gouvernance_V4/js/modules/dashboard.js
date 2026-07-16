// Emplacement : js/modules/dashboard.js
// Nom du fichier : dashboard.js
//
// Tableau de bord « cockpit GRC » : vue de pilotage 360° agrégeant conformité,
// maturité des référentiels, risques (profil + cartographie F×G), plan d'actions
// (dont retards / échéances), inventaire des actifs et couverture du dispositif
// (BIA, PCA/PRA, tests, MCO, cellule de crise, audits, prestataires, mesures).
// 100 % frontend : tous les graphiques sont dessinés en SVG/HTML maison (aucune
// librairie), à partir des seules données du DataStore (API synchrone).

const DashboardModule = (() => {

    /* =========================
       UTILITAIRES
    ========================== */
    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    // Seuils de risque résiduel (alignés sur risques.js / DATA_MODEL.md).
    function getRiskColor(score) {
        if (score < 3) return "var(--color-success)";
        if (score < 8) return "var(--color-warning)";
        return "var(--color-danger)";
    }

    // Teinte indicative de maturité (0-5) — non sémantique de statut.
    function maturiteColor(m) {
        if (m >= 4) return "var(--color-success)";
        if (m >= 2.5) return "var(--color-warning)";
        if (m > 0) return "var(--color-danger)";
        return "var(--color-gray)";
    }

    // Teinte indicative d'un score de conformité (0-100 ou null) — questionnaires Oui/Non.
    function scoreColor(pct) {
        if (pct === null) return "var(--color-gray)";
        if (pct >= 90) return "var(--color-success)";
        if (pct >= 50) return "var(--color-warning)";
        return "var(--color-danger)";
    }

    /* =========================
       GRAPHIQUES MAISON (SVG / HTML)
    ========================== */

    // Donut (anneau) en SVG. segments : [{ value, color }]. Le centre affiche
    // une valeur principale (grande) et un sous-titre.
    function donutSvg(segments, centerMain, centerSub, size) {
        size = size || 150;
        const total = segments.reduce((s, x) => s + (x.value || 0), 0);
        const sw = Math.round(size * 0.16);
        const r = (size - sw) / 2 - 1;
        const c = size / 2;
        const C = 2 * Math.PI * r;

        let ring;
        if (total <= 0) {
            ring = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${sw}"/>`;
        } else {
            let off = 0;
            ring = segments.filter(s => s.value > 0).map(s => {
                const len = (s.value / total) * C;
                const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
                off += len;
                return el;
            }).join("");
        }
        const main = centerMain != null
            ? `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.24)}" font-weight="bold" fill="var(--text-main)">${escapeHtml(centerMain)}</text>`
            : "";
        const sub = centerSub
            ? `<text x="${c}" y="${c + size * 0.17}" text-anchor="middle" font-size="${Math.round(size * 0.093)}" fill="var(--text-muted)">${escapeHtml(centerSub)}</text>`
            : "";
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="dash-donut" role="img" aria-label="${escapeHtml((centerMain || "") + " " + (centerSub || ""))}">${ring}${main}${sub}</svg>`;
    }

    // Légende de donut. items : [{ color, label, value }].
    function legend(items) {
        return `<div class="donut-legend">${items.map(i => `
            <div class="lg-row">
                <span class="lg-dot" style="background:${i.color};"></span>
                <span class="lg-lbl">${escapeHtml(i.label)}</span>
                <span class="lg-val">${escapeHtml(String(i.value))}</span>
            </div>`).join("")}</div>`;
    }

    // Barre horizontale (HTML). valueLabel/caption optionnels.
    function hbar(label, value, max, color, valueLabel, caption) {
        const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
        return `
            <div class="hbar">
                <div class="hbar-top">
                    <span class="hbar-lbl">${escapeHtml(label)}</span>
                    <span class="hbar-val">${escapeHtml(valueLabel != null ? valueLabel : String(value))}</span>
                </div>
                <div class="hbar-track"><div class="hbar-fill" style="width:${pct}%; background:${color};"></div></div>
                ${caption ? `<div class="hbar-cap">${escapeHtml(caption)}</div>` : ""}
            </div>`;
    }

    // Cartographie des risques : matrice 4×4 (Fréquence × Gravité) en SVG, teintée
    // par la criticité brute F×G, bulles = nombre de risques dans la case.
    function heatmapSvg(risques) {
        const axes = [1, 2, 3, 4];
        const grid = {};
        axes.forEach(g => { grid[g] = { 1: 0, 2: 0, 3: 0, 4: 0 }; });
        const clamp = v => Math.min(Math.max(parseInt(v) || 1, 1), 4);
        risques.forEach(r => { grid[clamp(r.g_gravite)][clamp(r.f_frequence)]++; });

        const cs = 52, ox = 30, oy = 10, gap = 4;
        const W = ox + cs * 4 + 8;
        const H = oy + cs * 4 + 30;
        const cellColor = (f, g) => { const s = f * g; return s < 3 ? "var(--color-success)" : (s < 8 ? "var(--color-warning)" : "var(--color-danger)"); };

        let cells = "";
        // Lignes de haut en bas : gravité 4 (très grave) → 1.
        [4, 3, 2, 1].forEach((g, row) => {
            axes.forEach(f => {
                const x = ox + (f - 1) * cs, y = oy + row * cs;
                const n = grid[g][f];
                cells += `<rect x="${x}" y="${y}" width="${cs - gap}" height="${cs - gap}" rx="5" fill="${cellColor(f, g)}" fill-opacity="${n ? 0.92 : 0.16}"/>`;
                if (n) cells += `<text x="${(x + (cs - gap) / 2).toFixed(1)}" y="${(y + (cs - gap) / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="17" font-weight="bold" fill="#fff">${n}</text>`;
            });
        });
        // Repères d'axes : G (gravité) à gauche, F (fréquence) en bas.
        const yLbl = [4, 3, 2, 1].map((g, i) => `<text x="${ox - 8}" y="${(oy + i * cs + (cs - gap) / 2).toFixed(1)}" text-anchor="end" dominant-baseline="central" font-size="11" fill="var(--text-muted)">G${g}</text>`).join("");
        const xLbl = axes.map(f => `<text x="${(ox + (f - 1) * cs + (cs - gap) / 2).toFixed(1)}" y="${oy + 4 * cs + 12}" text-anchor="middle" font-size="11" fill="var(--text-muted)">F${f}</text>`).join("");
        const xCap = `<text x="${ox + 2 * cs}" y="${H - 2}" text-anchor="middle" font-size="10" fill="var(--text-muted)">Fréquence &#8594;</text>`;

        return `<svg viewBox="0 0 ${W} ${H}" class="dash-heat-svg" role="img" aria-label="Cartographie des risques par fréquence et gravité">${cells}${yLbl}${xLbl}${xCap}</svg>`;
    }

    // Mini-courbe (sparkline) SVG à partir d'une série de valeurs. Échelle auto
    // (min/max de la série) ; aire légère + ligne + point final.
    function sparklineSvg(values, color) {
        const W = 240, H = 54, pad = 5;
        const n = values.length;
        if (n < 2) return "";
        let min = Math.min.apply(null, values), max = Math.max.apply(null, values);
        if (min === max) { min -= 1; max += 1; }               // série plate → ligne centrée
        const x = i => pad + i * (W - 2 * pad) / (n - 1);
        const y = v => H - pad - (v - min) / (max - min) * (H - 2 * pad);
        const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const area = `${pad.toFixed(1)},${(H - pad).toFixed(1)} ${pts} ${(W - pad).toFixed(1)},${(H - pad).toFixed(1)}`;
        const last = values[n - 1];
        return `<svg viewBox="0 0 ${W} ${H}" class="trend-spark" role="img" aria-label="Courbe de tendance">
            <polygon points="${area}" fill="${color}" fill-opacity="0.10"/>
            <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="3" fill="${color}"/>
        </svg>`;
    }

    // Tuile de tendance : valeur courante + variation (colorée selon le sens
    // « meilleur ») + mini-courbe. cfg = { label, values[], higherIsBetter, unit,
    // decimals, help, color }.
    function trendTile(cfg) {
        const vals = (cfg.values || []).map(v => Number(v) || 0);
        const n = vals.length;
        const cur = n ? vals[n - 1] : 0;
        const dec = cfg.decimals || 0;
        const unit = cfg.unit || "";
        const color = cfg.color || "var(--accent)";

        let deltaHtml = "";
        if (n >= 2) {
            const delta = cur - vals[0];
            if (Math.abs(delta) < Math.pow(10, -dec) / 2) {
                deltaHtml = `<span class="trend-delta" style="color:var(--text-muted);">→ stable</span>`;
            } else {
                const good = cfg.higherIsBetter ? delta > 0 : delta < 0;
                const arrow = delta > 0 ? "▲" : "▼";
                const col = good ? "var(--color-success)" : "var(--color-danger)";
                deltaHtml = `<span class="trend-delta" style="color:${col};">${arrow} ${Math.abs(delta).toFixed(dec)}${unit}</span>`;
            }
        }
        const spark = sparklineSvg(vals, color);
        return `<div class="trend-tile">
            <div class="trend-tile__lbl">${escapeHtml(cfg.label)} ${cfg.help ? Help.tip(cfg.help) : ""}</div>
            <div class="trend-tile__val">${cur.toFixed(dec)}${unit ? `<small>${escapeHtml(unit)}</small>` : ""} ${deltaHtml}</div>
            <div class="trend-tile__spark">${spark || `<span class="trend-empty">La courbe apparaît dès le 2ᵉ point.</span>`}</div>
        </div>`;
    }

    // Tuile de couverture cliquable (valeur, libellé, sous-texte, route, teinte).
    function covTile(value, label, sub, route, tone) {
        return `
            <button class="cov-tile" onclick="Router.navigateTo('${route}')" title="Ouvrir : ${escapeHtml(label)}">
                <div class="cov-val" ${tone ? `style="color:${tone};"` : ""}>${value}</div>
                <div class="cov-lbl">${escapeHtml(label)}</div>
                ${sub ? `<div class="cov-sub">${sub}</div>` : ""}
            </button>`;
    }

    /* =========================
       AGRÉGATION MATURITÉ RÉFÉRENTIELS
       (réplique la sémantique de referentiels.js : moyenne sur les exigences
        applicables ; « non applicable » exclu ; « non évalué » = maturité 0.
        Les questionnaires Oui/Non — `scoring: "conformite"`, ex. AirCyber — n'ont
        pas d'échelle CMMI : exclus de la moyenne de maturité, `maturite: null`
        par référentiel ; ils restent comptés dans conformité et avancement.)
    ========================== */
    function computeReferentiels() {
        const refs = (typeof Referentiels !== "undefined") ? Referentiels.all() : [];
        let gMat = 0, gMatApp = 0, gApp = 0, gConf = 0, gEval = 0, gTot = 0;
        const perRef = refs.map(ref => {
            const quest = ref.scoring === "conformite";
            const flat = Referentiels.flatExigences(ref);
            let matSum = 0, app = 0, conf = 0, evalue = 0;
            flat.forEach(ex => {
                const ev = DataStore.getEvaluation(ref.id, ex.code);
                const statut = ev ? (ev.statut || "") : "";
                const mat = ev ? (Number(ev.maturite) || 0) : 0;
                if (statut) evalue++;
                if (statut === "non applicable") return;
                app++; matSum += mat;
                if (statut === "conforme") conf++;
            });
            if (!quest) { gMat += matSum; gMatApp += app; }
            gApp += app; gConf += conf; gEval += evalue; gTot += flat.length;
            return {
                id: ref.id, nom: ref.nom, editeur: ref.editeur, questionnaire: quest,
                total: flat.length, evaluated: evalue,
                maturite: quest ? null : (app ? matSum / app : 0),
                conformite: app ? Math.round((conf / app) * 100) : null
            };
        });
        return {
            perRef,
            global: {
                total: gTot, evaluated: gEval,
                maturite: gMatApp ? gMat / gMatApp : 0,
                conformite: gApp ? Math.round((gConf / gApp) * 100) : null
            }
        };
    }

    /* =========================
       INSTANTANÉ GLOBAL (pour l'historique des tendances)
       Toujours calculé sur le périmètre GLOBAL (indépendant du sélecteur de client)
       pour une série temporelle stable.
    ========================== */
    function computeGlobalSnapshot() {
        const norm = s => String(s || "").toLowerCase();

        const exAll = DataStore.getExigences();
        const nApplic = exAll.filter(e => e.statut_conformite !== "non applicable").length;
        const nConf = exAll.filter(e => e.statut_conformite === "conforme").length;
        const conformite = nApplic ? Math.round((nConf / nApplic) * 100) : 0;

        const ref = computeReferentiels();
        const maturite = Number((ref.global.maturite || 0).toFixed(2));

        const risques = DataStore.getRisques();
        const expo = Number(risques.reduce((a, r) => a + (r.score_residuel || 0), 0).toFixed(2));
        const risques_crit = risques.filter(r => (r.score_residuel || 0) >= 3).length;

        const actions = DataStore.getActions();
        const t0 = new Date(); t0.setHours(0, 0, 0, 0);
        const actions_retard = actions.filter(a => {
            if (norm(a.statut) === "terminée" || !a.echeance) return false;
            const d = new Date(a.echeance); d.setHours(0, 0, 0, 0);
            return d.getTime() < t0.getTime();
        }).length;
        const termine = actions.filter(a => norm(a.statut) === "terminée").length;
        const avancement = actions.length ? Math.round((termine / actions.length) * 100) : 0;

        const incidents = (typeof DataStore.getIncidents === "function") ? DataStore.getIncidents() : [];
        const incidents_ouverts = incidents.filter(i => { const s = norm(i.statut); return s === "nouveau" || s === "en cours"; }).length;

        return { conformite, maturite, expo, risques_crit, actions_retard, avancement, incidents_ouverts };
    }

    /* =========================
       RENDU
    ========================== */
    function render() {
        const app = document.getElementById("app");
        const currentClient = localStorage.getItem("cyber-context") || "global";

        // Données (exigences + actions filtrées par périmètre ; le reste = posture globale).
        const exigences = DataStore.getExigencesByClient(currentClient);
        const tousActions = DataStore.getActions();
        const risques = DataStore.getRisques();
        const actifs = DataStore.getActifs();
        const clients = DataStore.getClients();
        const processus = DataStore.getProcessus();
        const scenarios = DataStore.getScenariosPra();
        const tests = DataStore.getTestsPra();
        const mco = DataStore.getMcoActions();
        const crise = DataStore.getCriseMembres();
        const prestataires = DataStore.getPrestataires();
        const audits = DataStore.getAudits();
        const mesures = DataStore.getMesures();
        // Incidents (schéma v4) : garde de compatibilité si la base n'a pas encore l'API.
        const incidents = (typeof DataStore.getIncidents === "function") ? DataStore.getIncidents() : [];

        let actions = tousActions;
        if (currentClient !== "global") {
            const ids = new Set(exigences.map(e => e.id));
            actions = tousActions.filter(a => (a.exigence_id ? ids.has(a.exigence_id) : true));
        }

        /* ---- Conformité (exigences du périmètre) ---- */
        const totalExigences = exigences.length;
        const conformes = exigences.filter(e => e.statut_conformite === "conforme").length;
        const partiellement = exigences.filter(e => e.statut_conformite === "partiellement conforme").length;
        const nonConformes = exigences.filter(e => e.statut_conformite === "non conforme").length;
        const nonApplicables = exigences.filter(e => e.statut_conformite === "non applicable").length;
        const nonEvaluees = totalExigences - conformes - partiellement - nonConformes - nonApplicables;
        const exigencesApplicables = totalExigences - nonApplicables;
        const tauxConformite = exigencesApplicables === 0 ? 0 : Math.round((conformes / exigencesApplicables) * 100);

        /* ---- Plan d'actions (avancement + retards / échéances) ---- */
        const norm = s => String(s || "").toLowerCase();
        const actionsAFaire = actions.filter(a => norm(a.statut) === "à faire").length;
        const actionsEnCours = actions.filter(a => norm(a.statut) === "en cours").length;
        const actionsTerminees = actions.filter(a => norm(a.statut) === "terminée").length;
        const totalActions = actions.length;
        const avancementActions = totalActions === 0 ? 0 : Math.round((actionsTerminees / totalActions) * 100);

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const DAY = 86400000;
        const prioColor = p => p === "Critique" ? "var(--color-danger)" : p === "Haute" ? "var(--color-warning)" : p === "Basse" ? "var(--color-gray)" : "var(--color-info)";
        const openWithEch = actions
            .filter(a => norm(a.statut) !== "terminée" && a.echeance)
            .map(a => {
                const d = new Date(a.echeance); d.setHours(0, 0, 0, 0);
                return Object.assign({}, a, { _days: Math.round((d - today) / DAY) });
            });
        const overdue = openWithEch.filter(a => a._days < 0).sort((x, y) => x._days - y._days);
        const soon = openWithEch.filter(a => a._days >= 0 && a._days <= 30).sort((x, y) => x._days - y._days);
        const actionsEnRetard = overdue.length;
        const watch = overdue.concat(soon).slice(0, 6);

        /* ---- Risques (profil résiduel + exposition) ---- */
        const risquesTresCritiques = risques.filter(r => (r.score_residuel || 0) >= 8).length;
        const risquesCritiques = risques.filter(r => (r.score_residuel || 0) >= 3 && (r.score_residuel || 0) < 8).length;
        const risquesNonCritiques = risques.filter(r => (r.score_residuel || 0) < 3).length;
        const expo = risques.reduce((acc, r) => acc + (r.score_residuel || 0), 0);
        const topRisques = [...risques].sort((a, b) => (b.score_residuel || 0) - (a.score_residuel || 0)).slice(0, 5);

        /* ---- Actifs (inventaire + criticité) ---- */
        const critByLevel = { critique: 0, "élevée": 0, "modérée": 0, faible: 0 };
        actifs.forEach(a => { const k = norm(a.criticite); if (critByLevel[k] !== undefined) critByLevel[k]++; });
        const actifsCritiques = critByLevel.critique;

        /* ---- Incidents (registre + déclarations réglementaires) ---- */
        const incidentsOuverts = incidents.filter(i => { const s = norm(i.statut); return s === "nouveau" || s === "en cours"; }).length;
        const incidentsGraves = incidents.filter(i => { const g = norm(i.gravite); return g === "critique" || g === "élevée"; }).length;
        const declarationsEnAttente = incidents.filter(i =>
            norm(i.declaration_anssi) === "à déclarer" || norm(i.declaration_cnil) === "à déclarer"
        ).length;

        /* ---- Référentiels (maturité) ---- */
        const ref = computeReferentiels();

        /* ---- Historisation des tendances (un instantané GLOBAL par jour) ---- */
        if (typeof DataStore.recordDailySnapshot === "function") {
            DataStore.recordDailySnapshot(computeGlobalSnapshot());
        }
        const history = (typeof DataStore.getHistory === "function") ? DataStore.getHistory() : [];

        /* ---- Couverture du dispositif ---- */
        const processusCritiques = processus.filter(p => norm(p.criticite) === "critique").length;
        const testsSorted = [...tests].filter(t => t.date).sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastTest = testsSorted[0] || null;
        // Actions MCO en retard : date programmée dépassée sans réalisation (source unique dans PraMcoModule).
        const mcoRetardFn = (typeof PraMcoModule !== "undefined" && PraMcoModule.isEnRetard) ? PraMcoModule.isEnRetard : () => false;
        const mcoEnRetard = mco.filter(mcoRetardFn).length;
        const auditsRealises = audits.filter(a => a.statut === "Réalisé").length;
        const constatsNC = audits.reduce((n, a) => {
            const libres = Array.isArray(a.constats) ? a.constats.filter(c => c.type === "Mineure" || c.type === "Majeure").length : 0;
            const grille = Array.isArray(a.items) ? a.items.filter(c => c.type === "mineure" || c.type === "majeure").length : 0;
            return n + libres + grille;
        }, 0);
        const mesuresConformes = mesures.filter(m => m.statut === "conforme").length;

        /* ---- Conformité par donneur d'ordre (comparatif) ---- */
        const confOf = exs => {
            const applic = exs.filter(e => e.statut_conformite !== "non applicable").length;
            const conf = exs.filter(e => e.statut_conformite === "conforme").length;
            return { pct: applic ? Math.round((conf / applic) * 100) : null, conf, applic, total: exs.length };
        };
        const allExig = DataStore.getExigences();
        const clientConfRows = [];
        const internes = allExig.filter(e => !e.client_id);
        if (internes.length) clientConfRows.push(Object.assign({ nom: "Exigences internes", id: null }, confOf(internes)));
        clients.forEach(c => {
            const exs = allExig.filter(e => e.client_id === c.id);
            if (exs.length) clientConfRows.push(Object.assign({ nom: c.nom, id: c.id }, confOf(exs)));
        });
        clientConfRows.sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct));

        /* ---- Incidents récents (5 derniers, par date de détection) ---- */
        const incidentsRecents = incidents.filter(i => i.date_detection)
            .slice().sort((a, b) => new Date(b.date_detection) - new Date(a.date_detection)).slice(0, 5);

        /* ---- Documents à réviser (revue échue/proche, ou statut à réviser/obsolète) ---- */
        const documents = (typeof DataStore.getDocuments === "function") ? DataStore.getDocuments() : [];
        const docsRevision = documents.map(d => {
            let days = null;
            if (d.date_revue) { const dd = new Date(d.date_revue); dd.setHours(0, 0, 0, 0); days = Math.round((dd - today) / DAY); }
            return Object.assign({}, d, { _days: days });
        }).filter(d => norm(d.statut) === "à réviser" || norm(d.statut) === "obsolète" || (d._days !== null && d._days <= 30))
            .sort((a, b) => (a._days == null ? 99999 : a._days) - (b._days == null ? 99999 : b._days))
            .slice(0, 5);
        const docsAlertCount = docsRevision.filter(d => norm(d.statut) === "à réviser" || norm(d.statut) === "obsolète" || (d._days !== null && d._days < 0)).length;

        /* ---- Contexte + état vide ---- */
        let contextName = "Vue globale (tous périmètres)";
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = `Donneur d'ordre : ${c.nom}`;
        }
        const aucuneDonnee = totalExigences === 0 && risques.length === 0 && actifs.length === 0 &&
            totalActions === 0 && ref.global.evaluated === 0 && processus.length === 0;

        /* ---- Bandeau de posture (synthèse direction) ---- */
        let postureTone = "is-success";
        let postureTitle = "Posture de sécurité maîtrisée";
        let postureMsg = "Aucune alerte critique sur le périmètre. Poursuivez l'amélioration continue et le maintien en condition de sécurité.";
        const facts = [];
        // Maturité CMMI : uniquement si au moins un référentiel hors questionnaire est évalué.
        if (ref.perRef.some(r => !r.questionnaire && r.evaluated > 0)) facts.push(`maturité ${ref.global.maturite.toFixed(1)}/5`);
        facts.push(`conformité ${tauxConformite}%`);
        if (declarationsEnAttente > 0) {
            postureTone = "is-danger";
            postureTitle = "Déclaration réglementaire en attente";
            postureMsg = `${declarationsEnAttente} incident(s) à déclarer sous délai (NIS2 24 h/72 h, RGPD 72 h). ${risquesTresCritiques > 0 ? risquesTresCritiques + " risque(s) très critique(s) en parallèle. " : ""}Indicateurs : ${facts.join(", ")}.`;
        } else if (risquesTresCritiques > 0) {
            postureTone = "is-danger";
            postureTitle = "Arbitrage immédiat requis";
            postureMsg = `${risquesTresCritiques} risque(s) résiduel(s) très critique(s) (score ≥ 8) exposent le SI. ${incidentsOuverts > 0 ? incidentsOuverts + " incident(s) ouvert(s). " : ""}${actionsEnRetard > 0 ? actionsEnRetard + " action(s) en retard. " : ""}Indicateurs : ${facts.join(", ")}.`;
        } else if (actionsEnRetard > 0) {
            postureTone = "is-warning";
            postureTitle = "Retards de traitement à résorber";
            postureMsg = `${actionsEnRetard} action(s) de remédiation ont dépassé leur échéance. ${risquesCritiques > 0 ? risquesCritiques + " risque(s) critique(s) à suivre. " : ""}Indicateurs : ${facts.join(", ")}.`;
        } else if (risquesCritiques > 0) {
            postureTone = "is-warning";
            postureTitle = "Vigilance sur les risques critiques";
            postureMsg = `${risquesCritiques} risque(s) critique(s) (score 3 à 7.9) identifié(s). Suivez le plan d'actions. Indicateurs : ${facts.join(", ")}.`;
        } else if (exigencesApplicables > 0 && tauxConformite < 80) {
            postureTone = "is-warning";
            postureTitle = "Conformité à consolider";
            postureMsg = `La conformité atteint ${tauxConformite}% sur ce périmètre. ${nonConformes} exigence(s) non conforme(s) à traiter. Indicateurs : ${facts.join(", ")}.`;
        } else {
            postureMsg = `Aucune alerte critique. Indicateurs : ${facts.join(", ")}. Poursuivez l'amélioration continue.`;
        }

        /* =========================
           ASSEMBLAGE HTML
        ========================== */

        // -- Bandeau KPI --
        const kpiStrip = `
            <div class="kpi-strip">
                <div class="kpi-tile ${tauxConformite >= 80 ? "is-success" : tauxConformite >= 50 ? "is-warning" : "is-danger"}">
                    <div class="kt-val">${tauxConformite}<small>%</small></div>
                    <div class="kt-lbl">Conformité</div>
                    <div class="kt-sub">${conformes}/${exigencesApplicables} exigences applicables</div>
                </div>
                <div class="kpi-tile">
                    <div class="kt-val" style="color:${maturiteColor(ref.global.maturite)};">${ref.global.maturite.toFixed(1)}<small>/5</small></div>
                    <div class="kt-lbl">Maturité référentiels</div>
                    <div class="kt-sub">${ref.global.evaluated}/${ref.global.total} mesures évaluées</div>
                </div>
                <div class="kpi-tile ${risquesTresCritiques > 0 ? "is-danger" : risquesCritiques > 0 ? "is-warning" : "is-success"}">
                    <div class="kt-val">${expo.toFixed(1)}</div>
                    <div class="kt-lbl">Exposition résiduelle</div>
                    <div class="kt-sub">${risquesTresCritiques} très critique(s) · ${risquesCritiques} critique(s)</div>
                </div>
                <div class="kpi-tile ${actionsEnRetard > 0 ? "is-danger" : "is-success"}">
                    <div class="kt-val">${actionsEnRetard}</div>
                    <div class="kt-lbl">Actions en retard</div>
                    <div class="kt-sub">${totalActions - actionsTerminees} ouverte(s) · ${avancementActions}% avancement</div>
                </div>
                <div class="kpi-tile">
                    <div class="kt-val">${actifs.length}</div>
                    <div class="kt-lbl">Actifs cartographiés</div>
                    <div class="kt-sub">${actifsCritiques} critique(s)</div>
                </div>
            </div>`;

        // -- Carte Tendances (courbes d'évolution) --
        const hSeries = key => history.map(h => (h.metrics && h.metrics[key] != null) ? Number(h.metrics[key]) : 0);
        const nDays = history.length;
        const trendTiles = [
            trendTile({ label: "Conformité", values: hSeries("conformite"), higherIsBetter: true, unit: "%", decimals: 0, color: "var(--color-success)", help: "Part des exigences applicables jugées conformes, sur l'ensemble des périmètres." }),
            trendTile({ label: "Maturité référentiels", values: hSeries("maturite"), higherIsBetter: true, unit: "/5", decimals: 1, color: "var(--primary)", help: "Maturité moyenne (CMMI 0-5) des mesures applicables auto-évaluées (hors questionnaires Oui/Non comme AirCyber)." }),
            trendTile({ label: "Exposition résiduelle", values: hSeries("expo"), higherIsBetter: false, decimals: 1, color: "var(--color-danger)", help: "Somme des scores de risque résiduel — plus c'est bas, mieux c'est." }),
            trendTile({ label: "Risques critiques", values: hSeries("risques_crit"), higherIsBetter: false, decimals: 0, color: "var(--color-warning)", help: "Nombre de risques au résiduel ≥ 3 (critiques et très critiques)." }),
            trendTile({ label: "Actions en retard", values: hSeries("actions_retard"), higherIsBetter: false, decimals: 0, color: "var(--color-danger)", help: "Actions non terminées dont l'échéance est dépassée." }),
            trendTile({ label: "Avancement actions", values: hSeries("avancement"), higherIsBetter: true, unit: "%", decimals: 0, color: "var(--accent)", help: "Part des actions terminées sur le total." })
        ].join("");
        const trendsHint = nDays < 2
            ? `L'historique se constitue automatiquement (un point par jour). Les courbes s'afficheront dès le 2ᵉ jour — actuellement <strong>${nDays}</strong> point${nDays > 1 ? "s" : ""}.`
            : `Évolution sur <strong>${nDays}</strong> jour(s) d'historique — la variation compare le dernier point au premier de la série.`;
        const trendsCard = `
            <div class="dashboard-card wide-card">
                <div class="trend-head">
                    <h3 style="margin:0;">Tendances ${Help.tip("Évolution des indicateurs clés dans le temps. Un instantané global est capturé automatiquement une fois par jour, à l'ouverture du tableau de bord.")}</h3>
                    <button id="clearHistoryBtn" class="trend-clear no-print" title="Effacer l'historique des tendances (n'affecte pas vos données GRC)">Effacer l'historique</button>
                </div>
                <div class="trend-grid">${trendTiles}</div>
                <p class="trend-hint">${trendsHint}</p>
            </div>`;

        // -- Carte Conformité (donut) --
        const confSegments = [
            { value: conformes, color: "var(--color-success)" },
            { value: partiellement, color: "var(--color-warning)" },
            { value: nonConformes, color: "var(--color-danger)" },
            { value: nonApplicables, color: "var(--color-gray)" },
            { value: nonEvaluees, color: "#d7dde5" }
        ];
        const confCard = `
            <div class="dashboard-card chart-card highlight-card clickable-card" onclick="Router.navigateTo('/exigences')" style="cursor:pointer;" title="Aller aux exigences">
                <h3>Conformité ${Help.tip("Part des exigences applicables jugées conformes. Les exigences « non applicables » sont exclues du taux ; l'anneau montre la répartition complète.")}</h3>
                ${totalExigences === 0
                    ? `<p class="chart-empty">Aucune exigence sur ce périmètre.<br>Ajoutez des exigences pour suivre la conformité.</p>`
                    : `<div class="donut-card">
                        ${donutSvg(confSegments, tauxConformite + "%", "conforme", 150)}
                        ${legend([
                            { color: "var(--color-success)", label: "Conformes", value: conformes },
                            { color: "var(--color-warning)", label: "Partielles", value: partiellement },
                            { color: "var(--color-danger)", label: "Non conformes", value: nonConformes },
                            { color: "var(--color-gray)", label: "Non applicables", value: nonApplicables }
                        ].concat(nonEvaluees > 0 ? [{ color: "#d7dde5", label: "Non évaluées", value: nonEvaluees }] : []))}
                    </div>`}
            </div>`;

        // -- Carte Maturité par référentiel (barres) --
        // Questionnaire Oui/Non (AirCyber) : pas de CMMI → barre = score de conformité (%).
        const refBars = ref.perRef.length === 0
            ? `<p class="chart-empty">Catalogue de référentiels indisponible.</p>`
            : ref.perRef.map(r => r.questionnaire
                ? hbar(
                    r.nom,
                    r.conformite === null ? 0 : r.conformite, 100,
                    scoreColor(r.evaluated ? r.conformite : null),
                    r.evaluated && r.conformite !== null ? r.conformite + "%" : "—",
                    `${r.evaluated}/${r.total} évaluées · score Oui/Non (sans échelle CMMI)`
                )
                : hbar(
                    r.nom,
                    r.maturite, 5,
                    maturiteColor(r.maturite),
                    r.maturite.toFixed(1) + "/5",
                    `${r.evaluated}/${r.total} évaluées${r.conformite === null ? "" : " · conformité " + r.conformite + "%"}`
                )).join("");
        const refCard = `
            <div class="dashboard-card chart-card clickable-card" onclick="Router.navigateTo('/referentiels')" style="cursor:pointer;" title="Aller aux référentiels">
                <h3>Maturité par référentiel ${Help.tip("Niveau de maîtrise moyen (échelle CMMI 0-5) par référentiel de sécurité, calculé sur les mesures applicables auto-évaluées. Le questionnaire AirCyber, répondu en Oui/Non, affiche son score de conformité (%) et n'entre pas dans la moyenne CMMI.")}</h3>
                <div style="display:flex; align-items:baseline; gap:8px; margin:2px 0 14px;">
                    <span style="font-size:2rem; font-weight:bold; color:${maturiteColor(ref.global.maturite)};">${ref.global.maturite.toFixed(1)}</span>
                    <span style="color:var(--text-muted);">/5 — maturité globale</span>
                </div>
                ${refBars}
            </div>`;

        // -- Carte Profil de risque (donut résiduel) --
        const riskSegments = [
            { value: risquesTresCritiques, color: "var(--color-danger)" },
            { value: risquesCritiques, color: "var(--color-warning)" },
            { value: risquesNonCritiques, color: "var(--color-success)" }
        ];
        const riskCard = `
            <div class="dashboard-card chart-card alert-card clickable-card" onclick="Router.navigateTo('/risques')" style="cursor:pointer;" title="Aller au registre des risques">
                <h3>Profil de risque résiduel ${Help.tip("Risque résiduel = risque brut (F×G) × coefficient de maîtrise. C'est le risque subsistant après les mesures en place.")}</h3>
                ${risques.length === 0
                    ? `<p class="chart-empty">Aucun risque identifié.<br>Constituez le registre des risques (méthode EBIOS).</p>`
                    : `<div class="donut-card">
                        ${donutSvg(riskSegments, String(risques.length), "risques", 150)}
                        ${legend([
                            { color: "var(--color-danger)", label: "Très critiques (≥ 8)", value: risquesTresCritiques },
                            { color: "var(--color-warning)", label: "Critiques (3–7.9)", value: risquesCritiques },
                            { color: "var(--color-success)", label: "Non critiques (< 3)", value: risquesNonCritiques }
                        ])}
                    </div>
                    <div style="margin-top:1rem; text-align:center; padding-top:0.9rem; border-top:1px solid var(--border);">
                        <span style="font-size:0.9rem; color:var(--text-muted);">Score d'exposition globale : <strong style="font-size:1.1rem; color:var(--text-main);">${expo.toFixed(2)}</strong></span>
                    </div>`}
            </div>`;

        // -- Carte Plan d'actions --
        const actionsCard = `
            <div class="dashboard-card chart-card clickable-card" onclick="Router.navigateTo('/actions')" style="cursor:pointer;" title="Aller au plan d'actions">
                <h3>Plan d'actions ${Help.tip("Avancement des actions de remédiation : part des actions terminées sur le total du périmètre.")}</h3>
                <div class="dashboard-value" style="color:var(--text-main);">${avancementActions} %</div>
                <div class="progress-bar small"><div class="progress-fill success" style="width:${avancementActions}%;"></div></div>
                <div class="mini-kpi-grid">
                    <div><strong>${actionsAFaire}</strong><span>À faire</span></div>
                    <div><strong>${actionsEnCours}</strong><span>En cours</span></div>
                    <div><strong>${actionsTerminees}</strong><span>Terminées</span></div>
                </div>
                <div style="margin-top:1rem; padding-top:0.9rem; border-top:1px solid var(--border); display:flex; justify-content:space-between; font-size:0.85rem;">
                    <span style="color:var(--text-muted);">En retard</span>
                    <strong style="color:${actionsEnRetard > 0 ? "var(--color-danger)" : "var(--color-success)"};">${actionsEnRetard}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-top:4px;">
                    <span style="color:var(--text-muted);">Échéance ≤ 30 j</span>
                    <strong style="color:${soon.length > 0 ? "var(--color-warning)" : "var(--text-main)"};">${soon.length}</strong>
                </div>
            </div>`;

        // -- Carte large : Cartographie (heatmap) + Top 5 risques --
        const topRisquesHtml = topRisques.length === 0
            ? `<p class="chart-empty">Aucun risque à afficher.</p>`
            : `<ul style="list-style:none; padding:0; margin:0.6rem 0 0;">
                ${topRisques.map(r => {
                    const score = r.score_residuel || 0;
                    return `<li class="clickable-risk" data-id="${escapeHtml(r.id)}" style="padding:10px 4px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; gap:10px; cursor:pointer;">
                        <strong style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;" title="${escapeHtml(r.nom)}">${escapeHtml(r.nom)}</strong>
                        <span class="status" style="background:${getRiskColor(score)}; color:#fff; font-size:0.75rem;">${score.toFixed(2)}</span>
                    </li>`;
                }).join("")}
              </ul>`;
        const cartoCard = `
            <div class="dashboard-card wide-card split-card">
                <div class="split-col">
                    <h3 style="margin-top:0;">Cartographie des risques ${Help.tip("Matrice Fréquence × Gravité (méthode EBIOS). La couleur traduit la criticité brute F×G ; le nombre indique combien de risques occupent la case.")}</h3>
                    ${risques.length === 0
                        ? `<p class="chart-empty">Aucun risque à cartographier.</p>`
                        : `<div class="heat-wrap" onclick="Router.navigateTo('/matrice')" title="Ouvrir la matrice des risques">
                            ${heatmapSvg(risques)}
                            <div class="heat-cap">Couleur = criticité brute (F×G) · bulle = nombre de risques. Cliquez pour la matrice détaillée.</div>
                           </div>`}
                </div>
                <div class="split-col">
                    <h3 style="margin-top:0;">Top 5 des risques résiduels ${Help.tip("Les cinq scénarios au plus fort risque résiduel — à traiter en priorité.")}</h3>
                    ${topRisquesHtml}
                </div>
            </div>`;

        // -- Carte large : Actions à surveiller + Inventaire/criticité actifs --
        const watchHtml = watch.length === 0
            ? `<p class="chart-empty">Aucune action en retard ni échéance proche. 👍</p>`
            : `<ul class="watch-list">
                ${watch.map(a => {
                    const late = a._days < 0;
                    const badge = late
                        ? `<span class="wi-badge late">Retard ${Math.abs(a._days)} j</span>`
                        : `<span class="wi-badge soon">${a._days === 0 ? "Aujourd'hui" : "J-" + a._days}</span>`;
                    const ech = a.echeance ? new Date(a.echeance).toLocaleDateString("fr-FR") : "—";
                    return `<li class="watch-item dash-action-item" data-id="${escapeHtml(a.id)}">
                        <span class="wi-prio" style="background:${prioColor(a.priorite || "Moyenne")};" title="Priorité ${escapeHtml(a.priorite || "Moyenne")}"></span>
                        <span class="wi-body">
                            <span class="wi-title" title="${escapeHtml(a.titre || "")}">${escapeHtml(a.titre || "(sans titre)")}</span>
                            <span class="wi-meta">Échéance ${ech}${a.responsable ? " · " + escapeHtml(a.responsable) : ""}</span>
                        </span>
                        ${badge}
                    </li>`;
                }).join("")}
              </ul>`;
        const actifsMax = Math.max(1, critByLevel.critique, critByLevel["élevée"], critByLevel["modérée"], critByLevel.faible);
        const actifsBars = actifs.length === 0
            ? `<p class="chart-empty">Aucun actif inventorié.</p>`
            : hbar("Critique", critByLevel.critique, actifsMax, "var(--color-danger)")
              + hbar("Élevée", critByLevel["élevée"], actifsMax, "var(--color-warning)")
              + hbar("Modérée", critByLevel["modérée"], actifsMax, "var(--color-info)")
              + hbar("Faible", critByLevel.faible, actifsMax, "var(--color-success)");
        const watchCard = `
            <div class="dashboard-card wide-card split-card">
                <div class="split-col">
                    <h3 style="margin-top:0;">Actions à surveiller ${Help.tip("Actions non terminées en retard (échéance dépassée) ou arrivant à échéance sous 30 jours, triées par urgence.")}</h3>
                    ${watchHtml}
                </div>
                <div class="split-col">
                    <h3 style="margin-top:0;">Actifs par criticité ${Help.tip("Répartition de l'inventaire des actifs (SI & OT) selon leur criticité pour l'organisation.")}</h3>
                    ${actifsBars}
                    <button onclick="Router.navigateTo('/actifs')" style="width:100%; margin-top:1rem; justify-content:center; background:#fff; color:var(--primary); border:1px solid var(--border);">Gérer les actifs</button>
                </div>
            </div>`;

        // -- Carte large : Couverture du dispositif GRC --
        const lastTestSub = lastTest
            ? `<span style="color:${lastTest.succes === "Oui" ? "var(--color-success)" : "var(--color-danger)"}; font-weight:600;">${lastTest.succes === "Oui" ? "Dernier : succès" : "Dernier : échec"}</span>`
            : "Aucun test réalisé";
        const incidentsSub = declarationsEnAttente > 0
            ? `<span style="color:var(--color-danger); font-weight:600;">${declarationsEnAttente} à déclarer</span>`
            : incidentsOuverts > 0
                ? `<span style="color:var(--color-warning); font-weight:600;">${incidentsOuverts} ouvert(s)</span>`
                : (incidents.length ? "Tous traités" : "Aucun incident");
        const incidentsTone = declarationsEnAttente > 0 ? "var(--color-danger)" : incidentsOuverts > 0 ? "var(--color-warning)" : "var(--color-success)";
        const coverageCard = `
            <div class="dashboard-card wide-card">
                <h3 style="margin-top:0;">Couverture du dispositif GRC ${Help.tip("Vue d'ensemble des briques de gouvernance, gestion des risques et continuité. Cliquez une tuile pour ouvrir le module correspondant.")}</h3>
                <div class="cov-grid">
                    ${covTile(processus.length, "Processus (BIA)", `${processusCritiques} critique(s)`, "/bia", "var(--primary)")}
                    ${covTile(mesures.length, "Mesures de sécurité", `${mesuresConformes} conforme(s)`, "/mesures", "var(--primary)")}
                    ${covTile(`${ref.global.evaluated}<small style="font-size:1rem; color:var(--text-muted);">/${ref.global.total}</small>`, "Exigences évaluées", `${ref.global.maturite.toFixed(1)}/5 maturité`, "/referentiels", "var(--accent)")}
                    ${covTile(scenarios.length, "Scénarios PCA/PRA", scenarios.length ? "Plans définis" : "À définir", "/pra", "var(--accent)")}
                    ${covTile(tests.length, "Tests PRA", lastTestSub, "/tests", "var(--accent)")}
                    ${covTile(mco.length, "Actions MCO", mcoEnRetard > 0 ? `<span style="color:var(--color-danger); font-weight:600;">${mcoEnRetard} en retard</span>` : (mco.length ? "Planning tenu" : "À définir"), "/mco", mcoEnRetard > 0 ? "var(--color-danger)" : (mco.length ? "var(--color-success)" : "var(--accent)"))}
                    ${covTile(crise.length, "Cellule de crise", crise.length ? "Opérationnelle" : "À constituer", "/crise", crise.length ? "var(--color-success)" : "var(--color-warning)")}
                    ${covTile(`${auditsRealises}<small style="font-size:1rem; color:var(--text-muted);">/${audits.length}</small>`, "Audits réalisés", constatsNC > 0 ? `<span style="color:var(--color-danger); font-weight:600;">${constatsNC} NC ouverte(s)</span>` : "Aucune NC", "/audits", "var(--primary)")}
                    ${covTile(prestataires.length, "Prestataires & tiers", "Chaîne de sous-traitance", "/prestataires", "var(--accent)")}
                    ${covTile(risques.length, "Risques cartographiés", `exposition ${expo.toFixed(1)}`, "/risques", "var(--color-danger)")}
                    ${covTile(incidents.length, "Incidents", incidentsSub, "/incidents", incidentsTone)}
                </div>
            </div>`;

        // -- Carte Conformité par donneur d'ordre (comparatif) --
        const clientConfCard = clientConfRows.length ? `
            <div class="dashboard-card wide-card">
                <h3 style="margin-top:0;">Conformité par donneur d'ordre ${Help.tip("Comparaison du taux de conformité (exigences conformes / applicables) entre vos donneurs d'ordre et vos exigences internes. Utile pour un sous-traitant multi-clients.")}</h3>
                ${clientConfRows.map(r => hbar(
                    r.nom,
                    r.pct == null ? 0 : r.pct, 100,
                    r.pct == null ? "var(--color-gray)" : (r.pct >= 80 ? "var(--color-success)" : r.pct >= 50 ? "var(--color-warning)" : "var(--color-danger)"),
                    r.pct == null ? "—" : r.pct + "%",
                    `${r.conf}/${r.applic} conforme(s)${r.total !== r.applic ? " · " + (r.total - r.applic) + " N/A" : ""}`
                )).join("")}
            </div>` : "";

        // -- Carte large : Incidents récents + Documents à réviser --
        const gravColor = g => { g = norm(g); return g === "critique" ? "var(--color-danger)" : g === "élevée" ? "var(--color-warning)" : g === "moyenne" ? "var(--color-info)" : "var(--color-gray)"; };
        const incidentsRecentsHtml = incidentsRecents.length === 0
            ? `<p class="chart-empty">Aucun incident enregistré.</p>`
            : `<ul class="watch-list">${incidentsRecents.map(i => {
                const decl = norm(i.declaration_anssi) === "à déclarer" || norm(i.declaration_cnil) === "à déclarer";
                const date = i.date_detection ? new Date(i.date_detection).toLocaleDateString("fr-FR") : "—";
                return `<li class="watch-item dash-incident-item" data-id="${escapeHtml(i.id)}">
                    <span class="wi-prio" style="background:${gravColor(i.gravite)};" title="Gravité ${escapeHtml(i.gravite || "")}"></span>
                    <span class="wi-body">
                        <span class="wi-title" title="${escapeHtml(i.titre || "")}">${escapeHtml(i.titre || "(sans titre)")}</span>
                        <span class="wi-meta">${escapeHtml(i.type || "incident")} · détecté le ${date} · ${escapeHtml(i.statut || "")}</span>
                    </span>
                    ${decl ? `<span class="wi-badge late">À déclarer</span>` : ""}
                </li>`;
            }).join("")}</ul>`;
        const docsRevisionHtml = docsRevision.length === 0
            ? `<p class="chart-empty">Aucune revue documentaire en attente. 👍</p>`
            : `<ul class="watch-list">${docsRevision.map(d => {
                const late = d._days !== null && d._days < 0;
                const soon = d._days !== null && d._days >= 0 && d._days <= 30;
                const dotColor = late ? "var(--color-danger)" : soon ? "var(--color-warning)" : "var(--color-info)";
                let badge = "";
                if (late) badge = `<span class="wi-badge late">Retard ${Math.abs(d._days)} j</span>`;
                else if (soon) badge = `<span class="wi-badge soon">${d._days === 0 ? "Aujourd'hui" : "J-" + d._days}</span>`;
                else if (norm(d.statut) === "à réviser" || norm(d.statut) === "obsolète") badge = `<span class="wi-badge late">${escapeHtml(d.statut)}</span>`;
                const rev = d.date_revue ? new Date(d.date_revue).toLocaleDateString("fr-FR") : "—";
                return `<li class="watch-item dash-doc-item" data-id="${escapeHtml(d.id)}">
                    <span class="wi-prio" style="background:${dotColor};" title="${escapeHtml(d.statut || "")}"></span>
                    <span class="wi-body">
                        <span class="wi-title" title="${escapeHtml(d.titre || "")}">${escapeHtml(d.titre || "(sans titre)")}</span>
                        <span class="wi-meta">${escapeHtml(d.type || "document")}${d.version ? " · v" + escapeHtml(d.version) : ""} · revue ${rev}</span>
                    </span>
                    ${badge}
                </li>`;
            }).join("")}</ul>`;
        const suiviCard = `
            <div class="dashboard-card wide-card split-card">
                <div class="split-col">
                    <h3 style="margin-top:0;">Incidents récents ${Help.tip("Les derniers incidents de sécurité déclarés, du plus récent au plus ancien. « À déclarer » signale une obligation réglementaire en attente (NIS2/RGPD).")}</h3>
                    ${incidentsRecentsHtml}
                </div>
                <div class="split-col">
                    <h3 style="margin-top:0;">Documents à réviser ${Help.tip("Politiques et documents dont la revue est échue ou proche (≤ 30 jours), ou marqués « à réviser » / « obsolète ».")}${docsAlertCount ? ` <span class="badge" style="background:var(--color-danger); color:#fff;">${docsAlertCount}</span>` : ""}</h3>
                    ${docsRevisionHtml}
                </div>
            </div>`;

        // -- État vide (onboarding) --
        const emptyHint = aucuneDonnee ? `
            <div class="posture-banner is-warning" style="margin-bottom:1.5rem;">
                <span class="pb-dot"></span>
                <div>
                    <h2>Démarrez votre démarche GRC</h2>
                    <p>Aucune donnée n'est encore saisie. Commencez par
                        <a href="#/actifs" style="color:var(--accent);">cartographier vos actifs</a>,
                        <a href="#/risques" style="color:var(--accent);">identifier vos risques</a>, puis
                        <a href="#/referentiels" style="color:var(--accent);">auto-évaluer un référentiel</a>. Le tableau de bord s'enrichira automatiquement.</p>
                </div>
            </div>` : "";

        /* =========================
           RENDU FINAL
        ========================== */
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Tableau de bord</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Périmètre d'analyse : <strong>${escapeHtml(contextName)}</strong></p>
                    </div>
                    <div class="dashboard-actions no-print">
                        <button id="exportExcelBtn" style="margin-right:10px;">Export Data (Excel)</button>
                        <button id="exportPdfBtn">Imprimer Rapport (PDF)</button>
                    </div>
                </div>

                ${emptyHint}

                <div class="posture-banner ${postureTone}">
                    <span class="pb-dot"></span>
                    <div>
                        <h2>${escapeHtml(postureTitle)}</h2>
                        <p>${escapeHtml(postureMsg)}</p>
                    </div>
                </div>

                ${kpiStrip}

                <div class="dash-section-title">Évolution dans le temps</div>
                <div class="dashboard-grid">
                    ${trendsCard}
                </div>

                <div class="dash-section-title">Conformité &amp; maturité</div>
                <div class="dashboard-grid">
                    ${confCard}
                    ${refCard}
                </div>
                ${clientConfCard ? `<div class="dashboard-grid" style="margin-top:1.5rem;">${clientConfCard}</div>` : ""}

                <div class="dash-section-title">Risques &amp; plan d'actions</div>
                <div class="dashboard-grid">
                    ${riskCard}
                    ${actionsCard}
                </div>
                <div class="dashboard-grid" style="margin-top:1.5rem;">
                    ${cartoCard}
                </div>
                <div class="dashboard-grid" style="margin-top:1.5rem;">
                    ${watchCard}
                </div>

                <div class="dash-section-title">Suivi &amp; échéances</div>
                <div class="dashboard-grid">
                    ${suiviCard}
                </div>

                <div class="dash-section-title">Dispositif &amp; continuité</div>
                <div class="dashboard-grid">
                    ${coverageCard}
                </div>
            </section>
        `;

        /* =========================
           INTERACTIONS
        ========================== */
        app.querySelectorAll(".clickable-risk").forEach(li => {
            li.onclick = () => Router.navigateTo(`/risques/${li.dataset.id}`);
        });
        app.querySelectorAll(".dash-action-item").forEach(li => {
            li.onclick = () => Router.navigateTo(`/actions/${li.dataset.id}`);
        });
        app.querySelectorAll(".dash-incident-item").forEach(li => {
            li.onclick = () => Router.navigateTo(`/incidents/${li.dataset.id}`);
        });
        app.querySelectorAll(".dash-doc-item").forEach(li => {
            li.onclick = () => Router.navigateTo(`/documents/${li.dataset.id}`);
        });

        const clearHistBtn = document.getElementById("clearHistoryBtn");
        if (clearHistBtn) {
            clearHistBtn.onclick = () => {
                const n = (typeof DataStore.getHistory === "function") ? DataStore.getHistory().length : 0;
                if (!n) { if (window.showToast) window.showToast("Aucun historique à effacer.", "info"); return; }
                if (confirm(`Effacer l'historique des tendances ?\n${n} point(s) de mesure seront supprimés. Vos données GRC ne sont pas affectées ; un nouveau point sera recréé aujourd'hui.`)) {
                    DataStore.clearHistory();
                    if (window.showToast) window.showToast("Historique des tendances effacé.", "success");
                    render();
                }
            };
        }

        const excelBtn = document.getElementById("exportExcelBtn");
        if (excelBtn) {
            excelBtn.onclick = () => {
                if (typeof ExportExcelService !== "undefined") ExportExcelService.exportAudit();
                else if (window.showToast) window.showToast("Erreur : Service d'export Excel introuvable.", "error");
            };
        }
        const pdfBtn = document.getElementById("exportPdfBtn");
        if (pdfBtn) {
            pdfBtn.onclick = () => {
                if (typeof ExportPdfService !== "undefined") ExportPdfService.exportAuditPdf();
                else window.print();
            };
        }
    }

    return { render };
})();
