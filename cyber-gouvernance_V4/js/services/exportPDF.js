// Emplacement : js/services/exportPDF.js
// Nom du fichier : exportPDF.js
// (Maintenu identique car l'impression gère nativement l'affichage du contexte via le DOM)

const ExportPdfService = (() => {

    /* =========================
       GÉNÉRATION DU RAPPORT PDF
       (Utilisation du moteur d'impression natif du navigateur)
    ========================== */
    function exportAuditPdf() {
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