/**
 * js/services/echeances.js — Agrégateur d'échéances (vue transversale, lecture seule).
 *
 * But : recenser en UN seul endroit toutes les obligations datées éparpillées dans les
 * modules (plan d'actions, MCO, revues documentaires, déclarations d'incidents, audits,
 * revues de direction), pour alimenter le module « Échéancier » et le badge de la barre
 * latérale. Ne modifie AUCUNE donnée ; ne fait que lire le DataStore (API synchrone).
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
        if (jours <= 7) return "semaine";
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
