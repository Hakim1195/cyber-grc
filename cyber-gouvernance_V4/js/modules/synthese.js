// Emplacement : js/modules/synthese.js
// Nom du fichier : synthese.js

const SyntheseModule = (() => {

    function render() {
        const currentClient = localStorage.getItem("cyber-context") || "global";
        const exigences = DataStore.getExigencesByClient(currentClient);
        const tousActions = DataStore.getActions();
        const risques = DataStore.getRisques();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        /* =========================
           FILTRAGE DES ACTIONS
        ========================== */
        let actions = tousActions;
        if (currentClient !== "global") {
            const clientExigencesIds = exigences.map(e => e.id);
            actions = tousActions.filter(a =>
                a.exigence_id ? clientExigencesIds.includes(a.exigence_id) : true
            );
        }

        /* =========================
           CALCULS KPI
        ========================== */
        const totalExigences = exigences.length;
        const conformes = exigences.filter(e => e.statut_conformite === "conforme").length;
        const nonApplicables = exigences.filter(e => e.statut_conformite === "non applicable").length;
        const exigencesApplicables = totalExigences - nonApplicables;

        const tauxConformite = exigencesApplicables === 0
            ? 0
            : Math.round((conformes / exigencesApplicables) * 100);

        // NOUVEAU CALCUL DES RISQUES (FxGxM)
        const risquesTresCritiques = risques.filter(r => (r.score_residuel || 0) >= 8);
        const risquesCritiques = risques.filter(r => (r.score_residuel || 0) >= 3 && (r.score_residuel || 0) < 8);
        const risquesNonCritiques = risques.filter(r => (r.score_residuel || 0) < 3);

        const actionsOuvertes = actions.filter(a => String(a.statut).toLowerCase() !== "terminée").length;
        const actionsEnRetard = actions.filter(a => String(a.statut).toLowerCase() !== "terminée" && a.echeance && new Date(a.echeance) < new Date()).length;

        /* =========================
           INFO CONTEXTE
        ========================== */
        let contextName = "Interne & Tous Donneurs d'ordre";
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = `Donneur d'ordre : ${c.nom}`;
        }

        /* =========================
           LOGIQUE DU MESSAGE DE DIRECTION
        ========================== */
        let message = "Situation globale sous contrôle. Poursuite des actions préventives.";
        let messageClass = "info";

        if (risquesTresCritiques.length > 0) {
            message = `ALERTE : Présence de ${risquesTresCritiques.length} risque(s) très critique(s) (Score ≥ 8) impactant le SI. Un arbitrage immédiat est exigé.`;
            messageClass = "danger";
        } else if (risquesCritiques.length > 0) {
            message = `ATTENTION : ${risquesCritiques.length} risque(s) critique(s) (Score ≥ 3) identifié(s) en interne. Le suivi du plan d'actions est requis.`;
            messageClass = "warning";
        } else if (tauxConformite < 100 && currentClient !== "global") {
            message = `VIGILANCE CONTRAT : La conformité attendue par ce donneur d'ordre n'est pas encore totale (${tauxConformite}%).`;
            messageClass = "warning";
        } else if (actionsEnRetard > 0) {
            message = `RAPPEL : ${actionsEnRetard} action(s) de remédiation ont dépassé leur date d'échéance.`;
            messageClass = "warning";
        }

        const dateJour = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

        /* =========================
           RENDU HTML
        ========================== */
        app.innerHTML = `
            <section class="page synthese-page" style="max-width: 900px; margin: auto;">

                <img src="assets/logo/logo-dedienne.png" alt="Dedienne Aerospace" style="height: 46px; margin-bottom: 18px;" />

                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid var(--primary); padding-bottom: 10px; margin-bottom: 2rem;">
                    <div>
                        <h1 style="margin-bottom: 5px; color: var(--primary);">Note de Synthèse</h1>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0;">Périmètre d'analyse : <strong>${contextName}</strong></p>
                    </div>
                    <div style="text-align: right; font-size: 0.9rem;">
                        <strong>Date :</strong> ${dateJour}<br>
                        <button class="no-print" onclick="window.print()" style="margin-top: 10px; padding: 4px 10px; font-size: 0.8rem; background: var(--primary);">Imprimer</button>
                    </div>
                </div>

                <div class="synthese-message ${messageClass}" style="font-size: 1.2rem; text-align: center; margin-bottom: 2rem;">
                    ${message}
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 2.5rem;">

                    <div class="dashboard-card" style="text-align: center; border-top: 4px solid var(--accent);">
                        <h3 style="font-size: 1rem; color: var(--text-muted); text-transform: uppercase;">Conformité</h3>
                        <div class="big-kpi" style="font-size: 3rem; margin: 10px 0;">${tauxConformite}<span style="font-size: 1.5rem;">%</span></div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">Taux de couverture des exigences</div>
                    </div>

                    <div class="dashboard-card" style="text-align: center; border-top: 4px solid var(--color-danger);">
                        <h3 style="font-size: 1rem; color: var(--text-muted); text-transform: uppercase;">Exposition SI</h3>
                        <div class="big-kpi" style="font-size: 3rem; margin: 10px 0; color: var(--color-danger);">${risquesTresCritiques.length + risquesCritiques.length}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">
                            <span style="color:var(--color-danger); font-weight:bold;">${risquesTresCritiques.length}</span> Très critiques |
                            <span style="color:var(--color-warning); font-weight:bold;">${risquesCritiques.length}</span> Critiques
                        </div>
                    </div>

                    <div class="dashboard-card" style="text-align: center; border-top: 4px solid var(--color-warning);">
                        <h3 style="font-size: 1rem; color: var(--text-muted); text-transform: uppercase;">Plan d'actions</h3>
                        <div class="big-kpi" style="font-size: 3rem; margin: 10px 0; color: var(--text-main);">${actionsOuvertes}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${actionsEnRetard > 0 ? `<span style="color:red; font-weight:bold;">${actionsEnRetard} en retard</span>` : "Toutes dans les délais"}</div>
                    </div>

                </div>

                <div>
                    <h2 style="border-bottom: 1px solid var(--border); padding-bottom: 5px; color: var(--primary);">Arbitrages attendus</h2>
                    <ul style="list-style-type: none; padding-left: 0;">
                        ${risquesTresCritiques.length > 0
                            ? `<li style="margin-bottom: 10px; padding-left: 20px; position: relative;">
                                 <span style="position: absolute; left: 0; color: var(--color-danger); font-weight: bold;">&#9642;</span>
                                 <strong>Validation immédiate</strong> des budgets ou ressources pour le traitement des risques très critiques (Plans de continuité obligatoires).
                               </li>`
                            : ""}

                        ${risquesCritiques.length > 0
                            ? `<li style="margin-bottom: 10px; padding-left: 20px; position: relative;">
                                 <span style="position: absolute; left: 0; color: var(--color-warning); font-weight: bold;">&#9642;</span>
                                 <strong>Suivi managérial semestriel</strong> des plans d'actions liés aux risques critiques identifiés.
                               </li>`
                            : ""}

                        ${actionsOuvertes > 0
                            ? `<li style="margin-bottom: 10px; padding-left: 20px; position: relative;">
                                 <span style="position: absolute; left: 0; color: var(--color-info); font-weight: bold;">&#9642;</span>
                                 <strong>Soutien opérationnel</strong> pour l'exécution du plan d'actions (${actionsOuvertes} actions ouvertes).
                               </li>`
                            : ""}

                        ${tauxConformite < 100
                            ? `<li style="margin-bottom: 10px; padding-left: 20px; position: relative;">
                                 <span style="position: absolute; left: 0; color: var(--color-info); font-weight: bold;">&#9642;</span>
                                 <strong>Acceptation formelle</strong> des risques liés aux non-conformités restantes sur les exigences applicables.
                               </li>`
                            : `<li style="margin-bottom: 10px; padding-left: 20px; position: relative;">
                                 <span style="position: absolute; left: 0; color: var(--color-success); font-weight: bold;">&#9642;</span>
                                 Maintien en condition de sécurité (Amélioration continue).
                               </li>`}
                    </ul>
                </div>

                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed var(--border); display: flex; justify-content: space-between; color: var(--text-muted); font-size: 0.8rem;">
                    <span>Dedienne Aerospace — Gouvernance & Sécurité de l'Information</span>
                    <span>Document Confidentiel</span>
                </div>

            </section>
        `;
    }

    return { render };
})();