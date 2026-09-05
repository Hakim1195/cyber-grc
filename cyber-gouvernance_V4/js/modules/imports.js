// Emplacement : js/modules/imports.js
// Nom du fichier : imports.js
//
// Module « Import généralisé » — charger en une fois un fichier tableur dans
// une entité du logiciel (lot L7). C'est le critère décisif du client :
// intégrer une société rachetée sans ressaisir à la main ses incidents, ses
// actifs et ses prestataires.
//
// ── Le contrat : `backend/src/import/index.ts` et `modele.ts`, et eux seuls ──
//
//   | Route                          | Déclaration            | Ce qu'elle fait |
//   |---------------------------------|------------------------|------------------|
//   | `GET  /api/import/modeles`      | `{ lire, null }`       | catalogue des entités importables, colonnes, libellés |
//   | `GET  /api/import/:entite/modele` (`?format=xlsx\|csv`) | `{ lire, selon-entite }` | modèle vierge à remplir |
//   | `POST /api/import/:entite` (`?appliquer=oui`)           | `{ ecrire, selon-entite }` | dépose un fichier — **aperçu par défaut** |
//
// **L'aperçu est le défaut, et ce n'est pas une politesse** (`src/import/index.ts`) :
// tant que `appliquer=oui` n'est pas demandé, le serveur écrit RÉELLEMENT
// l'import puis annule sa transaction, si bien que les chiffres rendus sont
// ceux d'un import réel et non une estimation. Cet écran ne propose donc
// jamais d'appliquer un fichier qui n'a pas d'abord été analysé sous cette
// forme (`peutAppliquer`, plus bas).
//
// ── Trois propriétés que le serveur tient, et que cet écran doit DIRE ────────
//
//  1. **Tout ou rien** : `avecTransaction`, un seul appel — une erreur, où
//     qu'elle survienne, annule l'import entier.
//  2. **Idempotent par le FICHIER** : `imports.cle_idempotence` (empreinte du
//     fichier). Réimporter le même fichier dans la même filiale est sans
//     effet, et le serveur le dit (`rapport.dejaImporte`).
//  3. **L'import CRÉE ; il ne met jamais à jour, ne supprime jamais.**
//     `misesAJour` vaut toujours zéro. Remplacer un jeu de données entier est
//     la reprise d'un export `grc-backup` (écran `/settings`), pas cet écran.
//
// ── Le rapport d'erreurs ligne par ligne ─────────────────────────────────────
//
// Un fichier de 250 lignes dont 27 sont fausses doit dire LESQUELLES : chaque
// entrée de `rapport.erreurs` porte un numéro de ligne (dans le tableur de
// l'utilisateur, en-tête comprise) et le libellé de la colonne fautive. Le
// serveur borne le détail à `ERREURS_RAPPORTEES` (200) tout en comptant le
// total dans `rapport.enErreur` : cet écran affiche LES DEUX, sans quoi
// l'utilisateur croirait avoir tout vu.
//
// ── Le réseau : une exception assumée, bornée à ce fichier ──────────────────
//
// `js/core/api.js` est le SEUL point du frontend qui doit parler au réseau —
// et il n'expose aucune fonction pour ces trois routes : ce fichier n'a pas
// le droit d'y toucher (périmètre d'écriture disjoint de la vague, quatre
// agents en parallèle sur ce dépôt). `js/modules/journal.js` documente
// l'exact précédent : une fonction réseau locale, aux mêmes garanties que
// `Api.appeler` (`same-origin`, `no-store`, `redirect: error`, délai de
// garde), écrite pour la même raison, et « levée » plus tard quand
// l'orchestrateur a complété `api.js`. C'est la même exception ici, avec le
// même geste exact pour la lever : ajouter `Api.importModeles()`,
// `Api.importModeleUrl()`/`Api.importGabarit()` et `Api.importEnvoyer()` à
// `js/core/api.js`, puis remplacer `ImportsReseau` ci-dessous par des appels
// à `Api`.
//
// ── Le téléchargement du modèle N'EST PAS un export ─────────────────────────
//
// Le gabarit est un formulaire VIDE — aucune donnée du produit n'y figure.
// `src/import/index.ts` le déclare `lire`, pas `exporter`, précisément pour
// qu'un contributeur sans droit d'export puisse télécharger le modèle qu'il a
// le droit de remplir. Ce fichier suit la même règle côté navigateur : la
// même distinction, pour la même raison, que l'arbitrage du 04/09/2026 sur
// l'ouverture d'une pièce jointe (`js/core/api.js`, `adressePiece()` ;
// `CONVENTIONS.md` §31.5) — une navigation directe vers l'URL, SANS
// `URL.createObjectURL` ni attribut `download`, si bien que le fichier
// « n'a plus rien à faire sortir fabriquer côté client » et que l'entonnoir
// d'export (`test/depot/entonnoir-export.test.mjs`) n'a rien à accuser ici,
// par disparition de l'objet qu'il cherche — pas par exemption écrite dans
// une liste. Voir le rapport de l'agent V4 pour l'arbitrage détaillé.
//
// ⚠️ Conventions du projet, chacune payée par un défaut :
//   · `escapeHtml` sur toute donnée utilisateur injectée en DOM — un message
//     d'erreur d'import contient la valeur FAUTIVE DU FICHIER, donc du texte
//     que l'utilisateur contrôle. C'est le point d'injection le plus évident
//     de cet écran ;
//   · AUCUN gestionnaire en ligne (`onclick=`) — la CSP du vhost les bloque ;
//   · l'entité visée par un bouton se relit dans le `<select>` AU MOMENT DU
//     CLIC, jamais capturée en chaîne dans une fermeture ;
//   · seuls les tokens de `css/tokens.css`.

