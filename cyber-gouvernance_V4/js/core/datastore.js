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
    const LOCAL_CURRENT_KEY = "cyber-current";      // repli (chiffré si clé) si IndexedDB indisponible
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
    let dek = null;   // clé de chiffrement au repos (null = mode non chiffré). Fournie par le Vault.

    // Active/désactive le chiffrement au repos (appelée par app.js / Vault).
    function setKey(key) { dek = key; }

    function deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // Empreinte rapide (djb2) pour dédupliquer les points de restauration sans déchiffrer.
    function quickHash(str) {
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
        return (h >>> 0).toString(16);
    }

    // Encapsule l'état pour le stockage (chiffré si une clé est présente).
    async function encodePayload() {
        const plaintext = JSON.stringify(data);
        if (dek && typeof CryptoService !== "undefined" && CryptoService.available()) {
            const env = await CryptoService.encryptString(dek, plaintext);
            return { enc: true, iv: env.iv, ct: env.ct };
        }
        return { enc: false, data: JSON.parse(plaintext) };
    }

    // Décode un enregistrement stocké (chiffré, encapsulé clair, ou ancien objet direct).
    async function decodePayload(payload) {
        if (!payload) return null;
        if (payload.enc) {
            if (!dek) return null;
            try { return JSON.parse(await CryptoService.decryptString(dek, payload)); }
            catch (e) { console.error("Déchiffrement du stockage impossible", e); return null; }
        }
        if (payload.data && typeof payload.data === "object") return payload.data;
        if (Array.isArray(payload.exigences) || Array.isArray(payload.clients)) return payload; // ancien format direct
        return null;
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
            let payload = null;

            if (Persistence.idbAvailable()) {
                try {
                    payload = await Persistence.kvGet("current");
                } catch (e) {
                    console.error("Lecture IndexedDB échouée", e);
                    idbHealthy = false;
                }
            } else {
                idbHealthy = false;
            }

            // Repli : instantané stocké dans localStorage (si IndexedDB KO)
            if (!payload) payload = safeParse(localStorage.getItem(LOCAL_CURRENT_KEY));

            let loaded = payload ? await decodePayload(payload) : null;

            // Aucun enregistrement durable → tenter la migration depuis l'ancien localStorage
            if (!loaded) {
                loaded = migrateFromLegacy();
            }

            data = normalize(loaded || data);

            // (Re)chiffre/persiste l'état normalisé (finalise migration ou activation du chiffrement)
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
        mirrorToLocalStorage();   // secours synchrone anti-crash (uniquement en mode non chiffré)
        scheduleFlush();          // persistance durable (débounce)
    }

    function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => { flushNow(); }, AUTOSAVE_DEBOUNCE_MS);
    }

    // Miroir localStorage synchrone (anti-crash) — désactivé quand le chiffrement
    // au repos est actif (on n'écrit jamais de données en clair dans ce cas).
    function mirrorToLocalStorage() {
        if (dek) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            // Quota dépassé ou indisponible : on n'insiste pas.
        }
    }

    async function flushNow() {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        try {
            const payload = await encodePayload();   // chiffré si une clé est présente
            if (Persistence.idbAvailable() && idbHealthy) {
                await Persistence.kvSet("current", payload);
                await Persistence.kvSet("meta", { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), encrypted: !!dek });
            } else {
                localStorage.setItem(LOCAL_CURRENT_KEY, JSON.stringify(payload));
            }
            lastSavedAt = Date.now();
            maybeAutoBackup(undefined, false, true); // throttlé + dédupliqué
            return true;
        } catch (e) {
            console.error("Échec de l'enregistrement", e);
            if (Persistence.idbAvailable()) idbHealthy = false;
            return false;
        }
    }

    /* =========================
       POINTS DE RESTAURATION (HISTORIQUE)
    ========================== */
    // Construit un enregistrement de point de restauration (chiffré si une clé est
    // présente). `sig` = empreinte du contenu clair, pour dédupliquer sans déchiffrer.
    async function makeBackupRecord(label, type) {
        const plaintext = JSON.stringify(data);
        const rec = { ts: Date.now(), type, label, schemaVersion: SCHEMA_VERSION, sig: quickHash(plaintext) };
        if (dek && typeof CryptoService !== "undefined" && CryptoService.available()) {
            const env = await CryptoService.encryptString(dek, plaintext);
            rec.enc = true; rec.iv = env.iv; rec.ct = env.ct;
        } else {
            rec.enc = false; rec.data = JSON.parse(plaintext);
        }
        return rec;
    }

    async function maybeAutoBackup(label, force, dedup) {
        if (!Persistence.idbAvailable() || !idbHealthy) return;
        if (isEmpty(data)) return;   // rien à sauvegarder
        const now = Date.now();
        if (!force && (now - lastAutoBackupTs < AUTO_BACKUP_INTERVAL_MS)) return;
        // Déduplication : ne pas recréer un point identique au plus récent (via l'empreinte)
        if (dedup) {
            try {
                const list = await Persistence.listBackups();
                if (list.length && list[0].sig === quickHash(JSON.stringify(data))) return;
            } catch (e) { /* on sauvegarde quand même en cas de doute */ }
        }
        lastAutoBackupTs = now;
        try {
            await Persistence.addBackup(await makeBackupRecord(label || "Sauvegarde automatique", "auto"));
            await Persistence.pruneBackups("auto", AUTO_BACKUP_KEEP);
        } catch (e) {
            console.error("Point de restauration automatique impossible", e);
        }
    }

    async function createManualBackup(label) {
        if (!Persistence.idbAvailable()) return false;
        try {
            await Persistence.addBackup(await makeBackupRecord((label && label.trim()) || "Point de restauration manuel", "manual"));
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
        if (!b) return false;
        const restored = await decodePayload(b);   // gère backups chiffrés et anciens
        if (!restored) return false;
        // Instantané de sécurité de l'état courant AVANT de restaurer (annulable)
        await maybeAutoBackup("Avant restauration", true);
        data = normalize(restored);
        mirrorToLocalStorage();
        await flushNow();
        return true;
    }

    function deleteBackup(id) {
        if (!Persistence.idbAvailable()) return Promise.resolve(false);
        return Persistence.deleteBackup(id).then(() => true).catch(() => false);
    }

    async function deleteAllBackups() {
        if (!Persistence.idbAvailable()) return;
        try {
            const list = await Persistence.listBackups();
            for (const b of list) await Persistence.deleteBackup(b.id);
        } catch (e) { /* ignore */ }
    }

    /* =========================
       CHIFFREMENT AU REPOS (OPT-IN)
    ========================== */
    function isEncrypted() { return !!dek; }

    // Active le chiffrement : la clé chiffre la base, on purge toute trace en clair
    // (miroir localStorage + anciens points de restauration) puis on repart chiffré.
    async function enableEncryption(key) {
        setKey(key);
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        await deleteAllBackups();                 // les points existants étaient en clair
        await flushNow();                         // écrit l'instantané chiffré
        await maybeAutoBackup("Protection activée", true);
        return true;
    }

    // Désactive le chiffrement : on réécrit tout en clair et on repart des points en clair.
    async function disableEncryption() {
        setKey(null);
        await deleteAllBackups();                 // les points existants étaient chiffrés
        try { localStorage.removeItem(LOCAL_CURRENT_KEY); } catch (e) { /* ignore */ }
        await flushNow();
        await maybeAutoBackup("Protection désactivée", true);
        return true;
    }

    /* =========================
       INFOS STOCKAGE
    ========================== */
    async function getStorageInfo() {
        const bytes = new Blob([JSON.stringify(data)]).size;
        const estimate = Persistence.idbAvailable() ? await Persistence.estimate() : null;
        let backupCount = 0;
        if (Persistence.idbAvailable()) {
            try { backupCount = (await Persistence.listBackups()).length; } catch (e) { /* ignore */ }
        }
        const counts = {};
        ARRAY_FIELDS.forEach(f => { counts[f] = data[f].length; });
        return {
            engine: (Persistence.idbAvailable() && idbHealthy) ? "IndexedDB" : "localStorage (secours)",
            encrypted: !!dek,
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
        // (Ajouter ici les futures migrations : if (v < 3) { ... })
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

    // Applique un payload validé. mode: "replace" (défaut) ou "merge".
    async function applyImport(payload, mode) {
        // Sécurité : point de restauration de l'état courant avant modification
        await maybeAutoBackup("Avant import de fichier", true);

        if (mode === "merge") {
            const incoming = normalize(payload);
            const added = {};
            ARRAY_FIELDS.forEach(f => {
                const existingIds = new Set(data[f].map(x => x && x.id));
                const toAdd = incoming[f].filter(x => x && !existingIds.has(x.id));
                data[f] = data[f].concat(toAdd);
                added[f] = toAdd.length;
            });
            data.schemaVersion = SCHEMA_VERSION;
            mirrorToLocalStorage();
            await flushNow();
            return { ok: true, added };
        }

        // Remplacement
        data = normalize(payload);
        mirrorToLocalStorage();
        await flushNow();
        return { ok: true };
    }

    return {
        init, setKey, isEncrypted, enableEncryption, disableEncryption,

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
        exportSnapshot, exportEncrypted, parseImport, applyImport,
        getStorageInfo, listBackups, restoreBackup, deleteBackup, createManualBackup
    };
})();
