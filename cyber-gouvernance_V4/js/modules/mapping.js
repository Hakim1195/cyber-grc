// Emplacement : js/modules/mapping.js
// Nom du fichier : mapping.js
//
// Module CORRESPONDANCES INTER-RÉFÉRENTIELS (/mapping).
// Affiche un catalogue PRÉ-REMPLI et ÉDITABLE d'équivalences entre les exigences de
// plusieurs référentiels (ANSSI ↔ ISO 27001 ↔ NIS2 ↔ DORA). But : accélérer la
// couverture croisée et la SoA en reliant, d'un seul geste, toutes les exigences
// équivalentes à une même « mesure de sécurité » (zéro double saisie), ou en leur
// appliquant un même statut.
//
// Le catalogue par défaut est statique (js/data/mappings.js). Les ajouts et
// modifications de l'utilisateur sont une surcouche persistée dans DataStore
// (tableau `mappings`, cf. datastore.js), fusionnée à l'affichage.

const MappingModule = (() => {

    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? "" : s));

    const STATUTS = [
        { v: "", label: "Non évalué", cls: "status-non-evaluee" },
        { v: "conforme", label: "Conforme", cls: "status-conforme" },
        { v: "partiellement conforme", label: "Partiellement conforme", cls: "status-partiellement-conforme" },
        { v: "non conforme", label: "Non conforme", cls: "status-non-conforme" },
        { v: "non applicable", label: "Non applicable", cls: "status-non-applicable" }
    ];
    function statutMeta(v) { return STATUTS.find(s => s.v === (v || "")) || STATUTS[0]; }

    // État d'édition : null (fermé) | "__new__" (création) | <id> (modification).
    let editing = null;

    // Libellés courts pour les étiquettes de colonnes (les `editeur` de NIS2/DORA
    // sont des références réglementaires trop longues à afficher).
    const SHORT_LABELS = {
        "anssi-hygiene": "ANSSI", "iso-27002-2022": "ISO 27001",   // clé = id technique ; libellé corrigé
        "nis2-art21": "NIS2", "dora": "DORA", "aircyber": "AirCyber"
    };

    function coreRefs() { return (typeof MappingCatalog !== "undefined") ? MappingCatalog.coreRefs() : []; }
    function getRef(id) { return (typeof Referentiels !== "undefined") ? Referentiels.get(id) : null; }
    function refLabel(id) { return SHORT_LABELS[id] || (getRef(id) ? getRef(id).editeur : id); }
    function refName(id) { const r = getRef(id); return r ? r.nom : id; }
    function clauseTitre(refId, code) {
        const r = getRef(refId); if (!r) return null;
        const e = Referentiels.findExigence(r, code);
        return e ? e.titre : null;
    }

    /* =========================
       FUSION CATALOGUE + SURCOUCHE UTILISATEUR
    ========================== */
    // Retourne la liste effective des groupes (catalogue par défaut, chaque entrée
    // pouvant être remplacée « override » ou masquée « _deleted » par l'utilisateur,
    // plus les groupes 100 % personnalisés). Chaque groupe reçoit `_origin` et `_edited`.
    function effectiveMappings() {
        const catalog = (typeof MappingCatalog !== "undefined") ? MappingCatalog.all() : [];
        const user = (DataStore.getMappings ? DataStore.getMappings() : []) || [];
        const userById = {};
        user.forEach(u => { if (u && u.id) userById[u.id] = u; });

        const out = [];
        catalog.forEach(c => {
            const u = userById[c.id];
            if (u) {
                if (u._deleted) return;                                   // masqué
                out.push(Object.assign({}, u, { refs: u.refs || {}, _origin: "catalog", _edited: true }));
            } else {
                out.push(Object.assign({}, c, { refs: c.refs || {}, _origin: "catalog", _edited: false }));
            }
        });
        user.forEach(u => {
            if (!u || !u.id || u._deleted) return;
            if (typeof MappingCatalog === "undefined" || !MappingCatalog.has(u.id)) {
                out.push(Object.assign({}, u, { refs: u.refs || {}, _origin: "custom", _edited: false }));
            }
        });
        return out;
    }

    function countHidden() {
        const user = (DataStore.getMappings ? DataStore.getMappings() : []) || [];
        return user.filter(u => u && u._deleted && typeof MappingCatalog !== "undefined" && MappingCatalog.has(u.id)).length;
    }

    // Liste ordonnée des référentiels à afficher pour un groupe : les référentiels
    // « cœur » puis tout autre référentiel référencé par le groupe.
    function displayRefs(g) {
        const core = coreRefs();
        const extra = Object.keys(g.refs || {}).filter(id => core.indexOf(id) < 0);
        return core.concat(extra);
    }

    // Paires (refId, code) existant réellement dans les référentiels chargés.
    function validPairs(g) {
        const pairs = [];
        Object.keys(g.refs || {}).forEach(refId => {
            const ref = getRef(refId);
            if (!ref) return;
            (g.refs[refId] || []).forEach(code => {
                if (Referentiels.findExigence(ref, code)) pairs.push({ refId, code });
            });
        });
        return pairs;
    }

    /* =========================
       STATISTIQUES D'UN GROUPE
    ========================== */
    function computeStats(g) {
        const s = { pairs: 0, evaluated: 0, applicable: 0, conforme: 0, linked: 0, mesures: new Set() };
        validPairs(g).forEach(({ refId, code }) => {
            s.pairs++;
            const ev = DataStore.getEvaluation(refId, code);
            const statut = ev ? (ev.statut || "") : "";
            if (statut) s.evaluated++;
            if (statut !== "non applicable") s.applicable++;
            if (statut === "conforme") s.conforme++;
            if (ev && ev.mesure_id) { s.linked++; s.mesures.add(ev.mesure_id); }
        });
        s.conformite = s.applicable ? Math.round((s.conforme / s.applicable) * 100) : null;
        return s;
    }

    // Couverture de cartographie d'un référentiel : part de ses exigences citées
    // dans au moins une correspondance.
    function refCartoCoverage(effective) {
        return coreRefs().map(refId => {
            const ref = getRef(refId);
            const total = ref ? Referentiels.countExigences(ref) : 0;
            const set = new Set();
            effective.forEach(g => (g.refs[refId] || []).forEach(c => { if (ref && Referentiels.findExigence(ref, c)) set.add(c); }));
            const mapped = set.size;
            return { refId, label: refLabel(refId), nom: refName(refId), mapped, total, pct: total ? Math.round((mapped / total) * 100) : 0 };
        });
    }

    /* =========================
       RENDU
    ========================== */
    function clauseBadge(refId, code) {
        const ev = DataStore.getEvaluation(refId, code);
        const statut = ev ? (ev.statut || "") : "";
        const meta = statutMeta(statut);
        const titre = clauseTitre(refId, code);
        const exists = titre !== null;
        const linked = !!(ev && ev.mesure_id);
        const tip = `${code}${exists ? " — " + titre : " — (code inconnu dans ce référentiel)"}${statut ? " · " + meta.label : " · non évalué"}${linked ? " · reliée à une mesure" : ""}`;
        const cls = `map-clause ${meta.cls}${linked ? " map-clause--linked" : ""}${exists ? "" : " map-clause--unknown"}`;
        return `<a class="${cls}" href="#/referentiels/${esc(refId)}" title="${esc(tip)}">${esc(code)}</a>`;
    }

    function refRowHtml(g, refId) {
        const codes = (g.refs[refId] || []);
        const badges = codes.length
            ? codes.map(c => clauseBadge(refId, c)).join("")
            : `<span class="map-empty">—</span>`;
        return `<div class="map-ref-row">
            <span class="map-ref-name" title="${esc(refName(refId))}">${esc(refLabel(refId))}</span>
            <span class="map-ref-clauses">${badges}</span>
        </div>`;
    }

    function originBadge(g) {
        if (g._origin === "custom") return `<span class="map-origin map-origin--custom" title="Correspondance que vous avez créée">Personnalisée</span>`;
        if (g._edited) return `<span class="map-origin map-origin--edited" title="Correspondance du catalogue que vous avez modifiée">Modifiée</span>`;
        return `<span class="map-origin map-origin--seed" title="Correspondance fournie par défaut">Pré-remplie</span>`;
    }

    function propagatePanel(g, stats) {
        const mesures = DataStore.getMesures();
        const mesureOpts = `<option value="">— Choisir une mesure —</option>` +
            mesures.map(m => `<option value="${esc(m.id)}">${esc(m.nom)}</option>`).join("");
        const statutOpts = STATUTS.filter(s => s.v).map(s => `<option value="${esc(s.v)}"${s.v === "conforme" ? " selected" : ""}>${esc(s.label)}</option>`).join("");
        const matOpts = [0, 1, 2, 3, 4, 5].map(m => `<option value="${m}"${m === 3 ? " selected" : ""}>${m}</option>`).join("");
        return `<details class="map-propagate">
            <summary>Propager sur le groupe</summary>
            <div class="map-prop-panel">
                <div class="map-prop-row">
                    <label>Relier tout le groupe à une mesure de sécurité ${Help.tip("Relie chaque exigence du groupe à la même « mesure de sécurité ». Évaluez ensuite la mesure une seule fois et propagez : toutes les exigences équivalentes se mettent à jour.")}</label>
                    <div class="map-prop-controls">
                        <select class="map-prop-mesure">${mesureOpts}</select>
                        <button type="button" class="map-prop-link" data-id="${esc(g.id)}">Relier</button>
                        <button type="button" class="map-prop-newmesure" data-id="${esc(g.id)}">＋ Nouvelle</button>
                    </div>
                </div>
                <div class="map-prop-row">
                    <label>Appliquer un même statut aux exigences du groupe</label>
                    <div class="map-prop-controls">
                        <select class="map-prop-statut">${statutOpts}</select>
                        <select class="map-prop-mat" title="Maturité 0–5">${matOpts}</select>
                        <button type="button" class="map-prop-apply" data-id="${esc(g.id)}">Appliquer</button>
                    </div>
                </div>
                <p class="map-prop-hint">Agit sur les ${stats.pairs} exigence(s) reconnue(s) du groupe (l'évaluation est créée si besoin).</p>
            </div>
        </details>`;
    }

    function groupCard(g) {
        const stats = computeStats(g);
        const rows = displayRefs(g).map(refId => refRowHtml(g, refId)).join("");

        const conf = stats.conformite;
        const confCol = conf === null ? "var(--color-gray)" : (conf >= 80 ? "var(--color-success)" : conf >= 40 ? "var(--color-warning)" : "var(--color-danger)");
        let mesureInfo = "";
        if (stats.mesures.size === 1) {
            const m = DataStore.getMesureById(Array.from(stats.mesures)[0]);
            if (m) mesureInfo = ` · reliées à <a href="#/mesures/${esc(m.id)}" class="map-mesure-link">${esc(m.nom)}</a>`;
        } else if (stats.mesures.size > 1) {
            mesureInfo = ` · reliées à ${stats.mesures.size} mesures`;
        }

        const delLabel = (g._origin === "custom") ? "Supprimer" : "Masquer";
        const delTitle = (g._origin === "custom") ? "Supprimer cette correspondance" : "Masquer cette correspondance du catalogue (réversible via « Réinitialiser »)";

        return `<div class="dashboard-card map-group" data-id="${esc(g.id)}">
            <div class="map-group__head">
                <div class="map-group__title">
                    <h3>${esc(g.theme)} ${g.aide ? Help.tip(g.aide) : ""}</h3>
                    ${originBadge(g)}
                </div>
                <div class="map-group__conf">
                    <div class="map-conf-val" style="color:${confCol};">${conf === null ? "—" : conf + "%"}</div>
                    <div class="map-conf-lbl">conformité</div>
                </div>
            </div>
            <div class="map-refs">${rows}</div>
            <div class="map-group__foot">
                <span class="map-cover">${stats.pairs} exigence(s) · ${stats.evaluated} évaluée(s) · ${stats.conforme} conforme(s)${mesureInfo}</span>
                <div class="map-actions">
                    <button type="button" class="map-edit" data-id="${esc(g.id)}">Modifier</button>
                    <button type="button" class="map-del" data-id="${esc(g.id)}" title="${esc(delTitle)}">${delLabel}</button>
                </div>
            </div>
            ${propagatePanel(g, stats)}
        </div>`;
    }

    // Éditeur (création / modification). `g` = groupe effectif à modifier, ou null.
    function editorHtml(g) {
        const isNew = !g;
        const theme = g ? g.theme : "";
        const aide = g ? g.aide : "";
        const refsSel = (g && g.refs) ? g.refs : {};

        const refFields = coreRefs().map(refId => {
            const ref = getRef(refId);
            if (!ref) return "";
            const selected = new Set(refsSel[refId] || []);
            const opts = Referentiels.flatExigences(ref).map(e =>
                `<option value="${esc(e.code)}"${selected.has(e.code) ? " selected" : ""}>${esc(e.code)} — ${esc(e.titre)}</option>`
            ).join("");
            return `<div class="map-edit-field">
                <label>${esc(ref.nom)} <span class="map-edit-hint">(Ctrl/Cmd+clic pour sélection multiple)</span></label>
                <select multiple size="6" class="map-edit-codes" data-ref="${esc(refId)}">${opts}</select>
            </div>`;
        }).join("");

        return `<div class="dashboard-card map-editor" id="map-editor">
            <h3 style="margin-top:0;">${isNew ? "Nouvelle correspondance" : "Modifier la correspondance"}</h3>
            <div class="form-group" style="margin-bottom:0.8rem;">
                <label>Thème *</label>
                <input type="text" id="map-edit-theme" value="${esc(theme)}" placeholder="Ex : Authentification (mots de passe & MFA)" />
            </div>
            <div class="form-group" style="margin-bottom:0.8rem;">
                <label>Note pédagogique</label>
                <textarea id="map-edit-aide" placeholder="À quoi correspond ce thème, en une phrase claire pour un non-expert.">${esc(aide)}</textarea>
            </div>
            <div class="map-edit-grid">${refFields}</div>
            <div class="map-edit-actions">
                <button type="button" id="map-edit-save" style="background:var(--primary);">${isNew ? "Créer" : "Enregistrer"}</button>
                <button type="button" id="map-edit-cancel" class="btn-secondary">Annuler</button>
            </div>
        </div>`;
    }

    function render() {
        const app = document.getElementById("app");
        const effective = effectiveMappings();
        const hidden = countHidden();
        const userLayer = (DataStore.getMappings ? DataStore.getMappings() : []) || [];

        const coverage = refCartoCoverage(effective);
        const coverageChips = coverage.map(c => `
            <div class="map-cov-chip" title="${esc(c.nom)}">
                <div class="map-cov-chip__top"><strong>${esc(c.label)}</strong><span>${c.mapped}/${c.total}</span></div>
                <div class="progress-bar small"><div class="progress-fill" style="width:${c.pct}%; background:var(--accent);"></div></div>
            </div>`).join("");

        const cards = effective.length
            ? effective.map(groupCard).join("")
            : `<div class="empty-state"><h3>Aucune correspondance</h3><p>Le catalogue est vide. <a href="#" id="map-restore" style="color:var(--accent);">Réinitialiser</a> pour restaurer les correspondances par défaut, ou créez-en une.</p></div>`;

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Correspondances inter-référentiels</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Les exigences équivalentes d'un référentiel à l'autre, regroupées par thème. ${Help.tip("Une même mesure (MFA, sauvegardes, cloisonnement…) satisfait souvent des exigences de plusieurs cadres (ANSSI, ISO 27001, NIS2, DORA). Reliez tout un groupe à une « mesure de sécurité » : évaluez une fois, appliquez partout.")}</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <a href="#/couverture" class="btn-secondary">Couverture croisée →</a>
                        <button type="button" id="map-new" style="background:var(--primary);">＋ Nouvelle correspondance</button>
                    </div>
                </div>

                <div class="synthese-message info" style="padding:10px; font-size:0.9rem;">
                    Correspondances <strong>indicatives</strong> (reformulations maison) : elles n'engagent pas les éditeurs des normes. Utilisez-les pour <strong>accélérer la saisie</strong> et repérer les recouvrements, puis affinez selon votre contexte. Vous pouvez tout modifier.
                </div>

                <div class="dashboard-card" style="margin-bottom:1.2rem;">
                    <div class="map-cov-head">
                        <h3 style="margin:0;">Cartographie des référentiels ${Help.tip("Part des exigences de chaque référentiel citées dans au moins une correspondance. Plus c'est haut, plus le référentiel est relié aux autres.")}</h3>
                        <div class="map-toolbar">
                            ${(userLayer.length) ? `<span class="map-hidden-note">${hidden ? hidden + " du catalogue masquée(s) · " : ""}surcouche active</span>` : ""}
                            <button type="button" id="map-reset" class="btn-secondary"${userLayer.length ? "" : " disabled"} title="Restaurer le catalogue par défaut (retire vos ajouts, modifications et masquages)">Réinitialiser</button>
                        </div>
                    </div>
                    <div class="map-cov-chips">${coverageChips}</div>
                </div>

                ${editing ? editorHtml(editing === "__new__" ? null : effective.find(x => x.id === editing)) : ""}

                <div id="map-list" class="map-list">${cards}</div>
            </section>`;

        wire();
        if (editing) {
            const ed = document.getElementById("map-editor");
            if (ed) ed.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    /* =========================
       INTERACTIONS
    ========================== */
    function wire() {
        const app = document.getElementById("app");
        if (!app) return;

        const newBtn = document.getElementById("map-new");
        if (newBtn) newBtn.onclick = () => { editing = "__new__"; render(); };

        const resetBtn = document.getElementById("map-reset");
        if (resetBtn) resetBtn.onclick = () => {
            const n = ((DataStore.getMappings ? DataStore.getMappings() : []) || []).length;
            if (!n) return;
            if (confirm(`Réinitialiser les correspondances ?\nVos ${n} modification(s) (ajouts, modifications, masquages) seront supprimées et le catalogue par défaut restauré.`)) {
                DataStore.resetMappings();
                editing = null;
                if (window.showToast) window.showToast("Catalogue de correspondances réinitialisé.", "success");
                render();
            }
        };
        const restoreLink = document.getElementById("map-restore");
        if (restoreLink) restoreLink.onclick = (e) => { e.preventDefault(); DataStore.resetMappings(); render(); };

        // Éditeur : enregistrer / annuler
        const saveBtn = document.getElementById("map-edit-save");
        if (saveBtn) saveBtn.onclick = saveEditor;
        const cancelBtn = document.getElementById("map-edit-cancel");
        if (cancelBtn) cancelBtn.onclick = () => { editing = null; render(); };

        // Délégation sur la liste (modifier / masquer / propager)
        const list = document.getElementById("map-list");
        if (list) list.addEventListener("click", (e) => {
            const editBtn = e.target.closest(".map-edit");
            if (editBtn) { editing = editBtn.dataset.id; render(); return; }

            const delBtn = e.target.closest(".map-del");
            if (delBtn) { deleteGroup(delBtn.dataset.id); return; }

            const linkBtn = e.target.closest(".map-prop-link");
            if (linkBtn) { propagateMesure(linkBtn.dataset.id, null); return; }

            const newMesBtn = e.target.closest(".map-prop-newmesure");
            if (newMesBtn) { propagateNewMesure(newMesBtn.dataset.id); return; }

            const applyBtn = e.target.closest(".map-prop-apply");
            if (applyBtn) { propagateStatut(applyBtn.dataset.id); return; }
        });
    }

    function groupById(id) { return effectiveMappings().find(g => g.id === id) || null; }

    function saveEditor() {
        const themeEl = document.getElementById("map-edit-theme");
        const aideEl = document.getElementById("map-edit-aide");
        const theme = themeEl ? themeEl.value.trim() : "";
        if (!theme) { alert("Le thème est obligatoire."); if (themeEl) themeEl.focus(); return; }
        const aide = aideEl ? aideEl.value.trim() : "";

        // Part des refs existantes (préserve les référentiels non éditables du groupe).
        const existing = (editing && editing !== "__new__") ? groupById(editing) : null;
        const refs = existing && existing.refs ? JSON.parse(JSON.stringify(existing.refs)) : {};
        document.querySelectorAll("#map-editor .map-edit-codes").forEach(sel => {
            refs[sel.dataset.ref] = Array.from(sel.selectedOptions).map(o => o.value);
        });

        const anyCode = Object.keys(refs).some(k => Array.isArray(refs[k]) && refs[k].length);
        if (!anyCode) { alert("Sélectionnez au moins une exigence dans un référentiel."); return; }

        const id = (editing && editing !== "__new__") ? editing : (UI.genId("MAP"));
        DataStore.upsertMapping({ id, theme, aide, refs });
        editing = null;
        if (window.showToast) window.showToast(existing ? "Correspondance enregistrée." : "Correspondance créée.", "success");
        render();
    }

    function deleteGroup(id) {
        const g = groupById(id);
        if (!g) return;
        const isCatalog = (typeof MappingCatalog !== "undefined") && MappingCatalog.has(id);
        if (isCatalog) {
            if (!confirm(`Masquer la correspondance « ${g.theme} » du catalogue ?\n(Réversible via « Réinitialiser ».)`)) return;
            DataStore.upsertMapping({ id, theme: g.theme, aide: g.aide, refs: g.refs, _deleted: true });
            if (window.showToast) window.showToast("Correspondance masquée.", "info");
        } else {
            if (!confirm(`Supprimer la correspondance « ${g.theme} » ?`)) return;
            DataStore.deleteMapping(id);
            if (window.showToast) window.showToast("Correspondance supprimée.", "success");
        }
        if (editing === id) editing = null;
        render();
    }

    // Relie toutes les exigences du groupe à une mesure de sécurité (mise à jour
    // partielle : ne touche pas au statut/maturité existants).
    function propagateMesure(id, forcedMesureId) {
        const g = groupById(id);
        if (!g) return;
        let mesureId = forcedMesureId;
        if (!mesureId) {
            const card = document.querySelector(`.map-group[data-id="${cssEsc(id)}"]`);
            const sel = card ? card.querySelector(".map-prop-mesure") : null;
            mesureId = sel ? sel.value : "";
        }
        if (!mesureId) { if (window.showToast) window.showToast("Choisissez d'abord une mesure de sécurité.", "info"); return; }
        const m = DataStore.getMesureById(mesureId);
        const pairs = validPairs(g);
        // Relier ne doit PAS fabriquer un statut : on préserve l'existant et on garde
        // « non évalué » pour les exigences encore vierges (sinon l'upsert les passe
        // par défaut à « non conforme »).
        pairs.forEach(({ refId, code }) => {
            const existing = DataStore.getEvaluation(refId, code);
            if (existing) DataStore.upsertEvaluation({ ref_id: refId, code, mesure_id: mesureId });
            else DataStore.upsertEvaluation({ ref_id: refId, code, mesure_id: mesureId, statut: "", maturite: 0 });
        });
        if (window.showToast) window.showToast(`${pairs.length} exigence(s) reliée(s) à « ${m ? m.nom : "la mesure"} ».`, "success");
        render();
    }

    function propagateNewMesure(id) {
        const nom = prompt("Nom de la nouvelle mesure de sécurité :");
        if (!nom || !nom.trim()) return;
        const mid = UI.genId("MESURE");
        DataStore.addMesure({ id: mid, nom: nom.trim(), description: "", statut: "", maturite: 0, responsable: "", updatedAt: Date.now() });
        propagateMesure(id, mid);
    }

    // Applique un même statut + maturité à toutes les exigences du groupe.
    function propagateStatut(id) {
        const g = groupById(id);
        if (!g) return;
        const card = document.querySelector(`.map-group[data-id="${cssEsc(id)}"]`);
        if (!card) return;
        const statut = card.querySelector(".map-prop-statut").value;
        const maturite = Number(card.querySelector(".map-prop-mat").value) || 0;
        const pairs = validPairs(g);
        if (!pairs.length) { if (window.showToast) window.showToast("Aucune exigence reconnue dans ce groupe.", "info"); return; }
        const meta = statutMeta(statut);
        if (!confirm(`Appliquer le statut « ${meta.label} » (maturité ${maturite}) aux ${pairs.length} exigence(s) du groupe « ${g.theme} » ?\nLes évaluations existantes seront écrasées.`)) return;
        pairs.forEach(({ refId, code }) => DataStore.upsertEvaluation({ ref_id: refId, code, statut, maturite }));
        if (window.showToast) window.showToast(`${pairs.length} exigence(s) mise(s) à jour.`, "success");
        render();
    }

    function cssEsc(v) {
        if (window.CSS && CSS.escape) return CSS.escape(v);
        return String(v).replace(/["\\\]]/g, "\\$&");
    }

    return { render };
})();
