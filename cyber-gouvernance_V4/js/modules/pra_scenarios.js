// Emplacement : js/modules/pra_scenarios.js
// Nom du fichier : pra_scenarios.js

const PraScenariosModule = (() => {

    // Variable temporaire pour stocker le scénario en cours d'édition
    let editingScenario = null;

    /* =========================
       LISTE DES SCÉNARIOS
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const scenarios = DataStore.getScenariosPra();

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Scénarios PCA/PRA</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Plans de continuité et de reprise technique</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="addBtn" style="background-color: var(--primary);">Nouveau Scénario</button>
                    </div>
                </div>

                <div class="dashboard-grid">
                    ${scenarios.map(s => {
                        const totalMins = (s.etapes_pra || []).reduce((acc, st) => acc + (parseInt(st.duree) || 0), 0);
                        const rtoAffiche = totalMins > 0 ? `${Math.floor(totalMins/60)}h ${totalMins%60}m` : "Non estimé";

                        return `
                        <div class="dashboard-card clickable-row" data-id="${s.id}" style="cursor:pointer; border-left: 4px solid var(--primary);">
                            <h3>${s.nom}</h3>
                            <p style="font-size:0.85rem; color:var(--text-muted); margin: 10px 0;">${s.description || 'Pas de description'}</p>
                            <div style="font-size:0.8rem; background:#f8f9fa; padding:10px; border-radius:4px;">
                                <div style="margin-bottom:5px;"><strong>PCA :</strong> ${s.etapes_pca?.length || 0} étapes</div>
                                <div><strong>PRA :</strong> ${s.etapes_pra?.length || 0} étapes
                                <span style="float:right; color:var(--primary); font-weight:bold;">${rtoAffiche}</span></div>
                            </div>
                        </div>
                        `;
                    }).join("") || "<p style='grid-column: 1/-1; text-align:center;'>Aucun scénario enregistré.</p>"}
                </div>
            </section>
        `;

        // Style enrichi pour la matrice RACI (Inspiration Monday.com) et correction d'impression
        if (!document.getElementById("pra-raci-style")) {
            const style = document.createElement("style");
            style.id = "pra-raci-style";
            style.innerHTML = `
                .raci-cell { text-align: center; vertical-align: middle; }
                .raci-badge {
                    display: inline-block;
                    width: 28px; height: 28px; line-height: 28px;
                    border-radius: 4px; color: white; font-weight: bold;
                    font-size: 0.8rem; text-align: center;
                }
                .raci-r { background-color: #0073ea; } /* Blue Monday */
                .raci-a { background-color: #784bd1; } /* Purple Monday */
                .raci-c { background-color: #ffcb00; color: #333; } /* Yellow Monday */
                .raci-i { background-color: #00ca72; } /* Green Monday */

                .raci-table { width: 100%; border-collapse: separate; border-spacing: 0 4px; }
                .raci-table th { padding: 12px; text-transform: uppercase; font-size: 0.75rem; color: #676879; letter-spacing: 1px; border-bottom: 2px solid #e6e9ef; }
                .raci-table td { padding: 12px; background: white; border-bottom: 1px solid #e6e9ef; }
                .raci-table tr:hover td { background: #f5f6f8; }

                @media print {
                    /* Masquer les éléments perturbateurs */
                    body.printing-raci .sidebar,
                    body.printing-raci #toast-container { display: none !important; }

                    /* Masquer tout dans la page sauf la modale RACI */
                    body.printing-raci .page > *:not(#raci-modal) { display: none !important; }

                    /* Réinitialiser les marges pour l'impression pleine page */
                    body.printing-raci .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
                    body.printing-raci .page { margin: 0 !important; padding: 0 !important; }

                    /* Afficher la modale proprement */
                    #raci-modal { position: relative !important; display: block !important; padding: 0 !important; overflow: visible !important; height: auto !important; background: white !important; }

                    /* Forcer l'impression des couleurs de fond (badges) */
                    .raci-badge, .raci-table th, .raci-table td { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `;
            document.head.appendChild(style);
        }

        document.getElementById("addBtn").onclick = () => renderDetail(null);
        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/pra/${row.dataset.id}`);
        });
    }

    /* =========================
       ÉDITEUR DE SCÉNARIO
    ========================== */
    function renderDetail(id) {
        const app = document.getElementById("app");
        const isEdit = !!id;

        if (isEdit) {
            const original = DataStore.getScenarioPraById(id);
            if (!original) return Router.navigateTo("/pra");
            editingScenario = JSON.parse(JSON.stringify(original));
        } else {
            editingScenario = { id: "SCEN-" + Date.now(), nom: "", description: "", etapes_pca: [], etapes_pra: [] };
        }

        editingScenario.etapes_pca = normalizeSteps(editingScenario.etapes_pca);
        editingScenario.etapes_pra = normalizeSteps(editingScenario.etapes_pra);

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <h1>${isEdit ? "Édition du Scénario" : "Nouveau Scénario"}</h1>
                    <div style="display:flex; gap:10px;">
                        ${isEdit ? `<button id="showRaciBtn" style="background:#784bd1;">Matrice RACI</button>` : ""}
                        ${isEdit ? `<button id="delScenarioBtn" style="background:var(--color-danger);">Supprimer</button>` : ""}
                    </div>
                </div>

                <div class="dashboard-card no-print" style="margin-bottom: 20px;">
                    <div class="form-group">
                        <label>Nom du Scénario <span style="color:red">*</span></label>
                        <input id="scen-nom" value="${editingScenario.nom}" placeholder="Ex: Ransomware, Incendie..." required />
                    </div>
                    <div class="form-group">
                        <label>Description / Déclencheur</label>
                        <textarea id="scen-desc" style="min-height:60px;">${editingScenario.description || ""}</textarea>
                    </div>
                </div>

                <div class="dashboard-grid no-print">
                    <div class="dashboard-card" style="border-top:4px solid var(--color-success);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <h3 style="margin:0; color:var(--color-success);">Continuité (PCA)</h3>
                            <button id="addStepPca" style="background:var(--color-success); font-size:0.8rem; padding:5px 10px;">Étape</button>
                        </div>
                        <div id="pca-list-container"></div>
                    </div>

                    <div class="dashboard-card" style="border-top:4px solid var(--color-info);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <h3 style="margin:0; color:var(--color-info);">Reprise (PRA)</h3>
                            <button id="addStepPra" style="background:var(--color-info); font-size:0.8rem; padding:5px 10px;">Étape</button>
                        </div>
                        <div id="rto-banner" style="background:white; padding:10px; border-radius:4px; margin-bottom:15px; text-align:center; font-weight:bold; border: 1px dashed var(--color-info); color:var(--color-info);">
                            RTO Estimé : <span id="rto-total">0h 0min</span>
                        </div>
                        <div id="pra-list-container"></div>
                    </div>
                </div>

                <div class="no-print" style="margin-top: 30px; text-align: right; background: white; padding: 15px; border-radius: 8px;">
                    <button id="cancelBtn" style="background:var(--color-gray); color:white; padding:10px 15px;">Annuler</button>
                    <button id="saveScenarioBtn" style="padding: 10px 20px; background:var(--color-success); margin-left:10px;">Enregistrer le Scénario</button>
                </div>

                <div id="step-modal" class="no-print" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
                    <div class="dashboard-card" style="width:650px; max-width:95vw; border-top: 5px solid var(--accent); position:relative; max-height: 90vh; overflow-y: auto;">
                        <h2 id="modal-title" style="margin-bottom:20px;">Édition de l'étape</h2>
                        <div id="modal-body"></div>
                        <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid var(--border); padding-top:15px;">
                            <button id="closeModalBtn" style="background:var(--color-gray);">Fermer</button>
                            <button id="saveStepBtn" style="background:var(--accent);">Valider l'étape</button>
                        </div>
                    </div>
                </div>

                <div id="raci-modal" class="raci-modal-container" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:white; z-index:2000; overflow-y:auto; padding:40px;">
                    <div class="no-print" style="display:flex; justify-content:space-between; margin-bottom:30px; max-width: 1300px; margin: 0 auto 30px auto; border-bottom: 2px solid #e6e9ef; padding-bottom: 15px;">
                        <button id="closeRaciBtn" style="background:#676879; padding:10px 20px; font-size:1rem;">Retour au Scénario</button>
                        <button onclick="window.print()" style="background:#0073ea; padding:10px 20px; font-size:1rem;">Imprimer la Matrice RACI</button>
                    </div>
                    <div id="raci-content" style="max-width: 1300px; margin: 0 auto;"></div>
                </div>
            </section>
        `;

        refreshSteps();

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/pra");
        document.getElementById("addStepPca").onclick = () => openStepEditor(null, 'pca');
        document.getElementById("addStepPra").onclick = () => openStepEditor(null, 'pra');
        if (isEdit) document.getElementById("showRaciBtn").onclick = renderRaciMatrix;

        document.getElementById("closeRaciBtn").onclick = () => {
            document.body.classList.remove("printing-raci");
            document.getElementById("raci-modal").style.display = "none";
        };

        document.getElementById("saveScenarioBtn").onclick = () => {
            editingScenario.nom = document.getElementById("scen-nom").value.trim();
            editingScenario.description = document.getElementById("scen-desc").value.trim();
            if (!editingScenario.nom) return alert("Le nom est obligatoire.");

            if (isEdit) DataStore.updateScenarioPra(editingScenario);
            else DataStore.addScenarioPra(editingScenario);

            window.showToast("Scénario sauvegardé.");
            Router.navigateTo("/pra");
        };

        if (isEdit) {
            document.getElementById("delScenarioBtn").onclick = () => {
                if (confirm("Supprimer définitivement ce scénario ?")) {
                    DataStore.deleteScenarioPra(editingScenario.id);
                    Router.navigateTo("/pra");
                }
            };
        }
    }

    /* =========================
       LOGIQUE MATRICE RACI
    ========================== */
    function renderRaciMatrix() {
        document.body.classList.add("printing-raci");
        const raciModal = document.getElementById("raci-modal");
        const raciContent = document.getElementById("raci-content");

        const renderRaciCells = (s) => `
            <td class="raci-cell">${s.realisateur ? '<span class="raci-badge raci-r" title="Réalisateur">R</span><br><small>'+s.realisateur+'</small>' : '-'}</td>
            <td class="raci-cell">${s.responsable ? '<span class="raci-badge raci-a" title="Approbateur">A</span><br><small>'+s.responsable+'</small>' : '-'}</td>
            <td class="raci-cell">${s.consulte ? '<span class="raci-badge raci-c" title="Consulté">C</span><br><small>'+s.consulte+'</small>' : '-'}</td>
            <td class="raci-cell">${s.informe ? '<span class="raci-badge raci-i" title="Informé">I</span><br><small>'+s.informe+'</small>' : '-'}</td>
        `;

        const pcaRows = editingScenario.etapes_pca.map(s => `
            <tr>
                <td><span class="badge" style="background:#e8f5e9; color:#2e7d32;">PCA</span> <strong>${s.titre}</strong></td>
                ${renderRaciCells(s)}
            </tr>
        `).join("");

        const praRows = editingScenario.etapes_pra.map(s => `
            <tr>
                <td><span class="badge" style="background:#e3f2fd; color:#1565c0;">PRA</span> <strong>${s.titre}</strong></td>
                ${renderRaciCells(s)}
            </tr>
        `).join("");

        raciContent.innerHTML = `
            <div style="text-align:left; margin-bottom: 40px; border-left: 5px solid #784bd1; padding-left: 20px;">
                <h1 style="font-size:2.5rem; margin-bottom:5px; color:#333;">Matrice des Responsabilités (RACI)</h1>
                <p style="font-size:1.1rem; color:#676879;">Scénario : <strong>${editingScenario.nom}</strong></p>
            </div>

            <table class="raci-table">
                <thead>
                    <tr>
                        <th style="text-align:left;">Action / Étape du Scénario</th>
                        <th style="width:15%;">Réalisateur</th>
                        <th style="width:15%;">Approbateur</th>
                        <th style="width:15%;">Consulté</th>
                        <th style="width:15%;">Informé</th>
                    </tr>
                </thead>
                <tbody>
                    ${pcaRows}
                    ${praRows}
                    ${(editingScenario.etapes_pca.length === 0 && editingScenario.etapes_pra.length === 0) ? "<tr><td colspan='5' style='text-align:center; padding:40px;'>Aucune étape configurée pour ce scénario.</td></tr>" : ""}
                </tbody>
            </table>
        `;

        raciModal.style.display = "block";
    }

    /* =========================
       LOGIQUE DES ÉTAPES (INNER)
    ========================== */
    function normalizeSteps(stepsArray) {
        if (!stepsArray || stepsArray.length === 0) return [];
        if (typeof stepsArray[0] === 'string') {
            return stepsArray.map(txt => ({ titre: txt, realisateur: "", responsable: "", consulte: "", informe: "", duree: 0, statut: "À faire", actifs: "" }));
        }
        return stepsArray;
    }

    function refreshSteps() {
        const pcaCont = document.getElementById("pca-list-container");
        const praCont = document.getElementById("pra-list-container");

        const renderItems = (steps, type) => {
            return steps.map((s, idx) => `
                <div class="step-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px; border:1px solid #eee; margin-bottom:8px; border-radius:4px; background:#fff; cursor:pointer;" onclick="PraScenariosModule.openStepEditor(${idx}, '${type}')">
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:0.95rem;">${s.titre || 'Nouvelle étape'}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">R: ${s.realisateur || '-'} | A: ${s.responsable || '-'} | ${s.duree || 0} min</div>
                    </div>
                    <div style="display:flex; gap:12px; align-items:center;">
                         <span class="status" style="font-size:0.7rem; padding:3px 8px; background:#f1f3f5;">${s.statut}</span>
                         <button style="background:none; color:var(--color-danger); border:none; font-size:1.1rem; padding:5px;" onclick="event.stopPropagation(); PraScenariosModule.deleteStep(${idx}, '${type}')"></button>
                    </div>
                </div>
            `).join("") || `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:15px; background:#f9f9f9;">Aucune étape.</p>`;
        };

        pcaCont.innerHTML = renderItems(editingScenario.etapes_pca, 'pca');
        praCont.innerHTML = renderItems(editingScenario.etapes_pra, 'pra');

        let totalMins = 0;
        editingScenario.etapes_pra.forEach(st => totalMins += (parseInt(st.duree) || 0));
        document.getElementById("rto-total").textContent = `${Math.floor(totalMins/60)}h ${totalMins%60}min`;
    }

    function openStepEditor(index, type) {
        const isNew = index === null;
        let step = isNew
            ? { titre: "", realisateur: "", responsable: "", consulte: "", informe: "", actifs: "", duree: 0, statut: "À faire" }
            : (type === 'pca' ? editingScenario.etapes_pca[index] : editingScenario.etapes_pra[index]);

        const modal = document.getElementById("step-modal");
        const modalBody = document.getElementById("modal-body");
        document.getElementById("modal-title").innerText = isNew ? "Ajouter une étape" : "Édition de l'étape";

        modalBody.innerHTML = `
            <div class="form-group"><label>Action / Titre <span style="color:red">*</span></label><input id="m-titre" value="${(step.titre||'').replace(/"/g, '&quot;')}" required /></div>

            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 15px;">
                <h4 style="margin-top:0; margin-bottom: 15px; color: #784bd1;">Matrice RACI</h4>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group" style="margin-bottom:0;"><label><span class="raci-badge raci-r" style="width:18px;height:18px;line-height:18px;font-size:0.6rem;margin-right:5px;">R</span> Réalisateur</label><input id="m-real" value="${(step.realisateur||'').replace(/"/g, '&quot;')}" /></div>
                    <div class="form-group" style="margin-bottom:0;"><label><span class="raci-badge raci-a" style="width:18px;height:18px;line-height:18px;font-size:0.6rem;margin-right:5px;">A</span> Approbateur</label><input id="m-resp" value="${(step.responsable||'').replace(/"/g, '&quot;')}" /></div>
                    <div class="form-group" style="margin-bottom:0;"><label><span class="raci-badge raci-c" style="width:18px;height:18px;line-height:18px;font-size:0.6rem;margin-right:5px;color:#333;">C</span> Consulté</label><input id="m-consulte" value="${(step.consulte||'').replace(/"/g, '&quot;')}" /></div>
                    <div class="form-group" style="margin-bottom:0;"><label><span class="raci-badge raci-i" style="width:18px;height:18px;line-height:18px;font-size:0.6rem;margin-right:5px;">I</span> Informé</label><input id="m-informe" value="${(step.informe||'').replace(/"/g, '&quot;')}" /></div>
                </div>
            </div>

            <div class="form-group"><label>Actifs impactés</label><input id="m-actifs" value="${(step.actifs||'').replace(/"/g, '&quot;')}" /></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Durée (min)</label><input type="number" id="m-duree" value="${step.duree}" min="0" /></div>
                <div class="form-group">
                    <label>Statut</label>
                    <select id="m-statut">
                        <option value="À faire" ${step.statut === 'À faire' ? 'selected' : ''}>À faire</option>
                        <option value="En cours" ${step.statut === 'En cours' ? 'selected' : ''}>En cours</option>
                        <option value="Terminé" ${step.statut === 'Terminé' ? 'selected' : ''}>Terminé</option>
                    </select>
                </div>
            </div>
        `;

        modal.style.display = "flex";

        document.getElementById("closeModalBtn").onclick = () => modal.style.display = "none";
        document.getElementById("saveStepBtn").onclick = () => {
            const titreVal = document.getElementById("m-titre").value.trim();
            if (!titreVal) return alert("Le titre est obligatoire.");

            const updatedStep = {
                titre: titreVal,
                realisateur: document.getElementById("m-real").value.trim(),
                responsable: document.getElementById("m-resp").value.trim(),
                consulte: document.getElementById("m-consulte").value.trim(),
                informe: document.getElementById("m-informe").value.trim(),
                actifs: document.getElementById("m-actifs").value.trim(),
                duree: parseInt(document.getElementById("m-duree").value) || 0,
                statut: document.getElementById("m-statut").value
            };

            if (isNew) {
                if (type === 'pca') editingScenario.etapes_pca.push(updatedStep);
                else editingScenario.etapes_pra.push(updatedStep);
            } else {
                if (type === 'pca') editingScenario.etapes_pca[index] = updatedStep;
                else editingScenario.etapes_pra[index] = updatedStep;
            }

            modal.style.display = "none";
            refreshSteps();
        };
    }

    function deleteStep(index, type) {
        if (confirm("Supprimer cette étape ?")) {
            if (type === 'pca') editingScenario.etapes_pca.splice(index, 1);
            else editingScenario.etapes_pra.splice(index, 1);
            refreshSteps();
        }
    }

    return { renderList, renderDetail, openStepEditor, deleteStep };
})();