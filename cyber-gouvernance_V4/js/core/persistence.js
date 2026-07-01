// Emplacement : js/core/persistence.js
// Nom du fichier : persistence.js
//
// Couche de persistance bas niveau basée sur IndexedDB.
// - Store "kv"      : paires clé/valeur (ex. "current" = instantané complet des données)
// - Store "backups" : points de restauration versionnés (auto + manuels)
//
// Cette couche est volontairement générique : elle ne connaît pas le modèle
// métier. Le DataStore l'utilise pour charger/enregistrer et gérer l'historique.

const Persistence = (() => {
    const DB_NAME = "cyber-grc-db";
    const DB_VERSION = 1;
    const STORE_KV = "kv";
    const STORE_BACKUPS = "backups";

    let dbPromise = null;

    function idbAvailable() {
        try {
            return typeof indexedDB !== "undefined" && indexedDB !== null;
        } catch (e) {
            return false;
        }
    }

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_KV)) {
                    db.createObjectStore(STORE_KV);
                }
                if (!db.objectStoreNames.contains(STORE_BACKUPS)) {
                    const s = db.createObjectStore(STORE_BACKUPS, { keyPath: "id", autoIncrement: true });
                    s.createIndex("ts", "ts");
                    s.createIndex("type", "type");
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    }

    function reqToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function txDone(t) {
        return new Promise((resolve, reject) => {
            t.oncomplete = () => resolve();
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error);
        });
    }

    async function withStore(store, mode, fn) {
        const db = await openDB();
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        const result = fn(os);
        await txDone(t);
        return result;
    }

    /* ===== KV ===== */
    async function kvGet(key) {
        const db = await openDB();
        const t = db.transaction(STORE_KV, "readonly");
        return reqToPromise(t.objectStore(STORE_KV).get(key));
    }
    async function kvSet(key, val) {
        return withStore(STORE_KV, "readwrite", os => os.put(val, key));
    }
    async function kvDelete(key) {
        return withStore(STORE_KV, "readwrite", os => os.delete(key));
    }

    /* ===== Backups ===== */
    async function addBackup(record) {
        return withStore(STORE_BACKUPS, "readwrite", os => os.add(record));
    }
    async function listBackups() {
        const db = await openDB();
        const t = db.transaction(STORE_BACKUPS, "readonly");
        const all = await reqToPromise(t.objectStore(STORE_BACKUPS).getAll());
        return (all || []).sort((a, b) => b.ts - a.ts);
    }
    async function getBackup(id) {
        const db = await openDB();
        const t = db.transaction(STORE_BACKUPS, "readonly");
        return reqToPromise(t.objectStore(STORE_BACKUPS).get(id));
    }
    async function deleteBackup(id) {
        return withStore(STORE_BACKUPS, "readwrite", os => os.delete(id));
    }
    // Ne conserve que les "keep" backups les plus récents d'un type donné.
    async function pruneBackups(type, keep) {
        const all = (await listBackups()).filter(b => b.type === type);
        const toDelete = all.slice(keep);
        for (const b of toDelete) {
            await deleteBackup(b.id);
        }
        return toDelete.length;
    }

    /* ===== Quota ===== */
    async function estimate() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                return await navigator.storage.estimate();
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    // Demande au navigateur de rendre le stockage persistant (évite l'éviction
    // automatique en cas de pression disque). Sans effet si non supporté.
    async function requestPersistent() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                return await navigator.storage.persist();
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    return {
        idbAvailable,
        kvGet, kvSet, kvDelete,
        addBackup, listBackups, getBackup, deleteBackup, pruneBackups,
        estimate, requestPersistent
    };
})();
