// Emplacement : js/modules/attestations.js
// Nom du fichier : attestations.js
//
// Panneau « Attestation de lecture » — lot L19, action 19.1.
//
// ── Ce que ce fichier est, et ce qu'il n'est pas ────────────────────────────
//
// Ce n'est **pas un écran**, c'est un panneau — au même titre que
// `js/modules/pieces.js` et `js/modules/approbations.js`. Une attestation n'a
// pas d'existence propre : elle est la preuve qu'une politique a été lue, et
// elle se lit à côté de cette politique. Il n'y a donc ni route, ni entrée de
// menu, ni domaine de droits à lui : le panneau hérite du domaine de la fiche
// qui le porte (`documents`), ce que `js/app.js` sait déjà faire sans rien
// connaître de ce fichier.
//
// Il expose en plus un **bloc de tableau de bord** — « Politiques à lire » —,
// parce que la moitié qui compte de l'action 19.1 est celle-ci : *savoir qu'on
// a quelque chose à lire sans avoir à ouvrir la fiche pour le découvrir*.
//
// ── La décision centrale, et elle vit côté serveur ──────────────────────────
//
// **On n'atteste que pour soi.** La personne est déduite de la session ; la
// version lue est celle qui fait foi au moment du geste. Ni l'une ni l'autre ne
// voyagent depuis le navigateur — voir l'en-tête de
// `backend/src/attestations/index.ts`, qui porte le motif en entier.
//
// Conséquence pour ce fichier : il ne construit **aucun** corps de requête
// portant une personne ou une version. `Api.attester(documentId, commentaire)`
// est la seule porte, et sa signature est la garde.
//
// ── Ce que le panneau doit DIRE, et pas seulement montrer ───────────────────
//
// Trois situations se ressemblent à l'écran et n'appellent pas la même
// réaction. Les confondre est la classe des constats Q-201 / Q-207 — *un vide
// sans explication apprend à ne plus croire ce qu'on montre* :
//
//   1. **ce document n'exige pas d'attestation** → il n'y a rien à faire, et
//      c'est normal ;
//   2. **il l'exige, et personne n'a encore attesté** → la couverture est à
//      0 %, et c'est une information, pas une panne ;
//   3. **mon compte n'a pas de fiche dans l'annuaire** → je peux consulter,
//      jamais attester, et le serveur en donne le motif en toutes lettres
//      (`MOTIF_SANS_FICHE`). On l'affiche tel quel plutôt que de désactiver un
//      bouton sans dire pourquoi.
//
// ── Ce qui vient de la base, et ce que cela impose ──────────────────────────
//
// Le nom d'une personne, le titre d'un document, un numéro de version et le
// commentaire d'une attestation sont tous des **données de saisie**. Tout ce
// que ce fichier injecte dans le DOM passe donc par `escapeHtml`, sans
// exception — y compris le motif rendu par le serveur.

