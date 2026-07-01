# Plan d'action — Cyber GRC

> Feuille de route priorisée avec statuts. Mise à jour à chaque itération.
> Contexte & décisions : `CLAUDE.md`. Audit : `AUDIT.md`. Schéma : `DATA_MODEL.md`.

Légende : ✅ fait · 🔜 prochain · ⏳ à faire · 💤 en attente de décision

---

## Décisions validées
- Design **orange dominant** (Option B), structure bleue, sémantique stricte.
- Marque **Dedienne** conservée. Chiffrement **opt-in**. Multi-« Donneurs d'ordre » **conservé**.

## Décisions validées (chantier Référentiels)
- ✅ **Référentiel de démarrage** : **Hygiène ANSSI (42 mesures)** — livré.
- ✅ **Architecture conformité** : **pivot « Mesure de sécurité »** (n-n, propagation auto) — livré
  (module `/mesures` + propagation ; `mesures` + `evaluations[].mesure_id`).

---

## Chantier 1 — Sauvegarde & persistance (Priorité 1) — ✅ TERMINÉ
- ✅ IndexedDB + `navigator.storage.persist()` + migration auto depuis localStorage
- ✅ Points de restauration versionnés (auto 10 min + manuels, dédup, historique 20, restauration 1 clic)
- ✅ Enveloppe `grc-backup` versionnée + migrations de schéma (`migratePayload`)
- ✅ Export chiffré optionnel (AES-256-GCM, PBKDF2 600k, sel+IV par fichier) + export clair
- ✅ Import robuste : validation, détection chiffrement, aperçu, **Remplacer/Fusionner**, backup de sécurité
- ✅ Rappel d'export non intrusif (seuil paramétrable) + date du dernier export + statut persistance
- ✅ Protection opt-in par mot de passe + **chiffrement au repos** (coffre à enveloppe DEK/KEK)
      + écran de verrouillage + auto-verrouillage 15 min

## Chantier 2 — Design system (harmonisation) — ✅ FONDATIONS FAITES
- ✅ Design tokens unifiés (`css/tokens.css`)
- ✅ Composant tooltip pédagogique `Help.tip` (accessible, sans navigation parasite)
- ✅ Fil d'Ariane, responsive (sidebar off-canvas), a11y (focus, reduced-motion, tabular-nums)
- ✅ Badges sémantiques, états vides
- ⏳ **Restant** : appliquer les tooltips ⓘ **partout** (systématiser, fil rouge) ; harmoniser
      progressivement chaque module (tableaux denses, KPI, heatmap matrice, radars) au fil des touches.

## Chantier 3 — Référentiels + mapping croisé (§4) — ✅ FAIT (reste : mapping pré-rempli optionnel)
Sous-itérations :
- ✅ **4a — Ossature** : modèle données `evaluations` (+ `mesures`) ; `SCHEMA_VERSION`→3 (+ migration) ;
      registre `Referentiels` ; **référentiel ANSSI** (42 mesures / 10 familles, reformulations
      originales courtes + aide) ; module `/referentiels` (liste + détail auto-évaluation :
      statut, maturité 0-5, commentaire, preuves, actions correctives tracées) ;
      **score + radar par domaine** (SVG maison, temps réel). *(Itération 4)*
- ✅ **4b — Pivot « Mesure de sécurité »** : module `/mesures` (CRUD) ; **entité pivot** n-n vers les
      exigences de référentiels (`evaluations[].mesure_id`) ; lien / création à la volée depuis le détail
      d'une exigence ; **propagation** du statut + maturité aux évaluations couvertes (zéro double saisie). *(Itération 5)*
- ✅ **4c₁ — Autres référentiels** : ISO 27002:2022 (93), NIS2 art.21 (10), DORA (15),
      **AirCyber/BoostAerospace réel (234 q)** au schéma commun (1 fichier par référentiel). *(Itérations 6, 13)*
      + **import des réponses AirCyber** depuis CSV (Oui/Non → statut, maturité de départ). *(Itération 13)*
      + **niveaux Bronze/Argent/Or, priorité, domaines CL0–CL6** (badges + filtres + panneau
      « préparation au label »), issus du fichier de suivi BoostAerospace (156/234 questions). *(Itération 14)*
- ✅ **4c₂ — Couverture croisée & SoA** : vue de **couverture croisée** (matrice mesures × référentiels,
      part de chaque référentiel adossée à une mesure) ; **génération de la déclaration d'applicabilité
      (SoA)** imprimable. *(Itération 7)*
