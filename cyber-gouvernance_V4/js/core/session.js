// Emplacement : js/core/session.js
// Nom du fichier : session.js
//
// Périmètre de la session, **tel que le serveur le résout** (PLAN_SERVEUR §2.4,
// contrôle S2 de la grille de sécurité).
//
// ── La propriété que ce fichier tient ────────────────────────────────────────
//
//   > Le périmètre vient du serveur. Le navigateur ne le choisit pas, ne le
//   > mémorise pas, et ne le transmet pas.
//
// Elle est tenue par la forme : il n'existe **aucun mutateur**. `charger()` lit
// `/api/session` et rien d'autre ne peut écrire dans l'objet rendu (il est gelé).
// Un futur sélecteur de filiale (lot L4) changera la filiale ACTIVE côté serveur,
// puis rechargera cette session — jamais l'inverse.
//
// ── Nettoyage des restes de la version 100 % navigateur ──────────────────────
//
// L'ancienne application conservait dans `localStorage` une clé `cyber-context`
// (« Périmètre Actif » de la barre latérale) et une clé `cyber-vault` (coffre de
// chiffrement au repos). Ni l'une ni l'autre n'a de sens dans l'édition Groupe :
// le périmètre vient d'ici, et le chiffrement au repos est celui du disque de la
// VM (§1.9). `purgerRestesNavigateur()` les efface au démarrage.
//
// La réserve qui accompagnait ces lignes est **levée**, et son texte était
// devenu faux (constat Q-12, même motif que l'entête de `js/core/vault.js`) : il
// annonçait que six fichiers lisaient encore `cyber-context` pour en tirer un
// filtre « donneur d'ordre ». Ils ne le lisent plus. Ce filtre — un confort
// d'affichage, jamais un périmètre de sécurité — vit désormais **en mémoire**,
// dans `window.FiltreDonneurOrdre` (`js/app.js`), et disparaît donc avec
// l'onglet. Plus aucun fichier de la SPA ne lit ni n'écrit `cyber-context`.
//
// La purge reste, et le double filet ci-dessous aussi. Ce n'est pas un reliquat :
// elle vise les postes qui ont fait tourner la version 100 % navigateur, où la
// clé est encore écrite sur le disque. Elle disparaîtra le jour où plus aucun
// poste n'aura connu cette version — c'est-à-dire pas dans ce lot.

