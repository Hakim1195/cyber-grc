/**
 * js/modules/campagnes.js — LES CAMPAGNES DESCENDANTES (lot L24, actions 24.1 et 24.2)
 *
 * ── Ce que cet écran montre, et à qui ────────────────────────────────────────
 *
 * Le même écran sert deux lectures, et c'est voulu : le Groupe y voit ce qu'il a
 * demandé et où en est chaque filiale ; une filiale y voit ce qu'on lui demande et
 * où elle en est. **Ce n'est pas un `if` du navigateur qui fait la différence** :
 * c'est la politique de cloisonnement du serveur, qui ne sert à une filiale que sa
 * propre part. Un filtre côté client serait une barrière que le client peut retirer.
 *
 * ── ⚠️ L'AVANCEMENT SE DIVISE ICI, ET NULLE PART AILLEURS ────────────────────
 *
 * Le serveur rend un COMPTE — « 17 exigences renseignées » — jamais un taux : il ne
 * connaît pas le nombre de questions d'un référentiel, qui vit dans les catalogues
 * de ce répertoire (`js/data/ref_*.js`). C'est donc cet écran qui divise, parce que
 * c'est lui qui a le catalogue. Recopier ce total côté serveur en ferait une seconde
 * source, qui se tromperait le jour où BoostAerospace révise son questionnaire.
 */
