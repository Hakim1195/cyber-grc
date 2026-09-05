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
// `Vault.boot(...)` est la **porte de démarrage** appelée par `js/app.js`.
// C'est aujourd'hui le **seul** appel au coffre subsistant dans toute la SPA :
// l'écran Paramètres, qui en appelait cinq autres fonctions, n'y fait plus
// aucune référence depuis que la bascule serveur lui a retiré le chiffrement au
// repos, le quota et les points de restauration locaux.
//
// La justification a donc changé, et le constat Q-12 l'a relevée : elle
// s'appuyait sur un appelant disparu. La décision, elle, ne change pas — pour
// deux raisons qui tiennent toujours :
//
//  · **`boot` doit rester une porte.** Sans elle, l'application s'afficherait
//    avant d'avoir la moindre donnée, et `js/app.js` appartient à un autre
//    périmètre (`PLAN_EXECUTION` §2). Supprimer l'objet `Vault` la rendrait
//    **impossible à démarrer**.
//  · **Les neuf autres fonctions refusent au lieu de disparaître.** Elles ne
//    coûtent rien, et elles portent une propriété qu'un fichier supprimé ne
//    porterait pas : un appel résiduel — un module non converti, une extension,
//    un essai ancien — reçoit un refus explicite et une phrase lisible, au lieu
//    d'échouer sur un `undefined` dont personne ne saurait quoi faire.
//
// Quand `js/modules/settings.js` et `js/app.js` seront réécrits, ce fichier
// pourra disparaître avec le dernier appel. Pas avant.
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
    /** Vrai une fois l'application montée : ce qui rend F5 destructeur. */
    let applicationMontee = false;
    /** Vrai tant qu'un écran de reconnexion est affiché : un seul à la fois. */
    let reconnexionAffichee = false;

    /* =====================================================================
       PORTE DE DÉMARRAGE
    ===================================================================== */

    // onReady(null) est appelé quand l'application peut démarrer. L'argument
    // `null` est conservé : `app.js` le passe à `DataStore.setKey()`, devenu
    // sans effet.
    function boot(onReady) {
        onReadyCb = onReady;
        // Une session qui expire PENDANT l'utilisation ne passe pas par
        // `connecter()` : elle arrive par n'importe quel appel de `sync.js`.
        // On s'abonne au FAIT, une seule fois, et c'est ici qu'on décide du
        // geste — parce qu'ici, et nulle part ailleurs, on sait si
        // l'application est montée et donc ce qu'une saisie perdrait.
        if (typeof Api !== "undefined" && Api.surAuthentificationRequise) {
            Api.surAuthentificationRequise(() => { demanderReconnexion(); });
        }
        connecter();
    }

    async function connecter() {
        renderConnexion();
        try {
            await Sync.demarrer();
        } catch (e) {
            /* ── LE 401 N'EST PAS UNE PANNE : C'EST UNE PORTE ────────────────
             *
             * `renderEchec` dit « serveur indisponible » et propose de
             * réessayer. Pour un serveur qui demande simplement qui vous êtes,
             * c'est faux et sans issue : réessayer rendra le même 401
             * indéfiniment. On montre donc le formulaire.
             *
             * La règle posée en vague 2 tient sans changement : **l'application
             * ne démarre pas**. Le jeu de données n'est pas chargé, `onReadyCb`
             * n'est pas appelé, et rien ne s'affiche derrière — c'est
             * exactement le même refus, avec le bon écran.
             */
            if (e && typeof e.estNonAuthentifie === "function" && e.estNonAuthentifie()) {
                renderFormulaireConnexion(null);
                return;
            }
            // Session valide, mais aucun droit : se reconnecter n'y changera
            // rien (le compte n'appartient à aucun groupe `GRC-*`). Proposer le
            // formulaire enverrait l'utilisateur retaper son mot de passe en
            // boucle pour un refus qui ne vient pas de lui.
            if (e && typeof e.estDroitInsuffisant === "function" && e.estDroitInsuffisant()) {
                renderAucunAcces(e);
                return;
            }
            renderEchec(e);
            return;
        }
        removeOverlay();
        if (typeof onReadyCb === "function") {
            try {
                await onReadyCb(null);
                applicationMontee = true;
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

    /**
     * L'écran de démarrage n'affiche JAMAIS le logo d'une filiale ici, à
     * dessein (lot L9, `CONVENTIONS.md` §33.4) : avant que `/api/session` ait
     * répondu, aucune filiale n'est encore connue — pas même celle de la
     * dernière session, qu'on ne suppose pas valide. Montrer le logo de la
     * maison mère par défaut serait précisément le défaut que ce lot corrige ;
     * un nom de produit neutre est donc le seul choix qui ne ment jamais.
     */
    function overlayShell(inner) {
        let ov = document.getElementById("lock-overlay");
        if (!ov) {
            ov = document.createElement("div");
            ov.id = "lock-overlay";
            ov.className = "lock-overlay no-print";
            document.body.appendChild(ov);
        }
        ov.innerHTML = `<div class="lock-card"><div class="lock-brand">Cyber GRC</div>${inner}</div>`;
        return ov;
    }

    function removeOverlay() {
        const ov = document.getElementById("lock-overlay");
        if (ov) ov.remove();
    }

    function renderConnexion() {
        overlayShell(`
            <h2 class="lock-title">${t("etat.connexionServeur")}</h2>
            <p class="lock-sub">${t("etat.chargementFiliale")}</p>`);
    }

    function renderEchec(erreur) {
        // Seul le message destiné à l'utilisateur est affiché : ni pile d'appel,
        // ni détail technique (contrôle S12 de la grille de sécurité).
        // ⚠️ `erreur.message` vient du SERVEUR, qui rédige en français (§37.5).
        // On l'affiche tel quel ; seule la phrase d'accompagnement suit la langue.
        const message = (erreur && erreur.message)
            ? erreur.message
            : t("etat.serveurInjoignable");
        overlayShell(`
            <h2 class="lock-title">${t("etat.serveurIndisponible")}</h2>
            <p class="lock-sub">${esc(message)}</p>
            <p class="lock-sub">${t("etat.verifierVpn")}</p>
            <button type="button" id="reconnect-btn" class="lock-btn">${t("etat.reessayer")}</button>`);
        const b = document.getElementById("reconnect-btn");
        if (b) b.onclick = () => { b.disabled = true; b.textContent = t("etat.connexionEnCours"); connecter(); };
    }

    /* =====================================================================
       ÉCRAN DE CONNEXION (lot L3)
       =====================================================================

       ── Aucun gestionnaire en ligne, et ce n'est pas un détail ─────────────

       La politique de sécurité de contenu du vhost livré interdit les attributs
       `onclick=` et consorts : soixante-quatre d'entre eux avaient rendu
       l'application inerte dans sa configuration de déploiement (`CLAUDE.md`
       §3). Tout est donc branché après rendu, par `addEventListener`.

       ── Ce que cet écran ne fait pas ───────────────────────────────────────

       · il ne mémorise **rien** : ni identifiant, ni mot de passe, ni case « se
         souvenir de moi ». Le `localStorage` de ce produit est purgé au
         démarrage et à la fermeture (`js/core/session.js`), et lui ajouter un
         identifiant d'entreprise serait rouvrir ce qu'on vient de fermer ;
       · il ne dit **pas** lequel des deux champs est faux. « Identifiant ou mot
         de passe refusé » ne renseigne pas un attaquant sur l'existence d'un
         compte — et la phrase exacte vient du serveur, pas d'ici ;
       · il ne **compte pas** les tentatives : c'est le serveur qui verrouille
         (`AUTH_MAX_TENTATIVES`), et un compteur de navigateur ne protège que de
         l'utilisateur honnête.
    ===================================================================== */

    /**
     * @param {string|null} message phrase du serveur à afficher, ou `null`
     * @param {string} identifiantSaisi identifiant déjà tapé — on ne le reprend
     *        jamais du stockage, seulement de la saisie en cours, pour ne pas
     *        faire retaper un login après une faute de frappe sur le mot de passe
     */
    function renderFormulaireConnexion(message, identifiantSaisi) {
        overlayShell(`
            <h2 class="lock-title">${t("etat.connexion")}</h2>
            <p class="lock-sub">${t("etat.identifiezVous")}</p>
            ${message ? `<p class="lock-error" id="login-erreur" role="alert">${esc(message)}</p>` : ""}
            <form id="login-form" autocomplete="off">
                <label class="lock-sub" style="margin-bottom:4px; display:block; text-align:left;" for="login-identifiant">${t("etat.identifiant")}</label>
                <input type="text" id="login-identifiant" class="lock-input" autocomplete="username"
                       value="${esc(identifiantSaisi || "")}" required />
                <label class="lock-sub" style="margin-bottom:4px; display:block; text-align:left;" for="login-motdepasse">${t("etat.motDePasse")}</label>
                <input type="password" id="login-motdepasse" class="lock-input"
                       autocomplete="current-password" required />
                <button type="submit" id="login-btn" class="lock-btn">${t("etat.seConnecter")}</button>
            </form>`);
        brancherFormulaire("login-form", "login-identifiant", "login-motdepasse", "login-btn",
            async (identifiant, motDePasse, bouton) => {
                try {
                    const brut = await Api.connexion(identifiant, motDePasse);
                    // Le contrat suppose que la connexion rend le même objet que
                    // `api/session` ; s'il rend autre chose, `Sync.demarrer()`
                    // rechargera la session de toute façon.
                    if (brut && typeof brut === "object") { try { Session.adopter(brut); } catch (e) { /* le démarrage relira */ } }
                    await connecter();
                } catch (e) {
                    bouton.disabled = false;
                    bouton.textContent = t("etat.seConnecter");
                    renderFormulaireConnexion(phraseDeRefus(e), identifiant);
                }
            });
        const champ = document.getElementById("login-identifiant");
        if (champ) champ.focus();
    }

    /**
     * Le compte est connecté, mais aucun droit ne lui ouvre l'application.
     *
     * ── Ce que cet écran NE fait pas, et c'est le contrat (§26.2) ───────────
     *
     * Il **ne déconnecte pas**, et il **ne propose pas de recommencer**. Un 403
     * n'est pas un 401 : la personne est parfaitement connectée, et la refermer
     * ou lui rouvrir un formulaire de connexion lui ferait retaper son mot de
     * passe pour obtenir exactement le même refus. Ce qui manque n'est pas une
     * preuve d'identité, c'est un rattachement à un groupe — et cela ne se
     * répare qu'en dehors de l'application.
     *
     * Le seul geste offert est une **fermeture de session explicitement
     * demandée** : sans elle, quelqu'un qui s'est connecté avec le mauvais
     * compte serait enfermé. Ce n'est pas une proposition de recommencer, et
     * l'intitulé le dit.
     *
     * Le message vient du serveur, tel quel : il ne nomme ni le domaine attendu,
     * ni le niveau requis, ni l'existence d'un compte — les énumérer dirait à
     * qui n'y a pas droit ce qu'il faudrait obtenir (§26.2).
     */
    function renderAucunAcces(erreur) {
        const message = (erreur && erreur.message)
            ? erreur.message
            : t("etat.aucunDroit");
        overlayShell(`
            <h2 class="lock-title">${t("etat.accesRefuse")}</h2>
            <p class="lock-error" role="alert">${esc(message)}</p>
            <p class="lock-sub">${t("etat.aucunDroitExplication")}</p>
            <button type="button" id="logout-btn" class="lock-btn">${t("etat.fermerSession")}</button>`);
        const b = document.getElementById("logout-btn");
        if (b) b.addEventListener("click", async () => {
            b.disabled = true;
            b.textContent = t("etat.fermetureEnCours");
            await fermerSession();
            renderFormulaireConnexion(null, "");
        });
    }

    /* =====================================================================
       EXPIRATION DE SESSION — LE POINT OÙ UNE SAISIE SE PERD
       =====================================================================

       ⚠️ **CE BLOC EXISTE POUR UNE SEULE PROPRIÉTÉ** : *une session qui expire
       pendant une saisie ne détruit pas la saisie*.

       ── Ce qu'on ne fait pas, et pourquoi ──────────────────────────────────

       La réaction spontanée à un 401 est de **renvoyer l'utilisateur à l'écran
       de connexion**, c'est-à-dire de recharger la page. C'est exactement le
       geste que le constat Q-29 a jugé destructeur : la copie de l'écran est la
       seule qui existe — ni `localStorage`, ni `sessionStorage`, ni IndexedDB
       n'en gardent trace —, et recharger l'efface, en affichant un message
       rassurant par-dessus.

       On pose donc un voile **PAR-DESSUS** l'application, sans rien démonter :
       le DOM des formulaires en cours reste en place, `data` reste en mémoire,
       `sync.js` garde ses écritures en attente. Une fois la session rouverte, le
       voile disparaît et ce qui attendait repart — l'utilisateur retrouve son
       écran là où il l'avait laissé.

       ── Le mot qu'on n'emploie pas ─────────────────────────────────────────

       Le mot « recharger » a coûté deux constats successifs (Q-29 puis Q-57)
       parce qu'il était vrai à un endroit et destructeur à un autre. Cet écran
       ne le prononce pas, et met en garde contre F5 exactement comme le bandeau
       d'un enregistrement bloqué le fait : les deux situations partagent la même
       *situation*, pas seulement le même code d'erreur.
    ===================================================================== */

    function demanderReconnexion() {
        // Avant le montage, un 401 est traité par `connecter()` : il n'y a rien
        // à préserver, et le formulaire plein écran est le bon écran.
        if (!applicationMontee) return;
        if (reconnexionAffichee) return;      // un seul voile, quoi qu'il arrive
        reconnexionAffichee = true;
        renderVoileReconnexion(null, "");
    }

    function renderVoileReconnexion(message, identifiantSaisi) {
        const enAttente = compterEnAttente();
        overlayShell(`
            <h2 class="lock-title">${t("etat.sessionExpiree")}</h2>
            <p class="lock-sub">${t("etat.sessionExpireeTexte")}</p>
            <p class="lock-sub"><b>${t("etat.saisieConservee")}</b>${t("etat.saisieConserveeSuite")}${
                enAttente > 0 ? tHtml("etat.enAttenteSuite", { n: enAttente }) : ""
            }.</p>
            <p class="lock-sub">${t("etat.pasDeF5")}</p>
            ${message ? `<p class="lock-error" id="login-erreur" role="alert">${esc(message)}</p>` : ""}
            <form id="login-form" autocomplete="off">
                <label class="lock-sub" style="margin-bottom:4px; display:block; text-align:left;" for="login-identifiant">${t("etat.identifiant")}</label>
                <input type="text" id="login-identifiant" class="lock-input" autocomplete="username"
                       value="${esc(identifiantSaisi || "")}" required />
                <label class="lock-sub" style="margin-bottom:4px; display:block; text-align:left;" for="login-motdepasse">${t("etat.motDePasse")}</label>
                <input type="password" id="login-motdepasse" class="lock-input"
                       autocomplete="current-password" required />
                <button type="submit" id="login-btn" class="lock-btn">${t("etat.reprendreSession")}</button>
            </form>`);
        brancherFormulaire("login-form", "login-identifiant", "login-motdepasse", "login-btn",
            async (identifiant, motDePasse, bouton) => {
                try {
                    const brut = await Api.connexion(identifiant, motDePasse);
                    if (brut && typeof brut === "object") { try { Session.adopter(brut); } catch (e) { /* sans effet */ } }
                    reconnexionAffichee = false;
                    removeOverlay();
                    // Ce qui attendait repart : c'est la moitié qui rend la
                    // préservation utile. Sans elle, la saisie serait conservée
                    // à l'écran et n'arriverait jamais au serveur.
                    if (typeof Sync !== "undefined" && Sync.reprendreApresAuthentification) {
                        Sync.reprendreApresAuthentification();
                    }
                    if (window.showToast) window.showToast(t("etat.sessionRouverte"), "success");
                } catch (e) {
                    bouton.disabled = false;
                    bouton.textContent = t("etat.reprendreSession");
                    renderVoileReconnexion(phraseDeRefus(e), identifiant);
                }
            });
        const champ = document.getElementById("login-identifiant");
        if (champ) champ.focus();
    }

    /** Combien d'écritures attendent — pour le dire, pas pour décider. */
    function compterEnAttente() {
        try {
            if (typeof Sync === "undefined" || !Sync.etat) return 0;
            const e = Sync.etat();
            return (e && (e.bloques || 0)) + (e && e.enAttente ? 1 : 0);
        } catch (e) { return 0; }
    }

    /**
     * La phrase à montrer après un refus de connexion.
     *
     * Le message du serveur est repris tel quel quand il existe : il est déjà
     * rédigé pour l'utilisateur et il est le seul à savoir ce qui s'est passé
     * (compte verrouillé, annuaire injoignable, identifiants refusés). On ne
     * fabrique une phrase que lorsqu'il n'en donne aucune.
     */
    function phraseDeRefus(erreur) {
        if (erreur && erreur.message) return erreur.message;
        if (erreur && typeof erreur.estRythmeLimite === "function" && erreur.estRythmeLimite()) {
            return t("etat.tropDeTentatives");
        }
        return t("etat.identifiantRefuse");
    }

    /**
     * Branche un formulaire de connexion — **sans aucun gestionnaire en ligne**.
     *
     * Le mot de passe est lu au moment de l'envoi et n'est conservé nulle part :
     * ni en variable de portée supérieure, ni dans un attribut, ni dans le
     * `localStorage`.
     */
    function brancherFormulaire(idForm, idIdentifiant, idMotDePasse, idBouton, envoyer) {
        const form = document.getElementById(idForm);
        const bouton = document.getElementById(idBouton);
        if (!form || !bouton) return;
        form.addEventListener("submit", (evenement) => {
            evenement.preventDefault();
            const champIdentifiant = document.getElementById(idIdentifiant);
            const champMotDePasse = document.getElementById(idMotDePasse);
            const identifiant = champIdentifiant ? champIdentifiant.value.trim() : "";
            const motDePasse = champMotDePasse ? champMotDePasse.value : "";
            if (!identifiant || !motDePasse) return;
            bouton.disabled = true;
            bouton.textContent = t("etat.connexionEnCours");
            envoyer(identifiant, motDePasse, bouton);
        });
    }

    /**
     * Ferme la session côté serveur, puis oublie ce que le navigateur en savait.
     *
     * L'ordre compte : oublier d'abord laisserait une session ouverte sur le
     * serveur si l'appel échoue. Et l'échec de l'appel n'empêche pas d'oublier —
     * l'utilisateur a demandé à partir.
     */
    async function fermerSession() {
        try { await Api.deconnexion(); } catch (e) { /* le serveur a déjà pu la fermer */ }
        try { Session.oublier(); } catch (e) { /* rien à oublier */ }
        applicationMontee = false;
        reconnexionAffichee = false;
    }

    /**
     * Déconnexion demandée par l'utilisateur (bouton de la barre latérale).
     *
     * ⚠️ Elle **détruit** ce qui n'est pas encore enregistré, et elle le dit
     * avant de le faire. C'est la différence avec l'expiration : ici,
     * l'utilisateur choisit de partir ; là, la session lui est retirée.
     */
    async function deconnecter() {
        const enAttente = compterEnAttente();
        if (enAttente > 0) {
            // `confirm()` est un contexte TEXTE : `t`, pas `tHtml`.
            const suite = window.confirm(t("etat.deconnexionPerte", { n: enAttente }));
            if (!suite) return false;
        }
        await fermerSession();
        renderFormulaireConnexion(null, "");
        return true;
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
        /* Le coffre n'existe plus, mais `lock()` avait un sens que
           l'authentification du lot L3 rend enfin : fermer la session. Elle y
           renvoie donc, au lieu d'afficher « la protection a été retirée ».

           ⚠️ **Elle n'a aujourd'hui aucun appelant** — vérifié, pas supposé :
           `grep -rn "Vault\." js/` ne rend que `Vault.boot` et
           `Vault.deconnecter`. Ce n'est pas une raison de la supprimer (les
           neuf fonctions héritées existent pour qu'un appel résiduel reçoive
           une réponse lisible), mais c'en est une pour ne pas lui inventer un
           appelant : le constat Q-12 a été relevé trois fois dans ce lot, et
           chaque fois pour une justification qui avait survécu à son appelant. */
        return deconnecter();
    }

    return {
        boot, lock, setup, unlock, verify, changePassphrase, removeVault,
        isConfigured, isUnlocked, getKey,
        // Exposé pour les essais automatisés et un éventuel bouton « reconnecter ».
        connecter,
        // Lot L3 : connexion, déconnexion, et le voile de reconnexion.
        deconnecter, demanderReconnexion
    };
})();

window.Vault = Vault;
