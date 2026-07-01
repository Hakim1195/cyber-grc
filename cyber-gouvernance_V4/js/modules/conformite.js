// Emplacement : js/modules/conformite.js
// Nom du fichier : conformite.js
//
// Vues transverses de conformité :
//   - /couverture   → couverture croisée : quelle part de chaque référentiel est
//                     adossée à une « mesure de sécurité », et matrice mesures × référentiels.
//   - /soa/:id      → déclaration d'applicabilité (SoA) imprimable d'un référentiel.
// S'appuie sur les évaluations (DataStore) et le registre `Referentiels`.

const ConformiteModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    const STATUTS = {
        "": { label: "Non évalué", cls: "status-non-evaluee" },
        "conforme": { label: "Conforme", cls: "status-conforme" },
        "partiellement conforme": { label: "Partiellement conforme", cls: "status-partiellement-conforme" },
        "non conforme": { label: "Non conforme", cls: "status-non-conforme" },
        "non applicable": { label: "Non applicable", cls: "status-non-applicable" }
    };
    function statutMeta(v) { return STATUTS[v || ""] || STATUTS[""]; }

    function refs() { return (typeof Referentiels !== "undefined") ? Referentiels.all() : []; }

    /* =========================
       COUVERTURE CROISÉE
    ========================== */
    function renderCouverture() {
        const app = document.getElementById("app");
        const allRefs = refs();
        const mesures = DataStore.getMesures();

        // Part de chaque référentiel adossée à au moins une mesure de sécurité.
        const perRef = allRefs.map(r => {
            const total = Referentiels.countExigences(r);
            const evs = DataStore.getEvaluationsByRef(r.id);
            const couvertes = evs.filter(e => e.mesure_id).length;
            return { ref: r, total, couvertes, pct: total ? Math.round((couvertes / total) * 100) : 0 };
        });

        const barsHtml = perRef.map(p => `
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:4px;">
                    <span><strong>${escapeHtml(p.ref.nom)}</strong> <span style="color:var(--text-muted);">(${escapeHtml(p.ref.editeur)})</span></span>
                    <span style="color:var(--text-muted);">${p.couvertes}/${p.total} exigences adossées · ${p.pct}%</span>
                </div>
                <div class="progress-bar small"><div class="progress-fill" style="width:${p.pct}%; background:var(--accent);"></div></div>
            </div>`).join("");

        // Matrice mesures × référentiels (nombre d'exigences couvertes).
        let matrixHtml;
        if (mesures.length === 0) {
            matrixHtml = `<div class="empty-state"><h3>Aucune mesure de sécurité</h3><p>Créez des <a href="#/mesures" style="color:var(--accent);">mesures de sécurité</a> et reliez-les aux exigences des référentiels pour visualiser leur couverture croisée.</p></div>`;
        } else {
            const headRefs = allRefs.map(r => `<th style="text-align:center;" title="${escapeHtml(r.nom)}">${escapeHtml(r.editeur)}</th>`).join("");
            const rows = mesures.map(m => {
                const evs = DataStore.getEvaluationsByMesure(m.id);
                const perRefCount = {};
                evs.forEach(e => { perRefCount[e.ref_id] = (perRefCount[e.ref_id] || 0) + 1; });
                const cells = allRefs.map(r => {
                    const n = perRefCount[r.id] || 0;
                    return `<td style="text-align:center;">${n ? `<span class="cov-cell">${n}</span>` : `<span style="color:var(--border);">·</span>`}</td>`;
                }).join("");
                const nbRefs = allRefs.filter(r => perRefCount[r.id]).length;
                const meta = statutMeta(m.statut);
                return `<tr class="clickable-row" data-id="${m.id}">
                    <td><strong>${escapeHtml(m.nom)}</strong></td>
                    <td><span class="status ${meta.cls}">${meta.label}</span></td>
                    ${cells}
                    <td style="text-align:center; font-weight:600;">${nbRefs > 1 ? `<span class="cov-cell cov-cell--multi">${nbRefs} réf.</span>` : (evs.length ? "1 réf." : "—")}</td>
                </tr>`;
            }).join("");
            matrixHtml = `
                <table class="data-table cov-matrix">
                    <thead><tr><th>Mesure de sécurité</th><th style="width:150px;">Statut</th>${headRefs}<th style="text-align:center;">Transverse</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <p style="font-size:0.82rem; color:var(--text-muted); margin-top:8px;">Chaque cellule indique le nombre d'exigences du référentiel couvertes par la mesure. Une mesure « transverse » (plusieurs référentiels) illustre le principe « évaluer une fois, appliquer partout ».</p>`;
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Couverture croisée</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Comment vos mesures de sécurité couvrent les différents référentiels. ${Help.tip("Une mesure de sécurité bien conçue satisfait des exigences de plusieurs cadres à la fois (ANSSI, ISO, NIS2…). Cette vue met en évidence ces recouvrements et les zones encore non couvertes.")}</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <a href="#/mapping" class="btn-secondary">Correspondances →</a>
                        <a href="#/referentiels" class="btn-secondary">← Référentiels</a>
                    </div>
                </div>

                <div class="dashboard-card">
                    <h3 style="margin-top:0;">Part de chaque référentiel adossée à une mesure</h3>
                    ${barsHtml || "<p style='color:var(--text-muted);'>Aucun référentiel chargé.</p>"}
                </div>

                <div class="dashboard-card" style="margin-top:1.5rem;">
                    <h3 style="margin-top:0;">Matrice mesures × référentiels</h3>
                    ${matrixHtml}
                </div>
            </section>`;

        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/mesures/" + r.dataset.id));
    }

    /* =========================
       DÉCLARATION D'APPLICABILITÉ (SoA)
    ========================== */
    function renderSoa(id) {
        const app = document.getElementById("app");
        const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(id) : null;
        if (!ref) {
            app.innerHTML = `<section class="page"><h1>Référentiel introuvable</h1><button onclick="Router.navigateTo('/referentiels')">Retour</button></section>`;
            return;
        }

        let applicables = 0, exclues = 0, conformes = 0, evaluees = 0, total = 0;
        const sections = ref.domaines.map(d => {
            const rows = d.exigences.map(ex => {
                const ev = DataStore.getEvaluation(ref.id, ex.code);
                const statut = ev ? (ev.statut || "") : "";
                const mat = ev ? (Number(ev.maturite) || 0) : 0;
                const mesure = (ev && ev.mesure_id) ? DataStore.getMesureById(ev.mesure_id) : null;
                const applicable = statut !== "non applicable";
                const justif = ev ? (ev.commentaire || "") : "";
                total++;
                if (statut) evaluees++;
                if (applicable) applicables++; else exclues++;
                if (statut === "conforme") conformes++;
                const meta = statutMeta(statut);
                return `<tr>
                    <td><strong>${escapeHtml(ex.code)}</strong></td>
                    <td>${escapeHtml(ex.titre)}</td>
                    <td style="text-align:center;">${applicable ? "Oui" : "<span style='color:var(--text-muted);'>Non</span>"}</td>
                    <td><span class="status ${meta.cls}">${meta.label}</span></td>
                    <td style="text-align:center;">${mat}/5</td>
                    <td>${mesure ? escapeHtml(mesure.nom) : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td style="font-size:0.85rem;">${escapeHtml(justif) || "<span style='color:var(--text-muted);'>—</span>"}</td>
                </tr>`;
            }).join("");
            return `<tr class="soa-domain-row"><td colspan="7"><strong>${escapeHtml(d.nom)}</strong></td></tr>${rows}`;
        }).join("");

        const dateJour = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

        app.innerHTML = `
            <section class="page soa-page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Déclaration d'applicabilité (SoA)</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">${escapeHtml(ref.nom)} — <a href="#/referentiels/${escapeHtml(ref.id)}" style="color:var(--accent);">retour à l'évaluation</a> ${Help.tip("La déclaration d'applicabilité (Statement of Applicability) est un livrable clé d'ISO 27001 : elle liste toutes les mesures, indique lesquelles s'appliquent, leur justification et leur état de mise en œuvre.")}</p>
                    </div>
                    <button onclick="window.print()" style="background:var(--primary);">Imprimer / PDF</button>
                </div>

                <div class="soa-print-head" style="display:none;">
                    <h1 style="margin-bottom:4px;">Déclaration d'applicabilité — ${escapeHtml(ref.nom)}</h1>
                    <p style="color:var(--text-muted);">Dedienne Aerospace · ${dateJour}</p>
                </div>

                <div class="soa-summary">
                    <div><strong>${total}</strong><span>Mesures</span></div>
                    <div><strong>${applicables}</strong><span>Applicables</span></div>
                    <div><strong>${exclues}</strong><span>Exclues</span></div>
                    <div><strong>${evaluees}</strong><span>Évaluées</span></div>
                    <div><strong>${applicables ? Math.round((conformes / applicables) * 100) : 0}%</strong><span>Conformité</span></div>
                </div>

                <table class="data-table soa-table">
                    <thead><tr>
                        <th>Réf.</th><th>Mesure</th><th style="text-align:center;">Applicable</th>
                        <th>Mise en œuvre</th><th style="text-align:center;">Mat.</th><th>Mesure de sécurité</th><th>Justification</th>
                    </tr></thead>
                    <tbody>${sections}</tbody>
                </table>

                <p class="soa-foot" style="margin-top:20px; color:var(--text-muted); font-size:0.8rem;">Document généré depuis Cyber GRC — Dedienne Aerospace. Les intitulés sont des reformulations ; se référer au référentiel officiel pour le texte exact.</p>
            </section>`;
    }

    return { renderCouverture, renderSoa };
})();
