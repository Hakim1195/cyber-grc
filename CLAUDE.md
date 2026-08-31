# CLAUDE.md — Contexte projet Cyber GRC

> Fichier de mémoire projet, lu automatiquement au démarrage d'une session Claude Code.
> But : permettre de **reprendre le travail sans perte de contexte** dans un nouveau chat.
> Compléments : **`docs/PLAN_SERVEUR.md` (chantier en cours — fait autorité)**,
> `docs/PLAN.md` (historique frontend), `docs/AUDIT.md`, `docs/DATA_MODEL.md`, `CHANGELOG.md`.

> ## ⚠️ CHANGEMENT DE PARADIGME — LIRE EN PREMIER
>
> Le projet est **passé d'une application 100 % navigateur à une application
> client/serveur multi-filiales**, déployée sur site chez un groupe industriel
> (20+ filiales, acquisitions régulières, sites en France et à l'étranger).
>
> **Le plan de référence est [`docs/PLAN_SERVEUR.md`](docs/PLAN_SERVEUR.md).** Il est
> validé point par point avec l'utilisateur et le client final. Ne pas le re-débattre :
> l'appliquer. Les sections 2 à 7 ci-dessous décrivent l'**application frontend
> existante**, qui reste la base de code à faire évoluer — pas la cible d'architecture.
>
> **Reprise de travail** : lire `docs/PLAN_SERVEUR.md` (le quoi), puis
> `docs/PLAN_EXECUTION.md` (le comment : vagues, portes, périmètre de chaque agent),
> puis `backend/README.md` §8 (« Avancement ») pour l'état réel des lots — et reprendre
> à la vague en cours.

## 1. Le produit

Logiciel de **gouvernance, risques et conformité (GRC) cyber**. Public :
RSSI/consultants **et** non-experts à sensibiliser → chaque concept doit avoir une
**note pédagogique** (`Help.tip(...)`).

- **Frontend** : `cyber-gouvernance_V4/` — SPA maison (HTML/CSS/JS, sans framework,
  sans build). ~17 100 lignes. Conservée telle quelle : seule sa couche de
  persistance bascule vers le serveur (voir `PLAN_SERVEUR` §1.3).
- **Backend** : `backend/` — Node.js 22 + TypeScript + PostgreSQL, Debian 13,
  **sans conteneur**, Apache2 en frontal. En construction.
- **Branche de travail** : **`main`** — consigne utilisateur maintenue : tout pousser
  sur `main`, ne pas créer de branche de travail.
- **Marque** : Dedienne Aerospace pour le frontend actuel ; la cible serveur rend
  **logo et raison sociale configurables par filiale** (`PLAN_SERVEUR` §6).

## 2. Décisions structurantes (VALIDÉES — ne pas re-débattre)

| Sujet | Décision |
|-------|----------|
| Identité visuelle | **Orange dominant** (Option B) : structure bleue `#2059A6`, action/marque orange `#E9631B`. Couleurs sémantiques strictes (vert=conforme, orange=partiel, rouge=critique, gris=NA) réservées aux statuts. |
| Marque | **Garder Dedienne Aerospace** (logo `assets/logo/logo-dedienne.png`). |
| Chiffrement | **Opt-in** (désactivé par défaut, activable dans Paramètres). |
| Multi-« Donneurs d'ordre » | **Conservé** (pertinent pour un sous-traitant aéro), libellés génériques. |
| ~~Full frontend~~ | ⚠️ **CADUC depuis le chantier serveur.** Valait pour le produit local. La cible est désormais client/serveur (`docs/PLAN_SERVEUR.md`). Reste vrai : **aucun CDN runtime ni service tiers**, libs embarquées localement. |

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
│   └── dashboard, synthese, echeances, clients, personnel, actifs, cartographie, risques, matrice, exigences,
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
- `SCHEMA_VERSION = 12` dans `datastore.js`. Migrations à l'import via `migratePayload`.
- Entités (tableaux) : clients, exigences, actions, risques, actifs, processus, crise,
  scenarios_pra, tests_pra, prestataires, mco_actions, audits, revues,
  **evaluations** (auto-évaluations de référentiels), **mesures** (pivot « Mesure de sécurité »),
  **incidents** (registre des incidents), **documents** (registre des politiques),
  **traitements** (registre RGPD art. 30, mesures reliées au pivot),
  **mappings** (v7, surcouche des correspondances inter-référentiels ; catalogue par défaut statique),
  **history** (v8, indicateurs historisés — un point par jour pour les courbes de tendance)
  et **personnes** (v11, annuaire — autocomplétion des champs « Responsable » ; le nom reste stocké en
  texte dans les entités, saisie libre conservée).
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

### Skill UI/UX (aide à la décision design)

Skill projet **`ui-ux-pro-max`** installée dans `.claude/skills/ui-ux-pro-max/` (v2.13.0, MIT,
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)).
Base de connaissances **locale** (CSV) interrogeable par un moteur BM25 en Python — aucun réseau,
aucune dépendance externe, cohérent avec la contrainte « full frontend / rien ne sort de la machine ».

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --domain ux   # 119 règles UX/a11y
```

Domaines utiles ici : `ux` (accessibilité, tableaux denses, formulaires, navigation), `chart`
(radars/sparklines), `typography`, `color`, `icons`. **Pas de `--stack`** : aucun des 22 stacks ne
correspond au vanilla JS de l'app (le plus proche, `html-tailwind`, est spécifique à Tailwind).

**Garde-fou** : les tokens de `css/tokens.css` et la charte Dedienne (orange `#E9631B` / bleu
`#2059A6`, sémantique stricte des statuts) restent la référence — la skill sert à *arbitrer*
(contraste, cibles tactiles, densité, lisibilité des tableaux), pas à imposer une palette.
Ne pas utiliser `--design-system` pour regénérer une identité visuelle (décision déjà validée, cf. §2).

