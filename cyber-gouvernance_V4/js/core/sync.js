// Emplacement : js/core/sync.js
// Nom du fichier : sync.js
//
// ═══════════════════════════════════════════════════════════════════════════
//  Bascule de la persistance — le cœur du lot L2 côté navigateur
// ═══════════════════════════════════════════════════════════════════════════
//
// `PLAN_SERVEUR` §1.3 : **la façade synchrone de `DataStore` est préservée**.
// Les ~330 appels répartis sur 125 méthodes ne changent pas de signature, et
// aucun des 26 modules métier n'est réécrit (c'est la parade au risque P3).
// Ce fichier est l'endroit — le seul — où l'asynchrone est absorbé, exactement
// comme `flushNow()` absorbait IndexedDB auparavant.
//
// Trois mouvements, et rien d'autre :
//
//   1. **Au démarrage**, `demarrer()` lit `/api/session`, `/api/modele` et
//      `/api/donnees`. L'objet `data` que reçoit `DataStore` est celui du
//      serveur, dans sa forme exacte.
//   2. **À chaque `save()`**, `marquerModification()` réveille un cycle
//      d'écriture qui compare l'état en mémoire à l'**instantané de référence**
//      (ce que le serveur détient, à notre connaissance) et n'envoie que la
//      différence : une création, une modification ou une suppression **par
//      enregistrement**. C'est l'écriture ciblée du §1.3, obtenue sans changer
//      la signature de `save()`, qui ne dit pas ce qui a bougé.
//   3. **Un sondage périodique** rapatrie le travail des autres utilisateurs.
//
// ═══════════════════════════════════════════════════════════════════════════
//  Le verrouillage optimiste, et pourquoi il est visible
// ═══════════════════════════════════════════════════════════════════════════
//
// Le risque projet **P1** est l'écrasement silencieux. La parade du §1.4 tient
// en deux temps : le serveur refuse une écriture dont la version est périmée
// (`GRC03`), et **l'interface doit le dire**. Un refus qu'on avale en silence
// laisse l'utilisateur croire que sa saisie est enregistrée : ce serait le même
// défaut, déplacé d'un cran.
//
// D'où la règle tenue ici : **une écriture refusée produit toujours quelque
// chose de visible**, et la nature du refus décide de la suite.
//
// | Refus du serveur | Ce que devient la mémoire | Ce que voit l'utilisateur |
// |---|---|---|
// | `conflit_version` (GRC03) | conservée, marquée, plus réécrite | « Modifié entre-temps » + **Recharger** |
// | `ressource_inconnue` (404) | conservée, marquée | « Supprimé entre-temps » + **Recharger** |
// | `hors_perimetre` (403) | **remise à la valeur du serveur** | « Écriture refusée » — **aucun rechargement proposé** : c'est un refus de droit, il n'y a rien à recharger |
// | `donnee_invalide`, contrainte | conservée, marquée | le message du serveur, pour corriger |
// | réseau, 503 | conservée, **non marquée** | « non enregistré » + nouvel essai automatique |
//
// « Marquée » veut dire : l'enregistrement entre dans la liste des blocages,
// n'est plus réécrit tant qu'il n'a pas été rechargé, et son échec reste affiché.
// Le bandeau ne s'efface jamais tout seul.
//
// ═══════════════════════════════════════════════════════════════════════════
//  Ce que ce fichier ne fait pas
// ═══════════════════════════════════════════════════════════════════════════
//
//  · Aucun droit n'est vérifié ici : ils le sont côté serveur, à chaque requête
//    (§1.9). L'interface ne masque rien qu'elle prétendrait interdire.
//  · Aucun périmètre n'est choisi ni transmis : voir `session.js` (contrôle S2).
//  · Aucun échappement n'est relâché : tout texte injecté dans un bandeau passe
//    par `escapeHtml` (acquis du chantier 9, contrôle S10).

