// Emplacement : js/core/vault.js
// Nom du fichier : vault.js
//
// Coffre-fort OPTIONNEL (opt-in). Par défaut l'application n'est pas protégée
// (accessible aux non-experts). L'utilisateur peut activer une protection par
// mot de passe dans les Paramètres → toutes les données sont alors chiffrées.
//
// Chiffrement à enveloppe : une clé de données (DEK, AES-256-GCM) chiffre les
// données ; elle est emballée par une clé dérivée du mot de passe (PBKDF2).
// Changer de mot de passe = ré-emballer la DEK (pas de re-chiffrement massif).

const Vault = (() => {
    const META_KEY = "cyber-vault";
    const ITERATIONS = 600000;                 // PBKDF2 (aligné sur l'export)
    const AUTO_LOCK_MS = 15 * 60 * 1000;       // auto-verrouillage après 15 min d'inactivité

    let dek = null;
    let onReadyCb = null;
    let idleTimer = null;

    function loadMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)); } catch (e) { return null; } }
    function saveMeta(m) { localStorage.setItem(META_KEY, JSON.stringify(m)); }
    function isConfigured() { return !!localStorage.getItem(META_KEY); }
    function isUnlocked() { return !!dek; }
    function getKey() { return dek; }

    async function deriveKEK(passphrase, saltB64) {
        return CryptoService.deriveKey(passphrase, saltB64, ITERATIONS, ["wrapKey", "unwrapKey"]);
    }

    // Crée le coffre et renvoie la DEK (utilisé par les Paramètres pour activer la protection).
    async function setup(passphrase) {
        const saltB64 = CryptoService.newSalt();
        const kek = await deriveKEK(passphrase, saltB64);
        dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
        const iv = CryptoService.newIv();
        const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv });
        saveMeta({ v: 1, kdf: { salt: saltB64, iterations: ITERATIONS }, wrap: { iv: CryptoService.bufToB64(iv), ct: CryptoService.bufToB64(wrapped) } });
        return dek;
    }

    async function unwrapWith(passphrase, meta) {
        const kek = await deriveKEK(passphrase, meta.kdf.salt);
        const iv = new Uint8Array(CryptoService.b64ToBuf(meta.wrap.iv));
        return crypto.subtle.unwrapKey("raw", CryptoService.b64ToBuf(meta.wrap.ct), kek,
            { name: "AES-GCM", iv }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    }

    async function unlock(passphrase) {
        const meta = loadMeta();
        if (!meta) return false;
        try { dek = await unwrapWith(passphrase, meta); return true; }
        catch (e) { dek = null; return false; }
    }

    async function verify(passphrase) {
        const meta = loadMeta();
        if (!meta) return false;
        try { await unwrapWith(passphrase, meta); return true; } catch (e) { return false; }
    }

    async function changePassphrase(oldPass, newPass) {
        const meta = loadMeta();
        if (!meta) return false;
        let curDek;
        try { curDek = await unwrapWith(oldPass, meta); } catch (e) { return false; }
        const saltB64 = CryptoService.newSalt();
        const newKek = await deriveKEK(newPass, saltB64);
        const iv = CryptoService.newIv();
        const wrapped = await crypto.subtle.wrapKey("raw", curDek, newKek, { name: "AES-GCM", iv });
        saveMeta({ v: 1, kdf: { salt: saltB64, iterations: ITERATIONS }, wrap: { iv: CryptoService.bufToB64(iv), ct: CryptoService.bufToB64(wrapped) } });
        dek = curDek;
        return true;
    }

    // Supprime le coffre (protection désactivée). Ne touche pas aux données (le
    // DataStore les réécrit en clair séparément).
    function removeVault() { localStorage.removeItem(META_KEY); dek = null; stopIdleWatch(); }

    function lock() { dek = null; stopIdleWatch(); try { location.reload(); } catch (e) { renderLockScreen(); } }

    /* ===== Auto-verrouillage ===== */
    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    function resetIdle() { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(lock, AUTO_LOCK_MS); }
    function startIdleWatch() { activityEvents.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true })); resetIdle(); }
    function stopIdleWatch() { if (idleTimer) clearTimeout(idleTimer); activityEvents.forEach(ev => window.removeEventListener(ev, resetIdle)); }

    /* ===== Point d'entrée ===== */
    // onReady(dek|null) est appelé quand l'app peut démarrer.
    function boot(onReady) {
        onReadyCb = onReady;
        if (isConfigured()) {
            renderLockScreen();       // protection active → déverrouillage requis
        } else {
            if (typeof onReadyCb === "function") onReadyCb(null);   // pas de protection
        }
    }

    async function proceedUnlocked() {
        removeOverlay();
        startIdleWatch();
        if (typeof onReadyCb === "function") await onReadyCb(dek);
    }

    /* ===== Écran de déverrouillage ===== */
    function overlayShell(inner) {
        let ov = document.getElementById("lock-overlay");
        if (!ov) { ov = document.createElement("div"); ov.id = "lock-overlay"; ov.className = "lock-overlay no-print"; document.body.appendChild(ov); }
        ov.innerHTML = `<div class="lock-card"><img src="assets/logo/logo-dedienne.png" alt="Dedienne Aerospace" class="lock-logo" />${inner}</div>`;
        return ov;
    }
    function removeOverlay() { const ov = document.getElementById("lock-overlay"); if (ov) ov.remove(); }

    function renderLockScreen() {
        overlayShell(`
            <h2 class="lock-title">Accès sécurisé</h2>
            <p class="lock-sub">Application protégée. Saisissez votre mot de passe pour déverrouiller les données.</p>
            <form id="unlock-form" autocomplete="off">
                <input type="password" id="unlock-pass" class="lock-input" placeholder="Mot de passe" autofocus />
                <div id="unlock-error" class="lock-error"></div>
                <button type="submit" class="lock-btn">Déverrouiller</button>
            </form>`);
        const form = document.getElementById("unlock-form");
        const err = document.getElementById("unlock-error");
        form.onsubmit = async (e) => {
            e.preventDefault();
            const pass = document.getElementById("unlock-pass").value;
            if (!pass) return;
            err.textContent = "";
            const btn = form.querySelector("button");
            btn.disabled = true; btn.textContent = "Déverrouillage…";
            const ok = await unlock(pass);
            if (ok) { await proceedUnlocked(); }
            else { btn.disabled = false; btn.textContent = "Déverrouiller"; err.textContent = "Mot de passe incorrect."; document.getElementById("unlock-pass").select(); }
        };
    }

    return {
        boot, lock, setup, unlock, verify, changePassphrase, removeVault,
        isConfigured, isUnlocked, getKey
    };
})();
