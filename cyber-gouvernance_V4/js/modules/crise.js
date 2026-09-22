// Emplacement : js/modules/crise.js
// Nom du fichier : crise.js

const CriseModule = (() => {

    /* =========================================================================
       FICHES RÉFLEXES DE CRISE — EN BASE DEPUIS LA MIGRATION `061`

       ⚠️ **Six rôles, vingt-cinq réflexes et sept contacts vivaient ICI, en dur.**
       Quatre réflexes de plus vivaient même dans le GABARIT de `renderFiches()`, au
       milieu du balisage. Utilisateur, 22/09/2026 : *« elles sont à adapter en
       fonction de l'existant »* — et un groupe de vingt filiales n'a pas une seule
       organisation de crise.

       Elles sont désormais un **socle du Groupe surchargeable par filiale**, comme
       le socle de risques et les échelles de cotation. Le contenu n'a pas bougé
       d'un caractère : le semis de la `061` a été ENGENDRÉ depuis ce fichier.

       ⚠️ **`DataStore.getFichesReflexes()` résout la surcharge**, et ce n'est pas un
       `filter` nu : une fiche locale REMPLACE celle du socle pour le même rôle. Deux
       cartes pour « Responsable IT / SSI » au moment d'une crise, ce sont deux
       colonnes qui se contredisent sous les yeux de quelqu'un qui n'a pas le temps
       de choisir. C'est le défaut mesuré sur les échelles le 19/09, fermé ici avant
       d'avoir coûté.
    ========================================================================= */

    function injectFichesStyles() {
        if (document.getElementById("crise-fiches-styles")) return;
        const style = document.createElement("style");
        style.id = "crise-fiches-styles";
        style.textContent = `
            .fiches-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 1.2rem; }
            .fiche-span { grid-column: 1 / -1; }
            .fiche-reflexe { border-top: 4px solid var(--primary); }
            .fiche-role { font-size: var(--text-md); font-weight: 700; color: var(--primary); margin-bottom: 8px; }
            .fiche-label { text-transform: uppercase; font-size: var(--text-xs); letter-spacing: 1px; color: var(--text-muted); font-weight: 700; margin: 12px 0 4px; }
            .fiche-holder { padding: 3px 0; }
            .fiche-supp { font-size: var(--text-sm); color: var(--text-muted); }
            .fiche-empty { color: var(--text-muted); font-style: italic; }
            .fiche-actions { margin: 4px 0 0; padding-left: 20px; line-height: 1.5; }
            .fiche-actions li { margin-bottom: 6px; }
            .fiche-commun { border-top-color: var(--color-warning); }
            .fiche-commun .fiche-role { color: #e65100; }
            .fiche-contacts { border-top-color: var(--color-danger); }
            .fiche-contacts .fiche-role { color: var(--color-danger); }
            .fiche-contacts table { width: 100%; border-collapse: collapse; font-size: var(--text-base); margin-top: 6px; }
            .fiche-contacts td { padding: 6px 4px; border-bottom: 1px dashed var(--border); }
            .fiche-contacts td:first-child { font-weight: 600; width: 55%; }
            @media print {
                .fiches-grid { grid-template-columns: 1fr 1fr; gap: 0.8rem; }
                .fiche-reflexe { font-size: 10pt; border: 1px solid #ddd !important; border-top: 3px solid var(--primary) !important; page-break-inside: avoid; break-inside: avoid; }
                .fiche-role { font-size: 12pt; }
            }
        `;
        document.head.appendChild(style);
    }

    /** Mode d'édition de l'écran des fiches. Faux = la vue imprimable. */
    let editionFiches = false;

    function renderFiches() {
        const membres = DataStore.getCriseMembres();
        const app = document.getElementById("app");
        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const dateJour = new Date().toLocaleDateString("fr-FR",
            { day: "2-digit", month: "long", year: "numeric" });

        const fiches = DataStore.getFichesReflexes();
        const contacts = DataStore.getContactsUrgence();

        // Rattache les titulaires de l'annuaire à chaque fiche (par rôle).
        const byRole = {};
        membres.forEach(m => { (byRole[m.role] = byRole[m.role] || []).push(m); });

        const carte = (f) => {
            const reflexes = DataStore.getReflexesDeFiche(f.id);
            const socle = f._porteeGroupe === true;
            // ⚠️ La fiche COMMUNE ne cherche pas de titulaire : elle s'adresse à tout
            //    le monde. Le lui chercher afficherait « Titulaire à désigner » sous
            //    une carte qui n'en veut pas — et quelqu'un finirait par en désigner un.
            const titulaires = f.commun ? null : (byRole[f.role] || []);
            const holders = f.commun ? "" : (titulaires.length
                ? titulaires.map(m => `
                    <div class="fiche-holder">
                        <strong>${esc(m.nom) || "Sans nom"}</strong>${m.telephone ? ` — ${esc(m.telephone)}` : ""}
                        ${m.suppleant ? `<div class="fiche-supp">Suppléant : ${esc(m.suppleant)}</div>` : ""}
                    </div>`).join("")
                : `<div class="fiche-holder fiche-empty">Titulaire à désigner</div>`);

            return `
            <div class="dashboard-card fiche-reflexe${f.commun ? " fiche-commun fiche-span" : ""}"
                 data-fiche="${esc(f.id)}">
                <div class="fiche-role">${esc(f.titre)}${
                    socle ? '<span class="fiche-socle no-print" title="Fiche du socle du Groupe : la même pour toutes les filiales. La modifier ici en crée une PROPRE à cette filiale, qui la remplacera.">socle</span>' : ""
                }</div>
                ${f.commun ? "" : `<div class="fiche-label">Titulaire(s)</div>${holders}`}
                <div class="fiche-label">Réflexes immédiats</div>
                ${reflexes.length
                    ? `<ol class="fiche-actions">${reflexes.map(r => `<li>${esc(r.texte)}</li>`).join("")}</ol>`
                    : `<p class="fiche-empty">Aucun réflexe. Une fiche vide imprimée est pire qu’une fiche absente : on la sort de l’armoire et on y cherche un geste qui n’y est pas.</p>`}
                ${f.notes ? `<div class="fiche-label">À savoir</div><p class="fiche-supp">${esc(f.notes)}</p>` : ""}
                <div class="page-actions no-print fiche-commandes">
                    <button type="button" class="fiche-modifier btn-secondary" data-fiche="${esc(f.id)}">Modifier</button>
                </div>
            </div>`;
        };

        const cartes = fiches.map(carte).join("");

        const contactsRows = contacts.map(c => `
            <tr>
                <td>${esc(c.intitule)}${c._porteeGroupe === true
                    ? '<span class="fiche-socle no-print">socle</span>' : ""}</td>
                <td>${c.coordonnee
                    ? esc(c.coordonnee)
                    : '<span class="fiche-empty">à compléter</span>'}</td>
            </tr>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Fiches réflexes de crise</h1>
                    <img class="print-brand-logo" data-brand-logo hidden alt="" />
                    <p>${esc(Identite.piedImpression("Gestion de crise cyber"))} · Édité le ${esc(dateJour)}</p>
                </div>

                ${UI.enteteHtml({
                    titre: "Fiches réflexes de crise",
                    aide: Help.tip(
                        "Une fiche réflexe est une carte d'action synthétique : les gestes "
                      + "prioritaires à effectuer immédiatement, sans avoir à réfléchir dans "
                      + "l'urgence. Depuis le 22/09/2026 elles sont MODIFIABLES : le Groupe "
                      + "pose un socle, chaque site l'adapte à son organisation réelle."),
                    contexte: "Que faire dans les premières minutes, rôle par rôle.",
                    actions:
                        '<button type="button" id="editerFichesBtn" class="btn-secondary">'
                      + (editionFiches ? "Fermer l’édition" : "Adapter les fiches") + "</button>"
                      + '<button type="button" id="backToCriseBtn" class="btn-secondary">Retour à l’annuaire</button>'
                      + '<button type="button" id="printFichesBtn">Imprimer les fiches</button>'
                })}

                <div class="card encart-alerte no-print">
                    <p><strong>À imprimer et conserver hors ligne :</strong> en cas de crise
                    majeure (rançongiciel, incendie), le SI et cette application peuvent être
                    indisponibles. Gardez une copie papier à jour dans un lieu sécurisé.</p>
                </div>

                <div id="fichesEdition">${editionFiches ? panneauEdition(membres) : ""}</div>

                <div class="fiches-grid">
                    ${cartes || '<p class="muted">Aucune fiche réflexe. Le socle du Groupe est absent : signalez-le à votre exploitant.</p>'}
                    <div class="dashboard-card fiche-reflexe fiche-contacts fiche-span">
                        <div class="fiche-role">Contacts d’urgence
                            <span class="fiche-supp">(à compléter et vérifier régulièrement)</span>
                            <button type="button" id="editerContactsBtn" class="btn-secondary no-print">Modifier</button>
                        </div>
                        <table><tbody>${contactsRows}</tbody></table>
                        <div id="contactsEdition"></div>
                    </div>
                </div>
            </section>
        `;

        injectFichesStyles();
        UI.envelopperTableaux();
        document.getElementById("backToCriseBtn").addEventListener("click",
            () => Router.navigateTo("/crise"));
        document.getElementById("printFichesBtn").addEventListener("click", () => window.print());
        document.getElementById("editerFichesBtn").addEventListener("click", () => {
            editionFiches = !editionFiches;
            renderFiches();
        });
        document.querySelectorAll(".fiche-modifier").forEach(b => {
            b.addEventListener("click", () => {
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC.
                ouvrirFiche(b.dataset.fiche, membres);
            });
        });
        const editerContacts = document.getElementById("editerContactsBtn");
        if (editerContacts) editerContacts.addEventListener("click",
            () => ouvrirContacts());
        if (editionFiches) brancherPanneauEdition(membres);
        if (window.Identite) Identite.brancherLogos();
    }

    /* =========================================================================
       L'ÉDITION — et la règle de portée, dite plutôt que devinée

       ⚠️ **Modifier une fiche du SOCLE depuis une filiale en CRÉE une copie locale**,
       qui remplace la première pour cette filiale. C'est le seul comportement qui
       tienne : le socle est le même pour vingt filiales, et le modifier en place
       depuis l'une d'elles changerait les dix-neuf autres — sans que personne le
       demande. Le serveur refuserait d'ailleurs l'écriture (403), et l'écran doit
       **dire** ce qu'il va faire avant de le faire, pas avaler le refus.
    ========================================================================= */

    function panneauEdition(membres) {
        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const roles = [...new Set(membres.map(m => m.role).filter(Boolean))];
        return `
        <div class="card hab-panneau">
            <h2>Adapter les fiches à votre organisation</h2>
            <p class="hab-note">Le Groupe pose un socle commun. Ce que vous modifiez ici
            devient <strong>propre à votre filiale</strong> et remplace la fiche du socle
            pour ce rôle ; les autres filiales ne sont pas touchées.</p>
            <div class="form-grid">
                <label class="hab-champ"><span>Rôle de la cellule de crise${Help.tip(
                    "Il est apparié au rôle des membres de votre cellule, en texte. "
                  + "Choisissez un rôle existant pour que le bloc « Titulaire » de la "
                  + "fiche se remplisse tout seul.")}</span>
                    <input type="text" id="ficheRole" list="crise-roles" maxlength="120"
                           placeholder="Responsable IT / SSI (Opérationnel)">
                    <datalist id="crise-roles">${
                        roles.map(r => `<option value="${esc(r)}"></option>`).join("")
                    }</datalist></label>
                <label class="hab-champ"><span>Intitulé de la carte</span>
                    <input type="text" id="ficheTitre" maxlength="120"
                           placeholder="Responsable IT / SSI"></label>
            </div>
            <div class="page-actions no-print">
                <button type="button" id="ficheCreerBtn">Créer une fiche</button>
            </div>
        </div>`;
    }

    function brancherPanneauEdition() {
        const bouton = document.getElementById("ficheCreerBtn");
        if (!bouton) return;
        bouton.addEventListener("click", () => {
            const role = (document.getElementById("ficheRole").value || "").trim();
            const titre = (document.getElementById("ficheTitre").value || "").trim();
            if (role === "" || titre === "") {
                if (window.showToast) showToast("Indiquez un rôle et un intitulé.", "warning");
                return;
            }
            const existante = DataStore.getFichesReflexes().find(
                f => String(f.role).trim().toLowerCase() === role.toLowerCase()
                     && f._porteeGroupe !== true);
            if (existante) {
                if (window.showToast) {
                    showToast("Une fiche de votre filiale vise déjà le rôle « " + role
                            + " » : modifiez-la plutôt que d’en créer une seconde.", "warning");
                }
                return;
            }
            DataStore.addFicheReflexe({
                id: UI.genId("FICHE"), role: role, titre: titre,
                ordre: 100, commun: false, actif: true, notes: ""
            });
            UI.apresEcriture(() => {
                if (window.showToast) showToast("Fiche créée.", "success");
                editionFiches = false;
                renderFiches();
            });
        });
    }

    /** Ouvre une fiche en édition, en DISANT ce que la portée implique. */
    function ouvrirFiche(id, membres) {
        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const fiche = DataStore.getFicheReflexeById(id);
        if (!fiche) return;
        const socle = fiche._porteeGroupe === true;
        const reflexes = DataStore.getReflexesDeFiche(id);
        const hote = document.getElementById("fichesEdition");

        hote.innerHTML = `
        <div class="card hab-panneau" id="fichePanneau">
            <h2>${esc(fiche.titre)}</h2>
            ${socle ? `<div class="card encart-alerte"><p><strong>Cette fiche appartient au
            socle du Groupe</strong> — elle est la même pour toutes les filiales. En
            l’enregistrant, vous en créez une <strong>copie propre à votre filiale</strong>,
            qui la remplacera ici et ne touchera aucune autre.</p></div>` : ""}
            <div class="form-grid">
                <label class="hab-champ"><span>Rôle visé</span>
                    <input type="text" id="fRole" list="crise-roles-2" maxlength="120"
                           value="${esc(fiche.role)}"${fiche.commun ? " disabled" : ""}>
                    <datalist id="crise-roles-2">${
                        [...new Set(membres.map(m => m.role).filter(Boolean))]
                            .map(r => `<option value="${esc(r)}"></option>`).join("")
                    }</datalist></label>
                <label class="hab-champ"><span>Intitulé de la carte</span>
                    <input type="text" id="fTitre" maxlength="120" value="${esc(fiche.titre)}"></label>
            </div>
            <label class="hab-champ"><span>À savoir (facultatif)</span>
                <textarea id="fNotes" rows="2" maxlength="2000">${esc(fiche.notes || "")}</textarea></label>

            <h3>Réflexes immédiats${Help.tip(
                "Un geste par ligne, dans l’ordre où on le fait. Un réflexe qui ne tient "
              + "pas en trois lignes n’est pas un réflexe, c’est une procédure — et on ne "
              + "lit pas une procédure pendant les dix premières minutes d’une crise.")}</h3>
            <ol class="fiche-edition-liste" id="fReflexes">
                ${reflexes.map((r, i) => `
                <li>
                    <textarea data-reflexe="${esc(r.id)}" rows="2" maxlength="600">${esc(r.texte)}</textarea>
                    <button type="button" class="fiche-reflexe-suppr btn-danger"
                            data-reflexe="${esc(r.id)}" title="Retirer ce réflexe">&times;</button>
                </li>`).join("")}
            </ol>
            <div class="page-actions no-print">
                <button type="button" id="fAjouterReflexe" class="btn-secondary">Ajouter un réflexe</button>
                <button type="button" id="fEnregistrer">${socle ? "Créer la version de ma filiale" : "Enregistrer"}</button>
                <button type="button" id="fFermer" class="btn-secondary">Fermer</button>
                ${socle ? "" : '<button type="button" id="fSupprimer" class="btn-danger">Supprimer cette fiche</button>'}
            </div>
        </div>`;
        hote.scrollIntoView({ behavior: "smooth", block: "nearest" });
        brancherFiche(fiche, socle);
    }

    function brancherFiche(fiche, socle) {
        const liste = document.getElementById("fReflexes");

        document.getElementById("fAjouterReflexe").addEventListener("click", () => {
            const li = document.createElement("li");
            li.innerHTML = '<textarea data-reflexe="" rows="2" maxlength="600"></textarea>'
                + '<button type="button" class="fiche-reflexe-suppr btn-danger"'
                + ' data-reflexe="" title="Retirer ce réflexe">&times;</button>';
            liste.appendChild(li);
            li.querySelector(".fiche-reflexe-suppr").addEventListener("click",
                () => li.remove());
            li.querySelector("textarea").focus();
        });
        liste.querySelectorAll(".fiche-reflexe-suppr").forEach(b => {
            b.addEventListener("click", () => b.parentElement.remove());
        });

        document.getElementById("fFermer").addEventListener("click", () => {
            document.getElementById("fichesEdition").innerHTML = "";
        });

        const supprimer = document.getElementById("fSupprimer");
        if (supprimer) supprimer.addEventListener("click", () => {
            if (!window.confirm("Supprimer la fiche « " + fiche.titre + " » ? La fiche du "
                + "socle du Groupe reprendra sa place si elle vise le même rôle.")) return;
            DataStore.deleteFicheReflexe(fiche.id);
            UI.apresEcriture(() => {
                if (window.showToast) showToast("Fiche supprimée.", "success");
                renderFiches();
            });
        });

        document.getElementById("fEnregistrer").addEventListener("click", () => {
            const role = (document.getElementById("fRole").value || fiche.role).trim();
            const titre = (document.getElementById("fTitre").value || "").trim();
            const notes = (document.getElementById("fNotes").value || "").trim();
            if (titre === "") {
                if (window.showToast) showToast("Donnez un intitulé à la carte.", "warning");
                return;
            }
            const textes = [...liste.querySelectorAll("textarea")]
                .map(t => ({ id: t.dataset.reflexe, texte: t.value.trim() }))
                .filter(x => x.texte !== "");

            // ⚠️ **Modifier le socle depuis une filiale CRÉE une copie locale**, elle ne
            //    touche pas l'original : le serveur refuserait (403), et une filiale qui
            //    changerait le socle changerait les dix-neuf autres sans le demander.
            const cible = socle
                ? { id: UI.genId("FICHE"), role: role, titre: titre, notes: notes,
                    ordre: fiche.ordre, commun: fiche.commun === true, actif: true }
                : Object.assign({}, fiche, { role: role, titre: titre, notes: notes });

            if (socle) DataStore.addFicheReflexe(cible);
            else DataStore.updateFicheReflexe(cible);

            // Les réflexes : on remplace l'ensemble. Un réflexe retiré doit DISPARAÎTRE,
            // et il ne doit pas se confondre avec un réflexe omis (motif Q-66).
            if (!socle) {
                DataStore.getReflexesDeFiche(fiche.id).forEach(r => {
                    if (!textes.some(t => t.id === r.id)) DataStore.deleteReflexe(r.id);
                });
            }
            textes.forEach((t, i) => {
                if (!socle && t.id) {
                    const existant = DataStore.getReflexesDeFiche(fiche.id)
                        .find(r => r.id === t.id);
                    if (existant) {
                        DataStore.updateReflexe(Object.assign({}, existant,
                            { texte: t.texte, ordre: (i + 1) * 10 }));
                        return;
                    }
                }
                DataStore.addReflexe({
                    id: UI.genId("FREF"), fiche_id: cible.id,
                    ordre: (i + 1) * 10, texte: t.texte
                });
            });

            UI.apresEcriture(() => {
                if (window.showToast) {
                    showToast(socle
                        ? "Version de votre filiale créée : elle remplace celle du socle."
                        : "Fiche enregistrée.", "success");
                }
                document.getElementById("fichesEdition").innerHTML = "";
                renderFiches();
            });
        });
    }

    /** Les contacts d'urgence : ajouter, modifier, retirer ceux de sa filiale. */
    function ouvrirContacts() {
        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const contacts = DataStore.getContactsUrgence();
        const hote = document.getElementById("contactsEdition");
        hote.innerHTML = `
        <div class="hab-panneau no-print">
            <p class="hab-note">Les trois premières lignes sont des <strong>références
            publiques</strong>, posées par le Groupe : elles se lisent, elles ne se
            modifient pas ici. Ajoutez votre assurance cyber, votre infogérant et votre
            prestataire de réponse à incident.</p>
            <ul class="fiche-edition-liste" id="ctcListe">
                ${contacts.filter(c => c._porteeGroupe !== true).map(c => `
                <li>
                    <input type="text" data-contact="${esc(c.id)}" data-champ="intitule"
                           value="${esc(c.intitule)}" maxlength="200" placeholder="Intitulé">
                    <input type="text" data-contact="${esc(c.id)}" data-champ="coordonnee"
                           value="${esc(c.coordonnee || "")}" maxlength="200"
                           placeholder="Numéro, adresse ou site">
                    <button type="button" class="ctc-suppr btn-danger" data-contact="${esc(c.id)}"
                            title="Retirer ce contact">&times;</button>
                </li>`).join("")}
            </ul>
            <div class="page-actions">
                <button type="button" id="ctcAjouter" class="btn-secondary">Ajouter un contact</button>
                <button type="button" id="ctcEnregistrer">Enregistrer</button>
                <button type="button" id="ctcFermer" class="btn-secondary">Fermer</button>
            </div>
        </div>`;

        const liste = document.getElementById("ctcListe");
        const ligneVide = () => {
            const li = document.createElement("li");
            li.innerHTML = '<input type="text" data-contact="" data-champ="intitule" maxlength="200" placeholder="Intitulé">'
                + '<input type="text" data-contact="" data-champ="coordonnee" maxlength="200" placeholder="Numéro, adresse ou site">'
                + '<button type="button" class="ctc-suppr btn-danger" data-contact="" title="Retirer ce contact">&times;</button>';
            liste.appendChild(li);
            li.querySelector(".ctc-suppr").addEventListener("click", () => li.remove());
            li.querySelector("input").focus();
        };
        document.getElementById("ctcAjouter").addEventListener("click", ligneVide);
        liste.querySelectorAll(".ctc-suppr").forEach(b =>
            b.addEventListener("click", () => b.parentElement.remove()));
        document.getElementById("ctcFermer").addEventListener("click",
            () => { hote.innerHTML = ""; });

        document.getElementById("ctcEnregistrer").addEventListener("click", () => {
            const lignes = [...liste.querySelectorAll("li")].map(li => ({
                id: li.querySelector('[data-champ="intitule"]').dataset.contact,
                intitule: li.querySelector('[data-champ="intitule"]').value.trim(),
                coordonnee: li.querySelector('[data-champ="coordonnee"]').value.trim()
            })).filter(x => x.intitule !== "");

            const locaux = DataStore.getContactsUrgence().filter(c => c._porteeGroupe !== true);
            locaux.forEach(c => {
                if (!lignes.some(l => l.id === c.id)) DataStore.deleteContactUrgence(c.id);
            });
            lignes.forEach((l, i) => {
                // ⚠️ Une coordonnée VIDE reste `null`, jamais une chaîne vide ni un trait :
                //    « à compléter » doit se voir. Une ligne de tirets bas IMITE une
                //    donnée — elle s'imprime, et le jour de la crise on compose un numéro
                //    qui n'existe pas. C'est ce que le socle livrait avant la `061`.
                const coord = l.coordonnee === "" ? null : l.coordonnee;
                const existant = locaux.find(c => c.id === l.id);
                if (existant) {
                    DataStore.updateContactUrgence(Object.assign({}, existant,
                        { intitule: l.intitule, coordonnee: coord, ordre: (i + 1) * 10 }));
                } else {
                    DataStore.addContactUrgence({
                        id: UI.genId("CTCU"), intitule: l.intitule, coordonnee: coord,
                        ordre: 1000 + (i + 1) * 10, actif: true
                    });
                }
            });
            UI.apresEcriture(() => {
                if (window.showToast) showToast("Contacts enregistrés.", "success");
                renderFiches();
            });
        });
    }

    /* =========================
       LISTE DES MEMBRES (CELLULE DE CRISE)
    ========================== */
    function renderList() {
        const membres = DataStore.getCriseMembres();
        const app = document.getElementById("app");
        const dateJour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

        // Tri par ordre d'importance (simplifié)
        const roleOrder = {
            "Directeur de crise (Décisionnel)": 1,
            "Responsable IT / SSI (Opérationnel)": 2,
            "Responsable Communication": 3,
            "Responsable Juridique / RH": 4,
            "Expert technique (Interne/Externe)": 5,
            "Autre": 6
        };

        const sortedMembres = [...membres].sort((a, b) => {
            return (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99);
        });

        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const rows = sortedMembres.map(m => `
            <tr class="clickable-row" data-id="${m.id}">
                <td class="no-print stop-row-click" style="text-align: center; width: 40px;">
                    <input type="checkbox" class="row-cb" data-id="${m.id}">
                </td>
                <td><strong style="color: var(--primary);">${esc(m.role)}</strong></td>
                <td><strong>${esc(m.nom)}</strong></td>
                <td>${esc(m.telephone) || "-"}</td>
                <td>${m.email ? `<a href="mailto:${esc(m.email)}" class="stop-row-click">${esc(m.email)}</a>` : "-"}</td>
                <td style="font-size: var(--text-sm); color: var(--text-muted);">${esc(m.suppleant) || "Aucun"}</td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Annuaire de la Cellule de Crise</h1>
                    <img class="print-brand-logo" data-brand-logo hidden alt="" />
                    <p>${esc(Identite.piedImpression("Continuité d'activité"))} · Édité le ${dateJour}</p>
                </div>

                <div class="dashboard-header no-print">
                    <div>
                        <h1>Annuaire de la Cellule de Crise</h1>
                        <p class="sous-titre">Périmètre : <strong>Interne (Continuité d'activité)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button type="button" id="fichesReflexesBtn" class="no-print" style="background: var(--bg-body); color: var(--text-main); border: 1px solid var(--border);" title="Cartes d'action par rôle, à imprimer et conserver hors ligne">Fiches réflexes</button>
                        <button type="button" id="printAnnuaireBtn" class="no-print" style="background-color: var(--primary);">Imprimer l'annuaire</button>
                        <button id="addMembreBtn">Ajouter un membre</button>
                    </div>
                </div>

                <div class="synthese-message warning no-print" style="font-size: var(--text-base); padding: 10px; margin-bottom: 20px;">
                    <strong>En cas de crise majeure (Ransomware, Incendie) :</strong> Le SI peut être indisponible. Pensez à imprimer régulièrement cet annuaire et à le conserver dans un lieu sécurisé (ex: Coffre-fort, ou au domicile du Directeur de crise).
                </div>

                <div class="dashboard-card" style="padding: 0; overflow: hidden;">
                    <table class="data-table" style="margin-top: 0; box-shadow: none; border-radius: 0;">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;" class="no-print"><input type="checkbox" id="selectAllCb"></th>
                                <th>Rôle dans la crise</th>
                                <th>Nom & Prénom</th>
                                <th>Téléphone (Urgence)</th>
                                <th>Email (Secours/Perso)</th>
                                <th>Suppléant (N°2)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || "<tr><td colspan='6' style='text-align:center; padding: 2rem;'>La cellule de crise n'est pas encore constituée.</td></tr>"}
                        </tbody>
                    </table>
                </div>
            </section>
        `;

        document.getElementById("addMembreBtn").onclick = renderCreate;
        document.getElementById("fichesReflexesBtn").addEventListener("click", () => Router.navigateTo("/crise-fiches"));
        document.getElementById("printAnnuaireBtn").addEventListener("click", () => window.print());
        // Case à cocher et lien courriel : ne pas ouvrir la fiche du membre.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deleteCriseMembre(id),
            confirm: (n) => `Confirmer la suppression de ${n} membre(s) de la cellule de crise ?`,
            toast: (n) => `${n} membre(s) retiré(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/crise/${row.dataset.id}`);
        });
        if (window.Identite) Identite.brancherLogos();
    }

    /* =========================
       CRÉATION
    ========================== */
    // Lien annuaire → cellule de crise : quand on choisit une personne connue de l'annuaire
    // dans le champ Nom, on pré-remplit téléphone/email (seulement s'ils sont vides).
    function wireNomAutofill() {
        const nomEl = document.getElementById("nom");
        if (!nomEl || !window.UI || !UI.findPersonneByNom) return;
        nomEl.addEventListener("change", () => {
            const p = UI.findPersonneByNom(nomEl.value);
            if (!p) return;
            const tel = document.getElementById("telephone");
            const mail = document.getElementById("email");
            if (tel && !tel.value.trim() && p.telephone) tel.value = p.telephone;
            if (mail && !mail.value.trim() && p.email) mail.value = p.email;
        });
    }

    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouveau membre de la cellule</h1>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>Rôle assigné en cas de crise <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <select id="role">
                            <option value="Directeur de crise (Décisionnel)">Directeur de crise (Pilote / Tranche les décisions)</option>
                            <option value="Responsable IT / SSI (Opérationnel)">Responsable IT / SSI (Coordination technique)</option>
                            <option value="Responsable Communication">Responsable Communication (Interne & Presse)</option>
                            <option value="Responsable Juridique / RH">Responsable Juridique / RH (Déclarations CNIL, Personnel)</option>
                            <option value="Expert technique (Interne/Externe)">Expert technique (Prestataire, Forensics, Réseau...)</option>
                            <option value="Autre">Autre (Logistique, Sécurité physique...)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Nom & Prénom <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <input id="nom" list="personnes-list" placeholder="Ex: Jean DUPONT" required />
                    </div>

                    <div class="grille-2">
                        <div class="form-group">
                            <label>Téléphone (Urgence / Portable)</label>
                            <input id="telephone" type="tel" placeholder="06 XX XX XX XX" />
                        </div>
                        <div class="form-group">
                            <label>Email de secours</label>
                            <input id="email" type="email" placeholder="Adresse alternative (si messagerie pro HS)" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Suppléant (Qui appeler si cette personne est injoignable ?)</label>
                        <input id="suppleant" placeholder="Nom et Téléphone du suppléant" />
                    </div>

                    <div class="form-group">
                        <label>Notes (Responsabilités spécifiques)</label>
                        <textarea id="notes" placeholder="Ex: Doit appeler l'assureur cyber dans les 48h, a les clés de la salle serveur..."></textarea>
                    </div>

                    <div class="mt-20">
                        <button id="saveBtn">Ajouter à l'annuaire</button>
                        <button id="cancelBtn" style="margin-left: 10px;">Annuler</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            DataStore.addCriseMembre({
                id: UI.genId("CRISE"),
                role: document.getElementById("role").value,
                nom: nom,
                telephone: document.getElementById("telephone").value.trim(),
                email: document.getElementById("email").value.trim(),
                suppleant: document.getElementById("suppleant").value.trim(),
                notes: document.getElementById("notes").value.trim()
            });

            if(window.showToast) window.showToast("Membre ajouté à la cellule.", "success");
            Router.navigateTo("/crise");
        };

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/crise");
        wireNomAutofill();
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const membre = DataStore.getCriseMembreById(id);
        const app = document.getElementById("app");

        if (!membre) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Membre introuvable.</p><button type="button" id="backBtn">Retour</button></section>`;
            document.getElementById("backBtn").addEventListener("click", () => Router.navigateTo("/crise"));
            return;
        }

        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Fiche Contact : ${esc(membre.nom)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Retirer le membre</button>
                </div>

                <div class="dashboard-card">
                    <div class="form-group">
                        <label>Rôle assigné en cas de crise <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <select id="role">
                            <option value="Directeur de crise (Décisionnel)" ${membre.role === "Directeur de crise (Décisionnel)" ? "selected" : ""}>Directeur de crise (Pilote / Tranche les décisions)</option>
                            <option value="Responsable IT / SSI (Opérationnel)" ${membre.role === "Responsable IT / SSI (Opérationnel)" ? "selected" : ""}>Responsable IT / SSI (Coordination technique)</option>
                            <option value="Responsable Communication" ${membre.role === "Responsable Communication" ? "selected" : ""}>Responsable Communication (Interne & Presse)</option>
                            <option value="Responsable Juridique / RH" ${membre.role === "Responsable Juridique / RH" ? "selected" : ""}>Responsable Juridique / RH (Déclarations CNIL, Personnel)</option>
                            <option value="Expert technique (Interne/Externe)" ${membre.role === "Expert technique (Interne/Externe)" ? "selected" : ""}>Expert technique (Prestataire, Forensics, Réseau...)</option>
                            <option value="Autre" ${membre.role === "Autre" ? "selected" : ""}>Autre (Logistique, Sécurité physique...)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Nom & Prénom <span class="champ-requis" title="Champ obligatoire" aria-hidden="true">*</span></label>
                        <input id="nom" list="personnes-list" value="${esc(membre.nom)}" required />
                    </div>

                    <div class="grille-2">
                        <div class="form-group">
                            <label>Téléphone (Urgence / Portable)</label>
                            <input id="telephone" type="tel" value="${esc(membre.telephone || "")}" />
                        </div>
                        <div class="form-group">
                            <label>Email de secours</label>
                            <input id="email" type="email" value="${esc(membre.email || "")}" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Suppléant (Qui appeler si cette personne est injoignable ?)</label>
                        <input id="suppleant" value="${esc(membre.suppleant || "")}" />
                    </div>

                    <div class="form-group">
                        <label>Notes (Responsabilités spécifiques)</label>
                        <textarea id="notes">${esc(membre.notes || "")}</textarea>
                    </div>

                    <div class="mt-20">
                        <button id="saveBtn">Mettre à jour</button>
                    </div>
                </div>
            </section>
        `;

        document.getElementById("saveBtn").onclick = () => {
            const nom = document.getElementById("nom").value.trim();
            if (!nom) return alert("Le nom est obligatoire.");

            membre.role = document.getElementById("role").value;
            membre.nom = nom;
            membre.telephone = document.getElementById("telephone").value.trim();
            membre.email = document.getElementById("email").value.trim();
            membre.suppleant = document.getElementById("suppleant").value.trim();
            membre.notes = document.getElementById("notes").value.trim();

            DataStore.updateCriseMembre(membre);
            if(window.showToast) window.showToast("Fiche contact mise à jour.", "success");
            Router.navigateTo("/crise");
        };

        wireNomAutofill();

        UI.wireDelete({
            confirm: "Confirmer le retrait de ce membre de la cellule de crise ?",
            remove: () => DataStore.deleteCriseMembre(membre.id),
            redirect: "/crise"
        });
    }

    return { renderList, renderDetail, renderFiches };
})();