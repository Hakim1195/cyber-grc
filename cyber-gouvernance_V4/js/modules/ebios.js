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

    /** L'échelle proposée par l'application. Le schéma, lui, borne seulement 1 à 10. */
    const NIVEAUX = Object.freeze([1, 2, 3, 4]);

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

    function niveauxHtml(choisi) {
        return '<option value="">—</option>'
             + NIVEAUX.map(n =>
                 '<option value="' + n + '"' + (String(choisi) === String(n) ? " selected" : "")
                 + ">" + n + "</option>").join("");
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
                            <select id="srMotivation">${niveauxHtml("")}</select>
                        </label>
                        <label>Ressources ${Help.tip("Les moyens dont elle dispose : compétences, outillage, budget, temps.")}
                            <select id="srRessources">${niveauxHtml("")}</select>
                        </label>
                        <label>Activité ${Help.tip("À quel point elle est active en ce moment, dans votre secteur.")}
                            <select id="srActivite">${niveauxHtml("")}</select>
                        </label>
                    </div>
                    <button type="button" id="srAjouter">Ajouter le couple</button>` : ""}
                </div>

                <div class="card no-print">
                    <p class="muted">
                        ${esc("Les ateliers 3 à 5 — scénarios stratégiques, scénarios opérationnels, traitement — ne sont pas encore livrés. Les couples que vous retenez ici sont ce sur quoi ils travailleront.")}
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
            UI.wireDelete({
                button: document.getElementById("ebiosSupprimer"),
                confirm: "Supprimer cette étude ? Ses valeurs métier, ses événements redoutés et ses couples source / objectif partent avec elle. Vos risques cotés en F × G × M ne sont pas touchés.",
                remove: () => DataStore.deleteEbiosEtude(id),
                toast: "Étude supprimée.",
                redirect: "/ebios"
            });
            peuplerProcessus();
            peuplerSourcesConnues();
        }

        dessinerValeurs(id, ecriture);
        dessinerSources(id, ecriture);

        // La pertinence vient du serveur : on la demande, puis on repeint les couples.
        if (window.Api && typeof Api.ebiosEtat === "function") {
            Api.ebiosEtat().then(r => {
                dernierEtat = r;
                dessinerSources(id, ecriture);
            }).catch(() => { /* les couples restent affichés « à évaluer » */ });
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
                        <select class="erGravite">${niveauxHtml("")}</select>
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

    return { renderList, renderDetail };
})();

window.EbiosModule = EbiosModule;
