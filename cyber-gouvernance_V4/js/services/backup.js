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
// déclarées, mais **pas pour la raison qui était écrite ici** : ce texte
// annonçait que `js/modules/settings.js` les appelait, ce qui n'est plus vrai
// depuis que l'écran Paramètres a perdu ses réglages de sauvegarde locale.
// C'est le motif du constat Q-12 — une justification qui survit à son appelant
// — et il a été relevé trois fois dans ce lot ; celle-ci est la troisième.
//
// Ce qui est vrai aujourd'hui : `renderReminder()` a **un seul** appelant hors
// de ce fichier, `js/app.js`, qui l'exécute au montage de l'application ; à
// l'intérieur, `markExported()` l'appelle après chaque export. Elle ne fait plus
// qu'une chose, et elle doit continuer de la faire : **vider** le bandeau
// `#global-banner`, pour qu'aucun reste d'un rendu antérieur n'y survive.
// `getReminderDays()` et `setReminderDays()` n'ont, elles, plus aucun appelant
// nulle part — elles ne sont conservées que le temps que l'écran Paramètres, qui
// appartient à un autre périmètre (`PLAN_EXECUTION` §2), soit relu ; elles
// disparaîtront avec le seuil de rappel qu'elles réglaient.

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

    /**
     * Segment de nom de fichier identifiant la filiale EXPORTÉE — jamais une
     * marque en dur (lot L9, `CONVENTIONS.md` §33.4) : un export de la filiale
     * B nommé d'après la filiale A serait trompeur au premier regard porté sur
     * le fichier, précisément le geste qu'un « remise à l'acquéreur » exige de
     * ne jamais rater. Repli sur le code (court, déjà sans espace ni accent)
     * si la raison sociale n'est pas encore résolue.
     */
    function segmentFiliale() {
        let brut = "";
        try {
            const s = (typeof Session !== "undefined") ? Session.courante() : null;
            brut = (s && (s.filialeNom || s.filialeCode)) || "";
        } catch (e) { brut = ""; }
        const slug = String(brut)
            .normalize("NFD").replace(/\p{Diacritic}/gu, "")   // accents décomposés par normalize()
            .replace(/[^A-Za-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        return slug || "Filiale";
    }

    function exportPlain() {
        // ── LE DROIT D'EXPORT EST DISTINCT DE LA LECTURE (§3.3) ───────────
        // Entonnoir unique : `Droits.exigerExport()` (js/core/session.js).
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;
        download(DataStore.exportSnapshot(), `Sauvegarde_CyberGRC_${segmentFiliale()}_${dateStamp()}.json`);
        markExported();
    }

    async function exportEncrypted(password) {
        // ── LE DROIT D'EXPORT EST DISTINCT DE LA LECTURE (§3.3) ───────────
        // Entonnoir unique : `Droits.exigerExport()` (js/core/session.js).
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;
        const text = await DataStore.exportEncrypted(password);
        download(text, `Sauvegarde_CyberGRC_${segmentFiliale()}_${dateStamp()}.chiffre.json`);
        markExported();
    }

    /* ===== Bandeau de rappel — RETIRÉ (voir l'entête) =====
       La fonction subsiste parce que `app.js` l'appelle au montage — et parce
       qu'elle a encore un effet utile : elle VIDE `#global-banner`. Le seul
       bandeau que l'application affiche désormais est celui de `sync.js`, qui
       signale une modification NON ENREGISTRÉE — une information, elle, exacte
       et utile ; il vit dans son propre hôte, jamais dans celui-ci. */
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