## 6. Git / méthode de travail

- Travailler **par itérations** : une fonctionnalité = une livraison testable, commit + push, montrer le résultat.
- **Mettre à jour `CHANGELOG.md`** à chaque itération et `DATA_MODEL.md` si le schéma change.
- Commits en français, descriptifs. Pousser sur **`main`** (consigne utilisateur).
  ⚠️ Plusieurs sessions peuvent travailler en parallèle sur ce dépôt : **faire
  `git pull --rebase origin main` avant de pousser**, sinon la poussée est rejetée.
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

**Fait (Chantier Référentiels ↔ Plan d'actions — plan d'action sur le pivot « Mesure »)** : comblement
du chaînon manquant entre l'évaluation d'un référentiel et le plan d'actions. Nouveau lien **optionnel**
`action.mesure_id` (rétrocompatible, sans changement de schéma) → une action peut être rattachée
**directement à une mesure de sécurité** (le pivot), et vaut pour toutes les exigences qu'elle couvre.
**Bloc « Plan d'action » sur la fiche Mesure** (`/mesures/:id` : liste + « Planifier une action »
intitulé/priorité/responsable/échéance). **Chaîne visible côté exigence** (le Détail d'une exigence reliée
affiche le plan d'action de la mesure, en plus du bloc « Actions correctives » par-exigence conservé).
**Traçabilité** dans le plan d'actions (colonne + fiche : « Mesure : … »). `getActionsByMesure` ;
`deleteMesure` **délie** les actions (`mesure_id → null`, conservées), comme les évaluations. Tests
Playwright (20 assertions ; 0 erreur ; non-régression MCO 44 + Échéancier 34 + extensions 28).

**Fait (Chantier Personnel — annuaire réutilisé partout, schéma v11, Phase 1)** : nouveau module
**`/personnel`** (« Personnel », menu après « Donneurs d'ordre ») — annuaire CRUD des personnes/rôles
(nom, fonction, service, email, téléphone, notes ; entité **`personnes`**, v11). **Autocomplétion partout** :
un `<datalist id="personnes-list">` partagé (peuplé par `UI.refreshPersonnesDatalist()` à chaque navigation,
appelé depuis `updateActiveNav`) branche l'annuaire sur **tous les champs « Responsable »/« Propriétaire »/
« Auditeur »** (Actions, Mesures, Exigences, Actifs, BIA, MCO, RGPD, Risques, Documents, Audits). **Choix
« annuaire + autocomplétion » (pas de clé étrangère)** : les entités **stockent toujours le nom en texte**
→ rétrocompatible, saisie libre conservée, **rien de cassé**. **Fiche personne = « où c'est affecté »**
(agrégation par correspondance de nom, lecture seule). **Suppression non destructive** (retire la suggestion,
conserve les noms saisis). Tests Playwright (17 assertions ; migration v10→v11 + round-trip ; 0 erreur ;
non-régression statut création 12 + Mesure↔action 20 + MCO 44 + Échéancier 34 + extensions 28).

**Fait (Chantier Personnel — Phase 2 : multi-personnes + Cellule de crise)** : **champ multi-personnes
réutilisable** (`UI.multiPersonHtml`/`wireMultiPerson`/`getMultiPerson`, chips + autocomplétion annuaire,
saisie libre acceptée, stockage « un nom par ligne » rétrocompatible) appliqué aux **Participants d'une
revue de direction**. **Lien Cellule de crise ↔ annuaire** : champ Nom autocomplété + **pré-remplissage
téléphone/email** depuis l'annuaire (sans écraser une valeur saisie). **Affectations** de la fiche personne
enrichies (appartenance à la Cellule de crise avec rôle, participation aux revues). Tests Playwright
(16 assertions ; 0 erreur ; non-régression Personnel 17 + statut 12 + Mesure↔action 20 + MCO 44 +
Échéancier 34 + extensions 28).

**Fait (Chantier Référentiels — plusieurs mesures par exigence, schéma v12)** : le lien exigence→mesure
passe de la **référence unique** `evaluation.mesure_id` au **tableau** `evaluation.mesure_ids[]` — une
exigence (typiquement une question AirCyber) peut être couverte par **plusieurs mesures**. UI référentiel :
`<select>` unique → **chips** (mesures liées retirables) + « Ajouter » / « Nouvelle », plan d'action de
chaque mesure affiché. **Propagation « au plus défavorable »** (`propagateMesure`→`aggregateFromMesures` :
statut le plus faible — conforme seulement si toutes le sont —, maturité la plus basse ; N/A neutre ;
non-évalué ignoré). Helpers `addMesureToEvaluation`/`removeMesureFromEvaluation` (ajout sans écraser,
dédoublonné) ; `getEvaluationsByMesure`/`deleteMesure`/Couverture/SoA/Correspondances adaptés. **Migration
transparente v11→v12** (valeur unique → tableau à 1 élément). Tests Playwright (16 assertions ; 0 erreur ;
non-régression Mesure↔action 20 + Personnel 17+16 + statut 12 + MCO 44 + Échéancier 34 + extensions 28).

---

## 8. CHANTIER EN COURS — Édition Groupe client/serveur

> **Plan de référence : [`docs/PLAN_SERVEUR.md`](docs/PLAN_SERVEUR.md)** — cadrage clos,
> validé avec l'utilisateur et le client. **Ne pas re-débattre, appliquer.**
> **Conduite du chantier : [`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md)** — vagues,
> propriété des fichiers, portes de sécurité, définition de « terminé ».
> État détaillé des lots : **[`backend/README.md`](backend/README.md) §8**.

### Contexte client (rappel court)

Groupe industriel, **20+ filiales** (acquisitions régulières, France et étranger).
L'outil devient le support **officiel** de leur gouvernance cyber : il servira de
preuve en audit ISO 27001. Déploiement **sur site**, VM Debian 13 sous Proxmox,
accès par VPN uniquement, **sans conteneur** (contrainte client), authentification
sur l'**Active Directory** du groupe.

### Décisions structurantes du chantier (validées)

| Sujet | Décision |
|---|---|
| Cible | Client/serveur. **La version 100 % locale est abandonnée.** |
| Backend | Node.js 22 + TypeScript (réutilise la logique métier déjà en JS) |
| Base | PostgreSQL, relationnel, cloisonnement par **Row Level Security** |
| Cloisonnement | **Par filiale**, strict. Plus une **vision Groupe** consolidée pour la direction |
| Droits | **3 axes** : périmètre × profil métier × domaine. Pilotés par groupes AD. **Export = permission distincte** |
| Principe directeur | **La façade `DataStore` synchrone est préservée** : les modules frontend ne sont PAS réécrits (voir `PLAN_SERVEUR` §1.3) |
| Concurrence | **Verrouillage optimiste par enregistrement** — le risque n°1 du projet (P1) |
| Langues | FR + EN obligatoires, ES souhaitable |
| Import | **Généralisé à tous les modules** (critère décisif client) |
| Pièces jointes | Intégrées, chaîne antimalware ClamAV, empreinte SHA-256 |
| Journal d'audit | **Inaltérable** (ajout seul, chaîné par empreinte), rétention 3 ans |

### Pièges à ne pas rouvrir

- **`mesures` doit être scindé** en `mesure_catalogue` (niveau Groupe : la définition
  du contrôle) et `mesure_mise_en_oeuvre` (niveau Filiale : statut, maturité,
  responsable). Ne pas reproduire l'entité unique actuelle — sinon les filiales ne
  sont plus comparables et la vision Groupe perd son sens.
- **Activation d'un référentiel par filiale ≠ « non applicable » par exigence.** Les
  deux mécanismes coexistent. Voir `PLAN_SERVEUR` §2.2.
- **JSONB uniquement** pour les documents figés (grille et constats d'audit, étapes
  RACI des scénarios PRA, `supplyChain` des prestataires, `metrics` de l'historique).
  Tout le reste est relationnel, avec de vraies contraintes.
- **Identifiants texte conservés** (`"RISK-<ts>-<alea>"`), pas d'UUID : c'est ce qui
  rend l'import d'un export `grc-backup` exact au round-trip.
- **Le périmètre de session vient du serveur**, jamais d'une valeur transmise par le
  navigateur (`cyber-context` en `localStorage` est à retirer côté frontend).
- **Tout contrôle que PostgreSQL applique hors des politiques porte `filiale_id`** —
  clé étrangère, unicité, exclusion. La RLS ne les voit pas : une clé simple est
  satisfaite par une ligne **invisible** de la filiale voisine, et une unicité sans
  `filiale_id` laisse une filiale occuper l'identifiant d'une autre. La porte S1 l'a
  élargie en deux temps : aux clés étrangères d'abord (`CONVENTIONS.md` §17.1), aux
  unicités ensuite (§19.1).
- **Un garde-fou que rien n'appelle est un commentaire.** Tout contrôle automatique du
  schéma se branche sur `f_verifier_schema()`, le point d'appel unique appelé par
  `migrate.mjs` et `install.sh` — et il s'y branche **en respectant la convention
  d'écriture** (`f_verifier_<x>()`, sans argument, rendant `(objet, anomalie, detail)`),
  pas en s'ajoutant à une liste. Ne jamais réintroduire de liste écrite à la main
  (`CONVENTIONS.md` §18.4, §19.4 et §19.5).

### Avancement au 31/08/2026

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ **livré** — squelette Node/TS, config validée au démarrage, pool PostgreSQL, serveur + point de santé, unité systemd durcie, vhost Apache + durcissement de portée serveur, `install.sh` idempotent, `backend/README.md` |
| **L1 — Schéma relationnel** | ✅ **livré** (vague 1), puis **corrigé au fil de la porte S1** — **47 tables** en 4 migrations, appliquées sur base neuve ; **188 politiques**, RLS activée **et forcée** partout ; clés étrangères et unicités **composites** `(id, filiale_id)` ; traçabilité imposée à l'insertion sur 42 tables ; garde-fous du schéma branchés sur `migrate.mjs` **et** `install.sh` via le point d'appel unique `f_verifier_schema()` ; `verifier_cloisonnement.sql` (**93 contrôles**, 0 échec) et `migrate.mjs` livrés ; **306 tests** `node:test` verts (229 base + 77 reprise). ⚠️ **Porte S1 jouée plusieurs fois et en cours de re-passage — livré ≠ validé** |
| L2 → L15 | ⬜ à faire — vagues 2 à 8, voir `docs/PLAN_EXECUTION.md` §3 et `PLAN_SERVEUR` §7 |

Livré aussi en vague 1, hors périmètre strict de L1 : **reprise des exports
`grc-backup`** (`backend/src/reprise/**`, portage serveur des migrations v1 → v12,
module pur, 77 tests) et **base de développement** (`db/dev/preparer_base_dev.sh`).

**État de la porte S1 — à lire, pas à deviner.** Le lot L1 a été soumis plusieurs fois
à la porte de sécurité, chaque passage étant mené par un auditeur qui n'avait écrit
aucune des lignes examinées. **Le verdict de chaque passage vit dans le journal des
portes de [`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md) §7**, avec le rapport
correspondant dans `docs/securite/` — c'est la source, et la seule. Un re-passage est
en cours : **ne rien conclure de l'absence de verdict ici.** Les arbitrages issus des
passages successifs sont figés dans `backend/db/CONVENTIONS.md` **§17, §18 et §19** :
les lire avant de toucher au schéma évite de rouvrir ce qui vient d'être fermé.

**Reprendre ici — vague 2, lot L2 (API et bascule de la persistance)**, le lot qui
porte le risque projet **P1** (écrasement silencieux) : couche d'accès générique par
entité, **verrouillage optimiste** (`where id = $1 and version = $2`, zéro ligne →
`GRC03`), chargement initial du jeu de données d'une filiale, puis **détournement de
`save()` et du chargement dans `datastore.js` / `persistence.js`** — la façade
synchrone est préservée, aucun module métier n'est réécrit. Ne pas démarrer tant que
la porte S1 n'est pas franchie (`docs/PLAN_EXECUTION.md` §1).

**Trois pièges que la vague 1 lègue à L2**, et qu'il vaut mieux traiter à la
conception qu'après :

1. **`UPDATE 0` n'est pas toujours un conflit de version.** Il vaut aussi « ligne
   absente » et « écriture refusée par la RLS ». Or `GRC03` se définit exactement sur
   ce zéro (`CONVENTIONS.md` §15) : sans distinction, l'API annoncera « modifié
   entre-temps, rechargez » à un utilisateur qui n'avait pas le droit d'écrire.
2. **Le client ne fixe plus `version`, `cree_le` ni `cree_par`** — la base les impose
   à l'insertion et les gèle ensuite (`CONVENTIONS.md` §18.1). Une couche d'écriture
   qui les envoie ne provoque pas d'erreur : ses valeurs sont simplement ignorées.
3. **`documents` porte une colonne engendrée** (`portee_groupe`) qui entre dans une
   clé étrangère : toute insertion doit **nommer ses colonnes**, et un aller-retour
   naïf « je relis la ligne, je la réinsère » échoue (`CONVENTIONS.md` §18.6).

**Comment le chantier est conduit** (vagues, propriété exclusive des fichiers par
agent, grille de sécurité rejouée à chaque porte, définition de « terminé ») :
**`docs/PLAN_EXECUTION.md`**. Conventions de schéma : **`backend/db/CONVENTIONS.md`**.
État détaillé des lots et des réserves : **`backend/README.md` §8**.

**Ce qui n'a pas pu être vérifié** sur la machine de développement, et qui reste donc
à éprouver sur la VM cible : l'installation Debian 13 complète, Apache, ClamAV,
l'Active Directory et le relais SMTP. Le schéma a été validé sur **PostgreSQL 16.13**,
la cible est **PostgreSQL 17**.

**Dette reportée, assumée et datée** (détail et échéances dans `backend/README.md` §8) :
les tables du substrat d'authentification (`sessions`, `session_filiales`,
`session_domaines`) restent écrivables sans condition par le rôle applicatif —
**condition d'entrée de L3** (`CONVENTIONS.md` §17.4) ; **la lecture du journal d'audit
n'est pas cloisonnée**, dérogation qu'impose le chaînage par empreinte et dont le
resserrement est un **livrable ferme de L5** ; la purge de sortie d'une filiale
(`PLAN_SERVEUR` §2.7) n'a aucun chemin applicatif et revient au **lot L13**.

### Vérifications à mener au démarrage du projet (côté client)

- Accès sortant de la VM vers Microsoft 365 (conditionne les notifications, lot L12).
- Existence d'une version anglaise officielle du questionnaire AirCyber (allégerait
  L11 d'un sixième du volume de traduction).
- **Validation formelle du découpage Groupe/Filiale par le RSSI groupe** (risque P5 du
  `PLAN_SERVEUR` §8). Elle était attendue *avant* L1 ; **aucune trace n'en subsiste dans
  le dépôt**, et L1 a été écrit sur le découpage arbitré en interne
  (`backend/db/CONVENTIONS.md` §16.4). À faire confirmer **avant la mise en service
  pilote** : changer le niveau d'une table après coup se paie en migration de données.

### Historique frontend

Le chantier 2 (harmonisation des tableaux denses, KPI, radars ; tooltips restants sur
Actions et Donneurs d'ordre) reste en suspens, sans priorité face au chantier serveur.
