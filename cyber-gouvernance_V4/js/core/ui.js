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

    return { badge, mappedBadge, wireBulkDelete };
})();
