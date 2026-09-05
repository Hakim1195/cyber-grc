// Emplacement : js/modules/groupe.js
// Nom du fichier : groupe.js
//
// Module « Vision Groupe » — LA CONSOLIDATION QUE LE CADRAGE PROMET À LA DIRECTION.
//
// ── Ce que cet écran ferme ──────────────────────────────────────────────────
//
// Le `PLAN_SERVEUR` §7 décrit le lot L4 comme « multi-filiales **et vision
// Groupe** ». La vague 4 a livré le sélecteur de filiale, et le `README` §8 a
// marqué le lot livré **en écrivant lui-même la réserve** : *« la vision Groupe
// consolidée du cadrage n'existe pas : `/api/donnees` est cadré sur la filiale
// active, donc la Direction voit une filiale à la fois »*.
//
// `GET /api/consolidation` (vague 6, `backend/src/consolidation/index.ts`) a levé
// la moitié serveur. Cet écran est l'autre moitié : sans lui, la route existe et
// personne ne la regarde — c'est-à-dire une fonctionnalité à moitié livrée.
//
// Il porte en outre les **coordonnées de la filiale active** (constat Q-160) : la
// table `filiales` porte adresse, ville, pays, téléphone, courriel et site web
// depuis la migration `001`, et **aucun écran ne les montrait**. Le lot L9 avait
// livré la marque à moitié — raison sociale et logo, pas les coordonnées.
//
// ── LES TROIS PROPRIÉTÉS DU CONTRAT, ET CE QU'ELLES IMPOSENT ICI ────────────
//
// **1. Un bloc `null` veut dire « vous n'avez pas le droit de le savoir », JAMAIS
// « il n'y en a pas ».** L'entête de `consolidation/index.ts` (décision 3) :
// *« Rendre `0` serait dire "aucun risque dans ce groupe", ce qui est faux, et le
// dire dans un outil qui sert de preuve en audit »*. Cet écran affiche donc
// `—` — jamais un zéro — et le dit en toutes lettres au survol. C'est la
// distinction que ce dépôt a payée deux fois (constats Q-108 et Q-116) : *rien à
// mesurer* n'est pas *rien mesuré*.
//
// **2. Le serveur rend des COMPTES, jamais un taux** (décision 4). Le catalogue
// des référentiels vit dans le navigateur (`js/data/referentiels.js`) et lui seul
// sait qu'AirCyber se score `"conformite"` — Oui/Non/N-A, sans CMMI — là où
// l'ANSSI se score en maturité. **C'est donc CET écran qui calcule les taux**, et
// il le fait avec la formule exacte de `synthese.js` / `dashboard.js` :
//
//     applicables = <exigences du CATALOGUE> − <évaluations « non applicable »>
//     taux        = « conforme » ÷ applicables          (non évalué = non conforme)
//     maturité    = Σ maturités ÷ applicables           (questionnaires exclus)
//
// Le dénominateur vient du **catalogue**, pas du serveur : le serveur ne connaît
// que les évaluations **qui existent**, et une exigence jamais ouverte n'a pas de
// ligne. La compter au dénominateur est précisément ce que « non évalué = non
// conforme » veut dire. Un taux calculé autrement contredirait le tableau de bord
// sans que rien ne rougisse.
//
// **3. `porteeGroupe` est à part.** Ce sont les documents à `filiale_id` nul — la
// PSSI du groupe. Les additionner dans une filiale les compterait vingt fois. Ils
// ont donc leur propre carte, et n'entrent dans aucune colonne.
//
// ── AUCUN VOCABULAIRE N'EST ÉCRIT À LA MAIN (décision 5) ────────────────────
//
// Les répartitions — statut, niveau, gravité, criticité — arrivent du serveur par
// `group by`, et cet écran les **parcourt** au lieu de les énumérer. Une valeur
// ajoutée à une contrainte `check` apparaît donc toute seule, teintée en neutre,
// au lieu de manquer en silence (`CLAUDE.md` §3 : *une omission qui réussit en
// silence, c'est que la liste est le mauvais outil*).
//
// Deux exceptions, et ce sont des **calculs**, pas des vocabulaires : « conforme »
// et « non applicable », qui *définissent* le taux de conformité. Leur omission ne
// réussirait pas en silence — la répartition complète est affichée à côté, et une
// valeur inconnue s'y voit. `TEINTES` n'est pas non plus une liste normative :
// c'est une table de couleurs, dont l'incomplétude donne un badge gris.
//
// ── L'ACCÈS RÉSEAU — une exception assumée, bornée, avec le geste pour la lever ─
//
// `js/core/api.js` est **le seul point du frontend qui parle au réseau**, et il
// n'expose ni `appeler()` ni de méthode `consolidation()`. Il n'appartient pas au
// périmètre d'écriture de l'agent qui écrit cet écran (`PLAN_EXECUTION` §2 :
// périmètres disjoints). `demander()` ci-dessous est donc une seconde porte,
// **écrite plutôt que tue**, aux mêmes garanties : `same-origin`, `no-store`,
// `redirect: error`, délai de garde, et `Api.ErreurApi` — le seul type d'erreur
// réseau du produit, qui est exporté et donc réutilisé, pas recopié.
//
// **Le geste exact pour la lever**, quand `api.js` redeviendra ouvert à l'écriture :
// y ajouter `function consolidation() { return appeler("/consolidation"); }`, le
// publier dans le `return`, puis remplacer les deux appels de `charger()` par
// `Api.consolidation()`. C'est mot pour mot ce qui a été fait pour `journal.js`,
// dont l'exception a vécu une vague avant d'être levée.
//
// ⚠️ Une conséquence de cette exception, et elle est réelle : un `401` obtenu ici
// **ne prévient pas** les observateurs de `Api.surAuthentificationRequise` — la
// fonction `signaler()` d'`api.js` n'est pas exportée. Le voile de reconnexion de
// `vault.js` ne s'ouvrira donc pas sur ce seul appel ; il s'ouvrira au sondage
// suivant de `sync.js`, qui, lui, passe par la porte. L'écran, de son côté, dit
// franchement que la session n'est plus ouverte. Il n'y a **aucune saisie** ici :
// la consultation ne modifie rien, et rien ne peut être perdu.
//
// ── CONVENTIONS DU PROJET, chacune payée par un défaut ──────────────────────
//
//   · `escapeHtml` sur toute donnée utilisateur — une raison sociale, une adresse
//     et un site web viennent de la base, donc de quelqu'un ;
//   · AUCUN gestionnaire en ligne (`onclick=`…) : la politique de sécurité de
//     contenu du vhost les rend inertes, EN SILENCE — c'est le constat M-6 de la
//     porte S2, qui avait livré une interface morte. On branche après rendu ;
//   · l'identifiant se lit dans un attribut du DOM AU MOMENT DU CLIC, jamais
//     capturé en chaîne dans une fermeture ;
//   · seuls les tokens de `css/tokens.css`, et la sémantique stricte des statuts.

