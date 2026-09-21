// Emplacement : js/modules/documents.js
// Nom du fichier : documents.js
//
// Gestion documentaire des POLITIQUES (chantier 5). Registre des documents de
// gouvernance (PSSI, charte, procédures…) : version, propriétaire, statut, date de
// prochaine revue (avec alertes), lien vers les référentiels. Canevas de plans fournis.
//
// ⚠️ **La phrase « l'app NE stocke PAS les fichiers » était vraie du produit
// navigateur, et elle est FAUSSE depuis le lot L6.** L'application détient les
// pièces jointes de la fiche : elle les analyse, en garde l'empreinte SHA-256 et
// les délivre elle-même. Ce qu'elle ne détient pas, c'est ce que désigne le champ
// « Document resté ailleurs » — une référence vers une GED ou un partage réseau.
// Les deux coexistent à dessein ; ce qui n'est pas admis, c'est de les confondre
// (action D4 de la vague 9, `docs/PLAN_EXECUTION.md` §3).

const DocumentsModule = (() => {

    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    const TYPES = ["Politique de sécurité (PSSI)", "Charte informatique", "Procédure",
        "Politique de sauvegarde", "Plan de continuité (PCA/PRA)", "Politique de contrôle d'accès",
        "Politique de gestion des incidents", "Registre", "Autre"];
    // Relevés dans `ck_documents_statut` (`003_metier_operations.sql`, étendu par la
    // migration 019). « en validation » est l'état pendant lequel le circuit
    // d'approbation tourne : depuis cet état, le serveur REFUSE le passage en vigueur
    // tant que l'étape de publication n'est pas approuvée (GRC06).
    const STATUTS = ["brouillon", "en validation", "en vigueur", "à réviser", "obsolète"];

    // ── CLASSIFICATION (migration 027) ──────────────────────────────────────
    // Relevés dans `ck_documents_confidentialite`. Quatre valeurs, et pas une de
    // plus : une échelle de diffusion que chacun allonge cesse d'être une échelle.
    // Le défaut est « interne » et non « public » — un document dont personne n'a
    // tranché la diffusion ne doit pas être réputé diffusable.
    const CONFIDENTIALITES = [
        ["public", "Public", "Diffusable hors du groupe, y compris à des tiers."],
        ["interne", "Interne", "Diffusable dans tout le groupe, jamais au dehors."],
        ["confidentiel", "Confidentiel", "Réservé à une population nommée (une direction, un projet)."],
        ["restreint", "Restreint", "Le cercle le plus étroit : juridique, RH, réponse à incident."]
    ];
    const LIBELLE_CONFIDENTIALITE = Object.fromEntries(CONFIDENTIALITES.map(c => [c[0], c[1]]));

    function niveauDe(doc) {
        // Une fiche antérieure à la migration 027, ou reprise d'un export ancien,
        // n'a pas de niveau : elle vaut « interne », comme le défaut de la colonne.
        // On ne rend PAS « — » : un niveau manquant à l'écran se lit « non classé »,
        // alors que la base, elle, a bien classé la ligne.
        const v = String(doc.confidentialite || "interne");
        return LIBELLE_CONFIDENTIALITE[v] ? v : "interne";
    }

    // ⚠️ AUCUNE classe de statut ici. Vert, orange, rouge et gris qualifient une
    // CONFORMITÉ (`CLAUDE.md` §2, sémantique stricte) : un document restreint n'est
    // pas « non conforme », et un document public n'est pas « non applicable ».
    // L'échelle a donc sa propre famille de classes, bâtie sur le bleu de structure.
    function diffusionBadge(doc) {
        const v = niveauDe(doc);
        return `<span class="diffusion diffusion-${v}">${escapeHtml(LIBELLE_CONFIDENTIALITE[v])}</span>`;
    }

    function etiquettesDe(doc) {
        return Array.isArray(doc.etiquettes) ? doc.etiquettes.filter(Boolean) : [];
    }

    function etiquettesHtml(doc) {
        const liste = etiquettesDe(doc);
        if (!liste.length) return "";
        return `<span class="etiquettes">${liste.map(e =>
            `<span class="etiquette">${escapeHtml(e)}</span>`).join("")}</span>`;
    }

    function traitementDe(doc) {
        if (!doc.traitement_id || typeof DataStore === "undefined" || !DataStore.getTraitementById) return null;
        return DataStore.getTraitementById(doc.traitement_id) || null;
    }

    // Canevas de plans (pré-remplissent le champ « notes / plan »).
    const CANEVAS = {
        "Politique de sécurité (PSSI)": "1. Objet et périmètre\n2. Rôles et responsabilités\n3. Classification de l'information\n4. Gestion des accès\n5. Sécurité des postes et du réseau\n6. Sauvegardes et continuité\n7. Gestion des incidents\n8. Conformité et revue",
        "Charte informatique": "1. Objet et champ d'application\n2. Usage des moyens informatiques\n3. Règles de mot de passe et d'accès\n4. Messagerie et Internet\n5. Postes nomades et supports amovibles\n6. Ce qui est interdit\n7. Contrôles et sanctions",
        "Plan de continuité (PCA/PRA)": "1. Processus critiques et RTO/RPO\n2. Scénarios de sinistre\n3. Dispositif de repli\n4. Procédures de reprise\n5. Cellule de crise et contacts\n6. Tests et maintien en condition"
    };

    function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : "—"; }
    function statutBadge(s) {
        return UI.mappedBadge(s, { "en vigueur": "status-conforme", "à réviser": "status-partiellement-conforme",
            "en validation": "status-partiellement-conforme",
            "brouillon": "status-non-applicable", "obsolète": "status-non-conforme" }, "status-non-applicable");
    }

    // État de revue à partir de la date de prochaine revue.
    function revueState(dateRevue) {
        if (!dateRevue) return { cls: "", label: "—" };
        const jours = Math.ceil((new Date(dateRevue).getTime() - Date.now()) / 864e5);
        if (jours < 0) return { cls: "decl-todo", label: `en retard (${-jours} j)`, urgent: true, overdue: true };
        // ⚠️ Le préavis vient du RÉGLAGE, et trente est la valeur du catalogue du
        //    Groupe — même discipline qu'au seuil « urgent » de l'échéancier.
        const preavis = (window.Reglages && Reglages.entier)
            ? Reglages.entier("documents.preavis_revue_jours", 30) : 30;
        if (jours <= preavis) return { cls: "decl-todo", label: `dans ${jours} j`, urgent: true };
        return { cls: "decl-ok", label: fmtDate(dateRevue) };
    }

    /* =========================
       LISTE
    ========================== */
    // Filtres de la liste — en MÉMOIRE, jamais persistés. Même arbitrage que le
    // filtre « donneur d'ordre » : un filtre qui survit à la session fait croire à
    // un registre vide (`CLAUDE.md` §8, constat sur `window.FiltreDonneurOrdre`).
    let filtreDiffusion = "";
    let filtreEtiquette = "";

    // ── La recherche documentaire (lot L16, action D3) ────────────────────
    //
    // ⚠️ **Elle est SERVEUR, et il faut le savoir en lisant ce fichier** : le
    // terme part à `/api/recherche/documents`, qui interroge un index plein
    // texte borné par la RLS. Un filtre côté navigateur sur `DataStore` aurait
    // été plus simple, et faux sur deux points — il ne saurait ni ignorer les
    // accents ni raciniser (« chiffrer » ne trouverait pas « chiffrement »), et
    // il chercherait dans ce que le navigateur détient plutôt que dans ce que
    // la session a le droit de voir.
    //
    // `null` veut dire « aucune recherche en cours » et ramène la liste
    // entière ; un tableau vide veut dire « cherché, rien trouvé » — et les
    // deux s'affichent différemment, sans quoi un vide sans explication apprend
    // à ne plus croire ce qu'on montre (classe Q-201 / Q-207).
    let rechercheTerme = "";
    let rechercheResultats = null;
    let rechercheMotif = "";
    let rechercheMinuteur = null;

    /**
     * Les résultats de la recherche documentaire.
     *
     * ⚠️ **Ils sont rendus depuis la réponse du SERVEUR, et non depuis
     * `DataStore`.** Croiser les deux aurait été tentant — pour afficher la
     * date de revue, par exemple — mais un identifiant que le navigateur ne
     * détient pas disparaîtrait alors du tableau sans un mot, et l'on aurait
     * une recherche qui trouve des documents qu'elle n'affiche pas.
     *
     * ⚠️ Et `ou` dit OÙ la correspondance a eu lieu, jamais QUOI : le serveur
     * ne rend pas l'extrait, parce qu'une annotation peut nommer quelqu'un
     * (migration `059`). Le navigateur n'a donc rien à masquer — il n'a rien
     * reçu.
     */
    function resultatsRechercheHtml() {
        if (rechercheResultats.length === 0) {
            return `<div class="empty-state">
                        <h3>Aucun document ne correspond</h3>
                        <p>${escapeHtml(rechercheMotif || "Aucun document de votre périmètre ne correspond à ce terme.")}</p>
                        <button type="button" id="rechercheEffacer2" class="btn-secondary">Revenir au registre</button>
                    </div>`;
        }
        const OU = { titre: "le titre", type: "le type", notes: "les annotations" };
        const lignes = rechercheResultats.map(r => {
            const ou = (r.ou || []).map(o => OU[o] || o).join(" et ");
            return `<tr class="clickable-row" data-id="${escapeHtml(r.id)}">
                <td><strong>${escapeHtml(r.titre)}</strong></td>
                <td class="txt-sm">${escapeHtml(r.type || "—")}</td>
                <td class="t-centre">${escapeHtml(r.version || "—")}</td>
                <td>${statutBadge(r.statut)}</td>
                <td class="txt-muted-sm">${escapeHtml(ou ? "Trouvé dans " + ou : "—")}</td>
            </tr>`;
        }).join("");
        return `<p class="no-print" style="font-size: var(--text-sm); color:var(--text-muted); margin-bottom:.5rem;">
                    ${rechercheResultats.length} document${rechercheResultats.length > 1 ? "s" : ""} trouvé${rechercheResultats.length > 1 ? "s" : ""}, du plus pertinent au moins pertinent.
                    ${escapeHtml(rechercheMotif)}
                    <button type="button" id="rechercheEffacer" class="lien-bandeau">Revenir au registre</button>
                </p>
                <table class="data-table">
                    <thead><tr><th>Titre</th><th>Type</th><th class="t-centre">Version</th><th>Statut</th><th>Correspondance</th></tr></thead>
                    <tbody>${lignes}</tbody>
                </table>`;
    }

    /**
     * Interroge le serveur, puis redessine.
     *
     * ⚠️ **Un échec réseau NE VIDE PAS la liste** : il le DIT. Rendre « aucun
     * résultat » quand on n'a pas pu demander serait annoncer une absence qui
     * n'a pas été constatée — et la première chose qu'on fait d'un écran qui
     * ment sur ce qu'il n'a pas pu lire est de cesser de le croire.
     */
    async function lancerRecherche(terme) {
        rechercheTerme = terme;
        try {
            // ⚠️ **`UI.apresEcriture` attend la poussée AVANT d'interroger**, et ce
            // n'est pas une précaution de principe : la recherche est SERVEUR, et un
            // document que l'utilisateur vient de créer n'est peut-être pas encore
            // arrivé. Sans cette attente, chercher son propre document trois secondes
            // après l'avoir écrit rendrait « aucun document ne correspond » — c'est-à-dire
            // la classe Q-201 / Q-207, dans l'écran même qui sert à retrouver ses preuves.
            //
            // ⚠️ Et le banc navigateur ne peut PAS voir ce défaut : il monte le serveur
            // dans le même processus, où la poussée aboutit dans la même milliseconde.
            // C'est `test/depot/relecture-apres-ecriture.test.mjs` qui le ferme, à la
            // CLASSE — et c'est lui qui a réclamé cette attente ici.
            const reponse = await UI.apresEcriture(() => Api.rechercheDocuments(terme));
            rechercheResultats = (reponse && reponse.resultats) || [];
            rechercheMotif = (reponse && reponse.motif) || "";
        } catch (erreur) {
            rechercheResultats = [];
            rechercheMotif = "La recherche n'a pas pu être faite : le serveur n'a pas répondu. "
                + "Ce n'est pas un registre vide, c'est une question restée sans réponse.";
        }
        renderList();
    }

    function renderList() {
        const app = document.getElementById("app");
        const tous = [...DataStore.getDocuments()].sort((a, b) => (a.date_revue || "9999").localeCompare(b.date_revue || "9999"));
        const docs = tous.filter(d =>
            (!filtreDiffusion || niveauDe(d) === filtreDiffusion) &&
            (!filtreEtiquette || etiquettesDe(d).some(e => e.toLowerCase() === filtreEtiquette.toLowerCase())));
        const enVigueur = tous.filter(d => d.statut === "en vigueur").length;
        const aReviser = tous.filter(d => { const r = revueState(d.date_revue); return r.urgent; }).length;
        // Le signal que la base n'INTERDIT pas — elle a des cas légitimes (un
        // document public nomme son DPO, article 13) — et que personne ne verrait
        // sans l'afficher : diffusable au dehors, et porteur de données personnelles.
        const exposes = tous.filter(d => niveauDe(d) === "public" && d.donnees_personnelles);

        const etiquettesConnues = [...new Set(tous.flatMap(etiquettesDe))].sort((a, b) => a.localeCompare(b, "fr"));

        const rows = docs.map(d => {
            const r = revueState(d.date_revue);
            return `<tr class="clickable-row" data-id="${d.id}">
                <td><strong>${escapeHtml(d.titre)}</strong>${etiquettesHtml(d)}</td>
                <td class="txt-sm">${escapeHtml(d.type || "—")}</td>
                <td class="t-centre">${escapeHtml(d.version || "—")}</td>
                <td>${diffusionBadge(d)}${d.donnees_personnelles
                    ? ` <span class="marqueur-dp" title="Ce document contient des données personnelles.">DP</span>` : ""}</td>
                <td>${escapeHtml(d.proprietaire || "—")}</td>
                <td>${statutBadge(d.statut)}</td>
                <td>${r.cls ? `<span class="status ${r.cls}">${escapeHtml(r.label)}</span>` : "—"}</td>
            </tr>`;
        }).join("");

        const barreFiltres = `
            <div class="filtres-ligne no-print" style="display:flex; gap:12px; align-items:flex-end; margin-bottom:1rem; flex-wrap:wrap;">
                <div class="form-group" style="margin:0; flex:1 1 280px;">
                    <label for="rechercheDocs" class="txt-sm">Rechercher ${Help.tip("La recherche porte sur le titre, le type et les annotations, par un index plein texte : les accents et le pluriel sont ignorés, et « chiffrer » trouve « chiffrement ». Elle ne va pas encore dans le contenu des fichiers joints. Elle ne montre que les documents de votre périmètre.")}</label>
                    <input type="search" id="rechercheDocs" placeholder="chiffrement, sauvegarde, accès distants…"
                           maxlength="100" autocomplete="off" value="${escapeHtml(rechercheTerme)}">
                </div>
                <div class="form-group m0">
                    <label class="txt-sm">Diffusion</label>
                    <select id="filtreDiffusion">
                        <option value="">Tous les niveaux</option>
                        ${CONFIDENTIALITES.map(c => `<option value="${escapeHtml(c[0])}" ${c[0] === filtreDiffusion ? "selected" : ""}>${escapeHtml(c[1])}</option>`).join("")}
                    </select>
                </div>
                <div class="form-group m0">
                    <label class="txt-sm">Étiquette</label>
                    <select id="filtreEtiquette">
                        <option value="">Toutes</option>
                        ${etiquettesConnues.map(e => `<option value="${escapeHtml(e)}" ${e === filtreEtiquette ? "selected" : ""}>${escapeHtml(e)}</option>`).join("")}
                    </select>
                </div>
                ${(filtreDiffusion || filtreEtiquette)
                    ? `<button type="button" id="filtreReset" class="btn-secondary">Tout afficher (${docs.length} sur ${tous.length})</button>` : ""}
            </div>`;

        const alerteExposition = exposes.length
            ? `<div class="bandeau-attention no-print" id="alerteExposition">
                   <strong>${exposes.length} document${exposes.length > 1 ? "s" : ""} public${exposes.length > 1 ? "s" : ""} contient${exposes.length > 1 ? "nent" : ""} des données personnelles.</strong>
                   Ce n'est pas une faute en soi — un document public peut légitimement nommer son DPO
                   (article 13) — mais c'est la combinaison qu'un contrôle regarde en premier.
                   <button type="button" id="voirExposes" class="lien-bandeau">Les voir</button>
               </div>`
            : "";

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>Gestion documentaire</h1>
                        <p class="sous-titre">Registre des politiques et documents de sécurité. ${Help.tip("Une documentation à jour (PSSI, charte, procédures) est attendue par la plupart des référentiels et par vos clients. Chaque fiche peut porter ses fichiers : l'application les analyse, en garde l'empreinte et les délivre elle-même. La pièce marquée « en vigueur » est celle qui fait foi, et c'est elle qui donne le numéro de version de la fiche. Le champ « Document resté ailleurs » ne désigne, lui, qu'une référence externe.")}</p>
                    </div>
                    <button id="addBtn" style="background:var(--primary);">Nouveau document</button>
                </div>

                <div class="dashboard-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:1.5rem;">
                    <div class="dashboard-card t-centre"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Documents</h3><div class="big-kpi" style="font-size: var(--text-3xl);">${docs.length}</div></div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-success);"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">En vigueur</h3><div class="big-kpi" style="font-size: var(--text-3xl); color:var(--color-success);">${enVigueur}</div></div>
                    <div class="dashboard-card" style="text-align:center; border-top:4px solid var(--color-warning);"><h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">Revue à prévoir</h3><div class="big-kpi" style="font-size: var(--text-3xl); color:var(--color-warning);">${aReviser}</div></div>
                </div>

                ${alerteExposition}
                ${tous.length ? barreFiltres : ""}

                ${rechercheResultats !== null
                    ? resultatsRechercheHtml()
                    : tous.length === 0
                    ? `<div class="empty-state"><h3>Aucun document</h3><p>Référencez vos politiques et procédures pour suivre leurs versions et leurs dates de revue.</p><button id="addBtn2" style="background:var(--primary);">Ajouter un document</button></div>`
                    : docs.length === 0
                    ? `<div class="empty-state"><h3>Aucun document ne correspond au filtre</h3><p>${tous.length} document${tous.length > 1 ? "s sont" : " est"} enregistré${tous.length > 1 ? "s" : ""} : c'est le filtre qui les masque, pas le registre qui est vide.</p><button type="button" id="filtreReset2" class="btn-secondary">Tout afficher</button></div>`
                    : `<table class="data-table">
                        <thead><tr><th>Titre</th><th>Type</th><th class="t-centre">Version</th><th>Diffusion</th><th>Propriétaire</th><th>Statut</th><th>Prochaine revue</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>`}
            </section>`;

        const add = () => renderCreate();
        const b1 = document.getElementById("addBtn"); if (b1) b1.onclick = add;
        const b2 = document.getElementById("addBtn2"); if (b2) b2.onclick = add;
        // ── La recherche documentaire ────────────────────────────────────
        //
        // ⚠️ **Un délai de garde, et il n'est pas cosmétique** : sans lui, un
        // appel part à CHAQUE frappe, et la recherche consomme le budget de
        // trace du sondage — le serveur inscrirait au journal inaltérable une
        // extraction par lettre tapée. C'est la classe du constat Q-301, prise
        // du bon côté cette fois.
        const champ = document.getElementById("rechercheDocs");
        if (champ) {
            champ.addEventListener("input", () => {
                const terme = champ.value.trim();
                if (rechercheMinuteur) clearTimeout(rechercheMinuteur);
                if (terme === "") {
                    rechercheTerme = "";
                    rechercheResultats = null;
                    rechercheMotif = "";
                    renderList();
                    return;
                }
                rechercheMinuteur = setTimeout(() => { lancerRecherche(terme); }, 300);
            });
            // Le curseur revient là où il était : `renderList()` réécrit tout
            // le balisage, et un champ de recherche qui perd le focus à chaque
            // résultat est un champ dans lequel on ne peut pas corriger un mot.
            if (rechercheTerme) {
                champ.focus();
                champ.setSelectionRange(champ.value.length, champ.value.length);
            }
        }
        const effacer = () => {
            rechercheTerme = "";
            rechercheResultats = null;
            rechercheMotif = "";
            renderList();
        };
        const re1 = document.getElementById("rechercheEffacer");
        if (re1) re1.addEventListener("click", effacer);
        const re2 = document.getElementById("rechercheEffacer2");
        if (re2) re2.addEventListener("click", effacer);

        const fd = document.getElementById("filtreDiffusion");
        if (fd) fd.addEventListener("change", () => { filtreDiffusion = fd.value; renderList(); });
        const fe = document.getElementById("filtreEtiquette");
        if (fe) fe.addEventListener("change", () => { filtreEtiquette = fe.value; renderList(); });
        const remise = () => { filtreDiffusion = ""; filtreEtiquette = ""; renderList(); };
        const fr1 = document.getElementById("filtreReset"); if (fr1) fr1.addEventListener("click", remise);
        const fr2 = document.getElementById("filtreReset2"); if (fr2) fr2.addEventListener("click", remise);
        const ve = document.getElementById("voirExposes");
        if (ve) ve.addEventListener("click", () => { filtreDiffusion = "public"; filtreEtiquette = ""; renderList(); });
        app.querySelectorAll(".clickable-row").forEach(r => r.onclick = () => Router.navigateTo("/documents/" + r.dataset.id));
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <h1>Nouveau document</h1>
                <div class="dashboard-card">
                    ${formFieldsHtml({})}
                    <div class="mt-20"><button id="save">Enregistrer</button><button id="cancel" style="margin-left:10px; background:var(--color-gray);">Annuler</button></div>
                </div>
            </section>`;
        wireCanevas();
        wireClassification();
        document.getElementById("save").onclick = () => {
            const doc = collectForm();
            if (!doc) return;
            doc.id = UI.genId("DOC");
            doc.updatedAt = Date.now();
            DataStore.addDocument(doc);
            if (window.showToast) window.showToast("Document enregistré.", "success");
            Router.navigateTo("/documents/" + doc.id);
        };
        document.getElementById("cancel").onclick = () => Router.navigateTo("/documents");
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const app = document.getElementById("app");
        const doc = DataStore.getDocumentById(id);
        if (!doc) {
            app.innerHTML = `<section class="page"><h1>Document introuvable</h1><button type="button" id="backBtn">Retour</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/documents"));
            return;
        }
        const r = revueState(doc.date_revue);
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div><h1>${escapeHtml(doc.titre)}</h1><p class="sous-titre"><a href="#/documents" class="lien-accent">Gestion documentaire</a></p></div>
                    <button id="deleteBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                ${r.overdue ? `<div class="synthese-message danger" style="padding:12px; margin-bottom:1rem;"><strong>Revue en retard</strong> — la date de revue de ce document est dépassée. Pensez à le mettre à jour et à décaler la prochaine échéance.</div>` : ""}
                <div class="dashboard-card">
                    ${formFieldsHtml(doc)}
                    <div class="mt-20"><button id="saveBtn">Mettre à jour</button></div>
                </div>
                ${typeof PiecesModule !== "undefined" ? PiecesModule.hoteHtml() : ""}
                ${typeof ApprobationsModule !== "undefined" ? ApprobationsModule.encartHtml("documents", doc.id) : ""}
                ${typeof PreuvesModule !== "undefined" ? PreuvesModule.encartDocumentHtml(doc) : ""}
                ${typeof AttestationsModule !== "undefined" ? AttestationsModule.encartHtml(doc.id) : ""}
            </section>`;
        wireCanevas();
        wireClassification();
        // Pièces jointes (lot L6) : le panneau se monte APRÈS le rendu de la
        // fiche — c'est le seul moment où son conteneur existe. Le champ
        // « Emplacement » ci-dessus désigne un fichier resté ailleurs ; celui-ci
        // désigne un fichier que l'application détient, analyse et délivre.
        if (typeof PiecesModule !== "undefined") {
            PiecesModule.monter("documents", doc.id, { auChargement: refleterVersionEnVigueur });
        }
        // ── D5 : le circuit d'approbation, SUR la fiche ────────────────────
        //
        // Le lot L8 livrait l'encart et personne ne l'appelait : le circuit
        // vivait sur son propre écran, et la fiche ignorait qu'il existait. C'est
        // le chaînon que l'action D5 pose — et la barrière, elle, est dans la
        // base (`trg_documents_publication`, code GRC06), pas ici.
        if (typeof ApprobationsModule !== "undefined") {
            // ⚠️ **`doc.id` n'est qu'un REPLI depuis le constat Q-303** : c'est le
            // `data-id` du conteneur qui fait foi, parce que le renommage l'a
            // recalé quand le serveur a réattribué l'identifiant à la création.
            // La parade vivait déjà dans `approbations.js`, et cet appel la
            // désarmait — l'encart annonçait « introuvable… ou il appartient à une
            // autre filiale » sur un document qu'on venait de créer.
            ApprobationsModule.brancherEncart("documents", doc.id);
        }
        // ── 19.1 : qui a lu cette politique, SUR la fiche ───────────────────
        //
        // Même couture que l'encart d'approbation, et pour la même raison : la
        // preuve se lit à côté de ce qu'elle prouve. `brancherEncart` relit
        // l'identifiant dans le `data-id` du conteneur — l'argument n'est qu'un
        // repli, parce que le serveur réattribue l'identifiant à la création
        // (constat Q-303).
        if (typeof AttestationsModule !== "undefined") {
            AttestationsModule.brancherEncart(doc.id);
        }
        // ── 19.3 : ce que ce document PROUVE ────────────────────────────────
        //
        // Le panneau vit au-dessus des pièces jointes, et la distance est un
        // propos : un rattachement dit « ce texte décrit ce contrôle », une pièce
        // jointe dit « voici le fichier ». Les deux répondent à un auditeur, mais
        // pas à la même question.
        if (typeof PreuvesModule !== "undefined") {
            PreuvesModule.brancherDocument(doc.id);
        }
        document.getElementById("saveBtn").onclick = () => {
            const data = collectForm();
            if (!data) return;
            Object.assign(doc, data, { updatedAt: Date.now() });
            DataStore.updateDocument(doc);
            if (window.showToast) window.showToast("Document mis à jour.", "success");
            renderDetail(doc.id);
        };
        UI.wireDelete({
            confirm: "Supprimer ce document du registre ?",
            remove: () => DataStore.deleteDocument(doc.id),
            toast: "Document supprimé.",
            redirect: "/documents"
        });
    }

    /**
     * Le champ « Version » cesse d'être une saisie libre dès qu'un fichier fait foi.
     *
     * ⚠️ **Il devient une LECTURE, il ne disparaît pas.** Le masquer laisserait
     * croire que la fiche ne porte plus de version ; le laisser modifiable
     * rouvrirait très exactement le défaut que l'action D1 ferme — « 2.1 » frappé
     * ici au-dessus du PDF de la 1.4. On l'affiche, on dit d'où il vient, et on
     * dit où le changer.
     *
     * ⚠️ **`readOnly`, et surtout pas `disabled`.** Un champ désactivé n'est pas
     * envoyé par le formulaire : `collectForm()` lirait une chaîne vide et
     * l'enregistrement suivant **effacerait la version** — une perte de donnée
     * silencieuse, sur le geste le plus banal qui soit.
     *
     * Appelée par `PiecesModule` après CHAQUE lecture de la liste : le champ suit
     * donc la désignation sans que la fiche soit redessinée.
     */
    function refleterVersionEnVigueur(etat) {
        const champ = document.getElementById("version");
        const note = document.getElementById("versionOrigine");
        if (!champ || !note) return;
        const piece = etat && etat.enVigueur;
        if (!piece) {
            champ.readOnly = false;
            champ.classList.remove("doc-verrouille");
            note.hidden = true;
            note.textContent = "";
            return;
        }
        champ.readOnly = true;
        champ.classList.add("doc-verrouille");
        champ.value = piece.version_piece || "";
        note.hidden = false;
        // `textContent` : le nom du fichier vient d'un déposant, et il ne
        // construit aucun balisage ici.
        note.textContent = piece.version_piece
            ? "Version donnée par la pièce en vigueur (" + (piece.nom_fichier || "fichier") +
              "). Pour la changer, déposez une nouvelle version et faites-la faire foi."
            : "La pièce en vigueur (" + (piece.nom_fichier || "fichier") + ") ne porte aucun " +
              "numéro de version. Déposez une nouvelle version en la numérotant.";
    }

    /* =========================
       FORMULAIRE
    ========================== */
    function formFieldsHtml(doc) {
        const refs = (typeof Referentiels !== "undefined") ? Referentiels.all() : [];
        const linked = Array.isArray(doc.referentiels) ? doc.referentiels : [];
        const niveau = niveauDe(doc);
        const confOpts = CONFIDENTIALITES.map(c =>
            `<option value="${escapeHtml(c[0])}" ${c[0] === niveau ? "selected" : ""}>${escapeHtml(c[1])}</option>`).join("");
        const confNote = (CONFIDENTIALITES.find(c => c[0] === niveau) || [])[2] || "";
        // ══ QUELS TRAITEMENTS PROPOSER — constat Q-294 ═══════════════════════
        //
        // La règle de la base n'est PAS symétrique, et la liste doit dire la même
        // chose qu'elle :
        //
        //  · un document LOCAL peut relever d'un traitement de sa filiale **ou
        //    d'un traitement de portée Groupe** — c'est le cas le plus fréquent
        //    (l'annuaire commun, le journal d'audit de cet outil), et il est sans
        //    danger : un traitement de Groupe n'est effaçable que par
        //    l'administration Groupe ;
        //  · un document de portée GROUPE ne peut relever que d'un traitement de
        //    portée Groupe. C'est le constat **N-10** : la politique que les vingt
        //    filiales lisent ne doit pas désigner une ligne qu'UNE filiale peut
        //    effacer.
        //
        // ⚠️ **Le produit servait TOUS les traitements, les offrait ici, et les
        // refusait en 409** — en disant à l'utilisateur que l'élément « n'existe
        // pas dans votre périmètre » alors qu'il était affiché sous ses yeux.
        // L'arbitrage a été corrigé dans la base (migration `030`) plutôt que
        // l'écran : filtrer la liste des deux côtés aurait rendu le produit
        // cohérent en lui retirant la moitié de ce que le lot promettait. Ce qui
        // reste ici est le SEUL sens qui demeure interdit.
        const tousTraitements = (typeof DataStore !== "undefined" && DataStore.getTraitements) ? DataStore.getTraitements() : [];
        const traitements = doc._porteeGroupe === true
            ? tousTraitements.filter(t => t._porteeGroupe === true)
            : tousTraitements;
        const trtVide = traitements.length === 0;
        const trtNoteFiltre = (doc._porteeGroupe === true && tousTraitements.length > traitements.length)
            ? `<p class="doc-note">Portée Groupe : seuls les traitements de portée Groupe sont proposés — un socle commun ne peut pas dépendre d'une ligne qu'une filiale peut effacer.</p>`
            : "";
        const trtOpts = `<option value="">— Aucun —</option>` + traitements.map(t =>
            `<option value="${escapeHtml(t.id)}" ${t.id === doc.traitement_id ? "selected" : ""}>${escapeHtml(t.nom)}</option>`).join("");
        const typeOpts = TYPES.map(t => `<option value="${escapeHtml(t)}" ${t === doc.type ? "selected" : ""}>${escapeHtml(t)}</option>`).join("");
        const statutOpts = STATUTS.map(s => `<option value="${s}" ${s === (doc.statut || "brouillon") ? "selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("");
        const refsHtml = refs.length
            ? `<div class="inc-actifs">${refs.map(rf => `<label class="inc-checkbox"><input type="checkbox" class="doc-ref" value="${escapeHtml(rf.id)}" ${linked.includes(rf.id) ? "checked" : ""}> ${escapeHtml(rf.editeur)}</label>`).join("")}</div>`
            : `<p class="txt-muted-sm">Aucun référentiel chargé.</p>`;
        return `
            <div class="form-group"><label>Titre <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label><input id="titre" value="${escapeHtml(doc.titre || "")}" placeholder="Ex : Politique de sécurité du SI (PSSI)" /></div>
            <div class="grille">
                <div class="form-group col-6"><label>Type</label><select id="type">${typeOpts}</select></div>
                <div class="form-group col-3"><label>Version ${Help.tip("Numéro de version du document. Dès qu'une pièce jointe de cette fiche est marquée « en vigueur », c'est ELLE qui donne ce numéro : le champ devient alors une lecture, et il suit le fichier qui fait foi. Tant qu'aucun fichier n'est détenu ici, il reste saisissable.")}</label><input id="version" value="${escapeHtml(doc.version || "")}" placeholder="1.0" /><p id="versionOrigine" class="doc-note" hidden></p></div>
                <div class="form-group col-3"><label>Statut</label><select id="statut">${statutOpts}</select></div>
            </div>
            <div class="grille-2">
                <div class="form-group"><label>Propriétaire</label><input id="proprietaire" list="personnes-list" value="${escapeHtml(doc.proprietaire || "")}" placeholder="Nom ou fonction" /></div>
                <div class="form-group"><label>Prochaine revue ${Help.tip("Date à laquelle le document devra être revu. Une alerte apparaît à l'approche ou au dépassement de l'échéance.")}</label><input type="date" id="date_revue" value="${escapeHtml(doc.date_revue || "")}" /></div>
            </div>
            <div class="form-group"><label>Document resté ailleurs ${Help.tip("Une RÉFÉRENCE vers un document que l'application ne détient pas : chemin réseau, GED, intranet, coffre qualité. L'application ne la lit pas, ne la vérifie pas, ne la délivre pas — et ne saura jamais si ce qui est au bout a changé. À ne pas confondre avec les pièces jointes de cette fiche, plus bas, qui sont détenues, analysées et délivrées ici.")}</label><input id="emplacement" value="${escapeHtml(doc.emplacement || "")}" placeholder="Ex : \\\\serveur\\qualite\\PSSI_v1.pdf" /><p class="doc-note">Référence externe — le fichier n'est pas détenu par l'application.</p></div>
            <div class="form-group"><label>Référentiels couverts</label>${refsHtml}</div>

            <!-- ── CLASSIFICATION (migration 027) ──────────────────────────── -->
            <fieldset class="bloc-classification">
                <legend>Classification ${Help.tip("Deux questions que tout audit pose, et auxquelles le registre ne savait pas répondre : jusqu'où ce document peut-il circuler, et contient-il des données personnelles ? Le niveau de diffusion est obligatoire — « non classé » est précisément le trou que l'ISO 27001 (A.5.12) et le RGPD demandent de fermer.")}</legend>
                <div class="grille-2">
                    <div class="form-group">
                        <label>Niveau de diffusion <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <select id="confidentialite">${confOpts}</select>
                        <p class="doc-note" id="confidentialiteNote">${escapeHtml(confNote)}</p>
                    </div>
                    <div class="form-group">
                        <label>Traitement RGPD dont ce document relève ${Help.tip("Rattache ce document au registre de l'article 30 : la politique de conservation d'un traitement, sa procédure d'exercice des droits, son analyse d'impact. Les deux registres existaient sans se connaître.")}</label>
                        <select id="traitement_id">${trtOpts}</select>
                        ${trtVide ? `<p class="doc-note">Aucun traitement au registre RGPD. Recensez-les dans <a href="#/rgpd" class="lien-accent">Registre RGPD</a>.</p>` : ""}
                        ${trtNoteFiltre}
                    </div>
                </div>
                <div class="form-group">
                    <label class="inc-checkbox" style="border:none; background:none; padding:0;">
                        <input type="checkbox" id="donnees_personnelles" ${doc.donnees_personnelles ? "checked" : ""}>
                        Ce document contient des données personnelles ${Help.tip("À cocher si le document NOMME des personnes ou porte des informations qui les identifient — un compte rendu, une liste de contacts, un rapport d'incident. Pas s'il se contente d'en parler : une procédure qui décrit un traitement ne contient, elle, aucune donnée personnelle.")}
                    </label>
                </div>
                <div class="form-group">
                    <label class="inc-checkbox" style="border:none; background:none; padding:0;">
                        <input type="checkbox" id="attestation_requise" ${doc.attestation_requise ? "checked" : ""}>
                        Ce document exige une attestation de lecture ${Help.tip("Le personnel de la filiale devra déclarer avoir lu ce document, et cette déclaration sera datée et conservée. C'est la preuve que demande un auditeur au chapitre A.5.1 de l'ISO 27001. L'attestation ne vaut que pour la version en vigueur : réviser le document la périme, et la demande repart.")}
                    </label>
                    <p class="doc-note">Une attestation ne peut être posée que par la personne elle-même, depuis cette fiche : personne ne peut attester au nom d'un autre.</p>
                </div>
                <div class="form-group">
                    <label>Étiquettes ${Help.tip("Mots de classement libres, pour retrouver un document par autre chose que son type : « audit 2026 », « client Airbus », « confidentiel RH ». La casse est conservée à l'affichage, mais deux étiquettes qui ne diffèrent que par la casse sont la même.")}</label>
                    ${UI.chipsHtml("etiquettes", etiquettesDe(doc), {
                        liste: "etiquettes-list",
                        placeholder: "Ajouter une étiquette",
                        maxLongueur: 48
                    })}
                </div>
            </fieldset>
            <div class="form-group">
                <label>Plan / notes ${Help.tip("Sommaire ou notes. Utilisez un modèle pour partir d'un plan type.")}
                    <select id="canevas" style="margin-left:8px; font-size: var(--text-sm); padding:2px 6px;"><option value="">— Modèle de plan —</option>${Object.keys(CANEVAS).map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("")}</select>
                </label>
                <textarea id="notes" style="min-height:120px;">${escapeHtml(doc.notes || "")}</textarea>
            </div>`;
    }

    // Le champ à puces et la note du niveau se branchent APRÈS rendu, comme tout le
    // reste : aucun gestionnaire en ligne (la CSP du vhost livré les bloque).
    function wireClassification() {
        UI.wireChips("etiquettes", {
            // Miroir de f_normaliser_etiquette() (migration 027). ⚠️ La BASE reste
            // l'autorité : ceci est une courtoisie qui évite l'aller-retour, pas une
            // barrière — l'import, la reprise et psql écrivent sans passer par ici.
            normaliser: v => v.replace(/\s+/gu, " ").trim(),
            refuser: v => v.length > 48
                ? "Une étiquette tient en 48 signes : celle-ci en fait " + v.length + "."
                : (/[,;]/u.test(v)
                    ? "Une étiquette ne peut porter ni virgule ni point-virgule : elle voyage dans des listes jointes, et le séparateur la couperait en deux."
                    : "")
        });
        const sel = document.getElementById("confidentialite");
        const note = document.getElementById("confidentialiteNote");
        if (sel && note) {
            sel.addEventListener("change", () => {
                const c = CONFIDENTIALITES.find(x => x[0] === sel.value);
                note.textContent = c ? c[2] : "";
            });
        }
    }

    function wireCanevas() {
        const sel = document.getElementById("canevas");
        if (!sel) return;
        sel.onchange = () => {
            const tpl = CANEVAS[sel.value];
            if (!tpl) return;
            const ta = document.getElementById("notes");
            if (ta && (!ta.value.trim() || confirm("Remplacer le contenu actuel du plan par le modèle ?"))) ta.value = tpl;
            sel.value = "";
        };
    }

    function collectForm() {
        const titre = document.getElementById("titre").value.trim();
        if (!titre) { alert("Le titre du document est obligatoire."); return null; }
        return {
            titre,
            type: document.getElementById("type").value,
            version: document.getElementById("version").value.trim(),
            statut: document.getElementById("statut").value,
            proprietaire: document.getElementById("proprietaire").value.trim(),
            date_revue: document.getElementById("date_revue").value,
            emplacement: document.getElementById("emplacement").value.trim(),
            referentiels: Array.from(document.querySelectorAll(".doc-ref:checked")).map(cb => cb.value),
            confidentialite: document.getElementById("confidentialite").value,
            donnees_personnelles: document.getElementById("donnees_personnelles").checked,
            // Lot L19, action 19.1. ⚠️ Ce drapeau est la seule chose qui active
            // la demande d'attestation : le lot l'avait livré en base et dans
            // l'API sans qu'AUCUN écran ne puisse le poser — une capacité qu'on
            // ne peut pas allumer est une capacité absente.
            attestation_requise: document.getElementById("attestation_requise").checked,
            // Chaîne vide et non `null` : le serveur convertit le « non renseigné »
            // du navigateur en NULL parce que la colonne porte le domaine `id_metier`
            // (constat Q-194). Envoyer `null` d'ici court-circuiterait cette
            // conversion — et c'est elle qui est éprouvée.
            traitement_id: document.getElementById("traitement_id").value,
            etiquettes: UI.getChips("etiquettes"),
            notes: document.getElementById("notes").value.trim()
        };
    }

    return { renderList, renderCreate, renderDetail };
})();
