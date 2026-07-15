# Changelog — Cyber GRC

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Application 100 % frontend (HTML/CSS/JS, sans backend).

## [Non publié]

### Audits — modèle ISO/IEC 27001:2022 (système de management + Annexe A) + composites
- **Nouveau référentiel « ISO/IEC 27001:2022 — Système de management » (chap. 4-10)** :
  `js/data/ref_iso27001_smsi.js`, **30 exigences** du SMSI réparties en 7 chapitres (contexte,
  leadership, planification, support, fonctionnement, évaluation, amélioration). Comble un manque :
  l'app ne représentait qu'**l'Annexe A** ; or un audit clause 9.2 vérifie d'abord ces exigences de
  management. Référentiel « normal » : browsable, auto-évaluable, radar, SoA, couverture, mapping.
  Gardé **séparé** de l'Annexe A (les chapitres 4-10 sont obligatoires — pas d'applicabilité à déclarer).
- **Modèles d'audit ISO livrés** : `audit_iso27001_smsi.js` (**31 points de contrôle** pour le SMSI)
  et `audit_iso27002.js` (**93 points**, un par mesure de l'Annexe A).
- **Modèles d'audit COMPOSITES** : nouveau mécanisme `AuditModeles.registerComposite(id, {nom, sources})`
  — un modèle « virtuel » qui concatène plusieurs modèles sources. Premier composite livré :
  **« ISO/IEC 27001:2022 — Audit complet (SMSI + Annexe A) » = 124 points de contrôle** en une seule
  grille (les 30 exigences de management + les 93 mesures de l'Annexe A, l'intégralité de la norme).
  `buildGrid` / `countPoints` / `available` / `nameOf` résolvent les composites.
- **Fidélité** : reformulations maison, texte ISO **non reproduit** (norme protégée). Les 124 points
  couvrent l'ensemble des exigences ; le découpage « 236 » de certains guides est une décomposition
  plus fine (chaque « shall » isolé) — la couverture, elle, est complète.
- Tests Playwright : SMSI 16 assertions + ISO complet 13 assertions, **0 erreur** (référentiel chargé,
  grilles 31/93/124, composite, rendu UI, persistance, intégration section Référentiels).

### Audits — modèles d'audit générés depuis les référentiels (ANSSI)
- **Nouveau : grille d'audit sur référentiel** dans le module `/audits`. À la création/édition d'un
  audit interne, un sélecteur permet de choisir un référentiel puis de **générer une grille de points
  de contrôle détaillés** couvrant l'intégralité de ses exigences : pour chaque point, *ce que
  l'auditeur doit vérifier* + *les preuves à demander*. L'auditeur qualifie chaque point (Conforme,
  Point fort, Piste d'amélioration, NC mineure, NC majeure, N/A) et saisit la preuve observée.
- **Premier modèle livré : Hygiène informatique ANSSI (42 mesures → 46 points de contrôle)**,
  reformulations maison fidèles à l'intention du guide public (aucun texte de norme recopié).
- **Catalogue statique extensible** : nouveau registre `js/data/audit_modeles.js` (`AuditModeles`,
  `register` / `buildGrid` / `available`) + un fichier de contenu par référentiel (`audit_anssi.js`).
  La grille est **croisée à la volée** avec le registre `Referentiels` (domaine + intitulé + aide) —
  zéro double saisie des titres. Suite prévue : ISO 27001, NIS2, DORA, AirCyber.
- **Couverture & conformité en direct** : KPI dans la fiche (X/N points évalués, conformes, NC, N/A,
  **taux de conformité** = conformes ÷ applicables, N/A exclues) + barre de progression ; colonne
  **Modèle (couverture)** dans la liste des audits.
- **Rapport PDF enrichi** : le rapport imprimable inclut un tableau de synthèse de conformité puis la
  grille **groupée par domaine** (badges colorés + preuves observées). Les **constats libres**
  historiques restent disponibles (section dédiée, hors grille).
- **Cockpit tenu à jour** : le tableau de bord et la Synthèse comptent désormais les non-conformités
  issues de la grille (mineure/majeure) en plus des constats libres.
- **Rétrocompatible, sans évolution de schéma** : deux champs optionnels sur l'entité `audits`
  (`ref_id`, `items[]`), portés par la sauvegarde unifiée (IndexedDB, chiffrement, export/import,
  points de restauration). Les audits existants restent des « audits libres ». Échappement XSS
  conservé. Tests Playwright (19 assertions, 0 erreur : génération 46 points, saisie, persistance
  après rechargement, rapport PDF).

### Correction — le référentiel « ISO 27002 » devient « ISO/IEC 27001:2022 »
- **Notion corrigée** : le référentiel des 93 mesures était présenté comme *ISO/IEC 27002:2022*.
  Or ces mesures sont celles de l'**Annexe A d'ISO/IEC 27001:2022**, la norme **certifiable** du
  SMSI, et c'est bien contre l'ISO 27001 qu'on établit la **déclaration d'applicabilité (SoA)**
  générée par l'application. Le détail de mise en œuvre de ces mesures, lui, relève de l'ISO 27002.
- **Corrigé partout où c'est visible** : nom, version (« Annexe A · 93 mesures »), description et
  aide du référentiel (`ref_iso27002.js`) ; étiquette de colonne et infobulles du module
  **Correspondances** (`mapping.js`), tooltip **Référentiels** (`referentiels.js`), note de la
  **Synthèse** (`synthese.js`), commentaires du catalogue de correspondances (`mappings.js`) et
  documentation (`CLAUDE.md`, `docs/PLAN.md`, `docs/DATA_MODEL.md`).
- **Sans impact sur les données** : l'**identifiant technique reste `iso-27002-2022`** (et le nom
  de fichier `ref_iso27002.js` est inchangé). Cet id est la **clé** des évaluations
  (`evaluations[].ref_id`) et des correspondances (`data.mappings[].refs`) déjà enregistrées dans
  le navigateur ; le chargement depuis IndexedDB n'appliquant aucune migration de contenu, le
  renommer aurait rendu ces données orphelines. Aucune évolution de schéma.
- **Non touché** : le texte d'une question du questionnaire **AirCyber** cite « ISO 27001/27002 »
  comme exemples de cadres — contenu réel du référentiel, conservé tel quel.

### Synthèse Direction — refonte en tableau d'arbitrage (KPI / KRI + rapport)
- **Refonte complète du module `/synthese`** : d'une note à 3 chiffres vers un véritable
  **support de décision pour la direction** (COMEX / conseil), pensé pour *arbitrer* et pas
  seulement observer. Aucune évolution de schéma (lecture seule du DataStore).
- **Indice de posture cyber (0-100)** : note composite avec **jauge** et bande de lecture
  (Critique → Optimale) = moyenne pondérée des composantes disponibles (**conformité 30 %,
  maturité 20 %, maîtrise du risque 25 %, avancement 10 %, couverture 15 %**), renormalisée sur
  les composantes présentes, **moins des pénalités** (risques très critiques, déclarations
  réglementaires en attente). Décomposition affichée + note de méthode via `Help.tip`.
- **Bandeau d'orientation exécutive** : titre + message de synthèse priorisé (déclaration
  réglementaire › risque très critique › retards › risques critiques › conformité). En base
  vierge, message **honnête** « Démarche GRC à initialiser » (plus de « posture maîtrisée » trompeuse).
