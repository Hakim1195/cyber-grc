// Emplacement : js/modules/clients.js
// Nom du fichier : clients.js
// (N'oubliez pas d'ajouter <script src="js/modules/clients.js"></script> dans index.html)

const ClientsModule = (() => {

    /* =========================
       LISTE DES CLIENTS
    ========================== */
    function renderList() {
        const clients = DataStore.getClients();
        const exigences = DataStore.getExigences();
        const app = document.getElementById("app");

        const rows = clients.map(c => {
            const nbExigences = exigences.filter(e => e.client_id === c.id).length;
            return `
                <tr class="clickable-row" data-id="${c.id}">
                    <td><strong>${c.nom}</strong></td>
                    <td>${c.secteur || "-"}</td>
                    <td><span class="badge" style="background: var(--primary); color: white;">${nbExigences} Exigence(s)</span></td>
                </tr>
            `;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>🏢 Donneurs d'ordre (Clients)</h1>
                    <button id="addClientBtn">➕ Ajouter un client</button>
                </div>

                <div class="synthese-message info" style="font-size: 0.9rem; padding: 10px;">
                    💡 Gérez ici vos différents donneurs d'ordre ou périmètres. Vous pourrez ensuite importer et rattacher des exigences spécifiques à chacun d'eux.
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nom du Donneur d'ordre</th>
                            <th>Secteur / Description</th>
                            <th>Volume d'exigences</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='3' style='text-align:center;'>Aucun client défini pour le moment.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        const addBtn = document.getElementById("addClientBtn");
        if (addBtn) addBtn.onclick = renderCreate;

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/clients/${row.dataset.id}`);
        });
    }

    /* =========================
       CREATION CLIENT
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouveau Donneur d'ordre</h1>

                <div class="dashboard-card" style="max-width: 600px;">
                    <div class="form-group">
                        <label>Nom du client / périmètre <span style="color:red">*</span></label>
                        <input id="nom" placeholder="Ex: Airbus, Thales, Safran..." required />
                    </div>

                    <div class="form-group">
                        <label>Secteur d'activité ou Description</label>
                        <input id="secteur" placeholder="Ex: Aéronautique, Spatial, Défense..." />
                    </div>

                    <div style="margin-top: 20px;">
                        <button id="save">💾 Créer le client</button>
                        <button id="cancel" style="margin-left: 10px;">❌ Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();

            if (!nom) {
                alert("Le nom du client est obligatoire.");
                return;
            }

            DataStore.addClient({
                id: "CLI-" + Date.now(),
                nom: nom,
                secteur: document.getElementById("secteur").value.trim()
            });

            Router.navigateTo("/clients");
            if (window.showToast) window.showToast("Client créé avec succès.", "success");
        };

        document.getElementById("cancel").onclick = () => {
            Router.navigateTo("/clients");
        };
    }

    /* =========================
       FICHE CLIENT (EDITION / SUPPRESSION)
    ========================== */
    function renderDetail(id) {
        const client = DataStore.getClientById(id);
        const exigences = DataStore.getExigencesByClient(id);
        const app = document.getElementById("app");

        if (!client) {
            app.innerHTML = `
                <section class="page">
                    <h1>Erreur</h1>
                    <p>Le client demandé est introuvable.</p>
                    <button onclick="Router.navigateTo('/clients')">Retour</button>
                </section>`;
            return;
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>🏢 ${client.nom}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">🗑️ Supprimer</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card">
                        <h3>Détails du Donneur d'ordre</h3>
                        
                        <div class="form-group">
                            <label>Nom <span style="color:red">*</span></label>
                            <input id="nom" value="${client.nom}" required />
                        </div>

                        <div class="form-group">
                            <label>Secteur / Description</label>
                            <input id="secteur" value="${client.secteur || ""}" />
                        </div>

                        <button id="saveBtn">💾 Mettre à jour</button>
                    </div>

                    <div class="dashboard-card">
                        <h3>Statistiques</h3>
                        <div class="synthese-message info">
                            <strong>${exigences.length}</strong> exigence(s) rattachée(s) à ce client.
                        </div>
                        <button onclick="Router.navigateTo('/exigences')" style="width: 100%; margin-top: 15px; background: white; color: var(--primary); border: 1px solid var(--border);">
                            Voir les exigences
                        </button>
                    </div>
                </div>
            </section>
        `;

        /* ===== Mettre à jour ===== */
        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) {
                alert("Le nom est obligatoire.");
                return;
            }

            client.nom = nom;
            client.secteur = document.getElementById("secteur").value.trim();

            DataStore.updateClient(client);
            if (window.showToast) window.showToast("Mise à jour effectuée.", "success");
            Router.navigateTo("/clients");
        };

        /* ===== Supprimer ===== */
        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("⚠️ ATTENTION : Supprimer ce client supprimera également TOUTES les exigences qui lui sont rattachées. Continuer ?")) {
                DataStore.deleteClient(client.id);
                if (window.showToast) window.showToast("Client et exigences liées supprimés.", "success");
                Router.navigateTo("/clients");
            }
        };
    }

    return {
        renderList,
        renderDetail
    };
})();