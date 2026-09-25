// Emplacement : js/modules/clients.js
// Nom du fichier : clients.js
// (N'oubliez pas d'ajouter <script src="js/modules/clients.js"></script> dans index.html)
//
// ── LE DONNEUR D'ORDRE CESSE D'ÊTRE UN NOM — migrations `070` et `071` ──────────
//
// Demande du RSSI du client, 24/09/2026 : *« montrer au client comment on traite ses
// données »*, conformément au RGPD, à DORA et à ISO 27001, *« et que ça soit respecté
// dans le reste du logiciel »*.
//
// 🛑 Avant ce lot, un donneur d'ordre portait DEUX champs — nom et secteur — quand un
// prestataire en portait vingt-deux. Le produit savait documenter ce que NOUS exigeons de
// nos fournisseurs, et rien de ce que NOS CLIENTS exigent de nous. Dans une filière
// aéronautique, c'est le second qui se présente en audit client.
//
// ⚠️ **Quatre onglets, et le quatrième est celui qu'on remet au client** : Identité et
// contrat, le registre de l'**article 30 §2** du RGPD (nous sous-traitant), les
// **sous-traitants ultérieurs** qui lui sont dus (art. 28 §2), et le **dossier**.
//
// ⚠️ **Les identifiants se lisent dans le DOM au moment du clic** (`CLAUDE.md` §3) : le
// serveur réattribue l'identifiant à la création, et une fermeture qui a capturé l'ancien
// viserait un enregistrement disparu, EN SILENCE.

