// Emplacement : js/i18n/index.js
// Nom du fichier : index.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  INTERNATIONALISATION DE L'INTERFACE — lot L10, `backend/db/CONVENTIONS.md` §37
// ═══════════════════════════════════════════════════════════════════════════
//
// FR + EN sont obligatoires au cadrage. Ce fichier porte la fonction de
// traduction, le repli bruyant, la résolution de la langue et le formatage des
// dates et des nombres. Les dictionnaires vivent à côté (`fr.js`, `en.js`).
//
// ── §37.1 — aucune étape de compilation ────────────────────────────────────
//
// La SPA se charge par des `<script>` séquentiels. Un dictionnaire est donc un
// objet posé sur `window`, et ce fichier ne fait qu'y puiser. Rien ici n'exige
// d'empaqueteur, de transpileur ni de module ES.
//
// ── §37.2 — une clé manquante rend LA CLÉ ──────────────────────────────────
//
// C'est la règle qui décide de la forme du lot, et elle a une raison
// opérationnelle : un écran anglais à moitié français **a l'air fini**. Personne
// ne le signale, et le défaut part en production. `risques.titre` affiché en
// clair au milieu d'un tableau, lui, ne s'ignore pas.
//
// ⚠️ **Le repli ne descend JAMAIS vers le français.** C'est la tentation
// naturelle (« au moins l'utilisateur lit quelque chose »), et c'est exactement
// ce que le §37.2 interdit. Le contrôle mécanique qui l'accompagne vit dans
// `backend/test/depot/traductions.test.mjs`.
//
// ── L'INTERPOLATION, ET LE POINT D'INJECTION QUE CE LOT INTRODUIT ──────────
//
// Une chaîne traduite qui porte une valeur (« {n} risques », « Pour traiter le
// risque : {nom} ») est un point d'injection NEUF : jusqu'ici, une donnée
// utilisateur injectée en `innerHTML` passait visiblement par `escapeHtml`, et
// l'œil du relecteur le voyait. Enveloppée dans un appel de traduction, elle ne
// se voit plus.
//
// Deux fonctions, et la différence est dans le NOM, pas dans un commentaire :
//
//   | Fonction   | Ce qu'elle rend         | Où elle s'emploie                        |
//   |------------|-------------------------|------------------------------------------|
//   | `t(k, p)`  | texte brut, valeurs telles quelles | `textContent`, `confirm()`, `alert()`, `setAttribute` |
//   | `tHtml(k,p)` | texte dont **chaque valeur est échappée** | un gabarit `${…}` injecté en `innerHTML` |
//
// Et la règle est **mécaniquement vérifiée**, pas seulement écrite :
// `traductions.test.mjs` refuse tout `${ t("…", …) }` — un appel à `t` AVEC
// valeurs à l'intérieur d'une interpolation de gabarit — et exige `tHtml`. Il
// refuse aussi qu'une valeur de dictionnaire porte `<` ou `>` : la moitié
// statique de la chaîne est donc inerte en HTML, et la moitié dynamique est
// échappée. Les deux moitiés sont couvertes, et par une mesure.
//
// ── §37.6 — dates et nombres ───────────────────────────────────────────────
//
// `Intl` sert à AFFICHER. Ce qui est **stocké** et ce qui est **transmis**
// restent en ISO (`AAAA-MM-JJ`) : formater à l'écriture serait un changement de
// schéma qui ne dit pas son nom, et un « 01/02 » qui vaut février à Paris et
// janvier à New York est le genre de défaut qu'un audit ne pardonne pas.