- **6 KPI** (performance) avec **variation de tendance** colorée : conformité, maturité CMMI,
  avancement du plan d'actions, couverture du dispositif (12 capacités GRC), audits réalisés /
  NC ouvertes, documentation à jour.
- **8 KRI** (risque) avec **seuils d'alerte** (pastille verte/orange/rouge + statut « Sous
  contrôle / À surveiller / Seuil d'alerte ») : exposition résiduelle, risques très critiques,
  risques critiques, actions en retard (avec retard max), incidents ouverts/graves, **déclarations
  NIS2/RGPD en attente**, tiers à risque élevé (criticité × accès), non-conformités.
- **Sections d'aide à la décision** : courbes d'**évolution** (historique quotidien partagé avec
  le tableau de bord), **conformité réglementaire par référentiel** (ANSSI/ISO/NIS2/DORA/AirCyber
  avec posture d'obligation), **Top 5 risques résiduels** + état de traitement, **comparatif par
  donneur d'ordre**, **arbitrages & décisions attendus** générés depuis les données (budget,
  acceptation de risque, tiers, continuité, maturité…), **points de vigilance & échéances**.
- **Impression & téléchargement du rapport** : impression PDF native (mise en page dédiée) **et**
  **téléchargement d'un rapport HTML autonome** (hors-ligne, sans dépendance, marque Dedienne,
  bulles d'aide masquées) — le module **embarque sa propre feuille de style** (portée `.syndir`)
  pour un rendu identique à l'écran, à l'impression et dans le fichier exporté.
- **Graphiques 100 % maison** (jauge, anneau, sparklines, barres) en SVG/HTML sans librairie.
- **Tests headless (Playwright)** : jeu de données riche (jauge, 6 KPI, 8 KRI, 5 référentiels,
  Top 5 risques, 8 décisions, vigilance) + **téléchargement du rapport** (fichier valide, autonome,
  sans boutons de navigation, rendu dans un onglet neuf sans erreur) + **état vide** (bandeau
  honnête, aucune division par zéro) + **rendu impression** ; **0 erreur console**.

### Référentiels — AirCyber : radar par niveau de label + score Oui/Non (sans CMMI)
- **Radar granulaire par niveau de label** : sur la fiche AirCyber, des boutons
  **Global / Bronze / Argent / Or** au-dessus du radar restreignent le profil par domaine CL
  aux seules questions du niveau choisi (« suis-je prêt pour le label Bronze ? »). Le tracé
  prend la **teinte du niveau** (bronze, argent, or ; bleu structure pour Global), le bouton
  actif aussi, et une note sous le graphique indique le nombre de questions représentées
  (66 Bronze, 57 Argent, 33 Or, 156 au global). La vue de niveau est **conservée** lors des
  mises à jour temps réel ; la fiche s'ouvre toujours sur Global.
- **Fin des scores CMMI pour AirCyber** (`scoring: "conformite"` dans le catalogue) : le
  questionnaire se répond désormais uniquement par **Oui / Non / N-A** (colonnes « Question »
  / « Réponse », colonne et sélecteur **Maturité supprimés** pour ce seul référentiel).
  **Score de conformité = réponses « Oui » ÷ questions applicables** : les **N/A sont exclues
  du calcul**, une question non répondue compte comme « Non » (même règle que le panneau
  « préparation au label »). KPIs adaptés (Score de conformité, Réponses « Oui », Questions
  évaluées), scores par chapitre en **%** au lieu de x/5, axes du radar = taux de « Oui ».
- **Cohérence transverse** : la **SoA** AirCyber n'affiche plus la colonne « Mat. » ; sur le
  **tableau de bord**, AirCyber est **exclu de la moyenne de maturité CMMI** (KPI, tendance,
  synthèse de posture) et sa barre « Maturité par référentiel » affiche son **score %** avec la
  légende « score Oui/Non (sans échelle CMMI) ». L'**import CSV** ne pose plus de maturité
  heuristique (statuts seuls). La saisie ne touche plus au champ `maturite` stocké (préservé
  mais ignoré) ; un statut hérité « partiellement conforme » (propagation pivot/correspondances)
  reste affiché sans être proposé, et compte comme « pas Oui » dans le score. Le panneau
  « préparation au label » se **rafraîchit désormais en direct** à chaque réponse.
- **Les autres référentiels ne changent pas** : ANSSI, ISO 27002, NIS2 et DORA conservent les
  5 statuts, l'échelle de maturité CMMI 0-5, leurs KPIs et leur radar.
- **Tests headless (Playwright)** : 64 assertions — colonnes/réponses/KPIs du questionnaire,
  géométrie exacte du radar par niveau (Bronze CL1 4/4 → sommet au bord), teintes par niveau,
  score et préparation au label recalculés en direct (vue de niveau conservée), maturité héritée
  préservée, statut hérité affiché, import CSV sans maturité, non-régression ANSSI (statuts,
  CMMI, radar 10 axes), SoA 6/7 colonnes, tableau de bord ; **0 erreur console**.

### Référentiels — AirCyber : profil de maturité par domaine de classification (CL)
- Le **radar « Profil de maturité par domaine »** du référentiel AirCyber est désormais construit
  sur les **domaines de classification CL existants** (CL0 Governance, CL1 Security event
  management, CL2 Malwares, CL3 Protect end user devices, CL4 Secure network architecture,
  CL5 Identity & access management, CL6 Data protection and classification), **avec le nom du
  domaine** sur chaque axe — au lieu des chapitres thématiques du questionnaire.
- Chaque axe **agrège toutes les questions portant ce code CL** (quel que soit leur chapitre),
  avec les **mêmes règles de calcul** que les scores existants (« non applicable » exclu,
  « non évalué » compte 0). Les questions **sans domaine CL connu** (78/234) ne sont pas
  représentées dans le radar — une **note explicative** l'indique sous le graphique — mais elles
  restent comptées dans la synthèse, les scores par chapitre et la conformité.