const Session = (() => {
    "use strict";

    // Clés de l'ancienne application locale. Aucune ne doit persister.
    const CLES_OBSOLETES = [
        "cyber-context",              // « périmètre » choisi dans le navigateur
        "cyber-vault",                // coffre de chiffrement au repos (§1.9)
        "cyber-current",              // instantané de repli des données
        "cyber-gouvernance-data",     // miroir en clair de la base
        "cyber-audits",               // reliquats de la migration v1
        "cyber-revues"
    ];

    let etat = null;    // dernier périmètre résolu par le serveur (gelé)

    let purgeInstallee = false;

    function purger() {
        CLES_OBSOLETES.forEach(cle => {
            try { localStorage.removeItem(cle); } catch (e) { /* stockage indisponible : rien à purger */ }
        });
    }

    function purgerRestesNavigateur() {
        purger();
        // La purge est rejouée à la FERMETURE, et pas seulement au démarrage.
        // Ce second passage ne vise plus un écrivain de l'application — il n'y
        // en a plus — mais tout ce qui pourrait réécrire ces clés pendant la
        // session sans que ce fichier le sache : une extension de navigateur, un
        // onglet resté ouvert sur une version ancienne servie par le cache, un
        // module non encore converti. La propriété tenue est celle-ci, et elle
        // ne dépend d'aucune énumération : **rien de ce qui ressemble à un
        // périmètre ne survit d'une session à l'autre** dans le navigateur.
        // Le périmètre réel, lui, ne transite jamais par là : il est résolu par
        // `/api/session` et n'a aucun mutateur ici (contrôle S2).
        if (!purgeInstallee) {
            purgeInstallee = true;
            try {
                window.addEventListener("pagehide", purger);
                window.addEventListener("beforeunload", purger);
            } catch (e) { /* environnement sans fenêtre */ }
        }
    }

    // Interroge le serveur. Aucune donnée n'est transmise : la signature n'a pas
    // de paramètre, et c'est le contrat (contrôle S2).
    async function charger() {
        const brut = await Api.session();
        return adopter(brut);
    }

    /**
     * Adopte une réponse de session, d'où qu'elle vienne.
     *
     * Deux appelants : `charger()` (au démarrage) et `Vault` après une
     * connexion réussie — le contrat suppose que la connexion rend **le même
     * objet** que `api/session` (voir `Api.CONTRAT_AUTH`). Un seul endroit
     * construit l'état : deux constructions finiraient par diverger sur un
     * champ, et c'est exactement le genre d'écart qui ne se voit pas.
     */
    function adopter(brut) {
        const source = brut || {};
        const filiale = source.filiale_active || {};
        const droitsBruts = source[Api.CONTRAT_AUTH.champDroits];
        const identiteBrute = source[Api.CONTRAT_AUTH.champIdentite];
        etat = Object.freeze({
            utilisateur: source.utilisateur || "",
            filialeId: filiale.id || "",
            filialeCode: filiale.code || "",
            filialeNom: filiale.raison_sociale || "",
            /* ── LA LANGUE PAR DÉFAUT DE LA FILIALE — lot L10, §37.4 ─────────
             *
             * `filiales.langue_defaut` existe en base depuis `001_socle.sql` et
             * n'est lue par personne. Le §37.4 la désigne comme la valeur par
             * défaut de l'interface, « et elle arrive dans `filiale_active` de
             * la charte de session ».
             *
             * ⚠️ **Elle n'y est PAS ENCORE** : mesuré le 05/09/2026, le bloc que
             * construit `backend/src/api/index.ts` porte `id`, `code` et
             * `raison_sociale`, plus les coordonnées du lot L9 — pas la langue.
             * `backend/src/` appartient à un autre agent : la lecture ci-dessous
             * est donc **défensive et sans effet aujourd'hui**, et `js/i18n/`
             * retombe sur `fr`.
             *
             * C'est écrit plutôt que tu : une source silencieusement morte est
             * une source qu'on croit vivante. Le jour où le serveur joint le
             * champ, rien n'est à changer ici. */
            filialeLangue: filiale.langue_defaut || "",
            perimetreLecture: Object.freeze((source.perimetre_lecture || []).slice()),
            perimetreGroupe: !!source.perimetre_groupe,
            administrationGroupe: !!source.administration_groupe,
            provisoire: !!(source.authentification && source.authentification.provisoire),
            descriptionAuth: (source.authentification && source.authentification.description) || "",
            schemaVersion: source.schema_version || null,
            // ── LES DROITS, TELS QUE LE SERVEUR LES REND ────────────────────
            //
            // `null` quand le serveur n'en annonce aucun — ce qui est le cas
            // tant que le lot L3 n'est pas branché. Ce n'est PAS « aucun
            // droit » : c'est « le navigateur n'en sait rien ». La différence
            // décide de tout ce que fait `Droits` (voir plus bas).
            droits: figerDroits(droitsBruts),
            // Identité d'annuaire (nom affiché, service, fonction). Sert à
            // l'affichage, jamais à décider d'un droit.
            identite: figerIdentite(identiteBrute)
        });
        return etat;
    }

    function figerDroits(brut) {
        if (!brut || typeof brut !== "object") return null;
        const domaines = Array.isArray(brut.domaines) ? brut.domaines.filter(d => typeof d === "string") : [];
        // Niveau PAR DOMAINE, facultatif (`backend/src/api/droits.ts`) : il
        // permet d'exprimer « contribue aux audits, lit la conformité », qu'un
        // niveau unique ne sait pas dire. Absent, le niveau de session
        // s'applique partout — et un domaine qu'il ne nomme pas retombe sur ce
        // niveau, **jamais sur un accès plus large** : c'est la même règle que
        // côté serveur, et l'inverser rendrait l'écran plus permissif que lui.
        const niveaux = {};
        if (brut.niveaux && typeof brut.niveaux === "object") {
            Object.keys(brut.niveaux).forEach(d => {
                if (typeof brut.niveaux[d] === "string") niveaux[d] = brut.niveaux[d];
            });
        }
        return Object.freeze({
            niveau: typeof brut.niveau === "string" ? brut.niveau : "",
            domaines: Object.freeze(domaines.slice()),
            niveaux: Object.freeze(niveaux),
            // Le droit d'export est DISTINCT de la lecture (`PLAN_SERVEUR` §3.3).
            // Absent ⇒ faux : un droit d'extraction ne se déduit pas d'un silence.
            export: brut.export === true
        });
    }

    function figerIdentite(brut) {
        if (!brut || typeof brut !== "object") return null;
        return Object.freeze({
            login: brut.login || "",
            nomAffichage: brut.nomAffichage || brut.nom_affichage || "",
            email: brut.email || "",
            service: brut.service || "",
            fonction: brut.fonction || ""
        });
    }

    /** Oublie la session courante : appelé à la déconnexion. */
    function oublier() { etat = null; }

    function courante() { return etat; }
    function chargee() { return etat !== null; }

    // Libellé d'affichage de la filiale active (barre latérale, exports, entêtes
    // d'impression au lot L9). Rien ici ne décide d'un droit.
    function libelleFiliale() {
        if (!etat) return "";
        if (etat.filialeNom && etat.filialeCode) return etat.filialeNom + " (" + etat.filialeCode + ")";
        return etat.filialeNom || etat.filialeCode || etat.filialeId || "";
    }

    /** Libellé de l'utilisateur connecté (barre latérale, écran de session). */
    function libelleUtilisateur() {
        if (!etat) return "";
        if (etat.identite && etat.identite.nomAffichage) return etat.identite.nomAffichage;
        return etat.utilisateur || "";
    }

    return {
        charger, adopter, oublier, courante, chargee,
        libelleFiliale, libelleUtilisateur, purgerRestesNavigateur
    };
})();

