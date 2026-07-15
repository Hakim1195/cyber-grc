// Emplacement : js/data/audit_modeles.js
// Nom du fichier : audit_modeles.js
//
// Registre des MODÈLES D'AUDIT (catalogue STATIQUE, non stocké dans la base
// utilisateur). Un modèle d'audit fournit, pour un référentiel donné, une grille
// de POINTS DE CONTRÔLE détaillés (ce que l'auditeur doit vérifier + les preuves
// à demander), rattachés aux exigences du référentiel par leur `code`.
//
// Objectif : générer un audit prêt à l'emploi, fidèle et le plus exhaustif possible,
// à partir des référentiels déjà présents (registre `Referentiels`). Chaque fichier
// de contenu (audit_anssi.js, …) s'auto-enregistre ici, comme les référentiels.
//
// Schéma d'un modèle :
//   AuditModeles.register("<ref_id>", {
//       "<code d'exigence>": [
//           { ctrl: "point de contrôle / vérification à mener", preuve: "preuves à demander" },
//           ...
//       ],
//       ...
//   });
//
// NB : reformulations maison — on n'embarque JAMAIS le texte intégral des normes.
// Le lien vers l'intitulé et le domaine de l'exigence est reconstitué à la volée
// depuis le registre `Referentiels` (zéro double saisie des titres).

