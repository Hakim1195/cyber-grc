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
        if (score < 3) return t("risques.nonCritique");
        if (score < 8) return t("risques.critique");
        return t("risques.tresCritique");
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
                <td class="stop-row-click" style="text-align: center; width: 40px;">
                    <input type="checkbox" class="row-cb" data-id="${r.id}">
                </td>
                <td><strong>${escapeHtml(r.nom) || t("risques.sansNom")}</strong></td>
                <td>
                    <span class="status" style="background: ${getRiskColor(scoreRes)}; color: white;">
                        ${getLabel(scoreRes)}
                    </span>
                </td>
                <td><span class="badge" style="background: #eee; color: #333;">${t("risques.brut")} ${r.score_brut || "-"}</span></td>
                <td><span class="badge" style="background: #e3f2fd; color: #0d47a1; font-weight: bold;">${t("risques.residuel")} ${I18n.nombre(scoreRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                <td>${r.description ? escapeHtml(String(r.description).substring(0, 50)) + "..." : "-"}</td>
            </tr>
        `}).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${t("risques.titre")} ${Help.tip(t("risques.titreAide"))}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">${t("risques.perimetre")} <strong>${t("risques.perimetreInterne")}</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">${t("commun.supprimerSelection")} (<span id="selectedCount">0</span>)</button>
                        <a href="#/imports" class="btn-secondary" data-lecture="ok" title="${t("commun.importerAide")}">${t("commun.importer")}</a>
                        <button id="addRisqueBtn">${t("risques.declarer")}</button>
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>${t("risques.colNom")}</th>
                            <th>${t("risques.colNiveauResiduel")}</th>
                            <th>${t("risques.colScoreBrut")}</th>
                            <th>${t("risques.colScoreResiduel")}</th>
                            <th>${t("commun.description")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan='6' style='text-align:center;'>${t("risques.aucun")}</td></tr>`}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addRisqueBtn").onclick = renderCreate;

        // ── L'IMPORT A DÉMÉNAGÉ, ET CE N'ÉTAIT PAS UN DÉPLACEMENT COSMÉTIQUE ──
        //
        // Cet écran portait son propre import Excel, qui écrivait DIRECTEMENT
        // dans le `DataStore` : aucune transaction serveur, aucun aperçu, aucune
        // idempotence, et un dédoublonnage approximatif par comparaison de
        // textes. Le lot L7 a livré un moteur qui fait l'inverse sur les 23
        // entités — tout ou rien, idempotent par le fichier, avec un rapport
        // ligne par ligne — et laisser les deux chemins coexister aurait offert
        // à l'utilisateur deux comportements contradictoires derrière le même
        // mot (constat Q-179).
        //
        // Le bouton renvoie donc vers `#/imports`. `js/services/importExcel.js`
        // n'est plus appelé par cet écran.


        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        // La case à cocher (et le lien courriel) ne doivent pas ouvrir la fiche :
        // conversion de l'ancien attribut `onclick="event.stopPropagation()"`, que la
        // politique de sécurité de contenu de production refuse.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteRisque(id),
            confirm: (n) => t("risques.confirmerSuppressionMultiple", { n: n }),
            toast: (n) => t("risques.supprimes", { n: n }),
            onDone: () => renderList()
        });

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
                <h1>${t("risques.nouveau")}</h1>

                <div class="synthese-message info" style="margin-bottom: 20px; font-size: 0.9rem;">
                    <strong>${t("risques.guideCotation")}</strong><br>
                    <ul style="margin-top: 5px; padding-left: 20px; margin-bottom: 0;">
                        <li>${t("risques.guideBrut")} <em>${t("risques.guideBrutNote")}</em></li>
                        <li>${t("risques.guideResiduel")} <em>${t("risques.guideResiduelNote")}</em></li>
                        <li><strong>${t("risques.guideMaitrise")}</strong> ${t("risques.guideMaitriseValeurs")}</li>
                    </ul>
                </div>

                <div class="dashboard-card" style="max-width: 800px;">
                    <div class="form-group"><label>${t("risques.colNom")} <span style="color:red">*</span></label><input id="nom" required /></div>

                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                        <div class="form-group">
                            <label>${t("risques.frequence")} ${Help.tip(t("risques.frequenceAide"))}</label>
                            <select id="f">
                                <option value="1">${t("risques.f1")}</option>
                                <option value="2">${t("risques.f2")}</option>
                                <option value="3">${t("risques.f3")}</option>
                                <option value="4">${t("risques.f4")}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t("risques.gravite")} ${Help.tip(t("risques.graviteAide"))}</label>
                            <select id="g">
                                <option value="1">${t("risques.g1")}</option>
                                <option value="2">${t("risques.g2")}</option>
                                <option value="3">${t("risques.g3")}</option>
                                <option value="4">${t("risques.g4")}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t("risques.maitrise")} ${Help.tip(t("risques.maitriseAide"))}</label>
                            <select id="m">
                                <option value="0.05">${t("risques.m005")}</option>
                                <option value="0.3">${t("risques.m03")}</option>
                                <option value="0.7">${t("risques.m07")}</option>
                                <option value="1">${t("risques.m1")}</option>
                            </select>
                        </div>
                    </div>

                    <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid var(--border);">
                        <div style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 5px;">${t("risques.apercuCalcul")}</div>
                        <div id="calc-preview" style="font-size: 1.1rem;">
                            ${tHtml("risques.calcul", { brut: 1 })} <strong style="color: var(--color-success);">${I18n.nombre(0.05, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${t("risques.nonCritique")})</strong>
                        </div>
                    </div>

                    <div class="form-group"><label>${t("risques.descriptionDetails")}</label><textarea id="description"></textarea></div>

                    <div style="margin-top: 20px;">
                        <button id="save">${t("risques.creer")}</button>
                        <button id="cancel" style="margin-left: 10px;">${t("commun.annuler")}</button>
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
                ${tHtml("risques.calcul", { brut: sBrut })} <strong style="color: ${getRiskColor(sRes)};">${I18n.nombre(sRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${getLabel(sRes)})</strong>
            `;
        };

        ["f", "g", "m"].forEach(id => document.getElementById(id).addEventListener("change", updatePreview));

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert(t("risques.nomObligatoire"));

            const f = parseInt(document.getElementById("f").value);
            const g = parseInt(document.getElementById("g").value);
            const m = parseFloat(document.getElementById("m").value);
            const scoreBrut = f * g;
            const scoreResiduel = scoreBrut * m;

            DataStore.addRisque({
                id: UI.genId("RISK"),
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
            const clientNom = e.client_id ? (clients.find(c => c.id === e.client_id)?.nom || t("commun.client")) : t("commun.interne");
            return `
            <label class="checkbox-line" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <input type="checkbox" class="exigence-cb" value="${e.id}" ${risque.exigences_liees.includes(e.id) ? "checked" : ""}>
                    <strong>${escapeHtml(e.code)}</strong> — ${escapeHtml(String(e.intitule || "").substring(0, 40))}...
                </div>
                <span class="badge" style="font-size: 0.7rem; background: #eee; color: #666;">${escapeHtml(clientNom)}</span>
            </label>
        `}).join("");

        const actionsHtml = actions.map(a => `
            <li class="clickable-action" data-id="${a.id}" style="padding: 8px; background: #f9f9f9; border-radius: 4px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid var(--accent);">
                <strong>${escapeHtml(a.titre)}</strong> — ${t("risques.actionStatut")} <em>${escapeHtml(I18n.valeur(a.statut))}</em>
            </li>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${escapeHtml(risque.nom)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">${t("commun.supprimer")}</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card" style="grid-column: span 2;">
                        <h3>${t("risques.evaluation")}</h3>

                        <div class="synthese-message info" style="margin-bottom: 20px; font-size: 0.9rem;">
                            <strong>${t("risques.rappelCotation")}</strong> ${t("risques.rappelCotationTexte")}<br>
                            <em>${t("risques.rappelMaitrise")}</em>
                        </div>

                        <div class="form-group"><label>${t("commun.nom")} <span style="color:red">*</span></label><input id="nom" value="${escapeHtml(risque.nom)}" required /></div>

                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                            <div class="form-group">
                                <label>${t("risques.frequence")} ${Help.tip(t("risques.frequenceAide"))}</label>
                                <select id="f">
                                    <option value="1" ${currentF == 1 ? "selected" : ""}>${t("risques.f1")}</option>
                                    <option value="2" ${currentF == 2 ? "selected" : ""}>${t("risques.f2")}</option>
                                    <option value="3" ${currentF == 3 ? "selected" : ""}>${t("risques.f3")}</option>
                                    <option value="4" ${currentF == 4 ? "selected" : ""}>${t("risques.f4")}</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>${t("risques.gravite")} ${Help.tip(t("risques.graviteAide"))}</label>
                                <select id="g">
                                    <option value="1" ${currentG == 1 ? "selected" : ""}>${t("risques.g1")}</option>
                                    <option value="2" ${currentG == 2 ? "selected" : ""}>${t("risques.g2")}</option>
                                    <option value="3" ${currentG == 3 ? "selected" : ""}>${t("risques.g3")}</option>
                                    <option value="4" ${currentG == 4 ? "selected" : ""}>${t("risques.g4")}</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>${t("risques.maitrise")} ${Help.tip(t("risques.maitriseAide"))}</label>
                                <select id="m">
                                    <option value="0.05" ${currentM == 0.05 ? "selected" : ""}>${t("risques.m005")}</option>
                                    <option value="0.3" ${currentM == 0.3 ? "selected" : ""}>${t("risques.m03")}</option>
                                    <option value="0.7" ${currentM == 0.7 ? "selected" : ""}>${t("risques.m07")}</option>
                                    <option value="1" ${currentM == 1 ? "selected" : ""}>${t("risques.m1")}</option>
                                </select>
                            </div>
                        </div>

                        <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid var(--border);">
                            <div id="calc-preview" style="font-size: 1.1rem;">
                                ${tHtml("risques.calcul", { brut: currentF * currentG })} <strong style="color: ${getRiskColor(currentRes)};">${I18n.nombre(currentRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${getLabel(currentRes)})</strong>
                            </div>
                        </div>

                        <div class="form-group"><label>${t("commun.description")}</label><textarea id="description">${escapeHtml(risque.description || "")}</textarea></div>
                        <button id="saveBtn">${t("commun.mettreAJour")}</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="dashboard-card">
                            <h3>${t("risques.planTraitement")}</h3>
                            <ul style="margin-bottom: 15px;">${actionsHtml || `<li><span style='color: var(--text-muted);'>${t("risques.aucuneAction")}</span></li>`}</ul>
                            <button id="addActionBtn" style="font-size: 0.85rem;">${t("risques.planifierAction")}</button>
                        </div>
                        <div class="dashboard-card">
                            <h3>${t("risques.exigencesApplicables")}</h3>
                            <div class="checkbox-group" style="max-height: 250px; overflow-y: auto;">
                                ${exigencesHtml || `<p style='color: var(--text-muted);'>${t("risques.aucuneExigence")}</p>`}
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
                ${tHtml("risques.calcul", { brut: sBrut })} <strong style="color: ${getRiskColor(sRes)};">${I18n.nombre(sRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${getLabel(sRes)})</strong>
            `;
        };

        ["f", "g", "m"].forEach(id => document.getElementById(id).addEventListener("change", updatePreview));

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert(t("risques.nomObligatoireCourt"));

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
            if(window.showToast) window.showToast(t("risques.misAJour"), "success");
            Router.navigateTo("/risques");
        };

        UI.wireDelete({
            confirm: () => t("commun.confirmerSuppression"),
            remove: () => DataStore.deleteRisque(risque.id),
            redirect: "/risques"
        });

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
                <h1>${t("risques.nouvelleAction")}</h1>
                <div class="synthese-message warning" style="margin-bottom: 20px; padding: 10px;">
                    ${tHtml("risques.pourTraiter", { nom: risque.nom })}
                </div>
                <div class="dashboard-card">
                    <div class="form-group"><label>${t("commun.titre")} <span style="color:red">*</span></label><input id="titre" required /></div>
                    <div class="form-group"><label>${t("commun.responsable")}</label><input id="responsable" list="personnes-list" /></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group"><label>${t("commun.statut")}</label><select id="statut"><option value="à faire" selected>${I18n.valeur("à faire")}</option><option value="en cours">${I18n.valeur("en cours")}</option><option value="terminée">${I18n.valeur("terminée")}</option></select></div>
                        <div class="form-group"><label>${t("commun.echeance")}</label><input type="date" id="echeance" /></div>
                    </div>
                    <div class="form-group"><label>${t("commun.commentaire")}</label><textarea id="commentaire"></textarea></div>
                    <div style="margin-top: 20px;">
                        <button id="saveAction">${t("risques.creerAction")}</button>
                        <button id="cancelAction" style="margin-left: 10px;">${t("commun.annuler")}</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveAction").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert(t("risques.titreObligatoire"));

            DataStore.addAction({
                id: UI.genId("ACT"),
                titre: titre,
                statut: document.getElementById("statut").value,
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