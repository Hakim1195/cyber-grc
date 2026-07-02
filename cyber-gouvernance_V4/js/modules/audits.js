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
                .c-fort { background: #2e7d32; }
                .c-pa { background: #1565c0; }
                .c-ncm { background: #ed6c02; }
                .c-ncmaj { background: #d32f2f; }

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
                        <tr><th>Réf. Audit</th><th>Date</th><th>Périmètre audité</th><th>Auditeur</th><th>Statut</th></tr>
                    </thead>
                    <tbody>
                        ${audits.map(a => `
                            <tr class="clickable-row" data-id="${a.id}">
                                <td><strong>${escapeHtml(a.ref)}</strong></td>
                                <td>${a.date ? new Date(a.date).toLocaleDateString('fr-FR') : "-"}</td>
                                <td>${escapeHtml(a.perimetre) || "-"}</td>
                                <td>${escapeHtml(a.auditeur) || "-"}</td>
                                <td><span class="status ${a.statut === 'Réalisé' ? 'status-conforme' : 'status-non-conforme'}">${escapeHtml(a.statut)}</span></td>
                            </tr>
                        `).join("") || "<tr><td colspan='5' style='text-align:center;'>Aucun audit enregistré.</td></tr>"}
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
            editingItem = { id: UI.genId("AUD"), ref: "AUD-202X-XX", statut: "Planifié", date: "", perimetre: "", auditeur: "", audite: "", synthese: "", constats: [] };
        }

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
                            <div class="form-group"><label>Auditeur(s)</label><input id="a-auditeur" value="${escapeHtml(editingItem.auditeur)}" placeholder="Ex: Audit interne, cabinet externe..." /></div>
                            <div class="form-group"><label>Audité(s) (Interlocuteurs)</label><input id="a-audite" value="${escapeHtml(editingItem.audite)}" placeholder="Ex: DSI, RSSI" /></div>
                        </div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Synthèse Globale de l'Auditeur</h3>
                        <textarea id="a-synthese" style="min-height:200px; margin-top:15px;" placeholder="Avis général, niveau de maturité constaté...">${escapeHtml(editingItem.synthese)}</textarea>
                    </div>
                </div>

                <div class="dashboard-card no-print" style="margin-top: 20px; border-top: 4px solid #784bd1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h3 style="margin:0; color:#784bd1;">Grille des Constats (Preuves d'audit)</h3>
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

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/audits");
        document.getElementById("addConstatBtn").onclick = () => addConstat();

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
                        <div class="form-group"><label>Participants (Nom et Fonction)</label><textarea id="r-participants" style="min-height:50px;">${escapeHtml(editingItem.participants)}</textarea></div>
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
            editingItem.participants = document.getElementById("r-participants").value.trim();
            editingItem.inputs = document.getElementById("r-inputs").value.trim();
            editingItem.outputs = document.getElementById("r-outputs").value.trim();

            if (!editingItem.date) return alert("La date est obligatoire.");

            if (isEdit) DataStore.updateRevue(editingItem);
            else DataStore.addRevue(editingItem);

            if(window.showToast) window.showToast("Revue de direction sauvegardée.");
            Router.navigateTo("/audits");
        };
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

            <h3 style="color:#0073ea; border-bottom:1px solid #eee; padding-bottom:5px;">Grille des constats d'audit</h3>
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
            </table>

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