// Emplacement : js/app.js
// Nom du fichier : app.js

document.addEventListener("DOMContentLoaded", () => {
    // Coffre optionnel : si une protection par mot de passe est active, l'app ne
    // démarre qu'après déverrouillage. Sinon, démarrage immédiat (clé nulle).
    Vault.boot(async (dek) => {
        DataStore.setKey(dek);
        await DataStore.init();
        await startApp();
    });
});

async function startApp() {

    /* =========================
       IDENTITÉ VISUELLE DE LA FILIALE ACTIVE (lot L9)
       Titre d'onglet, marque de la barre latérale et logo : jamais une
       constante, toujours ce que `Session` tient de la filiale résolue par le
       serveur. Voir `js/core/identite.js` — `CONVENTIONS.md` §33.4.
    ========================== */
    if (window.Identite) Identite.brancherEnTete();

    /* =========================
       SÉLECTEUR DE DONNEUR D'ORDRE
       Le périmètre de SÉCURITÉ vient du serveur (`Session` / `/api/session`) et n'est
       ni choisi ni mémorisé par le navigateur (contrôle S2). Ce sélecteur-ci n'est pas
       un périmètre : c'est un filtre de confort « donneur d'ordre », qui vit désormais
       en mémoire — plus rien n'écrit `cyber-context` dans le localStorage.
    ========================== */
    renderContextSelector();
    // La liste des filiales arrive du serveur ; le bloc se redessine quand elle
    // est là. On ne l'attend pas : un sélecteur absent une seconde vaut mieux
    // qu'un démarrage suspendu à une route qui pourrait manquer.
    if (window.chargerCatalogueFiliales) { window.chargerCatalogueFiliales(); }

    /* =========================
       CONFIGURATION DES ROUTES
    ========================== */
    /* ⚠️ **`Router.init({ … })` s'écrit ICI, en toutes lettres, et ne se
       refactorise pas.** Un garde-fou du banc (`test/navigateur/constats-s2`,
       constat Q-46) DÉCOUVRE les routes de l'application en lisant ce bloc :
       il refuse d'inventer une liste quand il ne la trouve plus, et c'est ce
       refus qui empêche la couverture des écrans d'être affirmée sans preuve.
       Nommer la table dans une constante l'a fait rougir, immédiatement. La
       liste des routes se relit donc AILLEURS — `Router.routesEnregistrees()`,
       qui la tient du routeur lui-même. */
    Router.init({
        "/dashboard": () => DashboardModule.render(),
        "/synthese": () => SyntheseModule.render(),
        "/echeances": () => { if (typeof EcheancesModule !== "undefined") EcheancesModule.render(); },

        "/clients": () => { if (typeof ClientsModule !== "undefined") ClientsModule.renderList(); },
        "/clients/:id": (id) => { if (typeof ClientsModule !== "undefined") ClientsModule.renderDetail(id); },

        "/personnel": () => { if (typeof PersonnelModule !== "undefined") PersonnelModule.renderList(); },
        "/personnel/:id": (id) => { if (typeof PersonnelModule !== "undefined") PersonnelModule.renderDetail(id); },

        "/actifs": () => ActifsModule.renderList(),
        "/actifs/:id": (id) => ActifsModule.renderDetail(id),
        "/cartographie": () => { if (typeof CartographieModule !== "undefined") CartographieModule.render(); },

        "/risques": () => RisquesModule.renderList(),
        "/risques/:id": (id) => RisquesModule.renderDetail(id),
        "/matrice": () => MatriceModule.render(),

        "/exigences": () => ExigencesModule.renderList(),
        "/exigences/:id": (id) => ExigencesModule.renderDetail(id),

        "/referentiels": () => { if (typeof ReferentielsModule !== "undefined") ReferentielsModule.renderList(); },
        "/referentiels/:id": (id) => { if (typeof ReferentielsModule !== "undefined") ReferentielsModule.renderDetail(id); },

        "/mesures": () => { if (typeof MesuresModule !== "undefined") MesuresModule.renderList(); },
        "/mesures/:id": (id) => { if (typeof MesuresModule !== "undefined") MesuresModule.renderDetail(id); },

        "/couverture": () => { if (typeof ConformiteModule !== "undefined") ConformiteModule.renderCouverture(); },
        "/soa/:id": (id) => { if (typeof ConformiteModule !== "undefined") ConformiteModule.renderSoa(id); },

        "/mapping": () => { if (typeof MappingModule !== "undefined") MappingModule.render(); },

        "/incidents": () => { if (typeof IncidentsModule !== "undefined") IncidentsModule.renderList(); },
        "/incidents/:id": (id) => { if (typeof IncidentsModule !== "undefined") IncidentsModule.renderDetail(id); },

        "/documents": () => { if (typeof DocumentsModule !== "undefined") DocumentsModule.renderList(); },
        "/documents/:id": (id) => { if (typeof DocumentsModule !== "undefined") DocumentsModule.renderDetail(id); },

        "/rgpd": () => { if (typeof RgpdModule !== "undefined") RgpdModule.renderList(); },
        "/rgpd/:id": (id) => { if (typeof RgpdModule !== "undefined") RgpdModule.renderDetail(id); },

        "/actions": () => ActionsModule.renderList(),
        "/actions/:id": (id) => ActionsModule.renderDetail(id),

        // NOUVELLES ROUTES RÉSILIENCE SÉPARÉES
        "/bia": () => { if (typeof BiaModule !== "undefined") BiaModule.renderList(); },
        "/bia/:id": (id) => { if (typeof BiaModule !== "undefined") BiaModule.renderDetail(id); },

        "/crise": () => { if (typeof CriseModule !== "undefined") CriseModule.renderList(); },
        "/crise-fiches": () => { if (typeof CriseModule !== "undefined") CriseModule.renderFiches(); },
        "/crise/:id": (id) => { if (typeof CriseModule !== "undefined") CriseModule.renderDetail(id); },

        "/pra": () => { if (typeof PraScenariosModule !== "undefined") PraScenariosModule.renderList(); },
        "/pra/:id": (id) => { if (typeof PraScenariosModule !== "undefined") PraScenariosModule.renderDetail(id); },

        "/mco": () => { if (typeof PraMcoModule !== "undefined") PraMcoModule.renderList(); },
        "/mco/:id": (id) => { if (typeof PraMcoModule !== "undefined") PraMcoModule.renderDetail(id); },

        "/tests": () => { if (typeof PraTestsModule !== "undefined") PraTestsModule.renderList(); },
        "/tests/:id": (id) => { if (typeof PraTestsModule !== "undefined") PraTestsModule.renderDetail(id); },

        "/prestataires": () => { if (typeof PraPrestatairesModule !== "undefined") PraPrestatairesModule.renderList(); },
        "/prestataires/:id": (id) => { if (typeof PraPrestatairesModule !== "undefined") PraPrestatairesModule.renderDetail(id); },

	"/audits": () => { if (typeof AuditsModule !== "undefined") AuditsModule.renderList(); },
	"/audits/:id": (id) => { if (typeof AuditsModule !== "undefined") AuditsModule.renderAuditDetail(id); },

        // Journal d'audit (lot L5) : consultation, vérification du chaînage et
        // export. Domaine de droits « journal », distinct de « administration »
        // (`CONVENTIONS.md` §29.8) — régler l'application et lire trois ans
        // d'identités ne sont pas le même droit.
        "/journal": () => { if (typeof JournalModule !== "undefined") JournalModule.renderList(); },

        "/settings": () => { if (typeof SettingsModule !== "undefined") SettingsModule.render(); }
    });

    /* =========================
       DROITS : LE BLOC « COMPTE » ET LE CONTRÔLE DE COUVERTURE
       Le contrôle se joue AVANT la première navigation : un écran non rattaché
       à un domaine doit se voir au démarrage, pas quand quelqu'un s'y rend.
    ========================== */
    if (window.renderBlocUtilisateur) window.renderBlocUtilisateur();
    if (window.verifierCouvertureDesRoutes) {
        // La liste vient du ROUTEUR, jamais d'une seconde table : deux listes
        // des mêmes routes divergent, et la divergence est silencieuse.
        window.verifierCouvertureDesRoutes(Router.routesEnregistrees());
    }

    /* =========================
       LANCEMENT INITIAL
    ========================== */
    const initialRoute = location.hash ? location.hash.replace(/^#/, "") : "/dashboard";
    Router.navigateTo(initialRoute, false);

    /* =========================
       RAPPEL DE SAUVEGARDE
    ========================== */
    if (typeof BackupService !== "undefined") BackupService.renderReminder();

    /* =========================
       ALERTE SATURATION DU STOCKAGE (quota)
    ========================== */
    if (typeof DataStore.onQuotaExceeded === "function") {
        DataStore.onQuotaExceeded(() => showQuotaBanner());
    }

    /* =========================
       AIDE PÉDAGOGIQUE + MENU MOBILE
    ========================== */
    if (typeof Help !== "undefined") Help.init();
    setupMobileMenu();
}

/* =========================
   MENU MOBILE (off-canvas)
========================= */
function setupMobileMenu() {
    const toggle = document.getElementById("menu-toggle");
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!toggle || !sidebar || !backdrop) return;

    const open = () => { sidebar.classList.add("open"); backdrop.classList.add("show"); };
    const close = () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); };

    toggle.onclick = () => { sidebar.classList.contains("open") ? close() : open(); };
    backdrop.onclick = close;
    // Fermer après un clic sur un lien de navigation (mobile)
    sidebar.querySelectorAll("a[href^='#/']").forEach(a => a.addEventListener("click", close));
}

