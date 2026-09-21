// Emplacement : js/modules/actions.js
// Nom du fichier : actions.js

const ActionsModule = (() => {

    /* =========================
       LISTE DES ACTIONS (FILTRÉE)
    ========================== */
    /* =====================================================================
       LE KANBAN  (lot L17, action A5)

       ⚠️ **C'est une VUE de la même liste, pas un second écran.** La route
       reste `/actions` : un Kanban rangé ailleurs aurait obligé l'utilisateur
       à savoir d'avance dans laquelle des deux pages se trouve son action, et
       aurait dédoublé le filtre « donneur d'ordre » que la liste applique déjà.

       ⚠️ **Le glisser-déposer n'est PAS le seul chemin.** Chaque carte porte
       deux boutons de déplacement, et ils ne sont pas un ornement
       d'accessibilité : un pavé tactile, un lecteur d'écran, une main qui
       tremble — et le glisser devient inutilisable. Une fonctionnalité qui
       n'existe qu'à la souris est une fonctionnalité absente pour une partie
       des utilisateurs.

       ⚠️ **Les colonnes viennent du VOCABULAIRE de la base**, dans son ordre
       de progression. Les inventer ici en ferait une seconde source : le jour
       où le schéma admet un quatrième statut, les actions qui le portent
       disparaîtraient du tableau — silencieusement, ce qui est le pire.
    ===================================================================== */

    /** Les trois statuts de `ck_actions_statut`, dans l'ordre où l'on progresse. */
    const COLONNES = ["à faire", "en cours", "terminée"];

    /** Vue courante — EN MÉMOIRE. Une vue persistée ferait rouvrir le produit
        sur un écran qu'on ne se rappelle pas avoir choisi. */
    let vue = "liste";
    /** Filtre par responsable, en mémoire lui aussi. */
    let filtreResponsable = "";

    /** La carte d'une action. L'identifiant vit dans l'attribut, jamais en fermeture. */
    function carteHtml(a, peutBouger) {
        const priorite = a.priorite || "Moyenne";
        let bord = "var(--text-muted)";
        if (priorite === "Critique") bord = "var(--color-danger)";
        else if (priorite === "Haute") bord = "var(--color-warning)";
        else if (priorite === "Moyenne") bord = "var(--color-info)";

        const rang = COLONNES.indexOf(String(a.statut || "").toLowerCase());
        const retard = a.echeance && String(a.statut).toLowerCase() !== "terminée"
            && a.echeance < new Date().toISOString().slice(0, 10);

        return `<article class="kanban-carte" draggable="${peutBouger ? "true" : "false"}"
                         data-id="${escapeHtml(a.id)}"
                         style="border-left:4px solid ${bord};">
            <button type="button" class="kanban-ouvrir" data-id="${escapeHtml(a.id)}">
                ${escapeHtml(a.titre || "(sans titre)")}
            </button>
            <p class="kanban-meta">
                ${escapeHtml(priorite)}${a.responsable ? " · " + escapeHtml(a.responsable) : ""}
            </p>
            ${a.echeance
                ? `<p class="kanban-meta"><span class="status ${retard ? "status-non-conforme" : "status-non-applicable"}">${escapeHtml((retard ? "en retard — " : "") + I18n.date(a.echeance))}</span></p>`
                : ""}
            ${peutBouger
                ? `<div class="kanban-deplacer">
                       <button type="button" class="kanban-gauche" data-id="${escapeHtml(a.id)}"
                               ${rang <= 0 ? "disabled" : ""}
                               aria-label="Reculer d'une colonne">&#9666;</button>
                       <button type="button" class="kanban-droite" data-id="${escapeHtml(a.id)}"
                               ${rang < 0 || rang >= COLONNES.length - 1 ? "disabled" : ""}
                               aria-label="Avancer d'une colonne">&#9656;</button>
                   </div>`
                : ""}
        </article>`;
    }

    /**
     * Le tableau lui-même.
     *
     * ⚠️ Une action dont le statut n'est AUCUN des trois n'est pas jetée :
     * elle est rassemblée dans une colonne « hors vocabulaire », qui le DIT.
     * Les ignorer en silence serait exactement le défaut que l'entête décrit.
     */
    function kanbanHtml(actions, peutBouger) {
        const parStatut = {};
        COLONNES.forEach(c => { parStatut[c] = []; });
        const horsVocabulaire = [];
        actions.forEach(a => {
            const cle = String(a.statut || "").toLowerCase();
            if (Object.prototype.hasOwnProperty.call(parStatut, cle)) parStatut[cle].push(a);
            else horsVocabulaire.push(a);
        });

        const colonnes = COLONNES.map(statut => `
            <section class="kanban-colonne" data-statut="${escapeHtml(statut)}">
                <h2 class="kanban-titre">
                    ${escapeHtml(I18n.valeur(statut))}
                    <span class="kanban-compte">${parStatut[statut].length}</span>
                </h2>
                <div class="kanban-pile" data-statut="${escapeHtml(statut)}">
                    ${parStatut[statut].length === 0
                        ? `<p class="kanban-vide">Aucune action à ce stade.</p>`
                        : parStatut[statut].map(a => carteHtml(a, peutBouger)).join("")}
                </div>
            </section>`).join("");

        const reste = horsVocabulaire.length
            ? `<section class="kanban-colonne">
                   <h2 class="kanban-titre">Hors vocabulaire <span class="kanban-compte">${horsVocabulaire.length}</span></h2>
                   <div class="kanban-pile">
                       <p class="kanban-vide">Ces actions portent un statut que le tableau ne
                       connaît pas. Elles sont montrées ici plutôt que masquées : une action
                       invisible est une action oubliée.</p>
                       ${horsVocabulaire.map(a => carteHtml(a, false)).join("")}
                   </div>
               </section>`
            : "";

        return `<div class="kanban">${colonnes}${reste}</div>`;
    }

    /** Déplace une action d'une colonne à l'autre, et RELIT après la poussée. */
    function deplacer(id, statut) {
        const action = DataStore.getActions().find(a => a.id === id);
        if (!action) return;
        if (String(action.statut).toLowerCase() === statut) return;
        action.statut = statut;
        DataStore.updateAction(action);
        // ⚠️ `UI.apresEcriture` attend la poussée : sans elle, le redessin
        // relirait un serveur qui n'a pas encore reçu le changement, et la
        // carte reviendrait à sa colonne de départ sous les yeux de
        // l'utilisateur (classe du 16/09, trouvée au navigateur).
        UI.apresEcriture(() => { renderList(); });
    }

    function renderList() {
        const currentClient = window.FiltreDonneurOrdre ? FiltreDonneurOrdre.get() : "global";   // filtre en mémoire (app.js), plus dans le localStorage
        const exigencesClient = DataStore.getExigencesByClient(currentClient);
        const toutesExigences = DataStore.getExigences();
        const toutesActions = DataStore.getActions();
        const risques = DataStore.getRisques();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        /* =========================
           FILTRAGE SELON CONTEXTE
        ========================== */
        let actions = toutesActions;
        // ⚠️ `contextName` est injecté en `innerHTML` : le nom du client vient de
        // l'utilisateur, il passe donc par `tHtml`, qui l'échappe (§37, injection).
        let contextName = tHtml("actions.vueGlobale");

        if (currentClient !== "global") {
            const c = clients.find(cl => cl.id === currentClient);
            if (c) contextName = tHtml("actions.specifiques", { client: c.nom });

            const exIds = exigencesClient.map(e => e.id);
            actions = toutesActions.filter(a => {
                if (a.exigence_id) return exIds.includes(a.exigence_id);
                return true;
            });
        }

        // ── A5 : le filtre par responsable, commun aux deux vues ──────────
        //
        // ⚠️ Les responsables sont DÉCOUVERTS dans les actions affichées, et
        // non pris dans l'annuaire : une action peut nommer quelqu'un qui n'y
        // figure pas (saisie libre conservée, arbitrage du chantier Personnel),
        // et cette personne disparaîtrait du filtre — donc ses actions aussi.
        // Le droit d'écrire décide si les cartes bougent. ⚠️ On le demande à
        // `Droits`, qui tient la réponse du SERVEUR : un écran qui déciderait
        // lui-même laisserait croire qu'il refuse par politesse.
        const peutBouger = typeof Droits === "undefined" || Droits.peutEcrire("actions");

        const responsables = [...new Set(actions
            .map(a => (a.responsable || "").trim())
            .filter(r => r !== ""))].sort((x, y) => x.localeCompare(y, "fr"));
        if (filtreResponsable && responsables.indexOf(filtreResponsable) === -1) {
            // Le responsable filtré n'a plus d'action : on ne garde pas un
            // filtre qui ne peut plus rien rendre, il ferait croire à un plan
            // d'actions vide.
            filtreResponsable = "";
        }
        if (filtreResponsable) {
            actions = actions.filter(a => (a.responsable || "").trim() === filtreResponsable);
        }

        const rows = actions.map(a => {
            let liaison = "-";
            let origineClient = t("commun.interne");

            if (a.exigence_id) {
                const ex = toutesExigences.find(e => e.id === a.exigence_id);
                if (ex) {
                    liaison = tHtml("actions.lieeExigence", { code: ex.code });
                    if (ex.client_id) {
                        origineClient = clients.find(c => c.id === ex.client_id)?.nom || t("commun.inconnu");
                    }
                } else {
                    liaison = tHtml("actions.exigenceIntrouvable");
                }
            } else if (a.risque_id) {
                const r = risques.find(risk => risk.id === a.risque_id);
                liaison = r ? tHtml("actions.lieeRisque", { nom: r.nom }) : tHtml("actions.risqueIntrouvable");
            } else if (a.evaluation_id) {
                const ev = DataStore.getEvaluationById ? DataStore.getEvaluationById(a.evaluation_id) : null;
                if (ev) {
                    const refNom = (typeof Referentiels !== "undefined" && Referentiels.get(ev.ref_id)) ? Referentiels.get(ev.ref_id).editeur : t("actions.referentiel");
                    liaison = `${escapeHtml(refNom)} n°${escapeHtml(ev.code)}`;
                } else {
                    liaison = tHtml("actions.mesureIntrouvable");
                }
            } else if (a.incident_id) {
                const inc = DataStore.getIncidentById ? DataStore.getIncidentById(a.incident_id) : null;
                liaison = inc ? tHtml("actions.lieeIncident", { titre: inc.titre }) : tHtml("actions.incidentIntrouvable");
            } else if (a.mesure_id) {
                const mes = DataStore.getMesureById ? DataStore.getMesureById(a.mesure_id) : null;
                liaison = mes ? tHtml("actions.lieeMesure", { nom: mes.nom }) : tHtml("actions.mesureIntrouvable");
            }

            let statusClass = "status-non-applicable";
            if (String(a.statut).toLowerCase() === "terminée") statusClass = "status-conforme";
            if (String(a.statut).toLowerCase() === "en cours") statusClass = "status-partiellement-conforme";
            if (String(a.statut).toLowerCase() === "à faire") statusClass = "status-non-conforme";

            // Gestion de l'affichage de la Priorité
            const priorite = a.priorite || "Moyenne";   // valeur STOCKÉE : jamais traduite ici
            let prioColor = "var(--text-muted)";
            if (priorite === "Critique") prioColor = "var(--color-danger)";
            if (priorite === "Haute") prioColor = "var(--color-warning)";
            if (priorite === "Moyenne") prioColor = "var(--color-info)";

            return `
                <tr class="clickable-row" data-id="${a.id}">
                    <td class="stop-row-click" style="text-align: center; width: 40px;">
                        <input type="checkbox" class="row-cb" data-id="${a.id}">
                    </td>
                    <td><strong>${escapeHtml(a.titre)}</strong></td>
                    <td><strong style="color: ${prioColor};">${escapeHtml(I18n.valeur(priorite))}</strong></td>
                    <td><span class="status ${statusClass}">${escapeHtml(I18n.valeur(a.statut))}</span></td>
                    <td>${escapeHtml(a.responsable) || "-"}</td>
                    <td>${escapeHtml(I18n.date(a.echeance)) || "-"}</td>
                    <td style="font-size: var(--text-sm); color: var(--text-muted);">${liaison}</td>
                    ${currentClient === "global" ? `<td class="txt-muted-sm">${origineClient}</td>` : ""}
                </tr>
            `;
        }).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${t("actions.titre")}</h1>
                        <p class="sous-titre">${t("actions.perimetreAffiche")} <strong>${contextName}</strong></p>
                    </div>
                    <div>
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">${t("commun.supprimerSelection")} (<span id="selectedCount">0</span>)</button>
                    </div>
                </div>

                <div class="filtres-ligne no-print" style="display:flex; gap:12px; align-items:flex-end; margin-bottom:1rem; flex-wrap:wrap;">
                    <div class="form-group m0">
                        <label class="txt-sm">Affichage</label>
                        <div class="bascule-vue" role="group" aria-label="Affichage du plan d'actions">
                            <button type="button" id="vueListe" class="${vue === "liste" ? "actif" : ""}"
                                    aria-pressed="${vue === "liste"}">Liste</button>
                            <button type="button" id="vueKanban" class="${vue === "kanban" ? "actif" : ""}"
                                    aria-pressed="${vue === "kanban"}">Kanban</button>
                        </div>
                    </div>
                    <div class="form-group m0">
                        <label for="filtreResponsable" class="txt-sm">Responsable</label>
                        <select id="filtreResponsable">
                            <option value="">Tous</option>
                            ${responsables.map(r => `<option value="${escapeHtml(r)}" ${r === filtreResponsable ? "selected" : ""}>${escapeHtml(r)}</option>`).join("")}
                        </select>
                    </div>
                    ${filtreResponsable
                        ? `<button type="button" id="filtreResponsableReset" class="btn-secondary">Tout afficher</button>`
                        : ""}
                </div>

                <div class="synthese-message info" style="font-size: var(--text-base); padding: 10px;">
                    ${t("actions.tracabiliteNote")}
                </div>

                ${vue === "kanban" ? `
                ${peutBouger
                    ? ""
                    : `<div class="synthese-message" style="font-size: var(--text-base); padding:10px;">
                           Votre profil lit le plan d'actions sans pouvoir le modifier : les cartes
                           se consultent, elles ne se déplacent pas.
                       </div>`}
                ${kanbanHtml(actions, peutBouger)}
                ` : `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>${t("commun.titre")}</th>
                            <th>${t("commun.priorite")}</th>
                            <th>${t("commun.statut")}</th>
                            <th>${t("commun.responsable")}</th>
                            <th>${t("commun.echeance")}</th>
                            <th>${t("actions.colTracabilite")}</th>
                            ${currentClient === "global" ? `<th>${t("actions.colOrigine")}</th>` : ""}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan='8' style='text-align:center;'>${t("actions.aucune")}</td></tr>`}
                    </tbody>
                </table>
                `}
            </section>
        `;

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        // La case à cocher (et le lien courriel) ne doivent pas ouvrir la fiche :
        // conversion de l'ancien attribut `onclick="event.stopPropagation()"`, que la
        // politique de sécurité de contenu de production refuse.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteAction(id),
            confirm: (n) => t("actions.confirmerSuppressionMultiple", { n: n }),
            toast: (n) => t("actions.supprimees", { n: n }),
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/actions/${row.dataset.id}`);
        });

        /* ── A5 : la bascule de vue et le filtre ────────────────────────── */
        const bl = document.getElementById("vueListe");
        if (bl) bl.addEventListener("click", () => { vue = "liste"; renderList(); });
        const bk = document.getElementById("vueKanban");
        if (bk) bk.addEventListener("click", () => { vue = "kanban"; renderList(); });

        const fr = document.getElementById("filtreResponsable");
        if (fr) fr.addEventListener("change", () => { filtreResponsable = fr.value; renderList(); });
        const frr = document.getElementById("filtreResponsableReset");
        if (frr) frr.addEventListener("click", () => { filtreResponsable = ""; renderList(); });

        /* ── A5 : le Kanban ─────────────────────────────────────────────── */
        document.querySelectorAll(".kanban-ouvrir").forEach(b =>
            b.addEventListener("click", () => Router.navigateTo(`/actions/${b.dataset.id}`)));

        if (!peutBouger) return;

        // Les deux boutons de déplacement — le chemin qui ne demande PAS de
        // souris. Ils lisent le statut de la colonne qui les contient, de
        // sorte qu'un ajout de colonne ne leur échappe pas.
        const voisine = (identifiant, pas) => {
            const carte = document.querySelector(`.kanban-carte[data-id="${CSS.escape(identifiant)}"]`);
            if (!carte) return;
            const colonne = carte.closest(".kanban-colonne");
            if (!colonne) return;
            const rang = COLONNES.indexOf(colonne.dataset.statut || "");
            const cible = COLONNES[rang + pas];
            if (cible) deplacer(identifiant, cible);
        };
        document.querySelectorAll(".kanban-gauche").forEach(b =>
            b.addEventListener("click", () => voisine(b.dataset.id, -1)));
        document.querySelectorAll(".kanban-droite").forEach(b =>
            b.addEventListener("click", () => voisine(b.dataset.id, +1)));

        // Le glisser-déposer. ⚠️ L'identifiant voyage dans le TRANSFERT, pas
        // dans une variable de module : deux cartes saisies coup sur coup — ce
        // qu'un pavé tactile produit facilement — déposeraient sinon la même.
        document.querySelectorAll(".kanban-carte[draggable='true']").forEach(carte => {
            carte.addEventListener("dragstart", (e) => {
                if (e.dataTransfer) e.dataTransfer.setData("text/plain", carte.dataset.id || "");
                carte.classList.add("en-vol");
            });
            carte.addEventListener("dragend", () => carte.classList.remove("en-vol"));
        });
        document.querySelectorAll(".kanban-pile[data-statut]").forEach(pile => {
            pile.addEventListener("dragover", (e) => { e.preventDefault(); pile.classList.add("survol"); });
            pile.addEventListener("dragleave", () => pile.classList.remove("survol"));
            pile.addEventListener("drop", (e) => {
                e.preventDefault();
                pile.classList.remove("survol");
                const identifiant = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
                if (identifiant) deplacer(identifiant, pile.dataset.statut || "");
            });
        });
    }

    /* =========================
       FICHE ACTION (CRUD)
    ========================== */
    /* ⚠️ §37.6 — LA DATE STOCKÉE NE BOUGE PAS.
       Le champ `<input type="date">` de cette fiche porte la valeur ISO
       (AAAA-MM-JJ) telle qu'elle est en base, et c'est elle qui repart au
       serveur. Seul l'AFFICHAGE en lecture — la colonne « Échéance » de la
       liste — passe par `I18n.date()`. Formater à l'écriture serait un
       changement de schéma qui ne dit pas son nom. */
    function renderDetail(id) {
        const action = DataStore.getActionById(id);
        const exigences = DataStore.getExigences();
        const risques = DataStore.getRisques();
        const clients = DataStore.getClients();
        const app = document.getElementById("app");

        if (!action) {
            app.innerHTML = `
                <section class="page">
                    <h1>${t("commun.erreur")}</h1>
                    <p>${t("actions.introuvable")}</p>
                    <button type="button" id="backBtn">${t("commun.retour")}</button>
                </section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/actions"));
            return;
        }

        let liaisonHtml = `<p>${t("commun.aucuneLiaison")}</p>`;
        let contextTag = t("commun.interne");

        if (action.exigence_id) {
            const ex = exigences.find(e => e.id === action.exigence_id);
            if (ex) {
                if (ex.client_id) {
                    const c = clients.find(cl => cl.id === ex.client_id);
                    if (c) contextTag = t("actions.client", { nom: c.nom });
                }

                liaisonHtml = `
                    <p><strong>${tHtml("actions.blocExigence", { contexte: contextTag })}</strong><br>
                        <a href="#/exigences/${escapeHtml(ex.id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(ex.code)} — ${escapeHtml(ex.intitule)}
                        </a>
                    </p>`;
            }
        } else if (action.risque_id) {
            const r = risques.find(risk => risk.id === action.risque_id);
            if (r) {
                liaisonHtml = `
                    <p><strong>${t("actions.blocRisque")}</strong><br>
                        <a href="#/risques/${escapeHtml(r.id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(r.nom)} (${escapeHtml(I18n.valeur(r.niveau))})
                        </a>
                    </p>`;
            }
        } else if (action.evaluation_id) {
            const ev = DataStore.getEvaluationById ? DataStore.getEvaluationById(action.evaluation_id) : null;
            if (ev) {
                const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(ev.ref_id) : null;
                const exi = ref ? Referentiels.findExigence(ref, ev.code) : null;
                contextTag = t("actions.referentiel");
                liaisonHtml = `
                    <p><strong>${t("actions.blocEvaluation")}</strong><br>
                        <a href="#/referentiels/${escapeHtml(ev.ref_id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(ref ? ref.nom : ev.ref_id)} — n°${escapeHtml(ev.code)}${exi ? " : " + escapeHtml(exi.titre) : ""}
                        </a>
                    </p>`;
            }
        } else if (action.incident_id) {
            const inc = DataStore.getIncidentById ? DataStore.getIncidentById(action.incident_id) : null;
            if (inc) {
                contextTag = t("actions.incident");
                liaisonHtml = `
                    <p><strong>${t("actions.blocIncident")}</strong><br>
                        <a href="#/incidents/${escapeHtml(inc.id)}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(inc.titre)}
                        </a>
                    </p>`;
            }
        } else if (action.mesure_id) {
            const mes = DataStore.getMesureById ? DataStore.getMesureById(action.mesure_id) : null;
            if (mes) {
                contextTag = t("actions.mesureSecurite");
                liaisonHtml = `
                    <p><strong>${t("actions.blocMesure")}</strong><br>
                        <a href="#/mesures/${mes.id}" style="color: var(--accent); text-decoration: underline;">
                            ${escapeHtml(mes.nom)}
                        </a>
                    </p>`;
            }
        }

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>${escapeHtml(action.titre)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">${t("commun.supprimer")}</button>
                </div>

                <div class="dashboard-card">
                    <div class="synthese-message" style="background: #f8f9fa; border-left: 4px solid var(--primary); padding: 10px; margin-bottom: 20px;">
                        ${liaisonHtml}
                    </div>

                    <div class="form-group">
                        <label>${t("actions.titreAction")} <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <input id="titre" value="${escapeHtml(action.titre)}" required />
                    </div>

                    <div class="grille-2">
                        <div class="form-group">
                            <label>${t("commun.priorite")}</label>
                            <select id="priorite">
                                <option value="Basse" ${action.priorite === "Basse" ? "selected" : ""}>${I18n.valeur("Basse")}</option>
                                <option value="Moyenne" ${(!action.priorite || action.priorite === "Moyenne") ? "selected" : ""}>${I18n.valeur("Moyenne")}</option>
                                <option value="Haute" ${action.priorite === "Haute" ? "selected" : ""}>${I18n.valeur("Haute")}</option>
                                <option value="Critique" ${action.priorite === "Critique" ? "selected" : ""}>${I18n.valeur("Critique")}</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t("commun.statut")}</label>
                            <select id="statut">
                                <option value="à faire" ${action.statut === "à faire" ? "selected" : ""}>${I18n.valeur("à faire")}</option>
                                <option value="en cours" ${action.statut === "en cours" ? "selected" : ""}>${I18n.valeur("en cours")}</option>
                                <option value="terminée" ${action.statut === "terminée" ? "selected" : ""}>${I18n.valeur("terminée")}</option>
                            </select>
                        </div>
                    </div>

                    <div class="grille-2">
                        <div class="form-group">
                            <label>${t("commun.responsable")}</label>
                            <input id="responsable" list="personnes-list" value="${escapeHtml(action.responsable || "")}" />
                        </div>
                        <div class="form-group">
                            <label>${t("commun.echeance")}</label>
                            <input type="date" id="echeance" value="${escapeHtml(action.echeance || "")}" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>${t("actions.commentaireSuivi")}</label>
                        <textarea id="commentaire">${escapeHtml(action.commentaire || "")}</textarea>
                    </div>

                    <div class="mt-20">
                        <button id="saveBtn">${t("commun.mettreAJour")}</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const titre = document.getElementById("titre").value.trim();
            if (!titre) return alert(t("actions.titreObligatoire"));

            action.titre = titre;
            action.priorite = document.getElementById("priorite").value;
            action.statut = document.getElementById("statut").value;
            action.responsable = document.getElementById("responsable").value.trim();
            action.echeance = document.getElementById("echeance").value;
            action.commentaire = document.getElementById("commentaire").value.trim();

            DataStore.updateAction(action);
            if (window.showToast) window.showToast(t("actions.misAJour"), "success");
            Router.navigateTo("/actions");
        };

        UI.wireDelete({
            confirm: () => t("actions.confirmerSuppression"),
            remove: () => DataStore.deleteAction(action.id),
            toast: () => t("actions.supprimee"),
            redirect: "/actions"
        });
    }

    return {
        renderList,
        renderDetail
    };
})();