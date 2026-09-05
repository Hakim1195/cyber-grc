// Emplacement : js/modules/approbations.js
// Nom du fichier : approbations.js
//
// Module « Approbations » — le CIRCUIT de validation (lot L8).
//
// ── La question à laquelle cet écran répond ─────────────────────────────────
//
//   *« Qui a validé cette politique ? »*
//
// C'est la question qu'un auditeur ISO 27001 pose systématiquement, et le
// produit n'y répondait pas. Trois circuits la couvrent, et leur ordre est
// tenu par le serveur (`backend/src/approbations/circuit.ts`) :
//
//   | Objet     | Circuit                                              |
//   |-----------|------------------------------------------------------|
//   | document  | rédaction → revue → approbation → publication         |
//   | risque    | proposition → acceptation                             |
//   | audit     | rédaction → validation                                |
//
// ⚠️ **Cet écran ne réécrit AUCUN de ces ordres.** Il affiche `circuit.etapes`
// tel que le serveur le rend, chaque étape portant déjà son `rang`. Recopier
// `CIRCUITS` ici en ferait un doublon silencieux : le jour où les deux
// divergeraient, l'écran montrerait un circuit que la base n'applique pas — et
// c'est l'écran que l'auditeur regarde. Seuls les **libellés français** des sept
// étapes vivent ici (voir `ETAPES`), et une étape inconnue s'affiche telle
// quelle plutôt que de disparaître.
//
// ── Ce que cet écran doit montrer EN PREMIER ────────────────────────────────
//
// `etapes[i].correspond === false` signifie que **l'objet a changé depuis cette
// décision**. Une approbation qui certifie un contenu modifié depuis est
// exactement ce qu'un auditeur cherche à exclure — c'est donc la première chose
// que la liste groupe et que la fiche affiche, avant l'état du circuit, avant
// l'historique, avant tout le reste.
//
// Le serveur en tire lui-même `etat === 'perime'`, et la péremption passe avant
// « complet » et « refusé » dans son calcul. Cet écran suit ce verdict ; il ne
// le recalcule pas.
//
// ── `ordre` est un NUMÉRO DE TOUR, jamais une position ──────────────────────
//
// Une nouvelle version repart du début : les quatre étapes du premier tour
// portent `ordre = 1`, celles du suivant `ordre = 2`. `historique[]` porte les
// tours précédents, **jamais réécrits**. La position dans le circuit, elle, est
// `rang`. Confondre les deux ferait afficher « tour 3 » pour une publication.
//
// ══════════════════════════════════════════════════════════════════════════
//  DEUX EMPRUNTS ASSUMÉS, ÉCRITS PLUTÔT QUE TUS
// ══════════════════════════════════════════════════════════════════════════
//
// **1. `js/core/api.js` n'expose aucune méthode d'approbation, ni d'appel
// générique.** `appeler()` est privé ; seuls des points d'entrée nommés sont
// rendus (`journal`, `pieces`, `filiales`…). `api.js` n'appartient pas au
// périmètre d'écriture de cet agent, et le modifier violerait le découpage du
// `PLAN_EXECUTION` §2.
//
// `demander()` ci-dessous est donc une **seconde porte sur le réseau**, bornée à
// une fonction, aux mêmes garanties que `Api.appeler` : `same-origin`,
// `no-store`, `redirect: error`, délai de garde, et une `Api.ErreurApi` — le
// produit n'a qu'un seul type d'erreur réseau, et les appelants d'ici s'en
// servent comme partout ailleurs.
//
// C'est **exactement** l'exception que `js/modules/journal.js` a portée avant
// qu'elle soit levée, et son entête dit ce qu'elle coûte : *« le jour où
// l'expiration de session, le traitement des 401 ou la détection d'issue
// inconnue changent dans api.js, une seconde rédaction ne suit pas — et rien ne
// le signale »*. Le geste exact pour la lever est écrit au `CONTRAT` plus bas.
//
// ⚠️ **Le trou connu de cet emprunt, et son rustine.** `appeler()` prévient les
// observateurs d'authentification sur un 401 (`signaler()`), ce qui fait
// réapparaître l'écran de connexion ; `observateursAuth` est privé et
// inatteignable d'ici. `demander()` réémet donc le 401 **par la vraie porte**,
// en appelant `Api.session()` — qui échouera de la même façon et préviendra qui
// de droit. Un appel de plus, sur un chemin déjà cassé.
//
// **2. Il n'existe AUCUNE route qui liste ce qui attend une décision.** Le
// serveur n'expose que `GET`/`POST /api/approbations/:entite/:entiteId` — un
// objet à la fois. La liste est donc composée **côté navigateur** : on énumère
// les documents, risques et audits que `DataStore` tient déjà en mémoire pour
// la filiale active, et on interroge le circuit de chacun.
//
// Ce que cela coûte, dit ici plutôt que découvert en recette : **une requête par
// objet**. `PARALLELE` les borne à six de front et l'écran affiche sa
// progression — il ne fait jamais croire qu'il a fini alors qu'il compte encore.
// Une route de listage côté serveur rendrait ce paragraphe caduc ; elle est
// demandée au rapport.
//
// ── Ce qui s'affiche vient d'un humain ──────────────────────────────────────
//
// Un commentaire d'approbation est saisi à la main, et il sera lu par un
// auditeur des années plus tard. Tout ce que ce fichier injecte dans le DOM
// passe par `escapeHtml`, sans exception — y compris les libellés d'acteur, qui
// viennent de `perimetre.utilisateurId`, c'est-à-dire d'un annuaire que ce
// produit ne contrôle pas.
//
// Aucun gestionnaire en ligne (`onclick=`) : la politique de sécurité de contenu
// du vhost les bloque. Les identifiants se lisent dans les attributs du balisage
// **au moment du clic**, jamais capturés en chaîne — le serveur réattribue les
// identifiants à la création.

