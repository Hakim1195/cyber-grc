// Emplacement : js/core/api.js
// Nom du fichier : api.js
//
// Client HTTP de l'API serveur (lot L2). C'est le SEUL endroit du frontend qui
// parle au réseau : `sync.js` s'en sert, `datastore.js` ne le connaît pas.
//
// ── Ce que ce fichier tient ───────────────────────────────────────────────────
//
//  · **Le périmètre ne part JAMAIS d'ici.** Aucune méthode n'accepte de filiale,
//    de périmètre ni de rôle : le serveur les résout seul (PLAN_SERVEUR §2.4,
//    contrôle S2). C'est tenu par la forme — il n'existe pas de paramètre pour.
//  · **Origine relative.** Les chemins sont relatifs (`/api/…`) : en production
//    Apache sert le frontend et l'API sous la même origine (PLAN_SERVEUR §1.1).
//    Aucune URL de serveur n'est écrite en dur, donc aucune à changer au
//    déploiement, et aucune requête ne peut partir ailleurs.
//  · **Les erreurs sont typées, pas devinées.** Le serveur rend
//    `{erreur, message, code_grc?, version_actuelle?, reference}` ; `ErreurApi`
//    les porte telles quelles pour que l'appelant distingue « modifié
//    entre-temps » (GRC03) d'un refus de droit, qui n'appellent pas la même
//    réponse côté utilisateur.
//  · **Aucun message brut d'exception n'est affiché** : `ErreurApi.message` est
//    la phrase française du serveur, déjà destinée à l'utilisateur.

