/**
 * aipd.js — **l'analyse d'impact RGPD (article 35), à l'écran.**
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Action 20.3 — ce que cet écran doit dire, et ce qu'il refuse de dire
 * ════════════════════════════════════════════════════════════════════════
 *
 * Deux vues, et la seconde est celle qui compte :
 *
 *  · un **encart sur la fiche du traitement** — « ce traitement a-t-il été
 *    analysé, et l'analyse vaut-elle encore ? » ;
 *  · un **onglet du registre RGPD** qui montre l'état de toutes les analyses ET
 *    **les traitements qui n'en ont aucune**. Un registre des AIPD qui ne
 *    montrerait que les analyses faites serait un registre rassurant ; la
 *    question d'un contrôle CNIL est l'inverse.
 *
 * ── ⚠️ CE QUE CET ÉCRAN NE FAIT PAS ────────────────────────────────────────
 *
 * **Il ne décide pas qu'une AIPD est requise.** Les trois cas de l'article 35
 * §3 — profilage systématique, catégories particulières à grande échelle,
 * surveillance systématique d'un lieu public — ne sont pas tous représentables
 * avec ce que le registre de l'article 30 porte. Le produit affiche une
 * **présomption** sur le seul critère qu'il sait mesurer, et il écrit le mot.
 * Un logiciel qui trancherait « AIPD non requise » sur une donnée qu'il ne
 * détient pas rendrait un service pire que rien.
 *
 * **Il ne recalcule pas l'état.** « À revoir » vient du serveur
 * (`f_etat_aipd`), qui compare la date de revue au jour. Une seconde
 * comparaison ici dériverait dès que l'horloge du poste diffère de celle du
 * serveur — et deux réponses à la même question est ce qu'un outil produit en
 * audit ne peut pas se permettre.
 */

