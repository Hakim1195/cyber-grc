// Emplacement : js/modules/settings.js
// Nom du fichier : settings.js
//
// Données & échanges de fichier.
//
// ⚠️ Cet écran a été rectifié à la porte S2 (constats B-3 et m-7) : il annonçait
// encore le monde d'avant la bascule client/serveur — « vos données ne quittent
// jamais ce navigateur », une protection par mot de passe retirée depuis, et
// « un point de restauration est créé avant toute modification » à l'endroit
// exact du geste le plus destructeur de l'application. Un écran qui rassure à
// tort est plus dangereux qu'un écran qui plante.
//
//  - État de la liaison au serveur et volume détenu
//  - Export `grc-backup` (chiffré ou en clair) — FORMAT D'ÉCHANGE (§2.6),
//    et non plus une sauvegarde : celle-ci est faite par le serveur (§1.8)
//  - Import : validation, aperçu, **fusion** (le remplacement est refusé, B-3)

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
                        <h1>Paramètres & données</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Vos données sont enregistrées sur le serveur de votre filiale, qui les sauvegarde. Cet écran sert aux échanges de fichier.</p>
                    </div>
                </div>

                <!-- ÉTAT DU STOCKAGE -->
                <div class="dashboard-card" style="border-top: 4px solid var(--accent); margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1.15rem; margin-bottom: 15px;">État de la liaison au serveur</h3>
                    <div id="storage-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 1rem;">
                        <div style="color: var(--text-muted);">Chargement…</div>
                    </div>
                </div>

                <!-- SÉCURITÉ & CHIFFREMENT -->
                <div class="dashboard-card" style="border-top: 4px solid var(--primary); margin-bottom: 1.5rem;">
                    <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Sécurité</h3>
                    <div id="security-body"><div style="color: var(--text-muted);">Chargement…</div></div>
                </div>

                <div class="dashboard-grid" style="margin-bottom: 1.5rem;">
                    <!-- EXPORT -->
                    <div class="dashboard-card" style="border-top: 4px solid var(--color-success);">
                        <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Exporter un fichier d'échange</h3>
                        <div class="help-note" style="margin-bottom: 15px;">
                            Le fichier contient des données sensibles (risques, vulnérabilités, plans de continuité).
                            <strong>Chiffrez-le</strong> : posé sur un partage réseau ou une clé USB, un export en clair est directement exploitable par un attaquant.
                        </div>
                        <div style="background: var(--bg-body); padding: 12px 15px; border-radius: var(--radius); margin-bottom: 18px; font-size: 0.85rem;">
                            <strong>Dernier export :</strong> <span id="lastExportDisplay">${escapeHtml(BackupService.getLastExportDisplay())}</span>
                        </div>
                        <button id="exportEncBtn" style="background-color: var(--color-success); width: 100%; justify-content: center;" ${cryptoOk ? "" : "disabled title='Chiffrement indisponible (contexte non sécurisé)'"}>
                            Télécharger le fichier chiffré (.json)
                        </button>
                        <button id="exportPlainBtn" style="background: transparent; color: var(--text-muted); border: 1px solid var(--border); width: 100%; justify-content: center; margin-top: 10px;">
                            Exporter en clair (non chiffré)
                        </button>
                        <div style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
                            Un export est une extraction complète de la filiale : il sort de la machine.
                            Ne le produisez que pour un échange identifié.
                        </div>
                    </div>

                    <!-- IMPORT -->
                    <div class="dashboard-card" style="border-top: 4px solid var(--color-danger);">
                        <h3 style="font-size: 1.15rem; margin-bottom: 15px;">Importer un fichier d'échange</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px;">
                            Chargez un fichier .json (chiffré ou non) — reprise d'une filiale déjà équipée de l'ancienne version, ou données remises par une filiale. Le contenu est validé, puis appliqué <strong>en une seule transaction</strong> sur le serveur : il réussit entièrement, ou rien n'est modifié.
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

                <!-- SAUVEGARDE — assurée par le serveur (PLAN_SERVEUR §1.8).
                     Les points de restauration NAVIGATEUR ont disparu avec la bascule ;
                     ce panneau en listait qui n'existent plus (constat m-7). -->
                <div class="dashboard-card" style="border-top: 4px solid var(--primary);">
                    <h3 style="font-size: 1.15rem; margin: 0 0 15px;">Sauvegarde et restauration</h3>
                    <div class="help-note">
                        Elles sont assurées par le serveur, sans action de votre part : les journaux de
                        transactions sont archivés en continu (perte maximale de quelques minutes) et la
                        machine est sauvegardée chaque jour. Une restauration se demande à votre exploitant.
                        <br><br>
                        L'export ci-dessus n'est <strong>pas</strong> une sauvegarde : c'est un format
                        d'échange, pour reprendre les données d'une filiale ou les lui remettre.
                    </div>
                </div>
            </section>
        `;

        wireExport();
        wireImport();
        loadStorageInfo();
        renderSecurity();
    }

    /* ===== Sécurité =====
       Le coffre du navigateur et le chiffrement au repos côté poste ont été
       retirés à la bascule serveur (`PLAN_SERVEUR` §1.9 : le chiffrement au
       repos est celui du disque de la VM). Cet écran proposait encore de les
       activer, et le bouton échouait — constat m-7 de la porte S2. Il décrit
       désormais l'état réel. */
    function renderSecurity() {
        const el = document.getElementById("security-body");
        if (!el) return;
        const session = (typeof Session !== "undefined") ? Session.courante() : null;
        const provisoire = session && session.provisoire;
        el.innerHTML = `
            <div class="help-note" style="margin-bottom: 15px;">
                Vos données ne sont plus stockées sur ce poste : elles vivent sur le serveur de votre
                filiale, dont le disque est chiffré, et elles y sont sauvegardées en continu.
                La protection par mot de passe du navigateur a donc été retirée — elle ne protégeait
                qu'une copie locale qui n'existe plus.
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                ${statBox("Filiale active", escapeHtml((typeof Session !== "undefined" && Session.libelleFiliale()) || "—"))}
                ${statBox("Compte", escapeHtml((session && session.utilisateur) || "—"))}
                ${statBox("Chiffrement au repos", "Disque du serveur")}
            </div>
            ${provisoire ? `<div class="help-note" style="margin-top:15px; border-left-color: var(--color-warning);">
                <strong>Authentification non installée sur ce serveur.</strong> La session est provisoire :
                l'identité et les droits ne sont pas encore vérifiés. C'est attendu avant la mise en service
                (raccordement à l'annuaire d'entreprise) ; signalez-le à votre exploitant si vous voyez ce
                message en production.
            </div>` : ""}
        `;
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
                if (window.showToast) window.showToast("Fichier chiffré téléchargé.", "success");
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
                    <button id="imp-merge" style="background: var(--primary); flex:1; justify-content:center;">Fusionner dans la filiale</button>
                    <button id="imp-replace" style="background: var(--color-danger); flex:1; justify-content:center;">Remplacer tout</button>
                    <button id="imp-cancel" style="background: var(--color-gray); justify-content:center;">Annuler</button>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 8px;">
                    <strong>Fusionner</strong> ajoute les éléments absents et ne supprime rien.
                    <strong>Remplacer</strong> substitue le contenu du fichier à celui de la filiale
                    <strong>pour tous ses utilisateurs</strong> : c'est irréversible, et il n'existe pas
                    de point de restauration côté navigateur — la restauration se demande à l'exploitant.
                </div>
            </div>
        `;
        document.getElementById("imp-cancel").onclick = () => { recap.innerHTML = ""; };

        // Un seul chemin pour les deux modes : `applyImport` applique la charge en
        // UNE transaction côté serveur quand il la porte, et se replie sinon —
        // en refusant le remplacement plutôt qu'en le faisant à moitié (B-3).
        async function appliquer(mode, bouton, libelle) {
            bouton.disabled = true; bouton.textContent = "Application en cours…";
            try {
                // Le TEXTE d'origine part au serveur : c'est lui qui lit
                // l'enveloppe, monte la charge de v1 à v12 et porte l'empreinte
                // d'idempotence. Pour un fichier chiffré, le texte n'est pas
                // lisible par le serveur : on lui remet la charge déchiffrée
                // dans une enveloppe en clair.
                const r = await DataStore.applyImport(res.payload, mode,
                    res.encrypted ? { nom: filename } : { texte: text, nom: filename });
                const total = (typeof r.total === "number")
                    ? r.total
                    : (r.added ? Object.values(r.added).reduce((a, b) => a + b, 0) : 0);
                if (r.ok && r.transactionnel) {
                    const details = [`${r.crees || 0} créé(s)`, `${r.misAJour || 0} mis à jour`];
                    if (r.supprimes) details.push(`${r.supprimes} supprimé(s)`);
                    const ignores = (r.champsIgnores && r.champsIgnores.length)
                        ? `\n\nChamps du fichier que le modèle ne connaît pas, donc non repris : `
                          + r.champsIgnores.join(", ")
                        : "";
                    alert(`Import appliqué en une seule transaction : ${details.join(", ")}.` + ignores);
                } else if (r.ok) {
                    alert(`Fusion terminée : ${total} élément(s) ajouté(s) sur le serveur.`);
                } else {
                    alert(`Import incomplet : ${total} élément(s) repris, certains ont été refusés par le serveur. `
                        + `Le bandeau en haut de page dit lesquels — ne rechargez pas la page avant de l'avoir lu.`);
                }
                recap.innerHTML = "";
            } catch (e) {
                alert("Import impossible.\n\n" + e.message);
            } finally {
                bouton.disabled = false; bouton.textContent = libelle;
            }
            loadStorageInfo();
        }

        document.getElementById("imp-merge").onclick = () =>
            appliquer("merge", document.getElementById("imp-merge"), "Fusionner dans la filiale");

        document.getElementById("imp-replace").onclick = () => {
            if (!confirm("Remplacer les données de cette filiale par le contenu du fichier ?\n\n"
                + "Tout ce qui n'est pas dans le fichier sera supprimé, pour tous les utilisateurs "
                + "de la filiale. L'opération est appliquée en une seule transaction : elle réussit "
                + "entièrement ou ne change rien — mais elle est IRRÉVERSIBLE une fois réussie.")) return;
            appliquer("replace", document.getElementById("imp-replace"), "Remplacer tout");
        };
    }

    function errorBox(msg) {
        return `<div style="background:#fdecea;color:var(--color-danger);border-radius:var(--radius);padding:12px;margin-top:5px;font-size:0.9rem;">${escapeHtml(msg)}</div>`;
    }

    /* ===== État du stockage ===== */
    async function loadStorageInfo() {
        const el = document.getElementById("storage-stats");
        if (!el) return;
        try {
            const info = await DataStore.getStorageInfo();
            const totalItems = Object.values(info.counts).reduce((a, b) => a + b, 0);
            // Ces tuiles décrivaient le stockage du NAVIGATEUR : moteur IndexedDB,
            // chiffrement local, quota, points de restauration. Plus rien de tout
            // cela n'existe (constat m-7) — et « Chiffrement : Désactivé » juste
            // au-dessus d'un texte expliquant que le disque du serveur est
            // chiffré était le genre de contradiction qu'un auditeur relève.
            // T-11 : cette tuile disait « en cours d'envoi » dès que quelque chose
            // attendait — y compris quand rien ne partait, ce qui était la seule
            // information du produit sur un lot perdu (constat T-1). Elle
            // distingue désormais les trois états, et ne promet pas un envoi qui
            // n'a pas lieu.
            let attente = "Tout est enregistré";
            if (info.incidents > 0) {
                attente = `<span style="color: var(--color-danger);">${info.incidents} refusée(s)</span>`;
            } else if (info.panneReseau) {
                attente = `<span style="color: var(--color-danger);">serveur injoignable</span>`;
            } else if (info.enCours) {
                attente = `<span style="color: var(--text-muted);">envoi en cours</span>`;
            } else if (info.enAttente) {
                attente = `<span style="color: var(--color-danger);">non enregistrées</span>`;
            }
            el.innerHTML = `
                ${statBox("Enregistré sur", escapeHtml(info.engine))}
                ${statBox("Enregistrements détenus", totalItems + " éléments")}
                ${statBox("Volume en mémoire", formatBytes(info.bytes))}
                ${statBox("Modifications en attente", attente)}
                ${statBox("Dernier enregistrement", formatDate(info.lastSavedAt || info.updatedAt))}
            `;

        } catch (e) {
            el.innerHTML = `<div style="color: var(--color-danger);">Impossible de lire l'état de la liaison au serveur.</div>`;
        }
    }

    function statBox(label, value) {
        return `
            <div style="background: var(--bg-body); padding: 12px 14px; border-radius: var(--radius);">
                <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">${label}</div>
                <div style="font-size: 1.05rem; font-weight: 700; margin-top: 4px;">${value}</div>
            </div>`;
    }

    return { render };
})();
