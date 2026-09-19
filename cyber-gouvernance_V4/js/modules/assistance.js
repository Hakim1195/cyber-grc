// Emplacement : js/modules/assistance.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  ASSISTANCE PAR IA — locale par défaut, externe sous six barrières (lot L27)
// ═══════════════════════════════════════════════════════════════════════════
//
// **L'IA propose ; un humain décide.** Aucun des cinq usages n'écrit en base :
// cet écran compose une demande, la montre, l'envoie si on le lui dit, et
// affiche ce qui revient. Ce qu'on en retient se recopie à la main dans la
// fiche concernée — délibérément.
//
// ── CE QUE CET ÉCRAN DOIT DIRE, ET QU'IL DIT ───────────────────────────────
//
//  · **ce qui va partir, avant que cela parte.** C'est la quatrième des six
//    barrières, et la seule qui se voie. L'utilisateur lit le texte exact, et
//    peut ne pas l'envoyer ;
//  · **où cela part**, quand le mode externe est actif — le fournisseur et le
//    lieu d'hébergement, en permanence, pas dans une fenêtre qu'on ferme ;
//  · **« indisponible » n'est pas une panne.** Une source coupée, un modèle
//    absent, une réponse illisible : le produit le dit, et ne remplit pas le
//    trou. *Un produit qui comble un trou est pire qu'un produit qui dit qu'il
//    y en a un.*
//
// ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
//
// Il **n'active rien**. Le mode externe s'ouvre dans `/etc/cyber-grc/env` puis
// par une ligne d'activation, et aucune case de cet écran ne l'atteint : la
// décision d'exporter les données de gouvernance d'un groupe n'appartient pas à
// l'utilisateur qui a la fiche sous les yeux.

