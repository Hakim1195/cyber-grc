/**
 * maincourante.js — **la main courante de crise, à l'écran** (action 20.5)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Ce que cet écran offre, et ce qu'il n'offre PAS
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il offre **d'ajouter**, et rien d'autre. Pas de bouton « modifier », pas de
 * bouton « supprimer » — et ce n'est pas un oubli : une main courante rééditable
 * ne prouve rien. Une correction s'**ajoute**, elle ne remplace pas.
 *
 * ⚠️ **L'absence de ces boutons n'est pas la garantie.** La garantie vit dans la
 * base — quatre couches, `CONVENTIONS.md` §12 : privilèges retirés au rôle
 * applicatif, déclencheurs de refus par instruction, armement `always`,
 * propriétaire distinct. L'écran s'y conforme ; il ne la porte pas. C'est la
 * distinction que le §17.5 impose de dire plutôt que de laisser croire.
 *
 * ── ⚠️ CE QUE LE VERDICT DE CHAÎNE DIT, ET CE QU'IL NE DIT PAS ─────────────
 *
 * Le serveur rend `sain`. Cela signifie *« rien de ce qui se détecte n'a eu
 * lieu »*, **pas** *« personne n'a rien touché »* : `root` sur la machine et le
 * propriétaire de la base peuvent désactiver un déclencheur. Le chaînage ne les
 * empêche pas — il rend leur passage **détectable**. L'écran l'écrit.
 */

