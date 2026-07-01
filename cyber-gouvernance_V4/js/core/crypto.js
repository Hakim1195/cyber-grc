// Emplacement : js/core/crypto.js
// Nom du fichier : crypto.js
//
// Primitives cryptographiques basées sur l'API Web Crypto du navigateur.
// (100% côté client, aucun backend.)
//   - Dérivation de clé : PBKDF2-HMAC-SHA-256
//   - Chiffrement       : AES-256-GCM (authentifié : détecte un mauvais mot de passe)

const CryptoService = (() => {
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    // crypto.subtle n'est disponible que dans un contexte sécurisé
    // (https, localhost ou file://).
    function available() {
        return typeof crypto !== "undefined" && !!crypto.subtle;
    }

    function bufToB64(buf) {
        const bytes = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function b64ToBuf(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    }

    function randomBytes(n) {
        const u = new Uint8Array(n);
        crypto.getRandomValues(u);
        return u;
    }

    function newSalt() { return bufToB64(randomBytes(16)); }
    function newIv() { return randomBytes(12); }

    // Dérive une clé AES-GCM depuis un mot de passe.
    async function deriveKey(passphrase, saltB64, iterations, usages) {
        const salt = new Uint8Array(b64ToBuf(saltB64));
        const baseKey = await crypto.subtle.importKey(
            "raw", textEncoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            usages
        );
    }

    // Chiffre une chaîne → enveloppe { iv, ct } (base64).
    async function encryptString(key, plaintext) {
        const iv = newIv();
        const ct = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv }, key, textEncoder.encode(plaintext)
        );
        return { iv: bufToB64(iv), ct: bufToB64(ct) };
    }

    // Déchiffre { iv, ct } → chaîne. Lève une exception si la clé est incorrecte.
    async function decryptString(key, env) {
        const iv = new Uint8Array(b64ToBuf(env.iv));
        const pt = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv }, key, b64ToBuf(env.ct)
        );
        return textDecoder.decode(pt);
    }

    return {
        available, bufToB64, b64ToBuf, randomBytes, newSalt, newIv,
        deriveKey, encryptString, decryptString
    };
})();
