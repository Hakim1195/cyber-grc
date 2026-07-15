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
    const catalog = {};   // ref_id -> { code -> [ { ctrl, preuve }, ... ] }
    const order = [];

    function register(refId, points) {
        if (!refId || !points || typeof points !== "object") return;
        if (!catalog[refId]) order.push(refId);
        // Fusion : permet de répartir le contenu d'un même référentiel sur plusieurs fichiers.
        catalog[refId] = Object.assign(catalog[refId] || {}, points);
    }

    function get(refId) { return catalog[refId] || null; }
    function has(refId) { return !!catalog[refId]; }
    function all() { return order.slice(); }

    // Nombre total de points de contrôle d'un modèle.
    function countPoints(refId) {
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
                grid.push({
                    code: code,
                    domaine: ctx.domaineNom || "",
                    intitule: ctx.titre || "",
                    aide: ctx.aide || "",
                    ctrl: pt.ctrl || "",
                    preuve: pt.preuve || "",
                    type: "",
                    constat: ""
                });
            });
        });
        return grid;
    }

    // Liste des référentiels disposant d'un modèle d'audit (pour alimenter un menu) :
    // [ { id, nom, points } ], dans l'ordre d'enregistrement.
    function available() {
        return order.map(refId => {
            const ref = (typeof Referentiels !== "undefined") ? Referentiels.get(refId) : null;
            return { id: refId, nom: ref ? ref.nom : refId, points: countPoints(refId) };
        });
    }

    return { register, get, has, all, countPoints, buildGrid, available };
})();
