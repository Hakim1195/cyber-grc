// Emplacement : js/modules/derogations.js
// Nom du fichier : derogations.js
//
// Panneau « Dérogations » — lot L19, action 19.2.
//
// ── Ce que ce fichier est, et ce qu'il n'est pas ────────────────────────────
//
// Ce n'est **pas un écran**, c'est un panneau — comme `pieces.js`,
// `approbations.js` et `attestations.js`. Une dérogation n'a pas d'existence
// propre : elle est l'écart assumé d'une exigence, et elle se lit à côté de
// cette exigence. Ni route, ni entrée de menu, ni domaine de droits à elle.
//
// ── ⚠️ L'ÉTAT VIENT DU SERVEUR, ET IL N'EST JAMAIS RECALCULÉ ICI ────────────
//
// « En vigueur », « échue », « en attente », « refusée » sont rendus par
// `GET /api/derogations/etat`, qui les tient de `f_etat_derogation()` — le seul
// endroit du produit où une échéance est comparée à la date du jour.
//
// La tentation d'écrire `new Date(d.echeance) < new Date()` ici est exactement
// ce que le critère 19.2 proscrit, et elle serait **fausse** en plus d'être
// redondante : l'horloge du poste n'est pas celle du serveur, et un écart de
// quelques heures fait basculer un état la veille ou le lendemain de sa date.
//
// ⚠️ Il y a plus subtil, et c'est ce qui rend la règle non négociable :
// l'échéance ne suffit pas. Une dérogation dont on vient de repousser la date
// **sans la faire réapprouver** a un circuit PÉRIMÉ, et elle ne couvre rien —
// le serveur le sait parce qu'il compare l'empreinte de l'objet à celle qu'a
// figée la décision. Aucun calcul de date, ici, ne pourrait le voir.
//
// ── CE QUE LE PANNEAU DOIT DIRE ─────────────────────────────────────────────
//
// Quatre états se ressemblent à l'écran et n'appellent pas la même réaction :
//
//   · **en vigueur** — l'écart est couvert, et jusqu'à telle date ;
//   · **en attente** — elle est saisie, pas accordée : l'écart est DÉCOUVERT.
//     C'est le cas le plus dangereux à confondre, parce que la fiche existe et
//     qu'on la croit acquise ;
//   · **échue** — elle a couvert, elle ne couvre plus. L'exigence est redevenue
//     une non-conformité pleine et entière, sans que personne n'ait rien fait ;
//   · **refusée** — elle n'a jamais couvert.
//
// Les afficher toutes sous un même mot serait la classe des constats Q-201 /
// Q-207 : *un écran qui ne distingue pas apprend à ne plus le croire.*

