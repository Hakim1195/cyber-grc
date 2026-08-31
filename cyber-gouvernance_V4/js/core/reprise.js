// Emplacement : js/core/reprise.js
// Nom du fichier : reprise.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  Reprise des données de la version 100 % navigateur — constat B-1 de S2
// ═══════════════════════════════════════════════════════════════════════════
//
// `PLAN_SERVEUR` §2.6 fait de l'export `grc-backup` le chemin de reprise d'une
// filiale déjà équipée de la version locale. L'ordre correct est donc :
//
//      exporter depuis l'ancienne version  →  reprendre dans la nouvelle
//
// La porte S2 a constaté que rien ne défendait cet ordre : la simple ouverture
// de la nouvelle adresse effaçait la base `cyber-grc-db`, **y compris quand le
// serveur était injoignable et que l'application refusait de démarrer**. Deux
// ans de travail détruits par quelqu'un qui n'avait encore rien pu faire.
//
// ── La règle que ce fichier tient ───────────────────────────────────────────
//
//   > Rien n'est effacé de ce poste sans un geste explicite de l'utilisateur,
//   > et jamais avant que ses données aient été mises à l'abri.
//
// Concrètement : la base héritée est **détectée**, jamais touchée ; un bandeau
// la signale après une connexion réussie et propose, dans cet ordre,
// **d'exporter** puis **de reprendre** ; le bouton d'effacement n'apparaît
// qu'une fois l'une des deux faite, et demande encore confirmation.
//
// Cas de l'ancien coffre : un instantané chiffré est illisible ici (la phrase de
// passe n'existe plus dans cette version). On le dit, et **on n'efface rien** —
// l'utilisateur doit rouvrir l'ancienne version pour l'exporter.

const Reprise = (() => {
    "use strict";

    let heritage = null;        // résultat de `Persistence.lireHeritage()`
    let misEnAbri = false;      // exporté ou repris au moins une fois
    let masque = false;

    function esc(v) {
        if (window.escapeHtml) return window.escapeHtml(v);
        return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[c]));
    }

    function hote() {
        let h = document.getElementById("reprise-banner-host");
        if (!h) {
            h = document.createElement("div");
            h.id = "reprise-banner-host";
            h.className = "no-print";
            const gb = document.getElementById("global-banner");
            if (gb && gb.parentNode) gb.parentNode.insertBefore(h, gb);
            else { const mc = document.querySelector(".main-content"); if (mc) mc.prepend(h); }
        }
        return h;
    }

    function compter(payload) {
        if (!payload || typeof payload !== "object") return 0;
        let n = 0;
        Object.keys(payload).forEach(k => { if (Array.isArray(payload[k])) n += payload[k].length; });
        return n;
    }

    /**
     * Appelé après une connexion réussie, et seulement là : tant que le serveur
     * n'a pas répondu, on ne propose rien et on ne touche à rien.
     */
    async function verifier() {
        try { heritage = await Persistence.lireHeritage(); }
        catch (e) { heritage = null; return false; }
        if (!heritage || !heritage.present) return false;
        rendre();
        return true;
    }

    function rendre() {
        const h = hote();
        if (!h) return;
        if (!heritage || !heritage.present || masque) { h.innerHTML = ""; return; }

        const volume = compter(heritage.payload);

        if (heritage.chiffre) {
            // Illisible ici : surtout ne rien proposer d'irréversible.
            h.innerHTML =
                '<div class="quota-banner" role="alert">' +
                '<span class="quota-ico">!</span>' +
                '<span class="quota-text"><b>Données de l’ancienne version présentes sur ce poste, et chiffrées.</b> ' +
                'Elles ne peuvent pas être lues ici : la protection par mot de passe du navigateur a été retirée. ' +
                'Rouvrez l’ancienne version de l’application pour les exporter, puis importez le fichier ' +
                'depuis Paramètres. <b>Rien n’a été effacé.</b></span>' +
                '</div>';
            return;
        }

        const detail = volume > 0
            ? esc(String(volume)) + " enregistrement(s)"
            : esc(String(heritage.pointsDeRestauration)) + " point(s) de restauration";

        h.innerHTML =
            '<div class="quota-banner" role="alert">' +
            '<span class="quota-ico">!</span>' +
            '<span class="quota-text"><b>Données de l’ancienne version encore présentes sur ce poste</b> (' + detail + '). ' +
            'Exportez-les, ou reprenez-les dans cette filiale. <b>Rien ne sera effacé sans votre accord.</b></span>' +
            (volume > 0 ? '<button id="reprise-exporter" class="reminder-btn">Exporter dans un fichier</button>' : '') +
            (volume > 0 ? '<button id="reprise-reprendre" class="reminder-btn">Reprendre dans cette filiale</button>' : '') +
            (misEnAbri || volume === 0 ? '<button id="reprise-effacer" class="reminder-btn">Effacer de ce poste</button>' : '') +
            '</div>';

        const exporter = document.getElementById("reprise-exporter");
        if (exporter) exporter.onclick = () => {
            const enveloppe = {
                format: "grc-backup",
                version: (heritage.payload && heritage.payload.schemaVersion) || 1,
                app: "cyber-grc-dedienne",
                encrypted: false,
                createdAt: new Date().toISOString(),
                payload: heritage.payload
            };
            BackupService.telecharger(JSON.stringify(enveloppe, null, 2),
                "Reprise_CyberGRC_poste_" + new Date().toISOString().split("T")[0] + ".json");
            misEnAbri = true;
            rendre();
            if (window.showToast) window.showToast("Fichier de reprise téléchargé. Conservez-le avant d’effacer ce poste.", "success");
        };

        const reprendre = document.getElementById("reprise-reprendre");
        if (reprendre) reprendre.onclick = async () => {
            if (!confirm("Reprendre " + volume + " enregistrement(s) de l’ancienne version dans la filiale active ?\n\n" +
                "Les éléments déjà présents ne sont pas écrasés : seuls les absents sont ajoutés.")) return;
            reprendre.disabled = true; reprendre.textContent = "Reprise en cours…";
            try {
                const r = await DataStore.applyImport(heritage.payload, "merge");
                const total = r.added ? Object.values(r.added).reduce((a, b) => a + b, 0) : 0;
                misEnAbri = !!r.ok;
                rendre();
                if (window.showToast) {
                    window.showToast(r.ok
                        ? total + " enregistrement(s) repris dans la filiale."
                        : "Reprise incomplète : voir le bandeau des modifications non enregistrées.",
                        r.ok ? "success" : "error");
                }
                if (typeof Router !== "undefined") Router.navigateTo(location.hash.replace(/^#/, "") || "/dashboard", false);
            } catch (e) {
                reprendre.disabled = false; reprendre.textContent = "Reprendre dans cette filiale";
                if (window.showToast) window.showToast("Reprise impossible : " + e.message, "error");
            }
        };

        const effacer = document.getElementById("reprise-effacer");
        if (effacer) effacer.onclick = async () => {
            if (!confirm("Effacer définitivement les données de l’ancienne version conservées sur ce poste ?\n\n" +
                "Cette action est irréversible. Assurez-vous d’avoir exporté le fichier de reprise.")) return;
            const ok = await Persistence.effacerBaseHeritee();
            if (ok) {
                heritage = null;
                rendre();
                if (window.showToast) window.showToast("Données locales de l’ancienne version effacées.", "success");
            } else if (window.showToast) {
                window.showToast("Effacement impossible : une autre fenêtre de l’application est peut-être ouverte.", "error");
            }
        };
    }

    return { verifier, rendre };
})();

window.Reprise = Reprise;