const AttestationsModule = (() => {
    "use strict";

    /** Un seul panneau par fiche, un seul bloc par tableau de bord. */
    const ID_ENCART = "attestationsEncart";
    const ID_BLOC   = "attestationsBloc";

    /** Le domaine de droits dont ce panneau dépend — celui de la fiche qui le porte. */
    const DOMAINE = "documents";


    /**
     * Les quatre classes de badge du produit, et rien d'autre.
     *
     * ⚠️ On ne crée PAS de classe de couleur ici. `.status-conforme` et ses
     * trois sœurs sont le vocabulaire visuel du produit depuis le premier
     * chantier : vert = conforme, orange = partiel, rouge = critique, gris =
     * non applicable (`CLAUDE.md` §2, sémantique stricte). Un cinquième jeu de
     * teintes affaiblirait les quatre qui existent — et c'est ce qui rend une
     * couleur illisible : qu'elle veuille dire deux choses.
     */
    const CLASSE_TON = Object.freeze({
        ok:   "status-conforme",
        warn: "status-partiellement-conforme",
        crit: "status-non-conforme",
        na:   "status-non-applicable"
    });

    /* =====================================================================
       AFFICHAGE — tout passe par escapeHtml, sans exception
    ===================================================================== */

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function peutLire(domaine) {
        if (typeof Droits === "undefined") return true;
        return Droits.peutLire(domaine);
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleString("fr-FR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    /**
     * Le ton d'un taux de couverture.
     *
     * ⚠️ **Les quatre couleurs sémantiques sont réservées aux statuts**
     * (`CLAUDE.md` §2), et un taux de lecture EST un statut de conformité : un
     * auditeur qui ouvre A.5.1 lit ce chiffre comme tel. Les seuils sont ceux
     * que le produit emploie déjà pour la conformité — ils ne sont pas
     * réinventés ici.
     */
    function tonCouverture(taux) {
        if (taux === null || taux === undefined) return "na";
        if (taux >= 90) return "ok";
        if (taux >= 50) return "warn";
        return "crit";
    }

    /** La barre de couverture — un chiffre, et sa part visible. */
    function barreCouverture(couverture) {
        const taux = couverture && couverture.taux;
        const ton  = tonCouverture(taux);
        // ⚠️ `null` n'est pas `0` : un taux de 0 % sur une filiale sans
        // personnel serait faux, et le serveur rend `null` précisément pour
        // qu'on ne l'affiche pas comme un échec.
        if (taux === null || taux === undefined) {
            return '<p class="chart-empty">'
                + esc("Aucune personne n'est inscrite à l'annuaire du personnel de cette "
                    + "filiale : le taux de couverture n'a pas de dénominateur, et le produit "
                    + "préfère ne rien afficher plutôt qu'un 0 % qui serait faux.")
                + "</p>";
        }
        return ''
            + '<div class="att-couverture">'
            +   '<div class="att-taux att-taux--' + ton + '">' + esc(String(taux)) + '&nbsp;%</div>'
            +   '<div class="att-jauge-zone">'
            +     '<div class="att-jauge" role="img" aria-label="'
            +       esc("Couverture : " + couverture.aJour + " personnes sur " + couverture.effectif)
            +       '"><span class="att-jauge-part att-jauge-part--' + ton + '" style="width:'
            +       esc(String(Math.max(0, Math.min(100, taux)))) + '%;"></span></div>'
            +     '<p class="att-jauge-legende">'
            +       esc(couverture.aJour + " personne" + (couverture.aJour > 1 ? "s" : "")
                       + " sur " + couverture.effectif
                       + " ont attesté la version en vigueur.")
            +     '</p>'
            +   '</div>'
            + '</div>';
    }

    /* =====================================================================
       LE PANNEAU DE LA FICHE DOCUMENT
    ===================================================================== */

    /**
     * Le bloc à insérer dans le gabarit de la fiche Document.
     *
     * Rend une chaîne vide si le domaine n'est pas lisible : un panneau
     * « accès refusé » sur chaque fiche n'apprendrait rien et prendrait la place.
     */
    function encartHtml(documentId) {
        if (!documentId) return "";
        if (!peutLire(DOMAINE)) return "";
        return ''
            + '<div class="card att-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(documentId) + '">'
            +   "<h2>Attestation de lecture"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "Qui déclare avoir lu cette version de ce document, et quand. C'est la "
                    + "preuve que demande un auditeur au chapitre A.5.1 de l'ISO 27001 : "
                    + "« les politiques ont-elles été portées à la connaissance du "
                    + "personnel ? ». Une attestation vaut pour UNE version — réviser le "
                    + "document remet le compteur à zéro, sans effacer l'histoire.") : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"><p class="chart-empty">'
            +   esc("Lecture des attestations…") + "</p></div>"
            + "</div>";
    }

    /**
     * Charge et branche le panneau, une fois le gabarit posé dans le DOM.
     *
     * ⚠️ L'identifiant est **relu dans l'attribut du conteneur**, et le DOM
     * GAGNE sur l'argument : c'est la convention du `CLAUDE.md` §3, et c'est ce
     * que le constat Q-303 a coûté à l'encart d'approbation — le serveur
     * réattribue l'identifiant à la création, et un argument capturé vise alors
     * un enregistrement qui n'existe plus.
     */
    function brancherEncart(documentId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const id = noeud.dataset.id || documentId;
        if (!id) return;

        // ⚠️ On n'interroge pas le serveur sur un enregistrement qu'il ne
        // connaît pas encore (constat B-5) : à la création, l'identifiant est
        // encore celui du navigateur, la demande rendrait 404 et laisserait une
        // erreur de console. Le recalage nous rappellera.
        if (typeof Sync !== "undefined" && typeof Sync.serveurConnait === "function"
            && !Sync.serveurConnait("documents", id)) {
            ecrireCorps('<p class="chart-empty">'
                + esc("Enregistrement en cours d'envoi — les attestations s'afficheront dès "
                    + "que le serveur l'aura pris.") + "</p>");
            return;
        }
        chargerEncart(id);
    }

    function ecrireCorps(html) {
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (corps) corps.innerHTML = html;
    }

    function chargerEncart(documentId) {
        ecrireCorps('<p class="chart-empty">' + esc("Lecture des attestations…") + "</p>");
        Api.attestationsDocument(documentId).then(charge => {
            ecrireCorps(corpsEncartHtml(charge));
            brancherBoutonAttester(documentId);
        }).catch(e => {
            // Un refus de droit n'est pas une panne : le dire, et s'arrêter là.
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter les attestations de ce document."
                : ((e && e.message) || "Les attestations n'ont pas pu être lues.");
            ecrireCorps('<p class="chart-empty">' + esc(message) + "</p>");
        });
    }

    /**
     * Le corps du panneau — exposé pour le banc, qui le compose sans réseau.
     */
    function corpsEncartHtml(charge) {
        const doc = (charge && charge.document) || {};
        if (!doc.attestationRequise) {
            return ''
                + '<p class="chart-empty">'
                + esc("Ce document n'exige pas d'attestation de lecture. Cochez « Exiger une "
                    + "attestation de lecture » sur la fiche pour le demander au personnel.")
                + "</p>";
        }

        const liste = (charge && charge.attestations) || [];
        let html = barreCouverture(charge && charge.couverture);

        // ⚠️ **Une saisie EN PLACE, jamais un `window.prompt`.** Une boîte
        // native ne se met pas en forme, ne s'imprime pas, et interrompt la
        // page — trois choses qu'un outil produit en audit ne peut pas se
        // permettre. La réserve se relit avant d'engager, ce qui est le point.
        html += '<div class="att-action no-print">'
             +  '<label class="att-reserve-label" for="' + ID_ENCART + 'Reserve">'
             +  esc("Réserve ou précision (facultatif)") + "</label>"
             +  '<input type="text" id="' + ID_ENCART + 'Reserve" class="att-reserve" '
             +  'maxlength="2000" autocomplete="off" placeholder="'
             +  esc("Ex. : lu, sous réserve du chapitre 4") + '">'
             +  '<button type="button" id="' + ID_ENCART + 'Btn">'
             +  esc("J'atteste avoir lu ce document") + "</button>"
             +  "</div>"
             +  '<p class="att-version-note">'
             +  esc(doc.version
                    ? "Vous attesterez la version " + doc.version + ", qui est celle en vigueur."
                    : "Ce document ne porte pas de numéro de version : l'attestation sera "
                      + "enregistrée sans version, et ne pourra donc pas se périmer.")
             +  "</p>"
             +  '<p class="att-mention">'
             +  esc("Une attestation engage la personne connectée, et elle seule : le produit "
                  + "ne permet à personne d'attester au nom d'un autre. Ce n'est pas une "
                  + "signature électronique qualifiée.")
             +  "</p>";

        if (liste.length === 0) {
            html += '<p class="chart-empty">'
                 +  esc("Personne n'a encore attesté avoir lu ce document.")
                 +  "</p>";
            return html;
        }

        html += '<div class="table-scroll"><table class="data-table att-table">'
             +  "<thead><tr><th>Personne</th><th>Version lue</th>"
             +  "<th class=\"num\">Attestée le</th><th>État</th><th>Réserve</th></tr></thead><tbody>";
        liste.forEach(a => {
            html += "<tr>"
                 +  "<td>" + esc(a.nom) + "</td>"
                 +  '<td class="mono">' + esc(a.version || "—") + "</td>"
                 +  '<td class="num">' + esc(fmtDate(a.atteste_le)) + "</td>"
                 +  "<td>" + (a.aJour
                        ? '<span class="status ' + CLASSE_TON.ok + '">' + esc("À jour") + "</span>"
                        : '<span class="status ' + CLASSE_TON.warn + '">' + esc("Version périmée") + "</span>")
                 +  "</td>"
                 +  "<td>" + esc(a.commentaire || "—") + "</td>"
                 +  "</tr>";
        });
        html += "</tbody></table></div>";
        return html;
    }

    function brancherBoutonAttester(documentId) {
        const bouton = document.getElementById(ID_ENCART + "Btn");
        if (!bouton) return;
        bouton.addEventListener("click", () => {
            // ⚠️ Une confirmation, parce que le geste ENGAGE : il inscrit au
            // journal inaltérable que cette personne déclare avoir lu. Un clic
            // par mégarde y laisserait une déclaration qu'on ne peut pas retirer.
            if (!window.confirm("Vous déclarez avoir lu ce document dans sa version en "
                + "vigueur. Cette déclaration est inscrite au journal d'audit et ne peut "
                + "pas être retirée. Confirmer ?")) return;
            const champ = document.getElementById(ID_ENCART + "Reserve");
            const reserve = champ ? champ.value : "";
            bouton.disabled = true;
            bouton.textContent = "Enregistrement…";
            Api.attester(documentId, reserve.trim() || undefined).then(() => {
                if (window.showToast) window.showToast("Attestation enregistrée.", "success");
                chargerEncart(documentId);
                // Le bloc du tableau de bord compte ce qui reste à lire : il
                // devient faux à l'instant même. On le rafraîchit s'il est là.
                if (document.getElementById(ID_BLOC)) monterBloc();
            }).catch(e => {
                bouton.disabled = false;
                bouton.textContent = "J'atteste avoir lu ce document";
                const message = (e && e.message) || "L'attestation n'a pas pu être enregistrée.";
                if (window.showToast) window.showToast(message, "error");
            });
        });
    }

    /* =====================================================================
       LE BLOC DU TABLEAU DE BORD — « Politiques à lire »
    ===================================================================== */

    /** Le conteneur, à insérer dans le gabarit du tableau de bord. */
    function blocHtml() {
        if (!peutLire(DOMAINE)) return "";
        return '<div class="dashboard-card" id="' + ID_BLOC + '">'
            +  "<h2>Politiques à lire"
            +  (typeof Help !== "undefined" ? Help.tip(
                   "Les politiques en vigueur qui exigent une attestation de lecture et que "
                   + "vous n'avez pas encore attestée — ou que vous avez attestée dans une "
                   + "version qui n'est plus celle qui fait foi.") : "")
            +  "</h2>"
            +  '<div id="' + ID_BLOC + 'Corps"><p class="chart-empty">'
            +  esc("Lecture…") + "</p></div></div>";
    }

    /** Charge le bloc. Sans effet si son conteneur n'est pas dans le DOM. */
    function monterBloc() {
        const corps = document.getElementById(ID_BLOC + "Corps");
        if (!corps) return;
        Api.attestationsAFaire().then(charge => {
            corps.innerHTML = corpsBlocHtml(charge);
            corps.querySelectorAll(".att-a-faire-item").forEach(li => {
                li.addEventListener("click", () => {
                    // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC
                    // (`CLAUDE.md` §3), jamais capturé en fermeture.
                    Router.navigateTo("/documents/" + li.dataset.id);
                });
            });
        }).catch(() => {
            corps.innerHTML = '<p class="chart-empty">'
                + esc("La liste des politiques à lire n'a pas pu être obtenue.") + "</p>";
        });
    }

    /** Le corps du bloc — exposé pour le banc, qui le compose sans réseau. */
    function corpsBlocHtml(charge) {
        // Un compte sans fiche d'annuaire : le serveur DIT pourquoi, on le
        // recopie tel quel plutôt que d'afficher une liste vide.
        if (charge && charge.personne === null) {
            return '<p class="chart-empty">' + esc(charge.motif || "") + "</p>";
        }
        const liste = (charge && charge.aFaire) || [];
        if (liste.length === 0) {
            return '<p class="chart-empty">'
                + esc("Vous êtes à jour : aucune politique en vigueur n'attend votre "
                    + "attestation de lecture.") + "</p>";
        }
        let html = '<ul class="dash-list att-a-faire">';
        liste.forEach(d => {
            const perime = d.motif === "version_perimee";
            html += '<li class="att-a-faire-item" data-id="' + esc(d.id) + '">'
                 +  '<span class="att-a-faire-titre">' + esc(d.titre) + "</span>"
                 +  '<span class="att-a-faire-meta">'
                 +  (perime
                        ? '<span class="status ' + CLASSE_TON.warn + '">' + esc("Révisée") + "</span> "
                          + esc("lue en " + (d.versionAttestee || "?")
                                + ", en vigueur : " + (d.version || "—"))
                        : '<span class="status ' + CLASSE_TON.crit + '">' + esc("Jamais lue") + "</span> "
                          + esc(d.version ? "version " + d.version : "sans version"))
                 +  "</span></li>";
        });
        html += "</ul>";
        return html;
    }

    return {
        encartHtml: encartHtml,
        brancherEncart: brancherEncart,
        blocHtml: blocHtml,
        monterBloc: monterBloc,

        // ── Exposés pour le banc ────────────────────────────────────────────
        // Le banc compose ces deux corps depuis une charge fabriquée : c'est
        // ainsi qu'on éprouve ce que l'écran DIT sans monter un serveur, et
        // c'est ce que le constat Q-335 réclame — *l'écran doit distinguer
        // « rien à montrer » de « on vous le cache »*.
        corpsEncartHtml: corpsEncartHtml,
        corpsBlocHtml: corpsBlocHtml,
        tonCouverture: tonCouverture
    };
})();
