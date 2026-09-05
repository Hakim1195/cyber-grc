// Emplacement : js/data/referentiels.js
// Nom du fichier : referentiels.js
//
// Registre des RÉFÉRENTIELS de sécurité (catalogue STATIQUE, non stocké dans la
// base utilisateur). Chaque référentiel est un fichier de données au schéma commun
// qui s'auto-enregistre ici (voir ref_anssi.js). Les auto-évaluations de l'utilisateur
// vivent, elles, dans DataStore (`evaluations`, clé ref_id + code).
//
// Schéma d'un référentiel :
//   {
//     id, nom, editeur, version, description, aide,
//     domaines: [ { id, nom, court, aide?, exigences: [ { code, titre, aide } ] } ]
//   }
// NB : on n'embarque JAMAIS le texte intégral des normes (reformulations originales
// courtes + identifiant de clause + titre court uniquement).

const Referentiels = (() => {
    const registry = {};
    const order = [];

    function register(ref) {
        if (!ref || !ref.id) return;
        if (!registry[ref.id]) order.push(ref.id);
        registry[ref.id] = ref;
    }

    /* =====================================================================
       TRADUCTIONS DES CATALOGUES — lot L11
       =====================================================================

       ⚠️ LE REPLI N'EST PAS CELUI DE L'INTERFACE, ET C'EST DÉLIBÉRÉ.

       Pour l'interface (`js/i18n/`), une clé manquante rend LA CLÉ elle-même :
       un écran anglais à moitié français aurait l'air fini, et le défaut
       passerait en production. C'est le §37.2, et il a raison — pour un LIBELLÉ.

       Ici, la même règle rendrait le produit INUTILISABLE. Une exigence de
       référentiel dont le titre s'afficherait « iso-27002-2022/5.1.titre » ne
       serait plus une exigence : le RSSI ne pourrait ni la lire, ni l'évaluer,
       ni la produire en audit. Une exigence non traduite, elle, reste
       parfaitement utilisable — dégradée, pas perdue.

       Le repli est donc le FRANÇAIS, chaîne par chaîne. Ce qui rend ce choix
       tenable, et sans quoi il deviendrait une excuse : la couverture est
       MESURÉE (`couverture()`), et ce que le produit ne sait pas dire en anglais
       se compte au lieu de se deviner.

       ── La forme d'une traduction, et pourquoi elle est plate ──────────────

       Les exigences sont indexées « <domaineId>/<code> » et non par leur seul
       code : rien n'interdit à deux domaines de porter le même code, et une
       traduction mal alignée mettrait le texte d'une exigence sous une autre —
       un défaut qui se lit parfaitement et qui est entièrement faux.
    */
    const traductions = {};

    function registerTraduction(refId, langue, dictionnaire) {
        if (!refId || !langue || !dictionnaire) return;
        if (!traductions[refId]) traductions[refId] = {};
        traductions[refId][langue] = dictionnaire;
    }

    /** Langue active, lue au moment de l'appel — jamais figée au chargement. */
    function langueActive() {
        if (typeof window !== "undefined" && window.I18n && typeof window.I18n.langue === "function") {
            return window.I18n.langue();
        }
        return "fr";
    }

    /** Applique une traduction à un référentiel, chaîne par chaîne. */
    function traduire(ref, dico) {
        if (!ref || !dico) return ref;
        const pris = (traduit, origine) => (typeof traduit === "string" && traduit !== "" ? traduit : origine);
        const domaines = (ref.domaines || []).map(d => {
            const td = (dico.domaines && dico.domaines[d.id]) || {};
            return Object.assign({}, d, {
                nom: pris(td.nom, d.nom),
                court: pris(td.court, d.court),
                aide: pris(td.aide, d.aide),
                exigences: (d.exigences || []).map(e => {
                    const te = (dico.exigences && dico.exigences[d.id + "/" + e.code]) || {};
                    return Object.assign({}, e, {
                        titre: pris(te.titre, e.titre),
                        aide: pris(te.aide, e.aide)
                    });
                })
            });
        });
        return Object.assign({}, ref, {
            nom: pris(dico.nom, ref.nom),
            // `version` est de la PROSE — « 42 mesures », « 5 piliers »,
            // « Chap. 4-10 · SMSI » —, et elle s'affiche sur la fiche du
            // référentiel. Elle était traduisible nulle part : quatre chaînes
            // restaient en français sur l'écran anglais, ET l'instrument de
            // mesure ne les voyait pas. C'est exactement la forme de défaut que
            // ce lot existe pour empêcher, et c'est mon mécanisme qui la portait.
            version: pris(dico.version, ref.version),
            // `editeur` est traduisible mais N'ENTRE PAS dans la couverture, et
            // la distinction n'est pas un détail : « ANSSI », « ISO/IEC »,
            // « BoostAerospace » sont des NOMS PROPRES qui se lisent à
            // l'identique dans toutes les langues. Les compter ferait réclamer
            // par l'instrument une traduction qui ne doit pas exister — et un
            // instrument qui réclame du faux finit par être ignoré.
            editeur: pris(dico.editeur, ref.editeur),
            description: pris(dico.description, ref.description),
            aide: pris(dico.aide, ref.aide),
            domaines: domaines
        });
    }

    /**
     * Couverture de traduction d'une langue, référentiel par référentiel.
     *
     * ⚠️ Elle compte les chaînes RÉELLEMENT traduites, pas les clés déclarées :
     * une entrée présente mais vide ne compte pas. Sans quoi un dictionnaire
     * squelette annoncerait 100 %.
     */
    function couverture(langue) {
        const cible = langue || langueActive();
        return order.map(id => {
            const ref = registry[id];
            const dico = (traductions[id] && traductions[id][cible]) || null;
            // nom, version, description, aide. `editeur` en est exclu : un nom
            // propre se lit à l'identique partout, et le compter ferait réclamer
            // une traduction qui ne doit pas exister.
            let total = 4;
            let faits = 0;
            const compte = (traduit) => { if (typeof traduit === "string" && traduit !== "") faits += 1; };
            if (dico) { compte(dico.nom); compte(dico.version); compte(dico.description); compte(dico.aide); }
            (ref.domaines || []).forEach(d => {
                total += 3;
                const td = (dico && dico.domaines && dico.domaines[d.id]) || null;
                if (td) { compte(td.nom); compte(td.court); compte(td.aide); }
                (d.exigences || []).forEach(e => {
                    total += 2;
                    const te = (dico && dico.exigences && dico.exigences[d.id + "/" + e.code]) || null;
                    if (te) { compte(te.titre); compte(te.aide); }
                });
            });
            return { id: id, nom: ref.nom, total: total, traduits: faits };
        });
    }

    function get(id) {
        const ref = registry[id] || null;
        if (!ref) return null;
        const langue = langueActive();
        if (langue === "fr") return ref;
        const dico = traductions[id] && traductions[id][langue];
        return dico ? traduire(ref, dico) : ref;
    }

    function all() { return order.map(id => get(id)); }

    // Nombre total d'exigences (toutes familles confondues) d'un référentiel.
    function countExigences(ref) {
        if (!ref || !Array.isArray(ref.domaines)) return 0;
        return ref.domaines.reduce((n, d) => n + (d.exigences ? d.exigences.length : 0), 0);
    }

    // Liste à plat des exigences enrichies du contexte de domaine :
    // { domaineId, domaineNom, domaineCourt, code, titre, aide }
    function flatExigences(ref) {
        if (!ref || !Array.isArray(ref.domaines)) return [];
        const out = [];
        ref.domaines.forEach(d => {
            (d.exigences || []).forEach(e => {
                out.push({
                    domaineId: d.id, domaineNom: d.nom, domaineCourt: d.court || d.nom,
                    code: e.code, titre: e.titre, aide: e.aide
                });
            });
        });
        return out;
    }

    // Retrouve une exigence par (ref, code).
    function findExigence(ref, code) {
        return flatExigences(ref).find(e => e.code === code) || null;
    }

    return { register, registerTraduction, couverture, get, all, countExigences, flatExigences, findExigence };
})();
