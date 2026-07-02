// Emplacement : js/modules/synthese.js
// Nom du fichier : synthese.js
//
// SYNTHÈSE DIRECTION — tableau de bord d'arbitrage pour la gouvernance (COMEX / conseil).
// Objectif : donner à la direction une lecture immédiate de la posture cyber pour DÉCIDER
// (budgets, acceptation de risque, priorités réglementaires), pas seulement observer.
//
// Contenu :
//   • Indice de posture cyber (0-100, composite pondéré + jauge) et bandeau d'orientation ;
//   • KPI (performance du dispositif) et KRI (indicateurs de risque, avec seuils d'alerte) ;
//   • Tendances (courbes d'évolution issues de l'historique quotidien) ;
//   • Conformité réglementaire par référentiel (ANSSI/ISO/NIS2/DORA/AirCyber) ;
//   • Top risques résiduels + état de traitement ;
//   • Arbitrages & décisions attendus (générés depuis les données) ;
//   • Points de vigilance & échéances.
//
// Rapport : impression PDF native + TÉLÉCHARGEMENT d'un rapport HTML autonome (hors-ligne,
// sans dépendance) — le module embarque sa propre feuille de style pour un rendu identique.
// 100 % frontend, aucun réseau, données issues du seul DataStore (API synchrone).

