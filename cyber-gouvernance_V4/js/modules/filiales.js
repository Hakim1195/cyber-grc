// Emplacement : js/modules/filiales.js
// Nom du fichier : filiales.js
//
// Écran « Filiales » — le PÉRIMÈTRE du groupe, déclaré depuis le produit.
//
// ── CE QUE CET ÉCRAN EXISTE POUR FERMER ─────────────────────────────────────
//
// Utilisateur, 24/09/2026 : *« on ne peut pas créer de filiale depuis le logiciel,
// c'est un problème ça. […] on peut aussi les créer directement dans le serveur,
// mais c'est impensable de le faire uniquement comme ça. »*
//
// Il avait raison, et le défaut était double.
//
//  1. **La route existait, l'écran non.** `POST /api/filiales` fait le bon geste
//     depuis le 04/09/2026 — identifiant engendré par le serveur, groupes
//     d'annuaire synchronisés dans la même transaction, trace au journal. Elle
//     n'était appelable que par un `curl`. *Une capacité qu'aucun écran n'appelle
//     est une capacité absente.*
//  2. 🛑 **Et personne ne portait `filiales.conf` en base.** Les deux moitiés du
//     dispositif lisaient deux sources : `deploy/groupes-ad.sh` le FICHIER pour
//     rendre les groupes à créer dans l'annuaire, `synchroniser-groupes-ad.mjs`
//     la TABLE pour remplir `groupes_ad` — l'autorité qui décide de ce qu'un
//     groupe ACCORDE. Mesuré : **26 groupes créés dans l'AD, 10 déclarés en
//     base**. `GRC-ADMIN` ne dépendant d'aucune filiale, l'administrateur entrait
//     et le produit avait l'air de marcher ; les seize groupes de filiale, eux,
//     n'accordaient rien. Un RSSI de site se connectait sans obtenir le moindre
//     accès, sans message d'erreur. (Migration `064`, `db/importer-filiales.mjs`.)
//
// ── L'ARBITRAGE QUE CET ÉCRAN APPLIQUE ──────────────────────────────────────
//
// **La table est la source ; `filiales.conf` n'est qu'un amorçage.** Ce n'est pas
// un choix de goût : le service tourne sous `ProtectSystem=strict` avec
// `ReadWritePaths=/var/lib/cyber-grc /var/log/cyber-grc`, donc `/etc/cyber-grc`
// lui est en LECTURE SEULE. Cet écran ne pourra jamais écrire ce fichier, et l'y
// autoriser serait une régression du bac à sable. Le seul sens ouvert est fichier
// → table, une fois, à l'installation ; ensuite, **une acquisition se déclare
// ici**.
//
// ── ⚠️ CE QUE CET ÉCRAN NE FAIT PAS ────────────────────────────────────────
//
// 🛑 **Il n'écrit pas dans l'Active Directory**, et c'est une capacité ABSENTE
// côté serveur : le client LDAP du produit n'implémente que `lier`, `rechercher`,
// `fermer` (arbitrage utilisateur du 22/09/2026). Créer une filiale rend donc une
// **liste de groupes à créer**, que l'administrateur du domaine exécute lui-même.
//
// ⚠️ **Il DIT que la filiale neuve est invisible jusqu'à la reconnexion.** Le
// périmètre se résout depuis les groupes d'annuaire, à la connexion, et les
// groupes de la filiale neuve n'existent pas encore dans l'AD : celui qui vient de
// la créer n'a **aucun droit de lire** ce qu'elle contiendra. Ce n'est pas un
// défaut, c'est le modèle — mais un écran qui ne le dirait pas laisserait croire à
// une création ratée (classe des faux bandeaux, constats Q-201 / Q-207).
//
// ⚠️ **Il ne propose pas d'importer l'annuaire.** « Proposer depuis l'annuaire »
// rend les **unités d'organisation** — pas les personnes, et pas l'attribut
// `company` : le relever exigerait de parcourir les entrées de personnes par
// milliers, c'est-à-dire une lecture de masse de données personnelles pour une
// commodité de saisie. Une unité d'organisation n'est pas une donnée personnelle.

