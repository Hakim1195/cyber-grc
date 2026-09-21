/* =====================================================================
   NOTIFICATION AUX AUTORITÉS — le formulaire PRÉ-REMPLI  (L20, action 20.2)

   ⚠️ **LE PRODUIT NE TRANSMET RIEN.** C'est le critère de l'action, écrit
   au `docs/PLAN_PRODUIT.md` et repris mot pour mot par 20.3 et 20.4 : *il
   prépare, l'humain envoie.* Aucun appel réseau vers une autorité n'existe
   dans ce fichier, et il n'y en aura pas : transmettre engagerait la
   responsabilité de l'exploitant sur un texte que personne n'aurait relu.

   ── ⚠️ CE QUI FAIT LA VALEUR DE CET ÉCRAN : IL DIT SES MANQUES ────────

   Un formulaire pré-rempli à moitié est **plus dangereux qu'un formulaire
   vide**. Vide, on le remplit ; à moitié rempli, on l'envoie — et l'on
   notifie une autorité avec des rubriques absentes, dans le délai le plus
   contraint du droit français.

   Chaque rubrique que le produit ne sait pas remplir est donc affichée
   **en creux, nommée, avec ce que l'autorité attend à cet endroit**, et le
   document porte en tête le compte de ce qui reste à faire. C'est la même
   règle que le registre DORA de l'action 21.1 : *une ligne qui dit ce qui
   lui manque est un plan de travail ; une ligne muette est un piège.*

   ── ⚠️ ET LE PRODUIT NE CONNAÎT PAS SES PROPRES COORDONNÉES ───────────

   Le lot L9 rend la raison sociale et le logo d'une filiale, mais **pas ses
   coordonnées** : c'est le constat **Q-160**, ouvert et assumé. Les
   rubriques « adresse », « SIREN », « contact » sont donc en creux, et le
   formulaire DIT pourquoi au lieu de laisser croire à un oubli de saisie.

   ── Les deux régimes, et leur base ────────────────────────────────────

   · **ANSSI / NIS2** — directive (UE) 2022/2555, article 23 : alerte précoce
     à 24 h, notification à 72 h, rapport final à un mois.
   · **CNIL / RGPD** — règlement (UE) 2016/679, article 33 : notification
     dans les 72 heures, et l'article 33 §1 exige de MOTIVER tout retard.

   ⚠️ Les rubriques reprennent ce que les deux textes énumèrent. Elles ne
   reproduisent **aucun formulaire officiel** : les téléservices des deux
   autorités changent sans préavis, et recopier leur maquette ferait vieillir
   le produit en silence. Ce qui est stable, c'est le contenu que le texte
   exige — c'est donc lui qu'on prépare.
   ===================================================================== */

