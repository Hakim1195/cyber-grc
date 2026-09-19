// Emplacement : js/modules/collecte.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  COLLECTE AUTOMATIQUE DE PREUVE — lots L22 (action 22.4) et L23
// ═══════════════════════════════════════════════════════════════════════════
//
// Un connecteur interroge une source locale — un dépôt de sauvegarde, le démon
// antivirus, l'annuaire — et en rapporte une **preuve datée**, rattachée à une
// mesure de sécurité. Chaque passage écrit une ligne : c'est l'historique du
// contrôle, et c'est ce qui permet de dire « rouge depuis trois semaines ».
//
// ── CE QUE CET ÉCRAN DIT, ET QU'IL FAUT LIRE ───────────────────────────────
//
//  · **« indéterminé » n'est ni vert ni rouge.** Une source injoignable n'est
//    pas un contrôle en échec : c'est un contrôle qu'on n'a pas pu faire. Les
//    confondre ferait accuser l'équipe sécurité d'une panne de réseau — ou,
//    pire dans l'autre sens, afficherait « conforme » sur un test qui n'a pas
//    tourné. C'est le critère 23.4, et c'est le point le plus important du lot ;
//  · **une preuve PÉRIMÉE redevient absente.** Elle n'est pas « encore bonne » :
//    une sauvegarde constatée réussie il y a onze mois n'est pas une preuve de
//    sauvegarde, c'est une preuve qu'on sauvegardait il y a onze mois. La
//    fraîcheur est DÉRIVÉE par le serveur (`f_collecte_fraicheur`) et jamais
//    rangée en colonne — une colonne « valide » vieillirait sans que rien
//    n'écrive (constat Q-219 pour la source unique, et le motif des dérogations
//    pour la dérivation) ;
//  · **une collecte ne conclut pas à la conformité d'une mesure.** Elle
//    constate un fait daté, qui alimente la mesure. L'évaluation reste celle
//    d'un humain : un produit qui passerait une mesure au vert parce qu'un
//    script a répondu « OK » remplacerait un jugement par un ping.
//
// ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
//
// Il ne crée pas de connecteur : `connecteurs` est une **entité ordinaire**
// (schéma `data` v27), créée et modifiée par les routes génériques comme tout
// le reste. Cet écran l'exécute, montre son verdict et son historique.

