# Porte S8 — 8ᵉ passage — PÉRIMÈTRE A : base, schéma, cloisonnement, garde-fous

| | |
|---|---|
| **Auditeur** | indépendant — n'a écrit aucune des lignes examinées |
| **Date** | 11/09/2026 |
| **Révision examinée** | `24e6872` (« Réancrer les chiffres sur 7b11bb6 ») |
| **Machine** | `SRV-Infra`, Debian 13, PostgreSQL 17.11, base de recette `cyber_grc` |
| **Contrôles du périmètre** | S1, S2, S3, S4, S5, S14, S16 |
| **Verdict du périmètre** | ❌ **refusé** — 6 majeurs, 4 mineurs, **0 fuite entre filiales** |

## Déclaration d'intégrité du dépôt

`git status --porcelain` a été joué **au début** et **à la fin** de l'audit : **vide les deux
fois**, révision `24e6872` inchangée. Aucun fichier du produit, du banc ou de la documentation
n'a été écrit. Le **seul** fichier créé est le présent rapport.

Toutes les mutations ont été jouées sur une **base jetable** (`audit_s8a`, créée par
`createdb` + `node db/migrate.mjs`, détruite à la fin) ou dans une **transaction annulée**.
Aucune écriture sur la recette, aucune filiale créée dans `cyber_grc`,
`db/dev/preparer_base_dev.sh` jamais joué.


> ### Numérotation définitive — posée par l'orchestrateur après consolidation
>
> L'auditeur a employé des étiquettes locales, **sans réserver de plage** : une plage
> réservée est exactement le genre de convention qui devient fausse, et la leçon a dû
> être apprise deux fois (7ᵉ passage, garde-fou « LA NUMÉROTATION est continue »).
> Les numéros définitifs, contigus après **Q-290**, sont :
>
> | Étiquette | Registre |
> |---|---|
> | **A-1** | **Q-291** |
> | **A-2** | **Q-292** |
> | **A-3** | **Q-293** |
> | **A-4** | **Q-294** |
> | **A-5** | **Q-295** |
> | **A-6** | **Q-296** |
> | **A-7** | **Q-297** |
> | **A-8** | **Q-298** |
> | **A-9** | **Q-299** |
> | **A-10** | **Q-300** |
>
> Registre : `docs/PLAN_EXECUTION.md` §7.

---

## 1. Verdict des sept contrôles

| Contrôle | Verdict | Preuve |
|---|---|---|
| **S1** — cloisonnement par filiale non contournable | ✅ **passé** | `db/verifier_cloisonnement.sql` sous `grc_app` → **109 contrôles, 109 réussis, 0 échoué** (dont les deux neufs C108 « la politique du GROUPE ne se rattache pas au traitement LOCAL d'une filiale » et C109 « depuis Toulouse, le socle Groupe OUI, l'Allemagne JAMAIS »). Douze sondes hostiles de ma main sur les surfaces neuves (§4) : aucune ne franchit. |
| **S2** — le périmètre ne vient jamais du navigateur | ✅ **passé** | Le lot n'ajoute aucun chemin de résolution. `f_filiales_lecture()` / `f_filiale_ecriture()` lisent `current_setting('grc.*')` posé par la transaction serveur ; les quatre politiques des tables neuves les appellent. Mesuré : une écriture sans `grc.filiale_id` rend `GRC04` (§4, C-*). |
| **S3** — journal inaltérable et complet | ✅ **passé** *(sur mon périmètre)* | `ck_journal_audit_action` est **valide** (`convalidated = t`) et son garde `f_verifier_vocabulaire_journal()` vérifie **la validité** de la contrainte, pas seulement son nom. La purge journalise des **comptes**, jamais le nom (lu dans `src/cycle/index.ts` §7). ⚠️ Le contrôle S3 « complet » au sens des vingt actions relève du périmètre B. |
| **S4** — verrouillage optimiste | ✅ **passé** | Mesuré par la route : modifier **les seules étiquettes** (`PUT /api/entites/documents/DOC-A`, `champs: { etiquettes: […] }`) fait passer `_version` de 1 à 2 ; le rejeu avec la version périmée rend **409 `conflit_version`**. La liaison neuve n'échappe donc pas au verrou. |
| **S5** — aucune injection SQL | ✅ **passé** | La purge construit désormais son SQL à partir de **valeurs de table** (`colonnes_personnelles`). Tous les identifiants passent par `guillemeter()` (`"…"` avec doublement des guillemets) ; les valeurs restent paramétrées (`$1`, `$2`). Le balayage n'ouvre que ce que `has_column_privilege` accorde. ⚠️ Voir **A-10** : la faiblesse de cette surface n'est pas l'injection, c'est le **type** de la colonne déclarée. |
| **S14** — intégrité des opérations composites | ❌ **en échec** | **A-4** : un traitement de portée Groupe est **servi par `/api/donnees`**, **offert dans le `<select>`** de la fiche document, et **refusé en 409** à l'enregistrement. **A-3** : le régime « signaler » du registre n'est appliqué par personne. |
| **S16** — les garde-fous sont branchés | ❌ **en échec** | Les 26 garde-fous sont bien **découverts** et joués par `f_verifier_schema()` (0 anomalie sur la recette). Mais **A-1** (le garde des privilèges ne couvre pas le registre neuf), **A-2** (deux gardes reconnaissent des mots au lieu de mesurer), **A-5**, **A-6**, **A-7**, **A-9**, **A-10** montrent qu'ils **ne mordent pas là où leurs commentaires disent qu'ils mordent**. |

