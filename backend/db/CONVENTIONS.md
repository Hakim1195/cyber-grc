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
[16. Découpage L1](#16-découpage-du-lot-l1--décisions-figées) ·
[17. Décisions porte S1](#17-décisions-issues-de-la-porte-de-sécurité-s1--31082026) ·
[18. Décisions 3ᵉ passage](#18-décisions-issues-du-troisième-passage-de-la-porte-s1) ·
[19. Décisions 4ᵉ passage](#19-décisions-issues-du-quatrième-passage-de-la-porte-s1) ·
[20. Porte S1 franchie](#20-décisions-issues-des-cinquième-et-sixième-passages--porte-s1-franchie) ·
[21. Report : clé primaire globale](#21-report-explicite--la-clé-primaire-reste-globale)

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

⚠️ **Ce qui est normatif est une propriété, pas un encodage** : la part aléatoire porte **au
moins 52 bits**, tirés d'un générateur **cryptographique**, et non les trois chiffres décimaux de
la première écriture. Le produit fabrique des identifiants à cinq endroits, dans trois langages :
**trois générateurs aléatoires**, un par langage, et **deux dérivations qui ne tirent rien**. Les
formes diffèrent légitimement — imposer une forme unique obligerait le navigateur à appeler le
serveur pour créer une ligne. Ce qui ne diffère pas, c'est le plancher.

| Où | Forme engendrée | Aléa |
|---|---|---|
| Navigateur — `UI.genId` | `<PRÉFIXE>-<ms>-<compteur base 36>-<aléa base 36>` (**quatre** segments, 47 signes au plus) | **compteur de session monotone** *plus* 52 bits de `crypto.getRandomValues`. Le compteur suffit à lui seul pour un import : deux appels d'une même page ne peuvent pas rendre le même identifiant, quel que soit le hasard. |
| Serveur — `engendrerIdentifiant()` | `<PRÉFIXE>-<ms>-<25 caractères base 36>` | 128 bits de `randomBytes(16)` |
| Base — `f_generer_id()` | `<PRÉFIXE>-<ms>-<32 caractères hexadécimaux>` | `gen_random_uuid()`, natif depuis PostgreSQL 13 |
| Serveur — **ré-émission** `identifiantDerive()` | `<PRÉFIXE>-r-<25 caractères base 36>` | **aucun** — dérivé, voir ci-dessous |
| Reprise — enregistrement **sans identifiant** dans le fichier | `<PRÉFIXE>-d-<25 caractères base 36>` | **aucun** — dérivé de `(collection, rang, contenu)` |

> **Errata, 01/09/2026 — cette ligne a été fausse pendant une vague, et le contre-exemple existe.**
> Le compteur et l'aléa étaient concaténés **sans séparateur**, tous deux de longueur variable en
> base 36. « Deux appels ne peuvent pas rendre le même identifiant » était donc une *probabilité*
> présentée comme une garantie :
>
> ```
> compteur  1, aléa "0ab"  →  …-10ab
> compteur 36, aléa  "ab"  →  …-10ab      COLLISION
> ```
>
> Le séparateur a été ajouté ; la propriété est maintenant un **théorème** — deux compteurs
> distincts donnent deux chaînes distinctes, toujours. Ce qu'il faut en retenir dépasse la
> correction : **une garantie écrite en table normative n'a pas été éprouvée avant d'être écrite**,
> et elle a servi d'argument pour dimensionner un garde-fou. La forme se vérifie, elle ne se
> raisonne pas.

**Les deux dérivations ne tirent rien, et leur marque remplace l'horodatage** — un identifiant
dérivé n'a pas d'instant de création, si bien qu'y laisser un horodatage crédible mentirait au
lecteur du journal. Les deux marques ne disent pas la même chose, et c'est le seul endroit où
l'on peut le lire : **`-r-` dit « le serveur a dû ré-émettre »**, l'identifiant du fichier étant
déjà pris ; **`-d-` dit « le fichier n'apportait pas d'identifiant »**.

**La ré-émission, `-r-`.** Quand
l'identifiant d'un fichier de reprise est déjà pris dans le domaine global par une ligne que
l'appelant ne voit pas, le serveur en retient un autre — **dérivé** d'une empreinte de
`(filiale, table, identifiant du fichier)`. Deux raisons, et la seconde n'était pas évidente :
la dérivation rend la reprise **idempotente** — trois reprises du même fichier convergent sur une
ligne au lieu d'en cloner trois — et elle supprime la collision au lieu de la rendre improbable.

**La dérivation de la reprise, `-d-`.** Un enregistrement qu'un export ancien livre sans
identifiant exploitable en reçoit un, dérivé de `(collection, rang, contenu)`. Le rang rend
l'unicité **certaine dans le fichier** ; le contenu fait converger le même fichier repris deux
fois. Le prix, assumé : un enregistrement qui change de rang entre deux exports reçoit un
identifiant différent — sans conséquence, puisque par construction aucune référence ne pointe
vers lui, mais c'est un choix et non une propriété.

**Le plancher est un contrôle, pas une intention.** `verifierRegistre()` — le point unique qui
refuse déjà le démarrage du serveur — mesure la forme, l'entropie et le déterminisme de la
ré-émission sur 20 000 tirages. Une régression n'est pas rattrapée par la relecture : elle
empêche le démarrage. **Ce contrôle ne couvre que le générateur du serveur** — celui de la base
a le sien dans `f_verifier_schema()` — **réparé par `006` : il mesure désormais une borne
supérieure de l'entropie, en bits, symbole par symbole et position par position, et non plus une
longueur que le remplissage rendait infaillible.** Celui du navigateur a le sien depuis **Q-23**,
et il est d'une **troisième nature** — un détecteur de collision réelle dans la session, parce que
l'identifiant ne quitte jamais la page et que la propriété qui compte y est l'unicité, pas
l'entropie. **Le quatrième, le jumeau TypeScript, n'a toujours rien : c'est le constat Q-26.**

> **Ne pas lire cette liste comme quatre fois le même contrôle.** Trois générateurs, trois
> propriétés différentes, trois garde-fous de formes différentes — et le remède qui convient à
> l'un a été mesuré comme **inopérant** chez l'autre : compter les valeurs distinctes a un pouvoir
> de détection en N², donc voir 52 bits demanderait deux cents millions de tirages. C'est la
> raison pour laquelle ce paragraphe énumère au lieu de généraliser.

> **Errata, 01/09/2026.** Ce paragraphe attribuait le manque du navigateur au constat **Q-3**,
> qui dit autre chose — l'absence d'essais — et qui est clos. Le manque serait donc sorti du
> registre avec lui, **sans avoir jamais eu de propriétaire**. C'est la forme exacte que ce
> chantier a payée deux fois, et elle s'est reproduite ici, dans le paragraphe qui met en garde
> contre elle. Un renvoi vers le registre vieillit comme le reste : il se vérifie, il ne se
> suppose pas. Ne pas lire ce paragraphe comme une couverture des quatre sites : c'est
exactement l'erreur qui a produit Q-1, où un générateur durci et gardé n'était pas celui qui
écrivait.

Pourquoi ce plancher, et le prix qu'a coûté l'écart : mille valeurs d'aléa donnent **24 collisions
sur 250 tirages** dans une même milliseconde, c'est-à-dire à l'échelle d'un import courant. Le
défaut a été mesuré et chiffré dès la vague 1, laissé sans propriétaire, et il a produit deux
vagues plus tard le seul constat bloquant d'un passage de porte : un import qui écrit une partie
de ses lignes **et annonce le succès**. Il est ensuite réapparu **deux fois** — d'abord dans le
générateur du serveur, que le premier correctif avait manqué en durcissant celui de la base ;
puis dans celui de la reprise, à mille valeurs, qui engendre un identifiant **par mesure**.
C'est ce qui justifie qu'il n'y ait **qu'un générateur par langage**, et qu'aucune fonction ne
recopie la convention dans son coin.

Il portait plus que l'import. `journal_audit.id` a pour valeur par défaut `f_generer_id('LOG')`,
sous clé primaire : **une collision y refuse la trace au moment précis où elle doit être
écrite**, sur la seule table dont l'objet est de faire preuve.

**Les identifiants anciens restent lisibles et repris tels quels** : c'est le format *engendré*
qui est normé, pas le format *accepté*. Budget de longueur : le domaine plafonne à 64 caractères
et la forme la plus longue en consomme 46 (`MESURE-1788250968461-b477dua24ooozhg0zwtpdvknj`).
Au-delà, le domaine refuse — bruyamment, et un test le fige.

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
- **Toute référence à `mesure_catalogue` est en `restrict`** — amendement au §8, motivé au
  §17.6 : en contexte de groupe, « délier » et « conserver » feraient modifier les données de
  vingt filiales par une seule suppression.

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

⚠️ **Ce tableau est amendé par le §17.6** : toute référence à `mesure_catalogue` passe en
`restrict`. Les règles ci-dessus ont été écrites pour un produit mono-filiale, où le rayon d'une
suppression ne quittait pas le poste de l'utilisateur.

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
| `f_verifier_chemin_recherche()` | `stable` → table | Contrôle que **toute** fonction fige son `search_path` et y relègue `pg_temp` (§17.2). |
| `f_verifier_couverture_rls()` | `stable` → table | Contrôle que toute table cloisonnée a la RLS active, forcée, et des politiques nommant les fonctions de périmètre (§11, §17.5). |
| `f_coherence_mesure_catalogue()` | déclencheur | Interdit de viser la mesure **locale** d'une autre filiale (§16.3). |
| `f_interdit_changement_portee()` | déclencheur | Fige la portée d'une ligne d'une table mixte : une ligne Groupe ne devient pas locale, ni l'inverse (§17.6). |

Ces fonctions sont **la mémoire des défauts déjà rencontrés**. Les deux fonctions de vérification
sont appelées en fin de migration et **font échouer le déploiement** — ce qui vaut mieux qu'un
constat en audit.

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
| `GRC04` | Périmètre non positionné : `grc.filiale_id` absent alors que la RLS l'exige | Base (`004_rls.sql`) |

Deux refus d'intégrité empruntent le `23514` standard plutôt qu'un code propre, **à dessein** :
viser la mesure locale d'une autre filiale, et changer la portée d'une ligne mixte. L'API les
traduit comme n'importe quelle violation de contrainte, et le message de la base est déjà
rédigé pour l'utilisateur.

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

---

## 17. Décisions issues de la porte de sécurité S1 — 31/08/2026

> Rapport d'audit : [`../../docs/securite/RAPPORT_S1.md`](../../docs/securite/RAPPORT_S1.md).
> Ce paragraphe fige ce qui est corrigé, ce qui est reporté, et **à quelle échéance**.
> Un report assumé et daté est acceptable ; un silence ne l'est pas.

### 17.1 Toute clé étrangère entre deux tables cloisonnées est composite

**Règle, sans exception** : quand l'enfant et le parent portent tous deux un `filiale_id` non nul,
la clé étrangère porte **`(colonne_reference, filiale_id)`** et vise une unicité
`uq_<parent>_id_filiale (id, filiale_id)`.

Le motif était déjà appliqué aux tables de liaison, avec le bon raisonnement en commentaire, mais
sept clés étrangères directes y avaient échappé. La conséquence, reproduite à la porte S1 : une
suppression parfaitement ordinaire dans une filiale **détruit des lignes d'une autre filiale**, et
inscrit l'identité de son auteur dans une ligne qu'il ne peut même pas lire.

**Ce n'est pas une fuite de confidentialité** — la RLS tient en lecture — mais une brèche
d'intégrité et de disponibilité entre filiales. Les contrôles d'intégrité référentielle de
PostgreSQL **contournent délibérément la RLS** : une clé étrangère simple est donc satisfaite par
une ligne invisible. C'est le point à retenir, et il vaut pour toute entité future.

### 17.2 Toute fonction fige son `search_path`

**Règle** : `set search_path = pg_catalog, public, pg_temp` sur **chaque** fonction,
`security invoker` comprises.

⚠️ **`pg_temp` doit être NOMMÉ, et nommé en dernier.** La première rédaction de cette règle
s'arrêtait à `pg_catalog, public` — et ne fermait rien. Tant que `pg_temp` n'apparaît pas
explicitement, PostgreSQL le consulte **avant** tout le reste ; le nommer en queue de liste est
la seule façon de le reléguer. Mesuré sur 16.13 :

| `search_path` de la fonction | Ce que lit la fonction |
|---|---|
| `pg_catalog, public` | **la table temporaire de l'attaquant** |
| `pg_catalog, public, pg_temp` | la vraie table |

C'est le genre de règle qu'on croit appliquée parce qu'elle est écrite. Elle est donc **vérifiée
par une fonction du socle** (`f_verifier_chemin_recherche()`), appelée en fin de migration, qui
distingue deux anomalies : `search_path_non_fige` et `pg_temp_non_relegue`.

PostgreSQL consulte implicitement `pg_temp` **avant** le `search_path`, y compris quand celui-ci
est fixé à `public` — ce que fait pourtant le pool. Un rôle disposant du privilège `temporary`
peut donc masquer une table du schéma et détourner une fonction. Démontré à la porte S1 : forge
d'une entrée de journal au chaînage rompu, désarmement du déclencheur de cohérence des mesures, et
garde-fou de couverture RLS rendu aveugle.

Corollaire d'exploitation : **le privilège `temporary` est retiré au rôle applicatif** sur toute
base, développement et recette compris. La production le refusait déjà, mais par effet de bord
d'un `revoke all` posé pour d'autres raisons — une seule ligne ajoutée un jour par commodité
aurait rouvert la porte sans que rien ne le signale.

Aux **trois endroits qui créent une base**, et en étant précis sur ce que chacun fait, parce que
ce n'est pas la même chose :

| Endroit | Ce qu'il fait |
|---|---|
| `deploy/install.sh` (production) | `revoke temporary` **nommé**, puis **vérification** qui fait échouer l'installation |
| `db/dev/preparer_base_dev.sh` (développement, recette) | `revoke all from public` puis `grant connect` seul — le refus est donc **implicite**, mais une **vérification** explicite le constate et échoue sinon |
| `test/aide/base.mjs` (banc d'essai) | même schéma implicite, et un test du banc constate le refus |

Seule la production le révoque nommément. Les deux autres s'appuient sur l'absence d'octroi — ce
qui suffit, tant qu'une vérification le constate. **C'est cette vérification qui est la vraie
garantie**, pas la forme du `revoke` : un octroi ajouté un jour par commodité se ferait voir aux
trois endroits.

Ce dernier point n'est pas cosmétique : **le banc d'essai doit éprouver la configuration
déployée**, jamais une configuration plus permissive. Tant qu'il accordait `temporary`, il
testait un système que personne n'installe.

Conséquence pratique à connaître : un script d'exploitation qui crée une table temporaire ne
tourne plus sous le compte applicatif. C'est voulu.

### 17.3 `id_metier` n'admet ni virgule ni espace en tête ou en fin

Le périmètre de session transite en chaîne jointe par virgules (`grc.filiales`). Un identifiant de
filiale contenant une virgule scinderait le périmètre et accorderait la lecture de deux filiales.

Aucun chemin ne permet aujourd'hui à un utilisateur de choisir un identifiant de filiale : c'est
une mesure de **défense en profondeur**, fermée maintenant parce que le domaine est en train
d'être figé et qu'un `alter domain` sur une base peuplée coûte bien davantage.

Le domaine reste par ailleurs **volontairement permissif** (§2) : la reprise d'exports anciens en
dépend. On ferme un caractère précis, on ne durcit pas le format.

### 17.4 Report explicite à L3 — les tables du substrat d'authentification

> ✅ **Le report est CLOS depuis le lot L3, et ce paragraphe le niait encore.** Signalé par
> l'agent chargé de la documentation le 04/09/2026 : le §22 portait la condition **E1** comme
> satisfaite pendant que ces lignes-ci la décrivaient comme ouverte — le fichier se contredisait
> lui-même à huit cents lignes d'écart, et le `CLAUDE.md` §8 reprenait la version périmée.
> C'est le motif exact du constat **Q-90**, dans le fichier qui sert à l'éviter. Le texte
> d'origine est conservé ci-dessous en italique, parce qu'il explique *pourquoi* le report avait
> été pris — ce qui reste utile —, mais il ne décrit plus l'état du produit.

**Ce qui est vrai depuis L3** : l'écriture dans `sessions`, `session_filiales` et
`session_domaines` exige que la transaction ait posé `grc.authentification = 'oui'`
(`007_authentification.sql`, fonction `f_authentification()` ; `src/auth/transaction.ts:56`).
La couche d'authentification le pose pour sa **seule** transaction d'ouverture de session ; une
session applicative ordinaire ne l'a pas, et se voit refusée. **La propriété vit entre deux
fichiers dont aucun n'a tort seul** — c'est pour cela qu'ils ont été confiés au même agent.

*Texte d'origine, périmé, gardé pour son motif :* « `sessions`, `session_filiales` et
`session_domaines` **restent écrivables sans condition** par le rôle applicatif. C'est
circulaire, et c'est assumé : ces tables *produisent* la décision d'autorisation, elles sont lues
avant que le périmètre existe. »

| Table | Décision |
|---|---|
| `utilisateurs`, `profils`, `profil_domaines`, `groupes_ad`, `filiales` | **Corrigé en V1-bis** : écriture conditionnée au drapeau d'administration Groupe. Ce sont des tables de configuration, elles n'ont pas de raison d'être écrites en fonctionnement courant. |
| `sessions`, `session_filiales`, `session_domaines` | **Reporté au lot L3**, dont c'est la matière. La couche d'authentification posera un réglage `grc.authentification` pour sa **seule** transaction d'ouverture de session — provisionnement d'un compte inconnu compris (`PLAN_SERVEUR` §1.5) — et les politiques d'écriture s'y adosseront. |

**Risque assumé dans l'intervalle** : une injection SQL dans le rôle applicatif permettrait de
forger une session et son périmètre. La parade actuelle est le contrôle S5 — requêtes
intégralement paramétrées, vérifié à la porte S1. **Cette dette est une condition d'entrée du lot
L3, pas une intention.**

#### ⚠️ Ce que le drapeau d'administration est, et ce qu'il n'est pas

`grc.administration_groupe` est une **déclaration que la session fait sur elle-même**, pas un
privilège. Le rôle applicatif le pose lui-même : `set local grc.administration_groupe = 'oui'`
suffit, et rien dans la base ne l'en empêche.

Il protège donc contre **la faute de programmation** — une écriture Groupe faite par un chemin
qui ne l'a pas déclarée — et **pas du tout** contre un rôle applicatif compromis, qui poserait le
drapeau avant d'écrire. Cette distinction est celle du §17.5 : un garde-fou ne se voit pas prêter
plus de portée qu'il n'en a, faute de quoi il endort la vigilance.

La barrière réelle est ailleurs, et elle est côté serveur : c'est le modèle de droits à trois axes
du lot **L3**, qui décide si la session a le profil *Administration* et le périmètre *Groupe*
**avant** de poser le drapeau. La porte S3 ne doit donc pas hériter d'une protection qu'elle
croirait acquise.

### 17.5 Le garde-fou de couverture RLS dit ce qu'il fait, et pas plus

`f_verifier_couverture_rls()` détecte une politique **littéralement** `true`. Une politique non
cloisonnante mais non triviale lui échappe — éprouvé par mutation à la porte S1.

Le filet existe, il est simplement ailleurs : ce sont les **tests de comportement** qui mordent.
La règle qui en découle vaut pour tout garde-fou : **son commentaire ne lui prête pas plus de
portée qu'il n'en a**, faute de quoi il endort la vigilance au lieu de l'entretenir.

### 17.6 La portée d'une ligne mixte est figée, et le socle Groupe ne se supprime pas sous les pieds des filiales

Deux mécanismes, pour un même défaut : **une action de portée Groupe ne doit pas modifier les
données d'une filiale à son insu.**

**La portée est figée.** Une ligne d'une table mixte ne passe pas de `filiale_id is null` à une
filiale, ni l'inverse. Une politique RLS ne peut pas l'interdire : elle évalue son prédicat
*séparément* sur l'ancienne et la nouvelle ligne, et ne voit donc jamais la transition. C'est un
déclencheur (`f_interdit_changement_portee()`) qui s'en charge. Sans lui, une filiale s'appropriait
une ligne du socle commun, puis la supprimait — et la cascade emportait les données des dix-neuf
autres, invisibles d'elle.

**Toute référence à `mesure_catalogue` est en `restrict`.** C'est un **amendement au §8**, dont les
règles (« délie les évaluations », « conserve les actions ») ont été écrites pour un produit
mono-filiale, où le rayon d'une suppression ne quittait pas le poste de l'utilisateur.

En contexte de groupe, elles produisent l'effet inverse de leur intention : supprimer un contrôle
du socle **délie les évaluations et met à `null` les actions de vingt filiales**, ce qui incrémente
leur `version` et inscrit dans leurs lignes le nom de quelqu'un qui n'y a jamais travaillé — la
pathologie exacte du constat bloquant B-1.

| Cas | Comportement |
|---|---|
| Mesure **locale** à une filiale | Supprimable par sa filiale, après avoir délié ses liens **dans la même transaction**. Le rayon ne quitte pas la filiale. |
| Mesure du **socle Groupe**, non utilisée | Supprimable par l'administration Groupe. |
| Mesure du **socle Groupe**, mise en œuvre ou référencée quelque part | **Refusée.** Un contrôle que des filiales ont évalué ne disparaît pas : il s'archive (voir ci-dessous). |

Ce que l'utilisateur voit ne change pas — la couche applicative délie puis supprime, en une
transaction, exactement comme aujourd'hui. Ce qui change, c'est qu'un contrôle partagé et déjà
évalué ne peut plus s'évaporer : c'est aussi ce qu'attend un auditeur ISO 27001, pour qui la
disparition sans trace d'un contrôle du référentiel est un constat.

**« Il s'archive » suppose un mécanisme d'archivage**, et le dire sans l'avoir écrit laisse à
l'administration Groupe un refus sans issue : ni supprimer, ni retirer du service. `mesure_catalogue`
porte donc un **état de cycle de vie** (`active` / `archivee`), avec sa date. Une mesure archivée
reste lisible et reste rattachée à tout ce qui la référence — c'est le point : la preuve
historique survit — mais elle n'est plus proposée pour de nouvelles évaluations.

C'est la seule issue qui satisfasse les deux exigences à la fois : ne rien détruire chez les
filiales, et permettre au Groupe de faire évoluer son socle de contrôles.

### 17.7 Ce que le §16.4 ne disait pas : « nullable » n'est pas « mixte »

Trois tables portent un `filiale_id` nullable **sans** être des tables métier mixtes, et ne
relèvent donc ni des politiques de la famille 2, ni du déclencheur de portée du §17.6 :

| Table | Pourquoi son `filiale_id` est nullable |
|---|---|
| `journal_audit` | L'événement peut précéder la résolution du périmètre (échec de connexion) ou être transversal (démarrage du service). |
| `groupes_ad` | Un groupe peut être transversal (`GRC-EXPORT`, `GRC-ADMIN`). |
| `sessions` | **Ne relève pas de ce tableau** : elle ne porte aucune colonne `filiale_id`, mais une `filiale_active_id`, qui est la filiale de travail de la session et non sa portée. Elle est citée ici parce que trois passages de la porte S1 l'ont crue mixte. |

**Une table mixte est une table métier dont une ligne a une portée** — Groupe ou filiale. Une
colonne nullable pour une raison chronologique ou technique n'en fait pas une.

Les exemptions réellement portées par le code sont donc **deux** : `journal_audit` et
`groupes_ad`. `f_tables_mixtes()` les découvre dans le catalogue et n'exempte qu'elles.

### 17.8 L'acteur d'une entrée de journal n'est pas fourni par le client

Le déclencheur de chaînage écrase déjà `numero`, `horodatage`, `empreinte_precedente` et
`empreinte` : c'est ce qui rend une entrée impossible à forger par l'API (§12). **L'identité de
l'acteur relevait pourtant du client.**

Elle relève désormais de la session, comme `cree_par` sur toute autre table : le déclencheur
impose `utilisateur_id = f_utilisateur_courant()`. Le libellé texte, lui, reste fourni — c'est un
confort de lecture qui doit survivre à la disparition du compte (§12) — mais il n'est plus la
source de l'identité.

Le principe, qui vaut au-delà de cette table : **tout ce qui fait la valeur probante d'une trace
vient du serveur, jamais de l'appelant.** Un journal inaltérable dont l'acteur est déclaré par le
client garantit l'intégrité d'une fausse preuve — le mécanisme fonctionne parfaitement, sur un
contenu faux.

### 17.9 La filiale d'écriture appartient toujours au périmètre de lecture

`f_filiale_ecriture()` vérifie que `grc.filiale_id` figure dans `f_filiales_autorisees()`, et lève
`GRC04` sinon.

Sans cette condition, les deux réglages étaient indépendants : une session déclarant un périmètre
de lecture `FIL-A` et une filiale active `FIL-B` écrivait chez B — **entrée de journal chaînée et
scellée comprise**. Le contrôle existait, mais seulement en TypeScript ; or la RLS est là
précisément pour que le code puisse se tromper sans que cela devienne une fuite
(`PLAN_SERVEUR` §1.9).

Aucun flux légitime n'en souffre : un périmètre système n'a pas de filiale active et échoue en
amont, et une administration Groupe bascule entre des filiales **de** son périmètre.

Règle générale : **deux réglages de session qui doivent être cohérents entre eux sont recoupés
par la base**, jamais seulement par le code qui les pose.

---

## 18. Décisions issues du troisième passage de la porte S1

> Rapport : [`../../docs/securite/RAPPORT_S1_TER.md`](../../docs/securite/RAPPORT_S1_TER.md).
> Premier passage à ne trouver **aucun** défaut de cloisonnement : la frontière entre filiales a
> tenu sous des balayages indépendants. Ce qui suit porte sur d'autres propriétés.

### 18.1 La traçabilité est imposée à l'insertion comme à la modification

`f_maj_tracabilite()` protégeait l'`update` — et l'`insert` n'était protégé par rien. Le client
pouvait donc fixer lui-même `version`, `cree_le` et `cree_par` à la création, et le déclencheur
de modification **gelait ensuite la forgerie pour toujours** : le mécanisme qui protège la vérité
protégeait le mensonge.

Deux conséquences, l'une sur la preuve, l'autre sur la disponibilité :

- une ligne créée au nom d'un directeur général qu'on n'est pas, avec la date qu'on choisit,
  devient une pièce d'audit inattaquable ;
- une ligne créée avec `version` au maximum de l'entier signé est **définitivement immodifiable**
  — chaque tentative dépasse la capacité du type.

**Règle** : un déclencheur `before insert` impose `version = 1`, `cree_le = now()`,
`cree_par = f_utilisateur_courant()` et annule `modifie_le` / `modifie_par`, sur **toute** table
portant le bloc du §3. Ce que le client envoie dans ces colonnes est ignoré, jamais refusé — un
export `grc-backup` en contient, et la reprise ne doit pas échouer pour autant.

**Ce que cela dit de la reprise** : à l'import, l'auteur tracé est **celui qui importe**, à la
date de l'import. C'est exact et c'est voulu : la création de la ligne *dans ce système*, c'est
l'import. L'historique d'origine, s'il faut le conserver, est une donnée métier, pas une colonne
de traçabilité.

### 18.2 Toute action référentielle qui franchit une frontière est bornée

`personnes.utilisateur_id → utilisateurs` était en `on delete set null` : supprimer un compte
réécrivait les fiches d'annuaire **de toutes les filiales**, y compris celles que l'auteur ne peut
pas lire — incrémentant leur `version` et y inscrivant son nom.

C'est la pathologie du §17.6, sur la dernière action référentielle du schéma qui traverse un
niveau sans être bornée. La règle du §17.6 est donc **générale** et ne vaut pas seulement pour le
catalogue de mesures : **une clé étrangère d'une table cloisonnée vers une table de niveau Groupe
ne porte ni `cascade` ni `set null`.** Le délien est un geste explicite, fait dans le périmètre de
celui qui le fait.

### 18.3 `grc.utilisateur` désigne un login, pas une clé primaire

Le réglage de session est documenté par le socle comme un **login** (`'jdupont'`), et c'est lui
qui alimente `cree_par`. Le chaînage du journal, lui, le joignait à `utilisateurs.id`.

Tant que les deux coïncident, rien ne se voit. Le jour où le lot L3 y met un login alors que la
clé primaire est un `USER-…`, **toutes** les entrées basculent silencieusement sur la branche
« acteur inconnu » : la chaîne reste intacte, les empreintes restent valides, et l'identité
affichée redevient celle que le client a fournie.

**Règle** : la résolution se fait sur le login, soit la colonne **`utilisateurs.identifiant`**,
comparée en minuscules des deux côtés — c'est la forme de son unicité. Et un test doit
provisionner un compte dont la **clé primaire** diffère de son identifiant : sans quoi il valide
une coïncidence, pas une propriété.

Reste ouvert, et c'est une décision du lot L3 et non du schéma : distinguer « pas d'acteur »
(légitime — une migration, un timer, un échec de connexion sur un login inconnu, précisément
l'événement que le `PLAN_SERVEUR` §1.7 tient à voir tracé) de « acteur non résolu » (défaut de
programmation). Le schéma ne peut pas trancher sans connaître la liste des actions antérieures à
l'authentification.

### 18.4 Un garde-fou que rien n'appelle est un commentaire

`f_verifier_couverture_rls()` était écrite, testée et correcte. **Aucun chemin de déploiement ne
l'appelait.** Une base sabotée passait les contrôles d'installation au vert pendant que la
fonction, invoquée à la main, remontait deux anomalies et qu'une session lisait la filiale
voisine.

**Règle** : tout contrôle automatique du schéma est appelé par un chemin réel — la fin d'une
migration **et** l'installation — et **fait échouer** ce chemin. Écrire le contrôle est la moitié
du travail ; le brancher est l'autre moitié.

C'est désormais le contrôle **S16** de la grille du `PLAN_EXECUTION` §4, ajouté pour cette raison.

### 18.5 Ce que l'installation contrôle, et ce que la recette démontre

Deux dispositifs, deux natures, et les confondre affaiblirait les deux.

| | `f_verifier_couverture_rls()` · `f_verifier_chemin_recherche()` | `db/verifier_cloisonnement.sql` |
|---|---|---|
| Ce que c'est | Des **fonctions de la base** | Un **script de démonstration** |
| Ce qu'il lit | Le **texte** des politiques, la déclaration de `search_path` | Le **comportement** : on écrit, on lit, on compte |
| Quand | **À chaque migration et à chaque installation**, et fait échouer | À la **recette**, avant mise en service puis annuellement |
| Ce qu'il attrape | Une table sans politique, un `force` absent, un `search_path` non figé | Une politique dont le texte est juste et le sens faux |

L'installation appelle des **fonctions**, pas des fichiers : ce n'est pas une dépendance de
`deploy/` vers `db/`, c'est une requête. Elle bloque donc le déploiement, et c'est le contrôle
**S16** de la grille.

`verifier_cloisonnement.sql`, lui, **reste un geste de recette** et n'est appelé par aucun chemin
d'installation. Ce n'est pas un oubli : c'est un test de comportement qui sème des données de
démonstration, et sa place est là où se testent aussi la restauration des sauvegardes et l'envoi
des courriels (`PLAN_SERVEUR` §1.10). Il est **jouable devant un auditeur**, ce qui est sa
raison d'être, et le message d'échec des garde-fous le cite.

**La limite à ne pas oublier** (§17.5) : les fonctions lisent du texte. Une politique qui nomme
la bonne fonction de périmètre en s'en servant mal leur échappe. Ce qui mord sur le sens, ce sont
les tests de comportement — le banc d'essai et ce script. **Aucun des deux ne remplace l'autre.**

### 18.6 Une table à colonne engendrée s'insère en nommant ses colonnes

`documents` et `document_referentiels` portent une colonne **engendrée** (`portee_groupe`), qui
entre dans une clé étrangère. PostgreSQL refuse qu'on lui donne une valeur.

Conséquence pour tout code qui écrit ces tables — la reprise, l'import, l'export et le
round-trip `grc-backup` en particulier : **l'insertion nomme ses colonnes**. Un
`insert into documents values (…)` positionnel, ou un aller-retour naïf qui relit une ligne
entière puis la réinsère, échoue.

Ce n'est pas un défaut de conception : c'est le prix de la seule forme **déclarative** qui
épingle le `filiale_id` d'une liaison dont l'une des extrémités est mixte — un déclencheur
`security invoker` n'aurait pas vu la ligne d'une autre filiale, et aurait conclu à tort.

---

## 19. Décisions issues du quatrième passage de la porte S1

### 19.1 Les contrôles d'unicité contournent la RLS, exactement comme les clés étrangères

Le §17.1 ne parlait que des clés étrangères. **La règle vaut pour toute contrainte d'unicité** :
une unicité posée sur une table cloisonnée **inclut `filiale_id`**, faute de quoi une filiale
occupe un identifiant dans l'espace d'une autre.

Le cas démontré est irréversible et vise le cœur du produit : une filiale pose une étape
d'approbation nommant le risque d'une autre ; l'étape est irrévocable par construction (`GRC02`,
déclencheur `enable always`) ; la filiale visée ne peut **jamais** ouvrir son acceptation de
risque résiduel — celle que l'ISO 27001 exige explicitement — et reçoit un « doublon » sans
détail sur une ligne qu'elle ne peut pas lire.

**Règle générale, qui subsume §17.1 et §18.2** : *tout contrôle que PostgreSQL applique en
dehors des politiques — clé étrangère, unicité, exclusion — doit porter `filiale_id`.* Ce n'est
pas la RLS qui protège ces chemins, elle ne les voit pas.

### 19.2 L'identifiant du compte système est réservé

`f_utilisateur_courant()` rend `'systeme'` en l'absence de réglage : migrations, timers, démarrage
du service, échecs de connexion. Rien n'empêchait de **créer un compte portant cet identifiant** —
et le provisionnement automatique depuis l'AD (`PLAN_SERVEUR` §1.5) suffirait à le faire.

Tous les événements système seraient alors attribués à une personne nommée, dans un journal
**scellé et chaîné dont la vérification ne signalerait rien**. C'est la pathologie du §17.8
atteinte par l'autre bout : au lieu de déclarer l'acteur, on capture la sentinelle.

**Règle** : `utilisateurs.identifiant` refuse `'systeme'`, en minuscules comme en majuscules —
la résolution du journal comparant déjà en minuscules, un contrôle sensible à la casse serait
contournable par `Systeme`.

### 19.3 Une démonstration se joue sur une base réelle, pas seulement sur une base vierge

`verifier_cloisonnement.sql` comptait les lignes de portée Groupe **sans filtrer sur ses propres
données de démonstration**, et attendait un nombre exact. Une seule ligne de socle préexistante
suffisait à lui faire annoncer « cloisonnement en défaut, ne pas mettre en service ».

Un contrôle qui crie au loup sur une base normale ne sera pas joué deux fois — et c'est la pièce
qu'on montre à l'auditeur. **Règle** : tout prédicat d'un script de démonstration ne porte que sur
les données qu'il a lui-même semées, et il est **joué au moins une fois sur une base peuplée**
avant d'être considéré comme bon.

### 19.4 Un garde-fou neuf se branche dans le même commit qu'il naît

Le contrôle **S16** venait d'être ajouté à la grille parce qu'un garde-fou existait sans être
appelé. Le commit qui a branché deux garde-fous sur le déploiement a été **immédiatement suivi**
de celui qui en écrivait un troisième — sans toucher aux fichiers de déploiement. Le défaut s'est
donc reproduit sous le contrôle créé pour lui, en deux commits.

**Règle** : la migration qui crée un contrôle du schéma pose **dans le même changement** son appel
depuis `migrate.mjs` et depuis `install.sh`. Un point d'appel unique et agrégeant
(`f_verifier_schema()`) rend cette règle tenable : les chemins de déploiement appellent **une**
fonction, et un contrôle neuf s'y ajoute sans les toucher.

C'est la seule forme qui résiste à l'oubli, parce qu'elle supprime l'occasion de l'oubli.

### 19.5 Une liste de tables écrite à la main est une omission qui attend

`v_liaisons` énumérait six tables sans `filiale_id` ; il y en avait sept. La septième échappait
donc au garde-fou de couverture, et sa politique de lecture pouvait être ramenée à `true` sans
qu'une seule anomalie soit remontée.

C'est la troisième fois que ce motif produit un défaut — les sept clés étrangères de B-1, les
déclencheurs d'insertion, cette liste. **Règle** : un garde-fou **découvre** son périmètre dans le
catalogue ; il ne le récite pas. Une liste écrite à la main n'est admise que si le garde-fou
**vérifie qu'elle est complète**.

---

## 20. Décisions issues des cinquième et sixième passages — porte S1 franchie

> Rapports : [`RAPPORT_S1_QUINQUIES.md`](../../docs/securite/RAPPORT_S1_QUINQUIES.md) (franchie,
> 3 majeurs) et [`RAPPORT_S1_SEXIES.md`](../../docs/securite/RAPPORT_S1_SEXIES.md) (confirmée,
> 0 majeur). **La vague 2 peut s'ouvrir.**

### 20.1 Une découverte automatique est un contrat d'exécution de code

C'est la leçon la plus utile du chantier, et elle est générale : **le remède au motif « liste
écrite à la main » ouvre son propre chemin.** Faire découvrir ses contrôles à un garde-fou revient
à exécuter tout ce qui respecte une convention de nommage — et son appelant le plus puissant est
l'installateur, sous le compte PostgreSQL.

Ce qui referme, sans réintroduire de liste, ce sont **quatre propriétés que le catalogue expose** :
la fonction appartient au propriétaire de la base, n'est pas `security definer`, n'est pas
volatile, et fige son chemin de recherche. Tout le reste devient une anomalie — donc un échec de
déploiement — plutôt qu'un exécutant.

Deux choses s'y ajoutent, et aucune n'est facultative :

- **Le point d'appel est `security definer`**, ce qui est ici un **abaissement** de privilège :
  son seul appelant détenant plus que le propriétaire est le script d'installation.
- **Les deux chemins de déploiement encadrent leur appel d'une transaction en lecture seule**,
  avec délai de garde. Nécessaire, et mesuré : *une fonction déclarée non volatile qui en appelle
  une volatile écrit quand même* — PostgreSQL ne vérifie que la volatilité de la fonction
  courante, jamais celle de la pile.

### 20.2 Un garde-fou se vérifie dans les deux sens

Fermer une porte crée l'occasion d'en fermer une qui devait rester ouverte. Le privilège de
lecture retiré sur la colonne du secret devait s'accompagner du contrôle **inverse** : toute autre
colonne reste lisible du service. Sans lui, une colonne ajoutée plus tard aurait été aveugle au
service, et le défaut ne se serait vu qu'en production.

**Règle** : un garde-fou qui restreint vérifie aussi que ce qui doit rester permis l'est. Et il le
vérifie **pour chaque rôle concerné** — le sixième passage a relevé que le contrôle ne regardait
que le compte applicatif, laissant le compte d'exportation hors de vue.

### 20.3 Ce que le chantier a appris sur le dispositif lui-même

Six passages, six auditeurs indépendants, cinq d'entre eux ayant trouvé un défaut que les
précédents avaient manqué. Ce qu'il faut en retenir pour les portes S2 à S8 :

| Constat | Conséquence pratique |
|---|---|
| Chaque auditeur a regardé ailleurs que le précédent | **Un auditeur unique aurait trouvé le sixième des défauts.** Ne pas réduire le nombre de passages pour aller plus vite. |
| Le document normatif s'est trompé **huit fois** | Une convention n'est pas une preuve. L'auditeur vérifie **aussi** que le texte normatif dit vrai. |
| Les correctifs passaient avec une suite verte | La suite restait verte **parce que rien n'exerçait le chemin corrigé**. Sans le test, le correctif ne compte pas. |
| Une liste écrite à la main a produit **quatre** défauts | La parade est la découverte dans le catalogue — appliquée pour finir au dispositif de contrôle lui-même (§20.1). |
| Le remède crée son propre chemin | Un correctif s'attaque **pour lui-même** au passage suivant, jamais présumé sûr. |

---

## 21. Report explicite — la clé primaire reste globale

> Constat **T-9** du troisième passage de la porte S2. Report **assumé et daté**, comme
> l'exige la conduite du chantier : un silence ne serait pas acceptable, un report écrit l'est.

**33 tables sur 47 portent `primary key (id)`**, sans `filiale_id`. Un identifiant est donc unique
à l'échelle du Groupe, et une reprise dans une filiale révèle — indirectement — qu'un identifiant
est occupé dans une autre. La ré-émission d'identifiant introduite en L2 déplace le signal sans le
supprimer.

**Ce n'est pas fermé, et c'est dit plutôt qu'appelé fermé.** Le canal résiduel coûte deux requêtes
au lieu d'une, laisse une ligne dans `imports` et une ligne à supprimer, et se double d'un écart
de temps mesurable (médiane 9,1 ms contre 7,0 ms). L'auditeur le classe **mineur** et l'assigne au
lot **L3**.

### Pourquoi ne pas rendre la clé primaire composite maintenant

Ce serait cohérent avec le §19.1 — *tout contrôle que PostgreSQL applique hors des politiques
porte `filiale_id`* — et rien n'est déployé, donc aucune donnée n'est à migrer. L'argument
« corriger maintenant coûte peu » joue. Il ne l'emporte pas, pour trois raisons :

1. **Ce que la clé globale achète est le round-trip**, et il est la raison d'être du §2 : les
   identifiants du fichier deviennent tels quels les clés primaires, et les **références
   polymorphes** (`journal_audit.entite_id`, le rattachement des pièces jointes) désignent une
   ligne par son seul identifiant. Les rendre composites touche le journal inaltérable, dont le
   chaînage est scellé — c'est-à-dire ce que le produit a de plus coûteux à reprendre.
2. **Le remède déplacerait le signal une seconde fois** plutôt que de l'éteindre : deux filiales
   pouvant alors porter le même identifiant, c'est la *collision* qui deviendrait observable.
   Fermer un oracle demande de rendre l'issue indistincte (§20.1), pas de changer l'index.
3. **La vraie barrière est le droit d'appeler la route**, et elle appartient à L3. Une reprise
   est un acte d'administration ; qui n'a pas ce droit ne dispose d'aucun de ces canaux.

**Condition d'entrée de L3** : le modèle de droits doit décider qui peut appeler la reprise
**avant** que ce report ne soit reconduit. S'il ne suffit pas à fermer le canal, la clé composite
redevient la réponse — et elle coûtera alors une migration de données.

---

## 22. Conditions d'entrée du lot L3 — la liste que la vague 3 doit épuiser

> Ce paragraphe ne contient **aucune règle neuve**. Les décisions qu'il rassemble sont écrites
> ailleurs, et c'est là qu'elles font foi ; il existe parce qu'elles sont écrites à **cinq
> endroits différents**, arbitrées à quatre passages de porte distincts, et qu'une vague qui
> ouvre sans les avoir toutes lues en oubliera. Chaque ligne dit donc **où lire**, et **comment
> la porte S3 vérifiera** — pas ce qu'il faut faire.

**La règle de lecture** : une condition d'entrée n'est pas une intention. Elle se ferme dans la
vague qui l'a reçue, ou elle est reconduite **par écrit, avec une date et un motif** — jamais par
le silence. Reconduire sans l'écrire est ce que le chantier a appris à ne plus faire.

| # | Ce qui doit être vrai à la sortie de L3 | Écrit en | Vérifié à la porte S3 par |
|---|---|---|---|
| **E1** | `sessions`, `session_filiales` et `session_domaines` ne sont plus écrivables sans condition par le rôle applicatif : la couche d'authentification pose `grc.authentification` pour sa **seule** transaction d'ouverture de session, et les politiques s'y adossent | **§17.4** | Une session applicative ordinaire tente d'insérer dans les trois tables → refus. La transaction d'ouverture, elle, réussit. |
| **E2** | Le drapeau `grc.administration_groupe` cesse d'être une déclaration que la session fait sur elle-même : le modèle à trois axes décide du profil *Administration* et du périmètre *Groupe* **avant** de le poser | **§17.4**, encadré | Aucune route ne pose le drapeau sans l'avoir décidé d'après la session. Le contrôle est **mécanique** : le banc d'essai de L2 le vérifie déjà par recherche dans les sources ; il doit rester vert et s'étendre aux routes neuves. |
| **E3** | Le droit d'appeler la reprise est décidé par le modèle de droits — c'est un acte d'administration | **§21**, condition finale | Un compte sans ce droit reçoit un refus **avant** toute analyse de corps. S'il ne suffit pas à fermer le canal d'oracle du §21, la clé composite redevient la réponse : la reconduction du report doit alors être **réécrite et redatée**, pas héritée. |
| **E4** | La limitation de rythme et le contrôle d'authentification s'exercent en `onRequest`, **avant** l'analyse du corps | registre des constats, **Q-10** | Un corps volumineux envoyé sans authentification est refusé sans que son analyse ait été payée. La mesure de référence est celle de la porte S2 (~160 ms pour 18,6 Mo) : elle doit s'effondrer. |
| **E5** | ⚠️ **Partiellement satisfaite avant l'heure, et c'est un piège.** Les deux commentaires que visait Q-6 (b) ont été corrigés par `005` §9 — « la prochaine migration » s'est trouvée être `005`, pas celle de L3. **Il en reste un troisième**, faux et vivant dans le catalogue (constat **Q-18**), qu'aucun des deux balayages n'a vu parce qu'ils cherchaient là où on savait déjà. Ne pas lire cette ligne comme acquise par héritage | registre, **Q-18** et **Q-22 (a)** ; règle au **§23** | `migrate.mjs` ne sort pas en code 4, et **chacun** des commentaires lus dans le catalogue décrit ce que fait réellement le code — le troisième compris. |
| **E6** | La lecture du journal d'audit reste non cloisonnée **jusqu'à L5 inclus**, et son resserrement est un livrable ferme de L5 — pas une condition de L3 | `004_rls.sql` §6, `README` §8 | Sans objet à S3. Rappelé ici pour qu'il ne soit **ni oublié, ni traité trop tôt** : le chaînage par empreinte impose l'ordre. |

### Ce que la vague 3 ne doit pas croire acquis

Trois protections existent aujourd'hui et **ne survivent pas** à l'arrivée de
l'authentification si personne ne s'en occupe :

1. **Le périmètre vient du serveur** parce qu'aucun chemin ne le lit ailleurs — vérifié à S2 sur
   six formes d'en-tête, le cookie, l'URL et le corps. L3 introduit précisément la couche qui
   *fabrique* ce périmètre : elle devient le seul endroit où l'erreur est possible, et le
   contrôle S2 de la grille doit être rejoué contre elle, pas contre les routes.
2. **Aucune route ne fabrique le drapeau d'administration** — c'est vrai et démontré, mais c'est
   une propriété du code d'aujourd'hui, pas une barrière. Voir **E2**.
3. **Les requêtes sont intégralement paramétrées**, ce qui est aujourd'hui la *seule* parade au
   risque assumé du §17.4. Tant que **E1** n'est pas fermée, une injection dans le rôle
   applicatif forge une session et son périmètre : le contrôle S5 n'est pas une formalité pendant
   cette vague, c'est le filet unique.

---

## 23. Une migration appliquée ne se réécrit pas

`migrate.mjs` retient l'**empreinte SHA-256** du contenu de chaque fichier de migration au moment
où il l'applique, et **sort en code 4** si le fichier a bougé depuis. La règle était donc tenue
par l'outil et décrite dans le guide d'exploitation (`README` §5) — mais nulle part ici,
c'est-à-dire nulle part où la lise quelqu'un qui écrit du schéma. Elle y est maintenant.

**Corriger une migration déjà appliquée se fait dans la migration suivante**, jamais sur place :
`alter table` pour la structure, `comment on` pour les commentaires, `create or replace` pour les
fonctions. Le fichier appliqué est un fait historique, pas un brouillon.

**Cela vaut aussi pour un commentaire, et surtout pour un commentaire.** L'objection est immédiate
et elle est fausse : « ce n'est qu'un texte, aucune donnée n'est en jeu, et rien n'est déployé —
je réécris le fichier et je recrée les bases de développement ». C'est matériellement exact. C'est
aussi le raisonnement qui vide une règle de sa substance la première fois qu'elle coûte quelque
chose : la fois suivante, l'argument « rien n'est déployé » sera fait sur une colonne, et la
base de recette du client aura déjà tourné.

**Corollaire pratique** : un commentaire faux dans une migration appliquée **reste faux un
moment** — le temps qu'une migration suivante existe. Le dire est préférable à le corriger en
douce ; c'est le sort réservé au constat Q-6 (b), reporté au lot L3 et écrit au §22, ligne **E5**.

---

## 24. Une table sans `filiale_id` est un arbitrage, jamais un oubli

Dix tables du schéma n'ont pas de politique cloisonnante. Neuf portent le substrat
d'autorisation ou le socle Groupe ; la dixième, `controles_schema`, est arrivée avec la migration
`005` et **a fait échouer un essai en arrivant** — ce qui est exactement son office.

**La règle** : une table peut être non cloisonnée si, et seulement si, elle porte *la même chose
pour tout le groupe* — le registre des migrations, le registre des garde-fous, le catalogue des
correspondances, le substrat qui décide de l'autorisation. Une table qui porte une donnée de
travail est cloisonnée, sans exception. `controles_schema` relève du premier cas au même titre
que `migrations_schema` : elle décrit le **schéma**, pas les données, et son contenu est
identique dans toutes les filiales par construction.

**Ce qui rend la règle tenable, c'est qu'elle est vérifiée.** La liste des tables non
cloisonnées est **arbitrée** et figée à deux endroits — un essai du banc et le contrôle C93 de
`verifier_cloisonnement.sql` — qui la relèvent dans le catalogue et la comparent. Une table
oubliée en cours de route ne passe donc pas inaperçue : elle fait rougir les deux, et quelqu'un
doit décider. C'est une **liste écrite à la main** au sens du §19.5, et c'est le seul cas où
elle est le bon outil : ce qu'on veut ici n'est pas d'énumérer les tables, c'est d'**obliger un
humain à trancher** chaque fois qu'il en apparaît une.

Corollaire pour la suite du chantier : une migration qui ajoute une table sans `filiale_id`
casse ces deux contrôles, et c'est **normal**. Le geste attendu est d'écrire pourquoi ici, puis
d'ajouter la table aux deux listes — dans cet ordre.

---

## 25. Le contrat de l'annuaire simulé — figé avant la vague 3

> Ce paragraphe existe pour une seule raison : **A1 a besoin de l'annuaire qu'écrit A4, et
> attendre l'un pour lancer l'autre coûte une demi-vague.** Le contrat est donc arrêté ici,
> par l'orchestrateur, avant que les deux commencent. Ce n'est pas une description de ce qui
> sera écrit : c'est ce contre quoi les deux codent, et ce que la porte S3 lira.
>
> **Pourquoi l'annuaire n'appartient pas à celui qui écrit le client LDAP** : un agent qui
> écrit sa doublure *et* le code qui l'interroge peut se tromper deux fois de la même façon,
> et le banc reste vert. C'est le défaut mesuré en **Q-61**, où un essai éprouvait en partie
> sa propre réécriture. La séparation est le seul garde-fou qui tienne.

### 25.1 Ce que la doublure est

Un **serveur LDAP en processus**, monté par le banc sur `127.0.0.1` et un **port éphémère**
(jamais un port fixe : deux familles d'essais tournent en parallèle). Il n'y a **aucun Active
Directory sur cette machine, et il ne faut pas en viser un** : un banc qui éprouve le cas
négatif verrouille des comptes réels, et les groupes `GRC-*` n'existent nulle part encore.

Il vit dans `backend/test/annuaire/**` et n'est **jamais** importé par `backend/src/**`. Un
`import` de `src` vers `test` est un défaut, pas un raccourci.

### 25.2 Ce que la doublure doit savoir faire

Cinq comportements, et ils sont là parce que **chacun correspond à une exigence du
`PLAN_SERVEUR` §1.5 ou §3** — pas parce qu'ils sont commodes à écrire :

| # | Comportement | Exigence servie |
|---|---|---|
| **D1** | Liaison d'un compte de service en lecture, puis recherche par `LDAP_FILTRE_UTILISATEUR` avec `{login}` substitué | §1.5, liaison LDAPS avec compte de service |
| **D2** | Liaison d'un utilisateur par son DN et son mot de passe — **succès et échec**, l'échec rendant `InvalidCredentials` (49) | §1.5, vérification des identifiants |
| **D3** | Appartenances **imbriquées** : un utilisateur membre d'un groupe lui-même membre d'un groupe `GRC-*` est reconnu. La doublure porte au moins **trois niveaux** et **un cycle** (A membre de B, B membre de A) | §3.4, « les groupes imbriqués doivent être résolus récursivement » |
| **D4** | Compte **désactivé** (`userAccountControl` portant le bit 2) et compte **retiré d'un groupe**, tous deux modifiables **en cours d'essai** | §1.5, déprovisionnement immédiat |
| **D5** | Panne : refus de connexion, réponse lente au-delà de `LDAP_DELAI`, et réponse tronquée | §1.5 — un annuaire qui ne répond pas ne doit pas ouvrir une session |

**D3 porte un cycle, et ce n'est pas une coquetterie.** Une résolution récursive naïve d'un
annuaire réel boucle indéfiniment sur une imbrication circulaire, qui est *légale* en AD. Un
banc qui n'en contient pas laisse passer un serveur qui se fige à la première connexion en
production.

### 25.3 Le jeu de comptes — figé, et le même pour les deux agents

Huit comptes, choisis pour couvrir les huit profils du `PLAN_SERVEUR` §3.2 **et** les deux
axes que rien d'autre n'exerce (périmètre multi-filiales, export sans lecture Groupe) :

| Login | Groupes AD (directs) | Ce que le compte éprouve |
|---|---|---|
| `rssi.tls` | `GRC-TLS-RSSI` | le cas nominal : une filiale, tous les domaines |
| `contrib.tls` | `GRC-TLS-CONTRIB` | contribution bornée à quatre domaines |
| `qualite.tls` | `GRC-TLS-QUALITE` | un profil qui **ne doit pas** voir la cartographie |
| `direction` | `GRC-GROUPE-DIRECTION` | Groupe **en lecture**, aucune écriture nulle part |
| `rssi.groupe` | `GRC-GROUPE-RSSI`, `GRC-EXPORT` | périmètre multi-filiales **et** droit d'export |
| `dpo` | `GRC-IMBRIQUE-DPO` (membre de `GRC-TLS-DPO`) | **l'appartenance indirecte**, seule preuve de D3 |
| `admin` | `GRC-ADMIN` | le profil *Administration*, et lui seul, pose le drapeau Groupe |
| `sans.groupe` | *(aucun)* | **le cas négatif** : identifiants valides, aucun accès |

`sans.groupe` n'est pas un remplissage. Le §20.2 le dit : *un garde-fou se vérifie dans les deux
sens*. Un banc qui n'éprouve que des comptes autorisés ne démontre pas une autorisation, il
démontre qu'un chemin existe.

### 25.4 Ce que le contrat ne fixe pas

Le **transport** (LDAP en clair sur boucle locale, ou LDAPS avec un certificat engendré à la
volée) est laissé à A4, **à une condition écrite dans son rapport** : la configuration réelle
exige LDAPS et `src/config/index.ts` **refuse `ldap://` en production**. Si le banc éprouve le
client sur du LDAP en clair, alors *la vérification du certificat n'est éprouvée par rien*, et
c'est une réserve à porter au registre — pas une chose à taire.

---

## 26. Le contrat HTTP d'authentification — ce que L3 expose au navigateur

> **Pourquoi ce paragraphe arrive en retard, et ce que ça a coûté.** Le §25 fige le contrat de
> l'annuaire pour qu'un agent n'attende pas l'autre. Le même geste n'a pas été fait pour les
> routes de connexion : trois agents ont donc commencé à travailler sur une surface que
> **personne n'avait écrite** — celui qui l'implémente, celui qui la monte, et celui qui la
> consomme depuis le navigateur. Un agent qui doit deviner invente, puis refait.
>
> Ce paragraphe **constate** ce que l'arbre a déjà décidé, et **tranche** ce qui restait ouvert.
> Les deux sont signalés.

### 26.1 Ce que l'arbre a déjà décidé — constaté, pas réinventé

| Point | Où il fait foi |
|---|---|
| `ResolveurPerimetre` — « quel est le périmètre ? », **sans argument** | `src/api/session.ts` ; sa signature tient le contrôle S2 |
| `Authentificateur` — « cette requête-ci porte-t-elle une session ? », `authentifier(requete)` qui **lève** au lieu de rendre un verdict | `src/api/session.ts` |
| `SessionAppliquee` = `{ perimetre, droits, identite?, sessionOuverte? }` | `src/api/session.ts` |
| `DroitsSession` = `{ niveau, domaines, export, niveaux? }`, rendus par `GET /api/session` **et** `POST /api/connexion` | `src/api/index.ts`, `src/api/droits.ts` |
| `niveaux` — un niveau **par domaine**, facultatif ; il **restreint** et ne desserre jamais. Sans lui, le profil *Qualité* écrivait sur `conformite` que la base lui refuse (constat **Q-66**) | `src/api/droits.ts` |
| `GET /api/export` — enveloppe `grc-backup`, exige le **droit d'export distinct**, journalisé (contrôle S7) | `src/api/index.ts` |
| Le service d'authentification **est** l'`Authentificateur`, et il est construit dans `src/serveur.ts` — fichier **réservé à l'orchestrateur** depuis le constat **Q-71** | `src/serveur.ts` |
| Déclaration d'accès par route : `{ config: { acces: { action, domaine } } }` | `src/api/index.ts` |
| Enveloppe d'erreur `{ erreur, message, code_grc? }`, codes **grossiers à dessein** | `src/erreurs/index.ts` |

**Les deux interfaces restent séparées, et c'est structurel** : mélanger la seconde à la première
donnerait à `resoudre()` un paramètre `requete`, c'est-à-dire exactement le chemin par lequel un
en-tête atteindrait `grc.filiale_id`.

### 26.2 Ce qui restait ouvert — tranché ici

**Où la route de connexion est montée.** `src/auth/**` appartient à l'agent A1, `src/api/**` à
l'agent A2 : la route de connexion est donc **la seule surface que deux périmètres se disputent**.
Arbitrage : **A1 exporte un greffon Fastify** depuis `src/auth/`, que `src/api/index.ts` se
contente d'enregistrer par une ligne. La route et sa logique vivent chez A1 ; A2 n'écrit qu'un
`register`. Aucun fichier n'est partagé.

| Route | Corps envoyé | Réponse |
|---|---|---|
| `POST /api/connexion` | `{ identifiant, motDePasse }` | **200** — exactement la même charge que `GET /api/session`, à l'octet près |
| `DELETE /api/connexion` | *(vide)* | **204** — la session est révoquée en base (`revoquee_le`, `motif_revocation`), pas seulement oubliée du navigateur |

**Pourquoi `POST /api/connexion` rend la charge de `GET /api/session`** : le navigateur n'a alors
**qu'une seule forme à savoir lire**, et le chemin « je viens de me connecter » ne diverge jamais
du chemin « je rouvre l'onglet ». Deux formes, c'est deux comportements, et le second n'est
éprouvé par personne.

**Le cookie de session.** Nom donné par `SESSION_NOM_COOKIE` (défaut `grc_session`) ; `HttpOnly`,
`SameSite=Strict`, `Path=/`, `Secure` piloté par `SESSION_COOKIE_SECURISE`. **Aucun `Max-Age` ni
`Expires`** : l'expiration fait foi **en base** (`sessions.expire_le`, `derniere_activite`), pas
dans le navigateur. Un cookie qui porte sa propre échéance est une échéance que le client peut
mentir ; c'est la même famille que « le périmètre vient du serveur ».

**Les deux refus, et ce qu'ils ne disent pas.**

| Statut | `erreur` | Ce que le navigateur en fait |
|---|---|---|
| **401** | `non_authentifie` | ouvre l'écran de connexion **sans détruire la saisie en cours** |
| **403** | `droit_insuffisant` | affiche un refus ; **ne déconnecte pas**, et ne propose pas de recommencer |

Ni l'un ni l'autre ne nomme le domaine attendu, le niveau requis ou l'existence du compte :
l'énumérer dirait à qui n'y a pas droit **ce qu'il faudrait obtenir**. C'est le même oracle que
celui contre lequel `ressource_inconnue` existe.

⚠️ **L'interface n'est pas la barrière.** Le navigateur masque ce qu'il est absurde de proposer ;
le serveur refuse. Un contrôle qui n'existerait qu'à l'écran est un contrôle absent — c'est le
contrôle **S6** de la grille, et il se vérifie en appelant la route directement.

---

## 27. La déclaration des filiales — la source dont les groupes AD sont engendrés

> **Un critère d'acceptation précédait sa source d'une vague entière.** Le livrable
> « la liste des groupes AD est **engendrée** depuis la configuration des filiales, pas écrite à
> la main » (`PLAN_SERVEUR` §3.4) nomme une configuration qui **n'existe nulle part** : la table
> `filiales` est vide, rien dans `deploy/` ne les décrit, et leur création est le lot **L4**,
> c'est-à-dire la vague suivante. Arbitrage rendu à l'ouverture de la vague 3.

**La décision** : la déclaration des filiales est un **fichier d'exploitation**, écrit par le
client, vivant hors de la base — et c'est **lui** qui sème la table `filiales` au lot L4, pas
l'inverse. L4 le consomme ; il ne fabrique pas sa propre source.

Le motif est celui du §19.5, dans son exception : une omission ici **échoue bruyamment** — un
groupe AD manquant, c'est un RSSI de site sans aucun accès, et quelqu'un doit trancher. La liste
est donc le bon outil, à condition qu'elle soit **écrite une fois** et **lue partout**.

```
# filiales.conf — déclaration d'exploitation, une ligne par filiale
# code ; raison sociale ; pays ; active
TLS ; Dedienne Aerospace Toulouse ; FR ; oui
DEU ; Dedienne Aerospace Deutschland ; DE ; oui
```

| Ce qui en est engendré | Par |
|---|---|
| La liste des groupes `GRC-<FILIALE>-<PROFIL>` à créer dans l'AD | `deploy/` (agent A5), lot L3 |
| Les lignes de la table `filiales` | lot **L4**, vague 4 |
| Les groupes `GRC-GROUPE-<PROFIL>`, `GRC-EXPORT`, `GRC-ADMIN` | invariants, indépendants du fichier |

**Le client acquiert des filiales régulièrement.** Une liste de groupes figée est donc fausse à
la première acquisition, et fausse **en silence**. Ce que l'installateur doit produire est un
**engendrement**, rejouable, dont la sortie change quand le fichier change — et un contrôle qui
compare la liste engendrée à ce que l'AD porte réellement relève de l'exploitation, pas du dépôt.

---

## 28. Arbitrages en attente — avec leur critère de décision

Un arbitrage reporté sans critère est un arbitrage perdu, exactement comme un constat non
attribué (`PLAN_EXECUTION` §7). Ceux-ci sont datés du 03/09/2026.

| Sujet | Pourquoi il n'est pas tranché | Ce qui le tranchera |
|---|---|---|
| **Aucun client LDAP n'est déclaré** dans `package.json` — deux agents ont donc écrit chacun leur encodeur BER/ASN.1 (`src/auth/ber.ts`, `test/annuaire/ber.mjs`) | Ajouter la dépendance **pendant** qu'ils écrivent invaliderait un travail déjà fait et ferait bouger l'arbre sous eux (`PLAN_EXECUTION` §2 bis). Le manque est celui de l'orchestrateur, à qui `package.json` est réservé — pas le leur | **Leurs rapports** : ce que la main leur a réellement coûté, et ce que le BER écrit couvre du protocole. Une bibliothèque qui remplace deux encodeurs éprouvés n'est un gain que si elle en fait plus, pas seulement autrement |
### Tranché le 03/09/2026, sur la mesure et non sur l'intuition

**Le client LDAP reste écrit à la main. La dépendance n'est pas ajoutée.**

Le critère écrit ci-dessus était : *« une bibliothèque qui remplace deux encodeurs éprouvés n'est
un gain que si elle en fait plus, pas seulement autrement. »* A1 a rendu la mesure — c'est
exactement pour l'obtenir que l'arbitrage avait été reporté plutôt que tranché à l'aveugle :

| Mesuré | Valeur |
|---|---|
| Écrit à la main | **1 009 lignes** (BER 226, filtre 262, client 521), plus 241 de banc et 18 essais |
| Part du lot | **environ un cinquième** |
| Défauts que la main a coûtés | **un**, trouvé par le comportement **D5** du §25 — un délai de garde qui figeait l'appelant *pour toujours* quand l'annuaire était lent |
| Couvert | BER complet, les six messages nécessaires, les huit formes de filtre |
| **Non couvert** | SASL, StartTLS, **les contrôles — dont les résultats paginés** —, modify/add/delete/compare/abandon, poursuite des renvois |

**Aucun des manques ne concerne l'authentification**, qui lit un compte et quelques groupes. Un
seul peut mordre en production : les **résultats paginés**, Active Directory plafonnant une
recherche à 1 000 entrées. Il ne touche pas le chemin nominal (`memberOf`) mais le **repli**
`(member=<dn>)`, dans une forêt large.

Remplacer 1 009 lignes éprouvées, mordues, et dont le seul défaut a été **trouvé par le banc**,
par une dépendance à surveiller, pour obtenir *autrement* ce qui marche déjà — c'est le contraire
du critère. **La dépendance n'apporterait qu'une chose que la main n'a pas : la pagination.** Elle
sera donc reconsidérée si, et seulement si, la réponse du client à la question ci-dessous l'exige.

**Ce qui remplace la dépendance, et qui est plus urgent qu'elle** : une recherche tronquée doit
**se dire**. Une liste de groupes amputée en silence retire des droits sans erreur — un RSSI qui
perd son accès sans qu'aucune ligne de journal ne l'explique. Le client doit **refuser** plutôt
que rendre un résultat partiel (constat **Q-68**).

**Question à poser au client**, avec les vérifications du `PLAN_SERVEUR` §9 : *l'attribut
`memberOf` est-il fiablement peuplé sur tous les comptes, et existe-t-il des groupes de plus de
1 000 membres dans la forêt ?* Deux « oui » rendent la pagination nécessaire ; sinon elle reste
une complexité que rien n'exerce.

| **La gestion du cookie de session** — `cookie` et `set-cookie-parser` sont présents dans `node_modules` en dépendances **transitives** de Fastify | Bâtir sur une dépendance transitive est une dette silencieuse : elle disparaît le jour où Fastify change d'implémentation, sans qu'aucun `package.json` ne l'annonce | **Tranché le 03/09/2026 : le troisième cas est écarté.** `lireCookie` est écrit à la main — vingt lignes, éprouvées sur le nom voisin, la valeur vide et l'en-tête absent —, et **aucune dépendance transitive de Fastify n'est employée**. Si l'écriture du cookie devait se complexifier, `@fastify/cookie` serait à **déclarer**, pas à emprunter |

---

## 29. Le contrat du journal d'audit — figé avant la vague 4

> Écrit par l'orchestrateur le 04/09/2026, **avant** le lancement du moindre agent du lot L5.
> Même raison qu'au §25 : trois agents écrivent chacun une moitié du journal — celui qui
> l'émet, celui qui le lit, celui qui l'affiche —, et un contrat qui ne vit que dans le
> message d'un agent est perdu pour le suivant, qui le réinventera autrement.
>
> Ce paragraphe **fait foi** pour L5. Ce qu'il ne dit pas est laissé à l'agent ; ce qu'il dit
> ne se rediscute pas sans être réécrit ici.

### 29.1 D'où l'on part, mesuré et non estimé

Au 04/09/2026, sur la base de recette de `SRV-Infra` :

```
$ psql -U grc_lecture -d cyber_grc -c "select action, count(*) from journal_audit group by action"
 connexion_echouee  | 95        connexion_reussie | 59
 refus_autorisation |  3        deconnexion       |  2      -- total : 159 entrées
```

**Quatre actions émises sur les vingt que déclare `ck_journal_audit_action`.** Et `refus_autorisation`
ne compte qu'à moitié : ses trois entrées viennent toutes de la couche d'authentification
(« aucun périmètre ouvert par les groupes de l'annuaire »), **jamais** du crochet `onRequest`,
qui se contente d'un `requete.log.warn`. Le refus de droit par requête n'est pas journalisé.

`journaliser()` n'est appelée que depuis `src/auth/index.ts`. Les routes d'écriture, d'export et
de reprise portent chacune un `requete.log.info` qui dit, en toutes lettres, *« le journal d'audit
est le lot L5 »* : ce sont les coutures, et elles sont déjà nommées.

### 29.2 Les vingt actions, et qui doit les émettre

| Action | Émetteur attendu à L5 | Remarque |
|---|---|---|
| `connexion_reussie`, `connexion_echouee`, `deconnexion`, `session_expiree`, `session_revoquee` | `src/auth/` | ✅ **déjà émises** — ne pas y toucher |
| `refus_autorisation` | `src/auth/` **et** le crochet `onRequest` | la moitié manquante : un refus de droit par requête |
| `creation`, `modification`, `suppression` | `src/entites/` | avec `valeurs_avant` / `valeurs_apres` — voir §29.4 |
| `export` | la route `/api/export`, **et toute autre sortie de jeu de données** | c'est la moitié restante du constat **Q-89** |
| `import` | la route `/api/reprise` | l'opération la plus destructrice du produit |
| `administration` | toute route déclarée en action `administrer` | |
| `demarrage`, `arret` | `src/serveur.ts` | le journal doit pouvoir montrer un trou de service |
| `verification_journal` | la route de vérification du chaînage | se vérifier est un acte tracé |
| `consultation_sensible` | la lecture du journal lui-même | qui a lu le journal est une question d'audit |
| `purge`, `archivage` | procédure d'exploitation (§12) | **hors L5** — documentées, pas outillées |
| `approbation` | lot **L8** | **hors L5** |
| `analyse_antivirus` | lot **L6** | **hors L5** |

**Seize actions sur vingt à la sortie de L5.** Les quatre autres sont reportées **par écrit et
avec leur lot**, ce qui est la seule façon admise de reporter (§22, règle de lecture).

### 29.3 L'émission vit dans la transaction de l'écriture

> **Une écriture et sa trace réussissent ensemble ou échouent ensemble.**

`journaliser()` reçoit le `PoolClient` de la transaction en cours, jamais une connexion à elle.
Trois conséquences, et aucune n'est négociable :

1. **Un `rollback` emporte la trace avec l'écriture.** C'est voulu : une trace d'une écriture qui
   n'a pas eu lieu est une fausse preuve, et ce journal existe pour faire preuve.
2. **Une écriture ne peut pas réussir sans sa trace.** Si l'insertion au journal échoue, la
   transaction échoue. Un journal qu'on peut faire taire en le saturant n'est pas inaltérable.
3. **Un événement qui n'a pas de transaction d'écriture en ouvre une à lui.** C'est le cas du
   refus de droit — il se prononce dans `onRequest`, avant toute transaction — et celui du
   démarrage du service. Ils suivent le motif déjà écrit de `journaliserEchec` :
   `avecTransactionAuthentification`, périmètre de la session quand elle est résolue.

⚠️ **Le refus de droit ne doit pas devenir une arme.** Une requête refusée qui écrit en base
donne à un attaquant un moyen de faire travailler le serveur sans être authentifié. Le refus
journalisé est donc **celui d'une session valide** — l'authentification a réussi, le droit
manque. Un refus d'identité (401) reste traité par le limiteur de rythme, qui le compte sans
écrire, et par l'entrée `connexion_echouee` déjà émise.

### 29.4 `valeurs_avant` / `valeurs_apres` : le différentiel, pas le doublon

| Action | `valeurs_avant` | `valeurs_apres` |
|---|---|---|
| `creation` | `null` | l'enregistrement créé |
| `modification` | les valeurs **précédentes des seuls champs modifiés** | leurs valeurs neuves |
| `suppression` | l'enregistrement supprimé | `null` |

**Pourquoi le différentiel et non l'enregistrement entier à chaque modification** : la rétention
est de **trois ans** (§12). Stocker deux copies complètes à chaque changement de statut multiplie
le volume du journal par la taille de l'enregistrement, pour répondre à une question que personne
ne pose. Un auditeur demande *ce qui a changé*, pas *à quoi ressemblait la fiche*.

Le champ déjà retiré par « ce qui n'a pas changé ne s'écrit pas » (`src/entites/`, constat M-1)
**n'apparaît donc pas** : c'est la même notion, et elle est déjà calculée.

### 29.5 Aucune valeur d'utilisateur n'est concaténée dans `resume`

L'auditeur de la porte S3 a forgé un login contenant du JSON et des sauts de ligne : il est
arrivé **littéralement** dans le journal. Le chaînage n'en souffre pas, et rien n'a fui — mais
l'export du journal est un livrable de ce lot, et un export texte scinderait la ligne.

La règle tient en une phrase :

> **`resume` est une phrase écrite par le développeur. Une valeur d'utilisateur n'y entre jamais.**

Elle a **deux** sorties, et elles suffisent :

- `utilisateur_libelle`, colonne dédiée, pour l'identité présentée ;
- `valeurs_apres`, en `jsonb`, pour tout le reste — où l'encodage est le problème de PostgreSQL
  et non celui de qui écrit la phrase.

C'est la même règle que « les requêtes sont intégralement paramétrées » (§17.4), appliquée à la
seule table dont l'objet est de faire preuve.

### 29.6 Ce qui n'entre jamais dans une entrée

Mot de passe, jeton de session, empreinte de jeton, secret de configuration, contenu d'une pièce
jointe. Le journal se lit à froid, trois ans plus tard, par des gens qui n'étaient pas là
(contrôle **S8**).

⚠️ Ce que le journal contient **par construction** et qu'il faut assumer : des identités, des
adresses IP, et des valeurs métier avant/après — sur trois ans. Il est lui-même un traitement de
données personnelles, et le produit doit figurer au registre article 30 qu'il héberge
(`PLAN_SERVEUR` §1.7, dernière phrase). **Ce n'est pas un livrable de code**, c'est une ligne de
registre à créer.

### 29.7 La lecture du journal après E6 — le contrat entre celui qui resserre et celui qui lit

La condition d'entrée **E6** (§22) est un livrable **ferme** de L5. `004_rls.sql` §6 écrit déjà
la correction : rendre les deux fonctions de chaînage `security definer` appartenant à
`grc_proprietaire`, puis resserrer la politique de lecture sur le périmètre.

**L'ordre n'est pas un détail : les deux moitiés n'ont de sens qu'ensemble.** Resserrer sans
`security definer` fait échouer **toute écriture** au journal — `f_journal_audit_chainage()`
numérote à partir de `max(numero)` lu sous RLS. Poser `security definer` sans resserrer
n'améliore rien. C'est le motif du 5ᵉ passage de la porte S2 : *deux fichiers dont aucun n'a tort
seul*. Ils vont donc au **même agent**.

Ce que la politique resserrée doit dire, et qui est un arbitrage, pas une évidence :

| Entrée | Périmètre Groupe | Périmètre d'une filiale |
|---|---|---|
| `filiale_id = <sa filiale>` | lit | **lit** |
| `filiale_id = <une autre filiale>` | lit | **ne lit pas** |
| `filiale_id is null` (échec de connexion, démarrage du service) | lit | **ne lit pas** |

**Le troisième cas est l'arbitrage, et il a un coût qu'il faut dire.** Un échec de connexion
n'est attaché à aucune filiale — il précède la résolution du périmètre, et sur un login inconnu
il n'y a rien à résoudre. Les rendre visibles à chaque filiale donnerait à chacune la liste des
logins du groupe entier : c'est l'oracle inter-filiales que ce chantier ferme depuis la vague 1.
**Le coût assumé** : un administrateur de filiale ne voit pas les tentatives visant ses propres
utilisateurs. C'est le RSSI Groupe qui les voit. À reconsidérer si le client le demande — par
écrit, pas par glissement.

⚠️ **Conséquence pour les essais des autres agents** : toute lecture du journal dans un essai
**déclare un périmètre**. Un `select` sous `grc_lecture` sans périmètre cessera de rendre des
lignes — et, sur une table non vide, lèvera « Périmètre non positionné » plutôt que de rendre `0`
(constat **Q-104** : un `0` sur une table cloisonnée ne distingue pas *vide* de *non contrôlé*).

### 29.8 Le contrat HTTP de la consultation — figé ici, implémenté ailleurs

Trois routes, dans le **greffon `src/api/journal.ts`**, que `src/api/index.ts` enregistre déjà.
La couture existe avant les deux agents qui l'utilisent, exactement comme `ResolveurPerimetre`
existait avant le lot qui l'a remplie.

| Route | Déclaration d'accès | Rend |
|---|---|---|
| `GET /api/journal` | `{ action: 'lire', domaine: 'journal' }` | page d'entrées, filtres `depuis`/`jusqu_a`/`action`/`utilisateur`/`entite_type`, pagination par `numero` décroissant |
| `GET /api/journal/export` | `{ action: 'exporter', domaine: 'journal' }` | le même jeu, en fichier — **exige le droit d'export en plus du domaine** |
| `GET /api/journal/verification` | `{ action: 'lire', domaine: 'journal' }` | le résultat de `f_journal_audit_verifier()` : **aucune ligne = journal sain** |

**`domaine: 'journal'` et non `'administration'`** — arbitrage pris le 04/09/2026, motivé dans
`src/api/droits.ts`. Le vocabulaire de décision passe de treize à **quatorze** domaines : régler
l'application et lire trois ans d'identités ne sont pas le même droit. Aucun profil du socle n'en
est affecté (mesuré : `ADMIN` est le seul à porter l'un des quatre domaines d'administration) —
ce qui est fermé, c'est le **prochain** profil paramétré.

**La pagination se fait sur `numero`, jamais sur un décalage.** `numero` est strictement
croissant et sans trou (§12) : c'est un curseur exact, insensible aux insertions concurrentes.
Un `offset` sur un journal qui grandit pendant qu'on le feuillette saute des lignes.

#### Le curseur et l'enveloppe — complété le 04/09/2026, en vol

⚠️ **Ce paragraphe manquait, et c'est l'agent qui écrivait l'écran qui l'a signalé.** Le §29.8
figeait les chemins, les classes d'accès et les cinq noms de filtres — et ni le nom du curseur,
ni la forme de la réponse. Les deux moitiés allaient donc les choisir séparément : exactement la
divergence qu'un contrat existe pour empêcher, et exactement le motif que ce chantier traque
depuis onze occurrences. *Un contrat incomplet est un contrat qui sera complété deux fois.*

L'arbitrage suit ce que la moitié déjà écrite emploie — le refaire coûterait une réécriture pour
un gain nul :

| Élément | Nom **normatif** |
|---|---|
| Curseur de page | paramètre **`avant`** — rend les entrées de `numero` **strictement inférieur** |
| Taille de page | paramètre **`limite`**, défaut **50**, plafond **500** |
| Tableau des entrées | clé **`entrees`** |
| Curseur de la page suivante | clé **`suivant`** — `null` quand il n'y a plus rien |

**Deux propriétés, et elles ne sont pas décoratives :**

1. **L'ordre est `numero` décroissant.** Le journal se lit du plus récent au plus ancien : c'est
   la question qu'on lui pose (« que s'est-il passé ? »), et c'est ce qui rend `avant` monotone.
2. **`suivant` se déduit des données quand le serveur ne l'annonce pas** : c'est le plus petit
   `numero` de la page. Le client n'a donc pas à croire le serveur sur parole, et une page
   incomplète est la dernière. Le serveur **doit** néanmoins l'émettre — se reposer sur la
   déduction ferait dépendre la pagination d'une taille de page, et une taille de page est un
   réglage.

**L'export du journal se prouve sur une entrée hostile.** Le format doit rendre **une** ligne
logique pour une valeur contenant `\r\n`, `"` et `;`. La preuve n'est pas une relecture : on
forge l'entrée — un échec de connexion sur un login construit suffit, c'est ce qu'a fait
l'auditeur —, on exporte, on **ré-analyse**, et on retrouve la valeur intacte.

#### Trois exigences ajoutées après la porte S4 — et deux sont des omissions de CE contrat

⚠️ **Le §29.8 n'exigeait que `\r\n`, `"` et `;`. Le lot a livré exactement cela, et c'était
insuffisant.** L'omission est celle du contrat, pas celle de qui l'a appliqué — ce qui est le
motif le plus coûteux de ce chantier, et il vaut d'être écrit là où il s'est produit.

1. **La citation protège la structure, pas l'interprétation** (constat **Q-121**). Le format
   est destiné à un tableur — BOM UTF-8, séparateur `;` des Excel francophones —, et un
   tableur retire les guillemets *puis* évalue toute cellule commençant par `=`, `+`, `-` ou
   `@`. Or `utilisateur_libelle` porte, pour une connexion refusée, **le login présenté par un
   attaquant non authentifié**. Toute valeur textuelle commençant par l'un de ces caractères
   est donc **préfixée d'une apostrophe à l'export**, sans que la base soit touchée : le
   journal fait preuve, on ne réécrit pas ce qu'il contient. La cible d'une charge n'est pas
   le serveur, c'est le poste de l'auditeur externe qui ouvre la pièce.
2. **Un extrait ne se tronque jamais en silence** (constat **Q-119**… non : **Q-120**). Le
   plafond portait sur le *paramètre*, jamais sur le *nombre de lignes* : au-delà de 50 000
   entrées lisibles, l'export rendait les 50 000 plus récentes en se présentant comme
   l'extrait demandé. On demande donc **un enregistrement de plus que le plafond** ; s'il
   arrive, on refuse en **400** et l'on dit comment obtenir la suite.
3. **La vérification du chaînage est réservée au périmètre Groupe** (constat **Q-118**, classe
   *fuite de données*). `f_journal_audit_verifier(depuis)` est un **oracle exact** : pour tout
   `N`, elle rend le numéro, l'identifiant et l'horodatage à la microseconde de l'entrée n° N,
   et au-delà du dernier maillon son `sain: true` donne le volume total. Mesuré depuis une
   session d'une seule filiale : **11 maillons hors périmètre reconstruits sur 14**, entrées
   transversales comprises. La chaîne est une propriété du **groupe** — elle enjambe les
   périmètres par construction, c'est la raison d'être du `security definer` — donc la
   vérifier est un acte de Groupe. ⚠️ Cela ne ferme pas le canal **SQL** : `grc_app` conserve
   `execute` sur la fonction, et le même oracle reste atteignable par qui contrôlerait déjà le
   rôle applicatif. C'est le risque assumé du §17.4.

### 29.9 Ce que L5 ne livre pas, et pourquoi c'est écrit ici

| Non livré | Motif | Où il est repris |
|---|---|---|
| Le partitionnement par année de `journal_audit` | Aucun volume ne le justifie : 159 entrées. Le §12 le prévoit « si le volume devait rendre la procédure pénible » | §12, sans échéance — le déclencheur est le volume |
| La purge et l'archivage outillés | Procédure d'exploitation sous le compte propriétaire, hors application **par construction** (§12) | §12 |
| L'horodatage sur source NTP **vérifié** | `clock_timestamp()` prend l'heure du système ; que ce système soit synchronisé est une propriété de la VM, pas du code | à confronter à la recette, `PLAN_SERVEUR` §1.7 |

---

## 30. Le contrat du changement de filiale active — figé avant la vague 4

> Écrit par l'orchestrateur le 04/09/2026, **avant** le lancement des agents de la vague 4.
> Même raison qu'aux §25 et §29 : c'est un **arbitrage**, et un arbitrage ne se délègue pas.

### 30.1 Pourquoi c'est le point le plus dangereux du lot L4

L'invariant central du produit est écrit partout : **« le périmètre vient du serveur, jamais
d'une valeur transmise par le navigateur »**. Il n'est pas tenu par de la vigilance, il est
tenu par la **forme** — `resoudre()` ne prend aucun argument, et `js/core/api.js` n'expose
aucun paramètre de filiale (`CLAUDE.md` §8, condition vérifiée à la porte S2 sur six formes
d'en-tête, le cookie, l'URL et le corps).

**Un sélecteur de filiale introduit, par définition, une valeur choisie par le client.** Il
est donc le seul endroit du produit où cet invariant peut se perdre — et il se perdrait
*silencieusement* : l'utilisateur croirait écrire chez A en écrivant chez B.

### 30.2 La règle, et la distinction qui la tient

> **Le client envoie un CHOIX. Le serveur résout un PÉRIMÈTRE.** Ce ne sont pas la même
> chose, et rien de ce que le client envoie n'entre jamais dans un périmètre.

| | |
|---|---|
| Ce que le client peut envoyer | un **identifiant de filiale**, et rien d'autre |
| Ce que le serveur en fait | il le cherche dans **`session_filiales`, relu en base pour CETTE session** — jamais dans une liste que le client aurait jointe, jamais dans le corps, jamais dans un en-tête |
| Ce qui se passe s'il n'y est pas | **403**, journalisé en `refus_autorisation`. Pas de repli, pas de valeur par défaut : un choix refusé laisse la filiale active **inchangée** |
| Où la filiale active est rangée | **dans la ligne de session, côté serveur.** Ni cookie, ni en-tête, ni paramètre d'URL |

**Conséquence, et c'est elle qui préserve l'invariant** : après le changement, toute requête
suivante résout son périmètre exactement comme avant — `resoudre()` ne prend toujours aucun
argument, et `js/core/api.js` n'expose toujours aucun paramètre de filiale. Le sélecteur est
une **route dédiée**, pas un paramètre ajouté aux routes existantes. Un agent qui serait
tenté d'ajouter `?filiale=` à `/api/donnees` doit s'arrêter : ce serait la fin de la
propriété, et le contrôle **S2** de la grille la rejoue contre cette couche.

### 30.3 Ce que le changement ne fait PAS

- **Il ne change pas le périmètre de LECTURE.** `session_filiales` vient des groupes AD, et
  ne bouge qu'à la ré-authentification ou au déprovisionnement (lot L3). Le sélecteur ne
  déplace que la **filiale active** — celle où les écritures atterrissent
  (`f_filiale_ecriture()`), et elle doit **appartenir** au périmètre de lecture : c'est déjà
  vérifié *par la base* depuis la porte S1 (§17.9), et cette vérification reste la dernière
  barrière même si la route se trompe.
- **Il n'accorde aucun droit.** Les domaines et le niveau ne dépendent pas de la filiale
  active. Un contributeur qui bascule reste contributeur.

⚠️ **La fenêtre à fermer, et elle est réelle** : les groupes AD d'un utilisateur peuvent
changer *pendant* sa session (le lot L3 les relit tous les `AUTH_REVERIFICATION_AD`
minutes). Si la filiale active en sort, la session ne doit pas continuer d'écrire là. **La
filiale active est donc revérifiée contre `session_filiales` à chaque requête**, et non
seulement au moment du choix. C'est une lecture indexée sur une table minuscule ; la payer
est moins cher que de raisonner sur la fenêtre.

### 30.4 L'acte est tracé, et le vocabulaire s'allonge d'une valeur

Aucune des vingt actions de `ck_journal_audit_action` ne décrit un changement de périmètre.
La migration **`009`** en ajoute une — **`changement_perimetre`** — en **remplaçant la
contrainte**, ce qui est la voie sanctionnée par le §23 (on n'a pas réécrit `001`, on l'a
altérée depuis une migration neuve). `ActionJournal` (`src/auth/journal.ts`) gagne la même
valeur : les deux listes se font face, et une divergence fait **échouer l'insertion
bruyamment** en `23514`.

L'entrée porte la filiale **quittée** et la filiale **rejointe** dans `valeurs_avant` /
`valeurs_apres` — et `resume` reste une phrase fixe (§29.5).

---

## 31. Le contrat des pièces jointes — figé avant la vague 4

> ⚠️ **Le modèle EXISTE DÉJÀ, et c'est la première chose à savoir** : ne le réinventez pas.

### 31.1 Ce que le dépôt porte déjà

`001_socle.sql` §… définit `pieces_jointes` avec **tout** ce que la chaîne exige :
`sha256` (`empreinte_sha256 not null`), `etat_analyse`, `quarantaine`, `chemin_stockage`,
`taille_octets`, `type_mime`, `extension`, `signature_virale`, `date_analyse`,
`derniere_reanalyse` — plus les contraintes qui les lient (`etat_analyse <> 'infectee' or
quarantaine`). `src/config/index.ts` porte `tailleMaxOctets`, `quotaFilialeOctets`,
`clamavActif`, `clamavSocket`, `clamavDelaiMs`, et les chemins `piecesJointes` /
`quarantaine`.

**Conséquence pour la vague : L6 n'a pas besoin de migration** — hormis celle du §30.4, qui
appartient à L4. Il n'y a donc **aucune dépendance de migration entre les agents**.

### 31.2 L'ordre des huit contrôles n'est pas indifférent

Le `PLAN_SERVEUR` §1.6 les énumère ; ce paragraphe fige **l'ordre d'exécution**, parce qu'un
contrôle joué trop tard ne protège plus rien :

1. **taille** — avant de lire l'octet suivant ; un fichier hors borne ne doit jamais atteindre le disque ;
2. **quota de la filiale** — même raison, et il se calcule sur `sum(taille_octets)` de la filiale ;
3. **extension** contre la liste blanche ;
4. **signature binaire** (les octets de tête), qui doit **concorder** avec l'extension et le type MIME annoncés — un exécutable renommé `.pdf` se refuse ici, et c'est le seul contrôle que l'attaquant ne choisit pas ;
5. **écriture en zone d'attente**, nom aléatoire opaque, **hors de toute racine web** ;
6. **SHA-256** calculé sur ce qui a été écrit, pas sur ce qui a été reçu ;
7. **ClamAV** ; à l'issue, promotion vers le stockage définitif **ou** déplacement en quarantaine et `etat_analyse = 'infectee'` ;
8. **la ligne n'est visible de l'application qu'après** — une pièce en cours d'analyse n'est jamais délivrable.

⚠️ **Le point 4 est celui qu'on oublie**, et c'est le seul qui ne se laisse pas contourner en
renommant. Le point 6 après le point 5 est délibéré : une empreinte calculée sur le flux
reçu ne prouve pas ce que porte le disque.

### 31.3 La délivrance

`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, **jamais** le type MIME
annoncé par le déposant — celui qu'on a **constaté**. Apache ne sert **aucun** de ces
fichiers : ils vivent hors racine web et ne sortent que par l'application, après contrôle
des droits **et du périmètre**.

**Les logos de filiale suivent la même chaîne, et PNG ou JPEG exclusivement** — pas de SVG,
qui porte du script et s'afficherait *dans* l'interface.

### 31.5 Ouvrir une pièce est une LECTURE, pas un export — arbitré le 04/09/2026

**La question s'est posée entre deux agents, et le brief de l'orchestrateur avait tort.**
Il disait : *« tout ce qui fait sortir un octet passe par `Droits.exigerExport()` — un
téléchargement de pièce jointe en est un »*. L'agent qui a écrit le serveur a déclaré la
route `action: 'lire'` et l'a **contestée par écrit** ; l'agent du navigateur a appliqué la
consigne. Les deux moitiés se contredisaient : le client refusait ce que le serveur
autorisait.

**Ce qui a tranché est une mesure** : le droit d'export vient du groupe AD `GRC-EXPORT`, et
la plupart des comptes ne le portent pas. Exiger l'export pour ouvrir une pièce aurait
empêché **un auditeur d'ouvrir le rapport d'audit** qu'il est chargé de lire, et un
contributeur de rouvrir le PDF qu'il vient de déposer. Le module documentaire serait devenu
inutilisable pour la majorité des profils.

> **Règle : ouvrir une pièce attachée à une fiche qu'on a le droit de lire est une
> LECTURE.** La route déclare `action: 'lire'`, et **chaque délivrance est tracée** en
> `consultation_sensible` — « qui a ouvert quoi » reste donc une question à laquelle le
> journal répond, ce qu'exige le `PLAN_SERVEUR` §1.7.

**Ce que la règle ne dit pas, et qui reste à trancher le jour où le cas existera** : un
téléchargement **groupé** — une archive de toutes les pièces d'une filiale — serait, lui,
« l'extraction en un clic, complète et silencieuse » que le §3.3 vise. Aucun n'existe
aujourd'hui ; qu'aucun ne s'écrive sans revenir ici.

⚠️ **Conséquence côté navigateur, et c'est mieux ainsi** : l'écran **ne fabrique plus** le
téléchargement. Il suit l'adresse, et le serveur délivre en `attachment` + `nosniff`. Donc
(a) un fichier de 25 Mio ne transite plus par la mémoire du navigateur, (b) le nom écrit sur
le disque vient de l'en-tête assaini par le serveur, et (c) le garde-fou mécanique de
l'entonnoir cesse d'accuser ce chemin **parce qu'il n'y a plus rien à accuser** — par
disparition de l'objet, jamais par une exemption. *Une exemption incomplète fait réussir
quelque chose en silence ; une disparition, non.*

### 31.4 Ce que ClamAV ne garantit pas, et qu'il faut écrire

Le `PLAN_SERVEUR` §1.6 l'ouvre par cette phrase, qui doit se retrouver dans le code :
**aucun dispositif ne garantit l'absence de malware.** La chaîne est une défense en
profondeur, pas une promesse. Le §17.5 s'applique — un garde-fou ne se voit pas prêter plus
de portée qu'il n'en a. ⚠️ Et **si ClamAV ne répond pas, la pièce n'est pas acceptée** :
`clamavActif` désactive l'analyse en développement, jamais l'échec silencieux en production.
