# Modèle de données — Cyber GRC

> Document de référence du schéma de données. À tenir à jour à chaque évolution.
> Application **100 % frontend** : toutes les données vivent dans le navigateur
> (IndexedDB, avec repli localStorage). Aucune donnée ne quitte le poste.

Version de schéma courante : **`SCHEMA_VERSION = 3`** (défini dans `js/core/datastore.js`).
> v3 (chantier Référentiels) : ajout des tableaux `evaluations` et `mesures`
> (migration transparente — `normalize` crée les tableaux vides à la volée).

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
  "evaluations": [],    "mesures": []       // v3 — chantier Référentiels
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
| `exigence_id` | string | une action est liée à **l'un** de : exigence, risque ou évaluation |
| `risque_id` | string | |
| `evaluation_id` | string | lien vers une évaluation de référentiel (v3) |

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

### MCO (maintien en condition) — `mco_actions`
`{ id, titre, frequence, etat: "OK"|"KO", date, notes }`

### Prestataire / tiers — `prestataires`
`{ id, societe, type, phone, email, notes }`

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
| `statut` | enum | `conforme` \| `partiellement conforme` \| `non conforme` \| `non applicable` \| `""` (non évalué) |
| `maturite` | number | 0-5 (échelle type CMMI) |
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

Livré : référentiel **ANSSI** + auto-évaluation + radar (it. 4) ; **pivot Mesure de
sécurité** `/mesures` + propagation (it. 5).
À venir (4c) : mapping croisé, ISO 27002 / NIS2 / DORA / AirCyber + génération de SoA.
