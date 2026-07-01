// Emplacement : js/services/exportExcel.js
// Nom du fichier : exportExcel.js
// (Mise à jour pour que l'export respecte le client actuellement sélectionné)

const ExportExcelService = (() => {

    function exportAudit() {
        if (typeof XLSX === 'undefined') {
            alert("Erreur : La bibliothèque d'export Excel (SheetJS) n'est pas chargée.");
            return;
        }

        try {
            const wb = XLSX.utils.book_new();
            
            // Récupérer le contexte
            const currentClient = localStorage.getItem("cyber-context") || "global";
            const clients = DataStore.getClients();
            let contextLabel = "Global";
            if (currentClient !== "global") {
                const c = clients.find(cl => cl.id === currentClient);
                if (c) contextLabel = c.nom;
            }

            // 1. Actifs (Toujours globaux à l'entreprise)
            const actifsData = DataStore.getActifs().map(a => ({
                "ID Interne": a.id,
                "Nom de l'actif": a.nom,
                "Type": a.type,
                "Criticité": String(a.criticite || "faible").toUpperCase(),
                "Responsable": a.responsable || "Non défini"
            }));
            const wsActifs = XLSX.utils.json_to_sheet(actifsData.length ? actifsData : [{"Message": "Aucun actif"}]);
            XLSX.utils.book_append_sheet(wb, wsActifs, "1_Actifs_SI");

            // 2. Risques (Toujours globaux)
            const risquesData = DataStore.getRisques().map(r => ({
                "ID Interne": r.id,
                "Nom du scénario": r.nom,
                "Niveau Global": String(r.niveau || "faible").toUpperCase(),
                "Impact": r.impact,
                "Probabilité": r.probabilite,
                "Description": r.description || ""
            }));
            const wsRisques = XLSX.utils.json_to_sheet(risquesData.length ? risquesData : [{"Message": "Aucun risque"}]);
            XLSX.utils.book_append_sheet(wb, wsRisques, "2_Risques_EBIOS");

            // 3. Exigences (FILTRÉES PAR CLIENT)
            const exigences = DataStore.getExigencesByClient(currentClient);
            const exigencesData = exigences.map(e => ({
                "Code Exigence": e.code,
                "Intitulé complet": e.intitule,
                "Statut Conformité": String(e.statut_conformite || "non défini").toUpperCase(),
                "Responsable": e.responsable || "Non défini",
                "Origine": currentClient === "global" ? (e.client_id ? (clients.find(c => c.id === e.client_id)?.nom || "Inconnu") : "Interne") : contextLabel,
                "Commentaire": e.commentaire || ""
            }));
            const wsExigences = XLSX.utils.json_to_sheet(exigencesData.length ? exigencesData : [{"Message": "Aucune exigence"}]);
            XLSX.utils.book_append_sheet(wb, wsExigences, "3_Exigences");

            // 4. Actions (FILTRÉES PAR EXIGENCES DU CLIENT + RISQUES GLOBAUX)
            const tousActions = DataStore.getActions();
            let actionsList = tousActions;
            if (currentClient !== "global") {
                const exIds = exigences.map(e => e.id);
                actionsList = tousActions.filter(a => a.exigence_id ? exIds.includes(a.exigence_id) : true);
            }

            const actionsData = actionsList.map(a => {
                let liaison = "Orpheline";
                if (a.exigence_id) liaison = "Liée à l'exigence: " + a.exigence_id;
                else if (a.risque_id) liaison = "Liée au risque: " + a.risque_id;

                return {
                    "Titre de l'action": a.titre,
                    "Statut": String(a.statut || "à faire").toUpperCase(),
                    "Responsable": a.responsable || "",
                    "Date d'échéance": a.echeance ? new Date(a.echeance).toLocaleDateString('fr-FR') : "",
                    "Traçabilité": liaison
                };
            });
            const wsActions = XLSX.utils.json_to_sheet(actionsData.length ? actionsData : [{"Message": "Aucune action"}]);
            XLSX.utils.book_append_sheet(wb, wsActions, "4_Plan_Actions");

            if (wsExigences['!ref']) {
                wsExigences['!cols'] = [ {wch: 15}, {wch: 50}, {wch: 25}, {wch: 20}, {wch: 25}, {wch: 50} ];
            }

            const dateStr = new Date().toISOString().split('T')[0];
            const safeContext = contextLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const fileName = `Export_Cyber_${safeContext}_${dateStr}.xlsx`;
            
            XLSX.writeFile(wb, fileName);

            if (window.showToast) window.showToast(`Export généré pour le périmètre : ${contextLabel}`, "success");

        } catch (error) {
            console.error("Erreur Excel :", error);
            alert("Erreur lors de l'exportation.");
        }
    }

    return { exportAudit };
})();