- **Rien d'autre ne change** : les autres référentiels (ANSSI, ISO 27002, NIS2, DORA) conservent
  leur radar par domaines thématiques ; chapitres, filtres, panneau « préparation au label »,
  import CSV et mise à jour temps réel inchangés. Techniquement : axes calculés par
  `computeClAxes()` (activé par la présence de `clLabels`), étiquettes **multi-lignes** dans le
  SVG (viewBox élargie pour AirCyber uniquement).
- **Tests headless (Playwright)** : 22 assertions — 7 axes CL nommés (liste + fiche), géométrie
  exacte (domaine CL2 évalué 5/5 → sommet au bord du radar), exclusion des questions sans CL,
  rafraîchissement temps réel, non-régression ANSSI (axes et viewBox inchangés) ;
  **0 erreur console**.

### Chantier 2 — Pédagogie : tooltips ⓘ sur les concepts techniques
- **25 notes pédagogiques `Help.tip(ⓘ)`** ajoutées sur les modules techniques qui n'en avaient
  aucune, pour rendre le jargon GRC accessible aux non-experts (fil rouge du produit) :
  - **Risques (EBIOS)** : Fréquence (F), Gravité (G), Niveau de maîtrise (M) — sur les formulaires
    de création ET de détail — plus un rappel de la méthode FxGxM sur l'en-tête de liste.
  - **BIA** : Criticité métier, RTO (Recovery Time Objective), RPO (Recovery Point Objective).
  - **Actifs** : Criticité CIA/DICP (Confidentialité, Intégrité, Disponibilité).
  - **Matrice EBIOS** : lecture de la cartographie Fréquence × Gravité.
  - **Scénarios PCA/PRA** : distinction Continuité (PCA) vs Reprise (PRA).
  - **Audits** : typologie des constats (Point fort, Point d'amélioration, Non-conformité
    Mineure / Majeure).
  - **MCO** : Maintien en Condition Opérationnelle du PRA.
  - **Tests PRA** : nature de l'exercice (sur table, simulation, bascule réelle).
  - **Exigences** : signification du statut de conformité (lien avec le taux et la SoA).
- Aucune donnée ni schéma modifié : uniquement des icônes d'aide accessibles (clavier + lecteur
  d'écran) déjà stylées par le design system ; la bulle s'ouvre au clic/survol sans navigation.
- **Tests headless (Playwright)** : présence des ⓘ sur 11 vues (listes + fiches + formulaires),
  contenu pédagogique des bulles, ouverture au clic sans navigation parasite ; non-régression des
  suites de factorisation (50 assertions) ; **0 erreur console**.

### Chantier 9 — Durcissement : centralisation de la génération d'identifiants
- **`UI.genId(prefix)`** (ajouté à `js/core/ui.js`) : centralise la convention d'identifiant
  anti-collision `"<PRÉFIXE>-<timestamp>-<aléa>"` qui était **recopiée sur 23 sites / 17 modules**
  (Actifs, Audits ×2, BIA, Donneurs d'ordre, Crise, Documents, Exigences ×2, Incidents ×2,
  Correspondances ×2, Mesures, MCO, Prestataires, Scénarios, Tests PRA, Référentiels ×2, RGPD, Risques ×2).
  **Solde la dette « collisions »** notée dans le CLAUDE.md : un seul endroit à faire évoluer (p. ex.
  future migration vers `crypto.randomUUID`).
- **Comportement identique** : `UI.genId("INC")` produit exactement `"INC-<timestamp>-<aléa>"` comme avant.
  Les horodatages `updatedAt: Date.now()` (10 sites) **ne sont pas touchés** (ce ne sont pas des id).
- **Collecte de formulaire** : après analyse, la lecture des champs (`getElementById(...).value`) reste
  **volontairement en ligne** — hétérogène (trim, cases à cocher, coercition numérique) et locale à
  chaque formulaire, sa factorisation ajouterait de l'indirection sans gain réel (principe « sans
  sur-ingénierie »).
- **Tests headless (Playwright)** : `UI.genId` (format, préfixe par défaut, unicité) + **création
  réelle d'un incident via le formulaire** (id généré au bon format) ; non-régression des suites
  bulk/badges (20), smoke (8) et suppression fiche (16) ; **0 erreur console**.

### Chantier 9 — Durcissement : factorisation des confirmations de suppression
- **`UI.wireDelete({button, confirm, remove, toast, redirect})`** (ajouté à `js/core/ui.js`) :
  factorise le motif **« supprimer un élément depuis sa fiche »** — confirmation → suppression →
  toast optionnel → navigation vers la liste — qui était recopié dans **16 modules / 17 boutons**
  (Exigences, Risques, Actifs, Incidents, Documents, Actions, BIA, RGPD, Crise, Donneurs d'ordre,
  Mesures, Prestataires, Tests PRA, MCO, Scénarios PCA/PRA, Audits ×2).
- **Souplesse** : id de bouton paramétrable (`deleteBtn` par défaut, aussi `delBtn` /
  `delScenarioBtn`), message **statique ou dynamique** (fonction évaluée au clic — préserve les
  avertissements de cascade, ex. « N test(s) rattaché(s) seront supprimés » des scénarios, ou le
  nom de la mesure), toast optionnel, redirection vers la liste.
- **Aucun changement fonctionnel** : messages de confirmation, toasts et routes de redirection
  rigoureusement identiques ; le refus de la confirmation n'entraîne aucune suppression.
- **Tests headless (Playwright)** : suppression de bout en bout sur 6 modules représentatifs
  (sans/avec toast, message dynamique, cascade, `delBtn`/`delScenarioBtn`), vérification du
  message de confirmation et de la redirection, + chemin « annuler » ; non-régression des tests
  bulk-delete/badges (20) et smoke (8) ; **0 erreur console**.

### Chantier 9 — Durcissement : factorisation des helpers d'interface dupliqués
- **Nouveau module partagé `js/core/ui.js`** (`window.UI`) : source unique pour les fragments
  d'UI recopiés d'un module à l'autre. Un seul endroit à maintenir, un comportement homogène.
- **Suppression groupée factorisée** : la logique de sélection multiple (case « tout cocher »,
  cases de ligne, bouton « Supprimer sélection » + compteur, confirmation, suppression, toast,
  re-rendu) était **recopiée à l'identique dans 8 modules** (Exigences, Risques, Actions, Crise,
  BIA, Tests PRA, MCO, Prestataires). Elle passe par un unique `UI.wireBulkDelete({ remove, confirm,
  toast, onDone })` — chaque module ne conserve que ses libellés propres. ~250 lignes dupliquées retirées.
