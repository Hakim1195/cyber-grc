// Emplacement : js/core/reglages.js
// Nom du fichier : reglages.js
//
// LES RÉGLAGES — le catalogue du Groupe, et ce que cette filiale en a fait.
//
// ── Ce que ce module est, et ce qu'il n'est pas ─────────────────────────────
//
// Une lecture, chargée une fois au démarrage, que les modules consultent
// **synchroniquement**. C'est la même discipline que `DataStore` : l'asynchrone
// est absorbé au démarrage, et aucun module métier n'a à savoir qu'un réglage
// vient du réseau.
//
// ⚠️ **Ce n'est pas un magasin.** Les clés sont un ensemble FERMÉ, déclaré par
// une migration : un réglage que le produit ne lit pas est un réglage qui ment —
// l'exploitant le modifie, croit avoir agi, et rien ne change (constat Q-91).
// `test/depot/reglages-catalogue-lus.test.mjs` refuse qu'une clé entre au
// catalogue sans qu'un fichier d'ici la lise.
//
// ── ⚠️ CE QUI SE PASSE SI LE CHARGEMENT ÉCHOUE, ET POURQUOI C'EST TENABLE ───
//
// `charger()` ne rejette jamais : un réglage indisponible ne doit pas empêcher
// l'application de démarrer. Les lecteurs retombent alors sur la valeur passée
// en second argument — qui est, par construction, **celle du catalogue du
// Groupe**. L'utilisateur voit donc le comportement par défaut du groupe, pas
// un comportement inventé, et la seule chose qu'il perd est la surcharge de sa
// filiale. C'est une dégradation qui se raconte ; en faire un écran d'erreur
// bloquerait le produit pour un seuil d'affichage.

const Reglages = (() => {
    "use strict";

    /** Ce que le serveur a rendu, par clé. Vide tant que `charger()` n'a pas abouti. */
    let parCle = Object.create(null);
    let charge = false;

    /**
     * Charge les réglages effectifs du périmètre. Ne rejette jamais.
     *
     * ⚠️ Appelée au démarrage, AVANT le premier rendu : un module qui lirait un
     * réglage avant ce chargement obtiendrait la valeur par défaut, et l'écran
     * changerait sous les yeux de l'utilisateur au rafraîchissement suivant.
     */
    async function charger() {
        if (!window.Api || typeof Api.reglages !== "function") return false;
        try {
            const reponse = await Api.reglages();
            const suivant = Object.create(null);
            (reponse && reponse.reglages ? reponse.reglages : []).forEach(r => {
                if (r && typeof r.cle === "string") suivant[r.cle] = r;
            });
            parCle = suivant;
            charge = true;
            return true;
        } catch (e) {
            // Voir l'en-tête : on ne bloque pas le démarrage pour un seuil.
            return false;
        }
    }

    /** Tous les réglages, tels que l'écran des Paramètres les affiche. */
    function tous() {
        return Object.keys(parCle).map(cle => parCle[cle]);
    }

    /**
     * Un réglage entier, ou la valeur par défaut.
     *
     * ⚠️ Le second argument n'est pas un ornement : c'est la valeur du catalogue
     * du Groupe, recopiée là où elle est lue. Le contrôle du dépôt confronte les
     * deux — une divergence ferait qu'un produit hors ligne se comporte
     * autrement qu'un produit connecté, sans le dire.
     */
    function entier(cle, defaut) {
        const r = parCle[cle];
        if (!r) return defaut;
        const n = Number.parseInt(String(r.valeur), 10);
        return Number.isFinite(n) && n >= 0 ? n : defaut;
    }

    /** `true` si le chargement a abouti — l'écran des Paramètres le dit. */
    function estCharge() { return charge; }

    return { charger, tous, entier, estCharge };
})();

window.Reglages = Reglages;