const ApprobationsModule = (() => {
    "use strict";

    /* =====================================================================
       CONTRAT HTTP — relevé dans `backend/src/approbations/index.ts`
    ===================================================================== */

    /**
     * Les deux seules routes du lot L8.
     *
     * Le jour où `js/core/api.js` gagne `Api.approbations(entite, id)` et
     * `Api.decider(entite, id, corps)`, c'est **`demander()` qui disparaît** et
     * ces deux fonctions qui les appellent — rien d'autre ne bouge dans ce
     * fichier. Le chemin est écrit ici, une fois.
     */
    const BASE = "api/approbations/";

    function chemin(entite, id) {
        return BASE + encodeURIComponent(entite) + "/" + encodeURIComponent(id);
    }

    /** Délai de garde, aligné sur `Api` (30 s). */
    const DELAI_MS = 30000;

    /** Requêtes de circuit menées de front pendant la composition de la liste. */
    const PARALLELE = 6;

    /* =====================================================================
       VOCABULAIRE
    ===================================================================== */

    /**
     * Les trois familles approuvables.
     *
     * ── Une liste écrite à la main, et pourquoi elle est admise ──
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Ici, une famille
     * absente **ne s'afficherait pas**, et ce serait silencieux — le mauvais cas.
     * Deux choses la retiennent :
     *
     *  · le navigateur **n'a pas de catalogue** à interroger : `OBJET_PAR_ENTITE`
     *    vit côté serveur, et aucune route ne le publie. Découvrir est donc
     *    impossible, pas seulement coûteux ;
     *  · chaque ligne porte **quatre** informations dont aucune n'est devinable
     *    (le domaine de droits, le lecteur `DataStore`, le champ de libellé, la
     *    route de la fiche d'origine). Une famille ajoutée sans sa ligne ne
     *    « manquerait » pas à moitié : elle n'aurait aucun moyen d'exister.
     *
     * `inventaire()` en fait la moitié bruyante : une famille dont le lecteur
     * `DataStore` a disparu est **comptée et rapportée à l'écran**, jamais
     * ignorée en silence.
     */
    const FAMILLES = Object.freeze([
        Object.freeze({
            entite: "documents", objet: "document",
            singulier: "Politique", pluriel: "Politiques et procédures",
            domaine: "documents", lecteur: "getDocuments",
            champ: "titre", route: "#/documents/"
        }),
        Object.freeze({
            entite: "risques", objet: "risque",
            singulier: "Risque", pluriel: "Risques",
            domaine: "risques", lecteur: "getRisques",
            champ: "nom", route: "#/risques/"
        }),
        Object.freeze({
            entite: "audits", objet: "audit",
            singulier: "Rapport d'audit", pluriel: "Rapports d'audit",
            domaine: "audits", lecteur: "getAudits",
            champ: "ref", route: "#/audits/"
        })
    ]);

    function famille(entite) {
        return FAMILLES.find(f => f.entite === entite) || null;
    }

    /**
     * Libellés français des sept étapes de `ck_approbations_etape`.
     *
     * Une étape absente de cette table s'affiche **telle qu'elle est en base**,
     * échappée (voir `libelleEtape`) : rien ne disparaît, et le pire cas est un
     * mot technique sous les yeux d'un auditeur — visible, donc corrigeable.
     */
    const ETAPES = Object.freeze({
        redaction:   "Rédaction",
        revue:       "Revue",
        approbation: "Approbation",
        publication: "Publication",
        proposition: "Proposition",
        acceptation: "Acceptation",
        validation:  "Validation"
    });

    /** Libellés des cinq statuts de `ck_approbations_statut`. */
    const STATUTS = Object.freeze({
        en_attente: "En attente",
        en_cours:   "En cours",
        approuve:   "Approuvée",
        refuse:     "Refusée",
        annule:     "Annulée"
    });

    /**
     * Teintes sémantiques, prises dans les seules classes de `css/style.css`.
     * Vert = franchi, orange = en attente, rouge = refusé, gris = neutre.
     */
    const TEINTE_STATUT = Object.freeze({
        approuve:   "status-conforme",
        refuse:     "status-non-conforme",
        en_cours:   "status-partiellement-conforme",
        en_attente: "status-non-applicable",
        annule:     "status-non-applicable"
    });

    /** Les quatre états d'un circuit, avec ce qu'ils veulent dire pour un lecteur. */
    const ETATS = Object.freeze({
        en_cours: { libelle: "En cours",  teinte: "status-partiellement-conforme" },
        complet:  { libelle: "Complet",   teinte: "status-conforme" },
        refuse:   { libelle: "Refusé",    teinte: "status-non-conforme" },
        perime:   { libelle: "Périmé",    teinte: "status-non-conforme" }
    });

    /* =====================================================================
       ÉTAT DU MODULE
    ===================================================================== */

    /**
     * Vue courante.
     *
     * ⚠️ **La fiche de circuit n'a pas de route à elle**, et ce n'est pas un
     * oubli : `js/app.js` — qui n'appartient pas au périmètre de cet agent —
     * n'enregistre que `/approbations`. Elle vit donc dans l'état du module.
     * Conséquence assumée : l'adresse ne change pas, et le bouton « Retour » du
     * navigateur quitte l'écran au lieu de revenir à la liste. Le bouton
     * « ← Toutes les approbations » de la fiche fait ce retour-là.
     *
     * Le remède propre est une route `/approbations/:entite/:id` dans
     * `js/app.js` ; il est demandé au rapport.
     */
    let vue = { mode: "liste", entite: null, id: null };

    /** Ce que la composition de la liste a recueilli. */
    let liste = { objets: [], total: 0, faits: 0, encours: false, erreur: null, famillesIgnorees: [] };

    /** La fiche courante : `{ objet, circuit }` tel que le serveur les rend. */
    let fiche = { charge: null, encours: false, erreur: null, envoi: false, message: null };

    /** Le commentaire saisi — conservé à travers un rechargement de fiche (leçon Q-29). */
    let commentaireSaisi = "";

    /** Jeton de génération : une réponse d'un chargement abandonné ne redessine rien. */
    let generation = 0;

    /* =====================================================================
       ACCÈS RÉSEAU — voir l'entête : exception assumée, bornée à cette fonction
    ===================================================================== */

    // ── LA SECONDE PORTE RÉSEAU A DISPARU ─────────────────────────────
    //
    // Cet écran portait son propre `demander()` : `js/core/api.js` n'exposait
    // aucune méthode pour ses routes, et son `appeler()` est privé. Il
    // rédigeait donc une seconde fois les garanties de la porte unique —
    // `same-origin`, `no-store`, `redirect: error`, délai de garde — avec un
    // trou connu : les observateurs de 401 lui étaient inatteignables.
    //
    // Les méthodes existent depuis le 04/09/2026, et la porte a disparu avec
    // elles. Une garantie recopiée est une garantie qui divergera : c'est ce
    // que l'entête d'`api.js` interdit depuis le lot L2.
    //
    // ⚠️ Les deux fonctions ci-dessous ont été emportées avec elle lors du
    // retrait, et rétablies : `node --check` passait — la syntaxe était juste —
    // mais le module levait « decider is not defined » au chargement, et l'écran
    // n'existait plus. Un contrôle de syntaxe ne dit rien d'un identifiant
    // manquant ; seul le chargement le dit.

    /** Lit le circuit d'un objet. */
    function lireCircuit(entite, id) {
        return Api.approbations(entite, id);
    }

    /** Prononce une décision. Exige le niveau « validation », refusé par le serveur. */
    function decider(entite, id, etape, decision, commentaire) {
        const corps = { etape: etape, decision: decision };
        const propre = String(commentaire || "").trim();
        if (propre !== "") corps.commentaire = propre;
        return Api.deciderApprobation(entite, id, corps);
    }


    /* =====================================================================
       DROITS — l'interface n'est PAS la barrière, elle en est le reflet
    ===================================================================== */

    /**
     * Le profil peut-il prendre une décision sur ce domaine ?
     *
     * Le serveur exige `{ ecrire, selon-entite, niveau: 'validation' }`. Ce
     * calcul reproduit ce seuil pour **cacher un bouton qui ne marcherait pas**,
     * et pour rien d'autre : la barrière est le crochet `onRequest`, qui refuse
     * en 403 même si ce bouton était forcé. Le banc l'éprouve dans les deux
     * sens — bouton absent, ET requête émise quand même.
     *
     * `Droits.niveauEffectif` rend le niveau du domaine quand il est nommé,
     * celui de la session sinon ; `Api.CONTRAT_AUTH.niveaux` donne l'ordre.
     * Droits inconnus (serveur muet) : on ne masque rien, comme partout ailleurs.
     */
    function peutValider(domaine) {
        if (typeof Droits === "undefined" || !Droits.connus()) return true;
        const ordre = Api.CONTRAT_AUTH.niveaux;
        const rang = (n) => { const i = ordre.indexOf(n); return i === -1 ? 0 : i + 1; };
        if (!Droits.peutLire(domaine)) return false;
        return rang(Droits.niveauEffectif(domaine)) >= rang("validation");
    }

    function peutLire(domaine) {
        if (typeof Droits === "undefined") return true;
        return Droits.peutLire(domaine);
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

    function libelleEtape(code) { return ETAPES[code] || code || "—"; }
    function libelleStatut(code) { return STATUTS[code] || code || "—"; }

    function fmtDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return esc(iso);
        return d.toLocaleString("fr-FR");
    }

    function badgeEtat(etat) {
        const meta = ETATS[etat] || { libelle: etat || "—", teinte: "status-non-applicable" };
        return '<span class="status ' + meta.teinte + '">' + esc(meta.libelle) + "</span>";
    }

    function badgeStatut(statut) {
        const teinte = TEINTE_STATUT[statut] || "status-non-applicable";
        return '<span class="status ' + teinte + '">' + esc(libelleStatut(statut)) + "</span>";
    }

    /**
     * L'avertissement de péremption — la première chose que cet écran dit.
     *
     * Il nomme **les étapes concernées**, pas seulement le fait : « le circuit
     * est périmé » n'apprend rien à qui doit décider quoi faire, tandis que
     * « l'approbation du 3 septembre par Sarah Nadal ne vaut plus » se comprend
     * sans explication.
     */
    function avertissementPeremption(circuit) {
        const perimees = (circuit.etapes || []).filter(e => e.correspond === false);
        if (perimees.length === 0) return "";
        return (
            '<div class="apr-peremption" role="alert">' +
            "<strong>L'objet a été modifié depuis ces décisions : elles ne valent plus.</strong>" +
            "<p>Une approbation vaut pour une <em>version</em> de l'objet, jamais pour l'objet. " +
            "Les décisions ci-dessous ont figé une empreinte du contenu qui ne correspond plus " +
            "à ce qu'il contient aujourd'hui — un auditeur les écarterait. Le circuit repart du " +
            "début, sur la version actuelle.</p>" +
            '<ul class="apr-peremption-liste">' +
            perimees.map(e =>
                "<li>" + esc(libelleEtape(e.etape)) + " — " + esc(libelleStatut(e.statut)) +
                (e.acteur ? " par " + esc(e.acteur) : "") +
                (e.dateDecision ? " le " + fmtDate(e.dateDecision) : "") +
                (e.versionObjet ? ' <span class="apr-mono">(version ' + esc(e.versionObjet) + ")</span>" : "") +
                "</li>").join("") +
            "</ul></div>"
        );
    }

    /** Une étape du circuit, en ligne de tableau. */
    function ligneEtape(e, attendue) {
        const estAttendue = attendue !== null && e.etape === attendue && e.statut !== "approuve";
        const classes = ["apr-etape"];
        if (e.correspond === false) classes.push("apr-etape--perimee");
        if (estAttendue) classes.push("apr-etape--attendue");
        return (
            '<tr class="' + classes.join(" ") + '">' +
            '<td class="apr-rang">' + esc(e.rang) + "</td>" +
            "<td><strong>" + esc(libelleEtape(e.etape)) + "</strong>" +
            (estAttendue ? ' <span class="apr-marque">étape attendue</span>' : "") +
            (e.correspond === false ? ' <span class="apr-marque apr-marque--alerte">ne correspond plus</span>' : "") +
            "</td>" +
            "<td>" + badgeStatut(e.statut) + "</td>" +
            "<td>" + (e.acteur ? esc(e.acteur) : '<span class="apr-vide">—</span>') + "</td>" +
            "<td>" + fmtDate(e.dateDecision) + "</td>" +
            '<td class="apr-mono">' + (e.versionObjet ? esc(e.versionObjet) : "—") + "</td>" +
            "<td>" + (e.commentaire ? esc(e.commentaire) : '<span class="apr-vide">—</span>') + "</td>" +
            "</tr>"
        );
    }

    function tableEtapes(etapes, attendue) {
        if (!etapes || etapes.length === 0) {
            return '<p class="chart-empty">Ce circuit ne comporte aucune étape.</p>';
        }
        return (
            '<table class="data-table apr-table"><thead><tr>' +
            "<th>#</th><th>Étape</th><th>Statut</th><th>Décidée par</th>" +
            "<th>Le</th><th>Version</th><th>Commentaire</th>" +
            "</tr></thead><tbody>" +
            etapes.map(e => ligneEtape(e, attendue)).join("") +
            "</tbody></table>"
        );
    }

    /** Les tours précédents. `ordre` est le numéro de TOUR, jamais un rang. */
    function historiqueHtml(historique) {
        if (!historique || historique.length === 0) return "";
        return (
            '<div class="apr-historique">' +
            "<h3>Tours précédents" +
            (typeof Help !== "undefined" ? Help.tip(
                "Une nouvelle version de l'objet ouvre un nouveau tour : le circuit repart du " +
                "début, et le tour précédent n'est jamais réécrit. C'est ce qui permet de " +
                "montrer, des années plus tard, qui avait validé quelle version.") : "") +
            "</h3>" +
            historique.map(cycle =>
                '<div class="apr-cycle">' +
                '<h4>Tour n° ' + esc(cycle.ordre) + " " + badgeEtat(cycle.etat) + "</h4>" +
                tableEtapes(cycle.etapes, null) +
                "</div>").join("") +
            "</div>"
        );
    }

    /**
     * Les étapes écrites hors du circuit de leur objet.
     *
     * Le serveur les rend dans `horsCircuit` plutôt que de les écarter : *« une
     * ligne écartée sans un mot serait une décision d'approbation qui disparaît
     * de l'écran »*. L'écran suit — elles s'affichent, signalées.
     */
    function horsCircuitHtml(lignes) {
        if (!lignes || lignes.length === 0) return "";
        return (
            '<div class="apr-hors-circuit" role="alert">' +
            "<strong>" + esc(lignes.length) + " décision(s) hors du circuit de cet objet.</strong> " +
            "Elles ne font partie d'aucune des étapes prévues — une reprise d'export ancien a pu " +
            "les déposer. Elles sont affichées ici plutôt que masquées." +
            '<table class="data-table apr-table"><thead><tr>' +
            "<th>Étape</th><th>Tour</th><th>Statut</th><th>Décidée par</th><th>Le</th>" +
            "</tr></thead><tbody>" +
            lignes.map(l =>
                "<tr><td>" + esc(l.etape) + "</td>" +
                "<td>" + esc(l.ordre) + "</td>" +
                "<td>" + badgeStatut(l.statut) + "</td>" +
                "<td>" + (l.acteurLibelle ? esc(l.acteurLibelle) : "—") + "</td>" +
                "<td>" + fmtDate(l.dateDecision) + "</td></tr>").join("") +
            "</tbody></table></div>"
        );
    }

    /**
     * Le formulaire de décision, ou la raison pour laquelle il n'y en a pas.
     *
     * ⚠️ **Un profil qui ne valide pas n'est pas en faute**, et l'écran ne le
     * traite pas comme une erreur : pas de rouge d'alarme, pas de `role="alert"`.
     * C'est une note d'information — la même distinction que le produit fait
     * entre « refus de droit » et « panne ».
     */
    function decisionHtml(charge) {
        const f = famille(charge.objet.entite);
        const circuit = charge.circuit;
        const attendue = circuit.etapeAttendue;

        if (attendue === null) {
            const motif = circuit.etat === "complet"
                ? "Le circuit est complet pour cette version : toutes les étapes ont été franchies. " +
                  "Modifier l'objet ouvrira un nouveau tour."
                : circuit.etat === "refuse"
                    ? "Le circuit a été refusé pour cette version. Modifier l'objet ouvrira un nouveau tour."
                    : "Aucune étape n'est recevable en l'état.";
            return '<div class="apr-note"><strong>Aucune décision à prendre.</strong> ' + esc(motif) + "</div>";
        }

        if (f !== null && !peutValider(f.domaine)) {
            return (
                '<div class="apr-note" id="approbationsSansDroit">' +
                "<strong>Votre profil ne prend pas les décisions de validation sur ce domaine.</strong>" +
                "<p>Le circuit attend l'étape « " + esc(libelleEtape(attendue)) + " ». Elle relève du " +
                "niveau <em>validation</em>, qui s'accorde séparément de la lecture et de la " +
                "contribution : pouvoir rédiger une politique et pouvoir l'approuver ne sont pas le " +
                "même droit — c'est ce qui donne sa valeur à l'approbation. Adressez-vous à la " +
                "personne qui porte ce niveau sur ce domaine.</p>" +
                "</div>"
            );
        }

        return (
            '<div class="apr-decision" id="approbationsDecision">' +
            "<h3>Prendre la décision : " + esc(libelleEtape(attendue)) +
            (typeof Help !== "undefined" ? Help.tip(
                "La décision est inscrite au journal d'audit dans la même transaction, et elle est " +
                "IRRÉVERSIBLE : la base refuse toute modification ou suppression d'une étape " +
                "approuvée ou refusée, y compris à l'administrateur. Elle fige aussi l'empreinte du " +
                "contenu : si l'objet change ensuite, la décision cesse de valoir et le circuit " +
                "repart du début.") : "") +
            "</h3>" +
            '<p class="apr-cycle-attendu">Tour n° ' + esc(circuit.cycleAttendu === null ? circuit.cycle : circuit.cycleAttendu) +
            " · version " + esc(charge.objet.version) + " de l'objet.</p>" +
            '<label for="approbationsCommentaire">Commentaire ' +
            '<span class="apr-facultatif">(facultatif, conservé trois ans)</span></label>' +
            '<textarea id="approbationsCommentaire" rows="3" maxlength="4000" ' +
            'placeholder="Ce que vous voulez qu\'un auditeur lise dans trois ans.">' +
            esc(commentaireSaisi) + "</textarea>" +
            '<div class="apr-boutons">' +
            '<button type="button" id="approbationsApprouver" class="btn-primary" ' +
            'data-entite="' + esc(charge.objet.entite) + '" data-id="' + esc(charge.objet.id) + '" ' +
            'data-etape="' + esc(attendue) + '">Approuver</button>' +
            '<button type="button" id="approbationsRefuser" class="btn-secondary" ' +
            'data-entite="' + esc(charge.objet.entite) + '" data-id="' + esc(charge.objet.id) + '" ' +
            'data-etape="' + esc(attendue) + '">Refuser</button>' +
            "</div></div>"
        );
    }

    /** Le message d'issue d'une décision, ou d'un refus du serveur. */
    function messageHtml() {
        if (fiche.message === null) return "";
        const m = fiche.message;
        const classe = m.ton === "succes" ? "apr-message--succes"
            : m.ton === "info" ? "apr-message--info" : "apr-message--erreur";
        return '<div class="apr-message ' + classe + '" id="approbationsMessage" ' +
            (m.ton === "succes" ? 'role="status"' : 'role="alert"') + ">" +
            "<strong>" + esc(m.titre) + "</strong> " + esc(m.texte) +
            (m.recharger
                ? ' <button type="button" id="approbationsRecharger" class="btn-secondary apr-recharger">Recharger la fiche</button>'
                : "") +
            "</div>";
    }

    /**
     * Le FAIT, plus le geste que cette couche-ci connaît.
     *
     * `js/core/api.js` énonce ce qui s'est passé sans prescrire de geste : il
     * ignore ce que l'appelant tient en mémoire. Cet écran, lui, le sait — il y
     * a un commentaire saisi, et il ne doit pas disparaître. « Recharger la
     * fiche » désigne donc **le bouton**, qui relit le circuit et RECONDUIT la
     * saisie, jamais la touche F5, qui l'effacerait (leçon Q-29).
     */
    function messageDErreur(e) {
        if (!e) return { ton: "erreur", titre: "Erreur inconnue.", texte: "", recharger: false };

        if (e.estDroitInsuffisant && e.estDroitInsuffisant()) {
            return {
                ton: "info",
                titre: "Votre profil ne prend pas cette décision.",
                texte: "Le niveau « validation » s'accorde séparément de la contribution. " +
                    "Rien n'a été écrit, et votre commentaire est conservé à l'écran.",
                recharger: false
            };
        }
        if (e.statut === 403) {
            return {
                ton: "erreur",
                titre: "Décision refusée.",
                texte: (e.message || "Cet enregistrement est hors de votre périmètre.") +
                    " Vérifiez la filiale active dans le bandeau : une approbation appartient à une " +
                    "filiale, jamais au groupe entier.",
                recharger: false
            };
        }
        if (e.estIntrouvable && e.estIntrouvable()) {
            return {
                ton: "erreur",
                titre: "Cet enregistrement est introuvable.",
                texte: "Il a peut-être été supprimé, ou il appartient à une autre filiale.",
                recharger: false
            };
        }
        if (e.statut === 409) {
            return {
                ton: "erreur",
                titre: "Le circuit a bougé pendant votre saisie.",
                texte: (e.message || "L'étape demandée n'est pas celle qu'attend le circuit.") +
                    " Rien n'a été écrit. Rechargez la fiche pour voir l'état réel : votre " +
                    "commentaire sera conservé.",
                recharger: true
            };
        }
        if (e.statut === 400) {
            return {
                ton: "erreur",
                titre: "La demande a été refusée.",
                texte: e.message || "Une valeur envoyée n'est pas admise.",
                recharger: false
            };
        }
        if (e.estNonAuthentifie && e.estNonAuthentifie()) {
            return {
                ton: "erreur",
                titre: "Votre session n'est plus ouverte sur le serveur.",
                texte: "Reconnectez-vous. Votre commentaire reste affiché à l'écran.",
                recharger: false
            };
        }
        if (e.issueInconnue) {
            return {
                ton: "erreur",
                titre: "L'opération a peut-être été appliquée.",
                texte: (e.message || "") + " Rechargez la fiche avant de recommencer : " +
                    "une décision d'approbation est irréversible, et la reprendre en double " +
                    "serait refusé par la base.",
                recharger: true
            };
        }
        return {
            ton: "erreur",
            titre: "La demande n'a pas abouti.",
            texte: e.message || String(e),
            recharger: true
        };
    }

    /* =====================================================================
       LA FICHE DE CIRCUIT
    ===================================================================== */

    /**
     * Le corps de la fiche — utilisé par l'écran `/approbations` ET par l'encart
     * que les fiches Document / Risque / Audit intègrent. Une seule rédaction :
     * deux divergeraient, et c'est la version faible qui l'emporterait.
     */
    function ficheCorpsHtml(options) {
        const opts = options || {};
        if (fiche.encours && fiche.charge === null) {
            return '<p class="chart-empty">Lecture du circuit…</p>';
        }
        if (fiche.erreur !== null) {
            const m = fiche.erreur;
            return '<div class="apr-message ' +
                (m.ton === "info" ? "apr-message--info" : "apr-message--erreur") +
                '" role="alert"><strong>' + esc(m.titre) + "</strong> " + esc(m.texte) + "</div>";
        }
        if (fiche.charge === null) return "";

        const charge = fiche.charge;
        const circuit = charge.circuit;
        const f = famille(charge.objet.entite);

        return (
            // ⚠️ La péremption AVANT tout le reste — c'est la règle de cet écran.
            avertissementPeremption(circuit) +
            messageHtml() +
            '<div class="apr-resume">' +
            '<div class="apr-resume-bloc"><span class="apr-etiquette">État du circuit</span>' +
            badgeEtat(circuit.etat) + "</div>" +
            '<div class="apr-resume-bloc"><span class="apr-etiquette">Tour en cours</span>' +
            '<span class="apr-valeur">n° ' + esc(circuit.cycle) + "</span></div>" +
            '<div class="apr-resume-bloc"><span class="apr-etiquette">Étape attendue</span>' +
            '<span class="apr-valeur">' +
            (circuit.etapeAttendue === null ? "aucune" : esc(libelleEtape(circuit.etapeAttendue))) +
            "</span></div>" +
            '<div class="apr-resume-bloc"><span class="apr-etiquette">Version de l\'objet</span>' +
            '<span class="apr-valeur apr-mono">' + esc(charge.objet.version) + "</span></div>" +
            "</div>" +
            (charge.objet.portee === "groupe"
                ? '<div class="apr-note"><strong>Document du socle Groupe.</strong> ' +
                  "Le contenu appartient au groupe ; le circuit, lui, se déroule dans votre " +
                  "filiale. Ce que vous décidez ici est une <em>adoption locale</em>, pas une " +
                  "approbation au nom du groupe entier — chaque filiale tient la sienne.</div>"
                : "") +
            tableEtapes(circuit.etapes, circuit.etapeAttendue) +
            decisionHtml(charge) +
            horsCircuitHtml(circuit.horsCircuit) +
            historiqueHtml(circuit.historique) +
            (opts.avecLienObjet !== false && f !== null
                ? '<p class="apr-lien-objet"><a href="' + esc(f.route + charge.objet.id) + '">' +
                  "Ouvrir la fiche " + esc(f.singulier.toLowerCase()) + " →</a></p>"
                : "")
        );
    }

    /**
     * Charge le circuit d'un objet, puis redessine `cible`.
     *
     * `generation` empêche une réponse tardive d'un chargement abandonné de
     * réécrire l'écran par-dessus le suivant.
     */
    async function chargerFiche(entite, id, cible) {
        const mien = ++generation;
        fiche.encours = true;
        fiche.erreur = null;
        redessiner(cible, ficheCorpsHtml, entite, id);
        try {
            const charge = await lireCircuit(entite, id);
            if (mien !== generation) return;
            fiche.charge = charge;
            fiche.erreur = null;
        } catch (e) {
            if (mien !== generation) return;
            fiche.charge = null;
            fiche.erreur = messageDErreur(e);
        } finally {
            if (mien === generation) {
                fiche.encours = false;
                redessiner(cible, ficheCorpsHtml, entite, id);
            }
        }
    }

    /**
     * Réécrit le contenu d'un conteneur et rebranche ses gestionnaires.
     *
     * ⚠️ Le lien « Ouvrir la fiche … » est retiré **dans l'encart**, et pas
     * ailleurs : l'encart vit DÉJÀ sur la fiche de l'objet, et le lien y
     * pointerait sur la page en cours. Le discriminant est le conteneur, seule
     * chose qui distingue les deux emplois du même rendu.
     */
    function redessiner(cible, corps, entite, id) {
        const noeud = document.getElementById(cible);
        if (!noeud) return;
        noeud.innerHTML = corps({ avecLienObjet: cible !== ID_ENCART + "Corps" });
        brancherFiche(cible, entite, id);
    }

    /**
     * Branche les gestionnaires de la fiche.
     *
     * ⚠️ **Aucun gestionnaire en ligne, et aucun identifiant capturé en
     * chaîne** : `entite` et `id` sont relus dans `dataset` du bouton **au
     * moment du clic**. Le serveur réattribue les identifiants à la création, et
     * une fermeture qui a capturé l'ancien vise en silence un enregistrement qui
     * n'existe plus.
     */
    function brancherFiche(cible, entite, id) {
        const noeud = document.getElementById(cible);
        if (!noeud) return;

        const commentaire = noeud.querySelector("#approbationsCommentaire");
        if (commentaire) {
            commentaire.addEventListener("input", () => { commentaireSaisi = commentaire.value; });
        }

        ["approbationsApprouver", "approbationsRefuser"].forEach(idBouton => {
            const bouton = noeud.querySelector("#" + idBouton);
            if (!bouton) return;
            bouton.addEventListener("click", () => {
                const decision = idBouton === "approbationsApprouver" ? "approuve" : "refuse";
                envoyerDecision(
                    bouton.dataset.entite, bouton.dataset.id, bouton.dataset.etape,
                    decision, cible);
            });
        });

        const recharger = noeud.querySelector("#approbationsRecharger");
        if (recharger) {
            recharger.addEventListener("click", () => {
                fiche.message = null;
                chargerFiche(entite, id, cible);
            });
        }
    }

    /**
     * Envoie une décision, puis redessine sur ce que le serveur a rendu.
     *
     * La réponse `201` porte le circuit **relu après écriture** : on l'adopte
     * telle quelle plutôt que de recharger, ce qui évite une seconde requête et
     * surtout une fenêtre où l'écran montrerait un état intermédiaire.
     */
    async function envoyerDecision(entite, id, etape, decision, cible) {
        if (fiche.envoi) return;
        fiche.envoi = true;
        fiche.message = null;
        const boutons = document.querySelectorAll(
            "#" + cible + " #approbationsApprouver, #" + cible + " #approbationsRefuser");
        boutons.forEach(b => { b.disabled = true; });
        try {
            const charge = await decider(entite, id, etape, decision, commentaireSaisi);
            fiche.charge = charge;
            fiche.erreur = null;
            commentaireSaisi = "";
            const suite = charge.circuit.etapeAttendue;
            fiche.message = {
                ton: "succes",
                titre: decision === "approuve"
                    ? "Étape « " + libelleEtape(etape) + " » approuvée."
                    : "Étape « " + libelleEtape(etape) + " » refusée.",
                texte: suite === null
                    ? "Le circuit est clos pour cette version. La décision est inscrite au journal " +
                      "d'audit et ne peut plus être modifiée."
                    : "Le circuit attend maintenant l'étape « " + libelleEtape(suite) + " ». " +
                      "La décision est inscrite au journal d'audit et ne peut plus être modifiée.",
                recharger: false
            };
            // La liste, si elle a été composée, ne reflète plus la réalité.
            liste.objets = [];
        } catch (e) {
            fiche.message = messageDErreur(e);
        } finally {
            fiche.envoi = false;
            redessiner(cible, ficheCorpsHtml, entite, id);
        }
    }

    /* =====================================================================
       L'ÉCRAN /approbations — ce qui attend une décision
    ===================================================================== */

    /**
     * Les objets de la filiale active, tels que `DataStore` les tient.
     *
     * Une famille dont le domaine n'est pas lisible est **écartée sans être
     * interrogée** : émettre trois cents requêtes vouées au 403 remplirait le
     * journal d'audit de refus qui n'apprennent rien. L'écran le dit.
     */
    function inventaire() {
        const objets = [];
        const ignorees = [];
        FAMILLES.forEach(f => {
            if (!peutLire(f.domaine)) { ignorees.push({ f: f, motif: "droit" }); return; }
            const lecteur = (typeof DataStore !== "undefined") ? DataStore[f.lecteur] : undefined;
            if (typeof lecteur !== "function") { ignorees.push({ f: f, motif: "lecteur" }); return; }
            let lignes = [];
            try { lignes = lecteur() || []; } catch (e) { ignorees.push({ f: f, motif: "lecteur" }); return; }
            lignes.forEach(l => {
                if (!l || !l.id) return;
                objets.push({ famille: f, id: l.id, libelle: String(l[f.champ] || l.id) });
            });
        });
        return { objets: objets, ignorees: ignorees };
    }

    /**
     * Interroge le circuit de chaque objet, six de front.
     *
     * ⚠️ **Une requête par objet** : le serveur n'expose aucune route de
     * listage (voir l'entête). La progression est affichée — cet écran ne fait
     * jamais croire qu'il a fini alors qu'il compte encore.
     */
    async function composerListe() {
        const mien = ++generation;
        const inv = inventaire();
        liste = {
            objets: [], total: inv.objets.length, faits: 0,
            encours: true, erreur: null, famillesIgnorees: inv.ignorees
        };
        rafraichirListe();

        const file = inv.objets.slice();
        const recueillis = [];

        async function ouvrier() {
            for (;;) {
                const suivant = file.shift();
                if (suivant === undefined) return;
                try {
                    const charge = await lireCircuit(suivant.famille.entite, suivant.id);
                    recueillis.push({ ref: suivant, charge: charge, erreur: null });
                } catch (e) {
                    // Un objet inaccessible n'arrête pas l'inventaire : il est
                    // rangé à part et COMPTÉ. Le taire ferait dire à cet écran
                    // « rien n'attend de décision » alors qu'il n'a pas pu voir.
                    recueillis.push({ ref: suivant, charge: null, erreur: e });
                }
                if (mien !== generation) return;
                liste.faits += 1;
                if (liste.faits % PARALLELE === 0) rafraichirProgression();
            }
        }

        const ouvriers = [];
        for (let i = 0; i < Math.min(PARALLELE, Math.max(1, file.length)); i += 1) ouvriers.push(ouvrier());
        await Promise.all(ouvriers);
        if (mien !== generation) return;

        liste.objets = recueillis;
        liste.encours = false;
        rafraichirListe();
    }

    /** Les cinq groupes de la liste, dans l'ordre où ils comptent. */
    function grouper() {
        const g = {
            perimes: [], aDecider: [], enCours: [], clos: [], inaccessibles: []
        };
        liste.objets.forEach(o => {
            if (o.erreur !== null) { g.inaccessibles.push(o); return; }
            const c = o.charge.circuit;
            if (c.etat === "perime") { g.perimes.push(o); return; }
            if (c.etapeAttendue !== null && peutValider(o.ref.famille.domaine)) { g.aDecider.push(o); return; }
            if (c.etapeAttendue !== null) { g.enCours.push(o); return; }
            g.clos.push(o);
        });
        return g;
    }

    function ligneObjet(o) {
        const c = o.charge.circuit;
        const perimees = (c.etapes || []).filter(e => e.correspond === false).length;
        // L'identifiant vit dans les ATTRIBUTS, relus au clic — jamais capturé.
        return (
            '<tr class="apr-ligne" tabindex="0" data-entite="' + esc(o.ref.famille.entite) + '" ' +
            'data-id="' + esc(o.ref.id) + '">' +
            "<td>" + esc(o.ref.famille.singulier) + "</td>" +
            "<td><strong>" + esc(o.ref.libelle) + "</strong></td>" +
            "<td>" + badgeEtat(c.etat) + "</td>" +
            "<td>" + (c.etapeAttendue === null ? '<span class="apr-vide">—</span>' : esc(libelleEtape(c.etapeAttendue))) + "</td>" +
            '<td class="apr-mono">' + esc(c.cycle) + "</td>" +
            "<td>" + (perimees > 0
                ? '<span class="status status-non-conforme">' + esc(perimees) + " périmée(s)</span>"
                : '<span class="apr-vide">—</span>') + "</td>" +
            "</tr>"
        );
    }

    function groupeHtml(titre, explication, objets, classe) {
        if (objets.length === 0) return "";
        return (
            '<section class="apr-groupe ' + (classe || "") + '">' +
            "<h2>" + esc(titre) + ' <span class="apr-compte">' + esc(objets.length) + "</span></h2>" +
            '<p class="apr-explication">' + esc(explication) + "</p>" +
            '<table class="data-table apr-table"><thead><tr>' +
            "<th>Type</th><th>Objet</th><th>État</th><th>Étape attendue</th><th>Tour</th><th>Alerte</th>" +
            "</tr></thead><tbody>" + objets.map(ligneObjet).join("") + "</tbody></table>" +
            "</section>"
        );
    }

    function listeCorpsHtml() {
        if (liste.encours) {
            return '<p class="chart-empty" id="approbationsProgression">' +
                "Interrogation des circuits… " + esc(liste.faits) + " / " + esc(liste.total) + "</p>";
        }
        if (liste.total === 0) {
            return '<p class="chart-empty">Aucune politique, aucun risque et aucun rapport d\'audit ' +
                "dans cette filiale : il n'y a rien à approuver.</p>";
        }

        const g = grouper();
        const ignorees = liste.famillesIgnorees
            .filter(i => i.motif === "droit")
            .map(i => i.f.pluriel);

        const rien = g.perimes.length === 0 && g.aDecider.length === 0 &&
            g.enCours.length === 0 && g.clos.length === 0;

        return (
            (ignorees.length > 0
                ? '<div class="apr-note">Votre profil ne lit pas ' + esc(ignorees.join(", ").toLowerCase()) +
                  " : ces objets ne sont pas comptés ci-dessous.</div>"
                : "") +
            // ⚠️ La péremption d'abord — avant même ce qui attend une décision.
            groupeHtml(
                "L'objet a changé depuis son approbation",
                "Ces décisions ont certifié une version qui n'est plus celle du contenu actuel. " +
                "Elles ne valent plus : le circuit doit repartir du début.",
                g.perimes, "apr-groupe--alerte") +
            groupeHtml(
                "En attente de votre décision",
                "Le circuit attend une étape que votre profil peut franchir.",
                g.aDecider, "apr-groupe--action") +
            groupeHtml(
                "En cours, chez quelqu'un d'autre",
                "Le circuit attend une étape qui ne relève pas de votre niveau sur ce domaine.",
                g.enCours, "") +
            groupeHtml(
                "Circuits clos",
                "Complets ou refusés pour la version actuelle. Modifier l'objet ouvrira un nouveau tour.",
                g.clos, "") +
            (g.inaccessibles.length > 0
                ? '<div class="apr-note" role="alert"><strong>' + esc(g.inaccessibles.length) +
                  " objet(s) n'ont pas pu être interrogés.</strong> Ils sont exclus des compteurs " +
                  "ci-dessus. Le premier motif rapporté : " +
                  esc((messageDErreur(g.inaccessibles[0].erreur) || {}).titre || "inconnu") + "</div>"
                : "") +
            (rien && g.inaccessibles.length === 0
                ? '<p class="chart-empty">Aucun circuit n\'est ouvert.</p>'
                : "")
        );
    }

    function rafraichirProgression() {
        const noeud = document.getElementById("approbationsProgression");
        if (noeud) {
            noeud.textContent = "Interrogation des circuits… " + liste.faits + " / " + liste.total;
        }
    }

    function rafraichirListe() {
        const noeud = document.getElementById("approbationsCorps");
        if (!noeud) return;
        noeud.innerHTML = listeCorpsHtml();
        brancherListe();
    }

    function brancherListe() {
        document.querySelectorAll("#approbationsCorps .apr-ligne").forEach(ligne => {
            const ouvrir = () => {
                // Relu au clic, dans le DOM : jamais capturé en chaîne.
                ouvrirFiche(ligne.dataset.entite, ligne.dataset.id);
            };
            ligne.addEventListener("click", ouvrir);
            ligne.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(); }
            });
        });
    }

    /* =====================================================================
       RENDU DES DEUX VUES
    ===================================================================== */

    function ouvrirFiche(entite, id) {
        vue = { mode: "fiche", entite: entite, id: id };
        fiche = { charge: null, encours: false, erreur: null, envoi: false, message: null };
        commentaireSaisi = "";
        render();
    }

    function ouvrirListe() {
        vue = { mode: "liste", entite: null, id: null };
        render();
    }

    function enteteHtml(titre, sousTitre, avecRetour) {
        return (
            '<div class="dashboard-header">' +
            "<div><h1>" + esc(titre) +
            (typeof Help !== "undefined" ? Help.tip(
                "Le circuit d'approbation répond à la question qu'un auditeur pose toujours : " +
                "« qui a validé cette politique, et quand ? ». Chaque décision est datée, " +
                "attribuée, inscrite au journal d'audit et IRRÉVERSIBLE. Elle fige l'empreinte " +
                "du contenu : si l'objet change ensuite, la décision cesse de valoir.") : "") +
            "</h1>" +
            '<p style="color: var(--text-muted); margin-top:5px;">' + esc(sousTitre) + "</p></div>" +
            (avecRetour
                ? '<div><button type="button" id="approbationsRetour" class="btn-secondary" ' +
                  'data-lecture="ok">← Toutes les approbations</button></div>'
                : "") +
            "</div>"
        );
    }

    function render() {
        const app = document.getElementById("app");
        if (!app) return;

        if (vue.mode === "fiche") {
            const f = famille(vue.entite);
            app.innerHTML =
                '<section class="page">' +
                enteteHtml(
                    "Circuit d'approbation",
                    (f === null ? "Objet" : f.singulier) + " · " + vue.id,
                    true) +
                '<div id="approbationsFiche"></div>' +
                "</section>";
            const retour = document.getElementById("approbationsRetour");
            if (retour) retour.addEventListener("click", () => ouvrirListe());
            chargerFiche(vue.entite, vue.id, "approbationsFiche");
            return;
        }

        app.innerHTML =
            '<section class="page">' +
            enteteHtml(
                "Approbations",
                "Qui a validé quoi, dans quelle version — politiques, risques et rapports d'audit.",
                false) +
            '<div id="approbationsCorps"></div>' +
            "</section>";
        composerListe();
    }

    /* =====================================================================
       ENCART POUR LES FICHES DOCUMENT / RISQUE / AUDIT
    ---------------------------------------------------------------------
       `js/modules/documents.js`, `risques.js` et `audits.js` n'appartiennent
       PAS au périmètre d'écriture de cet agent. Ces deux fonctions sont le
       point de couture : le gabarit insère `encartHtml`, puis appelle
       `brancherEncart` APRÈS `app.innerHTML = …` — l'ordre habituel du produit.

           html += ApprobationsModule.encartHtml("documents", doc.id);
           // … app.innerHTML = html; …
           ApprobationsModule.brancherEncart("documents", doc.id);

       `brancherEncart` est sans effet si le conteneur n'est pas dans le DOM :
       un appelant qui se trompe d'ordre n'obtient pas d'exception, il obtient
       un encart vide — visible, donc corrigeable.
    ===================================================================== */

    /** Identifiant du conteneur d'un encart. Un seul par fiche. */
    const ID_ENCART = "approbationsEncart";

    /**
     * Le bloc à insérer dans le gabarit d'une fiche Document / Risque / Audit.
     *
     * Rend une chaîne vide si l'entité n'est pas approuvable ou si le domaine
     * n'est pas lisible : un encart « accès refusé » sur chaque fiche
     * n'apprendrait rien et occuperait la place.
     */
    function encartHtml(entite, id) {
        const f = famille(entite);
        if (f === null || !id) return "";
        if (!peutLire(f.domaine)) return "";
        return (
            '<div class="card apr-encart" id="' + ID_ENCART + '" ' +
            'data-entite="' + esc(entite) + '" data-id="' + esc(id) + '">' +
            "<h2>Circuit d'approbation" +
            (typeof Help !== "undefined" ? Help.tip(
                "Qui a validé cette version, et quand. Une décision est irréversible et fige " +
                "l'empreinte du contenu : modifier l'objet la périme, et le circuit repart du " +
                "début. C'est ce qui permet de répondre « oui, et voici la preuve » à un auditeur.") : "") +
            "</h2>" +
            '<div id="' + ID_ENCART + 'Corps"><p class="chart-empty">Lecture du circuit…</p></div>' +
            "</div>"
        );
    }

    /**
     * Charge et branche l'encart, une fois le gabarit posé dans le DOM.
     *
     * ⚠️ L'entité et l'identifiant sont **relus dans les attributs du
     * conteneur** quand l'appelant ne les fournit pas : c'est la convention du
     * `CLAUDE.md` §3, et elle protège du cas où le serveur a réattribué
     * l'identifiant entre la composition du gabarit et son affichage.
     */
    function brancherEncart(entite, id) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const e = entite || noeud.dataset.entite;
        const i = id || noeud.dataset.id;
        if (!famille(e) || !i) return;
        fiche = { charge: null, encours: false, erreur: null, envoi: false, message: null };
        commentaireSaisi = "";
        chargerFiche(e, i, ID_ENCART + "Corps");
    }

    /**
     * Variante d'un seul appel, pour un appelant qui tient déjà le nœud.
     * Insère l'encart dans `conteneur` et le charge.
     */
    function monterDans(conteneur, entite, id) {
        const noeud = (typeof conteneur === "string")
            ? document.getElementById(conteneur) : conteneur;
        if (!noeud) return;
        noeud.innerHTML = encartHtml(entite, id);
        brancherEncart(entite, id);
    }

    return {
        // Le nom que `js/app.js` appelle, comme les 26 autres modules.
        renderList: render,
        render: render,

        // ── Couture pour les fiches hors périmètre (voir le bloc ci-dessus) ──
        encartHtml: encartHtml,
        brancherEncart: brancherEncart,
        monterDans: monterDans,
        // ⚠️ **Pas de `renderPour(entite, id)`**, et c'est délibéré. Le nom a été
        // proposé au cadrage de ce lot, mais aucune fonction d'ici n'a cette
        // signature : `encartHtml` rend une CHAÎNE (elle ne « rend » rien à
        // l'écran), et `monterDans` a besoin du conteneur en premier argument.
        // Un alias qui accepterait `(entite, id)` prendrait l'entité pour un
        // conteneur et ne monterait rien — en silence, puisque `monterDans`
        // renonce quand le nœud est introuvable. Mieux vaut un nom absent, qui
        // lève une TypeError, qu'un nom qui ment.

        // ── Exposés pour le banc d'essai ────────────────────────────────────
        //
        // La garde de décision se vérifie en APPELANT la fonction, jamais en
        // constatant qu'un bouton est absent : c'est exactement la distinction
        // que le constat Q-116 a coûtée — un essai qui mesurait une
        // substitution dans le navigateur, et non une barrière du serveur.
        decider: decider,
        lireCircuit: lireCircuit,
        peutValider: peutValider,
        ouvrirFiche: ouvrirFiche,

        contrat: Object.freeze({
            base: BASE,
            familles: FAMILLES.map(f => f.entite),
            etapes: Object.keys(ETAPES),
            parallele: PARALLELE
        })
    };
})();
