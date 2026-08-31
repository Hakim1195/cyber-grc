# Conventions de schéma PostgreSQL — Cyber GRC Groupe

> **Document normatif du lot L1.** Toute migration écrite par n'importe quel agent ou
> développeur respecte ces règles **sans exception**. Une dérogation se justifie dans un
> commentaire SQL, à l'endroit exact où elle est prise.
>
> Références : `docs/PLAN_SERVEUR.md` (cadrage, fait autorité) · `docs/DATA_MODEL.md`
> (modèle applicatif actuel, entité par entité) · `CLAUDE.md` (conventions produit).

Sommaire : [1. Généralités](#1-généralités) · [2. Identifiants](#2-identifiants) ·
[3. Colonnes obligatoires](#3-colonnes-obligatoires-de-toute-table-métier) ·
[4. Cloisonnement](#4-cloisonnement-par-filiale) · [5. Types et domaines](#5-types-et-domaines) ·
[6. JSONB](#6-jsonb--liste-fermée) · [7. Relations n-n](#7-relations-n-n) ·
[8. Cascades](#8-cascades-de-suppression) · [9. Nommage](#9-nommage-des-objets) ·
[10. Fonctions du socle](#10-fonctions-partagées-du-socle) · [11. RLS](#11-row-level-security) ·
[12. Journal](#12-journal-daudit--règles-particulières) · [13. Migrations](#13-migrations) ·
[14. Rôles et privilèges](#14-rôles-et-privilèges) · [15. Codes d'erreur](#15-codes-derreur-applicatifs) ·
[16. Découpage L1](#16-découpage-du-lot-l1--décisions-figées)

---

## 1. Généralités

| Règle | Détail |
|---|---|
| Langue | **Français** : noms de tables, de colonnes, de contraintes, de fonctions, commentaires, messages d'erreur. Vocabulaire métier du `DATA_MODEL.md`. |
| Casse | **`snake_case`**, sans accent ni caractère spécial dans les identifiants SQL (les accents restent dans les *valeurs* et les commentaires). |
| Nombre | Table au **pluriel** (`risques`, `actifs`), colonne au **singulier** (`filiale_id`, `statut`). |
| Schéma | Tout dans **`public`**. Pas de schéma dédié : le service applicatif n'a qu'une base, et un `search_path` supplémentaire est une source de bogue sans contrepartie ici. |
| Version PostgreSQL | **15 minimum** (`unique nulls not distinct`, `sha256()` natif, `security_invoker` sur les vues). Cible de déploiement : PostgreSQL 17 du dépôt PGDG. |
| Extensions | **Aucune requise.** `sha256()` est natif depuis PostgreSQL 11 — ne pas introduire `pgcrypto` pour cela. |
| Documentation | Toute table et toute colonne non évidente porte un `comment on` **en français**. C'est ce que lit un auditeur, et c'est ce que lit l'agent qui écrira la migration suivante. |

---

## 2. Identifiants

```sql
id id_metier primary key
```

**Format conservé de l'application existante** : `"<PRÉFIXE>-<horodatage>-<aléa>"`
(`UI.genId`, ex. `RISK-1720000000000-482`).

- **Pas d'UUID, pas de `serial`, pas d'`identity`.** L'import d'un export `grc-backup`
  doit être un **round-trip exact** : les identifiants du fichier deviennent tels quels
  les clés primaires, et les huit clés étrangères implicites du modèle actuel
  (`ref_id`, `risque_id`, `client_id`, `exigence_id`, `scenario_id`, `mesure_id`,
  `evaluation_id`, `incident_id`) continuent de pointer sans table de correspondance.
- Le domaine `id_metier` est **volontairement permissif** (texte non vide, ≤ 64 caractères) :
  les exports anciens contiennent des identifiants sans suffixe aléatoire
  (`ACT-1720000000000`) et des identifiants de processus BIA sans préfixe. Une expression
  régulière stricte casserait la reprise de données — c'est le rôle du code applicatif,
  pas du schéma, de générer le format canonique.
- Préfixes en service (à réutiliser, ne pas en inventer de nouveaux pour une entité existante) :

  | Entité | Préfixe | Entité | Préfixe |
  |---|---|---|---|
  | `clients` | `CLI` | `documents` | `DOC` |
  | `personnes` | `PERS` | `traitements` | `TRT` |
  | `exigences` | `EX` | `mappings` | `MAP` |
  | `actions` | `ACT` | `history` | `HIST` |
  | `risques` | `RISK` | `evaluations` | `EVAL` |
  | `actifs` | `ACTIF` | `mesures` | `MESURE` |
  | `processus` (BIA) | `BIA` | `incidents` | `INC` |
  | `crise` | `CRISE` | `audits` | `AUD` |
  | `scenarios_pra` | `SCEN` | `revues` | `REV` |
  | `tests_pra` | `TEST` | `prestataires` | `PREST` |
  | `mco_actions` | `MCO` | | |

  Préfixes créés par le socle (migration `001`) : `FIL` (filiales), `USER`, `SESS`,
  `GRPAD`, `PROFIL`, `LOG` (journal), `PJ` (pièces jointes), `APPRO`, `REFACT`
  (référentiels activés), `IMP`, `PARAM`.

  Préfixe créé par la scission des mesures (§16) : `MMO` (`mesure_mise_en_oeuvre`). C'est le
  **seul** identifiant du modèle qui n'existe dans aucun export `grc-backup` — il est engendré
  à la reprise, jamais lu depuis un fichier.

---

## 3. Colonnes obligatoires de toute table métier

Bloc à recopier **à l'identique** en fin de définition de chaque table modifiable :

```sql
    version     integer     not null default 1,
    cree_le     timestamptz not null default now(),
    cree_par    text        not null default f_utilisateur_courant(),
    modifie_le  timestamptz,
    modifie_par text
```

et le déclencheur qui va avec, **obligatoire, une ligne par table** :

```sql
create trigger trg_<table>_maj before update on <table>
    for each row execute function f_maj_tracabilite();
```

- **`version` = verrouillage optimiste** (§1.4 du plan, risque projet P1). L'API écrit
  toujours `update <table> set … where id = $1 and version = $2` ; **zéro ligne affectée
  = conflit** → l'API renvoie une erreur `GRC03` et l'interface propose de recharger.
  Le déclencheur impose `version = old.version + 1` : le client **ne peut pas** fixer le
  numéro de version lui-même.
- Le déclencheur rend également `cree_le` / `cree_par` **non réinscriptibles** et force
  `modifie_le = now()`, `modifie_par = f_utilisateur_courant()`.
- `cree_par` / `modifie_par` sont **du texte, sans clé étrangère** vers `utilisateurs` :
  la trace doit survivre à la suppression d'un compte.
- **Tables de liaison et tables filles** (`profil_domaines`, `import_erreurs`, tables n-n
  du §7) : **pas de `version`** (la version est portée par l'entité parente), traçabilité
  réduite à `cree_le` / `cree_par`, déclencheur `f_maj_horodatage()` si la ligne est
  modifiable.
- **Exemption : les tables filles d'une session** (`session_filiales`, `session_domaines`)
  ne portent **aucune** colonne de traçabilité. Elles décrivent un périmètre résolu qui vit
  et meurt avec sa session, laquelle porte déjà son auteur et son horodatage ; les dupliquer
  par ligne n'apprendrait rien et alourdirait le chemin le plus chaud de l'application.
  C'est ce que fait `001_socle.sql`, et c'est délibéré.
- **`journal_audit` est hors de cette règle** : voir §12.

---

## 4. Cloisonnement par filiale

Toute table de **niveau filiale** porte :

```sql
    filiale_id id_metier not null references filiales(id) on delete restrict
```

- `on delete restrict` et **jamais** `cascade` : une filiale ne se supprime pas d'un
  `delete`, elle **sort** du groupe (statut `sortie`, export complet, rétention, puis purge
  explicite — §2.7 du plan). Le `restrict` est le garde-fou de cette procédure.
- Index systématique : `filiale_id` en tête de tout index de liste
  (`create index ix_<table>_filiale on <table>(filiale_id, …)`).
- **Tables de niveau Groupe** (pas de `filiale_id`) : `filiales`, `utilisateurs`,
  `profils`, `profil_domaines`, `groupes_ad`, `mappings`.
- **Tables mixtes** (`filiale_id` **nullable**, `null` = portée Groupe) : `parametres`,
  `documents`, `personnes` et `mesure_catalogue` (§16). Le caractère nullable est alors
  **commenté dans le SQL** avec la justification.
- `sessions`, `groupes_ad` et `journal_audit` portent un `filiale_id` nullable pour une
  autre raison : l'événement peut précéder la résolution du périmètre (échec de connexion)
  ou être transversal (groupe AD `GRC-EXPORT`, démarrage du service).

---

## 5. Types et domaines

| Besoin | Type retenu | Interdit |
|---|---|---|
| Identifiant | `id_metier` (domaine sur `text`) | `uuid`, `serial` |
| Énumération | **`text` + `check (… in (…))`** ou domaine partagé | `create type … as enum` |
| Horodatage | `timestamptz` | `timestamp` sans fuseau |
| Date métier (échéance, revue) | `date` | `text` |
| Booléen | `boolean` | `text` valant `'Oui'`/`'Non'` |
| Score, coefficient | `numeric` | `float` / `double precision` |
| Adresse IP | `inet` | `text` |
| Empreinte SHA-256 | `empreinte_sha256` (domaine) | `text` libre |

**Pourquoi pas de type `enum` PostgreSQL** : les valeurs métier sont des chaînes
françaises accentuées **déjà stockées telles quelles par le frontend**
(`"partiellement conforme"`, `"à faire"`, `"À planifier"`) et le round-trip `grc-backup`
doit les rendre à l'identique. Un `check` sur du `text` se modifie par un simple
`alter table … drop/add constraint`, là où un type `enum` impose un verrou exclusif et une
gymnastique de migration. **Les valeurs de `check` reprennent exactement les chaînes du
`DATA_MODEL.md`, accents et espaces compris.**

Domaines partagés créés par `001_socle.sql` — **à réutiliser, ne pas redéfinir** :

| Domaine | Base | Contenu |
|---|---|---|
| `id_metier` | `text` | Clé primaire et clés étrangères métier |
| `empreinte_sha256` | `text` | 64 caractères hexadécimaux minuscules |
| `code_langue` | `text` | `fr` · `en` · `es` |
| `niveau_droit` | `text` | `aucun` · `lecture` · `contribution` · `validation` · `administration` |
| `domaine_fonctionnel` | `text` | Les 30 domaines de l'application (§3.2 du plan) |
| `type_entite` | `text` | Les entités adressables (rattachement d'une pièce jointe, cible d'une entrée de journal, entité d'un import) |

Étendre un domaine (nouvelle entité, nouveau domaine fonctionnel) se fait dans la
migration qui en a besoin :

```sql
alter domain type_entite drop constraint type_entite_check;
alter domain type_entite add constraint type_entite_check check (value in (…, 'nouvelle_entite'));
```

---

## 6. JSONB — liste fermée

`jsonb` est réservé aux **documents figés** identifiés au §2.1 du plan. La liste est
**close** ; tout autre besoin est relationnel.

| Emplacement | Justification |
|---|---|
| `audits.items` (grille) et `audits.constats` | Instantané autoportant : le texte du point de contrôle est **figé au moment de la génération**, c'est la garantie d'intégrité de l'audit. Le normaliser détruirait ce qui a été construit à dessein. |
| `scenarios_pra.etapes_pca` / `etapes_pra` | Fiche réflexe + matrice RACI : document de crise, lu tel quel, jamais interrogé colonne par colonne. |
| `prestataires.supply_chain` | Sac de booléens d'exigences NIS2/DORA, sans vie propre. |
| `history.metrics` | Relevé d'indicateurs daté, en écriture seule, jamais joint. |
| `journal_audit.valeurs_avant` / `valeurs_apres` | **Dérogation explicite du socle**, voir §12. |

Trois interdits qui reviennent souvent :

1. Un **tableau d'identifiants** en `jsonb` ou en `text[]` → c'est une table de liaison (§7).
2. Un **`jsonb` fourre-tout** (`donnees`, `extra`, `meta`) → colonnes typées.
3. Un **`text` contenant du JSON** → si le contenu est un document, c'est `jsonb`.

---

## 7. Relations n-n

Les tableaux de chaînes du modèle actuel deviennent de **vraies tables de liaison**,
avec clés étrangères contraintes des deux côtés :

| Aujourd'hui | Table de liaison | Attribut porté |
|---|---|---|
| `risques.exigences_liees[]` | `risque_exigences` | — |
| `actifs.risques_lies[]` | `actif_risques` | — |
| `processus.actifs_lies[]` | `processus_actifs` | — |
| `incidents.actifs_touches[]` | `incident_actifs` | — |
| `evaluations.mesure_ids[]` | `evaluation_mesures` | — |
| `traitements.mesures_ids[]` | `traitement_mesures` | — |
| `documents.referentiels[]` | `document_referentiels` | `ref_id` (catalogue statique, pas de FK) |
| `actifs.dependances[]` | `actif_dependances` | **`type`** (`dep`/`hosted`/`flux`/`backup`) |

Règles :

- Nom = `<parent_singulier>_<enfant_pluriel>`.
- Clé primaire **composite** sur le couple d'identifiants (dédoublonnage garanti par le
  schéma, là où le frontend s'en remettait au code). **Exception : quand l'attribut porté
  fait partie de l'identité du lien, il entre dans la clé.** C'est le cas d'
  `actif_dependances`, où le frontend admet délibérément « A est hébergé sur B » *et* « A
  est sauvegardé par B » (`actifs.js` dédoublonne sur `(cible, type)`) : une clé réduite au
  couple ferait échouer la reprise d'un export contenant les deux liens.
- `on delete cascade` **des deux côtés** : supprimer l'une des extrémités supprime le lien,
  jamais l'autre extrémité — c'est exactement le comportement « délier » des cascades
  actuelles (§8).
- Une table de liaison **ne porte pas** de `filiale_id` quand ses deux extrémités sont
  déjà cloisonnées ; la RLS s'applique alors par jointure. Elle en porte un si l'une des
  extrémités est de niveau Groupe ou mixte (cas d'`evaluation_mesures`, §16.5).
  ⚠️ Une liaison **sans** `filiale_id` n'est protégée d'un lien inter-filiales que par la
  RLS ; aucune clé étrangère composite ne peut l'y contraindre. Les politiques de `004`
  doivent donc couvrir ces tables explicitement, et la porte S1 le vérifie.
- `actif_dependances` conserve un `check (actif_id <> actif_cible_id)` : un actif ne dépend
  pas de lui-même.

---

## 8. Cascades de suppression

Les cascades du `DATA_MODEL.md` §3 et §4 sont portées **par le schéma**, pas par le code —
c'est tout l'intérêt du passage en base (le chantier de rattrapage des tests PRA orphelins
n'a plus lieu d'être).

| Suppression | Effet attendu | Mise en œuvre |
|---|---|---|
| `deleteClient` | supprime ses `exigences`, donc leurs `actions` | `on delete cascade` en chaîne |
| `deleteExigence` | supprime ses `actions`, **délie** les risques | `cascade` + `cascade` sur la liaison |
| `deleteRisque` | supprime ses `actions`, **délie** actifs et incidents | `cascade` + `on delete set null` sur `incidents.risque_id` |
| `deleteActif` | **délie** incidents et **purge les dépendances entrantes** | `cascade` sur les liaisons, dans les deux sens |
| `deleteEvaluation` | supprime ses `actions` | `cascade` |
| `deleteMesure` | **délie** les évaluations et **conserve** les actions (`mesure_id → null`) | `cascade` sur la liaison, `on delete set null` sur `actions.mesure_id` |
| `deleteScenarioPra` | supprime ses `tests_pra` | `cascade` |
| `deleteIncident` | supprime ses `actions` | `cascade` |

Distinction à ne jamais confondre : **« supprime » = `on delete cascade`**,
**« délie » = `on delete set null`** (ou suppression de la seule ligne de liaison).
Une action orpheline de sa mesure reste au plan d'actions ; une action orpheline de son
exigence n'a plus d'objet.

Le `restrict` reste réservé aux **filiales** (§4) et aux référentiels d'un profil en
service.

---

## 9. Nommage des objets

| Objet | Modèle | Exemple |
|---|---|---|
| Clé primaire | `pk_<table>` | `pk_filiales` |
| Clé étrangère | `fk_<table>_<colonne>` | `fk_sessions_utilisateur_id` |
| Unicité | `uq_<table>_<colonnes>` | `uq_filiales_code` |
| Contrainte de validation | `ck_<table>_<sujet>` | `ck_filiales_statut` |
| Index | `ix_<table>_<colonnes>` | `ix_journal_audit_filiale_horodatage` |
| Fonction | `f_<verbe>_<objet>` | `f_maj_tracabilite` |
| Déclencheur | `trg_<table>_<sujet>` | `trg_journal_audit_chainage` |
| Politique RLS | `pol_<table>_<sujet>` | `pol_risques_filiale` |

Toute contrainte est **nommée explicitement** : un message d'erreur `ck_actifs_criticite`
se traduit en message utilisateur ; un `actifs_criticite_check1` généré par PostgreSQL ne
se traduit pas.

---

## 10. Fonctions partagées du socle

Créées par `001_socle.sql`. **À réutiliser telles quelles** — ne pas en écrire de variantes.

| Fonction | Nature | Rôle |
|---|---|---|
| `f_utilisateur_courant()` | `stable` → `text` | Identifiant de l'utilisateur de la transaction, lu dans `grc.utilisateur` ; `'systeme'` si absent (migrations, tâches planifiées). |
| `f_filiale_courante()` | `stable` → `text` | Filiale active de la session, lue dans `grc.filiale_id`. |
| `f_filiales_autorisees()` | `stable` → `text[]` | Périmètre résolu de la session, lu dans `grc.filiales` (liste séparée par des virgules). Vide = aucun accès. |
| `f_maj_tracabilite()` | déclencheur | `version + 1`, `modifie_le`, `modifie_par`, gel de `cree_le`/`cree_par`. |
| `f_maj_horodatage()` | déclencheur | Idem sans `version` (tables filles). |
| `f_interdit_modification()` | déclencheur | Refuse `update` / `delete` / `truncate` avec le code `GRC01`. |
| `f_journal_audit_charge_utile(…)` | `stable` → `text` | Sérialisation canonique d'une entrée de journal (support du chaînage). |
| `f_journal_audit_chainage()` | déclencheur | Attribue `numero`, `horodatage`, `empreinte_precedente` et `empreinte`. |
| `f_journal_audit_verifier(depuis)` | `stable` → table | Vérification du chaînage (§12). |

Ces fonctions sont en `security invoker` (défaut) : **aucune** n'est un contournement de
droits.

---

## 11. Row Level Security

> Les **politiques** RLS sont créées dans la migration dédiée du lot L1 (partie 3), **pas**
> dans les migrations de tables. Les migrations de tables se contentent de définir
> `filiale_id` conformément au §4. Les conventions ci-dessous fixent le contrat.

- Le périmètre est positionné **en début de transaction, depuis la session serveur** :

  ```sql
  set local grc.utilisateur = 'jdupont';
  set local grc.filiale_id  = 'FIL-1720000000000-004';
  set local grc.filiales    = 'FIL-…-004,FIL-…-011';
  ```

  **Jamais depuis une valeur transmise par le navigateur** (§2.4 du plan). `set local`
  garantit que le réglage meurt avec la transaction, y compris dans un pool de connexions.
- Une politique de lecture filtre sur `filiale_id = any (f_filiales_autorisees())`
  (périmètre multi-filiales et Groupe), une politique d'écriture sur
  `filiale_id = f_filiale_courante()` (on n'écrit que dans la filiale **active**).
- `alter table … enable row level security` **et** `force row level security` : sans le
  `force`, le propriétaire de la table échappe aux politiques.
- Le rôle applicatif **n'a pas** `bypassrls`.

---

## 12. Journal d'audit — règles particulières

`journal_audit` **déroge** aux §3 et §6, et ces dérogations sont assumées :

1. **Pas de `version`, pas de `modifie_le`, pas de `modifie_par`** : une ligne du journal
   n'est jamais modifiée, ces colonnes n'auraient aucun sens. `cree_le` est remplacé par
   `horodatage`, positionné par le serveur (`clock_timestamp()`), jamais par le client.
2. **`valeurs_avant` / `valeurs_apres` en `jsonb`** : le journal enregistre l'état d'une
   entité *quelconque* avant et après modification (§1.7 du plan). C'est par nature un
   document figé, en écriture seule, qui ne participe à aucune intégrité référentielle —
   exactement le critère du §6. Aucune autre colonne `jsonb` n'est admise dans cette table.
3. **Aucune clé étrangère vers la cible** (`entite_type` / `entite_id`) ni vers `sessions` :
   le journal doit survivre à la suppression de ce qu'il décrit. Seules `filiale_id` et
   `utilisateur_id` sont contraintes, en `restrict`, et **doublées d'un libellé texte**
   (`utilisateur_libelle`) qui reste lisible même si le compte disparaît.

### Ajout seul — comment c'est techniquement garanti

Quatre couches, cumulatives :

| # | Couche | Ce qu'elle bloque |
|---|---|---|
| 1 | `revoke update, delete, truncate … from public` et du rôle applicatif | L'API, même compromise, n'a pas le verbe SQL. |
| 2 | Déclencheurs `before update` / `before delete` / `before truncate` en `for each statement`, levant `GRC01` | La tentative échoue **bruyamment**, y compris sur un `update` qui ne toucherait aucune ligne. |
| 3 | `enable always trigger` | Le contournement par `set session_replication_role = replica` ne désarme pas les déclencheurs. |
| 4 | **Le rôle applicatif n'est pas propriétaire de la table** | Seul le propriétaire peut `alter table … disable trigger` ; l'application ne le peut pas. |

**Pourquoi des déclencheurs plutôt que des `rule … do instead nothing`** : une règle
transforme un `delete` en opération silencieuse qui *réussit* — l'appelant croit avoir
supprimé, personne n'est alerté. Le déclencheur échoue et laisse une trace. Les règles ne
couvrent d'ailleurs pas `truncate`.

**Ce qui n'est pas couvert, et doit être dit** : `root` sur la VM et le propriétaire de la
base peuvent désactiver un déclencheur. Le journal protège contre l'application et contre
l'administrateur *applicatif* (le RSSI, cible de la question d'audit) — pas contre le
DBA système. C'est là qu'intervient le chaînage : une altération par accès direct reste
**détectable**.

### Chaînage par empreinte

Chaque entrée porte :

- `numero` — position dans la chaîne, attribuée **par le déclencheur** (`max(numero) + 1`),
  pas par une séquence. Une séquence attribue son numéro *avant* le déclencheur et peut
  valider dans le désordre : la chaîne ne correspondrait plus à l'ordre des numéros. Le
  déclencheur prend un `pg_advisory_xact_lock` (clé `4718271936042001`) qui sérialise
  strictement les insertions jusqu'au `commit`.
- `empreinte_precedente` — l'`empreinte` de l'entrée `numero - 1` (`null` pour la genèse).
- `empreinte` — `sha256` de la sérialisation canonique de **tous** les champs de l'entrée,
  `empreinte_precedente` comprise.

Les deux mécanismes sont **complémentaires**, et il faut être précis sur ce que chacun
attrape — `empreinte_precedente` est *stockée*, pas recalculée à la lecture :

| Ce que fait l'attaquant | Ce qui le trahit |
|---|---|
| Retoucher le contenu d'une ligne | `empreinte_invalide` **sur cette ligne** (son empreinte ne correspond plus à son contenu) |
| Retoucher le contenu **et** recalculer l'empreinte | `chainage_rompu` **sur la ligne suivante** (dont l'`empreinte_precedente` figée ne correspond plus) |
| Supprimer une ligne | `numero_manquant` **et** `chainage_rompu` |

Autrement dit : falsifier une entrée sans se faire voir exigerait de **réécrire toute la
chaîne jusqu'à la dernière entrée**, en ayant désactivé les déclencheurs — ce que seul le
propriétaire de la base peut faire, et ce que `f_journal_audit_verifier()` révèle dès qu'un
maillon manque à l'appel.

Le client **ne fournit ni `numero`, ni `empreinte`, ni `empreinte_precedente`, ni
`horodatage`** : le déclencheur écrase ce qu'il aurait envoyé. Il n'y a donc aucun moyen de
forger une entrée cohérente par l'API.

### Vérification du chaînage

```sql
-- Vérification intégrale (à jouer lors d'un audit, ou par un timer systemd mensuel)
select * from f_journal_audit_verifier();

-- Vérification partielle, à partir d'un numéro (contrôle rapide sur les entrées récentes)
select * from f_journal_audit_verifier(150000);

-- Un journal sain ne renvoie AUCUNE ligne.
```

Anomalies renvoyées :

| `anomalie` | Signification |
|---|---|
| `empreinte_invalide` | Le contenu de la ligne ne correspond plus à son empreinte → **ligne modifiée**. |
| `chainage_rompu` | `empreinte_precedente` ≠ empreinte de l'entrée précédente → **entrée insérée ou substituée**. |
| `numero_manquant` | Trou dans la numérotation → **entrée supprimée**. |
| `genese_incoherente` | L'entrée n° 1 porte une `empreinte_precedente` → chaîne fabriquée. |
| `chaine_tronquee` | *Informatif* : la vérification démarre après le premier maillon (paramètre `depuis`, ou entrées archivées). |

### Rétention 3 ans et archivage

La rétention (§1.7 du plan) est **incompatible avec un `delete`** : elle passe par une
procédure d'exploitation, exécutée par le **propriétaire** de la base, jamais par
l'application :

1. exporter le segment à archiver (`copy … to`), avec son empreinte de fin ;
2. **enregistrer l'empreinte du dernier maillon archivé** dans `parametres`
   (clé `journal.ancrage_<annee>`, portée Groupe) — c'est ce qui permet de vérifier la
   chaîne **de part et d'autre** de la coupure ;
3. désactiver explicitement les déclencheurs, supprimer le segment, les réactiver ;
4. journaliser l'opération elle-même (action `purge`).

Si le volume devait rendre cette procédure pénible, la table se partitionne par année sur
`horodatage` et l'archivage devient un `detach partition` — évolution à traiter en L5, sans
impact sur le modèle de données.

---

## 13. Migrations

- Un fichier par lot logique : `NNN_<sujet>.sql`, numérotation à trois chiffres, **jamais
  renumérotée**, jamais réécrite une fois appliquée en production.
- Chaque fichier est **transactionnel** (`begin` / `commit` dans le fichier) : il s'applique
  entièrement ou pas du tout.
- Chaque fichier **s'enregistre lui-même** en dernier dans `migrations_schema`
  (`insert … on conflict do nothing`).
- Chaque fichier se termine par un **bloc commenté d'annulation** (`-- ANNULATION`)
  reprenant les `drop` dans l'ordre inverse. Le retour arrière réel se fait par
  **instantané Proxmox** (§1.2 du plan) ; le bloc commenté documente l'intention et sert
  aux environnements de développement.
- Invocation de référence :

  ```bash
  psql -v ON_ERROR_STOP=1 -d cyber_grc -f backend/db/migrations/001_socle.sql
  ```

- `migrations_schema` est créée par `001` avec `create table if not exists` **et ne doit
  pas être recréée** par une autre migration.
- Les `create table` sont **sans `if not exists`** (hors ledger) : rejouer une migration
  déjà appliquée doit échouer bruyamment, pas passer silencieusement.

---

## 14. Rôles et privilèges

| Rôle | Usage | Privilèges |
|---|---|---|
| `grc_proprietaire` | Applique les migrations, propriétaire des objets | DDL |
| `grc_app` | Service Node/TypeScript (systemd) | `select`, `insert`, `update`, `delete` — **sauf** `journal_audit` (`select`, `insert` seuls) ; pas de DDL, pas de `bypassrls` |
| `grc_lecture` | Supervision, exports d'exploitation | `select` |

La séparation propriétaire / application n'est pas cosmétique : c'est la couche 4 de la
garantie d'ajout seul (§12). Les migrations posent
`alter default privileges … grant … to grc_app` **avant** de créer les tables, si bien que
les migrations suivantes n'ont pas à répéter leurs `grant`. `001_socle.sql` applique ces
réglages **seulement si les rôles existent** (créés en L0), et reste donc jouable sur un
poste de développement.

---

## 15. Codes d'erreur applicatifs

`SQLSTATE` personnalisés, à traduire en message utilisateur par l'API :

| Code | Signification | Émis par |
|---|---|---|
| `GRC01` | Journal d'audit inaltérable : modification ou suppression refusée | Base |
| `GRC02` | Étape d'approbation franchie : décision irréversible | Base |
| `GRC03` | Conflit de version (verrouillage optimiste) — « modifié entre-temps » | API (`0 ligne` sur `update … and version = $2`) |
| `GRC04` | Périmètre non positionné : `grc.filiale_id` absent alors que la RLS l'exige | Base (L1 partie 3) |

---

## 16. Découpage du lot L1 — décisions figées

> Ces arbitrages ferment les ambiguïtés du `PLAN_SERVEUR` §2.2 avant écriture des migrations.
> Ils sont **normatifs** : trois migrations écrites en parallèle doivent s'accorder sans se lire.

### 16.1 Les fichiers et leur ordre

| Fichier | Contenu | Dépend de |
|---|---|---|
| `001_socle.sql` | 16 tables du socle, domaines partagés, fonctions, journal chaîné | — (livré) |
| `002_metier_noyau.sql` | `clients`, `personnes`, `exigences`, `mesure_catalogue`, `mesure_mise_en_oeuvre`, `evaluations`, `risques`, `actifs`, `processus` + liaisons `risque_exigences`, `actif_risques`, `processus_actifs`, `actif_dependances`, `evaluation_mesures` | `001` |
| `003_metier_operations.sql` | `incidents`, `actions`, `crise`, `scenarios_pra`, `tests_pra`, `mco_actions`, `prestataires`, `audits`, `revues`, `documents`, `traitements`, `mappings`, `history` + liaisons `incident_actifs`, `traitement_mesures`, `document_referentiels`, `mapping_exigences` | `002` |
| `004_rls.sql` | Rôles, privilèges, politiques RLS, garde-fou de couverture | `003` |

Le graphe des clés étrangères est **acyclique dans cet ordre** : rien dans `002` ne référence
`003`. `actions` est en `003` parce qu'elle référence `incidents`, alors qu'elle référence
aussi `exigences`, `risques`, `evaluations` et `mesure_catalogue` — elle doit donc venir après
les deux groupes, et après `incidents` à l'intérieur de `003`.

`mapping_exigences` ne figurait pas au découpage initial : le champ `mappings.refs`
(`{ref_id: [codes]}`) du modèle navigateur est un **objet de tableaux d'identifiants**, que les
trois interdits du §6 excluent du `jsonb`. C'est donc une table fille, de niveau Groupe comme
son parent.

### 16.2 Scission des mesures

`mesures` devient deux tables, conformément au `PLAN_SERVEUR` §2.2.

| Table | Niveau | Rôle | Identifiant |
|---|---|---|---|
| `mesure_catalogue` | **Mixte** — `filiale_id` **nullable** : `null` = socle imposé par le Groupe, renseigné = mesure **locale** à une filiale | *Définition* du contrôle : référence, nom, description, domaine | `MESURE-…` — **celui de l'export `grc-backup`**, inchangé |
| `mesure_mise_en_oeuvre` | **Filiale** — `filiale_id` non nul | *Évaluation* du contrôle dans une filiale : statut, maturité, responsable, commentaire | `MMO-…` — engendré, absent des exports |

Unicité `uq_mesure_mise_en_oeuvre_filiale_mesure` sur `(filiale_id, mesure_id)` : une filiale
n'évalue un contrôle qu'une fois.

**Le nullable de `mesure_catalogue.filiale_id` est la condition des deux besoins à la fois** :
un socle commun (sans quoi la vision Groupe additionne des grandeurs incomparables) et la
possibilité pour une filiale d'ajouter ses propres contrôles.

### 16.3 Où pointent les références à « une mesure »

Les trois liens que le modèle actuel porte vers `mesures` visent **le catalogue**, jamais la
mise en œuvre :

| Lien | Cible | Motif |
|---|---|---|
| `evaluation_mesures.mesure_id` | `mesure_catalogue` | La liaison dit « cette exigence est couverte par ce contrôle » |
| `actions.mesure_id` | `mesure_catalogue` | `on delete set null` — l'action survit à la mesure (§8) |
| `traitement_mesures.mesure_id` | `mesure_catalogue` | Idem |

**Pourquoi le catalogue et non la mise en œuvre** : c'est ce qui rend le round-trip
`grc-backup` exact. L'identifiant écrit dans le fichier est celui du catalogue ; s'il fallait
le traduire vers un `MMO-…` propre à la filiale, la reprise exigerait une table de
correspondance — exactement ce que le §2 interdit.

La mise en œuvre concernée se déduit sans ambiguïté du couple **(`filiale_id` de la ligne
porteuse, `mesure_id`)**, puisque `mesure_mise_en_oeuvre` est unique sur ce couple.

La **propagation « au plus défavorable »** (statut le plus faible, maturité la plus basse)
s'applique donc ainsi : pour une évaluation de la filiale F, agréger les
`mesure_mise_en_oeuvre` **de F** correspondant aux `mesure_catalogue` liés à cette évaluation.

### 16.4 Niveau de chaque table métier

| Niveau | Tables |
|---|---|
| **Groupe** (pas de `filiale_id`) | `mappings` |
| **Mixte** (`filiale_id` nullable) | `personnes`, `documents`, `mesure_catalogue` |
| **Filiale** (`filiale_id` non nul) | toutes les autres, `history` comprise |

`history` reste de niveau filiale : **l'agrégat Groupe est calculé, jamais stocké**. Stocker
un agrégat obligerait à le recalculer à chaque entrée ou sortie de filiale, et il divergerait.

### 16.5 Liaisons n-n et `filiale_id`

Rappel du §7, appliqué : une liaison ne porte un `filiale_id` que si l'une de ses extrémités
est de niveau Groupe ou mixte.

| Liaison | `filiale_id` | Motif |
|---|---|---|
| `risque_exigences`, `actif_risques`, `processus_actifs`, `actif_dependances`, `incident_actifs` | **non** | Les deux extrémités sont cloisonnées ; la RLS s'applique par jointure |
| `evaluation_mesures`, `traitement_mesures` | **oui** | `mesure_catalogue` est mixte |
| `document_referentiels` | **oui** | `documents` est mixte, et `ref_id` désigne un catalogue statique hors base (pas de clé étrangère) |
