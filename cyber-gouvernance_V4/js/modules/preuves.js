// Emplacement : js/modules/preuves.js
// Nom du fichier : preuves.js
//
// Panneau « Documents ↔ contrôles » — lot L19, action 19.3.
//
// ── Ce que ce fichier répare ────────────────────────────────────────────────
//
// Un auditeur ouvre un contrôle — « les postes sont chiffrés » — et pose une
// seule question : **« montrez-moi la procédure »**. Le produit savait relier
// une mesure à une exigence, une mesure à une action, un document à un
// référentiel — et **pas** un document à une mesure. Le chaînon manquant était
// précisément celui qui transforme une déclaration en preuve.
//
// ── Un seul panneau, deux fiches, deux sens de lecture ──────────────────────
//
// La liaison est n-n : elle sert les deux bouts par construction. Ce fichier
// rend donc **le même panneau** sur la fiche Document (« ce document prouve
// ces contrôles ») et sur la fiche Mesure (« ces politiques me prouvent »).
// Deux composants auraient divergé au premier ajustement, et c'est justement
// un lien : il doit dire la même chose des deux côtés.
//
// ── ⚠️ CE QUE CE PANNEAU N'EST PAS ──────────────────────────────────────────
//
//   · **Ce n'est pas une pièce jointe.** Le lot L6 détient les fichiers, et le
//     panneau « Pièces jointes » vit plus bas sur la même fiche. Un
//     rattachement vaut quel que soit l'endroit où le fichier se trouve, y
//     compris quand il est « resté ailleurs » (action D4).
//   · **Ce n'est pas une évaluation.** Rattacher une procédure à un contrôle ne
//     rend pas ce contrôle conforme : le statut et la maturité restent dans la
//     mise en œuvre, au niveau de chaque filiale. L'écran le dit, parce que
//     c'est le contresens qu'un tableau de liens invite à faire.
//
// ── La barrière de portée, et pourquoi la liste est filtrée ─────────────────
//
// La base refuse qu'un document de **portée Groupe** s'appuie sur un contrôle
// **local** : la politique que vingt filiales lisent ne doit pas dépendre d'une
// ligne qu'une seule filiale peut effacer (constat N-10, migration `030`). La
// liste proposée suit donc la même règle — sans quoi l'écran offrirait un choix
// que le serveur refuserait ensuite, et dirait à l'utilisateur que l'élément
// « n'existe pas dans votre périmètre » alors qu'il est affiché sous ses yeux.
// C'est exactement le défaut que le constat **Q-294** a coûté.

