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

    /* ── LE PLACEMENT DE LA BULLE ────────────────────────────────────────
       ⚠️ **La bulle est `position: fixed`, et c'est délibéré.** En `absolute`,
       elle était ROGNÉE par tout ancêtre à `overflow: hidden` — une enveloppe
       de tableau, une carte —, et surtout elle GARDAIT SA BOÎTE dans le flux
       même masquée (`visibility: hidden`), ce qui faisait défiler la page
       entière de 122 px sur presque chaque écran.

       En `fixed`, elle ne pèse plus sur rien et ne peut plus être rognée — mais
       elle ne sait plus se placer seule par rapport à son ancre. C'est donc ici
       qu'on la place, et qu'on la BORNE à la fenêtre : une bulle près d'un bord
       se replie au lieu de sortir de l'écran. */

    /** Marge que l'on garde entre la bulle et le bord de la fenêtre. */
    const MARGE = 8;

    function placer(tipEl) {
        const bulle = tipEl.querySelector(".help-tip__pop");
        if (!bulle) return;
        bulle.classList.add("visible");

        const ancre = tipEl.getBoundingClientRect();
        const taille = bulle.getBoundingClientRect();

        // Centrée sur l'ancre, puis ramenée dans la fenêtre par les deux bords.
        let gauche = ancre.left + ancre.width / 2 - taille.width / 2;
        gauche = Math.max(MARGE, Math.min(gauche, window.innerWidth - taille.width - MARGE));

        // Au-dessus par défaut ; en dessous s'il n'y a pas la place au-dessus.
        // ⚠️ On regarde la place RÉELLE, et non un seuil deviné : une bulle de
        // trois lignes et une bulle de dix n'ont pas le même besoin.
        let haut = ancre.top - taille.height - MARGE;
        if (haut < MARGE) haut = ancre.bottom + MARGE;

        bulle.style.left = Math.round(gauche) + "px";
        bulle.style.top = Math.round(haut) + "px";
    }

    function fermer(sauf) {
        document.querySelectorAll(".help-tip.open").forEach((el) => {
            if (el === sauf) return;
            el.classList.remove("open");
            const b = el.querySelector(".help-tip__pop");
            if (b) b.classList.remove("visible");
        });
    }

    // Gestion du tap (ouvre/ferme la bulle) et du survol.
    // Phase de CAPTURE pour le clic : on intercepte avant les onclick des cartes
    // cliquables, pour qu'un tap sur ⓘ n'entraîne pas une navigation.
    function init() {
        if (init._done) return;
        init._done = true;

        document.addEventListener("click", (e) => {
            const tipEl = e.target.closest ? e.target.closest(".help-tip") : null;
            fermer(tipEl);
            if (tipEl) {
                e.stopPropagation();
                e.preventDefault();
                const ouvre = !tipEl.classList.contains("open");
                tipEl.classList.toggle("open", ouvre);
                const b = tipEl.querySelector(".help-tip__pop");
                if (ouvre) placer(tipEl);
                else if (b) b.classList.remove("visible");
            }
        }, true);

        // ⚠️ Le survol et le focus passent aussi par le JS : une bulle `fixed`
        // ne peut pas être placée par une règle `:hover`, faute de connaître
        // la position de son ancre.
        const montrer = (e) => {
            const tipEl = e.target.closest ? e.target.closest(".help-tip") : null;
            if (tipEl) placer(tipEl);
        };
        const cacher = (e) => {
            const tipEl = e.target.closest ? e.target.closest(".help-tip") : null;
            if (tipEl && !tipEl.classList.contains("open")) {
                const b = tipEl.querySelector(".help-tip__pop");
                if (b) b.classList.remove("visible");
            }
        };
        document.addEventListener("mouseover", montrer);
        document.addEventListener("mouseout", cacher);
        document.addEventListener("focusin", montrer);
        document.addEventListener("focusout", cacher);

        document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermer(null); });

        // ⚠️ Une bulle fixe posée en pixels ne suit NI le défilement NI le
        // redimensionnement : sans cela, elle resterait accrochée au vide dès
        // que la page bouge sous elle.
        const suivre = () => {
            const ouverte = document.querySelector(".help-tip.open");
            if (ouverte) placer(ouverte);
            else document.querySelectorAll(".help-tip__pop.visible")
                .forEach((b) => b.classList.remove("visible"));
        };
        window.addEventListener("scroll", suivre, true);
        window.addEventListener("resize", suivre);
    }

    return { tip, init, placer, escapeHtml };
})();

// Alias pratiques pour les templates.
window.helpTip = Help.tip;
// Échappement HTML partagé (durcissement XSS) : à utiliser pour toute donnée
// utilisateur injectée en innerHTML. Fallback si un module le définit déjà en local.
window.escapeHtml = Help.escapeHtml;
