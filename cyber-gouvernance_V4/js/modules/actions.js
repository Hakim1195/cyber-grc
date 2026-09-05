// Emplacement : js/modules/actions.js
// Nom du fichier : actions.js

const ActionsModule = (() => {

    /* =========================
       LISTE DES ACTIONS (FILTRÉE)
    ========================== */
    function renderList() {
        const currentClient = window.FiltreDonneurOrdre ? FiltreDonneurOrdre.get() : "global";   // filtre en mémoire (app.js), plus dans le localStorage
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
        // ⚠️ `contextName` est injecté en `innerHTML` : le nom du client vient de
        // l'utilisateur, il passe donc par `tHtml`, qui l'échappe (§37, injection).
        let contextName = tHtml("actions.vueGlobale");

        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = tHtml("actions.specifiques", { client: c.nom });

            const exIds = exigencesClient.map(e => e.id);
            actions = toutesActions.filter(a => {
                if (a.exigence_id) return exIds.includes(a.exigence_id);
                return true;
            });
        }

        const rows = actions.map(a => {
            let liaison = "-";
            let origineClient = t("commun.interne");

            if (a.exigence_id) {
                const ex = toutesExigences.find(e => e.id === a.exigence_id);
                if (ex) {
                    liaison = tHtml("actions.lieeExigence", { code: ex.code });
                    if (ex.client_id) {
                        origineClient = clients.find(c => c.id === ex.client_id)?.nom || t("commun.inconnu");
                    }
                } else {
                    liaison = tHtml("actions.exigenceIntrouvable");
                }
            } else if (a.risque_id) {
                const r = risques.find(risk => risk.id === a.risque_id);
                liaison = r ? tHtml("actions.lieeRisque", { nom: r.nom }) : tHtml("actions.risqueIntrouvable");
            } else if (a.evaluation_id) {
                const ev = DataStore.getEvaluationById ? DataStore.getEvaluationById(a.evaluation_id) : null;
                if (ev) {
                    const refNom = (typeof Referentiels !== "undefined" && Referentiels.get(ev.ref_id)) ? Referentiels.get(ev.ref_id).editeur : t("actions.referentiel");
                    liaison = `${escapeHtml(refNom)} n°${escapeHtml(ev.code)}`;
                } else {
                    liaison = tHtml("actions.mesureIntrouvable");
                }
            } else if (a.incident_id) {
                const inc = DataStore.getIncidentById ? DataStore.getIncidentById(a.incident_id) : null;
                liaison = inc ? tHtml("actions.lieeIncident", { titre: inc.titre }) : tHtml("actions.incidentIntrouvable");
            } else if (a.mesure_id) {
                const mes = DataStore.getMesureById ? DataStore.getMesureById(a.mesure_id) : null;
                liaison = mes ? tHtml("actions.lieeMesure", { nom: mes.nom }) : tHtml("actions.mesureIntrouvable");
            }

            let statusClass = "status-non-applicable";
            if (String(a.statut).toLowerCase() === "terminée") statusClass = "status-conforme";
            if (String(a.statut).toLowerCase() === "en cours") statusClass = "status-partiellement-conforme";
            if (String(a.statut).toLowerCase() === "à faire") statusClass = "status-non-conforme";

            // Gestion de l'affichage de la Priorité
            const priorite = a.priorite || "Moyenne";   // valeur STOCKÉE : jamais traduite ici
            let prioColor = "var(--text-muted)";
            if (priorite === "Critique") prioColor = "var(--color-danger)";
            if (priorite === "Haute") prioColor = "var(--color-warning)";
            if (priorite === "Moyenne") prioColor = "var(--color-info)";

            return `
                <tr class="clickable-row" data-id="${a.id}">
                    <td class="stop-row-click" style="text-align: center; width: 40px;">
                        <input type="checkbox" class="row-cb" data-id="${a.id}">
                    </td>
                    <td><strong>${escapeHtml(a.titre)}</strong></td>
                    <td><strong style="color: ${prioColor};">${escapeHtml(I18n.valeur(priorite))}</strong></td>
                    <td><span class="status ${statusClass}">${escapeHtml(I18n.valeur(a.statut))}</span></td>
                    <td>${escapeHtml(a.responsable) || "-"}</td>
                    <td>${escapeHtml(I18n.date(a.echeance)) || "-"}</td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">${liaison}</td>
                    ${currentClient === "global" ? `<td style="font-size:0.8rem; color:var(--text-muted);">${origineClient}</td>` : ""}
                </tr>
            `;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${t("actions.titre")}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">${t("actions.perimetreAffiche")} <strong>${contextName}</strong></p>
                    </div>
                    <div>
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">${t("commun.supprimerSelection")} (<span id="selectedCount">0</span>)</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size: 0.9rem; padding: 10px;">
                    ${t("actions.tracabiliteNote")}
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>${t("commun.titre")}</th>
                            <th>${t("commun.priorite")}</th>
                            <th>${t("commun.statut")}</th>
                            <th>${t("commun.responsable")}</th>
                            <th>${t("commun.echeance")}</th>
                            <th>${t("actions.colTracabilite")}</th>
                            ${currentClient === "global" ? `<th>${t("actions.colOrigine")}</th>` : ""}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan='8' style='text-align:center;'>${t("actions.aucune")}</td></tr>`}
                    </tbody>
                </table>
            </section>
        `;

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        // La case à cocher (et le lien courriel) ne doivent pas ouvrir la fiche :
        // conversion de l'ancien attribut `onclick="event.stopPropagation()"`, que la
        // politique de sécurité de contenu de production refuse.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteAction(id),
            confirm: (n) => t("actions.confirmerSuppressionMultiple", { n: n }),
            toast: (n) => t("actions.supprimees", { n: n }),
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/actions/${row.dataset.id}`);
        });
    }

    /* =========================
       FICHE ACTION (CRUD)
    ========================== */
    /* ⚠️ §37.6 — LA DATE STOCKÉE NE BOUGE PAS.
       Le champ `<input type="date">` de cette fiche porte la valeur ISO
       (AAAA-MM-JJ) telle qu'elle est en base, et c'est elle qui repart au
       serveur. Seul l'AFFICHAGE en lecture — la colonne « Échéance » de la
       liste — passe par `I18n.date()`. Formater à l'écriture serait un
       changement de schéma qui ne dit pas son nom. */
    function renderDetail(id) {
        const action = DataStore.getActionById(id);
        const exigences = DataStore.getExigences();
        const risques = DataStore.getRisques();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        if (!action) {
            app.innerHTML = `
                <section class="page">
                    <h1>${t("commun.erreur")}</h1>
                    <p>${t("actions.introuvable")}</p>
                    <button type="button" id="backBtn">${t("commun.retour")}</button>
                </section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/actions"));
            return;
        }

        let liaisonHtml = `<p>${t("commun.aucuneLiaison")}</p>`;
        let contextTag = t("commun.interne");

        if (action.exigence_id) {
            const ex = exigences.find(e => e.id === action.exigence_id);
            if (ex) {
                if (ex.client_id) {
                    const c = clients.find(cl => cl.id === ex.client_id);
                    if (c) contextTag = t("actions.client", { nom: c.nom });
                }

                liaisonHtml = `
                    <p><strong>${tHtml("actions.blocExigence", { contexte: contextTag })}</strong><br>
                        <a href="#/exigences/${escapeHtml(ex.id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(ex.code)} — ${escapeHtml(ex.intitule)}
                        </a>
                    </p>`;
            }
        } else if (action.risque_id) {
            const r = risques.find(risk => risk.id === action.risque_id);
            if (r) {
                liaisonHtml = `
                    <p><strong>${t("actions.blocRisque")}</strong><br>
                        <a href="#/risques/${escapeHtml(r.id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(r.nom)} (${escapeHtml(I18n.valeur(r.niveau))})
                        </a>
                    </p>`;
            }
        } else if (action.evaluation_id) {
            const ev = DataStore.getEvaluationById ? DataStore.getEvaluationById(action.evaluation_id) : null;
            if (ev) {
                const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(ev.ref_id) : null;
                const exi = ref ? Referentiels.findExigence(ref, ev.code) : null;
                contextTag = t("actions.referentiel");
                liaisonHtml = `
                    <p><strong>${t("actions.blocEvaluation")}</strong><br>
                        <a href="#/referentiels/${escapeHtml(ev.ref_id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(ref ? ref.nom : ev.ref_id)} — n°${escapeHtml(ev.code)}${exi ? " : " + escapeHtml(exi.titre) : ""}
                        </a>
                    </p>`;
            }
        } else if (action.incident_id) {
            const inc = DataStore.getIncidentById ? DataStore.getIncidentById(action.incident_id) : null;
            if (inc) {
                contextTag = t("actions.incident");
                liaisonHtml = `
                    <p><strong>${t("actions.blocIncident")}</strong><br>
                        <a href="#/incidents/${escapeHtml(inc.id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(inc.titre)}
                        </a>
                    </p>`;
            }
        } else if (action.mesure_id) {
            const mes = DataStore.getMesureById ? DataStore.getMesureById(action.mesure_id) : null;
            if (mes) {
                contextTag = t("actions.mesureSecurite");
                liaisonHtml = `
                    <p><strong>${t("actions.blocMesure")}</strong><br>
                        <a href="#/mesures/${mes.id}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(mes.nom)}
                        </a>
                    </p>`;
            }
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${escapeHtml(action.titre)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">${t("commun.supprimer")}</button>
                </div>

                <div class="dashboard-card">
                    <div class="synthese-message" style="background: #f8f9fa; border-left: 4px solid var(--primary); padding: 10px; margin-bottom: 20px;">
                        ${liaisonHtml}
                    </div>

                    <div class="form-group">
                        <label>${t("actions.titreAction")} <span style="color:red">*</span></label>
                        <input id="titre" value="${escapeHtml(action.titre)}" required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>${t("commun.priorite")}</label>
                            <select id="priorite">
                                <option value="Basse" ${action.priorite === "Basse" ? "selected" : ""}>${I18n.valeur("Basse")}</option>
                                <option value="Moyenne" ${(!action.priorite || action.priorite === "Moyenne") ? "selected" : ""}>${I18n.valeur("Moyenne")}</option>
                                <option value="Haute" ${action.priorite === "Haute" ? "selected" : ""}>${I18n.valeur("Haute")}</option>
                                <option value="Critique" ${action.priorite === "Critique" ? "selected" : ""}>${I18n.valeur("Critique")}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t("commun.statut")}</label>
                            <select id="statut">
                                <option value="à faire" ${action.statut === "à faire" ? "selected" : ""}>${I18n.valeur("à faire")}</option>
                                <option value="en cours" ${action.statut === "en cours" ? "selected" : ""}>${I18n.valeur("en cours")}</option>
                                <option value="terminée" ${action.statut === "terminée" ? "selected" : ""}>${I18n.valeur("terminée")}</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>${t("commun.responsable")}</label>
                            <input id="responsable" list="personnes-list" value="${escapeHtml(action.responsable || "")}" />
                        </div>
                        <div class="form-group">
                            <label>${t("commun.echeance")}</label>
                            <input type="date" id="echeance" value="${escapeHtml(action.echeance || "")}" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>${t("actions.commentaireSuivi")}</label>
                        <textarea id="commentaire">${escapeHtml(action.commentaire || "")}</textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="saveBtn">${t("commun.mettreAJour")}</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert(t("actions.titreObligatoire"));

            action.titre = titre;
            action.priorite = document.getElementById("priorite").value;
            action.statut = document.getElementById("statut").value;
            action.responsable = document.getElementById("responsable").value.trim();
            action.echeance = document.getElementById("echeance").value;
            action.commentaire = document.getElementById("commentaire").value.trim();

            DataStore.updateAction(action);
            if (window.showToast) window.showToast(t("actions.misAJour"), "success");
            Router.navigateTo("/actions");
        };

        UI.wireDelete({
            confirm: () => t("actions.confirmerSuppression"),
            remove: () => DataStore.deleteAction(action.id),
            toast: () => t("actions.supprimee"),
            redirect: "/actions"
        });
    }

    return {
        renderList,
        renderDetail
    };
})();