const AipdModule = (() => {
    "use strict";

    const ID_ENCART = "aipdEncart";
    const DOMAINE = "rgpd";

    /**
     * Les cinq états rendus par `f_etat_aipd()`, et la teinte de chacun.
     *
     * ⚠️ **Les quatre couleurs sémantiques sont réservées aux statuts** (charte,
     * `CLAUDE.md` §2), et un état d'analyse d'impact EST un statut : « à revoir »
     * est une non-conformité qui s'ignore, et elle doit se voir comme telle.
     */
    const ETATS = Object.freeze({
        non_requise: { libelle: "Non requise", teinte: "status-na",
                       explication: "Le responsable de traitement a motivé l’absence d’analyse. "
                                  + "Le motif est la trace qu’un contrôle demande en premier." },
        a_faire:     { libelle: "À faire", teinte: "status-critique",
                       explication: "L’analyse est due et n’a pas commencé." },
        en_cours:    { libelle: "En cours", teinte: "status-partiel",
                       explication: "L’analyse est engagée." },
        valide:      { libelle: "Validée", teinte: "status-conforme",
                       explication: "L’analyse est validée et sa date de revue n’est pas passée." },
        a_revoir:    { libelle: "À revoir", teinte: "status-partiel",
                       explication: "L’analyse était validée, mais sa date de revue est dépassée "
                                  + "(RGPD art. 35 §11). Elle ne vaut plus jusqu’à son réexamen — "
                                  + "et elle l’a cessé toute seule, sans qu’un traitement ait eu "
                                  + "à repasser." }
    });

    const STATUTS = Object.freeze([
        { valeur: "requise",     libelle: "Requise — à faire" },
        { valeur: "en_cours",    libelle: "En cours" },
        { valeur: "validee",     libelle: "Validée" },
        { valeur: "non_requise", libelle: "Non requise (motivée)" }
    ]);

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function peutLire(domaine) {
        return !(window.Droits && typeof Droits.peutLire === "function")
            || Droits.peutLire(domaine);
    }

    function peutEcrire(domaine) {
        return !(window.Droits && typeof Droits.peutEcrire === "function")
            || Droits.peutEcrire(domaine);
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(String(iso));
        return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("fr-FR");
    }

    function etatDe(code) {
        const connu = Object.prototype.hasOwnProperty.call(ETATS, String(code));
        return connu ? ETATS[String(code)] : {
            libelle: String(code || "inconnu"),
            teinte: "status-na",
            explication: "État inconnu de cette version de l’interface."
        };
    }

    /* =====================================================================
       L'ENCART DE LA FICHE TRAITEMENT
    ===================================================================== */

    /** Le bloc à insérer dans le gabarit de la fiche Traitement. */
    function encartHtml(traitementId) {
        if (!traitementId) return "";
        if (!peutLire(DOMAINE)) return "";
        return ''
            + '<div class="card aipd-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(traitementId) + '">'
            +   "<h2>Analyse d’impact (AIPD)"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "RGPD article 35 : quand un traitement est susceptible d’engendrer un risque "
                    + "élevé pour les personnes, le responsable de traitement mène une analyse "
                    + "d’impact AVANT de le mettre en œuvre. Elle décrit le traitement, évalue "
                    + "la nécessité et la proportionnalité, apprécie les risques et dit les "
                    + "mesures prévues. Elle se réexamine — c’est ce que porte la date de revue.")
                : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"><p class="chart-empty">'
            +   esc("Lecture de l’analyse d’impact…") + "</p></div>"
            + "</div>";
    }

    /**
     * Charge et branche l'encart, une fois le gabarit posé dans le DOM.
     *
     * ⚠️ L'identifiant est relu dans l'attribut du conteneur, et le DOM GAGNE sur
     * l'argument (`CLAUDE.md` §3, constat Q-303) : le serveur réattribue les
     * identifiants à la création, et une valeur capturée viserait en silence une
     * fiche qui n'existe plus.
     */
    function brancherEncart(traitementId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const id = noeud.dataset.id || traitementId;
        if (!id) return;
        if (typeof Sync !== "undefined" && typeof Sync.serveurConnait === "function"
            && !Sync.serveurConnait("traitements", id)) {
            ecrireCorps('<p class="chart-empty">'
                + esc("Traitement en cours d’envoi — l’analyse d’impact s’affichera dès que le "
                    + "serveur l’aura pris.") + "</p>");
            return;
        }
        charger(id);
    }

    function ecrireCorps(html) {
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (corps) corps.innerHTML = html;
    }

    function charger(traitementId) {
        return Api.aipdEtat().then(charge => {
            ecrireCorps(corpsEncartHtml(charge, traitementId));
            brancherFormulaire(traitementId);
        }).catch(e => {
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter les analyses d’impact."
                : ((e && e.message) || "L’analyse d’impact n’a pas pu être lue.");
            ecrireCorps('<p class="chart-empty">' + esc(message) + "</p>");
        });
    }

    /** Le corps de l'encart — exposé pour le banc, qui le compose sans réseau. */
    function corpsEncartHtml(charge, traitementId) {
        const toutes = (charge && charge.analyses) || [];
        const miennes = toutes.filter(a => String(a.traitementId) === String(traitementId));
        const manquante = ((charge && charge.sansAnalyse) || [])
            .find(s => String(s.traitementId) === String(traitementId)) || null;

        let html = "";

        if (miennes.length === 0) {
            // ── AUCUNE ANALYSE : on dit la présomption, et on dit que c'en est une ──
            const presumee = manquante && manquante.presumeeRequise === true;
            html += '<p class="aipd-vide">'
                + (presumee
                    ? "<strong>Aucune analyse d’impact n’est enregistrée</strong> pour ce "
                      + "traitement, qui porte des <strong>catégories particulières de "
                      + "données</strong> (RGPD art. 9)."
                    : "<strong>Aucune analyse d’impact n’est enregistrée</strong> pour ce "
                      + "traitement.")
                + "</p>";
            html += '<p class="aipd-presomption">'
                + esc(presumee
                    ? "C’est une PRÉSOMPTION, pas une décision : l’article 35 §3 vise aussi le "
                      + "profilage systématique et la surveillance d’un lieu public, que ce "
                      + "registre ne permet pas de mesurer. C’est au responsable de traitement "
                      + "de trancher — et de motiver sa décision, y compris celle de ne pas "
                      + "mener d’analyse."
                    : "Le registre ne porte aucun des critères de l’article 35 §3 pour ce "
                      + "traitement. Cela ne vaut pas décision : profilage systématique et "
                      + "surveillance d’un lieu public ne s’y lisent pas.")
                + "</p>";
        } else {
            html += '<table class="data-table aipd-table"><thead><tr>'
                + "<th>État</th><th>Analysée le</th><th>Avis du DPO</th>"
                + "<th>Consultation CNIL</th><th>À revoir le</th><th>Contrôles prévus</th>"
                + "</tr></thead><tbody>";
            for (const a of miennes) {
                const etat = etatDe(a.etat);
                html += '<tr class="aipd-ligne" data-id="' + esc(a.id) + '">'
                    + '<td><span class="status ' + esc(etat.teinte) + '" title="'
                    +   esc(etat.explication) + '">' + esc(etat.libelle) + "</span></td>"
                    + "<td>" + esc(fmtDate(a.dateAnalyse)) + "</td>"
                    + "<td>" + esc(fmtDate(a.avisDpoLe)) + "</td>"
                    + "<td>" + (a.consultationCnil
                        ? esc(fmtDate(a.consultationCnilLe))
                        : '<span class="aipd-neant">non</span>') + "</td>"
                    + "<td>" + esc(fmtDate(a.revoirLe)) + "</td>"
                    + "<td>" + esc(String(a.mesuresPrevues || 0)) + "</td>"
                    + "</tr>";
                if (a.necessiteMotif) {
                    html += '<tr class="aipd-motif"><td colspan="6">'
                        + "<strong>Motif : </strong>" + esc(a.necessiteMotif) + "</td></tr>";
                }
            }
            html += "</tbody></table>";
        }

        if (peutEcrire(DOMAINE)) html += formulaireHtml(traitementId, miennes[0] || null);
        return html;
    }

    /**
     * Le formulaire — création OU mise à jour de l'état d'avancement.
     *
     * ⚠️ **Il ne demande PAS ce que le registre porte déjà.** Ni la finalité, ni
     * les catégories de données, ni les destinataires : ils sont sur la fiche du
     * traitement, au-dessus. Les redemander ici ferait exister deux réponses à la
     * même question, et la seconde vieillirait — c'est le critère d'acceptation
     * de l'action 20.3, et il vaut pour l'écran autant que pour le schéma.
     */
    function formulaireHtml(traitementId, existante) {
        const id = existante ? existante.id : "";
        const statut = existante ? existante.statut : "requise";
        // ⚠️ **L'ÉCRAN DOIT EXPLIQUER LA CONTRADICTION APPARENTE**, et l'essai
        // navigateur l'a réclamée : le sélecteur dit « Validée » — c'est la
        // DÉCISION enregistrée — pendant que le badge dit « À revoir » — c'est
        // l'ÉTAT dérivé de la date de revue. Les deux sont justes, et un lecteur
        // qui les voit côte à côte sans un mot conclut que l'un des deux ment.
        const contradiction = (existante && existante.etat === "a_revoir")
            ? '<p class="aipd-avertissement aipd-contradiction">La décision enregistrée reste '
              + "<strong>« validée »</strong> — c’est un fait, et il ne s’efface pas. Ce qui a "
              + "changé est son <strong>état</strong> : la date de revue est passée, donc "
              + "l’analyse ne vaut plus. Reprenez-la, puis reportez la date de revue."
              + "</p>"
            : "";
        return ''
            + '<form class="aipd-form" id="aipdForm" data-traitement="' + esc(traitementId) + '" '
            +       'data-analyse="' + esc(id) + '">'
            +   '<div class="aipd-form-ligne">'
            +     '<label for="aipdStatut">Où en est l’analyse</label>'
            +     '<select id="aipdStatut">'
            +       STATUTS.map(s => '<option value="' + esc(s.valeur) + '"'
                        + (s.valeur === statut ? " selected" : "") + ">"
                        + esc(s.libelle) + "</option>").join("")
            +     "</select>"
            +   "</div>"
            +   '<div class="aipd-form-ligne">'
            +     '<label for="aipdDate">Analysée le</label>'
            +     '<input type="date" id="aipdDate" value="'
            +       esc(existante && existante.dateAnalyse ? existante.dateAnalyse : "") + '">'
            +   "</div>"
            +   '<div class="aipd-form-ligne">'
            +     '<label for="aipdRevoir">À revoir le</label>'
            +     '<input type="date" id="aipdRevoir" value="'
            +       esc(existante && existante.revoirLe ? existante.revoirLe : "") + '">'
            +   "</div>"
            +   '<div class="aipd-form-ligne aipd-form-large">'
            +     '<label for="aipdMotif">Motif — pourquoi elle est requise, ou pourquoi elle ne l’est pas</label>'
            +     '<textarea id="aipdMotif" rows="2" maxlength="4000">'
            +       esc(existante && existante.necessiteMotif ? existante.necessiteMotif : "")
            +     "</textarea>"
            +   "</div>"
            +   contradiction
            +   '<p class="aipd-avertissement">Une analyse marquée <strong>validée</strong> exige '
            +   "sa date d’analyse : une case cochée sans date n’est pas une analyse. Et une "
            +   "analyse validée dont la date de revue est passée repasse <strong>toute seule</strong> "
            +   "en « à revoir ».</p>"
            +   '<div class="aipd-form-actions">'
            +     '<button type="submit" class="btn-accent">'
            +       (existante ? "Mettre à jour l’analyse" : "Enregistrer l’analyse")
            +     "</button>"
            // ⚠️ Le retrait est offert, et il n'est pas décoratif : la clé vers le
            // traitement est en « restrict » — effacer un traitement dont l'analyse
            // existe encore effacerait la preuve qu'on l'avait analysé. Sans ce
            // bouton, le seul chemin pour retirer un traitement du registre serait
            // un refus 409 que rien ne permettrait de lever depuis l'écran.
            +     (existante
                    ? ' <button type="button" id="aipdSupprimer" class="btn-danger">'
                      + "Retirer l’analyse</button>"
                    : "")
            +   "</div>"
            + "</form>";
    }

    function brancherFormulaire(traitementId) {
        const form = document.getElementById("aipdForm");
        if (!form) return;
        form.addEventListener("submit", (evenement) => {
            evenement.preventDefault();
            // ⚠️ Relus dans le DOM au moment de l'envoi, jamais capturés.
            const tid = form.dataset.traitement || traitementId;
            const aid = form.dataset.analyse || "";
            const statut = (document.getElementById("aipdStatut") || {}).value || "requise";
            const dateAnalyse = (document.getElementById("aipdDate") || {}).value || "";
            const revoirLe = (document.getElementById("aipdRevoir") || {}).value || "";
            const motif = ((document.getElementById("aipdMotif") || {}).value || "").trim();

            if (statut === "validee" && !dateAnalyse) {
                if (window.showToast) {
                    window.showToast("Une analyse validée porte sa date : sans elle, c’est une "
                        + "case cochée, pas une analyse.", "error");
                }
                return;
            }

            const champs = {
                traitement_id: tid,
                statut,
                date_analyse: dateAnalyse || null,
                revoir_le: revoirLe || null,
                necessite_motif: motif || null
            };

            if (aid) {
                const existante = DataStore.getAnalyseImpactById(aid);
                if (!existante) {
                    if (window.showToast) window.showToast("Cette analyse n’existe plus.", "error");
                    return;
                }
                DataStore.updateAnalyseImpact(Object.assign({}, existante, champs));
            } else {
                DataStore.addAnalyseImpact(Object.assign(
                    { id: UI.genId("AIPD"), mesures_ids: [] }, champs));
            }
            if (window.showToast) window.showToast("Analyse d’impact enregistrée.", "success");
            // ⚠️ On attend que le SERVEUR sache, puis on le relit. Relire tout de
            // suite interroge un serveur qui n'a encore rien reçu, et le panneau
            // affiche « aucune analyse » juste après en avoir créé une — mesuré
            // sur la recette, invisible au banc (voir `UI.apresEcriture`).
            UI.apresEcriture(() => charger(tid));
        });

        const supprimer = document.getElementById("aipdSupprimer");
        if (supprimer) supprimer.addEventListener("click", () => {
            // Relus dans le DOM au moment du clic, jamais capturés.
            const tid = form.dataset.traitement || traitementId;
            const aid = form.dataset.analyse || "";
            if (!aid) return;
            if (!window.confirm(
                "Retirer l’analyse d’impact de ce traitement ?\n\nLa trace de l’analyse — "
                + "sa date, son motif, l’avis du DPO — disparaît. Un contrôle ne pourra plus "
                + "la constater.")) return;
            DataStore.deleteAnalyseImpact(aid);
            if (window.showToast) window.showToast("Analyse d’impact retirée.", "success");
            UI.apresEcriture(() => charger(tid));
        });
    }

    /* =====================================================================
       L'ONGLET DU REGISTRE RGPD — l'état de TOUTES les analyses
    ===================================================================== */

    /** Le corps de la vue « Analyses d'impact » — exposé pour le banc. */
    function corpsVueHtml(charge) {
        const analyses = (charge && charge.analyses) || [];
        const sansAnalyse = (charge && charge.sansAnalyse) || [];
        const aRevoir = analyses.filter(a => a.etat === "a_revoir").length;
        const aFaire = analyses.filter(a => a.etat === "a_faire").length;
        const presumes = sansAnalyse.filter(s => s.presumeeRequise).length;

        let html = ''
            + '<div class="dashboard-grid no-print" style="grid-template-columns:repeat(4,1fr); margin-bottom:1rem;">'
            +   carteHtml("Analyses enregistrées", analyses.length)
            +   carteHtml("À faire", aFaire)
            +   carteHtml("À revoir", aRevoir)
            +   carteHtml("Traitements sans analyse", sansAnalyse.length)
            + "</div>";

        if (analyses.length) {
            html += '<div class="dash-section-title">Analyses enregistrées</div>'
                + '<table class="data-table"><thead><tr>'
                + "<th>Traitement</th><th>État</th><th>Analysée le</th><th>À revoir le</th>"
                + "<th>Contrôles prévus</th>"
                + "</tr></thead><tbody>";
            for (const a of analyses) {
                const etat = etatDe(a.etat);
                html += '<tr class="aipd-vue-ligne" data-traitement="' + esc(a.traitementId) + '">'
                    + "<td>" + esc(a.traitementNom) + "</td>"
                    + '<td><span class="status ' + esc(etat.teinte) + '" title="'
                    +   esc(etat.explication) + '">' + esc(etat.libelle) + "</span></td>"
                    + "<td>" + esc(fmtDate(a.dateAnalyse)) + "</td>"
                    + "<td>" + esc(fmtDate(a.revoirLe)) + "</td>"
                    + "<td>" + esc(String(a.mesuresPrevues || 0)) + "</td>"
                    + "</tr>";
            }
            html += "</tbody></table>";
        }

        // ── LA LISTE QUI COMPTE ───────────────────────────────────────────
        html += '<div class="dash-section-title" style="margin-top:2rem;">'
            + "Traitements sans analyse d’impact</div>";
        if (!sansAnalyse.length) {
            html += '<p class="chart-empty">Chaque traitement du registre porte une analyse '
                + "d’impact — ou une décision motivée de ne pas en mener.</p>";
        } else {
            html += '<p class="aipd-presomption">'
                + esc(presumes + " traitement(s) sur " + sansAnalyse.length
                    + " portent des catégories particulières de données (RGPD art. 9) et sont "
                    + "PRÉSUMÉS relever de l’article 35. C’est une présomption : le registre ne "
                    + "permet de mesurer qu’un des trois cas de l’article 35 §3. Le responsable "
                    + "de traitement tranche, et motive — y compris quand il décide qu’aucune "
                    + "analyse n’est due.")
                + "</p>"
                + '<table class="data-table"><thead><tr>'
                + "<th>Traitement</th><th>Portée</th><th>Données sensibles</th>"
                + "<th>Présomption art. 35</th>"
                + "</tr></thead><tbody>";
            for (const s of sansAnalyse) {
                html += '<tr class="aipd-manque" data-traitement="' + esc(s.traitementId) + '">'
                    + "<td>" + esc(s.traitementNom) + "</td>"
                    + "<td>" + (s.porteeGroupe ? "Groupe" : "Cette filiale") + "</td>"
                    + "<td>" + (s.donneesSensibles ? "oui" : "non") + "</td>"
                    + "<td>" + (s.presumeeRequise
                        ? '<span class="status status-partiel">Présumée requise</span>'
                        : '<span class="aipd-neant">non présumée</span>') + "</td>"
                    + "</tr>";
            }
            html += "</tbody></table>";
        }

        if (charge && charge.tronque) {
            html += '<p class="aipd-presomption">La liste est tronquée : votre périmètre porte '
                + "plus d’analyses que cet écran n’en affiche en une fois.</p>";
        }
        return html;
    }

    function carteHtml(titre, valeur) {
        return '<div class="dashboard-card t-centre">'
            + '<h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">'
            + esc(titre) + "</h3>"
            + '<div class="big-kpi" style="font-size: var(--text-3xl);">' + esc(String(valeur))
            + "</div></div>";
    }

    /** Remplit le conteneur de la vue, puis branche la navigation vers les fiches. */
    function monterVue(idConteneur) {
        const hote = document.getElementById(idConteneur);
        if (!hote) return;
        hote.innerHTML = '<p class="chart-empty">' + esc("Lecture des analyses d’impact…") + "</p>";
        return Api.aipdEtat().then(charge => {
            hote.innerHTML = corpsVueHtml(charge);
            brancherVue(hote);
        }).catch(e => {
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter les analyses d’impact."
                : ((e && e.message) || "Les analyses d’impact n’ont pas pu être lues.");
            hote.innerHTML = '<p class="chart-empty">' + esc(message) + "</p>";
        });
    }

    function brancherVue(hote) {
        hote.querySelectorAll("[data-traitement]").forEach(ligne => {
            ligne.style.cursor = "pointer";
            // ⚠️ L'identifiant est relu dans l'attribut AU MOMENT DU CLIC, jamais
            // capturé en fermeture (`CLAUDE.md` §3, constat Q-303).
            ligne.addEventListener("click", () => {
                if (typeof Router !== "undefined") {
                    Router.navigateTo("/rgpd/" + ligne.dataset.traitement);
                }
            });
        });
    }

    return {
        encartHtml, brancherEncart, monterVue,
        // Purement fonctionnels : ils composent sans réseau, et le banc les joue.
        corpsEncartHtml, corpsVueHtml, etatDe,
        contrat: Object.freeze({
            hote: ID_ENCART,
            domaine: DOMAINE,
            etats: Object.keys(ETATS),
            statuts: STATUTS.map(s => s.valeur)
        })
    };
})();

window.AipdModule = AipdModule;
