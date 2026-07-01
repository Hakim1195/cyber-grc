// Emplacement : js/modules/actifs.js
// Nom du fichier : actifs.js

const ActifsModule = (() => {

    function renderList() {
        const actifs = DataStore.getActifs();
        const app = document.getElementById("app");

        const rows = actifs.map(a => `
            <tr class="clickable-row" data-id="${a.id}">
                <td><strong>${escapeHtml(a.nom)}</strong></td>
                <td>${escapeHtml(a.type)}</td>
                <td>
                    <span class="status" style="background: ${a.criticite === 'critique' ? 'var(--risk-critical)' : a.criticite === 'élevée' ? 'var(--risk-high)' : a.criticite === 'modérée' ? 'var(--risk-medium)' : 'var(--risk-low)'}; color: white;">
                        ${escapeHtml(a.criticite)}
                    </span>
                </td>
                <td>${escapeHtml(a.responsable) || "-"}</td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Actifs du Système d'Information</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (Commun à tous les clients)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <input type="file" id="importActifsFile" accept=".xlsx, .xls, .csv" style="display: none;" />
                        <button id="templateActifsBtn" style="background: var(--color-gray); color: white;">Télécharger le modèle</button>
                        <button id="importActifsBtn" style="background: var(--color-info); color: white;">Importer (Excel)</button>
                        <button id="addActifBtn">Déclarer un actif</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size: 0.9rem; padding: 10px; margin-bottom: 20px;">
                    <strong>Format d'import :</strong> fichier Excel/CSV avec les colonnes <em>Nom, Type, Criticité, Responsable, Description</em>. Cliquez sur <strong>« Télécharger le modèle »</strong> pour partir d'un fichier prêt à remplir. Les actifs déjà présents (même nom) sont ignorés.
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nom de l'actif</th>
                            <th>Type</th>
                            <th>Criticité (CIA)</th>
                            <th>Responsable</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='4' style='text-align:center;'>Aucun actif déclaré.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        const addBtn = document.getElementById("addActifBtn");
        if (addBtn) addBtn.onclick = renderCreate;

        // Téléchargement du modèle d'import
        const templateBtn = document.getElementById("templateActifsBtn");
        if (templateBtn) {
            templateBtn.onclick = () => {
                if (typeof ImportExcelService !== "undefined") ImportExcelService.downloadActifsTemplate();
                else alert("Le service d'importation n'est pas chargé.");
            };
        }

        // Gestion de l'import Excel
        const importBtn = document.getElementById("importActifsBtn");
        const importFile = document.getElementById("importActifsFile");

        if (importBtn && importFile) {
            importBtn.onclick = () => importFile.click();
            importFile.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (typeof ImportExcelService === "undefined") {
                    alert("Le service d'importation n'est pas chargé.");
                    importFile.value = '';
                    return;
                }

                ImportExcelService.importActifs(file, (imported, skipped) => {
                    let msg = `${imported} actif(s) importé(s) avec succès.`;
                    if (skipped > 0) msg += `\n${skipped} actif(s) ignoré(s) car le nom existait déjà.`;

                    alert(msg);
                    if (window.showToast) window.showToast("Import des actifs terminé", "success");

                    renderList(); // Recharger la vue
                });

                // Réinitialiser l'input pour permettre de réimporter le même fichier si besoin
                importFile.value = '';
            };
        }

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/actifs/${row.dataset.id}`);
        });
    }

    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouvel actif</h1>

                <div class="synthese-message info" style="margin-bottom: 20px; padding: 10px;">
                    Les actifs représentent l'infrastructure interne de votre entreprise. Ils sont indépendants des donneurs d'ordre.
                </div>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>Nom de l'actif <span style="color:red">*</span></label>
                        <input id="nom" placeholder="Ex: Serveur ERP, Réseau OT..." required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Type</label>
                            <select id="type">
                                <option value="Matériel">Matériel (Serveur, Poste, Réseau)</option>
                                <option value="Logiciel">Logiciel (Application, OS)</option>
                                <option value="Donnée">Donnée (Base de données, Fichiers)</option>
                                <option value="Service">Service (Cloud, SaaS)</option>
                                <option value="Humain">Humain (Prestataire, Collaborateur)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Criticité Globale (CIA)</label>
                            <select id="criticite">
                                <option value="faible">Faible</option>
                                <option value="modérée">Modérée</option>
                                <option value="élevée">Élevée</option>
                                <option value="critique">Critique</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Responsable de l'actif</label>
                        <input id="responsable" placeholder="Propriétaire métier ou IT" />
                    </div>

                    <div class="form-group">
                        <label>Description / Emplacement</label>
                        <textarea id="description"></textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="save">Enregistrer</button>
                        <button id="cancel" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom de l'actif est obligatoire.");

            DataStore.addActif({
                id: "ACTIF-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
                nom: nom,
                type: document.getElementById("type").value,
                criticite: document.getElementById("criticite").value,
                responsable: document.getElementById("responsable").value.trim(),
                description: document.getElementById("description").value.trim(),
                risques_lies: []
            });

            Router.navigateTo("/actifs");
        };

        document.getElementById("cancel").onclick = () => Router.navigateTo("/actifs");
    }

    function renderDetail(id) {
        const actif = DataStore.getActifById(id);
        const tousRisques = DataStore.getRisques();
        const app = document.getElementById("app");

        if (!actif) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Actif introuvable.</p><button onclick="Router.navigateTo('/actifs')">Retour</button></section>`;
            return;
        }

        actif.risques_lies = Array.isArray(actif.risques_lies) ? actif.risques_lies : [];

        const risquesHtml = tousRisques.map(r => `
            <label class="checkbox-line">
                <input type="checkbox" class="risque-cb" value="${r.id}" ${actif.risques_lies.includes(r.id) ? "checked" : ""}>
                <strong>${escapeHtml(r.nom)}</strong> <span style="font-size:0.8rem; color:var(--text-muted);">(${escapeHtml(r.niveau)})</span>
            </label>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${escapeHtml(actif.nom)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card">
                        <h3>Détails de l'actif</h3>
                        <div class="form-group"><label>Nom <span style="color:red">*</span></label><input id="nom" value="${escapeHtml(actif.nom)}" required /></div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group">
                                <label>Type</label>
                                <select id="type">
                                    <option value="Matériel" ${actif.type === "Matériel" ? "selected" : ""}>Matériel</option>
                                    <option value="Logiciel" ${actif.type === "Logiciel" ? "selected" : ""}>Logiciel</option>
                                    <option value="Donnée" ${actif.type === "Donnée" ? "selected" : ""}>Donnée</option>
                                    <option value="Service" ${actif.type === "Service" ? "selected" : ""}>Service</option>
                                    <option value="Humain" ${actif.type === "Humain" ? "selected" : ""}>Humain</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Criticité</label>
                                <select id="criticite">
                                    <option value="faible" ${actif.criticite === "faible" ? "selected" : ""}>Faible</option>
                                    <option value="modérée" ${actif.criticite === "modérée" ? "selected" : ""}>Modérée</option>
                                    <option value="élevée" ${actif.criticite === "élevée" ? "selected" : ""}>Élevée</option>
                                    <option value="critique" ${actif.criticite === "critique" ? "selected" : ""}>Critique</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group"><label>Responsable</label><input id="responsable" value="${escapeHtml(actif.responsable || "")}" /></div>
                        <div class="form-group"><label>Description</label><textarea id="description">${escapeHtml(actif.description || "")}</textarea></div>
                        <button id="saveBtn">Mettre à jour</button>
                    </div>

                    <div class="dashboard-card">
                        <h3>Menaces & Risques applicables</h3>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">Cochez les scénarios de risques qui pèsent sur cet actif :</p>
                        <div class="checkbox-group">
                            ${risquesHtml || "<p style='color: var(--text-muted);'>Aucun risque défini dans le registre.</p>"}
                        </div>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            actif.nom = nom;
            actif.type = document.getElementById("type").value;
            actif.criticite = document.getElementById("criticite").value;
            actif.responsable = document.getElementById("responsable").value.trim();
            actif.description = document.getElementById("description").value.trim();
            actif.risques_lies = Array.from(document.querySelectorAll(".risque-cb:checked")).map(cb => cb.value);

            DataStore.updateActif(actif);
            if (window.showToast) window.showToast("Actif mis à jour.", "success");
            Router.navigateTo("/actifs");
        };

        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("Confirmer la suppression de cet actif ?")) {
                DataStore.deleteActif(actif.id);
                Router.navigateTo("/actifs");
            }
        };
    }

    return { renderList, renderDetail };
})();