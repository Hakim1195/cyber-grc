// Emplacement : js/modules/settings.js
// Nom du fichier : settings.js
//
// Gestion des données & sauvegardes :
//  - État du stockage (moteur, taille, quota, dernier enregistrement)
//  - Points de restauration versionnés (historique auto + manuel)
//  - Export / import d'un fichier de sauvegarde .json

const SettingsModule = (() => {

    /* ===== Utilitaires ===== */
    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    function formatBytes(bytes) {
        if (!bytes || bytes < 1024) return (bytes || 0) + " o";
        const units = ["Ko", "Mo", "Go"];
        let v = bytes / 1024, i = 0;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return v.toFixed(v >= 100 ? 0 : 1) + " " + units[i];
    }

    function formatDate(ts) {
        if (!ts) return "—";
        try { return new Date(ts).toLocaleString("fr-FR"); } catch (e) { return "—"; }
    }

    function render() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Paramètres & Sauvegardes</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Stockage local sécurisé (mode hors-ligne) — IndexedDB avec historique de restauration</p>
                    </div>
                </div>

                <!-- ÉTAT DU STOCKAGE -->
                <div class="dashboard-card" style="border-top: 4px solid var(--accent); margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1.15rem; margin-bottom: 15px;">État du stockage</h3>
                    <div id="storage-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
                        <div style="color: var(--text-muted);">Chargement…</div>
                    </div>
                    <div id="quota-wrap" style="margin-top: 1rem;"></div>
                </div>

                <div class="dashboard-grid" style="margin-bottom: 1.5rem;">
                    <!-- EXPORT -->
                    <div class="dashboard-card" style="border-top: 4px solid var(--color-success);">
                        <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Exporter une sauvegarde</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 20px;">
                            Téléchargez l'intégralité de la base (donneurs d'ordre, exigences, actions, risques, actifs, continuité, audits…) dans un fichier de secours.
                        </p>
                        <div style="background: var(--bg-body); padding: 15px; border-radius: var(--radius); margin-bottom: 20px; font-size: 0.85rem;">
                            <strong>Dernier export :</strong> <span id="lastBackupDisplay">${escapeHtml(localStorage.getItem("cyber-last-backup") || "Aucun export récent")}</span>
                        </div>
                        <button id="exportJsonBtn" style="background-color: var(--color-success); width: 100%; justify-content: center;">
                            Télécharger la sauvegarde (.json)
                        </button>
                    </div>

                    <!-- IMPORT -->
                    <div class="dashboard-card" style="border-top: 4px solid var(--color-danger);">
                        <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Restaurer depuis un fichier</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
                            Importez un fichier de sauvegarde .json précédemment généré.
                            <span style="color: var(--color-danger); font-weight: bold;">Cette action remplacera les données actuelles</span> (un point de restauration est créé automatiquement avant).
                        </p>
                        <div style="background: rgba(233,99,27,0.08); border: 1px dashed var(--color-danger); padding: 15px; border-radius: var(--radius); margin-bottom: 15px; text-align: center;">
                            <input type="file" id="importJsonInput" accept=".json,application/json" style="display: none;" />
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

                <!-- HISTORIQUE / POINTS DE RESTAURATION -->
                <div class="dashboard-card" style="border-top: 4px solid var(--primary);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px;">
                        <h3 style="font-size: 1.15rem; margin: 0;">Points de restauration</h3>
                        <button id="createBackupBtn">Créer un point maintenant</button>
                    </div>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
                        L'application enregistre automatiquement des versions de votre base. Vous pouvez revenir à n'importe quelle version.
                    </p>
                    <div id="backups-list">
                        <div style="color: var(--text-muted);">Chargement de l'historique…</div>
                    </div>
                </div>
            </section>
        `;

        /* ===== EXPORT ===== */
        document.getElementById("exportJsonBtn").onclick = () => {
            const jsonString = DataStore.exportSnapshot();
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const dateStr = new Date().toISOString().split("T")[0];
            const a = document.createElement("a");
            a.href = url;
            a.download = `Backup_CyberGRC_Dedienne_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            const now = new Date().toLocaleString("fr-FR");
            localStorage.setItem("cyber-last-backup", now);
            const disp = document.getElementById("lastBackupDisplay");
            if (disp) disp.textContent = now;
            if (window.showToast) window.showToast("Sauvegarde téléchargée avec succès.", "success");
        };

        /* ===== IMPORT ===== */
        const importInput = document.getElementById("importJsonInput");
        const importBtn = document.getElementById("importJsonBtn");
        const confirmBtn = document.getElementById("confirmRestoreBtn");
        let selectedFile = null;

        importBtn.onclick = () => importInput.click();
        importInput.onchange = (e) => {
            selectedFile = e.target.files[0];
            if (selectedFile) {
                document.getElementById("selectedFileName").textContent = "Fichier prêt : " + selectedFile.name;
                confirmBtn.style.display = "flex";
            }
        };

        confirmBtn.onclick = () => {
            if (!selectedFile) return;
            if (!confirm("Confirmer le remplacement des données actuelles par ce fichier de sauvegarde ?")) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const success = await DataStore.importSnapshot(event.target.result);
                if (success) {
                    alert("Restauration réussie. L'application va se recharger.");
                    window.location.reload();
                } else {
                    alert("Échec : le fichier sélectionné n'est pas une sauvegarde valide.");
                    confirmBtn.style.display = "none";
                    document.getElementById("selectedFileName").textContent = "";
                    importInput.value = "";
                }
            };
            reader.readAsText(selectedFile);
        };

        /* ===== POINT DE RESTAURATION MANUEL ===== */
        document.getElementById("createBackupBtn").onclick = async () => {
            const label = prompt("Nom du point de restauration :", "Point de restauration manuel");
            if (label === null) return;
            const ok = await DataStore.createManualBackup(label);
            if (window.showToast) window.showToast(ok ? "Point de restauration créé." : "Création impossible.", ok ? "success" : "error");
            loadBackups();
        };

        /* ===== CHARGEMENTS ASYNCHRONES ===== */
        loadStorageInfo();
        loadBackups();
    }

    /* ===== État du stockage (async) ===== */
    async function loadStorageInfo() {
        const el = document.getElementById("storage-stats");
        const quotaWrap = document.getElementById("quota-wrap");
        if (!el) return;
        try {
            const info = await DataStore.getStorageInfo();
            const totalItems = Object.values(info.counts).reduce((a, b) => a + b, 0);
            el.innerHTML = `
                ${statBox("Moteur de stockage", escapeHtml(info.engine))}
                ${statBox("Taille de la base", formatBytes(info.bytes))}
                ${statBox("Enregistrements", totalItems + " éléments")}
                ${statBox("Points de restauration", String(info.backupCount))}
                ${statBox("Dernier enregistrement", formatDate(info.lastSavedAt || info.updatedAt))}
            `;

            if (info.estimate && info.estimate.quota) {
                const used = info.estimate.usage || 0;
                const quota = info.estimate.quota;
                const pct = Math.min(100, Math.round((used / quota) * 100));
                quotaWrap.innerHTML = `
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px;">
                        Espace navigateur utilisé : <strong>${formatBytes(used)}</strong> sur ${formatBytes(quota)} (${pct}%)
                    </div>
                    <div class="progress-bar" style="margin: 0;">
                        <div class="progress-fill" style="width:${pct}%; background-color: ${pct > 85 ? 'var(--color-danger)' : 'var(--primary)'};"></div>
                    </div>
                `;
            } else {
                quotaWrap.innerHTML = "";
            }
        } catch (e) {
            el.innerHTML = `<div style="color: var(--color-danger);">Impossible de lire l'état du stockage.</div>`;
        }
    }

    function statBox(label, value) {
        return `
            <div style="background: var(--bg-body); padding: 12px 14px; border-radius: var(--radius);">
                <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">${label}</div>
                <div style="font-size: 1.05rem; font-weight: 700; margin-top: 4px;">${value}</div>
            </div>`;
    }

    /* ===== Historique des points de restauration (async) ===== */
    async function loadBackups() {
        const wrap = document.getElementById("backups-list");
        if (!wrap) return;
        let backups = [];
        try { backups = await DataStore.listBackups(); } catch (e) { backups = []; }

        if (!backups.length) {
            wrap.innerHTML = `<div style="color: var(--text-muted); font-size: 0.9rem;">Aucun point de restauration pour le moment.</div>`;
            return;
        }

        const rows = backups.map(b => {
            const typeLabel = b.type === "manual"
                ? `<span class="status" style="background:#e3f0ff; color: var(--accent);">Manuel</span>`
                : `<span class="status" style="background:var(--bg-body); color: var(--text-muted);">Auto</span>`;
            return `
                <tr>
                    <td>${formatDate(b.ts)}</td>
                    <td>${escapeHtml(b.label)}</td>
                    <td>${typeLabel}</td>
                    <td style="text-align:right; white-space:nowrap;">
                        <button class="restore-btn" data-id="${b.id}" style="padding:4px 10px; font-size:0.8rem;">Restaurer</button>
                        <button class="delete-backup-btn" data-id="${b.id}" style="padding:4px 10px; font-size:0.8rem; background: var(--color-gray);">Suppr.</button>
                    </td>
                </tr>`;
        }).join("");

        wrap.innerHTML = `
            <table class="data-table" style="margin-top: 0;">
                <thead>
                    <tr><th>Date</th><th>Libellé</th><th>Type</th><th style="text-align:right;">Actions</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

        wrap.querySelectorAll(".restore-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Restaurer cette version ? L'état actuel sera sauvegardé au préalable.")) return;
                const ok = await DataStore.restoreBackup(Number(btn.dataset.id));
                if (ok) {
                    alert("Version restaurée. L'application va se recharger.");
                    window.location.reload();
                } else if (window.showToast) {
                    window.showToast("Restauration impossible.", "error");
                }
            };
        });

        wrap.querySelectorAll(".delete-backup-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Supprimer ce point de restauration ?")) return;
                await DataStore.deleteBackup(Number(btn.dataset.id));
                loadBackups();
                loadStorageInfo();
            };
        });
    }

    return { render };
})();
