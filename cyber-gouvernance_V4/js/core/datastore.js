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
    const SCHEMA_VERSION = 11;

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

    /* =========================
       DÉTECTION DE SATURATION DU STOCKAGE (quota)
       Les écritures durables (IndexedDB / localStorage) peuvent échouer si le quota
       du navigateur est atteint (typiquement à l'import d'un gros volume). On le
       signale explicitement au lieu d'échouer en silence (risque de perte de données).
    ========================== */
    let quotaListeners = [];
    let quotaHitLast = false;   // le DERNIER flush a-t-il buté sur le quota ?
    function isQuotaError(e) {
        if (!e) return false;
        return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014;
    }
    function notifyQuota(source) {
        quotaListeners.forEach(cb => { try { cb(source); } catch (err) { /* ignore */ } });
    }
    // Enregistre un observateur appelé quand une écriture échoue faute de place.
    function onQuotaExceeded(cb) { if (typeof cb === "function") quotaListeners.push(cb); }

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
            // Quota dépassé ou indisponible : le miroir est best-effort, mais on
            // signale la saturation (le stockage durable risque d'échouer aussi).
            if (isQuotaError(e)) notifyQuota("localStorage");
        }
    }

    async function flushNow() {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        quotaHitLast = false;
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
            if (isQuotaError(e)) { quotaHitLast = true; notifyQuota("indexedDB"); }
            console.error("Échec de l'enregistrement", e);
            if (Persistence.idbAvailable()) idbHealthy = false;
            return false;
        }
    }

    // Force un enregistrement immédiat et renvoie l'état (dont la saturation de
    // quota) — utile après un import en masse pour prévenir l'utilisateur.
    async function flush() {
        const ok = await flushNow();
        return { ok, quota: quotaHitLast };
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
            if (isQuotaError(e)) notifyQuota("backup");
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
       { id, ref_id, code, statut, maturite (0-5), commentaire, preuves, mesure_id, updatedAt }
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
            { statut: "non conforme", maturite: 0, commentaire: "", preuves: "", mesure_id: null },
            ev,
            { id: "EVAL-" + Date.now() + "-" + Math.floor(Math.random() * 1000), updatedAt: Date.now() }
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

    /* =========================
       MESURES DE SÉCURITÉ (entité pivot n-n vers les exigences de référentiels)
       { id, nom, description, statut, maturite (0-5), responsable, updatedAt }
       Le lien vers les exigences couvertes est porté par evaluations[].mesure_id :
       une mesure couvre N évaluations, éventuellement dans plusieurs référentiels
       (évaluer la mesure propage le statut → zéro double saisie).
    ========================== */
    function getMesures() { return data.mesures; }
    function getMesureById(id) { return data.mesures.find(m => m.id === id); }
    function getEvaluationsByMesure(mesureId) { return data.evaluations.filter(e => e.mesure_id === mesureId); }
    function addMesure(m) { data.mesures.push(m); save(); }
    function updateMesure(m) {
        const i = data.mesures.findIndex(x => x.id === m.id);
        if (i !== -1) { data.mesures[i] = m; save(); }
    }
    function deleteMesure(id) {
        data.mesures = data.mesures.filter(m => m.id !== id);
        data.evaluations.forEach(e => { if (e.mesure_id === id) e.mesure_id = null; });   // délie les évaluations
        data.actions.forEach(a => { if (a.mesure_id === id) a.mesure_id = null; });        // délie les actions (conservées dans le plan)
        data.traitements.forEach(t => {                                                   // délie les traitements RGPD
            if (Array.isArray(t.mesures_ids)) t.mesures_ids = t.mesures_ids.filter(mid => mid !== id);
        });
        save();
    }

    // Propage le statut et la maturité d'une mesure à toutes ses évaluations liées.
    // Retourne le nombre d'évaluations mises à jour.
    function propagateMesure(id) {
        const m = getMesureById(id);
        if (!m) return 0;
        let n = 0;
        data.evaluations.forEach(e => {
            if (e.mesure_id === id) {
                e.statut = m.statut;
                e.maturite = m.maturite;
                e.updatedAt = Date.now();
                n++;
            }
        });
        if (n > 0) save();
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
        } else {
            data.history.push({ id: "HIST-" + Date.now() + "-" + Math.floor(Math.random() * 1000), ts: Date.now(), date, metrics });
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
        // (Ajouter ici les futures migrations : if (v < 12) { ... })
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

        // Sauvegarde / restauration
        exportSnapshot, exportEncrypted, parseImport, applyImport,
        getStorageInfo, listBackups, restoreBackup, deleteBackup, createManualBackup
    };
})();
