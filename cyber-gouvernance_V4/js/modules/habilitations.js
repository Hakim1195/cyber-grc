// Emplacement : js/modules/habilitations.js
// Nom du fichier : habilitations.js
//
// Écran « Habilitations » — l'administration du modèle de droits.
//
// ── CE QUE CET ÉCRAN EXISTE POUR FERMER ─────────────────────────────────────
//
// Le modèle de droits à trois axes — périmètre × profil × niveau — est construit
// depuis le lot L1. Il décide de chaque requête du produit, il est gardé par la
// RLS, il est éprouvé par le banc. Et **rien ne le montrait** : aucune route ne
// l'exposait, aucun écran ne le rendait, et la section « Administration » du menu
// ne portait qu'Imports, Journal et Paramètres.
//
// Autrement dit, le produit refusait des accès sans que personne puisse voir
// pourquoi. Utilisateur, 22/09/2026 : *« il n'y a aucune visibilité des droits,
// et surtout on ne peut pas gérer les droits »*.
//
// ⚠️ **Et ce n'est pas un écran de confort.** La matrice d'habilitations — qui a
// quoi, sur quel domaine, à quel niveau — est la pièce qu'un auditeur ISO 27001
// réclame au titre de l'A.5.18 (revue des droits d'accès). Ce produit détenait la
// donnée et ne savait pas la produire.
//
// ── LES QUATRE VUES, ET POURQUOI CE DÉCOUPAGE ───────────────────────────────
//
//  1. **Matrice** — trente domaines en LIGNES, les profils en COLONNES. Le sens
//     inverse était le premier réflexe et il est mauvais : trente colonnes ne
//     tiennent sur aucun écran ni sur aucune feuille, alors que trente lignes
//     groupées par section se lisent et s'impriment. C'est la vue de l'auditeur.
//  2. **Profil** — l'édition, dans un panneau : la matrice montre, le panneau
//     modifie. Mélanger les deux ferait d'un artefact d'audit un formulaire.
//  3. **Groupes d'annuaire** — la correspondance, et surtout le **contrôle de
//     cohérence** : quels groupes déclarés n'existent pas dans l'AD, et quels
//     groupes de l'AD n'accordent rien. C'est le constat Q-265 rendu visible.
//  4. **Comptes** — qui s'est connecté, et « que verrait ce compte ? ».
//
// ── ⚠️ CE QUE CET ÉCRAN NE FAIT PAS, ET NE FERA JAMAIS ─────────────────────
//
// 🛑 **Il n'écrit pas dans l'Active Directory.** Arbitrage de l'utilisateur du
// 22/09/2026, et c'est une **capacité absente** côté serveur : aucune opération
// d'écriture LDAP n'existe dans le produit. Ce que l'écran rend pour l'annuaire,
// c'est une **liste à créer**, que l'administrateur exécute lui-même. Même
// discipline qu'à l'action 20.2 — le bouton dit « préparer », jamais « déclarer ».
//
// ⚠️ **Il ne calcule aucun droit.** Les niveaux, le cumul, la résolution : tout
// vient du serveur, qui emploie les fonctions de la connexion. Un écran
// d'administration qui afficherait un droit que le produit n'applique pas serait
// pire qu'un écran absent (constat Q-219).
//
// ⚠️ **Il DIT que l'effet est différé.** Les droits sont résolus à la connexion
// et figés dans la session : une modification ne s'applique qu'à la prochaine
// connexion des personnes concernées. Sans ce rappel, un administrateur croit
// avoir fermé un accès qui reste ouvert — c'est la classe des faux bandeaux
// (constats Q-201 / Q-207), dans le sens le plus coûteux.

