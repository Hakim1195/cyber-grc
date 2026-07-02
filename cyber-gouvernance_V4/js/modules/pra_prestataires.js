// Emplacement : js/modules/pra_prestataires.js
// Nom du fichier : pra_prestataires.js

const PraPrestatairesModule = (() => {

    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? "" : s));

    /* =========================
       ÉVALUATION DU RISQUE FOURNISSEUR (TIERS)
       Risque inhérent = criticité (impact si défaillance) × niveau d'accès.
    ========================== */
    const CRITICITE_OPTS = [["", "— Non évaluée —"], ["faible", "Faible"], ["moyenne", "Moyenne"], ["forte", "Forte"], ["vitale", "Vitale"]];
    const ACCES_OPTS = [["", "— Non évalué —"], ["aucun", "Aucun accès"], ["limite", "Accès limité"], ["etendu", "Accès étendu / privilégié"]];
    const CRIT_W = { faible: 1, moyenne: 2, forte: 3, vitale: 4 };
    const ACCES_W = { aucun: 1, limite: 2, etendu: 3 };

    // Exigences de sécurité de la chaîne d'approvisionnement (NIS2 art. 21 / DORA).
    const SUPPLY_REQS = [
        { id: "clause",        label: "Clause de sécurité au contrat (obligations, SLA sécurité)", ref: "NIS2 art. 21" },
        { id: "notif",         label: "Notification des incidents par le fournisseur (délai contractuel)", ref: "NIS2 / DORA" },
        { id: "audit",         label: "Droit d'audit & preuves de conformité (ISO 27001, SOC 2, HDS…)", ref: "DORA" },
        { id: "donnees",       label: "Localisation des données & encadrement de la sous-traitance", ref: "NIS2 / RGPD" },
        { id: "reversibilite", label: "Plan de réversibilité / stratégie de sortie", ref: "DORA" },
        { id: "continuite",    label: "Continuité & résilience testée (dépendance critique)", ref: "DORA" }
    ];

    function computeRisk(p) {
        const cw = CRIT_W[p && p.criticite] || 0;
        const aw = ACCES_W[p && p.acces] || 0;
        if (!cw || !aw) return { score: 0, niveau: "Non évalué", color: "var(--color-gray, #9e9e9e)" };
        const score = cw * aw;
        if (score <= 2) return { score, niveau: "Faible", color: "var(--color-success)" };
        if (score <= 5) return { score, niveau: "Modéré", color: "var(--color-warning)" };
        if (score <= 8) return { score, niveau: "Élevé", color: "#e53935" };
        return { score, niveau: "Critique", color: "#b71c1c" };
    }

    function coverage(p) {
        const sc = (p && p.supplyChain) || {};
        const done = SUPPLY_REQS.filter(r => sc[r.id]).length;
        return { done, total: SUPPLY_REQS.length, pct: Math.round(done / SUPPLY_REQS.length * 100) };
    }

    function riskBadge(p) {
        const r = computeRisk(p);
        return `<span class="badge" style="background:${r.color}; color:#fff;">${esc(r.niveau)}${r.score ? ` · ${r.score}` : ""}</span>`;
    }

    function coverageBadge(p) {
        const c = coverage(p);
        const col = c.pct >= 80 ? "var(--color-success)" : c.pct >= 40 ? "var(--color-warning)" : "var(--color-danger)";
        return `<span class="badge" title="Exigences chaîne d'appro (NIS2/DORA) satisfaites" style="background:#eee; color:${col}; font-weight:700;">Chaîne ${c.done}/${c.total}</span>`;
    }

    function optionsHtml(opts, current) {
        return opts.map(([v, l]) => `<option value="${v}" ${current === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    }

    // Section "risque fournisseur" partagée par la création et l'édition.
    function riskSectionHtml(p) {
        p = p || {};
        const reqs = SUPPLY_REQS.map(r => {
            const checked = p.supplyChain && p.supplyChain[r.id] ? "checked" : "";
            return `
            <label class="checkbox-line" style="display:flex; align-items:flex-start; gap:8px; padding:6px 0; border-bottom:1px dashed var(--border);">
                <input type="checkbox" class="sc-cb" data-id="${r.id}" ${checked} style="margin-top:3px;">
                <span>${esc(r.label)} <span class="badge" style="background:#eef; color:#334; font-size:0.7rem;">${esc(r.ref)}</span></span>
            </label>`;
        }).join("");
        return `
            <div class="dashboard-card" style="max-width:600px; margin-top:1.2rem; border-top:3px solid var(--primary);">
                <h3 style="margin-top:0;">Risque fournisseur &amp; chaîne d'appro ${Help.tip("Évaluez le risque que ce tiers fait porter à votre organisation. NIS2 impose de sécuriser sa chaîne d'approvisionnement ; DORA encadre les prestataires TIC critiques.")}</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Criticité pour vos activités ${Help.tip("Impact si ce fournisseur défaille ou est compromis.")}</label>
                        <select id="criticite" onchange="PraPrestatairesModule.updateRiskPreview()">${optionsHtml(CRITICITE_OPTS, p.criticite || "")}</select>
                    </div>
                    <div class="form-group">
                        <label>Accès à votre SI / vos données ${Help.tip("Un accès étendu (administration, données sensibles) augmente le risque.")}</label>
                        <select id="acces" onchange="PraPrestatairesModule.updateRiskPreview()">${optionsHtml(ACCES_OPTS, p.acces || "")}</select>
                    </div>
                </div>
                <div style="background:var(--bg-body); border:1px solid var(--border); border-radius:8px; padding:12px; text-align:center; margin:6px 0 16px;">
                    Niveau de risque inhérent : <span id="riskPreview">${riskBadge(p)}</span>
                </div>
                <label style="font-weight:700;">Exigences de sécurité de la chaîne d'approvisionnement</label>
                <p style="color:var(--text-muted); font-size:0.85rem; margin:2px 0 8px;">Points de vigilance contractuels et opérationnels attendus (NIS2 / DORA).</p>
                ${reqs}
            </div>`;
    }

    // Recalcule le badge de risque en direct quand criticité/accès changent.
    function updateRiskPreview() {
        const el = document.getElementById("riskPreview");
        if (!el) return;
        el.innerHTML = riskBadge({
            criticite: (document.getElementById("criticite") || {}).value || "",
            acces: (document.getElementById("acces") || {}).value || ""
        });
    }

    // Collecte les champs de risque depuis le formulaire (création/édition).
    function collectRisk() {
        const supplyChain = {};
        document.querySelectorAll(".sc-cb").forEach(cb => { supplyChain[cb.dataset.id] = cb.checked; });
        return {
            criticite: (document.getElementById("criticite") || {}).value || "",
            acces: (document.getElementById("acces") || {}).value || "",
            supplyChain
        };
    }

    /* =========================
       LISTE DES PRESTATAIRES & TIERS
    ========================== */
    function renderList() {
        const prestataires = DataStore.getPrestataires();
        const app = document.getElementById("app");
        const dateJour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

        const rows = prestataires.map(p => `
            <tr class="clickable-row" data-id="${p.id}">
                <td class="no-print" style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${p.id}">
                </td>
                <td><strong>${esc(p.societe)}</strong></td>
                <td><span class="badge" style="background:#eee; color:#333;">${esc(p.type)}</span></td>
                <td>${riskBadge(p)}<div style="margin-top:4px;">${coverageBadge(p)}</div></td>
                <td>${esc(p.phone) || "-"}<br>${esc(p.email) || "-"}</td>
                <td style="font-size:0.85rem; color:var(--text-muted);">${p.notes ? esc(String(p.notes).substring(0, 60)) + "…" : "-"}</td>
            </tr>
        `).join("");

        // Synthèse du risque tiers (lecture rapide direction).
        const eleves = prestataires.filter(p => ["Élevé", "Critique"].includes(computeRisk(p).niveau)).length;
        const evalues = prestataires.filter(p => computeRisk(p).score > 0).length;
        const avgCov = prestataires.length ? Math.round(prestataires.reduce((s, p) => s + coverage(p).pct, 0) / prestataires.length) : 0;

        const chip = (bg, color, txt) => `<span class="badge" style="background:${bg}; color:${color}; font-weight:600;">${txt}</span>`;

        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Prestataires &amp; Tiers — Annuaire d'urgence</h1>
                    <p>Dedienne Aerospace · Contacts d'escalade et risque fournisseur · Édité le ${esc(dateJour)}</p>
                </div>

                <div class="dashboard-header no-print">
                    <div>
                        <h1>Prestataires &amp; Tiers</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Annuaire d'urgence, d'escalade et évaluation du risque chaîne d'approvisionnement</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button onclick="window.print()" style="background-color: var(--primary);">Imprimer l'annuaire</button>
                        <button id="addBtn" style="background-color: var(--color-success);">Nouveau Contact</button>
                    </div>
                </div>

                <div class="synthese-message info no-print" style="font-size:0.9rem; padding:10px;">
                    <strong>Annuaire de crise &amp; risque tiers :</strong> Enregistrez les contacts vitaux (Hébergeur Cloud, Assureur Cyber, Fournisseur réseau, ANSSI, CNIL…) et évaluez le risque que chaque fournisseur fait porter à votre chaîne d'approvisionnement ${Help.tip("NIS2 (art. 21) impose de gérer la sécurité de sa chaîne d'approvisionnement ; DORA encadre le risque lié aux prestataires TIC.")}. Pensez à l'imprimer !
                </div>

                ${prestataires.length ? `<div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap; margin:0 0 16px;">
                    ${chip("#e3f2fd", "#0d47a1", `Tiers : ${prestataires.length}`)}
                    ${chip("#eee", "#333", `Évalués : ${evalues}/${prestataires.length}`)}
                    ${chip(eleves ? "#ffebee" : "#e8f5e9", eleves ? "#b71c1c" : "#1b5e20", `Risque élevé / critique : ${eleves}`)}
                    ${chip("#fff3e0", "#e65100", `Couverture chaîne d'appro : ${avgCov}%`)}
                </div>` : ""}

                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="no-print" style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Société / Entité</th>
                            <th>Type de contact</th>
                            <th>Risque fournisseur</th>
                            <th>Contact Urgence</th>
                            <th>Notes &amp; Procédure</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='6' style='text-align:center;'>Aucun contact externe enregistré.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addBtn").onclick = renderCreate;

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deletePrestataire(id),
            confirm: (n) => `Confirmer la suppression de ${n} contact(s) ?`,
            toast: (n) => `${n} contact(s) supprimé(s).`,
            onDone: () => renderList()
        });

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
                </div>

                ${riskSectionHtml()}

                <div style="max-width:600px; margin-top: 20px;">
                    <button id="saveBtn" style="background:var(--color-success);">Enregistrer le contact</button>
                    <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/prestataires");

        document.getElementById("saveBtn").onclick = () => {
            const soc = document.getElementById("societe").value.trim();
            if (!soc) return alert("Le nom de la société est obligatoire.");

            DataStore.addPrestataire(Object.assign({
                id: "PREST-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
                societe: soc,
                type: document.getElementById("type").value,
                phone: document.getElementById("phone").value.trim(),
                email: document.getElementById("email").value.trim(),
                notes: document.getElementById("notes").value.trim()
            }, collectRisk()));

            if (window.showToast) window.showToast("Contact ajouté à l'annuaire.", "success");
            Router.navigateTo("/prestataires");
        };

        updateRiskPreview();
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const c = DataStore.getPrestataires().find(x => x.id === id);
        if (!c) return Router.navigateTo("/prestataires");

        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Édition : ${esc(c.societe)}</h1>
                    <button id="delBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Société / Entité <span style="color:red">*</span></label>
                        <input id="societe" value="${esc(c.societe)}" required />
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
                            <input id="phone" value="${esc(c.phone || "")}" />
                        </div>
                        <div class="form-group">
                            <label>Email de support/contact</label>
                            <input id="email" type="email" value="${esc(c.email || "")}" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes / Procédure d'appel</label>
                        <textarea id="notes" style="min-height:80px;">${esc(c.notes || "")}</textarea>
                    </div>
                </div>

                ${riskSectionHtml(c)}

                <div style="max-width:600px; margin-top: 20px;">
                    <button id="saveBtn" style="background:var(--color-success);">Mettre à jour</button>
                    <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
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
            Object.assign(c, collectRisk());

            DataStore.updatePrestataire(c);
            if (window.showToast) window.showToast("Contact mis à jour.", "success");
            Router.navigateTo("/prestataires");
        };

        UI.wireDelete({
            button: "delBtn",
            confirm: "Confirmer la suppression de ce contact de l'annuaire ?",
            remove: () => DataStore.deletePrestataire(id),
            redirect: "/prestataires"
        });

        updateRiskPreview();
    }

    return { renderList, renderDetail, updateRiskPreview };
})();
