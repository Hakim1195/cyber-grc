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
- 🟡 **Tooltips ⓘ — systématisation en cours** : couverts les modules techniques les plus « jargonneux » —
      **Risques (EBIOS F/G/M)**, **BIA (RTO/RPO/criticité)**, **Actifs (CIA/DICP)**, **Matrice EBIOS**,
      **Scénarios PCA/PRA**, **Audits (typologie des constats)**, **MCO**, **Tests PRA (type d'exercice)**,
      **Exigences (statut de conformité)** — soit 25 notes pédagogiques ; **Conformité/SoA** déjà couvert.
      Tests Playwright (0 erreur). Restent au fil de l'eau : Actions, Donneurs d'ordre (peu de jargon).
- ⏳ **Restant** : harmoniser progressivement chaque module (tableaux denses, KPI, radars) au fil des touches.

## Chantier 3 — Référentiels + mapping croisé (§4) — ✅ FAIT
Sous-itérations :
- ✅ **4a — Ossature** : modèle données `evaluations` (+ `mesures`) ; `SCHEMA_VERSION`→3 (+ migration) ;
      registre `Referentiels` ; **référentiel ANSSI** (42 mesures / 10 familles, reformulations
      originales courtes + aide) ; module `/referentiels` (liste + détail auto-évaluation :
      statut, maturité 0-5, commentaire, preuves, actions correctives tracées) ;
      **score + radar par domaine** (SVG maison, temps réel). *(Itération 4)*
- ✅ **4b — Pivot « Mesure de sécurité »** : module `/mesures` (CRUD) ; **entité pivot** n-n vers les
      exigences de référentiels (`evaluations[].mesure_id`) ; lien / création à la volée depuis le détail
      d'une exigence ; **propagation** du statut + maturité aux évaluations couvertes (zéro double saisie). *(Itération 5)*
- ✅ **4c₁ — Autres référentiels** : ISO/IEC 27001:2022 Annexe A (93), NIS2 art.21 (10), DORA (15),
      **AirCyber/BoostAerospace réel (234 q)** au schéma commun (1 fichier par référentiel). *(Itérations 6, 13)*
      + **import des réponses AirCyber** depuis CSV (Oui/Non → statut, maturité de départ). *(Itération 13)*
      + **niveaux Bronze/Argent/Or, priorité, domaines CL0–CL6** (badges + filtres + panneau
      « préparation au label »), issus du fichier de suivi BoostAerospace (156/234 questions). *(Itération 14)*
      + **radar de maturité par domaines CL** : les axes du profil de maturité AirCyber = les
      domaines de classification CL0–CL6 **nommés** (agrégation trans-chapitres, questions sans CL
      hors radar avec note explicative ; autres référentiels inchangés). *(Itération 29)*
- ✅ **4c₂ — Couverture croisée & SoA** : vue de **couverture croisée** (matrice mesures × référentiels,
      part de chaque référentiel adossée à une mesure) ; **génération de la déclaration d'applicabilité
      (SoA)** imprimable. *(Itération 7)*
- ✅ **Mapping pré-rempli & éditable** : module `/mapping` (« Correspondances »). **Catalogue statique**
      de 28 groupes d'équivalences (ANSSI ↔ ISO 27001 ↔ NIS2 ↔ DORA, `js/data/mappings.js`) +
      **surcouche éditable** `data.mappings` (créer / modifier / masquer / réinitialiser ; schéma **v7**).
      **Propagation** : relier tout un groupe à une « mesure de sécurité » (préserve « non évalué ») ou
      appliquer un même statut d'un coup → accélère la couverture croisée et la SoA. Badges de clause
      colorés selon l'évaluation, cartographie par référentiel. *(Itération 20)*
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

## Chantier 7 — Tableau de bord direction consolidé (§5.4) — ✅ FAIT *(it. 10, 21, 22)*
- ✅ **Cockpit GRC 360°** (`js/modules/dashboard.js`) : bandeau de posture direction,
      indicateurs clés (KPI), **conformité** (donut), **maturité globale + par référentiel**
      (barres), **profil de risque** résiduel (donut) + **cartographie F×G** (heatmap SVG),
      **plan d'actions** avec **actions en retard** et **liste de veille** (échéances),
      **actifs par criticité** et **couverture du dispositif** (BIA/PRA/tests/MCO/crise/
      audits/prestataires/mesures/**incidents**). Graphiques maison (SVG/HTML, aucune dépendance).
      Export/impression PDF déjà branché (`ExportPdfService`).
- ✅ **Incidents intégrés** *(it. 10)* : tuile de couverture (ouverts + gravité) et **alerte
      de posture** sur les **déclarations réglementaires en attente** (NIS2/RGPD).
- ✅ **Historisation & courbes de tendance** *(it. 21)* : section « Évolution dans le temps » —
      **instantané global capturé une fois par jour** (`history`, schéma **v8**, dédup par date,
      conservation 180 j) ; 6 **sparklines SVG maison** (conformité, maturité, exposition résiduelle,
      risques critiques, actions en retard, avancement) avec **variation colorée** selon le sens
      « meilleur » ; bouton « Effacer l'historique » (n'affecte pas les données GRC).
- ✅ **Suivi & échéances + comparatif** *(it. 22)* : **liste des incidents récents** (5 derniers,
      badge « À déclarer » NIS2/RGPD), **documents à réviser** (revue échue/proche ou statut « à
      réviser »/« obsolète », compteur d'alerte) et **conformité comparative par donneur d'ordre**
      (barres triées interne + clients). Listes cliquables vers les fiches.

## Chantier 8 — Améliorations modules existants (§5.5) — ✅ FAIT
- ✅ **Matrice EBIOS** : **export image (PNG/SVG)** (SVG autonome → PNG via canvas, sans dépendance)
      + **cohérence brut/résiduel** (bandeau d'alerte listant les risques où résiduel > brut, M > 1). *(Itération 15)*
- ✅ **PCA/PRA : fiches réflexes de crise imprimables** (`/crise-fiches`) : cartes d'action par rôle
      + réflexes communs + contacts d'urgence, optimisées impression (conserver hors ligne).
      Durcissement XSS du module Crise au passage. *(Itération 16)*
- ✅ **Tiers : risque fournisseur + chaîne d'appro NIS2/DORA** : niveau inhérent (criticité × accès)
      + checklist des exigences chaîne d'approvisionnement (badges, couverture, synthèse).
      Durcissement XSS du module au passage. *(Itération 17)*

## Chantier 9 — Durcissement transverse — 🟡 en cours (en continu)
- ✅ **XSS — dette soldée sur les modules de saisie** : `escapeHtml` partagé (`window.escapeHtml`)
      appliqué à **Exigences, Risques** *(it. 12)*, **Crise** *(it. 16)*, **Prestataires & Tiers**
      *(it. 17)*, puis **Actifs, Donneurs d'ordre, BIA, Scénarios PCA/PRA, Tests PRA, MCO, Audits**
      *(it. 18)* — y compris **vues d'impression** et **matrice RACI**. Correctifs notables : injection
      HTML des rapports/PV d'audit (`replace(\n,<br>)` sans échappement) et échappements incomplets
      (`replace(/"/g,…)`). Tests Playwright dédiés par entité (payloads `<img>`/`<script>`).
- ✅ **IDs anti-collision** (suffixe aléatoire) généralisés à tous les modules. *(Itération 12)*
- ✅ **Cascade/orphelins** (`tests_pra.scenario_id`) : suppression d'un scénario → cascade sur ses
      tests (confirmation chiffrée) ; détection + nettoyage des tests orphelins hérités (bandeau +
      badge). Helpers DataStore `getTestsByScenario`/`getOrphanTests`/`deleteOrphanTests`. *(Itération 19)*
- ✅ **Gestion `QuotaExceededError`** *(it. 23)* : détection de la **saturation du stockage** (IndexedDB /
      localStorage / points de restauration) — plus d'échec silencieux. `DataStore.flush()` renvoie
      l'état (dont `quota`), observateur `onQuotaExceeded` → **bandeau d'alerte** dédié (export + libération
      d'espace) ; l'**import Excel** force un enregistrement en fin de traitement et **prévient** si le
      stockage est plein. Tests Playwright (simulation de quota, import, bandeau).
- ✅ **Factorisation des helpers dupliqués** — module partagé **`js/core/ui.js`** (`window.UI`) :
      **suppression groupée** (`UI.wireBulkDelete`, 8 modules — ~250 lignes retirées), **badges de statut**
      (`UI.badge` / `UI.mappedBadge`, Incidents & Documents), **confirmations de suppression**
      (`UI.wireDelete`, « supprimer depuis la fiche » — 16 modules / 17 boutons) et **génération d'ID**
      (`UI.genId`, 23 sites / 17 modules — dette « collisions » soldée). La **collecte de formulaire**
      (lecture de champs) reste volontairement en ligne (hétérogène + locale → factoriser n'apporterait
      pas de gain net). Tests Playwright (50 assertions, 0 erreur).
- ⏳ i18n : chaînes centralisées (structure, sans sur-ingénierie).

---

## Rappels méthode
- Une fonctionnalité = une livraison testable → commit + push + montrer le résultat + MAJ CHANGELOG.
- Tester en headless (0 erreur console) + capture visuelle. Servir via `python3 -m http.server`.
- Poser une question si une décision structurante est ambiguë (ne pas supposer).
