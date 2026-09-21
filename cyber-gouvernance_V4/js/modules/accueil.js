/* =====================================================================
   ACCUEIL — « ce qui m'attend aujourd'hui »  (lot L17, action A4)

   ⚠️ **CE N'EST PAS UN SECOND TABLEAU DE BORD.** Le tableau de bord répond
   à « où en est le groupe ? » — des taux, des courbes, une vue d'ensemble.
   Cet écran-ci répond à **« qu'est-ce que je dois faire, moi, maintenant ? »**,
   et c'est une autre question : on n'y trouve aucun indicateur, seulement des
   lignes sur lesquelles cliquer.

   ── ⚠️ « PAR RÔLE » SE DÉRIVE DES DROITS, IL NE SE RÉCITE PAS ─────────

   Le `docs/PLAN_ACHEVEMENT.md` nomme quatre rôles — RSSI, contributeur,
   auditeur, direction. La pente naturelle était d'écrire ces quatre noms et
   de brancher un écran sur chacun. Elle est refusée, pour la raison du
   `CLAUDE.md` §3 : **le produit porte NEUF profils de socle**, un client peut
   en composer d'autres, et un profil absent de la liste retomberait sur un
   écran par défaut — c'est-à-dire réussirait en silence en montrant à un
   auditeur ce qu'on destinait à un contributeur.

   Ce qui distingue réellement deux rôles est ce qu'ils PEUVENT VOIR, et le
   serveur l'a déjà résolu : `DataStore` ne contient que ce que la session a
   le droit de lire (`entitesLisibles` retire le reste **avant** l'envoi). Un
   bloc vide ici est donc un bloc sans travail, jamais un bloc caché — et
   c'est pour cela qu'aucune correspondance « type d'échéance → domaine »
   n'est écrite dans ce fichier : elle serait une seconde source de vérité
   sur les droits, et la seconde se tromperait un jour.

   ── ⚠️ CE QUI EST « À MOI » SE DÉCIDE SUR LE NOM AFFICHÉ ──────────────

   Les entités stockent le responsable **en texte** — c'est l'arbitrage de
   l'annuaire du chantier Personnel (`CLAUDE.md` §7 : « annuaire +
   autocomplétion, pas de clé étrangère »), et il n'a pas bougé. Le
   rapprochement se fait donc par comparaison de libellés, insensible à la
   casse et aux accents.

   ⚠️ **Et il est ANNONCÉ, jamais silencieux** : quand la session ne porte
   aucun nom affichable, le bloc « qui m'est attribué » ne se vide pas — il
   DIT qu'il ne peut pas rapprocher. Un bloc vide sans explication apprend à
   ne plus croire ce qu'on montre (classe Q-201 / Q-207).
   ===================================================================== */

