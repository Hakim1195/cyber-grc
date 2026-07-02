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

    // Regroupe les risques dans la grille 4x4 (indexée [gravité][fréquence]).
    function buildMatrixData(risques) {
        const matrixData = {};
        axes.forEach(g => {
            matrixData[g] = {};
            axes.forEach(f => { matrixData[g][f] = []; });
        });
        risques.forEach(r => {
            const f = parseInt(r.f_frequence) || 1;
            const g = parseInt(r.g_gravite) || 1;
            const safeF = Math.min(Math.max(f, 1), 4);
            const safeG = Math.min(Math.max(g, 1), 4);
            matrixData[safeG][safeF].push(r);
        });
        return matrixData;
    }

    // Détecte les risques dont le résiduel dépasse le brut (M > 1) : une mesure
    // de maîtrise ne peut logiquement pas AUGMENTER le risque. Source fréquente :
    // import Excel avec un M mal saisi (ex. « 50 » au lieu de « 0.5 »).
    function findIncoherents(risques) {
        return risques.filter(r => {
            const brut = Number(r.score_brut) || 0;
            const res = Number(r.score_residuel) || 0;
            return res > brut + 1e-9;
        });
    }

    /* =========================
       EXPORT IMAGE (SVG natif → PNG via canvas, sans dépendance)
    ========================== */

    // Construit une représentation SVG autonome de la matrice (formes + texte
    // uniquement : pas de ressource externe → canvas non « tainted », PNG OK).
    function buildMatrixSVG(matrixData, risques) {
        const esc = window.escapeHtml || (s => String(s == null ? "" : s));
        const M = 24, titleH = 50, axisBand = 26, colHdrH = 34, rowHdrW = 132,
              cellW = 118, cellH = 84, legendH = 44, footerH = 22;
        const gridX = M + axisBand + rowHdrW;
        const gridY = M + titleH + axisBand + colHdrH;
        const W = gridX + 4 * cellW + M;
        const H = gridY + 4 * cellH + legendH + footerH + M;
        const C = { green: "#43a047", yellow: "#ffb300", red: "#e53935",
                    primary: "#2059A6", brand: "#E9631B", text: "#333333",
                    muted: "#666666", hdr: "#555555" };
        const font = "Segoe UI, Roboto, Arial, sans-serif";
        const dateStr = new Date().toLocaleDateString("fr-FR");
        let s = "";

        // Fond blanc (sinon PNG transparent).
        s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`;

        // Titre + marque Dedienne.
        s += `<text x="${M}" y="${M + 22}" font-size="20" font-weight="700" fill="${C.primary}">Matrice de criticité des risques</text>`;
        s += `<text x="${M}" y="${M + 41}" font-size="12" fill="${C.muted}">Méthode EBIOS (Fréquence × Gravité) — ${risques.length} scénario(s)</text>`;
        s += `<text x="${W - M}" y="${M + 22}" text-anchor="end" font-size="13" font-weight="700" fill="${C.brand}">Dedienne Aerospace</text>`;
        s += `<text x="${W - M}" y="${M + 41}" text-anchor="end" font-size="11" fill="${C.muted}">Exporté le ${esc(dateStr)}</text>`;

        // Label axe X (Fréquence) au-dessus des colonnes.
        s += `<text x="${gridX + 2 * cellW}" y="${M + titleH + 17}" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="1" fill="${C.primary}">FRÉQUENCE D'EXPOSITION</text>`;
        // Label axe Y (Gravité) vertical à gauche.
        const ayx = M + 16, ayy = gridY + 2 * cellH;
        s += `<text x="${ayx}" y="${ayy}" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="1" fill="${C.primary}" transform="rotate(-90 ${ayx} ${ayy})">GRAVITÉ (IMPACT)</text>`;

        // En-têtes de colonnes (fréquence).
        axes.forEach((f, i) => {
            const x = gridX + i * cellW;
            s += `<rect x="${x}" y="${gridY - colHdrH}" width="${cellW}" height="${colHdrH}" fill="${C.hdr}"/>`;
            s += `<text x="${x + cellW / 2}" y="${gridY - colHdrH / 2}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="600" fill="#ffffff">${esc(labelsFrequence[f])}</text>`;
        });

        // Lignes (gravité 4 en haut → 1 en bas).
        axes.slice().reverse().forEach((g, rowIdx) => {
            const y = gridY + rowIdx * cellH;
            s += `<rect x="${M + axisBand}" y="${y}" width="${rowHdrW}" height="${cellH}" fill="${C.hdr}"/>`;
            s += `<text x="${M + axisBand + rowHdrW - 8}" y="${y + cellH / 2}" text-anchor="end" dominant-baseline="central" font-size="12" font-weight="600" fill="#ffffff">${esc(labelsGravite[g])}</text>`;
            axes.forEach((f, colIdx) => {
                const x = gridX + colIdx * cellW;
                const cls = getCellColorClass(f, g);
                const fill = cls === "matrix-green" ? C.green : cls === "matrix-yellow" ? C.yellow : C.red;
                s += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#ffffff" stroke-width="3"/>`;
                const count = matrixData[g][f].length;
                if (count > 0) {
                    const cx = x + cellW / 2, cy = y + cellH / 2;
                    s += `<circle cx="${cx}" cy="${cy}" r="24" fill="#ffffff" fill-opacity="0.92" stroke="#ffffff" stroke-width="2"/>`;
                    s += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="700" fill="#111111">${count}</text>`;
                }
            });
        });

        // Légende.
        const legY = gridY + 4 * cellH + 22;
        const legItems = [
            { c: C.green, t: "Faible (< 3)" },
            { c: C.yellow, t: "Élevé (3 à 7)" },
            { c: C.red, t: "Critique (≥ 8)" }
        ];
        let lx = gridX;
        legItems.forEach(it => {
            s += `<rect x="${lx}" y="${legY - 11}" width="16" height="16" rx="3" fill="${it.c}"/>`;
            s += `<text x="${lx + 22}" y="${legY}" dominant-baseline="central" font-size="12" fill="${C.text}">${esc(it.t)}</text>`;
            lx += 22 + it.t.length * 7 + 26;
        });

        return `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${font}">${s}</svg>`;
    }

    function currentSVGString() {
        const risques = DataStore.getRisques();
        return buildMatrixSVG(buildMatrixData(risques), risques);
    }

    // Déclenche le téléchargement d'un Blob via un lien temporaire.
    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportSVG() {
        const blob = new Blob([currentSVGString()], { type: "image/svg+xml;charset=utf-8" });
        triggerDownload(blob, "matrice-risques.svg");
    }

    function exportPNG() {
        const blob = new Blob([currentSVGString()], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const scale = 2; // rendu net (haute résolution).
            const canvas = document.createElement("canvas");
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => {
                if (b) triggerDownload(b, "matrice-risques.png");
                else alert("Échec de la génération du PNG.");
            }, "image/png");
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            alert("Échec de l'export PNG (rendu de l'image).");
        };
        img.src = url;
    }

    function render() {
        const risques = DataStore.getRisques();
        const app = document.getElementById("app");

        const matrixData = buildMatrixData(risques);
        const incoherents = findIncoherents(risques);

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
                        <h1>Matrice de Criticité (Bulle de compte) ${Help.tip("Cartographie EBIOS croisant la Fréquence (probabilité) et la Gravité (impact) des risques. Chaque bulle compte les scénarios d'une case ; le coin en haut à droite (fréquent × grave) concentre les risques prioritaires.")}</h1>
                        <p style="color: var(--text-muted); margin-top: 5px;">Périmètre : <strong>Interne (SI global)</strong> - Méthode Brute (FxG)</p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <button onclick="MatriceModule.exportPNG()" title="Télécharger la matrice au format image PNG">Exporter en PNG</button>
                        <button onclick="MatriceModule.exportSVG()" style="background: var(--bg-body); color: var(--text-main); border: 1px solid var(--border);" title="Télécharger la matrice au format vectoriel SVG">Exporter en SVG</button>
                    </div>
                </div>

                ${incoherents.length ? `
                <div class="synthese-message warning no-print" role="alert" style="padding: 1rem 1.25rem;">
                    <strong>Incohérence brut / résiduel — ${incoherents.length} risque(s)</strong>
                    <p style="font-weight: 400; margin: 6px 0 10px;">
                        Le score <strong>résiduel</strong> dépasse le score <strong>brut</strong> : le niveau de maîtrise (M) est supérieur à 1.
                        Une mesure de maîtrise ne peut pas <em>augmenter</em> le risque — vérifiez la valeur de M (souvent une saisie d'import erronée, ex. « 50 » au lieu de « 0.5 »).
                    </p>
                    <ul style="margin: 0; padding-left: 20px; font-weight: 400;">
                        ${incoherents.map(r => `<li><a href="#/risques/${encodeURIComponent(r.id)}" style="color: inherit; font-weight: 600;">${escapeHtml(r.nom) || "Sans nom"}</a> — brut ${Number(r.score_brut) || 0}, résiduel ${(Number(r.score_residuel) || 0).toFixed(2)}</li>`).join("")}
                    </ul>
                </div>` : ""}

                <details class="synthese-message info no-print" style="font-size: 0.9rem; padding: 10px; cursor: pointer; outline: none; transition: all 0.3s ease;">
                    <summary style="font-weight: bold; outline: none;">
                        Cette matrice cartographie <strong>${risques.length} scénario(s)</strong>. Cliquez sur une case pour le détail, ou déroulez ici pour voir le <strong>Guide de Cotation EBIOS</strong>.
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

    return { render, selectCell, closeDetail, exportPNG, exportSVG };
})();