---

## 2. Les constats

### 🟠 A-1 — `colonnes_personnelles` est **en écriture pour le rôle applicatif**, et la migration affirme deux fois le contraire

**Énoncé.** La migration `026` écrit, dans deux commentaires distincts :

> « Ce qui le protège est le **PRIVILÈGE**, pas le prédicat — seul le propriétaire y écrit, au fil des migrations. »
> « Son écriture est fermée par les **PRIVILÈGES**, pas par un prédicat : le rôle applicatif n'a que « select » dessus. »

C'est **faux**. `001_socle.sql` §0 pose `alter default privileges … grant select, insert, update,
delete to grc_app` **avant** toute création de table : `colonnes_personnelles`, créée en `026`,
hérite des quatre privilèges. La migration `026` ne fait **aucun `revoke`** (vérifié :
`grep -n revoke db/migrations/026*.sql db/migrations/027*.sql` → rien), et n'ajoute pas la table
au tableau `v_registres` de `f_verifier_privileges()`.

C'est exactement le chemin que la migration `005` avait parcouru pour `controles_schema` — elle,
elle fait les **deux** (`revoke insert, update, delete, truncate on controles_schema from grc_app`
ligne 222, et `v_registres := array['migrations_schema','controles_schema']` ligne 955).
`v_registres` est une **liste écrite à la main dont l'incomplétude réussit en silence**.

**La mesure.**

```
$ psql -U grc_app -d cyber_grc -c "select table_name, string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.table_privileges where grantee='grc_app'
    and table_name in ('colonnes_personnelles','controles_schema','migrations_schema') group by 1;"

      table_name       |         string_agg
-----------------------+-----------------------------
 colonnes_personnelles | DELETE,INSERT,SELECT,UPDATE
 controles_schema      | SELECT
 migrations_schema     | SELECT
```

Et, sous `grc_app` sur la recette (transaction annulée) :

```
### grc_app peut-il SUPPRIMER le registre des données personnelles ?
delete from colonnes_personnelles;        -- aucun refus
select count(*) from colonnes_personnelles;  ->  0
### … le même geste sur controles_schema :
ERROR:  permission denied for table controles_schema
```

**La chaîne complète, mesurée de bout en bout** (base jetable, purge jouée par la vraie route) :

```
--- lignes du registre réécrites par grc_app : 1        (a_expiration 'anonymiser' -> 'conserver')
--- f_verifier_schema() après la réécriture : 0 anomalie(s)
--- purge : 200   anonymisées : {"actions.responsable":1}
--- actifs.responsable après la purge : {"responsable":"Amélie Durand"}
```

**Rayon.** Le rôle applicatif — c'est-à-dire tout ce qui obtient l'exécution de SQL par
l'application, ou tout exploitant détenant le secret de `grc_app` — peut **vider ou falsifier le
registre RGPD du produit**. Conséquences mesurées : la purge cesse d'anonymiser la colonne
touchée ; `GET /api/rgpd/registre-produit`, la pièce que le DPO vient lire, rend le registre
falsifié ; et `f_verifier_schema()` reste **à zéro anomalie**. *Atténuation, et elle compte* : le
balayage de vérification de la purge, lui, est indépendant du registre et rend la colonne en
`classe: 'anomalie'` — le défaut n'est donc pas totalement muet.

**Remède.** Les deux gestes de la `005`, dans une migration `028` : `revoke insert, update,
delete, truncate on colonnes_personnelles from grc_app, grc_lecture`, et `'colonnes_personnelles'`
ajouté à `v_registres`. ⚠️ **Et la leçon de classe** : `v_registres` continuera de vieillir.
Le critère « table dont l'écriture appartient au déploiement » se **découvre** — par exemple,
toute table figurant dans `v_sans_filiale_admises` de `f_verifier_couverture_rls()` au motif
« registre technique ».

---

### 🟠 A-2 — Deux garde-fous **reconnaissent des mots** au lieu de mesurer, et leurs commentaires prétendent l'inverse

**Énoncé.** `f_verifier_classification_documents()` (migration `027`) est introduite par :

> « Il mesure le **CONTENU** des contraintes, pas leur nom : une contrainte renommée est visible,
> une contrainte **vidée de sa substance** ne l'est pas. C'est la leçon du constat Q-283. »

Et `f_verifier_ecart_ne_fait_pas_foi()` (migration `025`) par :

> « On vérifie que la contrainte parle bien d'`etat_integrite` : une contrainte du bon nom portant
> sur autre chose serait le défaut que le constat Q-281 a rendu célèbre — **un garde qui reconnaît
> au lieu de mesurer**. »

Les deux cherchent des **sous-chaînes** dans `pg_get_constraintdef()`. Une contrainte **vidée de
sa substance**, portant le même nom et citant les mêmes littéraux, les satisfait.

**La mesure — contrainte de classification** (base jetable, transaction annulée) :

```sql
alter table documents drop constraint ck_documents_confidentialite;
alter table documents add constraint ck_documents_confidentialite
  check (confidentialite in ('public','interne','confidentiel','restreint')
         or confidentialite is not null);          -- ← vraie pour TOUT