const Sync = (() => {
    "use strict";

    /* =====================================================================
       RÉGLAGES
    ===================================================================== */

    const DEBOUNCE_MS = 400;            // regroupe les `save()` rapprochés d'une même saisie
    const SONDAGE_MS = 20000;           // rythme du rafraîchissement (§1.3 : un sondage suffit)
    const RELANCE_RESEAU_MS = 8000;     // nouvel essai après une panne passagère

    /**
     * Recouvrement du sondage — constat M-7 de la porte S2.
     *
     * L'horodatage rendu au client est pris **après** la lecture ; un écrivain
     * concurrent estampille `modifie_le` à l'**ouverture** de sa transaction,
     * donc avant, et valide après. Le sondage suivant demande « ce qui a changé
     * depuis » et ne voit rien ; les volumes n'ayant pas bougé, le filet de
     * l'écart de volume ne se déclenche pas davantage. La modification est
     * perdue pour ce client — durablement, puisque plus rien ne la redemandera.
     *
     * Le client redemande donc une fenêtre légèrement antérieure. Le surcoût est
     * nul en pratique (un enregistrement déjà connu est reconnu identique à sa
     * référence et ignoré), et la marge couvre largement la durée d'une
     * transaction d'écriture, bornée à 15 s côté serveur.
     *
     * ⚠️ Ce n'est qu'un filet. Le remède exact — prendre l'horodatage au DÉBUT
     * de la transaction de lecture, ou passer à une séquence monotone — est
     * côté serveur ; une transaction plus longue que la marge repasserait au
     * travers.
     */
    const RECOUVREMENT_SONDAGE_MS = 30000;

    /* =====================================================================
       ÉTAT
    ===================================================================== */

    let source = null;          // accès à `data` fourni par le DataStore (voir brancher)
    let collections = [];       // ARRAY_FIELDS, dans l'ordre du modèle serveur
    let modele = null;          // description des champs acceptés, par entité

    // Instantané de référence : ce que le serveur détient, à notre connaissance.
    //   reference[collection] = Map(id -> texte canonique de l'enregistrement)
    //   valeurs[collection]   = Map(id -> copie profonde de l'enregistrement)
    //   versions[collection]  = Map(id -> { v, vmo })
    let reference = {};
    let valeurs = {};
    let versions = {};

    let horodatageServeur = null;   // base du prochain sondage (ISO, rendu par le serveur)
    let jeuInitial = null;          // charge utile de `/api/donnees`, en attente d'adoption

    let minuteurEcriture = null;
    let minuteurRelance = null;      // nouvel essai après une panne passagère
    let chaine = Promise.resolve();  // sérialise les cycles d'écriture
    let ecritureEnCours = false;
    let minuteurSondage = null;

    const bloques = new Set();          // "collection:id" qu'on ne réécrit plus
    const incidents = [];               // échecs à afficher (jamais effacés tout seuls)
    const champsRefuses = new Set();    // "collection.champ" que le modèle serveur ignore
    const propagations = new Map();     // mesureId -> Set(evaluationId) à propager côté serveur
    const derives = new Set();          // "collection:id" recalculables, jamais saisis

    // Le lot L2 a d'abord accepté un identifiant proposé par le client ; la porte
    // S2 (constat M-3) en a fait un oracle d'existence inter-filiales, et le
    // serveur le refuse désormais. Le client s'adapte au contrat qu'il trouve :
    // il propose, et si on lui refuse, il adopte l'identifiant rendu — et ne
    // repropose plus rien de la session.
    let identifiantImposeParLeServeur = false;
    let bandeauReduit = false;       // la croix réduit le détail, elle n'éteint rien
    let panneReseau = false;
    let dernierEnregistrement = 0;
    let observateursEtat = [];

    /* =====================================================================
       OUTILS
    ===================================================================== */

    function esc(v) {
        if (window.escapeHtml) return window.escapeHtml(v);
        return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[c]));
    }

    function copie(o) { return JSON.parse(JSON.stringify(o)); }

    // Texte canonique d'un enregistrement : clés triées, pour qu'un module qui
    // reconstruit un objet dans un autre ordre ne passe pas pour une modification.
    function canonique(valeur) {
        if (valeur === null || typeof valeur !== "object") return JSON.stringify(valeur === undefined ? null : valeur);
        if (Array.isArray(valeur)) return "[" + valeur.map(canonique).join(",") + "]";
        const cles = Object.keys(valeur).filter(k => valeur[k] !== undefined).sort();
        return "{" + cles.map(k => JSON.stringify(k) + ":" + canonique(valeur[k])).join(",") + "}";
    }

    function donnees() { return source ? source.lire() : null; }

    function cle(collection, id) { return collection + ":" + id; }

    /* =====================================================================
       BRANCHEMENT SUR LE DATASTORE
       Le DataStore reste propriétaire de `data` : il prête un accès en lecture
       et un moyen de le remplacer lors d'un rechargement complet.
    ===================================================================== */
    function brancher(acces) {
        source = acces;
        collections = acces.collections.slice();
        // Le magasin détient désormais les données : garder la charge utile du
        // démarrage en ferait une seconde copie, périmée dès la première
        // écriture. On la relâche.
        jeuInitial = null;
    }

    /* =====================================================================
       DÉMARRAGE — session, modèle, jeu de données
    ===================================================================== */

    async function demarrer() {
        Session.purgerRestesNavigateur();
        await Session.charger();
        modele = await Api.modele();
        const charge = await Api.donnees();
        jeuInitial = charge;
        horodatageServeur = charge.horodatage;
        return charge;
    }

    // Le DataStore récupère ici la charge utile chargée par `demarrer()`.
    // `null` si le démarrage n'a pas eu lieu : l'appelant doit alors le lancer.
    function jeuDeDonnees() { return jeuInitial; }

    /* =====================================================================
       INSTANTANÉ DE RÉFÉRENCE
       Les versions vivent DANS CE FICHIER, pas dans les enregistrements : `data`
       garde exactement la forme que les modules et l'export `grc-backup`
       connaissent. Un module qui reconstruit un objet ne peut donc pas perdre
       la version au passage — ce serait une porte ouverte au risque P1.
    ===================================================================== */

    function extraireVersions(enregistrement) {
        const v = { v: null, vmo: null };
        if (enregistrement && typeof enregistrement === "object") {
            if (typeof enregistrement._version === "number") v.v = enregistrement._version;
            if (typeof enregistrement._versionMiseEnOeuvre === "number") v.vmo = enregistrement._versionMiseEnOeuvre;
            delete enregistrement._version;
            delete enregistrement._versionMiseEnOeuvre;
        }
        return v;
    }

    // Prépare un jeu complet reçu du serveur : retire les champs structurels des
    // enregistrements, mémorise les versions, et pose l'instantané de référence.
    function adopterJeu(data) {
        reference = {}; valeurs = {}; versions = {};
        collections.forEach(c => {
            reference[c] = new Map();
            valeurs[c] = new Map();
            versions[c] = new Map();
            const liste = Array.isArray(data[c]) ? data[c] : [];
            liste.forEach(enr => {
                if (!enr || !enr.id) return;
                versions[c].set(enr.id, extraireVersions(enr));
                reference[c].set(enr.id, canonique(enr));
                valeurs[c].set(enr.id, copie(enr));
            });
        });
        bloques.clear();
        dernierEnregistrement = Date.now();
    }

    // Aligne l'instantané de référence d'un seul enregistrement, après écriture.
    function alignerReference(collection, id, enregistrement) {
        reference[collection].set(id, canonique(enregistrement));
        valeurs[collection].set(id, copie(enregistrement));
    }

    function oublierReference(collection, id) {
        reference[collection].delete(id);
        valeurs[collection].delete(id);
        versions[collection].delete(id);
    }

    /* =====================================================================
       CHAMPS ENVOYÉS
       Le serveur REFUSE un champ qu'il ne connaît pas — et il a raison : une
       donnée saisie qui disparaît sans un mot est pire qu'un refus. Le filtre
       ci-dessous évite qu'un champ résiduel bloque toutes les écritures, mais
       il ne se tait pas : chaque champ écarté est mémorisé et affiché.
    ===================================================================== */

    function champsAcceptes(collection) {
        const e = modele && modele.entites && modele.entites[collection];
        if (!e) return null;
        if (!e._acceptes) {
            const set = new Set(Object.keys(e.champs || {}));
            (e.liaisons || []).forEach(l => set.add(l.champ));
            e._acceptes = set;
        }
        return e._acceptes;
    }

    /**
     * Le « non renseigné » du navigateur est la **chaîne vide** ; celui du schéma
     * est `NULL`. Les deux conventions ne se rencontrent jamais, et le résultat
     * est un refus de l'enregistrement entier (constat M-8 de la porte S2).
     *
     * Ce qui se règle ICI, sans ambiguïté et sans rien perdre : une chaîne vide
     * dans un champ **qui n'est pas du texte** — une date, un nombre, un entier,
     * un booléen, un horodatage, un document JSON — ne peut rien vouloir dire
     * d'autre que « non renseigné ». Deux gestes, deux traitements, et la
     * différence n'est pas cosmétique :
     *
     *  · à la **création**, le champ est **omis** : la base applique sa valeur
     *    par défaut, qui est précisément ce que « non renseigné » veut dire pour
     *    elle. Envoyer `null` serait refusé sur une colonne non nulle à défaut
     *    (`mco_actions.avancement`, `scenarios_pra.etapes_pca`, `mappings.masque`) ;
     *  · à la **modification**, il part en `null` : c'est ainsi qu'on VIDE une
     *    date déjà saisie. Si la colonne refuse le vide, le serveur le dit et le
     *    bandeau le montre — plutôt que d'omettre le champ en silence et de
     *    laisser l'écran afficher un vide que la base ne contient pas.
     *
     * Ce qui NE se règle pas ici, et qu'il faut dire : les colonnes **texte
     * énumérées** (`prestataires.criticite`, `traitements.base_legale`,
     * `documents.type`…) refusent aussi la chaîne vide, et de l'extérieur rien ne
     * les distingue d'un champ de texte libre où `''` est une valeur légitime que
     * le serveur conserve à dessein. Convertir tout le texte en `null` détruirait
     * cette distinction au passage. L'arbitrage appartient au schéma et à l'API :
     * admettre `''` dans les `check`, ou convertir côté serveur là où il sait
     * qu'une colonne est énumérée.
     */
    function familleDuChamp(collection, champ) {
        const e = modele && modele.entites && modele.entites[collection];
        const c = e && e.champs && e.champs[champ];
        return c ? c.type : null;
    }

    // Rend `undefined` quand le champ doit être OMIS du corps.
    function valeurPourLeServeur(collection, champ, valeur, creation) {
        if (valeur !== "") return valeur;
        const famille = familleDuChamp(collection, champ);
        if (famille === null || famille === "texte") return valeur;
        return creation ? undefined : null;
    }

    function corpsDe(collection, enregistrement, creation) {
        const acceptes = champsAcceptes(collection);
        const champs = {};
        Object.keys(enregistrement).forEach(k => {
            if (k === "id" || k === "updatedAt" || k === "_version" || k === "_versionMiseEnOeuvre") return;
            if (enregistrement[k] === undefined) return;
            if (acceptes && !acceptes.has(k)) { champsRefuses.add(collection + "." + k); return; }
            const valeur = valeurPourLeServeur(collection, k, enregistrement[k], creation === true);
            if (valeur !== undefined) champs[k] = valeur;
        });
        return champs;
    }

    /**
     * ÉCRITURE CIBLÉE : le corps d'une MODIFICATION ne porte que les champs qui
     * ont réellement changé.
     *
     * ── Pourquoi (constat M-1 de la porte S2) ────────────────────────────────
     *
     * L'API a une sémantique **partielle** : « seuls les champs présents sont
     * écrits ». Envoyer l'enregistrement entier était donc sans effet visible…
     * sauf sur l'entité SCINDÉE `mesures`. Le serveur traite avec soin le cas
     * qu'il nomme lui-même « le cas NOMINAL d'une filiale qui évalue un contrôle
     * du socle Groupe » : si aucun champ de la table principale ne change, il ne
     * touche pas `mesure_catalogue` et se contente d'un contrôle de version en
     * lecture. Mais tant que le client renvoyait `nom` et `description`
     * inchangés, cette branche était **inatteignable** : l'`update` sur la ligne
     * de portée Groupe partait, la RLS le refusait, et la filiale recevait un
     * 403. Le pivot était inopérant là où il a été inventé.
     *
     * Envoyer la différence n'est donc pas une optimisation : c'est ce qui rend
     * la scission `mesure_catalogue` / `mesure_mise_en_oeuvre` utilisable, et
     * donc les vingt filiales comparables (`PLAN_SERVEUR` §2.2).
     *
     * ── Ce que la différence ne fait PAS ─────────────────────────────────────
     *
     * Un champ **disparu** de l'enregistrement n'est pas envoyé à `null` : le
     * comportement est le même qu'avant la bascule (un champ absent n'était déjà
     * pas transmis), et deviner qu'une clé absente vaut « efface-moi » ferait
     * échouer toute colonne non nulle. Aucun module ne supprime de clé : ils
     * posent `null` ou `""` explicitement, et cela part bien.
     */
    function corpsModifieDe(collection, id, enregistrement) {
        const complet = corpsDe(collection, enregistrement);
        const connu = valeurs[collection].get(id);
        if (!connu) return complet;      // valeur de référence perdue : on renvoie tout
        const partiel = {};
        Object.keys(complet).forEach(k => {
            if (canonique(complet[k]) !== canonique(connu[k])) partiel[k] = complet[k];
        });
        return partiel;
    }

    /* =====================================================================
       ADOPTION DE L'IDENTIFIANT RENDU PAR LE SERVEUR
    ===================================================================== */

    /**
     * Le serveur peut imposer son propre identifiant à la création. Le modèle
     * navigateur, lui, porte ses clés étrangères **en texte** dans les
     * enregistrements (`action.risque_id`, `evaluation.mesure_ids[]`,
     * `actif.dependances[].to`, `mapping.refs`…). Adopter un identifiant sans
     * réécrire ces références laisserait des liens pointant dans le vide — la
     * classe de défaut que le passage en base était censé rendre impossible.
     *
     * Le remplacement est donc fait **partout**, par parcours des valeurs, sans
     * liste de champs écrite à la main : la même mécanique que le tri des
     * créations, et pour la même raison — une liste écrite à la main est une
     * omission qui attend.
     */
    function renommer(collection, ancien, nouveau) {
        if (!ancien || !nouveau || ancien === nouveau) return;
        const data = donnees();
        if (!data) return;

        const enr = (data[collection] || []).find(x => x && x.id === ancien);
        if (enr) enr.id = nouveau;

        // Références portées par les autres enregistrements, tous niveaux.
        const remplacer = (objet) => {
            Object.keys(objet).forEach(k => {
                const v = objet[k];
                if (typeof v === "string") { if (v === ancien && k !== "id") objet[k] = nouveau; return; }
                if (Array.isArray(v)) {
                    for (let i = 0; i < v.length; i++) {
                        if (typeof v[i] === "string") { if (v[i] === ancien) v[i] = nouveau; }
                        else if (v[i] && typeof v[i] === "object") remplacer(v[i]);
                    }
                    return;
                }
                if (v && typeof v === "object") remplacer(v);
            });
        };
        collections.forEach(c => (data[c] || []).forEach(x => { if (x && typeof x === "object") remplacer(x); }));

        // Instantané de référence, versions, blocages, dérivés, propagations.
        [reference, valeurs, versions].forEach(carte => {
            const m = carte[collection];
            if (m && m.has(ancien)) { m.set(nouveau, m.get(ancien)); m.delete(ancien); }
        });
        [bloques, derives].forEach(set => {
            if (set.has(cle(collection, ancien))) { set.delete(cle(collection, ancien)); set.add(cle(collection, nouveau)); }
        });
        if (propagations.has(ancien)) { propagations.set(nouveau, propagations.get(ancien)); propagations.delete(ancien); }
        propagations.forEach(ids => { if (ids.has(ancien)) { ids.delete(ancien); ids.add(nouveau); } });

        // Une fiche ouverte pointait peut-être l'ancien identifiant : sans cela,
        // l'écran deviendrait « Page introuvable » au prochain rafraîchissement.
        try {
            if (location.hash.indexOf(ancien) !== -1) {
                history.replaceState(null, "", location.hash.split(ancien).join(nouveau));
            }
        } catch (e) { /* pas de fenêtre : rien à recaler */ }
    }

    /**
     * Crée en proposant l'identifiant local, et se replie sur un identifiant
     * imposé par le serveur si celui-ci refuse la proposition. Le repli n'a lieu
     * qu'une fois par session : ensuite, plus rien n'est proposé.
     */
    async function creerAdaptatif(collection, id, champs) {
        if (!identifiantImposeParLeServeur) {
            try {
                return await Api.creer(collection, id, champs);
            } catch (e) {
                const refusDeForme = e instanceof Api.ErreurApi && e.statut === 400;
                if (!refusDeForme) throw e;
                const reponse = await Api.creer(collection, null, champs);
                identifiantImposeParLeServeur = true;
                console.info("Le serveur impose ses identifiants : les identifiants locaux sont adoptés à la création.");
                return reponse;
            }
        }
        return await Api.creer(collection, null, champs);
    }

    /* =====================================================================
       DIFFÉRENTIEL
    ===================================================================== */

    function calculerDifferentiel() {
        const data = donnees();
        const creations = [], modifications = [], suppressions = [];
        if (!data) return { creations, modifications, suppressions };

        // Les évaluations que la propagation va réécrire côté serveur ne sont
        // pas poussées une par une : l'opération composite est transactionnelle
        // (contrôle S14), et la pousser deux fois n'ajouterait rien.
        const differees = new Set();
        propagations.forEach(ids => ids.forEach(id => differees.add(id)));

        // ⚠️ Un enregistrement BLOQUÉ (conflit non résolu) est classé comme les
        //    autres, avec un drapeau. Il n'est pas ESCAMOTÉ du différentiel.
        //    C'était le cœur du constat B-2 : escamoté, il ne comptait plus dans
        //    « des modifications en attente ? », l'avertissement de fermeture se
        //    taisait et l'écran affirmait que tout était enregistré. Le blocage
        //    s'applique désormais à un seul endroit : au moment d'écrire.
        collections.forEach(c => {
            const presents = new Set();
            const liste = Array.isArray(data[c]) ? data[c] : [];
            liste.forEach(enr => {
                if (!enr || !enr.id) return;
                presents.add(enr.id);
                const bloque = bloques.has(cle(c, enr.id));
                const texte = canonique(enr);
                if (!reference[c].has(enr.id)) {
                    creations.push({ collection: c, id: enr.id, enregistrement: enr, bloque: bloque });
                } else if (reference[c].get(enr.id) !== texte) {
                    if (c === "evaluations" && differees.has(enr.id)) return;
                    modifications.push({ collection: c, id: enr.id, enregistrement: enr, bloque: bloque });
                }
            });
            reference[c].forEach((_texte, id) => {
                if (!presents.has(id)) {
                    suppressions.push({ collection: c, id: id, bloque: bloques.has(cle(c, id)) });
                }
            });
        });

        return { creations, modifications, suppressions };
    }

    /**
     * Ordonne les créations d'un même cycle pour que ce qui est CITÉ soit écrit
     * avant ce qui cite.
     *
     * L'ordre des collections ne suffit pas : une évaluation de référentiel
     * précède les mesures dans le modèle, alors qu'elle les référence. Plutôt
     * qu'une table de dépendances écrite à la main, on lit les identifiants
     * réellement présents dans les enregistrements du lot — champ simple
     * (`risque_id`), tableau de liaison (`mesure_ids`) ou objet de liaison
     * (`dependances[].to`). Le tri reste donc juste si le modèle change.
     *
     * En cas de cycle (deux enregistrements qui se citent), on rend l'ordre
     * d'origine : le repassage de `ecrireParPasses` s'en charge.
     */
    function ordonnerCreations(creations) {
        if (creations.length < 2) return creations;
        const parId = new Map();
        creations.forEach(item => parId.set(item.id, item));

        const citees = (item) => {
            const trouvees = new Set();
            const visiter = (v) => {
                if (typeof v === "string") { if (parId.has(v) && v !== item.id) trouvees.add(v); return; }
                if (Array.isArray(v)) { v.forEach(visiter); return; }
                if (v && typeof v === "object") { Object.keys(v).forEach(k => visiter(v[k])); }
            };
            Object.keys(item.enregistrement).forEach(k => { if (k !== "id") visiter(item.enregistrement[k]); });
            return trouvees;
        };

        const restantes = new Map();
        creations.forEach(item => restantes.set(item.id, citees(item)));

        const ordonnees = [];
        let progres = true;
        while (restantes.size > 0 && progres) {
            progres = false;
            for (const item of creations) {
                if (!restantes.has(item.id)) continue;
                const attend = restantes.get(item.id);
                let pret = true;
                attend.forEach(id => { if (restantes.has(id)) pret = false; });
                if (!pret) continue;
                ordonnees.push(item);
                restantes.delete(item.id);
                progres = true;
            }
        }
        if (restantes.size > 0) creations.forEach(item => { if (restantes.has(item.id)) ordonnees.push(item); });
        return ordonnees;
    }

    // Vrai dès qu'une saisie n'est pas au serveur — **enregistrements bloqués
    // compris**. C'est ce que lit `beforeunload`, et ce que l'écran Paramètres
    // affiche : une saisie bloquée est une saisie non enregistrée, et le dire
    // autrement serait le mensonge que le constat B-2 a relevé.
    function aDesModificationsEnAttente() {
        const d = calculerDifferentiel();
        return d.creations.length > 0 || d.modifications.length > 0 ||
            d.suppressions.length > 0 || propagations.size > 0 || bloques.size > 0;
    }

    // Collections dont le NOMBRE d'enregistrements local diffère légitimement de
    // celui du serveur, parce qu'une création ou une suppression n'est pas encore
    // partie. Le sondage doit les écarter de son contrôle de volume, faute de
    // quoi il conclurait à une suppression distante et rechargerait en boucle.
    function collectionsAuVolumeIncertain() {
        const d = calculerDifferentiel();
        const set = new Set();
        d.creations.forEach(i => set.add(i.collection));
        d.suppressions.forEach(i => set.add(i.collection));
        return set;
    }

    /* =====================================================================
       ÉCRITURE
    ===================================================================== */

    function marquerModification() {
        if (!source) return;
        if (minuteurEcriture) clearTimeout(minuteurEcriture);
        minuteurEcriture = setTimeout(() => { minuteurEcriture = null; pousser(); }, DEBOUNCE_MS);
    }

    // Propagation « au plus défavorable » : le DataStore a déjà recalculé les
    // exigences en mémoire (pour que l'écran soit juste tout de suite) ; le
    // serveur refera le calcul dans UNE transaction, et c'est son résultat qui
    // fait foi.
    /**
     * Déclare un enregistrement **dérivé** : recalculé par l'application, jamais
     * saisi par l'utilisateur. Le point d'historique quotidien du tableau de bord
     * en est un.
     *
     * Constat m-5 : deux sessions ouvertes le même jour créent chacune le point
     * du jour, l'unicité de la date en refuse un, et l'utilisateur reçoit un
     * bandeau « 1 modification non enregistrée — Point d'historique » parfaitement
     * anodin. Quotidien, il apprend à le masquer d'un geste — et le geste appris
     * sur un faux positif finit par s'appliquer à un vrai conflit. Un refus sur
     * un enregistrement dérivé est donc **absorbé** : la copie locale est
     * abandonnée, le sondage rapportera celle du serveur, et rien n'est perdu
     * puisque rien n'a été saisi.
     */
    function marquerDerive(collection, id) { derives.add(cle(collection, id)); }

    function marquerPropagation(mesureId, evaluationIds) {
        if (!mesureId) return;
        const set = propagations.get(mesureId) || new Set();
        (evaluationIds || []).forEach(id => set.add(id));
        propagations.set(mesureId, set);
    }

    function pousser() {
        chaine = chaine.then(() => cycle()).catch(e => {
            console.error("Cycle d'écriture interrompu", e);
        });
        return chaine;
    }

    async function cycle() {
        if (!source || !modele) return { ok: false, raison: "non demarre" };
        if (minuteurEcriture) { clearTimeout(minuteurEcriture); minuteurEcriture = null; }

        const diff = calculerDifferentiel();
        const aEcrire = diff.creations.concat(diff.modifications, diff.suppressions)
            .filter(i => !i.bloque).length;
        if (aEcrire === 0 && propagations.size === 0) {
            // Il peut rester des enregistrements bloqués : le bandeau les dit,
            // et `aDesModificationsEnAttente()` les compte. Simplement, rien
            // n'est à envoyer tant qu'ils n'ont pas été rechargés.
            rendreBandeau();
            return { ok: true, vide: true };
        }

        ecritureEnCours = true;
        panneReseau = false;
        let echecs = 0;
        try {
            echecs = await appliquer(diff);
        } finally {
            // Un défaut de programmation ne doit pas laisser le drapeau levé :
            // ce serait éteindre définitivement écriture ET rafraîchissement,
            // silencieusement, ce que ce fichier existe précisément pour éviter.
            ecritureEnCours = false;
        }

        if (echecs === 0) dernierEnregistrement = Date.now();
        rendreBandeau();
        prevenirObservateurs();

        // Panne passagère : on retentera tout seul, sans rien perdre. Un seul
        // minuteur à la fois, sinon deux cycles en cascade en empileraient.
        if (panneReseau && !minuteurRelance) {
            minuteurRelance = setTimeout(() => { minuteurRelance = null; pousser(); }, RELANCE_RESEAU_MS);
        }

        return { ok: echecs === 0, echecs: echecs };
    }

    /** Le corps d'un cycle : créations, modifications, suppressions, composites. */
    async function appliquer(diff) {
        let echecs = 0;
        // Le seul endroit où un blocage a un effet : on n'écrit pas. Partout
        // ailleurs, l'enregistrement bloqué reste compté et reste visible.
        const actifs = (liste) => liste.filter(i => !i.bloque);

        // 1. Créations. L'ordre des collections place le plus souvent l'entité
        //    référencée avant celle qui la référence — mais pas toujours : une
        //    évaluation de référentiel précède les mesures qu'elle cite. Plutôt
        //    qu'une liste de dépendances écrite à la main — « une liste écrite à
        //    la main est une omission qui attend » —, l'ordre est déduit des
        //    identifiants réellement cités, et un repassage rattrape le reste.
        echecs += await ecrireParPasses(ordonnerCreations(actifs(diff.creations)), ecrireCreation);

        // 2. Modifications. Elles précèdent les suppressions à dessein : c'est
        //    ainsi qu'un délien (une évaluation qui lâche sa mesure, une action
        //    dont `mesure_id` passe à null) part AVANT la suppression de la
        //    mesure, dont les références sont en `restrict` côté schéma.
        for (const item of actifs(diff.modifications)) {
            if (!await ecrireModification(item)) echecs++;
        }

        // 3. Suppressions, dans l'ordre inverse : ce qui référence avant ce qui
        //    est référencé. Même repassage que pour les créations, et pour la
        //    même raison. Les cascades du schéma peuvent avoir déjà fait le
        //    travail — un 404 est alors un succès, pas un échec.
        echecs += await ecrireParPasses(actifs(diff.suppressions).reverse(), ecrireSuppression);

        // 4. Opérations composites, une fois l'état de leurs éléments à jour.
        for (const mesureId of Array.from(propagations.keys())) {
            if (!await executerPropagation(mesureId)) echecs++;
        }

        return echecs;
    }

    /**
     * Rejoue une liste d'écritures tant qu'au moins une avance.
     *
     * Un refus de MODÈLE (« cette mesure est inconnue ») peut n'être qu'un
     * problème d'ordre : l'enregistrement cité n'est pas encore créé. On le met
     * de côté et on repasse. Quand une passe n'apporte plus rien, ce n'est plus
     * une question d'ordre : la passe suivante est DÉFINITIVE et consigne les
     * échecs. Un enregistrement réellement invalide échoue donc, simplement une
     * requête plus tard.
     */
    async function ecrireParPasses(items, ecrire) {
        let restantes = items;
        let echecs = 0;
        while (restantes.length > 0) {
            const differees = [];
            for (const item of restantes) {
                const verdict = await ecrire(item, false);
                if (verdict === "differee") differees.push(item);
                else if (verdict === false) echecs++;
            }
            if (differees.length === 0) break;
            if (differees.length === restantes.length) {
                for (const item of differees) { await ecrire(item, true); echecs++; }
                break;
            }
            restantes = differees;
        }
        return echecs;
    }

    // Un refus qui peut n'être qu'un problème d'ordre d'écriture.
    function peutAttendre(erreur) {
        return erreur instanceof Api.ErreurApi &&
            (erreur.code === "donnee_invalide" || erreur.code === "contrainte_base");
    }

    async function ecrireCreation(item, definitif) {
        const { collection, id, enregistrement } = item;
        try {
            const reponse = await creerAdaptatif(collection, id, corpsDe(collection, enregistrement, true));
            const rendu = reponse && reponse.enregistrement;
            const idFinal = (rendu && typeof rendu.id === "string" && rendu.id !== "") ? rendu.id : id;
            if (idFinal !== id) renommer(collection, id, idFinal);
            item.id = idFinal;
            versions[collection].set(idFinal, {
                v: (rendu && typeof rendu._version === "number") ? rendu._version : 1,
                vmo: (rendu && typeof rendu._versionMiseEnOeuvre === "number") ? rendu._versionMiseEnOeuvre : null
            });
            alignerReference(collection, idFinal, enregistrement);
            return true;
        } catch (e) {
            if (!definitif && peutAttendre(e)) return "differee";
            return traiterEchec(collection, id, e, "creation", enregistrement);
        }
    }

    async function ecrireModification(item) {
        const { collection, id, enregistrement } = item;
        const v = versions[collection].get(id);
        if (!v || typeof v.v !== "number") {
            // Version inconnue : on ne devine pas, on refuse d'écrire. Deviner
            // reviendrait à contourner le verrouillage optimiste.
            return traiterEchec(collection, id, new Api.ErreurApi({
                statut: 409, code: "conflit_version", codeGrc: "GRC03",
                message: "La version de cet enregistrement n'est pas connue de cette session."
            }), "modification", enregistrement);
        }
        // Le verrou de la mise en oeuvre est transmis DÈS QU'IL EST CONNU : c'est
        // la moitié du constat M-2 qui revient au navigateur. L'autre moitié —
        // le serveur qui écrit sans clause de version quand le champ est absent —
        // ne peut pas être fermée d'ici (voir le rapport).
        const champs = corpsModifieDe(collection, id, enregistrement);
        if (Object.keys(champs).length === 0 && typeof v.vmo !== "number") {
            // Rien à écrire : la différence était un champ que le serveur ignore.
            alignerReference(collection, id, enregistrement);
            return true;
        }
        try {
            const reponse = await Api.modifier(collection, id, v.v, champs,
                (typeof v.vmo === "number") ? v.vmo : undefined);
            const rendu = reponse && reponse.enregistrement;
            versions[collection].set(id, {
                v: (rendu && typeof rendu._version === "number") ? rendu._version : v.v + 1,
                vmo: (rendu && typeof rendu._versionMiseEnOeuvre === "number") ? rendu._versionMiseEnOeuvre : v.vmo
            });
            alignerReference(collection, id, enregistrement);
            return true;
        } catch (e) {
            return traiterEchec(collection, id, e, "modification", enregistrement);
        }
    }

    async function ecrireSuppression(item, definitif) {
        const { collection, id } = item;
        const v = versions[collection].get(id);
        try {
            await Api.supprimer(collection, id, (v && typeof v.v === "number") ? v.v : undefined);
            oublierReference(collection, id);
            return true;
        } catch (e) {
            // Déjà parti : une cascade du schéma l'a emporté avec son parent.
            // C'est le résultat voulu, pas un échec.
            if (e instanceof Api.ErreurApi && e.estIntrouvable()) {
                oublierReference(collection, id);
                return true;
            }
            if (!definitif && peutAttendre(e)) return "differee";
            return traiterEchec(collection, id, e, "suppression", null);
        }
    }

    async function executerPropagation(mesureId) {
        try {
            const reponse = await Api.propagerMesure(mesureId);
            const data = donnees();
            (reponse.evaluations || []).forEach(recu => {
                if (!recu || !recu.id) return;
                const v = extraireVersions(recu);
                versions.evaluations.set(recu.id, v);
                const local = data.evaluations.find(e => e.id === recu.id);
                if (local) {
                    // Le serveur fait foi sur le résultat de l'opération composite.
                    Object.assign(local, recu);
                    alignerReference("evaluations", recu.id, local);
                } else {
                    data.evaluations.push(recu);
                    alignerReference("evaluations", recu.id, recu);
                }
            });
            propagations.delete(mesureId);
            return true;
        } catch (e) {
            // La propagation n'a pas eu lieu : on la retire de la file et les
            // évaluations recalculées en mémoire repartiront comme de simples
            // modifications au prochain cycle. Rien n'est perdu.
            propagations.delete(mesureId);
            return traiterEchec("mesures", mesureId, e, "propagation", null);
        }
    }

    /* =====================================================================
       ÉCHECS — la mémoire ne doit pas mentir
    ===================================================================== */

    function traiterEchec(collection, id, erreur, geste, enregistrement) {
        if (!(erreur instanceof Api.ErreurApi)) {
            console.error("Échec d'écriture inattendu", erreur);
            erreur = new Api.ErreurApi({ statut: 0, code: "erreur_interne", message: "Échec inattendu de l'enregistrement." });
        }

        // Panne passagère : rien n'est marqué, la modification reste en attente
        // et repartira toute seule. L'utilisateur est prévenu que ce n'est pas
        // encore enregistré.
        if (erreur.estPassagere()) {
            panneReseau = true;
            return false;
        }

        // Enregistrement DÉRIVÉ : aucune saisie n'est en jeu (voir `marquerDerive`).
        // On abandonne la valeur locale plutôt que d'alerter sur un faux positif ;
        // le sondage rapportera celle du serveur, qui vaut exactement autant.
        if (derives.has(cle(collection, id))) {
            const connu = valeurs[collection].get(id);
            if (connu) revenirALaValeurServeur(collection, id, "modification");
            else revenirALaValeurServeur(collection, id, "creation");
            derives.delete(cle(collection, id));
            console.info("Enregistrement dérivé abandonné (le serveur détient le sien) :", collection, id);
            return true;
        }

        if (erreur.estRefusDroit()) {
            // Refus de DROIT : le serveur n'a rien changé, et son état nous est
            // connu. On remet donc la mémoire à cet état — c'est la seule
            // réponse qui ne laisse pas la mémoire mentir — et on ne propose
            // surtout pas de recharger : il n'y a rien à recharger.
            revenirALaValeurServeur(collection, id, geste);
            ajouterIncident({
                collection, id, geste,
                type: "droit",
                message: erreur.message,
                rechargeable: false
            });
            return false;
        }

        // Conflit, ressource disparue, donnée refusée : la saisie reste sous les
        // yeux de l'utilisateur (la lui effacer serait une perte), mais elle
        // n'est plus réécrite tant qu'elle n'a pas été rechargée.
        bloques.add(cle(collection, id));
        ajouterIncident({
            collection, id, geste,
            type: erreur.estConflit() ? "conflit" : (erreur.estIntrouvable() ? "disparu" : "refus"),
            message: erreur.message,
            versionActuelle: erreur.versionActuelle,
            rechargeable: true
        });
        return false;
    }

    function revenirALaValeurServeur(collection, id, geste) {
        const data = donnees();
        if (!data || !Array.isArray(data[collection])) return;
        const connu = valeurs[collection].get(id);
        const i = data[collection].findIndex(x => x && x.id === id);
        if (geste === "creation") {
            if (i !== -1) data[collection].splice(i, 1);
            oublierReference(collection, id);
            return;
        }
        if (geste === "suppression") {
            if (connu && i === -1) data[collection].push(copie(connu));
            return;
        }
        if (connu && i !== -1) {
            // Remise en place SUR PLACE : les vues ouvertes gardent leur référence.
            Object.keys(data[collection][i]).forEach(k => { delete data[collection][i][k]; });
            Object.assign(data[collection][i], copie(connu));
        }
    }

    function ajouterIncident(incident) {
        incident.horodatage = Date.now();
        incident.libelle = libelleEnregistrement(incident.collection, incident.id);
        // Un même enregistrement ne s'empile pas : le dernier échec fait foi.
        const i = incidents.findIndex(x => x.collection === incident.collection && x.id === incident.id);
        if (i !== -1) incidents.splice(i, 1);
        incidents.push(incident);
    }

    const LIBELLES = {
        clients: "Donneur d'ordre", exigences: "Exigence", actions: "Action", risques: "Risque",
        actifs: "Actif", processus: "Processus (BIA)", crise: "Membre de la cellule de crise",
        scenarios_pra: "Scénario PCA/PRA", tests_pra: "Test PRA", prestataires: "Prestataire",
        mco_actions: "Action préalable (MCO)", audits: "Audit", revues: "Revue de direction",
        evaluations: "Évaluation de référentiel", mesures: "Mesure de sécurité", incidents: "Incident",
        documents: "Document", traitements: "Traitement RGPD", mappings: "Correspondance",
        history: "Point d'historique", personnes: "Personne"
    };

    // Nom lisible d'un enregistrement, pour que le message parle de « Risque :
    // Rançongiciel » et non d'un identifiant technique.
    function libelleEnregistrement(collection, id) {
        const type = LIBELLES[collection] || collection;
        const data = donnees();
        const enr = (data && Array.isArray(data[collection])) ? data[collection].find(x => x && x.id === id) : null;
        const nom = enr && (enr.nom || enr.titre || enr.societe || enr.theme || enr.role || enr.code || enr.ref || enr.intitule);
        return nom ? (type + " « " + nom + " »") : (type + " " + id);
    }

    /* =====================================================================
       RECHARGEMENT COMPLET
       C'est la réponse au « modifié entre-temps » : on reprend la version en
       cours du serveur, on efface les blocages, on réaffiche.
    ===================================================================== */

    async function recharger() {
        const charge = await Api.donnees();
        horodatageServeur = charge.horodatage;
        const neuf = charge.data;
        source.remplacer(neuf);
        adopterJeu(donnees());
        incidents.length = 0;
        bandeauReduit = false;
        propagations.clear();
        champsRefuses.clear();
        rendreBandeau();
        prevenirObservateurs();
        reafficher(true);
        return true;
    }

    /* =====================================================================
       SONDAGE DE RAFRAÎCHISSEMENT
    ===================================================================== */

    function demarrerSondage() {
        if (minuteurSondage) return;
        minuteurSondage = setInterval(() => { sonder(); }, SONDAGE_MS);
    }

    // Recule l'horodatage demandé de la marge de recouvrement (voir M-7).
    function avecRecouvrement(horodatage) {
        const t = Date.parse(horodatage);
        if (Number.isNaN(t)) return horodatage;
        return new Date(t - RECOUVREMENT_SONDAGE_MS).toISOString();
    }

    // Recharge sans rien perdre : ce qui attend d'être écrit part d'abord.
    async function rechargerApresEcriture() {
        if (aDesModificationsEnAttente()) await cycle();
        await recharger();
    }

    async function sonder() {
        if (!source || !horodatageServeur) return;
        if (ecritureEnCours) return;                        // un cycle en vol : le suivant sondera
        if (typeof document !== "undefined" && document.hidden) return;
        // Une écriture en attente n'annule pas le sondage : elle passe d'abord.
        // L'ordre compte, l'exclusion serait un défaut — c'est ainsi qu'un écran
        // qui écrit à chaque affichage éteindrait le rafraîchissement.
        if (minuteurEcriture) await cycle();

        // ⚠️ On ne s'arrête PAS parce qu'une modification locale attend d'être
        // écrite : ce serait rendre le rafraîchissement dépendant du hasard, et
        // un écran qui écrit périodiquement (le tableau de bord historise ses
        // indicateurs) suffirait à l'éteindre pour de bon. La protection contre
        // l'écrasement est tenue enregistrement par enregistrement, plus bas.

        let resultat;
        try {
            resultat = await Api.rafraichir(avecRecouvrement(horodatageServeur));
        } catch (e) {
            return;   // le sondage est un confort : son échec ne dérange personne
        }
        horodatageServeur = resultat.horodatage;

        // Un sondage tronqué ne dit pas tout : on recharge plutôt que de croire
        // détenir un état complet.
        if (resultat.tronque) { await rechargerApresEcriture(); return; }

        const data = donnees();
        let recus = 0;
        Object.keys(resultat.modifications || {}).forEach(c => {
            if (!Array.isArray(data[c])) return;
            (resultat.modifications[c] || []).forEach(recu => {
                if (!recu || !recu.id) return;
                const v = extraireVersions(recu);
                const i = data[c].findIndex(x => x && x.id === recu.id);
                if (i === -1) {
                    data[c].push(recu);
                    versions[c].set(recu.id, v);
                    alignerReference(c, recu.id, recu);
                    recus++;
                    return;
                }
                // Ne jamais écraser une saisie locale non encore enregistrée.
                if (reference[c].get(recu.id) !== canonique(data[c][i])) return;
                if (reference[c].get(recu.id) === canonique(recu)) {
                    versions[c].set(recu.id, v);   // c'était notre propre écriture
                    return;
                }
                Object.keys(data[c][i]).forEach(k => { delete data[c][i][k]; });
                Object.assign(data[c][i], recu);
                versions[c].set(recu.id, v);
                alignerReference(c, recu.id, data[c][i]);
                recus++;
            });
        });

        // Les suppressions ne sont pas rendues par le sondage (aucune pierre
        // tombale avant le journal d'audit du lot L5) : c'est l'écart de volume
        // qui les révèle. Un écart ⇒ rechargement complet — après avoir écrit ce
        // qui attendait, pour ne rien perdre au passage.
        const volumes = resultat.volumes || {};
        const incertaines = collectionsAuVolumeIncertain();
        let ecart = false;
        collections.forEach(c => {
            if (incertaines.has(c)) return;   // création ou suppression locale non encore partie
            if (typeof volumes[c] === "number" && Array.isArray(data[c]) && volumes[c] !== data[c].length) ecart = true;
        });
        if (ecart) { await rechargerApresEcriture(); return; }

        if (recus > 0) {
            prevenirObservateurs();
            signalerRafraichissement(recus);
        }
    }

    /* =====================================================================
       AFFICHAGE
    ===================================================================== */

    // Réaffiche la vue courante. On ne le fait pas si l'utilisateur est en train
    // de saisir : lui reprendre son formulaire sous les doigts serait une perte.
    function saisieEnCours() {
        const a = document.activeElement;
        if (!a) return false;
        const zone = document.getElementById("app");
        if (!zone || !zone.contains(a)) return false;
        const t = (a.tagName || "").toLowerCase();
        return t === "input" || t === "textarea" || t === "select" || a.isContentEditable === true;
    }

    function reafficher(force) {
        if (!force && saisieEnCours()) return false;
        try {
            const route = location.hash ? location.hash.replace(/^#/, "") : "/dashboard";
            // `const Router` d'un script classique ne pose pas de propriété sur
            // `window` : le tester par `window.Router` renverrait toujours faux.
            if (typeof Router === "undefined") return false;
            Router.navigateTo(route, false);
            return true;
        } catch (e) { return false; }
    }

    function hote() {
        let h = document.getElementById("sync-banner-host");
        if (!h) {
            h = document.createElement("div");
            h.id = "sync-banner-host";
            h.className = "no-print";
            const gb = document.getElementById("global-banner");
            if (gb && gb.parentNode) gb.parentNode.insertBefore(h, gb);
            else { const mc = document.querySelector(".main-content"); if (mc) mc.prepend(h); }
        }
        return h;
    }

    function rendreBandeau() {
        const h = hote();
        if (!h) return;

        if (incidents.length === 0 && bloques.size === 0 && !panneReseau && champsRefuses.size === 0) {
            h.innerHTML = "";
            return;
        }

        const morceaux = [];

        // ── LA TRACE NE S'ÉTEINT PAS ────────────────────────────────────────
        // La croix « Masquer » réduit le détail ; tant qu'un enregistrement est
        // bloqué, une ligne compacte subsiste, avec le remède. Le constat B-2
        // portait exactement là : la croix effaçait la seule trace, l'écriture
        // restait bloquée pour toujours, et l'application affirmait ensuite que
        // tout était enregistré.
        if (bloques.size > 0 && (bandeauReduit || incidents.length === 0)) {
            morceaux.push(
                '<div class="quota-banner" role="alert">' +
                '<span class="quota-ico">!</span>' +
                '<span class="quota-text"><b>' + bloques.size + ' enregistrement(s) non enregistré(s)</b> — ' +
                'la saisie reste à l’écran mais n’est pas partie au serveur.</span>' +
                '<button id="sync-detail" class="reminder-btn">Voir le détail</button>' +
                '<button id="sync-recharger" class="reminder-btn">Recharger les données</button>' +
                '</div>');
        } else if (incidents.length > 0) {
            const rechargeable = incidents.some(i => i.rechargeable);
            const lignes = incidents.slice(-5).map(i => {
                const tete = i.type === "conflit" ? "Modifié entre-temps"
                    : i.type === "disparu" ? "Supprimé entre-temps"
                        : i.type === "droit" ? "Écriture refusée"
                            : "Enregistrement refusé";
                return "<li><b>" + esc(tete) + "</b> — " + esc(i.libelle) + " : " + esc(i.message) + "</li>";
            }).join("");
            morceaux.push(
                '<div class="quota-banner" role="alert">' +
                '<span class="quota-ico">!</span>' +
                '<span class="quota-text"><b>' + incidents.length + ' modification(s) non enregistrée(s).</b>' +
                '<ul style="margin:6px 0 0 18px; padding:0; font-weight:400;">' + lignes + '</ul></span>' +
                (rechargeable ? '<button id="sync-recharger" class="reminder-btn">Recharger les données</button>' : '') +
                '<button id="sync-fermer" class="reminder-close" title="Masquer" aria-label="Masquer">&times;</button>' +
                '</div>');
        }

        if (panneReseau) {
            morceaux.push(
                '<div class="reminder-banner" role="status">' +
                '<span class="reminder-ico">!</span>' +
                '<span class="reminder-text">Serveur injoignable : vos dernières modifications ne sont pas encore enregistrées. ' +
                'Un nouvel essai est en cours — ne fermez pas cet onglet.</span>' +
                '<button id="sync-reessayer" class="reminder-btn">Réessayer maintenant</button>' +
                '</div>');
        }

        if (champsRefuses.size > 0) {
            morceaux.push(
                '<div class="reminder-banner" role="status">' +
                '<span class="reminder-ico">!</span>' +
                '<span class="reminder-text">Champs non reconnus par le serveur, donc <b>non enregistrés</b> : ' +
                esc(Array.from(champsRefuses).join(", ")) + '. Signalez-le à votre exploitant.</span>' +
                '</div>');
        }

        h.innerHTML = morceaux.join("");

        const r = document.getElementById("sync-recharger");
        if (r) r.onclick = async () => {
            r.disabled = true; r.textContent = "Rechargement…";
            try {
                // m-6 : ce qui attend d'être écrit PART D'ABORD — sans quoi le
                // rechargement emporterait les saisies faites sur d'autres fiches.
                await rechargerApresEcriture();
                if (window.showToast) window.showToast("Données rechargées depuis le serveur.", "success");
            } catch (e) {
                r.disabled = false; r.textContent = "Recharger les données";
                if (window.showToast) window.showToast("Rechargement impossible : serveur injoignable.", "error");
            }
        };
        const d = document.getElementById("sync-detail");
        if (d) d.onclick = () => { bandeauReduit = false; rendreBandeau(); };
        const f = document.getElementById("sync-fermer");
        if (f) f.onclick = () => {
            // Masquer le DÉTAIL, jamais le fait. Si plus rien n'est bloqué, le
            // bandeau peut disparaître : il n'y a plus rien à dire.
            incidents.length = 0;
            bandeauReduit = bloques.size > 0;
            rendreBandeau();
        };
        const e = document.getElementById("sync-reessayer");
        if (e) e.onclick = () => { panneReseau = false; rendreBandeau(); pousser(); };
    }

    function signalerRafraichissement(n) {
        if (reafficher(false)) {
            if (window.showToast) window.showToast(n + " modification(s) reçue(s) d'un autre utilisateur.", "info");
            return;
        }
        const h = hote();
        if (!h) return;
        const bloc = document.createElement("div");
        bloc.innerHTML =
            '<div class="reminder-banner" role="status">' +
            '<span class="reminder-ico">!</span>' +
            '<span class="reminder-text">' + n + ' modification(s) reçue(s) d\'un autre utilisateur.</span>' +
            '<button id="sync-actualiser" class="reminder-btn">Actualiser l\'affichage</button>' +
            '</div>';
        h.appendChild(bloc);
        const b = document.getElementById("sync-actualiser");
        if (b) b.onclick = () => { bloc.remove(); reafficher(true); };
    }

    /* =====================================================================
       OBSERVATEURS / ÉTAT
    ===================================================================== */

    function surChangementEtat(cb) { if (typeof cb === "function") observateursEtat.push(cb); }
    function prevenirObservateurs() {
        const e = etat();
        observateursEtat.forEach(cb => { try { cb(e); } catch (err) { /* un observateur ne casse pas le cycle */ } });
    }

    function etat() {
        return {
            connecte: !!modele,
            enAttente: aDesModificationsEnAttente(),
            enCours: ecritureEnCours,
            panneReseau: panneReseau,
            incidents: incidents.length,
            bloques: bloques.size,
            dernierEnregistrement: dernierEnregistrement
        };
    }

    /* =====================================================================
       FILETS DE SÉCURITÉ
    ===================================================================== */

    function installerFilets() {
        try {
            window.addEventListener("beforeunload", (e) => {
                if (!aDesModificationsEnAttente()) return;
                pousser();
                e.preventDefault();
                e.returnValue = "";
                return "";
            });
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "hidden" && aDesModificationsEnAttente()) pousser();
                if (document.visibilityState === "visible") sonder();
            });
        } catch (e) { /* environnement sans fenêtre : rien à installer */ }
    }

    return {
        brancher, demarrer, jeuDeDonnees, adopterJeu,
        marquerModification, marquerPropagation, marquerDerive, pousser, cycle,
        recharger, sonder, demarrerSondage, installerFilets,
        etat, surChangementEtat, aDesModificationsEnAttente, rendreBandeau
    };
})();

window.Sync = Sync;
