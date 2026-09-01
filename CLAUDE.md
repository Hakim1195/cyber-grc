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
> **Reprise de travail — dans cet ordre, et l'ordre compte** :
>
> 1. **[`docs/PLAN_SERVEUR.md`](docs/PLAN_SERVEUR.md)** — le *quoi* (cadrage clos, fait autorité) ;
> 2. **[`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md)** — le *comment* : vagues, périmètre
>    exclusif de chaque agent, grille de sécurité, **journal des portes** (§7, la seule source
>    des verdicts) et **registre des constats ouverts** (§7 également, avec propriétaire et
>    échéance) ;
> 3. **[`backend/README.md`](backend/README.md) §8** — l'état réel des lots et les chiffres
>    rejoués ;
> 4. **[`backend/db/CONVENTIONS.md`](backend/db/CONVENTIONS.md) §22** si l'on ouvre la vague 3 :
>    la liste des conditions d'entrée à épuiser.
>
> Puis reprendre où le §8 de **ce** document dit de reprendre (« ▶ REPRENDRE ICI »).
> **Au 01/09/2026 : vague 3, lots L3 puis L5.** Les lots L0, L1 et L2 sont livrés et
> leurs portes S1 et S2 franchies — ne pas les refaire.

## 1. Le produit

Logiciel de **gouvernance, risques et conformité (GRC) cyber**. Public :
RSSI/consultants **et** non-experts à sensibiliser → chaque concept doit avoir une
**note pédagogique** (`Help.tip(...)`).

- **Frontend** : `cyber-gouvernance_V4/` — SPA maison (HTML/CSS/JS, sans framework,
  sans build), 26 modules métier. Conservée telle quelle : **seule sa couche de
  persistance a basculé** vers le serveur (`PLAN_SERVEUR` §1.3, lot L2 livré), et la
  façade synchrone `DataStore` est intacte — aucun module métier n'a été réécrit.
- **Backend** : `backend/` — Node.js 22 + TypeScript + PostgreSQL, Debian 13,
  **sans conteneur**, Apache2 en frontal. Lots L0, L1 et L2 livrés ; **pas encore
  d'authentification** (lot L3), donc **il ne sert de données qu'en développement**.
- **Branche** : la consigne utilisateur reste **« tout pousser sur `main`, ne pas créer
  de branche de travail »**. ⚠️ Le chantier serveur est de fait conduit sur
  **`claude/backend-plan-serveur-hj46fs`** : ne pas « corriger » l'un ou l'autre sans
  demander — c'est un arbitrage qui appartient à l'utilisateur, pas à une session.
- **Marque** : Dedienne Aerospace pour le frontend actuel ; la cible serveur rend
  **logo et raison sociale configurables par filiale** (`PLAN_SERVEUR` §6).

## 2. Décisions structurantes (VALIDÉES — ne pas re-débattre)

| Sujet | Décision |
|-------|----------|
| Identité visuelle | **Orange dominant** (Option B) : structure bleue `#2059A6`, action/marque orange `#E9631B`. Couleurs sémantiques strictes (vert=conforme, orange=partiel, rouge=critique, gris=NA) réservées aux statuts. |
| Marque | **Garder Dedienne Aerospace** (logo `assets/logo/logo-dedienne.png`). |
| ~~Chiffrement navigateur~~ | ⚠️ **CADUC depuis le lot L2.** Le coffre opt-in du navigateur est **retiré** : plus aucune donnée n'est stockée sur le poste, et un coffre qui ne protège rien est une fausse assurance. Le chiffrement au repos est celui du **disque de la VM** (`PLAN_SERVEUR` §1.9). L'export de fichier, lui, peut toujours être chiffré. |
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
│   ├── api.js         (L2)    SEUL point du frontend qui parle au réseau (/api/…)
│   ├── session.js     (L2)    périmètre TEL QUE LE SERVEUR LE RÉSOUT (objet gelé, sans mutateur)
│   ├── sync.js        (L2)    BASCULE : chargement, écritures ciblées, verrouillage optimiste, sondage
│   ├── reprise.js     (L2)    reprise de la base héritée d'un poste (export puis import)
│   ├── persistence.js         ne persiste plus rien — LIT la base IndexedDB héritée, en lecture seule
│   ├── crypto.js              Web Crypto (PBKDF2 + AES-GCM) — sert encore à l'export chiffré
│   ├── vault.js               coffre RETIRÉ ; devenu la PORTE DE DÉMARRAGE (liaison au serveur)
│   ├── datastore.js           SOURCE DE VÉRITÉ EN MÉMOIRE ; API CRUD synchrone — façade préservée
│   ├── router.js              routeur par hash (#/route, #/route/:id)
│   ├── ui.js                  helpers partagés (UI.genId, badges, suppression, multi-personnes)
│   └── help.js                composant tooltip pédagogique `Help.tip(text)`
├── js/services/
│   ├── backup.js              export/import `grc-backup` — FORMAT D'ÉCHANGE, plus une sauvegarde
│   ├── importExcel.js, exportExcel.js, exportPDF.js
│   ├── echeances.js           AGRÉGATEUR d'échéances (lecture seule) `window.Echeances`
├── js/modules/                26 modules ; 1 module = 1 domaine (IIFE `XxxModule.renderList/renderDetail`)
│   └── dashboard, synthese, echeances, clients, personnel, actifs, cartographie, risques, matrice, exigences,
│       referentiels, mesures, conformite, mapping, incidents, documents, rgpd,
│       actions, bia, crise, pra_scenarios, pra_mco, pra_tests,
│       pra_prestataires, audits, settings
├── js/lib/xlsx.full.min.js    SheetJS (embarqué)
└── js/app.js                  bootstrap (Vault.boot = liaison serveur → init → routes → breadcrumb/menu)
```

### Conventions
- **UI en français.** Voix active, libellés orientés action.
- Module = IIFE retournant `{ render / renderList / renderDetail }`. Rendu via `app.innerHTML = template`.
- **DataStore : API 100 % synchrone** pour les modules (`getX/addX/updateX/deleteX`).
  L'asynchrone — hier IndexedDB, aujourd'hui le serveur — est absorbé **sous** la façade,
  dans `js/core/sync.js` et là seulement. **Ne pas casser l'API sync** : c'est la parade au
  risque projet P3, et c'est ce qui a permis de basculer 26 modules sans en réécrire un seul.
- **Sécurité XSS** : échapper toute donnée utilisateur injectée en DOM. `escapeHtml` est
  partagé (`window.escapeHtml`) et généralisé à tous les modules — la dette du chantier 9
  est soldée. La porte S2 a néanmoins trouvé deux injections résiduelles : l'échappement
  ne se relâche jamais, y compris dans un panneau de détail ou un `<option>`.
- **Aucun gestionnaire en ligne.** Pas d'`onclick=`, `onchange=`, `oninput=`, `onsubmit=`
  dans le balisage : la **politique de sécurité de contenu du vhost livré les bloque**, et
  l'application ne fonctionnait pas dans sa configuration de déploiement. On branche après
  rendu (`addEventListener`), et **aucune donnée ne voyage dans un attribut de gestionnaire**.
- **L'identifiant d'un enregistrement se lit dans un attribut du DOM au moment du clic,
  jamais capturé en chaîne dans une fermeture.** Écrire
  `row.dataset.id = enr.id` puis `row.onclick = () => Router.navigateTo('/actifs/' + row.dataset.id)`,
  et non `const id = enr.id; …() => …(id)`. Raison : **le serveur réattribue l'identifiant à
  la création** — proposer le sien est refusé (oracle d'existence inter-filiales). Une
  fermeture qui a capturé l'ancien continue donc de viser un enregistrement qui n'existe
  plus, **en silence** : le clic ne mène nulle part, et « Supprimer la sélection » confirme
  une suppression qui n'a pas lieu. Le recalage du balisage — `recalerBalisage()`, interne
  à `js/core/sync.js` et appelé par le renommage — réécrit les **attributs** du balisage
  déjà rendu, mais **il ne peut rien pour une valeur capturée** : la réparation ne tient
  que si la convention est respectée. Capturer l'**objet** (`enr`, puis lire `enr.id`
  au clic) fonctionne aussi, puisque le renommage l'a modifié en place.
- **Pédagogie** : `${Help.tip("explication courte")}` à côté des termes techniques.
- **Design** : n'utiliser que les tokens de `tokens.css`. Semantique stricte.
- **IDs** : **un seul générateur effectif par langage**. Côté navigateur, c'est
  `UI.genId(prefix)` — les deux enveloppes qui existent (`js/core/datastore.js`,
  `js/services/importExcel.js`) se contentent de lui déléguer, avec un repli défensif si
  `UI` n'est pas chargé. Forme `"<PRÉFIXE>-<horodatage>-<aléa>"` ; **ce qui est normatif
  est une propriété, pas un encodage** : au moins 52 bits tirés d'un générateur
  cryptographique (`backend/db/CONVENTIONS.md` §2, qui fait foi — il recense les **cinq**
  endroits où le produit fabrique un identifiant : trois générateurs aléatoires et deux
  dérivations qui ne tirent rien). **Ne jamais recopier la convention dans une fonction
  locale** : le durcissement de l'un de ces générateurs a laissé les autres derrière —
  deux fois. L'une de ces omissions a coûté le seul constat bloquant d'un
  passage de porte — un import qui écrivait *223 lignes sur 250 en annonçant le succès*,
  chiffre mesuré par l'auditeur et consigné au `backend/db/CONVENTIONS.md` §2.

## 4. Persistance & modèle de données (résumé — détail dans DATA_MODEL.md)

> ⚠️ **Depuis le lot L2, les données vivent sur le serveur (PostgreSQL).** Le navigateur
> n'écrit plus rien : ni IndexedDB, ni miroir `localStorage`, ni points de restauration
> locaux, ni coffre de chiffrement. Ce qui suit décrit **la forme de l'objet `data`** — celle
> que voient les modules à travers la façade préservée, et celle du fichier d'échange
> `grc-backup`. C'est une **représentation de transport**, plus un lieu de stockage. La
> correspondance avec les tables du serveur est dans `docs/DATA_MODEL.md` §1.5 ; le compte
> exact, rejoué, est dans `backend/README.md` §8.
>
> Ce qui subsiste d'IndexedDB : `js/core/persistence.js` sait **lire** la base héritée d'un
> poste, en lecture seule, pour permettre sa reprise. Rien n'est effacé d'un poste sans un
> geste explicite de l'utilisateur, et jamais avant que ses données soient à l'abri.
>
> Le **numéro de version** d'un enregistrement (verrouillage optimiste, risque P1) n'est
> **pas** dans l'enregistrement : il est tenu à part dans `js/core/sync.js`, précisément
> pour que `data` garde la forme décrite ici et qu'un module qui reconstruit un objet ne
> puisse pas perdre la version au passage (`docs/DATA_MODEL.md` §1.4).

- `SCHEMA_VERSION = 12` dans `datastore.js` — elle numérote la forme de `data` et du fichier
  `grc-backup`, pas les migrations SQL. Migrations à l'import via `migratePayload` côté
  navigateur, et **paliers v1 → v12 rejoués côté serveur** (`backend/src/reprise/`).
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

> ⚠️ **La SPA ne démarre plus seule.** Depuis le lot L2, elle charge session, modèle et jeu
> de données **avant** de s'afficher ; sans serveur joignable, elle refuse de démarrer et
> propose « Réessayer ». C'est délibéré : démarrer sur un jeu vide afficherait « aucun
> risque, aucune action, aucun incident » dans un outil qui sert de preuve en audit. Un
> `python3 -m http.server` sur `cyber-gouvernance_V4/` seul ne suffit donc plus.

- **Monter le serveur d'abord** (une fois par poste) :
  `pg_ctlcluster 16 main start` puis, depuis `backend/`,
  `bash db/dev/preparer_base_dev.sh` (rôles + base + migrations). Le serveur ne sert de
  données **qu'en `NODE_ENV=developpement`** : hors de là, il répond `503` — la
  recette comprise, et c'est voulu (`backend/README.md` §7). Il faut aussi **au moins une
  filiale active** en base, sans quoi la session ne se résout pas.
- **Servir la SPA** sur une vraie origine (pas `file://`) avec `/api/**` relayé vers le
  serveur. Le banc d'essai monte exactement cela : `backend/test/aide/navigateur.mjs` sert
  `cyber-gouvernance_V4/` **tel quel** et relaie `/api/**` vers l'instance Fastify réelle —
  c'est le montage à reprendre plutôt qu'à réinventer.
- **Tests headless** : Node + Playwright global à `/opt/node22/lib/node_modules/playwright`,
  Chromium à `/opt/pw-browsers`. Les tests navigateur **vivent désormais dans le dépôt**
  (`backend/test/navigateur/`, joués par `npm test`) : la porte S2 a constaté qu'il n'en
  existait aucun alors que ce paragraphe les impose depuis le début du projet, et que
  **six de ses constats, dont les trois bloquants, ne se voient que là**. Les scripts
  d'exploration et les captures restent dans le scratchpad.
  Toujours vérifier `pageerror`/`console` (objectif : 0 erreur) et prendre des captures pour validation visuelle.
- **Éprouver sous la CSP réelle.** L'application a été livrée un temps sans fonctionner dans
  sa configuration de déploiement : soixante-quatre gestionnaires en ligne étaient bloqués
  par la politique de sécurité de contenu du vhost, et aucun test ne l'avait vu. La règle
  qui en découle : la politique se **lit dans `backend/deploy/apache/cyber-grc.conf`**, elle
  ne se recopie pas à la main.
- **Banc d'essai serveur** : depuis `backend/`, `npm test` (base, API, reprise, navigateur),
  `npm run verifier-types`, `npm audit --omit=dev`. Chaque fichier de test monte une base
  neuve en appelant le vrai `db/migrate.mjs`.
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

## 7. État d'avancement du produit NAVIGATEUR (historique — voir docs/PLAN.md pour le détail)

> ⚠️ **Section historique.** Elle recense les chantiers du produit 100 % navigateur, dans
> l'ordre où ils ont été livrés. Elle reste utile — c'est là qu'on retrouve *pourquoi* un
> module est fait comme il est — mais elle **ne décrit pas l'état actuel du produit** :
> la persistance a basculé sur le serveur au lot L2. Ce qui, ci-dessous, concerne le
> stockage local (IndexedDB, points de restauration, coffre opt-in, rappel d'export, quota)
> a été **retiré ou remplacé** ; voir §4 et `docs/DATA_MODEL.md` §1. L'état du chantier en
> cours est au **§8**.

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
  rend l'import d'un export `grc-backup` exact au round-trip. Ce qui est normatif est
  une **propriété** — au moins 52 bits d'aléa cryptographique —, pas une forme unique :
  le produit en fabrique à **cinq endroits, dans trois langages** (`CONVENTIONS.md` §2).
  **Un seul générateur aléatoire par langage**, jamais de clone local.
- **Le périmètre de session vient du serveur**, jamais d'une valeur transmise par le
  navigateur. Tenu par la **forme** : `resoudre()` ne prend aucun argument, et
  `js/core/api.js` n'expose aucun paramètre de filiale. Les clés `cyber-context` et
  `cyber-vault` du `localStorage` sont purgées au démarrage **et à la fermeture**
  (`js/core/session.js`). Ne pas confondre deux choses longtemps réunies sous une seule
  étiquette « Périmètre Actif » : le **périmètre**, qui vient du serveur et s'affiche en
  lecture seule, et le **filtre « donneur d'ordre »**, simple confort d'affichage interne
  à la filiale — il vit désormais en mémoire (`window.FiltreDonneurOrdre`, `js/app.js`) et
  ne survit plus d'une session à l'autre.
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

### Avancement au 01/09/2026

| Lot | État |
|---|---|
| **L0 — Socle d'infrastructure** | ✅ **livré** — squelette Node/TS, config validée au démarrage, pool PostgreSQL, serveur + point de santé, unité systemd durcie, vhost Apache + durcissement de portée serveur, `install.sh` idempotent, `backend/README.md` |
| **L1 — Schéma relationnel** | ✅ **livré** (vague 1), corrigé au fil de la porte **S1** — une cinquantaine de tables (compte rejoué dans `backend/README.md` §8), RLS activée **et forcée** partout, propriétaire compris ; clés étrangères et unicités **composites** `(id, filiale_id)` ; traçabilité imposée à l'insertion sur 42 tables ; garde-fous du schéma branchés sur `migrate.mjs` **et** `install.sh` via le point d'appel unique `f_verifier_schema()` |
| **L2 — API et bascule de la persistance** | ✅ **livré** (vague 2), corrigé au fil de la porte **S2** — couche d'accès générique par entité, **verrouillage optimiste** (risque P1), diagnostic d'`UPDATE 0` en cinq verdicts, chargement du jeu de données d'une filiale, route de reprise transactionnelle, **bascule de `datastore.js` / `persistence.js`** avec la façade synchrone **intacte** (130 membres avant, 130 après), session provisoire **fail-closed** hors développement |
| L3 — Authentification AD et droits · L5 — Journal | ⬜ **à faire — vague 3, c'est ici qu'on reprend** |
| L4 → L15 | ⬜ à faire — vagues 4 à 8, voir `docs/PLAN_EXECUTION.md` §3 et `PLAN_SERVEUR` §7 |

Livré aussi en vague 1, hors périmètre strict de L1 : **reprise des exports
`grc-backup`** (`backend/src/reprise/**`, portage serveur des migrations v1 → v12,
module pur) et **base de développement** (`db/dev/preparer_base_dev.sh`).

**État des portes — à lire, pas à deviner.** Les lots L1 et L2 ont été soumis à leur
porte de sécurité six et quatre fois, chaque passage étant mené par un auditeur qui
n'avait écrit aucune des lignes examinées. **Le verdict de chaque passage vit dans le
journal des portes de [`docs/PLAN_EXECUTION.md`](docs/PLAN_EXECUTION.md) §7**, avec le
rapport correspondant dans `docs/securite/` — c'est la source, et la seule. Au
01/09/2026 il porte **S1 « CONFIRMÉE FRANCHIE » (6ᵉ passage)** et **S2 « FRANCHIE »
(4ᵉ passage)**. Les arbitrages issus de ces passages sont figés dans
`backend/db/CONVENTIONS.md` **§2, §17 à §23** : les lire avant de toucher au schéma
évite de rouvrir ce qui vient d'être fermé.

**Franchie ne veut pas dire sans réserve.** Les constats restants vivent dans le
**registre des constats ouverts** du même §7, chacun avec un **propriétaire nommé, une
échéance et un état**. Ce registre n'est ni recopié ni résumé ici — deux listes des mêmes
constats divergent, et la divergence est silencieuse. Y lire la **colonne d'état** :
un constat n'en sort que **corrigé *et* rejoué** à la porte, si bien que « corrigé, en
attente du rejeu » n'est pas « réglé ». Il existe parce que la vague 1 avait mesuré,
chiffré et écrit un défaut de générateur d'identifiants **sans l'attribuer à personne** :
il est ressorti deux vagues plus tard en **bloquant**, avec un import qui écrivait 223
lignes sur 250 *et annonçait le succès*. **Un constat chiffré et non attribué est un
constat perdu.**

### ▶ REPRENDRE ICI — vague 3 : L3 (authentification AD et droits), puis L5 (journal)

C'est le chemin critique. Le lot **L3** apporte LDAPS et les groupes AD imbriqués, les
sessions serveur, le modèle de droits à **trois axes** (périmètre × profil métier ×
domaine), le **droit d'export distinct**, le compte de secours et la limitation de
rythme. Une fois L3 stable vient **L5**, le journal d'audit : couverture complète des
événements du `PLAN_SERVEUR` §1.7, consultation, export, vérification du chaînage.

**Le point d'accroche existe déjà** : l'interface `ResolveurPerimetre`
(`backend/src/api/session.ts`). L3 en fournit une autre implémentation, et **rien
d'autre ne change** dans `backend/src/api/`. Le fichier actuel dit, ligne par ligne, ce
que L3 doit mettre à la place de chaque approximation provisoire.

**Les conditions d'entrée sont écrites, et elles sont fermes.** La liste que la vague 3
doit épuiser est le **`backend/db/CONVENTIONS.md` §22** — six conditions (E1 à E6),
chacune disant *où lire* et *comment la porte S3 vérifiera*. Elle existe parce que ces
décisions sont écrites à cinq endroits différents, arbitrées à quatre passages de porte
distincts, et qu'une vague qui ouvre sans les avoir toutes lues en oubliera. Les trois
qui coûtent le plus cher si on les découvre tard :

1. **`sessions`, `session_filiales` et `session_domaines` sont écrivables sans condition
   par le rôle applicatif** — circulaire et assumé, parce que ces tables *produisent* la
   décision d'autorisation. Tant que ce n'est pas fermé, les requêtes intégralement
   paramétrées sont la **seule** parade (`CONVENTIONS.md` §17.4, condition E1).
2. **Les clés primaires composites sont reportées**, par un arbitrage écrit et daté
   (`CONVENTIONS.md` §21). Reconduire ce report sans le réécrire est exactement ce que le
   chantier a appris à ne plus faire.
3. **Toute route qui exige l'administration Groupe la *vérifie* ; aucune ne la *pose*.**
   C'est vrai aujourd'hui et démontré par un test mécanique — mais c'est une propriété du
   code d'aujourd'hui, **pas une barrière**. Le drapeau reste une déclaration que la
   session fait sur elle-même : à L3 de le faire décider par le modèle de droits
   (condition E2).

**Ne pas croire acquis** ce que L3 peut casser sans le voir : le périmètre vient du
serveur parce qu'*aucun chemin ne le lit ailleurs* — or L3 introduit précisément la
couche qui le **fabrique**, et devient donc le seul endroit où l'erreur est possible.
Le `CONVENTIONS.md` §22 en liste trois de cette nature.

**Ce que la vague 2 a déjà réglé, et qu'il ne faut pas re-traiter** — les trois pièges
que ce document annonçait comme légués à L2 sont **fermés** :

| Piège | Ce qui a été fait |
|---|---|
| `UPDATE 0` ne distingue pas conflit de version, ligne absente et refus RLS | `diagnostiquerEcriture()` tranche **dans la même transaction** que l'écriture qui a échoué, en cinq verdicts (`conflit_version` → 409 + `GRC03`, `invisible` → 404, `autre_filiale` / `portee_groupe` / `refus_politique` → 403) |
| Le client ne fixe ni `version`, ni `cree_le`, ni `cree_par` | ces colonnes sont **exclues par construction** en écriture, et un champ client qui les viserait est **refusé**, pas ignoré |
| `documents.portee_groupe` est une colonne engendrée qui entre dans une clé étrangère | toute insertion **nomme ses colonnes**, liste filtrée sur `engendree = false` — découverte, pas recopiée |

**Comment le chantier est conduit** (vagues, propriété exclusive des fichiers par
agent, grille de sécurité — **dix-huit contrôles** — rejouée intégralement à chaque
porte, définition de « terminé ») : **`docs/PLAN_EXECUTION.md`**. Conventions de
schéma : **`backend/db/CONVENTIONS.md`**. État détaillé des lots, chiffres rejoués et
réserves : **`backend/README.md` §8**.

**Ce qui n'a pas pu être vérifié** sur la machine de développement, et qui reste donc
à éprouver sur la VM cible : l'installation Debian 13 complète, le TLS et le mandataire
inverse d'Apache, ClamAV, l'Active Directory et le relais SMTP. Nuance apportée par la
vague 2 : la **politique de sécurité de contenu et les en-têtes** du vhost, eux, ont été
éprouvés — extraits du fichier livré et appliqués à un Chromium réel, ce qui a révélé que
l'application ne fonctionnait pas dans sa configuration de déploiement. Le schéma a été
validé sur **PostgreSQL 16.13**, la cible est **PostgreSQL 17**.

**Dette reportée, assumée et datée** (détail et échéances dans `backend/README.md` §8) :
les tables du substrat d'authentification restent écrivables sans condition par le rôle
applicatif — **condition d'entrée de L3** ; **la lecture du journal d'audit n'est pas
cloisonnée**, dérogation qu'impose le chaînage par empreinte et dont le resserrement est
un **livrable ferme de L5** ; **aucun droit par domaine ni droit d'export distinct**, et
**aucune écriture au journal d'audit** par l'API — lots L3 et L5 ; la purge de sortie
d'une filiale (`PLAN_SERVEUR` §2.7) n'a aucun chemin applicatif et revient au **lot L13**.

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
