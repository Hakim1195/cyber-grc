// Emplacement : js/services/backup.js
// Nom du fichier : backup.js
//
// Export et import de fichier `grc-backup` — devenu un **FORMAT D'ÉCHANGE**,
// et non plus un mécanisme de sauvegarde (`PLAN_SERVEUR` §2.6).
//
// ── Ce qui change avec la bascule serveur ───────────────────────────────────
//
// L'export reste, et il a deux emplois précis :
//   · **reprise** des données d'une filiale déjà équipée de la version locale ;
//   · **remise à l'acquéreur** des données d'une filiale qui sort du groupe.
//
// Le **bandeau de rappel a été retiré**. Il disait : « Vos données ne quittent
// pas ce navigateur — exportez régulièrement pour ne rien perdre. » C'est
// désormais faux sur les deux points : les données vivent sur le serveur, qui
// les sauvegarde en continu (§1.8, RPO de quelques minutes). Laisser ce rappel
// entretiendrait une inquiétude sans objet et, pire, encouragerait la
// multiplication de fichiers complets de gouvernance cyber sur les postes —
// alors que le droit d'export est précisément une permission à part entière,
// journalisée, dans le modèle cible (§3.3).
//
// `renderReminder()`, `getReminderDays()` et `setReminderDays()` restent
// déclarées : `js/modules/settings.js` les appelle et n'est pas du ressort de ce
// lot. Elles ne font plus rien d'observable.

const BackupService = (() => {
    const LAST_EXPORT_KEY = "cyber-last-export-ts";       // horodatage (ms) du dernier export
    const LAST_EXPORT_DISPLAY = "cyber-last-backup";      // date lisible (affichage)
    const REMINDER_DAYS_KEY = "cyber-export-reminder-days"; // seuil (jours), défaut 7
    const SNOOZE_KEY = "cyber-reminder-snoozed";          // sessionStorage

    const DEFAULT_DAYS = 7;
    const DAY_MS = 24 * 60 * 60 * 1000;

    function getReminderDays() {
        const v = parseInt(localStorage.getItem(REMINDER_DAYS_KEY), 10);
        return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAYS;
    }
    function setReminderDays(days) {
        const v = parseInt(days, 10);
        if (Number.isFinite(v) && v > 0) localStorage.setItem(REMINDER_DAYS_KEY, String(v));
    }

    function getLastExportTs() {
        const v = parseInt(localStorage.getItem(LAST_EXPORT_KEY), 10);
        return Number.isFinite(v) ? v : null;
    }
    function getLastExportDisplay() {
        return localStorage.getItem(LAST_EXPORT_DISPLAY) || "Aucun export réalisé";
    }
    function daysSinceExport() {
        const ts = getLastExportTs();
        if (!ts) return Infinity;
        return Math.floor((Date.now() - ts) / DAY_MS);
    }

    function markExported() {
        const now = Date.now();
        localStorage.setItem(LAST_EXPORT_KEY, String(now));
        localStorage.setItem(LAST_EXPORT_DISPLAY, new Date(now).toLocaleString("fr-FR"));
        sessionStorage.removeItem(SNOOZE_KEY);
        renderReminder();
    }

    function download(text, filename) {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function dateStamp() { return new Date().toISOString().split("T")[0]; }

    function exportPlain() {
        download(DataStore.exportSnapshot(), `Sauvegarde_CyberGRC_Dedienne_${dateStamp()}.json`);
        markExported();
    }

    async function exportEncrypted(password) {
        const text = await DataStore.exportEncrypted(password);
        download(text, `Sauvegarde_CyberGRC_Dedienne_${dateStamp()}.chiffre.json`);
        markExported();
    }

    /* ===== Bandeau de rappel — RETIRÉ (voir l'entête) =====
       La fonction subsiste parce que `app.js` et `settings.js` l'appellent ;
       elle se contente de laisser le bandeau vide. Le seul bandeau que
       l'application affiche désormais est celui de `sync.js`, qui signale une
       modification NON ENREGISTRÉE — une information, elle, exacte et utile. */
    function shouldRemind() { return false; }

    function renderReminder() {
        const host = document.getElementById("global-banner");
        if (host) host.innerHTML = "";
    }

    return {
        // `telecharger` est exposé pour `js/core/reprise.js`, qui doit produire un
        // fichier `grc-backup` à partir de la base héritée du poste (constat B-1)
        // sans dupliquer la mécanique de téléchargement.
        telecharger: download,
        exportPlain, exportEncrypted, markExported,
        getLastExportDisplay, getLastExportTs, daysSinceExport,
        getReminderDays, setReminderDays, renderReminder
    };
})();
