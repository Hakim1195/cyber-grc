// Emplacement : js/modules/reglementaire.js
// Nom du fichier : reglementaire.js
//
// Panneau « Horloge réglementaire » — lot L20, action 20.1.
//
// ── Ce que ce fichier est, et ce qu'il n'est pas ────────────────────────────
//
// Ce n'est **pas un écran** : c'est un panneau que la fiche Incident embarque,
// plus un bloc que le tableau de bord affiche. Une échéance réglementaire n'a
// pas d'existence propre — elle est **dérivée** d'un incident, et elle se lit à
// côté de lui.
//
// ── ⚠️ LE CALCUL NE VIT PAS ICI, ET C'EST TOUT L'INTÉRÊT ────────────────────
//
// Les quatre délais — NIS2 24 h / 72 h / 1 mois, RGPD 72 h — sont écrits **une
// seule fois**, dans `f_echeances_reglementaires()` (migration `034`), avec leur
// référence au texte. Ce fichier ne calcule aucune échéance : il **affiche** ce
// que le serveur a dérivé.
//
// ⚠️ **Ce panneau REMPLACE un bandeau qui recopiait les délais dans le
// navigateur.** `js/modules/incidents.js` portait un `deadlineBannerHtml()` qui
// comptait les heures écoulées côté client et affichait, depuis le dictionnaire
// i18n, « ANSSI/NIS2 : alerte 24 h · notification 72 h ». C'étaient **deux
// rédactions de la même obligation réglementaire** — exactement ce que l'en-tête
// de la migration `034` proscrit —, et la seconde était incomplète : elle
// ignorait le rapport final à un mois. Elle ne dira donc plus jamais autre chose
// que la base, pour la seule raison qui vaille : *elle ne le dit plus du tout*.
//
// ── ⚠️ ET LE PRODUIT NE TRANSMET RIEN À UNE AUTORITÉ ────────────────────────
//
// Il n'existe ici aucun bouton « déclarer à l'ANSSI ». Ce qu'on consigne est une
// déclaration **déjà faite** par un humain, avec son accusé de réception. Toute
// autre lecture serait une prise de responsabilité que le logiciel ne peut pas
// porter (critère 20.2), et l'écran l'écrit — un utilisateur pressé, devant un
// compte à rebours, ne doit pas pouvoir croire que le produit a envoyé.
//
// ── L'ORIGINE DE L'HORLOGE SE DIT, TOUJOURS ─────────────────────────────────
//
// `incidents.date_detection` est une date NUE. Quand l'instant précis manque, le
// compte repart de minuit et le serveur rend `origine: 'date_seule'`. L'écran
// l'affiche : *une horloge dont on ignore l'origine ne se défend pas devant
// l'ANSSI*, et un reste-à-courir faux de onze heures se défend encore moins.

