// Emplacement : js/data/audit_aircyber.js
// Nom du fichier : audit_aircyber.js
//
// MODÈLE D'AUDIT du référentiel « AirCyber (BoostAerospace) » — 234 questions.
// AirCyber est déjà un questionnaire d'audit détaillé : chaque question EST un
// point de contrôle. On enregistre donc un modèle DÉRIVÉ (généré automatiquement
// depuis les 234 exigences du référentiel), plutôt que de réécrire 234 points à la
// main. Chaque question devient « ce qu'il faut vérifier », assortie d'une invite
// de preuve ; l'auditeur qualifie et documente son constat.
//
// S'auto-enregistre dans `AuditModeles` (chargé avant ce fichier).

(function () {
    if (typeof AuditModeles === "undefined") return;

    AuditModeles.registerDerived("aircyber", {
        // La question (déjà affichée en intitulé) EST le point de contrôle ; on donne
        // ici une consigne d'audit générique, sans la répéter.
        ctrl: function (e) {
            return "Contrôler la mise en œuvre effective et exiger les preuves ; confronter à la réponse déclarée au questionnaire AirCyber.";
        },
        preuve: "Documentation, configuration ou enregistrement démontrant la mise en œuvre, cohérent avec la réponse déclarée au questionnaire AirCyber."
    });
})();
