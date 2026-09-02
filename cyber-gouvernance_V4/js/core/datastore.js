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
    const SCHEMA_VERSION = 12;

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
        "personnes"
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

        Sync.brancher({
            collections: ARRAY_FIELDS,
            lire: () => data,
            remplacer: (nouveau) => { data = normalize(nouveau); }
        });
        Sync.adopterJeu(data);
        Sync.installerFilets();
        Sync.demarrerSondage();
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
    function deletePrestataire(id) { data.prestataires = data.prestataires.filter(x => x.id !== id); save(); }

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
       DOCUMENTS / POLITIQUES (v5)
       { id, titre, type, version, proprietaire, statut, date_revue, emplacement,
         referentiels[], notes, updatedAt }
       Ne stocke PAS les fichiers : référence leur emplacement.
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
        // (Ajouter ici les futures migrations : if (v < 13) { ... })
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

// `const` au premier niveau d'un script classique ne pose PAS de propriété sur
// `window` : le nom `DataStore` est bien global, mais `window.DataStore` reste
// indéfini. On l'expose explicitement, comme le font `UI`, `Sync` et `Api` —
// c'est ce qui permet à un essai automatisé, ou à la console d'un exploitant,
// d'interroger l'état du magasin sans deviner sa portée.
window.DataStore = DataStore;
