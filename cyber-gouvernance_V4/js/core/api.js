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

    /* ── LE FAIT, ET RIEN QUE LE FAIT (constats Q-19, Q-29, Q-57) ────────────
     *
     * Cette couche énonce **ce qui s'est passé**. Elle ne prescrit **aucun
     * geste**, et c'est une règle, pas une omission.
     *
     * Elle a prescrit « rechargez la page avant de recommencer », et ce même
     * mot a coûté deux constats successifs : vrai pour une reprise, où tout est
     * sur le serveur et où recharger montre la vérité ; faux pour une création
     * bloquée, où le rechargement du navigateur EFFACE la saisie. Le remède de
     * Q-29 a rendu sûr le bouton du bandeau — et la phrase, elle, nommait
     * l'autre geste : celui de la touche F5. Troisième tour du même défaut.
     *
     * `appeler()` ne peut pas savoir quel geste convient : il ignore ce que
     * l'appelant tient en mémoire et ce qu'il perdrait. Il n'a donc plus le
     * droit d'en nommer un. **Chaque couche ajoute le geste qu'elle seule
     * connaît** — `sync.js` pour une écriture bloquée, `datastore.js` pour une
     * reprise — et le FAIT, lui, garde une formulation unique, celle-ci.
     * ───────────────────────────────────────────────────────────────────── */
    const FAIT_ISSUE_INCONNUE = "L'opération a peut-être été appliquée.";

    const BASE = "api";               // relatif : voir l'entête (même origine qu'Apache)
    const DELAI_MS = 30000;           // délai de garde d'une requête
    const DELAI_CHARGEMENT_MS = 60000; // le chargement initial peut être long en VPN

    /* ═══════════════════════════════════════════════════════════════════════
     *  CONTRAT HTTP D'AUTHENTIFICATION — LOT L3
     * ═══════════════════════════════════════════════════════════════════════
     *
     *  **Source unique et faisant foi : `backend/db/CONVENTIONS.md` §26.**
     *  Rien ici n'est supposé ; ce bloc RECOPIE ce contrat en un seul endroit
     *  pour qu'aucune autre ligne de la SPA n'écrive un chemin, un nom de champ
     *  ou un code d'erreur d'authentification. Le jour où le §26 bouge, la
     *  réconciliation coûte une édition de cette constante.
     *
     *  ── Ce que le contrat impose, et que la SPA respecte par construction ──
     *
     *  · `POST api/connexion`, corps `{ identifiant, motDePasse }` → **200 avec
     *    exactement la charge de `GET api/session`**. Le navigateur n'a donc
     *    qu'UNE seule forme à savoir lire, et c'est ce qui garantit que le
     *    chemin « je viens de me connecter » ne diverge jamais du chemin « je
     *    rouvre l'onglet » : les deux passent par `Session.adopter()`, et il
     *    n'existe pas de second analyseur.
     *  · `DELETE api/connexion` → **204**. La session est révoquée EN BASE, pas
     *    seulement oubliée du navigateur.
     *  · **Le cookie de session n'est jamais lu ici.** Il est `HttpOnly` : le
     *    JavaScript ne peut pas le voir, et ne doit pas essayer. Il ne porte ni
     *    `Max-Age` ni `Expires` — l'expiration fait foi en base. **La SPA
     *    n'apprend qu'une session a expiré que par un 401**, jamais par un
     *    minuteur local : une échéance tenue par le client est une échéance que
     *    le client peut mentir, même famille que « le périmètre vient du
     *    serveur ». `credentials: "same-origin"` suffit, et c'est déjà en place.
     *  · **401 `non_authentifie`** : ouvrir l'écran de connexion **sans
     *    détruire la saisie en cours**.
     *  · **403 `droit_insuffisant`** : afficher un refus. **Ne pas
     *    déconnecter**, et ne pas proposer de recommencer — traiter un 403
     *    comme un 401 déconnecterait quelqu'un de parfaitement connecté.
     *  · `droits: { niveau, domaines, export }` dans la charge de session.
     *    `export` est une **permission à part entière**, jamais un niveau.
     *
     *  Les valeurs de `niveaux` et `domaines` sont relevées dans
     *  `backend/src/api/droits.ts`. Un écart entre les deux se voit :
     *  `Droits.verifier` (js/core/session.js) le signale au lieu de le taire.
     * ═══════════════════════════════════════════════════════════════════════ */
    const CONTRAT_AUTH = Object.freeze({
        /** Ouvre (POST) et ferme (DELETE) la session. Un seul chemin, deux verbes. */
        cheminConnexion: "/connexion",
        /** Noms des deux champs du corps de connexion. */
        champIdentifiant: "identifiant",
        champMotDePasse: "motDePasse",
        /** Nom du bloc de droits dans la charge de session. */
        champDroits: "droits",
        /** Nom du bloc d'identité (annuaire) dans la charge de session. */
        champIdentite: "identite",
        /** Codes d'erreur applicatifs — §26.2, tableau des deux refus. */
        codeNonAuthentifie: "non_authentifie",
        codeDroitInsuffisant: "droit_insuffisant",
        /** Niveaux, relevés dans `backend/src/api/droits.ts`. */
        niveaux: Object.freeze(["lecture", "contribution", "validation", "administration"]),
        /** Domaines, relevés dans `backend/src/api/droits.ts`. */
        domaines: Object.freeze([
            "pilotage", "conformite", "risques", "actifs", "actions", "incidents",
            "continuite", "documents", "audits", "tiers", "rgpd", "personnel",
            "administration"
        ])
    });

    /* ── L'AUTHENTIFICATION MANQUANTE EST UN FAIT, PAS UN GESTE ──────────────
     *
     * Même règle que pour l'issue inconnue, et pour la même raison (Q-29,
     * Q-57) : cette couche énonce ce qui s'est passé, et **ne prescrit rien**.
     * Elle ignore si l'application est montée, si une saisie attend en mémoire,
     * et donc si « reconnectez-vous » est un geste sûr ou destructeur. Le geste
     * est nommé par `js/core/vault.js`, qui, lui, le sait.
     */
    const FAIT_SESSION_ABSENTE = "Votre session n'est pas ouverte sur le serveur.";

    /** Observateurs prévenus quand une réponse 401 arrive. Voir `vault.js`. */
    const observateursAuth = [];

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
        //
        // ⚠️ `hors_perimetre` **et lui seul**. Un refus de droit fait revenir la
        // mémoire à la valeur du serveur (`sync.js`), ce qui, sur une CRÉATION,
        // efface la saisie. C'est acceptable pour `hors_perimetre` — la ligne
        // visée n'appartient pas à la filiale, il n'y a rien à conserver — et ce
        // ne l'est pas pour `droit_insuffisant`, qui refuse une saisie que
        // l'utilisateur vient de taper. Celui-ci suit donc le chemin des
        // enregistrements BLOQUÉS : la saisie reste à l'écran. Même leçon que
        // Q-29 : deux situations qui partagent un code HTTP ne partagent pas
        // forcément la bonne réponse.
        estRefusDroit() { return this.code === "hors_perimetre"; }
        // Session valide, droit manquant (lot L3). La saisie est conservée.
        estDroitInsuffisant() {
            return this.statut === 403 && this.code === CONTRAT_AUTH.codeDroitInsuffisant;
        }
        // Il n'y a pas — ou plus — de session ouverte sur le serveur.
        estNonAuthentifie() { return this.statut === 401; }
        // Le serveur a fermé la porte un moment (limitation du rythme).
        estRythmeLimite() { return this.statut === 429; }
        estIntrouvable() { return this.code === "ressource_inconnue"; }
        // Vrai quand un nouvel essai a une chance d'aboutir (panne passagère).
        //
        // ⚠️ Un 401 n'en est PAS une, et c'est un point de sûreté : le juger
        // passager ferait rejouer l'écriture en boucle contre un serveur qui
        // refuse, et le minuteur de relance martèlerait la route toutes les huit
        // secondes. Ce qu'il faut ici est un geste humain — se reconnecter —,
        // pas un nouvel essai.
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
                    ? ("Le serveur n'a pas répondu dans le délai imparti. " +
                       (modifie ? FAIT_ISSUE_INCONNUE : "Rien n'a été modifié."))
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
            //
            // ⚠️ Un 401 fait exception, et c'est mesurable : Apache peut rendre
            // un 401 en HTML (une authentification de frontal), et le navigateur
            // doit tout de même savoir qu'il n'a plus de session. Le FAIT est
            // donc énoncé dans les deux cas, avec la même formulation.
            if (!charge || typeof charge !== "object") {
                throw signaler(new ErreurApi({
                    statut: reponse.status,
                    code: reponse.status === 401 ? CONTRAT_AUTH.codeNonAuthentifie
                        : (reponse.status >= 500 ? "indisponible" : "erreur_interne"),
                    issueInconnue: issueInconnue,
                    message: reponse.status === 401
                        ? FAIT_SESSION_ABSENTE
                        : ("Le serveur a refusé la demande (code " + reponse.status + ")." +
                           (issueInconnue ? " " + FAIT_ISSUE_INCONNUE : ""))
                }), opts);
            }
            throw signaler(new ErreurApi({
                statut: reponse.status,
                issueInconnue: issueInconnue,
                code: charge.erreur,
                message: charge.message,
                codeGrc: charge.code_grc,
                versionActuelle: charge.version_actuelle,
                entite: charge.entite,
                identifiant: charge.identifiant,
                reference: charge.reference
            }), opts);
        }

        return charge;
    }

    /**
     * Prévient les observateurs qu'il n'y a plus de session, puis rend l'erreur
     * telle quelle (pour pouvoir écrire `throw signaler(...)`).
     *
     * Le signalement est **muet** pour la route de connexion elle-même : un mot
     * de passe refusé n'est pas une session qui expire, et l'écran de connexion
     * est déjà sous les yeux de l'utilisateur. Confondre les deux ferait
     * réapparaître un écran par-dessus lui-même.
     */
    function signaler(erreur, opts) {
        if (erreur.statut !== 401) return erreur;
        if (opts && opts.sansSignalement) return erreur;
        observateursAuth.slice().forEach(cb => {
            try { cb(erreur); } catch (e) { /* un observateur ne casse pas l'appel */ }
        });
        return erreur;
    }

    /* =====================================================================
       POINTS D'ENTRÉE
       Un par route de `backend/src/api/index.ts`. Aucun autre chemin réseau.
    ===================================================================== */

    // Qui suis-je, dans quelle filiale. Remplace toute notion de périmètre
    // conservée par le navigateur (contrôle S2).
    function session() { return appeler("/session"); }

    /* ── CONNEXION ET DÉCONNEXION (lot L3) ───────────────────────────────────
     *
     * ⚠️ Chemins, noms de champs et codes viennent tous de `CONTRAT_AUTH` :
     * aucune chaîne n'est écrite ici. Voir l'entête de cette constante.
     *
     * Deux propriétés tenues par la forme :
     *
     *  · **le périmètre ne part toujours pas d'ici.** `connexion()` n'accepte ni
     *    filiale, ni profil, ni domaine : deux chaînes, et rien d'autre. Le
     *    serveur résout le périmètre depuis les groupes AD, comme
     *    `resoudre()` le fait déjà sans argument (contrôle S2). Ajouter un
     *    troisième paramètre à cette fonction serait le premier chemin par
     *    lequel un navigateur choisirait son périmètre : il faudrait alors le
     *    refuser, pas l'écrire.
     *  · **le mot de passe ne transite par aucun autre chemin.** Il n'est ni
     *    conservé, ni journalisé, ni relu : il entre en paramètre, part dans le
     *    corps, et la fonction rend la main.
     */
    function connexion(identifiant, motDePasse) {
        const corps = {};
        corps[CONTRAT_AUTH.champIdentifiant] = identifiant;
        corps[CONTRAT_AUTH.champMotDePasse] = motDePasse;
        // `sansSignalement` : un 401 rendu ICI veut dire « ces identifiants-là
        // sont refusés », pas « votre session a expiré ». Prévenir les
        // observateurs empilerait un écran de reconnexion sur l'écran de
        // connexion.
        return appeler(CONTRAT_AUTH.cheminConnexion,
            { methode: "POST", corps: corps, sansSignalement: true });
    }

    /**
     * Ferme la session. `DELETE` sur le MÊME chemin que la connexion (§26.2) :
     * une session est une ressource, on la crée et on la supprime.
     *
     * Rend `null` : la réponse est un 204 sans corps.
     */
    function deconnexion() {
        return appeler(CONTRAT_AUTH.cheminConnexion,
            { methode: "DELETE", sansSignalement: true });
    }

    /**
     * S'abonne au FAIT « il n'y a pas (ou plus) de session ».
     *
     * Rappelé avec l'`ErreurApi` du 401. L'abonné décide du geste — cette
     * couche n'en nomme aucun (voir `FAIT_SESSION_ABSENTE`).
     */
    function surAuthentificationRequise(cb) {
        if (typeof cb === "function") observateursAuth.push(cb);
    }

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
        CONTRAT_AUTH,
        session, modele, donnees, rafraichir,
        connexion, deconnexion, surAuthentificationRequise,
        creer, modifier, supprimer, propagerMesure, reprendre
    };
})();

window.Api = Api;
