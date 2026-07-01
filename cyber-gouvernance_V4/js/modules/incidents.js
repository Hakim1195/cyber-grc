// Emplacement : js/modules/incidents.js
// Nom du fichier : incidents.js
//
// Registre des INCIDENTS de sécurité (chantier 4). Chaque incident : détection,
// gravité, actifs touchés, description, actions immédiates, cause racine, actions
// correctives (liées au plan d'actions), statut, déclarations ANSSI/CNIL, lien
// vers un risque EBIOS. Aide pédagogique sur les délais NIS2 (24 h/72 h) & RGPD (72 h).

const IncidentsModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    const TYPES = ["Hameçonnage", "Rançongiciel", "Intrusion / compromission", "Fuite de données",
        "Déni de service (DoS)", "Perte / vol de matériel", "Erreur / mauvaise manipulation",
        "Malveillance interne", "Autre"];
    const STATUTS = ["nouveau", "en cours", "résolu", "clôturé"];
    const GRAVITES = ["faible", "moyenne", "élevée", "critique"];
    const DECLARATIONS = ["non requise", "à déclarer", "déclarée"];

    function graviteBadge(g) {
        const cls = { "faible": "status-non-applicable", "moyenne": "status-partiellement-conforme",
            "élevée": "status-non-conforme", "critique": "status-critique" }[g] || "status-non-applicable";
        return `<span class="status ${cls}">${escapeHtml(g || "—")}</span>`;
    }
    function statutBadge(s) {
        const cls = { "nouveau": "status-non-conforme", "en cours": "status-partiellement-conforme",
            "résolu": "status-conforme", "clôturé": "status-non-applicable" }[s] || "status-non-applicable";
        return `<span class="status ${cls}">${escapeHtml(s || "—")}</span>`;
    }
    function declarationBadge(v) {
        const cls = { "déclarée": "decl-ok", "à déclarer": "decl-todo", "non requise": "decl-na" }[v] || "decl-na";
        return `<span class="status ${cls}">${escapeHtml(v || "non requise")}</span>`;
    }
    function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : "—"; }

    function selectHtml(id, options, selected, withEmpty) {
        const opts = (withEmpty ? `<option value="">${escapeHtml(withEmpty)}</option>` : "") +
            options.map(o => `<option value="${escapeHtml(o)}" ${o === selected ? "selected" : ""}>${escapeHtml(o.charAt(0).toUpperCase() + o.slice(1))}</option>`).join("");
        return `<select id="${id}">${opts}</select>`;
    }

    /* =========================
       LISTE
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const incidents = [...DataStore.getIncidents()].sort((a, b) =>
            (b.date_detection || "").localeCompare(a.date_detection || ""));

        const enCours = incidents.filter(i => i.statut === "nouveau" || i.statut === "en cours").length;
        const aDeclarer = incidents.filter(i => i.declaration_anssi === "à déclarer" || i.declaration_cnil === "à déclarer").length;

        const rows = incidents.map(i => `
            <tr class="clickable-row" data-id="${i.id}">
                <td><strong>${escapeHtml(i.titre)}</strong></td>
                <td>${escapeHtml(i.type || "—")}</td>
                <td>${graviteBadge(i.gravite)}</td>
                <td>${statutBadge(i.statut)}</td>
                <td>${fmtDate(i.date_detection)}</td>
                <td style="font-size:0.8rem;">
                    <span title="Déclaration ANSSI">A: ${declarationBadge(i.declaration_anssi)}</span>
                    <span title="Déclaration CNIL" style="margin-left:4px;">C: ${declarationBadge(i.declaration_cnil)}</span>
                </td>
            </tr>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Registre des incidents</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Journal des incidents de sécurité et de leur traitement. ${Help.tip("Consigner chaque incident (même mineur) permet d'apprendre, de prouver sa diligence et de respecter les obligations de déclaration (NIS2, RGPD).")}</p>
                    </div>
                    <button id="addBtn" style="background:var(--primary);">Déclarer un incident</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:1.5rem;">
                    <div class="dashboard-card" style="text-align:center;">
                        <h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Total</h3>
                        <div class="big-kpi" style="font-size:2.4rem;">${incidents.length}</div>
                    </div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-warning);">
                        <h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">En traitement</h3>
                        <div class="big-kpi" style="font-size:2.4rem; color:var(--color-warning);">${enCours}</div>
                    </div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-danger);">
                        <h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">À déclarer</h3>
                        <div class="big-kpi" style="font-size:2.4rem; color:var(--color-danger);">${aDeclarer}</div>
                    </div>
                </div>

                ${incidents.length === 0
                    ? `<div class="empty-state"><h3>Aucun incident enregistré</h3><p>C'est une bonne nouvelle. En cas d'événement de sécurité, déclarez-le ici pour en assurer le suivi.</p><button id="addBtn2" style="background:var(--primary);">Déclarer un incident</button></div>`
                    : `<table class="data-table">
                        <thead><tr><th>Intitulé</th><th>Type</th><th>Gravité</th><th>Statut</th><th>Détection</th><th>Déclarations</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`}
            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addBtn2"); if (b2) b2.onclick = add;
        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/incidents/" + r.dataset.id));
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        const todayIso = new Date().toISOString().slice(0, 10);
        app.innerHTML = `
            <section class="page">
                <h1>Déclarer un incident</h1>
                <div class="dashboard-card" style="max-width:820px;">
                    ${formFieldsHtml({ date_detection: todayIso })}
                    <div style="margin-top:20px;">
                        <button id="save">Enregistrer</button>
                        <button id="cancel" style="margin-left:10px; background:var(--color-gray);">Annuler</button>
                    </div>
                </div>
            </section>`;

        document.getElementById("save").onclick = () => {
            const inc = collectForm();
            if (!inc) return;
            inc.id = "INC-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
            inc.updatedAt = Date.now();
            DataStore.addIncident(inc);
            if (window.showToast) window.showToast("Incident enregistré.", "success");
            Router.navigateTo("/incidents/" + inc.id);
        };
        document.getElementById("cancel").onclick = () => Router.navigateTo("/incidents");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const app = document.getElementById("app");
        const inc = DataStore.getIncidentById(id);
        if (!inc) {
            app.innerHTML = `<section class="page"><h1>Incident introuvable</h1><button onclick="Router.navigateTo('/incidents')">Retour</button></section>`;
            return;
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(inc.titre)}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;"><a href="#/incidents" style="color:var(--accent);">Registre des incidents</a></p>
                    </div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>

                ${deadlineBannerHtml(inc)}

                <div class="dashboard-card" style="max-width:900px;">
                    ${formFieldsHtml(inc)}
                    <div style="margin-top:20px;"><button id="saveBtn">Mettre à jour</button></div>
                </div>

                <div class="dashboard-card" style="max-width:900px; margin-top:1.5rem;">
                    <div class="ref-actions-head">
                        <strong>Actions correctives ${Help.tip("Mesures de remédiation pour éviter que l'incident ne se reproduise. Elles alimentent le plan d'actions global.")}</strong>
                        <button id="addActionBtn" style="font-size:0.8rem; padding:4px 10px;">Planifier une action</button>
                    </div>
                    <div id="actionsList">${actionsListHtml(inc.id)}</div>
                    <form id="actionForm" class="ref-action-form" hidden>
                        <div class="ref-action-form__row">
                            <input id="actTitre" class="ref-act-titre" placeholder="Intitulé de l'action *" />
                            <select id="actPrio"><option>Basse</option><option selected>Moyenne</option><option>Haute</option><option>Critique</option></select>
                            <input type="date" id="actEcheance" />
                            <button type="button" id="actSave">Créer</button>
                        </div>
                    </form>
                </div>
            </section>`;

        document.getElementById("saveBtn").onclick = () => {
            const data = collectForm();
            if (!data) return;
            Object.assign(inc, data, { updatedAt: Date.now() });
            DataStore.updateIncident(inc);
            if (window.showToast) window.showToast("Incident mis à jour.", "success");
            renderDetail(inc.id);
        };
        document.getElementById("deleteBtn").onclick = () => {
            if (confirm("Supprimer cet incident ? Les actions correctives liées seront également supprimées.")) {
                DataStore.deleteIncident(inc.id);
                if (window.showToast) window.showToast("Incident supprimé.", "success");
                Router.navigateTo("/incidents");
            }
        };

        // Actions correctives
        const form = document.getElementById("actionForm");
        document.getElementById("addActionBtn").onclick = () => { form.hidden = !form.hidden; if (!form.hidden) document.getElementById("actTitre").focus(); };
        document.getElementById("actSave").onclick = () => {
            const titre = document.getElementById("actTitre").value.trim();
            if (!titre) { alert("L'intitulé de l'action est obligatoire."); return; }
            DataStore.addAction({
                id: "ACT-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
                titre, priorite: document.getElementById("actPrio").value, statut: "à faire",
                responsable: "", echeance: document.getElementById("actEcheance").value, commentaire: "",
                exigence_id: null, risque_id: null, evaluation_id: null, incident_id: inc.id
            });
            if (window.showToast) window.showToast("Action corrective créée.", "success");
            document.getElementById("actionsList").innerHTML = actionsListHtml(inc.id);
            form.hidden = true;
        };
    }

    function actionsListHtml(incidentId) {
        const actions = DataStore.getActionsByIncident(incidentId);
        if (actions.length === 0) return `<p style="color:var(--text-muted); font-size:0.85rem;">Aucune action corrective planifiée.</p>`;
        return `<ul class="ref-actions-list">${actions.map(a => {
            const cls = String(a.statut).toLowerCase() === "terminée" ? "status-conforme" : (String(a.statut).toLowerCase() === "en cours" ? "status-partiellement-conforme" : "status-non-conforme");
            return `<li><a href="#/actions/${a.id}" style="color:var(--accent);">${escapeHtml(a.titre)}</a><span class="status ${cls}" style="margin-left:8px;">${escapeHtml(a.statut)}</span></li>`;
        }).join("")}</ul>`;
    }

    /* =========================
       FORMULAIRE (partagé création/édition)
    ========================== */
    function formFieldsHtml(inc) {
        const actifs = DataStore.getActifs();
        const risques = DataStore.getRisques();
        const touches = Array.isArray(inc.actifs_touches) ? inc.actifs_touches : [];
        const actifsHtml = actifs.length === 0
            ? `<p style="color:var(--text-muted); font-size:0.85rem;">Aucun actif cartographié. Ajoutez-en dans « Actifs critiques ».</p>`
            : `<div class="inc-actifs">${actifs.map(a => `<label class="inc-checkbox"><input type="checkbox" class="inc-actif" value="${a.id}" ${touches.includes(a.id) ? "checked" : ""}> ${escapeHtml(a.nom)}</label>`).join("")}</div>`;
        const risquesOpts = `<option value="">— Aucun —</option>` + risques.map(r => `<option value="${r.id}" ${inc.risque_id === r.id ? "selected" : ""}>${escapeHtml(r.nom)}</option>`).join("");

        return `
            <div class="form-group"><label>Intitulé <span style="color:red">*</span></label><input id="titre" value="${escapeHtml(inc.titre || "")}" placeholder="Ex : Tentative d'hameçonnage ciblée sur la comptabilité" /></div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">
                <div class="form-group"><label>Type</label>${selectHtml("type", TYPES, inc.type)}</div>
                <div class="form-group"><label>Gravité</label>${selectHtml("gravite", GRAVITES, inc.gravite || "moyenne")}</div>
                <div class="form-group"><label>Statut</label>${selectHtml("statut", STATUTS, inc.statut || "nouveau")}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Date de détection</label><input type="date" id="date_detection" value="${escapeHtml(inc.date_detection || "")}" /></div>
                <div class="form-group"><label>Date de résolution</label><input type="date" id="date_resolution" value="${escapeHtml(inc.date_resolution || "")}" /></div>
            </div>
            <div class="form-group"><label>Description</label><textarea id="description" placeholder="Que s'est-il passé ?">${escapeHtml(inc.description || "")}</textarea></div>
            <div class="form-group"><label>Actions immédiates (endiguement)</label><textarea id="actions_immediates" placeholder="Mesures prises à chaud pour contenir l'incident">${escapeHtml(inc.actions_immediates || "")}</textarea></div>
            <div class="form-group"><label>Cause racine ${Help.tip("La cause profonde de l'incident (et non seulement ses symptômes). L'identifier permet d'agir durablement.")}</label><textarea id="cause_racine" placeholder="Analyse de la cause profonde">${escapeHtml(inc.cause_racine || "")}</textarea></div>

            <div class="form-group"><label>Actifs touchés</label>${actifsHtml}</div>
            <div class="form-group"><label>Risque EBIOS associé ${Help.tip("Relier l'incident au scénario de risque correspondant nourrit l'analyse de risque (un risque qui se matérialise).")}</label><select id="risque_id">${risquesOpts}</select></div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Déclaration ANSSI ${Help.tip("Entités essentielles/importantes (NIS2) : alerte précoce sous 24 h et notification sous 72 h après connaissance d'un incident important.")}</label>${selectHtml("declaration_anssi", DECLARATIONS, inc.declaration_anssi || "non requise")}</div>
                <div class="form-group"><label>Déclaration CNIL ${Help.tip("Violation de données personnelles (RGPD) : notification à la CNIL sous 72 h, et information des personnes si risque élevé.")}</label>${selectHtml("declaration_cnil", DECLARATIONS, inc.declaration_cnil || "non requise")}</div>
            </div>`;
    }

    function collectForm() {
        const titre = document.getElementById("titre").value.trim();
        if (!titre) { alert("L'intitulé de l'incident est obligatoire."); return null; }
        const actifs_touches = Array.from(document.querySelectorAll(".inc-actif:checked")).map(cb => cb.value);
        return {
            titre,
            type: document.getElementById("type").value,
            gravite: document.getElementById("gravite").value,
            statut: document.getElementById("statut").value,
            date_detection: document.getElementById("date_detection").value,
            date_resolution: document.getElementById("date_resolution").value,
            description: document.getElementById("description").value.trim(),
            actions_immediates: document.getElementById("actions_immediates").value.trim(),
            cause_racine: document.getElementById("cause_racine").value.trim(),
            actifs_touches,
            risque_id: document.getElementById("risque_id").value || null,
            declaration_anssi: document.getElementById("declaration_anssi").value,
            declaration_cnil: document.getElementById("declaration_cnil").value
        };
    }

    // Bannière de rappel des délais réglementaires si une déclaration est à faire.
    function deadlineBannerHtml(inc) {
        const pending = inc.declaration_anssi === "à déclarer" || inc.declaration_cnil === "à déclarer";
        if (!pending || !inc.date_detection) return "";
        const heures = Math.floor((Date.now() - new Date(inc.date_detection).getTime()) / 36e5);
        const parts = [];
        if (inc.declaration_anssi === "à déclarer") parts.push(`ANSSI/NIS2 : alerte 24 h · notification 72 h`);
        if (inc.declaration_cnil === "à déclarer") parts.push(`CNIL/RGPD : 72 h`);
        const urgent = heures >= 72;
        return `<div class="synthese-message ${urgent ? "danger" : "warning"}" style="padding:12px; margin-bottom:1rem;">
            <strong>Déclaration en attente</strong> — ${escapeHtml(String(heures))} h écoulées depuis la détection. Délais : ${parts.join(" · ")}.
        </div>`;
    }

    return { renderList, renderCreate, renderDetail };
})();
