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

    /* ═══════════════════════════════════════════════════════════════════════
       LES BADGES — §37.3, et le piège qui s'y cache
       ═══════════════════════════════════════════════════════════════════════

       ⚠️ **La classe se choisit sur la valeur STOCKÉE, le libellé s'affiche
       traduit.** Les deux moitiés portaient la même chaîne, et il était donc
       tentant de traduire d'abord puis de chercher la classe — ce qui aurait
       rendu tous les badges gris en anglais, sans une erreur, parce que
       « High » n'est pas une clé de la table. Le défaut a été fabriqué en
       écrivant ces lignes ; il ne réapparaîtra que si quelqu'un refond les
       trois fonctions ensemble.

       `UI.mappedBadge` cherche la classe D'APRÈS le libellé qu'il affiche : il
       ne convient donc plus ici. On passe par `UI.badge(libellé, classe)`, où
       la classe est résolue séparément, sur la valeur brute. */
    function classePour(valeur, table, defaut) {
        return table[valeur] || defaut;
    }
    function graviteBadge(g) {
        return UI.badge(I18n.valeur(g), classePour(g, { "faible": "status-non-applicable", "moyenne": "status-partiellement-conforme",
            "élevée": "status-non-conforme", "critique": "status-critique" }, "status-non-applicable"));
    }
    function statutBadge(s) {
        return UI.badge(I18n.valeur(s), classePour(s, { "nouveau": "status-non-conforme", "en cours": "status-partiellement-conforme",
            "résolu": "status-conforme", "clôturé": "status-non-applicable" }, "status-non-applicable"));
    }
    function declarationBadge(v) {
        const brute = v || "non requise";
        return UI.badge(I18n.valeur(brute), classePour(brute, { "déclarée": "decl-ok", "à déclarer": "decl-todo", "non requise": "decl-na" }, "decl-na"));
    }
    /* §37.6 — l'AFFICHAGE suit la langue ; la valeur stockée reste ISO. */
    /* ⚠️ ÉCHAPPÉ — constat Q-212 de la porte S8. `I18n.date()` a le même repli
       brut que `I18n.valeur()` : une entrée qu'il ne sait pas analyser repart
       en `String(iso)`, telle quelle, et cette valeur vient de la base. Le
       typage `date` de PostgreSQL la masque aujourd'hui ; il ne la masquera
       plus le jour où un champ de date deviendra du texte, ou qu'un import
       posera une valeur libre. Q-203 avait été corrigé au symptôme dans un seul
       module ; la cause vit dans TROIS fonctions sœurs, pas une. */
    function fmtDate(d) { return d ? escapeHtml(I18n.date(d)) : "—"; }

    function selectHtml(id, options, selected, withEmpty) {
        const opts = (withEmpty ? `<option value="">${escapeHtml(withEmpty)}</option>` : "") +
            options.map(o => `<option value="${escapeHtml(o)}" ${o === selected ? "selected" : ""}>${escapeHtml(I18n.valeur(o))}</option>`).join("");
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
                <td>${escapeHtml(i.type ? I18n.valeur(i.type) : "—")}</td>
                <td>${graviteBadge(i.gravite)}</td>
                <td>${statutBadge(i.statut)}</td>
                <td>${fmtDate(i.date_detection)}</td>
                <td style="font-size:0.8rem;">
                    <span title="${t("incidents.declarationAnssi")}">A: ${declarationBadge(i.declaration_anssi)}</span>
                    <span title="${t("incidents.declarationCnil")}" style="margin-left:4px;">C: ${declarationBadge(i.declaration_cnil)}</span>
                </td>
            </tr>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${t("incidents.titre")}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">${t("incidents.sousTitre")} ${Help.tip(t("incidents.sousTitreAide"))}</p>
                    </div>
                    <button id="addBtn" style="background:var(--primary);">${t("incidents.declarer")}</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:1.5rem;">
                    <div class="dashboard-card" style="text-align:center;">
                        <h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">${t("incidents.total")}</h3>
                        <div class="big-kpi" style="font-size:2.4rem;">${incidents.length}</div>
                    </div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-warning);">
                        <h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">${t("incidents.enTraitement")}</h3>
                        <div class="big-kpi" style="font-size:2.4rem; color:var(--color-warning);">${enCours}</div>
                    </div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-danger);">
                        <h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">${t("incidents.aDeclarer")}</h3>
                        <div class="big-kpi" style="font-size:2.4rem; color:var(--color-danger);">${aDeclarer}</div>
                    </div>
                </div>

                ${incidents.length === 0
                    ? `<div class="empty-state"><h3>${t("incidents.aucunTitre")}</h3><p>${t("incidents.aucunTexte")}</p><button id="addBtn2" style="background:var(--primary);">${t("incidents.declarer")}</button></div>`
                    : `<table class="data-table">
                        <thead><tr><th>${t("incidents.colIntitule")}</th><th>${t("commun.type")}</th><th>${t("commun.gravite")}</th><th>${t("commun.statut")}</th><th>${t("incidents.colDetection")}</th><th>${t("incidents.colDeclarations")}</th></tr></thead>
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
                <h1>${t("incidents.declarer")}</h1>
                <div class="dashboard-card" style="max-width:820px;">
                    ${formFieldsHtml({ date_detection: todayIso })}
                    <div style="margin-top:20px;">
                        <button id="save">${t("commun.enregistrer")}</button>
                        <button id="cancel" style="margin-left:10px; background:var(--color-gray);">${t("commun.annuler")}</button>
                    </div>
                </div>
            </section>`;

        document.getElementById("save").onclick = () => {
            const inc = collectForm();
            if (!inc) return;
            inc.id = UI.genId("INC");
            inc.updatedAt = Date.now();
            DataStore.addIncident(inc);
            if (window.showToast) window.showToast(t("incidents.enregistre"), "success");
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
            app.innerHTML = `<section class="page"><h1>${t("incidents.introuvable")}</h1><button type="button" id="backBtn">${t("commun.retour")}</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/incidents"));
            return;
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(inc.titre)}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;"><a href="#/incidents" style="color:var(--accent);">${t("incidents.titre")}</a></p>
                    </div>
                    <button id="deleteBtn" style="background:var(--color-danger);">${t("commun.supprimer")}</button>
                </div>

                ${deadlineBannerHtml(inc)}

                <div class="dashboard-card" style="max-width:900px;">
                    ${formFieldsHtml(inc)}
                    <div style="margin-top:20px;"><button id="saveBtn">${t("commun.mettreAJour")}</button></div>
                </div>

                <div class="dashboard-card" style="max-width:900px; margin-top:1.5rem;">
                    <div class="ref-actions-head">
                        <strong>${t("incidents.actionsCorrectives")} ${Help.tip(t("incidents.actionsCorrectivesAide"))}</strong>
                        <button id="addActionBtn" style="font-size:0.8rem; padding:4px 10px;">${t("incidents.planifierAction")}</button>
                    </div>
                    <div id="actionsList">${actionsListHtml(inc.id)}</div>
                    <form id="actionForm" class="ref-action-form" hidden>
                        <div class="ref-action-form__row">
                            <input id="actTitre" class="ref-act-titre" placeholder="${t("incidents.intituleAction")}" />
                            <select id="actPrio"><option value="Basse">${I18n.valeur("Basse")}</option><option value="Moyenne" selected>${I18n.valeur("Moyenne")}</option><option value="Haute">${I18n.valeur("Haute")}</option><option value="Critique">${I18n.valeur("Critique")}</option></select>
                            <select id="actStatut"><option value="à faire" selected>${I18n.valeur("à faire")}</option><option value="en cours">${I18n.valeur("en cours")}</option><option value="terminée">${I18n.valeur("terminée")}</option></select>
                            <input type="date" id="actEcheance" />
                            <button type="button" id="actSave">${t("commun.creer")}</button>
                        </div>
                    </form>
                </div>

                ${typeof PiecesModule !== "undefined" ? PiecesModule.hoteHtml() : ""}
            </section>`;

        // Pièces jointes (lot L6) : preuves d'un incident — captures, journaux,
        // courriels. Monté APRÈS le rendu, seul moment où le conteneur existe.
        if (typeof PiecesModule !== "undefined") PiecesModule.monter("incidents", inc.id);

        document.getElementById("saveBtn").onclick = () => {
            const data = collectForm();
            if (!data) return;
            Object.assign(inc, data, { updatedAt: Date.now() });
            DataStore.updateIncident(inc);
            if (window.showToast) window.showToast(t("incidents.misAJour"), "success");
            renderDetail(inc.id);
        };
        UI.wireDelete({
            confirm: () => t("incidents.confirmerSuppression"),
            remove: () => DataStore.deleteIncident(inc.id),
            toast: () => t("incidents.supprime"),
            redirect: "/incidents"
        });

        // Actions correctives
        const form = document.getElementById("actionForm");
        document.getElementById("addActionBtn").onclick = () => { form.hidden = !form.hidden; if (!form.hidden) document.getElementById("actTitre").focus(); };
        document.getElementById("actSave").onclick = () => {
            const titre = document.getElementById("actTitre").value.trim();
            if (!titre) { alert(t("incidents.intituleActionObligatoire")); return; }
            DataStore.addAction({
                id: UI.genId("ACT"),
                titre, priorite: document.getElementById("actPrio").value, statut: document.getElementById("actStatut").value,
                responsable: "", echeance: document.getElementById("actEcheance").value, commentaire: "",
                exigence_id: null, risque_id: null, evaluation_id: null, incident_id: inc.id
            });
            if (window.showToast) window.showToast(t("incidents.actionCreee"), "success");
            document.getElementById("actionsList").innerHTML = actionsListHtml(inc.id);
            form.hidden = true;
        };
    }

    function actionsListHtml(incidentId) {
        const actions = DataStore.getActionsByIncident(incidentId);
        if (actions.length === 0) return `<p style="color:var(--text-muted); font-size:0.85rem;">${t("incidents.aucuneActionCorrective")}</p>`;
        return `<ul class="ref-actions-list">${actions.map(a => {
            const cls = String(a.statut).toLowerCase() === "terminée" ? "status-conforme" : (String(a.statut).toLowerCase() === "en cours" ? "status-partiellement-conforme" : "status-non-conforme");
            return `<li><a href="#/actions/${escapeHtml(a.id)}" style="color:var(--accent);">${escapeHtml(a.titre)}</a><span class="status ${cls}" style="margin-left:8px;">${escapeHtml(I18n.valeur(a.statut))}</span></li>`;
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
            ? `<p style="color:var(--text-muted); font-size:0.85rem;">${t("incidents.aucunActif")}</p>`
            : `<div class="inc-actifs">${actifs.map(a => `<label class="inc-checkbox"><input type="checkbox" class="inc-actif" value="${a.id}" ${touches.includes(a.id) ? "checked" : ""}> ${escapeHtml(a.nom)}</label>`).join("")}</div>`;
        const risquesOpts = `<option value="">${t("incidents.aucunOption")}</option>` + risques.map(r => `<option value="${r.id}" ${inc.risque_id === r.id ? "selected" : ""}>${escapeHtml(r.nom)}</option>`).join("");

        return `
            <div class="form-group"><label>${t("incidents.colIntitule")} <span style="color:red">*</span></label><input id="titre" value="${escapeHtml(inc.titre || "")}" placeholder="${t("incidents.intitulePlaceholder")}" /></div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">
                <div class="form-group"><label>${t("commun.type")}</label>${selectHtml("type", TYPES, inc.type)}</div>
                <div class="form-group"><label>${t("commun.gravite")}</label>${selectHtml("gravite", GRAVITES, inc.gravite || "moyenne")}</div>
                <div class="form-group"><label>${t("commun.statut")}</label>${selectHtml("statut", STATUTS, inc.statut || "nouveau")}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>${t("incidents.dateDetection")}</label><input type="date" id="date_detection" value="${escapeHtml(inc.date_detection || "")}" /></div>
                <div class="form-group"><label>${t("incidents.dateResolution")}</label><input type="date" id="date_resolution" value="${escapeHtml(inc.date_resolution || "")}" /></div>
            </div>
            <div class="form-group"><label>${t("commun.description")}</label><textarea id="description" placeholder="${t("incidents.descriptionPlaceholder")}">${escapeHtml(inc.description || "")}</textarea></div>
            <div class="form-group"><label>${t("incidents.actionsImmediates")}</label><textarea id="actions_immediates" placeholder="${t("incidents.actionsImmediatesPlaceholder")}">${escapeHtml(inc.actions_immediates || "")}</textarea></div>
            <div class="form-group"><label>${t("incidents.causeRacine")} ${Help.tip(t("incidents.causeRacineAide"))}</label><textarea id="cause_racine" placeholder="${t("incidents.causeRacinePlaceholder")}">${escapeHtml(inc.cause_racine || "")}</textarea></div>

            <div class="form-group"><label>${t("incidents.actifsTouches")}</label>${actifsHtml}</div>
            <div class="form-group"><label>${t("incidents.risqueAssocie")} ${Help.tip(t("incidents.risqueAssocieAide"))}</label><select id="risque_id">${risquesOpts}</select></div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>${t("incidents.declarationAnssi")} ${Help.tip(t("incidents.anssiAide"))}</label>${selectHtml("declaration_anssi", DECLARATIONS, inc.declaration_anssi || "non requise")}</div>
                <div class="form-group"><label>${t("incidents.declarationCnil")} ${Help.tip(t("incidents.cnilAide"))}</label>${selectHtml("declaration_cnil", DECLARATIONS, inc.declaration_cnil || "non requise")}</div>
            </div>`;
    }

    function collectForm() {
        const titre = document.getElementById("titre").value.trim();
        if (!titre) { alert(t("incidents.intituleObligatoire")); return null; }
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
        if (inc.declaration_anssi === "à déclarer") parts.push(t("incidents.delaiAnssi"));
        if (inc.declaration_cnil === "à déclarer") parts.push(t("incidents.delaiCnil"));
        const urgent = heures >= 72;
        return `<div class="synthese-message ${urgent ? "danger" : "warning"}" style="padding:12px; margin-bottom:1rem;">
            <strong>${t("incidents.declarationEnAttente")}</strong> — ${tHtml("incidents.heuresEcoulees", { heures: heures })} ${escapeHtml(parts.join(" · "))}.
        </div>`;
    }

    return { renderList, renderCreate, renderDetail };
})();
