// Emplacement : js/modules/dashboard.js
// Nom du fichier : dashboard.js

const DashboardModule = (() => {

    /* =========================
       UTILITAIRES RISQUES (UI)
    ========================== */
    function getRiskColor(score) {
        if (score < 3) return "var(--color-success)"; // Vert
        if (score < 8) return "var(--color-warning)"; // Jaune/Orange
        return "var(--color-danger)";                 // Rouge
    }

    function getRiskLabel(score) {
        if (score < 3) return "Non critique";
        if (score < 8) return "Critique";
        return "Très critique";
    }

    function render() {
        const currentClient = localStorage.getItem("cyber-context") || "global";
        const exigences = DataStore.getExigencesByClient(currentClient);
        const tousActions = DataStore.getActions();
        const risques = DataStore.getRisques();
        const actifs = DataStore.getActifs();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        /* =========================
           FILTRAGE CONTEXTUEL DES ACTIONS
        ========================== */
        let actions = tousActions;
        if (currentClient !== "global") {
            const clientExigencesIds = exigences.map(e => e.id);
            actions = tousActions.filter(a =>
                a.exigence_id ? clientExigencesIds.includes(a.exigence_id) : true
            );
        }

        /* =========================
           KPI EXIGENCES (Conformité)
        ========================== */
        const totalExigences = exigences.length;
        const conformes = exigences.filter(e => e.statut_conformite === "conforme").length;
        const partiellement = exigences.filter(e => e.statut_conformite === "partiellement conforme").length;
        const nonConformes = exigences.filter(e => e.statut_conformite === "non conforme").length;
        const nonApplicables = exigences.filter(e => e.statut_conformite === "non applicable").length;

        const exigencesApplicables = totalExigences - nonApplicables;
        const tauxConformite = exigencesApplicables === 0
            ? 0
            : Math.round((conformes / exigencesApplicables) * 100);

        /* =========================
           KPI ACTIONS (Avancement)
        ========================== */
        const actionsAFaire = actions.filter(a => String(a.statut).toLowerCase() === "à faire").length;
        const actionsEnCours = actions.filter(a => String(a.statut).toLowerCase() === "en cours").length;
        const actionsTerminees = actions.filter(a => String(a.statut).toLowerCase() === "terminée").length;
        const totalActions = actions.length;

        const avancementActions = totalActions === 0
            ? 0
            : Math.round((actionsTerminees / totalActions) * 100);

        /* =========================
           KPI RISQUES (Nouveau calcul FxGxM)
        ========================== */
        const risquesTresCritiques = risques.filter(r => (r.score_residuel || 0) >= 8).length;
        const risquesCritiques = risques.filter(r => (r.score_residuel || 0) >= 3 && (r.score_residuel || 0) < 8).length;
        const risquesNonCritiques = risques.filter(r => (r.score_residuel || 0) < 3).length;

        // Le score d'exposition globale est maintenant la somme des scores résiduels
        const expositionGlobale = risques.reduce((acc, r) => acc + (r.score_residuel || 0), 0).toFixed(2);

        // Top 5 trié par score résiduel décroissant
        const topRisques = [...risques]
            .sort((a, b) => (b.score_residuel || 0) - (a.score_residuel || 0))
            .slice(0, 5);

        /* =========================
           INFO CONTEXTE (UI)
        ========================== */
        let contextName = "Vue Globale (Tous périmètres)";
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = `Conformité Client : ${c.nom}`;
        }

        /* =========================
           RENDU HTML
        ========================== */
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Tableau de bord</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre d'analyse : <strong>${contextName}</strong></p>
                    </div>
                    <div class="dashboard-actions no-print">
                        <button id="exportExcelBtn" style="margin-right: 10px;">Export Data (Excel)</button>
                        <button id="exportPdfBtn">Imprimer Rapport (PDF)</button>
                    </div>
                </div>

                <div class="dashboard-grid">

                    <div class="dashboard-card highlight-card clickable-card" onclick="Router.navigateTo('/exigences')" style="cursor:pointer;" title="Aller aux exigences">
                        <h3>Conformité globale</h3>
                        <div class="dashboard-value">${tauxConformite} %</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width:${tauxConformite}%; background-color: ${tauxConformite > 80 ? 'var(--color-success)' : tauxConformite > 50 ? 'var(--color-warning)' : 'var(--color-danger)'};"></div>
                        </div>
                        <div class="mini-kpi-grid">
                            <div><strong>${conformes}</strong><span>Conformes</span></div>
                            <div><strong>${partiellement}</strong><span>Partielles</span></div>
                            <div><strong>${nonConformes}</strong><span>Non conformes</span></div>
                        </div>
                        ${currentClient === "global" ? "" : `<div style="text-align: center; margin-top: 10px; font-size: 0.8rem; color: var(--text-muted);">Calculé sur les ${totalExigences} exigences de ce client</div>`}
                    </div>

                    <div class="dashboard-card clickable-card" onclick="Router.navigateTo('/actions')" style="cursor:pointer;" title="Aller au plan d'actions">
                        <h3>Plan d'actions</h3>
                        <div class="dashboard-value" style="color: var(--text-main);">${avancementActions} %</div>
                        <div class="progress-bar small">
                            <div class="progress-fill success" style="width:${avancementActions}%"></div>
                        </div>
                        <div class="mini-kpi-grid">
                            <div><strong>${actionsAFaire}</strong><span>À faire</span></div>
                            <div><strong>${actionsEnCours}</strong><span>En cours</span></div>
                            <div><strong>${actionsTerminees}</strong><span>Terminées</span></div>
                        </div>
                    </div>

                    <div class="dashboard-card alert-card clickable-card" onclick="Router.navigateTo('/risques')" style="cursor:pointer;" title="Aller au registre des risques">
                        <h3>Profil de Risque (Résiduel)</h3>

                        <div class="mini-kpi-grid" style="grid-template-columns: repeat(3, 1fr); margin-top: 1.5rem;">
                            <div class="risk" style="color: var(--color-danger);">
                                <strong>${risquesTresCritiques}</strong>
                                <span>Très critiques<br>(≥ 8)</span>
                            </div>
                            <div class="risk" style="color: var(--color-warning);">
                                <strong>${risquesCritiques}</strong>
                                <span>Critiques<br>(3 à 7.9)</span>
                            </div>
                            <div class="risk" style="color: var(--color-success);">
                                <strong>${risquesNonCritiques}</strong>
                                <span>Non critiques<br>(< 3)</span>
                            </div>
                        </div>

                        <div style="margin-top: 1.5rem; text-align: center; padding-top: 1rem; border-top: 1px solid var(--border);">
                            <span style="font-size: 0.9rem; color: var(--text-muted);">Score d'exposition globale : <strong style="font-size: 1.1rem; color: var(--text-main);">${expositionGlobale}</strong></span>
                        </div>
                    </div>

                    <div class="dashboard-card wide-card" style="display: flex; gap: 2rem;">

                        <div style="flex: 1;">
                            <h3>Top 5 des menaces internes</h3>
                            ${
                                topRisques.length === 0
                                    ? "<p style='color: var(--color-success); margin-top: 1rem;'>Aucun risque identifié dans le SI.</p>"
                                    : `
                                        <ul style="margin-top: 1rem;">
                                            ${topRisques.map(r => {
                                                const score = r.score_residuel || 0;
                                                return `
                                                <li class="clickable-risk" data-id="${r.id}" style="padding: 10px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                                                    <strong style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;" title="${r.nom}">${r.nom}</strong>
                                                    <span class="status" style="background: ${getRiskColor(score)}; color: white; font-size: 0.75rem; font-weight: bold;">
                                                        Score : ${score.toFixed(2)}
                                                    </span>
                                                </li>
                                                `;
                                            }).join("")}
                                        </ul>
                                      `
                            }
                        </div>

                        <div style="flex: 1; border-left: 1px solid var(--border); padding-left: 2rem;">
                            <h3>Inventaire SI & OT</h3>
                            <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                                <div style="background: var(--bg-body); padding: 1rem; border-radius: var(--radius); flex: 1; text-align: center;">
                                    <div style="font-size: 2rem; font-weight: bold; color: var(--primary);">${actifs.length}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Actifs cartographiés</div>
                                </div>
                                <div style="background: var(--bg-body); padding: 1rem; border-radius: var(--radius); flex: 1; text-align: center;">
                                    <div style="font-size: 2rem; font-weight: bold; color: var(--color-danger);">${actifs.filter(a => a.criticite === "critique").length}</div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Actifs critiques</div>
                                </div>
                            </div>
                            <button onclick="Router.navigateTo('/actifs')" style="width: 100%; margin-top: 1rem; justify-content: center; background: white; color: var(--primary); border: 1px solid var(--border);">Gérer les actifs</button>
                        </div>

                    </div>

                </div>
            </section>
        `;

        /* =========================
           INTERACTIONS
        ========================== */
        document.querySelectorAll(".clickable-risk").forEach(li => {
            li.onclick = () => Router.navigateTo(`/risques/${li.dataset.id}`);
        });

        // Sécurisation de l'export Excel
        const excelBtn = document.getElementById("exportExcelBtn");
        if (excelBtn) {
            excelBtn.onclick = () => {
                if (typeof ExportExcelService !== 'undefined') {
                    ExportExcelService.exportAudit();
                } else {
                    if(window.showToast) window.showToast("Erreur : Service d'export Excel introuvable.", "error");
                }
            };
        }

        // Impression du PDF
        const pdfBtn = document.getElementById("exportPdfBtn");
        if (pdfBtn) {
            pdfBtn.onclick = () => {
                if (typeof ExportPdfService !== 'undefined') {
                    ExportPdfService.exportAuditPdf();
                } else {
                    window.print();
                }
            };
        }
    }

    return { render };
})();