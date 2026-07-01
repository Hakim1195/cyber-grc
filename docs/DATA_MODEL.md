# Modèle de données — Cyber GRC

> Document de référence du schéma de données. À tenir à jour à chaque évolution.
> Application **100 % frontend** : toutes les données vivent dans le navigateur
> (IndexedDB, avec repli localStorage). Aucune donnée ne quitte le poste.

Version de schéma courante : **`SCHEMA_VERSION = 2`** (défini dans `js/core/datastore.js`).

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
  "schemaVersion": 2,
  "updatedAt": 1730000000000,
  "clients": [],        "exigences": [],   "actions": [],
  "risques": [],        "actifs": [],      "processus": [],
  "crise": [],          "scenarios_pra": [], "tests_pra": [],
  "prestataires": [],   "mco_actions": [], "audits": [],  "revues": []
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
| `exigence_id` | string | **OU** `risque_id` — une action est liée à l'un ou l'autre |
| `risque_id` | string | |

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

## 4. Entités à venir (chantier Référentiels — cf. PLAN.md)

> Bump prévu `SCHEMA_VERSION` → 3 (+ migration `migratePayload` v2→v3 : créer les tableaux).

- **Référentiel** (catalogue **statique**, non stocké dans `data`) :
  `{ id, nom, description, aide, domaines: [{ id, nom, mesures: [{ code, titre, aide }] }] }`
  Fichier de données par référentiel (schéma commun). Ne pas embarquer le texte des normes.
- **Mesure de sécurité** (`mesures`, pivot, données utilisateur) :
  `{ id, nom, description, statut, maturite, responsable, exigences_couvertes: [{ ref_id, code }] }`
- **Évaluation** (`evaluations`, par exigence de référentiel) :
  `{ id, ref_id, code, statut, maturite (0-5), commentaire, preuves, mesure_id?, action_ids[] }`
- Statuts conformité (réutiliser l'enum existant) : `conforme | partiellement conforme | non conforme | non applicable`.
- Évaluer une **Mesure** propage le statut à toutes les exigences mappées (zéro double saisie).
