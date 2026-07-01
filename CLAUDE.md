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
- **Branche de travail** : `claude/decompress-zip-folder-230woc` (pousser dessus)
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
- **Référentiels** : démarré par **Hygiène ANSSI (42 mesures)** ; suite ISO 27002 / NIS2 / DORA / AirCyber (4c).
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
├── js/modules/                1 module = 1 domaine (IIFE `XxxModule.renderList/renderDetail`)
│   └── dashboard, synthese, clients, actifs, risques, matrice, exigences,
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
- `SCHEMA_VERSION = 6` dans `datastore.js`. Migrations à l'import via `migratePayload`.
- Entités (tableaux) : clients, exigences, actions, risques, actifs, processus, crise,
  scenarios_pra, tests_pra, prestataires, mco_actions, audits, revues,
  **evaluations** (auto-évaluations de référentiels), **mesures** (pivot « Mesure de sécurité »),
  **incidents** (registre des incidents), **documents** (registre des politiques)
  et **traitements** (registre RGPD art. 30, mesures reliées au pivot).
- Référentiels : catalogue **statique** (registre `js/data/referentiels.js` + fichiers `ref_*.js`),
  hors `data`. Livrés : ANSSI (42), ISO 27002 (93), NIS2 (10), DORA (15), AirCyber/BoostAerospace (234).
  Ne pas embarquer le texte des normes (reformulations originales + identifiants de clauses).
  AirCyber = questionnaire réel (généré depuis un CSV via un script du scratchpad, non versionné) ;
  import in-app des réponses (bouton sur la fiche AirCyber, parsing SheetJS, mapping Oui/Non→statut).
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

**Fait (suite)** : Référentiels **4c** (ISO 27002, NIS2, DORA, **AirCyber réel 234 q** + **import
CSV des réponses**) + **couverture croisée** + **génération SoA** ; **Registre des incidents**
(v4, déclarations NIS2/RGPD) ; **Gestion documentaire** (v5, politiques + alertes de revue +
canevas) ; **Registre RGPD** (v6, traitements art. 30, mesures reliées au pivot, registre
imprimable) ; **Tableau de bord** enrichi (cockpit GRC 360°, graphes SVG maison) ;
**Durcissement** partiel (escapeHtml partagé + XSS exigences/risques ; IDs anti-collision).

**Prochain** : Chantier 8 — améliorations modules (export image matrice EBIOS ; fiches réflexes
de crise imprimables ; risque fournisseur / chaîne d'appro) ; fin du durcissement (XSS modules
restants, orphelins, factorisation, `QuotaExceededError`) ; mapping pré-rempli inter-référentiels.
