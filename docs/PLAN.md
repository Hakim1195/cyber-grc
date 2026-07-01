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
      AirCyber préparation (14) au schéma commun (1 fichier par référentiel). *(Itération 6)*
- ✅ **4c₂ — Couverture croisée & SoA** : vue de **couverture croisée** (matrice mesures × référentiels,
      part de chaque référentiel adossée à une mesure) ; **génération de la déclaration d'applicabilité
      (SoA)** imprimable. *(Itération 7)*
- ⏳ **Optionnel** : mapping **pré-rempli** d'équivalences inter-référentiels (ISO ↔ NIS2 ↔ ANSSI) éditable.
> ⚠️ NE PAS embarquer le texte intégral des normes (ISO payant/protégé). Reformulations originales +
> identifiants de clauses (« A.5.1 ») + titre court uniquement.

## Chantier 4 — Registre des incidents (§5.1) — ⏳
Champs : détection/résolution, type, gravité, actifs touchés, description, actions immédiates,
cause racine, actions correctives (liées au plan d'action), statut, déclaration ANSSI/CNIL.
Lien croisé incident ↔ risque EBIOS. Aide : délais NIS2 (24 h/72 h) & RGPD (72 h).

## Chantier 5 — Gestion documentaire des politiques (§5.2) — ⏳
Registre (PSSI, charte…), version, propriétaire, **date de prochaine revue**, statut, lien référentiels.
Alertes de revue (tableau de bord). Ne stocke pas les fichiers (référence la localisation). Canevas de plans.

## Chantier 6 — Registre des traitements RGPD (§5.3) — ⏳
Article 30 simplifié ; mesures de sécurité = mêmes entités « Mesure » que le mapping croisé.

## Chantier 7 — Tableau de bord direction consolidé (§5.4) — ⏳
Score de maturité global + radar par domaine, historisation à chaque snapshot, top risques,
actions en retard, incidents récents, conformité par référentiel/donneur d'ordre, docs à réviser,
**export PDF/impression soigné** (livrable COMEX).

## Chantier 8 — Améliorations modules existants (§5.5) — ⏳
- Matrice EBIOS : export image (PNG/SVG) ; cohérence brut/résiduel (avertir si résiduel > brut).
- PCA/PRA : fiches réflexes de crise **imprimables** (note : en crise le navigateur peut être indispo).
- Tiers : niveau de risque fournisseur + lien exigences NIS2/DORA chaîne d'appro.

## Chantier 9 — Durcissement transverse — ⏳ (en continu)
- **XSS** : généraliser `escapeHtml` à tous les `innerHTML` avec données utilisateur (~10 points, cf. AUDIT §3.1).
- **IDs anti-collision** (suffixe aléatoire).
- Cascade/orphelins (`tests_pra.scenario_id`), cohérence métier.
- Factorisation des helpers dupliqués (suppression groupée, badges, confirmations, collecte de formulaire).
- Gestion `QuotaExceededError` à l'import Excel.
- i18n : chaînes centralisées (structure, sans sur-ingénierie).

---

## Rappels méthode
- Une fonctionnalité = une livraison testable → commit + push + montrer le résultat + MAJ CHANGELOG.
- Tester en headless (0 erreur console) + capture visuelle. Servir via `python3 -m http.server`.
- Poser une question si une décision structurante est ambiguë (ne pas supposer).
