// Emplacement : js/modules/personnel.js
// Nom du fichier : personnel.js
//
// Module « Personnel » (annuaire, v11) — répertorie les personnes/rôles de l'organisation.
// Ces personnes alimentent l'AUTOCOMPLÉTION de tous les champs « Responsable » du logiciel
// (via le <datalist id="personnes-list"> partagé). Les entités continuent de stocker le NOM
// en texte : aucune rupture avec l'existant, on peut toujours saisir un nom hors annuaire.
// La fiche d'une personne agrège ses « affectations » (correspondance par nom) → on la
// retrouve partout où elle est responsable.

const PersonnelModule = (() => {

    /* =========================
       AFFECTATIONS (cross-référence par nom)
       Lecture seule : on balaie les entités qui portent un champ personne et on retient
       celles dont la valeur correspond (nom, insensible à la casse/espaces).
    ========================== */
    function findAssignments(nom) {
        const key = String(nom == null ? "" : nom).trim().toLowerCase();
        if (!key) return [];
        const match = v => String(v == null ? "" : v).trim().toLowerCase() === key;
        const out = [];
        const add = (type, label, route) => out.push({ type, label: label || "(sans intitulé)", route });

        (DataStore.getActions() || []).forEach(a => { if (match(a.responsable)) add("Action", a.titre, "#/actions/" + a.id); });
        (DataStore.getMesures() || []).forEach(m => { if (match(m.responsable)) add("Mesure de sécurité", m.nom, "#/mesures/" + m.id); });
        (DataStore.getExigences() || []).forEach(e => { if (match(e.responsable)) add("Exigence", (e.code ? e.code + " — " : "") + (e.intitule || ""), "#/exigences/" + e.id); });
        (DataStore.getActifs() || []).forEach(a => { if (match(a.responsable)) add("Actif", a.nom, "#/actifs/" + a.id); });
        (DataStore.getProcessus() || []).forEach(p => { if (match(p.responsable)) add("Processus (BIA)", p.nom, "#/bia/" + p.id); });
        (DataStore.getMcoActions() || []).forEach(m => { if (match(m.responsable)) add("Action MCO", m.titre, "#/mco/" + m.id); });
        (DataStore.getDocuments() || []).forEach(d => { if (match(d.proprietaire)) add("Document (propriétaire)", d.titre, "#/documents/" + d.id); });
        (DataStore.getAudits() || []).forEach(a => {
            if (match(a.auditeur)) add("Audit (auditeur)", a.ref || "Audit", "#/audits/" + a.id);
            if (match(a.audite)) add("Audit (audité)", a.ref || "Audit", "#/audits/" + a.id);
        });
        if (DataStore.getTraitements) (DataStore.getTraitements() || []).forEach(t => { if (match(t.responsable)) add("Traitement RGPD", t.nom || t.finalite || "Traitement", "#/rgpd/" + t.id); });
        return out;
    }

    // Nombre d'affectations d'une personne (pour la liste).
    function assignmentCount(nom) { return findAssignments(nom).length; }

    /* =========================
       LISTE
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const personnes = DataStore.getPersonnes().slice().sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr"));

        const rows = personnes.map(p => {
            const n = assignmentCount(p.nom);
            return `
                <tr class="clickable-row" data-id="${p.id}">
                    <td style="text-align:center; width:40px;" onclick="event.stopPropagation();"><input type="checkbox" class="row-cb" data-id="${p.id}"></td>
                    <td><strong>${escapeHtml(p.nom)}</strong></td>
                    <td>${p.fonction ? escapeHtml(p.fonction) : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td>${p.service ? escapeHtml(p.service) : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td>${p.email ? `<a href="mailto:${escapeHtml(p.email)}" onclick="event.stopPropagation();" style="color:var(--accent);">${escapeHtml(p.email)}</a>` : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td style="text-align:center;">${n > 0 ? `<strong>${n}</strong> affectation${n > 1 ? "s" : ""}` : "<span style='color:var(--text-muted);'>—</span>"}</td>
                </tr>`;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Personnel ${Help.tip("Annuaire des personnes et rôles de l'organisation. Chaque personne enregistrée est proposée en autocomplétion partout où l'on saisit un « Responsable » (actions, mesures, exigences, actifs, BIA, MCO, documents, audits…). On peut toujours saisir un nom hors annuaire.")}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Annuaire réutilisé dans tous les champs « Responsable » du logiciel</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="bulkDeleteBtn" style="display:none; background-color:var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button id="addBtn" style="background:var(--primary);">Nouvelle personne</button>
                    </div>
                </div>

                <div class="synthese-message info" style="padding:10px; font-size:0.9rem;">
                    <strong>Astuce :</strong> les personnes enregistrées ici apparaissent en <strong>suggestions</strong> dans tous les champs « Responsable ». Ouvrez une fiche pour voir <strong>tout ce qui lui est affecté</strong>.
                </div>

                ${personnes.length === 0
                    ? `<div class="empty-state"><h3>Aucune personne enregistrée</h3><p>Ajoutez vos interlocuteurs (RSSI, DPO, responsables métier, IT…) pour les réutiliser partout.</p><button id="addBtn2" style="background:var(--primary);">Ajouter une première personne</button></div>`
                    : `<table class="data-table">
                        <thead>
                            <tr>
                                <th style="width:40px; text-align:center;"><input type="checkbox" id="selectAllCb"></th>
                                <th>Nom</th>
                                <th>Fonction / rôle</th>
                                <th>Service</th>
                                <th>Email</th>
                                <th style="width:140px; text-align:center;">Affectations</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>`}
            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addBtn2"); if (b2) b2.onclick = add;

        UI.wireBulkDelete({
            remove: (id) => DataStore.deletePersonne(id),
            confirm: (n) => `Supprimer ${n} personne(s) de l'annuaire ?\n(Les responsables déjà saisis dans les fiches sont conservés — seul l'annuaire est modifié.)`,
            toast: (n) => `${n} personne(s) supprimée(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/personnel/" + r.dataset.id));
    }

    /* =========================
       FORMULAIRE (création + édition)
    ========================== */
    function formMarkup(p) {
        return `
            <div class="form-group"><label>Nom <span style="color:red">*</span></label><input id="nom" value="${escapeHtml(p.nom || "")}" placeholder="Ex : Jean Dupont" /></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Fonction / rôle</label><input id="fonction" value="${escapeHtml(p.fonction || "")}" placeholder="Ex : RSSI, DPO, Responsable IT" /></div>
                <div class="form-group"><label>Service / équipe</label><input id="service" value="${escapeHtml(p.service || "")}" placeholder="Ex : Sécurité, Production" /></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Email</label><input id="email" type="email" value="${escapeHtml(p.email || "")}" placeholder="prenom.nom@exemple.fr" /></div>
                <div class="form-group"><label>Téléphone</label><input id="telephone" value="${escapeHtml(p.telephone || "")}" placeholder="+33 …" /></div>
            </div>
            <div class="form-group"><label>Notes</label><textarea id="notes" placeholder="Suppléance, périmètre, remarques…">${escapeHtml(p.notes || "")}</textarea></div>`;
    }

    function readForm() {
        const val = id => (document.getElementById(id) ? document.getElementById(id).value.trim() : "");
        return {
            nom: val("nom"), fonction: val("fonction"), service: val("service"),
            email: val("email"), telephone: val("telephone"), notes: val("notes")
        };
    }

    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header"><h1>Nouvelle personne</h1></div>
                <div class="dashboard-card" style="max-width:720px;">
                    ${formMarkup({})}
                    <div style="margin-top:20px;">
                        <button id="saveBtn">Enregistrer</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>`;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/personnel");
        document.getElementById("saveBtn").onclick = () => {
            const form = readForm();
            if (!form.nom) return alert("Le nom est obligatoire.");
            DataStore.addPersonne(Object.assign({ id: UI.genId("PERS") }, form));
            if (window.showToast) window.showToast("Personne ajoutée à l'annuaire.", "success");
            Router.navigateTo("/personnel");
        };
    }

    function renderDetail(id) {
        const p = DataStore.getPersonneById(id);
        if (!p) return Router.navigateTo("/personnel");
        const app = document.getElementById("app");

        const affectations = findAssignments(p.nom);
        // Regroupe par type pour une lecture claire.
        const byType = {};
        affectations.forEach(a => { (byType[a.type] = byType[a.type] || []).push(a); });
        const affectationsHtml = affectations.length === 0
            ? `<p style="color:var(--text-muted);">Aucune affectation trouvée pour « ${escapeHtml(p.nom)} ». Sélectionnez cette personne comme responsable depuis n'importe quelle fiche.</p>`
            : Object.keys(byType).map(type => `
                <div style="margin-bottom:12px;">
                    <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(type)} <span class="ech-count">${byType[type].length}</span></div>
                    <ul class="ref-actions-list">
                        ${byType[type].map(a => `<li><a href="${a.route}" style="color:var(--accent);">${escapeHtml(a.label)}</a></li>`).join("")}
                    </ul>
                </div>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(p.nom)}</h1>
                        <p style="color:var(--text-muted); margin:0; font-size:0.9rem;">${escapeHtml([p.fonction, p.service].filter(Boolean).join(" · ") || "Personnel")}</p>
                    </div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:1fr 1fr; align-items:start;">
                    <div class="dashboard-card">
                        <h3 style="margin-top:0;">Coordonnées</h3>
                        ${formMarkup(p)}
                        <div style="margin-top:20px;"><button id="saveBtn">Mettre à jour</button></div>
                    </div>

                    <div class="dashboard-card">
                        <h3 style="margin-top:0;">Affectations ${Help.tip("Tout ce à quoi cette personne est rattachée comme responsable dans le logiciel (par correspondance de son nom). Cliquez pour ouvrir la fiche d'origine.")} ${affectations.length ? `<span class="badge" style="background:var(--primary); color:#fff;">${affectations.length}</span>` : ""}</h3>
                        ${affectationsHtml}
                    </div>
                </div>
            </section>`;

        document.getElementById("saveBtn").onclick = () => {
            const form = readForm();
            if (!form.nom) return alert("Le nom est obligatoire.");
            Object.assign(p, form);
            DataStore.updatePersonne(p);
            if (window.showToast) window.showToast("Personne mise à jour.", "success");
            renderDetail(p.id);
        };

        UI.wireDelete({
            confirm: () => `Supprimer « ${p.nom} » de l'annuaire ?\n(Les responsables déjà saisis dans les fiches sont conservés — seul l'annuaire est modifié.)`,
            remove: () => DataStore.deletePersonne(p.id),
            toast: "Personne supprimée.",
            redirect: "/personnel"
        });
    }

    return { renderList, renderDetail };
})();