window.AccueilModule = (function () {

    /** Combien de lignes on montre par bloc avant de renvoyer à l'écran dédié. */
    const PAR_BLOC = 6;

    /* -----------------------------------------------------------------
       Rapprochement de noms
    ----------------------------------------------------------------- */

    /** Replie accents et casse : « Hélène MARTIN » et « helene martin » se rejoignent. */
    function pliage(texte) {
        return String(texte || "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    /** Le nom de la personne connectée, tel que l'annuaire l'écrirait. */
    function moi() {
        return pliage(typeof Session !== "undefined" ? Session.libelleUtilisateur() : "");
    }

    /**
     * Cette échéance me désigne-t-elle ?
     *
     * ⚠️ On regarde le **sous-titre**, qui porte « Resp. Untel » quand le
     * service des échéances l'a trouvé. Aller rechercher l'entité dans
     * `DataStore` pour lire son champ « responsable » aurait été plus direct
     * — et aurait exigé une correspondance « type → getteur », c'est-à-dire
     * la liste que l'entête refuse.
     */
    function mienne(item, nom) {
        if (!nom) return false;
        return pliage(item.sousTitre).indexOf(nom) !== -1;
    }

    /* -----------------------------------------------------------------
       Rendu
    ----------------------------------------------------------------- */

    /** Une ligne cliquable. L'identifiant vit dans l'attribut, jamais en fermeture. */
    function ligneHtml(item) {
        const retard = item.jours !== null && item.jours < 0;
        const quand = item.jours === null
            ? "sans date"
            : retard
                ? `en retard de ${Math.abs(item.jours)} j`
                : item.jours === 0
                    ? "aujourd'hui"
                    : `dans ${item.jours} j`;
        return `<tr class="clickable-row" data-route="${escapeHtml(item.route || "")}">
            <td style="font-size: var(--text-sm); color:var(--text-muted); white-space:nowrap;">${escapeHtml(item.typeLabel || "")}</td>
            <td><strong>${escapeHtml(item.titre || "(sans titre)")}</strong>${
                item.sousTitre ? `<br><span class="txt-muted-sm">${escapeHtml(item.sousTitre)}</span>` : ""
            }</td>
            <td class="t-droite" style="white-space:nowrap;">${escapeHtml(item.date ? I18n.date(item.date) : "—")}</td>
            <td style="white-space:nowrap;"><span class="status ${retard ? "status-non-conforme" : "status-partiellement-conforme"}">${escapeHtml(quand)}</span></td>
        </tr>`;
    }

    /**
     * Un bloc, avec son état vide EXPLIQUÉ.
     *
     * ⚠️ `vide` n'est pas un libellé décoratif : chaque bloc doit dire
     * **pourquoi** il est vide, et les trois raisons ne sont pas la même
     * chose — « rien n'est en retard » est une bonne nouvelle, « je ne sais
     * pas à qui c'est » est une limite du produit.
     */
    function blocHtml(titre, aide, items, vide, lien) {
        const montres = items.slice(0, PAR_BLOC);
        const reste = items.length - montres.length;
        return `<section class="dashboard-card" style="margin-bottom:1.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap;">
                <h2 style="font-size: var(--text-lg); margin:0;">${escapeHtml(titre)} ${aide}</h2>
                ${items.length ? `<span class="txt-muted-sm">${items.length} au total</span>` : ""}
            </div>
            ${montres.length === 0
                ? `<p style="color:var(--text-muted); margin:.75rem 0 0;">${vide}</p>`
                : `<table class="data-table" style="margin-top:.75rem;">
                       <tbody>${montres.map(ligneHtml).join("")}</tbody>
                   </table>
                   ${reste > 0
                        ? `<p style="margin:.5rem 0 0;"><a href="${escapeHtml(lien)}" class="txt-sm">Voir les ${items.length} — ${reste} de plus</a></p>`
                        : ""}`}
        </section>`;
    }

    /**
     * Ce que cette session peut faire, en une phrase.
     *
     * ⚠️ C'est la moitié « par rôle » de l'écran, et elle est **dérivée**,
     * jamais récitée : le niveau et les domaines viennent du serveur. Un
     * écran qui annoncerait « profil RSSI » en dur mentirait le jour où
     * l'exploitant compose un profil de plus.
     */
    function profilHtml() {
        if (typeof Droits === "undefined") return "";
        const niveau = Droits.niveau() || "";
        const domaines = Droits.domaines() || [];
        if (!niveau && domaines.length === 0) return "";
        const ecrit = domaines.filter(d => Droits.peutEcrire(d));
        return `<p style="color:var(--text-muted); margin-top:5px; font-size: var(--text-sm);">
            ${escapeHtml(
                Droits.lectureSeule()
                    ? `Accès en lecture sur ${domaines.length} domaine${domaines.length > 1 ? "s" : ""}.`
                    : `Vous pouvez saisir dans ${ecrit.length} domaine${ecrit.length > 1 ? "s" : ""} sur ${domaines.length}.`
            )}
            ${Droits.peutExporter() ? "Extraction autorisée." : "Extraction non autorisée."}
        </p>`;
    }

    function render() {
        const app = document.getElementById("app");

        // ⚠️ Le service est en LECTURE SEULE et dérive des seules dates
        // existantes : il n'y a donc rien à rafraîchir, et rien à écrire.
        const toutes = (typeof Echeances !== "undefined" && Echeances.collect)
            ? Echeances.collect()
            : [];

        const datees = toutes.filter(i => i.jours !== null);
        const enRetard = datees.filter(i => i.jours < 0).sort((a, b) => a.jours - b.jours);
        const semaine = datees.filter(i => i.jours >= 0 && i.jours <= 7).sort((a, b) => a.jours - b.jours);
        const nom = moi();
        const miennes = datees.filter(i => mienne(i, nom)).sort((a, b) => a.jours - b.jours);

        const filiale = typeof Session !== "undefined" ? Session.libelleFiliale() : "";
        const utilisateur = typeof Session !== "undefined" ? Session.libelleUtilisateur() : "";

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header">
                    <div>
                        <h1>${escapeHtml(utilisateur ? "Bonjour, " + utilisateur : "Ce qui m'attend")}</h1>
                        <p class="sous-titre">
                            ${escapeHtml(filiale ? "Périmètre : " + filiale + "." : "")}
                            ${Help.tip("Cet écran ne montre pas d'indicateurs : il montre ce sur quoi vous devez agir, dérivé des seules dates déjà saisies dans le produit. Il ne contient donc rien que vous n'ayez vous-même enregistré, et rien que votre profil n'ait le droit de lire.")}
                        </p>
                        ${profilHtml()}
                    </div>
                    <a href="#/dashboard" class="btn-secondary" id="versDashboard" style="align-self:flex-start;">Tableau de bord</a>
                </div>

                ${blocHtml(
                    "En retard",
                    Help.tip("Une obligation datée dont la date est passée : action du plan, revue documentaire, déclaration réglementaire, contrôle périodique, échéance contractuelle. Le produit ne les invente pas — il les dérive des dates que vous avez saisies."),
                    enRetard,
                    "Rien n'est en retard dans votre périmètre. C'est une bonne nouvelle, pas un écran vide.",
                    "#/echeances",
                )}

                ${blocHtml(
                    "Cette semaine",
                    Help.tip("Les sept prochains jours, aujourd'hui compris."),
                    semaine,
                    "Rien n'échoit dans les sept prochains jours.",
                    "#/echeances",
                )}

                ${blocHtml(
                    "Qui m'est attribué",
                    Help.tip("Les obligations dont vous êtes nommé responsable. Le rapprochement se fait sur le NOM affiché : le produit stocke les responsables en texte libre, avec l'annuaire en autocomplétion, et non par un lien vers votre compte."),
                    miennes,
                    nom
                        ? `Aucune obligation datée ne vous nomme comme responsable. Le rapprochement se fait sur le nom affiché (« ${escapeHtml(utilisateur)} ») : si vos fiches portent une autre orthographe, elles n'apparaîtront pas ici.`
                        : "Votre session ne porte aucun nom affichable, et le produit ne peut donc rapprocher aucune fiche de vous. Ce bloc est vide faute de pouvoir chercher, et non faute de travail.",
                    "#/echeances",
                )}
            </section>`;

        // ⚠️ Aucun gestionnaire en ligne : la CSP du vhost les bloque, et
        // l'application a été livrée un temps sans fonctionner pour cette
        // raison. On branche après rendu, et la route se lit dans l'attribut.
        app.querySelectorAll(".clickable-row").forEach(function (tr) {
            tr.addEventListener("click", function () {
                const route = tr.dataset.route || "";
                if (route) window.location.hash = route.replace(/^#/, "");
            });
        });
    }

    return { render };
})();