const MainCouranteModule = (() => {
    "use strict";

    const ID_ENCART = "mainCouranteEncart";
    const DOMAINE = "continuite";

    /** Le vocabulaire fermé de `ck_main_courante_categorie` (migration `041`). */
    const CATEGORIES = Object.freeze([
        { valeur: "constat", libelle: "Constat" },
        { valeur: "decision", libelle: "Décision" },
        { valeur: "action", libelle: "Action" },
        { valeur: "communication", libelle: "Communication" },
        { valeur: "escalade", libelle: "Escalade" },
        { valeur: "cloture", libelle: "Clôture" }
    ]);

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function peutLire(d) {
        return !(window.Droits && typeof Droits.peutLire === "function") || Droits.peutLire(d);
    }
    function peutEcrire(d) {
        return !(window.Droits && typeof Droits.peutEcrire === "function") || Droits.peutEcrire(d);
    }

    /** L'horodatage, à la minute — une main courante se lit à l'heure près. */
    function fmtHeure(iso) {
        if (!iso) return "—";
        const d = new Date(String(iso));
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleString("fr-FR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    function libelleCategorie(valeur) {
        const t = CATEGORIES.find(c => c.valeur === String(valeur));
        return t ? t.libelle : String(valeur || "—");
    }

    /* =====================================================================
       L'ENCART DE LA FICHE INCIDENT
    ===================================================================== */

    function encartHtml(incidentId) {
        if (!incidentId) return "";
        if (!peutLire(DOMAINE)) return "";
        return ''
            + '<div class="card mc-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(incidentId) + '">'
            +   "<h2>Main courante de crise"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "Le récit horodaté de la crise : ce qui a été constaté, décidé, fait, et "
                    + "à quelle heure. C'est la pièce centrale du retour d'expérience, et "
                    + "celle qu'un assureur, un client ou l'ANSSI demandent après. Elle est "
                    + "EN AJOUT SEUL : une entrée ne se corrige pas — on en ajoute une qui "
                    + "décrit la correction. Une main courante rééditable ne prouve rien.")
                : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"><p class="chart-empty">'
            +   esc("Lecture de la main courante…") + "</p></div>"
            + "</div>";
    }

    /**
     * Charge et branche l'encart, une fois le gabarit posé dans le DOM.
     *
     * ⚠️ L'identifiant est relu dans l'attribut du conteneur, et le DOM GAGNE sur
     * l'argument (`CLAUDE.md` §3, constat Q-303) : le serveur réattribue les
     * identifiants à la création.
     */
    function brancherEncart(incidentId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const id = noeud.dataset.id || incidentId;
        if (!id) return;
        if (typeof Sync !== "undefined" && typeof Sync.serveurConnait === "function"
            && !Sync.serveurConnait("incidents", id)) {
            ecrireCorps('<p class="chart-empty">'
                + esc("Incident en cours d’envoi — la main courante s’ouvrira dès que le "
                    + "serveur l’aura pris.") + "</p>");
            return;
        }
        charger(id);
    }

    function ecrireCorps(html) {
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (corps) corps.innerHTML = html;
    }

    function charger(incidentId) {
        return Api.mainCourante(incidentId).then(charge => {
            ecrireCorps(corpsHtml(charge, incidentId));
            brancherFormulaire(incidentId);
        }).catch(e => {
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter la main courante."
                : ((e && e.message) || "La main courante n’a pas pu être lue.");
            ecrireCorps('<p class="chart-empty">' + esc(message) + "</p>");
        });
    }

    /** Le corps de l'encart — exposé pour le banc, qui le compose sans réseau. */
    function corpsHtml(charge, incidentId) {
        const entrees = (charge && charge.entrees) || [];
        const anomalies = (charge && charge.anomalies) || [];
        let html = "";

        // ── LE VERDICT DE CHAÎNE, EN PREMIER ──────────────────────────────
        //
        // ⚠️ Il est affiché MÊME QUAND TOUT VA BIEN, et c'est délibéré : un
        // indicateur qui n'apparaît qu'en cas de problème n'apprend à personne
        // qu'il existe — et le jour où il apparaît, on ne sait pas s'il est
        // fiable. Celui-ci dit aussi ce qu'il NE prouve pas.
        if (anomalies.length === 0) {
            html += '<p class="mc-verdict mc-verdict--sain">'
                + '<span class="status status-conforme">Chaîne intacte</span> '
                + esc("Chaque entrée porte l’empreinte de la précédente : retirer ou retoucher "
                    + "une ligne se verrait. Cela ne dit pas que personne n’a rien touché — "
                    + "l’administrateur de la base le peut — mais que rien de ce qui se détecte "
                    + "n’a eu lieu.")
                + "</p>";
        } else {
            html += '<div class="mc-verdict mc-verdict--rompu" role="alert">'
                + '<span class="status status-critique">Chaîne rompue</span> '
                + "<strong>" + esc(anomalies.length) + " anomalie(s).</strong> "
                + esc("Le récit de cette crise a été modifié après coup, ou une entrée en a été "
                    + "retirée. Cette main courante ne peut plus être produite comme preuve en "
                    + "l’état.")
                + "<ul>"
                + anomalies.map(a => "<li><strong>n° " + esc(a.numero) + " — "
                    + esc(a.anomalie) + "</strong> : " + esc(a.detail) + "</li>").join("")
                + "</ul></div>";
        }

        if (!entrees.length) {
            html += '<p class="chart-empty">Aucune entrée. La main courante s’ouvre au premier '
                + "constat, et ne se referme pas.</p>";
        } else {
            html += '<ol class="mc-liste">';
            for (const e of entrees) {
                html += '<li class="mc-entree" data-numero="' + esc(e.numero) + '">'
                    + '<div class="mc-entete">'
                    +   '<span class="mc-heure">' + esc(fmtHeure(e.horodatage)) + "</span>"
                    +   '<span class="status status-na mc-categorie">'
                    +     esc(libelleCategorie(e.categorie)) + "</span>"
                    +   '<span class="mc-auteur">' + esc(e.auteurLibelle || e.auteur) + "</span>"
                    + "</div>"
                    + '<div class="mc-texte">' + esc(e.texte) + "</div>"
                    + "</li>";
            }
            html += "</ol>";
        }

        if (charge && charge.tronque) {
            html += '<p class="mc-note">La main courante est tronquée : elle porte plus '
                + "d’entrées que cet écran n’en affiche en une fois.</p>";
        }
        if (peutEcrire(DOMAINE)) html += formulaireHtml(incidentId);
        return html;
    }

    /**
     * Le formulaire d'ajout.
     *
     * ⚠️ **Aucun champ d'heure.** L'horodatage vient du serveur, à l'instant de
     * l'écriture : le laisser saisir permettrait d'antidater une décision, ce qui
     * est exactement ce contre quoi une main courante existe.
     */
    function formulaireHtml(incidentId) {
        return ''
            + '<form class="mc-form" id="mcForm" data-id="' + esc(incidentId) + '">'
            +   '<div class="mc-form-ligne">'
            +     '<label for="mcCategorie">Nature</label>'
            +     '<select id="mcCategorie">'
            +       CATEGORIES.map(c => '<option value="' + esc(c.valeur) + '">'
                        + esc(c.libelle) + "</option>").join("")
            +     "</select>"
            +   "</div>"
            +   '<div class="mc-form-ligne mc-form-large">'
            +     '<label for="mcTexte">Ce qui a été constaté, décidé ou fait</label>'
            +     '<textarea id="mcTexte" rows="2" maxlength="8000" '
            +       'placeholder="Ex. : prévenu le RSSI groupe par téléphone."></textarea>'
            +   "</div>"
            +   '<p class="mc-avertissement">L’heure est posée par le <strong>serveur</strong>, '
            +   "à l’instant de l’écriture — elle ne se saisit pas. Et une entrée ajoutée "
            +   "<strong>ne se modifie plus</strong> : pour corriger, ajoutez-en une qui le dit."
            +   "</p>"
            +   '<button type="submit" class="btn-accent">Ajouter à la main courante</button>'
            + "</form>";
    }

    function brancherFormulaire(incidentId) {
        const form = document.getElementById("mcForm");
        if (!form) return;
        form.addEventListener("submit", (evenement) => {
            evenement.preventDefault();
            // Relus dans le DOM au moment de l'envoi, jamais capturés.
            const id = form.dataset.id || incidentId;
            const texte = ((document.getElementById("mcTexte") || {}).value || "").trim();
            const categorie = (document.getElementById("mcCategorie") || {}).value || "constat";
            if (!texte) {
                if (window.showToast) {
                    window.showToast("Une entrée de main courante porte un texte : ce qui a été "
                        + "constaté, décidé ou fait.", "error");
                }
                return;
            }
            // ⚠️ L'écriture passe par `Api`, PAS par `DataStore` : la main courante
            // ne fait pas partie de l'instantané, comme le journal d'audit. La
            // faire voyager dans `grc-backup` ferait passer une chaîne d'empreintes
            // par un fichier que l'utilisateur peut éditer — et la réimporter la
            // referait, ce qui lui ôterait sa valeur.
            Api.ajouterMainCourante(id, texte, categorie).then(() => {
                if (window.showToast) {
                    window.showToast("Entrée ajoutée. Elle ne peut plus être modifiée.", "success");
                }
                charger(id);
            }).catch(e => {
                if (window.showToast) {
                    window.showToast((e && e.message) || "L’entrée n’a pas pu être ajoutée.",
                        "error");
                }
            });
        });
    }

    return {
        encartHtml, brancherEncart,
        // Purement fonctionnel : il compose sans réseau, et le banc le joue.
        corpsHtml,
        contrat: Object.freeze({
            hote: ID_ENCART,
            domaine: DOMAINE,
            categories: CATEGORIES.map(c => c.valeur)
        })
    };
})();

window.MainCouranteModule = MainCouranteModule;
