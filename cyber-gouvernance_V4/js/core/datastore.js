// Emplacement : js/core/datastore.js
// Nom du fichier : datastore.js
//
// Source de vérité EN MÉMOIRE, API 100 % synchrone pour les modules.
//
// ── Ce qui a changé, et ce qui n'a pas changé (lot L2) ───────────────────────
//
// N'a PAS changé — et c'est la décision qui rend le chantier faisable
// (`PLAN_SERVEUR` §1.3, risque projet P3) : **l'API publique**. Les 125 méthodes
// `getX / addX / updateX / deleteX` gardent leur signature et restent synchrones.
// Aucun des 26 modules métier n'est modifié.
//
// A changé — la persistance, et elle seule :
//   · le jeu de données est **chargé depuis le serveur** au démarrage
//     (`/api/donnees`), dans la forme exacte de l'objet `data` ;
//   · `save()` — toujours l'entonnoir unique appelé après chaque mutation —
//     ne réécrit plus un instantané complet mais réveille `sync.js`, qui
//     n'envoie que **l'enregistrement modifié**, sous verrouillage optimiste ;
//   · IndexedDB, le miroir `localStorage` et les points de restauration locaux
//     **disparaissent** : la sauvegarde est celle du serveur (§1.8), et garder
//     une copie complète des données de gouvernance sur chaque poste serait une
//     régression de sécurité — d'autant que le coffre qui la chiffrait a été
//     retiré lui aussi (§1.9) ;
//   · l'export/import `grc-backup` **reste**, non plus comme sauvegarde mais
//     comme **format d'échange** (§2.6) : reprise d'une filiale déjà équipée,
//     remise des données à une filiale qui sort du groupe.

