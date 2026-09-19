// Emplacement : js/modules/echelles.js
// Nom du fichier : echelles.js
//
// Écran « Échelles de cotation » — lot L25, action 25.3.
//
// ── CE QUE CET ÉCRAN EXISTE POUR FERMER ─────────────────────────────────────
//
// Jusqu'ici, ce que « 3 » veut dire était écrit **en dur dans le navigateur** :
// `NIVEAUX = [1, 2, 3, 4]` dans `js/modules/ebios.js`, quatre options en dur dans
// la fiche d'un risque. Aucune ligne du produit ne disait *quelle* gravité est un
// 3, qui l'avait décidé, ni depuis quand.
//
// Le défaut n'est pas cosmétique. Le jour où une filiale passe sa gravité de
// quatre niveaux à cinq, les cotations d'hier et celles de demain se rangent dans
// **la même colonne**, et le tableau de bord les additionne — sans que rien ne le
// signale, puisque la donnée est du même type, dans la même borne, sous le même
// nom. C'est le critère 25.3, énoncé à l'envers : *« une échelle modifiée après
// coup rend les cotations existantes incomparables »*.
//
// ── LES TROIS PROPRIÉTÉS QUE CET ÉCRAN DOIT RENDRE VISIBLES ─────────────────
//
//  1. **Une échelle publiée est FIGÉE.** On ne la corrige pas : on en publie une
//     RÉVISION. La base le tient (`trg_echelles_figee`, migration `049` §6) ;
//     l'écran doit le DIRE, sans quoi l'utilisateur essaie, reçoit un refus, et
//     conclut que le produit est cassé.
//  2. **Le socle du Groupe est le cas normal.** Une filiale qui ne décide rien
//     cote sur l'échelle du Groupe — et c'est ce qui garde les filiales
//     comparables (`PLAN_SERVEUR` §2.2). Publier une échelle locale est un acte,
//     et l'écran en dit le prix.
//  3. **« Non tracée » se dit.** Une cotation d'avant cette livraison ne porte
//     aucune échelle, et ce n'est pas la même chose que « l'échelle du Groupe ».
//
// ── ⚠️ CE QUE CET ÉCRAN NE FAIT PAS ────────────────────────────────────────
//
// **Il n'estampille aucune cotation.** C'est le serveur qui inscrit l'échelle en
// vigueur au moment où une cotation part (`src/entites/`, `marquerEchelles`) —
// seule couche qui distingue « l'écran n'a rien dit » de « l'écran a dit : pas
// d'échelle ». Le faire ici serait une omission qui attend : le moteur d'import
// du lot L7 écrit lui aussi des cotations, et il ne passe par aucun écran.
//
// **Il ne convertit rien.** Changer de révision ne recote pas ce qui existe, et
// ne le peut pas : seul un humain sait si son « 3 » d'hier est le « 3 » de la
// nouvelle graduation. Le produit garde les deux, chacune avec son étiquette.