var ImportsModule = (function () {
    "use strict";

    /* =====================================================================
       RÉSEAU — exception assumée, bornée à ce module (voir l'entête)
    ===================================================================== */

    var ImportsReseau = (function () {
        var BASE = "api";
        var DELAI_CATALOGUE_MS = 30000;
        var DELAI_ENVOI_MS = 90000; // lecture + écriture d'un tableur : plus long qu'une requête ordinaire

        function ErreurImport(details) {
            var d = details || {};
            this.name = "ErreurImport";
            this.message = d.message || "Le serveur n'a pas pu traiter la demande.";
            this.statut = d.statut || 0;
            this.code = d.code || "erreur_interne";
            this.reseau = !!d.reseau;
        }
        ErreurImport.prototype = Object.create(Error.prototype);
        ErreurImport.prototype.constructor = ErreurImport;
        ErreurImport.prototype.estDroitInsuffisant = function () {
            return this.statut === 403 && this.code === "droit_insuffisant";
        };
        ErreurImport.prototype.estNonAuthentifie = function () { return this.statut === 401; };

        /** Un 401 ici prévient le reste de l'application par le canal HABITUEL :
         *  ce module ne réinvente pas la détection d'expiration de session,
         *  il déclenche celle qui existe déjà (`Api.session()` traverse
         *  `appeler()`, qui prévient les observateurs de `vault.js`). */
        function signalerSessionExpiree() {
            if (typeof Api !== "undefined" && Api.session) {
                Api.session().catch(function () { /* déjà signalé par ce même appel */ });
            }
        }

        function corpsJson(reponse) {
            var type = reponse.headers.get("content-type") || "";
            if (type.indexOf("application/json") === -1) return Promise.resolve(null);
            return reponse.json().catch(function () { return null; });
        }

        function requeteAvecDelai(chemin, options, delaiMs) {
            var controleur = (typeof AbortController !== "undefined") ? new AbortController() : null;
            var minuteur = controleur ? setTimeout(function () { controleur.abort(); }, delaiMs) : null;
            var opts = {
                method: options.methode || "GET",
                headers: options.entetes || { "accept": "application/json" },
                body: options.corps,
                credentials: "same-origin",
                cache: "no-store",
                redirect: "error",
                signal: controleur ? controleur.signal : undefined
            };
            return fetch(BASE + chemin, opts)
                .catch(function (e) {
                    throw new ErreurImport({
                        reseau: true, statut: 0, code: "indisponible",
                        message: "Le serveur est injoignable. Vérifiez votre connexion (VPN) et réessayez."
                    });
                })
                .then(function (reponse) {
                    if (minuteur) clearTimeout(minuteur);
                    return reponse;
                }, function (e) {
                    if (minuteur) clearTimeout(minuteur);
                    throw e;
                });
        }

        /** GET /api/import/modeles — le catalogue des entités importables. */
        function obtenirCatalogue() {
            return requeteAvecDelai("/import/modeles", {}, DELAI_CATALOGUE_MS).then(function (reponse) {
                return corpsJson(reponse).then(function (charge) {
                    if (!reponse.ok) {
                        if (reponse.status === 401) signalerSessionExpiree();
                        throw new ErreurImport({
                            statut: reponse.status,
                            code: (charge && charge.erreur) || "erreur_interne",
                            message: (charge && charge.message) ||
                                ("Le serveur a refusé la demande (code " + reponse.status + ").")
                        });
                    }
                    if (!charge || typeof charge !== "object" || !Array.isArray(charge.entites)) {
                        throw new ErreurImport({
                            statut: reponse.status, code: "erreur_interne",
                            message: "Le catalogue des modèles d'import est illisible."
                        });
                    }
                    return charge;
                });
            });
        }

        /** URL relative du modèle vierge — pour une NAVIGATION, jamais un fetch (voir l'entête). */
        function urlGabarit(entite, format) {
            return BASE + "/import/" + encodeURIComponent(entite) + "/modele?format=" + encodeURIComponent(format);
        }

        /**
         * POST /api/import/:entite — dépose un fichier.
         *
         * 200 (tout est passé) et 409 (des lignes ont été refusées) rendent tous
         * les deux un RAPPORT complet (`src/import/moteur.ts`) : ce ne sont PAS
         * des échecs applicatifs, c'est le fait mesuré. Le reste de l'espace
         * HTTP est un refus STRUCTUREL (fichier illisible, droit insuffisant,
         * filiale absente, volume hors borne…) et est levé comme une erreur.
         */
        function envoyerImport(entite, fichier, appliquer) {
            var formulaire = new FormData();
            formulaire.append("fichier", fichier);
            var chemin = "/import/" + encodeURIComponent(entite) + (appliquer ? "?appliquer=oui" : "");

            return requeteAvecDelai(chemin, {
                methode: "POST",
                // ⚠️ PAS de content-type ici : FormData porte sa frontière
                // (boundary=…) que seul le navigateur connaît (même remarque
                // que `js/core/api.js`, bloc « corps de formulaire »).
                entetes: { "accept": "application/json" },
                corps: formulaire
            }, DELAI_ENVOI_MS).then(function (reponse) {
                return corpsJson(reponse).then(function (charge) {
                    if (reponse.status === 200 || reponse.status === 409) {
                        if (!charge || typeof charge !== "object") {
                            throw new ErreurImport({
                                statut: reponse.status, code: "erreur_interne",
                                message: "Le serveur a rendu une réponse illisible."
                            });
                        }
                        return charge;
                    }
                    if (reponse.status === 401) signalerSessionExpiree();
                    throw new ErreurImport({
                        statut: reponse.status,
                        code: (charge && charge.erreur) || (reponse.status >= 500 ? "indisponible" : "erreur_interne"),
                        message: (charge && charge.message) ||
                            ("Le serveur a refusé la demande (code " + reponse.status + ").")
                    });
                });
            });
        }

        return { obtenirCatalogue: obtenirCatalogue, urlGabarit: urlGabarit, envoyerImport: envoyerImport };
    })();

    /* =====================================================================
       VOCABULAIRE LOCAL — libellés humains, avec repli sur le nom technique
       (même discriminant que `CLAUDE.md` §3 : une entrée manquante s'affiche
       en clair, elle ne fait rien échouer en silence)
    ===================================================================== */

    var LIBELLES_ENTITES = Object.freeze({
        clients: "Donneurs d'ordre",
        exigences: "Exigences",
        actions: "Plan d'actions",
        risques: "Risques",
        actifs: "Actifs",
        processus: "Processus (BIA)",
        crise: "Cellule de crise",
        scenarios_pra: "Scénarios PCA/PRA",
        tests_pra: "Tests PCA/PRA",
        prestataires: "Prestataires",
        mco_actions: "Actions préalables (MCO)",
        audits: "Audits",
        revues: "Revues de direction",
        evaluations: "Évaluations de référentiels",
        mesures: "Mesures de sécurité",
        incidents: "Incidents",
        documents: "Documents",
        traitements: "Traitements (RGPD)",
        mappings: "Correspondances inter-référentiels",
        history: "Historique des indicateurs",
        personnes: "Personnel (annuaire)",
        risque_catalogue: "Catalogue de risques (Groupe)",
        referentiels_actifs: "Référentiels actifs (par filiale)"
    });

    var LIBELLES_TYPES = Object.freeze({
        texte: "texte",
        entier: "nombre entier",
        nombre: "nombre",
        booleen: "oui / non",
        date: "date (AAAA-MM-JJ ou JJ/MM/AAAA)",
        horodatage: "date et heure",
        json: "document JSON"
    });

    var LIBELLES_DOMAINES = Object.freeze({
        pilotage: "Pilotage", conformite: "Conformité", risques: "Risques", actifs: "Actifs",
        actions: "Actions", incidents: "Incidents", continuite: "Continuité", documents: "Documents",
        audits: "Audits", tiers: "Tiers", rgpd: "RGPD", personnel: "Personnel",
        administration: "Administration", journal: "Journal"
    });

    function libelleEntite(nom) {
        if (Object.prototype.hasOwnProperty.call(LIBELLES_ENTITES, nom)) return LIBELLES_ENTITES[nom];
        return String(nom || "").split("_").map(function (mot) {
            return mot ? (mot.charAt(0).toUpperCase() + mot.slice(1)) : mot;
        }).join(" ");
    }
    function libelleType(type) { return LIBELLES_TYPES[type] || type; }
    function libelleDomaine(d) { return LIBELLES_DOMAINES[d] || d || "—"; }

    /**
     * Un garde-fou qui se vérifie dans les deux sens (`CONVENTIONS.md` §20.2) :
     * un type découvert dans le catalogue et absent d'ici s'afficherait sous
     * son nom technique — visible, sans danger — mais le signaler au journal
     * technique évite qu'il y reste par oubli plutôt que par choix.
     */
    function verifierVocabulaireTypes(catalogue) {
        if (!catalogue || !Array.isArray(catalogue.entites)) return;
        var inconnus = [];
        catalogue.entites.forEach(function (modele) {
            (modele.colonnes || []).forEach(function (colonne) {
                if (!Object.prototype.hasOwnProperty.call(LIBELLES_TYPES, colonne.type) &&
                    inconnus.indexOf(colonne.type) === -1) {
                    inconnus.push(colonne.type);
                }
            });
        });
        if (inconnus.length) {
            console.info("Import généralisé — types de colonne sans libellé local :", inconnus.join(", "));
        }
    }

    /* =====================================================================
       ÉTAT DU MODULE
    ===================================================================== */

    var catalogue = null;
    var enCours = false;
    /** Clé du dernier aperçu SANS erreur : { cle, entite } — voir `peutAppliquer`. */
    var dernierApercuValide = null;

    function esc(v) {
        if (window.escapeHtml) return window.escapeHtml(v == null ? "" : String(v));
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /* =====================================================================
       LECTURE DE L'ÉTAT DU DOM — jamais capturée à l'avance
    ===================================================================== */

    function valeurEntite() {
        var select = document.getElementById("impEntiteSelect");
        return select ? select.value : "";
    }
    function modeleDe(entite) {
        if (!catalogue || !entite) return null;
        var trouve = null;
        catalogue.entites.forEach(function (m) { if (m.entite === entite) trouve = m; });
        return trouve;
    }
    function ficheCourante() {
        var champ = document.getElementById("impFichier");
        return (champ && champ.files && champ.files[0]) || null;
    }
    function cleFichier(f) {
        return f ? (f.name + "|" + f.size + "|" + (f.lastModified || 0)) : null;
    }

    /* =====================================================================
       DROITS — courtoisie, jamais barrière (`js/core/session.js`)
       ---------------------------------------------------------------------
       Deux axes à combiner, et un seul ne suffit pas :
        · le domaine de la ROUTE (« administration », posé dans `js/app.js`,
          `DOMAINE_PAR_ROUTE["/imports"]`) — lu ici via `window.domaineDeRoute`,
          JAMAIS recopié en dur : une constante locale divergerait le jour où
          la route change de domaine sans que personne ne le voie ici ;
        · le domaine de L'ENTITÉ CHOISIE (`selon-entite` côté serveur) — c'est
          lui que `POST /api/import/:entite` vérifie réellement, et le
          mécanisme générique de `js/app.js` (`neutraliserEcritures`) ne le
          connaît pas : il ne voit que le domaine de la route.
       Les deux doivent être franchis pour proposer un geste qui aboutira.
    ===================================================================== */

    function domaineRoute() {
        return (typeof window.domaineDeRoute === "function") ? window.domaineDeRoute("/imports") : "administration";
    }
    function autoriseLecture(domaineEntite) {
        if (typeof Droits === "undefined" || !Droits.connus()) return true;
        if (!Droits.peutLire(domaineRoute())) return false;
        if (domaineEntite && !Droits.peutLire(domaineEntite)) return false;
        return true;
    }
    function autoriseEcriture(domaineEntite) {
        if (typeof Droits === "undefined" || !Droits.connus()) return true;
        if (!Droits.peutEcrire(domaineRoute())) return false;
        if (domaineEntite && !Droits.peutEcrire(domaineEntite)) return false;
        return true;
    }

    /* =====================================================================
       RENDU — le conteneur racine n'est réécrit qu'UNE FOIS par visite
       ---------------------------------------------------------------------
       Après le rendu initial, seuls des sous-conteneurs (#impColonnes,
       #impRapport) et des attributs (`disabled`, texte de #impEtatBoutons)
       sont modifiés. Une réécriture complète de `#app` viderait le
       `<input type="file">` — un navigateur ne conserve jamais la sélection
       d'un champ fichier reconstruit, même identique — ce qui casserait
       exactement le geste « aperçu puis appliquer sans reprendre le fichier »
       que cet écran existe pour offrir.
    ===================================================================== */

    function renderList() {
        var app = document.getElementById("app");
        if (!app) return;
        catalogue = null;
        dernierApercuValide = null;
        enCours = false;
        app.innerHTML = '<div class="dashboard-card"><h2>Import généralisé</h2>' +
            '<p class="chart-empty">Lecture du catalogue des modèles d’import…</p></div>';
        chargerCatalogue();
    }

    function chargerCatalogue() {
        ImportsReseau.obtenirCatalogue().then(function (charge) {
            catalogue = charge;
            verifierVocabulaireTypes(catalogue);
            dessinerEcran();
        }).catch(function (e) {
            dessinerErreurCatalogue(e);
        });
    }

    function dessinerErreurCatalogue(e) {
        var app = document.getElementById("app");
        if (!app) return;
        var message = (e && e.message) ? e.message : "Erreur inconnue.";
        app.innerHTML = '<div class="dashboard-card"><h2>Import généralisé</h2>' +
            '<div class="imp-erreur-bandeau" role="alert"><strong>Le catalogue des modèles ' +
            'd’import n’a pas pu être lu.</strong><br>' + esc(message) + '</div>' +
            '<button type="button" id="impReessayerBtn" data-lecture="ok" class="btn-secondary">' +
            'Réessayer</button></div>';
        var bouton = document.getElementById("impReessayerBtn");
        if (bouton) bouton.addEventListener("click", renderList);
        if (window.appliquerDroits) {
            try { window.appliquerDroits(location.hash.replace(/^#/, "")); } catch (err) { /* filet d'affichage */ }
        }
    }

    function dessinerEcran() {
        var app = document.getElementById("app");
        if (!app) return;

        app.innerHTML =
            '<div class="dashboard-card">' +
            '<h2>Import généralisé ' +
            (typeof Help !== "undefined" ? Help.tip(
                "Charge en une fois un fichier tableur (classeur ou texte) dans une entité du " +
                "logiciel — utile pour intégrer d'un coup les incidents, actifs ou prestataires " +
                "d'une société qui vient d'être rachetée, sans tout ressaisir à la main. Chaque " +
                "entité a son propre modèle de colonnes, téléchargeable ci-dessous.") : "") +
            '</h2>' +

            '<ul class="imp-proprietes">' +
            '<li><strong>Tout ou rien</strong> : un fichier est importé entièrement, ou pas du ' +
            'tout — aucune ligne ne reste à moitié écrite.</li>' +
            '<li><strong>Idempotent par le fichier</strong>' +
            (typeof Help !== "undefined" ? Help.tip(
                "« Idempotent » : renvoyer exactement le même fichier ne crée rien de plus, et " +
                "l'écran le signale. Un fichier modifié d'un seul octet est traité comme un " +
                "nouveau fichier.") : "") +
            ' : réenvoyer le même fichier ne crée rien, et l’écran le dit.</li>' +
            '<li><strong>L’import CRÉE</strong> ; il ne met jamais à jour et ne supprime jamais ' +
            'les enregistrements existants. Pour remplacer un jeu de données entier, utilisez la ' +
            'reprise d’un export grc-backup (écran Paramètres).</li>' +
            '</ul>' +

            '<div class="dashboard-card imp-bloc-entite">' +
            '<label for="impEntiteSelect"><strong>Entité à importer</strong></label><br>' +
            '<select id="impEntiteSelect" class="imp-select-entite">' + optionsEntites() + '</select>' +
            '<div id="impColonnes"></div>' +
            '</div>' +

            '<div class="dashboard-card imp-bloc-fichier">' +
            '<label for="impFichier"><strong>Fichier à importer</strong></label><br>' +
            '<div class="imp-depot">' +
            '<input type="file" id="impFichier" aria-label="Fichier à importer" accept=".xlsx,.xls,.csv">' +
            '<button type="button" id="impApercuBtn">Analyser (aperçu)</button>' +
            '<button type="button" id="impAppliquerBtn" disabled>Appliquer cet import</button>' +
            '</div>' +
            '<div id="impEtatBoutons" class="imp-etat"></div>' +
            '</div>' +

            '<div id="impRapport"></div>' +
            '</div>';

        brancher();
        rafraichirColonnes();
        mettreAJourBoutons();
        if (window.appliquerDroits) {
            try { window.appliquerDroits(location.hash.replace(/^#/, "")); } catch (err) { /* filet d'affichage */ }
        }
    }

    function optionsEntites() {
        var entites = (catalogue && catalogue.entites) ? catalogue.entites.slice() : [];
        entites.sort(function (a, b) { return libelleEntite(a.entite).localeCompare(libelleEntite(b.entite), "fr"); });
        var options = '<option value="">— Choisir une entité —</option>';
        options += entites.map(function (m) {
            return '<option value="' + esc(m.entite) + '">' + esc(libelleEntite(m.entite)) +
                ' (' + esc(libelleDomaine(m.domaine)) + ')</option>';
        }).join('');
        return options;
    }

    function colonnesHtml(modele) {
        if (!modele) {
            return '<p class="chart-empty">Choisissez une entité pour voir les colonnes attendues.</p>';
        }
        var lignes = (modele.colonnes || []).map(function (c) {
            return '<tr><td>' + esc(c.libelle) + '</td><td class="imp-mono">' + esc(c.champ) + '</td>' +
                '<td>' + esc(libelleType(c.type)) + '</td>' +
                '<td>' + (c.obligatoire ? 'Oui' : 'Non') + '</td></tr>';
        }).join('');
        var html = '<details open class="imp-details">' +
            '<summary>Colonnes attendues du fichier (' + esc((modele.colonnes || []).length) + ')</summary>' +
            '<div class="imp-table-scroll"><table class="data-table imp-colonnes-table"><thead><tr>' +
            '<th>Colonne (en-tête attendu)</th><th>Nom technique</th><th>Type</th><th>Obligatoire</th>' +
            '</tr></thead><tbody>' + lignes + '</tbody></table></div>' +
            '</details>';
        if (modele.liaisonsExclues && modele.liaisonsExclues.length) {
            html += '<p class="imp-note">Non repris par cet import : ' +
                esc(modele.liaisonsExclues.join(', ')) + ' — ces liens se saisissent dans l’application.</p>';
        }
        html += '<div class="imp-gabarit-actions">' +
            '<button type="button" id="impGabaritClasseurBtn" data-lecture="ok" class="btn-secondary">' +
            'Télécharger le modèle (classeur .xlsx)</button>' +
            '<button type="button" id="impGabaritTexteBtn" data-lecture="ok" class="btn-secondary">' +
            'Télécharger le modèle (texte .csv)</button>' +
            '</div>';
        return html;
    }

    function rafraichirColonnes() {
        var hote = document.getElementById("impColonnes");
        if (!hote) return;
        var modele = modeleDe(valeurEntite());
        hote.innerHTML = colonnesHtml(modele);
        var btnX = document.getElementById("impGabaritClasseurBtn");
        var btnC = document.getElementById("impGabaritTexteBtn");
        if (btnX) btnX.addEventListener("click", function () { telechargerGabarit(valeurEntite(), "xlsx"); });
        if (btnC) btnC.addEventListener("click", function () { telechargerGabarit(valeurEntite(), "csv"); });
        var domaineEntite = modele ? modele.domaine : "";
        var lisible = autoriseLecture(domaineEntite);
        [btnX, btnC].forEach(function (b) {
            if (!b) return;
            b.disabled = !modele || !lisible;
            b.title = lisible ? "" : "Votre profil n’a pas le droit de lire le domaine « " +
                libelleDomaine(domaineEntite) + " ».";
        });
    }

    /** Un aperçu SANS erreur reste valable tant que le fichier ET l'entité n'ont pas changé. */
    function peutAppliquer(entite, fichier) {
        if (!dernierApercuValide || !fichier || !entite) return false;
        return dernierApercuValide.entite === entite && dernierApercuValide.cle === cleFichier(fichier);
    }

    function mettreAJourBoutons() {
        var entite = valeurEntite();
        var modele = modeleDe(entite);
        var fichier = ficheCourante();
        var boutonApercu = document.getElementById("impApercuBtn");
        var boutonAppliquer = document.getElementById("impAppliquerBtn");
        var etat = document.getElementById("impEtatBoutons");
        if (!boutonApercu || !boutonAppliquer || !etat) return;

        var domaineEntite = modele ? modele.domaine : "";
        var autorise = autoriseEcriture(domaineEntite);
        var validite = peutAppliquer(entite, fichier);

        boutonApercu.disabled = enCours || !entite || !fichier || !autorise;
        boutonAppliquer.disabled = enCours || !validite || !autorise;

        var message = "";
        var classe = "";
        if (enCours) {
            message = "Analyse en cours…";
        } else if (!entite) {
            message = "Choisissez d’abord l’entité à importer.";
        } else if (!autorise) {
            message = "Votre profil n’a pas le droit d’importer dans le domaine « " +
                libelleDomaine(domaineEntite) + " ».";
            classe = "imp-etat-refus";
        } else if (!fichier) {
            message = "Choisissez un fichier, puis analysez-le (aperçu) avant de l’appliquer.";
        } else if (validite) {
            message = "Aperçu validé pour ce fichier : vous pouvez l’appliquer.";
            classe = "imp-etat-pret";
        } else {
            message = "Analysez ce fichier (aperçu) avant de pouvoir l’appliquer.";
        }
        etat.textContent = message;
        etat.className = "imp-etat" + (classe ? " " + classe : "");
    }

    /* =====================================================================
       RAPPORT — lecture ligne à ligne, comptes bornés ET totaux affichés
    ===================================================================== */

    function ligneErreurHtml(e) {
        var valeur = (e && e.valeur !== null && e.valeur !== undefined && e.valeur !== "")
            ? esc(e.valeur) : '<span class="imp-vide">—</span>';
        var colonne = (e && e.colonne) ? esc(e.colonne) : '<span class="imp-vide">—</span>';
        return '<tr><td class="imp-mono">' + esc(e && e.ligne) + '</td><td>' + colonne + '</td>' +
            '<td class="imp-valeur">' + valeur + '</td><td>' + esc(e && e.message) + '</td></tr>';
    }

    function rapportHtml(rapport) {
        var erreurs = Array.isArray(rapport.erreurs) ? rapport.erreurs : [];
        var totalErreurs = (typeof rapport.enErreur === "number") ? rapport.enErreur : erreurs.length;
        var refuse = totalErreurs > 0;

        var titre = "Aperçu";
        var classeTitre = "imp-etat-apercu";
        if (rapport.dejaImporte) { titre = "Fichier déjà importé"; classeTitre = "imp-etat-info"; }
        else if (refuse) { titre = "Import refusé"; classeTitre = "imp-etat-refus"; }
        else if (rapport.applique) { titre = "Import appliqué"; classeTitre = "imp-etat-pret"; }
        else if (rapport.apercu) { titre = "Aperçu — rien n’a été enregistré"; classeTitre = "imp-etat-apercu"; }

        var role = (refuse || (!rapport.applique && !rapport.apercu && !rapport.dejaImporte)) ? "alert" : "status";

        var labelCreees = rapport.applique ? "Créées" : "Seraient créées";

        var html = '<div class="imp-rapport' + (refuse ? " imp-rapport-refus" : "") + '" role="' + role + '">' +
            '<h3 class="' + classeTitre + '">' + esc(titre) + '</h3>' +
            '<p>' + esc(rapport.message || "") + '</p>' +
            '<div class="imp-resume">' +
            '<span>Lues : <strong>' + esc(rapport.lues) + '</strong></span>' +
            '<span>' + esc(labelCreees) + ' : <strong>' + esc(rapport.creees) + '</strong></span>' +
            '<span>Mises à jour : <strong>' + esc(rapport.misesAJour != null ? rapport.misesAJour : 0) +
            '</strong>' +
            (typeof Help !== "undefined" ? Help.tip(
                "L'import CRÉE uniquement : cette valeur reste toujours à zéro. Pour remplacer un " +
                "jeu de données existant, utilisez la reprise d'un export grc-backup (écran " +
                "Paramètres).") : "") + '</span>' +
            '<span>Ignorées (lignes vides) : <strong>' + esc(rapport.ignorees) + '</strong></span>' +
            '<span>En erreur : <strong>' + esc(totalErreurs) + '</strong></span>' +
            '</div>';

        if (Array.isArray(rapport.colonnesInconnues) && rapport.colonnesInconnues.length) {
            html += '<p class="imp-note">Colonnes du fichier sans correspondance (ignorées) : ' +
                esc(rapport.colonnesInconnues.join(', ')) + '.</p>';
        }
        if (Array.isArray(rapport.liaisonsExclues) && rapport.liaisonsExclues.length) {
            html += '<p class="imp-note">Non repris par cet import : ' +
                esc(rapport.liaisonsExclues.join(', ')) + ' — ces liens se saisissent dans l’application.</p>';
        }

        if (erreurs.length) {
            html += '<div class="imp-table-scroll"><table class="data-table imp-erreurs-table"><thead><tr>' +
                '<th>Ligne</th><th>Colonne</th><th>Valeur</th><th>Message</th>' +
                '</tr></thead><tbody>' + erreurs.map(ligneErreurHtml).join('') + '</tbody></table></div>';
            if (totalErreurs > erreurs.length) {
                html += '<p class="imp-note">' + esc(erreurs.length) + ' erreur(s) affichée(s) sur ' +
                    esc(totalErreurs) + ' au total.</p>';
            }
        }
        html += '</div>';
        return html;
    }

    function afficherRapport(rapport) {
        var hote = document.getElementById("impRapport");
        if (!hote) return;
        hote.innerHTML = rapportHtml(rapport);
    }

    function afficherErreurEnvoi(e) {
        var hote = document.getElementById("impRapport");
        if (!hote) return;
        var message = (e && e.message) ? e.message : "Erreur inconnue.";
        hote.innerHTML = '<div class="imp-erreur-bandeau" role="alert"><strong>L’envoi n’a pas abouti : ' +
            'rien n’a été importé.</strong><br>' + esc(message) + '</div>';
    }

    /* =====================================================================
       ACTIONS
    ===================================================================== */

    /**
     * Télécharge le modèle vierge d'une entité — une NAVIGATION, jamais un
     * `fetch` + Blob (voir l'entête : ce n'est pas un export).
     */
    function telechargerGabarit(entite, format) {
        if (!entite) {
            if (window.showToast) window.showToast("Choisissez d’abord une entité.", "info");
            return;
        }
        var a = document.createElement("a");
        a.href = ImportsReseau.urlGabarit(entite, format);
        // PAS de `.download` : le nom vient du serveur (`Content-Disposition`),
        // et poser cet attribut ferait « compter » ce fichier pour le filet
        // mécanique de `entonnoir-export.test.mjs` alors que ce n'est pas un
        // export (voir l'entête).
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function lancerImport(appliquer) {
        var entite = valeurEntite();
        var fichier = ficheCourante();
        if (!entite || !fichier || enCours) return;

        enCours = true;
        mettreAJourBoutons();
        var hote = document.getElementById("impRapport");
        if (hote) {
            hote.innerHTML = '<p class="chart-empty">' +
                (appliquer ? "Application de l’import en cours…" : "Analyse du fichier en cours…") + '</p>';
        }

        ImportsReseau.envoyerImport(entite, fichier, appliquer).then(function (rapport) {
            enCours = false;
            var totalErreurs = (typeof rapport.enErreur === "number") ? rapport.enErreur
                : (Array.isArray(rapport.erreurs) ? rapport.erreurs.length : 0);
            if (rapport.apercu && !rapport.applique && !rapport.dejaImporte && totalErreurs === 0) {
                dernierApercuValide = { entite: entite, cle: cleFichier(fichier) };
            } else if (!appliquer) {
                // Un aperçu en erreur ou déjà importé invalide un éventuel
                // aperçu précédent : rien à appliquer tant que ce n'est pas
                // corrigé (ou un autre fichier choisi).
                dernierApercuValide = null;
            }
            afficherRapport(rapport);
            mettreAJourBoutons();
            if (window.showToast) {
                if (rapport.applique) window.showToast(rapport.message, "success");
                else if (rapport.dejaImporte) window.showToast(rapport.message, "info");
                else if (totalErreurs > 0) window.showToast(rapport.message, "error");
            }
        }).catch(function (e) {
            enCours = false;
            dernierApercuValide = null;
            afficherErreurEnvoi(e);
            mettreAJourBoutons();
            if (window.showToast) window.showToast((e && e.message) || "Erreur inconnue.", "error");
        });
    }

    /* =====================================================================
       BRANCHEMENT — aucun gestionnaire en ligne (CSP du vhost)
    ===================================================================== */

    function brancher() {
        var select = document.getElementById("impEntiteSelect");
        var champFichier = document.getElementById("impFichier");
        var boutonApercu = document.getElementById("impApercuBtn");
        var boutonAppliquer = document.getElementById("impAppliquerBtn");

        if (select) select.addEventListener("change", function () {
            dernierApercuValide = null;
            var hote = document.getElementById("impRapport");
            if (hote) hote.innerHTML = "";
            rafraichirColonnes();
            mettreAJourBoutons();
        });
        if (champFichier) champFichier.addEventListener("change", function () {
            dernierApercuValide = null;
            var hote = document.getElementById("impRapport");
            if (hote) hote.innerHTML = "";
            mettreAJourBoutons();
        });
        if (boutonApercu) boutonApercu.addEventListener("click", function () { lancerImport(false); });
        if (boutonAppliquer) boutonAppliquer.addEventListener("click", function () { lancerImport(true); });
    }

    return {
        renderList: renderList,
        // Exposés pour le banc d'essai : le même principe qu'à `pieces.js` —
        // une garde se vérifie en appelant la fonction, pas en lisant l'écran.
        peutAppliquer: peutAppliquer,
        libelleEntite: libelleEntite,
        libelleType: libelleType
    };
})();

window.ImportsModule = ImportsModule;
