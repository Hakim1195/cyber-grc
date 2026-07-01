// Emplacement : js/core/help.js
// Nom du fichier : help.js
//
// Composant d'aide pédagogique réutilisable (icône ⓘ + bulle explicative).
// Fil rouge de l'application : rendre chaque concept GRC accessible aux non-experts.
//
// Usage dans les templates :  ${Help.tip("Texte d'explication court")}
//   ou en abrégé :            ${helpTip("...")}

const Help = (() => {
    function escapeHtml(str) {
        return String(str == null ? "" : str).replace(/[&<>"']/g, ch => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[ch]));
    }

    // Retourne le markup d'une icône d'aide accessible (clavier + lecteur d'écran).
    function tip(text, label) {
        const safe = escapeHtml(text);
        const aria = escapeHtml(label || ("Aide : " + text));
        return `<span class="help-tip" tabindex="0" role="button" aria-label="${aria}">i<span class="help-tip__pop" role="tooltip">${safe}</span></span>`;
    }

    // Gestion du tap (ouvre/ferme la bulle ; sur desktop c'est aussi le survol).
    // Phase de CAPTURE : on intercepte avant les onclick des cartes cliquables,
    // pour qu'un tap sur ⓘ n'entraîne pas une navigation.
    function init() {
        if (init._done) return;
        init._done = true;
        document.addEventListener("click", (e) => {
            const tipEl = e.target.closest ? e.target.closest(".help-tip") : null;
            document.querySelectorAll(".help-tip.open").forEach(el => { if (el !== tipEl) el.classList.remove("open"); });
            if (tipEl) { e.stopPropagation(); e.preventDefault(); tipEl.classList.toggle("open"); }
        }, true);
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") document.querySelectorAll(".help-tip.open").forEach(el => el.classList.remove("open"));
        });
    }

    return { tip, init };
})();

// Alias pratique pour les templates.
window.helpTip = Help.tip;
