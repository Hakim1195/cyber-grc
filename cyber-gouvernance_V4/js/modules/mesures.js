// Emplacement : js/modules/mesures.js
// Nom du fichier : mesures.js
//
// Module MESURES DE SÉCURITÉ — entité PIVOT du dispositif de conformité.
// Une mesure (ex. « MFA d'entreprise ») couvre n-n plusieurs exigences de
// référentiels (ANSSI, ISO, NIS2…). On l'évalue UNE fois, puis on PROPAGE son
// statut/maturité à toutes les exigences couvertes → zéro double saisie.
//   - /mesures        → catalogue des mesures + couverture
//   - /mesures/:id    → fiche : édition, couverture, propagation

const MesuresModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    const STATUTS = [
        { v: "",                        label: "Non évalué",             cls: "status-non-evaluee" },
        { v: "conforme",                label: "Conforme",               cls: "status-conforme" },
        { v: "partiellement conforme",  label: "Partiellement conforme", cls: "status-partiellement-conforme" },
        { v: "non conforme",            label: "Non conforme",           cls: "status-non-conforme" },
        { v: "non applicable",          label: "Non applicable",         cls: "status-non-applicable" }
    ];
    function statutMeta(v) { return STATUTS.find(s => s.v === (v || "")) || STATUTS[0]; }
    const MATURITE_AIDE = "Niveau de maîtrise de la mesure, de 0 (rien en place) à 5 (processus optimisé). Échelle inspirée du CMMI.";

    function statutSelect(id, selected) {
        return `<select id="${id}">${STATUTS.map(s => `<option value="${s.v}" ${s.v === (selected || "") ? "selected" : ""}>${s.label}</option>`).join("")}</select>`;
    }
    function maturiteSelect(id, selected) {
        let o = "";
        for (let i = 0; i <= 5; i++) o += `<option value="${i}" ${i === (Number(selected) || 0) ? "selected" : ""}>${i}</option>`;
        return `<select id="${id}">${o}</select>`;
    }

    /* =====================================================================
       19.6 — L'EFFICACITÉ, ET 19.5 — LE CONTRÔLE PÉRIODIQUE
       =====================================================================

       ⚠️ **Les deux vocabulaires sont ceux de la BASE**, et leur omission
       échoue BRUYAMMENT : une valeur absente ici ne se propose pas à l'écran,
       une valeur absente de la contrainte fait échouer l'écriture en 23514. Rien
       ne réussit en silence — c'est le cas (b) du `CLAUDE.md` §3, celui où la
       liste écrite à la main est le bon outil.

       ⚠️ Et **l'efficacité n'est PAS un barème**. Trois verdicts, pas une note
       de 0 à 5 : un second barème du même format inviterait à le moyenner avec
       la maturité, et le tableau de bord afficherait un chiffre qui mélange « à
       quel point c'est institutionnalisé » avec « est-ce que ça marche ». */

    const EFFICACITES = [
        { v: "", label: "— non constatée —" },
        { v: "efficace", label: "Efficace — le contrôle protège" },
        { v: "partiellement", label: "Partiellement — il protège en partie" },
        { v: "inefficace", label: "Inefficace — il ne protège pas" }
    ];

    /** Les six rythmes de `mco_actions`, repris tels quels (critère 19.5). */
    const FREQUENCES = ["", "Ponctuelle", "Hebdomadaire", "Mensuelle",
                        "Trimestrielle", "Semestrielle", "Annuelle"];

    function efficaciteSelect(selected) {
        return '<select id="efficacite">' + EFFICACITES.map(e =>
            `<option value="${escapeHtml(e.v)}" ${e.v === (selected || "") ? "selected" : ""}>${escapeHtml(e.label)}</option>`
        ).join("") + "</select>";
    }

    function frequenceSelect(selected) {
        return '<select id="frequence_controle">' + FREQUENCES.map(f =>
            `<option value="${escapeHtml(f)}" ${f === (selected || "") ? "selected" : ""}>${escapeHtml(f || "— aucune —")}</option>`
        ).join("") + "</select>";
    }

    /**
     * La prochaine échéance, en LECTURE SEULE.
     *
     * ⚠️ **Elle est calculée ici pour être AFFICHÉE, jamais pour être écrite.**
     * Le calcul qui fait foi vit dans `f_prochain_controle()` (migration `037`),
     * et c'est lui que l'échéancier et les relances emploieront. Celui-ci est
     * une courtoisie d'écran : il évite d'attendre un aller-retour pour montrer
     * une date que l'utilisateur vient de rendre calculable en choisissant une
     * fréquence.
     *
     * ⚠️ Et il DIT qu'il n'y a pas d'échéance plutôt que d'en inventer une : un
     * contrôle jamais joué n'en a pas, un contrôle ponctuel non plus. Zéro n'est
     * pas une réponse (même motif que le taux rendu `null` de l'action 19.1).
     */
    const MOIS_PAR_FREQUENCE = { Mensuelle: 1, Trimestrielle: 3, Semestrielle: 6, Annuelle: 12 };

    function echeanceHtml(m) {
        const dernier = m.dernier_controle;
        const freq = m.frequence_controle;
        if (!dernier || !freq || freq === "Ponctuelle") {
            return '<p class="doc-note">'
                + escapeHtml(!dernier
                    ? "Aucune échéance : ce contrôle n'a jamais été joué. La date se calcule à partir du dernier passage."
                    : "Aucune échéance : un contrôle ponctuel ne se rejoue pas à date fixe.")
                + "</p>";
        }
        const d = new Date(dernier + "T00:00:00");
        if (isNaN(d.getTime())) return "";
        if (freq === "Hebdomadaire") d.setDate(d.getDate() + 7);
        else d.setMonth(d.getMonth() + MOIS_PAR_FREQUENCE[freq]);
        const enRetard = d.getTime() < Date.now();
        return '<p class="mes-echeance' + (enRetard ? " mes-echeance--retard" : "") + '">'
            + escapeHtml((enRetard ? "En retard depuis le " : "Prochain contrôle attendu le ")
                + d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }))
            + "</p>";
    }

    // Résout la couverture d'une mesure : les évaluations qui la référencent,
    // enrichies du nom de référentiel et du titre d'exigence.
    function coverageOf(mesureId) {
        const evs = DataStore.getEvaluationsByMesure(mesureId);
        return evs.map(ev => {
            const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(ev.ref_id) : null;
            const exi = ref ? Referentiels.findExigence(ref, ev.code) : null;
            return {
                ev,
                refId: ev.ref_id,
                refNom: ref ? ref.nom : ev.ref_id,
                refEditeur: ref ? ref.editeur : "",
                titre: exi ? exi.titre : ("Exigence " + ev.code)
            };
        });
    }

    /* =========================
       LISTE
    ========================== */
    function renderList() {
        const app = document.getElementById("app");
        const mesures = DataStore.getMesures();

        const rows = mesures.map(m => {
            const cov = coverageOf(m.id);
            const refCount = new Set(cov.map(c => c.refId)).size;
            const meta = statutMeta(m.statut);
            return `
                <tr class="clickable-row" data-id="${m.id}">
                    <td><strong>${escapeHtml(m.nom)}</strong></td>
                    <td><span class="status ${meta.cls}">${meta.label}</span></td>
                    <td style="text-align:center;">${Number(m.maturite) || 0}/5</td>
                    <td>${escapeHtml(m.responsable || "-")}</td>
                    <td style="text-align:center;">${cov.length === 0
                        ? `<span style="color:var(--text-muted);">—</span>`
                        : `<strong>${cov.length}</strong> exigence${cov.length > 1 ? "s" : ""}${refCount > 1 ? ` · ${refCount} réf.` : ""}`}</td>
                </tr>`;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Mesures de sécurité</h1>
                        <p style="color:var(--text-muted); margin-top:5px;">Vos contrôles de sécurité, reliés aux exigences des référentiels. ${Help.tip("Une « mesure de sécurité » est un contrôle que vous mettez en place (MFA, sauvegardes, cloisonnement…). Reliée aux exigences qu'elle couvre, elle évite de ressaisir le même constat dans chaque référentiel : évaluez la mesure, propagez.")}</p>
                    </div>
                    <button id="addMesureBtn" style="background:var(--primary);">Nouvelle mesure</button>
                </div>

                <div class="synthese-message info" style="padding:10px; font-size: var(--text-base);">
                    <strong>Principe du pivot :</strong> évaluez une mesure une seule fois, puis <em>propagez</em> son statut à toutes les exigences de référentiels qu'elle couvre. La liaison se crée depuis le <strong>Détail</strong> d'une exigence, dans un référentiel.
                </div>

                ${mesures.length === 0
                    ? `<div class="empty-state"><h3>Aucune mesure de sécurité</h3><p>Créez vos contrôles (MFA, sauvegardes, journalisation…) puis reliez-les aux exigences des référentiels.</p><button id="addMesureBtn2" style="background:var(--primary);">Créer une première mesure</button></div>`
                    : `<table class="data-table">
                        <thead>
                            <tr>
                                <th>Mesure</th>
                                <th style="width:190px;">Statut</th>
                                <th style="width:90px; text-align:center;">Maturité</th>
                                <th style="width:160px;">Responsable</th>
                                <th style="width:150px; text-align:center;">Couverture</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>`}
            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addMesureBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addMesureBtn2"); if (b2) b2.onclick = add;
        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/mesures/" + r.dataset.id));
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouvelle mesure de sécurité</h1>
                <div class="dashboard-card" style="max-width:720px;">
                    <div class="form-group"><label>Nom <span style="color:red">*</span></label><input id="nom" placeholder="Ex : Authentification multifacteur (MFA)" /></div>
                    <div class="form-group"><label>Description</label><textarea id="description" placeholder="Ce que couvre la mesure, son périmètre…"></textarea></div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group"><label>Statut</label>${statutSelect("statut", "")}</div>
                        <div class="form-group"><label>Maturité (0-5) ${Help.tip(MATURITE_AIDE)}</label>${maturiteSelect("maturite", 0)}</div>
                    </div>
                    <div class="form-group"><label>Responsable</label><input id="responsable" list="personnes-list" placeholder="Nom ou fonction" /></div>
                    <div style="margin-top:20px;">
                        <button id="save">Enregistrer</button>
                        <button id="cancel" style="margin-left:10px; background:var(--color-gray);">Annuler</button>
                    </div>
                </div>
            </section>`;

        document.getElementById("save").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) { alert("Le nom de la mesure est obligatoire."); return; }
            const id = UI.genId("MESURE");
            DataStore.addMesure({
                id, nom,
                description: document.getElementById("description").value.trim(),
                statut: document.getElementById("statut").value,
                maturite: Number(document.getElementById("maturite").value) || 0,
                responsable: document.getElementById("responsable").value.trim(),
                updatedAt: Date.now()
            });
            if (window.showToast) window.showToast("Mesure de sécurité créée.", "success");
            Router.navigateTo("/mesures/" + id);
        };
        document.getElementById("cancel").onclick = () => Router.navigateTo("/mesures");
    }

    /* =========================
       PLAN D'ACTION DE LA MESURE
       Une mesure (pivot) porte ses propres actions de remédiation (action.mesure_id).
       L'action rejoint le plan d'actions global, tracée jusqu'à la mesure — et couvre
       d'un coup toutes les exigences que la mesure porte (esprit « zéro double saisie »).
    ========================== */
    function statutClassForAction(statut) {
        const s = String(statut).toLowerCase();
        if (s === "terminée") return "status-conforme";
        if (s === "en cours") return "status-partiellement-conforme";
        return "status-non-conforme";
    }

    function actionsPanelHtml(m) {
        const actions = DataStore.getActionsByMesure(m.id);
        const list = actions.length
            ? `<ul class="ref-actions-list">${actions.map(a => `
                    <li>
                        <a href="#/actions/${a.id}" style="color:var(--accent);">${escapeHtml(a.titre)}</a>
                        ${a.priorite ? `<span style="color:var(--text-muted); font-size: var(--text-sm); margin-left:6px;">${escapeHtml(a.priorite)}</span>` : ""}
                        <span class="status ${statutClassForAction(a.statut)}" style="margin-left:8px;">${escapeHtml(a.statut)}</span>
                        ${a.echeance ? `<span style="color:var(--text-muted); font-size: var(--text-sm); margin-left:6px;">échéance ${new Date(a.echeance + "T00:00:00").toLocaleDateString('fr-FR')}</span>` : ""}
                    </li>`).join("")}</ul>`
            : `<p style="color:var(--text-muted); font-size: var(--text-base); margin:4px 0;">Aucune action de remédiation planifiée pour cette mesure.</p>`;
        return `
            <div class="ref-actions-head">
                <strong>Plan d'action ${Help.tip("Planifiez ici les actions de remédiation de cette mesure. Elles apparaissent dans le plan d'actions global, tracées jusqu'à cette mesure — et couvrent d'un coup toutes les exigences qu'elle porte.")}</strong>
                <button id="mesAddAction" style="font-size: var(--text-sm);">Planifier une action</button>
            </div>
            ${list}
            <form id="mesActionForm" hidden style="margin-top:10px;">
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end;">
                    <div class="form-group" style="margin:0; flex:2 1 240px;"><label>Intitulé <span style="color:red">*</span></label><input id="mesActTitre" placeholder="Ex : Déployer le MFA sur tous les comptes à privilèges" /></div>
                    <div class="form-group" style="margin:0; flex:1 1 120px;"><label>Priorité</label><select id="mesActPrio"><option value="Basse">Basse</option><option value="Moyenne" selected>Moyenne</option><option value="Haute">Haute</option><option value="Critique">Critique</option></select></div>
                    <div class="form-group" style="margin:0; flex:1 1 120px;"><label>Statut</label><select id="mesActStatut"><option value="à faire" selected>À faire</option><option value="en cours">En cours</option><option value="terminée">Terminée</option></select></div>
                    <div class="form-group" style="margin:0; flex:1 1 140px;"><label>Responsable</label><input id="mesActResp" list="personnes-list" placeholder="Nom / fonction" /></div>
                    <div class="form-group" style="margin:0; flex:1 1 140px;"><label>Échéance</label><input type="date" id="mesActEch" /></div>
                    <button type="button" id="mesActSave" style="flex:0 0 auto;">Créer</button>
                </div>
            </form>`;
    }

    function createActionForMesure(m) {
        const titre = document.getElementById("mesActTitre").value.trim();
        if (!titre) { alert("L'intitulé de l'action est obligatoire."); return; }
        DataStore.addAction({
            id: UI.genId("ACT"),
            titre: titre,
            priorite: document.getElementById("mesActPrio").value,
            statut: document.getElementById("mesActStatut").value,
            responsable: document.getElementById("mesActResp").value.trim(),
            echeance: document.getElementById("mesActEch").value,
            commentaire: "",
            exigence_id: null,
            risque_id: null,
            evaluation_id: null,
            incident_id: null,
            mesure_id: m.id
        });
        if (window.showToast) window.showToast("Action de remédiation créée et liée à la mesure.", "success");
        refreshActionsPanel(m);
    }

    function wireActionsPanel(m) {
        const addBtn = document.getElementById("mesAddAction");
        const form = document.getElementById("mesActionForm");
        const saveBtn = document.getElementById("mesActSave");
        if (addBtn && form) addBtn.onclick = () => { form.hidden = !form.hidden; if (!form.hidden) { const i = document.getElementById("mesActTitre"); if (i) i.focus(); } };
        if (saveBtn) saveBtn.onclick = () => createActionForMesure(m);
    }

    function refreshActionsPanel(m) {
        const block = document.getElementById("mesActionsBlock");
        if (!block) return;
        block.innerHTML = actionsPanelHtml(m);
        wireActionsPanel(m);
    }

    /* =========================
       DÉTAIL / ÉDITION + PROPAGATION
    ========================== */
    function renderDetail(id) {
        const app = document.getElementById("app");
        const m = DataStore.getMesureById(id);
        if (!m) {
            app.innerHTML = `<section class="page"><h1>Mesure introuvable</h1><p>Cette mesure n'existe pas ou a été supprimée.</p><button type="button" id="backBtn">Retour</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/mesures"));
            return;
        }

        const cov = coverageOf(m.id);
        // Regroupe la couverture par référentiel.
        const byRef = {};
        cov.forEach(c => { (byRef[c.refId] = byRef[c.refId] || { nom: c.refNom, items: [] }).items.push(c); });
        const coverageHtml = cov.length === 0
            ? `<p style="color:var(--text-muted);">Cette mesure ne couvre encore aucune exigence. Ouvrez le <strong>Détail</strong> d'une exigence dans un <a href="#/referentiels" style="color:var(--accent);">référentiel</a> et reliez-la à cette mesure.</p>`
            : Object.keys(byRef).map(refId => `
                <div style="margin-bottom:12px;">
                    <div style="font-weight:600; margin-bottom:6px;">${escapeHtml(byRef[refId].nom)}</div>
                    <ul class="ref-actions-list">
                        ${byRef[refId].items.map(c => {
                            const meta = statutMeta(c.ev.statut);
                            return `<li>
                                <a href="#/referentiels/${escapeHtml(c.refId)}" style="color:var(--accent);">n°${escapeHtml(c.ev.code)} — ${escapeHtml(c.titre)}</a>
                                <span class="status ${meta.cls}" style="margin-left:8px;">${meta.label}</span>
                            </li>`;
                        }).join("")}
                    </ul>
                </div>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(m.nom)}</h1>
                        <p style="color:var(--text-muted); margin-top:5px;"><a href="#/mesures" style="color:var(--accent);">Mesures de sécurité</a> · pivot de conformité</p>
                    </div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:2fr 1fr; align-items:start;">
                    <div class="dashboard-card">
                        <h3 style="margin-top:0;">Caractéristiques</h3>
                        <div class="form-group"><label>Nom <span style="color:red">*</span></label><input id="nom" value="${escapeHtml(m.nom)}" /></div>
                        <div class="form-group"><label>Description</label><textarea id="description">${escapeHtml(m.description || "")}</textarea></div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                            <div class="form-group"><label>Statut</label>${statutSelect("statut", m.statut)}</div>
                            <div class="form-group"><label>Maturité (0-5) ${Help.tip(MATURITE_AIDE)}</label>${maturiteSelect("maturite", m.maturite)}</div>
                        </div>
                        <div class="form-group"><label>Responsable</label><input id="responsable" list="personnes-list" value="${escapeHtml(m.responsable || "")}" /></div>

                        <!-- ── 19.6 : EST-CE QUE ÇA MARCHE ────────────────────────
                             Séparé du bloc ci-dessus par un intertitre, et pas d'un
                             champ de plus dans la même grille : la maturité dit à quel
                             point le contrôle est INSTITUTIONNALISÉ, l'efficacité s'il
                             PROTÈGE. Les mettre côte à côte sans le dire invite à les
                             lire comme deux notes de la même chose — c'est le défaut
                             classique des tableaux de bord GRC. -->
                        <fieldset class="mes-efficacite">
                            <legend>Efficacité constatée ${Help.tip("Une sauvegarde peut être documentée, planifiée et supervisée — maturité 4 — et ne pas se restaurer. Cette question-là est distincte, et c'est elle qu'un auditeur vient vérifier. « Non constatée » n'est pas « inefficace » : laissez vide tant que personne n'a regardé.")}</legend>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                                <div class="form-group"><label>Verdict</label>${efficaciteSelect(m.efficacite)}</div>
                                <div class="form-group"><label>Constatée le</label><input type="date" id="efficacite_constatee_le" value="${escapeHtml(m.efficacite_constatee_le || "")}" /></div>
                            </div>
                            <div class="form-group">
                                <label>Sur quoi la constatation s'appuie</label>
                                <input id="efficacite_preuve" maxlength="2000" value="${escapeHtml(m.efficacite_preuve || "")}" placeholder="Ex. : test de restauration du 12/03, ticket #4471" />
                                <p class="doc-note">Du texte, pas un fichier : la pièce, elle, s'attache au document qui prouve ce contrôle.</p>
                            </div>
                        </fieldset>

                        <!-- ── 19.5 : un contrôle qui ne se rejoue pas n'en est pas un ── -->
                        <fieldset class="mes-controle">
                            <legend>Contrôle périodique ${Help.tip("À quel rythme ce contrôle se rejoue, et quand il a été rejoué pour la dernière fois. Sans ces deux dates, un statut de 2024 s'affiche exactement comme un statut d'hier. La prochaine échéance est CALCULÉE — elle ne se saisit pas.")}</legend>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                                <div class="form-group"><label>Fréquence</label>${frequenceSelect(m.frequence_controle)}</div>
                                <div class="form-group"><label>Dernier passage</label><input type="date" id="dernier_controle" value="${escapeHtml(m.dernier_controle || "")}" /></div>
                            </div>
                            ${echeanceHtml(m)}
                        </fieldset>

                        <button id="saveBtn">Mettre à jour</button>
                    </div>

                    <div class="dashboard-card">
                        <h3 style="margin-top:0;">Propagation ${Help.tip("Recalcule le statut et la maturité des exigences couvertes, au plus défavorable de TOUTES leurs mesures (une exigence n'est conforme que si toutes ses mesures le sont). Cœur du « zéro double saisie ».")}</h3>
                        <p style="font-size: var(--text-sm); color:var(--text-muted);">Recalcule les <strong>${cov.length}</strong> exigence(s) couverte(s) « au plus défavorable » de leurs mesures (une exigence peut être couverte par plusieurs mesures).</p>
                        <button id="propagateBtn" style="width:100%; justify-content:center; background:var(--accent);" ${cov.length === 0 ? "disabled title='Aucune exigence liée'" : ""}>Propager aux exigences liées</button>
                    </div>
                </div>

                <div class="dashboard-card" style="margin-top:1.5rem;">
                    <div id="mesActionsBlock">${actionsPanelHtml(m)}</div>
                </div>

                <div class="dashboard-card" style="margin-top:1.5rem;">
                    <h3 style="margin-top:0;">Exigences couvertes ${Help.tip("Les exigences de référentiels reliées à cette mesure. La liaison se fait depuis le détail d'une exigence.")}</h3>
                    ${coverageHtml}
                </div>

                ${typeof PreuvesModule !== "undefined" ? PreuvesModule.encartMesureHtml(m.id) : ""}
            </section>`;

        // ── 19.3 : le même lien, lu par l'autre bout ────────────────────────
        if (typeof PreuvesModule !== "undefined") PreuvesModule.brancherMesure(m.id);

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) { alert("Le nom est obligatoire."); return; }
            m.nom = nom;
            m.description = document.getElementById("description").value.trim();
            m.statut = document.getElementById("statut").value;
            m.maturite = Number(document.getElementById("maturite").value) || 0;
            m.responsable = document.getElementById("responsable").value.trim();
            // ⚠️ La chaîne vide et non `null` : le serveur convertit le « non
            // renseigné » du navigateur, et c'est cette conversion qui est éprouvée
            // (constat Q-194). Envoyer `null` la court-circuiterait.
            m.efficacite = document.getElementById("efficacite").value;
            m.efficacite_constatee_le = document.getElementById("efficacite_constatee_le").value;
            m.efficacite_preuve = document.getElementById("efficacite_preuve").value.trim();
            m.frequence_controle = document.getElementById("frequence_controle").value;
            m.dernier_controle = document.getElementById("dernier_controle").value;
            m.updatedAt = Date.now();
            DataStore.updateMesure(m);
            if (window.showToast) window.showToast("Mesure mise à jour.", "success");
            renderDetail(m.id);
        };

        document.getElementById("propagateBtn").onclick = () => {
            // Enregistre d'abord les éventuelles modifications non sauvegardées.
            m.statut = document.getElementById("statut").value;
            m.maturite = Number(document.getElementById("maturite").value) || 0;
            DataStore.updateMesure(m);
            const n = DataStore.propagateMesure(m.id);
            if (window.showToast) window.showToast(n > 0 ? `Statut propagé à ${n} exigence(s).` : "Aucune exigence à mettre à jour.", n > 0 ? "success" : "info");
            renderDetail(m.id);
        };

        wireActionsPanel(m);

        UI.wireDelete({
            confirm: () => `Supprimer la mesure « ${m.nom} » ?\nLes exigences et actions liées seront simplement déliées (elles sont conservées).`,
            remove: () => DataStore.deleteMesure(m.id),
            toast: "Mesure supprimée.",
            redirect: "/mesures"
        });
    }

    return { renderList, renderCreate, renderDetail };
})();