const ClientsModule = (() => {

    const NIVEAUX = ["public", "interne", "confidentiel", "restreint"];
    const DROITS_AUDIT = ["aucun", "sur demande", "annuel", "certification acceptée"];
    const FINS_CONTRAT = ["restitution", "suppression", "restitution puis suppression"];

    /* ⚠️ Ces trois listes recopient des `check` du schéma. C'est admis par la règle des
       listes écrites à la main (`CLAUDE.md` §3) parce qu'une omission ÉCHOUE BRUYAMMENT —
       la base refuse la valeur — au lieu de réussir en silence. Elles sont figées à un
       second endroit qui les compare au réel : `test/reprise/enumerations.test.mjs` lit
       `pg_constraint`, et `backend/src/reprise/index.ts` les porte aussi. */

    function options(valeurs, choisi, vide) {
        return '<option value="">' + escapeHtml(vide || "— non renseigné —") + "</option>"
            + valeurs.map(v => '<option value="' + escapeHtml(v) + '"'
                + (v === choisi ? " selected" : "") + ">" + escapeHtml(v) + "</option>").join("");
    }

    function valeur(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : "";
    }

    function valeurOuNull(id) {
        const v = valeur(id);
        return v === "" ? null : v;
    }

    function entierOuNull(id) {
        const v = valeur(id);
        if (v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? Math.trunc(n) : null;
    }

    /* =========================================================================
       LE FORMULAIRE — UN SEUL, DEUX MODES (création et fiche)
       ⚠️ Un formulaire par mode, c'est deux vérités : le lot des filiales l'a payé
          le 24/09 au matin, et la correction s'est faite ici d'emblée.
       ========================================================================= */
    function formulaire(c) {
        c = c || {};
        return ''
        + '<div class="cli-form">'

        + '  <fieldset class="cli-bloc">'
        + '    <legend>Identité</legend>'
        + '    <div class="form-group">'
        + '      <label for="nom">Nom du donneur d’ordre <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>'
        + '      <input id="nom" value="' + escapeHtml(c.nom || "") + '" placeholder="Ex : nom du donneur d’ordre / périmètre" required />'
        + '    </div>'
        + '    <div class="form-group">'
        + '      <label for="secteur">Secteur d’activité ou description</label>'
        + '      <input id="secteur" value="' + escapeHtml(c.secteur || "") + '" placeholder="Ex : Aéronautique, Spatial, Défense" />'
        + '    </div>'
        + '    <div class="cli-duo">'
        + '      <div class="form-group">'
        + '        <label for="pays">Pays ' + Help.tip("Code à deux lettres, norme ISO 3166-1 (FR, DE, US). Il sert à dire si un transfert sort de l’Union européenne.") + '</label>'
        + '        <input id="pays" value="' + escapeHtml(c.pays || "") + '" maxlength="2" placeholder="FR" />'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="lei">Identifiant LEI ' + Help.tip("Legal Entity Identifier (ISO 17442), vingt caractères. Une entité financière en a besoin pour son registre d’information DORA, que nous devons alimenter en tant que prestataire de services informatiques.") + '</label>'
        + '        <input id="lei" value="' + escapeHtml(c.lei || "") + '" maxlength="20" placeholder="969500ABCDEF12345678" />'
        + '      </div>'
        + '    </div>'
        + '    <div class="form-group cli-case">'
        + '      <label for="entite_financiere_dora">'
        + '        <input type="checkbox" id="entite_financiere_dora"' + (c.entite_financiere_dora ? " checked" : "") + ' />'
        + '        Ce donneur d’ordre est une <strong>entité financière</strong> au sens de DORA'
        + '      </label>'
        + '      <p class="cli-aide">Banque, assurance, société de gestion, infrastructure de marché. Si c’est le cas, <strong>nous sommes son prestataire de services informatiques</strong> : il doit nous inscrire à son registre d’information (DORA, article 28 §3), et notre contrat doit porter les clauses de l’article 30. Laissez décoché pour un donneur d’ordre industriel — DORA ne le concerne pas.</p>'
        + '    </div>'
        + '  </fieldset>'

        + '  <fieldset class="cli-bloc">'
        + '    <legend>Contrat</legend>'
        + '    <div class="form-group">'
        + '      <label for="contrat_reference">Référence du contrat</label>'
        + '      <input id="contrat_reference" value="' + escapeHtml(c.contrat_reference || "") + '" placeholder="Ex : CONV-2026-014" />'
        + '    </div>'
        + '    <div class="cli-trio">'
        + '      <div class="form-group">'
        + '        <label for="contrat_debut">Début</label>'
        + '        <input type="date" id="contrat_debut" value="' + escapeHtml(c.contrat_debut || "") + '" />'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="contrat_fin">Fin</label>'
        + '        <input type="date" id="contrat_fin" value="' + escapeHtml(c.contrat_fin || "") + '" />'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="contrat_revue_le">Revue prévue le ' + Help.tip("Cette date alimente l’Échéancier, comme celle des prestataires : une revue de contrat qui n’apparaît nulle part est une revue qu’on ne fait pas.") + '</label>'
        + '        <input type="date" id="contrat_revue_le" value="' + escapeHtml(c.contrat_revue_le || "") + '" />'
        + '      </div>'
        + '    </div>'
        + '  </fieldset>'

        + '  <fieldset class="cli-bloc">'
        + '    <legend>Contacts — exigés par le RGPD, article 30 §2 a)</legend>'
        + '    <p class="cli-aide">Le texte les <strong>nomme</strong> : le registre que tient un sous-traitant doit porter « le nom et les coordonnées du ou des responsables du traitement pour le compte desquels le sous-traitant agit […] ainsi que du délégué à la protection des données ». Le courriel du responsable est aussi <strong>le destinataire d’une notification de violation</strong> (article 33 §2) : sans lui, l’obligation n’a personne à prévenir.</p>'
        + '    <div class="cli-duo">'
        + '      <div class="form-group">'
        + '        <label for="contact_rt_nom">Responsable de traitement — nom</label>'
        + '        <input id="contact_rt_nom" value="' + escapeHtml(c.contact_rt_nom || "") + '" list="personnes-list" />'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="contact_rt_email">Responsable de traitement — courriel</label>'
        + '        <input type="email" id="contact_rt_email" value="' + escapeHtml(c.contact_rt_email || "") + '" />'
        + '      </div>'
        + '    </div>'
        + '    <div class="cli-duo">'
        + '      <div class="form-group">'
        + '        <label for="contact_dpo_nom">Délégué à la protection des données — nom</label>'
        + '        <input id="contact_dpo_nom" value="' + escapeHtml(c.contact_dpo_nom || "") + '" list="personnes-list" />'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="contact_dpo_email">Délégué à la protection des données — courriel</label>'
        + '        <input type="email" id="contact_dpo_email" value="' + escapeHtml(c.contact_dpo_email || "") + '" />'
        + '      </div>'
        + '    </div>'
        + '  </fieldset>'

        + '  <fieldset class="cli-bloc">'
        + '    <legend>Ce que ce donneur d’ordre nous impose</legend>'
        + '    <div class="cli-trio">'
        + '      <div class="form-group">'
        + '        <label for="confidentialite_plancher">Diffusion minimale ' + Help.tip("Le niveau de classification le plus bas qu’un document appartenant à ce client puisse porter. Il est TENU par la base : un document classé en dessous est refusé, et relever le plancher est refusé tant que des documents sont en dessous.") + '</label>'
        + '        <select id="confidentialite_plancher">' + options(NIVEAUX, c.confidentialite_plancher, "— aucune exigence connue —") + '</select>'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="notification_incident_h">Notification d’incident (heures) ' + Help.tip("Le délai contractuel pour nous prévenir ce client en cas d’incident touchant ses données. Souvent 24 h, donc PLUS COURT que les 72 h de NIS2 — c’est lui qui commande le premier geste. Il alimente l’horloge de la fiche d’incident.") + '</label>'
        + '        <input type="number" id="notification_incident_h" min="1" max="720" value="' + escapeHtml(c.notification_incident_h === null || c.notification_incident_h === undefined ? "" : String(c.notification_incident_h)) + '" placeholder="24" />'
        + '      </div>'
        + '      <div class="form-group">'
        + '        <label for="droit_audit">Droit d’audit ' + Help.tip("RGPD article 28 §3 h) : le responsable de traitement doit pouvoir contrôler son sous-traitant. « Certification acceptée » veut dire qu’un rapport de certification tient lieu d’audit.") + '</label>'
        + '        <select id="droit_audit">' + options(DROITS_AUDIT, c.droit_audit) + '</select>'
        + '      </div>'
        + '    </div>'
        + '    <div class="form-group">'
        + '      <label for="fin_de_contrat">Sort des données en fin de contrat ' + Help.tip("RGPD article 28 §3 g) : au terme de la prestation, le sous-traitant restitue ou supprime les données, au choix du responsable de traitement. Laisser vide veut dire « non convenu », et le dossier client le signale comme un manque.") + '</label>'
        + '      <select id="fin_de_contrat">' + options(FINS_CONTRAT, c.fin_de_contrat, "— non convenu —") + '</select>'
        + '    </div>'
        + '  </fieldset>'
        + '</div>';
    }

    function collecter(cible) {
        const casDora = document.getElementById("entite_financiere_dora");
        cible.nom = valeur("nom");
        cible.secteur = valeur("secteur");
        cible.pays = valeur("pays").toUpperCase() || null;
        cible.lei = valeur("lei").toUpperCase() || null;
        cible.entite_financiere_dora = !!(casDora && casDora.checked);
        cible.contact_rt_nom = valeurOuNull("contact_rt_nom");
        cible.contact_rt_email = valeurOuNull("contact_rt_email");
        cible.contact_dpo_nom = valeurOuNull("contact_dpo_nom");
        cible.contact_dpo_email = valeurOuNull("contact_dpo_email");
        cible.contrat_reference = valeurOuNull("contrat_reference");
        cible.contrat_debut = valeurOuNull("contrat_debut");
        cible.contrat_fin = valeurOuNull("contrat_fin");
        cible.contrat_revue_le = valeurOuNull("contrat_revue_le");
        cible.droit_audit = valeurOuNull("droit_audit");
        cible.fin_de_contrat = valeurOuNull("fin_de_contrat");
        cible.confidentialite_plancher = valeurOuNull("confidentialite_plancher");
        cible.notification_incident_h = entierOuNull("notification_incident_h");
        return cible;
    }

    /* =========================
       LISTE DES DONNEURS D'ORDRE
    ========================== */
    function renderList() {
        const clients = DataStore.getClients();
        const exigences = DataStore.getExigences();
        const app = document.getElementById("app");

        const rows = clients.map(c => {
            const nbExigences = exigences.filter(e => e.client_id === c.id).length;
            const dora = c.entite_financiere_dora
                ? '<span class="cli-dora" title="Entité financière au sens de DORA">DORA</span>' : "";
            return ''
                + '<tr class="clickable-row" data-id="' + escapeHtml(c.id) + '">'
                + "<td><strong>" + escapeHtml(c.nom) + "</strong> " + dora + "</td>"
                + "<td>" + (escapeHtml(c.secteur) || "—") + "</td>"
                + "<td>" + (escapeHtml(c.pays) || "—") + "</td>"
                + "<td>" + (escapeHtml(c.contrat_fin) || "—") + "</td>"
                + "<td>" + (c.confidentialite_plancher
                    ? '<span class="cli-plancher">' + escapeHtml(c.confidentialite_plancher) + "</span>"
                    : '<span class="muted">—</span>') + "</td>"
                + '<td><span class="badge cli-badge">' + nbExigences + " exigence(s)</span></td>"
                + "</tr>";
        }).join("");

        app.innerHTML = ''
            + '<section class="page">'
            + '  <div class="dashboard-header">'
            + "    <h1>Donneurs d’ordre (clients)</h1>"
            + '    <button id="addClientBtn">Ajouter un donneur d’ordre</button>'
            + "  </div>"
            + '  <div class="synthese-message info cli-intro">'
            + "    Chaque donneur d’ordre porte son contrat, ses <strong>contacts RGPD</strong>, ce qu’il nous "
            + "    impose, et le <strong>registre de l’article 30 §2</strong> : ce que nous traitons pour son "
            + "    compte quand nous sommes <strong>sous-traitant</strong>. Le <strong>dossier</strong> de sa "
            + "    fiche rassemble tout cela en un document qu’on peut lui remettre."
            + "  </div>"
            + '  <div class="table-scroll"><table class="data-table"><thead><tr>'
            + "    <th>Donneur d’ordre</th><th>Secteur</th><th>Pays</th><th>Fin de contrat</th>"
            + "    <th>Diffusion minimale</th><th>Exigences</th>"
            + "  </tr></thead><tbody>"
            + (rows || '<tr><td colspan="6" class="cli-vide">Aucun donneur d’ordre défini pour le moment.</td></tr>')
            + "  </tbody></table></div>"
            + "</section>";

        const addBtn = document.getElementById("addClientBtn");
        if (addBtn) addBtn.addEventListener("click", renderCreate);

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.addEventListener("click", () => Router.navigateTo("/clients/" + row.dataset.id));
        });
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = ''
            + '<section class="page">'
            + "  <h1>Nouveau donneur d’ordre</h1>"
            + '  <div class="synthese-message info cli-intro">'
            + "    Seul le <strong>nom</strong> est obligatoire — le reste peut se compléter plus tard, et le "
            + "    <strong>dossier client</strong> dira ce qui manque, avec la référence du texte qui l’exige. "
            + "    Un dossier à moitié rempli est plus dangereux qu’un dossier vide : vide, on le remplit ; à "
            + "    moitié rempli, on l’envoie."
            + "  </div>"
            + formulaire({})
            + '  <div class="mt-20 cli-actions">'
            + '    <button id="save">Créer le donneur d’ordre</button>'
            + '    <button id="cancel" class="btn-secondary">Annuler</button>'
            + "  </div>"
            + "</section>";

        document.getElementById("save").addEventListener("click", () => {
            if (valeur("nom") === "") {
                if (window.showToast) window.showToast("Le nom du donneur d’ordre est obligatoire.", "error");
                return;
            }
            const enr = collecter({ id: UI.genId("CLI"), sous_traitants: [] });
            DataStore.addClient(enr);
            UI.apresEcriture(() => {
                Router.navigateTo("/clients");
                if (window.showToast) window.showToast("Donneur d’ordre créé.", "success");
            });
        });

        document.getElementById("cancel").addEventListener("click", () => Router.navigateTo("/clients"));
    }

    /* 🛑 LE DOSSIER PRÉPARÉ SURVIT À UN RE-RENDU — ET C'EST UN DÉFAUT TROUVÉ EN CLIQUANT.
     *
     * Première rédaction : le dossier s'affichait à 250 ms et **avait disparu à 5 s**. Le
     * sondage périodique de `js/core/sync.js` re-rend l'écran courant dès que la donnée
     * bouge, `renderDetail` reconstruisait la fiche, et le dossier que l'utilisateur venait
     * de demander était **effacé sous ses yeux** — sans une erreur, sans un message.
     *
     * ⚠️ **Aucun essai ne pouvait le voir** : le banc mesure qu'un écran se rend et qu'une
     * route répond ; il ne reste pas cinq secondes devant la page. C'est la quatrième leçon
     * du `docs/REPRISE.md`, et la cinquième fois qu'elle se vérifie.
     *
     * Le dossier est donc **gardé en mémoire** — pas re-demandé : il exige le droit
     * d'extraction, et le rejouer à chaque sondage serait une extraction par seconde dans
     * le journal d'audit. Un changement de donneur d'ordre l'oublie. */
    let dossierPrepare = null;   // { clientId, donnees }

    /* =========================================================================
       FICHE — QUATRE SECTIONS EMPILÉES, ET PAS DES ONGLETS
       ⚠️ **Ce produit dit, dans `js/core/ui.js` : « un onglet est un LIEN, pas un
          bouton »** — parce qu'un onglet-bouton casse le « Précédent » et n'est pas
          au clavier sans script. Or un onglet de FICHE n'a pas de route à lui : il
          n'y a donc pas d'onglet ici, mais quatre sections, comme la fiche d'un
          prestataire. C'est aussi ce qui permet d'imprimer la fiche entière.
       ⚠️ **Et le dossier ne se charge QUE sur demande** : il exige le droit
          d'extraction côté serveur, et l'appeler à chaque ouverture de fiche
          ferait un 403 dans la console de tous les contributeurs — un refus
          normal présenté comme une panne.
       ========================================================================= */
    function renderDetail(id) {
        const client = DataStore.getClientById(id);
        const app = document.getElementById("app");

        // ⚠️ Changer de donneur d'ordre OUBLIE le dossier de l'autre : reposer le dossier
        //    d'un client sur la fiche d'un autre serait la pire confusion possible dans un
        //    document destiné à être remis.
        if (dossierPrepare && dossierPrepare.clientId !== id) dossierPrepare = null;

        if (!client) {
            app.innerHTML = '<section class="page"><h1>Introuvable</h1>'
                + "<p>Ce donneur d’ordre est introuvable dans votre périmètre.</p>"
                + '<button type="button" id="backBtn">Retour</button></section>';
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/clients"));
            return;
        }

        app.innerHTML = ''
            + '<section class="page">'
            + '  <div class="dashboard-header">'
            + "    <h1>" + escapeHtml(client.nom)
            + (client.entite_financiere_dora ? ' <span class="cli-dora">DORA</span>' : "")
            + "</h1>"
            + '    <button id="deleteBtn" class="btn-danger no-print">Supprimer</button>'
            + "  </div>"
            + '  <div class="card" id="cliIdentite"></div>'
            + '  <div id="cliRegistre"></div>'
            + '  <div id="cliSousTraitants"></div>'
            + '  <div class="card no-print">'
            + "    <h3>Le dossier à remettre au donneur d’ordre</h3>"
            + '    <p class="cli-aide">« Comment nous traitons vos données » : le registre de '
            + "l’article 30 §2, les sous-traitants ultérieurs, les mesures de sécurité, vos "
            + "exigences contractuelles et leur couverture, les documents, les incidents — "
            + "<strong>et ce qui manque</strong>, avec la référence du texte qui l’exige. "
            + Help.tip("Le dossier exige le droit d’EXTRACTION : un dossier de conformité complet est une extraction, et c’est pour cela qu’il ne se prépare que sur demande.")
            + "</p>"
            + '    <button id="cliPreparerDossier">Préparer le dossier</button>'
            + "  </div>"
            + '  <div id="cliDossier"></div>'
            + "</section>";

        UI.wireDelete({
            confirm: "ATTENTION : supprimer ce donneur d’ordre supprime AUSSI toutes ses exigences, "
                + "son registre de l’article 30 §2 et la déclaration de ses sous-traitants. Continuer ?",
            remove: () => DataStore.deleteClient(client.id),
            toast: "Donneur d’ordre supprimé.",
            redirect: "/clients"
        });

        panneauIdentite(document.getElementById("cliIdentite"), client);
        panneauRegistre(document.getElementById("cliRegistre"), client);
        panneauSousTraitants(document.getElementById("cliSousTraitants"), client);
        document.getElementById("cliPreparerDossier").addEventListener("click", () => {
            panneauDossier(document.getElementById("cliDossier"), client);
        });

        // Le dossier déjà préparé se REPOSE, il ne se redemande pas (voir plus haut).
        if (dossierPrepare && dossierPrepare.clientId === client.id) {
            rendreDossier(document.getElementById("cliDossier"), dossierPrepare.donnees);
        }
    }

    function panneauIdentite(zone, client) {
        const exigences = DataStore.getExigencesByClient(client.id);
        zone.innerHTML = formulaire(client)
            + '<div class="mt-20 cli-actions">'
            + '  <button id="saveBtn">Enregistrer</button>'
            + '  <button type="button" id="voirExigencesBtn" class="btn-secondary">'
            + "    Voir ses " + exigences.length + " exigence(s)</button>"
            + "</div>";

        document.getElementById("saveBtn").addEventListener("click", () => {
            if (valeur("nom") === "") {
                if (window.showToast) window.showToast("Le nom est obligatoire.", "error");
                return;
            }
            DataStore.updateClient(collecter(client));
            UI.apresEcriture(() => {
                if (window.showToast) window.showToast("Enregistré.", "success");
            });
        });
        document.getElementById("voirExigencesBtn")
            .addEventListener("click", () => Router.navigateTo("/exigences"));
    }

    /* ── LE REGISTRE DE L'ARTICLE 30 §2 ─────────────────────────────────────── */
    function panneauRegistre(zone, client) {
        const tous = DataStore.getTraitementsPourClient
            ? DataStore.getTraitementsPourClient(client.id) : [];
        const mesures = DataStore.getMesures ? DataStore.getMesures() : [];

        const lignes = tous.map(t => {
            const liees = Array.isArray(t.mesures_liees) ? t.mesures_liees : [];
            const transfert = t.transfert_hors_ue
                ? escapeHtml(t.transfert_hors_ue)
                  + (t.transfert_garantie ? "" : ' <span class="cli-manque">garantie manquante</span>')
                : '<span class="muted">aucun</span>';
            return ''
                + '<tr class="clickable-row" data-tpc="' + escapeHtml(t.id) + '">'
                + "<td><strong>" + escapeHtml(t.intitule || "") + "</strong></td>"
                + "<td>" + (escapeHtml(t.categories_traitement) || "—") + "</td>"
                + "<td>" + (t.donnees_sensibles ? "oui" : "non") + "</td>"
                + "<td>" + transfert + "</td>"
                + "<td>" + liees.length + " mesure(s)"
                + (liees.length === 0 ? ' <span class="cli-manque">aucune</span>' : "") + "</td>"
                + "<td>" + (escapeHtml(t.revue_le) || "—") + "</td>"
                + "</tr>";
        }).join("");

        zone.innerHTML = ''
            + '<div class="card">'
            + "  <h3>Ce que nous traitons pour le compte de ce donneur d’ordre</h3>"
            + '  <div class="synthese-message info">'
            + "    C’est le <strong>registre de l’article 30 §2 du RGPD</strong> : celui que tient un "
            + "    <strong>sous-traitant</strong>, distinct du registre de l’article 30 §1 (écran "
            + "    <em>Registre RGPD</em>), où nous sommes responsable de traitement. "
            + Help.tip("La différence n’est pas de forme : ici la finalité est l’INSTRUCTION du client et la base légale est LA SIENNE. Un sous-traitant qui déclare sa propre base légale s’attribue un rôle qu’il n’a pas.")
            + "  </div>"
            + '  <div class="table-scroll"><table class="data-table"><thead><tr>'
            + "    <th>Traitement</th><th>Catégories de traitement</th><th>Données sensibles</th>"
            + "    <th>Transfert hors UE</th><th>Mesures</th><th>Revue</th>"
            + "  </tr></thead><tbody>"
            + (lignes || '<tr><td colspan="6" class="cli-vide">Aucun traitement déclaré. '
                + "Si nous traitons des données personnelles pour ce client, ce registre est "
                + "<strong>obligatoire</strong> — et c’est le premier document qu’une autorité demande "
                + "à un sous-traitant.</td></tr>")
            + "  </tbody></table></div>"
            + '  <button id="tpcAjouter" class="mt-20">Déclarer un traitement</button>'
            + "</div>"
            + '<div id="tpcForm"></div>';

        document.getElementById("tpcAjouter")
            .addEventListener("click", () => formTraitement(client, null, mesures));
        zone.querySelectorAll("[data-tpc]").forEach(tr => {
            tr.addEventListener("click", () => {
                const t = tous.find(x => x.id === tr.dataset.tpc);
                if (t) formTraitement(client, t, mesures);
            });
        });
    }

    function formTraitement(client, t, mesures) {
        const zone = document.getElementById("tpcForm");
        if (!zone) return;
        const edition = !!t;
        t = t || {};
        const liees = Array.isArray(t.mesures_liees) ? t.mesures_liees : [];

        zone.innerHTML = ''
            + '<div class="card cli-form">'
            + "  <h3>" + (edition ? "Modifier le traitement" : "Déclarer un traitement") + "</h3>"
            + '  <div class="form-group"><label for="tpc_intitule">Intitulé <span class="champ-requis" aria-hidden="true">*</span></label>'
            + '    <input id="tpc_intitule" value="' + escapeHtml(t.intitule || "") + '" placeholder="Ex : hébergement de son portail fournisseurs" /></div>'
            + '  <div class="form-group"><label for="tpc_categories">Catégories de traitement <span class="champ-requis" aria-hidden="true">*</span> '
            + Help.tip("RGPD article 30 §2 b) : « les catégories de traitements effectués pour le compte de chaque responsable du traitement ». C’est le seul champ que le texte rend obligatoire en plus de l’identité du responsable.")
            + '</label><textarea id="tpc_categories" rows="2">' + escapeHtml(t.categories_traitement || "") + "</textarea></div>"
            + '  <div class="cli-duo">'
            + '    <div class="form-group"><label for="tpc_donnees">Catégories de données</label>'
            + '      <input id="tpc_donnees" value="' + escapeHtml(t.categories_donnees || "") + '" /></div>'
            + '    <div class="form-group"><label for="tpc_personnes">Personnes concernées</label>'
            + '      <input id="tpc_personnes" value="' + escapeHtml(t.personnes_concernees || "") + '" /></div>'
            + "  </div>"
            + '  <div class="form-group cli-case"><label for="tpc_sensibles">'
            + '    <input type="checkbox" id="tpc_sensibles"' + (t.donnees_sensibles ? " checked" : "") + " /> Données sensibles (article 9)</label></div>"
            + '  <div class="form-group"><label for="tpc_instruction">Instruction documentée '
            + Help.tip("RGPD article 28 §3 a) : nous ne traitons que sur instruction documentée du responsable. Désignez la pièce — annexe de contrat, bon de commande, cahier des charges. Sans elle, « nous traitons sur instruction » est une affirmation sans pièce, et c’est la première question d’un auditeur.")
            + '</label><input id="tpc_instruction" value="' + escapeHtml(t.instruction_reference || "") + '" /></div>'
            + '  <div class="cli-duo">'
            + '    <div class="form-group"><label for="tpc_transfert">Transfert hors Union européenne</label>'
            + '      <input id="tpc_transfert" value="' + escapeHtml(t.transfert_hors_ue || "") + '" placeholder="Ex : États-Unis (sous-traitant d’hébergement)" /></div>'
            + '    <div class="form-group"><label for="tpc_garantie">Garantie du transfert '
            + Help.tip("RGPD article 46 : clauses contractuelles types, règles d’entreprise contraignantes, ou décision d’adéquation. La base REFUSE un transfert déclaré sans garantie — un transfert sans garantie identifiée est le constat d’audit le plus fréquent.")
            + '</label><input id="tpc_garantie" value="' + escapeHtml(t.transfert_garantie || "") + '" /></div>'
            + "  </div>"
            + '  <div class="cli-trio">'
            + '    <div class="form-group"><label for="tpc_duree">Durée de conservation</label>'
            + '      <input id="tpc_duree" value="' + escapeHtml(t.duree_conservation || "") + '" /></div>'
            + '    <div class="form-group"><label for="tpc_fin">Sort des données en fin de traitement</label>'
            + '      <input id="tpc_fin" value="' + escapeHtml(t.fin_de_traitement || "") + '" /></div>'
            + '    <div class="form-group"><label for="tpc_revue">Revue prévue le</label>'
            + '      <input type="date" id="tpc_revue" value="' + escapeHtml(t.revue_le || "") + '" /></div>'
            + "  </div>"
            + '  <div class="form-group"><label for="tpc_mesures">Mesures de sécurité rattachées '
            + Help.tip("RGPD article 30 §2 d), renvoyé à l’article 32. On RATTACHE les mesures du pivot — avec leur statut et leur maturité — au lieu de les décrire dans un champ de texte : une description figée est vraie le jour où on l’écrit et fausse la semaine suivante.")
            + '</label><select id="tpc_mesures" multiple size="6">'
            + mesures.map(m => '<option value="' + escapeHtml(m.id) + '"'
                + (liees.indexOf(m.id) >= 0 ? " selected" : "") + ">" + escapeHtml(m.nom || m.id) + "</option>").join("")
            + "  </select></div>"
            + '  <div class="form-group"><label for="tpc_notes">Notes</label>'
            + '    <textarea id="tpc_notes" rows="2">' + escapeHtml(t.notes || "") + "</textarea></div>"
            + '  <div class="cli-actions">'
            + '    <button id="tpcSave">' + (edition ? "Enregistrer" : "Déclarer") + "</button>"
            + (edition ? '    <button type="button" id="tpcDelete" class="btn-danger">Retirer du registre</button>' : "")
            + '    <button type="button" id="tpcCancel" class="btn-secondary">Annuler</button>'
            + "  </div>"
            + "</div>";

        document.getElementById("tpcCancel").addEventListener("click", () => { zone.innerHTML = ""; });

        document.getElementById("tpcSave").addEventListener("click", () => {
            const intitule = valeur("tpc_intitule");
            const cats = valeur("tpc_categories");
            if (intitule === "" || cats === "") {
                if (window.showToast) {
                    window.showToast("L’intitulé et les catégories de traitement sont obligatoires "
                        + "— l’article 30 §2 b) les exige.", "error");
                }
                return;
            }
            const transfert = valeurOuNull("tpc_transfert");
            const garantie = valeurOuNull("tpc_garantie");
            if (transfert !== null && garantie === null) {
                if (window.showToast) {
                    window.showToast("Un transfert hors Union exige sa garantie (article 46) : "
                        + "clauses contractuelles types, règles d’entreprise contraignantes, "
                        + "ou décision d’adéquation.", "error");
                }
                return;
            }
            const sel = document.getElementById("tpc_mesures");
            const choisies = sel ? Array.prototype.slice.call(sel.selectedOptions).map(o => o.value) : [];
            const cible = edition ? t : { id: UI.genId("TPC"), client_id: client.id };
            cible.intitule = intitule;
            cible.categories_traitement = cats;
            cible.categories_donnees = valeurOuNull("tpc_donnees");
            cible.personnes_concernees = valeurOuNull("tpc_personnes");
            const casSens = document.getElementById("tpc_sensibles");
            cible.donnees_sensibles = !!(casSens && casSens.checked);
            cible.instruction_reference = valeurOuNull("tpc_instruction");
            cible.transfert_hors_ue = transfert;
            cible.transfert_garantie = garantie;
            cible.duree_conservation = valeurOuNull("tpc_duree");
            cible.fin_de_traitement = valeurOuNull("tpc_fin");
            cible.revue_le = valeurOuNull("tpc_revue");
            cible.notes = valeurOuNull("tpc_notes");
            cible.mesures_liees = choisies;

            if (edition) DataStore.updateTraitementPourClient(cible);
            else DataStore.addTraitementPourClient(cible);
            UI.apresEcriture(() => {
                if (window.showToast) window.showToast("Registre mis à jour.", "success");
                renderDetail(client.id);
            });
        });

        const del = document.getElementById("tpcDelete");
        if (del) {
            del.addEventListener("click", () => {
                if (!window.confirm("Retirer ce traitement du registre de l’article 30 §2 ?")) return;
                DataStore.deleteTraitementPourClient(t.id);
                UI.apresEcriture(() => {
                    if (window.showToast) window.showToast("Traitement retiré.", "success");
                    renderDetail(client.id);
                });
            });
        }
    }

    /* ── LES SOUS-TRAITANTS ULTÉRIEURS (art. 28 §2 et §4) ───────────────────── */
    function panneauSousTraitants(zone, client) {
        const prestataires = DataStore.getPrestataires ? DataStore.getPrestataires() : [];
        const declares = Array.isArray(client.sous_traitants) ? client.sous_traitants : [];

        const lignes = declares.map(s => {
            const p = prestataires.find(x => x.id === s.to) || {};
            return ''
                + "<tr>"
                + "<td><strong>" + escapeHtml(p.societe || s.to) + "</strong></td>"
                + "<td>" + (escapeHtml(p.pays) || "—") + "</td>"
                + "<td>" + (escapeHtml(s.role) || "—") + "</td>"
                + "<td>" + (s.autorise_le
                    ? escapeHtml(s.autorise_le)
                    : '<span class="cli-manque">non autorisé</span>') + "</td>"
                + '<td><button type="button" class="cli-retirer" data-st="' + escapeHtml(s.to) + '">Retirer</button></td>'
                + "</tr>";
        }).join("");

        const nonAutorises = declares.filter(s => !s.autorise_le).length;

        zone.innerHTML = ''
            + '<div class="card">'
            + "  <h3>Les sous-traitants ultérieurs déclarés à ce donneur d’ordre</h3>"
            + '  <div class="synthese-message ' + (nonAutorises > 0 ? "alerte" : "info") + '">'
            + "    Lesquels de <strong>nos</strong> prestataires touchent les données de ce client. "
            + "    Le RGPD <strong>article 28 §2</strong> interdit d’en recruter un sans l’autorisation "
            + "    écrite du responsable de traitement, et le §4 nous rend responsable de ses manquements. "
            + Help.tip("La chaîne de sous-traitance, le pays et le rang restent dans l’écran Prestataires, là où ils sont calculés. Ici on DÉSIGNE, on ne duplique pas.")
            + (nonAutorises > 0
                ? " <strong>" + nonAutorises + " sans autorisation datée</strong> : en l’état, "
                  + "le dossier client documente une infraction."
                : "")
            + "  </div>"
            + '  <div class="table-scroll"><table class="data-table"><thead><tr>'
            + "    <th>Prestataire</th><th>Pays</th><th>Rôle pour ce client</th>"
            + "    <th>Autorisé le</th><th></th>"
            + "  </tr></thead><tbody>"
            + (lignes || '<tr><td colspan="5" class="cli-vide">Aucun sous-traitant ultérieur déclaré.</td></tr>')
            + "  </tbody></table></div>"
            + '  <div class="cli-form mt-20">'
            + '    <div class="cli-trio">'
            + '      <div class="form-group"><label for="st_presta">Prestataire</label>'
            + '        <select id="st_presta"><option value="">— choisir —</option>'
            + prestataires.map(p => '<option value="' + escapeHtml(p.id) + '">'
                + escapeHtml(p.societe || p.id) + "</option>").join("")
            + "      </select></div>"
            + '      <div class="form-group"><label for="st_role">Rôle pour ce client</label>'
            + '        <input id="st_role" placeholder="Ex : hébergement des sauvegardes" /></div>'
            + '      <div class="form-group"><label for="st_autorise">Autorisé le '
            + Help.tip("La date de l’autorisation écrite du responsable de traitement. Laisser vide est possible — mais le dossier client le signalera comme un manque BLOQUANT, parce que recruter sans autorisation est une infraction, pas un retard administratif.")
            + '</label><input type="date" id="st_autorise" /></div>'
            + "    </div>"
            + '    <button id="stAjouter">Déclarer ce sous-traitant</button>'
            + "  </div>"
            + "</div>";

        document.getElementById("stAjouter").addEventListener("click", () => {
            const pid = valeur("st_presta");
            if (pid === "") {
                if (window.showToast) window.showToast("Choisissez un prestataire.", "error");
                return;
            }
            if (declares.some(s => s.to === pid)) {
                if (window.showToast) window.showToast("Ce prestataire est déjà déclaré.", "error");
                return;
            }
            client.sous_traitants = declares.concat([{
                to: pid,
                role: valeurOuNull("st_role"),
                autorise_le: valeurOuNull("st_autorise")
            }]);
            DataStore.updateClient(client);
            UI.apresEcriture(() => {
                if (window.showToast) window.showToast("Sous-traitant déclaré.", "success");
                renderDetail(client.id);
            });
        });

        zone.querySelectorAll(".cli-retirer").forEach(b => {
            b.addEventListener("click", () => {
                client.sous_traitants = declares.filter(s => s.to !== b.dataset.st);
                DataStore.updateClient(client);
                UI.apresEcriture(() => {
                    if (window.showToast) window.showToast("Sous-traitant retiré.", "success");
                    renderDetail(client.id);
                });
            });
        });
    }

    /* ── LE DOSSIER QU'ON REMET AU CLIENT ──────────────────────────────────────
     * ⚠️ Il vient du SERVEUR et n'est pas reconstitué ici : les manques sont
     *    calculés là-bas, avec les références aux textes, et deux calculs des mêmes
     *    manques divergeraient en silence (constat Q-219). */
    function panneauDossier(zone, client) {
        zone.innerHTML = '<div class="card"><p class="muted">Préparation du dossier…</p></div>';

        if (!window.Api || typeof Api.clientDossier !== "function") {
            zone.innerHTML = '<div class="card"><div class="synthese-message danger">'
                + "Le dossier n’est pas disponible sur ce serveur.</div></div>";
            return;
        }

        Api.clientDossier(client.id).then(d => {
            dossierPrepare = { clientId: client.id, donnees: d };
            rendreDossier(zone, d);
        }).catch(err => {
            dossierPrepare = null;
            // ⚠️ Un 403 n'est pas une panne : le dossier exige le droit d'EXPORT,
            //    parce qu'un dossier de conformité complet est une extraction.
            const refus = err && (err.statut === 403 || err.code === "droit_insuffisant");
            zone.innerHTML = '<div class="card"><div class="synthese-message '
                + (refus ? "warning" : "danger") + '">'
                + (refus
                    ? "Ce dossier rassemble tout ce que nous détenons sur ce donneur d’ordre : "
                      + "il exige le <strong>droit d’extraction</strong>, que votre compte ne porte pas. "
                      + "Demandez-le à l’administrateur, ou faites préparer le dossier par quelqu’un qui l’a."
                    : "Le dossier n’a pas pu être préparé : " + escapeHtml(String(err && err.message || err)))
                + "</div></div>";
        });
    }

    function rubrique(titre, r, colonnes, ligne) {
        // 🛑 « retenue » et non « absente » — constat Q-335 : rien ne doit
        //    distinguer mal « il n'y a rien » de « on vous le cache ».
        if (r && r.retenue) {
            return '<div class="card"><h3>' + escapeHtml(titre) + "</h3>"
                + '<div class="synthese-message warning">Rubrique <strong>non rendue</strong> : '
                + "votre compte n’a pas le domaine « " + escapeHtml(r.retenue) + " ». "
                + "Le dossier est donc <strong>incomplet</strong>, et il le dit plutôt que d’afficher "
                + "« aucun » — ce qui serait faux.</div></div>";
        }
        const lignes = (r && r.lignes ? r.lignes : (Array.isArray(r) ? r : []));
        return '<div class="card"><h3>' + escapeHtml(titre) + "</h3>"
            + '<div class="table-scroll"><table class="data-table"><thead><tr>'
            + colonnes.map(c => "<th>" + escapeHtml(c) + "</th>").join("")
            + "</tr></thead><tbody>"
            + (lignes.map(ligne).join("")
                || '<tr><td colspan="' + colonnes.length + '" class="cli-vide">Aucune ligne.</td></tr>')
            + "</tbody></table></div></div>";
    }

    function rendreDossier(zone, d) {
        const c = d.client || {};
        const sansValeur = v => (v === null || v === undefined || v === "" ? "—" : escapeHtml(String(v)));

        const manques = (d.manques || []).map(m => ''
            + '<li class="cli-m cli-m--' + escapeHtml(m.gravite) + '">'
            + '<span class="cli-m-etiq">' + escapeHtml(m.gravite) + "</span> "
            + escapeHtml(m.sujet) + "</li>").join("");

        zone.innerHTML = ''
            + '<div class="card cli-dossier">'
            + '  <div class="synthese-message warning cli-avert">' + escapeHtml(d.avertissement || "") + "</div>"
            + "  <h3>Comment nous traitons vos données</h3>"
            + '  <dl class="cli-dl">'
            + "    <dt>Donneur d’ordre</dt><dd>" + sansValeur(c.nom) + "</dd>"
            + "    <dt>Filiale qui traite</dt><dd>" + sansValeur(c.filiale) + " (" + sansValeur(c.filiale_code) + ")</dd>"
            + "    <dt>Pays</dt><dd>" + sansValeur(c.pays) + "</dd>"
            + "    <dt>Responsable de traitement</dt><dd>" + sansValeur(c.contact_rt_nom) + " · " + sansValeur(c.contact_rt_email) + "</dd>"
            + "    <dt>Délégué à la protection des données</dt><dd>" + sansValeur(c.contact_dpo_nom) + " · " + sansValeur(c.contact_dpo_email) + "</dd>"
            + "    <dt>Contrat</dt><dd>" + sansValeur(c.contrat_reference)
            + " (du " + sansValeur(c.contrat_debut) + " au " + sansValeur(c.contrat_fin) + ")</dd>"
            + "    <dt>Droit d’audit</dt><dd>" + sansValeur(c.droit_audit) + "</dd>"
            + "    <dt>Fin de contrat</dt><dd>" + sansValeur(c.fin_de_contrat) + "</dd>"
            + "    <dt>Diffusion minimale imposée</dt><dd>" + sansValeur(c.confidentialite_plancher) + "</dd>"
            + "    <dt>Délai de notification d’incident</dt><dd>"
            + (c.notification_incident_h ? escapeHtml(String(c.notification_incident_h)) + " heures" : "—") + "</dd>"
            + "    <dt>Entité financière (DORA)</dt><dd>" + (c.entite_financiere_dora ? "oui" : "non") + "</dd>"
            + "  </dl>"
            + "</div>"

            + '<div class="card cli-manques">'
            + "  <h3>Ce qui manque à ce dossier</h3>"
            + (manques
                ? '<p class="cli-aide">Un dossier à moitié rempli est plus dangereux qu’un dossier vide : '
                  + "vide, on le remplit ; à moitié rempli, on l’envoie. Chaque manque cite le texte qui "
                  + 'l’exige, et « bloquant » veut dire qu’envoyer le dossier en l’état documente une '
                  + "infraction.</p><ul class=\"cli-mlist\">" + manques + "</ul>"
                : '<div class="synthese-message info">Aucun manque détecté sur les points que le '
                  + "produit sait vérifier.</div>")
            + "</div>"

            + rubrique("Registre de l’article 30 §2 — ce que nous traitons pour vous",
                { lignes: d.registreArticle30 || [] },
                ["Traitement", "Catégories de traitement", "Données sensibles", "Transfert hors UE",
                 "Garantie", "Conservation", "Mesures"],
                t => "<tr><td><strong>" + sansValeur(t.intitule) + "</strong></td>"
                    + "<td>" + sansValeur(t.categories_traitement) + "</td>"
                    + "<td>" + (t.donnees_sensibles ? "oui" : "non") + "</td>"
                    + "<td>" + sansValeur(t.transfert_hors_ue) + "</td>"
                    + "<td>" + sansValeur(t.transfert_garantie) + "</td>"
                    + "<td>" + sansValeur(t.duree_conservation) + "</td>"
                    + "<td>" + sansValeur(t.mesures) + "</td></tr>")

            + rubrique("Sous-traitants ultérieurs (article 28 §2)", d.sousTraitants,
                ["Société", "Pays", "Pays des données", "Rôle", "Autorisé le"],
                s => "<tr><td><strong>" + sansValeur(s.societe) + "</strong></td>"
                    + "<td>" + sansValeur(s.pays) + "</td><td>" + sansValeur(s.pays_donnees) + "</td>"
                    + "<td>" + sansValeur(s.role) + "</td>"
                    + "<td>" + (s.autorise_le ? sansValeur(s.autorise_le)
                        : '<span class="cli-manque">non autorisé</span>') + "</td></tr>")

            + rubrique("Mesures de sécurité (article 32)", d.mesures,
                ["Mesure", "Statut", "Maturité"],
                m => "<tr><td>" + sansValeur(m.nom) + "</td><td>" + sansValeur(m.statut) + "</td>"
                    + "<td>" + sansValeur(m.maturite) + "</td></tr>")

            + rubrique("Vos exigences contractuelles et leur couverture", d.exigences,
                ["Statut de conformité", "Nombre"],
                e => "<tr><td>" + sansValeur(e.statut_conformite) + "</td>"
                    + "<td>" + sansValeur(e.nombre) + "</td></tr>")

            + rubrique("Documents qui vous appartiennent", d.documents,
                ["Titre", "Statut", "Diffusion", "Données personnelles"],
                o => "<tr><td>" + sansValeur(o.titre) + "</td><td>" + sansValeur(o.statut) + "</td>"
                    + "<td>" + sansValeur(o.confidentialite) + "</td>"
                    + "<td>" + (o.donnees_personnelles ? "oui" : "non") + "</td></tr>")

            + rubrique("Incidents ayant touché vos données", d.incidents,
                ["Incident", "Gravité", "Détecté le", "À notifier avant", "Notifié le", "Référence"],
                i => "<tr><td>" + sansValeur(i.titre) + "</td><td>" + sansValeur(i.gravite) + "</td>"
                    + "<td>" + sansValeur(i.date_detection) + "</td>"
                    + "<td>" + sansValeur(i.notifier_avant) + "</td>"
                    + "<td>" + (i.notifie_le ? sansValeur(i.notifie_le)
                        : '<span class="cli-manque">non notifié</span>') + "</td>"
                    + "<td>" + sansValeur(i.notification_reference) + "</td></tr>")

            + rubrique("Demandes d’exercice de droits que vous nous avez transmises",
                { lignes: d.demandesDroits || [] },
                ["Nature", "Statut", "Reçue le", "Répondu le"],
                r => "<tr><td>" + sansValeur(r.nature) + "</td><td>" + sansValeur(r.statut) + "</td>"
                    + "<td>" + sansValeur(r.recue_le) + "</td>"
                    + "<td>" + sansValeur(r.repondu_le) + "</td></tr>")

            + '<div class="cli-actions no-print">'
            + '  <button id="dossierImprimer">Imprimer le dossier</button>'
            + '  <p class="cli-aide">Le produit <strong>ne transmet rien</strong> : il prépare, et la remise '
            + "au donneur d’ordre est un geste humain. C’est la même règle que pour les formulaires ANSSI "
            + "et CNIL, et elle ne souffre pas d’exception.</p>"
            + "</div>";

        document.getElementById("dossierImprimer").addEventListener("click", () => window.print());
    }

    return {
        renderList,
        renderDetail
    };
})();
