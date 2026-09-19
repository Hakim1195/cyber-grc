// Emplacement : js/data/referentiels.js
// Nom du fichier : referentiels.js
//
// Registre des RÉFÉRENTIELS de sécurité.
//
// ⚠️ **LE CATALOGUE N'EST PLUS STATIQUE — lot L26, action 26.1.** Il vivait dans six
// fichiers `js/data/ref_*.js` publiés dans la racine web, qui s'auto-enregistraient
// ici au chargement de la page. Il vit désormais EN BASE (`referentiels`,
// `referentiel_domaines`, `referentiel_exigences`, `referentiel_traductions`) et
// arrive au navigateur dans le jeu de données de la filiale, comme le reste.
//
// **Ce fichier n'a pas changé d'interface : il a changé de source.** `get()`, `all()`,
// `flatExigences()` et `couverture()` sont intacts, et aucun des modules qui les
// appellent n'a à le savoir — c'est le principe qui a permis de basculer vingt-six
// modules sans en réécrire un seul au lot L2. Ce qui est neuf est `hydrater()`, en bas.
//
// Les fichiers source subsistent dans `backend/db/catalogues/`, hors de la racine web :
// ils sont la SOURCE du semis de la migration `051` et l'ÉTALON que le banc compare à
// la base, exigence par exigence. Les auto-évaluations de l'utilisateur vivent, elles,
// dans DataStore (`evaluations`, clé ref_id + code).
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
    /**
     * Champs de PROSE d'un référentiel — **découverts, jamais listés**.
     *
     * ⚠️ **Constat Q-263 de la porte S7.** `traduire()` recopiait six champs
     * nommés et `couverture()` en comptait quatre, écrits à la main **à deux
     * endroits qui devaient rester d'accord**. L'omission a eu lieu : le champ
     * `noteNumerotation` de `ref_anssi.js` — 295 signes de prose française
     * expliquant le décalage de numérotation du guide, ajouté APRÈS L11 —
     * n'était ni traduit, ni compté, et l'instrument annonçait pourtant
     * `anssi-hygiene 118/118 (100 %)`. Le défaut était **latent** parce que rien
     * ne l'affiche encore ; le jour où on l'affiche, il sort en français sur
     * l'écran anglais **sans qu'aucun compteur ne bouge**.
     *
     * C'est le premier cas du `CLAUDE.md` §3 — *une omission qui fait réussir
     * quelque chose en silence alors que c'est faux* —, donc la liste est le
     * mauvais outil : on **parcourt** les champs du référentiel.
     *
     * ⚠️ **Ce qui reste écrit à la main est l'INVERSE, et c'est ce qui le rend
     * sûr** : la liste des champs qu'on ne traduit PAS. Si elle devient
     * incomplète, un champ non traduisible devient traduisible — le dictionnaire
     * n'en porte alors aucune entrée, la valeur d'origine est rendue telle
     * quelle, et **rien ne casse**. L'omission échoue du bon côté.
     */
    const CHAMPS_NON_TRADUISIBLES = Object.freeze([
        // Identifiants et réglages : jamais de la prose.
        "id", "scoring", "domaines", "clLabels",
        // ⚠️ `editeur` est TRADUISIBLE mais HORS COUVERTURE, et la distinction
        // n'est pas un détail : « ANSSI », « ISO/IEC », « BoostAerospace » sont
        // des noms propres qui se lisent à l'identique partout. Le compter
        // ferait réclamer par l'instrument une traduction qui ne doit pas
        // exister — et un instrument qui réclame du faux finit par être ignoré.
        "editeur"
    ]);

    /** Les clés de prose de ce référentiel, telles qu'il les porte réellement. */
    function champsProse(ref) {
        return Object.keys(ref || {}).filter(cle =>
            typeof ref[cle] === "string" && CHAMPS_NON_TRADUISIBLES.indexOf(cle) === -1);
    }

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
        // Tous les champs de prose que ce référentiel porte, `editeur` compris —
        // il est traduisible, il n'est simplement pas COMPTÉ (voir ci-dessus).
        const traduits = {};
        champsProse(ref).forEach(cle => { traduits[cle] = pris(dico[cle], ref[cle]); });
        if (typeof ref.editeur === "string") traduits.editeur = pris(dico.editeur, ref.editeur);
        return Object.assign({}, ref, traduits, {
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
            // ⚠️ Les champs de niveau référentiel sont DÉCOUVERTS, plus comptés
            // en dur (constat Q-263) : un champ de prose ajouté demain entre
            // dans le total le jour où il est ajouté, et le pourcentage baisse
            // au lieu de rester flatteusement à 100 %.
            const prose = champsProse(ref);
            let total = prose.length;
            let faits = 0;
            const compte = (traduit) => { if (typeof traduit === "string" && traduit !== "") faits += 1; };
            if (dico) prose.forEach(cle => compte(dico[cle]));
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


    /* =====================================================================
       L'HYDRATATION DEPUIS LA BASE — lot L26, action 26.1
       =====================================================================

       ⚠️ **CE REGISTRE NE CHANGE PAS D'INTERFACE ; IL CHANGE DE SOURCE.**

       Jusqu'ici, six fichiers `js/data/ref_*.js` s'auto-enregistraient au
       chargement de la page par un `<script>`. Ils vivent désormais en base —
       `referentiels`, `referentiel_domaines`, `referentiel_exigences`,
       `referentiel_traductions` — et arrivent au navigateur comme tout le reste,
       dans le jeu de données de la filiale.

       C'est exactement le principe qui a permis de basculer vingt-six modules
       sans en réécrire un seul au lot L2 : **la façade est préservée, seule la
       couche qui l'alimente bouge**. `get()`, `all()`, `flatExigences()` et
       `couverture()` ne sont pas touchés, et aucun des huit modules qui les
       appellent n'a à le savoir.

       ── Pourquoi ce n'est pas un chargement de plus au démarrage ───────────

       Les catalogues pèsent 165 Kio de JSON — moins que les six fichiers qu'ils
       remplacent, qui portaient en plus leurs commentaires. Ils voyagent dans le
       jeu de données déjà chargé, donc sans requête supplémentaire, et ils sont
       compressés par le frontal comme le reste.

       ── ⚠️ Ce que l'hydratation NE FILTRE PAS, et pourquoi ─────────────────

       Un référentiel **archivé** (action 26.3) est hydraté comme les autres.
       C'est délibéré : ses auto-évaluations existent toujours, et une fiche qui
       afficherait « iso-27002-2022 » au lieu du titre de la norme serait pire
       qu'un référentiel de trop dans une liste. C'est `all()` qui décide ce
       qu'on PROPOSE ; `get()`, lui, doit savoir rendre ce qui a existé.
    ===================================================================== */

    /**
     * Reconstruit le registre depuis les collections servies par le serveur.
     *
     * ⚠️ **Idempotente, et c'est nécessaire** : elle est rappelée après chaque
     * rechargement du jeu de données (changement de filiale, reprise, sondage qui
     * rapporte une modification). Une seconde exécution doit rendre le même
     * registre, pas un registre à deux exemplaires — d'où la remise à zéro.
     */
    function hydrater(collections) {
        if (!collections) return 0;
        const refs = Array.isArray(collections.referentiels) ? collections.referentiels : [];
        const domaines = Array.isArray(collections.referentiel_domaines)
            ? collections.referentiel_domaines : [];
        const exigences = Array.isArray(collections.referentiel_exigences)
            ? collections.referentiel_exigences : [];
        const dicos = Array.isArray(collections.referentiel_traductions)
            ? collections.referentiel_traductions : [];

        // ⚠️ **Rien n'est hydraté tant que la base ne sert rien.** Une base antérieure à
        // la migration `051` rend des collections vides : on laisse alors le registre
        // tel quel plutôt que de le VIDER. Un écran de conformité sans aucun
        // référentiel n'afficherait ni erreur ni contenu — il aurait simplement l'air
        // de dire « vous n'avez rien à évaluer », ce qui est faux et rassurant.
        if (refs.length === 0) return 0;

        order.length = 0;
        Object.keys(registry).forEach(k => { delete registry[k]; });
        Object.keys(traductions).forEach(k => { delete traductions[k]; });

        // Les exigences, rangées sous leur domaine, dans l'ordre du catalogue.
        const parDomaine = {};
        exigences.slice()
            .sort((a, b) => (Number(a.rang) || 0) - (Number(b.rang) || 0))
            .forEach(e => {
                if (!parDomaine[e.domaine_id]) parDomaine[e.domaine_id] = [];
                const ex = { code: e.code, titre: e.titre };
                // ⚠️ Les champs facultatifs ne sont posés QUE s'ils valent quelque chose.
                // Poser « niveau: null » partout ferait croire au radar par niveau de
                // label que toutes les questions en portent un, et le filtre Bronze /
                // Argent / Or rendrait des listes vides sans rien dire.
                if (e.aide) ex.aide = e.aide;
                if (e.niveau) ex.niveau = e.niveau;
                if (e.priorite) ex.priorite = e.priorite;
                if (e.cl) ex.cl = e.cl;
                parDomaine[e.domaine_id].push(ex);
            });

        // Les domaines, rangés sous leur référentiel, dans l'ordre du catalogue.
        const parReferentiel = {};
        domaines.slice()
            .sort((a, b) => (Number(a.rang) || 0) - (Number(b.rang) || 0))
            .forEach(d => {
                if (!parReferentiel[d.referentiel_id]) parReferentiel[d.referentiel_id] = [];
                const dom = { id: d.code, nom: d.nom, exigences: parDomaine[d.id] || [] };
                if (d.court) dom.court = d.court;
                if (d.aide) dom.aide = d.aide;
                parReferentiel[d.referentiel_id].push(dom);
            });

        refs.slice()
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .forEach(r => {
                const ref = {
                    id: r.id,
                    nom: r.nom,
                    editeur: r.editeur || "",
                    version: r.version || "",
                    description: r.description || "",
                    aide: r.aide || "",
                    domaines: parReferentiel[r.id] || []
                };
                // `scoring` n'est posé que lorsqu'il diffère du défaut : `computeScores`
                // teste `ref.scoring === "conformite"`, et le reste du produit teste
                // l'absence. Poser « maturite » partout serait exact et sans effet ;
                // le poser serait aussi une occasion de plus de diverger.
                if (r.scoring && r.scoring !== "maturite") ref.scoring = r.scoring;
                if (r.note_numerotation) ref.noteNumerotation = r.note_numerotation;
                if (r.codes_officiels) ref.codesOfficiels = r.codes_officiels;
                // ⚠️ `clLabels` ACTIVE le radar par domaine de classification
                // (`computeClAxes`). Le poser à un objet vide changerait le dessin du
                // radar de tous les référentiels qui n'en ont pas.
                if (r.cl_labels && Object.keys(r.cl_labels).length > 0) ref.clLabels = r.cl_labels;
                // Métadonnées du lot L26 : l'état de version (26.3) et la veille (26.5).
                // Elles ne servent pas à l'affichage des exigences, et l'écran des
                // référentiels les lit sur l'enregistrement, pas ici.
                ref.statut = r.statut || "en_vigueur";
                register(ref);
            });

        dicos.forEach(d => {
            if (d && d.referentiel_id && d.langue && d.dictionnaire) {
                registerTraduction(d.referentiel_id, d.langue, d.dictionnaire);
            }
        });

        return order.length;
    }

    return { register, registerTraduction, hydrater, couverture, get, all, countExigences, flatExigences, findExigence };
})();
