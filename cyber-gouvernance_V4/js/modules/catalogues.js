// Emplacement : js/modules/catalogues.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  GESTION DES CATALOGUES — lot L26, actions 26.2, 26.3, 26.4 et 26.5
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ **Cet écran ne sert pas à ÉVALUER un référentiel** — c'est l'onglet
// « Catalogue » qui le fait, et il n'a pas bougé. Celui-ci sert à gérer les
// catalogues eux-mêmes : savoir ce qu'ils contiennent, quand la norme a été
// publiée, laquelle remplace laquelle, et ce qu'un changement de version met en
// jeu.
//
// Il existe parce que, jusqu'au 19/09/2026, les référentiels étaient des
// fichiers JavaScript versionnés : une évolution de norme était une livraison de
// code, un client ne pouvait pas apporter sa grille, et rien ne DATAIT les
// catalogues. Ils vivent désormais en base.
//
// ── CE QUE CET ÉCRAN NE FAIT JAMAIS ────────────────────────────────────────
//
//  · **il n'applique aucune correspondance tout seul** (26.4). Une
//    correspondance appliquée sans validation propagerait un statut de
//    conformité faux, dans un outil produit en audit. Le serveur PROPOSE, avec
//    un score ; l'écran montre ; un humain crée ;
//  · **il ne reprend aucune réponse tout seul** (26.3). Il montre le PLAN —
//    ce qui se reporte, ce qui est abandonné, ce qui reste à évaluer — et
//    attend un geste. Un code identique ne garantit pas un sens identique :
//    ISO 27002:2022 a renuméroté les 114 mesures de 2013 en 93 ;
//  · **il n'invente aucune date.** Un catalogue sans date de publication est
//    annoncé « date inconnue », jamais « à jour ».

