/**
 * referentiels_actifs.js — COUTURE PUBLIÉE AVANT SON CONTENU.
 *
 * Ce fichier existe vide pour que l'agent qui l'écrit n'ait pas à toucher à
 * `index.html` ni à `js/app.js` : deux agents sur ces fichiers partagés
 * violeraient le périmètre disjoint qu'exige le `PLAN_EXECUTION` §2.
 *
 * La route, l'entrée de menu, la balise de chargement et le domaine de droits
 * sont déjà posés. Il ne reste qu'à remplir `renderList` (et, si le domaine le
 * demande, `renderDetail`).
 *
 * ⚠️ Conventions du projet, chacune payée par un défaut :
 *   · `escapeHtml` sur toute donnée utilisateur injectée en DOM ;
 *   · AUCUN gestionnaire en ligne (`onclick=`…) — la politique de sécurité de
 *     contenu du vhost les bloque, et l'application a été livrée un temps sans
 *     fonctionner pour cette raison. On branche après rendu ;
 *   · l'identifiant se lit dans un attribut du DOM AU MOMENT DU CLIC, jamais
 *     capturé en chaîne dans une fermeture — le serveur réattribue les
 *     identifiants à la création ;
 *   · seuls les tokens de `css/tokens.css`.
 */
var ReferentielsActifsModule = (function () {
    "use strict";

    function renderList() {
        const app = document.getElementById("app");
        if (!app) return;
        app.innerHTML = '<div class="card"><p class="muted">Écran non encore livré.</p></div>';
    }

    return { renderList };
})();
