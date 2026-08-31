// Emplacement : js/core/persistence.js
// Nom du fichier : persistence.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  La persistance NAVIGATEUR a été retirée (lot L2)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce fichier portait la base IndexedDB `cyber-grc-db` : un instantané complet
// des données dans le store `kv`, et des points de restauration versionnés dans
// le store `backups`. Les deux ont disparu avec la bascule client/serveur :
//
//  · la **source de vérité** est PostgreSQL, et le chargement se fait à la
//    connexion (`PLAN_SERVEUR` §1.3) ;
//  · la **sauvegarde** est celle du serveur — archivage continu des journaux de
//    transactions, RPO de quelques minutes (§1.8) — et non plus une copie que
//    chaque utilisateur devait penser à exporter ;
//  · surtout, garder une **copie complète des données de gouvernance cyber du
//    groupe sur chaque poste** serait une régression de sécurité : le coffre qui
//    la chiffrait a été retiré au même endroit du plan (§1.9), le poste n'est
//    pas la VM chiffrée, et un portable volé emporterait la cartographie des
//    faiblesses d'une filiale.
//
// ── Pourquoi le fichier subsiste ─────────────────────────────────────────────
//
// `index.html` le charge et `js/modules/settings.js` interroge encore l'état du
// stockage. Le module est donc conservé avec la même forme, mais **il ne stocke
// plus rien** : `idbAvailable()` répond faux, ce qui suffit à ce que tout le
// code appelant emprunte le chemin « pas de stockage local ».
//
// Une base `cyber-grc-db` héritée d'une version antérieure est **effacée** au
// chargement : laisser sur le poste une copie en clair des données qu'on vient
// de rapatrier au serveur ne serait pas une omission neutre.

const Persistence = (() => {
    "use strict";

    const DB_NAME = "cyber-grc-db";

    // Efface la base héritée de la version 100 % navigateur. Sans effet si elle
    // n'existe pas ; silencieux si le navigateur refuse (onglet privé, verrou).
    function purgerBaseHeritee() {
        try {
            if (typeof indexedDB === "undefined" || !indexedDB) return;
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onerror = () => { /* une autre fenêtre la tient : sans conséquence ici */ };
        } catch (e) { /* stockage indisponible */ }
    }

    // Faux, et définitivement : plus aucune donnée n'est écrite sur le poste.
    function idbAvailable() { return false; }

    const refus = () => Promise.resolve(undefined);
    const refusListe = () => Promise.resolve([]);

    purgerBaseHeritee();

    return {
        idbAvailable,
        purgerBaseHeritee,
        // Ancienne surface, conservée pour ne rien casser — toutes ces fonctions
        // sont sans effet depuis la bascule serveur.
        kvGet: refus, kvSet: refus, kvDelete: refus,
        addBackup: refus, listBackups: refusListe, getBackup: refus,
        deleteBackup: refus, pruneBackups: () => Promise.resolve(0),
        estimate: () => Promise.resolve(null),
        requestPersistent: () => Promise.resolve(false)
    };
})();

window.Persistence = Persistence;