const CataloguesModule = (() => {

    /** L'état servi par `GET /api/catalogues/etat`. Nul tant qu'il n'est pas lu. */
    let etat = null;
    /** Le plan de reprise en cours d'examen, s'il y en a un. */
    let plan = null;
    /** Les propositions de correspondances en cours d'examen. */
    let propositions = null;

    /* =========================
       L'ANCIENNETÉ (action 26.5)
       ⚠️ Les quatre états viennent du SERVEUR (`f_referentiel_age`). Les
       recalculer ici en ferait une seconde source, qui divergerait au premier
       ajustement du seuil — constat Q-219.
    ========================== */
    function badgeAge(age) {
        if (age === "a_verifier") {
            return UI.badge(t("catalogues.ageAVerifier"), "status-partiel");
        }
        if (age === "date_inconnue") {
            return UI.badge(t("catalogues.ageInconnue"), "status-na");
        }
        if (age === "non_surveille") {
            return UI.badge(t("catalogues.ageNonSurveille"), "status-na");
        }
        return UI.badge(t("catalogues.ageAJour"), "status-conforme");
    }

    function nomDe(id) {
        const r = (etat && etat.catalogues || []).find(c => c.id === id);
        return r ? r.nom : id;
    }

    function ligneCatalogue(c) {
        const remplace = c.remplace_id
            ? `<div style="font-size: var(--text-xs); color: var(--text-muted);">${tHtml("catalogues.remplace", { nom: nomDe(c.remplace_id) })}</div>`
            : "";
        return `
            <tr data-id="${escapeHtml(c.id)}">
                <td>
                    <strong>${escapeHtml(c.nom)}</strong>${remplace}
                    <div style="font-size: var(--text-xs); color: var(--text-muted);">
                        <code>${escapeHtml(c.id)}</code>
                    </div>
                </td>
                <td>${escapeHtml(c.editeur || "")}</td>
                <td>${escapeHtml(c.version || "")}</td>
                <td class="num">${escapeHtml(String(c.revision))}</td>
                <td>${UI.badge(I18n.valeur(c.statut), c.statut === "en_vigueur" ? "status-conforme" : "status-na")}</td>
                <td>${escapeHtml(c.publie_le || t("catalogues.dateInconnue"))}</td>
                <td>${badgeAge(c.age)}</td>
                <td class="num">${escapeHtml(String(c.exigences))}</td>
                <td class="num">${escapeHtml(String(c.evaluations))}</td>
                <td>${c.portee_groupe ? t("catalogues.porteeGroupe") : t("catalogues.porteeLocale")}</td>
                <td>${c.remplace_id
                        ? `<button class="plan-btn" data-de="${escapeHtml(c.remplace_id)}" data-vers="${escapeHtml(c.id)}" style="font-size: var(--text-xs);">${t("catalogues.voirPlan")}</button>`
                        : ""}</td>
            </tr>`;
    }

    /* =========================
       LE PLAN DE REPRISE (action 26.3)
    ========================== */
    function blocPlan() {
        if (!plan) return "";
        const liste = (entrees, rendre) => entrees.length === 0
            ? `<p style="color: var(--text-muted);">${t("catalogues.aucun")}</p>`
            : `<ul style="max-height: 240px; overflow-y: auto;">${entrees.map(rendre).join("")}</ul>`;

        return `
            <div class="dashboard-card" style="grid-column: 1 / -1;">
                <h3>${tHtml("catalogues.planTitre", { de: nomDe(plan.de), vers: nomDe(plan.vers) })}</h3>
                <div class="synthese-message info" style="margin-bottom: 15px;">
                    ${t("catalogues.planAvertissement")}
                </div>
                <div class="dashboard-grid">
                    <div>
                        <h4>${tHtml("catalogues.planReprises", { n: plan.reprises.length })}</h4>
                        ${liste(plan.reprises, r => `<li>
                            <code>${escapeHtml(r.code)}</code> — ${escapeHtml(String(r.titre || "").substring(0, 70))}
                            ${r.intitule_modifie ? UI.badge(t("catalogues.intituleModifie"), "status-partiel") : ""}
                            <em>${escapeHtml(I18n.valeur(r.statut))}</em>
                        </li>`)}
                    </div>
                    <div>
                        <h4>${tHtml("catalogues.planAbandonnes", { n: plan.abandonnes.length })}</h4>
                        ${liste(plan.abandonnes, r => `<li>
                            <code>${escapeHtml(r.code)}</code> — ${escapeHtml(String(r.titre || "").substring(0, 70))}
                            ${r.repondue ? UI.badge(t("catalogues.repondue"), "status-partiel") : ""}
                        </li>`)}
                    </div>
                    <div>
                        <h4>${tHtml("catalogues.planNouveaux", { n: plan.nouveaux.length })}</h4>
                        ${liste(plan.nouveaux, r => `<li>
                            <code>${escapeHtml(r.code)}</code> — ${escapeHtml(String(r.titre || "").substring(0, 70))}
                        </li>`)}
                    </div>
                </div>
                <button id="appliquerPlan" ${plan.reprises.length === 0 ? "disabled" : ""}>
                    ${tHtml("catalogues.appliquerPlan", { n: plan.reprises.length })}
                </button>
                <button id="fermerPlan" style="background: var(--text-muted); margin-left: 8px;">
                    ${t("commun.fermer")}
                </button>
            </div>`;
    }

    /* =========================
       LES CORRESPONDANCES PROPOSÉES (action 26.4)
    ========================== */
    function blocSuggestions() {
        const cats = (etat && etat.catalogues || []).filter(c => c.statut === "en_vigueur");
        const options = (selection) => cats.map(c =>
            `<option value="${escapeHtml(c.id)}" ${c.id === selection ? "selected" : ""}>${escapeHtml(c.nom)}</option>`).join("");

        const resultat = !propositions ? "" : `
            <p style="color: var(--text-muted); font-size: var(--text-sm);">
                ${tHtml("catalogues.suggestionsSeuil", { seuil: propositions.seuil })}
            </p>
            <div style="max-height: 420px; overflow-y: auto;">
            <table class="data-table">
                <thead><tr>
                    <th>${t("catalogues.exigenceSource")}</th>
                    <th>${t("catalogues.propositions")}</th>
                </tr></thead>
                <tbody>${propositions.suggestions.map(s => `
                    <tr>
                        <td><code>${escapeHtml(s.code)}</code> ${escapeHtml(String(s.titre).substring(0, 90))}</td>
                        <td>${s.propositions.length === 0
                            ? `<span style="color: var(--text-muted);">${t("catalogues.aucuneProposition")}</span>`
                            : s.propositions.map(p => `
                                <div style="margin-bottom: 4px;">
                                    <code>${escapeHtml(p.code)}</code>
                                    ${escapeHtml(String(p.titre).substring(0, 70))}
                                    <span class="badge">${escapeHtml(I18n.nombre(p.score, { maximumFractionDigits: 2 }))}</span>
                                    <button class="creer-mapping" style="font-size: var(--text-xs);"
                                        data-source="${escapeHtml(propositions.source)}" data-code-source="${escapeHtml(s.code)}"
                                        data-cible="${escapeHtml(propositions.cible)}" data-code-cible="${escapeHtml(p.code)}"
                                        data-titre="${escapeHtml(String(s.titre).substring(0, 60))}">
                                        ${t("catalogues.creerCorrespondance")}
                                    </button>
                                </div>`).join("")}</td>
                    </tr>`).join("")}</tbody>
            </table></div>`;

        return `
            <div class="dashboard-card" style="grid-column: 1 / -1;">
                <h3>${t("catalogues.suggestionsTitre")} ${Help.tip(t("catalogues.suggestionsAide"))}</h3>
                <div class="synthese-message info" style="margin-bottom: 15px;">
                    ${t("catalogues.suggestionsAvertissement")}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>${t("catalogues.depuis")}</label>
                        <select id="sugSource">${options(propositions && propositions.source)}</select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label>${t("catalogues.vers")}</label>
                        <select id="sugCible">${options(propositions && propositions.cible)}</select>
                    </div>
                    <button id="proposer">${t("catalogues.proposer")}</button>
                </div>
                ${resultat}
            </div>`;
    }

    /* =========================
       RENDU
    ========================== */
    function render() {
        const app = document.getElementById("app");
        const cats = (etat && etat.catalogues) || [];

        app.innerHTML = `
            <section class="page">
                ${UI.enteteHtml({
                    titre: t("catalogues.titre"),
                    // ⚠️ `aide` reçoit du BALISAGE déjà composé, jamais du texte :
                    // `enteteHtml` ne l'échappe pas, et y passer une chaîne nue la
                    // colle au titre — vu au navigateur, où le titre lisait
                    // « Gestion des cataloguesCet écran ne sert pas… ».
                    aide: Help.tip(t("catalogues.titreAide")),
                    // ⚠️ Et la barre d'onglets se pose ICI, par `enteteHtml` : elle
                    // n'est pas un bloc à côté. L'appeler séparément ne rendait RIEN —
                    // `ongletsHtml` attend la LISTE que `ongletsDe` compose, pas une
                    // route —, et l'écran perdait sa barre sans une erreur.
                    onglets: UI.ongletsDe("/catalogues")
                })}

                <div class="dashboard-card" style="margin-bottom: 1.5rem;">
                    <h3>${t("catalogues.listeTitre")}</h3>
                    ${etat === null
                        ? `<p style="color: var(--text-muted);">${t("commun.chargement")}</p>`
                        : `<table class="data-table"><thead><tr>
                                <th>${t("catalogues.colNom")}</th>
                                <th>${t("catalogues.colEditeur")}</th>
                                <th>${t("catalogues.colVersion")}</th>
                                <th>${t("catalogues.colRevision")}</th>
                                <th>${t("commun.statut")}</th>
                                <th>${t("catalogues.colPublie")}</th>
                                <th>${t("catalogues.colAge")}</th>
                                <th>${t("catalogues.colExigences")}</th>
                                <th>${t("catalogues.colEvaluations")}</th>
                                <th>${t("catalogues.colPortee")}</th>
                                <th></th>
                           </tr></thead>
                           <tbody>${cats.map(ligneCatalogue).join("")}</tbody></table>`}
                    <p style="color: var(--text-muted); font-size: var(--text-sm); margin-top: 12px;">
                        ${t("catalogues.importAide")}
                    </p>
                </div>

                <div class="dashboard-grid">
                    ${blocPlan()}
                    ${blocSuggestions()}
                </div>
            </section>`;

        UI.envelopperTableaux();
        brancher();
    }

    function brancher() {
        document.querySelectorAll(".plan-btn").forEach(b => {
            b.onclick = () => {
                Api.catalogueReprise(b.dataset.de, b.dataset.vers)
                    .then(r => { plan = r; render(); })
                    .catch(e => { if (window.showToast) showToast(e.message, "error"); });
            };
        });

        const fermer = document.getElementById("fermerPlan");
        if (fermer) fermer.onclick = () => { plan = null; render(); };

        const appliquer = document.getElementById("appliquerPlan");
        if (appliquer) appliquer.onclick = () => appliquerLePlan();

        const proposer = document.getElementById("proposer");
        if (proposer) {
            proposer.onclick = () => {
                const source = document.getElementById("sugSource").value;
                const cible = document.getElementById("sugCible").value;
                Api.catalogueSuggestions(source, cible)
                    .then(r => { propositions = r; render(); })
                    .catch(e => { if (window.showToast) showToast(e.message, "error"); });
            };
        }

        document.querySelectorAll(".creer-mapping").forEach(b => {
            b.onclick = () => {
                // ⚠️ **C'est ICI que la correspondance est créée, et nulle part
                // ailleurs.** Le serveur a proposé, l'écran a montré, un humain
                // clique : trois étapes, et la troisième est la seule qui écrit.
                // ⚠️ La forme est celle de la surcouche du module « Correspondances » —
                // `{ id, theme, refs: { <refId>: [codes] } }` —, et NON une forme à
                // nous : une correspondance créée ici doit s'ouvrir, se modifier et se
                // masquer là-bas comme n'importe quelle autre.
                const groupe = { id: UI.genId("MAP"), theme: b.dataset.titre, refs: {} };
                groupe.refs[b.dataset.source] = [b.dataset.codeSource];
                groupe.refs[b.dataset.cible] = [b.dataset.codeCible];
                DataStore.upsertMapping(groupe);
                b.disabled = true;
                b.textContent = t("catalogues.correspondanceCreee");
                if (window.showToast) showToast(t("catalogues.correspondanceCreee"), "success");
            };
        });
    }

    /**
     * Reporte les réponses du plan sur la nouvelle version.
     *
     * ⚠️ **Les évaluations sont créées par les routes GÉNÉRIQUES**, à travers le
     * `DataStore` : elles héritent du journal, du verrouillage optimiste et du
     * cloisonnement sans qu'un chemin d'écriture soit ouvert pour ce lot. Une
     * route « reprendre » côté serveur aurait été plus courte et aurait fait une
     * seconde chaîne d'écriture — dont une seule est éprouvée.
     *
     * ⚠️ Et l'on ne reprend QUE ce qui n'existe pas déjà : rejouer le geste ne
     * doit pas écraser une réponse que quelqu'un a donnée entre-temps sur la
     * nouvelle version.
     */
    function appliquerLePlan() {
        if (!plan) return;
        if (!confirm(t("catalogues.confirmerReprise"))) return;

        const existantes = DataStore.getEvaluations()
            .filter(e => e.ref_id === plan.vers)
            .reduce((m, e) => { m[e.code] = true; return m; }, {});

        let reprises = 0;
        plan.reprises.forEach(r => {
            if (existantes[r.code]) return;
            DataStore.addEvaluation({
                id: UI.genId("EVAL"),
                ref_id: plan.vers,
                code: r.code,
                statut: r.statut,
                maturite: r.maturite,
                mesure_ids: [],
                // ⚠️ La trace de l'origine est écrite DANS la réponse : une
                // réponse reportée n'est pas une réponse donnée, et un auditeur
                // doit pouvoir faire la différence six mois plus tard.
                commentaire: tHtml("catalogues.repriseCommentaire", { de: plan.de })
            });
            reprises += 1;
        });

        if (window.showToast) showToast(tHtml("catalogues.repriseFaite", { n: reprises }), "success");
        plan = null;
        UI.apresEcriture(() => { charger(); });
    }

    function charger() {
        Api.cataloguesEtat()
            .then(r => { etat = r; render(); })
            .catch(e => {
                etat = { catalogues: [] };
                render();
                if (window.showToast) showToast(e.message, "error");
            });
    }

    function renderList() {
        etat = null;
        plan = null;
        propositions = null;
        render();
        charger();
    }

    return { renderList };
})();
