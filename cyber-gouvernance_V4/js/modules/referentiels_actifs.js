// Emplacement : js/modules/referentiels_actifs.js
// Nom du fichier : referentiels_actifs.js
//
// Module « Référentiels applicables » (`#/referentiels-actifs`) — QUELS
// référentiels sont dans le périmètre de CE site. Table `referentiels_actifs`,
// créée par `001_socle.sql` §12, exposée à l'API au schéma v13.
//
// ── Le constat que cet écran ferme ─────────────────────────────────────────
//
//   Q-150 : la table existait depuis des mois et **personne ne l'écrivait ni ne
//   la lisait**. Toutes les filiales voyaient les cinq référentiels — ANSSI,
//   ISO 27001, NIS2, DORA, AirCyber —, y compris celles à qui ni NIS2 ni DORA ne
//   s'appliquent, et leur taux de conformité se calculait sur des exigences qui
//   ne les concernent pas.
//
// ⚠️ **Cet écran ferme la moitié « écriture » du constat, pas la moitié
// « lecture ».** Voir l'encart de réserve affiché à l'utilisateur, plus bas :
// aucun module de conformité ne consulte encore cette table. Le dire à l'écran
// vaut mieux que de laisser croire à un effet qui n'a pas lieu — un écran qui
// promet en silence est exactement la classe de défaut que ce dépôt sanctionne.
//
// ── LA DISTINCTION À NE PAS ROUVRIR, et pourquoi elle est écrite À L'ÉCRAN ──
//
// Le `PLAN_SERVEUR` §2.2 range parmi les pièges à ne pas rouvrir la confusion
// entre l'ACTIVATION d'un référentiel et le « non applicable » d'une exigence :
//
//   · l'**activation** dit *quels référentiels sont dans le périmètre de ce
//     site* — un choix, une fois, par référentiel ;
//   · le **« non applicable »** écarte *un point précis à l'intérieur* d'un
//     référentiel qu'on pratique.
//
// S'en servir pour écarter un référentiel entier obligerait à cocher 234 cases
// pour AirCyber, filiale par filiale, et fausserait les statistiques. Des RSSI
// ouvriront cet écran sans avoir lu le cadrage : la phrase est donc **dans la
// page**, pas seulement dans ce commentaire.
//
// ── Ce que le serveur a dit, mesuré et non supposé ─────────────────────────
//
//   · `referentiels_actifs.filiale_id` est `not null` : l'entité **n'admet pas
//     de portée Groupe**. `portee: 'groupe'` rend `400 donnee_invalide`,
//     « L'entité « referentiels_actifs » n'admet pas de portée Groupe ». Une
//     activation est toujours celle d'UNE filiale — la sienne ;
//   · `origine` est **obligatoire** (`not null`, sans valeur par défaut) :
//     l'omettre rend `400`, « Le champ « origine » est obligatoire » ;
//   · `uq_referentiels_actifs_ref (filiale_id, ref_id)` : un second
//     enregistrement pour le même référentiel rend `409 contrainte_base` ;
//   · `ck_referentiels_actifs_socle` interdit `origine = 'socle_groupe'` **et**
//     `obligatoire` **et** `not actif` : un référentiel imposé par le Groupe ne
//     se désactive pas localement. C'est la base qui le tient, pas cet écran ;
//   · ⚠️ en revanche, **rien n'empêche une filiale d'écrire elle-même
//     `origine: 'socle_groupe'`** — mesuré : un RSSI de site crée une ligne
//     `socle_groupe` + `obligatoire` sans être refusé, et se verrouille tout
//     seul. Le drapeau est DESCRIPTIF, pas une barrière. Cet écran ne propose
//     donc ce choix qu'à une administration Groupe, par courtoisie — et cette
//     courtoisie n'est pas une garantie.
//
// ── Conventions du projet, chacune payée par un défaut ─────────────────────
//   · `escapeHtml` sur toute donnée utilisateur injectée en DOM ;
//   · AUCUN gestionnaire en ligne — la CSP du vhost les bloque ;
//   · l'identifiant se lit dans un attribut du DOM AU MOMENT DU CLIC ;
//   · seuls les tokens de `css/tokens.css`.

