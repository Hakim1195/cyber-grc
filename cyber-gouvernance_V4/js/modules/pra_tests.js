// Emplacement : js/modules/pra_tests.js
// Nom du fichier : pra_tests.js

const PraTestsModule = (() => {

    /* =========================
       LISTE DES TESTS PRA
    ========================== */
    function renderList() {
        const tests = DataStore.getTestsPra();
        const scenarios = DataStore.getScenariosPra();
        const app = document.getElementById("app");

        // Détection des orphelins : test dont le scénario n'existe plus.
        const scenIds = new Set(scenarios.map(s => s.id));
        const isOrphan = (t) => !scenIds.has(t.scenario_id);
        const orphans = tests.filter(isOrphan);

        // Utilitaire pour récupérer le nom du scénario
        const getNomScen = (id) => {
            const s = scenarios.find(x => x.id === id);
            return s ? s.nom : "Scénario inconnu/supprimé";
        };

        const rows = tests.map(t => `
            <tr class="clickable-row" data-id="${t.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${t.id}">
                </td>
                <td>${t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "Non définie"}</td>
                <td><strong>${escapeHtml(getNomScen(t.scenario_id))}</strong>${isOrphan(t) ? ` <span class="badge" style="background:var(--color-warning); color:#fff;" title="Le scénario lié n'existe plus">Orphelin</span>` : ""}</td>
                <td>${escapeHtml(t.type_test)}</td>
                <td><span class="status ${t.succes === 'Oui' ? 'status-conforme' : 'status-non-conforme'}">${t.succes === 'Oui' ? 'Succès' : 'Échec'}</span></td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Historique des Tests</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Suivi des exercices et entraînements de crise</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button id="addBtn" style="background-color: var(--primary);">Historiser un Test</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size:0.9rem; padding:10px;">
                    <strong>Amélioration continue :</strong> Un PRA qui n'est pas testé régulièrement est un PRA qui ne fonctionnera pas le jour J. Historisez ici vos exercices sur table ou vos simulations techniques réelles.
                </div>

                ${orphans.length ? `
                <div class="synthese-message warning no-print" role="alert" style="font-size:0.9rem; padding:12px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                    <span><strong>${orphans.length} test(s) orphelin(s)</strong> — le scénario associé a été supprimé. Ces enregistrements ne sont plus rattachés à un playbook.</span>
                    <button id="cleanOrphansBtn" style="background:var(--color-warning); white-space:nowrap;">Supprimer les tests orphelins</button>
                </div>` : ""}

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Date de l'exercice</th>
                            <th>Playbook testé</th>
                            <th>Type de test</th>
                            <th>Résultat</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='5' style='text-align:center;'>Aucun historique de test enregistré.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addBtn").onclick = renderCreate;

        // Nettoyage des tests orphelins (scénario supprimé)
        const cleanOrphansBtn = document.getElementById("cleanOrphansBtn");
        if (cleanOrphansBtn) {
            cleanOrphansBtn.onclick = () => {
                if (confirm(`Supprimer définitivement ${orphans.length} test(s) orphelin(s) ?`)) {
                    const removed = DataStore.deleteOrphanTests();
                    if (window.showToast) window.showToast(`${removed} test(s) orphelin(s) supprimé(s).`, "success");
                    renderList();
                }
            };
        }

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteTestPra(id),
            confirm: (n) => `Confirmer la suppression de ${n} test(s) de l'historique ?`,
            toast: (n) => `${n} test(s) supprimé(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/tests/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION D'UN TEST
    ========================== */
    function renderCreate() {
        const scenarios = DataStore.getScenariosPra();
        const app = document.getElementById("app");

        if (scenarios.length === 0) {
            app.innerHTML = `
                <section class="page">
                    <h1>Historiser un Test PRA</h1>
                    <div class="synthese-message warning">
                        Vous devez d'abord créer au moins un "Playbook PCA/PRA" avant de pouvoir historiser un test.
                    </div>
                    <button onclick="Router.navigateTo('/tests')" style="margin-top: 20px;">Retour</button>
                </section>
            `;
            return;
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Nouveau Bilan de Test</h1>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Scénario Testé / Playbook <span style="color:red">*</span></label>
                        <select id="scenario_id">
                            ${scenarios.map(s => `<option value="${s.id}">${escapeHtml(s.nom)}</option>`).join("")}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Date de l'exercice <span style="color:red">*</span></label>
                            <input type="date" id="date" required />
                        </div>
                        <div class="form-group">
                            <label>Résultat global</label>
                            <select id="succes">
                                <option value="Oui">Succès (Objectifs atteints)</option>
                                <option value="Non">Échec (À revoir)</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Type d'exercice ${Help.tip("Nature du test : exercice sur table (revue théorique en réunion), simulation partielle, ou bascule technique réelle. Plus le test est réaliste, plus il valide concrètement le PRA.")}</label>
                        <select id="type_test">
                            <option value="Théorique (Sur table)">Théorique (Sur table / Walkthrough)</option>
                            <option value="Technique (Simulation)">Technique (Simulation partielle)</option>
                            <option value="Technique (Basculement réel)">Technique (Basculement réel complet)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Bilan et Leçons apprises (REX)</label>
                        <textarea id="bilan" placeholder="Ce qui a bien fonctionné, ce qui a bloqué, les durées réelles constatées..." style="min-height:100px;"></textarea>
                    </div>
                    <div style="margin-top: 20px;">
                        <button id="saveBtn" style="background:var(--color-success);">Historiser le Test</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        // Mettre la date du jour par défaut
        document.getElementById("date").valueAsDate = new Date();

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/tests");

        document.getElementById("saveBtn").onclick = () => {
            const dateStr = document.getElementById("date").value;
            if (!dateStr) return alert("La date est obligatoire.");

            DataStore.addTestPra({
                id: UI.genId("TEST"),
                scenario_id: document.getElementById("scenario_id").value,
                date: dateStr,
                succes: document.getElementById("succes").value,
                type_test: document.getElementById("type_test").value,
                bilan: document.getElementById("bilan").value.trim()
            });

            if(window.showToast) window.showToast("Test historisé.", "success");
            Router.navigateTo("/tests");
        };
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const t = DataStore.getTestsPra().find(x => x.id === id);
        const scenarios = DataStore.getScenariosPra();
        if(!t) return Router.navigateTo("/tests");

        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Édition du Bilan</h1>
                    <button id="delBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Scénario Testé / Playbook <span style="color:red">*</span></label>
                        <select id="scenario_id">
                            ${scenarios.map(s => `<option value="${s.id}" ${t.scenario_id === s.id ? "selected" : ""}>${escapeHtml(s.nom)}</option>`).join("")}
                            ${!scenarios.find(s => s.id === t.scenario_id) ? `<option value="${t.scenario_id}" selected>Scénario supprimé (ID: ${t.scenario_id})</option>` : ""}
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Date de l'exercice <span style="color:red">*</span></label>
                            <input type="date" id="date" value="${t.date}" required />
                        </div>
                        <div class="form-group">
                            <label>Résultat global</label>
                            <select id="succes">
                                <option value="Oui" ${t.succes === "Oui" ? "selected" : ""}>Succès (Objectifs atteints)</option>
                                <option value="Non" ${t.succes === "Non" ? "selected" : ""}>Échec (À revoir)</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Type d'exercice ${Help.tip("Nature du test : exercice sur table (revue théorique en réunion), simulation partielle, ou bascule technique réelle. Plus le test est réaliste, plus il valide concrètement le PRA.")}</label>
                        <select id="type_test">
                            <option value="Théorique (Sur table)" ${t.type_test === "Théorique (Sur table)" ? "selected" : ""}>Théorique (Sur table / Walkthrough)</option>
                            <option value="Technique (Simulation)" ${t.type_test === "Technique (Simulation)" ? "selected" : ""}>Technique (Simulation partielle)</option>
                            <option value="Technique (Basculement réel)" ${t.type_test === "Technique (Basculement réel)" ? "selected" : ""}>Technique (Basculement réel complet)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Bilan et Leçons apprises (REX)</label>
                        <textarea id="bilan" style="min-height:100px;">${escapeHtml(t.bilan || "")}</textarea>
                    </div>
                    <div style="margin-top: 20px;">
                        <button id="saveBtn" style="background:var(--color-success);">Mettre à jour</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/tests");

        document.getElementById("saveBtn").onclick = () => {
            const dateStr = document.getElementById("date").value;
            if (!dateStr) return alert("La date est obligatoire.");

            t.scenario_id = document.getElementById("scenario_id").value;
            t.date = dateStr;
            t.succes = document.getElementById("succes").value;
            t.type_test = document.getElementById("type_test").value;
            t.bilan = document.getElementById("bilan").value.trim();

            DataStore.updateTestPra(t);
            if(window.showToast) window.showToast("Bilan de test mis à jour.", "success");
            Router.navigateTo("/tests");
        };

        UI.wireDelete({
            button: "delBtn",
            confirm: "Confirmer la suppression de cet historique de test ?",
            remove: () => DataStore.deleteTestPra(id),
            redirect: "/tests"
        });
    }

    return { renderList, renderDetail };
})();