window.I18n = (function () {
    "use strict";

    /* =====================================================================
       LES LANGUES DU PRODUIT
       FR et EN sont obligatoires (cadrage) ; ES est souhaitable et n'est pas
       de ce lot. Le libellé d'une langue est écrit DANS SA PROPRE LANGUE :
       un anglophone perdu dans une interface française cherche « English »,
       pas « Anglais ».
    ===================================================================== */
    var LANGUES = [
        { code: "fr", libelle: "Français", locale: "fr-FR" },
        { code: "en", libelle: "English", locale: "en-GB" }
    ];

    var LANGUE_PAR_DEFAUT = "fr";

    /**
     * §37.4 — la préférence de langue va dans `localStorage`, sous cette clé.
     *
     * ⚠️ **Cela ne contredit pas la purge du lot L2**, et il faut le dire ici
     * plutôt que le laisser découvrir. Ce qui a été retiré du poste, ce sont
     * **les données** : le coffre, le miroir en clair, les points de
     * restauration. Une langue d'affichage n'est pas une donnée du produit —
     * elle ne vaut que pour ce poste, elle ne se synchronise pas, elle ne
     * décide d'aucun droit, et sa perte ne coûte rien. `js/core/session.js`
     * purge une liste **nommée** de clés obsolètes ; `cyber-langue` n'en fait
     * pas partie, et c'est délibéré.
     */
    var CLE_STOCKAGE = "cyber-langue";

    /** Dictionnaires, par code de langue. Peuplés par `fr.js` et `en.js`. */
    var dictionnaires = {};

    /** Langue courante. `null` tant que `resoudre()` n'a pas été appelé. */
    var courante = null;

    /** Abonnés au changement de langue (barre latérale, écran courant…). */
    var abonnes = [];

    /* =====================================================================
       ÉCHAPPEMENT — repli défensif, comme `js/core/ui.js`
       `window.escapeHtml` vient de `js/core/help.js`. L'appel est fait au
       rendu, donc bien après le chargement des deux fichiers ; le repli
       couvre le cas d'un fichier chargé seul (essai unitaire, page nue).
    ===================================================================== */
    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur);
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    /* =====================================================================
       ENREGISTREMENT D'UN DICTIONNAIRE
       Appelé par `fr.js` et `en.js`. Un dictionnaire est un objet plat
       `{ "domaine.cle": "texte" }` — plat et non imbriqué, parce que c'est
       cette forme-là qu'un contrôle mécanique sait confronter à ce que les
       modules emploient réellement, et qu'une personne qui ne connaît pas le
       code sait relire d'un bout à l'autre.
    ===================================================================== */
    function enregistrer(code, table) {
        dictionnaires[code] = table || {};
    }

    function langues() { return LANGUES.slice(); }

    function connue(code) {
        return LANGUES.some(function (l) { return l.code === code; });
    }

    function meta(code) {
        for (var i = 0; i < LANGUES.length; i++) {
            if (LANGUES[i].code === code) return LANGUES[i];
        }
        return LANGUES[0];
    }

    /* =====================================================================
       RÉSOLUTION DE LA LANGUE — §37.4

       Trois sources, dans cet ordre, et l'ordre est le contrat :

         1. la **préférence de l'utilisateur** (`localStorage`), parce qu'un
            choix explicite prime toujours sur une valeur par défaut ;
         2. `filiales.langue_defaut`, tel que la session le porte — la filiale
            allemande ouvre en anglais sans que personne ait rien à cliquer ;
         3. `fr`.

       ⚠️ **Ce que le serveur n'envoie pas encore.** `filiales.langue_defaut`
       existe en base (`001_socle.sql`) mais ne figure PAS dans le bloc
       `filiale_active` que rend `GET /api/session` — vérifié le 05/09/2026
       dans `backend/src/api/index.ts`. La lecture ci-dessous est donc
       **défensive et sans effet aujourd'hui** : elle prend la valeur si elle
       arrive, et retombe sur `fr` sinon. Le jour où le serveur la joint, rien
       n'est à changer ici. Écrit plutôt que tu : une source silencieusement
       morte est une source qu'on croit vivante.
    ===================================================================== */

    /** La préférence enregistrée sur ce poste, ou `null`. */
    function preferenceEnregistree() {
        try {
            var v = localStorage.getItem(CLE_STOCKAGE);
            return connue(v) ? v : null;
        } catch (e) {
            // Stockage indisponible (navigation privée verrouillée, iframe
            // cloisonnée) : ce n'est pas une panne du produit, seulement une
            // préférence qui ne survivra pas au rechargement.
            return null;
        }
    }

    /** La langue par défaut de la filiale résolue par le serveur, ou `null`. */
    function langueDeLaFiliale() {
        try {
            if (typeof Session === "undefined" || !Session.courante) return null;
            var s = Session.courante();
            if (!s) return null;
            return connue(s.filialeLangue) ? s.filialeLangue : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Fixe la langue courante d'après les trois sources. Appelée au démarrage,
     * et de nouveau après un changement de filiale (le périmètre a changé,
     * donc peut-être la langue par défaut) — sans jamais écraser un choix
     * explicite de l'utilisateur.
     */
    function resoudre() {
        var choisie = preferenceEnregistree() || langueDeLaFiliale() || LANGUE_PAR_DEFAUT;
        appliquer(choisie, false);
        return courante;
    }

    /** Langue courante, résolue à la demande si le démarrage ne l'a pas fait. */
    function langue() {
        if (courante === null) resoudre();
        return courante;
    }

    /** La locale `Intl` de la langue courante (`fr-FR`, `en-GB`). */
    function locale() { return meta(langue()).locale; }

    /**
     * Change la langue **et l'enregistre** : c'est le geste de l'utilisateur.
     * `resoudre()`, lui, n'enregistre rien — il ne fait que constater.
     */
    function definir(code) {
        if (!connue(code)) return langue();
        try { localStorage.setItem(CLE_STOCKAGE, code); } catch (e) { /* cf. plus haut */ }
        appliquer(code, true);
        return courante;
    }

    function appliquer(code, notifier) {
        var avant = courante;
        courante = connue(code) ? code : LANGUE_PAR_DEFAUT;
        // L'attribut `lang` du document : ce n'est pas cosmétique. Les lecteurs
        // d'écran changent de voix avec lui, et la césure typographique du
        // navigateur en dépend.
        try { document.documentElement.setAttribute("lang", courante); } catch (e) { /* hors DOM */ }
        if (notifier && avant !== courante) {
            abonnes.forEach(function (fn) {
                try { fn(courante); } catch (e) { console.warn("I18n : un abonné a échoué.", e); }
            });
        }
    }

    /** S'abonner au changement de langue. Rend une fonction de désabonnement. */
    function abonner(fn) {
        if (typeof fn !== "function") return function () {};
        abonnes.push(fn);
        return function () {
            var i = abonnes.indexOf(fn);
            if (i !== -1) abonnes.splice(i, 1);
        };
    }

    /* =====================================================================
       LA TRADUCTION

       `t(cle)` cherche la clé dans le dictionnaire de la langue courante.
       Absente ⇒ **la clé elle-même**, et un avertissement de console.

       ⚠️ Pourquoi `console.warn` et non `console.error` : le banc compte les
       erreurs de console et exige zéro (`CLAUDE.md` §5). Une clé manquante
       doit crier À L'ÉCRAN — c'est là qu'elle sera vue — sans transformer
       chaque essai en rouge ambigu où l'on ne distingue plus une traduction
       oubliée d'une requête refusée.
    ===================================================================== */

    /** Clés déjà signalées : on crie une fois par clé, pas à chaque rendu. */
    var deja = {};

    function brut(cle) {
        var table = dictionnaires[langue()];
        if (table && Object.prototype.hasOwnProperty.call(table, cle)) return table[cle];
        var signature = langue() + "|" + cle;
        if (!deja[signature]) {
            deja[signature] = true;
            console.warn("I18n : clé absente du dictionnaire « " + langue() + " » : " + cle);
        }
        // §37.2 — la CLÉ, jamais le texte d'une autre langue.
        return cle;
    }

    /**
     * Substitue les valeurs dans `{nom}`.
     *
     * `transformer` est appliqué à chaque valeur : identité pour `t`,
     * échappement HTML pour `tHtml`. Une valeur absente laisse le motif en
     * place — `{nom}` visible vaut mieux qu'un trou dans une phrase.
     */
    function remplir(modele, valeurs, transformer) {
        if (!valeurs) return modele;
        return String(modele).replace(/\{([a-zA-Z0-9_]+)\}/g, function (motif, nom) {
            if (!Object.prototype.hasOwnProperty.call(valeurs, nom)) return motif;
            var v = valeurs[nom];
            return transformer(v == null ? "" : String(v));
        });
    }

    function identite(v) { return v; }

    /** Texte brut. Valeurs substituées TELLES QUELLES — contexte texte seul. */
    function t(cle, valeurs) {
        return remplir(brut(cle), valeurs, identite);
    }

    /** Texte dont chaque valeur substituée est ÉCHAPPÉE — contexte `innerHTML`. */
    function tHtml(cle, valeurs) {
        return remplir(brut(cle), valeurs, esc);
    }

    /* =====================================================================
       §37.3 — LES VALEURS STOCKÉES NE SE TRADUISENT PAS À L'ÉCRITURE

       `conforme`, `à faire`, `élevé` sont **stockées en base** et contraintes
       par des `check`. Les traduire à l'écriture casserait le schéma. Elles se
       traduisent donc **à l'affichage seulement**, à partir de la valeur
       stockée — qui, elle, ne bouge jamais.

       La table de correspondance est un dictionnaire comme un autre, sous le
       préfixe `valeur.` : c'est ce qui permet au contrôle mécanique de la voir.
       Une seule fonction couvre statuts, gravités, priorités et types d'incident
       — ce sont tous des VALEURS STOCKÉES, et leur donner deux mécanismes ferait
       deux endroits où en oublier un.

       ⚠️ Une valeur inconnue est rendue **telle quelle**, sans avertissement.
       Ce n'est pas une clé oubliée : le produit accepte des statuts libres à
       plusieurs endroits (héritage des imports), et crier sur une donnée
       utilisateur ferait du bruit que personne ne peut corriger.
    ===================================================================== */
    function valeur(brute) {
        var v = String(brute == null ? "" : brute);
        if (v === "") return "";
        var cle = "valeur." + v;
        var table = dictionnaires[langue()];
        if (table && Object.prototype.hasOwnProperty.call(table, cle)) return table[cle];
        return v;
    }

    /* =====================================================================
       §37.6 — DATES ET NOMBRES

       ⚠️ Ces fonctions FORMATENT POUR L'ŒIL. Rien de ce qu'elles rendent ne
       doit repartir vers le serveur ni être écrit dans un enregistrement :
       une date stockée reste `AAAA-MM-JJ`, et c'est ce que
       `backend/test/navigateur/i18n.test.mjs` mesure — il change la langue,
       constate que l'affichage change, saisit une date, et vérifie que ce qui
       part sur le réseau est resté ISO.
    ===================================================================== */

    /**
     * Une date ISO (`AAAA-MM-JJ`, éventuellement horodatée) affichée dans la
     * langue courante. Rend `""` sur une valeur vide, et la valeur telle quelle
     * si elle n'est pas une date — afficher « Invalid Date » serait pire.
     */
    function date(iso, options) {
        if (iso == null || iso === "") return "";
        if (iso instanceof Date && isNaN(iso.getTime())) return "";
        var d = versDate(iso);
        if (d === null) return String(iso);
        try {
            return new Intl.DateTimeFormat(locale(), options || {
                year: "numeric", month: "2-digit", day: "2-digit"
            }).format(d);
        } catch (e) {
            return String(iso);
        }
    }

    /** Une date longue (« 5 septembre 2026 » / « 5 September 2026 »). */
    function dateLongue(iso) {
        return date(iso, { year: "numeric", month: "long", day: "numeric" });
    }

    /** Un horodatage complet (journal d'audit, historique). */
    function dateHeure(iso) {
        return date(iso, {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
    }

    /**
     * Analyse d'une valeur de date, sans jamais inventer un fuseau.
     *
     * ⚠️ `new Date("2026-09-05")` est interprété en **UTC** par la spécification,
     * et affiché dans le fuseau du poste : à Los Angeles, cela donne le 4. On
     * construit donc la date **en heure locale** à partir des trois nombres,
     * ce qui est la seule façon d'afficher le jour que l'utilisateur a saisi.
     */
    function versDate(valeur) {
        // Un `Date` déjà construit passe tel quel : le convertir en chaîne puis
        // la réanalyser marche par accident (la forme rendue par `toString`
        // dépend de l'implémentation), et c'est le genre de détour qui casse un
        // jour sans qu'on sache pourquoi.
        if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;
        var s = String(valeur);
        var jour = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (jour) {
            return new Date(Number(jour[1]), Number(jour[2]) - 1, Number(jour[3]));
        }
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    /** Un nombre dans la langue courante (séparateurs, décimales). */
    function nombre(valeur, options) {
        var n = Number(valeur);
        if (!isFinite(n)) return String(valeur == null ? "" : valeur);
        try {
            return new Intl.NumberFormat(locale(), options || {}).format(n);
        } catch (e) {
            return String(n);
        }
    }

    /** Un pourcentage déjà exprimé en points (42 → « 42 % » / « 42% »). */
    function pourcentage(valeur, decimales) {
        var n = Number(valeur);
        if (!isFinite(n)) return String(valeur == null ? "" : valeur);
        return nombre(n / 100, {
            style: "percent",
            minimumFractionDigits: decimales || 0,
            maximumFractionDigits: decimales || 0
        });
    }

    /* =====================================================================
       LE BALISAGE STATIQUE — `index.html`

       La barre latérale est du HTML écrit à la main : trente-trois entrées de
       menu, trois séparateurs, un bouton de menu mobile. Le convertir en
       gabarits JavaScript pour le traduire serait une réécriture de l'écran le
       plus stable du produit, et le banc **découvre** ses entrées en lisant
       `.main-nav a[data-route]` (`js/app.js`, `verifierCouvertureDesRoutes`).

       On annote donc, et l'on remplace **le texte, jamais le balisage** :

         <span data-i18n="nav.dashboard">Tableau de bord</span>
         <button data-i18n-title="nav.menu" data-i18n-aria-label="nav.ouvrirMenu">

       ⚠️ **`textContent`, jamais `innerHTML`** : une valeur de dictionnaire ne
       peut donc rien injecter, quelle qu'elle soit. C'est la raison pour
       laquelle cette fonction ne sait pas poser d'icône ni de balise — et c'est
       une propriété, pas une limite qu'on regrette.

       ⚠️ Le texte français reste **écrit dans le HTML**. Il ne sert jamais de
       repli — `t()` rend la clé si elle manque, et l'écrase — mais il garde la
       page lisible avant que le premier script ait tourné, et il documente
       l'entrée pour qui lit la source.
    ===================================================================== */
    function appliquerAuDocument(racine) {
        var hote = racine || document;
        if (!hote || !hote.querySelectorAll) return;
        hote.querySelectorAll("[data-i18n]").forEach(function (el) {
            el.textContent = t(el.getAttribute("data-i18n"));
        });
        hote.querySelectorAll("[data-i18n-title]").forEach(function (el) {
            el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
        });
        hote.querySelectorAll("[data-i18n-aria-label]").forEach(function (el) {
            el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
        });
        hote.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
            el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
        });
    }

    /* =====================================================================
       INTROSPECTION — ce dont le contrôle mécanique a besoin
       `backend/test/depot/traductions.test.mjs` lit les dictionnaires DEPUIS
       LES FICHIERS, pas d'ici : un essai qui interrogerait l'objet vivant ne
       verrait pas un fichier oublié. Ces deux fonctions servent au banc
       comportemental (navigateur), qui, lui, a l'objet sous la main.
    ===================================================================== */
    function cles(code) {
        var table = dictionnaires[code || langue()];
        return table ? Object.keys(table) : [];
    }

    /** Vrai si la clé existe dans la langue donnée. Sert au banc, et à rien d'autre. */
    function existe(cle, code) {
        var table = dictionnaires[code || langue()];
        return !!(table && Object.prototype.hasOwnProperty.call(table, cle));
    }

    return {
        LANGUE_PAR_DEFAUT: LANGUE_PAR_DEFAUT,
        CLE_STOCKAGE: CLE_STOCKAGE,
        enregistrer: enregistrer,
        langues: langues, langue: langue, locale: locale, definir: definir,
        resoudre: resoudre, abonner: abonner, connue: connue, meta: meta,
        t: t, tHtml: tHtml, valeur: valeur, appliquerAuDocument: appliquerAuDocument,
        date: date, dateLongue: dateLongue, dateHeure: dateHeure,
        nombre: nombre, pourcentage: pourcentage,
        cles: cles, existe: existe
    };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 *  ALIAS DE GABARIT
 *
 *  Les modules écrivent `${t("risques.titre")}` et `${tHtml("risques.pourTraiter",
 *  { nom: risque.nom })}`. Deux noms courts, parce qu'ils apparaissent des
 *  centaines de fois — et deux noms DIFFÉRENTS, parce que la différence entre
 *  eux est une propriété de sécurité, pas une préférence d'écriture.
 * ═══════════════════════════════════════════════════════════════════════════ */
window.t = function (cle, valeurs) { return window.I18n.t(cle, valeurs); };
window.tHtml = function (cle, valeurs) { return window.I18n.tHtml(cle, valeurs); };