const DataStore = (() => {
    const SCHEMA_VERSION = 28;

    const ARRAY_FIELDS = [
        "clients", "exigences", "actions", "risques", "actifs",
        "processus", "crise", "scenarios_pra", "tests_pra", "prestataires", "mco_actions",
        "audits", "revues",
        // v3 — Chantier Référentiels : auto-évaluations par exigence de référentiel
        // + pivot « Mesure de sécurité » (voir DATA_MODEL.md §Référentiels).
        "evaluations", "mesures",
        // v4 — Chantier Incidents : registre des incidents de sécurité.
        "incidents",
        // v5 — Chantier Documentaire : registre des politiques/documents.
        "documents",
        // v6 — Chantier RGPD : registre des traitements (article 30).
        "traitements",
        // v7 — Chantier 3 : surcouche utilisateur des correspondances inter-référentiels
        // (ajouts, modifications d'un groupe du catalogue, ou masquage via `_deleted`).
        "mappings",
        // v8 — Chantier 7 : historique des indicateurs (un instantané par jour) pour les
        // courbes de tendance du tableau de bord.
        "history",
        // v11 — Chantier Personnel : annuaire des personnes/rôles réutilisé partout où l'on
        // saisit un responsable (autocomplétion). Le nom reste stocké en texte dans les entités
        // (rétrocompatible) ; l'annuaire alimente les suggestions et la fiche « affectations ».
        "personnes",
        // v13 — Chantier Groupe : les deux tables que le serveur portait sans que personne
        // ne les lise. Elles arrivent VIDES sur une base héritée, et c'est correct :
        // `normalize` crée le tableau, et une filiale sans socle ni activation se comporte
        // exactement comme avant.
        //
        //  · `risque_catalogue` — le SOCLE de risques du Groupe, plus les ajouts propres à
        //    chaque filiale (arbitrage utilisateur du 04/09/2026). Il porte la DÉFINITION
        //    d'un risque, jamais son évaluation : F, G, M et le score restent dans
        //    `risques`, parce que l'exposition est ce qui distingue une filiale d'une autre.
        //  · `referentiels_actifs` — QUELS référentiels sont dans le périmètre de ce site.
        //    ⚠️ À ne pas confondre avec le « non applicable » par exigence, qui écarte un
        //    point précis À L'INTÉRIEUR d'un référentiel pratiqué : s'en servir pour écarter
        //    un référentiel entier obligerait à cocher 234 cases pour AirCyber.
        "risque_catalogue", "referentiels_actifs",
        // v14 — Lot L19, action 19.2 : les écarts de conformité ASSUMÉS. Un
        // propriétaire, un motif, une échéance, et une décision du circuit
        // d'approbation. ⚠️ Aucune de ces lignes ne porte d'ÉTAT : « en vigueur »,
        // « échue » ou « en attente » se dérivent côté serveur de l'échéance et de
        // la décision. Les stocker ici les figerait au jour de l'export.
        "derogations",
        // v19 — la chaîne de sous-traitance des tiers (action 21.1). Le nom est
        // celui de la table côté serveur : c'est lui qui voyage dans
        // `journal_audit.entite_type`, et un nom plus court rendrait la
        // collection incréable (backend/db/CONVENTIONS.md §40.1).
        "prestataire_sous_traitance",
        // v20 — le questionnaire fournisseur (action 21.2) : l'ENVOI, puis les
        // RÉPONSES. L'ordre compte — les réponses référencent l'envoi.
        "questionnaires_tiers",
        "questionnaire_reponses",
        // v21 — les campagnes descendantes (L24, actions 24.1 et 24.2) : ce que le
        // GROUPE demande à ses filiales, et la part de chacune.
        //
        // ⚠️ `campagnes` est de niveau GROUPE et ne porte AUCUN identifiant de filiale :
        // son intitulé, son référentiel et son échéance sont les mêmes vus de toutes les
        // filiales. Ce qui diffère — qui répond, où elle en est — est dans
        // `campagne_filiales`, que la base cloisonne. Une filiale ne reçoit donc QUE sa
        // part, et n'apprend pas combien d'autres sont convoquées.
        //
        // ⚠️ Et aucune des deux ne porte l'AVANCEMENT : il se compte dans les
        // évaluations du référentiel demandé, côté serveur (`GET /api/campagnes/etat`).
        // Le stocker ici le figerait au jour de l'export.
        "campagnes",
        "campagne_filiales",
        // v17 — Lot L20, action 20.3 : les analyses d'impact RGPD (article 35).
        // ⚠️ Elles POINTENT le registre de l'article 30 (`traitement_id`) et n'en
        // recopient aucun champ : deux réponses à la même question dans un outil
        // produit en audit, c'est une de trop. ⚠️ Et aucune ne porte d'ÉTAT —
        // « à revoir » se dérive de la date de revue, côté serveur
        // (`GET /api/aipd/etat`). Le stocker ici le figerait au jour de l'export.
        "analyses_impact",
        // v18 — Lot L20, action 20.4 : les demandes d'exercice de droits (RGPD
        // art. 15 à 22). ⚠️ Aucune n'porte d'ÉCHÉANCE : le mois de l'article 12 §3
        // se dérive de la date de réception, côté serveur
        // (`GET /api/demandes-droits/etat`). Le stocker ici le figerait au jour de
        // l'export — et une reprise faite six mois plus tard rendrait « dans les
        // temps » une demande en retard depuis longtemps.
        "demandes_droits",
        // v22 — Lot L25, actions 25.1, 25.2 et 25.5 : les ateliers 1 et 2 d'EBIOS RM.
        //
        // ⚠️ **EN ADDITION, jamais en remplacement.** `risques` ne bouge pas : les
        // cotations F × G × M déjà saisies ont été produites en audit, et les
        // réinterpréter les réattribuerait EN SILENCE — c'est le motif qui a fait
        // refuser la renumérotation du catalogue ANSSI (constat Q-192). Le produit
        // porte donc DEUX méthodes de cotation en même temps, et elles ne se parlent
        // pas.
        //
        // ⚠️ `ebios_connaissances` est de niveau GROUPE quand son `filiale_id` est nul
        // — comme `risque_catalogue` : une base de connaissances de menaces partagée
        // est l'objet même de l'action 25.5. L'ordre compte, ici comme ailleurs : les
        // couples source/objectif la référencent, et les événements redoutés
        // référencent les valeurs métier.
        //
        // ⚠️ Et AUCUNE de ces lignes ne porte la PERTINENCE d'un couple : elle se
        // dérive de ses trois critères côté serveur (`GET /api/ebios/etat`). La
        // stocker ici la figerait au jour de l'export, alors que l'animateur révise
        // ses critères en séance.
        "ebios_connaissances",
        "ebios_etudes",
        "ebios_valeurs_metier",
        "ebios_evenements_redoutes",
        "ebios_sources_risque",
        // v23 — Lot L25, fin de l'action 25.1 : les ateliers 3, 4 et 5.
        //
        // ⚠️ L'ordre suit les clés étrangères : les parties prenantes AVANT les
        // scénarios stratégiques qui les traversent, et ceux-ci avant les scénarios
        // opérationnels qui les détaillent.
        //
        // ⚠️ **Aucun NIVEAU n'est stocké** — ni celui d'une partie prenante
        // (dépendance × pénétration ÷ maturité × confiance), ni celui d'un scénario
        // (gravité × vraisemblance). Ils viennent de `GET /api/ebios/etat`. Et
        // `ebios_scenarios_strategiques` ne porte **aucune gravité** : elle est celle
        // de l'événement redouté qu'il réalise, lue par la jointure.
        "ebios_parties_prenantes",
        "ebios_scenarios_strategiques",
        "ebios_scenarios_operationnels",
        // v24 — Lot L25, action 25.3 : les ÉCHELLES DE COTATION, versionnées et datées.
        //
        // ⚠️ **C'est ici que « 3 » cesse d'être un chiffre nu.** Jusqu'à la v23, les
        // quatre niveaux d'une gravité étaient écrits EN DUR dans `js/modules/risques.js`
        // et `js/modules/ebios.js` : aucune ligne du produit ne disait ce que « 3 »
        // voulait dire, ni qui l'avait décidé, ni depuis quand. Le jour où une filiale
        // change sa graduation, les cotations d'hier et celles de demain se rangent dans
        // la même colonne et le tableau de bord les additionne — sans que rien ne le
        // dise, puisque la donnée est du même type, dans la même borne, sous le même nom.
        //
        // ⚠️ Les DEUX sont de niveau GROUPE quand leur `filiale_id` est nul, comme
        // `risque_catalogue` : le socle est ce sur quoi toutes les filiales cotent tant
        // qu'aucune ne décide autrement. C'est ce qui réconcilie le `PLAN_SERVEUR` §2.2
        // — « l'échelle est de niveau Groupe, sans quoi les risques ne s'additionnent
        // pas » — avec le critère 25.3, qui les veut configurables par filiale : le §2.2
        // énonçait une CONSÉQUENCE, pas un interdit.
        //
        // ⚠️ Une échelle PUBLIÉE ne se modifie plus : on en publie une RÉVISION. Sans
        // cela, une cotation pointerait une échelle dont les niveaux ont changé sous
        // elle — et le produit afficherait « révision 1 » en montrant la graduation
        // d'aujourd'hui. C'est le déclencheur `trg_echelles_figee` (migration `049` §6),
        // pas une consigne d'écran.
        "echelles",
        "echelle_niveaux",
        // v25 — Lot L25, action 25.4 : la QUANTIFICATION FINANCIÈRE d'un risque (FAIR).
        //
        // ⚠️ **C'est la réponse à la limite que la v24 vient de rendre visible.** Depuis
        // les échelles, la consolidation REFUSE d'additionner deux expositions cotées sur
        // des graduations différentes — ce qui est honnête, et laisse sans réponse la
        // seule question qu'un comité de direction pose : « combien ça nous coûte ? ».
        // Une somme d'argent, à devise égale, s'additionne toujours.
        //
        // ⚠️ **Deux champs à souligné initial, et ils ne s'écrivent JAMAIS d'ici** :
        // `_perteAnnualisee` et `_secondaireEstimee` sont des colonnes ENGENDRÉES de la
        // base, servies en lecture. Les recalculer ici ferait deux points de mesure du
        // même montant, et le jour où l'un des deux change, l'écran cesse d'afficher ce
        // que la consolidation somme — sans que rien ne le dise (constat Q-219).
        //
        // ⚠️ **Une perte secondaire NON estimée ne vaut pas zéro** : elle fait du montant
        // un PLANCHER, et `_secondaireEstimee` à faux est ce qui oblige l'écran à écrire
        // « ≥ ». Un plancher présenté comme un total serait l'estimation par défaut dans
        // le sens rassurant — celle que le critère 25.4 interdit nommément.
        "risque_quantification",
        // v26 — Lot L26, action 26.1 : les CATALOGUES DE RÉFÉRENTIELS entrent en base.
        //
        // ⚠️ **Jusqu'ici, ces catalogues étaient six fichiers JavaScript publiés dans la
        // racine web**, chargés par autant de balises `<script>` et enregistrés au
        // démarrage dans `Referentiels`. Trois conséquences, et aucune n'était
        // théorique : une évolution de norme était une LIVRAISON DE CODE, un client ne
        // pouvait pas apporter sa propre grille, et rien ne DATAIT les catalogues.
        //
        // ⚠️ **Le registre `Referentiels` n'a pas changé d'interface — il a changé de
        // SOURCE.** `get()`, `all()`, `flatExigences()` et `couverture()` sont intacts,
        // et aucun des huit modules qui les appellent n'a à le savoir. C'est le principe
        // qui a permis de basculer vingt-six modules sans en réécrire un seul au lot L2.
        //
        // ⚠️ **Les codes sont la moitié droite de la clé par laquelle toute
        // auto-évaluation est stockée** (`evaluations`, clé `ref_id` + `code`). Le semis
        // de la migration `051` les conserve à l'octet près — il est ENGENDRÉ depuis les
        // fichiers source, qui vivent désormais dans `backend/db/catalogues/` —, et un
        // essai du banc les compare exigence par exigence à chaque exécution.
        "referentiels",
        "referentiel_domaines",
        "referentiel_exigences",
        "referentiel_traductions",
        // v27 — Lot L22, action 22.4 : les connecteurs de collecte automatique.
        //
        // ⚠️ **Les CONSTATS qu'ils produisent ne sont PAS ici, et c'est la ligne qui
        // sépare un réglage d'une preuve.** Un connecteur se refait à l'identique après
        // une reprise ; un constat est une preuve datée, au même titre que le journal
        // d'audit et la main courante de crise, et un fichier éditable lui ôterait sa
        // valeur probante. On ne restaure pas un constat — on en produit un nouveau.
        "connecteurs",
        // v28 — les FICHES RÉFLEXES de crise (migration `061`). Elles étaient écrites
        // EN DUR dans `js/modules/crise.js` : six rôles, vingt-cinq réflexes, sept
        // contacts — dont quatre lignes de tirets bas que personne ne pouvait remplir.
        //
        // ⚠️ **Trois tables MIXTES** : le socle du Groupe est celui qui était en dur, et
        // une filiale le SURCHARGE pour le rôle qu'elle veut adapter. Utilisateur,
        // 22/09/2026 : « elles sont à adapter en fonction de l'existant ».
        //
        // ⚠️ **Elles voyagent ; la MAIN COURANTE non.** Une fiche réflexe est une
        // PROCÉDURE, qu'on refait à l'identique après une reprise ; une main courante
        // est une PREUVE datée. C'est la même ligne qu'entre `connecteurs` et
        // `collectes`, un lot plus tôt.
        "fiches_reflexes",
        "fiche_reflexe_actions",
        "contacts_urgence"
    ];

    const HISTORY_KEEP = 180;   // ~6 mois de points quotidiens

    function emptyData() {
        const d = { schemaVersion: SCHEMA_VERSION };
        ARRAY_FIELDS.forEach(f => { d[f] = []; });
        return d;
    }

    let data = emptyData();

    /**
     * Identifiant métier — **un seul générateur pour tout le produit**.
     *
     * Le magasin portait deux clones de la convention `"<PRÉFIXE>-<horodatage>-
     * <aléa>"` (`upsertEvaluation`, `recordDailySnapshot`), chacun avec son
     * propre tirage sur mille valeurs. Le constat T-1 de la porte S2 a montré ce
     * que cela coûtait : **12 à 29 doublons sur 234** créations consécutives, et
     * autant de lignes perdues à l'import. Un générateur recopié est un
     * générateur qu'on oublie de corriger ; il n'y en a donc plus qu'un.
     *
     * Le repli n'existe que pour l'ordre de chargement des scripts : `ui.js` est
     * chargé après ce fichier, mais tout appel a lieu bien après l'analyse.
     */
    function genId(prefixe) {
        if (typeof UI !== "undefined" && UI.genId) return UI.genId(prefixe);
        return prefixe + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 12);
    }

    // Conservé pour compatibilité de signature : `app.js` appelle encore
    // `setKey(dek)` au démarrage. Le chiffrement au repos est désormais celui du
    // disque de la VM (`PLAN_SERVEUR` §1.9) ; il n'y a plus de clé navigateur.
    function setKey(_cle) { /* sans objet depuis la bascule serveur */ }

    /* =========================
       SATURATION DU STOCKAGE — SANS OBJET DEPUIS LA BASCULE
       Le quota du navigateur ne limite plus rien : les données ne sont plus
       stockées localement. L'observateur reste enregistrable (app.js s'y branche)
       mais n'est jamais appelé. La perte de données ne vient plus d'un quota mais
       d'un refus d'écriture du serveur, que `sync.js` affiche explicitement.
    ========================== */
    let quotaListeners = [];
    function onQuotaExceeded(cb) { if (typeof cb === "function") quotaListeners.push(cb); }

    function normalize(d) {
        const out = Object.assign(emptyData(), d || {});
        ARRAY_FIELDS.forEach(f => {
            out[f] = Array.isArray(out[f]) ? out[f] : [];
        });
        // v9 — Cartographie : chaque actif porte un tableau `dependances` (liens typés
        // actif→actif : { to, type }). On le garantit à la volée (migration transparente,
        // même principe que la création des tableaux d'entités absents).
        out.actifs.forEach(a => {
            if (a && !Array.isArray(a.dependances)) a.dependances = [];
        });
        // v10 — Actions MCO : bascule de l'ancien modèle « vérification récurrente »
        // ({ etat: OK|KO, date, notes }) vers un modèle de suivi d'action planifiée
        // ({ statut, avancement, datePrevue, dateReelle, dateCloture, responsable,
        //   description, priorite }). Migration transparente et idempotente.
        out.mco_actions.forEach(m => {
            if (!m || typeof m !== "object") return;
            if (m.statut === undefined) {
                if (m.etat === "OK") { m.statut = "Réalisée"; if (m.avancement === undefined) m.avancement = 100; }
                else if (m.etat === "KO") { m.statut = "En cours"; }
                else { m.statut = "À planifier"; }
            }
            if (m.dateReelle === undefined && m.date !== undefined) m.dateReelle = m.date;
            if (m.commentaire === undefined && m.notes !== undefined) m.commentaire = m.notes;
            if (m.avancement === undefined) m.avancement = (m.statut === "Réalisée" ? 100 : 0);
            if (m.description === undefined) m.description = "";
            if (m.responsable === undefined) m.responsable = "";
            if (m.priorite === undefined) m.priorite = "Moyenne";
            if (m.frequence === undefined) m.frequence = "Ponctuelle";
            if (m.datePrevue === undefined) m.datePrevue = "";
            if (m.dateReelle === undefined) m.dateReelle = "";
            if (m.dateCloture === undefined) m.dateCloture = "";
            // Purge des clés obsolètes une fois recopiées (idempotent).
            delete m.etat; delete m.date; delete m.notes;
        });
        // v12 — Référentiels : une exigence peut être couverte par PLUSIEURS mesures.
        // Le lien unique `mesure_id` devient un tableau `mesure_ids[]` (l'ancienne valeur
        // unique → tableau à 1 élément). Migration transparente et idempotente.
        out.evaluations.forEach(e => {
            if (!e || typeof e !== "object") return;
            if (!Array.isArray(e.mesure_ids)) {
                e.mesure_ids = (e.mesure_id != null && e.mesure_id !== "") ? [e.mesure_id] : [];
            }
            delete e.mesure_id;
        });
        // v15 — Gouvernance documentaire : un document dit quels CONTRÔLES il prouve
        // (`mesures_ids[]`, action 19.3), et non plus seulement quels référentiels il
        // couvre. On garantit le tableau, comme pour `referentiels[]` : un export
        // antérieur n'en porte aucun, et se reprend à l'identique.
        out.documents.forEach(d => {
            if (d && !Array.isArray(d.mesures_ids)) d.mesures_ids = [];
        // v17 — une analyse d'impact désigne les CONTRÔLES qu'elle prévoit pour
        // traiter les risques (`mesures_ids[]`, action 20.3). Même garantie, et
        // pour la même raison : un tableau absent ferait planter la première
        // itération d'un écran, sur une reprise parfaitement saine.
        (data.analyses_impact || []).forEach(a => {
            if (a && !Array.isArray(a.mesures_ids)) a.mesures_ids = [];
        });
        });
        out.schemaVersion = SCHEMA_VERSION;
        return out;
    }

    /* =========================
       CHARGEMENT / INITIALISATION (async)
       Le jeu de données vient du serveur, et de nulle part ailleurs. En cas
       d'échec, `init()` LÈVE : l'application ne doit pas démarrer sur un jeu
       vide, qui se lirait comme « cette filiale n'a rien saisi ». C'est
       `vault.js` (la porte de démarrage) qui présente l'échec et propose de
       réessayer.
    ========================== */
    async function init() {
        // La porte de démarrage a normalement déjà chargé la session et les
        // données ; si `init()` est appelé seul (essai automatisé), on démarre.
        let charge = (typeof Sync !== "undefined") ? Sync.jeuDeDonnees() : null;
        if (!charge) charge = await Sync.demarrer();

        // Un serveur plus récent que ce frontend enverrait des champs que nous ne
        // saurions ni afficher ni réécrire : mieux vaut refuser que perdre.
        if (charge.schemaVersion > SCHEMA_VERSION) {
            throw new Error("Le serveur utilise une version de modèle (" + charge.schemaVersion +
                ") plus récente que cette application (" + SCHEMA_VERSION + "). Mettez l'application à jour.");
        }

        data = normalize(charge.data);
        hydraterCatalogues();

        Sync.brancher({
            collections: ARRAY_FIELDS,
            lire: () => data,
            remplacer: (nouveau) => { data = normalize(nouveau); hydraterCatalogues(); }
        });
        Sync.adopterJeu(data);
        Sync.installerFilets();
        Sync.demarrerSondage();
    }

    /**
     * Reconstruit le registre `Referentiels` depuis les collections du jeu de
     * données (lot L26, action 26.1).
     *
     * ⚠️ **Appelée aux DEUX endroits où `data` est remplacé**, et pas ailleurs :
     * le chargement initial et le rechargement (changement de filiale, reprise,
     * sondage qui rapporte des modifications). C'est le seul point de passage de
     * la donnée, et en placer un troisième ferait diverger les catalogues de ce
     * que les écrans lisent — sans que rien ne le dise.
     *
     * ⚠️ **Elle ne lève jamais.** Une base antérieure à la migration `051` rend
     * des collections vides, et le registre reste alors tel quel plutôt que
     * d'être VIDÉ : un écran de conformité sans aucun référentiel n'afficherait
     * ni erreur ni contenu — il aurait l'air de dire « vous n'avez rien à
     * évaluer », ce qui est faux et rassurant.
     */
    function hydraterCatalogues() {
        if (typeof Referentiels === "undefined") return;
        if (typeof Referentiels.hydrater !== "function") return;
        Referentiels.hydrater(data);
    }

    /* =========================
       ENREGISTREMENT
       `save()` reste le point d'entrée SYNCHRONE appelé par tous les modules.
       Il ne persiste plus rien lui-même : il signale que la mémoire a bougé, et
       `sync.js` calcule l'écriture ciblée (`PLAN_SERVEUR` §1.3).
    ========================== */
    function save() {
        data.updatedAt = Date.now();
        if (typeof Sync !== "undefined") Sync.marquerModification();
    }

    // Force l'envoi immédiat et attend le serveur. Utilisé après un import en
    // masse. La forme du retour est conservée (`importExcel.js` la lit) ;
    // `quota` vaut désormais toujours faux — le quota du navigateur ne limite
    // plus rien, et un refus du serveur est signalé par son propre bandeau.
    async function flush() {
        if (typeof Sync === "undefined") return { ok: false, quota: false };
        const r = await Sync.pousser();
        return { ok: !!(r && r.ok), quota: false };
    }

    /* =========================
       POINTS DE RESTAURATION LOCAUX — RETIRÉS
       Ils dupliquaient toute la base dans le navigateur. La sauvegarde et la
       restauration sont désormais celles du serveur (`PLAN_SERVEUR` §1.8 :
       archivage continu des journaux de transactions, RPO de quelques minutes),
       et l'utilisateur n'a plus à s'en occuper. Les fonctions restent déclarées
       pour que l'écran Paramètres, qui n'est pas du ressort de ce lot, continue
       de fonctionner : il affiche alors « aucun point de restauration ».
    ========================== */
    function createManualBackup(_label) { return Promise.resolve(false); }
    function listBackups() { return Promise.resolve([]); }
    function restoreBackup(_id) { return Promise.resolve(false); }
    function deleteBackup(_id) { return Promise.resolve(false); }

    /* =========================
       CHIFFREMENT AU REPOS — RETIRÉ
       `PLAN_SERVEUR` §1.9 : « Chiffrement au repos assuré par le chiffrement
       disque de la VM (le coffre navigateur disparaît) ». Les fonctions
       refusent explicitement plutôt que de disparaître : un appel résiduel doit
       s'entendre, pas échouer sur un `undefined`.
    ========================== */
    const MESSAGE_COFFRE =
        "Le coffre du navigateur a été retiré : les données ne sont plus stockées sur ce poste. " +
        "Le chiffrement au repos est celui du disque du serveur.";
    function isEncrypted() { return false; }
    function enableEncryption(_cle) { return Promise.reject(new Error(MESSAGE_COFFRE)); }
    function disableEncryption() { return Promise.resolve(true); }

    /* =========================
       INFOS STOCKAGE
       Même forme qu'avant (l'écran Paramètres la lit telle quelle), mais elle
       décrit désormais la liaison au serveur et non le stockage du navigateur.
    ========================== */
    async function getStorageInfo() {
        const bytes = new Blob([JSON.stringify(data)]).size;
        const counts = {};
        ARRAY_FIELDS.forEach(f => { counts[f] = data[f].length; });
        const etat = (typeof Sync !== "undefined") ? Sync.etat() : null;
        const filiale = (typeof Session !== "undefined") ? Session.libelleFiliale() : "";
        return {
            engine: "Serveur" + (filiale ? " — " + filiale : ""),
            encrypted: false,
            bytes,
            estimate: null,
            backupCount: 0,
            lastSavedAt: etat ? etat.dernierEnregistrement : 0,
            counts,
            updatedAt: data.updatedAt || null,
            // Champs neufs, sans incidence sur l'affichage existant.
            enAttente: etat ? etat.enAttente : false,
            enCours: etat ? etat.enCours : false,
            bloques: etat ? etat.bloques : 0,
            panneReseau: etat ? etat.panneReseau : false,
            incidents: etat ? etat.incidents : 0
        };
    }

    /* =========================
       CLIENTS (DONNEURS D'ORDRE)
    ========================== */
    function getClients() { return data.clients; }
    function getClientById(id) { return data.clients.find(c => c.id === id); }
    function addClient(client) { data.clients.push(client); save(); }
    function updateClient(client) {
        const i = data.clients.findIndex(c => c.id === client.id);
        if (i !== -1) { data.clients[i] = client; save(); }
    }
    function deleteClient(id) {
        data.clients = data.clients.filter(c => c.id !== id);
        const exigencesToDel = data.exigences.filter(e => e.client_id === id);
        exigencesToDel.forEach(e => deleteExigence(e.id));
        save();
    }

    /* =========================
       EXIGENCES (ADAPTÉES CLIENT)
    ========================== */
    function getExigences() { return data.exigences; }
    function getExigencesByClient(clientId) {
        if (!clientId || clientId === "global") return data.exigences;
        return data.exigences.filter(e => e.client_id === clientId);
    }
    function getExigenceById(id) { return data.exigences.find(e => e.id === id); }
    function addExigence(exigence) { data.exigences.push(exigence); save(); }
    function updateExigence(exigence) {
        const i = data.exigences.findIndex(e => e.id === exigence.id);
        if (i !== -1) { data.exigences[i] = exigence; save(); }
    }
    function deleteExigence(id) {
        data.exigences = data.exigences.filter(e => e.id !== id);
        data.risques.forEach(r => {
            if (Array.isArray(r.exigences_liees)) {
                r.exigences_liees = r.exigences_liees.filter(eid => eid !== id);
            }
        });
        data.actions = data.actions.filter(a => a.exigence_id !== id);
        save();
    }

    /* =========================
       ACTIONS
    ========================== */
    function getActions() { return data.actions; }
    function getActionById(id) { return data.actions.find(a => a.id === id); }
    function getActionsByExigence(exigenceId) { return data.actions.filter(a => a.exigence_id === exigenceId); }
    function getActionsByRisque(risqueId) { return data.actions.filter(a => a.risque_id === risqueId); }
    function getActionsByEvaluation(evaluationId) { return data.actions.filter(a => a.evaluation_id === evaluationId); }
    function getActionsByIncident(incidentId) { return data.actions.filter(a => a.incident_id === incidentId); }
    function getActionsByMesure(mesureId) { return data.actions.filter(a => a.mesure_id === mesureId); }
    function addAction(action) { data.actions.push(action); save(); }
    function updateAction(action) {
        const i = data.actions.findIndex(a => a.id === action.id);
        if (i !== -1) { data.actions[i] = action; save(); }
    }
    function deleteAction(id) { data.actions = data.actions.filter(a => a.id !== id); save(); }

    /* =========================
       RISQUES
    ========================== */
    function getRisques() { return data.risques; }
    function getRisqueById(id) { return data.risques.find(r => r.id === id); }
    function addRisque(risque) { data.risques.push(risque); save(); }
    function updateRisque(risque) {
        const i = data.risques.findIndex(r => r.id === risque.id);
        if (i !== -1) { data.risques[i] = risque; save(); }
    }
    function deleteRisque(id) {
        data.risques = data.risques.filter(r => r.id !== id);
        data.actifs.forEach(a => {
            if (Array.isArray(a.risques_lies)) {
                a.risques_lies = a.risques_lies.filter(rid => rid !== id);
            }
        });
        data.actions = data.actions.filter(a => a.risque_id !== id);
        data.incidents.forEach(inc => { if (inc.risque_id === id) inc.risque_id = null; });   // délie les incidents
        // v25 — la quantification suit son risque, comme la base le fait (cascade).
        //
        // ⚠️ **C'est la classe de défaut du 18/09**, et elle vaut d'être nommée : la base
        // cascade, la façade en mémoire ne le refaisait pas, et l'échéancier gardait
        // l'échéance d'un questionnaire dont le porteur venait d'être supprimé. Aucune
        // des deux moitiés n'a tort seule — c'est exactement pourquoi le banc ne le voit
        // pas. *Un défaut peut ne vivre ni dans la base, ni dans la route, mais dans
        // l'écart entre deux cascades.*
        data.risque_quantification = data.risque_quantification.filter(q => q.risque_id !== id);
        // Et le scénario opérationnel se DÉLIE, il ne disparaît pas : la clé est en
        // « set null (risque_id) », parce que rattacher un scénario à un risque du
        // registre est un LIEN, pas une conversion (action 25.1).
        data.ebios_scenarios_operationnels.forEach(sc => {
            if (sc.risque_id === id) sc.risque_id = null;
        });
        save();
    }

    /* =========================
       ACTIFS
    ========================== */
    function getActifs() { return data.actifs; }
    function getActifById(id) { return data.actifs.find(a => a.id === id); }
    function addActif(actif) { data.actifs.push(actif); save(); }
    function updateActif(actif) {
        const i = data.actifs.findIndex(a => a.id === actif.id);
        if (i !== -1) { data.actifs[i] = actif; save(); }
    }
    function deleteActif(id) {
        data.actifs = data.actifs.filter(a => a.id !== id);
        data.incidents.forEach(inc => {
            if (Array.isArray(inc.actifs_touches)) inc.actifs_touches = inc.actifs_touches.filter(aid => aid !== id);
        });
        // Cartographie (v9) : purge les dépendances des autres actifs qui pointaient
        // vers l'actif supprimé (évite les arêtes orphelines dans le graphe).
        data.actifs.forEach(a => {
            if (Array.isArray(a.dependances)) a.dependances = a.dependances.filter(dep => dep && dep.to !== id);
        });
        save();
    }

    /* =========================
       PROCESSUS (BIA)
    ========================== */
    function getProcessus() { return data.processus; }
    function getProcessusById(id) { return data.processus.find(p => p.id === id); }
    function addProcessus(processus) { data.processus.push(processus); save(); }
    function updateProcessus(processus) {
        const i = data.processus.findIndex(p => p.id === processus.id);
        if (i !== -1) { data.processus[i] = processus; save(); }
    }
    function deleteProcessus(id) { data.processus = data.processus.filter(p => p.id !== id); save(); }

    /* =========================
       CELLULE DE CRISE
    ========================== */
    function getCriseMembres() { return data.crise; }
    function getCriseMembreById(id) { return data.crise.find(c => c.id === id); }
    function addCriseMembre(membre) { data.crise.push(membre); save(); }
    function updateCriseMembre(membre) {
        const i = data.crise.findIndex(c => c.id === membre.id);
        if (i !== -1) { data.crise[i] = membre; save(); }
    }
    function deleteCriseMembre(id) { data.crise = data.crise.filter(c => c.id !== id); save(); }

    /* =========================
       SCÉNARIOS PRA / PCA
    ========================== */
    function getScenariosPra() { return data.scenarios_pra; }
    function getScenarioPraById(id) { return data.scenarios_pra.find(s => s.id === id); }
    function addScenarioPra(scenario) { data.scenarios_pra.push(scenario); save(); }
    function updateScenarioPra(scenario) {
        const i = data.scenarios_pra.findIndex(s => s.id === scenario.id);
        if (i !== -1) { data.scenarios_pra[i] = scenario; save(); }
    }
    function deleteScenarioPra(id) {
        data.scenarios_pra = data.scenarios_pra.filter(s => s.id !== id);
        // Cascade : on retire les tests rattachés (sinon ils deviennent orphelins).
        data.tests_pra = data.tests_pra.filter(t => t.scenario_id !== id);
        save();
    }

    /* =========================
       TESTS PRA (MAINTIEN EN CONDITION)
    ========================== */
    function getTestsPra() { return data.tests_pra; }
    function getTestPraById(id) { return data.tests_pra.find(t => t.id === id); }
    function addTestPra(test) { data.tests_pra.push(test); save(); }
    function updateTestPra(test) {
        const i = data.tests_pra.findIndex(t => t.id === test.id);
        if (i !== -1) { data.tests_pra[i] = test; save(); }
    }
    function deleteTestPra(id) { data.tests_pra = data.tests_pra.filter(t => t.id !== id); save(); }
    function getTestsByScenario(scenarioId) { return data.tests_pra.filter(t => t.scenario_id === scenarioId); }
    // Tests dont le scénario n'existe plus (orphelins hérités d'anciennes suppressions).
    function getOrphanTests() {
        const ids = new Set(data.scenarios_pra.map(s => s.id));
        return data.tests_pra.filter(t => !ids.has(t.scenario_id));
    }
    function deleteOrphanTests() {
        const ids = new Set(data.scenarios_pra.map(s => s.id));
        const before = data.tests_pra.length;
        data.tests_pra = data.tests_pra.filter(t => ids.has(t.scenario_id));
        const removed = before - data.tests_pra.length;
        if (removed > 0) save();
        return removed;
    }

    /* =========================
       PRESTATAIRES & CONTACTS EXTERNES
    ========================== */
    function getPrestataires() { return data.prestataires; }
    function addPrestataire(p) { data.prestataires.push(p); save(); }
    function updatePrestataire(p) {
        const i = data.prestataires.findIndex(x => x.id === p.id);
        if (i !== -1) { data.prestataires[i] = p; save(); }
    }
    /**
     * ⚠️ **La cascade du serveur doit se REFAIRE ici, sinon l'écran affirme le
     * contraire de ce qui est en base.** Les trois tables de L21 pendent au
     * prestataire par une clé `on delete cascade` : la base les emporte, la façade
     * en mémoire les gardait. Mesuré au navigateur sur la recette le 18/09/2026 —
     * après suppression du tiers, l'échéancier annonçait encore l'échéance de son
     * questionnaire, et le badge de la barre latérale la comptait. Le banc ne
     * pouvait pas le voir : il éprouve la cascade EN BASE, où elle est juste.
     *
     * C'est la classe du constat **Q-201 / Q-207** — le produit affirme une chose
     * qui n'est pas —, et la parade est celle de `deleteActif` et
     * `deleteScenarioPra` : purger les dépendants dans le même geste.
     */
    function deletePrestataire(id) {
        data.prestataires = data.prestataires.filter(x => x.id !== id);
        // Les arêtes de sous-traitance, des DEUX côtés : le tiers supprimé pouvait
        // être donneur d'ordre comme sous-traitant (migration `042`).
        data.prestataire_sous_traitance = data.prestataire_sous_traitance.filter(
            a => a.prestataire_id !== id && a.sous_traitant_id !== id);
        // Les questionnaires, puis leurs réponses — l'ordre importe pour retrouver
        // les identifiants avant de perdre leurs porteurs.
        const emportes = data.questionnaires_tiers.filter(q => q.prestataire_id === id).map(q => q.id);
        data.questionnaires_tiers = data.questionnaires_tiers.filter(q => q.prestataire_id !== id);
        data.questionnaire_reponses = data.questionnaire_reponses.filter(
            r => !emportes.includes(r.questionnaire_id));
        save();
    }

    /* =========================
       MCO / ACTIONS PRÉALABLES
    ========================== */
    function getMcoActions() { return data.mco_actions; }
    function addMcoAction(a) { data.mco_actions.push(a); save(); }
    function updateMcoAction(a) {
        const i = data.mco_actions.findIndex(x => x.id === a.id);
        if (i !== -1) { data.mco_actions[i] = a; save(); }
    }
    function deleteMcoAction(id) { data.mco_actions = data.mco_actions.filter(x => x.id !== id); save(); }

    /* =========================
       AUDITS & REVUES DE DIRECTION
       (désormais intégrés à la sauvegarde unifiée ; audits.js les utilise via
       le garde `if (!DataStore.getAudits)` et n'a donc pas besoin de changer)
    ========================== */
    function getAudits() { return data.audits; }
    function addAudit(a) { data.audits.push(a); save(); }
    function updateAudit(a) {
        const i = data.audits.findIndex(x => x.id === a.id);
        if (i !== -1) { data.audits[i] = a; save(); }
    }
    function deleteAudit(id) { data.audits = data.audits.filter(x => x.id !== id); save(); }

    function getRevues() { return data.revues; }
    function addRevue(r) { data.revues.push(r); save(); }
    function updateRevue(r) {
        const i = data.revues.findIndex(x => x.id === r.id);
        if (i !== -1) { data.revues[i] = r; save(); }
    }
    function deleteRevue(id) { data.revues = data.revues.filter(x => x.id !== id); save(); }

    /* =========================
       ÉVALUATIONS DE RÉFÉRENTIELS (auto-évaluation par exigence de référentiel)
       Clé métier : (ref_id, code) unique. L'enregistrement est créé à la première
       évaluation ; une exigence sans enregistrement = « non évaluée ».
       { id, ref_id, code, statut, maturite (0-5), commentaire, preuves, mesure_ids[], updatedAt }
       mesure_ids[] (v12) : plusieurs mesures de sécurité peuvent couvrir une même exigence.
    ========================== */
    function getEvaluations() { return data.evaluations; }
    function getEvaluationById(id) { return data.evaluations.find(e => e.id === id); }
    function getEvaluationsByRef(refId) { return data.evaluations.filter(e => e.ref_id === refId); }
    function getEvaluation(refId, code) { return data.evaluations.find(e => e.ref_id === refId && e.code === code); }

    // Crée ou met à jour l'évaluation d'une exigence de référentiel (clé ref_id + code).
    // Les champs absents de `ev` sont conservés (mise à jour partielle).
    function upsertEvaluation(ev) {
        if (!ev || !ev.ref_id || !ev.code) return null;
        const existing = getEvaluation(ev.ref_id, ev.code);
        if (existing) {
            Object.assign(existing, ev, { id: existing.id, updatedAt: Date.now() });
            save();
            return existing;
        }
        const rec = Object.assign(
            { statut: "non conforme", maturite: 0, commentaire: "", preuves: "", mesure_ids: [] },
            ev,
            { id: genId("EVAL"), updatedAt: Date.now() }
        );
        data.evaluations.push(rec);
        save();
        return rec;
    }

    function deleteEvaluation(id) {
        data.evaluations = data.evaluations.filter(e => e.id !== id);
        data.actions = data.actions.filter(a => a.evaluation_id !== id);   // cascade des actions liées
        save();
    }

    // Réinitialise un référentiel : supprime toutes ses évaluations et leurs actions.
    function deleteEvaluationsByRef(refId) {
        const ids = new Set(data.evaluations.filter(e => e.ref_id === refId).map(e => e.id));
        data.evaluations = data.evaluations.filter(e => e.ref_id !== refId);
        data.actions = data.actions.filter(a => !ids.has(a.evaluation_id));
        save();
    }

    // Ajoute/retire une mesure à la COUVERTURE d'une exigence (v12, lien n-n `mesure_ids[]`).
    // À l'ajout, crée l'évaluation « non évaluée » (statut "") si besoin, pour ne pas fausser le score.
    function addMesureToEvaluation(refId, code, mesureId) {
        if (!refId || !code || !mesureId) return null;
        let ev = getEvaluation(refId, code);
        if (!ev) ev = upsertEvaluation({ ref_id: refId, code: code, statut: "", maturite: 0 });
        if (!Array.isArray(ev.mesure_ids)) ev.mesure_ids = [];
        if (ev.mesure_ids.indexOf(mesureId) === -1) { ev.mesure_ids.push(mesureId); ev.updatedAt = Date.now(); save(); }
        return ev;
    }
    function removeMesureFromEvaluation(refId, code, mesureId) {
        const ev = getEvaluation(refId, code);
        if (!ev || !Array.isArray(ev.mesure_ids)) return ev;
        const before = ev.mesure_ids.length;
        ev.mesure_ids = ev.mesure_ids.filter(id => id !== mesureId);
        if (ev.mesure_ids.length !== before) { ev.updatedAt = Date.now(); save(); }
        return ev;
    }

    /* =========================
       MESURES DE SÉCURITÉ (entité pivot n-n vers les exigences de référentiels)
       { id, nom, description, statut, maturite (0-5), responsable, updatedAt }
       Le lien vers les exigences couvertes est porté par evaluations[].mesure_ids[] :
       une mesure couvre N évaluations, une exigence peut être couverte par plusieurs
       mesures (v12). Propager une mesure recalcule le statut des exigences liées « au plus
       défavorable » à partir de TOUTES leurs mesures (une exigence ne vaut que par sa mesure
       la plus faible → zéro double saisie).
    ========================== */
    function getMesures() { return data.mesures; }
    function getMesureById(id) { return data.mesures.find(m => m.id === id); }
    function getEvaluationsByMesure(mesureId) { return data.evaluations.filter(e => Array.isArray(e.mesure_ids) && e.mesure_ids.indexOf(mesureId) !== -1); }
    function addMesure(m) { data.mesures.push(m); save(); }
    function updateMesure(m) {
        const i = data.mesures.findIndex(x => x.id === m.id);
        if (i !== -1) { data.mesures[i] = m; save(); }
    }
    function deleteMesure(id) {
        data.mesures = data.mesures.filter(m => m.id !== id);
        data.evaluations.forEach(e => { if (Array.isArray(e.mesure_ids)) e.mesure_ids = e.mesure_ids.filter(mid => mid !== id); });   // délie les évaluations
        data.actions.forEach(a => { if (a.mesure_id === id) a.mesure_id = null; });        // délie les actions (conservées dans le plan)
        data.traitements.forEach(t => {                                                   // délie les traitements RGPD
            if (Array.isArray(t.mesures_ids)) t.mesures_ids = t.mesures_ids.filter(mid => mid !== id);
        });
        save();
    }

    // Agrège plusieurs mesures « au plus défavorable » (v12) : statut = le plus faible parmi
    // les mesures évaluées (conforme seulement si TOUTES le sont), maturité = la plus basse.
    // « non applicable » n'entre pas dans le pire cas (neutre) ; retenu seulement si toutes le sont.
    // « non évalué » ("") est ignoré. Aucune mesure évaluée → statut "" (non évalué).
    function aggregateFromMesures(mesureIds) {
        const RANK = { "non conforme": 0, "partiellement conforme": 1, "conforme": 2 };
        let worst = null, worstRank = 99, minMat = null, anyNA = false;
        (mesureIds || []).forEach(mid => {
            const m = getMesureById(mid);
            if (!m) return;
            const s = m.statut || "";
            if (s === "non applicable") { anyNA = true; return; }
            if (s in RANK) {
                if (RANK[s] < worstRank) { worstRank = RANK[s]; worst = s; }
                const mat = Number(m.maturite) || 0;
                if (minMat === null || mat < minMat) minMat = mat;
            }
        });
        if (worst !== null) return { statut: worst, maturite: minMat === null ? 0 : minMat };
        if (anyNA) return { statut: "non applicable", maturite: 0 };
        return { statut: "", maturite: 0 };
    }

    // Propage vers les exigences couvertes par la mesure `id` : chaque exigence est recalculée
    // « au plus défavorable » à partir de TOUTES ses mesures liées. Retourne le nombre d'exigences maj.
    function propagateMesure(id) {
        const m = getMesureById(id);
        if (!m) return 0;
        let n = 0;
        const touchees = [];
        data.evaluations.forEach(e => {
            if (Array.isArray(e.mesure_ids) && e.mesure_ids.indexOf(id) !== -1) {
                const agg = aggregateFromMesures(e.mesure_ids);
                e.statut = agg.statut;
                e.maturite = agg.maturite;
                e.updatedAt = Date.now();
                touchees.push(e.id);
                n++;
            }
        });
        if (n > 0) {
            // Le recalcul ci-dessus rend l'écran juste immédiatement (la façade
            // reste synchrone). Mais une propagation est une opération COMPOSITE :
            // elle doit réussir entièrement ou pas du tout (contrôle S14). C'est
            // donc le serveur qui la rejoue dans une transaction unique, et son
            // résultat qui fait foi — voir `sync.js`.
            if (typeof Sync !== "undefined") Sync.marquerPropagation(id, touchees);
            save();
        }
        return n;
    }

    /* =========================
       PERSONNEL / ANNUAIRE (v11)
       { id, nom, fonction, service, email, telephone, notes }
       Annuaire réutilisé pour l'autocomplétion des champs « responsable ». Les entités
       continuent de stocker le NOM en texte (rétrocompatible) ; l'annuaire ne fait
       qu'alimenter les suggestions et la fiche « affectations » (correspondance par nom).
    ========================== */
    function getPersonnes() { return data.personnes; }
    function getPersonneById(id) { return data.personnes.find(p => p.id === id); }
    function addPersonne(p) { data.personnes.push(p); save(); }
    function updatePersonne(p) {
        const idx = data.personnes.findIndex(x => x.id === p.id);
        if (idx !== -1) { data.personnes[idx] = p; save(); }
    }
    function deletePersonne(id) { data.personnes = data.personnes.filter(p => p.id !== id); save(); }
    // Noms distincts, triés, pour l'autocomplétion (datalist partagé).
    function getPersonneNames() {
        const seen = new Set();
        const out = [];
        data.personnes.forEach(p => {
            const nom = (p && p.nom || "").trim();
            if (nom && !seen.has(nom.toLowerCase())) { seen.add(nom.toLowerCase()); out.push(nom); }
        });
        return out.sort((a, b) => a.localeCompare(b, "fr"));
    }

    /* =========================
       INCIDENTS DE SÉCURITÉ (v4)
       { id, titre, type, gravite, statut, date_detection, date_resolution,
         description, actions_immediates, cause_racine, actifs_touches[], risque_id,
         declaration_anssi, declaration_cnil, updatedAt }
       Les actions correctives pointent vers l'incident via action.incident_id.
    ========================== */
    function getIncidents() { return data.incidents; }
    function getIncidentById(id) { return data.incidents.find(i => i.id === id); }
    function addIncident(inc) { data.incidents.push(inc); save(); }
    function updateIncident(inc) {
        const idx = data.incidents.findIndex(x => x.id === inc.id);
        if (idx !== -1) { data.incidents[idx] = inc; save(); }
    }
    function deleteIncident(id) {
        data.incidents = data.incidents.filter(i => i.id !== id);
        data.actions = data.actions.filter(a => a.incident_id !== id);   // cascade des actions liées
        save();
    }

    /* =========================
       DOCUMENTS / POLITIQUES (v5, classifiés depuis la migration 027)
       { id, titre, type, version, proprietaire, statut, date_revue, emplacement,
         referentiels[], mesures_ids[], confidentialite, donnees_personnelles, traitement_id,
         etiquettes[], notes, updatedAt }

       ⚠️ La ligne « ne stocke PAS les fichiers » qui figurait ici était vraie du
       produit navigateur et FAUSSE depuis le lot L6 : l'application détient les
       pièces jointes d'une fiche, les analyse, les empreinte et les délivre.
       `emplacement` ne désigne, lui, qu'un document resté ailleurs.

       `confidentialite` vaut « interne » à défaut — jamais « public » : un
       document dont personne n'a tranché la diffusion ne doit pas être réputé
       diffusable. C'est aussi ce que devient un document repris d'un export
       antérieur à `027`, et c'est le seul défaut acceptable.
    ========================== */
    function getDocuments() { return data.documents; }
    function getDocumentById(id) { return data.documents.find(d => d.id === id); }
    function addDocument(doc) { data.documents.push(doc); save(); }
    function updateDocument(doc) {
        const idx = data.documents.findIndex(x => x.id === doc.id);
        if (idx !== -1) { data.documents[idx] = doc; save(); }
    }
    function deleteDocument(id) { data.documents = data.documents.filter(d => d.id !== id); save(); }

    /* =========================
       DÉROGATIONS — écarts de conformité assumés (v14, action 19.2)
       { id, exigence_id, proprietaire, motif, accordee_le, echeance,
         compensation, updatedAt }

       ⚠️ **Aucun champ d'état, et c'est le cœur de l'action.** « En vigueur »,
       « échue », « en attente » ne se stockent pas : ils se dérivent, côté
       serveur, de l'échéance et de la décision du circuit d'approbation
       (`GET /api/derogations/etat`). Les poser ici obligerait quelque chose à
       repasser pour les remettre à jour — et le jour où ce quelque chose ne
       repasse pas, le produit affirme une conformité qui n'existe plus.
    ========================== */
    function getDerogations() { return data.derogations; }
    function getDerogationById(id) { return data.derogations.find(d => d.id === id); }
    function getDerogationsByExigence(exigenceId) {
        return data.derogations.filter(d => d.exigence_id === exigenceId);
    }
    function addDerogation(d) { data.derogations.push(d); save(); }
    function updateDerogation(d) {
        const idx = data.derogations.findIndex(x => x.id === d.id);
        if (idx !== -1) { data.derogations[idx] = d; save(); }
    }
    function deleteDerogation(id) {
        data.derogations = data.derogations.filter(d => d.id !== id); save();
    }

    /* =========================
       CHAÎNE DE SOUS-TRAITANCE DES TIERS (v19, action 21.1)
       { id, prestataire_id, sous_traitant_id, service,
         dans_fonction_critique, updatedAt }

       ⚠️ **Aucun champ de RANG, et c'est le cœur de l'action.** « Rang 1,
       rang 2, rang n » ne se stockent pas : ils se DÉRIVENT du parcours du
       graphe, côté serveur (`GET /api/tiers/chaine/:id`). Les poser ici
       obligerait quelque chose à les décaler à chaque intercalation d'un
       maillon — et le jour où ce quelque chose ne repasse pas, le registre
       d'information remis à l'autorité annonce des rangs faux, en silence.

       ⚠️ **L'anti-cycle n'est pas ici non plus.** Une arête qui refermerait une
       boucle est refusée PAR LA BASE (code `GRC08`) : il y a quatre chemins
       d'écriture — cette façade, l'import généralisé, la reprise d'un export et
       `psql` —, et un contrôle posé ici n'en verrait qu'un.
    ========================== */
    function getSousTraitances() { return data.prestataire_sous_traitance; }
    function getSousTraitancesDe(prestataireId) {
        return data.prestataire_sous_traitance.filter(a => a.prestataire_id === prestataireId);
    }
    function addSousTraitance(a) { data.prestataire_sous_traitance.push(a); save(); }
    function deleteSousTraitance(id) {
        data.prestataire_sous_traitance =
            data.prestataire_sous_traitance.filter(a => a.id !== id);
        save();
    }

    /* =========================
       QUESTIONNAIRES FOURNISSEURS (v20, action 21.2)
       questionnaires_tiers  : { id, prestataire_id, ref_id, intitule,
                                 envoye_le, echeance, relance_le, recu_le, notes }
       questionnaire_reponses: { id, questionnaire_id, code, reponse,
                                 commentaire, preuve }

       ⚠️ **Aucun champ d'état.** « En retard » se DÉRIVE des dates, côté
       serveur (`f_etat_questionnaire`). Le poser ici obligerait quelque chose à
       repasser — et le jour où ce quelque chose ne repasse pas, aucun retard
       n'apparaît, dans le dossier même qui sert à démontrer la maîtrise de sa
       chaîne d'approvisionnement.

       ⚠️ **Et aucun texte de question** : `code` fait la jointure avec le
       catalogue du référentiel (`js/data/ref_*.js`), exactement comme
       `evaluations(ref_id, code)` depuis le premier chantier.
    ========================== */
    function getQuestionnaires() { return data.questionnaires_tiers; }
    function getQuestionnaireById(id) {
        return data.questionnaires_tiers.find(q => q.id === id);
    }
    function getQuestionnairesDe(prestataireId) {
        return data.questionnaires_tiers.filter(q => q.prestataire_id === prestataireId);
    }
    function addQuestionnaire(q) { data.questionnaires_tiers.push(q); save(); }
    function updateQuestionnaire(q) {
        const idx = data.questionnaires_tiers.findIndex(x => x.id === q.id);
        if (idx !== -1) { data.questionnaires_tiers[idx] = q; save(); }
    }
    function deleteQuestionnaire(id) {
        data.questionnaires_tiers = data.questionnaires_tiers.filter(q => q.id !== id);
        // La cascade de la base emporte les réponses ; on la reflète en mémoire
        // pour que l'écran ne montre pas des réponses sans envoi entre la
        // suppression et le prochain chargement.
        data.questionnaire_reponses =
            data.questionnaire_reponses.filter(r => r.questionnaire_id !== id);
        save();
    }
    /* =========================
       CAMPAGNES DESCENDANTES (v21, actions 24.1 et 24.2)
       campagnes         : { id, ref_id, intitule, ouverte_le, echeance, close_le, notes }
       campagne_filiales : { id, campagne_id, repondant, accuse_le, termine_le, notes }

       ⚠️ **Aucun champ d'état, aucun avancement.** « En retard » et « terminé » se
       DÉRIVENT des dates côté serveur (`f_etat_campagne`, `f_etat_part_campagne`), et
       l'avancement se COMPTE dans les évaluations. Les poser ici obligerait quelque
       chose à les remettre — et le jour où ce quelque chose ne repasse pas, le produit
       affirmerait qu'une filiale a répondu quand elle n'a rien fait.

       ⚠️ **`campagne_filiales` ne porte pas de nom de filiale**, et ce n'est pas un
       oubli : une filiale ne voit que sa part, et le serveur retire `filiale_id` de tout
       ce qu'il expose. L'écran de suivi consolidé lit `GET /api/campagnes/etat`, qui
       nomme les filiales SOUS la politique de cloisonnement.
    ========================== */
    function getCampagnes() { return data.campagnes; }
    function getCampagneById(id) { return data.campagnes.find(c => c.id === id); }
    function addCampagne(c) { data.campagnes.push(c); save(); }
    function updateCampagne(c) {
        const i = data.campagnes.findIndex(x => x.id === c.id);
        if (i !== -1) { data.campagnes[i] = c; save(); }
    }
    /**
     * ⚠️ La cascade du serveur est en `restrict`, pas en `cascade` (§18.2 : une clé
     * d'une table cloisonnée vers une table de niveau Groupe ne détruit pas la donnée
     * des filiales). Supprimer une campagne exige donc de DÉCONVOQUER d'abord, et cette
     * fonction refait le même ordre en mémoire pour que l'écran ne montre pas des parts
     * sans campagne — la classe du défaut trouvé au navigateur le 18/09/2026.
     */
    function deleteCampagne(id) {
        data.campagne_filiales = data.campagne_filiales.filter(p => p.campagne_id !== id);
        data.campagnes = data.campagnes.filter(c => c.id !== id);
        save();
    }
    /**
     * Toutes les parts VISIBLES, c'est-à-dire celles que la politique de cloisonnement
     * du serveur a laissées passer. ⚠️ Le nom dit « visibles » et non « toutes » à
     * dessein : pour une filiale, la collection ne contient QUE la sienne, et un appelant
     * qui croirait y lire la liste des convoquées se tromperait sur ce qu'il compte.
     */
    function getPartsCampagneVisibles() { return data.campagne_filiales; }
    function getPartsCampagne(campagneId) {
        return data.campagne_filiales.filter(p => p.campagne_id === campagneId);
    }
    function getPartCampagneById(id) { return data.campagne_filiales.find(p => p.id === id); }
    function updatePartCampagne(p) {
        const i = data.campagne_filiales.findIndex(x => x.id === p.id);
        if (i !== -1) { data.campagne_filiales[i] = p; save(); }
    }

    function getReponsesDe(questionnaireId) {
        return data.questionnaire_reponses.filter(r => r.questionnaire_id === questionnaireId);
    }
    function addReponse(r) { data.questionnaire_reponses.push(r); save(); }
    function updateReponse(r) {
        const idx = data.questionnaire_reponses.findIndex(x => x.id === r.id);
        if (idx !== -1) { data.questionnaire_reponses[idx] = r; save(); }
    }

    /* =========================
       ÉCHELLES DE COTATION (v24, action 25.3)

       echelles        : { id, sujet, nom, revision, statut, remplace_id, description,
                           en_vigueur_le, archivee_le }
       echelle_niveaux : { id, echelle_id, valeur, libelle, description }

       ⚠️ **Le produit n'écrit JAMAIS l'échelle d'une cotation depuis ici.** C'est le
       serveur qui l'estampille, dans `src/entites/`, au moment où la cotation part —
       seule couche qui distingue « l'écran n'a rien dit » de « l'écran a dit : pas
       d'échelle ». Un écran qui s'en chargerait serait une omission qui attend : le
       moteur d'import du lot L7 écrit lui aussi des cotations, et il ne passe par aucun
       écran.

       ⚠️ **`echelle_*_id` NUL ne veut pas dire « échelle du Groupe »** : il veut dire
       « échelle non tracée », et c'est ce que les fiches affichent. Toute cotation
       antérieure à la v24 est dans ce cas, et lui attribuer d'office la graduation du
       jour inventerait un fait (motif du constat Q-192).

       ⚠️ Une échelle PUBLIÉE est FIGÉE — la base le tient, pas ces fonctions. Modifier
       une graduation en service changerait ce que des cotations déjà produites veulent
       dire, sans que rien ne bouge à l'écran : on en publie une RÉVISION.
    ========================== */
    function getEchelles() { return data.echelles; }
    function getEchelleById(id) { return data.echelles.find(e => e.id === id); }
    /**
     * L'échelle en vigueur pour un sujet, **celle de la filiale d'abord**.
     *
     * ⚠️ **Le `find()` nu était FAUX, et seul le navigateur l'a montré.** Le socle du
     * Groupe et l'échelle locale sont tous deux « en vigueur » — le premier pour tout le
     * groupe, la seconde pour cette filiale seule —, et le premier arrivé l'emportait.
     * Mesuré sur la recette : une filiale publiait une graduation à cinq niveaux, et sa
     * fiche de risque continuait d'en proposer quatre. Le serveur, lui, tranchait déjà
     * dans le bon sens (`f_echelle_en_vigueur()`) : c'est l'écran qui disait autre chose
     * que la base — et une cotation partie de là aurait été estampillée de l'échelle
     * locale tout en affichant les libellés du socle.
     *
     * Rend `undefined` s'il n'y en a aucune.
     */
    function getEchelleEnVigueur(sujet) {
        const candidates = data.echelles.filter(
            e => e.sujet === sujet && e.statut === "en_vigueur");
        return candidates.find(e => e._porteeGroupe !== true) || candidates[0];
    }
    /** Les révisions d'un sujet, de la plus récente à la plus ancienne. */
    function getEchellesDuSujet(sujet) {
        return data.echelles.filter(e => e.sujet === sujet)
            .slice().sort((a, b) => (b.revision || 0) - (a.revision || 0));
    }
    /* =========================
       LES FICHES RÉFLEXES DE CRISE (v28, migration `061`)

       ⚠️ **`getFichesReflexes()` résout la SURCHARGE, et ce n'est pas un `filter`
       nu.** Le socle du Groupe et la fiche locale visent le même rôle : la seconde
       REMPLACE la première, elle ne s'y ajoute pas. Deux cartes pour
       « Responsable IT / SSI » au moment d'une crise, ce sont deux colonnes qui se
       contredisent sous les yeux de quelqu'un qui n'a pas le temps de choisir.

       C'est exactement le défaut mesuré sur les échelles le 19/09 — le `find()` nu
       qui prenait la première venue —, et il est fermé ici AVANT d'avoir coûté.
    ========================== */

    /** Vrai si la ligne appartient au socle du Groupe (champ servi par le serveur). */
    function estDuSocle(ligne) { return ligne && ligne._porteeGroupe === true; }

    /**
     * Les fiches qui s'appliquent ICI : celles de la filiale, plus celles du socle
     * dont le rôle n'est pas déjà couvert localement. Triées par `ordre`.
     */
    function getFichesReflexes() {
        const toutes = (data.fiches_reflexes || []).filter(f => f.actif !== false);
        const cle = (f) => String(f.role || "").trim().toLowerCase();
        const locales = toutes.filter(f => !estDuSocle(f));
        const couverts = new Set(locales.map(cle));
        return locales
            .concat(toutes.filter(f => estDuSocle(f) && !couverts.has(cle(f))))
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0)
                          || String(a.titre || "").localeCompare(String(b.titre || ""), "fr"));
    }

    /** Toutes les fiches, socle compris et surcharges incluses — pour l'ÉDITION. */
    function getToutesFichesReflexes() {
        return (data.fiches_reflexes || []).slice()
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    }

    function getFicheReflexeById(id) {
        return (data.fiches_reflexes || []).find(f => f.id === id);
    }

    /** Les réflexes d'une fiche, dans l'ordre. */
    function getReflexesDeFiche(ficheId) {
        return (data.fiche_reflexe_actions || [])
            .filter(a => a.fiche_id === ficheId)
            .slice()
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    }

    function addFicheReflexe(f) { data.fiches_reflexes.push(f); save(); }
    function updateFicheReflexe(f) {
        const i = data.fiches_reflexes.findIndex(x => x.id === f.id);
        if (i !== -1) { data.fiches_reflexes[i] = f; save(); }
    }
    function deleteFicheReflexe(id) {
        data.fiches_reflexes = data.fiches_reflexes.filter(f => f.id !== id);
        // La cascade est tenue par la BASE (`on delete cascade`) ; on la reflète ici
        // pour que l'écran ne montre pas des réflexes orphelins avant le prochain
        // chargement.
        data.fiche_reflexe_actions =
            data.fiche_reflexe_actions.filter(a => a.fiche_id !== id);
        save();
    }
    function addReflexe(a) { data.fiche_reflexe_actions.push(a); save(); }
    function updateReflexe(a) {
        const i = data.fiche_reflexe_actions.findIndex(x => x.id === a.id);
        if (i !== -1) { data.fiche_reflexe_actions[i] = a; save(); }
    }
    function deleteReflexe(id) {
        data.fiche_reflexe_actions =
            data.fiche_reflexe_actions.filter(a => a.id !== id);
        save();
    }

    /**
     * Les contacts d'urgence applicables : ceux de la filiale, puis ceux du socle.
     *
     * ⚠️ **Pas de surcharge par intitulé ici**, à la différence des fiches : une
     * filiale AJOUTE son assurance et son infogérant, elle ne remplace pas le CERT-FR.
     * Traiter les deux de la même façon ferait disparaître une référence publique le
     * jour où quelqu'un crée un contact au nom approchant.
     */
    function getContactsUrgence() {
        return (data.contacts_urgence || [])
            .filter(c => c.actif !== false)
            .slice()
            .sort((a, b) => (Number(estDuSocle(a)) - Number(estDuSocle(b)))
                          || (a.ordre || 0) - (b.ordre || 0));
    }
    function addContactUrgence(c) { data.contacts_urgence.push(c); save(); }
    function updateContactUrgence(c) {
        const i = data.contacts_urgence.findIndex(x => x.id === c.id);
        if (i !== -1) { data.contacts_urgence[i] = c; save(); }
    }
    function deleteContactUrgence(id) {
        data.contacts_urgence = data.contacts_urgence.filter(c => c.id !== id);
        save();
    }

    function addEchelle(e) { data.echelles.push(e); save(); }
    function updateEchelle(e) {
        const i = data.echelles.findIndex(x => x.id === e.id);
        if (i !== -1) { data.echelles[i] = e; save(); }
    }
    function deleteEchelle(id) {
        data.echelles = data.echelles.filter(e => e.id !== id);
        data.echelle_niveaux = data.echelle_niveaux.filter(n => n.echelle_id !== id);
        save();
    }
    /** Les niveaux d'une échelle, du plus faible au plus fort. */
    function getNiveauxEchelle(echelleId) {
        return data.echelle_niveaux.filter(n => n.echelle_id === echelleId)
            .slice().sort((a, b) => Number(a.valeur) - Number(b.valeur));
    }
    function getNiveauEchelleById(id) { return data.echelle_niveaux.find(n => n.id === id); }
    function addNiveauEchelle(n) { data.echelle_niveaux.push(n); save(); }
    function updateNiveauEchelle(n) {
        const i = data.echelle_niveaux.findIndex(x => x.id === n.id);
        if (i !== -1) { data.echelle_niveaux[i] = n; save(); }
    }
    function deleteNiveauEchelle(id) {
        data.echelle_niveaux = data.echelle_niveaux.filter(n => n.id !== id);
        save();
    }
    /**
     * Ce qu'une valeur VEUT DIRE sur une échelle donnée.
     *
     * ⚠️ Rend `null` — jamais la valeur nue, jamais un libellé de repli — quand
     * l'échelle n'est pas tracée ou que la valeur n'y figure pas. L'appelant doit
     * pouvoir DIRE « non tracée » : afficher « 3 » comme si de rien n'était serait
     * exactement le défaut que l'action 25.3 ferme.
     */
    function libelleNiveau(echelleId, valeur) {
        if (!echelleId || valeur === null || valeur === undefined || valeur === "") return null;
        const n = data.echelle_niveaux.find(
            x => x.echelle_id === echelleId && Number(x.valeur) === Number(valeur));
        return n ? n.libelle : null;
    }

    /* =========================
       QUANTIFICATION FINANCIÈRE — FAIR (v25, action 25.4)

       risque_quantification : { id, risque_id, devise,
                                 frequence_min|probable|max,   (événements par an)
                                 perte_min|probable|max,        (coût d'UN événement)
                                 secondaire_min|probable|max,   (amende, litige — FACULTATIF)
                                 hypotheses, source_donnees, confiance, evaluee_le,
                                 _perteAnnualisee, _secondaireEstimee }   ← servis, non écrits

       ⚠️ **Le montant ne se calcule pas ici.** Il vient de la base, où il est une
       colonne ENGENDRÉE : `f_fair_perte_annualisee()` en est la seule définition, et
       c'est elle que la consolidation somme. Une seconde implémentation dans ce fichier
       afficherait un jour un montant que le tableau de bord du Groupe ne reconnaîtrait
       pas — deux points de mesure d'une même grandeur, divergence silencieuse (Q-219).

       ⚠️ **Un triplet incomplet ne rend RIEN.** Ni ici, ni en base : la contrainte
       refuse la ligne et la dérivation rend nul. Deux valeurs sur trois donneraient un
       nombre qui AURAIT L'AIR mesuré — et c'est ce chiffre-là qui est cité en comité de
       direction.
    ========================== */
    /* =========================
       LES CATALOGUES DE RÉFÉRENTIELS (v26, action 26.1)

       ⚠️ **Le registre `Referentiels` reste le point d'entrée des ÉCRANS** : ces
       quatre accesseurs servent à la gestion des catalogues eux-mêmes — leur
       ancienneté, leurs révisions, les grilles qu'une filiale apporte —, pas à
       l'évaluation, qui passe par `Referentiels.get()` comme depuis le premier jour.
    ========================== */
    function getReferentiels() { return data.referentiels; }
    function getReferentielDomaines() { return data.referentiel_domaines; }
    function getReferentielExigences() { return data.referentiel_exigences; }
    function getReferentielTraductions() { return data.referentiel_traductions; }

    function getQuantifications() { return data.risque_quantification; }
    function getQuantificationDuRisque(risqueId) {
        return data.risque_quantification.find(q => q.risque_id === risqueId);
    }
    function addQuantification(q) { data.risque_quantification.push(q); save(); }
    function updateQuantification(q) {
        const i = data.risque_quantification.findIndex(x => x.id === q.id);
        if (i !== -1) { data.risque_quantification[i] = q; save(); }
    }
    function deleteQuantification(id) {
        data.risque_quantification = data.risque_quantification.filter(q => q.id !== id);
        save();
    }

    /* =========================
       EBIOS RM — ATELIERS 1 ET 2 (v22, actions 25.1, 25.2 et 25.5)

       ebios_connaissances       : { id, genre, reference, nom, objectif_vise, phase,
                                     categorie, description, origine, statut, archive_le }
       ebios_etudes              : { id, nom, perimetre, cadre, responsable, statut,
                                     debut_le, validee_le, notes }
       ebios_valeurs_metier      : { id, etude_id, nom, nature, processus_id,
                                     responsable, description }
       ebios_evenements_redoutes : { id, valeur_metier_id, nom, besoin, gravite,
                                     impacts, description }
       ebios_sources_risque      : { id, etude_id, source, objectif_vise, connaissance_id,
                                     motivation, ressources, activite, retenue, justification }

       ⚠️ **EN ADDITION, jamais en remplacement.** Aucune de ces fonctions ne touche à
       `risques` : les cotations F × G × M déjà saisies ont été produites en audit, et un
       code qui les réinterpréterait les réattribuerait EN SILENCE. C'est le critère
       d'acceptation de l'action 25.1, et le motif du constat Q-192.

       ⚠️ **Aucune PERTINENCE stockée.** La note d'un couple source/objectif se dérive de
       ses trois critères côté serveur (`GET /api/ebios/etat`, `f_ebios_pertinence`). La
       poser ici obligerait quelque chose à la remettre après chaque révision d'un critère
       — et l'animateur en révise en séance. Elle se tait d'ailleurs dès qu'un critère
       manque : pas d'estimation par défaut.

       ⚠️ **`ebios_connaissances` est MIXTE** : une entrée à `filiale_id` nul appartient au
       socle du Groupe (le serveur ne l'expose pas, comme pour `risque_catalogue`) ; les
       autres sont les ajouts de la filiale. L'écran les présente ensemble, et c'est la
       RLS qui a décidé de ce qui arrive ici.
    ========================== */
    function getEbiosConnaissances() { return data.ebios_connaissances; }
    function getEbiosConnaissancesDuGenre(genre) {
        return data.ebios_connaissances.filter(c => c.genre === genre && c.statut !== "archivee");
    }
    function getEbiosConnaissanceById(id) {
        return data.ebios_connaissances.find(c => c.id === id);
    }
    function addEbiosConnaissance(c) { data.ebios_connaissances.push(c); save(); }
    function updateEbiosConnaissance(c) {
        const i = data.ebios_connaissances.findIndex(x => x.id === c.id);
        if (i !== -1) { data.ebios_connaissances[i] = c; save(); }
    }
    function deleteEbiosConnaissance(id) {
        data.ebios_connaissances = data.ebios_connaissances.filter(c => c.id !== id);
        save();
    }

    function getEbiosEtudes() { return data.ebios_etudes; }
    function getEbiosEtudeById(id) { return data.ebios_etudes.find(e => e.id === id); }
    function addEbiosEtude(e) { data.ebios_etudes.push(e); save(); }
    function updateEbiosEtude(e) {
        const i = data.ebios_etudes.findIndex(x => x.id === e.id);
        if (i !== -1) { data.ebios_etudes[i] = e; save(); }
    }
    /**
     * ⚠️ La base cascade (`on delete cascade` des §3 et §5 de la migration 046) ; cette
     * fonction refait le même ordre EN MÉMOIRE, et ce n'est pas une politesse.
     *
     * Le défaut du 18/09/2026 est exactement là : la base cascadait, la façade en mémoire
     * ne le refaisait pas, et l'échéancier gardait l'échéance d'un questionnaire dont le
     * porteur venait d'être supprimé. *Un défaut peut ne vivre ni dans la base, ni dans la
     * route, mais dans l'écart entre deux cascades* — et aucune des deux moitiés n'a tort
     * seule, ce qui est précisément pourquoi le banc ne le voyait pas.
     */
    function deleteEbiosEtude(id) {
        const valeurs = data.ebios_valeurs_metier.filter(v => v.etude_id === id).map(v => v.id);
        // ⚠️ Les scénarios opérationnels D'ABORD : ils pendent aux stratégiques, qui
        //    pendent à l'étude. L'ordre est celui des clés étrangères, et l'inverser
        //    laisserait des opérationnels sans chemin — visibles nulle part, et
        //    pourtant comptés.
        const strategiques = data.ebios_scenarios_strategiques
            .filter(s => s.etude_id === id).map(s => s.id);
        data.ebios_scenarios_operationnels = data.ebios_scenarios_operationnels.filter(
            o => strategiques.indexOf(o.scenario_strategique_id) === -1);
        data.ebios_scenarios_strategiques =
            data.ebios_scenarios_strategiques.filter(s => s.etude_id !== id);
        data.ebios_parties_prenantes =
            data.ebios_parties_prenantes.filter(p => p.etude_id !== id);
        data.ebios_evenements_redoutes = data.ebios_evenements_redoutes.filter(
            r => valeurs.indexOf(r.valeur_metier_id) === -1);
        data.ebios_valeurs_metier = data.ebios_valeurs_metier.filter(v => v.etude_id !== id);
        data.ebios_sources_risque = data.ebios_sources_risque.filter(s => s.etude_id !== id);
        data.ebios_etudes = data.ebios_etudes.filter(e => e.id !== id);
        save();
    }

    function getEbiosValeursMetier(etudeId) {
        return etudeId === undefined
            ? data.ebios_valeurs_metier
            : data.ebios_valeurs_metier.filter(v => v.etude_id === etudeId);
    }
    function getEbiosValeurMetierById(id) {
        return data.ebios_valeurs_metier.find(v => v.id === id);
    }
    function addEbiosValeurMetier(v) { data.ebios_valeurs_metier.push(v); save(); }
    function updateEbiosValeurMetier(v) {
        const i = data.ebios_valeurs_metier.findIndex(x => x.id === v.id);
        if (i !== -1) { data.ebios_valeurs_metier[i] = v; save(); }
    }
    /** Même motif que `deleteEbiosEtude` : la base cascade sur les événements redoutés. */
    function deleteEbiosValeurMetier(id) {
        data.ebios_evenements_redoutes =
            data.ebios_evenements_redoutes.filter(r => r.valeur_metier_id !== id);
        data.ebios_valeurs_metier = data.ebios_valeurs_metier.filter(v => v.id !== id);
        save();
    }

    function getEbiosEvenementsRedoutes(valeurMetierId) {
        return valeurMetierId === undefined
            ? data.ebios_evenements_redoutes
            : data.ebios_evenements_redoutes.filter(r => r.valeur_metier_id === valeurMetierId);
    }
    function getEbiosEvenementRedouteById(id) {
        return data.ebios_evenements_redoutes.find(r => r.id === id);
    }
    function addEbiosEvenementRedoute(r) { data.ebios_evenements_redoutes.push(r); save(); }
    function updateEbiosEvenementRedoute(r) {
        const i = data.ebios_evenements_redoutes.findIndex(x => x.id === r.id);
        if (i !== -1) { data.ebios_evenements_redoutes[i] = r; save(); }
    }
    function deleteEbiosEvenementRedoute(id) {
        data.ebios_evenements_redoutes =
            data.ebios_evenements_redoutes.filter(r => r.id !== id);
        save();
    }

    function getEbiosSourcesRisque(etudeId) {
        return etudeId === undefined
            ? data.ebios_sources_risque
            : data.ebios_sources_risque.filter(s => s.etude_id === etudeId);
    }
    function getEbiosSourceRisqueById(id) {
        return data.ebios_sources_risque.find(s => s.id === id);
    }
    function addEbiosSourceRisque(s) { data.ebios_sources_risque.push(s); save(); }
    function updateEbiosSourceRisque(s) {
        const i = data.ebios_sources_risque.findIndex(x => x.id === s.id);
        if (i !== -1) { data.ebios_sources_risque[i] = s; save(); }
    }
    function deleteEbiosSourceRisque(id) {
        data.ebios_sources_risque = data.ebios_sources_risque.filter(s => s.id !== id);
        save();
    }

    /* =========================
       EBIOS RM — ATELIERS 3, 4 ET 5 (v23, fin de l'action 25.1)

       ebios_parties_prenantes       : { id, etude_id, nom, categorie, prestataire_id,
                                         dependance, penetration, maturite, confiance, notes }
       ebios_scenarios_strategiques  : { id, etude_id, source_id, evenement_redoute_id,
                                         partie_prenante_id, nom, chemin, notes }
       ebios_scenarios_operationnels : { id, scenario_strategique_id, nom, mode_operatoire,
                                         connaissance_id, actif_id, vraisemblance,
                                         decision, justification_decision, risque_id, notes }

       ⚠️ **Aucun NIVEAU, aucune GRAVITÉ.** Le niveau de menace d'une partie prenante et
       le niveau d'un scénario se dérivent côté serveur ; la gravité d'un scénario
       stratégique EST celle de l'événement redouté qu'il réalise, lue par la jointure.
       Les stocker ici créerait autant de secondes réponses à des questions déjà posées.

       ⚠️ **`risque_id` est un LIEN, pas une conversion** : rattacher un scénario à un
       risque du registre F × G × M n'écrit RIEN dans ce risque. Les deux méthodes
       cohabitent sans se parler, et c'est le critère d'acceptation de l'action 25.1.
    ========================== */
    function getEbiosPartiesPrenantes(etudeId) {
        return etudeId === undefined
            ? data.ebios_parties_prenantes
            : data.ebios_parties_prenantes.filter(p => p.etude_id === etudeId);
    }
    function getEbiosPartiePrenanteById(id) {
        return data.ebios_parties_prenantes.find(p => p.id === id);
    }
    function addEbiosPartiePrenante(p) { data.ebios_parties_prenantes.push(p); save(); }
    function updateEbiosPartiePrenante(p) {
        const i = data.ebios_parties_prenantes.findIndex(x => x.id === p.id);
        if (i !== -1) { data.ebios_parties_prenantes[i] = p; save(); }
    }
    /**
     * ⚠️ La base DÉLIE les scénarios qui la traversaient (`on delete set null
     * (partie_prenante_id)`) ; cette fonction refait le même geste EN MÉMOIRE. Sans
     * cela, l'écran afficherait un passage par une partie prenante qui n'existe plus —
     * la classe du défaut du 18/09/2026, où l'échéancier gardait l'échéance d'un
     * questionnaire dont le porteur venait d'être supprimé.
     */
    function deleteEbiosPartiePrenante(id) {
        data.ebios_scenarios_strategiques.forEach(s => {
            if (s.partie_prenante_id === id) s.partie_prenante_id = "";
        });
        data.ebios_parties_prenantes = data.ebios_parties_prenantes.filter(p => p.id !== id);
        save();
    }

    function getEbiosScenariosStrategiques(etudeId) {
        return etudeId === undefined
            ? data.ebios_scenarios_strategiques
            : data.ebios_scenarios_strategiques.filter(s => s.etude_id === etudeId);
    }
    function getEbiosScenarioStrategiqueById(id) {
        return data.ebios_scenarios_strategiques.find(s => s.id === id);
    }
    function addEbiosScenarioStrategique(s) { data.ebios_scenarios_strategiques.push(s); save(); }
    function updateEbiosScenarioStrategique(s) {
        const i = data.ebios_scenarios_strategiques.findIndex(x => x.id === s.id);
        if (i !== -1) { data.ebios_scenarios_strategiques[i] = s; save(); }
    }
    /** La base cascade sur les scénarios opérationnels ; on refait le même ordre. */
    function deleteEbiosScenarioStrategique(id) {
        data.ebios_scenarios_operationnels =
            data.ebios_scenarios_operationnels.filter(o => o.scenario_strategique_id !== id);
        data.ebios_scenarios_strategiques =
            data.ebios_scenarios_strategiques.filter(s => s.id !== id);
        save();
    }

    function getEbiosScenariosOperationnels(strategiqueId) {
        return strategiqueId === undefined
            ? data.ebios_scenarios_operationnels
            : data.ebios_scenarios_operationnels.filter(
                o => o.scenario_strategique_id === strategiqueId);
    }
    function getEbiosScenarioOperationnelById(id) {
        return data.ebios_scenarios_operationnels.find(o => o.id === id);
    }
    function addEbiosScenarioOperationnel(o) { data.ebios_scenarios_operationnels.push(o); save(); }
    function updateEbiosScenarioOperationnel(o) {
        const i = data.ebios_scenarios_operationnels.findIndex(x => x.id === o.id);
        if (i !== -1) { data.ebios_scenarios_operationnels[i] = o; save(); }
    }
    function deleteEbiosScenarioOperationnel(id) {
        data.ebios_scenarios_operationnels =
            data.ebios_scenarios_operationnels.filter(o => o.id !== id);
        save();
    }

    /* =========================
       ANALYSES D'IMPACT — RGPD article 35 (v17, action 20.3)
       { id, traitement_id, statut, necessite_motif, date_analyse,
         risques_identifies, mesures_prevues, avis_dpo, avis_dpo_le,
         consultation_cnil, consultation_cnil_le, revoir_le, mesures_ids[] }

       ⚠️ **Elle POINTE le traitement, elle ne le recopie pas.** Ni la finalité,
       ni les catégories de données, ni les destinataires ne figurent ici : le
       registre de l'article 30 en est la seule source, et une copie vieillirait
       sans que personne le sache. C'est le critère d'acceptation de 20.3.

       ⚠️ **Aucun champ d'état.** « À revoir » se dérive de la date de revue,
       côté serveur (`GET /api/aipd/etat`). Le poser ici obligerait quelque chose
       à repasser — et le jour où ce quelque chose ne repasse pas, le produit
       affirme une conformité RGPD que personne n'a constatée.
    ========================== */
    function getAnalysesImpact() { return data.analyses_impact; }
    function getAnalyseImpactById(id) { return data.analyses_impact.find(a => a.id === id); }
    function getAnalysesImpactByTraitement(traitementId) {
        return data.analyses_impact.filter(a => a.traitement_id === traitementId);
    }
    function addAnalyseImpact(a) { data.analyses_impact.push(a); save(); }
    function updateAnalyseImpact(a) {
        const idx = data.analyses_impact.findIndex(x => x.id === a.id);
        if (idx !== -1) { data.analyses_impact[idx] = a; save(); }
    }
    function deleteAnalyseImpact(id) {
        data.analyses_impact = data.analyses_impact.filter(a => a.id !== id); save();
    }

    /* =========================
       DEMANDES D'EXERCICE DE DROITS — RGPD art. 15 à 22 (v18, action 20.4)
       { id, type_demande, recue_le, canal, demandeur, contact,
         identite_verifiee, identite_verifiee_le, prorogee, prorogee_le,
         prorogation_motif, statut, repondue_le, reponse_resume, motif_refus,
         traitement_id }

       ⚠️ **Aucune échéance.** Le mois de l'article 12 §3 se dérive de la date de
       réception, côté serveur (`GET /api/demandes-droits/etat`). Le poser ici
       laisserait, après correction de cette date, un délai calculé sur
       l'ancienne — sans que personne le sache.

       ⚠️ **Ces lignes portent les données personnelles d'un TIERS** — la personne
       qui exerce ses droits, et qui n'est pas un utilisateur du produit. Elles
       sont rangées au registre de l'article 30 du produit lui-même, avec leur
       sort à l'expiration : le NOM se conserve (sans lui, la preuve d'avoir
       répondu n'a plus de sujet), le CONTACT s'anonymise.
    ========================== */
    function getDemandesDroits() { return data.demandes_droits; }
    function getDemandeDroitsById(id) { return data.demandes_droits.find(d => d.id === id); }
    function addDemandeDroits(d) { data.demandes_droits.push(d); save(); }
    function updateDemandeDroits(d) {
        const idx = data.demandes_droits.findIndex(x => x.id === d.id);
        if (idx !== -1) { data.demandes_droits[idx] = d; save(); }
    }
    function deleteDemandeDroits(id) {
        data.demandes_droits = data.demandes_droits.filter(d => d.id !== id); save();
    }

    /* =========================
       TRAITEMENTS RGPD — Registre article 30 (v6)
       { id, nom, finalite, base_legale, responsable, personnes_concernees,
         categories_donnees, donnees_sensibles, destinataires, transfert_hors_ue,
         duree_conservation, mesures_ids[], notes, updatedAt }
       Les mesures de sécurité réutilisent l'entité pivot `mesures`.
    ========================== */
    function getTraitements() { return data.traitements; }
    function getTraitementById(id) { return data.traitements.find(t => t.id === id); }
    function addTraitement(t) { data.traitements.push(t); save(); }
    function updateTraitement(t) {
        const idx = data.traitements.findIndex(x => x.id === t.id);
        if (idx !== -1) { data.traitements[idx] = t; save(); }
    }
    function deleteTraitement(id) { data.traitements = data.traitements.filter(t => t.id !== id); save(); }

    /* =========================
       CORRESPONDANCES INTER-RÉFÉRENTIELS — surcouche utilisateur (v7)
       Le catalogue par défaut est STATIQUE (js/data/mappings.js). Ce tableau ne
       stocke QUE la surcouche : groupes ajoutés par l'utilisateur, groupes du
       catalogue modifiés (même id → override) ou masqués (`_deleted: true`).
       { id, theme, aide, refs: { <refId>: [codes...] }, _deleted? }
    ========================== */
    function getMappings() { return data.mappings; }
    function getMappingById(id) { return data.mappings.find(m => m.id === id); }
    // Crée ou remplace (par id) une entrée de surcouche.
    function upsertMapping(m) {
        if (!m || !m.id) return null;
        const i = data.mappings.findIndex(x => x.id === m.id);
        if (i !== -1) data.mappings[i] = m; else data.mappings.push(m);
        save();
        return m;
    }
    function deleteMapping(id) { data.mappings = data.mappings.filter(m => m.id !== id); save(); }
    // Réinitialise la surcouche : restaure le catalogue par défaut (retire ajouts,
    // modifications et masquages).
    function resetMappings() { data.mappings = []; save(); }

    /* =========================
       HISTORIQUE DES INDICATEURS — courbes de tendance (v8)
       Un instantané par jour (clé `date` = "YYYY-MM-DD"). Le point du jour est mis à
       jour tant que la journée court ; les points passés sont figés.
       { id, ts, date, metrics: { conformite, maturite, expo, risques_crit,
         actions_retard, avancement, incidents_ouverts } }
    ========================== */
    function dayKey(d) {
        d = d || new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }
    // Historique trié par date croissante (pour l'affichage des courbes).
    function getHistory() {
        return data.history.slice().sort((a, b) => (a.date < b.date ? -1 : (a.date > b.date ? 1 : 0)));
    }
    // Enregistre/actualise l'instantané du jour. Ne réécrit rien si les indicateurs
    // sont inchangés (évite des sauvegardes inutiles à chaque visite du tableau de bord).
    function recordDailySnapshot(metrics) {
        if (!metrics || typeof metrics !== "object") return null;
        const date = dayKey();
        const existing = data.history.find(h => h.date === date);
        if (existing) {
            if (JSON.stringify(existing.metrics) === JSON.stringify(metrics)) return existing;
            existing.metrics = metrics; existing.ts = Date.now();
            // Dérivé aussi à la MISE À JOUR : deux sessions ouvertes le même jour
            // se disputent le même point quotidien, et le perdant recevrait un
            // « modifié entre-temps » sur un indicateur que personne n'a saisi.
            if (typeof Sync !== "undefined") Sync.marquerDerive("history", existing.id);
        } else {
            const point = { id: genId("HIST"), ts: Date.now(), date, metrics };
            data.history.push(point);
            // Recalculable, jamais saisi : un refus du serveur (deux sessions le
            // même jour, unicité sur la date) ne doit pas produire d'alerte.
            if (typeof Sync !== "undefined") Sync.marquerDerive("history", point.id);
            if (data.history.length > HISTORY_KEEP) {
                data.history.sort((a, b) => (a.date < b.date ? -1 : 1));
                data.history = data.history.slice(data.history.length - HISTORY_KEEP);
            }
        }
        save();
        return existing || data.history[data.history.length - 1];
    }
    function clearHistory() { data.history = []; save(); }

    /* =========================
       EXPORT / IMPORT (FICHIER .json)
       Enveloppe standard :
       { format:"grc-backup", version, encrypted, createdAt, app, payload|kdf+cipher }
    ========================== */
    const BACKUP_FORMAT = "grc-backup";
    const EXPORT_ITERATIONS = 600000;   // PBKDF2 pour l'export chiffré (brief §3.2)

    function buildEnvelope(extra) {
        return Object.assign({
            format: BACKUP_FORMAT,
            version: SCHEMA_VERSION,
            app: "cyber-grc-dedienne",
            createdAt: new Date().toISOString()
        }, extra);
    }

    // Export en clair (interopérabilité / lisible).
    function exportSnapshot() {
        return JSON.stringify(buildEnvelope({ encrypted: false, payload: data }), null, 2);
    }

    // Export chiffré : payload protégé par mot de passe (AES-256-GCM,
    // clé dérivée par PBKDF2 avec un sel propre au fichier → portable entre postes).
    async function exportEncrypted(password) {
        if (!CryptoService || !CryptoService.available()) {
            throw new Error("Web Crypto indisponible (contexte non sécurisé).");
        }
        const saltB64 = CryptoService.newSalt();
        const key = await CryptoService.deriveKey(password, saltB64, EXPORT_ITERATIONS, ["encrypt", "decrypt"]);
        const env = await CryptoService.encryptString(key, JSON.stringify(data));
        return JSON.stringify(buildEnvelope({
            encrypted: true,
            kdf: { algo: "PBKDF2", hash: "SHA-256", iterations: EXPORT_ITERATIONS, salt: saltB64 },
            cipher: { algo: "AES-GCM", iv: env.iv, ct: env.ct }
        }), null, 2);
    }

    // Valide qu'un payload ressemble à une base Cyber GRC.
    function validatePayload(payload) {
        if (!payload || typeof payload !== "object") return { valid: false };
        // au moins un champ connu, et tout champ présent doit être un tableau
        let known = 0;
        for (const f of ARRAY_FIELDS) {
            if (payload[f] !== undefined) {
                if (!Array.isArray(payload[f])) return { valid: false };
                known++;
            }
        }
        if (known === 0) return { valid: false };
        const summary = {};
        ARRAY_FIELDS.forEach(f => { summary[f] = Array.isArray(payload[f]) ? payload[f].length : 0; });
        return { valid: true, summary };
    }

    // Migrations de schéma ascendantes (v1 → v2 → …). `normalize` garantit ensuite
    // la présence de tous les tableaux.
    function migratePayload(payload, fromVersion) {
        let p = payload;
        const v = Number(fromVersion) || 1;
        // v1 : audits/revues étaient hors du snapshot → normalize crée les tableaux.
        // v2 → v3 : ajout de `evaluations` (auto-évaluations de référentiels) et
        //           `mesures` (pivot) → normalize crée les tableaux vides.
        // v3 → v4 : ajout de `incidents` → normalize crée le tableau vide.
        // v4 → v5 : ajout de `documents` → normalize crée le tableau vide.
        // v5 → v6 : ajout de `traitements` (RGPD) → normalize crée le tableau vide.
        // v6 → v7 : ajout de `mappings` (surcouche des correspondances) → normalize crée le tableau vide.
        // v7 → v8 : ajout de `history` (indicateurs historisés) → normalize crée le tableau vide.
        // v8 → v9 : ajout du champ `dependances[]` (liens typés actif→actif) sur les actifs →
        //           normalize garantit le tableau sur chaque actif (aucune transformation de données).
        // v9 → v10 : Actions MCO — ancien modèle { etat, date, notes } converti en modèle de
        //           suivi { statut, avancement, datePrevue, dateReelle, dateCloture, ... } par
        //           normalize (OK→Réalisée/100 %, KO→En cours, date→dateReelle, notes→commentaire).
        // v10 → v11 : ajout de `personnes` (annuaire) → normalize crée le tableau vide. Les noms
        //           de responsables restent en texte dans les entités (aucune transformation).
        // v11 → v12 : évaluations — `mesure_id` (lien unique) devient `mesure_ids[]` (plusieurs
        //           mesures par exigence) ; normalize convertit l'ancienne valeur en tableau.
        // v12 → v13 : ajout de `risque_catalogue` (socle de risques du Groupe + ajouts
        //           locaux) et de `referentiels_actifs` (activation d'un référentiel par
        //           filiale) → normalize crée les tableaux vides. AUCUNE transformation de
        //           donnée : le lien `risques[].catalogue_id` est facultatif, et une base
        //           héritée n'en porte aucun. Un export v12 se reprend donc à l'identique.
        // v15 → v16 : les mesures portent leur EFFICACITÉ (19.6) et leur rythme de rejeu
        //           (19.5). ⚠️ Rien n'est converti : la maturité ne se traduit PAS en
        //           efficacité — « documenté, planifié, supervisé » ne dit rien de
        //           « est-ce que ça marche ». Les champs arrivent vides, et c'est juste.
        // v14 → v15 : `documents[].mesures_ids[]` — quels CONTRÔLES un document prouve
        //           (action 19.3). `normalize` garantit le tableau ; aucune donnée n'est
        //           transformée, et un export v14 se reprend à l'identique.
        // v13 → v14 : ajout de `derogations` (écarts de conformité assumés, action 19.2)
        //           → normalize crée le tableau vide. AUCUNE transformation : le lien
        //           `derogations[].exigence_id` n'existe pas dans une base héritée, et un
        //           export v13 se reprend donc à l'identique.
        // v16 → v17 : ajout de `analyses_impact` (analyses d'impact RGPD art. 35,
        //           action 20.3) → normalize crée le tableau vide. AUCUNE
        //           transformation, et surtout rien à DEVINER : on ne fabrique pas
        //           une analyse « requise » pour chaque traitement portant des
        //           données sensibles. Ce serait inventer une obligation que
        //           personne n'a constatée, et remplir le registre de l'article 35
        //           de lignes vides apprendrait à l'ignorer. La présomption
        //           s'affiche à l'écran ; elle ne s'écrit pas.
        // v17 → v18 : ajout de `demandes_droits` (demandes d'exercice de droits, RGPD
        //           art. 15 à 22, action 20.4) → normalize crée le tableau vide. AUCUNE
        //           transformation, et rien à DEVINER : on ne fabrique pas de demandes à
        //           partir du journal d'audit. Une demande est un fait REÇU, pas une
        //           déduction — l'inventer serait consigner qu'une personne a écrit alors
        //           que personne n'en sait rien.
        // v18 → v19 : ajout de `prestataire_sous_traitance` (chaîne de sous-traitance
        //           des tiers, action 21.1) → normalize crée le tableau vide. AUCUNE
        //           transformation, et rien à DEVINER : on ne fabrique pas une arête de
        //           sous-traitance depuis le champ libre `notes` d'un prestataire. Une
        //           chaîne de sous-traitance est un fait CONSTATÉ au contrat, et
        //           l'inventer remplirait de liens non vérifiés le registre que
        //           l'autorité réclame.
        // v19 → v20 : ajout de `questionnaires_tiers` et `questionnaire_reponses`
        //           (questionnaire fournisseur, action 21.2) → normalize crée les
        //           tableaux vides. AUCUNE transformation, et rien à DEVINER : on ne
        //           fabrique pas un envoi à partir du champ `notes` d'un prestataire.
        //           Un envoi est un fait CONSIGNÉ par un humain, et l'inventer ferait
        //           croire qu'on a demandé quelque chose qu'on n'a jamais demandé.
        // v20 → v21 : ajout de `campagnes` et `campagne_filiales` (campagnes
        //           descendantes, actions 24.1 et 24.2) → normalize crée les tableaux
        //           vides. AUCUNE transformation, et rien à DEVINER : on ne fabrique pas
        //           une campagne à partir des évaluations déjà faites. Une campagne est
        //           une DEMANDE, datée ; la déduire ferait croire que le Groupe a demandé
        //           ce qu'une filiale avait fait de son propre chef.
        // v21 → v22 : ajout des cinq collections des ateliers 1 et 2 d'EBIOS RM
        //           (`ebios_connaissances`, `ebios_etudes`, `ebios_valeurs_metier`,
        //           `ebios_evenements_redoutes`, `ebios_sources_risque`) → normalize
        //           crée les tableaux vides. AUCUNE transformation, et surtout rien à
        //           DEVINER : on ne fabrique pas une étude EBIOS RM à partir des
        //           risques déjà cotés. Une cotation F × G × M ne dit ni la valeur
        //           métier atteinte, ni la source, ni l'objectif visé — en déduire une
        //           étude produirait une analyse que personne n'a conduite, dans un
        //           outil qui sert de preuve en audit.
        // v22 → v23 : ajout des trois collections des ateliers 3, 4 et 5 d'EBIOS RM
        //           (`ebios_parties_prenantes`, `ebios_scenarios_strategiques`,
        //           `ebios_scenarios_operationnels`) → normalize crée les tableaux
        //           vides. AUCUNE transformation, et rien à DEVINER : on ne fabrique
        //           pas une partie prenante depuis le registre des prestataires. Un
        //           prestataire est un fait contractuel ; une partie prenante de
        //           l'écosystème est une DÉCISION d'analyse — celle de dire qu'on
        //           dépend de lui et à quel point on lui fait confiance.
        // (Ajouter ici les futures migrations : if (v < 24) { ... })
        return p;
    }

    // Analyse un fichier importé sans l'appliquer. Retourne un diagnostic :
    // { ok, needPassword, badPassword, invalid, payload, meta, summary }.
    async function parseImport(jsonString, password) {
        let parsed;
        try { parsed = JSON.parse(jsonString); }
        catch (e) { return { ok: false, invalid: true }; }

        let payload = null;
        let version = SCHEMA_VERSION;
        let encrypted = false;
        let createdAt = null;

        if (parsed && parsed.format === BACKUP_FORMAT) {
            version = parsed.version || 1;
            createdAt = parsed.createdAt || null;
            if (parsed.encrypted) {
                encrypted = true;
                if (!password) return { ok: false, needPassword: true };
                if (!CryptoService || !CryptoService.available()) return { ok: false, invalid: true };
                try {
                    const iters = (parsed.kdf && parsed.kdf.iterations) || EXPORT_ITERATIONS;
                    const key = await CryptoService.deriveKey(password, parsed.kdf.salt, iters, ["encrypt", "decrypt"]);
                    const pt = await CryptoService.decryptString(key, { iv: parsed.cipher.iv, ct: parsed.cipher.ct });
                    payload = JSON.parse(pt);
                } catch (e) {
                    return { ok: false, badPassword: true };
                }
            } else {
                payload = parsed.payload;
            }
        } else if (parsed && parsed.data && Array.isArray(parsed.data.exigences)) {
            payload = parsed.data;                       // ancien format encapsulé
            version = parsed.schemaVersion || 1;
        } else if (parsed && Array.isArray(parsed.exigences)) {
            payload = parsed;                            // très ancien format plat
            version = 1;
        }

        const check = validatePayload(payload);
        if (!check.valid) return { ok: false, invalid: true };

        payload = migratePayload(payload, version);
        return { ok: true, payload, encrypted, meta: { version, createdAt }, summary: check.summary };
    }

    /* =========================
       IMPORT D'UN FICHIER `grc-backup` — FORMAT D'ÉCHANGE (§2.6)
       Reprise d'une filiale déjà équipée de la version locale, ou données
       remises par une filiale.

       ══ Ce que la porte S2 a changé ici (constat B-3) ═══════════════════════

       Avant la bascule, « Remplacer » détruisait la copie navigateur de son seul
       auteur, et un point de restauration local existait vraiment. Après la
       bascule, le même bouton détruisait **le jeu de données serveur de la
       filiale entière, pour tout le monde**, en autant de `DELETE` indépendants
       — donc hors transaction, avec un état intermédiaire visible par les autres
       et rien pour le journaliser. L'auditeur l'a rejoué : 8 risques avant,
       1 après, 20 `DELETE`, et un écran qui promettait un point de restauration
       qui n'existait plus.

       La réponse n'est pas de désactiver le bouton, c'est de rendre l'opération
       **atomique** : une route de reprise côté serveur applique la charge v12
       entière en UNE transaction, en conservant les identifiants du fichier —
       ce qui rétablit du même coup l'exactitude du round-trip `grc-backup`,
       qu'un import `POST` un par un ne permettait de toute façon plus depuis que
       le serveur impose ses identifiants.

       Tant que cette route n'est pas déployée, l'appel rend 404 et l'on se
       replie : la **fusion** reste possible enregistrement par enregistrement
       (elle n'efface rien), le **remplacement** est refusé avec sa raison. Dans
       les deux cas, rien n'est détruit à moitié.
    ========================== */
    const MESSAGE_REMPLACEMENT =
        "Le remplacement complet des données de la filiale n'est pas disponible sur ce serveur : " +
        "il détruirait le contenu enregistrement par enregistrement, sans transaction et sans " +
        "retour arrière possible. Utilisez « Fusionner », qui ajoute ce qui manque sans rien " +
        "supprimer, ou demandez la mise à jour du serveur.";

    // Vrai quand le serveur ne connaît pas (encore) la route de reprise.
    function repriseIndisponible(erreur) {
        return erreur && (erreur.statut === 404 || erreur.statut === 405);
    }

    /**
     * Un refus de reprise, dit dans les termes du serveur.
     *
     * ── Ce que la porte S2 (3ᵉ passage) a corrigé ici ────────────────────────
     *
     * Ce chemin traduisait **toute** violation de contrainte par « Ce fichier a
     * déjà été importé dans cette filiale ». C'était une explication INVENTÉE :
     * juste tant que la trace d'import consommait le fichier, fausse pour tout
     * le reste — une référence morte, une clé métier en double — et fausse tout
     * court depuis que le constat T-4 a été tranché. Restaurer deux fois la même
     * sauvegarde est un geste légitime : c'est le scénario même du plan de
     * reprise que ce produit héberge.
     *
     * Le serveur écrit désormais des phrases destinées à l'utilisateur, et il
     * distingue sur le chemin de reprise qu'une référence absente vient **du
     * fichier** plutôt que du périmètre (constat T-10). On les relaie donc
     * telles quelles : deviner la cause à la place de celui qui la connaît,
     * c'est exactement ce qui a produit le message précédent.
     *
     * La seule chose que le navigateur ajoute est ce que lui seul sait du
     * GESTE : la reprise s'applique en une transaction, donc un refus rendu par
     * le serveur n'a rien modifié. On ne l'ajoute que lorsque le serveur a
     * effectivement répondu — jamais sur une coupure réseau ou un service
     * indisponible, où l'on ignore ce qui s'est passé.
     */
    function refusDeReprise(erreur) {
        if (!erreur || typeof erreur.statut !== "number") return erreur;
        const aRepondu = erreur.statut >= 400 && erreur.statut < 500;
        if (!aRepondu || !erreur.message) return erreur;
        const complet = new Error(erreur.message +
            " Aucune donnée n'a été modifiée : la reprise s'applique en une seule transaction.");
        complet.code = erreur.code;
        complet.statut = erreur.statut;
        return complet;
    }

    // Enveloppe `grc-backup` d'une charge utile, quand on ne dispose pas du
    // fichier d'origine (reprise de la base héritée d'un poste, par exemple).
    function envelopper(payload) {
        return JSON.stringify(buildEnvelope({ encrypted: false, payload: payload }), null, 2);
    }

    /**
     * Applique un fichier `grc-backup`.
     *
     * ── Réimporter deux fois le même fichier : ce qui se passe vraiment ──────
     *
     * Ce commentaire a affirmé le contraire, et le constat Q-6 (a) l'a relevé :
     * il disait que « l'empreinte porte l'idempotence — réimporter deux fois le
     * même fichier est refusé par la base ». C'était vrai jusqu'au correctif
     * T-4, qui a retiré ce jeton d'unicité, précisément parce qu'il rendait
     * impossible le geste le plus banal d'un plan de reprise : restaurer,
     * constater, restaurer encore.
     *
     * Aujourd'hui la seconde reprise n'est pas refusée : elle **converge**. Le
     * serveur, quand l'identifiant d'un fichier est déjà pris par une ligne
     * qu'il ne peut pas réutiliser, en **dérive** un autre à partir de
     * `(filiale, table, identifiant du fichier)` — une empreinte, pas un tirage.
     * La seconde reprise retombe donc sur le même identifiant que la première,
     * **retrouve** la ligne et la met à jour au lieu d'en fabriquer un clone.
     * Trois reprises du même fichier donnent une ligne, pas trois
     * (`CONVENTIONS.md` §2, marque `-r-`).
     *
     * L'empreinte du fichier, elle, est toujours calculée et **écrite dans la
     * trace d'import** (`imports.sha256`) : elle dit QUEL fichier a été
     * appliqué, ce qui est un besoin de preuve, et non plus un verrou.
     *
     * @param payload  charge utile déjà lue par `parseImport` (déchiffrée).
     * @param mode     "merge" (défaut) ou "replace".
     * @param options  { texte, nom } — le TEXTE d'origine du fichier quand on
     *                 l'a : c'est lui que le serveur lit, migre et empreinte.
     */
    async function applyImport(payload, mode, options) {
        const opts = options || {};
        const demande = (mode === "replace") ? "remplacer" : "fusionner";
        const contenu = opts.texte || envelopper(payload);
        const nom = opts.nom || "reprise.json";

        // 1. Le chemin transactionnel : tout ou rien, identifiants conservés.
        try {
            const resultat = await Api.reprendre(demande, nom, contenu);
            await Sync.recharger();   // le serveur fait foi : on reprend son état
            const bilan = (resultat && resultat.bilan) || {};
            const somme = (o) => Object.keys(o || {}).reduce((n, k) => n + (o[k] || 0), 0);
            return {
                ok: true, transactionnel: true,
                total: somme(bilan.crees) + somme(bilan.misAJour),
                crees: somme(bilan.crees), misAJour: somme(bilan.misAJour),
                supprimes: somme(bilan.supprimes),
                champsIgnores: bilan.champsIgnores || [],
                added: bilan.crees || {}
            };
        } catch (e) {
            // ── Q-57 : ici, recharger EST le bon geste ──────────────────────
            // `api.js` ne prescrit plus rien : il ne peut pas savoir. Cette
            // couche, si. Une reprise n'a rien en mémoire qu'un rechargement
            // détruirait — tout ce qui compte est sur le serveur —, donc voir
            // son état réel avant de relancer est exactement ce qu'il faut
            // faire. C'est le pendant du geste que `sync.js` nomme, à l'opposé,
            // pour une création bloquée.
            if (e && e.issueInconnue) {
                const avecGeste = new Error(e.message +
                    " Rechargez la page pour voir l'état réel de la filiale avant de relancer la reprise.");
                avecGeste.code = e.code; avecGeste.statut = e.statut;
                avecGeste.issueInconnue = true;
                throw avecGeste;
            }
            if (!repriseIndisponible(e)) throw refusDeReprise(e);
        }

        // 2. Repli, serveur sans route de reprise : la fusion reste possible
        //    enregistrement par enregistrement (elle n'efface rien) ; le
        //    remplacement est refusé plutôt que fait à moitié.
        if (demande === "remplacer") throw new Error(MESSAGE_REMPLACEMENT);

        const incoming = normalize(payload);
        const added = {};
        ARRAY_FIELDS.forEach(f => {
            const existingIds = new Set(data[f].map(x => x && x.id));
            const toAdd = incoming[f].filter(x => x && !existingIds.has(x.id));
            // On concatène SUR PLACE : `sync.js` observe le tableau que le
            // DataStore lui a prêté, le remplacer le lui déroberait.
            toAdd.forEach(x => data[f].push(x));
            added[f] = toAdd.length;
        });
        data.schemaVersion = SCHEMA_VERSION;
        const r = await flush();
        const total = Object.values(added).reduce((a, b) => a + b, 0);
        return { ok: r.ok, transactionnel: false, added: added, total: total };
    }

    return {
        init, setKey, isEncrypted, enableEncryption, disableEncryption,
        flush, onQuotaExceeded,

        getClients, getClientById, addClient, updateClient, deleteClient,
        getExigences, getExigencesByClient, getExigenceById, addExigence, updateExigence, deleteExigence,
        getActions, getActionById, getActionsByExigence, getActionsByRisque, getActionsByEvaluation, getActionsByIncident, getActionsByMesure, addAction, updateAction, deleteAction,
        getRisques, getRisqueById, addRisque, updateRisque, deleteRisque,
        getActifs, getActifById, addActif, updateActif, deleteActif,

        getProcessus, getProcessusById, addProcessus, updateProcessus, deleteProcessus,
        getCriseMembres, getCriseMembreById, addCriseMembre, updateCriseMembre, deleteCriseMembre,
        getScenariosPra, getScenarioPraById, addScenarioPra, updateScenarioPra, deleteScenarioPra,
        getTestsPra, getTestPraById, addTestPra, updateTestPra, deleteTestPra,
        getTestsByScenario, getOrphanTests, deleteOrphanTests,
        getPrestataires, addPrestataire, updatePrestataire, deletePrestataire,
        getMcoActions, addMcoAction, updateMcoAction, deleteMcoAction,

        // Audits & revues (intégrés à la sauvegarde)
        getAudits, addAudit, updateAudit, deleteAudit,
        getRevues, addRevue, updateRevue, deleteRevue,

        // Référentiels : auto-évaluations + pivot « Mesure de sécurité »
        getEvaluations, getEvaluationById, getEvaluationsByRef, getEvaluation,
        upsertEvaluation, deleteEvaluation, deleteEvaluationsByRef,
        addMesureToEvaluation, removeMesureFromEvaluation,
        getMesures, getMesureById, getEvaluationsByMesure,
        addMesure, updateMesure, deleteMesure, propagateMesure,

        // Personnel / annuaire (v11)
        getPersonnes, getPersonneById, addPersonne, updatePersonne, deletePersonne, getPersonneNames,

        // Incidents de sécurité
        getIncidents, getIncidentById, addIncident, updateIncident, deleteIncident,

        // Documents / politiques
        getDocuments, getDocumentById, addDocument, updateDocument, deleteDocument,
        getDerogations, getDerogationById, getDerogationsByExigence,
        addDerogation, updateDerogation, deleteDerogation,
        getSousTraitances, getSousTraitancesDe, addSousTraitance, deleteSousTraitance,
        getCampagnes, getCampagneById, addCampagne, updateCampagne, deleteCampagne,
        getPartsCampagneVisibles, getPartsCampagne, getPartCampagneById,
        updatePartCampagne,
        getQuestionnaires, getQuestionnaireById, getQuestionnairesDe,
        addQuestionnaire, updateQuestionnaire, deleteQuestionnaire,
        getReponsesDe, addReponse, updateReponse,
        // EBIOS RM — ateliers 1 et 2 (v22, lot L25)
        getEbiosConnaissances, getEbiosConnaissancesDuGenre, getEbiosConnaissanceById,
        addEbiosConnaissance, updateEbiosConnaissance, deleteEbiosConnaissance,
        getEbiosEtudes, getEbiosEtudeById, addEbiosEtude, updateEbiosEtude, deleteEbiosEtude,
        getEbiosValeursMetier, getEbiosValeurMetierById,
        addEbiosValeurMetier, updateEbiosValeurMetier, deleteEbiosValeurMetier,
        getEbiosEvenementsRedoutes, getEbiosEvenementRedouteById,
        addEbiosEvenementRedoute, updateEbiosEvenementRedoute, deleteEbiosEvenementRedoute,
        getEbiosSourcesRisque, getEbiosSourceRisqueById,
        addEbiosSourceRisque, updateEbiosSourceRisque, deleteEbiosSourceRisque,
        getEbiosPartiesPrenantes, getEbiosPartiePrenanteById,
        addEbiosPartiePrenante, updateEbiosPartiePrenante, deleteEbiosPartiePrenante,
        getEbiosScenariosStrategiques, getEbiosScenarioStrategiqueById,
        addEbiosScenarioStrategique, updateEbiosScenarioStrategique,
        deleteEbiosScenarioStrategique,
        getEbiosScenariosOperationnels, getEbiosScenarioOperationnelById,
        addEbiosScenarioOperationnel, updateEbiosScenarioOperationnel,
        deleteEbiosScenarioOperationnel,
        // Échelles de cotation (v24, action 25.3)
        getFichesReflexes, getToutesFichesReflexes, getFicheReflexeById,
        getReflexesDeFiche, addFicheReflexe, updateFicheReflexe, deleteFicheReflexe,
        addReflexe, updateReflexe, deleteReflexe,
        getContactsUrgence, addContactUrgence, updateContactUrgence, deleteContactUrgence,
        getEchelles, getEchelleById, getEchelleEnVigueur, getEchellesDuSujet,
        addEchelle, updateEchelle, deleteEchelle,
        getNiveauxEchelle, getNiveauEchelleById,
        getReferentiels, getReferentielDomaines,
        getReferentielExigences, getReferentielTraductions,
        getQuantifications, getQuantificationDuRisque,
        addQuantification, updateQuantification, deleteQuantification,
        addNiveauEchelle, updateNiveauEchelle, deleteNiveauEchelle,
        libelleNiveau,

        getAnalysesImpact, getAnalyseImpactById, getAnalysesImpactByTraitement,
        addAnalyseImpact, updateAnalyseImpact, deleteAnalyseImpact,
        getDemandesDroits, getDemandeDroitsById,
        addDemandeDroits, updateDemandeDroits, deleteDemandeDroits,

        // Traitements RGPD (registre art. 30)
        getTraitements, getTraitementById, addTraitement, updateTraitement, deleteTraitement,

        // Correspondances inter-référentiels (surcouche utilisateur)
        getMappings, getMappingById, upsertMapping, deleteMapping, resetMappings,

        // Historique des indicateurs (courbes de tendance)
        getHistory, recordDailySnapshot, clearHistory,

        // Échange de fichier `grc-backup` (§2.6) et état du stockage
        exportSnapshot, exportEncrypted, parseImport, applyImport,
        getStorageInfo, listBackups, restoreBackup, deleteBackup, createManualBackup
    };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 *  FILET DE LECTURE SEULE — lot L3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ **CE N'EST PAS LA BARRIÈRE.** La barrière est le serveur, qui refuse la
 *  requête (`backend/src/api/droits.ts`, contrôle S6). Ceci est un filet : il
 *  évite qu'un bouton oublié laisse l'utilisateur saisir dix minutes de travail
 *  avant qu'un refus ne tombe.
 *
 *  ── Pourquoi ici, et pas dans les 26 modules ────────────────────────────
 *
 *  Parce que **toutes** les mutations passent par cette façade — c'est
 *  l'invariant du projet, celui qui a permis de basculer 26 modules sans en
 *  réécrire un seul (`CLAUDE.md` §3). Un filet posé ici est donc complet par
 *  construction, là où une liste de boutons vieillirait en silence.
 *
 *  ── La liste des mutateurs est DÉCOUVERTE, jamais écrite ────────────────
 *
 *  On parcourt les membres réellement exportés et on retient ceux dont le nom
 *  commence par `add`, `update`, `delete`, `upsert`, `reset`, `record`,
 *  `apply` ou `clear` — la convention `getX/addX/updateX/deleteX` du
 *  `CLAUDE.md` §3. Un mutateur ajouté demain qui la respecte est couvert **sans
 *  que personne y pense**.
 *
 *  Et s'il ne la respecte pas ? Alors il mute, `sync.js` l'envoie, et **le
 *  serveur le refuse** : l'échec est bruyant, pas silencieux — c'est le sens de
 *  lecture du `CLAUDE.md` §3 sur les listes. Le filet ne peut pas mentir dans
 *  le sens dangereux.
 *
 *  ── La façade n'est pas élargie ─────────────────────────────────────────
 *
 *  Aucun membre n'est ajouté ni retiré : on remplace des fonctions par des
 *  fonctions de même nom et de même arité apparente. Le compte de membres —
 *  131 avant, 131 après la vague 2 — est inchangé, et l'API reste **100 %
 *  synchrone** : le filet ne rend aucune promesse.
 * ═══════════════════════════════════════════════════════════════════════════ */