const CollecteModule = (() => {

    /** L'état servi par `GET /api/connecteurs/etat`. Nul tant qu'il n'est pas lu. */
    let etat = null;
    /** L'historique ouvert, s'il y en a un. */
    let historique = null;

    /* =========================
       LES DEUX VOCABULAIRES
       ⚠️ Verdict et fraîcheur sont DEUX axes, et les fondre en un seul badge
       ferait disparaître le cas qui compte : « conforme, mais périmé ».
    ========================== */
    function badgeVerdict(verdict) {
        if (verdict === "conforme") return UI.badge(libelleVerdict(verdict), "status-conforme");
        if (verdict === "non_conforme") return UI.badge(libelleVerdict(verdict), "status-critique");
        if (verdict === "indetermine") return UI.badge(libelleVerdict(verdict), "status-partiellement-conforme");
        return UI.badge(libelleVerdict(null), "status-non-applicable");
    }

    /**
     * Le libellé d'un genre.
     *
     * ⚠️ **Trois clés LITTÉRALES, et non une clé CONSTRUITE par concaténation.** Une clé
     * construite est invisible au contrôle mécanique des traductions
     * (`traductions.test.mjs` §37.2), qui n'y verrait que « collecte.genre » — et
     * une clé introuvable s'affiche EN CLAIR à l'écran. Le vocabulaire est clos en
     * base : trois valeurs, trois clés.
     */
    function libelleGenre(genre) {
        if (genre === "annuaire") return t("collecte.genreAnnuaire");
        if (genre === "sauvegarde") return t("collecte.genreSauvegarde");
        if (genre === "antivirus") return t("collecte.genreAntivirus");
        return genre;
    }

    /** Le libellé d'un verdict, par clés littérales pour le même motif. */
    function libelleVerdict(verdict) {
        if (verdict === "conforme") return t("collecte.conforme");
        if (verdict === "non_conforme") return t("collecte.nonConforme");
        if (verdict === "indetermine") return t("collecte.indetermine");
        return t("collecte.jamais");
    }

    function badgeFraicheur(fraicheur) {
        if (fraicheur === "fraiche") return UI.badge(t("collecte.fraiche"), "status-conforme");
        if (fraicheur === "perimee") return UI.badge(t("collecte.perimee"), "status-critique");
        return UI.badge(t("collecte.jamaisConstate"), "status-non-applicable");
    }

    /**
     * Le détail d'un constat, rendu lisible.
     *
     * ⚠️ **Tout y est échappé** : `detail` est un document que la SOURCE a rempli
     * — le nom d'un fichier de sauvegarde, la réponse d'un démon, le message
     * d'erreur d'une bibliothèque. C'est de la donnée venue du dehors, au même
     * titre qu'une saisie.
     */
    function detailHtml(detail) {
        const d = detail || {};
        const lignes = Object.keys(d).map(function (cle) {
            const valeur = d[cle];
            const rendu = (valeur === null || valeur === undefined)
                ? "—"
                : (typeof valeur === "object" ? JSON.stringify(valeur) : String(valeur));
            return "<li><strong>" + escapeHtml(cle) + "</strong> : " + escapeHtml(rendu) + "</li>";
        });
        if (!lignes.length) return '<p class="muted">' + escapeHtml(t("collecte.sansDetail")) + "</p>";
        return '<ul class="liste-detail">' + lignes.join("") + "</ul>";
    }

    function dateCourte(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        return isNaN(d.getTime()) ? "—" : d.toLocaleString();
    }

    /* =========================
       LE TABLEAU DES CONNECTEURS
    ========================== */
    function tableauHtml() {
        const connecteurs = (etat && etat.connecteurs) || [];
        if (!connecteurs.length) {
            return '<p class="muted">' + escapeHtml(t("collecte.aucun")) + "</p>";
        }
        const lignes = connecteurs.map(function (c) {
            // ⚠️ Un connecteur dont aucun exécuteur ne sert le genre est DIT, et non
            // affiché comme les autres : l'écran ne doit pas laisser croire qu'un
            // contrôle tourne alors que rien ne peut l'exécuter.
            const servi = c.servi
                ? ""
                : ' <span class="status status-critique">' + escapeHtml(t("collecte.nonServi")) + "</span>";
            return ""
                + '<tr data-id="' + escapeHtml(c.id) + '">'
                +   "<td>" + escapeHtml(c.nom) + servi + "</td>"
                +   "<td>" + escapeHtml(libelleGenre(c.genre)) + "</td>"
                +   "<td>" + escapeHtml(c.mesureNom || c.mesureId) + "</td>"
                +   "<td>" + badgeVerdict(c.dernierVerdict) + "</td>"
                +   "<td>" + badgeFraicheur(c.fraicheur) + "</td>"
                +   "<td>" + escapeHtml(dateCourte(c.derniereExecutionLe)) + "</td>"
                +   '<td class="no-print">'
                +     '<button class="btn btn-sm collecte-run" data-id="' + escapeHtml(c.id) + '"'
                +       (c.actif && c.servi ? "" : " disabled")
                +       ">" + escapeHtml(t("collecte.executer")) + "</button> "
                +     '<button class="btn btn-sm btn-secondary collecte-hist" data-id="' + escapeHtml(c.id) + '">'
                +       escapeHtml(t("collecte.historique")) + "</button>"
                +   "</td>"
                + "</tr>";
        });
        return ""
            + '<table class="data-table"><thead><tr>'
            +   "<th>" + escapeHtml(t("collecte.colNom")) + "</th>"
            +   "<th>" + escapeHtml(t("collecte.colGenre")) + "</th>"
            +   "<th>" + escapeHtml(t("collecte.colMesure")) + "</th>"
            +   "<th>" + escapeHtml(t("collecte.colVerdict")) + "</th>"
            +   "<th>" + escapeHtml(t("collecte.colFraicheur")) + "</th>"
            +   "<th>" + escapeHtml(t("collecte.colQuand")) + "</th>"
            +   '<th class="no-print">' + escapeHtml(t("collecte.colActions")) + "</th>"
            + "</tr></thead><tbody>" + lignes.join("") + "</tbody></table>";
    }

    /** Ce que chaque genre sait lire — lu dans la BASE, jamais recopié ici. */
    function genresHtml() {
        const genres = (etat && etat.genres) || [];
        if (!genres.length) return "";
        const blocs = genres.map(function (g) {
            const reglages = (g.reglages || []).map(function (r) {
                const obligatoire = r.obligatoire
                    ? ' <em>(' + escapeHtml(t("collecte.obligatoire")) + ")</em>"
                    : (r.defaut !== undefined
                        ? " <em>(" + escapeHtml(t("collecte.defaut")) + " " + escapeHtml(String(r.defaut)) + ")</em>"
                        : "");
                return "<li><code>" + escapeHtml(r.nom) + "</code>" + obligatoire
                     + " — " + escapeHtml(r.aide) + "</li>";
            });
            return ""
                + '<div class="card">'
                +   "<h4>" + escapeHtml(g.libelle) + "</h4>"
                +   "<p>" + escapeHtml(g.objet) + "</p>"
                +   "<ul>" + reglages.join("") + "</ul>"
                + "</div>";
        });
        return '<div class="cards-grid">' + blocs.join("") + "</div>";
    }

    function historiqueHtml() {
        if (!historique) return "";
        const constats = historique.constats || [];
        const entete = constats.length
            // ⚠️ `tHtml` échappe déjà ses substitutions et rend du balisage :
            // le ré-échapper afficherait les entités en clair.
            ? "<p>" + tHtml("collecte.depuis", {
                verdict: libelleVerdict(historique.verdictCourant),
                quand: dateCourte(historique.depuisLe)
              }) + "</p>"
            : '<p class="muted">' + escapeHtml(t("collecte.aucunConstat")) + "</p>";
        const lignes = constats.map(function (k) {
            return ""
                + "<tr>"
                +   "<td>" + escapeHtml(dateCourte(k.constateLe)) + "</td>"
                +   "<td>" + badgeVerdict(k.verdict) + "</td>"
                +   "<td>" + badgeFraicheur(k.fraicheur) + "</td>"
                +   "<td>" + detailHtml(k.detail) + "</td>"
                + "</tr>";
        });
        return ""
            + '<div class="card">'
            +   "<h3>" + escapeHtml(t("collecte.historiqueTitre")) + "</h3>"
            +   entete
            +   (constats.length
                ? '<table class="data-table"><thead><tr>'
                    + "<th>" + escapeHtml(t("collecte.colQuand")) + "</th>"
                    + "<th>" + escapeHtml(t("collecte.colVerdictSeul")) + "</th>"
                    + "<th>" + escapeHtml(t("collecte.colFraicheur")) + "</th>"
                    + "<th>" + escapeHtml(t("collecte.colDetail")) + "</th>"
                    + "</tr></thead><tbody>" + lignes.join("") + "</tbody></table>"
                : "")
            + "</div>";
    }

    function render() {
        const app = document.getElementById("app");
        if (!app) return;
        if (etat === null) {
            app.innerHTML = '<section class="page">'
                + UI.enteteHtml({
                    titre: t("collecte.titre"),
                    aide: Help.tip(t("collecte.titreAide")),
                    onglets: UI.ongletsDe("/collecte")
                  })
                + '<p class="muted">' + escapeHtml(t("collecte.chargement")) + "</p></section>";
            return;
        }
        app.innerHTML = ""
            + '<section class="page">'
            +   UI.enteteHtml({
                    titre: t("collecte.titre"),
                    aide: Help.tip(t("collecte.titreAide")),
                    onglets: UI.ongletsDe("/collecte")
                })
            +   '<div class="card">'
            +     "<h3>" + escapeHtml(t("collecte.listeTitre")) + "</h3>"
            +     tableauHtml()
            +   "</div>"
            +   historiqueHtml()
            +   '<div class="card">'
            +     "<h3>" + escapeHtml(t("collecte.genresTitre")) + "</h3>"
            +     "<p>" + escapeHtml(t("collecte.genresAide")) + "</p>"
            +     genresHtml()
            +   "</div>"
            + "</section>";
        UI.envelopperTableaux(app);
        brancher();
    }

    function brancher() {
        document.querySelectorAll(".collecte-run").forEach(function (b) {
            b.addEventListener("click", function () {
                b.disabled = true;
                Api.connecteurCollecter(b.dataset.id)
                    .then(function (r) {
                        if (window.showToast) {
                            showToast(tHtml("collecte.constatFait", {
                                verdict: libelleVerdict(r.verdict)
                            }), r.verdict === "conforme" ? "success" : "info");
                        }
                        // ⚠️ `apresEcriture` : le déclencheur de la base a pu créer une
                        // action, et l'écran suivant doit la voir. Sans lui, la course
                        // est invisible au banc — le serveur répond dans la même
                        // milliseconde — et se voit sur la recette (leçon `REPRISE.md` §4).
                        UI.apresEcriture(function () { charger(); });
                    })
                    .catch(function (e) {
                        b.disabled = false;
                        if (window.showToast) showToast(e.message, "error");
                    });
            });
        });
        document.querySelectorAll(".collecte-hist").forEach(function (b) {
            b.addEventListener("click", function () {
                Api.connecteurHistorique(b.dataset.id)
                    .then(function (r) { historique = r; render(); })
                    .catch(function (e) { if (window.showToast) showToast(e.message, "error"); });
            });
        });
    }

    function charger() {
        Api.connecteursEtat()
            .then(function (r) { etat = r; render(); })
            .catch(function (e) {
                etat = { connecteurs: [], genres: [] };
                render();
                if (window.showToast) showToast(e.message, "error");
            });
    }

    function renderList() {
        etat = null;
        historique = null;
        render();
        charger();
    }

    return { renderList };
})();
