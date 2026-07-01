// Emplacement : js/core/datastore.js
// Nom du fichier : datastore.js

const DataStore = (() => {
    const STORAGE_KEY = "cyber-gouvernance-data";

    let data = {
        clients: [], 
        exigences: [],
        actions: [],
        risques: [],
        actifs: [],
        // NOUVEAUX BLOCS : CONTINUITÉ & RÉSILIENCE
        processus: [],     // Pour le BIA (RTO/RPO)
        crise: [],         // Pour la cellule de crise
        scenarios_pra: [], // Fiches réflexes PRA
        tests_pra: [],     // Suivi des tests et maintien en condition
        prestataires: [],  // Contacts externes / fournisseurs
        mco_actions: []    // Actions préalables (Maintien en Condition Opérationnelle)
    };

    function init() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                data = { ...data, ...parsed };
                
                // Garantir l'existence des tableaux pour la stabilité
                data.clients = Array.isArray(data.clients) ? data.clients : [];
                data.exigences = Array.isArray(data.exigences) ? data.exigences : [];
                data.actions = Array.isArray(data.actions) ? data.actions : [];
                data.risques = Array.isArray(data.risques) ? data.risques : [];
                data.actifs = Array.isArray(data.actifs) ? data.actifs : [];
                
                // Initialisation des nouveaux tableaux si d'anciennes sauvegardes sont chargées
                data.processus = Array.isArray(data.processus) ? data.processus : [];
                data.crise = Array.isArray(data.crise) ? data.crise : [];
                data.scenarios_pra = Array.isArray(data.scenarios_pra) ? data.scenarios_pra : [];
                data.tests_pra = Array.isArray(data.tests_pra) ? data.tests_pra : [];
                data.prestataires = Array.isArray(data.prestataires) ? data.prestataires : [];
                data.mco_actions = Array.isArray(data.mco_actions) ? data.mco_actions : [];
            } else {
                save();
            }
        } catch (e) {
            console.error("Erreur de lecture du DataStore", e);
            save();
        }
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    /* =========================
       CLIENTS (DONNEURS D'ORDRE)
    ========================== */
    function getClients() { return data.clients; }
    function getClientById(id) { return data.clients.find(c => c.id === id); }
    function addClient(client) { data.clients.push(client); save(); }
    function updateClient(client) {
        const i = data.clients.findIndex(c => c.id === client.id);
        if (i !== -1) { data.clients[i] = client; save(); }
    }
    function deleteClient(id) {
        data.clients = data.clients.filter(c => c.id !== id);
        const exigencesToDel = data.exigences.filter(e => e.client_id === id);
        exigencesToDel.forEach(e => deleteExigence(e.id));
        save();
    }

    /* =========================
       EXIGENCES (ADAPTÉES CLIENT)
    ========================== */
    function getExigences() { return data.exigences; }
    function getExigencesByClient(clientId) {
        if (!clientId || clientId === "global") return data.exigences;
        return data.exigences.filter(e => e.client_id === clientId);
    }
    function getExigenceById(id) { return data.exigences.find(e => e.id === id); }
    function addExigence(exigence) { data.exigences.push(exigence); save(); }
    function updateExigence(exigence) {
        const i = data.exigences.findIndex(e => e.id === exigence.id);
        if (i !== -1) { data.exigences[i] = exigence; save(); }
    }
    function deleteExigence(id) {
        data.exigences = data.exigences.filter(e => e.id !== id);
        data.risques.forEach(r => {
            if (Array.isArray(r.exigences_liees)) {
                r.exigences_liees = r.exigences_liees.filter(eid => eid !== id);
            }
        });
        data.actions = data.actions.filter(a => a.exigence_id !== id);
        save();
    }

    /* =========================
       ACTIONS
    ========================== */
    function getActions() { return data.actions; }
    function getActionById(id) { return data.actions.find(a => a.id === id); }
    function getActionsByExigence(exigenceId) { return data.actions.filter(a => a.exigence_id === exigenceId); }
    function getActionsByRisque(risqueId) { return data.actions.filter(a => a.risque_id === risqueId); }
    function addAction(action) { data.actions.push(action); save(); }
    function updateAction(action) {
        const i = data.actions.findIndex(a => a.id === action.id);
        if (i !== -1) { data.actions[i] = action; save(); }
    }
    function deleteAction(id) { data.actions = data.actions.filter(a => a.id !== id); save(); }

    /* =========================
       RISQUES
    ========================== */
    function getRisques() { return data.risques; }
    function getRisqueById(id) { return data.risques.find(r => r.id === id); }
    function addRisque(risque) { data.risques.push(risque); save(); }
    function updateRisque(risque) {
        const i = data.risques.findIndex(r => r.id === risque.id);
        if (i !== -1) { data.risques[i] = risque; save(); }
    }
    function deleteRisque(id) {
        data.risques = data.risques.filter(r => r.id !== id);
        data.actifs.forEach(a => {
            if (Array.isArray(a.risques_lies)) {
                a.risques_lies = a.risques_lies.filter(rid => rid !== id);
            }
        });
        data.actions = data.actions.filter(a => a.risque_id !== id);
        save();
    }

    /* =========================
       ACTIFS
    ========================== */
    function getActifs() { return data.actifs; }
    function getActifById(id) { return data.actifs.find(a => a.id === id); }
    function addActif(actif) { data.actifs.push(actif); save(); }
    function updateActif(actif) {
        const i = data.actifs.findIndex(a => a.id === actif.id);
        if (i !== -1) { data.actifs[i] = actif; save(); }
    }
    function deleteActif(id) { data.actifs = data.actifs.filter(a => a.id !== id); save(); }

    /* =========================
       PROCESSUS (BIA)
    ========================== */
    function getProcessus() { return data.processus; }
    function getProcessusById(id) { return data.processus.find(p => p.id === id); }
    function addProcessus(processus) { data.processus.push(processus); save(); }
    function updateProcessus(processus) {
        const i = data.processus.findIndex(p => p.id === processus.id);
        if (i !== -1) { data.processus[i] = processus; save(); }
    }
    function deleteProcessus(id) { data.processus = data.processus.filter(p => p.id !== id); save(); }

    /* =========================
       CELLULE DE CRISE
    ========================== */
    function getCriseMembres() { return data.crise; }
    function getCriseMembreById(id) { return data.crise.find(c => c.id === id); }
    function addCriseMembre(membre) { data.crise.push(membre); save(); }
    function updateCriseMembre(membre) {
        const i = data.crise.findIndex(c => c.id === membre.id);
        if (i !== -1) { data.crise[i] = membre; save(); }
    }
    function deleteCriseMembre(id) { data.crise = data.crise.filter(c => c.id !== id); save(); }

    /* =========================
       SCÉNARIOS PRA / PCA
    ========================== */
    function getScenariosPra() { return data.scenarios_pra; }
    function getScenarioPraById(id) { return data.scenarios_pra.find(s => s.id === id); }
    function addScenarioPra(scenario) { data.scenarios_pra.push(scenario); save(); }
    function updateScenarioPra(scenario) {
        const i = data.scenarios_pra.findIndex(s => s.id === scenario.id);
        if (i !== -1) { data.scenarios_pra[i] = scenario; save(); }
    }
    function deleteScenarioPra(id) { data.scenarios_pra = data.scenarios_pra.filter(s => s.id !== id); save(); }

    /* =========================
       TESTS PRA (MAINTIEN EN CONDITION)
    ========================== */
    function getTestsPra() { return data.tests_pra; }
    function getTestPraById(id) { return data.tests_pra.find(t => t.id === id); }
    function addTestPra(test) { data.tests_pra.push(test); save(); }
    function updateTestPra(test) {
        const i = data.tests_pra.findIndex(t => t.id === test.id);
        if (i !== -1) { data.tests_pra[i] = test; save(); }
    }
    function deleteTestPra(id) { data.tests_pra = data.tests_pra.filter(t => t.id !== id); save(); }

    /* =========================
       PRESTATAIRES & CONTACTS EXTERNES
    ========================== */
    function getPrestataires() { return data.prestataires; }
    function addPrestataire(p) { data.prestataires.push(p); save(); }
    function updatePrestataire(p) {
        const i = data.prestataires.findIndex(x => x.id === p.id);
        if (i !== -1) { data.prestataires[i] = p; save(); }
    }
    function deletePrestataire(id) { data.prestataires = data.prestataires.filter(x => x.id !== id); save(); }

    /* =========================
       MCO / ACTIONS PRÉALABLES
    ========================== */
    function getMcoActions() { return data.mco_actions; }
    function addMcoAction(a) { data.mco_actions.push(a); save(); }
    function updateMcoAction(a) {
        const i = data.mco_actions.findIndex(x => x.id === a.id);
        if (i !== -1) { data.mco_actions[i] = a; save(); }
    }
    function deleteMcoAction(id) { data.mco_actions = data.mco_actions.filter(x => x.id !== id); save(); }

    /* =========================
       SAUVEGARDE & RESTAURATION (SNAPSHOT)
    ========================== */
    function exportSnapshot() {
        return JSON.stringify(data, null, 2); 
    }

    function importSnapshot(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.exigences)) {
                data = {
                    clients: Array.isArray(parsed.clients) ? parsed.clients : [],
                    exigences: Array.isArray(parsed.exigences) ? parsed.exigences : [],
                    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
                    risques: Array.isArray(parsed.risques) ? parsed.risques : [],
                    actifs: Array.isArray(parsed.actifs) ? parsed.actifs : [],
                    processus: Array.isArray(parsed.processus) ? parsed.processus : [],
                    crise: Array.isArray(parsed.crise) ? parsed.crise : [],
                    scenarios_pra: Array.isArray(parsed.scenarios_pra) ? parsed.scenarios_pra : [],
                    tests_pra: Array.isArray(parsed.tests_pra) ? parsed.tests_pra : [],
                    prestataires: Array.isArray(parsed.prestataires) ? parsed.prestataires : [],
                    mco_actions: Array.isArray(parsed.mco_actions) ? parsed.mco_actions : []
                };
                save();
                return true;
            } else {
                return false; 
            }
        } catch (e) {
            console.error("Erreur lors de l'importation du snapshot :", e);
            return false;
        }
    }

    return {
        init,
        getClients, getClientById, addClient, updateClient, deleteClient,
        getExigences, getExigencesByClient, getExigenceById, addExigence, updateExigence, deleteExigence,
        getActions, getActionById, getActionsByExigence, getActionsByRisque, addAction, updateAction, deleteAction,
        getRisques, getRisqueById, addRisque, updateRisque, deleteRisque,
        getActifs, getActifById, addActif, updateActif, deleteActif,
        
        // Export des nouvelles fonctions Résilience
        getProcessus, getProcessusById, addProcessus, updateProcessus, deleteProcessus,
        getCriseMembres, getCriseMembreById, addCriseMembre, updateCriseMembre, deleteCriseMembre,
        getScenariosPra, getScenarioPraById, addScenarioPra, updateScenarioPra, deleteScenarioPra,
        getTestsPra, getTestPraById, addTestPra, updateTestPra, deleteTestPra,
        getPrestataires, addPrestataire, updatePrestataire, deletePrestataire,
        getMcoActions, addMcoAction, updateMcoAction, deleteMcoAction,
        
        exportSnapshot,
        importSnapshot
    };
})();