const PreuvesModule = (() => {
    "use strict";

    const ID_ENCART = "preuvesEncart";

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function peutEcrire(domaine) {
        if (typeof Droits === "undefined" || !Droits.connus()) return true;
        const ordre = Api.CONTRAT_AUTH.niveaux;
        const rang = (n) => { const i = ordre.indexOf(n); return i === -1 ? 0 : i + 1; };
        if (!Droits.peutLire(domaine)) return false;
        return rang(Droits.niveauEffectif(domaine)) >= rang("contribution");
    }

    /** Les identifiants de contrôles qu'un document prouve. Toujours un tableau. */
    function mesuresDe(doc) {
        return Array.isArray(doc && doc.mesures_ids) ? doc.mesures_ids : [];
    }

    /**
     * Les contrôles proposables pour un document donné.
     *
     * ⚠️ **Le filtre dit la même chose que la base, et pas davantage.** Un
     * document LOCAL peut prouver un contrôle de sa filiale **ou** un contrôle
     * du socle du Groupe — c'est le cas le plus fréquent, et il est sans danger.
     * Seul le sens inverse est fermé.
     */
    function mesuresProposables(doc) {
        const toutes = (typeof DataStore !== "undefined" && DataStore.getMesures)
            ? DataStore.getMesures() : [];
        if (doc && doc._porteeGroupe === true) {
            return toutes.filter(m => m._porteeGroupe === true);
        }
        return toutes;
    }

    /* =====================================================================
       LE PANNEAU SUR LA FICHE DOCUMENT
    ===================================================================== */

    /** Le bloc à insérer dans le gabarit de la fiche Document. */
    function encartDocumentHtml(doc) {
        if (!doc || !doc.id) return "";
        if (typeof Droits !== "undefined" && !Droits.peutLire("conformite")) return "";
        return ''
            + '<div class="card prv-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(doc.id) + '" data-sens="document">'
            +   "<h2>Contrôles prouvés par ce document"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "Quels contrôles de sécurité ce document met en œuvre. C'est la réponse à "
                    + "la question qu'un auditeur pose en premier : « montrez-moi la "
                    + "procédure ». Rattacher un document ne rend PAS le contrôle conforme — "
                    + "le statut et la maturité restent sur la fiche du contrôle.") : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"></div>'
            + "</div>";
    }

    /** Compose et branche le panneau de la fiche Document. */
    function brancherDocument(docId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const id = noeud.dataset.id || docId;
        const doc = DataStore.getDocumentById(id);
        if (!doc) return;
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (!corps) return;
        corps.innerHTML = corpsDocumentHtml(doc);
        brancherActions(doc);
    }

    /** Le corps du panneau côté document — exposé pour le banc. */
    function corpsDocumentHtml(doc) {
        const liees = mesuresDe(doc);
        const toutes = (typeof DataStore !== "undefined" && DataStore.getMesures)
            ? DataStore.getMesures() : [];
        const parId = new Map(toutes.map(m => [m.id, m]));

        let html = "";
        if (liees.length === 0) {
            html += '<p class="chart-empty">'
                 +  esc("Ce document ne prouve encore aucun contrôle. Rattachez-le à ceux "
                      + "dont il décrit la mise en œuvre : c'est ce rattachement qu'un "
                      + "auditeur suit pour passer de la déclaration à la preuve.")
                 +  "</p>";
        } else {
            html += '<ul class="prv-liste">';
            liees.forEach(mid => {
                const m = parId.get(mid);
                html += '<li class="prv-item">'
                     +  (m
                        ? '<a href="#/mesures/' + esc(mid) + '" class="prv-nom">'
                          + esc(m.nom) + "</a>"
                          + (m._porteeGroupe === true
                             ? '<span class="prv-portee">' + esc("socle du Groupe") + "</span>"
                             : "")
                        // ⚠️ Un contrôle absent du jeu chargé se DIT, il ne disparaît pas :
                        // c'est le cas d'un contrôle d'une filiale qu'on ne lit pas, et
                        // faire disparaître la ligne ferait croire au lien absent.
                        : '<span class="prv-nom prv-inconnu">' + esc(mid) + "</span>"
                          + '<span class="prv-portee">'
                          + esc("hors de votre périmètre de lecture") + "</span>")
                     +  (peutEcrire("documents")
                        ? '<button type="button" class="prv-retirer" data-mesure="' + esc(mid)
                          + '" aria-label="' + esc("Retirer ce contrôle") + '">'
                          + esc("Retirer") + "</button>"
                        : "")
                     +  "</li>";
            });
            html += "</ul>";
        }

        if (!peutEcrire("documents")) return html;

        const proposables = mesuresProposables(doc).filter(m => liees.indexOf(m.id) === -1);
        if (proposables.length === 0) {
            html += '<p class="prv-mention">'
                 +  esc(liees.length > 0
                        ? "Tous les contrôles à votre portée sont déjà rattachés."
                        : "Aucun contrôle n'est disponible : recensez-les dans « Mesures de "
                          + "sécurité ».")
                 +  "</p>";
            return html;
        }

        html += '<div class="prv-ajout no-print">'
             +  '<label class="sr-only" for="prvChoix">' + esc("Contrôle à rattacher") + "</label>"
             +  '<select id="prvChoix">'
             +  proposables.map(m =>
                    '<option value="' + esc(m.id) + '">' + esc(m.nom)
                    + (m._porteeGroupe === true ? esc(" (socle du Groupe)") : "")
                    + "</option>").join("")
             +  "</select>"
             +  '<button type="button" id="prvAjouter">' + esc("Rattacher") + "</button>"
             +  "</div>";

        if (doc._porteeGroupe === true) {
            html += '<p class="prv-mention">'
                 +  esc("Ce document est de portée Groupe : seuls les contrôles du socle "
                      + "commun sont proposés. Une politique que toutes les filiales lisent "
                      + "ne peut pas dépendre d'une ligne qu'une seule filiale peut effacer.")
                 +  "</p>";
        }
        return html;
    }

    function brancherActions(doc) {
        const ajouter = document.getElementById("prvAjouter");
        if (ajouter) {
            ajouter.addEventListener("click", () => {
                const choix = document.getElementById("prvChoix");
                if (!choix || !choix.value) return;
                enregistrer(doc, mesuresDe(doc).concat([choix.value]));
            });
        }
        document.querySelectorAll(".prv-retirer").forEach(bouton => {
            bouton.addEventListener("click", () => {
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC
                // (`CLAUDE.md` §3), jamais capturé en fermeture.
                const mid = bouton.dataset.mesure;
                enregistrer(doc, mesuresDe(doc).filter(x => x !== mid));
            });
        });
    }

    /**
     * Écrit la nouvelle liste et redessine.
     *
     * ⚠️ On passe par `DataStore.updateDocument`, la façade synchrone : la
     * liaison voyage avec le document, en une écriture, et hérite donc du
     * verrouillage optimiste et du journal. Une route à elle aurait été une
     * seconde façon d'écrire la même chose.
     */
    function enregistrer(doc, mesures) {
        doc.mesures_ids = mesures;
        doc.updatedAt = Date.now();
        DataStore.updateDocument(doc);
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (corps) {
            corps.innerHTML = corpsDocumentHtml(doc);
            brancherActions(doc);
        }
    }

    /* =====================================================================
       LE PANNEAU SUR LA FICHE MESURE — le même lien, lu par l'autre bout
    ===================================================================== */

    function encartMesureHtml(mesureId) {
        if (!mesureId) return "";
        if (typeof Droits !== "undefined" && !Droits.peutLire("documents")) return "";
        return ''
            + '<div class="card prv-encart" id="' + ID_ENCART + '" '
            +      'data-id="' + esc(mesureId) + '" data-sens="mesure">'
            +   "<h2>Politiques et procédures qui prouvent ce contrôle"
            +   (typeof Help !== "undefined" ? Help.tip(
                    "Les documents rattachés à ce contrôle. Le rattachement se fait depuis la "
                    + "fiche du document — c'est là qu'on sait ce qu'un texte décrit.") : "")
            +   "</h2>"
            +   '<div id="' + ID_ENCART + 'Corps"></div>'
            + "</div>";
    }

    function brancherMesure(mesureId) {
        const noeud = document.getElementById(ID_ENCART);
        if (!noeud) return;
        const corps = document.getElementById(ID_ENCART + "Corps");
        if (!corps) return;
        corps.innerHTML = corpsMesureHtml(noeud.dataset.id || mesureId);
    }

    /** Le corps du panneau côté mesure — exposé pour le banc. */
    function corpsMesureHtml(mesureId) {
        const docs = (typeof DataStore !== "undefined" && DataStore.getDocuments)
            ? DataStore.getDocuments() : [];
        const porteurs = docs.filter(d => mesuresDe(d).indexOf(mesureId) !== -1);
        if (porteurs.length === 0) {
            return '<p class="chart-empty">'
                + esc("Aucun document ne prouve encore ce contrôle. Le rattachement se fait "
                    + "depuis la fiche du document, dans « Contrôles prouvés par ce "
                    + "document » — c'est là qu'on sait ce qu'un texte décrit.")
                + "</p>";
        }
        let html = '<ul class="prv-liste">';
        porteurs.forEach(d => {
            html += '<li class="prv-item">'
                 +  '<a href="#/documents/' + esc(d.id) + '" class="prv-nom">'
                 +  esc(d.titre) + "</a>"
                 +  (d.statut
                    ? '<span class="prv-portee">' + esc(d.statut) + "</span>"
                    : "")
                 +  "</li>";
        });
        return html + "</ul>"
            + '<p class="prv-mention">'
            + esc("Un document rattaché ne rend pas ce contrôle conforme : le statut et la "
                + "maturité se saisissent ci-dessus. Le rattachement dit seulement où se "
                + "trouve la preuve.")
            + "</p>";
    }

    return {
        encartDocumentHtml: encartDocumentHtml,
        brancherDocument: brancherDocument,
        encartMesureHtml: encartMesureHtml,
        brancherMesure: brancherMesure,

        // ── Exposés pour le banc ────────────────────────────────────────────
        corpsDocumentHtml: corpsDocumentHtml,
        corpsMesureHtml: corpsMesureHtml,
        mesuresProposables: mesuresProposables
    };
})();
