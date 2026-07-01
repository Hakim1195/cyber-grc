// Emplacement : js/services/importExcel.js
// Nom du fichier : importExcel.js

const ImportExcelService = (() => {

    /* =========================
       IMPORTATION DES EXIGENCES
    ========================== */
    function importExigences(file, currentClient, onSuccess) {
        _processExcel(file, (rows) => {
            let importedCount = 0;
            let skippedCount = 0;
            const existingExigences = DataStore.getExigencesByClient(currentClient);
            const existingCodes = existingExigences.map(ex => String(ex.code).trim().toLowerCase());

            let startIndex = 0;
            let colMapping = { code: 0, intitule: 1, statut: 2, responsable: 3, commentaire: 4 };

            const firstRow = rows[0];
            const isHeader = firstRow.some(cell => ["code", "référence", "intitulé", "statut"].includes(String(cell).toLowerCase().trim()));

            if (isHeader) {
                startIndex = 1;
                firstRow.forEach((cell, idx) => {
                    const val = String(cell).toLowerCase().trim();
                    if (["code", "référence", "id"].includes(val)) colMapping.code = idx;
                    if (["intitulé", "nom"].includes(val)) colMapping.intitule = idx;
                    if (["statut", "état", "conformité"].includes(val)) colMapping.statut = idx;
                    if (["responsable", "pilote"].includes(val)) colMapping.responsable = idx;
                    if (["commentaire", "justification"].includes(val)) colMapping.commentaire = idx;
                });
            }

            for (let i = startIndex; i < rows.length; i++) {
                const row = rows[i];
                if (!row || !row[colMapping.code]) continue;

                const code = String(row[colMapping.code]).trim();
                if (existingCodes.includes(code.toLowerCase())) {
                    skippedCount++;
                    continue;
                }

                let statut = String(row[colMapping.statut] || "non conforme").toLowerCase().trim();
                if (["ok", "conforme", "c", "oui"].includes(statut)) statut = "conforme";
                else if (["ko", "non conforme", "nc", "non"].includes(statut)) statut = "non conforme";
                else if (["partiel", "en cours", "pc"].includes(statut)) statut = "partiellement conforme";
                else if (["na", "non applicable", "n/a"].includes(statut)) statut = "non applicable";
                else statut = "non conforme";

                DataStore.addExigence({
                    id: "EX-" + Date.now() + Math.floor(Math.random() * 1000),
                    client_id: currentClient === "global" ? null : currentClient,
                    code: code,
                    intitule: String(row[colMapping.intitule] || "Sans intitulé").trim(),
                    statut_conformite: statut,
                    responsable: String(row[colMapping.responsable] || "").trim(),
                    commentaire: String(row[colMapping.commentaire] || "").trim()
                });
                importedCount++;
                existingCodes.push(code.toLowerCase());
            }
            if (onSuccess) onSuccess(importedCount, skippedCount);
        });
    }

    /* =========================
       IMPORTATION DES RISQUES (LOGIQUE F x G x M)
    ========================== */
    function importRisques(file, onSuccess) {
        _processExcel(file, (rows) => {
            let importedCount = 0;
            let skippedCount = 0;
            const existingRisques = DataStore.getRisques().map(r => String(r.nom).trim().toLowerCase());

            let startIndex = 0;
            // Ordre par défaut si pas d'entête : A:Nom, B:F, C:G, D:M, E:Description
            let colMapping = { nom: 0, f: 1, g: 2, m: 3, desc: 4 };

            const firstRow = rows[0];
            const isHeader = firstRow.some(cell => ["nom", "fréquence", "gravité", "maîtrise"].includes(String(cell).toLowerCase().trim()));

            if (isHeader) {
                startIndex = 1;
                firstRow.forEach((cell, idx) => {
                    const val = String(cell).toLowerCase().trim();
                    if (["nom", "scénario", "titre"].includes(val)) colMapping.nom = idx;
                    if (["f", "fréquence", "frequence", "frequence d'exposition"].includes(val)) colMapping.f = idx;
                    if (["g", "gravité", "gravite"].includes(val)) colMapping.g = idx;
                    if (["m", "maîtrise", "maitrise", "niveau de maîtrise"].includes(val)) colMapping.m = idx;
                    if (["description", "détails"].includes(val)) colMapping.desc = idx;
                });
            }

            for (let i = startIndex; i < rows.length; i++) {
                const row = rows[i];
                if (!row || !row[colMapping.nom]) continue;

                const nom = String(row[colMapping.nom]).trim();
                if (existingRisques.includes(nom.toLowerCase())) {
                    skippedCount++;
                    continue;
                }

                // Récupération et conversion des valeurs numériques
                const f = parseInt(row[colMapping.f]) || 1;
                const g = parseInt(row[colMapping.g]) || 1;
                const m = parseFloat(String(row[colMapping.m]).replace(',', '.')) || 1;

                const scoreBrut = f * g;
                const scoreResiduel = scoreBrut * m;

                DataStore.addRisque({
                    id: "RISK-" + Date.now() + Math.floor(Math.random() * 1000),
                    nom: nom,
                    f_frequence: f,
                    g_gravite: g,
                    m_maitrise: m,
                    score_brut: scoreBrut,
                    score_residuel: scoreResiduel,
                    niveau: _evaluerNiveau(scoreResiduel), // Le niveau affiché est basé sur le résiduel
                    description: String(row[colMapping.desc] || "").trim(),
                    exigences_liees: []
                });
                importedCount++;
                existingRisques.push(nom.toLowerCase());
            }
            if (onSuccess) onSuccess(importedCount, skippedCount);
        });
    }

    /* =========================
       IMPORTATION DES ACTIFS
    ========================== */
    function importActifs(file, onSuccess) {
        _processExcel(file, (rows) => {
            let importedCount = 0;
            let skippedCount = 0;
            const existingActifs = DataStore.getActifs().map(a => String(a.nom).trim().toLowerCase());

            let startIndex = 0;
            let colMapping = { nom: 0, type: 1, criticite: 2, responsable: 3, desc: 4 };

            const firstRow = rows[0];
            if (!firstRow) return;

            const isHeader = firstRow.some(cell => ["nom", "type", "criticité", "responsable", "description"].includes(String(cell).toLowerCase().trim()));

            if (isHeader) {
                startIndex = 1;
                firstRow.forEach((cell, idx) => {
                    const val = String(cell).toLowerCase().trim();
                    if (["nom", "actif", "titre"].includes(val)) colMapping.nom = idx;
                    if (["type", "catégorie"].includes(val)) colMapping.type = idx;
                    if (["criticité", "cia", "niveau"].includes(val)) colMapping.criticite = idx;
                    if (["responsable", "propriétaire", "pilote"].includes(val)) colMapping.responsable = idx;
                    if (["description", "détails", "emplacement"].includes(val)) colMapping.desc = idx;
                });
            }

            for (let i = startIndex; i < rows.length; i++) {
                const row = rows[i];
                if (!row || !row[colMapping.nom]) continue;

                const nom = String(row[colMapping.nom]).trim();
                if (existingActifs.includes(nom.toLowerCase())) {
                    skippedCount++;
                    continue;
                }

                // Normalisation du Type
                let rawType = String(row[colMapping.type] || "Matériel").trim().toLowerCase();
                let type = "Matériel";
                if (["logiciel", "app", "os"].includes(rawType)) type = "Logiciel";
                else if (["donnée", "donnee", "data"].includes(rawType)) type = "Donnée";
                else if (["service", "cloud", "saas"].includes(rawType)) type = "Service";
                else if (["humain", "personnel", "prestataire"].includes(rawType)) type = "Humain";

                // Normalisation de la Criticité
                let rawCrit = String(row[colMapping.criticite] || "faible").trim().toLowerCase();
                let criticite = "faible";
                if (["critique", "4", "très élevée", "tres elevee"].includes(rawCrit)) criticite = "critique";
                else if (["élevée", "elevee", "3", "h"].includes(rawCrit)) criticite = "élevée";
                else if (["modérée", "moderee", "2", "m"].includes(rawCrit)) criticite = "modérée";

                DataStore.addActif({
                    id: "ACTIF-" + Date.now() + Math.floor(Math.random() * 1000),
                    nom: nom,
                    type: type,
                    criticite: criticite,
                    responsable: String(row[colMapping.responsable] || "").trim(),
                    description: String(row[colMapping.desc] || "").trim(),
                    risques_lies: []
                });
                importedCount++;
                existingActifs.push(nom.toLowerCase());
            }
            if (onSuccess) onSuccess(importedCount, skippedCount);
        });
    }

    /* =========================
       MODÈLE D'IMPORT DES ACTIFS
       (colonnes strictement alignées sur importActifs ci-dessus)
    ========================== */
    function downloadActifsTemplate() {
        if (typeof XLSX === "undefined") {
            alert("La bibliothèque Excel (SheetJS) n'est pas chargée.");
            return;
        }
        const data = [
            ["Nom", "Type", "Criticité", "Responsable", "Description"],
            ["Serveur ERP", "Logiciel", "critique", "DSI", "Progiciel de gestion — cœur de production"],
            ["Baie de stockage SAN", "Matériel", "élevée", "IT Ops", "Stockage centralisé (salle serveur)"],
            ["Base clients", "Donnée", "critique", "DPO", "Données à caractère personnel"],
            ["Messagerie Microsoft 365", "Service", "modérée", "IT", "Service cloud (SaaS)"],
            ["Astreinte infogérance", "Humain", "faible", "Direction", "Prestataire externe"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 42 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Actifs");
        XLSX.writeFile(wb, "modele_import_actifs.xlsx");
        if (window.showToast) window.showToast("Modèle d'import des actifs téléchargé.", "success");
    }

    /* =========================
       OUTILS INTERNES
    ========================== */
    function _processExcel(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (rows && rows.length > 0) callback(rows);
            } catch (err) {
                alert("Erreur lors de la lecture du fichier Excel.");
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function _evaluerNiveau(score) {
        if (score < 3) return "faible";      // Non critique
        if (score < 8) return "élevé";       // Critique (Jaune) -> On mappe vers nos classes CSS existantes
        return "critique";                   // Très critique (Rouge)
    }

    return { importExigences, importRisques, importActifs, downloadActifsTemplate };
})();