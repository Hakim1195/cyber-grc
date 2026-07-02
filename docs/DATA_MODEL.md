# Modèle de données — Cyber GRC

> Document de référence du schéma de données. À tenir à jour à chaque évolution.
> Application **100 % frontend** : toutes les données vivent dans le navigateur
> (IndexedDB, avec repli localStorage). Aucune donnée ne quitte le poste.

Version de schéma courante : **`SCHEMA_VERSION = 8`** (défini dans `js/core/datastore.js`).
> v3 (chantier Référentiels) : ajout des tableaux `evaluations` et `mesures`.
> v4 (chantier Incidents) : ajout du tableau `incidents`.
> v5 (chantier Documentaire) : ajout du tableau `documents`.
> v6 (chantier RGPD) : ajout du tableau `traitements`.
> v7 (chantier 3 Correspondances) : ajout du tableau `mappings` (surcouche des correspondances inter-référentiels).
> v8 (chantier 7 Tendances) : ajout du tableau `history` (indicateurs historisés, un point par jour).
> Migrations transparentes — `normalize` crée les tableaux vides à la volée.

---

## 1. Couche de stockage

### 1.1 IndexedDB (stockage durable principal)
Base `cyber-grc-db` (voir `js/core/persistence.js`), deux object stores :

| Store | Clé | Contenu |
|-------|-----|---------|
| `kv` | chaîne | `"current"` → **enveloppe** de l'instantané ; `"meta"` → `{ schemaVersion, updatedAt, encrypted }` |
| `backups` | `id` auto-incrément | points de restauration versionnés (index `ts`, `type`) |

**Enveloppe de stockage** (`current` et champ des backups) :
- Non chiffré : `{ enc: false, data: <objet> }`
- Chiffré (protection active) : `{ enc: true, iv, ct }` (AES-256-GCM)

Un enregistrement `backups` : `{ id, ts, type: "auto"|"manual", label, schemaVersion, sig, (enc/iv/ct | data) }`
(`sig` = empreinte du contenu clair, pour dédupliquer sans déchiffrer).

**Chiffrement au repos (opt-in)** : quand une protection par mot de passe est active
(`js/core/vault.js`), `data`/backups sont chiffrés ; le miroir localStorage en clair est désactivé.

**Fichier d'export** (`grc-backup`) :
```jsonc
{ "format":"grc-backup", "version":2, "encrypted":false, "createdAt":"ISO",
  "app":"cyber-grc-dedienne", "payload": <objet data> }
// chiffré : "encrypted":true, "kdf":{salt,iterations,hash}, "cipher":{iv,ct} (payload absent)
```

### 1.2 localStorage (secours + petits réglages)
- `cyber-gouvernance-data` : ancienne base (migrée automatiquement vers IndexedDB au 1er chargement) + miroir de secours anti-crash.
- `cyber-audits`, `cyber-revues` : anciennes clés (audits/revues), désormais **migrées et intégrées** à la base unifiée.
- `cyber-context` : périmètre actif du sélecteur (`"global"` ou un `client.id`).
- `cyber-last-backup` : date du dernier export JSON (affichage).

### 1.3 Instantané complet (objet `data`)
```jsonc
{
  "schemaVersion": 3,
  "updatedAt": 1730000000000,
  "clients": [],        "exigences": [],   "actions": [],
  "risques": [],        "actifs": [],      "processus": [],
  "crise": [],          "scenarios_pra": [], "tests_pra": [],
  "prestataires": [],   "mco_actions": [], "audits": [],  "revues": [],
  "evaluations": [],    "mesures": [],      // v3 — chantier Référentiels
  "incidents": [],      // v4 — chantier Incidents
  "documents": [],      // v5 — chantier Documentaire
  "traitements": [],    // v6 — chantier RGPD (article 30)
  "mappings": [],       // v7 — chantier 3 (surcouche des correspondances inter-référentiels)
  "history": []         // v8 — chantier 7 (indicateurs historisés : courbes de tendance)
}
```

