// Emplacement : js/modules/pieces.js
// Nom du fichier : pieces.js
//
// Panneau « Pièces jointes » — dépôt, liste et téléchargement (lot L6).
//
// ── Ce que ce fichier est, et ce qu'il n'est pas ────────────────────────────
//
// Ce n'est **pas un écran** : c'est un panneau que les fiches embarquent
// (`/documents/:id`, `/incidents/:id` aujourd'hui). Une pièce jointe n'a pas
// d'existence propre — elle est la preuve de quelque chose, et elle se lit à
// côté de ce qu'elle prouve. Il n'y a donc ni route, ni entrée de menu, ni
// domaine de droits propre : le panneau hérite du domaine de la fiche qui le
// porte, ce que `js/app.js` fait déjà sans rien savoir de lui.
//
// ── Le contrat : `backend/db/CONVENTIONS.md` §31, et lui seul ───────────────
//
// Trois points que le §31 tranche et que ce fichier ne re-décide pas :
//
//   1. **L'ordre des huit contrôles est figé** (§31.2) et il est **entièrement
//      côté serveur**. Ce fichier ne contrôle ni l'extension, ni la signature
//      binaire, ni l'empreinte : un contrôle qui n'existerait qu'ici serait un
//      contrôle absent, et le §31.2 le dit — « la signature binaire est le seul
//      contrôle que l'attaquant ne choisit pas », ce qui suppose qu'il soit joué
//      là où l'attaquant n'écrit pas.
//   2. **La délivrance est un téléchargement forcé, jamais un rendu en ligne**
//      (§31.3). Conséquence pour ce fichier : il ne construit **aucun** chemin
//      vers l'octet en dehors de `Api.telechargerPiece()` — pas d'`<a href>` vers
//      `api/pieces/…` posé dans le balisage, pas d'`<img src>`, pas d'`<iframe>`.
//      Une seule porte, et elle passe par une fonction, donc par une garde.
//   3. **Une pièce en cours d'analyse ou en quarantaine n'est pas délivrable**
//      (§31.2, point 8). L'écran le **dit** plutôt que de proposer un bouton qui
//      échouera : un refus après le clic apprend à recliquer.
//
// ⚠️ Et la phrase que le `PLAN_SERVEUR` §1.6 met en tête, qui doit rester
// lisible **dans l'interface** et pas seulement dans le code : **aucun
// dispositif ne garantit l'absence de malware.** La chaîne est une défense en
// profondeur, pas une promesse (§17.5 — un garde-fou ne se voit pas prêter plus
// de portée qu'il n'en a). Le panneau l'écrit sous la liste.
//
// ── Ce qui vient d'un déposant, et ce que cela impose ───────────────────────
//
// **Le nom du fichier est une donnée utilisateur.** Il est choisi par celui qui
// dépose, il traverse la base et il revient s'afficher ici — exactement le
// chemin qu'a suivi le login forgé de la porte S3 (`CONVENTIONS.md` §29.5). Tout
// ce que ce fichier injecte dans le DOM passe donc par `escapeHtml`, sans
// exception, y compris le type MIME et le résultat d'analyse — qui viennent, eux,
// d'un moteur antiviral dont personne ne contrôle les chaînes.
//
// ── L'entonnoir, et ce qu'un seul oubli a coûté ────────────────────────────
//
// **Tout ce qui fait sortir un octet passe par `Droits.exigerExport()`.** Le
// constat **Q-89** est né d'un seul site de sortie qui l'avait oublié : 38 213
// octets d'un document marqué *confidentiel*, téléchargés par un compte sans
// droit d'export, sur le seul des douze sites qui ne passait pas par
// l'entonnoir. Un téléchargement de pièce jointe **en est un** — et c'est même
// le plus littéral de tous, puisque l'octet qui sort est un fichier entier.

