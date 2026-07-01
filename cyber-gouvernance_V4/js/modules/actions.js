// Emplacement : js/modules/actions.js
// Nom du fichier : actions.js

const ActionsModule = (() => {

    /* =========================
       LISTE DES ACTIONS (FILTRÉE)
    ========================== */
    function renderList() {
        const currentClient = localStorage.getItem("cyber-context") || "global";
        const exigencesClient = DataStore.getExigencesByClient(currentClient);
        const toutesExigences = DataStore.getExigences();
        const toutesActions = DataStore.getActions();
        const risques = DataStore.getRisques();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        /* =========================
           FILTRAGE SELON CONTEXTE
        ========================== */
        let actions = toutesActions;
        let contextName = "Vue Globale (Tous périmètres)";

        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = `Spécifiques à : ${c.nom} + Risques Internes`;

            const exIds = exigencesClient.map(e => e.id);
            actions = toutesActions.filter(a => {
                if (a.exigence_id) return exIds.includes(a.exigence_id);
                return true;
            });
        }

        const rows = actions.map(a => {
            let liaison = "-";
            let origineClient = "Interne";

            if (a.exigence_id) {
                const ex = toutesExigences.find(e => e.id === a.exigence_id);
                if (ex) {
                    liaison = `Exigence : ${ex.code}`;
                    if (ex.client_id) {
                        origineClient = clients.find(c => c.id === ex.client_id)?.nom || "Inconnu";
                    }
                } else {
                    liaison = "Exigence introuvable";
                }
            } else if (a.risque_id) {
                const r = risques.find(risk => risk.id === a.risque_id);
                liaison = r ? `Risque : ${r.nom}` : "Risque introuvable";
            } else if (a.evaluation_id) {
                const ev = DataStore.getEvaluationById ? DataStore.getEvaluationById(a.evaluation_id) : null;
                if (ev) {
                    const refNom = (typeof Referentiels !== "undefined" && Referentiels.get(ev.ref_id)) ? Referentiels.get(ev.ref_id).editeur : "Référentiel";
                    liaison = `${refNom} n°${ev.code}`;
                } else {
                    liaison = "Mesure introuvable";
                }
            } else if (a.incident_id) {
                const inc = DataStore.getIncidentById ? DataStore.getIncidentById(a.incident_id) : null;
                liaison = inc ? `Incident : ${inc.titre}` : "Incident introuvable";
            }

            let statusClass = "status-non-applicable";
            if (String(a.statut).toLowerCase() === "terminée") statusClass = "status-conforme";
            if (String(a.statut).toLowerCase() === "en cours") statusClass = "status-partiellement-conforme";
            if (String(a.statut).toLowerCase() === "à faire") statusClass = "status-non-conforme";

            // Gestion de l'affichage de la Priorité
            const priorite = a.priorite || "Moyenne";
            let prioColor = "var(--text-muted)";
            if (priorite === "Critique") prioColor = "var(--color-danger)";
            if (priorite === "Haute") prioColor = "var(--color-warning)";
            if (priorite === "Moyenne") prioColor = "var(--color-info)";

            return `
                <tr class="clickable-row" data-id="${a.id}">
                    <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                        <input type="checkbox" class="row-cb" data-id="${a.id}">
                    </td>
                    <td><strong>${a.titre}</strong></td>
                    <td><strong style="color: ${prioColor};">${priorite}</strong></td>
                    <td><span class="status ${statusClass}">${a.statut}</span></td>
                    <td>${a.responsable || "-"}</td>
                    <td>${a.echeance ? new Date(a.echeance).toLocaleDateString('fr-FR') : "-"}</td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">${liaison}</td>
                    ${currentClient === "global" ? `<td style="font-size:0.8rem; color:var(--text-muted);">${origineClient}</td>` : ""}
                </tr>
            `;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Plan d'actions</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre affiché : <strong>${contextName}</strong></p>
                    </div>
                    <div>
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size: 0.9rem; padding: 10px;">
                    Pour garantir la traçabilité, une nouvelle action doit être créée directement depuis la fiche d'une <strong>Exigence</strong> ou d'un <strong>Risque</strong>.
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Titre</th>
                            <th>Priorité</th>
                            <th>Statut</th>
                            <th>Responsable</th>
                            <th>Échéance</th>
                            <th>Traçabilité</th>
                            ${currentClient === "global" ? `<th>Origine</th>` : ""}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='8' style='text-align:center;'>Aucune action définie pour le moment.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteAction(id),
            confirm: (n) => `Confirmer la suppression définitive de ${n} action(s) ?`,
            toast: (n) => `${n} action(s) supprimée(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/actions/${row.dataset.id}`);
        });
    }

    /* =========================
       FICHE ACTION (CRUD)
    ========================== */
    function renderDetail(id) {
        const action = DataStore.getActionById(id);
        const exigences = DataStore.getExigences();
        const risques = DataStore.getRisques();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        if (!action) {
            app.innerHTML = `
                <section class="page">
                    <h1>Erreur</h1>
                    <p>L'action demandée est introuvable.</p>
                    <button onclick="Router.navigateTo('/actions')">Retour</button>
                </section>`;
            return;
        }

        let liaisonHtml = "<p>Aucune liaison</p>";
        let contextTag = "Interne";

        if (action.exigence_id) {
            const ex = exigences.find(e => e.id === action.exigence_id);
            if (ex) {
                if (ex.client_id) {
                    const c = clients.find(cl => cl.id === ex.client_id);
                    if (c) contextTag = `Client : ${c.nom}`;
                }

                liaisonHtml = `
                    <p><strong>Liée à l'exigence (${contextTag}) :</strong><br>
                        <a href="#/exigences/${ex.id}" style="color: var(--accent); text-decoration: underline;">
                            ${ex.code} — ${ex.intitule}
                        </a>
                    </p>`;
            }
        } else if (action.risque_id) {
            const r = risques.find(risk => risk.id === action.risque_id);
            if (r) {
                liaisonHtml = `
                    <p><strong>Liée au risque (Interne) :</strong><br>
                        <a href="#/risques/${r.id}" style="color: var(--accent); text-decoration: underline;">
                            ${r.nom} (${r.niveau})
                        </a>
                    </p>`;
            }
        } else if (action.evaluation_id) {
            const ev = DataStore.getEvaluationById ? DataStore.getEvaluationById(action.evaluation_id) : null;
            if (ev) {
                const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(ev.ref_id) : null;
                const exi = ref ? Referentiels.findExigence(ref, ev.code) : null;
                contextTag = "Référentiel";
                liaisonHtml = `
                    <p><strong>Liée à une mesure de référentiel :</strong><br>
                        <a href="#/referentiels/${ev.ref_id}" style="color: var(--accent); text-decoration: underline;">
                            ${ref ? ref.nom : ev.ref_id} — n°${ev.code}${exi ? " : " + exi.titre : ""}
                        </a>
                    </p>`;
            }
        } else if (action.incident_id) {
            const inc = DataStore.getIncidentById ? DataStore.getIncidentById(action.incident_id) : null;
            if (inc) {
                contextTag = "Incident";
                liaisonHtml = `
                    <p><strong>Liée à un incident de sécurité :</strong><br>
                        <a href="#/incidents/${inc.id}" style="color: var(--accent); text-decoration: underline;">
                            ${inc.titre}
                        </a>
                    </p>`;
            }
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${action.titre}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-card">
                    <div class="synthese-message" style="background: #f8f9fa; border-left: 4px solid var(--primary); padding: 10px; margin-bottom: 20px;">
                        ${liaisonHtml}
                    </div>

                    <div class="form-group">
                        <label>Titre de l'action <span style="color:red">*</span></label>
                        <input id="titre" value="${action.titre}" required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Priorité</label>
                            <select id="priorite">
                                <option value="Basse" ${action.priorite === "Basse" ? "selected" : ""}>Basse</option>
                                <option value="Moyenne" ${(!action.priorite || action.priorite === "Moyenne") ? "selected" : ""}>Moyenne</option>
                                <option value="Haute" ${action.priorite === "Haute" ? "selected" : ""}>Haute</option>
                                <option value="Critique" ${action.priorite === "Critique" ? "selected" : ""}>Critique</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Statut</label>
                            <select id="statut">
                                <option value="à faire" ${action.statut === "à faire" ? "selected" : ""}>À faire</option>
                                <option value="en cours" ${action.statut === "en cours" ? "selected" : ""}>En cours</option>
                                <option value="terminée" ${action.statut === "terminée" ? "selected" : ""}>Terminée</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Responsable</label>
                            <input id="responsable" value="${action.responsable || ""}" />
                        </div>
                        <div class="form-group">
                            <label>Échéance</label>
                            <input type="date" id="echeance" value="${action.echeance || ""}" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Commentaire / Suivi</label>
                        <textarea id="commentaire">${action.commentaire || ""}</textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Mettre à jour</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert("Le titre de l'action est obligatoire.");

            action.titre = titre;
            action.priorite = document.getElementById("priorite").value;
            action.statut = document.getElementById("statut").value;
            action.responsable = document.getElementById("responsable").value.trim();
            action.echeance = document.getElementById("echeance").value;
            action.commentaire = document.getElementById("commentaire").value.trim();

            DataStore.updateAction(action);
            if (window.showToast) window.showToast("Action mise à jour avec succès.", "success");
            Router.navigateTo("/actions");
        };

        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("Êtes-vous sûr de vouloir supprimer cette action ?")) {
                DataStore.deleteAction(action.id);
                if (window.showToast) window.showToast("Action supprimée.", "success");
                Router.navigateTo("/actions");
            }
        };
    }

    return {
        renderList,
        renderDetail
    };
})();