window.NotificationModule = (function () {

    /** Ce que le produit ne sait pas remplir : affiché en creux, et expliqué. */
    const MANQUE = null;

    /* -----------------------------------------------------------------
       Les deux régimes
    ----------------------------------------------------------------- */

    /**
     * Les rubriques d'une notification, régime par régime.
     *
     * ── Une liste écrite à la main, et c'est le bon outil ──────────────
     *
     * `CLAUDE.md` §3 tranche par le résultat de l'omission. Une rubrique
     * oubliée ici **ne disparaît pas en silence** : elle manque au document
     * qu'un humain relit avant d'envoyer, et c'est précisément le geste que
     * cet écran organise. L'omission échoue donc du côté qui montre.
     *
     * ⚠️ Et elle ne PEUT pas se découvrir : ce que l'article 23 de NIS2
     * exige n'est écrit nulle part dans le schéma — c'est du droit, pas une
     * colonne.
     */
    function rubriques(regime, inc) {
        const communes = [
            ["Entité concernée", () => (typeof Session !== "undefined" ? Session.libelleFiliale() : ""),
             "La raison sociale de l'entité qui notifie."],
            ["Adresse et numéro SIREN", () => MANQUE,
             "Le produit ne détient pas les coordonnées de la filiale : aucune route ne les rend (constat Q-160). À reprendre de votre Kbis."],
            ["Personne à contacter", () => MANQUE,
             "Nom, fonction, téléphone et courriel de la personne que l'autorité rappellera. Le produit ne les stocke pas."],
            ["Intitulé de l'incident", () => inc.titre, "Une phrase qui identifie l'incident."],
            ["Date et heure de détection", () => inc.date_detection,
             "Le moment où vous avez eu connaissance de l'incident. C'est lui qui fait courir les délais."],
            ["Nature de l'incident", () => inc.type, "La catégorie de l'évènement."],
            ["Gravité constatée", () => inc.gravite, "L'appréciation portée par l'entité."],
            ["Description des faits", () => inc.description,
             "Ce qui s'est passé, dans l'ordre, avec ce qui est établi et ce qui ne l'est pas."],
            ["Mesures déjà prises", () => inc.actions_immediates,
             "Ce que l'entité a fait depuis la détection — confinement, restauration, dépôt de plainte."],
        ];

        if (regime === "anssi") {
            return communes.concat([
                ["Cause suspectée", () => inc.cause_racine,
                 "L'hypothèse retenue à ce stade. « Non déterminée » est une réponse recevable dans une alerte précoce."],
                ["Caractère transfrontalier", () => MANQUE,
                 "L'incident touche-t-il d'autres États membres ? L'article 23 en fait une mention distincte, et le produit ne sait pas y répondre à votre place."],
                ["Services essentiels affectés", () => MANQUE,
                 "Les services que la directive vous désigne comme essentiels ou importants. À reprendre de votre analyse d'impact."],
                ["Nombre d'utilisateurs affectés", () => MANQUE,
                 "Un ordre de grandeur suffit à l'alerte précoce ; le rapport final l'affine."],
                ["Date de résolution", () => inc.date_resolution,
                 "À renseigner dans le rapport final, à un mois."],
            ]);
        }

        return communes.concat([
            ["Catégories de données concernées", () => MANQUE,
             "Identité, coordonnées, données de connexion, données sensibles… L'article 33 §3 a) les demande explicitement."],
            ["Catégories et nombre de personnes concernées", () => MANQUE,
             "Un ordre de grandeur est recevable, et l'article 33 §3 a) l'admet expressément — l'absence de chiffre, non."],
            ["Nombre d'enregistrements concernés", () => MANQUE,
             "Même règle : approximatif, mais présent."],
            ["Coordonnées du délégué à la protection des données", () => MANQUE,
             "Article 33 §3 b). Le produit détient un registre de traitements, pas l'identité du DPO."],
            ["Conséquences probables", () => MANQUE,
             "Article 33 §3 c) : ce que la violation risque de produire pour les personnes."],
            ["Mesures envisagées pour limiter les effets", () => inc.actions_immediates,
             "Article 33 §3 d). Reprenez et complétez les mesures déjà prises."],
            ["Motif du retard, si au-delà de 72 heures", () => MANQUE,
             "L'article 33 §1 EXIGE de motiver tout dépassement. Ne pas le faire est un manquement distinct de la violation elle-même."],
        ]);
    }

    const TITRES = Object.freeze({
        anssi: "Notification d'incident — ANSSI (directive NIS2, article 23)",
        cnil: "Notification de violation de données — CNIL (RGPD, article 33)",
    });

    const DELAIS = Object.freeze({
        anssi: "Alerte précoce sous 24 heures, notification sous 72 heures, rapport final sous un mois, à compter de la connaissance de l'incident.",
        cnil: "Dans les 72 heures après en avoir pris connaissance. Tout dépassement doit être MOTIVÉ dans la notification elle-même (article 33 §1).",
    });

    /* -----------------------------------------------------------------
       Rendu
    ----------------------------------------------------------------- */

    /** Régime courant — en mémoire : un formulaire n'est pas une préférence. */
    let regime = "anssi";

    function ligneHtml(nom, valeur, attendu) {
        const vide = valeur === MANQUE || String(valeur || "").trim() === "";
        return `<tr class="${vide ? "notif-manque" : ""}">
            <th scope="row">${escapeHtml(nom)}</th>
            <td>${vide
                ? `<em>À COMPLÉTER</em><p class="notif-attendu">${escapeHtml(attendu)}</p>`
                : escapeHtml(String(valeur))}</td>
        </tr>`;
    }

    function render(id) {
        const app = document.getElementById("app");
        const inc = (DataStore.getIncidents() || []).find(i => i.id === id);

        if (!inc) {
            // ⚠️ On DIT ce qui manque, et on ne suppose pas une suppression :
            // un identifiant qui ne répond pas peut aussi venir d'un périmètre
            // qui ne le couvre pas.
            app.innerHTML = `<section class="page"><div class="empty-state">
                <h3>Cet incident est introuvable</h3>
                <p>Il a pu être supprimé, ou il appartient à une filiale que votre périmètre
                ne couvre pas. Aucun formulaire ne peut être préparé sans lui.</p>
                <a href="#/incidents" class="btn-secondary">Revenir au registre des incidents</a>
            </div></section>`;
            return;
        }

        const lignes = rubriques(regime, inc);
        const manquantes = lignes.filter(([, lire]) => {
            const v = lire();
            return v === MANQUE || String(v || "").trim() === "";
        }).length;

        app.innerHTML = `
            <section class="page">
                <div class="dashboard-header no-print">
                    <div>
                        <h1>Préparer une notification</h1>
                        <p class="sous-titre">
                            Incident « ${escapeHtml(inc.titre || "")} »
                            ${Help.tip("Ce document est une PRÉPARATION : le logiciel ne transmet rien à aucune autorité, et il n'en a pas le droit. Vous le relisez, vous le complétez, et vous le déposez vous-même sur le téléservice de l'autorité concernée.")}
                        </p>
                    </div>
                    <div style="display:flex; gap:8px; align-items:flex-start;">
                        <div class="bascule-vue" role="group" aria-label="Régime de notification">
                            <button type="button" id="regimeAnssi" class="${regime === "anssi" ? "actif" : ""}"
                                    aria-pressed="${regime === "anssi"}">ANSSI</button>
                            <button type="button" id="regimeCnil" class="${regime === "cnil" ? "actif" : ""}"
                                    aria-pressed="${regime === "cnil"}">CNIL</button>
                        </div>
                        <button type="button" id="imprimerNotif" style="background:var(--primary);">Imprimer</button>
                    </div>
                </div>

                <article class="notif-document">
                    <header class="notif-entete">
                        <h2>${escapeHtml(TITRES[regime])}</h2>
                        <p class="notif-delai"><strong>Délai applicable.</strong> ${escapeHtml(DELAIS[regime])}</p>
                    </header>

                    <p class="notif-avertissement">
                        <strong>Ce document est une préparation, et non une notification.</strong>
                        Il n'a été transmis à personne : le logiciel ne communique avec aucune
                        autorité. Relisez chaque rubrique, complétez celles qui sont en creux,
                        puis déposez le document vous-même sur le téléservice de l'autorité.
                    </p>

                    ${manquantes > 0
                        ? `<p class="notif-compte">${manquantes} rubrique${manquantes > 1 ? "s" : ""}
                           reste${manquantes > 1 ? "nt" : ""} à compléter avant l'envoi. Un formulaire
                           envoyé à moitié rempli est plus dommageable qu'un formulaire préparé en retard.</p>`
                        : `<p class="notif-compte notif-complet">Toutes les rubriques que le produit
                           sait remplir le sont. Relisez-les : leur exactitude reste la vôtre.</p>`}

                    <table class="data-table notif-table">
                        <tbody>${lignes.map(([nom, lire, attendu]) => ligneHtml(nom, lire(), attendu)).join("")}</tbody>
                    </table>

                    <footer class="notif-pied">
                        <p>Préparé le ${escapeHtml(new Date().toISOString().slice(0, 10))}
                        depuis l'incident ${escapeHtml(inc.id)}.
                        Signature et qualité du déclarant : ______________________________</p>
                    </footer>
                </article>

                <p class="no-print" style="margin-top:1rem;">
                    <a href="#/incidents/${escapeHtml(inc.id)}">Revenir à la fiche de l'incident</a>
                </p>
            </section>`;

        const ba = document.getElementById("regimeAnssi");
        if (ba) ba.addEventListener("click", () => { regime = "anssi"; render(id); });
        const bc = document.getElementById("regimeCnil");
        if (bc) bc.addEventListener("click", () => { regime = "cnil"; render(id); });
        const bi = document.getElementById("imprimerNotif");
        if (bi) bi.addEventListener("click", () => window.print());
    }

    return { render };
})();