(() => {
    "use strict";

    const PREFIXES_MUTATION = ["add", "update", "delete", "upsert", "reset", "record", "apply", "clear"];

    // Un mutateur, oui — mais tout ce qui touche au fichier d'échange et aux
    // points de restauration reste accessible : ce ne sont pas des écritures de
    // données de gouvernance, et `applyImport` est déjà tenu par son écran.
    const EXCEPTIONS = ["applyImport", "deleteBackup", "createManualBackup", "restoreBackup"];

    function estMutateur(nom) {
        if (EXCEPTIONS.indexOf(nom) !== -1) return false;
        return PREFIXES_MUTATION.some(p =>
            nom.length > p.length && nom.indexOf(p) === 0 && nom[p.length] === nom[p.length].toUpperCase());
    }

    function enLectureSeule() {
        try {
            return typeof Droits !== "undefined" && Droits.connus() && Droits.lectureSeule();
        } catch (e) {
            // Un filet qui échoue ne doit rien fermer : la barrière est ailleurs.
            return false;
        }
    }

    let dernierAvertissement = 0;

    Object.keys(DataStore).forEach(nom => {
        const membre = DataStore[nom];
        if (typeof membre !== "function" || !estMutateur(nom)) return;
        DataStore[nom] = function () {
            if (enLectureSeule()) {
                // Un message, pas une exception : lever ici casserait le
                // gestionnaire de clic du module appelant, et une interface
                // inerte est pire qu'une interface qui refuse (constat M-6).
                const maintenant = Date.now();
                if (window.showToast && maintenant - dernierAvertissement > 2000) {
                    dernierAvertissement = maintenant;
                    window.showToast(
                        "Votre profil est en lecture seule : cette modification n'a pas été enregistrée.",
                        "error");
                }
                console.info("Modification refusée par le profil (lecture seule) :", nom);
                return undefined;
            }
            return membre.apply(DataStore, arguments);
        };
    });
})();

// `const` au premier niveau d'un script classique ne pose PAS de propriété sur
// `window` : le nom `DataStore` est bien global, mais `window.DataStore` reste
// indéfini. On l'expose explicitement, comme le font `UI`, `Sync` et `Api` —
// c'est ce qui permet à un essai automatisé, ou à la console d'un exploitant,
// d'interroger l'état du magasin sans deviner sa portée.
window.DataStore = DataStore;
