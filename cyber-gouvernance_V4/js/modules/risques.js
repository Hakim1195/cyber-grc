// Emplacement : js/modules/risques.js
// Nom du fichier : risques.js

const RisquesModule = (() => {

    /* =========================
       UTILITAIRES DE CALCUL (F x G x M)
    ========================== */

    /* =====================================================================
       LES ÉCHELLES DE COTATION (v24, action 25.3)

       ⚠️ **Les quatre options ne sont plus écrites ici.** Elles viennent de
       l'échelle EN VIGUEUR, et c'est tout l'objet de l'action 25.3 : une filiale
       qui publie une graduation à cinq niveaux doit pouvoir coter 5. Tant que le
       `<select>` portait quatre `<option>` en dur, l'échelle en base aurait été
       une décoration — la base l'aurait acceptée, et aucun écran ne l'aurait
       proposée.

       Les libellés d'origine restent le REPLI : sur une base antérieure à la
       migration `049`, ou si le socle était archivé sans successeur, l'écran doit
       continuer de fonctionner. Un produit cassé par une donnée manquante est un
       produit cassé.
    ===================================================================== */

    /**
     * Les quatre niveaux d'origine, employés tant qu'aucune échelle n'existe.
     *
     * ⚠️ **Les clés sont écrites EN TOUTES LETTRES**, et `t("risques.f" + n)` a été
     * essayé puis retiré : le contrôle de `test/depot/traductions.test.mjs` §37.2 lit les
     * clés employées dans le source, et une clé construite lui apparaît comme
     * « risques.f », absente des deux dictionnaires. Il a raison de rougir — une clé
     * introuvable s'affiche EN CLAIR à l'écran — et la parade n'est pas de l'assouplir.
     */
    function replisFrequence() {
        return [
            { valeur: 1, libelle: t("risques.f1") },
            { valeur: 2, libelle: t("risques.f2") },
            { valeur: 3, libelle: t("risques.f3") },
            { valeur: 4, libelle: t("risques.f4") }
        ];
    }
    function replisGravite() {
        return [
            { valeur: 1, libelle: t("risques.g1") },
            { valeur: 2, libelle: t("risques.g2") },
            { valeur: 3, libelle: t("risques.g3") },
            { valeur: 4, libelle: t("risques.g4") }
        ];
    }

    function getRiskColor(score) {
        if (score < 3) return "var(--color-success)"; // Vert
        if (score < 8) return "var(--color-warning)"; // Jaune/Orange
        return "var(--color-danger)";                 // Rouge
    }

    function getLabel(score) {
        if (score < 3) return t("risques.nonCritique");
        if (score < 8) return t("risques.critique");
        return t("risques.tresCritique");
    }

    function evaluerNiveau(score) {
        if (score < 3) return "faible";
        if (score < 8) return "élevé";
        return "critique";
    }

    /* =========================
       LISTE & IMPORT
    ========================== */
    function renderList() {
        const risques = DataStore.getRisques();
        const app = document.getElementById("app");

        const rows = risques.map(r => {
            const scoreRes = r.score_residuel || 0;
            return `
            <tr class="clickable-row" data-id="${r.id}">
                <td class="stop-row-click" style="text-align: center; width: 40px;">
                    <input type="checkbox" class="row-cb" data-id="${r.id}">
                </td>
                <td><strong>${escapeHtml(r.nom) || t("risques.sansNom")}</strong></td>
                <td>
                    <span class="status" style="background: ${getRiskColor(scoreRes)}; color: white;">
                        ${getLabel(scoreRes)}
                    </span>
                </td>
                <td><span class="badge" style="background: #eee; color: #333;">${t("risques.brut")} ${r.score_brut || "-"}</span></td>
                <td><span class="badge" style="background: #e3f2fd; color: #0d47a1; font-weight: bold;">${t("risques.residuel")} ${escapeHtml(I18n.nombre(scoreRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</span></td>
                <td>${r.description ? escapeHtml(String(r.description).substring(0, 50)) + "..." : "-"}</td>
            </tr>
        `}).join("");

        app.innerHTML = `
            <section class="page">
                ${UI.enteteHtml({
                    titre: t("risques.titre"),
                    aide: Help.tip(t("risques.titreAide")),
                    contexte: t("risques.perimetre") + " " + t("risques.perimetreInterne"),
                    onglets: UI.ongletsDe("/risques"),
                    actions:
                        `<button id="bulkDeleteBtn" class="btn-danger" style="display:none;">${t("commun.supprimerSelection")} (<span id="selectedCount">0</span>)</button>` +
                        `<a href="#/imports" class="btn-secondary" data-lecture="ok" title="${t("commun.importerAide")}">${t("commun.importer")}</a>` +
                        `<button id="addRisqueBtn">${t("risques.declarer")}</button>`
                })}

                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>${t("risques.colNom")}</th>
                            <th>${t("risques.colNiveauResiduel")}</th>
                            <th>${t("risques.colScoreBrut")}</th>
                            <th>${t("risques.colScoreResiduel")}</th>
                            <th>${t("commun.description")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan='6' style='text-align:center;'>${t("risques.aucun")}</td></tr>`}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addRisqueBtn").onclick = renderCreate;

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


        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        // La case à cocher (et le lien courriel) ne doivent pas ouvrir la fiche :
        // conversion de l'ancien attribut `onclick="event.stopPropagation()"`, que la
        // politique de sécurité de contenu de production refuse.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteRisque(id),
            confirm: (n) => t("risques.confirmerSuppressionMultiple", { n: n }),
            toast: (n) => t("risques.supprimes", { n: n }),
            onDone: () => renderList()
        });

        // Redirection au clic sur la ligne (sauf checkbox)
        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/risques/${row.dataset.id}`);
        });
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>${t("risques.nouveau")}</h1>

                <div class="synthese-message info" style="margin-bottom: 20px; font-size: var(--text-base);">
                    <strong>${t("risques.guideCotation")}</strong><br>
                    <ul style="margin-top: 5px; padding-left: 20px; margin-bottom: 0;">
                        <li>${t("risques.guideBrut")} <em>${t("risques.guideBrutNote")}</em></li>
                        <li>${t("risques.guideResiduel")} <em>${t("risques.guideResiduelNote")}</em></li>
                        <li><strong>${t("risques.guideMaitrise")}</strong> ${t("risques.guideMaitriseValeurs")}</li>
                    </ul>
                </div>

                <div class="dashboard-card">
                    <div class="form-group"><label>${t("risques.colNom")} <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="nom" required /></div>

                    <div class="grille-3">
                        <div class="form-group">
                            <label>${t("risques.frequence")} ${Help.tip(t("risques.frequenceAide"))}</label>
                            <select id="f">${UI.optionsEchelle("vraisemblance", 1, replisFrequence())}</select>
                        </div>
                        <div class="form-group">
                            <label>${t("risques.gravite")} ${Help.tip(t("risques.graviteAide"))}</label>
                            <select id="g">${UI.optionsEchelle("gravite", 1, replisGravite())}</select>
                        </div>
                        <div class="form-group">
                            <label>${t("risques.maitrise")} ${Help.tip(t("risques.maitriseAide"))}</label>
                            <select id="m">
                                <option value="0.05">${t("risques.m005")}</option>
                                <option value="0.3">${t("risques.m03")}</option>
                                <option value="0.7">${t("risques.m07")}</option>
                                <option value="1">${t("risques.m1")}</option>
                            </select>
                        </div>
                    </div>

                    <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid var(--border);">
                        <div style="font-size: var(--text-base); color: var(--text-muted); margin-bottom: 5px;">${t("risques.apercuCalcul")}</div>
                        <div id="calc-preview" style="font-size: var(--text-lg);">
                            ${tHtml("risques.calcul", { brut: 1 })} <strong style="color: var(--color-success);">${escapeHtml(I18n.nombre(0.05, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} (${t("risques.nonCritique")})</strong>
                        </div>
                    </div>

                    <div class="form-group"><label>${t("risques.descriptionDetails")}</label><textarea id="description"></textarea></div>

                    <div class="mt-20">
                        <button id="save">${t("risques.creer")}</button>
                        <button id="cancel" style="margin-left: 10px;">${t("commun.annuler")}</button>
                    </div>
                </div>
            </section>
        `;

        const updatePreview = () => {
            const f = parseInt(document.getElementById("f").value) || 1;
            const g = parseInt(document.getElementById("g").value) || 1;
            const m = parseFloat(document.getElementById("m").value) || 1;
            const sBrut = f * g;
            const sRes = sBrut * m;
            document.getElementById("calc-preview").innerHTML = `
                ${tHtml("risques.calcul", { brut: sBrut })} <strong style="color: ${getRiskColor(sRes)};">${escapeHtml(I18n.nombre(sRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} (${getLabel(sRes)})</strong>
            `;
        };

        ["f", "g", "m"].forEach(id => document.getElementById(id).addEventListener("change", updatePreview));

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert(t("risques.nomObligatoire"));

            const f = parseInt(document.getElementById("f").value);
            const g = parseInt(document.getElementById("g").value);
            const m = parseFloat(document.getElementById("m").value);
            const scoreBrut = f * g;
            const scoreResiduel = scoreBrut * m;

            DataStore.addRisque({
                id: UI.genId("RISK"),
                nom: nom,
                f_frequence: f,
                g_gravite: g,
                m_maitrise: m,
                score_brut: scoreBrut,
                score_residuel: scoreResiduel,
                niveau: evaluerNiveau(scoreResiduel),
                description: document.getElementById("description").value.trim(),
                exigences_liees: []
            });
            Router.navigateTo("/risques");
        };

        document.getElementById("cancel").onclick = () => Router.navigateTo("/risques");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const risque = DataStore.getRisqueById(id);
        const toutesExigences = DataStore.getExigences();
        const actions = DataStore.getActionsByRisque(id);
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        if (!risque) return;

        // Rétrocompatibilité si anciennes données sans F, G, M
        const currentF = risque.f_frequence || 1;
        const currentG = risque.g_gravite || 1;
        const currentM = risque.m_maitrise || 1;
        const currentRes = risque.score_residuel || (currentF * currentG * currentM);

        risque.exigences_liees = Array.isArray(risque.exigences_liees) ? risque.exigences_liees : [];

        const exigencesHtml = toutesExigences.map(e => {
            const clientNom = e.client_id ? (clients.find(c => c.id === e.client_id)?.nom || t("commun.client")) : t("commun.interne");
            return `
            <label class="checkbox-line" style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <input type="checkbox" class="exigence-cb" value="${e.id}" ${risque.exigences_liees.includes(e.id) ? "checked" : ""}>
                    <strong>${escapeHtml(e.code)}</strong> — ${escapeHtml(String(e.intitule || "").substring(0, 40))}...
                </div>
                <span class="badge" style="font-size: var(--text-xs); background: #eee; color: #666;">${escapeHtml(clientNom)}</span>
            </label>
        `}).join("");

        const actionsHtml = actions.map(a => `
            <li class="clickable-action" data-id="${a.id}" style="padding: 8px; background: #f9f9f9; border-radius: 4px; margin-bottom: 8px; cursor: pointer; border-left: 3px solid var(--accent);">
                <strong>${escapeHtml(a.titre)}</strong> — ${t("risques.actionStatut")} <em>${escapeHtml(I18n.valeur(a.statut))}</em>
            </li>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${escapeHtml(risque.nom)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">${t("commun.supprimer")}</button>
                </div>

                <div class="dashboard-grid">
                    <div class="dashboard-card" style="grid-column: span 2;">
                        <h3>${t("risques.evaluation")}</h3>

                        <div class="synthese-message info" style="margin-bottom: 20px; font-size: var(--text-base);">
                            <strong>${t("risques.rappelCotation")}</strong> ${t("risques.rappelCotationTexte")}<br>
                            <em>${t("risques.rappelMaitrise")}</em>
                        </div>

                        <div class="form-group"><label>${t("commun.nom")} <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="nom" value="${escapeHtml(risque.nom)}" required /></div>

                        <div class="grille-3">
                            <div class="form-group">
                                <label>${t("risques.frequence")} ${Help.tip(t("risques.frequenceAide"))}</label>
                                <select id="f">${UI.optionsEchelle("vraisemblance", currentF, replisFrequence())}</select>
                                <small>${UI.mentionEchelle(risque.echelle_f_id)}</small>
                            </div>
                            <div class="form-group">
                                <label>${t("risques.gravite")} ${Help.tip(t("risques.graviteAide"))}</label>
                                <select id="g">${UI.optionsEchelle("gravite", currentG, replisGravite())}</select>
                                <small>${UI.mentionEchelle(risque.echelle_g_id)}</small>
                            </div>
                            <div class="form-group">
                                <label>${t("risques.maitrise")} ${Help.tip(t("risques.maitriseAide"))}</label>
                                <select id="m">
                                    <option value="0.05" ${currentM == 0.05 ? "selected" : ""}>${t("risques.m005")}</option>
                                    <option value="0.3" ${currentM == 0.3 ? "selected" : ""}>${t("risques.m03")}</option>
                                    <option value="0.7" ${currentM == 0.7 ? "selected" : ""}>${t("risques.m07")}</option>
                                    <option value="1" ${currentM == 1 ? "selected" : ""}>${t("risques.m1")}</option>
                                </select>
                            </div>
                        </div>

                        <div style="background: var(--bg-body); padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid var(--border);">
                            <div id="calc-preview" style="font-size: var(--text-lg);">
                                ${tHtml("risques.calcul", { brut: currentF * currentG })} <strong style="color: ${getRiskColor(currentRes)};">${escapeHtml(I18n.nombre(currentRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} (${getLabel(currentRes)})</strong>
                            </div>
                        </div>

                        <div class="form-group"><label>${t("commun.description")}</label><textarea id="description">${escapeHtml(risque.description || "")}</textarea></div>
                        <button id="saveBtn">${t("commun.mettreAJour")}</button>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="dashboard-card">
                            <h3>${t("risques.planTraitement")}</h3>
                            <ul style="margin-bottom: 15px;">${actionsHtml || `<li><span style='color: var(--text-muted);'>${t("risques.aucuneAction")}</span></li>`}</ul>
                            <button id="addActionBtn" class="txt-sm">${t("risques.planifierAction")}</button>
                        </div>
                        <div class="dashboard-card">
                            <h3>${t("risques.exigencesApplicables")}</h3>
                            <div class="checkbox-group" style="max-height: 250px; overflow-y: auto;">
                                ${exigencesHtml || `<p style='color: var(--text-muted);'>${t("risques.aucuneExigence")}</p>`}
                            </div>
                        </div>
                        <div class="dashboard-card" id="fair-card">${panneauQuantification(risque)}</div>
                    </div>
                </div>
            </section>
        `;

        const updatePreview = () => {
            const f = parseInt(document.getElementById("f").value) || 1;
            const g = parseInt(document.getElementById("g").value) || 1;
            const m = parseFloat(document.getElementById("m").value) || 1;
            const sBrut = f * g;
            const sRes = sBrut * m;
            document.getElementById("calc-preview").innerHTML = `
                ${tHtml("risques.calcul", { brut: sBrut })} <strong style="color: ${getRiskColor(sRes)};">${escapeHtml(I18n.nombre(sRes, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} (${getLabel(sRes)})</strong>
            `;
        };

        ["f", "g", "m"].forEach(id => document.getElementById(id).addEventListener("change", updatePreview));

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert(t("risques.nomObligatoireCourt"));

            const f = parseInt(document.getElementById("f").value);
            const g = parseInt(document.getElementById("g").value);
            const m = parseFloat(document.getElementById("m").value);
            const scoreBrut = f * g;
            const scoreResiduel = scoreBrut * m;

            risque.nom = nom;
            risque.f_frequence = f;
            risque.g_gravite = g;
            risque.m_maitrise = m;
            risque.score_brut = scoreBrut;
            risque.score_residuel = scoreResiduel;
            risque.niveau = evaluerNiveau(scoreResiduel);
            risque.description = document.getElementById("description").value.trim();
            risque.exigences_liees = Array.from(document.querySelectorAll(".exigence-cb:checked")).map(cb => cb.value);

            DataStore.updateRisque(risque);
            if(window.showToast) window.showToast(t("risques.misAJour"), "success");
            Router.navigateTo("/risques");
        };

        UI.wireDelete({
            confirm: () => t("commun.confirmerSuppression"),
            remove: () => DataStore.deleteRisque(risque.id),
            redirect: "/risques"
        });

        document.getElementById("addActionBtn").onclick = () => renderCreateAction(risque);
        document.querySelectorAll(".clickable-action").forEach(li => li.onclick = () => Router.navigateTo(`/actions/${li.dataset.id}`));
        brancherQuantification(risque);
    }

    /* =========================
       QUANTIFICATION FINANCIÈRE — FAIR (v25, action 25.4)

       ⚠️ **AUCUN MONTANT N'EST CALCULÉ ICI, ET C'EST DÉLIBÉRÉ.** Le chiffre affiché
       est `_perteAnnualisee`, servi par la base où il est une colonne ENGENDRÉE.
       L'écran ne propose donc pas d'aperçu en direct pendant la saisie : il en
       faudrait une seconde implémentation de la dérivation, qui divergerait de celle
       que la consolidation du Groupe additionne — et un comité de direction verrait
       deux chiffres pour une même chose (constat Q-219). Le montant apparaît à
       l'enregistrement, quand la base l'a rendu.

       ⚠️ **Les trois refus de saisie sont posés ICI ET EN BASE.** Ce ne sont pas des
       doublons de confort : la base refuse en 23514, un code que l'utilisateur ne sait
       pas lire, et l'écran ne peut pas être la seule barrière puisque le moteur
       d'import du lot L7 écrit lui aussi sans passer par aucun écran.
    ========================== */

    /** Les trois cases d'un triplet, préfixées `frequence`, `perte` ou `secondaire`. */
    function tripletHtml(prefixe, q, pas) {
        const v = cle => {
            const val = q ? q[prefixe + "_" + cle] : null;
            return (val === null || val === undefined) ? "" : escapeHtml(String(val));
        };
        return `
            <div class="grille-3">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: var(--text-xs);">${t("risques.fairMin")}</label>
                    <input type="number" min="0" step="${pas}" id="fair-${prefixe}-min" value="${v("min")}" />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: var(--text-xs);">${t("risques.fairProbable")}</label>
                    <input type="number" min="0" step="${pas}" id="fair-${prefixe}-probable" value="${v("probable")}" />
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: var(--text-xs);">${t("risques.fairMax")}</label>
                    <input type="number" min="0" step="${pas}" id="fair-${prefixe}-max" value="${v("max")}" />
                </div>
            </div>`;
    }

    /**
     * Le panneau. `forcerFormulaire` sert au seul cas « on vient de cliquer sur
     * Quantifier » : sans quantification en base, le panneau montre autrement son
     * invitation. ⚠️ L'état n'est PAS mémorisé dans le DOM (un `hidden` témoin, par
     * exemple) : un état d'écran caché dans le balisage survit à un redessin qui ne
     * le prévoit pas, et personne ne sait plus qui le pose.
     */
    function panneauQuantification(risque, forcerFormulaire) {
        const q = DataStore.getQuantificationDuRisque(risque.id);
        // ⚠️ Le montant vient du SERVEUR, jamais d'un calcul local — voir l'en-tête.
        const montant = q ? UI.montantFair(q._perteAnnualisee, q.devise, q._secondaireEstimee) : null;

        const entete = `<h3>${t("risques.fair")} ${Help.tip(t("risques.fairAide"))}</h3>`;

        if (!q && forcerFormulaire !== true) {
            return `${entete}
                <p class="txt-muted">${t("risques.fairAucune")}</p>
                <button id="fair-ouvrir" class="txt-sm">${t("risques.fairQuantifier")}</button>`;
        }

        // Le bandeau du montant. ⚠️ Trois états distincts, et jamais deux confondus :
        // un montant calculé, un montant PLANCHER, et « pas calculable » — qui n'est
        // pas « zéro » (classe des constats Q-201 / Q-207).
        const bandeau = montant !== null
            ? `<div style="background: var(--bg-body); padding: 12px; border-radius: 8px; margin-bottom: 15px; text-align: center; border: 1px solid var(--border);">
                   <div style="font-size: var(--text-xs); color: var(--text-muted);">${t("risques.fairAnnualisee")}</div>
                   <div style="font-size: var(--text-lg);"><strong>${montant}</strong></div>
                   ${q && q._secondaireEstimee === false
                       ? `<div style="font-size: var(--text-xs); color: var(--text-muted);">${t("risques.fairPlancher")}</div>`
                       : ""}
               </div>`
            : `<div class="synthese-message info" style="margin-bottom: 15px; font-size: var(--text-sm);">${t("risques.fairIncomplete")}</div>`;

        return `${entete}
            ${q ? bandeau : ""}
            <div class="form-group">
                <label>${t("risques.fairDevise")}</label>
                <input id="fair-devise" maxlength="3" value="${escapeHtml(q ? (q.devise || "EUR") : "EUR")}" />
            </div>
            <div class="form-group">
                <label>${t("risques.fairFrequence")} ${Help.tip(t("risques.fairFrequenceAide"))}</label>
                ${tripletHtml("frequence", q, "0.01")}
            </div>
            <div class="form-group">
                <label>${t("risques.fairPerte")} ${Help.tip(t("risques.fairPerteAide"))}</label>
                ${tripletHtml("perte", q, "100")}
            </div>
            <div class="form-group">
                <label>${t("risques.fairSecondaire")} ${Help.tip(t("risques.fairSecondaireAide"))}</label>
                ${tripletHtml("secondaire", q, "100")}
            </div>
            <div class="form-group">
                <label>${t("risques.fairHypotheses")} <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span> ${Help.tip(t("risques.fairHypothesesAide"))}</label>
                <textarea id="fair-hypotheses" rows="3">${escapeHtml(q ? (q.hypotheses || "") : "")}</textarea>
            </div>
            <div class="form-group">
                <label>${t("risques.fairSource")}</label>
                <input id="fair-source" value="${escapeHtml(q ? (q.source_donnees || "") : "")}" />
            </div>
            <div class="grille-2">
                <div class="form-group">
                    <label>${t("risques.fairConfiance")}</label>
                    <select id="fair-confiance">
                        <option value=""></option>
                        <option value="faible" ${q && q.confiance === "faible" ? "selected" : ""}>${escapeHtml(I18n.valeur("faible"))}</option>
                        <option value="moyenne" ${q && q.confiance === "moyenne" ? "selected" : ""}>${escapeHtml(I18n.valeur("moyenne"))}</option>
                        <option value="\u00e9lev\u00e9e" ${q && q.confiance === "\u00e9lev\u00e9e" ? "selected" : ""}>${escapeHtml(I18n.valeur("\u00e9lev\u00e9e"))}</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>${t("risques.fairEvalueeLe")}</label>
                    <input type="date" id="fair-date" value="${escapeHtml(q && q.evaluee_le ? String(q.evaluee_le).substring(0, 10) : new Date().toISOString().substring(0, 10))}" />
                </div>
            </div>
            <button id="fair-save">${t("commun.enregistrer")}</button>
            ${q ? `<button id="fair-delete" style="background-color: var(--color-danger); font-size: var(--text-sm); margin-left: 8px;">${t("risques.fairSupprimer")}</button>` : ""}`;
    }

    /**
     * Lit un triplet. Rend `null` si les trois cases sont vides, le tableau des
     * trois nombres sinon — et `"incomplet"` si une seule manque.
     *
     * ⚠️ **« Incomplet » est une troisième réponse, et c'est tout le critère 25.4.**
     * Rendre les deux valeurs saisies et laisser la base décider donnerait un refus
     * en 23514 ; rendre `null` effacerait silencieusement une saisie à moitié faite.
     */
    function lireTriplet(prefixe) {
        const brut = ["min", "probable", "max"].map(
            c => document.getElementById(`fair-${prefixe}-${c}`).value.trim());
        if (brut.every(v => v === "")) return null;
        if (brut.some(v => v === "")) return "incomplet";
        const nombres = brut.map(Number);
        if (nombres.some(n => !isFinite(n) || n < 0)) return "incomplet";
        if (!(nombres[0] <= nombres[1] && nombres[1] <= nombres[2])) return "ordre";
        return nombres;
    }

    function brancherQuantification(risque) {
        const ouvrir = document.getElementById("fair-ouvrir");
        if (ouvrir) {
            ouvrir.onclick = () => {
                const carte = document.getElementById("fair-card");
                carte.innerHTML = panneauQuantification(risque, true);
                brancherQuantification(risque);
            };
            return;
        }
        const bouton = document.getElementById("fair-save");
        if (!bouton) return;

        bouton.onclick = () => {
            const hypotheses = document.getElementById("fair-hypotheses").value.trim();
            if (!hypotheses) return alert(t("risques.fairHypothesesObligatoires"));

            const triplets = {};
            for (const prefixe of ["frequence", "perte", "secondaire"]) {
                const lu = lireTriplet(prefixe);
                if (lu === "incomplet") return alert(t("risques.fairTripletIncomplet"));
                if (lu === "ordre") return alert(t("risques.fairOrdre"));
                triplets[prefixe] = lu;
            }

            const existante = DataStore.getQuantificationDuRisque(risque.id);
            const q = existante || { id: UI.genId("FAIR"), risque_id: risque.id };
            q.devise = (document.getElementById("fair-devise").value.trim() || "EUR").toUpperCase();
            for (const prefixe of ["frequence", "perte", "secondaire"]) {
                const v = triplets[prefixe];
                q[prefixe + "_min"] = v ? v[0] : null;
                q[prefixe + "_probable"] = v ? v[1] : null;
                q[prefixe + "_max"] = v ? v[2] : null;
            }
            q.hypotheses = hypotheses;
            q.source_donnees = document.getElementById("fair-source").value.trim() || null;
            q.confiance = document.getElementById("fair-confiance").value || null;
            q.evaluee_le = document.getElementById("fair-date").value || null;

            if (existante) DataStore.updateQuantification(q); else DataStore.addQuantification(q);
            if (window.showToast) window.showToast(t("risques.fairEnregistree"), "success");

            // ⚠️ **On attend que le serveur ait répondu avant de redessiner.** Le
            // montant affiché est une colonne ENGENDRÉE : il n'existe pas tant que
            // l'écriture n'est pas partie. Redessiner tout de suite afficherait
            // « estimation incomplète » sur une estimation qu'on vient de compléter —
            // la classe de défaut que `UI.apresEcriture` a été écrite pour fermer, et
            // qui ne se voit qu'au navigateur : au banc, le serveur répond dans la
            // même milliseconde.
            UI.apresEcriture(() => renderDetail(risque.id));
        };

        const supprimer = document.getElementById("fair-delete");
        if (supprimer) {
            supprimer.onclick = () => {
                if (!confirm(t("risques.fairConfirmerSuppression"))) return;
                const existante = DataStore.getQuantificationDuRisque(risque.id);
                if (existante) DataStore.deleteQuantification(existante.id);
                if (window.showToast) window.showToast(t("risques.fairSupprimee"), "success");
                UI.apresEcriture(() => renderDetail(risque.id));
            };
        }
    }

    /* =========================
       CRÉATION ACTION
    ========================== */
    function renderCreateAction(risque) {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>${t("risques.nouvelleAction")}</h1>
                <div class="synthese-message warning" style="margin-bottom: 20px; padding: 10px;">
                    ${tHtml("risques.pourTraiter", { nom: risque.nom })}
                </div>
                <div class="dashboard-card">
                    <div class="form-group"><label>${t("commun.titre")} <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="titre" required /></div>
                    <div class="form-group"><label>${t("commun.responsable")}</label><input id="responsable" list="personnes-list" /></div>
                    <div class="grille-2">
                        <div class="form-group"><label>${t("commun.statut")}</label><select id="statut"><option value="à faire" selected>${I18n.valeur("à faire")}</option><option value="en cours">${I18n.valeur("en cours")}</option><option value="terminée">${I18n.valeur("terminée")}</option></select></div>
                        <div class="form-group"><label>${t("commun.echeance")}</label><input type="date" id="echeance" /></div>
                    </div>
                    <div class="form-group"><label>${t("commun.commentaire")}</label><textarea id="commentaire"></textarea></div>
                    <div class="mt-20">
                        <button id="saveAction">${t("risques.creerAction")}</button>
                        <button id="cancelAction" style="margin-left: 10px;">${t("commun.annuler")}</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveAction").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert(t("risques.titreObligatoire"));

            DataStore.addAction({
                id: UI.genId("ACT"),
                titre: titre,
                statut: document.getElementById("statut").value,
                responsable: document.getElementById("responsable").value.trim(),
                echeance: document.getElementById("echeance").value,
                commentaire: document.getElementById("commentaire").value.trim(),
                exigence_id: null,
                risque_id: risque.id
            });
            Router.navigateTo(`/risques/${risque.id}`);
        };

        document.getElementById("cancelAction").onclick = () => Router.navigateTo(`/risques/${risque.id}`);
    }

    return { renderList, renderCreate, renderDetail };
})();