### 1.4 Convention d'identifiants
`"<PREFIXE>-" + Date.now()` (parfois `+ Math.floor(Math.random()*1000)` à l'import).
> ⚠️ Dette : `Date.now()` seul est sujet à collision (deux créations dans la même
> milliseconde). Voir `AUDIT.md`.

---

## 2. Entités

### Client (« Donneur d'ordre ») — `clients`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"CLI-..."` | |
| `nom` | string | |
| `secteur` | string | secteur / description |

Suppression en cascade → supprime les `exigences` rattachées (et leurs `actions`).

### Exigence — `exigences`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"EX-..."` | |
| `client_id` | string \| null | `null` = exigence interne ; sinon rattachée à un donneur d'ordre |
| `code` | string | ex. `A.5.1`, `NIS2-21` |
| `intitule` | string | |
| `statut_conformite` | enum | `conforme` \| `partiellement conforme` \| `non conforme` \| `non applicable` |
| `responsable` | string | |
| `commentaire` | string | |

### Action (plan d'actions) — `actions`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"ACT-..."` | |
| `titre` | string | |
| `statut` | enum | `à faire` \| `en cours` \| `terminée` |
| `responsable` | string | |
| `echeance` | date (ISO) | |
| `priorite` | string | optionnel |
| `exigence_id` | string | une action est liée à **l'un** de : exigence, risque, évaluation ou incident |
| `risque_id` | string | |
| `evaluation_id` | string | lien vers une évaluation de référentiel (v3) |
| `incident_id` | string | lien vers un incident de sécurité (v4) |

### Risque (inspiré EBIOS RM, méthode F×G×M) — `risques`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"RISK-..."` | |
| `nom` | string | scénario de risque |
| `f_frequence` | number | Fréquence / vraisemblance |
| `g_gravite` | number | Gravité |
| `m_maitrise` | number | coefficient de Maîtrise (≤ 1) |
| `score_brut` | number | `f × g` |
| `score_residuel` | number | `score_brut × m` |
| `niveau` | enum | `faible` \| `élevé` \| `critique` (dérivé du score résiduel) |
| `description` | string | |
| `exigences_liees` | string[] | ids d'`exigences` |

> Seuils dashboard : résiduel `< 3` non critique, `3–7.9` critique, `≥ 8` très critique.

### Actif — `actifs`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"ACTIF-..."` | |
| `nom` | string | |
| `type` | enum | `Matériel` \| `Logiciel` \| `Donnée` \| `Service` \| `Humain` |
| `criticite` | enum | `faible` \| `modérée` \| `élevée` \| `critique` |
| `responsable` | string | |
| `description` | string | |
| `risques_lies` | string[] | ids de `risques` |

### Processus / BIA (ISO 22301) — `processus`
| Champ | Type | Notes |
|-------|------|-------|
| `id` | string | |
| `nom` | string | |
| `criticite` | string | |
| `rto` | string | Recovery Time Objective |
| `rpo` | string | Recovery Point Objective |
| `responsable` | string | |
| `actifs_lies` | string[] | ids d'`actifs` |

### Cellule de crise — `crise`
`{ id, role, nom, telephone, email, suppleant, notes }`

### Scénario PCA/PRA — `scenarios_pra`
`{ id, nom, description, etapes_pca[], etapes_pra[] }`
Étape (fiche réflexe, matrice RACI) : `{ titre, realisateur, responsable, consulte, informe, actifs, duree, statut }`

### Test PRA — `tests_pra`
`{ id, scenario_id, date, succes: "Oui"|"Non", type_test, bilan }`
- `scenario_id` → id d'un `scenarios_pra`. **Suppression en cascade** : supprimer un scénario
  supprime ses tests (`deleteScenarioPra`). Les tests dont le scénario n'existe plus (orphelins
  hérités d'anciennes suppressions) sont détectés via `getOrphanTests()` et nettoyables via
  `deleteOrphanTests()` (bandeau dédié dans la liste des tests).

### MCO (maintien en condition) — `mco_actions`
`{ id, titre, frequence, etat: "OK"|"KO", date, notes }`

### Prestataire / tiers — `prestataires`
`{ id, societe, type, phone, email, notes,`
` criticite?, acces?, supplyChain? }`
- Champs d'évaluation du **risque fournisseur** (optionnels, rétrocompatibles — pas de bump de schéma) :
  - `criticite` : `""|"faible"|"moyenne"|"forte"|"vitale"` (impact si défaillance).
  - `acces` : `""|"aucun"|"limite"|"etendu"` (accès au SI / aux données).
  - Risque inhérent = poids(criticité) × poids(accès) → Faible / Modéré / Élevé / Critique.
  - `supplyChain` : objet de booléens (exigences chaîne d'appro NIS2/DORA) — clés
    `clause, notif, audit, donnees, reversibilite, continuite`.

### Audit interne (ISO 27001 §9.2) — `audits`
`{ id, ref, statut: "Planifié"|"En cours"|"Réalisé", date, perimetre, auditeur, audite, synthese, constats[] }`
Constat : `{ type, exigence, desc }`

### Revue de direction — `revues`
`{ id, date, participants, inputs, outputs }`

### Évaluation de référentiel — `evaluations`
Auto-évaluation d'**une exigence d'un référentiel** (voir §5). Clé métier unique
`(ref_id, code)` ; l'enregistrement est créé à la première évaluation (une exigence
sans enregistrement = « non évaluée »).

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"EVAL-..."` | |
| `ref_id` | string | id du référentiel (ex. `anssi-hygiene`) |
| `code` | string | code de l'exigence dans le référentiel (ex. `22`) |
| `statut` | enum | `conforme` \| `partiellement conforme` \| `non conforme` \| `non applicable` \| `""` (non évalué) — questionnaires (`scoring: "conformite"`, ex. AirCyber) : mêmes valeurs, affichées Oui / Non / N-A, sans « partiellement » |
| `maturite` | number | 0-5 (échelle type CMMI) — non utilisé pour les questionnaires (préservé mais ignoré) |
| `commentaire` | string | |
| `preuves` | string | références (l'app ne stocke pas les fichiers) |
| `mesure_id` | string \| null | lien vers la **Mesure de sécurité** pivot (v3, 4b) |
| `updatedAt` | number | |

Les **actions correctives** pointent vers l'évaluation via `action.evaluation_id`.
`deleteEvaluation` supprime en cascade les actions liées ; `deleteEvaluationsByRef`
réinitialise un référentiel entier.

### Mesure de sécurité (pivot) — `mesures`
Contrôle mis en œuvre par l'organisation, **couvrant n-n plusieurs exigences** de
référentiels (le lien est porté par `evaluations[].mesure_id`). Évaluer la mesure
**propage** son statut/maturité à toutes ses évaluations liées (zéro double saisie).

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"MESURE-..."` | |
| `nom` | string | |
| `description` | string | |
| `statut` | enum | même enum de conformité |
| `maturite` | number | 0-5 |
| `responsable` | string | |
| `updatedAt` | number | |

`deleteMesure` délie les évaluations (`mesure_id` → null). `propagateMesure(id)`
recopie statut + maturité sur les évaluations liées.

### Incident de sécurité — `incidents` (v4)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"INC-..."` | |
| `titre` | string | |
| `type` | enum | hameçonnage, rançongiciel, intrusion, fuite de données, DoS, perte/vol, erreur, malveillance… |
| `gravite` | enum | `faible` \| `moyenne` \| `élevée` \| `critique` |
| `statut` | enum | `nouveau` \| `en cours` \| `résolu` \| `clôturé` |
| `date_detection` / `date_resolution` | date ISO | |
| `description`, `actions_immediates`, `cause_racine` | string | |
| `actifs_touches` | string[] | ids d'`actifs` |
| `risque_id` | string \| null | lien vers un `risque` EBIOS (le risque qui se matérialise) |
| `declaration_anssi` / `declaration_cnil` | enum | `non requise` \| `à déclarer` \| `déclarée` (aide délais NIS2 24 h/72 h, RGPD 72 h) |

Actions correctives via `action.incident_id`. `deleteIncident` supprime en cascade ses
actions ; `deleteRisque`/`deleteActif` nettoient les références (`risque_id`, `actifs_touches`).

### Document / politique — `documents` (v5)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"DOC-..."` | |
| `titre` | string | |
| `type` | enum | PSSI, charte, procédure, politique de sauvegarde, PCA/PRA… |
| `version` | string | |
| `proprietaire` | string | |
| `statut` | enum | `brouillon` \| `en vigueur` \| `à réviser` \| `obsolète` |
| `date_revue` | date ISO | prochaine revue (pilote les alertes) |
| `emplacement` | string | localisation du fichier (**non stocké** par l'app) |
| `referentiels` | string[] | ids de référentiels couverts |
| `notes` | string | plan / sommaire (canevas disponibles) |

### Traitement RGPD — `traitements` (v6, article 30)
| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"TRT-..."` | |
| `nom`, `finalite` | string | |
| `base_legale` | enum | consentement, contrat, obligation légale, intérêt légitime… |
| `responsable` | string | |
| `personnes_concernees`, `categories_donnees` | string | |
| `donnees_sensibles` | bool | catégories particulières (art. 9) |
| `destinataires`, `transfert_hors_ue`, `duree_conservation` | string | |
| `mesures_ids` | string[] | **réutilise le pivot** `mesures` (`deleteMesure` délie) |

### Correspondance inter-référentiels — `mappings` (v7, surcouche)
Le **catalogue par défaut** des correspondances (équivalences entre exigences de
plusieurs référentiels) est **statique** (`js/data/mappings.js`, exposé par
`MappingCatalog`) et **non stocké**. Le tableau `mappings` ne contient que la
**surcouche utilisateur**, fusionnée à l'affichage par `MappingModule` :

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"MAP-..."` \| id du catalogue | un id du catalogue (`map-…`) → **override** du groupe correspondant ; un id `MAP-…` → groupe **personnalisé** |
| `theme` | string | intitulé du thème de sécurité |
| `aide` | string | note pédagogique |
| `refs` | objet | `{ <ref_id>: [codes...] }` — exigences équivalentes par référentiel |
| `_deleted` | bool | si `true` sur un id du catalogue : groupe **masqué** (tombstone) |

Règles de fusion (dans le module) : un groupe du catalogue est remplacé si un
enregistrement de même `id` existe (override), masqué si `_deleted`, sinon affiché
tel quel ; les enregistrements dont l'`id` n'est pas dans le catalogue sont des
groupes personnalisés. `resetMappings()` vide la surcouche (retour au catalogue).
La **propagation** relie toutes les exigences d'un groupe à une même `mesure`
(`evaluations[].mesure_id`) ou leur applique un même statut (`upsertEvaluation`) —
d'où l'accélération de la couverture croisée et de la SoA.

### Point d'historique — `history` (v8, courbes de tendance)
Instantané **global** des indicateurs clés, **un enregistrement par jour** (clé
`date`). Alimente les courbes de tendance du tableau de bord. Le point du jour est
actualisé tant que la journée court ; les points passés sont figés. Conservation
bornée (`HISTORY_KEEP = 180` jours, les plus récents).

| Champ | Type | Notes |
|-------|------|-------|
| `id` | `"HIST-..."` | |
| `ts` | number | horodatage de la dernière écriture du point |
| `date` | string | `"YYYY-MM-DD"` (clé métier, un point par jour) |
| `metrics` | objet | `{ conformite (%), maturite (0-5), expo, risques_crit, actions_retard, avancement (%), incidents_ouverts }` |

Écriture via `recordDailySnapshot(metrics)` (upsert du jour, **sans réécriture si
inchangé**), lecture triée via `getHistory()`, remise à zéro via `clearHistory()`.
Les indicateurs sont **toujours calculés sur le périmètre global** (indépendants du
sélecteur de donneur d'ordre) pour une série stable. Effacer l'historique n'affecte
pas les données GRC.

---

## 3. Graphe des relations

```
Client ──1:N──> Exigence ──1:N──> Action
                   ▲                 │ (exigence_id OU risque_id)
                   │ N:M             ▼
                Risque <──1:N── Action
                   ▲ N:M (exigences_liees)
                   │
Actif ──N:M──> Risque (risques_lies)

Processus(BIA) ──N:M──> Actif (actifs_lies)
ScenarioPra ──1:N──> TestPra (scenario_id)
Audit ──1:N──> Constat        Revue (autonome)
Crise, Prestataire, McoAction : autonomes
```

Cascades implémentées : `deleteClient`→exigences→actions ; `deleteExigence`→délie
risques + supprime actions liées ; `deleteRisque`→délie actifs + supprime actions liées.
> ⚠️ Orphelins possibles : `TestPra.scenario_id` vers un scénario supprimé (non nettoyé).

---

## 4. Graphe des relations — Référentiels

```
Référentiel (statique) ──1:N──> Exigence de référentiel (code)
                                     │ 1:1 (clé ref_id+code)
                                     ▼
                                 Évaluation ──N:1──> Mesure de sécurité (pivot)
                                     │ 1:N               │ (propage statut+maturité)
                                     ▼                   ▼
                                  Action ............ (couvre N évaluations, multi-référentiels)
```

Cascades : `deleteEvaluation` → supprime ses actions ; `deleteEvaluationsByRef` →
réinitialise un référentiel ; `deleteMesure` → délie ses évaluations (`mesure_id`→null).

---

## 5. Référentiels (catalogue statique)

Les référentiels sont un **catalogue statique** chargé au démarrage (registre
`Referentiels`, `js/data/referentiels.js`), **non stocké** dans `data`. Un fichier
de données par référentiel (`js/data/ref_anssi.js`, …), au schéma commun :

```jsonc
{
  "id": "anssi-hygiene", "nom": "...", "editeur": "ANSSI", "version": "42 mesures",
  "description": "...", "aide": "...",
  "domaines": [
    { "id": "...", "nom": "...", "court": "...", "aide": "...",
      "exigences": [ { "code": "1", "titre": "...", "aide": "..." } ] }
  ]
}
```

> ⚠️ **Ne jamais embarquer le texte intégral des normes** (ISO payant/protégé).
> Reformulations originales courtes + identifiant de clause + titre court uniquement.
> ANSSI (guide public) inclus en reformulations maison.

**Terminologie** : au sein d'un référentiel, un item est une « **exigence de
référentiel** » (`{code, titre, aide}`). À ne pas confondre avec l'entité utilisateur
« **Mesure de sécurité** » (`mesures`), le pivot qui **couvre** ces exigences.

Une exigence peut porter des **attributs optionnels** (utilisés par AirCyber) : `niveau`
(`bronze`/`silver`/`gold`), `priorite` (`high`/`medium`/`low`), `cl` (`CL0`…`CL6`). Le
référentiel peut aussi porter `clLabels` (libellés des domaines CL). Les référentiels qui
n'en ont pas n'affichent ni badges, ni filtres, ni panneau « préparation au label ».

Un référentiel peut enfin déclarer **`scoring: "conformite"`** (AirCyber) : questionnaire à
réponses **Oui / Non / N-A** (mêmes valeurs de données `conforme` / `non conforme` /
`non applicable`), **sans échelle de maturité CMMI**. Score = « Oui » ÷ questions applicables
(N/A exclues ; non répondu = « Non ») ; le radar affiche ce taux par domaine CL, filtrable par
niveau de label, et le champ `maturite` des évaluations n'est ni saisi ni interprété (il est
préservé s'il existe, mais exclu des moyennes CMMI du tableau de bord).

Livré : référentiel **ANSSI** + auto-évaluation + radar (it. 4) ; **pivot Mesure de
sécurité** `/mesures` + propagation (it. 5) ; ISO 27001 (Annexe A) / NIS2 / DORA / **AirCyber réel**
+ **import CSV** des réponses + **niveaux Bronze/Argent/Or, priorité, CL0–CL6** (it. 6, 13, 14) ;
couverture croisée + génération SoA (it. 7).