const HabilitationsModule = (() => {
    "use strict";

    const DOMAINE = "administration";

    /** L'état servi par `GET /api/habilitations/etat`, mémorisé entre deux rendus. */
    let etat = null;
    /** Le verdict de cohérence, chargé à la demande : il sort sur le réseau. */
    let coherence = null;
    /** Le résultat de la dernière simulation. */
    let simulation = null;
    /** Les revues des droits d'accès, et celle qui est dépliée. */
    let revues = null;
    let revueOuverte = null;
    /** Identifiant du profil ouvert dans le panneau d'édition. */
    let profilOuvert = null;

    const esc = (v) => (window.escapeHtml || ((x) => String(x == null ? "" : x)))(v);

    /* =====================================================================
       LES CINQ NIVEAUX — ET POURQUOI ILS NE PRENNENT PAS LES COULEURS
       SÉMANTIQUES DE LA CHARTE

       La charte réserve vert / orange / rouge / gris aux STATUTS de conformité
       (`CLAUDE.md` §2, « sémantique stricte »). Un niveau de droit n'est pas un
       statut : « lecture » n'est pas « partiellement conforme », et
       « administration » n'est pas « critique ». Employer la même palette ferait
       lire un tableau de droits comme un tableau de risques.

       La graduation est donc une **rampe d'intensité** du bleu de structure —
       le même axe visuel que la hiérarchie du produit —, et « aucun » porte une
       marque à part : c'est une fermeture EXPLICITE, pas un degré faible, et
       c'est précisément ce que la base veut rendre lisible en revue de droits.
    ===================================================================== */
    const NIVEAUX = Object.freeze([
        { code: "aucun", libelle: "Aucun", abrege: "—",
          aide: "Domaine fermé EXPLICITEMENT. Se relit en revue de droits, là où une "
              + "absence ne se relit pas." },
        { code: "lecture", libelle: "Lecture", abrege: "L",
          aide: "Consulter, sans rien modifier." },
        { code: "contribution", libelle: "Contribution", abrege: "C",
          aide: "Créer et modifier les enregistrements du domaine." },
        { code: "validation", libelle: "Validation", abrege: "V",
          aide: "Contribuer, et décider dans les circuits d'approbation." },
        { code: "administration", libelle: "Administration", abrege: "A",
          aide: "Tout, y compris le paramétrage du domaine." }
    ]);

    const NIVEAU_PAR_CODE = {};
    NIVEAUX.forEach((n) => { NIVEAU_PAR_CODE[n.code] = n; });

    /** La cellule d'un niveau : une pastille graduée, pas une couleur de statut. */
    function pastille(code) {
        const n = NIVEAU_PAR_CODE[code];
        if (!n) return '<span class="hab-niv hab-niv--vide" title="Domaine non ouvert">·</span>';
        return '<span class="hab-niv hab-niv--' + esc(code) + '" title="'
             + esc(n.libelle + " — " + n.aide) + '">' + esc(n.abrege) + "</span>";
    }

    /* =====================================================================
       LE CHARGEMENT
    ===================================================================== */

    async function charger() {
        etat = await Api.habilitationsEtat();
        return etat;
    }

    /** Recharge puis redessine. Appelé après chaque écriture. */
    async function rafraichir(vue) {
        await charger();
        vue();
    }

    function sansDroit(app) {
        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({ titre: "Habilitations" })
            + '<div class="card"><p class="muted">Cet écran est réservé à '
            + "l’administration de l’application.</p></div></section>";
    }

    /** Affiche l'erreur telle que le serveur la formule — jamais une reformulation. */
    function echec(app, erreur, onglets) {
        const message = (erreur && erreur.message)
            ? erreur.message
            : "Le serveur n’a pas répondu.";
        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({ titre: "Habilitations", onglets: onglets })
            + '<div class="card"><p class="muted">' + esc(message) + "</p></div></section>";
    }

    function avertir(message, ton) {
        if (window.showToast) showToast(message, ton || "info");
    }

    /**
     * Ce que toute écriture rappelle.
     *
     * ⚠️ Le texte vient du SERVEUR (`RAPPEL_PROCHAINE_CONNEXION`) : le recopier
     * ici en ferait une seconde rédaction, et le jour où la règle change, l'écran
     * continuerait d'annoncer l'ancienne (constat Q-219).
     */
    function rappelDe(reponse) {
        return (reponse && typeof reponse.rappel === "string") ? reponse.rappel : "";
    }

    /* =====================================================================
       VUE 1 — LA MATRICE
    ===================================================================== */

    async function renderMatrice() {
        const app = document.getElementById("app");
        const onglets = UI.ongletsDe("/habilitations");
        try { await charger(); } catch (e) { return echec(app, e, onglets); }
        if (!etat) return sansDroit(app);

        const profils = etat.profils.slice().sort((a, b) => {
            if (a.socle !== b.socle) return a.socle ? -1 : 1;
            return String(a.code).localeCompare(String(b.code), "fr");
        });

        // Les domaines, groupés par section du menu. Le groupe vient du SERVEUR :
        // une seconde table de rattachement ici divergerait au premier domaine
        // ajouté, et personne ne le verrait.
        const sections = [];
        etat.domaines.forEach((d) => {
            let s = sections.find((x) => x.nom === d.groupe);
            if (!s) { s = { nom: d.groupe, domaines: [] }; sections.push(s); }
            s.domaines.push(d);
        });

        const entetes = profils.map((p) =>
            '<th scope="col" class="hab-col"><button type="button" class="hab-col-btn" '
            + 'data-profil="' + esc(p.id) + '" title="Modifier ce profil">'
            + "<span>" + esc(p.code) + "</span>"
            + (p.socle ? '<span class="hab-socle" title="Profil livré avec le produit : non supprimable">socle</span>' : "")
            + (p.actif ? "" : '<span class="hab-inactif" title="Profil désactivé : il n’accorde plus rien">inactif</span>')
            + "</button></th>").join("");

        let lignes = "";
        sections.forEach((s) => {
            lignes += '<tr class="hab-section"><th scope="rowgroup" colspan="' + (profils.length + 1)
                   + '">' + esc(s.nom) + "</th></tr>";
            s.domaines.forEach((d) => {
                lignes += '<tr><th scope="row" class="hab-dom">' + esc(d.libelle)
                       + '<span class="hab-code">' + esc(d.code) + "</span>"
                       + (d.domaineApi === null
                            ? '<span class="hab-orphelin" title="Ce domaine n’ouvre aucune route : '
                              + 'il se paramètre, mais la décision d’accès se prend ailleurs.">hors décision</span>'
                            : "")
                       + "</th>";
                profils.forEach((p) => {
                    const niveau = p.domaines[d.code];
                    lignes += '<td class="t-centre">'
                           + (niveau === undefined
                                ? '<span class="hab-niv hab-niv--vide" title="Domaine non ouvert : il est refusé.">·</span>'
                                : pastille(niveau))
                           + "</td>";
                });
                lignes += "</tr>";
            });
        });

        const legende = NIVEAUX.map((n) =>
            '<span class="hab-lg">' + pastille(n.code) + esc(n.libelle) + "</span>").join("")
            + '<span class="hab-lg"><span class="hab-niv hab-niv--vide">·</span>'
            + "Domaine non ouvert</span>";

        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({
                titre: "Habilitations",
                onglets: onglets,
                aide: Help.tip(
                    "Qui a le droit de faire quoi, domaine par domaine. Les droits viennent de "
                  + "l’annuaire : un compte hérite des profils portés par ses groupes, et les "
                  + "niveaux se cumulent AU PLUS FAVORABLE. Cette matrice est la pièce qu’un "
                  + "auditeur ISO 27001 demande au titre de l’A.5.18."),
                contexte: "Trente domaines fonctionnels, cinq niveaux. Cliquez l’en-tête d’une "
                        + "colonne pour modifier le profil correspondant.",
                actions: '<button type="button" id="habNouveauProfil">Nouveau profil</button>'
                       + '<button type="button" id="habImprimer" class="btn-secondary">Imprimer la matrice</button>'
            })
            + encartEffetDiffere()
            + (etat.tronque.profils
                ? '<div class="card encart-alerte"><p>La liste des profils est TRONQUÉE : '
                  + "le verdict ci-dessous est incomplet.</p></div>"
                : "")
            + '<div class="card">'
            +   '<div class="hab-legende no-print">' + legende + "</div>"
            +   '<div class="table-scroll">'
            +     '<table class="data-table hab-matrice"><thead><tr>'
            +       '<th scope="col" class="hab-dom">Domaine fonctionnel</th>' + entetes
            +     "</tr></thead><tbody>" + lignes + "</tbody></table>"
            +   "</div>"
            + "</div>"
            + (profilOuvert ? panneauProfil(profils.find((p) => p.id === profilOuvert)) : "")
            + "</section>";

        brancherMatrice();
    }

    /**
     * L'encart qui dit que l'effet est différé.
     *
     * ⚠️ Il est **permanent**, pas conditionné à une écriture récente : quelqu'un
     * qui ouvre cet écran pour fermer un accès en urgence doit le savoir AVANT de
     * cliquer, pas après.
     */
    function encartEffetDiffere() {
        return '<div class="card encart-alerte encart-info"><p>'
            + "<strong>Les droits sont résolus à la connexion.</strong> Une modification faite "
            + "ici ne s’appliquera aux personnes concernées qu’à leur <strong>prochaine "
            + "connexion</strong> : leur session en cours garde les droits qu’elle a reçus. "
            + "Pour un effet immédiat, il faut révoquer leurs sessions."
            + "</p></div>";
    }

    function brancherMatrice() {
        document.querySelectorAll(".hab-col-btn").forEach((b) => {
            b.addEventListener("click", () => {
                profilOuvert = b.dataset.profil;
                renderMatrice();
            });
        });
        const imprimer = document.getElementById("habImprimer");
        if (imprimer) imprimer.addEventListener("click", () => window.print());

        const nouveau = document.getElementById("habNouveauProfil");
        if (nouveau) nouveau.addEventListener("click", () => { profilOuvert = "__nouveau__"; renderMatrice(); });

        brancherPanneauProfil();
    }

    /* =====================================================================
       LE PANNEAU D'ÉDITION D'UN PROFIL
    ===================================================================== */

    function panneauProfil(profil) {
        const creation = profilOuvert === "__nouveau__";
        if (!creation && !profil) return "";
        const p = creation
            ? { id: "", code: "", nom: "", description: "", niveauDefaut: "lecture",
                socle: false, actif: true, version: 0, domaines: {}, groupesPorteurs: 0 }
            : profil;

        const options = (choisi) => NIVEAUX.map((n) =>
            '<option value="' + esc(n.code) + '"' + (n.code === choisi ? " selected" : "") + ">"
            + esc(n.libelle) + "</option>").join("");

        const sections = [];
        etat.domaines.forEach((d) => {
            let s = sections.find((x) => x.nom === d.groupe);
            if (!s) { s = { nom: d.groupe, domaines: [] }; sections.push(s); }
            s.domaines.push(d);
        });

        let grille = "";
        sections.forEach((s) => {
            grille += '<fieldset class="hab-fs"><legend>' + esc(s.nom) + "</legend>";
            s.domaines.forEach((d) => {
                const courant = p.domaines[d.code];
                grille += '<label class="hab-champ"><span>' + esc(d.libelle) + "</span>"
                       + '<select data-domaine="' + esc(d.code) + '">'
                       + '<option value="">Non ouvert</option>'
                       + options(courant === undefined ? null : courant)
                       + "</select></label>";
            });
            grille += "</fieldset>";
        });

        return '<div class="card hab-panneau" id="habPanneauProfil">'
            + "<h2>" + (creation ? "Nouveau profil" : "Profil " + esc(p.code)) + "</h2>"
            + (p.socle
                ? '<p class="hab-note">Ce profil est <strong>livré avec le produit</strong> : '
                  + "il ne se supprime pas. Vous pouvez le modifier — un déploiement ajuste "
                  + "légitimement ce que son RSSI voit — ou le désactiver.</p>"
                : "")
            + (p.groupesPorteurs > 0
                ? '<p class="hab-note">Attribué par <strong>' + esc(p.groupesPorteurs)
                  + "</strong> groupe(s) d’annuaire actif(s).</p>"
                : "")
            + '<div class="form-grid">'
            +   '<label class="hab-champ"><span>Code' + Help.tip(
                    "Majuscules, chiffres et tirets bas, 2 à 20 caractères. C’est le SUFFIXE du "
                  + "groupe d’annuaire (GRC-<FILIALE>-<CODE>) : la convention de nommage doit "
                  + "rester vérifiable.") + "</span>"
            +     '<input type="text" id="habProfilCode" value="' + esc(p.code) + '"'
            +       (creation ? "" : " disabled") + ' maxlength="20"></label>'
            +   '<label class="hab-champ"><span>Intitulé</span>'
            +     '<input type="text" id="habProfilNom" value="' + esc(p.nom) + '" maxlength="200"></label>'
            +   '<label class="hab-champ"><span>Niveau par défaut' + Help.tip(
                    "Appliqué aux domaines du profil qui ne fixent pas le leur.") + "</span>"
            +     '<select id="habProfilNiveau">' + options(p.niveauDefaut) + "</select></label>"
            +   '<label class="hab-champ hab-champ--case"><input type="checkbox" id="habProfilActif"'
            +     (p.actif ? " checked" : "") + "><span>Profil actif</span></label>"
            + "</div>"
            + '<label class="hab-champ"><span>Description</span>'
            +   '<textarea id="habProfilDescription" rows="2" maxlength="2000">'
            +   esc(p.description || "") + "</textarea></label>"
            + "<h3>Domaines" + Help.tip(
                "« Non ouvert » refuse le domaine par omission ; « Aucun » le ferme "
              + "EXPLICITEMENT. Les deux refusent — mais seul le second se relit en revue de "
              + "droits, et c’est pour cela que la base les distingue.") + "</h3>"
            + '<div class="hab-grille">' + grille + "</div>"
            + '<div class="page-actions no-print">'
            +   '<button type="button" id="habProfilEnregistrer">Enregistrer</button>'
            +   '<button type="button" id="habProfilFermer" class="btn-secondary">Fermer</button>'
            +   (creation || p.socle ? ""
                 : '<button type="button" id="habProfilSupprimer" class="btn-danger">Supprimer</button>')
            + "</div></div>";
    }

    function brancherPanneauProfil() {
        const panneau = document.getElementById("habPanneauProfil");
        if (!panneau) return;

        const fermer = document.getElementById("habProfilFermer");
        if (fermer) fermer.addEventListener("click", () => { profilOuvert = null; renderMatrice(); });

        const enregistrer = document.getElementById("habProfilEnregistrer");
        if (enregistrer) enregistrer.addEventListener("click", async () => {
            const creation = profilOuvert === "__nouveau__";
            const profil = creation ? null : etat.profils.find((x) => x.id === profilOuvert);

            const corps = {
                code: (document.getElementById("habProfilCode").value || "").trim().toUpperCase(),
                nom: (document.getElementById("habProfilNom").value || "").trim(),
                description: (document.getElementById("habProfilDescription").value || "").trim(),
                niveauDefaut: document.getElementById("habProfilNiveau").value,
                actif: document.getElementById("habProfilActif").checked
            };
            if (corps.nom === "") { avertir("Donnez un intitulé au profil.", "warning"); return; }

            // La grille est lue AVANT toute écriture : si le profil est créé puis
            // que la grille échoue, on laisse un profil sans droits — visible et
            // réparable —, jamais un profil à moitié écrit.
            const grille = {};
            panneau.querySelectorAll("select[data-domaine]").forEach((s) => {
                if (s.value !== "") grille[s.dataset.domaine] = s.value;
            });

            enregistrer.disabled = true;
            try {
                let id;
                if (creation) {
                    const r = await Api.creerProfilHabilitation(corps);
                    id = r.id;
                } else {
                    corps.version = profil.version;
                    await Api.modifierProfilHabilitation(profil.id, corps);
                    id = profil.id;
                }
                const r2 = await Api.poserGrilleHabilitation(id, grille);
                profilOuvert = id;
                avertir(creation ? "Profil créé. " + rappelDe(r2) : "Profil enregistré. " + rappelDe(r2),
                        "success");
                await renderMatrice();
            } catch (e) {
                // ⚠️ Le message du SERVEUR, mot pour mot : c'est lui qui connaît la
                // raison du refus — verrou d'administrabilité, conflit de version,
                // code hors convention. Le reformuler ici en perdrait la moitié.
                avertir(e && e.message ? e.message : "Enregistrement refusé.", "error");
                enregistrer.disabled = false;
            }
        });

        const supprimer = document.getElementById("habProfilSupprimer");
        if (supprimer) supprimer.addEventListener("click", async () => {
            const profil = etat.profils.find((x) => x.id === profilOuvert);
            if (!profil) return;
            if (!window.confirm("Supprimer le profil « " + profil.code + " » ? Les comptes qui "
                + "le portent perdront les droits qu’il accorde, à leur prochaine connexion.")) return;
            try {
                await Api.supprimerProfilHabilitation(profil.id);
                profilOuvert = null;
                avertir("Profil supprimé.", "success");
                await renderMatrice();
            } catch (e) {
                avertir(e && e.message ? e.message : "Suppression refusée.", "error");
            }
        });
    }

    /* =====================================================================
       VUE 2 — LES GROUPES D'ANNUAIRE ET LA COHÉRENCE
    ===================================================================== */

    async function renderGroupes() {
        const app = document.getElementById("app");
        const onglets = UI.ongletsDe("/habilitations-groupes");
        try { await charger(); } catch (e) { return echec(app, e, onglets); }
        if (!etat) return sansDroit(app);

        const lignes = etat.groupes.map((g) => {
            const accorde = [];
            if (g.profilNom) accorde.push(esc(g.profilNom));
            if (g.accordeExport) accorde.push("<em>droit d’export</em>");
            if (g.accordeAdmin) accorde.push("<em>administration</em>");
            return '<tr data-groupe="' + esc(g.id) + '" class="' + (g.actif ? "" : "hab-ligne-inactive") + '">'
                + "<td><strong>" + esc(g.nom) + "</strong></td>"
                + "<td>" + esc(portee(g.perimetre)) + "</td>"
                + "<td>" + (g.filialeCode
                    ? esc(g.filialeCode) + ' <span class="hab-code">' + esc(g.filialeRaisonSociale || "") + "</span>"
                    : '<span class="hab-code">toutes</span>') + "</td>"
                + "<td>" + (accorde.length ? accorde.join(", ") : '<span class="hab-code">rien</span>') + "</td>"
                + '<td class="t-centre">' + (g.profilId
                    ? esc(g.domainesOuverts) + " dom. · " + pastille(g.niveauMax)
                    : '<span class="hab-code">—</span>') + "</td>"
                + '<td class="t-centre">' + (g.actif
                    ? '<span class="hab-actif">actif</span>'
                    : '<span class="hab-inactif">inactif</span>') + "</td>"
                + '<td class="t-centre stop-row-click">'
                + '<button type="button" class="hab-bascule btn-secondary" data-groupe="'
                + esc(g.id) + '" data-version="' + esc(g.version) + '" data-actif="'
                + (g.actif ? "1" : "0") + '">'
                + (g.actif ? "Désactiver" : "Réactiver") + "</button></td>"
                + "</tr>";
        }).join("");

        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({
                titre: "Habilitations",
                onglets: onglets,
                aide: Help.tip(
                    "Un groupe d’annuaire accorde un périmètre et un profil. Un groupe ABSENT de "
                  + "cette table n’accorde rien, même s’il existe dans l’annuaire — et un groupe "
                  + "déclaré ici mais absent de l’annuaire n’accorde rien non plus."),
                contexte: "La correspondance entre les groupes de l’Active Directory et ce que "
                        + "le produit en fait.",
                actions: '<button type="button" id="habSynchroniser">Synchroniser la déclaration</button>'
                       + '<button type="button" id="habVerifierAd" class="btn-secondary">Vérifier l’annuaire</button>'
                       + '<button type="button" id="habNouveauGroupe" class="btn-secondary">Déclarer un groupe</button>'
            })
            + encartJamaisDEcritureAd()
            + '<div id="habCoherence">' + (coherence ? encartCoherence(coherence) : "") + "</div>"
            + '<div id="habFormGroupe"></div>'
            + '<div class="card">'
            +   (etat.groupes.length === 0
                 ? '<p class="muted">Aucun groupe d’annuaire n’est déclaré. Tant que cette '
                   + "table est vide, <strong>personne ne peut se connecter</strong> : les droits "
                   + "viennent de l’annuaire, et c’est cette correspondance qui les traduit. "
                   + "« Synchroniser la déclaration » engendre les groupes attendus.</p>"
                 : '<div class="table-scroll"><table class="data-table"><thead><tr>'
                   + "<th>Groupe d’annuaire</th><th>Périmètre</th><th>Filiale</th>"
                   + "<th>Accorde</th><th>Domaines ouverts</th><th>État</th><th></th>"
                   + "</tr></thead><tbody>" + lignes + "</tbody></table></div>")
            + "</div></section>";

        brancherGroupes();
    }

    function portee(code) {
        if (code === "filiale") return "Une filiale";
        if (code === "groupe") return "Groupe entier";
        return "Transversal";
    }

    /**
     * 🛑 L'encart qui dit ce que le produit NE FAIT PAS.
     *
     * Il est affiché en permanence, et c'est délibéré : un administrateur
     * d'annuaire qui découvre cet écran doit savoir immédiatement que l'outil ne
     * touchera pas à son AD. C'est la condition pour qu'il accepte le
     * déploiement, et c'est l'arbitrage de l'utilisateur du 22/09/2026.
     */
    function encartJamaisDEcritureAd() {
        return '<div class="card encart-alerte encart-info"><p>'
            + "<strong>Ce logiciel n’écrit jamais dans l’Active Directory.</strong> Il le lit, "
            + "compare ce qu’il y trouve à ce qu’il attend, et vous rend la liste des groupes à "
            + "créer. La création se fait dans l’annuaire, par son administrateur. "
            + "« Synchroniser la déclaration » écrit dans <em>ce produit</em>, pas dans l’annuaire."
            + "</p></div>";
    }

    function listeEcarts(titre, items, ton, explication) {
        if (!items || items.length === 0) return "";
        return '<div class="hab-ecart hab-ecart--' + esc(ton) + '">'
            + "<h3>" + esc(titre) + " <span>(" + esc(items.length) + ")</span></h3>"
            + "<p>" + esc(explication) + "</p>"
            + "<ul>" + items.map((x) => "<li><code>" + esc(typeof x === "string" ? x : x.nom)
                + "</code>" + (typeof x === "string" ? "" : " — " + esc(x.description || ""))
                + "</li>").join("") + "</ul></div>";
    }

    function encartCoherence(c) {
        if (!c.annuaireDisponible) {
            return '<div class="card encart-alerte"><p><strong>L’annuaire n’est pas '
                + "configuré sur ce déploiement</strong> (<code>AUTH_LDAP_ACTIF=non</code>). "
                + "Le produit ne peut donc rien comparer : il attend "
                + esc(c.comptes.attendus) + " groupe(s) et en a "
                + esc(c.comptes.declares) + " de déclaré(s), mais il n’a lu "
                + "<strong>aucun</strong> groupe réel. Un verdict rendu sans avoir lu l’annuaire "
                + "serait faux dans le sens rassurant.</p></div>";
        }
        if (c.tronque) {
            return '<div class="card encart-alerte"><p><strong>La lecture de l’annuaire a été '
                + "tronquée</strong> : le verdict serait faux dans le sens rassurant — un groupe "
                + "au-delà de la borne apparaîtrait « absent de l’annuaire ». Restreignez la base "
                + "de recherche LDAP avant de conclure.</p></div>";
        }

        const rien = c.declaresSansAnnuaire.length === 0
                  && c.annuaireSansDeclaration.length === 0
                  && c.attendusSansDeclaration.length === 0
                  && c.aCreerDansAnnuaire.length === 0;

        return '<div class="card">'
            + "<h2>Cohérence annuaire ↔ application</h2>"
            + "<p>Préfixe <code>" + esc(c.prefixe) + "</code> — "
            + esc(c.comptes.attendus) + " attendu(s), " + esc(c.comptes.declares)
            + " déclaré(s), " + esc(c.comptes.reels) + " lu(s) dans l’annuaire.</p>"
            + (rien ? '<p class="hab-ok">Les trois listes concordent.</p>' : "")
            + listeEcarts("Déclarés ici, INTROUVABLES dans l’annuaire",
                c.declaresSansAnnuaire, "grave",
                "C’est l’écart le plus coûteux : un compte de ce groupe entre dans le produit, "
              + "n’obtient AUCUN droit, et le seul symptôme est quelqu’un qui dit « je ne vois "
              + "rien ». Créez le groupe dans l’annuaire, ou désactivez-le ici.")
            + listeEcarts("À créer dans l’annuaire", c.aCreerDansAnnuaire, "action",
                "Attendus par la convention de nommage et absents de l’annuaire. Le produit ne "
              + "les crée pas : `bash deploy/groupes-ad.sh --powershell` engendre le script à "
              + "exécuter par l’administrateur de l’annuaire.")
            + listeEcarts("À déclarer dans l’application", c.attendusSansDeclaration, "action",
                "Attendus par la convention et absents de cette table. « Synchroniser la "
              + "déclaration » les ajoute.")
            + listeEcarts("Présents dans l’annuaire, non déclarés ici",
                c.annuaireSansDeclaration, "info",
                "Ils n’accordent rien. C’est peut-être voulu — un groupe hérité, une autre "
              + "application — ou le signe d’une faute de frappe dans un nom.")
            + "</div>";
    }

    function brancherGroupes() {
        const sync = document.getElementById("habSynchroniser");
        if (sync) sync.addEventListener("click", async () => {
            sync.disabled = true;
            try {
                const r = await Api.synchroniserGroupesAd();
                avertir(r.crees.length + " groupe(s) déclaré(s), " + r.presents.length
                      + " déjà présent(s)"
                      + (r.inattendus.length ? ", " + r.inattendus.length
                         + " hors convention (conservés, jamais effacés)" : "") + ".", "success");
                await renderGroupes();
            } catch (e) {
                avertir(e && e.message ? e.message : "Synchronisation refusée.", "error");
                sync.disabled = false;
            }
        });

        const verifier = document.getElementById("habVerifierAd");
        if (verifier) verifier.addEventListener("click", async () => {
            verifier.disabled = true;
            verifier.textContent = "Lecture de l’annuaire…";
            try {
                coherence = await Api.coherenceAnnuaire();
                document.getElementById("habCoherence").innerHTML = encartCoherence(coherence);
            } catch (e) {
                avertir(e && e.message ? e.message : "L’annuaire n’a pas répondu.", "error");
            } finally {
                verifier.disabled = false;
                verifier.textContent = "Vérifier l’annuaire";
            }
        });

        document.querySelectorAll(".hab-bascule").forEach((b) => {
            b.addEventListener("click", async () => {
                // ⚠️ L'identifiant se lit dans l'attribut AU MOMENT DU CLIC, jamais
                // capturé en fermeture (`CLAUDE.md` §3).
                const id = b.dataset.groupe;
                const version = Number(b.dataset.version);
                const actif = b.dataset.actif !== "1";
                try {
                    const r = await Api.modifierGroupeAd(id, { actif: actif, version: version });
                    avertir((actif ? "Groupe réactivé. " : "Groupe désactivé. ") + rappelDe(r),
                            "success");
                    await renderGroupes();
                } catch (e) {
                    avertir(e && e.message ? e.message : "Modification refusée.", "error");
                }
            });
        });

        const nouveau = document.getElementById("habNouveauGroupe");
        if (nouveau) nouveau.addEventListener("click", () => {
            const hote = document.getElementById("habFormGroupe");
            hote.innerHTML = formGroupe();
            brancherFormGroupe();
            hote.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    }

    function formGroupe() {
        const filiales = etat.filiales.map((f) =>
            '<option value="' + esc(f.id) + '">' + esc(f.code) + " — " + esc(f.raisonSociale)
            + "</option>").join("");
        const profils = etat.profils.filter((p) => p.actif).map((p) =>
            '<option value="' + esc(p.id) + '">' + esc(p.code) + " — " + esc(p.nom)
            + "</option>").join("");
        return '<div class="card hab-panneau">'
            + "<h2>Déclarer un groupe d’annuaire</h2>"
            + "<p class=\"hab-note\">À employer quand l’annuaire porte déjà des groupes qui ne "
            + "suivent pas la convention de nommage du produit. Le groupe doit <strong>exister "
            + "dans l’annuaire</strong> : le produit ne le crée pas.</p>"
            + '<div class="form-grid">'
            +   '<label class="hab-champ"><span>Nom exact dans l’annuaire</span>'
            +     '<input type="text" id="habGrNom" maxlength="256" placeholder="SEC-TOULOUSE-RSSI"></label>'
            +   '<label class="hab-champ"><span>Périmètre</span><select id="habGrPortee">'
            +     '<option value="filiale">Une filiale</option>'
            +     '<option value="groupe">Groupe entier</option>'
            +     '<option value="transversal">Transversal (export / administration)</option>'
            +   "</select></label>"
            +   '<label class="hab-champ" id="habGrFilialeChamp"><span>Filiale</span>'
            +     '<select id="habGrFiliale">' + filiales + "</select></label>"
            +   '<label class="hab-champ" id="habGrProfilChamp"><span>Profil</span>'
            +     '<select id="habGrProfil">' + profils + "</select></label>"
            +   '<label class="hab-champ hab-champ--case" id="habGrExportChamp" hidden>'
            +     '<input type="checkbox" id="habGrExport"><span>Accorde le droit d’export</span></label>'
            +   '<label class="hab-champ hab-champ--case" id="habGrAdminChamp" hidden>'
            +     '<input type="checkbox" id="habGrAdmin"><span>Accorde l’administration</span></label>'
            + "</div>"
            + '<label class="hab-champ"><span>Description</span>'
            +   '<input type="text" id="habGrDescription" maxlength="2000"></label>'
            + '<div class="page-actions no-print">'
            +   '<button type="button" id="habGrEnregistrer">Déclarer</button>'
            +   '<button type="button" id="habGrAnnuler" class="btn-secondary">Annuler</button>'
            + "</div></div>";
    }

    function brancherFormGroupe() {
        const portee = document.getElementById("habGrPortee");
        const majChamps = () => {
            const v = portee.value;
            document.getElementById("habGrFilialeChamp").hidden = v !== "filiale";
            document.getElementById("habGrProfilChamp").hidden = v === "transversal";
            document.getElementById("habGrExportChamp").hidden = v !== "transversal";
            document.getElementById("habGrAdminChamp").hidden = v !== "transversal";
        };
        portee.addEventListener("change", majChamps);
        majChamps();

        document.getElementById("habGrAnnuler").addEventListener("click", () => {
            document.getElementById("habFormGroupe").innerHTML = "";
        });

        document.getElementById("habGrEnregistrer").addEventListener("click", async () => {
            const v = portee.value;
            const corps = {
                nom: (document.getElementById("habGrNom").value || "").trim(),
                perimetre: v,
                description: (document.getElementById("habGrDescription").value || "").trim()
            };
            if (v === "filiale") corps.filialeId = document.getElementById("habGrFiliale").value;
            if (v !== "transversal") corps.profilId = document.getElementById("habGrProfil").value;
            if (v === "transversal") {
                corps.accordeExport = document.getElementById("habGrExport").checked;
                corps.accordeAdmin = document.getElementById("habGrAdmin").checked;
            }
            if (corps.nom === "") { avertir("Donnez le nom exact du groupe.", "warning"); return; }
            try {
                const r = await Api.creerGroupeAd(corps);
                avertir("Groupe déclaré. " + rappelDe(r), "success");
                document.getElementById("habFormGroupe").innerHTML = "";
                await renderGroupes();
            } catch (e) {
                avertir(e && e.message ? e.message : "Déclaration refusée.", "error");
            }
        });
    }

    /* =====================================================================
       VUE 3 — LES COMPTES, ET « QUE VERRAIT CE COMPTE ? »
    ===================================================================== */

    async function renderComptes() {
        const app = document.getElementById("app");
        const onglets = UI.ongletsDe("/habilitations-comptes");
        try { await charger(); } catch (e) { return echec(app, e, onglets); }
        if (!etat) return sansDroit(app);

        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({
                titre: "Habilitations",
                onglets: onglets,
                aide: Help.tip(
                    "Les comptes connus du produit. Un compte n’existe ici qu’à partir de sa "
                  + "PREMIÈRE connexion : le produit ne recopie pas l’annuaire, il le lit."),
                contexte: "Qui s’est connecté, et ce qu’un compte obtiendrait.",
                actions: ""
            })
            + '<div class="card hab-panneau">'
            +   "<h2>Que verrait ce compte ?" + Help.tip(
                    "Le produit lit l’annuaire pour ce login, résout ses groupes — imbrications "
                  + "comprises —, et affiche le périmètre, le profil et les trente domaines qu’il "
                  + "obtiendrait. Aucun mot de passe n’est demandé, et rien n’est écrit.") + "</h2>"
            +   '<div class="hab-simu-form">'
            +     '<input type="text" id="habSimuLogin" placeholder="login (sAMAccountName)" maxlength="256">'
            +     '<button type="button" id="habSimuLancer">Simuler</button>'
            +   "</div>"
            +   '<div id="habSimuResultat">' + (simulation ? resultatSimulation(simulation) : "") + "</div>"
            + "</div>"
            + '<div class="card">'
            +   (etat.comptes.length === 0
                 ? '<p class="muted">Aucun compte ne s’est encore connecté.</p>'
                 : '<div class="table-scroll"><table class="data-table"><thead><tr>'
                   + "<th>Identifiant</th><th>Nom</th><th>Courriel</th><th>Filiale par défaut</th>"
                   + "<th>Dernière connexion</th><th>État</th><th></th>"
                   + "</tr></thead><tbody>" + lignesComptes() + "</tbody></table></div>")
            +   (etat.tronque.comptes
                 ? '<p class="hab-note">La liste est bornée : tous les comptes ne sont pas affichés.</p>'
                 : "")
            + "</div></section>";

        brancherComptes();
    }

    function lignesComptes() {
        return etat.comptes.map((c) =>
            '<tr class="' + (c.actif ? "" : "hab-ligne-inactive") + '">'
            + "<td><strong>" + esc(c.identifiant) + "</strong>"
            + (c.compteSecours
                ? ' <span class="hab-socle" title="Compte de secours, hors annuaire">secours</span>'
                : "")
            + "</td>"
            + "<td>" + esc(c.nomAffichage) + "</td>"
            + "<td>" + (c.email ? esc(c.email) : '<span class="hab-code">—</span>') + "</td>"
            + "<td>" + (c.filialeDefautCode ? esc(c.filialeDefautCode)
                                            : '<span class="hab-code">—</span>') + "</td>"
            + "<td>" + (c.derniereConnexion ? esc(I18n.date(c.derniereConnexion))
                                            : '<span class="hab-code">jamais</span>') + "</td>"
            + '<td class="t-centre">'
            + (c.verrouille ? '<span class="hab-inactif">verrouillé</span>'
               : c.actif ? '<span class="hab-actif">actif</span>'
               : '<span class="hab-inactif">inactif</span>') + "</td>"
            + '<td class="t-centre stop-row-click">'
            + '<button type="button" class="hab-simuler btn-secondary" data-login="'
            + esc(c.identifiant) + '">Simuler</button></td></tr>').join("");
    }

    function resultatSimulation(s) {
        if (!s.trouve) {
            return '<div class="hab-ecart hab-ecart--grave"><h3>Compte introuvable</h3><p>'
                + esc(s.diagnostic) + "</p></div>";
        }
        const groupes = (titre, liste, ton) => liste.length === 0 ? ""
            : '<div class="hab-ecart hab-ecart--' + esc(ton) + '"><h3>' + esc(titre)
              + " <span>(" + esc(liste.length) + ")</span></h3><ul>"
              + liste.map((g) => "<li><code>" + esc(g) + "</code></li>").join("") + "</ul></div>";

        const parGroupe = [];
        etat.domaines.forEach((d) => {
            const niveau = s.domaines[d.code];
            if (niveau === undefined) return;
            let sec = parGroupe.find((x) => x.nom === d.groupe);
            if (!sec) { sec = { nom: d.groupe, items: [] }; parGroupe.push(sec); }
            sec.items.push('<li>' + esc(d.libelle) + " " + pastille(niveau) + "</li>");
        });

        return '<div class="hab-simu-res">'
            + "<h3>" + esc(s.nomAffichage || s.identifiant) + "</h3>"
            + "<p>" + esc([s.fonction, s.service].filter(Boolean).join(" — ")) + "</p>"
            + (s.desactiveDansAnnuaire
                ? '<div class="hab-ecart hab-ecart--grave"><p>' + esc(s.diagnostic) + "</p></div>"
                : "")
            + (!s.ouvreUnAcces && !s.desactiveDansAnnuaire
                ? '<div class="hab-ecart hab-ecart--grave"><h3>Aucun accès</h3><p>'
                  + esc(s.diagnostic) + "</p></div>"
                : "")
            + '<ul class="hab-faits">'
            +   "<li>Périmètre : <strong>" + esc(portee(s.portee)) + "</strong>"
            +     (s.filiales.length
                    ? " — " + s.filiales.map((f) => esc(f.code)).join(", ")
                    : " — aucune filiale") + "</li>"
            +   "<li>Administration : <strong>" + (s.administrateur ? "oui" : "non") + "</strong></li>"
            +   "<li>Droit d’export : <strong>" + (s.peutExporter ? "oui" : "non") + "</strong>"
            +     Help.tip("L’export est un droit DISTINCT de la lecture : un accès Groupe en "
                         + "lecture permettrait sinon d’extraire en un clic la cartographie "
                         + "complète des faiblesses du groupe.") + "</li>"
            + "</ul>"
            + groupes("Groupes reconnus", s.groupesReconnus, "info")
            + groupes("Groupes portés mais IGNORÉS", s.groupesIgnores, "action")
            + (parGroupe.length === 0 ? ""
               : '<div class="hab-simu-domaines">'
                 + parGroupe.map((sec) => "<div><h4>" + esc(sec.nom) + "</h4><ul>"
                     + sec.items.join("") + "</ul></div>").join("")
                 + "</div>")
            + "</div>";
    }

    function brancherComptes() {
        const lancer = async (login) => {
            if (!login) { avertir("Indiquez un login.", "warning"); return; }
            try {
                simulation = await Api.simulerDroits(login);
                document.getElementById("habSimuResultat").innerHTML = resultatSimulation(simulation);
            } catch (e) {
                avertir(e && e.message ? e.message : "Simulation impossible.", "error");
            }
        };
        const bouton = document.getElementById("habSimuLancer");
        if (bouton) bouton.addEventListener("click", () =>
            lancer((document.getElementById("habSimuLogin").value || "").trim()));
        const champ = document.getElementById("habSimuLogin");
        if (champ) champ.addEventListener("keydown", (e) => {
            if (e.key === "Enter") lancer((champ.value || "").trim());
        });
        document.querySelectorAll(".hab-simuler").forEach((b) => {
            b.addEventListener("click", () => {
                const login = b.dataset.login;
                const c = document.getElementById("habSimuLogin");
                if (c) c.value = login;
                lancer(login);
            });
        });
    }

    /* =====================================================================
       VUE 4 — LA REVUE DES DROITS D'ACCÈS (ISO 27001 A.5.18)

       ⚠️ **C'est ce qui fait de cet écran un outil de CONFORMITÉ et non un
       panneau d'administration.** La matrice montre les droits ; la revue
       prouve que quelqu'un les a regardés, quand, et ce qu'il en a conclu.
       C'est la pièce qu'un auditeur réclame, et le produit ne savait pas la
       produire alors qu'il détenait la donnée.

       🛑 **Le produit CONSIGNE, l'administrateur de l'annuaire EXÉCUTE.** La
       décision « à retirer » ne retire personne — outre que le produit n'a
       aucune capacité d'écriture LDAP, c'est le principe de l'exercice :
       quelqu'un décide, quelqu'un d'autre applique.
    ===================================================================== */

    async function renderRevues() {
        const app = document.getElementById("app");
        const onglets = UI.ongletsDe("/habilitations-revues");
        try {
            await charger();
            const r = await Api.revuesHabilitations(revueOuverte);
            revues = Array.isArray(r.revues) ? r.revues : [];
        } catch (e) { return echec(app, e, onglets); }
        if (!etat) return sansDroit(app);

        app.innerHTML = '<section class="page">'
            + UI.enteteHtml({
                titre: "Habilitations",
                onglets: onglets,
                aide: Help.tip(
                    "L’ISO 27001 (A.5.18) et NIS2 exigent que les droits d’accès soient revus "
                  + "à intervalles réguliers. Une revue FIGE qui appartenait à quel groupe au "
                  + "moment du balayage, et garde la décision prise sur chaque accès, avec son "
                  + "auteur et sa date."),
                contexte: "Qui a regardé les accès, quand, et ce qu’il en a conclu.",
                actions: '<button type="button" id="habNouvelleRevue">Ouvrir une revue</button>'
                       + '<button type="button" id="habImprimerRevue" class="btn-secondary">Imprimer</button>'
            })
            + '<div class="card encart-alerte encart-info"><p>'
            +   "<strong>Ce logiciel ne retire personne d’un groupe.</strong> Une décision "
            +   "« à retirer » est consignée, datée et signée — l’administrateur de l’annuaire "
            +   "l’applique. C’est le principe de l’exercice : quelqu’un décide, quelqu’un "
            +   "d’autre applique."
            + "</p></div>"
            + encartProchaineRevue()
            + '<div id="habFormRevue"></div>'
            + (revues.length === 0
                ? '<div class="card"><p class="muted">Aucune revue n’a encore été faite. '
                  + "Ouvrir une revue lit l’annuaire — sans rien y écrire — et fige la liste "
                  + "de qui appartient à chaque groupe déclaré.</p></div>"
                : revues.map(carteRevue).join(""))
            + "</section>";

        brancherRevues();
    }

    /**
     * L'échéance de la prochaine revue, et le retard s'il y a lieu.
     *
     * ⚠️ **ELLE N'ENTRE PAS DANS L'ÉCHÉANCIER PARTAGÉ, et c'est un arbitrage.**
     *
     * L'échéancier du produit est une vue **par filiale et par personne**, nourrie
     * des entités de `data` : tout ce qu'on y lit est actionnable par celui qui le
     * lit, et c'est ce qui lui donne sa valeur. Une revue des habilitations est un
     * acte d'administration **de niveau Groupe**, que seul le détenteur du domaine
     * « administration » peut faire. L'y verser afficherait, à chaque contributeur
     * de chaque filiale, une échéance qui ne le concerne pas — et une liste dont
     * une partie ne concerne pas son lecteur est une liste qu'on cesse de lire.
     *
     * Le retard se dit donc ICI, là où se trouve la personne qui peut agir.
     */
    function encartProchaineRevue() {
        if (!Array.isArray(revues) || revues.length === 0) return "";
        // La plus récente échéance annoncée, toutes revues confondues.
        const avec = revues.filter((r) => r.prochaineLe);
        if (avec.length === 0) {
            return '<div class="card encart-alerte encart-info"><p>'
                + "Aucune périodicité de revue n’est fixée. <strong>Ce n’est pas « rien à "
                + "faire »</strong> : l’ISO 27001 (A.5.18) demande des revues à intervalles "
                + "réguliers, et un auditeur demandera lequel. Indiquez une prochaine "
                + "échéance en clôturant une revue."
                + "</p></div>";
        }
        const prochaine = avec
            .map((r) => r.prochaineLe)
            .sort()
            .slice(-1)[0];
        const jours = Math.floor(
            (new Date(prochaine + "T00:00:00Z").getTime() - Date.now()) / 86400000);
        if (jours >= 0) {
            return '<div class="card encart-alerte encart-info"><p>'
                + "Prochaine revue attendue le <strong>" + esc(I18n.date(prochaine))
                + "</strong> — dans " + esc(jours) + " jour" + (jours > 1 ? "s" : "") + "."
                + "</p></div>";
        }
        return '<div class="card encart-alerte"><p>'
            + "<strong>La revue des droits d’accès est en retard de " + esc(-jours)
            + " jour" + (-jours > 1 ? "s" : "") + "</strong> — elle était attendue le "
            + esc(I18n.date(prochaine)) + ". C’est une non-conformité à l’ISO 27001 A.5.18, "
            + "et elle se voit en audit."
            + "</p></div>";
    }

    function carteRevue(r) {
        const close = r.closeLe !== null && r.closeLe !== undefined;
        const c = r.comptes;
        const ouverte = r.id === revueOuverte;

        // ⚠️ Les deux anomalies qu'une revue existe pour trouver, mises en avant :
        //    un compte DÉSACTIVÉ encore membre, et un accès obtenu par IMBRICATION
        //    — celui qu'une revue faite à la main ne voit pas.
        const alertes = []
            .concat(c.desactives > 0
                ? ['<span class="hab-ecart-pastille hab-ecart-pastille--grave" title="'
                   + esc("Comptes désactivés dans l’annuaire et encore membres d’un groupe "
                       + "d’accès : c’est l’anomalie la plus fréquente d’une revue.")
                   + '">' + esc(c.desactives) + " désactivé" + (c.desactives > 1 ? "s" : "")
                   + "</span>"] : [])
            .concat(c.indirects > 0
                ? ['<span class="hab-ecart-pastille" title="'
                   + esc("Accès obtenus par un groupe imbriqué : ils ne se voient pas dans le "
                       + "groupe lui-même, et c’est ce qu’une revue manuelle oublie.")
                   + '">' + esc(c.indirects) + " par imbrication</span>"] : [])
            .concat(r.balayageTronque
                ? ['<span class="hab-ecart-pastille hab-ecart-pastille--grave" title="'
                   + esc("La lecture de l’annuaire a atteint sa borne : l’instantané est "
                       + "INCOMPLET, et la revue ne peut pas être présentée comme exhaustive.")
                   + '">balayage tronqué</span>'] : []);

        return '<div class="card hab-revue" data-revue="' + esc(r.id) + '">'
            + '<div class="hab-revue-tete">'
            +   "<div><h2>" + esc(r.intitule) + "</h2>"
            +     '<p class="hab-note">' + esc(r.perimetre) + "</p>"
            +     '<p class="hab-note">Ouverte le ' + esc(I18n.date(r.ouverteLe))
            +       " par " + esc(r.ouvertePar)
            +       (close ? " · close le " + esc(I18n.date(r.closeLe)) + " par "
                             + esc(r.closePar) : "")
            +       (r.prochaineLe ? " · prochaine revue attendue le "
                                     + esc(I18n.date(r.prochaineLe)) : "")
            +     "</p></div>"
            +   "<div>" + (close ? '<span class="hab-actif">close</span>'
                                 : '<span class="hab-ecart-pastille">en cours</span>') + "</div>"
            + "</div>"
            + '<ul class="hab-faits hab-revue-comptes">'
            +   "<li><strong>" + esc(c.total) + "</strong> accès revus</li>"
            +   "<li>" + esc(c.maintenu) + " maintenus</li>"
            +   "<li>" + esc(c.aRetirer) + " à retirer</li>"
            +   "<li>" + esc(c.aVerifier) + " à vérifier</li>"
            +   "<li>" + esc(c.aExaminer) + " non examinés</li>"
            + "</ul>"
            + (alertes.length ? '<p class="hab-alertes">' + alertes.join(" ") + "</p>" : "")
            + (close && r.conclusion
                ? '<blockquote class="hab-conclusion">' + esc(r.conclusion) + "</blockquote>"
                : "")
            + '<div class="page-actions no-print">'
            +   '<button type="button" class="hab-revue-ouvrir btn-secondary" data-revue="'
            +     esc(r.id) + '">' + (ouverte ? "Replier" : "Voir les accès") + "</button>"
            +   (close ? "" : '<button type="button" class="hab-revue-clore" data-revue="'
                              + esc(r.id) + '" data-version="' + esc(r.version)
                              + '">Clore la revue</button>')
            + "</div>"
            + (ouverte ? tableauLignes(r, close) : "")
            + "</div>";
    }

    const DECISIONS = Object.freeze([
        { valeur: "a_examiner", libelle: "À examiner" },
        { valeur: "maintenu", libelle: "Maintenu" },
        { valeur: "a_retirer", libelle: "À retirer" },
        { valeur: "a_verifier", libelle: "À vérifier" }
    ]);

    function tableauLignes(r, close) {
        if (!Array.isArray(r.lignes) || r.lignes.length === 0) {
            return '<p class="muted">Cette revue ne porte aucune ligne : aucun des groupes '
                 + "déclarés n’avait de membre au moment du balayage.</p>";
        }
        const lignes = r.lignes.map((l) =>
            '<tr class="' + (l.compteDesactive ? "hab-ligne-alerte" : "") + '">'
            + "<td><strong>" + esc(l.compteLogin) + "</strong>"
            +   '<span class="hab-code">' + esc(l.compteNom) + "</span></td>"
            + "<td>" + esc(l.groupeNom)
            +   (l.profilCode ? '<span class="hab-code">' + esc(l.profilCode) + "</span>" : "")
            + "</td>"
            + '<td class="t-centre">'
            +   (l.compteDesactive
                 ? '<span class="hab-ecart-pastille hab-ecart-pastille--grave">désactivé</span>'
                 : "")
            +   (l.indirect
                 ? ' <span class="hab-ecart-pastille">imbriqué</span>' : "")
            + "</td>"
            + "<td>" + (close
                ? '<span class="hab-decision hab-decision--' + esc(l.decision) + '">'
                  + esc((DECISIONS.find((d) => d.valeur === l.decision) || {}).libelle
                        || l.decision) + "</span>"
                : '<select class="hab-decision-choix" data-ligne="' + esc(l.id)
                  + '" data-version="' + esc(l.version) + '">'
                  + DECISIONS.map((d) => '<option value="' + esc(d.valeur) + '"'
                      + (d.valeur === l.decision ? " selected" : "") + ">"
                      + esc(d.libelle) + "</option>").join("")
                  + "</select>") + "</td>"
            + "<td>" + (close
                ? esc(l.commentaire || "")
                : '<input type="text" class="hab-decision-motif" data-ligne="' + esc(l.id)
                  + '" value="' + esc(l.commentaire || "") + '" maxlength="500"'
                  + ' placeholder="motif (exigé pour un retrait)">') + "</td>"
            + "<td>" + (l.decidePar
                ? esc(l.decidePar) + '<span class="hab-code">'
                  + esc(l.decideLe ? I18n.date(l.decideLe) : "") + "</span>"
                : '<span class="hab-code">—</span>') + "</td>"
            + "</tr>").join("");

        return '<table class="data-table hab-revue-table"><thead><tr>'
            + "<th>Compte</th><th>Groupe d’annuaire</th><th>Signaux</th>"
            + "<th>Décision</th><th>Motif</th><th>Décidé par</th>"
            + "</tr></thead><tbody>" + lignes + "</tbody></table>";
    }

    function brancherRevues() {
        const nouvelle = document.getElementById("habNouvelleRevue");
        if (nouvelle) nouvelle.addEventListener("click", () => {
            const hote = document.getElementById("habFormRevue");
            hote.innerHTML = '<div class="card hab-panneau">'
                + "<h2>Ouvrir une revue des droits d’accès</h2>"
                + '<p class="hab-note">Le produit va LIRE l’annuaire et figer, groupe par '
                + "groupe, la liste de ses membres — imbrications comprises. Il n’y écrit "
                + "rien. Le balayage peut prendre quelques instants.</p>"
                + '<div class="form-grid">'
                +   '<label class="hab-champ"><span>Intitulé</span>'
                +     '<input type="text" id="habRevueIntitule" maxlength="200"'
                +       ' placeholder="Revue des accès — 3e trimestre 2026"></label>'
                +   '<label class="hab-champ"><span>Prochaine revue attendue le'
                +     Help.tip("Alimente l’échéancier. Laisser vide veut dire « aucune "
                +              "périodicité décidée », ce qui n’est pas « rien à faire ».")
                +     "</span><input type=\"date\" id=\"habRevueProchaine\"></label>"
                + "</div>"
                + '<div class="page-actions no-print">'
                +   '<button type="button" id="habRevueLancer">Lire l’annuaire et ouvrir</button>'
                +   '<button type="button" id="habRevueAnnuler" class="btn-secondary">Annuler</button>'
                + "</div></div>";

            document.getElementById("habRevueAnnuler").addEventListener("click", () => {
                hote.innerHTML = "";
            });
            document.getElementById("habRevueLancer").addEventListener("click", async () => {
                const bouton = document.getElementById("habRevueLancer");
                const intitule = (document.getElementById("habRevueIntitule").value || "").trim();
                if (intitule === "") {
                    avertir("Donnez un intitulé à la revue.", "warning"); return;
                }
                bouton.disabled = true;
                bouton.textContent = "Lecture de l’annuaire…";
                try {
                    const r = await Api.ouvrirRevueHabilitations({
                        intitule: intitule,
                        prochaineLe: document.getElementById("habRevueProchaine").value || null
                    });
                    revueOuverte = r.id;
                    let message = r.lignes + " accès figés.";
                    if (r.tronque) {
                        message += " Attention : le balayage a été TRONQUÉ, la revue est incomplète.";
                    }
                    if (Array.isArray(r.groupesIntrouvables) && r.groupesIntrouvables.length) {
                        message += " Attention : " + r.groupesIntrouvables.length
                                 + " groupe(s) déclaré(s) sont introuvables dans l’annuaire.";
                    }
                    avertir(message, r.tronque ? "warning" : "success");
                    await renderRevues();
                } catch (e) {
                    avertir(e && e.message ? e.message : "Ouverture refusée.", "error");
                    bouton.disabled = false;
                    bouton.textContent = "Lire l’annuaire et ouvrir";
                }
            });
        });

        const imprimer = document.getElementById("habImprimerRevue");
        if (imprimer) imprimer.addEventListener("click", () => window.print());

        document.querySelectorAll(".hab-revue-ouvrir").forEach((b) => {
            b.addEventListener("click", () => {
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC.
                revueOuverte = revueOuverte === b.dataset.revue ? null : b.dataset.revue;
                renderRevues();
            });
        });

        /* ── DÉCIDER, ET LE MOTIF QUI VA AVEC ────────────────────────────────
         *
         * ⚠️ **Le motif se demande AVANT d'envoyer, jamais après avoir été
         * refusé.** La première rédaction envoyait la décision et laissait le
         * serveur refuser : l'utilisateur voyait un message rouge, retrouvait
         * la liste remise à « À examiner », devait taper le motif puis
         * re-choisir. Quatre gestes pour un. Vu en cliquant sur la recette.
         *
         * Le serveur refuse toujours — c'est lui la barrière, et le schéma
         * derrière lui —, mais l'écran ne l'y conduit plus : il pose la
         * question au bon moment, met le champ en évidence, et envoie quand la
         * réponse est là. */
        const envoyer = async (id, decision, motif, version) => {
            try {
                await Api.deciderLigneRevue(id, {
                    decision: decision,
                    commentaire: motif,
                    version: version
                });
                await renderRevues();
            } catch (e) {
                // ⚠️ Le message du SERVEUR : c'est lui qui sait POURQUOI il refuse.
                //    Le reformuler ici en perdrait la raison.
                avertir(e && e.message ? e.message : "Décision refusée.", "error");
                await renderRevues();
            }
        };

        const champMotif = (id) =>
            document.querySelector('.hab-decision-motif[data-ligne="' + id + '"]');

        document.querySelectorAll(".hab-decision-choix").forEach((select) => {
            select.addEventListener("change", async () => {
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC.
                const id = select.dataset.ligne;
                const version = Number(select.dataset.version);
                const champ = champMotif(id);
                const motif = champ ? champ.value.trim() : "";
                const exige = select.value === "a_retirer" || select.value === "a_verifier";

                if (exige && motif === "") {
                    if (champ) {
                        champ.classList.add("hab-motif-attendu");
                        champ.placeholder = "Motif requis — c’est lui qu’on relira dans six mois";
                        champ.focus();
                    }
                    return;   // rien n'est envoyé : la décision reste en attente du motif
                }
                await envoyer(id, select.value, motif === "" ? null : motif, version);
            });
        });

        // Le motif complété envoie la décision restée en attente.
        document.querySelectorAll(".hab-decision-motif").forEach((champ) => {
            const valider = async () => {
                const id = champ.dataset.ligne;
                const select = document.querySelector(
                    '.hab-decision-choix[data-ligne="' + id + '"]');
                if (!select) return;
                const motif = champ.value.trim();
                const exige = select.value === "a_retirer" || select.value === "a_verifier";
                if (!exige || motif === "") return;
                champ.classList.remove("hab-motif-attendu");
                await envoyer(id, select.value, motif, Number(select.dataset.version));
            };
            champ.addEventListener("blur", valider);
            champ.addEventListener("keydown", (e) => { if (e.key === "Enter") valider(); });
        });

        document.querySelectorAll(".hab-revue-clore").forEach((b) => {
            b.addEventListener("click", () => {
                const id = b.dataset.revue;
                const version = Number(b.dataset.version);
                const revue = (revues || []).find((r) => r.id === id);
                const reste = revue ? revue.comptes.aExaminer : 0;
                const hote = document.getElementById("habFormRevue");
                hote.innerHTML = '<div class="card hab-panneau">'
                    + "<h2>Clore la revue</h2>"
                    + (reste > 0
                        ? '<p class="hab-note"><strong>' + esc(reste) + " accès</strong> "
                          + "n’ont pas été examinés. Vous pouvez clore malgré tout — le "
                          + "produit inscrira ce chiffre dans la revue et au journal —, mais "
                          + "la revue ne pourra pas être présentée comme exhaustive.</p>"
                        : '<p class="hab-note">Tous les accès ont été examinés.</p>')
                    + '<label class="hab-champ"><span>Conclusion' + Help.tip(
                          "Exigée : une revue close sans conclusion n’atteste que du fait "
                        + "d’avoir regardé.") + "</span>"
                    +   '<textarea id="habClotureTexte" rows="3" maxlength="4000"></textarea>'
                    + "</label>"
                    + '<label class="hab-champ"><span>Prochaine revue attendue le</span>'
                    +   '<input type="date" id="habClotureProchaine"></label>'
                    + '<div class="page-actions no-print">'
                    +   '<button type="button" id="habClotureValider">Clore</button>'
                    +   '<button type="button" id="habClotureAnnuler" class="btn-secondary">Annuler</button>'
                    + "</div></div>";
                hote.scrollIntoView({ behavior: "smooth", block: "nearest" });

                document.getElementById("habClotureAnnuler").addEventListener("click", () => {
                    hote.innerHTML = "";
                });
                document.getElementById("habClotureValider").addEventListener("click", async () => {
                    try {
                        const r = await Api.cloreRevueHabilitations(id, {
                            conclusion: document.getElementById("habClotureTexte").value,
                            prochaineLe:
                                document.getElementById("habClotureProchaine").value || null,
                            version: version
                        });
                        avertir("Revue close."
                            + (r.restantes > 0
                                ? " " + r.restantes + " accès n’ont pas été examinés, et c’est "
                                  + "inscrit dans la revue."
                                : ""), "success");
                        hote.innerHTML = "";
                        await renderRevues();
                    } catch (e) {
                        avertir(e && e.message ? e.message : "Clôture refusée.", "error");
                    }
                });
            });
        });
    }

    return {
        renderList: renderMatrice,
        renderGroupes,
        renderComptes,
        renderRevues,
        /** Exposé pour le banc : la graduation n'est pas une couleur de statut. */
        niveaux: () => NIVEAUX.map((n) => n.code)
    };
})();

window.HabilitationsModule = HabilitationsModule;
