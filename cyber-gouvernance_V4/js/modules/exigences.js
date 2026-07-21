// Emplacement : js/modules/exigences.js
// Nom du fichier : exigences.js

const ExigencesModule = (() => {

    /* =========================
       LISTE & IMPORT
    ========================== */
    function renderList() {
        const currentClient = localStorage.getItem("cyber-context") || "global";
        const exigences = DataStore.getExigencesByClient(currentClient);
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        let contextName = "Globales et Tous Clients";
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = `Spécifiques à : ${c.nom}`;
        }

        const rows = exigences.map(e => `
            <tr class="clickable-row" data-id="${e.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${e.id}">
                </td>
                <td><strong>${escapeHtml(e.code)}</strong></td>
                <td>${escapeHtml(e.intitule)}</td>
                <td>
                    <span class="status status-${(e.statut_conformite || '').replace(/\s+/g, "-")}">
                        ${escapeHtml(e.statut_conformite)}
                    </span>
                </td>
                <td>${escapeHtml(e.responsable) || "-"}</td>
                ${currentClient === "global" ? `<td style="font-size:0.8rem; color:var(--text-muted);">${e.client_id ? escapeHtml(clients.find(c => c.id === e.client_id)?.nom || "Inconnu") : "Interne"}</td>` : ""}
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Exigences de sécurité</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre affiché : <strong>${contextName}</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <input type="file" id="importExcelInput" accept=".xlsx, .xls, .csv" style="display: none;" />
                        <button id="importBtn" style="background-color: var(--color-success);">Importer Excel</button>
                        <button id="addExigenceBtn" style="background-color: var(--primary);">Saisie Manuelle</button>
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Code</th>
                            <th>Intitulé</th>
                            <th>Statut</th>
                            <th>Responsable</th>
                            ${currentClient === "global" ? `<th>Origine (Client)</th>` : ""}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='6' style='text-align:center;'>Aucune exigence pour ce périmètre.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        const addBtn = document.getElementById("addExigenceBtn");
        if (addBtn) addBtn.onclick = renderCreate;

        const importInput = document.getElementById("importExcelInput");
        const importBtn = document.getElementById("importBtn");

        if (importBtn && importInput) {
            importBtn.onclick = () => importInput.click();

            importInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (window.showToast) window.showToast("Lecture du fichier en cours...", "info");

                if (typeof ImportExcelService !== "undefined") {
                    ImportExcelService.importExigences(file, currentClient, (imported, skipped) => {
                        let msg = `Import terminé : ${imported} ajoutées.`;
                        if (skipped > 0) msg += ` (${skipped} doublons ignorés).`;

                        alert(msg);
                        Router.navigateTo("/exigences");
                    });
                } else {
                    alert("Le service d'importation n'est pas chargé.");
                }
                importInput.value = "";
            };
        }

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteExigence(id),
            confirm: (n) => `Confirmer la suppression de ${n} exigence(s) ? Les actions associées seront également supprimées.`,
            toast: (n) => `${n} exigence(s) supprimée(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/exigences/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION MANUELLE
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        const currentClient = localStorage.getItem("cyber-context") || "global";
        const clients = DataStore.getClients();

        let contextInfo = "Cette exigence sera <strong>globale (Interne)</strong>.";
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextInfo = `Cette exigence sera rattachée au client : <strong>${c.nom}</strong>.`;
        }

        app.innerHTML = `
            <section class="page">
                <h1>Nouvelle exigence</h1>
                <div class="synthese-message info" style="margin-bottom: 20px; padding: 10px;">
                    ${contextInfo}
                </div>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>Code (ex: ISO-A.5.1) <span style="color:red">*</span></label>
                        <input id="code" placeholder="Référence de l'exigence" required />
                    </div>

                    <div class="form-group">
                        <label>Intitulé <span style="color:red">*</span></label>
                        <input id="intitule" placeholder="Description courte de l'exigence" required />
                    </div>

                    <div class="form-group">
                        <label>Statut de conformité ${Help.tip("Niveau de respect de l'exigence : Conforme, Partiellement conforme, Non conforme ou Non applicable. Il alimente le taux de conformité et la déclaration d'applicabilité (SoA).")}</label>
                        <select id="statut">
                            <option value="non conforme">Non conforme</option>
                            <option value="partiellement conforme">Partiellement conforme</option>
                            <option value="conforme">Conforme</option>
                            <option value="non applicable">Non applicable</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Responsable</label>
                        <input id="responsable" list="personnes-list" placeholder="Nom ou fonction" />
                    </div>

                    <div class="form-group">
                        <label>Commentaire / Justification</label>
                        <textarea id="commentaire" placeholder="Détails sur l'état de conformité..."></textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="save">Enregistrer</button>
                        <button id="cancel" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("save").onclick = () => {
            const code = document.getElementById("code").value.trim();
            const intitule = document.getElementById("intitule").value.trim();

            if (!code || !intitule) {
                alert("Veuillez remplir les champs obligatoires (Code et Intitulé).");
                return;
            }

            DataStore.addExigence({
                id: UI.genId("EX"),
                client_id: currentClient === "global" ? null : currentClient,
                code: code,
                intitule: intitule,
                statut_conformite: document.getElementById("statut").value,
                responsable: document.getElementById("responsable").value.trim(),
                commentaire: document.getElementById("commentaire").value.trim()
            });

            if (window.showToast) window.showToast("Exigence créée avec succès.", "success");
            Router.navigateTo("/exigences");
        };

        document.getElementById("cancel").onclick = () => Router.navigateTo("/exigences");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const exigence = DataStore.getExigenceById(id);
        const risques = DataStore.getRisques();
        const actions = DataStore.getActionsByExigence(id);
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        if (!exigence) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Introuvable.</p><button onclick="Router.navigateTo('/exigences')">Retour</button></section>`;
            return;
        }

        const clientAssocie = exigence.client_id ? clients.find(c => c.id === exigence.client_id) : null;
        const clientNom = clientAssocie ? clientAssocie.nom : "Globale (Interne)";

        const risquesHtml = risques.filter(r =>
            Array.isArray(r.exigences_liees) && r.exigences_liees.includes(exigence.id)
        ).map(r => `
            <li class="matrix-risk clickable-risk" data-id="${r.id}" style="margin-bottom: 8px;">
                <strong>${escapeHtml(r.nom)}</strong> — Niveau: <span style="text-transform: capitalize;">${escapeHtml(r.niveau)}</span>
            </li>
        `).join("");

        const actionsHtml = actions.map(a => `
            <li class="clickable-action" data-id="${a.id}" style="padding: 8px; background: #f9f9f9; border-radius: 4px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid var(--accent);">
                <strong>${escapeHtml(a.titre)}</strong> — Statut: <em>${escapeHtml(a.statut)}</em>
            </li>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(exigence.code)}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Origine : <strong>${escapeHtml(clientNom)}</strong></p>
                    </div>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card" style="grid-column: span 2;">
                        <h3>Détails de l'exigence</h3>

                        <div class="form-group">
                            <label>Intitulé <span style="color:red">*</span></label>
                            <input id="intitule" value="${escapeHtml(exigence.intitule)}" required />
                        </div>

                        <div class="form-group">
                            <label>Statut de conformité ${Help.tip("Niveau de respect de l'exigence : Conforme, Partiellement conforme, Non conforme ou Non applicable. Il alimente le taux de conformité et la déclaration d'applicabilité (SoA).")}</label>
                            <select id="statut">
                                <option value="non conforme" ${exigence.statut_conformite === "non conforme" ? "selected" : ""}>Non conforme</option>
                                <option value="partiellement conforme" ${exigence.statut_conformite === "partiellement conforme" ? "selected" : ""}>Partiellement conforme</option>
                                <option value="conforme" ${exigence.statut_conformite === "conforme" ? "selected" : ""}>Conforme</option>
                                <option value="non applicable" ${exigence.statut_conformite === "non applicable" ? "selected" : ""}>Non applicable</option>
                            </select>
                        </div>

                        <div class="form-group"><label>Responsable</label><input id="responsable" list="personnes-list" value="${escapeHtml(exigence.responsable || "")}" /></div>
                        <div class="form-group"><label>Commentaire</label><textarea id="commentaire">${escapeHtml(exigence.commentaire || "")}</textarea></div>
                        <button id="saveBtn">Mettre à jour</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="dashboard-card">
                            <h3>Actions liées</h3>
                            <ul style="margin-bottom: 15px;">${actionsHtml || "<li><span style='color: var(--text-muted);'>Aucune action planifiée</span></li>"}</ul>
                            <button id="addActionBtn" style="font-size: 0.85rem;">Planifier une action</button>
                        </div>

                        <div class="dashboard-card">
                            <h3>Risques liés (Mitigation)</h3>
                            <ul>${risquesHtml || "<li><span style='color: var(--text-muted);'>Aucun risque associé</span></li>"}</ul>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 10px;"><em>L'association se fait depuis la fiche du risque.</em></p>
                        </div>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const intitule = document.getElementById("intitule").value.trim();
            if (!intitule) return alert("L'intitulé est obligatoire.");

            exigence.intitule = intitule;
            exigence.statut_conformite = document.getElementById("statut").value;
            exigence.responsable = document.getElementById("responsable").value.trim();
            exigence.commentaire = document.getElementById("commentaire").value.trim();

            DataStore.updateExigence(exigence);
            if (window.showToast) window.showToast("Exigence mise à jour.", "success");
            Router.navigateTo("/exigences");
        };

        UI.wireDelete({
            confirm: "Êtes-vous sûr de vouloir supprimer cette exigence ? Les actions associées seront également supprimées.",
            remove: () => DataStore.deleteExigence(exigence.id),
            redirect: "/exigences"
        });

        document.getElementById("addActionBtn").onclick = () => renderCreateAction(exigence);
        document.querySelectorAll(".clickable-risk").forEach(li => li.onclick = () => Router.navigateTo(`/risques/${li.dataset.id}`));
        document.querySelectorAll(".clickable-action").forEach(li => li.onclick = () => Router.navigateTo(`/actions/${li.dataset.id}`));
    }

    /* =========================
       CRÉATION ACTION
    ========================== */
    function renderCreateAction(exigence) {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouvelle action</h1>
                <div class="synthese-message info" style="margin-bottom: 20px; padding: 10px;"><strong>Liée à l'exigence :</strong> ${escapeHtml(exigence.code)}</div>
                <div class="dashboard-card">
                    <div class="form-group"><label>Titre de l'action <span style="color:red">*</span></label><input id="titre" required /></div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Priorité</label>
                            <select id="priorite">
                                <option value="Basse">Basse</option>
                                <option value="Moyenne" selected>Moyenne</option>
                                <option value="Haute">Haute</option>
                                <option value="Critique">Critique</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Statut</label>
                            <select id="statut">
                                <option value="à faire" selected>À faire</option>
                                <option value="en cours">En cours</option>
                                <option value="terminée">Terminée</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Échéance</label>
                            <input type="date" id="echeance" />
                        </div>
                    </div>

                    <div class="form-group"><label>Responsable</label><input id="responsable" list="personnes-list" /></div>
                    <div class="form-group"><label>Commentaire</label><textarea id="commentaire"></textarea></div>

                    <div style="margin-top: 20px;">
                        <button id="saveAction">Créer l'action</button>
                        <button id="cancelAction" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveAction").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert("Le titre de l'action est obligatoire.");

            DataStore.addAction({
                id: UI.genId("ACT"),
                titre: titre,
                priorite: document.getElementById("priorite").value,
                statut: document.getElementById("statut").value,
                responsable: document.getElementById("responsable").value.trim(),
                echeance: document.getElementById("echeance").value,
                commentaire: document.getElementById("commentaire").value.trim(),
                exigence_id: exigence.id,
                risque_id: null
            });
            Router.navigateTo(`/exigences/${exigence.id}`);
        };

        document.getElementById("cancelAction").onclick = () => Router.navigateTo(`/exigences/${exigence.id}`);
    }

    return { renderList, renderDetail };
})();