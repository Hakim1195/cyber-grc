# Changelog — Cyber GRC

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/).
Application 100 % frontend (HTML/CSS/JS, sans backend).

## [Non publié]

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
  - **AirCyber (préparation)** — auto-positionnement indicatif filière aéronautique
    (Bronze/Silver/Gold), **contenu original** ne remplaçant pas l'évaluation officielle BoostAerospace.
- Reformulations originales courtes + aide pédagogique ; **aucun texte de norme copié**
  (identifiants de clauses « 5.1 » + intitulés paraphrasés uniquement).
- Le catalogue compte désormais **5 référentiels (174 mesures)** ; carte d'accroche orientée
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