const EchellesModule = (() => {
    "use strict";

    const DOMAINE = "risques";

    /**
     * Les quatre sujets, dans l'ordre où on les rencontre en cotant.
     *
     * ⚠️ Une liste écrite à la main, et c'est le bon outil ici : le *libellé* d'un
     * sujet et la *phrase* qui dit à quoi il sert sont des décisions humaines
     * qu'aucun catalogue ne déduira. Et l'omission échoue du bon côté — un sujet
     * absent d'ici s'affiche sous son code brut, en clair, ce qui se voit
     * (`CLAUDE.md` §3). Le vocabulaire, lui, est fermé par `ck_echelles_sujet`.
     */
    const SUJETS = Object.freeze([
        Object.freeze({
            code: "gravite",
            libelle: "Gravité",
            dit: "L'ampleur des conséquences. Elle gradue « g_gravite » dans le registre "
               + "des risques et la gravité d'un événement redouté à l'atelier 1 d'EBIOS RM.",
            ou: "Registre des risques · EBIOS RM atelier 1"
        }),
        Object.freeze({
            code: "vraisemblance",
            libelle: "Vraisemblance",
            dit: "La possibilité que le scénario se réalise. Elle gradue « f_frequence » "
               + "dans le registre des risques et la vraisemblance d'un scénario "
               + "opérationnel à l'atelier 4.",
            ou: "Registre des risques · EBIOS RM atelier 4"
        }),
        Object.freeze({
            code: "criteres_source",
            libelle: "Critères d'une source de risque",
            dit: "Motivation, ressources, activité — les trois critères d'un couple source "
               + "de risque / objectif visé. Une seule échelle pour les trois, parce que le "
               + "produit en fait la moyenne.",
            ou: "EBIOS RM atelier 2"
        }),
        Object.freeze({
            code: "criteres_partie_prenante",
            libelle: "Critères d'une partie prenante",
            dit: "Dépendance, pénétration, maturité cyber, confiance — les quatre critères "
               + "de l'écosystème. Une seule échelle pour les quatre, parce qu'ils se "
               + "combinent en un niveau de menace.",
            ou: "EBIOS RM atelier 3"
        })
    ]);

    const STATUTS = Object.freeze({
        brouillon:  { libelle: "Brouillon",  ton: "status-non-applicable",
                      dit: "Se travaille librement. Aucune cotation ne peut la nommer." },
        en_vigueur: { libelle: "En vigueur", ton: "status-conforme",
                      dit: "C'est elle qui estampille les cotations qui partent. Elle est figée : on en publie une révision." },
        archivee:   { libelle: "Archivée",   ton: "status-non-applicable",
                      dit: "Retirée du service. Elle reste lisible pour tout ce qu'elle a produit." }
    });

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
     * Le statut d'une échelle, avec son ton.
     *
     * ⚠️ Un statut inconnu s'affiche **tel qu'il vient**, échappé, avec le ton
     * neutre : rien ne disparaît, et quelqu'un doit décider.
     */
    function badgeStatut(code) {
        const clef = String(code || "");
        const s = Object.prototype.hasOwnProperty.call(STATUTS, clef)
            ? STATUTS[clef]
            : { libelle: clef || "—", ton: "status-non-applicable", dit: "Statut inconnu du produit." };
        return '<span class="status ' + s.ton + '" title="' + esc(s.dit) + '">'
             + esc(s.libelle) + "</span>";
    }

    /**
     * L'échelle est-elle celle du Groupe ?
     *
     * ⚠️ Le serveur n'expose pas `filiale_id` — une filiale ne voit que ce qui la
     * regarde. Ce qu'il expose est `_porteeGroupe`, le champ structurel que
     * `src/entites/` ajoute aux entités MIXTES. On le lit **par ce champ**, jamais
     * en devinant d'après autre chose.
     */
    function estDuGroupe(echelle) {
        return echelle && echelle._porteeGroupe === true;
    }

    /* =====================================================================
       LA LISTE — un sujet par carte
    ===================================================================== */

    function renderList() {
        const app = document.getElementById("app");
        const ecriture = peutEcrire();

        app.innerHTML = `
            <section class="page">
                ${UI.enteteHtml({
                    titre: "Échelles de cotation",
                    aide: Help.tip("Une échelle dit ce qu'un chiffre veut dire : « 3 » est-il une gravité grave ou significative ? Tant que ce n'est écrit nulle part, deux cotations séparées par un changement de barème se rangent dans la même colonne et s'additionnent."),
                    contexte: "Le Groupe publie un socle ; une filiale peut publier le sien. Une échelle en service ne se modifie plus — on en publie une révision.",
                    onglets: UI.ongletsDe("/echelles"),
                    actions: ""
                })}

                <div class="card" id="echellesAvis">
                    <p class="muted">
                        ${esc("Publier une révision ne recote rien : les cotations déjà produites gardent l'échelle sous laquelle elles l'ont été, et le produit affiche laquelle. Seul un humain sait si son « 3 » d'hier est le « 3 » de la nouvelle graduation.")}
                    </p>
                </div>

                <div id="echellesListe"></div>
            </section>`;

        dessinerListe(ecriture);
    }

    function dessinerListe(ecriture) {
        const hote = document.getElementById("echellesListe");
        if (!hote) return;

        hote.innerHTML = SUJETS.map(sujet => carteSujetHtml(sujet, ecriture)).join("");

        if (!ecriture) return;
        SUJETS.forEach(sujet => {
            const bouton = document.getElementById("echRev-" + sujet.code);
            if (bouton) {
                // ⚠️ L'identifiant se lit dans le DOM au moment du clic, jamais
                //    capturé en fermeture : le serveur réattribue les identifiants
                //    à la création (`CLAUDE.md` §3).
                bouton.addEventListener("click", function () {
                    ouvrirRedaction(this.dataset.sujet);
                });
            }
        });
    }

    function carteSujetHtml(sujet, ecriture) {
        const revisions = DataStore.getEchellesDuSujet(sujet.code);
        // ⚠️ **`DataStore.getEchelleEnVigueur`, et non un `find` local.** Le socle du
        //    Groupe et l'échelle de la filiale sont tous deux « en vigueur » ; c'est la
        //    seconde qui gouverne, et une seconde rédaction de cette règle se mettrait à
        //    diverger de celle du serveur (constat Q-219).
        const enVigueur = DataStore.getEchelleEnVigueur(sujet.code) || null;

        return `
            <div class="card" id="echCarte-${esc(sujet.code)}">
                <h3>${esc(sujet.libelle)} ${Help.tip(sujet.dit)}</h3>
                <p class="muted">${esc(sujet.ou)}</p>
                ${enVigueur ? blocEnVigueurHtml(enVigueur) : blocSansEchelleHtml()}
                ${historiqueHtml(revisions, enVigueur)}
                ${ecriture && enVigueur ? `
                <div class="no-print" style="margin-top:.75rem">
                    <button type="button" id="echRev-${esc(sujet.code)}"
                            data-sujet="${esc(sujet.code)}">Publier une révision pour ma filiale</button>
                </div>` : ""}
            </div>`;
    }

    function blocEnVigueurHtml(echelle) {
        const niveaux = DataStore.getNiveauxEchelle(echelle.id);
        const portee = estDuGroupe(echelle)
            ? '<span class="status status-conforme" title="' + esc("Le socle commun : c'est ce qui garde les filiales comparables.") + '">' + esc("Socle du Groupe") + "</span>"
            : '<span class="status status-partiellement-conforme" title="' + esc("Votre filiale a publié sa propre graduation. Ses cotations ne s'additionnent plus telles quelles à celles des autres filiales — le produit le sait, parce que chaque cotation porte son échelle.") + '">' + esc("Échelle de la filiale") + "</span>";

        return `
            <p>
                ${badgeStatut(echelle.statut)} ${portee}
                <strong>${esc(echelle.nom)}</strong>
                <span class="muted">${esc("révision " + (echelle.revision || 1))}</span>
                <span class="muted">${esc("en vigueur depuis le " + fmtDate(echelle.en_vigueur_le))}</span>
            </p>
            ${echelle.description ? '<p class="muted">' + esc(echelle.description) + "</p>" : ""}
            ${niveaux.length === 0
                ? '<p class="chart-empty">' + esc("Cette échelle ne porte aucun niveau : rien ne pourra être coté avec elle.") + "</p>"
                : `<table class="data-table">
                        <thead><tr><th style="width:5rem">Valeur</th><th>Niveau</th><th>Ce qu'il veut dire</th></tr></thead>
                        <tbody>${niveaux.map(n => `
                            <tr>
                                <td><strong>${esc(n.valeur)}</strong></td>
                                <td>${esc(n.libelle)}</td>
                                <td class="muted">${esc(n.description || "—")}</td>
                            </tr>`).join("")}</tbody>
                   </table>`}`;
    }

    function blocSansEchelleHtml() {
        return '<p class="chart-empty">'
             + esc("Aucune échelle en vigueur pour ce sujet. Les cotations qui partiront resteront « échelle non tracée » — elles seront enregistrées, mais rien ne dira ce que leurs chiffres veulent dire.")
             + "</p>";
    }

    /**
     * Les autres révisions du sujet — **tout ce qui n'est pas l'échelle effective**.
     *
     * ⚠️ **Et non « tout ce qui n'est pas en vigueur ».** Quand une filiale publie la
     * sienne, le socle du Groupe reste EN VIGUEUR — pour lui, et pour les dix-neuf autres
     * filiales. Le filtrer sur son statut le faisait disparaître de l'écran : la filiale
     * ne voyait plus ce qu'elle avait cessé d'employer, ni qu'il existait encore. C'est
     * la classe des constats Q-201 / Q-207 — *un écran qui retire une information sans le
     * dire* —, trouvée au navigateur sur la recette.
     */
    function historiqueHtml(revisions, effective) {
        const identifiant = effective ? effective.id : null;
        const autres = revisions.filter(e => e.id !== identifiant);
        if (autres.length === 0) return "";
        return `
            <details style="margin-top:.5rem">
                <summary>${esc(autres.length + " autre(s) r\u00e9vision(s)")}</summary>
                <ul>${autres.map(e => `
                    <li>${badgeStatut(e.statut)} ${esc(e.nom)}
                        <span class="muted">${esc("r\u00e9vision " + (e.revision || 1))}</span>
                        ${estDuGroupe(e)
                            ? '<span class="muted">' + esc("socle du Groupe \u2014 vous ne cotez plus dessus") + "</span>"
                            : ""}
                        ${e.archivee_le ? '<span class="muted">' + esc("archiv\u00e9e le " + fmtDate(e.archivee_le)) + "</span>" : ""}
                    </li>`).join("")}</ul>
            </details>`;
    }

    /* =====================================================================
       PUBLIER UNE RÉVISION
    ===================================================================== */

    /**
     * Ouvre la rédaction d'une révision, **pré-remplie avec la graduation en
     * vigueur**.
     *
     * ⚠️ Pré-remplir n'est pas un confort : partir d'une page blanche ferait
     * ressaisir quatre libellés, et une révision dont un seul libellé a changé
     * par mégarde est une révision qui ment sur ce qu'elle change.
     */
    function ouvrirRedaction(sujetCode) {
        const sujet = SUJETS.find(s => s.code === sujetCode);
        const modele = DataStore.getEchelleEnVigueur(sujetCode);
        if (!sujet || !modele) return;

        const niveaux = DataStore.getNiveauxEchelle(modele.id);
        const carte = document.getElementById("echCarte-" + sujetCode);
        if (!carte) return;

        const bloc = document.createElement("div");
        bloc.className = "no-print";
        bloc.id = "echRedaction-" + sujetCode;
        bloc.innerHTML = `
            <hr />
            <h4>${esc("Publier une révision de « " + sujet.libelle + " » pour ma filiale")}</h4>
            <p class="muted">
                ${esc("Ce que vous publiez ici ne vaut que pour votre filiale : le socle du Groupe ne bouge pas, et les autres filiales continuent de coter dessus. Les cotations déjà produites gardent leur échelle — rien n'est reconverti.")}
            </p>
            <label>${esc("Intitulé")}
                <input type="text" id="echNom-${esc(sujetCode)}" maxlength="120"
                       value="${esc(sujet.libelle + " — échelle de la filiale")}" />
            </label>
            <label>${esc("Pourquoi cette révision")} ${Help.tip("Ce que l'auditeur lira. « Passage à cinq niveaux, décision du comité du 12/03 » se relit dans trois ans ; « mise à jour » ne se relit pas.")}
                <textarea id="echDesc-${esc(sujetCode)}" rows="2" maxlength="2000"
                          placeholder="Passage à cinq niveaux, décision du comité sécurité du …"></textarea>
            </label>
            <table class="data-table" id="echNiveaux-${esc(sujetCode)}">
                <thead><tr><th style="width:6rem">Valeur</th><th>Niveau</th><th>Ce qu'il veut dire</th></tr></thead>
                <tbody>${niveaux.map((n, i) => ligneNiveauHtml(sujetCode, i, n.valeur, n.libelle, n.description)).join("")}</tbody>
            </table>
            <p>
                <button type="button" id="echAjouter-${esc(sujetCode)}" data-sujet="${esc(sujetCode)}">Ajouter un niveau</button>
                <button type="button" id="echPublier-${esc(sujetCode)}" data-sujet="${esc(sujetCode)}">Publier cette révision</button>
                <button type="button" id="echAnnuler-${esc(sujetCode)}" data-sujet="${esc(sujetCode)}">Annuler</button>
            </p>`;

        const ancien = document.getElementById("echRedaction-" + sujetCode);
        if (ancien) { ancien.remove(); return; }
        carte.appendChild(bloc);

        document.getElementById("echAjouter-" + sujetCode).addEventListener("click", function () {
            const corps = document.querySelector("#echNiveaux-" + this.dataset.sujet + " tbody");
            if (!corps) return;
            const rang = corps.children.length;
            corps.insertAdjacentHTML("beforeend",
                ligneNiveauHtml(this.dataset.sujet, rang, rang + 1, "", ""));
        });
        document.getElementById("echAnnuler-" + sujetCode).addEventListener("click", function () {
            const a = document.getElementById("echRedaction-" + this.dataset.sujet);
            if (a) a.remove();
        });
        document.getElementById("echPublier-" + sujetCode).addEventListener("click", function () {
            publier(this.dataset.sujet);
        });
    }

    function ligneNiveauHtml(sujetCode, rang, valeur, libelle, description) {
        return `
            <tr>
                <td><input type="number" step="1" min="0" class="ech-valeur"
                           data-sujet="${esc(sujetCode)}" data-rang="${esc(rang)}"
                           value="${esc(valeur)}" style="width:5rem" /></td>
                <td><input type="text" class="ech-libelle" maxlength="80"
                           data-sujet="${esc(sujetCode)}" data-rang="${esc(rang)}"
                           value="${esc(libelle)}" /></td>
                <td><input type="text" class="ech-desc" maxlength="1000"
                           data-sujet="${esc(sujetCode)}" data-rang="${esc(rang)}"
                           value="${esc(description || "")}" /></td>
            </tr>`;
    }

    /**
     * Publie la révision : l'échelle d'abord, ses niveaux ensuite, la mise en
     * vigueur en dernier.
     *
     * ⚠️ **L'ORDRE EST UNE CONTRAINTE, PAS UN STYLE.** La base refuse d'ajouter un
     * niveau à une échelle publiée (`trg_echelle_niveaux_figes`) : créer
     * directement « en vigueur » échouerait, et le refus arriverait après que la
     * moitié du travail soit partie. On gradue, puis on publie — ce qui est aussi
     * l'ordre dans lequel un humain le fait.
     */
    function publier(sujetCode) {
        const sujet = SUJETS.find(s => s.code === sujetCode);
        const ancienne = DataStore.getEchelleEnVigueur(sujetCode);
        if (!sujet || !ancienne) return;

        const nom = ((document.getElementById("echNom-" + sujetCode) || {}).value || "").trim();
        if (nom === "") {
            if (window.showToast) showToast("Donnez un intitulé à l'échelle.", "warning");
            return;
        }

        const lignes = [];
        const vues = new Set();
        const corps = document.querySelectorAll("#echNiveaux-" + sujetCode + " tbody tr");
        for (const tr of corps) {
            const valeur = (tr.querySelector(".ech-valeur") || {}).value;
            const libelle = ((tr.querySelector(".ech-libelle") || {}).value || "").trim();
            if (String(valeur).trim() === "" && libelle === "") continue;
            if (String(valeur).trim() === "" || libelle === "") {
                if (window.showToast) showToast("Chaque niveau porte une valeur ET un libellé.", "warning");
                return;
            }
            if (vues.has(Number(valeur))) {
                if (window.showToast) showToast("Deux niveaux portent la valeur " + valeur + ".", "warning");
                return;
            }
            vues.add(Number(valeur));
            lignes.push({
                valeur: Number(valeur),
                libelle: libelle,
                description: ((tr.querySelector(".ech-desc") || {}).value || "").trim()
            });
        }
        if (lignes.length < 2) {
            if (window.showToast) showToast("Une échelle a au moins deux niveaux.", "warning");
            return;
        }

        const echelleId = UI.genId("ECHL");
        DataStore.addEchelle({
            id: echelleId,
            sujet: sujetCode,
            nom: nom,
            revision: Number(ancienne.revision || 1) + 1,
            statut: "brouillon",
            remplace_id: ancienne.id,
            description: ((document.getElementById("echDesc-" + sujetCode) || {}).value || "").trim(),
            en_vigueur_le: "",
            archivee_le: ""
        });
        lignes.forEach(n => DataStore.addNiveauEchelle({
            id: UI.genId("ECHN"),
            echelle_id: echelleId,
            valeur: n.valeur,
            libelle: n.libelle,
            description: n.description
        }));

        // ⚠️ `UI.apresEcriture` : le serveur réattribue les identifiants, et la
        //    mise en vigueur doit viser l'échelle telle qu'elle existe EN BASE.
        //    Publier avant que l'écriture soit revenue viserait une ligne qui
        //    n'existe plus sous ce nom-là.
        UI.apresEcriture(() => {
            const creee = DataStore.getEchellesDuSujet(sujetCode)
                .find(e => e.statut === "brouillon" && e.nom === nom);
            if (!creee) {
                if (window.showToast) showToast("La révision a été enregistrée, mais n'a pas pu être mise en vigueur. Ouvrez-la et publiez-la.", "warning");
                renderList();
                return;
            }
            // ⚠️ **ON N'ARCHIVE QUE LA SIENNE, ET CE N'EST PAS UN DÉTAIL.** La première
            //    rédaction archivait « l'ancienne » — c'est-à-dire, la première fois, le
            //    SOCLE DU GROUPE. Le serveur l'a refusé (403 : écrire une ligne de portée
            //    Groupe est réservé à l'administration Groupe), et l'écran **avalait le
            //    refus** : il annonçait la publication pendant que le socle restait en
            //    place. Trouvé au navigateur sur la recette, pas par le banc.
            //
            //    Et le refus était le bon comportement : archiver le socle le retirerait
            //    aux DIX-NEUF AUTRES filiales, pour une décision qu'une seule a prise.
            //    Publier la sienne ne retire rien à personne — c'est
            //    `DataStore.getEchelleEnVigueur()` qui fait passer la locale devant.
            if (!estDuGroupe(ancienne)) {
                DataStore.updateEchelle(Object.assign({}, ancienne, {
                    statut: "archivee",
                    archivee_le: new Date().toISOString().slice(0, 10)
                }));
            }
            DataStore.updateEchelle(Object.assign({}, creee, {
                statut: "en_vigueur",
                en_vigueur_le: new Date().toISOString().slice(0, 10)
            }));
            UI.apresEcriture(() => {
                if (window.showToast) showToast("Révision publiée. Les cotations à venir la porteront.", "success");
                renderList();
            });
        });
    }

    return { renderList: renderList };
})();

window.EchellesModule = EchellesModule;
