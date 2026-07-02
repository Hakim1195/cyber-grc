// Emplacement : js/modules/pra_mco.js
// Nom du fichier : pra_mco.js

const PraMcoModule = (() => {

    /* =========================
       LISTE DES ACTIONS MCO
    ========================== */
    function renderList() {
        const mco = DataStore.getMcoActions();
        const app = document.getElementById("app");

        const rows = mco.map(m => `
            <tr class="clickable-row" data-id="${m.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${m.id}">
                </td>
                <td><strong>${escapeHtml(m.titre)}</strong></td>
                <td>${escapeHtml(m.frequence)}</td>
                <td>${m.date ? new Date(m.date).toLocaleDateString('fr-FR') : "Jamais"}</td>
                <td><span class="status ${m.etat === 'OK' ? 'status-conforme' : 'status-non-conforme'}">${m.etat === 'OK' ? 'OK' : 'KO'}</span></td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Actions Préalables (MCO) ${Help.tip("Maintien en Condition Opérationnelle : actions récurrentes qui garantissent que le PRA reste efficace dans le temps (tests d'onduleurs, mise à jour des procédures, vérification des sauvegardes).")}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Maintien en Condition Opérationnelle du PRA</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button id="addBtn" style="background-color: var(--primary);">Nouvelle Action MCO</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size:0.9rem; padding:10px;">
                    <strong>Astuce :</strong> Listez ici les actions récurrentes pour garantir que le plan fonctionne le jour J (ex: Vérification des générateurs, Tests de restauration des backups, Mises à jour des annuaires...).
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Action Préalable</th>
                            <th>Fréquence</th>
                            <th>Dernière vérif.</th>
                            <th>Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='5' style='text-align:center;'>Aucune action de maintien définie.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addBtn").onclick = renderCreate;

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteMcoAction(id),
            confirm: (n) => `Confirmer la suppression de ${n} action(s) de MCO ?`,
            toast: (n) => `${n} action(s) supprimée(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/mco/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION D'UNE ACTION MCO
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Nouvelle Action Préalable (MCO)</h1>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group"><label>Titre de l'action <span style="color:red">*</span></label><input id="titre" placeholder="Ex: Test onduleur salle serveur" required /></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Fréquence</label>
                            <select id="frequence">
                                <option value="Hebdomadaire">Hebdomadaire</option>
                                <option value="Mensuelle">Mensuelle</option>
                                <option value="Trimestrielle">Trimestrielle</option>
                                <option value="Annuelle">Annuelle</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Dernier État</label>
                            <select id="etat">
                                <option value="OK">OK (Fonctionnel)</option>
                                <option value="KO">KO (À corriger)</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group"><label>Date de la dernière vérification</label><input type="date" id="date" /></div>
                    <div class="form-group"><label>Notes & Résultat</label><textarea id="notes" placeholder="Remarques, lien vers rapport de test..."></textarea></div>
                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Enregistrer l'action</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/mco");

        document.getElementById("saveBtn").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert("Le titre est obligatoire.");

            DataStore.addMcoAction({
                id: UI.genId("MCO"),
                titre: titre,
                frequence: document.getElementById("frequence").value,
                etat: document.getElementById("etat").value,
                date: document.getElementById("date").value,
                notes: document.getElementById("notes").value.trim()
            });

            if(window.showToast) window.showToast("Action MCO créée.", "success");
            Router.navigateTo("/mco");
        };
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const m = DataStore.getMcoActions().find(x => x.id === id);
        if(!m) return Router.navigateTo("/mco");

        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Édition Action MCO</h1>
                    <button id="delBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group"><label>Titre <span style="color:red">*</span></label><input id="titre" value="${escapeHtml(m.titre)}" required /></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Fréquence</label>
                            <select id="frequence">
                                <option value="Hebdomadaire" ${m.frequence==="Hebdomadaire"?"selected":""}>Hebdomadaire</option>
                                <option value="Mensuelle" ${m.frequence==="Mensuelle"?"selected":""}>Mensuelle</option>
                                <option value="Trimestrielle" ${m.frequence==="Trimestrielle"?"selected":""}>Trimestrielle</option>
                                <option value="Annuelle" ${m.frequence==="Annuelle"?"selected":""}>Annuelle</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Dernier État</label>
                            <select id="etat">
                                <option value="OK" ${m.etat==="OK"?"selected":""}>OK</option>
                                <option value="KO" ${m.etat==="KO"?"selected":""}>KO</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group"><label>Date de la dernière vérification</label><input type="date" id="date" value="${m.date||""}" /></div>
                    <div class="form-group"><label>Notes & Résultat</label><textarea id="notes">${escapeHtml(m.notes||"")}</textarea></div>
                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Mettre à jour</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/mco");

        document.getElementById("saveBtn").onclick = () => {
            m.titre = document.getElementById("titre").value.trim();
            m.frequence = document.getElementById("frequence").value;
            m.etat = document.getElementById("etat").value;
            m.date = document.getElementById("date").value;
            m.notes = document.getElementById("notes").value.trim();

            DataStore.updateMcoAction(m);
            if(window.showToast) window.showToast("Action mise à jour.", "success");
            Router.navigateTo("/mco");
        };

        UI.wireDelete({
            button: "delBtn",
            confirm: "Confirmer la suppression de cette action de MCO ?",
            remove: () => DataStore.deleteMcoAction(id),
            redirect: "/mco"
        });
    }

    return { renderList, renderDetail };
})();