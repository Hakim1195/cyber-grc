// Emplacement : js/modules/ebios.js
// Nom du fichier : ebios.js
//
// Écran « Ateliers EBIOS RM » — lot L25, actions 25.1, 25.2 et 25.5.
//
// ── ⚠️ CE QUE CET ÉCRAN NE FAIT PAS, ET C'EST LE CŒUR DU LOT ────────────────
//
// **Il ne touche PAS au registre des risques.** Les risques cotés en F × G × M
// restent tels quels, lisibles, exportables — et cet écran n'écrit dans aucun
// d'eux. Le critère d'acceptation de l'action 25.1 est écrit en négatif : *« une
// migration qui les réinterpréterait réattribuerait EN SILENCE des cotations
// produites en audit »*, et c'est le motif qui a fait refuser la renumérotation
// du catalogue ANSSI (constat Q-192).
//
// Le produit porte donc **deux méthodes de cotation en même temps**, et il faut
// l'assumer devant l'utilisateur plutôt que de le lui cacher : l'écran le dit,
// en une phrase, à l'endroit où la question se pose.
//
// ── ⚠️ LA PERTINENCE VIENT DU SERVEUR, ET N'EST JAMAIS RECALCULÉE ICI ───────
//
// La note d'un couple source de risque / objectif visé est rendue par
// `GET /api/ebios/etat`, qui la tient de `f_ebios_pertinence()` — le seul endroit
// du produit où les trois critères sont moyennés. Écrire
// `(m + r + a) / 3` ici serait une seconde rédaction de la règle, et deux comptes
// de la même grandeur est ce qu'un outil produit en audit ne peut pas se
// permettre (constat Q-219).
//
// ⚠️ Et elle **se tait dès qu'un critère manque** : le serveur rend `null`, jamais
// une moyenne des deux autres. L'écran affiche alors « à évaluer », et surtout pas
// un chiffre — *un chiffre qui a l'air mesuré sans l'être est pire que pas de
// chiffre, parce qu'il est cité en comité de direction* (critère 25.4).
//
// ── LA DÉCISION RESTE HUMAINE ───────────────────────────────────────────────
//
// Retenir un couple engage les ateliers 3 et 4 : ils ne travailleront que sur les
// couples retenus. C'est donc une case à cocher **et une justification**, que le
// schéma exige (`ck_ebios_sources_risque_retenue`). L'écran ne propose aucun
// « retenir tous les couples au-dessus de 3 » : ce serait faire porter à une
// moyenne une décision d'analyse.

