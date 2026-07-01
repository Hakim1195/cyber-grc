// Emplacement : js/core/datastore.js
// Nom du fichier : datastore.js
//
// Source de vérité en mémoire (API 100% synchrone pour les modules) + persistance
// durable via IndexedDB (voir persistence.js). Repli localStorage anti-crash.
// L'API publique (getX / addX / updateX / deleteX) est INCHANGÉE : les modules
// n'ont pas besoin d'être modifiés.

const DataStore = (() => {
    const STORAGE_KEY = "cyber-gouvernance-data";   // ancienne clé localStorage (migration)
    const LEGACY_AUDITS_KEY = "cyber-audits";
    const LEGACY_REVUES_KEY = "cyber-revues";
    const SCHEMA_VERSION = 2;

    const ARRAY_FIELDS = [
        "clients", "exigences", "actions", "risques", "actifs",
        "processus", "crise", "scenarios_pra", "tests_pra", "prestataires", "mco_actions",
        "audits", "revues"
    ];

    const AUTOSAVE_DEBOUNCE_MS = 500;
    const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000; // un point auto au maximum toutes les 10 min
    const AUTO_BACKUP_KEEP = 20;                     // nombre de points auto conservés

    function emptyData() {
        const d = { schemaVersion: SCHEMA_VERSION };
        ARRAY_FIELDS.forEach(f => { d[f] = []; });
        return d;
    }

    let data = emptyData();
    let flushTimer = null;
    let lastSavedAt = 0;
    let lastAutoBackupTs = 0;
    let idbHealthy = true;

    function deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function normalize(d) {
        const out = Object.assign(emptyData(), d || {});
        ARRAY_FIELDS.forEach(f => {
            out[f] = Array.isArray(out[f]) ? out[f] : [];
        });
        out.schemaVersion = SCHEMA_VERSION;
        return out;
    }

    function isEmpty(d) {
        return ARRAY_FIELDS.every(f => !Array.isArray(d[f]) || d[f].length === 0);
    }

    function safeParse(str) {
        try { return str ? JSON.parse(str) : null; } catch (e) { return null; }
    }

    /* =========================
       MIGRATION DEPUIS localStorage
    ========================== */
    function migrateFromLegacy() {
        const base = safeParse(localStorage.getItem(STORAGE_KEY));
        const audits = safeParse(localStorage.getItem(LEGACY_AUDITS_KEY));
        const revues = safeParse(localStorage.getItem(LEGACY_REVUES_KEY));
        if (!base && !audits && !revues) return null;

        const merged = base || {};
        if (Array.isArray(audits) && !Array.isArray(merged.audits)) merged.audits = audits;
        if (Array.isArray(revues) && !Array.isArray(merged.revues)) merged.revues = revues;
        return merged;
    }

    /* =========================
       CHARGEMENT / INITIALISATION (async)
    ========================== */
    async function init() {
        try {
            let loaded = null;

            if (Persistence.idbAvailable()) {
                try {
                    loaded = await Persistence.kvGet("current");
                } catch (e) {
                    console.error("Lecture IndexedDB échouée", e);
                    idbHealthy = false;
                }
            } else {
                idbHealthy = false;
            }

            // Aucun enregistrement durable → tenter la migration depuis localStorage
            if (!loaded) {
                loaded = migrateFromLegacy();
            }

            data = normalize(loaded || data);

            // Persister l'état normalisé (finalise la migration le cas échéant)
            await flushNow();

            // Rendre le stockage persistant + point de restauration d'ouverture
            if (idbHealthy) {
                Persistence.requestPersistent();
                await maybeAutoBackup("Ouverture de session", true, true);
            }
        } catch (e) {
            console.error("Erreur d'initialisation du DataStore", e);
            data = normalize(data);
        }

        // Filet de sécurité : flush avant fermeture / onglet caché
        try {
            window.addEventListener("beforeunload", () => { mirrorToLocalStorage(); flushNow(); });
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden") { mirrorToLocalStorage(); flushNow(); }
            });
        } catch (e) { /* ignore */ }
    }

    /* =========================
       ENREGISTREMENT
    ========================== */
    // Point d'entrée synchrone appelé par tous les modules.
    function save() {
        data.updatedAt = Date.now();
        mirrorToLocalStorage();   // secours synchrone anti-crash
        scheduleFlush();          // persistance durable IndexedDB (débounce)
    }

    function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => { flushNow(); }, AUTOSAVE_DEBOUNCE_MS);
    }

    // Miroir localStorage (best-effort) : utile si l'onglet se ferme avant le flush
    // IndexedDB. Peut échouer (quota) sur de très grosses bases — IndexedDB reste
    // alors la source durable.
    function mirrorToLocalStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            // Quota dépassé ou indisponible : on n'insiste pas.
        }
    }

    async function flushNow() {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (!Persistence.idbAvailable() || !idbHealthy) {
            mirrorToLocalStorage();
            return false;
        }
        try {
            await Persistence.kvSet("current", deepCopy(data));
            await Persistence.kvSet("meta", { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() });
            lastSavedAt = Date.now();
            idbHealthy = true;
            maybeAutoBackup(undefined, false, true); // throttlé + dédupliqué
            return true;
        } catch (e) {
            console.error("Échec d'écriture IndexedDB, repli sur localStorage", e);
            idbHealthy = false;
            mirrorToLocalStorage();
            return false;
        }
    }

    /* =========================
       POINTS DE RESTAURATION (HISTORIQUE)
    ========================== */
    async function maybeAutoBackup(label, force, dedup) {
        if (!Persistence.idbAvailable() || !idbHealthy) return;
        if (isEmpty(data)) return;   // rien à sauvegarder
        const now = Date.now();
        if (!force && (now - lastAutoBackupTs < AUTO_BACKUP_INTERVAL_MS)) return;
        // Déduplication : ne pas recréer un point identique au plus récent
        if (dedup) {
            try {
                const list = await Persistence.listBackups();
                if (list.length && JSON.stringify(list[0].data) === JSON.stringify(data)) return;
            } catch (e) { /* on sauvegarde quand même en cas de doute */ }
        }
        lastAutoBackupTs = now;
        try {
            await Persistence.addBackup({
                ts: now,
                type: "auto",
                label: label || "Sauvegarde automatique",
                schemaVersion: SCHEMA_VERSION,
                data: deepCopy(data)
            });
            await Persistence.pruneBackups("auto", AUTO_BACKUP_KEEP);
        } catch (e) {
            console.error("Point de restauration automatique impossible", e);
        }
    }

    async function createManualBackup(label) {
        if (!Persistence.idbAvailable()) return false;
        try {
            await Persistence.addBackup({
                ts: Date.now(),
                type: "manual",
                label: (label && label.trim()) || "Point de restauration manuel",
                schemaVersion: SCHEMA_VERSION,
                data: deepCopy(data)
            });
            return true;
        } catch (e) {
            console.error("Création du point de restauration impossible", e);
            return false;
        }
    }

    function listBackups() {
        if (!Persistence.idbAvailable()) return Promise.resolve([]);
        return Persistence.listBackups().catch(() => []);
    }

    async function restoreBackup(id) {
        if (!Persistence.idbAvailable()) return false;
        const b = await Persistence.getBackup(id);
        if (!b || !b.data) return false;
        // Instantané de sécurité de l'état courant AVANT de restaurer (annulable)
        await maybeAutoBackup("Avant restauration", true);
        data = normalize(b.data);
        mirrorToLocalStorage();
        await flushNow();
        return true;
    }

    function deleteBackup(id) {
        if (!Persistence.idbAvailable()) return Promise.resolve(false);
        return Persistence.deleteBackup(id).then(() => true).catch(() => false);
    }

    /* =========================
       INFOS STOCKAGE
    ========================== */
    async function getStorageInfo() {
        const json = exportSnapshot();
        const bytes = new Blob([json]).size;
        const estimate = Persistence.idbAvailable() ? await Persistence.estimate() : null;
        let backupCount = 0;
        if (Persistence.idbAvailable()) {
            try { backupCount = (await Persistence.listBackups()).length; } catch (e) { /* ignore */ }
        }
        const counts = {};
        ARRAY_FIELDS.forEach(f => { counts[f] = data[f].length; });
        return {
            engine: (Persistence.idbAvailable() && idbHealthy) ? "IndexedDB" : "localStorage (secours)",
            bytes,
            estimate,
            backupCount,
            lastSavedAt,
            counts,
            updatedAt: data.updatedAt || null
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
    function deleteActif(id) { data.actifs = data.actifs.filter(a => a.id !== id); save(); }

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
    function deleteScenarioPra(id) { data.scenarios_pra = data.scenarios_pra.filter(s => s.id !== id); save(); }

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
       EXPORT / IMPORT (FICHIER .json)
    ========================== */
    function exportSnapshot() {
        return JSON.stringify({
            app: "cyber-grc-dedienne",
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            data: data
        }, null, 2);
    }

    // Accepte le nouveau format encapsulé { schemaVersion, data:{...} }
    // ET l'ancien format plat { exigences:[...], ... } pour compatibilité.
    async function importSnapshot(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            let incoming = null;
            if (parsed && parsed.data && Array.isArray(parsed.data.exigences)) {
                incoming = parsed.data;                 // nouveau format
            } else if (parsed && Array.isArray(parsed.exigences)) {
                incoming = parsed;                      // ancien format
            }
            if (!incoming) return false;

            // Sécurité : point de restauration de l'état courant avant écrasement
            await maybeAutoBackup("Avant import de fichier", true);

            data = normalize(incoming);
            mirrorToLocalStorage();
            await flushNow();
            return true;
        } catch (e) {
            console.error("Erreur lors de l'importation du snapshot :", e);
            return false;
        }
    }

    return {
        init,

        getClients, getClientById, addClient, updateClient, deleteClient,
        getExigences, getExigencesByClient, getExigenceById, addExigence, updateExigence, deleteExigence,
        getActions, getActionById, getActionsByExigence, getActionsByRisque, addAction, updateAction, deleteAction,
        getRisques, getRisqueById, addRisque, updateRisque, deleteRisque,
        getActifs, getActifById, addActif, updateActif, deleteActif,

        getProcessus, getProcessusById, addProcessus, updateProcessus, deleteProcessus,
        getCriseMembres, getCriseMembreById, addCriseMembre, updateCriseMembre, deleteCriseMembre,
        getScenariosPra, getScenarioPraById, addScenarioPra, updateScenarioPra, deleteScenarioPra,
        getTestsPra, getTestPraById, addTestPra, updateTestPra, deleteTestPra,
        getPrestataires, addPrestataire, updatePrestataire, deletePrestataire,
        getMcoActions, addMcoAction, updateMcoAction, deleteMcoAction,

        // Audits & revues (intégrés à la sauvegarde)
        getAudits, addAudit, updateAudit, deleteAudit,
        getRevues, addRevue, updateRevue, deleteRevue,

        // Sauvegarde / restauration
        exportSnapshot, importSnapshot,
        getStorageInfo, listBackups, restoreBackup, deleteBackup, createManualBackup
    };
})();
