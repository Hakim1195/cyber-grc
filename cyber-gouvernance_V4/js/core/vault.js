// Emplacement : js/core/vault.js
// Nom du fichier : vault.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  Le coffre du navigateur a été RETIRÉ — ce fichier est devenu la porte de
//  démarrage de l'application cliente.
// ═══════════════════════════════════════════════════════════════════════════
//
// `PLAN_SERVEUR` §1.9 : « Chiffrement au repos assuré par le **chiffrement
// disque de la VM** (le coffre navigateur disparaît). » Les données ne sont plus
// stockées sur le poste : il n'y a plus rien à chiffrer localement, et un coffre
// qui ne protège rien est une fausse assurance.
//
// ── Pourquoi neutraliser plutôt que supprimer ────────────────────────────────
//
// `Vault.boot(...)` est la **porte de démarrage** appelée par `js/app.js`, et
// cinq autres fonctions du coffre sont appelées par `js/modules/settings.js`.
// Ces deux fichiers appartiennent à d'autres périmètres et ne sont pas modifiés
// par ce lot (`PLAN_EXECUTION` §2). Supprimer l'objet `Vault` rendrait
// l'application **impossible à démarrer** ; le neutraliser en conservant sa
// forme la fait démarrer, et fait dire non — clairement — à tout ce qui reste.
//
// ── Ce que la porte fait désormais ───────────────────────────────────────────
//
// Elle n'ouvre plus un coffre : elle **établit la liaison au serveur** avant que
// l'application ne s'affiche. Session (`/api/session`), modèle et jeu de données
// (`/api/donnees`) sont chargés d'abord. Si la liaison échoue, l'application NE
// DÉMARRE PAS et l'écran explique pourquoi, avec un bouton « Réessayer ».
//
// Ce point n'est pas cosmétique. Démarrer sur un jeu vide parce que le serveur
// est injoignable afficherait « aucun risque, aucune action, aucun incident » —
// c'est-à-dire exactement le contraire de la réalité, dans un outil qui sert de
// preuve en audit.

const Vault = (() => {
    "use strict";

    const MESSAGE_RETIRE =
        "La protection par mot de passe du navigateur a été retirée : les données ne sont " +
        "plus stockées sur ce poste. Elles vivent sur le serveur, dont le disque est chiffré, " +
        "et l'accès est contrôlé par votre compte d'entreprise.";

    let onReadyCb = null;

    /* =====================================================================
       PORTE DE DÉMARRAGE
    ===================================================================== */

    // onReady(null) est appelé quand l'application peut démarrer. L'argument
    // `null` est conservé : `app.js` le passe à `DataStore.setKey()`, devenu
    // sans effet.
    function boot(onReady) {
        onReadyCb = onReady;
        connecter();
    }

    async function connecter() {
        renderConnexion();
        try {
            await Sync.demarrer();
        } catch (e) {
            renderEchec(e);
            return;
        }
        removeOverlay();
        if (typeof onReadyCb === "function") {
            try {
                await onReadyCb(null);
                // Une fois — et seulement une fois — la liaison établie et
                // l'application montée : signaler d'éventuelles données de la
                // version 100 % navigateur restées sur ce poste. On les propose
                // à la reprise ; on n'y touche pas (constat B-1 de la porte S2).
                if (typeof Reprise !== "undefined") await Reprise.verifier();
            } catch (e) {
                // Le démarrage de l'application elle-même a échoué : le dire, et
                // ne pas laisser une interface à moitié montée.
                renderEchec(e);
            }
        }
    }

    /* =====================================================================
       ÉCRANS DE DÉMARRAGE
       Réutilisent l'habillage de l'ancien écran de déverrouillage (`lock-overlay`
       de `css/style.css`) : aucune feuille de style n'est modifiée par ce lot.
    ===================================================================== */

    function esc(v) {
        if (window.escapeHtml) return window.escapeHtml(v);
        return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[c]));
    }

    function overlayShell(inner) {
        let ov = document.getElementById("lock-overlay");
        if (!ov) {
            ov = document.createElement("div");
            ov.id = "lock-overlay";
            ov.className = "lock-overlay no-print";
            document.body.appendChild(ov);
        }
        ov.innerHTML = `<div class="lock-card"><img src="assets/logo/logo-dedienne.png" alt="Dedienne Aerospace" class="lock-logo" />${inner}</div>`;
        return ov;
    }

    function removeOverlay() {
        const ov = document.getElementById("lock-overlay");
        if (ov) ov.remove();
    }

    function renderConnexion() {
        overlayShell(`
            <h2 class="lock-title">Connexion au serveur</h2>
            <p class="lock-sub">Chargement des données de votre filiale…</p>`);
    }

    function renderEchec(erreur) {
        // Seul le message destiné à l'utilisateur est affiché : ni pile d'appel,
        // ni détail technique (contrôle S12 de la grille de sécurité).
        const message = (erreur && erreur.message)
            ? erreur.message
            : "Le serveur est injoignable.";
        overlayShell(`
            <h2 class="lock-title">Serveur indisponible</h2>
            <p class="lock-sub">${esc(message)}</p>
            <p class="lock-sub">Vérifiez votre connexion (VPN), puis réessayez. Si le problème
            persiste, contactez votre exploitant.</p>
            <button type="button" id="reconnect-btn" class="lock-btn">Réessayer</button>`);
        const b = document.getElementById("reconnect-btn");
        if (b) b.onclick = () => { b.disabled = true; b.textContent = "Connexion…"; connecter(); };
    }

    /* =====================================================================
       ANCIENNE API DU COFFRE — conservée en forme, neutralisée en fond
       Chaque fonction refuse explicitement. Un appel résiduel doit s'entendre,
       pas échouer sur un `undefined`.
    ===================================================================== */

    function isConfigured() { return false; }
    function isUnlocked() { return true; }
    function getKey() { return null; }
    function setup() { return Promise.reject(new Error(MESSAGE_RETIRE)); }
    function unlock() { return Promise.resolve(false); }
    function verify() { return Promise.resolve(false); }
    function changePassphrase() { return Promise.resolve(false); }
    function removeVault() { try { localStorage.removeItem("cyber-vault"); } catch (e) { /* rien à retirer */ } }
    function lock() {
        // Il n'y a plus de coffre à verrouiller. La fermeture de session
        // appartiendra à l'authentification du lot L3 ; d'ici là, on le dit.
        if (window.showToast) window.showToast(MESSAGE_RETIRE, "info");
    }

    return {
        boot, lock, setup, unlock, verify, changePassphrase, removeVault,
        isConfigured, isUnlocked, getKey,
        // Exposé pour les essais automatisés et un éventuel bouton « reconnecter ».
        connecter
    };
})();

window.Vault = Vault;
