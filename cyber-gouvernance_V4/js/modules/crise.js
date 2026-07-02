// Emplacement : js/modules/crise.js
// Nom du fichier : crise.js

const CriseModule = (() => {

    /* =========================
       FICHES RÉFLEXES DE CRISE
       Contenu générique et pédagogique (le public inclut des non-experts) :
       les gestes prioritaires à effectuer immédiatement, rôle par rôle.
    ========================== */
    const FICHES = [
        {
            role: "Directeur de crise (Décisionnel)",
            short: "Directeur de crise",
            actions: [
                "Activer officiellement la cellule de crise et consigner l'heure de déclenchement.",
                "Réunir les membres via un canal de secours (téléphone / SMS) si la messagerie est indisponible.",
                "Qualifier la gravité et décider du périmètre à isoler ou à arrêter.",
                "Arbitrer la communication (interne, clients, presse) et les déclarations réglementaires.",
                "Décider de l'activation du PRA, du recours aux prestataires et à l'assurance cyber.",
                "Faire tenir une main courante horodatée de toutes les décisions."
            ]
        },
        {
            role: "Responsable IT / SSI (Opérationnel)",
            short: "Responsable IT / SSI",
            actions: [
                "Isoler du réseau les systèmes touchés (débrancher le câble, couper Wi-Fi / VPN) SANS les éteindre — préserver la mémoire et les preuves.",
                "Préserver les preuves : journaux, images disque ; ne rien supprimer ni réinstaller dans l'urgence.",
                "Identifier le point d'entrée (hameçonnage, faille, compte compromis) et stopper la propagation.",
                "Réinitialiser les comptes à privilèges, révoquer sessions, clés et secrets exposés.",
                "Vérifier l'intégrité et l'isolement des sauvegardes AVANT toute restauration.",
                "Rendre compte de l'état technique au Directeur de crise à intervalles réguliers."
            ]
        },
        {
            role: "Responsable Communication",
            short: "Responsable Communication",
            actions: [
                "Préparer des éléments de langage validés par la Direction et le Juridique.",
                "Diffuser des consignes internes (ne pas parler à la presse, vigilance e-mails et pièces jointes).",
                "Centraliser les sollicitations presse et clients via un point de contact unique.",
                "Ne communiquer que des informations confirmées ; éviter tout détail technique exploitable."
            ]
        },
        {
            role: "Responsable Juridique / RH",
            short: "Juridique / RH",
            actions: [
                "Évaluer les obligations de notification : CERT-FR / ANSSI (NIS2, alerte sous 24 h) ; CNIL (RGPD, sous 72 h si données personnelles).",
                "Préparer l'information des personnes concernées en cas de risque élevé (RGPD).",
                "Conserver les preuves à valeur probante et envisager le dépôt de plainte.",
                "Mobiliser l'assurance cyber et vérifier les obligations contractuelles envers les clients."
            ]
        },
        {
            role: "Expert technique (Interne/Externe)",
            short: "Expert technique",
            actions: [
                "Mener l'analyse : recherche du patient zéro et des indicateurs de compromission (IOC).",
                "Contenir puis éradiquer la menace ; assainir avant toute remise en service.",
                "Documenter les IOC et les partager pour renforcer la surveillance."
            ]
        },
        {
            role: "Autre",
            short: "Logistique / Sécurité physique",
            actions: [
                "Sécuriser les locaux et les accès physiques si nécessaire.",
                "Assurer la logistique de la cellule (salle de repli, moyens de secours, intendance)."
            ]
        }
    ];

    // Contacts d'urgence : références publiques + champs à compléter par l'organisation.
    const CONTACTS_URGENCE = [
        ["CERT-FR / ANSSI (déclaration d'incident)", "cert.ssi.gouv.fr"],
        ["CNIL (violation de données, sous 72 h)", "cnil.fr — notifier une violation"],
        ["Assistance cybermalveillance", "cybermalveillance.gouv.fr"],
        ["Forces de l'ordre / dépôt de plainte", "17 (police-secours)"],
        ["Assurance cyber (police n° ____)", "______________________"],
        ["Infogérant / Hébergeur", "______________________"],
        ["Prestataire réponse à incident", "______________________"]
    ];

    function injectFichesStyles() {
        if (document.getElementById("crise-fiches-styles")) return;
        const style = document.createElement("style");
        style.id = "crise-fiches-styles";
        style.textContent = `
            .fiches-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 1.2rem; }
            .fiche-span { grid-column: 1 / -1; }
            .fiche-reflexe { border-top: 4px solid var(--primary); }
            .fiche-role { font-size: 1.05rem; font-weight: 700; color: var(--primary); margin-bottom: 8px; }
            .fiche-label { text-transform: uppercase; font-size: 0.72rem; letter-spacing: 1px; color: var(--text-muted); font-weight: 700; margin: 12px 0 4px; }
            .fiche-holder { padding: 3px 0; }
            .fiche-supp { font-size: 0.85rem; color: var(--text-muted); }
            .fiche-empty { color: var(--text-muted); font-style: italic; }
            .fiche-actions { margin: 4px 0 0; padding-left: 20px; line-height: 1.5; }
            .fiche-actions li { margin-bottom: 6px; }
            .fiche-commun { border-top-color: var(--color-warning); }
            .fiche-commun .fiche-role { color: #e65100; }
            .fiche-contacts { border-top-color: var(--color-danger); }
            .fiche-contacts .fiche-role { color: var(--color-danger); }
            .fiche-contacts table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 6px; }
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

    function renderFiches() {
        const membres = DataStore.getCriseMembres();
        const app = document.getElementById("app");
        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const dateJour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

        // Rattache les titulaires de l'annuaire à chaque fiche (par rôle).
        const byRole = {};
        membres.forEach(m => { (byRole[m.role] = byRole[m.role] || []).push(m); });

        const roleCards = FICHES.map(f => {
            const titulaires = byRole[f.role] || [];
            const holders = titulaires.length
                ? titulaires.map(m => `
                    <div class="fiche-holder">
                        <strong>${esc(m.nom) || "Sans nom"}</strong>${m.telephone ? ` — ${esc(m.telephone)}` : ""}
                        ${m.suppleant ? `<div class="fiche-supp">Suppléant : ${esc(m.suppleant)}</div>` : ""}
                    </div>`).join("")
                : `<div class="fiche-holder fiche-empty">Titulaire à désigner</div>`;
            return `
            <div class="dashboard-card fiche-reflexe">
                <div class="fiche-role">${esc(f.short)}</div>
                <div class="fiche-label">Titulaire(s)</div>
                ${holders}
                <div class="fiche-label">Réflexes immédiats</div>
                <ol class="fiche-actions">${f.actions.map(a => `<li>${esc(a)}</li>`).join("")}</ol>
            </div>`;
        }).join("");

        const contactsRows = CONTACTS_URGENCE.map(c => `<tr><td>${esc(c[0])}</td><td>${esc(c[1])}</td></tr>`).join("");

        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Fiches réflexes de crise</h1>
                    <p>Dedienne Aerospace · Gestion de crise cyber · Édité le ${esc(dateJour)}</p>
                </div>

                <div class="dashboard-header no-print">
                    <div>
                        <h1>Fiches réflexes de crise</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Que faire dans les premières minutes, rôle par rôle. ${Help.tip("Une fiche réflexe est une carte d'action synthétique : les gestes prioritaires à effectuer immédiatement, sans avoir à réfléchir dans l'urgence.")}</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="no-print" onclick="Router.navigateTo('/crise')" style="background: var(--bg-body); color: var(--text-main); border: 1px solid var(--border);">Retour à l'annuaire</button>
                        <button class="no-print" onclick="window.print()" style="background-color: var(--primary);">Imprimer les fiches</button>
                    </div>
                </div>

                <div class="synthese-message warning no-print" style="font-size: 0.9rem; padding: 10px; margin-bottom: 20px;">
                    <strong>À imprimer et conserver hors ligne :</strong> en cas de crise majeure (rançongiciel, incendie), le SI et cette application peuvent être indisponibles. Gardez une copie papier à jour dans un lieu sécurisé.
                </div>

                <div class="fiches-grid">
                    <div class="dashboard-card fiche-reflexe fiche-commun fiche-span">
                        <div class="fiche-role">Réflexes communs à tous</div>
                        <ul class="fiche-actions">
                            <li>Rester calme et méthodique ; ne payer aucune rançon sans décision de la cellule.</li>
                            <li>Utiliser les canaux de secours (téléphone, hors SI compromis) ; considérer la messagerie professionnelle comme compromise.</li>
                            <li>Tout horodater dans une main courante unique (heure, fait, décision, auteur).</li>
                            <li>Ne rien communiquer à l'extérieur sans validation du Directeur de crise.</li>
                        </ul>
                    </div>
                    ${roleCards}
                    <div class="dashboard-card fiche-reflexe fiche-contacts fiche-span">
                        <div class="fiche-role">Contacts d'urgence <span style="font-weight:400; font-size:0.85rem; color:var(--text-muted);">(à compléter et vérifier régulièrement)</span></div>
                        <table><tbody>${contactsRows}</tbody></table>
                    </div>
                </div>
            </section>
        `;

        injectFichesStyles();
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
                <td class="no-print" style="text-align: center; width: 40px;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="row-cb" data-id="${m.id}">
                </td>
                <td><strong style="color: var(--primary);">${esc(m.role)}</strong></td>
                <td><strong>${esc(m.nom)}</strong></td>
                <td>${esc(m.telephone) || "-"}</td>
                <td>${m.email ? `<a href="mailto:${esc(m.email)}" onclick="event.stopPropagation();">${esc(m.email)}</a>` : "-"}</td>
                <td style="font-size: 0.85rem; color: var(--text-muted);">${esc(m.suppleant) || "Aucun"}</td>
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Annuaire de la Cellule de Crise</h1>
                    <p>Dedienne Aerospace · Continuité d'activité · Édité le ${dateJour}</p>
                </div>

                <div class="dashboard-header no-print">
                    <div>
                        <h1>Annuaire de la Cellule de Crise</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (Continuité d'activité)</strong></p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>
                        <button class="no-print" onclick="Router.navigateTo('/crise-fiches')" style="background: var(--bg-body); color: var(--text-main); border: 1px solid var(--border);" title="Cartes d'action par rôle, à imprimer et conserver hors ligne">Fiches réflexes</button>
                        <button class="no-print" onclick="window.print()" style="background-color: var(--primary);">Imprimer l'annuaire</button>
                        <button id="addMembreBtn">Ajouter un membre</button>
                    </div>
                </div>

                <div class="synthese-message warning no-print" style="font-size: 0.9rem; padding: 10px; margin-bottom: 20px;">
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
    }

    /* =========================
       CRÉATION
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");

        app.innerHTML = `
            <section class="page">
                <h1>Nouveau membre de la cellule</h1>

                <div class="dashboard-card" style="max-width: 800px;">
                    <div class="form-group">
                        <label>Rôle assigné en cas de crise <span style="color:red">*</span></label>
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
                        <label>Nom & Prénom <span style="color:red">*</span></label>
                        <input id="nom" placeholder="Ex: Jean DUPONT" required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
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

                    <div style="margin-top: 20px;">
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
                id: "CRISE-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
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
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const membre = DataStore.getCriseMembreById(id);
        const app = document.getElementById("app");

        if (!membre) {
            app.innerHTML = `<section class="page"><h1>Erreur</h1><p>Membre introuvable.</p><button onclick="Router.navigateTo('/crise')">Retour</button></section>`;
            return;
        }

        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Fiche Contact : ${esc(membre.nom)}</h1>
                    <button id="deleteBtn" style="background-color: var(--color-danger);">Retirer le membre</button>
                </div>

                <div class="dashboard-card" style="max-width: 800px;">
                    <div class="form-group">
                        <label>Rôle assigné en cas de crise <span style="color:red">*</span></label>
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
                        <label>Nom & Prénom <span style="color:red">*</span></label>
                        <input id="nom" value="${esc(membre.nom)}" required />
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
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

                    <div style="margin-top: 20px;">
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

        UI.wireDelete({
            confirm: "Confirmer le retrait de ce membre de la cellule de crise ?",
            remove: () => DataStore.deleteCriseMembre(membre.id),
            redirect: "/crise"
        });
    }

    return { renderList, renderDetail, renderFiches };
})();