const AuditModeles = (() => {
    const catalog = {};        // ref_id -> { code -> [ { ctrl, preuve }, ... ] }
    const order = [];
    // Modèles COMPOSITES : un modèle « virtuel » qui concatène plusieurs modèles
    // sources (ex. « ISO 27001 complet » = système de management + Annexe A). Permet
    // d'auditer en une seule grille des exigences réparties sur plusieurs référentiels.
    const composites = {};     // modelId -> { nom, sources: [refId...] }
    const compositeOrder = [];
    // Modèles DÉRIVÉS : pour les questionnaires déjà détaillés (ex. AirCyber, 234
    // questions), on n'écrit pas de points à la main — chaque exigence du référentiel
    // devient un point de contrôle (la question = ce qu'il faut vérifier + invite de preuve).
    const derived = {};        // refId -> { ctrl?(exigence)->string, preuve? }

    function register(refId, points) {
        if (!refId || !points || typeof points !== "object") return;
        if (!catalog[refId] && !derived[refId]) order.push(refId);
        // Fusion : permet de répartir le contenu d'un même référentiel sur plusieurs fichiers.
        catalog[refId] = Object.assign(catalog[refId] || {}, points);
    }

    // Enregistre un modèle composite. `def` = { nom, sources: [refId...] }.
    function registerComposite(modelId, def) {
        if (!modelId || !def || !Array.isArray(def.sources)) return;
        if (!composites[modelId]) compositeOrder.push(modelId);
        composites[modelId] = { nom: def.nom || modelId, sources: def.sources.slice() };
    }

    // Enregistre un modèle DÉRIVÉ des exigences du référentiel (un point par exigence).
    // `opts` = { ctrl?(exigence)->string, preuve? }.
    function registerDerived(refId, opts) {
        if (!refId) return;
        if (!catalog[refId] && !derived[refId]) order.push(refId);
        derived[refId] = opts || {};
    }

    function get(refId) { return catalog[refId] || null; }
    function has(refId) { return !!catalog[refId] || !!composites[refId] || !!derived[refId]; }
    function isComposite(id) { return !!composites[id]; }
    function all() { return order.slice(); }

    // Nom lisible d'un modèle : composite, sinon référentiel, sinon l'id brut.
    function nameOf(id) {
        if (composites[id]) return composites[id].nom;
        const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(id) : null;
        return ref ? ref.nom : id;
    }

    // Nombre total de points de contrôle d'un modèle (résout composites et dérivés).
    function countPoints(refId) {
        if (composites[refId]) {
            return composites[refId].sources.reduce((n, s) => n + countPoints(s), 0);
        }
        if (derived[refId]) {
            const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(refId) : null;
            return ref ? Referentiels.countExigences(ref) : 0;
        }
        const p = catalog[refId];
        if (!p) return 0;
        return Object.keys(p).reduce((n, code) => n + (Array.isArray(p[code]) ? p[code].length : 0), 0);
    }

    // Construit la grille d'audit à plat pour un référentiel : croise les points de
    // contrôle du modèle avec le contexte (domaine + intitulé + aide) tiré du
    // référentiel. Chaque élément :
    //   { code, domaine, intitule, aide, ctrl, preuve, type:"", constat:"" }
    // (`type` et `constat` vides = à renseigner par l'auditeur).
    function buildGrid(refId) {
        // Composite : concatène les grilles des modèles sources disponibles.
        if (composites[refId]) {
            let grid = [];
            composites[refId].sources.forEach(src => { grid = grid.concat(buildGrid(src)); });
            return grid;
        }
        // Dérivé : un point de contrôle par exigence du référentiel (questionnaire déjà détaillé).
        if (derived[refId]) {
            const d = derived[refId];
            const refD = (typeof Referentiels !== "undefined") ? Referentiels.get(refId) : null;
            const flatD = refD ? Referentiels.flatExigences(refD) : [];
            const defaultPreuve = "Documentation, configuration ou enregistrement démontrant la mise en œuvre, cohérent avec la réponse déclarée au questionnaire.";
            return flatD.map(e => ({
                code: e.code,
                domaine: e.domaineNom || "",
                intitule: e.titre || "",
                aide: e.aide || "",
                ctrl: (typeof d.ctrl === "function") ? d.ctrl(e) : ("Vérifier que l'exigence est satisfaite et étayée par des preuves : « " + (e.titre || "") + " »."),
                preuve: d.preuve || defaultPreuve,
                type: "", constat: ""
            }));
        }
        const points = catalog[refId];
        if (!points) return [];
        const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(refId) : null;
        const flat = ref ? Referentiels.flatExigences(ref) : [];
        const byCode = {};
        flat.forEach(e => { byCode[e.code] = e; });

        // On suit l'ordre des exigences du référentiel quand il est disponible
        // (grille lisible, groupée par domaine), sinon l'ordre des codes du modèle.
        const codes = flat.length
            ? flat.map(e => e.code).filter(c => Array.isArray(points[c]) && points[c].length)
            : Object.keys(points);

        const grid = [];
        codes.forEach(code => {
            const ctx = byCode[code] || {};
            (points[code] || []).forEach(pt => {
                // Un point peut porter son propre sous-code / intitulé (décomposition
                // fine d'une clause en sous-exigences, ex. « 4.1a »). À défaut, il hérite
                // du code, du domaine et de l'intitulé de l'exigence du référentiel.
                grid.push({
                    code: pt.code || code,
                    domaine: pt.domaine || ctx.domaineNom || "",
                    intitule: pt.intitule || ctx.titre || "",
                    aide: pt.aide || ctx.aide || "",
                    ctrl: pt.ctrl || "",
                    preuve: pt.preuve || "",
                    type: "",
                    constat: ""
                });
            });
        });
        return grid;
    }

    // Liste des modèles d'audit disponibles (pour alimenter un menu) :
    // [ { id, nom, points, composite? } ] — modèles simples puis composites.
    function available() {
        const simple = order.map(refId => ({ id: refId, nom: nameOf(refId), points: countPoints(refId) }));
        const comp = compositeOrder
            .filter(id => composites[id].sources.some(s => catalog[s]))   // au moins une source dispo
            .map(id => ({ id, nom: nameOf(id), points: countPoints(id), composite: true }));
        return simple.concat(comp);
    }

    return { register, registerComposite, registerDerived, get, has, isComposite, all, nameOf, countPoints, buildGrid, available };
})();
