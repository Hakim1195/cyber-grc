// Emplacement : js/modules/risques.js
// Nom du fichier : risques.js

const RisquesModule = (() => {

    /* =========================
       UTILITAIRES DE CALCUL (F x G x M)
    ========================== */
    function getRiskColor(score) {
        if (score < 3) return "var(--color-success)"; // Vert
        if (score < 8) return "var(--color-warning)"; // Jaune/Orange
        return "var(--color-danger)";                 // Rouge
    }

    function getLabel(score) {
        if (score < 3) return "Non critique";
        if (score < 8) return "Critique";
        return "Très critique";
    }

    function evaluerNiveau(score) {
        if (score < 3) return "faible";
        if (score < 8) return "élevé";
        return "critique";
    }

    /* =========================
       LISTE & IMPORT
    ========================== */
    function renderList() {
        const risques = DataStore.getRisques();
        const app = document.getElementById("app");

        const rows = risques.map(r => {
            const scoreRes = r.score_residuel || 0;
            return `
            <tr class="clickable-row" data-id="${r.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${r.id}">
                </td>
                <td><strong>${r.nom || "Sans nom"}</strong></td>
                <td>
                    <span class="status" style="background: ${getRiskColor(scoreRes)}; color: white;">
                        ${getLabel(scoreRes)}
                    </span>
                </td>
                <td><span class="badge" style="background: #eee; color: #333;">Brut: ${r.score_brut || "-"}</span></td>
                <td><span class="badge" style="background: #e3f2fd; color: #0d47a1; font-weight: bold;">Résiduel: ${scoreRes.toFixed(2)}</span></td>
                <td>${r.description ? String(r.description).substring(0, 50) + "..." : "-"}</td>
            </tr>
        `}).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>⚠️ Registre des Risques (Méthode FxGxM)</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (SI global)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">🗑️ Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <input type="file" id="importRisqueInput" accept=".xlsx, .xls, .csv" style="display: none;" />
                        <button id="importRisqueBtn" style="background-color: var(--color-success);">📥 Importer Analyse</button>
                        <button id="addRisqueBtn">➕ Déclarer un risque</button>
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Nom du risque</th>
                            <th>Niveau Résiduel</th>
                            <th>Score Brut</th>
                            <th>Score Résiduel</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='6' style='text-align:center;'>Aucun risque identifié.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addRisqueBtn").onclick = renderCreate;

        // Gestion de l'import Excel
        const importInput = document.getElementById("importRisqueInput");
        const importBtn = document.getElementById("importRisqueBtn");

        if (importBtn && importInput) {
            importBtn.onclick = () => importInput.click();
            importInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (typeof ImportExcelService !== "undefined") {
                    ImportExcelService.importRisques(file, (imported, skipped) => {
                        let msg = `✅ ${imported} risque(s) importé(s) et évalué(s) (F x G x M).`;
                        if (skipped > 0) msg += ` (${skipped} doublons ignorés).`;
                        alert(msg);
                        Router.navigateTo("/risques");
                    });
                }
                importInput.value = "";
            };
        }

        // Logique de sélection multiple
        const selectAllCb = document.getElementById("selectAllCb");
        const rowCbs = document.querySelectorAll(".row-cb");
        const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
        const selectedCountSpan = document.getElementById("selectedCount");

        function updateBulkDeleteUI() {
            const checkedCount = document.querySelectorAll(".row-cb:checked").length;
            if (checkedCount > 0) {
                bulkDeleteBtn.style.display = "inline-block";
                selectedCountSpan.textContent = checkedCount;
            } else {
                bulkDeleteBtn.style.display = "none";
            }
            if (selectAllCb) selectAllCb.checked = checkedCount === rowCbs.length && rowCbs.length > 0;
        }

        if (selectAllCb) {
            selectAllCb.addEventListener("change", (e) => {
                rowCbs.forEach(cb => cb.checked = e.target.checked);
                updateBulkDeleteUI();
            });
        }

        rowCbs.forEach(cb => {
            cb.addEventListener("change", updateBulkDeleteUI);
        });

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener("click", () => {
                const checkedIds = Array.from(document.querySelectorAll(".row-cb:checked")).map(cb => cb.dataset.id);
                if (confirm(`⚠️ Confirmer la suppression définitive de ${checkedIds.length} risque(s) ?`)) {
                    checkedIds.forEach(id => DataStore.deleteRisque(id));
                    if (window.showToast) window.showToast(`${checkedIds.length} risque(s) supprimé(s).`, "success");
                    renderList(); // Recharger la vue
                }
            });
        }

        // Redirection au clic sur la ligne (sauf checkbox)
        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/risques/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouveau scénario de risque</h1>
                
                <div class="synthese-message info" style="margin-bottom: 20px; font-size: 0.9rem;">
                    <strong>📘 Guide de cotation EBIOS (F x G x M) :</strong><br>
                    <ul style="margin-top: 5px; padding-left: 20px; margin-bottom: 0;">
                        <li><strong>Score Brut</strong> = Fréquence (1 à 4) × Gravité (1 à 4). <em>C'est le risque inhérent (impact théorique).</em></li>
                        <li><strong>Score Résiduel</strong> = Score Brut × Niveau de maîtrise. <em>C'est le risque réel après application de vos mesures.</em></li>
                        <li><strong>Niveaux de maîtrise :</strong> 0.05 (Excellent) / 0.3 (Bon) / 0.7 (Faible) / 1 (Inexistant).</li>
                    </ul>
                </div>

                <div class="dashboard-card" style="max-width: 800px;">
                    <div class="form-group"><label>Nom du risque <span style="color:red">*</span></label><input id="nom" required /></div>
                    
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div class="form-group">
                            <label>Fréquence (F)</label>
                            <select id="f">
                                <option value="1">1 - Rare/improbable</option>
                                <option value="2">2 - Peu fréquent</option>
                                <option value="3">3 - Fréquent</option>
                                <option value="4">4 - Très fréquent</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Gravité (G)</label>
                            <select id="g">
                                <option value="1">1 - Très faible</option>
                                <option value="2">2 - Modéré</option>
                                <option value="3">3 - Grave</option>
                                <option value="4">4 - Très grave</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Niveau de maîtrise (M)</label>
                            <select id="m">
                                <option value="0.05">0.05 - Globalement maîtrisé</option>
                                <option value="0.3">0.30 - Assez maîtrisé</option>
                                <option value="0.7">0.70 - Peu maîtrisé</option>
                                <option value="1">1.00 - Pas maîtrisé</option>
                            </select>
                        </div>
                    </div>

                    <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid var(--border);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 5px;">Aperçu du calcul :</div>
                        <div id="calc-preview" style="font-size: 1.1rem;">
                            Score Brut: <strong>1</strong> | Score Résiduel: <strong style="color: var(--color-success);">0.05 (Non critique)</strong>
                        </div>
                    </div>

                    <div class="form-group"><label>Description / Détails</label><textarea id="description"></textarea></div>
                    
                    <div style="margin-top: 20px;">
                        <button id="save">💾 Créer le risque</button>
                        <button id="cancel" style="margin-left: 10px;">❌ Annuler</button>
                    </div>
                </div>
            </section>
        `;

        const updatePreview = () => {
            const f = parseInt(document.getElementById("f").value) || 1;
            const g = parseInt(document.getElementById("g").value) || 1;
            const m = parseFloat(document.getElementById("m").value) || 1;
            const sBrut = f * g;
            const sRes = sBrut * m;
            document.getElementById("calc-preview").innerHTML = `
                Score Brut: <strong>${sBrut}</strong> | Score Résiduel: <strong style="color: ${getRiskColor(sRes)};">${sRes.toFixed(2)} (${getLabel(sRes)})</strong>
            `;
        };

        ["f", "g", "m"].forEach(id => document.getElementById(id).addEventListener("change", updatePreview));

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom du risque est obligatoire.");

            const f = parseInt(document.getElementById("f").value);
            const g = parseInt(document.getElementById("g").value);
            const m = parseFloat(document.getElementById("m").value);
            const scoreBrut = f * g;
            const scoreResiduel = scoreBrut * m;

            DataStore.addRisque({
                id: "RISK-" + Date.now(),
                nom: nom,
                f_frequence: f,
                g_gravite: g,
                m_maitrise: m,
                score_brut: scoreBrut,
                score_residuel: scoreResiduel,
                niveau: evaluerNiveau(scoreResiduel),
                description: document.getElementById("description").value.trim(),
                exigences_liees: []
            });
            Router.navigateTo("/risques");
        };

        document.getElementById("cancel").onclick = () => Router.navigateTo("/risques");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const risque = DataStore.getRisqueById(id);
        const toutesExigences = DataStore.getExigences();
        const actions = DataStore.getActionsByRisque(id);
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        if (!risque) return;

        // Rétrocompatibilité si anciennes données sans F, G, M
        const currentF = risque.f_frequence || 1;
        const currentG = risque.g_gravite || 1;
        const currentM = risque.m_maitrise || 1;
        const currentRes = risque.score_residuel || (currentF * currentG * currentM);

        risque.exigences_liees = Array.isArray(risque.exigences_liees) ? risque.exigences_liees : [];

        const exigencesHtml = toutesExigences.map(e => {
            const clientNom = e.client_id ? (clients.find(c => c.id === e.client_id)?.nom || "Client") : "Interne";
            return `
            <label class="checkbox-line" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <input type="checkbox" class="exigence-cb" value="${e.id}" ${risque.exigences_liees.includes(e.id) ? "checked" : ""}>
                    <strong>${e.code}</strong> — ${e.intitule.substring(0, 40)}...
                </div>
                <span class="badge" style="font-size: 0.7rem; background: #eee; color: #666;">${clientNom}</span>
            </label>
        `}).join("");

        const actionsHtml = actions.map(a => `
            <li class="clickable-action" data-id="${a.id}" style="padding: 8px; background: #f9f9f9; border-radius: 4px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid var(--accent);">
                <strong>${a.titre}</strong> — Statut: <em>${a.statut}</em>
            </li>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${risque.nom}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">🗑️ Supprimer</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card" style="grid-column: span 2;">
                        <h3>Évaluation du risque (F x G x M)</h3>
                        
                        <div class="synthese-message info" style="margin-bottom: 20px; font-size: 0.9rem;">
                            <strong>📘 Rappel de cotation :</strong> Brut = (F × G). Résiduel = Brut × M.<br>
                            <em>Maîtrise (M) : 0.05 (Excellent) / 0.3 (Bon) / 0.7 (Faible) / 1 (Inexistant).</em>
                        </div>

                        <div class="form-group"><label>Nom <span style="color:red">*</span></label><input id="nom" value="${risque.nom}" required /></div>
                        
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                            <div class="form-group">
                                <label>Fréquence (F)</label>
                                <select id="f">
                                    <option value="1" ${currentF == 1 ? "selected" : ""}>1 - Rare/improbable</option>
                                    <option value="2" ${currentF == 2 ? "selected" : ""}>2 - Peu fréquent</option>
                                    <option value="3" ${currentF == 3 ? "selected" : ""}>3 - Fréquent</option>
                                    <option value="4" ${currentF == 4 ? "selected" : ""}>4 - Très fréquent</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Gravité (G)</label>
                                <select id="g">
                                    <option value="1" ${currentG == 1 ? "selected" : ""}>1 - Très faible</option>
                                    <option value="2" ${currentG == 2 ? "selected" : ""}>2 - Modéré</option>
                                    <option value="3" ${currentG == 3 ? "selected" : ""}>3 - Grave</option>
                                    <option value="4" ${currentG == 4 ? "selected" : ""}>4 - Très grave</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Niveau de maîtrise (M)</label>
                                <select id="m">
                                    <option value="0.05" ${currentM == 0.05 ? "selected" : ""}>0.05 - Globalement maîtrisé</option>
                                    <option value="0.3" ${currentM == 0.3 ? "selected" : ""}>0.30 - Assez maîtrisé</option>
                                    <option value="0.7" ${currentM == 0.7 ? "selected" : ""}>0.70 - Peu maîtrisé</option>
                                    <option value="1" ${currentM == 1 ? "selected" : ""}>1.00 - Pas maîtrisé</option>
                                </select>
                            </div>
                        </div>

                        <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid var(--border);">
                            <div id="calc-preview" style="font-size: 1.1rem;">
                                Score Brut: <strong>${currentF * currentG}</strong> | Score Résiduel: <strong style="color: ${getRiskColor(currentRes)};">${currentRes.toFixed(2)} (${getLabel(currentRes)})</strong>
                            </div>
                        </div>
                        
                        <div class="form-group"><label>Description</label><textarea id="description">${risque.description || ""}</textarea></div>
                        <button id="saveBtn">💾 Mettre à jour</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="dashboard-card">
                            <h3>Plan de traitement (Actions)</h3>
                            <ul style="margin-bottom: 15px;">${actionsHtml || "<li><span style='color: var(--text-muted);'>Aucune action</span></li>"}</ul>
                            <button id="addActionBtn" style="font-size: 0.85rem;">➕ Planifier une action interne</button>
                        </div>
                        <div class="dashboard-card">
                            <h3>Exigences applicables (Mitigation)</h3>
                            <div class="checkbox-group" style="max-height: 250px; overflow-y: auto;">
                                ${exigencesHtml || "<p style='color: var(--text-muted);'>Aucune exigence disponible.</p>"}
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;

        const updatePreview = () => {
            const f = parseInt(document.getElementById("f").value) || 1;
            const g = parseInt(document.getElementById("g").value) || 1;
            const m = parseFloat(document.getElementById("m").value) || 1;
            const sBrut = f * g;
            const sRes = sBrut * m;
            document.getElementById("calc-preview").innerHTML = `
                Score Brut: <strong>${sBrut}</strong> | Score Résiduel: <strong style="color: ${getRiskColor(sRes)};">${sRes.toFixed(2)} (${getLabel(sRes)})</strong>
            `;
        };

        ["f", "g", "m"].forEach(id => document.getElementById(id).addEventListener("change", updatePreview));

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            const f = parseInt(document.getElementById("f").value);
            const g = parseInt(document.getElementById("g").value);
            const m = parseFloat(document.getElementById("m").value);
            const scoreBrut = f * g;
            const scoreResiduel = scoreBrut * m;

            risque.nom = nom;
            risque.f_frequence = f;
            risque.g_gravite = g;
            risque.m_maitrise = m;
            risque.score_brut = scoreBrut;
            risque.score_residuel = scoreResiduel;
            risque.niveau = evaluerNiveau(scoreResiduel);
            risque.description = document.getElementById("description").value.trim();
            risque.exigences_liees = Array.from(document.querySelectorAll(".exigence-cb:checked")).map(cb => cb.value);

            DataStore.updateRisque(risque);
            if(window.showToast) window.showToast("Risque mis à jour.", "success");
            Router.navigateTo("/risques");
        };

        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("⚠️ Confirmer la suppression ?")) {
                DataStore.deleteRisque(risque.id);
                Router.navigateTo("/risques");
            }
        };

        document.getElementById("addActionBtn").onclick = () => renderCreateAction(risque);
        document.querySelectorAll(".clickable-action").forEach(li => li.onclick = () => Router.navigateTo(`/actions/${li.dataset.id}`));
    }

    /* =========================
       CRÉATION ACTION
    ========================== */
    function renderCreateAction(risque) {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouvelle action de remédiation</h1>
                <div class="synthese-message warning" style="margin-bottom: 20px; padding: 10px;">
                    <strong>Pour traiter le risque :</strong> ${risque.nom}
                </div>
                <div class="dashboard-card">
                    <div class="form-group"><label>Titre <span style="color:red">*</span></label><input id="titre" required /></div>
                    <div class="form-group"><label>Responsable</label><input id="responsable" /></div>
                    <div class="form-group"><label>Échéance</label><input type="date" id="echeance" /></div>
                    <div class="form-group"><label>Commentaire</label><textarea id="commentaire"></textarea></div>
                    <div style="margin-top: 20px;">
                        <button id="saveAction">💾 Créer l'action</button>
                        <button id="cancelAction" style="margin-left: 10px;">❌ Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveAction").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert("Le titre est obligatoire.");

            DataStore.addAction({
                id: "ACT-" + Date.now(),
                titre: titre,
                statut: "à faire",
                responsable: document.getElementById("responsable").value.trim(),
                echeance: document.getElementById("echeance").value,
                commentaire: document.getElementById("commentaire").value.trim(),
                exigence_id: null,
                risque_id: risque.id
            });
            Router.navigateTo(`/risques/${risque.id}`);
        };
        
        document.getElementById("cancelAction").onclick = () => Router.navigateTo(`/risques/${risque.id}`);
    }

    return { renderList, renderCreate, renderDetail };
})();