const AssistanceModule = (() => {

    /** L'état servi par `GET /api/assistance/etat`. */
    let etat = null;
    /** L'invite préparée, montrée avant l'envoi. */
    let prepare = null;
    /** Ce qui est revenu. */
    let resultat = null;
    /** La matière saisie : des couples étiquette / valeur. */
    let matiere = [{ etiquette: "", valeur: "" }];

    /** Les cinq usages, par clés LITTÉRALES — une clé construite est invisible
     *  au contrôle mécanique des traductions, et s'afficherait en clair. */
    function libelleUsage(usage) {
        if (usage === "correspondances") return t("assistance.usageCorrespondances");
        if (usage === "brouillon_politique") return t("assistance.usageBrouillon");
        if (usage === "resume_incident") return t("assistance.usageResume");
        if (usage === "reponse_questionnaire") return t("assistance.usageQuestionnaire");
        if (usage === "recherche") return t("assistance.usageRecherche");
        return usage;
    }

    function usageChoisi() {
        const sel = document.getElementById("assistUsage");
        return sel ? sel.value : "correspondances";
    }

    /* =========================
       LE BANDEAU — barrière n° 6
       ⚠️ PERMANENT tant que le mode externe est actif, et sans bouton de
       fermeture : même mécanique que le bandeau du profil découverte (18.2 b),
       pour la même raison — ce qu'on ne voit pas devient une habitude.
    ========================== */
    function bandeauHtml() {
        if (!etat || !etat.avertissement) return "";
        return '<div class="bandeau-alerte">' + escapeHtml(etat.avertissement) + "</div>";
    }

    function matiereHtml() {
        const lignes = matiere.map(function (m, i) {
            return ""
                + '<div class="matiere-ligne">'
                +   '<input type="text" class="matiere-etiquette" data-rang="' + i + '"'
                +     ' placeholder="' + escapeHtml(t("assistance.champEtiquette")) + '"'
                +     ' value="' + escapeHtml(m.etiquette) + '" maxlength="120">'
                +   '<input type="text" class="matiere-valeur" data-rang="' + i + '"'
                +     ' placeholder="' + escapeHtml(t("assistance.champValeur")) + '"'
                +     ' value="' + escapeHtml(m.valeur) + '" maxlength="500">'
                + "</div>";
        });
        return '<div class="matiere">' + lignes.join("")
             + '<button type="button" id="assistPlus" class="btn btn-sm btn-secondary">'
             + escapeHtml(t("assistance.ajouterElement")) + "</button></div>";
    }

    function preparationHtml() {
        if (!prepare) return "";
        return ""
            + '<div class="card encart-alerte">'
            +   "<h3>" + escapeHtml(t("assistance.avantEnvoiTitre")) + "</h3>"
            +   "<p>" + escapeHtml(prepare.mode === "externe"
                    ? tHtml("assistance.avantEnvoiExterne", { destination: prepare.destination || "" })
                    : t("assistance.avantEnvoiLocal")) + "</p>"
            // ⚠️ Le texte EXACT qui partira, rendu tel quel : c'est tout l'objet de
            // la barrière n° 4. Le reformater ici la viderait de son sens.
            +   "<pre class=\"invite\">" + escapeHtml(prepare.texte) + "</pre>"
            +   '<p class="muted">' + escapeHtml(t("assistance.attenduTitre")) + " "
            +     escapeHtml(prepare.attendu) + "</p>"
            +   '<p class="muted">' + escapeHtml(tHtml("assistance.octets", { n: String(prepare.octets) })) + "</p>"
            +   '<button type="button" id="assistEnvoyer" class="btn">'
            +     escapeHtml(t("assistance.envoyer")) + "</button> "
            +   '<button type="button" id="assistAnnuler" class="btn btn-secondary">'
            +     escapeHtml(t("assistance.annuler")) + "</button>"
            + "</div>";
    }

    function resultatHtml() {
        if (!resultat) return "";
        // ⚠️ TROIS verdicts, et le troisième est le cœur du lot : « indisponible »
        // n'est ni une réussite ni une panne — c'est une absence de réponse, DITE.
        const badge = resultat.verdict === "rendu"
            ? UI.badge(t("assistance.verdictRendu"), "status-conforme")
            : resultat.verdict === "refuse"
                ? UI.badge(t("assistance.verdictRefuse"), "status-critique")
                : UI.badge(t("assistance.verdictIndisponible"), "status-partiellement-conforme");
        return ""
            + '<div class="card">'
            +   "<h3>" + escapeHtml(t("assistance.resultatTitre")) + " " + badge + "</h3>"
            +   "<p>" + escapeHtml(resultat.motif) + "</p>"
            +   (resultat.texte
                    ? '<pre class="invite">' + escapeHtml(resultat.texte) + "</pre>"
                      + '<p class="muted">' + escapeHtml(t("assistance.aVousDeDecider")) + "</p>"
                    : "")
            + "</div>";
    }

    function render() {
        const app = document.getElementById("app");
        if (!app) return;
        const entete = UI.enteteHtml({
            titre: t("assistance.titre"),
            aide: Help.tip(t("assistance.titreAide")),
            onglets: UI.ongletsDe("/assistance")
        });
        if (etat === null) {
            app.innerHTML = '<section class="page">' + entete
                + '<p class="muted">' + escapeHtml(t("assistance.chargement")) + "</p></section>";
            return;
        }
        const options = (etat.usages || []).map(function (u) {
            return '<option value="' + escapeHtml(u) + '">' + escapeHtml(libelleUsage(u)) + "</option>";
        }).join("");
        const indispo = !etat.localConfigure && etat.mode === "local"
            ? '<p class="muted">' + escapeHtml(t("assistance.sansModeleLocal")) + "</p>"
            : "";

        app.innerHTML = ""
            + '<section class="page">'
            +   entete
            +   bandeauHtml()
            +   '<div class="card">'
            +     "<h3>" + escapeHtml(t("assistance.demandeTitre")) + "</h3>"
            +     "<p>" + escapeHtml(t("assistance.demandeAide")) + "</p>"
            +     indispo
            +     '<form id="assistForm" class="form-grid no-print">'
            +       "<label>" + escapeHtml(t("assistance.champUsage"))
            +         '<select id="assistUsage">' + options + "</select></label>"
            +       '<button type="submit" class="btn">'
            +         escapeHtml(t("assistance.preparer")) + "</button>"
            +     "</form>"
            +     matiereHtml()
            +   "</div>"
            +   preparationHtml()
            +   resultatHtml()
            + "</section>";
        brancher();
    }

    function lireMatiere() {
        const etiquettes = document.querySelectorAll(".matiere-etiquette");
        const valeurs = document.querySelectorAll(".matiere-valeur");
        const lue = [];
        for (let i = 0; i < etiquettes.length; i += 1) {
            lue.push({
                etiquette: etiquettes[i].value,
                valeur: valeurs[i] ? valeurs[i].value : ""
            });
        }
        matiere = lue.length ? lue : [{ etiquette: "", valeur: "" }];
        return matiere.filter(function (m) {
            return m.etiquette.trim() !== "" && m.valeur.trim() !== "";
        });
    }

    function brancher() {
        const plus = document.getElementById("assistPlus");
        if (plus) {
            plus.addEventListener("click", function () {
                lireMatiere();
                matiere.push({ etiquette: "", valeur: "" });
                render();
            });
        }
        const form = document.getElementById("assistForm");
        if (form) {
            form.addEventListener("submit", function (ev) {
                ev.preventDefault();
                const pieces = lireMatiere();
                if (!pieces.length) {
                    if (window.showToast) showToast(t("assistance.matiereVide"), "error");
                    return;
                }
                Api.assistancePreparer({ usage: usageChoisi(), matiere: pieces })
                    .then(function (r) { prepare = r; resultat = null; render(); })
                    .catch(function (e) { if (window.showToast) showToast(e.message, "error"); });
            });
        }
        const annuler = document.getElementById("assistAnnuler");
        if (annuler) {
            // ⚠️ **Annuler est un vrai bouton, pas une politesse** : la barrière n° 4
            // dit « et peut l'annuler ». Sans lui, montrer le texte ne servirait qu'à
            // informer d'une chose qu'on ne peut plus empêcher.
            annuler.addEventListener("click", function () { prepare = null; render(); });
        }
        const envoyer = document.getElementById("assistEnvoyer");
        if (envoyer) {
            envoyer.addEventListener("click", function () {
                envoyer.disabled = true;
                Api.assistanceDemander({ usage: prepare.usage, matiere: lireMatiere() })
                    .then(function (r) { resultat = r; prepare = null; render(); })
                    .catch(function (e) {
                        envoyer.disabled = false;
                        if (window.showToast) showToast(e.message, "error");
                    });
            });
        }
    }

    function charger() {
        Api.assistanceEtat()
            .then(function (r) { etat = r; render(); })
            .catch(function (e) {
                etat = { usages: [], mode: "local", localConfigure: false, avertissement: null };
                render();
                if (window.showToast) showToast(e.message, "error");
            });
    }

    function renderList() {
        etat = null;
        prepare = null;
        resultat = null;
        matiere = [{ etiquette: "", valeur: "" }];
        render();
        charger();
    }

    return { renderList };
})();
