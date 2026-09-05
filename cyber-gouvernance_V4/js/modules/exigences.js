// Emplacement : js/modules/exigences.js
// Nom du fichier : exigences.js

const ExigencesModule = (() => {

    /* =========================
       LISTE & IMPORT
    ========================== */
    function renderList() {
        const currentClient = window.FiltreDonneurOrdre ? FiltreDonneurOrdre.get() : "global";   // filtre en mémoire (app.js), plus dans le localStorage
        const exigences = DataStore.getExigencesByClient(currentClient);
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        // ⚠️ Injecté en `innerHTML`, et le nom du client vient de l'utilisateur :
        // `tHtml`, qui échappe la valeur substituée (§37, injection).
        let contextName = tHtml("exigences.globalesEtClients");
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = tHtml("exigences.specifiques", { client: c.nom });
        }

        const rows = exigences.map(e => `
            <tr class="clickable-row" data-id="${e.id}">
                <td class="stop-row-click" style="text-align: center; width: 40px;">
                    <input type="checkbox" class="row-cb" data-id="${e.id}">
                </td>
                <td><strong>${escapeHtml(e.code)}</strong></td>
                <td>${escapeHtml(e.intitule)}</td>
                <td>
                    <span class="status status-${(e.statut_conformite || '').replace(/\s+/g, "-")}">
                        ${escapeHtml(I18n.valeur(e.statut_conformite))}
                    </span>
                </td>
                <td>${escapeHtml(e.responsable) || "-"}</td>
                ${currentClient === "global" ? `<td style="font-size:0.8rem; color:var(--text-muted);">${e.client_id ? escapeHtml(clients.find(c => c.id === e.client_id)?.nom || t("commun.inconnu")) : escapeHtml(t("commun.interne"))}</td>` : ""}
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${t("exigences.titre")}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">${t("exigences.perimetreAffiche")} <strong>${contextName}</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">${t("commun.supprimerSelection")} (<span id="selectedCount">0</span>)</button>
                        <a href="#/imports" class="btn-secondary" data-lecture="ok" title="${t("commun.importerAide")}">${t("commun.importer")}</a>
                        <button id="addExigenceBtn" style="background-color: var(--primary);">${t("exigences.saisieManuelle")}</button>
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>${t("exigences.colCode")}</th>
                            <th>${t("exigences.colIntitule")}</th>
                            <th>${t("commun.statut")}</th>
                            <th>${t("commun.responsable")}</th>
                            ${currentClient === "global" ? `<th>${t("exigences.colOrigine")}</th>` : ""}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan='6' style='text-align:center;'>${t("exigences.aucune")}</td></tr>`}
                    </tbody>
                </table>
            </section>
        `;

        const addBtn = document.getElementById("addExigenceBtn");
        if (addBtn) addBtn.onclick = renderCreate;

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
            remove: (id) => DataStore.deleteExigence(id),
            confirm: (n) => t("exigences.confirmerSuppressionMultiple", { n: n }),
            toast: (n) => t("exigences.supprimees", { n: n }),
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
        const currentClient = window.FiltreDonneurOrdre ? FiltreDonneurOrdre.get() : "global";   // filtre en mémoire (app.js), plus dans le localStorage
        const clients = DataStore.getClients();

        let contextInfo = tHtml("exigences.contexteGlobal");
        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextInfo = tHtml("exigences.contexteClient", { client: c.nom });
        }

        app.innerHTML = `
            <section class="page">
                <h1>${t("exigences.nouvelle")}</h1>
                <div class="synthese-message info" style="margin-bottom: 20px; padding: 10px;">
                    ${contextInfo}
                </div>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>${t("exigences.codeLabel")} <span style="color:red">*</span></label>
                        <input id="code" placeholder="${t("exigences.codePlaceholder")}" required />
                    </div>

                    <div class="form-group">
                        <label>${t("exigences.colIntitule")} <span style="color:red">*</span></label>
                        <input id="intitule" placeholder="${t("exigences.intitulePlaceholder")}" required />
                    </div>

                    <div class="form-group">
                        <label>${t("exigences.statutConformite")} ${Help.tip(t("exigences.statutConformiteAide"))}</label>
                        <select id="statut">
                            <option value="non conforme">${I18n.valeur("non conforme")}</option>
                            <option value="partiellement conforme">${I18n.valeur("partiellement conforme")}</option>
                            <option value="conforme">${I18n.valeur("conforme")}</option>
                            <option value="non applicable">${I18n.valeur("non applicable")}</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>${t("commun.responsable")}</label>
                        <input id="responsable" list="personnes-list" placeholder="${t("exigences.responsablePlaceholder")}" />
                    </div>

                    <div class="form-group">
                        <label>${t("exigences.commentaireJustification")}</label>
                        <textarea id="commentaire" placeholder="${t("exigences.commentairePlaceholder")}"></textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="save">${t("commun.enregistrer")}</button>
                        <button id="cancel" style="margin-left: 10px;">${t("commun.annuler")}</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("save").onclick = () => {
            const code = document.getElementById("code").value.trim();
            const intitule = document.getElementById("intitule").value.trim();

            if (!code || !intitule) {
                alert(t("exigences.champsObligatoires"));
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

            if (window.showToast) window.showToast(t("exigences.creee"), "success");
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
            app.innerHTML = `<section class="page"><h1>${t("commun.erreur")}</h1><p>${t("exigences.introuvable")}</p><button type="button" id="backBtn">${t("commun.retour")}</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/exigences"));
            return;
        }

        const clientAssocie = exigence.client_id ? clients.find(c => c.id === exigence.client_id) : null;
        const clientNom = clientAssocie ? clientAssocie.nom : t("exigences.globaleInterne");

        const risquesHtml = risques.filter(r =>
            Array.isArray(r.exigences_liees) && r.exigences_liees.includes(exigence.id)
        ).map(r => `
            <li class="matrix-risk clickable-risk" data-id="${r.id}" style="margin-bottom: 8px;">
                <strong>${escapeHtml(r.nom)}</strong> — ${t("exigences.niveau")} <span style="text-transform: capitalize;">${escapeHtml(I18n.valeur(r.niveau))}</span>
            </li>
        `).join("");

        const actionsHtml = actions.map(a => `
            <li class="clickable-action" data-id="${a.id}" style="padding: 8px; background: #f9f9f9; border-radius: 4px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid var(--accent);">
                <strong>${escapeHtml(a.titre)}</strong> — ${t("commun.statut")} : <em>${escapeHtml(I18n.valeur(a.statut))}</em>
            </li>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(exigence.code)}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">${t("exigences.origine")} <strong>${escapeHtml(clientNom)}</strong></p>
                    </div>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">${t("commun.supprimer")}</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card" style="grid-column: span 2;">
                        <h3>${t("exigences.details")}</h3>

                        <div class="form-group">
                            <label>${t("exigences.colIntitule")} <span style="color:red">*</span></label>
                            <input id="intitule" value="${escapeHtml(exigence.intitule)}" required />
                        </div>

                        <div class="form-group">
                            <label>${t("exigences.statutConformite")} ${Help.tip(t("exigences.statutConformiteAide"))}</label>
                            <select id="statut">
                                <option value="non conforme" ${exigence.statut_conformite === "non conforme" ? "selected" : ""}>${I18n.valeur("non conforme")}</option>
                                <option value="partiellement conforme" ${exigence.statut_conformite === "partiellement conforme" ? "selected" : ""}>${I18n.valeur("partiellement conforme")}</option>
                                <option value="conforme" ${exigence.statut_conformite === "conforme" ? "selected" : ""}>${I18n.valeur("conforme")}</option>
                                <option value="non applicable" ${exigence.statut_conformite === "non applicable" ? "selected" : ""}>${I18n.valeur("non applicable")}</option>
                            </select>
                        </div>

                        <div class="form-group"><label>${t("commun.responsable")}</label><input id="responsable" list="personnes-list" value="${escapeHtml(exigence.responsable || "")}" /></div>
                        <div class="form-group"><label>${t("commun.commentaire")}</label><textarea id="commentaire">${escapeHtml(exigence.commentaire || "")}</textarea></div>
                        <button id="saveBtn">${t("commun.mettreAJour")}</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="dashboard-card">
                            <h3>${t("exigences.actionsLiees")}</h3>
                            <ul style="margin-bottom: 15px;">${actionsHtml || `<li><span style='color: var(--text-muted);'>${t("exigences.aucuneActionPlanifiee")}</span></li>`}</ul>
                            <button id="addActionBtn" style="font-size: 0.85rem;">${t("exigences.planifierAction")}</button>
                        </div>

                        <div class="dashboard-card">
                            <h3>${t("exigences.risquesLies")}</h3>
                            <ul>${risquesHtml || `<li><span style='color: var(--text-muted);'>${t("exigences.aucunRisqueAssocie")}</span></li>`}</ul>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 10px;"><em>${t("exigences.associationDepuisRisque")}</em></p>
                        </div>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const intitule = document.getElementById("intitule").value.trim();
            if (!intitule) return alert(t("exigences.intituleObligatoire"));

            exigence.intitule = intitule;
            exigence.statut_conformite = document.getElementById("statut").value;
            exigence.responsable = document.getElementById("responsable").value.trim();
            exigence.commentaire = document.getElementById("commentaire").value.trim();

            DataStore.updateExigence(exigence);
            if (window.showToast) window.showToast(t("exigences.miseAJour"), "success");
            Router.navigateTo("/exigences");
        };

        UI.wireDelete({
            confirm: () => t("exigences.confirmerSuppression"),
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
                <h1>${t("exigences.nouvelleAction")}</h1>
                <div class="synthese-message info" style="margin-bottom: 20px; padding: 10px;">${tHtml("exigences.lieeExigence", { code: exigence.code })}</div>
                <div class="dashboard-card">
                    <div class="form-group"><label>${t("actions.titreAction")} <span style="color:red">*</span></label><input id="titre" required /></div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>${t("commun.priorite")}</label>
                            <select id="priorite">
                                <option value="Basse">${I18n.valeur("Basse")}</option>
                                <option value="Moyenne" selected>${I18n.valeur("Moyenne")}</option>
                                <option value="Haute">${I18n.valeur("Haute")}</option>
                                <option value="Critique">${I18n.valeur("Critique")}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t("commun.statut")}</label>
                            <select id="statut">
                                <option value="à faire" selected>${I18n.valeur("à faire")}</option>
                                <option value="en cours">${I18n.valeur("en cours")}</option>
                                <option value="terminée">${I18n.valeur("terminée")}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t("commun.echeance")}</label>
                            <input type="date" id="echeance" />
                        </div>
                    </div>

                    <div class="form-group"><label>${t("commun.responsable")}</label><input id="responsable" list="personnes-list" /></div>
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
            if (!titre) return alert(t("actions.titreObligatoire"));

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