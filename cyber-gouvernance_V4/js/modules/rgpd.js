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
                <td style="font-size: var(--text-base);">${escapeHtml(t.finalite || "—")}</td>
                <td>${escapeHtml(t.base_legale || "—")}</td>
                <td class="t-centre">${t.donnees_sensibles ? `<span class="status status-non-conforme">Sensibles</span>` : "—"}</td>
                <td style="font-size: var(--text-base);">${escapeHtml(t.duree_conservation || "—")}</td>
            </tr>`).join("");

        app.innerHTML = `
            <section class="page rgpd-page">
                ${UI.enteteHtml({
                    titre: "Registre RGPD",
                    aide: Help.tip("L'article 30 du RGPD impose de tenir un registre des traitements de données personnelles : finalité, base légale, données, durées, destinataires et mesures de sécurité."),
                    contexte: "Les activités de traitement de données personnelles de cette filiale.",
                    onglets: UI.ongletsDe("/rgpd"),
                    actions:
                        (trs.length ? `<button id="printBtn" class="btn-secondary">Imprimer le registre</button>` : "") +
                        `<button id="addBtn">Nouveau traitement</button>`
                })}

                <div class="soa-print-head" style="display:none;">
                    <h1 style="margin-bottom:4px;">Registre des activités de traitement — Article 30 RGPD</h1>
                    <img class="print-brand-logo" data-brand-logo hidden alt="" />
                    <p class="txt-muted">${escapeHtml(Identite.piedImpression())} · ${dateJour}</p>
                </div>

                <div class="dashboard-grid no-print" style="grid-template-columns:repeat(2,1fr); margin-bottom:1.5rem;">
                    <div class="dashboard-card t-centre"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Traitements</h3><div class="big-kpi" style="font-size: var(--text-3xl);">${trs.length}</div></div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-danger);"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Données sensibles</h3><div class="big-kpi" style="font-size: var(--text-3xl); color:var(--color-danger);">${sensibles}</div></div>
                </div>

                ${trs.length === 0
                    ? `<div class="empty-state"><h3>Aucun traitement enregistré</h3><p>Recensez vos traitements de données personnelles (paie, clients, recrutement, vidéosurveillance…).</p><button id="addBtn2" style="background:var(--primary);">Ajouter un traitement</button></div>`
                    : `<table class="data-table soa-table">
                        <thead><tr><th>Traitement</th><th>Finalité</th><th>Base légale</th><th class="t-centre">Catégorie</th><th>Conservation</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`}

            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addBtn2"); if (b2) b2.onclick = add;
        const pb = document.getElementById("printBtn"); if (pb) pb.onclick = () => window.print();
        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/rgpd/" + r.dataset.id));
        const cr = document.getElementById("chargerRegistreProduit");
        if (cr) cr.addEventListener("click", () => chargerRegistreProduit(cr));
        if (window.Identite) Identite.brancherLogos();
    }

    /* =====================================================================
       LES DEUX AUTRES VUES DU REGISTRE — lot Interface, 16/09/2026
       =====================================================================

       ── Pourquoi trois vues et non trois écrans ─────────────────────────

       `/rgpd` empilait trois sujets sur une seule page : le registre de
       l'article 30, les documents porteurs de données personnelles, et le
       registre du PRODUIT lui-même. Trois questions différentes, trois
       lecteurs différents — le responsable du traitement, le documentaliste,
       le DPO — et une seule page qu'il fallait faire défiler pour trouver la
       sienne.

       ⚠️ **Elles ne deviennent pas trois entrées de menu pour autant.** Ce
       serait rendre au menu ce qu'on vient de lui retirer ailleurs : ce sont
       trois VUES d'un même sujet, donc trois onglets. Et c'est là que les
       actions 20.3 (AIPD) et 20.4 (demandes d'exercice de droits) entreront
       — deux onglets de plus, pas deux entrées de plus.
    ===================================================================== */

    /** Vue « Documents » : ce que la classification documentaire dit du RGPD. */
    function renderDocuments() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page rgpd-page">
                ${UI.enteteHtml({
                    titre: "Registre RGPD",
                    aide: Help.tip("Quels documents portent des données personnelles, et lesquels sont rattachés à un traitement du registre. La classification vit sur la fiche de chaque document (migration 027)."),
                    contexte: "Les documents porteurs de données personnelles, et leur rattachement "
                              + "au registre de l'article 30.",
                    onglets: UI.ongletsDe("/rgpd-documents")
                })}
                ${documentsRattachesHtml() || `<p class="chart-empty">Aucun document n'est enregistré : il n'y a rien à rattacher au registre. Les documents se recensent dans <a href="#/documents">Gestion documentaire</a>.</p>`}
            </section>`;
    }

    /**
     * Vue « L'outil lui-même » : le registre de l'article 30 DU PRODUIT.
     *
     * ⚠️ Le tableau se charge **à la demande**, et c'est délibéré : c'est une
     * pièce qu'on va chercher, pas un chiffre de pilotage. Le charger d'office
     * ferait un appel réseau à chaque visite pour une information que personne
     * ne regarde tous les jours. Le bouton dit donc ce qu'il fait.
     */
    function renderOutil() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page rgpd-page">
                ${UI.enteteHtml({
                    titre: "Registre RGPD",
                    aide: Help.tip("L'article 30 s'applique à tout traitement, y compris à l'outil qui sert à gérer les autres. Ce tableau est la réponse toute prête à la question qu'un DPO, un client ou un auditeur pose : que fait ce logiciel de nos données ? Il décrit le SCHÉMA du produit et ne contient aucune donnée personnelle."),
                    contexte: "Ce logiciel traite lui aussi des données personnelles — des noms de "
                              + "responsables, des contacts de crise, un journal d'accès.",
                    onglets: UI.ongletsDe("/rgpd-outil"),
                    actions: `<button type="button" id="chargerRegistreProduit" class="btn-secondary">Afficher le registre</button>`
                })}
                <p class="rgpd-note">
                    Le tableau est tenu <strong>dans la base</strong>, colonne par colonne : un garde-fou
                    refuse qu'une colonne susceptible de porter une donnée personnelle reste sans décision.
                    Ce n'est donc pas une liste qu'on entretient à la main — c'est le schéma qui répond.
                </p>
                <div id="registreProduit" class="registre-produit"></div>
            </section>`;
        const cr = document.getElementById("chargerRegistreProduit");
        if (cr) cr.addEventListener("click", () => chargerRegistreProduit(cr));
    }

    /* =========================
       LES DOCUMENTS RATTACHÉS AU REGISTRE (migration 027)
    ========================== */
    // Lecture seule, dérivée de ce que le DataStore porte déjà : aucun appel réseau,
    // et donc aucune seconde source pour la même information.
    function documentsRattachesHtml() {
        const docs = (typeof DataStore !== "undefined" && DataStore.getDocuments) ? DataStore.getDocuments() : [];
        const porteurs = docs.filter(d => d.donnees_personnelles);
        const rattaches = docs.filter(d => d.traitement_id);
        const orphelins = porteurs.filter(d => !d.traitement_id);
        if (!docs.length) return "";
        return `
            <div class="dash-section-title" style="margin-top:2.5rem;">Documents et données personnelles</div>
            <div class="dashboard-grid no-print" style="grid-template-columns:repeat(3,1fr); margin-bottom:1rem;">
                <div class="dashboard-card t-centre"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Documents porteurs de données personnelles</h3><div class="big-kpi" style="font-size: var(--text-3xl);">${porteurs.length}</div></div>
                <div class="dashboard-card t-centre"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Rattachés à un traitement</h3><div class="big-kpi" style="font-size: var(--text-3xl);">${rattaches.length}</div></div>
                <div class="dashboard-card t-centre"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Porteurs sans traitement</h3><div class="big-kpi" style="font-size: var(--text-3xl);">${orphelins.length}</div></div>
            </div>
            ${orphelins.length
                ? `<p style="color:var(--text-muted); font-size: var(--text-base); max-width:70ch;">
                       ${orphelins.length} document${orphelins.length > 1 ? "s portent" : " porte"} des données
                       personnelles sans être rattaché${orphelins.length > 1 ? "s" : ""} à un traitement du registre.
                       Ce n'est pas une faute — tout document nommant quelqu'un ne relève pas d'un traitement
                       déclaré — mais c'est la liste par laquelle commence une revue de conformité :
                       <a href="#/documents" class="lien-accent">Gestion documentaire</a>.
                   </p>`
                : ""}`;
    }

    /* =========================
       LE REGISTRE DU PRODUIT — chargé à la demande
    ========================== */
    // ⚠️ À LA DEMANDE, et pas au rendu de l'écran : c'est une pièce qu'on va
    // chercher, pas un chiffre de pilotage. La charger d'office ferait un appel
    // réseau à chaque visite du registre RGPD pour une information que personne
    // ne regarde tous les jours.
    function chargerRegistreProduit(bouton) {
        const hote = document.getElementById("registreProduit");
        if (!hote) return;
        bouton.disabled = true;
        bouton.textContent = "Chargement…";
        Api.registreProduit().then(reponse => {
            const colonnes = Array.isArray(reponse && reponse.colonnes) ? reponse.colonnes : [];
            const perso = colonnes.filter(c => c.nature === "personnelle");
            hote.innerHTML = `
                <p style="color:var(--text-muted); font-size: var(--text-base);">
                    ${colonnes.length} colonne${colonnes.length > 1 ? "s" : ""} décidée${colonnes.length > 1 ? "s" : ""},
                    dont <strong>${perso.length}</strong> portant des données personnelles.
                </p>
                <table class="data-table">
                    <thead><tr><th>Donnée</th><th>Finalité</th><th>Base légale</th><th class="t-centre">Durée</th><th>À l'expiration</th><th>Justification</th></tr></thead>
                    <tbody>${colonnes.map(ligneRegistreHtml).join("")}</tbody>
                </table>`;
            bouton.remove();
        }).catch(err => {
            // Un refus de droit est un cas NORMAL ici — le domaine « rgpd » n'est
            // pas ouvert à tous les profils —, et il se dit sans ressembler à une
            // panne. Le reste se dit aussi : un écran muet ferait croire que le
            // registre est vide, ce qui est l'inverse de la vérité.
            const refus = err && (err.statut === 403 || err.code === "droit_insuffisant");
            hote.innerHTML = `<p style="color:var(--text-muted); font-size: var(--text-base);">${
                refus
                    ? "Votre profil ne donne pas accès au domaine RGPD : le registre de l'outil ne vous est pas montré. Il existe, et un profil qui porte ce domaine le lira."
                    : "Le registre de l'outil n'a pas pu être chargé. Réessayez ; s'il ne revient pas, c'est le serveur qu'il faut regarder, pas ce tableau."
            }</p>`;
            bouton.disabled = false;
            bouton.textContent = "Réessayer";
        });
    }

    function ligneRegistreHtml(c) {
        const perso = c.nature === "personnelle";
        const duree = c.duree_jours ? Math.round(c.duree_jours / 365 * 10) / 10 + " an(s)" : "—";
        return `<tr>
            <td><span class="rp-colonne">${escapeHtml(c.table_nom)}.${escapeHtml(c.colonne)}</span><br>
                <span class="rp-nature-${escapeHtml(c.nature)}">${perso ? "Donnée personnelle" : "Non personnelle"}</span></td>
            <td>${escapeHtml(c.finalite || "—")}</td>
            <td>${escapeHtml(c.base_legale || "—")}</td>
            <td style="text-align:center; white-space:nowrap;">${escapeHtml(duree)}</td>
            <td>${escapeHtml(libelleExpiration(c.a_expiration))}</td>
            <td class="txt-muted">${escapeHtml(c.justification || "")}</td>
        </tr>`;
    }

    // Les quatre régimes de la migration 026, dits en français d'utilisateur. Le
    // quatrième — « signaler » — a été trouvé par un essai : un nom au milieu d'une
    // phrase ne se remplace pas sans détruire la phrase.
    const EXPIRATIONS = {
        anonymiser: "Le nom part, la ligne reste",
        supprimer: "La ligne entière est effacée",
        conserver: "Conservée — la justification dit pourquoi",
        signaler: "Signalée à un humain, jamais effacée d'office"
    };
    function libelleExpiration(v) { return EXPIRATIONS[v] || "—"; }

    /* =========================
       CRÉATION / DÉTAIL
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouveau traitement</h1>
                <div class="dashboard-card">
                    ${formFieldsHtml({})}
                    <div class="mt-20"><button id="save">Enregistrer</button><button id="cancel" style="margin-left:10px; background:var(--color-gray);">Annuler</button></div>
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
            app.innerHTML = `<section class="page"><h1>Traitement introuvable</h1><button type="button" id="backBtn">Retour</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/rgpd"));
            return;
        }
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div><h1>${escapeHtml(t.nom)}</h1><p class="sous-titre"><a href="#/rgpd" class="lien-accent">Registre RGPD</a></p></div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card">
                    ${formFieldsHtml(t)}
                    <div class="mt-20"><button id="saveBtn">Mettre à jour</button></div>
                </div>

                <!-- Action 20.3 — l'analyse d'impact de CE traitement. Elle POINTE
                     la fiche au-dessus : aucun champ du registre n'est redemandé. -->
                ${typeof AipdModule !== "undefined" ? AipdModule.encartHtml(t.id) : ""}
            </section>`;
        // ── 20.3 : l'analyse d'impact, chargée après le rendu de la fiche ────
        if (typeof AipdModule !== "undefined") AipdModule.brancherEncart(t.id);
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
            : `<p class="txt-muted-sm">Aucune mesure de sécurité définie. Créez-en dans <a href="#/mesures" class="lien-accent">Mesures de sécurité</a>.</p>`;
        return `
            <div class="form-group"><label>Nom du traitement <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="nom" value="${escapeHtml(t.nom || "")}" placeholder="Ex : Gestion de la paie" /></div>
            <div class="form-group"><label>Finalité ${Help.tip("À quoi sert le traitement, l'objectif poursuivi (ex : verser les salaires).")}</label><textarea id="finalite" placeholder="Objectif du traitement">${escapeHtml(t.finalite || "")}</textarea></div>
            <div class="grille-2">
                <div class="form-group"><label>Base légale ${Help.tip("Ce qui autorise le traitement au sens du RGPD : consentement, contrat, obligation légale, intérêt légitime…")}</label><select id="base_legale">${baseOpts}</select></div>
                <div class="form-group"><label>Responsable / service</label><input id="responsable" list="personnes-list" value="${escapeHtml(t.responsable || "")}" /></div>
            </div>
            <div class="grille-2">
                <div class="form-group"><label>Personnes concernées</label><input id="personnes_concernees" value="${escapeHtml(t.personnes_concernees || "")}" placeholder="Ex : salariés, candidats" /></div>
                <div class="form-group"><label>Catégories de données</label><input id="categories_donnees" value="${escapeHtml(t.categories_donnees || "")}" placeholder="Ex : identité, RIB, coordonnées" /></div>
            </div>
            <div class="form-group"><label class="inc-checkbox" style="border:none; background:none; padding:0;"><input type="checkbox" id="donnees_sensibles" ${t.donnees_sensibles ? "checked" : ""}> Données sensibles ${Help.tip("Catégories particulières (article 9) : santé, opinions, biométrie, etc. Leur traitement est encadré plus strictement.")}</label></div>
            <div class="grille-2">
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

    /**
     * Vue « Analyses d'impact » — RGPD article 35, action 20.3.
     *
     * ⚠️ Le tableau se charge depuis le serveur, et non depuis le `DataStore` :
     * l'**état** d'une analyse n'est pas une donnée de l'instantané, il se dérive
     * de la date de revue (`f_etat_aipd`). Le recalculer ici serait une seconde
     * rédaction de la règle, qui dériverait dès que l'horloge du poste diffère de
     * celle du serveur.
     */
    function renderAipd() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page rgpd-page">
                ${UI.enteteHtml({
                    titre: "Registre RGPD",
                    aide: Help.tip("RGPD article 35 : quand un traitement est susceptible d'engendrer un risque élevé pour les personnes, le responsable de traitement mène une analyse d'impact AVANT de le mettre en œuvre. Cet écran dit où en est chaque analyse — et, surtout, quels traitements n'en ont aucune."),
                    contexte: "Où en est chaque analyse d'impact, et quels traitements en "
                              + "réclament une.",
                    onglets: UI.ongletsDe("/rgpd-aipd")
                })}
                <div id="aipdVue"></div>
            </section>`;
        if (typeof AipdModule !== "undefined") AipdModule.monterVue("aipdVue");
    }

    /**
     * Vue « Demandes de droits » — RGPD articles 15 à 22, action 20.4.
     *
     * ⚠️ Le tableau se charge depuis le serveur, et non depuis le `DataStore` :
     * l'**échéance** d'une demande n'est pas une donnée de l'instantané, elle se
     * dérive de la date de réception (`f_echeance_droits`). La recalculer ici
     * serait une seconde rédaction de la règle, qui dériverait dès que l'horloge
     * du poste diffère de celle du serveur.
     */
    function renderDemandes() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page rgpd-page">
                ${UI.enteteHtml({
                    titre: "Registre RGPD",
                    aide: Help.tip("Les articles 15 à 22 du RGPD donnent à toute personne un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. L'article 12 §3 laisse UN MOIS pour répondre, prorogeable de deux mois si la demande est complexe — à condition d'en avoir informé la personne. Ce registre tient la trace, et le serveur tient l'horloge."),
                    contexte: "Ce qui a été demandé, par qui, pour quand — et ce qui est en retard.",
                    onglets: UI.ongletsDe("/rgpd-demandes")
                })}
                <div id="droitsVue"></div>
            </section>`;
        if (typeof DroitsModule !== "undefined") DroitsModule.monterVue("droitsVue");
    }

    return {
        renderList, renderCreate, renderDetail, renderDocuments, renderOutil,
        renderAipd, renderDemandes
    };
})();