window.Session = Session;

/* ═══════════════════════════════════════════════════════════════════════════
 *  DROITS — ce que le serveur autorise, tel que l'INTERFACE peut s'en servir
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ **L'INTERFACE N'EST PAS LA BARRIÈRE, ET CE FICHIER NE DOIT JAMAIS LE
 *  LAISSER CROIRE.** Ce que fait `Droits` est une **courtoisie** : ne pas
 *  proposer un geste qui sera refusé. La barrière est le serveur, qui refuse
 *  la requête — c'est `backend/src/api/droits.ts` qui décide, et lui seul.
 *  Tout ce qui est masqué ici reste refusé là-bas ; rien de ce qui est montré
 *  ici n'est pour autant autorisé.
 *
 *  ── LA RÈGLE QUI GOUVERNE TOUT LE FICHIER ───────────────────────────────
 *
 *  Trois états, et non deux :
 *
 *  | Ce que le serveur a dit | Ce que fait l'interface |
 *  |---|---|
 *  | **rien** (`droits` absent) | elle ne masque **rien** — elle n'en sait rien, et inventer une restriction serait mentir dans l'autre sens |
 *  | un domaine **listé** | elle le montre, et autorise l'écriture si le niveau le permet |
 *  | un domaine **absent de la liste** | elle le masque |
 *
 *  La première ligne est celle qui compte aujourd'hui : tant que le lot L3
 *  n'est pas branché, le serveur ne rend aucun bloc `droits`, et l'application
 *  se comporte **exactement comme avant**. Aucune régression n'est possible de
 *  ce côté, et c'est vérifiable : couper le bloc de la réponse doit rendre à
 *  l'écran tous ses boutons.
 *
 *  ── POURQUOI PAS « FERMÉ PAR DÉFAUT » ICI ───────────────────────────────
 *
 *  Parce que fermé par défaut, dans une couche qui n'est pas la barrière, ne
 *  protège rien et casse tout : un serveur muet rendrait l'application
 *  inutilisable sans qu'aucune donnée soit mieux gardée. Le fail-closed est du
 *  côté du serveur, où il a un sens — `PerimetreProvisoire` refuse de résoudre
 *  hors développement, et c'est là que la porte est.
 * ═══════════════════════════════════════════════════════════════════════════ */