- ⏳ **Optionnel** : mapping **pré-rempli** d'équivalences inter-référentiels (ISO ↔ NIS2 ↔ ANSSI) éditable.
> ⚠️ NE PAS embarquer le texte intégral des normes (ISO payant/protégé). Reformulations originales +
> identifiants de clauses (« A.5.1 ») + titre court uniquement.

## Chantier 4 — Registre des incidents (§5.1) — ✅ FAIT *(Itération 8)*
Module `/incidents` : détection/résolution, type, gravité, actifs touchés, description,
actions immédiates, cause racine, actions correctives (liées au plan d'action via
`incident_id`), statut, déclarations ANSSI/CNIL avec **rappel des délais** (NIS2 24 h/72 h,
RGPD 72 h). Lien croisé **incident ↔ risque EBIOS**. Schéma v4.

## Chantier 5 — Gestion documentaire des politiques (§5.2) — ✅ FAIT *(Itération 9)*
Module `/documents` : registre (PSSI, charte…), version, propriétaire, **date de prochaine
revue** (alertes en retard/à venir), statut, lien référentiels, emplacement (ne stocke pas les
fichiers), **canevas de plans**. Schéma v5. *(À venir : remontée des alertes au tableau de bord direction.)*

## Chantier 6 — Registre des traitements RGPD (§5.3) — ✅ FAIT *(Itération 11)*
Module `/rgpd` : article 30 simplifié (finalité, base légale, données/sensibles,
destinataires, transfert hors UE, conservation) ; mesures de sécurité = entités **« Mesure »**
du pivot ; registre **imprimable**. Schéma v6.

## Chantier 7 — Tableau de bord direction consolidé (§5.4) — 🟡 en grande partie *(it. 10)*
- ✅ **Cockpit GRC 360°** (`js/modules/dashboard.js`) : bandeau de posture direction,
      indicateurs clés (KPI), **conformité** (donut), **maturité globale + par référentiel**
      (barres), **profil de risque** résiduel (donut) + **cartographie F×G** (heatmap SVG),
      **plan d'actions** avec **actions en retard** et **liste de veille** (échéances),
      **actifs par criticité** et **couverture du dispositif** (BIA/PRA/tests/MCO/crise/
      audits/prestataires/mesures/**incidents**). Graphiques maison (SVG/HTML, aucune dépendance).
      Export/impression PDF déjà branché (`ExportPdfService`).
- ✅ **Incidents intégrés** *(it. 10)* : tuile de couverture (ouverts + gravité) et **alerte
      de posture** sur les **déclarations réglementaires en attente** (NIS2/RGPD).
- ⏳ **Reste** : historisation à chaque snapshot (courbes de tendance), **docs à réviser**
      (dépend du chantier 5), conformité **par donneur d'ordre** en vue comparative,
      et une **liste des incidents récents** détaillée sur le tableau de bord.

## Chantier 8 — Améliorations modules existants (§5.5) — 🟡 en cours
- ✅ **Matrice EBIOS** : **export image (PNG/SVG)** (SVG autonome → PNG via canvas, sans dépendance)
      + **cohérence brut/résiduel** (bandeau d'alerte listant les risques où résiduel > brut, M > 1). *(Itération 15)*
- ⏳ PCA/PRA : fiches réflexes de crise **imprimables** (note : en crise le navigateur peut être indispo).
- ⏳ Tiers : niveau de risque fournisseur + lien exigences NIS2/DORA chaîne d'appro.

## Chantier 9 — Durcissement transverse — 🟡 en cours (en continu)
- ✅ **XSS** : `escapeHtml` partagé (`window.escapeHtml`) + appliqué aux modules **Exigences** et
      **Risques** (test XSS dédié). *(Itération 12)* — reste : actifs, clients, bia, crise, pra_*, audits.
- ✅ **IDs anti-collision** (suffixe aléatoire) généralisés à tous les modules. *(Itération 12)*
- Cascade/orphelins (`tests_pra.scenario_id`), cohérence métier.
- Factorisation des helpers dupliqués (suppression groupée, badges, confirmations, collecte de formulaire).
- Gestion `QuotaExceededError` à l'import Excel.
- i18n : chaînes centralisées (structure, sans sur-ingénierie).

---

## Rappels méthode
- Une fonctionnalité = une livraison testable → commit + push + montrer le résultat + MAJ CHANGELOG.
- Tester en headless (0 erreur console) + capture visuelle. Servir via `python3 -m http.server`.
- Poser une question si une décision structurante est ambiguë (ne pas supposer).