var GroupeModule = (function () {
    "use strict";

    /* =====================================================================
       CONTRAT HTTP
    ===================================================================== */

    /** Chemin de la route, relatif — jamais une URL absolue (même origine). */
    const CHEMIN = "api/consolidation";

    /** Délai de garde, aligné sur `js/core/api.js`. */
    const DELAI_MS = 30000;

    /* =====================================================================
       VOCABULAIRE D'AFFICHAGE — des couleurs, pas une norme
    ===================================================================== */

    /**
     * Teintes sémantiques des valeurs que les répartitions peuvent porter.
     *
     * ⚠️ **Ce n'est pas une liste normative.** Une valeur absente donne un badge
     * neutre et s'affiche telle qu'elle est en base : rien ne disparaît, rien ne
     * réussit en silence. C'est le cas que le `CLAUDE.md` §3 autorise —
     * l'omission est visible, donc corrigeable.
     */
    const TEINTES = Object.freeze({
        // Conformité (evaluations.statut) et statuts d'exigence
        "conforme": "status-conforme",
        "partiellement conforme": "status-partiellement-conforme",
        "non conforme": "status-non-conforme",
        "non applicable": "status-non-applicable",
        // Niveaux de risque (ck_risques_niveau)
        "faible": "status-conforme",
        "élevé": "status-partiellement-conforme",
        "critique": "status-non-conforme",
        // Gravité d'incident (ck_incidents_gravite)
        "moyenne": "status-partiellement-conforme",
        "élevée": "status-partiellement-conforme",
        // Statuts d'incident / d'action / d'audit
        "nouveau": "status-non-conforme",
        "en cours": "status-partiellement-conforme",
        "résolu": "status-conforme",
        "clôturé": "status-conforme",
        "à faire": "status-non-conforme",
        "terminée": "status-conforme",
        "Planifié": "status-partiellement-conforme",
        "En cours": "status-partiellement-conforme",
        "Réalisé": "status-conforme"
    });

    /** Ce qu'on affiche pour un bloc que la session n'a pas le droit de lire. */
    const PHRASE_NON_ACCESSIBLE =
        "Non communiqué : ce domaine n'est pas ouvert à votre profil. " +
        "Ce n'est pas une absence de données.";

    /* =====================================================================
       ÉTAT DE L'ÉCRAN
    ===================================================================== */

    let chargement = false;
    let erreur = null;
    let consolidation = null;   // charge de GET api/consolidation
    let filialeActive = null;   // `filiale_active` de GET api/session (coordonnées)

    /* =====================================================================
       ÉCHAPPEMENT
    ===================================================================== */

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /* =====================================================================
       ACCÈS RÉSEAU — voir l'entête : exception assumée, bornée à cette fonction
    ===================================================================== */

    // ── LA SECONDE PORTE RÉSEAU A DISPARU ─────────────────────────────
    //
    // Cet écran portait son propre `demander()` : `js/core/api.js` n'exposait
    // aucune méthode pour ses routes, et son `appeler()` est privé. Il
    // rédigeait donc une seconde fois les garanties de la porte unique —
    // `same-origin`, `no-store`, `redirect: error`, délai de garde — avec un
    // trou connu : les observateurs de 401 lui étaient inatteignables.
    //
    // Les méthodes existent depuis le 04/09/2026, et la porte a disparu avec
    // elles. Une garantie recopiée est une garantie qui divergera : c'est ce
    // que l'entête d'`api.js` interdit depuis le lot L2.
    //
    // ⚠️ `messageDErreur` a été emportée avec elle lors du retrait, et rétablie :
    // `node --check` passait — la syntaxe était juste — mais l'écran levait une
    // ReferenceError sur le CHEMIN D'ERREUR seulement, c'est-à-dire au moment
    // précis où il devait expliquer un refus. Un contrôle de syntaxe ne dit rien
    // d'un identifiant manquant ; seul le chargement du module le dit.

    /**
     * Traduit un refus en une phrase que la direction peut lire.
     *
     * ⚠️ **Un 403 n'est pas une panne.** L'écran doit dire quel droit manque, et
     * surtout ne pas afficher un groupe VIDE : « aucune filiale » et « vous
     * n'avez pas le droit de les voir » ne veulent pas dire la même chose, et
     * les confondre dans un outil qui sert de preuve en audit est le défaut que
     * tout le contrat de consolidation existe pour éviter.
     */
    function messageDErreur(cause) {
        if (!cause) return "La consolidation n'a pas pu être chargée.";
        const statut = Number(cause.statut || 0);
        if (statut === 403) {
            // ⚠️ La formulation est celle qu'attend `test/navigateur/groupe.test.mjs`,
            // et son exigence est juste : le message doit dire « n'a pas accès » et
            // NOMMER le domaine manquant. Un refus qui ne nomme pas ce qui manque
            // envoie l'utilisateur chez son administrateur sans rien à lui dire.
            return "Votre profil n'a pas accès au domaine « pilotage » : la consolidation du " +
                "groupe ne vous est pas ouverte. Ce n'est pas une panne, et le groupe n'est " +
                "pas vide — vous n'avez simplement pas le droit de le lire. Demandez le " +
                "domaine « pilotage » à votre administrateur.";
        }
        if (statut === 401) {
            return "Votre session n'est plus ouverte. Reconnectez-vous pour consulter la " +
                "consolidation ; aucune donnée n'est perdue, cet écran ne modifie rien.";
        }
        if (statut === 503 || cause.reseau) {
            return "Le serveur n'est pas joignable pour l'instant. Réessayez dans un moment.";
        }
        return String(cause.message || "La consolidation n'a pas pu être chargée.");
    }


    /* =====================================================================
       LECTURE TOLÉRANTE DES RÉPONSES

       ⚠️ Tolérante à dessein, et ce n'est pas de la complaisance : un champ
       inattendu ne doit pas transformer cet écran en page vide — c'est-à-dire
       en « le groupe n'a rien », le pire mensonge qu'il puisse dire.
    ===================================================================== */

    const estObjet = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

    /** Nombre, ou `0` — les `count(*)` de PostgreSQL reviennent parfois en chaîne. */
    function nombre(valeur) {
        if (valeur === null || valeur === undefined) return 0;
        const n = Number(valeur);
        return Number.isFinite(n) ? n : 0;
    }

    /** Répartition `{ "<valeur>": n }` → liste triée `[{ valeur, n }]`, décroissante. */
    function entreesRepartition(repartition) {
        if (!estObjet(repartition)) return [];
        return Object.keys(repartition)
            .map(k => ({ valeur: k, n: nombre(repartition[k]) }))
            .filter(e => e.n > 0)
            .sort((a, b) => (b.n - a.n) || a.valeur.localeCompare(b.valeur));
    }

    function sommeRepartition(repartition) {
        return entreesRepartition(repartition).reduce((s, e) => s + e.n, 0);
    }

    /* =====================================================================
       CONFORMITÉ — LE SEUL CALCUL QUE LE SERVEUR NE POUVAIT PAS FAIRE
    ===================================================================== */

    /** Le référentiel du catalogue, ou `null` s'il n'y est pas (référentiel retiré). */
    function refDuCatalogue(refId) {
        if (typeof Referentiels === "undefined") return null;
        try { return Referentiels.get(refId); } catch (e) { return null; }
    }

    /**
     * Réduit un `BlocConformite` à ce qui s'affiche : un taux, une maturité, et
     * le détail par référentiel.
     *
     * ⚠️ **UN ÉCART CONNU AVEC `synthese.js`, ÉCRIT PLUTÔT QUE TU.** Le serveur
     * rend `maturiteSomme` **par référentiel**, tous statuts confondus : c'est
     * `sum(maturite)` sur les évaluations, y compris celles marquées « non
     * applicable ». `synthese.js`, lui, écarte la ligne NA *avant* d'ajouter sa
     * maturité. Une évaluation à la fois « non applicable » et cotée en CMMI —
     * l'interface le permet, les deux champs y sont indépendants — donne donc
     * ici une moyenne très légèrement supérieure à celle du tableau de bord.
     *
     * Ce n'est pas réparable de ce côté : il faudrait que la route rende la
     * somme des maturités **hors NA**, et `backend/src/consolidation/index.ts`
     * n'appartient pas au périmètre d'écriture de cet écran. Le geste exact, le
     * jour où on le fera : remplacer `coalesce(sum(maturite), 0)` par
     * `coalesce(sum(maturite) filter (where statut <> 'non applicable'), 0)`
     * dans `lireConformite`, et **rien ici ne bouge**. En attendant, l'écart est
     * borné par le nombre d'évaluations à la fois NA et cotées — nul dans les
     * jeux observés — et il est dit, ce qui vaut mieux qu'un chiffre juste en
     * apparence.
     *
     * @param {object|null} bloc `indicateurs.conformite` — `null` = domaine fermé
     * @returns {object|null} `null` quand le bloc l'est : le `null` se propage,
     *          il ne se convertit jamais en zéro.
     */
    function conformiteCalculee(bloc) {
        if (bloc === null || bloc === undefined) return null;
        const parRef = Array.isArray(bloc.parReferentiel) ? bloc.parReferentiel : [];

        let applicables = 0, conformes = 0, matSomme = 0, matApplicables = 0, evaluees = 0;
        const details = parRef.map(r => {
            const refId = String(r && r.refId ? r.refId : "");
            const ref = refDuCatalogue(refId);
            const statuts = estObjet(r && r.parStatut) ? r.parStatut : {};
            const enBase = sommeRepartition(statuts);

            // Dénominateur : le CATALOGUE, pas ce que la base contient. Une
            // exigence jamais ouverte n'a pas de ligne, et « non évalué = non
            // conforme » veut précisément dire qu'elle compte quand même.
            // Référentiel absent du catalogue (retiré, ou identifiant d'un jeu
            // hérité) : on retombe sur ce qui existe, et on le DIT dans la vue.
            const totalCatalogue = ref ? Referentiels.countExigences(ref) : enBase;
            const nonApplicables = nombre(statuts["non applicable"]);
            const app = Math.max(0, totalCatalogue - nonApplicables);
            const conf = nombre(statuts["conforme"]);
            // Un questionnaire Oui/Non (AirCyber) n'a pas de maturité CMMI : il
            // est hors de la moyenne, comme dans `synthese.js` et `dashboard.js`.
            const questionnaire = !!(ref && ref.scoring === "conformite");

            applicables += app;
            conformes += conf;
            evaluees += enBase;
            if (!questionnaire) {
                matSomme += nombre(r.maturiteSomme);
                matApplicables += app;
            }

            return {
                refId: refId,
                nom: ref ? ref.nom : refId,
                inconnu: ref === null,
                questionnaire: questionnaire,
                totalCatalogue: totalCatalogue,
                evaluees: enBase,
                applicables: app,
                conformes: conf,
                taux: app > 0 ? Math.round((conf / app) * 100) : null,
                maturiteSomme: questionnaire ? 0 : nombre(r.maturiteSomme),
                maturite: (!questionnaire && app > 0) ? (nombre(r.maturiteSomme) / app) : null,
                repartition: statuts
            };
        }).sort((a, b) => a.nom.localeCompare(b.nom));

        return {
            details: details,
            applicables: applicables,
            conformes: conformes,
            evaluees: evaluees,
            taux: applicables > 0 ? Math.round((conformes / applicables) * 100) : null,
            maturite: matApplicables > 0 ? (matSomme / matApplicables) : null,
            repartition: estObjet(bloc.parStatut) ? bloc.parStatut : {}
        };
    }

    /** Somme deux répartitions sans en supposer les clés. */
    function fusionner(a, b) {
        const cumul = {};
        [a, b].forEach(r => {
            if (!estObjet(r)) return;
            Object.keys(r).forEach(k => { cumul[k] = nombre(cumul[k]) + nombre(r[k]); });
        });
        return cumul;
    }

    /**
     * Conformité du GROUPE — agrégée depuis les filiales, pas depuis `total`.
     *
     * ⚠️ **Ce n'est pas une préférence d'écriture, c'est une correction.** Le
     * serveur, quand il cumule, **fusionne `parReferentiel` par `refId`** : les
     * décomptes de statut de vingt filiales se retrouvent sur une seule entrée
     * « anssi-hygiene ». Or le dénominateur, lui, ne vient pas du serveur — il
     * vient du catalogue, et il vaut *42 exigences PAR FILIALE*. Calculer le
     * taux du groupe sur `total.conformite` diviserait donc la somme des
     * conformes de vingt filiales par **un seul** catalogue, et rendrait un taux
     * pouvant dépasser 100 %.
     *
     * On agrège donc ce que chaque filiale a réellement : ses applicables, ses
     * conformes, sa somme de maturités. `total` reste la source des **comptes**
     * — risques, actions, incidents —, que le serveur sait sommer seul.
     *
     * @param {Array} filiales `consolidation.filiales`
     * @param {object|null} blocTotal `consolidation.total.conformite`, dernier recours
     */
    function conformiteConsolidee(filiales, blocTotal) {
        const parts = (Array.isArray(filiales) ? filiales : [])
            .map(f => conformiteCalculee((f.indicateurs || {}).conformite))
            .filter(c => c !== null);
        // Aucune filiale lisible : on retombe sur ce que le serveur a cumulé, et
        // le `null` continue de se propager s'il est là.
        if (parts.length === 0) {
            return (blocTotal === null || blocTotal === undefined) ? null : conformiteCalculee(blocTotal);
        }

        const parRef = new Map();
        parts.forEach(p => p.details.forEach(d => {
            const cumul = parRef.get(d.refId) || {
                refId: d.refId, nom: d.nom, inconnu: d.inconnu, questionnaire: d.questionnaire,
                totalCatalogue: 0, evaluees: 0, applicables: 0, conformes: 0,
                maturiteSomme: 0, repartition: {}
            };
            cumul.totalCatalogue += d.totalCatalogue;
            cumul.evaluees += d.evaluees;
            cumul.applicables += d.applicables;
            cumul.conformes += d.conformes;
            cumul.maturiteSomme += d.maturiteSomme;
            cumul.repartition = fusionner(cumul.repartition, d.repartition);
            parRef.set(d.refId, cumul);
        }));

        let applicables = 0, conformes = 0, evaluees = 0, matSomme = 0, matApplicables = 0;
        const details = [...parRef.values()].map(d => {
            applicables += d.applicables;
            conformes += d.conformes;
            evaluees += d.evaluees;
            if (!d.questionnaire) { matSomme += d.maturiteSomme; matApplicables += d.applicables; }
            return Object.assign({}, d, {
                taux: d.applicables > 0 ? Math.round((d.conformes / d.applicables) * 100) : null,
                maturite: (!d.questionnaire && d.applicables > 0) ? (d.maturiteSomme / d.applicables) : null
            });
        }).sort((a, b) => a.nom.localeCompare(b.nom));

        return {
            details: details,
            applicables: applicables,
            conformes: conformes,
            evaluees: evaluees,
            taux: applicables > 0 ? Math.round((conformes / applicables) * 100) : null,
            maturite: matApplicables > 0 ? (matSomme / matApplicables) : null,
            repartition: parts.reduce((a, p) => fusionner(a, p.repartition), {})
        };
    }

    /* =====================================================================
       CELLULES — LE POINT OÙ `null` NE DOIT JAMAIS DEVENIR ZÉRO
    ===================================================================== */

    /**
     * Cellule « non communiqué ».
     *
     * ⚠️ Aucun chiffre, nulle part — ni dans le texte, ni dans l'infobulle. Un
     * essai qui vérifie qu'un zéro n'apparaît pas lit le texte de la cellule ;
     * un « 0 » glissé dans une phrase explicative le ferait échouer à raison,
     * parce qu'un lecteur pressé le lirait aussi.
     */
    function cellulaireNonCommunique() {
        return '<span class="grp-nd" title="' + esc(PHRASE_NON_ACCESSIBLE) + '"' +
            ' aria-label="' + esc(PHRASE_NON_ACCESSIBLE) + '">—</span>';
    }

    /**
     * Rend une valeur tirée d'un bloc, ou « — » si le bloc est fermé.
     *
     * @param {object|null} bloc le bloc de domaine (`null` = hors droits)
     * @param {(b: object) => (number|string|null)} extraire ce qu'on en tire
     */
    function valeur(bloc, extraire) {
        if (bloc === null || bloc === undefined) return cellulaireNonCommunique();
        let v;
        try { v = extraire(bloc); } catch (e) { v = null; }
        if (v === null || v === undefined || v === "") return '<span class="grp-vide">—</span>';
        return esc(v);
    }

    /** Cellule de tableau, avec le repère que le banc d'essai vise. */
    function td(nom, contenu, classe) {
        return '<td data-cel="' + esc(nom) + '"' + (classe ? ' class="' + esc(classe) + '"' : "") +
            ">" + contenu + "</td>";
    }

    /* =====================================================================
       VUES
    ===================================================================== */

    /**
     * Les colonnes du tableau comparatif — un seul endroit les décrit.
     *
     * `rendre(indicateurs, conformite)` : la conformité est **passée**, jamais
     * recalculée ici, parce que la ligne de total ne l'agrège pas comme une
     * ligne de filiale (voir `conformiteConsolidee`).
     */
    function colonnes() {
        return [
            { cel: "conformite", titre: "Conformité",
              aide: "Part des exigences applicables déclarées conformes, tous référentiels engagés " +
                    "confondus. Une exigence non évaluée compte comme non conforme ; les « non " +
                    "applicable » sortent du dénominateur.",
              rendre: (ind, c) => {
                  if (c === null) return cellulaireNonCommunique();
                  if (c.taux === null) return '<span class="grp-vide">—</span>';
                  return '<strong>' + esc(c.taux) + '&nbsp;%</strong>';
              } },
            { cel: "maturite", titre: "Maturité",
              aide: "Moyenne CMMI (0 à 5) sur les référentiels qui se cotent en maturité. Les " +
                    "questionnaires Oui/Non — AirCyber — en sont exclus : ils n'ont pas de maturité.",
              rendre: (ind, c) => {
                  if (c === null) return cellulaireNonCommunique();
                  if (c.maturite === null) return '<span class="grp-vide">—</span>';
                  return esc(c.maturite.toFixed(1));
              } },
            { cel: "risques", titre: "Risques",
              aide: "Nombre de risques identifiés dans la filiale.",
              rendre: (ind) => valeur(ind.risques, (b) => nombre(b.total)) },
            { cel: "exposition", titre: "Exposition",
              aide: "Somme des scores résiduels des risques cotés. « — » lorsqu'aucun ne l'est " +
                    "encore : une exposition inconnue n'est pas une exposition nulle.",
              rendre: (ind) => valeur(ind.risques, (b) =>
                  b.expositionResiduelle === null ? null : nombre(b.expositionResiduelle)) },
            { cel: "actions", titre: "Actions",
              aide: "Plan d'actions de la filiale, toutes échéances confondues.",
              rendre: (ind) => valeur(ind.actions, (b) => nombre(b.total)) },
            { cel: "actions_retard", titre: "dont en retard",
              aide: "Échéance dépassée et action non terminée. C'est un calcul du serveur, fait " +
                    "sur l'horloge de la base — la même que celle qui horodate les écritures.",
              rendre: (ind) => valeur(ind.actions, (b) => nombre(b.enRetard)) },
            { cel: "incidents", titre: "Incidents",
              aide: "Registre des incidents de la filiale.",
              rendre: (ind) => valeur(ind.incidents, (b) => nombre(b.total)) },
            { cel: "incidents_declarer", titre: "à déclarer",
              aide: "Incidents portant une déclaration ANSSI (NIS2) ou CNIL (RGPD) encore à faire.",
              rendre: (ind) => valeur(ind.incidents, (b) => nombre(b.aDeclarer)) },
            { cel: "documents", titre: "Documents",
              aide: "Politiques et procédures de la filiale. Les documents de portée Groupe sont " +
                    "comptés à part, plus bas.",
              rendre: (ind) => valeur(ind.documents, (b) => nombre(b.total)) },
            { cel: "documents_revue", titre: "revue échue",
              aide: "Documents dont la date de revue est dépassée.",
              rendre: (ind) => valeur(ind.documents, (b) => nombre(b.revueEchue)) },
            { cel: "actifs", titre: "Actifs",
              aide: "Actifs cartographiés dans la filiale.",
              rendre: (ind) => valeur(ind.actifs, (b) => nombre(b.total)) },
            { cel: "audits", titre: "Audits",
              aide: "Audits enregistrés, quel que soit leur état d'avancement.",
              rendre: (ind) => valeur(ind.audits, (b) => nombre(b.total)) }
        ];
    }

    function enteteFiliale(f) {
        const nom = f.raisonSociale || f.nomCourt || f.code || f.id;
        return (
            '<div class="grp-nom">' + esc(nom) +
            (f.active ? ' <span class="grp-active" title="Filiale sur laquelle vous écrivez">active</span>' : "") +
            "</div>" +
            '<div class="grp-sous">' + esc(f.code || "") +
            (f.pays ? " · " + esc(f.pays) : "") +
            (f.statut && f.statut !== "active" ? " · " + esc(f.statut) : "") +
            "</div>"
        );
    }

    function tableauHtml() {
        const cols = colonnes();
        const filiales = Array.isArray(consolidation.filiales) ? consolidation.filiales : [];
        if (filiales.length === 0) {
            return '<p class="chart-empty">Aucune filiale n\'est lisible dans votre périmètre.</p>';
        }

        const entete = "<tr><th>Filiale</th>" + cols.map(c =>
            "<th>" + esc(c.titre) +
            (typeof Help !== "undefined" ? Help.tip(c.aide) : "") + "</th>").join("") + "</tr>";

        // L'identifiant vit dans un ATTRIBUT du balisage, jamais capturé en
        // chaîne dans une fermeture (`CLAUDE.md` §3) : le clic le relit.
        const lignes = filiales.map(f =>
            '<tr class="grp-ligne' + (f.active ? " grp-ligne--active" : "") + '"' +
            ' data-filiale="' + esc(f.id) + '" tabindex="0">' +
            '<th scope="row" data-cel="filiale">' + enteteFiliale(f) + "</th>" +
            cols.map(c => td(c.cel, c.rendre(f.indicateurs || {},
                conformiteCalculee((f.indicateurs || {}).conformite)))).join("") +
            "</tr>").join("");

        const total = consolidation.total || {};
        const confTotale = conformiteConsolidee(filiales, total.conformite);
        const pied =
            '<tr class="grp-total" data-filiale="__total__">' +
            '<th scope="row" data-cel="filiale">Total Groupe<div class="grp-sous">' +
            esc(filiales.length) + " filiale(s) consolidée(s)</div></th>" +
            cols.map(c => td(c.cel, c.rendre(total, confTotale))).join("") +
            "</tr>";

        return (
            '<div class="grp-defilement">' +
            '<table class="data-table grp-table"><thead>' + entete + "</thead>" +
            "<tbody>" + lignes + "</tbody>" +
            "<tfoot>" + pied + "</tfoot></table></div>"
        );
    }

    /** Barres comparatives du taux de conformité — la lecture d'un coup d'œil. */
    function barresHtml() {
        const filiales = Array.isArray(consolidation.filiales) ? consolidation.filiales : [];
        const mesures = filiales.map(f => ({
            id: f.id,
            nom: f.raisonSociale || f.nomCourt || f.code || f.id,
            c: conformiteCalculee((f.indicateurs || {}).conformite)
        }));
        if (mesures.length === 0) return "";
        if (mesures.every(m => m.c === null)) {
            return '<p class="chart-empty">' + esc(PHRASE_NON_ACCESSIBLE) + "</p>";
        }
        return mesures.map(m => {
            if (m.c === null) {
                return '<div class="grp-barre" data-filiale="' + esc(m.id) + '">' +
                    '<div class="grp-barre-tete"><span>' + esc(m.nom) + "</span>" +
                    '<span data-cel="barre">' + cellulaireNonCommunique() + "</span></div></div>";
            }
            const taux = m.c.taux;
            const pct = taux === null ? 0 : Math.max(0, Math.min(100, taux));
            const teinte = taux === null ? "var(--color-gray)"
                : (taux >= 80 ? "var(--color-success)"
                    : (taux >= 50 ? "var(--color-warning)" : "var(--color-danger)"));
            return (
                '<div class="grp-barre" data-filiale="' + esc(m.id) + '">' +
                '<div class="grp-barre-tete"><span>' + esc(m.nom) + "</span>" +
                '<span data-cel="barre">' +
                (taux === null ? '<span class="grp-vide">—</span>' : esc(taux) + "&nbsp;%") +
                "</span></div>" +
                '<div class="grp-barre-piste"><div class="grp-barre-part" style="width:' +
                pct + "%; background:" + teinte + ';"></div></div>' +
                '<div class="grp-barre-note">' + esc(m.c.conformes) + " conforme(s) sur " +
                esc(m.c.applicables) + " applicable(s)</div></div>"
            );
        }).join("");
    }

    /**
     * Répartitions découvertes — le vocabulaire vient du serveur, pas d'ici.
     *
     * Ce panneau existe pour une raison précise : le tableau ci-dessus ne montre
     * que des totaux et deux calculs. Si le socle gagnait demain une valeur de
     * statut, elle ne se verrait nulle part. Ici, elle se voit — en gris.
     */
    function repartitionsHtml(indicateurs, titre) {
        const groupes = [
            { cle: "conformite", nom: "Conformité", lire: (b) => b.parStatut },
            { cle: "risques", nom: "Risques par niveau", lire: (b) => b.parNiveau },
            { cle: "actions", nom: "Actions par statut", lire: (b) => b.parStatut },
            { cle: "incidents", nom: "Incidents par gravité", lire: (b) => b.parGravite },
            { cle: "incidents", nom: "Incidents par statut", lire: (b) => b.parStatut },
            { cle: "documents", nom: "Documents par statut", lire: (b) => b.parStatut },
            { cle: "actifs", nom: "Actifs par criticité", lire: (b) => b.parCriticite },
            { cle: "audits", nom: "Audits par statut", lire: (b) => b.parStatut }
        ];
        const cartes = groupes.map(g => {
            const bloc = indicateurs ? indicateurs[g.cle] : null;
            let corps;
            if (bloc === null || bloc === undefined) {
                corps = '<p class="grp-nd-bloc" data-cel="ferme">' + esc(PHRASE_NON_ACCESSIBLE) + "</p>";
            } else {
                const entrees = entreesRepartition(g.lire(bloc));
                corps = entrees.length === 0
                    ? '<p class="grp-vide">Aucune donnée enregistrée.</p>'
                    : '<div class="grp-puces">' + entrees.map(e =>
                        '<span class="grp-puce">' +
                        (typeof UI !== "undefined"
                            ? UI.mappedBadge(e.valeur, TEINTES, "status-non-applicable")
                            : '<span class="status status-non-applicable">' + esc(e.valeur) + "</span>") +
                        '<b>' + esc(e.n) + "</b></span>").join("") + "</div>";
            }
            return '<div class="grp-rep" data-rep="' + esc(g.nom) + '">' +
                "<h4>" + esc(g.nom) + "</h4>" + corps + "</div>";
        }).join("");
        return '<h3 class="grp-h3">' + esc(titre) + "</h3><div class=\"grp-reps\">" + cartes + "</div>";
    }

    /** Détail par référentiel, au niveau Groupe : c'est là que le catalogue sert. */
    function referentielsHtml() {
        const c = conformiteConsolidee(consolidation.filiales, (consolidation.total || {}).conformite);
        if (c === null) {
            return '<p class="grp-nd-bloc" data-cel="ferme">' + esc(PHRASE_NON_ACCESSIBLE) + "</p>";
        }
        if (c.details.length === 0) {
            return '<p class="chart-empty">Aucun référentiel n\'est encore évalué dans le groupe.</p>';
        }
        return (
            '<div class="grp-defilement"><table class="data-table"><thead><tr>' +
            "<th>Référentiel</th><th>Cotation</th><th>Évaluées</th><th>Applicables</th>" +
            "<th>Conformes</th><th>Taux</th><th>Maturité</th><th>Répartition</th>" +
            "</tr></thead><tbody>" +
            c.details.map(d =>
                '<tr data-ref="' + esc(d.refId) + '">' +
                "<td>" + esc(d.nom) +
                (d.inconnu
                    ? ' <span class="status status-non-applicable" title="Ce référentiel n\'est pas ' +
                      'dans le catalogue embarqué : le total affiché est celui des évaluations ' +
                      'trouvées, faute de connaître le nombre d\'exigences.">hors catalogue</span>'
                    : "") + "</td>" +
                "<td>" + (d.questionnaire ? "Oui / Non" : "Maturité CMMI") + "</td>" +
                td("evaluees", esc(d.evaluees)) +
                td("applicables", esc(d.applicables)) +
                td("conformes", esc(d.conformes)) +
                td("taux", d.taux === null ? '<span class="grp-vide">—</span>'
                    : "<strong>" + esc(d.taux) + "&nbsp;%</strong>") +
                td("maturite", d.maturite === null ? '<span class="grp-vide">—</span>'
                    : esc(d.maturite.toFixed(1))) +
                "<td>" + (entreesRepartition(d.repartition).length === 0
                    ? '<span class="grp-vide">—</span>'
                    : '<div class="grp-puces">' + entreesRepartition(d.repartition).map(e =>
                        '<span class="grp-puce">' +
                        (typeof UI !== "undefined"
                            ? UI.mappedBadge(e.valeur, TEINTES, "status-non-applicable")
                            : '<span class="status status-non-applicable">' + esc(e.valeur) + "</span>") +
                        "<b>" + esc(e.n) + "</b></span>").join("") + "</div>") + "</td>" +
                "</tr>").join("") +
            "</tbody></table></div>"
        );
    }

    /**
     * Portée Groupe — les lignes à `filiale_id` nul.
     *
     * ⚠️ Elles ont leur propre carte, et n'entrent dans aucune colonne : les
     * compter dans une filiale les compterait vingt fois (entête de
     * `consolidation/index.ts`).
     */
    function porteeGroupeHtml() {
        const p = consolidation.porteeGroupe || {};
        const bloc = p.documents === undefined ? null : p.documents;
        if (bloc === null) {
            return '<p class="grp-nd-bloc" data-cel="ferme">' + esc(PHRASE_NON_ACCESSIBLE) + "</p>";
        }
        const entrees = entreesRepartition(bloc.parStatut);
        return (
            '<div class="grp-tuiles">' +
            '<div class="kpi-tile"><div class="kt-val" data-cel="pg_documents">' +
            esc(nombre(bloc.total)) + '</div><div class="kt-lbl">Documents de portée Groupe</div>' +
            '<div class="kt-sub">PSSI et politiques communes — comptées une seule fois</div></div>' +
            '<div class="kpi-tile' + (nombre(bloc.revueEchue) > 0 ? " is-warning" : "") +
            '"><div class="kt-val" data-cel="pg_revue">' + esc(nombre(bloc.revueEchue)) +
            '</div><div class="kt-lbl">dont revue échue</div>' +
            '<div class="kt-sub">Date de revue dépassée</div></div>' +
            "</div>" +
            (entrees.length === 0 ? "" :
                '<div class="grp-puces">' + entrees.map(e =>
                    '<span class="grp-puce">' +
                    (typeof UI !== "undefined"
                        ? UI.mappedBadge(e.valeur, TEINTES, "status-non-applicable")
                        : '<span class="status status-non-applicable">' + esc(e.valeur) + "</span>") +
                    "<b>" + esc(e.n) + "</b></span>").join("") + "</div>")
        );
    }

    /* =====================================================================
       COORDONNÉES DE LA FILIALE ACTIVE — constat Q-160
    ===================================================================== */

    /**
     * Les coordonnées, telles que `GET /api/session` les rend.
     *
     * ⚠️ **Une coordonnée absente ne laisse pas de libellé orphelin** : la ligne
     * entière disparaît. Sur un écran qui sert de preuve, un libellé « Téléphone »
     * suivi de rien fait douter de la donnée plutôt que de l'écran — et sur un
     * document imprimé, il ressemble à une adresse tronquée.
     *
     * Ces champs sont lus ici plutôt que dans `Session.courante()` : `adopter()`
     * fige un objet qui ne les retient pas, et `js/core/session.js` appartient à
     * un autre périmètre d'écriture. On relit donc la charte de session, qui est
     * de toute façon la source de ces valeurs.
     */
    function coordonneesHtml() {
        if (filialeActive === null) {
            return '<p class="grp-vide">Coordonnées indisponibles : la session n\'a pas pu être relue.</p>';
        }
        const f = filialeActive;
        const ville = [f.code_postal, f.ville].filter(v => v !== null && v !== undefined && String(v).trim() !== "")
            .map(v => String(v).trim()).join(" ");
        const lignes = [
            ["Raison sociale", f.raison_sociale || nomDeLaFilialeActive()],
            ["Nom court", f.nom_court],
            ["Code", f.code || (consolidation ? codeDeLaFilialeActive() : null)],
            ["Adresse", f.adresse],
            ["Ville", ville],
            ["Pays", f.pays],
            ["Téléphone", f.telephone],
            ["Courriel", f.email],
            ["Site web", f.site_web]
        ].filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");

        if (lignes.length === 0) {
            return '<p class="grp-vide">Aucune coordonnée n\'est renseignée pour cette filiale. ' +
                "Elles se saisissent en administration.</p>";
        }
        return '<dl class="grp-coord">' + lignes.map(([libelle, v]) =>
            '<div class="grp-coord-l" data-coord="' + esc(libelle) + '">' +
            "<dt>" + esc(libelle) + "</dt><dd>" +
            (libelle === "Site web" ? lienHtml(String(v)) :
             libelle === "Courriel" ? '<a href="mailto:' + esc(String(v)) + '">' + esc(v) + "</a>" :
             esc(v)) +
            "</dd></div>").join("") + "</dl>";
    }

    /**
     * Un site web est une donnée d'utilisateur : il ne devient un lien que s'il
     * porte un schéma inoffensif. `javascript:` dans un `href` s'exécute au clic,
     * et `escapeHtml` ne l'en empêche pas — il n'échappe que le balisage.
     */
    function lienHtml(brut) {
        const v = String(brut).trim();
        const sur = /^https?:\/\//i.test(v);
        if (!sur) return esc(v);
        return '<a href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">' + esc(v) + "</a>";
    }

    function filialeActiveConsolidee() {
        if (!consolidation || !Array.isArray(consolidation.filiales)) return null;
        return consolidation.filiales.find(f => f.active === true) || null;
    }
    function nomDeLaFilialeActive() {
        const f = filialeActiveConsolidee();
        return f ? (f.raisonSociale || f.nomCourt || f.code || f.id) : null;
    }
    function codeDeLaFilialeActive() {
        const f = filialeActiveConsolidee();
        return f ? f.code : null;
    }

    /* =====================================================================
       BANDEAU DE PÉRIMÈTRE
    ===================================================================== */

    function perimetreHtml() {
        const p = (consolidation && consolidation.perimetre) || {};
        const n = nombre(p.filiales);
        const groupe = p.groupe === true;
        return (
            '<div class="grp-perimetre" id="groupePerimetre" role="status">' +
            '<span class="status ' + (groupe ? "status-conforme" : "status-non-applicable") + '">' +
            (groupe ? "Périmètre Groupe" : "Périmètre partiel") + "</span> " +
            '<span data-cel="perimetre_filiales">' + esc(n) +
            " filiale(s) lisible(s)</span>" +
            (typeof Help !== "undefined" ? Help.tip(
                "Cet écran ne montre QUE ce que votre périmètre vous ouvre. Le serveur ne " +
                "reçoit aucun nom de filiale de la part du navigateur : il applique le " +
                "cloisonnement de la base, et rend ce que vous avez le droit de lire. Un " +
                "périmètre partiel n'est donc pas une vue tronquée du groupe, c'est votre " +
                "vue complète.") : "") +
            "</div>"
        );
    }

    /* =====================================================================
       RENDU
    ===================================================================== */

    function corpsHtml() {
        if (chargement) {
            return '<p class="chart-empty">Consolidation en cours…</p>';
        }
        if (erreur) {
            return '<div class="grp-erreur" role="alert">' +
                "<strong>La consolidation n'a pas pu être établie.</strong><br>" +
                esc(erreur) +
                '<div class="grp-erreur-geste"><button type="button" id="groupeReessayerBtn" ' +
                'class="btn-secondary" data-lecture="ok">Réessayer</button></div></div>';
        }
        if (!consolidation) return '<p class="chart-empty">Aucune donnée.</p>';

        return (
            perimetreHtml() +

            '<section class="dashboard-card grp-carte"><h3 class="grp-h3">Filiale active ' +
            (typeof Help !== "undefined" ? Help.tip(
                "La filiale sur laquelle vous écrivez. Ses coordonnées viennent de la base et " +
                "servent aux entêtes de rapport : une donnée absente reste absente, elle n'est " +
                "jamais fabriquée.") : "") +
            "</h3>" + coordonneesHtml() + "</section>" +

            '<section class="dashboard-card grp-carte"><h3 class="grp-h3">Comparaison des filiales ' +
            (typeof Help !== "undefined" ? Help.tip(
                "Une ligne par filiale de votre périmètre, plus le total du groupe. Un tiret " +
                "signifie que le domaine n'est pas ouvert à votre profil — jamais qu'il n'y a " +
                "rien à compter.") : "") +
            "</h3>" + tableauHtml() + "</section>" +

            '<section class="dashboard-card grp-carte"><h3 class="grp-h3">Conformité comparée</h3>' +
            '<div class="grp-barres">' + barresHtml() + "</div></section>" +

            '<section class="dashboard-card grp-carte"><h3 class="grp-h3">Conformité par référentiel ' +
            (typeof Help !== "undefined" ? Help.tip(
                "Le serveur rend des décomptes ; le taux est calculé ici, parce que le catalogue " +
                "des référentiels vit dans le navigateur — lui seul sait qu'AirCyber se répond " +
                "Oui/Non sans maturité là où l'ANSSI se cote en CMMI.") : "") +
            "</h3>" + referentielsHtml() + "</section>" +

            '<section class="dashboard-card grp-carte"><h3 class="grp-h3">Portée Groupe ' +
            (typeof Help !== "undefined" ? Help.tip(
                "Les documents rattachés au groupe et non à une filiale — la PSSI, typiquement. " +
                "Ils sont comptés à part : les additionner dans chaque filiale les compterait " +
                "autant de fois qu'il y a de filiales.") : "") +
            "</h3>" + porteeGroupeHtml() + "</section>" +

            '<section class="dashboard-card grp-carte">' +
            repartitionsHtml(consolidation.total || {}, "Répartitions consolidées") +
            "</section>"
        );
    }

    function rafraichirCorps() {
        const hote = document.getElementById("groupeCorps");
        if (!hote) return;
        hote.innerHTML = corpsHtml();
        brancherCorps();
    }

    /**
     * Branche les gestes du corps.
     *
     * **Aucun gestionnaire en ligne** : la politique de sécurité de contenu du
     * vhost livré (`script-src 'self'`, sans `unsafe-inline`) les rend inertes,
     * en silence — c'est le constat M-6 de la porte S2, qui avait livré une
     * interface morte. On branche après rendu.
     */
    function brancherCorps() {
        const reessayer = document.getElementById("groupeReessayerBtn");
        if (reessayer) reessayer.addEventListener("click", () => { charger(); });

        // ⚠️ L'identifiant est relu dans le DOM AU MOMENT DU CLIC, jamais capturé
        // en chaîne : cet écran se redessine à chaque rafraîchissement, et une
        // fermeture qui aurait retenu un identifiant viserait une ligne qui n'est
        // plus à l'écran — en silence.
        document.querySelectorAll(".grp-ligne").forEach(ligne => {
            const basculer = () => { afficherDetail(ligne.dataset.filiale); };
            ligne.addEventListener("click", basculer);
            ligne.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); basculer(); }
            });
        });
    }

    /** Ouvre le détail d'une filiale sous le tableau — répartitions comprises. */
    function afficherDetail(filialeId) {
        const hote = document.getElementById("groupeDetail");
        if (!hote) return;
        const filiales = (consolidation && Array.isArray(consolidation.filiales))
            ? consolidation.filiales : [];
        const f = filiales.find(x => String(x.id) === String(filialeId));
        if (!f || hote.dataset.filiale === String(filialeId)) {
            refermerDetail();
            return;
        }
        hote.dataset.filiale = String(filialeId);
        hote.innerHTML = '<section class="dashboard-card grp-carte" data-detail="' + esc(f.id) + '">' +
            repartitionsHtml(f.indicateurs || {},
                "Répartitions — " + (f.raisonSociale || f.nomCourt || f.code || f.id)) +
            "</section>";
        document.querySelectorAll(".grp-ligne").forEach(l => {
            l.classList.toggle("grp-ligne--vue", String(l.dataset.filiale) === String(filialeId));
        });
    }

    /** Referme le détail : appelé avant tout rechargement, pour ne rien laisser de périmé. */
    function refermerDetail() {
        const hote = document.getElementById("groupeDetail");
        if (hote) {
            hote.dataset.filiale = "";
            hote.innerHTML = "";
        }
        document.querySelectorAll(".grp-ligne--vue").forEach(l => l.classList.remove("grp-ligne--vue"));
    }

    /* =====================================================================
       CHARGEMENT
    ===================================================================== */

    async function charger() {
        chargement = true;
        erreur = null;
        // Le détail ouvert porte des chiffres d'avant le rechargement : le garder
        // afficherait une filiale à deux instants différents sur un même écran.
        refermerDetail();
        rafraichirCorps();

        // Les coordonnées viennent de la charte de session ; la consolidation, de
        // sa route. Aucune ne dépend de l'autre : une session illisible ne doit
        // pas priver la direction de sa consolidation, et l'inverse non plus.
        const [resConso, resSession] = await Promise.allSettled([
            Api.consolidation(),
            (typeof Api !== "undefined" && Api.session) ? Api.session() : Promise.reject(new Error("Api absent"))
        ]);

        if (resConso.status === "fulfilled" && estObjet(resConso.value)) {
            consolidation = resConso.value;
        } else {
            consolidation = null;
            erreur = messageDErreur(resConso.status === "rejected" ? resConso.reason : null);
        }

        filialeActive = null;
        if (resSession.status === "fulfilled" && estObjet(resSession.value)) {
            const fa = resSession.value.filiale_active;
            if (estObjet(fa)) filialeActive = fa;
        }

        chargement = false;
        rafraichirCorps();
    }

    function render() {
        const app = document.getElementById("app");
        if (!app) return;

        app.innerHTML =
            '<section class="page">' +
            '<div class="dashboard-header">' +
            "<div><h1>Vision Groupe " +
            (typeof Help !== "undefined" ? Help.tip(
                "La consolidation que le cadrage promet à la direction : une ligne par filiale " +
                "de votre périmètre, et le total du groupe. Le serveur ne reçoit aucun nom de " +
                "filiale — il applique le cloisonnement de la base et rend ce que vous avez le " +
                "droit de lire.") : "") +
            "</h1>" +
            '<p style="color: var(--text-muted); margin-top:5px;">' +
            "Consolidation multi-filiales — conformité, risques, actions, incidents, documents, " +
            "actifs et audits, plus les coordonnées de la filiale active." +
            "</p></div>" +
            '<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">' +
            '<button type="button" id="groupeRafraichirBtn" class="btn-secondary" data-lecture="ok">Rafraîchir</button>' +
            '<button type="button" id="groupeImprimerBtn" class="btn-secondary" data-lecture="ok">Imprimer</button>' +
            "</div></div>" +
            '<div id="groupeCorps"></div>' +
            '<div id="groupeDetail" data-filiale=""></div>' +
            "</section>";

        const rafraichir = document.getElementById("groupeRafraichirBtn");
        if (rafraichir) rafraichir.addEventListener("click", () => { charger(); });
        const imprimer = document.getElementById("groupeImprimerBtn");
        if (imprimer) imprimer.addEventListener("click", () => window.print());

        rafraichirCorps();
        charger();
    }

    return {
        // `renderList` : le nom que `js/app.js` appelle, comme les 26 autres modules.
        renderList: render,
        render: render,
        // Exposés pour le banc et pour le diagnostic : purement fonctionnels, ils
        // n'émettent rien et se prouvent sans réseau.
        conformiteCalculee: conformiteCalculee,
        conformiteConsolidee: conformiteConsolidee,
        entreesRepartition: entreesRepartition,
        contrat: Object.freeze({ chemin: CHEMIN, delaiMs: DELAI_MS })
    };
})();
