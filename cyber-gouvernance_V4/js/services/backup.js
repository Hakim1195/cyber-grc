// Emplacement : js/services/backup.js
// Nom du fichier : backup.js
//
// Service de sauvegarde par fichier : téléchargement (clair ou chiffré),
// suivi de la date du dernier export, et bandeau de rappel non intrusif.

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

    function hasData() {
        try {
            return (DataStore.getRisques().length + DataStore.getExigences().length +
                DataStore.getActions().length + DataStore.getActifs().length +
                DataStore.getClients().length) > 0;
        } catch (e) { return false; }
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

    /* ===== Bandeau de rappel ===== */
    function shouldRemind() {
        if (!hasData()) return false;
        if (sessionStorage.getItem(SNOOZE_KEY)) return false;
        return daysSinceExport() >= getReminderDays();
    }

    function renderReminder() {
        const host = document.getElementById("global-banner");
        if (!host) return;
        if (!shouldRemind()) { host.innerHTML = ""; return; }

        const ts = getLastExportTs();
        const label = ts ? `il y a ${daysSinceExport()} jour(s)` : "jamais réalisée";
        host.innerHTML = `
            <div class="reminder-banner">
                <span class="reminder-ico">!</span>
                <span class="reminder-text">Dernière sauvegarde&nbsp;: <b>${label}</b>. Vos données ne quittent pas ce navigateur — exportez régulièrement (de préférence chiffré) pour ne rien perdre.</span>
                <button id="reminder-export" class="reminder-btn">Exporter maintenant</button>
                <button id="reminder-dismiss" class="reminder-close" title="Masquer pour cette session" aria-label="Masquer">&times;</button>
            </div>
        `;
        const exp = document.getElementById("reminder-export");
        if (exp) exp.onclick = () => { if (window.Router) Router.navigateTo("/settings"); };
        const dis = document.getElementById("reminder-dismiss");
        if (dis) dis.onclick = () => { sessionStorage.setItem(SNOOZE_KEY, "1"); renderReminder(); };
    }

    return {
        exportPlain, exportEncrypted, markExported,
        getLastExportDisplay, getLastExportTs, daysSinceExport,
        getReminderDays, setReminderDays, renderReminder
    };
})();
