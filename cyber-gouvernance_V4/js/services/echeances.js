/**
 * js/services/echeances.js — Agrégateur d'échéances (vue transversale, lecture seule).
 *
 * But : recenser en UN seul endroit toutes les obligations datées éparpillées dans les
 * modules (plan d'actions, MCO, revues documentaires, déclarations d'incidents, audits,
 * revues de direction, questionnaires fournisseurs, échéances contractuelles des tiers
 * et campagnes descendantes du Groupe), pour alimenter le module « Échéancier » et le
 * badge de la barre latérale.
 * Ne modifie AUCUNE donnée ; ne fait que lire le DataStore (API synchrone).
 *
 * Exposé sous `window.Echeances`. Dépendance : `window.DataStore` (chargé avant).
 * Les règles « en retard / proche » reproduisent celles déjà utilisées ailleurs
 * (PraMcoModule.isEnRetard pour le MCO, l'état de revue des documents, les délais NIS2/RGPD
 * des incidents) — ici centralisées et dérivées uniquement des dates (aucune donnée stockée).
 */
window.Echeances = (function () {
    "use strict";

    const DAY = 86400000;

    function today0() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // Parse une date ISO (yyyy-mm-dd) en Date locale à minuit ; null si invalide/absente.
    function parseDate(iso) {
        if (!iso) return null;
        const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
        return isNaN(d.getTime()) ? null : d;
    }

    // Nombre de jours entiers entre aujourd'hui et la date (négatif = passé). null si pas de date.
    function daysFromToday(iso) {
        const d = parseDate(iso);
        if (!d) return null;
        return Math.round((d - today0()) / DAY);
    }

    // Sérialise une Date en ISO local (évite le décalage de fuseau de toISOString).
    function toIsoLocal(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + day;
    }

    // Catégorie d'urgence à partir du nombre de jours restants.
    function bucketFor(jours) {
        if (jours === null || jours === undefined) return "indetermine";
        if (jours < 0) return "retard";
        if (jours === 0) return "aujourdhui";
        // ⚠️ Le seuil vient du RÉGLAGE, et sept est la valeur du catalogue du
        //    Groupe — recopiée ici comme repli, et confrontée au catalogue par
        //    `test/depot/reglages-catalogue-lus.test.mjs`. Une divergence ferait
        //    qu'un produit dont les réglages n'ont pas chargé se comporte
        //    autrement qu'un produit connecté, sans le dire.
        const seuil = (window.Reglages && Reglages.entier)
            ? Reglages.entier("echeances.seuil_urgent_jours", 7) : 7;
        if (jours <= seuil) return "semaine";
        if (jours <= 31) return "mois";
        return "avenir";
    }

    function norm(s) { return String(s == null ? "" : s).trim().toLowerCase(); }

    // Construit la liste normalisée et triée (chronologique ; sans date en fin) de toutes
    // les échéances du logiciel. Chaque item :
    //   { type, typeLabel, titre, sousTitre, date (ISO|""), jours (num|null), statut, route }
    function collect() {
        const items = [];
        const push = (o) => items.push(o);

        /* 1. Plan d'actions — échéance des actions non terminées. */
        (DataStore.getActions() || []).forEach(a => {
            if (!a || !a.echeance) return;
            if (norm(a.statut) === "terminée") return;
            push({
                type: "action", typeLabel: "Plan d'actions",
                titre: a.titre, sousTitre: a.responsable ? "Resp. " + a.responsable : (a.priorite || ""),
                date: a.echeance, jours: daysFromToday(a.echeance),
                statut: a.statut || "", route: "#/actions/" + a.id
            });
        });

        /* 2. Actions MCO — date programmée des actions non réalisées/annulées.
              (retard équivalent à PraMcoModule.isEnRetard : datePrevue passée & non close.) */
        (DataStore.getMcoActions() || []).forEach(m => {
            if (!m || !m.datePrevue) return;
            if (m.statut === "Réalisée" || m.statut === "Annulée") return;
            push({
                type: "mco", typeLabel: "Action MCO",
                titre: m.titre, sousTitre: m.responsable ? "Resp. " + m.responsable : (m.priorite || ""),
                date: m.datePrevue, jours: daysFromToday(m.datePrevue),
                statut: m.statut || "", route: "#/mco/" + m.id
            });
        });

        /* 3. Revues documentaires — date de prochaine revue, ou statut « à réviser »/« obsolète ». */
        (DataStore.getDocuments() || []).forEach(d => {
            if (!d) return;
            const flagged = norm(d.statut) === "à réviser" || norm(d.statut) === "obsolète";
            if (!d.date_revue && !flagged) return;
            push({
                type: "document", typeLabel: "Revue documentaire",
                titre: d.titre, sousTitre: (d.type || "document") + (d.version ? " · v" + d.version : ""),
                date: d.date_revue || "", jours: daysFromToday(d.date_revue),
                statut: d.statut || "", route: "#/documents/" + d.id
            });
        });

        /* 4. Déclarations d'incidents — obligation NIS2/RGPD à déclarer.
              Échéance = date de détection + 72 h (délai de notification). Détection inconnue → immédiat. */
        (DataStore.getIncidents() || []).forEach(i => {
            if (!i) return;
            const anssi = norm(i.declaration_anssi) === "à déclarer";
            const cnil = norm(i.declaration_cnil) === "à déclarer";
            if (!anssi && !cnil) return;
            const detDays = daysFromToday(i.date_detection);
            let jours, dateIso = "";
            if (detDays === null) {
                jours = 0; // détection non renseignée → à déclarer sans délai
            } else {
                jours = detDays + 3; // +72 h
                const det = parseDate(i.date_detection);
                const due = new Date(det.getTime()); due.setDate(due.getDate() + 3);
                dateIso = toIsoLocal(due);
            }
            const canaux = [];
            if (anssi) canaux.push("ANSSI/NIS2");
            if (cnil) canaux.push("CNIL/RGPD");
            push({
                type: "incident", typeLabel: "Déclaration incident",
                titre: i.titre, sousTitre: "À déclarer : " + canaux.join(", ") + " (72 h)",
                date: dateIso, jours: jours,
                statut: i.statut || "", route: "#/incidents/" + i.id
            });
        });

        /* 5. Audits — audits planifiés / en cours (non réalisés) avec une date cible. */
        (DataStore.getAudits() || []).forEach(a => {
            if (!a || !a.date) return;
            if (norm(a.statut) === "réalisé") return;
            const titre = a.ref ? (a.ref + (a.perimetre ? " — " + a.perimetre : "")) : (a.perimetre || "Audit interne");
            push({
                type: "audit", typeLabel: "Audit",
                titre: titre, sousTitre: a.auditeur ? "Auditeur : " + a.auditeur : (a.statut || ""),
                date: a.date, jours: daysFromToday(a.date),
                statut: a.statut || "", route: "#/audits/" + a.id
            });
        });

        /* 6. Revues de direction — uniquement celles à venir (une revue passée est tenue). */
        (DataStore.getRevues() || []).forEach(r => {
            if (!r || !r.date) return;
            const jours = daysFromToday(r.date);
            if (jours === null || jours < 0) return;
            push({
                type: "revue", typeLabel: "Revue de direction",
                titre: "Revue de direction", sousTitre: r.participants ? String(r.participants).slice(0, 80) : "Revue périodique du SMSI",
                date: r.date, jours: jours,
                statut: "", route: "#/audits"
            });
        });

        // Tri chronologique : dates connues d'abord (plus urgent en haut), sans date en fin.
        items.sort((a, b) => {
            if (a.jours === null && b.jours === null) return 0;
            if (a.jours === null) return 1;
            if (b.jours === null) return -1;
            return a.jours - b.jours;
        });

        /* 7. Questionnaires fournisseurs (lot L21, action 21.2) — la date de retour
              attendue d'un questionnaire ENVOYÉ et non encore reçu.

              ⚠️ Deux exclusions, et ce sont elles qui portent le sens :

               · un questionnaire REÇU n'est plus une obligation, même reçu en retard —
                 l'afficher enverrait relancer quelqu'un qui a déjà répondu ;
               · un BROUILLON (jamais envoyé) n'en est pas une non plus, même s'il porte
                 une échéance déjà passée : ce serait une alerte que l'utilisateur s'est
                 infligée à lui-même, et la première chose qu'on fait d'une alerte sans
                 objet est de cesser de la lire.

              C'est le même arbitrage que `f_etat_questionnaire()` côté serveur, dans le
              même ordre — et il n'est pas recopié : la fonction rend un ÉTAT, on ne lit
              ici que des DATES, comme les six sources ci-dessus. */
        // Une `Map` et non un objet nu : un identifiant vient de la base, et un tiers
        // nommé `__proto__` ne doit pas pouvoir toucher la chaîne de prototypes.
        // ⚠️ Et l'appel est DIRECT, comme les six sources ci-dessus : un garde
        // `typeof … === "function"` ferait de l'absence du getter un silence.
        const prestataires = DataStore.getPrestataires() || [];
        const societeDe = new Map(prestataires.filter(p => p && p.id).map(p => [p.id, p.societe || ""]));

        (DataStore.getQuestionnaires() || []).forEach(q => {
            if (!q || !q.echeance) return;
            if (q.recu_le) return;          // reçu : l'affaire est close
            if (!q.envoye_le) return;       // brouillon : pas encore une obligation
            const societe = societeDe.get(q.prestataire_id) || "";
            push({
                type: "questionnaire", typeLabel: "Questionnaire fournisseur",
                titre: q.intitule || ("Questionnaire " + (q.ref_id || "")),
                sousTitre: societe + (q.relance_le ? " · relancé le " + String(q.relance_le).slice(0, 10) : ""),
                date: q.echeance, jours: daysFromToday(q.echeance),
                statut: q.relance_le ? "Relancé" : "En attente de retour",
                route: "#/prestataires/" + q.prestataire_id
            });
        });

        /* 8. Échéances contractuelles des tiers (lot L21, action 21.3) — fin de contrat,
              revue de clauses, plan de sortie. Le critère d'acceptation de 21.3 dit
              exactement cela : « les échéances contractuelles alimentent l'échéancier
              existant », et non un écran à part — une obligation datée rangée ailleurs
              est invisible à qui consulte ses échéances.

              ⚠️ `evalue_le` N'EST PAS ici, et l'omission est délibérée : c'est la date de
              la DERNIÈRE évaluation, un fait passé. La ranger parmi les échéances
              inverserait son sens — « fait le 12 mars » deviendrait « à faire le
              12 mars ». Son vieillissement est déjà mesuré, et il pèse dans le score
              composite servi par `GET /api/tiers/etat`. */
        const DATES_CONTRAT = [
            { champ: "contrat_fin",      label: "Fin de contrat",   quoi: "Fin du contrat" },
            { champ: "contrat_revue_le", label: "Revue de contrat", quoi: "Revue des clauses de sécurité" },
            { champ: "plan_sortie_le",   label: "Plan de sortie",   quoi: "Plan de sortie à éprouver" }
        ];
        prestataires.forEach(p => {
            if (!p) return;
            DATES_CONTRAT.forEach(d => {
                const iso = p[d.champ];
                if (!iso) return;
                push({
                    type: "contrat", typeLabel: "Échéance contractuelle",
                    titre: d.quoi + " — " + (p.societe || ""),
                    sousTitre: d.label + (p.fonction_critique ? " · fonction critique" : ""),
                    date: iso, jours: daysFromToday(iso),
                    statut: p.criticite || "",
                    route: "#/prestataires/" + p.id
                });
            });
        });


        /* 9. Campagnes descendantes (lot L24, actions 24.1 et 24.3) — la date de retour
              attendue par le Groupe, pour MA part.

              ⚠️ Trois exclusions, et elles portent tout le sens :

               · une campagne jamais OUVERTE est un brouillon du Groupe : rien n'est
                 demandé à personne ;
               · une campagne CLOSE ne se relance plus — ce qui n'a pas été fait est un
                 manque qu'on constate, pas un retard qu'on rattrape ;
               · une part TERMINÉE n'est plus une obligation, même si la campagne traîne.

              C'est le même arbitrage que `f_etat_part_campagne()` côté serveur, dans le
              même ordre — et il n'est pas recopié : la fonction rend un ÉTAT, on ne lit
              ici que des DATES, comme les huit sources ci-dessus.

              ⚠️ La part d'une AUTRE filiale n'arrive jamais ici : le serveur ne sert que
              celles que la politique de cloisonnement laisse voir. L'échéancier n'a donc
              aucun filtre à faire — et c'est voulu : un filtre côté client serait une
              barrière que le client peut retirer. */
        const campagneDe = new Map((DataStore.getCampagnes() || [])
            .filter(c => c && c.id).map(c => [c.id, c]));

        (DataStore.getPartsCampagneVisibles() || []).forEach(part => {
            if (!part) return;
            const campagne = campagneDe.get(part.campagne_id);
            if (!campagne || !campagne.echeance) return;
            if (!campagne.ouverte_le) return;   // brouillon du Groupe
            if (campagne.close_le) return;      // close : on constate, on ne relance plus
            if (part.termine_le) return;        // ma part est faite
            push({
                type: "campagne", typeLabel: "Campagne du Groupe",
                titre: campagne.intitule || ("Campagne " + (campagne.ref_id || "")),
                sousTitre: (campagne.ref_id || "")
                    + (part.repondant ? " · " + part.repondant : "")
                    + (part.accuse_le ? " · vue le " + String(part.accuse_le).slice(0, 10) : ""),
                date: campagne.echeance, jours: daysFromToday(campagne.echeance),
                statut: part.accuse_le ? "Prise en compte" : "Non ouverte",
                route: "#/campagnes/" + campagne.id
            });
        });

        return items;
    }

    // Décompte par catégorie d'urgence (pour les compteurs et le badge).
    function counts(list) {
        const src = list || collect();
        const c = { retard: 0, aujourdhui: 0, semaine: 0, mois: 0, avenir: 0, indetermine: 0, total: src.length };
        src.forEach(it => { c[bucketFor(it.jours)]++; });
        return c;
    }

    // Nombre d'échéances en retard (date dépassée) — utilisé par le badge de la barre latérale.
    function overdueCount() {
        return collect().filter(it => it.jours !== null && it.jours < 0).length;
    }

    return { collect, counts, overdueCount, bucketFor, daysFromToday };
})();
