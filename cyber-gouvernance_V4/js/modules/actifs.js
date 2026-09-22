// Emplacement : js/modules/actifs.js
// Nom du fichier : actifs.js

const ActifsModule = (() => {

    function renderList() {
        const actifs = DataStore.getActifs();
        const app = document.getElementById("app");

        const rows = actifs.map(a => `
            <tr class="clickable-row" data-id="${a.id}">
                <td><strong>${escapeHtml(a.nom)}</strong></td>
                <td>${escapeHtml(a.type)}</td>
                <td>
                    <span class="status" style="background: ${a.criticite === 'critique' ? 'var(--risk-critical)' : a.criticite === 'élevée' ? 'var(--risk-high)' : a.criticite === 'modérée' ? 'var(--risk-medium)' : 'var(--risk-low)'}; color: white;">
                        ${escapeHtml(a.criticite)}
                    </span>
                </td>
                <td>${escapeHtml(a.responsable) || "-"}</td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Actifs</h1>
                        <p class="sous-titre">Périmètre : <strong>Interne (Commun à tous les clients)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <a href="#/imports" class="btn-secondary" data-lecture="ok" title="L'import généralisé : transactionnel (tout ou rien), idempotent par fichier, avec aperçu avant validation et rapport ligne par ligne">Importer…</a>
                        <button id="addActifBtn">Déclarer un actif</button>
                    </div>
                </div>

                <div class="synthese-message info" style="font-size: var(--text-base); padding: 10px; margin-bottom: 20px;">
                    <strong>Import :</strong> il se fait depuis l'écran <a href="#/imports">Imports</a>, qui
                    vaut pour les 23 entités du produit. Vous y téléchargez un modèle prêt à remplir,
                    voyez un <strong>aperçu avant validation</strong>, et obtenez un rapport
                    <strong>ligne par ligne</strong> en cas d'erreur. Un fichier passe entièrement ou
                    pas du tout, et le réenvoyer ne crée rien.
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nom de l'actif</th>
                            <th>Type</th>
                            <th>Criticité (CIA) ${Help.tip("Criticité de l'actif selon les 3 critères de sécurité : Confidentialité, Intégrité, Disponibilité (CIA, ou DICP en français). Plus un actif est critique, plus il justifie des protections renforcées.")}</th>
                            <th>Responsable</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='4' style='text-align:center;'>Aucun actif déclaré.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        const addBtn = document.getElementById("addActifBtn");
        if (addBtn) addBtn.onclick = renderCreate;

        // Téléchargement du modèle d'import
        // ── L'IMPORT A DÉMÉNAGÉ, ET CE N'ÉTAIT PAS UN DÉPLACEMENT COSMÉTIQUE ──
        //
        // Cet écran portait son propre import Excel, qui écrivait DIRECTEMENT
        // dans le `DataStore` : aucune transaction serveur, aucun aperçu, aucune
        // idempotence, et un dédoublonnage approximatif par comparaison de
        // textes. Le lot L7 a livré un moteur qui fait l'inverse sur les 23
        // entités — tout ou rien, idempotent par le fichier, avec un rapport
        // ligne par ligne — et laisser les deux chemins coexister aurait offert
        // à l'utilisateur deux comportements contradictoires derrière le même
        // mot (constat Q-179).
        //
        // Le bouton renvoie donc vers `#/imports`. `js/services/importExcel.js`
        // n'est plus appelé par cet écran.


        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/actifs/${row.dataset.id}`);
        });
    }

    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouvel actif</h1>

                <div class="synthese-message info" style="margin-bottom: 20px; padding: 10px;">
                    Les actifs représentent l'infrastructure interne de votre entreprise. Ils sont indépendants des donneurs d'ordre.
                </div>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>Nom de l'actif <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <input id="nom" placeholder="Ex: Serveur ERP, Réseau OT..." required />
                    </div>

                    <div class="grille-2">
                        <div class="form-group">
                            <label>Type</label>
                            <select id="type">
                                <option value="Matériel">Matériel (Serveur, Poste, Réseau)</option>
                                <option value="Logiciel">Logiciel (Application, OS)</option>
                                <option value="Donnée">Donnée (Base de données, Fichiers)</option>
                                <option value="Service">Service (Cloud, SaaS)</option>
                                <option value="Humain">Humain (Prestataire, Collaborateur)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Criticité Globale (CIA) ${Help.tip("Criticité de l'actif selon les 3 critères de sécurité : Confidentialité, Intégrité, Disponibilité (CIA, ou DICP en français). Plus un actif est critique, plus il justifie des protections renforcées.")}</label>
                            <select id="criticite">
                                <option value="faible">Faible</option>
                                <option value="modérée">Modérée</option>
                                <option value="élevée">Élevée</option>
                                <option value="critique">Critique</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Responsable de l'actif</label>
                        <input id="responsable" list="personnes-list" placeholder="Propriétaire métier ou IT" />
                    </div>

                    <div class="form-group">
                        <label>Description / Emplacement</label>
                        <textarea id="description"></textarea>
                    </div>

                    <div class="mt-20">
                        <button id="save">Enregistrer</button>
                        <button id="cancel" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom de l'actif est obligatoire.");

            DataStore.addActif({
                id: UI.genId("ACTIF"),
                nom: nom,
                type: document.getElementById("type").value,
                criticite: document.getElementById("criticite").value,
                responsable: document.getElementById("responsable").value.trim(),
                description: document.getElementById("description").value.trim(),
                risques_lies: []
            });

            Router.navigateTo("/actifs");
        };

        document.getElementById("cancel").onclick = () => Router.navigateTo("/actifs");
    }

    function renderDetail(id) {
        const actif = DataStore.getActifById(id);
        const tousRisques = DataStore.getRisques();
        const app = document.getElementById("app");

        if (!actif) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Actif introuvable.</p><button type="button" id="backBtn">Retour</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/actifs"));
            return;
        }

        actif.risques_lies = Array.isArray(actif.risques_lies) ? actif.risques_lies : [];
        actif.dependances = Array.isArray(actif.dependances) ? actif.dependances.filter(d => d && d.to) : [];

        // Dépendances de cartographie (v9, enrichies par la migration `062`).
        //
        // ⚠️ **`delai` et `degrade` sont conservés tels quels, `null` compris.** `null`
        // veut dire « non renseigné » — jamais « immédiat », jamais « aucun mode
        // dégradé » : les dépendances saisies avant la `062` n'ont rien dit là-dessus,
        // et leur faire dire le pire ferait paraître mesurée une chronologie que
        // personne n'a établie (motif du constat Q-192).
        const deps = actif.dependances.map(d => ({
            to: d.to,
            type: d.type || "dep",
            delai: d.delai || null,
            degrade: d.degrade || null
        }));

        // v29 (migration `062`) — qui EXPLOITE cet actif.
        actif.prestataires_lies = Array.isArray(actif.prestataires_lies)
            ? actif.prestataires_lies.filter(x => x && x.to) : [];
        const tiers = actif.prestataires_lies.map(x => ({
            to: x.to, nature: x.nature || "exploitation"
        }));
        const tousPrestataires = (DataStore.getPrestataires ? DataStore.getPrestataires() : []) || [];
        const NATURES = (typeof CartographieModule !== "undefined" && CartographieModule.naturesTiers)
            ? CartographieModule.naturesTiers()
            : [{ code: "exploitation", libelle: "Exploité par" }];
        const DELAIS = (typeof CartographieModule !== "undefined" && CartographieModule.delais)
            ? CartographieModule.delais() : [];
        const DEGRADES = (typeof CartographieModule !== "undefined" && CartographieModule.degrades)
            ? CartographieModule.degrades() : [];
        const nomPrestataire = pid => {
            const p = tousPrestataires.find(x => x.id === pid);
            return p ? (p.nom || p.raison_sociale || "?") : "?";
        };
        const libelleNature = code =>
            (NATURES.find(n => n.code === code) || {}).libelle || code;
        const autresActifs = DataStore.getActifs().filter(a => a.id !== actif.id);
        const DT = (typeof CartographieModule !== "undefined" && CartographieModule.depTypes) ? CartographieModule.depTypes()
            : { dep: { label: "Dépend de", short: "dépend de" }, hosted: { label: "Hébergé sur", short: "hébergé sur" }, flux: { label: "Alimenté par", short: "alimenté par" }, backup: { label: "Sauvegardé par", short: "sauvegardé par" } };
        const DORDER = (typeof CartographieModule !== "undefined" && CartographieModule.depOrder) ? CartographieModule.depOrder() : ["dep", "hosted", "flux", "backup"];
        const nomActif = aid => { const a = DataStore.getActifById(aid); return a ? a.nom : "?"; };
        const depLabel = t => (DT[t] ? DT[t].short : t);
        // Ce qui dépend de cet actif (entrant, lecture seule).
        const reverseDeps = DataStore.getActifs()
            .filter(a => a.id !== actif.id && Array.isArray(a.dependances))
            .flatMap(a => a.dependances.filter(d => d && d.to === actif.id).map(d => ({ from: a.nom, type: d.type || "dep" })));

        const risquesHtml = tousRisques.map(r => `
            <label class="checkbox-line">
                <input type="checkbox" class="risque-cb" value="${r.id}" ${actif.risques_lies.includes(r.id) ? "checked" : ""}>
                <strong>${escapeHtml(r.nom)}</strong> <span class="txt-muted-sm">(${escapeHtml(r.niveau)})</span>
            </label>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${escapeHtml(actif.nom)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card">
                        <h3>Détails de l'actif</h3>
                        <div class="form-group"><label>Nom <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="nom" value="${escapeHtml(actif.nom)}" required /></div>

                        <div class="grille-2">
                            <div class="form-group">
                                <label>Type</label>
                                <select id="type">
                                    <option value="Matériel" ${actif.type === "Matériel" ? "selected" : ""}>Matériel</option>
                                    <option value="Logiciel" ${actif.type === "Logiciel" ? "selected" : ""}>Logiciel</option>
                                    <option value="Donnée" ${actif.type === "Donnée" ? "selected" : ""}>Donnée</option>
                                    <option value="Service" ${actif.type === "Service" ? "selected" : ""}>Service</option>
                                    <option value="Humain" ${actif.type === "Humain" ? "selected" : ""}>Humain</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Criticité</label>
                                <select id="criticite">
                                    <option value="faible" ${actif.criticite === "faible" ? "selected" : ""}>Faible</option>
                                    <option value="modérée" ${actif.criticite === "modérée" ? "selected" : ""}>Modérée</option>
                                    <option value="élevée" ${actif.criticite === "élevée" ? "selected" : ""}>Élevée</option>
                                    <option value="critique" ${actif.criticite === "critique" ? "selected" : ""}>Critique</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group"><label>Responsable</label><input id="responsable" list="personnes-list" value="${escapeHtml(actif.responsable || "")}" /></div>
                        <div class="form-group"><label>Description</label><textarea id="description">${escapeHtml(actif.description || "")}</textarea></div>
                        <button id="saveBtn">Mettre à jour</button>
                    </div>

                    <div class="dashboard-card">
                        <h3>Menaces & Risques applicables</h3>
                        <p style="font-size: var(--text-sm); color: var(--text-muted); margin-bottom: 10px;">Cochez les scénarios de risques qui pèsent sur cet actif :</p>
                        <div class="checkbox-group">
                            ${risquesHtml || "<p style='color: var(--text-muted);'>Aucun risque défini dans le registre.</p>"}
                        </div>
                    </div>
                </div>

                <div class="dashboard-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <h3 class="m0">Dépendances de cartographie ${Help.tip("Huit natures de lien vers d'autres actifs. Quatre méritent une mention : « authentifié par » désigne l'annuaire ou le SSO — le point de défaillance unique le plus fréquent d'un groupe ; « administré depuis » désigne le bastion ou le poste d'admin, c'est-à-dire le chemin que prend un attaquant ; « redondé par » REND LE SERVICE pendant la panne, quand « sauvegardé par » permet seulement de le rétablir après. Ces deux dernières ne propagent pas une panne de disponibilité.")}</h3>
                        <a href="#/cartographie" style="font-size: var(--text-sm); color:var(--accent); font-weight:600; text-decoration:none;">Voir la cartographie →</a>
                    </div>
                    <p style="font-size: var(--text-sm); color:var(--text-muted); margin:8px 0 14px;">Déclarez ce dont <strong>${escapeHtml(actif.nom)}</strong> a besoin pour fonctionner.</p>

                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:16px;">
                        <div class="form-group m0">
                            <label class="txt-sm">Cet actif…</label>
                            <select id="depType">
                                ${DORDER.map(t => `<option value="${t}">${escapeHtml(DT[t] ? (DT[t].label || DT[t].short) : t)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group" style="margin:0; flex:1; min-width:180px;">
                            <label class="txt-sm">…de l'actif</label>
                            <select id="depTarget">
                                ${autresActifs.length ? autresActifs.map(a => `<option value="${a.id}">${escapeHtml(a.nom)}</option>`).join("") : `<option value="">(aucun autre actif déclaré)</option>`}
                            </select>
                        </div>
                        <div class="form-group m0">
                            <label class="txt-sm">Délai avant impact ${Help.tip("Combien de temps cet actif tient SANS sa cible. C’est ce champ qui transforme un rayon d’impact en CHRONOLOGIE, confrontable aux RTO du bilan d’impact. Laisser « non renseigné » est une réponse : le produit ne devine pas.")}</label>
                            <select id="depDelai">
                                <option value="">Non renseigné</option>
                                ${DELAIS.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.libelle)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group m0">
                            <label class="txt-sm">Mode dégradé ${Help.tip("Un fonctionnement dégradé existe-t-il sans la cible ? C’est ce qui distingue une dépendance VITALE d’une dépendance de confort — et la distinction ne se devine pas du type de lien.")}</label>
                            <select id="depDegrade">
                                <option value="">Non renseigné</option>
                                ${DEGRADES.map(d => `<option value="${escapeHtml(d.code)}">${escapeHtml(d.libelle)}</option>`).join("")}
                            </select>
                        </div>
                        <button id="addDepBtn" type="button" ${autresActifs.length ? "" : "disabled"}>Ajouter le lien</button>
                    </div>

                    <div class="grille-2">
                        <div>
                            <div style="font-size: var(--text-xs); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700; margin-bottom:8px;">Dépendances déclarées</div>
                            <ul id="deps-list" style="list-style:none; padding:0; margin:0;"></ul>
                        </div>
                        <div>
                            <div style="font-size: var(--text-xs); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700; margin-bottom:8px;">En dépendent (entrant)</div>
                            <ul style="list-style:none; padding:0; margin:0; font-size: var(--text-sm);">
                                ${reverseDeps.length ? reverseDeps.map(r => `<li style="padding:4px 0;"><strong>${escapeHtml(r.from)}</strong> <span class="txt-muted-sm">${escapeHtml(depLabel(r.type))}</span></li>`).join("") : `<li style="color:var(--text-muted); font-style:italic;">Aucun actif ne dépend de celui-ci.</li>`}
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="dashboard-card">
                    <h3 class="m0">Qui exploite cet actif ${Help.tip("Le tiers qui l’exploite, l’héberge, le maintient, l’infogère ou en édite le logiciel. C’est la dépendance la plus contrôlée par NIS2 (art. 21) et DORA (art. 28) — et jusqu’au 22/09/2026 elle se saisissait deux fois, ici et dans la fiche du prestataire, sans que les deux se parlent.")}</h3>
                    <p style="font-size: var(--text-sm); color:var(--text-muted); margin:8px 0 14px;">Un même tiers peut apparaître <strong>plusieurs fois</strong> : héberger un actif et l’infogérer sont deux engagements contractuels différents.</p>
                    ${tousPrestataires.length ? `
                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:16px;">
                        <div class="form-group m0">
                            <label class="txt-sm">Cet actif est…</label>
                            <select id="tierNature">
                                ${NATURES.map(n => `<option value="${escapeHtml(n.code)}">${escapeHtml(n.libelle)}</option>`).join("")}
                            </select>
                        </div>
                        <div class="form-group" style="margin:0; flex:1; min-width:180px;">
                            <label class="txt-sm">…le prestataire</label>
                            <select id="tierTarget">
                                ${tousPrestataires.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nom || p.raison_sociale || p.id)}</option>`).join("")}
                            </select>
                        </div>
                        <button id="addTierBtn" type="button">Ajouter</button>
                    </div>` : `<p class="muted">Aucun prestataire n’est déclaré dans cette filiale. <a href="#/prestataires" class="lien-accent">Déclarez-en un</a> pour pouvoir rattacher cet actif.</p>`}
                    <ul id="tiers-list" style="list-style:none; padding:0; margin:0;"></ul>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            actif.nom = nom;
            actif.type = document.getElementById("type").value;
            actif.criticite = document.getElementById("criticite").value;
            actif.responsable = document.getElementById("responsable").value.trim();
            actif.description = document.getElementById("description").value.trim();
            actif.risques_lies = Array.from(document.querySelectorAll(".risque-cb:checked")).map(cb => cb.value);
            actif.dependances = deps.slice();
            actif.prestataires_lies = tiers.slice();

            DataStore.updateActif(actif);
            if (window.showToast) window.showToast("Actif mis à jour.", "success");
            Router.navigateTo("/actifs");
        };

        // Édition des dépendances (liste dynamique, enregistrée avec « Mettre à jour »).
        function renderDepsList() {
            const ul = document.getElementById("deps-list");
            if (!ul) return;
            ul.innerHTML = deps.length ? deps.map((d, i) => `
                <li style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border);">
                    <span class="txt-sm"><span class="txt-muted-sm">${escapeHtml(depLabel(d.type))}</span> <strong>${escapeHtml(nomActif(d.to))}</strong>${
                        d.delai || d.degrade
                            ? ` <span class="dep-qualif">${escapeHtml([
                                  d.delai ? "impact : " + ((DELAIS.find(x => x.code === d.delai) || {}).libelle || d.delai).toLowerCase() : "",
                                  d.degrade ? ((DEGRADES.find(x => x.code === d.degrade) || {}).libelle || d.degrade).toLowerCase() : ""
                              ].filter(Boolean).join(" · "))}</span>`
                            : ""
                    }</span>
                    <button type="button" class="rm-dep" data-i="${i}" title="Retirer ce lien" style="background:none; border:none; color:var(--color-danger); cursor:pointer; font-size: var(--text-lg); line-height:1; padding:0 4px;">&times;</button>
                </li>`).join("") : `<li style="color:var(--text-muted); font-style:italic; font-size: var(--text-sm);">Aucune dépendance déclarée.</li>`;
            ul.querySelectorAll(".rm-dep").forEach(btn => btn.onclick = () => { deps.splice(parseInt(btn.dataset.i, 10), 1); renderDepsList(); });
        }
        renderDepsList();

        /* ── QUI EXPLOITE CET ACTIF (migration `062`) ───────────────────────
         *
         * ⚠️ Un même tiers peut apparaître PLUSIEURS FOIS avec des natures
         * différentes — héberger et infogérer sont deux engagements contractuels,
         * et la clé primaire en base porte la nature pour cette raison. Le
         * dédoublonnage porte donc sur le COUPLE, comme pour les dépendances.
         */
        function renderTiersList() {
            const ul = document.getElementById("tiers-list");
            if (!ul) return;
            ul.innerHTML = tiers.length ? tiers.map((t, i) => `
                <li style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--border);">
                    <span class="txt-sm"><span class="txt-muted-sm">${escapeHtml(libelleNature(t.nature))}</span> <strong>${escapeHtml(nomPrestataire(t.to))}</strong></span>
                    <button type="button" class="rm-tier" data-i="${i}" title="Retirer ce lien" style="background:none; border:none; color:var(--color-danger); cursor:pointer; font-size: var(--text-lg); line-height:1; padding:0 4px;">&times;</button>
                </li>`).join("")
                : `<li style="color:var(--text-muted); font-style:italic; font-size: var(--text-sm);">Aucun tiers déclaré pour cet actif.</li>`;
            ul.querySelectorAll(".rm-tier").forEach(btn => btn.onclick = () => {
                tiers.splice(parseInt(btn.dataset.i, 10), 1);
                renderTiersList();
            });
        }
        renderTiersList();

        const addTierBtn = document.getElementById("addTierBtn");
        if (addTierBtn) addTierBtn.onclick = () => {
            const nature = document.getElementById("tierNature").value;
            const to = document.getElementById("tierTarget").value;
            if (!to) return;
            if (tiers.some(t => t.to === to && t.nature === nature)) {
                if (window.showToast) window.showToast("Ce lien existe déjà.", "info");
                return;
            }
            tiers.push({ to, nature });
            renderTiersList();
        };

        const addDepBtn = document.getElementById("addDepBtn");
        if (addDepBtn) addDepBtn.onclick = () => {
            const type = document.getElementById("depType").value;
            const to = document.getElementById("depTarget").value;
            const delai = document.getElementById("depDelai").value || null;
            const degrade = document.getElementById("depDegrade").value || null;
            if (!to) return;
            if (deps.some(d => d.to === to && d.type === type)) {
                if (window.showToast) window.showToast("Ce lien existe déjà.", "info");
                return;
            }
            deps.push({ to, type, delai, degrade });
            renderDepsList();
        };

        UI.wireDelete({
            confirm: "Confirmer la suppression de cet actif ?",
            remove: () => DataStore.deleteActif(actif.id),
            redirect: "/actifs"
        });
    }

    return { renderList, renderDetail };
})();