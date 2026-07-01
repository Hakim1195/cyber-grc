// Emplacement : js/modules/pra_prestataires.js
// Nom du fichier : pra_prestataires.js

const PraPrestatairesModule = (() => {

    /* =========================
       LISTE DES PRESTATAIRES & TIERS
    ========================== */
    function renderList() {
        const prestataires = DataStore.getPrestataires();
        const app = document.getElementById("app");

        const rows = prestataires.map(p => `
            <tr class="clickable-row" data-id="${p.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${p.id}">
                </td>
                <td><strong>${p.societe}</strong></td>
                <td><span class="badge" style="background:#eee; color:#333;">${p.type}</span></td>
                <td>${p.phone || "-"}<br>${p.email || "-"}</td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${p.notes ? p.notes.substring(0,60)+"..." : "-"}</td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Prestataires & Tiers</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Annuaire d'urgence et d'escalade</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button id="addBtn" style="background-color: var(--primary);">Nouveau Contact</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size:0.9rem; padding:10px;">
                    <strong>Annuaire de crise :</strong> Enregistrez ici les contacts vitaux en cas d'incident majeur (Hébergeur Cloud, Assureur Cyber, Fournisseur réseau, ANSSI, CNIL...). Pensez à l'imprimer !
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Société / Entité</th>
                            <th>Type de contact</th>
                            <th>Contact Urgence</th>
                            <th>Notes & Procédure</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='5' style='text-align:center;'>Aucun contact externe enregistré.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addBtn").onclick = renderCreate;

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

        if (selectAllCb) {
            selectAllCb.addEventListener("change", (e) => {
                rowCbs.forEach(cb => cb.checked = e.target.checked);
                updateBulkDeleteUI();
            });
        }

        rowCbs.forEach(cb => {
            cb.addEventListener("change", updateBulkDeleteUI);
        });

        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener("click", () => {
                const checkedIds = Array.from(document.querySelectorAll(".row-cb:checked")).map(cb => cb.dataset.id);
                if (confirm(`Confirmer la suppression de ${checkedIds.length} contact(s) ?`)) {
                    checkedIds.forEach(id => DataStore.deletePrestataire(id));
                    if (window.showToast) window.showToast(`${checkedIds.length} contact(s) supprimé(s).`, "success");
                    renderList();
                }
            });
        }

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/prestataires/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION D'UN CONTACT
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Nouveau Prestataire / Tiers</h1>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Société / Entité <span style="color:red">*</span></label>
                        <input id="societe" placeholder="Ex: IONOS, Assureur X, ANSSI..." required />
                    </div>
                    <div class="form-group">
                        <label>Type de contact</label>
                        <select id="type">
                            <option value="Prestataire IT / Cloud">Prestataire IT / Cloud</option>
                            <option value="Assureur Cyber">Assureur Cyber</option>
                            <option value="Client Majeur">Client Majeur (à prévenir)</option>
                            <option value="Autorité">Autorité (ANSSI, CNIL, Police)</option>
                            <option value="Autre">Autre</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Téléphone d'Urgence</label>
                            <input id="phone" placeholder="Numéro 24/7 si possible" />
                        </div>
                        <div class="form-group">
                            <label>Email de support/contact</label>
                            <input id="email" type="email" placeholder="contact@..." />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes / Procédure d'appel</label>
                        <textarea id="notes" placeholder="Ex: Avoir le numéro de contrat sous la main avant d'appeler. Contrat N° XXXX." style="min-height:80px;"></textarea>
                    </div>
                    <div style="margin-top: 20px;">
                        <button id="saveBtn" style="background:var(--color-success);">Enregistrer le contact</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/prestataires");

        document.getElementById("saveBtn").onclick = () => {
            const soc = document.getElementById("societe").value.trim();
            if (!soc) return alert("Le nom de la société est obligatoire.");

            DataStore.addPrestataire({
                id: "PREST-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
                societe: soc,
                type: document.getElementById("type").value,
                phone: document.getElementById("phone").value.trim(),
                email: document.getElementById("email").value.trim(),
                notes: document.getElementById("notes").value.trim()
            });

            if(window.showToast) window.showToast("Contact ajouté à l'annuaire.", "success");
            Router.navigateTo("/prestataires");
        };
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const c = DataStore.getPrestataires().find(x => x.id === id);
        if(!c) return Router.navigateTo("/prestataires");

        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Édition : ${c.societe}</h1>
                    <button id="delBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Société / Entité <span style="color:red">*</span></label>
                        <input id="societe" value="${c.societe}" required />
                    </div>
                    <div class="form-group">
                        <label>Type de contact</label>
                        <select id="type">
                            <option value="Prestataire IT / Cloud" ${c.type === "Prestataire IT / Cloud" ? "selected" : ""}>Prestataire IT / Cloud</option>
                            <option value="Assureur Cyber" ${c.type === "Assureur Cyber" ? "selected" : ""}>Assureur Cyber</option>
                            <option value="Client Majeur" ${c.type === "Client Majeur" ? "selected" : ""}>Client Majeur (à prévenir)</option>
                            <option value="Autorité" ${c.type === "Autorité" ? "selected" : ""}>Autorité (ANSSI, CNIL, Police)</option>
                            <option value="Autre" ${c.type === "Autre" ? "selected" : ""}>Autre</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Téléphone d'Urgence</label>
                            <input id="phone" value="${c.phone || ""}" />
                        </div>
                        <div class="form-group">
                            <label>Email de support/contact</label>
                            <input id="email" type="email" value="${c.email || ""}" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes / Procédure d'appel</label>
                        <textarea id="notes" style="min-height:80px;">${c.notes || ""}</textarea>
                    </div>
                    <div style="margin-top: 20px;">
                        <button id="saveBtn" style="background:var(--color-success);">Mettre à jour</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/prestataires");

        document.getElementById("saveBtn").onclick = () => {
            const soc = document.getElementById("societe").value.trim();
            if (!soc) return alert("Le nom de la société est obligatoire.");

            c.societe = soc;
            c.type = document.getElementById("type").value;
            c.phone = document.getElementById("phone").value.trim();
            c.email = document.getElementById("email").value.trim();
            c.notes = document.getElementById("notes").value.trim();

            DataStore.updatePrestataire(c);
            if(window.showToast) window.showToast("Contact mis à jour.", "success");
            Router.navigateTo("/prestataires");
        };

        document.getElementById("delBtn").onclick = () => {
            if(confirm("Confirmer la suppression de ce contact de l'annuaire ?")) {
                DataStore.deletePrestataire(id);
                Router.navigateTo("/prestataires");
            }
        };
    }

    return { renderList, renderDetail };
})();