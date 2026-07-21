// Emplacement : js/modules/audits.js
// Nom du fichier : audits.js

const AuditsModule = (() => {

    let currentTab = "audits";
    let editingItem = null;

    /* =========================
       EXTENSION DYNAMIQUE DU DATASTORE
       (Évite de devoir modifier datastore.js manuellement)
    ========================== */
    if (!DataStore.getAudits) {
        DataStore.getAudits = () => JSON.parse(localStorage.getItem("cyber-audits") || "[]");
        DataStore.addAudit = (a) => { const aud = DataStore.getAudits(); aud.push(a); localStorage.setItem("cyber-audits", JSON.stringify(aud)); };
        DataStore.updateAudit = (a) => { const aud = DataStore.getAudits(); const idx = aud.findIndex(x => x.id === a.id); if(idx>-1) aud[idx] = a; localStorage.setItem("cyber-audits", JSON.stringify(aud)); };
        DataStore.deleteAudit = (id) => { const aud = DataStore.getAudits(); localStorage.setItem("cyber-audits", JSON.stringify(aud.filter(x => x.id !== id))); };

        DataStore.getRevues = () => JSON.parse(localStorage.getItem("cyber-revues") || "[]");
        DataStore.addRevue = (r) => { const rev = DataStore.getRevues(); rev.push(r); localStorage.setItem("cyber-revues", JSON.stringify(rev)); };
        DataStore.updateRevue = (r) => { const rev = DataStore.getRevues(); const idx = rev.findIndex(x => x.id === r.id); if(idx>-1) rev[idx] = r; localStorage.setItem("cyber-revues", JSON.stringify(rev)); };
        DataStore.deleteRevue = (id) => { const rev = DataStore.getRevues(); localStorage.setItem("cyber-revues", JSON.stringify(rev.filter(x => x.id !== id))); };
    }

    /* =========================
       MODÈLES D'AUDIT (grille de points de contrôle générée depuis un référentiel)
    ========================== */
    // Typologie des constats d'un point de contrôle : valeur stockée + libellé + classe couleur.
    const FINDINGS = [
        { v: "",         label: "— À évaluer —",         cls: "",           col: "#cccccc" },
        { v: "conforme", label: "Conforme",              cls: "c-conforme", col: "#2e7d32" },
        { v: "fort",     label: "Point fort",            cls: "c-fort",     col: "#2e7d32" },
        { v: "pa",       label: "Piste d'amélioration",  cls: "c-pa",       col: "#1565c0" },
        { v: "mineure",  label: "NC mineure",            cls: "c-ncm",      col: "#ed6c02" },
        { v: "majeure",  label: "NC majeure",            cls: "c-ncmaj",    col: "#d32f2f" },
        { v: "na",       label: "Non applicable",        cls: "c-na",       col: "#757575" }
    ];
    function findingMeta(v) { return FINDINGS.find(f => f.v === v) || FINDINGS[0]; }

    // Statistiques de couverture / conformité d'une grille d'audit.
    function computeAuditStats(items) {
        const s = { total: items.length, evalues: 0, conformes: 0, nc: 0, na: 0, taux: null };
        items.forEach(it => {
            if (!it.type) return;
            s.evalues++;
            if (it.type === "na") { s.na++; return; }
            if (it.type === "conforme" || it.type === "fort") s.conformes++;
            else if (it.type === "mineure" || it.type === "majeure") s.nc++;
        });
        const applicables = s.evalues - s.na;   // N/A exclues du taux
        s.taux = applicables > 0 ? Math.round((s.conformes / applicables) * 100) : null;
        return s;
    }

    // Résumé court d'un audit pour la liste (référentiel de base + couverture).
    function auditCoverage(a) {
        if (!a.items || !a.items.length) return { ref: "Audit libre", txt: "" };
        const s = computeAuditStats(a.items);
        const ref = a.ref_id && typeof AuditModeles !== "undefined" ? AuditModeles.nameOf(a.ref_id) : (a.ref_id || "Référentiel");
        const txt = `${s.evalues}/${s.total} évalués` + (s.taux !== null ? ` · ${s.taux}% conf.` : "");
        return { ref, txt };
    }

    /* =========================
       LISTE PRINCIPALE (ONGLETS)
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const audits = DataStore.getAudits();
        const revues = DataStore.getRevues();

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Contrôles & Audits (Amélioration continue)</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Pilotage stratégique et vérification de la conformité</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="addBtn" style="background-color: var(--primary);">Nouvel Élément</button>
                    </div>
                </div>

                <div class="no-print" style="display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 2px solid var(--border);">
                    <button class="tab-btn ${currentTab === 'audits' ? 'active-tab' : ''}" data-tab="audits">Audits Internes</button>
                    <button class="tab-btn ${currentTab === 'revues' ? 'active-tab' : ''}" data-tab="revues">Revues de Direction</button>
                </div>

                <div id="tab-content">
                    ${renderTabContent(audits, revues)}
                </div>
            </section>
        `;

        if (!document.getElementById("audits-style")) {
            const style = document.createElement("style");
            style.id = "audits-style";
            style.innerHTML = `
                .tab-btn { background: none; color: var(--text-muted); border: none; padding: 10px 20px; cursor: pointer; border-radius: 0; font-weight: normal; font-size: 1rem; }
                .tab-btn:hover { background: rgba(0,0,0,0.05); }
                .active-tab { color: var(--accent); border-bottom: 3px solid var(--accent); font-weight: bold; }

                .badge-constat { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; color: white; }
                .c-conforme { background: #2e7d32; }
                .c-fort { background: #2e7d32; }
                .c-pa { background: #1565c0; }
                .c-ncm { background: #ed6c02; }
                .c-ncmaj { background: #d32f2f; }
                .c-na { background: #757575; }

                /* Grille de points de contrôle (audit sur référentiel) */
                .audit-dom-head { background: var(--accent, #2059A6); color:#fff; padding:8px 12px; border-radius:4px; margin:18px 0 8px; font-weight:bold; font-size:0.9rem; }
                .item-row { display:flex; gap:15px; padding:14px; border:1px solid #eee; border-left:3px solid #ccc; margin-bottom:8px; background:#fbfbfb; border-radius:4px; }
                .item-main { flex:1.4; min-width:0; }
                .item-title { font-weight:bold; margin-bottom:6px; }
                .item-code { display:inline-block; background:var(--accent, #2059A6); color:#fff; border-radius:3px; padding:1px 6px; font-size:0.75rem; margin-right:6px; }
                .item-ctrl { font-size:0.9rem; color:#333; }
                .item-preuve { font-size:0.82rem; color:var(--text-muted, #666); margin-top:6px; }
                .item-eval { flex:1; display:flex; flex-direction:column; gap:8px; }
                .item-eval .it-type { padding:8px; border-radius:4px; border:1px solid #ccc; font-weight:bold; }
                .item-eval .it-constat { min-height:70px; padding:8px; border-radius:4px; border:1px solid #ccc; resize:vertical; font-family:inherit; }
                @media (max-width: 720px) { .item-row { flex-direction:column; } }
                .audit-kpi-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:0.9rem; padding:10px; background:#f8f9fa; border-radius:4px; }
                .audit-kpi-row .k-ok { color:#2e7d32; font-weight:bold; }
                .audit-kpi-row .k-nc { color:#d32f2f; font-weight:bold; }
                .audit-kpi-row .k-na { color:#757575; }
                .audit-kpi-bar { height:8px; background:#eee; border-radius:4px; margin-top:8px; overflow:hidden; }
                .audit-kpi-bar > div { height:100%; background:var(--primary, #E9631B); transition:width 0.2s; }

                @media print {
                    /* Masquer les éléments perturbateurs */
                    body.printing-audit .sidebar,
                    body.printing-audit #toast-container { display: none !important; }

                    /* Masquer tout dans la page sauf la modale d'impression */
                    body.printing-audit .page > *:not(#print-modal) { display: none !important; }

                    /* Réinitialiser les marges pour l'impression pleine page */
                    body.printing-audit .main-content { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; }
                    body.printing-audit .page { margin: 0 !important; padding: 0 !important; }

                    /* Afficher la modale proprement */
                    #print-modal { position: relative !important; display: block !important; padding: 0 !important; overflow: visible !important; height: auto !important; background: white !important; }
                    .print-container { max-width: 100% !important; margin: 0 !important; padding: 20px !important; border: none !important; box-shadow: none !important; }

                    /* Forcer les couleurs des badges */
                    .badge-constat { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `;
            document.head.appendChild(style);
        }

        document.getElementById("addBtn").onclick = () => {
            if (currentTab === "audits") renderAuditDetail(null);
            if (currentTab === "revues") renderRevueDetail(null);
        };

        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.onclick = () => { currentTab = btn.dataset.tab; renderList(); };
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => {
                if (currentTab === "audits") renderAuditDetail(row.dataset.id);
                else renderRevueDetail(row.dataset.id);
            };
        });
    }

    function renderTabContent(audits, revues) {
        if (currentTab === "audits") {
            return `
                <div class="synthese-message info" style="font-size:0.9rem; padding:10px;">
                    <strong>ISO 27001 - Clause 9.2 :</strong> Planifiez et réalisez vos audits internes pour vérifier que le SMSI est conforme aux exigences de l'entreprise et à la norme.
                </div>
                <table class="data-table">
                    <thead>
                        <tr><th>Réf. Audit</th><th>Date</th><th>Périmètre audité</th><th>Modèle (couverture)</th><th>Auditeur</th><th>Statut</th></tr>
                    </thead>
                    <tbody>
                        ${audits.map(a => {
                            const cov = auditCoverage(a);
                            return `
                            <tr class="clickable-row" data-id="${a.id}">
                                <td><strong>${escapeHtml(a.ref)}</strong></td>
                                <td>${a.date ? new Date(a.date).toLocaleDateString('fr-FR') : "-"}</td>
                                <td>${escapeHtml(a.perimetre) || "-"}</td>
                                <td>${escapeHtml(cov.ref)}${cov.txt ? `<br><span style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(cov.txt)}</span>` : ""}</td>
                                <td>${escapeHtml(a.auditeur) || "-"}</td>
                                <td><span class="status ${a.statut === 'Réalisé' ? 'status-conforme' : 'status-non-conforme'}">${escapeHtml(a.statut)}</span></td>
                            </tr>
                        `;}).join("") || "<tr><td colspan='6' style='text-align:center;'>Aucun audit enregistré.</td></tr>"}
                    </tbody>
                </table>
            `;
        }

        if (currentTab === "revues") {
            return `
                <div class="synthese-message info" style="font-size:0.9rem; padding:10px;">
                    <strong>ISO 27001 - Clause 9.3 :</strong> La direction doit revoir le SMSI à des intervalles planifiés pour s'assurer qu'il demeure pertinent, adéquat et efficace.
                </div>
                <table class="data-table">
                    <thead>
                        <tr><th>Date de la Revue</th><th>Participants clés</th><th>Nb de décisions (Outputs)</th></tr>
                    </thead>
                    <tbody>
                        ${revues.map(r => {
                            // Correction : On lit r.outputs et on filtre les lignes vides pour un comptage précis
                            const nbDecisions = r.outputs ? r.outputs.split('\n').filter(line => line.trim() !== '').length : 0;
                            return `
                            <tr class="clickable-row" data-id="${r.id}">
                                <td><strong>${r.date ? new Date(r.date).toLocaleDateString('fr-FR') : "-"}</strong></td>
                                <td>${escapeHtml((r.participants || "").substring(0, 80))}...</td>
                                <td>${nbDecisions} décision(s) actée(s)</td>
                            </tr>
                            `;
                        }).join("") || "<tr><td colspan='3' style='text-align:center;'>Aucune revue de direction enregistrée.</td></tr>"}
                    </tbody>
                </table>
            `;
        }
    }

    /* =========================
       ÉDITEUR D'AUDIT INTERNE
    ========================== */
    function renderAuditDetail(id) {
        const isEdit = !!id;
        if (isEdit) {
            const original = DataStore.getAudits().find(x => x.id === id);
            editingItem = JSON.parse(JSON.stringify(original));
        } else {
            editingItem = { id: UI.genId("AUD"), ref: "AUD-202X-XX", statut: "Planifié", date: "", perimetre: "", auditeur: "", audite: "", synthese: "", ref_id: null, items: [], constats: [] };
        }
        // Rétrocompatibilité : anciens audits sans grille de référentiel.
        if (!Array.isArray(editingItem.items)) editingItem.items = [];
        if (editingItem.ref_id === undefined) editingItem.ref_id = null;
        if (!Array.isArray(editingItem.constats)) editingItem.constats = [];

        // Référentiels disposant d'un modèle d'audit (pour le sélecteur de génération).
        const models = (typeof AuditModeles !== "undefined") ? AuditModeles.available() : [];
        const modelOpts = `<option value="">— Choisir un référentiel —</option>` +
            models.map(m => `<option value="${escapeHtml(m.id)}" ${editingItem.ref_id === m.id ? "selected" : ""}>${escapeHtml(m.nom)} (${m.points} points)</option>`).join("");

        document.getElementById("app").innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <h1>${isEdit ? "Édition de l'Audit" : "Nouvel Audit Interne"}</h1>
                    <div style="display:flex; gap:10px;">
                        ${isEdit ? `<button id="printAuditBtn" style="background:#0073ea;">Générer le Rapport (PDF)</button>` : ""}
                        ${isEdit ? `<button id="delBtn" style="background:var(--color-danger);">Supprimer</button>` : ""}
                    </div>
                </div>

                <div class="dashboard-grid no-print">
                    <div class="dashboard-card">
                        <h3>Informations Générales</h3>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px;">
                            <div class="form-group"><label>Référence / Titre <span style="color:red">*</span></label><input id="a-ref" value="${escapeHtml(editingItem.ref)}" required /></div>
                            <div class="form-group">
                                <label>Statut</label>
                                <select id="a-statut">
                                    <option value="Planifié" ${editingItem.statut === 'Planifié' ? 'selected' : ''}>Planifié</option>
                                    <option value="En cours" ${editingItem.statut === 'En cours' ? 'selected' : ''}>En cours</option>
                                    <option value="Réalisé" ${editingItem.statut === 'Réalisé' ? 'selected' : ''}>Réalisé</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Date de l'audit</label><input type="date" id="a-date" value="${editingItem.date}" /></div>
                            <div class="form-group"><label>Périmètre audité</label><input id="a-perimetre" value="${escapeHtml(editingItem.perimetre)}" placeholder="Ex: Processus RH, Site de Paris..." /></div>
                            <div class="form-group"><label>Auditeur(s)</label><input id="a-auditeur" list="personnes-list" value="${escapeHtml(editingItem.auditeur)}" placeholder="Ex: Audit interne, cabinet externe..." /></div>
                            <div class="form-group"><label>Audité(s) (Interlocuteurs)</label><input id="a-audite" list="personnes-list" value="${escapeHtml(editingItem.audite)}" placeholder="Ex: DSI, RSSI" /></div>
                        </div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Synthèse Globale de l'Auditeur</h3>
                        <textarea id="a-synthese" style="min-height:200px; margin-top:15px;" placeholder="Avis général, niveau de maturité constaté...">${escapeHtml(editingItem.synthese)}</textarea>
                    </div>
                </div>

                <div class="dashboard-card no-print" style="margin-top: 20px; border-top: 4px solid var(--primary, #E9631B);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:5px;">
                        <h3 style="margin:0; color:var(--primary, #E9631B);">Grille d'audit sur référentiel ${Help.tip("Génère une grille de points de contrôle détaillés (ce qu'il faut vérifier + les preuves à demander) couvrant les exigences du référentiel choisi. Évaluez chaque point : conforme, point fort, piste d'amélioration ou non-conformité (mineure / majeure). La couverture et le taux de conformité se calculent automatiquement.")}</h3>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <select id="a-refmodel" style="padding:8px; border-radius:4px; border:1px solid #ccc;">${modelOpts}</select>
                            <button id="genGridBtn" style="background:var(--primary, #E9631B); font-size:0.85rem; padding:8px 12px;">Générer la grille</button>
                        </div>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-muted); margin:0 0 12px;">Choisissez un référentiel puis générez une grille de contrôles prête à l'emploi. Vous pouvez compléter par des constats libres ci-dessous.</p>
                    <div id="audit-kpi"></div>
                    <div id="items-container" style="margin-top:10px;"></div>
                </div>

                <div class="dashboard-card no-print" style="margin-top: 20px; border-top: 4px solid #784bd1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3 style="margin:0; color:#784bd1;">Constats libres (hors grille) ${Help.tip("Résultats d'audit non rattachés à un point de la grille, classés par gravité : Point fort (bonne pratique), Piste d'amélioration, Non-conformité Mineure (écart isolé) et Non-conformité Majeure (défaillance systémique exigeant une action corrective).")}</h3>
                        <button id="addConstatBtn" style="background:#784bd1; font-size:0.8rem; padding:5px 10px;">Ajouter un constat</button>
                    </div>
                    <div id="constats-container"></div>
                </div>

                <div class="no-print" style="margin-top: 20px; text-align: right; background: white; padding: 15px; border-radius: 8px;">
                    <button id="cancelBtn" style="background:var(--color-gray); color:white; padding:10px 15px;">Annuler</button>
                    <button id="saveBtn" style="padding: 10px 20px; background:var(--color-success); margin-left:10px;">Enregistrer l'Audit</button>
                </div>

                <div id="print-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:#f0f2f5; z-index:2000; overflow-y:auto; padding:40px;">
                    <div class="no-print" style="display:flex; justify-content:space-between; margin-bottom:20px; max-width: 900px; margin: 0 auto 20px auto;">
                        <button id="closePrintBtn" style="background:#676879; padding:10px 20px;">Fermer l'aperçu</button>
                        <button onclick="window.print()" style="background:#0073ea; padding:10px 20px;">Imprimer / PDF</button>
                    </div>
                    <div id="print-content" class="print-container" style="max-width: 900px; margin: 0 auto; background: white; padding: 50px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 1px solid #ccc; font-family: Arial, sans-serif;"></div>
                </div>
            </section>
        `;

        refreshConstats();
        refreshItems();

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/audits");
        document.getElementById("addConstatBtn").onclick = () => addConstat();

        document.getElementById("genGridBtn").onclick = () => {
            const refId = document.getElementById("a-refmodel").value;
            if (!refId) { alert("Choisissez d'abord un référentiel."); return; }
            if (!AuditModeles.has(refId)) { alert("Aucun modèle d'audit disponible pour ce référentiel."); return; }
            if (editingItem.items.length && !confirm("Régénérer la grille remplacera les points de contrôle et les constats déjà saisis. Continuer ?")) return;
            const grid = AuditModeles.buildGrid(refId);
            if (!grid.length) { alert("Modèle vide pour ce référentiel."); return; }
            editingItem.ref_id = refId;
            editingItem.items = grid;
            // Suggestion de périmètre si le champ est vide
            const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(refId) : null;
            const perim = document.getElementById("a-perimetre");
            if (ref && perim && !perim.value.trim()) perim.value = "Conformité " + ref.nom;
            refreshItems();
            if (window.showToast) window.showToast(grid.length + " points de contrôle générés.");
        };

        if (isEdit) {
            document.getElementById("printAuditBtn").onclick = renderPrintAudit;
            UI.wireDelete({
                button: "delBtn",
                confirm: "Supprimer cet audit ?",
                remove: () => DataStore.deleteAudit(id),
                redirect: "/audits"
            });
        }

        document.getElementById("closePrintBtn").onclick = () => {
            document.body.classList.remove("printing-audit");
            document.getElementById("print-modal").style.display = "none";
        };

        document.getElementById("saveBtn").onclick = () => {
            editingItem.ref = document.getElementById("a-ref").value.trim();
            editingItem.statut = document.getElementById("a-statut").value;
            editingItem.date = document.getElementById("a-date").value;
            editingItem.perimetre = document.getElementById("a-perimetre").value.trim();
            editingItem.auditeur = document.getElementById("a-auditeur").value.trim();
            editingItem.audite = document.getElementById("a-audite").value.trim();
            editingItem.synthese = document.getElementById("a-synthese").value.trim();

            // Sauvegarde des constats
            const constats = [];
            document.querySelectorAll(".constat-row").forEach(row => {
                constats.push({
                    exigence: row.querySelector('.c-exigence').value,
                    type: row.querySelector('.c-type').value,
                    desc: row.querySelector('.c-desc').value
                });
            });
            editingItem.constats = constats;

            if (!editingItem.ref) return alert("La référence est obligatoire.");

            if (isEdit) DataStore.updateAudit(editingItem);
            else DataStore.addAudit(editingItem);

            if(window.showToast) window.showToast("Audit sauvegardé.");
            Router.navigateTo("/audits");
        };
    }

    function refreshConstats() {
        const container = document.getElementById("constats-container");
        container.innerHTML = editingItem.constats.map((c, idx) => `
            <div class="constat-row" style="display:flex; gap:10px; align-items:start; padding:15px; border:1px solid #eee; margin-bottom:10px; background:#fbfbfb; border-radius:4px;">
                <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; gap:10px;">
                        <select class="c-type" style="padding:8px; border-radius:4px; border:1px solid #ccc; font-weight:bold; width:200px;">
                            <option value="Point fort" ${c.type==='Point fort'?'selected':''}>Point fort</option>
                            <option value="PA" ${c.type==='PA'?'selected':''}>Piste d'amélioration</option>
                            <option value="Mineure" ${c.type==='Mineure'?'selected':''}>Non-conformité Mineure</option>
                            <option value="Majeure" ${c.type==='Majeure'?'selected':''}>Non-conformité Majeure</option>
                        </select>
                        <input class="c-exigence" value="${escapeHtml(c.exigence||'')}" placeholder="Exigence visée (Ex: ISO 27001 - A.8.1)" style="flex:1; padding:8px;" />
                    </div>
                    <textarea class="c-desc" placeholder="Description du constat / Preuve d'audit..." style="min-height:60px;">${escapeHtml(c.desc||'')}</textarea>
                </div>
                <button onclick="this.closest('.constat-row').remove()" style="background:none; color:red; border:none; font-size:1.5rem; cursor:pointer;" title="Supprimer"></button>
            </div>
        `).join("") || `<p style="text-align:center; color:gray; padding:20px;">Aucun constat saisi.</p>`;
    }

    function addConstat() {
        editingItem.constats.push({ type: "PA", exigence: "", desc: "" });
        refreshConstats();
    }

    /* =========================
       GRILLE DE POINTS DE CONTRÔLE (générée depuis un référentiel)
    ========================== */
    function applyRowColor(row, type) {
        row.style.borderLeftColor = findingMeta(type).col;
    }

    function refreshItems() {
        const container = document.getElementById("items-container");
        if (!container) return;
        const items = editingItem.items || [];
        if (!items.length) {
            container.innerHTML = `<p style="text-align:center; color:gray; padding:20px;">Aucune grille générée. Choisissez un référentiel puis cliquez « Générer la grille ».</p>`;
            renderAuditKpi();
            return;
        }
        let html = "";
        let lastDom = null;
        items.forEach((it, idx) => {
            if (it.domaine !== lastDom) {
                lastDom = it.domaine;
                html += `<div class="audit-dom-head">${escapeHtml(it.domaine || "Autres")}</div>`;
            }
            const opts = FINDINGS.map(f => `<option value="${f.v}" ${it.type === f.v ? "selected" : ""}>${f.label}</option>`).join("");
            html += `
                <div class="item-row" data-idx="${idx}">
                    <div class="item-main">
                        <div class="item-title"><span class="item-code">${escapeHtml(it.code)}</span>${escapeHtml(it.intitule)}</div>
                        <div class="item-ctrl">${escapeHtml(it.ctrl)}</div>
                        ${it.preuve ? `<div class="item-preuve"><strong>Preuves à demander :</strong> ${escapeHtml(it.preuve)}</div>` : ""}
                    </div>
                    <div class="item-eval">
                        <select class="it-type">${opts}</select>
                        <textarea class="it-constat" placeholder="Constat / preuve observée…">${escapeHtml(it.constat || "")}</textarea>
                    </div>
                </div>`;
        });
        container.innerHTML = html;

        container.querySelectorAll(".item-row").forEach(row => {
            const idx = Number(row.dataset.idx);
            const sel = row.querySelector(".it-type");
            const ta = row.querySelector(".it-constat");
            applyRowColor(row, editingItem.items[idx].type);
            sel.onchange = () => { editingItem.items[idx].type = sel.value; applyRowColor(row, sel.value); renderAuditKpi(); };
            ta.oninput = () => { editingItem.items[idx].constat = ta.value; };
        });
        renderAuditKpi();
    }

    function renderAuditKpi() {
        const el = document.getElementById("audit-kpi");
        if (!el) return;
        const items = editingItem.items || [];
        if (!items.length) { el.innerHTML = ""; return; }
        const s = computeAuditStats(items);
        const pct = s.total ? Math.round((s.evalues / s.total) * 100) : 0;
        el.innerHTML = `
            <div class="audit-kpi-row">
                <span><strong>${s.evalues}/${s.total}</strong> points évalués (${pct}%)</span>
                <span class="k-ok">${s.conformes} conforme(s)</span>
                <span class="k-nc">${s.nc} non-conformité(s)</span>
                <span class="k-na">${s.na} N/A</span>
                <span>Taux de conformité&nbsp;: <strong>${s.taux === null ? "—" : s.taux + "%"}</strong></span>
            </div>
            <div class="audit-kpi-bar"><div style="width:${pct}%;"></div></div>`;
    }

    /* =========================
       ÉDITEUR DE REVUE DE DIRECTION
    ========================== */
    function renderRevueDetail(id) {
        const isEdit = !!id;
        if (isEdit) {
            const original = DataStore.getRevues().find(x => x.id === id);
            editingItem = JSON.parse(JSON.stringify(original));
        } else {
            editingItem = { id: UI.genId("REV"), date: "", participants: "", inputs: "1. État des actions des revues précédentes :\n2. Changements dans les enjeux externes/internes :\n3. Retour d'information sur la performance de la sécurité :\n4. Retours des parties intéressées :\n5. Résultats de l'appréciation des risques :", outputs: "- " };
        }

        document.getElementById("app").innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <h1>${isEdit ? "Édition de la Revue" : "Nouvelle Revue de Direction"}</h1>
                    <div style="display:flex; gap:10px;">
                        ${isEdit ? `<button id="printRevueBtn" style="background:#0073ea;">Générer le PV (PDF)</button>` : ""}
                        ${isEdit ? `<button id="delBtn" style="background:var(--color-danger);">Supprimer</button>` : ""}
                    </div>
                </div>

                <div class="dashboard-card no-print">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group"><label>Date de la Revue <span style="color:red">*</span></label><input type="date" id="r-date" value="${editingItem.date}" required /></div>
                        <div class="form-group"><label>Participants ${Help.tip("Personnes présentes à la revue. Choisissez-les dans l'annuaire (autocomplétion) ou saisissez un nom, puis « Ajouter ».")}</label>${UI.multiPersonHtml("r-participants", editingItem.participants)}</div>
                    </div>

                    <div class="form-group" style="margin-top:20px;">
                        <label style="color:#1565c0; font-weight:bold;">Données d'entrée (Sujets abordés / ISO 27001 - 9.3.2)</label>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0;">Résumez les éléments présentés à la direction.</p>
                        <textarea id="r-inputs" style="min-height:150px;">${escapeHtml(editingItem.inputs)}</textarea>
                    </div>

                    <div class="form-group" style="margin-top:20px;">
                        <label style="color:#2e7d32; font-weight:bold;">Données de sortie (Décisions & Budgets / ISO 27001 - 9.3.3)</label>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0;">Décisions relatives à l'amélioration continue, modifications du SMSI et besoins en ressources.</p>
                        <textarea id="r-outputs" style="min-height:150px;">${escapeHtml(editingItem.outputs)}</textarea>
                    </div>
                </div>

                <div class="no-print" style="margin-top: 20px; text-align: right; background: white; padding: 15px; border-radius: 8px;">
                    <button id="cancelBtn" style="background:var(--color-gray); color:white; padding:10px 15px;">Annuler</button>
                    <button id="saveBtn" style="padding: 10px 20px; background:var(--color-success); margin-left:10px;">Enregistrer le PV</button>
                </div>

                <div id="print-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:#f0f2f5; z-index:2000; overflow-y:auto; padding:40px;">
                    <div class="no-print" style="display:flex; justify-content:space-between; margin-bottom:20px; max-width: 900px; margin: 0 auto 20px auto;">
                        <button id="closePrintBtn" style="background:#676879; padding:10px 20px;">Fermer l'aperçu</button>
                        <button onclick="window.print()" style="background:#0073ea; padding:10px 20px;">Imprimer / PDF</button>
                    </div>
                    <div id="print-content" class="print-container" style="max-width: 900px; margin: 0 auto; background: white; padding: 50px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 1px solid #ccc; font-family: Arial, sans-serif;"></div>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/audits");
        UI.wireMultiPerson("r-participants");

        if (isEdit) {
            document.getElementById("printRevueBtn").onclick = renderPrintRevue;
            UI.wireDelete({
                button: "delBtn",
                confirm: "Supprimer cette revue ?",
                remove: () => DataStore.deleteRevue(id),
                redirect: "/audits"
            });
        }

        document.getElementById("closePrintBtn").onclick = () => {
            document.body.classList.remove("printing-audit");
            document.getElementById("print-modal").style.display = "none";
        };

        document.getElementById("saveBtn").onclick = () => {
            editingItem.date = document.getElementById("r-date").value;
            editingItem.participants = UI.getMultiPerson("r-participants");
            editingItem.inputs = document.getElementById("r-inputs").value.trim();
            editingItem.outputs = document.getElementById("r-outputs").value.trim();

            if (!editingItem.date) return alert("La date est obligatoire.");

            if (isEdit) DataStore.updateRevue(editingItem);
            else DataStore.addRevue(editingItem);

            if(window.showToast) window.showToast("Revue de direction sauvegardée.");
            Router.navigateTo("/audits");
        };
    }

    // Construit le HTML de la grille de points de contrôle pour le rapport imprimable
    // (résumé de conformité + tableau groupé par domaine). Vide si pas de grille.
    function auditGridPrintHtml() {
        const items = editingItem.items || [];
        if (!items.length) return "";
        const s = computeAuditStats(items);
        const refName = editingItem.ref_id && typeof AuditModeles !== "undefined" ? AuditModeles.nameOf(editingItem.ref_id) : (editingItem.ref_id || "");

        const summary = `
            <h3 style="color:#0073ea; border-bottom:1px solid #eee; padding-bottom:5px;">Grille d'audit${refName ? " — " + escapeHtml(refName) : ""}</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:0.85rem;">
                <tr>
                    <td style="padding:8px; border:1px solid #ddd; background:#f8f9fa;"><strong>${s.evalues}/${s.total}</strong> points évalués</td>
                    <td style="padding:8px; border:1px solid #ddd;">Conformes : <strong>${s.conformes}</strong></td>
                    <td style="padding:8px; border:1px solid #ddd;">Non-conformités : <strong>${s.nc}</strong></td>
                    <td style="padding:8px; border:1px solid #ddd;">N/A : <strong>${s.na}</strong></td>
                    <td style="padding:8px; border:1px solid #ddd;">Taux de conformité : <strong>${s.taux === null ? "—" : s.taux + "%"}</strong></td>
                </tr>
            </table>`;

        let rows = "";
        let lastDom = null;
        items.forEach(it => {
            if (it.domaine !== lastDom) {
                lastDom = it.domaine;
                rows += `<tr><td colspan="3" style="padding:8px; background:#eef2fb; border:1px solid #ddd; font-weight:bold;">${escapeHtml(it.domaine || "Autres")}</td></tr>`;
            }
            const m = findingMeta(it.type);
            const badge = it.type ? `<span class="badge-constat ${m.cls}">${m.label}</span>` : `<span style="color:#999;">Non évalué</span>`;
            rows += `
                <tr>
                    <td style="padding:8px; border:1px solid #ddd; vertical-align:top; width:40%;">
                        <strong>${escapeHtml(it.code)} — ${escapeHtml(it.intitule)}</strong>
                        <div style="color:#555; font-size:0.82rem; margin-top:4px;">${escapeHtml(it.ctrl)}</div>
                    </td>
                    <td style="padding:8px; border:1px solid #ddd; vertical-align:top; width:15%;">${badge}</td>
                    <td style="padding:8px; border:1px solid #ddd; vertical-align:top; width:45%;">${escapeHtml(it.constat || "").replace(/\n/g, "<br>") || "<span style='color:#999;'>—</span>"}</td>
                </tr>`;
        });

        return summary + `
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; margin-bottom:30px;">
                <thead><tr style="background:#f8f9fa;">
                    <th style="padding:8px; border:1px solid #ddd; text-align:left;">Point de contrôle</th>
                    <th style="padding:8px; border:1px solid #ddd; text-align:left;">Constat</th>
                    <th style="padding:8px; border:1px solid #ddd; text-align:left;">Preuve observée / commentaire</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    /* =========================
       GÉNÉRATION PDF (AUDIT)
    ========================== */
    function renderPrintAudit() {
        document.body.classList.add("printing-audit");
        const modal = document.getElementById("print-modal");
        const content = document.getElementById("print-content");

        const getBadge = (type) => {
            if(type === 'Point fort') return `<span class="badge-constat c-fort">Point Fort</span>`;
            if(type === 'PA') return `<span class="badge-constat c-pa">Amélioration</span>`;
            if(type === 'Mineure') return `<span class="badge-constat c-ncm">NC Mineure</span>`;
            if(type === 'Majeure') return `<span class="badge-constat c-ncmaj">NC Majeure</span>`;
            return type;
        };

        const constatsHtml = editingItem.constats.map(c => `
            <tr>
                <td style="padding:10px; border:1px solid #ddd; width:20%;">${getBadge(c.type)}</td>
                <td style="padding:10px; border:1px solid #ddd; width:30%; font-weight:bold;">${escapeHtml(c.exigence)}</td>
                <td style="padding:10px; border:1px solid #ddd; width:50%;">${escapeHtml(c.desc||'').replace(/\n/g, '<br>')}</td>
            </tr>
        `).join("") || "<tr><td colspan='3' style='padding:10px; border:1px solid #ddd; text-align:center;'>Aucun constat.</td></tr>";

        content.innerHTML = `
            <div style="border-bottom: 2px solid #0073ea; padding-bottom: 15px; margin-bottom: 30px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h1 style="margin:0; color:#333; font-size:2rem;">RAPPORT D'AUDIT INTERNE</h1>
                    <h3 style="margin:5px 0 0 0; color:#666;">Réf : ${escapeHtml(editingItem.ref)}</h3>
                </div>
                <div style="text-align:right; font-size:0.9rem; color:#666;">
                    Date : ${editingItem.date ? new Date(editingItem.date).toLocaleDateString('fr-FR') : "Non définie"}<br>
                    Statut : <strong>${escapeHtml(editingItem.statut)}</strong>
                </div>
            </div>

            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
                <tr>
                    <td style="padding:10px; background:#f8f9fa; border:1px solid #ddd; font-weight:bold; width:25%;">Périmètre audité</td>
                    <td style="padding:10px; border:1px solid #ddd;">${escapeHtml(editingItem.perimetre) || '-'}</td>
                </tr>
                <tr>
                    <td style="padding:10px; background:#f8f9fa; border:1px solid #ddd; font-weight:bold;">Auditeur(s)</td>
                    <td style="padding:10px; border:1px solid #ddd;">${escapeHtml(editingItem.auditeur) || '-'}</td>
                </tr>
                <tr>
                    <td style="padding:10px; background:#f8f9fa; border:1px solid #ddd; font-weight:bold;">Audité(s)</td>
                    <td style="padding:10px; border:1px solid #ddd;">${escapeHtml(editingItem.audite||'-').replace(/\n/g, '<br>')}</td>
                </tr>
            </table>

            <h3 style="color:#0073ea; border-bottom:1px solid #eee; padding-bottom:5px;">Synthèse globale</h3>
            <p style="margin-bottom:30px; line-height:1.6;">${escapeHtml(editingItem.synthese||'Aucune synthèse saisie.').replace(/\n/g, '<br>')}</p>

            ${auditGridPrintHtml()}

            ${editingItem.constats && editingItem.constats.length ? `
            <h3 style="color:#784bd1; border-bottom:1px solid #eee; padding-bottom:5px;">Constats libres (hors grille)</h3>
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f8f9fa;">
                        <th style="padding:10px; border:1px solid #ddd; text-align:left;">Typologie</th>
                        <th style="padding:10px; border:1px solid #ddd; text-align:left;">Exigence / Norme visée</th>
                        <th style="padding:10px; border:1px solid #ddd; text-align:left;">Description du constat (Preuve)</th>
                    </tr>
                </thead>
                <tbody>
                    ${constatsHtml}
                </tbody>
            </table>` : ""}

            <div style="margin-top:50px; text-align:right;">
                <p>Signature de l'auditeur :</p>
                <div style="width:200px; height:80px; border-bottom:1px dotted #ccc; display:inline-block;"></div>
            </div>
        `;
        modal.style.display = "block";
    }

    /* =========================
       GÉNÉRATION PDF (REVUE)
    ========================== */
    function renderPrintRevue() {
        document.body.classList.add("printing-audit");
        const modal = document.getElementById("print-modal");
        const content = document.getElementById("print-content");

        content.innerHTML = `
            <div style="border-bottom: 2px solid #784bd1; padding-bottom: 15px; margin-bottom: 30px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h1 style="margin:0; color:#333; font-size:2rem;">PROCÈS-VERBAL</h1>
                    <h2 style="margin:5px 0 0 0; color:#666;">Revue de Direction du SMSI</h2>
                </div>
                <div style="text-align:right; font-size:0.9rem; color:#666;">
                    Date de la réunion : <strong>${editingItem.date ? new Date(editingItem.date).toLocaleDateString('fr-FR') : "Non définie"}</strong>
                </div>
            </div>

            <h3 style="color:#784bd1; border-bottom:1px solid #eee; padding-bottom:5px;">Participants présents</h3>
            <p style="margin-bottom:30px; line-height:1.6; padding:15px; background:#f8f9fa; border:1px solid #ddd;">
                ${escapeHtml(editingItem.participants||'-').replace(/\n/g, '<br>')}
            </p>

            <h3 style="color:#1565c0; border-bottom:1px solid #eee; padding-bottom:5px;">Éléments d'entrée abordés (Bilan)</h3>
            <p style="margin-bottom:30px; line-height:1.6; text-align:justify;">
                ${escapeHtml(editingItem.inputs||'-').replace(/\n/g, '<br>')}
            </p>

            <h3 style="color:#2e7d32; border-bottom:1px solid #eee; padding-bottom:5px;">Décisions actées et besoins (Sorties)</h3>
            <p style="margin-bottom:50px; line-height:1.6; text-align:justify;">
                ${escapeHtml(editingItem.outputs||'-').replace(/\n/g, '<br>')}
            </p>

            <div style="margin-top:50px; text-align:right;">
                <p>Approbation de la Direction :</p>
                <div style="width:250px; height:80px; border-bottom:1px dotted #ccc; display:inline-block;"></div>
            </div>
        `;
        modal.style.display = "block";
    }

    return { renderList, renderAuditDetail, renderRevueDetail };
})();