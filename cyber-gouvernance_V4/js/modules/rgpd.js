// Emplacement : js/modules/rgpd.js
// Nom du fichier : rgpd.js
//
// Registre des TRAITEMENTS RGPD (chantier 6) — article 30 simplifié.
// Chaque traitement : finalité, base légale, personnes concernées, catégories de
// données, destinataires, transferts hors UE, durée de conservation, et mesures de
// sécurité (réutilisant l'entité pivot « Mesure de sécurité »). Registre imprimable.

const RgpdModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    const BASES = ["Consentement", "Contrat", "Obligation légale", "Intérêt légitime",
        "Mission d'intérêt public", "Sauvegarde des intérêts vitaux"];

    function fmtMesures(ids) {
        if (!Array.isArray(ids) || !ids.length) return "—";
        return ids.map(id => { const m = DataStore.getMesureById(id); return m ? escapeHtml(m.nom) : null; })
            .filter(Boolean).join(", ") || "—";
    }

    /* =========================
       LISTE + REGISTRE IMPRIMABLE
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const trs = DataStore.getTraitements();
        const sensibles = trs.filter(t => t.donnees_sensibles).length;
        const dateJour = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });

        const rows = trs.map(t => `
            <tr class="clickable-row" data-id="${t.id}">
                <td><strong>${escapeHtml(t.nom)}</strong></td>
                <td style="font-size:0.9rem;">${escapeHtml(t.finalite || "—")}</td>
                <td>${escapeHtml(t.base_legale || "—")}</td>
                <td style="text-align:center;">${t.donnees_sensibles ? `<span class="status status-non-conforme">Sensibles</span>` : "—"}</td>
                <td style="font-size:0.9rem;">${escapeHtml(t.duree_conservation || "—")}</td>
            </tr>`).join("");

        app.innerHTML = `
            <section class="page rgpd-page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Registre RGPD (traitements)</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Registre des activités de traitement de données personnelles. ${Help.tip("L'article 30 du RGPD impose de tenir un registre des traitements de données personnelles : finalité, base légale, données, durées, destinataires et mesures de sécurité.")}</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        ${trs.length ? `<button id="printBtn" class="btn-secondary">Imprimer le registre</button>` : ""}
                        <button id="addBtn" style="background:var(--primary);">Nouveau traitement</button>
                    </div>
                </div>

                <div class="soa-print-head" style="display:none;">
                    <h1 style="margin-bottom:4px;">Registre des activités de traitement — Article 30 RGPD</h1>
                    <p style="color:var(--text-muted);">Dedienne Aerospace · ${dateJour}</p>
                </div>

                <div class="dashboard-grid no-print" style="grid-template-columns:repeat(2,1fr); margin-bottom:1.5rem;">
                    <div class="dashboard-card" style="text-align:center;"><h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Traitements</h3><div class="big-kpi" style="font-size:2.4rem;">${trs.length}</div></div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-danger);"><h3 style="font-size:0.9rem; color:var(--text-muted); text-transform:uppercase;">Données sensibles</h3><div class="big-kpi" style="font-size:2.4rem; color:var(--color-danger);">${sensibles}</div></div>
                </div>

                ${trs.length === 0
                    ? `<div class="empty-state"><h3>Aucun traitement enregistré</h3><p>Recensez vos traitements de données personnelles (paie, clients, recrutement, vidéosurveillance…).</p><button id="addBtn2" style="background:var(--primary);">Ajouter un traitement</button></div>`
                    : `<table class="data-table soa-table">
                        <thead><tr><th>Traitement</th><th>Finalité</th><th>Base légale</th><th style="text-align:center;">Catégorie</th><th>Conservation</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`}
            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addBtn2"); if (b2) b2.onclick = add;
        const pb = document.getElementById("printBtn"); if (pb) pb.onclick = () => window.print();
        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/rgpd/" + r.dataset.id));
    }

    /* =========================
       CRÉATION / DÉTAIL
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouveau traitement</h1>
                <div class="dashboard-card" style="max-width:860px;">
                    ${formFieldsHtml({})}
                    <div style="margin-top:20px;"><button id="save">Enregistrer</button><button id="cancel" style="margin-left:10px; background:var(--color-gray);">Annuler</button></div>
                </div>
            </section>`;
        document.getElementById("save").onclick = () => {
            const t = collectForm(); if (!t) return;
            t.id = UI.genId("TRT");
            t.updatedAt = Date.now();
            DataStore.addTraitement(t);
            if (window.showToast) window.showToast("Traitement enregistré.", "success");
            Router.navigateTo("/rgpd/" + t.id);
        };
        document.getElementById("cancel").onclick = () => Router.navigateTo("/rgpd");
    }

    function renderDetail(id) {
        const app = document.getElementById("app");
        const t = DataStore.getTraitementById(id);
        if (!t) {
            app.innerHTML = `<section class="page"><h1>Traitement introuvable</h1><button onclick="Router.navigateTo('/rgpd')">Retour</button></section>`;
            return;
        }
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div><h1>${escapeHtml(t.nom)}</h1><p style="color:var(--text-muted); margin-top:5px;"><a href="#/rgpd" style="color:var(--accent);">Registre RGPD</a></p></div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:860px;">
                    ${formFieldsHtml(t)}
                    <div style="margin-top:20px;"><button id="saveBtn">Mettre à jour</button></div>
                </div>
            </section>`;
        document.getElementById("saveBtn").onclick = () => {
            const data = collectForm(); if (!data) return;
            Object.assign(t, data, { updatedAt: Date.now() });
            DataStore.updateTraitement(t);
            if (window.showToast) window.showToast("Traitement mis à jour.", "success");
            renderDetail(t.id);
        };
        UI.wireDelete({
            confirm: "Supprimer ce traitement du registre ?",
            remove: () => DataStore.deleteTraitement(t.id),
            toast: "Traitement supprimé.",
            redirect: "/rgpd"
        });
    }

    /* =========================
       FORMULAIRE
    ========================== */
    function formFieldsHtml(t) {
        const mesures = DataStore.getMesures();
        const linked = Array.isArray(t.mesures_ids) ? t.mesures_ids : [];
        const baseOpts = `<option value="">— À déterminer —</option>` + BASES.map(b => `<option value="${escapeHtml(b)}" ${b === t.base_legale ? "selected" : ""}>${escapeHtml(b)}</option>`).join("");
        const mesuresHtml = mesures.length
            ? `<div class="inc-actifs">${mesures.map(m => `<label class="inc-checkbox"><input type="checkbox" class="trt-mesure" value="${escapeHtml(m.id)}" ${linked.includes(m.id) ? "checked" : ""}> ${escapeHtml(m.nom)}</label>`).join("")}</div>`
            : `<p style="color:var(--text-muted); font-size:0.85rem;">Aucune mesure de sécurité définie. Créez-en dans <a href="#/mesures" style="color:var(--accent);">Mesures de sécurité</a>.</p>`;
        return `
            <div class="form-group"><label>Nom du traitement <span style="color:red">*</span></label><input id="nom" value="${escapeHtml(t.nom || "")}" placeholder="Ex : Gestion de la paie" /></div>
            <div class="form-group"><label>Finalité ${Help.tip("À quoi sert le traitement, l'objectif poursuivi (ex : verser les salaires).")}</label><textarea id="finalite" placeholder="Objectif du traitement">${escapeHtml(t.finalite || "")}</textarea></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Base légale ${Help.tip("Ce qui autorise le traitement au sens du RGPD : consentement, contrat, obligation légale, intérêt légitime…")}</label><select id="base_legale">${baseOpts}</select></div>
                <div class="form-group"><label>Responsable / service</label><input id="responsable" value="${escapeHtml(t.responsable || "")}" /></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Personnes concernées</label><input id="personnes_concernees" value="${escapeHtml(t.personnes_concernees || "")}" placeholder="Ex : salariés, candidats" /></div>
                <div class="form-group"><label>Catégories de données</label><input id="categories_donnees" value="${escapeHtml(t.categories_donnees || "")}" placeholder="Ex : identité, RIB, coordonnées" /></div>
            </div>
            <div class="form-group"><label class="inc-checkbox" style="border:none; background:none; padding:0;"><input type="checkbox" id="donnees_sensibles" ${t.donnees_sensibles ? "checked" : ""}> Données sensibles ${Help.tip("Catégories particulières (article 9) : santé, opinions, biométrie, etc. Leur traitement est encadré plus strictement.")}</label></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                <div class="form-group"><label>Destinataires</label><input id="destinataires" value="${escapeHtml(t.destinataires || "")}" placeholder="Ex : service RH, URSSAF, prestataire paie" /></div>
                <div class="form-group"><label>Transfert hors UE ${Help.tip("Les données sont-elles transférées hors de l'Union européenne ? Si oui, préciser le pays et les garanties.")}</label><input id="transfert_hors_ue" value="${escapeHtml(t.transfert_hors_ue || "")}" placeholder="Non / pays + garanties" /></div>
            </div>
            <div class="form-group"><label>Durée de conservation ${Help.tip("Combien de temps les données sont conservées, et la règle appliquée (ex : 5 ans après la fin du contrat).")}</label><input id="duree_conservation" value="${escapeHtml(t.duree_conservation || "")}" placeholder="Ex : 5 ans" /></div>
            <div class="form-group"><label>Mesures de sécurité ${Help.tip("Reliez les mesures de sécurité (pivot) qui protègent ce traitement : chiffrement, contrôle d'accès, sauvegardes…")}</label>${mesuresHtml}</div>
            <div class="form-group"><label>Notes</label><textarea id="notes">${escapeHtml(t.notes || "")}</textarea></div>`;
    }

    function collectForm() {
        const nom = document.getElementById("nom").value.trim();
        if (!nom) { alert("Le nom du traitement est obligatoire."); return null; }
        return {
            nom,
            finalite: document.getElementById("finalite").value.trim(),
            base_legale: document.getElementById("base_legale").value,
            responsable: document.getElementById("responsable").value.trim(),
            personnes_concernees: document.getElementById("personnes_concernees").value.trim(),
            categories_donnees: document.getElementById("categories_donnees").value.trim(),
            donnees_sensibles: document.getElementById("donnees_sensibles").checked,
            destinataires: document.getElementById("destinataires").value.trim(),
            transfert_hors_ue: document.getElementById("transfert_hors_ue").value.trim(),
            duree_conservation: document.getElementById("duree_conservation").value.trim(),
            mesures_ids: Array.from(document.querySelectorAll(".trt-mesure:checked")).map(cb => cb.value),
            notes: document.getElementById("notes").value.trim()
        };
    }

    return { renderList, renderCreate, renderDetail };
})();
