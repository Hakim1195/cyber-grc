// Emplacement : js/modules/journal.js
// Nom du fichier : journal.js
//
// Module « Journal d'audit » — la CONSULTATION du journal inaltérable (lot L5).
//
// ── La question à laquelle cet écran répond ─────────────────────────────────
//
//   `PLAN_SERVEUR` §1.7 : « l'outil servant à justifier officiellement la
//   gouvernance du groupe, un auditeur posera la question : *le RSSI peut-il
//   modifier le journal ?* Si la réponse est oui, le journal ne prouve rien. »
//
// La table est en ajout seul et chaînée par empreinte — c'est éprouvé côté base.
// Ce que cet écran apporte, c'est la moitié qui manquait : **de quoi le montrer
// à quelqu'un**. Le bouton « Vérifier le chaînage » interroge
// `f_journal_audit_verifier()` par le serveur, et **aucune ligne rendue = journal
// sain** (`CONVENTIONS.md` §29.8). Un auditeur n'a pas à croire la promesse : il
// la déclenche devant vous.
//
// ── Les trois routes, et d'où vient leur contrat ────────────────────────────
//
// **`backend/db/CONVENTIONS.md` §29.8 fait foi.** Rien n'est supposé ici :
//
//   | Route                        | Accès                              |
//   |------------------------------|------------------------------------|
//   | `GET api/journal`            | `{ lire, domaine: 'journal' }`     |
//   | `GET api/journal/verification`| `{ lire, domaine: 'journal' }`    |
//   | `GET api/journal/export`     | `{ exporter, domaine: 'journal' }` |
//
// ⚠️ **La pagination se fait sur `numero`, jamais sur un décalage.** `numero` est
// strictement croissant et sans trou (§12) : c'est un curseur exact. Un `offset`
// sur un journal qui grandit pendant qu'on le feuillette **saute des lignes** —
// et sauter une ligne dans une preuve d'audit est exactement ce qu'il ne faut
// pas faire. Cet écran n'émet donc jamais de décalage : il envoie `avant=<n>`,
// et rien d'autre ne détermine la page suivante.
//
// ── Ce que le §29.8 NE fige PAS, et que ce fichier a dû choisir ─────────────
//
// Le contrat fige les **chemins**, les **déclarations d'accès** et le **nom des
// cinq filtres** (`depuis`, `jusqu_a`, `action`, `utilisateur`, `entite_type`).
// ⚠️ **Ce paragraphe a été réécrit le 04/09/2026, et l'écart valait d'être noté.**
//
// Il disait deux choses vraies à l'heure où il a été écrit, et fausses depuis :
//
//   1. *« le §29.8 ne fige ni le nom du curseur ni la forme de l'enveloppe »* —
//      il les fige désormais : `avant` / `limite`, et `{ entrees, suivant, limite }`.
//      L'orchestrateur a complété le contrat **en vol**, précisément parce que
//      cet écran l'avait signalé : le serveur rendait `{ pagination: { suivant } }`
//      et cet écran lisait `corps.suivant`. Un écran qui reçoit `undefined`
//      **cesse de feuilleter et affiche une page en croyant les avoir toutes** —
//      rien ne casse, il manque seulement des lignes dans un registre qui sert
//      de preuve en audit. La lecture tolérante de `normaliserPage()` est
//      conservée : elle n'a plus à réconcilier deux moitiés, mais elle protège
//      encore contre le silence, qui est la pire des réponses ici.
//
//   2. *« le réseau : une exception assumée, bornée à `demander()` »* — l'exception
//      est **levée**. Ce fichier ne touche plus `fetch` : il appelle
//      `Api.journal()`, `Api.journalVerification()` et `Api.journalExport()`.
//      Le motif de l'exception était réel — `js/core/api.js` n'appartenait pas au
//      périmètre d'écriture de l'agent qui a écrit cet écran — et la façon dont
//      elle a été traitée est celle qu'on veut : **écrite, bornée, avec le geste
//      exact pour la lever**, plutôt que tue. Le geste a été fait.
//
// ── Ce qui s'affiche vient d'utilisateurs, et de gens qui n'en sont pas ─────
//
// Cet écran affiche des logins, des adresses IP et des valeurs métier écrites
// par des tiers — dont, par construction, des tentatives de connexion échouées
// avec l'identifiant que l'attaquant a choisi. **L'auditeur de la porte S3 a
// forgé un login contenant du JSON et des sauts de ligne, et il est arrivé
// littéralement dans le journal** (`CONVENTIONS.md` §29.5). Tout ce que ce
// fichier injecte dans le DOM passe donc par `escapeHtml`, sans exception : le
// journal d'audit est le dernier endroit du produit où l'on peut se permettre
// une injection, puisque c'est celui qu'on ouvre quand quelque chose a mal
// tourné.

