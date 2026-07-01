// Emplacement : js/modules/settings.js
// Nom du fichier : settings.js
//
// Gestion des données & sauvegardes :
//  - État du stockage (moteur, quota, persistance, dernier enregistrement / export)
//  - Export chiffré (recommandé) ou en clair ; rappel d'export paramétrable
//  - Import robuste : validation, aperçu, Remplacer / Fusionner
//  - Points de restauration versionnés (historique auto + manuel)

const SettingsModule = (() => {

    const FIELD_LABELS = {
        clients: "Donneurs d'ordre", exigences: "Exigences", actions: "Actions",
        risques: "Risques", actifs: "Actifs", processus: "Processus (BIA)",
        crise: "Cellule de crise", scenarios_pra: "Scénarios PRA", tests_pra: "Tests PRA",
        prestataires: "Prestataires", mco_actions: "Actions MCO", audits: "Audits", revues: "Revues"
    };

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
        const cryptoOk = typeof CryptoService !== "undefined" && CryptoService.available();

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Paramètres & Sauvegardes</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Stockage local (mode hors-ligne) — vos données ne quittent jamais ce navigateur</p>
                    </div>
                </div>

                <!-- ÉTAT DU STOCKAGE -->
                <div class="dashboard-card" style="border-top: 4px solid var(--accent); margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1.15rem; margin-bottom: 15px;">État du stockage</h3>
                    <div id="storage-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 1rem;">
                        <div style="color: var(--text-muted);">Chargement…</div>
                    </div>
                    <div id="quota-wrap" style="margin-top: 1rem;"></div>
                </div>

                <!-- SÉCURITÉ & CHIFFREMENT -->
                <div class="dashboard-card" style="border-top: 4px solid var(--primary); margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Sécurité & chiffrement</h3>
                    <div id="security-body"><div style="color: var(--text-muted);">Chargement…</div></div>
                </div>

                <div class="dashboard-grid" style="margin-bottom: 1.5rem;">
                    <!-- EXPORT -->
                    <div class="dashboard-card" style="border-top: 4px solid var(--color-success);">
                        <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Exporter une sauvegarde</h3>
                        <div class="help-note" style="margin-bottom: 15px;">
                            Le fichier contient des données sensibles (risques, vulnérabilités, plans de continuité).
                            <strong>Chiffrez-le</strong> : posé sur un partage réseau ou une clé USB, un export en clair est directement exploitable par un attaquant.
                        </div>
                        <div style="background: var(--bg-body); padding: 12px 15px; border-radius: var(--radius); margin-bottom: 18px; font-size: 0.85rem;">
                            <strong>Dernier export :</strong> <span id="lastExportDisplay">${escapeHtml(BackupService.getLastExportDisplay())}</span>
                        </div>
                        <button id="exportEncBtn" style="background-color: var(--color-success); width: 100%; justify-content: center;" ${cryptoOk ? "" : "disabled title='Chiffrement indisponible (contexte non sécurisé)'"}>
                            Télécharger la sauvegarde chiffrée (.json)
                        </button>
                        <button id="exportPlainBtn" style="background: transparent; color: var(--text-muted); border: 1px solid var(--border); width: 100%; justify-content: center; margin-top: 10px;">
                            Exporter en clair (non chiffré)
                        </button>
                        <div style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
                            Me rappeler d'exporter tous les
                            <input id="reminderDays" type="number" min="1" max="365" value="${BackupService.getReminderDays()}" style="width: 60px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px;" /> jours.
                        </div>
                    </div>

                    <!-- IMPORT -->
                    <div class="dashboard-card" style="border-top: 4px solid var(--color-danger);">
                        <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Importer une sauvegarde</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
                            Chargez un fichier .json (chiffré ou non). Le contenu est validé, puis vous choisissez de <strong>remplacer</strong> ou de <strong>fusionner</strong>. Un point de restauration est créé avant toute modification.
                        </p>
                        <div style="text-align: center; margin-bottom: 10px;">
                            <input type="file" id="importInput" accept=".json,application/json" style="display: none;" />
                            <button id="importBtn" style="background-color: transparent; border: 1px solid var(--color-danger); color: var(--color-danger);">
                                Sélectionner un fichier .json
                            </button>
                        </div>
                        <div id="import-recap"></div>
                    </div>
                </div>

                <!-- HISTORIQUE / POINTS DE RESTAURATION -->
                <div class="dashboard-card" style="border-top: 4px solid var(--primary);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px;">
                        <h3 style="font-size: 1.15rem; margin: 0;">Points de restauration</h3>
                        <button id="createBackupBtn">Créer un point maintenant</button>
                    </div>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
                        Versions internes horodatées de votre base. Revenez à n'importe quelle version en un clic.
                    </p>
                    <div id="backups-list"><div style="color: var(--text-muted);">Chargement…</div></div>
                </div>
            </section>
        `;

        wireExport();
        wireImport();
        document.getElementById("reminderDays").onchange = (e) => {
            BackupService.setReminderDays(e.target.value);
            if (window.showToast) window.showToast("Fréquence de rappel mise à jour.", "info");
        };
        document.getElementById("createBackupBtn").onclick = async () => {
            const label = prompt("Nom du point de restauration :", "Point de restauration manuel");
            if (label === null) return;
            const ok = await DataStore.createManualBackup(label);
            if (window.showToast) window.showToast(ok ? "Point de restauration créé." : "Création impossible.", ok ? "success" : "error");
            loadBackups();
        };

        loadStorageInfo();
        loadBackups();
        renderSecurity();
    }

    /* ===== Sécurité & chiffrement (opt-in) ===== */
    function renderSecurity() {
        const el = document.getElementById("security-body");
        if (!el) return;
        const cryptoOk = typeof CryptoService !== "undefined" && CryptoService.available();
        const vaultReady = typeof Vault !== "undefined";

        if (!cryptoOk || !vaultReady) {
            el.innerHTML = `<div class="help-note">Chiffrement indisponible dans ce contexte. Ouvrez l'application via <strong>https</strong>, <strong>localhost</strong> ou un fichier local pour activer la protection par mot de passe.</div>`;
            return;
        }

        if (!Vault.isConfigured()) {
            el.innerHTML = `
                <div class="help-note" style="margin-bottom: 15px;">
                    Par défaut, vos données sont stockées <strong>en clair</strong> dans ce navigateur. Activez une protection par mot de passe pour les <strong>chiffrer (AES-256)</strong> et exiger un déverrouillage à l'ouverture.
                    <br>Le mot de passe n'est jamais enregistré et <strong>ne peut pas être récupéré</strong>.
                </div>
                <button id="sec-enable" style="background: var(--primary);">Activer la protection par mot de passe</button>`;
            document.getElementById("sec-enable").onclick = enableProtection;
        } else {
            el.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                    <span class="status" style="background:#e6f4ea; color:var(--color-success);">Protection activée</span>
                    <span style="color: var(--text-muted); font-size: 0.9rem;">Données chiffrées au repos (AES-256), auto-verrouillage après 15 min.</span>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button id="sec-lock" style="background: var(--primary);">Verrouiller maintenant</button>
                    <button id="sec-change" style="background: var(--accent);">Changer le mot de passe</button>
                    <button id="sec-disable" style="background: var(--color-gray);">Désactiver la protection</button>
                </div>`;
            document.getElementById("sec-lock").onclick = () => Vault.lock();
            document.getElementById("sec-change").onclick = changeProtection;
            document.getElementById("sec-disable").onclick = disableProtection;
        }
    }

    async function enableProtection() {
        const p1 = prompt("Choisissez un mot de passe pour protéger l'application :");
        if (p1 === null) return;
        if (p1.length < 8) { alert("8 caractères minimum."); return; }
        const p2 = prompt("Confirmez le mot de passe :");
        if (p2 === null) return;
        if (p1 !== p2) { alert("Les mots de passe ne correspondent pas."); return; }
        try {
            const dek = await Vault.setup(p1);
            await DataStore.enableEncryption(dek);
            alert("Protection activée. Vos données sont désormais chiffrées.");
            window.location.reload();
        } catch (e) {
            alert("Échec de l'activation : " + e.message);
        }
    }

    async function changeProtection() {
        const oldP = prompt("Mot de passe actuel :");
        if (oldP === null) return;
        const p1 = prompt("Nouveau mot de passe :");
        if (p1 === null) return;
        if (p1.length < 8) { alert("8 caractères minimum."); return; }
        const p2 = prompt("Confirmez le nouveau mot de passe :");
        if (p2 === null) return;
        if (p1 !== p2) { alert("Les mots de passe ne correspondent pas."); return; }
        const ok = await Vault.changePassphrase(oldP, p1);
        alert(ok ? "Mot de passe modifié." : "Mot de passe actuel incorrect.");
    }

    async function disableProtection() {
        const pass = prompt("Confirmez votre mot de passe pour désactiver la protection :");
        if (pass === null) return;
        const ok = await Vault.verify(pass);
        if (!ok) { alert("Mot de passe incorrect."); return; }
        if (!confirm("Désactiver la protection ? Les données seront réécrites EN CLAIR dans ce navigateur.")) return;
        await DataStore.disableEncryption();
        Vault.removeVault();
        alert("Protection désactivée.");
        window.location.reload();
    }

    /* ===== Export ===== */
    function wireExport() {
        const encBtn = document.getElementById("exportEncBtn");
        if (encBtn) encBtn.onclick = async () => {
            const p1 = prompt("Choisissez un mot de passe pour chiffrer la sauvegarde :");
            if (p1 === null) return;
            if (p1.length < 8) { alert("8 caractères minimum."); return; }
            const p2 = prompt("Confirmez le mot de passe :");
            if (p2 === null) return;
            if (p1 !== p2) { alert("Les mots de passe ne correspondent pas."); return; }
            try {
                await BackupService.exportEncrypted(p1);
                refreshLastExport();
                if (window.showToast) window.showToast("Sauvegarde chiffrée téléchargée.", "success");
            } catch (e) {
                alert("Échec du chiffrement : " + e.message);
            }
        };
        const plainBtn = document.getElementById("exportPlainBtn");
        if (plainBtn) plainBtn.onclick = () => {
            if (!confirm("Exporter EN CLAIR ? Le fichier sera lisible par quiconque y a accès. Préférez l'export chiffré.")) return;
            BackupService.exportPlain();
            refreshLastExport();
            if (window.showToast) window.showToast("Sauvegarde (non chiffrée) téléchargée.", "success");
        };
    }
    function refreshLastExport() {
        const el = document.getElementById("lastExportDisplay");
        if (el) el.textContent = BackupService.getLastExportDisplay();
    }

    /* ===== Import (validation + aperçu + Remplacer/Fusionner) ===== */
    function wireImport() {
        const input = document.getElementById("importInput");
        const btn = document.getElementById("importBtn");
        btn.onclick = () => input.click();
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => handleImportText(ev.target.result, file.name);
            reader.readAsText(file);
            input.value = "";
        };
    }

    async function handleImportText(text, filename, password) {
        const recap = document.getElementById("import-recap");
        let res = await DataStore.parseImport(text, password);

        if (res.needPassword) {
            const pass = prompt("Ce fichier est chiffré. Saisissez son mot de passe :");
            if (pass === null) return;
            return handleImportText(text, filename, pass);
        }
        if (res.badPassword) { recap.innerHTML = errorBox("Mot de passe incorrect pour ce fichier chiffré."); return; }
        if (res.invalid || !res.ok) { recap.innerHTML = errorBox("Fichier invalide : ce n'est pas une sauvegarde Cyber GRC exploitable."); return; }

        const rows = Object.keys(FIELD_LABELS)
            .filter(f => (res.summary[f] || 0) > 0)
            .map(f => `<tr><td>${FIELD_LABELS[f]}</td><td style="text-align:right;font-weight:700;">${res.summary[f]}</td></tr>`)
            .join("") || `<tr><td colspan="2" style="color:var(--text-muted);">Sauvegarde vide</td></tr>`;

        recap.innerHTML = `
            <div style="background: var(--bg-body); border-radius: var(--radius); padding: 12px; margin-top: 5px;">
                <div style="font-size: 0.85rem; margin-bottom: 8px;">
                    <strong>${escapeHtml(filename)}</strong>
                    ${res.encrypted ? '<span class="status" style="background:#e6f4ea;color:var(--color-success);margin-left:6px;">déchiffré</span>' : ''}
                    ${res.meta && res.meta.createdAt ? `<span style="color:var(--text-muted);margin-left:6px;">${formatDate(Date.parse(res.meta.createdAt))}</span>` : ''}
                </div>
                <table class="data-table" style="margin:0;"><tbody>${rows}</tbody></table>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button id="imp-replace" style="background: var(--color-danger); flex:1; justify-content:center;">Remplacer tout</button>
                    <button id="imp-merge" style="background: var(--primary); flex:1; justify-content:center;">Fusionner</button>
                    <button id="imp-cancel" style="background: var(--color-gray); justify-content:center;">Annuler</button>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 8px;">
                    Remplacer : écrase la base actuelle. Fusionner : ajoute les éléments absents (par identifiant), sans écraser l'existant.
                </div>
            </div>
        `;
        document.getElementById("imp-cancel").onclick = () => { recap.innerHTML = ""; };
        document.getElementById("imp-replace").onclick = async () => {
            if (!confirm("Remplacer DÉFINITIVEMENT les données actuelles ? (un point de restauration est créé avant)")) return;
            await DataStore.applyImport(res.payload, "replace");
            alert("Import terminé. L'application va se recharger.");
            window.location.reload();
        };
        document.getElementById("imp-merge").onclick = async () => {
            const r = await DataStore.applyImport(res.payload, "merge");
            const total = r.added ? Object.values(r.added).reduce((a, b) => a + b, 0) : 0;
            alert(`Fusion terminée : ${total} élément(s) ajouté(s). L'application va se recharger.`);
            window.location.reload();
        };
    }

    function errorBox(msg) {
        return `<div style="background:#fdecea;color:var(--color-danger);border-radius:var(--radius);padding:12px;margin-top:5px;font-size:0.9rem;">${escapeHtml(msg)}</div>`;
    }

    /* ===== État du stockage ===== */
    async function loadStorageInfo() {
        const el = document.getElementById("storage-stats");
        const quotaWrap = document.getElementById("quota-wrap");
        if (!el) return;
        try {
            const info = await DataStore.getStorageInfo();
            const totalItems = Object.values(info.counts).reduce((a, b) => a + b, 0);
            let persisted = null;
            try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) { /* ignore */ }

            el.innerHTML = `
                ${statBox("Moteur", escapeHtml(info.engine))}
                ${statBox("Chiffrement", info.encrypted ? "Activé (AES-256)" : "Désactivé")}
                ${statBox("Taille de la base", formatBytes(info.bytes))}
                ${statBox("Enregistrements", totalItems + " éléments")}
                ${statBox("Stockage persistant", persisted === null ? "Inconnu" : (persisted ? "Accordé" : "Non accordé"))}
                ${statBox("Points de restauration", String(info.backupCount))}
                ${statBox("Dernier enregistrement", formatDate(info.lastSavedAt || info.updatedAt))}
            `;

            if (info.estimate && info.estimate.quota) {
                const used = info.estimate.usage || 0;
                const pct = Math.min(100, Math.round((used / info.estimate.quota) * 100));
                quotaWrap.innerHTML = `
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px;">
                        Espace navigateur utilisé : <strong>${formatBytes(used)}</strong> sur ${formatBytes(info.estimate.quota)} (${pct}%)
                    </div>
                    <div class="progress-bar" style="margin: 0;">
                        <div class="progress-fill" style="width:${pct}%; background-color: ${pct > 85 ? 'var(--color-danger)' : 'var(--primary)'};"></div>
                    </div>`;
            } else { quotaWrap.innerHTML = ""; }
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

    /* ===== Historique ===== */
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
                <thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th style="text-align:right;">Actions</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
        wrap.querySelectorAll(".restore-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Restaurer cette version ? L'état actuel sera sauvegardé au préalable.")) return;
                const ok = await DataStore.restoreBackup(Number(btn.dataset.id));
                if (ok) { alert("Version restaurée. L'application va se recharger."); window.location.reload(); }
                else if (window.showToast) window.showToast("Restauration impossible.", "error");
            };
        });
        wrap.querySelectorAll(".delete-backup-btn").forEach(btn => {
            btn.onclick = async () => {
                if (!confirm("Supprimer ce point de restauration ?")) return;
                await DataStore.deleteBackup(Number(btn.dataset.id));
                loadBackups(); loadStorageInfo();
            };
        });
    }

    return { render };
})();