const SyntheseModule = (() => {

    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? "" : s));
    const norm = (s) => String(s || "").toLowerCase();
    const clampPct = (v) => Math.max(0, Math.min(100, v));

    /* =========================================================================
       1. UTILITAIRES GRAPHIQUES (SVG/HTML autonomes, styles en ligne)
       Tout est auto-porté pour que le rapport téléchargé s'affiche sans CSS externe.
       ========================================================================= */

    // Jauge semi-circulaire 0-100 (indice de posture). Bandes de couleur + valeur centrale.
    function gaugeSvg(pct, bandColor) {
        pct = clampPct(pct);
        const cx = 100, cy = 100, r = 82;
        const pt = (a) => {
            const rad = a * Math.PI / 180;
            return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
        };
        const arc = (fromDeg, toDeg) => {
            const [x1, y1] = pt(fromDeg), [x2, y2] = pt(toDeg);
            const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
            // angles décroissants (180°→0°) = sens horaire à l'écran → sweep-flag 1
            return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
        };
        const endDeg = 180 - (pct / 100) * 180;
        return `<svg viewBox="0 0 200 128" width="210" style="max-width:100%; height:auto; display:block; margin:0 auto;" role="img" aria-label="Indice de posture ${Math.round(pct)} sur 100">
            <path d="${arc(180, 0)}" fill="none" stroke="#e6eaf0" stroke-width="18" stroke-linecap="round"/>
            <path d="${arc(180, endDeg)}" fill="none" stroke="${bandColor}" stroke-width="18" stroke-linecap="round"/>
            <text x="100" y="96" text-anchor="middle" font-size="42" font-weight="800" fill="#1f2d3d" font-family="Segoe UI, system-ui, sans-serif">${Math.round(pct)}</text>
            <text x="100" y="118" text-anchor="middle" font-size="13" fill="#6b7a8d" font-family="Segoe UI, system-ui, sans-serif">indice / 100</text>
        </svg>`;
    }

    // Anneau (donut) — segments : [{ value, color }]. Centre : valeur + sous-titre.
    function donutSvg(segments, centerMain, centerSub, size) {
        size = size || 150;
        const total = segments.reduce((s, x) => s + (x.value || 0), 0);
        const sw = Math.round(size * 0.16);
        const r = (size - sw) / 2 - 1;
        const c = size / 2;
        const C = 2 * Math.PI * r;
        let ring;
        if (total <= 0) {
            ring = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#e6eaf0" stroke-width="${sw}"/>`;
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
            ? `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.24)}" font-weight="bold" fill="#1f2d3d" font-family="Segoe UI, system-ui, sans-serif">${esc(centerMain)}</text>` : "";
        const sub = centerSub
            ? `<text x="${c}" y="${c + size * 0.18}" text-anchor="middle" font-size="${Math.round(size * 0.093)}" fill="#6b7a8d" font-family="Segoe UI, system-ui, sans-serif">${esc(centerSub)}</text>` : "";
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block;" role="img" aria-label="${esc((centerMain || "") + " " + (centerSub || ""))}">${ring}${main}${sub}</svg>`;
    }

    // Mini-courbe (sparkline) : série de valeurs → aire + ligne + point final.
    function sparklineSvg(values, color) {
        const W = 200, H = 40, pad = 4;
        const n = values.length;
        if (n < 2) return `<span style="font-size:0.72rem; color:#94a3b8;">Courbe dès le 2ᵉ jour</span>`;
        let min = Math.min.apply(null, values), max = Math.max.apply(null, values);
        if (min === max) { min -= 1; max += 1; }
        const x = i => pad + i * (W - 2 * pad) / (n - 1);
        const y = v => H - pad - (v - min) / (max - min) * (H - 2 * pad);
        const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
        const area = `${pad.toFixed(1)},${(H - pad).toFixed(1)} ${pts} ${(W - pad).toFixed(1)},${(H - pad).toFixed(1)}`;
        return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:38px; display:block;" role="img" aria-label="Tendance">
            <polygon points="${area}" fill="${color}" fill-opacity="0.12"/>
            <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            <circle cx="${x(n - 1).toFixed(1)}" cy="${y(values[n - 1]).toFixed(1)}" r="2.6" fill="${color}"/>
        </svg>`;
    }

    // Barre horizontale (0-max). valueLabel/caption optionnels.
    function hbar(label, value, max, color, valueLabel, caption) {
        const pct = max > 0 ? clampPct(Math.round((value / max) * 100)) : 0;
        return `<div style="margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
                <span style="font-size:0.86rem; color:#1f2d3d;">${esc(label)}</span>
                <span style="font-size:0.86rem; font-weight:700; color:#1f2d3d; font-variant-numeric:tabular-nums;">${esc(valueLabel != null ? valueLabel : String(value))}</span>
            </div>
            <div style="background:#eef1f5; height:9px; border-radius:5px; overflow:hidden;"><div style="width:${pct}%; height:100%; background:${color}; border-radius:5px;"></div></div>
            ${caption ? `<div style="font-size:0.74rem; color:#6b7a8d; margin-top:3px;">${esc(caption)}</div>` : ""}
        </div>`;
    }

    /* =========================================================================
       2. COULEURS & SEUILS
       ========================================================================= */
    const COL = {
        ok: "#27ae60", warn: "#e08a00", crit: "#c0392b", info: "#2059A6",
        na: "#94a3b8", brand: "#E9631B", text: "#1f2d3d", muted: "#6b7a8d"
    };
    const toneColor = (t) => ({ ok: COL.ok, warn: COL.warn, crit: COL.crit, info: COL.info, neutral: COL.na })[t] || COL.na;
    const riskColor = (score) => score < 3 ? COL.ok : (score < 8 ? COL.warn : COL.crit);
    const riskLabel = (score) => score < 3 ? "Non critique" : (score < 8 ? "Critique" : "Très critique");

    // Classe une valeur numérique en ton (vert / orange / rouge) selon des seuils bas.
    function toneByCount(n, amberFrom, redFrom) {
        if (n >= redFrom) return "crit";
        if (n >= amberFrom) return "warn";
        return "ok";
    }

    /* =========================================================================
       3. AGRÉGATION DES RÉFÉRENTIELS
       Réplique la sémantique de referentiels.js / dashboard.js : moyenne CMMI sur les
       exigences applicables ; « non applicable » exclu ; « non évalué » = 0. Les
       questionnaires Oui/Non (scoring: "conformite", ex. AirCyber) sont hors moyenne CMMI.
       ========================================================================= */
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
                hasMaturite: gMatApp > 0,
                conformite: gApp ? Math.round((gConf / gApp) * 100) : null
            }
        };
    }

    // Risque inhérent d'un prestataire (identique à pra_prestataires.js).
    const CRIT_W = { faible: 1, moyenne: 2, forte: 3, vitale: 4 };
    const ACCES_W = { aucun: 1, limite: 2, etendu: 3 };
    function prestaRisk(p) {
        const cw = CRIT_W[p && p.criticite] || 0;
        const aw = ACCES_W[p && p.acces] || 0;
        if (!cw || !aw) return { score: 0, niveau: "Non évalué" };
        const score = cw * aw;
        if (score <= 2) return { score, niveau: "Faible" };
        if (score <= 5) return { score, niveau: "Modéré" };
        if (score <= 8) return { score, niveau: "Élevé" };
        return { score, niveau: "Critique" };
    }

    /* =========================================================================
       4. MODÈLE : tous les indicateurs de la synthèse
       Périmètre : conformité & actions suivent le sélecteur de client ; risques,
       incidents, dispositif & référentiels reflètent la posture GLOBALE (comme le dashboard).
       ========================================================================= */
    function computeModel() {
        const currentClient = localStorage.getItem("cyber-context") || "global";
        const clients = DataStore.getClients();

        // -- Conformité (périmètre) --
        const exigences = DataStore.getExigencesByClient(currentClient);
        const totalExigences = exigences.length;
        const conformes = exigences.filter(e => e.statut_conformite === "conforme").length;
        const partielles = exigences.filter(e => e.statut_conformite === "partiellement conforme").length;
        const nonConformes = exigences.filter(e => e.statut_conformite === "non conforme").length;
        const nonApplicables = exigences.filter(e => e.statut_conformite === "non applicable").length;
        const nonEvaluees = totalExigences - conformes - partielles - nonConformes - nonApplicables;
        const exigApplicables = totalExigences - nonApplicables;
        const tauxConformite = exigApplicables === 0 ? 0 : Math.round((conformes / exigApplicables) * 100);

        // -- Actions (périmètre) --
        const tousActions = DataStore.getActions();
        let actions = tousActions;
        if (currentClient !== "global") {
            const ids = new Set(exigences.map(e => e.id));
            actions = tousActions.filter(a => (a.exigence_id ? ids.has(a.exigence_id) : true));
        }
        const totalActions = actions.length;
        const actionsTerminees = actions.filter(a => norm(a.statut) === "terminée").length;
        const actionsOuvertes = totalActions - actionsTerminees;
        const avancement = totalActions === 0 ? 0 : Math.round((actionsTerminees / totalActions) * 100);

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const DAY = 86400000;
        const openWithEch = actions
            .filter(a => norm(a.statut) !== "terminée" && a.echeance)
            .map(a => { const d = new Date(a.echeance); d.setHours(0, 0, 0, 0); return Object.assign({}, a, { _days: Math.round((d - today) / DAY) }); });
        const overdue = openWithEch.filter(a => a._days < 0).sort((x, y) => x._days - y._days);
        const soon = openWithEch.filter(a => a._days >= 0 && a._days <= 30).sort((x, y) => x._days - y._days);
        const actionsEnRetard = overdue.length;
        const retardMax = overdue.length ? Math.abs(overdue[0]._days) : 0;

        // -- Risques (global) --
        const risques = DataStore.getRisques();
        const tresCritiques = risques.filter(r => (r.score_residuel || 0) >= 8);
        const critiques = risques.filter(r => (r.score_residuel || 0) >= 3 && (r.score_residuel || 0) < 8);
        const nonCritiques = risques.filter(r => (r.score_residuel || 0) < 3);
        const expo = risques.reduce((a, r) => a + (r.score_residuel || 0), 0);
        const expoMoyenne = risques.length ? expo / risques.length : 0;
        // Maîtrise du risque = 100 - charge résiduelle moyenne normalisée (résiduel max théorique = 16).
        const maitriseRisque = risques.length ? clampPct(Math.round(100 - (expoMoyenne / 16) * 100)) : null;
        const topRisques = [...risques].sort((a, b) => (b.score_residuel || 0) - (a.score_residuel || 0)).slice(0, 5)
            .map(r => {
                const acts = DataStore.getActionsByRisque(r.id);
                const done = acts.filter(a => norm(a.statut) === "terminée").length;
                let traitement = "Non traité", tTone = "crit";
                if (acts.length && done === acts.length) { traitement = "Traité"; tTone = "ok"; }
                else if (acts.length) { traitement = `En cours (${done}/${acts.length})`; tTone = "warn"; }
                return { r, actions: acts.length, traitement, tTone };
            });

        // -- Actifs (global) --
        const actifs = DataStore.getActifs();
        const actifsCritiques = actifs.filter(a => norm(a.criticite) === "critique").length;

        // -- Incidents (global) --
        const incidents = (typeof DataStore.getIncidents === "function") ? DataStore.getIncidents() : [];
        const incidentsOuverts = incidents.filter(i => { const s = norm(i.statut); return s === "nouveau" || s === "en cours"; }).length;
        const incidentsGraves = incidents.filter(i => { const g = norm(i.gravite); return g === "critique" || g === "élevée"; }).length;
        const declarationsEnAttente = incidents.filter(i => norm(i.declaration_anssi) === "à déclarer" || norm(i.declaration_cnil) === "à déclarer").length;
        const incidentsRecents = incidents.filter(i => i.date_detection).slice()
            .sort((a, b) => new Date(b.date_detection) - new Date(a.date_detection)).slice(0, 5);

        // -- Prestataires / tiers (global) --
        const prestataires = DataStore.getPrestataires();
        const prestaARisque = prestataires.filter(p => ["Élevé", "Critique"].includes(prestaRisk(p).niveau)).length;

        // -- Dispositif (global) --
        const processus = DataStore.getProcessus();
        const scenarios = DataStore.getScenariosPra();
        const tests = DataStore.getTestsPra();
        const crise = DataStore.getCriseMembres();
        const audits = DataStore.getAudits();
        const mesures = DataStore.getMesures();
        const documents = (typeof DataStore.getDocuments === "function") ? DataStore.getDocuments() : [];
        const traitements = (typeof DataStore.getTraitements === "function") ? DataStore.getTraitements() : [];
        const auditsRealises = audits.filter(a => a.statut === "Réalisé").length;
        const constatsNC = audits.reduce((n, a) => n + (Array.isArray(a.constats) ? a.constats.filter(c => c.type === "Mineure" || c.type === "Majeure").length : 0), 0);
        const lastTest = [...tests].filter(t => t.date).sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

        // Documents à réviser (revue échue/proche ou statut à réviser/obsolète)
        const docsRevision = documents.map(d => {
            let days = null;
            if (d.date_revue) { const dd = new Date(d.date_revue); dd.setHours(0, 0, 0, 0); days = Math.round((dd - today) / DAY); }
            return Object.assign({}, d, { _days: days });
        }).filter(d => norm(d.statut) === "à réviser" || norm(d.statut) === "obsolète" || (d._days !== null && d._days <= 30));
        const docsEnVigueur = documents.filter(d => norm(d.statut) === "en vigueur").length;
        const docsAJour = documents.length ? clampPct(Math.round((docsEnVigueur / documents.length) * 100)) : null;

        // -- Référentiels (global) --
        const ref = computeReferentiels();

        // -- Couverture du dispositif (12 capacités du programme GRC) --
        const capacites = [
            { nom: "Actifs cartographiés", ok: actifs.length > 0, route: "/actifs" },
            { nom: "Risques appréciés (EBIOS)", ok: risques.length > 0, route: "/risques" },
            { nom: "Référentiel auto-évalué", ok: ref.global.evaluated > 0, route: "/referentiels" },
            { nom: "Plan d'actions actif", ok: totalActions > 0, route: "/actions" },
            { nom: "BIA (impacts métier)", ok: processus.length > 0, route: "/bia" },
            { nom: "Scénarios PCA/PRA", ok: scenarios.length > 0, route: "/pra" },
            { nom: "Continuité testée", ok: tests.length > 0, route: "/tests" },
            { nom: "Cellule de crise", ok: crise.length > 0, route: "/crise" },
            { nom: "Politiques documentées", ok: documents.length > 0, route: "/documents" },
            { nom: "Registre RGPD (art. 30)", ok: traitements.length > 0, route: "/rgpd" },
            { nom: "Contrôles / audits", ok: auditsRealises > 0, route: "/audits" },
            { nom: "Tiers évalués (NIS2/DORA)", ok: prestataires.length > 0, route: "/prestataires" }
        ];
        const capOk = capacites.filter(c => c.ok).length;
        const couvertureDispositif = Math.round((capOk / capacites.length) * 100);

        // -- Contexte --
        let contextName = "Vue globale (interne + tous donneurs d'ordre)";
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = "Donneur d'ordre : " + c.nom;
        }

        // -- Indice de posture composite (0-100) --
        const posture = computePosture({
            conformite: tauxConformite, exigApplicables,
            maturite: ref.global.maturite, hasMaturite: ref.global.hasMaturite,
            maitriseRisque, hasRisques: risques.length > 0,
            avancement, hasActions: totalActions > 0,
            couvertureDispositif,
            tresCritiques: tresCritiques.length, declarationsEnAttente
        });

        // -- Conformité comparative par donneur d'ordre (posture consolidée) --
        const allExig = DataStore.getExigences();
        const confOf = (exs) => {
            const applic = exs.filter(e => e.statut_conformite !== "non applicable").length;
            const conf = exs.filter(e => e.statut_conformite === "conforme").length;
            return { pct: applic ? Math.round((conf / applic) * 100) : null, conf, applic, total: exs.length };
        };
        const clientConfRows = [];
        const internes = allExig.filter(e => !e.client_id);
        if (internes.length) clientConfRows.push(Object.assign({ nom: "Exigences internes" }, confOf(internes)));
        clients.forEach(c => { const exs = allExig.filter(e => e.client_id === c.id); if (exs.length) clientConfRows.push(Object.assign({ nom: c.nom }, confOf(exs))); });
        clientConfRows.sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct));

        const aucuneDonnee = totalExigences === 0 && risques.length === 0 && actifs.length === 0 &&
            totalActions === 0 && ref.global.evaluated === 0 && processus.length === 0;

        return {
            currentClient, contextName, aucuneDonnee,
            totalExigences, conformes, partielles, nonConformes, nonApplicables, nonEvaluees, exigApplicables, tauxConformite,
            totalActions, actionsTerminees, actionsOuvertes, avancement, actionsEnRetard, retardMax, overdue, soon,
            risques, tresCritiques, critiques, nonCritiques, expo, expoMoyenne, maitriseRisque, topRisques,
            actifs, actifsCritiques,
            incidents, incidentsOuverts, incidentsGraves, declarationsEnAttente, incidentsRecents,
            prestataires, prestaARisque,
            processus, scenarios, tests, crise, audits, auditsRealises, constatsNC, mesures, documents, traitements, lastTest,
            docsRevision, docsAJour, docsEnVigueur,
            ref, capacites, capOk, couvertureDispositif,
            posture, clientConfRows
        };
    }

    // Indice de posture : moyenne pondérée des composantes DISPONIBLES (renormalisée),
    // moins des pénalités réglementaires. Formule transparente (voir note de méthode).
    function computePosture(x) {
        const comps = [];
        comps.push({ w: 0.30, v: clampPct(x.exigApplicables > 0 ? x.conformite : 0), on: x.exigApplicables > 0 });
        comps.push({ w: 0.20, v: clampPct((x.maturite / 5) * 100), on: x.hasMaturite });
        comps.push({ w: 0.25, v: clampPct(x.maitriseRisque || 0), on: x.hasRisques });
        comps.push({ w: 0.10, v: clampPct(x.avancement), on: x.hasActions });
        comps.push({ w: 0.15, v: clampPct(x.couvertureDispositif), on: true });
        const active = comps.filter(c => c.on);
        const wSum = active.reduce((s, c) => s + c.w, 0) || 1;
        let score = active.reduce((s, c) => s + c.v * (c.w / wSum), 0);
        // Pénalités : risque très critique ouvert et obligation réglementaire en attente.
        score -= Math.min(15, x.tresCritiques * 6);
        score -= Math.min(15, x.declarationsEnAttente * 8);
        score = Math.round(clampPct(score));
        let band, color, label;
        if (score >= 80) { band = "Optimale"; color = COL.ok; label = "Posture maîtrisée et pilotée"; }
        else if (score >= 65) { band = "Maîtrisée"; color = COL.ok; label = "Posture globalement maîtrisée"; }
        else if (score >= 50) { band = "À consolider"; color = COL.warn; label = "Dispositif à consolider"; }
        else if (score >= 30) { band = "Fragile"; color = COL.warn; label = "Posture fragile, actions requises"; }
        else { band = "Critique"; color = COL.crit; label = "Situation critique, arbitrage immédiat"; }
        return { score, band, color, label, components: active.length };
    }

    /* =========================================================================
       5. INSTANTANÉ GLOBAL (historique des tendances)
       Mêmes clés que dashboard.js pour une série temporelle partagée et cohérente.
       ========================================================================= */
    function recordSnapshot() {
        if (typeof DataStore.recordDailySnapshot !== "function") return;
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
        DataStore.recordDailySnapshot({ conformite, maturite, expo, risques_crit, actions_retard, avancement, incidents_ouverts });
    }

    /* =========================================================================
       6. CONSTRUCTION DES SECTIONS (HTML)
       Chaque bloc est auto-porté (styles en ligne + classes définies dans styleBlock()).
       ========================================================================= */

    function statTile(cfg) {
        // cfg : { value, unit, label, sub, tone, help, series?, higherIsBetter?, deltaDecimals?, deltaUnit? }
        const tone = cfg.tone || "neutral";
        const color = toneColor(tone);
        let deltaHtml = "";
        if (Array.isArray(cfg.series) && cfg.series.length >= 2) {
            const dec = cfg.deltaDecimals || 0;
            const du = cfg.deltaUnit || "";
            const delta = cfg.series[cfg.series.length - 1] - cfg.series[0];
            if (Math.abs(delta) < Math.pow(10, -dec) / 2) {
                deltaHtml = `<span class="sd-delta" style="color:${COL.muted};">→ stable</span>`;
            } else {
                const good = cfg.higherIsBetter ? delta > 0 : delta < 0;
                const arrow = delta > 0 ? "▲" : "▼";
                deltaHtml = `<span class="sd-delta" style="color:${good ? COL.ok : COL.crit};">${arrow} ${Math.abs(delta).toFixed(dec)}${du}</span>`;
            }
        }
        return `<div class="sd-tile" style="border-top-color:${color};">
            <div class="sd-tile__lbl">${esc(cfg.label)}${cfg.help ? " " + Help.tip(cfg.help) : ""}</div>
            <div class="sd-tile__val" style="color:${tone === "neutral" ? COL.text : color};">${esc(String(cfg.value))}${cfg.unit ? `<small>${esc(cfg.unit)}</small>` : ""} ${deltaHtml}</div>
            ${cfg.sub ? `<div class="sd-tile__sub">${cfg.sub}</div>` : ""}
        </div>`;
    }

    // KRI : tuile avec pastille de seuil (vert/orange/rouge) et statut explicite.
    function kriTile(cfg) {
        const color = toneColor(cfg.tone);
        const statutTxt = { ok: "Sous contrôle", warn: "À surveiller", crit: "Seuil d'alerte", neutral: "Informatif" }[cfg.tone] || "";
        return `<div class="sd-kri" style="border-left-color:${color};">
            <div class="sd-kri__top">
                <span class="sd-kri__lbl">${esc(cfg.label)}${cfg.help ? " " + Help.tip(cfg.help) : ""}</span>
                <span class="sd-kri__dot" style="background:${color};" title="${esc(statutTxt)}"></span>
            </div>
            <div class="sd-kri__val" style="color:${cfg.tone === "neutral" ? COL.text : color};">${esc(String(cfg.value))}${cfg.unit ? `<small>${esc(cfg.unit)}</small>` : ""}</div>
            <div class="sd-kri__sub">${cfg.sub ? cfg.sub + " · " : ""}<strong style="color:${color};">${esc(statutTxt)}</strong></div>
        </div>`;
    }

    function sectionTitle(txt, help) {
        return `<div class="sd-sec-title">${esc(txt)}${help ? " " + Help.tip(help) : ""}</div>`;
    }

    // Orientation exécutive : bandeau de posture (ton + titre + message de synthèse).
    function buildOrientation(m) {
        const p = m.posture;
        // Base vierge : ne pas afficher une posture « maîtrisée » trompeuse — la démarche
        // n'est pas encore initialisée (le dispositif est à construire).
        if (m.aucuneDonnee) {
            const border = toneColor("info");
            return `<div class="sd-orient" style="border-left-color:${border};">
                <div class="sd-orient__dot" style="background:${border};"></div>
                <div>
                    <h2>Démarche GRC à initialiser</h2>
                    <p>Aucune donnée n'est encore saisie : la posture ne peut pas être évaluée (indice ${p.score}/100). Commencez par cartographier vos actifs, apprécier vos risques (EBIOS) puis auto-évaluer un référentiel — cette synthèse et son rapport s'enrichiront automatiquement.</p>
                </div>
            </div>`;
        }
        let tone = "ok", title = "Posture de sécurité maîtrisée", parts = [];
        const facts = [];
        if (m.ref.global.hasMaturite) facts.push(`maturité ${m.ref.global.maturite.toFixed(1)}/5`);
        facts.push(`conformité ${m.tauxConformite}%`);
        facts.push(`couverture dispositif ${m.couvertureDispositif}%`);
        if (m.risques.length) facts.push(`exposition résiduelle ${m.expo.toFixed(1)}`);

        if (m.declarationsEnAttente > 0) {
            tone = "crit"; title = "Obligation réglementaire en attente";
            parts.push(`${m.declarationsEnAttente} incident(s) à déclarer sous délai (NIS2 24 h/72 h, RGPD 72 h).`);
            if (m.tresCritiques.length) parts.push(`${m.tresCritiques.length} risque(s) très critique(s) en parallèle.`);
        } else if (m.tresCritiques.length > 0) {
            tone = "crit"; title = "Arbitrage immédiat requis";
            parts.push(`${m.tresCritiques.length} risque(s) résiduel(s) très critique(s) (score ≥ 8) exposent le SI.`);
            if (m.incidentsOuverts) parts.push(`${m.incidentsOuverts} incident(s) ouvert(s).`);
            if (m.actionsEnRetard) parts.push(`${m.actionsEnRetard} action(s) en retard.`);
        } else if (m.actionsEnRetard > 0) {
            tone = "warn"; title = "Retards de traitement à résorber";
            parts.push(`${m.actionsEnRetard} action(s) de remédiation ont dépassé leur échéance (retard max ${m.retardMax} j).`);
            if (m.critiques.length) parts.push(`${m.critiques.length} risque(s) critique(s) à suivre.`);
        } else if (m.critiques.length > 0) {
            tone = "warn"; title = "Vigilance sur les risques critiques";
            parts.push(`${m.critiques.length} risque(s) critique(s) (score 3 à 7.9) identifié(s). Suivi du plan d'actions requis.`);
        } else if (m.exigApplicables > 0 && m.tauxConformite < 80) {
            tone = "warn"; title = "Conformité à consolider";
            parts.push(`La conformité atteint ${m.tauxConformite}% sur ce périmètre. ${m.nonConformes} exigence(s) non conforme(s) à traiter.`);
        } else {
            parts.push("Aucune alerte critique sur le périmètre. Poursuivez l'amélioration continue et le maintien en condition de sécurité.");
        }
        parts.push(`Indice de posture : ${p.score}/100 (${p.band}). Indicateurs clés : ${facts.join(", ")}.`);
        const border = toneColor(tone);
        return `<div class="sd-orient" style="border-left-color:${border};">
            <div class="sd-orient__dot" style="background:${border};"></div>
            <div>
                <h2>${esc(title)}</h2>
                <p>${esc(parts.join(" "))}</p>
            </div>
        </div>`;
    }

    // Indice de posture (jauge) + décomposition synthétique.
    function buildPostureCard(m) {
        const p = m.posture;
        const rows = [
            { lbl: "Conformité (exigences applicables)", val: m.exigApplicables > 0 ? m.tauxConformite + " %" : "n/a", on: m.exigApplicables > 0, pct: m.tauxConformite },
            { lbl: "Maturité des référentiels (CMMI)", val: m.ref.global.hasMaturite ? m.ref.global.maturite.toFixed(1) + " / 5" : "n/a", on: m.ref.global.hasMaturite, pct: (m.ref.global.maturite / 5) * 100 },
            { lbl: "Maîtrise du risque résiduel", val: m.maitriseRisque != null ? m.maitriseRisque + " %" : "n/a", on: m.maitriseRisque != null, pct: m.maitriseRisque || 0 },
            { lbl: "Avancement du plan d'actions", val: m.totalActions ? m.avancement + " %" : "n/a", on: m.totalActions > 0, pct: m.avancement },
            { lbl: "Couverture du dispositif GRC", val: m.couvertureDispositif + " %", on: true, pct: m.couvertureDispositif }
        ];
        const list = rows.map(r => `<div class="sd-comp ${r.on ? "" : "sd-comp--off"}">
            <span class="sd-comp__lbl">${esc(r.lbl)}</span>
            <span class="sd-comp__bar"><span style="width:${r.on ? clampPct(Math.round(r.pct)) : 0}%; background:${r.on ? COL.info : COL.na};"></span></span>
            <span class="sd-comp__val">${esc(r.val)}</span>
        </div>`).join("");
        const pen = [];
        if (m.tresCritiques.length) pen.push(`−${Math.min(15, m.tresCritiques.length * 6)} risque(s) très critique(s)`);
        if (m.declarationsEnAttente) pen.push(`−${Math.min(15, m.declarationsEnAttente * 8)} déclaration(s) en attente`);
        return `<div class="sd-card sd-posture">
            <div class="sd-posture__gauge">
                ${gaugeSvg(p.score, p.color)}
                <div class="sd-posture__band" style="color:${p.color};">${esc(p.band)}</div>
                <div class="sd-posture__lbl">${esc(p.label)}</div>
            </div>
            <div class="sd-posture__detail">
                <h3 style="margin:0 0 4px;">Indice de posture cyber ${Help.tip("Note composite 0-100 = moyenne pondérée des composantes disponibles (conformité 30 %, maturité 20 %, maîtrise du risque 25 %, avancement 10 %, couverture 15 %), renormalisée, moins des pénalités pour risques très critiques et obligations réglementaires en attente. Aide à la décision, non normative.")}</h3>
                <p style="margin:0 0 12px; color:${COL.muted}; font-size:0.85rem;">Lecture unique de la posture pour l'arbitrage. ${pen.length ? "Pénalités appliquées : " + esc(pen.join(" ; ")) + "." : "Aucune pénalité réglementaire appliquée."}</p>
                ${list}
            </div>
        </div>`;
    }

    // KPI (performance du dispositif) — avec tendances issues de l'historique.
    function buildKpis(m, history) {
        const hSeries = key => history.map(h => (h.metrics && h.metrics[key] != null) ? Number(h.metrics[key]) : 0);
        const tiles = [
            statTile({ label: "Conformité", value: m.tauxConformite, unit: "%", tone: m.tauxConformite >= 80 ? "ok" : m.tauxConformite >= 50 ? "warn" : "crit", sub: `${m.conformes}/${m.exigApplicables} exigences applicables`, series: hSeries("conformite"), higherIsBetter: true, deltaUnit: "%", help: "Part des exigences applicables jugées conformes sur le périmètre analysé." }),
            statTile({ label: "Maturité référentiels", value: m.ref.global.hasMaturite ? m.ref.global.maturite.toFixed(1) : "—", unit: m.ref.global.hasMaturite ? "/5" : "", tone: !m.ref.global.hasMaturite ? "neutral" : m.ref.global.maturite >= 4 ? "ok" : m.ref.global.maturite >= 2.5 ? "warn" : "crit", sub: `${m.ref.global.evaluated}/${m.ref.global.total} mesures évaluées`, series: hSeries("maturite"), higherIsBetter: true, deltaDecimals: 1, help: "Maturité moyenne (CMMI 0-5) des mesures applicables auto-évaluées (hors questionnaires Oui/Non)." }),
            statTile({ label: "Avancement plan d'actions", value: m.avancement, unit: "%", tone: m.avancement >= 80 ? "ok" : m.avancement >= 40 ? "warn" : "crit", sub: `${m.actionsTerminees}/${m.totalActions} terminées`, series: hSeries("avancement"), higherIsBetter: true, deltaUnit: "%", help: "Part des actions de remédiation terminées sur le total du périmètre." }),
            statTile({ label: "Couverture dispositif", value: m.couvertureDispositif, unit: "%", tone: m.couvertureDispositif >= 80 ? "ok" : m.couvertureDispositif >= 50 ? "warn" : "crit", sub: `${m.capOk}/${m.capacites.length} capacités en place`, help: "Part des briques de gouvernance opérationnelles (actifs, risques, référentiels, BIA, PCA/PRA, crise, audits, tiers…)." }),
            statTile({ label: "Audits réalisés", value: m.auditsRealises, unit: `/${m.audits.length}`, tone: m.constatsNC > 0 ? "warn" : m.auditsRealises > 0 ? "ok" : "neutral", sub: m.constatsNC > 0 ? `${m.constatsNC} non-conformité(s) ouverte(s)` : (m.audits.length ? "Aucune NC ouverte" : "Aucun audit planifié"), help: "Audits internes (ISO 27001 §9.2) réalisés et non-conformités constatées." }),
            statTile({ label: "Documentation à jour", value: m.docsAJour == null ? "—" : m.docsAJour, unit: m.docsAJour == null ? "" : "%", tone: m.docsAJour == null ? "neutral" : m.docsAJour >= 80 ? "ok" : m.docsAJour >= 50 ? "warn" : "crit", sub: m.documents.length ? `${m.docsEnVigueur}/${m.documents.length} en vigueur` : "Aucune politique enregistrée", help: "Part des politiques/documents « en vigueur » (ni brouillon, ni à réviser, ni obsolète)." })
        ];
        return `<div class="sd-grid sd-grid--kpi">${tiles.join("")}</div>`;
    }

    // KRI (indicateurs de risque) — chacun avec seuil d'alerte.
    function buildKris(m) {
        const tiles = [
            kriTile({ label: "Exposition résiduelle", value: m.expo.toFixed(1), tone: m.tresCritiques.length ? "crit" : m.critiques.length ? "warn" : m.risques.length ? "ok" : "neutral", sub: `moy. ${m.expoMoyenne.toFixed(1)}/risque`, help: "Somme des scores de risque résiduel (F×G×maîtrise). Plus la valeur est basse, mieux le risque est maîtrisé." }),
            kriTile({ label: "Risques très critiques", value: m.tresCritiques.length, tone: m.tresCritiques.length > 0 ? "crit" : "ok", sub: "score résiduel ≥ 8", help: "Scénarios dont le risque résiduel impose un traitement ou une acceptation formelle par la direction." }),
            kriTile({ label: "Risques critiques", value: m.critiques.length, tone: toneByCount(m.critiques.length, 1, 5), sub: "score résiduel 3 à 7.9", help: "Scénarios à suivre dans le plan d'actions." }),
            kriTile({ label: "Actions en retard", value: m.actionsEnRetard, tone: toneByCount(m.actionsEnRetard, 1, 5), sub: m.actionsEnRetard ? `retard max ${m.retardMax} j` : "aucun dépassement", help: "Actions non terminées dont l'échéance est dépassée — signal de dérive du plan." }),
            kriTile({ label: "Incidents ouverts", value: m.incidentsOuverts, tone: m.incidentsGraves > 0 ? "crit" : m.incidentsOuverts > 0 ? "warn" : "ok", sub: m.incidentsGraves ? `${m.incidentsGraves} grave(s)` : "aucun grave", help: "Incidents de sécurité au statut nouveau ou en cours." }),
            kriTile({ label: "Déclarations en attente", value: m.declarationsEnAttente, tone: m.declarationsEnAttente > 0 ? "crit" : "ok", sub: "NIS2 / RGPD", help: "Incidents à déclarer sous délai réglementaire (NIS2 24 h/72 h, RGPD 72 h). Risque juridique en cas de dépassement." }),
            kriTile({ label: "Tiers à risque élevé", value: m.prestaARisque, tone: toneByCount(m.prestaARisque, 1, 3), sub: "chaîne d'appro NIS2/DORA", help: "Prestataires dont le risque inhérent (criticité × accès) est Élevé ou Critique." }),
            kriTile({ label: "Non-conformités", value: m.nonConformes, tone: toneByCount(m.nonConformes, 1, 5), sub: "exigences applicables", help: "Exigences applicables non conformes — appellent une remédiation ou une acceptation de risque." })
        ];
        return `<div class="sd-grid sd-grid--kri">${tiles.join("")}</div>`;
    }

    // Tendances (courbes) — évolution des indicateurs clés.
    function buildTrends(m, history) {
        const n = history.length;
        const hSeries = key => history.map(h => (h.metrics && h.metrics[key] != null) ? Number(h.metrics[key]) : 0);
        const specs = [
            { key: "conformite", label: "Conformité", unit: "%", better: true, color: COL.ok, dec: 0 },
            { key: "maturite", label: "Maturité", unit: "/5", better: true, color: COL.info, dec: 1 },
            { key: "expo", label: "Exposition résiduelle", unit: "", better: false, color: COL.crit, dec: 1 },
            { key: "risques_crit", label: "Risques critiques", unit: "", better: false, color: COL.warn, dec: 0 },
            { key: "actions_retard", label: "Actions en retard", unit: "", better: false, color: COL.crit, dec: 0 },
            { key: "avancement", label: "Avancement actions", unit: "%", better: true, color: COL.brand, dec: 0 }
        ];
        const cards = specs.map(s => {
            const vals = hSeries(s.key);
            const cur = vals.length ? vals[vals.length - 1] : 0;
            let delta = "";
            if (vals.length >= 2) {
                const d = cur - vals[0];
                if (Math.abs(d) < Math.pow(10, -s.dec) / 2) delta = `<span style="color:${COL.muted};">→ stable</span>`;
                else { const good = s.better ? d > 0 : d < 0; delta = `<span style="color:${good ? COL.ok : COL.crit};">${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(s.dec)}${s.unit}</span>`; }
            }
            return `<div class="sd-trend">
                <div class="sd-trend__top"><span>${esc(s.label)}</span><strong>${cur.toFixed(s.dec)}${esc(s.unit)}</strong></div>
                ${sparklineSvg(vals, s.color)}
                <div class="sd-trend__delta">${delta || `<span style="color:${COL.muted};">—</span>`}</div>
            </div>`;
        }).join("");
        const hint = n < 2
            ? `L'historique se constitue automatiquement (un point par jour, conservé 180 j). Les courbes s'afficheront dès le 2ᵉ jour — actuellement <strong>${n}</strong> point${n > 1 ? "s" : ""}.`
            : `Évolution sur <strong>${n}</strong> jour(s) — la variation compare le dernier point au premier de la série.`;
        return `<div class="sd-card"><div class="sd-trend-grid">${cards}</div><p class="sd-hint">${hint}</p></div>`;
    }

    // Conformité réglementaire par référentiel (posture d'obligation).
    function buildRegulatory(m) {
        if (!m.ref.perRef.length) return `<div class="sd-card"><p class="sd-empty">Catalogue de référentiels indisponible.</p></div>`;
        const readiness = (r) => {
            if (!r.evaluated) return { txt: "Non initié", tone: "neutral" };
            const pct = r.conformite == null ? 0 : r.conformite;
            if (pct >= 80) return { txt: "Conforme", tone: "ok" };
            if (pct >= 50) return { txt: "Partiel", tone: "warn" };
            return { txt: "Écarts majeurs", tone: "crit" };
        };
        const rows = m.ref.perRef.map(r => {
            const rd = readiness(r);
            const col = toneColor(rd.tone);
            const barVal = r.conformite == null ? 0 : r.conformite;
            const secondaire = r.questionnaire
                ? `score Oui/Non ${r.conformite == null ? "—" : r.conformite + "%"}`
                : (r.hasMaturite === false ? "" : `maturité ${r.maturite.toFixed(1)}/5`);
            return `<tr>
                <td><strong>${esc(r.nom)}</strong><div class="sd-reg-ed">${esc(r.editeur || "")}</div></td>
                <td class="sd-reg-cov">${r.evaluated}/${r.total}</td>
                <td class="sd-reg-bar">
                    <span class="sd-reg-track"><span style="width:${clampPct(barVal)}%; background:${col};"></span></span>
                    <span class="sd-reg-pct">${r.conformite == null ? "—" : r.conformite + "%"}</span>
                </td>
                <td class="sd-reg-sec">${esc(secondaire)}</td>
                <td><span class="sd-pill" style="background:${col};">${esc(rd.txt)}</span></td>
            </tr>`;
        }).join("");
        return `<div class="sd-card">
            <table class="sd-reg-table">
                <thead><tr><th>Référentiel</th><th>Évaluées</th><th>Conformité</th><th>Détail</th><th>Posture</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <p class="sd-hint">Lecture d'obligation : NIS2 & DORA sont des obligations réglementaires ; ANSSI (hygiène) et ISO 27002 structurent le socle ; AirCyber conditionne la relation donneur d'ordre aéronautique.</p>
        </div>`;
    }

    // Top 5 risques résiduels + état de traitement.
    function buildTopRisks(m) {
        if (!m.risques.length) return `<div class="sd-card"><p class="sd-empty">Aucun risque identifié. Constituez le registre des risques (méthode EBIOS).</p></div>`;
        const seg = [
            { value: m.tresCritiques.length, color: COL.crit },
            { value: m.critiques.length, color: COL.warn },
            { value: m.nonCritiques.length, color: COL.ok }
        ];
        const rows = m.topRisques.map(t => {
            const score = t.r.score_residuel || 0;
            return `<li class="sd-risk-item" data-id="${esc(t.r.id)}">
                <span class="sd-risk-name" title="${esc(t.r.nom)}">${esc(t.r.nom || "(sans nom)")}</span>
                <span class="sd-risk-treat" style="color:${toneColor(t.tTone)};">${esc(t.traitement)}</span>
                <span class="sd-risk-score" style="background:${riskColor(score)};">${score.toFixed(2)}</span>
            </li>`;
        }).join("");
        return `<div class="sd-card sd-split">
            <div class="sd-split__side">
                ${donutSvg(seg, String(m.risques.length), "risques", 150)}
                <div class="sd-legend">
                    <div><span class="sd-dot" style="background:${COL.crit};"></span>Très critiques <b>${m.tresCritiques.length}</b></div>
                    <div><span class="sd-dot" style="background:${COL.warn};"></span>Critiques <b>${m.critiques.length}</b></div>
                    <div><span class="sd-dot" style="background:${COL.ok};"></span>Non critiques <b>${m.nonCritiques.length}</b></div>
                </div>
                <div class="sd-expo">Exposition globale : <strong>${m.expo.toFixed(2)}</strong></div>
            </div>
            <div class="sd-split__main">
                <h3 style="margin:0 0 6px;">Top 5 des risques résiduels ${Help.tip("Les cinq scénarios au plus fort risque résiduel, avec l'état de traitement (actions liées). À arbitrer en priorité : traiter, transférer ou accepter formellement.")}</h3>
                <ul class="sd-risk-list">${rows}</ul>
            </div>
        </div>`;
    }

    // Arbitrages & décisions attendus — générés depuis les données.
    function buildDecisions(m) {
        const D = [];
        if (m.tresCritiques.length > 0) D.push({ tone: "crit", title: "Traiter les risques très critiques", body: `Valider les budgets/ressources pour ${m.tresCritiques.length} risque(s) résiduel(s) ≥ 8, ou en acter l'acceptation formelle.`, route: "/risques" });
        if (m.declarationsEnAttente > 0) D.push({ tone: "crit", title: "Sécuriser les déclarations réglementaires", body: `Confirmer les ${m.declarationsEnAttente} déclaration(s) NIS2/RGPD en attente dans les délais légaux (24 h/72 h).`, route: "/incidents" });
        if (m.incidentsGraves > 0) D.push({ tone: "crit", title: "Piloter la remédiation post-incident", body: `${m.incidentsGraves} incident(s) grave(s) : valider le plan de remédiation et le retour d'expérience.`, route: "/incidents" });
        if (m.actionsEnRetard > 0) D.push({ tone: "warn", title: "Résorber les retards du plan d'actions", body: `Réallouer des ressources : ${m.actionsEnRetard} action(s) en retard (jusqu'à ${m.retardMax} j).`, route: "/actions" });
        if (m.prestaARisque > 0) D.push({ tone: "warn", title: "Renforcer la maîtrise des tiers", body: `${m.prestaARisque} prestataire(s) à risque élevé : exiger clauses de sécurité, audits et réversibilité (NIS2 art. 21 / DORA).`, route: "/prestataires" });
        if (m.scenarios.length > 0 && m.tests.length === 0) D.push({ tone: "warn", title: "Éprouver la continuité", body: "Des scénarios PCA/PRA sont définis mais jamais testés. Planifier un exercice de continuité.", route: "/tests" });
        if (m.ref.global.hasMaturite && m.ref.global.maturite < 3 && m.ref.global.evaluated > 0) D.push({ tone: "warn", title: "Investir dans la montée en maturité", body: `Maturité moyenne ${m.ref.global.maturite.toFixed(1)}/5 : arbitrer les investissements pour atteindre la cible de 3/5.`, route: "/referentiels" });
        if (m.nonConformes > 0) D.push({ tone: "info", title: "Statuer sur les non-conformités", body: `${m.nonConformes} exigence(s) applicable(s) non conforme(s) : décider remédiation ou acceptation formelle du risque résiduel.`, route: "/exigences" });
        if (m.docsRevision.length > 0) D.push({ tone: "info", title: "Valider la revue documentaire", body: `${m.docsRevision.length} politique(s) à réviser ou dont la revue arrive à échéance.`, route: "/documents" });
        if (m.couvertureDispositif < 100) {
            const manquants = m.capacites.filter(c => !c.ok).map(c => c.nom);
            if (manquants.length) D.push({ tone: "info", title: "Compléter le dispositif GRC", body: `Capacités à initier : ${manquants.slice(0, 4).join(", ")}${manquants.length > 4 ? "…" : ""}.`, route: "/dashboard" });
        }
        if (!D.length) D.push({ tone: "ok", title: "Maintien en condition de sécurité", body: "Aucun arbitrage critique en attente. Poursuivre l'amélioration continue et le suivi périodique.", route: "/dashboard" });

        const items = D.slice(0, 8).map(d => {
            const col = toneColor(d.tone);
            const pr = { crit: "Prioritaire", warn: "Important", info: "À planifier", ok: "Nominal" }[d.tone];
            return `<div class="sd-decision" data-route="${esc(d.route)}" style="border-left-color:${col};">
                <div class="sd-decision__head"><span class="sd-decision__pr" style="color:${col};">${esc(pr)}</span><strong>${esc(d.title)}</strong></div>
                <p>${esc(d.body)}</p>
            </div>`;
        }).join("");
        return `<div class="sd-decision-grid">${items}</div>`;
    }

    // Points de vigilance & échéances (actions en retard/proches, docs, déclarations).
    function buildVigilance(m) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const watch = m.overdue.concat(m.soon).slice(0, 6);
        const actionsHtml = watch.length === 0
            ? `<p class="sd-empty">Aucune action en retard ni échéance proche.</p>`
            : `<ul class="sd-watch">${watch.map(a => {
                const late = a._days < 0;
                const badge = late ? `<span class="sd-badge sd-badge--late">Retard ${Math.abs(a._days)} j</span>` : `<span class="sd-badge sd-badge--soon">${a._days === 0 ? "Aujourd'hui" : "J-" + a._days}</span>`;
                const ech = a.echeance ? new Date(a.echeance).toLocaleDateString("fr-FR") : "—";
                return `<li class="sd-watch-item sd-action-item" data-id="${esc(a.id)}"><span class="sd-watch-body"><span class="sd-watch-title" title="${esc(a.titre || "")}">${esc(a.titre || "(sans titre)")}</span><span class="sd-watch-meta">Échéance ${ech}${a.responsable ? " · " + esc(a.responsable) : ""}</span></span>${badge}</li>`;
            }).join("")}</ul>`;
        const gravColor = g => { g = norm(g); return g === "critique" ? COL.crit : g === "élevée" ? COL.warn : g === "moyenne" ? COL.info : COL.na; };
        const incHtml = m.incidentsRecents.length === 0
            ? `<p class="sd-empty">Aucun incident enregistré.</p>`
            : `<ul class="sd-watch">${m.incidentsRecents.map(i => {
                const decl = norm(i.declaration_anssi) === "à déclarer" || norm(i.declaration_cnil) === "à déclarer";
                const date = i.date_detection ? new Date(i.date_detection).toLocaleDateString("fr-FR") : "—";
                return `<li class="sd-watch-item sd-incident-item" data-id="${esc(i.id)}"><span class="sd-wi-dot" style="background:${gravColor(i.gravite)};"></span><span class="sd-watch-body"><span class="sd-watch-title" title="${esc(i.titre || "")}">${esc(i.titre || "(sans titre)")}</span><span class="sd-watch-meta">${esc(i.type || "incident")} · ${date} · ${esc(i.statut || "")}</span></span>${decl ? `<span class="sd-badge sd-badge--late">À déclarer</span>` : ""}</li>`;
            }).join("")}</ul>`;
        return `<div class="sd-card sd-split">
            <div class="sd-split__col">
                <h3 style="margin:0 0 8px;">Actions à surveiller ${Help.tip("Actions non terminées en retard (échéance dépassée) ou arrivant à échéance sous 30 jours, triées par urgence.")}</h3>
                ${actionsHtml}
            </div>
            <div class="sd-split__col">
                <h3 style="margin:0 0 8px;">Incidents récents ${Help.tip("Les derniers incidents déclarés. « À déclarer » signale une obligation réglementaire en attente (NIS2/RGPD).")}</h3>
                ${incHtml}
            </div>
        </div>`;
    }

    // Comparatif de conformité par donneur d'ordre (posture consolidée).
    function buildClientComparison(m) {
        if (m.clientConfRows.length < 2) return "";
        const bars = m.clientConfRows.map(r => hbar(
            r.nom, r.pct == null ? 0 : r.pct, 100,
            r.pct == null ? COL.na : (r.pct >= 80 ? COL.ok : r.pct >= 50 ? COL.warn : COL.crit),
            r.pct == null ? "—" : r.pct + "%",
            `${r.conf}/${r.applic} conforme(s)${r.total !== r.applic ? " · " + (r.total - r.applic) + " N/A" : ""}`
        )).join("");
        return `<div class="sd-card">${bars}</div>`;
    }

    /* =========================================================================
       7. ASSEMBLAGE DU CORPS (réutilisé à l'écran ET dans le rapport téléchargé)
       ========================================================================= */
    function buildBody(m, history, opts) {
        opts = opts || {};
        const dateJour = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });

        return `
            ${buildOrientation(m)}
            ${buildPostureCard(m)}

            ${sectionTitle("Indicateurs de performance (KPI)", "Mesurent l'avancement et l'efficacité du dispositif de sécurité.")}
            ${buildKpis(m, history)}

            ${sectionTitle("Indicateurs de risque (KRI)", "Mesurent l'exposition et signalent les seuils d'alerte appelant une décision.")}
            ${buildKris(m)}

            ${sectionTitle("Évolution dans le temps")}
            ${buildTrends(m, history)}

            ${sectionTitle("Conformité réglementaire par référentiel")}
            ${buildRegulatory(m)}

            ${sectionTitle("Cartographie & priorisation des risques")}
            ${buildTopRisks(m)}

            ${m.clientConfRows.length >= 2 ? sectionTitle("Conformité par donneur d'ordre") + buildClientComparison(m) : ""}

            ${sectionTitle("Arbitrages & décisions attendus", "Décisions synthétisées à partir de vos données, à porter en comité de direction.")}
            ${buildDecisions(m)}

            ${sectionTitle("Points de vigilance & échéances")}
            ${buildVigilance(m)}

            <div class="sd-footer">
                <span>Dedienne Aerospace — Gouvernance & Sécurité de l'Information</span>
                <span>Document confidentiel · Édité le ${esc(dateJour)}</span>
            </div>`;
    }

    /* =========================================================================
       8. FEUILLE DE STYLE EMBARQUÉE (écran + rapport autonome)
       Portée sous .syndir pour ne pas fuir dans le reste de la SPA.
       ========================================================================= */
    function styleBlock() {
        return `<style>
        .syndir { --sd-brand:#E9631B; --sd-ink:#1f2d3d; --sd-mut:#6b7a8d; --sd-line:#e2e6ea; --sd-card:#fff; }
        .syndir .sd-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; border-bottom:3px solid var(--sd-brand); padding-bottom:12px; margin-bottom:22px; flex-wrap:wrap; }
        .syndir .sd-head h1 { margin:0 0 4px; color:var(--sd-brand); font-size:1.7rem; }
        .syndir .sd-head p { margin:0; color:var(--sd-mut); font-size:0.9rem; }
        .syndir .sd-head__meta { text-align:right; font-size:0.85rem; color:var(--sd-mut); }
        .syndir .sd-actions { display:flex; gap:8px; margin-top:8px; justify-content:flex-end; }
        .syndir .sd-actions button { padding:7px 14px; font-size:0.85rem; border:none; border-radius:6px; cursor:pointer; color:#fff; font-weight:600; }
        .syndir .sd-btn-print { background:var(--sd-brand); }
        .syndir .sd-btn-dl { background:#2059A6; }

        .syndir .sd-orient { display:flex; gap:14px; align-items:flex-start; background:#fff; border:1px solid var(--sd-line); border-left:5px solid var(--sd-brand); border-radius:8px; box-shadow:0 1px 3px rgba(16,32,60,0.08); padding:16px 18px; margin-bottom:20px; }
        .syndir .sd-orient__dot { width:12px; height:12px; border-radius:50%; margin-top:6px; flex-shrink:0; }
        .syndir .sd-orient h2 { font-size:1.1rem; margin:0 0 4px; color:var(--sd-ink); }
        .syndir .sd-orient p { margin:0; color:var(--sd-mut); font-size:0.9rem; line-height:1.5; }

        .syndir .sd-card { background:var(--sd-card); border:1px solid var(--sd-line); border-radius:8px; box-shadow:0 1px 3px rgba(16,32,60,0.08); padding:18px; margin-bottom:18px; }
        .syndir .sd-empty { color:var(--sd-mut); text-align:center; padding:14px; font-size:0.9rem; }
        .syndir .sd-hint { color:var(--sd-mut); font-size:0.78rem; margin:10px 0 0; }

        .syndir .sd-sec-title { display:flex; align-items:center; gap:12px; font-size:0.82rem; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:var(--sd-brand); margin:26px 0 14px; }
        .syndir .sd-sec-title::after { content:""; flex:1; height:2px; background:linear-gradient(90deg,var(--sd-line),transparent); }

        .syndir .sd-posture { display:grid; grid-template-columns:230px 1fr; gap:22px; align-items:center; }
        .syndir .sd-posture__gauge { text-align:center; }
        .syndir .sd-posture__band { font-size:1.15rem; font-weight:800; margin-top:2px; }
        .syndir .sd-posture__lbl { font-size:0.8rem; color:var(--sd-mut); }
        .syndir .sd-comp { display:grid; grid-template-columns:1fr 120px 62px; align-items:center; gap:10px; margin-bottom:8px; font-size:0.86rem; }
        .syndir .sd-comp--off { opacity:0.5; }
        .syndir .sd-comp__lbl { color:var(--sd-ink); }
        .syndir .sd-comp__bar { background:#eef1f5; height:8px; border-radius:5px; overflow:hidden; }
        .syndir .sd-comp__bar > span { display:block; height:100%; border-radius:5px; }
        .syndir .sd-comp__val { text-align:right; font-weight:700; color:var(--sd-ink); font-variant-numeric:tabular-nums; }

        .syndir .sd-grid { display:grid; gap:14px; margin-bottom:6px; }
        .syndir .sd-grid--kpi { grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); }
        .syndir .sd-grid--kri { grid-template-columns:repeat(auto-fit,minmax(185px,1fr)); }
        .syndir .sd-tile { background:#fff; border:1px solid var(--sd-line); border-top:3px solid var(--sd-mut); border-radius:8px; box-shadow:0 1px 3px rgba(16,32,60,0.08); padding:13px 15px; }
        .syndir .sd-tile__lbl { font-size:0.74rem; color:var(--sd-mut); text-transform:uppercase; letter-spacing:0.4px; }
        .syndir .sd-tile__val { font-size:1.85rem; font-weight:800; line-height:1.15; margin-top:3px; font-variant-numeric:tabular-nums; }
        .syndir .sd-tile__val small { font-size:0.95rem; font-weight:600; color:var(--sd-mut); }
        .syndir .sd-tile__val .sd-delta { font-size:0.8rem; font-weight:700; margin-left:6px; }
        .syndir .sd-tile__sub { font-size:0.78rem; color:var(--sd-mut); margin-top:4px; }

        .syndir .sd-kri { background:#fff; border:1px solid var(--sd-line); border-left:4px solid var(--sd-mut); border-radius:8px; box-shadow:0 1px 3px rgba(16,32,60,0.08); padding:12px 14px; }
        .syndir .sd-kri__top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .syndir .sd-kri__lbl { font-size:0.74rem; color:var(--sd-mut); text-transform:uppercase; letter-spacing:0.4px; }
        .syndir .sd-kri__dot { width:11px; height:11px; border-radius:50%; flex-shrink:0; }
        .syndir .sd-kri__val { font-size:1.75rem; font-weight:800; line-height:1.15; margin:3px 0; font-variant-numeric:tabular-nums; }
        .syndir .sd-kri__val small { font-size:0.9rem; font-weight:600; color:var(--sd-mut); }
        .syndir .sd-kri__sub { font-size:0.75rem; color:var(--sd-mut); }

        .syndir .sd-trend-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; }
        .syndir .sd-trend__top { display:flex; justify-content:space-between; align-items:baseline; font-size:0.82rem; color:var(--sd-mut); margin-bottom:2px; }
        .syndir .sd-trend__top strong { color:var(--sd-ink); font-size:1.05rem; font-variant-numeric:tabular-nums; }
        .syndir .sd-trend__delta { font-size:0.78rem; font-weight:700; margin-top:2px; }

        .syndir .sd-reg-table { width:100%; border-collapse:collapse; font-size:0.88rem; }
        .syndir .sd-reg-table th { text-align:left; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--sd-mut); padding:6px 8px; border-bottom:2px solid var(--sd-line); }
        .syndir .sd-reg-table td { padding:9px 8px; border-bottom:1px solid var(--sd-line); vertical-align:middle; }
        .syndir .sd-reg-ed { font-size:0.72rem; color:var(--sd-mut); }
        .syndir .sd-reg-cov { font-variant-numeric:tabular-nums; color:var(--sd-mut); white-space:nowrap; }
        .syndir .sd-reg-bar { min-width:150px; }
        .syndir .sd-reg-track { display:inline-block; width:90px; height:8px; background:#eef1f5; border-radius:5px; overflow:hidden; vertical-align:middle; margin-right:8px; }
        .syndir .sd-reg-track > span { display:block; height:100%; border-radius:5px; }
        .syndir .sd-reg-pct { font-weight:700; font-variant-numeric:tabular-nums; }
        .syndir .sd-reg-sec { font-size:0.8rem; color:var(--sd-mut); }
        .syndir .sd-pill { display:inline-block; padding:3px 10px; border-radius:12px; color:#fff; font-size:0.74rem; font-weight:700; white-space:nowrap; }

        .syndir .sd-split { display:grid; grid-template-columns:230px 1fr; gap:22px; align-items:start; }
        .syndir .sd-split__side { text-align:center; }
        .syndir .sd-split--2 { grid-template-columns:1fr 1fr; }
        .syndir .sd-split__col { min-width:0; }
        .syndir .sd-legend { margin-top:12px; font-size:0.82rem; text-align:left; display:inline-block; }
        .syndir .sd-legend > div { display:flex; align-items:center; gap:7px; margin-bottom:4px; }
        .syndir .sd-legend b { margin-left:auto; }
        .syndir .sd-dot { width:11px; height:11px; border-radius:3px; display:inline-block; }
        .syndir .sd-expo { margin-top:12px; padding-top:10px; border-top:1px solid var(--sd-line); font-size:0.85rem; color:var(--sd-mut); }
        .syndir .sd-risk-list { list-style:none; margin:0; padding:0; }
        .syndir .sd-risk-item { display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid var(--sd-line); cursor:pointer; }
        .syndir .sd-risk-item:last-child { border-bottom:none; }
        .syndir .sd-risk-name { font-weight:600; color:var(--sd-ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .syndir .sd-risk-treat { font-size:0.78rem; font-weight:600; white-space:nowrap; }
        .syndir .sd-risk-score { color:#fff; font-weight:700; font-size:0.78rem; padding:2px 9px; border-radius:12px; font-variant-numeric:tabular-nums; }

        .syndir .sd-decision-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
        .syndir .sd-decision { background:#fff; border:1px solid var(--sd-line); border-left:4px solid var(--sd-mut); border-radius:8px; box-shadow:0 1px 3px rgba(16,32,60,0.08); padding:13px 16px; cursor:pointer; transition:transform .15s ease, box-shadow .15s ease; }
        .syndir .sd-decision:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(16,32,60,0.10); }
        .syndir .sd-decision__head { display:flex; align-items:baseline; gap:10px; margin-bottom:5px; }
        .syndir .sd-decision__pr { font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; }
        .syndir .sd-decision__head strong { color:var(--sd-ink); font-size:0.95rem; }
        .syndir .sd-decision p { margin:0; color:var(--sd-mut); font-size:0.85rem; line-height:1.45; }

        .syndir .sd-watch { list-style:none; margin:0; padding:0; }
        .syndir .sd-watch-item { display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid var(--sd-line); cursor:pointer; }
        .syndir .sd-watch-item:last-child { border-bottom:none; }
        .syndir .sd-wi-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
        .syndir .sd-watch-body { flex:1; min-width:0; display:flex; flex-direction:column; }
        .syndir .sd-watch-title { font-weight:600; color:var(--sd-ink); font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .syndir .sd-watch-meta { font-size:0.75rem; color:var(--sd-mut); }
        .syndir .sd-badge { font-size:0.7rem; font-weight:700; padding:2px 9px; border-radius:12px; white-space:nowrap; }
        .syndir .sd-badge--late { background:#fbe9e7; color:#c0392b; }
        .syndir .sd-badge--soon { background:#fff4e0; color:#e08a00; }

        .syndir .sd-footer { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:26px; padding-top:14px; border-top:1px dashed var(--sd-line); color:var(--sd-mut); font-size:0.78rem; }

        @media (max-width:760px) {
            .syndir .sd-posture, .syndir .sd-split, .syndir .sd-split--2 { grid-template-columns:1fr; }
            .syndir .sd-comp { grid-template-columns:1fr 80px 54px; }
        }
        @media print {
            .syndir .no-print, .syndir .sd-actions { display:none !important; }
            .syndir .sd-card, .syndir .sd-tile, .syndir .sd-kri, .syndir .sd-decision, .syndir .sd-orient { box-shadow:none !important; break-inside:avoid; page-break-inside:avoid; }
            .syndir .sd-sec-title { break-after:avoid; }
        }
        </style>`;
    }

    /* =========================================================================
       9. RAPPORT AUTONOME TÉLÉCHARGEABLE (HTML hors-ligne, sans dépendance)
       ========================================================================= */
    function downloadReport(m, history) {
        const dateJour = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
        const stamp = new Date();
        const y = stamp.getFullYear(), mo = String(stamp.getMonth() + 1).padStart(2, "0"), d = String(stamp.getDate()).padStart(2, "0");
        const head = `<div class="sd-head">
            <div>
                <div style="font-size:0.8rem; font-weight:800; letter-spacing:1px; color:#2059A6; text-transform:uppercase;">Dedienne Aerospace</div>
                <h1>Synthèse Direction — Posture Cyber</h1>
                <p>Périmètre : <strong>${esc(m.contextName)}</strong> · Édité le ${esc(dateJour)}</p>
            </div>
            <div class="sd-head__meta"><strong>Cyber GRC</strong><br>Rapport d'aide à la décision<br>Document confidentiel</div>
        </div>`;
        const doc = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Synthèse Direction — Cyber GRC — ${esc(dateJour)}</title>
${styleBlock()}
<style>body{margin:0; background:#f5f6f8; font-family:'Segoe UI',system-ui,Roboto,Helvetica,Arial,sans-serif; color:#1f2d3d;} .syndir-wrap{max-width:1000px; margin:24px auto; background:#fff; padding:30px 34px; box-shadow:0 2px 14px rgba(16,32,60,0.10);} .help-tip{display:none !important;} @media print{body{background:#fff;} .syndir-wrap{box-shadow:none; margin:0; max-width:none;}}</style>
</head><body><div class="syndir-wrap"><div class="syndir">${head}${buildBody(m, history, { standalone: true })}</div></div></body></html>`;

        try {
            const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Synthese-Direction-${y}-${mo}-${d}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            if (window.showToast) window.showToast("Rapport de synthèse téléchargé (HTML autonome).", "success");
        } catch (e) {
            console.error("Téléchargement du rapport impossible", e);
            if (window.showToast) window.showToast("Échec du téléchargement du rapport.", "error");
        }
    }

    /* =========================================================================
       10. RENDU À L'ÉCRAN
       ========================================================================= */
    function render() {
        const app = document.getElementById("app");
        recordSnapshot();   // alimente l'historique des tendances (un point/jour, dédupliqué)
        const m = computeModel();
        const history = (typeof DataStore.getHistory === "function") ? DataStore.getHistory() : [];
        const dateJour = new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });

        const head = `<div class="sd-head">
            <div>
                <h1>Synthèse Direction</h1>
                <p>Périmètre d'analyse : <strong>${esc(m.contextName)}</strong></p>
            </div>
            <div class="sd-head__meta">
                <strong>${esc(dateJour)}</strong><br>Aide à la décision · Confidentiel
                <div class="sd-actions no-print">
                    <button class="sd-btn-print" id="sdPrintBtn" title="Imprimer / exporter en PDF">Imprimer (PDF)</button>
                    <button class="sd-btn-dl" id="sdDownloadBtn" title="Télécharger un rapport HTML autonome">Télécharger le rapport</button>
                </div>
            </div>
        </div>`;

        app.innerHTML = styleBlock() + `<section class="page syndir">${head}${buildBody(m, history, { standalone: false })}</section>`;

        // -- Interactions --
        const printBtn = document.getElementById("sdPrintBtn");
        if (printBtn) printBtn.onclick = () => {
            if (typeof ExportPdfService !== "undefined" && ExportPdfService.exportAuditPdf) ExportPdfService.exportAuditPdf();
            else window.print();
        };
        const dlBtn = document.getElementById("sdDownloadBtn");
        if (dlBtn) dlBtn.onclick = () => downloadReport(m, history);

        app.querySelectorAll(".sd-risk-item").forEach(li => { li.onclick = () => Router.navigateTo(`/risques/${li.dataset.id}`); });
        app.querySelectorAll(".sd-action-item").forEach(li => { li.onclick = () => Router.navigateTo(`/actions/${li.dataset.id}`); });
        app.querySelectorAll(".sd-incident-item").forEach(li => { li.onclick = () => Router.navigateTo(`/incidents/${li.dataset.id}`); });
        app.querySelectorAll(".sd-decision").forEach(el => { el.onclick = () => { const r = el.dataset.route; if (r) Router.navigateTo(r); }; });
    }

    return { render };
})();
