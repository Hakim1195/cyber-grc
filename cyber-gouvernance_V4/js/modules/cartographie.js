// Emplacement : js/modules/cartographie.js
// Nom du fichier : cartographie.js
//
// Cartographie du SI & dépendances entre actifs (chantier Cartographie, schéma v9).
// Graphe SVG « fait maison » (même recette que la matrice EBIOS : formes + texte,
// export PNG via canvas, sans dépendance). Niveau 3 : propagation d'impact +
// détection des points de défaillance unique (SPOF).
//
// Modèle du lien : chaque actif porte `dependances: [{ to, type }]`. Une arête A→B
// signifie « A a besoin de B » pour TOUS les types SAUF « sauvegardé par » (backup),
// qui ne propage pas une panne de disponibilité (il porte la capacité de restauration).

const CartographieModule = (() => {

    // Types de liens (point de vue de l'actif édité). `propagates` = participe à la
    // propagation d'une panne de disponibilité (rayon d'impact / SPOF).
    /* ═════════════════════════════════════════════════════════════════════
       LES HUIT NATURES DE LIEN — et ce que chacune change à l'analyse

       ⚠️ **C'est la SEULE source du produit sur ce point**, et deux écrans la
       lisent (la fiche d'un actif et cette carte). La recopier — en base, dans
       un autre module — en ferait une seconde, et deux rédactions divergent au
       premier ajustement (constat **Q-219**). Le vocabulaire, lui, est clos EN
       BASE (`ck_actif_dependances_type`, migration `062`) : la base dit ce qui
       est écrivable, ce fichier dit ce que cela SIGNIFIE.

       🛑 **`propagates` est la propriété qui décide de tout** — rayon d'impact
       et point de défaillance unique. Deux natures ne propagent PAS, et pour
       deux raisons différentes qu'il ne faut pas confondre :

         · `backup`     — la sauvegarde porte la capacité de RESTAURATION. Elle
                          n'évite pas la panne, elle la répare ;
         · `redonde_par`— la redondance REND LE SERVICE pendant la panne. Elle
                          n'a pas à être restaurée, elle prend le relais.

       Les mélanger fausserait le calcul de point de défaillance unique, qui est
       la seule chose que cette carte sait produire toute seule.

       ⚠️ **La COULEUR ne dit plus la nature du lien** (22/09/2026). Elle disait
       les deux : quatre couleurs de lien et quatre de criticité se disputaient
       la même toile — le vert voulait dire « sauvegardé par » ET « criticité
       faible » sur le même dessin. La charte réserve la couleur à la
       SÉMANTIQUE DES STATUTS (`CLAUDE.md` §2) ; la nature du lien se dit
       désormais par le TRAIT et par la forme de la flèche. On passe de huit
       codes visuels à quatre, et la carte redevient lisible sans rien perdre.
    ═════════════════════════════════════════════════════════════════════ */
    const DEP_TYPES = {
        dep: {
            label: "Dépend de", short: "dépend de", propagates: true,
            dash: "", fleche: "pleine",
            aide: "Besoin fonctionnel, sans plus de précision."
        },
        hosted: {
            label: "Hébergé sur", short: "hébergé sur", propagates: true,
            dash: "", fleche: "creuse",
            aide: "Le support physique ou virtuel qui le fait tourner."
        },
        flux: {
            label: "Alimenté par", short: "alimenté par", propagates: true,
            dash: "1 3", fleche: "pleine",
            aide: "Flux de données entrant."
        },
        authentifie_par: {
            label: "Authentifié par", short: "authentifié par", propagates: true,
            dash: "8 3", fleche: "pleine",
            aide: "Annuaire, fournisseur d’identité, SSO. C’est le point de "
                + "défaillance unique le plus fréquent d’un groupe industriel."
        },
        administre_par: {
            label: "Administré depuis", short: "administré depuis", propagates: true,
            dash: "2 2", fleche: "creuse",
            aide: "Bastion, poste d’administration, outil d’infogérance. C’est le "
                + "chemin que prend un attaquant."
        },
        transite_par: {
            label: "Transite par", short: "transite par", propagates: true,
            dash: "10 2 2 2", fleche: "pleine",
            aide: "Lien WAN, VPN, opérateur."
        },
        redonde_par: {
            label: "Redondé par", short: "redondé par", propagates: false,
            dash: "6 2 1 2", fleche: "creuse",
            aide: "Cluster, second site. À ne pas confondre avec la sauvegarde : "
                + "la redondance REND LE SERVICE pendant la panne, la sauvegarde "
                + "permet de le rétablir après."
        },
        backup: {
            label: "Sauvegardé par", short: "sauvegardé par", propagates: false,
            dash: "6 4", fleche: "creuse",
            aide: "Elle ne propage pas une panne de disponibilité : elle porte la "
                + "capacité de restauration."
        }
    };
    const DEP_ORDER = ["dep", "hosted", "flux", "authentifie_par",
                       "administre_par", "transite_par", "redonde_par", "backup"];

    /* Les deux qualificatifs de la migration `062`. ⚠️ `null` s'y lit « non
       renseigné » — jamais « immédiat », jamais « aucun mode dégradé ». Les
       dépendances saisies avant n'ont rien dit là-dessus. */
    const DELAIS = [
        { code: "immediat", libelle: "Immédiat", rang: 0,
          aide: "L’actif tombe en même temps que sa cible." },
        { code: "heures",   libelle: "Quelques heures", rang: 1,
          aide: "Quelques heures d’autonomie." },
        { code: "jour",     libelle: "Une journée", rang: 2,
          aide: "Une journée d’autonomie." },
        { code: "semaine",  libelle: "Une semaine ou plus", rang: 3,
          aide: "Une semaine ou plus." }
    ];
    const DEGRADES = [
        { code: "non",     libelle: "Aucun mode dégradé" },
        { code: "partiel", libelle: "Mode dégradé partiel" },
        { code: "oui",     libelle: "Mode dégradé complet" }
    ];
    const DELAI_PAR_CODE = {};
    DELAIS.forEach(function (d) { DELAI_PAR_CODE[d.code] = d; });
    const DEGRADE_PAR_CODE = {};
    DEGRADES.forEach(function (d) { DEGRADE_PAR_CODE[d.code] = d; });

    /* Les cinq natures d'exploitation par un tiers (migration `062`). */
    const NATURES_TIERS = [
        { code: "exploitation", libelle: "Exploité par" },
        { code: "hebergement",  libelle: "Hébergé chez" },
        { code: "maintenance",  libelle: "Maintenu par" },
        { code: "infogerance",  libelle: "Infogéré par" },
        { code: "editeur",      libelle: "Édité par" }
    ];

    // Couleurs de criticité (miroir des tokens --risk-*, sémantique stricte).
    const CRIT_COLOR = { critique: "#c0392b", "élevée": "#e67e22", "modérée": "#f1c40f", faible: "#27ae60" };
    const CRIT_ORDER = { critique: 0, "élevée": 1, "modérée": 2, faible: 3 };
    const ALL_TYPES = ["Matériel", "Logiciel", "Donnée", "Service", "Humain"];
    const ALL_CRITS = ["critique", "élevée", "modérée", "faible"];

    const USE_COLOR = "#9aa8b8";     // arête processus ↔ actif (usage)
    /* ⚠️ **Une seule couleur pour TOUTES les arêtes de dépendance.** La nature se
       dit par le trait ; la couleur reste à la criticité. Voir l'entête de
       DEP_TYPES — huit codes visuels sur une même toile, dont deux verts qui ne
       voulaient pas dire la même chose. */
    const DEP_COLOR = "#5b6b7d";
    const SPOF_MIN_CRIT_PROC = 2;    // seuil SPOF : ≥ N processus critiques en aval

    // Géométrie du graphe (viewBox interne ; le SVG est mis à l'échelle par le conteneur).
    const NW = 158, NH = 54, VBW = 980, PAD_L = 128, PAD_R = 26,
          H_GAP = 30, V_GAP = 26, ROW_GAP = 46, BAND_TOP = 58, BAND_BOTTOM = 30;
    const NS = "http://www.w3.org/2000/svg";

    /* ═════════════════════════════════════════════════════════════════════
       QUATRE VUES, ET POURQUOI CE N'EST PAS UN CONFORT

       ⚠️ **Le graphe en couches ne passe pas l'échelle**, et c'est structurel :
       au-delà d'une quarantaine d'actifs il devient un plat de spaghettis, quel
       que soit le soin apporté au tracé. Une carte qui essaie de tout montrer ne
       montre rien.

       Chaque vue répond donc à UNE question, et une seule :

         · `couches`  — « à quoi ressemble le SI ? » (le graphe d'origine) ;
         · `focus`    — « de quoi dépend CET actif, et qui dépend de lui ? ».
                        C'est la vue qu'on emploie réellement, et elle reste
                        lisible à cinq cents actifs : un actif au centre, l'amont
                        à gauche, l'aval à droite ;
         · `matrice`  — « quelles dépendances existent ? ». Une matrice
                        d'adjacence n'a AUCUN croisement de traits : elle reste
                        lisible et s'IMPRIME là où un graphe devient illisible.
                        C'est la vue qu'on met en annexe d'un rapport d'audit ;
         · `chaine`   — « si ça tombe, qu'est-ce qui s'arrête, et QUAND ? ».
                        Ordonnée par le délai avant impact de la migration `062` :
                        c'est elle qui transforme un rayon d'impact en
                        CHRONOLOGIE, et c'est la vue qui va en comité.
    ═════════════════════════════════════════════════════════════════════ */
    const VUES = [
        { code: "couches", libelle: "Couches",
          aide: "Le SI de haut en bas : les processus métier en tête, le socle en bas." },
        { code: "focus", libelle: "Focus",
          aide: "Un actif au centre : ce dont il a besoin à gauche, ce qui dépend de lui "
              + "à droite. Reste lisible quel que soit le nombre d’actifs." },
        { code: "matrice", libelle: "Matrice",
          aide: "Toutes les dépendances sans un seul croisement de traits. C’est la vue "
              + "qui s’imprime, et celle qu’on met en annexe d’un rapport d’audit." },
        { code: "chaine", libelle: "Chaîne d’impact",
          aide: "Si cet actif tombe, qu’est-ce qui s’arrête — et QUAND. Ordonné par le "
              + "délai avant impact déclaré sur chaque lien." }
    ];
    let vue = "couches";

    // État de la vue.
    let selected = null;
    let filters = null;
    let lastLayout = null;   // { nodes:[{id,x,y,kind,...}], edges:[{f,t,type}], height }

    function esc(s) { return (window.escapeHtml || (x => x))(s == null ? "" : String(s)); }

    /* =========================
       ASSEMBLAGE DU MODÈLE (données réelles → nœuds + arêtes)
    ========================== */
    function assemble() {
        const rawActifs = DataStore.getActifs() || [];
        const rawProc = DataStore.getProcessus() || [];
        const assetIds = new Set(rawActifs.map(a => a.id));

        const assets = rawActifs.map(a => ({
            id: a.id, kind: "asset", nom: a.nom || "Sans nom",
            type: a.type || "", criticite: a.criticite || "faible",
            deps: Array.isArray(a.dependances) ? a.dependances : []
        }));
        const procs = rawProc.map(p => ({
            id: p.id, kind: "proc", nom: p.nom || "Sans nom",
            criticite: p.criticite || "", rto: p.rto || "",
            actifs: Array.isArray(p.actifs_lies) ? p.actifs_lies : []
        }));

        const depEdges = [];
        assets.forEach(a => a.deps.forEach(d => {
            if (!d || !d.to || d.to === a.id) return;           // ignore auto-lien
            if (!assetIds.has(d.to)) return;                    // ignore cible disparue
            if (!DEP_TYPES[d.type]) return;                     // ignore type inconnu
            // ⚠️ `delai` et `degrade` (migration `062`) voyagent avec l'arête :
            //    c'est eux qui transforment le rayon d'impact en CHRONOLOGIE, et la
            //    vue « chaîne d'impact » n'a rien d'autre pour ordonner.
            depEdges.push({
                f: a.id, t: d.to, type: d.type,
                delai: d.delai || null, degrade: d.degrade || null
            });
        }));
        const procEdges = [];
        procs.forEach(p => p.actifs.forEach(aid => {
            if (assetIds.has(aid)) procEdges.push({ f: p.id, t: aid, type: "use" });
        }));

        const nodeById = {};
        assets.forEach(a => nodeById[a.id] = a);
        procs.forEach(p => nodeById[p.id] = p);
        return { assets, procs, depEdges, procEdges, nodeById };
    }

    // Arêtes qui propagent une panne (dép. hors sauvegarde + usage processus).
    function propEdges(model) {
        return model.depEdges.filter(e => DEP_TYPES[e.type].propagates).concat(model.procEdges);
    }

    // Rayon d'impact : tout ce qui (transitivement) a besoin de `id`.
    function blast(model, id) {
        const pe = propEdges(model);
        const seen = new Set(), q = [id];
        while (q.length) {
            const cur = q.shift();
            pe.forEach(e => { if (e.t === cur && !seen.has(e.f)) { seen.add(e.f); q.push(e.f); } });
        }
        return seen;
    }

    // Ensemble des SPOF (≥ SPOF_MIN_CRIT_PROC processus critiques dépendent de l'actif).
    function computeSpof(model) {
        const spof = new Set();
        model.assets.forEach(a => {
            const b = blast(model, a.id);
            let n = 0;
            b.forEach(x => { const nd = model.nodeById[x]; if (nd && nd.kind === "proc" && nd.criticite === "critique") n++; });
            if (n >= SPOF_MIN_CRIT_PROC) spof.add(a.id);
        });
        return spof;
    }

    /* =========================
       LAYOUT EN COUCHES (rang = profondeur de dépendance)
       Une arête A→B (« A dépend de B ») place B PLUS BAS (vers le socle). Les
       processus métier coiffent le graphe. Robuste aux cycles (garde de pile).
    ========================== */
    function computeLevels(assets, depEdges) {
        const adj = new Map(); assets.forEach(a => adj.set(a.id, []));
        depEdges.forEach(e => { if (adj.has(e.f) && adj.has(e.t)) adj.get(e.f).push(e.t); });
        const level = new Map(), state = new Map();
        function dfs(id) {
            if (level.has(id)) return level.get(id);
            if (state.get(id) === 1) return 0;                  // back-edge (cycle) → coupe
            state.set(id, 1);
            let lv = 0;
            adj.get(id).forEach(t => { lv = Math.max(lv, 1 + dfs(t)); });
            state.set(id, 2); level.set(id, lv); return lv;
        }
        assets.forEach(a => dfs(a.id));
        return level;
    }

    function computeLayout(model, showProc) {
        const { assets, procs, depEdges } = model;
        const level = computeLevels(assets, depEdges);
        let maxLevel = 0; assets.forEach(a => { maxLevel = Math.max(maxLevel, level.get(a.id) || 0); });

        // Regroupement par rang d'affichage (0 = haut).
        const procOffset = showProc && procs.length ? 1 : 0;
        const rows = {};
        if (procOffset) rows[0] = procs.slice();
        assets.forEach(a => {
            const r = procOffset + (maxLevel - (level.get(a.id) || 0));
            (rows[r] = rows[r] || []).push(a);
        });

        const usable = VBW - PAD_L - PAD_R;
        const perRow = Math.max(1, Math.floor((usable + H_GAP) / (NW + H_GAP)));
        const nodes = [];
        let y = BAND_TOP;
        const rowKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);

        rowKeys.forEach(rk => {
            const list = rows[rk].slice().sort((a, b) =>
                (CRIT_ORDER[a.criticite] ?? 9) - (CRIT_ORDER[b.criticite] ?? 9) || a.nom.localeCompare(b.nom));
            for (let i = 0; i < list.length; i += perRow) {
                const chunk = list.slice(i, i + perRow);
                const totalW = chunk.length * NW + (chunk.length - 1) * H_GAP;
                const startX = PAD_L + Math.max(0, (usable - totalW) / 2);
                chunk.forEach((n, k) => nodes.push(Object.assign({}, n, {
                    x: startX + k * (NW + H_GAP), y, cx: startX + k * (NW + H_GAP) + NW / 2, cy: y + NH / 2
                })));
                y += NH + V_GAP;
            }
            y += ROW_GAP - V_GAP;
        });

        return { nodes, height: y + BAND_BOTTOM };
    }

    /* =========================
       FILTRAGE (visuel : n'affecte pas le calcul d'impact/SPOF, fait sur le graphe complet)
    ========================== */
    /**
     * Le modèle réduit aux filtres.
     *
     * 🛑 **LA RECHERCHE NE FILTRE PAS DANS LES VUES « FOCUS » ET « CHAÎNE », et
     * c'est un défaut vu en cliquant.** Elle y restreignait le modèle au seul
     * actif cherché — donc à un sujet SANS VOISINS : la chaîne d'impact
     * annonçait « 0 élément touché, personne n'en dépend » sur un annuaire dont
     * quatre actifs dépendent. Le chiffre était exact au regard du filtre, et
     * faux au regard de la question posée.
     *
     * Dans ces deux vues, chercher **désigne** le sujet au lieu de réduire le
     * monde autour de lui — c'est le geste que l'écran attend, et c'est celui
     * qu'il fait désormais (voir `setSearch`).
     */
    function visibleModel(model) {
        const f = filters;
        const filtreParNom = vue !== "focus" && vue !== "chaine";
        const okAsset = a =>
            f.types.has(a.type) && f.crits.has(a.criticite) &&
            (!filtreParNom || !f.search || a.nom.toLowerCase().includes(f.search));
        let assets = model.assets.filter(okAsset);
        let procs = f.showProc
            ? model.procs.filter(p => !filtreParNom || !f.search || p.nom.toLowerCase().includes(f.search))
            : [];

        const visIds = new Set(assets.map(a => a.id).concat(procs.map(p => p.id)));
        let depEdges = model.depEdges.filter(e => visIds.has(e.f) && visIds.has(e.t));
        let procEdges = f.showProc ? model.procEdges.filter(e => visIds.has(e.f) && visIds.has(e.t)) : [];

        if (f.hideIsolated) {
            const linked = new Set();
            depEdges.concat(procEdges).forEach(e => { linked.add(e.f); linked.add(e.t); });
            assets = assets.filter(a => linked.has(a.id));
            procs = procs.filter(p => linked.has(p.id));
        }
        const nodeById = {};
        assets.concat(procs).forEach(n => nodeById[n.id] = n);
        return { assets, procs, depEdges, procEdges, nodeById };
    }

    /* =========================
       RENDU SVG (interactif)
    ========================== */
    function el(tag, attrs, parent) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    function anchor(n, side) {
        if (side === "top") return [n.cx, n.y];
        if (side === "bottom") return [n.cx, n.y + NH];
        if (side === "left") return [n.x, n.cy];
        return [n.x + NW, n.cy];
    }
    function edgePath(a, b) {
        let s, t, vertical = true;
        if (b.cy > a.cy + 4) { s = anchor(a, "bottom"); t = anchor(b, "top"); }
        else if (b.cy < a.cy - 4) { s = anchor(a, "top"); t = anchor(b, "bottom"); }
        else { vertical = false; if (a.cx < b.cx) { s = anchor(a, "right"); t = anchor(b, "left"); } else { s = anchor(a, "left"); t = anchor(b, "right"); } }
        const dx = t[0] - s[0], dy = t[1] - s[1];
        const c1 = vertical ? [s[0], s[1] + dy * 0.5] : [s[0] + dx * 0.5, s[1]];
        const c2 = vertical ? [t[0], t[1] - dy * 0.5] : [t[0] - dx * 0.5, t[1]];
        return `M${s[0]},${s[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${t[0]},${t[1]}`;
    }

    function renderGraph(model, spof) {
        const vm = visibleModel(model);
        const layout = computeLayout(vm, filters.showProc);
        lastLayout = { vm, layout, spof };
        const posById = {};
        layout.nodes.forEach(n => posById[n.id] = n);

        const host = document.getElementById("carto-svg-host");
        if (!host) return;
        host.innerHTML = "";
        const svg = el("svg", {
            class: "carto-graph", id: "carto-graph",
            viewBox: `0 0 ${VBW} ${layout.height}`,
            role: "img", "aria-label": "Cartographie des dépendances du système d'information"
        }, host);

        // Marqueurs de flèche (un par type + usage).
        const defs = el("defs", {}, svg);
        Object.keys(DEP_TYPES).forEach(tp => {
            const m = el("marker", { id: "carto-ar-" + tp, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
            el("path", { d: "M0,0 L10,5 L0,10 z", fill: DEP_COLOR }, m);
        });
        const mu = el("marker", { id: "carto-ar-use", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse" }, defs);
        el("path", { d: "M0,0 L10,5 L0,10 z", fill: USE_COLOR }, mu);

        // Axe vertical « Métier → Infrastructure ».
        const axisX = 26;
        el("line", { x1: axisX, y1: BAND_TOP - 6, x2: axisX, y2: layout.height - BAND_BOTTOM, stroke: "var(--border)", "stroke-width": "1.5" }, svg);
        el("text", { x: axisX, y: BAND_TOP + 4, class: "carto-axis", "text-anchor": "middle", transform: `rotate(-90 ${axisX} ${BAND_TOP + 4})` }, svg).textContent = "MÉTIER";
        const byb = layout.height - BAND_BOTTOM - 4;
        el("text", { x: axisX, y: byb, class: "carto-axis", "text-anchor": "middle", transform: `rotate(-90 ${axisX} ${byb})` }, svg).textContent = "INFRASTRUCTURE";

        // Arêtes.
        const ge = el("g", {}, svg);
        function drawEdge(e, cls, color, dash, marker) {
            const a = posById[e.f], b = posById[e.t]; if (!a || !b) return;
            const p = el("path", { d: edgePath(a, b), class: cls, fill: "none", stroke: color, "stroke-width": "2", "marker-end": `url(#${marker})` }, ge);
            if (dash) p.setAttribute("stroke-dasharray", dash);
            p.dataset.f = e.f; p.dataset.t = e.t;
        }
        vm.procEdges.forEach(e => drawEdge(e, "carto-edge carto-edge-use", USE_COLOR, "2 4", "carto-ar-use"));
        vm.depEdges.forEach(e => drawEdge(e, "carto-edge carto-edge-dep", DEP_COLOR, DEP_TYPES[e.type].dash, "carto-ar-" + e.type));

        // Nœuds.
        layout.nodes.forEach(n => {
            const g = el("g", { class: "carto-node" + (n.kind === "proc" ? " is-proc" : ""), tabindex: "0", role: "button", "data-id": n.id, "data-spof": spof.has(n.id) ? "1" : "0", "aria-label": esc(n.nom) }, svg);
            el("rect", { class: "carto-spof-ring", x: n.x - 5, y: n.y - 5, width: NW + 10, height: NH + 10, rx: 13 }, g);
            el("rect", { class: "carto-card", x: n.x, y: n.y, width: NW, height: NH, rx: 9 }, g);
            const critColor = CRIT_COLOR[n.criticite] || "#94a3b8";
            el("rect", { x: n.x, y: n.y, width: 5, height: NH, rx: 2, fill: critColor }, g);
            el("circle", { cx: n.x + 20, cy: n.cy, r: 5, fill: critColor }, g);
            const t1 = el("text", { class: "carto-nlabel", x: n.x + 34, y: n.y + 22 }, g);
            t1.textContent = n.nom.length > 22 ? n.nom.slice(0, 21) + "…" : n.nom;
            const t2 = el("text", { class: "carto-nsub", x: n.x + 34, y: n.y + 39 }, g);
            t2.textContent = n.kind === "proc" ? "Processus" + (n.rto ? " · RTO " + n.rto : "") : (n.type || "Actif");
            el("text", { class: "carto-spof-badge", x: n.x + NW - 4, y: n.y - 9, "text-anchor": "end" }, g).textContent = "SPOF";
            g.addEventListener("click", () => selectNode(n.id));
            g.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectNode(n.id); } });
        });

        applyHighlight();
    }

    function applyHighlight() {
        const svg = document.getElementById("carto-graph"); if (!svg) return;
        svg.querySelectorAll(".carto-node").forEach(g => g.classList.remove("is-hl", "is-dim", "is-selected"));
        svg.querySelectorAll(".carto-edge").forEach(e => e.classList.remove("is-hl", "is-dim"));
        if (!selected || !lastLayout) { svg.classList.remove("has-sel"); return; }
        svg.classList.add("has-sel");
        const b = blast(lastLayout.vm, selected);
        const hlN = new Set([selected]); b.forEach(x => hlN.add(x));
        svg.querySelectorAll(".carto-node").forEach(g => {
            const id = g.dataset.id;
            if (id === selected) g.classList.add("is-hl", "is-selected");
            else if (hlN.has(id)) g.classList.add("is-hl");
            else g.classList.add("is-dim");
        });
        svg.querySelectorAll(".carto-edge").forEach(e => {
            (hlN.has(e.dataset.f) && hlN.has(e.dataset.t)) ? e.classList.add("is-hl") : e.classList.add("is-dim");
        });
    }

    /* =========================
       PANNEAU D'ANALYSE
    ========================== */
    function renderPanel(model, spof) {
        const panel = document.getElementById("carto-panel"); if (!panel) return;
        if (!selected || !model.nodeById[selected]) {
            panel.innerHTML = `
                <h2>Analyse d'impact</h2>
                <p class="carto-empty">Cliquez sur un actif ou un processus pour explorer ses dépendances et mesurer le rayon d'impact d'une panne.</p>
                <div class="carto-note">
                    <strong>Rayon d'impact</strong> : la propagation suit les liens
                    ${DEP_ORDER.filter(t => DEP_TYPES[t].propagates).map(t => "« " + esc(DEP_TYPES[t].short) + " »").join(", ")}
                    (+ l'usage des processus). Les liens
                    ${DEP_ORDER.filter(t => !DEP_TYPES[t].propagates).map(t => "<em>" + esc(DEP_TYPES[t].short) + "</em>").join(" et ")}
                    en sont exclus — la sauvegarde permet de RÉTABLIR le service après la panne, la redondance le REND pendant.
                </div>`;
            return;
        }
        const n = model.nodeById[selected];
        const critColor = CRIT_COLOR[n.criticite] || "#94a3b8";
        const head = `<div class="carto-head">
            <span class="carto-name">${esc(n.nom)}</span>
            ${n.criticite ? `<span class="carto-pill" style="background:${critColor}">${esc(n.criticite)}</span>` : ""}
            <span class="carto-tag">${esc(n.kind === "proc" ? "Processus métier" : (n.type || "Actif"))}</span>
        </div>`;

        // Dépendances directes de cet actif (sortantes) et ce qui en dépend (entrantes).
        const outs = model.depEdges.filter(e => e.f === selected)
            .map(e => `<li>${esc(DEP_TYPES[e.type].short)} <strong>${esc(model.nodeById[e.t] ? model.nodeById[e.t].nom : "?")}</strong></li>`);
        const inDeps = model.depEdges.filter(e => e.t === selected)
            .map(e => `<li><strong>${esc(model.nodeById[e.f] ? model.nodeById[e.f].nom : "?")}</strong> — ${esc(DEP_TYPES[e.type].short)}</li>`);

        // Rayon d'impact.
        const b = blast(model, selected);
        const impacted = Array.from(b).map(x => model.nodeById[x]).filter(Boolean);
        const impProc = impacted.filter(x => x.kind === "proc");
        const impAsset = impacted.filter(x => x.kind === "asset");
        const critProc = impProc.filter(x => x.criticite === "critique");
        const isSpof = spof.has(selected);

        const impProcList = impProc.length
            ? impProc.sort((a, c) => (CRIT_ORDER[a.criticite] ?? 9) - (CRIT_ORDER[c.criticite] ?? 9))
                .map(p => `<li><a href="#/bia/${encodeURIComponent(p.id)}">${esc(p.nom)}</a>${p.rto ? ` <span class="carto-muted">· RTO ${esc(p.rto)}</span>` : ""}${p.criticite === "critique" ? ` <span class="carto-crit-dot" title="processus critique"></span>` : ""}</li>`).join("")
            : `<li class="carto-muted">Aucun processus métier en aval.</li>`;

        panel.innerHTML = `
            <h2>Analyse d'impact — propagation</h2>
            ${head}
            <div class="carto-sect">
                <div class="carto-lbl">Si cet actif est indisponible ${Help.tip("Propagation transitive : tous les actifs et processus qui dépendent, directement ou en cascade, de cet actif. Les liens de sauvegarde et de redondance en sont exclus — la première permet de RÉTABLIR le service, la seconde le REND pendant la panne. La vue « Chaîne d'impact » ajoute le QUAND.")}</div>
                <div class="carto-impact">
                    <div class="box"><div class="n">${impAsset.length}</div><div class="c">actif(s) en aval</div></div>
                    <div class="box"><div class="n">${impProc.length}</div><div class="c">processus impacté(s)</div></div>
                    <div class="box"><div class="n" style="color:var(--color-danger)">${critProc.length}</div><div class="c">dont critiques</div></div>
                    <div class="box"><div class="n">${outs.length + inDeps.length}</div><div class="c">liens directs</div></div>
                </div>
            </div>
            ${isSpof ? `<div class="carto-spofbox"><strong>Point de défaillance unique (SPOF)</strong> ${Help.tip("Single Point Of Failure : au moins deux processus critiques dépendent de cet actif sans alternative. Sa panne interrompt plusieurs activités vitales à la fois.")}<br>Au moins ${SPOF_MIN_CRIT_PROC} processus critiques en dépendent. Priorité : redondance / plan de bascule.</div>` : ""}
            <div class="carto-sect">
                <div class="carto-lbl">Processus métier impactés</div>
                <ul class="carto-list">${impProcList}</ul>
            </div>
            <div class="carto-sect">
                <div class="carto-lbl">Dépend de</div>
                <ul class="carto-list">${outs.join("") || `<li class="carto-muted">Aucune dépendance déclarée.</li>`}</ul>
            </div>
            <div class="carto-sect">
                <div class="carto-lbl">En dépendent directement</div>
                <ul class="carto-list">${inDeps.join("") || `<li class="carto-muted">Aucun actif ne pointe vers celui-ci.</li>`}</ul>
            </div>
            <div class="carto-actions">
                ${n.kind === "asset"
                    ? `<button type="button" class="carto-btn-primary" id="carto-open">Ouvrir la fiche actif</button>`
                    : `<button type="button" class="carto-btn-primary" id="carto-open">Ouvrir le processus</button>`}
                <button type="button" class="carto-btn-ghost" id="carto-deselect">Désélectionner</button>
            </div>`;

        // Gestionnaires du panneau : réinstallés à chaque rendu du panneau, car son
        // contenu est remplacé en entier. La route est capturée par la fermeture —
        // aucune donnée n'est interpolée dans un attribut.
        const route = (n.kind === "asset" ? "/actifs/" : "/bia/") + encodeURIComponent(n.id);
        const ouvrir = document.getElementById("carto-open");
        if (ouvrir) ouvrir.addEventListener("click", () => Router.navigateTo(route));
        const deselect = document.getElementById("carto-deselect");
        if (deselect) deselect.addEventListener("click", () => clearSelection());
    }

    /* =========================
       INTERACTIONS
    ========================== */
    function currentModel() { return assemble(); }

    function selectNode(id) {
        selected = (selected === id ? null : id);
        const model = currentModel();
        const spof = lastLayout ? lastLayout.spof : computeSpof(model);
        applyHighlight();
        renderPanel(model, spof);
    }
    function clearSelection() {
        selected = null;
        const model = currentModel();
        applyHighlight();
        renderPanel(model, lastLayout ? lastLayout.spof : computeSpof(model));
    }

    function refresh() {
        const model = currentModel();
        const spof = computeSpof(model);
        if (selected && !model.nodeById[selected]) selected = null;
        dessiner(model, spof);
        renderPanel(model, spof);
        updateStats(model, spof);
    }

    function updateStats(model, spof) {
        const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        set("carto-stat-actifs", model.assets.length);
        set("carto-stat-proc", model.procs.length);
        set("carto-stat-liens", model.depEdges.length);
        set("carto-stat-spof", spof.size);
    }

    // Filtres (appelés par les contrôles).
    function toggleType(t) { filters.types.has(t) ? filters.types.delete(t) : filters.types.add(t); syncFilterButtons(); refresh(); }
    function toggleCrit(c) { filters.crits.has(c) ? filters.crits.delete(c) : filters.crits.add(c); syncFilterButtons(); refresh(); }
    function setShowProc(v) { filters.showProc = v; refresh(); }
    function setHideIsolated(v) { filters.hideIsolated = v; refresh(); }
    function setSearch(v) {
        filters.search = (v || "").trim().toLowerCase();
        // Dans les vues qui ont un SUJET, chercher le DÉSIGNE au lieu de réduire le
        // monde autour de lui — voir `visibleModel`.
        if ((vue === "focus" || vue === "chaine") && filters.search) {
            const trouve = currentModel().assets
                .find(a => a.nom.toLowerCase().includes(filters.search));
            if (trouve) selected = trouve.id;
        }
        refresh();
    }

    function syncFilterButtons() {
        document.querySelectorAll("[data-ftype]").forEach(b => b.setAttribute("aria-pressed", filters.types.has(b.dataset.ftype)));
        document.querySelectorAll("[data-fcrit]").forEach(b => b.setAttribute("aria-pressed", filters.crits.has(b.dataset.fcrit)));
    }

    /* =========================
       EXPORT (SVG autonome → PNG via canvas, sans dépendance — cf. matrice.js)
    ========================== */
    function buildExportSVG() {
        if (!lastLayout) return "";
        const { vm, layout, spof } = lastLayout;
        const posById = {}; layout.nodes.forEach(n => posById[n.id] = n);
        const W = VBW, H = layout.height + 40, top = 44;
        const dateStr = new Date().toLocaleDateString("fr-FR");
        let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;
        s += `<text x="26" y="26" font-size="18" font-weight="700" fill="#2059A6">Cartographie du SI &amp; dépendances</text>`;
        // Marque de la filiale ACTIVE, jamais d'une constante (lot L9,
        // CONVENTIONS.md §33.4) : ce texte SVG est ce qu'un auditeur emporte.
        s += `<text x="${W - 26}" y="20" text-anchor="end" font-size="12" font-weight="700" fill="#E9631B">${esc(Identite.raisonSocialeOuRepli(Identite.NOM_PRODUIT))}</text>`;
        s += `<text x="${W - 26}" y="36" text-anchor="end" font-size="10" fill="#6b7a8d">Exporté le ${esc(dateStr)} — ${vm.assets.length} actif(s), ${vm.depEdges.length} dépendance(s)</text>`;

        function path(a, b) { return edgePath(a, b); }
        // arêtes
        vm.procEdges.forEach(e => { const a = posById[e.f], b = posById[e.t]; if (a && b) s += `<path d="${path(a, b)}" fill="none" stroke="${USE_COLOR}" stroke-width="2" stroke-dasharray="2 4"/>`; });
        vm.depEdges.forEach(e => { const a = posById[e.f], b = posById[e.t]; if (a && b) { const dt = DEP_TYPES[e.type]; s += `<path d="${path(a, b)}" fill="none" stroke="${DEP_COLOR}" stroke-width="2"${dt.dash ? ` stroke-dasharray="${dt.dash}"` : ""}/>`; } });
        // nœuds
        layout.nodes.forEach(n => {
            const cc = CRIT_COLOR[n.criticite] || "#94a3b8";
            s += `<rect x="${n.x}" y="${n.y}" width="${NW}" height="${NH}" rx="9" fill="${n.kind === "proc" ? "#eef4fb" : "#ffffff"}" stroke="${spof.has(n.id) ? "#E9631B" : "#e2e6ea"}" stroke-width="${spof.has(n.id) ? 2 : 1.3}"/>`;
            s += `<rect x="${n.x}" y="${n.y}" width="5" height="${NH}" rx="2" fill="${cc}"/>`;
            s += `<circle cx="${n.x + 20}" cy="${n.cy}" r="5" fill="${cc}"/>`;
            const nm = n.nom.length > 22 ? n.nom.slice(0, 21) + "…" : n.nom;
            s += `<text x="${n.x + 34}" y="${n.y + 22}" font-size="12.5" font-weight="600" fill="#1f2d3d">${esc(nm)}</text>`;
            const sub = n.kind === "proc" ? "Processus" + (n.rto ? " · RTO " + n.rto : "") : (n.type || "Actif");
            s += `<text x="${n.x + 34}" y="${n.y + 39}" font-size="9.5" font-weight="600" fill="#6b7a8d">${esc(sub)}</text>`;
            if (spof.has(n.id)) s += `<text x="${n.x + NW - 4}" y="${n.y - 8}" text-anchor="end" font-size="8" font-weight="800" fill="#E9631B">SPOF</text>`;
        });
        const font = "Segoe UI, Roboto, Arial, sans-serif";
        return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}">${s}</svg>`;
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    /**
     * Ce que l'export DIT quand il ne peut rien produire.
     *
     * ⚠️ **Un bouton qui ne fait rien est pire qu'un bouton absent** : on clique,
     * rien ne se passe, et on conclut que le produit est cassé. C'est la classe
     * fermée par `test/depot/branchements-muets.test.mjs` le 18/09. Les trois
     * vues neuves n'ont pas de géométrie — la matrice s'imprime, le focus et la
     * chaîne se lisent —, et l'écran le dit au lieu de se taire.
     */
    function refuserExport() {
        if (window.showToast) {
            showToast("L’export en image concerne la vue « Couches ». La matrice "
                    + "s’imprime (Ctrl+P) ; le focus et la chaîne d’impact se lisent à "
                    + "l’écran.", "info");
        }
    }

    function exportSVG() {
        // Le droit d'export est distinct de la lecture (PLAN_SERVEUR §3.3) :
        // entonnoir unique `Droits.exigerExport()` (js/core/session.js).
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;
        const str = buildExportSVG();
        if (!str) return refuserExport();
        triggerDownload(new Blob([str], { type: "image/svg+xml;charset=utf-8" }), "cartographie-si.svg");
    }
    function exportPNG() {
        // Le droit d'export est distinct de la lecture (PLAN_SERVEUR §3.3) :
        // entonnoir unique `Droits.exigerExport()` (js/core/session.js).
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;
        const str = buildExportSVG();
        if (!str) return refuserExport();
        const url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = () => {
            const scale = 2, canvas = document.createElement("canvas");
            canvas.width = img.width * scale; canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => { if (b) triggerDownload(b, "cartographie-si.png"); else alert("Échec de la génération du PNG."); }, "image/png");
        };
        img.onerror = () => { URL.revokeObjectURL(url); alert("Échec de l'export PNG (rendu de l'image)."); };
        img.src = url;
    }


    /* =========================================================================
       VUE « MATRICE » — toutes les dépendances, sans un seul croisement de traits

       ⚠️ **C'est la vue qui s'imprime.** Un graphe de deux cents actifs ne tient
       sur aucune feuille ; une matrice d'adjacence, si — et c'est elle qu'on met
       en annexe d'un rapport d'audit. Elle n'a aucune géométrie à optimiser,
       aucune arête à faire passer : la lisibilité ne dépend pas du nombre de
       nœuds mais de la largeur de la page.

       ⚠️ **Les colonnes portent un NUMÉRO, pas un nom.** Écrire les noms
       verticalement au-dessus de chaque colonne était le premier réflexe : à
       vingt actifs, l'en-tête occupe plus de place que la matrice. La légende
       numérotée vit à gauche, en lignes, où elle se lit normalement.
    ========================================================================= */
    function renderMatrice(model, spof) {
        const vm = visibleModel(model);
        lastLayout = null;   // aucune géométrie : l'export PNG le dira
        const hote = document.getElementById("carto-svg-host");
        if (!hote) return;

        const actifs = vm.assets.slice().sort((a, b) =>
            (CRIT_ORDER[a.criticite] ?? 9) - (CRIT_ORDER[b.criticite] ?? 9)
            || a.nom.localeCompare(b.nom, "fr"));

        if (!actifs.length) {
            hote.innerHTML = '<p class="carto-vide">Aucun actif ne correspond aux filtres.</p>';
            return;
        }

        const rang = {};
        actifs.forEach((a, i) => { rang[a.id] = i + 1; });

        // Les liens, indexés par couple. Plusieurs natures peuvent coexister entre
        // deux actifs : on les empile dans la même case plutôt que d'en perdre une.
        const parCouple = {};
        vm.depEdges.forEach(e => {
            const cle = e.f + "→" + e.t;
            (parCouple[cle] = parCouple[cle] || []).push(e);
        });

        const abrege = (t) => {
            const dt = DEP_TYPES[t];
            if (!dt) return "?";
            return dt.short.split(" ").map(m => m[0]).join("").toUpperCase().slice(0, 3);
        };

        const entetes = actifs.map(a =>
            `<th scope="col" class="carto-mx-num" title="${esc(a.nom)}">${rang[a.id]}</th>`).join("");

        const lignes = actifs.map(source => {
            const cases = actifs.map(cible => {
                if (source.id === cible.id) return '<td class="carto-mx-diag"></td>';
                const liens = parCouple[source.id + "→" + cible.id];
                if (!liens) return '<td></td>';
                const titre = liens.map(l => {
                    const parts = [DEP_TYPES[l.type] ? DEP_TYPES[l.type].short : l.type];
                    if (l.delai) parts.push("impact " + libelleDelaiInterne(l.delai).toLowerCase());
                    if (l.degrade) parts.push(libelleDegradeInterne(l.degrade).toLowerCase());
                    return source.nom + " " + parts.join(" · ") + " " + cible.nom;
                }).join(" ; ");
                const propage = liens.some(l => DEP_TYPES[l.type] && DEP_TYPES[l.type].propagates);
                return `<td class="carto-mx-cell${propage ? "" : " carto-mx-cell--inerte"}" title="${esc(titre)}">`
                     + liens.map(l => esc(abrege(l.type))).join("<br>") + "</td>";
            }).join("");
            return `<tr><th scope="row" class="carto-mx-nom">`
                 + `<span class="carto-mx-rang">${rang[source.id]}</span>`
                 + `<span class="carto-cdot" style="background:${CRIT_COLOR[source.criticite] || "#ccc"}"></span>`
                 + `${esc(source.nom)}${spof.has(source.id) ? '<span class="carto-mx-spof" title="Point de défaillance unique">SPOF</span>' : ""}`
                 + `</th>${cases}</tr>`;
        }).join("");

        hote.innerHTML = `
            <p class="carto-mx-aide">Une ligne se lit : « cet actif <em>dépend de</em> ceux
            dont la colonne est cochée ». Les colonnes portent le numéro de la ligne
            correspondante. Une case grisée est un lien qui <strong>ne propage pas</strong>
            une panne — sauvegarde ou redondance.</p>
            <div class="table-scroll">
                <table class="data-table carto-matrice">
                    <thead><tr><th scope="col" class="carto-mx-nom">Actif</th>${entetes}</tr></thead>
                    <tbody>${lignes}</tbody>
                </table>
            </div>`;
    }

    function libelleDelaiInterne(code) {
        const d = DELAIS.find(x => x.code === code);
        return d ? d.libelle : code;
    }
    function libelleDegradeInterne(code) {
        const d = DEGRADES.find(x => x.code === code);
        return d ? d.libelle : code;
    }

    /* =========================================================================
       VUE « FOCUS » — un actif au centre, l'amont à gauche, l'aval à droite

       ⚠️ **C'est la vue qu'on emploie réellement**, et la seule qui reste lisible
       quel que soit le nombre d'actifs : elle n'en montre jamais plus que le
       voisinage immédiat du sujet. Le graphe en couches, lui, montre tout — donc
       rien, passé une quarantaine de nœuds.

       ⚠️ **Deux sauts, pas plus.** Trois faisaient réapparaître le plat de
       spaghettis qu'on vient de quitter ; un seul manquait l'essentiel, la
       dépendance indirecte étant précisément ce qu'une carte apporte.
    ========================================================================= */
    function renderFocus(model, spof) {
        const vm = visibleModel(model);
        lastLayout = null;
        const hote = document.getElementById("carto-svg-host");
        if (!hote) return;

        const centre = selected && vm.nodeById[selected] ? vm.nodeById[selected] : null;
        if (!centre) {
            hote.innerHTML = `
                <p class="carto-vide">Choisissez un actif — dans la liste ci-contre, par la
                recherche, ou depuis une autre vue — pour voir ce dont il a besoin et ce qui
                dépend de lui.</p>
                <ul class="carto-focus-choix">
                    ${vm.assets.slice(0, 24).map(a =>
                        `<li><button type="button" class="carto-focus-btn" data-id="${esc(a.id)}">`
                        + `<span class="carto-cdot" style="background:${CRIT_COLOR[a.criticite] || "#ccc"}"></span>`
                        + `${esc(a.nom)}</button></li>`).join("")}
                </ul>`;
            hote.querySelectorAll(".carto-focus-btn").forEach(b =>
                b.addEventListener("click", () => selectNode(b.dataset.id)));
            return;
        }

        // Amont : ce dont le centre a besoin. Aval : ce qui a besoin de lui.
        const voisins = (id, sens, profondeur) => {
            const vus = new Map();
            let courant = [id];
            for (let d = 1; d <= profondeur; d += 1) {
                const suivant = [];
                vm.depEdges.forEach(e => {
                    const de = sens === "amont" ? e.f : e.t;
                    const vers = sens === "amont" ? e.t : e.f;
                    if (courant.indexOf(de) === -1) return;
                    if (vers === id || vus.has(vers)) return;
                    vus.set(vers, { noeud: vm.nodeById[vers], lien: e, saut: d });
                    suivant.push(vers);
                });
                courant = suivant;
                if (!courant.length) break;
            }
            return [...vus.values()].filter(x => x.noeud);
        };

        const amont = voisins(centre.id, "amont", 2);
        const aval = voisins(centre.id, "aval", 2);
        // Les processus qui emploient cet actif : ils ne sont pas dans `depEdges`.
        const procs = vm.procEdges.filter(e => e.t === centre.id)
            .map(e => vm.nodeById[e.f]).filter(Boolean);

        const carte = (x, sens) => {
            const dt = DEP_TYPES[x.lien.type];
            const qualif = [
                x.lien.delai ? "impact " + libelleDelaiInterne(x.lien.delai).toLowerCase() : "",
                x.lien.degrade ? libelleDegradeInterne(x.lien.degrade).toLowerCase() : ""
            ].filter(Boolean).join(" · ");
            return `<li class="carto-fx-item${x.saut > 1 ? " carto-fx-indirect" : ""}">
                <button type="button" class="carto-fx-btn" data-id="${esc(x.noeud.id)}">
                    <span class="carto-cdot" style="background:${CRIT_COLOR[x.noeud.criticite] || "#ccc"}"></span>
                    <span class="carto-fx-nom">${esc(x.noeud.nom)}</span>
                </button>
                <span class="carto-fx-lien">${esc(dt ? dt.short : x.lien.type)}${
                    qualif ? ' <span class="dep-qualif">' + esc(qualif) + "</span>" : ""
                }${x.saut > 1 ? ' <span class="carto-fx-saut">indirect</span>' : ""}</span>
            </li>`;
        };

        hote.innerHTML = `
            <div class="carto-focus">
                <div class="carto-fx-col">
                    <h3>Ce dont il a besoin <span>${amont.length}</span></h3>
                    ${amont.length
                        ? `<ul>${amont.sort((a, b) => a.saut - b.saut).map(x => carte(x, "amont")).join("")}</ul>`
                        : '<p class="carto-vide">Aucune dépendance déclarée. Cet actif est un socle — ou personne ne l’a encore décrit.</p>'}
                </div>
                <div class="carto-fx-centre">
                    <div class="carto-fx-sujet">
                        <span class="carto-cdot" style="background:${CRIT_COLOR[centre.criticite] || "#ccc"}"></span>
                        <strong>${esc(centre.nom)}</strong>
                        <span class="carto-fx-type">${esc(centre.type || "")}</span>
                        ${spof.has(centre.id) ? '<span class="carto-mx-spof" title="Au moins deux processus critiques en dépendent">SPOF</span>' : ""}
                    </div>
                    ${procs.length ? `<p class="carto-fx-procs">Employé par ${procs.length} processus :
                        ${procs.map(p => esc(p.nom)).join(", ")}</p>` : ""}
                </div>
                <div class="carto-fx-col">
                    <h3>Ce qui dépend de lui <span>${aval.length}</span></h3>
                    ${aval.length
                        ? `<ul>${aval.sort((a, b) => a.saut - b.saut).map(x => carte(x, "aval")).join("")}</ul>`
                        : '<p class="carto-vide">Personne n’en dépend. Une panne n’en propagerait aucune autre.</p>'}
                </div>
            </div>`;
        hote.querySelectorAll(".carto-fx-btn").forEach(b =>
            b.addEventListener("click", () => selectNode(b.dataset.id)));
    }

    /* =========================================================================
       VUE « CHAÎNE D'IMPACT » — si ça tombe, qu'est-ce qui s'arrête, et QUAND

       ⚠️ **C'est la vue qui va en comité**, et elle n'existait pas : la
       propagation était BINAIRE — B tombe, donc A tombe —, ce qui ne dit rien de
       ce qu'on doit faire dans les deux premières heures.

       Le délai retenu pour un actif est le PLUS COURT de son chemin : si A tient
       une journée sans B, mais que B tombe immédiatement avec C, alors A tombe
       en une journée au plus tard — jamais plus tôt que le maillon le plus lent.

       ⚠️ **« Non renseigné » a sa colonne, et elle est la première à remplir.**
       Le ranger avec « immédiat » ferait paraître mesurée une chronologie que
       personne n'a établie (motif du constat Q-192) ; le taire le ferait
       disparaître de l'écran, et personne ne le renseignerait jamais.
    ========================================================================= */
    function renderChaine(model, spof) {
        const vm = visibleModel(model);
        lastLayout = null;
        const hote = document.getElementById("carto-svg-host");
        if (!hote) return;

        const centre = selected && vm.nodeById[selected] ? vm.nodeById[selected] : null;
        if (!centre) {
            hote.innerHTML = `
                <p class="carto-vide">Choisissez l’actif qui tombe — dans la liste ci-contre
                ou par la recherche — pour voir ce qui s’arrête, et quand.</p>
                <ul class="carto-focus-choix">
                    ${vm.assets.slice(0, 24).map(a =>
                        `<li><button type="button" class="carto-focus-btn" data-id="${esc(a.id)}">`
                        + `<span class="carto-cdot" style="background:${CRIT_COLOR[a.criticite] || "#ccc"}"></span>`
                        + `${esc(a.nom)}</button></li>`).join("")}
                </ul>`;
            hote.querySelectorAll(".carto-focus-btn").forEach(b =>
                b.addEventListener("click", () => selectNode(b.dataset.id)));
            return;
        }

        // Propagation en largeur, en retenant le PIRE délai du chemin.
        const rangDelai = (code) => {
            const d = DELAIS.find(x => x.code === code);
            return d ? d.rang : null;   // null = non renseigné
        };
        const atteints = new Map();   // id → { noeud, rang, inconnu }
        let front = [{ id: centre.id, rang: 0, inconnu: false }];
        const vus = new Set([centre.id]);
        let garde = 0;
        while (front.length && garde < 1000) {
            const suivant = [];
            front.forEach(courant => {
                vm.depEdges.forEach(e => {
                    if (e.t !== courant.id) return;
                    const dt = DEP_TYPES[e.type];
                    if (!dt || !dt.propagates) return;   // sauvegarde, redondance
                    const r = rangDelai(e.delai);
                    // Le chemin porte le délai le PLUS LONG de ses maillons : on
                    // n'attend pas moins que le maillon le plus lent.
                    const rang = r === null ? courant.rang : Math.max(courant.rang, r);
                    const inconnu = courant.inconnu || r === null;
                    const deja = atteints.get(e.f);
                    if (deja && deja.rang <= rang) return;
                    atteints.set(e.f, { noeud: vm.nodeById[e.f], rang, inconnu });
                    if (!vus.has(e.f)) { vus.add(e.f); suivant.push({ id: e.f, rang, inconnu }); }
                });
                vm.procEdges.forEach(e => {
                    if (e.t !== courant.id) return;
                    const deja = atteints.get(e.f);
                    if (deja && deja.rang <= courant.rang) return;
                    atteints.set(e.f, {
                        noeud: vm.nodeById[e.f], rang: courant.rang, inconnu: courant.inconnu
                    });
                });
            });
            front = suivant;
            garde += 1;
        }

        const colonnes = DELAIS.map(d => ({
            titre: d.libelle, aide: d.aide,
            items: [...atteints.values()].filter(x => x.noeud && !x.inconnu && x.rang === d.rang)
        }));
        const incertains = [...atteints.values()].filter(x => x.noeud && x.inconnu);

        const item = (x) => `<li>
            <span class="carto-cdot" style="background:${CRIT_COLOR[x.noeud.criticite] || (x.noeud.kind === "proc" ? "#7a5cc0" : "#ccc")}"></span>
            ${esc(x.noeud.nom)}${x.noeud.kind === "proc" ? ' <span class="carto-ch-proc">processus</span>' : ""}
        </li>`;

        hote.innerHTML = `
            <div class="carto-chaine">
                <p class="carto-ch-sujet">Si <strong>${esc(centre.nom)}</strong> tombe —
                ${atteints.size} élément(s) touché(s).
                ${atteints.size === 0 ? "Personne n’en dépend." : ""}</p>
                <div class="carto-ch-cols">
                    ${colonnes.map(c => `
                        <div class="carto-ch-col">
                            <h4 title="${esc(c.aide)}">${esc(c.titre)} <span>${c.items.length}</span></h4>
                            ${c.items.length ? `<ul>${c.items.map(item).join("")}</ul>`
                                             : '<p class="carto-vide">—</p>'}
                        </div>`).join("")}
                    <div class="carto-ch-col carto-ch-col--inconnu">
                        <h4 title="Le délai n’a pas été déclaré sur au moins un lien du chemin. Ce n’est pas « immédiat » : c’est inconnu, et c’est la première chose à renseigner.">Délai non renseigné <span>${incertains.length}</span></h4>
                        ${incertains.length ? `<ul>${incertains.map(item).join("")}</ul>`
                                            : '<p class="carto-vide">—</p>'}
                    </div>
                </div>
                ${incertains.length ? `<p class="carto-ch-note"><strong>${incertains.length}
                    élément(s)</strong> ne peuvent pas être datés : au moins un lien de leur
                    chemin ne porte pas de délai avant impact. Le produit ne le devine pas —
                    il se renseigne sur la fiche de l’actif source.</p>` : ""}
            </div>`;
    }

    /* =========================
       VUE PRINCIPALE
    ========================== */
    function render() {
        selected = null;
        filters = { types: new Set(ALL_TYPES), crits: new Set(ALL_CRITS), search: "", showProc: true, hideIsolated: false };
        injectStyles();

        const app = document.getElementById("app");
        const model = assemble();

        if (!model.assets.length) {
            app.innerHTML = `
                <section class="page">
                    <div class="dashboard-header"><h1>Cartographie du SI</h1></div>
                    <div class="dashboard-card" style="text-align:center; padding:40px;">
                        <p style="color:var(--text-muted); margin-bottom:16px;">Aucun actif déclaré : la cartographie a besoin d'actifs pour tracer les dépendances.</p>
                        <button type="button" id="carto-goto-actifs">Déclarer des actifs</button>
                    </div>
                </section>`;
            const versActifs = document.getElementById("carto-goto-actifs");
            if (versActifs) versActifs.addEventListener("click", () => Router.navigateTo("/actifs"));
            return;
        }
        const spof = computeSpof(model);

        const typeBtns = ALL_TYPES.map(t => `<button type="button" class="carto-fbtn" data-ftype="${esc(t)}" aria-pressed="true">${esc(t)}</button>`).join("");
        const critBtns = ALL_CRITS.map(c => `<button type="button" class="carto-fbtn" data-fcrit="${esc(c)}" aria-pressed="true"><span class="carto-cdot" style="background:${CRIT_COLOR[c]}"></span>${esc(c)}</button>`).join("");

        const legend = DEP_ORDER.map(tp => `<span class="carto-lg" title="${esc(DEP_TYPES[tp].aide || "")}"><svg class="carto-ln-svg" viewBox="0 0 34 8" aria-hidden="true"><line x1="1" y1="4" x2="33" y2="4" stroke="${DEP_COLOR}" stroke-width="2"${DEP_TYPES[tp].dash ? ` stroke-dasharray="${DEP_TYPES[tp].dash}"` : ""}/></svg>${esc(DEP_TYPES[tp].short)}${DEP_TYPES[tp].propagates ? "" : ' <span class="carto-nonprop" title="Ce lien ne propage PAS une panne de disponibilité.">ne propage pas</span>'}</span>`).join("")
            + `<span class="carto-lg"><span class="carto-ln" style="border-color:${USE_COLOR};border-style:dotted"></span>usage (processus ↔ actif)</span>`;

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Cartographie du SI &amp; dépendances ${Help.tip("Représente les actifs du système d'information et leurs dépendances typées. Cliquez sur un actif pour voir ce qui en dépend et l'impact d'une panne (propagation). Les dépendances s'éditent depuis la fiche de chaque actif.")}</h1>
                        <p class="sous-titre">Périmètre : <strong>Interne (SI global)</strong> — les dépendances s'ajoutent depuis la fiche de chaque actif.</p>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button type="button" id="carto-export-png" title="Télécharger la cartographie au format image PNG">Exporter en PNG</button>
                        <button type="button" id="carto-export-svg" style="background:var(--bg-body); color:var(--text-main); border:1px solid var(--border);" title="Télécharger au format vectoriel SVG">SVG</button>
                    </div>
                </div>

                <div class="carto-stats">
                    <div class="carto-stat"><div class="k">Actifs</div><div class="v" id="carto-stat-actifs">${model.assets.length}</div></div>
                    <div class="carto-stat"><div class="k">Processus métier</div><div class="v" id="carto-stat-proc">${model.procs.length}</div></div>
                    <div class="carto-stat"><div class="k">Dépendances</div><div class="v" id="carto-stat-liens">${model.depEdges.length}</div></div>
                    <div class="carto-stat alert"><div class="k">SPOF détectés ${Help.tip("Points de défaillance unique : actifs dont dépendent au moins deux processus critiques. À redonder en priorité.")}</div><div class="v" id="carto-stat-spof">${spof.size}</div></div>
                </div>

                <div class="carto-vues no-print" role="group" aria-label="Vue de la cartographie">
                    ${VUES.map(v => `<button type="button" class="carto-vue${v.code === vue ? " carto-vue--actif" : ""}" data-vue="${esc(v.code)}" title="${esc(v.aide)}"${v.code === vue ? ' aria-current="true"' : ""}>${esc(v.libelle)}</button>`).join("")}
                </div>

                <div class="carto-toolbar no-print">
                    <input type="search" id="carto-search" class="carto-input" placeholder="Rechercher un actif…" />
                    <div class="carto-fgroup" role="group" aria-label="Filtrer par type">${typeBtns}</div>
                    <div class="carto-fgroup" role="group" aria-label="Filtrer par criticité">${critBtns}</div>
                    <label class="carto-check"><input type="checkbox" id="carto-show-proc" checked> Processus</label>
                    <label class="carto-check"><input type="checkbox" id="carto-hide-isolated"> Masquer les isolés</label>
                </div>

                <div class="carto-grid">
                    <div class="dashboard-card carto-board">
                        <div id="carto-svg-host" class="carto-scroll"></div>
                        <div class="carto-legend">
                            ${legend}
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR.critique}"></span>critique</span>
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR["élevée"]}"></span>élevée</span>
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR["modérée"]}"></span>modérée</span>
                            <span class="carto-lg"><span class="carto-cdot" style="background:${CRIT_COLOR.faible}"></span>faible</span>
                        </div>
                    </div>
                    <div class="dashboard-card carto-panel" id="carto-panel"></div>
                </div>
            </section>`;

        wireToolbar();
        wireVues();
        dessiner(model, spof);
        renderPanel(model, spof);
    }

    /**
     * Dessine la vue courante dans l'hôte SVG.
     *
     * ⚠️ **Les trois vues neuves partagent l'hôte et le panneau latéral.** Leur
     * donner chacune son conteneur aurait fait quatre écrans qui se ressemblent,
     * et le sélecteur n'aurait plus rien sélectionné.
     */
    function dessiner(model, spof) {
        if (vue === "matrice") return renderMatrice(model, spof);
        if (vue === "focus") return renderFocus(model, spof);
        if (vue === "chaine") return renderChaine(model, spof);
        return renderGraph(model, spof);
    }

    function wireVues() {
        document.querySelectorAll(".carto-vue").forEach(b => {
            b.addEventListener("click", () => {
                // L'identifiant se lit dans l'attribut AU MOMENT DU CLIC.
                vue = b.dataset.vue;
                refresh();
                // La barre des vues n'est pas redessinée par `refresh()` : on la
                // remet à jour ici plutôt que de tout re-rendre, ce qui perdrait
                // les filtres et la sélection.
                document.querySelectorAll(".carto-vue").forEach(x => {
                    const actif = x.dataset.vue === vue;
                    x.classList.toggle("carto-vue--actif", actif);
                    if (actif) x.setAttribute("aria-current", "true");
                    else x.removeAttribute("aria-current");
                });
            });
        });
    }

    /* Branchement de la barre d'outils (une fois par rendu de la vue). */
    function wireToolbar() {
        const png = document.getElementById("carto-export-png");
        if (png) png.addEventListener("click", exportPNG);
        const svg = document.getElementById("carto-export-svg");
        if (svg) svg.addEventListener("click", exportSVG);
        const recherche = document.getElementById("carto-search");
        if (recherche) recherche.addEventListener("input", (e) => setSearch(e.target.value));
        const proc = document.getElementById("carto-show-proc");
        if (proc) proc.addEventListener("change", (e) => setShowProc(e.target.checked));
        const isoles = document.getElementById("carto-hide-isolated");
        if (isoles) isoles.addEventListener("change", (e) => setHideIsolated(e.target.checked));
        // Les filtres portent leur valeur en `data-` : elle est lue au clic, jamais
        // interpolée dans un attribut de gestionnaire.
        document.querySelectorAll("[data-ftype]").forEach(b =>
            b.addEventListener("click", () => toggleType(b.dataset.ftype)));
        document.querySelectorAll("[data-fcrit]").forEach(b =>
            b.addEventListener("click", () => toggleCrit(b.dataset.fcrit)));
    }

    function injectStyles() {
        if (document.getElementById("carto-styles")) return;
        const st = document.createElement("style");
        st.id = "carto-styles";
        st.textContent = `
        .carto-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 16px}
        .carto-stat{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 15px;box-shadow:var(--shadow)}
        .carto-stat .k{font-size: var(--text-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600}
        .carto-stat .v{font-size: var(--text-xl);font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
        .carto-stat.alert .v{color:var(--primary)}
        .carto-toolbar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:14px}
        .carto-input{padding:8px 12px;border:1px solid var(--border);border-radius:8px;font:inherit;min-width:200px;background:var(--bg-card);color:var(--text-main)}
        .carto-fgroup{display:inline-flex;flex-wrap:wrap;gap:6px}
        .carto-fbtn{font:inherit;font-size: var(--text-xs);font-weight:600;padding:5px 11px;border-radius:20px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:var(--transition)}
        .carto-fbtn[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
        .carto-cdot{width:9px;height:9px;border-radius:50%;display:inline-block}
        .carto-check{font-size: var(--text-sm);color:var(--text-main);display:inline-flex;align-items:center;gap:6px;cursor:pointer}
        .carto-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
        .carto-board{padding:10px}
        .carto-scroll{overflow:auto;max-height:74vh}
        svg.carto-graph{display:block;width:100%;height:auto;min-width:680px}
        .carto-legend{display:flex;flex-wrap:wrap;gap:12px 18px;padding:12px 8px 4px;border-top:1px solid var(--border);margin-top:8px;font-size: var(--text-xs);color:var(--text-muted)}
        .carto-lg{display:inline-flex;align-items:center;gap:7px}
        .carto-ln{width:24px;border-top:2.5px solid;border-radius:2px}
        /* Le TRAIT dit la nature du lien depuis le 22/09/2026 : huit pointillés
           différents, une seule couleur. Une légende de huit pastilles de la même
           teinte n'apprendrait rien. */
        .carto-ln-svg{width:34px;height:8px;flex:0 0 auto}
        /* ── Le sélecteur de vue ──────────────────────────────────────── */
        .carto-vues{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
        .carto-vue{background:var(--bg-card,#fff);color:var(--text-main,#1f2d3d);
                   border:1px solid var(--border,#e2e6ea);border-radius:999px;
                   padding:5px 14px;font-size:var(--text-sm,0.8125rem);font-weight:600;
                   cursor:pointer}
        .carto-vue:hover{background:var(--tint-info,#e8eff8)}
        .carto-vue--actif{background:var(--accent,#2059A6);color:#fff;
                          border-color:var(--accent,#2059A6)}
        .carto-vue:focus-visible{outline:2px solid var(--accent,#2059A6);outline-offset:2px}
        .carto-vide{color:var(--text-muted,#6b7a8d);font-style:italic;
                    font-size:var(--text-sm,0.8125rem);padding:14px 4px;margin:0}

        /* ── Vue MATRICE ──────────────────────────────────────────────── */
        .carto-mx-aide{font-size:var(--text-sm,0.8125rem);color:var(--text-muted,#6b7a8d);
                       margin:0 0 12px}
        .carto-matrice{font-size:var(--text-xs,0.75rem)}
        .carto-matrice th,.carto-matrice td{padding:3px 5px;text-align:center}
        .carto-matrice th.carto-mx-nom{text-align:left;white-space:nowrap;
                                       position:sticky;left:0;background:var(--bg-card,#fff);
                                       z-index:1;text-transform:none;letter-spacing:normal}
        .carto-mx-rang{display:inline-block;min-width:20px;color:var(--text-muted,#6b7a8d);
                       font-weight:700}
        .carto-mx-num{width:26px;color:var(--text-muted,#6b7a8d)}
        .carto-mx-diag{background:var(--bg-body,#f5f6f8)}
        .carto-mx-cell{background:var(--tint-info,#e8eff8);color:#1b4b8f;font-weight:700;
                       border-radius:3px}
        .carto-mx-cell--inerte{background:var(--tint-na,#eef1f5);
                               color:var(--text-muted,#6b7a8d);font-weight:400}
        .carto-mx-spof{display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;
                       font-size:var(--text-xs,0.75rem);font-weight:700;
                       background:var(--tint-crit,#fbe9e7);color:var(--color-danger,#c0392b)}

        /* ── Vue FOCUS ────────────────────────────────────────────────── */
        .carto-focus{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;
                     align-items:start}
        .carto-fx-col h3{font-size:var(--text-sm,0.8125rem);text-transform:uppercase;
                         letter-spacing:0.05em;color:var(--text-muted,#6b7a8d);margin:0 0 8px}
        .carto-fx-col h3 span{font-weight:400}
        .carto-fx-col ul{list-style:none;padding:0;margin:0}
        .carto-fx-item{display:flex;flex-direction:column;gap:2px;padding:6px 0;
                       border-bottom:1px solid var(--border,#e2e6ea)}
        .carto-fx-indirect{opacity:0.75}
        .carto-fx-btn{display:flex;align-items:center;gap:7px;background:none;border:none;
                      padding:0;cursor:pointer;font:inherit;font-weight:600;text-align:left;
                      color:var(--text-main,#1f2d3d)}
        .carto-fx-btn:hover .carto-fx-nom{text-decoration:underline}
        .carto-fx-lien{font-size:var(--text-xs,0.75rem);color:var(--text-muted,#6b7a8d);
                       padding-left:19px}
        .carto-fx-saut{font-style:italic}
        .carto-fx-centre{min-width:190px;text-align:center;padding-top:26px}
        .carto-fx-sujet{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;
                        justify-content:center;background:var(--tint-info,#e8eff8);
                        border:2px solid var(--accent,#2059A6);border-radius:var(--radius,8px);
                        padding:10px 16px}
        .carto-fx-type{font-size:var(--text-xs,0.75rem);color:var(--text-muted,#6b7a8d)}
        .carto-fx-procs{font-size:var(--text-xs,0.75rem);color:var(--text-muted,#6b7a8d);
                        margin:8px 0 0}
        .carto-focus-choix{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;
                           gap:6px}
        .carto-focus-btn{display:inline-flex;align-items:center;gap:6px;
                         background:var(--bg-card,#fff);border:1px solid var(--border,#e2e6ea);
                         border-radius:999px;padding:4px 12px;cursor:pointer;font:inherit;
                         font-size:var(--text-sm,0.8125rem)}
        .carto-focus-btn:hover{background:var(--tint-info,#e8eff8)}

        /* ── Vue CHAÎNE D'IMPACT ──────────────────────────────────────── */
        .carto-chaine{min-width:0}
        .carto-ch-sujet{font-size:var(--text-base,0.9375rem);margin:0 0 12px}
        .carto-ch-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));
                       gap:12px}
        .carto-ch-col{border:1px solid var(--border,#e2e6ea);border-radius:var(--radius,8px);
                      padding:10px 12px;min-width:0}
        .carto-ch-col h4{margin:0 0 8px;font-size:var(--text-xs,0.75rem);text-transform:uppercase;
                         letter-spacing:0.05em;color:var(--text-muted,#6b7a8d)}
        .carto-ch-col h4 span{float:right;font-weight:700;color:var(--text-main,#1f2d3d)}
        .carto-ch-col ul{list-style:none;padding:0;margin:0;font-size:var(--text-sm,0.8125rem)}
        .carto-ch-col li{display:flex;align-items:center;gap:7px;padding:3px 0}
        /* ⚠️ Teinte d'ALERTE et non de statut : un impact qu'on ne sait pas dater est
           la première chose à renseigner, et il doit se voir. */
        .carto-ch-col--inconnu{border-color:var(--primary,#E9631B);
                               background:var(--primary-tint,#FDEFE4)}
        .carto-ch-proc{font-size:var(--text-xs,0.75rem);color:var(--text-muted,#6b7a8d)}
        .carto-ch-note{margin:12px 0 0;font-size:var(--text-sm,0.8125rem);
                       color:var(--text-muted,#6b7a8d)}

        @media (max-width:900px){
            .carto-focus{grid-template-columns:1fr}
            .carto-fx-centre{padding-top:0}
        }
        .carto-nonprop{font-size:var(--text-xs,0.75rem);color:var(--text-muted,#6b7a8d);
                       background:var(--tint-na,#eef1f5);border-radius:999px;padding:0 6px}
        .carto-panel{padding:18px;position:sticky;top:12px}
        .carto-panel h2{font-size: var(--text-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:0 0 12px;font-weight:700}
        .carto-empty{color:var(--text-muted);font-size: var(--text-sm);line-height:1.55}
        .carto-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
        .carto-name{font-size: var(--text-md);font-weight:700;color:var(--text-main)}
        .carto-pill{font-size: var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:3px 9px;border-radius:20px;color:#fff}
        .carto-tag{font-size: var(--text-xs);color:var(--text-muted);background:var(--bg-body);border:1px solid var(--border);padding:2px 8px;border-radius:6px;font-weight:600}
        .carto-sect{margin-top:15px;padding-top:13px;border-top:1px dashed var(--border)}
        .carto-lbl{font-size: var(--text-xs);text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:700;margin-bottom:8px}
        .carto-impact{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .carto-impact .box{background:var(--bg-body);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
        .carto-impact .n{font-size: var(--text-xl);font-weight:700;font-variant-numeric:tabular-nums;line-height:1;color:var(--text-main)}
        .carto-impact .c{font-size: var(--text-xs);color:var(--text-muted);margin-top:4px;line-height:1.25}
        .carto-spofbox{margin-top:14px;background:var(--primary-tint);border:1px solid var(--primary);border-radius:10px;padding:11px 13px;font-size: var(--text-sm);line-height:1.45;color:var(--text-main)}
        .carto-spofbox strong{color:var(--primary)}
        .carto-list{list-style:none;padding:0;margin:0;font-size: var(--text-sm);line-height:1.5}
        .carto-list li{padding:3px 0;color:var(--text-main)}
        .carto-list a{color:var(--accent);text-decoration:none}
        .carto-list a:hover{text-decoration:underline}
        .carto-muted{color:var(--text-muted);font-style:italic}
        .carto-crit-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--color-danger);margin-left:2px}
        .carto-actions{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}
        .carto-btn-primary{font:inherit;font-size: var(--text-sm);font-weight:600;padding:8px 13px;border-radius:8px;border:0;background:var(--primary);color:#fff;cursor:pointer}
        .carto-btn-ghost{font:inherit;font-size: var(--text-sm);font-weight:600;padding:8px 13px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-main);cursor:pointer}
        /* SVG */
        .carto-graph .carto-node{cursor:pointer}
        .carto-graph .carto-card{fill:var(--bg-card);stroke:var(--border);stroke-width:1.3}
        .carto-graph .carto-node.is-proc .carto-card{fill:#eef4fb}
        .carto-graph .carto-node:hover .carto-card{stroke:var(--accent)}
        .carto-graph .carto-node:focus-visible{outline:none}
        .carto-graph .carto-node:focus-visible .carto-card{stroke:var(--accent);stroke-width:2.4}
        .carto-graph .carto-nlabel{fill:var(--text-main);font-size: var(--text-xs);font-weight:600}
        .carto-graph .carto-nsub{fill:var(--text-muted);font-size: var(--text-xs);font-weight:600}
        .carto-graph .carto-axis{fill:var(--text-muted);font-size: var(--text-xs);font-weight:700;letter-spacing:.12em}
        .carto-graph .carto-edge{transition:opacity .2s}
        .carto-graph .carto-spof-ring{fill:none;stroke:var(--primary);stroke-width:1.6;stroke-dasharray:4 3;display:none}
        .carto-graph .carto-spof-badge{display:none;font-size: var(--text-xs);font-weight:800;fill:var(--primary);letter-spacing:.05em}
        .carto-graph .carto-node[data-spof="1"] .carto-spof-ring{display:block}
        .carto-graph .carto-node[data-spof="1"] .carto-spof-badge{display:block}
        .carto-graph .carto-node.is-selected .carto-card{stroke:var(--primary);stroke-width:2.6}
        .carto-graph.has-sel .carto-node.is-dim{opacity:.22}
        .carto-graph.has-sel .carto-edge.is-dim{opacity:.08}
        .carto-graph.has-sel .carto-edge.is-hl{stroke-width:3}
        @media (max-width:900px){ .carto-grid{grid-template-columns:1fr} .carto-stats{grid-template-columns:repeat(2,1fr)} .carto-panel{position:static} }
        `;
        document.head.appendChild(st);
    }

    return {
        render, selectNode, clearSelection, exportPNG, exportSVG,
        toggleType, toggleCrit, setShowProc, setHideIsolated, setSearch,
        // Exposés pour la fiche Actif (édition des dépendances) :
        depTypes: () => DEP_TYPES, depOrder: () => DEP_ORDER.slice(),
        delais: () => DELAIS.slice(), degrades: () => DEGRADES.slice(),
        naturesTiers: () => NATURES_TIERS.slice(),
        libelleDelai: (c) => (DELAI_PAR_CODE[c] || {}).libelle || "",
        libelleDegrade: (c) => (DEGRADE_PAR_CODE[c] || {}).libelle || ""
    };
})();
