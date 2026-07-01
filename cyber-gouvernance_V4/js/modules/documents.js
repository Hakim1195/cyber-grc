// Emplacement : js/modules/documents.js
// Nom du fichier : documents.js
//
// Gestion documentaire des POLITIQUES (chantier 5). Registre des documents de
// gouvernance (PSSI, charte, procédures…) : version, propriétaire, statut, date de
// prochaine revue (avec alertes), emplacement (l'app NE stocke PAS les fichiers),
// lien vers les référentiels. Canevas de plans fournis.

const DocumentsModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    const TYPES = ["Politique de sécurité (PSSI)", "Charte informatique", "Procédure",
        "Politique de sauvegarde", "Plan de continuité (PCA/PRA)", "Politique de contrôle d'accès",
        "Politique de gestion des incidents", "Registre", "Autre"];
    const STATUTS = ["brouillon", "en vigueur", "à réviser", "obsolète"];

    // Canevas de plans (pré-remplissent le champ « notes / plan »).
    const CANEVAS = {
        "Politique de sécurité (PSSI)": "1. Objet et périmètre\n2. Rôles et responsabilités\n3. Classification de l'information\n4. Gestion des accès\n5. Sécurité des postes et du réseau\n6. Sauvegardes et continuité\n7. Gestion des incidents\n8. Conformité et revue",
        "Charte informatique": "1. Objet et champ d'application\n2. Usage des moyens informatiques\n3. Règles de mot de passe et d'accès\n4. Messagerie et Internet\n5. Postes nomades et supports amovibles\n6. Ce qui est interdit\n7. Contrôles et sanctions",
        "Plan de continuité (PCA/PRA)": "1. Processus critiques et RTO/RPO\n2. Scénarios de sinistre\n3. Dispositif de repli\n4. Procédures de reprise\n5. Cellule de crise et contacts\n6. Tests et maintien en condition"
    };

    function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : "—"; }
    function statutBadge(s) {
        const cls = { "en vigueur": "status-conforme", "à réviser": "status-partiellement-conforme",
            "brouillon": "status-non-applicable", "obsolète": "status-non-conforme" }[s] || "status-non-applicable";
        return `<span class="status ${cls}">${escapeHtml(s || "—")}</span>`;
    }

    // État de revue à partir de la date de prochaine revue.
    function revueState(dateRevue) {
        if (!dateRevue) return { cls: "", label: "—" };
        const jours = Math.ceil((new Date(dateRevue).getTime() - Date.now()) / 864e5);
        if (jours < 0) return { cls: "decl-todo", label: `en retard (${-jours} j)`, urgent: true, overdue: true };
        if (jours <= 30) return { cls: "decl-todo", label: `dans ${jours} j`, urgent: true };
        return { cls: "decl-ok", label: fmtDate(dateRevue) };
    }

    /* =========================
       LISTE
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const docs = [...DataStore.getDocuments()].sort((a, b) => (a.date_revue || "9999").localeCompare(b.date_revue || "9999"));
        const enVigueur = docs.filter(d => d.statut === "en vigueur").length;
        const aReviser = docs.filter(d => { const r = revueState(d.date_revue); return r.urgent; }).length;

        const rows = docs.map(d => {
            const r = revueState(d.date_revue);
            return `<tr class="clickable-row" data-id="${d.id}">
                <td><strong>${escapeHtml(d.titre)}</strong></td>
                <td style="font-size:0.85rem;">${escapeHtml(d.type || "—")}</td>
                <td style="text-align:center;">${escapeHtml(d.version || "—")}</td>
                <td>${escapeHtml(d.proprietaire || "—")}</td>
                <td>${statutBadge(d.statut)}</td>
                <td>${r.cls ? `<span class="status ${r.cls}">${escapeHtml(r.label)}</span>` : "—"}</td>
            </tr>`;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Gestion documentaire</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Registre des politiques et documents de sécurité. ${Help.tip("Une documentation à jour (PSSI, charte, procédures) est attendue par la plupart des référentiels et par vos clients. L'application référence l'emplacement des documents mais ne stocke pas les fichiers.")}</p>
                    </div>
                    <button id="addBtn" style="background:var(--primary);">Nouveau document</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:1.5rem;">
                    <div class="dashboard-card" style="text-align:center;"><h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Documents</h3><div class="big-kpi" style="font-size:2.4rem;">${docs.length}</div></div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-success);"><h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">En vigueur</h3><div class="big-kpi" style="font-size:2.4rem; color:var(--color-success);">${enVigueur}</div></div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-warning);"><h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Revue à prévoir</h3><div class="big-kpi" style="font-size:2.4rem; color:var(--color-warning);">${aReviser}</div></div>
                </div>

                ${docs.length === 0
                    ? `<div class="empty-state"><h3>Aucun document</h3><p>Référencez vos politiques et procédures pour suivre leurs versions et leurs dates de revue.</p><button id="addBtn2" style="background:var(--primary);">Ajouter un document</button></div>`
                    : `<table class="data-table">
                        <thead><tr><th>Titre</th><th>Type</th><th style="text-align:center;">Version</th><th>Propriétaire</th><th>Statut</th><th>Prochaine revue</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`}
            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addBtn2"); if (b2) b2.onclick = add;
        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/documents/" + r.dataset.id));
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouveau document</h1>
                <div class="dashboard-card" style="max-width:820px;">
                    ${formFieldsHtml({})}
                    <div style="margin-top:20px;"><button id="save">Enregistrer</button><button id="cancel" style="margin-left:10px; background:var(--color-gray);">Annuler</button></div>
                </div>
            </section>`;
        wireCanevas();
        document.getElementById("save").onclick = () => {
            const doc = collectForm();
            if (!doc) return;
            doc.id = "DOC-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            doc.updatedAt = Date.now();
            DataStore.addDocument(doc);
            if (window.showToast) window.showToast("Document enregistré.", "success");
            Router.navigateTo("/documents/" + doc.id);
        };
        document.getElementById("cancel").onclick = () => Router.navigateTo("/documents");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const app = document.getElementById("app");
        const doc = DataStore.getDocumentById(id);
        if (!doc) {
            app.innerHTML = `<section class="page"><h1>Document introuvable</h1><button onclick="Router.navigateTo('/documents')">Retour</button></section>`;
            return;
        }
        const r = revueState(doc.date_revue);
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div><h1>${escapeHtml(doc.titre)}</h1><p style="color:var(--text-muted); margin-top:5px;"><a href="#/documents" style="color:var(--accent);">Gestion documentaire</a></p></div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                ${r.overdue ? `<div class="synthese-message danger" style="padding:12px; margin-bottom:1rem;"><strong>Revue en retard</strong> — la date de revue de ce document est dépassée. Pensez à le mettre à jour et à décaler la prochaine échéance.</div>` : ""}
                <div class="dashboard-card" style="max-width:820px;">
                    ${formFieldsHtml(doc)}
                    <div style="margin-top:20px;"><button id="saveBtn">Mettre à jour</button></div>
                </div>
            </section>`;
        wireCanevas();
        document.getElementById("saveBtn").onclick = () => {
            const data = collectForm();
            if (!data) return;
            Object.assign(doc, data, { updatedAt: Date.now() });
            DataStore.updateDocument(doc);
            if (window.showToast) window.showToast("Document mis à jour.", "success");
            renderDetail(doc.id);
        };
        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("Supprimer ce document du registre ?")) {
                DataStore.deleteDocument(doc.id);
                if (window.showToast) window.showToast("Document supprimé.", "success");
                Router.navigateTo("/documents");
            }
        };
    }

    /* =========================
       FORMULAIRE
    ========================== */
    function formFieldsHtml(doc) {
        const refs = (typeof Referentiels !== "undefined") ? Referentiels.all() : [];
        const linked = Array.isArray(doc.referentiels) ? doc.referentiels : [];
        const typeOpts = TYPES.map(t => `<option value="${escapeHtml(t)}" ${t === doc.type ? "selected" : ""}>${escapeHtml(t)}</option>`).join("");
        const statutOpts = STATUTS.map(s => `<option value="${s}" ${s === (doc.statut || "brouillon") ? "selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");
        const refsHtml = refs.length
            ? `<div class="inc-actifs">${refs.map(rf => `<label class="inc-checkbox"><input type="checkbox" class="doc-ref" value="${escapeHtml(rf.id)}" ${linked.includes(rf.id) ? "checked" : ""}> ${escapeHtml(rf.editeur)}</label>`).join("")}</div>`
            : `<p style="color:var(--text-muted); font-size:0.85rem;">Aucun référentiel chargé.</p>`;
        return `
            <div class="form-group"><label>Titre <span style="color:red">*</span></label><input id="titre" value="${escapeHtml(doc.titre || "")}" placeholder="Ex : Politique de sécurité du SI (PSSI)" /></div>
            <div style="display:grid; grid-template-columns:2fr 1fr 1fr; gap:15px;">
                <div class="form-group"><label>Type</label><select id="type">${typeOpts}</select></div>
                <div class="form-group"><label>Version</label><input id="version" value="${escapeHtml(doc.version || "")}" placeholder="1.0" /></div>
                <div class="form-group"><label>Statut</label><select id="statut">${statutOpts}</select></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Propriétaire</label><input id="proprietaire" value="${escapeHtml(doc.proprietaire || "")}" placeholder="Nom ou fonction" /></div>
                <div class="form-group"><label>Prochaine revue ${Help.tip("Date à laquelle le document devra être revu. Une alerte apparaît à l'approche ou au dépassement de l'échéance.")}</label><input type="date" id="date_revue" value="${escapeHtml(doc.date_revue || "")}" /></div>
            </div>
            <div class="form-group"><label>Emplacement ${Help.tip("Où trouver le document (chemin réseau, GED, URL interne…). L'application ne stocke pas le fichier lui-même.")}</label><input id="emplacement" value="${escapeHtml(doc.emplacement || "")}" placeholder="Ex : \\\\serveur\\qualite\\PSSI_v1.pdf" /></div>
            <div class="form-group"><label>Référentiels couverts</label>${refsHtml}</div>
            <div class="form-group">
                <label>Plan / notes ${Help.tip("Sommaire ou notes. Utilisez un modèle pour partir d'un plan type.")}
                    <select id="canevas" style="margin-left:8px; font-size:0.8rem; padding:2px 6px;"><option value="">— Modèle de plan —</option>${Object.keys(CANEVAS).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("")}</select>
                </label>
                <textarea id="notes" style="min-height:120px;">${escapeHtml(doc.notes || "")}</textarea>
            </div>`;
    }

    function wireCanevas() {
        const sel = document.getElementById("canevas");
        if (!sel) return;
        sel.onchange = () => {
            const tpl = CANEVAS[sel.value];
            if (!tpl) return;
            const ta = document.getElementById("notes");
            if (ta && (!ta.value.trim() || confirm("Remplacer le contenu actuel du plan par le modèle ?"))) ta.value = tpl;
            sel.value = "";
        };
    }

    function collectForm() {
        const titre = document.getElementById("titre").value.trim();
        if (!titre) { alert("Le titre du document est obligatoire."); return null; }
        return {
            titre,
            type: document.getElementById("type").value,
            version: document.getElementById("version").value.trim(),
            statut: document.getElementById("statut").value,
            proprietaire: document.getElementById("proprietaire").value.trim(),
            date_revue: document.getElementById("date_revue").value,
            emplacement: document.getElementById("emplacement").value.trim(),
            referentiels: Array.from(document.querySelectorAll(".doc-ref:checked")).map(cb => cb.value),
            notes: document.getElementById("notes").value.trim()
        };
    }

    return { renderList, renderCreate, renderDetail };
})();
