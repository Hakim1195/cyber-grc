// Emplacement : js/core/persistence.js
// Nom du fichier : persistence.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  La persistance NAVIGATEUR a été retirée (lot L2) — mais l'ANCIENNE BASE
//  n'est plus détruite : elle est lue, pour permettre la reprise.
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce fichier portait la base IndexedDB `cyber-grc-db` : un instantané complet des
// données de la version 100 % navigateur (store `kv`) et ses points de
// restauration versionnés (store `backups`). L'application ne s'en sert plus
// pour écrire : la source de vérité est PostgreSQL (`PLAN_SERVEUR` §1.3) et la
// sauvegarde est celle du serveur (§1.8).
//
// ── Ce que la porte S2 a corrigé ici (constat B-1) ──────────────────────────
//
// La version précédente de ce fichier purgeait la base héritée **au chargement
// du module**, sans condition (la fonction qui le faisait a disparu avec le
// défaut, il ne sert donc à rien de la chercher). L'auditeur l'a rejoué : serveur
// injoignable, l'application refuse de démarrer — et les données de la version
// locale sont déjà détruites, avant toute reprise possible. « Il n'a rien fait
// de mal : il n'a pas encore pu se connecter. »
//
// Le raisonnement de départ (ne pas laisser traîner une copie en clair des
// données de gouvernance sur un poste) reste juste, mais il **supposait que la
// reprise avait eu lieu**. Rien ne le vérifiait.
//
// Règle désormais tenue, et elle est simple :
//
//   > **Rien n'est effacé de ce poste sans un geste explicite de l'utilisateur,
//   > et jamais avant que ses données aient été mises à l'abri.**
//
// Ce module ne fait donc plus qu'une chose : **lire** la base héritée, en lecture
// seule, pour que `js/core/reprise.js` puisse l'exporter ou la reprendre. La
// suppression existe toujours (`effacerBaseHeritee`) mais n'est appelée que
// depuis là, après confirmation.

const Persistence = (() => {
    "use strict";

    const DB_NAME = "cyber-grc-db";
    const STORE_KV = "kv";
    const STORE_BACKUPS = "backups";

    function indexedDbUtilisable() {
        try { return typeof indexedDB !== "undefined" && indexedDB !== null; }
        catch (e) { return false; }
    }

    // Faux, et définitivement : plus aucune donnée n'est ÉCRITE sur le poste.
    // Le code appelant emprunte ainsi partout le chemin « pas de stockage local ».
    function idbAvailable() { return false; }

    /* =====================================================================
       LECTURE DE LA BASE HÉRITÉE — sans jamais la modifier
    ===================================================================== */

    // Ouvre la base SANS provoquer de migration : `indexedDB.open` sans numéro
    // de version n'appelle jamais `onupgradeneeded` sur une base existante, et
    // ne crée donc rien si elle est absente (on vérifie ses stores ensuite).
    function ouvrirHeritee() {
        return new Promise((resoudre, rejeter) => {
            if (!indexedDbUtilisable()) { resoudre(null); return; }
            let req;
            try { req = indexedDB.open(DB_NAME); } catch (e) { resoudre(null); return; }
            req.onsuccess = () => resoudre(req.result);
            req.onerror = () => rejeter(req.error);
            req.onblocked = () => resoudre(null);
        });
    }

    // Vrai si une base héritée existe ET porte des données exploitables.
    async function baseHeriteePresente() {
        if (!indexedDbUtilisable()) return false;
        try {
            if (indexedDB.databases) {
                const liste = await indexedDB.databases();
                if (!liste.some(d => d && d.name === DB_NAME)) return false;
            }
            const db = await ouvrirHeritee();
            if (!db) return false;
            const present = db.objectStoreNames.contains(STORE_KV);
            db.close();
            return present;
        } catch (e) { return false; }
    }

    function lireCle(db, store, cle) {
        return new Promise((resoudre) => {
            try {
                const t = db.transaction(store, "readonly");
                const r = t.objectStore(store).get(cle);
                r.onsuccess = () => resoudre(r.result);
                r.onerror = () => resoudre(undefined);
            } catch (e) { resoudre(undefined); }
        });
    }

    function toutLire(db, store) {
        return new Promise((resoudre) => {
            try {
                const t = db.transaction(store, "readonly");
                const r = t.objectStore(store).getAll();
                r.onsuccess = () => resoudre(r.result || []);
                r.onerror = () => resoudre([]);
            } catch (e) { resoudre([]); }
        });
    }

    /**
     * Rend ce que le poste détient encore de la version 100 % navigateur :
     *   { present, chiffre, payload, pointsDeRestauration }
     *
     * `chiffre: true` signale un instantané protégé par l'ancien coffre : sans
     * la phrase de passe, il est illisible ici — et on le dit, plutôt que de
     * faire croire qu'il n'y a rien à reprendre.
     */
    async function lireHeritage() {
        const vide = { present: false, chiffre: false, payload: null, pointsDeRestauration: 0 };
        if (!await baseHeriteePresente()) return vide;
        let db = null;
        try {
            db = await ouvrirHeritee();
            if (!db) return vide;
            const courant = await lireCle(db, STORE_KV, "current");
            const points = db.objectStoreNames.contains(STORE_BACKUPS)
                ? (await toutLire(db, STORE_BACKUPS)).length : 0;

            if (!courant) return { present: points > 0, chiffre: false, payload: null, pointsDeRestauration: points };
            if (courant.enc) return { present: true, chiffre: true, payload: null, pointsDeRestauration: points };
            const payload = (courant.data && typeof courant.data === "object") ? courant.data
                : (Array.isArray(courant.exigences) || Array.isArray(courant.clients)) ? courant : null;
            return { present: true, chiffre: false, payload: payload, pointsDeRestauration: points };
        } catch (e) {
            return vide;
        } finally {
            if (db) { try { db.close(); } catch (e) { /* déjà fermée */ } }
        }
    }

    /**
     * Efface la base héritée. **Appelée uniquement depuis `reprise.js`, après un
     * geste explicite de l'utilisateur et une mise à l'abri constatée.**
     * Jamais au chargement du module : c'était le constat B-1.
     */
    function effacerBaseHeritee() {
        return new Promise((resoudre) => {
            if (!indexedDbUtilisable()) { resoudre(false); return; }
            let req;
            try { req = indexedDB.deleteDatabase(DB_NAME); } catch (e) { resoudre(false); return; }
            req.onsuccess = () => resoudre(true);
            req.onerror = () => resoudre(false);
            req.onblocked = () => resoudre(false);   // un autre onglet la tient
        });
    }

    const sansEffet = () => Promise.resolve(undefined);

    return {
        idbAvailable,
        baseHeriteePresente, lireHeritage, effacerBaseHeritee,
        // Ancienne surface d'écriture, conservée pour ne rien casser — toutes ces
        // fonctions sont sans effet depuis la bascule serveur.
        kvGet: sansEffet, kvSet: sansEffet, kvDelete: sansEffet,
        addBackup: sansEffet, listBackups: () => Promise.resolve([]), getBackup: sansEffet,
        deleteBackup: sansEffet, pruneBackups: () => Promise.resolve(0),
        estimate: () => Promise.resolve(null),
        requestPersistent: () => Promise.resolve(false)
    };
})();

window.Persistence = Persistence;
