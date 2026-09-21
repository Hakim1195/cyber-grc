/**
 * droits.js — **les demandes d'exercice de droits, à l'écran** (RGPD art. 15 à 22)
 *
 * ════════════════════════════════════════════════════════════════════════
 *  Action 20.4 — ce que cet écran fait, et ce qu'il refuse de faire
 * ════════════════════════════════════════════════════════════════════════
 *
 * Il **tient le registre** et **montre l'horloge**. Il ne répond pas à la
 * personne, n'extrait pas ses données et ne juge pas si la demande est fondée :
 * toute autre lecture serait une prise de responsabilité qu'un logiciel ne peut
 * pas porter — c'est l'arbitrage rendu en 20.2 pour les notifications aux
 * autorités, et il vaut ici mot pour mot.
 *
 * ── ⚠️ CE QUE L'ÉCRAN NE CALCULE PAS ───────────────────────────────────────
 *
 * **L'échéance.** Le mois de l'article 12 §3 se dérive de la date de réception,
 * côté serveur (`f_echeance_droits`). La recalculer ici serait une seconde
 * rédaction de la règle, qui dériverait dès que l'horloge du poste diffère de
 * celle du serveur — et deux comptes de la même échéance réglementaire est la
 * pire chose qu'un outil produit en audit puisse afficher.
 *
 * ── ⚠️ ET UNE PRÉCAUTION QUE CET ÉCRAN DOIT À SON SUJET ────────────────────
 *
 * Il affiche le **nom et les coordonnées d'une personne qui n'est pas un
 * utilisateur**. C'est nécessaire — on ne répond pas à quelqu'un sans savoir qui
 * — et c'est rangé au registre de l'article 30 du produit lui-même. L'écran
 * n'en fait donc pas d'usage décoratif : pas de vignette, pas de tri par nom,
 * rien qui transforme un registre d'obligations en carnet d'adresses.
 */

