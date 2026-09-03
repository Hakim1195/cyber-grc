// Emplacement : js/services/exportPDF.js
// Nom du fichier : exportPDF.js
// (Maintenu identique car l'impression gère nativement l'affichage du contexte via le DOM)

const ExportPdfService = (() => {

    /* =========================
       GÉNÉRATION DU RAPPORT PDF
       (Utilisation du moteur d'impression natif du navigateur)
    ========================== */
    function exportAuditPdf() {
        // ── LE DROIT D'EXPORT EST DISTINCT DE LA LECTURE (§3.3) ───────────
        // Entonnoir unique : `Droits.exigerExport()` (js/core/session.js).
        if (typeof Droits !== "undefined" && !Droits.exigerExport()) return;
        if (window.showToast) {
            window.showToast("Préparation du document PDF... (Ajustez les marges si besoin)", "success");
        }

        setTimeout(() => {
            window.print();
        }, 800);
    }

    return {
        exportAuditPdf
    };
})();