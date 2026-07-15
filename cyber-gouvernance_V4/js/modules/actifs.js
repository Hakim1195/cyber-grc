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
                            <th>Criticité (CIA) ${Help.tip("Criticité de l'actif selon les 3 critères de sécurité : Confidentialité, Intégrité, Disponibilité (CIA, ou DICP en français). Plus un actif est critique, plus il justifie des protections renforcées.")}</th>
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
                            <label>Criticité Globale (CIA) ${Help.tip("Criticité de l'actif selon les 3 critères de sécurité : Confidentialité, Intégrité, Disponibilité (CIA, ou DICP en français). Plus un actif est critique, plus il justifie des protections renforcées.")}</label>
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
                id: UI.genId("ACTIF"),
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
        actif.dependances = Array.isArray(actif.dependances) ? actif.dependances.filter(d => d && d.to) : [];

        // Dépendances de cartographie (v9) : liens typés vers d'autres actifs, édités ici.
        const deps = actif.dependances.map(d => ({ to: d.to, type: d.type || "dep" }));
        const autresActifs = DataStore.getActifs().filter(a => a.id !== actif.id);
        const DT = (typeof CartographieModule !== "undefined" && CartographieModule.depTypes) ? CartographieModule.depTypes()
            : { dep: { label: "Dépend de", short: "dépend de" }, hosted: { label: "Hébergé sur", short: "hébergé sur" }, flux: { label: "Alimenté par", short: "alimenté par" }, backup: { label: "Sauvegardé par", short: "sauvegardé par" } };
        const DORDER = (typeof CartographieModule !== "undefined" && CartographieModule.depOrder) ? CartographieModule.depOrder() : ["dep", "hosted", "flux", "backup"];
        const nomActif = aid => { const a = DataStore.getActifById(aid); return a ? a.nom : "?"; };
        const depLabel = t => (DT[t] ? DT[t].short : t);
        // Ce qui dépend de cet actif (entrant, lecture seule).
        const reverseDeps = DataStore.getActifs()
            .filter(a => a.id !== actif.id && Array.isArray(a.dependances))
            .flatMap(a => a.dependances.filter(d => d && d.to === actif.id).map(d => ({ from: a.nom, type: d.type || "dep" })));

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

                <div class="dashboard-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <h3 style="margin:0;">Dépendances de cartographie ${Help.tip("Liens typés vers d'autres actifs : « dépend de », « hébergé sur », « alimenté par » (flux de données) ou « sauvegardé par ». Ils alimentent la Cartographie du SI et l'analyse d'impact (propagation, points de défaillance unique). La sauvegarde ne propage pas une panne de disponibilité.")}</h3>
                        <a href="#/cartographie" style="font-size:0.85rem; color:var(--accent); font-weight:600; text-decoration:none;">Voir la cartographie →</a>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-muted); margin:8px 0 14px;">Déclarez ce dont <strong>${escapeHtml(actif.nom)}</strong> a besoin pour fonctionner.</p>

                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:16px;">
                        <div class="form-group" style="margin:0;">
                            <label style="font-size:0.8rem;">Cet actif…</label>
                            <select id="depType">
                                ${DORDER.map(t => `<option value="${t}">${escapeHtml(DT[t] ? (DT[t].label || DT[t].short) : t)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group" style="margin:0; flex:1; min-width:180px;">
                            <label style="font-size:0.8rem;">…de l'actif</label>
                            <select id="depTarget">
                                ${autresActifs.length ? autresActifs.map(a => `<option value="${a.id}">${escapeHtml(a.nom)}</option>`).join("") : `<option value="">(aucun autre actif déclaré)</option>`}
                            </select>
                        </div>
                        <button id="addDepBtn" type="button" ${autresActifs.length ? "" : "disabled"}>Ajouter le lien</button>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px;">
                        <div>
                            <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700; margin-bottom:8px;">Dépendances déclarées</div>
                            <ul id="deps-list" style="list-style:none; padding:0; margin:0;"></ul>
                        </div>
                        <div>
                            <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700; margin-bottom:8px;">En dépendent (entrant)</div>
                            <ul style="list-style:none; padding:0; margin:0; font-size:0.86rem;">
                                ${reverseDeps.length ? reverseDeps.map(r => `<li style="padding:4px 0;"><strong>${escapeHtml(r.from)}</strong> <span style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(depLabel(r.type))}</span></li>`).join("") : `<li style="color:var(--text-muted); font-style:italic;">Aucun actif ne dépend de celui-ci.</li>`}
                            </ul>
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
            actif.dependances = deps.slice();

            DataStore.updateActif(actif);
            if (window.showToast) window.showToast("Actif mis à jour.", "success");
            Router.navigateTo("/actifs");
        };

        // Édition des dépendances (liste dynamique, enregistrée avec « Mettre à jour »).
        function renderDepsList() {
            const ul = document.getElementById("deps-list");
            if (!ul) return;
            ul.innerHTML = deps.length ? deps.map((d, i) => `
                <li style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border);">
                    <span style="font-size:0.86rem;"><span style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(depLabel(d.type))}</span> <strong>${escapeHtml(nomActif(d.to))}</strong></span>
                    <button type="button" class="rm-dep" data-i="${i}" title="Retirer ce lien" style="background:none; border:none; color:var(--color-danger); cursor:pointer; font-size:1.2rem; line-height:1; padding:0 4px;">&times;</button>
                </li>`).join("") : `<li style="color:var(--text-muted); font-style:italic; font-size:0.86rem;">Aucune dépendance déclarée.</li>`;
            ul.querySelectorAll(".rm-dep").forEach(btn => btn.onclick = () => { deps.splice(parseInt(btn.dataset.i, 10), 1); renderDepsList(); });
        }
        renderDepsList();

        const addDepBtn = document.getElementById("addDepBtn");
        if (addDepBtn) addDepBtn.onclick = () => {
            const type = document.getElementById("depType").value;
            const to = document.getElementById("depTarget").value;
            if (!to) return;
            if (deps.some(d => d.to === to && d.type === type)) {
                if (window.showToast) window.showToast("Ce lien existe déjà.", "info");
                return;
            }
            deps.push({ to, type });
            renderDepsList();
        };

        UI.wireDelete({
            confirm: "Confirmer la suppression de cet actif ?",
            remove: () => DataStore.deleteActif(actif.id),
            redirect: "/actifs"
        });
    }

    return { renderList, renderDetail };
})();