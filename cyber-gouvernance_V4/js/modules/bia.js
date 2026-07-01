// Emplacement : js/modules/bia.js
// Nom du fichier : bia.js

const BiaModule = (() => {

    /* =========================
       LISTE DES PROCESSUS (BIA)
    ========================== */
    function renderList() {
        const processusList = DataStore.getProcessus();
        const app = document.getElementById("app");

        const rows = processusList.map(p => {
            let prioColor = "var(--color-success)";
            if (p.criticite === "Critique") prioColor = "var(--color-danger)";
            if (p.criticite === "Élevée") prioColor = "var(--color-warning)";
            if (p.criticite === "Modérée") prioColor = "var(--color-info)";

            return `
            <tr class="clickable-row" data-id="${p.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${p.id}">
                </td>
                <td><strong>${p.nom}</strong></td>
                <td><strong style="color: ${prioColor};">${p.criticite}</strong></td>
                <td><span class="badge" style="background: #e3f2fd; color: #0d47a1;">RTO: ${p.rto}</span></td>
                <td><span class="badge" style="background: #f3e5f5; color: #4a148c;">RPO: ${p.rpo}</span></td>
                <td>${p.responsable || "-"}</td>
            </tr>
            `;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Business Impact Analysis (BIA)</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (Continuité d'activité)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button id="addProcessusBtn">Déclarer un Processus</button>
                    </div>
                </div>

                <details class="synthese-message info" style="font-size: 0.9rem; padding: 10px; cursor: pointer; outline: none; margin-bottom: 20px;">
                    <summary style="font-weight: bold; outline: none;">
                        <strong>Guide BIA :</strong> Identifiez les processus vitaux de l'entreprise et fixez les objectifs de reprise (Cliquez pour lire).
                    </summary>
                    <div style="margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px; line-height: 1.6;">
                        <ul>
                            <li><strong>RTO (Recovery Time Objective) :</strong> Durée maximale d'interruption admissible. <em>Ex: Le site e-commerce doit repartir en moins de 4 heures.</em></li>
                            <li><strong>RPO (Recovery Point Objective) :</strong> Perte de données maximale admissible. <em>Ex: On accepte de perdre jusqu'à 24h de données de facturation (nécessite une sauvegarde quotidienne).</em></li>
                        </ul>
                    </div>
                </details>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Nom du Processus Métier</th>
                            <th>Criticité Métier</th>
                            <th>RTO (Temps de reprise)</th>
                            <th>RPO (Perte de données)</th>
                            <th>Responsable Métier</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='6' style='text-align:center;'>Aucun processus vital défini.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addProcessusBtn").onclick = renderCreate;

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

        if (selectAllCb) selectAllCb.addEventListener("change", (e) => { rowCbs.forEach(cb => cb.checked = e.target.checked); updateBulkDeleteUI(); });
        rowCbs.forEach(cb => cb.addEventListener("change", updateBulkDeleteUI));

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener("click", () => {
                const checkedIds = Array.from(document.querySelectorAll(".row-cb:checked")).map(cb => cb.dataset.id);
                if (confirm(`Confirmer la suppression de ${checkedIds.length} processus ?`)) {
                    checkedIds.forEach(id => DataStore.deleteProcessus(id));
                    if (window.showToast) window.showToast(`${checkedIds.length} processus supprimé(s).`, "success");
                    renderList();
                }
            });
        }

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/bia/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouveau Processus Vital</h1>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>Nom du Processus Métier <span style="color:red">*</span></label>
                        <input id="nom" placeholder="Ex: Logistique, Paye, Production chaîne A..." required />
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div class="form-group">
                            <label>Criticité Métier</label>
                            <select id="criticite">
                                <option value="Faible">Faible</option>
                                <option value="Modérée">Modérée</option>
                                <option value="Élevée">Élevée</option>
                                <option value="Critique">Critique (Vital)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>RTO (Objectif de Temps de Reprise)</label>
                            <select id="rto">
                                <option value="0h (Immédiat - PRA Actif)">0h (Immédiat - Haute Dispo)</option>
                                <option value="4 heures">4 heures</option>
                                <option value="24 heures">24 heures (1 jour)</option>
                                <option value="48 heures">48 heures (2 jours)</option>
                                <option value="1 semaine">1 semaine</option>
                                <option value="1 mois">1 mois</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>RPO (Objectif de Point de Perte)</label>
                            <select id="rpo">
                                <option value="0h (Zéro perte - Synchro)">0h (Zéro perte - Réplication)</option>
                                <option value="4 heures">4 heures</option>
                                <option value="24 heures">24 heures (Sauvegarde J-1)</option>
                                <option value="1 semaine">1 semaine</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Responsable Métier (Propriétaire)</label>
                        <input id="responsable" placeholder="Nom ou Fonction (ex: Directeur RH)" />
                    </div>

                    <div class="form-group">
                        <label>Description des impacts en cas d'arrêt</label>
                        <textarea id="description" placeholder="Impacts financiers, légaux, ou d'image si ce processus s'arrête..."></textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Enregistrer</button>
                        <button id="cancelBtn" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom du processus est obligatoire.");

            DataStore.addProcessus({
                id: "BIA-" + Date.now(),
                nom: nom,
                criticite: document.getElementById("criticite").value,
                rto: document.getElementById("rto").value,
                rpo: document.getElementById("rpo").value,
                responsable: document.getElementById("responsable").value.trim(),
                description: document.getElementById("description").value.trim(),
                actifs_lies: [] // Actifs IT nécessaires à ce processus
            });

            if(window.showToast) window.showToast("Processus créé.", "success");
            Router.navigateTo("/bia");
        };

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/bia");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const processus = DataStore.getProcessusById(id);
        const tousActifs = DataStore.getActifs();
        const app = document.getElementById("app");

        if (!processus) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Processus introuvable.</p><button onclick="Router.navigateTo('/bia')">Retour</button></section>`;
            return;
        }

        processus.actifs_lies = Array.isArray(processus.actifs_lies) ? processus.actifs_lies : [];

        // Liste des actifs avec cases à cocher
        const actifsHtml = tousActifs.map(a => `
            <label class="checkbox-line" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <input type="checkbox" class="actif-cb" value="${a.id}" ${processus.actifs_lies.includes(a.id) ? "checked" : ""}>
                    <strong>${a.nom}</strong> — <span style="font-size: 0.8rem; color: var(--text-muted);">${a.type}</span>
                </div>
                <span class="badge" style="background: ${a.criticite === 'critique' ? 'var(--color-danger)' : '#eee'}; color: ${a.criticite === 'critique' ? 'white' : '#333'};">
                    Criticité IT: ${a.criticite}
                </span>
            </label>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${processus.nom}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card" style="grid-column: span 2;">
                        <h3>Informations BIA</h3>
                        <div class="form-group"><label>Nom <span style="color:red">*</span></label><input id="nom" value="${processus.nom}" required /></div>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                            <div class="form-group">
                                <label>Criticité Métier</label>
                                <select id="criticite">
                                    <option value="Faible" ${processus.criticite === "Faible" ? "selected" : ""}>Faible</option>
                                    <option value="Modérée" ${processus.criticite === "Modérée" ? "selected" : ""}>Modérée</option>
                                    <option value="Élevée" ${processus.criticite === "Élevée" ? "selected" : ""}>Élevée</option>
                                    <option value="Critique" ${processus.criticite === "Critique" ? "selected" : ""}>Critique (Vital)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>RTO</label>
                                <select id="rto">
                                    <option value="0h (Immédiat - PRA Actif)" ${processus.rto === "0h (Immédiat - PRA Actif)" ? "selected" : ""}>0h (Immédiat - Haute Dispo)</option>
                                    <option value="4 heures" ${processus.rto === "4 heures" ? "selected" : ""}>4 heures</option>
                                    <option value="24 heures" ${processus.rto === "24 heures" ? "selected" : ""}>24 heures (1 jour)</option>
                                    <option value="48 heures" ${processus.rto === "48 heures" ? "selected" : ""}>48 heures (2 jours)</option>
                                    <option value="1 semaine" ${processus.rto === "1 semaine" ? "selected" : ""}>1 semaine</option>
                                    <option value="1 mois" ${processus.rto === "1 mois" ? "selected" : ""}>1 mois</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>RPO</label>
                                <select id="rpo">
                                    <option value="0h (Zéro perte - Synchro)" ${processus.rpo === "0h (Zéro perte - Synchro)" ? "selected" : ""}>0h (Zéro perte - Réplication)</option>
                                    <option value="4 heures" ${processus.rpo === "4 heures" ? "selected" : ""}>4 heures</option>
                                    <option value="24 heures" ${processus.rpo === "24 heures" ? "selected" : ""}>24 heures (Sauvegarde J-1)</option>
                                    <option value="1 semaine" ${processus.rpo === "1 semaine" ? "selected" : ""}>1 semaine</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group"><label>Responsable</label><input id="responsable" value="${processus.responsable || ""}" /></div>
                        <div class="form-group"><label>Impacts (Interruption)</label><textarea id="description">${processus.description || ""}</textarea></div>
                        <button id="saveBtn">Mettre à jour</button>
                    </div>

                    <div class="dashboard-card">
                        <h3>Cartographie IT (Dépendances)</h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 15px;">Cochez les actifs informatiques nécessaires au fonctionnement de ce processus. <em>(Pour respecter le RTO de ce processus métier, le RTO de ces actifs IT devra être inférieur ou égal).</em></p>
                        <div class="checkbox-group" style="max-height: 400px;">
                            ${actifsHtml || "<p style='color: var(--text-muted);'>Aucun actif inventorié dans le SI.</p>"}
                        </div>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            processus.nom = nom;
            processus.criticite = document.getElementById("criticite").value;
            processus.rto = document.getElementById("rto").value;
            processus.rpo = document.getElementById("rpo").value;
            processus.responsable = document.getElementById("responsable").value.trim();
            processus.description = document.getElementById("description").value.trim();
            processus.actifs_lies = Array.from(document.querySelectorAll(".actif-cb:checked")).map(cb => cb.value);

            DataStore.updateProcessus(processus);
            if(window.showToast) window.showToast("Processus mis à jour.", "success");
            Router.navigateTo("/bia");
        };

        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("Confirmer la suppression ?")) {
                DataStore.deleteProcessus(processus.id);
                Router.navigateTo("/bia");
            }
        };
    }

    return { renderList, renderDetail };
})();