// Emplacement : js/modules/socle.js
// Nom du fichier : socle.js
//
// Module « Socle de risques » (`#/socle`) — le catalogue de risques du Groupe,
// et les ajouts propres à chaque filiale. Schéma v13, migration `012`.
//
// ── L'arbitrage que cet écran applique ──────────────────────────────────────
//
//   Utilisateur, 04/09/2026 : « chaque filiale peut ajouter ses propres risques
//   s'ils ne sont pas déjà présents au niveau groupe. »
//
// `risque_catalogue` est donc une table MIXTE : une ligne à `filiale_id` nul
// appartient au socle du Groupe, une ligne renseignée est l'ajout d'une filiale.
// Le serveur décide de laquelle est laquelle par la clé `portee` du corps de
// création — et par elle seule.
//
// ⚠️ **CET ÉCRAN NE COTE PAS UN RISQUE, ET IL NE LE FERA JAMAIS.** Il porte la
// DÉFINITION — le nom, la famille de menace, la référence — jamais l'évaluation.
// Fréquence, gravité, maîtrise et score résiduel restent dans le module
// « Risques », au niveau de la filiale, parce que l'exposition est précisément
// ce qui distingue Hambourg de Toulouse (`012_socle_de_risques.sql`, entête).
// Un champ « gravité » ajouté ici rendrait les vingt filiales incomparables en
// une livraison.
//
// ── `portee: 'groupe'` est LE point de cet écran ────────────────────────────
//
// Sans cette clé, la ligne part dans la filiale ACTIVE de son auteur et n'est
// **pas** un socle — elle en a seulement l'air pour celui qui vient de la
// saisir. C'est l'erreur mesurée le 04/09 et consignée en tête de
// `backend/test/api/socle-risques.test.mjs` : un administrateur crée, un RSSI de
// site voit, tout paraît juste — et il voyait une ligne de CHEZ LUI.
//
// ── Ce que le serveur ne rend pas, et qu'il ne faut donc pas inventer ───────
//
// **La portée d'une entrée n'est PAS lisible dans la réponse.** Mesuré, pas
// supposé : `GET /api/modele` décrit sept champs pour cette entité
// (`reference`, `nom`, `description`, `categorie`, `origine`, `statut`,
// `archive_le`) et `GET /api/donnees` en rend exactement autant, plus `id`,
// `_version` et `updatedAt`. `filiale_id` est retiré par construction, avec
// `id` et la traçabilité (`src/entites/index.ts`, `champsExposes`).
//
// Cet écran **n'invente donc aucune colonne « Portée »**. Il aurait été facile
// d'en dériver une de `origine` (`interne` / `referentiel` / `sectoriel`) : ce
// serait faux. `origine` dit d'où vient la DÉFINITION — une norme, un secteur,
// un RSSI —, jamais à quel NIVEAU la ligne vit ; un risque du socle Groupe peut
// être d'origine `interne`, et un ajout local d'origine `referentiel`. Afficher
// l'un pour l'autre reproduirait exactement la confusion que l'essai d'API
// existe pour rendre impossible.
//
// Ce que l'écran fait à la place : il le DIT, une fois, dans un encart ; et
// quand le serveur, lui, tranche — il refuse la modification d'une entrée du
// socle par un site avec le message « Cet élément appartient au socle commun du
// Groupe » —, c'est ce message-là qui est affiché, mot pour mot.
//
// ── Conventions du projet, chacune payée par un défaut ──────────────────────
//   · `escapeHtml` sur toute donnée utilisateur injectée en DOM ;
//   · AUCUN gestionnaire en ligne (`onclick=`…) — la politique de sécurité de
//     contenu du vhost les bloque, et l'application a été livrée un temps sans
//     fonctionner pour cette raison. On branche après rendu ;
//   · l'identifiant se lit dans un attribut du DOM AU MOMENT DU CLIC, jamais
//     capturé en chaîne dans une fermeture — le serveur réattribue les
//     identifiants à la création ;
//   · seuls les tokens de `css/tokens.css` (les règles sont en fin de
//     `css/style.css`, section « SOCLE DE RISQUES DU GROUPE »).

