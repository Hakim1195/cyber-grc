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

    /* Traduction (lot L10). Repli sur la CLÉ si le moteur n'est pas chargé :
       rendre du français ici masquerait précisément ce que le §37.2 veut voir.

       ⚠️ **Elle s'appelle `t`, comme partout ailleurs, et ce n'est pas un
       hasard.** Elle a d'abord porté un autre nom — et le contrôle mécanique du
       §37.2, qui découvre les clés en cherchant `t("…")`, a compté **zéro clé**
       dans ce fichier. Un helper renommé « pour éviter la collision » sort du
       balayage sans rien dire : la collision, ici, est voulue — la fonction
       locale masque `window.t` dans cette portée, et fait la même chose en
       plus prudent. */
    function t(cle, valeurs) {
        if (window.I18n) return window.I18n.t(cle, valeurs);
        return cle;
    }

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
                    : t("commun.confirmerSuppressionMultiple", { n: ids.length });
                if (!confirm(message)) return;
                if (typeof opts.remove === "function") ids.forEach((id) => opts.remove(id));
                if (window.showToast) {
                    const msg = typeof opts.toast === "function"
                        ? opts.toast(ids.length)
                        : t("commun.elementsSupprimes", { n: ids.length });
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
                : (opts.confirm || t("commun.confirmerSuppression"));
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
       Convention du produit : "<PRÉFIXE>-<horodatage>-<aléa>"
       (`CONVENTIONS.md` §2 ; genId("ACT") → "ACT-1720000000000-1k3f9zq2x").

       ── Ce que la porte S2 (3ᵉ passage, constat T-1) a corrigé ici ───────────

       L'aléa tenait sur **mille valeurs** (`Math.floor(Math.random() * 1000)`).
       Dans une boucle d'import, `Date.now()` ne bouge pas d'une itération à
       l'autre : l'identifiant se réduit alors à ce tirage, et l'auditeur a
       mesuré **22 doublons sur 234 tirages consécutifs**. Chaque doublon coûtait
       une ligne — un registre d'exigences ou un questionnaire AirCyber amputé de
       5 à 10 % de son contenu, dans l'outil destiné à servir de preuve en audit.

       Deux garanties, et la première suffit à elle seule pour un import :

        1. un **compteur de session**, monotone : deux appels de cette page ne
           peuvent pas rendre le même identifiant, quel que soit le hasard ;
        2. **52 bits d'aléa** tirés de `crypto.getRandomValues` (repli sur
           `Math.random` si l'API manque), qui rendent la collision entre deux
           postes, deux sessions ou deux filiales aussi improbable qu'un UUID.

       Le format et la longueur restent compatibles avec le domaine `id_metier`
       du schéma (non vide, 64 caractères au plus, sans virgule, sans blanc de
       bord) : un identifiant fait ici une trentaine de caractères.
    ========================================================================= */
    var compteurSession = 0;

    function aleaFort() {
        try {
            var api = (typeof crypto !== "undefined") ? crypto : null;
            if (api && typeof api.getRandomValues === "function") {
                var t = new Uint32Array(2);
                api.getRandomValues(t);
                return t[0].toString(36) + t[1].toString(36);
            }
        } catch (e) { /* contexte sans Web Crypto : repli ci-dessous */ }
        return Math.floor(Math.random() * 4294967296).toString(36)
            + Math.floor(Math.random() * 4294967296).toString(36);
    }

    /* =========================================================================
       LE GARDE-FOU D'EXÉCUTION DE CE GÉNÉRATEUR — constat Q-23

       ── Le manque, et pourquoi il a failli disparaître ──────────────────────

       Le §2 de `backend/db/CONVENTIONS.md` recense trois générateurs aléatoires
       et dit ce qui les garde : celui du serveur est mesuré au démarrage et
       **refuse de démarrer** en cas de régression ; celui de la base a le sien
       dans `f_verifier_schema()` ; celui-ci « n'en a pas encore ». Le manque
       était donc écrit et exact — mais rattaché à un constat qui parlait
       d'autre chose et qui est clos, si bien qu'il serait sorti du registre
       sans avoir jamais eu de propriétaire.

       ── Ce qu'un générateur faible coûte ENCORE, mesuré ─────────────────────

       Il ne coûte plus de lignes : deux barrières le tiennent. Le tri des
       créations indexe par RANG (`ordonnerCreations`), donc aucun générateur ne
       peut faire disparaître une ligne ; et **l'identifiant fabriqué ici ne
       devient jamais une clé primaire** — `js/core/sync.js` appelle
       `Api.creer(collection, null, champs)`, le serveur refuse qu'on lui en
       propose un, et il rend le sien.

       Ce qu'il coûte, en revanche, a été rejoué au banc. Générateur d'avant le
       remède T-1 (mille valeurs, sans compteur), 250 mesures créées et reliées
       chacune à une évaluation :

           250 lignes confiées, 250 lignes EN BASE — rien n'est perdu ;
           226 identifiants distincts ;
           226 cibles de référence distinctes — **24 évaluations reliées à la
           mauvaise mesure de sécurité**, sans rien qui le montre à l'écran.

       Dans un produit qui engendre la déclaration d'applicabilité et sert de
       preuve en audit, une exigence rattachée au mauvais contrôle est un défaut
       plus sournois qu'une ligne manquante : la ligne manquante finit par se
       voir.

       ── Le contrôle retenu, et les deux qui ont été écartés ─────────────────

       **Écarté — mesurer l'entropie au chargement**, comme le fait le serveur.
       Deux raisons. Le navigateur n'a pas de démarrage où échouer bruyamment
       sans empêcher quelqu'un de travailler, et refuser d'ouvrir l'application
       pour un défaut qui ne perd plus aucune ligne serait pire que le défaut.
       Surtout, **l'entropie n'est plus la propriété qui compte ici** : puisque
       l'identifiant ne quitte pas la page, ce qu'il faut garantir est
       l'unicité DANS LA SESSION, et elle est portée par le compteur monotone,
       pas par le hasard. Mesurer 20 000 tirages éprouverait donc autre chose
       que ce qui protège.

       **Écarté — vérifier la FORME** (trois segments, 64 caractères au plus).
       Le domaine `id_metier` ne voit jamais cette valeur : le contrôle serait
       décoratif. C'est exactement le reproche fait au garde-fou de la base
       (constat Q-17), qui mesurait une longueur qu'un `padStart` rendait
       infaillible et laissait passer un générateur à 40 bits.

       **Retenu — un détecteur sur le chemin réel.** Le générateur retient ce
       qu'il a émis dans cette session ; s'il rend deux fois la même valeur, il
       le DIT — au moment où la valeur est produite, en nommant la cause. Il ne
       répare pas : inventer une forme d'identifiant que le §2 ne décrit pas
       serait pire, et les conséquences sont déjà tenues par les deux barrières.

       ── Ce que ce garde-fou ne couvre pas, et il faut le savoir ─────────────

       Il vit DANS `genId`. Quelqu'un qui remplace `UI.genId` en entier — ce que
       fait délibérément l'essai de la seconde barrière — sort de sa portée ; ce
       cas-là reste couvert par le canari de `js/core/sync.js`, qui constate deux
       enregistrements de même clé. Les deux ne disent pas la même chose : celui-ci
       accuse le générateur, l'autre constate le résultat sans pouvoir distinguer
       un générateur fautif d'un fichier repris incohérent.
    ========================================================================= */
    var identifiantsEmis = new Set();
    // Borne mémoire. Le plus gros geste du produit est l'import d'un
    // questionnaire (AirCyber, 234 questions) ou d'un classeur de quelques
    // centaines de lignes ; 50 000 est deux ordres de grandeur au-dessus. Au-delà,
    // on cesse de mémoriser plutôt que de laisser enfler la page : le détecteur
    // se dégrade, il ne se retourne pas contre l'utilisateur.
    var IDENTIFIANTS_EMIS_MAX = 50000;

    /* ── LE SÉPARATEUR N'EST PAS COSMÉTIQUE ─────────────────────────────────
       Le compteur et l'aléa étaient collés l'un à l'autre. Les deux ont une
       LONGUEUR VARIABLE en base 36, si bien que la concaténation était ambiguë
       et que deux appels d'une même page pouvaient rendre le même identifiant :

           compteur 1,  aléa "0ab"  ->  ...-1 0ab  =  "10ab"
           compteur 36, aléa  "ab"  ->  ...-10 ab  =  "10ab"

       Ce n'est pas une hypothèse : la collision a été fabriquée avec CE
       générateur, sans en modifier une ligne — seuls l'horloge et la source
       d'aléa étaient imposées —, et le détecteur ci-dessous l'a annoncée.

       La conséquence dépasse le cas : le §2 de `backend/db/CONVENTIONS.md`
       affirme que « le compteur suffit à lui seul pour un import : deux appels
       d'une même page ne peuvent pas rendre le même identifiant, quel que soit
       le hasard ». C'était FAUX tant que rien ne séparait les deux champs — le
       compteur ne suffisait pas, il ne faisait qu'ajouter de l'improbable à de
       l'improbable. Avec le séparateur, deux compteurs différents donnent deux
       chaînes différentes **quoi qu'il arrive**, et la phrase devient vraie.
       La forme engendrée gagne un caractère (47 au plus, pour un domaine qui en
       admet 64) : c'est à signaler au document normatif, qui décrit trois
       segments là où il y en a désormais quatre.
    ───────────────────────────────────────────────────────────────────────── */
    function genId(prefix) {
        compteurSession += 1;
        var id = (prefix || "ID") + "-" + Date.now() + "-" + compteurSession.toString(36) + "-" + aleaFort();
        if (identifiantsEmis.has(id)) {
            // Un défaut de programmation, pas un cas d'usage : on le crie.
            console.error("Générateur d'identifiants : « " + id + " » a déjà été émis dans cette session.");
            try {
                if (typeof Sync !== "undefined" && Sync.signalerGenerateurDouble) Sync.signalerGenerateurDouble(id);
            } catch (e) { /* un signalement ne doit jamais empêcher une création */ }
        } else if (identifiantsEmis.size < IDENTIFIANTS_EMIS_MAX) {
            identifiantsEmis.add(id);
        }
        return id;
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
            '<button type="button" class="mp-remove" aria-label="' + esc(t("commun.retirer")) + '">&times;</button></span>';
    }
    function multiPersonHtml(fieldId, valueString) {
        var chips = parsePersons(valueString).map(personChipHtml).join("");
        return '<div class="mp-field" id="' + fieldId + '">' +
            '<div class="mp-chips">' + chips + '</div>' +
            '<div class="mp-add">' +
                '<input type="text" class="mp-input" list="personnes-list" placeholder="' +
                    esc(t("commun.ajouterPersonne")) + '">' +
                '<button type="button" class="mp-addbtn">' + esc(t("commun.ajouter")) + '</button>' +
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
