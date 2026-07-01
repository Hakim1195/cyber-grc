// Emplacement : js/modules/crise.js
// Nom du fichier : crise.js

const CriseModule = (() => {

    /* =========================
       LISTE DES MEMBRES (CELLULE DE CRISE)
    ========================== */
    function renderList() {
        const membres = DataStore.getCriseMembres();
        const app = document.getElementById("app");

        // Tri par ordre d'importance (simplifié)
        const roleOrder = {
            "Directeur de crise (Décisionnel)": 1,
            "Responsable IT / SSI (Opérationnel)": 2,
            "Responsable Communication": 3,
            "Responsable Juridique / RH": 4,
            "Expert technique (Interne/Externe)": 5,
            "Autre": 6
        };

        const sortedMembres = [...membres].sort((a, b) => {
            return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
        });

        const rows = sortedMembres.map(m => `
            <tr class="clickable-row" data-id="${m.id}">
                <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${m.id}">
                </td>
                <td><strong style="color: var(--primary);">${m.role}</strong></td>
                <td><strong>${m.nom}</strong></td>
                <td>${m.telephone || "-"}</td>
                <td>${m.email ? `<a href="mailto:${m.email}" onclick="event.stopPropagation();">${m.email}</a>` : "-"}</td>
                <td style="font-size: 0.85rem; color: var(--text-muted);">${m.suppleant || "Aucun"}</td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Annuaire de la Cellule de Crise</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (Continuité d'activité)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button class="no-print" onclick="window.print()" style="background-color: var(--primary);">Imprimer l'annuaire</button>
                        <button id="addMembreBtn">Ajouter un membre</button>
                    </div>
                </div>

                <div class="synthese-message warning no-print" style="font-size: 0.9rem; padding: 10px; margin-bottom: 20px;">
                    <strong>En cas de crise majeure (Ransomware, Incendie) :</strong> Le SI peut être indisponible. Pensez à imprimer régulièrement cet annuaire et à le conserver dans un lieu sécurisé (ex: Coffre-fort, ou au domicile du Directeur de crise).
                </div>

                <div class="dashboard-card" style="padding: 0; overflow: hidden;">
                    <table class="data-table" style="margin-top: 0; box-shadow: none; border-radius: 0;">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;" class="no-print"><input type="checkbox" id="selectAllCb"></th>
                                <th>Rôle dans la crise</th>
                                <th>Nom & Prénom</th>
                                <th>Téléphone (Urgence)</th>
                                <th>Email (Secours/Perso)</th>
                                <th>Suppléant (N°2)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || "<tr><td colspan='6' style='text-align:center; padding: 2rem;'>La cellule de crise n'est pas encore constituée.</td></tr>"}
                        </tbody>
                    </table>
                </div>
            </section>
        `;

        document.getElementById("addMembreBtn").onclick = renderCreate;

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
                if (confirm(`Confirmer la suppression de ${checkedIds.length} membre(s) de la cellule de crise ?`)) {
                    checkedIds.forEach(id => DataStore.deleteCriseMembre(id));
                    if (window.showToast) window.showToast(`${checkedIds.length} membre(s) retiré(s).`, "success");
                    renderList();
                }
            });
        }

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/crise/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouveau membre de la cellule</h1>

                <div class="dashboard-card" style="max-width: 800px;">
                    <div class="form-group">
                        <label>Rôle assigné en cas de crise <span style="color:red">*</span></label>
                        <select id="role">
                            <option value="Directeur de crise (Décisionnel)">Directeur de crise (Pilote / Tranche les décisions)</option>
                            <option value="Responsable IT / SSI (Opérationnel)">Responsable IT / SSI (Coordination technique)</option>
                            <option value="Responsable Communication">Responsable Communication (Interne & Presse)</option>
                            <option value="Responsable Juridique / RH">Responsable Juridique / RH (Déclarations CNIL, Personnel)</option>
                            <option value="Expert technique (Interne/Externe)">Expert technique (Prestataire, Forensics, Réseau...)</option>
                            <option value="Autre">Autre (Logistique, Sécurité physique...)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Nom & Prénom <span style="color:red">*</span></label>
                        <input id="nom" placeholder="Ex: Jean DUPONT" required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Téléphone (Urgence / Portable)</label>
                            <input id="telephone" type="tel" placeholder="06 XX XX XX XX" />
                        </div>
                        <div class="form-group">
                            <label>Email de secours</label>
                            <input id="email" type="email" placeholder="Adresse alternative (si messagerie pro HS)" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Suppléant (Qui appeler si cette personne est injoignable ?)</label>
                        <input id="suppleant" placeholder="Nom et Téléphone du suppléant" />
                    </div>

                    <div class="form-group">
                        <label>Notes (Responsabilités spécifiques)</label>
                        <textarea id="notes" placeholder="Ex: Doit appeler l'assureur cyber dans les 48h, a les clés de la salle serveur..."></textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Ajouter à l'annuaire</button>
                        <button id="cancelBtn" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            DataStore.addCriseMembre({
                id: "CRISE-" + Date.now(),
                role: document.getElementById("role").value,
                nom: nom,
                telephone: document.getElementById("telephone").value.trim(),
                email: document.getElementById("email").value.trim(),
                suppleant: document.getElementById("suppleant").value.trim(),
                notes: document.getElementById("notes").value.trim()
            });

            if(window.showToast) window.showToast("Membre ajouté à la cellule.", "success");
            Router.navigateTo("/crise");
        };

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/crise");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const membre = DataStore.getCriseMembreById(id);
        const app = document.getElementById("app");

        if (!membre) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Membre introuvable.</p><button onclick="Router.navigateTo('/crise')">Retour</button></section>`;
            return;
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Fiche Contact : ${membre.nom}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Retirer le membre</button>
                </div>

                <div class="dashboard-card" style="max-width: 800px;">
                    <div class="form-group">
                        <label>Rôle assigné en cas de crise <span style="color:red">*</span></label>
                        <select id="role">
                            <option value="Directeur de crise (Décisionnel)" ${membre.role === "Directeur de crise (Décisionnel)" ? "selected" : ""}>Directeur de crise (Pilote / Tranche les décisions)</option>
                            <option value="Responsable IT / SSI (Opérationnel)" ${membre.role === "Responsable IT / SSI (Opérationnel)" ? "selected" : ""}>Responsable IT / SSI (Coordination technique)</option>
                            <option value="Responsable Communication" ${membre.role === "Responsable Communication" ? "selected" : ""}>Responsable Communication (Interne & Presse)</option>
                            <option value="Responsable Juridique / RH" ${membre.role === "Responsable Juridique / RH" ? "selected" : ""}>Responsable Juridique / RH (Déclarations CNIL, Personnel)</option>
                            <option value="Expert technique (Interne/Externe)" ${membre.role === "Expert technique (Interne/Externe)" ? "selected" : ""}>Expert technique (Prestataire, Forensics, Réseau...)</option>
                            <option value="Autre" ${membre.role === "Autre" ? "selected" : ""}>Autre (Logistique, Sécurité physique...)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Nom & Prénom <span style="color:red">*</span></label>
                        <input id="nom" value="${membre.nom}" required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div class="form-group">
                            <label>Téléphone (Urgence / Portable)</label>
                            <input id="telephone" type="tel" value="${membre.telephone || ""}" />
                        </div>
                        <div class="form-group">
                            <label>Email de secours</label>
                            <input id="email" type="email" value="${membre.email || ""}" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Suppléant (Qui appeler si cette personne est injoignable ?)</label>
                        <input id="suppleant" value="${membre.suppleant || ""}" />
                    </div>

                    <div class="form-group">
                        <label>Notes (Responsabilités spécifiques)</label>
                        <textarea id="notes">${membre.notes || ""}</textarea>
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Mettre à jour</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            membre.role = document.getElementById("role").value;
            membre.nom = nom;
            membre.telephone = document.getElementById("telephone").value.trim();
            membre.email = document.getElementById("email").value.trim();
            membre.suppleant = document.getElementById("suppleant").value.trim();
            membre.notes = document.getElementById("notes").value.trim();

            DataStore.updateCriseMembre(membre);
            if(window.showToast) window.showToast("Fiche contact mise à jour.", "success");
            Router.navigateTo("/crise");
        };

        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("Confirmer le retrait de ce membre de la cellule de crise ?")) {
                DataStore.deleteCriseMembre(membre.id);
                Router.navigateTo("/crise");
            }
        };
    }

    return { renderList, renderDetail };
})();