const DroitsModule = (() => {
    "use strict";

    const ID_VUE = "droitsVue";
    const DOMAINE = "rgpd";

    /**
     * Les quatre états rendus par `f_etat_demande_droits()`.
     *
     * ⚠️ « En retard » est un **statut de conformité**, pas une information de
     * confort : il se rend avec la teinte critique, comme une non-conformité —
     * parce que c'en est une, et qu'elle expose à une réclamation.
     */
    const ETATS = Object.freeze({
        a_traiter: { libelle: "À traiter", teinte: "status-partiel",
                     explication: "Le délai de l’article 12 §3 court encore." },
        en_retard: { libelle: "En retard", teinte: "status-critique",
                     explication: "Le délai d’un mois est écoulé et la demande n’a pas reçu "
                                + "de réponse. L’article 12 §4 ouvre alors à la personne une "
                                + "réclamation auprès de l’autorité de contrôle." },
        repondue:  { libelle: "Répondue", teinte: "status-conforme",
                     explication: "Une réponse a été faite, et elle est datée." },
        refusee:   { libelle: "Refusée", teinte: "status-na",
                     explication: "La demande n’a pas reçu de suite favorable. L’article 12 §4 "
                                + "exige que la personne en ait été informée dans le délai, "
                                + "avec les voies de recours." }
    });

    /** Les sept droits du vocabulaire fermé de la base. */
    const TYPES = Object.freeze([
        { valeur: "acces", libelle: "Accès (art. 15)" },
        { valeur: "rectification", libelle: "Rectification (art. 16)" },
        { valeur: "effacement", libelle: "Effacement (art. 17)" },
        { valeur: "limitation", libelle: "Limitation (art. 18)" },
        { valeur: "opposition", libelle: "Opposition (art. 21)" },
        { valeur: "portabilite", libelle: "Portabilité (art. 20)" },
        { valeur: "retrait_consentement", libelle: "Retrait du consentement (art. 7 §3)" }
    ]);

    const CANAUX = Object.freeze([
        { valeur: "courriel", libelle: "Courriel" },
        { valeur: "courrier", libelle: "Courrier" },
        { valeur: "formulaire", libelle: "Formulaire" },
        { valeur: "telephone", libelle: "Téléphone" },
        { valeur: "guichet", libelle: "Guichet" },
        { valeur: "autre", libelle: "Autre" }
    ]);

    const STATUTS = Object.freeze([
        { valeur: "recue", libelle: "Reçue" },
        { valeur: "en_cours", libelle: "En cours d’instruction" },
        { valeur: "repondue", libelle: "Répondue" },
        { valeur: "refusee", libelle: "Refusée" }
    ]);

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
            libelle: String(code || "inconnu"), teinte: "status-na",
            explication: "État inconnu de cette version de l’interface."
        };
    }

    function libelleDe(liste, valeur) {
        const trouve = liste.find(e => e.valeur === String(valeur));
        return trouve ? trouve.libelle : String(valeur || "—");
    }

    /**
     * Le reste-à-courir, en français.
     *
     * ⚠️ **Un retard se dit en JOURS, jamais en « bientôt ».** « En retard de
     * douze jours » se défend devant une autorité ; « bientôt » ne se défend pas,
     * et laisse croire qu'on a le temps. Le nombre vient du serveur, qui le
     * calcule au même endroit que l'échéance.
     */
    function resteLisible(jours) {
        if (jours === null || jours === undefined) return "—";
        const n = Number(jours);
        if (!isFinite(n)) return "—";
        if (n < 0) return "En retard de " + Math.abs(n) + " jour" + (Math.abs(n) > 1 ? "s" : "");
        if (n === 0) return "Échoit aujourd’hui";
        return n + " jour" + (n > 1 ? "s" : "") + " restant" + (n > 1 ? "s" : "");
    }

    /* =====================================================================
       LA VUE — un onglet du registre RGPD
    ===================================================================== */

    /** Le corps de la vue — exposé pour le banc, qui le compose sans réseau. */
    function corpsVueHtml(charge) {
        const demandes = (charge && charge.demandes) || [];
        const enRetard = demandes.filter(d => d.etat === "en_retard").length;
        const aTraiter = demandes.filter(d => d.etat === "a_traiter").length;
        const repondues = demandes.filter(d => d.etat === "repondue").length;

        let html = ''
            + '<div class="dashboard-grid no-print" style="grid-template-columns:repeat(4,1fr); margin-bottom:1rem;">'
            +   carteHtml("Demandes au registre", demandes.length)
            +   carteHtml("À traiter", aTraiter)
            +   carteHtml("En retard", enRetard)
            +   carteHtml("Répondues", repondues)
            + "</div>";

        html += '<p class="dro-note">Le délai est celui de l’<strong>article 12 §3</strong> du '
            + "RGPD : <strong>un mois</strong> à compter de la réception, prorogeable de "
            + "<strong>deux mois</strong> pour une demande complexe — à condition d’en avoir "
            + "informé la personne dans le premier mois. Il est <strong>calculé par le "
            + "serveur</strong>, à partir de la date de réception : corrigez cette date, et "
            + "l’échéance suit.</p>";

        if (!demandes.length) {
            html += '<p class="chart-empty">Aucune demande d’exercice de droits n’est '
                + "enregistrée. Ce registre sert à prouver qu’on a répondu, et quand.</p>";
        } else {
            html += '<table class="data-table"><thead><tr>'
                + "<th>Reçue le</th><th>Droit invoqué</th><th>Demandeur</th><th>Canal</th>"
                + "<th>Échéance</th><th>Reste</th><th>État</th><th>Traitement visé</th>"
                + "</tr></thead><tbody>";
            for (const d of demandes) {
                const etat = etatDe(d.etat);
                html += '<tr class="dro-ligne" data-id="' + esc(d.id) + '">'
                    + "<td>" + esc(fmtDate(d.recueLe)) + "</td>"
                    + "<td>" + esc(libelleDe(TYPES, d.typeDemande)) + "</td>"
                    + "<td>" + esc(d.demandeur) + "</td>"
                    + "<td>" + esc(libelleDe(CANAUX, d.canal)) + "</td>"
                    + "<td>" + esc(fmtDate(d.echeance))
                    +   (d.prorogee ? ' <span class="status status-na dro-proroge" title="'
                        + esc("Prorogation de deux mois notifiée le " + fmtDate(d.prorogeeLe)
                            + " — RGPD art. 12 §3.") + '">prorogée</span>' : "")
                    + "</td>"
                    + "<td>" + esc(resteLisible(d.joursRestants)) + "</td>"
                    + '<td><span class="status ' + esc(etat.teinte) + '" title="'
                    +   esc(etat.explication) + '">' + esc(etat.libelle) + "</span></td>"
                    + "<td>" + esc(d.traitementNom || "—") + "</td>"
                    + "</tr>";
            }
            html += "</tbody></table>";
        }

        if (charge && charge.tronque) {
            html += '<p class="dro-note">La liste est tronquée : votre périmètre porte plus de '
                + "demandes que cet écran n’en affiche en une fois.</p>";
        }
        if (peutEcrire(DOMAINE)) html += formulaireHtml();
        return html;
    }

    function carteHtml(titre, valeur) {
        return '<div class="dashboard-card t-centre">'
            + '<h3 style="font-size: var(--text-base); color:var(--text-muted); text-transform:uppercase;">'
            + esc(titre) + "</h3>"
            + '<div class="big-kpi" style="font-size: var(--text-3xl);">' + esc(String(valeur))
            + "</div></div>";
    }

    /**
     * Le formulaire d'enregistrement d'une demande reçue.
     *
     * ⚠️ **La date de réception est celle de la RÉCEPTION, pas celle de la
     * saisie.** Le champ est modifiable et pré-rempli à aujourd'hui : un courriel
     * qui a dormi trois jours dans une boîte partagée consomme trois jours du
     * délai, et l'ignorer fabriquerait un retard qu'on croit ne pas avoir.
     */
    function formulaireHtml() {
        const aujourdhui = new Date().toISOString().slice(0, 10);
        return ''
            + '<form class="dro-form" id="droForm">'
            +   '<div class="dash-section-title" style="grid-column:1/-1;">Enregistrer une demande reçue</div>'
            +   champHtml("droRecueLe", "Reçue le",
                    '<input type="date" id="droRecueLe" value="' + esc(aujourdhui) + '">')
            +   champHtml("droType", "Droit invoqué",
                    '<select id="droType">'
                    + TYPES.map(t => '<option value="' + esc(t.valeur) + '">'
                        + esc(t.libelle) + "</option>").join("") + "</select>")
            +   champHtml("droCanal", "Reçue par",
                    '<select id="droCanal">'
                    + CANAUX.map(c => '<option value="' + esc(c.valeur) + '">'
                        + esc(c.libelle) + "</option>").join("") + "</select>")
            +   champHtml("droDemandeur", "Demandeur",
                    '<input type="text" id="droDemandeur" maxlength="200" '
                    + 'placeholder="Nom ou référence de la personne">')
            +   champHtml("droContact", "Contact",
                    '<input type="text" id="droContact" maxlength="320" '
                    + 'placeholder="Courriel ou adresse">')
            +   '<p class="dro-avertissement">Ces deux champs portent les données personnelles '
            +   "d’une personne qui n’est <strong>pas un utilisateur</strong> du produit. Ils "
            +   "sont nécessaires — on ne répond pas à quelqu’un sans savoir qui — et ils "
            +   "figurent au registre de l’article 30 de ce logiciel, avec leur sort à "
            +   "l’expiration : le nom se conserve, le contact s’anonymise.</p>"
            +   '<button type="submit" class="btn-accent">Enregistrer la demande</button>'
            + "</form>";
    }

    function champHtml(id, libelle, controle) {
        return '<div class="dro-form-ligne"><label for="' + esc(id) + '">' + esc(libelle)
            + "</label>" + controle + "</div>";
    }

    /** Remplit le conteneur de la vue, puis branche les gestes. */
    function monterVue(idConteneur) {
        const hote = document.getElementById(idConteneur || ID_VUE);
        if (!hote) return;
        hote.innerHTML = '<p class="chart-empty">' + esc("Lecture des demandes…") + "</p>";
        return charger(hote);
    }

    function charger(hote) {
        return Api.demandesDroitsEtat().then(charge => {
            hote.innerHTML = corpsVueHtml(charge);
            brancher(hote);
        }).catch(e => {
            const message = (e && e.estDroitInsuffisant && e.estDroitInsuffisant())
                ? "Votre profil ne permet pas de consulter les demandes d’exercice de droits."
                : ((e && e.message) || "Les demandes n’ont pas pu être lues.");
            hote.innerHTML = '<p class="chart-empty">' + esc(message) + "</p>";
        });
    }

    function brancher(hote) {
        const form = hote.querySelector("#droForm");
        if (!form) return;
        form.addEventListener("submit", (evenement) => {
            evenement.preventDefault();
            // Relus dans le DOM au moment de l'envoi, jamais capturés.
            const demandeur = (document.getElementById("droDemandeur") || {}).value || "";
            const recueLe = (document.getElementById("droRecueLe") || {}).value || "";
            const type = (document.getElementById("droType") || {}).value || "acces";
            const canal = (document.getElementById("droCanal") || {}).value || "courriel";
            const contact = (document.getElementById("droContact") || {}).value || "";

            // ⚠️ Les deux champs obligatoires sont exigés ICI **et** par la base
            // (`ck_demandes_droits_demandeur`, `recue_le not null`). Ce contrôle-ci
            // est une courtoisie qui évite l'aller-retour ; ce n'est pas lui la
            // barrière, et il ne doit pas être pris pour elle — l'import et la
            // reprise ne passent pas par là.
            if (!demandeur.trim()) {
                if (window.showToast) {
                    window.showToast("Une demande s’enregistre au nom de quelqu’un : sans lui, "
                        + "on ne saura pas à qui l’on a répondu.", "error");
                }
                return;
            }
            if (!recueLe) {
                if (window.showToast) {
                    window.showToast("La date de réception est l’origine du délai d’un mois. "
                        + "Sans elle, il n’y a pas d’horloge.", "error");
                }
                return;
            }

            DataStore.addDemandeDroits({
                id: UI.genId("DSAR"),
                type_demande: type,
                recue_le: recueLe,
                canal,
                demandeur: demandeur.trim(),
                contact: contact.trim() || null,
                identite_verifiee: false,
                prorogee: false,
                statut: "recue"
            });
            if (window.showToast) {
                window.showToast("Demande enregistrée. Le délai d’un mois court depuis la date "
                    + "de réception que vous avez indiquée.", "success");
            }
            // ⚠️ On attend que le SERVEUR sache, puis on le relit : l'échéance est
            // la sienne (voir `UI.apresEcriture`).
            UI.apresEcriture(() => charger(hote));
        });
    }

    return {
        monterVue,
        // Purement fonctionnels : ils composent sans réseau, et le banc les joue.
        corpsVueHtml, etatDe, resteLisible,
        contrat: Object.freeze({
            hote: ID_VUE,
            domaine: DOMAINE,
            etats: Object.keys(ETATS),
            types: TYPES.map(t => t.valeur),
            canaux: CANAUX.map(c => c.valeur),
            statuts: STATUTS.map(s => s.valeur)
        })
    };
})();

window.DroitsModule = DroitsModule;
