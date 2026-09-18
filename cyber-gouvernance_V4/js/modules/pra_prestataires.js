// Emplacement : js/modules/pra_prestataires.js
// Nom du fichier : pra_prestataires.js

const PraPrestatairesModule = (() => {

    const esc = (s) => (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? "" : s));

    /* =========================
       ÉVALUATION DU RISQUE FOURNISSEUR (TIERS)
       Risque inhérent = criticité (impact si défaillance) × niveau d'accès.
    ========================== */
    const CRITICITE_OPTS = [["", "— Non évaluée —"], ["faible", "Faible"], ["moyenne", "Moyenne"], ["forte", "Forte"], ["vitale", "Vitale"]];
    const ACCES_OPTS = [["", "— Non évalué —"], ["aucun", "Aucun accès"], ["limite", "Accès limité"], ["etendu", "Accès étendu / privilégié"]];

    /* ── ⚠️ LES POIDS NE SONT PLUS ÉCRITS ICI — lot L21, action 21.4 ────────
       Ce fichier portait `CRIT_W = { faible: 1, … }` et `ACCES_W = { … }`
       depuis le premier chantier : les mêmes poids que la base, écrits une
       seconde fois. Tant que le score était un produit de DEUX facteurs, la
       duplication était visible et inoffensive.

       Elle cesse de l'être avec le score composite : quatre facteurs, dont
       deux que le navigateur ne peut pas connaître — la couverture des
       exigences de chaîne telle que le serveur la calcule, et l'ancienneté de
       la dernière évaluation, qui vieillit d'un jour par jour. Deux rédactions
       d'une même règle divergent, et c'est la version faible qui l'emporte.

       Le barème est donc SERVI (`GET /api/tiers/bareme`), et l'aperçu du
       formulaire calcule AVEC lui. ⚠️ Tant qu'il n'est pas arrivé, l'aperçu ne
       DEVINE pas : il dit qu'il ne sait pas encore. Un chiffre inventé en
       attendant serait pire qu'une absence de chiffre — c'est la règle du
       `CLAUDE.md` §3, et celle de `/api/consolidation` : null, jamais zéro. */
    let bareme = null;

    /** Charge le barème une fois, et rejoue `apres` quand il est là. */
    function avecBareme(apres) {
        if (bareme !== null) { apres(); return; }
        if (!window.Api || typeof Api.tiersBareme !== "function") return;
        Api.tiersBareme().then(r => {
            bareme = (r && r.bareme) || null;
            apres();
        }).catch(() => {
            /* Le serveur n'a pas répondu : on ne fabrique pas de poids de
               secours. L'aperçu restera muet, et la liste affichera le score
               que le serveur, lui, sait calculer. */
        });
    }

    // Exigences de sécurité de la chaîne d'approvisionnement (NIS2 art. 21 / DORA).
    const SUPPLY_REQS = [
        { id: "clause",        label: "Clause de sécurité au contrat (obligations, SLA sécurité)", ref: "NIS2 art. 21" },
        { id: "notif",         label: "Notification des incidents par le fournisseur (délai contractuel)", ref: "NIS2 / DORA" },
        { id: "audit",         label: "Droit d'audit & preuves de conformité (ISO 27001, SOC 2, HDS…)", ref: "DORA" },
        { id: "donnees",       label: "Localisation des données & encadrement de la sous-traitance", ref: "NIS2 / RGPD" },
        { id: "reversibilite", label: "Plan de réversibilité / stratégie de sortie", ref: "DORA" },
        { id: "continuite",    label: "Continuité & résilience testée (dépendance critique)", ref: "DORA" }
    ];

    /** Ce que chaque niveau rendu par le serveur vaut à l'écran. */
    const NIVEAUX = Object.freeze({
        non_evalue: { libelle: "Non évalué", color: "var(--color-gray, #9e9e9e)" },
        faible:     { libelle: "Faible",     color: "var(--color-success)" },
        modere:     { libelle: "Modéré",     color: "var(--color-warning)" },
        eleve:      { libelle: "Élevé",      color: "#e53935" },
        critique:   { libelle: "Critique",   color: "#b71c1c" }
    });

    /**
     * L'APERÇU du formulaire — criticité × accès, avec les poids SERVIS.
     *
     * ⚠️ Ce n'est PAS le score du produit, et l'écran le dit : il manque les
     * deux facteurs que seule la base connaît au moment de la saisie (la
     * couverture telle qu'elle sera enregistrée, l'ancienneté de l'évaluation).
     * Un enregistrement qui n'existe pas encore ne peut pas être scoré par le
     * serveur ; c'est la seule raison pour laquelle ce calcul existe ici.
     */
    function apercuRisque(p) {
        if (bareme === null) return null;
        const cw = bareme.criticite[(p && p.criticite) || ""] || 0;
        const aw = bareme.acces[(p && p.acces) || ""] || 0;
        if (!cw || !aw) return { score: null, niveau: "non_evalue" };
        const score = cw * aw;
        const paliers = bareme.paliers;
        const niveau = score <= paliers.faible ? "faible"
            : score <= paliers.modere ? "modere"
            : score <= paliers.eleve ? "eleve" : "critique";
        return { score, niveau };
    }

    function coverage(p) {
        const sc = (p && p.supplyChain) || {};
        const done = SUPPLY_REQS.filter(r => sc[r.id]).length;
        return { done, total: SUPPLY_REQS.length, pct: Math.round(done / SUPPLY_REQS.length * 100) };
    }

    /** Badge d'un niveau rendu par le serveur (ou d'un aperçu). */
    function badgeNiveau(niveau, score) {
        const n = NIVEAUX[niveau] || NIVEAUX.non_evalue;
        const chiffre = (score === null || score === undefined) ? "" : ` · ${esc(String(score))}`;
        return `<span class="badge" style="background:${n.color}; color:#fff;">${esc(n.libelle)}${chiffre}</span>`;
    }

    /** L'ardoise d'attente : on ne montre pas un chiffre qu'on n'a pas. */
    function badgeEnAttente() {
        return `<span class="badge" style="background:#eee; color:#666;">Calcul en cours…</span>`;
    }

    function coverageBadge(p) {
        const c = coverage(p);
        const col = c.pct >= 80 ? "var(--color-success)" : c.pct >= 40 ? "var(--color-warning)" : "var(--color-danger)";
        return `<span class="badge" title="Exigences chaîne d'appro (NIS2/DORA) satisfaites" style="background:#eee; color:${col}; font-weight:700;">Chaîne ${c.done}/${c.total}</span>`;
    }

    function optionsHtml(opts, current) {
        return opts.map(([v, l]) => `<option value="${v}" ${current === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    }

    // Section "risque fournisseur" partagée par la création et l'édition.
    function riskSectionHtml(p) {
        p = p || {};
        const reqs = SUPPLY_REQS.map(r => {
            const checked = p.supplyChain && p.supplyChain[r.id] ? "checked" : "";
            return `
            <label class="checkbox-line" style="display:flex; align-items:flex-start; gap:8px; padding:6px 0; border-bottom:1px dashed var(--border);">
                <input type="checkbox" class="sc-cb" data-id="${r.id}" ${checked} style="margin-top:3px;">
                <span>${esc(r.label)} <span class="badge" style="background:#eef; color:#334; font-size: var(--text-xs);">${esc(r.ref)}</span></span>
            </label>`;
        }).join("");
        return `
            <div class="dashboard-card" style="max-width:600px; margin-top:1.2rem; border-top:3px solid var(--primary);">
                <h3 style="margin-top:0;">Risque fournisseur &amp; chaîne d'appro ${Help.tip("Évaluez le risque que ce tiers fait porter à votre organisation. NIS2 impose de sécuriser sa chaîne d'approvisionnement ; DORA encadre les prestataires TIC critiques.")}</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Criticité pour vos activités ${Help.tip("Impact si ce fournisseur défaille ou est compromis.")}</label>
                        <select id="criticite">${optionsHtml(CRITICITE_OPTS, p.criticite || "")}</select>
                    </div>
                    <div class="form-group">
                        <label>Accès à votre SI / vos données ${Help.tip("Un accès étendu (administration, données sensibles) augmente le risque.")}</label>
                        <select id="acces">${optionsHtml(ACCES_OPTS, p.acces || "")}</select>
                    </div>
                </div>
                <div style="background:var(--bg-body); border:1px solid var(--border); border-radius:8px; padding:12px; text-align:center; margin:6px 0 16px;">
                    Aperçu du risque inhérent ${Help.tip("C'est un APERÇU : criticité × accès. Le score du registre y ajoute la substituabilité, la couverture des exigences de chaîne et l'ancienneté de la dernière évaluation — trois facteurs que le serveur calcule à l'enregistrement.")} : <span id="riskPreview">${badgeEnAttente()}</span>
                </div>
                <label style="font-weight:700;">Exigences de sécurité de la chaîne d'approvisionnement</label>
                <p style="color:var(--text-muted); font-size: var(--text-sm); margin:2px 0 8px;">Points de vigilance contractuels et opérationnels attendus (NIS2 / DORA).</p>
                ${reqs}
            </div>`;
    }

    // Branche le recalcul en direct du badge de risque (create + detail).
    function wireRiskSection() {
        ["criticite", "acces"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", updateRiskPreview);
        });
    }

    // Recalcule l'aperçu en direct quand criticité/accès changent.
    //
    // ⚠️ Tant que le barème n'est pas arrivé du serveur, l'aperçu reste muet :
    // il n'invente pas de poids. Le badge dit « Calcul en cours… » plutôt que
    // d'afficher un chiffre faux — un écran qui affirme ce qu'il ne sait pas
    // apprend à ne plus être cru, y compris le jour où il dit vrai (classe des
    // constats Q-201 / Q-207).
    function updateRiskPreview() {
        const el = document.getElementById("riskPreview");
        if (!el) return;
        avecBareme(() => {
            const cible = document.getElementById("riskPreview");
            if (!cible) return;
            const apercu = apercuRisque({
                criticite: (document.getElementById("criticite") || {}).value || "",
                acces: (document.getElementById("acces") || {}).value || ""
            });
            cible.innerHTML = apercu === null
                ? badgeEnAttente()
                : badgeNiveau(apercu.niveau, apercu.score);
        });
    }

    // Collecte les champs de risque depuis le formulaire (création/édition).
    function collectRisk() {
        const supplyChain = {};
        document.querySelectorAll(".sc-cb").forEach(cb => { supplyChain[cb.dataset.id] = cb.checked; });
        return {
            criticite: (document.getElementById("criticite") || {}).value || "",
            acces: (document.getElementById("acces") || {}).value || "",
            supplyChain
        };
    }

    /* =====================================================================
       LE REGISTRE D'INFORMATION DORA — lot L21, actions 21.1 et 21.3
    ===================================================================== */

    /** Les catégories de services TIC, telles que la base les admet. */
    const SERVICE_OPTS = [
        ["", "— Non renseigné —"],
        ["hebergement", "Hébergement / centre de données"],
        ["cloud_iaas", "Cloud — infrastructure (IaaS)"],
        ["cloud_paas", "Cloud — plateforme (PaaS)"],
        ["cloud_saas", "Cloud — logiciel (SaaS)"],
        ["reseau", "Réseau / télécommunications"],
        ["infogerance", "Infogérance / exploitation"],
        ["developpement", "Développement / maintenance applicative"],
        ["securite", "Services de sécurité"],
        ["autre", "Autre service TIC"]
    ];

    const SUBSTITUABILITE_OPTS = [
        ["", "— Non évaluée —"],
        ["facile", "Facilement remplaçable"],
        ["difficile", "Difficilement remplaçable"],
        ["impossible", "Non remplaçable en pratique"]
    ];

    function champ(id, valeur, attributs) {
        return `<input id="${id}" value="${esc(valeur || "")}" ${attributs || ""} />`;
    }

    /**
     * La section « registre DORA & contrat », partagée par la création et
     * l'édition — comme `riskSectionHtml`.
     *
     * ⚠️ **Tout y est facultatif, sauf ce que la base impose.** Un parc de deux
     * cents tiers ne se remplit pas d'un coup, et un écran qui exigerait les
     * quatorze champs à la création empêcherait d'enregistrer le numéro
     * d'urgence d'un hébergeur un soir de crise — c'est-à-dire l'usage premier
     * de cet annuaire. Ce qui manque est DIT plus tard, dans le registre, où
     * c'est un plan de travail et non un barrage.
     */
    function doraSectionHtml(p) {
        p = p || {};
        return `
            <div class="dashboard-card" style="max-width:600px; margin-top:1.2rem; border-top:3px solid var(--primary);">
                <h3 style="margin-top:0;">Registre d'information DORA ${Help.tip("Le règlement DORA (article 28) impose de tenir un registre de tous les arrangements contractuels portant sur des services TIC. C'est la pièce que l'autorité réclame en premier.")}</h3>
                <p style="color:var(--text-muted); font-size: var(--text-sm); margin:2px 0 12px;">
                    Facultatif ici, exigé à la remise : l'onglet « Registre DORA » dit, tiers par tiers, ce qui manque encore.
                </p>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Identifiant LEI ${Help.tip("Legal Entity Identifier (ISO 17442) : 20 caractères. C'est la clé sans laquelle deux registres de deux entités ne se recoupent pas. Il se demande à un émetteur accrédité, ou se retrouve dans l'annuaire mondial GLEIF.")}</label>
                        ${champ("lei", p.lei, 'placeholder="20 caractères, ex. 969500HX7PZQ1L2M3N45" maxlength="20"')}
                    </div>
                    <div class="form-group">
                        <label>Pays du prestataire ${Help.tip("Code ISO 3166-1 à deux lettres, en majuscules : FR, DE, IE…")}</label>
                        ${champ("pays", p.pays, 'placeholder="FR" maxlength="2" style="text-transform:uppercase;"')}
                    </div>
                </div>

                <div class="form-group">
                    <label>Fonction soutenue par ce contrat</label>
                    ${champ("fonction_supportee", p.fonction_supportee, 'placeholder="Ex : hébergement de l\'ERP de production"')}
                </div>

                <label class="checkbox-line" style="display:flex; align-items:flex-start; gap:8px; padding:8px 0;">
                    <input type="checkbox" id="fonction_critique" ${p.fonction_critique ? "checked" : ""} style="margin-top:3px;">
                    <span>
                        <strong>Fonction critique ou importante</strong>
                        ${Help.tip("Au sens de l'article 3 (22) de DORA : une fonction dont l'interruption compromettrait la continuité de l'activité, la solidité financière, ou le respect des obligations réglementaires. C'est ce seul drapeau qui fait basculer le contrat dans le régime renforcé de l'article 30 §3.")}
                        <br><span style="color:var(--text-muted); font-size: var(--text-sm);">Coché, ce tiers devra porter une substituabilité et un plan de sortie daté.</span>
                    </span>
                </label>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Type de service TIC</label>
                        <select id="type_service">${optionsHtml(SERVICE_OPTS, p.type_service || "")}</select>
                    </div>
                    <div class="form-group">
                        <label>Pays de traitement des données ${Help.tip("Là où les données sont effectivement stockées ou traitées — souvent différent du pays du prestataire. L'article 28 §2 g) demande les deux.")}</label>
                        ${champ("pays_donnees", p.pays_donnees, 'placeholder="IE" maxlength="2" style="text-transform:uppercase;"')}
                    </div>
                </div>

                <h4 style="margin:18px 0 6px;">Contrat et sortie</h4>
                <div class="form-group">
                    <label>Référence du contrat</label>
                    ${champ("contrat_reference", p.contrat_reference, 'placeholder="Ex : CTR-2024-018"')}
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Début</label>
                        ${champ("contrat_debut", p.contrat_debut, 'type="date"')}
                    </div>
                    <div class="form-group">
                        <label>Fin ${Help.tip("Laissez vide pour un contrat à tacite reconduction : c'est le cas le plus fréquent, et inventer une date de fin ferait sonner une échéance qui n'existe pas.")}</label>
                        ${champ("contrat_fin", p.contrat_fin, 'type="date"')}
                    </div>
                    <div class="form-group">
                        <label>Prochaine revue ${Help.tip("Cette date alimente l'Échéancier, avec les autres obligations datées du produit.")}</label>
                        ${champ("contrat_revue_le", p.contrat_revue_le, 'type="date"')}
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                    <div class="form-group">
                        <label>Substituabilité ${Help.tip("Article 28 §8 : à quel point ce prestataire est remplaçable. Un tiers irremplaçable porte un risque que ni sa criticité ni son niveau d'accès ne disent.")}</label>
                        <select id="substituabilite">${optionsHtml(SUBSTITUABILITE_OPTS, p.substituabilite || "")}</select>
                    </div>
                    <div class="form-group">
                        <label>Dernière évaluation du tiers ${Help.tip("Elle entre dans le score de risque : une évaluation de plus de deux ans pèse autant qu'une évaluation jamais faite.")}</label>
                        ${champ("evalue_le", p.evalue_le, 'type="date"')}
                    </div>
                </div>

                <div class="form-group">
                    <label>Plan de sortie ${Help.tip("Comment sortir du contrat sans interrompre la fonction soutenue. DORA article 28 §8 demande une stratégie de sortie TESTÉE — donc datée.")}</label>
                    <textarea id="plan_sortie" style="min-height:70px;" placeholder="Ex : export mensuel chiffré, bascule vers le socle interne, délai de reprise estimé.">${esc(p.plan_sortie || "")}</textarea>
                </div>
                <div class="form-group" style="max-width:280px;">
                    <label>Date du plan de sortie <span style="color:red">*</span> ${Help.tip("Obligatoire dès qu'un plan de sortie est saisi : un plan non daté est le document que personne ne relit. La base le refuse.")}</label>
                    ${champ("plan_sortie_le", p.plan_sortie_le, 'type="date"')}
                </div>
            </div>`;
    }

    /**
     * Collecte les champs DORA.
     *
     * ⚠️ **Une chaîne vide part telle quelle, et c'est voulu** : la couche
     * d'écriture du serveur DÉCOUVRE, dans le catalogue, les colonnes dont le
     * schéma refuse le vide, et les convertit en « non renseigné ». Convertir
     * ici serait une seconde rédaction de cette règle — et elle divergerait à la
     * première colonne ajoutée.
     */
    function collectDora() {
        const val = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : "";
        };
        const coche = (id) => {
            const el = document.getElementById(id);
            return el ? el.checked : false;
        };
        return {
            // Les deux codes pays et le LEI se saisissent en majuscules : la base
            // les refuse autrement, et corriger la casse à l'écran vaut mieux que
            // de renvoyer l'utilisateur à un refus qu'il ne comprendra pas.
            lei: val("lei").toUpperCase(),
            pays: val("pays").toUpperCase(),
            pays_donnees: val("pays_donnees").toUpperCase(),
            fonction_supportee: val("fonction_supportee"),
            fonction_critique: coche("fonction_critique"),
            type_service: val("type_service"),
            contrat_reference: val("contrat_reference"),
            contrat_debut: val("contrat_debut"),
            contrat_fin: val("contrat_fin"),
            contrat_revue_le: val("contrat_revue_le"),
            substituabilite: val("substituabilite"),
            plan_sortie: val("plan_sortie"),
            plan_sortie_le: val("plan_sortie_le"),
            evalue_le: val("evalue_le")
        };
    }

    /* =====================================================================
       LA CHAÎNE DE SOUS-TRAITANCE — lot L21, action 21.1 (DORA article 29)
    ===================================================================== */

    /**
     * Le panneau de sous-traitance d'un tiers, sur sa fiche.
     *
     * ⚠️ **Il montre DEUX choses qu'il ne faut pas confondre** : les
     * sous-traitants DIRECTS, qu'on déclare ici, et la chaîne COMPLÈTE avec le
     * rang de chaque maillon, que le serveur dérive. Les afficher ensemble sans
     * les distinguer laisserait croire qu'on a déclaré cinq contrats quand on en
     * a déclaré un.
     *
     * ⚠️ Et le rang n'est **pas** calculé ici. Il vient de
     * `GET /api/tiers/chaine/:id`, avec le CHEMIN qui le justifie — c'est ce
     * chemin qui rend le rang vérifiable par un auditeur, au lieu d'un nombre
     * qu'il faudrait croire sur parole.
     */
    function sousTraitancePanelHtml(p) {
        const autres = DataStore.getPrestataires().filter(x => x.id !== p.id);
        const options = [["", "— Choisir un tiers déjà enregistré —"]]
            .concat(autres.map(x => [x.id, x.societe]));
        return `
            <div class="dashboard-card" style="max-width:600px; margin-top:1.2rem; border-top:3px solid var(--primary);">
                <h3 style="margin-top:0;">Sous-traitance ${Help.tip("L'article 29 de DORA demande de connaître les sous-traitants qui interviennent dans une fonction critique ou importante : un prestataire qui sous-traite déplace le risque, il ne le réduit pas.")}</h3>

                <div id="chaineTiers" style="margin-bottom:14px;">
                    <span class="badge" style="background:#eee; color:#666;">Chargement de la chaîne…</span>
                </div>

                <label style="font-weight:700;">Déclarer un sous-traitant direct</label>
                <p style="color:var(--text-muted); font-size: var(--text-sm); margin:2px 0 8px;">
                    Le sous-traitant doit d'abord exister dans cet annuaire : c'est un tiers comme un autre,
                    et il le restera le jour où vous contracterez directement avec lui.
                </p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div class="form-group">
                        <label>Tiers</label>
                        <select id="stCible">${optionsHtml(options, "")}</select>
                    </div>
                    <div class="form-group">
                        <label>Ce qui est sous-traité</label>
                        <input id="stService" placeholder="Ex : sauvegarde des volumes" />
                    </div>
                </div>
                <label class="checkbox-line" style="display:flex; align-items:center; gap:8px; padding:4px 0 10px;">
                    <input type="checkbox" id="stCritique">
                    <span>Intervient dans la fonction critique ou importante</span>
                </label>
                <button type="button" id="stAjouter" style="background:var(--primary);">Ajouter le sous-traitant</button>
                <p id="stErreur" class="synthese-message danger" style="display:none; margin-top:10px;"></p>
            </div>`;
    }

    /** Branche le panneau de sous-traitance et charge la chaîne dérivée. */
    function wireSousTraitance(prestataireId) {
        rafraichirChaine(prestataireId);

        const bouton = document.getElementById("stAjouter");
        if (!bouton) return;
        bouton.addEventListener("click", () => {
            const cible = (document.getElementById("stCible") || {}).value || "";
            const erreur = document.getElementById("stErreur");
            if (erreur) erreur.style.display = "none";
            if (!cible) {
                if (erreur) {
                    erreur.textContent = "Choisissez d'abord le tiers qui intervient comme sous-traitant.";
                    erreur.style.display = "block";
                }
                return;
            }
            // ⚠️ **On ne vérifie PAS ici que l'arête ne referme pas une boucle.**
            // C'est la base qui refuse (code GRC08), et c'est délibéré : il y a
            // quatre chemins d'écriture — cet écran, l'import généralisé, la
            // reprise d'un export, et psql —, et un contrôle posé ici n'en
            // verrait qu'un. L'écran se contente d'AFFICHER le refus.
            DataStore.addSousTraitance({
                id: UI.genId("SOUS"),
                prestataire_id: prestataireId,
                sous_traitant_id: cible,
                service: (document.getElementById("stService") || {}).value.trim(),
                dans_fonction_critique: (document.getElementById("stCritique") || {}).checked || false
            });
            if (window.showToast) window.showToast("Sous-traitant déclaré.", "success");
            rafraichirChaine(prestataireId);
        });
    }

    /** Recharge la chaîne DÉRIVÉE depuis le serveur. */
    function rafraichirChaine(prestataireId) {
        const zone = document.getElementById("chaineTiers");
        if (!zone || !window.Api || typeof Api.tiersChaine !== "function") return;
        UI.apresEcriture(() => Api.tiersChaine(prestataireId).then(r => {
            const cible = document.getElementById("chaineTiers");
            if (!cible) return;
            const maillons = (r && r.maillons) || [];
            if (maillons.length === 0) {
                // Un vide qui DIT pourquoi : le serveur rend le motif, on ne le
                // réécrit pas ici (classe des constats Q-201 / Q-207).
                cible.innerHTML = `<p style="color:var(--text-muted); font-size: var(--text-sm); margin:0;">${esc((r && r.motif) || "Aucune sous-traitance déclarée.")}</p>`;
                return;
            }
            const lignes = maillons.map(m => `
                <tr>
                    <td><span class="badge" style="background:#eef; color:#334;">Rang ${esc(String(m.rang))}</span></td>
                    <td><strong>${esc(m.societe)}</strong>${m.dansFonctionCritique ? ` <span class="badge" style="background:#ffebee; color:#b71c1c;">Fonction critique</span>` : ""}</td>
                    <td style="font-size: var(--text-sm);">${esc(m.service || "—")}</td>
                    <td style="font-size: var(--text-xs); color:var(--text-muted); font-family: var(--font-mono, monospace);">${esc(m.chemin.join(" → "))}</td>
                    <td class="no-print"><button type="button" class="st-retirer" data-id="${esc(m.id)}" data-rang="${esc(String(m.rang))}" style="background:var(--color-danger);">Retirer</button></td>
                </tr>`).join("");
            cible.innerHTML = `
                <table class="data-table" style="margin:0;">
                    <thead><tr><th>Rang</th><th>Sous-traitant</th><th>Objet</th><th>Chemin</th><th class="no-print"></th></tr></thead>
                    <tbody>${lignes}</tbody>
                </table>
                <p style="color:var(--text-muted); font-size: var(--text-xs); margin:6px 0 0;">
                    Le rang est DÉRIVÉ du parcours de la chaîne : intercaler un maillon déplace
                    tout ce qui suit, sans qu'aucune ressaisie ne soit nécessaire. Le chemin est
                    donné pour que le rang soit vérifiable.
                </p>`;
            // ⚠️ Seuls les sous-traitants DIRECTS se retirent d'ici : un maillon
            // de rang 2 appartient à la chaîne d'un AUTRE tiers, et le retirer
            // depuis cette fiche modifierait un contrat qui n'est pas le sien.
            cible.querySelectorAll(".st-retirer").forEach(b => {
                if (b.dataset.rang !== "1") {
                    b.disabled = true;
                    b.title = "Ce maillon appartient à la chaîne d'un autre tiers : "
                        + "retirez-le depuis la fiche de son donneur d'ordre.";
                    b.style.background = "var(--color-gray, #9e9e9e)";
                    return;
                }
                b.addEventListener("click", () => {
                    const arete = DataStore.getSousTraitancesDe(prestataireId)
                        .find(a => a.sous_traitant_id === b.dataset.id);
                    if (!arete) return;
                    if (!confirm("Retirer ce sous-traitant de la chaîne ?")) return;
                    DataStore.deleteSousTraitance(arete.id);
                    rafraichirChaine(prestataireId);
                });
            });
        }).catch(() => {
            const cible = document.getElementById("chaineTiers");
            if (cible) {
                cible.innerHTML = `<p class="synthese-message danger" style="margin:0;">La chaîne de sous-traitance n'a pas pu être chargée. Elle est calculée par le serveur ; rien n'est affiché plutôt qu'une chaîne incomplète.</p>`;
            }
        }));
    }

    /* =====================================================================
       LE QUESTIONNAIRE FOURNISSEUR — lot L21, action 21.2
    ===================================================================== */

    /**
     * Ce que chaque état rendu par le serveur veut dire, et de quel ton.
     *
     * ⚠️ **« brouillon » est NEUTRE, pas orange.** Un questionnaire pas encore
     * envoyé n'est pas un retard : c'est un travail en cours, et le peindre en
     * alerte fabriquerait des reproches que l'utilisateur s'est adressés à
     * lui-même. La première chose qu'on fait d'une alerte sans objet est de
     * cesser de la lire — et le jour où une vraie alerte paraît, on ne la voit
     * plus.
     */
    const ETATS_QUESTIONNAIRE = Object.freeze({
        brouillon:  { libelle: "Brouillon",  classe: "status-non-applicable",
                      dit: "Pas encore envoyé. Rien n'est attendu de personne." },
        en_attente: { libelle: "En attente", classe: "status-partiellement-conforme",
                      dit: "Envoyé, réponse attendue." },
        en_retard:  { libelle: "En retard",  classe: "status-non-conforme",
                      dit: "L'échéance est passée et rien n'est revenu." },
        recu:       { libelle: "Reçu",       classe: "status-conforme",
                      dit: "Les réponses sont arrivées." }
    });

    /** Les colonnes du classeur d'échange — SERVIES au fournisseur et relues. */
    const COLONNES_QUESTIONNAIRE = Object.freeze({
        code: "Code",
        question: "Question",
        reponse: "Réponse (oui / non / partiel / na)",
        commentaire: "Commentaire",
        preuve: "Preuve (référence)"
    });

    /** Les référentiels disponibles, tels que le catalogue les connaît. */
    function referentielsDisponibles() {
        if (typeof Referentiels === "undefined") return [];
        return (Referentiels.all() || []).map(r => [r.id, r.nom + " (" + r.id + ")"]);
    }

    /** Les questions d'un référentiel, à plat : [{ code, titre }]. */
    function questionsDe(refId) {
        if (typeof Referentiels === "undefined") return [];
        const ref = Referentiels.get(refId);
        if (!ref || !Array.isArray(ref.domaines)) return [];
        const plat = [];
        ref.domaines.forEach(d => {
            (d.exigences || []).forEach(e => plat.push({ code: e.code, titre: e.titre }));
        });
        return plat;
    }

    /**
     * Le panneau « Questionnaires » d'une fiche de tiers.
     *
     * ⚠️ **Le produit n'ENVOIE rien**, et l'écran le dit en toutes lettres. Les
     * dates d'envoi et de relance sont des **faits consignés** : le produit n'a
     * ni l'accord du fournisseur, ni la garantie que l'adresse de l'annuaire
     * d'urgence est celle du bon interlocuteur, ni — en déploiement VPN — le
     * droit de supposer qu'une sortie de messagerie existe.
     *
     * Ce qu'il apporte en échange n'est pas rien : l'échéance entre dans
     * l'échéancier, le retard se dérive tout seul, et la relance cesse d'être un
     * post-it. Le portail qui enverrait vraiment est le lot **L28**.
     */
    function questionnairesPanelHtml() {
        const refs = [["", "— Choisir un référentiel —"]].concat(referentielsDisponibles());
        return `
            <div class="dashboard-card" style="max-width:600px; margin-top:1.2rem; border-top:3px solid var(--primary);">
                <h3 style="margin-top:0;">Questionnaires de sécurité ${Help.tip("Un questionnaire se construit depuis un référentiel que vous possédez déjà, s'exporte en classeur, se remplit hors ligne par le fournisseur, et se réimporte. Aucune donnée ne part d'ici vers le fournisseur : l'envoi reste un geste humain.")}</h3>

                <div id="questionnairesListe" style="margin-bottom:14px;">
                    <span class="badge" style="background:#eee; color:#666;">Chargement…</span>
                </div>

                <label style="font-weight:700;">Préparer un questionnaire</label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px;">
                    <div class="form-group">
                        <label>Référentiel</label>
                        <select id="qRef">${optionsHtml(refs, "")}</select>
                    </div>
                    <div class="form-group">
                        <label>Retour attendu pour le ${Help.tip("Cette date alimente l'Échéancier : c'est elle qui fera apparaître le retard, sans qu'aucun traitement n'ait à repasser.")}</label>
                        <input id="qEcheance" type="date" />
                    </div>
                </div>
                <button type="button" id="qCreer" style="background:var(--primary);">Préparer le questionnaire</button>
                <p style="color:var(--text-muted); font-size: var(--text-sm); margin:10px 0 0;">
                    Une fois préparé : exportez le classeur, envoyez-le vous-même au fournisseur,
                    puis consignez la date d'envoi. Le produit ne transmet rien à personne.
                </p>
            </div>`;
    }

    /** Branche le panneau des questionnaires. */
    function wireQuestionnaires(prestataireId) {
        rafraichirQuestionnaires(prestataireId);
        const bouton = document.getElementById("qCreer");
        if (!bouton) return;
        bouton.addEventListener("click", () => {
            const refId = (document.getElementById("qRef") || {}).value || "";
            if (!refId) { alert("Choisissez d'abord le référentiel à demander."); return; }
            const ref = typeof Referentiels !== "undefined" ? Referentiels.get(refId) : null;
            DataStore.addQuestionnaire({
                id: UI.genId("QUES"),
                prestataire_id: prestataireId,
                ref_id: refId,
                intitule: ref ? ref.nom : refId,
                echeance: (document.getElementById("qEcheance") || {}).value || "",
                envoye_le: "",
                relance_le: "",
                recu_le: "",
                notes: ""
            });
            if (window.showToast) window.showToast("Questionnaire préparé. Exportez-le pour l'envoyer.", "success");
            rafraichirQuestionnaires(prestataireId);
        });
    }

    /** Recharge la liste des questionnaires et leur état DÉRIVÉ. */
    function rafraichirQuestionnaires(prestataireId) {
        const zone = document.getElementById("questionnairesListe");
        if (!zone || !window.Api || typeof Api.tiersQuestionnaires !== "function") return;
        UI.apresEcriture(() => Api.tiersQuestionnaires().then(r => {
            const cible = document.getElementById("questionnairesListe");
            if (!cible) return;
            const miens = ((r && r.questionnaires) || [])
                .filter(q => q.prestataireId === prestataireId);
            if (miens.length === 0) {
                cible.innerHTML = `<p style="color:var(--text-muted); font-size: var(--text-sm); margin:0;">Aucun questionnaire n'a encore été préparé pour ce tiers.</p>`;
                return;
            }
            const lignes = miens.map(q => {
                const etat = ETATS_QUESTIONNAIRE[q.etat]
                    || { libelle: q.etat, classe: "status-non-applicable", dit: "" };
                // ⚠️ Le TOTAL de questions vient du CATALOGUE, pas du serveur : le
                // serveur ne connaît pas les référentiels, et lui faire rendre un
                // pourcentage aurait obligé à y recopier ce compte.
                const total = questionsDe(q.refId).length;
                const couverture = total > 0
                    ? `${esc(String(q.reponses))} / ${esc(String(total))}`
                    : esc(String(q.reponses));
                const alerte = (q.reponsesNon + q.reponsesPartiel) > 0
                    ? `<span class="badge status-non-conforme">${esc(String(q.reponsesNon))} non · ${esc(String(q.reponsesPartiel))} partiel</span>`
                    : "";
                return `
                    <tr>
                        <td><strong>${esc(q.intitule || q.refId)}</strong><br>
                            <span style="font-size: var(--text-xs); color:var(--text-muted);">${esc(q.refId)}</span></td>
                        <td><span class="badge ${etat.classe}">${esc(etat.libelle)}</span>
                            <div style="font-size: var(--text-xs); color:var(--text-muted); margin-top:4px;">${esc(etat.dit)}</div></td>
                        <td style="font-size: var(--text-sm);">${q.echeance ? esc(q.echeance) : "—"}</td>
                        <td>${couverture}${alerte ? "<div style='margin-top:4px;'>" + alerte + "</div>" : ""}</td>
                        <td class="no-print">
                            <button type="button" class="q-exporter" data-id="${esc(q.id)}" data-ref="${esc(q.refId)}">Exporter</button>
                            <button type="button" class="q-importer" data-id="${esc(q.id)}" style="margin-left:6px;">Réimporter</button>
                            <button type="button" class="q-envoye" data-id="${esc(q.id)}" style="margin-left:6px;">Consigner l'envoi</button>
                        </td>
                    </tr>`;
            }).join("");
            cible.innerHTML = `
                <table class="data-table" style="margin:0;">
                    <thead><tr><th>Référentiel</th><th>État</th><th>Échéance</th><th>Réponses</th><th class="no-print"></th></tr></thead>
                    <tbody>${lignes}</tbody>
                </table>
                <input type="file" id="qFichier" accept=".xlsx,.xls,.csv" hidden />`;

            cible.querySelectorAll(".q-exporter").forEach(b => {
                b.addEventListener("click", () => exporterQuestionnaire(b.dataset.id, b.dataset.ref));
            });
            cible.querySelectorAll(".q-importer").forEach(b => {
                b.addEventListener("click", () => demanderFichierReponses(b.dataset.id, prestataireId));
            });
            cible.querySelectorAll(".q-envoye").forEach(b => {
                b.addEventListener("click", () => consignerEnvoi(b.dataset.id, prestataireId));
            });
        }).catch(() => {
            const cible = document.getElementById("questionnairesListe");
            if (cible) {
                cible.innerHTML = `<p class="synthese-message danger" style="margin:0;">L'état des questionnaires n'a pas pu être chargé. Il est calculé par le serveur ; rien n'est affiché plutôt qu'un état périmé.</p>`;
            }
        }));
    }

    /**
     * Exporte le questionnaire vierge, prêt à être envoyé au fournisseur.
     *
     * ⚠️ **Le classeur porte l'identifiant du questionnaire dans CHAQUE ligne**,
     * et ce n'est pas une redondance : c'est lui qui permet au réimport de savoir
     * à quel envoi les réponses se rattachent, y compris si le fournisseur
     * renomme le fichier — ce qu'il fera.
     */
    function exporterQuestionnaire(questionnaireId, refId) {
        if (typeof XLSX === "undefined") {
            alert("Le générateur de classeur n'est pas chargé.");
            return;
        }
        const questions = questionsDe(refId);
        if (questions.length === 0) {
            alert("Ce référentiel ne porte aucune question dans le catalogue chargé.");
            return;
        }
        const C = COLONNES_QUESTIONNAIRE;
        const lignes = questions.map(q => {
            const ligne = {};
            ligne["Questionnaire"] = questionnaireId;
            ligne[C.code] = q.code;
            ligne[C.question] = q.titre;
            ligne[C.reponse] = "";
            ligne[C.commentaire] = "";
            ligne[C.preuve] = "";
            return ligne;
        });
        const classeur = XLSX.utils.book_new();
        const feuille = XLSX.utils.json_to_sheet(lignes);
        feuille["!cols"] = [{ wch: 30 }, { wch: 14 }, { wch: 70 }, { wch: 28 }, { wch: 40 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(classeur, feuille, "Questionnaire");
        XLSX.writeFile(classeur, `Questionnaire_${refId}_${questionnaireId}.xlsx`);
        if (window.showToast) {
            window.showToast("Classeur exporté. Envoyez-le vous-même au fournisseur.", "success");
        }
    }

    /** Ouvre le sélecteur de fichier pour réimporter les réponses. */
    function demanderFichierReponses(questionnaireId, prestataireId) {
        const entree = document.getElementById("qFichier");
        if (!entree) return;
        entree.value = "";
        entree.onchange = () => {
            const fichier = entree.files && entree.files[0];
            if (fichier) lireReponses(fichier, questionnaireId, prestataireId);
        };
        entree.click();
    }

    /**
     * Relit le classeur rempli et reverse les réponses sur la fiche.
     *
     * ⚠️ **Ce qui est REFUSÉ est dit, et ce qui passe est compté.** Un import
     * silencieux qui écarterait les lignes mal remplies est la pire des trois
     * issues : l'utilisateur croirait avoir tout reçu. On énumère donc, et l'on
     * s'arrête au premier lot pour que le message reste lisible.
     *
     * ⚠️ **L'idempotence n'est PAS gérée ici** : elle est portée par l'unicité
     * `(filiale, questionnaire, code)` de la base. Réimporter deux fois le même
     * classeur échoue bruyamment côté serveur au lieu de doubler les réponses —
     * et c'est la base qui doit le tenir, parce que l'import généralisé (L7) et
     * `psql` écrivent par d'autres chemins que celui-ci.
     */
    function lireReponses(fichier, questionnaireId, prestataireId) {
        if (typeof XLSX === "undefined") {
            alert("Le lecteur de classeur n'est pas chargé.");
            return;
        }
        const lecteur = new FileReader();
        lecteur.onload = (e) => {
            let lignes;
            try {
                const classeur = XLSX.read(e.target.result, { type: "array" });
                const feuille = classeur.Sheets[classeur.SheetNames[0]];
                lignes = XLSX.utils.sheet_to_json(feuille, { defval: "" });
            } catch (err) {
                alert("Ce fichier n'a pas pu être lu comme un classeur.");
                return;
            }
            const C = COLONNES_QUESTIONNAIRE;
            const ADMISES = { oui: "oui", non: "non", partiel: "partiel", na: "na",
                              "n/a": "na", "sans objet": "na" };
            const dejaLa = new Set(DataStore.getReponsesDe(questionnaireId).map(r => r.code));
            let ecrites = 0;
            const ecartes = [];
            lignes.forEach((l, rang) => {
                const code = String(l[C.code] || "").trim();
                const brut = String(l[C.reponse] || "").trim().toLowerCase();
                if (!code) { return; }
                if (!brut) { return; }          // non répondu : ce n'est pas une faute
                const reponse = ADMISES[brut];
                if (!reponse) {
                    ecartes.push(`ligne ${rang + 2} (${code}) : réponse « ${brut} » non admise`);
                    return;
                }
                if (dejaLa.has(code)) {
                    ecartes.push(`ligne ${rang + 2} (${code}) : déjà répondu, non écrasé`);
                    return;
                }
                DataStore.addReponse({
                    id: UI.genId("QREP"),
                    questionnaire_id: questionnaireId,
                    code: code,
                    reponse: reponse,
                    commentaire: String(l[C.commentaire] || "").trim(),
                    preuve: String(l[C.preuve] || "").trim()
                });
                dejaLa.add(code);
                ecrites += 1;
            });

            // La réception est un FAIT, et on le consigne : sans elle, l'état
            // resterait « en retard » alors que les réponses sont là.
            if (ecrites > 0) {
                const q = DataStore.getQuestionnaireById(questionnaireId);
                if (q && !q.recu_le) {
                    if (!q.envoye_le) {
                        // ⚠️ La base REFUSE une réception sans envoi (chronologie).
                        // Plutôt que de laisser partir une écriture vouée au refus, on
                        // consigne l'envoi au même instant : recevoir prouve qu'on a
                        // envoyé, et le nier serait une fiction.
                        q.envoye_le = new Date().toISOString().slice(0, 10);
                    }
                    q.recu_le = new Date().toISOString().slice(0, 10);
                    DataStore.updateQuestionnaire(q);
                }
            }

            const resume = `${ecrites} réponse(s) reversée(s).`
                + (ecartes.length ? ` ${ecartes.length} ligne(s) écartée(s) : ` + ecartes.slice(0, 3).join(" ; ") : "");
            if (window.showToast) window.showToast(resume, ecartes.length ? "warning" : "success");
            else alert(resume);
            rafraichirQuestionnaires(prestataireId);
        };
        lecteur.readAsArrayBuffer(fichier);
    }

    /** Consigne la date d'envoi — un FAIT, pas une action du produit. */
    function consignerEnvoi(questionnaireId, prestataireId) {
        const q = DataStore.getQuestionnaireById(questionnaireId);
        if (!q) return;
        const saisie = prompt(
            "Date à laquelle vous avez envoyé ce questionnaire au fournisseur (AAAA-MM-JJ).\n"
            + "Le produit n'envoie rien : cette date consigne ce que VOUS avez fait.",
            q.envoye_le || new Date().toISOString().slice(0, 10));
        if (saisie === null) return;
        const date = saisie.trim();
        if (date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            alert("Date attendue au format AAAA-MM-JJ.");
            return;
        }
        // Une relance, c'est un envoi de plus : si la date d'envoi existe déjà et
        // que la nouvelle lui est postérieure, c'est `relance_le` qu'on pose.
        if (q.envoye_le && date > q.envoye_le) q.relance_le = date;
        else q.envoye_le = date;
        DataStore.updateQuestionnaire(q);
        if (window.showToast) window.showToast("Date consignée.", "success");
        rafraichirQuestionnaires(prestataireId);
    }

    /* =====================================================================
       L'ÉCRAN DU REGISTRE D'INFORMATION — lot L21, action 21.1
    ===================================================================== */

    /**
     * Le registre DORA, avec ses MANQUES.
     *
     * ⚠️ **C'est la liste des manques qui fait la valeur de cet écran**, pas le
     * tableau. Un registre remis avec des cases vides est refusé ; un registre
     * qui ne signale pas ses propres trous laisse croire qu'il est complet. Ce
     * qui manque est donc dit ligne par ligne, et l'écran devient un plan de
     * travail au lieu d'un état des lieux.
     *
     * ⚠️ **Il exige le droit d'EXPORT**, et un refus n'est pas une panne : un
     * registre d'information complet est la carte des dépendances critiques du
     * groupe. L'écran le DIT, au lieu d'afficher une erreur technique.
     */
    function renderRegistreDora() {
        const app = document.getElementById("app");
        const dateJour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Registre d'information DORA</h1>
                    <img class="print-brand-logo" data-brand-logo hidden alt="" />
                    <p>${esc(Identite.piedImpression("Arrangements contractuels portant sur des services TIC"))} · Édité le ${esc(dateJour)}</p>
                </div>
                ${UI.enteteHtml({
                    titre: "Registre d'information DORA",
                    aide: Help.tip("L'article 28 du règlement (UE) 2022/2554 impose de tenir un registre de tous les arrangements contractuels portant sur des services TIC, à jour et remis à l'autorité sur demande."),
                    contexte: "Un arrangement contractuel par ligne, avec ce qui lui manque encore.",
                    onglets: UI.ongletsDe("/tiers-dora"),
                    actions: `<button type="button" id="printBtn" class="btn-secondary">Imprimer</button>`
                })}
                <div id="registreZone">
                    <p style="color:var(--text-muted);">Chargement du registre…</p>
                </div>
            </section>`;
        const impression = document.getElementById("printBtn");
        if (impression) impression.addEventListener("click", () => window.print());
        if (window.Identite) Identite.brancherLogos();

        if (!window.Api || typeof Api.tiersRegistreDora !== "function") return;
        Api.tiersRegistreDora().then(r => peuplerRegistre(r)).catch(err => {
            const zone = document.getElementById("registreZone");
            if (!zone) return;
            // Un 403 n'est pas une panne : c'est une permission, et le dire
            // évite que l'utilisateur cherche un incident qui n'existe pas.
            const refus = err && (err.statut === 403 || err.status === 403);
            zone.innerHTML = refus
                ? `<div class="synthese-message warning">
                       <strong>Extraction non autorisée.</strong> Le registre d'information complet
                       est la carte des dépendances critiques du groupe : son extraction est un droit
                       distinct de la lecture (groupe d'annuaire <code>GRC-EXPORT</code>). Les fiches
                       des tiers, elles, restent consultables depuis l'écran « Prestataires ».
                   </div>`
                : `<div class="synthese-message danger">Le registre n'a pas pu être chargé. Rien n'est affiché plutôt qu'un registre partiel.</div>`;
        });
    }

    function peuplerRegistre(r) {
        const zone = document.getElementById("registreZone");
        if (!zone) return;
        const lignes = (r && r.registre) || [];
        if (lignes.length === 0) {
            zone.innerHTML = `<div class="synthese-message info">Aucun prestataire n'est enregistré dans votre périmètre : le registre se construit à partir de l'annuaire des tiers.</div>`;
            return;
        }
        const corps = lignes.map(l => `
            <tr>
                <td><strong>${esc(l.societe)}</strong><br><span style="font-size: var(--text-xs); color:var(--text-muted);">${esc(l.filiale)}</span></td>
                <td style="font-family: var(--font-mono, monospace); font-size: var(--text-xs);">${esc(l.lei || "—")}</td>
                <td>${esc(l.pays || "—")}${l.paysDonnees && l.paysDonnees !== l.pays ? ` <span class="badge" style="background:#fff3e0; color:#e65100;">données : ${esc(l.paysDonnees)}</span>` : ""}</td>
                <td>${esc(l.fonctionSupportee || "—")}${l.fonctionCritique ? ` <span class="badge" style="background:#ffebee; color:#b71c1c;">Critique</span>` : ""}</td>
                <td style="font-size: var(--text-sm);">${esc(l.contratReference || "—")}<br><span style="color:var(--text-muted);">${esc(l.contratDebut || "?")} → ${esc(l.contratFin || "sans terme")}</span></td>
                <td>${l.sousTraitants.length ? esc(String(l.sousTraitants.length)) : "—"}</td>
                <td>${l.manques.length === 0
                    ? `<span class="badge status-conforme">Complète</span>`
                    : `<span class="badge status-non-conforme">${esc(String(l.manques.length))} manque(s)</span><div style="font-size: var(--text-xs); color:var(--text-muted); margin-top:4px;">${esc(l.manques.join(" · "))}</div>`}</td>
            </tr>`).join("");

        zone.innerHTML = `
            <div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap; margin:0 0 16px;">
                <span class="badge" style="background:#e3f2fd; color:#0d47a1; font-weight:600;">Arrangements : ${esc(String(lignes.length))}</span>
                <span class="badge" style="background:#ffebee; color:#b71c1c; font-weight:600;">Fonctions critiques : ${esc(String(r.fonctionsCritiques))}</span>
                <span class="badge" style="background:${r.lignesIncompletes ? "#fff3e0" : "#e8f5e9"}; color:${r.lignesIncompletes ? "#e65100" : "#1b5e20"}; font-weight:600;">Lignes incomplètes : ${esc(String(r.lignesIncompletes))}</span>
            </div>
            <div class="synthese-message warning">${esc(r.avertissement)}</div>
            <table class="data-table">
                <thead><tr>
                    <th>Prestataire</th><th>LEI</th><th>Pays</th><th>Fonction soutenue</th>
                    <th>Contrat</th><th>Sous-traitants</th><th>Complétude</th>
                </tr></thead>
                <tbody>${corps}</tbody>
            </table>`;
        if (window.UI && typeof UI.envelopperTableaux === "function") UI.envelopperTableaux();
    }

    /* =========================
       LISTE DES PRESTATAIRES & TIERS
    ========================== */
    function renderList() {
        const prestataires = DataStore.getPrestataires();
        const app = document.getElementById("app");
        const dateJour = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

        const rows = prestataires.map(p => `
            <tr class="clickable-row" data-id="${p.id}">
                <td class="no-print stop-row-click" style="text-align: center; width: 40px;">
                    <input type="checkbox" class="row-cb" data-id="${p.id}">
                </td>
                <td><strong>${esc(p.societe)}</strong></td>
                <td><span class="badge" style="background:#eee; color:#333;">${esc(p.type)}</span></td>
                <td><span class="score-tiers" data-id="${p.id}">${badgeEnAttente()}</span><div style="margin-top:4px;">${coverageBadge(p)}</div></td>
                <td>${esc(p.phone) || "-"}<br>${esc(p.email) || "-"}</td>
                <td style="font-size: var(--text-sm); color:var(--text-muted);">${p.notes ? esc(String(p.notes).substring(0, 60)) + "…" : "-"}</td>
            </tr>
        `).join("");

        // Synthèse du risque tiers (lecture rapide direction).
        //
        // ⚠️ Les deux premiers compteurs sont laissés VIDES au rendu et remplis
        // par le serveur : ils dépendent du score composite, que le navigateur
        // ne sait pas calculer. Les afficher à zéro en attendant annoncerait
        // « aucun tiers à risque élevé » — c'est-à-dire l'inverse possible de la
        // vérité, sur l'indicateur qu'une direction lit en premier.
        const avgCov = prestataires.length ? Math.round(prestataires.reduce((s, p) => s + coverage(p).pct, 0) / prestataires.length) : 0;

        const chip = (bg, color, txt) => `<span class="badge" style="background:${bg}; color:${color}; font-weight:600;">${txt}</span>`;

        app.innerHTML = `
            <section class="page">
                <div class="print-head">
                    <h1>Prestataires</h1>
                    <img class="print-brand-logo" data-brand-logo hidden alt="" />
                    <p>${esc(Identite.piedImpression("Contacts d'escalade et risque fournisseur"))} · Édité le ${esc(dateJour)}</p>
                </div>

                ${UI.enteteHtml({
                    titre: "Prestataires & Tiers",
                    aide: Help.tip("NIS2 (art. 21) impose de gérer la sécurité de sa chaîne d'approvisionnement ; DORA encadre le risque lié aux prestataires TIC et exige un registre d'information."),
                    contexte: "Annuaire d'urgence, d'escalade et évaluation du risque fournisseur.",
                    onglets: UI.ongletsDe("/prestataires"),
                    actions:
                        `<button id="bulkDeleteBtn" style="display: none; background-color: var(--color-danger);">Supprimer sélection (<span id="selectedCount">0</span>)</button>`
                        + `<button type="button" id="printBtn" class="btn-secondary">Imprimer l'annuaire</button>`
                        + `<button id="addBtn">Nouveau Contact</button>`
                })}

                <div class="synthese-message info no-print" style="font-size: var(--text-base); padding:10px;">
                    <strong>Annuaire de crise &amp; risque tiers :</strong> Enregistrez les contacts vitaux (Hébergeur Cloud, Assureur Cyber, Fournisseur réseau, ANSSI, CNIL…) et évaluez le risque que chaque fournisseur fait porter à votre chaîne d'approvisionnement ${Help.tip("NIS2 (art. 21) impose de gérer la sécurité de sa chaîne d'approvisionnement ; DORA encadre le risque lié aux prestataires TIC.")}. Pensez à l'imprimer !
                </div>

                ${prestataires.length ? `<div class="no-print" style="display:flex; gap:10px; flex-wrap:wrap; margin:0 0 16px;">
                    ${chip("#e3f2fd", "#0d47a1", `Tiers : ${prestataires.length}`)}
                    <span class="badge" id="chipEvalues" style="background:#eee; color:#333; font-weight:600;">Évalués : …</span>
                    <span class="badge" id="chipEleves" style="background:#eee; color:#333; font-weight:600;">Risque élevé / critique : …</span>
                    ${chip("#fff3e0", "#e65100", `Couverture chaîne d'appro : ${avgCov}%`)}
                </div>` : ""}

                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="no-print" style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllCb"></th>
                            <th>Société / Entité</th>
                            <th>Type de contact</th>
                            <th>Risque fournisseur</th>
                            <th>Contact Urgence</th>
                            <th>Notes &amp; Procédure</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || "<tr><td colspan='6' style='text-align:center;'>Aucun contact externe enregistré.</td></tr>"}
                    </tbody>
                </table>
            </section>
        `;

        document.getElementById("addBtn").onclick = renderCreate;
        document.getElementById("printBtn").addEventListener("click", () => window.print());
        // La case à cocher ne doit pas ouvrir la fiche du prestataire.
        document.querySelectorAll(".stop-row-click").forEach(el =>
            el.addEventListener("click", (e) => e.stopPropagation()));

        // Sélection multiple + suppression groupée (helper partagé, cf. js/core/ui.js).
        UI.wireBulkDelete({
            remove: (id) => DataStore.deletePrestataire(id),
            confirm: (n) => `Confirmer la suppression de ${n} contact(s) ?`,
            toast: (n) => `${n} contact(s) supprimé(s).`,
            onDone: () => renderList()
        });

        document.querySelectorAll(".clickable-row").forEach(row => {
            row.onclick = () => Router.navigateTo(`/prestataires/${row.dataset.id}`);
        });
        if (window.Identite) Identite.brancherLogos();
        peuplerScores();
    }

    /**
     * Remplit les badges de score depuis `GET /api/tiers/etat`.
     *
     * ⚠️ **Le score n'est pas dans `data`**, et c'est une décision : il se
     * DÉRIVE de quatre facteurs dont deux bougent sans qu'aucune écriture ait
     * lieu — l'ancienneté de l'évaluation vieillit d'un jour par jour. Le faire
     * voyager dans l'instantané le figerait au jour du chargement, et un onglet
     * resté ouvert une semaine afficherait des niveaux périmés.
     *
     * ⚠️ En cas d'échec, les badges restent « Calcul en cours… » et un message
     * le DIT. Ils ne retombent pas sur un calcul local : ce serait réintroduire
     * la duplication que ce lot supprime, et le faire précisément au moment où
     * personne ne peut le vérifier.
     */
    function peuplerScores() {
        if (!window.Api || typeof Api.tiersEtat !== "function") return;
        // ⚠️ **`UI.apresEcriture()` — et ce n'est pas une précaution de plus.**
        // `DataStore.addPrestataire()` n'écrit qu'EN MÉMOIRE : la poussée vers le
        // serveur est asynchrone. Relire tout de suite interroge un serveur qui
        // n'a encore rien reçu, et la liste afficherait « Non évalué » sur le
        // tiers qu'on vient de renseigner — c'est exactement le défaut trouvé
        // sur la recette le 16/09, invisible au banc parce que le serveur y
        // répond dans la même milliseconde.
        UI.apresEcriture(() => Api.tiersEtat().then(r => {
            const tiers = (r && r.tiers) || [];
            const parId = new Map(tiers.map(t => [t.id, t]));
            document.querySelectorAll(".score-tiers").forEach(el => {
                const t = parId.get(el.dataset.id);
                el.innerHTML = t ? badgeNiveau(t.niveau, t.score) : badgeNiveau("non_evalue", null);
            });
            const evalues = tiers.filter(t => t.score !== null).length;
            const eleves = tiers.filter(t => t.niveau === "eleve" || t.niveau === "critique").length;
            const chipE = document.getElementById("chipEvalues");
            if (chipE) chipE.textContent = `Évalués : ${evalues}/${tiers.length}`;
            const chipR = document.getElementById("chipEleves");
            if (chipR) {
                chipR.textContent = `Risque élevé / critique : ${eleves}`;
                chipR.style.background = eleves ? "#ffebee" : "#e8f5e9";
                chipR.style.color = eleves ? "#b71c1c" : "#1b5e20";
            }
        }).catch(() => {
            document.querySelectorAll(".score-tiers").forEach(el => {
                el.innerHTML = `<span class="badge" style="background:#eee; color:#b71c1c;">Score indisponible</span>`;
            });
        }));
    }

    /* =========================
       CRÉATION D'UN CONTACT
    ========================== */
    function renderCreate() {
        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Nouveau Prestataire / Tiers</h1>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Société / Entité <span style="color:red">*</span></label>
                        <input id="societe" placeholder="Ex: IONOS, Assureur X, ANSSI..." required />
                    </div>
                    <div class="form-group">
                        <label>Type de contact</label>
                        <select id="type">
                            <option value="Prestataire IT / Cloud">Prestataire IT / Cloud</option>
                            <option value="Assureur Cyber">Assureur Cyber</option>
                            <option value="Client Majeur">Client Majeur (à prévenir)</option>
                            <option value="Autorité">Autorité (ANSSI, CNIL, Police)</option>
                            <option value="Autre">Autre</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Téléphone d'Urgence</label>
                            <input id="phone" placeholder="Numéro 24/7 si possible" />
                        </div>
                        <div class="form-group">
                            <label>Email de support/contact</label>
                            <input id="email" type="email" placeholder="contact@..." />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes / Procédure d'appel</label>
                        <textarea id="notes" placeholder="Ex: Avoir le numéro de contrat sous la main avant d'appeler. Contrat N° XXXX." style="min-height:80px;"></textarea>
                    </div>
                </div>

                ${riskSectionHtml()}
                ${doraSectionHtml()}

                <div style="max-width:600px; margin-top: 20px;">
                    <button id="saveBtn" style="background:var(--color-success);">Enregistrer le contact</button>
                    <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/prestataires");

        document.getElementById("saveBtn").onclick = () => {
            const soc = document.getElementById("societe").value.trim();
            if (!soc) return alert("Le nom de la société est obligatoire.");

            DataStore.addPrestataire(Object.assign({
                id: UI.genId("PREST"),
                societe: soc,
                type: document.getElementById("type").value,
                phone: document.getElementById("phone").value.trim(),
                email: document.getElementById("email").value.trim(),
                notes: document.getElementById("notes").value.trim()
            }, collectRisk(), collectDora()));

            if (window.showToast) window.showToast("Contact ajouté à l'annuaire.", "success");
            Router.navigateTo("/prestataires");
        };

        wireRiskSection();
        updateRiskPreview();
    }

    /* =========================
       DÉTAIL / ÉDITION
    ========================== */
    function renderDetail(id) {
        const c = DataStore.getPrestataires().find(x => x.id === id);
        if (!c) return Router.navigateTo("/prestataires");

        const app = document.getElementById("app");
        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <h1>Édition : ${esc(c.societe)}</h1>
                    <button id="delBtn" style="background:var(--color-danger);">Supprimer</button>
                </div>
                <div class="dashboard-card" style="max-width:600px;">
                    <div class="form-group">
                        <label>Société / Entité <span style="color:red">*</span></label>
                        <input id="societe" value="${esc(c.societe)}" required />
                    </div>
                    <div class="form-group">
                        <label>Type de contact</label>
                        <select id="type">
                            <option value="Prestataire IT / Cloud" ${c.type === "Prestataire IT / Cloud" ? "selected" : ""}>Prestataire IT / Cloud</option>
                            <option value="Assureur Cyber" ${c.type === "Assureur Cyber" ? "selected" : ""}>Assureur Cyber</option>
                            <option value="Client Majeur" ${c.type === "Client Majeur" ? "selected" : ""}>Client Majeur (à prévenir)</option>
                            <option value="Autorité" ${c.type === "Autorité" ? "selected" : ""}>Autorité (ANSSI, CNIL, Police)</option>
                            <option value="Autre" ${c.type === "Autre" ? "selected" : ""}>Autre</option>
                        </select>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px;">
                        <div class="form-group">
                            <label>Téléphone d'Urgence</label>
                            <input id="phone" value="${esc(c.phone || "")}" />
                        </div>
                        <div class="form-group">
                            <label>Email de support/contact</label>
                            <input id="email" type="email" value="${esc(c.email || "")}" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Notes / Procédure d'appel</label>
                        <textarea id="notes" style="min-height:80px;">${esc(c.notes || "")}</textarea>
                    </div>
                </div>

                ${riskSectionHtml(c)}
                ${doraSectionHtml(c)}
                ${sousTraitancePanelHtml(c)}
                ${questionnairesPanelHtml()}

                <div style="max-width:600px; margin-top: 20px;">
                    <button id="saveBtn" style="background:var(--color-success);">Mettre à jour</button>
                    <button id="cancelBtn" style="margin-left:10px; background:var(--color-gray); color:white;">Annuler</button>
                </div>
            </section>
        `;

        document.getElementById("cancelBtn").onclick = () => Router.navigateTo("/prestataires");

        document.getElementById("saveBtn").onclick = () => {
            const soc = document.getElementById("societe").value.trim();
            if (!soc) return alert("Le nom de la société est obligatoire.");

            c.societe = soc;
            c.type = document.getElementById("type").value;
            c.phone = document.getElementById("phone").value.trim();
            c.email = document.getElementById("email").value.trim();
            c.notes = document.getElementById("notes").value.trim();
            Object.assign(c, collectRisk(), collectDora());

            DataStore.updatePrestataire(c);
            if (window.showToast) window.showToast("Contact mis à jour.", "success");
            Router.navigateTo("/prestataires");
        };

        UI.wireDelete({
            button: "delBtn",
            confirm: "Confirmer la suppression de ce contact de l'annuaire ?",
            remove: () => DataStore.deletePrestataire(id),
            redirect: "/prestataires"
        });

        wireRiskSection();
        updateRiskPreview();
        wireSousTraitance(c.id);
        wireQuestionnaires(c.id);
    }

    return {
        renderList, renderDetail, updateRiskPreview,
        // Lot L21 : le registre d'information DORA, écran à part.
        renderRegistreDora
    };
})();
