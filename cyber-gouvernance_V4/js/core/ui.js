/**
 * js/core/ui.js — Helpers d'interface partagés (fabrique unique).
 *
 * But : factoriser les fragments d'UI recopiés d'un module à l'autre (dette
 * identifiée dans l'AUDIT / le PLAN, chantier 9). Un seul endroit à corriger,
 * un comportement homogène partout.
 *
 * Exposé sous `window.UI`. Dépendances : `window.escapeHtml` (help.js) au rendu,
 * `window.showToast` (app.js) au clic — toutes deux chargées, ces appels se font
 * à l'exécution, donc l'ordre de chargement des scripts suffit.
 */
window.UI = (function () {
    "use strict";

    // Repli défensif si escapeHtml n'est pas (encore) disponible.
    function esc(value) {
        if (window.escapeHtml) return window.escapeHtml(value);
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /* =========================================================================
       BADGES DE STATUT
       Forme recopiée partout : <span class="status <classe>">libellé</span>.
       La donnée est systématiquement échappée ; libellé vide → « — ».
    ========================================================================= */

    // Badge simple : libellé + classe sémantique (status-conforme, decl-ok, …).
    function badge(label, cls) {
        const text = (label == null || label === "") ? "—" : label;
        return `<span class="status ${cls || "status-non-applicable"}">${esc(text)}</span>`;
    }

    // Badge dont la classe dépend de la valeur via une table de correspondance.
    // `fallbackCls` s'applique quand la valeur n'est pas dans la table.
    function mappedBadge(value, map, fallbackCls) {
        const cls = (map && map[value]) || fallbackCls || "status-non-applicable";
        return badge(value, cls);
    }

    /* =========================================================================
       SÉLECTION MULTIPLE + SUPPRESSION GROUPÉE
       Markup standard des listes : une case « tout cocher » (#selectAllCb), des
       cases de ligne (.row-cb[data-id]), un bouton d'action (#bulkDeleteBtn) et
       un compteur (#selectedCount). Les sélecteurs sont surchargeable au besoin.

       options :
         remove(id)      — appelée pour chaque id coché (suppression réelle) ;
         confirm(n)      — message de confirmation (n = nombre sélectionné) ;
         toast(n)        — message de succès (renvoyer "" pour ne rien afficher) ;
         onDone(ids)     — après suppression (typiquement re-rendre la liste) ;
         selectors       — { selectAll, row, button, count } pour surcharger les id/classe.
       Renvoie la fonction de rafraîchissement de l'UI (utile pour un usage avancé).
    ========================================================================= */
    function wireBulkDelete(options) {
        const opts = options || {};
        const sel = opts.selectors || {};
        const rowSel = sel.row || ".row-cb";
        const selectAllCb = document.getElementById(sel.selectAll || "selectAllCb");
        const rowCbs = document.querySelectorAll(rowSel);
        const bulkBtn = document.getElementById(sel.button || "bulkDeleteBtn");
        const countSpan = document.getElementById(sel.count || "selectedCount");

        function refresh() {
            const checked = document.querySelectorAll(rowSel + ":checked").length;
            if (bulkBtn) bulkBtn.style.display = checked > 0 ? "inline-block" : "none";
            if (checked > 0 && countSpan) countSpan.textContent = checked;
            if (selectAllCb) selectAllCb.checked = checked === rowCbs.length && rowCbs.length > 0;
        }

        if (selectAllCb) {
            selectAllCb.addEventListener("change", (e) => {
                rowCbs.forEach((cb) => { cb.checked = e.target.checked; });
                refresh();
            });
        }
        rowCbs.forEach((cb) => cb.addEventListener("change", refresh));

        if (bulkBtn) {
            bulkBtn.addEventListener("click", () => {
                const ids = Array.from(document.querySelectorAll(rowSel + ":checked")).map((cb) => cb.dataset.id);
                if (!ids.length) return;
                const message = typeof opts.confirm === "function"
                    ? opts.confirm(ids.length)
                    : `Confirmer la suppression de ${ids.length} élément(s) ?`;
                if (!confirm(message)) return;
                if (typeof opts.remove === "function") ids.forEach((id) => opts.remove(id));
                if (window.showToast) {
                    const msg = typeof opts.toast === "function"
                        ? opts.toast(ids.length)
                        : `${ids.length} élément(s) supprimé(s).`;
                    if (msg) window.showToast(msg, "success");
                }
                if (typeof opts.onDone === "function") opts.onDone(ids);
            });
        }

        return refresh;
    }

    /* =========================================================================
       SUPPRESSION D'UN ÉLÉMENT UNIQUE (fiche détail)
       Motif recopié dans la plupart des modules : un bouton → confirmation →
       suppression → toast optionnel → navigation vers la liste.

       options :
         button    — id du bouton (défaut "deleteBtn") ;
         confirm   — message (chaîne) ou fonction () => message (évaluée au clic,
                     utile pour un avertissement dynamique de cascade) ;
         remove()  — suppression réelle (capture l'id via closure) ;
         toast     — message de succès (chaîne/fonction ; omis → aucun toast) ;
         redirect  — route de destination après suppression (ex. "/risques") ;
         onDone()  — alternative à redirect (ex. re-rendre la fiche en place).
    ========================================================================= */
    function wireDelete(options) {
        const opts = options || {};
        const btn = document.getElementById(opts.button || "deleteBtn");
        if (!btn) return;
        btn.addEventListener("click", () => {
            const message = typeof opts.confirm === "function"
                ? opts.confirm()
                : (opts.confirm || "Confirmer la suppression ?");
            if (!confirm(message)) return;
            if (typeof opts.remove === "function") opts.remove();
            if (opts.toast && window.showToast) {
                const msg = typeof opts.toast === "function" ? opts.toast() : opts.toast;
                if (msg) window.showToast(msg, "success");
            }
            if (opts.redirect) Router.navigateTo(opts.redirect);
            else if (typeof opts.onDone === "function") opts.onDone();
        });
    }

    /* =========================================================================
       IDENTIFIANT ANTI-COLLISION
       Convention historique : "<PRÉFIXE>-<timestamp>-<aléa>". Centralisée ici
       pour solder la dette « collisions » (un seul endroit à faire évoluer, ex.
       migration vers crypto.randomUUID). genId("ACT") → "ACT-1720000000000-482".
    ========================================================================= */
    function genId(prefix) {
        return (prefix || "ID") + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    }

    /* =========================================================================
       ANNUAIRE « PERSONNEL » — autocomplétion partagée (v11)
       Un unique <datalist id="personnes-list"> vit dans index.html (hors #app, donc
       persistant entre les rendus). On le (re)peuple depuis l'annuaire du DataStore ;
       tout <input list="personnes-list"> propose alors les personnes enregistrées, tout
       en acceptant une saisie libre (rétrocompatible). Appelé à chaque navigation.
    ========================================================================= */
    function refreshPersonnesDatalist() {
        var dl = document.getElementById("personnes-list");
        if (!dl || typeof DataStore === "undefined" || !DataStore.getPersonneNames) return;
        var names;
        try { names = DataStore.getPersonneNames(); } catch (e) { names = []; }
        dl.innerHTML = names.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join("");
    }

    // Personne de l'annuaire par nom (insensible à la casse) — pour l'auto-remplissage (ex. crise).
    function findPersonneByNom(nom) {
        var key = String(nom == null ? "" : nom).trim().toLowerCase();
        if (!key || typeof DataStore === "undefined" || !DataStore.getPersonnes) return null;
        return DataStore.getPersonnes().find(function (p) { return String(p.nom || "").trim().toLowerCase() === key; }) || null;
    }

    /* =========================================================================
       CHAMP MULTI-PERSONNES (chips) — réutilisable (v11, Phase 2)
       Sélecteur multiple adossé au <datalist> de l'annuaire (autocomplétion) tout en
       acceptant la saisie libre. Stocké comme une CHAÎNE « une personne par ligne »
       (rétrocompatible avec les champs texte existants, ex. participants d'une revue).
         - multiPersonHtml(fieldId, valeur) → markup (conteneur d'id `fieldId`)
         - wireMultiPerson(fieldId)         → interactions (ajout/retrait, Entrée)
         - getMultiPerson(fieldId)          → chaîne « un nom par ligne » (à l'enregistrement)
    ========================================================================= */
    function parsePersons(str) {
        return String(str == null ? "" : str).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function personChipHtml(nom) {
        return '<span class="mp-chip"><span class="mp-label">' + esc(nom) + '</span>' +
            '<button type="button" class="mp-remove" aria-label="Retirer">&times;</button></span>';
    }
    function multiPersonHtml(fieldId, valueString) {
        var chips = parsePersons(valueString).map(personChipHtml).join("");
        return '<div class="mp-field" id="' + fieldId + '">' +
            '<div class="mp-chips">' + chips + '</div>' +
            '<div class="mp-add">' +
                '<input type="text" class="mp-input" list="personnes-list" placeholder="Ajouter une personne…">' +
                '<button type="button" class="mp-addbtn">Ajouter</button>' +
            '</div></div>';
    }
    function wireMultiPerson(fieldId) {
        var root = document.getElementById(fieldId);
        if (!root) return;
        var chips = root.querySelector(".mp-chips");
        var input = root.querySelector(".mp-input");
        var addBtn = root.querySelector(".mp-addbtn");
        function addChip() {
            var v = (input.value || "").trim();
            if (!v) return;
            var exists = Array.prototype.some.call(chips.querySelectorAll(".mp-label"), function (el) {
                return el.textContent.trim().toLowerCase() === v.toLowerCase();
            });
            if (!exists) chips.insertAdjacentHTML("beforeend", personChipHtml(v));
            input.value = "";
            input.focus();
        }
        if (addBtn) addBtn.addEventListener("click", addChip);
        if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addChip(); } });
        if (chips) chips.addEventListener("click", function (e) {
            var rm = e.target.closest(".mp-remove");
            if (rm) { var chip = rm.closest(".mp-chip"); if (chip) chip.remove(); }
        });
    }
    function getMultiPerson(fieldId) {
        var root = document.getElementById(fieldId);
        if (!root) return "";
        return Array.prototype.map.call(root.querySelectorAll(".mp-chips .mp-label"), function (el) {
            return el.textContent.trim();
        }).filter(Boolean).join("\n");
    }

    return {
        badge, mappedBadge, wireBulkDelete, wireDelete, genId, refreshPersonnesDatalist,
        findPersonneByNom, multiPersonHtml, wireMultiPerson, getMultiPerson
    };
})();