/* =========================
   BANDEAU D'ALERTE : STOCKAGE SATURÉ (quota)
   Conteneur dédié (indépendant du rappel de sauvegarde de #global-banner) pour ne
   pas s'écraser mutuellement. Alerte critique : risque de perte des données.
========================= */
function showQuotaBanner() {
    let host = document.getElementById("quota-banner-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "quota-banner-host";
        host.className = "no-print";
        const gb = document.getElementById("global-banner");
        if (gb && gb.parentNode) gb.parentNode.insertBefore(host, gb);
        else { const mc = document.querySelector(".main-content"); if (mc) mc.prepend(host); }
    }
    if (host.querySelector(".quota-banner")) return;   // déjà affiché
    host.innerHTML = `
        <div class="quota-banner" role="alert">
            <span class="quota-ico">!</span>
            <span class="quota-text"><b>Stockage saturé.</b> Vos dernières modifications ne peuvent pas être enregistrées durablement. Exportez une sauvegarde, puis libérez de l'espace (supprimez d'anciens points de restauration dans Paramètres&nbsp;→&nbsp;Sauvegardes).</span>
            <button id="quota-settings" class="reminder-btn">Ouvrir les paramètres</button>
            <button id="quota-dismiss" class="reminder-close" title="Masquer" aria-label="Masquer">&times;</button>
        </div>`;
    const s = document.getElementById("quota-settings");
    if (s) s.onclick = () => Router.navigateTo("/settings");
    const d = document.getElementById("quota-dismiss");
    if (d) d.onclick = () => { host.innerHTML = ""; };
}

/* =========================
   FIL D'ARIANE
========================= */
const ROUTE_META = {
    "/dashboard":    { s: "Pilotage",   t: "Tableau de bord" },
    "/synthese":     { s: "Pilotage",   t: "Synthèse Direction" },
    "/echeances":    { s: "Pilotage",   t: "Échéancier" },
    "/actions":      { s: "Pilotage",   t: "Plan d'actions" },
    "/incidents":    { s: "Risques",    t: "Incidents" },
    "/documents":    { s: "Conformité", t: "Gestion documentaire" },
    "/rgpd":         { s: "Conformité", t: "Registre RGPD" },
    "/risques":      { s: "Risques",    t: "Risques (EBIOS)" },
    "/matrice":      { s: "Risques",    t: "Matrice des risques" },
    "/actifs":       { s: "Risques",    t: "Actifs critiques" },
    "/exigences":    { s: "Conformité", t: "Exigences (ISO/NIS2)" },
    "/referentiels": { s: "Conformité", t: "Référentiels" },
    "/mesures":      { s: "Conformité", t: "Mesures de sécurité" },
    "/couverture":   { s: "Conformité", t: "Couverture croisée" },
    "/mapping":      { s: "Conformité", t: "Correspondances inter-référentiels" },
    "/soa":          { s: "Conformité", t: "Déclaration d'applicabilité" },
    "/clients":      { s: "Conformité", t: "Donneurs d'ordre" },
    "/personnel":    { s: "Conformité", t: "Personnel" },
    "/audits":       { s: "Conformité", t: "Contrôles & Audits" },
    "/bia":          { s: "Continuité", t: "BIA (Impact Métier)" },
    "/crise":        { s: "Continuité", t: "Cellule de Crise" },
    "/crise-fiches": { s: "Continuité", t: "Fiches réflexes de crise" },
    "/pra":          { s: "Continuité", t: "Scénarios PCA/PRA" },
    "/mco":          { s: "Continuité", t: "Actions Préalables (MCO)" },
    "/tests":        { s: "Continuité", t: "Historique des Tests" },
    "/prestataires": { s: "Continuité", t: "Prestataires & Tiers" },
    "/settings":     { s: "Administration", t: "Paramètres & données" }
};

window.renderBreadcrumb = function(route) {
    const el = document.getElementById("breadcrumb");
    if (!el) return;
    const segs = route.split("/").filter(Boolean);
    const base = "/" + (segs[0] || "dashboard");
    const meta = ROUTE_META[base];
    if (!meta) { el.innerHTML = ""; return; }
    const detail = segs.length > 1 ? " / <b>Fiche</b>" : "";
    el.innerHTML = `${meta.s} / <b>${meta.t}</b>${detail}`;
};

