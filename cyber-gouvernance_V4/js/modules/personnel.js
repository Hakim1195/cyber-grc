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
        if (DataStore.getCriseMembres) (DataStore.getCriseMembres() || []).forEach(m => { if (match(m.nom)) add("Cellule de crise", m.role || m.nom, "#/crise/" + m.id); });
        // Participants d'une revue de direction (champ multi-personnes, une personne par ligne).
        if (DataStore.getRevues) (DataStore.getRevues() || []).forEach(r => {
            const parts = String(r.participants || "").split(/\r?\n/).map(s => s.trim().toLowerCase());
            if (parts.indexOf(key) !== -1) add("Revue de direction (participant)", "Revue du " + (r.date || "—"), "#/audits");
        });
        return out;
    }

    // Nombre d'affectations d'une personne (pour la liste).
    function assignmentCount(nom) { return findAssignments(nom).length; }

    /* =========================================================================
       L'ANNUAIRE D'ENTREPRISE — chercher, importer, rafraîchir

       ⚠️ **ON N'IMPORTE PAS L'ANNUAIRE ENTIER, et c'est une décision.** Ce serait
       importer les données personnelles de gens qui ne sont PAS utilisateurs de
       l'outil : `personnes.nom`, `email` et `telephone` figurent au registre de
       l'article 30 du produit lui-même. La recherche exige donc un filtre — le
       serveur la refuse en deçà de deux caractères —, et l'import porte une
       liste de personnes CHOISIES. On importe les gens qu'on veut pouvoir
       désigner, pas un annuaire.

       🛑 **Le produit n'écrit jamais dans l'Active Directory**, et « Rafraîchir »
       ne SUPPRIME rien : il signale les comptes désactivés ou disparus. Une
       personne partie porte encore des actions, des documents et parfois une
       place dans la cellule de crise — effacer sa fiche les orphelinerait en
       silence, et les entités stockant le nom en texte libre, le lien ne se
       reconstituerait pas.
    ========================================================================= */

    function ouvrirRechercheAnnuaire() {
        const hote = document.getElementById("persAnnuaire");
        if (!hote) return;
        hote.innerHTML = `
        <div class="card hab-panneau">
            <h2>Importer depuis l’annuaire d’entreprise</h2>
            <p class="hab-note">Cherchez par nom, prénom, login ou service. Les personnes
            trouvées sont ajoutées à <strong>la filiale active</strong>, avec leur fonction
            et leur service tels que l’annuaire les porte.</p>
            <div class="hab-simu-form">
                <input type="text" id="persAdTexte" placeholder="nom, prénom, login ou service…" maxlength="120">
                <input type="text" id="persAdBase" placeholder="unité d’organisation (facultatif)" maxlength="256">
                <button type="button" id="persAdChercher">Chercher</button>
                <button type="button" id="persAdFermer" class="btn-secondary">Fermer</button>
            </div>
            <div id="persAdResultats"></div>
        </div>`;
        hote.scrollIntoView({ behavior: "smooth", block: "nearest" });

        const chercher = async () => {
            const texte = (document.getElementById("persAdTexte").value || "").trim();
            const base = (document.getElementById("persAdBase").value || "").trim();
            const zone = document.getElementById("persAdResultats");
            zone.innerHTML = '<p class="muted">Lecture de l’annuaire…</p>';
            try {
                const r = await Api.chercherDansAnnuaire(texte, base || null);
                zone.innerHTML = resultatsAnnuaire(r);
                brancherResultats();
            } catch (e) {
                // Le message du SERVEUR : c'est lui qui sait pourquoi il refuse —
                // filtre trop court, annuaire non configuré, droit manquant.
                zone.innerHTML = '<p class="muted">'
                    + escapeHtml(e && e.message ? e.message : "L’annuaire n’a pas répondu.")
                    + "</p>";
            }
        };
        document.getElementById("persAdChercher").addEventListener("click", chercher);
        document.getElementById("persAdTexte").addEventListener("keydown", (e) => {
            if (e.key === "Enter") chercher();
        });
        document.getElementById("persAdFermer").addEventListener("click", () => {
            hote.innerHTML = "";
        });
        document.getElementById("persAdTexte").focus();
    }

    function resultatsAnnuaire(r) {
        const liste = Array.isArray(r.personnes) ? r.personnes : [];
        if (!liste.length) {
            return '<p class="muted">Aucune personne ne correspond. Essayez un nom de '
                 + "famille, un login, ou le nom d’un service.</p>";
        }
        return `
            ${r.tronque ? '<p class="hab-note">La recherche a atteint sa borne : affinez le '
                        + "filtre plutôt que d’importer au hasard.</p>" : ""}
            <table class="data-table">
                <thead><tr>
                    <th style="width:40px"></th><th>Nom</th><th>Login</th>
                    <th>Fonction</th><th>Service</th><th>Courriel</th><th></th>
                </tr></thead>
                <tbody>${liste.map(p => `
                    <tr class="${p.desactive ? "hab-ligne-inactive" : ""}">
                        <td class="t-centre">${p.dejaRattachee
                            ? ""
                            : `<input type="checkbox" class="pers-ad-cb" data-login="${escapeHtml(p.login)}">`}</td>
                        <td><strong>${escapeHtml(p.nomAffichage)}</strong></td>
                        <td>${escapeHtml(p.login)}</td>
                        <td>${p.fonction ? escapeHtml(p.fonction) : "—"}</td>
                        <td>${p.service ? escapeHtml(p.service) : "—"}</td>
                        <td>${p.email ? escapeHtml(p.email) : "—"}</td>
                        <td>${p.dejaRattachee
                            ? '<span class="pers-ad">déjà présente</span>'
                            : p.desactive
                                ? '<span class="hab-ecart-pastille hab-ecart-pastille--grave">compte désactivé</span>'
                                : ""}</td>
                    </tr>`).join("")}</tbody>
            </table>
            <div class="page-actions no-print">
                <button type="button" id="persAdImporter">Importer les personnes cochées</button>
            </div>`;
    }

    function brancherResultats() {
        const bouton = document.getElementById("persAdImporter");
        if (!bouton) return;
        bouton.addEventListener("click", async () => {
            const logins = [...document.querySelectorAll(".pers-ad-cb:checked")]
                .map(cb => cb.dataset.login);
            if (!logins.length) {
                if (window.showToast) showToast("Cochez au moins une personne.", "warning");
                return;
            }
            bouton.disabled = true;
            try {
                const r = await Api.importerDepuisAnnuaire(logins);
                let message = r.creees + " fiche(s) créée(s), " + r.misesAJour + " mise(s) à jour.";
                if (r.introuvables && r.introuvables.length) {
                    message += " " + r.introuvables.length + " introuvable(s).";
                }
                if (r.desactives && r.desactives.length) {
                    message += " " + r.desactives.length
                             + " compte(s) désactivé(s) dans l’annuaire.";
                }
                if (window.showToast) showToast(message, "success");
                /* ⚠️ **`UI.apresEcriture` PUIS `Sync.recharger`, et les deux sont
                 * nécessaires.**
                 *
                 *  · `apresEcriture` pousse d'abord ce que le magasin garde en
                 *    attente : recharger sans cela écraserait une saisie locale
                 *    non encore partie. C'est la barrière du dépôt
                 *    (`test/depot/relecture-apres-ecriture.test.mjs`), née d'un
                 *    défaut vu À TRAVERS APACHE et que le banc navigateur ne peut
                 *    pas voir — il monte le serveur dans le même processus, où la
                 *    poussée aboutit dans la même milliseconde ;
                 *  · `recharger` va chercher ce que l'import a écrit CÔTÉ SERVEUR,
                 *    hors du magasin. Redessiner sans lui montrerait l'écran
                 *    d'avant, et l'utilisateur conclurait que rien ne s'est passé
                 *    (classe des constats Q-201 / Q-207). */
                await UI.apresEcriture(async () => {
                    if (window.Sync && typeof Sync.recharger === "function") {
                        await Sync.recharger();
                    }
                });
                document.getElementById("persAnnuaire").innerHTML = "";
                renderList();
            } catch (e) {
                if (window.showToast) {
                    showToast(e && e.message ? e.message : "Import refusé.", "error");
                }
                bouton.disabled = false;
            }
        });
    }

    async function rafraichirDepuisAnnuaire() {
        const bouton = document.getElementById("rafraichirAdBtn");
        if (bouton) { bouton.disabled = true; bouton.textContent = "Lecture de l’annuaire…"; }
        try {
            const r = await Api.rafraichirDepuisAnnuaire();
            // Même raison qu'à l'import : pousser ce qui attend, puis relire.
            await UI.apresEcriture(async () => {
                if (window.Sync && typeof Sync.recharger === "function") await Sync.recharger();
            });
            renderList();
            const hote = document.getElementById("persAnnuaire");
            if (hote) {
                hote.innerHTML = `
                <div class="card hab-panneau">
                    <h2>Rafraîchissement depuis l’annuaire</h2>
                    <p>${escapeHtml(r.examinees)} fiche(s) examinée(s),
                       <strong>${escapeHtml(r.misesAJour)}</strong> mise(s) à jour.</p>
                    ${(r.partis && r.partis.length) ? `
                        <div class="hab-ecart hab-ecart--grave">
                            <h3>À vérifier <span>(${r.partis.length})</span></h3>
                            <p>${escapeHtml(r.rappel)}</p>
                            <ul>${r.partis.map(x => `<li><strong>${escapeHtml(x.nom)}</strong>
                                <code>${escapeHtml(x.login)}</code> — ${escapeHtml(x.motif)}</li>`).join("")}</ul>
                        </div>` : '<p class="hab-ok">Aucun compte désactivé ni disparu.</p>'}
                    ${r.tronque ? '<p class="hab-note">La borne a été atteinte : toutes les '
                                + "fiches rattachées n’ont pas été examinées.</p>" : ""}
                    <div class="page-actions no-print">
                        <button type="button" id="persRafFermer" class="btn-secondary">Fermer</button>
                    </div>
                </div>`;
                document.getElementById("persRafFermer").addEventListener("click",
                    () => { hote.innerHTML = ""; });
                hote.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        } catch (e) {
            if (window.showToast) {
                showToast(e && e.message ? e.message : "Rafraîchissement impossible.", "error");
            }
            if (bouton) { bouton.disabled = false; bouton.textContent = "Rafraîchir"; }
        }
    }

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
                    <td class="stop-row-click" style="text-align:center; width:40px;"><input type="checkbox" class="row-cb" data-id="${p.id}"></td>
                    <td><strong>${escapeHtml(p.nom)}</strong>${
                        p._loginAnnuaire
                            ? `<span class="pers-ad" title="${escapeHtml("Cette fiche reflète l’entrée d’annuaire « " + p._loginAnnuaire + " » : son nom, sa fonction et son service viennent de là, et « Rafraîchir » les y remet à jour.")}">annuaire</span>`
                            : ""
                    }${
                        p._compteAd
                            ? '<span class="pers-ad pers-ad--compte" title="Cette personne a un COMPTE dans le produit : elle s’y est déjà connectée au moins une fois.">compte</span>'
                            : ""
                    }</td>
                    <td>${p.fonction ? escapeHtml(p.fonction) : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td>${p.service ? escapeHtml(p.service) : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td>${p.email ? `<a href="mailto:${escapeHtml(p.email)}" class="stop-row-click lien-accent">${escapeHtml(p.email)}</a>` : "<span style='color:var(--text-muted);'>—</span>"}</td>
                    <td class="t-centre">${n > 0 ? `<strong>${n}</strong> affectation${n > 1 ? "s" : ""}` : "<span style='color:var(--text-muted);'>—</span>"}</td>
                </tr>`;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Personnel ${Help.tip("Annuaire des personnes et rôles de l'organisation. Chaque personne enregistrée est proposée en autocomplétion partout où l'on saisit un « Responsable » (actions, mesures, exigences, actifs, BIA, MCO, documents, audits…). On peut toujours saisir un nom hors annuaire.")}</h1>
                        <p class="sous-titre">Annuaire réutilisé dans tous les champs « Responsable » du logiciel</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button id="bulkDeleteBtn" style="display:none; background-color:var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button type="button" id="importerAdBtn" class="btn-secondary">Importer depuis l’annuaire</button>
                        <button type="button" id="rafraichirAdBtn" class="btn-secondary" title="Remet à jour les fiches rattachées à un compte, et signale les comptes désactivés ou disparus. Ne supprime rien.">Rafraîchir</button>
                        <button id="addBtn" style="background:var(--primary);">Nouvelle personne</button>
                    </div>
                </div>

                <div id="persAnnuaire"></div>

                <div class="synthese-message info" style="padding:10px; font-size: var(--text-base);">
                    <strong>Astuce :</strong> les personnes enregistrées ici apparaissent en <strong>suggestions</strong> dans tous les champs « Responsable ». Ouvrez une fiche pour voir <strong>tout ce qui lui est affecté</strong>.
                    ${personnes.length
                        ? ` <strong>${personnes.filter(x => x._loginAnnuaire).length}</strong> fiche(s) sur ${personnes.length} reflètent une entrée de l’annuaire d’entreprise, dont <strong>${personnes.filter(x => x._compteAd).length}</strong> qui portent un compte du produit.`
                        : ""}
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

        const importer = document.getElementById("importerAdBtn");
        if (importer) importer.addEventListener("click", ouvrirRechercheAnnuaire);
        const rafraichir = document.getElementById("rafraichirAdBtn");
        if (rafraichir) rafraichir.addEventListener("click", rafraichirDepuisAnnuaire);

        // La case à cocher (et le lien courriel) ne doivent pas ouvrir la fiche :
        // conversion de l'ancien attribut `onclick="event.stopPropagation()"`, que la
        // politique de sécurité de contenu de production refuse.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

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
            <div class="form-group"><label>Nom <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="nom" value="${escapeHtml(p.nom || "")}" placeholder="Ex : Jean Dupont" /></div>
            <div class="grille-2">
                <div class="form-group"><label>Fonction / rôle</label><input id="fonction" value="${escapeHtml(p.fonction || "")}" placeholder="Ex : RSSI, DPO, Responsable IT" /></div>
                <div class="form-group"><label>Service / équipe</label><input id="service" value="${escapeHtml(p.service || "")}" placeholder="Ex : Sécurité, Production" /></div>
            </div>
            <div class="grille-2">
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
                <div class="dashboard-card">
                    ${formMarkup({})}
                    <div class="mt-20">
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
            ? `<p class="txt-muted">Aucune affectation trouvée pour « ${escapeHtml(p.nom)} ». Sélectionnez cette personne comme responsable depuis n'importe quelle fiche.</p>`
            : Object.keys(byType).map(type => `
                <div style="margin-bottom:12px;">
                    <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(type)} <span class="ech-count">${byType[type].length}</span></div>
                    <ul class="ref-actions-list">
                        ${byType[type].map(a => `<li><a href="${a.route}" class="lien-accent">${escapeHtml(a.label)}</a></li>`).join("")}
                    </ul>
                </div>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(p.nom)}</h1>
                        <p style="color:var(--text-muted); margin:0; font-size: var(--text-base);">${escapeHtml([p.fonction, p.service].filter(Boolean).join(" · ") || "Personnel")}</p>
                    </div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:1fr 1fr; align-items:start;">
                    <div class="dashboard-card">
                        <h3 class="mt0">Coordonnées</h3>
                        ${formMarkup(p)}
                        <div class="mt-20"><button id="saveBtn">Mettre à jour</button></div>
                    </div>

                    <div class="dashboard-card">
                        <h3 class="mt0">Affectations ${Help.tip("Tout ce à quoi cette personne est rattachée comme responsable dans le logiciel (par correspondance de son nom). Cliquez pour ouvrir la fiche d'origine.")} ${affectations.length ? `<span class="badge" style="background:var(--primary); color:#fff;">${affectations.length}</span>` : ""}</h3>
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
