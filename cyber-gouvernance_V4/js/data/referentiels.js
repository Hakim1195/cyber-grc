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

    function get(id) { return registry[id] || null; }
    function all() { return order.map(id => registry[id]); }

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

    return { register, get, all, countExigences, flatExigences, findExigence };
})();