const DerogationsModule = (() => {
    "use strict";

    const ID_ENCART = "derogationsEncart";

    /** Le domaine de droits dont ce panneau dépend — celui de la fiche qui le porte. */
    const DOMAINE = "conformite";

    /**
     * Les quatre classes de badge du produit, et rien d'autre.
     *
     * ⚠️ On ne crée PAS de teinte ici. `.status-conforme` et ses trois sœurs sont
     * le vocabulaire visuel du produit depuis le premier chantier — vert =
     * conforme, orange = partiel, rouge = critique, gris = non applicable
     * (`CLAUDE.md` §2, sémantique stricte). Un cinquième jeu affaiblirait les
     * quatre qui existent.
     */
    const CLASSE_TON = Object.freeze({
        ok:   "status-conforme",
        warn: "status-partiellement-conforme",
        crit: "status-non-conforme",
        na:   "status-non-applicable"
    });

    /**
     * Ce que chaque état veut dire **pour l'utilisateur**, et de quel ton.
     *
     * ── Une liste écrite à la main, et pourquoi c'est le bon outil ici ──────
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Un état absent de
     * cette table s'affiche **tel qu'il vient du serveur**, échappé, avec le ton
     * neutre : rien ne disparaît, le mot inconnu se lit en clair, et quelqu'un
     * doit décider. L'omission échoue donc du bon côté — celui qui montre.
     *
     * ⚠️ **Et « en_attente » est en ROUGE**, ce qui surprend : c'est le seul ton
     * juste. Une dérogation saisie mais non accordée laisse l'écart entièrement
     * découvert, exactement comme s'il n'y avait pas de dérogation du tout. La
     * peindre en orange laisserait croire à une couverture partielle, et c'est
     * précisément le malentendu qui fait qu'un écart traîne un an.
     */
    const ETATS = Object.freeze({
        en_vigueur: { libelle: "En vigueur",  ton: "ok",
                      dit: "L'écart est couvert jusqu'à cette date." },
        echue:      { libelle: "Échue",       ton: "warn",
                      dit: "L'échéance est passée : l'exigence est redevenue une "
                           + "non-conformité, sans que personne ait eu à intervenir." },
        en_attente: { libelle: "Non accordée", ton: "crit",
                      dit: "Elle est saisie, pas approuvée : l'écart n'est PAS couvert. "
                           + "Le circuit d'approbation doit aller à son terme." },
        refusee:    { libelle: "Refusée",     ton: "crit",
                      dit: "Le circuit l'a refusée : l'écart n'a jamais été couvert." }
    });

    /** Ce que l'état d'un circuit ajoute — et qu'aucune date ne dirait. */
    const CIRCUITS = Object.freeze({
        en_cours: "en cours",
        complet:  "approuvé",
        refuse:   "refusé",
        perime:   "périmé — la dérogation a changé depuis la décision"
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

    function peutEcrire(domaine) {
        if (typeof Droits === "undefined" || !Droits.connus()) return true;
        const ordre = Api.CONTRAT_AUTH.niveaux;
        const rang = (n) => { const i = ordre.indexOf(n); return i === -1 ? 0 : i + 1; };
        if (!Droits.peutLire(domaine)) return false;
        return rang(Droits.niveauEffectif(domaine)) >= rang("contribution");
    }

    /** Une date ISO courte (`2026-12-31`) en date lisible. Jamais un calcul. */
    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(String(iso) + (String(iso).length === 10 ? "T00:00:00" : ""));
        if (isNaN(d.getTime())) return String(iso);
        return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    function etatDe(code) {
        return ETATS[code] || { libelle: String(code || "—"), ton: "na", dit: "" };
    }

    /* =====================================================================
       LE PANNEAU DE LA FICHE EXIGENCE
    ===================================================================== */

    /** Le bloc à insérer dans le gabarit de la fiche Exigence. */
    function encartHtml(exigenceId) {
        if (!exigenceId) return "";
        if (!peutLire(DOMAINE)) return "";
        return ''
            + '<div class="card der-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(exigenceId) + '">'
            +   "<h2>Dérogations"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "Un écart de conformité ASSUMÉ, borné dans le temps. Quatre pièces "
                    + "indissociables : qui en répond, pourquoi, jusqu'à quand, et une "
                    + "approbation. Une dérogation ne rend pas l'exigence conforme — elle "
                    + "dit que l'organisation en répond jusqu'à une date. Passée cette date, "
                    + "l'écart redevient une non-conformité tout seul.") : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"><p class="chart-empty">'
            +   esc("Lecture des dérogations…") + "</p></div>"
            + "</div>";
    }

    /**
     * Charge et branche le panneau, une fois le gabarit posé dans le DOM.
     *
     * ⚠️ L'identifiant est relu dans l'attribut du conteneur, et le DOM GAGNE sur
     * l'argument (`CLAUDE.md` §3, constat Q-303) : le serveur réattribue les
     * identifiants à la création.
     */
    function brancherEncart(exigenceId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const id = noeud.dataset.id || exigenceId;
        if (!id) return;
        // Une autre fiche : le circuit déplié sur la précédente n'a plus de sens.
        circuitDeplie = null;
        if (typeof Sync !== "undefined" && typeof Sync.serveurConnait === "function"
            && !Sync.serveurConnait("exigences", id)) {
            ecrireCorps('<p class="chart-empty">'
                + esc("Exigence en cours d'envoi — les dérogations s'afficheront dès que le "
                    + "serveur l'aura prise.") + "</p>");
            return;
        }
        charger(id);
    }

    function ecrireCorps(html) {
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (corps) corps.innerHTML = html;
    }

    /**
     * Le circuit actuellement déplié, s'il y en a un.
     *
     * ⚠️ **Il survit au rechargement du panneau, et c'est une correction.** Une
     * décision d'approbation redemande l'état au serveur — elle le doit, puisque
     * l'état se dérive —, ce qui réécrit le tableau et referme le circuit qu'on
     * venait d'ouvrir. Un circuit de dérogation en compte DEUX : l'utilisateur
     * approuvait « proposition », l'écran se refermait sous ses doigts, et il
     * fallait rouvrir pour « acceptation ». *Une action juste qui défait le
     * contexte de celui qui l'a faite se paie en clics et en doutes.*
     */
    let circuitDeplie = null;

    function charger(exigenceId) {
        return Api.derogationsEtat().then(charge => {
            ecrireCorps(corpsHtml(charge, exigenceId));
            brancherFormulaire(exigenceId);
            brancherCircuits();
            rouvrirCircuit();
        }).catch(e => {
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter les dérogations."
                : ((e && e.message) || "Les dérogations n'ont pas pu être lues.");
            ecrireCorps('<p class="chart-empty">' + esc(message) + "</p>");
        });
    }

    /** Le corps du panneau — exposé pour le banc, qui le compose sans réseau. */
    function corpsHtml(charge, exigenceId) {
        const toutes = (charge && charge.derogations) || [];
        const miennes = toutes.filter(d => String(d.exigenceId) === String(exigenceId));

        let html = "";

        // ── Ce qui compte en premier : l'écart est-il couvert, oui ou non ? ──
        //
        // ⚠️ La question se pose même quand il n'y a AUCUNE dérogation, et c'est
        // pour cela que le bandeau est au-dessus de la liste et non dedans.
        const enVigueur = miennes.filter(d => d.etat === "en_vigueur");
        if (enVigueur.length > 0) {
            // La plus lointaine gouverne : deux dérogations qui se chevauchent
            // couvrent jusqu'à la dernière des deux. Voir la migration `035` §1.
            const gouverne = enVigueur.reduce(
                (a, b) => (String(b.echeance) > String(a.echeance) ? b : a));
            html += '<div class="der-bandeau der-bandeau--couvert">'
                 +  '<strong>' + esc("Écart couvert jusqu'au " + fmtDate(gouverne.echeance))
                 +  "</strong> "
                 +  esc("— " + gouverne.proprietaire + " en répond."
                        + (enVigueur.length > 1
                            ? " (" + enVigueur.length + " dérogations se chevauchent ; c'est la "
                              + "plus lointaine qui gouverne.)"
                            : ""))
                 +  "</div>";
        } else if (miennes.length > 0) {
            html += '<div class="der-bandeau der-bandeau--decouvert">'
                 +  "<strong>" + esc("Écart NON couvert.") + "</strong> "
                 +  esc("Cette exigence porte des dérogations, mais aucune n'est en vigueur : "
                      + "l'écart compte pleinement dans le taux de conformité.")
                 +  "</div>";
        }

        if (miennes.length === 0) {
            html += '<p class="chart-empty">'
                 +  esc("Aucune dérogation sur cette exigence. Une dérogation sert à assumer "
                      + "un écart pour une durée bornée, quand la remise en conformité ne "
                      + "peut pas être immédiate.")
                 +  "</p>";
        } else {
            html += '<div class="table-scroll"><table class="data-table der-table">'
                 +  "<thead><tr><th>État</th><th class=\"num\">Échéance</th>"
                 +  "<th>Propriétaire</th><th>Motif</th><th>Circuit</th>"
                 +  "<th class=\"no-print\"></th></tr></thead><tbody>";
            // Les plus lointaines d'abord : c'est l'ordre du serveur, on ne le
            // refait pas — deux tris de la même liste finissent par différer.
            miennes.forEach(d => {
                const e = etatDe(d.etat);
                html += '<tr class="der-ligne der-ligne--' + esc(e.ton) + '">'
                     +  '<td><span class="status ' + CLASSE_TON[e.ton] + '">'
                     +      esc(e.libelle) + "</span></td>"
                     +  '<td class="num">' + esc(fmtDate(d.echeance)) + "</td>"
                     +  "<td>" + esc(d.proprietaire) + "</td>"
                     +  '<td class="der-motif">' + esc(d.motif)
                     +      (d.compensation
                            ? '<span class="der-compensation">'
                              + esc("En attendant : " + d.compensation) + "</span>"
                            : "")
                     +  "</td>"
                     +  "<td>" + esc(CIRCUITS[d.circuit] || d.circuit) + "</td>"
                     +  '<td class="no-print"><button type="button" class="der-circuit-btn" '
                     +      'data-id="' + esc(d.id) + '">' + esc("Circuit") + "</button></td>"
                     +  "</tr>"
                     +  '<tr class="der-circuit-ligne" data-pour="' + esc(d.id) + '" hidden>'
                     +      '<td colspan="6"><div class="der-circuit-hote" '
                     +      'id="derCircuit-' + esc(d.id) + '"></div></td></tr>';
            });
            html += "</tbody></table></div>";
            // Ce que l'état veut dire. Une ligne par état PRÉSENT — pas un
            // glossaire complet, qui se lirait comme un avertissement général.
            const vus = [];
            miennes.forEach(d => { if (vus.indexOf(d.etat) === -1) vus.push(d.etat); });
            html += '<ul class="der-legende">';
            vus.forEach(code => {
                const e = etatDe(code);
                if (!e.dit) return;
                html += "<li><strong>" + esc(e.libelle) + "</strong> — " + esc(e.dit) + "</li>";
            });
            html += "</ul>";
        }

        html += formulaireHtml(exigenceId);
        return html;
    }

    /** Le formulaire d'ouverture — absent si le profil ne peut pas écrire. */
    function formulaireHtml(exigenceId) {
        if (!peutEcrire(DOMAINE)) return "";
        return ''
            + '<div class="der-demande no-print">'
            +   '<strong class="der-demande-titre">' + esc("Demander une dérogation") + "</strong>"
            +   '<div class="der-demande-grille">'
            +     '<label for="derProprietaire">' + esc("Qui en répond") + "</label>"
            +     '<input type="text" id="derProprietaire" list="personnes-list" '
            +       'maxlength="200" autocomplete="off" placeholder="'
            +       esc("Nom ou fonction") + '">'
            +     '<label for="derEcheance">' + esc("Jusqu’au") + "</label>"
            +     '<input type="date" id="derEcheance">'
            +     '<label for="derMotif">' + esc("Pourquoi l’écart est assumé") + "</label>"
            +     '<textarea id="derMotif" maxlength="4000" rows="2" placeholder="'
            +       esc("Ex. : l'automate du fournisseur exige ce compte partagé jusqu'au "
                       + "renouvellement de la ligne, prévu en mars.") + '"></textarea>'
            +     '<label for="derCompensation">' + esc("Ce qui est fait en attendant")
            +       ' <span class="der-facultatif">' + esc("(facultatif)") + "</span></label>"
            +     '<textarea id="derCompensation" maxlength="4000" rows="2" placeholder="'
            +       esc("Ex. : surveillance renforcée des connexions de ce compte.")
            +       '"></textarea>'
            +   "</div>"
            +   '<button type="button" id="derCreerBtn">' + esc("Créer la dérogation") + "</button>"
            +   '<p class="der-mention">'
            +   esc("Elle ne couvrira rien tant que le circuit d'approbation ne l'aura pas "
                  + "acceptée : proposition, puis acceptation. C'est la même barrière que "
                  + "pour l'acceptation d'un risque résiduel.")
            +   "</p>"
            + "</div>";
    }

    function brancherFormulaire(exigenceId) {
        const bouton = document.getElementById("derCreerBtn");
        if (!bouton) return;
        bouton.addEventListener("click", () => {
            const proprietaire = (document.getElementById("derProprietaire") || {}).value || "";
            const echeance = (document.getElementById("derEcheance") || {}).value || "";
            const motif = (document.getElementById("derMotif") || {}).value || "";
            const compensation = (document.getElementById("derCompensation") || {}).value || "";

            // ⚠️ Les trois champs obligatoires sont exigés ICI **et** par la base
            // (`ck_derogations_motif`, `ck_derogations_proprietaire`, la colonne
            // `echeance not null`). Ce contrôle-ci est une courtoisie qui évite
            // l'aller-retour ; ce n'est pas lui la barrière, et il ne doit pas
            // être pris pour elle — l'import et la reprise ne passent pas par là.
            const manque = [];
            if (!proprietaire.trim()) manque.push("qui en répond");
            if (!motif.trim()) manque.push("le motif");
            if (!echeance) manque.push("l'échéance");
            if (manque.length > 0) {
                if (window.showToast) {
                    window.showToast("Une dérogation n'en est une que si elle porte " +
                        manque.join(", ") + ".", "error");
                }
                return;
            }

            const d = {
                id: UI.genId("DER"),
                exigence_id: exigenceId,
                proprietaire: proprietaire.trim(),
                motif: motif.trim(),
                // `accordee_le` est posée par la base (défaut `current_date`) : la
                // proposer d'ici permettrait d'antidater un écart assumé.
                echeance: echeance,
                compensation: compensation.trim(),
                updatedAt: Date.now()
            };
            DataStore.addDerogation(d);
            if (window.showToast) {
                window.showToast("Dérogation créée. Elle ne couvre rien tant que le circuit "
                    + "ne l'a pas acceptée.", "success");
            }
            // On relit le serveur : l'état est le sien, et il vient d'y en avoir
            // un de plus. Recomposer l'écran depuis `data` afficherait une
            // dérogation SANS état, c'est-à-dire l'inverse de ce que le panneau dit.
            //
            // ⚠️ **Mais on attend d'abord que le serveur SACHE.** `addDerogation()`
            // n'écrit qu'en mémoire ; relire immédiatement interroge un serveur qui
            // n'a encore rien reçu, et le panneau affiche « aucune dérogation »
            // juste après en avoir créé une. Invisible au banc — le serveur y
            // répond dans la même milliseconde —, mesuré sur la recette à travers
            // Apache et TLS (voir `UI.apresEcriture`).
            UI.apresEcriture(() => charger(exigenceId));
        });
    }

    /** La ligne dépliable d'un circuit, désignée par l'identifiant de sa dérogation. */
    function ligneCircuit(id) {
        if (!id) return null;
        return document.querySelector('.der-circuit-ligne[data-pour="'
            + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    }

    /** Déplie le circuit d'une dérogation et y monte l'encart d'approbation. */
    function deplier(id) {
        const ligne = ligneCircuit(id);
        if (!ligne) return;
        // ⚠️ `el.hidden`, jamais `style.display` : une règle de classe écrase le
        // `[hidden]` du navigateur, et c'est le défaut qui a fait qu'une palette
        // « ne se fermait pas » alors que l'essai mesurait la propriété au lieu
        // de la visibilité (16/09/2026).
        ligne.hidden = false;
        circuitDeplie = id;
        const hote = document.getElementById("derCircuit-" + id);
        if (hote && typeof ApprobationsModule !== "undefined") {
            ApprobationsModule.monterDans(hote, "derogations", id);
        }
    }

    /** Le circuit d'approbation d'une dérogation, déplié en place. */
    function brancherCircuits() {
        document.querySelectorAll(".der-circuit-btn").forEach(bouton => {
            bouton.addEventListener("click", () => {
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC
                // (`CLAUDE.md` §3), jamais capturé en fermeture.
                const id = bouton.dataset.id;
                const ligne = ligneCircuit(id);
                if (!ligne) return;
                if (!ligne.hidden) { ligne.hidden = true; circuitDeplie = null; return; }
                deplier(id);
            });
        });
    }

    /**
     * Rouvre, après un rechargement, le circuit que l'utilisateur avait déplié.
     *
     * Sans effet si la dérogation a disparu de la liste — auquel cas on oublie :
     * rouvrir un circuit sur une ligne absente n'aurait aucun sens, et laisser
     * l'identifiant traîner ferait resurgir le panneau à la fiche suivante.
     */
    function rouvrirCircuit() {
        if (circuitDeplie === null) return;
        if (ligneCircuit(circuitDeplie) === null) { circuitDeplie = null; return; }
        deplier(circuitDeplie);
    }

    /* =====================================================================
       LA DÉCORATION DE LA LISTE DES EXIGENCES
    ===================================================================== */

    /**
     * Pose un badge « couvert jusqu'au … » sur les lignes de la liste.
     *
     * ⚠️ **Elle décore APRÈS coup, et c'est délibéré.** La liste des exigences
     * est rendue depuis `data`, en synchrone ; l'état des dérogations vient du
     * serveur. Attendre le second pour afficher la première retarderait tout
     * l'écran pour une information marginale — et un écran qui se fait attendre
     * est un écran qu'on n'ouvre plus.
     *
     * Le badge se pose donc dans un second temps, sur les lignes qui portent
     * `data-id`. Si la lecture échoue, l'écran reste **exactement** ce qu'il
     * était : la décoration est un ajout, jamais une condition.
     */
    function decorerListe() {
        if (!peutLire(DOMAINE)) return Promise.resolve();
        if (document.querySelectorAll("tr.clickable-row[data-id]").length === 0) {
            return Promise.resolve();
        }
        return Api.derogationsEtat().then(charge => {
            poserBadges(charge);
        }).catch(() => { /* Une décoration absente n'est pas une panne. */ });
    }

    /** Pose les badges depuis une charge — exposé pour le banc. */
    function poserBadges(charge) {
        const parExigence = new Map();
        ((charge && charge.derogations) || []).forEach(d => {
            if (d.etat !== "en_vigueur") return;
            const vu = parExigence.get(d.exigenceId);
            if (!vu || String(d.echeance) > String(vu.echeance)) parExigence.set(d.exigenceId, d);
        });
        // ⚠️ La cellule cible est DÉSIGNÉE par l'écran (`data-badges`), jamais
        // devinée. La première rédaction prenait `ligne.querySelector("td")` —
        // c'est-à-dire la cellule de la CASE À COCHER, dont la largeur est fixée
        // à 40 px : le badge y aurait disloqué la colonne de sélection de toutes
        // les listes qui l'emploient. Deviner une place dans un balisage qu'on ne
        // possède pas, c'est se rendre dépendant de son ordre.
        document.querySelectorAll("tr.clickable-row[data-id]").forEach(ligne => {
            const d = parExigence.get(ligne.dataset.id);
            if (!d) return;
            const cellule = ligne.querySelector("td[data-badges]");
            if (!cellule || cellule.querySelector(".der-badge")) return;
            const badge = document.createElement("span");
            badge.className = "der-badge";
            // `textContent` : le contenu vient de la base, et il ne traverse
            // jamais `innerHTML` — même par un chemin qui paraît sûr.
            badge.textContent = "Dérogation jusqu'au " + fmtDate(d.echeance);
            badge.title = "Écart assumé — " + d.proprietaire + " en répond.";
            cellule.appendChild(badge);
        });
    }

    /* ══ SE RELIRE QUAND UNE DÉCISION VIENT D'ÊTRE PRISE ICI MÊME ══════════
     *
     * ⚠️ **Sans cela, le panneau ment juste après le geste.** L'encart
     * d'approbation, monté à l'intérieur d'une de ces lignes, se redessine
     * lui-même sur ce que le serveur vient de rendre — mais le bandeau et la
     * colonne « État », eux, datent de la lecture précédente. Mesuré dans
     * Chromium sur la recette : la dérogation venait d'être ACCEPTÉE, et le
     * bandeau disait encore « Écart NON couvert ».
     *
     * L'état d'une dérogation ne se déduit pas de la décision seule — il se
     * DÉRIVE, côté serveur, de l'échéance ET de l'empreinte figée. On ne le
     * recalcule donc pas ici : on redemande.
     *
     * L'écoute est posée UNE FOIS, au chargement du module, et jamais dans
     * `brancherEncart` — un écouteur par affichage de fiche en empilerait un à
     * chaque navigation (même motif que `approbations.js` pour le recalage
     * d'identifiant). */
    document.addEventListener("grc:approbation-decidee", function (evenement) {
        const detail = (evenement && evenement.detail) || {};
        if (detail.entite !== "derogations") return;
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud || !noeud.dataset.id) return;
        charger(noeud.dataset.id);
    });

    return {
        encartHtml: encartHtml,
        brancherEncart: brancherEncart,
        decorerListe: decorerListe,

        // ── Exposés pour le banc ────────────────────────────────────────────
        corpsHtml: corpsHtml,
        poserBadges: poserBadges,
        contrat: Object.freeze({ etats: Object.keys(ETATS), circuits: Object.keys(CIRCUITS) })
    };
})();
