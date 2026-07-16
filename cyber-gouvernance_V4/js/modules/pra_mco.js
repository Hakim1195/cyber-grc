// Emplacement : js/modules/pra_mco.js
// Nom du fichier : pra_mco.js

const PraMcoModule = (() => {

    /* =========================
       RÉFÉRENTIELS DE SAISIE
    ========================== */
    // Fréquence de récurrence de l'action (« Ponctuelle » = action unique, non répétée).
    const FREQUENCES = ["Ponctuelle", "Hebdomadaire", "Mensuelle", "Trimestrielle", "Semestrielle", "Annuelle"];
    const PRIORITES  = ["Basse", "Moyenne", "Haute", "Critique"];
    const STATUTS    = ["À planifier", "En cours", "Réalisée", "Annulée"];

    // Modèle vierge pour la création (garantit tous les champs du nouveau modèle de suivi).
    function blankMco() {
        return {
            id: "", titre: "", description: "", responsable: "",
            frequence: "Ponctuelle", priorite: "Moyenne",
            datePrevue: "", dateReelle: "", dateCloture: "",
            statut: "À planifier", avancement: 0, commentaire: ""
        };
    }

    /* =========================
       HELPERS D'AFFICHAGE
    ========================== */
    // Une action est « en retard » si sa date programmée est passée alors qu'elle
    // n'est ni réalisée ni annulée. Exposé pour le tableau de bord (source unique).
    function isEnRetard(m) {
        if (!m || !m.datePrevue) return false;
        if (m.statut === "Réalisée" || m.statut === "Annulée") return false;
        const d = new Date(m.datePrevue + "T00:00:00");
        if (isNaN(d.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d < today;
    }

    // Classe sémantique du badge de statut (couleurs strictes du design system).
    function statutClass(statut) {
        if (statut === "Réalisée") return "status-conforme";
        if (statut === "En cours") return "status-partiellement-conforme";
        return "status-non-applicable"; // « À planifier » et « Annulée » : neutre
    }

    // Couleur d'accent de la priorité (même convention que le plan d'actions).
    function prioColor(priorite) {
        if (priorite === "Critique") return "var(--color-danger)";
        if (priorite === "Haute") return "var(--color-warning)";
        if (priorite === "Moyenne") return "var(--color-info)";
        return "var(--text-muted)";
    }

    function clampPct(v) {
        const n = parseInt(v, 10);
        if (isNaN(n)) return 0;
        return Math.max(0, Math.min(100, n));
    }

    function fmtDate(iso) {
        return iso ? new Date(iso + "T00:00:00").toLocaleDateString('fr-FR') : "—";
    }

    function optionsHtml(list, current) {
        return list.map(v => `<option value="${escapeHtml(v)}" ${v === current ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
    }

    /* =========================
       LISTE DES ACTIONS MCO
    ========================== */
    function renderList() {
        const mco = DataStore.getMcoActions();
        const app = document.getElementById("app");

        const enRetard = mco.filter(isEnRetard).length;

        const rows = mco.map(m => {
            const retard = isEnRetard(m);
            const av = clampPct(m.avancement);
            const avColor = av >= 100 ? "var(--color-success)" : "var(--accent)";
            const prio = m.priorite || "Moyenne";
            return `
                <tr class="clickable-row" data-id="${m.id}">
                    <td style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                        <input type="checkbox" class="row-cb" data-id="${m.id}">
                    </td>
                    <td>
                        <strong>${escapeHtml(m.titre)}</strong>
                        ${m.frequence && m.frequence !== "Ponctuelle" ? `<div style="font-size:0.78rem; color:var(--text-muted);">Récurrence : ${escapeHtml(m.frequence)}</div>` : ""}
                    </td>
                    <td>${m.responsable ? escapeHtml(m.responsable) : "<span style='color:var(--text-muted);'>Non assigné</span>"}</td>
                    <td><strong style="color:${prioColor(prio)};">${escapeHtml(prio)}</strong></td>
                    <td style="${retard ? "color:var(--color-danger); font-weight:600;" : ""}">${fmtDate(m.datePrevue)}</td>
                    <td>
                        <span class="status ${statutClass(m.statut)}">${escapeHtml(m.statut || "À planifier")}</span>
                        ${retard ? ` <span class="status status-non-conforme">En retard</span>` : ""}
                    </td>
                    <td style="min-width:130px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="progress-bar small" style="flex:1; margin:0; height:8px;"><div class="progress-fill" style="width:${av}%; background:${avColor};"></div></div>
                            <span style="font-size:0.8rem; color:var(--text-muted); min-width:34px; text-align:right;">${av}%</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Actions Préalables (MCO) ${Help.tip("Maintien en Condition Opérationnelle : actions qui garantissent que le PCA/PRA reste efficace dans le temps (tests d'onduleurs, mise à jour des procédures, vérification des sauvegardes). Chaque action est planifiée, affectée à un responsable et suivie jusqu'à sa clôture.")}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Planification et suivi des actions de maintien en condition opérationnelle du PCA/PRA</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button id="addBtn" style="background-color: var(--primary);">Nouvelle Action MCO</button>
                    </div>
                </div>

                ${enRetard > 0 ? `
                <div class="synthese-message" style="background:#f8d7da; border-left:4px solid var(--color-danger); color:#721c24; font-size:0.9rem; padding:10px; margin-bottom:12px;">
                    <strong>${enRetard} action(s) en retard :</strong> leur date programmée est dépassée et elles ne sont ni réalisées ni annulées.
                </div>` : `
                <div class="synthese-message info" style="font-size:0.9rem; padding:10px;">
                    <strong>Astuce :</strong> Planifiez ici les actions récurrentes qui garantissent que le plan fonctionne le jour J (vérification des générateurs, tests de restauration des sauvegardes, mises à jour des annuaires...). Assignez un responsable, une échéance et suivez l'avancement.
                </div>`}

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Action préalable</th>
                            <th>Responsable</th>
                            <th>Priorité</th>
                            <th>Programmée</th>
                            <th>Statut</th>
                            <th>Avancement</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='7' style='text-align:center;'>Aucune action de maintien définie.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addBtn").onclick = renderCreate;

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteMcoAction(id),
            confirm: (n) => `Confirmer la suppression de ${n} action(s) de MCO ?`,
            toast: (n) => `${n} action(s) supprimée(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/mco/${row.dataset.id}`);
        });
    }

    /* =========================
       FORMULAIRE PARTAGÉ (création + édition)
    ========================== */
    // Champs du formulaire, pré-remplis à partir de `m` (modèle vierge pour la création).
    function formMarkup(m) {
        return `
            <div class="form-group">
                <label>Définition de l'action <span style="color:red">*</span> ${Help.tip("Intitulé court et actionnable de la tâche de maintien (ex : « Test de restauration des sauvegardes serveurs »).")}</label>
                <input id="titre" value="${escapeHtml(m.titre)}" placeholder="Ex: Test de restauration des sauvegardes" required />
            </div>

            <div class="form-group">
                <label>Description détaillée</label>
                <textarea id="description" placeholder="Ce qui doit être fait, périmètre concerné, critères de réussite...">${escapeHtml(m.description || "")}</textarea>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group">
                    <label>Responsable de l'action</label>
                    <input id="responsable" value="${escapeHtml(m.responsable || "")}" placeholder="Nom / fonction" />
                </div>
                <div class="form-group">
                    <label>Priorité</label>
                    <select id="priorite">${optionsHtml(PRIORITES, m.priorite || "Moyenne")}</select>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group">
                    <label>Fréquence ${Help.tip("Cadence de répétition de l'action. « Ponctuelle » pour une action unique ; sinon la périodicité attendue du maintien.")}</label>
                    <select id="frequence">${optionsHtml(FREQUENCES, m.frequence || "Ponctuelle")}</select>
                </div>
                <div class="form-group">
                    <label>Statut ${Help.tip("Avancement du cycle de vie : À planifier → En cours → Réalisée (ou Annulée). Passer à « Réalisée » complète automatiquement l'avancement et la date de réalisation.")}</label>
                    <select id="statut">${optionsHtml(STATUTS, m.statut || "À planifier")}</select>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">
                <div class="form-group">
                    <label>Date programmée ${Help.tip("Date à laquelle l'action doit être réalisée. Une date dépassée sans réalisation signale un retard.")}</label>
                    <input type="date" id="datePrevue" value="${escapeHtml(m.datePrevue || "")}" />
                </div>
                <div class="form-group">
                    <label>Date de réalisation ${Help.tip("Date à laquelle l'action a effectivement été menée (peut différer de la date programmée).")}</label>
                    <input type="date" id="dateReelle" value="${escapeHtml(m.dateReelle || "")}" />
                </div>
                <div class="form-group">
                    <label>Date de clôture</label>
                    <input type="date" id="dateCloture" value="${escapeHtml(m.dateCloture || "")}" />
                </div>
            </div>

            <div class="form-group">
                <label>Avancement ${Help.tip("Progression de l'action, de 0 % (non démarrée) à 100 % (terminée).")} : <output id="avancementVal" style="font-weight:600; color:var(--accent);">${clampPct(m.avancement)}%</output></label>
                <input type="range" id="avancement" min="0" max="100" step="5" value="${clampPct(m.avancement)}" style="width:100%;" />
            </div>

            <div class="form-group">
                <label>Commentaire / suivi</label>
                <textarea id="commentaire" placeholder="Remarques, résultat, lien vers le rapport de test...">${escapeHtml(m.commentaire || "")}</textarea>
            </div>
        `;
    }

    // Câble les interactions dynamiques du formulaire (slider ↔ étiquette, auto-complétion « Réalisée »).
    function wireForm() {
        const av = document.getElementById("avancement");
        const avOut = document.getElementById("avancementVal");
        const st = document.getElementById("statut");
        if (av && avOut) {
            av.addEventListener("input", () => { avOut.textContent = av.value + "%"; });
        }
        if (st && av && avOut) {
            st.addEventListener("change", () => {
                if (st.value === "Réalisée") { av.value = 100; avOut.textContent = "100%"; }
                else if (st.value === "À planifier" && Number(av.value) === 100) { av.value = 0; avOut.textContent = "0%"; }
            });
        }
    }

    // Lit le formulaire et applique les automatismes de cohérence (statut « Réalisée »).
    function readForm() {
        const val = id => (document.getElementById(id) ? document.getElementById(id).value : "");
        const statut = val("statut");
        let avancement = clampPct(val("avancement"));
        let dateReelle = val("dateReelle");
        let dateCloture = val("dateCloture");
        const today = new Date().toISOString().slice(0, 10);

        // Cohérence : une action réalisée est à 100 % et datée (comble les champs vides).
        if (statut === "Réalisée") {
            avancement = 100;
            if (!dateReelle) dateReelle = today;
            if (!dateCloture) dateCloture = today;
        }

        return {
            titre: val("titre").trim(),
            description: val("description").trim(),
            responsable: val("responsable").trim(),
            frequence: val("frequence"),
            priorite: val("priorite"),
            datePrevue: val("datePrevue"),
            dateReelle: dateReelle,
            dateCloture: dateCloture,
            statut: statut,
            avancement: avancement,
            commentaire: val("commentaire").trim()
        };
    }

    /* =========================
       CRÉATION D'UNE ACTION MCO
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Nouvelle Action Préalable (MCO)</h1>
                </div>
                <div class="dashboard-card" style="max-width:720px;">
                    ${formMarkup(blankMco())}
                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Enregistrer l'action</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        wireForm();
        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/mco");

        document.getElementById("saveBtn").onclick = () => {
            const form = readForm();
            if (!form.titre) return alert("La définition de l'action est obligatoire.");

            DataStore.addMcoAction(Object.assign({ id: UI.genId("MCO") }, form));

            if (window.showToast) window.showToast("Action MCO créée.", "success");
            Router.navigateTo("/mco");
        };
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const m = DataStore.getMcoActions().find(x => x.id === id);
        if (!m) return Router.navigateTo("/mco");

        const retard = isEnRetard(m);
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1 style="margin-bottom:4px;">${escapeHtml(m.titre)} ${retard ? `<span class="status status-non-conforme" style="font-size:0.8rem; vertical-align:middle;">En retard</span>` : ""}</h1>
                        <p style="color: var(--text-muted); margin:0; font-size:0.85rem;">Action préalable (MCO) · <code>${escapeHtml(m.id)}</code></p>
                    </div>
                    <button id="delBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:720px;">
                    ${formMarkup(m)}
                    <div style="margin-top: 20px;">
                        <button id="saveBtn">Mettre à jour</button>
                        <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        wireForm();
        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/mco");

        document.getElementById("saveBtn").onclick = () => {
            const form = readForm();
            if (!form.titre) return alert("La définition de l'action est obligatoire.");

            Object.assign(m, form);
            DataStore.updateMcoAction(m);
            if (window.showToast) window.showToast("Action mise à jour.", "success");
            Router.navigateTo("/mco");
        };

        UI.wireDelete({
            button: "delBtn",
            confirm: "Confirmer la suppression de cette action de MCO ?",
            remove: () => DataStore.deleteMcoAction(id),
            redirect: "/mco"
        });
    }

    return { renderList, renderDetail, isEnRetard };
})();