var SocleModule = (function () {
    "use strict";

    /** Nom de l'entité dans la route générique. Écrit une fois. */
    const ENTITE = "risque_catalogue";

    /**
     * Les trois origines de `ck_risque_catalogue_origine`.
     *
     * Liste écrite à la main, et c'est le BON outil ici au sens du `CLAUDE.md`
     * §3 : le contrôle est fermé en base, une valeur absente de cette liste
     * ferait **échouer bruyamment** l'écriture (400 `donnee_invalide`) au lieu
     * de réussir en silence. Une valeur inconnue reçue en lecture est d'ailleurs
     * affichée telle quelle par `libelle()`, jamais masquée.
     */
    const ORIGINES = Object.freeze([
        { valeur: "interne", libelle: "Interne" },
        { valeur: "referentiel", libelle: "Issue d'un référentiel" },
        { valeur: "sectoriel", libelle: "Sectorielle" }
    ]);

    /** Les deux statuts de `ck_risque_catalogue_statut`. */
    const STATUTS = Object.freeze([
        { valeur: "active", libelle: "Active" },
        { valeur: "archivee", libelle: "Archivée" }
    ]);

    /* =====================================================================
       ÉTAT DE LA VUE
    ===================================================================== */

    let entrees = [];
    let chargement = false;
    let erreurChargement = null;
    /** `{ ton: "ok"|"refus"|"alerte", texte: string }` ou `null`. */
    let message = null;
    /**
     * Panneau de saisie ouvert, ou `null`.
     * `{ portee: "filiale"|"groupe", id: string|null, version: number|null, valeurs: {} }`
     */
    let panneau = null;
    let filtre = { texte: "", statut: "" };

    /* =====================================================================
       ÉCHAPPEMENT — sans exception, y compris dans un <option>
    ===================================================================== */

    // La porte S2 a trouvé deux injections résiduelles, dont une dans un
    // `<option>` : l'échappement ne se relâche jamais, pas même là où « ce n'est
    // qu'une valeur technique ».
    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function libelle(table, valeur) {
        const trouve = table.find(function (o) { return o.valeur === valeur; });
        return trouve ? trouve.libelle : (valeur || "—");
    }

    /* =====================================================================
       DROITS — une COURTOISIE, jamais la barrière
    ===================================================================== */

    /**
     * La session porte-t-elle l'administration Groupe ?
     *
     * `administration_groupe` est rendu par `GET /api/session` et gelé dans
     * `Session.courante()` (`js/core/session.js`). C'est la même valeur que le
     * serveur emploie pour autoriser `portee: 'groupe'`
     * (`src/entites/index.ts` : `portee === 'groupe' && !perimetre.administrationGroupe`).
     *
     * ⚠️ Ce qui suit **ne protège rien** : la barrière est le serveur, qui rend
     * 403 `hors_perimetre`. Ne pas proposer un geste qui sera refusé est une
     * courtoisie ; et parce que le droit peut changer ENTRE l'affichage et le
     * clic — les groupes AD d'un utilisateur bougent pendant qu'il travaille —
     * le refus est traité proprement de toute façon (voir `enregistrer`).
     */
    function administrationGroupe() {
        try {
            if (typeof Session === "undefined" || !Session.courante) return false;
            const etat = Session.courante();
            return !!(etat && etat.administrationGroupe);
        } catch (e) {
            return false;
        }
    }

    /** Le profil peut-il écrire dans le domaine « risques » ? */
    function peutEcrire() {
        try {
            if (typeof Droits === "undefined" || !Droits.peutEcrire) return true;
            return Droits.peutEcrire("risques");
        } catch (e) {
            return true;
        }
    }

    /* =====================================================================
       RÉSEAU
    ===================================================================== */

    /**
     * Lecture : le jeu de données du serveur, pour la filiale active.
     *
     * ⚠️ **Pourquoi `Api.donnees()` et non le `DataStore`** — mesuré, et à
     * corriger hors de ce périmètre. `data.risque_catalogue` existe bien depuis
     * la v13 (`ARRAY_FIELDS` de `js/core/datastore.js`), mais **le magasin
     * n'expose aucun accesseur pour cette collection** : ni `getRisqueCatalogue`
     * ni équivalent. Les seules lectures publiques de cette collection sont
     * `Api.donnees()` et `DataStore.exportSnapshot()` — qui sérialise le jeu
     * ENTIER en JSON indenté pour en extraire dix lignes.
     *
     * `js/core/datastore.js` n'appartient pas au périmètre d'écriture de cet
     * agent, et un accesseur ajouté à la sauvette dans un module serait pire que
     * le manque. **Le geste exact pour lever ce détour** : ajouter à
     * `datastore.js` les quatre accesseurs de la convention (§3)
     * `getRisqueCatalogue` / `addRisqueCatalogue` / `updateRisqueCatalogue` /
     * `deleteRisqueCatalogue`, puis remplacer ici l'appel par `DataStore.…`.
     *
     * Ce que ce détour coûte, dit franchement : un chargement complet du jeu de
     * données à l'ouverture de l'écran et après chaque écriture. Ce que ce
     * détour APPORTE, et qui n'est pas rien : la liste est celle du **serveur**,
     * pas celle de la mémoire — donc une entrée que l'administration Groupe
     * vient d'écrire depuis une autre filiale y est immédiatement, sans attendre
     * le battement de sondage de 20 s de `js/core/sync.js`.
     */
    async function lire() {
        const charge = await Api.donnees();
        const jeu = (charge && charge.data) ? charge.data : charge;
        const liste = (jeu && Array.isArray(jeu[ENTITE])) ? jeu[ENTITE] : [];
        return liste.filter(function (e) { return e && e.id; });
    }

    /**
     * Création AU NIVEAU DU SOCLE — la seule requête de ce fichier qui ne passe
     * pas par `js/core/api.js`, et la seule qui ne le peut pas.
     *
     * ── Ce que c'est, et pourquoi c'est écrit plutôt que tu ─────────────────
     *
     * `Api.creer(entite, identifiant, champs)` construit `{ champs }` et **n'a
     * aucun paramètre de portée** : la clé `portee` du corps de création n'existe
     * nulle part dans `js/core/api.js`, vérifié par recherche. Or c'est
     * exactement la clé qui décide si la ligne vit au Groupe ou dans la filiale.
     * Il n'existe donc, aujourd'hui, aucun chemin pour créer une entrée de socle
     * depuis la SPA — et `js/core/api.js` n'appartient pas au périmètre
     * d'écriture de cet agent.
     *
     * C'est la situation exacte qu'a connue `js/modules/journal.js`, et la
     * réponse est la même : une exception **écrite, bornée, avec le geste exact
     * pour la lever**, plutôt qu'une exception tue. Elle est bornée aussi
     * étroitement que possible — toute création de portée « filiale » passe par
     * `Api.creer`, et cette fonction n'est appelée QUE pour `portee: 'groupe'`.
     *
     * **Le geste pour la lever, en trois lignes** : donner à `Api.creer` un
     * quatrième paramètre `portee`
     *
     *     function creer(entite, identifiant, champs, portee) {
     *         const corps = { champs: champs };
     *         if (identifiant) corps.id = identifiant;
     *         if (portee) corps.portee = portee;
     *         …
     *
     * puis remplacer ici l'appel par `Api.creer(ENTITE, null, champs, "groupe")`
     * et supprimer cette fonction. Rien d'autre ne bouge.
     *
     * ── Ce que cette fonction reprend d'`api.js`, et ce qu'elle ne reprend pas
     *
     * Reprend : origine relative (`api/…`, même constante `BASE`),
     * `credentials: "same-origin"` — le cookie de session est `HttpOnly` et ne
     * voyage que là —, `cache: "no-store"`, `redirect: "error"`, l'erreur typée
     * par `{erreur, message}` du serveur, et **le message français du serveur
     * affiché tel quel** plutôt qu'un message brut d'exception.
     *
     * Ne reprend PAS, et c'est délibéré : le délai de garde et la notification
     * des observateurs de `401`. Un `401` sur CE chemin est traité localement
     * (message explicite, la saisie reste à l'écran) ; c'est acceptable parce
     * que l'écran est déjà monté — donc une session existait — et parce que le
     * prochain appel à `Api.donnees()`, lui, réveillera l'écran de connexion par
     * la voie normale. Reproduire l'entonnoir d'authentification ici serait une
     * seconde rédaction de la même règle, c'est-à-dire la faute que l'entête
     * d'`api.js` interdit depuis le lot L2.
     */
    async function creerAuSocle(champs) {
        // ⚠️ Passe désormais par `api.js`, la porte unique. La méthode manquait
        // quand cet écran a été écrit ; elle existe depuis le 04/09/2026, et la
        // seconde porte a disparu avec elle — une garantie recopiée est une
        // garantie qui divergera.
        return Api.creer(ENTITE, null, champs, "groupe");
    }

    /* =====================================================================
       LE FAIT, PLUS LE GESTE QUE CETTE COUCHE CONNAÎT
    ===================================================================== */

    /**
     * `js/core/api.js` énonce ce qui s'est passé et ne prescrit AUCUN geste
     * (constats Q-19, Q-29, Q-57) : il ignore ce que l'appelant tient en
     * mémoire. Cet écran, lui, le sait — et il sait que la réponse n'est pas la
     * même selon le refus.
     */
    function texteErreur(e) {
        if (!e) return "Erreur inconnue.";
        const code = e.code || "";
        // `hors_perimetre` : le serveur dit lui-même POURQUOI — « Cet élément
        // appartient au socle commun du Groupe », ou « La création d'un
        // enregistrement de portée Groupe est réservée à une administration
        // Groupe ». Sa phrase est meilleure que toute reformulation ici : elle
        // est la seule à connaître la portée réelle de la ligne visée.
        if (code === "hors_perimetre") return e.message;
        if (e.estConflit && e.estConflit()) {
            return "Cette entrée a été modifiée entre-temps par quelqu'un d'autre. " +
                "La liste vient d'être rechargée : reprenez la modification sur la " +
                "version affichée.";
        }
        if (e.estNonAuthentifie && e.estNonAuthentifie()) {
            return "Votre session n'est plus ouverte sur le serveur. Reconnectez-vous ; " +
                "votre saisie reste à l'écran.";
        }
        if (e.statut === 401) {
            return "Votre session n'est plus ouverte sur le serveur. Reconnectez-vous ; " +
                "votre saisie reste à l'écran.";
        }
        return e.message || String(e);
    }

    /* =====================================================================
       AFFICHAGE
    ===================================================================== */

    function visibles() {
        const texte = String(filtre.texte || "").trim().toLowerCase();
        return entrees.filter(function (e) {
            if (filtre.statut && e.statut !== filtre.statut) return false;
            if (!texte) return true;
            return [e.nom, e.reference, e.categorie, e.description]
                .some(function (v) { return String(v || "").toLowerCase().indexOf(texte) !== -1; });
        }).sort(function (a, b) {
            return String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
        });
    }

    function ligneHtml(e) {
        const outils = peutEcrire()
            ? '<div class="soc-outils">' +
              '<button type="button" class="soc-modifier" data-id="' + esc(e.id) + '">Modifier</button>' +
              '<button type="button" class="soc-archiver" data-id="' + esc(e.id) + '">' +
              (e.statut === "archivee" ? "Réactiver" : "Archiver") + "</button>" +
              '<button type="button" class="soc-supprimer soc-danger" data-id="' + esc(e.id) + '">Supprimer</button>' +
              "</div>"
            : '<span class="soc-vide">Lecture seule</span>';

        // L'identifiant vit dans un ATTRIBUT : il est relu au moment du clic. Une
        // fermeture qui l'aurait capturé viserait un enregistrement que le serveur
        // a pu renommer à la création, EN SILENCE (`CLAUDE.md` §3).
        return '<tr data-id="' + esc(e.id) + '">' +
            '<td class="soc-ref">' + (e.reference ? esc(e.reference) : '<span class="soc-vide">—</span>') + "</td>" +
            "<td>" +
              '<span class="soc-nom">' + esc(e.nom) + "</span>" +
              (e.description ? '<span class="soc-desc">' + esc(e.description) + "</span>" : "") +
            "</td>" +
            "<td>" + (e.categorie ? esc(e.categorie) : '<span class="soc-vide">—</span>') + "</td>" +
            "<td>" + esc(libelle(ORIGINES, e.origine)) + "</td>" +
            '<td><span class="status ' +
                (e.statut === "archivee" ? "status-non-applicable" : "status-conforme") + '">' +
                esc(libelle(STATUTS, e.statut)) + "</span></td>" +
            "<td>" + outils + "</td>" +
            "</tr>";
    }

    function corpsHtml() {
        if (chargement) return '<p class="chart-empty">Lecture du catalogue…</p>';
        if (erreurChargement) {
            return '<div class="grp-message grp-message--refus" role="alert">' +
                "<strong>Le catalogue n'a pas pu être lu.</strong><br>" + esc(erreurChargement) +
                "</div>";
        }
        const liste = visibles();
        if (!entrees.length) {
            return '<div class="empty-state"><h3>Aucun risque au catalogue</h3>' +
                "<p>Le socle du Groupe est vide et votre filiale n'a rien ajouté. " +
                "Commencez par les menaces que vous savez déjà vous concerner.</p></div>";
        }
        if (!liste.length) {
            return '<p class="chart-empty">Aucune entrée ne correspond à ces critères.</p>';
        }
        return '<table class="data-table soc-table"><thead><tr>' +
            "<th>Référence</th><th>Risque</th><th>Famille de menace</th>" +
            "<th>Origine</th><th>Statut</th><th>Actions</th>" +
            "</tr></thead><tbody>" + liste.map(ligneHtml).join("") + "</tbody></table>";
    }

    function messageHtml() {
        if (!message) return "";
        return '<div class="grp-message grp-message--' + esc(message.ton) + '" role="' +
            (message.ton === "ok" ? "status" : "alert") + '">' + esc(message.texte) + "</div>";
    }

    function optionsHtml(table, choisie) {
        return table.map(function (o) {
            return '<option value="' + esc(o.valeur) + '"' +
                (o.valeur === choisie ? " selected" : "") + ">" + esc(o.libelle) + "</option>";
        }).join("");
    }

    function panneauHtml() {
        if (!panneau) return "";
        const v = panneau.valeurs || {};
        const auGroupe = panneau.portee === "groupe";
        const titre = panneau.id
            ? "Modifier une entrée du catalogue"
            : (auGroupe ? "Ajouter au socle du Groupe" : "Ajouter à ma filiale");

        return '<section class="grp-panneau' + (auGroupe ? " grp-panneau--groupe" : "") + '" id="soclePanneau">' +
            "<h2>" + esc(titre) + "</h2>" +
            (auGroupe && !panneau.id
                ? '<p class="grp-note" style="margin-bottom:12px;">Cette entrée sera <strong>commune ' +
                  "à toutes les filiales du Groupe</strong>. Elles la verront et pourront s'y " +
                  "rattacher ; aucune ne pourra la modifier.</p>"
                : "") +
            '<div class="grp-grille-2">' +
              '<div class="form-group"><label for="socleNom">Nom du risque <span style="color:var(--color-danger)">*</span></label>' +
              '<input id="socleNom" value="' + esc(v.nom || "") + '" placeholder="Ex : Rançongiciel sur le SI de production" /></div>' +
              '<div class="form-group"><label for="socleReference">Référence</label>' +
              '<input id="socleReference" value="' + esc(v.reference || "") + '" placeholder="Ex : R-001" /></div>' +
            "</div>" +
            '<div class="grp-grille-2">' +
              '<div class="form-group"><label for="socleCategorie">Famille de menace ' +
              Help.tip("Texte libre, à dessein : le vocabulaire des menaces bouge plus vite qu'une livraison. Ex. : Rançongiciel, Fuite de données, Indisponibilité, Environnement.") +
              "</label>" +
              '<input id="socleCategorie" value="' + esc(v.categorie || "") + '" placeholder="Ex : Malveillance" /></div>' +
              '<div class="form-group"><label for="socleOrigine">Origine de la définition ' +
              Help.tip("D'où vient la définition de ce risque : un référentiel l'impose, le secteur l'a fait connaître, ou votre équipe l'a formulée. Sert à ne pas archiver par erreur ce qu'une norme exige. Ce n'est PAS le niveau — Groupe ou filiale — de l'entrée.") +
              "</label>" +
              '<select id="socleOrigine">' + optionsHtml(ORIGINES, v.origine || "interne") + "</select></div>" +
            "</div>" +
            '<div class="form-group"><label for="socleDescription">Description</label>' +
            '<textarea id="socleDescription" placeholder="Ce que ce risque recouvre, en une ou deux phrases.">' +
            esc(v.description || "") + "</textarea></div>" +
            '<p class="grp-note grp-note--reserve"><strong>Ce formulaire ne cote pas le risque.</strong> ' +
            "Fréquence, gravité, maîtrise et score résiduel se saisissent dans « Risques », " +
            "au niveau de votre filiale : l'exposition à une même menace n'est pas la même " +
            "d'un site à l'autre, et c'est cette différence que la consolidation Groupe " +
            "cherche à voir.</p>" +
            '<div class="grp-actions">' +
              '<button type="button" id="socleEnregistrer">' + (panneau.id ? "Mettre à jour" : "Enregistrer") + "</button>" +
              '<button type="button" id="socleAnnuler" class="btn-secondary">Annuler</button>' +
            "</div>" +
            "</section>";
    }

    function vueHtml() {
        const admin = administrationGroupe();
        const ecriture = peutEcrire();
        return '<section class="page">' +
            '<div class="dashboard-header no-print"><div>' +
              "<h1>Socle de risques " +
              Help.tip("Le catalogue des risques du Groupe, plus les risques propres à votre filiale. Il porte la DÉFINITION d'un risque — son nom, sa famille — jamais son évaluation.") +
              "</h1>" +
              '<p style="color:var(--text-muted); margin-top:5px;">La définition commune des menaces ' +
              "— l'évaluation reste dans « Risques », au niveau de votre filiale</p>" +
            "</div>" +
            '<div style="display:flex; gap:10px; flex-wrap:wrap;">' +
              (ecriture
                ? '<button type="button" id="socleAjouterFiliale" style="background:var(--primary);">Ajouter à ma filiale</button>'
                : "") +
              (ecriture && admin
                ? '<button type="button" id="socleAjouterGroupe" style="background:var(--accent);">Ajouter au socle du Groupe</button>'
                : "") +
            "</div></div>" +

            '<div class="grp-note">' +
              "<p><strong>Une définition, pas une cotation.</strong> Une entrée décrit " +
              "<em>quelle menace existe</em>. Ce qu'elle vaut chez vous — fréquence, gravité, " +
              "maîtrise, score résiduel — se saisit dans « Risques » : l'exposition est " +
              "précisément ce qui distingue un site d'un autre.</p>" +
              "<p><strong>Deux niveaux.</strong> Le <em>socle du Groupe</em> est commun à toutes " +
              "les filiales ; il se lit partout et ne s'écrit que par l'administration Groupe. " +
              "Votre filiale peut y <em>ajouter</em> ce que le socle ne couvre pas.</p>" +
            "</div>" +

            (admin ? "" :
              '<div class="grp-note grp-note--reserve">' +
              "<p><strong>Le niveau d'une entrée n'est pas affiché, et ce n'est pas un oubli.</strong> " +
              "L'API ne rend pas la portée d'une ligne : la deviner à partir de son « origine » " +
              "serait faux — un risque du socle peut être d'origine interne, et un ajout local " +
              "venir d'un référentiel. Le serveur, lui, tranche à l'écriture : s'il refuse votre " +
              "modification, il vous dira que l'entrée appartient au socle du Groupe.</p>" +
              "</div>") +

            '<div id="socleMessage">' + messageHtml() + "</div>" +
            '<div id="soclePanneauHote">' + panneauHtml() + "</div>" +

            '<div class="grp-barre no-print">' +
              '<label for="socleRecherche">Rechercher' +
              '<input id="socleRecherche" type="search" placeholder="nom, référence, famille…" value="' +
              esc(filtre.texte) + '" /></label>' +
              '<label for="socleStatut">Statut' +
              '<select id="socleStatut"><option value="">Tous</option>' +
              optionsHtml(STATUTS, filtre.statut) + "</select></label>" +
            "</div>" +

            '<div id="socleCorps">' + corpsHtml() + "</div>" +
            "</section>";
    }

    /* =====================================================================
       RAFRAÎCHISSEMENTS CIBLÉS
       Redessiner toute la page effacerait la saisie en cours dans le panneau —
       et cette perte-là est exactement ce que la porte S2 a sanctionné.
    ===================================================================== */

    function rafraichirCorps() {
        const hote = document.getElementById("socleCorps");
        if (!hote) return;
        hote.innerHTML = corpsHtml();
        brancherLignes();
    }

    function rafraichirMessage() {
        const hote = document.getElementById("socleMessage");
        if (hote) hote.innerHTML = messageHtml();
    }

    function rafraichirPanneau() {
        const hote = document.getElementById("soclePanneauHote");
        if (!hote) return;
        hote.innerHTML = panneauHtml();
        brancherPanneau();
    }

    /* =====================================================================
       BRANCHEMENT — aucun gestionnaire en ligne, jamais
    ===================================================================== */

    function brancherLignes() {
        document.querySelectorAll(".soc-modifier").forEach(function (bouton) {
            bouton.addEventListener("click", function () { ouvrirEdition(bouton.dataset.id); });
        });
        document.querySelectorAll(".soc-archiver").forEach(function (bouton) {
            bouton.addEventListener("click", function () { basculerArchive(bouton.dataset.id); });
        });
        document.querySelectorAll(".soc-supprimer").forEach(function (bouton) {
            bouton.addEventListener("click", function () { supprimer(bouton.dataset.id); });
        });
    }

    function brancherPanneau() {
        const enregistre = document.getElementById("socleEnregistrer");
        if (enregistre) enregistre.addEventListener("click", function () { enregistrer(); });
        const annule = document.getElementById("socleAnnuler");
        if (annule) annule.addEventListener("click", function () { panneau = null; rafraichirPanneau(); });
        const nom = document.getElementById("socleNom");
        if (nom) nom.focus();
    }

    function brancher() {
        const ajoutFiliale = document.getElementById("socleAjouterFiliale");
        if (ajoutFiliale) ajoutFiliale.addEventListener("click", function () { ouvrirCreation("filiale"); });
        const ajoutGroupe = document.getElementById("socleAjouterGroupe");
        if (ajoutGroupe) ajoutGroupe.addEventListener("click", function () { ouvrirCreation("groupe"); });

        const recherche = document.getElementById("socleRecherche");
        if (recherche) recherche.addEventListener("input", function () {
            filtre.texte = recherche.value;
            rafraichirCorps();
        });
        const statut = document.getElementById("socleStatut");
        if (statut) statut.addEventListener("change", function () {
            filtre.statut = statut.value;
            rafraichirCorps();
        });

        brancherPanneau();
        brancherLignes();
    }

    /* =====================================================================
       GESTES
    ===================================================================== */

    function ouvrirCreation(portee) {
        message = null;
        panneau = { portee: portee, id: null, version: null, valeurs: { origine: "interne" } };
        rafraichirMessage();
        rafraichirPanneau();
    }

    function ouvrirEdition(identifiant) {
        const entree = entrees.find(function (e) { return e.id === identifiant; });
        if (!entree) { rafraichirCorps(); return; }
        message = null;
        panneau = {
            portee: "filiale",          // sans effet : `portee` ne vaut qu'à la création
            id: entree.id,
            version: entree._version,
            valeurs: {
                nom: entree.nom, reference: entree.reference, categorie: entree.categorie,
                origine: entree.origine, description: entree.description
            }
        };
        rafraichirMessage();
        rafraichirPanneau();
    }

    function lireFormulaire() {
        const val = function (id) {
            const champ = document.getElementById(id);
            return champ ? String(champ.value).trim() : "";
        };
        return {
            nom: val("socleNom"),
            reference: val("socleReference"),
            categorie: val("socleCategorie"),
            origine: val("socleOrigine") || "interne",
            description: val("socleDescription")
        };
    }

    async function enregistrer() {
        if (!panneau) return;
        const champs = lireFormulaire();
        if (!champs.nom) {
            message = { ton: "alerte", texte: "Le nom du risque est obligatoire." };
            rafraichirMessage();
            return;
        }
        // La saisie est conservée dans l'état du panneau AVANT l'envoi : si le
        // serveur refuse, elle est encore là. Un refus qui efface dix minutes de
        // saisie est le défaut que le constat Q-29 a coûté deux fois.
        panneau.valeurs = champs;

        try {
            if (panneau.id) {
                await Api.modifier(ENTITE, panneau.id, panneau.version, champs);
                message = { ton: "ok", texte: "Entrée mise à jour." };
            } else if (panneau.portee === "groupe") {
                await creerAuSocle(champs);
                message = {
                    ton: "ok",
                    texte: "Entrée ajoutée au socle du Groupe : toutes les filiales la voient."
                };
            } else {
                await Api.creer(ENTITE, null, champs);
                message = { ton: "ok", texte: "Entrée ajoutée au catalogue de votre filiale." };
            }
            panneau = null;
            rafraichirPanneau();
            await recharger();
        } catch (e) {
            message = { ton: "refus", texte: texteErreur(e) };
            // Un conflit de version rend la liste affichée périmée : on la
            // recharge, sans fermer le panneau — la saisie reste à l'écran.
            if (e && e.estConflit && e.estConflit()) await recharger();
        }
        rafraichirMessage();
    }

    /**
     * Archive ou réactive une entrée.
     *
     * ⚠️ `ck_risque_catalogue_archive` impose l'ÉGALITÉ `(statut = 'archivee')
     * = (archive_le is not null)` : envoyer l'un sans l'autre rend un `400`
     * « règle de cohérence entre plusieurs champs », mesuré. Les deux voyagent
     * donc ensemble, toujours.
     */
    async function basculerArchive(identifiant) {
        const entree = entrees.find(function (e) { return e.id === identifiant; });
        if (!entree) { rafraichirCorps(); return; }
        const versArchive = entree.statut !== "archivee";
        try {
            await Api.modifier(ENTITE, entree.id, entree._version, {
                statut: versArchive ? "archivee" : "active",
                archive_le: versArchive ? new Date().toISOString() : null
            });
            message = {
                ton: "ok",
                texte: versArchive
                    ? "Entrée archivée : elle n'est plus proposée, et rien n'est perdu."
                    : "Entrée réactivée."
            };
            await recharger();
        } catch (e) {
            message = { ton: "refus", texte: texteErreur(e) };
            if (e && e.estConflit && e.estConflit()) await recharger();
        }
        rafraichirMessage();
    }

    async function supprimer(identifiant) {
        const entree = entrees.find(function (e) { return e.id === identifiant; });
        if (!entree) { rafraichirCorps(); return; }
        const confirme = window.confirm(
            "Supprimer « " + entree.nom + " » du catalogue ?\n" +
            "Les risques de filiales qui s'y rattachent sont CONSERVÉS : ils perdent " +
            "seulement le lien vers cette définition.");
        if (!confirme) return;
        try {
            await Api.supprimer(ENTITE, entree.id, entree._version);
            message = { ton: "ok", texte: "Entrée supprimée du catalogue." };
            await recharger();
        } catch (e) {
            message = { ton: "refus", texte: texteErreur(e) };
            if (e && e.estConflit && e.estConflit()) await recharger();
        }
        rafraichirMessage();
    }

    /* =====================================================================
       CHARGEMENT
    ===================================================================== */

    async function recharger() {
        chargement = true;
        erreurChargement = null;
        rafraichirCorps();
        try {
            entrees = await lire();
        } catch (e) {
            entrees = [];
            erreurChargement = texteErreur(e);
        } finally {
            chargement = false;
            rafraichirCorps();
        }
    }

    function renderList() {
        const app = document.getElementById("app");
        if (!app) return;
        // L'état de saisie ne survit pas à une navigation : arriver sur l'écran
        // avec un panneau ouvert d'une visite précédente serait déroutant.
        panneau = null;
        message = null;
        entrees = [];
        erreurChargement = null;
        chargement = true;
        app.innerHTML = vueHtml();
        brancher();
        recharger();
    }

    return { renderList };
})();
