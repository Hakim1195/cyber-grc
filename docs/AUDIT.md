# Rapport d'audit — Cyber GRC

> Phase 0 de la mission. État des lieux du code réel, dette technique, risques,
> et plan d'amélioration priorisé. Complète `DATA_MODEL.md`.

## 1. Cartographie & architecture

**SPA maison, 100 % frontend**, sans build ni framework. Chargement par balises
`<script>` séquentielles dans `index.html`.

```
cyber-gouvernance_V4/
├── index.html            SPA (sidebar + <main id="app">), routes par hash
├── css/style.css         design system (variables CSS) + tous les styles
├── assets/logo/          logo officiel Dedienne + favicon
├── js/
│   ├── core/
│   │   ├── persistence.js  couche IndexedDB (kv + backups, quota)         [AJOUTÉ]
│   │   ├── datastore.js    source de vérité mémoire + persistance, API CRUD
│   │   └── router.js       routeur par hash (#/route, #/route/:id)
│   ├── lib/xlsx.full.min.js  SheetJS (import/export Excel) — embarqué, ~950 Ko
│   ├── modules/          1 module = 1 domaine (IIFE `XxxModule.renderList/Detail`)
│   │   ├── dashboard, synthese, clients, actifs, risques, matrice,
│   │   │   exigences, actions, bia, crise, pra_scenarios, pra_mco,
│   │   │   pra_tests, pra_prestataires, audits, settings
│   └── services/         exportExcel, exportPDF (impression native), importExcel
└── data/                 fichiers Excel d'exemple (non chargés au runtime)
```

**Conventions** : chaque module est une IIFE exposant `render*`. Rendu par
`app.innerHTML = template`. Persistance centralisée dans `DataStore` (API
synchrone). Toute l'UI est en **français**.

## 2. Points forts
- Architecture claire, modulaire, cohérente (un module par domaine).
- Couverture fonctionnelle GRC déjà riche (EBIOS, ISO 22301, audits, tiers…).
- **Persistance déjà solidifiée** cette session : IndexedDB + points de
  restauration versionnés + migration automatique (voir CHANGELOG).
- Quelques notes pédagogiques déjà présentes (légendes de risques, aide EBIOS).

## 3. Dette technique & points de friction

### 3.1 Sécurité du code (prioritaire pour un outil *cyber*)
- **XSS stocké** : ~10 injections de données utilisateur non échappées via
  `innerHTML` (ex. `risques.js` nom/intitulé, `audits.js` constats avec
  `replace(/\n/,'<br>')`, `crise.js` email dans `mailto:`). Un import JSON/Excel
  malveillant pourrait injecter du script. → **helper `escapeHtml()` à généraliser.**
- **Import non validé** : `importExcel`/`importSnapshot` ne valident pas le schéma
  ni les types ; écrasement silencieux des données à l'import fichier.

### 3.2 Robustesse des données
- **Collision d'ID** : `Date.now()` seul comme identifiant.
- **Orphelins** : `tests_pra.scenario_id` non nettoyé à la suppression d'un scénario.
- **Cohérence métier non contrôlée** : le score résiduel peut dépasser le brut
  sans avertissement.
- **QuotaExceededError** non géré explicitement côté import Excel volumineux.

### 3.3 Duplication
- Motifs recopiés dans ~7 modules : suppression groupée (checkboxes), badges de
  statut, confirmations, collecte de formulaire. → à factoriser en helpers partagés.

### 3.4 Accessibilité & UX
- Peu d'`aria-*`, labels de formulaire pas toujours liés (`<label for>`).
- Pas de fil d'Ariane, pas de responsive mobile abouti.
- États vides peu engageants.

### 3.5 Persistance — risque résiduel après solidification
- ✅ Purge du cache atténuée (IndexedDB + `persist()` + historique).
- ❌ **Pas encore de chiffrement** des données au repos ni de l'export JSON
  (données très sensibles). ← **Priorité 1 restante.**
- ❌ Pas de **rappel d'export**, pas d'**enveloppe `grc-backup` versionnée**, pas de
  **migration de schéma** formalisée, pas d'import « Remplacer / Fusionner ».

## 4. Risques majeurs (synthèse)
| # | Risque | Gravité | Statut |
|---|--------|---------|--------|
| R1 | Perte de données (purge navigateur) | Critique | **Atténué** (IndexedDB + historique) |
| R2 | Fuite de l'export JSON en clair (données sensibles) | Élevé | **Ouvert** (chiffrement à faire) |
| R3 | XSS stocké via import | Élevé | Ouvert |
| R4 | Import corrompu écrase la base | Élevé | Ouvert (validation à faire) |
| R5 | Collision d'ID | Moyen | Ouvert |

## 5. Plan d'amélioration priorisé

**Déjà livré cette session** (voir CHANGELOG) : décompression, charte Dedienne,
retrait des emojis + icônes SVG, **refonte du stockage (IndexedDB + historique)**.

**À réaliser (ordre proposé, aligné sur le brief) :**
1. **Sauvegarde — finalisation (Priorité 1)** : chiffrement AES-256-GCM
   (PBKDF2 ≥ 600k) de l'export *et* au repos (accès optionnel par mot de passe) ;
   enveloppe `grc-backup` versionnée ; rappel d'export + date visible ; import
   « Remplacer/Fusionner » avec validation stricte et migrations `v1→v2`.
2. **Design tokens + harmonisation** (direction à valider : Dedienne actuel vs
   Egerie-like bleu-marine + accent maîtrisé + couleurs sémantiques strictes).
3. **Bibliothèque de référentiels + mapping croisé** (ISO 27002, NIS2, DORA,
   AirCyber, ANSSI) via entité pivot « Mesure de sécurité ».
4. **Registre des incidents** (lien risque↔incident).
5. **Gestion documentaire** (cycle de vie, alertes de revue).
6. **Registre RGPD** (art. 30 simplifié).
7. **Tableau de bord direction** consolidé + export PDF soigné.
8. **Améliorations modules** (matrice PNG/SVG, cohérence brut/résiduel, fiches
   crise imprimables, risque fournisseur).
9. **Durcissement transverse** : `escapeHtml` partout, IDs anti-collision,
   factorisation, accessibilité, pédagogie systématique (tooltips ⓘ).