const Api = (() => {
    "use strict";

    const BASE = "api";               // relatif : voir l'entête (même origine qu'Apache)
    const DELAI_MS = 30000;           // délai de garde d'une requête
    const DELAI_CHARGEMENT_MS = 60000; // le chargement initial peut être long en VPN

    /* =====================================================================
       ERREUR TYPÉE
    ===================================================================== */

    // `code` reprend le champ `erreur` du serveur ; `reseau` marque les échecs
    // qui n'ont jamais atteint l'application (coupure VPN, service arrêté).
    class ErreurApi extends Error {
        constructor(details) {
            super(details.message || "Le serveur n'a pas pu traiter la demande.");
            this.nom = "ErreurApi";
            this.statut = details.statut || 0;
            this.code = details.code || "erreur_interne";
            this.codeGrc = details.codeGrc || null;
            this.versionActuelle = (typeof details.versionActuelle === "number") ? details.versionActuelle : null;
            this.entite = details.entite || null;
            this.identifiant = details.identifiant || null;
            this.reference = details.reference || null;
            this.reseau = !!details.reseau;
            // Vrai quand on ignore SI L'OPÉRATION A EU LIEU côté serveur — et non
            // pas seulement si elle a réussi (constat Q-19). Voir le bloc
            // « expiration » plus bas : c'est le seul endroit qui le pose.
            this.issueInconnue = !!details.issueInconnue;
        }
        // Vrai quand l'enregistrement a été modifié entre-temps (verrouillage
        // optimiste, PLAN_SERVEUR §1.4 — le risque projet P1).
        estConflit() { return this.code === "conflit_version" || this.codeGrc === "GRC03"; }
        // Vrai quand l'écriture est refusée par DROIT : ne jamais proposer de
        // recharger dans ce cas, il n'y a rien à recharger.
        estRefusDroit() { return this.code === "hors_perimetre"; }
        estIntrouvable() { return this.code === "ressource_inconnue"; }
        // Vrai quand un nouvel essai a une chance d'aboutir (panne passagère).
        estPassagere() { return this.reseau || this.statut === 503 || this.statut === 502 || this.statut === 504; }
    }

    /* =====================================================================
       APPEL
    ===================================================================== */

    async function appeler(chemin, options) {
        const opts = options || {};
        const controleur = (typeof AbortController !== "undefined") ? new AbortController() : null;
        const delai = opts.delai || DELAI_MS;
        const minuteur = controleur ? setTimeout(() => controleur.abort(), delai) : null;

        // Cette requête pouvait-elle MODIFIER quelque chose ? Le discriminant sert
        // à deux endroits — l'expiration et le refus du frontal — et il est calculé
        // ici, une fois : deux calculs finiraient par diverger.
        const modifie = (opts.methode || "GET") !== "GET";

        const entetes = { "accept": "application/json" };
        if (opts.corps !== undefined) entetes["content-type"] = "application/json";

        let reponse;
        try {
            reponse = await fetch(BASE + chemin, {
                method: opts.methode || "GET",
                headers: entetes,
                body: opts.corps === undefined ? undefined : JSON.stringify(opts.corps),
                // Le cookie de session du lot L3 voyagera ici, et nulle part ailleurs.
                credentials: "same-origin",
                cache: "no-store",
                redirect: "error",
                signal: controleur ? controleur.signal : undefined
            });
        } catch (e) {
            /* ── EXPIRATION : ce que le navigateur SAIT, et ce qu'il ignore ──────
             *
             * Constat Q-19. La phrase était « Le serveur n'a pas répondu dans le
             * délai imparti », pour toutes les routes. Sur une lecture elle est
             * juste ; sur une reprise elle est trompeuse au pire moment : la
             * transaction peut avoir été VALIDÉE, et l'utilisateur voit ensuite
             * ses données apparaître après qu'on lui a laissé croire à un échec.
             *
             * Le discriminant est la **MÉTHODE**, pas la route, et c'est ce qui
             * fait la valeur du remède : `appeler()` ne sait pas ce qu'une route
             * garantit, mais il sait si la requête pouvait modifier quelque
             * chose. Une route non idempotente ajoutée demain hérite donc du bon
             * défaut **sans que personne ait à y penser** — tenu par la forme, pas
             * par la discipline. C'est le même raisonnement qui a fait refuser,
             * sur le constat Q-11, une liste de champs écrite à la main.
             *
             * ⚠️ Et c'est pour cela que la SECONDE branche ne porte pas le
             * drapeau, délibérément. Une requête qui n'aboutit pas sans expirer
             * (VPN tombé, service arrêté) a, elle aussi, pu être reçue et validée
             * avant que le lien ne cède — mais le cas courant, de très loin, est
             * qu'elle n'est jamais partie. Avertir « peut-être appliquée » à
             * chaque coupure de VPN apprendrait à ignorer l'avertissement, et le
             * geste appris sur un faux positif finit par s'appliquer à un vrai :
             * c'est exactement ce que le constat m-5 reproche à un bandeau
             * quotidien et anodin. La phrase de cette branche n'affirme d'ailleurs
             * aucune issue — elle dit d'où vient la panne, pas ce qu'elle a laissé.
             *
             * Ce que ce remède ne fait pas : rendre le cas impossible. Le serveur
             * surveille désormais l'abandon du client et n'engage plus une
             * transaction que personne ne lira, mais il subsiste une fenêtre où il
             * a validé et où la réponse est en vol. « Peut-être appliquée,
             * rechargez avant de recommencer » reste la seule phrase vraie sur les
             * deux chemins.
             */
            const expire = !!(e && e.name === "AbortError");
            throw new ErreurApi({
                reseau: true,
                statut: 0,
                code: "indisponible",
                issueInconnue: expire && modifie,
                message: expire
                    ? (modifie
                        ? "Le serveur n'a pas répondu dans le délai imparti. L'opération a peut-être " +
                          "été appliquée : rechargez la page avant de recommencer."
                        : "Le serveur n'a pas répondu dans le délai imparti. Rien n'a été modifié.")
                    : "Le serveur est injoignable. Vérifiez votre connexion (VPN) et réessayez."
            });
        } finally {
            if (minuteur) clearTimeout(minuteur);
        }

        let charge = null;
        const type = reponse.headers.get("content-type") || "";
        if (type.indexOf("application/json") !== -1) {
            try { charge = await reponse.json(); } catch (e) { charge = null; }
        }

        if (!reponse.ok) {
            /* ── LE FRONTAL AUSSI PEUT RENDRE UNE ISSUE INCONNUE (constat Q-30) ──
             *
             * `502` et `504` ne viennent pas de l'application : ils viennent
             * d'Apache, qui a **transmis la requête** puis renoncé à attendre la
             * réponse (`ProxyTimeout`) ou vu la connexion arrière céder. La
             * transaction peut donc avoir été validée — exactement le cas que le
             * délai de garde du navigateur produit, par un autre chemin. Ne pas
             * poser le drapeau ici laissait le doublon silencieux du constat Q-27
             * intact sur la moitié frontale du défaut : écran 1, base 2, bandeau
             * vide.
             *
             * `503` est délibérément exclu, et ce n'est pas un oubli : il est rendu
             * **avant** que quoi que ce soit soit tenté — par la barrière
             * fail-closed hors développement, ou par Apache quand le service est
             * arrêté. Rien n'a été engagé, donc rien n'est incertain. Étendre le
             * drapeau à `503` avertirait « peut-être appliquée » sur un service à
             * l'arrêt, c'est-à-dire sur le cas le plus fréquent et le plus
             * anodin — le faux positif que le constat m-5 condamne.
             */
            const issueInconnue = modifie && (reponse.status === 502 || reponse.status === 504);

            // Une réponse non JSON vient du frontal, pas de l'application : elle
            // ne doit rien apprendre de plus que « ça n'a pas marché ».
            if (!charge || typeof charge !== "object") {
                throw new ErreurApi({
                    statut: reponse.status,
                    code: reponse.status >= 500 ? "indisponible" : "erreur_interne",
                    issueInconnue: issueInconnue,
                    message: "Le serveur a refusé la demande (code " + reponse.status + ")." +
                        (issueInconnue
                            ? " L'opération a peut-être été appliquée : rechargez la page avant de recommencer."
                            : "")
                });
            }
            throw new ErreurApi({
                statut: reponse.status,
                issueInconnue: issueInconnue,
                code: charge.erreur,
                message: charge.message,
                codeGrc: charge.code_grc,
                versionActuelle: charge.version_actuelle,
                entite: charge.entite,
                identifiant: charge.identifiant,
                reference: charge.reference
            });
        }

        return charge;
    }

    /* =====================================================================
       POINTS D'ENTRÉE
       Un par route de `backend/src/api/index.ts`. Aucun autre chemin réseau.
    ===================================================================== */

    // Qui suis-je, dans quelle filiale. Remplace toute notion de périmètre
    // conservée par le navigateur (contrôle S2).
    function session() { return appeler("/session"); }

    // Description du modèle : champs acceptés par entité. Sert à n'envoyer que
    // ce que le serveur sait recevoir — et à SIGNALER le reste, jamais à le
    // jeter en silence (voir `sync.js`).
    function modele() { return appeler("/modele"); }

    // Chargement initial du jeu de données de la filiale (PLAN_SERVEUR §1.3).
    function donnees() { return appeler("/donnees", { delai: DELAI_CHARGEMENT_MS }); }

    // Sondage : ce qui a changé depuis `depuisIso`, plus le compte par collection.
    // Ne rend PAS les suppressions : c'est l'écart de volume qui les révèle.
    function rafraichir(depuisIso) {
        return appeler("/rafraichir?depuis=" + encodeURIComponent(depuisIso));
    }

    function creer(entite, identifiant, champs) {
        const corps = { champs: champs };
        if (identifiant) corps.id = identifiant;
        return appeler("/entites/" + encodeURIComponent(entite), { methode: "POST", corps: corps });
    }

    // `version` est STRUCTURELLE : elle voyage dans l'enveloppe, jamais dans
    // `champs` (le champ « version » de `documents` est la version du document).
    function modifier(entite, identifiant, version, champs, versionMiseEnOeuvre) {
        const corps = { version: version, champs: champs };
        if (typeof versionMiseEnOeuvre === "number") corps.versionMiseEnOeuvre = versionMiseEnOeuvre;
        return appeler("/entites/" + encodeURIComponent(entite) + "/" + encodeURIComponent(identifiant),
            { methode: "PUT", corps: corps });
    }

    function supprimer(entite, identifiant, version) {
        const suffixe = (typeof version === "number") ? "?version=" + encodeURIComponent(String(version)) : "";
        return appeler("/entites/" + encodeURIComponent(entite) + "/" + encodeURIComponent(identifiant) + suffixe,
            { methode: "DELETE" });
    }

    /**
     * Reprise d'un fichier `grc-backup` — **une seule transaction côté serveur**
     * (constat bloquant B-3 de la porte S2), et le seul chemin où les
     * identifiants du fichier redeviennent les clés primaires.
     *
     * C'est le **texte brut du fichier** qui part : le serveur lit l'enveloppe,
     * monte la charge de v1 à v12 et borne la taille lui-même. Le navigateur
     * n'a pas à connaître les paliers de migration, et un export ancien est
     * absorbé même par une SPA qui ne le comprendrait plus.
     *
     *     POST /api/reprise
     *     { mode: "remplacer" | "fusionner", apercu?: boolean,
     *       fichier: { nom, contenu } }
     *
     *     → 200 { applique, mode, bilan: {lus, crees, misAJour, supprimes,
     *                                     champsIgnores}, rapport: {…} }
     *
     * `apercu: true` applique réellement puis annule : ce qui est montré est ce
     * qui se produirait, contraintes de la base comprises.
     */
    function reprendre(mode, nomFichier, contenu, apercu) {
        const corps = { mode: mode, fichier: { nom: nomFichier, contenu: contenu } };
        if (apercu === true) corps.apercu = true;
        return appeler("/reprise", { methode: "POST", corps: corps, delai: DELAI_CHARGEMENT_MS });
    }

    // Opération composite : la propagation « au plus défavorable » s'exécute en
    // UNE transaction côté serveur (contrôle S14), et rend les évaluations
    // relues, versions comprises.
    function propagerMesure(mesureId) {
        return appeler("/operations/propager-mesure", { methode: "POST", corps: { mesureId: mesureId } });
    }

    return {
        ErreurApi,
        session, modele, donnees, rafraichir,
        creer, modifier, supprimer, propagerMesure, reprendre
    };
})();

window.Api = Api;