const FilialesModule = (() => {
    "use strict";

    /** L'inventaire servi par `GET /api/filiales/inventaire`. */
    let inventaire = null;
    /** Les candidats lus dans l'annuaire, à la demande : cela sort sur le réseau. */
    let candidats = null;
    /** Le bilan de la dernière création, pour afficher les groupes à créer. */
    let dernierBilan = null;
    /** La filiale dont le panneau « Groupes d'annuaire » est déplié. */
    let groupesOuverts = null;

    const esc = (v) => (window.escapeHtml || ((x) => String(x == null ? "" : x)))(v);

    function avertir(message, ton) {
        if (window.showToast) showToast(message, ton || "info");
    }

    const STATUTS = Object.freeze({
        active: { libelle: "Active", classe: "fil-statut--active" },
        archivee: { libelle: "Archivée", classe: "fil-statut--archivee" },
        sortie: { libelle: "Sortie", classe: "fil-statut--sortie" }
    });

    /* =====================================================================
       LE CHARGEMENT
    ===================================================================== */

    async function charger() {
        inventaire = await Api.inventaireFiliales();
    }

    function sansDroit(app) {
        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({ titre: "Filiales" })
            + '<div class="card"><p class="muted">Cet écran est réservé à '
            + "l’administration de l’application : déclarer une filiale engage le "
            + "périmètre du groupe entier.</p></div></section>";
    }

    /** Affiche l'erreur telle que le serveur la formule — jamais une reformulation. */
    function echec(app, erreur) {
        const message = (erreur && erreur.message)
            ? erreur.message
            : "Le serveur n’a pas répondu.";
        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({ titre: "Filiales" })
            + '<div class="card"><p class="muted">' + esc(message) + "</p></div></section>";
    }

    /* =====================================================================
       LE SCRIPT POWERSHELL — engendré à partir de ce que le SERVEUR a rendu

       ⚠️ Les NOMS ne sont pas fabriqués ici : ils viennent de `groupesAttendus()`,
       l'engendreur unique, servi par la route. Recomposer « GRC- » + code +
       profil dans le navigateur en ferait une seconde autorité, et la divergence
       serait invisible jusqu'au jour où un compte se connecte sans droit
       (`CLAUDE.md` §3, et le motif de tout ce lot).
    ===================================================================== */

    function scriptPowershell(noms, ou) {
        const cible = String(ou || "OU=Cyber GRC,OU=Groupes,DC=exemple,DC=interne");
        const lignes = [
            "# Groupes Active Directory de Cyber GRC — engendré par le produit.",
            "# Idempotent : ne crée que ce qui manque, ne supprime jamais rien.",
            "# À exécuter sur un contrôleur de domaine, par l’administrateur du domaine.",
            "$ou = '" + cible.replace(/'/g, "''") + "'",
            ""
        ];
        noms.forEach((nom) => {
            lignes.push("if (-not (Get-ADGroup -Filter \"Name -eq '" + nom + "'\" -ErrorAction SilentlyContinue)) {");
            lignes.push("    New-ADGroup -Name '" + nom + "' -GroupScope Global -GroupCategory Security -Path $ou");
            lignes.push("}");
        });
        return lignes.join("\n");
    }

    /* =====================================================================
       LA VUE
    ===================================================================== */

    async function renderList() {
        const app = document.getElementById("app");
        try { await charger(); } catch (e) {
            if (e && e.statut === 403) return sansDroit(app);
            return echec(app, e);
        }
        if (!inventaire) return sansDroit(app);

        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({
                titre: "Filiales",
                contexte: "Le périmètre du groupe",
                aide: Help.tip("Une filiale est une entité juridique du groupe. Son CODE "
                    + "sert à nommer les groupes d’annuaire (GRC-<CODE>-<PROFIL>) : il ne "
                    + "se change plus ensuite sans recréer ces groupes."),
                actions: '<button type="button" id="filNouvelle" class="btn-primary">'
                    + "Déclarer une filiale</button>"
            })
            + encartSource()
            + (dernierBilan ? encartBilan(dernierBilan) : "")
            + '<div id="filFormulaire"></div>'
            + '<div id="filGroupes"></div>'
            + tableau()
            + encartTransversaux()
            + "</section>";

        UI.envelopperTableaux(app);
        brancher();
        // Le panneau survit au rendu : le refermer à chaque écriture obligerait à
        // le rouvrir entre deux modifications de groupes.
        if (groupesOuverts) {
            const encore = inventaire.filiales.some((f) => f.id === groupesOuverts);
            if (encore) await renderPanneauGroupes(groupesOuverts);
            else groupesOuverts = null;
        }
    }

    /**
     * D'où vient ce que l'écran montre — et ce que l'édition du fichier ne fait
     * plus.
     *
     * ⚠️ Cet encart n'est pas décoratif : pendant vingt jours, la déclaration
     * d'exploitation et la base ont pu diverger sans que rien ne le dise. Un
     * exploitant qui a connu l'ancien fonctionnement éditera `filiales.conf` et
     * attendra un effet.
     */
    function encartSource() {
        return '<div class="card fil-source">'
            + "<p><strong>Cet écran fait foi.</strong> Le périmètre vit dans la base : "
            + "c’est lui qui décide des groupes d’annuaire que le produit reconnaît, donc "
            + "des accès. Le fichier <code>/etc/cyber-grc/filiales.conf</code> ne sert qu’à "
            + "<strong>l’amorçage</strong> de la première installation ; l’éditer ensuite "
            + "n’agit plus sur le produit.</p>"
            + '<p class="muted">Pour contrôler que les deux concordent&nbsp;: '
            + "<code>bash backend/deploy/groupes-ad.sh --verifier</code></p>"
            + "</div>";
    }

    function tableau() {
        if (!inventaire.filiales.length) {
            return '<div class="card"><p class="muted">Aucune filiale n’est déclarée. '
                + "Tant qu’il n’y en a aucune, seuls les groupes de portée Groupe et les deux "
                + "groupes transversaux existent : un administrateur peut entrer, et "
                + "<strong>aucun RSSI de site n’a d’accès</strong>.</p></div>";
        }
        const lignes = inventaire.filiales.map((f) => {
            const st = STATUTS[f.statut] || { libelle: f.statut, classe: "" };
            const manquants = f.groupes_non_declares.length;
            return '<tr data-filiale="' + esc(f.id) + '">'
                + "<td><strong>" + esc(f.code) + "</strong></td>"
                + "<td>" + esc(f.raison_sociale) + "</td>"
                + '<td class="t-centre">' + esc(f.pays || "—") + "</td>"
                + '<td class="t-centre"><span class="fil-statut ' + st.classe + '">'
                + esc(st.libelle) + "</span></td>"
                + "<td>" + esc(f.date_entree || "—") + "</td>"
                + "<td>" + esc(f.date_sortie || "—") + "</td>"
                + '<td class="t-centre">'
                + (f.statut !== "active"
                    ? '<span class="muted">—</span>'
                    : (manquants
                        ? '<span class="fil-manque">' + esc(manquants)
                          + " à déclarer</span>"
                        : '<span class="fil-ok">' + esc(f.groupes_attendus.length)
                          + " dans l’application</span>"))
                + "</td>"
                + '<td class="t-centre stop-row-click">'
                + (f.statut === "active"
                    ? '<button type="button" class="fil-groupes btn-secondary" data-filiale="'
                      + esc(f.id) + '">Groupes AD</button> '
                      /* ⚠️ LE CHEMIN VERS LA GESTION, et il manquait. Signalé par
                       * l'utilisateur le 24/09/2026 : *« dans les filiales créées
                       * je ne peux pas modifier les groupes »*. On PEUT — déclarer
                       * un groupe d'annuaire hors convention, changer le profil
                       * qu'il accorde, le désactiver — mais cela vit sur l'écran
                       * des habilitations, et rien ici ne le disait. *Une capacité
                       * qu'aucun écran n'indique est une capacité absente*, même
                       * quand elle existe à deux clics. */
                      + '<a class="btn-secondary" href="#/habilitations-groupes">'
                      + "Gérer</a> "
                      + '<button type="button" class="fil-sortie btn-secondary" data-filiale="'
                      + esc(f.id) + '" data-code="' + esc(f.code) + '"'
                      + (f.dans_mon_perimetre ? "" : " disabled"
                          + ' title="Cette filiale n’est pas dans votre périmètre de lecture :'
                          + ' la sortie commence par son export complet."')
                      + ">Faire sortir</button>"
                    : '<span class="muted">—</span>')
                + "</td></tr>";
        }).join("");

        return '<div class="card"><table class="data-table"><thead><tr>'
            + "<th>Code</th><th>Raison sociale</th><th>Pays</th><th>Statut</th>"
            + "<th>Entrée</th><th>Sortie</th><th>Groupes déclarés ici</th><th></th>"
            + "</tr></thead><tbody>" + lignes + "</tbody></table>"
            /* 🛑 CETTE NOTE FERME UN FAUX BANDEAU, trouvé en cliquant. La colonne
             * compte ce que l'APPLICATION déclare — `groupes_ad` —, et la
             * synchronisation la remplit dans la transaction de création : une
             * filiale née il y a dix secondes affiche donc « 8 dans l'application »
             * alors que l'annuaire du client, lui, n'en porte aucun. Lu vite, cela
             * dit « tout va bien » au moment précis où personne ne peut entrer.
             * L'écran n'interroge pas l'annuaire — c'est le rôle du contrôle de
             * cohérence — mais il ne doit pas laisser croire qu'il l'a fait. */
            + '<p class="muted">« Déclarés ici » ne veut pas dire « existants dans '
            + "l’annuaire » : cette colonne compte ce que l’application reconnaît. Pour "
            + "confronter les deux, passez par Administration → Habilitations → "
            + "Groupes d’annuaire → « Vérifier l’annuaire ».</p>"
            + "</div>";
    }

    /**
     * Les groupes qui ne dépendent d'aucune filiale.
     *
     * ⚠️ Ils sont affichés à part parce qu'ils se comportent autrement : ils
     * existent dès la première installation, et une filiale de plus n'en ajoute
     * aucun. Les mêler aux autres ferait croire qu'une acquisition les recrée.
     */
    function encartTransversaux() {
        const t = inventaire.groupes_transversaux || [];
        const absents = inventaire.groupes_non_declares_transversaux || [];
        if (!t.length) return "";
        return '<div class="card">'
            + "<h3>Groupes qui ne dépendent d’aucune filiale</h3>"
            + '<p class="muted">Portée Groupe et transversaux. Ils existent dès la première '
            + "installation ; une acquisition n’en ajoute aucun.</p>"
            + '<p class="fil-noms">' + t.map((n) => "<code>" + esc(n) + "</code>").join(" ") + "</p>"
            + (absents.length
                ? '<p class="fil-manque">' + esc(absents.length)
                  + " ne sont pas déclarés dans l’application : "
                  + absents.map((n) => "<code>" + esc(n) + "</code>").join(" ")
                  + ". Passez par Administration → Habilitations → Groupes d’annuaire → "
                  + "« Synchroniser la déclaration ».</p>"
                : "")
            + "</div>";
    }

    /** Ce que la création vient de rendre : les groupes à créer, et le rappel. */
    function encartBilan(b) {
        const noms = b.groupes_ad.a_creer || [];
        return '<div class="card fil-bilan">'
            + "<h3>« " + esc(b.filiale.code) + " » est déclarée</h3>"
            + (noms.length
                ? "<p><strong>" + esc(noms.length) + " groupe(s) restent à créer dans "
                  + "l’Active Directory.</strong> Tant qu’ils n’existent pas, la filiale "
                  + "est déclarée et <em>personne ne peut y entrer</em> — le produit ne "
                  + "crée aucun groupe d’annuaire, et il ne le pourra jamais.</p>"
                  + '<p class="fil-noms">'
                  + noms.map((n) => "<code>" + esc(n) + "</code>").join(" ") + "</p>"
                  + '<div class="form-group"><label for="filOu">Unité d’organisation de '
                  + 'destination</label><input type="text" id="filOu" '
                  + 'value="OU=Cyber GRC,OU=Groupes,DC=exemple,DC=interne"></div>'
                  + '<button type="button" id="filCopierPs" class="btn-secondary">'
                  + "Copier le script PowerShell</button>"
                : "<p>Aucun groupe à créer : ils étaient déjà déclarés.</p>")
            + '<p class="muted">Un groupe d’annuaire qui ne suit pas la convention — un groupe '
            + "qui existe déjà chez vous, sous un autre nom — se déclare depuis "
            + '<a href="#/habilitations-groupes">Habilitations → Groupes d’annuaire</a>, '
            + "où l’on choisit la filiale et le profil qu’il accorde.</p>"
            + '<p class="muted"><strong>À savoir</strong> — votre session garde le périmètre résolu à votre '
            + "connexion : cette filiale ne vous sera <strong>lisible qu’à votre prochaine "
            + "connexion</strong>, et seulement une fois ses groupes créés et votre compte "
            + "membre de l’un d’eux. Ce n’est pas un échec de la création.</p>"
            + "</div>";
    }

    /* =====================================================================
       LE FORMULAIRE
    ===================================================================== */

    function formulaire() {
        return '<div class="card fil-form">'
            + "<h3>Déclarer une filiale</h3>"
            + '<div class="form-grid">'
            + '<div class="form-group"><label for="filCode">Code '
            + Help.tip("2 à 10 caractères, majuscules et chiffres. Il nomme les groupes "
                + "d’annuaire : GRC-<CODE>-RSSI. « GROUPE » est interdit — il entrerait en "
                + "collision avec la forme réservée au périmètre Groupe entier.")
            + '</label><input type="text" id="filCode" maxlength="10" '
            + 'placeholder="TLS" autocomplete="off"></div>'
            + '<div class="form-group"><label for="filRaison">Raison sociale</label>'
            /* ⚠️ **AUCUNE MARQUE EN DUR, pas même dans un exemple d'aide à la
             * saisie.** `test/navigateur/identite.test.mjs` l'a refusé, et il a
             * raison : le lot L9 rend la raison sociale et le logo configurables
             * par filiale, et un placeholder portant le nom de la maison mère
             * réapparaîtrait chez un autre client dans l'écran même où il déclare
             * SES sociétés. Le repère est donc la FORME attendue, pas un nom. */
            + '<input type="text" id="filRaison" '
            + 'placeholder="Raison sociale complète, telle qu’au registre"></div>'
            + '<div class="form-group"><label for="filPays">Pays</label>'
            + '<input type="text" id="filPays" maxlength="2" placeholder="FR"></div>'
            + '<div class="form-group"><label for="filEntree">Date d’entrée</label>'
            + '<input type="date" id="filEntree"></div>'
            + "</div>"
            + '<div class="fil-actions">'
            + '<button type="button" id="filCreer" class="btn-primary">Déclarer</button> '
            + '<button type="button" id="filProposer" class="btn-secondary">'
            + "Proposer depuis l’annuaire</button> "
            + '<button type="button" id="filAnnuler" class="btn-secondary">Annuler</button>'
            + "</div>"
            + '<div id="filCandidats"></div>'
            + "</div>";
    }

    function encartCandidats(lu) {
        if (!lu.unites.length) {
            return '<p class="muted">Aucune unité d’organisation trouvée sous cette base.</p>';
        }
        const lignes = lu.unites.map((u) => '<tr>'
            + "<td><strong>" + esc(u.nom) + "</strong>"
            + (u.deja_declaree ? ' <span class="fil-statut">déjà déclarée</span>' : "")
            + "</td>"
            + "<td>" + esc(u.description || "") + "</td>"
            + '<td class="t-centre"><code>' + esc(u.code_propose || "") + "</code></td>"
            + '<td class="t-centre stop-row-click">'
            + (u.deja_declaree
                ? '<span class="muted">—</span>'
                : '<button type="button" class="fil-prendre btn-secondary" data-nom="'
                  + esc(u.nom) + '" data-code="' + esc(u.code_propose || "") + '">'
                  + "Reprendre</button>")
            + "</td></tr>").join("");
        return '<h4>Unités d’organisation de l’annuaire</h4>'
            + '<p class="muted">Ce sont des <strong>propositions</strong> : l’annuaire ne '
            + "connaît pas vos filiales, il connaît des unités d’organisation. Le code, le "
            + "pays et la raison sociale exacte restent votre décision."
            + (lu.tronque ? " La lecture a été bornée : affinez la base de recherche." : "")
            + "</p>"
            + '<table class="data-table"><thead><tr><th>Unité</th><th>Description</th>'
            + "<th>Code proposé</th><th></th></tr></thead><tbody>" + lignes
            + "</tbody></table>";
    }

    /* =====================================================================
       LES BRANCHEMENTS — aucun gestionnaire en ligne (CSP du vhost livré)
    ===================================================================== */

    function brancher() {
        const nouvelle = document.getElementById("filNouvelle");
        if (nouvelle) nouvelle.addEventListener("click", () => {
            const zone = document.getElementById("filFormulaire");
            if (!zone) return;
            zone.innerHTML = zone.innerHTML ? "" : formulaire();
            if (zone.innerHTML) brancherFormulaire();
        });

        const copier = document.getElementById("filCopierPs");
        if (copier) copier.addEventListener("click", async () => {
            const ou = (document.getElementById("filOu") || {}).value || "";
            const texte = scriptPowershell(dernierBilan.groupes_ad.a_creer, ou);
            try {
                await navigator.clipboard.writeText(texte);
                avertir("Script PowerShell copié. À exécuter sur un contrôleur de domaine.",
                        "success");
            } catch (e) {
                // ⚠️ Le presse-papiers échoue hors HTTPS et sans geste utilisateur.
                //    On ne laisse pas l'administrateur sans le script pour autant.
                avertir("Le presse-papiers est refusé par le navigateur : le script est "
                      + "affiché dans la console du navigateur.", "error");
                if (window.console) console.log(texte);
            }
        });

        document.querySelectorAll(".fil-groupes").forEach((b) => {
            b.addEventListener("click", async () => {
                /* 🛑 CE BOUTON NE FAISAIT QUE RE-RENDRE LA PAGE, et l'utilisateur
                 * l'a dit le 24/09/2026 : *« la touche Groupes AD ne fait que
                 * rafraîchir la page, elle ne permet pas d'affecter les groupes à
                 * la filiale »*. Il montrait une LISTE là où il faut un panneau de
                 * gestion. Un bouton qui a l'air d'agir et qui n'agit pas est pire
                 * qu'un bouton absent : on le reclique. */
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC, jamais
                // capturé en fermeture : le serveur réattribue les identifiants.
                const id = b.getAttribute("data-filiale");
                if (groupesOuverts === id) { groupesOuverts = null; await renderList(); return; }
                groupesOuverts = id;
                await renderPanneauGroupes(id);
            });
        });

        document.querySelectorAll(".fil-sortie").forEach((b) => {
            b.addEventListener("click", async () => {
                const id = b.getAttribute("data-filiale");
                const code = b.getAttribute("data-code");
                /* ⚠️ LE MOTIF SE DEMANDE AVANT D'ENVOYER, pas après le refus du
                 * serveur — c'est le défaut trouvé en cliquant le 22/09/2026, qui
                 * faisait quatre gestes pour un. Et la date est DEMANDÉE : la
                 * sortie d'une filiale est un fait juridique daté, et prendre « le
                 * jour où l'on clique » écrirait au registre une date que personne
                 * n'a décidée. */
                const date = window.prompt(
                    "Faire sortir « " + code + " » du groupe.\n\n"
                  + "La sortie EXPORTE d’abord toutes ses données, puis bascule son statut. "
                  + "Elle quitte alors tous les périmètres : ses données restent en base, "
                  + "hors de portée de toute session.\n\n"
                  + "Date de sortie (AAAA-MM-JJ) :",
                    new Date().toISOString().slice(0, 10));
                if (!date) return;
                b.disabled = true;
                try {
                    const r = await Api.sortirFiliale(id, date);
                    // L'export est rendu en clair : on le remet à l'administrateur.
                    telechargerExport(code, r.exportation);
                    avertir(r.lignes + " ligne(s) exportée(s). " + r.avertissement, "success");
                    await UI.apresEcriture(async () => { await Sync.recharger(); });
                    dernierBilan = null;
                    await renderList();
                } catch (e) {
                    avertir(e && e.message ? e.message : "Sortie refusée.", "error");
                    b.disabled = false;
                }
            });
        });
    }

    /* =====================================================================
       LE PANNEAU « GROUPES D'ANNUAIRE » D'UNE FILIALE

       ⚠️ **Le formulaire n'est pas recopié ici** : il vient de
       `HabilitationsModule.formulaireGroupe`, qui est sa seule rédaction. Deux
       formulaires du même objet seraient deux vérités à tenir d'accord, et la
       divergence se verrait le jour où l'un accepte ce que l'autre refuse.
    ===================================================================== */

    async function renderPanneauGroupes(filialeId) {
        const hote = document.getElementById("filGroupes");
        if (!hote) return;
        const f = inventaire.filiales.find((x) => x.id === filialeId);
        if (!f) return;

        if (typeof HabilitationsModule === "undefined") {
            hote.innerHTML = '<div class="card"><p class="muted">L’écran des habilitations '
                + "n’est pas chargé : la gestion des groupes passe par lui.</p></div>";
            return;
        }
        hote.innerHTML = '<div class="card"><p class="muted">Lecture des groupes…</p></div>';
        try {
            // Une seule autorité pour l'état des groupes : celle de l'écran des
            // habilitations. Le recharger ici garantit qu'on montre ce que le
            // serveur dit MAINTENANT, et non ce qu'il disait au dernier rendu.
            await HabilitationsModule.formulaireGroupe.charger();
        } catch (e) {
            hote.innerHTML = '<div class="card"><p class="muted">'
                + esc(e && e.message ? e.message : "Lecture refusée.") + "</p></div>";
            return;
        }

        const siens = HabilitationsModule.formulaireGroupe.deFiliale(filialeId);
        const lignes = siens.map((g) => '<tr>'
            + "<td><code>" + esc(g.nom) + "</code></td>"
            + "<td>" + esc(g.profilNom || "—") + "</td>"
            + '<td class="t-centre">' + (g.actif
                ? '<span class="fil-statut fil-statut--active">actif</span>'
                : '<span class="fil-statut">inactif</span>') + "</td>"
            + '<td class="t-centre stop-row-click">'
            + '<button type="button" class="fil-grmod btn-secondary" data-groupe="'
            + esc(g.id) + '">Modifier</button></td></tr>').join("");

        hote.innerHTML = '<div class="card fil-bilan">'
            + "<h3>Groupes d’annuaire de « " + esc(f.code) + " »</h3>"
            + (siens.length
                ? '<table class="data-table"><thead><tr><th>Groupe</th><th>Profil accordé</th>'
                  + "<th>État</th><th></th></tr></thead><tbody>" + lignes + "</tbody></table>"
                : '<p class="muted">Aucun groupe déclaré pour cette filiale : personne ne peut '
                  + "y entrer.</p>")
            + (f.groupes_non_declares.length
                ? '<p class="fil-manque">' + esc(f.groupes_non_declares.length)
                  + " groupe(s) de la convention ne sont pas déclarés : "
                  + f.groupes_non_declares.map((n) => "<code>" + esc(n) + "</code>").join(" ")
                  + ". « Synchroniser la déclaration », sur l’écran des habilitations, les "
                  + "ajoute.</p>"
                : "")
            + '<p class="muted">Ces groupes doivent <strong>exister dans votre Active '
            + "Directory</strong> sous ces noms exacts. Le produit ne les y crée pas, et il ne "
            + "le pourra jamais — il déclare ce qu’ils accordent <em>ici</em>.</p>"
            + '<div class="fil-actions">'
            + '<button type="button" id="filGrNouveau" class="btn-secondary">'
            + "Déclarer un groupe pour cette filiale</button>"
            + '<button type="button" id="filGrFermer" class="btn-secondary">Fermer</button>'
            + "</div>"
            + '<div id="filGrForm"></div>'
            + "</div>";
        hote.scrollIntoView({ behavior: "smooth", block: "nearest" });

        const relire = async () => { await renderList(); await renderPanneauGroupes(filialeId); };

        document.getElementById("filGrFermer").addEventListener("click", async () => {
            groupesOuverts = null;
            await renderList();
        });
        document.getElementById("filGrNouveau").addEventListener("click", () => {
            const zone = document.getElementById("filGrForm");
            zone.innerHTML = HabilitationsModule.formulaireGroupe.html(null,
                { filialeImposee: filialeId });
            HabilitationsModule.formulaireGroupe.brancher(null,
                { conteneur: "filGrForm", apres: relire });
        });
        document.querySelectorAll(".fil-grmod").forEach((b) => {
            b.addEventListener("click", () => {
                const g = siens.find((x) => x.id === b.getAttribute("data-groupe"));
                if (!g) return;
                const zone = document.getElementById("filGrForm");
                zone.innerHTML = HabilitationsModule.formulaireGroupe.html(g);
                HabilitationsModule.formulaireGroupe.brancher(g,
                    { conteneur: "filGrForm", apres: relire });
            });
        });
    }

    /**
     * L'export de sortie, remis à l'administrateur.
     *
     * ⚠️ Il ne s'enregistre nulle part côté produit, et c'est voulu : une filiale
     * qui sort emporte ses données, et les garder ici en ferait une copie que
     * personne ne surveille. C'est à l'exploitant de le ranger où sa politique de
     * sauvegarde l'exige.
     */
    function telechargerExport(code, enveloppe) {
        /* 🛑 LE DROIT D'EXPORT EST DISTINCT DE LA LECTURE (`PLAN_SERVEUR` §3.3,
         * contrôle S7). Le serveur l'exige déjà — la route de sortie est déclarée
         * `action: 'exporter'` — mais le contrôle mécanique du dépôt le veut AUSSI
         * ici, et il a raison : une fonction qui fabrique un téléchargement est
         * une sortie de données, et la prochaine à l'appeler ne passera peut-être
         * pas par une route qui l'exige. On garde la classe, pas l'instance. */
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;
        try {
            const blob = new Blob([JSON.stringify(enveloppe, null, 2)],
                                  { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "sortie-" + String(code).toLowerCase() + "-"
                       + new Date().toISOString().slice(0, 10) + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            avertir("L’export n’a pas pu être téléchargé par le navigateur. Il reste "
                  + "disponible par « Échange de données ».", "error");
        }
    }

    function brancherFormulaire() {
        const annuler = document.getElementById("filAnnuler");
        if (annuler) annuler.addEventListener("click", () => {
            const zone = document.getElementById("filFormulaire");
            if (zone) zone.innerHTML = "";
        });

        const creer = document.getElementById("filCreer");
        if (creer) creer.addEventListener("click", async () => {
            const corps = {};
            const val = (id) => {
                const e = document.getElementById(id);
                return e && e.value ? e.value.trim() : "";
            };
            // ⚠️ Le code est mis en MAJUSCULES ici pour épargner un refus évitable :
            //    le serveur refuse « tls » avec le bon message, mais le faire refuser
            //    pour une casse est un geste perdu. Tout le reste part tel quel — ce
            //    n'est pas à l'écran de corriger une raison sociale.
            if (val("filCode")) corps.code = val("filCode").toUpperCase();
            if (val("filRaison")) corps.raison_sociale = val("filRaison");
            if (val("filPays")) corps.pays = val("filPays").toUpperCase();
            if (val("filEntree")) corps.date_entree = val("filEntree");

            creer.disabled = true;
            try {
                dernierBilan = await Api.creerFiliale(corps);
                avertir("« " + dernierBilan.filiale.code + " » est déclarée.", "success");
                await UI.apresEcriture(async () => { await Sync.recharger(); });
                await renderList();
            } catch (e) {
                avertir(e && e.message ? e.message : "Création refusée.", "error");
                creer.disabled = false;
            }
        });

        const proposer = document.getElementById("filProposer");
        if (proposer) proposer.addEventListener("click", async () => {
            proposer.disabled = true;
            proposer.textContent = "Lecture de l’annuaire…";
            try {
                candidats = await Api.candidatsFilialesAnnuaire("");
                const zone = document.getElementById("filCandidats");
                if (zone) {
                    zone.innerHTML = encartCandidats(candidats);
                    brancherCandidats();
                }
            } catch (e) {
                avertir(e && e.message ? e.message : "L’annuaire n’a pas répondu.", "error");
            } finally {
                proposer.disabled = false;
                proposer.textContent = "Proposer depuis l’annuaire";
            }
        });
    }

    function brancherCandidats() {
        document.querySelectorAll(".fil-prendre").forEach((b) => {
            b.addEventListener("click", () => {
                const code = document.getElementById("filCode");
                const raison = document.getElementById("filRaison");
                if (code) code.value = b.getAttribute("data-code") || "";
                if (raison) raison.value = b.getAttribute("data-nom") || "";
                avertir("Proposition reprise : vérifiez le code, le pays et la raison "
                      + "sociale exacte avant de déclarer.", "info");
            });
        });
    }

    return {
        renderList,
        /** Exposé pour le banc : le script AD n'est pas recomposé côté navigateur. */
        scriptPowershell,
        /**
         * Exposée pour le FILET DES EXPORTS (`test/navigateur/droits.test.mjs`).
         *
         * ⚠️ Ce n'est pas une commodité : ce filet exige d'EXERCER chaque site qui
         * fait sortir des octets, et de constater que l'entonnoir REFUSE quand le
         * droit manque. Le constat **Q-89** est passé parce que seule la moitié
         * statique existait — un contrôle qui vérifie qu'on APPELLE `exigerExport()`
         * sans vérifier qu'il REFUSE ne mesure que la rédaction.
         */
        telechargerExport
    };
})();

window.FilialesModule = FilialesModule;