```
```
 anomalies_du_schema
---------------------
                   0
update documents set confidentialite='diffusion libre' where id='DOC-TLS';
   id    | confidentialite
---------+-----------------
 DOC-TLS | diffusion libre
```

**La mesure — contrainte d'intégrité** :

```sql
alter table pieces_jointes drop constraint ck_pieces_jointes_en_vigueur_integre;
alter table pieces_jointes add constraint ck_pieces_jointes_en_vigueur_integre
  check (en_vigueur is not null and etat_integrite is not null);
```
```
### Témoin, avec la VRAIE contrainte :
ERROR:  new row for relation "pieces_jointes" violates check constraint "ck_pieces_jointes_en_vigueur_integre"
### Avec la contrainte VIDÉE :
 anomalies_du_schema : 0
    id    | en_vigueur | etat_integrite
----------+------------+----------------
 PJ-ECART | t          | ecart
```

Une pièce dont le rapprochement d'intégrité a rendu **« ecart »** redevient **« en vigueur »** —
c'est-à-dire *« celle-ci est la pièce qui fait référence »* — dans un outil produit en audit, et
le schéma se déclare sain.

**La classe.** Cinq garde-fous sur vingt-six lisent `pg_get_constraintdef()` et comparent du
texte : `f_verifier_classification_documents`, `f_verifier_declencheurs_pieces`,
`f_verifier_ecart_ne_fait_pas_foi`, `f_verifier_publication_documents`,
`f_verifier_vocabulaire_journal`. J'en ai éprouvé deux, et les deux tombent.
*(Mesuré par `select p.proname, position('pg_get_constraintdef' in pg_get_functiondef(p.oid))>0
from pg_proc … where proname like 'f_verifier_%'`.)*

⚠️ **À décharge, et il faut le dire** : les mutations moins sournoises **mordent toutes**. Retirer
un seul niveau de la contrainte (`M8 bis`), la supprimer (`M17`), rendre la colonne nullable
(`M9`), changer son type (`M10`) : quatre anomalies nommées, à chaque fois. Le garde n'est pas
creux — il est **contournable par un attaquant qui le lit**, ce qui est le seul cas qui compte
pour une barrière.

**Rayon.** Un garde de schéma qui rend « sain » sur une contrainte morte est **pire qu'aucun
garde** : il a été cité, à trois reprises dans la documentation du 7ᵉ passage, comme la preuve
qu'une barrière tenait (c'est mot pour mot le constat Q-281, reproduit un cran plus haut).

**Remède.** Ne pas comparer le texte : **l'évaluer**. `select (predicat)` sur des valeurs témoins
— `'diffusion libre'` doit rendre faux, `'restreint'` doit rendre vrai ; `(en_vigueur=true,
etat_integrite='ecart')` doit rendre faux. Trois lignes de `execute format('select %s', v_def)`
disent ce que mille `position()` ne diront jamais.

---

### 🟠 A-3 — Le régime **« signaler »** n'existe que dans la base : la seule colonne qui le porte est traitée en **anomalie**

**Énoncé.** La migration `026` crée un quatrième régime d'expiration, et le commente longuement :

> « **signaler** (TEXTE LIBRE : le nom est au milieu d'une phrase, et le remplacer détruirait la
> phrase — le produit **SIGNALE l'emplacement à un humain** au lieu d'effacer, comme il le fait
> déjà pour la description d'un incident). »

Une seule colonne du produit le porte : `crise.notes` *(mesuré sur la recette :
`select a_expiration, count(*) … group by 1` → `signaler | 1`)*, et son commentaire précise
« Même classe que `incidents.description` ».

`src/cycle/index.ts` **ne lit jamais `a_expiration` pour ce régime**. Son §4 code en dur la table
`incidents` (`toutesLesColonnes.filter((c) => c.table === 'incidents')`), et `classer()` code en
dur `if (table === 'incidents') return 'incidents';`. `crise.notes` n'est donc ni signalée, ni
reconnue : elle tombe dans `if (ou === 'dans_la_filiale') return 'anomalie';`.

**La mesure** (base jetable, purge jouée par la vraie route, nom au milieu d'une phrase de
`crise.notes`) :

```
--- incidents_a_examiner : []
--- restes : [ { "table": "crise", "colonne": "notes", "dans_la_filiale": 1,
                 "lignes": 1, "classe": "anomalie" } ]
