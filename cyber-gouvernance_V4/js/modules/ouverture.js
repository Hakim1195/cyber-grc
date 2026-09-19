// Emplacement : js/modules/ouverture.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  OUVERTURE TECHNIQUE — jetons d'API et événements sortants (lot L22)
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux choses, et une seule idée : **laisser un autre système parler à celui-ci
// sans lui donner un compte humain**.
//
//  · un **jeton d'API** est un sujet de droits comme un autre. Il traverse la
//    résolution de périmètre et la RLS ; il ne les contourne pas. Il ne peut
//    jamais porter plus que le compte qui l'a émis — l'intersection est faite
//    par le serveur, à la création, sur les trois axes : niveau, domaines,
//    droit d'export ;
//  · un **abonnement** fait partir un événement vers un outil tiers quand
//    quelque chose arrive ici.
//
// ── LES TROIS CHOSES QUE CET ÉCRAN DOIT DIRE, ET QU'IL DIT ─────────────────
//
//  1. **Le secret d'un jeton n'existe qu'une fois.** Le serveur le fabrique, le
//     rend, et n'en garde qu'une empreinte. Il n'y a pas de « secret oublié » :
//     on en émet un autre et on révoque celui-ci. L'écran l'affiche une fois,
//     avec son avertissement, et ne le redemande jamais.
//  2. **Révoquer n'est pas supprimer.** La ligne reste, datée et nominative :
//     savoir qu'un accès a existé, qui l'a émis et qui l'a coupé est exactement
//     ce qu'un audit vient chercher.
//  3. **Rien ne part tant que l'exploitant n'a pas ouvert la sortie réseau.**
//     L'unité systemd porte `IPAddressDeny=any`, et c'est une barrière physique,
//     pas une promesse. La file se remplit, le drainage échoue, et l'écran le
//     montre — c'est le constat Q-199, où un lot avait été livré dans une
//     configuration qui ne pouvait pas envoyer, avec un banc vert.