const Droits = (() => {
    "use strict";

    // Rangs des niveaux, dans l'ordre de `Api.CONTRAT_AUTH.niveaux` — relevé
    // dans `backend/src/api/droits.ts`, jamais réécrit ici.
    function rang(niveau) {
        const i = Api.CONTRAT_AUTH.niveaux.indexOf(niveau);
        return i === -1 ? 0 : i + 1;
    }

    function bloc() {
        const s = Session.courante();
        return s ? s.droits : null;
    }

    /** Le serveur a-t-il annoncé des droits ? Sinon, on ne masque rien. */
    function connus() { return bloc() !== null; }

    function niveau() { const d = bloc(); return d ? d.niveau : ""; }

    /** Domaines ouverts, ou `null` quand le serveur n'a rien dit. */
    function domaines() { const d = bloc(); return d ? d.domaines : null; }

    /**
     * Le domaine est-il lisible ? Vrai quand les droits sont inconnus.
     * Un domaine vide ou nul est considéré lisible : c'est une vue qui n'a pas
     * été rattachée, et la masquer serait faire disparaître un écran sans que
     * personne ne l'ait décidé (voir `verifier`, qui le SIGNALE au lieu de le
     * masquer).
     */
    function peutLire(domaine) {
        const d = bloc();
        if (!d) return true;
        if (!domaine) return true;
        return d.domaines.indexOf(domaine) !== -1;
    }

    /**
     * Le domaine est-il modifiable ? Il faut à la fois le domaine et le niveau.
     *
     * Le seuil est « contribution », comme `NIVEAU_MINIMAL` côté serveur : un
     * profil *Direction* est en `lecture`, et n'écrit donc nulle part.
     */
    function peutEcrire(domaine) {
        const d = bloc();
        if (!d) return true;
        if (!peutLire(domaine)) return false;
        return rang(niveauEffectif(domaine)) >= rang("contribution");
    }

    /**
     * Niveau qui s'applique à un domaine : celui du domaine quand il est
     * nommé, celui de la session sinon. **Jamais le plus favorable des deux** —
     * un niveau par domaine sert à RESTREINDRE, et une lecture qui élargirait
     * rendrait l'écran plus permissif que le serveur, ce qui est la seule
     * erreur que cette couche puisse commettre qui ait des conséquences.
     */
    function niveauEffectif(domaine) {
        const d = bloc();
        if (!d) return "";
        if (domaine && d.niveaux && typeof d.niveaux[domaine] === "string") return d.niveaux[domaine];
        return d.niveau;
    }

    /**
     * Le profil peut-il administrer (paramètres, reprise d'un export entier) ?
     *
     * ⚠️ **Aucun appelant aujourd'hui, et c'est écrit plutôt que masqué** — le
     * constat Q-12 a été relevé trois fois dans ce chantier pour des
     * justifications ayant survécu à leur appelant. L'écran d'administration est
     * couvert autrement, et mieux : `peutLire("administration")` le retire du
     * menu, `peutEcrire("administration")` neutralise ses boutons. Cette
     * fonction reste parce que la **reprise d'un export** (`js/core/reprise.js`)
     * est un acte d'administration au sens du `PLAN_SERVEUR` §3.2 et de la
     * condition d'entrée E3, et qu'elle devra la consulter — pas parce qu'elle
     * sert déjà.
     */
    function peutAdministrer() {
        const d = bloc();
        if (!d) return true;
        return rang(niveauEffectif("administration")) >= rang("administration");
    }

    /**
     * Le profil peut-il EXTRAIRE des données de l'application ?
     *
     * `PLAN_SERVEUR` §3.3 : « un utilisateur disposant d'un accès Groupe en
     * lecture peut extraire, en un clic, la cartographie complète des faiblesses
     * du groupe ». L'export est donc une permission à part entière, jamais
     * déduite de la lecture ni du niveau.
     */
    function peutExporter() {
        const d = bloc();
        if (!d) return true;
        return d.export === true;
    }

    /**
     * Entonnoir unique de tout ce qui SORT de l'application.
     *
     * `PLAN_SERVEUR` §3.3 : l'export est journalisé systématiquement côté
     * serveur. Ce qui se joue ici est l'autre moitié — ne pas laisser
     * quelqu'un fabriquer un fichier complet de gouvernance depuis un écran qui
     * ne lui a rien interdit. Toutes les extractions du produit (fichier
     * d'échange `grc-backup`, classeurs Excel, PDF d'audit, images de la matrice
     * et de la cartographie, agenda `.ics`) passent par ce seul point : c'est ce
     * qui rend le contrôle vérifiable d'un coup d'œil.
     *
     * ⚠️ Ceci **n'est pas la barrière** : un export composé à partir de données
     * déjà en mémoire ne peut pas être empêché par le navigateur — la vraie
     * barrière est le droit de LIRE ces données, tenu par le serveur. Ce que
     * cette fonction empêche est l'extraction en un clic par quelqu'un qui n'y a
     * pas droit, ce qui est précisément le geste que le §3.3 vise.
     *
     * @returns {boolean} vrai si l'appelant peut poursuivre
     */
    function exigerExport() {
        if (peutExporter()) return true;
        if (window.showToast) {
            // Contexte texte (bandeau `showToast`) : `t`, jamais `tHtml`.
            window.showToast(t("bandeau.exportRefuse"), "error");
        }
        return false;
    }

    /** Le profil est-il en lecture seule sur TOUT ? (profil *Direction*, *Auditeur*) */
    function lectureSeule() {
        const d = bloc();
        if (!d) return false;
        // Lecture seule PARTOUT : le niveau de session ne suffit pas, un
        // domaine peut le relever. On refuse donc l'écriture globale seulement
        // si AUCUN domaine ouvert n'atteint « contribution » — sinon le filet de
        // la façade bloquerait une saisie que le serveur accepterait.
        if (rang(d.niveau) >= rang("contribution")) return false;
        return !d.domaines.some(dom => rang(niveauEffectif(dom)) >= rang("contribution"));
    }

    /**
     * Ce que le serveur annonce et que la SPA ne sait pas placer.
     *
     * ── Pourquoi ce contrôle existe ─────────────────────────────────────────
     *
     * Le rattachement d'une route à un domaine est une **liste écrite à la
     * main** (`js/app.js`, `DOMAINE_PAR_ROUTE`) : aucun catalogue ne porte
     * l'information « l'écran Correspondances relève de la conformité ». Le
     * `CLAUDE.md` §3 tolère une telle liste à une condition — que son
     * incomplétude **échoue bruyamment** au lieu de réussir en silence.
     *
     * C'est ce que fait cette fonction : elle compare les domaines que le
     * serveur annonce à ceux que la SPA connaît, dans les deux sens, et rend
     * les écarts. `js/app.js` les affiche. Un domaine ajouté côté serveur sans
     * écran, ou un écran sans domaine, se voit donc **le jour où il apparaît**,
     * et non le jour où quelqu'un s'aperçoit qu'un menu manque.
     *
     * @param {string[]} domainesConnusDeLaSpa domaines cités par la table des routes
     * @returns {{inconnusDeLaSpa: string[], inconnusDuServeur: string[]}}
     */
    function verifier(domainesConnusDeLaSpa) {
        const declares = Api.CONTRAT_AUTH.domaines;
        const cites = Array.isArray(domainesConnusDeLaSpa) ? domainesConnusDeLaSpa : [];
        return {
            // Le serveur annonce un domaine dont aucun écran ne parle.
            inconnusDeLaSpa: declares.filter(d => cites.indexOf(d) === -1),
            // Un écran cite un domaine que le serveur ne connaît pas : faute de
            // frappe, ou décalage avec `backend/src/api/droits.ts`.
            inconnusDuServeur: cites.filter(d => declares.indexOf(d) === -1)
        };
    }

    return {
        connus, niveau, niveauEffectif, domaines,
        peutLire, peutEcrire, peutAdministrer, peutExporter, exigerExport, lectureSeule,
        verifier
    };
})();

window.Droits = Droits;