var ReferentielsActifsModule = (function () {
    "use strict";

    const ENTITE = "referentiels_actifs";

    /** Les deux valeurs de `ck_referentiels_actifs_origine`. */
    const ORIGINES = Object.freeze([
        { valeur: "ajout_local", libelle: "Ajout de la filiale" },
        { valeur: "socle_groupe", libelle: "Imposé par le Groupe" }
    ]);

    let lignes = [];
    let chargement = false;
    let erreurChargement = null;
    let message = null;
    /**
     * Panneau ouvert : `{ refId, ligne, cible: "activer"|"desactiver"|"regler" }`.
     * `ligne` est l'enregistrement existant, ou `null` pour une première activation.
     */
    let panneau = null;

    /* ===================================================================== */

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function libelleOrigine(valeur) {
        const trouve = ORIGINES.find(function (o) { return o.valeur === valeur; });
        return trouve ? trouve.libelle : (valeur || "—");
    }

    /** Aujourd'hui au format `date` de PostgreSQL, en heure LOCALE. */
    function aujourdhui() {
        const d = new Date();
        const deuxChiffres = function (n) { return (n < 10 ? "0" : "") + n; };
        return d.getFullYear() + "-" + deuxChiffres(d.getMonth() + 1) + "-" + deuxChiffres(d.getDate());
    }

    function administrationGroupe() {
        try {
            if (typeof Session === "undefined" || !Session.courante) return false;
            const etat = Session.courante();
            return !!(etat && etat.administrationGroupe);
        } catch (e) {
            return false;
        }
    }

    function peutEcrire() {
        try {
            if (typeof Droits === "undefined" || !Droits.peutEcrire) return true;
            return Droits.peutEcrire("conformite");
        } catch (e) {
            return true;
        }
    }

    /* =====================================================================
       LE CATALOGUE DES RÉFÉRENTIELS — découvert, jamais recopié
    ===================================================================== */

    /**
     * Le catalogue est **statique et vit dans le navigateur** (`PLAN_SERVEUR`
     * §2.1 : les catalogues restent des fichiers, hors base — c'est aussi ce qui
     * interdit d'y stocker le texte des normes). `referentiels_actifs.ref_id` le
     * désigne **sans clé étrangère**.
     *
     * On l'interroge donc par `Referentiels.all()` (`js/data/referentiels.js`),
     * qui rend les référentiels réellement enregistrés — pas une liste recopiée
     * ici, qui vieillirait au premier référentiel ajouté.
     *
     * ⚠️ `const Referentiels` au premier niveau d'un script classique ne pose
     * PAS de propriété sur `window` : on teste le nom, pas `window.Referentiels`.
     */
    function catalogue() {
        try {
            if (typeof Referentiels === "undefined" || !Referentiels.all) return [];
            return Referentiels.all() || [];
        } catch (e) {
            return [];
        }
    }

    function nombreExigences(ref) {
        try {
            if (typeof Referentiels === "undefined" || !Referentiels.countExigences) return null;
            return Referentiels.countExigences(ref);
        } catch (e) {
            return null;
        }
    }

    function ligneDe(refId) {
        return lignes.find(function (l) { return l.ref_id === refId; }) || null;
    }

    /**
     * Les enregistrements dont le `ref_id` n'existe dans AUCUN référentiel du
     * catalogue.
     *
     * Ils ne sont pas masqués : l'absence de clé étrangère rend le cas possible
     * — un référentiel retiré du catalogue, une reprise venue d'une autre
     * version, une saisie d'API. Les cacher ferait croire à une filiale qu'elle
     * n'a rien activé alors qu'une ligne existe et compte.
     */
    function orphelines() {
        const connus = catalogue().map(function (r) { return r.id; });
        return lignes.filter(function (l) { return connus.indexOf(l.ref_id) === -1; });
    }

    /* =====================================================================
       RÉSEAU
    ===================================================================== */

    /**
     * ⚠️ Même détour que `js/modules/socle.js`, et pour la même raison :
     * `data.referentiels_actifs` existe depuis la v13 mais **`DataStore`
     * n'expose aucun accesseur pour cette collection**. `js/core/datastore.js`
     * n'appartient pas au périmètre d'écriture de cet agent. Geste pour lever le
     * détour : y ajouter `getReferentielsActifs` / `addReferentielActif` /
     * `updateReferentielActif` / `deleteReferentielActif`, puis remplacer cet
     * appel.
     */
    async function lire() {
        const charge = await Api.donnees();
        const jeu = (charge && charge.data) ? charge.data : charge;
        const liste = (jeu && Array.isArray(jeu[ENTITE])) ? jeu[ENTITE] : [];
        return liste.filter(function (l) { return l && l.id; });
    }

    function texteErreur(e) {
        if (!e) return "Erreur inconnue.";
        if (e.code === "hors_perimetre") return e.message;
        if (e.code === "contrainte_base") {
            return "Ce référentiel est déjà enregistré pour votre filiale. La liste vient " +
                "d'être rechargée : modifiez l'activation existante plutôt que d'en créer " +
                "une seconde.";
        }
        if (e.estConflit && e.estConflit()) {
            return "Cette activation a été modifiée entre-temps par quelqu'un d'autre. La " +
                "liste vient d'être rechargée : reprenez sur la version affichée.";
        }
        if (e.estNonAuthentifie && e.estNonAuthentifie()) {
            return "Votre session n'est plus ouverte sur le serveur. Reconnectez-vous ; " +
                "votre saisie reste à l'écran.";
        }
        return e.message || String(e);
    }

    /* =====================================================================
       AFFICHAGE
    ===================================================================== */

    /** Un référentiel du socle Groupe et obligatoire ne se désactive pas ici. */
    function verrouille(ligne) {
        return !!(ligne && ligne.actif && ligne.origine === "socle_groupe" && ligne.obligatoire);
    }

    function detailHtml(etiquette, valeur) {
        return "<li><span>" + esc(etiquette) + "</span><span>" + esc(valeur) + "</span></li>";
    }

    function carteHtml(refId, titre, sousTitre, exigences, ligne, inconnu) {
        const actif = !!(ligne && ligne.actif);
        const classes = "rfa-carte" + (actif ? " rfa-carte--actif" : "") + (inconnu ? " rfa-carte--inconnu" : "");

        let details = "";
        // Le NOMBRE D'EXIGENCES est une donnée à part entière — c'est le volume de
        // conformité qu'activer ce référentiel engage, et le dénominateur du taux
        // de la filiale. Il vit donc dans la liste des détails, étiqueté ; l'accoler
        // au sous-titre donnait « 42 mesures · 42 exigences », où l'éditeur et nous
        // comptions la même chose deux fois. Vu sur capture, pas déduit.
        if (exigences !== null && exigences !== undefined) {
            details += detailHtml("Exigences", String(exigences));
        }
        if (ligne) {
            details += detailHtml("Origine", libelleOrigine(ligne.origine));
            details += detailHtml("Obligatoire", ligne.obligatoire ? "Oui" : "Non");
            if (ligne.date_activation) details += detailHtml("Activé le", ligne.date_activation);
            if (ligne.date_desactivation) details += detailHtml("Désactivé le", ligne.date_desactivation);
        }

        const outils = !peutEcrire()
            ? '<span class="soc-vide">Lecture seule</span>'
            : (actif
                ? '<button type="button" class="rfa-desactiver btn-secondary" data-ref="' + esc(refId) + '"' +
                  (verrouille(ligne) ? " disabled" : "") + ">Retirer du périmètre</button>" +
                  (administrationGroupe()
                    ? '<button type="button" class="rfa-regler btn-secondary" data-ref="' + esc(refId) + '">Régler</button>'
                    : "")
                : '<button type="button" class="rfa-activer" data-ref="' + esc(refId) + '" ' +
                  'style="background:var(--primary);">Ajouter au périmètre</button>');

        return '<article class="' + classes + '" data-ref="' + esc(refId) + '">' +
            '<h3 class="rfa-titre">' + esc(titre) + "</h3>" +
            '<div class="rfa-editeur">' + esc(sousTitre) + "</div>" +
            '<div><span class="status ' + (actif ? "status-conforme" : "status-non-applicable") + '">' +
              (actif ? "Dans le périmètre" : "Hors périmètre") + "</span></div>" +
            (inconnu
                ? '<p class="rfa-motif">Aucun référentiel de ce nom dans le catalogue de cette ' +
                  "version. L'enregistrement est conservé et affiché tel quel.</p>"
                : "") +
            (details ? '<ul class="rfa-lignes">' + details + "</ul>" : "") +
            (ligne && ligne.motif ? '<p class="rfa-motif">« ' + esc(ligne.motif) + " »</p>" : "") +
            (verrouille(ligne)
                ? '<p class="rfa-verrou">Imposé par le Groupe : le retrait local est refusé par la base.</p>'
                : "") +
            '<div class="rfa-pied">' + outils + "</div>" +
            "</article>";
    }

    function corpsHtml() {
        if (chargement) return '<p class="chart-empty">Lecture des référentiels applicables…</p>';
        if (erreurChargement) {
            return '<div class="grp-message grp-message--refus" role="alert">' +
                "<strong>La liste n'a pas pu être lue.</strong><br>" + esc(erreurChargement) + "</div>";
        }

        const refs = catalogue();
        if (!refs.length && !lignes.length) {
            return '<div class="empty-state"><h3>Aucun référentiel au catalogue</h3>' +
                "<p>Les référentiels sont livrés avec l'application. Si cette liste est vide, " +
                "les fichiers de catalogue n'ont pas été chargés.</p></div>";
        }

        const cartes = refs.map(function (ref) {
            return carteHtml(ref.id, ref.nom || ref.id,
                [ref.editeur, ref.version].filter(Boolean).join(" · "),
                nombreExigences(ref), ligneDe(ref.id), false);
        }).concat(orphelines().map(function (l) {
            return carteHtml(l.ref_id, l.ref_id, "Référentiel hors catalogue", null, l, true);
        }));

        return '<div class="rfa-grille">' + cartes.join("") + "</div>";
    }

    function messageHtml() {
        if (!message) return "";
        return '<div class="grp-message grp-message--' + esc(message.ton) + '" role="' +
            (message.ton === "ok" ? "status" : "alert") + '">' + esc(message.texte) + "</div>";
    }

    function nomAffiche(refId) {
        const ref = catalogue().find(function (r) { return r.id === refId; });
        return (ref && ref.nom) ? ref.nom : refId;
    }

    function panneauHtml() {
        if (!panneau) return "";
        const ligne = panneau.ligne;
        const titres = {
            activer: "Ajouter « " + nomAffiche(panneau.refId) + " » au périmètre",
            desactiver: "Retirer « " + nomAffiche(panneau.refId) + " » du périmètre",
            regler: "Régler « " + nomAffiche(panneau.refId) + " »"
        };
        const admin = administrationGroupe();
        const origine = (ligne && ligne.origine) || "ajout_local";

        return '<section class="grp-panneau" id="rfaPanneau">' +
            "<h2>" + esc(titres[panneau.cible]) + "</h2>" +
            (panneau.cible === "desactiver"
                ? '<p class="grp-note grp-note--reserve">Retirer un référentiel du périmètre ne ' +
                  "supprime <strong>aucune</strong> évaluation déjà saisie : elles restent en " +
                  "base et reviennent si le référentiel est remis au périmètre. Ce n'est pas " +
                  "non plus un « non applicable » : celui-ci écarte une exigence précise à " +
                  "l'intérieur d'un référentiel que l'on pratique.</p>"
                : "") +
            (admin
                ? '<div class="grp-grille-2">' +
                  '<div class="form-group"><label for="rfaOrigine">Origine ' +
                  Help.tip("« Imposé par le Groupe » verrouille le retrait local lorsque la case « obligatoire » est cochée. La base tient ce verrou ; elle n'empêche en revanche pas une filiale d'écrire elle-même ce drapeau.") +
                  "</label><select id=\"rfaOrigine\">" +
                  ORIGINES.map(function (o) {
                      return '<option value="' + esc(o.valeur) + '"' +
                          (o.valeur === origine ? " selected" : "") + ">" + esc(o.libelle) + "</option>";
                  }).join("") + "</select></div>" +
                  '<div class="form-group"><label for="rfaObligatoire">Obligatoire</label>' +
                  '<select id="rfaObligatoire">' +
                  '<option value="non"' + ((ligne && ligne.obligatoire) ? "" : " selected") + ">Non</option>" +
                  '<option value="oui"' + ((ligne && ligne.obligatoire) ? " selected" : "") + ">Oui</option>" +
                  "</select></div></div>"
                : "") +
            '<div class="form-group"><label for="rfaMotif">Motif ' +
            Help.tip("Pourquoi ce référentiel entre — ou sort — du périmètre de ce site. C'est cette phrase qu'un auditeur lira pour comprendre l'écart entre deux filiales.") +
            "</label><textarea id=\"rfaMotif\" placeholder=\"Ex : entité non désignée comme entité essentielle au titre de NIS2.\">" +
            esc((ligne && ligne.motif) || "") + "</textarea></div>" +
            '<div class="grp-actions">' +
              '<button type="button" id="rfaValider">' +
              (panneau.cible === "activer" ? "Ajouter au périmètre"
                : panneau.cible === "desactiver" ? "Retirer du périmètre" : "Enregistrer") +
              "</button>" +
              '<button type="button" id="rfaAnnuler" class="btn-secondary">Annuler</button>' +
            "</div></section>";
    }

    function vueHtml() {
        return '<section class="page">' +
            '<div class="dashboard-header no-print"><div>' +
              "<h1>Référentiels applicables " +
              Help.tip("Quels référentiels sont dans le périmètre de CE site. Un référentiel hors périmètre ne doit ni s'afficher ni peser dans le taux de conformité de la filiale.") +
              "</h1>" +
              '<p style="color:var(--text-muted); margin-top:5px;">Le périmètre normatif de votre ' +
              "filiale — ce qui s'applique ici, et ce qui ne s'applique pas</p>" +
            "</div></div>" +

            '<div class="grp-note">' +
              "<p><strong>Activer un référentiel n'est pas la même chose que déclarer une " +
              "exigence « non applicable ».</strong> L'activation dit <em>quels référentiels " +
              "sont dans le périmètre de ce site</em> ; le « non applicable » écarte <em>un " +
              "point précis à l'intérieur</em> d'un référentiel que l'on pratique. Se servir " +
              "du second pour écarter un référentiel entier obligerait à cocher 234 cases pour " +
              "AirCyber, et fausserait les statistiques.</p>" +
              "<p>Toutes les filiales n'ont pas le même périmètre normatif : NIS2 et DORA ne " +
              "s'appliquent pas partout, et un taux de conformité calculé sur des exigences qui " +
              "ne vous concernent pas ne veut rien dire.</p>" +
            "</div>" +

            '<div class="grp-note grp-note--reserve">' +
              "<p><strong>Ce que cet écran fait aujourd'hui, et ce qu'il ne fait pas encore.</strong> " +
              "Le périmètre saisi ici est enregistré, daté et motivé — c'est ce qu'un auditeur " +
              "demandera. En revanche, les écrans « Référentiels », « Couverture » et le tableau " +
              "de bord <strong>ne le consultent pas encore</strong> : ils continuent d'afficher " +
              "les référentiels du catalogue. Le branchement de ces écrans reste à faire.</p>" +
            "</div>" +

            '<div id="rfaMessage">' + messageHtml() + "</div>" +
            '<div id="rfaPanneauHote">' + panneauHtml() + "</div>" +
            '<div id="rfaCorps">' + corpsHtml() + "</div>" +
            "</section>";
    }

    /* ===================================================================== */

    function rafraichirCorps() {
        const hote = document.getElementById("rfaCorps");
        if (!hote) return;
        hote.innerHTML = corpsHtml();
        brancherCartes();
    }

    function rafraichirMessage() {
        const hote = document.getElementById("rfaMessage");
        if (hote) hote.innerHTML = messageHtml();
    }

    function rafraichirPanneau() {
        const hote = document.getElementById("rfaPanneauHote");
        if (!hote) return;
        hote.innerHTML = panneauHtml();
        brancherPanneau();
    }

    function brancherCartes() {
        // L'identifiant du référentiel est relu dans l'attribut AU MOMENT du
        // clic — jamais capturé en chaîne (`CLAUDE.md` §3).
        document.querySelectorAll(".rfa-activer").forEach(function (b) {
            b.addEventListener("click", function () { ouvrir(b.dataset.ref, "activer"); });
        });
        document.querySelectorAll(".rfa-desactiver").forEach(function (b) {
            b.addEventListener("click", function () { ouvrir(b.dataset.ref, "desactiver"); });
        });
        document.querySelectorAll(".rfa-regler").forEach(function (b) {
            b.addEventListener("click", function () { ouvrir(b.dataset.ref, "regler"); });
        });
    }

    function brancherPanneau() {
        const valider = document.getElementById("rfaValider");
        if (valider) valider.addEventListener("click", function () { appliquer(); });
        const annuler = document.getElementById("rfaAnnuler");
        if (annuler) annuler.addEventListener("click", function () { panneau = null; rafraichirPanneau(); });
        const motif = document.getElementById("rfaMotif");
        if (motif) motif.focus();
    }

    function ouvrir(refId, cible) {
        message = null;
        panneau = { refId: refId, cible: cible, ligne: ligneDe(refId) };
        rafraichirMessage();
        rafraichirPanneau();
        const hote = document.getElementById("rfaPanneau");
        if (hote && hote.scrollIntoView) hote.scrollIntoView({ block: "nearest" });
    }

    function lireMotif() {
        const champ = document.getElementById("rfaMotif");
        return champ ? String(champ.value).trim() : "";
    }

    function lireReglages(ligne) {
        const origine = document.getElementById("rfaOrigine");
        const obligatoire = document.getElementById("rfaObligatoire");
        return {
            // Sans le panneau d'administration, on conserve ce qui existe — et
            // « ajout_local » pour une première activation. Ne jamais dériver
            // « socle_groupe » d'un silence : le drapeau verrouille le retrait.
            origine: origine ? origine.value : ((ligne && ligne.origine) || "ajout_local"),
            obligatoire: obligatoire ? obligatoire.value === "oui" : !!(ligne && ligne.obligatoire)
        };
    }

    async function appliquer() {
        if (!panneau) return;
        const ligne = panneau.ligne;
        const motif = lireMotif();
        const reglages = lireReglages(ligne);

        try {
            if (panneau.cible === "activer") {
                const champs = {
                    ref_id: panneau.refId,
                    origine: reglages.origine,
                    obligatoire: reglages.obligatoire,
                    actif: true,
                    date_activation: aujourdhui(),
                    // `ck_referentiels_actifs_dates` compare les deux dates : une
                    // désactivation ancienne laissée en place refuserait la
                    // réactivation du jour. On la retire.
                    date_desactivation: null,
                    motif: motif
                };
                if (ligne) await Api.modifier(ENTITE, ligne.id, ligne._version, champs);
                else await Api.creer(ENTITE, null, champs);
                message = {
                    ton: "ok",
                    texte: "« " + nomAffiche(panneau.refId) + " » est dans le périmètre de votre filiale."
                };
            } else if (panneau.cible === "desactiver") {
                if (!ligne) throw new Error("Ce référentiel n'est pas enregistré pour votre filiale.");
                await Api.modifier(ENTITE, ligne.id, ligne._version, {
                    origine: reglages.origine,
                    obligatoire: reglages.obligatoire,
                    actif: false,
                    date_desactivation: aujourdhui(),
                    motif: motif
                });
                message = {
                    ton: "ok",
                    texte: "« " + nomAffiche(panneau.refId) + " » est retiré du périmètre de votre filiale."
                };
            } else {
                if (!ligne) throw new Error("Ce référentiel n'est pas enregistré pour votre filiale.");
                await Api.modifier(ENTITE, ligne.id, ligne._version, {
                    origine: reglages.origine,
                    obligatoire: reglages.obligatoire,
                    motif: motif
                });
                message = { ton: "ok", texte: "Réglages enregistrés." };
            }
            panneau = null;
            rafraichirPanneau();
            await recharger();
        } catch (e) {
            message = { ton: "refus", texte: texteErreur(e) };
            const code = e && e.code;
            if (code === "contrainte_base" || (e && e.estConflit && e.estConflit())) {
                panneau = null;
                rafraichirPanneau();
                await recharger();
            }
        }
        rafraichirMessage();
    }

    async function recharger() {
        chargement = true;
        erreurChargement = null;
        rafraichirCorps();
        try {
            lignes = await lire();
        } catch (e) {
            lignes = [];
            erreurChargement = texteErreur(e);
        } finally {
            chargement = false;
            rafraichirCorps();
        }
    }

    function renderList() {
        const app = document.getElementById("app");
        if (!app) return;
        panneau = null;
        message = null;
        lignes = [];
        erreurChargement = null;
        chargement = true;
        app.innerHTML = vueHtml();
        brancherCartes();
        brancherPanneau();
        recharger();
    }

    return { renderList };
})();