const OuvertureModule = (() => {

    /** Les jetons servis par `GET /api/ouverture/jetons`. */
    let jetons = null;
    /** L'état des abonnements et de la file. */
    let evenements = null;
    /**
     * Le secret qui vient d'être émis, s'il y en a un.
     *
     * ⚠️ **Il vit en mémoire, et nulle part ailleurs.** Ni `localStorage`, ni
     * champ de formulaire pré-rempli : une seule navigation le fait disparaître,
     * et c'est ce qu'on veut — l'avertissement dit qu'il faut le copier
     * maintenant, et l'écran se comporte comme l'avertissement.
     */
    let secretNeuf = null;

    function dateCourte(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        return isNaN(d.getTime()) ? "—" : d.toLocaleString();
    }

    /** Les trois états d'un jeton — DÉRIVÉS par le serveur, jamais rangés. */
    function badgeEtat(etat) {
        if (etat === "actif") return UI.badge(t("ouverture.etatActif"), "status-conforme");
        if (etat === "expire") return UI.badge(t("ouverture.etatExpire"), "status-partiellement-conforme");
        return UI.badge(t("ouverture.etatRevoque"), "status-non-applicable");
    }

    /* =========================
       LES JETONS
    ========================== */
    function secretHtml() {
        if (!secretNeuf) return "";
        return ""
            + '<div class="card encart-alerte">'
            +   "<h3>" + escapeHtml(t("ouverture.secretTitre")) + "</h3>"
            +   "<p><strong>" + escapeHtml(secretNeuf.avertissement) + "</strong></p>"
            // ⚠️ Le secret est une valeur produite par le serveur, mais elle passe
            // quand même par l'échappement : la règle ne se relâche pas selon
            // l'origine — c'est ainsi qu'on l'oublie une fois sur dix.
            +   '<p><code class="secret-jeton">' + escapeHtml(secretNeuf.secret) + "</code></p>"
            +   '<button id="secretFerme" class="btn btn-sm">'
            +     escapeHtml(t("ouverture.secretCopie")) + "</button>"
            + "</div>";
    }

    function jetonsHtml() {
        const liste = (jetons && jetons.jetons) || [];
        if (!liste.length) return '<p class="muted">' + escapeHtml(t("ouverture.aucunJeton")) + "</p>";
        const lignes = liste.map(function (j) {
            const domaines = (j.domaines || []).join(", ");
            return ""
                + "<tr>"
                +   "<td>" + escapeHtml(j.nom) + "</td>"
                +   "<td><code>" + escapeHtml(j.prefixe) + "…</code></td>"
                +   "<td>" + badgeEtat(j.etat) + "</td>"
                +   "<td>" + escapeHtml(I18n.valeur(j.niveau)) + "</td>"
                +   "<td>" + escapeHtml(domaines || "—") + "</td>"
                +   "<td>" + escapeHtml(j.peut_exporter ? t("ouverture.oui") : t("ouverture.non")) + "</td>"
                +   "<td>" + escapeHtml(dateCourte(j.expire_le)) + "</td>"
                +   "<td>" + escapeHtml(j.emis_par || "—") + "</td>"
                +   "<td>" + escapeHtml(dateCourte(j.dernier_usage_le)) + "</td>"
                +   '<td class="no-print">'
                +     (j.etat === "revoque"
                        ? ""
                        : '<button class="btn btn-sm btn-danger jeton-revoque" data-id="'
                          + escapeHtml(j.id) + '">' + escapeHtml(t("ouverture.revoquer")) + "</button>")
                +   "</td>"
                + "</tr>";
        });
        return ""
            + '<table class="data-table"><thead><tr>'
            +   "<th>" + escapeHtml(t("ouverture.colNom")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colPrefixe")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colEtat")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colNiveau")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colDomaines")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colExport")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colExpire")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colEmisPar")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colUsage")) + "</th>"
            +   '<th class="no-print">' + escapeHtml(t("ouverture.colActions")) + "</th>"
            + "</tr></thead><tbody>" + lignes.join("") + "</tbody></table>";
    }

    /**
     * Le formulaire d'émission.
     *
     * 🛑 **LA PREMIÈRE RÉDACTION N'OFFRAIT NI DOMAINE, NI NIVEAU, NI EXPORT** — et le
     * serveur exige au moins un domaine. L'écran était donc **inutilisable** : toute
     * émission rendait 400, et l'utilisateur voyait un message qui parlait d'un choix
     * que rien ne lui proposait. *Trouvé en cliquant sur la recette, après un banc
     * entièrement vert* — c'est la quatrième fois cette semaine (`REPRISE.md` §4).
     *
     * ⚠️ **Les choix proposés sont bornés par les droits de la SESSION**, et c'est
     * pédagogique autant que sûr : on ne propose pas un domaine que le serveur
     * refusera, et l'utilisateur voit de ses yeux que le jeton ne peut pas porter plus
     * que lui. La décision, elle, reste celle du serveur — cet écran ne l'anticipe
     * pas, il l'expose.
     */
    function formulaireJetonHtml() {
        const domaines = (typeof Droits !== "undefined" && Droits.domaines())
            ? Droits.domaines().slice().sort()
            : [];
        if (!domaines.length) {
            return '<p class="muted">' + escapeHtml(t("ouverture.sansDomaine")) + "</p>";
        }
        const cases = domaines.map(function (d, i) {
            const id = "jetonDom" + String(i);
            return '<label class="case-en-ligne"><input type="checkbox" class="jeton-domaine" '
                 + 'id="' + escapeHtml(id) + '" value="' + escapeHtml(d) + '"> '
                 + escapeHtml(I18n.valeur(d)) + "</label>";
        }).join("");
        // ⚠️ Les trois niveaux sont des clés LITTÉRALES : une clé construite est
        // invisible au contrôle mécanique des traductions, et une clé introuvable
        // s'affiche en clair à l'écran.
        const niveaux = ""
            + '<option value="lecture">' + escapeHtml(t("ouverture.niveauLecture")) + "</option>"
            + '<option value="contribution">' + escapeHtml(t("ouverture.niveauContribution")) + "</option>"
            + '<option value="administration">' + escapeHtml(t("ouverture.niveauAdministration")) + "</option>";
        const export_ = (typeof Droits !== "undefined" && Droits.peutExporter && Droits.peutExporter())
            ? '<label class="case-en-ligne"><input type="checkbox" id="jetonExport"> '
              + escapeHtml(t("ouverture.champExport")) + "</label>"
            : "";
        return ""
            + '<form id="jetonForm" class="form-grid no-print">'
            +   '<label>' + escapeHtml(t("ouverture.champNom"))
            +     '<input type="text" id="jetonNom" maxlength="120" required></label>'
            +   '<label>' + escapeHtml(t("ouverture.champNiveau"))
            +     '<select id="jetonNiveau">' + niveaux + "</select></label>"
            +   '<label>' + escapeHtml(t("ouverture.champJours"))
            +     '<input type="number" id="jetonJours" min="1" max="730" value="90"></label>'
            +   '<fieldset class="cases"><legend>' + escapeHtml(t("ouverture.champDomaines"))
            +     "</legend>" + cases + export_ + "</fieldset>"
            +   '<button type="submit" class="btn">' + escapeHtml(t("ouverture.emettre")) + "</button>"
            + "</form>"
            + '<p class="muted">' + escapeHtml(t("ouverture.jetonAide")) + "</p>";
    }

    /* =========================
       LES ABONNEMENTS
    ========================== */
    function abonnementsHtml() {
        const liste = (evenements && evenements.abonnements) || [];
        if (!liste.length) {
            return '<p class="muted">' + escapeHtml(t("ouverture.aucunAbonnement")) + "</p>";
        }
        const lignes = liste.map(function (a) {
            const enAttente = Number(a.en_attente || 0);
            return ""
                + "<tr>"
                +   "<td>" + escapeHtml(a.nom) + "</td>"
                +   "<td>" + escapeHtml(I18n.valeur(a.evenement)) + "</td>"
                +   "<td>" + escapeHtml(a.url) + "</td>"
                +   "<td>" + escapeHtml(a.actif ? t("ouverture.oui") : t("ouverture.non")) + "</td>"
                +   "<td>" + escapeHtml(dateCourte(a.dernier_envoi_le)) + "</td>"
                +   "<td>" + escapeHtml(String(a.dernier_statut == null ? "—" : a.dernier_statut)) + "</td>"
                +   "<td>" + (enAttente > 0
                        ? UI.badge(String(enAttente), "status-partiellement-conforme")
                        : escapeHtml("0")) + "</td>"
                +   '<td class="no-print">'
                +     '<button class="btn btn-sm btn-danger abo-retire" data-id="'
                +       escapeHtml(a.id) + '">' + escapeHtml(t("ouverture.retirer")) + "</button>"
                +   "</td>"
                + "</tr>";
        });
        return ""
            + '<table class="data-table"><thead><tr>'
            +   "<th>" + escapeHtml(t("ouverture.colNom")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colEvenement")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colUrl")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colActif")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colDernierEnvoi")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colStatut")) + "</th>"
            +   "<th>" + escapeHtml(t("ouverture.colEnAttente")) + "</th>"
            +   '<th class="no-print">' + escapeHtml(t("ouverture.colActions")) + "</th>"
            + "</tr></thead><tbody>" + lignes.join("") + "</tbody></table>";
    }

    function formulaireAbonnementHtml() {
        // ⚠️ **Les choix viennent du SERVEUR**, qui les découvre dans le catalogue des
        // déclencheurs et dans la déclaration `f_evenements_emis()`. Les recopier ici
        // ferait proposer un événement que rien n'émet — l'abonnement aurait l'air en
        // place et ne se déclencherait jamais. C'est le défaut que la migration `056`
        // a fermé, et il était réel.
        const emis = (evenements && evenements.evenementsEmis) || [];
        const options = emis.map(function (e) {
            return '<option value="' + escapeHtml(e) + '">' + escapeHtml(I18n.valeur(e)) + "</option>";
        }).join("");
        if (!options) return '<p class="muted">' + escapeHtml(t("ouverture.aucunEvenement")) + "</p>";
        return ""
            + '<form id="aboForm" class="form-grid no-print">'
            +   "<label>" + escapeHtml(t("ouverture.champNom"))
            +     '<input type="text" id="aboNom" maxlength="120" required></label>'
            +   "<label>" + escapeHtml(t("ouverture.champEvenement"))
            +     '<select id="aboEvenement">' + options + "</select></label>"
            +   "<label>" + escapeHtml(t("ouverture.champUrl"))
            +     '<input type="url" id="aboUrl" maxlength="500" placeholder="https://" required></label>'
            +   '<button type="submit" class="btn">' + escapeHtml(t("ouverture.abonner")) + "</button>"
            + "</form>"
            + '<p class="muted">' + escapeHtml(t("ouverture.aboAide")) + "</p>";
    }

    function fileHtml() {
        const file = (evenements && evenements.file) || [];
        if (!file.length) return '<p class="muted">' + escapeHtml(t("ouverture.fileVide")) + "</p>";
        const items = file.map(function (f) {
            return "<li>" + escapeHtml(I18n.valeur(f.statut)) + " : <strong>"
                 + escapeHtml(String(f.n)) + "</strong></li>";
        });
        return "<ul>" + items.join("") + "</ul>";
    }

    /* =========================
       RENDU
    ========================== */
    function render() {
        const app = document.getElementById("app");
        if (!app) return;
        const entete = UI.enteteHtml({
            titre: t("ouverture.titre"),
            aide: Help.tip(t("ouverture.titreAide")),
            onglets: UI.ongletsDe("/settings-ouverture")
        });
        if (jetons === null || evenements === null) {
            app.innerHTML = '<section class="page">' + entete
                + '<p class="muted">' + escapeHtml(t("ouverture.chargement")) + "</p></section>";
            return;
        }
        app.innerHTML = ""
            + '<section class="page">'
            +   entete
            +   secretHtml()
            +   '<div class="card">'
            +     "<h3>" + escapeHtml(t("ouverture.jetonsTitre")) + "</h3>"
            +     jetonsHtml()
            +     formulaireJetonHtml()
            +   "</div>"
            +   '<div class="card">'
            +     "<h3>" + escapeHtml(t("ouverture.abonnementsTitre")) + "</h3>"
            +     '<p class="muted">' + escapeHtml(t("ouverture.sortieReseau")) + "</p>"
            +     abonnementsHtml()
            +     formulaireAbonnementHtml()
            +   "</div>"
            +   '<div class="card">'
            +     "<h3>" + escapeHtml(t("ouverture.fileTitre")) + "</h3>"
            +     fileHtml()
            +   "</div>"
            + "</section>";
        UI.envelopperTableaux(app);
        brancher();
    }

    function brancher() {
        const ferme = document.getElementById("secretFerme");
        if (ferme) ferme.addEventListener("click", function () { secretNeuf = null; render(); });

        const jetonForm = document.getElementById("jetonForm");
        if (jetonForm) {
            jetonForm.addEventListener("submit", function (ev) {
                ev.preventDefault();
                const nom = document.getElementById("jetonNom").value.trim();
                const jours = parseInt(document.getElementById("jetonJours").value, 10);
                const choisis = Array.prototype.slice
                    .call(document.querySelectorAll(".jeton-domaine:checked"))
                    .map(function (c) { return c.value; });
                if (!nom) return;
                // ⚠️ On DIT ce qui manque plutôt que de laisser le serveur rendre 400 :
                // un message qui parle d'un choix que l'écran ne propose pas apprend à
                // ne plus croire les messages (classe Q-201 / Q-207).
                if (!choisis.length) {
                    if (window.showToast) showToast(t("ouverture.choisirDomaine"), "error");
                    return;
                }
                const exporte = document.getElementById("jetonExport");
                Api.emettreJeton({
                    nom: nom,
                    jours: isNaN(jours) ? undefined : jours,
                    niveau: document.getElementById("jetonNiveau").value,
                    domaines: choisis,
                    peut_exporter: !!(exporte && exporte.checked)
                })
                    .then(function (r) {
                        secretNeuf = { secret: r.secret, avertissement: r.avertissement };
                        charger();
                    })
                    .catch(function (e) { if (window.showToast) showToast(e.message, "error"); });
            });
        }

        document.querySelectorAll(".jeton-revoque").forEach(function (b) {
            b.addEventListener("click", function () {
                if (!confirm(t("ouverture.confirmRevoquer"))) return;
                Api.revoquerJeton(b.dataset.id)
                    .then(function () {
                        if (window.showToast) showToast(t("ouverture.revoque"), "success");
                        charger();
                    })
                    .catch(function (e) { if (window.showToast) showToast(e.message, "error"); });
            });
        });

        const aboForm = document.getElementById("aboForm");
        if (aboForm) {
            aboForm.addEventListener("submit", function (ev) {
                ev.preventDefault();
                Api.abonnerEvenement({
                    nom: document.getElementById("aboNom").value.trim(),
                    evenement: document.getElementById("aboEvenement").value,
                    url: document.getElementById("aboUrl").value.trim()
                })
                    .then(function () {
                        if (window.showToast) showToast(t("ouverture.abonne"), "success");
                        charger();
                    })
                    .catch(function (e) { if (window.showToast) showToast(e.message, "error"); });
            });
        }

        document.querySelectorAll(".abo-retire").forEach(function (b) {
            b.addEventListener("click", function () {
                if (!confirm(t("ouverture.confirmRetirer"))) return;
                Api.retirerAbonnement(b.dataset.id)
                    .then(function () { charger(); })
                    .catch(function (e) { if (window.showToast) showToast(e.message, "error"); });
            });
        });
    }

    function charger() {
        Promise.all([Api.jetonsApi(), Api.abonnementsEvenements()])
            .then(function (r) { jetons = r[0]; evenements = r[1]; render(); })
            .catch(function (e) {
                jetons = { jetons: [] };
                evenements = { abonnements: [], file: [], evenementsEmis: [] };
                render();
                if (window.showToast) showToast(e.message, "error");
            });
    }

    function renderList() {
        jetons = null;
        evenements = null;
        render();
        charger();
    }

    return { renderList };
})();