```

Or `classe: 'anomalie'` est documenté dans le produit même comme *« une colonne que la purge
**aurait dû traiter**. À corriger. »*

**Rayon.** Le rapport de purge se trompe **dans les deux sens à la fois** : il accuse d'un défaut
une décision délibérée, et il **reste muet** là où le registre promet qu'un humain sera prévenu.
C'est la classe des constats Q-201 / Q-207 — *un message qui annonce une perte qui n'a pas eu lieu
apprend à ne plus croire les rapports, y compris le jour où ils disent vrai* — doublée de la
classe Q-194 : **aucun essai ne fait passer la sortie du registre dans l'entrée de la purge** sur
ce régime-là. Le banc `test/cycle/purge.test.mjs` sème le nom dans `incidents.description`, jamais
dans `crise.notes`.

**Remède.** `classer()` et le §4 doivent **lire le registre** : les colonnes de régime `signaler`
alimentent `incidents_a_examiner` (renommé) et reçoivent une classe qui leur est propre. La liste
en dur `'incidents'` devient alors une conséquence du registre, pas une concurrente.

---

### 🟠 A-4 — Un traitement de portée Groupe est **servi, offert dans le formulaire, et refusé en 409**

**Énoncé.** La migration `027` §1 rend `traitements` mixte, et donne son motif :

> « sans elle un document de portée Groupe ne pouvait se rattacher à AUCUN traitement : la clé de
> portée du §2 exige **les deux extrémités du même côté**. »

L'exigence « les deux extrémités du même côté » est symétrique. Elle interdit donc aussi le cas
**inverse**, qui est le plus fréquent : une politique **locale** d'une filiale qui décrit un
traitement **opéré par le Groupe** — et le §1 nomme lui-même ces traitements (« l'annuaire commun,
le journal d'audit de cet outil »).

Or `GET /api/donnees` sert **tous** les traitements lisibles, Groupe compris, et
`cyber-gouvernance_V4/js/modules/documents.js:353-356` les verse **tous** dans le `<select>` sans
aucun filtre de portée :

```js
const traitements = DataStore.getTraitements();
const trtOpts = `<option value="">— Aucun —</option>` + traitements.map(t => …)
```

**La mesure** (base jetable, par la route réelle, session d'administration Groupe) :

```
--- traitements servis au navigateur : TRT-A, TRT-G, TRT-GROUPE
--- création d’un document LOCAL rattaché au traitement GROUPE : 409
    {"erreur":"contrainte_base",
     "message":"Opération refusée : l'enregistrement est encore référencé ailleurs, ou il désigne
                un élément qui n'existe pas dans votre périmètre. …"}
```

Et au niveau SQL (`C-k`) : `fk_documents_traitement_portee` → `23503`.

**Rayon.** L'utilisateur choisit, dans une liste que le produit vient de lui servir, une valeur que
le produit refuse — et le message lui dit que **l'élément n'existe pas dans son périmètre**, alors
qu'il est affiché sous ses yeux. C'est la promesse centrale du lot (« les deux registres que le
produit tenait sans se connaître sont reliés ici ») qui se referme sur le cas d'usage le plus
courant : dix-neuf filiales ne peuvent rattacher aucune de leurs procédures au traitement que le
Groupe opère pour elles.

**Remède.** Deux voies, et il faut trancher : soit le formulaire **filtre** la liste sur la portée
du document en cours et dit pourquoi ; soit la contrainte de portée est assouplie dans ce sens
(un document local peut viser un traitement Groupe, l'inverse restant interdit) — ce qui suppose
de remplacer `fk_documents_traitement_portee` par un contrôle qui n'interdit que
`document Groupe → traitement local`.

---

### 🟠 A-5 — La complétude du registre repose sur **deux listes écrites à la main**, et leur incomplétude **réussit en silence**

**Énoncé.** `f_verifier_colonnes_personnelles()` déclare deux familles de candidates, et commente :

> « ⚠️ La liste des tables de (b) est écrite à la main, et c'est le cas (a) du `CLAUDE.md` §3 :
> son incomplétude **ÉCHOUE BRUYAMMENT ici même**, puisqu'une table qui s'y ajoute fait apparaître
> ses colonnes comme non décidées. »

**L'affirmation est circulaire, et elle est fausse.** Ce qui fait rougir, c'est *l'ajout* d'une
table **à la liste**. Une table neuve **absente** de la liste, et dont les colonnes n'entrent pas
dans le motif de nom (a), ne produit **rien**.

**La mesure** (base jetable, transaction annulée) — une table dont la raison d'être est de porter
des personnes :

```sql
create table intervenants (
  id id_metier primary key, filiale_id id_metier not null references filiales(id),
  patronyme text not null, civilite text, portable text, …);
-- + RLS, force, politiques cloisonnées, traçabilité posée
select controle, objet, anomalie from f_verifier_schema();
```
```
 controle | objet | anomalie
----------+-------+----------
(0 rows)
```

Trois colonnes nominatives — `patronyme`, `civilite`, `portable` — que **rien** ne réclame.
Même résultat avec une simple colonne de saisie libre sur une table existante :
`alter table actifs add column commentaire_rh text;` → **0 anomalie**.

**Rayon.** Le registre est la pièce qu'on présente à un DPO pour répondre à *« quelles données
personnelles votre outil détient-il ? »*. Sa complétude tient à un motif d'expression régulière et
à quatre noms de tables, dont l'oubli ne se manifeste nulle part. *Atténuation* : le balayage de
vérification de la purge, lui, ouvre **toutes** les colonnes textuelles et rendrait ces
occurrences en `anomalie` — le trou n'est donc pas total, mais il est dans l'artefact même dont
c'est la fonction.

**Remède.** Le sens du balayage doit être **renversé**, comme `f_verifier_couverture_rls()` l'a été
au constat Q-5 : **toute** colonne textuelle du schéma est candidate, et le registre est la liste
des **exemptions motivées**. Le semis passerait alors de 58 à quelques centaines de lignes ; c'est
le prix d'une propriété qui tient, et les colonnes techniques se déclarent en bloc par famille.

---

### 🟠 A-6 — Le garde balaie `text` ; la purge lit `text` **et** `character varying`

**Énoncé.** Les deux moitiés du dispositif ne parlent pas du même ensemble de colonnes :

| Où | Filtre de type |
|---|---|
| `f_verifier_colonnes_personnelles()` (026 §4) | `format_type(…) = 'text'` |
| `colonnesTextuelles()` (`src/cycle/index.ts`) | `format_type(…) in ('text', 'character varying')` |
| le balayage indépendant du banc (`test/cycle/purge.test.mjs`) | `in ('text', 'character varying')` |

**La mesure** (base jetable) — une colonne `varchar` dont le nom **entre pourtant dans le motif** :

```sql
alter table actifs add column responsable_secours varchar(120);
select count(*) as anomalies_rendues from f_verifier_schema();  ->  0
```

Alors que la même colonne en `text` est réclamée aussitôt :

```sql
alter table actifs add column responsable_suppleant text;
 colonnes_personnelles | actifs.responsable_suppleant | colonne_personnelle_non_decidee
```

**Rayon.** C'est la classe du constat Q-194 : *un défaut qui vit entre deux fichiers dont aucun n'a
tort seul*. Une colonne `varchar` portant un nom de personne serait (a) jamais réclamée au
registre, (b) jamais anonymisée — puisque la purge ne traite que ce que le registre déclare —, et
(c) rendue en `anomalie` à **chaque** purge, sans que personne ne sache pourquoi.
**Latent aujourd'hui** : le schéma ne porte aucune colonne `character varying`
(mesuré : 284 `text`, 114 `id_metier`, aucune `varchar`). Il suffit d'une.

**Remède.** Un seul endroit décide de « colonne textuelle » — une fonction SQL
`f_colonnes_textuelles()` que le garde, la purge et le banc appellent tous les trois.

---

### 🟡 A-7 — `f_verifier_references_portee()` reconnaît **une** compagne, pas **la** compagne

**Énoncé.** Le garde est présenté comme un garde **de classe**, et il l'est réellement pour le cas
simple : il réclame une clé compagne passant par `portee_groupe`. Mais il ne vérifie pas que la
compagne **protège la même colonne référençante** : il lui suffit qu'une clé de la même table vers
la même cible mentionne `portee_groupe` quelque part.

**La mesure.** Témoin, d'abord — la prétention tient :

```sql
create table t_essai_a (id …, document_id id_metier not null, filiale_id id_metier,
  portee_groupe boolean generated always as (filiale_id is null) stored,
  constraint fk_a_coherence foreign key (document_id, filiale_id) references documents (id, filiale_id));
```
```
          objet           |            anomalie
--------------------------+--------------------------------
 t_essai_a.fk_a_coherence | reference_portee_sans_compagne
```

Puis la forme qu'il ne voit pas — **le même défaut**, plus une compagne sur une **autre** colonne :

```sql
create table t_essai_b (…, document_id …, autre_doc_id …, filiale_id …, portee_groupe …,
  constraint fk_b_coherence   foreign key (document_id,  filiale_id)    references documents (id, filiale_id),
  constraint fk_b_portee_autre foreign key (autre_doc_id, portee_groupe) references documents (id, portee_groupe));
```
```
 anomalies_rendues
-------------------
                 0
```

`document_id` reste sans protection de portée, et le garde se tait.

**Rayon.** Latent : aucune table du schéma ne porte aujourd'hui deux références composites vers la
même table mixte. Une table « document remplacé par document », ou « traitement dérivé d'un
traitement », suffirait — et c'est précisément la forme que le constat N-10 décrit.

**Remède.** Comparer les **colonnes** : la compagne doit partager avec la clé examinée la colonne
référençante non-`filiale_id` (`conkey` moins `filiale_id` / moins `portee_groupe`).

---

### 🟡 A-8 — La normalisation des étiquettes n'est armée **qu'à l'insertion**, et son garde consacre le trou

**Énoncé.** `f_normaliser_etiquette()` refuse un doublon à la casse près et normalise les espaces.
Son déclencheur est `before insert` **seul**. Or `document_etiquettes` reçoit
`grant select, insert, update, delete to grc_app`, porte une politique
`pol_document_etiquettes_maj`, et le garde `f_verifier_classification_documents()` §3 vérifie
explicitement `(tgtype & 4) = 4` — **INSERT** — donc mesure exactement le chemin couvert et pas
celui qui ne l'est pas.

**La mesure** (base jetable) :

```
=== Insérer la variante de casse (attendu : REFUS)
ERROR:  Ce document porte déjà l'étiquette « rgpd », à la casse près.

=== MODIFIER une étiquette vers la variante de casse
 document_id | etiquette
-------------+-----------
 DOC-E1      | RGPD
 DOC-E1      | rgpd
```

`RGPD` et `rgpd` coexistent sur la même fiche — le défaut que le commentaire de la migration
décrit mot pour mot : *« un filtre qui perd des lignes en silence est pire que pas de filtre »*.
La contrainte `ck_document_etiquettes_valeur` rattrape bien, elle, les espaces non normalisés
(`ERROR: … violates check constraint`), mais rien ne rattrape la casse.

**Rayon.** **Non atteignable par la route aujourd'hui** — mesuré : `ecrireLiaison` réécrit la
liaison en bloc (`delete` puis `insert`), et deux variantes de casse envoyées par
`PUT /api/entites/documents/DOC-A` rendent **409** avec les étiquettes antérieures intactes.
Le trou est celui de `psql`, d'une migration, et de toute route future — c'est-à-dire exactement
le motif pour lequel la migration a mis la normalisation **dans la base** :
*« une route ne voit que son chemin — il y en a toujours un de plus »*.

**Remède.** `before insert or update of etiquette`, et le garde qui mesure les deux événements.
Ou, plus simple et sans déclencheur : un index unique `on document_etiquettes (document_id,
lower(etiquette))`, qui tient la propriété par la **forme** plutôt que par une procédure.

---

### 🟡 A-9 — Le verrou d'approbation compare une **liste de colonnes écrite à la main**, et `id` n'y est pas

**Énoncé.** L'exception d'anonymisation ouverte par `026` §3 et réémise par `027` §4 bis compare
dix colonnes une à une (`statut`, `etape`, `ordre`, `objet_type`, `objet_id`, `date_decision`,
`commentaire`, `filiale_id`, `version_objet`, `empreinte_objet`). `approbations` en porte
**dix-huit**. Les huit restantes sont `id`, `acteur_id`, `acteur_libelle` (traitées à part),
`version`, `cree_le`, `cree_par`, `modifie_le`, `modifie_par`.

`cree_le`, `cree_par`, `version` et les deux `modifie_*` sont tenus par `f_maj_tracabilite()` —
**mesuré et confirmé**. `id`, lui, n'est tenu par personne.

**La mesure** (base jetable, décision `approuve`) :

```
=== M1a : changer le commentaire (attendu : REFUS)
ERROR:  Étape d'approbation déjà tranchée (approuve) : la décision est irréversible.
=== M1c : changer l'IDENTIFIANT sous couvert d'anonymisation
update approbations set id='APP-FALSIFIE', acteur_libelle = f_mention_neutre() where id='APP-A1';
      id      |  statut  |    etape    |  acteur_libelle
--------------+----------+-------------+------------------
 APP-FALSIFIE | approuve | approbation | personne retirée
=== M1d/M1e : cree_par / cree_le sous le même couvert
 APP-A1 | audit-s8a | 2026-09-11 08:56:52+00      (inchangés — la traçabilité les restaure)
```

**Rayon.** Le commentaire de la fonction promet qu'une décision « ne se modifie ni ne s'efface — y
compris en SQL, y compris pour l'administrateur ». Renommer l'identifiant d'une décision rendue
**détache silencieusement ses pièces jointes** (`trg_approbations_pieces` les relie par
`(entite_type, entite_id)`, sans clé étrangère) — c'est la classe Q-232/Q-233. Non atteignable par
la route (le registre d'entités exclut `id` des colonnes modifiables), mais la propriété écrite est
plus large que la propriété tenue. Et surtout : **toute colonne ajoutée demain à `approbations`
devient librement modifiable sous couvert d'anonymisation, sans qu'un mot le dise**.

**Remède.** Inverser : au lieu d'énumérer ce qui ne doit pas bouger, **découvrir** les colonnes
dans `pg_attribute` et exiger que `to_jsonb(new) - 'acteur_id' - 'acteur_libelle' - <traçabilité>`
soit identique à celui de `old`. Une colonne neuve est alors protégée d'office.

---

### 🟡 A-10 — Le registre n'impose **aucune cohérence de type**, et une déclaration fausse fait échouer la purge entière

**Énoncé.** `colonnes_personnelles` porte cinq contraintes `check` (nature, base légale, régime,
justification non vide, régime complet pour une donnée personnelle). Aucune ne vérifie que la
colonne déclarée **existe avec un type textuel**. Le garde vérifie l'existence (sens 2), jamais le
type. Et `colonnesPorteusesDeNom()` ne filtre pas non plus sur le type — contrairement à
`colonnesTextuelles()`, qui le fait.

**La mesure** (base jetable) :

```sql
insert into colonnes_personnelles values
  ('documents','donnees_personnelles','personnelle','essai','Contrat',1095,'anonymiser','essai');
select count(*) as anomalies from f_verifier_schema();  ->  0
```

Puis la requête que la purge construirait à partir de cette ligne :

```
ERROR:  function string_to_array(boolean, text) does not exist
```

**Rayon.** La purge est **transactionnelle** : cette erreur l'avorte entièrement — aucune
anonymisation, aucune suppression de fiche. ⚠️ **Et il se compose avec A-1** : le rôle applicatif
pouvant écrire dans le registre, une seule ligne fautive suffit à **paralyser durablement la purge
RGPD de toutes les filiales**, avec `f_verifier_schema()` au vert.

**Remède.** Une contrainte de plus au §4 du garde : toute ligne `nature='personnelle'` doit
désigner une colonne dont `format_type` est textuel, et le régime `anonymiser` l'exige.

---

## 3. Le tri

| Classe | Compte | Lesquels |
|---|---|---|
| **Bloquent le fonctionnement** | **0** | aucun constat n'empêche le produit de tourner |
| **Fuite ou perte de données entre filiales** | **0** | 109/109 au cloisonnement, et douze sondes hostiles de ma main sur les surfaces neuves |
| **Le reste — majeurs** | **6** | A-1, A-2, A-3, A-4, A-5, A-6 |
| **Le reste — mineurs** | **4** | A-7, A-8, A-9, A-10 |

**Le motif commun de cinq d'entre eux.** A-1, A-2, A-5, A-7 et A-9 sont tous la même faute, prise
sous cinq angles : **un garde-fou qui reconnaît au lieu de mesurer**, ou **une liste écrite à la
main dont l'incomplétude réussit en silence**. C'est le constat Q-281 du 7ᵉ passage, et le
`CLAUDE.md` §3 en donne le discriminant exact. Ce lot l'a cité à sept endroits dans ses
commentaires, et l'a reproduit cinq fois dans son code.

---

## 4. Les mutations jouées

**33 mutations. 23 mordent. 10 ne mordent pas.**

### Celles qui mordent (23)

| # | Mutation | Ce qui a rougi |
|---|---|---|
| 1 | changer le `commentaire` d'une décision tranchée | `GRC02` |
| 2 | changer `cree_par` sous couvert d'anonymisation | valeur restaurée par `f_maj_tracabilite()` |
| 3 | changer `cree_le` sous couvert d'anonymisation | idem |
| 4 | insérer une variante de casse d'étiquette | `23505`, message nommé |
| 5 | modifier une étiquette vers une valeur non normalisée | `ck_document_etiquettes_valeur` |
| 6 | table mixte neuve, clé composite sans compagne | `reference_portee_sans_compagne` |
| 7 | déplacer l'événement de `trg_document_etiquettes_normalise` (insert → update) | `normalisation_non_armee` |
| 8 | désarmer `trg_document_etiquettes_normalise` (`always` → `replica`) | **deux** anomalies (`armement` + `classification_documents`) |
| 9 | retirer un seul niveau de `ck_documents_confidentialite` | `niveau_de_diffusion_perdu` |
| 10 | supprimer `ck_documents_confidentialite` | `niveaux_non_bornes` |
| 11 | rendre `documents.donnees_personnelles` nullable | `classification_absente_ou_facultative` |
| 12 | retyper `donnees_personnelles` en `text` | idem |
| 13 | retirer une décision du registre (`crise.email`) | `colonne_personnelle_non_decidee` |
| 14 | ajouter une colonne `text` candidate (`actifs.responsable_suppleant`) | idem |
| 15 | déclarer au registre une colonne inexistante | `declaration_personnelle_orpheline` |
| 16 | retirer `fk_traitement_mesures_portee` | `reference_portee_sans_compagne` |
| 17 | retirer `fk_documents_traitement_portee` | idem, sur `documents` |
| 18 | déplacer l'événement de `trg_documents_pieces` (after delete → after update) | `declencheur_mauvais_evenement` (Q-281 tient) |
| 19 | déplacer l'événement de `trg_documents_publication` | **deux** anomalies |
| 20 | retirer `trg_documents_publication_insert` (le différé de Q-280) | `barriere_publication_insert_absente` |
| 21 | déplacer l'événement de `trg_pieces_version_document` (Q-282) | `relais_version_mauvais_evenement` |
| 22 | retirer `ck_pieces_jointes_integrite_datee` (Q-289) | `contrainte_integrite_absente` |
| 23 | vider `ck_documents_confidentialite` **sans** citer les quatre littéraux | 4 anomalies, une par niveau |

### Celles qui NE mordent PAS (10) — le chiffre le plus utile du rapport

| # | Mutation | Constat |
|---|---|---|
| 1 | **changer l'`id`** d'une décision d'approbation tranchée | **A-9** |
| 2 | **modifier** une étiquette vers une variante de casse | **A-8** |
| 3 | compagne de portée posée sur une **autre** colonne référençante | **A-7** |
| 4 | ajouter une colonne `text` de saisie libre hors motif de nom | **A-5** |
| 5 | ajouter une colonne **`varchar`** nommée `responsable_secours` | **A-6** |
| 6 | créer une table neuve porteuse de personnes (`intervenants`) | **A-5** |
| 7 | déclarer une colonne **booléenne** en `personnelle` / `anonymiser` | **A-10** |
| 8 | **vider** `ck_pieces_jointes_en_vigueur_integre` en gardant nom et mots | **A-2** |
| 9 | **vider** `ck_documents_confidentialite` en citant les quatre valeurs | **A-2** |
| 10 | **réécrire le registre sous `grc_app`** (`a_expiration` → `conserver`) | **A-1** |

---

## 5. Ce qui tient — chiffré, et il faut le lire

- **Cloisonnement : 109 contrôles, 109 réussis** sous `grc_app` (`db/verifier_cloisonnement.sql`),
  dont les deux neufs du lot. **Zéro fuite entre filiales**, sur douze sondes hostiles de ma main
  visant les trois surfaces neuves :
  - Toulouse ne lit **que** `Secret-TLS` + `Socle-Groupe` dans `document_etiquettes` ;
  - elle ne peut poser d'étiquette sur un document allemand (RLS `42501`), ni en se déclarant
    elle-même (`fk_document_etiquettes_coherence`, `23503`) ;
  - elle ne peut écrire sur le socle Groupe sans administration Groupe, ni le supprimer
    (0 ligne touchée, la ligne subsiste) ;
  - elle ne peut faire **changer de portée** une de ses lignes
    (`trg_document_etiquettes_portee_figee`, message nommé) ;
  - elle ne peut créer ni modifier un traitement de portée Groupe ;
  - un document local ne peut désigner le traitement d'une autre filiale.
- **`f_verifier_schema()` : 0 anomalie** sur la recette, **26 garde-fous consignés**,
  **27 migrations**, **52 tables**, **58 colonnes décidées** au registre dont **37 personnelles**.
- **Le point d'appel unique tient sa promesse** : les deux garde-fous neufs sont **découverts**
  par convention de nom et de signature, jamais ajoutés à une liste — vérifié dans le corps de
  `f_verifier_schema()` (`f_decouvrir_controles_schema()`), et une fonction non conforme est
  **refusée bruyamment** au lieu d'être jouée.
- **Le correctif Q-281 est solide.** Les trois mutations d'événement (`trg_documents_pieces`,
  `trg_documents_publication`, `trg_pieces_version_document`) et la mutation d'armement rougissent
  toutes, avec des anomalies nommées. La barrière différée de Q-280 est mesurée présente et son
  retrait rougit.
- **Le verrouillage optimiste (S4) couvre la liaison neuve** : modifier les seules étiquettes
  incrémente `_version` et un rejeu périmé rend `409 conflit_version`.
- **La normalisation des étiquettes tient sur le chemin du produit** : deux variantes de casse
  envoyées par `PUT /api/entites/documents/:id` rendent 409, les étiquettes antérieures intactes.
- **`f_verifier_colonnes_personnelles()` a une vraie valeur**, malgré A-5 : retirer une décision,
  en ajouter une orpheline, ou ajouter une colonne `text` candidate font rougir à chaque fois, et
  la migration `026` documente elle-même que ce garde a trouvé **huit colonnes** que son propre
  semis avait manquées.
- **`f_verifier_references_portee()` est un vrai garde de classe** pour le cas simple : une table
  mixte neuve sans compagne est réclamée immédiatement, et retirer l'une ou l'autre des deux clés
  de portée du lot fait rougir.
- **Banc `test/base` : 274 essais, 274 passés**, code de retour 0.
- **Le contrôle C93** (tables non cloisonnées) écrit sa liste **deux fois** et les compare en
  égalité stricte : `colonnes_personnelles` y a bien été inscrite, et toute table qui s'ajouterait
  fait rougir. *C'est le bon usage d'une liste écrite à la main*, et le lot l'a fait correctement
  là — ce qui rend A-1 et A-5 d'autant plus regrettables.

---

## 6. Recommandation

**Périmètre A : refusé.** Aucun bloquant, aucune fuite — et dix mutations sur trente-trois qui ne
mordent pas, dont **trois** visent des garde-fous que le lot a écrits *en citant nommément le
constat qu'ils reproduisent*.

Les deux qui doivent être fermés avant tout autre travail sont **A-1** (une propriété de sécurité
écrite deux fois en toutes lettres et démentie par une commande) et **A-2** (deux barrières
franchissables par qui les lit, sous un verdict vert). **A-3** et **A-4** sont ce que verra
l'utilisateur ; **A-5** et **A-6** sont ce que verra le DPO.