- **Badges de statut factorisés** : la forme récurrente `<span class="status …">libellé échappé</span>`
  et les tables de correspondance valeur→classe deviennent `UI.badge(label, cls)` /
  `UI.mappedBadge(value, map, fallback)` (appliqués à Incidents : gravité/statut/déclarations, et
  Documents : statut). Échappement XSS conservé (repli défensif si `escapeHtml` indisponible).
- **Aucun changement fonctionnel ni de schéma** : comportement, messages de confirmation et couleurs
  de badges rigoureusement identiques. *(Restent à factoriser ultérieurement : collecte de formulaire
  — hétérogène — et confirmations.)*
- **Tests headless (Playwright)** : 20 assertions sur `/risques` (sélection, compteur, tout-cocher,
  suppression groupée avec confirmation, cohérence DataStore), badges Incidents/Documents en situation
  réelle et anti-XSS, + smoke test des 8 modules (rendu, wiring actif) ; **0 erreur console**.

### Chantier 9 — Durcissement : gestion de la saturation du stockage (quota)
- **Fin des échecs silencieux** : quand une écriture durable échoue faute de place
  (`QuotaExceededError` sur IndexedDB, le miroir localStorage ou un point de restauration), l'appli
  le **détecte** et **prévient l'utilisateur** au lieu de perdre les données sans un mot.