const JournalModule = (() => {

    /* =====================================================================
       CONTRAT HTTP — les noms qui viennent du §29.8, et ceux qui n'en viennent pas
    ===================================================================== */

    /** Chemins figés par `CONVENTIONS.md` §29.8. */
    const CHEMIN_LISTE = "api/journal";
    const CHEMIN_VERIFICATION = "api/journal/verification";
    const CHEMIN_EXPORT = "api/journal/export";

    /**
     * Noms des cinq filtres — figés par le §29.8, à recopier nulle part ailleurs.
     */
    const FILTRES = Object.freeze(["depuis", "jusqu_a", "action", "utilisateur", "entite_type"]);

    /**
     * ⚠️ **Le §29.8 ne nomme pas le curseur.** Il fige la *propriété* — « la
     * pagination se fait sur `numero`, jamais sur un décalage » — et laisse le
     * nom du paramètre à l'implémentation. `avant` dit ce qu'il fait : rendre
     * les entrées dont le `numero` est **strictement inférieur**, l'ordre étant
     * décroissant.
     *
     * Si le serveur retient un autre nom, c'est **cette constante** qu'on
     * change, et elle seule.
     */
    const CURSEUR = "avant";
    const TAILLE_PAGE_PARAM = "limite";
    const TAILLE_PAGE = 50;

    /** Délai de garde d'une requête, aligné sur `Api` (30 s). */
    const DELAI_MS = 30000;

    /* =====================================================================
       VOCABULAIRE DES ACTIONS
    ===================================================================== */

    /**
     * Libellés français des vingt actions de `ck_journal_audit_action`.
     *
     * ── Une liste écrite à la main, et ce qui arrive quand elle est incomplète ──
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Ici, une action
     * absente de cette table **s'affiche telle qu'elle est en base**, en clair et
     * échappée (voir `libelleAction`) : rien ne réussit en silence, rien ne
     * disparaît, et la ligne reste lisible. Le pire cas est un libellé technique
     * sous les yeux d'un auditeur — visible, donc corrigeable.
     *
     * C'est aussi pourquoi le filtre « Action » **n'est pas** construit sur cette
     * seule table : il y ajoute les actions réellement présentes dans la page
     * chargée (`optionsAction`). Une action neuve reste donc filtrable le jour
     * où elle apparaît, sans que ce fichier bouge.
     */
    const ACTIONS = Object.freeze({
        connexion_reussie:     "Connexion réussie",
        connexion_echouee:     "Connexion refusée",
        deconnexion:           "Déconnexion",
        session_expiree:       "Session expirée",
        session_revoquee:      "Session révoquée",
        refus_autorisation:    "Refus de droit",
        creation:              "Création",
        modification:          "Modification",
        suppression:           "Suppression",
        consultation_sensible: "Consultation sensible",
        export:                "Export",
        import:                "Import",
        administration:        "Administration",
        approbation:           "Approbation",
        analyse_antivirus:     "Analyse antivirus",
        purge:                 "Purge",
        archivage:             "Archivage",
        demarrage:             "Démarrage du service",
        arret:                 "Arrêt du service",
        verification_journal:  "Vérification du journal"
    });

    /** Familles d'actions → teinte sémantique (statuts stricts du design system). */
    const TEINTES = Object.freeze({
        connexion_echouee:  "status-non-conforme",
        refus_autorisation: "status-non-conforme",
        session_revoquee:   "status-non-conforme",
        suppression:        "status-non-conforme",
        export:             "status-partiellement-conforme",
        import:             "status-partiellement-conforme",
        administration:     "status-partiellement-conforme",
        purge:              "status-partiellement-conforme",
        archivage:          "status-partiellement-conforme",
        connexion_reussie:  "status-conforme",
        creation:           "status-conforme",
        modification:       "status-conforme",
        approbation:        "status-conforme"
    });

    /* =====================================================================
       ÉTAT DE L'ÉCRAN
    ===================================================================== */

    // Filtres saisis, conservés entre deux rafraîchissements de la vue.
    const filtres = { depuis: "", jusqu_a: "", action: "", utilisateur: "", entite_type: "" };

    // Pagination : `curseur` est le `numero` avant lequel on lit ; `pile` retient
    // les curseurs des pages déjà vues pour permettre le retour en arrière.
    let curseur = null;
    let pile = [];

    let entrees = [];          // page courante, normalisée
    let pageSuivante = null;   // curseur de la page plus ancienne, ou null
    let chargement = false;
    let erreurChargement = null;
    let verification = null;   // { sain, anomalies[], erreur } — null tant qu'on n'a pas vérifié

    /* =====================================================================
       ACCÈS RÉSEAU — voir l'entête : exception assumée, bornée à cette fonction
    ===================================================================== */

    /**
     * Interroge le serveur et rend la charge analysée.
     *
     * Mêmes garanties que `Api.appeler` (entête du fichier). Lève une
     * `Api.ErreurApi` : le produit n'a qu'un seul type d'erreur réseau, et les
     * appelants d'ici s'en servent comme partout ailleurs.
     *
     * @param {string} chemin chemin RELATIF (`api/…`) — jamais une URL absolue
     * @param {"json"|"blob"} attendu forme de la réponse voulue
     */
    /**
     * Filtres saisis + pagination, sous la forme que `Api` attend (les vides sont omis).
     *
     * ⚠️ **Ce module ne touche plus `fetch`.** Il portait une fonction
     * `demander()`, aux mêmes garanties que celles d'`api.js` — `same-origin`,
     * `no-store`, `redirect: error`, délai de garde, `Api.ErreurApi` —, écrite
     * parce que son auteur ne possédait pas `js/core/api.js`. C'était une
     * seconde porte sur le réseau, et l'entête d'`api.js` dit depuis le lot L2
     * qu'il n'y en a qu'une.
     *
     * Le jour où l'expiration de session, le traitement des `401` ou la
     * détection d'issue inconnue changent dans `api.js`, une seconde rédaction
     * ne suit pas — et rien ne le signale. `Api.journal`,
     * `Api.journalVerification` et `Api.journalExport` sont donc les trois
     * points d'entrée, et l'encodage de la requête leur appartient.
     */
    function filtresPourApi(extra) {
        const sortie = {};
        FILTRES.forEach(nom => {
            const valeur = String(filtres[nom] || "").trim();
            if (valeur !== "") sortie[nom] = valeur;
        });
        if (extra) {
            Object.keys(extra).forEach(cle => {
                if (extra[cle] === null || extra[cle] === undefined || extra[cle] === "") return;
                sortie[cle] = String(extra[cle]);
            });
        }
        return sortie;
    }

    /* =====================================================================
       LECTURE TOLÉRANTE DES RÉPONSES
    ===================================================================== */

    /**
     * Ramène la réponse de `GET api/journal` à `{ entrees, suivant }`.
     *
     * ⚠️ **Tolérante à dessein, et ce n'est pas de la complaisance.** Le §29.8
     * fige les chemins et les filtres, pas la forme de l'enveloppe ; l'agent qui
     * écrit la route et celui qui écrit cet écran travaillent en parallèle.
     * Refuser tout sauf une forme choisie ici transformerait un désaccord de nom
     * en écran vide — c'est-à-dire en « il n'y a rien dans le journal », le pire
     * mensonge que cet écran puisse dire.
     *
     * `suivant` est **recalculé** à partir du plus petit `numero` de la page
     * quand le serveur ne le donne pas : c'est le curseur exact du §29.8, et il
     * se déduit des données — il n'a pas à être cru sur parole.
     */
    function normaliserPage(charge) {
        let brutes = [];
        if (Array.isArray(charge)) brutes = charge;
        else if (charge && typeof charge === "object") {
            const candidat = ["entrees", "entries", "lignes", "resultats", "donnees", "items"]
                .map(c => charge[c]).find(Array.isArray);
            if (candidat) brutes = candidat;
        }
        const liste = brutes.map(normaliserEntree).filter(e => e !== null);

        // Curseur de la page suivante : celui que le serveur annonce, sinon le
        // plus petit numéro vu. Une page pleine suppose qu'il y a une suite ;
        // une page incomplète est la dernière.
        let suivant = null;
        if (charge && typeof charge === "object") {
            const annonce = charge.suivant ?? charge.curseur_suivant ?? charge.prochain ?? null;
            if (typeof annonce === "number" || (typeof annonce === "string" && annonce !== "")) {
                suivant = Number(annonce);
            }
        }
        if (suivant === null && liste.length >= TAILLE_PAGE) {
            const numeros = liste.map(e => e.numero).filter(n => typeof n === "number");
            if (numeros.length) suivant = Math.min.apply(null, numeros);
        }
        return { entrees: liste, suivant: suivant };
    }

    /** Une entrée, réduite à ce que cet écran sait montrer. */
    function normaliserEntree(brut) {
        if (!brut || typeof brut !== "object") return null;
        const nombre = (v) => (typeof v === "number" ? v : (typeof v === "string" && v !== "" && !isNaN(Number(v)) ? Number(v) : null));
        return {
            numero: nombre(brut.numero),
            id: brut.id || "",
            horodatage: brut.horodatage || brut.date || "",
            filiale: brut.filiale_code || brut.filiale_id || "",
            utilisateur: brut.utilisateur_libelle || brut.utilisateur || "",
            adresseIp: brut.adresse_ip || "",
            action: brut.action || "",
            entiteType: brut.entite_type || "",
            entiteId: brut.entite_id || "",
            resume: brut.resume || "",
            valeursAvant: brut.valeurs_avant ?? null,
            valeursApres: brut.valeurs_apres ?? null,
            empreinte: brut.empreinte || "",
            empreintePrecedente: brut.empreinte_precedente || "",
            sessionId: brut.session_id || "",
            versionApplication: brut.version_application || ""
        };
    }

    /**
     * Ramène la réponse de la vérification à `{ sain, anomalies }`.
     *
     * **Aucune ligne rendue = journal sain** (§29.8) : la règle est celle de
     * `f_journal_audit_verifier()`, et elle est reprise telle quelle. Une
     * enveloppe vide, un tableau vide et une absence de champ disent donc tous la
     * même chose — et c'est vrai, parce que c'est la fonction de base qui le dit.
     */
    function normaliserVerification(charge) {
        let brutes = [];
        if (Array.isArray(charge)) brutes = charge;
        else if (charge && typeof charge === "object") {
            const candidat = ["anomalies", "lignes", "resultats", "entrees", "items"]
                .map(c => charge[c]).find(Array.isArray);
            if (candidat) brutes = candidat;
        }
        const anomalies = brutes.map(a => ({
            numero: a.numero_entree ?? a.numero ?? "",
            id: a.id_entree ?? a.id ?? "",
            horodatage: a.horodatage_entree ?? a.horodatage ?? "",
            anomalie: a.anomalie ?? "",
            detail: a.detail ?? ""
        }));
        return { sain: anomalies.length === 0, anomalies: anomalies };
    }

    /* =====================================================================
       AFFICHAGE — tout passe par escapeHtml, sans exception
    ===================================================================== */

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /** Libellé d'une action — le code brut quand il n'est pas connu (voir `ACTIONS`). */
    function libelleAction(code) {
        return ACTIONS[code] || code || "—";
    }

    function badgeAction(code) {
        const teinte = TEINTES[code] || "status-non-applicable";
        return '<span class="status ' + teinte + '">' + esc(libelleAction(code)) + "</span>";
    }

    function fmtHorodatage(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return esc(iso);
        return d.toLocaleString("fr-FR");
    }

    /** Rend un bloc JSON lisible, échappé, ou une trace vide. */
    function bloc(titre, valeur) {
        if (valeur === null || valeur === undefined) return "";
        let texte;
        try { texte = JSON.stringify(valeur, null, 2); } catch (e) { texte = String(valeur); }
        if (texte === undefined) texte = String(valeur);
        return '<div class="jrn-bloc"><h4>' + esc(titre) + "</h4><pre>" + esc(texte) + "</pre></div>";
    }

    /**
     * Options du filtre « Action ».
     *
     * Union du vocabulaire connu et de ce que la page chargée contient
     * réellement : une action neuve reste filtrable le jour où elle apparaît.
     */
    function optionsAction() {
        const codes = Object.keys(ACTIONS);
        entrees.forEach(e => { if (e.action && codes.indexOf(e.action) === -1) codes.push(e.action); });
        return '<option value="">Toutes les actions</option>' + codes.map(c =>
            '<option value="' + esc(c) + '"' + (filtres.action === c ? " selected" : "") + ">" +
            esc(libelleAction(c)) + "</option>").join("");
    }

    function ligneHtml(e) {
        const entite = e.entiteType
            ? esc(e.entiteType) + (e.entiteId ? ' <span class="jrn-mono">' + esc(e.entiteId) + "</span>" : "")
            : "—";
        // L'identifiant de la ligne vit dans un ATTRIBUT du balisage, jamais
        // capturé en chaîne dans une fermeture (`CLAUDE.md` §3) : le détail est
        // ouvert en relisant `dataset.numero` au moment du clic.
        return (
            '<tr class="jrn-ligne" data-numero="' + esc(e.numero === null ? "" : e.numero) + '" tabindex="0">' +
            '<td class="jrn-mono">' + esc(e.numero === null ? "—" : e.numero) + "</td>" +
            "<td>" + fmtHorodatage(e.horodatage) + "</td>" +
            "<td>" + badgeAction(e.action) + "</td>" +
            "<td>" + (e.utilisateur ? esc(e.utilisateur) : '<span class="jrn-vide">—</span>') + "</td>" +
            "<td>" + entite + "</td>" +
            "<td>" + (e.resume ? esc(e.resume) : '<span class="jrn-vide">—</span>') + "</td>" +
            '<td class="jrn-mono">' + (e.adresseIp ? esc(e.adresseIp) : "—") + "</td>" +
            "</tr>"
        );
    }

    function detailHtml(e) {
        return (
            '<tr class="jrn-detail" data-detail="' + esc(e.numero === null ? "" : e.numero) + '">' +
            '<td colspan="7">' +
            '<div class="jrn-detail-grille">' +
            '<div class="jrn-bloc"><h4>Identité de l\'entrée</h4><pre>' +
            esc(
                "identifiant   : " + (e.id || "—") + "\n" +
                "numéro        : " + (e.numero === null ? "—" : e.numero) + "\n" +
                "filiale       : " + (e.filiale || "— (entrée hors filiale)") + "\n" +
                "session       : " + (e.sessionId || "—") + "\n" +
                "version appli : " + (e.versionApplication || "—") + "\n" +
                "empreinte     : " + (e.empreinte || "—") + "\n" +
                "précédente    : " + (e.empreintePrecedente || "— (premier maillon)")
            ) +
            "</pre></div>" +
            bloc("Valeurs avant", e.valeursAvant) +
            bloc("Valeurs après", e.valeursApres) +
            "</div></td></tr>"
        );
    }

    function corpsHtml() {
        if (chargement) {
            return '<p class="chart-empty">Lecture du journal…</p>';
        }
        if (erreurChargement) {
            return '<div class="jrn-erreur" role="alert"><strong>Le journal n\'a pas pu être lu.</strong><br>' +
                esc(erreurChargement) + "</div>";
        }
        if (!entrees.length) {
            return '<p class="chart-empty">Aucune entrée ne correspond à ces critères.</p>';
        }
        return (
            '<table class="data-table jrn-table"><thead><tr>' +
            "<th>N°</th><th>Horodatage</th><th>Action</th><th>Utilisateur</th>" +
            "<th>Entité</th><th>Résumé</th><th>Adresse IP</th>" +
            "</tr></thead><tbody>" +
            entrees.map(ligneHtml).join("") +
            "</tbody></table>"
        );
    }

    function verificationHtml() {
        if (verification === null) return "";
        // Une vérification en vol n'est ni « sain » ni « rompu ». Sans cette
        // ligne, un redessin survenu pendant l'appel — un filtre réinitialisé,
        // par exemple — afficherait « Chaînage rompu — 0 anomalie(s) », ce qui
        // est la pire des trois phrases possibles et la seule qui soit fausse.
        if (verification.encours) {
            return '<div class="jrn-verdict" id="journalVerdict">Vérification du chaînage en cours…</div>';
        }
        if (verification.erreur) {
            return '<div class="jrn-verdict jrn-verdict--erreur" role="alert" id="journalVerdict">' +
                "<strong>La vérification n'a pas pu être menée.</strong> " + esc(verification.erreur) +
                "</div>";
        }
        if (verification.sain) {
            return '<div class="jrn-verdict jrn-verdict--sain" role="status" id="journalVerdict">' +
                "<strong>Chaînage intact.</strong> La vérification n'a relevé aucune anomalie : " +
                "aucune entrée n'a été modifiée, insérée ni supprimée depuis son écriture." +
                "</div>";
        }
        return (
            '<div class="jrn-verdict jrn-verdict--rompu" role="alert" id="journalVerdict">' +
            "<strong>Chaînage rompu — " + esc(verification.anomalies.length) + " anomalie(s).</strong> " +
            "Le journal ne peut plus servir de preuve en l'état. Prévenez votre exploitant." +
            '<table class="data-table jrn-anomalies"><thead><tr>' +
            "<th>N°</th><th>Entrée</th><th>Horodatage</th><th>Anomalie</th><th>Détail</th>" +
            "</tr></thead><tbody>" +
            verification.anomalies.map(a =>
                "<tr>" +
                '<td class="jrn-mono">' + esc(a.numero) + "</td>" +
                '<td class="jrn-mono">' + esc(a.id) + "</td>" +
                "<td>" + fmtHorodatage(a.horodatage) + "</td>" +
                '<td><span class="status status-non-conforme">' + esc(a.anomalie) + "</span></td>" +
                "<td>" + esc(a.detail) + "</td>" +
                "</tr>").join("") +
            "</tbody></table></div>"
        );
    }

    function pagerHtml() {
        const precedente = pile.length > 0;
        const suivante = pageSuivante !== null;
        return (
            '<div class="jrn-pager no-print">' +
            '<button type="button" id="journalPagePrecedente" class="btn-secondary" data-lecture="ok"' +
            (precedente ? "" : " disabled") + ">Entrées plus récentes</button>" +
            '<span class="jrn-pager-etat">' +
            (entrees.length ? esc(entrees.length) + " entrée(s) affichée(s)" : "") +
            (curseur === null ? " · les plus récentes" : " · avant le n° " + esc(curseur)) +
            "</span>" +
            '<button type="button" id="journalPageSuivante" class="btn-secondary" data-lecture="ok"' +
            (suivante ? "" : " disabled") + ">Entrées plus anciennes</button>" +
            "</div>"
        );
    }

    /* =====================================================================
       STYLES — portés par la vue (css/style.css appartient à un autre périmètre)
    ===================================================================== */

    function styles() {
        return "<style>" +
            ".jrn-filtres { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; margin:14px 0 8px; }" +
            ".jrn-filtres label { display:flex; flex-direction:column; gap:4px; font-size:0.8rem; color:var(--text-muted); }" +
            ".jrn-filtres input, .jrn-filtres select { padding:6px 10px; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.85rem; }" +
            ".jrn-table td { vertical-align:top; font-size:0.85rem; }" +
            // `.status` porte `text-transform: capitalize`, ce qui convient à des
            // statuts d'un ou deux mots (« conforme », « en retard ») et défigure
            // les libellés d'action de cette table : « Refus De Droit »,
            // « Vérification Du Journal ». Les COULEURS sémantiques du design
            // system sont conservées telles quelles — seule la capitalisation est
            // neutralisée, et seulement ici.
            ".jrn-table .status, .jrn-anomalies .status { text-transform:none; }" +
            ".jrn-ligne { cursor:pointer; }" +
            ".jrn-ligne:hover { background:var(--primary-tint, #eef3fb); }" +
            ".jrn-mono { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:0.8rem; }" +
            ".jrn-vide { color:var(--text-muted); }" +
            ".jrn-detail > td { background:#f8f9fa; }" +
            ".jrn-detail-grille { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }" +
            ".jrn-bloc h4 { margin:0 0 4px; font-size:0.78rem; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); }" +
            ".jrn-bloc pre { margin:0; padding:8px 10px; background:#fff; border:1px solid var(--border); border-radius:var(--radius-sm); font-size:0.78rem; white-space:pre-wrap; word-break:break-word; max-height:260px; overflow:auto; }" +
            ".jrn-verdict { margin:14px 0; padding:12px 14px; border-radius:var(--radius-sm); border-left:4px solid var(--text-muted); background:#f8f9fa; font-size:0.9rem; }" +
            ".jrn-verdict--sain { border-left-color:var(--color-success,#1e7e34); background:#d4edda; color:#155724; }" +
            ".jrn-verdict--rompu { border-left-color:var(--color-danger,#a5281b); background:#f8d7da; color:#721c24; }" +
            ".jrn-verdict--erreur { border-left-color:var(--color-warning,#e0a800); background:#fff3cd; color:#856404; }" +
            ".jrn-erreur { margin:14px 0; padding:12px 14px; border-radius:var(--radius-sm); background:#fff3cd; color:#856404; border-left:4px solid var(--color-warning,#e0a800); font-size:0.9rem; }" +
            ".jrn-pager { display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap; }" +
            ".jrn-pager-etat { color:var(--text-muted); font-size:0.82rem; }" +
            ".jrn-anomalies { margin-top:10px; background:#fff; }" +
            "</style>";
    }

    /* =====================================================================
       CHARGEMENT
    ===================================================================== */

    async function charger() {
        chargement = true;
        erreurChargement = null;
        rafraichirCorps();
        try {
            const extra = {};
            extra[TAILLE_PAGE_PARAM] = TAILLE_PAGE;
            if (curseur !== null) extra[CURSEUR] = curseur;
            const charge = await Api.journal(filtresPourApi(extra));
            const page = normaliserPage(charge);
            entrees = page.entrees;
            pageSuivante = page.suivant;
        } catch (e) {
            entrees = [];
            pageSuivante = null;
            erreurChargement = messageDErreur(e);
        } finally {
            chargement = false;
            rafraichirCorps();
        }
    }

    /**
     * Le FAIT, plus le geste que cette couche-ci connaît.
     *
     * `js/core/api.js` énonce ce qui s'est passé et ne prescrit aucun geste
     * (constats Q-19, Q-29, Q-57) — parce qu'il ignore ce que l'appelant tient
     * en mémoire. Cet écran, lui, le sait : il n'y a **aucune saisie à perdre**
     * ici, la consultation ne modifie rien. Il peut donc nommer le geste sans
     * risque, ce qui est exactement la règle : chaque couche ajoute le geste
     * qu'elle seule connaît.
     */
    function messageDErreur(e) {
        if (!e) return "Erreur inconnue.";
        if (e.estDroitInsuffisant && e.estDroitInsuffisant()) {
            return "Votre profil n'a pas accès au journal d'audit. Ce droit est distinct des " +
                "autres : lire trois ans d'identités n'est pas la même chose que régler " +
                "l'application. Demandez-le à votre exploitant.";
        }
        if (e.estNonAuthentifie && e.estNonAuthentifie()) {
            return "Votre session n'est plus ouverte sur le serveur. Reconnectez-vous : rien " +
                "n'est perdu, cet écran ne contient aucune saisie.";
        }
        return e.message || String(e);
    }

    async function verifier() {
        verification = { sain: false, anomalies: [], erreur: null, encours: true };
        rafraichirVerdict(verificationHtml());
        try {
            const charge = await Api.journalVerification();
            verification = normaliserVerification(charge);
            verification.erreur = null;
        } catch (e) {
            verification = { sain: false, anomalies: [], erreur: messageDErreur(e) };
        }
        rafraichirVerdict(verificationHtml());
    }

    /* =====================================================================
       EXPORT — il passe par l'entonnoir, et il n'a pas d'autre chemin
    ===================================================================== */

    /**
     * Extrait le journal filtré dans un fichier.
     *
     * ⚠️ **`Droits.exigerExport()` en première ligne, avant tout le reste.**
     * `PLAN_SERVEUR` §3.3 fait de l'export une permission à part entière, jamais
     * déduite de la lecture — et le constat **Q-89** de la porte S3 a montré ce
     * que coûte un seul site oublié : 38 213 octets de rapport confidentiel
     * téléchargés par un compte sans droit d'export, sur le seul des douze sites
     * qui ne passait pas par l'entonnoir. **Le discriminant apparent était
     * trompeur** : les profils qu'on croyait bloqués l'étaient par leur lecture
     * seule, pas par l'absence du droit d'export — et RSSI et ADMIN, deux des
     * huit profils du socle, écrivent *et* n'exportent pas.
     *
     * ⚠️ Et l'entonnoir n'est **pas** la barrière : le serveur exige lui aussi le
     * droit d'export sur `GET api/journal/export` (§29.8). Ce qui se joue ici est
     * l'autre moitié — ne pas fabriquer un fichier en un clic depuis un écran qui
     * n'a rien interdit.
     */
    async function exporter() {
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return false;
        try {
            const blob = await Api.journalExport(filtresPourApi(null));
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "journal-audit-" + new Date().toISOString().slice(0, 10) + ".csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            if (window.showToast) window.showToast("Journal d'audit exporté. L'extraction est elle-même journalisée.", "success");
            return true;
        } catch (e) {
            if (window.showToast) window.showToast(messageDErreur(e), "error");
            return false;
        }
    }

    /* =====================================================================
       RENDU
    ===================================================================== */

    function rafraichirCorps() {
        const hote = document.getElementById("journalCorps");
        if (!hote) return;
        hote.innerHTML = corpsHtml() + pagerHtml();
        brancherCorps();
    }

    function rafraichirVerdict(html) {
        const hote = document.getElementById("journalVerification");
        if (!hote) return;
        hote.innerHTML = html;
    }

    /**
     * Branche les gestes du corps de la liste.
     *
     * **Aucun gestionnaire en ligne** : la politique de sécurité de contenu du
     * vhost livré (`script-src 'self'`, sans `unsafe-inline`) les rend inertes,
     * en silence — c'est le constat M-6 de la porte S2, qui avait livré une
     * interface morte. On branche après rendu, et aucune donnée ne voyage dans
     * un attribut de gestionnaire.
     */
    function brancherCorps() {
        document.querySelectorAll(".jrn-ligne").forEach(ligne => {
            const ouvrir = () => basculerDetail(ligne);
            ligne.addEventListener("click", ouvrir);
            ligne.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(); }
            });
        });

        const precedente = document.getElementById("journalPagePrecedente");
        if (precedente) precedente.addEventListener("click", () => {
            if (!pile.length) return;
            curseur = pile.pop();
            charger();
        });
        const suivante = document.getElementById("journalPageSuivante");
        if (suivante) suivante.addEventListener("click", () => {
            if (pageSuivante === null) return;
            pile.push(curseur);
            curseur = pageSuivante;
            charger();
        });
    }

    /**
     * Ouvre ou referme le détail d'une ligne.
     *
     * ⚠️ **L'identifiant est relu dans le DOM au moment du clic** — jamais
     * capturé en chaîne dans la fermeture (`CLAUDE.md` §3). Ici la raison n'est
     * pas le renommage à la création (le journal ne crée rien), c'est la même
     * mécanique : la page se redessine à chaque changement de filtre ou de page,
     * et une fermeture qui aurait retenu un numéro viserait une ligne qui n'est
     * plus à l'écran — en silence.
     */
    function basculerDetail(ligne) {
        const numero = ligne.dataset.numero;
        const existant = document.querySelector('.jrn-detail[data-detail="' + CSS.escape(numero) + '"]');
        if (existant) { existant.remove(); return; }
        const entree = entrees.find(e => String(e.numero) === String(numero));
        if (!entree) return;
        ligne.insertAdjacentHTML("afterend", detailHtml(entree));
    }

    function render() {
        const app = document.getElementById("app");
        if (!app) return;

        app.innerHTML =
            '<section class="page">' +
            styles() +
            '<div class="dashboard-header">' +
            "<div><h1>Journal d'audit " +
            (typeof Help !== "undefined" ? Help.tip(
                "Registre inaltérable de ce qui s'est passé dans l'application : connexions, " +
                "refus de droit, créations, modifications, suppressions, imports et exports. " +
                "Chaque entrée porte l'empreinte de la précédente — une chaîne — de sorte " +
                "qu'une ligne modifiée, insérée ou supprimée se détecte, même par quelqu'un " +
                "qui aurait accès direct à la base. Conservation : trois ans.") : "") +
            "</h1>" +
            '<p style="color: var(--text-muted); margin-top:5px;">' +
            "Ajout seul, chaînage par empreinte, conservation trois ans — " +
            "consultation, vérification et extraction." +
            "</p></div>" +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
            // ⚠️ La note pédagogique est POSÉE À CÔTÉ du bouton, jamais dedans :
            // `Help.tip` rend un `<span role="button" tabindex="0">`, et un
            // élément interactif dans un `<button>` n'est pas du HTML valide —
            // la bulle y serait de surcroît rognée par le bouton.
            '<button type="button" id="journalVerifierBtn" class="btn-secondary" data-lecture="ok">' +
            "Vérifier le chaînage</button>" +
            (typeof Help !== "undefined" ? Help.tip(
                "Recalcule la chaîne d'empreintes de bout en bout, côté serveur. " +
                "Aucune anomalie signalée = aucune entrée n'a été modifiée, insérée ni " +
                "supprimée. C'est la réponse à la question qu'un auditeur pose toujours : " +
                "« le RSSI peut-il modifier le journal ? ». La vérification est elle-même " +
                "inscrite au journal.") : "") +
            '<button type="button" id="journalExportBtn" class="btn-secondary">Exporter</button>' +
            '<button type="button" id="journalImprimerBtn" class="btn-secondary" data-lecture="ok">Imprimer</button>' +
            "</div></div>" +

            '<div class="jrn-filtres no-print">' +
            "<label>Depuis" +
            '<input type="date" id="journalDepuis" value="' + esc(filtres.depuis) + '"></label>' +
            "<label>Jusqu'au" +
            '<input type="date" id="journalJusquA" value="' + esc(filtres.jusqu_a) + '"></label>' +
            "<label>Action" +
            '<select id="journalAction">' + optionsAction() + "</select></label>" +
            "<label>Utilisateur" +
            '<input type="search" id="journalUtilisateur" placeholder="login ou nom" value="' + esc(filtres.utilisateur) + '"></label>' +
            "<label>Type d'entité" +
            '<input type="search" id="journalEntiteType" placeholder="risques, actifs…" value="' + esc(filtres.entite_type) + '"></label>' +
            '<button type="button" id="journalFiltrerBtn" class="btn-secondary" data-lecture="ok">Filtrer</button>' +
            '<button type="button" id="journalReinitFiltreBtn" class="btn-secondary" data-lecture="ok">Réinitialiser</button>' +
            "</div>" +

            '<div id="journalVerification">' + verificationHtml() + "</div>" +
            '<div id="journalCorps"></div>' +
            "</section>";

        // ── Branchements (aucun gestionnaire en ligne : voir `brancherCorps`) ──
        const verifierBtn = document.getElementById("journalVerifierBtn");
        if (verifierBtn) verifierBtn.addEventListener("click", () => { verifier(); });

        const exportBtn = document.getElementById("journalExportBtn");
        if (exportBtn) exportBtn.addEventListener("click", () => { exporter(); });

        const imprimerBtn = document.getElementById("journalImprimerBtn");
        if (imprimerBtn) imprimerBtn.addEventListener("click", () => window.print());

        const filtrerBtn = document.getElementById("journalFiltrerBtn");
        if (filtrerBtn) filtrerBtn.addEventListener("click", () => { appliquerFiltres(); });

        const reinit = document.getElementById("journalReinitFiltreBtn");
        if (reinit) reinit.addEventListener("click", () => {
            FILTRES.forEach(nom => { filtres[nom] = ""; });
            curseur = null; pile = [];
            render();
        });

        // Entrée dans un champ de filtre = filtrer (même geste qu'une recherche).
        ["journalUtilisateur", "journalEntiteType"].forEach(id => {
            const champ = document.getElementById(id);
            if (champ) champ.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") { ev.preventDefault(); appliquerFiltres(); }
            });
        });

        rafraichirCorps();
        charger();
    }

    function appliquerFiltres() {
        const lire = (id) => {
            const champ = document.getElementById(id);
            return champ ? champ.value : "";
        };
        filtres.depuis = lire("journalDepuis");
        filtres.jusqu_a = lire("journalJusquA");
        filtres.action = lire("journalAction");
        filtres.utilisateur = lire("journalUtilisateur");
        filtres.entite_type = lire("journalEntiteType");
        // Un changement de filtre repart des entrées les plus récentes : garder
        // un curseur d'un autre jeu de filtres ferait sauter des lignes, ce que
        // la pagination par `numero` existe précisément pour empêcher.
        curseur = null;
        pile = [];
        charger();
    }

    return {
        // `renderList` : le nom que `js/app.js` appelle, comme les 26 autres modules.
        renderList: render,
        render: render,
        // Exposés pour le banc d'essai : la garde d'export se vérifie en appelant
        // la fonction, jamais en constatant qu'un bouton est grisé — c'est
        // exactement la distinction que le constat Q-89 a coûtée.
        exporter: exporter,
        verifier: verifier,
        // Purement fonctionnels : ils n'émettent rien et se prouvent sans réseau.
        normaliserPage: normaliserPage,
        normaliserVerification: normaliserVerification,
        contrat: Object.freeze({
            liste: CHEMIN_LISTE,
            verification: CHEMIN_VERIFICATION,
            export: CHEMIN_EXPORT,
            filtres: FILTRES,
            curseur: CURSEUR,
            taillePage: TAILLE_PAGE
        })
    };
})();