window.CampagnesModule = (function () {
    "use strict";

    /** Ce que le serveur a rendu au dernier chargement, pour ne pas le redemander au rendu. */
    let dernierEtat = null;

    const LIBELLES_ETAT = {
        brouillon: "Brouillon",
        en_cours: "En cours",
        en_retard: "En retard",
        close: "Close"
    };
    const LIBELLES_PART = {
        en_cours: "En cours",
        en_retard: "En retard",
        terminee: "Terminée",
        non_faite: "Non faite"
    };
    /** Couleur sémantique : vert = fait, orange = à faire, rouge = en retard, gris = neutre. */
    const TON = {
        brouillon: "", en_cours: "warning", en_retard: "danger", close: "ok",
        terminee: "ok", non_faite: "danger"
    };

    /**
     * L'administration Groupe, telle que la SESSION RÉSOLUE la dit.
     *
     * ⚠️ **La première rédaction lisait `Session.perimetre`, qui n'existe pas** — et le
     * défaut ne s'est vu qu'AU NAVIGATEUR SUR LA RECETTE : le bloc « Ouvrir une
     * campagne » était invisible pour `admin.grc`, c'est-à-dire pour le seul compte qui
     * en a le droit. L'écran s'affichait parfaitement, sans une erreur de console, et la
     * capacité était injoignable. *C'est la classe de la leçon du `docs/REPRISE.md` §4, et
     * c'est la cinquième fois en cinq jours que la vérification au navigateur trouve ce
     * que le banc ne voit pas.*
     *
     * La forme juste est celle de `socle.js` et de `mapping.js` : `Session.courante()`.
     *
     * ⚠️ Et ce qui suit **ne protège rien** : la barrière est le serveur — la politique
     * RLS de la `044` exige le drapeau d'administration Groupe, et la route de convocation
     * exige le droit `administrer`. Ne pas proposer un geste qui sera refusé est une
     * courtoisie ; le refus est traité proprement de toute façon, parce que les groupes
     * d'annuaire d'un utilisateur peuvent bouger entre l'affichage et le clic.
     */
    function estAdministrationGroupe() {
        try {
            if (typeof Session === "undefined" || !Session.courante) return false;
            const etat = Session.courante();
            return !!(etat && etat.administrationGroupe);
        } catch (e) { return false; }
    }

    /** Nombre d'exigences du référentiel demandé, ou null si le catalogue l'ignore. */
    function totalExigences(refId) {
        if (typeof Referentiels === "undefined") return null;
        const ref = Referentiels.get(refId);
        if (!ref) return null;
        const total = Referentiels.countExigences(ref);
        return total > 0 ? total : null;
    }

    /**
     * L'avancement d'une part, en texte.
     *
     * ⚠️ **Rend « n renseignées » et non « 0 % » quand le catalogue ne connaît pas le
     * référentiel.** Un pourcentage calculé sur un total inconnu vaudrait zéro, et
     * afficherait « 0 % » à une filiale qui a tout fait — c'est-à-dire la classe
     * Q-201 / Q-207 : le produit affirmerait une chose qui n'est pas.
     */
    function avancementTexte(part, refId) {
        const total = totalExigences(refId);
        const faites = Number(part.repondues || 0);
        if (total === null) {
            return faites + " exigence(s) renseignée(s)";
        }
        const pourcent = Math.round((faites / total) * 100);
        return faites + " / " + total + " (" + pourcent + " %)";
    }

    function badge(etat, libelles) {
        const ton = TON[etat] || "";
        return `<span class="status ${ton}">${escapeHtml(libelles[etat] || etat)}</span>`;
    }

    /* =====================================================================
       LA LISTE
    ===================================================================== */

    function renderList() {
        const app = document.getElementById("app");
        const admin = estAdministrationGroupe();

        // ⚠️ `UI.enteteHtml` et NON un `<h1>` à la main : c'est lui qui pose la barre
        //    d'onglets, et `test/navigateur/onglets.test.mjs` exige que CHAQUE route d'un
        //    sujet à plusieurs vues la rende. La première rédaction de cet écran écrivait
        //    son titre elle-même — l'écran s'affichait parfaitement, et l'on ne pouvait
        //    plus revenir aux trois autres vues des référentiels que par le menu.
        //    *Un écran qui perd sa barre d'onglets ne signale rien : il se contente d'être
        //    une impasse.*
        app.innerHTML = `
            ${UI.enteteHtml({
                titre: "Campagnes du Groupe",
                aide: Help.tip("Une campagne, c'est le Groupe qui demande un référentiel à plusieurs filiales, pour une date — et qui suit ensuite l'avancement de chacune. Le produit n'envoie rien : la date d'ouverture consigne ce que vous avez fait. L'échéance, elle, arrive dans l'Échéancier de chaque filiale convoquée, et dans ses relances."),
                contexte: "Ce que le Groupe demande à ses filiales, et où chacune en est.",
                onglets: UI.ongletsDe("/campagnes")
            })}
            ${admin ? `
            <div class="card no-print" id="blocCreation">
                <h3>Ouvrir une campagne ${Help.tip("Réservé à l'administration Groupe : une campagne engage plusieurs filiales. Elle naît en BROUILLON — rien n'est demandé à personne tant que vous ne l'avez pas ouverte.")}</h3>
                <div class="form-grid">
                    <label>Référentiel demandé
                        <select id="campRef"></select>
                    </label>
                    <label>Intitulé
                        <input type="text" id="campIntitule" maxlength="300"
                               placeholder="Hygiène ANSSI — campagne annuelle" />
                    </label>
                    <label>Retour attendu le
                        <input type="date" id="campEcheance" />
                    </label>
                </div>
                <button type="button" id="campCreer">Créer la campagne</button>
            </div>` : ""}
            <div id="campagnesListe"><p class="muted">Chargement…</p></div>`;

        if (admin) {
            const select = document.getElementById("campRef");
            const refs = typeof Referentiels === "undefined" ? [] : Referentiels.all();
            select.innerHTML = refs.map(r =>
                `<option value="${escapeHtml(r.id)}">${escapeHtml(r.nom)}</option>`).join("");
            document.getElementById("campCreer").addEventListener("click", creer);
        }

        rafraichir();
    }

    /** Recharge l'état depuis le serveur et redessine la liste. */
    function rafraichir() {
        const cible = document.getElementById("campagnesListe");
        if (!cible) return;
        if (!window.Api || typeof Api.campagnesEtat !== "function") {
            cible.innerHTML = `<p class="synthese-message danger">L'état des campagnes n'a pas pu être chargé.</p>`;
            return;
        }
        Api.campagnesEtat().then(r => peupler(r)).catch(() => {
            // ⚠️ On n'affiche RIEN plutôt qu'un état périmé : les deux états et
            // l'avancement sont calculés par le serveur, et une liste dessinée depuis
            // la mémoire du navigateur dirait « en cours » sur une campagne close.
            cible.innerHTML = `<p class="synthese-message danger">L'état des campagnes n'a pas pu être chargé. Il est calculé par le serveur ; rien n'est affiché plutôt qu'un état périmé.</p>`;
        });
    }

    function peupler(reponse) {
        dernierEtat = reponse;
        const cible = document.getElementById("campagnesListe");
        if (!cible) return;
        const admin = estAdministrationGroupe();
        const liste = (reponse && reponse.campagnes) || [];

        if (liste.length === 0) {
            cible.innerHTML = `<div class="card"><p class="muted">${escapeHtml(reponse && reponse.motif || "Aucune campagne.")}</p></div>`;
            return;
        }

        cible.innerHTML = liste.map(c => {
            const parts = c.parts || [];
            const lignes = parts.map(p => `
                <tr data-part="${escapeHtml(p.id)}">
                    <td>${escapeHtml(p.filialeCode)} — ${escapeHtml(p.filiale)}</td>
                    <td>${badge(p.etat, LIBELLES_PART)}</td>
                    <td>${escapeHtml(avancementTexte(p, c.refId))}</td>
                    <td>${escapeHtml(p.repondant || "—")}</td>
                    <td>${escapeHtml(p.accuseLe || "—")}</td>
                    <td class="no-print">
                        ${p.termineLe
                            ? `<span class="muted">Déclarée terminée le ${escapeHtml(p.termineLe)}</span>`
                            : `<button type="button" class="part-vue" data-id="${escapeHtml(p.id)}">J'en prends connaissance</button>
                               <button type="button" class="part-fin" data-id="${escapeHtml(p.id)}" style="margin-left:6px;">Déclarer terminée</button>`}
                        ${admin ? `<button type="button" class="part-retirer" data-campagne="${escapeHtml(c.id)}" data-filiale="${escapeHtml(p.filialeId)}" data-libelle="${escapeHtml(p.filiale)}" style="margin-left:6px;">Déconvoquer</button>` : ""}
                    </td>
                </tr>`).join("");

            return `
            <div class="card">
                <div class="card-head">
                    <h3>${escapeHtml(c.intitule)} ${badge(c.etat, LIBELLES_ETAT)}</h3>
                    <p class="muted">
                        Référentiel « ${escapeHtml(c.refId)} »
                        · ${c.ouverteLe ? "ouverte le " + escapeHtml(c.ouverteLe) : "pas encore ouverte"}
                        · ${c.echeance ? "retour attendu le " + escapeHtml(c.echeance) : "sans échéance"}
                        ${c.closeLe ? " · close le " + escapeHtml(c.closeLe) : ""}
                    </p>
                </div>
                ${admin ? `
                <div class="no-print" style="margin-bottom:10px;">
                    ${c.ouverteLe ? "" : `<button type="button" class="camp-ouvrir" data-id="${escapeHtml(c.id)}">Ouvrir la campagne</button>`}
                    ${c.ouverteLe && !c.closeLe ? `<button type="button" class="camp-clore" data-id="${escapeHtml(c.id)}">Clore la campagne</button>` : ""}
                    <button type="button" class="camp-convoquer" data-id="${escapeHtml(c.id)}" style="margin-left:6px;">Convoquer des filiales</button>
                </div>` : ""}
                ${parts.length === 0
                    ? `<p class="muted">${admin
                        ? "Aucune filiale convoquée. Une campagne sans destinataire ne demande rien à personne."
                        : "Votre filiale n'est pas convoquée à cette campagne."}</p>`
                    : `<table class="data-table">
                        <thead><tr><th>Filiale</th><th>État</th><th>Avancement</th><th>Répondant</th><th>Vue le</th><th class="no-print"></th></tr></thead>
                        <tbody>${lignes}</tbody>
                       </table>`}
            </div>`;
        }).join("");

        brancher();
    }

    function brancher() {
        document.querySelectorAll(".part-vue").forEach(b => {
            b.addEventListener("click", () => consigner(b.dataset.id, "accuse_le"));
        });
        document.querySelectorAll(".part-fin").forEach(b => {
            b.addEventListener("click", () => consigner(b.dataset.id, "termine_le"));
        });
        document.querySelectorAll(".camp-ouvrir").forEach(b => {
            b.addEventListener("click", () => datercampagne(b.dataset.id, "ouverte_le"));
        });
        document.querySelectorAll(".camp-clore").forEach(b => {
            b.addEventListener("click", () => datercampagne(b.dataset.id, "close_le"));
        });
        document.querySelectorAll(".camp-convoquer").forEach(b => {
            b.addEventListener("click", () => convoquer(b.dataset.id));
        });
        document.querySelectorAll(".part-retirer").forEach(b => {
            b.addEventListener("click", () => deconvoquer(b.dataset.campagne, b.dataset.filiale, b.dataset.libelle));
        });
    }

    /* =====================================================================
       LES GESTES
    ===================================================================== */

    function creer() {
        const refId = (document.getElementById("campRef") || {}).value || "";
        const intitule = ((document.getElementById("campIntitule") || {}).value || "").trim();
        const echeance = (document.getElementById("campEcheance") || {}).value || "";
        if (intitule === "") {
            if (window.showToast) showToast("Donnez un intitulé à la campagne.", "warning");
            return;
        }
        // ⚠️ Écriture d'entité ORDINAIRE : la campagne passe par le même chemin que tout
        //    le reste — verrouillage optimiste, journal, diagnostic d'écriture. Le greffon
        //    `src/campagnes/` ne sert que ce que la couche générique ne peut pas faire.
        const campagne = {
            id: UI.genId("CAMP"),
            ref_id: refId,
            intitule: intitule,
            ouverte_le: "",
            echeance: echeance,
            close_le: "",
            notes: ""
        };
        DataStore.addCampagne(campagne);
        if (window.showToast) showToast("Campagne créée en brouillon. Convoquez des filiales, puis ouvrez-la.", "success");
        UI.apresEcriture(() => rafraichir());
    }

    function datercampagne(id, champ) {
        const campagne = DataStore.getCampagneById(id);
        if (!campagne) return;
        const aujourdhui = new Date().toISOString().slice(0, 10);
        // ⚠️ Un FAIT consigné, pas une action du produit : le libellé le dit, parce que
        //    l'utilisateur doit savoir que rien ne partira de cet écran.
        const question = champ === "ouverte_le"
            ? "Date à laquelle vous ouvrez cette campagne (AAAA-MM-JJ).\nLe produit n'envoie rien : les filiales la verront dans leur échéancier."
            : "Date de clôture de cette campagne (AAAA-MM-JJ).\nUne campagne close ne se relance plus : ce qui n'a pas été fait devient un manque constaté.";
        const saisie = prompt(question, campagne[champ] || aujourdhui);
        if (saisie === null) return;
        const date = saisie.trim();
        if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            alert("Date attendue au format AAAA-MM-JJ.");
            return;
        }
        campagne[champ] = date;
        DataStore.updateCampagne(campagne);
        UI.apresEcriture(() => rafraichir());
    }

    function consigner(partId, champ) {
        const part = DataStore.getPartCampagneById(partId);
        if (!part) {
            // La part est celle d'une autre filiale : l'écran l'affiche (le Groupe la
            // voit), mais elle n'est pas dans la mémoire locale de CETTE filiale.
            if (window.showToast) showToast("Cette part appartient à une autre filiale : elle se consigne depuis chez elle.", "warning");
            return;
        }
        const aujourdhui = new Date().toISOString().slice(0, 10);
        if (champ === "accuse_le" && !part.accuse_le) part.accuse_le = aujourdhui;
        if (champ === "termine_le") {
            // ⚠️ La base REFUSE un achèvement antérieur à la prise de connaissance
            //    (chronologie posée dans le schéma). Plutôt que de laisser partir une
            //    écriture vouée au refus, on consigne la prise de connaissance au même
            //    instant : déclarer terminé prouve qu'on avait pris connaissance.
            if (!part.accuse_le) part.accuse_le = aujourdhui;
            part.termine_le = aujourdhui;
            const repondant = prompt(
                "Qui a répondu pour votre filiale ? (facultatif)",
                part.repondant || "");
            if (repondant !== null && repondant.trim() !== "") part.repondant = repondant.trim();
        }
        DataStore.updatePartCampagne(part);
        if (window.showToast) showToast("Consigné.", "success");
        UI.apresEcriture(() => rafraichir());
    }

    /**
     * Retire la part d'une filiale — l'inverse de « convoquer ».
     *
     * ⚠️ **Sans ce geste, une campagne convoquée était INDESTRUCTIBLE**, et le défaut s'est
     * vu au navigateur sur la recette : la clé du schéma est en `restrict` (le §18.2 refuse
     * qu'une suppression de niveau Groupe détruise la donnée des filiales), donc retirer la
     * campagne exige de retirer ses parts d'abord — et les parts des AUTRES filiales ne sont
     * dans aucune mémoire de cette session, la charge utile ne servant que la filiale
     * active. Trois `409` « encore référencé ailleurs », sans que rien ne dise QUI tenait
     * encore une part.
     *
     * ⚠️ Et ce que ce geste ne détruit PAS : le travail. L'avancement vit dans les
     * évaluations, que la part ne porte pas — déconvoquer retire la demande, pas les
     * réponses.
     */
    function deconvoquer(campagneId, filialeId, libelle) {
        if (!window.Api || typeof Api.campagnesDeconvoquer !== "function") return;
        const nom = libelle || filialeId;
        if (!confirm("Retirer « " + nom + " » de cette campagne ?\n\n"
                   + "La demande disparaît de son échéancier. Ses réponses au référentiel, "
                   + "elles, sont conservées : elles vivent dans ses évaluations.")) return;
        Api.campagnesDeconvoquer(campagneId, [filialeId]).then(r => {
            const n = (r && r.deconvoquees) || 0;
            if (window.showToast) {
                showToast(n > 0 ? "Filiale déconvoquée." : "Cette filiale n'était plus convoquée.",
                          n > 0 ? "success" : "warning");
            }
            // La ligne retirée peut appartenir à une filiale que cette session ne charge
            // pas : on recharge le jeu plutôt que de deviner ce qui a changé.
            if (window.Sync && typeof Sync.recharger === "function") {
                return Sync.recharger().then(() => rafraichir());
            }
            return rafraichir();
        }).catch(() => {
            if (window.showToast) showToast("La déconvocation a échoué.", "danger");
        });
    }

    function convoquer(campagneId) {
        if (!window.Api || typeof Api.filiales !== "function" || typeof Api.campagnesConvoquer !== "function") return;
        Api.filiales().then(r => {
            // La route rend { filiales: [...] } ; le repli couvre une réponse déjà en tableau.
            const filiales = Array.isArray(r) ? r : ((r && r.filiales) || []);
            if (filiales.length === 0) {
                alert("Aucune filiale dans votre périmètre.");
                return;
            }
            const liste = filiales.map(f => f.code + " — " + (f.raison_sociale || f.raisonSociale || "")).join("\n");
            const saisie = prompt(
                "Codes des filiales à convoquer, séparés par des virgules :\n\n" + liste,
                filiales.map(f => f.code).join(","));
            if (saisie === null) return;
            const codes = saisie.split(",").map(c => c.trim().toUpperCase()).filter(c => c !== "");
            const ids = filiales.filter(f => codes.includes(String(f.code).toUpperCase())).map(f => f.id);
            if (ids.length === 0) {
                alert("Aucun code reconnu.");
                return;
            }
            return Api.campagnesConvoquer(campagneId, ids).then(res => {
                const dit = (res && res.convoquees) || 0;
                const deja = (res && res.deja) || 0;
                if (window.showToast) {
                    showToast(dit + " filiale(s) convoquée(s)"
                        + (deja > 0 ? ", " + deja + " déjà convoquée(s)" : "") + ".", "success");
                }
                // ⚠️ La convocation écrit des lignes que CETTE session n'a pas en mémoire
                //    (les parts d'autres filiales) : on recharge le jeu au lieu de deviner.
                if (window.Sync && typeof Sync.recharger === "function") {
                    return Sync.recharger().then(() => rafraichir());
                }
                return rafraichir();
            });
        }).catch(() => {
            if (window.showToast) showToast("La convocation a échoué.", "danger");
        });
    }

    return { renderList };
})();
