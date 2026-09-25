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
       ÉTIQUETTES DÉJÀ EMPLOYÉES — datalist partagé (migration 027)
       Même dispositif que celui des personnes, et pour la même raison : proposer
       ce qui existe déjà sans jamais interdire une valeur neuve. Une étiquette
       libre qui ne se propose pas se ressaisit avec une faute de frappe, et deux
       orthographes valent deux classements.
    ========================================================================= */
    function refreshEtiquettesDatalist() {
        var dl = document.getElementById("etiquettes-list");
        if (!dl || typeof DataStore === "undefined" || !DataStore.getDocuments) return;
        var vues = {};
        try {
            DataStore.getDocuments().forEach(function (d) {
                (Array.isArray(d.etiquettes) ? d.etiquettes : []).forEach(function (e) {
                    var v = String(e == null ? "" : e).trim();
                    if (v) vues[v.toLowerCase()] = v;
                });
            });
        } catch (e) { vues = {}; }
        dl.innerHTML = Object.keys(vues).sort().map(function (k) {
            return '<option value="' + esc(vues[k]) + '"></option>';
        }).join("");
    }

    /* =========================================================================
       CHAMP À PUCES (chips) — LE COMPOSANT, dont le multi-personnes est un CAS
       Sélecteur multiple adossé à un <datalist> (autocomplétion) tout en acceptant
       la saisie libre.

       ⚠️ **Généralisé le 11/09/2026, et ce n'est pas de l'élégance.** Le lot RGPD
       avait besoin du même champ pour les étiquettes d'un document ; en écrire une
       seconde copie aurait été le travers que ce dépôt a payé sept fois — corriger
       l'instance plutôt que la classe. Le multi-personnes est donc devenu une
       ENVELOPPE de trois lignes au-dessus du composant, exactement comme les deux
       enveloppes de `UI.genId` (`CLAUDE.md` §3).

         - chipsHtml(fieldId, valeurs, options) → markup (conteneur d'id `fieldId`)
         - wireChips(fieldId, options)          → interactions (ajout/retrait, Entrée)
         - getChips(fieldId)                    → TABLEAU de valeurs

       `options` : { liste, placeholder, maxLongueur, normaliser, refuser }.
    ========================================================================= */
    function parsePersons(str) {
        return String(str == null ? "" : str).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function personChipHtml(nom) {
        return '<span class="mp-chip"><span class="mp-label">' + esc(nom) + '</span>' +
            '<button type="button" class="mp-remove" aria-label="' + esc(t("commun.retirer")) + '">&times;</button></span>';
    }
    function chipsHtml(fieldId, valeurs, options) {
        var opt = options || {};
        var liste = Array.isArray(valeurs) ? valeurs : parsePersons(valeurs);
        var chips = liste.map(personChipHtml).join("");
        return '<div class="mp-field" id="' + fieldId + '">' +
            '<div class="mp-chips">' + chips + '</div>' +
            '<div class="mp-add">' +
                '<input type="text" class="mp-input"' +
                    (opt.liste ? ' list="' + esc(opt.liste) + '"' : '') +
                    (opt.maxLongueur ? ' maxlength="' + String(opt.maxLongueur) + '"' : '') +
                    ' placeholder="' + esc(opt.placeholder || t("commun.ajouter")) + '">' +
                '<button type="button" class="mp-addbtn">' + esc(t("commun.ajouter")) + '</button>' +
            '</div></div>';
    }
    function wireChips(fieldId, options) {
        var opt = options || {};
        var root = document.getElementById(fieldId);
        if (!root) return;
        var chips = root.querySelector(".mp-chips");
        var input = root.querySelector(".mp-input");
        var addBtn = root.querySelector(".mp-addbtn");
        function addChip() {
            var v = (input.value || "").trim();
            if (opt.normaliser) v = opt.normaliser(v);
            if (!v) return;
            // `refuser` rend un MOTIF (une phrase) ou rien. Le champ ne se contente
            // pas d'ignorer la saisie : une valeur avalée en silence est une valeur
            // que l'utilisateur croit enregistrée.
            var motif = opt.refuser ? opt.refuser(v) : "";
            if (motif) { if (window.showToast) window.showToast(motif, "error"); else alert(motif); return; }
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
    function getChips(fieldId) {
        var root = document.getElementById(fieldId);
        if (!root) return [];
        return Array.prototype.map.call(root.querySelectorAll(".mp-chips .mp-label"), function (el) {
            return el.textContent.trim();
        }).filter(Boolean);
    }

    /* ── Le multi-personnes : une ENVELOPPE, jamais une seconde copie ──────────
       Il ne garde en propre que ce qui lui est propre : le datalist de l'annuaire,
       son libellé, et le stockage « un nom par ligne » des champs texte existants. */
    function multiPersonHtml(fieldId, valueString) {
        return chipsHtml(fieldId, parsePersons(valueString),
            { liste: "personnes-list", placeholder: t("commun.ajouterPersonne") });
    }
    function wireMultiPerson(fieldId) { return wireChips(fieldId); }
    function getMultiPerson(fieldId) { return getChips(fieldId).join("\n"); }


    /* =====================================================================
       LE MENU SE REPLIE — lot L17, action A2
       ---------------------------------------------------------------------
       Trente-deux entrées à plat, dont dix-sept sous un seul intertitre : la
       barre latérale était une LISTE, pas une navigation. On la découpe en six
       sections repliables.

       ── Trois décisions, et chacune a un motif ──────────────────────────

       1. **L'appartenance d'une entrée à sa section est DÉDUITE du balisage**,
          jamais écrite ici : chaque entrée appartient à la dernière section
          rencontrée au-dessus d'elle. Une entrée neuve tombe donc dans la
          bonne section le jour où on l'ajoute au menu, sans que personne ait à
          penser à une liste — et l'oubli d'une liste, ici, ferait DISPARAÎTRE
          une entrée au premier repli (`CLAUDE.md` §3, cas (a)).

       2. **La section qui contient l'écran courant s'ouvre toujours**, quel que
          soit ce que le visiteur avait replié. Sans cela, on peut naviguer vers
          un écran dont l'entrée est cachée : le menu dirait que l'utilisateur
          n'est nulle part.

       3. **L'état replié vit dans `localStorage`**, et rien d'autre n'y vit.
          C'est une commodité d'affichage propre à un poste ; la mettre sur le
          serveur en ferait une donnée à cloisonner, à journaliser et à purger,
          pour un chevron. ⚠️ Toute lecture est sous `try` : un navigateur qui
          refuse le stockage doit rendre un menu ENTIÈREMENT DÉPLIÉ, jamais un
          menu vide.

       ⚠️ Aucun gestionnaire en ligne : la CSP du vhost les bloque, et
       l'application a été livrée un temps sans fonctionner pour cette raison.
    ===================================================================== */

    const CLE_REPLI = "cyber-nav-replie";

    function sectionsRepliees() {
        try {
            const brut = window.localStorage.getItem(CLE_REPLI);
            return brut ? JSON.parse(brut) : {};
        } catch (e) { return {}; }
    }

    function memoriserRepli(etat) {
        try { window.localStorage.setItem(CLE_REPLI, JSON.stringify(etat)); } catch (e) { /* sans effet */ }
    }

    /** Les entrées d'une section : tout ce qui suit son en-tête, jusqu'au suivant. */
    function entreesDe(entete) {
        const entrees = [];
        let noeud = entete.nextElementSibling;
        while (noeud && !noeud.classList.contains("nav-section")) {
            entrees.push(noeud);
            noeud = noeud.nextElementSibling;
        }
        return entrees;
    }

    /* ⚠️ Le repli passe par une CLASSE, jamais par l'attribut « hidden » — et
       c'est une correction, pas une préférence. `appliquerDroitsAuMenu()`
       (`js/app.js`) ÉCRIT `element.hidden` sur chaque entrée à chaque
       navigation, pour cacher ce que le profil n'a pas le droit de lire. Les
       deux couches se disputaient donc le même attribut, et la dernière
       gagnait : le menu se redépliait entièrement au premier changement
       d'écran. Mesuré — 31 entrées visibles sur 31, alors que cinq sections
       sur six s'annonçaient repliées.

       Avec une classe, les deux se COMPOSENT : une entrée s'affiche si le
       profil y a droit ET si sa section est ouverte. C'est la leçon du 6ᵉ
       passage de la porte S2 — *un même mot, vrai à un endroit et faux à
       l'autre, voyage d'autant mieux qu'on a pris soin de n'en avoir qu'un*. */
    function appliquerRepli(entete, replie) {
        const bouton = entete.querySelector(".nav-section-btn");
        if (bouton) bouton.setAttribute("aria-expanded", replie ? "false" : "true");
        entete.classList.toggle("replie", replie);
        entreesDe(entete).forEach(function (li) { li.classList.toggle("nav-repliee", replie); });
    }

    function wireNavSections() {
        const entetes = document.querySelectorAll(".main-nav .nav-section");
        if (!entetes.length) return;
        const etat = sectionsRepliees();

        entetes.forEach(function (entete) {
            const cle = entete.getAttribute("data-section");
            appliquerRepli(entete, etat[cle] === true);

            const bouton = entete.querySelector(".nav-section-btn");
            if (!bouton || bouton.dataset.branche === "1") return;
            bouton.dataset.branche = "1";
            bouton.addEventListener("click", function () {
                const courant = sectionsRepliees();
                const replie = !(courant[cle] === true);
                courant[cle] = replie;
                memoriserRepli(courant);
                appliquerRepli(entete, replie);
            });
        });
    }

    /** Ouvre la section de l'écran courant — décision 2 ci-dessus. */
    function ouvrirSectionActive() {
        const actif = document.querySelector(".main-nav a.active");
        if (!actif) return;
        let noeud = actif.closest("li");
        while (noeud && !noeud.classList.contains("nav-section")) {
            noeud = noeud.previousElementSibling;
        }
        if (noeud) appliquerRepli(noeud, false);
    }


    /* =====================================================================
       UN TABLEAU LARGE DÉFILE DANS SON CADRE — passe de style du 16/09/2026
       ---------------------------------------------------------------------
       La règle « Table Handling » de la skill `ui-ux-pro-max` : un tableau
       qui déborde ne doit pas casser la page, il doit défiler dans son
       propre cadre. La feuille de style porte `.table-scroll` ; encore
       faut-il que quelque chose l'emploie.

       ⚠️ **On enveloppe APRÈS RENDU, pour les vingt-six modules à la fois.**
       L'alternative était d'ajouter un `<div>` dans chacun — vingt-six
       fichiers à modifier, et le vingt-septième module l'oublierait. Ici, un
       tableau neuf est couvert le jour où il est rendu, sans que personne y
       pense : c'est la même raison qui fait poser les déclencheurs sur les
       tables plutôt que dans les routes.

       ⚠️ Et c'est IDEMPOTENT : un tableau déjà enveloppé est laissé tel quel,
       sans quoi chaque navigation ajouterait une couche. */
    function envelopperTableaux(racine) {
        const hote = racine || document.getElementById("app");
        if (!hote) return;
        hote.querySelectorAll("table.data-table").forEach(function (table) {
            const parent = table.parentElement;
            if (parent && parent.classList.contains("table-scroll")) return;
            const cadre = document.createElement("div");
            cadre.className = "table-scroll";
            parent.insertBefore(cadre, table);
            cadre.appendChild(table);
        });
    }

    /* =====================================================================
       LE GABARIT D'ÉCRAN — un seul en-tête pour tout le produit
       =====================================================================

       ── Ce que ce composant répare ──────────────────────────────────────

       **Trente modules recomposaient `dashboard-header` à la main**, chacun avec
       sa propre idée du sous-titre, de la place des boutons et de l'espacement.
       Mesuré le 16/09/2026 : **278 déclarations `font-size` en dur portant 42
       valeurs distinctes**, dont huit entre 0,70 et 0,78 rem — c'est-à-dire huit
       tailles pour ce qui est visuellement la même —, et **aucun module
       n'employait l'échelle typographique** de `css/tokens.css`.

       Ce n'est pas un défaut de soin : c'est ce que produit un gabarit recopié.
       *Ce qui se recopie trente fois diverge trente fois.*

       ── Ce qu'il apporte, et qu'aucun module n'a plus à décider ──────────

         · le TITRE et le SOUS-TITRE, à la même taille partout ;
         · la barre d'ONGLETS, quand un objet se regarde de plusieurs façons —
           un onglet est un `<a href="#/route">`, donc une vraie navigation :
           il se partage, il revient avec le bouton « Précédent », et il est
           atteignable au clavier sans une ligne de script ;
         · la place des ACTIONS, à droite, hors impression ;
         · un point d'accroche unique pour tout ce qui viendra ensuite.

       ⚠️ **Il rend une CHAÎNE, il n'écrit pas dans le DOM.** C'est la convention
       du produit (`ApprobationsModule.encartHtml`, `PiecesModule.hoteHtml`) : le
       module compose son gabarit entier, l'affecte en une fois, puis branche.
       Un composant qui écrirait lui-même obligerait chaque appelant à connaître
       l'ordre des opérations.

       ⚠️ **Tout ce qui vient de la donnée passe par `esc`**, y compris le titre :
       une fiche s'intitule du nom que l'utilisateur a saisi.
    ===================================================================== */

    /**
     * Les écrans qui regardent UN MÊME SUJET sous plusieurs angles.
     *
     * ── Une liste écrite à la main, et c'est le bon outil ────────────────────
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Ici, un écran oublié
     * **garde sa route, son entrée de menu et son contenu** : il perd seulement
     * sa barre d'onglets, ce qui se voit du premier coup d'œil. L'omission
     * échoue donc bruyamment, et le regroupement est précisément une **décision
     * humaine** — « la matrice est une vue des risques » n'est écrit nulle part
     * dans le schéma, et aucun catalogue ne le déduira.
     *
     * La règle exige alors de **figer la liste à un endroit qui la compare au
     * réel** : `test/navigateur/onglets.test.mjs` vérifie que chaque route
     * nommée ici est une route RÉELLEMENT enregistrée par le routeur, et que
     * l'onglet actif est bien celui de l'écran affiché.
     *
     * ⚠️ **Les libellés sont ceux de la VUE, pas ceux du menu.** Le menu nomme
     * une porte — « Registre des risques » —, un onglet nomme un angle :
     * « Registre », « Matrice F×G », « Socle du Groupe ». Les confondre ferait
     * lire deux fois le même mot à deux centimètres d'écart.
     */
    const GROUPES_ONGLETS = [
        Object.freeze({
            sujet: "risques",
            vues: Object.freeze([
                Object.freeze({ route: "/risques", libelle: "Registre" }),
                Object.freeze({ route: "/matrice", libelle: "Matrice F\u00d7G" }),
                // Lot L25 — les ateliers EBIOS RM sont une VUE du même sujet, le
                // risque, et non un sujet à part : un onglet, donc, et non une
                // entrée de menu de plus (`docs/PLAN_INTERFACE.md`).
                //
                // ⚠️ Le voisinage avec « Matrice F×G » est VOULU et il est le
                // message : les deux méthodes cohabitent, la seconde ne remplace
                // pas la première. Ranger EBIOS ailleurs aurait laissé croire
                // qu'il s'agit d'un autre outil, et perdre la matrice de vue est
                // exactement ce que le critère 25.1 refuse.
                Object.freeze({ route: "/ebios", libelle: "Ateliers EBIOS RM" }),
                // Lot L25, action 25.3 — l'échelle dit ce que « 3 » veut dire.
                // Un onglet du même sujet : on ne la lit qu'en cotant, et une
                // entrée de menu de plus rendrait au menu ce qu'on vient de lui
                // retirer (`docs/PLAN_INTERFACE.md`).
                Object.freeze({ route: "/echelles", libelle: "\u00c9chelles de cotation" }),
                Object.freeze({ route: "/socle", libelle: "Socle du Groupe" })
            ])
        }),
        Object.freeze({
            // L'administration des habilitations : CINQ vues d'un seul sujet —
            // ⚠️ ce commentaire a dit « trois » jusqu'au 25/09/2026, puis le sujet a gagné
            //    les revues d'accès (22/09) et les délégations temporaires (24/09). Un
            //    commentaire qui compte des éléments juste en dessous de lui vieillit vite :
            // ce que les profils accordent, par quels groupes d'annuaire, et à
            // qui. Une entrée de menu, trois onglets.
            sujet: "habilitations",
            vues: Object.freeze([
                Object.freeze({ route: "/habilitations", libelle: "Matrice des droits" }),
                Object.freeze({ route: "/habilitations-groupes", libelle: "Groupes d\u2019annuaire" }),
                Object.freeze({ route: "/habilitations-comptes", libelle: "Comptes" }),
                // La REVUE des droits d'accès : ce qui fait de cet écran une pièce
                // de conformité (ISO 27001 A.5.18) et non un panneau d'administration.
                Object.freeze({ route: "/habilitations-revues", libelle: "Revues des acc\u00e8s" }),
                // La DÉLÉGATION TEMPORAIRE (migration `068`). ⚠️ Elle vit ici, avec
                // les profils, les groupes et la revue : un administrateur doit voir
                // au même endroit TOUT ce qui ouvre un accès. L'éparpiller aurait
                // rouvert le défaut que cet écran ferme.
                Object.freeze({ route: "/habilitations-delegations",
                                libelle: "D\u00e9l\u00e9gations temporaires" })
            ])
        }),
        Object.freeze({
            sujet: "rgpd",
            vues: Object.freeze([
                Object.freeze({ route: "/rgpd", libelle: "Traitements" }),
                // Action 20.3 — un ONGLET, pas une entrée de menu : l'analyse
                // d'impact est une vue du registre, pas un sujet à part. L'ajouter
                // au menu rendrait à celui-ci ce qu'on vient de lui retirer.
                Object.freeze({ route: "/rgpd-aipd", libelle: "Analyses d\u2019impact" }),
                // Action 20.4 — un onglet encore, et pour le même motif : les
                // demandes d'exercice de droits sont une vue du registre RGPD.
                Object.freeze({ route: "/rgpd-demandes", libelle: "Demandes de droits" }),
                Object.freeze({ route: "/rgpd-documents", libelle: "Documents" }),
                Object.freeze({ route: "/rgpd-outil", libelle: "L\u2019outil lui-m\u00eame" })
            ])
        }),
        Object.freeze({
            // Lot L21 — le registre d'information DORA est une VUE des mêmes
            // tiers, pas un sujet à part : un onglet, donc, et non une entrée de
            // menu. L'ajouter au menu rendrait à celui-ci les entrées qu'on
            // vient de lui retirer (`docs/PLAN_INTERFACE.md`).
            sujet: "prestataires",
            vues: Object.freeze([
                Object.freeze({ route: "/prestataires", libelle: "Annuaire" }),
                Object.freeze({ route: "/tiers-dora", libelle: "Registre DORA" })
            ])
        }),
        Object.freeze({
            // Lot « Paramètres » (19/09/2026) — l'écran s'appelait « Échange de
            // données » et portait déjà six blocs, dont trois sans rapport avec
            // l'échange : l'état de la liaison, la sécurité et le jeu de
            // découverte. Le nom mentait sur le contenu ; les onglets le disent.
            sujet: "parametres",
            vues: Object.freeze([
                Object.freeze({ route: "/settings", libelle: "Identit\u00e9" }),
                Object.freeze({ route: "/settings-reglages", libelle: "R\u00e9glages" }),
                Object.freeze({ route: "/settings-echange", libelle: "\u00c9change de donn\u00e9es" }),
                Object.freeze({ route: "/settings-decouverte", libelle: "Jeu de d\u00e9couverte" }),
                // Lot L22 — les jetons d'API et les abonnements aux événements
                // sortants sont une CONFIGURATION D'EXPLOITATION : qui a le droit
                // de parler à ce serveur sans compte humain, et vers où il parle.
                // Un onglet des paramètres, donc, et non une entrée de menu de
                // plus (`docs/PLAN_INTERFACE.md`).
                Object.freeze({ route: "/settings-ouverture", libelle: "Ouverture technique" }),
                // Lot L27 — l'assistance par IA. Un onglet des Paramètres, parce que
                // ce qu'on y règle est le MODE (local ou externe) et ce qui part :
                // c'est une question d'exploitation, pas un sujet métier.
                Object.freeze({ route: "/assistance", libelle: "Assistance IA" })
            ])
        }),
        Object.freeze({
            // Lots L22 (action 22.4) et L23 — la collecte automatique est une VUE
            // des mesures : un connecteur rapporte la preuve d'UNE mesure, et
            // c'est sur la mesure qu'on va chercher cette preuve. Un onglet du
            // même sujet, donc, et non une entrée de menu (`docs/PLAN_INTERFACE.md`).
            sujet: "mesures",
            vues: Object.freeze([
                Object.freeze({ route: "/mesures", libelle: "Mesures de s\u00e9curit\u00e9" }),
                Object.freeze({ route: "/collecte", libelle: "Collecte automatique" })
            ])
        }),
        Object.freeze({
            sujet: "referentiels",
            vues: Object.freeze([
                Object.freeze({ route: "/referentiels", libelle: "Catalogue" }),
                Object.freeze({ route: "/referentiels-actifs", libelle: "Applicables ici" }),
                Object.freeze({ route: "/couverture", libelle: "Couverture crois\u00e9e" }),
                // Lot L24 — une campagne descendante demande UN RÉFÉRENTIEL à des
                // filiales : c'est une vue de la conformité, pas un sujet à part. Un
                // onglet, donc, et non une entrée de menu — sans quoi on rendrait au
                // menu les entrées qu'on vient de lui retirer (`docs/PLAN_INTERFACE.md`).
                Object.freeze({ route: "/campagnes", libelle: "Campagnes du Groupe" }),
                // Lot L26 — GÉRER les catalogues n'est pas les ÉVALUER. L'onglet
                // « Catalogue » sert à répondre ; celui-ci sert à savoir ce que les
                // catalogues contiennent, quand la norme a été publiée, et ce qu'un
                // changement de version met en jeu. Un onglet du même sujet, donc,
                // et non une entrée de menu de plus (`docs/PLAN_INTERFACE.md`).
                Object.freeze({ route: "/catalogues", libelle: "Gestion des catalogues" })
            ])
        })
    ];

    /**
     * La barre d'onglets de l'écran `route`, ou `null` s'il n'appartient à aucun
     * groupe. L'onglet de `route` est marqué actif.
     */
    function ongletsDe(route) {
        const groupe = GROUPES_ONGLETS.find(function (g) {
            return g.vues.some(function (v) { return v.route === route; });
        });
        if (!groupe) return null;
        return groupe.vues.map(function (v) {
            return { route: v.route, libelle: v.libelle, actif: v.route === route };
        });
    }

    /**
     * L'en-tête d'un écran. Rend une chaîne à insérer en tête de `<section class="page">`.
     *
     * @param {{titre: string, contexte?: string, aide?: string,
     *          onglets?: Array<{route: string, libelle: string, actif?: boolean}>,
     *          actions?: string}} opts
     */
    function enteteHtml(opts) {
        const o = opts || {};
        const actions = o.actions
            ? '<div class="page-actions no-print">' + o.actions + "</div>"
            : "";
        // ⚠️ `aide` est une NOTE PÉDAGOGIQUE déjà composée (`Help.tip(...)`), donc
        // du balisage produit par le code : elle n'est pas échappée, et elle ne
        // doit jamais recevoir de valeur venue de la donnée.
        const aide = o.aide || "";
        const contexte = o.contexte
            ? '<p class="page-contexte">' + esc(o.contexte) + "</p>"
            : "";
        return ''
            + '<div class="page-entete">'
            +   "<div><h1>" + esc(o.titre || "") + aide + "</h1>" + contexte + "</div>"
            +   actions
            + "</div>"
            + ongletsHtml(o.onglets);
    }

    /**
     * La barre d'onglets d'un écran, ou une chaîne vide s'il n'y en a pas.
     *
     * ⚠️ **Un onglet est un LIEN, pas un bouton.** Les trois écrans qui en
     * gagnent — Risques, Référentiels, Registre RGPD — regardent le même sujet
     * sous plusieurs angles, et chaque angle a déjà sa route. En faire un état
     * interne au module coûterait le partage d'un lien, le retour arrière du
     * navigateur, et l'accès au clavier — trois choses gratuites autrement.
     */
    function ongletsHtml(onglets) {
        if (!Array.isArray(onglets) || onglets.length === 0) return "";
        let html = '<nav class="page-onglets no-print" aria-label="Vues de cet écran"><ul>';
        onglets.forEach(function (o) {
            const actif = o.actif === true;
            html += '<li><a href="#' + esc(o.route) + '" data-route="' + esc(o.route) + '"'
                 +  (actif ? ' class="page-onglet--actif" aria-current="page"' : "")
                 +  ">" + esc(o.libelle) + "</a></li>";
        });
        return html + "</ul></nav>";
    }

    /**
     * Attend que le serveur SACHE, puis exécute le rappel.
     *
     * ── ⚠️ POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE A COÛTÉ ────────────
     *
     * Un panneau dont l'état vient du SERVEUR — les dérogations (19.2), les
     * analyses d'impact (20.3) — le relit après chaque écriture. C'est juste :
     * l'état se dérive, et le recomposer depuis `data` afficherait une ligne
     * SANS état. Mais `DataStore.addX()` n'écrit qu'en mémoire : la poussée vers
     * le serveur est asynchrone, et relire immédiatement interroge un serveur qui
     * n'a encore rien reçu.
     *
     * **Le panneau affiche alors « aucune analyse » juste après en avoir créé
     * une.** Mesuré le 16/09/2026 sur la recette, à travers Apache et TLS — et
     * INVISIBLE au banc, où le serveur répond dans la même milliseconde. C'est
     * exactement la classe du constat **Q-325** : *l'essai prouve que le
     * mécanisme fonctionne ; personne ne mesure ce que l'utilisateur reçoit.*
     *
     * `Sync.pousser()` rend la promesse du cycle d'écriture, et la file est
     * séquentielle : l'attendre attend aussi ce qui était déjà en attente.
     *
     * ⚠️ **Un échec de poussée ne bloque PAS le rappel.** Le panneau doit se
     * redessiner même quand l'envoi a échoué : c'est le bandeau de `sync.js` qui
     * porte l'incident, et un écran figé par-dessus n'ajouterait rien qu'une
     * seconde panne.
     */
    function apresEcriture(rappel) {
        if (typeof rappel !== "function") return Promise.resolve();
        const pousse = (window.Sync && typeof Sync.pousser === "function")
            ? Sync.pousser()
            : null;
        return Promise.resolve(pousse).catch(function () { /* voir ci-dessus */ })
            .then(function () { return rappel(); });
    }

    /* =====================================================================
       LE MONTANT D'UNE QUANTIFICATION FAIR (v25, action 25.4)

       ⚠️ **Cette fonction MET EN FORME ; elle ne CALCULE rien.** Le montant lui
       arrive tel que le serveur l'a servi — `_perteAnnualisee`, colonne engendrée
       dont `f_fair_perte_annualisee()` est l'unique définition. Le recalculer ici
       ferait deux points de mesure d'une même grandeur, et le jour où l'un des
       deux change, l'écran d'une filiale cesse d'afficher ce que le tableau de
       bord du Groupe additionne — sans que rien ne le dise (constat **Q-219**).

       ⚠️ **Le « ≥ » n'est pas une coquetterie.** Quand les pertes secondaires ne
       sont pas estimées, le total ne porte que la perte primaire : c'est un
       PLANCHER. L'afficher comme un total serait une estimation par défaut dans
       le sens rassurant — exactement ce que le critère 25.4 interdit.
    ===================================================================== */

    /**
     * Le montant d'une perte annualisée, **déjà échappé**, prêt à être injecté.
     *
     * Rend `null` — jamais « 0 », jamais un tiret — quand le montant n'est pas
     * calculable : l'appelant doit pouvoir DIRE « estimation incomplète », ce
     * qui n'est pas la même chose que « ce risque ne coûte rien ».
     *
     * ⚠️ **ELLE REND DU BALISAGE ÉCHAPPÉ, comme `UI.badge`** — et l'appelant ne
     * doit donc PAS l'échapper une seconde fois, sous peine d'afficher
     * « &amp;#8805; ». Ce n'est pas un choix de style : le garde-fou
     * `traductions.test.mjs` §37.3 exige qu'un appel à `I18n.nombre()` sur une
     * donnée soit échappé **en amont, sur la même ligne** — parce que la sœur à
     * repli brut rend `String(valeur)` telle quelle quand l'entrée n'est pas
     * analysable, et que `devise` vient de la base. Le schéma la borne à trois
     * capitales aujourd'hui ; *ce qui protège une chaîne n'est pas l'endroit
     * d'où elle vient, c'est ce qu'on en fait*.
     */
    function montantFair(valeur, devise, secondaireEstimee) {
        if (valeur === null || valeur === undefined || valeur === "") return null;
        var n = Number(valeur);
        if (!isFinite(n)) return null;
        var texte = escapeHtml(I18n.nombre(n, { maximumFractionDigits: 0 }) + " " + (devise || "EUR"));
        return secondaireEstimee === false ? "\u2265 " + texte : texte;
    }

    /* =====================================================================
       LES ÉCHELLES DE COTATION (v24, action 25.3)

       Deux helpers, et un seul endroit : les écrans de cotation sont au moins
       deux — le registre des risques et les ateliers EBIOS RM — et chacun
       écrivait jusqu'ici sa propre graduation en dur. Deux rédactions de la même
       chose se mettent à diverger au premier ajustement (constat **Q-219**).

       ⚠️ **Le repli n'est pas un détail.** Tant qu'aucune échelle n'est en
       vigueur — base antérieure à la migration `049`, ou socle archivé sans
       successeur —, les écrans doivent continuer de fonctionner avec les quatre
       niveaux qu'ils proposaient. Un produit qui n'afficherait plus aucun choix
       serait cassé par une donnée manquante, ce qu'aucun écran n'a le droit
       d'être.
    ===================================================================== */

    /**
     * Les `<option>` d'un sujet de cotation, tirées de l'échelle en vigueur.
     *
     * `replis` est la liste `[{ valeur, libelle }]` employée quand aucune échelle
     * n'existe — celle que l'écran affichait avant la v24.
     */
    function optionsEchelle(sujet, valeurCourante, replis) {
        var echelle = (window.DataStore && DataStore.getEchelleEnVigueur)
            ? DataStore.getEchelleEnVigueur(sujet) : null;
        var niveaux = (echelle && DataStore.getNiveauxEchelle)
            ? DataStore.getNiveauxEchelle(echelle.id) : [];
        var source = niveaux.length > 0
            ? niveaux.map(function (n) { return { valeur: n.valeur, libelle: n.libelle }; })
            : (replis || []);
        return source.map(function (n) {
            var choisi = String(n.valeur) === String(valeurCourante) ? " selected" : "";
            return '<option value="' + esc(n.valeur) + '"' + choisi + ">"
                 + esc(n.valeur) + " \u2014 " + esc(n.libelle) + "</option>";
        }).join("");
    }

    /**
     * La mention « coté sur telle échelle », ou « échelle non tracée ».
     *
     * ⚠️ **Elle ne se tait JAMAIS.** Ne rien afficher quand l'échelle est absente
     * rendrait indistinguables « cette cotation a été produite sur la graduation
     * du Groupe » et « personne ne sait sur quoi elle a été produite » — c'est la
     * classe des constats **Q-201 / Q-207**, où un écran faisait disparaître une
     * information sans un mot, et **Q-335**, où il masquait un différentiel sans
     * le dire.
     */
    function mentionEchelle(echelleId) {
        var echelle = (echelleId && window.DataStore && DataStore.getEchelleById)
            ? DataStore.getEchelleById(echelleId) : null;
        if (!echelle) {
            return '<span class="muted" title="'
                 + esc("Cette cotation a été produite avant que les échelles existent, ou par un chemin qui n'en a pas nommé. Le produit ne lui en attribue pas une d'office : ce serait inventer un fait. Recotez-la pour qu'elle porte la graduation en vigueur.")
                 + '">' + esc("\u00e9chelle non trac\u00e9e") + "</span>";
        }
        var portee = echelle._porteeGroupe === true ? "socle du Groupe" : "\u00e9chelle de la filiale";
        return '<span class="muted" title="' + esc(echelle.nom + " \u2014 " + portee) + '">'
             + esc("cot\u00e9 sur « " + echelle.nom + " », r\u00e9vision " + (echelle.revision || 1))
             + "</span>";
    }

    return {
        apresEcriture,
        montantFair,
        enteteHtml, ongletsHtml, ongletsDe,
        contratOnglets: Object.freeze(GROUPES_ONGLETS),
        optionsEchelle, mentionEchelle,
        envelopperTableaux,
        wireNavSections, ouvrirSectionActive,
        badge, mappedBadge, wireBulkDelete, wireDelete, genId, refreshPersonnesDatalist,
        refreshEtiquettesDatalist, findPersonneByNom,
        chipsHtml, wireChips, getChips,
        multiPersonHtml, wireMultiPerson, getMultiPerson
    };
})();
