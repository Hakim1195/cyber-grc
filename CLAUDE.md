# CLAUDE.md — Contexte projet Cyber GRC

> Fichier de mémoire projet, lu automatiquement au démarrage d'une session Claude Code.
> But : permettre de **reprendre le travail sans perte de contexte** dans un nouveau chat.
> Compléments : `docs/PLAN.md` (plan d'action + statuts), `docs/AUDIT.md`,
> `docs/DATA_MODEL.md`, `CHANGELOG.md`.

## 1. Le produit

Logiciel de **gouvernance, risques et conformité (GRC) cyber**, **100 % frontend**
(HTML/CSS/JS, sans backend, sans framework, sans build). Toutes les données restent
dans le navigateur (IndexedDB + repli localStorage). Argument central : « vos données
ne quittent jamais votre machine ». Public : RSSI/consultants **et** non-experts à
sensibiliser → chaque concept doit avoir une **note pédagogique** (`Help.tip(...)`).

- **Racine applicative** : `cyber-gouvernance_V4/`
- **Branche de travail** : `main` UNIQUEMENT (consigne utilisateur du 02/07/2026 :
  ne **jamais** créer d'autres branches, tout pousser sur `main`).
- **Marque** : Dedienne Aerospace (à conserver).

## 2. Décisions structurantes (VALIDÉES — ne pas re-débattre)

| Sujet | Décision |
|-------|----------|
| Identité visuelle | **Orange dominant** (Option B) : structure bleue `#2059A6`, action/marque orange `#E9631B`. Couleurs sémantiques strictes (vert=conforme, orange=partiel, rouge=critique, gris=NA) réservées aux statuts. |
| Marque | **Garder Dedienne Aerospace** (logo `assets/logo/logo-dedienne.png`). |
| Chiffrement | **Opt-in** (désactivé par défaut, activable dans Paramètres). |
| Multi-« Donneurs d'ordre » | **Conservé** (pertinent pour un sous-traitant aéro), libellés génériques. |
| Full frontend | **Strict** : aucun backend, CDN runtime, ni service tiers. Libs embarquées localement. |

### Décisions Référentiels — VALIDÉES & LIVRÉES (chantier 4a/4b)
- **Référentiels** : démarré par **Hygiène ANSSI (42 mesures)** ; suite ISO 27001 (Annexe A) / NIS2 / DORA / AirCyber (4c).
- **Architecture conformité** : entité pivot **« Mesure de sécurité »** reliée n-n aux
  exigences des référentiels (évaluer une mesure propage le statut → zéro double saisie). **Livré.**

## 3. Architecture technique

SPA maison. Chargement par `<script>` séquentiels dans `index.html`.

```
cyber-gouvernance_V4/
├── index.html                 SPA (sidebar + #app), fil d'Ariane + bandeau
├── css/tokens.css             DESIGN TOKENS (source unique des variables)
├── css/style.css              styles (consomme les tokens)
├── assets/logo/               logo Dedienne + favicon
├── js/core/
│   ├── persistence.js         IndexedDB (stores kv + backups, quota)
│   ├── crypto.js              Web Crypto (PBKDF2 + AES-GCM)
│   ├── vault.js               coffre OPT-IN (chiffrement à enveloppe DEK/KEK) + écran de verrouillage
│   ├── datastore.js           SOURCE DE VÉRITÉ (mémoire) + persistance ; API CRUD synchrone
│   ├── router.js              routeur par hash (#/route, #/route/:id)
│   └── help.js                composant tooltip pédagogique `Help.tip(text)`
├── js/services/
│   ├── backup.js              export/import fichier + bandeau de rappel
│   ├── importExcel.js, exportExcel.js, exportPDF.js
│   ├── echeances.js           AGRÉGATEUR d'échéances (lecture seule) `window.Echeances`
├── js/modules/                1 module = 1 domaine (IIFE `XxxModule.renderList/renderDetail`)
│   └── dashboard, synthese, echeances, clients, actifs, cartographie, risques, matrice, exigences,
│       actions, bia, crise, pra_scenarios, pra_mco, pra_tests,
│       pra_prestataires, audits, settings
├── js/lib/xlsx.full.min.js    SheetJS (embarqué)
└── js/app.js                  bootstrap (gate Vault → init → routes → breadcrumb/menu)
```

### Conventions
- **UI en français.** Voix active, libellés orientés action.
- Module = IIFE retournant `{ render / renderList / renderDetail }`. Rendu via `app.innerHTML = template`.
- **DataStore : API 100 % synchrone** pour les modules (`getX/addX/updateX/deleteX`).
  La persistance (IndexedDB, chiffrement) est asynchrone SOUS le capot ; ne pas casser l'API sync.
- **Sécurité XSS** : échapper toute donnée utilisateur injectée en DOM. Un helper
  `escapeHtml` existe dans `settings.js` ; **dette ouverte** : le généraliser (voir AUDIT §3.1).
- **Pédagogie** : `${Help.tip("explication courte")}` à côté des termes techniques.
- **Design** : n'utiliser que les tokens de `tokens.css`. Semantique stricte.
- **IDs** : convention `"<PREFIXE>-" + Date.now()` — **dette** : ajouter un suffixe aléatoire (collisions).

## 4. Persistance & modèle de données (résumé — détail dans DATA_MODEL.md)

- IndexedDB `cyber-grc-db` : store `kv` (`current` = instantané, chiffré si protection active ;
  `meta`), store `backups` (points de restauration versionnés, auto + manuels).
- `SCHEMA_VERSION = 10` dans `datastore.js`. Migrations à l'import via `migratePayload`.
- Entités (tableaux) : clients, exigences, actions, risques, actifs, processus, crise,
  scenarios_pra, tests_pra, prestataires, mco_actions, audits, revues,
  **evaluations** (auto-évaluations de référentiels), **mesures** (pivot « Mesure de sécurité »),
  **incidents** (registre des incidents), **documents** (registre des politiques),
  **traitements** (registre RGPD art. 30, mesures reliées au pivot),
  **mappings** (v7, surcouche des correspondances inter-référentiels ; catalogue par défaut statique)
  et **history** (v8, indicateurs historisés — un point par jour pour les courbes de tendance).
  Les **actifs** portent en plus un champ **`dependances[]`** (v9, liens typés actif→actif :
  `dep`/`hosted`/`flux`/`backup` — module Cartographie & analyse d'impact).
  Les **`mco_actions`** suivent (v10) un modèle de **suivi d'action planifiée** :
  `{ titre, description, responsable, frequence, priorite, datePrevue, dateReelle, dateCloture,
  statut ("À planifier"|"En cours"|"Réalisée"|"Annulée"), avancement 0–100, commentaire }` —
  « en retard » est *dérivé* via `PraMcoModule.isEnRetard` (réutilisé par le dashboard). Migration
  transparente de l'ancien `{ etat, date, notes }` dans `normalize`.
- Référentiels : catalogue **statique** (registre `js/data/referentiels.js` + fichiers `ref_*.js`),
  hors `data`. Livrés : ANSSI (42), ISO 27001 Annexe A (93, id technique conservé `iso-27002-2022`),
  NIS2 (10), DORA (15), AirCyber/BoostAerospace (234).
  Ne pas embarquer le texte des normes (reformulations originales + identifiants de clauses).
  **Correspondances** inter-référentiels : catalogue statique `js/data/mappings.js` (`MappingCatalog`,
  28 groupes ANSSI↔ISO↔NIS2↔DORA) + surcouche éditable `data.mappings` (module `/mapping`).
  AirCyber = questionnaire réel (généré depuis un CSV via un script du scratchpad, non versionné) ;
  import in-app des réponses (bouton sur la fiche AirCyber, parsing SheetJS, mapping Oui/Non→statut) ;
  métadonnées par question **niveau Bronze/Argent/Or + priorité + domaine CL0–CL6** (badges,
  filtres, panneau « préparation au label »), champs optionnels `niveau`/`priorite`/`cl` + `clLabels` ;
  **radar par domaines CL** (axes CL0–CL6 nommés, `computeClAxes` activé par `clLabels`,
  questions sans CL hors radar mais comptées ailleurs ; autres référentiels : radar thématique inchangé),
  **filtrable par niveau de label** (boutons Global/Bronze/Argent/Or, tracé teinté par niveau) ;
  **`scoring: "conformite"`** : AirCyber se répond **Oui/Non/N-A sans maturité CMMI** — score =
  « Oui » ÷ applicables (N/A exclues, non répondu = Non), mêmes valeurs de `statut` en base,
  `maturite` préservée mais ignorée (exclue aussi des moyennes CMMI du dashboard et de la SoA).
- Export fichier : enveloppe **`grc-backup`** `{ format, version, encrypted, createdAt, app, payload|kdf+cipher }`.

## 5. Lancer & tester (important)

- **IndexedDB et Web Crypto exigent une vraie origine** (pas `file://`). Servir en local :
  `cd cyber-gouvernance_V4 && python3 -m http.server 8891` → http://127.0.0.1:8891/index.html
- **Tests headless** : Node + Playwright global à `/opt/node22/lib/node_modules/playwright`,
  Chromium à `/opt/pw-browsers`. Écrire les scripts de test/captures dans le scratchpad, pas dans le repo.
  Toujours vérifier `pageerror`/`console` (objectif : 0 erreur) et prendre des captures pour validation visuelle.
- Pas de données de démo pré-chargées (interdit par le brief) : les tests injectent leurs propres données.

## 6. Git / méthode de travail

- Travailler **par itérations** : une fonctionnalité = une livraison testable, commit + push, montrer le résultat.
- **Mettre à jour `CHANGELOG.md`** à chaque itération et `DATA_MODEL.md` si le schéma change.
- Commits en français, descriptifs. Pousser sur `claude/decompress-zip-folder-230woc`.
- Ne PAS ouvrir de PR sans demande explicite.

## 7. État d'avancement (voir docs/PLAN.md pour le détail)

**Fait** : décompression • charte Dedienne + logo • retrait emojis + icônes SVG •
**Sauvegarde complète** (IndexedDB + historique versionné + migration ; enveloppe grc-backup ;
export chiffré PBKDF2 600k ; import validé Remplacer/Fusionner ; rappel d'export ;
protection opt-in + chiffrement au repos) • Phase 0 audit • **Design system** (tokens,
tooltip ⓘ, fil d'Ariane, responsive, a11y) • **Référentiels 4a/4b** (schéma v3
`evaluations`/`mesures` ; référentiel **ANSSI 42 mesures** ; auto-évaluation + **radar de
maturité** SVG ; pivot **« Mesure de sécurité »** + propagation « zéro double saisie »).

**Fait (suite)** : Référentiels **4c** (ISO 27001, NIS2, DORA, **AirCyber réel 234 q** + **import
CSV des réponses**) + **couverture croisée** + **génération SoA** ; **Registre des incidents**
(v4, déclarations NIS2/RGPD) ; **Gestion documentaire** (v5, politiques + alertes de revue +
canevas) ; **Registre RGPD** (v6, traitements art. 30, mesures reliées au pivot, registre
imprimable) ; **Tableau de bord** enrichi (cockpit GRC 360°, graphes SVG maison) ;
**Durcissement** (escapeHtml partagé + IDs anti-collision).

**Fait (Chantier 8 — améliorations modules)** : **Matrice EBIOS** export image PNG/SVG (SVG
autonome → PNG via canvas, sans dépendance) + alerte cohérence brut/résiduel ; **Fiches réflexes
de crise imprimables** (`/crise-fiches` : cartes d'action par rôle + réflexes communs + contacts
d'urgence) ; **Risque fournisseur & chaîne d'appro NIS2/DORA** (criticité × accès → niveau
inhérent + checklist exigences + couverture). Durcissement XSS des modules Crise et Prestataires.

**Fait (Chantier 9 — durcissement)** : **XSS soldé sur tous les modules de saisie** (escapeHtml
généralisé : exigences, risques, crise, prestataires, actifs, clients, bia, pra_scenarios/tests/mco,
audits — vues d'impression et matrice RACI incluses ; correctifs injection HTML des rapports d'audit
et échappements incomplets ; tests Playwright par entité). IDs anti-collision généralisés.

**Fait (Chantier 9 — suite)** : **Cascade/orphelins `tests_pra.scenario_id`** — suppression d'un
scénario PCA/PRA en cascade sur ses tests (confirmation indiquant le nombre impacté) ; détection +
nettoyage des tests orphelins hérités (badge « Orphelin » + bandeau) ; helpers DataStore
`getTestsByScenario`/`getOrphanTests`/`deleteOrphanTests`.

**Fait (Chantier 3 — Correspondances inter-référentiels)** : module **`/mapping`** (« Correspondances »)
— **catalogue pré-rempli** de 28 groupes d'équivalences (ANSSI↔ISO 27001↔NIS2↔DORA) **éditable**
(créer/modifier/masquer/réinitialiser, surcouche `data.mappings`, schéma **v7**) ; **propagation**
(relier tout un groupe à une mesure — préserve « non évalué » — ou appliquer un statut d'un coup) ;
badges de clause colorés selon l'évaluation + cartographie par référentiel ; liens croisés
Référentiels/Couverture. Tests Playwright (0 erreur, round-trip v7 + compat v6).

**Fait (Chantier 7 — Historisation des tendances)** : **courbes d'évolution** sur le tableau de bord
(section « Évolution dans le temps ») — **instantané global capturé une fois par jour** (`history`,
schéma **v8**, dédup par date, conservation 180 j) ; 6 sparklines SVG maison (conformité, maturité,
exposition résiduelle, risques critiques, actions en retard, avancement) avec **variation colorée**
selon le sens « meilleur » ; bouton « Effacer l'historique ». Tests Playwright (0 erreur, round-trip v8).

**Fait (Chantier 7 — Suivi & échéances + comparatif → chantier 7 COMPLET)** : sur le tableau de bord,
**liste des incidents récents** (5 derniers, badge « À déclarer » NIS2/RGPD), **documents à réviser**
(revue échue/proche ou statut « à réviser »/« obsolète », compteur d'alerte) et **conformité
comparative par donneur d'ordre** (barres triées interne + clients). Listes cliquables. Tests Playwright.

**Fait (Chantier 9 — Quota de stockage)** : détection de la **saturation du stockage** (plus d'échec
silencieux) — `DataStore.flush()` renvoie `{ ok, quota }`, observateur `onQuotaExceeded` → **bandeau
d'alerte** dédié ; l'**import Excel** force un enregistrement et prévient si le stockage est plein.
Tests Playwright (simulation de quota).

**Fait (Chantier 9 — Factorisation helpers UI)** : nouveau module partagé **`js/core/ui.js`**
(`window.UI`, chargé après `help.js`). **`UI.wireBulkDelete({remove,confirm,toast,onDone})`** remplace
la logique de **suppression groupée recopiée dans 8 modules** (Exigences, Risques, Actions, Crise, BIA,
Tests PRA, MCO, Prestataires — ~250 lignes dédupliquées). **`UI.badge` / `UI.mappedBadge`** factorisent
les **badges de statut** (`<span class="status …">`) — appliqués à Incidents & Documents.
**`UI.wireDelete({button,confirm,remove,toast,redirect})`** factorise la **suppression depuis la fiche**
(confirm → delete → toast → navigation) recopiée dans **16 modules / 17 boutons** (message statique ou
dynamique — avertissements de cascade préservés ; ids `deleteBtn`/`delBtn`/`delScenarioBtn`).
**`UI.genId(prefix)`** centralise la convention d'id anti-collision `"<PRÉFIXE>-<ts>-<aléa>"`
(23 sites / 17 modules — dette « collisions » soldée ; `updatedAt` non touchés). La **collecte de
formulaire** reste en ligne à dessein (hétérogène + locale). Aucun changement fonctionnel/schéma ;
échappement XSS conservé. Tests Playwright (bulk 20 + smoke 8 + suppression fiche 16 + genId 6, 0 erreur).

**Fait (Chantier 2 — Tooltips pédagogiques)** : **25 notes `Help.tip(ⓘ)`** ajoutées sur les modules
techniques sans aucune aide — **Risques** (EBIOS F/G/M + méthode FxGxM), **BIA** (criticité, RTO, RPO),
**Actifs** (CIA/DICP), **Matrice EBIOS**, **Scénarios PCA/PRA** (PCA vs PRA), **Audits** (typologie des
constats), **MCO**, **Tests PRA** (type d'exercice), **Exigences** (statut de conformité) ;
Conformité/SoA déjà couvert. Icônes accessibles, aucune donnée/schéma touché. Tests Playwright
(présence sur 11 vues, contenu des bulles, ouverture au clic sans navigation ; 0 erreur). i18n
**écartée** (app monolingue, décision utilisateur).

**Fait (AirCyber — radar par domaines CL)** : le **profil de maturité par domaine** d'AirCyber est
construit sur les **domaines de classification CL0–CL6 nommés** (axes = code + nom, étiquettes
multi-lignes, viewBox élargie pour AirCyber seul) au lieu des chapitres du questionnaire.
`computeClAxes()`/`radarAxesFor()` dans `referentiels.js`, activés par la présence de `clLabels` ;
mêmes règles de moyenne que `computeScores`. Les 78 questions sans CL sont hors radar (note
explicative sous le graphique) mais comptées partout ailleurs. Autres référentiels inchangés.
Tests Playwright (22 assertions : axes nommés liste+fiche, géométrie exacte, exclusion sans-CL,
refresh temps réel, non-régression ANSSI ; 0 erreur).

**Fait (AirCyber — radar par niveau de label + score Oui/Non sans CMMI)** : radar de la fiche
**filtrable Global/Bronze/Argent/Or** (`radarNiveau`, tracé + bouton actif teintés par niveau,
note « n questions », vue conservée au refresh, retour à Global à l'ouverture) ; **AirCyber scoré
sans CMMI** (`scoring: "conformite"` dans `ref_aircyber.js`) — réponses **Oui/Non/N-A** (mêmes
valeurs `statut`, « partiellement » hérité affiché mais non proposé), colonne Maturité supprimée,
**score = Oui ÷ applicables** (N/A exclues, non répondu = Non), KPIs/chapitres en %, axes radar =
taux de Oui, panneau « préparation au label » rafraîchi en direct, `maturite` stockée préservée
mais ignorée (saisie et import CSV ne la touchent plus). SoA sans colonne « Mat. » ; dashboard :
moyenne CMMI hors AirCyber, barre AirCyber en % « score Oui/Non ». Autres référentiels inchangés.
Tests Playwright (64 assertions ; 0 erreur).

**Fait (Chantier Cartographie — dépendances entre actifs, schéma v9)** : module **`/cartographie`**
(entrée menu « Cartographie » après « Actifs critiques ») — **graphe SVG maison** des actifs et de leurs
**dépendances typées** (`dep`/`hosted`/`flux`/`backup`), édité depuis la **fiche de chaque actif** (champ
`actif.dependances[]`, rétrocompatible). **Layout en couches** (métier en haut → socle en bas, robuste aux
cycles). **Analyse d'impact Niveau 3** : clic → **rayon d'impact** par propagation transitive (actifs +
processus BIA en aval, dont critiques, RTO) + **détection SPOF** (≥ 2 processus critiques dépendants) ; le
lien **sauvegardé par ne propage pas** une panne (dépendances typées). **Filtres** (type, criticité,
recherche, processus, isolés) ; **export PNG/SVG** (même recette que la matrice). Cascade `deleteActif`
étendue (purge des liens entrants). Tests Playwright (rendu, SPOF exact, impact, filtres, export,
round-trip v9, cascade, édition fiche ; 0 erreur).

**Fait (Chantier MCO — suivi d'action planifiée, schéma v10)** : refonte des champs du module
**`/mco`** (Actions Préalables) — de l'ancien modèle « vérification récurrente » (`etat` OK/KO, `date`,
`notes`) vers un **modèle de suivi d'action planifiée** : **Définition**, **Description**, **Responsable**,
**Priorité**, **Fréquence**, **Statut** (À planifier/En cours/Réalisée/Annulée), **Date programmée**,
**Date de réalisation**, **Date de clôture**, **Avancement %** (curseur), **Commentaire**. Indicateur
**« en retard »** *dérivé* (`PraMcoModule.isEnRetard`, source unique **réutilisée par le dashboard** :
tuile « N en retard » / « Planning tenu » au lieu du décompte OK/KO) → badge liste + bandeau + entête de
fiche. Automatismes (statut « Réalisée » → 100 % + dates du jour ; curseur synchronisé). **Migration
transparente v9→v10** dans `normalize` (OK→Réalisée/100 %, KO→En cours, date→dateReelle, notes→commentaire,
purge des clés obsolètes ; sans perte de donnée). Correctif CSS `.status` (`white-space: nowrap`).
Tests Playwright (44 assertions : migration backup v9, round-trip v10, CRUD UI, auto-complétion, retard,
dashboard ; 0 erreur).

**Fait (Chantier Échéancier — vue consolidée des échéances)** : nouveau module **`/echeances`**
(« Échéancier », menu *Pilotage* après « Synthèse Direction ») — **vue transversale** qui agrège en un
seul endroit toutes les obligations datées du logiciel (plan d'actions, MCO, revues documentaires,
déclarations d'incidents NIS2/RGPD = détection + 72 h, audits planifiés, revues de direction à venir),
**regroupées par urgence** (En retard / Aujourd'hui / Cette semaine / Ce mois-ci / Plus tard / Sans date),
compteurs, filtres (type, « urgents ≤ 7 j », recherche), **lignes cliquables vers la fiche d'origine**,
impression. **Badge compteur d'échéances en retard** sur l'entrée de menu, **visible depuis toute page**
(rafraîchi via `updateActiveNav`). **Aucun changement de schéma** : nouveau service **lecture seule**
`js/services/echeances.js` (`window.Echeances.collect/counts/overdueCount`) qui dérive les échéances des
seules dates existantes (règles alignées sur MCO/documents/incidents). Tests Playwright (34 assertions :
agrégation + exclusions, délai incident +72 h, compteurs/regroupement, badge, filtres, navigation ; 0 erreur).

**Fait (Chantier Échéancier — extensions)** : **vue calendrier mensuel** (bascule Liste/Calendrier,
pastilles colorées par urgence sur chaque jour, navigation de mois, jour courant mis en évidence),
**export Excel** (`buildRows` → SheetJS) et **export Agenda `.ICS`** (`buildICS`, un événement journée
par échéance datée, importable Outlook/Google), et **panneau « Prochaines échéances » sur le tableau de
bord** (section *Suivi & échéances*, top 7 tous modules + badge « N en retard », réutilise `Echeances`).
Tests Playwright (28 assertions ; 0 erreur ; non-régression Échéancier 34 + MCO 44).

**Prochain** : poursuivre le Chantier 2 — harmoniser tableaux denses / KPI / radars ; tooltips restants
sur les modules à faible jargon (Actions, Donneurs d'ordre) au fil des touches.