const ReglementaireModule = (() => {
    "use strict";

    const ID_ENCART = "reglementaireEncart";
    const ID_BLOC   = "reglementaireBloc";

    /** Le domaine de droits dont ce panneau dépend — celui de la fiche qui le porte. */
    const DOMAINE = "incidents";

    /**
     * Ce que chaque palier veut dire **pour l'utilisateur**.
     *
     * ── Une liste écrite à la main, et pourquoi c'est le bon outil ici ──────
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Un palier absent de
     * cette table est affiché **tel qu'il vient de la base**, avec sa référence
     * au texte : rien ne disparaît, rien n'est masqué, et la ligne reste
     * lisible. L'omission échoue donc du bon côté — celui qui montre. Les quatre
     * valeurs sont celles de `ck_declarations_reglementaires_palier`.
     */
    const PALIERS = Object.freeze({
        alerte_precoce:    "Alerte précoce",
        notification:      "Notification",
        rapport_final:     "Rapport final",
        notification_cnil: "Notification à la CNIL"
    });

    const REGIMES = Object.freeze({ nis2: "NIS2", rgpd: "RGPD" });


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

    function peutEcrire(domaine) {
        if (typeof Droits === "undefined" || !Droits.connus()) return true;
        const ordre = Api.CONTRAT_AUTH.niveaux;
        const rang = (n) => { const i = ordre.indexOf(n); return i === -1 ? 0 : i + 1; };
        if (!Droits.peutLire(domaine)) return false;
        return rang(Droits.niveauEffectif(domaine)) >= rang("contribution");
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
     * Le reste-à-courir, en mots.
     *
     * ⚠️ **Le chiffre vient du serveur** (`resteHeures`) : on le met en forme,
     * on ne le recalcule pas. Un second calcul dériverait dès que l'horloge du
     * poste diffère de celle du serveur — et c'est le cas le plus banal qui soit.
     */
    function resteLisible(ligne) {
        if (ligne.fait) return "—";
        const h = ligne.resteHeures;
        if (h === null || h === undefined) return "—";
        if (h < 0) {
            const d = Math.abs(h);
            return d >= 48 ? "en retard de " + Math.round(d / 24) + " jours"
                           : "en retard de " + Math.round(d) + " h";
        }
        if (h < 1) return "moins d'une heure";
        if (h < 48) return Math.round(h) + " h";
        return Math.round(h / 24) + " jours";
    }

    /** Le ton d'une échéance — les quatre couleurs sémantiques, et rien d'autre. */
    function tonEcheance(ligne) {
        if (ligne.fait) return "ok";
        if (ligne.enRetard) return "crit";
        if (ligne.resteHeures !== null && ligne.resteHeures <= 24) return "warn";
        return "na";
    }

    function etatLisible(ligne) {
        if (ligne.fait) return "Déclarée";
        if (ligne.enRetard) return "En retard";
        return "À faire";
    }

    /* =====================================================================
       LE PANNEAU DE LA FICHE INCIDENT
    ===================================================================== */

    /** Le bloc à insérer dans le gabarit de la fiche Incident. */
    function encartHtml(incidentId) {
        if (!incidentId) return "";
        if (!peutLire(DOMAINE)) return "";
        return ''
            + '<div class="card reg-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(incidentId) + '">'
            +   "<h2>Horloge réglementaire"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "Ce qui est dû à une autorité pour cet incident, et pour quand. Les "
                    + "délais sont dérivés de la date de détection par le serveur, avec leur "
                    + "référence au texte. Le produit ne transmet rien : il prépare, un "
                    + "humain envoie, et l'on consigne ici ce qui a été fait.") : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"><p class="chart-empty">'
            +   esc("Lecture des échéances…") + "</p></div>"
            + "</div>";
    }

    /**
     * Charge et branche le panneau, une fois le gabarit posé dans le DOM.
     *
     * ⚠️ L'identifiant est relu dans l'attribut du conteneur, et le DOM GAGNE
     * sur l'argument (`CLAUDE.md` §3, constat Q-303).
     */
    function brancherEncart(incidentId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const id = noeud.dataset.id || incidentId;
        if (!id) return;
        if (typeof Sync !== "undefined" && typeof Sync.serveurConnait === "function"
            && !Sync.serveurConnait("incidents", id)) {
            ecrireCorps('<p class="chart-empty">'
                + esc("Incident en cours d'envoi — les échéances s'afficheront dès que le "
                    + "serveur l'aura pris.") + "</p>");
            return;
        }
        chargerEncart(id);
    }

    function ecrireCorps(html) {
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (corps) corps.innerHTML = html;
    }

    function chargerEncart(incidentId) {
        Api.echeancesReglementaires().then(charge => {
            // La route rend les échéances de TOUS les incidents à déclarer du
            // périmètre : on ne garde que celles de la fiche ouverte. Le filtre
            // est ici parce que le serveur n'a pas de raison d'ouvrir une route
            // par incident — et parce que le bloc du tableau de bord, lui, a
            // besoin de l'ensemble.
            const lignes = ((charge && charge.echeances) || [])
                .filter(l => String(l.incidentId) === String(incidentId));
            ecrireCorps(corpsEncartHtml(lignes, charge));
            brancherConsignation(incidentId);
        }).catch(e => {
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter les échéances réglementaires."
                : ((e && e.message) || "Les échéances n'ont pas pu être lues.");
            ecrireCorps('<p class="chart-empty">' + esc(message) + "</p>");
        });
    }

    /** Le corps du panneau — exposé pour le banc, qui le compose sans réseau. */
    function corpsEncartHtml(lignes, charge) {
        if (!lignes || lignes.length === 0) {
            // ⚠️ Trois raisons d'être vide, et elles n'appellent pas la même
            // réaction. Les confondre est la classe Q-201 / Q-207.
            return '<p class="chart-empty">'
                + esc("Aucune échéance réglementaire n'est ouverte pour cet incident. "
                    + "Les délais NIS2 et RGPD ne se déclenchent que lorsque la fiche porte "
                    + "« à déclarer » et une date de détection.")
                + "</p>";
        }

        const origine = lignes[0].origine;
        let html = "";
        if (origine === "date_seule") {
            // ⚠️ La précision de l'horloge se DIT. Un compte à rebours faux de
            // onze heures ne se défend pas devant une autorité.
            html += '<p class="reg-origine reg-origine--approx">'
                 +  esc("L'horloge part de MINUIT, le jour de la détection : la fiche ne "
                      + "porte qu'une date, pas un instant. Renseignez l'heure exacte de "
                      + "détection pour que les délais soient défendables.")
                 +  "</p>";
        } else {
            html += '<p class="reg-origine">'
                 +  esc("L'horloge part de l'instant de détection consigné sur la fiche.")
                 +  "</p>";
        }

        html += '<div class="table-scroll"><table class="data-table reg-table">'
             +  "<thead><tr><th>Régime</th><th>Palier</th><th class=\"num\">Échéance</th>"
             +  "<th class=\"num\">Reste</th><th>État</th><th>Texte</th></tr></thead><tbody>";
        lignes.forEach(l => {
            const ton = tonEcheance(l);
            html += '<tr class="reg-ligne reg-ligne--' + ton + '">'
                 +  "<td>" + esc(REGIMES[l.regime] || l.regime) + "</td>"
                 +  "<td>" + esc(PALIERS[l.palier] || l.palier) + "</td>"
                 +  '<td class="num">' + esc(fmtDate(l.echeance)) + "</td>"
                 +  '<td class="num">' + esc(resteLisible(l)) + "</td>"
                 +  '<td><span class="status ' + CLASSE_TON[ton] + '">' + esc(etatLisible(l)) + "</span>"
                 +  (l.fait ? '<span class="reg-fait-le"> ' + esc(fmtDate(l.faitLe)) + "</span>" : "")
                 +  "</td>"
                 +  '<td class="mono">' + esc(l.texte) + "</td>"
                 +  "</tr>";
        });
        html += "</tbody></table></div>";

        html += formulaireHtml(lignes);

        html += '<p class="reg-mention">'
             +  esc("Le produit ne transmet rien à une autorité. Il calcule les délais et "
                  + "consigne ce que vous avez déclaré vous-même ; l'envoi reste votre geste.")
             +  "</p>";
        // `charge.tronque` : le serveur borne le nombre d'incidents examinés. Le
        // dire, sinon un incident absent passerait pour un incident sans échéance.
        if (charge && charge.tronque) {
            html += '<p class="reg-mention reg-mention--alerte">'
                 +  esc("La liste des échéances a été tronquée par le serveur : trop "
                      + "d'incidents sont marqués « à déclarer » dans ce périmètre.")
                 +  "</p>";
        }
        return html;
    }

    /** Le formulaire de consignation — absent si le profil ne peut pas écrire. */
    function formulaireHtml(lignes) {
        if (!peutEcrire(DOMAINE)) return "";
        const restantes = lignes.filter(l => !l.fait);
        if (restantes.length === 0) {
            return '<p class="chart-empty">'
                + esc("Toutes les obligations de cet incident sont consignées.") + "</p>";
        }
        let options = "";
        restantes.forEach(l => {
            // La valeur porte les deux moitiés du couple, que la base exige
            // cohérentes (`ck_declarations_reglementaires_coherence`). On ne
            // réécrit pas la règle ici : on propose les couples que le serveur
            // a lui-même engendrés, et il n'y en a pas d'autres.
            options += '<option value="' + esc(l.regime + "|" + l.palier) + '">'
                    +  esc((REGIMES[l.regime] || l.regime) + " — "
                           + (PALIERS[l.palier] || l.palier))
                    +  "</option>";
        });
        return ''
            + '<div class="reg-consigner no-print">'
            +   '<strong class="reg-consigner-titre">'
            +   esc("Consigner une déclaration déjà faite") + "</strong>"
            +   '<div class="reg-consigner-ligne">'
            +     '<label class="sr-only" for="' + ID_ENCART + 'Palier">'
            +     esc("Obligation déclarée") + "</label>"
            +     '<select id="' + ID_ENCART + 'Palier">' + options + "</select>"
            +     '<label class="sr-only" for="' + ID_ENCART + 'Ref">'
            +     esc("Numéro d'accusé de réception") + "</label>"
            +     '<input type="text" id="' + ID_ENCART + 'Ref" maxlength="200" '
            +     'autocomplete="off" placeholder="' + esc("Accusé de réception (facultatif)")
            +     '">'
            +     '<button type="button" id="' + ID_ENCART + 'Btn">'
            +     esc("Consigner") + "</button>"
            +   "</div>"
            + "</div>";
    }

    function brancherConsignation(incidentId) {
        const bouton = document.getElementById(ID_ENCART + "Btn");
        if (!bouton) return;
        bouton.addEventListener("click", () => {
            const choix = document.getElementById(ID_ENCART + "Palier");
            const ref   = document.getElementById(ID_ENCART + "Ref");
            if (!choix || !choix.value) return;
            const moities = String(choix.value).split("|");
            const corps = { regime: moities[0], palier: moities[1] };
            if (ref && ref.value.trim()) corps.reference = ref.value.trim();
            bouton.disabled = true;
            bouton.textContent = "Enregistrement…";
            Api.consignerDeclaration(incidentId, corps).then(() => {
                if (window.showToast) window.showToast("Déclaration consignée.", "success");
                chargerEncart(incidentId);
                if (document.getElementById(ID_BLOC)) monterBloc();
            }).catch(e => {
                bouton.disabled = false;
                bouton.textContent = "Consigner";
                const message = (e && e.message) || "La déclaration n'a pas pu être consignée.";
                if (window.showToast) window.showToast(message, "error");
            });
        });
    }

    /* =====================================================================
       LE BLOC DU TABLEAU DE BORD — « Échéances réglementaires »
    ===================================================================== */

    function blocHtml() {
        if (!peutLire(DOMAINE)) return "";
        return '<div class="dashboard-card" id="' + ID_BLOC + '">'
            +  "<h2>Échéances réglementaires"
            +  (typeof Help !== "undefined" ? Help.tip(
                   "Les obligations NIS2 et RGPD ouvertes sur vos incidents, la plus proche "
                   + "en premier. Le produit ne transmet rien : il prépare et consigne.") : "")
            +  "</h2>"
            +  '<div id="' + ID_BLOC + 'Corps"><p class="chart-empty">'
            +  esc("Lecture…") + "</p></div></div>";
    }

    function monterBloc() {
        const corps = document.getElementById(ID_BLOC + "Corps");
        if (!corps) return;
        Api.echeancesReglementaires().then(charge => {
            corps.innerHTML = corpsBlocHtml(charge);
            corps.querySelectorAll(".reg-bloc-item").forEach(li => {
                li.addEventListener("click", () => {
                    Router.navigateTo("/incidents/" + li.dataset.id);
                });
            });
        }).catch(() => {
            corps.innerHTML = '<p class="chart-empty">'
                + esc("Les échéances réglementaires n'ont pas pu être obtenues.") + "</p>";
        });
    }

    /** Le corps du bloc — exposé pour le banc, qui le compose sans réseau. */
    function corpsBlocHtml(charge) {
        const lignes = ((charge && charge.echeances) || []).filter(l => !l.fait);
        if (lignes.length === 0) {
            // Le serveur rend son propre motif quand rien n'est « à déclarer ».
            // On le préfère au nôtre : il sait, lui, POURQUOI la liste est vide.
            const motif = (charge && charge.motif)
                || "Aucune obligation réglementaire n'est ouverte : tout ce qui était dû a "
                   + "été consigné.";
            return '<p class="chart-empty">' + esc(motif) + "</p>";
        }
        let html = '<ul class="dash-list reg-bloc">';
        lignes.slice(0, 8).forEach(l => {
            const ton = tonEcheance(l);
            html += '<li class="reg-bloc-item" data-id="' + esc(l.incidentId) + '">'
                 +  '<span class="reg-bloc-titre">' + esc(l.titre) + "</span>"
                 +  '<span class="reg-bloc-meta">'
                 +    '<span class="status ' + CLASSE_TON[ton] + '">' + esc(etatLisible(l)) + "</span> "
                 +    esc((REGIMES[l.regime] || l.regime) + " · "
                          + (PALIERS[l.palier] || l.palier) + " · " + resteLisible(l))
                 +  "</span></li>";
        });
        html += "</ul>";
        if (lignes.length > 8) {
            html += '<p class="reg-mention">'
                 +  esc("et " + (lignes.length - 8) + " autre"
                       + (lignes.length - 8 > 1 ? "s" : "") + " échéance"
                       + (lignes.length - 8 > 1 ? "s" : "") + ".")
                 +  "</p>";
        }
        return html;
    }

    return {
        encartHtml: encartHtml,
        brancherEncart: brancherEncart,
        blocHtml: blocHtml,
        monterBloc: monterBloc,

        // ── Exposés pour le banc ────────────────────────────────────────────
        corpsEncartHtml: corpsEncartHtml,
        corpsBlocHtml: corpsBlocHtml,
        resteLisible: resteLisible,
        tonEcheance: tonEcheance,
        contrat: Object.freeze({ paliers: Object.keys(PALIERS), regimes: Object.keys(REGIMES) })
    };
})();
