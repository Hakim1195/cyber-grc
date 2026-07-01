// Emplacement : js/modules/matrice.js
// Nom du fichier : matrice.js

const MatriceModule = (() => {

    const axes = [1, 2, 3, 4];

    const labelsFrequence = {
        1: "1 - Rare",
        2: "2 - Peu fréquent",
        3: "3 - Fréquent",
        4: "4 - Très fréquent"
    };

    const labelsGravite = {
        1: "1 - Très faible",
        2: "2 - Modéré",
        3: "3 - Grave",
        4: "4 - Très grave"
    };

    function getCellColorClass(f, g) {
        const score = f * g;
        if (score < 3) return "matrix-green";
        if (score < 8) return "matrix-yellow";
        return "matrix-red";
    }

    function render() {
        const risques = DataStore.getRisques();
        const app = document.getElementById("app");

        // Initialisation de la grille 4x4
        const matrixData = {};
        axes.forEach(g => {
            matrixData[g] = {};
            axes.forEach(f => {
                matrixData[g][f] = [];
            });
        });

        // Groupement des risques dans la grille
        risques.forEach(r => {
            const f = parseInt(r.f_frequence) || 1;
            const g = parseInt(r.g_gravite) || 1;
            const safeF = Math.min(Math.max(f, 1), 4);
            const safeG = Math.min(Math.max(g, 1), 4);
            matrixData[safeG][safeF].push(r);
        });

        // Génération des lignes de la matrice (Gravité 4 vers 1)
        const bodyRows = axes.slice().reverse().map(g => `
            <tr>
                <th class="matrix-axis axis-y" style="width: 140px; text-align: right; padding-right: 10px; font-weight: bold;">
                    ${labelsGravite[g]}
                </th>
                ${axes.map(f => {
                    const cellRisks = matrixData[g][f];
                    const count = cellRisks.length;
                    const colorClass = getCellColorClass(f, g);
                    
                    return `
                    <td class="matrix-cell ${colorClass}" 
                        style="cursor: ${count > 0 ? 'pointer' : 'default'};"
                        ${count > 0 ? `onclick="MatriceModule.selectCell(${f}, ${g})"` : ""}
                        title="${count > 0 ? `Cliquer pour voir les ${count} risques` : 'Aucun risque'}">
                        
                        <div class="cell-content center-bubble">
                            ${count > 0 ? `
                                <div class="risk-count-bubble">${count}</div>
                            ` : ""}
                        </div>
                    </td>
                    `;
                }).join("")}
            </tr>
        `).join("");

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>🧮 Matrice de Criticité (Bulle de compte)</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (SI global)</strong> - Méthode Brute (FxG)</p>
                    </div>
                </div>

                <details class="synthese-message info no-print" style="font-size: 0.9rem; padding: 10px; cursor: pointer; outline: none; transition: all 0.3s ease;">
                    <summary style="font-weight: bold; outline: none;">
                        💡 Cette matrice cartographie <strong>${risques.length} scénario(s)</strong>. Cliquez sur une case pour le détail, ou déroulez ici pour voir le <strong>Guide de Cotation EBIOS</strong>.
                    </summary>
                    <div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; cursor: default;">
                        <div>
                            <strong style="color: var(--text-main); font-size: 1rem;">Fréquence d'exposition (Probabilité) :</strong>
                            <ul style="margin: 8px 0 0 20px; padding: 0; color: var(--text-muted); line-height: 1.5;">
                                <li><strong>1 - Rare :</strong> Incident très peu probable (~1 fois tous les 3 à 5 ans).</li>
                                <li><strong>2 - Peu fréquent :</strong> Incident possible (~1 fois par an).</li>
                                <li><strong>3 - Fréquent :</strong> Incident probable (~1 fois par mois).</li>
                                <li><strong>4 - Très fréquent :</strong> Incident quasi-certain (Quotidien ou Hebdomadaire).</li>
                            </ul>
                        </div>
                        <div>
                            <strong style="color: var(--text-main); font-size: 1rem;">Gravité (Impact sur l'entreprise) :</strong>
                            <ul style="margin: 8px 0 0 20px; padding: 0; color: var(--text-muted); line-height: 1.5;">
                                <li><strong>1 - Très faible :</strong> Impact négligeable, gérable rapidement en interne.</li>
                                <li><strong>2 - Modéré :</strong> Perturbation limitée des activités, surmontable.</li>
                                <li><strong>3 - Grave :</strong> Perte financière, légale ou d'image significative.</li>
                                <li><strong>4 - Très grave :</strong> Survie de l'entreprise directement menacée.</li>
                            </ul>
                        </div>
                    </div>
                </details>

                <div class="dashboard-grid">
                    
                    <div class="dashboard-card" style="overflow-x: auto; padding: 1.5rem;">
                        
                        <div style="display: flex; justify-content: center; margin-bottom: 15px; font-weight: bold; font-size: 1.1rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px;">
                            Fréquence d'exposition ➔
                        </div>

                        <div style="display: flex;">
                            <div style="writing-mode: vertical-rl; transform: rotate(180deg); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; padding-right: 15px;">
                                Gravité (Impact) ➔
                            </div>
                            
                            <table class="risk-matrix" style="flex: 1; border-collapse: collapse;">
                                <thead>
                                    <tr>
                                        <th style="background: white; border: none;"></th>
                                        ${axes.map(f => `<th class="matrix-axis axis-x" style="padding: 10px; border: 1px solid var(--border);">${labelsFrequence[f]}</th>`).join("")}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${bodyRows}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div id="matrix-detail-panel" class="dashboard-card detail-panel" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--primary); padding-bottom: 10px; margin-bottom: 15px;">
                            <h3 id="detail-title" style="margin:0;">Liste des risques</h3>
                            <button onclick="MatriceModule.closeDetail()" style="padding: 2px 8px; font-size: 0.8rem; background: var(--bg-body); color: #333; border: 1px solid var(--border);">Fermer X</button>
                        </div>
                        <ul id="detail-list" class="detail-risk-list">
                            </ul>
                    </div>

                </div>

            </section>
        `;

        if (!document.getElementById("matrix-styles")) {
            const style = document.createElement('style');
            style.id = "matrix-styles";
            style.innerHTML = `
                .matrix-cell { border: 2px solid #fff; width: 20%; height: 100px; transition: filter 0.2s; }
                .matrix-cell:hover { filter: brightness(1.1); }
                
                .matrix-green { background-color: #43a047; }
                .matrix-yellow { background-color: #ffb300; }
                .matrix-red { background-color: #e53935; }
                
                .cell-content.center-bubble { display: flex; align-items: center; justify-content: center; height: 100%; }
                
                .risk-count-bubble {
                    width: 60px; height: 60px;
                    background: rgba(255,255,255,0.9);
                    color: #000;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.8rem; font-weight: bold;
                    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                    border: 2px solid #fff;
                    transition: transform 0.1s;
                }
                .matrix-cell:hover .risk-count-bubble { transform: scale(1.1); }

                .detail-panel { grid-column: span 1; border-left: 4px solid var(--primary); transition: all 0.3s ease; }
                .detail-risk-list { list-style: none; padding: 0; margin: 0; max-height: 450px; overflow-y: auto; }
                .detail-risk-item { padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
                .detail-risk-item:hover { background-color: #f8f9fa; }
                .detail-risk-item strong { display: block; margin-bottom: 3px; color: var(--text-main); }
                .detail-risk-item span { font-size: 0.8rem; color: var(--text-muted); }

                .matrix-axis { color: white; }
                .axis-x { background: #555; }
                .axis-y { background: #555; text-align: right; }
                
                /* Style personnalisé pour l'accordéon natif */
                details > summary { list-style-type: none; }
                details > summary::-webkit-details-marker { display: none; }
            `;
            document.head.appendChild(style);
        }

        window.matrixData_Internal = matrixData; 
    }

    /* =========================
       LOGIQUE D'INTERACTION
    ========================== */
    function selectCell(f, g) {
        if (!window.matrixData_Internal) return;
        const cellRisks = window.matrixData_Internal[g][f];
        if (!cellRisks || cellRisks.length === 0) return;

        const panel = document.getElementById("matrix-detail-panel");
        const title = document.getElementById("detail-title");
        const list = document.getElementById("detail-list");

        title.innerHTML = `Risques pour Gravité ${g} / Fréquence ${f} <span style="font-weight: normal; color: #666; font-size: 0.9rem;">(${cellRisks.length} scénarios)</span>`;

        list.innerHTML = cellRisks.map(r => `
            <li class="detail-risk-item" onclick="Router.navigateTo('/risques/${r.id}')">
                <strong>${r.nom}</strong>
                <span>Score Brut : ${r.score_brut} | Résiduel : ${(r.score_residuel || 0).toFixed(2)}</span>
            </li>
        `).join("");

        panel.style.display = "block";
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeDetail() {
        document.getElementById("matrix-detail-panel").style.display = "none";
    }

    return { render, selectCell, closeDetail };
})();