/* =========================
   FILTRE « DONNEUR D'ORDRE » — EN MÉMOIRE, JAMAIS DANS LE STOCKAGE
   Remplace l'ancienne clé `cyber-context` du localStorage. Elle ne portait pas un
   périmètre de sécurité (celui-ci vient du serveur, cf. `js/core/session.js`), mais
   elle en avait l'apparence, et elle survivait d'une session à l'autre.
   Valeur : "global" (interne + tous donneurs d'ordre) ou un identifiant de client.
========================= */
window.FiltreDonneurOrdre = (function () {
    let actif = "global";
    return {
        get() { return actif || "global"; },
        set(valeur) { actif = valeur || "global"; }
    };
})();

/* =========================
   BARRE LATÉRALE : PÉRIMÈTRE (SERVEUR) + FILTRE DONNEUR D'ORDRE (LOCAL)

   Deux choses distinctes, longtemps confondues sous une seule étiquette
   « Périmètre Actif » :

     · le PÉRIMÈTRE — la filiale dont on voit les données. Il vient du serveur
       (`Session`, résolu par `/api/session`), il n'a AUCUN mutateur côté navigateur
       et il est affiché en LECTURE SEULE. C'est le contrôle S2 de la grille : le
       navigateur ne choisit pas son périmètre, il l'apprend.
     · le FILTRE « donneur d'ordre » — un confort d'affichage interne à la filiale,
       qui restreint conformité et actions à un client donné. Il vit en mémoire
       (`FiltreDonneurOrdre`), plus dans le localStorage.
========================= */
window.renderContextSelector = function() {
    const sidebarHeader = document.querySelector(".sidebar-header");
    if (!sidebarHeader) return;

    const existing = document.getElementById("context-selector-container");
    if (existing) existing.remove();

    const esc = window.escapeHtml || (v => String(v == null ? "" : v));
    const clients = DataStore.getClients();
    const currentContext = FiltreDonneurOrdre.get();

    // Périmètre résolu par le serveur. Tant qu'il ne l'est pas, on ne l'invente pas.
    let filiale = "";
    try {
        if (typeof Session !== "undefined" && Session.libelleFiliale) filiale = Session.libelleFiliale();
    } catch (e) { filiale = ""; }

    const container = document.createElement("div");
    container.id = "context-selector-container";

    let optionsHtml = `<option value="global" style="color: #333; background: #fff;" ${currentContext === "global" ? "selected" : ""}>Tous les donneurs d'ordre (+ interne)</option>`;
    clients.forEach(c => {
        optionsHtml += `<option value="${esc(c.id)}" style="color: #333; background: #fff;" ${currentContext === c.id ? "selected" : ""}>${esc(c.nom)}</option>`;
    });

    container.innerHTML = `
        <div class="sidebar-divider">Périmètre</div>
        <div id="perimetre-filiale" title="Périmètre résolu par le serveur — il ne se choisit pas depuis le navigateur"
             style="width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; font-size: 0.85rem; font-weight: 600;">
            ${filiale ? esc(filiale) : `<span style="font-weight:400; opacity:0.75;">Périmètre non résolu</span>`}
        </div>
        ${selecteurFilialeHtml()}
        <div class="sidebar-divider">Filtre donneur d'ordre</div>
        <select id="context-selector" style="width: 100%; padding: 6px; background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; font-size: 0.85rem; cursor: pointer; outline: none;">
            ${optionsHtml}
        </select>
    `;

    sidebarHeader.appendChild(container);

    document.getElementById("context-selector").addEventListener("change", (e) => {
        FiltreDonneurOrdre.set(e.target.value);
        if (window.showToast) window.showToast("Filtre « donneur d'ordre » mis à jour.", "info");
        Router.navigateTo(location.hash.replace(/^#/, ""), false);
    });

    brancherSelecteurFiliale();
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  LE SÉLECTEUR DE FILIALE — lot L4, `CONVENTIONS.md` §30
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ **C'est le point le plus dangereux du lot** (§30.1), et le danger n'est
 *  pas qu'il ne marche pas : c'est qu'il marche **en mentant**. L'utilisateur
 *  croirait écrire chez A en écrivant chez B, et rien à l'écran ne le dirait.
 *
 *  ── La règle, et la seule façon de la tenir ────────────────────────────────
 *
 *      **Le client envoie un CHOIX. Le serveur résout un PÉRIMÈTRE.** (§30.2)
 *
 *  Conséquence directe sur ce fichier, et c'est la propriété que le banc mesure :
 *  **l'écran n'affiche JAMAIS la filiale demandée — seulement celle que le
 *  serveur annonce en réponse.** Le bandeau « Périmètre » est reconstruit
 *  *après* la réponse, depuis `Session.courante()`, c'est-à-dire depuis ce que
 *  le serveur a résolu. Un refus (403) laisse donc l'écran **exactement où il
 *  était**, sans qu'aucune correction n'ait à intervenir : il n'a pas bougé.
 *
 *  ⚠️ **Le décalage optimiste est l'erreur à ne pas commettre** — afficher la
 *  nouvelle filiale tout de suite, puis la corriger si le serveur refuse. Elle
 *  paraît anodine (« quelques millisecondes ») et ne l'est pas : sur un
 *  rechargement mal placé, sur une réponse lente, ou simplement sur une capture
 *  d'écran, l'utilisateur lit un périmètre qui n'est pas le sien. La ligne
 *  « `<select>` remis à la valeur du serveur » plus bas n'est pas une
 *  correction d'affichage : elle rétablit le GESTE, pas l'état — l'état, lui,
 *  n'a jamais bougé.
 *
 *  ── Ce que le sélecteur ne fait pas (§30.3) ────────────────────────────────
 *
 *  Il ne change **pas** le périmètre de lecture, qui vient des groupes AD, et
 *  il n'accorde **aucun** droit : un contributeur qui bascule reste
 *  contributeur. Le niveau et les domaines sont relus de la réponse, comme le
 *  reste — s'ils changeaient, ce serait le serveur qui l'aurait décidé.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Les filiales entre lesquelles cette session peut basculer, **telles que le
 * serveur les a nommées**. Mémoire vive uniquement : rien de ce qui ressemble à
 * un périmètre ne survit d'une session à l'autre dans le navigateur
 * (`js/core/session.js`).
 */
let catalogueFiliales = null;
/** Vrai pendant qu'un changement est en vol : un second geste ne relance rien. */
let changementEnVol = false;

/**
 * Demande au serveur la liste des filiales du périmètre de lecture.
 *
 * ⚠️ **Le repli est délibérément PAUVRE, et il est visible.** Si la route
 * n'existe pas encore, ou refuse, on retombe sur `perimetre_lecture` — qui ne
 * porte que des identifiants. L'écran affiche alors `FIL-1788477…`, ce qui est
 * laid et **vrai**. Fabriquer un libellé plausible à partir d'un identifiant
 * serait le contraire : joli et faux, dans le geste qui décide où l'on écrit.
 */
window.chargerCatalogueFiliales = async function () {
    let session = null;
    try { session = Session.courante(); } catch (e) { session = null; }
    if (!session) return null;

    /* ── ON NE POSE PAS UNE QUESTION DONT ON N'UTILISERA PAS LA RÉPONSE ──────
     *
     * Un périmètre d'une seule filiale n'affiche aucun sélecteur : demander de
     * quoi nommer une liste qu'on ne montrera pas est une requête pour rien.
     *
     * ⚠️ Ce n'est pas qu'une économie, et la mesure l'a montré. La route
     * `api/filiales` **n'existe pas encore** ; l'appeler à chaque démarrage
     * faisait journaliser au navigateur « Failed to load resource: 404 » — donc
     * une **erreur de console à chaque ouverture de l'application**, sur toutes
     * les sessions du produit, alors que `CLAUDE.md` §5 impose zéro erreur. Le
     * banc l'a dit tout de suite (`test/navigateur/droits.test.mjs`), et il
     * avait raison : un bruit quotidien et anodin est ce qui apprend à ignorer
     * les erreurs — constat m-5, appliqué à la console.
     *
     * La condition n'est donc pas un contournement : elle dit ce qui est vrai —
     * **il n'y a rien à choisir**. Le jour où un périmètre porte deux filiales,
     * la question se pose, et elle mérite d'être posée.
     */
    if ((session.perimetreLecture || []).length < 2) {
        catalogueFiliales = [];
        return catalogueFiliales;
    }

    try {
        const charge = await Api.filiales();
        const brutes = (charge && Array.isArray(charge.filiales)) ? charge.filiales
            : (Array.isArray(charge) ? charge : []);
        catalogueFiliales = brutes
            .filter(f => f && typeof f === "object" && f.id)
            .map(f => ({
                id: String(f.id),
                code: String(f.code || ""),
                nom: String(f.raison_sociale || f.raisonSociale || f.nom || "")
            }));
    } catch (e) {
        // Le fait, pas le geste : la liste manque, on le dit au journal technique
        // et on retombe sur ce que la session porte déjà.
        console.info("Liste des filiales indisponible ; repli sur le périmètre de lecture.",
            e && e.message);
        catalogueFiliales = (session.perimetreLecture || [])
            .map(id => ({ id: String(id), code: "", nom: "" }));
    }
    // La liste est arrivée après le premier rendu : on redessine le bloc.
    if (window.renderContextSelector) window.renderContextSelector();
    return catalogueFiliales;
};

/** Libellé d'une filiale du catalogue. Jamais inventé : ce qu'on a, ou l'identifiant. */
function libelleFilialeCatalogue(f) {
    if (f.nom && f.code) return f.nom + " (" + f.code + ")";
    return f.nom || f.code || f.id;
}

/**
 * Le `<select>`, ou rien du tout.
 *
 * Une seule filiale au périmètre ⇒ **aucun sélecteur**. Proposer un choix qui
 * n'en est pas apprend à cliquer sans lire, et c'est le geste qu'on veut garder
 * conscient.
 */
function selecteurFilialeHtml() {
    const esc = window.escapeHtml || (v => String(v == null ? "" : v));
    let session = null;
    try { session = Session.courante(); } catch (e) { session = null; }
    if (!session) return "";
    const liste = Array.isArray(catalogueFiliales) ? catalogueFiliales : [];
    if (liste.length < 2) return "";

    // ⚠️ La valeur sélectionnée est celle de la SESSION — ce que le serveur a
    // résolu —, jamais un dernier choix retenu quelque part.
    const options = liste.map(f =>
        '<option value="' + esc(f.id) + '" style="color:#333; background:#fff;"' +
        (f.id === session.filialeId ? " selected" : "") + ">" +
        esc(libelleFilialeCatalogue(f)) + "</option>").join("");

    return '<label for="filiale-selector" style="display:block; margin-top:8px; font-size:0.72rem; opacity:0.85; color:#fff;">' +
        "Filiale d'écriture" +
        (typeof Help !== "undefined" ? Help.tip(
            "La filiale dans laquelle vos saisies seront enregistrées. Le choix est " +
            "envoyé au serveur, qui vérifie qu'elle fait partie de votre périmètre : " +
            "l'affichage ne change qu'une fois sa réponse reçue. Basculer ne vous " +
            "donne aucun droit supplémentaire et ne change pas ce que vous pouvez lire.") : "") +
        "</label>" +
        '<select id="filiale-selector" style="width:100%; padding:6px; background:rgba(255,255,255,0.15); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; font-size:0.85rem; cursor:pointer; outline:none;">' +
        options + "</select>";
}

/**
 * Branche le sélecteur. **Aucun gestionnaire en ligne** : la politique de
 * sécurité de contenu du vhost livré les rend inertes, en silence (constat M-6).
 */
function brancherSelecteurFiliale() {
    const select = document.getElementById("filiale-selector");
    if (!select) return;
    select.addEventListener("change", () => {
        // L'identifiant est lu dans le DOM au moment du geste, jamais capturé
        // dans une fermeture (`CLAUDE.md` §3).
        window.changerFilialeActive(select.value);
    });
}

/**
 * Envoie le choix, et n'affiche que ce que le serveur a confirmé.
 *
 * @returns {Promise<boolean>} vrai si la filiale active a réellement changé.
 */
window.changerFilialeActive = async function (filialeChoisie) {
    if (changementEnVol) return false;
    let session = null;
    try { session = Session.courante(); } catch (e) { session = null; }
    if (!session) return false;
    if (!filialeChoisie || filialeChoisie === session.filialeId) return false;

    /* ── CE QUI ATTEND D'ÊTRE ÉCRIT APPARTIENT À LA FILIALE QU'ON QUITTE ─────
     *
     * `js/core/sync.js` regroupe les écritures : une saisie faite il y a 300 ms
     * n'est pas encore partie. Si l'on bascule maintenant, elle partira **après**
     * le changement — et le serveur l'écrira dans la NOUVELLE filiale, puisque
     * c'est la ligne de session qui décide où atterrissent les écritures
     * (`f_filiale_ecriture()`, §30.2). Une modification saisie chez A finirait
     * chez B, sans un mot, dans un outil qui sert de preuve en audit.
     *
     * On pousse donc d'abord. Ce qui reste bloqué après la poussée — un conflit
     * de version, un refus de droit — ne peut pas partir tout seul : on **refuse
     * la bascule** et on le dit. Refaire un geste est réparable ; écrire dans la
     * mauvaise filiale ne l'est pas.
     */
    if (typeof Sync !== "undefined" && Sync.etat) {
        try {
            let etat = Sync.etat();
            if (etat.enAttente || etat.enCours) {
                await Sync.cycle();
                etat = Sync.etat();
            }
            if (etat.enAttente || etat.enCours) {
                if (window.showToast) {
                    window.showToast(
                        "Des modifications ne sont pas encore enregistrées sur le serveur. " +
                        "Elles appartiennent à la filiale actuelle : la bascule est refusée " +
                        "tant qu'elles n'ont pas abouti.", "error");
                }
                if (window.renderContextSelector) window.renderContextSelector();
                return false;
            }
        } catch (e) {
            if (window.showToast) {
                window.showToast("Impossible de mettre les modifications à l'abri avant de " +
                    "changer de filiale. La bascule est refusée.", "error");
            }
            if (window.renderContextSelector) window.renderContextSelector();
            return false;
        }
    }

    changementEnVol = true;
    const select = document.getElementById("filiale-selector");
    if (select) select.disabled = true;
    try {
        /* ── ON RELIT LA SESSION, ON NE CROIT PAS LA RÉPONSE ─────────────────
         *
         * La route rend `{ change, filiale_active }` — ce qu'elle a fait, pas un
         * périmètre. On ne s'en sert donc PAS pour reconstruire la session : ce
         * fragment ne porte ni `perimetre_lecture`, ni `droits`, ni `identite`,
         * et les adopter tels quels effacerait les trois en silence — l'écran
         * perdrait ses menus et son niveau d'accès sans qu'aucune erreur ne soit
         * levée. Deux formes qui se ressemblent (toutes deux portent
         * `filiale_active`) et ne disent pas la même chose : c'est le motif que
         * ce chantier traque depuis onze occurrences.
         *
         * **`GET api/session` est la seule forme que la SPA sait lire**
         * (`Api.CONTRAT_AUTH`, §26.2), et c'est elle qu'on relit. Un aller-retour
         * de plus sur un geste rare est le prix d'une propriété qui ne dépend
         * d'aucun accord de forme entre deux agents : ce qui s'affiche est ce
         * que le serveur répond quand on lui demande « qui suis-je ».
         */
        await Api.choisirFilialeActive(filialeChoisie);
        await Session.charger();

        const apres = Session.courante();
        const change = !!apres && apres.filialeId !== session.filialeId;

        if (change) {
            // Le filtre « donneur d'ordre » désigne des clients de l'ANCIENNE
            // filiale : le laisser en place filtrerait la nouvelle sur un
            // identifiant qui n'y existe pas, et l'écran paraîtrait vide.
            if (window.FiltreDonneurOrdre) window.FiltreDonneurOrdre.set("global");
            // Le jeu de données appartient à la filiale : il se recharge, il ne
            // se filtre pas. Rien n'est préservé au passage — on a exigé plus
            // haut qu'il n'y ait plus rien en attente.
            if (typeof Sync !== "undefined" && Sync.recharger) await Sync.recharger();
        }

        if (window.renderContextSelector) window.renderContextSelector();
        if (window.renderBlocUtilisateur) window.renderBlocUtilisateur();
        // La marque affichée suit la filiale ACTIVE, jamais l'ancienne (lot L9) :
        // sans appel à `Session.charger()` déjà fait plus haut, on afficherait
        // encore le nom de la filiale qu'on vient de quitter.
        if (window.Identite) Identite.brancherEnTete();
        if (change) {
            /* ── UN IDENTIFIANT D'ENREGISTREMENT APPARTIENT À LA FILIALE QU'ON QUITTE ──
             *
             * Rester sur `#/documents/DOC-123` après la bascule afficherait
             * « Document introuvable » — vrai, et illisible : juste après un
             * changement réussi, cela se lit comme une panne. Les identifiants
             * sont uniques à l'échelle du produit (`CONVENTIONS.md` §2) : la
             * fiche ne peut donc PAS exister dans la filiale rejointe.
             *
             * On revient au tableau de bord dès que la route porte un
             * paramètre ; une route sans paramètre (une liste, un écran de
             * pilotage) est valable dans les deux filiales et se contente d'un
             * nouveau rendu.
             */
            const routeCourante = location.hash.replace(/^#/, "") || "/dashboard";
            const porteUnIdentifiant = routeCourante.split("/").filter(Boolean).length > 1;
            // ⚠️ Le second argument de `navigateTo` décide si l'ADRESSE suit. Un
            // simple redessin (`false`) laisse le hash en place — ce qui convient
            // quand on reste sur la même route, et **ment** quand on en change :
            // l'écran montrerait le tableau de bord sous l'adresse d'une fiche,
            // et un rechargement ramènerait la fiche disparue.
            Router.navigateTo(
                porteUnIdentifiant ? "/dashboard" : routeCourante,
                porteUnIdentifiant);
            if (window.showToast) {
                // Le libellé vient de la SESSION, pas du choix : c'est la même
                // règle, jusque dans le message.
                window.showToast("Filiale d'écriture : " + Session.libelleFiliale() + ".", "success");
            }
        }
        return change;
    } catch (e) {
        /* ── UN REFUS S'AFFICHE COMME UN REFUS, ET L'ÉCRAN N'A PAS BOUGÉ ─────
         *
         * §30.2 : « Pas de repli, pas de valeur par défaut : un choix refusé
         * laisse la filiale active inchangée. » Le bandeau n'a jamais montré la
         * filiale demandée — il n'y a donc rien à corriger. Ce que
         * `renderContextSelector()` rétablit ici est le `<select>`, c'est-à-dire
         * le GESTE, remis sur ce que le serveur dit être vrai.
         */
        if (window.showToast) window.showToast(messageRefusFiliale(e), "error");
        if (window.renderContextSelector) window.renderContextSelector();
        return false;
    } finally {
        changementEnVol = false;
        const encore = document.getElementById("filiale-selector");
        if (encore) encore.disabled = false;
    }
};

/**
 * Le FAIT, plus le geste que cette couche-ci connaît (constats Q-19, Q-29, Q-57).
 *
 * `js/core/api.js` énonce ce qui s'est passé sans prescrire de geste, parce
 * qu'il ignore ce que l'appelant tient en mémoire. Ici on le sait : la bascule
 * n'a rien saisi, il n'y a rien à perdre, et l'écran est resté au même endroit.
 */
function messageRefusFiliale(e) {
    if (!e) return "Le changement de filiale a échoué.";
    if (e.statut === 403) {
        return "Cette filiale ne fait pas partie de votre périmètre. Rien n'a changé : " +
            "vous écrivez toujours dans « " + Session.libelleFiliale() + " ». " +
            "Le périmètre vient de vos groupes Active Directory, et le serveur seul le décide.";
    }
    if (e.estNonAuthentifie && e.estNonAuthentifie()) {
        return "Votre session n'est plus ouverte sur le serveur. Reconnectez-vous : la filiale " +
            "d'écriture n'a pas changé.";
    }
    return (e.message || String(e)) + " Rien n'a changé : vous écrivez toujours dans « " +
        Session.libelleFiliale() + " ».";
}

/* =========================
   GESTION DU MENU ACTIF
========================= */
window.updateActiveNav = function(route) {
    const segments = route.split("/").filter(Boolean);
    let baseRoute = "/" + (segments[0] || "dashboard");
    // Les fiches réflexes sont une sous-vue de la Cellule de Crise : garder l'item actif.
    if (baseRoute === "/crise-fiches") baseRoute = "/crise";

    document.querySelectorAll(".main-nav a[data-route]").forEach(link => {
        const linkRoute = link.getAttribute("data-route");
        if (linkRoute === baseRoute) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });

    if (window.renderBreadcrumb) window.renderBreadcrumb(route);
    if (window.refreshEcheancesBadge) window.refreshEcheancesBadge();
    if (window.UI && UI.refreshPersonnesDatalist) UI.refreshPersonnesDatalist();
    // Lot L3 : le MENU seulement. La neutralisation des boutons a besoin du
    // balisage de la vue, qui n'est pas encore rendu à cet instant — elle est
    // appelée par `js/core/router.js` APRÈS le module (voir le commentaire là-bas).
    if (window.appliquerDroitsAuMenuSeul) window.appliquerDroitsAuMenuSeul();
};

/* =========================
   BADGE « ÉCHÉANCES EN RETARD » (barre latérale)
   Rafraîchi à chaque navigation (updateActiveNav) → toujours à jour depuis n'importe quelle page.
========================= */
window.refreshEcheancesBadge = function() {
    const el = document.getElementById("echeancesBadge");
    if (!el || typeof Echeances === "undefined") return;
    let n = 0;
    try { n = Echeances.overdueCount(); } catch (e) { n = 0; }
    if (n > 0) {
        el.textContent = n;
        el.hidden = false;
        el.setAttribute("title", n + " échéance(s) en retard");
    } else {
        el.hidden = true;
    }
};

/* =========================
   UTILITAIRE : TOASTS
========================= */
window.showToast = function(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};
/* ═══════════════════════════════════════════════════════════════════════════
 *  CE QUE LES DROITS RENDENT CONDITIONNEL DANS L'INTERFACE — lot L3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ **L'INTERFACE N'EST PAS LA BARRIÈRE** (`CONVENTIONS.md` §26.2). Tout ce
 *  qui suit masque ce qu'il est absurde de proposer ; le serveur refuse, et
 *  c'est lui qu'on vérifie en appelant la route directement (contrôle S6). Un
 *  contrôle qui n'existerait qu'à l'écran serait un contrôle absent.
 *
 *  Trois couches, et chacune est sûre POUR UNE RAISON DIFFÉRENTE — c'est
 *  volontaire : aucune ne rattrape les autres par hasard.
 *
 *  | Couche | Où | Ce qui la rend sûre |
 *  |---|---|---|
 *  | menu | ici, `appliquerDroitsAuMenu` | la liste des entrées est **lue dans le DOM**, pas recopiée ; une entrée ajoutée demain est prise en compte sans qu'on y pense |
 *  | écriture | `js/core/datastore.js` | **toutes** les mutations passent par la façade — invariant du projet |
 *  | export | `Droits.exigerExport()` | entonnoir unique de tout ce qui sort du produit |
 *
 *  La quatrième — neutraliser les boutons à l'écran — n'est PAS sûre par
 *  construction, et elle est écrite pour que son incomplétude soit **bruyante**
 *  plutôt que silencieuse. Voir `neutraliserEcritures`.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Domaine fonctionnel de chaque écran.
 *
 * ── Une liste écrite à la main, et pourquoi c'est le bon outil ici ──────────
 *
 * Le `CLAUDE.md` §3 tranche par le **résultat d'une omission**, pas par le
 * sujet : une liste dont l'incomplétude fait *réussir quelque chose en silence*
 * est le mauvais outil ; une liste dont l'incomplétude *échoue bruyamment et
 * oblige quelqu'un à décider* est le bon.
 *
 * Ici, rien ne peut découvrir qu'un écran « Correspondances » relève de la
 * conformité : c'est une décision métier, la même que celle qu'a prise
 * `DOMAINE_PAR_ENTITE` dans `backend/src/api/droits.ts` — écrite à la main pour
 * la même raison, et qui fait foi pour les entités.
 *
 * Et l'omission ne peut pas passer inaperçue : `verifierCouvertureDesRoutes()`
 * compare cette table à la **liste réelle des routes** et au **menu réellement
 * rendu**, à chaque démarrage, et affiche un bandeau nommant les manques. Une
 * route sans domaine n'est **pas masquée** — elle est **signalée**. Masquer
 * silencieusement ferait disparaître un écran que personne n'a décidé de
 * retirer ; le signaler oblige quelqu'un à trancher.
 *
 * Les valeurs sont celles de `backend/src/api/droits.ts` (recopiées dans
 * `Api.CONTRAT_AUTH.domaines`) : un domaine qui n'y figure pas est signalé.
 */
const DOMAINE_PAR_ROUTE = Object.freeze({
    "/dashboard":    "pilotage",
    "/synthese":     "pilotage",
    "/echeances":    "pilotage",
    "/clients":      "tiers",
    "/prestataires": "tiers",
    "/personnel":    "personnel",
    "/actifs":       "actifs",
    "/cartographie": "actifs",
    // Le BIA porte les `processus`, que `DOMAINE_PAR_ENTITE` range dans
    // « actifs » : on suit la décision du serveur plutôt que d'en prendre une
    // seconde, sans quoi l'écran et la route ne seraient pas d'accord.
    "/bia":          "actifs",
    "/risques":      "risques",
    "/matrice":      "risques",
    "/exigences":    "conformite",
    "/referentiels": "conformite",
    "/mesures":      "conformite",
    "/couverture":   "conformite",
    "/soa":          "conformite",
    "/mapping":      "conformite",
    "/incidents":    "incidents",
    "/documents":    "documents",
    "/rgpd":         "rgpd",
    "/actions":      "actions",
    "/mco":          "actions",
    "/crise":        "continuite",
    "/crise-fiches": "continuite",
    "/pra":          "continuite",
    "/tests":        "continuite",
    "/audits":       "audits",
    "/settings":     "administration",
    // Le journal d'audit a son propre domaine : voir `backend/src/api/droits.ts`.
    "/journal":      "journal"
});

/** Domaine de la route affichée, ou "" si elle n'est pas rattachée. */
window.domaineDeRoute = function (route) {
    const segments = String(route || "").split("/").filter(Boolean);
    const base = "/" + (segments[0] || "dashboard");
    return DOMAINE_PAR_ROUTE[base] || "";
};

/**
 * Confronte la table des domaines au RÉEL, dans les deux sens, et le dit.
 *
 * Trois comparaisons, parce qu'une seule laisserait passer trois choses :
 *  1. une **route enregistrée** dans le routeur sans domaine déclaré ;
 *  2. une **entrée de menu** (`data-route` du balisage) sans domaine déclaré —
 *     ce n'est pas la même liste : `index.html` appartient à un autre agent, et
 *     il peut gagner une entrée sans que `js/app.js` bouge ;
 *  3. un **écart avec le serveur** : un domaine cité ici qu'il ne connaît pas,
 *     ou l'inverse (`Droits.verifier`).
 *
 * Le résultat est **affiché**, jamais avalé : un garde-fou muet est un
 * commentaire (`CONVENTIONS.md` §18.4).
 */
window.verifierCouvertureDesRoutes = function (routesEnregistrees) {
    const manques = [];

    const basesDeclarees = Object.keys(DOMAINE_PAR_ROUTE);
    const baseDe = (r) => "/" + String(r).split("/").filter(Boolean)[0];

    (routesEnregistrees || []).forEach(r => {
        const b = baseDe(r);
        if (basesDeclarees.indexOf(b) === -1 && manques.indexOf("route " + b) === -1) {
            manques.push("route " + b);
        }
    });

    document.querySelectorAll(".main-nav a[data-route]").forEach(a => {
        const b = baseDe(a.getAttribute("data-route"));
        if (basesDeclarees.indexOf(b) === -1 && manques.indexOf("menu " + b) === -1) {
            manques.push("menu " + b);
        }
    });

    try {
        const cites = basesDeclarees.map(b => DOMAINE_PAR_ROUTE[b])
            .filter((d, i, t) => d && t.indexOf(d) === i);
        const ecart = Droits.verifier(cites);
        ecart.inconnusDuServeur.forEach(d => manques.push("domaine inconnu du serveur : " + d));
        // Un domaine que le serveur connaît et qu'aucun écran ne sert n'est pas
        // un défaut de l'interface — c'est une information pour qui lit le
        // journal. On ne l'affiche donc pas, on le trace.
        if (ecart.inconnusDeLaSpa.length > 0) {
            console.info("Domaines déclarés par le serveur sans écran correspondant :",
                ecart.inconnusDeLaSpa.join(", "));
        }
    } catch (e) { /* `Droits` absent : rien à confronter */ }

    if (manques.length > 0) signalerCouvertureIncomplete(manques);
    return manques;
};

function signalerCouvertureIncomplete(manques) {
    const esc = window.escapeHtml || (v => String(v == null ? "" : v));
    let host = document.getElementById("droits-banner-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "droits-banner-host";
        host.className = "no-print";
        const gb = document.getElementById("global-banner");
        if (gb && gb.parentNode) gb.parentNode.insertBefore(host, gb);
        else { const mc = document.querySelector(".main-content"); if (mc) mc.prepend(host); }
    }
    host.innerHTML =
        '<div class="quota-banner" role="alert">' +
        '<span class="quota-ico">!</span>' +
        '<span class="quota-text"><b>Écrans non rattachés à un domaine de droits</b> : ' +
        esc(manques.join(" ; ")) +
        '. Ces écrans restent accessibles — l\'interface ne masque pas ce que personne n\'a ' +
        'décidé de masquer — mais le serveur, lui, décide seul. Signalez-le à votre exploitant.</span>' +
        '</div>';
}

/**
 * Masque les entrées de menu dont le domaine n'est pas lisible.
 *
 * La liste des entrées est **lue dans le DOM** (`.main-nav a[data-route]`), et
 * non recopiée : une entrée ajoutée à `index.html` — qui appartient à un autre
 * périmètre — est prise en compte sans que ce fichier bouge.
 *
 * Un séparateur de section dont toutes les entrées sont masquées disparaît
 * avec elles : laisser un titre « Continuité (ISO 22301) » au-dessus du vide
 * donnerait à croire à un écran cassé.
 */
function appliquerDroitsAuMenu() {
    if (typeof Droits === "undefined" || !Droits.connus()) return;
    const nav = document.querySelector(".main-nav");
    if (!nav) return;

    nav.querySelectorAll("a[data-route]").forEach(lien => {
        const domaine = window.domaineDeRoute(lien.getAttribute("data-route"));
        const element = lien.closest("li") || lien;
        // `hidden`, pas `display:none` en ligne : l'attribut se retire, et il
        // retire aussi l'entrée de l'ordre de tabulation.
        element.hidden = !Droits.peutLire(domaine);
    });

    // Les séparateurs : un titre sans entrée visible n'a plus d'objet.
    let separateurCourant = null;
    let vuDepuisSeparateur = false;
    const fermer = () => { if (separateurCourant) separateurCourant.hidden = !vuDepuisSeparateur; };
    Array.prototype.forEach.call(nav.querySelectorAll("li"), li => {
        if (li.classList.contains("sidebar-divider")) {
            fermer();
            separateurCourant = li;
            vuDepuisSeparateur = false;
            return;
        }
        if (!li.hidden) vuDepuisSeparateur = true;
    });
    fermer();
}

/**
 * Neutralise dans la vue courante ce que le profil n'a pas le droit de faire.
 *
 * ── LA LISTE EST INVERSÉE, ET C'EST TOUT LE RAISONNEMENT ───────────────────
 *
 * On ne liste **pas** les boutons d'écriture : cette liste-là vieillirait en
 * silence — un bouton neuf oublié resterait proposé, et l'utilisateur
 * découvrirait le refus après avoir saisi. On liste les boutons de
 * **consultation**, et tout le reste est neutralisé.
 *
 * L'omission change alors de camp : un bouton de consultation oublié se
 * retrouve grisé. C'est visible, immédiat, sans danger — exactement le
 * « échoue bruyamment, et quelqu'un doit décider » du `CLAUDE.md` §3.
 *
 * ⚠️ Cette couche n'est pas une barrière, et n'a pas besoin de l'être : ce
 * qu'elle laisserait passer est refusé par la façade `DataStore` (filet), puis
 * par le serveur (barrière).
 */
const MOTIFS_CONSULTATION = /(^|[-_])(back|retour|cancel|annul|close|fermer|print|imprim|voir|show|open|detail|tab|onglet|filtre|filter|search|recherche|toggle|prev|next|mois|zoom|aide|help)/i;

/**
 * Coupe le « chameau » d'un identifiant : `doPrintBtn` → `do-Print-Btn`.
 *
 * Sans cela, le motif ancré sur `^`, `-` ou `_` manque tout ce qui est écrit en
 * casse chameau — et le produit en est plein. Mesuré : `doPrintBtn` et
 * `closePrintBtn` étaient neutralisés pour un profil en lecture seule, qui
 * perdait donc l'impression. Une impression n'est pas une écriture.
 */
function couperChameau(texte) {
    return String(texte || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2");
}

function estBoutonDeConsultation(bouton) {
    const identifiant = couperChameau(bouton.id);
    const classe = (typeof bouton.className === "string") ? couperChameau(bouton.className) : "";
    if (MOTIFS_CONSULTATION.test(identifiant)) return true;
    if (MOTIFS_CONSULTATION.test(classe)) return true;
    // Un bouton qui porte une marque explicite est cru sur parole.
    if (bouton.dataset && bouton.dataset.lecture === "ok") return true;
    return false;
}

/**
 * Ce qui SORT du produit. `import` n'y figure PAS, et c'est un arbitrage :
 * importer est une **écriture**, pas une extraction. Le confondre priverait un
 * contributeur sans droit d'export de la reprise de ses classeurs — un refus
 * qui n'aurait aucun fondement dans le `PLAN_SERVEUR` §3.3.
 */
const MOTIFS_EXPORT = /(export|template|canevas|ics|xlsx|excel|pdf|csv|png|svg|telecharg)/i;

function neutraliserEcritures(route) {
    if (typeof Droits === "undefined" || !Droits.connus()) return;
    const app = document.getElementById("app");
    if (!app) return;

    const domaine = window.domaineDeRoute(route);
    const ecriture = Droits.peutEcrire(domaine);
    const extraction = Droits.peutExporter();
    if (ecriture && extraction) return;      // rien à neutraliser

    app.querySelectorAll("button, input[type='submit'], input[type='button']").forEach(bouton => {
        const identifiant = couperChameau(bouton.id) + " " +
            (typeof bouton.className === "string" ? couperChameau(bouton.className) : "");
        const estExport = MOTIFS_EXPORT.test(identifiant);

        if (estExport && !extraction) {
            bouton.disabled = true;
            bouton.title = "Le droit d'export n'est pas accordé à votre profil.";
            return;
        }
        if (estExport) return;               // export autorisé : on n'y touche pas
        if (ecriture) return;                // écriture autorisée : rien à faire
        if (estBoutonDeConsultation(bouton)) return;

        bouton.disabled = true;
        bouton.title = "Votre profil est en lecture seule sur cet écran.";
    });
}

/* ── UN ÉCRAN QUI SE REDESSINE SANS NAVIGUER ────────────────────────────────
 *
 * `neutraliserEcritures` est appelée après chaque navigation. Or plusieurs
 * modules **se redessinent sans naviguer** : un filtre changé, une case cochée,
 * une suppression groupée qui rafraîchit sa liste. Le balisage neuf sort alors
 * intact, et les boutons d'écriture réapparaissent — actifs — sous les yeux
 * d'un profil en lecture seule.
 *
 * On observe donc le conteneur de la vue. Deux précautions, et elles suffisent :
 *
 *  · **seulement `childList`** : la passe ne modifie que des ATTRIBUTS
 *    (`disabled`, `title`), qui ne sont pas observés. Il n'y a donc pas de
 *    boucle possible — ce n'est pas une discipline, c'est la forme de
 *    l'observation ;
 *  · **un verrou de réentrance** malgré tout, parce qu'un module pourrait
 *    ajouter un nœud DANS la passe, et qu'une protection qui ne coûte rien vaut
 *    mieux qu'un raisonnement juste.
 *
 * L'observateur n'existe que lorsqu'il y a quelque chose à neutraliser : sans
 * droits annoncés, aucune surveillance n'est installée, et le produit se
 * comporte exactement comme avant.
 */
let observateurDeVue = null;
let passageEnCours = false;

function surveillerLaVue(route) {
    if (observateurDeVue) { observateurDeVue.disconnect(); observateurDeVue = null; }
    if (typeof MutationObserver === "undefined") return;
    if (typeof Droits === "undefined" || !Droits.connus()) return;
    const domaine = window.domaineDeRoute(route);
    if (Droits.peutEcrire(domaine) && Droits.peutExporter()) return;   // rien à surveiller
    const app = document.getElementById("app");
    if (!app) return;
    observateurDeVue = new MutationObserver(() => {
        if (passageEnCours) return;
        passageEnCours = true;
        try { neutraliserEcritures(route); } finally { passageEnCours = false; }
    });
    observateurDeVue.observe(app, { childList: true, subtree: true });
}

/**
 * Bloc « qui suis-je », et la déconnexion.
 *
 * Il n'apparaît que lorsque l'authentification est RÉELLE : tant que la session
 * est provisoire (lot L2), proposer « Se déconnecter » offrirait un geste sans
 * effet, et afficher un nom d'utilisateur fictif ferait croire à une identité.
 */
window.renderBlocUtilisateur = function () {
    const entete = document.querySelector(".sidebar-header");
    if (!entete) return;
    const existant = document.getElementById("bloc-utilisateur");
    if (existant) existant.remove();

    let session = null;
    try { session = Session.courante(); } catch (e) { session = null; }
    if (!session || session.provisoire) return;

    const esc = window.escapeHtml || (v => String(v == null ? "" : v));
    const bloc = document.createElement("div");
    bloc.id = "bloc-utilisateur";
    const profil = (typeof Droits !== "undefined" && Droits.connus())
        ? Droits.niveau() : "";
    bloc.innerHTML =
        '<div class="sidebar-divider">Compte</div>' +
        '<div style="font-size:0.85rem; font-weight:600; color:#fff;">' +
        esc(Session.libelleUtilisateur()) + '</div>' +
        (profil ? '<div style="font-size:0.78rem; opacity:0.75; color:#fff;">Accès : ' +
            esc(profil) +
            (typeof Help !== "undefined" ? Help.tip(
                "Votre niveau d'accès. « Lecture » consulte sans modifier ; « contribution » " +
                "saisit et met à jour ; « validation » approuve ; « administration » gère " +
                "filiales, droits et paramètres. Le droit d'export est accordé à part : " +
                "extraire un jeu de données complet est une opération journalisée.") : "") +
            (Droits.peutExporter() ? ' · export autorisé' : '') + '</div>' : '') +
        '<button type="button" id="deconnexion-btn" class="reminder-btn" ' +
        'style="margin-top:8px; width:100%; justify-content:center;">Se déconnecter</button>';
    entete.appendChild(bloc);

    const bouton = document.getElementById("deconnexion-btn");
    if (bouton) bouton.addEventListener("click", () => { Vault.deconnecter(); });
};

/**
 * Applique tout ce qui dépend des droits à la vue qui vient d'être rendue.
 *
 * Appelée par `updateActiveNav`, c'est-à-dire **après chaque navigation** —
 * donc après chaque `app.innerHTML = template`. C'est le seul moment où le
 * balisage de la vue existe : un passage plus tôt neutraliserait un écran qui
 * n'est pas encore là.
 */
window.appliquerDroitsAuMenuSeul = function () {
    try {
        appliquerDroitsAuMenu();
    } catch (e) {
        console.error("Application des droits au menu", e);
    }
};

window.appliquerDroits = function (route) {
    try {
        appliquerDroitsAuMenu();
        neutraliserEcritures(route);
        surveillerLaVue(route);
        // Le bloc « Compte » suit la session : après une reconnexion, l'identité
        // et le niveau peuvent avoir changé, et un libellé périmé dans la barre
        // latérale est le genre de détail qu'on croit sur parole.
        if (window.renderBlocUtilisateur) window.renderBlocUtilisateur();
    } catch (e) {
        // Un filet d'affichage ne casse pas la navigation. Il se plaint.
        console.error("Application des droits à l'écran", e);
    }
};