const PiecesModule = (() => {
    "use strict";

    /* =====================================================================
       VOCABULAIRE — relevé dans le schéma, jamais réinventé
    ===================================================================== */

    /**
     * Ce que chaque état d'analyse veut dire **pour l'utilisateur**, et s'il
     * autorise la délivrance.
     *
     * ── Une liste écrite à la main, et pourquoi c'est le bon outil ici ──────
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Un état absent de
     * cette table est traité par `etatLisible()` comme **non délivrable** et
     * affiché tel qu'il est en base : rien ne sort en silence, l'état inconnu se
     * lit en clair, et quelqu'un doit décider. L'omission échoue donc du bon
     * côté — celui qui ne délivre pas.
     *
     * Les cinq valeurs sont celles de `ck_pieces_jointes_etat`
     * (`db/migrations/001_socle.sql`). `Api.CONTRAT_PIECES.etats` les porte aussi :
     * un écart entre les deux se voit au démarrage (`verifierVocabulaire`).
     */
    const ETATS = Object.freeze({
        en_attente: {
            libelle: "Analyse en attente",
            teinte: "status-partiellement-conforme",
            delivrable: false,
            explication: "Le fichier a été reçu ; l'analyse antivirale n'a pas encore " +
                "commencé. Il sera téléchargeable une fois l'analyse terminée."
        },
        en_cours: {
            libelle: "Analyse en cours",
            teinte: "status-partiellement-conforme",
            delivrable: false,
            explication: "L'analyse antivirale est en cours. Le fichier n'est pas " +
                "téléchargeable tant qu'elle n'a pas rendu son verdict."
        },
        saine: {
            libelle: "Analysée",
            teinte: "status-conforme",
            delivrable: true,
            explication: "L'analyse antivirale n'a rien signalé."
        },
        infectee: {
            libelle: "En quarantaine",
            teinte: "status-non-conforme",
            delivrable: false,
            explication: "L'analyse antivirale a signalé ce fichier. Il est isolé et ne " +
                "peut pas être téléchargé. Prévenez votre exploitant."
        },
        erreur: {
            libelle: "Analyse impossible",
            teinte: "status-non-conforme",
            delivrable: false,
            explication: "L'analyse antivirale n'a pas abouti. Faute de verdict, le " +
                "fichier n'est pas délivré — un fichier non analysé n'est pas un " +
                "fichier sain."
        }
    });

    /**
     * Les quatre verdicts de `ck_pieces_jointes_integrite` (migration 020), et ce
     * qu'ils veulent dire **pour l'utilisateur**.
     *
     * ── Une liste écrite à la main, et pourquoi c'est le bon outil ──────────
     *
     * Même raisonnement qu'à `ETATS` : un verdict absent de cette table est
     * affiché **tel qu'il est en base**, en teinte neutre, et personne ne conclut
     * à sa place. L'omission échoue du côté qui n'affirme rien.
     */
    const INTEGRITE = Object.freeze({
        non_verifiee: {
            libelle: "Non vérifiée",
            teinte: "status-non-applicable",
            alarmant: false,
            explication: "Le rapprochement avec l'empreinte n'a pas encore eu lieu pour " +
                "ce fichier. Le balayage périodique s'en charge ; vous pouvez aussi le " +
                "demander maintenant."
        },
        conforme: {
            libelle: "Empreinte vérifiée",
            teinte: "status-conforme",
            alarmant: false,
            explication: "Le fichier du magasin correspond à l'empreinte enregistrée lors " +
                "de son dépôt."
        },
        ecart: {
            libelle: "Empreinte en écart",
            teinte: "status-non-conforme",
            alarmant: true,
            explication: "Le fichier ne correspond plus à l'empreinte enregistrée à son " +
                "dépôt : ses octets ont changé. Prévenez votre exploitant — ce fichier ne " +
                "peut plus servir de preuve en l'état."
        },
        fichier_absent: {
            libelle: "Fichier introuvable",
            teinte: "status-non-conforme",
            alarmant: true,
            explication: "Le fichier a disparu du magasin. La preuve est perdue, et la " +
                "fiche continue de l'annoncer. Prévenez votre exploitant."
        }
    });

    /** Identifiant du conteneur que la fiche pose, et que ce module remplit. */
    const HOTE = "piecesJointes";

    /**
     * L'entité sur laquelle « faire foi » veut dire quelque chose.
     *
     * ── Pourquoi l'écran restreint là où la route ne restreint pas ──────────
     *
     * `POST /api/pieces/<entite>/<id>/<piece>/en-vigueur` accepte **toute**
     * entité, et c'est juste : l'invariant « au plus une pièce fait foi par
     * porteur » est général, et l'index qui le tient l'est aussi. Ce qui n'est
     * pas général, c'est le SENS : « la version en vigueur » est le vocabulaire
     * d'un registre documentaire. Offrir le bouton sur une fiche d'incident
     * poserait une question à laquelle personne n'a de réponse.
     *
     * La restriction est donc d'ÉCRAN, et elle est dite ici — pas une barrière :
     * le serveur reste la barrière, et il ne refuse pas ce geste ailleurs.
     */
    const ENTITE_DOCUMENTS = "documents";

    /* =====================================================================
       ÉTAT DU PANNEAU
    ===================================================================== */

    let entiteType = "";
    let entiteId = "";
    let liste = [];
    let chargement = false;
    let erreurChargement = null;
    let depotEnCours = false;
    /** Désignation « en vigueur » en cours : évite le double clic. */
    let designationEnCours = false;
    /**
     * Verdicts d'intégrité obtenus À LA DEMANDE, par identifiant de pièce.
     *
     * ⚠️ Ils ne sont **pas** confondus avec `piece.etat_integrite`, qui vient du
     * balayage périodique et vit en base. Les deux répondent à des questions
     * différentes — « qu'a vu le dernier balayage » et « qu'est-ce que je
     * constate maintenant » —, et les mêler ferait passer un verdict de la
     * semaine dernière pour une mesure du moment.
     */
    let verdictsDemandes = {};
    /** Empreintes dépliées (l'utilisateur a demandé à voir les 64 caractères). */
    let empreintesDepliees = {};
    /** Vérification en cours, par identifiant de pièce. */
    let verificationsEnCours = {};
    /**
     * Ce que la fiche veut savoir quand la liste vient d'être lue.
     *
     * ⚠️ **Une fonction fournie par l'appelant, jamais une écriture dans SON
     * balisage.** Le panneau pourrait aller désactiver lui-même le champ
     * « Version » de la fiche document — il en connaît l'identifiant. Ce serait
     * un couplage invisible : le jour où la fiche renomme son champ, le panneau
     * cesserait de le trouver **sans un mot**, et la version redeviendrait une
     * saisie libre sans que rien ne le dise. On rend l'information, la fiche en
     * fait ce qu'elle veut.
     */
    let auChargement = null;
    /**
     * Borne de taille **annoncée par le serveur**, ou `null`.
     *
     * ⚠️ Elle n'est PAS recopiée ici. `src/config/index.ts` porte
     * `tailleMaxOctets` (25 Mio par défaut, réglable par déploiement) : une
     * constante en dur dans le navigateur serait fausse le jour où un exploitant
     * la change, et fausse **en silence** — elle refuserait un fichier que le
     * serveur accepte, ou laisserait partir un envoi qu'il refusera. On lit donc
     * ce que le serveur annonce, et à défaut on n'oppose **aucune** borne locale :
     * c'est lui qui refuse, et son message est déjà écrit pour l'utilisateur.
     */
    let tailleMaxAnnoncee = null;
    /** Le vocabulaire n'est confronté qu'une fois : il ne change pas en cours de session. */
    let vocabulaireVerifie = false;
    /**
     * Ce serveur offre-t-il les pièces jointes ?
     *
     * ── Pourquoi une VUE ABSENTE et non un message d'erreur ─────────────────
     *
     * « Je n'ai pas pu lire la liste » et « ce serveur n'a pas cette
     * fonction » ne sont pas la même chose, et n'appellent pas la même
     * réponse. Le premier est un incident : il s'affiche, parce que
     * l'utilisateur doit savoir qu'il manque peut-être des preuves. Le second
     * est un fait d'installation : afficher un bandeau d'échec sur **chaque**
     * fiche d'un serveur correctement installé serait une alarme quotidienne
     * et fausse — exactement le faux positif que le constat m-5 condamne, et
     * ce qui apprend à ignorer les alarmes.
     *
     * `ressource_inconnue` (404) discrimine les deux : le serveur a répondu, et
     * il a répondu qu'il ne connaît pas cette route. Le panneau s'efface, et
     * **il cesse de demander** — inutile d'interroger à chaque fiche un serveur
     * qui vient de dire qu'il n'a pas la fonction.
     */
    let piecesOffertes = true;

    /* =====================================================================
       AFFICHAGE — tout passe par escapeHtml, sans exception
    ===================================================================== */

    function esc(valeur) {
        if (window.escapeHtml) return window.escapeHtml(valeur == null ? "" : String(valeur));
        return String(valeur == null ? "" : valeur)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /**
     * Ce que vaut une pièce, en trois mots : son libellé, sa teinte, et si elle
     * se délivre.
     *
     * ⚠️ **La quarantaine l'emporte sur l'état**, et l'ordre des deux tests n'est
     * pas indifférent. Le schéma garantit qu'une pièce `infectee` est en
     * quarantaine (`ck_pieces_jointes_quarantaine`) ; il ne garantit pas
     * l'inverse — une pièce peut être mise en quarantaine sans être déclarée
     * infectée (une réanalyse, une décision d'exploitation). Lire l'état seul
     * délivrerait celle-là.
     */
    function etatLisible(piece) {
        const brut = String(piece && piece.etat_analyse || "");
        const connu = Object.prototype.hasOwnProperty.call(ETATS, brut) ? ETATS[brut] : null;
        if (piece && piece.quarantaine === true) {
            return {
                code: brut,
                libelle: "En quarantaine",
                teinte: "status-non-conforme",
                delivrable: false,
                explication: (connu && brut === "infectee") ? connu.explication
                    : "Ce fichier est isolé et ne peut pas être téléchargé. " +
                      "Prévenez votre exploitant."
            };
        }
        if (connu) return { code: brut, ...connu };
        // État inconnu : lisible en clair, et **non délivrable**. L'omission
        // échoue du côté qui ne fait sortir aucun octet.
        return {
            code: brut,
            libelle: brut || "État inconnu",
            teinte: "status-non-applicable",
            delivrable: false,
            explication: "L'état de l'analyse n'est pas reconnu par cette version de " +
                "l'application. Par précaution, le fichier n'est pas délivré."
        };
    }

    /**
     * Dit à la fiche ce qu'elle a besoin de savoir, si elle l'a demandé.
     *
     * Le rappel ne peut pas casser le panneau : une fiche qui lèverait laisserait
     * la liste des pièces à l'écran, ce qui est la seule chose que ce module
     * promet. L'échec part au journal technique — muet à l'écran serait pire,
     * mais bruyant à l'écran ferait passer un défaut d'affichage pour un
     * incident de sécurité.
     */
    function prevenirLaFiche() {
        if (!auChargement) return;
        try {
            auChargement({ entiteType: entiteType, entiteId: entiteId, enVigueur: enVigueur() });
        } catch (e) {
            console.info("Pièces jointes — la fiche n'a pas pu être prévenue :", e);
        }
    }

    /**
     * Ce que vaut l'intégrité d'une pièce, en trois mots.
     *
     * Le verdict DEMANDÉ à l'instant l'emporte sur celui du balayage : c'est le
     * plus récent, et c'est celui que l'utilisateur vient de provoquer. L'origine
     * est rendue avec, pour que l'écran puisse la dire — « constaté à l'instant »
     * et « vu au dernier balayage » ne sont pas la même affirmation.
     */
    function integriteLisible(piece) {
        const demande = piece && verdictsDemandes[piece.id];
        const brut = String((demande && demande.verdict) ||
            (piece && piece.etat_integrite) || "non_verifiee");
        const connu = Object.prototype.hasOwnProperty.call(INTEGRITE, brut) ? INTEGRITE[brut] : null;
        const socle = connu || {
            libelle: brut,
            teinte: "status-non-applicable",
            alarmant: false,
            explication: "Ce verdict d'intégrité n'est pas reconnu par cette version de " +
                "l'application. Il est affiché tel quel, sans conclusion."
        };
        return {
            code: brut,
            libelle: socle.libelle,
            teinte: socle.teinte,
            alarmant: socle.alarmant,
            explication: socle.explication,
            aLInstant: Boolean(demande)
        };
    }

    /** La pièce qui fait foi, ou `null`. Lue dans la liste, jamais mémorisée à part. */
    function enVigueur() {
        for (let i = 0; i < liste.length; i += 1) {
            if (liste[i] && liste[i].en_vigueur === true) return liste[i];
        }
        return null;
    }

    /** Taille lisible. Aucune donnée utilisateur ici : c'est un nombre. */
    function tailleLisible(octets) {
        const n = Number(octets);
        if (!isFinite(n) || n <= 0) return "—";
        if (n < 1024) return String(n) + " o";
        if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(".", ",") + " Kio";
        return (n / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mio";
    }

    function fmtHorodatage(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return esc(iso);
        return d.toLocaleString("fr-FR");
    }

    /**
     * Une ligne du tableau.
     *
     * ⚠️ **L'identifiant de la pièce vit dans un ATTRIBUT du balisage**, jamais
     * capturé en chaîne dans une fermeture (`CLAUDE.md` §3) : le serveur
     * réattribue les identifiants, et une fermeture qui aurait retenu l'ancien
     * viserait en silence une pièce qui n'existe plus. Il est relu au clic.
     */
    function ligneHtml(piece) {
        const etat = etatLisible(piece);
        const nom = esc(piece.nom_fichier || "(sans nom)");
        const faitFoi = piece.en_vigueur === true;
        const telechargement = etat.delivrable
            ? '<button type="button" class="pj-telecharger btn-secondary" ' +
              'data-piece="' + esc(piece.id) + '" ' +
              'title="Télécharger — l\'extraction est journalisée">Télécharger</button>'
            // ── AUCUN CHEMIN DE TÉLÉCHARGEMENT, PAS MÊME GRISÉ ────────────────
            // Un bouton désactivé reste un bouton : il se réactive au premier
            // `disabled = false` venu, et il suggère qu'un octet est à portée.
            // Une pièce non délivrable n'en offre AUCUN — on écrit pourquoi.
            : '<span class="pj-indisponible" title="' + esc(etat.explication) + '">Non délivrable</span>';
        // Le geste n'est proposé QUE là où il veut dire quelque chose, et jamais
        // sur celle qui fait déjà foi — un bouton qui ne changerait rien.
        const designation = (entiteType === ENTITE_DOCUMENTS && etat.delivrable && !faitFoi)
            ? ' <button type="button" class="pj-designer btn-secondary" ' +
              'data-piece="' + esc(piece.id) + '"' + (designationEnCours ? " disabled" : "") + ' ' +
              'title="Cette version devient celle qui fait foi ; l\'actuelle passe à ' +
              'l\'historique, sans être supprimée">Faire foi</button>'
            : "";
        const verification = etat.delivrable
            ? ' <button type="button" class="pj-verifier btn-secondary" ' +
              'data-piece="' + esc(piece.id) + '"' +
              (verificationsEnCours[piece.id] ? " disabled" : "") + ' ' +
              'title="Relit le fichier et le compare à l\'empreinte enregistrée à son ' +
              'dépôt. Aucun octet ne sort du produit.">' +
              (verificationsEnCours[piece.id] ? "Vérification…" : "Vérifier") + "</button>"
            : "";
        return (
            '<tr class="pj-ligne' + (faitFoi ? " pj-en-vigueur" : "") + '" ' +
            'data-piece="' + esc(piece.id) + '">' +
            '<td class="pj-nom">' + nom +
            (faitFoi ? ' <span class="status status-conforme pj-foi">En vigueur</span>' : "") +
            integriteHtml(piece) +
            empreinteHtml(piece) +
            "</td>" +
            "<td>" + esc(piece.version_piece || "—") + "</td>" +
            "<td>" + esc(tailleLisible(piece.taille_octets)) + "</td>" +
            '<td><span class="status ' + etat.teinte + '">' + esc(etat.libelle) + "</span></td>" +
            "<td>" + fmtHorodatage(piece.cree_le || piece.depose_le) + "</td>" +
            "<td>" + esc(piece.cree_par || piece.depose_par || "—") + "</td>" +
            '<td class="pj-action">' + telechargement + designation + verification + "</td>" +
            "</tr>"
        );
    }

    /**
     * Le badge d'intégrité — affiché **seulement quand il dit quelque chose**.
     *
     * Une pièce jamais rapprochée n'en porte pas : un badge « non vérifiée » sur
     * chaque ligne d'une installation neuve serait une alarme quotidienne et
     * fausse, et ce qui apprend à ignorer les alarmes (constat m-5). En revanche
     * un ÉCART ou un FICHIER ABSENT se voient sans qu'on ait rien à demander.
     */
    function integriteHtml(piece) {
        const verdict = integriteLisible(piece);
        if (verdict.code === "non_verifiee") return "";
        return ' <span class="status ' + esc(verdict.teinte) + ' pj-integrite" title="' +
            esc(verdict.explication) + '">' + esc(verdict.libelle) +
            (verdict.aLInstant ? " (à l’instant)" : "") + "</span>";
    }

    /**
     * L'empreinte, repliée sur ses douze premiers caractères.
     *
     * ── Pourquoi repliée, et pourquoi dépliable SANS presse-papiers ────────
     *
     * Soixante-quatre caractères hexadécimaux sur chaque ligne noieraient le nom
     * du fichier, qui est ce qu'on cherche d'abord. Mais une empreinte qu'on ne
     * peut pas lire **en entier** ne sert à rien : c'est précisément en la
     * comparant caractère par caractère à celle de son propre poste qu'un
     * auditeur s'assure qu'un rapport n'a pas été remplacé.
     *
     * On la déplie donc en place, en texte sélectionnable. **Pas de
     * `navigator.clipboard`** : il est indisponible hors contexte sécurisé et
     * refusable par l'utilisateur, et un bouton « Copier » qui ne copie rien
     * serait pire que pas de bouton — la sélection, elle, marche partout.
     */
    function empreinteHtml(piece) {
        const empreinte = String((piece && piece.sha256) || "");
        if (!empreinte) return "";
        const depliee = empreintesDepliees[piece.id] === true;
        return '<div class="pj-empreinte">' +
            '<button type="button" class="pj-empreinte-bascule" data-piece="' + esc(piece.id) + '" ' +
            'title="Empreinte SHA-256 calculée sur le fichier écrit. ' +
            (depliee ? "Replier" : "Afficher les 64 caractères") + '">' +
            (depliee ? "▾" : "▸") + " SHA-256</button> " +
            '<code class="pj-hash">' +
            esc(depliee ? empreinte : empreinte.slice(0, 12) + "…") + "</code></div>";
    }

    function corpsHtml() {
        if (chargement) return '<p class="chart-empty">Lecture des pièces jointes…</p>';
        if (erreurChargement) {
            // « Aucune pièce » et « je n'ai pas pu lire » ne veulent pas dire la
            // même chose, et se ressemblent à l'écran. Sur une preuve d'audit, la
            // confusion dit qu'il n'y a rien à voir (famille du constat Q-104).
            return '<div class="pj-erreur" role="alert"><strong>La liste des pièces jointes ' +
                "n'a pas pu être lue.</strong><br>" + esc(erreurChargement) + "</div>";
        }
        if (!liste.length) {
            return '<p class="chart-empty">Aucune pièce jointe. Les fichiers déposés ici sont ' +
                "analysés avant d'être mis à disposition.</p>";
        }
        return (
            '<table class="data-table pj-table"><thead><tr>' +
            "<th>Fichier</th><th>Version</th><th>Taille</th><th>Analyse</th><th>Déposé le</th>" +
            "<th>Par</th><th></th>" +
            "</tr></thead><tbody>" +
            liste.map(ligneHtml).join("") +
            "</tbody></table>"
        );
    }

    function styles() {
        return "<style>" +
            ".pj-table td { vertical-align:middle; font-size:0.85rem; }" +
            ".pj-table .status { text-transform:none; }" +
            ".pj-nom { word-break:break-word; max-width:280px; }" +
            ".pj-action { text-align:right; white-space:nowrap; }" +
            ".pj-indisponible { color:var(--text-muted); font-size:0.82rem; font-style:italic; cursor:help; }" +
            ".pj-erreur { margin:10px 0; padding:12px 14px; border-radius:var(--radius-sm); background:#fff3cd; color:#856404; border-left:4px solid var(--color-warning,#e0a800); font-size:0.9rem; }" +
            ".pj-depot { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px; }" +
            ".pj-avertissement { margin-top:12px; font-size:0.78rem; color:var(--text-muted); line-height:1.5; }" +
            ".pj-en-vigueur td { background:rgba(46,125,50,0.06); }" +
            ".pj-foi { text-transform:none; margin-left:6px; }" +
            ".pj-version { width:9rem; }" +
            ".pj-integrite { text-transform:none; margin-left:6px; }" +
            ".pj-empreinte { margin-top:3px; display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; }" +
            ".pj-empreinte-bascule { background:none; border:none; padding:0; color:var(--accent); " +
            "font-size:0.72rem; cursor:pointer; }" +
            ".pj-hash { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.72rem; " +
            "color:var(--text-muted); word-break:break-all; user-select:all; }" +
            "</style>";
    }

    /* =====================================================================
       CHARGEMENT
    ===================================================================== */

    async function charger() {
        chargement = true;
        erreurChargement = null;
        rafraichir();
        try {
            const charge = await Api.pieces(entiteType, entiteId);
            liste = normaliserListe(charge);
            prevenirLaFiche();
            tailleMaxAnnoncee = borneAnnoncee(charge);
        } catch (e) {
            liste = [];
            // Le serveur a répondu, et il a dit qu'il ne connaît pas la route :
            // ce n'est pas un incident, c'est une fonction absente de cette
            // installation. On l'enregistre, et on n'en reparle plus.
            if (e && e.estIntrouvable && e.estIntrouvable()) {
                piecesOffertes = false;
                erreurChargement = null;
            } else {
                erreurChargement = messageDErreur(e);
            }
        } finally {
            chargement = false;
            rafraichir();
        }
    }

    /**
     * Ramène la réponse à un tableau de pièces.
     *
     * Tolérante à dessein, pour la raison écrite au `js/modules/journal.js` : le
     * §31 fige la chaîne et la délivrance, pas le nom de l'enveloppe, et l'agent
     * qui écrit la route travaille en parallèle. Refuser tout sauf une forme
     * choisie ici transformerait un désaccord de nom en « aucune pièce jointe »,
     * c'est-à-dire en la seule réponse qui soit un mensonge.
     */
    function normaliserListe(charge) {
        let brutes = [];
        if (Array.isArray(charge)) brutes = charge;
        else if (charge && typeof charge === "object") {
            const candidat = ["pieces", "pieces_jointes", "entrees", "items", "resultats"]
                .map(c => charge[c]).find(Array.isArray);
            if (candidat) brutes = candidat;
        }
        return brutes.filter(p => p && typeof p === "object" && p.id).map(p => ({
            id: String(p.id),
            nom_fichier: p.nom_fichier ?? p.nom ?? "",
            taille_octets: p.taille_octets ?? p.taille ?? 0,
            type_mime: p.type_mime ?? "",
            etat_analyse: p.etat_analyse ?? "",
            quarantaine: p.quarantaine === true,
            sha256: p.sha256 ?? p.empreinte_sha256 ?? "",
            // ⚠️ **Cette fonction FILTRE : un champ absent d'ici n'atteint jamais
            // l'écran.** Les quatre lignes ci-dessous ont été oubliées une fois,
            // et le défaut était parfaitement invisible — la liste s'affichait,
            // sans erreur, sans badge « En vigueur », sans numéro de version et
            // sans verdict d'intégrité. Un champ neuf servi par le serveur doit
            // être ajouté ici, sans quoi il est jeté EN SILENCE.
            // `test/modules/non-regression.test.mjs` compare désormais les clés
            // rendues à celles que la route sert.
            en_vigueur: p.en_vigueur === true,
            version_piece: p.version_piece ?? null,
            etat_integrite: p.etat_integrite ?? "non_verifiee",
            derniere_verification: p.derniere_verification ?? null,
            cree_le: p.cree_le ?? p.depose_le ?? "",
            cree_par: p.cree_par ?? p.depose_par ?? ""
        }));
    }

    /** La borne de taille, si le serveur l'annonce. Sinon `null` — voir plus haut. */
    function borneAnnoncee(charge) {
        if (!charge || typeof charge !== "object") return null;
        const brut = charge.taille_max_octets ?? charge.tailleMaxOctets ?? null;
        const n = Number(brut);
        return (isFinite(n) && n > 0) ? n : null;
    }

    /**
     * Le FAIT, plus le geste que cette couche-ci connaît (constats Q-19, Q-29, Q-57).
     *
     * `js/core/api.js` n'en prescrit aucun : il ignore ce que l'appelant tient en
     * mémoire. Ici on le sait — la liste ne contient aucune saisie, et le dépôt
     * en contient une (le fichier choisi), d'où deux formulations distinctes.
     */
    function messageDErreur(e) {
        if (!e) return "Erreur inconnue.";
        if (e.estDroitInsuffisant && e.estDroitInsuffisant()) {
            return "Votre profil n'a pas accès aux pièces jointes de cet enregistrement.";
        }
        if (e.estNonAuthentifie && e.estNonAuthentifie()) {
            return "Votre session n'est plus ouverte sur le serveur. Reconnectez-vous : " +
                "rien n'est perdu, cette liste ne contient aucune saisie.";
        }
        return e.message || String(e);
    }

    /* =====================================================================
       TÉLÉCHARGEMENT — il passe par l'entonnoir, et il n'a pas d'autre chemin
    ===================================================================== */

    /**
     * Fait sortir une pièce du produit.
     *
     * ⚠️ **`Droits.exigerExport()` en première ligne, avant tout le reste.**
     * `PLAN_SERVEUR` §3.3 fait de l'export une permission à part entière, jamais
     * déduite de la lecture — et le constat **Q-89** a montré ce que coûte un
     * seul site oublié : 38 213 octets d'un document confidentiel téléchargés par
     * un compte sans droit d'export. **Le discriminant apparent était trompeur** :
     * les profils qu'on croyait bloqués l'étaient par leur lecture seule, pas par
     * l'absence du droit d'export — et RSSI et ADMIN, deux des huit profils du
     * socle, écrivent *et* n'exportent pas.
     *
     * ⚠️ Et l'entonnoir n'est **pas** la barrière : le serveur vérifie le droit et
     * le périmètre (§31.3), et lui seul détient le fichier. Ce qui se joue ici est
     * l'autre moitié — ne pas fabriquer un fichier en un clic depuis un écran qui
     * n'a rien interdit.
     *
     * @returns {Promise<boolean>} vrai si un octet est sorti.
     */
    async function telecharger(pieceId) {
        // ⚠️ **PAS d'entonnoir d'export ici — arbitrage du 04/09/2026.**
        //
        // Ce chemin appelait `Droits.exigerExport()`, sur la consigne — la mienne —
        // qu'« un téléchargement de pièce jointe fait sortir un octet, donc c'est
        // un export ». **C'était faux, et mesurable** : le droit d'export vient du
        // groupe AD `GRC-EXPORT`, que la plupart des comptes ne portent pas. Un
        // auditeur ou un contributeur n'aurait pas pu ouvrir le rapport qu'il est
        // précisément chargé de lire.
        //
        // Ce qui a été arbitré : **ouvrir une pièce attachée à une fiche qu'on a
        // le droit de lire EST une lecture.** Le serveur le dit de la même façon
        // (`action: 'lire'`, `CONVENTIONS.md` §31.5) et **trace chaque délivrance**
        // en `consultation_sensible` — on sait donc qui a ouvert quoi, ce qui est
        // l'exigence du `PLAN_SERVEUR` §1.7. L'entonnoir garde les **exports** ;
        // il n'a rien à garder ici.

        // Une pièce non délivrable n'a pas de bouton ; l'appel direct, lui, existe
        // toujours. On refait donc le test ici — le serveur refusera de toute
        // façon (§31.2, point 8), mais demander un fichier en quarantaine n'a
        // aucun sens, et l'écran doit dire pourquoi plutôt que de relayer un 403.
        const piece = liste.find(p => String(p.id) === String(pieceId));
        if (piece) {
            const etat = etatLisible(piece);
            if (!etat.delivrable) {
                if (window.showToast) window.showToast(etat.explication, "error");
                return false;
            }
        }

        // ── Pourquoi on relit le contenu plutôt que de suivre l'adresse ────
        //
        // Suivre l'adresse aurait deux avantages réels — un fichier de 25 Mio ne
        // transiterait pas par la mémoire, et le nom viendrait de l'en-tête
        // assaini par le serveur. **Un inconvénient les emporte** : sur un refus,
        // le navigateur QUITTE L'ÉCRAN pour afficher le JSON d'erreur. On perdrait
        // la saisie en cours pour économiser une copie — et la perte de saisie est
        // l'un des trois domaines que ce chantier ne négocie pas.
        //
        // On relit donc le contenu, ce qui permet de dire le refus **sans que
        // l'écran bouge**. Le coût mémoire est borné par `PJ_TAILLE_MAX` (25 Mio).
        try {
            const blob = await Api.telechargerPiece(entiteType, entiteId, pieceId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            // Le nom vient d'un déposant : il ne construit aucun balisage ici (on
            // pose une PROPRIÉTÉ, pas un attribut analysé), et le navigateur
            // assainit lui-même ce qu'il écrit sur le disque.
            a.download = (piece && piece.nom_fichier) ? piece.nom_fichier : "piece-jointe";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            return true;
        } catch (e) {
            if (window.showToast) window.showToast(messageDErreur(e), "error");
            return false;
        }
    }

    /* =====================================================================
       DÉPÔT
    ===================================================================== */

    /**
     * Dépose un fichier.
     *
     * Le fichier part **tel quel, en `multipart/form-data`** — la forme que la
     * route du §31 attend. Il part malgré tout par `js/core/api.js`, seule porte
     * du frontend sur le réseau : `appeler()` a appris à ne pas sérialiser un
     * corps de formulaire, plutôt qu'on n'ouvre ici une seconde porte (c'est le
     * motif qui a fait disparaître la fonction `demander()` de
     * `js/modules/journal.js`).
     *
     * ⚠️ Ce que ce chemin ne contrôle PAS, et ne doit pas contrôler : l'extension,
     * la signature binaire, l'empreinte. Les huit contrôles du §31.2 se jouent
     * côté serveur, dans cet ordre, sur ce que le serveur reçoit — et l'empreinte
     * est calculée sur ce qui a été **écrit**, pas sur ce qui a été **reçu**.
     */
    async function deposer(fichier, version) {
        if (!fichier) return false;
        if (depotEnCours) return false;

        if (tailleMaxAnnoncee !== null && fichier.size > tailleMaxAnnoncee) {
            // Courtoisie, jamais barrière : on évite d'envoyer ce que le serveur
            // refusera au premier des huit contrôles. La borne est celle qu'il a
            // annoncée — jamais une constante recopiée ici.
            if (window.showToast) {
                window.showToast("Ce fichier dépasse la taille acceptée (" +
                    tailleLisible(tailleMaxAnnoncee) + ").", "error");
            }
            return false;
        }

        depotEnCours = true;
        rafraichir();
        try {
            // Le fichier part TEL QUEL, en `multipart/form-data` : c'est ce que
            // la route attend, et cela évite d'enfler un envoi de 25 Mio d'un
            // tiers en le passant par base64.
            await Api.deposerPiece(entiteType, entiteId, fichier, undefined, version);
            if (window.showToast) {
                window.showToast("Fichier déposé. Il sera téléchargeable une fois l'analyse " +
                    "antivirale terminée.", "success");
            }
            depotEnCours = false;
            await charger();
            return true;
        } catch (e) {
            depotEnCours = false;
            if (window.showToast) window.showToast(messageDErreur(e), "error");
            rafraichir();
            return false;
        }
    }

    /* =====================================================================
       LA VERSION QUI FAIT FOI (action D1)
    ===================================================================== */

    /**
     * Désigne une pièce comme celle qui fait foi.
     *
     * ⚠️ **Aucune confirmation n'est demandée, et c'est délibéré** : le geste ne
     * détruit rien. L'ancienne version passe à l'historique, reste dans la liste
     * et reste téléchargeable — c'est même la raison d'être du lot. Une boîte de
     * dialogue apprendrait à cliquer « oui » sans lire, ce qui coûte cher le
     * jour où l'on en pose une devant un geste qui, lui, détruit.
     *
     * ⚠️ **Ce qui change AUSSI, et que l'écran doit dire** : sur une fiche
     * document, la version de la fiche devient celle de la pièce. On le dit dans
     * le message de succès plutôt que dans un avertissement préalable — c'est
     * l'effet voulu, pas un risque.
     */
    async function designer(pieceId) {
        if (designationEnCours) return false;
        const piece = liste.find(p => String(p.id) === String(pieceId));
        if (piece) {
            const etat = etatLisible(piece);
            if (!etat.delivrable) {
                if (window.showToast) window.showToast(etat.explication, "error");
                return false;
            }
        }
        designationEnCours = true;
        rafraichir();
        try {
            const promue = await Api.marquerPieceEnVigueur(entiteType, entiteId, pieceId);
            designationEnCours = false;
            if (window.showToast) {
                const v = promue && promue.version_piece;
                window.showToast(
                    v ? "Cette pièce fait désormais foi ; la fiche porte la version " + v + "."
                      : "Cette pièce fait désormais foi. Elle ne porte aucun numéro de " +
                        "version : la fiche n'en annonce donc plus.",
                    "success");
            }
            await charger();
            return true;
        } catch (e) {
            designationEnCours = false;
            if (window.showToast) window.showToast(messageDErreur(e), "error");
            rafraichir();
            return false;
        }
    }

    /* =====================================================================
       INTÉGRITÉ — le fichier est-il encore celui qu'on a empreinté ?
    ===================================================================== */

    /**
     * Demande au serveur de relire le fichier et de le comparer à son empreinte.
     *
     * ⚠️ **Le message de succès ne dit pas « intégrité garantie »**, et c'est
     * délibéré : ce que le rapprochement établit, c'est que les octets n'ont pas
     * changé depuis le dépôt. Qui peut écrire dans le magasin peut aussi mettre
     * l'empreinte à jour en base — le dispositif attrape la corruption, la
     * restauration partielle et la substitution faite hors de l'application, pas
     * un adversaire qui tient les deux. Promettre plus serait la fausse assurance
     * que le §17.5 interdit.
     */
    async function verifierIntegrite(pieceId) {
        if (verificationsEnCours[pieceId]) return false;
        verificationsEnCours[pieceId] = true;
        rafraichir();
        try {
            const verdict = await Api.verifierIntegritePiece(entiteType, entiteId, pieceId);
            delete verificationsEnCours[pieceId];
            verdictsDemandes[pieceId] = verdict;
            if (window.showToast) {
                const lu = INTEGRITE[verdict && verdict.verdict];
                if (verdict && verdict.verdict === "conforme") {
                    window.showToast("Le fichier correspond à l'empreinte enregistrée à son " +
                        "dépôt.", "success");
                } else {
                    window.showToast(lu ? lu.explication
                        : "Verdict d'intégrité inattendu : " + String(verdict && verdict.verdict),
                        "error");
                }
            }
            rafraichir();
            return true;
        } catch (e) {
            delete verificationsEnCours[pieceId];
            if (window.showToast) window.showToast(messageDErreur(e), "error");
            rafraichir();
            return false;
        }
    }

    /* =====================================================================
       RENDU
    ===================================================================== */

    /**
     * Le conteneur que la fiche pose dans son balisage. Vide : c'est `monter()`
     * qui le remplit, après le rendu de la fiche.
     */
    function hoteHtml() {
        return '<div class="dashboard-card" id="' + HOTE + '" style="max-width:900px; margin-top:1.5rem;"></div>';
    }

    function rafraichir() {
        const hote = document.getElementById(HOTE);
        if (!hote) return;
        if (!piecesOffertes) {
            // Ni titre, ni bandeau, ni bouton : la fiche se lit comme si la
            // fonction n'existait pas — ce qui est le cas sur ce serveur.
            hote.innerHTML = "";
            hote.hidden = true;
            return;
        }
        hote.hidden = false;
        hote.innerHTML =
            styles() +
            '<div class="ref-actions-head">' +
            "<strong>Pièces jointes " +
            (typeof Help !== "undefined" ? Help.tip(
                "Fichiers rattachés à cet enregistrement — preuves d'audit, rapports, " +
                "captures. Chaque dépôt est contrôlé (taille, quota, extension, " +
                "concordance du contenu avec l'extension annoncée), enregistré avec son " +
                "empreinte SHA-256, puis analysé par un antivirus. Un fichier n'est " +
                "téléchargeable qu'après cette analyse. Les fichiers ne sont jamais " +
                "servis directement par le serveur web : ils ne sortent que par " +
                "l'application, et chaque extraction est journalisée.") : "") +
            "</strong>" +
            '<span style="font-size:0.8rem; color:var(--text-muted);">' +
            (liste.length ? esc(liste.length) + " fichier(s)" : "") + "</span>" +
            "</div>" +
            corpsHtml() +
            depotHtml() +
            // ⚠️ `PLAN_SERVEUR` §1.6, et le §17.5 : un garde-fou ne se voit pas
            // prêter plus de portée qu'il n'en a. La phrase est dans l'interface
            // parce que c'est là qu'on croit à la promesse.
            '<p class="pj-avertissement">Les fichiers déposés sont analysés par un antivirus ' +
            "et leur empreinte SHA-256 est conservée. <strong>Aucun dispositif ne garantit " +
            "l'absence de logiciel malveillant</strong> : cette chaîne est une défense en " +
            "profondeur, pas une promesse. Ouvrez un fichier reçu avec les mêmes précautions " +
            "qu'une pièce jointe de courriel.</p>";
        brancher();
    }

    function depotHtml() {
        if (erreurChargement) return "";     // rien à déposer sur une liste qu'on n'a pas lue
        const borne = tailleMaxAnnoncee !== null
            ? ' <span style="font-size:0.78rem; color:var(--text-muted);">(jusqu\'à ' +
              esc(tailleLisible(tailleMaxAnnoncee)) + ")</span>"
            : "";
        // Le numéro de version se saisit AU MOMENT DU DÉPÔT, avec le fichier
        // qu'il désigne. C'est tout l'objet du lot : « 2.1 » frappé dans un champ
        // voisin pouvait surmonter le PDF de la 1.4 sans que rien ne le voie.
        const version = (entiteType === ENTITE_DOCUMENTS)
            ? '<input type="text" id="pjVersion" class="pj-version" maxlength="60" ' +
              'placeholder="Version (ex. 1.0)" aria-label="Numéro de version du fichier">'
            : "";
        return '<div class="pj-depot">' +
            '<input type="file" id="pjFichier" aria-label="Fichier à déposer">' +
            version +
            '<button type="button" id="pjDeposerBtn"' + (depotEnCours ? " disabled" : "") + ">" +
            (depotEnCours ? "Dépôt en cours…" : "Déposer") + "</button>" + borne +
            "</div>";
    }

    /**
     * Branche les gestes.
     *
     * **Aucun gestionnaire en ligne** : la politique de sécurité de contenu du
     * vhost livré (`script-src 'self'`, sans `unsafe-inline`) les rend inertes,
     * en silence — c'est le constat M-6 de la porte S2, qui avait livré une
     * interface morte. On branche après rendu, et **aucune donnée ne voyage dans
     * un attribut de gestionnaire**.
     */
    function brancher() {
        document.querySelectorAll(".pj-telecharger").forEach(bouton => {
            bouton.addEventListener("click", () => {
                // Relu dans le DOM au moment du clic, jamais capturé.
                telecharger(bouton.dataset.piece);
            });
        });
        const deposerBtn = document.getElementById("pjDeposerBtn");
        if (deposerBtn) deposerBtn.addEventListener("click", () => {
            const champ = document.getElementById("pjFichier");
            const fichier = (champ && champ.files && champ.files[0]) || null;
            if (!fichier) {
                if (window.showToast) window.showToast("Choisissez d'abord un fichier.", "info");
                return;
            }
            const champVersion = document.getElementById("pjVersion");
            deposer(fichier, champVersion ? champVersion.value.trim() : undefined);
        });
        document.querySelectorAll(".pj-designer").forEach(bouton => {
            // Relu dans le DOM au moment du clic, jamais capturé (`CLAUDE.md` §3).
            bouton.addEventListener("click", () => designer(bouton.dataset.piece));
        });
        document.querySelectorAll(".pj-verifier").forEach(bouton => {
            bouton.addEventListener("click", () => verifierIntegrite(bouton.dataset.piece));
        });
        document.querySelectorAll(".pj-empreinte-bascule").forEach(bouton => {
            bouton.addEventListener("click", () => {
                const id = bouton.dataset.piece;
                if (empreintesDepliees[id]) delete empreintesDepliees[id];
                else empreintesDepliees[id] = true;
                rafraichir();
            });
        });
        // Les droits s'appliquent au balisage qui vient d'apparaître : le panneau
        // se dessine APRÈS la navigation, donc après le passage de `js/app.js`.
        // L'observateur de vue le rattrape, mais seulement s'il est armé — on ne
        // dépend pas de lui.
        if (window.appliquerDroits) {
            try { window.appliquerDroits(location.hash.replace(/^#/, "")); }
            catch (e) { /* un filet d'affichage ne casse pas le panneau */ }
        }
    }

    /**
     * Monte le panneau sur un enregistrement. Appelée par la fiche, après son
     * `app.innerHTML = …`.
     */
    function monter(type, id, options) {
        // ⚠️ **Un garde-fou que rien n'appelle est un commentaire** (`CONVENTIONS.md`
        // §18.4). `verifierVocabulaire` est donc appelée ici, une fois, plutôt que
        // laissée à la disposition de qui y penserait.
        if (!vocabulaireVerifie) { vocabulaireVerifie = true; verifierVocabulaire(); }
        entiteType = String(type || "");
        entiteId = String(id || "");
        liste = [];
        erreurChargement = null;
        depotEnCours = false;
        designationEnCours = false;
        verdictsDemandes = {};
        empreintesDepliees = {};
        verificationsEnCours = {};
        auChargement = (options && typeof options.auChargement === "function")
            ? options.auChargement : null;
        if (!document.getElementById(HOTE)) return;
        rafraichir();
        // On ne redemande pas à un serveur qui a déjà dit qu'il n'a pas la route.
        if (piecesOffertes) charger();
    }

    /**
     * Le vocabulaire d'ici et celui d'`api.js` se font face.
     *
     * Un garde-fou muet est un commentaire (`CONVENTIONS.md` §18.4) : l'écart est
     * **dit**, au journal technique, le jour où il apparaît. Il ne masque rien et
     * ne bloque rien — un état inconnu est déjà traité du bon côté par
     * `etatLisible()`.
     */
    function verifierVocabulaire() {
        if (typeof Api === "undefined" || !Api.CONTRAT_PIECES) return [];
        const declares = Api.CONTRAT_PIECES.etats;
        const connus = Object.keys(ETATS);
        const ecarts = []
            .concat(declares.filter(e => connus.indexOf(e) === -1).map(e => "sans libellé : " + e))
            .concat(connus.filter(e => declares.indexOf(e) === -1).map(e => "inconnu du contrat : " + e));
        // ── ET LE SENS INVERSE : le seul état délivrable est bien celui-là ──
        //
        // Un garde-fou se vérifie dans les deux sens (`CONVENTIONS.md` §20.2).
        // Sans cette ligne, `etatDelivrable` serait une constante que rien ne
        // lit — c'est-à-dire un commentaire (§18.4), et le genre de déclaration
        // qui survit à ce qu'elle décrivait.
        const delivrables = connus.filter(e => ETATS[e].delivrable);
        if (delivrables.length !== 1 || delivrables[0] !== Api.CONTRAT_PIECES.etatDelivrable) {
            ecarts.push("états délivrables : [" + delivrables.join(", ") +
                "] alors que le contrat n'en déclare qu'un — " + Api.CONTRAT_PIECES.etatDelivrable);
        }
        if (ecarts.length) {
            console.info("Pièces jointes — vocabulaire d'états divergent :", ecarts.join(" ; "));
        }
        return ecarts;
    }

    return {
        hoteHtml, monter,
        // Exposés pour le banc d'essai : la garde d'export se vérifie en appelant
        // la fonction, jamais en constatant qu'un bouton est grisé — c'est
        // exactement la distinction que le constat Q-89 a coûtée.
        telecharger, deposer, designer, enVigueur, verifierIntegrite,
        // Purement fonctionnels : ils n'émettent rien et se prouvent sans réseau.
        etatLisible, integriteLisible, normaliserListe, verifierVocabulaire,
        contrat: Object.freeze({
            hote: HOTE,
            etats: Object.keys(ETATS),
            /** Les quatre verdicts de `ck_pieces_jointes_integrite` (migration 020). */
            integrite: Object.keys(INTEGRITE),
            /** L'entité sur laquelle l'écran offre « faire foi » — voir ENTITE_DOCUMENTS. */
            entiteVersionnee: ENTITE_DOCUMENTS
        })
    };
})();

window.PiecesModule = PiecesModule;