const EbiosModule = (() => {
    "use strict";

    const DOMAINE = "risques";

    /** Ce que chaque statut d'étude veut dire, et de quel ton. */
    const STATUTS = Object.freeze({
        cadrage:  { libelle: "Cadrage",   ton: "status-non-applicable",
                    dit: "Le périmètre et le cadre se posent. Rien n'est encore analysé." },
        en_cours: { libelle: "En cours",  ton: "status-partiellement-conforme",
                    dit: "Les ateliers se déroulent." },
        validee:  { libelle: "Validée",   ton: "status-conforme",
                    dit: "Quelqu'un a déclaré l'étude close. Ce n'est pas dérivé d'un compte d'ateliers remplis : une étude ne se valide pas toute seule." },
        archivee: { libelle: "Archivée",  ton: "status-non-applicable",
                    dit: "Conservée pour comparaison avec les exercices suivants." }
    });

    /** Les quatre critères de sécurité, vocabulaire DICP du produit. */
    const BESOINS = Object.freeze([
        { valeur: "disponibilite",   libelle: "Disponibilité" },
        { valeur: "integrite",       libelle: "Intégrité" },
        { valeur: "confidentialite", libelle: "Confidentialité" },
        { valeur: "tracabilite",     libelle: "Traçabilité" }
    ]);

    const NATURES = Object.freeze([
        { valeur: "processus",   libelle: "Processus métier" },
        { valeur: "information", libelle: "Information" }
    ]);

    /**
     * Les quatre niveaux d'origine — désormais un REPLI, plus une échelle.
     *
     * ⚠️ **Depuis l'action 25.3, la graduation vient de la base.** Tant qu'elle était
     * écrite ici, l'échelle publiée par une filiale aurait été une décoration : la base
     * aurait accepté un « 5 », et aucun écran ne l'aurait proposé. Cette liste ne sert
     * plus qu'au cas où aucune échelle n'est en vigueur — base antérieure à la migration
     * `049`, ou socle archivé sans successeur. Un écran cassé par une donnée manquante
     * est un écran cassé.
     */
    const NIVEAUX = Object.freeze([1, 2, 3, 4]);

    /** Les familles de l'écosystème, au vocabulaire de l'atelier 3. */
    const CATEGORIES = Object.freeze([
        { valeur: "client",         libelle: "Client" },
        { valeur: "fournisseur",    libelle: "Fournisseur" },
        { valeur: "partenaire",     libelle: "Partenaire" },
        { valeur: "entite_interne", libelle: "Entité interne" },
        { valeur: "autorite",       libelle: "Autorité" }
    ]);

    /**
     * Les quatre décisions de l'atelier 5, et ce que chacune engage.
     *
     * ⚠️ **« Accepter » est la seule qui exige une justification**, et ce n'est pas une
     * politesse : les trois autres produisent un travail que quelqu'un verra — un projet,
     * un contrat, un plan d'actions. Accepter ne produit RIEN. Sans la phrase qui dit
     * pourquoi, la décision est indistinguable d'un oubli, et c'est exactement celle
     * qu'un auditeur vient chercher. Le schéma l'impose ; l'écran la demande, plutôt que
     * de laisser remonter un code de contrainte.
     */
    const DECISIONS = Object.freeze({
        eviter:     { libelle: "Éviter",     ton: "status-conforme" },
        reduire:    { libelle: "Réduire",    ton: "status-partiellement-conforme" },
        transferer: { libelle: "Transférer", ton: "status-partiellement-conforme" },
        accepter:   { libelle: "Accepter",   ton: "status-non-conforme" }
    });

    /** Les quatre paliers d'un scénario, rendus par le serveur. */
    const PALIERS = Object.freeze({
        faible:       { libelle: "Faible",       ton: "status-conforme" },
        significatif: { libelle: "Significatif", ton: "status-partiellement-conforme" },
        eleve:        { libelle: "Élevé",        ton: "status-partiellement-conforme" },
        critique:     { libelle: "Critique",     ton: "status-non-conforme" }
    });

    /** Le dernier état rendu par le serveur — pertinences et comptes. */
    let dernierEtat = null;

    /* =====================================================================
       AFFICHAGE — tout passe par escapeHtml, sans exception
    ===================================================================== */

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function peutEcrire() {
        return !(window.Droits && typeof Droits.peutEcrire === "function")
            || Droits.peutEcrire(DOMAINE);
    }

    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(String(iso));
        return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("fr-FR");
    }

    /**
     * Le statut d'une étude, avec son ton.
     *
     * ⚠️ Un statut inconnu s'affiche **tel qu'il vient**, échappé, avec le ton
     * neutre : rien ne disparaît, le mot inconnu se lit en clair, et quelqu'un
     * doit décider. L'omission échoue donc du bon côté — celui qui montre
     * (`CLAUDE.md` §3).
     */
    function statutDe(code) {
        const clef = String(code || "");
        return Object.prototype.hasOwnProperty.call(STATUTS, clef)
            ? STATUTS[clef]
            : { libelle: clef || "inconnu", ton: "status-non-applicable",
                dit: "Statut inconnu de cette version de l'interface." };
    }

    function badgeStatut(code) {
        const s = statutDe(code);
        return '<span class="status ' + s.ton + '" title="' + esc(s.dit) + '">'
             + esc(s.libelle) + "</span>";
    }

    function optionsHtml(liste, choisi) {
        return liste.map(o =>
            '<option value="' + esc(o.valeur) + '"' + (o.valeur === choisi ? " selected" : "")
            + ">" + esc(o.libelle) + "</option>").join("");
    }

    /**
     * Les niveaux d'un SUJET de cotation, tirés de l'échelle en vigueur.
     *
     * ⚠️ Le sujet est un argument, et il est obligatoire : les quatre sujets n'ont
     * aucune raison de partager une graduation, et c'est très exactement ce que l'action
     * 25.3 permet de dissocier. Une gravité à cinq niveaux et une vraisemblance à quatre
     * cohabitent sans qu'une ligne d'ici ait à le savoir.
     */
    function niveauxHtml(sujet, choisi) {
        const replis = NIVEAUX.map(n => ({ valeur: n, libelle: String(n) }));
        return '<option value="">—</option>' + UI.optionsEchelle(sujet, choisi, replis);
    }

    /* =====================================================================
       LA LISTE DES ÉTUDES
    ===================================================================== */

    function renderList() {
        const app = document.getElementById("app");
        const ecriture = peutEcrire();

        app.innerHTML = `
            <section class="page">
                ${UI.enteteHtml({
                    titre: "Ateliers EBIOS RM",
                    aide: Help.tip("EBIOS Risk Manager est la méthode d'analyse de risque de l'ANSSI. Elle se conduit en cinq ateliers : cadrage et socle de sécurité, sources de risque, scénarios stratégiques, scénarios opérationnels, traitement. Cet écran porte les deux premiers ; les suivants arrivent avec la suite du lot."),
                    contexte: "Une étude par périmètre et par exercice. Elle s'ajoute au registre des risques — elle ne le remplace pas.",
                    onglets: UI.ongletsDe("/ebios"),
                    actions: ecriture
                        ? '<button type="button" id="ebiosNouvelle">Ouvrir une étude</button>'
                        : ""
                })}

                <div class="card" id="ebiosAvis">
                    <p class="muted">
                        ${esc("Les risques cotés en F × G × M restent valides et lisibles dans le Registre des risques : cette page s'y ajoute, elle ne le réinterprète pas. Une analyse conduite en audit ne se réécrit pas.")}
                    </p>
                </div>

                ${ecriture ? `
                <div class="card no-print" id="ebiosBlocCreation" hidden>
                    <h3>Ouvrir une étude ${Help.tip("Une étude, c'est un périmètre et un exercice : « chaîne de production, 2026 ». Sans elle, les valeurs métier et les sources de risque s'accumuleraient sans qu'on puisse dire de quelle analyse elles relèvent, ni comparer deux années.")}</h3>
                    <div class="form-grid">
                        <label>Intitulé
                            <input type="text" id="ebiosNom" maxlength="300"
                                   placeholder="Chaîne de production — exercice 2026" />
                        </label>
                        <label>Responsable
                            <input type="text" id="ebiosResponsable" maxlength="200"
                                   list="personnes-list" placeholder="Qui pilote l'étude" />
                        </label>
                        <label>Début
                            <input type="date" id="ebiosDebut" />
                        </label>
                    </div>
                    <label>Périmètre ${Help.tip("Ce que l'étude couvre, et surtout ce qu'elle NE couvre pas. C'est la première question de l'atelier 1, et celle qu'un auditeur pose pour savoir si l'analyse a répondu.")}
                        <textarea id="ebiosPerimetre" rows="2" maxlength="4000"
                                  placeholder="Le site de production et sa supervision. Hors périmètre : …"></textarea>
                    </label>
                    <button type="button" id="ebiosCreer">Créer l'étude</button>
                </div>` : ""}

                <div id="ebiosListe"><p class="muted">Chargement…</p></div>
            </section>`;

        if (ecriture) {
            document.getElementById("ebiosNouvelle").addEventListener("click", () => {
                const bloc = document.getElementById("ebiosBlocCreation");
                bloc.hidden = !bloc.hidden;
                if (!bloc.hidden) document.getElementById("ebiosNom").focus();
            });
            document.getElementById("ebiosCreer").addEventListener("click", creerEtude);
        }

        rafraichirListe();
    }

    /**
     * Dessine la liste **depuis la mémoire**, puis demande au serveur ce que lui
     * seul sait — les comptes et la gravité maximale — et repeint.
     *
     * ── ⚠️ POURQUOI LA LISTE NE VIENT PAS DU SERVEUR, ALORS QUE LES COMPTES SI ──
     *
     * La première rédaction dessinait tout depuis `GET /api/ebios/etat`, par
     * analogie avec l'écran des campagnes. C'était une analogie fausse, et le banc
     * l'a dit : une campagne n'existe **que** par son état dérivé, tandis qu'une
     * étude est une entité ordinaire, tenue en mémoire par `DataStore` comme un
     * risque ou un document.
     *
     * Deux conséquences, et la seconde est celle qui a fait rougir :
     *
     *  · une étude qu'on vient de créer n'apparaissait qu'au rechargement suivant,
     *    parce que la réponse du serveur avait été demandée avant l'écriture ;
     *  · l'identifiant rendu dans le balisage n'était plus celui que
     *    `recalerBalisage()` (`js/core/sync.js`) recale après que le serveur a
     *    réattribué les identifiants — c'est-à-dire que la convention du
     *    `CLAUDE.md` §3 n'avait plus rien sur quoi mordre.
     *
     * Les comptes, eux, restent au serveur : ils sont COMPTÉS à l'instant où l'on
     * regarde, et les recompter ici donnerait un second chiffre qui divergerait dès
     * qu'une autre session écrit. Tant qu'ils ne sont pas revenus, on affiche
     * « — » — et surtout pas zéro, qui serait une affirmation fausse.
     */
    function rafraichirListe() {
        peuplerListe();
        if (!window.Api || typeof Api.ebiosEtat !== "function") return;
        Api.ebiosEtat().then(r => { dernierEtat = r; peuplerListe(); }).catch(() => {
            // Les études restent affichées ; seuls les comptes manquent, et la
            // colonne dit « — » plutôt que d'inventer un zéro.
        });
    }

    /** Les comptes du serveur pour une étude, ou `null` s'ils ne sont pas revenus. */
    function comptesDe(etudeId) {
        if (!dernierEtat || !dernierEtat.etudes) return null;
        return dernierEtat.etudes.find(e => e.id === etudeId) || null;
    }

    function peuplerListe() {
        const cible = document.getElementById("ebiosListe");
        if (!cible) return;
        const etudes = DataStore.getEbiosEtudes();

        if (etudes.length === 0) {
            // ⚠️ Un état vide DIT POURQUOI il est vide. Un vide sans explication
            // apprend à ne plus croire ce qu'on montre — classe Q-201 / Q-207.
            cible.innerHTML = '<div class="card"><p class="chart-empty">'
                + esc("Aucune étude EBIOS RM pour ce périmètre. Une étude se crée par un geste : le produit n'en déduit aucune à partir des risques déjà cotés, parce qu'une cotation F × G × M ne dit ni la valeur métier atteinte, ni la source, ni l'objectif visé.")
                + "</p></div>";
            return;
        }

        const lignes = etudes.map(e => {
            const c = comptesDe(e.id);
            const nombre = (valeur) => (c == null || valeur == null ? "—" : esc(String(valeur)));
            return `
            <tr class="clickable-row" data-id="${esc(e.id)}">
                <td><strong>${esc(e.nom)}</strong></td>
                <td>${badgeStatut(e.statut)}</td>
                <td>${esc(e.responsable || "—")}</td>
                <td>${esc(fmtDate(e.debut_le))}</td>
                <td style="text-align:right;">${nombre(c && c.valeursMetier)}</td>
                <td style="text-align:right;">${nombre(c && c.evenementsRedoutes)}</td>
                <td style="text-align:right;">${nombre(c && c.graviteMax)}</td>
                <td style="text-align:right;">${c == null ? "—"
                    : esc(String(c.sourcesRetenues)) + " / " + esc(String(c.sources))}</td>
            </tr>`;
        }).join("");

        cible.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Étude</th>
                        <th>Statut</th>
                        <th>Responsable</th>
                        <th>Début</th>
                        <th style="text-align:right;">Valeurs métier</th>
                        <th style="text-align:right;">Év. redoutés</th>
                        <th style="text-align:right;">Gravité max ${Help.tip("La gravité la plus HAUTE de ses événements redoutés, et non une moyenne : une moyenne diluerait l'événement catastrophique dans les anodins, et c'est lui qui commande l'analyse.")}</th>
                        <th style="text-align:right;">Couples retenus</th>
                    </tr>
                </thead>
                <tbody>${lignes}</tbody>
            </table>`;

        // ⚠️ L'identifiant se lit dans l'attribut AU MOMENT DU CLIC, jamais capturé
        //    en fermeture : le serveur réattribue les identifiants à la création, et
        //    une fermeture qui a capturé l'ancien viserait un enregistrement qui
        //    n'existe plus, EN SILENCE (`CLAUDE.md` §3).
        cible.querySelectorAll("tr.clickable-row").forEach(ligne => {
            ligne.addEventListener("click", () => {
                Router.navigateTo("/ebios/" + ligne.dataset.id);
            });
        });
    }

    function creerEtude() {
        const nom = ((document.getElementById("ebiosNom") || {}).value || "").trim();
        if (nom === "") {
            if (window.showToast) showToast("Donnez un intitulé à l'étude.", "warning");
            return;
        }
        const debut = (document.getElementById("ebiosDebut") || {}).value || "";
        const etude = {
            id: UI.genId("EBET"),
            nom: nom,
            perimetre: ((document.getElementById("ebiosPerimetre") || {}).value || "").trim(),
            cadre: "",
            responsable: ((document.getElementById("ebiosResponsable") || {}).value || "").trim(),
            statut: "cadrage",
            debut_le: debut || new Date().toISOString().slice(0, 10),
            validee_le: "",
            notes: ""
        };
        DataStore.addEbiosEtude(etude);
        if (window.showToast) showToast("Étude créée. Ouvrez-la pour conduire l'atelier 1.", "success");
        // ⚠️ `UI.apresEcriture` et non un appel direct : le serveur réattribue
        //    l'identifiant, et redessiner avant que l'écriture soit revenue
        //    afficherait une étude qui n'existe pas encore sous ce nom-là.
        UI.apresEcriture(() => rafraichirListe());
    }

    /* =====================================================================
       LA FICHE D'UNE ÉTUDE — ateliers 1 et 2
    ===================================================================== */

    function renderDetail(id) {
        const app = document.getElementById("app");
        const etude = DataStore.getEbiosEtudeById(id);
        if (!etude) {
            app.innerHTML = '<section class="page"><div class="card"><p class="chart-empty">'
                + esc("Cette étude est introuvable dans le périmètre courant.")
                + '</p><p><a href="#/ebios">Revenir aux ateliers</a></p></div></section>';
            return;
        }
        const ecriture = peutEcrire();

        app.innerHTML = `
            <section class="page">
                ${UI.enteteHtml({
                    titre: etude.nom,
                    contexte: "Étude EBIOS RM — ateliers 1 et 2.",
                    actions: '<a href="#/ebios" class="btn-secondary">Toutes les études</a>'
                        + (ecriture ? ' <button type="button" id="ebiosSupprimer" class="btn-danger">Supprimer l\'étude</button>' : "")
                })}

                <div class="card">
                    <h3>Cadrage ${Help.tip("L'atelier 1 commence par dire ce que l'étude couvre, qui l'a demandée et qui la pilote. Un périmètre non écrit est un périmètre qu'on élargira sans s'en apercevoir.")}</h3>
                    <div class="form-grid">
                        <label>Statut
                            <select id="edStatut" ${ecriture ? "" : "disabled"}>
                                ${optionsHtml(Object.keys(STATUTS).map(k => ({ valeur: k, libelle: STATUTS[k].libelle })), etude.statut)}
                            </select>
                        </label>
                        <label>Responsable
                            <input type="text" id="edResponsable" maxlength="200" list="personnes-list"
                                   value="${esc(etude.responsable || "")}" ${ecriture ? "" : "disabled"} />
                        </label>
                        <label>Validée le
                            <input type="date" id="edValidee" value="${esc(etude.validee_le || "")}"
                                   ${ecriture ? "" : "disabled"} />
                        </label>
                    </div>
                    <label>Périmètre
                        <textarea id="edPerimetre" rows="2" maxlength="4000" ${ecriture ? "" : "disabled"}>${esc(etude.perimetre || "")}</textarea>
                    </label>
                    <label>Cadre de l'étude ${Help.tip("Commanditaire, objectif, participants, cadre réglementaire invoqué. Deux ans après, c'est ce qui dit qui a demandé quoi et qui était dans la salle.")}
                        <textarea id="edCadre" rows="2" maxlength="4000" ${ecriture ? "" : "disabled"}>${esc(etude.cadre || "")}</textarea>
                    </label>
                    ${ecriture ? '<button type="button" id="edEnregistrer">Enregistrer le cadrage</button>' : ""}
                    <p class="muted" style="margin-top:.75rem;">
                        ${esc("Le socle de sécurité de l'atelier 1 n'est pas ressaisi ici : ce sont vos référentiels applicables et vos mesures de sécurité, déjà tenus ailleurs dans l'outil. Les biens supports non plus : ce sont vos actifs et leur cartographie.")}
                    </p>
                </div>

                <div class="card">
                    <h3>Atelier 1 — valeurs métier et événements redoutés
                        ${Help.tip("Une valeur métier est un processus ou une information dont la compromission serait redoutée. Un événement redouté, c'est l'atteinte : ce qui est touché (disponibilité, intégrité, confidentialité, traçabilité) et à quel point c'est grave.")}</h3>
                    <div id="edValeurs"></div>
                    ${ecriture ? `
                    <div class="form-grid" style="margin-top:1rem;">
                        <label>Valeur métier
                            <input type="text" id="vmNom" maxlength="300" placeholder="Ordonnancement de la production" />
                        </label>
                        <label>Nature
                            <select id="vmNature">${optionsHtml(NATURES, "processus")}</select>
                        </label>
                        <label>Processus du bilan d'impact ${Help.tip("Si cette valeur métier est un processus déjà décrit dans vos bilans d'impact, reliez-la : sa criticité, son RTO et son RPO restent lus là-bas, et ne sont pas recopiés ici. Deux réponses à la même question, c'est une de trop.")}
                            <select id="vmProcessus"></select>
                        </label>
                    </div>
                    <button type="button" id="vmAjouter">Ajouter la valeur métier</button>` : ""}
                </div>

                <div class="card">
                    <h3>Atelier 2 — sources de risque et objectifs visés
                        ${Help.tip("Un couple, c'est « qui » et « pour obtenir quoi » : un concurrent qui cherche un plan de fabrication et un concurrent qui cherche à nuire à l'image sont deux couples, pas une source avec deux notes.")}</h3>
                    <div id="edSources"></div>
                    ${ecriture ? `
                    <div class="form-grid" style="margin-top:1rem;">
                        <label>Source de risque
                            <input type="text" id="srSource" maxlength="300" list="ebiosSourcesConnues"
                                   placeholder="Cybercriminel organisé" />
                            <datalist id="ebiosSourcesConnues"></datalist>
                        </label>
                        <label>Objectif visé
                            <input type="text" id="srObjectif" maxlength="300" placeholder="Obtenir une rançon" />
                        </label>
                        <label>Motivation ${Help.tip("À quel point cette source tient à son objectif. L'échelle proposée va de 1 à 4.")}
                            <select id="srMotivation">${niveauxHtml("criteres_source", "")}</select>
                        </label>
                        <label>Ressources ${Help.tip("Les moyens dont elle dispose : compétences, outillage, budget, temps.")}
                            <select id="srRessources">${niveauxHtml("criteres_source", "")}</select>
                        </label>
                        <label>Activité ${Help.tip("À quel point elle est active en ce moment, dans votre secteur.")}
                            <select id="srActivite">${niveauxHtml("criteres_source", "")}</select>
                        </label>
                    </div>
                    <button type="button" id="srAjouter">Ajouter le couple</button>` : ""}
                </div>

                <div class="card">
                    <h3>Atelier 3 — l'écosystème
                        ${Help.tip("Une partie prenante est une organisation dont vous dépendez, qui pénètre votre système, ou les deux. On l'évalue sur quatre critères : dépendance, pénétration, maturité cyber, confiance. Le niveau de menace en découle — il est calculé par le serveur, pas saisi.")}</h3>
                    <p class="muted">
                        ${esc("La cartographie de vos actifs et de leurs dépendances n'est pas refaite ici : elle vit dans l'écran Cartographie. Ce que l'atelier 3 ajoute, c'est l'évaluation des parties prenantes.")}
                    </p>
                    <div id="edParties"></div>
                    ${ecriture ? `
                    <div class="form-grid" style="margin-top:1rem;">
                        <label>Partie prenante
                            <input type="text" id="ppNom" maxlength="300" placeholder="Mainteneur de la supervision" />
                        </label>
                        <label>Famille
                            <select id="ppCategorie">${optionsHtml(CATEGORIES, "fournisseur")}</select>
                        </label>
                        <label>Tiers déjà enregistré ${Help.tip("Si cette partie prenante est déjà dans vos Prestataires, reliez-la : sa raison sociale, sa criticité et son niveau d'accès restent lus là-bas, et ne sont pas recopiés ici.")}
                            <select id="ppPrestataire"></select>
                        </label>
                        <label>Dépendance ${Help.tip("À quel point votre activité dépend d'elle.")}
                            <select id="ppDependance">${niveauxHtml("criteres_partie_prenante", "")}</select>
                        </label>
                        <label>Pénétration ${Help.tip("À quel point elle est présente dans votre système : accès, interconnexions, droits.")}
                            <select id="ppPenetration">${niveauxHtml("criteres_partie_prenante", "")}</select>
                        </label>
                        <label>Maturité cyber ${Help.tip("Ce que vous savez de son niveau de sécurité.")}
                            <select id="ppMaturite">${niveauxHtml("criteres_partie_prenante", "")}</select>
                        </label>
                        <label>Confiance ${Help.tip("Ce que vous savez de sa fiabilité : historique, contrat, transparence.")}
                            <select id="ppConfiance">${niveauxHtml("criteres_partie_prenante", "")}</select>
                        </label>
                    </div>
                    <button type="button" id="ppAjouter">Ajouter la partie prenante</button>` : ""}
                </div>

                <div class="card">
                    <h3>Atelier 3 — les chemins d'attaque
                        ${Help.tip("Un scénario stratégique dit par où une source de risque RETENUE atteint un événement redouté, et par quelle partie prenante elle passe. Sa gravité est celle de l'événement redouté : elle n'est pas ressaisie.")}</h3>
                    <div id="edChemins"></div>
                    ${ecriture ? `
                    <div class="form-grid" style="margin-top:1rem;">
                        <label>Intitulé du chemin
                            <input type="text" id="ssNom" maxlength="300" placeholder="Le concurrent passe par le mainteneur" />
                        </label>
                        <label>Source retenue ${Help.tip("Seuls les couples que vous avez RETENUS à l'atelier 2 sont proposés : c'est ce que cette décision engage.")}
                            <select id="ssSource"></select>
                        </label>
                        <label>Événement redouté
                            <select id="ssEvenement"></select>
                        </label>
                        <label>Par quelle partie prenante
                            <select id="ssPartie"></select>
                        </label>
                    </div>
                    <button type="button" id="ssAjouter">Ajouter le chemin</button>` : ""}
                </div>

                <div class="card">
                    <h3>Ateliers 4 et 5 — modes opératoires et traitement
                        ${Help.tip("L'atelier 4 décrit comment le chemin se réalise techniquement, et à quel point c'est vraisemblable. L'atelier 5 décide quoi en faire : éviter, réduire, transférer ou accepter.")}</h3>
                    <div id="edModes"></div>
                    ${ecriture ? `
                    <div class="form-grid" style="margin-top:1rem;">
                        <label>Chemin concerné
                            <select id="soChemin"></select>
                        </label>
                        <label>Mode opératoire
                            <input type="text" id="soNom" maxlength="300" placeholder="Hameçonnage ciblé puis élévation de privilèges" />
                        </label>
                        <label>Bien support visé
                            <select id="soActif"></select>
                        </label>
                        <label>Vraisemblance ${Help.tip("À quel point ce mode opératoire est plausible ici, compte tenu de ce qui est déjà en place.")}
                            <select id="soVraisemblance">${niveauxHtml("vraisemblance", "")}</select>
                        </label>
                    </div>
                    <button type="button" id="soAjouter">Ajouter le mode opératoire</button>` : ""}
                    <p class="muted" style="margin-top:.75rem;">
                        ${esc("Rattacher un mode opératoire à un risque du registre ne modifie PAS ce risque : sa cotation fréquence × gravité × maîtrise reste la vôtre. Le lien sert à ce que le plan d'actions déjà rattaché à ce risque s'applique ici aussi.")}
                    </p>
                </div>
            </section>`;

        if (ecriture) {
            document.getElementById("edEnregistrer")
                .addEventListener("click", () => enregistrerCadrage(id));
            document.getElementById("vmAjouter")
                .addEventListener("click", () => ajouterValeurMetier(id));
            document.getElementById("srAjouter")
                .addEventListener("click", () => ajouterSource(id));
            // ⚠️ **L'IDENTIFIANT, PAS L'ÉLÉMENT.** `UI.wireDelete` fait lui-même le
            //    `getElementById`, et rend la main SANS UN MOT quand il ne trouve rien.
            //    Passer l'élément produit donc un bouton parfaitement visible dont le
            //    clic ne fait RIEN : ni dialogue, ni requête, ni message. Mesuré au
            //    navigateur sur la recette, le 18/09/2026 — le banc ne pouvait pas le
            //    voir, aucun de ses essais n'allant jusqu'à supprimer depuis la fiche.
            //    C'est la classe que ce dépôt proscrit partout : *quelque chose réussit
            //    en silence alors que c'est faux.*
            document.getElementById("ppAjouter")
                .addEventListener("click", () => ajouterPartiePrenante(id));
            document.getElementById("ssAjouter")
                .addEventListener("click", () => ajouterChemin(id));
            document.getElementById("soAjouter")
                .addEventListener("click", () => ajouterMode(id));
            UI.wireDelete({
                button: "ebiosSupprimer",
                confirm: "Supprimer cette étude ? Ses valeurs métier, ses événements redoutés et ses couples source / objectif partent avec elle. Vos risques cotés en F × G × M ne sont pas touchés.",
                remove: () => DataStore.deleteEbiosEtude(id),
                toast: "Étude supprimée.",
                redirect: "/ebios"
            });
            peuplerProcessus();
            peuplerSourcesConnues();
            peuplerListesAteliers(id);
        }

        dessinerValeurs(id, ecriture);
        dessinerSources(id, ecriture);
        dessinerParties(id, ecriture);
        dessinerChemins(id, ecriture);
        dessinerModes(id, ecriture);

        // La pertinence vient du serveur : on la demande, puis on repeint les couples.
        if (window.Api && typeof Api.ebiosEtat === "function") {
            Api.ebiosEtat().then(r => {
                dernierEtat = r;
                dessinerSources(id, ecriture);
                dessinerParties(id, ecriture);
                dessinerChemins(id, ecriture);
                dessinerModes(id, ecriture);
            }).catch(() => { /* les grandeurs dérivées restent « à évaluer » */ });
        }
    }

    function peuplerProcessus() {
        const select = document.getElementById("vmProcessus");
        if (!select) return;
        const processus = DataStore.getProcessus ? DataStore.getProcessus() : [];
        select.innerHTML = '<option value="">— aucun —</option>'
            + processus.map(p => '<option value="' + esc(p.id) + '">' + esc(p.nom) + "</option>").join("");
    }

    /**
     * Les sources de risque du socle de connaissances, en suggestion de saisie.
     *
     * ⚠️ `getEbiosConnaissancesDuGenre` ne rend que ce que la RLS a laissé passer :
     * le socle du Groupe et les ajouts de CETTE filiale. Un filtre de plus ici
     * serait une barrière que le client peut retirer — et une illusion de barrière.
     */
    function peuplerSourcesConnues() {
        const liste = document.getElementById("ebiosSourcesConnues");
        if (!liste) return;
        const connues = DataStore.getEbiosConnaissancesDuGenre("source_risque");
        liste.innerHTML = connues.map(c =>
            '<option value="' + esc(c.nom) + '">' + esc(c.objectif_vise || "") + "</option>").join("");
    }

    function enregistrerCadrage(id) {
        const etude = DataStore.getEbiosEtudeById(id);
        if (!etude) return;
        const statut = (document.getElementById("edStatut") || {}).value || "cadrage";
        const validee = (document.getElementById("edValidee") || {}).value || "";
        // ⚠️ Le schéma exige qu'une étude « validée » porte sa date (`ck_ebios_etudes_validee`).
        //    On le dit ICI plutôt que de laisser remonter un refus de la base, qui
        //    arriverait à l'utilisateur sous la forme d'un code de contrainte.
        if (statut === "validee" && validee === "") {
            if (window.showToast) {
                showToast("Une étude validée porte sa date de validation : renseignez-la.", "warning");
            }
            return;
        }
        etude.statut = statut;
        etude.validee_le = validee;
        etude.responsable = ((document.getElementById("edResponsable") || {}).value || "").trim();
        etude.perimetre = ((document.getElementById("edPerimetre") || {}).value || "").trim();
        etude.cadre = ((document.getElementById("edCadre") || {}).value || "").trim();
        DataStore.updateEbiosEtude(etude);
        if (window.showToast) showToast("Cadrage enregistré.", "success");
        UI.apresEcriture(() => renderDetail(id));
    }

    /* ── Atelier 1 ─────────────────────────────────────────────────────── */

    function dessinerValeurs(etudeId, ecriture) {
        const cible = document.getElementById("edValeurs");
        if (!cible) return;
        const valeurs = DataStore.getEbiosValeursMetier(etudeId);

        if (valeurs.length === 0) {
            cible.innerHTML = '<p class="chart-empty">'
                + esc("Aucune valeur métier. Commencez par ce que l'organisation ne peut pas se permettre de perdre : un processus, une information.")
                + "</p>";
            return;
        }

        cible.innerHTML = valeurs.map(v => {
            const processus = v.processus_id && DataStore.getProcessusById
                ? DataStore.getProcessusById(v.processus_id) : null;
            const evenements = DataStore.getEbiosEvenementsRedoutes(v.id);
            const lignes = evenements.map(r => `
                <tr data-er="${esc(r.id)}">
                    <td>${esc(r.nom)}</td>
                    <td>${esc((BESOINS.find(b => b.valeur === r.besoin) || {}).libelle || r.besoin)}</td>
                    <td style="text-align:right;">${r.gravite == null || r.gravite === "" ? "—" : esc(String(r.gravite))}</td>
                    <td>${esc(r.impacts || "—")}</td>
                    <td class="stop-row-click">${ecriture
                        ? '<button type="button" class="btn-secondary erSupprimer" data-er="' + esc(r.id) + '">Retirer</button>'
                        : ""}</td>
                </tr>`).join("");

            return `
            <div class="card" style="margin-bottom:.75rem;" data-vm="${esc(v.id)}">
                <h4 style="margin-top:0;">${esc(v.nom)}
                    <span class="badge">${esc((NATURES.find(n => n.valeur === v.nature) || {}).libelle || v.nature)}</span>
                    ${processus ? '<span class="badge" title="' + esc("Criticité, RTO et RPO sont lus dans le bilan d'impact, jamais recopiés ici.") + '">BIA : ' + esc(processus.nom) + "</span>" : ""}
                    ${ecriture ? '<button type="button" class="btn-danger vmSupprimer" data-vm="' + esc(v.id) + '" style="float:right;">Retirer</button>' : ""}
                </h4>
                ${v.description ? "<p>" + esc(v.description) + "</p>" : ""}
                ${evenements.length === 0
                    ? '<p class="chart-empty">' + esc("Aucun événement redouté pour cette valeur métier.") + "</p>"
                    : `<table class="data-table"><thead><tr>
                        <th>Événement redouté</th><th>Besoin atteint</th>
                        <th style="text-align:right;">Gravité</th><th>Impacts</th><th></th>
                       </tr></thead><tbody>${lignes}</tbody></table>`}
                ${ecriture ? `
                <div class="form-grid" style="margin-top:.5rem;">
                    <label>Événement redouté
                        <input type="text" class="erNom" maxlength="300" placeholder="Arrêt de plus de 24 heures" />
                    </label>
                    <label>Besoin atteint
                        <select class="erBesoin">${optionsHtml(BESOINS, "disponibilite")}</select>
                    </label>
                    <label>Gravité
                        <select class="erGravite">${niveauxHtml("gravite", "")}</select>
                    </label>
                    <label>Impacts
                        <input type="text" class="erImpacts" maxlength="4000" placeholder="Pénalités, image, sécurité des personnes" />
                    </label>
                </div>
                <button type="button" class="erAjouter" data-vm="${esc(v.id)}">Ajouter l'événement redouté</button>` : ""}
            </div>`;
        }).join("");

        if (!ecriture) return;

        cible.querySelectorAll(".erAjouter").forEach(bouton => {
            bouton.addEventListener("click", () => ajouterEvenement(etudeId, bouton.dataset.vm));
        });
        cible.querySelectorAll(".erSupprimer").forEach(bouton => {
            bouton.addEventListener("click", () => {
                DataStore.deleteEbiosEvenementRedoute(bouton.dataset.er);
                UI.apresEcriture(() => dessinerValeurs(etudeId, ecriture));
            });
        });
        cible.querySelectorAll(".vmSupprimer").forEach(bouton => {
            bouton.addEventListener("click", () => {
                if (!confirm("Retirer cette valeur métier ? Ses événements redoutés partent avec elle.")) return;
                DataStore.deleteEbiosValeurMetier(bouton.dataset.vm);
                UI.apresEcriture(() => dessinerValeurs(etudeId, ecriture));
            });
        });
    }

    function ajouterValeurMetier(etudeId) {
        const nom = ((document.getElementById("vmNom") || {}).value || "").trim();
        if (nom === "") {
            if (window.showToast) showToast("Nommez la valeur métier.", "warning");
            return;
        }
        const nature = (document.getElementById("vmNature") || {}).value || "processus";
        const processusId = (document.getElementById("vmProcessus") || {}).value || "";
        // ⚠️ Le schéma refuse qu'une valeur métier de nature « information » désigne un
        //    processus (`ck_ebios_valeurs_metier_lien`) : on le dit ici plutôt que de
        //    laisser remonter un code de contrainte.
        if (processusId !== "" && nature !== "processus") {
            if (window.showToast) {
                showToast("Seule une valeur métier de nature « processus » peut être reliée à un bilan d'impact.", "warning");
            }
            return;
        }
        DataStore.addEbiosValeurMetier({
            id: UI.genId("EBVM"),
            etude_id: etudeId,
            nom: nom,
            nature: nature,
            processus_id: processusId,
            responsable: "",
            description: ""
        });
        document.getElementById("vmNom").value = "";
        UI.apresEcriture(() => dessinerValeurs(etudeId, true));
    }

    function ajouterEvenement(etudeId, valeurMetierId) {
        const bloc = document.querySelector('[data-vm="' + valeurMetierId + '"]');
        if (!bloc) return;
        const nom = (bloc.querySelector(".erNom").value || "").trim();
        if (nom === "") {
            if (window.showToast) showToast("Nommez l'événement redouté.", "warning");
            return;
        }
        const gravite = bloc.querySelector(".erGravite").value;
        DataStore.addEbiosEvenementRedoute({
            id: UI.genId("EBER"),
            valeur_metier_id: valeurMetierId,
            nom: nom,
            besoin: bloc.querySelector(".erBesoin").value || "disponibilite",
            gravite: gravite === "" ? "" : Number(gravite),
            impacts: (bloc.querySelector(".erImpacts").value || "").trim(),
            description: ""
        });
        UI.apresEcriture(() => dessinerValeurs(etudeId, true));
    }

    /* ── Atelier 2 ─────────────────────────────────────────────────────── */

    /**
     * La pertinence SUGGÉRÉE d'un couple, telle que le serveur l'a rendue.
     *
     * ⚠️ Elle n'est jamais recalculée ici — voir l'en-tête du fichier. Quand le
     * serveur n'a rien rendu (critère manquant, ou état pas encore chargé), on
     * affiche « à évaluer » et surtout pas un chiffre.
     */
    function pertinenceDe(coupleId) {
        if (!dernierEtat || !dernierEtat.couples) return null;
        const trouve = dernierEtat.couples.find(c => c.id === coupleId);
        return trouve && trouve.pertinenceSuggeree != null ? trouve.pertinenceSuggeree : null;
    }

    function dessinerSources(etudeId, ecriture) {
        const cible = document.getElementById("edSources");
        if (!cible) return;
        const sources = DataStore.getEbiosSourcesRisque(etudeId);

        if (sources.length === 0) {
            cible.innerHTML = '<p class="chart-empty">'
                + esc("Aucun couple source de risque / objectif visé. Les ateliers 3 et 4 travailleront sur ceux que vous retiendrez ici.")
                + "</p>";
            return;
        }

        const lignes = sources.map(s => {
            const note = pertinenceDe(s.id);
            return `
            <tr data-sr="${esc(s.id)}">
                <td><strong>${esc(s.source)}</strong></td>
                <td>${esc(s.objectif_vise)}</td>
                <td style="text-align:right;">${s.motivation == null || s.motivation === "" ? "—" : esc(String(s.motivation))}</td>
                <td style="text-align:right;">${s.ressources == null || s.ressources === "" ? "—" : esc(String(s.ressources))}</td>
                <td style="text-align:right;">${s.activite == null || s.activite === "" ? "—" : esc(String(s.activite))}</td>
                <td style="text-align:right;">${note == null
                    ? '<span class="muted" title="' + esc("La suggestion se tait dès qu'un des trois critères manque : un chiffre calculé sur deux critères sur trois aurait l'air mesuré sans l'être.") + '">à évaluer</span>'
                    : "<strong>" + esc(String(note)) + "</strong>"}</td>
                <td>${s.retenue
                    ? '<span class="status status-conforme">Retenu</span>'
                    : '<span class="status status-non-applicable">Écarté</span>'}</td>
                <td>${esc(s.justification || "—")}</td>
                <td class="stop-row-click">${ecriture ? `
                    <button type="button" class="btn-secondary srBasculer" data-sr="${esc(s.id)}">${s.retenue ? "Écarter" : "Retenir"}</button>
                    <button type="button" class="btn-danger srSupprimer" data-sr="${esc(s.id)}">Retirer</button>` : ""}</td>
            </tr>`;
        }).join("");

        cible.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Source de risque</th><th>Objectif visé</th>
                        <th style="text-align:right;">Mot.</th>
                        <th style="text-align:right;">Ress.</th>
                        <th style="text-align:right;">Act.</th>
                        <th style="text-align:right;">Pertinence ${Help.tip("Suggérée par le produit à partir des trois critères — ce n'est pas une décision. Retenir un couple engage les ateliers 3 et 4, et c'est vous qui le décidez, en disant pourquoi.")}</th>
                        <th>Décision</th><th>Justification</th><th></th>
                    </tr>
                </thead>
                <tbody>${lignes}</tbody>
            </table>`;

        if (!ecriture) return;

        cible.querySelectorAll(".srBasculer").forEach(bouton => {
            bouton.addEventListener("click", () => basculerSource(etudeId, bouton.dataset.sr));
        });
        cible.querySelectorAll(".srSupprimer").forEach(bouton => {
            bouton.addEventListener("click", () => {
                DataStore.deleteEbiosSourceRisque(bouton.dataset.sr);
                UI.apresEcriture(() => dessinerSources(etudeId, ecriture));
            });
        });
    }

    function ajouterSource(etudeId) {
        const source = ((document.getElementById("srSource") || {}).value || "").trim();
        const objectif = ((document.getElementById("srObjectif") || {}).value || "").trim();
        if (source === "" || objectif === "") {
            if (window.showToast) {
                showToast("Un couple, c'est une source ET un objectif visé : les deux sont nécessaires.", "warning");
            }
            return;
        }
        const nombre = (id) => {
            const v = (document.getElementById(id) || {}).value || "";
            return v === "" ? "" : Number(v);
        };
        // Le lien vers le socle de connaissances, s'il existe — cherché sur le NOM saisi.
        const connue = DataStore.getEbiosConnaissancesDuGenre("source_risque")
            .find(c => c.nom === source && (c.objectif_vise || "") === objectif);
        DataStore.addEbiosSourceRisque({
            id: UI.genId("EBSR"),
            etude_id: etudeId,
            source: source,
            objectif_vise: objectif,
            connaissance_id: connue ? connue.id : "",
            motivation: nombre("srMotivation"),
            ressources: nombre("srRessources"),
            activite: nombre("srActivite"),
            // ⚠️ Un couple naît ÉCARTÉ. Le schéma exige une justification pour le
            //    retenir, et naître « retenu » obligerait à en inventer une.
            retenue: false,
            justification: ""
        });
        document.getElementById("srSource").value = "";
        document.getElementById("srObjectif").value = "";
        UI.apresEcriture(() => {
            dessinerSources(etudeId, true);
            if (window.Api && typeof Api.ebiosEtat === "function") {
                Api.ebiosEtat().then(r => { dernierEtat = r; dessinerSources(etudeId, true); })
                    .catch(() => { /* la note reste « à évaluer » */ });
            }
        });
    }

    /**
     * Retenir ou écarter un couple.
     *
     * ⚠️ **Retenir exige une justification, et le produit la DEMANDE** plutôt que
     * de laisser la base refuser l'écriture : `ck_ebios_sources_risque_retenue`
     * rendrait un code de contrainte, qui ne dit rien à l'utilisateur.
     *
     * ⚠️ Écarter ne l'efface pas : *« aucun signal cette année, à réexaminer »* est
     * exactement ce qu'un auditeur vient chercher l'année suivante.
     */
    function basculerSource(etudeId, sourceId) {
        const source = DataStore.getEbiosSourceRisqueById(sourceId);
        if (!source) return;
        if (!source.retenue) {
            const motif = prompt(
                "Pourquoi retenez-vous ce couple ? Les ateliers 3 et 4 ne travailleront que "
                + "sur les couples retenus, et cette phrase est ce qu'un auditeur lira en premier.",
                source.justification || "");
            if (motif === null) return;
            if (motif.trim() === "") {
                if (window.showToast) showToast("Un couple retenu porte sa justification.", "warning");
                return;
            }
            source.justification = motif.trim();
            source.retenue = true;
        } else {
            source.retenue = false;
        }
        DataStore.updateEbiosSourceRisque(source);
        UI.apresEcriture(() => dessinerSources(etudeId, true));
    }

    /* =====================================================================
       ATELIERS 3, 4 ET 5
    ===================================================================== */

    /** Les listes déroulantes qui puisent dans ce que l'étude porte déjà. */
    function peuplerListesAteliers(etudeId) {
        const option = (v, l) => '<option value="' + esc(v) + '">' + esc(l) + "</option>";

        const prestataires = DataStore.getPrestataires ? DataStore.getPrestataires() : [];
        const selPrest = document.getElementById("ppPrestataire");
        if (selPrest) {
            selPrest.innerHTML = option("", "— aucun —")
                + prestataires.map(p => option(p.id, p.societe || p.nom || p.id)).join("");
        }

        // ⚠️ **Seuls les couples RETENUS**, et c'est tout le sens de la décision de
        //    l'atelier 2 : les ateliers suivants ne travaillent que sur eux. Proposer
        //    les autres viderait « retenue » de sa portée.
        const selSource = document.getElementById("ssSource");
        if (selSource) {
            const retenus = DataStore.getEbiosSourcesRisque(etudeId).filter(x => x.retenue);
            selSource.innerHTML = retenus.length === 0
                ? option("", "— aucun couple retenu à l'atelier 2 —")
                : retenus.map(x => option(x.id, x.source + " → " + x.objectif_vise)).join("");
        }

        const selEvt = document.getElementById("ssEvenement");
        if (selEvt) {
            const valeurs = DataStore.getEbiosValeursMetier(etudeId).map(v => v.id);
            const evenements = DataStore.getEbiosEvenementsRedoutes()
                .filter(r => valeurs.indexOf(r.valeur_metier_id) !== -1);
            selEvt.innerHTML = evenements.length === 0
                ? option("", "— aucun événement redouté à l'atelier 1 —")
                : evenements.map(r => option(r.id, r.nom)).join("");
        }

        const selPartie = document.getElementById("ssPartie");
        if (selPartie) {
            selPartie.innerHTML = option("", "— directement, sans intermédiaire —")
                + DataStore.getEbiosPartiesPrenantes(etudeId)
                    .map(p => option(p.id, p.nom)).join("");
        }

        const selChemin = document.getElementById("soChemin");
        if (selChemin) {
            const chemins = DataStore.getEbiosScenariosStrategiques(etudeId);
            selChemin.innerHTML = chemins.length === 0
                ? option("", "— aucun chemin d'attaque —")
                : chemins.map(c => option(c.id, c.nom)).join("");
        }

        const selActif = document.getElementById("soActif");
        if (selActif) {
            const actifs = DataStore.getActifs ? DataStore.getActifs() : [];
            selActif.innerHTML = option("", "— aucun —")
                + actifs.map(a => option(a.id, a.nom)).join("");
        }
    }

    /** Ce que le serveur a dérivé pour une partie prenante, ou `null`. */
    function menaceDe(id) {
        if (!dernierEtat || !dernierEtat.partiesPrenantes) return null;
        const t = dernierEtat.partiesPrenantes.find(p => p.id === id);
        return t && t.niveauMenace != null ? t.niveauMenace : null;
    }

    function cheminServeur(id) {
        if (!dernierEtat || !dernierEtat.scenariosStrategiques) return null;
        return dernierEtat.scenariosStrategiques.find(s => s.id === id) || null;
    }

    function modeServeur(id) {
        if (!dernierEtat || !dernierEtat.scenariosOperationnels) return null;
        return dernierEtat.scenariosOperationnels.find(o => o.id === id) || null;
    }

    function dessinerParties(etudeId, ecriture) {
        const cible = document.getElementById("edParties");
        if (!cible) return;
        const parties = DataStore.getEbiosPartiesPrenantes(etudeId);
        if (parties.length === 0) {
            cible.innerHTML = '<p class="chart-empty">'
                + esc("Aucune partie prenante évaluée. Commencez par celles dont vous dépendez le plus, ou qui ont le plus d'accès.")
                + "</p>";
            return;
        }
        const lignes = parties.map(p => {
            const menace = menaceDe(p.id);
            const nombre = (v) => (v == null || v === "" ? "—" : esc(String(v)));
            return `
            <tr data-pp="${esc(p.id)}">
                <td><strong>${esc(p.nom)}</strong></td>
                <td>${esc((CATEGORIES.find(c => c.valeur === p.categorie) || {}).libelle || p.categorie)}</td>
                <td style="text-align:right;">${nombre(p.dependance)}</td>
                <td style="text-align:right;">${nombre(p.penetration)}</td>
                <td style="text-align:right;">${nombre(p.maturite)}</td>
                <td style="text-align:right;">${nombre(p.confiance)}</td>
                <td style="text-align:right;">${menace == null
                    ? '<span class="muted" title="' + esc("Le calcul se tait tant que les quatre critères ne sont pas cotés : une menace calculée sur trois critères sur quatre aurait l'air mesurée sans l'être.") + '">à évaluer</span>'
                    : "<strong>" + esc(String(menace)) + "</strong>"}</td>
                <td class="stop-row-click">${ecriture
                    ? '<button type="button" class="btn-danger ppSupprimer" data-pp="' + esc(p.id) + '">Retirer</button>'
                    : ""}</td>
            </tr>`;
        }).join("");
        cible.innerHTML = `
            <table class="data-table">
                <thead><tr>
                    <th>Partie prenante</th><th>Famille</th>
                    <th style="text-align:right;">Dép.</th><th style="text-align:right;">Pén.</th>
                    <th style="text-align:right;">Mat.</th><th style="text-align:right;">Conf.</th>
                    <th style="text-align:right;">Menace ${Help.tip("Dépendance × pénétration, rapportées à maturité × confiance. Au-delà de 1, vous dépendez d'elle plus que vous ne pouvez lui faire confiance. Calculé par le serveur.")}</th>
                    <th></th>
                </tr></thead>
                <tbody>${lignes}</tbody>
            </table>`;
        if (!ecriture) return;
        cible.querySelectorAll(".ppSupprimer").forEach(b => {
            b.addEventListener("click", () => {
                if (!confirm("Retirer cette partie prenante ? Les chemins qui passaient par elle la perdent, mais ne sont pas supprimés.")) return;
                DataStore.deleteEbiosPartiePrenante(b.dataset.pp);
                UI.apresEcriture(() => { dessinerParties(etudeId, ecriture); dessinerChemins(etudeId, ecriture); peuplerListesAteliers(etudeId); });
            });
        });
    }

    function ajouterPartiePrenante(etudeId) {
        const nom = ((document.getElementById("ppNom") || {}).value || "").trim();
        if (nom === "") {
            if (window.showToast) showToast("Nommez la partie prenante.", "warning");
            return;
        }
        const n = (id) => {
            const v = (document.getElementById(id) || {}).value || "";
            return v === "" ? "" : Number(v);
        };
        DataStore.addEbiosPartiePrenante({
            id: UI.genId("EBPP"),
            etude_id: etudeId,
            nom: nom,
            categorie: (document.getElementById("ppCategorie") || {}).value || "fournisseur",
            prestataire_id: (document.getElementById("ppPrestataire") || {}).value || "",
            dependance: n("ppDependance"),
            penetration: n("ppPenetration"),
            maturite: n("ppMaturite"),
            confiance: n("ppConfiance"),
            notes: ""
        });
        document.getElementById("ppNom").value = "";
        UI.apresEcriture(() => rafraichirDerive(etudeId));
    }

    function dessinerChemins(etudeId, ecriture) {
        const cible = document.getElementById("edChemins");
        if (!cible) return;
        const chemins = DataStore.getEbiosScenariosStrategiques(etudeId);
        if (chemins.length === 0) {
            cible.innerHTML = '<p class="chart-empty">'
                + esc("Aucun chemin d'attaque. Un chemin relie un couple retenu à l'atelier 2 à un événement redouté de l'atelier 1.")
                + "</p>";
            return;
        }
        const lignes = chemins.map(c => {
            const vu = cheminServeur(c.id);
            return `
            <tr data-ss="${esc(c.id)}">
                <td><strong>${esc(c.nom)}</strong></td>
                <td>${vu ? esc(vu.source + " → " + vu.objectifVise) : "—"}</td>
                <td>${vu && vu.partiePrenante ? esc(vu.partiePrenante) : esc("directement")}</td>
                <td>${vu ? esc(vu.evenementRedoute) : "—"}</td>
                <td style="text-align:right;">${vu && vu.gravite != null
                    ? "<strong>" + esc(String(vu.gravite)) + "</strong>"
                    : '<span class="muted">—</span>'}</td>
                <td class="stop-row-click">${ecriture
                    ? '<button type="button" class="btn-danger ssSupprimer" data-ss="' + esc(c.id) + '">Retirer</button>'
                    : ""}</td>
            </tr>`;
        }).join("");
        cible.innerHTML = `
            <table class="data-table">
                <thead><tr>
                    <th>Chemin</th><th>Source → objectif</th><th>Par</th>
                    <th>Événement redouté</th>
                    <th style="text-align:right;">Gravité ${Help.tip("Celle de l'événement redouté que ce chemin réalise. Elle n'est pas ressaisie ici : une seconde valeur vieillirait dès la prochaine réévaluation de l'atelier 1.")}</th>
                    <th></th>
                </tr></thead>
                <tbody>${lignes}</tbody>
            </table>`;
        if (!ecriture) return;
        cible.querySelectorAll(".ssSupprimer").forEach(b => {
            b.addEventListener("click", () => {
                if (!confirm("Retirer ce chemin ? Ses modes opératoires partent avec lui.")) return;
                DataStore.deleteEbiosScenarioStrategique(b.dataset.ss);
                UI.apresEcriture(() => rafraichirDerive(etudeId));
            });
        });
    }

    function ajouterChemin(etudeId) {
        const nom = ((document.getElementById("ssNom") || {}).value || "").trim();
        const source = (document.getElementById("ssSource") || {}).value || "";
        const evenement = (document.getElementById("ssEvenement") || {}).value || "";
        if (nom === "" || source === "" || evenement === "") {
            if (window.showToast) {
                showToast("Un chemin relie une source RETENUE à un événement redouté : les deux sont nécessaires.", "warning");
            }
            return;
        }
        DataStore.addEbiosScenarioStrategique({
            id: UI.genId("EBSS"),
            etude_id: etudeId,
            source_id: source,
            evenement_redoute_id: evenement,
            partie_prenante_id: (document.getElementById("ssPartie") || {}).value || "",
            nom: nom,
            chemin: "",
            notes: ""
        });
        document.getElementById("ssNom").value = "";
        UI.apresEcriture(() => rafraichirDerive(etudeId));
    }

    function dessinerModes(etudeId, ecriture) {
        const cible = document.getElementById("edModes");
        if (!cible) return;
        const chemins = DataStore.getEbiosScenariosStrategiques(etudeId).map(c => c.id);
        const modes = DataStore.getEbiosScenariosOperationnels()
            .filter(o => chemins.indexOf(o.scenario_strategique_id) !== -1);
        if (modes.length === 0) {
            cible.innerHTML = '<p class="chart-empty">'
                + esc("Aucun mode opératoire. C'est ici que le chemin devient vérifiable — et c'est sur lui que porte la décision de traitement.")
                + "</p>";
            return;
        }
        const lignes = modes.map(o => {
            const vu = modeServeur(o.id);
            const palier = vu && vu.niveau ? PALIERS[vu.niveau] : null;
            const decision = o.decision ? DECISIONS[o.decision] : null;
            return `
            <tr data-so="${esc(o.id)}">
                <td><strong>${esc(o.nom)}</strong></td>
                <td>${vu ? esc((DataStore.getEbiosScenarioStrategiqueById(o.scenario_strategique_id) || {}).nom || "—") : "—"}</td>
                <td style="text-align:right;">${o.vraisemblance == null || o.vraisemblance === "" ? "—" : esc(String(o.vraisemblance))}</td>
                <td>${palier
                    ? '<span class="status ' + palier.ton + '">' + esc(palier.libelle) + "</span>"
                    : '<span class="muted" title="' + esc("Le niveau se tait tant que la gravité du chemin ou la vraisemblance manque.") + '">à évaluer</span>'}</td>
                <td>${decision
                    ? '<span class="status ' + decision.ton + '">' + esc(decision.libelle) + "</span>"
                    : '<span class="muted">non tranché</span>'}</td>
                <td>${esc(o.justification_decision || "—")}</td>
                <td class="stop-row-click">${ecriture ? `
                    <button type="button" class="btn-secondary soDecider" data-so="${esc(o.id)}">Décider</button>
                    <button type="button" class="btn-danger soSupprimer" data-so="${esc(o.id)}">Retirer</button>` : ""}</td>
            </tr>`;
        }).join("");
        cible.innerHTML = `
            <table class="data-table">
                <thead><tr>
                    <th>Mode opératoire</th><th>Chemin</th>
                    <th style="text-align:right;">Vrais.</th>
                    <th>Niveau ${Help.tip("Gravité du chemin × vraisemblance du mode opératoire, en quatre paliers. Calculé par le serveur ; il se tait si l'un des deux manque.")}</th>
                    <th>Décision</th><th>Justification</th><th></th>
                </tr></thead>
                <tbody>${lignes}</tbody>
            </table>`;
        if (!ecriture) return;
        cible.querySelectorAll(".soDecider").forEach(b => {
            b.addEventListener("click", () => deciderMode(etudeId, b.dataset.so));
        });
        cible.querySelectorAll(".soSupprimer").forEach(b => {
            b.addEventListener("click", () => {
                DataStore.deleteEbiosScenarioOperationnel(b.dataset.so);
                UI.apresEcriture(() => rafraichirDerive(etudeId));
            });
        });
    }

    function ajouterMode(etudeId) {
        const chemin = (document.getElementById("soChemin") || {}).value || "";
        const nom = ((document.getElementById("soNom") || {}).value || "").trim();
        if (chemin === "" || nom === "") {
            if (window.showToast) {
                showToast("Un mode opératoire appartient à un chemin, et porte un intitulé.", "warning");
            }
            return;
        }
        const v = (document.getElementById("soVraisemblance") || {}).value || "";
        DataStore.addEbiosScenarioOperationnel({
            id: UI.genId("EBSO"),
            scenario_strategique_id: chemin,
            nom: nom,
            mode_operatoire: "",
            connaissance_id: "",
            actif_id: (document.getElementById("soActif") || {}).value || "",
            vraisemblance: v === "" ? "" : Number(v),
            // ⚠️ Un mode opératoire naît SANS décision : trancher est un geste de
            //    l'atelier 5, et le faire naître « à réduire » ferait porter au produit
            //    une décision que personne n'a prise.
            decision: "",
            justification_decision: "",
            risque_id: "",
            notes: ""
        });
        document.getElementById("soNom").value = "";
        UI.apresEcriture(() => rafraichirDerive(etudeId));
    }

    /**
     * Trancher l'atelier 5.
     *
     * ⚠️ **« Accepter » exige sa justification, et le produit la DEMANDE** plutôt que de
     * laisser la base refuser l'écriture : `ck_ebios_scenarios_operationnels_acceptation`
     * rendrait un code de contrainte, qui ne dit rien à l'utilisateur.
     */
    function deciderMode(etudeId, modeId) {
        const mode = DataStore.getEbiosScenarioOperationnelById(modeId);
        if (!mode) return;
        const saisie = prompt(
            "Décision de traitement — éviter, réduire, transférer ou accepter.\n"
            // Signe typographique, jamais d'emoji : c'est l'arbitrage E du
            // `docs/REPRISE.md` §2, gardé par `test/depot/aucun-emoji.test.mjs`.
            + "▸ « accepter » demandera pourquoi : c'est la seule des quatre qui ne produit "
            + "aucun travail visible, et sans sa justification elle est indistinguable d'un oubli.",
            mode.decision || "reduire");
        if (saisie === null) return;
        const decision = saisie.trim().toLowerCase()
            .replace(/é/g, "e").replace(/è/g, "e").replace(/ê/g, "e");
        if (!Object.prototype.hasOwnProperty.call(DECISIONS, decision)) {
            alert("Décision attendue : eviter, reduire, transferer ou accepter.");
            return;
        }
        if (decision === "accepter") {
            const motif = prompt(
                "Pourquoi acceptez-vous ce risque ? Cette phrase est la seule trace qu'une "
                + "décision a été prise plutôt qu'oubliée.",
                mode.justification_decision || "");
            if (motif === null) return;
            if (motif.trim() === "") {
                if (window.showToast) showToast("Un risque accepté porte sa justification.", "warning");
                return;
            }
            mode.justification_decision = motif.trim();
        }
        mode.decision = decision;
        DataStore.updateEbiosScenarioOperationnel(mode);
        UI.apresEcriture(() => rafraichirDerive(etudeId));
    }

    /** Redessine les trois ateliers, puis redemande au serveur ce qu'il dérive. */
    function rafraichirDerive(etudeId) {
        dessinerParties(etudeId, true);
        dessinerChemins(etudeId, true);
        dessinerModes(etudeId, true);
        peuplerListesAteliers(etudeId);
        if (window.Api && typeof Api.ebiosEtat === "function") {
            Api.ebiosEtat().then(r => {
                dernierEtat = r;
                dessinerSources(etudeId, true);
                dessinerParties(etudeId, true);
                dessinerChemins(etudeId, true);
                dessinerModes(etudeId, true);
            }).catch(() => { /* les grandeurs dérivées restent « à évaluer » */ });
        }
    }

    return { renderList, renderDetail };
})();

window.EbiosModule = EbiosModule;