- **Bandeau d'alerte dédié** (« Stockage saturé ») : conteneur propre, indépendant du rappel de
  sauvegarde, avec accès direct aux Paramètres (export + suppression d'anciens points de restauration
  pour libérer de l'espace) et fermeture manuelle.
- **Import Excel** : en fin d'import, un **enregistrement est forcé** et un message d'alerte s'affiche
  si le stockage est plein (les lignes importées restent en mémoire pour la session, mais l'utilisateur
  sait qu'elles ne sont pas encore persistées).
- **DataStore** : `isQuotaError`, observateur `onQuotaExceeded(cb)`, et `flush()` async renvoyant
  `{ ok, quota }`. Détection branchée sur `flushNow`, le miroir localStorage et l'auto-sauvegarde.
- **Tests headless (Playwright)** : simulation d'un quota (monkey-patch d'IndexedDB) → `flush()` signale
  `quota:true`, bandeau affiché (sans doublon, cohabite avec le rappel), import Excel alerté, fermeture
  et rétablissement ; **0 erreur console inattendue**.

### Chantier 7 — Tableau de bord : suivi, échéances & comparatif par donneur d'ordre
- **Incidents récents** : nouvelle liste (5 derniers incidents par date de détection, du plus récent
  au plus ancien) avec gravité, type, statut et **badge « À déclarer »** quand une déclaration
  réglementaire (NIS2/RGPD) est en attente. Chaque ligne ouvre la fiche incident.
- **Documents à réviser** : remontée des alertes de la gestion documentaire (chantier 5) — documents
  dont la **revue est échue ou proche** (≤ 30 j) ou au statut « à réviser » / « obsolète », triés par
  urgence, avec badges (retard / J-n) et **compteur d'alerte** dans le titre. Lignes cliquables.
- **Conformité par donneur d'ordre** : vue **comparative** (barres triées) du taux de conformité de
  chaque donneur d'ordre et des exigences internes — pertinent pour un sous-traitant multi-clients.
- Regroupées dans une nouvelle section **« Suivi & échéances »** ; aucun changement de schéma.
- **Tests headless (Playwright)** : ordre des incidents, badge « À déclarer », filtrage/compteur des
  documents, taux par client (Alpha 50 %, Beta/interne 100 %), navigation vers les fiches ;
  **0 erreur console**. → **Chantier 7 complet**.

### Chantier 7 — Tableau de bord : historisation & courbes de tendance
- **Nouvelle section « Évolution dans le temps »** sur le tableau de bord : les indicateurs clés
  sont **historisés** et affichés en **courbes de tendance** (sparklines SVG maison, aucune
  dépendance).
- **Capture automatique** d'un **instantané global une fois par jour** (à l'ouverture du tableau
  de bord), dédupliqué par date (un point par jour, le point du jour reste vivant). Les indicateurs
  sont **toujours calculés sur le périmètre global** (indépendants du sélecteur de donneur d'ordre)
  pour une série stable ; conservation bornée à 180 jours.
- **6 tendances suivies** : conformité, maturité des référentiels, exposition résiduelle, risques
  critiques, actions en retard, avancement des actions. Chaque tuile affiche la **valeur courante**,
  la **mini-courbe** et la **variation** (dernier vs premier point) **colorée selon le sens
  « meilleur »** (hausse verte pour la conformité, baisse verte pour l'exposition, etc.).
- **Effacer l'historique** (bouton dédié, avec confirmation) — n'affecte pas les données GRC ;
  un nouveau point est recapturé le jour même.
- **Modèle de données (schéma v8)** : nouveau tableau **`history`** (`{ id, ts, date, metrics }`).
  API DataStore `getHistory` / `recordDailySnapshot` (upsert du jour, sans réécriture si inchangé) /
  `clearHistory`. Migration transparente (les backups v7 restent importables).
- **Tests headless (Playwright)** : auto-capture au 1er rendu, injection d'un historique multi-jours
  → 6 courbes tracées, variation colorée cohérente (hausse conformité verte, baisse exposition verte),
  effacement (données GRC préservées), **export/import round-trip v8** ; **0 erreur console**.

### Chantier 3 — Correspondances inter-référentiels (mapping pré-rempli & éditable)
- **Nouvelle vue `/mapping`** (« Correspondances ») : un **catalogue pré-rempli** d'équivalences
  entre les exigences des référentiels, regroupées par **thème de sécurité** (28 groupes couvrant
  ANSSI ↔ ISO 27002 ↔ NIS2 ↔ DORA : gouvernance, MFA, sauvegardes, incidents, chaîne d'appro…).
  Objectif : **accélérer** la couverture croisée et la génération de SoA, dans l'esprit « zéro
  double saisie ».
- **Propagation en un geste** (le cœur de la fonctionnalité) :
  - **Relier tout un groupe à une mesure de sécurité** (existante ou créée à la volée) : toutes les
    exigences équivalentes pointent vers la même mesure ; évaluez la mesure une fois puis propagez.
    Relier **préserve** l'état « non évalué » (aucun statut fabriqué).
  - **Appliquer un même statut + maturité** à toutes les exigences d'un groupe.
- **Statut en direct** : chaque code de clause est un badge **coloré selon son évaluation**
  (conforme / partiel / non conforme / non applicable / non évalué), avec **anneau** si l'exigence
  est déjà reliée à une mesure ; clic → ouvre le référentiel. **Conformité du groupe** affichée.
- **Entièrement éditable** : créer une correspondance **personnalisée**, **modifier** un groupe du
  catalogue (surcouche « Modifiée »), **masquer** un groupe, et **réinitialiser** le catalogue par
  défaut. **Cartographie** en tête : part des exigences de chaque référentiel reliée à au moins une
  correspondance.
- **Modèle de données (schéma v7)** : nouveau tableau **`mappings`** = surcouche utilisateur
  (ajouts, overrides par id, masquages `_deleted`) fusionnée avec le **catalogue statique**
  (`js/data/mappings.js`). API DataStore `getMappings` / `getMappingById` / `upsertMapping` /
  `deleteMapping` / `resetMappings`. Migration transparente (les anciens backups v6 restent
  importables). Liens croisés ajoutés depuis Référentiels et Couverture croisée.
- **Tests headless (Playwright)** : rendu des 28 groupes, propagation statut (conformité → 100 %),
  reliaison à une mesure (préservation « non évalué »), création/modification/masquage/réinitialisation,
  **export/import round-trip v7** + compat v6 ; **0 erreur console**, aucune régression sur
  `/couverture` et `/referentiels`.

### Chantier 9 — Intégrité des données : cascade & tests PRA orphelins
- **Suppression en cascade** : supprimer un **scénario PCA/PRA** supprime désormais aussi les
  **tests d'exercice** qui lui étaient rattachés (`tests_pra.scenario_id`) — plus de tests
  pointant vers un scénario inexistant. La **confirmation de suppression** indique le nombre de
  tests impactés avant validation.
- **Détection & nettoyage des orphelins hérités** : les tests dont le scénario a été supprimé
  avant ce correctif sont **repérés** (badge « Orphelin » sur la ligne + **bandeau d'alerte**
  avec compteur) et **nettoyables en un clic** (« Supprimer les tests orphelins »).
- **DataStore** : `deleteScenarioPra` cascade vers `tests_pra` ; nouveaux helpers
  `getTestsByScenario`, `getOrphanTests`, `deleteOrphanTests`.
- Tests headless : cascade vérifiée (les tests du scénario supprimé disparaissent, l'orphelin
  d'origine subsiste puis est nettoyé), message de confirmation, bandeau ; 0 erreur console.

### Chantier 9 — Durcissement XSS : fin de l'échappement des modules
- **Échappement généralisé** (`escapeHtml`) de toutes les données utilisateur injectées en DOM
  dans les 7 modules restants : **Actifs, Donneurs d'ordre, BIA, Scénarios PCA/PRA, Tests PRA,
  MCO, Contrôles & Audits** (listes, fiches, formulaires, options, matrice RACI et **vues
  d'impression**). La dette XSS transverse est désormais **soldée** sur les modules de saisie.
- **Correctifs de sécurité notables** :
  - **Audits — injection HTML** : les rapports/PV imprimés faisaient `…replace(/\n/g, '<br>')`
    **sans échappement préalable** (rendu HTML de texte libre : synthèse, audité, participants,
    entrées/sorties, constats). Désormais **échappement d'abord, puis** conversion des sauts de
    ligne — un contenu comme `<script>…` s'affiche en texte, plus en HTML actif.
  - **Scénarios & Audits — échappement incomplet** : plusieurs champs n'échappaient que le
    guillemet (`replace(/"/g, '&quot;')`), laissant passer `<`, `>`, `&`. Remplacé par
    `escapeHtml` complet.
  - Champs auparavant oubliés désormais couverts : **bilan** d'un test PRA, **titres d'étapes**
    de la matrice RACI, champ **actifs** d'une étape, **noms des risques** liés à un actif.
- **Tests dédiés (Playwright)** : injection de charges utiles (`"><img onerror…>` et
  `<script>` multi-lignes) dans **chaque entité**, puis parcours listes + fiches + **vues
  d'impression** + **matrice RACI** — vérification qu'aucune balise n'est créée ni exécutée
  (payloads rendus en texte échappé), **0 erreur console**, aucune régression.

### Chantier 8 — Tiers : risque fournisseur & chaîne d'approvisionnement (NIS2/DORA)
- **Évaluation du risque fournisseur** sur le module Prestataires & Tiers : deux critères
  **Criticité** (impact si défaillance : faible → vitale) et **Accès au SI / aux données**
  (aucun → étendu) produisent un **niveau de risque inhérent** (Faible / Modéré / Élevé /
  Critique) affiché en badge sémantique, recalculé en direct dans le formulaire.
- **Exigences de sécurité de la chaîne d'approvisionnement** : checklist de 6 points de
  vigilance contractuels et opérationnels (clause de sécurité, notification des incidents,
  droit d'audit & preuves de conformité, localisation des données & sous-traitance, plan de
  réversibilité, continuité & résilience testée), chacun rattaché à sa **référence NIS2 /
  DORA**. Taux de **couverture** (X/6) affiché par tiers.
- **Liste enrichie** : nouvelle colonne « Risque fournisseur » (niveau + couverture) et
  **bandeau de synthèse** (nombre de tiers, évalués, à risque élevé/critique, couverture
  moyenne de la chaîne d'appro) pour une lecture direction immédiate.
- Champs `criticite` / `acces` / `supplyChain` **optionnels et rétrocompatibles** (aucun bump
  de schéma). **Durcissement XSS** du module au passage (société, type, contacts, notes).

### Chantier 8 — PCA/PRA : fiches réflexes de crise imprimables
- **Nouvelle vue `/crise-fiches`** accessible depuis l'annuaire de la Cellule de Crise
  (bouton **« Fiches réflexes »**) : des **cartes d'action par rôle** décrivant les gestes
  prioritaires à effectuer dans les premières minutes (Directeur de crise, Responsable
  IT/SSI, Communication, Juridique/RH, Expert technique, Logistique). Contenu **générique et
  pédagogique** (le public inclut des non-experts).
- **Titulaires rattachés automatiquement** depuis l'annuaire (par rôle) ; les rôles non
  pourvus affichent « Titulaire à désigner ». Ajout d'un bloc **« Réflexes communs à tous »**
  et d'un tableau **« Contacts d'urgence »** (CERT-FR/ANSSI, CNIL, cybermalveillance.gouv.fr,
  forces de l'ordre + champs à compléter : assurance cyber, infogérant, prestataire réponse).
- **Optimisé impression** (le SI peut être indisponible en pleine crise) : en-tête de
  document (`.print-head`), sidebar masquée, cartes sans coupure de page, bandeau de rappel
  « à conserver hors ligne ». Item de menu « Cellule de Crise » maintenu actif ; fil d'Ariane
  et route dédiés.
- **Durcissement XSS du module Crise** (dette Chantier 9) : échappement de toutes les données
  saisies (rôle, nom, téléphone, e-mail, suppléant, notes) dans l'annuaire, la fiche contact
  et les fiches réflexes.

### Chantier 8 — Matrice EBIOS : export image & cohérence brut/résiduel
- **Export image de la matrice de criticité** : deux boutons **« Exporter en PNG »** et
  **« Exporter en SVG »** sur la fiche `/matrice`. Génération d'un **SVG autonome** (titre,
  marque Dedienne, axes Fréquence × Gravité, grille 4×4 colorée avec bulles de compte,
  légende) rendu **sans aucune dépendance** ; le PNG est produit en interne en dessinant ce
  SVG sur un `<canvas>` (×2 pour la netteté) — aucun service tiers, aucune ressource externe
  (canvas non « tainted »). Utile pour insérer la cartographie dans un rapport ou un COMEX.
- **Alerte de cohérence brut / résiduel** : bandeau d'avertissement listant les risques dont
  le **score résiduel dépasse le score brut** (niveau de maîtrise M > 1, incohérent — une
  mesure de maîtrise ne peut pas augmenter le risque). Cause typique : import Excel avec un M
  mal saisi (« 50 » au lieu de « 0.5 »). Chaque risque signalé est **cliquable** (lien vers
  sa fiche) pour correction immédiate.
- **Refactorisation sans régression** : le regroupement des risques dans la grille est
  factorisé (`buildMatrixData`) et partagé entre l'affichage et l'export ; l'interaction
  existante (clic sur cellule, panneau de détail) est inchangée.

### Import des actifs & correctifs d'export PDF
- **Import des actifs abouti** : nouveau bouton **« Télécharger le modèle »** générant un
  fichier Excel prêt à remplir (`modele_import_actifs.xlsx`), avec les colonnes exactes
  attendues (`Nom, Type, Criticité, Responsable, Description`) et des lignes d'exemple
  couvrant chaque type/criticité. Le générateur est co-localisé avec le parseur
  (`ImportExcelService`) pour garder le format synchronisé. Message d'aide et garde-fous
  (`ImportExcelService` chargé) alignés sur les modules Exigences/Risques.
- **Export PDF — Cellule de crise** : le **titre du document réapparaît à l'impression**
  (en-tête dédié `.print-head` : titre + marque Dedienne + date) et la **colonne des cases
  à cocher est masquée** au print (la case du corps de tableau n'était pas `no-print`, ce
  qui décalait les colonnes et laissait « Suppléant » sans en-tête).
- **Export PDF — Prestataires & Tiers** : ajout du **bouton « Imprimer l'annuaire »**
  (absent auparavant), en-tête d'impression dédié, **cases à cocher masquées** au print
  (en-tête + corps) et **bandeau pédagogique retiré** de l'impression (`no-print`).
- **Nouveau motif réutilisable `.print-head`** (dans `css/style.css`) : en-tête masqué à
  l'écran, révélé uniquement à l'impression — généralise le procédé déjà utilisé pour la SoA.

### Itération 14 — AirCyber : niveaux de label, priorité & domaines CL0–CL6
- **Métadonnées par question** (issues du fichier de suivi BoostAerospace, 156/234
  questions) : **niveau de label Bronze / Argent / Or**, **priorité** (haute / moyenne /
  basse) et **domaine de classification CL0–CL6** (Governance, Security event management,
  Malwares, Protect end user devices, Secure network architecture, Identity & access
  management, Data protection). Affichés en **badges** sur chaque question.
- **Filtres** sur la fiche AirCyber : par **niveau** (Tous / Bronze / Argent / Or) et par
  **domaine CL**, avec compteur de questions affichées.
- **Panneau « Préparation au label »** : taux de conformité par niveau (Bronze / Argent /
  Or) — répond à « suis-je prêt pour ce label ? ». Alimenté par l'auto-évaluation / l'import.
- Générique et sans régression : les référentiels sans niveaux (ANSSI, ISO…) n'affichent
  ni badges, ni filtres, ni panneau. Schéma référentiel étendu (champs optionnels
  `niveau` / `priorite` / `cl` par exigence + `clLabels`).

### Itération 13 — Import des réponses AirCyber (CSV)
- **Import des réponses** depuis l'export CSV du questionnaire AirCyber, sur la fiche
  du référentiel (bouton « Importer mes réponses (CSV) »). Mappe automatiquement
  Oui → conforme, Non → non conforme, N/A → non applicable, Partiellement → partiel,
  avec une maturité de départ (CMMI) ; les questions d'inventaire d'outils et les codes
  hors référentiel sont ignorés. Parsing via SheetJS (déjà embarqué), aucune donnée
  ne quitte le navigateur. Validé sur un export réel : 231/234 réponses appliquées.

### Itération 12 — Durcissement (XSS & identifiants)
- **Échappement HTML partagé** exposé (`window.escapeHtml` via `help.js`) et appliqué
  aux modules à fort trafic **Exigences** et **Risques** : toute donnée utilisateur
  injectée en `innerHTML` (intitulés, noms, descriptions, commentaires, valeurs de
  formulaire) est désormais échappée. Vérifié par un test XSS dédié (charges neutralisées).
- **Identifiants anti-collision** : suffixe aléatoire ajouté à tous les identifiants
  générés (`"<PREFIXE>-" + Date.now() + "-" + aléatoire`) dans l'ensemble des modules,
  supprimant le risque de collision lors de créations dans la même milliseconde.

### Itération 11 — Registre des traitements RGPD (article 30)
- **Nouveau module Registre RGPD** (`/rgpd`) : registre des activités de traitement
  (finalité, **base légale**, personnes concernées, catégories de données, **données
  sensibles** art. 9, destinataires, transfert hors UE, durée de conservation).
- **Mesures de sécurité réutilisent le pivot** : chaque traitement relie les
  « mesures de sécurité » qui le protègent (zéro double saisie).
- **Registre imprimable** (art. 30) + repères pédagogiques (bases légales, données sensibles).
- **Modèle v6** (`SCHEMA_VERSION` 5 → 6) : tableau `traitements` ; `deleteMesure` délie les traitements.

### Itération 10 — Tableau de bord enrichi (cockpit GRC 360°)
- **Refonte du tableau de bord** (`js/modules/dashboard.js`) en véritable cockpit de
  pilotage agrégeant l'ensemble des domaines GRC, avec des **graphiques maison en
  SVG/HTML** (aucune librairie, 100 % frontend) : anneaux (donut), barres horizontales
  et **cartographie des risques** (matrice Fréquence × Gravité colorée).
- **Bandeau de posture direction** : synthèse automatique colorée (maîtrisée /
  vigilance / arbitrage immédiat) déduite des risques très critiques, **déclarations
  réglementaires en attente** (NIS2/RGPD), retards d'actions et taux de conformité.
- **Bandeau d'indicateurs clés (KPI)** : conformité, maturité moyenne des référentiels,
  exposition résiduelle, actions en retard et actifs cartographiés — lecture en un coup d'œil.
- **Conformité** : anneau de répartition des statuts (conforme / partiel / non conforme /
  non applicable / non évalué) + taux sur exigences applicables.
- **Maturité par référentiel** : maturité globale (échelle CMMI 0-5) et barre par
  référentiel, couvrant automatiquement **les 5 référentiels du catalogue** (ANSSI, ISO
  27002, NIS2, DORA, AirCyber) — chaque cadre ajouté apparaît sans modifier le dashboard.
- **Risques** : anneau du profil résiduel (très critiques / critiques / non critiques),
  score d'exposition, **cartographie F×G** cliquable vers la matrice, et Top 5 résiduel.
- **Plan d'actions** : avancement, ventilation par statut, **actions en retard** et
  **échéances ≤ 30 j** ; nouvelle **liste de veille** (retards + échéances proches triés
  par urgence, badges « Retard Xj » / « J-x », pastille de priorité).
- **Actifs par criticité** (barres) et **Couverture du dispositif GRC** : 11 tuiles
  cliquables (BIA, mesures, exigences évaluées, PCA/PRA, tests — avec dernier résultat,
  MCO, cellule de crise, audits + non-conformités ouvertes, prestataires, risques et
  **incidents** — ouverts + déclarations réglementaires en attente).
- **État vide pédagogique** : bandeau d'amorçage quand aucune donnée n'est saisie ;
  tous les graphiques dégradent proprement (messages d'aide). Sécurité XSS : toutes les
  données utilisateur injectées sont échappées (`escapeHtml`). Nouveaux styles cockpit
  dans `css/style.css` (tokens uniquement, couleurs sémantiques respectées).

### Itération 9 — Gestion documentaire des politiques
- **Nouveau module Documents** (`/documents`) : registre des politiques et documents
  (PSSI, charte, procédures…) avec **version, propriétaire, statut, date de prochaine
  revue, emplacement** (l'application **ne stocke pas** les fichiers) et lien aux référentiels.
- **Alertes de revue** : badge « en retard / dans N j » dans la liste, bannière sur la fiche,
  KPI « revue à prévoir ».
- **Canevas de plans** (PSSI, charte, PCA/PRA) pré-remplissant le sommaire.
- **Modèle v5** (`SCHEMA_VERSION` 4 → 5) : tableau `documents`.

### Itération 8 — Registre des incidents de sécurité
- **Nouveau module Incidents** (`/incidents`) : journal des incidents avec type, gravité,
  statut, dates de détection/résolution, description, actions immédiates, cause racine,
  actifs touchés, lien vers un **risque EBIOS**, et déclarations **ANSSI/CNIL**.
- **Rappel des délais réglementaires** : bannière d'alerte (NIS2 24 h/72 h, RGPD 72 h)
  lorsqu'une déclaration est en attente, avec le temps écoulé depuis la détection.
- **Actions correctives** tracées jusqu'à l'incident (visibles dans le plan d'actions).
- **Modèle v4** (`SCHEMA_VERSION` 3 → 4, migration transparente) : tableau `incidents`,
  champ `action.incident_id`, cascades de nettoyage (risque / actif supprimés).

### Itération 7 — Couverture croisée & Déclaration d'applicabilité (SoA)
- **Vue Couverture croisée** (`/couverture`) : part de chaque référentiel adossée à une
  mesure de sécurité + **matrice mesures × référentiels** mettant en évidence les mesures
  « transverses » (couvrant plusieurs cadres) — la concrétisation du « zéro double saisie ».
- **Génération de la déclaration d'applicabilité (SoA)** (`/soa/:id`) : tableau **imprimable
  (PDF)** de toutes les mesures d'un référentiel — applicabilité, mise en œuvre, maturité,
  mesure de sécurité liée, justification —, livrable clé d'un audit ISO 27001. Accessible
  depuis la liste des référentiels et le détail de chaque référentiel.

### Itération 6 — Référentiels 4c : ISO 27002, NIS2, DORA, AirCyber
- **Quatre nouveaux référentiels** ajoutés au catalogue, au même modèle d'auto-évaluation
  (radar de maturité, statuts, maturité 0-5, actions correctives, pivot) :
  - **ISO/IEC 27002:2022** — 93 mesures en 4 thèmes (organisationnel, humain, physique, technologique).
  - **NIS2 (art. 21)** — 10 mesures de gestion des risques, regroupées en 4 thèmes.
  - **DORA** — 5 piliers de résilience opérationnelle numérique (15 mesures de synthèse).
  - **AirCyber (BoostAerospace)** — questionnaire de maturité de la filière aéronautique,
    **234 questions** en 10 domaines, importé depuis l'export officiel du questionnaire
    (les questions d'inventaire d'outils « quel outil utilisez-vous » sont écartées car
    non auto-évaluables). *Généré fidèlement depuis le CSV fourni.*
- Reformulations originales courtes + aide pédagogique pour ISO/NIS2/DORA ; **aucun texte
  de norme copié** (identifiants de clauses « 5.1 » + intitulés paraphrasés uniquement).
- Le catalogue compte désormais **5 référentiels (394 mesures)** ; carte d'accroche orientée
  vers le pivot « Mesure de sécurité » (couverture croisée à venir).

### Itération 5 — Pivot « Mesure de sécurité » (zéro double saisie)
- **Nouveau module Mesures de sécurité** (`js/modules/mesures.js`, routes `/mesures`
  et `/mesures/:id`) : catalogue des contrôles de sécurité (MFA, sauvegardes,
  cloisonnement…), entité **pivot** reliée n-n aux exigences des référentiels.
- **Liaison depuis une exigence** : dans le détail d'une mesure de référentiel, un
  sélecteur « Couverte par la mesure de sécurité » permet de relier (ou créer à la
  volée) une mesure. La couverture est visible sur la fiche de la mesure.
- **Propagation** : un clic recopie le statut et la maturité de la mesure sur toutes
  les exigences qu'elle couvre — évaluer une fois, appliquer partout (fondation du
  mapping croisé multi-référentiels à venir).
- Suppression d'une mesure : les exigences liées sont **déliées** (leurs évaluations
  sont conservées). Correctif : réaffichage des preuves à la réouverture d'une mesure.

### Itération 4 — Référentiels : ossature + Hygiène ANSSI + auto-évaluation
- **Nouveau module Référentiels** (`js/modules/referentiels.js`, routes `/referentiels`
  et `/referentiels/:id`) : auto-évaluation de la conformité par rapport à un
  référentiel de sécurité, avec **profil de maturité en radar** (SVG maison, sans
  dépendance) et score par domaine mis à jour **en temps réel**.
- **Référentiel Hygiène informatique ANSSI** (`js/data/ref_anssi.js`) : les
  **42 mesures** réparties en **10 familles**, en reformulations originales courtes
  + **aide pédagogique** par mesure (aucun texte de norme copié). Registre extensible
  `Referentiels` (`js/data/referentiels.js`) prêt pour ISO 27002 / NIS2 / DORA / AirCyber.
- **Auto-évaluation par mesure** : statut (conforme / partiel / non conforme / non
  applicable / non évalué), **maturité 0-5** (échelle type CMMI), commentaire, preuves,
  et **actions correctives** tracées jusqu'à la mesure (visibles dans le plan d'actions).
- **Modèle de données v3** (`SCHEMA_VERSION` 2 → 3, migration transparente) : nouveaux
  tableaux `evaluations` (auto-évaluations, clé `ref_id` + `code`) et `mesures` (socle
  de l'entité pivot « Mesure de sécurité »). API DataStore synchrone étendue
  (`upsertEvaluation`, `getEvaluationsByRef`, `getActionsByEvaluation`…).
- **Traçabilité** : une action créée depuis une mesure affiche son origine
  (« ANSSI n°… ») dans le plan d'actions et pointe vers le référentiel.

### Itération 3 — Fondations du design system
- **Design tokens unifiés** (`css/tokens.css`) : source unique de vérité (marque
  orange dominante + bleu structurel, couleurs sémantiques strictes réservées aux
  statuts, espacements, rayons, ombres, typographie).
- **Composant tooltip pédagogique** (`js/core/help.js`, `Help.tip(...)`) : icône ⓘ
  accessible (clavier + lecteur d'écran), bulle au survol/tap, sans déclencher la
  navigation des cartes cliquables. Appliqué en démonstration au tableau de bord.
- **Fil d'Ariane** dynamique (section / page) sur toutes les routes.
- **Responsive** : barre latérale off-canvas + bouton menu sur mobile/tablette.
- **Accessibilité** : focus clavier visible, `prefers-reduced-motion`, chiffres
  tabulaires ; badges sémantiques (`.badge--ok/warn/crit/na`) et états vides normalisés.

### Itération 2 — Protection par mot de passe (opt-in) & chiffrement au repos
- **Coffre optionnel** (`js/core/vault.js`) : protection par mot de passe
  activable dans les Paramètres, désactivée par défaut (accessible aux non-experts).
- **Chiffrement au repos** AES-256-GCM des données IndexedDB *et* des points de
  restauration lorsque la protection est active. Aucune donnée en clair (miroir
  localStorage désactivé en mode chiffré).
- **Chiffrement à enveloppe** : clé de données (DEK) emballée par une clé dérivée
  du mot de passe (PBKDF2 600k) → changement de mot de passe sans re-chiffrement massif.
- **Écran de déverrouillage** à la charte Dedienne + **auto-verrouillage** après
  15 min d'inactivité + verrouillage manuel.
- Activation / changement / désactivation du mot de passe dans les Paramètres,
  avec purge des traces en clair et re-création des points de restauration.

### Itération 1 — Stratégie de sauvegarde (fichier)
- **Enveloppe de sauvegarde standard** `grc-backup` versionnée
  (`{ format, version, encrypted, createdAt, app, payload|kdf+cipher }`).
- **Export chiffré** optionnel et recommandé : AES-256-GCM, clé dérivée par
  **PBKDF2 (600 000 itérations)**, sel + IV aléatoires par fichier (portable).
  Export en clair toujours possible (avec avertissement pédagogique).
- **Import robuste** : détection auto du chiffrement (demande le mot de passe),
  validation stricte du contenu, aperçu chiffré, choix **Remplacer / Fusionner**,
  point de restauration créé avant toute modification, compat. anciens formats.
- **Migrations de schéma** ascendantes (registre `migratePayload`).
- **Rappel d'export** non intrusif (bandeau, seuil paramétrable, défaut 7 j) +
  date du dernier export affichée. Statut du **stockage persistant** dans les paramètres.
- Encarts pédagogiques (pourquoi chiffrer) intégrés au design.

### Phase 0 — Audit
- Ajout de `docs/DATA_MODEL.md` (schéma de données de référence).
- Ajout de `docs/AUDIT.md` (état des lieux, dette technique, plan priorisé).

### Persistance & sauvegarde
- **Refonte du stockage** : migration de `localStorage` (clé unique) vers
  **IndexedDB** (`js/core/persistence.js`), avec source de vérité en mémoire
  (API `DataStore` synchrone inchangée pour les modules).
- Migration automatique et transparente des données `localStorage` existantes,
  audits/revues inclus dans la sauvegarde unifiée.
- **Points de restauration versionnés** (automatiques toutes les 10 min +
  manuels, dédupliqués, historique glissant de 20) avec restauration en 1 clic.
- Sauvegarde de sécurité automatique avant tout import / restauration.
- `navigator.storage.persist()` demandé (réduit le risque de purge).
- Page **Paramètres** enrichie : état du stockage, quota, historique, export/import.
- Miroir localStorage de secours + flush avant fermeture d'onglet.

### Design & identité
- Application de la **charte Dedienne Aerospace** : couleurs échantillonnées sur
  le logo officiel (bleu `#2059A6`, orange `#E9631B`), variables CSS centralisées.
- Intégration du **logo officiel** (`logo-dedienne.png`) dans la barre latérale,
  favicon dédié.
- **Icônes SVG professionnelles** (style trait) sur toutes les entrées de menu.
- **Suppression de tous les emojis** (244 occurrences) au profit d'un rendu pro.
- Retrait des mentions de marques tierces (ancien branding, noms de concurrents).

### Mise en route
- Décompression de l'archive initiale dans l'espace de travail.
