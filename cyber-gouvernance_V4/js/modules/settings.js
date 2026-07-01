// Emplacement : js/modules/settings.js
// Nom du fichier : settings.js
// (Nouveau fichier à créer)

const SettingsModule = (() => {

    function render() {
        const app = document.getElementById("app");

        // Calcul du poids approximatif des données
        const rawData = DataStore.exportSnapshot();
        const kbSize = (new Blob([rawData]).size / 1024).toFixed(2);

        // Date de dernière sauvegarde (simulée via localStorage pour l'UI)
        const lastBackup = localStorage.getItem("cyber-last-backup") || "Aucune sauvegarde récente";

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Paramètres & Sauvegardes</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Gestion des données du navigateur (Mode hors-ligne)</p>
                    </div>
                </div>

                <div class="synthese-message info" style="margin-bottom: 2rem;">
                    Cette application stocke toutes vos données localement dans ce navigateur. <strong>Il est fortement recommandé d'exporter une sauvegarde régulièrement</strong> pour éviter toute perte de données en cas d'effacement de l'historique ou pour changer d'ordinateur.
                </div>

                <div class="dashboard-grid">

                    <div class="dashboard-card" style="border-top: 4px solid var(--color-success);">
                        <h3 style="font-size: 1.2rem; margin-bottom: 15px;">Exporter une sauvegarde</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px;">
                            Téléchargez l'intégralité de votre base de données (Clients, Exigences, Actions, Risques, Actifs) dans un fichier de secours sécurisé.
                        </p>

                        <div style="background: var(--bg-body); padding: 15px; border-radius: var(--radius); margin-bottom: 20px; font-size: 0.85rem;">
                            <strong>Poids actuel de la base :</strong> ${kbSize} Ko<br>
                            <strong>Dernier export :</strong> <span id="lastBackupDisplay">${lastBackup}</span>
                        </div>

                        <button id="exportJsonBtn" style="background-color: var(--color-success); width: 100%; justify-content: center;">
                            Télécharger la sauvegarde (.json)
                        </button>
                    </div>

                    <div class="dashboard-card" style="border-top: 4px solid var(--color-danger);">
                        <h3 style="font-size: 1.2rem; margin-bottom: 15px;">Restaurer les données</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px;">
                            Importez un fichier de sauvegarde précédemment généré. <br><br>
                            <span style="color: var(--color-danger); font-weight: bold;">Attention : Cette action effacera et remplacera DÉFINITIVEMENT toutes les données actuelles de ce navigateur.</span>
                        </p>

                        <div style="background: rgba(255, 107, 107, 0.1); border: 1px dashed var(--color-danger); padding: 15px; border-radius: var(--radius); margin-bottom: 20px; text-align: center;">
                            <input type="file" id="importJsonInput" accept=".json" style="display: none;" />
                            <button id="importJsonBtn" style="background-color: transparent; border: 1px solid var(--color-danger); color: var(--color-danger);">
                                Sélectionner un fichier .json
                            </button>
                            <div id="selectedFileName" style="margin-top: 10px; font-size: 0.8rem; font-weight: bold;"></div>
                        </div>

                        <button id="confirmRestoreBtn" style="background-color: var(--color-danger); width: 100%; justify-content: center; display: none;">
                            Confirmer la restauration
                        </button>
                    </div>

                </div>
            </section>
        `;

        /* =========================
           LOGIQUE D'EXPORT
        ========================== */
        document.getElementById("exportJsonBtn").onclick = () => {
            const jsonString = DataStore.exportSnapshot();
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const dateStr = new Date().toISOString().split('T')[0];
            const a = document.createElement("a");
            a.href = url;
            a.download = `Backup_CyberGRC_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Mettre à jour l'UI
            const now = new Date().toLocaleString('fr-FR');
            localStorage.setItem("cyber-last-backup", now);
            document.getElementById("lastBackupDisplay").textContent = now;

            if (window.showToast) window.showToast("Sauvegarde téléchargée avec succès.", "success");
        };

        /* =========================
           LOGIQUE D'IMPORT
        ========================== */
        const importInput = document.getElementById("importJsonInput");
        const importBtn = document.getElementById("importJsonBtn");
        const confirmBtn = document.getElementById("confirmRestoreBtn");
        let selectedFile = null;

        importBtn.onclick = () => importInput.click();

        importInput.onchange = (e) => {
            selectedFile = e.target.files[0];
            if (selectedFile) {
                document.getElementById("selectedFileName").textContent = "Fichier prêt : " + selectedFile.name;
                confirmBtn.style.display = "flex"; // Affiche le bouton de confirmation rouge
            }
        };

        confirmBtn.onclick = () => {
            if (!selectedFile) return;

            if (!confirm("Êtes-vous ABSOLUMENT SÛR de vouloir écraser toutes vos données actuelles avec ce fichier de sauvegarde ?")) {
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                const success = DataStore.importSnapshot(content);

                if (success) {
                    alert("Restauration réussie ! L'application va maintenant se recharger.");
                    // Recharger la page complètement pour forcer la réinitialisation de l'état global et du sélecteur client
                    window.location.reload();
                } else {
                    alert("Échec de la restauration : Le fichier sélectionné n'est pas un fichier de sauvegarde valide pour cette application.");
                    confirmBtn.style.display = "none";
                    document.getElementById("selectedFileName").textContent = "";
                    importInput.value = ""; // Reset
                }
            };
            reader.readAsText(selectedFile);
        };
    }

    return { render };
})();